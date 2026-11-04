/* DWF (3D) -> trianglar, helt i webbläsaren (Victor 2026-11-04: "3D-DWF från Navisworks Simulate").
   En .dwf är en zip med manifest, en W3D-ström (HSF = HOOPS Stream Format) och XML med objektnamn.
   Läsaren är skriven efter Autodesks publika formatbeskrivning (HSF-opcodes, Edgebreaker) och Rossignacs artikel
   "Edgebreaker: Connectivity compression for triangle meshes" (1999) – ingen kod från andra läsare är använd.

   Resultat (dwfParse): { name, unit, parts: [{ name, path, geom, m (16 tal, kolumnvis), color }], geoms: [{ pos, idx }], stats }
   - geoms delas mellan delar (en komponent som finns på många ställen lagras en gång).
   - m är världsmatrisen (kolumnvis som THREE.Matrix4.elements) i filens enhet.
   Kräver fflate (vendor/three/fflate.min.js). */

/* ---------- Edgebreaker ----------
   Strömmen lagrar CLERS-koderna i kodningsordning. Vid avkodning går vi baklänges (Spirale Reversi):
     E  ny triangel med tre nya hörn på en ny slinga,   L / R  ny triangel med ett nytt hörn vid grinden,
     C  triangel vid grinden där hörnet tas bort ur slingan,   S  slår ihop slingan med den översta på stapeln.
   Hörnen numreras som kodaren gjorde: först kantslingan (från grindens första hörn), sedan C-hörnen i kodningsordning,
   komponent för komponent. Koderna: 0=C 1=L 2=E 3=R 4=S. */
function dwfEbSegments(ops) {
  const segs = []; let n = 0, st = 0;
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    if (o === 4) n++;
    else if (o === 2) { n--; if (n < 0) { segs.push([st, i + 1]); st = i + 1; n = 0; } }
  }
  if (st !== ops.length) throw new Error("Edgebreaker: koderna slutar mitt i en komponent.");
  return segs;
}
function dwfEbComp(ops, a0, a1) {
  const nxt = new Map(), prv = new Map(), par = [], tris = [], stack = [], cn = [];
  const mk = () => { par.push(par.length); return par.length - 1; };
  const find = v => { while (par[v] !== v) { par[v] = par[par[v]]; v = par[v]; } return v; };
  let g0 = -1, g1 = -1;
  for (let i = a1 - 1; i >= a0; i--) {
    const op = ops[i];
    if (op === 2) {
      if (g0 >= 0) stack.push([g0, g1]);
      const a = mk(), b = mk(), x = mk();
      nxt.set(a, b); nxt.set(b, x); nxt.set(x, a); prv.set(b, a); prv.set(x, b); prv.set(a, x);
      tris.push(a, b, x); g0 = a; g1 = b;
    } else if (op === 0) {
      const x = g0, b = g1, a = prv.get(x);
      tris.push(a, b, x); cn.push(x);
      nxt.set(a, b); prv.set(b, a); nxt.delete(x); prv.delete(x); g0 = a; g1 = b;
    } else if (op === 1) {
      const p = g0, b = g1, a = mk();
      nxt.set(p, a); prv.set(a, p); nxt.set(a, b); prv.set(b, a);
      tris.push(a, b, p); g0 = a; g1 = b;
    } else if (op === 3) {
      const a = g0, nn = g1, b = mk();
      nxt.set(a, b); prv.set(b, a); nxt.set(b, nn); prv.set(nn, b);
      tris.push(a, b, nn); g0 = a; g1 = b;
    } else if (op === 4) {
      const x = g0, b = g1, top = stack.pop(); if (!top) throw new Error("Edgebreaker: S utan slinga.");
      const a = top[0], x2 = top[1], nd = nxt.get(x2);
      nxt.set(x, nd); prv.set(nd, x); nxt.set(a, b); prv.set(b, a); par[x2] = x;
      tris.push(a, b, x); g0 = a; g1 = b;
    } else throw new Error("Edgebreaker: okänd kod " + op);
  }
  if (stack.length) throw new Error("Edgebreaker: slingor kvar efter avkodningen.");
  const border = []; { let v = g0; do { border.push(v); v = nxt.get(v); if (border.length > par.length + 2) throw new Error("Edgebreaker: slingan sluter sig inte."); } while (v !== g0); }
  // trianglar i kodningsordning, hörn som rotnoder
  const T = new Int32Array(tris.length);
  for (let i = 0, nt = tris.length / 3; i < nt; i++) for (let k = 0; k < 3; k++) T[i * 3 + k] = find(tris[(nt - 1 - i) * 3 + k]);
  const C = cn.map(find).reverse();
  return { T, border, C };
}
/* ops, antal punkter, dummies (hörn som tas bort), patches [gammalt, nytt]. Ger index in i punktlistan (utan dummies). */
function dwfEbDecode(ops, dummies, patches) {
  const segs = dwfEbSegments(ops), out = []; let base = 0;
  const patch = new Map(); (patches || []).forEach(([o, n]) => patch.set(o, n));
  for (const [a0, a1] of segs) {
    const { T, border, C } = dwfEbComp(ops, a0, a1);
    const ids = new Map(); let k = base;
    border.forEach(v => ids.set(v, k++)); C.forEach(v => ids.set(v, k++));
    for (let i = 0; i < T.length; i++) { if (!ids.has(T[i])) ids.set(T[i], k++); }
    for (let i = 0; i < T.length; i++) out.push(ids.get(T[i]));
    base = k;
  }
  const dm = new Set(dummies || []); patch.forEach((_, o) => dm.add(o)); const remap = new Int32Array(base); let pi = 0;
  for (let v = 0; v < base; v++) remap[v] = dm.has(v) ? -1 : pi++;
  const idx = [];
  for (let i = 0; i < out.length; i += 3) {
    let a = out[i], b = out[i + 1], c = out[i + 2];
    if (patch.size) { a = patch.get(a) ?? a; b = patch.get(b) ?? b; c = patch.get(c) ?? c; } if (a >= base || b >= base || c >= base) continue;
    const ra = remap[a], rb = remap[b], rc = remap[c];
    if (ra < 0 || rb < 0 || rc < 0 || ra === rb || rb === rc || ra === rc) continue;
    idx.push(ra, rb, rc);
  }
  return { idx, vertices: pi };
}

