/* Lägesplan – utskriftslayout (Victors önskemål 2026-09-29).
   Ett ritningsblad (A3/A1 liggande) med fritt placerade element: karta i
   skala, text, bilder (loggor), förklaring, skalstock, norrpil, QR-kod,
   ritningshuvud, rutor och linjer. Mallarna sparas i projektet
   ({ type: "printtpl" } i site_layers.json), bilderna i 4D-data/print/.
   Mått lagras i mm på ett A3-blad (420×297) och skalas till A1. Text,
   rutor och ritningshuvud blir vektorer i PDF:en; kartan renderas i hög
   upplösning (ortofoto ur rutorna i full upplösning). */

const QR_URL = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
const PAGE_A3 = [420, 297];
const PRINT_FORMATS = { A3: { w: 420, h: 297, dpi: 200 }, A1: { w: 841, h: 594, dpi: 150 } };
const PRINT_SCALES = [100, 200, 250, 400, 500, 1000, 1500, 2000, 2500, 4000, 5000, 10000];
const PT_MM = 0.3528;
const ELEMENT_TYPES = {
  text: { label: "Text", icon: "🔤" },
  image: { label: "Bild", icon: "🖼" },
  map: { label: "Karta", icon: "🗺" },
  legend: { label: "Förklaring", icon: "📋" },
  scalebar: { label: "Skalstock", icon: "📏" },
  north: { label: "Norrpil", icon: "🧭" },
  qr: { label: "QR-kod", icon: "▦" },
  title: { label: "Ritningshuvud", icon: "🗂" },
  rect: { label: "Ruta", icon: "▭" },
  line: { label: "Linje", icon: "╱" },
};

const printTpls = () => siteItems.filter(x => x.type === "printtpl").sort((a, b) => (a.name || "").localeCompare(b.name || "", "sv"));
let pr = null; // editorns tillstånd: { tpl, sel, dirty, undo: [], redo: [], view: { k, ox, oy }, drag, pan }

// ---------------------------------------------------------------------
// Standardmall (i stil med en APD-plan)
// ---------------------------------------------------------------------
function defaultTemplate() {
  const id = () => ghNewId();
  const cx = viewCenterModel();
  return {
    id: ghNewId(), type: "printtpl", name: "Standard", format: "A3", frame: { on: true, margin: 8, ticks: true },
    elements: [
      { id: id(), type: "map", x: 8, y: 8, w: 404, h: 212, scale: fitScale(404, 212, "A3"), center: cx, border: true },
      { id: id(), type: "north", x: 388, y: 12, w: 20, h: 20 },
      { id: id(), type: "rect", x: 8, y: 220, w: 404, h: 69, stroke: "#000000", lw: 0.35, fill: "" },
      { id: id(), type: "text", x: 12, y: 223, w: 80, h: 40, text: "REFERENSER\n{plan}", size: 7, bold: false, align: "left", color: "#000000" },
      { id: id(), type: "legend", x: 95, y: 223, w: 150, h: 62, title: "FÖRKLARINGAR", cols: 2, size: 7, phases: true, site: true, cad: false, extra: "" },
      { id: id(), type: "scalebar", x: 250, y: 268, w: 74, h: 16 },
      { id: id(), type: "title", x: 327, y: 220, w: 85, h: 69, size: 7, rows: [
        "STATUS: INFORMATION", "HANDLING: LÄGESPLAN", "DATUM: {idag} | UPPRÄTTAD AV: {användare}",
        "PROJEKTNAMN: {plan}", "OMRÅDE: ", "PROJEKTNUMMER: | ADRESS: ", "FÖRETAG: NCC",
        "SKALA: {skala} | FORMAT: {format}", "RITNINGSNUMMER: "].join("\n") },
    ],
  };
}
function viewCenterModel() {
  if (!viewport || !plan || !plan.calib) return [0, 0];
  const vr = $("viewport").getBoundingClientRect();
  const m = pdfToModel(toPdf([(vr.width / 2 - view.tx) / view.scale, (vr.height / 2 - view.ty) / view.scale]));
  return [Math.round(m[0] * 100) / 100, Math.round(m[1] * 100) / 100];
}
/* Minsta standardskala där det som syns på skärmen ryms i kartans ram. */
function fitScale(wA3, hA3, format) {
  if (!viewport || !plan || !plan.calib) return 1000;
  const k = PRINT_FORMATS[format].w / PAGE_A3[0];
  const vr = $("viewport").getBoundingClientRect(), ppm = pxPerMeter();
  const wm = vr.width / view.scale / ppm, hm = vr.height / view.scale / ppm;
  const need = Math.max(wm * 1000 / (wA3 * k), hm * 1000 / (hA3 * k));
  return PRINT_SCALES.find(s => s >= need) || PRINT_SCALES[PRINT_SCALES.length - 1];
}

