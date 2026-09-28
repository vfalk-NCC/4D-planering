// ---------------------------------------------------------------------
// Lägesplan – lager (laddas efter lagesplan.js och lagesplan-tools.js)
// ---------------------------------------------------------------------
//   • Ortofoto i bakgrunden, georefererat automatiskt via världsfilen
//     (.pgw/.jgw) och modellens koordinater (samma koordinatsystem), med
//     tänd/släck och genomskinlighet. Originalen kan sparas i Trimble
//     Connect; en nedskalad version sparas i 4D-data för visning.
//   • Lagerpanel: ortofoto, ritningen (PDF), zoner, objekt, noteringar
//     (egna lager per namn), etablering, foton - tänd/släck och opacitet.
//   • Noteringar (callout med pil) och etablering (kran med räckvidd, bod,
//     upplag, grind, stängsel, avspärrning) placeras i modellens
//     koordinater, så de hamnar rätt på alla kalibrerade planer, och kan
//     ha en giltighetstid som följer datumreglaget.
//
// Data: projects/<id>/site_layers.json - en post per ortofoto/notering/
// etableringsobjekt ({ id, type, ... }). Bilderna ligger i
// projects/<id>/site_layers/<id>.webp. Vilka lager som visas och deras
// opacitet sparas per webbläsare (localStorage).
// ---------------------------------------------------------------------

const PAKO_URL = "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js";
const ORTHO_MAX_PX = 6144;   // längsta sida på den nedskalade bilden som sparas i 4D-data
const SITE_KINDS = {
  note:    { label: "Notering",    icon: "💬", clicks: 2 },
  crane:   { label: "Kran",        icon: "🏗", clicks: 1 },
  shed:    { label: "Bod",         icon: "🏠", clicks: 2 },
  storage: { label: "Upplag",      icon: "📦", clicks: 2 },
  gate:    { label: "Grind",       icon: "🚪", clicks: 1 },
  fence:   { label: "Stängsel",    icon: "〰", clicks: 0 },  // 0 = valfritt antal, dubbelklick avslutar
  barrier: { label: "Avspärrning", icon: "⛔", clicks: 0 }
};

let siteItems = [];          // site_layers.json
let siteLoaded = false;
let layerState = {};         // per webbläsare: { key: { visible, opacity } , pdfMultiply }
let siteTool = null;         // { kind, pts: [[x,y] modell], cursor }
let selectedSiteId = null;
const orthoImages = new Map(); // ortho-id -> HTMLImageElement (laddad)

const sitePath = () => dataPath("site_layers.json");
const LAYER_KEY = () => "lagesplan-layers-" + projectId;

