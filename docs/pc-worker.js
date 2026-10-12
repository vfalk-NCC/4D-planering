/* Punktmoln: läsning i bakgrunden (Victor 2026-10-12: "stöd för punktmoln i min 3d-editor utan att kompromissa
   med prestandan … hämta från Reality capture i Trimble Connect").

   In:  { bytes: ArrayBuffer, name, budget }   (filen, högst budget punkter tillbaka)
        { file: File, name, budget }           (fil från datorn – LAS/LAZ läses bit för bit, även över 2 GB)
   Ut:  { type: "progress", f }  (0–1)
        { type: "done", info: { n, total, center: [x,y,z], min, max, rgb, intensity, format }, chunks: [{ pos, rgb, inten }] }
        { type: "error", message }

   – LAS 1.0–1.4 (punktformat 0–10) läses direkt, LAZ med laz-perf (LASzip i WebAssembly), XYZ/PTS/TXT och PLY
     (ascii och binär little endian).
   – Glesas ut jämnt (slumpmässigt urval med fast frö) till punktbudgeten – hela molnet syns, bara glesare.
   – Positionerna relativt molnets mitt (Float32, ~0,1 mm på en kilometer) och delade i ett rutnät i planet så att
     3D-vyn kan låta bli att rita det som inte syns. */

let lazReady = null;
function laz() {
  if (!lazReady) {
    importScripts("vendor/laz-perf/laz-perf.js");
    lazReady = createLazPerf({ locateFile: p => "vendor/laz-perf/" + p });
  }
  return lazReady;
}

/* Växande lagring för urvalet. */
function Store(cap) {
  this.n = 0; this.cap = Math.max(1024, cap | 0);
  this.pos = new Float32Array(this.cap * 3); this.rgb = new Uint8Array(this.cap * 3); this.int = new Uint8Array(this.cap);
}
Store.prototype.push = function (x, y, z, r, g, b, i) {
  if (this.n === this.cap) {
    const c = this.cap * 2, p = new Float32Array(c * 3), q = new Uint8Array(c * 3), t = new Uint8Array(c);
    p.set(this.pos); q.set(this.rgb); t.set(this.int); this.pos = p; this.rgb = q; this.int = t; this.cap = c;
  }
  const k = this.n++, k3 = k * 3;
  this.pos[k3] = x; this.pos[k3 + 1] = y; this.pos[k3 + 2] = z;
  this.rgb[k3] = r; this.rgb[k3 + 1] = g; this.rgb[k3 + 2] = b; this.int[k] = i;
};
/* Slumpmässigt urval med fast frö: samma fil ger alltid samma moln. */
function Sampler(total, budget) {
  this.p = total > budget ? budget / total : 1; this.s = 0x9e3779b9;
}
Sampler.prototype.take = function () {
  if (this.p >= 1) return true;
  this.s ^= this.s << 13; this.s ^= this.s >>> 17; this.s ^= this.s << 5;
  return ((this.s >>> 0) / 4294967296) < this.p;
};

