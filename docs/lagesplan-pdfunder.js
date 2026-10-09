/* Lägesplan – PDF-underlag (Victors önskemål 2026-10-06: "ett block för att importera PDF:er så att
   de hamnar som ett vanligt lager, ungefär som DXF").

   En PDF läggs till direkt i arbetsytan man står i och blir ett vanligt PDF-lager (samma som de andra
   PDF-ritningarna: genomskinlighet, Färg, Beskär inte, skarp vid zoom, ritordning). Den sparas som en
   plan med underlay: true i status_plans.json – den syns inte som arbetsyta, bara som lager.

   Kalibrering utan 3D: PDF:en läggs först ungefär mitt i bilden, halvgenomskinlig. Sedan klickar man
   punkt 1 i den nya PDF:en och samma punkt på arbetsytans ritning, och likadant för punkt 2 – då
   hamnar den rätt (skala, vridning och läge). Kräver att arbetsytan själv är kalibrerad. */

const isUnderlay = p => !!(p && p.underlay);
const underlays = () => (typeof plans !== "undefined" ? plans : []).filter(isUnderlay);
let pdfuCal = null; // { id, step: 0–3, ov: [modell, modell], base: [modell, modell] } medan man kalibrerar

/* Underlagens plats i arbetsytans PDF-mapp: samma lagernyckel som de andra PDF-lagren. */
function pdfuSelected() { const s = $("pdfuSel"); return s ? underlays().find(p => p.id === s.value) || underlays()[0] || null : null; }

/* Ungefärlig placering mitt i den synliga delen (80 %), rak och i läsriktning. */
function pdfuProvisionalCalib(pg) {
  const [vx0, vy0, vx1, vy1] = pg.view;
  const vb = visibleStageBox(), bw = vb[2] - vb[0], bh = vb[3] - vb[1];
  const a = (vy1 - vy0) / Math.max(1, vx1 - vx0);
  const w = Math.min(bw * 0.8, bh * 0.8 / a), cx = (vb[0] + vb[2]) / 2, cy = (vb[1] + vb[3]) / 2;
  const mL = pdfToModel(toPdf([cx - w / 2, cy])), mR = pdfToModel(toPdf([cx + w / 2, cy]));
  return { model: [[mL[0], mL[1], 0], [mR[0], mR[1], 0]], pdf: [[vx0, (vy0 + vy1) / 2], [vx1, (vy0 + vy1) / 2]], provisional: true };
}

async function addPdfUnderlays(files) {
  if (!plan || !plan.calib) { alert("Kalibrera arbetsytan först (Zoner → Kalibrera mot 3D) – PDF-underlaget placeras via arbetsytans kalibrering."); return; }
  await flushPlanSave();
  let last = null;
  for (const file of files) {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") { alert(`${file.name} är ingen PDF.`); continue; }
    const id = ghNewId(), name = file.name.replace(/\.pdf$/i, "");
    setBusy(`Laddar upp ${name}…`);
    try {
      const buf = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
      const pg = await doc.getPage(1);
      const path = dataPath(`status_plans/${id}.pdf`);
      await ghUploadBinary(token, path, file, `Lägesplan: PDF-underlag ${name}`);
      const rec = { id, name, underlay: true, base: plan.id, file_path: path, file_name: file.name, page: 1, zones: [],
        calib: pdfuProvisionalCalib(pg), created_at: new Date().toISOString(), created_by: settings.userName || null, _isNew: true, _calibSet: true };
      plans.push(rec);
      pdfCache.set(id, buf);
      await savePlan(rec);
      const key = pdfOverlayKey(rec);
      Object.assign(ls(key, { visible: false }), { visible: true, opacity: 70 });
      saveLayerState();
      last = rec;
      if ($("pdfuToTc") && $("pdfuToTc").checked) {
        if (!window.opener || window.opener.closed) setSaveStatus("⚠ Originalet kunde inte sparas i Trimble Connect – öppna lägesplanen via 🗺️ i 4D-planering.");
        else askOpener("tcUpload", { folder: "Lägesplan", files: [file] }, 10 * 60 * 1000)
          .then(r => setSaveStatus(`☁ ${file.name} sparad i Trimble Connect (${r.folder || "Lägesplan"}).`))
          .catch(e => setSaveStatus("⚠ Kunde inte spara i Trimble Connect: " + e.message));
      }
    } catch (e) {
      alert(`Kunde inte lägga till ${file.name}: ` + e.message);
    } finally { setBusy(""); }
  }
  renderLayerPanel(); applyLayerCss();
  renderPdfUnderUi(last && last.id);
  if (last) startPdfuCalib(last.id);
}

