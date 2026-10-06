/* 4D-planering – manuella markeringar (Victors önskemål 2026-09-29).
   Aktiviteter utan modell (t.ex. fyllning) kan illustreras med egna
   markeringar i 3D: linje, polylinje, yta, volym eller frihand. Punkterna
   klickas i modellen (viewer.onPicked); frihand ritas med Trimble Connects
   frihandsverktyg och fångas via viewer.onMarkupChanged. Markeringarna
   sparas av 4D-planering själv i projects/<id>/plan_markups.json (TC:s egna
   markeringar är tillfälliga) och ritas upp igen i aktivitetens statusfärg
   vid tidslinjens datum. Koordinater sparas i meter (modellens system), så
   de kan visas även i lägesplanen. */

const MARK_SHAPES = {
  line: { label: "Linje", icon: "╱", hint: "Klicka två punkter i modellen." },
  polyline: { label: "Polylinje", icon: "〰", hint: "Klicka punkter längs linjen och tryck Klar." },
  area: { label: "Yta", icon: "", hint: "Klicka ytans hörn och tryck Klar – ytan sluts automatiskt." },
  volume: { label: "Volym", icon: "", hint: "Klicka bottenytans hörn, ange höjden och tryck Klar." },
  freehand: { label: "Frihand", icon: "", hint: "Rita med Trimble Connects frihandsverktyg (Markering → Frihand). Du kan rita flera drag. Tryck Klar när du är färdig." },
};
let manualMarks = [];           // [{ id, itemId, shape, pts, height, lines, created_at, by }]
let manualMarksLoaded = false;
let markDraw = null;            // { item, shape, pts, lines, height }
let markShownIds = [];          // TC-markeringar som 4D-planering själv ritat (för att ta bort dem)
let markPreviewIds = [];
let markRenderSeq = 0;

function marksPath() { return `${typeof planDir === "function" ? planDir() : `projects/${encodeURIComponent(projectId)}`}/plan_markups.json`; }
async function loadManualMarks() {
  try { manualMarks = await ghReadJSON(settings.githubToken, marksPath()); }
  catch (e) { manualMarks = []; console.warn("Kunde inte läsa plan_markups.json", e); }
  manualMarksLoaded = true;
}
function marksShown() { try { return localStorage.getItem("4dplan-showmarks") !== "0"; } catch (e) { return true; } }
function setMarksShown(on) {
  try { localStorage.setItem("4dplan-showmarks", on ? "1" : "0"); } catch (e) {}
  const cb = document.getElementById("showManualMarks"); if (cb) cb.checked = on;
  renderManualMarks();
}

/* Markeringarna för en rad (en aktivitet med flera objekt räknar alla sina). */
function marksForItem(it) {
  const ids = new Set([it.id, ...(typeof siblingsOf === "function" ? siblingsOf(it).map(s => s.id) : [])]);
  return manualMarks.filter(m => ids.has(m.itemId));
}
function manualMarkTagHtml(it) {
  const n = marksForItem(it).length;
  if (!n) return "";
  return `<span class="manual-tag" data-action="marks" title="Visa i 3D${n > 1 ? ` (${n} markeringar)` : ""} – högerklicka för att ta bort">Manuell markering${n > 1 ? ` (${n})` : ""}</span>`;
}

