// ---------------------------------------------------------------------
// Lägesplan – lager (laddas efter lagesplan.js och lagesplan-tools.js)
// ---------------------------------------------------------------------
//   • Ortofoto i bakgrunden, georefererat automatiskt via världsfilen
//     (.pgw/.jgw) och modellens koordinater (samma koordinatsystem), med
//     tänd/släck och genomskinlighet. Originalen kan sparas i Trimble
//     Connect; i 4D-data sparas en översiktsbild och originalet i rutor
//     (full upplösning, hämtas bara när man zoomar in).
//   • Ritobjekten kan flyttas, ändras (handtag) och roteras efter att de
//     placerats, har egen färg/linjetyp/tjocklek och visar sina datum.
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
async function decodePngScaled(file, maxPx, onProgress, hooks = {}) {
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
  let prev = null, cur = null, rowFill = 0, rowIndex = 0, accRows = 0, filterType = -1, fullRow = null;
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
      if (fullRow) { const q = x * 4; fullRow[q] = pix[0]; fullRow[q + 1] = pix[1]; fullRow[q + 2] = pix[2]; fullRow[q + 3] = pix[3]; }
    }
    if (fullRow) hooks.onRow(rowIndex, fullRow);
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
      if (hooks.onRow) fullRow = new Uint8ClampedArray(W * 4);
      if (hooks.onHeader) hooks.onHeader(W, H, k);
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") {
      inflator.push(data, false);
      if (inflator.err) throw new Error("PNG-avkodning: " + inflator.msg);
      if (hooks.drain) await hooks.drain();
      if (Date.now() - yieldAt > 150) { await new Promise(r => setTimeout(r)); yieldAt = Date.now(); }
    } else if (type === "IEND") break;
  }
  inflator.push(new Uint8Array(0), true);
  if (!out) throw new Error("PNG saknar bilddata.");
  if (hooks.drain) await hooks.drain();
  return { width: outW, height: outH, k, data: out, origW: W, origH: H };
}