// ---------------------------------------------------------------------
// Platshållare i texter
// ---------------------------------------------------------------------
function fillText(s, tpl) {
  const now = new Date();
  const map = tpl.elements.find(e => e.type === "map");
  const vals = {
    plan: plan ? plan.name : "", datum: $("dateInput").value || todayIso(), idag: todayIso(),
    utskriven: `${isoOf(now)} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    skala: map ? `1:${map.scale}` : "", format: tpl.format, "användare": settings.userName || "", projekt: projectId || "",
  };
  return String(s || "").replace(/\{([a-zåäö]+)\}/gi, (m, k) => (k.toLowerCase() in vals ? vals[k.toLowerCase()] : m));
}

// ---------------------------------------------------------------------
// Bilder och QR
// ---------------------------------------------------------------------
const printImgs = new Map(); // path -> HTMLImageElement | Promise
function printImage(path) {
  const hit = printImgs.get(path);
  if (hit && !(hit instanceof Promise)) return hit;
  if (!hit) printImgs.set(path, ghReadBinaryUrl(token, path).then(url => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; }))
    .then(im => { printImgs.set(path, im); if (pr) drawPrintPage(); return im; })
    .catch(e => { printImgs.delete(path); console.warn("Kunde inte hämta bilden", path, e); }));
  return null;
}
async function uploadPrintImage(file) {
  const ext = (file.name.match(/\.(png|jpe?g|webp|svg)$/i) || [0, "png"])[1].toLowerCase();
  const path = dataPath(`print/${ghNewId()}.${ext}`);
  setPrintStatus("Laddar upp bilden…");
  await ghUploadBinary(token, path, file, `Lägesplan: bild ${file.name}`);
  const url = URL.createObjectURL(file);
  const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Bilden kunde inte läsas")); i.src = url; });
  printImgs.set(path, im);
  setPrintStatus("");
  return { path, ar: im.naturalWidth / im.naturalHeight || 1, name: file.name };
}
let qrReady = null;
function qrMatrix(text) {
  if (!window.qrcode) { if (!qrReady) qrReady = loadScript(QR_URL).then(() => { if (pr) drawPrintPage(); }).catch(() => {}); return null; }
  try {
    if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs["UTF-8"]) qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
    const q = qrcode(0, "M"); q.addData(String(text || " ")); q.make();
    const n = q.getModuleCount(), m = [];
    for (let r = 0; r < n; r++) { m.push([]); for (let c = 0; c < n; c++) m[r].push(q.isDark(r, c)); }
    return m;
  } catch (e) { return null; }
}

// ---------------------------------------------------------------------
// Kartan
// ---------------------------------------------------------------------
/* Kartans utsnitt i stage-px för en karta med bredd/höjd i mm på bladet. */
function mapPlate(el, wMm, hMm, pxW, pxH) {
  const ppm = pxPerMeter();
  const mPerMm = el.scale / 1000;
  const S = pxW / (wMm * mPerMm * ppm); // canvas-px per stage-px
  const c = mToPx(el.center || [0, 0]);
  return { W: pxW, H: pxH, S, x0: c[0] - pxW / S / 2, y0: c[1] - pxH / S / 2, outside: true, ortho: new Map() };
}
/* Ritar kartan (ortofoton, ritning, CAD, zoner, etablering) i en canvas. */
async function renderMapCanvas(el, wMm, hMm, pxW, pxH, opts = {}) {
  const P = mapPlate(el, wMm, hMm, pxW, pxH);
  P.noTiles = !!opts.preview;
  const out = newCanvas(pxW, pxH), ctx = out.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, pxW, pxH);
  if (!plan || !plan.calib || !viewport) return out;
  for (const o of orthosByDate().filter(x => ls("ortho:" + x.id).visible)) {
    try {
      const plate = await buildOrthoPlate(o, P, s => opts.status && opts.status(`ortofoto – ${s}`));
      ctx.globalAlpha = layerOpacity("ortho:" + o.id); ctx.drawImage(plate, 0, 0); ctx.globalAlpha = 1;
    } catch (e) { console.warn("Ortofoto i utskriften", e); }
  }
  if (layerVisible("pdf")) {
    opts.status && opts.status("ritningen");
    const pdfPlate = await buildPdfPlate(P);
    ctx.save(); ctx.globalAlpha = layerOpacity("pdf");
    if (orthos().some(o => ls("ortho:" + o.id).visible) && layerState.pdfMultiply !== false) ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(pdfPlate, 0, 0); ctx.restore();
  }
  P.overlay = newCanvas(pxW, pxH);
  renderFilmOverlay(P, { cad: true, zones: true, site: true });
  ctx.drawImage(P.overlay, 0, 0);
  return out;
}
const mapPreviews = new Map(); // el.id -> { key, canvas }
let mapPreviewTimer = 0;
function mapPreview(el, wPx, hPx) {
  const key = JSON.stringify([el.scale, el.center, el.w, el.h, Math.round(wPx), $("dateInput").value, pr && pr.tpl.format]);
  const hit = mapPreviews.get(el.id);
  if (!hit || hit.key !== key) {
    clearTimeout(mapPreviewTimer);
    mapPreviewTimer = setTimeout(async () => {
      const k = PRINT_FORMATS[pr.tpl.format].w / PAGE_A3[0];
      const c = await renderMapCanvas(el, el.w * k, el.h * k, Math.max(50, Math.round(wPx)), Math.max(50, Math.round(hPx)), { preview: true });
      mapPreviews.set(el.id, { key, canvas: c });
      if (pr) drawPrintPage();
    }, 120);
  }
  return hit ? hit.canvas : null;
}

// ---------------------------------------------------------------------
// Rita element i en canvas (förhandsvisning och rasterdelar i PDF:en)
// k = mm på bladet per mm i mallen (A3 -> 1, A1 -> 2), u = canvas-px per mm på bladet
// ---------------------------------------------------------------------
function wrapLines(ctx, text, maxW) {
  const out = [];
  String(text).split("\n").forEach(par => {
    const words = par.split(/(\s+)/);
    let line = "";
    words.forEach(w => {
      const t = line + w;
      if (line && ctx.measureText(t.trimEnd()).width > maxW) { out.push(line.trimEnd()); line = w.trimStart(); }
      else line = t;
    });
    out.push(line.trimEnd());
  });
  return out;
}
function drawElement(ctx, el, tpl, u, k, opts = {}) {
  const X = el.x * k * u, Y = el.y * k * u, W = el.w * k * u, H = el.h * k * u;
  const pt = s => s * k * PT_MM * u; // punkter i mallen -> px
  ctx.save();
  switch (el.type) {
    case "map": {
      const c = opts.mapCanvas || mapPreview(el, W, H);
      if (c) ctx.drawImage(c, X, Y, W, H);
      else { ctx.fillStyle = "#eef2f7"; ctx.fillRect(X, Y, W, H); ctx.fillStyle = "#64748b"; ctx.font = `${pt(10)}px Helvetica, Arial`; ctx.textAlign = "center"; ctx.fillText("Kartan ritas…", X + W / 2, Y + H / 2); }
      if (el.border !== false) { ctx.strokeStyle = "#000"; ctx.lineWidth = Math.max(1, 0.35 * k * u); ctx.strokeRect(X, Y, W, H); }
      break;
    }
    case "text": {
      if (el.fill) { ctx.fillStyle = el.fill; ctx.fillRect(X, Y, W, H); }
      if (el.border) { ctx.strokeStyle = el.border; ctx.lineWidth = Math.max(1, 0.3 * k * u); ctx.strokeRect(X, Y, W, H); }
      const fs = pt(el.size || 10), pad = 1.2 * k * u;
      ctx.font = `${el.bold ? "bold " : ""}${fs}px Helvetica, Arial, sans-serif`;
      ctx.fillStyle = el.color || "#000"; ctx.textBaseline = "top";
      ctx.textAlign = el.align || "left";
      const tx = el.align === "center" ? X + W / 2 : el.align === "right" ? X + W - pad : X + pad;
      ctx.beginPath(); ctx.rect(X, Y, W, H); ctx.clip();
      wrapLines(ctx, fillText(el.text, tpl), W - 2 * pad).forEach((ln, i) => ctx.fillText(ln, tx, Y + pad + i * fs * 1.2));
      break;
    }
    case "image": {
      const im = el.path ? printImage(el.path) : null;
      if (im) {
        const ar = im.naturalWidth / im.naturalHeight || 1;
        let w = W, h = W / ar; if (h > H) { h = H; w = H * ar; }
        ctx.drawImage(im, X + (W - w) / 2, Y + (H - h) / 2, w, h);
      } else if (opts.editor) { ctx.fillStyle = "#f1f5f9"; ctx.fillRect(X, Y, W, H); ctx.fillStyle = "#64748b"; ctx.font = `${pt(9)}px Helvetica, Arial`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(el.path ? "Laddar bild…" : "Välj bild i panelen", X + W / 2, Y + H / 2); }
      break;
    }
    case "rect": {
      if (el.fill) { ctx.fillStyle = el.fill; ctx.fillRect(X, Y, W, H); }
      if (el.stroke) { ctx.strokeStyle = el.stroke; ctx.lineWidth = Math.max(0.5, (el.lw || 0.35) * k * u); ctx.strokeRect(X, Y, W, H); }
      break;
    }
    case "line": {
      ctx.strokeStyle = el.stroke || "#000"; ctx.lineWidth = Math.max(0.5, (el.lw || 0.35) * k * u);
      ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + W, Y + H); ctx.stroke();
      break;
    }
    case "north": {
      const mapEl = tpl.elements.find(e => e.type === "map");
      let a = 0;
      if (plan && plan.calib && mapEl) { const c = mapEl.center || [0, 0], p0 = mToPx(c), p1 = mToPx([c[0], c[1] + 1]); a = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) + Math.PI / 2; }
      const r = Math.min(W, H) / 2, cx = X + W / 2, cy = Y + H / 2;
      ctx.translate(cx, cy); ctx.rotate(a);
      ctx.lineWidth = Math.max(1, r * 0.04); ctx.strokeStyle = "#000";
      // Kompassros: fyra spetsar, norr fylld
      [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx, dy], i) => {
        const L = i === 0 ? r * 0.82 : r * 0.62, s = r * 0.14;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(dx * L, dy * L); ctx.lineTo(dx * s - dy * s, dy * s + dx * s); ctx.closePath();
        ctx.fillStyle = "#000"; ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(dx * L, dy * L); ctx.lineTo(dx * s + dy * s, dy * s - dx * s); ctx.closePath();
        ctx.fillStyle = "#fff"; ctx.fill(); ctx.stroke();
      });
      ctx.fillStyle = "#000"; ctx.font = `bold ${r * 0.26}px Helvetica, Arial`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
      ctx.fillText("N", 0, -r * 0.84);
      break;
    }
    case "scalebar": {
      const mapEl = tpl.elements.find(e => e.type === "map");
      const N = mapEl ? mapEl.scale : 1000;
      const mmPerM = 1000 / N; // mm på bladet per meter
      const maxM = (el.w * k * 0.92) / mmPerM;
      const pow = Math.pow(10, Math.floor(Math.log10(maxM)));
      const L = [5, 2, 1].map(f => f * pow).find(v => v <= maxM) || pow;
      const segs = L / pow === 2 ? 4 : 5;
      const barW = L * mmPerM * u, barH = Math.max(2, H * 0.14), bx = X, by = Y + H * 0.36;
      const fs = Math.min(H * 0.2, pt(7));
      ctx.font = `${fs}px Helvetica, Arial`; ctx.fillStyle = "#000"; ctx.textBaseline = "bottom"; ctx.textAlign = "left";
      ctx.fillText(`SKALA 1:${N}`, bx, by - fs * 0.6);
      for (let i = 0; i < segs; i++) { ctx.fillStyle = i % 2 ? "#fff" : "#000"; ctx.fillRect(bx + barW * i / segs, by, barW / segs, barH); }
      ctx.strokeStyle = "#000"; ctx.lineWidth = Math.max(0.5, 0.2 * k * u); ctx.strokeRect(bx, by, barW, barH);
      ctx.textBaseline = "top"; ctx.fillStyle = "#000";
      for (let i = 0; i <= segs; i++) { ctx.textAlign = i === 0 ? "left" : i === segs ? "right" : "center"; ctx.fillText(String(Math.round(L * i / segs * 100) / 100), bx + barW * i / segs, by + barH + fs * 0.2); }
      ctx.textAlign = "left"; ctx.fillText("METER", bx, by + barH + fs * 1.4);
      break;
    }
    case "qr": {
      const m = qrMatrix(el.text);
      ctx.fillStyle = "#fff"; ctx.fillRect(X, Y, W, H);
      if (!m) break;
      const n = m.length, q = 2, cell = Math.min(W, H) / (n + 2 * q);
      const ox = X + (W - cell * (n + 2 * q)) / 2 + cell * q, oy = Y + (H - cell * (n + 2 * q)) / 2 + cell * q;
      ctx.fillStyle = "#000";
      m.forEach((row, r) => row.forEach((d, c) => { if (d) ctx.fillRect(ox + c * cell, oy + r * cell, cell + 0.4, cell + 0.4); }));
      break;
    }
    case "legend": drawLegend(ctx, el, X, Y, W, H, pt); break;
    case "title": drawTitleBlock(ctx, el, tpl, X, Y, W, H, pt, k, u); break;
  }
  ctx.restore();
}
/* Förklaringens rader: faser, etablering som finns på planen, CAD, egna. */
function legendItems(el) {
  const items = [];
  if (el.phases) PHASE_ORDER.forEach(ph => items.push({ kind: "box", color: ph === "ingen" ? "#ffffff" : phaseColor(ph), dashed: ph === "ingen", label: PHASE_LABELS[ph] }));
  if (el.site) {
    const seen = new Set();
    siteItems.filter(siteShown).forEach(x => {
      const key = x.type === "symbol" ? "sym:" + x.sym : x.type + "|" + (x.color || "") + "|" + (x.dash || "");
      if (seen.has(key)) return; seen.add(key);
      const st = siteStyle(x, 10);
      const label = x.type === "symbol" ? (SYMBOLS[x.sym] || {}).label || "Symbol" : SITE_KINDS[x.type].label;
      const kind = { fence: "line", route: "route", barrier: "area", shed: "area", storage: "area", symbol: "area", crane: "circle", gate: "line", note: "note" }[x.type];
      items.push({ kind, color: st.color, dash: x.dash || SITE_DEFAULT_DASH[x.type], label });
    });
  }
  if (el.cad && typeof cads === "function") cads().filter(r => ls("cad:" + r.id).visible).forEach(r => items.push({ kind: "line", color: r.colorMode === "mono" ? r.color : "#111827", dash: "solid", label: r.name }));
  String(el.extra || "").split("\n").map(s => s.trim()).filter(Boolean).forEach(s => {
    const m = s.match(/^(#[0-9a-f]{6})\s+(.*)$/i);
    items.push(m ? { kind: "box", color: m[1], label: m[2] } : { kind: "text", label: s });
  });
  return items;
}
function drawLegend(ctx, el, X, Y, W, H, pt) {
  const fs = pt(el.size || 7), lh = fs * 1.7;
  ctx.fillStyle = "#000"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  let top = Y;
  if (el.title) { ctx.font = `bold ${fs * 1.15}px Helvetica, Arial`; ctx.fillText(el.title, X, top + fs * 0.7); ctx.fillRect(X, top + fs * 1.45, ctx.measureText(el.title).width, Math.max(0.5, fs * 0.06)); top += lh * 1.2; }
  ctx.font = `${fs}px Helvetica, Arial`;
  const items = legendItems(el), cols = Math.max(1, el.cols || 1), colW = W / cols;
  const perCol = Math.max(1, Math.floor((Y + H - top) / lh));
  items.forEach((it, i) => {
    const col = Math.floor(i / perCol); if (col >= cols) return;
    const x = X + col * colW, y = top + (i % perCol) * lh + lh / 2, sw = fs * 2.6, sh = fs * 0.95;
    ctx.save();
    ctx.strokeStyle = it.color || "#000"; ctx.fillStyle = it.color || "#000"; ctx.lineWidth = Math.max(0.8, fs * 0.13);
    const dash = it.dash === "dashed" ? [fs * 0.45, fs * 0.3] : it.dash === "dotted" ? [fs * 0.08, fs * 0.25] : [];
    if (it.kind === "box") { ctx.fillRect(x, y - sh / 2, sw, sh); ctx.strokeStyle = "#555"; ctx.lineWidth = Math.max(0.5, fs * 0.06); if (it.dashed) ctx.setLineDash([fs * 0.25, fs * 0.2]); ctx.strokeRect(x, y - sh / 2, sw, sh); }
    else if (it.kind === "area") { ctx.globalAlpha = 0.25; ctx.fillRect(x, y - sh / 2, sw, sh); ctx.globalAlpha = 1; ctx.setLineDash(dash); ctx.strokeRect(x, y - sh / 2, sw, sh); }
    else if (it.kind === "line" || it.kind === "route") { ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sw, y); ctx.stroke(); if (it.kind === "route") { ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(x + sw, y); ctx.lineTo(x + sw - fs * 0.5, y - fs * 0.3); ctx.lineTo(x + sw - fs * 0.5, y + fs * 0.3); ctx.fill(); } }
    else if (it.kind === "circle") { ctx.setLineDash(dash); ctx.beginPath(); ctx.arc(x + sw / 2, y, sh * 0.55, 0, Math.PI * 2); ctx.stroke(); }
    else if (it.kind === "note") { ctx.fillStyle = "#fffbe6"; ctx.fillRect(x, y - sh / 2, sw, sh); ctx.strokeRect(x, y - sh / 2, sw, sh); }
    ctx.restore();
    ctx.fillStyle = "#000";
    ctx.fillText(it.kind === "text" ? it.label : "= " + it.label, it.kind === "text" ? x : x + sw + fs * 0.5, y, colW - sw - fs);
  });
}
function titleRows(el, tpl) {
  return String(el.rows || "").split("\n").map(r => r.split("|").map(c => { const i = c.indexOf(":"); return i >= 0 ? [c.slice(0, i).trim(), fillText(c.slice(i + 1).trim(), tpl)] : ["", fillText(c.trim(), tpl)]; }));
}
function drawTitleBlock(ctx, el, tpl, X, Y, W, H, pt, k, u) {
  const rows = titleRows(el, tpl);
  if (!rows.length) return;
  const rh = H / rows.length, fs = pt(el.size || 7);
  ctx.strokeStyle = "#000"; ctx.lineWidth = Math.max(0.5, 0.25 * k * u);
  ctx.strokeRect(X, Y, W, H);
  rows.forEach((cells, r) => {
    const y = Y + r * rh;
    if (r) { ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X + W, y); ctx.stroke(); }
    cells.forEach(([lab, val], c) => {
      const cw = W / cells.length, x = X + c * cw;
      if (c) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + rh); ctx.stroke(); }
      ctx.fillStyle = "#000"; ctx.textAlign = "left"; ctx.textBaseline = "top";
      const lf = Math.min(fs * 0.62, rh * 0.3);
      if (lab) { ctx.font = `${lf}px Helvetica, Arial`; ctx.fillText(lab, x + lf * 0.4, y + lf * 0.25, cw - lf); }
      const vf = Math.min(fs * 1.25, rh * (lab ? 0.55 : 0.7));
      ctx.font = `${vf}px Helvetica, Arial`; ctx.textBaseline = "bottom";
      ctx.fillText(val, x + lf * 0.4, y + rh - vf * 0.12, cw - lf);
    });
  });
}
function drawFrame(ctx, tpl, u, k, W, H) {
  const f = tpl.frame || {};
  if (!f.on) return;
  const m = (f.margin || 8) * k * u;
  ctx.save(); ctx.strokeStyle = "#000"; ctx.lineWidth = Math.max(1, 0.5 * k * u);
  ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
  if (f.ticks) {
    ctx.lineWidth = Math.max(0.5, 0.25 * k * u);
    const n = 8, len = m * 0.7;
    for (let i = 1; i < n; i++) {
      const x = m + (W - 2 * m) * i / n, y = m + (H - 2 * m) * i / n;
      ctx.beginPath(); ctx.moveTo(x, m); ctx.lineTo(x, m - len); ctx.moveTo(x, H - m); ctx.lineTo(x, H - m + len);
      if (i < 6) { ctx.moveTo(m, y); ctx.lineTo(m - len, y); ctx.moveTo(W - m, y); ctx.lineTo(W - m + len, y); }
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------
// Editorn
// ---------------------------------------------------------------------
function setPrintStatus(t) { if ($("prStatus")) $("prStatus").textContent = t || ""; }
async function openPrint() {
  if (!plan || !viewport) { alert("Öppna en plan först."); return; }
  let tpls = printTpls();
  let tpl = tpls.find(t => t.id === localStorageGet("lagesplan-printtpl")) || tpls[0];
  if (!tpl) tpl = defaultTemplate();
  pr = { tpl: JSON.parse(JSON.stringify(tpl)), saved: !!tpls.find(t => t.id === tpl.id), sel: null, dirty: false, undo: [], redo: [], drag: null, panMode: false };
  mapPreviews.clear();
  $("printModal").classList.remove("hidden");
  renderPrintPanel();
  requestAnimationFrame(drawPrintPage);
}
function localStorageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function closePrint() {
  if (pr && pr.dirty && !confirm("Mallen har osparade ändringar. Stänga ändå?")) return;
  pr = null; $("printModal").classList.add("hidden");
}
function pageDims() { const f = PRINT_FORMATS[pr.tpl.format]; return { W: f.w, H: f.h, k: f.w / PAGE_A3[0] }; }
/* Sidans placering i förhandsvisningens canvas. */
function layoutPreview() {
  const c = $("prCanvas"), wrap = $("prCanvasWrap");
  const r = wrap.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
  c.style.width = r.width + "px"; c.style.height = r.height + "px";
  const { W, H } = pageDims(), pad = 24 * dpr;
  const u = Math.min((c.width - 2 * pad) / W, (c.height - 2 * pad) / H);
  return { c, u, ox: (c.width - W * u) / 2, oy: (c.height - H * u) / 2, dpr };
}
function drawPrintPage() {
  if (!pr) return;
  const L = layoutPreview(), { c, u, ox, oy, dpr } = L;
  pr.L = L;
  const ctx = c.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#cbd2dc"; ctx.fillRect(0, 0, c.width, c.height);
  const { W, H, k } = pageDims();
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.25)"; ctx.shadowBlur = 18 * dpr; ctx.fillStyle = "#fff"; ctx.fillRect(ox, oy, W * u, H * u);
  ctx.restore();
  ctx.save(); ctx.translate(ox, oy);
  ctx.beginPath(); ctx.rect(0, 0, W * u, H * u); ctx.clip();
  drawFrame(ctx, pr.tpl, u, k, W * u, H * u);
  pr.tpl.elements.forEach(el => drawElement(ctx, el, pr.tpl, u, k, { editor: true }));
  // Markering
  const sel = pr.tpl.elements.find(e => e.id === pr.sel);
  if (sel) {
    const x = sel.x * k * u, y = sel.y * k * u, w = sel.w * k * u, h = sel.h * k * u;
    ctx.strokeStyle = pr.panMode && sel.type === "map" ? "#16a34a" : "#0b5fff"; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([5 * dpr, 3 * dpr]);
    ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    if (!(pr.panMode && sel.type === "map")) handlePts(sel, k, u).forEach(([hx, hy]) => { ctx.fillStyle = "#fff"; ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = 1.5 * dpr; ctx.fillRect(hx - 5 * dpr, hy - 5 * dpr, 10 * dpr, 10 * dpr); ctx.strokeRect(hx - 5 * dpr, hy - 5 * dpr, 10 * dpr, 10 * dpr); });
  }
  ctx.restore();
}
function handlePts(el, k, u) {
  const x = el.x * k * u, y = el.y * k * u, w = el.w * k * u, h = el.h * k * u;
  return [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
}
/* Musposition -> mm i mallen (A3-mm). */
function prPoint(e) {
  const { c, u, ox, oy } = pr.L, r = c.getBoundingClientRect(), dpr = pr.L.dpr;
  const { k } = pageDims();
  return [((e.clientX - r.left) * dpr - ox) / u / k, ((e.clientY - r.top) * dpr - oy) / u / k];
}
function snapMm(v, e) { return e && e.shiftKey ? Math.round(v * 10) / 10 : Math.round(v * 2) / 2; }
function pushUndo() { pr.undo.push(JSON.stringify(pr.tpl)); if (pr.undo.length > 80) pr.undo.shift(); pr.redo = []; pr.dirty = true; }
function prUndo() { if (!pr.undo.length) return; pr.redo.push(JSON.stringify(pr.tpl)); pr.tpl = JSON.parse(pr.undo.pop()); pr.dirty = true; renderPrintPanel(); drawPrintPage(); }
function prRedo() { if (!pr.redo.length) return; pr.undo.push(JSON.stringify(pr.tpl)); pr.tpl = JSON.parse(pr.redo.pop()); pr.dirty = true; renderPrintPanel(); drawPrintPage(); }

function prMouseDown(e) {
  if (!pr) return;
  const [mx, my] = prPoint(e);
  const { k } = pageDims(), u = pr.L.u;
  const sel = pr.tpl.elements.find(x => x.id === pr.sel);
  // Panorera kartan
  if (sel && sel.type === "map" && pr.panMode && mx >= sel.x && mx <= sel.x + sel.w && my >= sel.y && my <= sel.y + sel.h) {
    pushUndo();
    pr.drag = { kind: "pan", el: sel, start: [mx, my], center: sel.center.slice() };
    return;
  }
  // Handtag på markerat element
  if (sel) {
    const hs = handlePts(sel, k, u).map(([x, y]) => [x / u / k, y / u / k]);
    const tol = 8 * pr.L.dpr / u / k;
    const hi = hs.findIndex(([x, y]) => Math.abs(x - mx) < tol && Math.abs(y - my) < tol);
    if (hi >= 0) { pushUndo(); pr.drag = { kind: "resize", el: sel, hi, orig: { ...sel } }; return; }
  }
  const hit = pr.tpl.elements.slice().reverse().find(x => mx >= Math.min(x.x, x.x + x.w) - 1 && mx <= Math.max(x.x, x.x + x.w) + 1 && my >= Math.min(x.y, x.y + x.h) - 1 && my <= Math.max(x.y, x.y + x.h) + 1);
  pr.sel = hit ? hit.id : null;
  if (hit && hit.type !== "map") pr.panMode = false;
  if (hit) { pushUndo(); pr.drag = { kind: "move", el: hit, start: [mx, my], orig: { x: hit.x, y: hit.y }, moved: false }; }
  renderPrintPanel(); drawPrintPage();
}
function prMouseMove(e) {
  if (!pr || !pr.drag) return;
  const d = pr.drag, [mx, my] = prPoint(e);
  if (d.kind === "move") {
    d.moved = true;
    d.el.x = snapMm(d.orig.x + mx - d.start[0], e); d.el.y = snapMm(d.orig.y + my - d.start[1], e);
  } else if (d.kind === "resize") {
    const o = d.orig, right = d.hi === 1 || d.hi === 3, bottom = d.hi >= 2;
    let x0 = right ? o.x : snapMm(mx, e), x1 = right ? snapMm(mx, e) : o.x + o.w;
    let y0 = bottom ? o.y : snapMm(my, e), y1 = bottom ? snapMm(my, e) : o.y + o.h;
    if (d.el.type === "line") { d.el.x = x0; d.el.y = y0; d.el.w = x1 - x0; d.el.h = y1 - y0; }
    else {
      if (x1 - x0 < 2) { if (right) x1 = x0 + 2; else x0 = x1 - 2; }
      if (y1 - y0 < 2) { if (bottom) y1 = y0 + 2; else y0 = y1 - 2; }
      // Bild och norrpil behåller proportionerna (Shift = fritt)
      if ((d.el.type === "image" || d.el.type === "north" || d.el.type === "qr") && !e.shiftKey) {
        const ar = d.el.type === "image" ? (d.el.ar || o.w / o.h) : 1;
        const w = x1 - x0, h = w / ar;
        if (bottom) y1 = y0 + h; else y0 = y1 - h;
      }
      Object.assign(d.el, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  } else if (d.kind === "pan") {
    const { k } = pageDims();
    const dxMm = (mx - d.start[0]) * k, dyMm = (my - d.start[1]) * k; // mm på bladet
    const mPerMm = d.el.scale / 1000;
    // Skärmriktningen på bladet motsvarar stage-riktningen: omvandla via kalibreringen.
    const c0 = mToPx(d.center), ppm = pxPerMeter();
    const p = [c0[0] - dxMm * mPerMm * ppm, c0[1] - dyMm * mPerMm * ppm];
    const m = pdfToModel(toPdf(p));
    d.el.center = [Math.round(m[0] * 100) / 100, Math.round(m[1] * 100) / 100];
  }
  pr.dirty = true;
  drawPrintPage();
  if (d.kind !== "pan") renderPrintProps(true);
}
function prMouseUp() {
  if (!pr || !pr.drag) return;
  if (pr.drag.kind === "move" && !pr.drag.moved) pr.undo.pop();
  pr.drag = null;
  renderPrintPanel();
}
function prWheel(e) {
  if (!pr) return;
  const sel = pr.tpl.elements.find(x => x.id === pr.sel);
  if (!sel || sel.type !== "map" || !pr.panMode) return;
  e.preventDefault();
  const i = PRINT_SCALES.indexOf(sel.scale), j = Math.max(0, Math.min(PRINT_SCALES.length - 1, (i < 0 ? 5 : i) + (e.deltaY > 0 ? 1 : -1)));
  if (PRINT_SCALES[j] !== sel.scale) { pushUndo(); sel.scale = PRINT_SCALES[j]; renderPrintPanel(); drawPrintPage(); }
}
function prKey(e) {
  if (!pr || $("printModal").classList.contains("hidden")) return;
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  const sel = pr.tpl.elements.find(x => x.id === pr.sel);
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); e.stopPropagation(); e.shiftKey ? prRedo() : prUndo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === "y") { e.preventDefault(); e.stopPropagation(); prRedo(); return; }
  if ((e.ctrlKey || e.metaKey) && k === "d" && sel) { e.preventDefault(); e.stopPropagation(); duplicateEl(sel); return; }
  if (e.key === "Escape") { e.stopPropagation(); if (pr.sel) { pr.sel = null; pr.panMode = false; renderPrintPanel(); drawPrintPage(); } else closePrint(); return; }
  if (!sel) return;
  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); deleteEl(sel); return; }
  const step = e.shiftKey ? 10 : 1;
  const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (mv) { e.preventDefault(); e.stopPropagation(); pushUndo(); sel.x += mv[0]; sel.y += mv[1]; renderPrintProps(true); drawPrintPage(); }
}

function addEl(type) {
  const { W, H, k } = pageDims();
  const cx = PAGE_A3[0] / 2, cy = PAGE_A3[1] / 2;
  const base = { id: ghNewId(), type, x: cx - 30, y: cy - 15, w: 60, h: 30 };
  const extra = {
    text: { text: "Ny text", size: 10, bold: false, align: "left", color: "#000000", w: 60, h: 14 },
    image: { path: null, ar: 1, w: 40, h: 40 },
    map: { scale: fitScale(200, 140, pr.tpl.format), center: viewCenterModel(), border: true, x: cx - 100, y: cy - 70, w: 200, h: 140 },
    legend: { title: "FÖRKLARINGAR", cols: 2, size: 7, phases: true, site: true, cad: false, extra: "", w: 120, h: 50 },
    scalebar: { w: 70, h: 16 },
    north: { w: 20, h: 20 },
    qr: { text: "https://", w: 30, h: 30 },
    title: { size: 7, rows: "PROJEKTNAMN: {plan}\nDATUM: {idag} | SKALA: {skala}\nRITNINGSNUMMER: ", w: 85, h: 30 },
    rect: { stroke: "#000000", lw: 0.35, fill: "" },
    line: { stroke: "#000000", lw: 0.35, w: 60, h: 0 },
  }[type];
  pushUndo();
  const el = { ...base, ...extra };
  el.x = Math.max(0, Math.min(PAGE_A3[0] - el.w, cx - el.w / 2)); el.y = Math.max(0, Math.min(PAGE_A3[1] - Math.max(el.h, 1), cy - el.h / 2));
  pr.tpl.elements.push(el);
  pr.sel = el.id;
  renderPrintPanel(); drawPrintPage();
  if (type === "image") $("prImgInput").click();
}
function deleteEl(el) { pushUndo(); pr.tpl.elements = pr.tpl.elements.filter(x => x.id !== el.id); pr.sel = null; renderPrintPanel(); drawPrintPage(); }
function duplicateEl(el) { pushUndo(); const c = { ...JSON.parse(JSON.stringify(el)), id: ghNewId(), x: el.x + 5, y: el.y + 5 }; pr.tpl.elements.push(c); pr.sel = c.id; renderPrintPanel(); drawPrintPage(); }
function orderEl(el, dir) {
  pushUndo();
  const a = pr.tpl.elements, i = a.indexOf(el);
  a.splice(i, 1);
  a.splice(dir === "top" ? a.length : dir === "bottom" ? 0 : Math.max(0, Math.min(a.length, i + dir)), 0, el);
  drawPrintPage();
}

// ---------------------------------------------------------------------
// Panelen till höger
// ---------------------------------------------------------------------
function renderPrintPanel() {
  if (!pr) return;
  const tpls = printTpls();
  const list = pr.saved ? tpls : [pr.tpl, ...tpls];
  $("prTpl").innerHTML = list.map(t => `<option value="${escHtml(t.id)}"${t.id === pr.tpl.id ? " selected" : ""}>${escHtml(t.id === pr.tpl.id ? pr.tpl.name : t.name)}${t.id === pr.tpl.id && pr.dirty ? " *" : ""}</option>`).join("");
  $("prSave").classList.toggle("primary", pr.dirty || !pr.saved);
  $("prSave").textContent = pr.dirty || !pr.saved ? "💾 Spara mall *" : "💾 Sparad";
  document.querySelectorAll("#prFormat button").forEach(b => b.classList.toggle("on", b.dataset.f === pr.tpl.format));
  $("prFrame").checked = !!(pr.tpl.frame && pr.tpl.frame.on);
  $("prUndo").disabled = !pr.undo.length; $("prRedo").disabled = !pr.redo.length;
  renderPrintProps();
}
function renderPrintProps(onlyPos) {
  const box = $("prProps");
  const el = pr.tpl.elements.find(x => x.id === pr.sel);
  if (onlyPos && el) { ["x", "y", "w", "h"].forEach(f => { const i = box.querySelector(`[data-f="${f}"]`); if (i && document.activeElement !== i) i.value = Math.round(el[f] * 10) / 10; }); return; }
  if (!el) { box.innerHTML = `<div class="hint">Klicka på ett element på bladet för att ändra det, eller lägg till nya ovan. Dra för att flytta, dra i hörnen för att ändra storlek. Piltangenter flyttar 1 mm (Shift 10 mm), Delete tar bort, Ctrl+D kopierar, Ctrl+Z ångrar.</div>`; return; }
  const t = ELEMENT_TYPES[el.type];
  const inp = (f, label, type = "text", attrs = "") => `<label>${label}</label><input type="${type}" data-f="${f}" value="${escHtml(el[f] ?? "")}" ${attrs} />`;
  const num = (f, label, step = "0.5") => `<div><label>${label}</label><input type="number" step="${step}" data-f="${f}" data-num="1" value="${Math.round((el[f] || 0) * 10) / 10}" /></div>`;
  const chk = (f, label) => `<label class="check"><input type="checkbox" data-f="${f}"${el[f] ? " checked" : ""} /> ${label}</label>`;
  const color = (f, label) => `<div><label>${label}</label><div class="row" style="flex-wrap:nowrap;"><input type="color" data-f="${f}" value="${escHtml(el[f] || "#000000")}" class="pr-color" /><button type="button" class="icon ghost pr-nocolor" data-f="${f}" title="Ingen">∅</button></div></div>`;
  let html = `<div class="row"><b>${t.icon} ${t.label}</b><span class="grow"></span>
      <button class="icon ghost" id="prDup" title="Kopiera (Ctrl+D)">⧉</button>
      <button class="icon ghost" id="prUp" title="Lägg överst">⤒</button>
      <button class="icon ghost" id="prDown" title="Lägg underst">⤓</button>
      <button class="icon ghost" id="prDel" title="Ta bort (Delete)">🗑️</button></div>
    <div class="pr-grid4">${num("x", "X (mm)")}${num("y", "Y (mm)")}${num("w", "Bredd")}${num("h", "Höjd")}</div>`;
  if (el.type === "text") html += `<label>Text <span class="muted">– {plan} {datum} {idag} {skala} {format} {användare} {utskriven}</span></label><textarea data-f="text" rows="4">${escHtml(el.text || "")}</textarea>
      <div class="pr-grid4">${num("size", "Storlek (pt)", "0.5")}<div><label>Justering</label><select data-f="align">${["left", "center", "right"].map(a => `<option value="${a}"${el.align === a ? " selected" : ""}>${{ left: "Vänster", center: "Mitten", right: "Höger" }[a]}</option>`).join("")}</select></div>${color("color", "Färg")}${color("fill", "Bakgrund")}</div>
      ${chk("bold", "Fetstil")} <div class="pr-grid4">${color("border", "Ram")}</div>`;
  if (el.type === "image") html += `<button id="prPickImg" class="block" style="margin-top:8px;">🖼 ${el.path ? "Byt bild…" : "Välj bild…"}</button><div class="hint">PNG, JPG eller SVG – t.ex. företagets logga eller skyltar. Bilden sparas i projektet. Proportionerna behålls (Shift = fritt).</div>`;
  if (el.type === "map") html += `<div class="pr-grid4"><div style="grid-column:span 2;"><label>Skala</label><select data-f="scale" data-num="1">${PRINT_SCALES.map(s => `<option value="${s}"${el.scale === s ? " selected" : ""}>1:${s}</option>`).join("")}</select></div></div>
      <div class="row split" style="margin-top:8px;"><button id="prPan" class="${pr.panMode ? "active" : ""}" title="Dra i kartan för att flytta utsnittet, scrolla för att byta skala">✋ Panorera kartan</button><button id="prFromView" title="Samma utsnitt som på skärmen">⤢ Skärmens utsnitt</button></div>
      ${chk("border", "Ram runt kartan")}
      <div class="hint">Kartan visar lagren som de är tända på skärmen och valt datum. Skalan gäller på ${pr.tpl.format}.</div>`;
  if (el.type === "legend") html += inp("title", "Rubrik") + `<div class="pr-grid4">${num("size", "Storlek (pt)", "0.5")}${num("cols", "Kolumner", "1")}</div>
      ${chk("phases", "Statusfärger (faser)")}${chk("site", "Etablering som finns på planen")}${chk("cad", "CAD-ritningar")}
      <label>Egna rader <span class="muted">(t.ex. "#e11d48 Betongbarriär")</span></label><textarea data-f="extra" rows="3">${escHtml(el.extra || "")}</textarea>`;
  if (el.type === "title") html += `<label>Rader <span class="muted">– "ETIKETT: värde", celler med |</span></label><textarea data-f="rows" rows="9" style="font-family:ui-monospace,Consolas,monospace;font-size:11px;">${escHtml(el.rows || "")}</textarea>
      <div class="pr-grid4">${num("size", "Storlek (pt)", "0.5")}</div><div class="hint">Platshållare: {plan} {datum} {idag} {skala} {format} {användare} {utskriven}</div>`;
  if (el.type === "qr") html += inp("text", "Länk eller text");
  if (el.type === "rect") html += `<div class="pr-grid4">${color("stroke", "Linje")}${color("fill", "Fyllning")}${num("lw", "Tjocklek (mm)", "0.05")}</div>`;
  if (el.type === "line") html += `<div class="pr-grid4">${color("stroke", "Färg")}${num("lw", "Tjocklek (mm)", "0.05")}</div><div class="hint">Höjd 0 = vågrät linje, bredd 0 = lodrät.</div>`;
  if (el.type === "scalebar" || el.type === "north") html += `<div class="hint">Följer kartans skala och riktning.</div>`;
  box.innerHTML = html;
  box.querySelectorAll("[data-f]").forEach(i => {
    if (i.classList.contains("pr-nocolor")) { i.onclick = () => { pushUndo(); el[i.dataset.f] = ""; renderPrintPanel(); drawPrintPage(); }; return; }
    const ev = i.tagName === "SELECT" || i.type === "checkbox" || i.type === "color" ? "change" : "input";
    i.addEventListener(ev, () => {
      if (!i._u) { pushUndo(); i._u = true; setTimeout(() => { i._u = false; }, 800); }
      const f = i.dataset.f;
      el[f] = i.type === "checkbox" ? i.checked : i.dataset.num ? Number(String(i.value).replace(",", ".")) || 0 : i.value;
      pr.dirty = true;
      $("prSave").classList.add("primary"); $("prSave").textContent = "💾 Spara mall *";
      drawPrintPage();
    });
  });
  const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
  on("prDup", () => duplicateEl(el));
  on("prUp", () => orderEl(el, "top"));
  on("prDown", () => orderEl(el, "bottom"));
  on("prDel", () => deleteEl(el));
  on("prPickImg", () => $("prImgInput").click());
  on("prPan", () => { pr.panMode = !pr.panMode; renderPrintProps(); drawPrintPage(); });
  on("prFromView", () => { pushUndo(); el.center = viewCenterModel(); el.scale = fitScale(el.w, el.h, pr.tpl.format); renderPrintPanel(); drawPrintPage(); });
}

async function saveTemplate() {
  const t = { ...pr.tpl, updated_at: new Date().toISOString() };
  await saveSiteItem(t, false, { record: false });
  pr.saved = true; pr.dirty = false;
  try { localStorage.setItem("lagesplan-printtpl", t.id); } catch (e) {}
  setPrintStatus(`✓ Mallen "${t.name}" sparad.`);
  renderPrintPanel();
}
function switchTemplate(id) {
  if (id === pr.tpl.id) return;
  if (pr.dirty && !confirm("Byta mall utan att spara ändringarna?")) { renderPrintPanel(); return; }
  const t = printTpls().find(x => x.id === id);
  if (!t) return;
  pr = { ...pr, tpl: JSON.parse(JSON.stringify(t)), saved: true, sel: null, dirty: false, undo: [], redo: [], panMode: false };
  try { localStorage.setItem("lagesplan-printtpl", t.id); } catch (e) {}
  renderPrintPanel(); drawPrintPage();
}
function newTemplate(copy) {
  const name = (prompt(copy ? "Namn på kopian:" : "Namn på den nya mallen:", copy ? pr.tpl.name + " (kopia)" : "Ny mall") || "").trim();
  if (!name) return;
  const t = copy ? { ...JSON.parse(JSON.stringify(pr.tpl)), id: ghNewId(), name } : { ...defaultTemplate(), name };
  if (copy) t.elements.forEach(e => { e.id = ghNewId(); });
  pr = { ...pr, tpl: t, saved: false, sel: null, dirty: true, undo: [], redo: [], panMode: false };
  renderPrintPanel(); drawPrintPage();
}
async function renameTemplate() {
  const name = (prompt("Nytt namn på mallen:", pr.tpl.name) || "").trim();
  if (!name || name === pr.tpl.name) return;
  pushUndo(); pr.tpl.name = name; renderPrintPanel();
}
async function deleteTemplate() {
  if (!pr.saved) { if (confirm("Släng den osparade mallen?")) { pr.dirty = false; closePrint(); openPrint(); } return; }
  if (!confirm(`Ta bort mallen "${pr.tpl.name}" för hela projektet?`)) return;
  await saveSiteItem(pr.tpl, true, { record: false });
  pr.dirty = false; closePrint(); openPrint();
}

// ---------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------
const hexRgb = h => { const s = String(h || "#000000").replace("#", ""); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16) || 0); };
async function exportPrintPdf() {
  if (!pr) return;
  const tpl = pr.tpl, fmt = PRINT_FORMATS[tpl.format], { W, H, k } = pageDims();
  $("prExport").disabled = true;
  try {
    setPrintStatus("Laddar PDF-verktyget…");
    await loadScript(JSPDF_URL);
    if (tpl.elements.some(e => e.type === "qr")) { await loadScript(QR_URL).catch(() => {}); }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [W, H], compress: true });
    doc.setProperties({ title: fillText("Lägesplan {plan}", tpl), creator: "4D-planering – Lägesplan" });
    const rasterEl = (el, dpi) => {
      const u = dpi / 25.4, c = newCanvas(Math.max(1, Math.ceil(Math.abs(el.w) * k * u)), Math.max(1, Math.ceil(Math.abs(el.h) * k * u)));
      const ctx = c.getContext("2d");
      drawElement(ctx, { ...el, x: 0, y: 0 }, tpl, u, k);
      return c;
    };
    for (const el of tpl.elements) {
      const x = el.x * k, y = el.y * k, w = el.w * k, h = el.h * k;
      if (el.type === "map") {
        setPrintStatus("Ritar kartan i hög upplösning…");
        const u = fmt.dpi / 25.4;
        const mc = await renderMapCanvas(el, w, h, Math.round(w * u), Math.round(h * u), { status: s => setPrintStatus(`Ritar kartan: ${s}…`) });
        doc.addImage(mc.toDataURL("image/jpeg", 0.9), "JPEG", x, y, w, h, undefined, "FAST");
        if (el.border !== false) { doc.setDrawColor(0); doc.setLineWidth(0.35 * k); doc.rect(x, y, w, h); }
      } else if (el.type === "image") {
        const im = el.path ? printImage(el.path) || await printImgs.get(el.path) : null;
        if (!im) continue;
        const ar = im.naturalWidth / im.naturalHeight || 1;
        let iw = w, ih = w / ar; if (ih > h) { ih = h; iw = h * ar; }
        const c = newCanvas(Math.min(4000, Math.round(iw / 25.4 * 300)), Math.min(4000, Math.round(ih / 25.4 * 300)));
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        doc.addImage(c.toDataURL("image/png"), "PNG", x + (w - iw) / 2, y + (h - ih) / 2, iw, ih, undefined, "FAST");
      } else if (el.type === "text") {
        if (el.fill) { doc.setFillColor(...hexRgb(el.fill)); doc.rect(x, y, w, h, "F"); }
        if (el.border) { doc.setDrawColor(...hexRgb(el.border)); doc.setLineWidth(0.3 * k); doc.rect(x, y, w, h); }
        const size = (el.size || 10) * k, pad = 1.2 * k;
        doc.setFont("helvetica", el.bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...hexRgb(el.color));
        const lines = doc.splitTextToSize(fillText(el.text, tpl), w - 2 * pad);
        const tx = el.align === "center" ? x + w / 2 : el.align === "right" ? x + w - pad : x + pad;
        const lh = size * PT_MM * 1.2;
        lines.forEach((ln, i) => { const ly = y + pad + i * lh; if (ly + lh <= y + h + 0.5) doc.text(ln, tx, ly, { baseline: "top", align: el.align || "left" }); });
        doc.setTextColor(0);
      } else if (el.type === "rect") {
        const st = el.stroke ? "D" : "", fl = el.fill ? "F" : "";
        if (!st && !fl) continue;
        if (el.fill) doc.setFillColor(...hexRgb(el.fill));
        if (el.stroke) { doc.setDrawColor(...hexRgb(el.stroke)); doc.setLineWidth((el.lw || 0.35) * k); }
        doc.rect(x, y, w, h, fl + st);
      } else if (el.type === "line") {
        doc.setDrawColor(...hexRgb(el.stroke)); doc.setLineWidth((el.lw || 0.35) * k);
        doc.line(x, y, x + w, y + h);
      } else if (el.type === "title") {
        const rows = titleRows(el, tpl), rh = h / Math.max(1, rows.length), fs = (el.size || 7) * k;
        doc.setDrawColor(0); doc.setLineWidth(0.25 * k); doc.rect(x, y, w, h);
        rows.forEach((cells, r) => {
          const ry = y + r * rh;
          if (r) doc.line(x, ry, x + w, ry);
          cells.forEach(([lab, val], c) => {
            const cw = w / cells.length, cx = x + c * cw;
            if (c) doc.line(cx, ry, cx, ry + rh);
            const lf = Math.min(fs * 0.62, rh * 0.3 / PT_MM), vf = Math.min(fs * 1.25, rh * (lab ? 0.55 : 0.7) / PT_MM);
            doc.setFont("helvetica", "normal");
            if (lab) { doc.setFontSize(lf); doc.text(doc.splitTextToSize(lab, cw - lf * PT_MM)[0] || "", cx + lf * PT_MM * 0.4, ry + lf * PT_MM * 0.25, { baseline: "top" }); }
            doc.setFontSize(vf); doc.text(doc.splitTextToSize(val, cw - lf * PT_MM)[0] || "", cx + lf * PT_MM * 0.4, ry + rh - vf * PT_MM * 0.12, { baseline: "bottom" });
          });
        });
      } else {
        // Förklaring, skalstock, norrpil och QR: rastrerade i 300 dpi.
        const c = rasterEl(el, 300);
        doc.addImage(c.toDataURL("image/png"), "PNG", Math.min(x, x + w), Math.min(y, y + h), Math.abs(w), Math.abs(h), undefined, "FAST");
      }
    }
    // Ram och kantmarkeringar (vektor)
    const f = tpl.frame || {};
    if (f.on) {
      const m = (f.margin || 8) * k;
      doc.setDrawColor(0); doc.setLineWidth(0.5 * k); doc.rect(m, m, W - 2 * m, H - 2 * m);
      if (f.ticks) {
        doc.setLineWidth(0.25 * k);
        for (let i = 1; i < 8; i++) {
          const tx = m + (W - 2 * m) * i / 8, ty = m + (H - 2 * m) * i / 8, len = m * 0.7;
          doc.line(tx, m, tx, m - len); doc.line(tx, H - m, tx, H - m + len);
          if (i < 6) { doc.line(m, ty, m - len, ty); doc.line(W - m, ty, W - m + len, ty); }
        }
      }
    }
    const name = `${fillText("Lägesplan {plan} {datum}", tpl)} ${tpl.format}.pdf`;
    doc.save(name);
    setPrintStatus(`✓ ${name}`);
  } catch (e) {
    console.error(e);
    alert("Kunde inte skapa PDF: " + e.message);
    setPrintStatus("");
  } finally {
    $("prExport").disabled = false;
  }
}