// ---------------------------------------------------------------------
// Rita upp i 3D
// ---------------------------------------------------------------------
const toPick = p => ({ positionX: p[0] * 1000, positionY: p[1] * 1000, positionZ: (p[2] || 0) * 1000 });
function hexToRgbaObj(hex, a = 255) {
  const s = String(hex || "#888888").replace("#", "");
  return { r: parseInt(s.slice(0, 2), 16) || 0, g: parseInt(s.slice(2, 4), 16) || 0, b: parseInt(s.slice(4, 6), 16) || 0, a };
}
/* Linjesegment [[p,q], …] för en markering (meter). */
function markSegments(m) {
  const P = m.pts || [];
  const segs = [];
  const chain = (pts, closed) => { for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]); if (closed && pts.length > 2) segs.push([pts[pts.length - 1], pts[0]]); };
  if (m.shape === "line" || m.shape === "polyline") chain(P, false);
  else if (m.shape === "area") {
    chain(P, true);
    if (P.length === 4) { segs.push([P[0], P[2]], [P[1], P[3]]); } // kryss i en fyrhörning
  } else if (m.shape === "volume") {
    const h = Number(m.height) || 0;
    const top = P.map(p => [p[0], p[1], (p[2] || 0) + h]);
    chain(P, true); chain(top, true);
    P.forEach((p, i) => segs.push([p, top[i]]));
  } else if (m.shape === "freehand") (m.lines || []).forEach(l => segs.push(l));
  return segs;
}
/* Status (fas) för en markering vid tidslinjens datum, eller null om aktiviteten saknas. */
function markPhase(m) {
  let it = items.find(x => x.id === m.itemId);
  // Markering för en delaktivitet: färgen följer delaktivitetens datum.
  if (it && m.subName) {
    const all = [it, ...siblingsOf(it)].flatMap(x => activitiesByItemId.get(x.id) || []);
    const r = all.find(x => x.name === m.subName) || { start: m.subStart, end: m.subEnd };
    it = { ...it, startDate: r.start || it.startDate, endDate: r.end || it.endDate };
  }
  if (!it) return null;
  const at = (document.getElementById("timelineDate") || {}).value || new Date().toISOString().slice(0, 10);
  return computeItemPhase(it, at, settings.warningDaysBeforeEnd || 0) || "planerad";
}
function markColor(m) {
  const colors = { ...DEFAULT_STATUS_COLORS, ...(settings.statusColors || {}) };
  return colors[markPhase(m) || "planerad"] || "#888888";
}
/* Id:n för linjer vi just lagt till. Om Trimble Connect inte returnerar
   id:n letas de upp bland markeringarna i vyn (via koordinaterna). */
async function addedLineIds(lines, added) {
  let ids = (added || []).map(x => x && x.id).filter(x => x !== undefined && x !== null);
  if (ids.length >= lines.length || !API.markup.getLineMarkups) return ids;
  try {
    const all = await API.markup.getLineMarkups();
    const key = l => [l.start.positionX, l.start.positionY, l.start.positionZ, l.end.positionX, l.end.positionY, l.end.positionZ].map(v => Math.round(v)).join(",");
    const want = new Set(lines.map(key));
    ids = (all || []).filter(m => m.id !== undefined && want.has(key(m))).map(m => m.id);
  } catch (e) { /* ingen lista – då går de inte att ta bort */ }
  return ids;
}
async function clearMarkupIds(ids) {
  if (!ids.length || !API || !API.markup) return;
  try { await API.markup.removeMarkups(ids); } catch (e) { console.warn("Kunde inte ta bort markeringar", e); }
}
async function renderManualMarks() {
  if (!API || !API.markup) return;
  const seq = ++markRenderSeq;
  const old = markShownIds; markShownIds = [];
  await clearMarkupIds(old);
  if (seq !== markRenderSeq || !marksShown() || !manualMarks.length) return;
  const lines = [];
  manualMarks.forEach(m => {
    const color = hexToRgbaObj(markColor(m));
    markSegments(m).forEach(([p, q]) => lines.push({ start: toPick(p), end: toPick(q), color }));
  });
  try {
    const added = await API.markup.addLineMarkups(lines);
    const ids = await addedLineIds(lines, added);
    if (seq !== markRenderSeq) { await clearMarkupIds(ids); return; }
    markShownIds = ids;
  } catch (e) { console.warn("Kunde inte rita markeringarna i 3D", e); }
}
/* Zooma in på en aktivitets markeringar – som "zooma till objekt":
   kameran behåller sin nuvarande vinkel och flyttas bara, så att det
   ritade området hamnar mitt i bild och fyller vyn. (Att räkna ut en egen
   rotation gav konstiga vinklar.) Saknas kamerans riktning zoomas i stället
   till de modellobjekt som klickades när markeringen ritades. */
