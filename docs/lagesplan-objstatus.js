/* Lägesplan – sätt status på prickarna direkt i planen (Victor 2026-10-19: "jag är dålig på att följa upp min excel-planering,
   men jag vill kunna följa upp prickarna … ändra status/färg direkt i lägesplanen").

   Högerklick på en prick -> Status: Ej påbörjad / Pågår / Klar / Pausad / Framdrift … %. Gäller objektet (eller objekten på
   samma plats), eller hela aktiviteten. Skrivs till plan_items.json (samma fält som framdriften från lagbrickan: progress, status,
   verkligt start/slut) och prickens färg följer direkt via den vanliga statusregeln. Det senaste kan ångras (↩ i menyn). */

let objStatusScopeAll = false;                 // false = bara objekten här, true = hela aktiviteten
const objStatusUndoStack = [];                 // [{ label, undo: async () => … }]

function objStatusPatch(state, pct, day) {
  const now = new Date().toISOString();
  return r => {
    const out = { ...r, updated_at: now };
    if (state === "klar") Object.assign(out, { progress: 100, status: "klar", actual_start_date: r.actual_start_date || day, actual_end_date: r.actual_end_date || day });
    else if (state === "pagaende") { const p = Math.max(1, Math.min(99, Math.round(Number(pct) || 50))); Object.assign(out, { progress: p, status: "pagaende", actual_start_date: r.actual_start_date || day, actual_end_date: null }); }
    else if (state === "pausad") Object.assign(out, { status: "pausad" });
    else if (state === "ej") Object.assign(out, { progress: 0, status: "planerad", actual_start_date: null, actual_end_date: null });
    else if (state === "pct") { const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0))); return objStatusPatch(p >= 100 ? "klar" : p > 0 ? "pagaende" : "ej", p, day)(r); }
    return out;
  };
}
const OBJ_STATE_LABEL = { klar: "Klar", pagaende: "Pågår", pausad: "Pausad", ej: "Ej påbörjad", pct: "Framdrift" };

/* Sätter status på raderna (lokalt direkt, sedan till 4D-data). Returnerar antal rader. */
async function objSetStatus(rows, state, pct) {
  if (!rows.length) return 0;
  const d = (typeof curDay === "function" ? curDay() : ($("dateInput") && $("dateInput").value) || todayIso()), today = todayIso(), day = d < today ? d : today;
  const patch = objStatusPatch(state, pct, day), ids = new Set(rows.map(r => r.id));
  const before = new Map(rows.map(r => [r.id, { ...r }]));
  rows.forEach(r => Object.assign(r, patch(r)));
  const name = (typeof famName === "function" ? famName(rows[0]) : rows[0].object_name || rows[0].activity || "objekt");
  const label = `${OBJ_STATE_LABEL[state]}${state === "pct" ? ` ${pct} %` : ""} – ${rows.length > 1 ? `${rows.length} objekt` : name}`;
  objStatusUndoStack.push({ label, undo: async () => {
    rows.forEach(r => Object.assign(r, before.get(r.id)));
    if (typeof renderZones === "function") renderZones();
    await ghWriteJSON(token, dataPath("plan_items.json"), arr => (Array.isArray(arr) ? arr : []).map(r => before.has(r.id) ? { ...before.get(r.id) } : r), `Lägesplan: ångra ${label}`);
  } });
  if (typeof renderZones === "function") renderZones();
  setSaveStatus(`Sparar: ${label} …`);
  try {
    await ghWriteJSON(token, dataPath("plan_items.json"), arr => (Array.isArray(arr) ? arr : []).map(r => ids.has(r.id) ? patch(r) : r), `Lägesplan: ${label}`);
    setSaveStatus(`✓ ${label}. Uppdatera (↻) i 4D-planering för att se det där.`);
  } catch (e) {
    rows.forEach(r => Object.assign(r, before.get(r.id))); objStatusUndoStack.pop();
    if (typeof renderZones === "function") renderZones();
    setSaveStatus("⚠ Kunde inte spara statusen: " + e.message);
    return 0;
  }
  return rows.length;
}
async function objStatusUndo() {
  const u = objStatusUndoStack.pop(); if (!u) return;
  try { await u.undo(); setSaveStatus(`↩ Ångrade: ${u.label}`); }
  catch (e) { setSaveStatus("⚠ Kunde inte ångra: " + e.message); }
}

