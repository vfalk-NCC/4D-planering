/* 3D-vyn – Volym mot yta (Victor 2026-10-30: "jobba om volymverktyget helt … under Mät … mäta volymer mot både modeller, punktmoln och ytor
   jag klickar ut … visualiseras snyggt och tydligt … exportera ytorna med volymtext till IFC").

   Så här fungerar det:
   1. Mät → Volym: tryck ut området (hörnen i tur och ordning, fäster som övriga mått). Enter eller första punkten avslutar.
   2. Panelen: välj "Yta som mäts" och "Mot" – punktmoln, 3D-modell (IFC, ovan- eller undersida), 3D-ritning (DXF), ett plan genom hörnen,
      en vågrät nivå eller en egen yta som du klickar ut (hörnens höjder). Resultatet räknas direkt.
   3. Schakt (där ytan ligger lägre än "Mot") och fyllning (högre) ritas som genomskinliga kroppar i modellen – blått respektive rött, mörkare
      där det är djupare/högre – med volymen vid varje del. Området är omringat.
   4. Spara mått: ligger kvar i listan Mått (sparas i projektet) och går att ändra. Exportera IFC: ytan, schakt- och fyllningskropparna som
      egna objekt med volymerna som egenskaper, och – om du vill – en skylt med volymtexten. Utan Trimble Connect hämtas filen i stället.

   Räknesättet: en höjdkarta (rutnät) per yta; volym = Σ (höjdskillnad × rutans yta), rutor vid kanten viktas med hur stor del som ligger
   inne i området. Kropparna byggs av samma rutnät (med höjder i hörnen), så det som ritas och exporteras är det som räknats. */

const l3vol = { cur: null, geoms: new WeakMap(), cache: new Map(), capture: null, pending: new Set(), failed: new WeakSet(), seq: 0, timer: 0, kbd: null };
const L3VOL_RAMP = { cut: ["#bfdbfe", "#60a5fa", "#2563eb", "#1e3a8a"], fill: ["#fecaca", "#f87171", "#dc2626", "#7f1d1d"] };
const L3VOL_COL = { cut: "#2563eb", fill: "#dc2626" };
const l3volM3 = v => Math.round(v).toLocaleString("sv-SE").replace(/[\u00a0\u202f]/g, " ") + " m³";
const l3volSg = (v, s) => { const r = Math.round(v); return (r < 0 ? "−" : r > 0 ? s : "") + l3volM3(Math.abs(r)); };
const l3volTick = () => new Promise(r => setTimeout(r, 16));
const l3volOk = z => z === z && Math.abs(z) < 1e9;

/* ---- Geometri i plan ---- */
function l3volArea(P) { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; }
function l3volInside(P, x, y) { let r = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) r = !r; } return r; }
function l3volBox(P) { const xs = P.map(p => p[0]), ys = P.map(p => p[1]); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; }
/* Planet z = c + a·(x−cx) + b·(y−cy) som passar bäst genom hörnen (minsta kvadrat). */
function l3volPlane(P) {
  const n = P.length, cx = P.reduce((s, p) => s + p[0], 0) / n, cy = P.reduce((s, p) => s + p[1], 0) / n, cz = P.reduce((s, p) => s + p[2], 0) / n;
  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0; P.forEach(p => { const x = p[0] - cx, y = p[1] - cy, z = p[2] - cz; sxx += x * x; sxy += x * y; syy += y * y; sxz += x * z; syz += y * z; });
  const d = sxx * syy - sxy * sxy; if (n < 3 || Math.abs(d) < 1e-9) return { a: 0, b: 0, cx, cy, c: cz };
  return { a: (sxz * syy - syz * sxy) / d, b: (syz * sxx - sxz * sxy) / d, cx, cy, c: cz };
}
/* Andelen av varje ruta som ligger inne i området (2 × 2 delprov) – kanten räknas därför med rätt vikt. */
function l3volFrac(P, g) {
  const f = new Float32Array(g.nx * g.ny), bd = l3volBox(P), q = [0.25, 0.75];
  for (let iy = 0; iy < g.ny; iy++) { const y0 = g.y0 + iy * g.cell; if (y0 > bd.y1 || y0 + g.cell < bd.y0) continue;
    for (let ix = 0; ix < g.nx; ix++) { const x0 = g.x0 + ix * g.cell; if (x0 > bd.x1 || x0 + g.cell < bd.x0) continue;
      let n = 0; for (const a of q) for (const b of q) if (l3volInside(P, x0 + a * g.cell, y0 + b * g.cell)) n++; f[iy * g.nx + ix] = n / 4; } }
  return f;
}

/* ---- Källor ---- */
function l3volSources(cur) {
  const out = (typeof l3dfSources === "function" ? l3dfSources() : []).map(s => ({ k: s.k, label: s.label, sided: /^(md|cad):/.test(s.k) }));
  out.push({ k: "plane", label: "Plan genom hörnen" }, { k: "level", label: "Vågrät nivå" });
  if (cur && cur.surf && cur.surf.length >= 3) out.push({ k: "surf", label: `Yta jag klickat ut (${cur.surf.length} hörn)` });
  return out;
}
function l3volDefaults(cur) {
  const clouds = l3pc.clouds.filter(c => c.visible && c.chunks && c.chunks.length), models = (typeof l3b !== "undefined" ? l3b.models : []).filter(m => m.visible && m.meshes && m.meshes.length);
  let a = "plane", b = "plane";
  if (clouds.length) { a = "pc:" + clouds[0].id; b = clouds[1] ? "pc:" + clouds[1].id : models.length ? "md:" + models[0].id : "plane"; }
  else if (models.length) { a = "md:" + models[0].id; b = "plane"; }
  return { a: { k: a, side: "top" }, b: { k: b, side: "top", z: null }, cell: 0 };
}
const l3volLabel = (cur, s) => { const o = l3volSources(cur).find(x => x.k === s.k); return o ? o.label + (o.sided ? (s.side === "bottom" ? " (undersida)" : " (ovansida)") : s.k === "level" ? ` ${Number.isFinite(s.z) ? l3Fmt(s.z, 2) : "(hörnens medel)"} m` : "") : s.k; };

