/* Punktmoln → mesh (Victor 2026-11-13: "triangulera punktmolnet och skapa en mesh i dxf & ifc – val om jag vill ha tin eller ej och alla olika färger jag har som val på punktmolnet").
   Lager → ⋯ på molnet → "▲ Skapa mesh…". Så görs en mesh av ett punktmoln: punkterna sammanfattas först ruta för ruta (ett moln med miljoner punkter går inte att trianglera rakt av),
   därefter bildas trianglar. Två sätt:
   • TIN: ett hörn per ruta (medelläge) som triangleras med Delaunay – oregelbundna trianglar som följer punkterna.
   • Rutnät (ej TIN): regelbundna rutor med en höjd per ruta, två trianglar per ruta.
   Höjd per ruta: medel, lägst (mark – tar bort fordon/vegetation) eller högst (tak). Trianglar med för långa kanter (hål, kanter) tas bort.
   Färg: samma val som på punktmolnet (skanningens färger, intensitet, höjd, enfärgad, skillnad) – varje triangel får medelfärgen av sina hörn.
   Resultat: DXF (3DFACE med äkta färg, kod 420), IFC (IfcTriangulatedFaceSet + IfcIndexedColourMap) eller ett ritat objekt i modellen. Prefix l3pm. */
const l3pm = { busy: false, res: null };
/* Inkrementell Delaunay (Bowyer–Watson med grannpekare och promenad). X/Y som Float64Array, returnerar trianglar [a,b,c,…] (moturs) utan stödtriangelns hörn. */
function l3pmDelaunay(X, Y) {
  const n = X.length; if (n < 3) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i < n; i++) { if (X[i] < x0) x0 = X[i]; if (X[i] > x1) x1 = X[i]; if (Y[i] < y0) y0 = Y[i]; if (Y[i] > y1) y1 = Y[i]; }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, S = Math.max(x1 - x0, y1 - y0, 1e-9), px = new Float64Array(n + 3), py = new Float64Array(n + 3);
  for (let i = 0; i < n; i++) { px[i] = (X[i] - cx) / S; py[i] = (Y[i] - cy) / S; }
  const B = 60; px[n] = -B; py[n] = -B; px[n + 1] = B; py[n + 1] = -B; px[n + 2] = 0; py[n + 2] = B;
  let tv = [n, n + 1, n + 2], tn = [-1, -1, -1], alive = [1], free = [], last = 0;
  const orient = (a, b, x, y) => (px[b] - px[a]) * (y - py[a]) - (py[b] - py[a]) * (x - px[a]);
  const inC = (t, x, y) => { const a = tv[t * 3], b = tv[t * 3 + 1], c = tv[t * 3 + 2], ax = px[a] - x, ay = py[a] - y, bx = px[b] - x, by = py[b] - y, cx2 = px[c] - x, cy2 = py[c] - y;
    return (ax * ax + ay * ay) * (bx * cy2 - cx2 * by) - (bx * bx + by * by) * (ax * cy2 - cx2 * ay) + (cx2 * cx2 + cy2 * cy2) * (ax * by - bx * ay) > 1e-14; };
  const newTri = (a, b, c) => { let t; if (free.length) { t = free.pop(); tv[t * 3] = a; tv[t * 3 + 1] = b; tv[t * 3 + 2] = c; alive[t] = 1; } else { t = alive.length; alive.push(1); tv.push(a, b, c); tn.push(-1, -1, -1); } tn[t * 3] = tn[t * 3 + 1] = tn[t * 3 + 2] = -1; return t; };
  for (let p = 0; p < n; p++) {
    const x = px[p], y = py[p]; let t = alive[last] ? last : alive.indexOf(1), steps = 0, moved = true;
    while (moved && steps++ < 4000) { moved = false; for (let i = 0; i < 3; i++) { const a = tv[t * 3 + (i + 1) % 3], b = tv[t * 3 + (i + 2) % 3]; if (orient(a, b, x, y) < 0) { const nb = tn[t * 3 + i]; if (nb >= 0) { t = nb; moved = true; break; } } } }
    if (steps >= 4000) { t = -1; for (let q = 0; q < alive.length; q++) if (alive[q] && !(inC(q, x, y) === false)) { t = q; break; } if (t < 0) continue; }
    const cav = [t], inCav = new Set([t]); for (let k = 0; k < cav.length; k++) { const c = cav[k]; for (let i = 0; i < 3; i++) { const nb = tn[c * 3 + i]; if (nb >= 0 && !inCav.has(nb) && inC(nb, x, y)) { inCav.add(nb); cav.push(nb); } } }
    const bd = []; cav.forEach(c => { for (let i = 0; i < 3; i++) { const nb = tn[c * 3 + i]; if (nb < 0 || !inCav.has(nb)) bd.push([tv[c * 3 + (i + 1) % 3], tv[c * 3 + (i + 2) % 3], nb, c]); } });
    cav.forEach(c => { alive[c] = 0; free.push(c); });
    const start = new Map(), made = []; bd.forEach(([a, b, nb, old]) => { const T = newTri(a, b, p); made.push([T, b]); start.set(a, T); tn[T * 3 + 2] = nb; if (nb >= 0) for (let j = 0; j < 3; j++) if (tn[nb * 3 + j] === old) { tn[nb * 3 + j] = T; break; } });
    made.forEach(([T, b]) => { const U = start.get(b); tn[T * 3] = U === undefined ? -1 : U; if (U !== undefined) tn[U * 3 + 1] = T; });
    last = made.length ? made[0][0] : last;
  }
  const out = []; for (let t = 0; t < alive.length; t++) { if (!alive[t]) continue; const a = tv[t * 3], b = tv[t * 3 + 1], c = tv[t * 3 + 2]; if (a >= n || b >= n || c >= n) continue; out.push(a, b, c); }
  return out;
}
/* Steg 1: ruta för ruta. Returnerar { n, V: [[x,y,z]…] (absoluta), C: [[r,g,b]…], nx, ny, cell (index→hörn eller -1), o: {x0,y0,h} } */
async function l3pmGrid(c, o, onP) {
  const ctr = c.info.center, h = o.cell, cb = c.lod && c._sub == null ? { min: c.info.min, max: c.info.max } : l3pcsBounds(c), A = o.area || null;
  const bb = A ? { min: [Math.max(cb.min[0], A.bb[0]), Math.max(cb.min[1], A.bb[1]), cb.min[2]], max: [Math.min(cb.max[0], A.bb[2]), Math.min(cb.max[1], A.bb[3]), cb.max[2]] } : cb;
  if (A && (bb.max[0] <= bb.min[0] || bb.max[1] <= bb.min[1])) throw new Error("Området ligger utanför molnet.");
  if (o.tile) { bb.min = [Math.max(bb.min[0], o.tile[0]), Math.max(bb.min[1], o.tile[1]), bb.min[2]]; bb.max = [Math.min(bb.max[0], o.tile[2]), Math.min(bb.max[1], o.tile[3]), bb.max[2]]; if (bb.max[0] <= bb.min[0] || bb.max[1] <= bb.min[1]) return { V: [], C: [], nx: 0, ny: 0, cell: new Int32Array(0), bb, spikes: 0 }; }
  const nx = Math.max(1, Math.ceil((bb.max[0] - bb.min[0]) / h) + 1), ny = Math.max(1, Math.ceil((bb.max[1] - bb.min[1]) / h) + 1);
  if (nx * ny > 5e6) throw new Error("Rutorna blir för många (" + (nx * ny).toLocaleString("sv-SE") + ") – välj större ruta, eller ett mindre område (zon eller bortklippt lager) för att komma ner till 0,1 m.");
  const N = nx * ny, cnt = new Uint32Array(N), sx = new Float64Array(N), sy = new Float64Array(N), sz = new Float64Array(N), sr = new Float32Array(N), sg = new Float32Array(N), sb = new Float32Array(N), mode = o.zmode;
  const pr = typeof l3Prefs === "function" ? l3Prefs() : null, old = pr ? pr.pcMode : undefined; let t0 = performance.now();
  try {
    if (pr && o.color !== "none") pr.pcMode = o.color;
    for await (const { o: pc, mask, f } of l3pcsPieces(c, [bb.min[0] - h, bb.min[1] - h, -1e9, bb.max[0] + h, bb.max[1] + h, 1e9])) {
      const n = pc.pos.length / 3, P = pc.pos, col = o.color === "none" ? null : l3pcColorsBase(c, pc);
      for (let i = 0; i < n; i++) {
        if (mask && !mask[i]) continue; const x = P[i * 3] + ctr[0], y = P[i * 3 + 1] + ctr[1], z = P[i * 3 + 2] + ctr[2], ix = Math.floor((x - bb.min[0]) / h), iy = Math.floor((y - bb.min[1]) / h); if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) continue; if (A) { if (x < A.bb[0] || x > A.bb[2] || y < A.bb[1] || y > A.bb[3]) continue; let inside = false; for (let q = 0; q < A.polys.length; q++) if (l3pcsIn(A.polys[q], x, y)) { inside = true; break; } if (!inside) continue; }
        const k = iy * nx + ix, first = cnt[k] === 0, r = col ? col[i * 3] : 160, g = col ? col[i * 3 + 1] : 165, b = col ? col[i * 3 + 2] : 175;
        if (mode === "mean" || first) { cnt[k]++; sx[k] += x; sy[k] += y; sz[k] += z; sr[k] += r; sg[k] += g; sb[k] += b; if (mode !== "mean") { sx[k] = x; sy[k] = y; sz[k] = z; sr[k] = r; sg[k] = g; sb[k] = b; } }
        else { cnt[k]++; if (mode === "min" ? z < sz[k] : z > sz[k]) { sx[k] = x; sy[k] = y; sz[k] = z; sr[k] = r; sg[k] = g; sb[k] = b; } }
      }
      if (onP && performance.now() - t0 > 200) { onP("läser punkter", f * 0.7); t0 = performance.now(); await l3pcsYield(); }
    }
  } finally { if (pr) { if (old === undefined) delete pr.pcMode; else pr.pcMode = old; } }
  /* Spikfilter: en ruta vars höjd avviker mer än o.spike meter från medianen av grannrutorna (8 st) tas bort, liksom enstaka rutor som saknar grannar (flygande brus). */
  let spikes = 0;
  if (o.spike > 0) {
    const zc = new Float32Array(N), drop = new Uint8Array(N), nb = [];
    for (let k = 0; k < N; k++) if (cnt[k]) zc[k] = sz[k] / (mode === "mean" ? cnt[k] : 1);
    let filled = 0; for (let k = 0; k < N; k++) if (cnt[k]) filled++;
    const spacing = Math.sqrt(N * h * h / Math.max(1, filled)), R = Math.max(1, Math.min(30, Math.ceil(Math.max(0.75, 2.5 * spacing) / h)));   // grannfönstret följer punkttätheten (minst 0,75 m) så att det fungerar även med mycket små rutor (0,1 m)
    for (let k = 0; k < N; k++) { if (!cnt[k]) continue; const ix = k % nx, iy = (k / nx) | 0; nb.length = 0;
      for (let dy = -R; dy <= R; dy++) { const y = iy + dy; if (y < 0 || y >= ny) continue; for (let dx = -R; dx <= R; dx++) { if (!dx && !dy) continue; const x = ix + dx; if (x < 0 || x >= nx) continue; const q = y * nx + x; if (cnt[q]) nb.push(zc[q]); } }
      if (nb.length < 2) { drop[k] = 1; continue; } nb.sort((a, b) => a - b); const med = nb.length % 2 ? nb[nb.length >> 1] : (nb[nb.length / 2 - 1] + nb[nb.length / 2]) / 2; if (Math.abs(zc[k] - med) > o.spike) drop[k] = 1; }
    for (let k = 0; k < N; k++) if (drop[k]) { cnt[k] = 0; spikes++; }
  }
  const V = [], C = [], cell = new Int32Array(N).fill(-1);
  for (let k = 0; k < N; k++) { if (!cnt[k]) continue; const d = mode === "mean" ? cnt[k] : 1, ix = k % nx, iy = (k / nx) | 0; cell[k] = V.length;
    V.push(o.type === "grid" ? [bb.min[0] + (ix + 0.5) * h, bb.min[1] + (iy + 0.5) * h, sz[k] / d] : [sx[k] / d, sy[k] / d, sz[k] / d]); C.push([sr[k] / d, sg[k] / d, sb[k] / d].map(v => Math.max(0, Math.min(255, Math.round(v))))); }
  return { V, C, nx, ny, cell, bb, spikes };
}
/* Steg 2: trianglar. Returnerar { V, C, F (0-baserade hörnindex), FC (färg per triangel) } */
async function l3pmBuild(c, o, onP) {
  const g = await l3pmGrid(c, o, onP); if (o.tile && g.V.length < 3) return null; if (g.V.length < 3) throw new Error("För få punkter för en mesh – välj mindre ruta eller kontrollera att molnet är inläst.");
  if (o.type !== "grid" && g.V.length > l3pmMaxTin) throw new Error(`TIN av ${g.V.length.toLocaleString("sv-SE")} hörn blir för tungt (max ${l3pmMaxTin.toLocaleString("sv-SE")}) – välj större rutstorlek.`);
  if (o.type === "grid" && g.V.length * 2 > l3pmMaxTri) throw new Error(`Meshen blir för stor (cirka ${(g.V.length * 2).toLocaleString("sv-SE")} trianglar, max ${l3pmMaxTri.toLocaleString("sv-SE")}) – välj större rutstorlek.`);
  let F = [];
  if (o.type === "grid") { const { nx, ny, cell } = g; for (let iy = 0; iy < ny - 1; iy++) for (let ix = 0; ix < nx - 1; ix++) { const a = cell[iy * nx + ix], b = cell[iy * nx + ix + 1], d = cell[(iy + 1) * nx + ix], e = cell[(iy + 1) * nx + ix + 1]; if (a < 0 || b < 0 || d < 0 || e < 0) continue; F.push(a, b, e, a, e, d); } }
  else { if (onP) onP("trianglerar (Delaunay)", 0.75); await l3pcsYield(); F = l3pmDelaunay(Float64Array.from(g.V, v => v[0]), Float64Array.from(g.V, v => v[1])); }
  const maxE = o.maxEdge > 0 ? o.maxEdge * o.maxEdge : Infinity, keep = [], FC = [], V = g.V; let area = 0;
  for (let i = 0; i < F.length; i += 3) {
    const a = V[F[i]], b = V[F[i + 1]], d = V[F[i + 2]], e = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2; if (e(a, b) > maxE || e(b, d) > maxE || e(d, a) > maxE) continue;
    keep.push(F[i], F[i + 1], F[i + 2]); const ca = g.C[F[i]], cb = g.C[F[i + 1]], cc = g.C[F[i + 2]]; FC.push([0, 1, 2].map(k => Math.round((ca[k] + cb[k] + cc[k]) / 3)));
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]; area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  if (!keep.length) throw new Error("Alla trianglar föll bort – öka största kantlängd eller välj större ruta.");
  return { V: g.V, C: g.C, F: keep, FC, area, bb: g.bb, spikes: g.spikes };
}
/* Lägsta höjd utan spridning av miljontals värden (Math.min(...) ger "Maximum call stack size exceeded"). */
function l3pmMinZ(r) { let m = Infinity; for (let i = 0; i < r.V.length; i++) if (r.V[i][2] < m) m = r.V[i][2]; return m; }
const l3pmMaxTri = 1400000, l3pmMaxTin = 350000, L3PM_TILE = 300000, L3PM_MAXTILES = 80;   // en modell = högst ca 300 000 rutor (DXF/IFC-filer på några hundra MB), annars delas meshen i flera modeller
/* Stora meshar delas i flera modeller (rutor som ligger kant i kant, en rutas bredd överlapp så att de möts). Returnerar { tiles: [[x0,y0,x1,y1]…], n (rutor totalt), nx, ny } för området. */
function l3pmTilePlan(c, o) {
  const cb = c.lod && c._sub == null ? { min: c.info.min, max: c.info.max } : l3pcsBounds(c), A = o.area || null;
  const x0 = Math.max(cb.min[0], A ? A.bb[0] : -Infinity), y0 = Math.max(cb.min[1], A ? A.bb[1] : -Infinity), x1 = Math.min(cb.max[0], A ? A.bb[2] : Infinity), y1 = Math.min(cb.max[1], A ? A.bb[3] : Infinity);
  const w = Math.max(0, x1 - x0), hh = Math.max(0, y1 - y0), cells = (w / o.cell + 1) * (hh / o.cell + 1), edge = Math.floor(Math.sqrt(L3PM_TILE)) * o.cell, tx = Math.max(1, Math.ceil(w / edge)), ty = Math.max(1, Math.ceil(hh / edge)), tiles = [];
  for (let j = 0; j < ty; j++) for (let i = 0; i < tx; i++) tiles.push([x0 + i * edge, y0 + j * edge, Math.min(x1, x0 + (i + 1) * edge + o.cell), Math.min(y1, y0 + (j + 1) * edge + o.cell)]);
  return { tiles, n: cells, tx, ty };
}
/* ZIP som skrivs direkt till disk när webbläsaren kan (Chrome/Edge), annars i minnet. */
async function l3pmZipSink(name) {
  if (typeof fflate === "undefined") await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "vendor/three/fflate.min.js"; s.onload = res; s.onerror = () => rej(new Error("Kunde inte läsa in ZIP-biblioteket.")); document.head.appendChild(s); });
  let w = null, wr = Promise.resolve(); const parts = [];
  if (typeof showSaveFilePicker === "function") { try { const fh = await showSaveFilePicker({ suggestedName: name, types: [{ description: "ZIP", accept: { "application/zip": [".zip"] } }] }); w = await fh.createWritable(); } catch (e) { if (e && e.name === "AbortError") throw new Error("Sparandet avbröts."); w = null; } }
  let done, fail; const fin = new Promise((res, rej) => { done = res; fail = rej; });
  const z = new fflate.Zip((err, chunk, final) => { if (err) return fail(err); if (w) wr = wr.then(() => w.write(chunk)); else parts.push(chunk); if (final) done(); });
  return { streaming: !!w, add(fname, bytes) { const e = new fflate.ZipPassThrough(fname); z.add(e); e.push(bytes, true); return wr; },
    async finish() { z.end(); await fin; await wr; if (w) { await w.close(); return null; } return new Blob(parts, { type: "application/zip" }); } };
}
/* Bygger och skriver alla modeller, en i taget (minnet räcker för en modell åt gången). fmts = ["dxf","ifc"]. */
async function l3pmExportTiles(c, o, fmts, base, onP) {
  const plan = l3pmTilePlan(c, o); if (plan.tiles.length > L3PM_MAXTILES) throw new Error(`Det blir ${plan.tiles.length} modeller (max ${L3PM_MAXTILES}) – välj större rutstorlek eller ett mindre område (zon eller bortklippt lager).`);
  const sink = await l3pmZipSink(`${base} – ${plan.tiles.length} modeller.zip`), enc = new TextEncoder(); let made = 0, tri = 0;
  for (let k = 0; k < plan.tiles.length; k++) {
    const r = await l3pmBuild(c, Object.assign({}, o, { tile: plan.tiles[k] }), (t, f) => onP && onP(`modell ${k + 1} av ${plan.tiles.length}: ${t}`, (k + f) / plan.tiles.length)); await l3pcsYield();
    if (!r) continue; const nm = `${base} ${String(k + 1).padStart(2, "0")}`;
    if (fmts.includes("dxf")) await sink.add(nm + ".dxf", enc.encode(l3pmDxf(r, "Mesh")));
    if (fmts.includes("ifc")) await sink.add(nm + ".ifc", enc.encode(l3pmIfc(r, nm, o.color !== "none", o.ifcCols)));
    made++; tri += r.F.length / 3;
  }
  const blob = await sink.finish(); return { made, tri, blob, streaming: sink.streaming, tiles: plan.tiles.length };
}
const l3pmHex = c => "#" + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
function l3pmDxf(r, layer) {
  const out = ["0", "SECTION", "2", "ENTITIES"], num = v => (Math.round(v * 1000) / 1000).toFixed(3);
  for (let i = 0; i < r.F.length; i += 3) { const a = r.V[r.F[i]], b = r.V[r.F[i + 1]], c = r.V[r.F[i + 2]], k = r.FC[i / 3];
    out.push("0", "3DFACE", "8", layer, "420", String(k[0] << 16 | k[1] << 8 | k[2]), "10", num(a[0]), "20", num(a[1]), "30", num(a[2]), "11", num(b[0]), "21", num(b[1]), "31", num(b[2]), "12", num(c[0]), "22", num(c[1]), "32", num(c[2]), "13", num(c[0]), "23", num(c[1]), "33", num(c[2])); }
  out.push("0", "ENDSEC", "0", "EOF"); return out.join("\n");
}
/* Färgpalett för IFC: medianskärning av triangelfärgerna (5 bitar per kanal som underlag) till högst n färger. Returnerar { pal: [[r,g,b]…], idx: Uint16Array (palettindex per triangel) }. */
function l3pmPalette(FC, n) {
  const hist = new Map(); for (let i = 0; i < FC.length; i++) { const c = FC[i], k = (c[0] >> 3 << 10) | (c[1] >> 3 << 5) | (c[2] >> 3); hist.set(k, (hist.get(k) || 0) + 1); }
  const items = [...hist].map(([k, w]) => ({ k, w, c: [(k >> 10 & 31) * 8 + 4, (k >> 5 & 31) * 8 + 4, (k & 31) * 8 + 4] })); let boxes = [items];
  while (boxes.length < n) {
    let bi = -1, bs = 0, bch = 0; boxes.forEach((bx, i) => { if (bx.length < 2) return; for (let ch = 0; ch < 3; ch++) { let lo = 255, hi = 0, w = 0; bx.forEach(it => { lo = Math.min(lo, it.c[ch]); hi = Math.max(hi, it.c[ch]); w += it.w; }); const sc = (hi - lo) * Math.sqrt(w); if (sc > bs) { bs = sc; bi = i; bch = ch; } } });
    if (bi < 0) break; const bx = boxes[bi].slice().sort((p, q) => p.c[bch] - q.c[bch]), tot = bx.reduce((a, it) => a + it.w, 0); let acc = 0, cut = 1; for (let i = 0; i < bx.length - 1; i++) { acc += bx[i].w; cut = i + 1; if (acc >= tot / 2) break; }
    boxes.splice(bi, 1, bx.slice(0, cut), bx.slice(cut));
  }
  const pal = [], map = new Map(); boxes.forEach((bx, i) => { let w = 0, r = 0, g = 0, b = 0; bx.forEach(it => { w += it.w; r += it.c[0] * it.w; g += it.c[1] * it.w; b += it.c[2] * it.w; map.set(it.k, i); }); pal.push([Math.round(r / w), Math.round(g / w), Math.round(b / w)]); });
  const idx = new Uint16Array(FC.length); for (let i = 0; i < FC.length; i++) { const c = FC[i]; idx[i] = map.get((c[0] >> 3 << 10) | (c[1] >> 3 << 5) | (c[2] >> 3)); }
  return { pal, idx };
}
/* IFC: en IfcTriangulatedFaceSet per färg i paletten (alla delar samma punktlista), var och en med egen ytstil. Det visas med färg i Trimble Connect och andra läsare;
   IfcIndexedColourMap (färg per triangel) ignoreras av många läsare, och en grå standardstil över den gjorde att meshen blev grå. */