async function imageToScaledCanvas(file, onProgress, sink) {
  let res;
  if (/\.png$/i.test(file.name)) {
    try { res = await decodePngScaled(file, ORTHO_MAX_PX, onProgress, sink ? sink.hooks : {}); }
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
  if (sink) await sink.fromBitmap(bmp);
  const k = Math.max(1, Math.ceil(Math.max(bmp.width, bmp.height) / ORTHO_MAX_PX));
  c.width = Math.ceil(bmp.width / k); c.height = Math.ceil(bmp.height / k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return { canvas: c, k, origW: bmp.width, origH: bmp.height };
}

/* Full upplösning i rutor (Victors önskemål 2026-09-28: "crisp quality"):
   förutom översiktsbilden (max ORTHO_MAX_PX) sparas originalet i rutor om
   ORTHO_TILE px (WebP) i site_layers/<id>/t_<kol>_<rad>.webp. Lägesplanen
   hämtar bara de rutor som syns när man zoomar in (se renderOrtho). Rutorna
   byggs medan PNG:en avkodas, ett band (ORTHO_TILE rader) i taget, så
   originalet aldrig behöver ligga helt i minnet. */
const ORTHO_TILE = 2048;
function createTileSink(id, report) {
  let W = 0, H = 0, cols = 0, rowsN = 0, band = null, bandRows = 0, done = 0;
  const pending = [];
  const upload = async (canvas, tx, ty) => {
    const blob = await new Promise(res => canvas.toBlob(res, "image/webp", 0.9));
    await ghUploadBinary(token, dataPath(`site_layers/${id}/t_${tx}_${ty}.webp`), blob, `Lägesplan: ortofoto ruta ${tx},${ty}`);
    done++; report(done, cols * rowsN);
  };
  const flushBand = async (data, ty, h) => {
    for (let tx = 0; tx < cols; tx++) {
      const x0 = tx * ORTHO_TILE, tw = Math.min(ORTHO_TILE, W - x0);
      const tile = new Uint8ClampedArray(tw * h * 4);
      for (let r = 0; r < h; r++) tile.set(data.subarray((r * W + x0) * 4, (r * W + x0 + tw) * 4), r * tw * 4);
      const c = document.createElement("canvas"); c.width = tw; c.height = h;
      c.getContext("2d").putImageData(new ImageData(tile, tw, h), 0, 0);
      await upload(c, tx, ty);
    }
  };
  const header = (w, h) => { W = w; H = h; cols = Math.ceil(W / ORTHO_TILE); rowsN = Math.ceil(H / ORTHO_TILE); };
  return {
    hooks: {
      onHeader(w, h) { header(w, h); band = new Uint8ClampedArray(W * ORTHO_TILE * 4); },
      onRow(y, row) {
        band.set(row, bandRows * W * 4);
        bandRows++;
        if (bandRows === ORTHO_TILE || y === H - 1) {
          pending.push(flushBand(band, Math.floor(y / ORTHO_TILE), bandRows));
          band = y === H - 1 ? null : new Uint8ClampedArray(W * ORTHO_TILE * 4);
          bandRows = 0;
        }
      },
      // Högst ett färdigt band väntar på uppladdning medan nästa avkodas.
      async drain() { while (pending.length > 1) await pending.shift(); }
    },
    async fromBitmap(bmp) {
      header(bmp.width, bmp.height);
      for (let ty = 0; ty < rowsN; ty++) for (let tx = 0; tx < cols; tx++) {
        const x0 = tx * ORTHO_TILE, y0 = ty * ORTHO_TILE, tw = Math.min(ORTHO_TILE, W - x0), th = Math.min(ORTHO_TILE, H - y0);
        const c = document.createElement("canvas"); c.width = tw; c.height = th;
        c.getContext("2d").drawImage(bmp, x0, y0, tw, th, 0, 0, tw, th);
        await upload(c, tx, ty);
      }
    },
    async finish() {
      await Promise.all(pending);
      return { size: ORTHO_TILE, cols, rows: rowsN, width: W, height: H, prefix: dataPath(`site_layers/${id}/`) };
    }
  };
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
    let tileInfo = "";
    const sink = createTileSink(id, (d, t) => { tileInfo = ` · full upplösning: ruta ${d} av ${t} uppladdad`; });
    const { canvas, k, origW, origH } = await imageToScaledCanvas(img, p => setBusy(`Läser ortofotot… ${Math.round(p * 100)} %${tileInfo}`), sink);
    setBusy(`Laddar upp full upplösning…${tileInfo}`);
    const tiles = k > 1 ? { ...(await sink.finish()), world } : null;
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
    const rec = { id, type: "ortho", name, path, width: canvas.width, height: canvas.height, world: sw, tiles,
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

/* Affin avbildning bildpixel -> stage-pixel (canvas) för en världsfil:
   bildpixel -> SWEREF (världsfil) -> modell (samma system) -> PDF
   (kalibreringen) -> canvas. Returnerar [a, b, c, d, e, f] för setTransform. */
function imageToStage(w) {
  const f = (u, v) => mToPx([w.A * (u - 0.5) + w.B * (v - 0.5) + w.C, w.D * (u - 0.5) + w.E * (v - 0.5) + w.F]);
  const p0 = f(0, 0), p1 = f(1, 0), p2 = f(0, 1);
  return [p1[0] - p0[0], p1[1] - p0[1], p2[0] - p0[0], p2[1] - p0[1], p0[0], p0[1]];
}
const mulAffine = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
function invAffine(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}
const applyAffine = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const tileCache = new Map(); // path -> { img, used }
async function loadTile(path) {
  const hit = tileCache.get(path);
  if (hit) { hit.used = Date.now(); return hit.img; }
  const entry = { img: null, used: Date.now(), promise: null };
  tileCache.set(path, entry);
  entry.promise = ghReadBinaryUrl(token, path).then(url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }))
    .then(img => { entry.img = img; if (tileCache.size > 30) { const old = [...tileCache.entries()].filter(([, v]) => v.img).sort((x, y) => x[1].used - y[1].used)[0]; if (old) { URL.revokeObjectURL(old[1].img.src); tileCache.delete(old[0]); } } scheduleOrthoRender(); return img; })
    .catch(e => { tileCache.delete(path); console.warn("Kunde inte hämta ortofotoruta", path, e); });
  return null;
}

/* Ortofotot ritas bara för den synliga delen av planen, i skärmens
   upplösning: utzoomat från översiktsbilden, inzoomat från rutorna i full
   upplösning (Victors önskemål om skärpa). orthoCanvas ligger i #stage så
   att ritningens "multiplicera" blandas mot fotot, men täcker bara det
   synliga området. */
let orthoRenderSeq = 0, orthoTimer = 0;
function scheduleOrthoRender() { clearTimeout(orthoTimer); orthoTimer = setTimeout(renderOrtho, 90); }
async function renderOrtho() {
  const c = $("orthoCanvas");
  const seq = ++orthoRenderSeq;
  const list = (plan && plan.calib && viewport) ? orthos().filter(o => ls("ortho:" + o.id).visible) : [];
  const pc = $("pdfCanvas");
  if (!list.length || !pc.width) { c.width = 0; c.height = 0; applyLayerCss(); return; }
  const imgs = [];
  for (const o of list) {
    try { imgs.push([o, await ensureOrthoImage(o)]); } catch (e) { console.warn("Kunde inte hämta ortofoto", o.name, e); }
  }
  if (seq !== orthoRenderSeq) return;
  const vr = $("viewport").getBoundingClientRect();
  const x0 = Math.max(0, -view.tx / view.scale), y0 = Math.max(0, -view.ty / view.scale);
  const x1 = Math.min(pc.width, (vr.width - view.tx) / view.scale), y1 = Math.min(pc.height, (vr.height - view.ty) / view.scale);
  if (x1 <= x0 || y1 <= y0) { c.width = 0; return; }
  let s = view.scale * (window.devicePixelRatio || 1);
  const maxPx = 36e6;
  if ((x1 - x0) * (y1 - y0) * s * s > maxPx) s = Math.sqrt(maxPx / ((x1 - x0) * (y1 - y0)));
  c.width = Math.ceil((x1 - x0) * s); c.height = Math.ceil((y1 - y0) * s);
  Object.assign(c.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
  const ctx = c.getContext("2d");
  const stageToCanvas = [s, 0, 0, s, -x0 * s, -y0 * s];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = "high";
  for (const [o, im] of imgs) {
    ctx.save();
    ctx.globalAlpha = layerOpacity("ortho:" + o.id);
    const m = mulAffine(stageToCanvas, imageToStage(o.world));
    ctx.setTransform(...m);
    ctx.drawImage(im, 0, 0);
    // Inzoomat mer än översiktsbilden räcker till: rita rutorna i full upplösning ovanpå.
    const screenPerPx = Math.hypot(m[0], m[1]);
    if (o.tiles && screenPerPx > 1.25) {
      const t = o.tiles;
      const mf = mulAffine(stageToCanvas, imageToStage(t.world));
      const inv = invAffine(mf);
      const corners = [[0, 0], [c.width, 0], [0, c.height], [c.width, c.height]].map(p => applyAffine(inv, p));
      const u0 = Math.max(0, Math.min(...corners.map(p => p[0]))), u1 = Math.min(t.width, Math.max(...corners.map(p => p[0])));
      const v0 = Math.max(0, Math.min(...corners.map(p => p[1]))), v1 = Math.min(t.height, Math.max(...corners.map(p => p[1])));
      for (let ty = Math.floor(v0 / t.size); ty <= Math.min(t.rows - 1, Math.floor(v1 / t.size)); ty++) {
        for (let tx = Math.floor(u0 / t.size); tx <= Math.min(t.cols - 1, Math.floor(u1 / t.size)); tx++) {
          const img = await loadTile(`${t.prefix}t_${tx}_${ty}.webp`);
          if (seq !== orthoRenderSeq) { ctx.restore(); return; }
          if (!img) continue; // laddas - ritas när den kommer (scheduleOrthoRender)
          ctx.setTransform(...mulAffine(mf, [1, 0, 0, 1, tx * t.size, ty * t.size]));
          ctx.drawImage(img, 0, 0);
        }
      }
    }
    ctx.restore();
  }
  applyLayerCss();
}

/* För export (PNG/PDF/video): hela fotot från översiktsbilden. */
function drawOrthoForExport(ctx, ox, oy, scale) {
  if (!plan || !plan.calib) return;
  orthos().filter(o => ls("ortho:" + o.id).visible && orthoImages.has(o.id)).forEach(o => {
    ctx.save();
    ctx.globalAlpha = layerOpacity("ortho:" + o.id);
    ctx.setTransform(...mulAffine([scale, 0, 0, scale, ox, oy], imageToStage(o.world)));
    ctx.drawImage(orthoImages.get(o.id), 0, 0);
    ctx.restore();
  });
}

// ---------------------------------------------------------------------
// Noteringar och etablering: geometri, stil, rita
// ---------------------------------------------------------------------
// Geometri i modellens koordinater (meter, y uppåt):
//   note:    pts [pilspets, textens mitt]
//   crane:   pts [mitt], radius
//   shed/storage: cx, cy, w, h, rot (radianer) - roterbar rektangel
//   gate:    pts [mitt], w (öppningens bredd), rot
//   fence:   pts [...] (linje), barrier: pts [...] (yta)
// Stil (valfri, per objekt): color (#rrggbb), dash ("solid"|"dashed"|"dotted"),
// weight (0.6 tunn | 1 normal | 1.8 tjock), textSize (0.8 | 1 | 1.35).
const SITE_DEFAULT_COLOR = { note: "#b45309", crane: "#d97706", shed: "#1d4ed8", storage: "#57534e", gate: "#16a34a", fence: "#374151", barrier: "#dc2626" };
const SITE_DEFAULT_DASH = { note: "solid", crane: "dashed", shed: "solid", storage: "solid", gate: "solid", fence: "dashed", barrier: "dashed" };
const MONTHS_SV = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

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
const isRect = x => x.type === "shed" || x.type === "storage";
/* Rektangelns mitt/mått/vinkel (äldre poster sparades som två hörn). */
function rectGeom(x) {
  if (Number.isFinite(x.w)) return { cx: x.cx, cy: x.cy, w: x.w, h: x.h, rot: x.rot || 0 };
  const [a, b] = x.pts;
  return { cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]), rot: 0 };
}
function rectCorners(g) {
  const c = Math.cos(g.rot), s = Math.sin(g.rot);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const lx = sx * g.w / 2, ly = sy * g.h / 2;
    return [g.cx + lx * c - ly * s, g.cy + lx * s + ly * c];
  });
}
function gateEnds(x) {
  const w = Number(x.w) || 5, r = x.rot || 0, [cx, cy] = x.pts[0];
  return [[cx - Math.cos(r) * w / 2, cy - Math.sin(r) * w / 2], [cx + Math.cos(r) * w / 2, cy + Math.sin(r) * w / 2]];
}
/* Alla modellpunkter som beskriver objektet (för träff, mitt m.m.). */
function sitePoints(x) {
  if (isRect(x)) return rectCorners(rectGeom(x));
  if (x.type === "gate") return gateEnds(x);
  return x.pts;
}
const centroidOf = pts => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
function polyLength(pts, closed) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (closed && pts.length > 2) l += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  return l;
}
function polyAreaM(pts) { let a = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }); return Math.abs(a / 2); }
const fmtM = v => v.toLocaleString("sv-SE", { maximumFractionDigits: v < 10 ? 1 : 0 });
function shortDate(iso) { const [y, m, d] = String(iso).split("-").map(Number); return m ? `${d} ${MONTHS_SV[m - 1]}` : iso; }
function datesText(x) {
  if (x.from && x.to) return `${shortDate(x.from)} – ${shortDate(x.to)}`;
  if (x.from) return `från ${shortDate(x.from)}`;
  if (x.to) return `till ${shortDate(x.to)}`;
  return "";
}
function hexToRgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return `rgba(0,0,0,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
function siteStyle(x, fontPx) {
  const color = x.color || SITE_DEFAULT_COLOR[x.type] || "#111827";
  const weight = Number(x.weight) || 1;
  const lw = Math.max(1.5, fontPx / 7) * weight;
  const dashKind = x.dash || SITE_DEFAULT_DASH[x.type] || "solid";
  const dash = dashKind === "dashed" ? [fontPx * 0.8, fontPx * 0.5] : dashKind === "dotted" ? [lw * 0.2, lw * 2.2] : [];
  return { color, lw, dash, cap: dashKind === "dotted" ? "round" : "butt", fs: fontPx * (Number(x.textSize) || 1) };
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
  const sel = selectedSiteId && siteItems.find(x => x.id === selectedSiteId && siteShown(x));
  if (sel) drawHandles(ctx, sel, fontPx, ppm);
  if (siteTool && siteTool.pts.length) drawSitePreview(ctx, fontPx, ppm);
}

/* Etikett (vit ruta) med valfri grå datumrad under. */
function labelBox(ctx, x, y, text, fs, bg, fg, border, dates) {
  ctx.font = `600 ${fs * 0.85}px "Segoe UI", Arial, sans-serif`;
  const lines = String(text).split("\n");
  let w = Math.max(...lines.map(l => ctx.measureText(l).width));
  if (dates) { ctx.font = `400 ${fs * 0.68}px "Segoe UI", Arial, sans-serif`; w = Math.max(w, ctx.measureText(dates).width); }
  w += fs * 0.8;
  const h = lines.length * fs * 1.1 + fs * 0.5 + (dates ? fs * 0.85 : 0);
  ctx.fillStyle = bg; roundRect(ctx, x - w / 2, y - h / 2, w, h, fs * 0.25); ctx.fill();
  if (border) { ctx.setLineDash([]); ctx.strokeStyle = border; ctx.lineWidth = Math.max(1.5, fs / 10); ctx.stroke(); }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `600 ${fs * 0.85}px "Segoe UI", Arial, sans-serif`;
  ctx.fillStyle = fg;
  lines.forEach((l, i) => ctx.fillText(l, x, y - h / 2 + fs * 0.25 + fs * 0.55 + i * fs * 1.1));
  if (dates) {
    ctx.font = `400 ${fs * 0.68}px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = "#6b7280";
    ctx.fillText(dates, x, y + h / 2 - fs * 0.55);
  }
  return { w, h };
}

