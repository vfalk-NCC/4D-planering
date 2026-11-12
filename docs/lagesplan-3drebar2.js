/* Armering v2 – formbibliotek, formeditor, stavgrupper med handtag och täckskikt, mängdförteckning och export (Victor 2026-11-01: "alla typer enligt typblad 2b … modellera dom formerna … dra i insättningspunkter … bestämma täckande betongskikt … inspiration från Tekla … lägg till exportfunktion").
   ⚠ Experimentell. Formerna är min bästa tolkning av gängse svenska/ISO-bockningsformer (SS-EN ISO 4066): jag har inte kunnat läsa Typblad 2A/2B-tabellen, så bokstavskoderna är egna tills tabellen läggs in. Med formeditorn går det att modellera exakt de former som saknas.
   Tänkt efter Teklas armeringsarbetssätt: stavgrupper (en stav + fördelning c/c), handtag i modellen, täckande betongskikt per sida, numrering (pos) och förteckning/export.
   Mått är teoretiska skärningsmått (mitt stång, mm). Böjradie: dornens diameter 4·Ø (Ø ≤ 16) eller 7·Ø (Ø > 16); utvecklad längd räknas på den böjda stångens mittlinje. */
const L3RB_HOOK = d => Math.max(10 * d, 70);   // krok 135°: 10 Ø, minst 70 mm
/* Former: letters = måttbokstäver; def = standardmått (mm); seg = svängar [längd, vridning°]; pts = egen generator; round = böjs i hörnen. */
const L3RB_SHAPES = {
  R:   { name: "Rak stång", letters: ["A"], def: { A: 3000 }, seg: () => [["A", 0]] },
  L:   { name: "Vinkelhake (L)", letters: ["A", "B"], def: { A: 1200, B: 400 }, seg: () => [["A", 90], ["B", 0]] },
  U:   { name: "U-stång", letters: ["A", "B", "C"], def: { A: 600, B: 300, C: 600 }, seg: () => [["A", 90], ["B", 90], ["C", 0]] },
  Z:   { name: "Z-stång", letters: ["A", "B", "C"], def: { A: 400, B: 400, C: 800 }, seg: () => [["A", 90], ["B", -90], ["C", 0]] },
  T:   { name: "Trappstång 45°", letters: ["A", "B", "C"], def: { A: 800, B: 500, C: 800 }, seg: () => [["A", 45], ["B", -45], ["C", 0]] },
  K:   { name: "K-form (tre vinklar åt samma håll)", letters: ["A", "B", "C", "D"], def: { A: 400, B: 600, C: 400, D: 200 }, seg: () => [["A", 90], ["B", 90], ["C", 90], ["D", 0]] },
  V:   { name: "Vinkel valfri", letters: ["A", "B", "V"], def: { A: 1000, B: 600, V: 60 }, seg: () => [["A", "V"], ["B", 0]] },
  H:   { name: "Stång med 135°-krok", letters: ["A"], def: { A: 2000 }, seg: (D, d) => [[L3RB_HOOK(d), 135], ["A", 0]], hook: true },
  H2:  { name: "Stång med 135°-krokar (samma sida)", letters: ["A"], def: { A: 1500 }, seg: (D, d) => [[L3RB_HOOK(d), 135], ["A", 135], [L3RB_HOOK(d), 0]], hook: true },
  X:   { name: "Hårnål/X-bygel (krokar åt var sitt håll)", letters: ["A"], def: { A: 300 }, seg: (D, d) => [[L3RB_HOOK(d), 135], ["A", -135], [L3RB_HOOK(d), 0]], hook: true },
  B:   { name: "Sluten bygel (135°-krokar)", letters: ["A", "B"], def: { A: 250, B: 450 }, pts: (D, d) => { const A = D.A, B = D.B, h = L3RB_HOOK(d), k = h * Math.SQRT1_2; return [[k, B - k], [0, B], [A, B], [A, 0], [0, 0], [0, B], [k, B - k]]; }, hook: true },
  BU:  { name: "Öppen bygel (U med krokar)", letters: ["A", "B"], def: { A: 250, B: 450 }, pts: (D, d) => { const A = D.A, B = D.B, h = L3RB_HOOK(d), k = h * Math.SQRT1_2; return [[k, B - k], [0, B], [0, 0], [A, 0], [A, B], [A - k, B - k]]; }, hook: true },
  O:   { name: "Rund bygel / ring", letters: ["A", "O"], def: { A: 400, O: 300 }, pts: (D, d) => { const r = D.A / 2, n = 36, P = []; for (let i = 0; i <= n; i++) { const a = i / n * 2 * Math.PI; P.push([r + r * Math.cos(a), r + r * Math.sin(a)]); } const ov = Math.min(D.O, 1.2 * Math.PI * r); const a1 = ov / r; for (let i = 1; i <= 8; i++) { const a = i / 8 * a1; P.push([r + r * Math.cos(a), r + r * Math.sin(a)]); } return P; }, noRound: true },
  BG:  { name: "Båge", letters: ["R", "V"], def: { R: 1500, V: 90 }, pts: D => { const n = Math.max(6, Math.ceil(D.V / 6)), P = []; for (let i = 0; i <= n; i++) { const a = (i / n) * D.V * Math.PI / 180; P.push([D.R * Math.sin(a), D.R * (1 - Math.cos(a))]); } return P; }, noRound: true },
};
/* Egna former (formeditorn) lagras i inställningarna: { id, name, segs: [{ len, turn }] } – bokstäver A, B, C … per sträcka. */
const L3RB_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const l3rbCustom = () => (l3Prefs().rbShapes || []).filter(s => s && s.id && Array.isArray(s.segs));
function l3rbShapeDef(id) {
  if (L3RB_SHAPES[id]) return { id, ...L3RB_SHAPES[id] };
  const c = l3rbCustom().find(s => s.id === id); if (!c) return null; const letters = c.segs.map((_, i) => L3RB_ALPHA[i]), def = {}; c.segs.forEach((g, i) => { def[letters[i]] = g.len; });
  return { id, name: c.name || id, custom: true, letters, def, seg: () => c.segs.map((g, i) => [letters[i], i < c.segs.length - 1 ? g.turn : 0]) };
}
function l3rbShapeList() { return [...Object.keys(L3RB_SHAPES).map(id => l3rbShapeDef(id)), ...l3rbCustom().map(s => l3rbShapeDef(s.id))]; }
/* Skarpa hörnpunkter [m] i stångens plan (x längs första sträckan, y åt vänster). dims i mm. */
function l3rbSharp(def, dims, d) {
  const D = {}; (def.letters || []).forEach(k => { D[k] = Number(dims && dims[k] != null ? dims[k] : def.def[k]) || 0; }); if (def.pts) return def.pts(D, d).map(p => [p[0] / 1000, p[1] / 1000]);
  const segs = def.seg(D, d); let h = 0, x = 0, y = 0; const P = [[0, 0]];
  segs.forEach(([len, turn]) => { const L = (typeof len === "string" ? D[len] : len) / 1000; x += Math.cos(h) * L; y += Math.sin(h) * L; P.push([x, y]); const t = typeof turn === "string" ? D[turn] : turn; h += t * Math.PI / 180; });
  return P;
}
/* Rundar hörnen med radie rc (mittlinjen) – returnerar punkter med bågar. */
function l3rbFillet(P, rc) {
  if (P.length < 3) return P.slice(); const out = [P[0]];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], v = P[i], b = P[i + 1], u0 = [v[0] - a[0], v[1] - a[1]], u1 = [b[0] - v[0], b[1] - v[1]], l0 = Math.hypot(...u0), l1 = Math.hypot(...u1); if (l0 < 1e-9 || l1 < 1e-9) { out.push(v); continue; }
    u0[0] /= l0; u0[1] /= l0; u1[0] /= l1; u1[1] /= l1; const cr = u0[0] * u1[1] - u0[1] * u1[0], dt = u0[0] * u1[0] + u0[1] * u1[1], th = Math.atan2(Math.abs(cr), dt); if (th < 0.02) { out.push(v); continue; }
    const tn = Math.tan(th / 2), r = Math.min(rc, 0.5 * Math.min(l0, l1) / tn), t = r * tn, T1 = [v[0] - u0[0] * t, v[1] - u0[1] * t], s = cr > 0 ? 1 : -1, nrm = [-u0[1] * s, u0[0] * s], C = [T1[0] + nrm[0] * r, T1[1] + nrm[1] * r], a0 = Math.atan2(T1[1] - C[1], T1[0] - C[0]), n = Math.max(2, Math.ceil(th / (Math.PI / 12)));
    for (let k = 0; k <= n; k++) { const a1 = a0 + s * th * k / n; out.push([C[0] + r * Math.cos(a1), C[1] + r * Math.sin(a1)]); }
  }
  out.push(P[P.length - 1]); return out;
}
const l3rbBendR = d => (d <= 16 ? 4 * d : 7 * d) / 2000 + d / 2000;   // mittlinjens böjradie [m]
const l3rbPolyLen = P => { let s = 0; for (let i = 1; i < P.length; i++) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return s; };
/* Allt om en stav av en form: böjd mittlinje, utvecklad längd [m], antal böjar, skarpa hörn. */
function l3rbShapeInfo(shapeId, dims, d) {
  const def = l3rbShapeDef(shapeId); if (!def) return null; const sharp = l3rbSharp(def, dims, d), path = def.noRound ? sharp : l3rbFillet(sharp, l3rbBendR(d));
  let bends = 0; for (let i = 1; i < sharp.length - 1; i++) { const a = sharp[i - 1], v = sharp[i], b = sharp[i + 1]; const cr = (v[0] - a[0]) * (b[1] - v[1]) - (v[1] - a[1]) * (b[0] - v[0]); if (Math.abs(cr) > 1e-9) bends++; }
  return { def, sharp, path, cut: l3rbPolyLen(path), bends };
}
const l3rbDimsOf = (def, dims) => (def.letters || []).map(k => `${k}${Math.round(Number(dims && dims[k] != null ? dims[k] : def.def[k]) || 0)}`).join(" ");
/* ---- Stavgrupper ------------------------------------------------------------------------------------------------------------------ */
const L3RB_DIRS = { n: "Planets normal (bygel längs balken)", x: "Längs stången", y: "Tvärs i planet", z: "Lodrätt", yaw90: "Vågrätt vinkelrätt mot stången" };
function l3rbFrame(g) {   // ex = stångens riktning, ey = planets "upp", n = normalen
  const y = (g.yaw || 0) * Math.PI / 180, t = (g.tilt || 0) * Math.PI / 180, ex = [Math.cos(y), Math.sin(y), 0], side = [-Math.sin(y), Math.cos(y), 0];
  let ey = [side[0] * Math.sin(t), side[1] * Math.sin(t), Math.cos(t)]; if (g.flip) ey = ey.map(v => -v);
  const n = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]]; return { ex, ey, n, side };
}
function l3rbDistVec(g, F) {
  const k = g.dist && g.dist.dir || (Math.abs(g.tilt || 0) > 45 ? "y" : "n"); if (k === "x") return F.ex; if (k === "y") return F.ey; if (k === "z") return [0, 0, 1]; if (k === "yaw90") return F.side; return F.n;
}
const l3rbGroupCount = g => { const D = g.dist || {}; if (!D.len || D.len <= 0) return 1; return D.mode === "n" ? Math.max(1, Math.round(D.n || 1)) : Math.max(1, Math.floor(D.len * 1000 / Math.max(10, D.cc || 150) + 1e-6) + 1); };
const l3rbGroupSpacing = g => { const D = g.dist || {}, n = l3rbGroupCount(g); if (n <= 1) return 0; return D.mode === "n" ? D.len / (n - 1) : (D.cc || 150) / 1000; };
function l3rbExpandGroup(g) {
  const info = l3rbShapeInfo(g.shape, g.dims, g.d); if (!info) return []; const F = l3rbFrame(g), V = l3rbDistVec(g, F), n = l3rbGroupCount(g), sp = l3rbGroupSpacing(g), out = [], O = g.origin;
  const base = info.path.map(p => [O[0] + F.ex[0] * p[0] + F.ey[0] * p[1], O[1] + F.ex[1] * p[0] + F.ey[1] * p[1], O[2] + F.ex[2] * p[0] + F.ey[2] * p[1]]);
  for (let i = 0; i < n; i++) { const o = i * sp; out.push({ d: g.d, shape: info.def.name, code: g.shape, dims: l3rbDimsOf(info.def, g.dims), closed: false, abs: true, len: info.cut, bends: info.bends, mark: g.mark || "G", grp: g.id, pts: base.map(p => [p[0] + V[0] * o, p[1] + V[1] * o, p[2] + V[2] * o]) }); }
  return out;
}
function l3rbNewGroup(shape, origin, over) {
  const def = l3rbShapeDef(shape) || l3rbShapeDef("R"), g = { id: l3rbNewId(), shape: def.id, d: l3rb.cur.d || 12, dims: { ...def.def }, origin: origin.map(l3rbR), yaw: 0, tilt: 0, flip: false, dist: { mode: "cc", cc: l3rb.cur.cc || 150, n: 1, len: 0, dir: "" }, mark: "G", cover: { top: 35, bot: 35, side: 35, end: 35 } };
  return Object.assign(g, over || {});
}
/* ---- Täckande betongskikt: fäst och passa in mot elementets låda -------------------------------------------------------------------- */
function l3rbToLocal(o, p) { const dx = p[0] - o.cx, dy = p[1] - o.cy, c = Math.cos(-o.yaw), s = Math.sin(-o.yaw); return [dx * c - dy * s + o.L / 2, dx * s + dy * c + o.B / 2, p[2] - o.z0]; }
/* Fäster en punkt (stångens mitt) mot täckskiktet (täckskikt + Ø/2 från sidorna) om den är inom tol meter; returnerar { p, snapped:[axlar] }. */
function l3rbSnapCover(o, p, d, cover, tol = 0.06) {
  const q = l3rbToLocal(o, p), r = d / 2000, cv = cover || {}, snapped = []; const ax = [[0, o.L, cv.end, "längd"], [1, o.B, cv.side, "sida"], [2, o.H, 0, "höjd"]];
  const lim = [[(cv.end || 0) / 1000 + r, o.L - (cv.end || 0) / 1000 - r, "ände"], [(cv.side || 0) / 1000 + r, o.B - (cv.side || 0) / 1000 - r, "sida"], [(cv.bot || 0) / 1000 + r, o.H - (cv.top || 0) / 1000 - r, "höjd"]];
  lim.forEach(([lo, hi, nm], i) => { if (Math.abs(q[i] - lo) <= tol) { q[i] = lo; snapped.push(nm + " ↓"); } else if (Math.abs(q[i] - hi) <= tol) { q[i] = hi; snapped.push(nm + " ↑"); } });
  const w = l3rbWorld(o, q[0], q[1], q[2]); return { p: w, snapped };
}
/* Passar in gruppen i värden: stången från täckskikt till täckskikt längs sin riktning (om den är parallell med en kant) och fördelningen över elementets bredd/höjd. */
function l3rbFitGroup(g, o) {
  const F = l3rbFrame(g), U = [Math.cos(o.yaw), Math.sin(o.yaw), 0], Vv = [-Math.sin(o.yaw), Math.cos(o.yaw), 0], dot = (a, b) => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]), cv = g.cover || {}, r = g.d / 2000, def = l3rbShapeDef(g.shape);
  const axis = (v) => dot(v, U) > 0.9 ? "u" : dot(v, Vv) > 0.9 ? "v" : dot(v, [0, 0, 1]) > 0.9 ? "w" : null, A = axis(F.ex), ext = { u: [o.L, cv.end || 0, cv.end || 0], v: [o.B, cv.side || 0, cv.side || 0], w: [o.H, cv.bot || 0, cv.top || 0] };
  const loc = l3rbToLocal(o, g.origin), idx = { u: 0, v: 1, w: 2 }; const msgs = [];
  if (A && def.letters[0] === "A" && (g.shape === "R" || g.shape === "H")) { const [L, c0, c1] = ext[A], lo = c0 / 1000 + r, hi = L - c1 / 1000 - r; const sign = (F.ex[idx[A]] > 0 || (A === "u" && dot(F.ex, U) && (F.ex[0] * U[0] + F.ex[1] * U[1]) > 0) || (A === "v" && (F.ex[0] * Vv[0] + F.ex[1] * Vv[1]) > 0) || (A === "w" && F.ex[2] > 0)) ? 1 : -1; const len = hi - lo - (g.shape === "H" ? l3rbShapeDef("H").seg({}, g.d)[0][0] / 1000 : 0); loc[idx[A]] = sign > 0 ? lo : hi; g.dims.A = Math.max(50, Math.round(len * 1000)); msgs.push("längd"); }
  const dv = l3rbDistVec(g, F), B = axis(dv); if (B) { const [L, c0, c1] = ext[B], lo = c0 / 1000 + r, hi = L - c1 / 1000 - r; const sg = ((B === "u" ? dv[0] * U[0] + dv[1] * U[1] : B === "v" ? dv[0] * Vv[0] + dv[1] * Vv[1] : dv[2]) > 0) ? 1 : -1; loc[idx[B]] = sg > 0 ? lo : hi; g.dist = { ...(g.dist || {}), len: Math.max(0, hi - lo), dir: g.dist && g.dist.dir || "" }; msgs.push("fördelning"); }
  g.origin = l3rbWorld(o, loc[0], loc[1], loc[2]).map(l3rbR); return msgs;
}

