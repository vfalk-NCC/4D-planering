/* Placera aktiviteter i 2D-lägesplanen (Victor 2026-11-09: "kan jag också lägga in aktiviteter som inte är kopplade i 3D? Jag vill lägga ut prickar för dom i 2D-lägesplanen.
   Sedan exporterar vi en IFC till TC där ganttens aktiviteter kopplar på samma sätt i 3D").
   1) 📌 Placera aktiviteter: lista över aktiviteter utan 3D-koppling och utan prick → välj en, tryck i planen → pricken ligger där (kan dras, ångras, tas bort).
   2) 🧊 Exportera IFC: en markör per placerad aktivitet (namn som 3D-text, egenskaper) med ett fast IFC-id (härlett ur aktivitetens id – samma fil kan uppdateras utan att kopplingarna tappas).
   3) 🔗 Koppla till Gantt: när IFC-filen är tänd i Trimble Connect kopplas varje aktivitet till sin markör (samma anrop som "Koppla" i 3D-editorn) – därefter hänger Gantten ihop med modellen. */
const AP_FILE_PFX = "Aktiviteter ";
const ap = { sel: null, q: "", panel: null, busy: false };
/* IFC-GlobalId (22 tecken) härlett ur id:t – samma id ger alltid samma GUID. */
function apGuid(id) {
  let h = [0x9e3779b9, 0x243f6a88, 0xb7e15162, 0xdeadbeef]; const s = "4d-aktivitet:" + id;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); for (let k = 0; k < 4; k++) { h[k] = Math.imul(h[k] ^ (c + k * 31), 2654435761 + 2 * k); h[k] ^= h[k] >>> 15 + k; } }
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) { h[k] = Math.imul(h[k] ^ h[(k + 1) % 4], 1597334677); h[k] ^= h[k] >>> 13; }
  let n = 0n; h.forEach(v => { n = (n << 32n) | BigInt(v >>> 0); });
  let out = ""; for (let i = 0; i < 21; i++) { out = IFC_GUID_CHARS[Number(n & 63n)] + out; n >>= 6n; } return IFC_GUID_CHARS[Number(n & 3n)] + out;
}
let apCache = null;
function apPlacedSet() { if (!apCache || apCache.ref !== positions || apCache.n !== positions.length) apCache = { ref: positions, n: positions.length, set: new Set(positions.filter(p => p.placed).map(p => p.id)) }; return apCache.set; }
const apIsPlaced = it => !!it && !it.model_id && apPlacedSet().has(it.id);
const apFam = it => (typeof objFamKey === "function" ? objFamKey(it) : (it.group_id || it.id));
const apName = it => String(it.object_name || it.activity || "Aktivitet").trim();
function apUnplaced() {
  const has = new Set(positions.map(p => p.id)), fams = new Map();
  (items || []).forEach(it => { if (it.model_id || has.has(it.id) || it.del || it.deleted) return; const k = apFam(it); if (!fams.has(k)) fams.set(k, { key: k, rows: [] }); fams.get(k).rows.push(it); });
  return [...fams.values()].map(f => ({ ...f, name: famName(f.rows[0]), it: f.rows[0] })).sort((a, b) => String(a.it.start_date || "").localeCompare(String(b.it.start_date || "")) || a.name.localeCompare(b.name, "sv"));
}
function apPlacedRows() { const s = apPlacedSet(); return (items || []).filter(it => !it.model_id && s.has(it.id)); }
const apGet = id => positions.find(p => p.id === id);