function strokePath(ctx, P, closed, st) {
  ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); if (closed) ctx.closePath();
  ctx.strokeStyle = st.color; ctx.lineWidth = st.lw; ctx.lineCap = st.cap; ctx.setLineDash(st.dash); ctx.stroke(); ctx.setLineDash([]);
}

function drawSiteItem(ctx, x, fontPx, ppm, selected) {
  const st = siteStyle(x, fontPx);
  const dates = datesText(x);
  const k = SITE_KINDS[x.type];
  ctx.setLineDash([]);
  if (x.type === "note") {
    const [a, t] = x.pts.map(mToPx);
    ctx.strokeStyle = st.color; ctx.fillStyle = st.color; ctx.lineWidth = st.lw; ctx.setLineDash(st.dash);
    ctx.beginPath(); ctx.moveTo(t[0], t[1]); ctx.lineTo(a[0], a[1]); ctx.stroke(); ctx.setLineDash([]);
    const ang = Math.atan2(a[1] - t[1], a[0] - t[0]), hs = st.fs * 0.7;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]);
    ctx.lineTo(a[0] - hs * Math.cos(ang - 0.4), a[1] - hs * Math.sin(ang - 0.4));
    ctx.lineTo(a[0] - hs * Math.cos(ang + 0.4), a[1] - hs * Math.sin(ang + 0.4)); ctx.closePath(); ctx.fill();
    labelBox(ctx, t[0], t[1], wrapText(x.text || "", 32), st.fs, "#fffbe6", "#111827", st.color, dates);
  } else if (x.type === "crane") {
    const [c] = x.pts.map(mToPx), r = (Number(x.radius) || 40) * ppm;
    ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(st.color, 0.1); ctx.fill();
    ctx.strokeStyle = st.color; ctx.lineWidth = st.lw; ctx.setLineDash(st.dash); ctx.stroke(); ctx.setLineDash([]);
    const s = st.fs * 0.9;
    ctx.fillStyle = st.color; ctx.fillRect(c[0] - s / 2, c[1] - s / 2, s, s);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(c[0] - s / 2, c[1] - s / 2); ctx.lineTo(c[0] + s / 2, c[1] + s / 2); ctx.moveTo(c[0] + s / 2, c[1] - s / 2); ctx.lineTo(c[0] - s / 2, c[1] + s / 2); ctx.stroke();
    labelBox(ctx, c[0], c[1] + s * 1.6, `${x.name || "Kran"} · ${fmtM(Number(x.radius) || 40)} m${x.capacity ? ` · ${x.capacity} t` : ""}`, st.fs, "#fff", "#111827", st.color, dates);
  } else if (isRect(x)) {
    const g = rectGeom(x), P = rectCorners(g).map(mToPx);
    ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
    ctx.fillStyle = hexToRgba(st.color, 0.2); ctx.fill();
    if (x.type === "storage") { // skraffering
      ctx.save(); ctx.clip(); ctx.strokeStyle = hexToRgba(st.color, 0.35); ctx.lineWidth = 1;
      const xs = P.map(p => p[0]), ys = P.map(p => p[1]), minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      for (let d = minX - (maxY - minY); d < maxX; d += st.fs * 0.6) { ctx.beginPath(); ctx.moveTo(d, maxY); ctx.lineTo(d + (maxY - minY), minY); ctx.stroke(); }
      ctx.restore();
    }
    strokePath(ctx, P, true, st);
    const c = mToPx([g.cx, g.cy]);
    labelBox(ctx, c[0], c[1], `${k.icon} ${x.name || k.label}\n${fmtM(g.w)} × ${fmtM(g.h)} m`, st.fs, "rgba(255,255,255,.9)", "#111827", null, dates);
  } else if (x.type === "gate") {
    const [e1, e2] = gateEnds(x).map(mToPx), c = mToPx(x.pts[0]);
    strokePath(ctx, [e1, e2], false, { ...st, lw: st.lw * 2 });
    [e1, e2].forEach(p => { ctx.fillStyle = st.color; ctx.fillRect(p[0] - st.lw * 1.5, p[1] - st.lw * 1.5, st.lw * 3, st.lw * 3); });
    // öppningsbåge
    const ang = Math.atan2(e2[1] - e1[1], e2[0] - e1[0]), len = Math.hypot(e2[0] - e1[0], e2[1] - e1[1]);
    ctx.beginPath(); ctx.arc(e1[0], e1[1], len, ang - Math.PI / 2, ang); ctx.strokeStyle = hexToRgba(st.color, 0.5); ctx.lineWidth = Math.max(1, st.lw / 2); ctx.setLineDash([st.fs * 0.3, st.fs * 0.3]); ctx.stroke(); ctx.setLineDash([]);
    labelBox(ctx, c[0], c[1] + st.fs * 1.4, `${k.icon} ${x.name || "Grind"} · ${fmtM(Number(x.w) || 5)} m`, st.fs, "#fff", "#111827", st.color, dates);
  } else if (x.type === "fence") {
    const P = x.pts.map(mToPx);
    strokePath(ctx, P, false, st);
    P.forEach(p => { ctx.fillStyle = st.color; ctx.fillRect(p[0] - st.lw, p[1] - st.lw, st.lw * 2, st.lw * 2); });
    const m = P[Math.floor((P.length - 1) / 2)], n = P[Math.floor((P.length - 1) / 2) + 1] || m;
    labelBox(ctx, (m[0] + n[0]) / 2, (m[1] + n[1]) / 2 - st.fs, `${x.name || "Stängsel"} · ${fmtM(polyLength(x.pts))} m`, st.fs, "#fff", "#111827", st.color, dates);
  } else if (x.type === "barrier") {
    const P = x.pts.map(mToPx);
    ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
    ctx.fillStyle = hexToRgba(st.color, 0.16); ctx.fill();
    strokePath(ctx, P, true, st);
    const c = centroidOf(P);
    labelBox(ctx, c[0], c[1], `${k.icon} ${x.name || "Avspärrning"}\n${fmtM(polyAreaM(x.pts))} m²`, st.fs, "rgba(255,255,255,.9)", "#111827", st.color, dates);
  }
  if (selected && x.type !== "note") {
    const P = sitePoints(x).map(mToPx);
    if (x.type === "crane") { const c = P[0], r = (Number(x.radius) || 40) * ppm; ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2); }
    else { ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); if (x.type !== "fence" && x.type !== "gate") ctx.closePath(); }
    ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = Math.max(1.5, fontPx / 10); ctx.setLineDash([fontPx / 2, fontPx / 3]); ctx.stroke(); ctx.setLineDash([]);
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
  let tmp = { id: "_preview", type: siteTool.kind, pts, name: "", text: "…", radius: 40 };
  if (isRect(tmp)) {
    if (pts.length < 2) return;
    const [a, b] = pts; tmp = { ...tmp, cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]), rot: 0 };
  }
  if (tmp.type === "note" && pts.length < 2) { const p = mToPx(pts[0]); ctx.beginPath(); ctx.arc(p[0], p[1], fontPx / 3, 0, Math.PI * 2); ctx.fillStyle = "#111827"; ctx.fill(); return; }
  ctx.save(); ctx.globalAlpha = 0.7; drawSiteItem(ctx, tmp, fontPx, ppm, false); ctx.restore();
}