async function jumpToMarks(it) { return jumpToMarkList(marksForItem(it)); }
async function jumpToMarkList(ms) {
  const pts = ms.flatMap(m => markSegments(m).flat());
  if (!pts.length) return false;
  if (!marksShown()) setMarksShown(true);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), zs = pts.map(p => p[2] || 0);
  const c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  const radius = Math.max(4, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), Math.max(...zs) - Math.min(...zs)) / 2);
  let cam = null;
  try { cam = await API.viewer.getCamera(); } catch (e) { /* okänd kamera */ }
  const P = cam && cam.position, L = cam && cam.lookAt;
  let dir = P && L ? [L.x - P.x, L.y - P.y, L.z - P.z] : null;
  const len = dir ? Math.hypot(...dir) : 0;
  try {
    if (len > 1e-6) {
      dir = dir.map(v => v / len);
      const fov = (Number(cam.fieldOfView) || 60) * Math.PI / 180;
      const dist = Math.max(8, radius / Math.tan(fov / 2) * 1.35);
      const next = { ...cam,
        position: { x: c[0] - dir[0] * dist, y: c[1] - dir[1] * dist, z: c[2] - dir[2] * dist },
        lookAt: { x: c[0], y: c[1], z: c[2] } };
      if (cam.projectionType === "ortho") next.orthoSize = Math.max(10, radius * 2.7);
      await API.viewer.setCamera(next, { animationTime: 600 });
    } else {
      const sel = await markRefsSelector(ms);
      if (sel) await API.viewer.setCamera(sel, { animationTime: 600 });
    }
  } catch (e) { console.warn("Kunde inte flytta kameran", e); }
  flashMarks(ms);
  return true;
}
/* Modellobjekten som klickades vid ritningen, som selektor för setCamera. */
async function markRefsSelector(ms) {
  const byModel = {};
  ms.forEach(m => (m.refs || []).forEach(r => { (byModel[r.modelId] = byModel[r.modelId] || new Set()).add(String(r.objectId)); }));
  const out = [];
  for (const [modelId, ids] of Object.entries(byModel)) {
    try {
      const rids = await API.viewer.convertToObjectRuntimeIds(modelId, [...ids]);
      const ok = (rids || []).filter(x => x !== undefined && x !== null);
      if (ok.length) out.push({ modelId, objectRuntimeIds: ok });
    } catch (e) { /* modellen är inte inläst */ }
  }
  return out.length ? { modelObjectIds: out } : null;
}
/* Ritar markeringarna i klarblått en kort stund. */
async function flashMarks(ms) {
  if (!API || !API.markup) return;
  const color = { r: 11, g: 95, b: 255, a: 255 };
  const lines = ms.flatMap(m => markSegments(m).map(([p, q]) => ({ start: toPick(p), end: toPick(q), color })));
  try {
    const added = await API.markup.addLineMarkups(lines);
    const ids = await addedLineIds(lines, added);
    setTimeout(() => clearMarkupIds(ids), 2200);
  } catch (e) { /* bara visuell återkoppling */ }
}
async function deleteMarksFor(it) { return deleteMarkList(marksForItem(it), `"${it.objectName || it.activity || "aktiviteten"}"`); }
async function deleteMarkList(ms, label) {
  if (!ms.length || !confirm(`Ta bort ${ms.length === 1 ? "den manuella markeringen" : `alla ${ms.length} manuella markeringar`} för ${label}?`)) return;
  const ids = new Set(ms.map(m => m.id));
  manualMarks = manualMarks.filter(m => !ids.has(m.id));
  renderItemList(); renderManualMarks();
  await ghWriteJSON(settings.githubToken, marksPath(), arr => arr.filter(m => !ids.has(m.id)), "Ta bort manuell markering");
}