/* ---- Handtag i 3D (som Teklas): insättningspunkt, fördelningens slut och formens hörn ------------------------------------------------- */
const l3rbV3 = a => new THREE.Vector3(a[0] - l3.O[0], a[1] - l3.O[1], a[2] - l3.O[2]);
function l3rbGroupOf(set, id) { return set && (set.groups || []).find(g => g.id === (id || l3rb.gActive)); }
function l3rbActiveGroup() { const set = l3rb.sets.find(s => s.id === l3rb.active); return { set, g: l3rbGroupOf(set, l3rb.gActive) }; }
function l3rbClearHandles() {
  if (l3rb.hGroup) { l3.scene.remove(l3rb.hGroup); l3rb.hGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); l3rb.hGroup = null; l3rb.hMeshes = []; }
}
function l3rbHandles() {
  l3rbClearHandles(); const { set, g } = l3rbActiveGroup(); if (!g || !l3rb.el) { l3Render(); return; } const grp = new THREE.Group(), meshes = [], F = l3rbFrame(g), info = l3rbShapeInfo(g.shape, g.dims, g.d); if (!info) return;
  const cam = l3.camera.position, mk = (pos, kind, col, size, extra) => { const dist = Math.max(1, cam.distanceTo(l3rbV3(pos))), s = dist * size, m = new THREE.Mesh(kind === "dist" ? new THREE.BoxGeometry(s, s, s) : new THREE.SphereGeometry(s * 0.6, 14, 10), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.95 })); m.position.copy(l3rbV3(pos)); m.renderOrder = 70; m.userData.h = { kind, ...extra }; meshes.push(m); grp.add(m); return m; };
  mk(g.origin, "origin", 0xf59e0b, 0.018, {});
  const V = l3rbDistVec(g, F), len = (g.dist && g.dist.len) || 0; const endP = [g.origin[0] + V[0] * len, g.origin[1] + V[1] * len, g.origin[2] + V[2] * len]; mk(endP, "dist", 0x2563eb, 0.02, {});
  if (len > 0) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([l3rbV3(g.origin), l3rbV3(endP)]), new THREE.LineDashedMaterial({ color: 0x2563eb, dashSize: 0.08, gapSize: 0.05, depthTest: false })); l.computeLineDistances(); l.renderOrder = 69; l.raycast = () => {}; grp.add(l); }
  const def = info.def; if (def.seg && !def.pts) { const segs = def.seg(Object.assign({}, g.dims), g.d); info.sharp.forEach((p, i) => { if (i === 0) return; const sg = segs[i - 1]; if (!sg || typeof sg[0] !== "string") return; const w = [g.origin[0] + F.ex[0] * p[0] + F.ey[0] * p[1], g.origin[1] + F.ex[1] * p[0] + F.ey[1] * p[1], g.origin[2] + F.ex[2] * p[0] + F.ey[2] * p[1]]; mk(w, "vert", 0xffffff, 0.012, { i, letter: sg[0], prev: info.sharp[i - 1] }); }); }
  // täckskiktets gräns (innanför elementet)
  if (set && set.obb && g.cover) { const o = set.obb, c = g.cover, lo = [(c.end || 0) / 1000, (c.side || 0) / 1000, (c.bot || 0) / 1000], hi = [o.L - (c.end || 0) / 1000, o.B - (c.side || 0) / 1000, o.H - (c.top || 0) / 1000]; if (hi[0] > lo[0] && hi[1] > lo[1] && hi[2] > lo[2]) { const C = []; for (const x of [lo[0], hi[0]]) for (const y of [lo[1], hi[1]]) for (const z of [lo[2], hi[2]]) C.push(l3rbV3(l3rbWorld(o, x, y, z))); const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]], pts = []; E.forEach(([a, b]) => pts.push(C[a], C[b])); const bx = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x16a34a, dashSize: 0.1, gapSize: 0.06, transparent: true, opacity: 0.8, depthTest: false })); bx.computeLineDistances(); bx.renderOrder = 68; bx.raycast = () => {}; grp.add(bx); } }
  grp.userData.noHit = true; l3.scene.add(grp); l3rb.hGroup = grp; l3rb.hMeshes = meshes; l3Render();
}
function l3rbRay(e) { const r = l3.renderer.domElement.getBoundingClientRect(), rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), l3.camera); return rc.ray; }
/* Närmaste punkt på linjen (P0 + t·D) till strålen – ger t (m). */
function l3rbLineParam(ray, P0, D) { const w0 = P0.clone().sub(ray.origin), a = D.dot(D), b = D.dot(ray.direction), c = ray.direction.dot(ray.direction), d = D.dot(w0), e = ray.direction.dot(w0), den = a * c - b * b; return Math.abs(den) < 1e-9 ? 0 : (b * e - c * d) / den; }
function l3rbHandleDown(e) {
  if (!l3rb.el || !l3rb.hMeshes || !l3rb.hMeshes.length || e.button !== 0 || e.target !== l3.renderer.domElement) return; const ray = l3rbRay(e), hits = new THREE.Raycaster(ray.origin, ray.direction).intersectObjects(l3rb.hMeshes, false); if (!hits.length) return;
  const { set, g } = l3rbActiveGroup(); if (!g) return; e.stopImmediatePropagation(); e.preventDefault(); const h = hits[0].object.userData.h, F = l3rbFrame(g), V = l3rbDistVec(g, F), start = { kind: h.kind, g, set, h, origin0: g.origin.slice(), dims0: { ...g.dims }, len0: (g.dist && g.dist.len) || 0 };
  if (h.kind === "origin") { start.z = g.origin[2] - l3.O[2]; } else if (h.kind === "dist") { start.P0 = l3rbV3(g.origin); start.D = new THREE.Vector3(...V).normalize(); start.t0 = l3rbLineParam(ray, start.P0, start.D); }
  else if (h.kind === "vert") { const prev = h.prev, cur = l3rbShapeInfo(g.shape, g.dims, g.d).sharp[h.i], dx = cur[0] - prev[0], dy = cur[1] - prev[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L; const dir = [F.ex[0] * ux + F.ey[0] * uy, F.ex[1] * ux + F.ey[1] * uy, F.ex[2] * ux + F.ey[2] * uy]; start.D = new THREE.Vector3(...dir).normalize(); start.P0 = l3rbV3([g.origin[0] + F.ex[0] * cur[0] + F.ey[0] * cur[1], g.origin[1] + F.ex[1] * cur[0] + F.ey[1] * cur[1], g.origin[2] + F.ex[2] * cur[0] + F.ey[2] * cur[1]]); start.t0 = l3rbLineParam(ray, start.P0, start.D); }
  l3rbHist(); l3rb.hd = start; l3.orbit.enabled = false; window.addEventListener("pointermove", l3rbHandleMove, true); window.addEventListener("pointerup", l3rbHandleUp, true); window.addEventListener("pointercancel", l3rbHandleUp, true);
}
function l3rbHandleMove(e) {
  const d = l3rb.hd; if (!d) return; e.stopImmediatePropagation(); const ray = l3rbRay(e), g = d.g;
  if (d.kind === "origin") {
    const p = new THREE.Vector3(); let ok;
    if (e.shiftKey) { const n = l3.camera.getWorldDirection(new THREE.Vector3()); n.z = 0; if (n.lengthSq() < 1e-6) n.set(1, 0, 0); n.normalize(); ok = ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, l3rbV3(d.origin0)), p); } else ok = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -d.z), p);
    if (!ok) return; let w = [p.x + l3.O[0], p.y + l3.O[1], p.z + l3.O[2]], msg = "";
    if (l3rb.snapCover !== false && d.set && d.set.obb) { const r = l3rbSnapCover(d.set.obb, w, g.d, g.cover); w = r.p; if (r.snapped.length) msg = "Fäst mot täckskikt: " + r.snapped.join(", "); }
    g.origin = w.map(l3rbR); if (msg) l3Status(msg);
  } else if (d.kind === "dist") {
    const t = l3rbLineParam(ray, d.P0, d.D); let len = Math.max(0, d.len0 + (t - d.t0)); if (g.dist && g.dist.mode !== "n" && !e.altKey) { const cc = (g.dist.cc || 150) / 1000; len = Math.round(len / cc) * cc; } g.dist = { ...(g.dist || {}), len: l3rbR(len) };
  } else if (d.kind === "vert") {
    const t = l3rbLineParam(ray, d.P0, d.D), delta = (t - d.t0) * 1000; let v = Math.round(((d.dims0[d.h.letter] != null ? d.dims0[d.h.letter] : 0) + delta) / (e.altKey ? 1 : 10)) * (e.altKey ? 1 : 10); g.dims = { ...g.dims, [d.h.letter]: Math.max(0, v) };
  }
  l3rbRefreshGroup(d.set); l3rbSyncFields();
}
function l3rbHandleUp() { window.removeEventListener("pointermove", l3rbHandleMove, true); window.removeEventListener("pointerup", l3rbHandleUp, true); window.removeEventListener("pointercancel", l3rbHandleUp, true); if (l3rb.hd) { l3rb.hd = null; l3.orbit.enabled = true; l3rbSave(); l3rbRender(); } }
function l3rbRefreshGroup(set) { delete set._bars; l3rbDraw(set.id); l3rbHandles(); }