// ---------------------------------------------------------------------
// Handtag: flytta, ändra form/storlek, rotera (efter att objektet placerats)
// ---------------------------------------------------------------------
/* Handtag i modellkoordinater: { kind, i?, m: [x, y] }. */
function siteHandles(x, fontPx, ppm) {
  const off = (fontPx * 2.2) / ppm; // rotationshandtagets avstånd i meter
  if (x.type === "note") return [{ kind: "vertex", i: 0, m: x.pts[0] }, { kind: "vertex", i: 1, m: x.pts[1] }];
  if (x.type === "crane") { const [c] = x.pts; return [{ kind: "radius", m: [c[0] + (Number(x.radius) || 40), c[1]] }]; }
  if (isRect(x)) {
    const g = rectGeom(x), C = rectCorners(g);
    const top = [g.cx - Math.sin(g.rot) * (g.h / 2 + off), g.cy + Math.cos(g.rot) * (g.h / 2 + off)];
    return [...C.map((m, i) => ({ kind: "corner", i, m })), { kind: "rotate", m: top }];
  }
  if (x.type === "gate") return gateEnds(x).map((m, i) => ({ kind: "gateEnd", i, m }));
  const ys = x.pts.map(p => p[1]), c = centroidOf(x.pts);
  return [...x.pts.map((m, i) => ({ kind: "vertex", i, m })), { kind: "rotate", m: [c[0], Math.max(...ys) + off] }];
}
function drawHandles(ctx, x, fontPx, ppm) {
  const hs = Math.max(5, fontPx * 0.32);
  ctx.save();
  ctx.setLineDash([]);
  siteHandles(x, fontPx, ppm).forEach(h => {
    const [px, py] = mToPx(h.m);
    if (h.kind === "rotate") {
      const c = mToPx(isRect(x) ? [rectGeom(x).cx, rectGeom(x).cy] : centroidOf(x.pts));
      ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(px, py); ctx.stroke();
      ctx.beginPath(); ctx.arc(px, py, hs * 1.1, 0, Math.PI * 2); ctx.fillStyle = "#0b5fff"; ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = `700 ${hs * 1.6}px Arial`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("↻", px, py + 1);
    } else {
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = 2;
      ctx.fillRect(px - hs, py - hs, hs * 2, hs * 2); ctx.strokeRect(px - hs, py - hs, hs * 2, hs * 2);
    }
  });
  ctx.restore();
}