/* ---------- HSF-strömmen ---------- */
function dwfWalk(b, onLog) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), n = b.length;
  const i32 = p => dv.getInt32(p, true), u16 = p => dv.getUint16(p, true);
  const str = (p, l) => { let s = ""; for (let i = 0; i < l; i++) s += String.fromCharCode(b[p + i]); return s; };
  const varLen = p => b[p] === 0 ? p + 4 : p + 1 + b[p];
  const geomEnd = p => (b[p] & 0x80) ? p + 2 : p + 1;
  const root = { name: "", kids: [], geoms: [], incs: [], m: null, color: null, tag: -1 };
  const lib = new Map(), stack = [root];
  let cur = root, tag = 0, pend = false, p = 0;
  const readColor = q => {
    q = geomEnd(q); let ch = b[q++]; if (ch & 0x80) { ch |= b[q++] << 8; }
    let diffuse = null;
    for (const bit of [0x01, 0x02, 0x04, 0x08, 0x10]) { if (ch & bit) { if (bit === 1 && b[q] === 0) diffuse = [b[q + 1], b[q + 2], b[q + 3]]; q = varLen(q); } }
    if (ch & 0x20) q += 4; if (ch & 0x40) q += 4; if (ch & 0x100) q = varLen(q); if (ch & 0x200) q = varLen(q);
    return [q, diffuse];
  };
  const shell = q => {
    const sub = b[q++]; let sub2 = 0;
    if (sub & 0x80) { sub2 = u16(q); q += 2; }
    if (sub2 & 2) { if (!(sub & 0x10)) q += 4; return [q + 1, null]; }
    if (sub & 0x20) return [q + 1 + 24, null];
    if (sub2 & 1) throw new Error("W3D: LOD-samling stöds inte.");
    if (!(sub & 0x10)) q += 4;
    q++; // detaljnivå
    const comp = sub & 0x41, sch = comp ? b[q++] : 4;
    let pos = null, idx = null;
    if (sch === 5) {
      const ln = i32(q); q += 4; const e = q;
      const opsLen = i32(e + 4), mtLen = i32(e + 8), npts = i32(e + 16), ver = b[e];
      let o = e + (ver >= 1 ? 24 : 20); const ops = b.subarray(o, o + opsLen); o += opsLen; o += (4 - (o - e) % 4) % 4;
      // MTable
      let r = o; const fl = i32(r); r += 4; let nl = 0, nd = 0, npat = 0;
      if (fl & 1) { nl = i32(r); r += 4; } if (fl & 2) r += 4; if (fl & 8) { nd = i32(r); r += 4; } if (fl & 16) { npat = i32(r); r += 4; }
      r += 4 * nl; if (fl & 2) r += 0; // m2stack saknas i praktiken
      const dummies = []; let s = 0; for (let i = 0; i < nd; i++) { s += i32(r); r += 4; dummies.push(s); }
      const patches = []; let po = 0; for (let i = 0; i < npat; i += 2) { po += i32(r); const nw = i32(r + 4); r += 8; patches.push([po, nw]); }
      q = e + ln;
      if (sub & 1) throw new Error("W3D: Edgebreaker med packade punkter stöds inte.");
      const f = new Float32Array(npts * 3); for (let i = 0; i < npts * 3; i++) f[i] = dv.getFloat32(q + i * 4, true);
      q += npts * 12; pos = f;
      const dec = dwfEbDecode(ops, dummies, patches);
      if (dec.vertices !== npts) throw new Error(`W3D: punktantalet stämmer inte (${dec.vertices} mot ${npts}).`);
      idx = dec.idx;
    } else if (sch === 4) {
      const npts = i32(q); q += 4; const f = new Float32Array(npts * 3); for (let i = 0; i < npts * 3; i++) f[i] = dv.getFloat32(q + i * 4, true);
      q += npts * 12; pos = f;
      q++; const ln = i32(q); q += 4; const bits = b[q], w = bits / 8; if (w !== 1 && w !== 2 && w !== 4) throw new Error("W3D: ovanlig ytlista (" + bits + " bitar).");
      const vals = []; for (let o = q + 1; o + w <= q + ln; o += w) vals.push(w === 1 ? b[o] : w === 2 ? u16(o) : i32(o));
      q += ln; idx = [];
      const strips = !!(sub & 4);
      for (let i = 0; i < vals.length;) {
        let c = vals[i++]; if (w === 2 && c > 32767 && (sub2 & 4)) c -= 65536; if (w === 4 && (sub2 & 4)) c |= 0;
        const k = Math.abs(c); if (k < 3 || i + k > vals.length) break;
        if (strips) { for (let t = 2; t < k; t++) { if (c < 0) idx.push(vals[i], vals[i + t - 1], vals[i + t]); else if (t % 2 === 0) idx.push(vals[i + t - 2], vals[i + t - 1], vals[i + t]); else idx.push(vals[i + t - 1], vals[i + t - 2], vals[i + t]); } }
        else if (c > 0) for (let t = 2; t < k; t++) idx.push(vals[i], vals[i + t - 1], vals[i + t]);
        i += k;
      }
    } else throw new Error("W3D: ytkodning " + sch + " stöds inte.");
    if (sub & 0x08) { // attribut: bara normaler (kodning 7 med längd) förekommer; de räknas om vid visning
      for (;;) {
        const op = b[q++]; if (op === 0) break;
        const sc = b[q], bits = b[q + 1]; void bits; q += 2;
        if (sc === 1 || sc === 3) throw new Error("W3D: attribut " + op + " med kodning " + sc + " stöds inte.");
        q += 4 + i32(q);
      }
    }
    return [q, { pos, idx }];
  };
  while (p < n) {
    const op = b[p++];
    switch (op) {
      case 0x28: { const l = b[p++]; const name = str(p, l); p += l; const s = { name, kids: [], geoms: [], incs: [], m: null, color: null, tag: pend ? tag++ : -1 }; pend = false; cur.kids.push(s); stack.push(s); cur = s; if (stack.length === 2) lib.set(name, s); break; }
      case 0x29: stack.pop(); cur = stack[stack.length - 1]; break;
      case 0x71: pend = true; break;
      case 0x25: { const m = new Float32Array(12); for (let i = 0; i < 12; i++) m[i] = dv.getFloat32(p + i * 4, true); cur.m = m; p += 48; break; }
      case 0x22: { const [q, c] = readColor(p); p = q; if (c) cur.color = c; break; }
      case 0x7e: p = geomEnd(p) + 3; break;
      case 0x53: { const [q, g] = shell(p); p = q; if (g && g.idx.length >= 3) cur.geoms.push(g); break; }
      case 0x3c: { const l = b[p++]; cur.incs.push(str(p, l)); p += l; break; }
      case 0x55: { let l = u16(p); p += 2; if (l === 65535) { l = i32(p); p += 4; } p += l; break; }
      case 0x7d: { const pr = b[p]; p += 1 + 36 + 8; if (pr & 0x20) p += 4; if (pr & 0x40) p += 4; p += 1 + b[p]; break; }
      case 0x49: p += 4; break;
      case 0x7a: case 0x00: p = n; break;
      default: throw new Error(`W3D: okänd opcode 0x${op.toString(16)} på byte ${p - 1}. Filen använder funktioner som läsaren inte kan än.`);
    }
  }
  return { root, lib };
}