/* ---- LAS / LAZ ------------------------------------------------------------------------------------- */
function lasHeader(dv) {
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== "LASF") throw new Error("Inte en LAS/LAZ-fil.");
  const minor = dv.getUint8(25), offset = dv.getUint32(96, true), fmtRaw = dv.getUint8(104), len = dv.getUint16(105, true);
  let count = dv.getUint32(107, true);
  if (minor >= 4 && dv.byteLength >= 255) { const big = Number(dv.getBigUint64(247, true)); if (big) count = big; }
  const f64 = o => dv.getFloat64(o, true);
  return { minor, offset, format: fmtRaw & 0x3f, compressed: (fmtRaw & 0xc0) !== 0, len, count,
    scale: [f64(131), f64(139), f64(147)], off: [f64(155), f64(163), f64(171)],
    max: [f64(179), f64(195), f64(211)], min: [f64(187), f64(203), f64(219)] };
}
/* Var i punktposten färg och intensitet ligger. */
function lasLayout(fmt) {
  const rgbAt = { 2: 20, 3: 28, 5: 28, 7: 30, 8: 30, 10: 30 }[fmt];
  return { rgbAt: rgbAt === undefined ? -1 : rgbAt };
}
async function readLas(buf, budget, post) {
  const dv = new DataView(buf), h = lasHeader(dv), lay = lasLayout(h.format);
  const total = h.count, center = [0, 1, 2].map(a => (h.min[a] + h.max[a]) / 2);
  const S = new Sampler(total, budget), out = new Store(Math.min(total, budget * 1.05));
  // Färgen: 16 bitar i LAS, men många program skriver 0–255 – avgörs av de första punkterna.
  let shift = -1;
  const take = (pv, o) => {
    const x = pv.getInt32(o, true) * h.scale[0] + h.off[0] - center[0];
    const y = pv.getInt32(o + 4, true) * h.scale[1] + h.off[1] - center[1];
    const z = pv.getInt32(o + 8, true) * h.scale[2] + h.off[2] - center[2];
    const it = pv.getUint16(o + 12, true);
    let r = 0, g = 0, b = 0;
    if (lay.rgbAt >= 0) {
      const R = pv.getUint16(o + lay.rgbAt, true), G = pv.getUint16(o + lay.rgbAt + 2, true), B = pv.getUint16(o + lay.rgbAt + 4, true);
      if (shift < 0) shift = Math.max(R, G, B) > 255 ? 8 : 0;
      r = R >> shift; g = G >> shift; b = B >> shift;
    }
    out.push(x, y, z, r, g, b, it > 255 ? it >> 8 : it);
  };
  if (!h.compressed) {
    for (let i = 0; i < total; i++) {
      if (S.take()) take(dv, h.offset + i * h.len);
      if ((i & 0x3ffff) === 0) post(i / total);
    }
  } else {
    const L = await laz(), n = buf.byteLength, fp = L._malloc(n);
    L.HEAPU8.set(new Uint8Array(buf), fp);
    const zip = new L.LASZip();
    try {
      zip.open(fp, n);
      const len = zip.getPointLength(), cnt = zip.getCount(), dp = L._malloc(len);
      try {
        for (let i = 0; i < cnt; i++) {
          zip.getPoint(dp); // varje punkt måste avkodas (komprimeringen är i följd) – bara urvalet sparas
          if (S.take()) take(new DataView(L.HEAPU8.buffer, dp, len), 0);
          if ((i & 0x3ffff) === 0) post(i / cnt);
        }
      } finally { L._free(dp); }
    } finally { zip.delete(); L._free(fp); }
  }
  return { out, center, min: h.min, max: h.max, total, rgb: lay.rgbAt >= 0, intensity: true, format: (h.compressed ? "LAZ" : "LAS") + " " + "1." + h.minor };
}

/* ---- Stora filer: LAS/LAZ direkt från disken, bit för bit (Victor 2026-10-12: "Fixa så att jag kan läsa in
   punktmoln på över 2gb, det går i andra program"). Webbläsaren kan inte hålla en fil över ~2 GB i minnet, men en
   LAZ-fil är delad i block (oftast 50 000 punkter) som kan avkodas vart för sig med laz-perfs ChunkDecoder. Var
   blocken ligger står i LAZ-filens blocktabell, som är komprimerad med LASzips aritmetiska kodare – den avkodas
   här (samma algoritm som LASzip: ArithmeticDecoder + IntegerCompressor 32 bitar, 2 kontexter). Bara urvalet
   (punktbudgeten) hamnar i minnet. ------------------------------------------------------------------------ */