/* Menyraderna (läggs överst i högerklicksmenyn på en prick). */
function objStatusMenuHtml(its, o = {}) {
  const fams = new Set(its.map(objFamKey)), famN = items.filter(x => fams.has(objFamKey(x))).length, many = !o.box && famN > its.length;
  const ph = typeof computeItemPhase === "function" ? computeItemPhase(its[0], $("dateInput").value || todayIso(), Number.isFinite(settings.warningDaysBeforeEnd) ? settings.warningDaysBeforeEnd : 7) : null;
  const dot = c => `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:6px;"></i>`;
  const col = k => dot(phaseColor(k));
  return `<div class="om-st"><div class="om-st-h">${o.box ? `${its.length} objekt i rutan – sätt status på alla` : `Status${ph ? ` nu: ${escHtml((PHASE_LABELS || {})[ph] || ph)}` : ""} · ${Math.round(Number(its[0].progress) || 0)} %`}</div>
    <div class="om-st-b"><button type="button" data-ost="ej">${col("planerad")}Ej påbörjad</button><button type="button" data-ost="pagaende">${col("pagaende")}Pågår</button><button type="button" data-ost="klar">${col("klar")}Klar</button><button type="button" data-ost="pausad">${col("pausad")}Pausad</button><button type="button" data-ost="pct">% …</button></div>
    ${many ? `<label class="om-st-s"><input type="checkbox" data-ost-all${objStatusScopeAll ? " checked" : ""}> Hela aktiviteten (${famN} objekt), inte bara ${its.length > 1 ? "de " + its.length + " här" : "det här"}</label>` : ""}
    ${objStatusUndoStack.length ? `<button type="button" data-ost="undo" class="om-st-u">↩ Ångra: ${escHtml(objStatusUndoStack[objStatusUndoStack.length - 1].label)}</button>` : ""}</div>`;
}
function objStatusBind(m, its, o = {}) {
  const close = () => m.classList.add("hidden");
  const all = m.querySelector("[data-ost-all]"); if (all) all.onchange = () => { objStatusScopeAll = all.checked; };
  m.querySelectorAll("[data-ost]").forEach(b => { b.onclick = async () => {
    const k = b.dataset.ost; close();
    if (k === "undo") return objStatusUndo();
    const fams = new Set(its.map(objFamKey)), rows = !o.box && objStatusScopeAll ? items.filter(x => fams.has(objFamKey(x))) : its;
    let pct = null;
    if (k === "pct" || k === "pagaende") {
      const a = await uiPrompt(k === "pct" ? "Framdrift i procent (0–100):" : "Hur många procent är klart? (1–99)", String(Math.round(Number(its[0].progress) || (k === "pagaende" ? 50 : 0))));
      if (a === null || a === undefined || String(a).trim() === "") return;
      pct = Number(String(a).replace(",", ".").replace("%", ""));
      if (!isFinite(pct)) { setSaveStatus("Ogiltig procentsats."); return; }
    }
    await objSetStatus(rows, k === "pagaende" && pct === null ? "pagaende" : k, pct);
  }; });
}

/* ---------- Dra en ruta och sätt status på alla prickar i den ---------- */
let objTool = null;                           // null | "status" | "add"
function objToolSet(t) {
  objTool = objTool === t ? null : t;
  const vp = $("viewport"); if (vp) vp.classList.toggle("obj-tool", !!objTool);
  [["status", "btnObjStatusBox"], ["add", "btnObjAddDot"]].forEach(([k, id]) => { const b = $(id); if (b) b.classList.toggle("on", objTool === k); });
  setSaveStatus(objTool === "status" ? "Dra en ruta över prickarna och välj status. Esc avslutar." : objTool === "add" ? "Klicka där den nya pricken ska ligga. Esc avslutar." : "");
}
function objStatusBox(a, b, e) {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  if (x1 - x0 < 4 || y1 - y0 < 4) { renderZones(); return; }
  const its = (objectShapesInPdf() || []).filter(o => { const [x, y] = toPx(o.center); return x >= x0 && x <= x1 && y >= y0 && y <= y1; }).flatMap(o => o.members || [o.it]);
  const seen = new Set(), rows = its.filter(r => !seen.has(r.id) && seen.add(r.id));
  renderZones();
  if (!rows.length) { setSaveStatus("Inga prickar i rutan."); return; }
  let m = $("labelMenu");
  if (!m) { openLabelMenu({ ids: [], text: "", act: "", box: {} }, e); m = $("labelMenu"); }
  m.innerHTML = objStatusMenuHtml(rows, { box: true });
  m.style.left = Math.min(e.clientX, window.innerWidth - 320) + "px"; m.style.top = Math.min(e.clientY, window.innerHeight - 240) + "px";
  m.classList.remove("hidden");
  objStatusBind(m, rows, { box: true });
}