let siteDrag = null; // { orig, work, handle, startM, startPx, moved }
function currentFontPx() { return Math.max(14, Math.round($("zoneCanvas").width / 110)); }
function handleAt(x, pdfPt) {
  const p = toPx(pdfPt), tol = Math.max(10, 9 / view.scale) + currentFontPx() * 0.2;
  const hs = siteHandles(x, currentFontPx(), pxPerMeter());
  let best = null, bd = Infinity;
  hs.forEach(h => { const q = mToPx(h.m), d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < tol && d < bd) { best = h; bd = d; } });
  return best;
}
/* Anropas från lagesplan.js vid mousedown: börjar dra ett objekt/handtag. */
function layersPointerDown(e) {
  if (!plan || !plan.calib || !viewport || siteTool || (typeof measure !== "undefined" && measure) || photoPlacing || (calib && calib.waitPdf)) return false;
  const pdfPt = toPdf(stagePoint(e));
  const sel = selectedSiteId && siteItems.find(x => x.id === selectedSiteId && siteShown(x));
  let target = sel, handle = sel ? handleAt(sel, pdfPt) : null;
  if (!handle) {
    target = siteAt(pdfPt);
    if (!target) return false;
    handle = { kind: "move" };
  }
  siteDrag = { orig: JSON.parse(JSON.stringify(target)), work: null, handle, startM: pdfToModel(pdfPt), startPx: [e.clientX, e.clientY], moved: false };
  closeSitePop();
  return true;
}
function rotatePt(p, c, a) { const s = Math.sin(a), co = Math.cos(a), dx = p[0] - c[0], dy = p[1] - c[1]; return [c[0] + dx * co - dy * s, c[1] + dx * s + dy * co]; }
function applySiteDrag(d, m) {
  const o = d.orig, h = d.handle;
  const w = JSON.parse(JSON.stringify(o));
  const dx = m[0] - d.startM[0], dy = m[1] - d.startM[1];
  if (h.kind === "move") {
    if (isRect(o)) { const g = rectGeom(o); Object.assign(w, { cx: g.cx + dx, cy: g.cy + dy, w: g.w, h: g.h, rot: g.rot }); delete w.pts; }
    else w.pts = o.pts.map(p => [p[0] + dx, p[1] + dy]);
  } else if (h.kind === "vertex") {
    w.pts[h.i] = m;
  } else if (h.kind === "radius") {
    w.radius = Math.max(1, Math.round(Math.hypot(m[0] - o.pts[0][0], m[1] - o.pts[0][1]) * 2) / 2);
  } else if (h.kind === "corner") {
    // Motstående hörn står still; rektangeln behåller sin vinkel.
    const g = rectGeom(o), C = rectCorners(g), opp = C[(h.i + 2) % 4];
    const ca = Math.cos(-g.rot), sa = Math.sin(-g.rot), vx = m[0] - opp[0], vy = m[1] - opp[1];
    const lx = vx * ca - vy * sa, ly = vx * sa + vy * ca;
    Object.assign(w, { cx: (m[0] + opp[0]) / 2, cy: (m[1] + opp[1]) / 2, w: Math.max(0.5, Math.abs(lx)), h: Math.max(0.5, Math.abs(ly)), rot: g.rot });
    delete w.pts;
  } else if (h.kind === "rotate") {
    const c = isRect(o) ? [rectGeom(o).cx, rectGeom(o).cy] : centroidOf(o.pts);
    let a = Math.atan2(m[1] - c[1], m[0] - c[0]) - Math.atan2(d.startM[1] - c[1], d.startM[0] - c[0]);
    const deg = a * 180 / Math.PI;
    if (!d.free) a = Math.round(deg / 5) * 5 * Math.PI / 180; // snäpp till 5°, Shift = fritt
    if (isRect(o)) { const g = rectGeom(o); Object.assign(w, { cx: g.cx, cy: g.cy, w: g.w, h: g.h, rot: g.rot + a }); delete w.pts; }
    else w.pts = o.pts.map(p => rotatePt(p, c, a));
  } else if (h.kind === "gateEnd") {
    const other = gateEnds(o)[1 - h.i];
    const c = [(m[0] + other[0]) / 2, (m[1] + other[1]) / 2];
    w.pts = [c];
    w.w = Math.max(0.5, Math.round(Math.hypot(m[0] - other[0], m[1] - other[1]) * 10) / 10);
    w.rot = h.i === 1 ? Math.atan2(m[1] - other[1], m[0] - other[0]) : Math.atan2(other[1] - m[1], other[0] - m[0]);
  }
  return w;
}
function onSiteDragMove(e) {
  const d = siteDrag;
  if (!d) return;
  if (!d.moved && Math.hypot(e.clientX - d.startPx[0], e.clientY - d.startPx[1]) < 4) return;
  d.moved = true;
  d.free = e.shiftKey;
  const m = pdfToModel(toPdf(stagePoint(e)));
  d.work = applySiteDrag(d, m);
  const i = siteItems.findIndex(x => x.id === d.orig.id);
  if (i >= 0) siteItems[i] = d.work;
  selectedSiteId = d.orig.id;
  if (!onSiteDragMove.raf) onSiteDragMove.raf = requestAnimationFrame(() => { onSiteDragMove.raf = 0; renderZones(); });
}
function onSiteDragUp() {
  const d = siteDrag;
  if (!d) return;
  siteDrag = null;
  if (!d.moved) { // ett klick: välj och visa redigering
    selectedSiteId = d.orig.id; renderZones(); openSitePop(d.orig, false);
    return;
  }
  if (d.work) saveSiteItem({ ...d.work, updated_at: new Date().toISOString() });
}