const AC_MIN = 0x01000000, BM_SHIFT = 13, BM_MAX = 1 << 13, DM_SHIFT = 15, DM_MAX = 1 << 15;
function AcModel(symbols) {
  this.symbols = symbols; this.distribution = new Uint32Array(symbols); this.count = new Uint32Array(symbols);
  if (symbols > 16) { let tb = 3; while (symbols > (1 << (tb + 2))) tb++; this.tableSize = 1 << tb; this.tableShift = DM_SHIFT - tb; this.table = new Uint32Array(this.tableSize + 2); }
  else { this.table = null; this.tableSize = this.tableShift = 0; }
  this.lastSymbol = symbols - 1; this.total = 0; this.cycle = symbols;
  this.count.fill(1); this.update(); this.untilUpdate = this.cycle = (symbols + 6) >>> 1;
}
AcModel.prototype.update = function () {
  if ((this.total += this.cycle) > DM_MAX) { this.total = 0; for (let n = 0; n < this.symbols; n++) this.total += (this.count[n] = (this.count[n] + 1) >>> 1); }
  let sum = 0, s = 0; const scale = Math.floor(0x80000000 / this.total);
  for (let k = 0; k < this.symbols; k++) {
    this.distribution[k] = Math.floor(scale * sum / 2 ** (31 - DM_SHIFT)) >>> 0; sum += this.count[k];
    if (this.table) { const w = this.distribution[k] >>> this.tableShift; while (s < w) this.table[++s] = k - 1; }
  }
  if (this.table) { this.table[0] = 0; while (s <= this.tableSize) this.table[++s] = this.symbols - 1; }
  this.cycle = (5 * this.cycle) >>> 2; const mx = (this.symbols + 6) << 3; if (this.cycle > mx) this.cycle = mx;
  this.untilUpdate = this.cycle;
};
function AcBit() { this.b0 = 1; this.bc = 2; this.prob = 1 << (BM_SHIFT - 1); this.cycle = this.until = 4; }
AcBit.prototype.update = function () {
  if ((this.bc += this.cycle) > BM_MAX) { this.bc = (this.bc + 1) >>> 1; this.b0 = (this.b0 + 1) >>> 1; if (this.b0 === this.bc) this.bc++; }
  const scale = Math.floor(0x80000000 / this.bc); this.prob = Math.floor(this.b0 * scale / 2 ** (31 - BM_SHIFT));
  this.cycle = (5 * this.cycle) >>> 2; if (this.cycle > 64) this.cycle = 64; this.until = this.cycle;
};
function AcDecoder(u8, pos) {
  this.u8 = u8; this.p = pos; this.length = 0xFFFFFFFF;
  this.value = ((this.byte() << 24) >>> 0) + (this.byte() << 16) + (this.byte() << 8) + this.byte();
}
AcDecoder.prototype.byte = function () { if (this.p >= this.u8.length) throw new Error("LAZ-filens blocktabell tog slut."); return this.u8[this.p++]; };
AcDecoder.prototype.renorm = function () { do { this.value = (this.value * 256 + this.byte()) % 4294967296; this.length = (this.length * 256) % 4294967296; } while (this.length < AC_MIN); };
AcDecoder.prototype.symbol = function (m) {
  let n, sym, x, y = this.length;
  if (m.table) {
    this.length = this.length >>> DM_SHIFT;
    const dv = Math.floor(this.value / this.length), t = dv >>> m.tableShift;
    sym = m.table[t]; n = m.table[t + 1] + 1;
    while (n > sym + 1) { const k = (sym + n) >>> 1; if (m.distribution[k] > dv) n = k; else sym = k; }
    x = m.distribution[sym] * this.length;
    if (sym !== m.lastSymbol) y = m.distribution[sym + 1] * this.length;
  } else {
    x = sym = 0; this.length = this.length >>> DM_SHIFT; n = m.symbols; let k = n >>> 1;
    do { const z = this.length * m.distribution[k]; if (z > this.value) { n = k; y = z; } else { sym = k; x = z; } } while ((k = (sym + n) >>> 1) !== sym);
  }
  this.value -= x; this.length = y - x;
  if (this.length < AC_MIN) this.renorm();
  m.count[sym]++;
  if (--m.untilUpdate === 0) m.update();
  return sym;
};
AcDecoder.prototype.bit = function (m) {
  const x = m.prob * (this.length >>> BM_SHIFT), sym = this.value >= x ? 1 : 0;
  if (sym === 0) { this.length = x; m.b0++; } else { this.value -= x; this.length -= x; }
  if (this.length < AC_MIN) this.renorm();
  if (--m.until === 0) m.update();
  return sym;
};
AcDecoder.prototype.short = function () { this.length = this.length >>> 16; const s = Math.floor(this.value / this.length); this.value -= this.length * s; if (this.length < AC_MIN) this.renorm(); return s; };
AcDecoder.prototype.bits = function (bits) {
  if (bits > 19) { const lo = this.short(); bits -= 16; const hi = this.bits(bits) * 65536; return hi + lo; }
  this.length = Math.floor(this.length / 2 ** bits); const s = Math.floor(this.value / this.length); this.value -= this.length * s; if (this.length < AC_MIN) this.renorm(); return s;
};
/* IntegerCompressor (32 bitar, inget intervall), bara avkodning. */
function IntDecoder(dec, contexts) {
  this.dec = dec; this.mBits = []; for (let i = 0; i < contexts; i++) this.mBits.push(new AcModel(33));
  this.corr = [new AcBit()]; for (let i = 1; i <= 32; i++) this.corr.push(new AcModel(i <= 8 ? 1 << i : 256));
}
IntDecoder.prototype.decompress = function (pred, ctx) {
  const d = this.dec, k = d.symbol(this.mBits[ctx]);
  let c;
  if (k) {
    if (k < 32) {
      if (k <= 8) c = d.symbol(this.corr[k]);
      else { const k1 = k - 8; c = d.symbol(this.corr[k]); c = c * 2 ** k1 + d.bits(k1); }
      if (c >= 2 ** (k - 1)) c += 1; else c -= 2 ** k - 1;
    } else c = -2147483648;
  } else c = d.bit(this.corr[0]);
  return (pred + c) | 0;
};
const blobBytes = async (f, a, b) => new Uint8Array(await f.slice(a, b).arrayBuffer());
/* LAZ-filens block: [{ start, end, n }] ur blocktabellen. */
async function lazChunks(file, h, chunkSize) {
  const tp = new DataView((await blobBytes(file, h.offset, h.offset + 8)).buffer);
  let tableAt = Number(tp.getBigInt64(0, true));
  if (tableAt === -1) tableAt = Number(new DataView((await blobBytes(file, file.size - 8, file.size)).buffer).getBigInt64(0, true));
  if (!(tableAt > h.offset && tableAt < file.size)) throw new Error("LAZ-filen saknar blocktabell.");
  const head = new DataView((await blobBytes(file, tableAt, tableAt + 8)).buffer), nChunks = head.getUint32(4, true);
  if (head.getUint32(0, true) !== 0 || !nChunks) throw new Error("LAZ-filens blocktabell kan inte läsas.");
  const tbl = await blobBytes(file, tableAt + 8, Math.min(file.size, tableAt + 8 + 64 + nChunks * 16));
  const ic = new IntDecoder(new AcDecoder(tbl, 0), 2), variable = chunkSize === 0xFFFFFFFF;
  const sizes = [], counts = [];
  let ps = 0, pc = 0;
  for (let i = 0; i < nChunks; i++) {
    if (variable) { pc = ic.decompress(i ? pc : 0, 0); counts.push(pc >>> 0); }
    ps = ic.decompress(i ? ps : 0, 1); sizes.push(ps >>> 0);
  }
  const out = []; let at = h.offset + 8, left = h.count;
  for (let i = 0; i < nChunks; i++) { const n = Math.min(left, variable ? counts[i] : chunkSize); out.push({ start: at, end: at + sizes[i], n }); at += sizes[i]; left -= n; }
  // Kontroll: blocken ska sluta precis där tabellen börjar (annars är avkodningen fel – läs inte skräp).
  if (at !== tableAt) throw new Error("LAZ-filens blocktabell stämmer inte.");
  return out;
}
async function readLasFile(file, budget, post) {
  const h0 = lasHeader(new DataView((await blobBytes(file, 0, 375)).buffer));
  const hb = await blobBytes(file, 0, h0.offset), dv = new DataView(hb.buffer), h = lasHeader(dv), lay = lasLayout(h.format);
  const total = h.count, center = [0, 1, 2].map(a => (h.min[a] + h.max[a]) / 2);
  const S = new Sampler(total, budget), out = new Store(Math.min(total, budget * 1.05));
  let shift = -1;
  const take = (pv, o) => {
    const x = pv.getInt32(o, true) * h.scale[0] + h.off[0] - center[0], y = pv.getInt32(o + 4, true) * h.scale[1] + h.off[1] - center[1], z = pv.getInt32(o + 8, true) * h.scale[2] + h.off[2] - center[2];
    const it = pv.getUint16(o + 12, true);
    let r = 0, g = 0, b = 0;
    if (lay.rgbAt >= 0) { const R = pv.getUint16(o + lay.rgbAt, true), G = pv.getUint16(o + lay.rgbAt + 2, true), B = pv.getUint16(o + lay.rgbAt + 4, true); if (shift < 0) shift = Math.max(R, G, B) > 255 ? 8 : 0; r = R >> shift; g = G >> shift; b = B >> shift; }
    out.push(x, y, z, r, g, b, it > 255 ? it >> 8 : it);
  };
  if (!h.compressed) {
    const per = Math.max(1, Math.floor((32 << 20) / h.len));
    for (let i = 0; i < total; i += per) {
      const n = Math.min(per, total - i), u8 = await blobBytes(file, h.offset + i * h.len, h.offset + (i + n) * h.len), pv = new DataView(u8.buffer);
      for (let j = 0; j < n; j++) if (S.take()) take(pv, j * h.len);
      post((i + n) / total);
    }
  } else {
    // LASzip-posten: blockstorleken.
    let chunkSize = 0, at = dv.getUint16(94, true);
    for (let v = 0, nv = dv.getUint32(100, true); v < nv && at + 54 <= hb.length; v++) {
      const uid = String.fromCharCode(...hb.subarray(at + 2, at + 18)).replace(/\0.*$/, ""), rid = dv.getUint16(at + 18, true), rl = dv.getUint16(at + 20, true);
      if (uid === "laszip encoded" && rid === 22204) {
        if (![2, 3].includes(dv.getUint16(at + 54, true))) {
          // Gammalt LASzip-format utan block: hela filen i minnet (går upp till ~1,9 GB).
          if (file.size < 1.9e9) return readLas(await file.arrayBuffer(), budget, post);
          throw new Error("Den här LAZ-filen är inte delad i block (gammalt LASzip-format) och kan bara läsas om den är under 1,9 GB. Spara om den med LASzip/CloudCompare så delas den i block.");
        }
        chunkSize = dv.getUint32(at + 54 + 12, true);
      }
      at += 54 + rl;
    }
    if (!chunkSize) throw new Error("LAZ-filen saknar LASzip-uppgifterna.");
    if (![0, 1, 2, 3, 6, 7, 8].includes(h.format)) throw new Error(`Punktformat ${h.format} i LAZ stöds inte.`);
    const chunks = await lazChunks(file, h, chunkSize), L = await laz(), dp = L._malloc(h.len);
    let cap = 0, cp = 0, done = 0;
    try {
      for (const c of chunks) {
        const u8 = await blobBytes(file, c.start, c.end);
        if (u8.length + 16 > cap) { if (cp) L._free(cp); cap = Math.max(u8.length + 16, cap * 2); cp = L._malloc(cap); }
        L.HEAPU8.fill(0, cp + u8.length, cp + u8.length + 16); L.HEAPU8.set(u8, cp);
        const dec = new L.ChunkDecoder();
        try {
          dec.open(h.format, h.len, cp);
          for (let i = 0; i < c.n; i++) { dec.getPoint(dp); if (S.take()) take(new DataView(L.HEAPU8.buffer, dp, h.len), 0); }
        } finally { dec.delete(); }
        done += c.n; post(done / total);
      }
    } finally { if (cp) L._free(cp); L._free(dp); }
  }
  return { out, center, min: h.min, max: h.max, total, rgb: lay.rgbAt >= 0, intensity: true, format: (h.compressed ? "LAZ" : "LAS") + " 1." + h.minor + " (läst i block)" };
}