/* ---------- matriser (radvektorer, 12 tal: tre rader + förflyttning) ---------- */
const dwfMul = (a, b) => { // a inuti b: p·a·b
  const o = new Float64Array(12);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
    let v = 0; for (let k = 0; k < 3; k++) v += (r < 3 ? a[r * 3 + k] : a[9 + k]) * b[k * 3 + c];
    if (r === 3) v += b[9 + c]; o[r * 3 + c] = v;
  }
  return o;
};
const DWF_I = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
const dwfM4 = m => [m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, m[9], m[10], m[11], 1]; // kolumnvis (rad i = kolumn i)

/* ---------- hela filen ---------- */
function dwfFlatGeom(segGeoms) { // slå ihop flera ytor i samma segment
  if (segGeoms.length === 1) return segGeoms[0];
  let np = 0, ni = 0; segGeoms.forEach(g => { np += g.pos.length; ni += g.idx.length; });
  const pos = new Float32Array(np), idx = new Uint32Array(ni); let po = 0, io = 0;
  segGeoms.forEach(g => { for (let i = 0; i < g.idx.length; i++) idx[io + i] = g.idx[i] + po / 3; pos.set(g.pos, po); po += g.pos.length; io += g.idx.length; });
  return { pos, idx };
}
function dwfBuild(walked, names, opts) {
  const { root, lib } = walked, parts = [], geoms = [], geomOf = new Map(); let tris = 0;
  const geomId = (seg, key) => {
    if (geomOf.has(key)) return geomOf.get(key);
    const g = dwfFlatGeom(seg.geoms), id = geoms.length;
    geoms.push({ pos: g.pos, idx: g.idx instanceof Uint32Array ? g.idx : Uint32Array.from(g.idx) });
    geomOf.set(key, id); return id;
  };
  const visit = (seg, m, color, path, nameStack, inLib) => {
    if (seg.m) m = dwfMul(seg.m, m);
    if (seg.color) color = seg.color;
    let nm = nameStack;
    if (seg.tag >= 0 && names && names.has(seg.tag)) nm = names.get(seg.tag);
    if (seg.geoms.length) {
      const id = geomId(seg, seg);
      parts.push({ name: nm || seg.name || "Del", path, geom: id, m: dwfM4(m), color: color || null });
      tris += geoms[id].idx.length / 3;
    }
    for (const inc of seg.incs) {
      const t = lib.get(inc); if (!t) continue;
      for (const k of t.kids.length ? [t] : []) visit(k, m, color, path, nm, true);
    }
    for (const k of seg.kids) {
      if (!inLib && k.name.startsWith("?Include Library")) continue; // biblioteket ritas bara via <
      visit(k, m, color, seg.tag >= 0 && names && names.has(seg.tag) ? path.concat(names.get(seg.tag)) : path, nm, inLib);
    }
  };
  visit(root, DWF_I, null, [], "", false);
  return { parts, geoms, stats: { parts: parts.length, geoms: geoms.length, tris } };
}