/* ---- Höjdkartor ---- */
/* Punkter per m² i de punktmoln som ingår (uppskattat över molnets yta) – rutorna ska vara så stora att de får punkter. */
function l3volDensity(cur) {
  let best = 0;
  [cur.spec.a, cur.spec.b].forEach(sp => { const c = sp && sp.k.startsWith("pc:") ? l3pc.clouds.find(x => "pc:" + x.id === sp.k) : null; if (!c || !c.info) return;
    const w = Math.max(1, c.info.max[0] - c.info.min[0]), h = Math.max(1, c.info.max[1] - c.info.min[1]), n = c.nTot / Math.max(1, Math.floor(c.nTot / 8e6)); best = Math.max(best, 0) || 0; const d = n / (w * h); best = best ? Math.min(best, d) : d; });
  return best;
}
function l3volCellFor(bd, area, userCell, density) {
  const auto = Math.min(5, Math.max(0.1, Math.sqrt(area / 30000))), nice = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5].find(v => v >= auto) || 5;
  const floor = Math.sqrt(area / 160000);   // aldrig mer än ca 160 000 rutor (320 000 trianglar) i området
  const sparse = density > 0 ? [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10].find(v => v >= 2 / Math.sqrt(density)) || 10 : 0;   // minst ca fyra punkter per ruta
  return Math.max(userCell > 0 ? userCell : Math.max(nice, sparse), floor, 0.05);
}
async function l3volHeights(cur, src, bd, cell) {
  const dz = src.k.startsWith("pc:") ? (l3pc.clouds.find(c => "pc:" + c.id === src.k) || {}).dz || 0 : 0;
  const key = [src.k, src.side || "", src.z == null ? "" : src.z, src.k === "plane" ? JSON.stringify(cur.pts) : "", src.k === "surf" ? JSON.stringify(cur.surf) : "", bd.x0.toFixed(2), bd.y0.toFixed(2), bd.x1.toFixed(2), bd.y1.toFixed(2), cell, dz].join("|");
  if (l3vol.cache.has(key)) return l3vol.cache.get(key);
  const g = l3dfGrid(bd, cell);
  if (src.k === "plane") { const pl = l3volPlane(cur.pts); for (let iy = 0; iy < g.ny; iy++) for (let ix = 0; ix < g.nx; ix++) g.z[iy * g.nx + ix] = pl.c + pl.a * (g.x0 + (ix + 0.5) * g.cell - pl.cx) + pl.b * (g.y0 + (iy + 0.5) * g.cell - pl.cy); }
  else if (src.k === "level") { const z = Number.isFinite(src.z) ? src.z : cur.pts.reduce((s, p) => s + p[2], 0) / cur.pts.length; g.z.fill(z); }
  else if (src.k === "surf") {
    const S = cur.surf, tris = THREE.ShapeUtils.triangulateShape(S.map(p => new THREE.Vector2(p[0], p[1])), []);
    tris.forEach(t => l3dfTri(g, S[t[0]], S[t[1]], S[t[2]]));
  } else { g.lowest = src.side === "bottom"; if (!l3dfBuild(src.k, g)) return null; }
  await l3volTick();
  l3vol.cache.set(key, g); if (l3vol.cache.size > 8) l3vol.cache.delete(l3vol.cache.keys().next().value);
  return g;
}

/* ---- Räkna och bygg kropparna ---- */
function l3volRamp(kind, t) {
  const R = L3VOL_RAMP[kind], x = Math.max(0, Math.min(1, t)) * (R.length - 1), i = Math.min(R.length - 2, Math.floor(x)), c = new THREE.Color(R[i]).lerp(new THREE.Color(R[i + 1]), x - i);
  return [c.r, c.g, c.b];
}
/* Ytan byggs som trianglar: rutnätets hörn får höjder (medel av grannrutorna), varje ruta delas i två trianglar, trianglar vid områdets kant
   klipps exakt mot polygonen (polygon-clipping) och trianglar som korsar nollnivån delas där ytorna skär varandra. Volymen är summan av
   prismorna (yta × medeltjocklek) – exakt för de trianglar som ritas, inte en trappa av rutor. */
