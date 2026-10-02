/* Lägesplan – utskriftslayout (Victors önskemål 2026-09-29).
   Ett ritningsblad (A3/A1 liggande) med fritt placerade element: ritningar
   (viewports i skala med eget lagerurval och valfri namn/skala-text), text,
   bilder (loggor), förklaring, skalstock, norrpil, QR-kod, ritningshuvud,
   rutor och linjer. Mallarna sparas i projektet ({ type: "printtpl" } i
   site_layers.json), bilderna i 4D-data/print/. Mått lagras i mm på ett
   A3-blad (420×297) och skalas till A1. Text, rutor och ritningshuvud blir
   vektorer i PDF:en; ritningarna renderas i hög upplösning. */

const QR_URL = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
const PAGE_A3 = [420, 297];
const PRINT_FORMATS = { A3: { w: 420, h: 297, dpi: 200 }, A1: { w: 841, h: 594, dpi: 150 } };
const PRINT_SCALES = [50, 100, 200, 250, 400, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000, 20000];
const PT_MM = 0.3528;
const SNAP_PX = 7; // snäpp-avstånd i skärmpixlar
const ELEMENT_TYPES = {
  text: { label: "Text", icon: "🔤" },
  image: { label: "Bild", icon: "🖼" },
  map: { label: "Ritning", icon: "🗺" },
  legend: { label: "Förklaring", icon: "📋" },
  scalebar: { label: "Skalstock", icon: "📏" },
  north: { label: "Norrpil", icon: "🧭" },
  qr: { label: "QR-kod", icon: "▦" },
  title: { label: "Ritningshuvud", icon: "🗂" },
  rect: { label: "Ruta", icon: "▭" },
  line: { label: "Linje", icon: "╱" },
};
const NORTH_STYLES = { rose4: "Stjärna", classic: "Klassisk halvpil", rose8: "Kompassros", minimal: "Minimal", compass: "Bussola", feather: "Pil med fjäder" };

const printTpls = () => siteItems.filter(x => x.type === "printtpl").sort((a, b) => (a.name || "").localeCompare(b.name || "", "sv"));
let pr = null; // editorns tillstånd

// ---------------------------------------------------------------------
// Lagerurval per ritning (viewport)
// ---------------------------------------------------------------------
/* Alla lager som kan visas i en ritning: [{ key, label, sub }]. */
function printLayerList() {
  const L = [];
  orthosByDate().reverse().forEach(o => L.push({ key: "ortho:" + o.id, label: `🛰 ${o.name} (${orthoDate(o)})` }));
  L.push({ key: "pdf", label: "📄 " + layerDisplayName("pdf") });
  if (typeof cads === "function") cads().forEach(r => {
    L.push({ key: "cad:" + r.id, label: "📐 " + r.name });
    r.layers.forEach(l => L.push({ key: `cadl:${r.id}:${l.name}`, label: l.name, sub: true, parent: "cad:" + r.id }));
  });
  L.push({ key: "zones", label: "🟧 " + layerDisplayName("zones") });
  L.push({ key: "objects", label: "🔷 " + layerDisplayName("objects") });
  userLayers().forEach(l => L.push({ key: "ul:" + l, label: "🗂 " + ulName(l) }));
  return L;
}
function snapshotLayers() {
  const keys = {};
  printLayerList().forEach(l => { keys[l.key] = !!ls(l.key).visible; });
  return keys;
}
/* En sparad vy (lagesplan-views.js) som ritningen använder, om någon. */
const vpView = el => el.layers && el.layers.view && typeof lsViews === "function" ? lsViews().find(v => v.id === el.layers.view) || null : null;
/* Ritningens lagerurval: { key: tänd } – null = följ skärmen. */
function vpKeys(el) {
  const cfg = el.layers;
  if (!cfg) return null;
  const v = vpView(el);
  if (v) { const L = (v.state && v.state.layers) || {}, keys = {}; printLayerList().forEach(l => { keys[l.key] = !!(L[l.key] && L[l.key].visible); }); return keys; }
  return cfg.follow ? null : cfg.keys || {};
}
/* Kör fn med ritningens lagerurval tänt/släckt (återställs efteråt). En vy
   tar också med genomskinligheten och "genomskinlig vit bakgrund". */
async function withViewportLayers(el, fn) {
  const keys = vpKeys(el);
  if (!keys) return fn();
  const v = vpView(el), L = v ? (v.state && v.state.layers) || {} : null;
  const saved = {}, savedMult = layerState.pdfMultiply;
  printLayerList().forEach(l => {
    const s = ls(l.key);
    saved[l.key] = { visible: s.visible, opacity: s.opacity };
    s.visible = l.key in keys ? !!keys[l.key] : false;
    if (L && L[l.key] && L[l.key].opacity != null) s.opacity = L[l.key].opacity;
  });
  if (v && v.state) layerState.pdfMultiply = v.state.pdfMultiply !== false;
  try { return await fn(); }
  finally { Object.entries(saved).forEach(([k, st]) => { const s = ls(k); s.visible = st.visible; s.opacity = st.opacity; }); layerState.pdfMultiply = savedMult; }
}
const vpLayersKey = el => { const v = vpView(el); if (v) return "view:" + JSON.stringify(v.state); const k = vpKeys(el); return k ? JSON.stringify(k) : "follow:" + JSON.stringify(snapshotLayers()); };

