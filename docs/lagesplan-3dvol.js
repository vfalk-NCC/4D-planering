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
const l3volM3 = v => Math.round(v).toLocaleString("sv-SE") + " m³";
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
  const auto = Math.min(5, Math.max(0.1, Math.sqrt(area / 20000))), nice = [0.1, 0.2, 0.25, 0.5, 1, 2, 5].find(v => v >= auto) || 5;
  const floor = Math.sqrt(area / 40000);   // aldrig mer än ca 40 000 rutor i området (ritning och IFC-fil)
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
/* En kropp av de rutor som ingår (mem): ovansidan och undersidan följer höjderna i rutnätets hörn, väggar där grannen inte ingår. */
function l3volSolid(g, nodeA, nodeB, mem, kind, org, tmax) {
  const W = g.nx + 1, top = new Int32Array(W * (g.ny + 1)).fill(-1), bot = new Int32Array(W * (g.ny + 1)).fill(-1), pos = [], col = [], idx = [];
  const vert = (n, isTop) => {
    const arr = isTop ? top : bot; if (arr[n] >= 0) return arr[n];
    const a = nodeA[n], b = nodeB[n], hi = Math.max(a, b), lo = Math.min(a, b), i = n % W, j = (n - i) / W, z = isTop ? hi : lo, c = l3volRamp(kind, (hi - lo) / tmax);
    pos.push(g.x0 + i * g.cell - org[0], g.y0 + j * g.cell - org[1], z - org[2]); col.push(c[0], c[1], c[2]); return (arr[n] = pos.length / 3 - 1);
  };
  const at = (i, j) => i >= 0 && j >= 0 && i < g.nx && j < g.ny && mem[j * g.nx + i] === 1;
  const wall = (n1, n2, ox, oy) => { // väggen mellan två hörn (ovan + under), vänd utåt
    const a = vert(n1, true), b = vert(n2, true), c = vert(n2, false), d = vert(n1, false);
    const nrm = (p, q, r) => { const ux = pos[q * 3] - pos[p * 3], uy = pos[q * 3 + 1] - pos[p * 3 + 1], uz = pos[q * 3 + 2] - pos[p * 3 + 2], vx = pos[r * 3] - pos[p * 3], vy = pos[r * 3 + 1] - pos[p * 3 + 1], vz = pos[r * 3 + 2] - pos[p * 3 + 2]; return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; };
    const n = nrm(a, b, c), dot = n[0] * ox + n[1] * oy;
    if (dot >= 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
  };
  let cells = 0;
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    if (!at(i, j)) continue; cells++;
    const n00 = j * W + i, n10 = n00 + 1, n01 = n00 + W, n11 = n01 + 1;
    idx.push(vert(n00, true), vert(n10, true), vert(n11, true), vert(n00, true), vert(n11, true), vert(n01, true));
    idx.push(vert(n00, false), vert(n11, false), vert(n10, false), vert(n00, false), vert(n01, false), vert(n11, false));
    if (!at(i - 1, j)) wall(n00, n01, -1, 0); if (!at(i + 1, j)) wall(n10, n11, 1, 0);
    if (!at(i, j - 1)) wall(n00, n10, 0, -1); if (!at(i, j + 1)) wall(n01, n11, 0, 1);
  }
  return cells ? { pos: new Float32Array(pos), col: new Float32Array(col), idx: new Uint32Array(idx), cells } : null;
}
/* Hela uträkningen för det som står i panelen / det sparade måttet. */
async function l3volCompute(cur, alive) {
  const P = cur.pts, bd = l3volBox(P), area = l3volArea(P), cell0 = l3volCellFor(bd, area, cur.spec.cell, l3volDensity(cur)), g0 = l3dfGrid(bd, cell0), cell = g0.cell;
  const gA = await l3volHeights(cur, cur.spec.a, bd, cell); if (!alive()) return null;
  const gB = await l3volHeights(cur, cur.spec.b, bd, cell); if (!alive()) return null;
  if (!gA || !gB) return { err: "Kunde inte läsa ytan – är punktmolnet eller modellen tänd och inläst?" };
  const frac = l3volFrac(P, gA), n = gA.nx * gA.ny, ca = cell * cell, eps = 0.002;
  let fill = 0, cut = 0, aIn = 0, aMiss = 0, mn = Infinity, mx = -Infinity, cF = 0, cC = 0;
  const memF = new Uint8Array(n), memC = new Uint8Array(n), nodeA = new Float32Array((gA.nx + 1) * (gA.ny + 1)).fill(NaN), nodeB = new Float32Array(nodeA.length).fill(NaN), nA = new Uint8Array(nodeA.length), W = gA.nx + 1;
  const sumA = new Float64Array(nodeA.length), sumB = new Float64Array(nodeA.length);
  let tmax = 0.05, fx = 0, fy = 0, fzz = 0, cx = 0, cy = 0, cz = 0;
  for (let j = 0; j < gA.ny; j++) for (let i = 0; i < gA.nx; i++) {
    const c = j * gA.nx + i, f = frac[c]; if (!f) continue;
    const a = gA.z[c], b = gB.z[c]; if (!l3volOk(a) || !l3volOk(b)) { aMiss += f * ca; continue; }
    const d = a - b; aIn += f * ca; mn = Math.min(mn, d); mx = Math.max(mx, d);
    if (d > eps) fill += d * f * ca; else if (d < -eps) cut -= d * f * ca;
    if (f >= 0.5) {
      const nd = [j * W + i, j * W + i + 1, (j + 1) * W + i, (j + 1) * W + i + 1]; nd.forEach(k => { sumA[k] += a; sumB[k] += b; nA[k]++; });
      const x = gA.x0 + (i + 0.5) * cell, y = gA.y0 + (j + 0.5) * cell;
      if (d > eps) { memF[c] = 1; cF++; fx += x; fy += y; fzz += a; } else if (d < -eps) { memC[c] = 1; cC++; cx += x; cy += y; cz += b; }
      tmax = Math.max(tmax, Math.abs(d));
    }
  }
  for (let k = 0; k < nodeA.length; k++) if (nA[k]) { nodeA[k] = sumA[k] / nA[k]; nodeB[k] = sumB[k] / nA[k]; }
  const org = P[0].slice(), solids = {};
  if (cC) solids.cut = l3volSolid(gA, nodeA, nodeB, memC, "cut", org, tmax);
  if (cF) solids.fill = l3volSolid(gA, nodeA, nodeB, memF, "fill", org, tmax);
  const res = { fill, cut, net: fill - cut, area, areaIn: aIn, areaMiss: aMiss, cell, mn: aIn ? mn : 0, mx: aIn ? mx : 0, cellsCut: cC, cellsFill: cF, tmax };
  return { res, geom: { o: org, cut: solids.cut || null, fill: solids.fill || null, cutAt: cC ? [cx / cC, cy / cC, cz / cC] : null, fillAt: cF ? [fx / cF, fy / cF, fzz / cF] : null } };
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
  [["cut", "Schakt", m.vol.res.cut, "−"], ["fill", "Fyllning", m.vol.res.fill, "+"]].forEach(([k, name, vol, sg]) => {
    const s = G[k]; if (!s) return; const pts = [], tris = [];
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
  const side = (key, sp) => { const o = srcs.find(x => x.k === sp.k); return o && o.sided ? `<select data-vs="${key}" title="Vilken sida av modellen som mäts"><option value="top" ${sp.side !== "bottom" ? "selected" : ""}>Ovansida</option><option value="bottom" ${sp.side === "bottom" ? "selected" : ""}>Undersida</option></select>` : sp.k === "level" ? `<input type="text" inputmode="decimal" data-vz="${key}" value="${Number.isFinite(sp.z) ? String(sp.z).replace(".", ",") : ""}" placeholder="hörnens medel" title="Höjd (m) – lämna tomt för hörnens medelhöjd"><button type="button" data-vpick="${key}" title="Tryck på en punkt i modellen – dess höjd blir nivån">Välj i modellen</button>` : ""; };
  const row = (key, label, sp, hint) => `<div class="v3-vp-r"><span title="${esc(hint)}">${label}</span><select data-vk="${key}">${srcs.map(s => opt(s, sp.k)).join("")}</select>${side(key, sp)}</div>`;
  const res = r ? `<div class="v3-vp-res">
      <div class="cut"><i></i><span>Schakt</span><b>−${l3volM3(r.cut)}</b></div><div class="fill"><i></i><span>Fyllning</span><b>+${l3volM3(r.fill)}</b></div>
      <div class="net"><span>Netto</span><b>${l3volSg(r.net, "+")}</b><em>${Math.round(r.net) > 0 ? "överskott" : Math.round(r.net) < 0 ? "underskott" : "balans"}</em></div>
      <div class="sub"><span>Yta i plan</span><b>${l3Fmt(area, 1)} m²</b></div>
    </div>
    <div class="v3-vp-t">Schakt = ytan som mäts ligger <b>lägre</b> än "Mot". Fyllning = <b>högre</b>. Rutstorlek ${String(r.cell).replace(".", ",")} m · ${l3Fmt(r.mx, 2)} m över / ${l3Fmt(-r.mn, 2)} m under${r.areaMiss > 0.5 ? ` · <span class="warn">${l3Fmt(r.areaMiss, 1)} m² saknar höjd och räknas inte</span>` : ""}</div>` : c.err ? `<div class="v3-vp-e">${esc(c.err)}</div>` : `<div class="v3-vp-t">${c.busy || "Välj vad som ska mätas mot vad."}</div>`;
  const noSrc = !srcs.some(s => /^(pc|md|cad):/.test(s.k));
  el.innerHTML = `<div class="v3-vp-h"><b>Volym</b><span>${l3Fmt(area, 1)} m² · ${n} hörn</span><button type="button" data-vb="x" title="Stäng (Esc)">✕</button></div>
    ${noSrc ? `<div class="v3-vp-t warn">Tänd ett punktmoln eller en 3D-modell (Lager) om något ska mätas mot ytan. Plan och nivå går att använda utan.</div>` : ""}
    ${row("a", "Yta som mäts", c.spec.a, "Den yta vars volym mot den andra mäts, t.ex. punktmolnet över schaktgropen")}
    ${row("b", "Mot", c.spec.b, "Jämförelseytan: en modell, ett annat punktmoln, ett plan, en nivå eller en yta du klickat ut")}
    <div class="v3-vp-l"><button type="button" data-vb="swap" title="Byt plats på ytorna – schakt blir fyllning och tvärtom">⇅ Byt</button><button type="button" data-vb="surf" title="Tryck ut hörnen på en egen yta (t.ex. projekterad botten eller släntkant) – hörnens höjder bestämmer ytan">Klicka ut egen yta…</button><button type="button" data-vb="redraw" title="Rita om området">Rita om området</button><button type="button" data-vb="prism" title="Enkel volym: områdets yta × en höjd du skriver, eller höjden upp till en yta du trycker på">Enkel höjdvolym…</button>
      <label class="v3-vp-chk" title="Rutstorlek för uträkningen – mindre ruta ger mer detalj men tar längre tid"><span>Rutor</span><select data-vc>${[[0, "Auto"], [0.1, "0,1 m"], [0.25, "0,25 m"], [0.5, "0,5 m"], [1, "1 m"], [2, "2 m"], [5, "5 m"]].map(([v, l]) => `<option value="${v}" ${Number(c.spec.cell) === v ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>
    ${res}
    <div class="v3-vp-b"><button type="button" class="primary" data-vb="save" ${r ? "" : "disabled"}>${c.id ? "Uppdatera måttet" : "Spara som mått"}</button><button type="button" data-vb="ifc" ${r ? "" : "disabled"} title="Området, schakt- och fyllningskropparna som 3D-objekt i en IFC-fil (Trimble Connect eller nedladdning)">Exportera IFC</button><button type="button" data-vb="copy" ${r ? "" : "disabled"}>Kopiera</button>
      <label class="v3-vp-chk" title="Skylt med volymtexten i IFC-filen (volymerna ligger alltid som egenskaper)"><input type="checkbox" data-vtext ${l3Prefs().volExpText !== false ? "checked" : ""}> Volymtext i IFC</label>
      <label class="v3-vp-chk" title="Hur genomskinliga kropparna är"><span>Syns</span><input type="range" min="0.15" max="1" step="0.05" value="${Number(l3Prefs().volOpacity) || 0.62}" data-vop></label></div>`;
  const q = s => el.querySelector(s), qa = s => el.querySelectorAll(s);
  qa("select[data-vk]").forEach(s => { s.onchange = () => { const k = s.dataset.vk, sp = c.spec[k]; sp.k = s.value; l3volPanel(); l3volSchedule(); }; });
  qa("select[data-vs]").forEach(s => { s.onchange = () => { c.spec[s.dataset.vs].side = s.value; l3volSchedule(); }; });
  qa("input[data-vz]").forEach(i => { i.onchange = () => { const v = Number(String(i.value).replace(/\s/g, "").replace(",", ".")); c.spec[i.dataset.vz].z = i.value.trim() === "" || !Number.isFinite(v) ? null : v; l3volSchedule(); }; i.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") i.blur(); }; });
  qa("[data-vpick]").forEach(b => { b.onclick = () => { l3vol.capture = "level"; l3Status("Tryck på en punkt i modellen – dess höjd blir nivån. Esc avbryter."); }; });
  const cs = q("select[data-vc]"); if (cs) cs.onchange = () => { c.spec.cell = Number(cs.value) || 0; l3volSchedule(); };
  const on = (k, fn) => qa(`[data-vb="${k}"]`).forEach(b => { b.onclick = fn; });
  on("x", l3volAskClose);
  on("swap", () => { const t = c.spec.a; c.spec.a = c.spec.b; c.spec.b = t; l3volPanel(); l3volSchedule(0); });
  on("surf", () => { l3vol.capture = "surf"; l3t.mp = null; l3Busy(true); l3Status("Tryck ut hörnen på ytan (varje punkts höjd räknas). Enter eller första punkten avslutar, Esc avbryter."); });
  on("redraw", () => { const was = c; l3volClose(true); l3vol.redo = was; l3t.mp = null; l3Status("Tryck ut området igen."); });
  on("prism", () => { const O = l3.O; l3t.mp = c.pts.map(p => new THREE.Vector3(p[0] - O[0], p[1] - O[1], p[2] - O[2])); l3t.mpObjs = c.objs || []; l3volClose(true); l3VolBaseOld(); });
  on("save", () => { l3volSave(); });
  on("copy", () => { const t = `${l3volText(c.res)} · netto ${l3volSg(c.res.net, "+")} · yta ${l3Fmt(area, 1)} m² · ${l3volLabel(c, c.spec.a)} mot ${l3volLabel(c, c.spec.b)}`; try { navigator.clipboard.writeText(t).then(() => l3Toast("Kopierat."), () => l3Status("Kunde inte kopiera.", true)); } catch (e) { l3Status("Kunde inte kopiera.", true); } });
  on("ifc", async function () { const b = this; b.disabled = true; try { const m = l3volSave(); if (m) await l3mExportIfc([m.id]); } catch (e) { /* statusraden */ } });
  const tx = q("input[data-vtext]"); if (tx) tx.onchange = () => l3SetPref("volExpText", tx.checked);
  const op = q("input[data-vop]"); if (op) op.oninput = () => { l3SetPref("volOpacity", Number(op.value)); l3volDraw(); l3mDraw(); };
}
