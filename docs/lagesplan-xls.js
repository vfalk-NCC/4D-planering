/* Excel-planeringen som lager i Powerproject-lägesplanen (Victor 2026-10-12: "Kan jag på något sätt visa
   excel-objekten samtidigt när jag har PP-lägesplanen igång? För där har jag kopplat varje fundament" –
   "färga efter Excels datum").

   – Bara när Powerproject är vald: lagret "Excel-planeringen" under Lager (tänd/släck, genomskinlighet, ritordning).
   – Läser Excel-tidplanens objekt och positioner (projects/<id>/plan_items.json och plan_item_positions.json) –
     bara läsning, inget sparas och inget kopplas om. De två tidplanerna blandas aldrig ihop.
   – Varje Excel-objekt som en ring i Excels statusfärg på valt datum (PP-objekten är fyllda prickar).
   – Hovra över en ring: aktiviteten, datumen och att den kommer från Excel-planeringen. */

const xls = { items: null, positions: null, loading: null, err: "", posPdf: null, posKey: "" };
const xlsActive = () => typeof planSource !== "undefined" && planSource === "pp";
const xlsPath = f => `projects/${encodeURIComponent(projectId)}/${f}`;

function xlsLoad() {
  if (!xlsActive() || xls.items || xls.loading) return xls.loading;
  xls.loading = Promise.all([ghReadJSON(token, xlsPath("plan_items.json")), ghReadJSON(token, xlsPath("plan_item_positions.json")).catch(() => [])])
    .then(([its, pos]) => { xls.items = Array.isArray(its) ? its : []; xls.positions = Array.isArray(pos) ? pos : []; xls.err = ""; xls.posPdf = null; })
    .catch(e => { xls.err = e.message; xls.items = []; xls.positions = []; })
    .finally(() => { xls.loading = null; if (typeof renderZones === "function") renderZones(); if (typeof renderLayerPanel === "function") renderLayerPanel(); });
  return xls.loading;
}
/* Excel-objekten med position på arbetsytan (och vald nivå): [{ it, pt }]. */
function xlsObjects() {
  if (!xlsActive() || !plan || !plan.calib || !xls.items || !xls.positions) return [];
  const [z0, z1] = typeof levelRange === "function" ? levelRange() : [null, null];
  const key = `${plan.id}|${JSON.stringify(plan.calib)}|${z0}|${z1}|${xls.positions.length}`;
  if (xls.posPdf && xls.posKey === key) return xls.posPdf;
  const byId = new Map(xls.positions.map(p => [p.id, p]));
  xls.posPdf = xls.items.filter(it => byId.has(it.id)).map(it => {
    const p = byId.get(it.id), zc = (p.z0 + p.z1) / 2;
    if ((z0 !== null && zc < z0) || (z1 !== null && zc > z1)) return null;
    return { it, pt: modelToPdf(p.x, p.y), zc };
  }).filter(Boolean).sort((a, b) => a.zc - b.zc);
  xls.posKey = key;
  return xls.posPdf;
}
const xlsCount = () => xlsObjects().length;
function xlsPhase(it) {
  const at = $("dateInput").value || todayIso(), warn = Number.isFinite(settings.warningDaysBeforeEnd) ? settings.warningDaysBeforeEnd : 7;
  return computeItemPhase(it, at, warn) || fallbackPhase(it);
}
let xlsRingPx = 5;
/* Ringarna (anropas från renderZones med xlsCanvas). */
function drawXls(ctx, fontPx) {
  if (!xlsActive() || !layerVisible("xls")) return;
  if (!xls.items) { xlsLoad(); return; }
  const list = xlsObjects();
  if (!list.length) return;
  const r = Math.max(2.5, (typeof objDotRadius === "function" ? objDotRadius(ctx, fontPx) : fontPx / 4) * 0.85);
  xlsRingPx = r;
  ctx.save();
  for (const o of list) {
    const color = phaseColor(xlsPhase(o.it)), [x, y] = toPx(o.pt);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1.2, r * 0.45); ctx.strokeStyle = "#ffffff"; ctx.stroke(); // vit kant under – syns på mörkt underlag
    ctx.lineWidth = Math.max(1, r * 0.3); ctx.strokeStyle = color; ctx.stroke();
  }
  ctx.restore();
}
/* Excel-objekten under pekaren (PDF-punkt). */
function xlsAt(pdfPt) {
  if (!xlsActive() || !layerVisible("xls")) return [];
  const tol = Math.max(xlsRingPx * 1.3, 6 / view.scale) / renderScale;
  return xlsObjects().filter(o => Math.hypot(o.pt[0] - pdfPt[0], o.pt[1] - pdfPt[1]) <= tol);
}
function xlsTipHtml(list) {
  const o = list[0], it = o.it, ph = xlsPhase(it);
  const d = s => (s ? String(s).slice(0, 10) : "–");
  return `<div style="font-size:11px;opacity:.75;margin-bottom:2px;">📊 Excel-planeringen</div><b>${escHtml(it.object_name || it.name || "Objekt")}</b>`
    + `<div>${escHtml(it.activity || "")}</div>`
    + `<div><span style="display:inline-block;width:9px;height:9px;border-radius:50%;border:2px solid ${phaseColor(ph)};margin-right:4px;vertical-align:-1px;"></span>${escHtml(PHASE_LABELS[ph] || ph)} · ${d(it.start_date)} – ${d(it.end_date)}${Number.isFinite(Number(it.progress)) && it.progress !== "" && it.progress != null ? ` · ${Math.round(Number(it.progress))} %` : ""}</div>`
    + (list.length > 1 ? `<div style="margin-top:6px;opacity:.75;">+ ${list.length - 1} till här</div>` : "");
}
/* Namnen (samma etiketter som objekten, "Visa namn"): Excel-objekten som { it, center, xls }. */
function xlsLabelObjects() {
  if (!xlsActive() || !layerVisible("xls") || !xls.items) return [];
  return xlsObjects().map(o => ({ it: o.it, center: o.pt, members: [o.it], xls: true }));
}
