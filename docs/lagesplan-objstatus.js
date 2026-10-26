/* Lägesplan – sätt status på prickarna direkt i planen (Victor 2026-10-19: "jag är dålig på att följa upp min excel-planering,
   men jag vill kunna följa upp prickarna … ändra status/färg direkt i lägesplanen").

   Högerklick på en prick -> Status: Ej påbörjad / Pågår / Klar / Pausad / Framdrift … %. Gäller objektet (eller objekten på
   samma plats), eller hela aktiviteten. Skrivs till plan_items.json (samma fält som framdriften från lagbrickan: progress, status,
   verkligt start/slut) och prickens färg följer direkt via den vanliga statusregeln. Det senaste kan ångras (↩ i menyn). */

/* Nya/borttagna prickar: både listan över synliga rader och positionerna måste byggas om. */
function objInvalidate() { if (typeof invalidateVisible === "function") invalidateVisible(); else if (typeof invalidatePositions === "function") invalidatePositions(); }
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
async function objSetStatus(rows, state, pct, file) {   // file: annan plan_items.json (Excel-planeringen i PP-lägesplanen)
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
    await ghWriteJSON(token, file || dataPath("plan_items.json"), arr => (Array.isArray(arr) ? arr : []).map(r => before.has(r.id) ? { ...before.get(r.id) } : r), `Lägesplan: ångra ${label}`); objNotifyPlan(file);
  } });
  if (typeof renderZones === "function") renderZones();
  setSaveStatus(`Sparar: ${label} …`);
  try {
    await ghWriteJSON(token, file || dataPath("plan_items.json"), arr => (Array.isArray(arr) ? arr : []).map(r => ids.has(r.id) ? patch(r) : r), `Lägesplan: ${label}`);
    setSaveStatus(`✓ ${label}. Gantten i 4D-planering läser om.`); objNotifyPlan(file);
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

/* Säger till 4D-planeringen (Gantten) att läsa om tidplanen direkt, så att status, framdrift och namn syns där utan att man uppdaterar för hand. */
let objNotifyT = 0;
function objNotifyPlan(file) {
  clearTimeout(objNotifyT);
  objNotifyT = setTimeout(() => { if (typeof askOpener !== "function" || !(window.opener && !window.opener.closed)) return; const src = file && /\/pp\//.test(file) ? "pp" : file ? "excel" : (typeof planSource !== "undefined" ? planSource : "excel"); askOpener("planChanged", { source: src }, 20000).catch(() => {}); }, 600);
}

/* Visuellt namn (bara här): sparas i planen (plan.dotNames), rör ingen tidplan eller Gantt. */
function objSetVisualName(rows, name) {
  if (!plan) return; plan.dotNames = { ...(plan.dotNames || {}) };
  rows.forEach(r => { if (name) plan.dotNames[r.id] = name; else delete plan.dotNames[r.id]; });
  if (!Object.keys(plan.dotNames).length) delete plan.dotNames;
  if (typeof renderZones === "function") renderZones(); if (typeof schedulePlanSave === "function") schedulePlanSave();
  setSaveStatus(name ? `Visuellt namn "${name}" satt – bara i lägesplanen, tidplanen är orörd.` : "Det visuella namnet är borttaget.");
}

/* Byter namn (aktivitet eller prickens namn) på raderna – direkt i planen och sparat i 4D-data; kan ångras. */
async function objRename(rows, field, value, file) {
  if (!rows.length) return 0; const ids = new Set(rows.map(r => r.id)), before = new Map(rows.map(r => [r.id, { ...r }])), now = new Date().toISOString();
  rows.forEach(r => { r[field] = value; r.updated_at = now; });
  const label = `${field === "activity" ? "Aktivitet" : "Prick"} → ${value}${rows.length > 1 ? ` (${rows.length} objekt)` : ""}`;
  objStatusUndoStack.push({ label, undo: async () => { rows.forEach(r => Object.assign(r, before.get(r.id))); if (typeof renderZones === "function") renderZones(); await ghWriteJSON(token, file || dataPath("plan_items.json"), arr => (Array.isArray(arr) ? arr : []).map(r => before.has(r.id) ? { ...before.get(r.id) } : r), `Lägesplan: ångra ${label}`); objNotifyPlan(file); } });
  if (typeof renderZones === "function") renderZones(); if (typeof renderLayerPanel === "function") renderLayerPanel();
  setSaveStatus(`Sparar: ${label} …`);
  try { await ghWriteJSON(token, file || dataPath("plan_items.json"), arr => (Array.isArray(arr) ? arr : []).map(r => ids.has(r.id) ? { ...r, [field]: value, updated_at: now } : r), `Lägesplan: ${label}`); setSaveStatus(`✓ ${label}. Gantten i 4D-planering läser om.`); objNotifyPlan(file); }
  catch (e) { rows.forEach(r => Object.assign(r, before.get(r.id))); objStatusUndoStack.pop(); if (typeof renderZones === "function") renderZones(); setSaveStatus("⚠ Kunde inte byta namn: " + e.message); return 0; }
  return rows.length;
}

/* Egen färg på pricken (Victor 2026-10-26: "byta färg manuellt på punkterna"): sparas i planen per post (plan.dotColors) och går före statusfärgen. */
const OBJ_DOT_PRESETS = ["#ef4444", "#f59e0b", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7", "#111827"];
function objDotColor(o) {
  const dc = plan && plan.dotColors; if (!dc || !o) return null;
  const list = o.members && o.members.length ? o.members : [o.it]; const c = list.map(m => dc[m.id] || null);
  return c.length && c.every(x => x && x === c[0]) ? c[0] : null;
}
function objSetDotColor(rows, hex) {
  if (!plan) return; plan.dotColors = { ...(plan.dotColors || {}) };
  rows.forEach(r => { if (hex) plan.dotColors[r.id] = hex; else delete plan.dotColors[r.id]; });
  if (!Object.keys(plan.dotColors).length) delete plan.dotColors;
  if (typeof renderZones === "function") renderZones();
  if (typeof schedulePlanSave === "function") schedulePlanSave();
  setSaveStatus(hex ? `Egen färg satt på ${rows.length} ${rows.length === 1 ? "prick" : "prickar"}.` : `Statusfärgen används igen på ${rows.length} ${rows.length === 1 ? "prick" : "prickar"}.`);
}

/* Menyraderna (läggs överst i högerklicksmenyn på en prick). */
function objStatusMenuHtml(its, o = {}) {
  const fk = o.famKey || objFamKey, pool = o.pool || items, fams = new Set(its.map(fk)), famN = pool.filter(x => fams.has(fk(x))).length, many = !o.box && famN > its.length;
  const ph = typeof computeItemPhase === "function" ? computeItemPhase(its[0], $("dateInput").value || todayIso(), Number.isFinite(settings.warningDaysBeforeEnd) ? settings.warningDaysBeforeEnd : 7) : null;
  const dot = c => `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:6px;"></i>`;
  const col = k => dot(phaseColor(k));
  return `<div class="om-st"><div class="om-st-h">${o.box ? `${its.length} objekt i rutan – sätt status på alla` : `Status${ph ? ` nu: ${escHtml((PHASE_LABELS || {})[ph] || ph)}` : ""} · ${Math.round(Number(its[0].progress) || 0)} %`}</div>
    <div class="om-st-b"><button type="button" data-ost="ej">${col("planerad")}Ej påbörjad</button><button type="button" data-ost="pagaende">${col("pagaende")}Pågår</button><button type="button" data-ost="klar">${col("klar")}Klar</button><button type="button" data-ost="pausad">${col("pausad")}Pausad</button><button type="button" data-ost="pct">% …</button></div>
    <div class="om-st-p"><span>Framdrift</span><input type="range" min="0" max="100" step="5" data-ost-sl value="${Math.round(Number(its[0].progress) || 0)}" /><b data-ost-v>${Math.round(Number(its[0].progress) || 0)} %</b></div>
    <div class="om-st-c"><span>Färg</span>${OBJ_DOT_PRESETS.map(c => `<button type="button" class="om-sw" data-ost-col="${c}" style="background:${c}" title="Sätt egen färg"></button>`).join("")}<input type="color" data-ost-colpick value="${(plan && plan.dotColors && plan.dotColors[its[0].id]) || "#3b82f6"}" title="Egen färg" /><button type="button" class="om-sw-auto" data-ost-col="" title="Använd statusfärgen igen">Auto</button></div>
    ${o.box ? "" : `<div class="om-st-n"><button type="button" data-ost-rn="act" title="Byt namn på hela aktiviteten – alla objekt i den följer med">✎ Byt namn på aktiviteten</button><button type="button" data-ost-rn="obj" title="Byt namn på bara den här pricken">✎ Byt namn på pricken</button><button type="button" data-ost-rn="vis" title="Ett namn som bara syns i lägesplanen – rör ingen tidplan eller Gantt">👁 Visuellt namn (bara här)</button></div>`}
    ${o.box ? "" : `<div class="om-st-k"><div class="om-st-kl" data-ost-kl><i>Kommentarer läses…</i></div><div class="om-st-kw"><input type="text" data-ost-ki placeholder="Skriv en kommentar på ${escHtml(its[0].object_name || its[0].activity || "objektet")}…" maxlength="500" /><button type="button" data-ost-kb>Lägg till</button></div></div>`}
    ${many ? `<label class="om-st-s"><input type="checkbox" data-ost-all${objStatusScopeAll ? " checked" : ""}> Hela aktiviteten (${famN} objekt), inte bara ${its.length > 1 ? "de " + its.length + " här" : "det här"}</label>` : ""}
    ${objStatusUndoStack.length ? `<button type="button" data-ost="undo" class="om-st-u">↩ Ångra: ${escHtml(objStatusUndoStack[objStatusUndoStack.length - 1].label)}</button>` : ""}</div>`;
}
function objStatusBind(m, its, o = {}) {
  const close = () => m.classList.add("hidden");
  const all = m.querySelector("[data-ost-all]"); if (all) all.onchange = () => { objStatusScopeAll = all.checked; };
  m.querySelectorAll("[data-ost-rn]").forEach(b => { b.onclick = async e => { e.stopPropagation(); const kind = b.dataset.ostRn, it0 = its[0]; close();
    if (kind === "vis") { const cur = (plan && plan.dotNames && plan.dotNames[it0.id]) || "", n = await uiPrompt("Visuellt namn på pricken (syns bara i lägesplanen, tomt = ta bort):", cur || it0.object_name || it0.activity || ""); if (n === null || n === undefined) return; objSetVisualName(its, String(n).trim() === String(it0.object_name || it0.activity || "").trim() ? "" : String(n).trim()); return; }
    const cur = kind === "act" ? (it0.activity || "") : (it0.object_name || ""), n = (await uiPrompt(kind === "act" ? "Nytt namn på aktiviteten (gäller alla objekt i den):" : "Nytt namn på pricken:", cur) || "").trim();
    if (!n || n === cur) return; await objRename(kind === "act" ? (() => { const f2 = new Set([fkOf(it0)]); const pl = o.pool || items; return pl.filter(x => f2.has(fkOf(x))); })() : [it0], kind === "act" ? "activity" : "object_name", n, o.file); }; });
  const kl = m.querySelector("[data-ost-kl]"), ki = m.querySelector("[data-ost-ki]"), kb = m.querySelector("[data-ost-kb]");
  if (kl && !o.box) {   // kommentarer (samma fil som 4D-planeringens kommentarer: syns där också)
    const cpath = () => o.comments || dataPath("plan_item_comments.json"), it0 = its[0];
    const show = rows => { const mine = rows.filter(c => c.plan_item_id === it0.id).sort((a, b) => (a.created_at < b.created_at ? -1 : 1)); kl.innerHTML = mine.length ? mine.slice(-3).map(c => `<div class="om-kc"><button type="button" class="om-kd" data-ost-kd="${escHtml(c.id)}" title="Ta bort kommentaren">✕</button><b>${escHtml(c.author || "")}</b> <small>${escHtml(String(c.created_at || "").slice(0, 10))}</small><br>${escHtml(c.body || "")}</div>`).join("") + (mine.length > 3 ? `<small>+ ${mine.length - 3} äldre i 4D-planeringen</small>` : "") : "<i>Inga kommentarer än.</i>";
      kl.querySelectorAll("[data-ost-kd]").forEach(b => { b.onclick = async e => { e.stopPropagation(); if (!await uiConfirm("Ta bort kommentaren?")) return; const id = b.dataset.ostKd;
        try { const after = await ghWriteJSON(token, cpath(), arr => { const cur = Array.isArray(arr) ? arr : [], gone = new Set([id]); let grew = true; while (grew) { grew = false; cur.forEach(c => { if (c.parent_comment_id && gone.has(c.parent_comment_id) && !gone.has(c.id)) { gone.add(c.id); grew = true; } }); } return cur.filter(c => !gone.has(c.id)); }, "Lägesplan: ta bort kommentar"); show(Array.isArray(after) ? after : []); setSaveStatus("Kommentaren är borttagen."); }
        catch (er) { setSaveStatus("⚠ Kunde inte ta bort kommentaren: " + er.message); } }; }); };
    Promise.resolve().then(() => ghReadJSON(token, cpath())).then(r => show(Array.isArray(r) ? r : [])).catch(() => { kl.innerHTML = "<i>Kunde inte läsa kommentarerna.</i>"; });
    const post = async () => {
      const body = (ki.value || "").trim(); if (!body) return; kb.disabled = true;
      const row = { id: ghNewId(), created_at: new Date().toISOString(), plan_item_id: it0.id, parent_comment_id: null, author: (settings && settings.userName) || "Lägesplan", body };
      try { const after = await ghWriteJSON(token, cpath(), arr => [...(Array.isArray(arr) ? arr : []), row], "Lägesplan: kommentar på prick"); ki.value = ""; show(Array.isArray(after) ? after : [row]); setSaveStatus("Kommentar sparad – syns också i 4D-planeringen."); }
      catch (e) { setSaveStatus("⚠ Kunde inte spara kommentaren: " + e.message); }
      kb.disabled = false;
    };
    kb.onclick = e => { e.stopPropagation(); post(); }; ki.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") post(); }; ki.onclick = e => e.stopPropagation();
  }
  const fk = o.famKey || objFamKey, pool = o.pool || items, fkOf = fk;
  const rowsNow = () => { const fams = new Set(its.map(fk)); return !o.box && objStatusScopeAll ? pool.filter(x => fams.has(fk(x))) : its; };
  const sl = m.querySelector("[data-ost-sl]"), sv = m.querySelector("[data-ost-v]");
  if (sl) { sl.oninput = () => { sv.textContent = sl.value + " %"; }; sl.onchange = async () => { close(); await objSetStatus(rowsNow(), "pct", Number(sl.value), o.file); }; sl.onclick = e => e.stopPropagation(); }
  m.querySelectorAll("[data-ost-col]").forEach(b => { b.onclick = () => { close(); objSetDotColor(rowsNow(), b.dataset.ostCol || null); }; });
  const pick = m.querySelector("[data-ost-colpick]"); if (pick) { pick.onclick = e => e.stopPropagation(); pick.onchange = () => { close(); objSetDotColor(rowsNow(), pick.value); }; }
  m.querySelectorAll("[data-ost]").forEach(b => { b.onclick = async () => {
    const k = b.dataset.ost; close();
    if (k === "undo") return objStatusUndo();
    const rows = rowsNow();
    let pct = null;
    if (k === "pct" || k === "pagaende") {
      const a = await uiPrompt(k === "pct" ? "Framdrift i procent (0–100):" : "Hur många procent är klart? (1–99)", String(Math.round(Number(its[0].progress) || (k === "pagaende" ? 50 : 0))));
      if (a === null || a === undefined || String(a).trim() === "") return;
      pct = Number(String(a).replace(",", ".").replace("%", ""));
      if (!isFinite(pct)) { setSaveStatus("Ogiltig procentsats."); return; }
    }
    await objSetStatus(rows, k === "pagaende" && pct === null ? "pagaende" : k, pct, o.file);
  }; });
}

/* ---------- Dra en ruta och sätt status på alla prickar i den ---------- */
let objTool = null;                           // null | "status" | "add"
function objToolSet(t) {
  objTool = objTool === t ? null : t;
  const vp = $("viewport"); if (vp) vp.classList.toggle("obj-tool", !!objTool);
  [["status", "btnObjStatusBox"], ["add", "btnObjAddDot"], ["newact", "btnObjNewAct"]].forEach(([k, id]) => { const b = $(id); if (b) b.classList.toggle("on", objTool === k); });
  setSaveStatus(objTool === "status" ? "Dra en ruta över prickarna och välj status. Esc avslutar." : objTool === "add" ? "Klicka där den nya pricken ska ligga. Esc avslutar." : objTool === "newact" ? "Klicka där den nya aktiviteten ska ligga – du får fylla i namn och datum. Esc avslutar." : "");
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
  items.push(row); positions.push(pr); objInvalidate(); renderZones();
  const undo = async () => {
    const i = items.indexOf(row); if (i >= 0) items.splice(i, 1); const j = positions.indexOf(pr); if (j >= 0) positions.splice(j, 1);
    objInvalidate(); renderZones();
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
    objInvalidate(); renderZones();
    setSaveStatus("⚠ Kunde inte spara den nya pricken: " + e.message);
  }
}
/* ---------- Ny aktivitet direkt i lägesplanen (Victor 2026-10-26) ----------
   En okopplad aktivitet (som "＋ Ny aktivitet" i 4D-planering: model_id null, object_id "manuell-…") med en egen prick som kan dras fritt i planen
   tills den kopplas till ett objekt i 3D-modellen (Koppla i 3D-editorn eller i 4D-planering – då tar aktiviteten objektets läge). */
const objIsFree = it => !!it && it.origin === "manuell" && !it.model_id && /^manuell-/.test(String(it.object_id || ""));
function objNewActForm(def) {
  return new Promise(res => {
    const el = document.createElement("div"); el.className = "na-modal";
    const f = (k, lab, type, v, ph) => `<label><span>${lab}</span><input type="${type}" data-na="${k}" value="${escHtml(v || "")}" placeholder="${escHtml(ph || "")}" /></label>`;
    el.innerHTML = `<div class="na-card" role="dialog" aria-label="Ny aktivitet"><h3>Ny aktivitet</h3><p>Pricken hamnar där du klickade och går att dra fritt i planen tills du kopplar den till ett objekt i modellen.</p>
      ${f("activity", "Aktivitet *", "text", "", "t.ex. Armering platta J")}${f("name", "Prickens namn", "text", "", "tomt = aktivitetens namn")}${f("area", "Område", "text", def.area)}${f("contractor", "Entreprenör", "text", def.contractor)}
      <div class="na-row">${f("start", "Start", "date", def.start)}${f("end", "Slut", "date", def.end)}</div>
      <div class="na-btns"><button type="button" data-na-x>Avbryt</button><button type="button" class="primary" data-na-ok>Skapa</button></div></div>`;
    document.body.appendChild(el);
    const v = k => (el.querySelector(`[data-na="${k}"]`).value || "").trim(), close = r => { document.removeEventListener("keydown", key, true); el.remove(); res(r); };
    const ok = () => { if (!v("activity")) { el.querySelector('[data-na="activity"]').focus(); return; } close({ activity: v("activity"), name: v("name"), area: v("area"), contractor: v("contractor"), start: v("start") || def.start, end: v("end") || def.end }); };
    const key = e => { if (e.key === "Escape") { e.stopPropagation(); close(null); } else if (e.key === "Enter" && e.target.tagName === "INPUT") { e.stopPropagation(); ok(); } };
    document.addEventListener("keydown", key, true);
    el.querySelector("[data-na-ok]").onclick = ok; el.querySelector("[data-na-x]").onclick = () => close(null); el.addEventListener("mousedown", e => { if (e.target === el) close(null); });
    setTimeout(() => el.querySelector('[data-na="activity"]').focus(), 30);
  });
}
async function objNewActivity(pdfPt) {
  if (!plan || !plan.calib) { setSaveStatus("Kalibrera planen mot 3D först – pricken placeras via modellens koordinater."); return; }
  const today = todayIso(), pos = positionsInPdf();
  let near = null, best = Infinity; if (pos) items.forEach(it => { const p = pos.get(it.id); if (!p) return; const d = Math.hypot(p[0] - pdfPt[0], p[1] - pdfPt[1]); if (d < best) { best = d; near = it; } });
  const r = await objNewActForm({ area: near && near.area || "", contractor: near && near.contractor || "", start: today, end: typeof addDaysIso === "function" ? addDaysIso(today, 7) : today }); if (!r) return;
  const id = ghNewId(), [mx, my] = pdfToModel(pdfPt), zg = Number(plan.calib.model[0][2]) || 0;
  const row = { id, project_id: projectId, model_id: null, object_id: `manuell-${id}`, object_name: r.name || r.activity, activity: r.activity, area: r.area || null, contractor: r.contractor || null, element_type: null, status: "planerad", start_date: r.start || null, end_date: r.end || null, actual_start_date: null, actual_end_date: null, progress: 0, depends_on: [], group_id: id, origin: "manuell", updated_at: new Date().toISOString() };
  const pr = { id, x: Math.round(mx * 1000) / 1000, y: Math.round(my * 1000) / 1000, z0: zg, z1: zg, manual: true };
  items.push(row); positions.push(pr); objInvalidate(); renderZones();
  const undo = async () => {
    const i = items.indexOf(row); if (i >= 0) items.splice(i, 1); const j = positions.indexOf(pr); if (j >= 0) positions.splice(j, 1);
    objInvalidate(); renderZones();
    await ghWriteJSON(token, dataPath("plan_items.json"), arr => (Array.isArray(arr) ? arr : []).filter(x => x.id !== id), `Lägesplan: ångra ny aktivitet ${r.activity}`);
    await ghWriteJSON(token, dataPath("plan_item_positions.json"), arr => (Array.isArray(arr) ? arr : []).filter(x => x.id !== id), `Lägesplan: ångra position ${r.activity}`); objNotifyPlan(dataPath("plan_items.json"));
  };
  objStatusUndoStack.push({ label: `ny aktivitet ${r.activity}`, undo });
  setSaveStatus(`Sparar ny aktivitet ${r.activity} …`);
  try {
    await ghWriteJSON(token, dataPath("plan_items.json"), arr => [...(Array.isArray(arr) ? arr : []).filter(x => x.id !== id), row], `Lägesplan: ny aktivitet ${r.activity}`);
    await ghWriteJSON(token, dataPath("plan_item_positions.json"), arr => [...(Array.isArray(arr) ? arr : []).filter(x => x.id !== id), pr], `Lägesplan: position ${r.activity}`);
    setSaveStatus(`✓ Aktiviteten "${r.activity}" skapad. Dra pricken dit du vill; koppla den till ett objekt i 3D när du är redo.`); objNotifyPlan(dataPath("plan_items.json"));
  } catch (e) {
    objStatusUndoStack.pop(); const i = items.indexOf(row); if (i >= 0) items.splice(i, 1); const j = positions.indexOf(pr); if (j >= 0) positions.splice(j, 1);
    objInvalidate(); renderZones(); setSaveStatus("⚠ Kunde inte spara aktiviteten: " + e.message);
  }
}
/* Flyttad fri prick: läget sparas i positionsfilen (inte som en objektmarkering). */
async function objSaveFreePos(it, model) {
  const pr = positions.find(p => p.id === it.id); if (!pr) return;
  const before = { x: pr.x, y: pr.y }; pr.x = Math.round(model[0] * 1000) / 1000; pr.y = Math.round(model[1] * 1000) / 1000; pr.manual = true;
  objInvalidate(); renderZones();
  objStatusUndoStack.push({ label: `flytt av ${it.object_name || it.activity}`, undo: async () => { pr.x = before.x; pr.y = before.y; objInvalidate(); renderZones(); await ghWriteJSON(token, dataPath("plan_item_positions.json"), arr => (Array.isArray(arr) ? arr : []).map(p => p.id === it.id ? { ...p, x: before.x, y: before.y } : p), "Lägesplan: ångra flytt"); } });
  try { await ghWriteJSON(token, dataPath("plan_item_positions.json"), arr => (Array.isArray(arr) ? arr : []).map(p => p.id === it.id ? { ...p, x: pr.x, y: pr.y, manual: true } : p), `Lägesplan: flytta ${it.object_name || it.activity}`); setSaveStatus("📍 Aktiviteten flyttad – koppla den till ett objekt i 3D när den ligger rätt (Ctrl+Z ångrar)."); }
  catch (e) { pr.x = before.x; pr.y = before.y; objStatusUndoStack.pop(); objInvalidate(); renderZones(); setSaveStatus("⚠ Kunde inte spara läget: " + e.message); }
}
function objToolBind() {
  const sb = $("btnObjStatusBox"), ab = $("btnObjAddDot"), na = $("btnObjNewAct"); if (!sb || !ab) return;
  sb.onclick = () => objToolSet("status"); ab.onclick = () => objToolSet("add"); if (na) na.onclick = () => objToolSet("newact");
  window.addEventListener("keydown", e => { if (e.key === "Escape" && objTool) objToolSet(objTool); });
}
objToolBind();
