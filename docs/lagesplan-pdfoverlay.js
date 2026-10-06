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
/* "Beskär inte" (Victors önskemål 2026-10-05): hela den andra ritningen visas, även utanför den öppna
   planens kant. Annars klipps lagret vid planens kant (standard). */
const pdfOverlayNoCrop = key => layerState["pdfnocrop:" + key] === true;
/* Lagrets yta i stage-px: den öppna planens yta, eller (beskär inte) hela den andra sidan. */
function pdfOverlayBounds(p, pg, toStage) {
  const pc = $("pdfCanvas");
  if (!pdfOverlayNoCrop(pdfOverlayKey(p))) return [0, 0, pc.width, pc.height];
  const [vx0, vy0, vx1, vy1] = pg.view;
  const pts = [[vx0, vy0], [vx1, vy0], [vx1, vy1], [vx0, vy1]].map(([x, y]) => [toStage[0] * x + toStage[2] * y + toStage[4], toStage[1] * x + toStage[3] * y + toStage[5]]);
  return [Math.floor(Math.min(...pts.map(q => q[0]))), Math.floor(Math.min(...pts.map(q => q[1]))), Math.ceil(Math.max(...pts.map(q => q[0]))), Math.ceil(Math.max(...pts.map(q => q[1])))];
}

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
    if (typeof applyLayerOrder === "function") applyLayerOrder(); // sin nivå i ritordningen
  }
  return c;
}
/* Sidan i en annan plans PDF (hämtas och tolkas en gång). */
const pdfOvPages = new Map(); // plan-id -> { file, page }
async function pdfOverlayPage(p) {
  const c = pdfOvPages.get(p.id);
  if (c && c.file === p.file_path && c.no === (p.page || 1)) return c.page;
  if (!pdfCache.has(p.id)) {
    const url = await ghReadBinaryUrl(token, p.file_path);
    pdfCache.set(p.id, await (await fetch(url)).arrayBuffer());
    URL.revokeObjectURL(url);
  }
  const doc = await pdfjsLib.getDocument({ data: pdfCache.get(p.id).slice(0) }).promise;
  const page = await doc.getPage(Math.min(p.page || 1, doc.numPages));
  pdfOvPages.set(p.id, { file: p.file_path, no: p.page || 1, page });
  return page;
}
const pdfOvToStage = p => affMul(viewport.transform, affMul(calibAffine(plan.calib), affInv(calibAffine(p.calib))));
const pdfOvBusy = new Map(); // key -> löpnummer (en nyare ritning avbryter en äldre)
async function renderPdfOverlay(p) {
  const key = pdfOverlayKey(p), c = pdfOverlayCanvas(key), pc = $("pdfCanvas");
  if (!pdfOverlayReady(p) || !viewport || !pc.width) { c.width = 0; return; }
  const stamp = `${plan.id}:${pc.width}x${pc.height}:${JSON.stringify(p.calib)}:${JSON.stringify(plan.calib)}:${pdfOverlayNoCrop(key)}`;
  if (c.dataset.stamp === stamp && c.width) return;
  const seq = (pdfOvBusy.get(key) || 0) + 1; pdfOvBusy.set(key, seq);
  try {
    const pg = await pdfOverlayPage(p);
    const toStage = pdfOvToStage(p); // B:s PDF → modell → A:s PDF → stage-px
    const k = Math.sqrt(Math.abs(toStage[0] * toStage[3] - toStage[1] * toStage[2])); // stage-px per PDF-enhet
    const base = pg.getViewport({ scale: 1 });
    const s = Math.max(0.2, Math.min(k, 5000 / Math.max(base.width, base.height)));
    const vb = pg.getViewport({ scale: s });
    const tmp = document.createElement("canvas"); tmp.width = Math.round(vb.width); tmp.height = Math.round(vb.height);
    const tctx = tmp.getContext("2d"); tctx.fillStyle = "#fff"; tctx.fillRect(0, 0, tmp.width, tmp.height);
    await pg.render({ canvasContext: tctx, viewport: vb, annotationMode: pdfjsLib.AnnotationMode.DISABLE }).promise;
    if (pdfOvBusy.get(key) !== seq) return;
    const [bx0, by0, bx1, by1] = pdfOverlayBounds(p, pg, toStage), bw = bx1 - bx0, bh = by1 - by0;
    const q = Math.min(1, 8000 / Math.max(bw, bh)); // canvas-px per stage-px (tak för mycket stora ytor)
    c.width = Math.max(1, Math.round(bw * q)); c.height = Math.max(1, Math.round(bh * q));
    Object.assign(c.style, { left: `${bx0}px`, top: `${by0}px`, width: `${bw}px`, height: `${bh}px` });
    const ctx = c.getContext("2d");
    ctx.setTransform(...affMul([q, 0, 0, q, -bx0 * q, -by0 * q], affMul(toStage, affInv(vb.transform))));
    ctx.drawImage(tmp, 0, 0);
    c.dataset.stamp = stamp;
    scheduleOverlayHi();
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
    const hi = pdfOverlayHi(key, false);
    if (hi) Object.assign(hi.style, { opacity: c.style.opacity, filter: c.style.filter, mixBlendMode: "multiply" });
    if (on) renderPdfOverlay(p);
    else { if (c.width) { c.width = 0; delete c.dataset.stamp; } if (hi) hi.remove(); c.style.visibility = ""; } // släckt: frigör minnet
  });
  document.querySelectorAll("#stage canvas.pdfov, #stage canvas.pdfovhi").forEach(c => { if (!keep.has(c.dataset.key)) c.remove(); });
}
/* Lagerraden för en annan plans PDF. */
function pdfOverlayRowHtml(p, opts) {
  const key = pdfOverlayKey(p), ready = pdfOverlayReady(p);
  ls(key, { visible: false });
  return layerRow(key, `<span class="pdfov-name" title="${escHtml(p.name || "")}${ready ? "" : " – planen (eller den öppna planen) är inte kalibrerad och kan inte läggas på rätt ställe"}">📄 ${escHtml(p.name || "Plan")}</span>${ready ? "" : " <small>ej kalibrerad</small>"}`,
    { ...opts, extra: `<label class="blend"><input type="checkbox" class="lr-color"${pdfOverlayColor(key) ? " checked" : ""} /> Färg</label><label class="blend" title="Visa hela ritningen, även utanför den öppna planens kant"><input type="checkbox" class="lr-nocrop"${pdfOverlayNoCrop(key) ? " checked" : ""} /> Beskär inte</label>` });
}