// ---------------------------------------------------------------------
// Placera, välj och redigera
// ---------------------------------------------------------------------
function startSiteTool(kind) {
  if (!plan || !plan.calib) { alert("Kalibrera planen mot 3D (📐) först – noteringar och etablering placeras i modellens koordinater."); return; }
  if (siteTool && siteTool.kind === kind) { stopSiteTool(); return; }
  if (typeof stopMeasure === "function" && measure) stopMeasure();
  if (typeof cancelPhotoPlacing === "function") cancelPhotoPlacing();
  selectedSiteId = null; closeSitePop();
  siteTool = { kind, pts: [], cursor: null };
  updateSiteUi();
}
function stopSiteTool() { siteTool = null; updateSiteUi(); renderZones(); }
function updateSiteUi() {
  document.querySelectorAll("[data-site]").forEach(b => b.classList.toggle("active", !!siteTool && b.dataset.site === siteTool.kind));
  const k = siteTool && SITE_KINDS[siteTool.kind];
  const hints = {
    note: ["Klicka där pilen ska peka.", "Klicka där texten ska stå."],
    crane: ["Klicka kranens placering."], gate: ["Klicka grindens mitt."],
    shed: ["Klicka första hörnet.", "Klicka motstående hörn."], storage: ["Klicka första hörnet.", "Klicka motstående hörn."],
    fence: ["Klicka punkter längs stängslet, dubbelklicka (eller Enter) för att avsluta."],
    barrier: ["Klicka hörnen, dubbelklicka (eller Enter) för att avsluta."]
  };
  $("siteHint").textContent = k ? `${k.icon} ${(hints[siteTool.kind][Math.min(siteTool.pts.length, hints[siteTool.kind].length - 1)])} Esc avbryter.`
    : "Klicka på ett objekt för att ändra det. Dra i det för att flytta, i de vita handtagen för att ändra form och i ↻ för att rotera (Shift = fritt).";
  $("viewport").classList.toggle("drawing", !!siteTool || !!measure || photoPlacing || drawMode);
}
function finishSiteTool() {
  if (!siteTool) return;
  const { kind, pts } = siteTool;
  const min = { fence: 2, barrier: 3 }[kind];
  if (min && pts.length < min) { alert(`${SITE_KINDS[kind].label} behöver minst ${min} punkter.`); return; }
  stopSiteTool();
  const r3 = v => Math.round(v * 1000) / 1000;
  const rec = { id: ghNewId(), type: kind, name: "", created_at: new Date().toISOString(), by: settings.userName || null };
  if (isRect(rec)) {
    const [a, b] = pts;
    Object.assign(rec, { cx: r3((a[0] + b[0]) / 2), cy: r3((a[1] + b[1]) / 2), w: r3(Math.abs(b[0] - a[0])), h: r3(Math.abs(b[1] - a[1])), rot: 0 });
  } else rec.pts = pts.map(p => [r3(p[0]), r3(p[1])]);
  if (kind === "note") { rec.text = ""; rec.layer = noteLayers()[0] || "Allmänt"; }
  if (kind === "crane") { rec.radius = 40; rec.capacity = ""; rec.name = `Kran ${siteItems.filter(x => x.type === "crane").length + 1}`; }
  if (kind === "gate") { rec.w = 5; rec.rot = 0; }
  openSitePop(rec, true);
}
/* Klick på planen när ett verktyg är aktivt: placera. (Val/drag av befintliga
   objekt sköts av layersPointerDown.) */