/* ---- Miniatyr, formeditor och panelens delar ---------------------------------------------------------------------------------------------- */
function l3rbThumb(shapeId, w = 54, h = 34, dims, d = 12) {
  const info = l3rbShapeInfo(shapeId, dims, d); if (!info) return ""; const P = info.path; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; P.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
  const sx = x1 - x0 || 1e-3, sy = y1 - y0 || 1e-3, k = Math.min((w - 8) / sx, (h - 8) / sy), ox = (w - sx * k) / 2, oy = (h - sy * k) / 2, pts = P.map(p => `${(ox + (p[0] - x0) * k).toFixed(1)},${(h - oy - (p[1] - y0) * k).toFixed(1)}`).join(" ");
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
const l3rbNum = v => (Math.round(Number(v) * 100) / 100).toString().replace(".", ",");
function l3rb2Html(act) {
  const shapes = l3rbShapeList(), sel = l3rb.shape && l3rbShapeDef(l3rb.shape) ? l3rb.shape : "R", def = l3rbShapeDef(sel), dims = { ...def.def, ...(l3rb.shapeDims && l3rb.shapeDims.id === sel ? l3rb.shapeDims.v : {}) }, d = l3rb.cur.d || 12, info = l3rbShapeInfo(sel, dims, d);
  const grid = shapes.map(s => `<button type="button" data-rb2="shape" data-id="${l3rbEsc(s.id)}" class="${s.id === sel ? "on" : ""}" title="${l3rbEsc(s.name)}"><span style="display:block;line-height:0">${l3rbThumb(s.id, 54, 34, null, d)}</span><span class="t">${l3rbEsc(s.id.length > 6 ? s.name.slice(0, 7) : s.id)}</span></button>`).join("");
  const dimF = def.letters.map(k => `<label class="f"><span>${k}</span><input data-rb2dim="${k}" type="text" inputmode="decimal" value="${Math.round(Number(dims[k]) || 0)}"> mm</label>`).join("");
  const dSel = [6, 8, 10, 12, 16, 20, 25, 32].map(v => `<option ${v === d ? "selected" : ""}>${v}</option>`).join("");
  const kg = info ? info.cut * l3rbKgm(d) : 0;
  const ed = l3rb.ed, edHtml = ed ? `<div class="t"><b>Ny egen form</b> – sträckor och vridning (vänster = +). Bokstäver A, B, C … blir måtten.</div>
     <label class="f"><span>Namn</span><input id="rb2_edname" type="text" value="${l3rbEsc(ed.name)}" style="width:170px"></label>
     ${ed.segs.map((s, i) => `<div class="r"><b style="width:18px">${L3RB_ALPHA[i]}</b><input data-rb2ed="len" data-i="${i}" type="text" inputmode="decimal" value="${s.len}" style="width:70px"> mm<input data-rb2ed="turn" data-i="${i}" type="text" inputmode="decimal" value="${s.turn}" style="width:60px" ${i === ed.segs.length - 1 ? "disabled" : ""}> °<button type="button" data-rb2="edrm" data-i="${i}" ${ed.segs.length < 2 ? "disabled" : ""}>✕</button></div>`).join("")}
     <div class="r"><span style="color:#2563eb">${l3rbEdPreview()}</span></div><div class="r"><button type="button" data-rb2="edadd">+ Sträcka</button><button type="button" class="p" data-rb2="edsave">Spara formen</button><button type="button" data-rb2="edcancel">Avbryt</button></div>`
    : `<div class="r"><button type="button" data-rb2="ednew">Ny egen form…</button>${l3rbCustom().length ? `<span class="t">Egna: ${l3rbCustom().map(s => `${l3rbEsc(s.name || s.id)} <a href="#" data-rb2="eddel" data-id="${l3rbEsc(s.id)}" style="color:#b91c1c">✕</a>`).join(", ")}</span>` : ""}</div>`;
  const { set, g } = l3rbActiveGroup(); let grp = "";
  if (act && act.kind === "manual") {
    const list = (act.groups || []).map(x => { const df = l3rbShapeDef(x.shape); return `<div class="set ${x.id === l3rb.gActive ? "on" : ""}" data-gid="${x.id}"><span style="color:#475569;line-height:0">${l3rbThumb(x.shape, 34, 22, x.dims, x.d)}</span><b data-rb2="gpick" title="${l3rbEsc(df ? df.name : x.shape)}">${l3rbEsc(df ? df.name : x.shape)} Ø${x.d} ×${l3rbGroupCount(x)}</b></div>`; }).join("") || `<div class="t">Inga stavgrupper än – välj en form och tryck <b>Lägg i modellen</b>.</div>`;
    let fields = "";
    if (g) {
      const gi = l3rbShapeDef(g.shape), D = g.dist || {}, cv = g.cover || {}, cnt = l3rbGroupCount(g), gin = l3rbShapeInfo(g.shape, g.dims, g.d), N = (id, lab, v, u = "", w = 78) => `<label class="f"><span>${lab}</span><input data-rb2g="${id}" type="text" inputmode="decimal" value="${typeof v === "number" ? l3rbNum(v) : v}" style="width:${w}px"> ${u}</label>`;
      fields = `<div class="t" style="margin-top:6px"><b>${l3rbEsc(gi.name)}</b> · utvecklad längd ${l3rbF(gin.cut, 2)} m · ${gin.bends} böjar · ${l3rbF(gin.cut * l3rbKgm(g.d), 2)} kg/st · totalt ${cnt} st</div>
      <label class="f"><span>Form</span><select data-rb2g="shape" style="width:150px">${l3rbShapeList().map(s => `<option value="${l3rbEsc(s.id)}" ${s.id === g.shape ? "selected" : ""}>${l3rbEsc(s.name.slice(0, 22))}</option>`).join("")}</select></label>
      <div class="r">${gi.letters.map(k => `<label class="f" style="margin:0"><span>${k}</span><input data-rb2gd="${k}" type="text" inputmode="decimal" value="${Math.round(Number(g.dims[k]) || 0)}" style="width:62px"></label>`).join("")}</div>
      ${N("d", "Diameter Ø", g.d, "mm")}${N("yaw", "Riktning (gr)", g.yaw || 0)}${N("tilt", "Plan lutning (gr)", g.tilt || 0)}
      <label class="f"><span>Spegla</span><input data-rb2g="flip" type="checkbox" ${g.flip ? "checked" : ""} style="width:auto"></label>
      <div class="t" style="margin-top:4px"><b>Fördelning</b> (som Teklas stavgrupp)</div>
      <label class="f"><span>Läge</span><select data-rb2g="mode" style="width:150px"><option value="cc" ${D.mode !== "n" ? "selected" : ""}>c/c och längd</option><option value="n" ${D.mode === "n" ? "selected" : ""}>antal och längd</option></select></label>
      ${D.mode === "n" ? N("n", "Antal", D.n || 1) : N("cc", "c/c", D.cc || 150, "mm")}${N("len", "Fördelad längd", D.len || 0, "m")}
      <label class="f"><span>Riktning</span><select data-rb2g="dir" style="width:190px">${Object.keys(L3RB_DIRS).map(k => `<option value="${k}" ${(D.dir || (Math.abs(g.tilt || 0) > 45 ? "y" : "n")) === k ? "selected" : ""}>${L3RB_DIRS[k]}</option>`).join("")}</select></label>
      <div class="t" style="margin-top:4px"><b>Täckande betongskikt</b> (mm, mot elementets sidor)</div>
      <div class="r">${N("cov_bot", "Under", cv.bot || 0, "", 50)}${N("cov_top", "Över", cv.top || 0, "", 50)}${N("cov_side", "Sidor", cv.side || 0, "", 50)}${N("cov_end", "Ändar", cv.end || 0, "", 50)}</div>
      <label class="f"><span>Fäst mot täckskikt vid drag</span><input data-rb2g="snap" type="checkbox" ${l3rb.snapCover !== false ? "checked" : ""} style="width:auto"></label>
      <div class="t">Origo: ${g.origin.map(v => l3rbNum(v)).join(" / ")} · dra de orange/blå/vita handtagen i 3D (Skift = lodrätt, Alt = millimeter).</div>
      <div class="r"><button type="button" data-rb2="fit">Passa in i elementet</button><button type="button" data-rb2="dup">Duplicera</button><button type="button" data-rb2="gdel" class="bad">Ta bort</button></div>`;
    }
    grp = `<details data-k="gr" open><summary>Stavgrupper (${(act.groups || []).length})</summary>${list}${fields}</details>`;
  }
  return `<details data-k="fo"><summary>Former och stavar</summary><div class="t">Välj form, ange mått och lägg den i modellen. Därefter justerar du med handtag eller siffror. Mått = skärning mitt stång (mm).</div>
    <div class="r" style="gap:4px">${grid}</div><div class="t"><b>${l3rbEsc(def.name)}</b>${info ? ` · utvecklad längd ${l3rbF(info.cut, 2)} m · ${info.bends} böjar · ${l3rbF(kg, 2)} kg/st` : ""}</div>
    <div class="r">${dimF}</div><label class="f"><span>Diameter Ø</span><select id="rb2_d">${dSel}</select> mm</label>
    <div class="r"><button type="button" class="p" data-rb2="place">Lägg i modellen</button></div>${edHtml}</details>${grp}`;
}
function l3rbEdPreview() {
  const ed = l3rb.ed; if (!ed) return ""; let h = 0, x = 0, y = 0; const P = [[0, 0]]; ed.segs.forEach((s, i) => { const L = (Number(s.len) || 0) / 1000; x += Math.cos(h) * L; y += Math.sin(h) * L; P.push([x, y]); h += (Number(s.turn) || 0) * Math.PI / 180; });
  const sx = Math.max(...P.map(p => p[0])) - Math.min(...P.map(p => p[0])) || 1e-3, sy = Math.max(...P.map(p => p[1])) - Math.min(...P.map(p => p[1])) || 1e-3, w = 220, hh = 90, k = Math.min((w - 16) / sx, (hh - 16) / sy), x0 = Math.min(...P.map(p => p[0])), y0 = Math.min(...P.map(p => p[1]));
  return `<svg width="${w}" height="${hh}" style="background:#f8fafc;border-radius:8px"><polyline points="${P.map(p => `${(8 + (p[0] - x0) * k).toFixed(1)},${(hh - 8 - (p[1] - y0) * k).toFixed(1)}`).join(" ")}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
/* Fyller siffrorna i fälten medan man drar (utan att bygga om panelen). */
function l3rbSyncFields() {
  const el = l3rb.el; if (!el) return; const { g } = l3rbActiveGroup(); if (!g) return; const set = (sel, v) => { const i = el.querySelector(sel); if (i && document.activeElement !== i) i.value = v; };
  set('[data-rb2g="len"]', l3rbNum((g.dist && g.dist.len) || 0)); Object.keys(g.dims).forEach(k => set(`[data-rb2gd="${k}"]`, Math.round(g.dims[k])));
}
function l3rbTouch(set) { delete set._bars; l3rbDraw(set.id); if (l3rb.gActive) l3rbHandles(); l3rbSave(); }
function l3rbGroupSet(g, k, v) {
  const n = Number(String(v).replace(",", ".")); const num = Number.isFinite(n) ? n : 0;
  if (k === "shape") { const def = l3rbShapeDef(v); if (def) { g.shape = def.id; g.dims = { ...def.def }; } } else if (k === "d") g.d = Math.max(4, Math.min(40, num)); else if (k === "yaw") g.yaw = num; else if (k === "tilt") g.tilt = num; else if (k === "flip") g.flip = !!v;
  else if (k === "mode") g.dist = { ...(g.dist || {}), mode: v }; else if (k === "cc") g.dist = { ...(g.dist || {}), cc: Math.max(10, num) }; else if (k === "n") g.dist = { ...(g.dist || {}), n: Math.max(1, Math.round(num)) }; else if (k === "len") g.dist = { ...(g.dist || {}), len: Math.max(0, num) }; else if (k === "dir") g.dist = { ...(g.dist || {}), dir: v };
  else if (k.startsWith("cov_")) g.cover = { ...(g.cover || {}), [k.slice(4)]: Math.max(0, num) };
}
function l3rb2Change(e) {
  const t = e.target, { set, g } = l3rbActiveGroup();
  if (t.id === "rb2_d") { l3rb.cur.d = Number(t.value) || 12; return l3rbRender(); }
  if (t.dataset.rb2dim) { l3rb.shapeDims = l3rb.shapeDims && l3rb.shapeDims.id === l3rb.shape ? l3rb.shapeDims : { id: l3rb.shape || "R", v: {} }; l3rb.shapeDims.v[t.dataset.rb2dim] = Number(String(t.value).replace(",", ".")) || 0; return l3rbRender(); }
  if (t.dataset.rb2ed) { const s = l3rb.ed.segs[Number(t.dataset.i)]; s[t.dataset.rb2ed] = Number(String(t.value).replace(",", ".")) || 0; return l3rbRender(); } if (t.id === "rb2_edname") { l3rb.ed.name = t.value; return; }
  if (!set || !g) return;
  if (t.dataset.rb2gd) { g.dims = { ...g.dims, [t.dataset.rb2gd]: Number(String(t.value).replace(",", ".")) || 0 }; l3rbTouch(set); return l3rbRender(); }
  if (t.dataset.rb2g === "snap") { l3rb.snapCover = t.checked; return; }
  if (t.dataset.rb2g) { l3rbGroupSet(g, t.dataset.rb2g, t.type === "checkbox" ? t.checked : t.value); l3rbTouch(set); return l3rbRender(); }
}
function l3rb2Click(e) {
  const b = e.target.closest("[data-rb2]"); if (!b || b.disabled) return; if (b.tagName === "A") e.preventDefault(); const a = b.dataset.rb2, { set, g } = l3rbActiveGroup();
  if (a === "shape") { l3rb.shape = b.dataset.id; l3rb.shapeDims = null; return l3rbRender(); }
  if (a === "place") return l3rbPlaceGroup();
  if (a === "gpick") { l3rb.gActive = b.closest("[data-gid]").dataset.gid; l3rbHandles(); return l3rbRender(); }
  if (a === "gdel" && set && g) { l3rbHist(); set.groups = set.groups.filter(x => x !== g); l3rb.gActive = null; l3rbClearHandles(); l3rbTouch(set); return l3rbRender(); }
  if (a === "dup" && set && g) { const c = JSON.parse(JSON.stringify(g)); c.id = l3rbNewId(); const F = l3rbFrame(g), V = l3rbDistVec(g, F), off = 0.3; c.origin = c.origin.map((v, i) => l3rbR(v + (i === 2 ? 0 : (F.side[i] || 0) * off))); set.groups.push(c); l3rb.gActive = c.id; l3rbTouch(set); return l3rbRender(); }
  if (a === "fit" && set && g) { const m = l3rbFitGroup(g, set.obb); l3rbTouch(set); l3Status(m.length ? `Passade in ${m.join(" och ")} mot täckskiktet.` : "Stavgruppen ligger inte parallellt med elementets kanter – justera Riktning/Plan lutning först."); return l3rbRender(); }
  if (a === "ednew") { l3rb.ed = { name: "Egen form", segs: [{ len: 600, turn: 90 }, { len: 300, turn: 0 }] }; return l3rbRender(); }
  if (a === "edadd") { const s = l3rb.ed.segs; if (s.length < 12) { s[s.length - 1].turn = 90; s.push({ len: 300, turn: 0 }); } return l3rbRender(); }
  if (a === "edrm") { const i = Number(b.dataset.i); l3rb.ed.segs.splice(i, 1); l3rb.ed.segs[l3rb.ed.segs.length - 1].turn = 0; return l3rbRender(); }
  if (a === "edcancel") { l3rb.ed = null; return l3rbRender(); }
  if (a === "edsave") { const ed = l3rb.ed, id = "E" + (l3rbCustom().length + 1) + "_" + Math.random().toString(36).slice(2, 5), list = [...l3rbCustom(), { id, name: (ed.name || "Egen form").slice(0, 40), segs: ed.segs.map(s => ({ len: Math.max(1, Number(s.len) || 0), turn: Number(s.turn) || 0 })) }]; l3SetPref("rbShapes", list); l3rb.ed = null; l3rb.shape = id; l3Status(`Formen "${list[list.length - 1].name}" sparad.`); return l3rbRender(); }
  if (a === "eddel") { l3SetPref("rbShapes", l3rbCustom().filter(s => s.id !== b.dataset.id)); if (l3rb.shape === b.dataset.id) l3rb.shape = "R"; return l3rbRender(); }
  if (a === "ifc") return l3rbExportIfc(); if (a === "html") return l3rbExportHtml();
}
/* Lägger formen i modellen: vid markerat elements mitt (täckskiktets övre-vänstra hörn) eller vid kamerans mål; handtagen visas direkt. */
function l3rbPlaceGroup() {
  const shape = l3rb.shape || "R", dims = { ...l3rbShapeDef(shape).def, ...(l3rb.shapeDims && l3rb.shapeDims.id === shape ? l3rb.shapeDims.v : {}) };
  let set = l3rb.sets.find(s => s.id === l3rb.active && s.kind === "manual"); if (!set) { const base = l3rb.sets.find(s => s.id === l3rb.active) || null, sel = l3rb.sel[0]; const o = base ? base.obb : sel ? l3rbObb(sel.pts) : null; set = { id: l3rbNewId(), kind: "manual", name: base ? `Manuell: ${base.name}`.slice(0, 80) : sel ? `Manuell: ${sel.name}`.slice(0, 80) : "Manuell armering", type: base ? base.type : "platta", obb: o || { cx: l3.orbit.target.x + l3.O[0], cy: l3.orbit.target.y + l3.O[1], yaw: 0, L: 1, B: 1, z0: l3.orbit.target.z + l3.O[2], H: 1 }, params: {}, bars: [], groups: [], el: base ? base.el : {}, created_at: new Date().toISOString() }; l3rb.sets.push(set); l3rb.active = set.id; }
  set.groups = set.groups || []; const o = set.obb, hostKnown = !!(o && o.L > 0), cov = 35, c = cov / 1000, d = l3rb.cur.d || 12, at = hostKnown ? l3rbWorld(o, c + d / 2000, c + d / 2000, c + d / 2000) : [l3.orbit.target.x + l3.O[0], l3.orbit.target.y + l3.O[1], l3.orbit.target.z + l3.O[2]];
  const g = l3rbNewGroup(shape, at, { dims, d, yaw: hostKnown ? o.yaw * 180 / Math.PI : 0, cover: { top: cov, bot: cov, side: cov, end: cov } }); if (hostKnown && l3rbShapeDef(shape).letters.length && shape === "R") g.dims.A = Math.max(100, Math.round((o.L - 2 * c - d / 1000) * 1000));
  g.tilt = shape === "R" ? 90 : 0; if (hostKnown && shape === "R") { g.dist = { mode: "cc", cc: l3rb.cur.cc || 150, n: 1, len: Math.max(0, o.B - 2 * c - d / 1000), dir: "y" }; } set.groups.push(g); l3rb.gActive = g.id; l3rbTouch(set); l3rbRender(); l3Status("Stavgrupp placerad – dra handtagen i 3D eller ändra i panelen.");
}

/* ---- Export: IFC (IfcReinforcingBar), förteckning (HTML/PDF) ------------------------------------------------------------------------------------ */
function l3rbIfcBuild(sets, fileName) {
  if (typeof ifcDoc !== "function") throw new Error("IFC-skrivaren saknas.");
  const doc = ifcDoc("Armering (experimentell)", "Armeringsförslag – ej dimensionerat", "4D-planering Lägesplan – armering"), E = doc.E, elems = [], style = doc.style("rb", "#f59e0b", "Armering");
  let nBars = 0; const LIM = 30000;
  sets.forEach(set => {
    if (set.hide) return; const bars = l3rbSetWorld(set); if (!bars.length) return; const org = [set.obb.cx, set.obb.cy, set.obb.z0], pl = doc.place(org);
    bars.forEach((b, i) => {
      if (nBars >= LIM) return; nBars++; const rel = b.w.map(p => [p[0] - org[0], p[1] - org[1], p[2] - org[2]]); if (b.closed) rel.push(rel[0]);
      const dir = E(`IFCPOLYLINE((${rel.map(p => E(`IFCCARTESIANPOINT(${ifcPt(p)})`)).join(",")}))`), disk = E(`IFCSWEPTDISKSOLID(${dir},${ifcNum(b.d / 2000)},$,$,$)`); E(`IFCSTYLEDITEM(${disk},(${style}),$)`);
      const rep = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${E(`IFCSHAPEREPRESENTATION(${doc.body},'Body','AdvancedSweptSolid',(${disk}))`)}))`);
      const lig = /^(B|BU|O)$/.test(b.code || ""), area = Math.PI * Math.pow(b.d / 2000, 2), el = E(`IFCREINFORCINGBAR('${ifcGuid()}',$,${ifcStr(`Ø${b.d} ${b.code || b.shape || ""} ${i + 1}`)},${ifcStr(set.name)},$,${pl},${rep},${ifcStr(b.mark || "")},'B500B',${ifcNum(b.d / 1000)},${ifcNum(area)},${ifcNum(b.len)},${lig ? ".LIGATURE." : ".MAIN."},$)`);
      doc.props(el, [["Diameter mm", b.d], ["Form", b.code || b.shape || ""], ["Mått mm", b.dims || ""], ["Utvecklad längd m", Math.round(b.len * 1000) / 1000], ["Vikt kg", Math.round(b.len * l3rbKgm(b.d) * 1000) / 1000], ["Set", set.name], ["Status", "Förslag – ej dimensionerat (experimentell)"]], "Armering"); elems.push(el);
    });
  });
  if (!elems.length) return null; return { text: doc.finish(elems, fileName), n: elems.length, capped: nBars >= LIM };
}
async function l3rbExportIfc() {
  const sets = l3rb.sets.filter(s => !s.hide); if (!sets.length) { l3Status("Det finns ingen armering att exportera.", true); return; }
  const name = `Armering ${l3rbStamp()}.ifc`; let r; try { r = l3rbIfcBuild(sets, name); } catch (err) { l3Status("Kunde inte skriva IFC: " + err.message, true); return; } if (!r) { l3Status("Inga stavar att exportera.", true); return; }
  const file = new File([new TextEncoder().encode(r.text)], name, { type: "application/x-step" });
  try {
    if (typeof askOpener === "function" && window.opener && !window.opener.closed) { busyProgress("rbifc", `Sparar ${name}`, 0.3); const up = await askOpener("tcUpload", { folder: "Lägesplan", files: [file] }, 10 * 60 * 1000); busyProgress("rbifc", "", null); l3Toast(`${r.n} stavar sparade som IfcReinforcingBar i Trimble Connect: ${name}${up && up.folder ? ` (${up.folder})` : ""}.`, null, null, 9000); }
    else { l3rbDl(name, file); l3Toast(`${r.n} stavar hämtade som IFC (${name}).${r.capped ? " Max 30 000 stavar per fil." : ""}`, null, null, 8000); }
  } catch (err) { busyProgress("rbifc", "", null); l3rbDl(name, file); l3Status("Kunde inte spara i Trimble Connect – filen hämtades till datorn: " + err.message, true); }
}
function l3rbSketch(code, dims, d) { const info = l3rbShapeInfo(code, (() => { const o = {}; String(dims || "").split(" ").forEach(t => { const m = /^([A-Z])(\d+)$/.exec(t); if (m) o[m[1]] = Number(m[2]); }); return o; })(), d); if (!info) return ""; return l3rbThumb(code, 120, 60, (() => { const o = {}; String(dims || "").split(" ").forEach(t => { const m = /^([A-Z])(\d+)$/.exec(t); if (m) o[m[1]] = Number(m[2]); }); return o; })(), d); }
function l3rbHtmlText(sets) {
  const proj = (typeof projectName !== "undefined" && projectName) || "", dt = new Date().toLocaleString("sv-SE"), rows = []; let kgTot = 0;
  sets.forEach(s => { const sm = l3rbSummary(l3rbSetBars(s)); kgTot += sm.kg; rows.push(`<tr class="set"><td colspan="9">${l3rbEsc(s.name)}</td></tr>`); sm.rows.forEach(r => rows.push(`<tr><td>${r.pos}</td><td>${l3rbSketch(r.code || "R", r.dims, r.d)}</td><td>${l3rbEsc(r.code || r.shape || "")}</td><td>${l3rbEsc(r.dims || "")}</td><td>${r.d}</td><td>${r.n}</td><td>${l3rbF(r.len, 2)}</td><td>${l3rbF(r.tot, 1)}</td><td>${l3rbF(r.kg, 1)}</td></tr>`)); rows.push(`<tr class="sum"><td colspan="5">Summa ${l3rbEsc(s.name)}</td><td>${sm.n}</td><td></td><td>${l3rbF(sm.length, 1)}</td><td>${l3rbF(sm.kg, 1)}</td></tr>`); });
  return `<!doctype html><html lang="sv"><meta charset="utf-8"><title>Armeringsförteckning</title><style>body{font:12px system-ui,sans-serif;margin:24px;color:#0f172a}h1{font-size:18px;margin:0}.w{background:#fffbeb;border:1px solid #fde68a;color:#92400e;padding:8px 10px;border-radius:8px;margin:10px 0}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #e2e8f0;padding:4px 6px;text-align:right}th:nth-child(-n+4),td:nth-child(-n+4){text-align:left}tr.set td{background:#f1f5f9;font-weight:700;text-align:left}tr.sum td{font-weight:700}svg{color:#0f172a}</style><h1>Armeringsförteckning</h1><div>${l3rbEsc(proj)} · ${dt}</div><div class="w"><b>Experimentell.</b> Armeringen är ett förslag enligt enkla regler – inte dimensionerad. Konstruktörens handlingar gäller. Mått: skärning mitt stång (mm). Böjdorn 4·Ø (Ø ≤ 16) / 7·Ø.</div><table><tr><th>Pos</th><th>Skiss</th><th>Form</th><th>Mått mm</th><th>Ø</th><th>Antal</th><th>Längd m</th><th>Σ m</th><th>kg</th></tr>${rows.join("")}<tr class="sum"><td colspan="8">TOTALT</td><td>${l3rbF(kgTot, 1)}</td></tr></table></html>`;
}
function l3rbExportHtml() { const sets = l3rb.sets.filter(s => !s.hide); if (!sets.length) { l3Status("Det finns ingen armering att skriva ut.", true); return; } l3rbDl(`Armeringsförteckning ${l3rbStamp()}.html`, new Blob([l3rbHtmlText(sets)], { type: "text/html;charset=utf-8" })); l3Toast("Armeringsförteckningen (HTML) nedladdad – öppna den och skriv ut som PDF."); }