/* ---- Text: XYZ / PTS / TXT / CSV ------------------------------------------------------------------- */
function readText(buf, budget, post, name) {
  const u8 = new Uint8Array(buf), dec = new TextDecoder();
  // Antal punkter uppskattas efter radlängden i början (PTS: första raden är antalet).
  const head = dec.decode(u8.subarray(0, Math.min(u8.length, 200000))).split(/\r?\n/);
  let lines = head.length > 2 ? head.slice(0, -1) : head, avg = Math.max(8, (Math.min(u8.length, 200000)) / Math.max(1, lines.length));
  let total = Math.max(1, Math.round(u8.length / avg));
  if (/\.pts$/i.test(name) && /^\s*\d+\s*$/.test(lines[0] || "")) total = Number(lines[0]);
  const S = new Sampler(total, budget), out = new Store(Math.min(total, budget * 1.1));
  let ref = null, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], rgb = false, intensity = false, cols = 0;
  const CH = 8 << 20;
  let rest = "", done = 0;
  for (let o = 0; o < u8.length; o += CH) {
    const txt = rest + dec.decode(u8.subarray(o, Math.min(u8.length, o + CH)), { stream: o + CH < u8.length });
    const arr = txt.split("\n"); rest = arr.pop();
    for (const ln of arr) { line(ln); }
    done += CH; post(Math.min(1, o / u8.length));
  }
  if (rest) line(rest);
  function line(ln) {
    const p = ln.trim().split(/[\s,;]+/);
    if (p.length < 3) return;
    const x = +p[0], y = +p[1], z = +p[2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
    if (!ref) { ref = [x, y, z]; cols = p.length; rgb = cols >= 6; intensity = cols === 4 || cols >= 7; }
    if (x < min[0]) min[0] = x; if (y < min[1]) min[1] = y; if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x; if (y > max[1]) max[1] = y; if (z > max[2]) max[2] = z;
    if (!S.take()) return;
    let r = 0, g = 0, b = 0, it = 0;
    if (cols >= 7) { it = +p[3]; r = +p[4]; g = +p[5]; b = +p[6]; }      // x y z i r g b (PTS)
    else if (cols >= 6) { r = +p[3]; g = +p[4]; b = +p[5]; }            // x y z r g b
    else if (cols === 4) it = +p[3];                                     // x y z i
    if (it < 0) it = (it + 2048) / 4096 * 255; else if (it > 255) it = it / 257; // PTS: −2048..2047, 16 bitar
    out.push(x - ref[0], y - ref[1], z - ref[2], r & 255, g & 255, b & 255, Math.max(0, Math.min(255, it)) | 0);
  }
  if (!ref) throw new Error("Hittade inga punkter (x y z per rad) i filen.");
  return { out, center: ref, min, max, total: Math.max(out.n, total), rgb, intensity, format: "Text (x y z)" };
}