const L3VOL_STEPS = [0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 5];
/* Triangel (x,y,a,b ×3) delad där d = a−b byter tecken: delarna med tecknet sg (+1 fyllning, −1 schakt) som trianglar [x,y,a,b ×3]. */
function l3volSplit(v, sg) {
  let poly = v.map(p => ({ x: p[0], y: p[1], a: p[2], b: p[3], d: sg * (p[2] - p[3]) })), out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    if (p.d >= 0) out.push(p);
    if ((p.d > 0 && q.d < 0) || (p.d < 0 && q.d > 0)) { const t = p.d / (p.d - q.d); out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t, a: p.a + (q.a - p.a) * t, b: p.b + (q.b - p.b) * t, d: 0 }); }
  }
  const res = []; for (let i = 1; i + 1 < out.length; i++) res.push([out[0], out[i], out[i + 1]].map(p => [p.x, p.y, p.a, p.b]));
  return res;
}
/* Triangellistan (x,y,hi,lo ×3 per triangel) → nät med ovan- och undersida, väggar där kroppen tar slut, färg efter tjocklek och trianglarnas kanter. */
function l3volMesh(tris, kind, org, tmax) {
  if (!tris.length) return null;
  const map = new Map(), pos = [], col = [], idx = [], wire = [], edges = new Map();
  const paint = (hi, lo) => l3volRamp(kind, (hi - lo) / tmax);
  const vert = (x, y, hi, lo) => {
    const k = Math.round(x * 1000) + "," + Math.round(y * 1000); let e = map.get(k);
    if (!e) { const c = paint(hi, lo); pos.push(x - org[0], y - org[1], hi - org[2]); col.push(c[0], c[1], c[2]); const t = pos.length / 3 - 1; pos.push(x - org[0], y - org[1], lo - org[2]); col.push(c[0], c[1], c[2]); e = [t, t + 1, x, y, hi, lo]; map.set(k, e); }
    return e;
  };
  tris.forEach(t => {
    const v = [vert(t[0], t[1], t[2], t[3]), vert(t[4], t[5], t[6], t[7]), vert(t[8], t[9], t[10], t[11])];
    idx.push(v[0][0], v[1][0], v[2][0], v[0][1], v[2][1], v[1][1]);
    for (let i = 0; i < 3; i++) {
      const p = v[i], q = v[(i + 1) % 3], k = p[0] < q[0] ? p[0] + "_" + q[0] : q[0] + "_" + p[0], e = edges.get(k);
      if (e) e.n++; else { edges.set(k, { n: 1, p, q }); wire.push(p[2] - org[0], p[3] - org[1], p[4] - org[2], q[2] - org[0], q[3] - org[1], q[4] - org[2]); }
    }
  });
  edges.forEach(e => { // yttre kanter → vägg (egna hörn så att ljuset blir skarpt)
    if (e.n !== 1) return; const { p, q } = e; if (p[4] - p[5] < 1e-4 && q[4] - q[5] < 1e-4) return;
    const c = pos.length / 3, add = (r, hi) => { const cc = paint(r[4], r[5]); pos.push(r[2] - org[0], r[3] - org[1], (hi ? r[4] : r[5]) - org[2]); col.push(cc[0], cc[1], cc[2]); };
    add(p, true); add(q, true); add(q, false); add(p, false);
    // Kanten p→q går i trianglarnas varv (moturs sedd uppifrån) → utsidan är till höger.
    idx.push(c + 3, c + 2, c + 1, c + 3, c + 1, c);
  });
  return { pos: new Float32Array(pos), col: new Float32Array(col), idx: new Uint32Array(idx), wire: new Float32Array(wire), tris: tris.length, cells: tris.length };
}
/* Hela uträkningen för det som står i panelen / det sparade måttet. */
async function l3volCompute(cur, alive) {
  const P = cur.pts, bd = l3volBox(P), area = l3volArea(P), cell0 = l3volCellFor(bd, area, cur.spec.cell, l3volDensity(cur)), g0 = l3dfGrid(bd, cell0), cell = g0.cell;
  const gA = await l3volHeights(cur, cur.spec.a, bd, cell); if (!alive()) return null;
  const gB = await l3volHeights(cur, cur.spec.b, bd, cell); if (!alive()) return null;
  if (!gA || !gB) return { err: "Kunde inte läsa ytan – är punktmolnet eller modellen tänd och inläst?" };
  const nx = gA.nx, ny = gA.ny, W = nx + 1, NN = W * (ny + 1), eps = 0.002, ca = cell * cell;
  const sA = new Float64Array(NN), sB = new Float64Array(NN), cnt = new Uint8Array(NN), ok = new Uint8Array(nx * ny);
  let aMiss = 0, mn = Infinity, mx = -Infinity;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = j * nx + i, a = gA.z[c], b = gB.z[c]; if (!l3volOk(a) || !l3volOk(b)) continue; ok[c] = 1;
    [j * W + i, j * W + i + 1, (j + 1) * W + i, (j + 1) * W + i + 1].forEach(k => { sA[k] += a; sB[k] += b; cnt[k]++; });
  }
  const nA = new Float32Array(NN).fill(NaN), nB = new Float32Array(NN).fill(NaN);
  for (let k = 0; k < NN; k++) if (cnt[k]) { nA[k] = sA[k] / cnt[k]; nB[k] = sB[k] / cnt[k]; if (Math.abs(nA[k] - nB[k]) < eps) nB[k] = nA[k]; }
  await l3volTick(); if (!alive()) return null;
  // Rutor som polygonens kanter går genom klipps; övriga är hela eller utanför.
  const edgeCell = new Uint8Array(nx * ny), mark = (x, y) => { const i = Math.floor((x - gA.x0) / cell), j = Math.floor((y - gA.y0) / cell); if (i >= 0 && j >= 0 && i < nx && j < ny) edgeCell[j * nx + i] = 1; };
  for (let e = 0; e < P.length; e++) { const p = P[e], q = P[(e + 1) % P.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.max(1, Math.ceil(L / (cell / 4))); for (let s = 0; s <= n; s++) mark(p[0] + (q[0] - p[0]) * s / n, p[1] + (q[1] - p[1]) * s / n); }
  const inN = new Int8Array(NN).fill(-1), inside = (i, j) => { const k = j * W + i; if (inN[k] < 0) inN[k] = l3volInside(P, gA.x0 + i * cell, gA.y0 + j * cell) ? 1 : 0; return inN[k]; };
  const clipPoly = [[...P.map(p => [p[0], p[1]]), [P[0][0], P[0][1]]]], hasClip = typeof polygonClipping !== "undefined";
  const lists = { cut: [], fill: [] }, tot = { cut: 0, fill: 0 }, cen = { cut: [0, 0, 0, 0], fill: [0, 0, 0, 0] };
  let aIn = 0, tmax = 0.05;
  const area2 = v => ((v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[2][0] - v[0][0]) * (v[1][1] - v[0][1])) / 2;
  const emit = v => { // v: [x,y,a,b]×3, moturs
    aIn += Math.abs(area2(v));
    for (const sg of [1, -1]) for (const t of l3volSplit(v, sg)) {
      const ar = area2(t); if (ar < 1e-9) continue; const dm = t.reduce((s, p) => s + Math.abs(p[2] - p[3]), 0) / 3, vol = ar * dm, kd = sg > 0 ? "fill" : "cut";
      tot[kd] += vol; const c = cen[kd]; c[0] += vol; c[1] += vol * (t[0][0] + t[1][0] + t[2][0]) / 3; c[2] += vol * (t[0][1] + t[1][1] + t[2][1]) / 3; c[3] += vol * (sg > 0 ? t[0][2] + t[1][2] + t[2][2] : t[0][3] + t[1][3] + t[2][3]) / 3;
      mn = Math.min(mn, ...t.map(p => p[2] - p[3])); mx = Math.max(mx, ...t.map(p => p[2] - p[3]));
      const row = []; t.forEach(p => { row.push(p[0], p[1], Math.max(p[2], p[3]), Math.min(p[2], p[3])); tmax = Math.max(tmax, Math.abs(p[2] - p[3])); }); lists[kd].push(row);
    }
  };
  const tri3 = (i, j, tp) => tp.map(([di, dj]) => { const k = (j + dj) * W + i + di; return [gA.x0 + (i + di) * cell, gA.y0 + (j + dj) * cell, nA[k], nB[k]]; });
  let work = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i; if (!ok[c]) { if (edgeCell[c] || (inside(i, j) && inside(i + 1, j + 1))) { const x = gA.x0 + (i + .5) * cell, y = gA.y0 + (j + .5) * cell; if (l3volInside(P, x, y)) aMiss += ca; } continue; }
      const cin = inside(i, j) + inside(i + 1, j) + inside(i, j + 1) + inside(i + 1, j + 1);
      if (!edgeCell[c] && cin === 0) continue;
      const parts = [tri3(i, j, [[0, 0], [1, 0], [1, 1]]), tri3(i, j, [[0, 0], [1, 1], [0, 1]])];
      if (!edgeCell[c] && cin === 4) { parts.forEach(emit); continue; }
      parts.forEach(v => {
        if (!hasClip) { if (l3volInside(P, (v[0][0] + v[1][0] + v[2][0]) / 3, (v[0][1] + v[1][1] + v[2][1]) / 3)) emit(v); return; }
        const sub = (x, y) => { // värdena i (x,y) ur triangelns plan
          const d = (v[1][1] - v[2][1]) * (v[0][0] - v[2][0]) + (v[2][0] - v[1][0]) * (v[0][1] - v[2][1]), l1 = ((v[1][1] - v[2][1]) * (x - v[2][0]) + (v[2][0] - v[1][0]) * (y - v[2][1])) / d, l2 = ((v[2][1] - v[0][1]) * (x - v[2][0]) + (v[0][0] - v[2][0]) * (y - v[2][1])) / d, l3 = 1 - l1 - l2;
          return [x, y, l1 * v[0][2] + l2 * v[1][2] + l3 * v[2][2], l1 * v[0][3] + l2 * v[1][3] + l3 * v[2][3]];
        };
        let R; try { R = polygonClipping.intersection([[[...v.map(p => [p[0], p[1]]), [v[0][0], v[0][1]]]]], clipPoly); } catch (e) { return; }
        R.forEach(pg => {
          const ring = pg[0].slice(0, -1).map(p => sub(p[0], p[1])); if (ring.length < 3) return;
          if (ring.length === 3 && pg.length === 1) { const t = area2(ring) < 0 ? [ring[0], ring[2], ring[1]] : ring; emit(t); return; }
          const outer = ring.map(p => new THREE.Vector2(p[0], p[1])), holes = pg.slice(1).map(h => h.slice(0, -1).map(p => new THREE.Vector2(p[0], p[1])));
          const all = ring.concat(...holes.map(h => h.map(p => sub(p.x, p.y))));
          THREE.ShapeUtils.triangulateShape(outer, holes).forEach(f => { const t = [all[f[0]], all[f[1]], all[f[2]]]; emit(area2(t) < 0 ? [t[0], t[2], t[1]] : t); });
        });
      });
    }
    if (++work % 40 === 0) { await l3volTick(); if (!alive()) return null; }
  }
  const org = P[0].slice(), solids = {};
  ["cut", "fill"].forEach(k => { if (tot[k] > 1e-6) solids[k] = l3volMesh(lists[k], k, org, tmax); });
  const at = k => { const c = cen[k]; return c[0] > 0 ? [c[1] / c[0], c[2] / c[0], c[3] / c[0]] : null; };
  const cut = tot.cut, fill = tot.fill, tris = (solids.cut ? solids.cut.tris : 0) + (solids.fill ? solids.fill.tris : 0);
  const res = { fill, cut, net: fill - cut, area, areaIn: aIn, areaMiss: aMiss, cell, mn: aIn ? mn : 0, mx: aIn ? mx : 0, cellsCut: solids.cut ? solids.cut.tris : 0, cellsFill: solids.fill ? solids.fill.tris : 0, tris, tmax, at: new Date().toISOString(), srcA: l3volLabel(cur, cur.spec.a), srcB: l3volLabel(cur, cur.spec.b) };
  return { res, geom: { o: org, cut: solids.cut || null, fill: solids.fill || null, cutAt: at("cut"), fillAt: at("fill") } };
}
const l3volText = res => `Schakt −${l3volM3(res.cut)} · Fyllning +${l3volM3(res.fill)}`;