function layersClick(pdfPt) {
  if (!plan || !plan.calib) return false;
  if (siteTool) {
    siteTool.pts.push(pdfToModel(pdfPt));
    const need = SITE_KINDS[siteTool.kind].clicks;
    if (need && siteTool.pts.length >= need) finishSiteTool();
    else { updateSiteUi(); renderZones(); }
    return true;
  }
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
  const fontPx = currentFontPx();
  const m = pdfToModel(pdfPt);
  const vis = siteItems.filter(siteShown).slice().reverse();
  for (const x of vis) {
    if (x.type === "note") {
      const [a, t] = x.pts.map(mToPx);
      if (Math.hypot(p[0] - t[0], p[1] - t[1]) < fontPx * 3 || distToSeg(p, a, t) < tol) return x;
    } else if (x.type === "crane") {
      const c = mToPx(x.pts[0]);
      if (Math.hypot(p[0] - c[0], p[1] - c[1]) < fontPx * 1.5) return x;
    } else if (x.type === "gate") {
      const [e1, e2] = gateEnds(x).map(mToPx);
      if (distToSeg(p, e1, e2) < tol + fontPx * 0.5) return x;
    } else if (isRect(x) || x.type === "barrier") {
      if (pointInPoly(m, sitePoints(x))) return x;
    } else if (x.type === "fence") {
      const P = x.pts.map(mToPx);
      for (let i = 1; i < P.length; i++) if (distToSeg(p, P[i - 1], P[i]) < tol) return x;
    }
  }
  return null;
}
function layersTipHtml(pdfPt) {
  if (siteTool || siteDrag) return null;
  const x = siteAt(pdfPt);
  if (!x) return null;
  const k = SITE_KINDS[x.type];
  const when = datesText(x);
  const body = x.type === "note" ? escHtml(x.text || "") : x.type === "crane" ? `Räckvidd ${x.radius} m${x.capacity ? `, ${escHtml(x.capacity)} t` : ""}` : "";
  return `${k.icon} <b>${escHtml(x.name || (x.type === "note" ? (x.layer || "Notering") : k.label))}</b>${body ? "<br>" + body : ""}${when ? `<br>${escHtml(when)}` : ""}<br><span style="opacity:.7">Klicka för att ändra · dra för att flytta</span>`;
}