function l3pmIfc(r, name, colored, ncol) {
  const doc = ifcDoc("4D-planering – " + name, "Mesh från punktmoln"), E = doc.E, org = [Math.floor(r.bb.min[0]), Math.floor(r.bb.min[1]), Math.floor(l3pmMinZ(r))];
  const pl = E(`IFCCARTESIANPOINTLIST3D((${r.V.map(v => ifcPt([v[0] - org[0], v[1] - org[1], v[2] - org[2]])).join(",")}))`), nT = r.F.length / 3, items = [];
  const tri = i => `(${r.F[i * 3] + 1},${r.F[i * 3 + 1] + 1},${r.F[i * 3 + 2] + 1})`;
  if (colored) {
    const { pal, idx } = l3pmPalette(r.FC, Math.max(2, Math.min(512, ncol || 128))), groups = pal.map(() => []); for (let i = 0; i < nT; i++) groups[idx[i]].push(tri(i));
    groups.forEach((g, k) => { if (!g.length) return; const fs = E(`IFCTRIANGULATEDFACESET(${pl},$,.F.,(${g.join(",")}),$)`); E(`IFCSTYLEDITEM(${fs},(${doc.style("mesh" + k, l3pmHex(pal[k]), "Mesh " + (k + 1))}),$)`); items.push(fs); });
  } else { const fs = E(`IFCTRIANGULATEDFACESET(${pl},$,.F.,(${Array.from({ length: nT }, (_, i) => tri(i)).join(",")}),$)`); E(`IFCSTYLEDITEM(${fs},(${doc.style("mesh", "#a3a8b4", "Mesh")}),$)`); items.push(fs); }
  const el = doc.proxy(name, "Mesh från punktmoln", "Punktmolnsmesh", doc.place(org), doc.shape(items.join(","), "Tessellation"), "pcmesh");
  doc.props(el, [["Källa", "Punktmoln"], ["Trianglar", nT], ["Hörn", r.V.length], ["Yta m²", Math.round(r.area * 10) / 10], ["Färger", colored ? items.length : 0]], "Punktmolnsmesh");
  return doc.finish([el], name + ".ifc");
}
function l3pmSave(text, name, type) { const u = URL.createObjectURL(new Blob([text], { type })), a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000); }
function l3pmToModel(r, name) {
  if (typeof modCreate !== "function") throw new Error("Ritverktyget är inte inläst.");
  const org = [Math.floor(r.bb.min[0]), Math.floor(r.bb.min[1]), Math.floor(l3pmMinZ(r))], q = v => Math.round(v * 1000) / 1000;
  const avg = [0, 1, 2].map(k => r.FC.reduce((a, c) => a + c[k], 0) / r.FC.length);
  const m = { k: "mesh", pts: r.V.map(v => [q(v[0] - org[0]), q(v[1] - org[1]), q(v[2] - org[2])]), faces: Array.from({ length: r.F.length / 3 }, (_, i) => [r.F[i * 3] + 1, r.F[i * 3 + 1] + 1, r.F[i * 3 + 2] + 1]), closed: false };
  const p = modCreate(m, org, { name, color: l3pmHex(avg) }); if (typeof l3Changed === "function") l3Changed(); return p;
}
/* Förhandsvisning i 3D-editorn: meshen med trianglarnas färger (och valfritt nätet) ovanpå molnet; tas bort när dialogen stängs. Ingen plockning/markering av den. */
const l3pmPrev = { grp: null, cloud: null, hid: false };
function l3pmPreviewClear() { if (l3pmPrev.grp) { l3.scene.remove(l3pmPrev.grp); l3pmPrev.grp.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); l3pmPrev.grp = null; } }
function l3pmCloudHide(hide) { const c = l3pc.clouds.find(x => x.id === l3pmPrev.cloud); if (c && c.group) c.group.visible = !hide; l3pmPrev.hid = !!hide; if (typeof l3Render === "function") l3Render(); }
function l3pmPreview(r, wire) {
  l3pmPreviewClear(); const O = l3.O, nT = r.F.length / 3, pos = new Float32Array(nT * 9), col = new Float32Array(nT * 9);
  for (let t = 0; t < nT; t++) { const k = r.FC[t]; for (let j = 0; j < 3; j++) { const v = r.V[r.F[t * 3 + j]], o = t * 9 + j * 3; pos[o] = v[0] - O[0]; pos[o + 1] = v[1] - O[1]; pos[o + 2] = v[2] - O[2] + 0.02; col[o] = k[0] / 255; col[o + 1] = k[1] / 255; col[o + 2] = k[2] / 255; } }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })), grp = new THREE.Group(); grp.name = "pcMeshPreview"; m.raycast = () => {}; m.frustumCulled = false; grp.add(m);
  if (wire) { const w = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x0f172a, wireframe: true, transparent: true, opacity: 0.35 })); w.raycast = () => {}; w.frustumCulled = false; grp.add(w); }
  l3pmPrev.grp = grp; l3.scene.add(grp); l3Render();
}
function l3pmDialog(id) {
  const c = l3pcGet(id); if (!c || l3pm.busy) return; l3pm.res = null;
  const bb = c.lod && c._sub == null ? { min: c.info.min, max: c.info.max } : l3pcsBounds(c), w = bb.max[0] - bb.min[0], h = bb.max[1] - bb.min[1], cell0 = Math.max(0.1, Math.round(Math.sqrt(w * h / 100000) * 20) / 20);   // ≈ 100 000 rutor som start
  const zones = typeof l3pcsGroups === "function" ? l3pcsGroups("zone") : [], modes = [["auto", "Automatiskt"], ["rgb", "Skanningens färger"], ["int", "Intensitet (grå)"], ["z", "Höjd – färgskala"], ["solid", "Enfärgad (molnets färg)"], ["diff", "Skillnad (differentialanalys)"], ["none", "Ingen färg (grå mesh)"]], cur = typeof l3pcMode === "function" ? l3pcMode() : "auto";
  const ov = document.createElement("div"); ov.id = "l3pmDlg"; ov.style.cssText = "position:fixed;inset:0;z-index:9500;pointer-events:none;display:flex;align-items:flex-start;justify-content:flex-end;padding:80px 16px 16px";l3pmPrev.cloud = String(id).split("|")[0]; l3pmPreviewClear();
  const row = (l, ctl) => `<label style="display:flex;gap:8px;align-items:center;justify-content:space-between"><span>${l}</span>${ctl}</label>`;
  ov.innerHTML = `<div style="pointer-events:auto;max-height:calc(100vh - 100px);overflow:auto;background:#fff;color:#0f172a;border-radius:14px;max-width:400px;width:100%;padding:16px 18px;box-shadow:0 20px 60px rgba(0,0,0,.4);font:13px system-ui,sans-serif;display:flex;flex-direction:column;gap:9px">
    <b style="font-size:16px">Skapa mesh av punktmolnet</b><div style="color:#475569">${escHtml(c.name)} · ${w.toFixed(0)} × ${h.toFixed(0)} m</div>
    ${row("Område", `<select id="pmArea"><option value="">Hela molnet</option>${zones.map((z, i) => `<option value="${i}">${escHtml(z.name)}</option>`).join("")}</select>`)}
    ${row("Typ", `<select id="pmType"><option value="tin">TIN (triangulerat nät, Delaunay)</option><option value="grid">Rutnät (regelbundna rutor, ej TIN)</option></select>`)}
    ${row("Rutstorlek (m)", `<span><input type="number" id="pmCell" min="0.1" step="0.05" value="${cell0}" style="width:80px"> <span id="pmEst" style="color:#64748b"></span></span>`)}
    ${row("Höjd per ruta", `<select id="pmZ"><option value="mean">Medel</option><option value="min">Lägst (mark)</option><option value="max">Högst (tak)</option></select>`)}
    ${row("Största kantlängd (m, 0 = ingen)", `<input type="number" id="pmEdge" min="0" step="0.5" value="${Math.round(cell0 * 3 * 10) / 10}" style="width:80px">`)}
    ${row("Ta bort spikar (m, 0 = av)", `<input type="number" id="pmSpike" min="0" step="0.1" value="1" title="Rutor vars höjd avviker mer än så från grannrutorna tas bort (punkter som sticker iväg, flygande brus)" style="width:80px">`)}
    ${row("Färger i IFC", `<select id="pmIfcCols" title="IFC får en färgad yta per färg i paletten (mer färger = mer exakt men tyngre fil)"><option value="32">32</option><option value="64">64</option><option value="128" selected>128</option><option value="256">256</option><option value="512">512</option></select>`)}
    ${row("Färg", `<select id="pmCol">${modes.map(([k, l]) => `<option value="${k}" ${cur === k ? "selected" : ""}>${l}</option>`).join("")}</select>`)}
    <div style="color:#64748b;font-size:12px">Punkterna sammanfattas per ruta innan trianglarna bildas (miljoner punkter går inte att trianglera rakt av) – minska rutstorleken för mer detalj, ner till 0,1 m. För så fin ruta: välj en zon under Område (eller ett bortklippt lager) så att meshen blir hanterbar. Förhandsvisningen i 3D uppdateras direkt när du ändrar något. Varje triangel får medelfärgen av sina hörn. Spikfilter tar bort rutor som sticker iväg från grannarna så att inga taggar uppstår.</div>
    <div id="pmOut" style="color:#334155"></div>
    <div style="display:flex;gap:14px;flex-wrap:wrap"><label><input type="checkbox" id="pmHide"> Dölj punktmolnet</label><label><input type="checkbox" id="pmWire"> Visa nät</label></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button type="button" id="pmX">Stäng</button><button type="button" id="pmGo" style="background:#2563eb;color:#fff;border:0;border-radius:8px;padding:6px 14px">Uppdatera</button>
    <button type="button" id="pmDxf" disabled>⤓ DXF</button><button type="button" id="pmIfc" disabled>⤓ IFC</button><button type="button" id="pmMod" disabled>＋ Lägg i modellen</button></div></div>`;
  document.body.appendChild(ov); const q = s => ov.querySelector(s), out = q("#pmOut");
  const areaSel = () => { const i = q("#pmArea").value; return i === "" ? null : zones[Number(i)]; }, areaWH = () => { const a = areaSel(); if (!a) return [w, h]; return [Math.max(0, Math.min(bb.max[0], a.bb[2]) - Math.max(bb.min[0], a.bb[0])), Math.max(0, Math.min(bb.max[1], a.bb[3]) - Math.max(bb.min[1], a.bb[1]))]; };
  const tiledInfo = () => { const v = Number(q("#pmCell").value), [aw, ah] = areaWH(), n = v > 0 ? Math.round((aw / v + 1) * (ah / v + 1)) : 0, tiled = n > (q("#pmType").value === "grid" ? L3PM_TILE * 2 : L3PM_TILE * 1.1); return { v, n, tiled, tiles: tiled ? Math.ceil(n / L3PM_TILE * 1.08) : 1 }; };
  const est = () => { const t = tiledInfo(), bad = t.tiles > L3PM_MAXTILES; q("#pmEst").textContent = t.n ? `≈ ${t.n.toLocaleString("sv-SE")} rutor${t.tiled ? ` → cirka ${t.tiles} modeller${bad ? " – för många, välj större ruta eller mindre område" : ""}` : ""}` : ""; q("#pmEst").style.color = bad ? "#b91c1c" : "#64748b"; };
  q("#pmArea").addEventListener("change", est); q("#pmType").addEventListener("change", est); let edgeTouched = false; q("#pmEdge").oninput = () => { edgeTouched = true; };
  q("#pmCell").oninput = () => { est(); const v = Number(q("#pmCell").value); if (!edgeTouched && v > 0) q("#pmEdge").value = Math.round(v * 3 * 10) / 10; }; est();
  const closeAll = () => { clearTimeout(timer);  l3pmPreviewClear(); l3pmCloudHide(false); ov.remove(); l3Render(); }; q("#pmX").onclick = () => { if (!l3pm.busy) closeAll(); };
  q("#pmHide").onchange = () => l3pmCloudHide(q("#pmHide").checked); q("#pmWire").onchange = () => { if (l3pm.res) l3pmPreview(l3pm.res, q("#pmWire").checked); };
  const base = () => `${l3pcsFile(String(c.name).replace(/\.[^.]+$/, ""))} – mesh`;
  /* Live: varje ändring av valen bygger om förhandsvisningen (väntar in att man slutat ändra, och en pågående körning avslutas först). */
  let timer = 0, again = false; const sched = ms => { clearTimeout(timer); timer = setTimeout(() => { if (l3pm.busy) { again = true; return; } q("#pmGo").onclick(); }, ms); };
  q("#pmGo").onclick = async () => {
    if (l3pm.busy) return; l3pm.busy = true; q("#pmGo").disabled = true; ["#pmDxf", "#pmIfc", "#pmMod"].forEach(s => { q(s).disabled = true; });
    try {
      const o = { type: q("#pmType").value, cell: Math.max(0.1, Number(q("#pmCell").value) || cell0), zmode: q("#pmZ").value, maxEdge: Math.max(0, Number(q("#pmEdge").value) || 0), color: q("#pmCol").value, spike: Math.max(0, Number(q("#pmSpike").value) || 0), area: areaSel(), ifcCols: Number(q("#pmIfcCols").value) || 128 };
      const ti = tiledInfo(); let oo = o;
      if (ti.tiled) { const [aw, ah] = areaWH(); oo = Object.assign({}, o, { cell: Math.max(o.cell, Math.round(Math.sqrt(aw * ah / 250000) * 20) / 20) }); }   // förhandsvisningen är grövre när meshen delas i flera modeller
      const r = await l3pmBuild(c, oo, (t, f) => { out.textContent = `${t} ${Math.round(f * 100)} %`; }); r.opts = oo; if (ti.tiled) r.tiled = { opts: o, tiles: ti.tiles, previewCell: oo.cell }; l3pm.res = r; l3pmPreview(r, q("#pmWire").checked); if (typeof l3Zoom === "function") { /* behåll vyn */ }
      out.innerHTML = `${r.tiled ? `<b>Stor mesh – delas i cirka ${r.tiled.tiles} modeller</b> (${o.cell} m ruta). Förhandsvisningen är grövre (${r.tiled.previewCell} m). DXF/IFC-knapparna skriver alla modeller i en ZIP.<br>` : ""}<b>${(r.F.length / 3).toLocaleString("sv-SE")} trianglar</b>, ${r.V.length.toLocaleString("sv-SE")} hörn, ${Math.round(r.area).toLocaleString("sv-SE")} m² yta${r.tiled ? " (förhandsvisning)" : ""}.${r.spikes ? ` ${r.spikes.toLocaleString("sv-SE")} spikar/brus-rutor togs bort.` : ""}`; ["#pmDxf", "#pmIfc", "#pmMod"].forEach(s => { q(s).disabled = false; });
    } catch (e) { out.textContent = "⚠ " + e.message; }
    l3pm.busy = false; q("#pmGo").disabled = false; if (again && ov.isConnected) { again = false; sched(50); }
  };
  ["#pmArea", "#pmType", "#pmCell", "#pmZ", "#pmEdge", "#pmSpike", "#pmCol"].forEach(id => { const el = q(id); el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => sched(el.tagName === "SELECT" ? 150 : 600)); });
  setTimeout(() => { if (ov.isConnected) sched(0); }, 50);
  const tiledGo = async fmt => {
    const r = l3pm.res; if (!r || !r.tiled || l3pm.busy) return; l3pm.busy = true; ["#pmGo", "#pmDxf", "#pmIfc", "#pmMod"].forEach(s => { q(s).disabled = true; });
    try { const x = await l3pmExportTiles(c, r.tiled.opts, [fmt], base(), (t, f) => { out.textContent = `${t} ${Math.round(f * 100)} %`; });
      if (x.blob) { const u = URL.createObjectURL(x.blob), a = document.createElement("a"); a.href = u; a.download = `${base()} – ${x.tiles} modeller.zip`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 8000); }
      out.innerHTML = `<b>${x.made} modeller</b> (${x.tri.toLocaleString("sv-SE")} trianglar) i en ZIP ${x.streaming ? "(sparad direkt till disk)" : "(hämtad)"}.`;
    } catch (e) { out.textContent = "⚠ " + e.message; }
    l3pm.busy = false; ["#pmGo", "#pmDxf", "#pmIfc"].forEach(s => { q(s).disabled = false; });
  };
  q("#pmDxf").onclick = () => { const r = l3pm.res; if (!r) return; if (r.tiled) return tiledGo("dxf"); l3pmSave(l3pmDxf(r, "Mesh"), base() + ".dxf", "application/dxf"); out.textContent = "DXF hämtad: " + base() + ".dxf"; };
  q("#pmIfc").onclick = () => { const r = l3pm.res; if (!r) return; if (r.tiled) return tiledGo("ifc"); l3pmSave(l3pmIfc(r, base(), r.opts.color !== "none", r.opts.ifcCols), base() + ".ifc", "application/x-step"); out.textContent = "IFC hämtad: " + base() + ".ifc"; };
  q("#pmMod").onclick = () => { const r = l3pm.res; if (r && r.tiled) { out.textContent = "Meshen är för stor för att läggas i modellen som ett objekt – exportera den som DXF eller IFC (flera modeller) eller välj en zon."; return; } if (r) try { l3pmToModel(r, base()); l3pmPreviewClear(); l3pmCloudHide(false); q("#pmHide").checked = false; out.textContent = "Meshen ligger nu i modellen som ett ritat objekt (förhandsvisningen är borttagen) (en medelfärg – färg per triangel finns i DXF och IFC)."; } catch (e) { out.textContent = "⚠ " + e.message; } };
}
