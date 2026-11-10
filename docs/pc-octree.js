/* Punktmoln: okträd med detaljnivåer på disken (Victor 2026-11-10: "hur klarar Trimble Connect och Vektor.io 228 miljoner punkter?").
   Samma princip som Potree (som Trimble Connect använder): molnet delas i ett okträd där varje nod har högst ~80 000 punkter. Roten är en gles
   översikt, noderna längre ner är allt tätare – bara de noder som syns, och som är stora nog på skärmen, läses in. Hela molnet behöver aldrig
   ligga i minnet; det ligger i webbläsarens filsystem (OPFS) och ritas efter behov.

   Körs i pc-worker.js (importScripts) – använder dess LAS/LAZ-läsare med en "mottagare" i stället för urvalet.
   Tre varv: 1) räkna punkter per ruta (256³) → bygg ett okträd som delar där det är tätt, 2) lägg varje punkt i sitt löv (tillfällig fil),
   3) nerifrån och upp: varje förälder tar var 8:e punkt från sina barn (additiv uppdelning – ingen punkt finns två gånger) och noderna skrivs till octree.bin.
   Positionerna lagras som 16 bitar inom nodens ruta (10 byte/punkt: 3×uint16 läge + r,g,b,intensitet). Hierarkin sparas i hierarchy.json. */
const OCT = { T: 80000, G: 256, GL: 8, SEL: 8 };

