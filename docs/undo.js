/* 4D-planering – ångra/gör om (Victors önskemål 2026-09-30).
   Allt som ändrar planeringen i appen (formuläret, statusmenyn, framdrift,
   Redigera markerade, Byt namn, koppla objekt, ta bort objekt, radera)
   fångas som ett steg: hur de berörda posterna, delaktiviteterna och de
   manuella markeringarna såg ut FÖRE ändringen. Ångra skriver tillbaka just
   de posterna (andra ändringar i projektet rörs inte) och lägger samtidigt
   ett "gör om"-steg. Ctrl+Z / Ctrl+Y (Ctrl+Shift+Z), ↶ ↷ i huvudet.
   Kommentarer på en raderad aktivitet kommer inte tillbaka – de finns i
   säkerhetskopian som tas före radering. */

const undoStack = [], redoStack = [];
const UNDO_MAX = 50;
let undoGroup = null;      // pågående steg (flera sparningar i samma handling slås ihop)
let undoSuspended = 0;     // >0 medan ett ångra/gör om skrivs (fångas inte)

const cloneItem = it => it ? JSON.parse(JSON.stringify({ ...it, _pending: undefined, _saveError: undefined })) : null;
const cloneActs = rows => JSON.parse(JSON.stringify(rows || []));

function undoOpen(label) {
  if (undoSuspended) return null;
  if (!undoGroup) {
    undoGroup = { label: label || "", items: new Map(), acts: new Map(), marks: null, markIds: new Set(), knownIds: new Set(items.map(i => i.id)), pending: 0 };
  } else if (label && !undoGroup.label) undoGroup.label = label;
  scheduleUndoClose(undoGroup);
  return undoGroup;
}
function scheduleUndoClose(g) {
  clearTimeout(g.timer);
  // Stängs först när inga sparningar i steget pågår längre.
  g.timer = setTimeout(() => { if (undoGroup === g && !g.pending) undoClose(); }, 1200);
}
function undoCaptureItem(id) {
  const g = undoOpen();
  if (!g || g.items.has(id)) return;
  g.items.set(id, cloneItem(items.find(x => x.id === id)));
}
function undoCaptureActs(id) {
  const g = undoOpen();
  if (!g || g.acts.has(id)) return;
  g.acts.set(id, cloneActs(activitiesByItemId.get(id)));
}
function undoCaptureMarks(ids) {
  const g = undoOpen();
  if (!g || typeof manualMarks === "undefined") return;
  if (!g.marks) g.marks = [];
  ids.forEach(id => {
    if (g.markIds.has(id)) return;
    g.markIds.add(id);
    manualMarks.filter(m => m.itemId === id).forEach(m => g.marks.push(JSON.parse(JSON.stringify(m))));
  });
}
function undoCaptureFamily(item) {
  if (!item) return;
  [item, ...siblingsOf(item)].forEach(m => { undoCaptureItem(m.id); undoCaptureActs(m.id); });
  undoCaptureMarks([item, ...siblingsOf(item)].map(m => m.id));
}
function undoClose() {
  const g = undoGroup;
  undoGroup = null;
  if (!g) return;
  // Nya poster som skapades i steget (fanns inte när steget började).
  items.forEach(it => { if (!g.knownIds.has(it.id) && !g.items.has(it.id)) { g.items.set(it.id, null); if (!g.acts.has(it.id)) g.acts.set(it.id, []); } });
  // Bara det som faktiskt ändrades.
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  [...g.items].forEach(([id, before]) => { const now = cloneItem(items.find(x => x.id === id)); if (same(stripVolatile(before), stripVolatile(now))) g.items.delete(id); });
  [...g.acts].forEach(([id, before]) => { if (same(before, cloneActs(activitiesByItemId.get(id)))) g.acts.delete(id); });
  if (!g.items.size && !g.acts.size && !(g.marks && g.marks.length)) return;
  if (!g.label) g.label = g.items.size === 1 ? "Ändring" : `Ändring (${g.items.size} poster)`;
  undoStack.push(g);
  if (undoStack.length > UNDO_MAX) undoStack.shift();
  redoStack.length = 0;
  renderUndoButtons();
  showUndoToast(`Sparat: ${g.label}`, true);
}
const stripVolatile = it => it ? { ...it, updatedAt: undefined, _notInModel: undefined, _pending: undefined, _saveError: undefined } : null;

