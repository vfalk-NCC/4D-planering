/* Lägesplan – flytta objektens markeringar (Victors önskemål 2026-10-02).
   Prickarna (en per aktivitet, eller per objekt) är låsta. Klick på en prick
   visar en liten ruta: 🔓 Lås upp → dra pricken dit du vill → 🔒 Lås.
   ↺ Återställ lägger tillbaka den på objektens eget läge och låser den.
   Lägena sparas i projektet ({ type: "objmarks" } i site_layers.json, i
   modellens koordinater) så de syns för alla och i utskrifter. Ctrl+Z ångrar. */

const OBJMARKS_ID = "objmarks";
const objMarkUnlocked = new Set(); // aktiviteter (objFamKey) som är upplåsta – bara i den här sessionen
let objMarkDrag = null;
/* Visa/dölj antalet i de samlade prickarna och fri flytt av prickar (Victor 2026-11-05: "släcka siffrorna i punkterna och justera insättningspunkten fritt"). Båda sparas i webbläsaren. */
const OBJ_COUNT_KEY = "lagesplan-objcount", OBJ_MOVEFREE_KEY = "lagesplan-objmovefree";
function objCountOn() { try { return localStorage.getItem(OBJ_COUNT_KEY) !== "0"; } catch (e) { return true; } }
function objMoveFree() { try { return localStorage.getItem(OBJ_MOVEFREE_KEY) !== "0"; } catch (e) { return true; } }   // på som standard: alla prickar kan dras direkt (Victor 2026-11-05)
const objMovedCount = () => Object.keys(objMarks()).length;
function objMarkBtnSync() { const b = $("btnObjResetMoved"); if (!b) return; const n = objMovedCount(); b.disabled = !n; b.textContent = n ? `↺ Återställ flyttade prickar (${n})` : "↺ Inga prickar är flyttade"; }

function objMarks() { const r = (typeof siteItems !== "undefined" ? siteItems : []).find(x => x.id === OBJMARKS_ID); return (r && r.pos) || {}; }
function objMarkPos(fam) { const p = objMarks()[fam]; return Array.isArray(p) && p.length === 2 ? p : null; }
function saveObjMarks(pos, label) {
  const rec = { id: OBJMARKS_ID, type: "objmarks", pos, updated_at: new Date().toISOString() };
  invalidatePositions();
  const r = saveSiteItem(rec); setTimeout(objMarkBtnSync, 0); return r;
}
const famLabel = o => { const it = o.it; return `${it.activity || it.object_name || "Objekt"}${o.members && o.members.length > 1 ? ` (${o.members.length} objekt)` : it.activity && it.object_name ? ` – ${it.object_name}` : ""}`; };

/* Lås-knapparna visas i en smal list längst ner på planen (inte vid pricken,
   där rutan täckte närliggande prickar så att nästa klick inte nådde 3D). */
function openObjMarkPop(o) {
  if (!o || !plan || !plan.calib) return;
  const pop = $("objMarkBar"), free = objMoveFree(), unlocked = free || objMarkUnlocked.has(o.fam);
  if (!pop) return;
  pop.innerHTML = `
    <span class="omb-name" title="${escHtml(famLabel(o))}">🔷 ${escHtml(famLabel(o))}</span>
    <span class="muted omb-state">${free ? (o.moved ? "Flyttad – dra den dit du vill" : "Dra pricken dit du vill") : unlocked ? "Upplåst – dra pricken" : o.moved ? "Flyttad, låst" : "Låst"}</span>
    ${free ? "" : unlocked ? `<button type="button" class="om-lock primary">🔒 Lås</button>` : `<button type="button" class="om-unlock" title="Lås upp så att pricken kan dras">🔓 Lås upp och flytta</button>`}
    ${o.moved ? `<button type="button" class="om-reset" title="Flytta tillbaka pricken till objektens eget läge">↺ Återställ</button>` : ""}
    ${objOriginMoved(o) ? `<button type="button" class="om-reset-orig" title="Flytta tillbaka objektets läge (den lilla mörka pricken) dit det låg från början">↺ Objektets läge</button>` : ""}
    <button type="button" class="om-close icon ghost" title="Stäng">✕</button>`;
  pop.classList.remove("hidden");
  const q = c => pop.querySelector(c);
  const close = () => { pop.classList.add("hidden"); pop.innerHTML = ""; };
  q(".om-close").onclick = close;
  const un = q(".om-unlock"); if (un) un.onclick = () => { objMarkUnlocked.add(o.fam); renderZones(); openObjMarkPop(o); setSaveStatus("🔓 Upplåst – dra pricken dit du vill."); };
  const lk = q(".om-lock"); if (lk) lk.onclick = () => { objMarkUnlocked.delete(o.fam); renderZones(); close(); setSaveStatus("🔒 Markeringen är låst."); };
  const ro = q(".om-reset-orig"); if (ro) ro.onclick = () => { close(); objResetOrigin(o); };
  const rs = q(".om-reset"); if (rs) rs.onclick = () => {
    const pos = { ...objMarks() }; delete pos[o.fam];
    objMarkUnlocked.delete(o.fam);
    saveObjMarks(pos); close(); setSaveStatus("↺ Markeringen är tillbaka på objektens läge och låst – Ctrl+Z ångrar.");
  };
}
/* Objektets eget läge (den lilla mörka pricken i änden på den streckade linjen när en markering är flyttad) kan dras (Victor 2026-11-05: "jag vill kunna flytta denna punkten").
   Skriver nytt x/y på objektets position (alla objekt i markeringen flyttas lika mycket) och sparar det ursprungliga läget (ox/oy) så att ↺ Objektets läge lägger tillbaka det. Ctrl+Z ångrar. */