/* ---- Ritning (anropas av l3mDraw för sparade mått och av panelen för det pågående) ---- */
function l3volDrawInto(grp, host, m, P, G, own) {
  const O = l3.O, sel = !!(l3m && l3m.sel && l3m.sel.has(m.id));
  const line = (a, b, col, op) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: op || 1 })); l.renderOrder = 12; l.userData.noHit = true; l.raycast = () => {}; grp.add(l); };
  const col = sel ? 0xf59e0b : 0xffffff;
  for (let i = 0; i < P.length; i++) { line(P[i], P[(i + 1) % P.length], 0x111827, 1); line(P[i], P[(i + 1) % P.length], col, 0.9); }
  if (!G) return;
  ["cut", "fill"].forEach(kind => {
    const s = G[kind]; if (!s) return;
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(s.pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(s.col, 3)); geo.setIndex(new THREE.BufferAttribute(s.idx, 1));
    if (!s.nrm) { geo.computeVertexNormals(); s.nrm = geo.getAttribute("normal").array; s.edges = new THREE.EdgesGeometry(geo, 35).getAttribute("position").array; } else geo.setAttribute("normal", new THREE.BufferAttribute(s.nrm, 3));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: Number(l3Prefs().volOpacity) || 0.62, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(G.o[0] - O[0], G.o[1] - O[1], G.o[2] - O[2]); mesh.renderOrder = 8; mesh.userData.noHit = true; mesh.raycast = () => {}; grp.add(mesh);
    if (l3Prefs().volWire && s.wire && s.wire.length) { const wg = new THREE.BufferGeometry(); wg.setAttribute("position", new THREE.BufferAttribute(s.wire, 3)); const wl = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.7, depthTest: false })); wl.position.copy(mesh.position); wl.renderOrder = 10; wl.userData.noHit = true; wl.raycast = () => {}; grp.add(wl); }
    const egeo = new THREE.BufferGeometry(); egeo.setAttribute("position", new THREE.BufferAttribute(s.edges, 3));
    const eg = new THREE.LineSegments(egeo, new THREE.LineBasicMaterial({ color: L3VOL_COL[kind], transparent: true, opacity: 0.55 })); eg.position.copy(mesh.position); eg.renderOrder = 9; eg.userData.noHit = true; eg.raycast = () => {}; grp.add(eg);
  });
  if (!host) return;
  const mk = (id, txt, at, cls) => { const el = document.createElement("div"); el.className = "v3-meas v3-meas-keep v3-vlab " + cls; el.textContent = txt; host.appendChild(el); el._at = new THREE.Vector3(at[0] - O[0], at[1] - O[1], at[2] - O[2] + 0.4); l3m.labels.set(m.id + ":" + id, el); };
  if (G.cutAt && m.vol && m.vol.res) mk("cut", `Schakt −${l3volM3(m.vol.res.cut)}`, G.cutAt, "cut");
  if (G.fillAt && m.vol && m.vol.res) mk("fill", `Fyllning +${l3volM3(m.vol.res.fill)}`, G.fillAt, "fill");
}
/* Sparat mått som saknar kroppar (nyss inläst): räkna i bakgrunden när källorna finns. */
function l3volEnsure(m) {
  if (l3vol.geoms.has(m) || l3vol.pending.has(m.id) || l3vol.failed.has(m) || !m.vol) return Promise.resolve(l3vol.geoms.get(m) || null);
  l3vol.pending.add(m.id);
  const cur = { pts: m.pts, surf: m.vol.surf || null, spec: m.vol.spec };
  return l3volCompute(cur, () => true).then(r => { l3vol.pending.delete(m.id); if (!r || r.err) { l3vol.failed.add(m); return null; } const was = m.text; l3vol.geoms.set(m, r.geom); m.vol.res = r.res; m.text = l3volText(r.res); if (m.saved && was !== m.text) l3mChanged(m); else l3mDraw(); return r.geom; }).catch(e => { l3vol.pending.delete(m.id); l3vol.failed.add(m); console.warn("Volym", e); return null; });
}
function l3volInvalidate(m) { l3vol.geoms.delete(m); l3vol.failed.delete(m); }
function l3volRecompute(m) { l3volInvalidate(m); return l3volEnsure(m); }

/* ---- IFC: kropparna som trianglar relativt måttets första punkt ---- */
function l3volIfcParts(m) {
  const G = l3vol.geoms.get(m); if (!G) return [];
  const out = [];
  const only = l3vol.ifcPart === "cut" || l3vol.ifcPart === "fill" ? l3vol.ifcPart : null;   // Victor: schakt för sig, fyllning för sig eller båda
  [["cut", "Schakt", m.vol.res.cut, "−"], ["fill", "Fyllning", m.vol.res.fill, "+"]].forEach(([k, name, vol, sg]) => {
    const s = G[k]; if (!s || (only && only !== k)) return; const pts = [], tris = [];
    for (let i = 0; i < s.pos.length; i += 3) pts.push({ x: s.pos[i], y: s.pos[i + 1], z: s.pos[i + 2] });
    for (let i = 0; i < s.idx.length; i += 3) tris.push([s.idx[i] + 1, s.idx[i + 1] + 1, s.idx[i + 2] + 1]);
    out.push({ kind: k, label: `${name} ${sg}${l3volM3(vol)}`, vol, g: { pts, tris } });
  });
  return out;
}
function l3volInfoRows(m) {
  const v = m.vol; if (!v || !v.res) return [["Volym", "ej uträknad"]];
  const r = v.res, cur = { surf: v.surf };
  return [["Schakt", `−${l3volM3(r.cut)}`], ["Fyllning", `+${l3volM3(r.fill)}`], ["Netto", `${l3volSg(r.net, "+")} (${Math.round(r.net) > 0 ? "överskott" : Math.round(r.net) < 0 ? "underskott" : "balans"})`],
    ["Yta i plan", `${l3Fmt(r.area, 1)} m²`], ["Yta som mäts", l3volLabel(cur, v.spec.a)], ["Mot", l3volLabel(cur, v.spec.b)], ["Rutstorlek", `${String(r.cell).replace(".", ",")} m`],
    ...(r.areaMiss > 0.5 ? [["Utan data", `${l3Fmt(r.areaMiss, 1)} m² av området saknar höjd och räknas inte`]] : []), ["Största skillnad", `${l3Fmt(r.mx, 2)} m över · ${l3Fmt(-r.mn, 2)} m under`]];
}