// ---------------------------------------------------------------------
// Rita nya markeringar
// ---------------------------------------------------------------------
function startMarkDraw(shape) {
  const item = pendingCoupleItem;
  if (!item) return;
  if (!API || !API.markup) { alert("Trimble Connect stöder inte markeringar i den här vyn."); return; }
  markDraw = { item, shape, pts: [], lines: [], height: 1, refs: [], sub: typeof pendingCoupleSub !== "undefined" && pendingCoupleSub ? { ...pendingCoupleSub } : null };
  renderDrawBar();
  showPreview();
}
function stopMarkDraw() {
  markDraw = null;
  const ids = markPreviewIds; markPreviewIds = [];
  clearMarkupIds(ids);
  renderDrawBar();
}
async function showPreview() {
  const ids = markPreviewIds; markPreviewIds = [];
  await clearMarkupIds(ids);
  if (!markDraw) return;
  const m = { shape: markDraw.shape === "line" ? "polyline" : markDraw.shape, pts: markDraw.pts, lines: markDraw.lines, height: markDraw.height };
  const segs = markSegments(m);
  const color = { r: 124, g: 58, b: 237, a: 255 };
  const lines = segs.map(([p, q]) => ({ start: toPick(p), end: toPick(q), color }));
  // Punkterna som små kryss så att en enda punkt också syns.
  markDraw.pts.forEach(p => { const d = 0.25; lines.push({ start: toPick([p[0] - d, p[1], p[2]]), end: toPick([p[0] + d, p[1], p[2]]), color }, { start: toPick([p[0], p[1] - d, p[2]]), end: toPick([p[0], p[1] + d, p[2]]), color }); });
  if (!lines.length) return;
  try { const added = await API.markup.addLineMarkups(lines); markPreviewIds = await addedLineIds(lines, added); }
  catch (e) { console.warn("Förhandsvisning", e); }
}
function renderDrawBar() {
  const bar = document.getElementById("markDrawBar");
  if (!bar) return;
  const inCouple = !!pendingCoupleItem;
  bar.classList.toggle("hidden", !inCouple);
  if (!inCouple) return;
  if (!markDraw) {
    bar.innerHTML = `<span class="draw-lead">Eller rita en manuell markering:</span>
      <span class="draw-shapes">${Object.entries(MARK_SHAPES).map(([k, s]) => `<button type="button" data-shape="${k}" title="${escapeHtml(s.hint)}">${s.label}</button>`).join("")}</span>`;
    bar.querySelectorAll("[data-shape]").forEach(b => { b.onclick = () => startMarkDraw(b.dataset.shape); });
    return;
  }
  const s = MARK_SHAPES[markDraw.shape];
  const n = markDraw.shape === "freehand" ? `${markDraw.lines.length ? "Ritat: " + countStrokes() + " drag" : "Inget ritat än"}` : `${markDraw.pts.length} punkt${markDraw.pts.length === 1 ? "" : "er"}`;
  const minPts = { line: 2, polyline: 2, area: 3, volume: 3 }[markDraw.shape] || 0;
  const ready = markDraw.shape === "freehand" ? markDraw.lines.length > 0 : markDraw.pts.length >= minPts;
  bar.innerHTML = `<div class="draw-active"><b>${s.label}</b> – ${escapeHtml(s.hint)} <span class="hint">(${n})</span></div>
    ${markDraw.shape === "volume" ? `<label class="draw-height">Höjd (m) <input type="text" id="markHeight" value="${markDraw.height}" inputmode="decimal" /></label>` : ""}
    <div class="couple-mode-actions">
      ${markDraw.shape !== "freehand" ? `<button type="button" id="markUndoPt" ${markDraw.pts.length ? "" : "disabled"}>↶ Ångra punkt</button>` : ""}
      <button type="button" id="markDone" class="primary" ${ready ? "" : "disabled"}>Klar – spara markering</button>
      <button type="button" id="markCancel">Avbryt ritning</button>
    </div>`;
  const h = document.getElementById("markHeight");
  if (h) h.oninput = () => { const v = Number(String(h.value).replace(",", ".")); if (Number.isFinite(v)) { markDraw.height = v; showPreview(); } };
  const u = document.getElementById("markUndoPt");
  if (u) u.onclick = () => { markDraw.pts.pop(); renderDrawBar(); showPreview(); };
  document.getElementById("markDone").onclick = saveMarkDraw;
  document.getElementById("markCancel").onclick = stopMarkDraw;
}
function countStrokes() { return markDraw.strokes || 0; }
async function saveMarkDraw() {
  const d = markDraw;
  if (!d) return;
  const rec = { id: ghNewId(), itemId: d.item.id, shape: d.shape, created_at: new Date().toISOString(), by: settings.userName || null };
  if (d.sub) Object.assign(rec, { subName: d.sub.name, subKey: d.sub.key, subStart: d.sub.start || null, subEnd: d.sub.end || null });
  if (d.shape === "freehand") rec.lines = d.lines.map(l => l.map(p => p.map(v => Math.round(v * 1000) / 1000)));
  else rec.pts = d.pts.map(p => p.map(v => Math.round(v * 1000) / 1000));
  if (d.shape === "volume") rec.height = Number(d.height) || 0;
  // Klickade modellobjekt (för zoom om kamerans riktning är okänd).
  try {
    const refs = [];
    const byModel = {};
    (d.refs || []).forEach(r => { (byModel[r.modelId] = byModel[r.modelId] || []).push(r.rid); });
    for (const [modelId, rids] of Object.entries(byModel)) {
      const ext = await API.viewer.convertToObjectIds(modelId, rids.slice(0, 20));
      (ext || []).forEach(id => { if (id) refs.push({ modelId, objectId: String(id) }); });
    }
    if (refs.length) rec.refs = refs;
  } catch (e) { /* bara en reserv för zoomen */ }
  stopMarkDraw();
  cancelCoupleMode();
  manualMarks.push(rec);
  renderItemList();
  renderManualMarks();
  try {
    await ghWriteJSON(settings.githubToken, marksPath(), arr => [...arr.filter(m => m.id !== rec.id), rec], `Manuell markering (${MARK_SHAPES[rec.shape].label}) för ${d.item.objectName || d.item.id}`);
  } catch (e) {
    alert("Kunde inte spara markeringen: " + e.message);
  }
}