/* ---------- ångra / gör om ---------- */
async function applyUndoEntry(entry, fromStack, toStack, verb) {
  if (!isBackendConfigured()) { alert("Ingen databas ansluten."); return; }
  if (undoGroup) undoClose();
  // Motsatt steg: hur det ser ut nu, för samma poster.
  const ids = new Set([...entry.items.keys(), ...entry.acts.keys()]);
  const markItemIds = new Set(entry.markIds || []);
  const inverse = { label: entry.label, items: new Map(), acts: new Map(), marks: [], markIds: new Set(markItemIds) };
  ids.forEach(id => {
    if (entry.items.has(id)) inverse.items.set(id, cloneItem(items.find(x => x.id === id)));
    if (entry.acts.has(id)) inverse.acts.set(id, cloneActs(activitiesByItemId.get(id)));
  });
  if (typeof manualMarks !== "undefined") manualMarks.filter(m => markItemIds.has(m.itemId)).forEach(m => inverse.marks.push(JSON.parse(JSON.stringify(m))));

  undoSuspended++;
  try {
    // Poster
    const restore = new Map(), remove = new Set();
    entry.items.forEach((before, id) => { if (before) restore.set(id, before); else remove.add(id); });
    if (restore.size || remove.size) {
      await ghWriteJSON(settings.githubToken, itemsPath(), arr => {
        const have = new Set(arr.map(r => r.id));
        const next = arr.filter(r => !remove.has(r.id)).map(r => restore.has(r.id) ? toRow(restore.get(r.id)) : r);
        restore.forEach((it, id) => { if (!have.has(id)) next.push(toRow(it)); });
        return next;
      }, `${verb}: ${entry.label}`);
      items = items.filter(x => !remove.has(x.id));
      restore.forEach((it, id) => {
        const fresh = fromRow(toRow(it));
        const i = items.findIndex(x => x.id === id);
        if (i >= 0) items[i] = fresh; else items.push(fresh);
      });
      itemsTotalCount = items.length;
    }
    // Delaktiviteter
    const batches = [...entry.acts].map(([id, rows]) => ({ planItemId: id, rows: cloneActs(rows) }));
    remove.forEach(id => { if (!entry.acts.has(id)) batches.push({ planItemId: id, rows: [] }); });
    if (batches.length) {
      await saveActivitiesForItemsBulk(batches, `${verb}: ${entry.label}`);
      batches.forEach(b => activitiesByItemId.set(b.planItemId, cloneActs(b.rows)));
    }
    // Manuella markeringar
    if (markItemIds.size && typeof manualMarks !== "undefined") {
      const keep = m => !markItemIds.has(m.itemId) && !entry.marks.some(x => x.id === m.id);
      manualMarks = manualMarks.filter(keep).concat(entry.marks);
      await ghWriteJSON(settings.githubToken, marksPath(), arr => arr.filter(keep).concat(entry.marks), `${verb}: markeringar`);
      if (typeof renderManualMarks === "function") renderManualMarks();
    }
  } catch (e) {
    alert(`Kunde inte ${verb.toLowerCase()}: ${e.message}`);
    undoSuspended--;
    return;
  }
  undoSuspended--;
  fromStack.pop();
  toStack.push(inverse);
  buildFilterOptions();
  renderItemList();
  initTimelineRange();
  if (typeof applyTimelineColors === "function") applyTimelineColors();
  renderUndoButtons();
  showUndoToast(`${verb}: ${entry.label}`, false);
}
function undoLast() { const e = undoStack[undoStack.length - 1]; if (e) applyUndoEntry(e, undoStack, redoStack, "Ångrat"); }
function redoLast() { const e = redoStack[redoStack.length - 1]; if (e) applyUndoEntry(e, redoStack, undoStack, "Gjort om"); }