/* Full skärpa vid inzoomning (Victors önskemål 2026-10-05), som för den öppna planen: när zoomen
   stannat ritas den synliga delen av varje tänt PDF-lager om i skärmens upplösning. Fungerar även
   när lagrets plan är roterad eller har annan skala: den del av sidan som syns renderas i sin egen
   riktning och läggs sedan på plats. Under panorering visas den vanliga bilden. */
function pdfOverlayHi(key, create = true) {
  let h = document.querySelector(`#stage canvas.pdfovhi[data-key="${CSS.escape(key)}"]`);
  if (!h && create) {
    h = document.createElement("canvas"); h.className = "pdfovhi"; h.dataset.key = key; h.width = 0;
    const lo = pdfOverlayCanvas(key); lo.parentNode.insertBefore(h, lo.nextSibling);
    h.style.zIndex = lo.style.zIndex;
  }
  return h;
}
let pdfOvHiTimer = 0, pdfOvHiSeq = 0;
const pdfOvHiTasks = new Map();
function scheduleOverlayHi() {
  clearTimeout(pdfOvHiTimer);
  // Under panorering/zoom: den vanliga bilden syns, den skarpa göms tills den ritats om.
  document.querySelectorAll("#stage canvas.pdfovhi").forEach(h => { h.style.display = "none"; });
  document.querySelectorAll("#stage canvas.pdfov").forEach(c => { c.style.visibility = ""; });
  pdfOvHiTimer = setTimeout(renderOverlaysHi, 160);
}
function renderOverlaysHi() {
  const seq = ++pdfOvHiSeq;
  pdfOverlayPlans().forEach(p => { const key = pdfOverlayKey(p); if (layerVisible(key) && pdfOverlayReady(p)) renderOverlayHi(p, seq); });
}
async function renderOverlayHi(p, seq) {
  const key = pdfOverlayKey(p), lo = pdfOverlayCanvas(key), pc = $("pdfCanvas");
  if (!viewport || !pc.width || !lo.width) return;
  let s = view.scale * (window.devicePixelRatio || 1);
  if (s <= 1.05) { const h = pdfOverlayHi(key, false); if (h) h.width = 0; lo.style.visibility = ""; return; }
  try {
    const pg = await pdfOverlayPage(p);
    if (seq !== pdfOvHiSeq) return;
    const toStage = pdfOvToStage(p), fromStage = affInv(toStage);
    const vb = visibleStageBox(), [ox0, oy0, ox1, oy1] = pdfOverlayBounds(p, pg, toStage);
    const x0 = Math.max(ox0, vb[0]), y0 = Math.max(oy0, vb[1]), x1 = Math.min(ox1, vb[2]), y1 = Math.min(oy1, vb[3]);
    if (x1 <= x0 || y1 <= y0) return;
    const maxPx = 30e6;
    if ((x1 - x0) * (y1 - y0) * s * s > maxPx) s = Math.sqrt(maxPx / ((x1 - x0) * (y1 - y0)));
    const cw = Math.ceil((x1 - x0) * s), ch = Math.ceil((y1 - y0) * s);
    const k = Math.sqrt(Math.abs(toStage[0] * toStage[3] - toStage[1] * toStage[2]));
    // Den synliga delen i lagrets egen PDF (en rotation gör rutan större), begränsad till sidan.
    const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => [fromStage[0] * x + fromStage[2] * y + fromStage[4], fromStage[1] * x + fromStage[3] * y + fromStage[5]]);
    const [vx0, vy0, vx1, vy1] = pg.view;
    const bx0 = Math.max(vx0, Math.min(...pts.map(q => q[0]))), bx1 = Math.min(vx1, Math.max(...pts.map(q => q[0])));
    const by0 = Math.max(vy0, Math.min(...pts.map(q => q[1]))), by1 = Math.min(vy1, Math.max(...pts.map(q => q[1])));
    if (bx1 <= bx0 || by1 <= by0) return;
    let sB = s * k;
    if ((bx1 - bx0) * (by1 - by0) * sB * sB > maxPx) sB = Math.sqrt(maxPx / ((bx1 - bx0) * (by1 - by0)));
    const full = pg.getViewport({ scale: sB });
    const cr = [[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]].map(([x, y]) => full.convertToViewportPoint(x, y));
    const rx0 = Math.floor(Math.min(...cr.map(q => q[0]))), ry0 = Math.floor(Math.min(...cr.map(q => q[1])));
    const rw = Math.ceil(Math.max(...cr.map(q => q[0]))) - rx0, rh = Math.ceil(Math.max(...cr.map(q => q[1]))) - ry0;
    const part = pg.getViewport({ scale: sB, offsetX: -rx0, offsetY: -ry0 });
    const tmpB = document.createElement("canvas"); tmpB.width = rw; tmpB.height = rh;
    const bctx = tmpB.getContext("2d"); bctx.fillStyle = "#fff"; bctx.fillRect(0, 0, rw, rh);
    const prev = pdfOvHiTasks.get(key); if (prev) { try { prev.cancel(); } catch (e) {} }
    const task = pg.render({ canvasContext: bctx, viewport: part, annotationMode: pdfjsLib.AnnotationMode.DISABLE });
    pdfOvHiTasks.set(key, task);
    try { await task.promise; } catch (e) { return; } // avbruten av en nyare
    if (seq !== pdfOvHiSeq || !layerVisible(key)) return;
    const h = pdfOverlayHi(key);
    h.width = cw; h.height = ch;
    const hctx = h.getContext("2d");
    hctx.setTransform(...affMul([s, 0, 0, s, -x0 * s, -y0 * s], affMul(toStage, affInv(part.transform))));
    hctx.drawImage(tmpB, 0, 0);
    Object.assign(h.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px`,
      display: lo.style.display, opacity: lo.style.opacity, filter: lo.style.filter, mixBlendMode: "multiply" });
    lo.style.visibility = "hidden"; // den skarpa täcker det synliga – dölj den grövre (annars dubbelt mörk)
  } catch (e) { /* den vanliga bilden finns kvar */ }
}

/* Utskriften (Victors rapport 2026-10-06: "kan inte välja andra PDF-lager än Bas i utskriftslayout"):
   ett tänt PDF-lager ritas i ritningsytans bild – den del som syns, i bildens upplösning, multiplicerat
   ovanpå Bas-ritningen och klippt vid dess kant (om inte "Beskär inte"). P = mapPlate (canvas = S·(stage − x0)).
   I vektor-PDF:en bäddas lagret i stället in som vektorer (lagesplan-vecpdf.js). */
async function drawPdfOverlayForExport(ctx, p, P) {
  const key = pdfOverlayKey(p), pg = await pdfOverlayPage(p), pc = $("pdfCanvas");
  const stageToCanvas = [P.S, 0, 0, P.S, -P.x0 * P.S, -P.y0 * P.S];
  const toCanvas = affMul(stageToCanvas, pdfOvToStage(p)), inv = affInv(toCanvas);
  const k = Math.sqrt(Math.abs(toCanvas[0] * toCanvas[3] - toCanvas[1] * toCanvas[2])); // canvas-px per PDF-enhet
  const pts = [[0, 0], [P.W, 0], [P.W, P.H], [0, P.H]].map(([x, y]) => [inv[0] * x + inv[2] * y + inv[4], inv[1] * x + inv[3] * y + inv[5]]);
  const [vx0, vy0, vx1, vy1] = pg.view;
  const bx0 = Math.max(vx0, Math.min(...pts.map(q => q[0]))), bx1 = Math.min(vx1, Math.max(...pts.map(q => q[0])));
  const by0 = Math.max(vy0, Math.min(...pts.map(q => q[1]))), by1 = Math.min(vy1, Math.max(...pts.map(q => q[1])));
  if (bx1 <= bx0 || by1 <= by0) return;
  let sB = k;
  const maxPx = 40e6;
  if ((bx1 - bx0) * (by1 - by0) * sB * sB > maxPx) sB = Math.sqrt(maxPx / ((bx1 - bx0) * (by1 - by0)));
  const full = pg.getViewport({ scale: sB });
  const cr = [[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1]].map(([x, y]) => full.convertToViewportPoint(x, y));
  const rx0 = Math.floor(Math.min(...cr.map(q => q[0]))), ry0 = Math.floor(Math.min(...cr.map(q => q[1])));
  const rw = Math.max(1, Math.ceil(Math.max(...cr.map(q => q[0]))) - rx0), rh = Math.max(1, Math.ceil(Math.max(...cr.map(q => q[1]))) - ry0);
  const part = pg.getViewport({ scale: sB, offsetX: -rx0, offsetY: -ry0 });
  const tmp = document.createElement("canvas"); tmp.width = rw; tmp.height = rh;
  const tctx = tmp.getContext("2d"); tctx.fillStyle = "#fff"; tctx.fillRect(0, 0, rw, rh);
  await pg.render({ canvasContext: tctx, viewport: part, annotationMode: pdfjsLib.AnnotationMode.DISABLE }).promise;
  ctx.save();
  if (!pdfOverlayNoCrop(key)) { ctx.beginPath(); ctx.rect(-P.x0 * P.S, -P.y0 * P.S, pc.width * P.S, pc.height * P.S); ctx.clip(); }
  ctx.globalAlpha = layerOpacity(key);
  ctx.globalCompositeOperation = "multiply";
  if (!pdfOverlayColor(key)) ctx.filter = "grayscale(1)";
  ctx.setTransform(...affMul(toCanvas, affInv(part.transform)));
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();
}
/* De tända PDF-lagren just nu (anropas medan ritningsytans lagerval är aktivt). */
function pdfOverlaysForPrint() {
  return pdfOverlayPlans().filter(p => layerVisible(pdfOverlayKey(p)) && pdfOverlayReady(p))
    .map(p => ({ p, id: p.id, opacity: layerOpacity(pdfOverlayKey(p)), color: pdfOverlayColor(pdfOverlayKey(p)), noCrop: pdfOverlayNoCrop(pdfOverlayKey(p)) }));
}