let objOriginDrag = null;
const objMembersOf = o => (o.members && o.members.length ? o.members : [o.it]);
function objOriginMoved(o) { return objMembersOf(o).some(m => { const p = positions.find(q => q.id === m.id); return p && p.ox != null; }); }
function objOriginHit(e) {
  const pt = stagePoint(e), r = Math.max(7, (typeof objMinPx === "number" ? objMinPx : 7) * 0.9);
  for (const o of objectShapesInPdf() || []) { if (!o.moved || !o.origin) continue; const q = toPx(o.origin); if (Math.hypot(q[0] - pt[0], q[1] - pt[1]) <= r) return o; }
  return null;
}
async function objWritePositions(rows, msg) { const by = new Map(rows.map(r => [r.id, r])); return objGhWrite(token, dataPath("plan_item_positions.json"), arr => (Array.isArray(arr) ? arr : []).map(p => by.has(p.id) ? { ...p, ...by.get(p.id) } : p), msg); }
async function objMoveOrigin(o, pdf0, pdf1) {
  const m0 = pdfToModel(pdf0), m1 = pdfToModel(pdf1), dx = Math.round((m1[0] - m0[0]) * 1000) / 1000, dy = Math.round((m1[1] - m0[1]) * 1000) / 1000;
  const rows = objMembersOf(o).map(m => positions.find(q => q.id === m.id)).filter(Boolean); if (!rows.length || (!dx && !dy)) return;
  const before = rows.map(r => ({ id: r.id, x: r.x, y: r.y, ox: r.ox, oy: r.oy, manual: r.manual })), r3 = v => Math.round(v * 1000) / 1000;
  rows.forEach(r => { if (r.ox == null) { r.ox = r.x; r.oy = r.y; } r.x = r3(r.x + dx); r.y = r3(r.y + dy); r.manual = true; });
  objInvalidate(); renderZones();
  const after = rows.map(r => ({ id: r.id, x: r.x, y: r.y, ox: r.ox, oy: r.oy, manual: true }));
  objStatusUndoStack.push({ label: "flytt av objektets läge", undo: async () => { rows.forEach((r, i) => { Object.assign(r, before[i]); if (before[i].ox === undefined) { delete r.ox; delete r.oy; } if (before[i].manual === undefined) delete r.manual; }); objInvalidate(); renderZones(); await objWritePositions(before, "Lägesplan: ångra flytt av objektets läge"); } });
  try { await objWritePositions(after, `Lägesplan: flytta objektets läge (${rows.length} st)`); setSaveStatus("📍 Objektets läge flyttat – klicka på pricken och tryck ↺ Objektets läge för att lägga tillbaka det (Ctrl+Z ångrar)."); }
  catch (e) { rows.forEach((r, i) => { Object.assign(r, before[i]); if (before[i].ox === undefined) { delete r.ox; delete r.oy; } }); objStatusUndoStack.pop(); objInvalidate(); renderZones(); setSaveStatus("⚠ Kunde inte spara läget: " + e.message); }
}
async function objResetOrigin(o) {
  const rows = objMembersOf(o).map(m => positions.find(q => q.id === m.id)).filter(r => r && r.ox != null); if (!rows.length) return;
  const before = rows.map(r => ({ id: r.id, x: r.x, y: r.y, ox: r.ox, oy: r.oy }));
  rows.forEach(r => { r.x = r.ox; r.y = r.oy; delete r.ox; delete r.oy; });
  objInvalidate(); renderZones();
  const after = rows.map(r => ({ id: r.id, x: r.x, y: r.y, ox: null, oy: null }));
  objStatusUndoStack.push({ label: "återställning av objektets läge", undo: async () => { rows.forEach((r, i) => Object.assign(r, before[i])); objInvalidate(); renderZones(); await objWritePositions(before, "Lägesplan: ångra återställning"); } });
  try { await objWritePositions(after, "Lägesplan: återställ objektets läge"); setSaveStatus("↺ Objektets läge är tillbaka där det låg från början (Ctrl+Z ångrar)."); }
  catch (e) { setSaveStatus("⚠ Kunde inte spara: " + e.message); }
}
/* Mousedown på planen (från lagesplan.js): dra en upplåst prick. */
function objMarkPointerDown(e) {
  if (e.button !== 0 || !plan || !plan.calib) return false;
  const anyFree = typeof objIsFree === "function" && items.some(objIsFree);   // egna aktiviteter (okopplade) går alltid att dra
  if (!objMarkUnlocked.size && !anyFree && !objMoveFree()) return false;
  if (objMoveFree() || objMarkUnlocked.size) { const oo = objOriginHit(e); if (oo) { e.preventDefault(); objOriginDrag = { o: oo, sx: e.clientX, sy: e.clientY, moved: false, start: stagePoint(e), c0: toPx(oo.origin), pdf0: oo.origin.slice() }; return true; } }
  const o = objectsAt(toPdf(stagePoint(e))).find(x => objMoveFree() || objMarkUnlocked.has(x.fam) || (anyFree && (x.members || [x.it]).length === 1 && objIsFree(x.it)));
  if (!o) return false;
  e.preventDefault();
  objMarkDrag = { o, sx: e.clientX, sy: e.clientY, moved: false, start: stagePoint(e), c0: toPx(o.center) };
  return true;
}
window.addEventListener("mousemove", e => {
  const od = objOriginDrag;
  if (od) { if (!od.moved && Math.hypot(e.clientX - od.sx, e.clientY - od.sy) < 4) return; od.moved = true; const p = stagePoint(e); od.pdf = toPdf([od.c0[0] + p[0] - od.start[0], od.c0[1] + p[1] - od.start[1]]); od.o.origin = od.pdf; renderZonesSoon(); return; }
  const d = objMarkDrag;
  if (!d) return;
  if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
  d.moved = true;
  const p = stagePoint(e), pdf = toPdf([d.c0[0] + p[0] - d.start[0], d.c0[1] + p[1] - d.start[1]]);
  d.pos = pdfToModel(pdf);
  // Förhandsvisning: flytta pricken i cachen (sparas vid släpp).
  const sh = (objectShapesInPdf() || []).find(x => x.fam === d.o.fam);
  if (sh) { sh.center = pdf; sh.moved = true; }
  renderZonesSoon();
});
window.addEventListener("mouseup", () => {
  const od = objOriginDrag;
  if (od) { objOriginDrag = null; if (!od.moved) { openObjMarkPop(od.o); return; } objMoveOrigin(od.o, od.pdf0, od.pdf); return; }
  const d = objMarkDrag;
  if (!d) return;
  objMarkDrag = null;
  if (!d.moved) { if (!(typeof objIsFree === "function" && objIsFree(d.o.it) && !objMarkUnlocked.has(d.o.fam))) openObjMarkPop(d.o); return; }
  if (typeof objIsFree === "function" && objIsFree(d.o.it) && !objMarkUnlocked.has(d.o.fam)) { objSaveFreePos(d.o.it, d.pos); return; }
  const pos = { ...objMarks(), [d.o.fam]: [Math.round(d.pos[0] * 1000) / 1000, Math.round(d.pos[1] * 1000) / 1000] };
  saveObjMarks(pos);
  setSaveStatus(objMoveFree() ? "📍 Pricken är flyttad – klicka på den och tryck ↺ Återställ för att lägga tillbaka den (Ctrl+Z ångrar)." : "📍 Markeringen flyttad – lås den med 🔒 när du är klar (Ctrl+Z ångrar).");
});
document.addEventListener("DOMContentLoaded", () => {
  // Ångra/gör om och inläsning ändrar lägena: rita om prickarna.
  const ss = saveSiteItem;
  saveSiteItem = function (rec) { if (rec && rec.type === "objmarks") invalidatePositions(); return ss.apply(this, arguments); };
  const ls_ = loadSiteLayers;
  loadSiteLayers = async function () { const r = await ls_.apply(this, arguments); invalidatePositions(); renderZones(); objMarkBtnSync(); return r; };
  const oc = $("objCount"); if (oc) { oc.checked = objCountOn(); oc.onchange = () => { try { localStorage.setItem(OBJ_COUNT_KEY, oc.checked ? "1" : "0"); } catch (e) {} renderZones(); }; }
  const rb = $("btnObjResetMoved"); if (rb) { rb.onclick = () => { const n = objMovedCount(); if (!n || !confirm(`Flytta tillbaka alla ${n} flyttade prickar till objektens eget läge?`)) return; objMarkUnlocked.clear(); saveObjMarks({}); setSaveStatus(`↺ ${n} prickar är tillbaka på objektens läge – Ctrl+Z ångrar.`); }; setTimeout(objMarkBtnSync, 800); }
  const mf = $("objMoveFree"); if (mf) { mf.checked = objMoveFree(); mf.onchange = () => { try { localStorage.setItem(OBJ_MOVEFREE_KEY, mf.checked ? "1" : "0"); } catch (e) {} setSaveStatus(mf.checked ? "🔓 Prickarna kan dras fritt – dra en prick dit du vill." : "🔒 Prickarna är låsta (lås upp en i taget genom att klicka på den)."); }; }
  const g = $("objGroup");
  if (g) {
    g.checked = objGroupOn();
    g.onchange = () => { try { localStorage.setItem(OBJ_GROUP_KEY, g.checked ? "1" : "0"); } catch (e) {} invalidatePositions(); renderZones(); };
  }
});