/* ---------- knappar och meddelande ---------- */
function renderUndoButtons() {
  const u = document.getElementById("btnUndo"), r = document.getElementById("btnRedo");
  if (u) { u.disabled = !undoStack.length; u.title = undoStack.length ? `Ångra: ${undoStack[undoStack.length - 1].label} (Ctrl+Z)` : "Inget att ångra"; }
  if (r) { r.disabled = !redoStack.length; r.title = redoStack.length ? `Gör om: ${redoStack[redoStack.length - 1].label} (Ctrl+Y)` : "Inget att göra om"; }
}
let undoToastTimer = null;
function showUndoToast(text, withUndo) {
  let el = document.getElementById("undoToast");
  if (!el) return;
  el.innerHTML = `<span>${escapeHtml(text)}</span>${withUndo ? '<button type="button" id="btnToastUndo">↶ Ångra</button>' : ""}<button type="button" class="toast-x" title="Stäng">✕</button>`;
  el.classList.remove("hidden");
  const b = document.getElementById("btnToastUndo");
  if (b) b.onclick = () => { el.classList.add("hidden"); undoLast(); };
  el.querySelector(".toast-x").onclick = () => el.classList.add("hidden");
  clearTimeout(undoToastTimer);
  undoToastTimer = setTimeout(() => el.classList.add("hidden"), 6000);
}

/* ---------- krokar i appens sparfunktioner ---------- */
(function hookUndo() {
  const wrap = (name, before) => {
    const orig = window[name];
    if (typeof orig !== "function") return;
    window[name] = function () {
      let g = null;
      if (!undoSuspended) { try { before.apply(this, arguments); g = undoGroup; } catch (e) { console.warn("ångra:", e); } }
      const res = orig.apply(this, arguments);
      if (g && res && typeof res.then === "function") {
        g.pending++;
        const done = () => { g.pending--; scheduleUndoClose(g); };
        res.then(done, done);
      }
      return res;
    };
  };
  // Optimistiska sparningar (formulär, status, framdrift, Redigera markerade, Byt namn, beroenden).
  wrap("applyOptimisticRecords", records => {
    spreadActivityWideFields(records);
    undoOpen();
    records.forEach(r => { undoCaptureItem(r.id); undoCaptureActs(r.id); });
  });
  wrap("saveActivitiesForItemsBulk", batches => { (batches || []).forEach(b => undoCaptureActs(b.planItemId)); });
  wrap("deleteItems", list => {
    undoOpen(list.length === 1 ? `Radera ${list[0].objectName || "post"}` : `Radera ${list.length} poster`);
    list.forEach(m => { undoCaptureItem(m.id); undoCaptureActs(m.id); });
    undoCaptureMarks(list.map(m => m.id));
  });
  wrap("coupleItemToModelObjects", (item, objs) => { undoOpen(`Koppla ${objs.length} objekt till ${item.objectName || "aktiviteten"}`); undoCaptureFamily(item); });
  wrap("coupleObjectsToSub", (item, sub, objs) => { undoOpen(`Koppla ${objs.length} objekt till ${sub.name}`); undoCaptureFamily(item); });
  wrap("removeObjectsFromActivity", (anchor, list) => { undoOpen(`Ta bort ${list.length} objekt ur ${anchor.objectName || "aktiviteten"}`); undoCaptureFamily(anchor); });
  wrap("deleteActivityConfirmed", anchor => { undoOpen(`Radera ${anchor.objectName || "aktiviteten"}`); undoCaptureFamily(anchor); });
  // Etiketten från sparjobbet ("Status → Klar (Grundsula)" osv.).
  const origSet = saveJobs.set.bind(saveJobs);
  saveJobs.set = (id, job) => { if (undoGroup && !undoGroup.label && job && job.label) undoGroup.label = job.label; return origSet(id, job); };
})();

function bindUndo() {
  const u = document.getElementById("btnUndo"), r = document.getElementById("btnRedo");
  if (u) u.onclick = undoLast;
  if (r) r.onclick = redoLast;
  document.addEventListener("keydown", e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) && !(t.tagName === "INPUT" && /^(checkbox|range|button)$/.test(t.type)))) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) { e.preventDefault(); undoLast(); }
    else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redoLast(); }
  });
  renderUndoButtons();
}
document.addEventListener("DOMContentLoaded", bindUndo);