function bindPrint() {
  ["btnPrintLayout"].forEach(id => { if ($(id)) $(id).onclick = openPrint; });
  $("prClose").onclick = closePrint;
  $("prTpl").onchange = e => switchTemplate(e.target.value);
  $("prSave").onclick = saveTemplate;
  $("prNew").onclick = () => newTemplate(false);
  $("prCopy").onclick = () => newTemplate(true);
  $("prRename").onclick = renameTemplate;
  $("prDelete").onclick = deleteTemplate;
  $("prUndo").onclick = prUndo; $("prRedo").onclick = prRedo;
  $("prExport").onclick = exportPrintPdf;
  document.querySelectorAll("#prFormat button").forEach(b => { b.onclick = () => { if (pr.tpl.format === b.dataset.f) return; pushUndo(); pr.tpl.format = b.dataset.f; mapPreviews.clear(); renderPrintPanel(); drawPrintPage(); }; });
  $("prFrame").onchange = e => { pushUndo(); pr.tpl.frame = { margin: 8, ticks: true, ...(pr.tpl.frame || {}), on: e.target.checked }; drawPrintPage(); renderPrintPanel(); };
  document.querySelectorAll("#prAdd [data-add]").forEach(b => { b.onclick = () => addEl(b.dataset.add); });
  $("prImgInput").onchange = async e => {
    const f = e.target.files[0]; e.target.value = "";
    const el = pr && pr.tpl.elements.find(x => x.id === pr.sel);
    if (!f || !el || el.type !== "image") return;
    try {
      const r = await uploadPrintImage(f);
      pushUndo(); el.path = r.path; el.ar = r.ar; el.h = Math.round(el.w / r.ar * 10) / 10;
      renderPrintPanel(); drawPrintPage();
    } catch (err) { alert("Kunde inte ladda upp bilden: " + err.message); setPrintStatus(""); }
  };
  const c = $("prCanvas");
  c.addEventListener("mousedown", prMouseDown);
  window.addEventListener("mousemove", prMouseMove);
  window.addEventListener("mouseup", prMouseUp);
  c.addEventListener("wheel", prWheel, { passive: false });
  window.addEventListener("keydown", prKey, true);
  window.addEventListener("resize", () => { if (pr) drawPrintPage(); });
}
bindPrint();