// ---------------------------------------------------------------------
// Standardmall (i stil med en APD-plan)
// ---------------------------------------------------------------------
function newMapEl(x, y, w, h, format) {
  return { id: ghNewId(), type: "map", x, y, w, h, scale: fitScale(w, h, format), center: viewCenterModel(), border: true,
    layers: { follow: false, keys: snapshotLayers() }, label: { show: false, name: "", size: 9, align: "left" } };
}
function defaultTemplate() {
  const id = () => ghNewId();
  const map = newMapEl(8, 8, 404, 212, "A3");
  return {
    id: ghNewId(), type: "printtpl", name: "Standard", format: "A3", frame: { on: true, margin: 8, ticks: true },
    elements: [
      map,
      { id: id(), type: "north", x: 388, y: 12, w: 20, h: 20, style: "rose8", color: "#000000", mapId: map.id },
      { id: id(), type: "rect", x: 8, y: 220, w: 404, h: 69, stroke: "#000000", lw: 0.35, fill: "" },
      { id: id(), type: "text", x: 12, y: 223, w: 80, h: 40, text: "REFERENSER\n{plan}", size: 7, bold: false, align: "left", color: "#000000" },
      { id: id(), type: "legend", x: 95, y: 223, w: 150, h: 62, title: "FÖRKLARINGAR", cols: 2, size: 7, phases: true, site: true, cad: false, extra: "" },
      { id: id(), type: "scalebar", x: 250, y: 268, w: 74, h: 16, mapId: map.id },
      { id: id(), type: "title", x: 327, y: 220, w: 85, h: 69, size: 7, ...TITLE_CARD_DEFAULTS },
    ],
  };
}
function viewCenterModel() {
  if (!viewport || !plan || !plan.calib) return [0, 0];
  const vr = $("viewport").getBoundingClientRect();
  const m = pdfToModel(toPdf([(vr.width / 2 - view.tx) / view.scale, (vr.height / 2 - view.ty) / view.scale]));
  return [Math.round(m[0] * 100) / 100, Math.round(m[1] * 100) / 100];
}
/* Minsta standardskala där det som syns på skärmen ryms i ritningens ram. */
function fitScale(wA3, hA3, format) {
  if (!viewport || !plan || !plan.calib) return 1000;
  const k = PRINT_FORMATS[format].w / PAGE_A3[0];
  const vr = $("viewport").getBoundingClientRect(), ppm = pxPerMeter();
  const wm = vr.width / view.scale / ppm, hm = vr.height / view.scale / ppm;
  const need = Math.max(wm * 1000 / (wA3 * k), hm * 1000 / (hA3 * k));
  return PRINT_SCALES.find(s => s >= need) || PRINT_SCALES[PRINT_SCALES.length - 1];
}
const nearestScale = n => PRINT_SCALES.reduce((a, b) => Math.abs(Math.log(b / n)) < Math.abs(Math.log(a / n)) ? b : a);
/* Ritningen som skalstock/norrpil/{skala} hör till. */
function mapFor(el, tpl) {
  const maps = tpl.elements.filter(e => e.type === "map");
  return maps.find(m => m.id === el.mapId) || maps[0] || null;
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
/* Bildelement (Victors önskemål 2026-10-02): beskär (cropL/R/T/B, % av
   bilden) och gör vit bakgrund genomskinlig (knockout, knockTol = hur nära
   vitt, med mjuk kant). Resultatet cachas per bild och inställning. */
const printImgSrcCache = new Map();
function printImageSource(el, im) {
  const pct = v => Math.max(0, Math.min(95, Number(v) || 0)) / 100;
  const l = pct(el.cropL), r = pct(el.cropR), t = pct(el.cropT), b = pct(el.cropB);
  const nw = im.naturalWidth || im.width, nh = im.naturalHeight || im.height;
  const sx = nw * l, sy = nh * t, sw = Math.max(1, nw * (1 - l - r)), sh = Math.max(1, nh * (1 - t - b));
  el.ar = sw / sh;
  if (!el.knockout && !l && !r && !t && !b) return { src: im, sx: 0, sy: 0, sw: nw, sh: nh };
  if (!el.knockout) return { src: im, sx, sy, sw, sh };
  const tol = Math.max(1, Math.min(120, Number(el.knockTol) || 30));
  const key = `${el.path}|${l}|${r}|${t}|${b}|${tol}`;
  let c = printImgSrcCache.get(key);
  if (!c) {
    const k = Math.min(1, 2400 / Math.max(sw, sh));
    c = newCanvas(Math.max(1, Math.round(sw * k)), Math.max(1, Math.round(sh * k)));
    const ctx = c.getContext("2d");
    ctx.drawImage(im, sx, sy, sw, sh, 0, 0, c.width, c.height);
    try {
      const d = ctx.getImageData(0, 0, c.width, c.height), px = d.data;
      for (let i = 0; i < px.length; i += 4) {
        const dist = 255 - Math.min(px[i], px[i + 1], px[i + 2]); // 0 = helt vit
        if (dist <= tol) px[i + 3] = 0;
        else if (dist <= tol * 2) px[i + 3] = Math.round(px[i + 3] * (dist - tol) / tol); // mjuk kant
      }
      ctx.putImageData(d, 0, 0);
    } catch (e) { console.warn("Kunde inte göra bakgrunden genomskinlig", e); }
    printImgSrcCache.set(key, c);
  }
  return { src: c, sx: 0, sy: 0, sw: c.width, sh: c.height };
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
// Ritningen (viewport)
// ---------------------------------------------------------------------
function mapPlate(el, wMm, hMm, pxW, pxH) {
  const ppm = pxPerMeter();
  const S = pxW / (wMm * el.scale / 1000 * ppm); // canvas-px per stage-px
  const c = mToPx(el.center || [0, 0]);
  return { W: pxW, H: pxH, S, x0: c[0] - pxW / S / 2, y0: c[1] - pxH / S / 2, outside: true, ortho: new Map() };
}
/* Ritar ritningens innehåll (ortofoton, PDF, CAD, zoner, etablering) i en canvas.
   En i taget: lagerurvalet byts tillfälligt och får inte blandas ihop. */
let vpQueue = Promise.resolve();
function renderMapCanvas(...args) {
  const run = vpQueue.then(() => renderMapCanvasNow(...args));
  vpQueue = run.catch(() => {});
  return run;
}
async function renderMapCanvasNow(el, wMm, hMm, pxW, pxH, opts = {}) {
  const out = newCanvas(pxW, pxH), ctx = out.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, pxW, pxH);
  if (!plan || !plan.calib || !viewport) return out;
  // Geometri och bilder hämtas innan lagren tillfälligt byts.
  const vk = vpKeys(el);
  if (typeof cads === "function") for (const r of cads()) { if (!vk || vk["cad:" + r.id]) { try { await ensureCadGeom(r); } catch (e) {} } }
  const P = mapPlate(el, wMm, hMm, pxW, pxH);
  P.noTiles = !!opts.preview;
  await withViewportLayers(el, async () => {
    for (const o of orthosByDate().filter(x => ls("ortho:" + x.id).visible)) {
      try {
        const plate = await buildOrthoPlate(o, P, s => opts.status && opts.status(`ortofoto – ${s}`));
        ctx.globalAlpha = layerOpacity("ortho:" + o.id); ctx.drawImage(plate, 0, 0); ctx.globalAlpha = 1;
      } catch (e) { console.warn("Ortofoto i utskriften", e); }
    }
    const multiplyPdf = orthos().some(o => ls("ortho:" + o.id).visible) && layerState.pdfMultiply !== false;
    P.pdfInfo = { visible: layerVisible("pdf"), opacity: layerOpacity("pdf"), multiply: multiplyPdf };
    // Vektor-PDF: ritningen bäddas in som vektorer efteråt (lagesplan-vecpdf.js).
    if (layerVisible("pdf") && !opts.vectorPdf) {
      opts.status && opts.status("PDF-ritningen");
      const pdfPlate = await buildPdfPlate(P);
      ctx.save(); ctx.globalAlpha = layerOpacity("pdf");
      if (multiplyPdf) ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(pdfPlate, 0, 0); ctx.restore();
    }
    P.overlay = newCanvas(pxW, pxH);
    // PDF-export: CAD ritas som vektorer i PDF:en (skarpa linjer), så här
    // bara zoner/etablering i ett eget genomskinligt lager ovanpå.
    renderFilmOverlay(P, { cad: !opts.vectorCad, zones: true, site: true });
    if (opts.vectorCad) P.cadPlan = typeof cadVectorPlan === "function" ? cadVectorPlan() : [];
    else ctx.drawImage(P.overlay, 0, 0);
  });
  return opts.vectorCad ? { base: out, overlay: P.overlay, cad: P.cadPlan || [], P } : out;
}
const mapPreviews = new Map(); // el.id -> { key, canvas }
const mapPending = new Map();
function mapPreview(el, wPx, hPx) {
  const key = JSON.stringify([el.scale, el.center, el.w, el.h, Math.round(wPx), $("dateInput").value, pr && pr.tpl.format, vpLayersKey(el)]);
  const hit = mapPreviews.get(el.id);
  if ((!hit || hit.key !== key) && mapPending.get(el.id) !== key) {
    mapPending.set(el.id, key);
    clearTimeout(mapPreview.timers && mapPreview.timers[el.id]);
    (mapPreview.timers = mapPreview.timers || {})[el.id] = setTimeout(async () => {
      if (!pr) return;
      const k = PRINT_FORMATS[pr.tpl.format].w / PAGE_A3[0];
      const c = await renderMapCanvas(el, el.w * k, el.h * k, Math.max(50, Math.round(wPx)), Math.max(50, Math.round(hPx)), { preview: true });
      if (mapPending.get(el.id) === key) { mapPreviews.set(el.id, { key, canvas: c }); mapPending.delete(el.id); }
      if (pr) drawPrintPage();
    }, 150);
  }
  return hit ? hit.canvas : null;
}
/* Namn & skala under ritningen: höjd i mallens mm. */
function mapLabelLines(el) { return [el.label && el.label.name, `Skala 1:${el.scale}`].filter(Boolean); }
function mapLabelHeight(el) {
  if (!el.label || !el.label.show) return 0;
  const s = el.label.size || 9;
  return 1.5 + (el.label.name ? s * 1.25 * PT_MM : 0) + s * 0.85 * 1.3 * PT_MM;
}
/* Elementets yta inklusive namn & skala-texten. */
function elBox(el) {
  const x0 = Math.min(el.x, el.x + el.w), y0 = Math.min(el.y, el.y + el.h);
  return { x: x0, y: y0, w: Math.abs(el.w), h: Math.abs(el.h) + (el.type === "map" ? mapLabelHeight(el) : 0) };
}

// ---------------------------------------------------------------------
// Norrpilar
// ---------------------------------------------------------------------
/* Ritar en norrpil med mitt i (0,0), radie r, pekande uppåt (norr). */
function drawNorthStyle(ctx, style, r, color) {
  const ink = color || "#000", paper = "#fff";
  const lw = Math.max(0.6, r * 0.035);
  ctx.lineJoin = "round"; ctx.lineWidth = lw; ctx.strokeStyle = ink;
  const letter = (t, x, y, size, base = "middle") => { ctx.fillStyle = ink; ctx.font = `bold ${size}px Helvetica, Arial`; ctx.textAlign = "center"; ctx.textBaseline = base; ctx.fillText(t, x, y); };
  const halfSpike = (ang, len, wid, leftDark) => {
    // Spets i riktning ang (0 = upp), två halvor: vänster mörk/ljus.
    const dx = Math.sin(ang), dy = -Math.cos(ang), nx = Math.cos(ang), ny = Math.sin(ang);
    const tip = [dx * len, dy * len], L = [-nx * wid, -ny * wid], R = [nx * wid, ny * wid];
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(...tip); ctx.lineTo(...L); ctx.closePath(); ctx.fillStyle = leftDark ? ink : paper; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(...tip); ctx.lineTo(...R); ctx.closePath(); ctx.fillStyle = leftDark ? paper : ink; ctx.fill(); ctx.stroke();
  };
  switch (style) {
    case "classic": {
      const h = r * 0.95, w = r * 0.32;
      ctx.beginPath(); ctx.moveTo(0, -h * 0.72); ctx.lineTo(-w, h * 0.72); ctx.lineTo(0, h * 0.42); ctx.closePath(); ctx.fillStyle = ink; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -h * 0.72); ctx.lineTo(w, h * 0.72); ctx.lineTo(0, h * 0.42); ctx.closePath(); ctx.fillStyle = paper; ctx.fill(); ctx.stroke();
      letter("N", 0, -h * 0.78, r * 0.36, "bottom");
      break;
    }
    case "rose8": {
      const main = r * 0.74, minor = r * 0.46;
      [1, 3, 5, 7].forEach(i => halfSpike(i * Math.PI / 4, minor, r * 0.1, true));
      [0, 2, 4, 6].forEach(i => halfSpike(i * Math.PI / 4, main, r * 0.14, true));
      ctx.beginPath(); ctx.arc(0, 0, r * 0.06, 0, Math.PI * 2); ctx.fillStyle = paper; ctx.fill(); ctx.stroke();
      const f = r * 0.2;
      letter("N", 0, -main - f * 0.15, f, "bottom"); letter("S", 0, main + f * 0.15, f, "top");
      letter("Ö", main + f * 0.55, 0, f); letter("V", -main - f * 0.55, 0, f);
      break;
    }
    case "minimal": {
      const h = r * 0.6, w = r * 0.38;
      ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(w, h * 0.55); ctx.lineTo(-w, h * 0.55); ctx.closePath(); ctx.fillStyle = ink; ctx.fill();
      letter("N", 0, h * 0.62, r * 0.4, "top");
      break;
    }
    case "compass": {
      const R = r * 0.78;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fillStyle = paper; ctx.fill(); ctx.lineWidth = lw * 1.4; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, R * 0.86, 0, Math.PI * 2); ctx.lineWidth = lw * 0.6; ctx.stroke();
      for (let i = 0; i < 36; i++) {
        const a = i * Math.PI / 18, l = i % 9 === 0 ? R * 0.2 : i % 3 === 0 ? R * 0.12 : R * 0.07;
        ctx.beginPath(); ctx.moveTo(Math.sin(a) * R, -Math.cos(a) * R); ctx.lineTo(Math.sin(a) * (R - l), -Math.cos(a) * (R - l)); ctx.lineWidth = lw * 0.6; ctx.stroke();
      }
      ctx.lineWidth = lw;
      halfSpike(0, R * 0.7, R * 0.16, true);
      halfSpike(Math.PI, R * 0.7, R * 0.16, false);
      ctx.beginPath(); ctx.arc(0, 0, R * 0.05, 0, Math.PI * 2); ctx.fillStyle = ink; ctx.fill();
      letter("N", 0, -R - r * 0.04, r * 0.26, "bottom");
      break;
    }
    case "feather": {
      const h = r * 0.9, head = r * 0.3, w = r * 0.17;
      ctx.lineWidth = lw * 1.6; ctx.beginPath(); ctx.moveTo(0, -h + head * 0.8); ctx.lineTo(0, h); ctx.stroke();
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(0, -h); ctx.lineTo(w, -h + head); ctx.lineTo(0, -h + head * 0.7); ctx.lineTo(-w, -h + head); ctx.closePath(); ctx.fillStyle = ink; ctx.fill();
      for (let i = 0; i < 3; i++) {
        const y = h - i * r * 0.14;
        ctx.beginPath(); ctx.moveTo(0, y - r * 0.12); ctx.lineTo(-w * 0.9, y); ctx.moveTo(0, y - r * 0.12); ctx.lineTo(w * 0.9, y); ctx.stroke();
      }
      letter("N", 0, -h - r * 0.03, r * 0.3, "bottom");
      break;
    }
    default: { // rose4: stjärna med fyra långa och fyra korta uddar
      [1, 3, 5, 7].forEach(i => halfSpike(i * Math.PI / 4, r * 0.38, r * 0.09, false));
      [0, 1, 2, 3].forEach(i => halfSpike(i * Math.PI / 2, i === 0 ? r * 0.72 : r * 0.58, r * 0.15, true));
      letter("N", 0, -r * 0.76, r * 0.26, "bottom");
    }
  }
}
function northAngle(mapEl) {
  if (!plan || !plan.calib || !mapEl) return 0;
  const c = mapEl.center || [0, 0], p0 = mToPx(c), p1 = mToPx([c[0], c[1] + 1]);
  return Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) + Math.PI / 2;
}

// ---------------------------------------------------------------------
// Rita element (förhandsvisning och rasterdelar i PDF:en)
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
      const c = opts.mapCanvas || (opts.noMap ? null : mapPreview(el, W, H));
      if (c) ctx.drawImage(c, X, Y, W, H);
      else if (!opts.noMap) { ctx.fillStyle = "#eef2f7"; ctx.fillRect(X, Y, W, H); ctx.fillStyle = "#64748b"; ctx.font = `${pt(10)}px Helvetica, Arial`; ctx.textAlign = "center"; ctx.fillText("Ritningen ritas…", X + W / 2, Y + H / 2); }
      if (el.border !== false && !opts.noMap) { ctx.strokeStyle = "#000"; ctx.lineWidth = Math.max(1, 0.35 * k * u); ctx.strokeRect(X, Y, W, H); }
      if (el.label && el.label.show && !opts.noLabel) {
        const s = el.label.size || 9, lines = mapLabelLines(el);
        ctx.fillStyle = "#000"; ctx.textBaseline = "top";
        const al = el.label.align || "left";
        ctx.textAlign = al;
        const tx = al === "center" ? X + W / 2 : al === "right" ? X + W : X;
        let ty = Y + H + 1.5 * k * u;
        if (el.label.name) { ctx.font = `bold ${pt(s)}px Helvetica, Arial`; ctx.fillText(el.label.name, tx, ty); ty += pt(s) * 1.25; }
        ctx.font = `${pt(s * 0.85)}px Helvetica, Arial`; ctx.fillText(`Skala 1:${el.scale}`, tx, ty);
      }
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
        const S = printImageSource(el, im), ar = S.sw / S.sh || 1;
        let w = W, h = W / ar; if (h > H) { h = H; w = H * ar; }
        ctx.drawImage(S.src, S.sx, S.sy, S.sw, S.sh, X + (W - w) / 2, Y + (H - h) / 2, w, h);
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
      ctx.translate(X + W / 2, Y + H / 2); ctx.rotate(northAngle(mapFor(el, tpl)));
      drawNorthStyle(ctx, el.style || "rose4", Math.min(W, H) / 2, el.color);
      break;
    }
    case "scalebar": {
      const N = (mapFor(el, tpl) || {}).scale || 1000;
      const mmPerM = 1000 / N; // mm på bladet per meter
      const maxM = (el.w * k * 0.92) / mmPerM;
      const pow = Math.pow(10, Math.floor(Math.log10(maxM)));
      const L = [5, 2, 1].map(f => f * pow).find(v => v <= maxM) || pow;
      const segs = L / pow === 2 ? 4 : 5;
      const barW = L * mmPerM * u, barH = Math.max(2, H * 0.14), bx = X, by = Y + H * 0.36;
      const fs = Math.min(H * 0.2, pt(7));
      ctx.font = `${fs}px Helvetica, Arial`; ctx.fillStyle = "#000"; ctx.textBaseline = "bottom"; ctx.textAlign = "left";
      // Med bladformatet (Victors önskemål 2026-10-02): 1:500 gäller bara på rätt bladstorlek.
      ctx.fillText(`SKALA 1:${N}${tpl && tpl.format ? ` (${tpl.format})` : ""}`, bx, by - fs * 0.6);
      for (let i = 0; i < segs; i++) { ctx.fillStyle = i % 2 ? "#fff" : "#000"; ctx.fillRect(bx + barW * i / segs, by, barW / segs, barH); }
      ctx.strokeStyle = "#000"; ctx.lineWidth = Math.max(0.5, 0.2 * k * u); ctx.strokeRect(bx, by, barW, barH);
      ctx.textBaseline = "top"; ctx.fillStyle = "#000";
      for (let i = 0; i <= segs; i++) { ctx.textAlign = i === 0 ? "left" : i === segs ? "right" : "center"; ctx.fillText(String(Math.round(L * i / segs * 100) / 100), bx + barW * i / segs, by + barH + fs * 0.2); }
      ctx.textAlign = "left"; ctx.fillText("METER", bx, by + barH + fs * 1.4);
      break;
    }
    case "qr": {
      if (el.frame) { drawQrCard(ctx, el, tpl, X, Y, W, H); break; }
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
    case "title": if (el.style === "card") drawTitleCard(ctx, el, tpl, X, Y, W, H, pt); else drawTitleBlock(ctx, el, tpl, X, Y, W, H, pt, k, u); break;
  }
  ctx.restore();
}
/* QR-kod i ram med egen text (Victors önskemål 2026-10-02): färgat kort med
   rubrik, underrubrik, QR-koden i en vit ruta och en rad längst ner med en
   mobil. Texterna krymper så att de ryms; {datum} m.fl. fungerar. */