/* ---------- Lägg till en ny prick ---------- */
async function objAddDot(pdfPt) {
  if (!plan || !plan.calib) return;
  const name = ((await uiPrompt("Namn på den nya pricken (t.ex. F18):")) || "").trim();
  if (!name) return;
  const [mx, my] = pdfToModel(pdfPt), pos = positionsInPdf();
  // Mall: närmaste prick på planen – aktivitet, område, entreprenör och datum kopieras.
  let tpl = null, best = Infinity;
  if (pos) items.forEach(it => { const p = pos.get(it.id); if (!p) return; const d = Math.hypot(p[0] - pdfPt[0], p[1] - pdfPt[1]); if (d < best) { best = d; tpl = it; } });
  const today = todayIso();
  let base;
  if (tpl) base = ["activity", "area", "contractor", "start_date", "end_date", "group_id", "building", "level", "zone"].reduce((o, k) => { if (tpl[k] !== undefined && tpl[k] !== null && tpl[k] !== "") o[k] = tpl[k]; return o; }, {});
  else {
    const act = ((await uiPrompt("Det finns inga prickar att kopiera från. Aktivitet för pricken:")) || "").trim(); if (!act) return;
    base = { activity: act, start_date: today, end_date: addDaysIso ? addDaysIso(today, 7) : today };
  }
  const row = { ...base, id: ghNewId(), object_name: name, progress: 0, status: "planerad", origin: "manuell", updated_at: new Date().toISOString() };
  const tp = tpl ? positions.find(p => p.id === tpl.id) : null, zg = Number(plan.calib.model[0][2]) || 0;
  const pr = { id: row.id, x: Math.round(mx * 1000) / 1000, y: Math.round(my * 1000) / 1000, z0: tp ? tp.z0 : zg, z1: tp ? tp.z1 : zg };
  items.push(row); positions.push(pr); if (typeof invalidatePositions === "function") invalidatePositions(); renderZones();
  const undo = async () => {
    const i = items.indexOf(row); if (i >= 0) items.splice(i, 1); const j = positions.indexOf(pr); if (j >= 0) positions.splice(j, 1);
    if (typeof invalidatePositions === "function") invalidatePositions(); renderZones();
    await ghWriteJSON(token, dataPath("plan_items.json"), arr => (Array.isArray(arr) ? arr : []).filter(r => r.id !== row.id), `Lägesplan: ångra ny prick ${name}`);
    await ghWriteJSON(token, dataPath("plan_item_positions.json"), arr => (Array.isArray(arr) ? arr : []).filter(r => r.id !== row.id), `Lägesplan: ångra ny prick ${name}`);
  };
  objStatusUndoStack.push({ label: `ny prick ${name}`, undo });
  setSaveStatus(`Sparar ny prick ${name} …`);
  try {
    await ghWriteJSON(token, dataPath("plan_items.json"), arr => [...(Array.isArray(arr) ? arr : []).filter(r => r.id !== row.id), row], `Lägesplan: ny prick ${name}`);
    await ghWriteJSON(token, dataPath("plan_item_positions.json"), arr => [...(Array.isArray(arr) ? arr : []).filter(r => r.id !== row.id), pr], `Lägesplan: position ny prick ${name}`);
    setSaveStatus(`✓ Ny prick ${name}${tpl ? ` (som ${objLabelText(tpl) || tpl.activity})` : ""} sparad. Uppdatera (↻) i 4D-planering för att se den där.`);
  } catch (e) {
    objStatusUndoStack.pop(); const i = items.indexOf(row); if (i >= 0) items.splice(i, 1); const j = positions.indexOf(pr); if (j >= 0) positions.splice(j, 1);
    if (typeof invalidatePositions === "function") invalidatePositions(); renderZones();
    setSaveStatus("⚠ Kunde inte spara den nya pricken: " + e.message);
  }
}
function objToolBind() {
  const sb = $("btnObjStatusBox"), ab = $("btnObjAddDot"); if (!sb || !ab) return;
  sb.onclick = () => objToolSet("status"); ab.onclick = () => objToolSet("add");
  window.addEventListener("keydown", e => { if (e.key === "Escape" && objTool) objToolSet(objTool); });
}
objToolBind();