/* ------------------------------------------------------------- kalibrering */
const PDFU_STEPS = [
  "Punkt 1: klicka på en tydlig punkt i den NYA PDF:en (t.ex. ett axelkryss eller hörn)",
  "Punkt 1: klicka på samma punkt på arbetsytans ritning",
  "Punkt 2: klicka på en annan punkt i den nya PDF:en – gärna långt från den första",
  "Punkt 2: klicka på samma punkt på arbetsytans ritning",
];
function startPdfuCalib(id) {
  const p = plans.find(x => x.id === id);
  if (!p || !plan || !plan.calib) return;
  if (typeof calib !== "undefined" && calib && typeof cancelCalib === "function") cancelCalib();
  const key = pdfOverlayKey(p);
  if (!layerVisible(key)) { ls(key).visible = true; saveLayerState(); renderLayerPanel(); applyLayerCss(); }
  pdfuCal = { id, step: 0, ov: [], base: [] };
  pdfuHint();
  renderZones();
}
function cancelPdfuCalib(msg) {
  pdfuCal = null;
  pdfuHint();
  renderZones();
  if (msg) setSaveStatus(msg);
}
function pdfuHint() {
  let h = $("pdfuHint");
  if (!pdfuCal) { if (h) h.classList.add("hidden"); renderPdfUnderUi(); return; }
  const p = plans.find(x => x.id === pdfuCal.id);
  if (!h) {
    h = document.createElement("div"); h.id = "pdfuHint"; h.className = "ap-ui";
    $("viewport").parentNode.appendChild(h);
  }
  h.innerHTML = `<b>📄 Kalibrera ${escHtml(p ? p.name : "PDF-underlaget")} · steg ${pdfuCal.step + 1} av 4</b><span>${escHtml(PDFU_STEPS[pdfuCal.step])}. Zooma och panorera som vanligt.</span>
    <span class="pdfu-acts"><button type="button" data-pdfu="fade" title="Tänd/släck underlaget för att se ritningen under">👁 Visa/dölj underlaget</button><button type="button" data-pdfu="cancel">Avbryt (Esc)</button></span>`;
  h.classList.remove("hidden");
  h.querySelector('[data-pdfu="cancel"]').onclick = () => cancelPdfuCalib("Kalibreringen avbröts.");
  h.querySelector('[data-pdfu="fade"]').onclick = () => { const k = pdfOverlayKey(p); ls(k).visible = !ls(k).visible; saveLayerState(); renderLayerPanel(); applyLayerCss(); };
  renderPdfUnderUi();
}
/* Ett klick på planen under kalibreringen. true = hanterat. */
function pdfuClick(e) {
  if (!pdfuCal || !plan || !plan.calib) return false;
  const p = plans.find(x => x.id === pdfuCal.id);
  if (!p) { cancelPdfuCalib(); return true; }
  const m = pdfToModel(toPdf(stagePoint(e)));
  if (pdfuCal.step % 2 === 0) pdfuCal.ov.push(m); else pdfuCal.base.push(m);
  pdfuCal.step++;
  if (pdfuCal.step < 4) { pdfuHint(); renderZones(); return true; }
  // Punkterna i den nya PDF:en räknas fram ur den ungefärliga placeringen (modell → underlagets PDF).
  const A = calibAffine(p.calib), toOv = ([x, y]) => [A[0] * x + A[2] * y + A[4], A[1] * x + A[3] * y + A[5]];
  const [o1, o2] = pdfuCal.ov.map(toOv), [b1, b2] = pdfuCal.base;
  if (Math.hypot(o1[0] - o2[0], o1[1] - o2[1]) < 1e-6 || Math.hypot(b1[0] - b2[0], b1[1] - b2[1]) < 0.01) {
    alert("Punkterna ligger för nära varandra – välj två punkter långt ifrån varandra.");
    pdfuCal = { id: p.id, step: 0, ov: [], base: [] }; pdfuHint(); renderZones(); return true;
  }
  p.calib = { model: [[b1[0], b1[1], 0], [b2[0], b2[1], 0]], pdf: [o1, o2] };
  p._calibSet = true;
  const scale = Math.hypot(b2[0] - b1[0], b2[1] - b1[1]) / Math.hypot(o2[0] - o1[0], o2[1] - o1[1]);
  pdfuCal = null; pdfuHint();
  savePlan(p);
  applyLayerCss(); renderZones(); renderLayerPanel();
  setSaveStatus(`✓ ${p.name} är kalibrerad (1 pt i PDF:en = ${(scale * 1000).toFixed(1)} mm i modellen).`);
  return true;
}
/* Kryss för de klickade punkterna (punkt 1 och 2). */
function drawPdfuMarks(ctx, fontPx) {
  if (!pdfuCal || !plan || !plan.calib) return;
  const mark = (m, i, col) => {
    const [x, y] = mToPx(m), r = fontPx;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, fontPx / 6);
    ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); ctx.stroke();
    ctx.fillStyle = col; ctx.font = `700 ${fontPx}px Arial`; ctx.fillText(String(i + 1), x + r * 0.4, y - r * 0.4); ctx.restore();
  };
  pdfuCal.ov.forEach((m, i) => mark(m, i, "#ea580c"));
  pdfuCal.base.forEach((m, i) => mark(m, i, "#0b5fff"));
}