/* Objektnamn (_name) per segmentnummer ur "object definition"-XML:n (kan vara >100 MB, läses i bitar). */
function dwfNames(xmlBytes) {
  const dec = new TextDecoder("utf-8"), objName = new Map(), nodeObj = new Map();
  const CH = 4 << 20; let carry = "";
  for (let o = 0; o < xmlBytes.length; o += CH) {
    const s = carry + dec.decode(xmlBytes.subarray(o, Math.min(xmlBytes.length, o + CH)), { stream: true });
    let last = s.lastIndexOf("</Object>"), lastI = s.lastIndexOf("</Instance>"), cut = Math.max(last + 9, lastI + 11, 0);
    if (o + CH >= xmlBytes.length) cut = s.length;
    const part = s.slice(0, cut); carry = s.slice(cut);
    let m; const reO = /<Object id="(\d+)"[^>]*>.*?<Property name="_name" value="([^"]*)"/g;
    const segs = part.split("</Object>");
    for (const seg of segs) { const mo = /<Object id="(\d+)"/.exec(seg); if (!mo) continue; const mn = /<Property name="_name" value="([^"]*)"/.exec(seg); if (mn) objName.set(mo[1], dwfUnxml(mn[1])); }
    const reI = /<Instance id="[^"]*" object="(\d+)" nodes="(\d+)"/g;
    while ((m = reI.exec(part))) nodeObj.set(+m[2], m[1]);
    void reO;
  }
  const names = new Map(); nodeObj.forEach((obj, node) => { const n = objName.get(obj); if (n) names.set(node, n); });
  return names;
}
const dwfUnxml = s => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));

