/* Lägesplan – flera PDF-ritningar som lager (Victors önskemål 2026-10-05).
   Projektets övriga planer (PDF:er) blir egna lager ("pdfp:<plan-id>") under
   samma mapp som ritningen (t.ex. 1.1 - PDF-ritningar). De läggs på rätt
   ställe ovanpå den öppna planen via båda planernas kalibrering (PDF ↔ modell),
   är släckta från början och har genomskinlighet och ett eget "Färg"-val.
   Ritningens vita bakgrund blir genomskinlig (multiplicera) så att lagren
   syns igenom varandra. Kräver att båda planerna är kalibrerade. */

const PDFOV_PREFIX = "pdfp:";
const pdfOverlayPlans = () => (typeof plans !== "undefined" && plan ? plans.filter(p => p.id !== plan.id && p.file_path) : []);
const pdfOverlayKey = p => PDFOV_PREFIX + p.id;
const pdfOverlayColor = key => layerState["pdfcolor:" + key] !== false; // färg från början

/* Affina matriser som i pdf.js: [a, b, c, d, e, f] → x' = a·x + c·y + e, y' = b·x + d·y + f. */
const affMul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const affInv = m => { const det = m[0] * m[3] - m[1] * m[2]; return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det]; };
/* Modell → PDF för en kalibrering (samma räkning som modelToPdf). */
function calibAffine(c) {
  const [m1, m2] = c.model, [p1, p2] = c.pdf;
  const mx = m2[0] - m1[0], my = m2[1] - m1[1], px = p2[0] - p1[0], py = p2[1] - p1[1], d = mx * mx + my * my;
  const ar = (px * mx + py * my) / d, ai = (py * mx - px * my) / d;
  return [ar, ai, -ai, ar, p1[0] - ar * m1[0] + ai * m1[1], p1[1] - ai * m1[0] - ar * m1[1]];
}
const pdfOverlayReady = p => !!(plan && plan.calib && p && p.calib);

function pdfOverlayCanvas(key) {
  let c = document.querySelector(`#stage canvas.pdfov[data-key="${CSS.escape(key)}"]`);
  if (!c) {
    c = document.createElement("canvas"); c.className = "pdfov"; c.dataset.key = key; c.width = 0;
    const after = $("pdfHiCanvas") || $("pdfCanvas");
    after.parentNode.insertBefore(c, after.nextSibling);
  }
  return c;
}
const pdfOvBusy = new Map(); // key -> löpnummer (en nyare ritning avbryter en äldre)
async function renderPdfOverlay(p) {
  const key = pdfOverlayKey(p), c = pdfOverlayCanvas(key), pc = $("pdfCanvas");
  if (!pdfOverlayReady(p) || !viewport || !pc.width) { c.width = 0; return; }
  const stamp = `${plan.id}:${pc.width}x${pc.height}:${JSON.stringify(p.calib)}:${JSON.stringify(plan.calib)}`;
  if (c.dataset.stamp === stamp && c.width) return;
  const seq = (pdfOvBusy.get(key) || 0) + 1; pdfOvBusy.set(key, seq);
  try {
    if (!pdfCache.has(p.id)) {
      const url = await ghReadBinaryUrl(token, p.file_path);
      pdfCache.set(p.id, await (await fetch(url)).arrayBuffer());
      URL.revokeObjectURL(url);
    }
    const doc = await pdfjsLib.getDocument({ data: pdfCache.get(p.id).slice(0) }).promise;
    const pg = await doc.getPage(Math.min(p.page || 1, doc.numPages));
    // B:s PDF → modell → A:s PDF → stage-px.
    const T = affMul(calibAffine(plan.calib), affInv(calibAffine(p.calib)));
    const toStage = affMul(viewport.transform, T);
    const k = Math.sqrt(Math.abs(toStage[0] * toStage[3] - toStage[1] * toStage[2])); // stage-px per PDF-enhet
    const base = pg.getViewport({ scale: 1 });
    const s = Math.max(0.2, Math.min(k, 5000 / Math.max(base.width, base.height)));
    const vb = pg.getViewport({ scale: s });
    const tmp = document.createElement("canvas"); tmp.width = Math.round(vb.width); tmp.height = Math.round(vb.height);
    const tctx = tmp.getContext("2d"); tctx.fillStyle = "#fff"; tctx.fillRect(0, 0, tmp.width, tmp.height);
    await pg.render({ canvasContext: tctx, viewport: vb, annotationMode: pdfjsLib.AnnotationMode.DISABLE }).promise;
    if (pdfOvBusy.get(key) !== seq) return;
    c.width = pc.width; c.height = pc.height;
    const ctx = c.getContext("2d");
    ctx.setTransform(...affMul(toStage, affInv(vb.transform)));
    ctx.drawImage(tmp, 0, 0);
    c.dataset.stamp = stamp;
  } catch (e) {
    c.width = 0;
    if (typeof setSaveStatus === "function") setSaveStatus(`⚠ Kunde inte visa PDF-lagret ${p.name || ""}: ${e.message}`);
  }
}
/* Synlighet, genomskinlighet, färg – och ritning när ett lager tänds. Anropas från applyLayerCss. */
function applyPdfOverlays() {
  const keep = new Set();
  pdfOverlayPlans().forEach(p => {
    const key = pdfOverlayKey(p); keep.add(key);
    ls(key, { visible: false });
    const on = layerVisible(key) && pdfOverlayReady(p);
    const c = on || document.querySelector(`#stage canvas.pdfov[data-key="${CSS.escape(key)}"]`) ? pdfOverlayCanvas(key) : null;
    if (!c) return;
    c.style.display = on ? "" : "none";
    c.style.opacity = layerOpacity(key);
    c.style.mixBlendMode = "multiply";
    c.style.filter = pdfOverlayColor(key) ? "" : "grayscale(1)";
    if (on) renderPdfOverlay(p); else if (c.width) { c.width = 0; delete c.dataset.stamp; } // släckt: frigör minnet
  });
  document.querySelectorAll("#stage canvas.pdfov").forEach(c => { if (!keep.has(c.dataset.key)) c.remove(); });
}
/* Lagerraden för en annan plans PDF. */
function pdfOverlayRowHtml(p, opts) {
  const key = pdfOverlayKey(p), ready = pdfOverlayReady(p);
  ls(key, { visible: false });
  return layerRow(key, `<span class="pdfov-name" title="${escHtml(p.name || "")}${ready ? "" : " – planen (eller den öppna planen) är inte kalibrerad och kan inte läggas på rätt ställe"}">📄 ${escHtml(p.name || "Plan")}</span>${ready ? "" : " <small>ej kalibrerad</small>"}`,
    { ...opts, extra: `<label class="blend"><input type="checkbox" class="lr-color"${pdfOverlayColor(key) ? " checked" : ""} /> Färg</label>` });
}