/* ---- PLY ----------------------------------------------------------------------------------------- */
function readPly(buf, budget, post) {
  const u8 = new Uint8Array(buf);
  let end = -1;
  for (let i = 0; i < Math.min(u8.length - 10, 65536); i++) if (u8[i] === 101 && String.fromCharCode(...u8.subarray(i, i + 10)) === "end_header") { end = i + 10; while (u8[end] === 13 || u8[end] === 10) end++; break; }
  if (end < 0) throw new Error("Okänt PLY-huvud.");
  const head = new TextDecoder().decode(u8.subarray(0, end)).split(/\r?\n/);
  const fmt = (head.find(l => l.startsWith("format")) || "").split(/\s+/)[1];
  let n = 0, props = [], inV = false;
  head.forEach(l => {
    const p = l.trim().split(/\s+/);
    if (p[0] === "element") { inV = p[1] === "vertex"; if (inV) n = +p[2]; }
    else if (p[0] === "property" && inV && p[1] !== "list") props.push({ t: p[1], name: p[2] });
  });
  const SZ = { char: 1, uchar: 1, int8: 1, uint8: 1, short: 2, ushort: 2, int16: 2, uint16: 2, int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
  const S = new Sampler(n, budget), out = new Store(Math.min(n, budget * 1.05));
  const ix = k => props.findIndex(p => p.name === k);
  const iX = ix("x"), iY = ix("y"), iZ = ix("z"), iR = ix("red") >= 0 ? ix("red") : ix("r"), iG = ix("green") >= 0 ? ix("green") : ix("g"), iB = ix("blue") >= 0 ? ix("blue") : ix("b"), iI = ix("intensity") >= 0 ? ix("intensity") : ix("scalar_intensity");
  if (iX < 0 || iY < 0 || iZ < 0) throw new Error("PLY-filen saknar x, y, z.");
  let ref = null, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const push = v => {
    const x = v[iX], y = v[iY], z = v[iZ];
    if (!ref) ref = [x, y, z];
    if (x < min[0]) min[0] = x; if (y < min[1]) min[1] = y; if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x; if (y > max[1]) max[1] = y; if (z > max[2]) max[2] = z;
    if (!S.take()) return;
    const c = k => (k < 0 ? 0 : props[k].t.includes("short") || props[k].t.includes("16") ? v[k] >> 8 : props[k].t.startsWith("float") || props[k].t === "double" ? Math.round(v[k] * (v[k] <= 1 ? 255 : 1)) : v[k]);
    out.push(x - ref[0], y - ref[1], z - ref[2], c(iR) & 255, c(iG) & 255, c(iB) & 255, iI < 0 ? 0 : Math.max(0, Math.min(255, c(iI))) | 0);
  };
  if (fmt === "ascii") {
    const lines = new TextDecoder().decode(u8.subarray(end)).split(/\r?\n/);
    for (let i = 0; i < n && i < lines.length; i++) { push(lines[i].trim().split(/\s+/).map(Number)); if ((i & 0xffff) === 0) post(i / n); }
  } else if (fmt === "binary_little_endian") {
    const dv = new DataView(buf), offs = []; let stride = 0;
    props.forEach(p => { offs.push(stride); stride += SZ[p.t] || 4; });
    const rd = (o, t) => { switch (t) { case "char": case "int8": return dv.getInt8(o); case "uchar": case "uint8": return dv.getUint8(o); case "short": case "int16": return dv.getInt16(o, true); case "ushort": case "uint16": return dv.getUint16(o, true); case "int": case "int32": return dv.getInt32(o, true); case "uint": case "uint32": return dv.getUint32(o, true); case "double": case "float64": return dv.getFloat64(o, true); default: return dv.getFloat32(o, true); } };
    const v = new Array(props.length);
    for (let i = 0; i < n; i++) {
      const b = end + i * stride;
      if (b + stride > buf.byteLength) break;
      for (let k = 0; k < props.length; k++) v[k] = rd(b + offs[k], props[k].t);
      push(v);
      if ((i & 0x3ffff) === 0) post(i / n);
    }
  } else throw new Error("PLY-formatet " + fmt + " stöds inte (ascii eller binary_little_endian).");
  if (!ref) throw new Error("PLY-filen har inga punkter.");
  return { out, center: ref, min, max, total: n, rgb: iR >= 0, intensity: iI >= 0, format: "PLY" };
}

/* ---- Rutnät ---------------------------------------------------------------------------------------- */
function grid(r) {
  const { out } = r, n = out.n;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) { const x = out.pos[i * 3], y = out.pos[i * 3 + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const G = n > 200000 ? 8 : n > 20000 ? 4 : 1, cw = Math.max(1e-6, (x1 - x0) / G), ch = Math.max(1e-6, (y1 - y0) / G);
  const cell = new Uint16Array(n), cnt = new Uint32Array(G * G);
  for (let i = 0; i < n; i++) {
    const cx = Math.min(G - 1, Math.floor((out.pos[i * 3] - x0) / cw)), cy = Math.min(G - 1, Math.floor((out.pos[i * 3 + 1] - y0) / ch));
    cell[i] = cy * G + cx; cnt[cell[i]]++;
  }
  const chunks = [], at = new Uint32Array(G * G);
  for (let c = 0; c < G * G; c++) if (cnt[c]) chunks.push({ c, pos: new Float32Array(cnt[c] * 3), rgb: new Uint8Array(cnt[c] * 3), inten: new Uint8Array(cnt[c]) });
  const byCell = new Map(chunks.map(k => [k.c, k]));
  for (let i = 0; i < n; i++) {
    const k = byCell.get(cell[i]), j = at[cell[i]]++;
    k.pos[j * 3] = out.pos[i * 3]; k.pos[j * 3 + 1] = out.pos[i * 3 + 1]; k.pos[j * 3 + 2] = out.pos[i * 3 + 2];
    k.rgb[j * 3] = out.rgb[i * 3]; k.rgb[j * 3 + 1] = out.rgb[i * 3 + 1]; k.rgb[j * 3 + 2] = out.rgb[i * 3 + 2];
    k.inten[j] = out.int[i];
  }
  return chunks.map(({ pos, rgb, inten }) => ({ pos, rgb, inten }));
}

onmessage = async ev => {
  const { name, budget, file } = ev.data;
  let bytes = ev.data.bytes;
  let last = 0;
  const post = f => { const t = Date.now(); if (t - last > 150) { last = t; postMessage({ type: "progress", f }); } };
  try {
    const nm = String(name || "").toLowerCase();
    let r;
    if (file && /\.(las|laz)$/.test(nm)) r = await readLasFile(file, budget, post); // från datorn: bit för bit, ingen storleksgräns
    else if (file && file.size > 1.9e9) throw new Error(`filen är ${(file.size / 1e9).toFixed(1).replace(".", ",")} GB – så stora filer kan bara läsas som LAS eller LAZ. Exportera molnet som LAZ (t.ex. i CloudCompare eller Trimble Business Center).`);
    else if (/\.(las|laz)$/.test(nm)) r = await readLas(bytes || await file.arrayBuffer(), budget, post);
    else if (/\.ply$/.test(nm)) r = readPly(bytes || await file.arrayBuffer(), budget, post);
    else if (/\.(xyz|pts|txt|csv|asc)$/.test(nm)) r = readText(bytes || await file.arrayBuffer(), budget, post, nm);
    else if (/\.e57$/.test(nm)) throw new Error("E57 kan inte läsas här än – exportera molnet som LAZ eller LAS (t.ex. i Trimble Business Center, RealWorks eller CloudCompare).");
    else throw new Error("Okänt punktmolnsformat: " + name);
    const chunks = grid(r);
    const tr = []; chunks.forEach(c => tr.push(c.pos.buffer, c.rgb.buffer, c.inten.buffer));
    postMessage({ type: "done", info: { n: r.out.n, total: r.total, center: r.center, min: r.min, max: r.max, rgb: r.rgb, intensity: r.intensity, format: r.format }, chunks }, tr);
  } catch (e) {
    // Filen gick inte att läsa från disken (OneDrive "endast online", ändrad efter att den valdes m.m.).
    const unreadable = e && (e.name === "NotReadableError" || e.name === "NotFoundError");
    postMessage({ type: "error", message: unreadable ? "webbläsaren fick inte läsa filen. Ligger den i OneDrive/SharePoint som \"endast online\" eller ändrades den efter att du valde den? Kopiera filen till en lokal mapp (t.ex. Skrivbordet) och välj den igen med ＋ Punktmoln från fil… – eller lägg den i Trimble Connect och tänd den under Trimble Connect mapp." : e && e.message ? e.message : String(e) });
  }
};