async function octreeConvert(file, name, opt, post) {
  if (!/\.(las|laz)$/i.test(name || "")) throw new Error("Okträd byggs bara från LAS/LAZ.");
  if (!(navigator.storage && navigator.storage.getDirectory)) throw new Error("Webbläsaren saknar lagring för stora moln (OPFS).");
  const root = await navigator.storage.getDirectory(), top = await root.getDirectoryHandle("4dplan-pc", { create: true });
  try { await top.removeEntry(opt.key, { recursive: true }); } catch (e) { /* fanns inte */ }
  const dir = await top.getDirectoryHandle(opt.key, { create: true });
  const h = lasHeader(new DataView((await blobBytes(file, 0, 375)).buffer)), total = h.count, center = [0, 1, 2].map(a => (h.min[a] + h.max[a]) / 2);
  const org = [h.min[0] - center[0], h.min[1] - center[1], h.min[2] - center[2]], ext = [h.max[0] - h.min[0], h.max[1] - h.min[1], h.max[2] - h.min[2]];
  const S = Math.max(ext[0], ext[1], ext[2], 1e-3) * (1 + 1e-6), G = OCT.G, GL = OCT.GL, inv = G / S;
  const cellOf = (x, y, z) => { let i = ((x - org[0]) * inv) | 0, j = ((y - org[1]) * inv) | 0, k = ((z - org[2]) * inv) | 0; i = i < 0 ? 0 : i >= G ? G - 1 : i; j = j < 0 ? 0 : j >= G ? G - 1 : j; k = k < 0 ? 0 : k >= G ? G - 1 : k; return (k * G + j) * G + i; };
  const report = (a, b, f) => post(a + (b - a) * Math.max(0, Math.min(1, f)));
  let hasRgb = false;

  // ---- Varv 1: räkna
  const cnt = new Uint32Array(G * G * G);
  const counter = { n: 0, push(x, y, z, r, g, b) { cnt[cellOf(x, y, z)]++; this.n++; if ((r | g | b) && !hasRgb) hasRgb = true; } };
  await readLasFile(file, Infinity, f => report(0, 0.28, f), counter);
  // pyramid av summor
  const lv = []; lv[GL] = cnt;
  for (let l = GL - 1; l >= 0; l--) {
    const n = 1 << l, a = new Uint32Array(n * n * n), c = lv[l + 1], m = n * 2;
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let s = 0; for (let dk = 0; dk < 2; dk++) for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) s += c[((2 * k + dk) * m + 2 * j + dj) * m + 2 * i + di];
      a[(k * n + j) * n + i] = s;
    }
    lv[l] = a;
  }
  const at = (l, i, j, k) => lv[l][(k * (1 << l) + j) * (1 << l) + i];
  // ---- Bygg trädet (djupet först)
  const nodes = [], leafOf = new Int32Array(G * G * G).fill(-1), leaves = [];
  (function build(l, i, j, k, parent) {
    const n = at(l, i, j, k); if (!n) return -1;
    const id = nodes.length, node = { id, l, i, j, k, n, ch: [], parent, leaf: false };
    nodes.push(node);
    if (n <= OCT.T || l === GL) {
      node.leaf = true; node.li = leaves.length; leaves.push(node);
      const sh = GL - l, s = 1 << sh;
      for (let dk = 0; dk < s; dk++) for (let dj = 0; dj < s; dj++) { const base = (((k << sh) + dk) * G + ((j << sh) + dj)) * G + (i << sh); leafOf.fill(node.li, base, base + s); }
    } else {
      for (let c = 0; c < 8; c++) { const r = build(l + 1, i * 2 + (c & 1), j * 2 + ((c >> 1) & 1), k * 2 + ((c >> 2) & 1), id); if (r >= 0) node.ch.push(r); }
    }
    return id;
  })(0, 0, 0, 0, -1);
  if (nodes.length < 2) throw new Error("Molnet är så litet att okträd inte behövs.");
  const box = nd => { const s = S / (1 << nd.l); return [org[0] + nd.i * s, org[1] + nd.j * s, org[2] + nd.k * s, s]; };

  // ---- Varv 2: sortera in punkterna i lövens tillfälliga fil
  const tmpH = await (await dir.getFileHandle("tmp.bin", { create: true })).createSyncAccessHandle();
  let tOff = 0;
  const cap = Math.max(256, Math.min(8192, Math.floor(96e6 / 10 / leaves.length)));
  const lb = leaves.map(nd => ({ box: box(nd), q: null, c: null, n: 0, blocks: [] }));
  const flush = b => {
    if (!b.n) return; const out = new Uint8Array(b.n * 10); out.set(new Uint8Array(b.q.buffer, 0, b.n * 6)); out.set(b.c.subarray(0, b.n * 4), b.n * 6);
    tmpH.write(out, { at: tOff }); b.blocks.push([tOff, b.n]); tOff += out.length; b.n = 0;
  };
  const router = { n: 0, push(x, y, z, r, g, bl, it) {
    const b = lb[leafOf[cellOf(x, y, z)]], bx = b.box, k = 65535 / bx[3];
    if (!b.q) { b.q = new Uint16Array(cap * 3); b.c = new Uint8Array(cap * 4); }
    const o = b.n; let qx = ((x - bx[0]) * k + 0.5) | 0, qy = ((y - bx[1]) * k + 0.5) | 0, qz = ((z - bx[2]) * k + 0.5) | 0;
    b.q[o * 3] = qx < 0 ? 0 : qx > 65535 ? 65535 : qx; b.q[o * 3 + 1] = qy < 0 ? 0 : qy > 65535 ? 65535 : qy; b.q[o * 3 + 2] = qz < 0 ? 0 : qz > 65535 ? 65535 : qz;
    b.c[o * 4] = r; b.c[o * 4 + 1] = g; b.c[o * 4 + 2] = bl; b.c[o * 4 + 3] = it; b.n++; this.n++;
    if (b.n === cap) flush(b);
  } };
  await readLasFile(file, Infinity, f => report(0.28, 0.65, f), router);
  lb.forEach(flush); tmpH.flush();

  // ---- Varv 3: nerifrån och upp
  const outH = await (await dir.getFileHandle("octree.bin", { create: true })).createSyncAccessHandle();
  let oOff = 0, done = 0;
  const readLeaf = nd => {
    const b = lb[nd.li], n = nd.n, x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n), c = new Uint8Array(n * 4); let o = 0;
    const bx = b.box, k = bx[3] / 65535;
    for (const [off, m] of b.blocks) {
      const buf = new Uint8Array(m * 10); tmpH.read(buf, { at: off }); const q = new Uint16Array(buf.buffer, 0, m * 3);
      for (let i = 0; i < m; i++) { x[o + i] = bx[0] + q[i * 3] * k; y[o + i] = bx[1] + q[i * 3 + 1] * k; z[o + i] = bx[2] + q[i * 3 + 2] * k; }
      c.set(buf.subarray(m * 6), o * 4); o += m;
    }
    return { n: o, x: x.subarray(0, o), y: y.subarray(0, o), z: z.subarray(0, o), c: c.subarray(0, o * 4) };
  };
  const pick = (i, salt) => { let v = (Math.imul(i, 0x9e3779b1) ^ Math.imul(salt + 1, 0x85ebca6b)) >>> 0; v ^= v >>> 15; v = Math.imul(v, 0x2c1b3c6d) >>> 0; v ^= v >>> 13; return (v & (OCT.SEL - 1)) === 0; };
  const sub = (s, idx) => ({ n: idx.length, x: Float32Array.from(idx, i => s.x[i]), y: Float32Array.from(idx, i => s.y[i]), z: Float32Array.from(idx, i => s.z[i]), c: (() => { const c = new Uint8Array(idx.length * 4); idx.forEach((i, o) => { c[o * 4] = s.c[i * 4]; c[o * 4 + 1] = s.c[i * 4 + 1]; c[o * 4 + 2] = s.c[i * 4 + 2]; c[o * 4 + 3] = s.c[i * 4 + 3]; }); return c; })() });
  const write = (nd, s) => {
    const bx = box(nd), k = 65535 / bx[3], n = s.n, out = new Uint8Array(n * 10), q = new Uint16Array(out.buffer, 0, n * 3);
    for (let i = 0; i < n; i++) {
      let qx = ((s.x[i] - bx[0]) * k + 0.5) | 0, qy = ((s.y[i] - bx[1]) * k + 0.5) | 0, qz = ((s.z[i] - bx[2]) * k + 0.5) | 0;
      q[i * 3] = qx < 0 ? 0 : qx > 65535 ? 65535 : qx; q[i * 3 + 1] = qy < 0 ? 0 : qy > 65535 ? 65535 : qy; q[i * 3 + 2] = qz < 0 ? 0 : qz > 65535 ? 65535 : qz;
    }
    out.set(s.c.subarray(0, n * 4), n * 6); outH.write(out, { at: oOff }); nd.off = oOff; nd.cnt = n; oOff += out.length; done += n;
    if (n) report(0.65, 1, done / total);
  };
  const up = nd => {   // returnerar nodens kandidatmängd (leaf: alla punkter; inre: urval från barnen)
    if (nd.leaf) return readLeaf(nd);
    const parts = [];
    for (const cid of nd.ch) {
      const c = nodes[cid], s = up(c), keep = [], take = []; for (let i = 0; i < s.n; i++) (pick(i, cid) ? take : keep).push(i);
      write(c, sub(s, keep)); parts.push(sub(s, take));
    }
    const n = parts.reduce((a, p) => a + p.n, 0), r = { n, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n), c: new Uint8Array(n * 4) }; let o = 0;
    parts.forEach(p => { r.x.set(p.x, o); r.y.set(p.y, o); r.z.set(p.z, o); r.c.set(p.c, o * 4); o += p.n; });
    return r;
  };
  write(nodes[0], up(nodes[0])); outH.flush(); outH.close(); tmpH.close();
  try { await dir.removeEntry("tmp.bin"); } catch (e) { /* ok */ }
  const H = { v: 1, key: opt.key, center, min: h.min, max: h.max, org, size: S, total, rgb: hasRgb, format: (h.compressed ? "LAZ" : "LAS") + " 1." + h.minor, nodes: nodes.map(n => [n.l, n.i, n.j, n.k, n.cnt, n.off, n.ch]) };
  const hh = await (await dir.getFileHandle("hierarchy.json", { create: true })).createSyncAccessHandle(); const txt = new TextEncoder().encode(JSON.stringify(H)); hh.write(txt, { at: 0 }); hh.truncate(txt.length); hh.flush(); hh.close();
  return { key: opt.key, total, nodes: nodes.length, bytes: oOff };
}