/* ---- Verktyget och panelen ---- */
function l3volStart() {
  const mp = l3t.mp || [], objs = l3t.mpObjs || [];
  if (mp.length < 3) { l3Status("Området behöver minst tre hörn.", true); return; }
  const pts = mp.map(p => [p.x + l3.O[0], p.y + l3.O[1], p.z + l3.O[2]].map(v => Math.round(v * 1000) / 1000));
  l3t.mp = null; l3Busy(false); l3ShowVcb(null); l3Clear(l3.groups.tmp); if (typeof l3ClearMeasure === "function") l3ClearMeasure();
  if (l3vol.capture === "surf") { l3vol.capture = null; const cur = l3vol.cur; if (cur) { cur.surf = pts; cur.spec.b = { k: "surf", side: "top" }; l3volPanel(); l3volSchedule(0); } return; }
  const redo = l3vol.redo; l3vol.redo = null;
  const cur = redo ? { ...redo, pts, objs, res: null, geom: null, busy: "", err: "", saved: false } : { id: null, pts, objs, spec: l3volDefaults({}), surf: null, res: null, geom: null, busy: "", err: "" };
  l3volOpen(cur);
}
/* Tryck i 3D medan panelen är öppen: nivå från en punkt, annars ignoreras trycket. */
function l3volTap(e) {
  if (!l3vol.cur || l3.tool !== "measure" || l3Prefs().measure !== "volume") return false;
  if (l3vol.capture === "level") { const s = l3Snap(e); if (!s) return true; const z = s.point.z + l3.O[2]; l3vol.capture = null; l3vol.cur.spec.b = { k: "level", side: "top", z: Math.round(z * 1000) / 1000 }; l3Status(`Nivå ${l3Fmt(z, 3)} m.`); l3volPanel(); l3volSchedule(0); return true; }
  if (l3vol.capture === "surf") return false; // vanlig polygoninsamling
  l3Status("Volympanelen är öppen – spara eller stäng den först (Esc) för att mäta ett nytt område.", true); return true;
}
function l3volOpen(cur) {
  l3volClose(true); l3vol.cur = cur; l3vol.seq++;
  if (!l3vol.kbd) { l3vol.kbd = e => { if (e.key === "Escape" && l3vol.cur && !l3vol.capture && !/INPUT|SELECT|TEXTAREA/.test((e.target || {}).tagName || "")) { e.stopPropagation(); l3volAskClose(); } else if (e.key === "Escape" && l3vol.capture) { e.stopPropagation(); l3vol.capture = null; l3t.mp = null; l3Busy(false); l3Clear(l3.groups.tmp); l3volPanel(); l3Status("Avbrutet."); } }; window.addEventListener("keydown", l3vol.kbd, true); }
  l3volPanel(); l3volDraw(); l3volSchedule(0);
}
function l3volAskClose() { const c = l3vol.cur; if (c && c.res && !c.saved && !confirm("Stänga volymen utan att spara den som mått?")) return; l3volClose(); }
function l3volClose(keep) {
  const el = document.getElementById("v3VolPanel"); if (el) el.remove();
  const c = l3vol.cur; if (c && c.hidWas) { const m = l3m.list.find(x => x.id === c.id); if (m) m.hid = false; }
  clearTimeout(l3vol.timer); l3vol.seq++; l3vol.cur = null; l3vol.capture = null;
  if (l3.groups.volv) l3Clear(l3.groups.volv);
  l3volLabelsClear();
  if (!keep) { if (l3vol.kbd) { window.removeEventListener("keydown", l3vol.kbd, true); l3vol.kbd = null; } l3mDraw(); }
}
function l3volLabelsClear() { [...l3m.labels.keys()].filter(k => k.startsWith("vol-live")).forEach(k => { l3m.labels.get(k).remove(); l3m.labels.delete(k); }); }
/* Det pågående (inte sparade) – kroppar, kant och etiketter. */
function l3volDraw() {
  if (!l3.groups.volv) { l3.groups.volv = new THREE.Group(); l3.groups.volv.name = "volv"; l3.scene.add(l3.groups.volv); }
  const g = l3.groups.volv; l3Clear(g); l3volLabelsClear();
  const c = l3vol.cur; if (!c) { l3Render(); return; }
  const host = l3.renderer.domElement.parentElement, P = c.pts.map(p => new THREE.Vector3(p[0] - l3.O[0], p[1] - l3.O[1], p[2] - l3.O[2]));
  l3volDrawInto(g, host, { id: "vol-live", vol: c.res ? { res: c.res } : null }, P, c.geom);
  l3mPlaceLabels(); l3Render();
}
function l3volSchedule(ms) {
  clearTimeout(l3vol.timer);
  l3vol.timer = setTimeout(async () => {
    const c = l3vol.cur; if (!c) return; const seq = ++l3vol.seq; c.busy = "Räknar…"; c.err = ""; l3volPanel();
    try {
      const r = await l3volCompute(c, () => seq === l3vol.seq && l3vol.cur === c); if (seq !== l3vol.seq || l3vol.cur !== c) return;
      c.busy = ""; if (!r) return;
      if (r.err) { c.err = r.err; c.res = null; c.geom = null; } else { c.res = r.res; c.geom = r.geom; c.saved = false; }
    } catch (err) { c.busy = ""; c.err = "Kunde inte räkna: " + (err && err.message ? err.message : err); console.warn("Volym", err); }
    l3volPanel(); l3volDraw();
  }, ms == null ? 180 : ms);
}
function l3volSave() {
  const c = l3vol.cur; if (!c || !c.res) return null;
  const vol = { spec: JSON.parse(JSON.stringify(c.spec)), surf: c.surf ? c.surf.map(p => p.slice()) : null, res: { ...c.res } };
  let m = c.id && l3m.list.find(x => x.id === c.id);
  if (m) { m.pts = c.pts.map(p => p.slice()); m.vol = vol; m.text = l3volText(c.res); if (m.saved) l3mChanged(m); }
  else {
    m = l3mAdd("cutfill", c.pts.map(p => new THREE.Vector3(p[0] - l3.O[0], p[1] - l3.O[1], p[2] - l3.O[2])), l3volText(c.res), c.objs); m.vol = vol; c.id = m.id;
  }
  l3vol.geoms.set(m, c.geom); c.saved = true; l3volClose(); if (typeof l3kRenderTab === "function") l3kRenderTab();
  l3Toast(`Volymen sparad som mått: ${l3volText(c.res)}.`);
  return m;
}
/* Solid av ytan (Victor 2026-10-31: "skapa meshmodeller av punktmolnen … cut by object mot inskannat berg måste jag få en solid att klippa mot"):
   området (hörnen) × vald yta (punktmoln, modell, DXF …) blir en sluten kropp – ytan överst, en plan botten under lägsta punkten (extra marginal
   nedåt) och lodräta väggar runt området. Kroppen läggs som ett ritat nät (mesh) som Skär ytor (I), mått och IFC-export kan använda. */