/* ---- Markera i 3D, ta bort, flytta och ångra (Victor 2026-11-01: "jag måste kunna markera armeringen och ta bort och justera") ------------- */
l3rb.hist = []; l3rb.pick = null;
function l3rbHist() { try { l3rb.hist.push(JSON.stringify(l3rb.sets, (k, v) => (k[0] === "_" ? undefined : v))); if (l3rb.hist.length > 40) l3rb.hist.shift(); } catch (e) { /* */ } }
function l3rbUndo() {
  const s = l3rb.hist.pop(); if (!s) { l3Status("Inget att ångra i armeringen."); return false; }
  l3rb.sets = JSON.parse(s); if (!l3rb.sets.some(x => x.id === l3rb.active)) l3rb.active = null; l3rb.gActive = null; l3rb.pick = null; l3rbClearHandles(); l3rbHlClear(); l3rbDraw(); l3rbSave(); l3rbRender(); l3Status("Ångrade senaste armeringsändringen."); return true;
}
const l3rbPickSet = () => l3rb.pick && l3rb.sets.find(s => s.id === l3rb.pick.setId);
function l3rbHlClear() { if (l3rb.hl) { l3.scene.remove(l3rb.hl); l3rb.hl.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); l3rb.hl = null; } }
function l3rbHlDraw() {
  l3rbHlClear(); const p = l3rb.pick, set = l3rbPickSet(); if (!p || !set) { l3Render(); return; }
  const W = l3rbSetWorld(set), nb = (set.bars || []).length; let sel;
  if (p.gid) sel = W.filter(b => b.grp === p.gid); else if (set.kind === "manual") sel = W[p.bi] ? [W[p.bi]] : []; else { const h = W[p.bi]; sel = h ? W.filter(b => b.mark === h.mark && b.d === h.d).slice(0, 2500) : []; }
  if (!sel.length) { l3Render(); return; }
  const g = l3rbTubes(sel.map(b => ({ ...b, d: b.d + 8 })), l3.O); g.traverse(o => { if (o.material) { o.material.color.set(0xf97316); o.material.depthTest = false; o.material.transparent = true; o.material.opacity = 0.85; o.renderOrder = 65; } });
  g.userData.noHit = true; l3.scene.add(g); l3rb.hl = g; l3Render();
}
function l3rbSetPick(p) {
  l3rb.pick = p; if (p) { l3rb.active = p.setId; l3rb.gActive = p.gid || null; if (p.gid) l3rbHandles(); else l3rbClearHandles(); } l3rbHlDraw(); l3rbRender();
}
/* Närmaste stav under pekaren (i bildpunkter). Returnerar { setId, gid?, bi } eller null. */
function l3rbPickAt(cx, cy) {
  const r = l3.renderer.domElement.getBoundingClientRect(), cam = l3.camera, v = new THREE.Vector3(), tol = 10; let best = null;
  const proj = w => { v.set(w[0] - l3.O[0], w[1] - l3.O[1], w[2] - l3.O[2]).project(cam); return [(v.x + 1) / 2 * r.width + r.left, (1 - v.y) / 2 * r.height + r.top, v.z]; };
  for (const set of l3rb.sets) {
    if (set.hide) continue; const W = l3rbSetWorld(set);
    for (let bi = 0; bi < W.length; bi++) {
      const b = W[bi], P = b.w.map(proj), n = P.length, m = b.closed ? n : n - 1;
      for (let i = 0; i < m; i++) {
        const A = P[i], B = P[(i + 1) % n]; if (A[2] > 1 && B[2] > 1) continue;
        const dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy, t = L2 > 1e-6 ? Math.max(0, Math.min(1, ((cx - A[0]) * dx + (cy - A[1]) * dy) / L2)) : 0, d = Math.hypot(cx - (A[0] + dx * t), cy - (A[1] + dy * t));
        if (d <= tol) { const z = A[2] + (B[2] - A[2]) * t, sc = d + z * 4; if (!best || sc < best.sc) best = { sc, setId: set.id, gid: b.grp || null, bi }; }
      }
    }
  }
  return best && { setId: best.setId, gid: best.gid, bi: best.bi };
}
let l3rbPd = null;
function l3rbPickDown(e) {
  if (!l3rb.el || e.button !== 0 || e.target !== l3.renderer.domElement || l3rb.draw || l3rb.hd) return;
  l3rbPd = { x: e.clientX, y: e.clientY, t: performance.now() };
  const up = u => { window.removeEventListener("pointerup", up, true); const d = l3rbPd; l3rbPd = null; if (!d || Math.hypot(u.clientX - d.x, u.clientY - d.y) > 5 || performance.now() - d.t > 600 || l3rb.hd) return; const h = l3rbPickAt(u.clientX, u.clientY); if (h) l3rbSetPick(h); else if (l3rb.pick) l3rbSetPick(null); };
  window.addEventListener("pointerup", up, true);
}
/* Vad är markerat? */
function l3rbPickInfo() {
  const p = l3rb.pick, set = l3rbPickSet(); if (!p || !set) return null;
  if (p.gid) { const g = (set.groups || []).find(x => x.id === p.gid); return g ? { kind: "group", set, g } : null; }
  if (set.kind === "manual") { const b = (set.bars || [])[p.bi]; return b ? { kind: "bar", set, b } : null; }
  const b = l3rbSetBars(set)[p.bi]; return b ? { kind: "auto", set, b } : null;
}
function l3rbPickDelete() {
  const I = l3rbPickInfo(); if (!I) return false;
  if (I.kind === "auto") { l3Toast("Autoarmerade stavar går inte att ta bort en och en.", "Gör manuell", () => { l3rbHist(); l3rbFreeze(I.set); l3rbSetPick(null); l3Status("Setet är nu manuellt – markera en stav och tryck Delete."); }, 9000); return true; }
  l3rbHist();
  if (I.kind === "group") { I.set.groups = I.set.groups.filter(x => x !== I.g); l3rb.gActive = null; l3rbClearHandles(); } else I.set.bars.splice(l3rb.pick.bi, 1);
  l3rb.pick = null; l3rbHlClear(); l3rbTouch(I.set); l3rbRender(); l3Status("Armeringen borttagen – Ctrl+Z ångrar."); return true;
}
function l3rbPickMove(dx, dy, dz, mm) {
  const I = l3rbPickInfo(); if (!I || I.kind === "auto") return false; const f = new THREE.Vector3(); l3.camera.getWorldDirection(f); f.z = 0; if (f.lengthSq() < 1e-6) f.set(0, 1, 0); f.normalize();
  const r = { x: f.y, y: -f.x }, s = mm / 1000, d = [(r.x * dx + f.x * dy) * s, (r.y * dx + f.y * dy) * s, dz * s];
  const now = performance.now(); if (!l3rb.mvT || now - l3rb.mvT > 1200) l3rbHist(); l3rb.mvT = now;
  if (I.kind === "group") I.g.origin = I.g.origin.map((v, i) => l3rbR(v + d[i])); else I.b.pts = I.b.pts.map(p => p.map((v, i) => l3rbR(v + d[i])));
  l3rbTouch(I.set); l3rbHlDraw(); return true;
}
function l3rbPickDia(dm) {
  const I = l3rbPickInfo(); if (!I || I.kind === "auto") return; l3rbHist(); if (I.kind === "group") I.g.d = dm; else I.b.d = dm; l3rbTouch(I.set); l3rbHlDraw(); l3rbRender();
}
/* Tangenter (anropas ur l3Key via l3rbKey): Delete/Backspace tar bort, pilar flyttar, PageUp/Down höjd, Esc släpper, Ctrl+Z ångrar. */
function l3rbKey2(e) {
  if (!l3rb.el || l3rb.draw) return false; const tg = e.target && e.target.tagName; if (tg === "INPUT" || tg === "SELECT" || tg === "TEXTAREA") return false;
  const k = e.key, mod = e.ctrlKey || e.metaKey;
  if (mod && (k === "z" || k === "Z") && !e.shiftKey && l3rb.hist.length) { e.preventDefault(); l3rbUndo(); return true; }
  if (!l3rb.pick) return false;
  if (k === "Delete" || k === "Backspace") { e.preventDefault(); return l3rbPickDelete(); }
  if (k === "Escape") { e.preventDefault(); l3rbSetPick(null); return true; }
  const base = l3rb.step || 10, mm = e.shiftKey ? base * 10 : e.altKey ? 1 : base, M = { ArrowLeft: [-1, 0, 0], ArrowRight: [1, 0, 0], ArrowUp: [0, 1, 0], ArrowDown: [0, -1, 0], PageUp: [0, 0, 1], PageDown: [0, 0, -1] }[k];
  if (M) { e.preventDefault(); return l3rbPickMove(M[0], M[1], M[2], mm); }
  return false;
}
function l3rbPickHtml() {
  const I = l3rbPickInfo(); if (!I) return `<div class="t">Klicka på en armeringsstav i 3D för att markera den – Delete tar bort, pilar flyttar.${l3rb.hist.length ? ` <button type="button" data-rb2="pundo">Ångra</button>` : ""}</div>`;
  const nm = I.kind === "group" ? `Stavgrupp: ${(l3rbShapeDef(I.g.shape) || {}).name || I.g.shape} Ø${I.g.d} ×${l3rbGroupCount(I.g)}` : I.kind === "bar" ? `Stav Ø${I.b.d}` : `Autoarmering: ${I.b.mark || ""} Ø${I.b.d}`;
  const dsel = I.kind === "auto" ? "" : `<select data-rb2="pdia" title="Diameter">${[6, 8, 10, 12, 16, 20, 25, 32].map(v => `<option ${v === (I.kind === "group" ? I.g.d : I.b.d) ? "selected" : ""}>${v}</option>`).join("")}</select>`;
  const mv = I.kind === "auto" ? `<button type="button" data-rb2="pfreeze" title="Frys setet så att stavarna går att ändra en och en">Gör manuell</button>` : `<span class="mv"><button type="button" data-rb2="pmv" data-m="-1,0,0">◀</button><button type="button" data-rb2="pmv" data-m="1,0,0">▶</button><button type="button" data-rb2="pmv" data-m="0,1,0">▲</button><button type="button" data-rb2="pmv" data-m="0,-1,0">▼</button><button type="button" data-rb2="pmv" data-m="0,0,1">⤒</button><button type="button" data-rb2="pmv" data-m="0,0,-1">⤓</button></span> <input id="rb_step" type="text" inputmode="numeric" value="${l3rb.step || 10}" style="width:44px" title="Steg i mm"> mm`;
  return `<div class="kpi" style="display:block;border:1px solid #f97316;background:#fff7ed;border-radius:8px;padding:6px 8px;margin:6px 0"><b style="color:#c2410c">Markerat: ${l3rbEsc(nm)}</b><div class="r" style="margin-top:4px">${mv}</div><div class="r">${dsel}<button type="button" data-rb2="pdel" class="bad">Ta bort (Delete)</button>${l3rb.hist.length ? `<button type="button" data-rb2="pundo">Ångra (Ctrl+Z)</button>` : ""}<button type="button" data-rb2="pesc">Släpp</button></div></div>`;
}
const l3rb2ClickBase = l3rb2Click;
l3rb2Click = function (e) {
  const b = e.target.closest("[data-rb2]"); if (b && !b.disabled) {
    const a = b.dataset.rb2;
    if (a === "pdel") { l3rbPickDelete(); return; } if (a === "pundo") { l3rbUndo(); return; } if (a === "pesc") { l3rbSetPick(null); return; }
    if (a === "pfreeze") { const I = l3rbPickInfo(); if (I) { l3rbHist(); l3rbFreeze(I.set); l3rbSetPick(null); } return; }
    if (a === "pmv") { const st = document.getElementById("rb_step"), n = Math.max(1, Math.min(2000, Number(String(st && st.value).replace(",", ".")) || 10)); l3rb.step = n; const m = b.dataset.m.split(",").map(Number); l3rbPickMove(m[0], m[1], m[2], n); l3rbRender(); return; }
    if (a === "pdia") return;
  }
  if (typeof l3rb2ClickBase === "function") return l3rb2ClickBase(e);
};
const l3rb2ChangeBase = l3rb2Change;
l3rb2Change = function (e) { const t = e.target; if (t.dataset && t.dataset.rb2 === "pdia") { l3rbPickDia(Number(t.value)); return; } return l3rb2ChangeBase(e); };

/* Genväg från objektets panel: öppna Armering och generera för den markerade betongdelen (Victor 2026-11-12). */
document.addEventListener("click", async e => { const b = e.target.closest && e.target.closest("[data-armera]"); if (!b) return; e.stopPropagation(); await l3rbOpen(); l3rb.sel = l3rbSelection(); if (!l3rb.sel.length) { l3Status("Markera en betongdel först.", true); return; } const r = l3rbGenerateAll(); l3Status(r.ok ? `Armering genererad för ${r.ok} objekt – justera i Armering-panelen.` : "Det gick inte att generera armering: " + ((r.fails[0] && r.fails[0].r && r.fails[0].r.err) || "okänt fel"), !r.ok); }, true);