const QR_CARD_DEFAULTS = { frameColor: "#1f3b73", title: "AKTUELL TIDPLAN", subtitle: "Skanna för detaljer", footer: "Öppna i mobilen eller iPad", phone: true };
function drawQrCard(ctx, el, tpl, X, Y, W, H) {
  const o = { ...QR_CARD_DEFAULTS, ...el };
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  const fit = (text, maxW, fs, weight) => { ctx.font = `${weight} ${fs}px Helvetica, Arial, sans-serif`; const w = ctx.measureText(text).width; return w > maxW ? fs * maxW / w : fs; };
  const p = W * 0.07;
  ctx.fillStyle = o.frameColor || "#1f3b73"; rr(X, Y, W, H, W * 0.045); ctx.fill();
  ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.textBaseline = "top";
  let y = Y + p * 0.9;
  const title = fillText(o.title || "", tpl), sub = fillText(o.subtitle || "", tpl), foot = fillText(o.footer || "", tpl);
  if (title) { const fs = fit(title, W - 2 * p, W * 0.115, "bold"); ctx.font = `bold ${fs}px Helvetica, Arial, sans-serif`; ctx.fillText(title, X + W / 2, y); y += fs * 1.2; }
  if (sub) { const fs = fit(sub, W - 2 * p, W * 0.085, "600"); ctx.font = `600 ${fs}px Helvetica, Arial, sans-serif`; ctx.fillText(sub, X + W / 2, y); y += fs * 1.25; }
  y += p * 0.35;
  const footH = foot || o.phone ? W * 0.26 : 0;
  const side = Math.max(10, Math.min(W - 2 * p, Y + H - y - footH - p * (footH ? 0.5 : 1)));
  const bx = X + (W - side) / 2;
  ctx.fillStyle = "#ffffff"; rr(bx, y, side, side, side * 0.03); ctx.fill();
  const m = qrMatrix(el.text);
  if (m) {
    const n = m.length, cell = side * 0.9 / n, ox = bx + (side - cell * n) / 2, oy = y + (side - cell * n) / 2;
    ctx.fillStyle = "#000";
    m.forEach((row, r) => row.forEach((d, c) => { if (d) ctx.fillRect(ox + c * cell, oy + r * cell, cell + 0.4, cell + 0.4); }));
  }
  if (!footH) return;
  const fy = y + side + p * 0.45, fh = Y + H - fy - p * 0.5;
  if (fh <= 4) return;
  let tx = X + p, tw = W - 2 * p;
  if (o.phone) {
    // Mobil: rundad kontur med skärm och hemknapp.
    const ph = fh * 0.92, pw = ph * 0.56, px = X + p * 1.1, py = fy + (fh - ph) / 2, lw = Math.max(1, pw * 0.09);
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = lw; rr(px, py, pw, ph, pw * 0.18); ctx.stroke();
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(px + pw / 2, py + ph - pw * 0.2, pw * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(px + pw * 0.38, py + pw * 0.12, pw * 0.24, lw * 0.6);
    tx = px + pw + p * 0.8; tw = X + W - p - tx;
  }
  if (!foot) return;
  let fs = Math.min(fh * 0.34, W * 0.085);
  ctx.font = `${fs}px Helvetica, Arial, sans-serif`;
  let lines = wrapLines(ctx, foot, tw);
  while (lines.length * fs * 1.2 > fh && fs > 2) { fs *= 0.9; ctx.font = `${fs}px Helvetica, Arial, sans-serif`; lines = wrapLines(ctx, foot, tw); }
  ctx.fillStyle = "#ffffff"; ctx.textAlign = o.phone ? "left" : "center"; ctx.textBaseline = "top";
  const ty = fy + (fh - lines.length * fs * 1.2) / 2;
  lines.forEach((l, i) => ctx.fillText(l, o.phone ? tx : X + W / 2, ty + i * fs * 1.2));
}
/* Förklaringens rader: faser, etablering som finns på planen, CAD, egna. */
/* Förklaringens rader. Varje rad har en nyckel så att den kan justeras i
   panelen (Victors önskemål 2026-10-02): legHide (dölj), legText (egen text),
   legColor (egen färg) och legOrder (ordning). all = även dolda (för panelen). */
function legendItems(el, all) {
  const raw = legendItemsRaw(el);
  const hide = el.legHide || {}, txt = el.legText || {}, col = el.legColor || {}, order = el.legOrder || [];
  raw.forEach((it, i) => {
    it.hidden = !!hide[it.key]; it.origLabel = it.label; it.origColor = it.color; it.i = i;
    if (txt[it.key]) it.label = txt[it.key];
    if (col[it.key]) it.color = col[it.key];
  });
  const pos = k => { const j = order.indexOf(k); return j < 0 ? 1e6 : j; };
  raw.sort((a, b) => pos(a.key) - pos(b.key) || a.i - b.i);
  return all ? raw : raw.filter(it => !it.hidden);
}
function legendItemsRaw(el) {
  const items = [];
  // Faserna som samma prickar som på kartan (Victors önskemål 2026-10-02), inte bara färgrutor.
  if (el.phases) PHASE_ORDER.forEach(ph => items.push({ key: "phase:" + ph, kind: "dot", color: ph === "ingen" ? "#ffffff" : phaseColor(ph), dashed: ph === "ingen", label: PHASE_LABELS[ph] }));
  if (el.site) {
    const seen = new Set();
    siteItems.filter(siteShown).forEach(x => {
      if (x.type === "wxday" || x.type === "wxweek") return; // vädret är sin egen ruta
      // Arbetslag: en rad per UE i UE:ns färg. Leveranser: per fordonstyp.
      const ue = x.type === "crew" && typeof ueById === "function" ? ueById(x.ue) : null;
      const veh = x.type === "delivery" && typeof VEHICLES !== "undefined" ? VEHICLES[x.veh] : null;
      const key = x.type === "symbol" ? "sym:" + x.sym : x.type === "crew" ? "crew:" + (x.ue || "") : x.type === "delivery" ? "veh:" + x.veh : x.type + "|" + (x.color || "") + "|" + (x.dash || "");
      if (seen.has(key)) return; seen.add(key);
      const st = siteStyle(x, 10);
      const label = x.type === "symbol" ? (SYMBOLS[x.sym] || {}).label || "Symbol" : ue ? `${ue.short || ""} ${ue.name || ""}`.trim() : veh ? veh.label : SITE_KINDS[x.type].label;
      const kind = { fence: "line", route: "route", barrier: "area", shed: "area", storage: "area", symbol: "area", crane: "circle", gate: "line", note: "note", sketch: "line", crew: "box", delivery: "area", lift: "circle" }[x.type];
      items.push({ key: "site:" + key, kind, color: ue ? ue.color || st.color : veh ? veh.color : st.color, dash: x.dash || SITE_DEFAULT_DASH[x.type], label });
    });
  }
  if (el.cad && typeof cads === "function") cads().filter(r => ls("cad:" + r.id).visible).forEach(r => items.push({ key: "cad:" + r.id, kind: "line", color: r.colorMode === "mono" ? r.color : "#111827", dash: "solid", label: r.name }));
  String(el.extra || "").split("\n").map(s => s.trim()).filter(Boolean).forEach((s, i) => {
    const m = s.match(/^(#[0-9a-f]{6})\s+(.*)$/i);
    items.push(m ? { key: "extra:" + i, kind: "box", color: m[1], label: m[2] } : { key: "extra:" + i, kind: "text", label: s });
  });
  return items;
}
function drawLegend(ctx, el, X, Y, W, H, pt) {
  const fs = pt(el.size || 7), lh = fs * 1.7 * (Number(el.legSpacing) || 1);
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
    else if (it.kind === "dot") {
      // Som 3D-objektens prickar på kartan: färgad rund prick med vit ring (tunn grå kant så ringen syns på vitt papper).
      const r = sh * 0.62, cx = x + sw / 2;
      ctx.beginPath(); ctx.arc(cx, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#ffffff"; ctx.lineWidth = r * 0.28; ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, y, r + r * 0.14, 0, Math.PI * 2); ctx.strokeStyle = "#6b7280"; ctx.lineWidth = Math.max(0.5, r * 0.08); ctx.stroke();
    }
    else if (it.kind === "circle") { ctx.setLineDash(dash); ctx.beginPath(); ctx.arc(x + sw / 2, y, sh * 0.55, 0, Math.PI * 2); ctx.stroke(); }
    else if (it.kind === "note") { ctx.fillStyle = "#fffbe6"; ctx.fillRect(x, y - sh / 2, sw, sh); ctx.strokeRect(x, y - sh / 2, sw, sh); }
    ctx.restore();
    ctx.fillStyle = "#000";
    ctx.fillText(it.kind === "text" || el.legNoEq ? it.label : "= " + it.label, it.kind === "text" ? x : x + sw + fs * 0.5, y, colW - sw - fs);
  });
}
/* Ritningshuvudet som kort (Victors önskemål 2026-10-02): mörkblå rubrikrad,
   rader med liten etikett och större värde, tunna linjer, valfri logga i en
   mörk fot. Raderna skrivs i sidomenyn (sparas som "ETIKETT: värde | …"). */
const TITLE_CARD_DEFAULTS = { style: "card", heading: "INFORMATION", color: "#1f3b73", rows: [
  "LÄGESPLAN: {plan}", "DATUM: {idag} | ANSVARIG: {användare}", "PROJEKT: ", "OMRÅDE: ", "RITNING: ", "SKALA: {skala} | FORMAT: {format}"].join("\n") };
/* Loggan i foten: vit bakgrund bort och (valfritt) all färg till vitt. */
const logoSrcCache = new Map();
function titleLogoSource(el) {
  const im = el.logo ? printImage(el.logo) : null;
  if (!im) return null;
  const key = `${el.logo}|${el.logoWhite ? 1 : 0}`;
  let c = logoSrcCache.get(key);
  if (!c) {
    const nw = im.naturalWidth || im.width, nh = im.naturalHeight || im.height, k = Math.min(1, 1600 / Math.max(nw, nh));
    c = newCanvas(Math.max(1, Math.round(nw * k)), Math.max(1, Math.round(nh * k)));
    const ctx = c.getContext("2d"); ctx.drawImage(im, 0, 0, c.width, c.height);
    try {
      const d = ctx.getImageData(0, 0, c.width, c.height), px = d.data;
      for (let i = 0; i < px.length; i += 4) {
        const dist = 255 - Math.min(px[i], px[i + 1], px[i + 2]);
        if (dist <= 30) px[i + 3] = 0; else if (dist <= 60) px[i + 3] = Math.round(px[i + 3] * (dist - 30) / 30);
        if (el.logoWhite) { px[i] = px[i + 1] = px[i + 2] = 255; }
      }
      ctx.putImageData(d, 0, 0);
      // Tomma kanter runt loggan bort (Victors rapport 2026-10-02: loggan blev liten av bildens marginal).
      let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (px[(y * c.width + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 >= x0 && (x1 - x0 + 1 < c.width || y1 - y0 + 1 < c.height)) {
        const t = newCanvas(x1 - x0 + 1, y1 - y0 + 1);
        t.getContext("2d").drawImage(c, x0, y0, t.width, t.height, 0, 0, t.width, t.height);
        c = t;
      }
    } catch (e) { /* t.ex. SVG utan pixlar – används som den är */ }
    logoSrcCache.set(key, c);
  }
  return c;
}
function drawTitleCard(ctx, el, tpl, X, Y, W, H, pt) {
  const rows = titleRows(el, tpl), col = el.color || "#1f3b73", fs = pt(el.size || 7);
  const r = Math.min(W, H) * 0.03, lw = Math.max(1, fs * 0.12);
  const rr = (x, y, w, h, rad) => { ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad); ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath(); };
  ctx.save();
  rr(X, Y, W, H, r); ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.clip();
  const pad = fs * 0.7;
  const head = String(el.heading ?? "").trim() ? fillText(el.heading, tpl) : "";
  const hh = head ? fs * 2.1 : 0;
  const logo = titleLogoSource(el), fh = el.logo ? Math.min(H * 0.22, fs * 4.4) : 0;
  if (hh) {
    ctx.fillStyle = col; ctx.fillRect(X, Y, W, hh);
    ctx.fillStyle = "#ffffff"; ctx.font = `bold ${fs * 1.25}px Helvetica, Arial, sans-serif`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(head, X + pad, Y + hh / 2, W - 2 * pad);
  }
  if (fh) {
    ctx.fillStyle = col; ctx.fillRect(X, Y + H - fh, W, fh);
    if (logo) {
      // Storlek: andel av fotens höjd (logoSize %, standard 60 %).
      const lh = fh * Math.max(0.2, Math.min(0.9, (Number(el.logoSize) || 60) / 100)), lw2 = Math.min(W - 2 * pad, lh * logo.width / logo.height), lh2 = lw2 * logo.height / logo.width;
      ctx.drawImage(logo, X + pad, Y + H - fh + (fh - lh2) / 2, lw2, lh2);
    }
  }
  const top = Y + hh, area = H - hh - fh, rh = rows.length ? area / rows.length : 0;
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.5, lw * 0.6);
  rows.forEach((cells, i) => {
    const y = top + i * rh;
    if (i) { ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(X, y); ctx.lineTo(X + W, y); ctx.stroke(); ctx.globalAlpha = 1; }
    cells.forEach(([lab, val], c) => {
      const cw = W / cells.length, x = X + c * cw;
      if (c) { ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + rh); ctx.stroke(); ctx.globalAlpha = 1; }
      const lf = Math.min(fs * 0.92, rh * 0.3), vf = Math.min(fs * 1.4, rh * (lab ? 0.42 : 0.6));
      ctx.textAlign = "left";
      if (lab) { ctx.fillStyle = col; ctx.font = `600 ${lf}px Helvetica, Arial, sans-serif`; ctx.textBaseline = "top"; ctx.fillText(lab.toUpperCase(), x + pad, y + rh * 0.12, cw - 2 * pad); }
      ctx.fillStyle = "#111827"; ctx.font = `${vf}px Helvetica, Arial, sans-serif`; ctx.textBaseline = "bottom";
      ctx.fillText(val, x + pad, y + rh - rh * 0.1, cw - 2 * pad);
    });
  });
  ctx.restore();
  rr(X, Y, W, H, r); ctx.strokeStyle = col; ctx.lineWidth = lw * 1.4; ctx.stroke();
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
function localStorageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
const selEls = () => pr ? pr.tpl.elements.filter(e => pr.sels.includes(e.id)) : [];
const primary = () => pr && pr.sels.length === 1 ? pr.tpl.elements.find(e => e.id === pr.sels[0]) : null;
function setSel(ids) { pr.sels = ids; if (!primary() || primary().type !== "map") pr.panMode = false; }

let prSpace = false; // Mellanslag nedtryckt: dra flyttar vyn i layouten
async function openPrint() {
  if (!plan || !viewport) { alert("Öppna en plan först."); return; }
  const tpls = printTpls();
  let tpl = tpls.find(t => t.id === localStorageGet("lagesplan-printtpl")) || tpls[0];
  if (!tpl) tpl = defaultTemplate();
  pr = { tpl: migrateTpl(JSON.parse(JSON.stringify(tpl))), saved: !!tpls.find(t => t.id === tpl.id), sels: [], dirty: false, undo: [], redo: [], drag: null, panMode: false, guides: [], fmtAsk: null };
  mapPreviews.clear(); mapPending.clear();
  $("printModal").classList.remove("hidden");
  renderPrintPanel();
  requestAnimationFrame(drawPrintPage);
}
/* Äldre mallar: ritningar utan lagerval följer skärmen. */
function migrateTpl(t) {
  t.elements.forEach(e => {
    if (e.type === "map") { if (!e.layers) e.layers = { follow: true, keys: snapshotLayers() }; if (!e.label) e.label = { show: false, name: "", size: 9, align: "left" }; }
    if (e.type === "north" && !e.style) e.style = "rose4";
  });
  return t;
}
function closePrint() {
  if (pr && pr.dirty && !confirm("Mallen har osparade ändringar. Stänga ändå?")) return;
  pr = null; $("printModal").classList.add("hidden");
}
function pageDims() { const f = PRINT_FORMATS[pr.tpl.format]; return { W: f.w, H: f.h, k: f.w / PAGE_A3[0] }; }
function layoutPreview() {
  const c = $("prCanvas"), wrap = $("prCanvasWrap");
  const r = wrap.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
  c.style.width = r.width + "px"; c.style.height = r.height + "px";
  const { W, H } = pageDims(), pad = 24 * dpr;
  // Zoom i layouten (Victors önskemål 2026-10-02): pr.zoom × "hela bladet", pr.vx/vy = förskjutning (skärm-px).
  const z = (pr && pr.zoom) || 1;
  const u = Math.min((c.width - 2 * pad) / W, (c.height - 2 * pad) / H) * z;
  return { c, u, ox: (c.width - W * u) / 2 + ((pr && pr.vx) || 0) * dpr, oy: (c.height - H * u) / 2 + ((pr && pr.vy) || 0) * dpr, dpr };
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
  // Hjälplinjer vid snäppning
  ctx.strokeStyle = "#ec4899"; ctx.lineWidth = 1 * dpr; ctx.setLineDash([4 * dpr, 3 * dpr]);
  (pr.guides || []).forEach(g => { ctx.beginPath(); if (g.x != null) { ctx.moveTo(g.x * k * u, 0); ctx.lineTo(g.x * k * u, H * u); } else { ctx.moveTo(0, g.y * k * u); ctx.lineTo(W * u, g.y * k * u); } ctx.stroke(); });
  ctx.setLineDash([]);
  // Markering
  const sels = selEls(), one = primary();
  sels.forEach(sel => {
    const b = elBox(sel);
    ctx.strokeStyle = pr.panMode && sel.type === "map" ? "#16a34a" : "#0b5fff"; ctx.lineWidth = 1.5 * dpr; ctx.setLineDash([5 * dpr, 3 * dpr]);
    ctx.strokeRect(b.x * k * u, b.y * k * u, b.w * k * u, b.h * k * u); ctx.setLineDash([]);
  });
  // Låst: ett litet lås i hörnet i stället för handtag.
  if (one && one.locked) { const b = elBox(one); ctx.font = `${12 * dpr}px Arial`; ctx.textAlign = "right"; ctx.textBaseline = "top"; ctx.fillText("🔒", (b.x + b.w) * k * u - 2 * dpr, b.y * k * u + 2 * dpr); }
  else if (one && !(pr.panMode && one.type === "map")) handlePts(one, k, u).forEach(([hx, hy]) => { ctx.fillStyle = "#fff"; ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = 1.5 * dpr; ctx.fillRect(hx - 5 * dpr, hy - 5 * dpr, 10 * dpr, 10 * dpr); ctx.strokeRect(hx - 5 * dpr, hy - 5 * dpr, 10 * dpr, 10 * dpr); });
  // Markeringsruta
  if (pr.drag && pr.drag.kind === "band") {
    const d = pr.drag, x0 = Math.min(d.start[0], d.cur[0]), y0 = Math.min(d.start[1], d.cur[1]);
    ctx.fillStyle = "rgba(11,95,255,.08)"; ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = 1 * dpr;
    ctx.fillRect(x0 * k * u, y0 * k * u, Math.abs(d.cur[0] - d.start[0]) * k * u, Math.abs(d.cur[1] - d.start[1]) * k * u);
    ctx.strokeRect(x0 * k * u, y0 * k * u, Math.abs(d.cur[0] - d.start[0]) * k * u, Math.abs(d.cur[1] - d.start[1]) * k * u);
  }
  ctx.restore();
}
function handlePts(el, k, u) {
  const x = el.x * k * u, y = el.y * k * u, w = el.w * k * u, h = el.h * k * u;
  return [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
}
function prPoint(e) {
  const { c, u, ox, oy } = pr.L, r = c.getBoundingClientRect(), dpr = pr.L.dpr;
  const { k } = pageDims();
  return [((e.clientX - r.left) * dpr - ox) / u / k, ((e.clientY - r.top) * dpr - oy) / u / k];
}
const gridMm = v => Math.round(v * 2) / 2;
function pushUndo() { pr.undo.push(JSON.stringify(pr.tpl)); if (pr.undo.length > 80) pr.undo.shift(); pr.redo = []; pr.dirty = true; }
function prUndo() { if (!pr.undo.length) return; pr.redo.push(JSON.stringify(pr.tpl)); pr.tpl = JSON.parse(pr.undo.pop()); pr.sels = pr.sels.filter(id => pr.tpl.elements.some(e => e.id === id)); pr.dirty = true; renderPrintPanel(); drawPrintPage(); }
function prRedo() { if (!pr.redo.length) return; pr.undo.push(JSON.stringify(pr.tpl)); pr.tpl = JSON.parse(pr.redo.pop()); pr.sels = pr.sels.filter(id => pr.tpl.elements.some(e => e.id === id)); pr.dirty = true; renderPrintPanel(); drawPrintPage(); }

/* Snäpplinjer: andra elements kanter/mittlinjer, bladets kanter, ramen och mitten. */
function snapTargets(exclude) {
  const xs = [0, PAGE_A3[0], PAGE_A3[0] / 2], ys = [0, PAGE_A3[1], PAGE_A3[1] / 2];
  const f = pr.tpl.frame || {};
  if (f.on) { const m = f.margin || 8; xs.push(m, PAGE_A3[0] - m); ys.push(m, PAGE_A3[1] - m); }
  pr.tpl.elements.filter(e => !exclude.includes(e.id)).forEach(e => {
    const b = { x: Math.min(e.x, e.x + e.w), y: Math.min(e.y, e.y + e.h), w: Math.abs(e.w), h: Math.abs(e.h) };
    xs.push(b.x, b.x + b.w, b.x + b.w / 2); ys.push(b.y, b.y + b.h, b.y + b.h / 2);
    if (e.type === "map" && e.label && e.label.show) ys.push(b.y + b.h + mapLabelHeight(e));
  });
  return { xs, ys };
}
function snapTol() { const { k } = pageDims(); return SNAP_PX * pr.L.dpr / pr.L.u / k; }
/* Bästa förskjutning för några kandidatvärden mot målen. */
function bestSnap(vals, targets, tol) {
  let best = null;
  vals.forEach(v => targets.forEach(t => { const d = t - v; if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: t }; }));
  return best;
}

function prMouseDown(e) {
  if (!pr) return;
  // Flytta vyn i layouten: mittenknappen eller Mellanslag + dra.
  if (e.button === 1 || prSpace) { e.preventDefault(); pr.drag = { kind: "view", sx: e.clientX, sy: e.clientY, vx: pr.vx || 0, vy: pr.vy || 0 }; return; }
  const [mx, my] = prPoint(e);
  const { k } = pageDims(), u = pr.L.u;
  const one = primary();
  // Panorera ritningen
  if (one && one.type === "map" && pr.panMode && !one.locked && mx >= one.x && mx <= one.x + one.w && my >= one.y && my <= one.y + one.h) {
    pushUndo();
    pr.drag = { kind: "pan", el: one, start: [mx, my], center: one.center.slice() };
    return;
  }
  // Handtag på ett ensamt markerat element
  if (one && !one.locked) {
    const hs = handlePts(one, k, u).map(([x, y]) => [x / u / k, y / u / k]);
    const tol = 8 * pr.L.dpr / u / k;
    const hi = hs.findIndex(([x, y]) => Math.abs(x - mx) < tol && Math.abs(y - my) < tol);
    if (hi >= 0) { pushUndo(); pr.drag = { kind: "resize", el: one, hi, orig: { ...one } }; return; }
  }
  const hit = pr.tpl.elements.slice().reverse().find(x => { const b = elBox(x); return mx >= b.x - 1 && mx <= b.x + b.w + 1 && my >= b.y - 1 && my <= b.y + b.h + 1; });
  if (e.shiftKey || e.ctrlKey || e.metaKey) {
    if (hit) setSel(pr.sels.includes(hit.id) ? pr.sels.filter(id => id !== hit.id) : [...pr.sels, hit.id]);
    else pr.drag = { kind: "band", start: [mx, my], cur: [mx, my], add: true, base: pr.sels.slice() };
    renderPrintPanel(); drawPrintPage();
    return;
  }
  if (!hit) { setSel([]); pr.drag = { kind: "band", start: [mx, my], cur: [mx, my], base: [] }; renderPrintPanel(); drawPrintPage(); return; }
  if (!pr.sels.includes(hit.id)) setSel([hit.id]);
  // Låsta element (🔒 i panelen) markeras men flyttas inte.
  if (selEls().some(x => x.locked)) { renderPrintPanel(); drawPrintPage(); if (hit.locked) setPrintStatus("🔒 Elementet är låst – lås upp det i panelen för att flytta det."); return; }
  pushUndo();
  const group = selEls();
  pr.drag = { kind: "move", els: group, start: [mx, my], orig: group.map(g => ({ id: g.id, x: g.x, y: g.y })), moved: false };
  renderPrintPanel(); drawPrintPage();
}
function prMouseMove(e) {
  if (!pr || !pr.drag) return;
  if (pr.drag.kind === "view") { pr.vx = pr.drag.vx + e.clientX - pr.drag.sx; pr.vy = pr.drag.vy + e.clientY - pr.drag.sy; drawPrintPage(); return; }
  const d = pr.drag, [mx, my] = prPoint(e);
  pr.guides = [];
  if (d.kind === "band") { d.cur = [mx, my]; bandSelect(d); drawPrintPage(); return; }
  if (d.kind === "move") {
    d.moved = true;
    let dx = mx - d.start[0], dy = my - d.start[1];
    // Gruppens yta
    const O = d.orig.map(o => { const el = pr.tpl.elements.find(x => x.id === o.id); return { ...o, w: el.w, h: el.h }; });
    const bx0 = Math.min(...O.map(o => Math.min(o.x, o.x + o.w))), bx1 = Math.max(...O.map(o => Math.max(o.x, o.x + o.w)));
    const by0 = Math.min(...O.map(o => Math.min(o.y, o.y + o.h))), by1 = Math.max(...O.map(o => Math.max(o.y, o.y + o.h)));
    if (!e.altKey) {
      const T = snapTargets(d.orig.map(o => o.id)), tol = snapTol();
      const sx = bestSnap([bx0 + dx, bx1 + dx, (bx0 + bx1) / 2 + dx], T.xs, tol);
      const sy = bestSnap([by0 + dy, by1 + dy, (by0 + by1) / 2 + dy], T.ys, tol);
      if (sx) { dx += sx.d; pr.guides.push({ x: sx.at }); } else dx = gridMm(bx0 + dx) - bx0;
      if (sy) { dy += sy.d; pr.guides.push({ y: sy.at }); } else dy = gridMm(by0 + dy) - by0;
    }
    const r2 = v => Math.round(v * 100) / 100;
    d.orig.forEach(o => { const el = pr.tpl.elements.find(x => x.id === o.id); el.x = r2(o.x + dx); el.y = r2(o.y + dy); });
  } else if (d.kind === "resize") {
    const o = d.orig, right = d.hi === 1 || d.hi === 3, bottom = d.hi >= 2;
    let px = mx, py = my;
    if (!e.altKey) {
      const T = snapTargets([o.id]), tol = snapTol();
      const sx = bestSnap([px], T.xs, tol), sy = bestSnap([py], T.ys, tol);
      if (sx) { px = sx.at; pr.guides.push({ x: sx.at }); } else px = gridMm(px);
      if (sy) { py = sy.at; pr.guides.push({ y: sy.at }); } else py = gridMm(py);
    }
    let x0 = right ? o.x : px, x1 = right ? px : o.x + o.w;
    let y0 = bottom ? o.y : py, y1 = bottom ? py : o.y + o.h;
    if (d.el.type === "line") { d.el.x = x0; d.el.y = y0; d.el.w = x1 - x0; d.el.h = y1 - y0; }
    else {
      if (x1 - x0 < 2) { if (right) x1 = x0 + 2; else x0 = x1 - 2; }
      if (y1 - y0 < 2) { if (bottom) y1 = y0 + 2; else y0 = y1 - 2; }
      // Bild, norrpil och QR behåller proportionerna (Shift = fritt)
      if ((d.el.type === "image" || d.el.type === "north" || d.el.type === "qr") && !e.shiftKey) {
        const ar = d.el.type === "image" ? (d.el.ar || o.w / o.h) : 1;
        const h = (x1 - x0) / ar;
        if (bottom) y1 = y0 + h; else y0 = y1 - h;
      }
      Object.assign(d.el, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  } else if (d.kind === "pan") {
    const { k } = pageDims();
    const dxMm = (mx - d.start[0]) * k, dyMm = (my - d.start[1]) * k;
    const mPerMm = d.el.scale / 1000, c0 = mToPx(d.center), ppm = pxPerMeter();
    const m = pdfToModel(toPdf([c0[0] - dxMm * mPerMm * ppm, c0[1] - dyMm * mPerMm * ppm]));
    d.el.center = [Math.round(m[0] * 100) / 100, Math.round(m[1] * 100) / 100];
  }
  pr.dirty = true;
  drawPrintPage();
  if (d.kind !== "pan") renderPrintProps(true);
}
function bandSelect(d) {
  const x0 = Math.min(d.start[0], d.cur[0]), x1 = Math.max(d.start[0], d.cur[0]), y0 = Math.min(d.start[1], d.cur[1]), y1 = Math.max(d.start[1], d.cur[1]);
  const inside = pr.tpl.elements.filter(el => { const b = elBox(el); return b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0; }).map(e => e.id);
  pr.sels = [...new Set([...(d.base || []), ...inside])];
}
function prMouseUp() {
  if (!pr || !pr.drag) return;
  if (pr.drag.kind === "move" && !pr.drag.moved) pr.undo.pop();
  pr.drag = null; pr.guides = [];
  setSel(pr.sels);
  renderPrintPanel(); drawPrintPage();
}
/* Zooma layouten kring en punkt på skärmen (canvas-px), eller till hela bladet. */
function prZoomAt(f, cx, cy) {
  const L = pr.L || layoutPreview(), dpr = L.dpr;
  const z0 = pr.zoom || 1, z1 = Math.max(1, Math.min(12, z0 * f));
  if (z1 === 1) { pr.zoom = 1; pr.vx = pr.vy = 0; drawPrintPage(); updatePrZoomUi(); return; }
  // Punkten under muspekaren ligger kvar: (cx - ox) skalas med z1/z0.
  const ox = L.ox, oy = L.oy, nox = cx - (cx - ox) * z1 / z0, noy = cy - (cy - oy) * z1 / z0;
  pr.zoom = z1;
  const base = layoutPreview(); // med nya zoomen, utan ny förskjutning
  pr.vx = ((pr.vx || 0) * dpr + nox - base.ox) / dpr; pr.vy = ((pr.vy || 0) * dpr + noy - base.oy) / dpr;
  drawPrintPage(); updatePrZoomUi();
}
function updatePrZoomUi() { const l = $("prZoomLbl"); if (l) l.textContent = Math.round((pr.zoom || 1) * 100) + " %"; }
function prWheel(e) {
  if (!pr) return;
  const one = primary();
  if (!one || one.type !== "map" || !pr.panMode || one.locked) {
    e.preventDefault();
    const r = $("prCanvas").getBoundingClientRect(), dpr = pr.L ? pr.L.dpr : (window.devicePixelRatio || 1);
    prZoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, (e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
    return;
  }
  e.preventDefault();
  const i = PRINT_SCALES.indexOf(one.scale), j = Math.max(0, Math.min(PRINT_SCALES.length - 1, (i < 0 ? PRINT_SCALES.indexOf(nearestScale(one.scale)) : i) + (e.deltaY > 0 ? 1 : -1)));
  if (PRINT_SCALES[j] !== one.scale) { pushUndo(); one.scale = PRINT_SCALES[j]; renderPrintPanel(); drawPrintPage(); }
}
const CLIP_KEY = "lagesplan-printclip";
function copySel(cut) {
  const els = selEls();
  if (!els.length) return;
  try { localStorage.setItem(CLIP_KEY, JSON.stringify({ from: pr.tpl.id, els, n: 0 })); } catch (e) {}
  pr.clip = { from: pr.tpl.id, els: JSON.parse(JSON.stringify(els)), n: 0 };
  setPrintStatus(`${els.length} element ${cut ? "urklippta" : "kopierade"}.`);
  if (cut) deleteSel();
}
function pasteClip() {
  let c = pr.clip;
  if (!c) { try { c = JSON.parse(localStorageGet(CLIP_KEY) || "null"); } catch (e) { c = null; } }
  if (!c || !c.els || !c.els.length) return;
  c.n = (c.n || 0) + 1;
  pr.clip = c;
  const off = c.from === pr.tpl.id ? 5 * c.n : 5 * (c.n - 1);
  pushUndo();
  const idMap = {};
  const add = JSON.parse(JSON.stringify(c.els)).map(e => { const id = ghNewId(); idMap[e.id] = id; return { ...e, id, x: e.x + off, y: e.y + off }; });
  add.forEach(e => { if (e.mapId && idMap[e.mapId]) e.mapId = idMap[e.mapId]; });
  pr.tpl.elements.push(...add);
  setSel(add.map(e => e.id));
  renderPrintPanel(); drawPrintPage();
}
function prKey(e) {
  if (!pr || $("printModal").classList.contains("hidden")) return;
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  const stop = () => { e.preventDefault(); e.stopPropagation(); };
  if (mod && k === "z") { stop(); e.shiftKey ? prRedo() : prUndo(); return; }
  if (mod && k === "y") { stop(); prRedo(); return; }
  if (mod && k === "c") { stop(); copySel(false); return; }
  if (mod && k === "x") { stop(); copySel(true); return; }
  if (mod && k === "v") { stop(); pasteClip(); return; }
  if (mod && k === "a") { stop(); setSel(pr.tpl.elements.map(x => x.id)); renderPrintPanel(); drawPrintPage(); return; }
  if (mod && k === "d" && pr.sels.length) { stop(); duplicateSel(); return; }
  if (e.key === "Escape") { e.stopPropagation(); if (pr.fmtAsk) { pr.fmtAsk = null; renderPrintPanel(); } else if (pr.sels.length) { setSel([]); renderPrintPanel(); drawPrintPage(); } else closePrint(); return; }
  if (mod && (k === "+" || k === "=")) { stop(); const c = $("prCanvas"); prZoomAt(1.25, c.width / 2, c.height / 2); return; }
  if (mod && k === "-") { stop(); const c = $("prCanvas"); prZoomAt(1 / 1.25, c.width / 2, c.height / 2); return; }
  if (mod && k === "0") { stop(); pr.zoom = 1; pr.vx = pr.vy = 0; drawPrintPage(); updatePrZoomUi(); return; }
  if (!pr.sels.length) return;
  if (e.key === "Delete" || e.key === "Backspace") { stop(); if (selEls().some(x => x.locked)) { setPrintStatus("🔒 Låsta element tas inte bort – lås upp dem först."); return; } deleteSel(); return; }
  const step = e.shiftKey ? 10 : 1;
  const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
  if (mv) { stop(); if (selEls().some(x => x.locked)) return; pushUndo(); selEls().forEach(el => { el.x += mv[0]; el.y += mv[1]; }); renderPrintProps(true); drawPrintPage(); }
}

function addEl(type) {
  const cx = PAGE_A3[0] / 2, cy = PAGE_A3[1] / 2;
  const firstMap = pr.tpl.elements.find(e => e.type === "map");
  const base = { id: ghNewId(), type, x: cx - 30, y: cy - 15, w: 60, h: 30 };
  const extra = {
    text: { text: "Ny text", size: 10, bold: false, align: "left", color: "#000000", w: 60, h: 14 },
    image: { path: null, ar: 1, w: 40, h: 40 },
    legend: { title: "FÖRKLARINGAR", cols: 2, size: 7, phases: true, site: true, cad: false, extra: "", w: 120, h: 50 },
    scalebar: { w: 70, h: 16, mapId: firstMap && firstMap.id },
    north: { w: 20, h: 20, style: "rose4", color: "#000000", mapId: firstMap && firstMap.id },
    qr: { text: "https://", w: 30, h: 30 },
    title: { size: 7, ...TITLE_CARD_DEFAULTS, w: 85, h: 69 },
    rect: { stroke: "#000000", lw: 0.35, fill: "" },
    line: { stroke: "#000000", lw: 0.35, w: 60, h: 0 },
  }[type];
  pushUndo();
  const el = type === "map" ? { ...newMapEl(cx - 100, cy - 70, 200, 140, pr.tpl.format), label: { show: true, name: "Ny vy", size: 9, align: "left" } } : { ...base, ...extra };
  el.x = Math.max(0, Math.min(PAGE_A3[0] - el.w, cx - el.w / 2)); el.y = Math.max(0, Math.min(PAGE_A3[1] - Math.max(el.h, 1), cy - el.h / 2));
  pr.tpl.elements.push(el);
  setSel([el.id]);
  renderPrintPanel(); drawPrintPage();
  if (type === "image") $("prImgInput").click();
}
function deleteSel() { pushUndo(); const ids = pr.sels; pr.tpl.elements = pr.tpl.elements.filter(x => !ids.includes(x.id)); setSel([]); renderPrintPanel(); drawPrintPage(); }
function duplicateSel() {
  pushUndo();
  const copies = selEls().map(el => ({ ...JSON.parse(JSON.stringify(el)), id: ghNewId(), x: el.x + 5, y: el.y + 5 }));
  pr.tpl.elements.push(...copies); setSel(copies.map(c => c.id)); renderPrintPanel(); drawPrintPage();
}
function orderSel(dir) {
  pushUndo();
  const ids = pr.sels, a = pr.tpl.elements, moving = a.filter(e => ids.includes(e.id)), rest = a.filter(e => !ids.includes(e.id));
  pr.tpl.elements = dir === "top" ? [...rest, ...moving] : [...moving, ...rest];
  drawPrintPage();
}
/* Justera flera element mot varandra. */
function alignSel(how) {
  const els = selEls();
  if (els.length < 2) return;
  pushUndo();
  const b = els.map(elBox);
  const x0 = Math.min(...b.map(q => q.x)), x1 = Math.max(...b.map(q => q.x + q.w)), y0 = Math.min(...b.map(q => q.y)), y1 = Math.max(...b.map(q => q.y + q.h));
  els.forEach((el, i) => {
    const q = b[i];
    if (how === "left") el.x += x0 - q.x;
    if (how === "right") el.x += x1 - (q.x + q.w);
    if (how === "hcenter") el.x += (x0 + x1) / 2 - (q.x + q.w / 2);
    if (how === "top") el.y += y0 - q.y;
    if (how === "bottom") el.y += y1 - (q.y + q.h);
    if (how === "vcenter") el.y += (y0 + y1) / 2 - (q.y + q.h / 2);
  });
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
  // Val vid formatbyte
  const ask = $("prFmtAsk");
  if (pr.fmtAsk) {
    const to = pr.fmtAsk, kOld = PRINT_FORMATS[pr.tpl.format].w, kNew = PRINT_FORMATS[to].w;
    const ex = pr.tpl.elements.find(e => e.type === "map");
    const ns = ex ? nearestScale(ex.scale * kOld / kNew) : null;
    ask.innerHTML = `<div class="hint" style="margin:0 0 6px;">Byta till ${to}. Ritningarnas ramar blir ${kNew > kOld ? "dubbelt så stora" : "hälften så stora"} på papperet.</div>
      <div class="row split"><button id="prKeepScale" title="Samma skala – ramen visar ${kNew > kOld ? "mer" : "mindre"} område">Behåll skala${ex ? ` (1:${ex.scale})` : ""}</button>
      <button id="prKeepView" class="primary" title="Samma område – skalan ändras">Behåll utsnitt${ex ? ` (1:${ns})` : ""}</button></div>`;
    ask.classList.remove("hidden");
    $("prKeepScale").onclick = () => applyFormat(to, false);
    $("prKeepView").onclick = () => applyFormat(to, true);
  } else ask.classList.add("hidden");
  renderPrintProps();
}
function applyFormat(to, keepView) {
  pushUndo();
  const kOld = PRINT_FORMATS[pr.tpl.format].w, kNew = PRINT_FORMATS[to].w;
  if (keepView) pr.tpl.elements.filter(e => e.type === "map").forEach(e => { e.scale = nearestScale(e.scale * kOld / kNew); });
  pr.tpl.format = to; pr.fmtAsk = null;
  mapPreviews.clear(); mapPending.clear();
  renderPrintPanel(); drawPrintPage();
}
function northThumb(style, color) {
  const c = newCanvas(64, 64), ctx = c.getContext("2d");
  ctx.translate(32, 34); drawNorthStyle(ctx, style, 26, color || "#000");
  return c.toDataURL();
}
function renderPrintProps(onlyPos) {
  const box = $("prProps");
  const els = selEls(), el = primary();
  if (onlyPos && el) { ["x", "y", "w", "h"].forEach(f => { const i = box.querySelector(`[data-f="${f}"]`); if (i && document.activeElement !== i) i.value = Math.round(el[f] * 10) / 10; }); return; }
  if (onlyPos) return;
  if (!els.length) { box.innerHTML = `<div class="hint">Klicka på ett element för att ändra det. Shift-klicka eller dra en ruta för att markera flera. Kanterna snäpper mot varandra (Alt = fritt). Piltangenter flyttar 1 mm (Shift 10 mm), Delete tar bort, Ctrl+C / Ctrl+V kopierar och klistrar in, Ctrl+D duplicerar, Ctrl+Z ångrar.</div>`; return; }
  if (els.length > 1) {
    box.innerHTML = `<div class="row"><b>${els.length} element markerade</b><span class="grow"></span>
        <button class="icon ghost" id="prDup" title="Duplicera (Ctrl+D)">⧉</button><button class="icon ghost" id="prUp" title="Lägg överst">⤒</button><button class="icon ghost" id="prDown" title="Lägg underst">⤓</button><button class="icon ghost" id="prDel" title="Ta bort (Delete)">🗑️</button></div>
      <label>Justera</label>
      <div class="row" style="gap:4px;">${[["left", "⇤", "Vänsterkanter"], ["hcenter", "↔", "Mitten (vågrätt)"], ["right", "⇥", "Högerkanter"], ["top", "⤒", "Överkanter"], ["vcenter", "↕", "Mitten (lodrätt)"], ["bottom", "⤓", "Nederkanter"]].map(([h, i, t]) => `<button class="icon" data-align="${h}" title="${t}">${i}</button>`).join("")}</div>`;
    box.querySelectorAll("[data-align]").forEach(b => { b.onclick = () => alignSel(b.dataset.align); });
    $("prDup").onclick = duplicateSel; $("prUp").onclick = () => orderSel("top"); $("prDown").onclick = () => orderSel("bottom"); $("prDel").onclick = deleteSel;
    return;
  }
  const t = ELEMENT_TYPES[el.type];
  const inp = (f, label, type = "text", attrs = "") => `<label>${label}</label><input type="${type}" data-f="${f}" value="${escHtml(el[f] ?? "")}" ${attrs} />`;
  const num = (f, label, step = "0.5") => `<div><label>${label}</label><input type="number" step="${step}" data-f="${f}" data-num="1" value="${Math.round((el[f] || 0) * 10) / 10}" /></div>`;
  const chk = (f, label) => `<label class="check"><input type="checkbox" data-f="${f}"${el[f] ? " checked" : ""} /> ${label}</label>`;
  const color = (f, label) => `<div><label>${label}</label><div class="row" style="flex-wrap:nowrap;"><input type="color" data-f="${f}" value="${escHtml(el[f] || "#000000")}" class="pr-color" /><button type="button" class="icon ghost pr-nocolor" data-f="${f}" title="Ingen">∅</button></div></div>`;
  const maps = pr.tpl.elements.filter(e => e.type === "map");
  const mapSel = () => maps.length > 1 ? `<label>Hör till ritning</label><select data-f="mapId">${maps.map((m, i) => `<option value="${escHtml(m.id)}"${(mapFor(el, pr.tpl) || {}).id === m.id ? " selected" : ""}>${escHtml(m.label && m.label.name || "Ritning " + (i + 1))} (1:${m.scale})</option>`).join("")}</select>` : "";
  let html = `<div class="row"><b>${t.icon} ${t.label}</b><span class="grow"></span>
      <button class="icon ghost" id="prDup" title="Duplicera (Ctrl+D)">⧉</button>
      <button class="icon ghost" id="prUp" title="Lägg överst">⤒</button>
      <button class="icon ghost" id="prDown" title="Lägg underst">⤓</button>
      <button class="icon ghost" id="prDel" title="Ta bort (Delete)">🗑️</button>
      <button class="icon ${el.locked ? "pr-locked" : "ghost"}" id="prLock" title="${el.locked ? "Låst – klicka för att låsa upp" : "Lås (kan inte flyttas, ändras i storlek eller tas bort av misstag)"}">${el.locked ? "🔒" : "🔓"}</button></div>
    ${el.locked ? `<div class="hint" style="margin:2px 0 4px;">🔒 Låst – flyttas inte med musen eller piltangenterna.${el.type === "map" ? " Utsnittet och skalan kan inte heller ändras genom att dra." : ""}</div>` : ""}
    <div class="pr-grid4">${num("x", "X (mm)")}${num("y", "Y (mm)")}${num("w", "Bredd")}${num("h", "Höjd")}</div>`;
  if (el.type === "text") html += `<label>Text <span class="muted">– {plan} {datum} {idag} {skala} {format} {användare} {utskriven}</span></label><textarea data-f="text" rows="4">${escHtml(el.text || "")}</textarea>
      <div class="pr-grid4">${num("size", "Storlek (pt)", "0.5")}<div><label>Justering</label><select data-f="align">${["left", "center", "right"].map(a => `<option value="${a}"${el.align === a ? " selected" : ""}>${{ left: "Vänster", center: "Mitten", right: "Höger" }[a]}</option>`).join("")}</select></div>${color("color", "Färg")}${color("fill", "Bakgrund")}</div>
      ${chk("bold", "Fetstil")} <div class="pr-grid4">${color("border", "Ram")}</div>`;
  if (el.type === "image") html += `<button id="prPickImg" class="block" style="margin-top:8px;">🖼 ${el.path ? "Byt bild…" : "Välj bild…"}</button><div class="hint">PNG, JPG eller SVG – t.ex. företagets logga eller skyltar. Bilden sparas i projektet. Proportionerna behålls (Shift = fritt).</div>
      ${el.path ? `<label style="margin-top:8px;">Beskär (% av bilden)</label><div class="pr-grid4">${num("cropL", "Vänster", "1")}${num("cropR", "Höger", "1")}${num("cropT", "Över", "1")}${num("cropB", "Under", "1")}</div>
      ${chk("knockout", "Gör vit bakgrund genomskinlig")}
      ${el.knockout ? `<div class="pr-grid4">${num("knockTol", "Hur nära vitt", "5")}</div><div class="hint">Högre värde tar bort mer av ljusa färger (standard 30).</div>` : ""}
      ${el.cropL || el.cropR || el.cropT || el.cropB || el.knockout ? `<button type="button" id="prImgReset" style="margin-top:6px;">↺ Original (ingen beskärning)</button>` : ""}` : ""}`;
  if (el.type === "map") {
    const lb = el.label || {}, cfg = el.layers || { follow: true, keys: {} };
    const vw = vpView(el), views = typeof lsViews === "function" ? lsViews() : [];
    const locked = cfg.follow || !!vw, vkeys = vpKeys(el);
    const layerRows = printLayerList().map(l => {
      const on = vkeys ? !!vkeys[l.key] : !!ls(l.key).visible;
      return `<label class="check pr-lay${l.sub ? " sub" : ""}"><input type="checkbox" data-lay="${escHtml(l.key)}"${on ? " checked" : ""}${locked ? " disabled" : ""} /> <span>${escHtml(l.label)}</span></label>`;
    }).join("");
    const viewSel = views.length ? `<div class="row" style="flex-wrap:nowrap;margin-top:4px;"><select id="prView" class="grow" title="Använd en sparad vy från Lager: dess tända lager, ortofoton och DXF-lager"><option value="">Ingen sparad vy</option>${views.map(v => `<option value="${escHtml(v.id)}"${vw && vw.id === v.id ? " selected" : ""}>📑 ${escHtml(v.name)}</option>`).join("")}</select>${vw && vw.camera ? `<button id="prViewCam" title="Samma utsnitt som vyn (mitt och skala)">🔍 Vyns utsnitt</button>` : ""}</div>` : "";
    html += `<div class="pr-grid4"><div style="grid-column:span 2;"><label>Skala</label><select data-f="scale" data-num="1">${[...new Set([...PRINT_SCALES, el.scale])].sort((a, b) => a - b).map(s => `<option value="${s}"${el.scale === s ? " selected" : ""}>1:${s}</option>`).join("")}</select></div></div>
      <div class="row split" style="margin-top:8px;"><button id="prPan" class="${pr.panMode ? "active" : ""}" title="${el.locked ? "Låst – lås upp för att flytta utsnittet" : "Dra i ritningen för att flytta utsnittet, scrolla för att byta skala"}"${el.locked ? " disabled" : ""}>✋ Panorera</button><button id="prFromView" title="Samma utsnitt som på skärmen"${el.locked ? " disabled" : ""}>⤢ Skärmens utsnitt</button></div>
      ${chk("border", "Ram runt ritningen")}
      <label class="check"><input type="checkbox" id="prLblShow"${lb.show ? " checked" : ""} /> <b>Visa namn &amp; skala</b></label>
      <div class="pr-grid4"><div style="grid-column:span 4;"><label>Vyns namn</label><input type="text" id="prLblName" value="${escHtml(lb.name || "")}" placeholder="t.ex. Översikt etablering" /></div>
        <div><label>Storlek (pt)</label><input type="number" step="0.5" id="prLblSize" value="${lb.size || 9}" /></div>
        <div style="grid-column:span 2;"><label>Justering</label><select id="prLblAlign">${["left", "center", "right"].map(a => `<option value="${a}"${(lb.align || "left") === a ? " selected" : ""}>${{ left: "Vänster", center: "Mitten", right: "Höger" }[a]}</option>`).join("")}</select></div></div>
      <label style="margin-top:10px;"><b>Visa i ritningen</b></label>
      ${viewSel}
      ${vw ? `<div class="hint" style="margin:2px 0 4px;">Ritningen visar vyn "${escHtml(vw.name)}". Ändras vyn följer utskriften med.</div>` : `<label class="check"><input type="checkbox" id="prFollow"${cfg.follow ? " checked" : ""} /> Följ skärmen (lagren som är tända där)</label>`}
      <div class="pr-layers${locked ? " off" : ""}">${layerRows}</div>
      <div class="row" style="margin-top:4px;"><button id="prLayAll" ${locked ? "disabled" : ""}>Alla</button><button id="prLayNone" ${locked ? "disabled" : ""}>Inga</button><button id="prLayScreen" ${locked ? "disabled" : ""} title="Samma som är tänt på skärmen just nu">Som skärmen</button></div>
      <div class="hint">Skalan gäller på ${pr.tpl.format}. Skriv ut i verklig storlek (100 %).</div>`;
  }
  if (el.type === "legend") html += inp("title", "Rubrik") + `<div class="pr-grid4">${num("size", "Storlek (pt)", "0.5")}${num("cols", "Kolumner", "1")}</div>
      ${chk("phases", "Statusfärger (faser)")}${chk("site", "Etablering som finns på planen")}${chk("cad", "CAD-ritningar")}
      <label>Egna rader <span class="muted">(t.ex. "#e11d48 Betongbarriär")</span></label><textarea data-f="extra" rows="3">${escHtml(el.extra || "")}</textarea>
      <div class="pr-grid4">${num("legSpacing", "Radavstånd (×)", "0.1")}</div>${chk("legNoEq", "Utan =-tecken")}
      <label>Rader <span class="muted">– bock = visa, färg, egen text, ↑↓ ordning</span></label>
      <div class="pr-leg">${legendItems(el, true).map((it, i, arr) => `<div class="pr-leg-row${it.hidden ? " off" : ""}" data-lk="${escHtml(it.key)}">
        <input type="checkbox" class="pl-vis"${it.hidden ? "" : " checked"} title="Visa raden" />
        ${it.kind === "text" ? "<span></span>" : `<input type="color" class="pl-col" value="${escHtml(/^#[0-9a-f]{6}$/i.test(it.color || "") ? it.color.toLowerCase() : "#000000")}" title="Färg" />`}
        <input type="text" class="pl-txt" value="${escHtml(it.label)}" placeholder="${escHtml(it.origLabel)}" />
        <button type="button" class="pl-up icon ghost" title="Flytta upp"${i ? "" : " disabled"}>↑</button><button type="button" class="pl-dn icon ghost" title="Flytta ner"${i < arr.length - 1 ? "" : " disabled"}>↓</button>
      </div>`).join("") || `<div class="hint">Inga rader – bocka i vad förklaringen ska visa ovan.</div>`}</div>
      ${el.legHide || el.legText || el.legColor || el.legOrder ? `<button type="button" id="prLegReset" style="margin-top:4px;">↺ Återställ raderna</button>` : ""}`;
  if (el.type === "title") {
    const card = el.style === "card";
    const cells = String(el.rows || "").split("\n").map(r => r.split("|").map(c => { const i = c.indexOf(":"); return i >= 0 ? [c.slice(0, i).trim(), c.slice(i + 1).trim()] : ["", c.trim()]; }));
    html += `<label>Utseende</label><select id="prTbStyle"><option value="card"${card ? " selected" : ""}>Kort med rubrik och logga</option><option value="classic"${card ? "" : " selected"}>Enkel ruta</option></select>`
      + (card ? inp("heading", "Rubrik") + `<div class="pr-grid4">${color("color", "Färg")}${num("size", "Storlek (pt)", "0.5")}</div>
        <label>Logga i foten</label><div class="row" style="flex-wrap:nowrap;"><button type="button" id="prTbLogo">${el.logo ? "🖼 Byt logga…" : "🖼 Välj logga…"}</button>${el.logo ? `<button type="button" id="prTbLogoDel" class="ghost" title="Ingen logga">✕</button>` : ""}</div>
        ${el.logo ? chk("logoWhite", "Gör loggan vit") + `<label>Loggans storlek <span class="muted" id="prLogoSizeV">${Number(el.logoSize) || 60} %</span></label><input type="range" min="20" max="90" step="5" data-f="logoSize" data-num="1" value="${Number(el.logoSize) || 60}" oninput="document.getElementById('prLogoSizeV').textContent = this.value + ' %'" />` : ""}` : `<div class="pr-grid4">${num("size", "Storlek (pt)", "0.5")}</div>`)
      + `<label>Rader <span class="muted">– etikett och text, ⇆ delar raden i två</span></label>
      <div class="pr-tb">${cells.map((row, r) => `<div class="pr-tb-row" data-r="${r}">${row.map(([l, v], c) => `<div class="pr-tb-cell" data-c="${c}"><input type="text" class="tb-l" value="${escHtml(l)}" placeholder="ETIKETT" /><input type="text" class="tb-v" value="${escHtml(v)}" placeholder="Text" /></div>`).join("")}
        <div class="pr-tb-btns"><button type="button" class="tb-split icon ghost" title="${row.length > 1 ? "Slå ihop till en cell" : "Dela i två celler"}">⇆</button><button type="button" class="tb-up icon ghost" title="Flytta upp"${r ? "" : " disabled"}>↑</button><button type="button" class="tb-del icon ghost" title="Ta bort raden">🗑</button></div></div>`).join("")}</div>
      <button type="button" id="prTbAdd" style="margin-top:4px;">＋ Rad</button>
      <div class="hint">Platshållare: {plan} {datum} {idag} {skala} {format} {användare} {utskriven}</div>`;
  }
  if (el.type === "qr") html += inp("text", "Länk eller text") + chk("frame", "<b>Ram med egen text</b>")
    + (el.frame ? inp("title", "Rubrik") + inp("subtitle", "Underrubrik") + inp("footer", "Text längst ner")
      + `<div class="pr-grid4">${color("frameColor", "Ramens färg")}</div>${chk("phone", "Mobil-ikon")}<div class="hint">Platshållare: {plan} {datum} {idag}</div>` : "");
  if (el.type === "rect") html += `<div class="pr-grid4">${color("stroke", "Linje")}${color("fill", "Fyllning")}${num("lw", "Tjocklek (mm)", "0.05")}</div>`;
  if (el.type === "line") html += `<div class="pr-grid4">${color("stroke", "Färg")}${num("lw", "Tjocklek (mm)", "0.05")}</div><div class="hint">Höjd 0 = vågrät linje, bredd 0 = lodrät.</div>`;
  if (el.type === "north") html += `<label>Utseende</label><div class="pr-north">${Object.entries(NORTH_STYLES).map(([s, n]) => `<button type="button" data-north="${s}" class="${(el.style || "rose4") === s ? "on" : ""}" title="${n}"><img src="${northThumb(s, el.color)}" alt="" /><span>${n}</span></button>`).join("")}</div>
      <div class="pr-grid4">${color("color", "Färg")}</div>${mapSel()}<div class="hint">Vrids efter ritningens riktning mot norr.</div>`;
  if (el.type === "scalebar") html += mapSel() + `<div class="hint">Följer ritningens skala.</div>`;
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
      if (f === "color" && el.type === "north") { renderPrintProps(); }
      // Beskärning ändrar bildens proportioner: rutan följer med (bredden behålls).
      if (el.type === "image" && /^crop/.test(f)) { const im = printImage(el.path); if (im) { printImageSource(el, im); el.h = Math.round(el.w / el.ar * 10) / 10; } }
      if (el.type === "image" && f === "knockout") renderPrintProps();
      // Ram runt QR-koden: standardtexter första gången, och kortets proportioner.
      if (el.type === "qr" && f === "frame") {
        if (el.frame) { Object.entries(QR_CARD_DEFAULTS).forEach(([k, v]) => { if (el[k] === undefined) el[k] = v; }); el.h = Math.round(el.w * 1.47 * 10) / 10; }
        else el.h = el.w;
        renderPrintProps();
      }
      drawPrintPage();
    });
  });
  const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
  on("prDup", duplicateSel);
  on("prUp", () => orderSel("top"));
  on("prDown", () => orderSel("bottom"));
  on("prDel", deleteSel);
  on("prPickImg", () => $("prImgInput").click());
  on("prLock", () => { pushUndo(); el.locked = !el.locked; if (el.locked && pr.panMode) pr.panMode = false; renderPrintPanel(); drawPrintPage(); });
  // Förklaringens rader.
  box.querySelectorAll(".pr-leg-row").forEach(row => {
    const key = row.dataset.lk, q = c => row.querySelector(c);
    const edit = (fn, rerender) => { pushUndo(); fn(); pr.dirty = true; $("prSave").classList.add("primary"); $("prSave").textContent = "💾 Spara mall *"; if (rerender) renderPrintProps(); drawPrintPage(); };
    q(".pl-vis").onchange = () => edit(() => { el.legHide = { ...(el.legHide || {}) }; if (q(".pl-vis").checked) delete el.legHide[key]; else el.legHide[key] = true; row.classList.toggle("off", !q(".pl-vis").checked); });
    const c = q(".pl-col"); if (c) c.onchange = () => edit(() => { el.legColor = { ...(el.legColor || {}), [key]: c.value }; });
    q(".pl-txt").onchange = () => edit(() => { const v = q(".pl-txt").value.trim(); el.legText = { ...(el.legText || {}) }; if (v && v !== q(".pl-txt").placeholder) el.legText[key] = v; else delete el.legText[key]; });
    const move = d => edit(() => { const keys = legendItems(el, true).map(it => it.key), i = keys.indexOf(key), j = i + d; if (j < 0 || j >= keys.length) return; [keys[i], keys[j]] = [keys[j], keys[i]]; el.legOrder = keys; }, true);
    q(".pl-up").onclick = () => move(-1); q(".pl-dn").onclick = () => move(1);
  });
  // Ritningshuvudets rader: läs fälten tillbaka till "ETIKETT: värde | …".
  const tbRows = () => [...box.querySelectorAll(".pr-tb-row")].map(row => [...row.querySelectorAll(".pr-tb-cell")].map(c => [c.querySelector(".tb-l").value.trim(), c.querySelector(".tb-v").value]));
  const tbSave = (rows, rerender) => {
    el.rows = rows.map(cs => cs.map(([l, v]) => (l ? `${l}: ${v}` : v).replace(/\|/g, "/")).join(" | ")).join("\n");
    pr.dirty = true; $("prSave").classList.add("primary"); $("prSave").textContent = "💾 Spara mall *";
    if (rerender) renderPrintProps(); drawPrintPage();
  };
  box.querySelectorAll(".pr-tb-row").forEach(row => {
    const r = Number(row.dataset.r);
    row.querySelectorAll("input").forEach(i => i.addEventListener("input", () => { if (!i._u) { pushUndo(); i._u = true; setTimeout(() => { i._u = false; }, 800); } tbSave(tbRows()); }));
    row.querySelector(".tb-split").onclick = () => { pushUndo(); const rows = tbRows(); rows[r] = rows[r].length > 1 ? [[rows[r][0][0], rows[r].map(c => c[1]).filter(Boolean).join(" ")]] : [rows[r][0], ["", ""]]; tbSave(rows, true); };
    row.querySelector(".tb-up").onclick = () => { pushUndo(); const rows = tbRows(); [rows[r - 1], rows[r]] = [rows[r], rows[r - 1]]; tbSave(rows, true); };
    row.querySelector(".tb-del").onclick = () => { pushUndo(); const rows = tbRows(); rows.splice(r, 1); tbSave(rows, true); };
  });
  on("prTbAdd", () => { pushUndo(); tbSave([...tbRows(), [["", ""]]], true); });
  if ($("prTbStyle")) $("prTbStyle").onchange = e => {
    pushUndo(); el.style = e.target.value;
    if (el.style === "card") { if (el.heading === undefined) el.heading = TITLE_CARD_DEFAULTS.heading; if (!el.color) el.color = TITLE_CARD_DEFAULTS.color; }
    renderPrintProps(); drawPrintPage();
  };
  on("prTbLogo", () => $("prImgInput").click());
  on("prTbLogoDel", () => { pushUndo(); delete el.logo; renderPrintProps(); drawPrintPage(); });
  on("prLegReset", () => { pushUndo(); delete el.legHide; delete el.legText; delete el.legColor; delete el.legOrder; renderPrintProps(); drawPrintPage(); });
  on("prImgReset", () => { pushUndo(); ["cropL", "cropR", "cropT", "cropB"].forEach(k => delete el[k]); el.knockout = false; const im = printImage(el.path); if (im) { printImageSource(el, im); el.h = Math.round(el.w / el.ar * 10) / 10; } renderPrintProps(); drawPrintPage(); });
  on("prPan", () => { pr.panMode = !pr.panMode; renderPrintProps(); drawPrintPage(); });
  on("prFromView", () => { pushUndo(); el.center = viewCenterModel(); el.scale = fitScale(el.w, el.h, pr.tpl.format); renderPrintPanel(); drawPrintPage(); });
  box.querySelectorAll("[data-north]").forEach(b => { b.onclick = () => { pushUndo(); el.style = b.dataset.north; renderPrintProps(); drawPrintPage(); }; });
  if (el.type === "map") {
    const lbl = patch => { pushUndo(); el.label = { show: false, name: "", size: 9, align: "left", ...(el.label || {}), ...patch }; drawPrintPage(); };
    $("prLblShow").onchange = e => lbl({ show: e.target.checked });
    $("prLblName").oninput = e => { if (!e.target._u) { pushUndo(); e.target._u = true; setTimeout(() => { e.target._u = false; }, 800); } el.label = { ...(el.label || {}), name: e.target.value }; pr.dirty = true; drawPrintPage(); };
    $("prLblSize").oninput = e => { el.label = { ...(el.label || {}), size: Number(e.target.value) || 9 }; pr.dirty = true; drawPrintPage(); };
    $("prLblAlign").onchange = e => lbl({ align: e.target.value });
    const setLayers = keys => { pushUndo(); el.layers = { follow: false, keys }; renderPrintProps(); drawPrintPage(); };
    if ($("prFollow")) $("prFollow").onchange = e => { pushUndo(); el.layers = { follow: e.target.checked, keys: (el.layers && el.layers.keys) || snapshotLayers() }; renderPrintProps(); drawPrintPage(); };
    if ($("prView")) $("prView").onchange = e => {
      pushUndo();
      // Ingen vy: behåll vyns lager som eget urval, så inget ändras i ritningen.
      el.layers = e.target.value ? { follow: false, view: e.target.value, keys: vpKeys(el) || snapshotLayers() } : { follow: false, keys: vpKeys(el) || snapshotLayers() };
      pr.dirty = true; renderPrintProps(); drawPrintPage();
    };
    on("prViewCam", () => {
      const v = vpView(el), c = v && v.camera;
      if (!c || !viewport || !plan || !plan.calib) return;
      if (c.plan && c.plan !== plan.id) { setPrintStatus("Vyns utsnitt hör till en annan plan."); return; }
      const pc = $("pdfCanvas"), m = pdfToModel(toPdf([c.fx * pc.width, c.fy * pc.height]));
      const { k } = pageDims(), need = c.span * renderScale / pxPerMeter() * 1000 / (el.w * k);
      pushUndo();
      el.center = [Math.round(m[0] * 100) / 100, Math.round(m[1] * 100) / 100];
      el.scale = PRINT_SCALES.find(s => s >= need) || PRINT_SCALES[PRINT_SCALES.length - 1];
      pr.dirty = true; renderPrintPanel(); drawPrintPage();
    });
    box.querySelectorAll("[data-lay]").forEach(c => {
      c.onchange = () => {
        const keys = { ...((el.layers && el.layers.keys) || {}) };
        keys[c.dataset.lay] = c.checked;
        // En CAD-ritning tänds/släcks med sina lager
        if (c.dataset.lay.startsWith("cad:")) printLayerList().filter(l => l.parent === c.dataset.lay).forEach(l => { keys[l.key] = c.checked; });
        setLayers(keys);
      };
    });
    on("prLayAll", () => { const keys = {}; printLayerList().forEach(l => { keys[l.key] = true; }); setLayers(keys); });
    on("prLayNone", () => setLayers({}));
    on("prLayScreen", () => setLayers(snapshotLayers()));
  }
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
  pr = { ...pr, tpl: migrateTpl(JSON.parse(JSON.stringify(t))), saved: true, sels: [], dirty: false, undo: [], redo: [], panMode: false, fmtAsk: null };
  if (pr.clip) pr.clip.n = 0;
  try { localStorage.setItem("lagesplan-printtpl", t.id); } catch (e) {}
  renderPrintPanel(); drawPrintPage();
}
function newTemplate(copy) {
  const name = (prompt(copy ? "Namn på kopian:" : "Namn på den nya mallen:", copy ? pr.tpl.name + " (kopia)" : "Ny mall") || "").trim();
  if (!name) return;
  const t = copy ? { ...JSON.parse(JSON.stringify(pr.tpl)), id: ghNewId(), name } : { ...defaultTemplate(), name };
  if (copy) { const idMap = {}; t.elements.forEach(e => { const n = ghNewId(); idMap[e.id] = n; e.id = n; }); t.elements.forEach(e => { if (e.mapId) e.mapId = idMap[e.mapId]; }); }
  pr = { ...pr, tpl: t, saved: false, sels: [], dirty: true, undo: [], redo: [], panMode: false, fmtAsk: null };
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
    // Loggan i ritningshuvudet måste vara hämtad innan kortet rastreras.
    for (const e of tpl.elements) if (e.type === "title" && e.logo && !printImage(e.logo)) await printImgs.get(e.logo);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [W, H], compress: true });
    doc.setProperties({ title: fillText("Lägesplan {plan}", tpl), creator: "4D-planering – Lägesplan" });
    const rasterEl = (el, dpi) => {
      const u = dpi / 25.4, c = newCanvas(Math.max(1, Math.ceil(Math.abs(el.w) * k * u)), Math.max(1, Math.ceil(Math.abs(el.h) * k * u)));
      drawElement(c.getContext("2d"), { ...el, x: 0, y: 0 }, tpl, u, k);
      return c;
    };
    const maps = tpl.elements.filter(e => e.type === "map");
    // Ritnings-PDF:en som vektorer: UNDER/ÖVER-sidor som sätts ihop med pdf-lib.
    let vec = null;
    if (maps.length && typeof vecBegin === "function" && pdfVectorPref()) {
      setPrintStatus("Laddar ritningen som vektorer…");
      try { vec = await vecBegin(doc); } catch (e) { console.warn("Vektor-PDF", e); vec = null; }
    }
    for (const el of tpl.elements) {
      const x = el.x * k, y = el.y * k, w = el.w * k, h = el.h * k;
      if (el.type === "map") {
        const nr = maps.indexOf(el) + 1;
        setPrintStatus(`Ritar ritning ${nr} av ${maps.length} i hög upplösning…`);
        const u = fmt.dpi / 25.4;
        const mc = await renderMapCanvas(el, w, h, Math.round(w * u), Math.round(h * u), { vectorCad: true, vectorPdf: !!vec, status: s => setPrintStatus(`Ritning ${nr}/${maps.length}: ${s}…`) });
        // Egen lagergrupp per ritningsyta: staplingen blir som i mallen.
        if (vec) { vecNewGroup(vec); vecUnder(vec); }
        doc.addImage(mc.base.toDataURL("image/jpeg", 0.9), "JPEG", x, y, w, h, undefined, "FAST");
        if (vec) {
          vecOver(vec);
          const f0 = w / mc.P.W, S0 = mc.P.S * f0;
          if (mc.P.pdfInfo && mc.P.pdfInfo.visible) vecAddPlan(vec, [x, y, w, h], [S0, 0, 0, S0, x - mc.P.x0 * S0, y - mc.P.y0 * S0], mc.P.pdfInfo.opacity, mc.P.pdfInfo.multiply);
        }
        if (mc.cad.length) {
          // DXF som vektorer: stage-px -> mm på sidan.
          setPrintStatus(`Ritning ${nr}/${maps.length}: DXF som vektorer…`);
          const f = w / mc.P.W, S = mc.P.S * f;
          drawCadVectorsToPdf(doc, mc.cad, [S, 0, 0, S, x - mc.P.x0 * S, y - mc.P.y0 * S], [x, y, w, h], w / FILM_W, PT_MM);
        }
        if (mc.overlay) doc.addImage(mc.overlay.toDataURL("image/png"), "PNG", x, y, w, h, undefined, "FAST");
        if (el.border !== false) { doc.setDrawColor(0); doc.setLineWidth(0.35 * k); doc.rect(x, y, w, h); }
        if (el.label && el.label.show) {
          const s = (el.label.size || 9) * k, al = el.label.align || "left";
          const tx = al === "center" ? x + w / 2 : al === "right" ? x + w : x;
          let ty = y + h + 1.5 * k;
          doc.setTextColor(0);
          if (el.label.name) { doc.setFont("helvetica", "bold"); doc.setFontSize(s); doc.text(el.label.name, tx, ty, { baseline: "top", align: al }); ty += s * PT_MM * 1.25; }
          doc.setFont("helvetica", "normal"); doc.setFontSize(s * 0.85); doc.text(`Skala 1:${el.scale}`, tx, ty, { baseline: "top", align: al });
        }
      } else if (el.type === "image") {
        const im = el.path ? printImage(el.path) || await printImgs.get(el.path) : null;
        if (!im) continue;
        const S = printImageSource(el, im), ar = S.sw / S.sh || 1;
        let iw = w, ih = w / ar; if (ih > h) { ih = h; iw = h * ar; }
        const c = newCanvas(Math.min(4000, Math.round(iw / 25.4 * 300)), Math.min(4000, Math.round(ih / 25.4 * 300)));
        c.getContext("2d").drawImage(S.src, S.sx, S.sy, S.sw, S.sh, 0, 0, c.width, c.height);
        doc.addImage(c.toDataURL("image/png"), "PNG", x + (w - iw) / 2, y + (h - ih) / 2, iw, ih, undefined, "FAST");
      } else if (el.type === "text") {
        if (el.fill) { doc.setFillColor(...hexRgb(el.fill)); doc.rect(x, y, w, h, "F"); }
        if (el.border) { doc.setDrawColor(...hexRgb(el.border)); doc.setLineWidth(0.3 * k); doc.rect(x, y, w, h); }
        const size = (el.size || 10) * k, pad = 1.2 * k;
        doc.setFont("helvetica", el.bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...hexRgb(el.color));
        const lines = doc.splitTextToSize(fillText(el.text, tpl), w - 2 * pad);
        const tx = el.align === "center" ? x + w / 2 : el.align === "right" ? x + w - pad : x + pad;
        const lh = size * PT_MM * 1.2;
        // Som i layouten (som klipper vid rutan): en rad skrivs så länge bokstäverna
        // ryms, radavståndet under får sticka ut. Första raden skrivs alltid.
        const glyph = size * PT_MM * 0.8;
        lines.forEach((ln, i) => { const ly = y + pad + i * lh; if (!i || ly + glyph <= y + h + 0.5) doc.text(ln, tx, ly, { baseline: "top", align: el.align || "left" }); });
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
      } else if (el.type === "title" && el.style !== "card") {
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
    if (vec) { setPrintStatus("Sätter ihop PDF:en med ritningen som vektorer…"); savePdfBytes(await vecFinish(vec), name); }
    else doc.save(name);
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
  if ($("btnPrintLayout")) $("btnPrintLayout").onclick = openPrint;
  $("prClose").onclick = closePrint;
  $("prTpl").onchange = e => switchTemplate(e.target.value);
  $("prSave").onclick = saveTemplate;
  $("prNew").onclick = () => newTemplate(false);
  $("prCopy").onclick = () => newTemplate(true);
  $("prRename").onclick = renameTemplate;
  $("prDelete").onclick = deleteTemplate;
  $("prUndo").onclick = prUndo; $("prRedo").onclick = prRedo;
  $("prExport").onclick = exportPrintPdf;
  document.querySelectorAll("#prFormat button").forEach(b => {
    b.onclick = () => {
      if (pr.tpl.format === b.dataset.f) { pr.fmtAsk = null; renderPrintPanel(); return; }
      if (!pr.tpl.elements.some(e => e.type === "map")) { applyFormat(b.dataset.f, false); return; }
      pr.fmtAsk = b.dataset.f; renderPrintPanel();
    };
  });
  $("prFrame").onchange = e => { pushUndo(); pr.tpl.frame = { margin: 8, ticks: true, ...(pr.tpl.frame || {}), on: e.target.checked }; drawPrintPage(); renderPrintPanel(); };
  document.querySelectorAll("#prAdd [data-add]").forEach(b => { b.onclick = () => addEl(b.dataset.add); });
  $("prImgInput").onchange = async e => {
    const f = e.target.files[0]; e.target.value = "";
    const el = primary();
    if (!f || !el || (el.type !== "image" && el.type !== "title")) return;
    try {
      const r = await uploadPrintImage(f);
      // Logga i ritningshuvudet.
      if (el.type === "title") { pushUndo(); el.logo = r.path; renderPrintPanel(); drawPrintPage(); return; }
      pushUndo(); el.path = r.path; el.ar = r.ar; el.h = Math.round(el.w / r.ar * 10) / 10;
      renderPrintPanel(); drawPrintPage();
    } catch (err) { alert("Kunde inte ladda upp bilden: " + err.message); setPrintStatus(""); }
  };
  const c = $("prCanvas");
  c.addEventListener("mousedown", prMouseDown);
  window.addEventListener("mousemove", prMouseMove);
  window.addEventListener("mouseup", prMouseUp);
  c.addEventListener("wheel", prWheel, { passive: false });
  c.addEventListener("auxclick", e => { if (e.button === 1) e.preventDefault(); });
  window.addEventListener("keydown", e => { if (e.code === "Space" && pr && !$("printModal").classList.contains("hidden") && !(e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName))) { e.preventDefault(); prSpace = true; c.style.cursor = "grab"; } });
  window.addEventListener("keyup", e => { if (e.code === "Space") { prSpace = false; c.style.cursor = ""; } });
  const zb = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
  zb("prZoomIn", () => prZoomAt(1.25, c.width / 2, c.height / 2));
  zb("prZoomOut", () => prZoomAt(1 / 1.25, c.width / 2, c.height / 2));
  zb("prZoomFit", () => { pr.zoom = 1; pr.vx = pr.vy = 0; drawPrintPage(); updatePrZoomUi(); });
  window.addEventListener("keydown", prKey, true);
  window.addEventListener("resize", () => { if (pr) drawPrintPage(); });
}
bindPrint();