async function l3volSolid() {
  const c = l3vol.cur; if (!c) return; const margin = Math.max(0, Number(l3Prefs().volSolidMargin) || 1), LIMIT = 150000;
  const lvl = z => ({ ...c, spec: { ...c.spec, b: { k: "level", side: "top", z } } });
  c.busy = "Bygger solid…"; l3volPanel();
  try {
    const r1 = await l3volCompute(lvl(-10000), () => true);   // långt under: hela ytan blir en kropp – ger lägsta höjden
    if (!r1 || r1.err || !r1.geom || !r1.geom.fill) { l3Status(r1 && r1.err ? r1.err : "Ytan saknar höjder i området – tänd punktmolnet eller modellen och välj den som \"Yta som mäts\".", true); return; }
    let zmin = Infinity; const s1 = r1.geom.fill, zo = r1.geom.o[2]; for (let i = 2; i < s1.pos.length; i += 3) { const z = s1.pos[i] + zo; if (z > -9000 && z < zmin) zmin = z; }
    const zb = Math.round((zmin - margin) * 1000) / 1000; let r2 = null, cell = Number(c.spec.cell) || 0;
    for (let k = 0; k < 6; k++) {
      const cur = lvl(zb); cur.spec.cell = cell; r2 = await l3volCompute(cur, () => true);
      if (!r2 || r2.err || !r2.geom.fill) { l3Status(r2 && r2.err ? r2.err : "Kunde inte bygga solid.", true); return; }
      if (r2.geom.fill.idx.length / 3 <= LIMIT) break; cell = Math.round(((r2.res.cell || 1) * 1.6) * 100) / 100;   // för tung: grövre rutor
    }
    const G = r2.geom, S = G.fill, o = G.o, pts = [], faces = [];
    for (let i = 0; i < S.pos.length; i += 3) pts.push([Math.round(S.pos[i] * 1000) / 1000, Math.round(S.pos[i + 1] * 1000) / 1000, Math.round(S.pos[i + 2] * 1000) / 1000]);
    for (let i = 0; i < S.idx.length; i += 3) faces.push([S.idx[i] + 1, S.idx[i + 1] + 1, S.idx[i + 2] + 1]);
    const lab = l3volLabel(c, c.spec.a).replace(/\s*\(.*\)\s*$/, "").trim() || "ytan", name = "Solid av " + lab;
    placeSnapshot(); const made = modCreate({ k: "mesh", pts, faces, closed: true }, [o[0], o[1], o[2]], { name, color: "#8b8f97", snapshot: false });
    l3SelectIds([made.id]); l3Changed();
    l3Status(`Solid skapad: ${l3volM3(r2.res.fill)} (${(faces.length).toLocaleString("sv-SE")} trianglar, botten ${zb.toFixed(2).replace(".", ",")} m). Använd den med Skär ytor (I) – tryck på det som ska kapas, sedan på solidens yta. Ctrl+Z ångrar.`);
  } catch (err) { console.warn("Solid", err); l3Status("Kunde inte skapa solid: " + (err && err.message || err), true); }
  finally { if (l3vol.cur === c) { c.busy = ""; l3volPanel(); } }
}
/* Solid av volymen (Victor 2026-10-31, bild: "jag vill ju ha solid av ytan som nummer 1 pekar på" = den blå schaktkroppen mellan den uppmätta ytan och "Mot"):
   schakt- och fyllningskropparna som redan visas i förhandsvisningen görs till slutna ritade kroppar (en per sort) som kan skäras mot, mätas och exporteras. */