function openSitePop(rec, isNew) {
  const pop = $("sitePop");
  const k = SITE_KINDS[rec.type];
  const layers = noteLayers();
  const g = isRect(rec) ? rectGeom(rec) : null;
  const color = rec.color || SITE_DEFAULT_COLOR[rec.type];
  const dash = rec.dash || SITE_DEFAULT_DASH[rec.type];
  const opt = (v, cur, label) => `<option value="${v}"${String(cur) === String(v) ? " selected" : ""}>${label}</option>`;
  pop.innerHTML = `
    <b>${k.icon} ${isNew ? "Ny" : ""} ${k.label.toLowerCase()}</b>
    ${rec.type === "note" ? `
      <label>Text</label><textarea class="sp-text">${escHtml(rec.text || "")}</textarea>
      <label>Lager</label><input type="text" class="sp-layer" list="spLayers" value="${escHtml(rec.layer || "Allmänt")}" />
      <datalist id="spLayers">${["Allmänt", "Arbetsmiljö", "Avvikelser", "Att göra", ...layers].filter((v, i, a) => a.indexOf(v) === i).map(l => `<option value="${escHtml(l)}">`).join("")}</datalist>`
    : `<label>Namn</label><input type="text" class="sp-name" value="${escHtml(rec.name || "")}" placeholder="${escHtml(k.label)}" />`}
    ${rec.type === "crane" ? `<div class="row2"><div><label>Räckvidd (m)</label><input type="text" class="sp-radius" value="${escHtml(String(rec.radius ?? 40))}" /></div><div><label>Kapacitet (t)</label><input type="text" class="sp-cap" value="${escHtml(String(rec.capacity ?? ""))}" /></div></div>` : ""}
    ${g ? `<div class="row2"><div><label>Bredd (m)</label><input type="text" class="sp-w" value="${fmtM(g.w)}" /></div><div><label>Längd (m)</label><input type="text" class="sp-h" value="${fmtM(g.h)}" /></div><div><label>Vinkel (°)</label><input type="text" class="sp-rot" value="${Math.round(g.rot * 180 / Math.PI)}" /></div></div>` : ""}
    ${rec.type === "gate" ? `<div class="row2"><div><label>Bredd (m)</label><input type="text" class="sp-gw" value="${fmtM(Number(rec.w) || 5)}" /></div><div><label>Vinkel (°)</label><input type="text" class="sp-grot" value="${Math.round((rec.rot || 0) * 180 / Math.PI)}" /></div></div>` : ""}
    <div class="row2">
      <div><label>Färg</label><input type="color" class="sp-color" value="${escHtml(color)}" /></div>
      <div><label>Linje</label><select class="sp-dash">${opt("solid", dash, "Heldragen")}${opt("dashed", dash, "Streckad")}${opt("dotted", dash, "Prickad")}</select></div>
      <div><label>Tjocklek</label><select class="sp-weight">${opt(0.6, rec.weight || 1, "Tunn")}${opt(1, rec.weight || 1, "Normal")}${opt(1.8, rec.weight || 1, "Tjock")}</select></div>
    </div>
    <div class="row2"><div><label>Textstorlek</label><select class="sp-ts">${opt(0.8, rec.textSize || 1, "Liten")}${opt(1, rec.textSize || 1, "Normal")}${opt(1.35, rec.textSize || 1, "Stor")}</select></div><div></div></div>
    <div class="row2"><div><label>Från</label><input type="date" class="sp-from" value="${escHtml(rec.from || "")}" /></div><div><label>Till</label><input type="date" class="sp-to" value="${escHtml(rec.to || "")}" /></div></div>
    <div class="muted" style="margin-top:2px;">Tomt = alltid synlig. Datumen visas i grått vid objektet.</div>
    <div class="acts">${isNew ? "<span></span>" : `<span><button class="sp-del" title="Ta bort">🗑️</button> <button class="sp-dup" title="Kopiera objektet">⧉ Kopiera</button></span>`}<span><button class="sp-cancel">Avbryt</button> <button class="sp-save primary">Spara</button></span></div>`;
  pop.classList.remove("hidden");
  const anchor = mToPx(isRect(rec) ? [rectGeom(rec).cx, rectGeom(rec).cy] : rec.pts[rec.pts.length - 1]);
  const r = $("viewport").getBoundingClientRect();
  const sx = view.tx + anchor[0] * view.scale, sy = view.ty + anchor[1] * view.scale;
  pop.style.left = `${Math.max(8, Math.min(r.width - pop.offsetWidth - 8, sx + 16))}px`;
  pop.style.top = `${Math.max(8, Math.min(r.height - pop.offsetHeight - 8, sy + 16))}px`;
  const first = pop.querySelector(".sp-text, .sp-name"); if (first) first.focus();
  pop.querySelector(".sp-cancel").onclick = () => { closeSitePop(); if (isNew) renderZones(); };
  const num = (c, def) => { const el = pop.querySelector(c); const v = el ? Number(String(el.value).replace(",", ".")) : NaN; return Number.isFinite(v) ? v : def; };
  pop.querySelector(".sp-save").onclick = () => {
    const v = c => { const el = pop.querySelector(c); return el ? el.value.trim() : undefined; };
    const next = { ...rec, from: v(".sp-from") || null, to: v(".sp-to") || null, updated_at: new Date().toISOString() };
    if (next.from && next.to && next.from > next.to) { alert("Från-datumet måste vara före till-datumet."); return; }
    next.color = v(".sp-color") === SITE_DEFAULT_COLOR[rec.type] ? null : v(".sp-color");
    next.dash = v(".sp-dash"); next.weight = Number(v(".sp-weight")); next.textSize = Number(v(".sp-ts"));
    if (rec.type === "note") {
      next.text = pop.querySelector(".sp-text").value.trim();
      next.layer = v(".sp-layer") || "Allmänt";
      if (!next.text) { alert("Skriv en text för noteringen."); return; }
      ls("note:" + next.layer).visible = true; saveLayerState();
    } else next.name = v(".sp-name") || "";
    if (rec.type === "crane") { const rad = num(".sp-radius", 40); next.radius = rad > 0 ? rad : 40; next.capacity = v(".sp-cap") || ""; }
    if (g) { Object.assign(next, { cx: g.cx, cy: g.cy, w: Math.max(0.1, num(".sp-w", g.w)), h: Math.max(0.1, num(".sp-h", g.h)), rot: num(".sp-rot", 0) * Math.PI / 180 }); delete next.pts; }
    if (rec.type === "gate") { next.w = Math.max(0.1, num(".sp-gw", 5)); next.rot = num(".sp-grot", 0) * Math.PI / 180; }
    closeSitePop();
    selectedSiteId = next.id;
    saveSiteItem(next);
  };
  const del = pop.querySelector(".sp-del");
  if (del) del.onclick = () => { if (!confirm(`Ta bort ${k.label.toLowerCase()}?`)) return; closeSitePop(); selectedSiteId = null; saveSiteItem(rec, true); };
  const dup = pop.querySelector(".sp-dup");
  if (dup) dup.onclick = () => {
    const copy = JSON.parse(JSON.stringify(rec));
    copy.id = ghNewId(); copy.created_at = new Date().toISOString();
    const off = 3; // meter snett nedåt höger
    if (isRect(copy)) { const gg = rectGeom(copy); Object.assign(copy, { cx: gg.cx + off, cy: gg.cy - off, w: gg.w, h: gg.h, rot: gg.rot }); delete copy.pts; }
    else copy.pts = copy.pts.map(p => [p[0] + off, p[1] - off]);
    closeSitePop();
    selectedSiteId = copy.id;
    saveSiteItem(copy);
  };
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
  window.addEventListener("mousemove", onSiteDragMove);
  window.addEventListener("mouseup", onSiteDragUp);
  updateSiteUi();
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