/* Anropas från onWorkspaceEvent. true = händelsen är hanterad. */
function manualMarksEvent(event, data) {
  if (!markDraw) return false;
  const d = data && data.data !== undefined ? data.data : data;
  if (event === "viewer.onPicked") {
    if (markDraw.shape === "freehand") return true;
    const p = d && (d.position || d.point || d.hitPoint);
    if (!p || p.x === undefined) return true;
    markDraw.pts.push([p.x, p.y, p.z || 0]);
    if (d.modelId && d.objectRuntimeId !== undefined && !markDraw.refs.some(r => r.modelId === d.modelId && r.rid === d.objectRuntimeId)) markDraw.refs.push({ modelId: d.modelId, rid: d.objectRuntimeId });
    if (markDraw.shape === "line" && markDraw.pts.length >= 2) { markDraw.pts = markDraw.pts.slice(0, 2); saveMarkDraw(); return true; }
    renderDrawBar(); showPreview();
    return true;
  }
  if (event === "viewer.onMarkupChanged") {
    const u = d || {};
    if (markDraw.shape === "freehand" && u.action === "added" && u.markupType === "freelineMarkup" && u.markup) {
      const ls = (u.markup.lines || []).map(l => [[l.start.positionX / 1000, l.start.positionY / 1000, l.start.positionZ / 1000], [l.end.positionX / 1000, l.end.positionY / 1000, l.end.positionZ / 1000]]);
      if (ls.length) {
        markDraw.lines.push(...ls);
        markDraw.strokes = (markDraw.strokes || 0) + 1;
        if (u.markup.id !== undefined) clearMarkupIds([u.markup.id]); // ersätts av vår egen, färgade
        renderDrawBar(); showPreview();
      }
    }
    return true;
  }
  // Klick i modellen ska inte markera/koppla objekt medan man ritar.
  if (event === "viewer.onSelectionChanged" || event === "extension.onSelectionChanged") return true;
  return false;
}

// ---------------------------------------------------------------------
// Framdrift direkt i listan
// ---------------------------------------------------------------------
function progressSliderHtml(progress) {
  return `<div class="progress-edit">
      <input type="range" class="progress-slider" data-action="progress" min="0" max="100" step="5" value="${progress}" title="Dra för att ändra framdriften (${progress}%)" style="--p:${progress}%" />
      <span class="progress-save hidden"><b class="pv">${progress}%</b><button type="button" class="primary" data-action="progress-save">Spara</button><button type="button" data-action="progress-cancel" title="Ångra">✕</button></span>
    </div>`;
}
/* onSave(v): egen sparning (t.ex. delaktivitetens framdrift) i stället för aktivitetens. */
function bindProgressSlider(row, targets, current, onSave) {
  const sl = row.querySelector('[data-action="progress"]');
  if (!sl) return;
  const box = row.querySelector(".progress-save"), pv = row.querySelector(".pv");
  const upd = () => { sl.style.setProperty("--p", sl.value + "%"); pv.textContent = sl.value + "%"; box.classList.toggle("hidden", Number(sl.value) === current); };
  sl.oninput = upd;
  sl.onclick = e => e.stopPropagation();
  row.querySelector('[data-action="progress-cancel"]').onclick = e => { e.stopPropagation(); sl.value = current; upd(); };
  row.querySelector('[data-action="progress-save"]').onclick = e => {
    e.stopPropagation();
    const v = Number(sl.value);
    if (onSave) { onSave(v); return; }
    const records = targets.map(t => ({ ...t, progress: v }));
    applyOptimisticRecords(records);
    renderItemList();
    const jobId = ++saveJobCounter;
    saveJobs.set(jobId, { id: jobId, records, label: `Framdrift → ${v}% (${records.length === 1 ? (records[0].objectName || records[0].objectId) : records.length + " objekt"})`, status: "pending", error: null });
    runSaveJob(jobId);
  };
}

function bindManualMarksUi() {
  const cb = document.getElementById("showManualMarks");
  if (cb) { cb.checked = marksShown(); cb.onchange = () => setMarksShown(cb.checked); }
}
document.addEventListener("DOMContentLoaded", bindManualMarksUi);