// ---------------------------------------------------------------------
// Koordinater: modell (meter) <-> PDF
// ---------------------------------------------------------------------
function pdfToModel([px, py]) {
  const [m1, m2] = plan.calib.model, [p1, p2] = plan.calib.pdf;
  const mx = m2[0] - m1[0], my = m2[1] - m1[1], qx = p2[0] - p1[0], qy = p2[1] - p1[1];
  const d = mx * mx + my * my;
  const ar = (qx * mx + qy * my) / d, ai = (qy * mx - qx * my) / d;
  const n = ar * ar + ai * ai;
  const dx = px - p1[0], dy = py - p1[1];
  return [m1[0] + (ar * dx + ai * dy) / n, m1[1] + (-ai * dx + ar * dy) / n];
}
const mToPx = pt => toPx(modelToPdf(pt[0], pt[1]));
/* Canvas-pixlar per meter. */
function pxPerMeter() {
  const a = mToPx([0, 0]), b = mToPx([1, 0]);
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

// ---------------------------------------------------------------------
// Lagerstatus (per webbläsare)
// ---------------------------------------------------------------------
function loadLayerState() {
  try { layerState = JSON.parse(localStorage.getItem(LAYER_KEY()) || "{}") || {}; } catch (e) { layerState = {}; }
}
function saveLayerState() { try { localStorage.setItem(LAYER_KEY(), JSON.stringify(layerState)); } catch (e) {} }
function ls(key, def = {}) {
  if (!layerState[key]) layerState[key] = { visible: def.visible !== false, opacity: def.opacity ?? 100 };
  return layerState[key];
}
function layerVisible(key) { return ls(key).visible; }
function layerOpacity(key) { return ls(key).opacity / 100; }
function applyLayerCss() {
  const hasOrtho = orthos().some(o => ls("ortho:" + o.id).visible);
  const set = (id, key) => { const c = $(id); c.style.display = layerVisible(key) ? "" : "none"; c.style.opacity = layerOpacity(key); };
  set("pdfCanvas", "pdf");
  set("zoneCanvas", "zones");
  set("objCanvas", "objects");
  $("orthoCanvas").style.display = hasOrtho ? "" : "none";
  // Över ett ortofoto blir ritningens vita bakgrund genomskinlig (multiplicera).
  const multiply = hasOrtho && layerState.pdfMultiply !== false;
  $("pdfCanvas").style.mixBlendMode = multiply ? "multiply" : "";
  $("stage").style.background = hasOrtho ? "#e5e7eb" : "#fff";
}

// ---------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------
const orthos = () => siteItems.filter(x => x.type === "ortho");
const noteLayers = () => [...new Set(siteItems.filter(x => x.type === "note").map(x => x.layer || "Allmänt"))].sort((a, b) => a.localeCompare(b, "sv"));

async function loadSiteLayers() {
  try { siteItems = await ghReadJSON(token, sitePath()); } catch (e) { siteItems = []; console.warn("Kunde inte läsa site_layers.json", e); }
  siteLoaded = true;
  renderLayerPanel();
  applyLayerCss();
  renderOrtho();
  renderZones();
}
async function saveSiteItem(rec, remove = false) {
  if (remove) siteItems = siteItems.filter(x => x.id !== rec.id);
  else { const i = siteItems.findIndex(x => x.id === rec.id); if (i >= 0) siteItems[i] = rec; else siteItems.push(rec); }
  renderLayerPanel(); renderZones();
  setSaveStatus("Sparar…");
  try {
    await ghWriteJSON(token, sitePath(), arr => {
      const rest = arr.filter(x => x.id !== rec.id);
      return remove ? rest : [...rest, rec];
    }, `Lägesplan: ${remove ? "ta bort" : "spara"} ${SITE_KINDS[rec.type] ? SITE_KINDS[rec.type].label.toLowerCase() : rec.type}`);
    setSaveStatus(`✓ Sparad ${new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}`);
  } catch (e) {
    setSaveStatus("⚠ Kunde inte spara: " + e.message);
  }
}

// ---------------------------------------------------------------------
// Ortofoto: läs världsfil + PNG (strömmande avkodning, nedskalning)
// ---------------------------------------------------------------------
function parseWorldFile(text) {
  const v = text.split(/\s+/).map(t => t.trim()).filter(Boolean).map(t => Number(t.replace(",", ".")));
  if (v.length < 6 || v.slice(0, 6).some(n => !Number.isFinite(n))) throw new Error("Världsfilen (.pgw) har inte sex tal.");
  const [A, D, B, E, C, F] = v;
  return { A, B, C, D, E, F };
}
/* Världsfil för en nedskalad bild (faktor k): pixel (i,j) i den nya bilden täcker
   originalpixlarna [i*k, (i+1)*k) - världsfilen avser pixelns mitt. */
function scaleWorld(w, k) {
  const o = (k - 1) / 2;
  return { A: w.A * k, B: w.B * k, D: w.D * k, E: w.E * k, C: w.C + (w.A + w.B) * o, F: w.F + (w.D + w.E) * o };
}

/**
 * Avkodar en (stor) PNG strömmande och skalar ned den till högst maxPx på
 * längsta sidan, utan att hela originalet behöver ligga i minnet (en 122 MB
 * PNG kan vara flera GB okomprimerad). Stöder 8/16 bitar, gråskala,
 * RGB, palett och alfa, ej interlace (då används webbläsarens avkodning).
 */
async function decodePngScaled(file, maxPx, onProgress) {
  await loadScript(PAKO_URL);
  const BLOCK = 8 * 1024 * 1024;
  let pos = 0, buf = new Uint8Array(0);
  const need = async n => {
    while (buf.length < n && pos < file.size) {
      const chunk = new Uint8Array(await file.slice(pos, pos + BLOCK).arrayBuffer());
      pos += chunk.length;
      const nb = new Uint8Array(buf.length + chunk.length); nb.set(buf); nb.set(chunk, buf.length); buf = nb;
    }
    return buf.length >= n;
  };
  const take = n => { const out = buf.subarray(0, n); buf = buf.subarray(n); return out; };
  await need(8);
  const sig = take(8);
  if (sig[0] !== 0x89 || sig[1] !== 0x50) throw new Error("Filen är ingen PNG.");
  let W = 0, H = 0, depth = 8, ctype = 2, interlace = 0, palette = null, trns = null;
  let k = 1, outW = 0, outH = 0, out = null, acc = null, cnt = null, channels = 3, bpp = 3, rowBytes = 0;
  let prev = null, cur = null, rowFill = 0, rowIndex = 0, accRows = 0, filterType = -1;
  const pix = [0, 0, 0, 255];
  const readPixel = (row, x) => {
    if (ctype === 3) {
      const idx = depth === 8 ? row[x] : (row[(x * depth) >> 3] >> (8 - depth - ((x * depth) & 7))) & ((1 << depth) - 1);
      pix[0] = palette[idx * 3]; pix[1] = palette[idx * 3 + 1]; pix[2] = palette[idx * 3 + 2];
      pix[3] = trns && idx < trns.length ? trns[idx] : 255;
      return;
    }
    const s = depth === 16 ? 2 : 1;
    const o = x * channels * s;
    if (ctype === 0) { const g = depth < 8 ? ((row[(x * depth) >> 3] >> (8 - depth - ((x * depth) & 7))) & ((1 << depth) - 1)) * (255 / ((1 << depth) - 1)) : row[o]; pix[0] = pix[1] = pix[2] = g; pix[3] = 255; }
    else if (ctype === 4) { pix[0] = pix[1] = pix[2] = row[o]; pix[3] = row[o + s]; }
    else if (ctype === 2) { pix[0] = row[o]; pix[1] = row[o + s]; pix[2] = row[o + 2 * s]; pix[3] = 255; }
    else { pix[0] = row[o]; pix[1] = row[o + s]; pix[2] = row[o + 2 * s]; pix[3] = row[o + 3 * s]; }
  };
  const flushAcc = () => {
    const oy = Math.floor((rowIndex - 1) / k);
    for (let ox = 0; ox < outW; ox++) {
      const c = cnt[ox] || 1, o = (oy * outW + ox) * 4;
      out[o] = acc[ox * 4] / c; out[o + 1] = acc[ox * 4 + 1] / c; out[o + 2] = acc[ox * 4 + 2] / c; out[o + 3] = acc[ox * 4 + 3] / c;
    }
    acc.fill(0); cnt.fill(0); accRows = 0;
  };
  const processRow = () => {
    // Avfiltrera (PNG-filter 0-4) mot föregående rad.
    const f = filterType;
    for (let i = 0; i < rowBytes; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = cur[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[i] = v & 255;
    }
    for (let x = 0; x < W; x++) {
      readPixel(cur, x);
      const ox = (x / k) | 0, o = ox * 4;
      acc[o] += pix[0]; acc[o + 1] += pix[1]; acc[o + 2] += pix[2]; acc[o + 3] += pix[3]; cnt[ox]++;
    }
    rowIndex++; accRows++;
    if (accRows === k || rowIndex === H) flushAcc();
    const t = prev; prev = cur; cur = t;
    if (onProgress && (rowIndex & 127) === 0) onProgress(rowIndex / H);
  };
  const inflator = new pako.Inflate();
  inflator.onData = data => {
    let i = 0;
    while (i < data.length) {
      if (filterType < 0) { filterType = data[i++]; rowFill = 0; continue; }
      const n = Math.min(rowBytes - rowFill, data.length - i);
      cur.set(data.subarray(i, i + n), rowFill);
      rowFill += n; i += n;
      if (rowFill === rowBytes) { processRow(); filterType = -1; }
    }
  };
  let yieldAt = Date.now();
  while (await need(8)) {
    const head = take(8);
    const len = (head[0] << 24 >>> 0) + (head[1] << 16) + (head[2] << 8) + head[3];
    const type = String.fromCharCode(head[4], head[5], head[6], head[7]);
    await need(len + 4);
    const data = take(len).slice(); take(4); // crc
    if (type === "IHDR") {
      const dv = new DataView(data.buffer);
      W = dv.getUint32(0); H = dv.getUint32(4); depth = data[8]; ctype = data[9]; interlace = data[12];
      if (interlace) throw Object.assign(new Error("interlace"), { interlaced: true });
      channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
      bpp = Math.max(1, Math.ceil(channels * depth / 8));
      rowBytes = Math.ceil(W * channels * depth / 8);
      k = Math.max(1, Math.ceil(Math.max(W, H) / maxPx));
      outW = Math.ceil(W / k); outH = Math.ceil(H / k);
      out = new Uint8ClampedArray(outW * outH * 4);
      acc = new Float64Array(outW * 4); cnt = new Uint32Array(outW);
      prev = new Uint8Array(rowBytes); cur = new Uint8Array(rowBytes);
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") {
      inflator.push(data, false);
      if (inflator.err) throw new Error("PNG-avkodning: " + inflator.msg);
      if (Date.now() - yieldAt > 150) { await new Promise(r => setTimeout(r)); yieldAt = Date.now(); }
    } else if (type === "IEND") break;
  }
  inflator.push(new Uint8Array(0), true);
  if (!out) throw new Error("PNG saknar bilddata.");
  return { width: outW, height: outH, k, data: out, origW: W, origH: H };
}

async function imageToScaledCanvas(file, onProgress) {
  let res;
  if (/\.png$/i.test(file.name)) {
    try { res = await decodePngScaled(file, ORTHO_MAX_PX, onProgress); }
    catch (e) { if (!e.interlaced) throw e; }
  }
  const c = document.createElement("canvas");
  if (res) {
    c.width = res.width; c.height = res.height;
    c.getContext("2d").putImageData(new ImageData(res.data, res.width, res.height), 0, 0);
    return { canvas: c, k: res.k, origW: res.origW, origH: res.origH };
  }
  // JPG (eller interlacad PNG): webbläsarens egen avkodning.
  const bmp = await createImageBitmap(file);
  const k = Math.max(1, Math.ceil(Math.max(bmp.width, bmp.height) / ORTHO_MAX_PX));
  c.width = Math.ceil(bmp.width / k); c.height = Math.ceil(bmp.height / k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return { canvas: c, k, origW: bmp.width, origH: bmp.height };
}

async function addOrthoFiles(files) {
  const img = files.find(f => /\.(png|jpe?g)$/i.test(f.name));
  const wf = files.find(f => /\.(pgw|jgw|pngw|jpgw|wld)$/i.test(f.name));
  if (!img || !wf) { alert("Välj både bildfilen (PNG/JPG) och dess världsfil (.pgw/.jgw) – markera båda i fildialogen."); return; }
  if (!plan || !plan.calib) { alert("Kalibrera planen mot 3D (📐) först – ortofotot placeras via modellens koordinater."); return; }
  let world;
  try { world = parseWorldFile(await wf.text()); } catch (e) { alert(e.message); return; }
  const toTc = $("orthoToTc").checked;
  const id = ghNewId();
  const name = img.name.replace(/\.[^.]+$/, "");
  // Originalen till Trimble Connect (via 4D-planering) parallellt med avkodningen.
  let tcPromise = null;
  if (toTc) {
    if (!window.opener || window.opener.closed) setSaveStatus("⚠ Originalen kunde inte sparas i Trimble Connect – öppna lägesplanen via 🗺️ i 4D-planering.");
    else tcPromise = askOpener("tcUpload", { folder: "Lägesplan", files: [img, wf] }, 30 * 60 * 1000)
      .then(r => setSaveStatus(`☁ Originalen sparade i Trimble Connect (${r.folder || "Lägesplan"}).`))
      .catch(e => setSaveStatus("⚠ Kunde inte spara i Trimble Connect: " + e.message));
  }
  setBusy("Läser ortofotot… 0 %");
  try {
    const t0 = Date.now();
    const { canvas, k, origW, origH } = await imageToScaledCanvas(img, p => setBusy(`Läser ortofotot… ${Math.round(p * 100)} %`));
    setBusy("Komprimerar…");
    const blob = await new Promise(res => canvas.toBlob(res, "image/webp", 0.85));
    const path = dataPath(`site_layers/${id}.webp`);
    const sw = scaleWorld(world, k);
    // Rimlighetskontroll: ligger fotot i närheten av planen?
    const cx = sw.C + sw.A * canvas.width / 2 + sw.B * canvas.height / 2, cy = sw.F + sw.D * canvas.width / 2 + sw.E * canvas.height / 2;
    const m1 = plan.calib.model[0];
    const dist = Math.hypot(cx - m1[0], cy - m1[1]);
    const ext = Math.hypot(sw.A * canvas.width, sw.E * canvas.height);
    if (dist > ext * 3 && !confirm(`Ortofotot ligger ${Math.round(dist / 1000)} km från planens kalibreringspunkter. Ligger modellen verkligen i samma koordinatsystem som fotot? Spara ändå?`)) return;
    setBusy(`Laddar upp (${(blob.size / 1048576).toFixed(1)} MB)…`);
    await ghUploadBinary(token, path, blob, `Lägesplan: ortofoto ${name}`);
    const rec = { id, type: "ortho", name, path, width: canvas.width, height: canvas.height, world: sw,
      orig: { name: img.name, width: origW, height: origH, pixel_m: Math.abs(world.A) }, created_at: new Date().toISOString(), by: settings.userName || null };
    orthoImages.set(id, await blobToImage(blob));
    ls("ortho:" + id).visible = true; saveLayerState();
    await saveSiteItem(rec);
    applyLayerCss(); renderOrtho();
    console.log(`Ortofoto: ${origW}×${origH} → ${canvas.width}×${canvas.height} (k=${k}) på ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) {
    alert("Kunde inte läsa ortofotot: " + e.message);
  } finally {
    setBusy("");
  }
  if (tcPromise) await tcPromise;
}
function blobToImage(blob) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("Kunde inte visa bilden")); im.src = URL.createObjectURL(blob); });
}
async function ensureOrthoImage(o) {
  if (orthoImages.has(o.id)) return orthoImages.get(o.id);
  const url = await ghReadBinaryUrl(token, o.path);
  const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  orthoImages.set(o.id, im);
  return im;
}

/* Ritar synliga ortofoton på orthoCanvas: bildpixel -> SWEREF (världsfil) ->
   modell (samma system) -> PDF (kalibreringen) -> canvas. Allt är affint,
   så en setTransform räcker. */
let orthoRenderSeq = 0;
async function renderOrtho() {
  const c = $("orthoCanvas");
  if (!c.width) return;
  const seq = ++orthoRenderSeq;
  const ctx = c.getContext("2d");
  const list = (plan && plan.calib) ? orthos().filter(o => ls("ortho:" + o.id).visible) : [];
  const imgs = [];
  for (const o of list) {
    try { imgs.push([o, await ensureOrthoImage(o)]); } catch (e) { console.warn("Kunde inte hämta ortofoto", o.name, e); }
  }
  if (seq !== orthoRenderSeq) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  imgs.forEach(([o, im]) => {
    const w = o.world;
    const f = (u, v) => mToPx([w.A * (u - 0.5) + w.B * (v - 0.5) + w.C, w.D * (u - 0.5) + w.E * (v - 0.5) + w.F]);
    const p0 = f(0, 0), p1 = f(1, 0), p2 = f(0, 1);
    ctx.save();
    ctx.globalAlpha = layerOpacity("ortho:" + o.id);
    ctx.setTransform(p1[0] - p0[0], p1[1] - p0[1], p2[0] - p0[0], p2[1] - p0[1], p0[0], p0[1]);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(im, 0, 0);
    ctx.restore();
  });
  applyLayerCss();
}

// ---------------------------------------------------------------------
// Noteringar och etablering: rita
// ---------------------------------------------------------------------
function siteVisibleAtDate(x) {
  if (!$("layersFollowDate").checked) return true;
  const d = $("dateInput").value || todayIso();
  return (!x.from || x.from <= d) && (!x.to || x.to >= d);
}
function siteShown(x) {
  if (x.type === "note") return layerVisible("notes") && ls("note:" + (x.layer || "Allmänt")).visible && siteVisibleAtDate(x);
  if (x.type === "ortho") return false;
  return layerVisible("site") && siteVisibleAtDate(x);
}

function drawSiteLayers(ctx, fontPx) {
  if (!plan || !plan.calib) return;
  const ppm = pxPerMeter();
  ctx.save();
  siteItems.filter(siteShown).forEach(x => {
    ctx.globalAlpha = x.type === "note" ? layerOpacity("notes") : layerOpacity("site");
    drawSiteItem(ctx, x, fontPx, ppm, x.id === selectedSiteId);
  });
  ctx.restore();
  if (siteTool && siteTool.pts.length) drawSitePreview(ctx, fontPx, ppm);
}

function labelBox(ctx, x, y, text, fontPx, bg, fg, border) {
  ctx.font = `600 ${fontPx * 0.85}px "Segoe UI", Arial, sans-serif`;
  const lines = String(text).split("\n");
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + fontPx * 0.8;
  const h = lines.length * fontPx * 1.1 + fontPx * 0.5;
  ctx.fillStyle = bg; roundRect(ctx, x - w / 2, y - h / 2, w, h, fontPx * 0.25); ctx.fill();
  if (border) { ctx.strokeStyle = border; ctx.lineWidth = Math.max(1.5, fontPx / 10); ctx.stroke(); }
  ctx.fillStyle = fg; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, x, y - h / 2 + fontPx * 0.25 + fontPx * 0.55 + i * fontPx * 1.1));
  return { w, h };
}

function drawSiteItem(ctx, x, fontPx, ppm, selected) {
  const P = x.pts.map(mToPx);
  const lw = Math.max(2, fontPx / 7);
  ctx.lineWidth = lw;
  ctx.setLineDash([]);
  const sel = () => { if (selected) { ctx.save(); ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = lw * 2.5; ctx.setLineDash([fontPx / 2, fontPx / 3]); ctx.stroke(); ctx.restore(); } };
  if (x.type === "note") {
    const [a, t] = P;
    ctx.strokeStyle = "#111827"; ctx.fillStyle = "#111827";
    ctx.beginPath(); ctx.moveTo(t[0], t[1]); ctx.lineTo(a[0], a[1]); ctx.stroke();
    const ang = Math.atan2(a[1] - t[1], a[0] - t[0]), hs = fontPx * 0.7;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]);
    ctx.lineTo(a[0] - hs * Math.cos(ang - 0.4), a[1] - hs * Math.sin(ang - 0.4));
    ctx.lineTo(a[0] - hs * Math.cos(ang + 0.4), a[1] - hs * Math.sin(ang + 0.4)); ctx.closePath(); ctx.fill();
    labelBox(ctx, t[0], t[1], wrapText(x.text || "", 32), fontPx, selected ? "#fff7cc" : "#fffbe6", "#111827", selected ? "#0b5fff" : "#d6b100");
  } else if (x.type === "crane") {
    const [c] = P, r = (Number(x.radius) || 40) * ppm;
    ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(245,158,11,.10)"; ctx.fill();
    ctx.strokeStyle = "#d97706"; ctx.setLineDash([fontPx * 0.8, fontPx * 0.5]); ctx.stroke(); ctx.setLineDash([]);
    sel();
    const s = fontPx * 0.9;
    ctx.fillStyle = "#d97706"; ctx.fillRect(c[0] - s / 2, c[1] - s / 2, s, s);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(c[0] - s / 2, c[1] - s / 2); ctx.lineTo(c[0] + s / 2, c[1] + s / 2); ctx.moveTo(c[0] + s / 2, c[1] - s / 2); ctx.lineTo(c[0] - s / 2, c[1] + s / 2); ctx.stroke();
    labelBox(ctx, c[0], c[1] + s * 1.4, `${x.name || "Kran"} · ${x.radius || 40} m${x.capacity ? ` · ${x.capacity} t` : ""}`, fontPx, "#fff", "#92400e", "#d97706");
  } else if (x.type === "shed" || x.type === "storage") {
    const [a, b] = x.pts, corners = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]].map(mToPx);
    ctx.beginPath(); corners.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
    ctx.fillStyle = x.type === "shed" ? "rgba(59,130,246,.22)" : "rgba(120,113,108,.22)"; ctx.fill();
    ctx.strokeStyle = x.type === "shed" ? "#1d4ed8" : "#57534e"; ctx.stroke();
    if (x.type === "storage") { ctx.save(); ctx.clip(); ctx.strokeStyle = "rgba(87,83,78,.35)"; ctx.lineWidth = 1; const minX = Math.min(...corners.map(p => p[0])), maxX = Math.max(...corners.map(p => p[0])), minY = Math.min(...corners.map(p => p[1])), maxY = Math.max(...corners.map(p => p[1])); for (let d = minX - (maxY - minY); d < maxX; d += fontPx * 0.6) { ctx.beginPath(); ctx.moveTo(d, maxY); ctx.lineTo(d + (maxY - minY), minY); ctx.stroke(); } ctx.restore(); }
    ctx.beginPath(); corners.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); sel();
    const cx = corners.reduce((s, p) => s + p[0], 0) / 4, cy = corners.reduce((s, p) => s + p[1], 0) / 4;
    labelBox(ctx, cx, cy, `${SITE_KINDS[x.type].icon} ${x.name || SITE_KINDS[x.type].label}`, fontPx, "rgba(255,255,255,.9)", "#111827");
  } else if (x.type === "gate") {
    const [c] = P;
    ctx.beginPath(); ctx.arc(c[0], c[1], fontPx * 0.9, 0, Math.PI * 2); ctx.fillStyle = "#16a34a"; ctx.fill(); sel();
    ctx.fillStyle = "#fff"; ctx.font = `700 ${fontPx}px Arial`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("G", c[0], c[1] + 1);
    if (x.name) labelBox(ctx, c[0], c[1] + fontPx * 1.8, x.name, fontPx, "#fff", "#166534", "#16a34a");
  } else if (x.type === "fence") {
    ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.strokeStyle = "#374151"; ctx.lineWidth = lw * 1.3; ctx.setLineDash([fontPx * 0.6, fontPx * 0.25]); ctx.stroke(); ctx.setLineDash([]);
    P.forEach(p => { ctx.fillStyle = "#374151"; ctx.fillRect(p[0] - lw * 1.3, p[1] - lw * 1.3, lw * 2.6, lw * 2.6); });
    ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); sel();
    if (x.name) { const m = P[Math.floor(P.length / 2)]; labelBox(ctx, m[0], m[1] - fontPx, x.name, fontPx, "#fff", "#374151", "#374151"); }
  } else if (x.type === "barrier") {
    ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
    ctx.fillStyle = "rgba(229,72,77,.16)"; ctx.fill();
    ctx.strokeStyle = "#dc2626"; ctx.lineWidth = lw * 1.2; ctx.setLineDash([fontPx * 0.5, fontPx * 0.3]); ctx.stroke(); ctx.setLineDash([]);
    sel();
    const cx = P.reduce((s, p) => s + p[0], 0) / P.length, cy = P.reduce((s, p) => s + p[1], 0) / P.length;
    labelBox(ctx, cx, cy, `⛔ ${x.name || "Avspärrning"}`, fontPx, "rgba(255,255,255,.9)", "#b91c1c", "#dc2626");
  }
}
function wrapText(t, n) {
  return String(t).split("\n").map(line => {
    const words = line.split(" "), out = []; let cur = "";
    words.forEach(w => { if ((cur + " " + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + " " + w).trim(); });
    if (cur) out.push(cur);
    return out.join("\n");
  }).join("\n");
}
function drawSitePreview(ctx, fontPx, ppm) {
  const pts = siteTool.pts.concat(siteTool.cursor ? [siteTool.cursor] : []);
  const tmp = { id: "_preview", type: siteTool.kind, pts, name: "", text: "…", radius: 40 };
  if ((tmp.type === "shed" || tmp.type === "storage") && pts.length < 2) return;
  if (tmp.type === "note" && pts.length < 2) { const p = mToPx(pts[0]); ctx.beginPath(); ctx.arc(p[0], p[1], fontPx / 3, 0, Math.PI * 2); ctx.fillStyle = "#111827"; ctx.fill(); return; }
  ctx.save(); ctx.globalAlpha = 0.7; drawSiteItem(ctx, tmp, fontPx, ppm, false); ctx.restore();
}

// ---------------------------------------------------------------------
// Placera, välj och redigera
// ---------------------------------------------------------------------
function startSiteTool(kind) {
  if (!plan || !plan.calib) { alert("Kalibrera planen mot 3D (📐) först – noteringar och etablering placeras i modellens koordinater."); return; }
  if (siteTool && siteTool.kind === kind) { stopSiteTool(); return; }
  if (typeof stopMeasure === "function" && measure) stopMeasure();
  if (typeof cancelPhotoPlacing === "function") cancelPhotoPlacing();
  siteTool = { kind, pts: [], cursor: null };
  updateSiteUi();
}
function stopSiteTool() { siteTool = null; updateSiteUi(); renderZones(); }
function updateSiteUi() {
  document.querySelectorAll("[data-site]").forEach(b => b.classList.toggle("active", !!siteTool && b.dataset.site === siteTool.kind));
  const k = siteTool && SITE_KINDS[siteTool.kind];
  const hints = {
    note: ["Klicka där pilen ska peka.", "Klicka där texten ska stå."],
    crane: ["Klicka kranens placering."], gate: ["Klicka grindens placering."],
    shed: ["Klicka första hörnet.", "Klicka motstående hörn."], storage: ["Klicka första hörnet.", "Klicka motstående hörn."],
    fence: ["Klicka punkter längs stängslet, dubbelklicka (eller Enter) för att avsluta."],
    barrier: ["Klicka hörnen, dubbelklicka (eller Enter) för att avsluta."]
  };
  $("siteHint").textContent = k ? `${k.icon} ${(hints[siteTool.kind][Math.min(siteTool.pts.length, hints[siteTool.kind].length - 1)])} Esc avbryter.` : "";
  $("viewport").classList.toggle("drawing", !!siteTool || !!measure || photoPlacing || drawMode);
}
function finishSiteTool() {
  if (!siteTool) return;
  const { kind, pts } = siteTool;
  const min = { fence: 2, barrier: 3 }[kind];
  if (min && pts.length < min) { alert(`${SITE_KINDS[kind].label} behöver minst ${min} punkter.`); return; }
  stopSiteTool();
  const rec = { id: ghNewId(), type: kind, pts: pts.map(p => [Math.round(p[0] * 1000) / 1000, Math.round(p[1] * 1000) / 1000]),
    name: "", created_at: new Date().toISOString(), by: settings.userName || null };
  if (kind === "note") { rec.text = ""; rec.layer = noteLayers()[0] || "Allmänt"; }
  if (kind === "crane") { rec.radius = 40; rec.capacity = ""; rec.name = `Kran ${siteItems.filter(x => x.type === "crane").length + 1}`; }
  openSitePop(rec, true);
}
/* Klick på planen: placera (om ett verktyg är aktivt) eller välj ett objekt. */
function layersClick(pdfPt) {
  if (!plan || !plan.calib) return false;
  const m = pdfToModel(pdfPt);
  if (siteTool) {
    siteTool.pts.push(m);
    const need = SITE_KINDS[siteTool.kind].clicks;
    if (need && siteTool.pts.length >= need) finishSiteTool();
    else { updateSiteUi(); renderZones(); }
    return true;
  }
  const hit = siteAt(pdfPt);
  if (hit) { selectedSiteId = hit.id; renderZones(); openSitePop(hit, false); return true; }
  if (selectedSiteId) { selectedSiteId = null; closeSitePop(); renderZones(); }
  return false;
}
function distToSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function siteAt(pdfPt) {
  if (!plan || !plan.calib) return null;
  const p = toPx(pdfPt), tol = Math.max(10, 8 / view.scale);
  const fontPx = Math.max(14, Math.round($("zoneCanvas").width / 110));
  const vis = siteItems.filter(siteShown).slice().reverse();
  for (const x of vis) {
    const P = x.pts.map(mToPx);
    if (x.type === "note") {
      const [a, t] = P;
      if (Math.hypot(p[0] - t[0], p[1] - t[1]) < fontPx * 3 || distToSeg(p, a, t) < tol) return x;
    } else if (x.type === "crane" || x.type === "gate") {
      if (Math.hypot(p[0] - P[0][0], p[1] - P[0][1]) < fontPx * 1.5) return x;
    } else if (x.type === "shed" || x.type === "storage") {
      const [a, b] = x.pts, m = pdfToModel(pdfPt);
      if (m[0] >= Math.min(a[0], b[0]) && m[0] <= Math.max(a[0], b[0]) && m[1] >= Math.min(a[1], b[1]) && m[1] <= Math.max(a[1], b[1])) return x;
    } else if (x.type === "fence") {
      for (let i = 1; i < P.length; i++) if (distToSeg(p, P[i - 1], P[i]) < tol) return x;
    } else if (x.type === "barrier") {
      if (pointInPoly(pdfToModel(pdfPt), x.pts)) return x;
    }
  }
  return null;
}
function layersTipHtml(pdfPt) {
  if (siteTool) return null;
  const x = siteAt(pdfPt);
  if (!x) return null;
  const k = SITE_KINDS[x.type];
  const when = x.from || x.to ? `<br>${escHtml(x.from || "…")} – ${escHtml(x.to || "…")}` : "";
  const body = x.type === "note" ? escHtml(x.text || "") : x.type === "crane" ? `Räckvidd ${x.radius} m${x.capacity ? `, ${escHtml(x.capacity)} t` : ""}` : "";
  return `${k.icon} <b>${escHtml(x.name || (x.type === "note" ? (x.layer || "Notering") : k.label))}</b>${body ? "<br>" + body : ""}${when}<br><span style="opacity:.7">Klicka för att ändra</span>`;
}

function openSitePop(rec, isNew) {
  const pop = $("sitePop");
  const k = SITE_KINDS[rec.type];
  const layers = noteLayers();
  pop.innerHTML = `
    <b>${k.icon} ${isNew ? "Ny" : ""} ${k.label.toLowerCase()}</b>
    ${rec.type === "note" ? `
      <label>Text</label><textarea class="sp-text">${escHtml(rec.text || "")}</textarea>
      <label>Lager</label><input type="text" class="sp-layer" list="spLayers" value="${escHtml(rec.layer || "Allmänt")}" />
      <datalist id="spLayers">${["Allmänt", "Arbetsmiljö", "Avvikelser", "Att göra", ...layers].filter((v, i, a) => a.indexOf(v) === i).map(l => `<option value="${escHtml(l)}">`).join("")}</datalist>`
    : `<label>Namn</label><input type="text" class="sp-name" value="${escHtml(rec.name || "")}" placeholder="${escHtml(k.label)}" />`}
    ${rec.type === "crane" ? `<div class="row2"><div><label>Räckvidd (m)</label><input type="text" class="sp-radius" value="${escHtml(String(rec.radius ?? 40))}" /></div><div><label>Kapacitet (t)</label><input type="text" class="sp-cap" value="${escHtml(String(rec.capacity ?? ""))}" /></div></div>` : ""}
    <div class="row2"><div><label>Från</label><input type="date" class="sp-from" value="${escHtml(rec.from || "")}" /></div><div><label>Till</label><input type="date" class="sp-to" value="${escHtml(rec.to || "")}" /></div></div>
    <div class="muted" style="margin-top:2px;">Tomt = alltid synlig.</div>
    <div class="acts">${isNew ? "<span></span>" : `<button class="sp-del">🗑️ Ta bort</button>`}<span><button class="sp-cancel">Avbryt</button> <button class="sp-save primary">Spara</button></span></div>`;
  pop.classList.remove("hidden");
  // Placera nära objektet
  const p = mToPx(rec.pts[rec.pts.length - 1]);
  const r = $("viewport").getBoundingClientRect();
  const sx = view.tx + p[0] * view.scale, sy = view.ty + p[1] * view.scale;
  pop.style.left = `${Math.max(8, Math.min(r.width - pop.offsetWidth - 8, sx + 16))}px`;
  pop.style.top = `${Math.max(8, Math.min(r.height - pop.offsetHeight - 8, sy + 16))}px`;
  const first = pop.querySelector(".sp-text, .sp-name"); if (first) first.focus();
  pop.querySelector(".sp-cancel").onclick = () => { closeSitePop(); if (isNew) renderZones(); };
  pop.querySelector(".sp-save").onclick = () => {
    const v = c => { const el = pop.querySelector(c); return el ? el.value.trim() : undefined; };
    const next = { ...rec, from: v(".sp-from") || null, to: v(".sp-to") || null, updated_at: new Date().toISOString() };
    if (next.from && next.to && next.from > next.to) { alert("Från-datumet måste vara före till-datumet."); return; }
    if (rec.type === "note") {
      next.text = pop.querySelector(".sp-text").value.trim();
      next.layer = v(".sp-layer") || "Allmänt";
      if (!next.text) { alert("Skriv en text för noteringen."); return; }
      ls("note:" + next.layer).visible = true; saveLayerState();
    } else next.name = v(".sp-name") || "";
    if (rec.type === "crane") {
      const rad = Number(String(v(".sp-radius")).replace(",", "."));
      next.radius = rad > 0 ? rad : 40;
      next.capacity = v(".sp-cap") || "";
    }
    closeSitePop();
    selectedSiteId = next.id;
    saveSiteItem(next);
  };
  const del = pop.querySelector(".sp-del");
  if (del) del.onclick = () => { if (!confirm(`Ta bort ${k.label.toLowerCase()}?`)) return; closeSitePop(); selectedSiteId = null; saveSiteItem(rec, true); };
}
function closeSitePop() { $("sitePop").classList.add("hidden"); $("sitePop").innerHTML = ""; }

// ---------------------------------------------------------------------
// Lagerpanelen
// ---------------------------------------------------------------------
function layerRow(key, label, opts = {}) {
  const st = ls(key, opts);
  return `<div class="layer-row${opts.sub ? " sub" : ""}" data-layer="${escHtml(key)}">
      <input type="checkbox" class="lr-vis"${st.visible ? " checked" : ""} title="Visa/dölj" />
      <span class="ln" title="${escHtml(label)}">${label}</span>
      ${opts.noOpacity ? "<span></span>" : `<input type="range" class="lr-op" min="0" max="100" value="${st.opacity}" title="Genomskinlighet ${st.opacity} %" />`}
      ${opts.del ? `<button class="lr-del" title="Ta bort">🗑️</button>` : "<span></span>"}
      ${opts.extra || ""}
    </div>`;
}
function renderLayerPanel() {
  const el = $("layerList");
  if (!el) return;
  const rows = [];
  orthos().slice().reverse().forEach(o => rows.push(layerRow("ortho:" + o.id, `🛰 ${escHtml(o.name)} <small>${o.orig && o.orig.pixel_m ? `${Math.round(o.orig.pixel_m * 100)} cm/px` : ""}</small>`, { del: true })));
  rows.push(layerRow("pdf", "📄 Ritningen (PDF)", {
    extra: orthos().length ? `<label class="blend"><input type="checkbox" class="lr-mult"${layerState.pdfMultiply !== false ? " checked" : ""} /> Genomskinlig vit bakgrund över fotot</label>` : ""
  }));
  rows.push(layerRow("zones", "🟧 Zoner"));
  rows.push(layerRow("objects", "🔷 Objekt"));
  rows.push(layerRow("notes", "💬 Noteringar"));
  noteLayers().forEach(l => rows.push(layerRow("note:" + l, escHtml(l), { sub: true, noOpacity: true })));
  rows.push(layerRow("site", "🏗 Etablering"));
  rows.push(layerRow("photos", "📷 Foton", { noOpacity: true }));
  el.innerHTML = rows.join("");
  el.querySelectorAll(".layer-row").forEach(row => {
    const key = row.dataset.layer;
    row.querySelector(".lr-vis").onchange = e => {
      ls(key).visible = e.target.checked; saveLayerState();
      if (key === "objects") $("showObjects").checked = e.target.checked;
      if (key === "photos") $("showPhotos").checked = e.target.checked;
      applyLayerCss();
      if (key.startsWith("ortho:")) renderOrtho(); else renderZones();
    };
    const op = row.querySelector(".lr-op");
    if (op) op.oninput = e => {
      ls(key).opacity = Number(e.target.value); op.title = `Genomskinlighet ${e.target.value} %`; saveLayerState();
      applyLayerCss();
      if (key.startsWith("ortho:")) renderOrtho(); else if (key === "notes" || key === "site") renderZones();
    };
    const mult = row.querySelector(".lr-mult");
    if (mult) mult.onchange = e => { layerState.pdfMultiply = e.target.checked; saveLayerState(); applyLayerCss(); };
    const del = row.querySelector(".lr-del");
    if (del) del.onclick = () => {
      const o = siteItems.find(x => "ortho:" + x.id === key);
      if (!o || !confirm(`Ta bort ortofotot "${o.name}" från lägesplanen? (Originalet i Trimble Connect ligger kvar.)`)) return;
      orthoImages.delete(o.id);
      saveSiteItem(o, true).then(() => { applyLayerCss(); renderOrtho(); });
      ghDeleteBinary(token, o.path, "Lägesplan: ta bort ortofoto");
    };
  });
}

function bindLayers() {
  loadLayerState();
  // Befintliga kryssrutor (objekt/foton) följer lagerpanelen.
  $("showObjects").checked = layerVisible("objects");
  $("showPhotos").checked = layerVisible("photos");
  $("showObjects").addEventListener("change", () => { ls("objects").visible = $("showObjects").checked; saveLayerState(); renderLayerPanel(); applyLayerCss(); });
  $("showPhotos").addEventListener("change", () => { ls("photos").visible = $("showPhotos").checked; saveLayerState(); renderLayerPanel(); });
  $("btnAddOrtho").onclick = () => $("orthoInput").click();
  $("orthoInput").onchange = e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) addOrthoFiles(f); };
  $("layersFollowDate").onchange = () => renderZones();
  document.querySelectorAll("[data-site]").forEach(b => { b.onclick = () => startSiteTool(b.dataset.site); });
  $("viewport").addEventListener("dblclick", () => {
    if (!siteTool || SITE_KINDS[siteTool.kind].clicks) return;
    const p = siteTool.pts; // dubbelklicket har lagt till samma punkt två gånger
    const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
    while (p.length > 1 && same(p[p.length - 1], p[p.length - 2])) p.pop();
    finishSiteTool();
  });
  let raf = 0;
  window.addEventListener("mousemove", e => {
    if (!siteTool || !siteTool.pts.length || !viewport || !e.target.closest || !e.target.closest("#viewport")) return;
    siteTool.cursor = pdfToModel(toPdf(stagePoint(e)));
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderZones(); });
  });
  window.addEventListener("keydown", e => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === "Escape") { if (siteTool) stopSiteTool(); else if (!$("sitePop").classList.contains("hidden")) { closeSitePop(); selectedSiteId = null; renderZones(); } }
    else if (e.key === "Enter" && siteTool && !SITE_KINDS[siteTool.kind].clicks) finishSiteTool();
  });
  applyLayerCss();
  renderLayerPanel();
}