/* Egen zip-läsare: DWF-paketen har katalogen sist och en 12 byte lång rubrik före första posten. */
function dwfZipEntries(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("Zip-katalogen hittades inte.");
  const n = dv.getUint16(e + 10, true), cdSize = dv.getUint32(e + 12, true), cdOff = dv.getUint32(e + 16, true);
  // katalogens plats räknad från slutet gör att en rubrik före zipen inte spelar roll
  const shift = e - cdSize - cdOff;
  let p = e - cdSize; const out = new Map();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true) + shift;
    let name = ""; for (let i = 0; i < nl; i++) name += String.fromCharCode(u8[p + 46 + i]);
    out.set(name, { method, csize, usize, lho });
    p += 46 + nl + el + cl;
  }
  return { entries: out, read(name, f) {
    const en = out.get(name); if (!en) return null;
    const start = en.lho + 30 + dv.getUint16(en.lho + 26, true) + dv.getUint16(en.lho + 28, true), raw = u8.subarray(start, start + en.csize);
    return en.method === 0 ? raw : f.inflateSync(raw, new Uint8Array(en.usize));
  } };
}
function dwfParse(buf, opts = {}) {
  const say = (t, f) => { if (opts.progress) opts.progress(t, f); };
  const f = typeof fflate !== "undefined" ? fflate : (typeof require === "function" ? require("./vendor/three/fflate.min.js") : null);
  if (!f) throw new Error("fflate saknas.");
  let u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let pk = -1; for (let i = 0; i < Math.min(u8.length - 4, 4096); i++) if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 3 && u8[i + 3] === 4) { pk = i; break; }
  if (pk < 0) throw new Error("Det här är inget DWF-paket (hittar ingen zip).");
  say("Packar upp DWF-paketet", 0.05);
  const zip = dwfZipEntries(u8), key = [...zip.entries.keys()].filter(k => /\.(w3d|xml)$/i.test(k)), files = {};
  key.forEach(k => { Object.defineProperty(files, k, { get() { const v = zip.read(k, f); Object.defineProperty(files, k, { value: v }); return v; }, configurable: true, enumerable: true }); });
  const sizeOf = k => zip.entries.get(k).usize, w3dKey = key.find(k => /\.w3d$/i.test(k));
  if (!w3dKey) throw new Error("Filen innehåller ingen 3D-ström (.w3d). Är det en 2D-DWF? Då stöds den inte här.");
  const desc = key.find(k => /descriptor\.xml$/i.test(k)), defKey = key.find(k => /\.xml$/i.test(k) && sizeOf(k) > 100000 && !/descriptor/i.test(k));
  const unit = desc ? ((new TextDecoder().decode(files[desc]).match(/<eModel:Units type="(\w+)"/) || [])[1] || "ft") : "ft";
  const w3d = files[w3dKey]; let z = -1;
  for (let i = 0; i < Math.min(w3d.length - 2, 4096); i++) if (w3d[i] === 0x5a && w3d[i + 1] === 0x78) { z = i + 1; break; }
  say("Packar upp 3D-strömmen", 0.12);
  const stream = z >= 0 ? f.unzlibSync(w3d.subarray(z)) : w3d;
  say("Läser ytorna (kan ta en halv minut)", 0.2);
  const walked = dwfWalk(stream);
  say("Läser objektnamn", 0.7);
  let names = null; const xmlBig = key.filter(k => /\.xml$/i.test(k)).sort((a, b) => sizeOf(b) - sizeOf(a))[0];
  if (opts.names !== false && xmlBig && sizeOf(xmlBig) > 1000) { try { names = dwfNames(files[xmlBig]); } catch (e) { names = null; } }
  void defKey;
  say("Bygger delarna", 0.92);
  const built = dwfBuild(walked, names, opts);
  built.unit = unit; built.name = opts.name || "DWF"; built.named = names ? names.size : 0;
  return built;
}
if (typeof module !== "undefined" && module.exports) module.exports = { dwfParse, dwfEbDecode, dwfWalk };