/* ---------- placera ---------- */
async function apPlaceAt(pdfPt) {
  if (!ap.sel) { setSaveStatus("📌 Välj först en aktivitet i listan (rutan uppe till höger)."); return; }
  if (!plan || !plan.calib) { setSaveStatus("Kalibrera planen mot 3D först – pricken placeras via modellens koordinater."); return; }
  const fam = ap.sel, rows = fam.rows.slice(), [mx, my] = pdfToModel(pdfPt), zg = Number(plan.calib.model[0][2]) || 0, prs = rows.map(r => ({ id: r.id, x: Math.round(mx * 1000) / 1000, y: Math.round(my * 1000) / 1000, z0: zg, z1: zg, manual: true, placed: true }));
  prs.forEach(p => positions.push(p)); objInvalidate(); renderZones();
  const ids = new Set(rows.map(r => r.id)), nm = fam.name, order = apUnplaced();
  const undo = async () => { positions = positions.filter(p => !ids.has(p.id)); ap.sel = fam; objInvalidate(); renderZones(); apRender(); await ghWriteJSON(token, dataPath("plan_item_positions.json"), arr => (Array.isArray(arr) ? arr : []).filter(r => !ids.has(r.id)), `Lägesplan: ångra placering ${nm}`); };
  objStatusUndoStack.push({ label: `placering av ${nm}`, undo });
  ap.sel = order[0] || null; apRender(); setSaveStatus(`📌 "${nm}" placerad (${rows.length} rad${rows.length > 1 ? "er" : ""}). Sparar …`);
  try { await ghWriteJSON(token, dataPath("plan_item_positions.json"), arr => [...(Array.isArray(arr) ? arr : []).filter(r => !ids.has(r.id)), ...prs], `Lägesplan: placera aktivitet ${nm}`); setSaveStatus(`📌 "${nm}" placerad och sparad.${ap.sel ? " Välj plats för nästa: " + ap.sel.name : " Alla aktiviteter är placerade."}`); }
  catch (e) { objStatusUndoStack.pop(); positions = positions.filter(p => !ids.has(p.id)); objInvalidate(); renderZones(); apRender(); setSaveStatus("⚠ Kunde inte spara placeringen: " + e.message); }
}
async function apRemove(fam) {
  const ids = new Set(fam.rows.map(r => r.id)), before = positions.filter(p => ids.has(p.id));
  positions = positions.filter(p => !ids.has(p.id)); objInvalidate(); renderZones(); apRender();
  objStatusUndoStack.push({ label: `borttagen placering ${fam.name}`, undo: async () => { before.forEach(p => positions.push(p)); objInvalidate(); renderZones(); apRender(); await ghWriteJSON(token, dataPath("plan_item_positions.json"), arr => [...(Array.isArray(arr) ? arr : []).filter(r => !ids.has(r.id)), ...before], "Lägesplan: ångra borttagen placering"); } });
  try { await ghWriteJSON(token, dataPath("plan_item_positions.json"), arr => (Array.isArray(arr) ? arr : []).filter(r => !ids.has(r.id)), `Lägesplan: ta bort placering ${fam.name}`); setSaveStatus(`Placeringen av "${fam.name}" borttagen (Ctrl+Z ångrar).`); } catch (e) { setSaveStatus("⚠ Kunde inte spara: " + e.message); }
}