function l3volSolidVol() {
  const c = l3vol.cur; if (!c || !c.geom) { l3Status("Ingen volym att göra solid av ännu – vänta tills måttet räknats klart.", true); return; }
  const G = c.geom, o = G.o, base = l3volLabel(c, c.spec.a).replace(/\s*\(.*\)\s*$/, "").trim() || "ytan", made = [];
  placeSnapshot();
  [["cut", "Schakt", "#3b82f6"], ["fill", "Fyllning", "#ef4444"]].forEach(([k, nm, col]) => {
    const S = G[k]; if (!S || !S.idx || S.idx.length < 12) return;
    const pts = [], faces = [];
    for (let i = 0; i < S.pos.length; i += 3) pts.push([Math.round(S.pos[i] * 1000) / 1000, Math.round(S.pos[i + 1] * 1000) / 1000, Math.round(S.pos[i + 2] * 1000) / 1000]);
    for (let i = 0; i < S.idx.length; i += 3) faces.push([S.idx[i] + 1, S.idx[i + 1] + 1, S.idx[i + 2] + 1]);
    made.push(modCreate({ k: "mesh", pts, faces, closed: true }, [o[0], o[1], o[2]], { name: nm + "volym – " + base, color: col, snapshot: false }));
  });
  if (!made.length) { l3Status("Volymen är tom – det finns varken schakt eller fyllning att göra solid av.", true); return; }
  l3SelectIds(made.map(m => m.id)); l3Changed();
  l3Status(`Solid skapad av volymen (${made.length === 2 ? "schakt + fyllning" : (G.cut && G.cut.idx && G.cut.idx.length ? "schakt" : "fyllning")}). Använd den med Skär ytor (I). Ctrl+Z ångrar.`);
}
/* Ändra ett sparat mått: panelen öppnas med dess inställningar. */
function l3volEdit(m) {
  if (!m.vol) return;
  const cur = { id: m.id, pts: m.pts.map(p => p.slice()), objs: m.objs || [], spec: JSON.parse(JSON.stringify(m.vol.spec)), surf: m.vol.surf ? m.vol.surf.map(p => p.slice()) : null, res: m.vol.res || null, geom: l3vol.geoms.get(m) || null, busy: "", err: "", saved: true };
  l3m.hidden = false; m.hid = true; l3mDraw(); // det sparade döljs medan det ändras (panelen visar samma sak)
  cur.hidWas = true; l3volOpen(cur); if (!cur.geom) l3volSchedule(0);
}
function l3volPanel() {
  const c = l3vol.cur; if (!c) return;
  const host = document.getElementById("v3Canvas"); if (!host) return;
  let el = document.getElementById("v3VolPanel");
  if (!el) { el = document.createElement("div"); el.id = "v3VolPanel"; el.className = "v3-vp"; host.appendChild(el); ["pointerdown", "wheel", "contextmenu", "dblclick", "click", "keydown", "keyup"].forEach(t => el.addEventListener(t, e => e.stopPropagation())); }
  const esc = typeof escHtml === "function" ? escHtml : s => String(s), srcs = l3volSources(c), r = c.res, n = c.pts.length, area = l3volArea(c.pts);
  const opt = (s, v) => `<option value="${esc(s.k)}" ${v === s.k ? "selected" : ""}>${esc(s.label)}</option>`;
  const side = (key, sp) => { const o = srcs.find(x => x.k === sp.k); return o && o.sided ? `<select class="sm" data-vs="${key}" title="Vilken sida av modellen som mäts"><option value="top" ${sp.side !== "bottom" ? "selected" : ""}>Ovansida</option><option value="bottom" ${sp.side === "bottom" ? "selected" : ""}>Undersida</option></select>` : sp.k === "level" ? `<input class="sm" type="text" inputmode="decimal" data-vz="${key}" value="${Number.isFinite(sp.z) ? String(sp.z).replace(".", ",") : ""}" placeholder="medel" title="Höjd (m) – tomt = hörnens medelhöjd"><button type="button" class="ic" data-vpick="${key}" title="Tryck på en punkt i modellen – dess höjd blir nivån">⌖</button>` : ""; };
  const row = (key, label, sp, hint) => `<div class="v3-vq-r"><div class="v3-vq-l" title="${esc(hint)}"><i class="${key}"></i>${label}</div><div class="v3-vq-in"><select data-vk="${key}">${srcs.map(s => opt(s, sp.k)).join("")}</select>${side(key, sp)}</div></div>`;
  const cellTxt = Number(c.spec.cell) > 0 ? String(c.spec.cell).replace(".", ",") + " m" : "Auto" + (r ? " (" + String(r.cell).replace(".", ",") + " m)" : "");
  const trTxt = r && r.tris ? ` (${r.tris.toLocaleString("sv-SE").replace(/[  ]/g, " ")} tr.)` : "";
  const res = r ? `<div class="v3-vp-res">
      <div class="cut"><i></i><span>Schakt</span><b>−${l3volM3(r.cut)}</b></div><div class="fill"><i></i><span>Fyllning</span><b>+${l3volM3(r.fill)}</b></div>
      <div class="net"><span>Netto · ${Math.round(r.net) > 0 ? "överskott" : Math.round(r.net) < 0 ? "underskott" : "balans"}</span><b>${l3volSg(r.net, "+")}</b></div>
      <div class="sub"><span>Yta i plan</span><b>${l3Fmt(area, 1)} m²</b></div>
    </div>
    ${r.areaMiss > 0.5 ? `<div class="v3-vq-note">⚠ ${l3Fmt(r.areaMiss, 1)} m² saknar höjd och räknas inte</div>` : ""}
    <div class="v3-vp-t">Schakt = ytan som mäts ligger <b>lägre</b> än "Mot", fyllning = <b>högre</b>. Störst skillnad ${l3Fmt(r.mx, 2)} m över / ${l3Fmt(-r.mn, 2)} m under.</div>` : c.err ? `<div class="v3-vp-e">${esc(c.err)}</div>` : `<div class="v3-vp-t">${c.busy || "Välj vad som ska mätas mot vad."}</div>`;
  const noSrc = !srcs.some(s => /^(pc|md|cad):/.test(s.k));
  el.classList.toggle("col", !!l3Prefs().vpCol);
  const ae = document.activeElement;
  if (el.innerHTML && ae && ae.dataset && ae.dataset.vc !== undefined && el.contains(ae)) { // slidern dras – bara resultatet byts, annars avbryts draget
    const box = el.querySelector("[data-vres]"); if (box) box.innerHTML = res; const lab = el.querySelector("[data-vcl]"); if (lab) lab.textContent = cellTxt;
    const wl = el.querySelector("[data-vtri]"); if (wl) wl.textContent = trTxt; return;
  }
  const sw = (key, on, label, tip) => `<label class="v3-vq-sw" title="${esc(tip)}"><span>${label}<em data-vtri-${key}></em></span><input type="checkbox" data-${key} ${on ? "checked" : ""}><b></b></label>`;
  el.innerHTML = `<div class="v3-vp-h"><button type="button" data-vb="col" class="tg" title="Fäll ihop / fäll ut">${l3Prefs().vpCol ? "▸" : "▾"}</button><b>Volym</b><span>${r && l3Prefs().vpCol ? `Netto ${l3volSg(r.net, "+")}` : `${l3Fmt(area, 1)} m² · ${n} hörn`}</span><button type="button" data-vb="undo" title="Ångra punkt – tar bort områdets sista hörn" ${n > 3 ? "" : "disabled"}>↶</button><button type="button" data-vb="restart" title="Börja om – rita området från början">⟲</button><button type="button" data-vb="x" title="Stäng (Esc)">✕</button></div>
    <div class="v3-vp-t" data-vhint>Dra i hörnpunkterna (orange ringar) för att flytta dem – volymen räknas om när du släpper. Ctrl+Z ångrar.</div>
    ${noSrc ? `<div class="v3-vp-t warn">Tänd ett punktmoln eller en 3D-modell (Lager) om något ska mätas mot ytan. Plan och nivå går att använda utan.</div>` : ""}
    <div class="v3-vq-src">${row("a", "Yta som mäts", c.spec.a, "Den yta vars volym mot den andra mäts, t.ex. punktmolnet över schaktgropen")}<button type="button" class="v3-vq-swap" data-vb="swap" title="Byt plats på ytorna – schakt blir fyllning och tvärtom">⇅</button>${row("b", "Mot", c.spec.b, "Jämförelseytan: en modell, ett annat punktmoln, ett plan, en nivå eller en yta du klickat ut")}</div>
    <div data-vres>${res}</div>
    <div class="v3-vq-set">
      <div class="v3-vq-sl" title="Rutstorlek för ytan. Mindre ruta = fler trianglar och mer detalj. Räknas om direkt när du drar."><span>Noggrannhet</span><input type="range" min="0" max="${L3VOL_STEPS.length}" step="1" value="${Math.max(0, L3VOL_STEPS.indexOf(Number(c.spec.cell)) + 1)}" data-vc><em data-vcl>${cellTxt}</em></div>
      ${sw("vwire", !!l3Prefs().volWire, "Visa triangulering", "Visa trianglarna som ytan och volymen är byggda av").replace("data-vtri-vwire", "data-vtri")}
      ${sw("vtext", l3Prefs().volExpText !== false, "Volymtext i IFC", "Skylt med volymtexten i IFC-filen (volymerna ligger alltid som egenskaper)")}
      <div class="v3-vq-sl" title="Hur genomskinliga kropparna är"><span>Syns</span><input type="range" min="0.15" max="1" step="0.05" value="${Number(l3Prefs().volOpacity) || 0.62}" data-vop><em></em></div>
    </div>
    <details class="v3-vq-out" ${l3Prefs().vpOut ? "open" : ""}><summary>Exportera &amp; skapa kropp</summary>
      <div class="v3-vq-seg" role="group" title="Vad som tas med i IFC-filen"><button type="button" data-vifcv="both" class="${(l3vol.ifcPart || "both") === "both" ? "on" : ""}">Schakt + fyllning</button><button type="button" data-vifcv="cut" class="${(l3vol.ifcPart || "both") === "cut" ? "on" : ""}">Schakt</button><button type="button" data-vifcv="fill" class="${(l3vol.ifcPart || "both") === "fill" ? "on" : ""}">Fyllning</button></div>
      <div class="v3-vq-grid"><button type="button" data-vb="ifc" ${r ? "" : "disabled"} title="Området, schakt- och fyllningskropparna som 3D-objekt i en IFC-fil (Trimble Connect eller nedladdning)"><b>⤓</b> Exportera IFC</button>
        <button type="button" data-vb="solid" title="Gör området och den valda ytan (t.ex. inskannat berg i punktmolnet) till en sluten kropp – botten under lägsta punkten, väggar runt området. Då går den att skära mot med Skär ytor." ${c.spec.a && c.spec.a.k !== "level" ? "" : "disabled"}><b>▣</b> Solid av ytan</button>
        <button type="button" class="wide" data-vb="solidvol" title="Gör själva volymen – schaktkroppen (blå) och/eller fyllningen (röd) mellan den uppmätta ytan och &quot;Mot&quot; – till en sluten kropp som går att skära mot med Skär ytor." ${r ? "" : "disabled"}><b>▣</b> Solid av volymen</button></div>
    </details>
    <div class="v3-vq-foot"><button type="button" class="primary" data-vb="save" ${r ? "" : "disabled"}>${c.id ? "Uppdatera måttet" : "Spara som mått"}</button>
      <details class="v3-vq-more"><summary title="Fler val">⋯</summary><div><button type="button" data-vb="copy" disabled>Kopiera resultatet</button><button type="button" data-vb="surf" title="Tryck ut hörnen på en egen yta (t.ex. projekterad botten eller släntkant) – hörnens höjder bestämmer ytan">Klicka ut egen yta…</button><button type="button" data-vb="redraw" title="Rita om området">Rita om området</button><button type="button" data-vb="prism" title="Enkel volym: områdets yta × en höjd du skriver, eller höjden upp till en yta du trycker på">Enkel höjdvolym…</button></div></details></div>`;
  const tl = el.querySelector("[data-vtri]"); if (tl) tl.textContent = trTxt;
  { const cp = el.querySelector('[data-vb="copy"]'); if (cp && r) cp.disabled = false; }
  const q = s => el.querySelector(s), qa = s => el.querySelectorAll(s);
  qa("select[data-vk]").forEach(s => { s.onchange = () => { const k = s.dataset.vk, sp = c.spec[k]; sp.k = s.value; l3volPanel(); l3volSchedule(); }; });
  qa("select[data-vs]").forEach(s => { s.onchange = () => { c.spec[s.dataset.vs].side = s.value; l3volSchedule(); }; });
  qa("input[data-vz]").forEach(i => { i.onchange = () => { const v = Number(String(i.value).replace(/\s/g, "").replace(",", ".")); c.spec[i.dataset.vz].z = i.value.trim() === "" || !Number.isFinite(v) ? null : v; l3volSchedule(); }; i.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") i.blur(); }; });
  qa("[data-vpick]").forEach(b => { b.onclick = () => { l3vol.capture = "level"; l3Status("Tryck på en punkt i modellen – dess höjd blir nivån. Esc avbryter."); }; });
  const cs = q("input[data-vc]"); if (cs) { const lab = q("[data-vcl]"); cs.oninput = () => { const v = L3VOL_STEPS[Number(cs.value) - 1] || 0; lab.textContent = v ? String(v).replace(".", ",") + " m" : "Auto"; c.spec.cell = v; l3volSchedule(220); }; }
  const wi = q("input[data-vwire]"); if (wi) wi.onchange = () => { l3SetPref("volWire", wi.checked); l3volDraw(); l3mDraw(); };
  const on = (k, fn) => qa(`[data-vb="${k}"]`).forEach(b => { b.onclick = fn; });
  on("x", l3volAskClose);
  on("col", () => { l3SetPref("vpCol", !l3Prefs().vpCol); l3volPanel(); });
  on("swap", () => { const t = c.spec.a; c.spec.a = c.spec.b; c.spec.b = t; l3volPanel(); l3volSchedule(0); });
  on("surf", () => { l3vol.capture = "surf"; l3t.mp = null; l3Busy(true); l3Status("Tryck ut hörnen på ytan (varje punkts höjd räknas). Enter eller första punkten avslutar, Esc avbryter."); });
  on("redraw", () => { const was = c; l3volClose(true); l3vol.redo = was; l3t.mp = null; l3Status("Tryck ut området igen."); });
  on("prism", () => { const O = l3.O; l3t.mp = c.pts.map(p => new THREE.Vector3(p[0] - O[0], p[1] - O[1], p[2] - O[2])); l3t.mpObjs = c.objs || []; l3volClose(true); l3VolBaseOld(); });
  on("restart", () => { const was = c; l3volClose(true); l3vol.redo = was; l3t.mp = null; l3Busy(true); l3Status("Tryck ut området från början (Enter avslutar)."); });
  on("undo", () => { if (c.pts.length <= 3) return; c.pts = c.pts.slice(0, -1); c.saved = false; l3volPanel(); l3volSchedule(0); });
  on("save", () => { l3volSave(); });
  on("solid", () => { l3volSolid(); });
  on("solidvol", () => { l3volSolidVol(); });
  el.querySelectorAll("[data-vifcv]").forEach(b => { b.onclick = () => { l3vol.ifcPart = b.dataset.vifcv; el.querySelectorAll("[data-vifcv]").forEach(x => x.classList.toggle("on", x === b)); }; });
  { const od = el.querySelector(".v3-vq-out"); if (od) od.addEventListener("toggle", () => l3SetPref("vpOut", od.open)); }
  on("copy", () => { const t = `${l3volText(c.res)} · netto ${l3volSg(c.res.net, "+")} · yta ${l3Fmt(area, 1)} m² · ${l3volLabel(c, c.spec.a)} mot ${l3volLabel(c, c.spec.b)}`; try { navigator.clipboard.writeText(t).then(() => l3Toast("Kopierat."), () => l3Status("Kunde inte kopiera.", true)); } catch (e) { l3Status("Kunde inte kopiera.", true); } });
  on("ifc", async function () { const b = this; b.disabled = true; try { const m = l3volSave(); if (m) await l3mExportIfc([m.id]); } catch (e) { /* statusraden */ } });
  const tx = q("input[data-vtext]"); if (tx) tx.onchange = () => l3SetPref("volExpText", tx.checked);
  const op = q("input[data-vop]"); if (op) op.oninput = () => { l3SetPref("volOpacity", Number(op.value)); l3volDraw(); l3mDraw(); };
}