/* ------------------------------------------------------------- blocket */
function renderPdfUnderUi(selId) {
  const box = $("pdfuSettings");
  if (!box) return;
  const list = underlays();
  box.classList.toggle("hidden", !list.length);
  if (!list.length) { $("pdfuSel").innerHTML = ""; return; }
  const sel = $("pdfuSel"), cur = selId || sel.value;
  sel.innerHTML = list.map(p => `<option value="${escHtml(p.id)}">${escHtml(p.name)}</option>`).join("");
  sel.value = list.some(p => p.id === cur) ? cur : list[0].id;
  const p = pdfuSelected();
  const st = !p.calib ? "Inte placerad" : p.calib.provisional ? "⚠ Ungefärligt placerad – kalibrera med två punkter" : "✓ Kalibrerad";
  $("pdfuInfo").textContent = `${st}${pdfuCal && pdfuCal.id === p.id ? " · kalibrerar nu…" : ""}`;
  $("btnPdfuCalib").textContent = pdfuCal && pdfuCal.id === p.id ? "Avbryt kalibreringen" : "📐 Kalibrera (två punkter)";
}
async function deletePdfUnderlay(p) {
  if (!p || !await uiConfirm(`Ta bort PDF-underlaget "${p.name}"? Lagret och filen tas bort.`)) return;
  if (pdfuCal && pdfuCal.id === p.id) cancelPdfuCalib();
  try {
    await ghWriteJSON(token, dataPath("status_plans.json"), arr => arr.filter(x => x.id !== p.id), `Lägesplan: ta bort PDF-underlag ${p.name}`);
    plans = plans.filter(x => x.id !== p.id);
    ghDeleteBinary(token, p.file_path, `Lägesplan: ta bort PDF-underlag ${p.name}`);
    pdfCache.delete(p.id);
    renderLayerPanel(); applyLayerCss(); renderPdfUnderUi();
    setSaveStatus(`PDF-underlaget ${p.name} är borttaget.`);
  } catch (e) { alert("Kunde inte ta bort: " + e.message); }
}

document.addEventListener("DOMContentLoaded", () => {
  // Underlagen är inga arbetsytor: dolda i listan, öppnas aldrig som plan.
  const origSelect = renderPlanSelect;
  renderPlanSelect = function () {
    const all = plans;
    plans = all.filter(p => !isUnderlay(p));
    try { return origSelect.apply(this, arguments); } finally { plans = all; }
  };
  const origOpen = openPlan;
  openPlan = async function (id) {
    const p = plans.find(x => x.id === id);
    if (isUnderlay(p)) { const b = plans.find(x => x.id === p.base && !isUnderlay(x)) || plans.find(x => !isUnderlay(x)); return b ? origOpen.call(this, b.id) : undefined; }
    if (pdfuCal) cancelPdfuCalib();
    return origOpen.apply(this, arguments);
  };
  const origMarks = drawCalibMarks;
  drawCalibMarks = function (ctx, fontPx) { origMarks.apply(this, arguments); drawPdfuMarks(ctx, fontPx); };
  const origZonesClick = typeof zonesClick === "function" ? zonesClick : null;
  zonesClick = function (e) { if (pdfuClick(e)) return true; return origZonesClick ? origZonesClick.apply(this, arguments) : false; };
  window.addEventListener("keydown", e => { if (e.key === "Escape" && pdfuCal) { e.preventDefault(); cancelPdfuCalib("Kalibreringen avbröts."); } }, true);

  const btn = $("btnAddPdfUnder"), inp = $("pdfuInput");
  if (!btn || !inp) return;
  btn.onclick = () => inp.click();
  inp.onchange = () => { const f = [...inp.files]; inp.value = ""; if (f.length) addPdfUnderlays(f); };
  $("pdfuSel").onchange = () => renderPdfUnderUi();
  $("btnPdfuCalib").onclick = () => { const p = pdfuSelected(); if (!p) return; if (pdfuCal && pdfuCal.id === p.id) cancelPdfuCalib("Kalibreringen avbröts."); else startPdfuCalib(p.id); };
  $("btnPdfuRename").onclick = async () => { const p = pdfuSelected(); if (!p) return; const n = (await uiPrompt("Nytt namn på PDF-underlaget:", p.name) || "").trim(); if (n && n !== p.name) { p.name = n; savePlan(p); renderLayerPanel(); renderPdfUnderUi(p.id); } };
  $("btnPdfuDelete").onclick = () => deletePdfUnderlay(pdfuSelected());
  try { const v = localStorage.getItem("lagesplan-pdfu-tc"); if (v != null) $("pdfuToTc").checked = v === "1"; } catch (e) {}
  $("pdfuToTc").onchange = () => { try { localStorage.setItem("lagesplan-pdfu-tc", $("pdfuToTc").checked ? "1" : "0"); } catch (e) {} };
});