/* ---------- IFC ---------- */
function apFileName() { return `${AP_FILE_PFX}${plan ? plan.name : ""}.ifc`.replace(/[\\/:*?"<>|]/g, "-"); }
function apBuildIfc(rows) {
  const at = ($("dateInput") && $("dateInput").value) || todayIso(), warn = Number.isFinite(settings.warningDaysBeforeEnd) ? settings.warningDaysBeforeEnd : 7;
  const doc = ifcDoc("4D-planering – " + (plan ? plan.name : ""), "Placerade aktiviteter " + at), E = doc.E, prof = E(`IFCCIRCLEPROFILEDEF(.AREA.,$,$,${ifcNum(0.6)})`), zDir = E("IFCDIRECTION((0.,0.,1.))"), { rx, ry } = ifcReadDir(), elems = [], seen = new Map();
  rows.forEach(it => {
    const p = apGet(it.id); if (!p) return; const key = Math.round(p.x * 10) + "," + Math.round(p.y * 10), k = seen.get(key) || 0; seen.set(key, k + 1);
    const ph = (computeItemPhase(it, at, warn) || fallbackPhase(it)), pl = doc.place([p.x + k * 1.6, p.y, (p.z1 || 0) + .1]), cyl = E(`IFCEXTRUDEDAREASOLID(${prof},$,${zDir},${ifcNum(1.2)})`);
    E(`IFCSTYLEDITEM(${cyl},(${doc.style(ph, phaseColor(ph), PHASE_LABELS[ph] || ph)}),$)`);
    const name = apName(it), el = E(`IFCBUILDINGELEMENTPROXY('${apGuid(it.id)}',$,${ifcStr(name)},${ifcStr(PHASE_LABELS[ph] || ph)},${ifcStr("4D-aktivitet")},${pl},${doc.shape(cyl, "SweptSolid")},${ifcStr(it.id)},.NOTDEFINED.)`);
    elems.push(el);
    doc.props(el, [["Aktivitet", it.activity || ""], ["Objekt", it.object_name || ""], ["Status", PHASE_LABELS[ph] || ph], ["Framdrift %", it.status === "klar" ? 100 : (Number(it.progress) || 0)], ["Start", it.start_date || ""], ["Slut", it.end_date || ""], ["Område", it.area || ""], ["Entreprenör", it.contractor || ""], ["4D-ID", it.id], ["Status per", at]]);
    const mesh = ifcTextSolid(doc, name, { h: IFC_TEXT_H, t: IFC_TEXT_T, rx, ry, start: 1.1, across: IFC_TEXT_H / 2 });
    if (mesh) elems.push(doc.proxy(`${name} – text`, "Namn", "4D-text", pl, doc.shape(mesh, "Tessellation"), it.id));
  });
  return { text: doc.finish(elems, apFileName()), n: rows.length };
}
const apOpener = () => !!(window.opener && !window.opener.closed);
async function apExport() {
  const rows = apPlacedRows(); if (!rows.length) { setSaveStatus("📌 Inga placerade aktiviteter att exportera – placera några först."); return; }
  const r = apBuildIfc(rows), name = apFileName(), bytes = new TextEncoder().encode(r.text);
  downloadBlob(new Blob([bytes], { type: "application/x-step" }), name);
  if (!apOpener()) { setSaveStatus(`🧊 ${r.n} aktiviteter nedladdade som IFC. ⚠ Inte sparad i Trimble Connect – öppna lägesplanen via 🗺️ i 4D-planering för det.`); return; }
  setSaveStatus(`🧊 ${r.n} aktiviteter nedladdade – sparar i Trimble Connect…`);
  try { const res = await askOpener("tcUpload", { folder: DXF_TC_FOLDER, files: [new File([bytes], name, { type: "application/x-step" })] }, 5 * 60 * 1000); setSaveStatus(`🧊 ${r.n} aktiviteter sparade i Trimble Connect (${res.folder || DXF_TC_FOLDER}) som "${name}". Tänd filen i TC och tryck 🔗 Koppla till Gantt.`); }
  catch (e) { setSaveStatus(`🧊 ${r.n} aktiviteter nedladdade. ⚠ Kunde inte spara i Trimble Connect: ${e.message}`); }
}
async function apCouple() {
  const rows = apPlacedRows(); if (!rows.length) { setSaveStatus("🔗 Inga placerade, okopplade aktiviteter."); return; }
  if (!apOpener()) { uiAlert("Kopplingen görs av 4D-planering i Trimble Connect. Öppna lägesplanen med kartknappen i 4D-planering (på datorn) och försök igen."); return; }
  let models; try { models = (await askOpener("ifcModelsList", {}, 30000)).models || []; } catch (e) { uiAlert("Kunde inte läsa modellerna i Trimble Connect: " + e.message); return; }
  const want = apFileName().toLowerCase(), m = models.find(x => String(x.name || "").toLowerCase() === want) || models.find(x => String(x.name || "").toLowerCase().startsWith(AP_FILE_PFX.toLowerCase()));
  if (!m) { uiAlert(`Filen "${apFileName()}" är inte tänd i Trimble Connect. Tänd den under Modeller i TC (exportera först med 🧊 om den inte finns) och tryck 🔗 Koppla till Gantt igen.`); return; }
  if (!(await uiConfirm(`Koppla ${rows.length} aktivitet${rows.length > 1 ? "er" : ""} till sina markörer i "${m.name}"?\n\nVarje aktivitet i Gantten får då ett 3D-objekt i den exporterade IFC-filen.`))) return;
  let ok = 0, bad = "";
  for (const it of rows) { setSaveStatus(`🔗 Kopplar ${ok + 1}/${rows.length} …`); try { const r = await askOpener("coupleObjects", { source: planSource === "pp" ? "pp" : "excel", itemId: it.id, objs: [{ modelId: m.id, objectId: apGuid(it.id) }] }, 120000); if (r && r.failed) { bad = r.failed; break; } ok++; } catch (e) { bad = e.message; break; } }
  try { const fr = await ghReadJSON(token, dataPath("plan_items.json"), { fresh: true }); if (Array.isArray(fr)) { items = fr; objInvalidate(); } } catch (e) { /* uppdateras vid nästa läsning */ }
  renderZones(); apRender();
  setSaveStatus(bad ? `🔗 ${ok} av ${rows.length} kopplade. ⚠ ${bad}` : `🔗 ${ok} aktivitet${ok > 1 ? "er" : ""} kopplade till IFC-filen – Gantten hänger nu ihop med 3D-modellen. Tryck ↻ i 4D-planering för att se det där.`);
}

/* ---------- panelen ---------- */
function apPanel() {
  if (ap.panel) return ap.panel;
  const st = document.createElement("style"); st.textContent = `#apPanel{position:fixed;right:14px;top:64px;width:340px;max-height:72vh;display:flex;flex-direction:column;background:#fff;border:1px solid #cbd5e1;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.25);z-index:60;font-size:13px}
  #apPanel.hidden{display:none}#apPanel h4{margin:0;padding:10px 12px;font-size:14px;display:flex;align-items:center;gap:6px;border-bottom:1px solid #e2e8f0}#apPanel h4 span{flex:1}
  #apPanel .ap-b{padding:8px 12px;overflow:auto;display:flex;flex-direction:column;gap:6px}#apPanel input[type=search]{width:100%;box-sizing:border-box;padding:6px 8px;border:1px solid #cbd5e1;border-radius:8px}
  #apPanel .ap-it{padding:6px 8px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;line-height:1.25}#apPanel .ap-it:hover{background:#f1f5f9}#apPanel .ap-it.on{background:#2563eb;color:#fff;border-color:#2563eb}#apPanel .ap-it small{opacity:.75;display:block}
  #apPanel .ap-act{display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px;border-top:1px solid #e2e8f0}#apPanel .ap-act button{flex:1;min-width:120px}#apPanel .ap-pl{display:flex;align-items:center;gap:6px;padding:3px 0}#apPanel .ap-pl span{flex:1}#apPanel .ap-x{border:0;background:none;cursor:pointer;color:#b91c1c}
  #apPanel .ap-h{font-weight:600;margin-top:4px;color:#475569}`; document.head.appendChild(st);
  const el = document.createElement("div"); el.id = "apPanel"; el.className = "hidden"; document.body.appendChild(el); ap.panel = el; return el;
}
function apRender() {
  const el = apPanel(); if (el.classList.contains("hidden")) return;
  const q = ap.q.toLowerCase(), list = apUnplaced(), shown = list.filter(f => !q || (f.name + " " + (f.it.area || "") + " " + (f.it.contractor || "")).toLowerCase().includes(q)), placed = apPlacedRows(), fams = new Map();
  placed.forEach(it => { const k = apFam(it); if (!fams.has(k)) fams.set(k, { key: k, rows: [], name: String(it.activity || apName(it)) }); fams.get(k).rows.push(it); });
  el.innerHTML = `<h4><span>📌 Placera aktiviteter</span><button type="button" class="ap-close" title="Stäng">✕</button></h4>
    <div class="ap-b"><div class="muted">${list.length ? `Välj en aktivitet utan 3D-koppling och tryck sedan i planen där pricken ska ligga.` : "Alla okopplade aktiviteter har redan en prick."}</div>
    <input type="search" placeholder="Sök aktivitet, område, entreprenör…" value="${escHtml(ap.q)}">
    ${shown.slice(0, 200).map((f, i) => `<div class="ap-it${ap.sel && ap.sel.key === f.key ? " on" : ""}" data-i="${i}"><b>${escHtml(f.name)}</b>${f.rows.length > 1 ? ` · ${f.rows.length} rader` : ""}<small>${escHtml([f.it.area, f.it.contractor, f.it.start_date ? f.it.start_date + " → " + (f.it.end_date || "") : ""].filter(Boolean).join(" · "))}</small></div>`).join("")}${shown.length > 200 ? `<div class="muted">… ${shown.length - 200} till – sök för att hitta fler.</div>` : ""}
    ${fams.size ? `<div class="ap-h">Placerade (${placed.length})</div>${[...fams.values()].map((f, i) => `<div class="ap-pl"><span>${escHtml(f.name)}${f.rows.length > 1 ? ` · ${f.rows.length}` : ""}</span><button type="button" class="ap-x" data-r="${i}" title="Ta bort pricken">✕</button></div>`).join("")}` : ""}</div>
    <div class="ap-act"><button type="button" id="apExp" ${placed.length ? "" : "disabled"} title="Skapar en IFC-fil med en markör per placerad aktivitet och sparar den i Trimble Connect">🧊 Exportera IFC till TC</button><button type="button" id="apLink" ${placed.length ? "" : "disabled"} title="Kopplar aktiviteterna till markörerna i den exporterade IFC-filen (filen måste vara tänd i TC)">🔗 Koppla till Gantt</button></div>`;
  el.querySelector(".ap-close").onclick = apClose; el.querySelector("input").oninput = e => { ap.q = e.target.value; const pos = e.target.selectionStart; apRender(); const i2 = el.querySelector("input"); i2.focus(); i2.setSelectionRange(pos, pos); };
  el.querySelectorAll(".ap-it").forEach(d => d.onclick = () => { ap.sel = shown[+d.dataset.i]; if (objTool !== "actplace") objToolSet("actplace"); apRender(); setSaveStatus(`📌 Tryck i planen där "${ap.sel.name}" ska ligga.`); });
  el.querySelectorAll(".ap-x").forEach(b => b.onclick = () => apRemove([...fams.values()][+b.dataset.r])); el.querySelector("#apExp").onclick = apExport; el.querySelector("#apLink").onclick = apCouple;
}
/* 📌 på en rad i lagerlistan: öppna panelen med just den aktiviteten vald. */
function apFocus(key) { apPanel().classList.remove("hidden"); ap.q = ""; const f = apUnplaced().find(x => x.key === key); if (f) { ap.sel = f; if (objTool !== "actplace") objToolSet("actplace"); setSaveStatus(`📌 Tryck i planen där "${f.name}" ska ligga.`); } apRender(); }
function apOpen() { apPanel().classList.remove("hidden"); ap.sel = ap.sel || apUnplaced()[0] || null; apRender(); }
function apClose() { apPanel().classList.add("hidden"); if (objTool === "actplace") objToolSet("actplace"); }
{ const st = document.createElement("style"); st.textContent = `.layer-row.unplaced .ln{opacity:.75;font-style:italic}.oi-unpl{color:#b45309;font-style:normal}`; document.head.appendChild(st); }
(function bind() { const go = () => { const b = document.getElementById("btnApPlace"); if (b) b.onclick = () => (apPanel().classList.contains("hidden") ? apOpen() : apClose()); }; if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go(); })();
