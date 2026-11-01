/* Armering – experimentell funktion (Victor 2026-11-01: "armeringsmodul där man både kan armera manuellt och en som armerar automatiskt baserat på schablon/erfarenhetsmässig info … autoarmering, och om det krånglar får jag över på manuell").
   ⚠ EXPERIMENTELL OCH INTE DIMENSIONERAD: autoarmeringen följer enkla regler (täckskikt, diameter, centrumavstånd) och är ett FÖRSLAG för mängder, planering och visualisering.
   Konstruktörens handlingar gäller alltid. Allt som skapas märks så i panelen och i exporterna.

   • Underlag: markerade IFC-objekt (eller ritade/placerade objekt) – en orienterad låda (OBB) räknas ut ur punkterna, och elementtypen gissas ur IFC-klass och mått.
   • Autoarmering för plattor, sulor, väggar, balkar och pelare (nät/rader, bygel, skarvar vid 12 m stänger). Resultatet: stavar i 3D, mängdlista, kg och kg/m³ jämfört med schablon.
   • Schablon och erfarenhet: kg/m³ per elementtyp (egna värden) – verkligt uttag kan läggas in och blir medel för nästa gång.
   • Manuell armering: rita stavar i 3D, kopiera i serie, bygel runt elementet – och "Gör manuell" tar över en autoarmering för att ändra den.
   • Export: mängd-/bockningslista (CSV) och DXF. Sätten sparas i projektet (rebar_sets.json). */
const l3rb = { sets: [], loaded: false, group: null, el: null, saveT: 0, sel: [], active: null, draw: null, cur: { d: 12, cc: 150 } };
const L3RB_TYPES = { platta: "Platta", sula: "Sula/plint", vagg: "Vägg", balk: "Balk", pelare: "Pelare" };
/* Exempelvärden för schablon (kg/m³) – ersätt med era egna. */
const L3RB_SCH0 = { platta: 100, sula: 70, vagg: 80, balk: 170, pelare: 200 };
const L3RB_COVER = { "Inomhus, torr (XC1)": 20, "Utomhus, fuktig (XC3/XC4)": 35, "Mot mark (XC2)": 40, "Aggressiv miljö (XD/XS/XF)": 50 };
const L3RB_COL = { 6: "#64748b", 8: "#0ea5e9", 10: "#22c55e", 12: "#f59e0b", 16: "#ef4444", 20: "#a855f7", 25: "#14b8a6", 32: "#ec4899" };
const L3RB_ALPHA_ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const l3rbKgm = d => 0.00617 * d * d;           // kg per meter stång (d i mm)
const l3rbR = v => Math.round(v * 1000) / 1000;
const l3rbF = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });
const l3rbEsc = s => (typeof escHtml === "function" ? escHtml(String(s)) : String(s));

/* ---- Geometri: orienterad låda i planet ------------------------------------------------------------------------------------------ */
function l3rbHull(P) {
  const p = P.map(q => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p; const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  p.forEach(q => { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return lo.concat(up);
}
/* Minsta rektangel (roterande skjutmått) runt punkterna i planet + höjdspannet: { cx, cy, yaw, L, B, z0, H } med L ≥ B (yaw = långsidans riktning, radianer). */
function l3rbObb(pts) {
  if (!pts || pts.length < 3) return null; let zmin = Infinity, zmax = -Infinity; pts.forEach(p => { if (p[2] < zmin) zmin = p[2]; if (p[2] > zmax) zmax = p[2]; });
  const H = l3rbHull(pts); if (H.length < 3) return null; let best = null;
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), c = Math.cos(-ang), s = Math.sin(-ang); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    H.forEach(q => { const x = q[0] * c - q[1] * s, y = q[0] * s + q[1] * c; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; });
    const area = (x1 - x0) * (y1 - y0); if (!best || area < best.area - 1e-9) best = { area, ang, x0, x1, y0, y1 };
  }
  let { ang, x0, x1, y0, y1 } = best, L = x1 - x0, B = y1 - y0; const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, cx = mx * Math.cos(ang) - my * Math.sin(ang), cy = mx * Math.sin(ang) + my * Math.cos(ang);   // centrum tillbaka i planet
  if (B > L) { [L, B] = [B, L]; ang += Math.PI / 2; }   // långsidan alltid L
  const cxy = [cx, cy];
  return { cx: l3rbR(cxy[0]), cy: l3rbR(cxy[1]), yaw: ang, L: l3rbR(L), B: l3rbR(B), z0: l3rbR(zmin), H: l3rbR(zmax - zmin) };
}
/* Elementtyp ur IFC-klass och mått. */
function l3rbGuess(cls, o) {
  const c = String(cls || "").toUpperCase(), minP = Math.min(o.L, o.B), maxP = Math.max(o.L, o.B);
  if (/FOOTING|PILE/.test(c)) return "sula"; if (/COLUMN/.test(c)) return "pelare"; if (/BEAM|MEMBER/.test(c)) return "balk"; if (/WALL/.test(c)) return "vagg"; if (/SLAB|PLATE|ROOF|COVERING|FLOOR/.test(c)) return o.H > 0.6 && o.z0 < 0.5 ? "sula" : "platta";
  if (maxP <= 1.4 && o.H >= 1.4 * maxP) return "pelare"; if (o.H <= 0.6 * minP && o.H <= 1.1) return o.H >= 0.6 && minP > 1.5 ? "sula" : "platta";
  if (minP <= 0.7 && o.H >= 1.0 && maxP > 2 * minP) return o.H > maxP * 0.8 ? "vagg" : "balk"; if (minP <= 0.7 && o.L > 3 * o.B) return "balk"; return o.H <= minP ? "platta" : "vagg";
}
/* Punkter (modellkoordinater) från markerade objekt. */
function l3rbSelection() {
  const out = [], O = l3.O, v = new THREE.Vector3();
  if (typeof l3bs !== "undefined" && l3bs.sel.length) l3bs.sel.slice(0, 40).forEach(e => {
    const P = e.mesh.geometry.getAttribute("position").array, r = e.mesh.userData.l3b.ranges[e.ri], pts = []; e.mesh.updateMatrixWorld(true); const step = Math.max(1, Math.floor(r.count / 4000));
    for (let i = r.start; i < r.start + r.count; i += step) { v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(e.mesh.matrixWorld); pts.push([v.x + O[0], v.y + O[1], v.z + O[2]]); }
    const tris = []; try { if (typeof l3bsIdx === "function" && e.mesh.userData.l3b.origIdx) { const [st, cnt] = l3bsIdx(e.mesh, e.ri), I = e.mesh.userData.l3b.origIdx, nT = Math.floor(cnt / 3), stepT = Math.max(1, Math.ceil(nT / 30000)); for (let t = 0; t < nT; t += stepT) for (let k = 0; k < 3; k++) { const vi = I[st + t * 3 + k]; v.set(P[vi * 3], P[vi * 3 + 1], P[vi * 3 + 2]).applyMatrix4(e.mesh.matrixWorld); tris.push(v.x + O[0], v.y + O[1], v.z + O[2]); } } } catch (err) { /* utan trianglar: inga öppningar */ }
    out.push({ name: r.name || "IFC-objekt", cls: r.cls || r.ifcClass || "", guid: r.guid || "", src: "ifc", pts, tris });
  });
  if (!out.length && l3.sel && l3.sel.size) [...l3.sel].slice(0, 20).forEach(id => {
    const p = placements.find(q => q.id === id), g = l3.placeMeshes.get(id); if (!p || !g) return; const pts = []; g.updateMatrixWorld(true);
    const tris = []; g.traverse(o => { if (!o.isMesh || !o.visible || !o.geometry || o.userData.noHit) return; const a = o.geometry.getAttribute("position"); if (!a) return; const step = Math.max(1, Math.floor(a.count / 3000)); for (let i = 0; i < a.count; i += step) { v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld); pts.push([v.x + O[0], v.y + O[1], v.z + O[2]]); }
      const I = o.geometry.index, nT = I ? Math.floor(I.count / 3) : Math.floor(a.count / 3), sT = Math.max(1, Math.ceil(nT / 20000)); for (let t = 0; t < nT; t += sT) for (let k = 0; k < 3; k++) { const vi = I ? I.getX(t * 3 + k) : t * 3 + k; v.fromBufferAttribute(a, vi).applyMatrix4(o.matrixWorld); tris.push(v.x + O[0], v.y + O[1], v.z + O[2]); } });
    out.push({ name: p.name || "Objekt", cls: p.m ? "" : "", guid: "", src: "place", pid: id, pts, tris });
  });
  return out;
}

/* Öppningar ur elementets form: trianglarna rastreras (plattor: planet, väggar: väggens sida). Rutor som ingen triangel täcker och som inte hänger ihop med kanten är hål;
   väggar får även hål som når ned till golvet (dörrar). Returnerar rektanglar i elementets koordinater: plattor { u0, u1, v0, v1 }, väggar { u0, u1, w0, w1 }. */
function l3rbOpenings(sel, o, type) {
  if (!sel || !sel.tris || sel.tris.length < 9 || !o || (type !== "platta" && type !== "sula" && type !== "vagg")) return [];
  const wall = type === "vagg", W = o.L, Hh = wall ? o.H : o.B, cs = Math.max(0.04, Math.min(0.25, Math.max(W, Hh) / 220)), nx = Math.max(2, Math.ceil(W / cs)), ny = Math.max(2, Math.ceil(Hh / cs)), grid = new Uint8Array(nx * ny), T = sel.tris;
  for (let t = 0; t + 8 < T.length; t += 9) {
    const q = [0, 1, 2].map(k => { const l = l3rbToLocal(o, [T[t + k * 3], T[t + k * 3 + 1], T[t + k * 3 + 2]]); return [l[0], wall ? l[2] : l[1]]; });
    const x0 = Math.max(0, Math.floor(Math.min(q[0][0], q[1][0], q[2][0]) / cs)), x1 = Math.min(nx - 1, Math.floor(Math.max(q[0][0], q[1][0], q[2][0]) / cs)), y0 = Math.max(0, Math.floor(Math.min(q[0][1], q[1][1], q[2][1]) / cs)), y1 = Math.min(ny - 1, Math.floor(Math.max(q[0][1], q[1][1], q[2][1]) / cs));
    const den = (q[1][1] - q[2][1]) * (q[0][0] - q[2][0]) + (q[2][0] - q[1][0]) * (q[0][1] - q[2][1]); if (Math.abs(den) < 1e-12) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const px = (x + 0.5) * cs, py = (y + 0.5) * cs, a = ((q[1][1] - q[2][1]) * (px - q[2][0]) + (q[2][0] - q[1][0]) * (py - q[2][1])) / den, b = ((q[2][1] - q[0][1]) * (px - q[2][0]) + (q[0][0] - q[2][0]) * (py - q[2][1])) / den, c = 1 - a - b, e = -1e-6; if (a >= e && b >= e && c >= e) grid[y * nx + x] = 1; }
  }
  const seen = new Uint8Array(nx * ny), st = []; const seed = (x, y) => { const i = y * nx + x; if (!grid[i] && !seen[i]) { seen[i] = 1; st.push(i); } };
  for (let x = 0; x < nx; x++) { seed(x, ny - 1); if (!wall) seed(x, 0); } for (let y = 0; y < ny; y++) { seed(0, y); seed(nx - 1, y); }
  while (st.length) { const i = st.pop(), x = i % nx, y = (i / nx) | 0; [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < nx && Y < ny) seed(X, Y); }); }
  const out = [], comp = new Uint8Array(nx * ny);
  for (let i0 = 0; i0 < nx * ny; i0++) {
    if (grid[i0] || seen[i0] || comp[i0]) continue; let x0 = nx, x1 = 0, y0 = ny, y1 = 0, n = 0; const s2 = [i0]; comp[i0] = 1;
    while (s2.length) { const i = s2.pop(), x = i % nx, y = (i / nx) | 0; n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < nx && Y < ny) { const j = Y * nx + X; if (!grid[j] && !seen[j] && !comp[j]) { comp[j] = 1; s2.push(j); } } }); }
    const a0 = x0 * cs, a1 = (x1 + 1) * cs, b0 = y0 * cs, b1 = (y1 + 1) * cs; if ((a1 - a0) * (b1 - b0) < 0.04 || n * cs * cs > 0.6 * W * Hh) continue;
    out.push(wall ? { u0: l3rbR(a0), u1: l3rbR(a1), w0: l3rbR(b0), w1: l3rbR(b1) } : { u0: l3rbR(a0), u1: l3rbR(a1), v0: l3rbR(b0), v1: l3rbR(b1) });
  }
  return out.slice(0, 40);
}
/* ---- Autoarmering ----------------------------------------------------------------------------------------------------------------- */
const l3rbParamsDefault = type => ({ cover: 35, exposure: "Utomhus, fuktig (XC3/XC4)", dMain: 12, ccMain: 150, dTop: 12, ccTop: 150, top: type === "platta", dVert: 12, ccVert: 200, dHor: 10, ccHor: 200, dLong: 20, nBot: 3, nTop: 2, dStirr: 10, ccStirr: 200, dCol: 20, nCol: 8, dColSt: 10, ccColSt: 250, maxLen: 12, edge: type === "platta" || type === "sula" || type === "vagg", dEdge: 10, ccEdge: 200, legEdge: 500, edgeBar: type !== "vagg", openings: true, cornerBars: type === "platta", doubleNet: true, thick: 0.4, support: false, dense: true, sideBars: true });
/* Stång som rak linje (u0..u1) i riktning dir ("u"|"v"|"w") med läge (a, b) i de andra två koordinaterna; delas vid maxLen med överlapp (skarv 50·Ø). */
function l3rbStraight(out, d, dir, a, b, from, to, maxLen, mark) {
  const lap = 0.05 * d, len = to - from; if (len <= 0.02) return; const pieces = []; if (len <= maxLen) pieces.push([from, to]); else { let s = from; while (s < to - 1e-6) { const e = Math.min(to, s + maxLen); pieces.push([s, e]); if (e >= to) break; s = e - lap; } }
  pieces.forEach(([s, e]) => { const P = dir === "u" ? [[s, a, b], [e, a, b]] : dir === "v" ? [[a, s, b], [a, e, b]] : [[a, b, s], [a, b, e]]; out.push({ d, shape: "rak", code: "R", dims: "A" + Math.round((e - s) * 1000), closed: false, pts: P, len: e - s, dir, mark }); });
}
function l3rbStirrup(out, d, u, v0, v1, w0, w1, mark, dirAxis) {   // bygel i planet vinkelrätt mot axeln dirAxis ("u" = i v–w-planet vid läget u; "w" = i u–v-planet vid höjden u)
  const hook = 2 * Math.max(10 * d / 1000, 0.1); let P; if (dirAxis === "u") P = [[u, v0, w0], [u, v1, w0], [u, v1, w1], [u, v0, w1]]; else P = [[v0, w0, u], [v1, w0, u], [v1, w1, u], [v0, w1, u]];
  const A = Math.round((v1 - v0) * 1000), Bm = Math.round((w1 - w0) * 1000), info = typeof l3rbShapeInfo === "function" ? l3rbShapeInfo("B", { A, B: Bm }, d) : null;
  const len = info ? info.cut : 2 * ((v1 - v0) + (w1 - w0)) + hook; out.push({ d, shape: "bygel", code: "B", dims: `A${A} B${Bm}`, closed: true, pts: P, len, dir: dirAxis, mark });
}
const l3rbSpread = (from, to, cc) => { const n = Math.max(1, Math.floor((to - from) / cc) + 1), out = []; const used = (n - 1) * cc, off = (to - from - used) / 2; for (let i = 0; i < n; i++) out.push(from + off + i * cc); return out; };
function l3rbGenerate(type, o, P, holes) {
  const bars = [], c = P.cover / 1000, ML = P.maxLen, L = o.L, B = o.B, H = o.H; if (L < 0.1 || B < 0.05 || H < 0.05) return bars; holes = (P.openings === false ? [] : holes) || [];
  const m = c;   // marginal runt öppningar: stängerna kapas c från öppningens kant
  /* Stång längs dir med läge (a, b) – kapas där öppningar ligger i vägen. */
  const cuts = (dir, a, b) => { const out = []; holes.forEach(h => { if (type === "vagg") { if (dir === "u" && b >= h.w0 - m && b <= h.w1 + m) out.push([h.u0 - m, h.u1 + m]); else if (dir === "w" && a >= h.u0 - m && a <= h.u1 + m) out.push([h.w0 - m, h.w1 + m]); } else { if (dir === "u" && a >= h.v0 - m && a <= h.v1 + m) out.push([h.u0 - m, h.u1 + m]); else if (dir === "v" && a >= h.u0 - m && a <= h.u1 + m) out.push([h.v0 - m, h.v1 + m]); } }); return out.sort((x, y) => x[0] - y[0]); };
  const str = (d, dir, a, b, from, to, mark) => { const cs = cuts(dir, a, b); let s0 = from; cs.forEach(([lo, hi]) => { if (hi <= s0) return; if (lo > s0) { if (lo - s0 >= 0.25) l3rbStraight(bars, d, dir, a, b, s0, Math.min(lo, to), ML, mark); } s0 = Math.max(s0, hi); }); if (to - s0 >= 0.25) l3rbStraight(bars, d, dir, a, b, s0, to, ML, mark); };
  const addU = (pts, dims, mark = "K") => { const info = typeof l3rbShapeInfo === "function" ? l3rbShapeInfo("U", dims, P.dEdge) : null; bars.push({ d: P.dEdge, shape: "kant-U", code: "U", dims: `A${dims.A} B${dims.B} C${dims.C}`, closed: false, pts, len: info ? info.cut : l3rbPolyLen3(pts), mark }); };
  const free = (d, pts, mark, code = "FRI") => { const segs = []; for (let i = 1; i < pts.length; i++) segs.push(Math.round(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]) * 1000)); bars.push({ d, shape: "rak", code: pts.length > 2 ? code : "R", dims: segs.map((v, i) => "ABCDEFGH"[i] + v).join(" "), closed: false, pts, len: l3rbPolyLen3(pts), mark }); };
  if (type === "platta" || type === "sula") {
    const dm = P.dMain / 1000, ccm = P.ccMain / 1000, thick = (P.doubleNet !== false) && H >= (P.thick || 0.4);
    const wB1 = c + dm / 2, wB2 = c + dm + dm / 2;
    l3rbSpread(c + dm / 2, B - c - dm / 2, ccm).forEach(v => str(P.dMain, "u", v, wB1, c, L - c, "N1"));
    l3rbSpread(c + dm / 2, L - c - dm / 2, ccm).forEach(u => str(P.dMain, "v", u, wB2, c, B - c, "N2"));
    if (thick) { const w3 = c + 2 * dm + dm / 2, w4 = c + 3 * dm + dm / 2; l3rbSpread(c + dm / 2 + ccm / 2, B - c - dm / 2, ccm).forEach(v => str(P.dMain, "u", v, w3, c, L - c, "N3")); l3rbSpread(c + dm / 2 + ccm / 2, L - c - dm / 2, ccm).forEach(u => str(P.dMain, "v", u, w4, c, B - c, "N4")); }
    if (P.top) { const dt = P.dTop / 1000, cct = P.ccTop / 1000, wT1 = H - c - dt / 2, wT2 = H - c - dt - dt / 2;
      l3rbSpread(c + dt / 2, L - c - dt / 2, cct).forEach(u => str(P.dTop, "v", u, wT1, c, B - c, "Ö1"));
      l3rbSpread(c + dt / 2, B - c - dt / 2, cct).forEach(v => str(P.dTop, "u", v, wT2, c, L - c, "Ö2"));
      if (thick) { const wT3 = H - c - 2 * dt - dt / 2, wT4 = H - c - 3 * dt - dt / 2; l3rbSpread(c + dt / 2 + cct / 2, L - c - dt / 2, cct).forEach(u => str(P.dTop, "v", u, wT3, c, B - c, "Ö3")); l3rbSpread(c + dt / 2 + cct / 2, B - c - dt / 2, cct).forEach(v => str(P.dTop, "u", v, wT4, c, L - c, "Ö4")); }
      // upplagsförstärkning: extra överkantsstänger över upplag längs kortsidorna (antagande: upplag vid u = 0 och u = L)
      if (P.support) { const ext = Math.max(1.0, 0.25 * L), wS = wT2 - dt; l3rbSpread(c + dt / 2 + cct / 2, B - c - dt / 2, cct).forEach(v => { str(P.dTop, "u", v, wS, c, Math.min(ext, L / 2), "Ö5"); str(P.dTop, "u", v, wS, Math.max(L - ext, L / 2), L - c, "Ö5"); }); }
      // hörnstänger: snedställda överkantsstänger i plattans hörn (två per hörn)
      if (P.cornerBars && Math.min(L, B) > 1.6) { const k = 0.55, wC = wT2 - dt * 1.5; [[0, 0, 1, 1], [L, 0, -1, 1], [L, B, -1, -1], [0, B, 1, -1]].forEach(([cu, cv, su, sv]) => [0, 1].forEach(i => { const o2 = 0.5 + i * 0.1, cx = cu + su * o2, cy = cv + sv * o2, tx = -sv * Math.SQRT1_2, ty = su * Math.SQRT1_2; free(P.dTop, [[cx - tx * k, cy - ty * k, wC], [cx + tx * k, cy + ty * k, wC]], "HK", "R"); })); }
    }
  } else if (type === "vagg") {
    const dh = P.dHor / 1000, dv = P.dVert / 1000, cch = P.ccHor / 1000, ccv = P.ccVert / 1000;
    [[c + dh / 2, c + dh + dv / 2, "A"], [B - c - dh / 2, B - c - dh - dv / 2, "B"]].forEach(([vh, vv, f]) => {
      l3rbSpread(c + dh / 2, H - c - dh / 2, cch).forEach(w => str(P.dHor, "u", vh, w, c, L - c, "H" + f));
      l3rbSpread(c + dv / 2, L - c - dv / 2, ccv).forEach(u => str(P.dVert, "w", u, vv, c, H - c, "V" + f)); });
  } else if (type === "balk") {
    const dl = P.dLong / 1000, ds = P.dStirr / 1000, e = c + ds + dl / 2, row = (n, w, mk) => { const vs = n <= 1 ? [B / 2] : Array.from({ length: n }, (_, i) => e + (B - 2 * e) * i / (n - 1)); vs.forEach(v => l3rbStraight(bars, P.dLong, "u", v, w, c, L - c, ML, mk)); };
    row(P.nBot, e, "L"); row(P.nTop, H - e, "T");
    // sidoarmering i höga balkar (h > 0,7 m): Ø10 var 250–300 mm på båda sidor
    if (H > 0.7 && P.sideBars !== false) { const ws = l3rbSpread(e + 0.15, H - e - 0.15, 0.3).filter(w => w > e + 0.1 && w < H - e - 0.1); ws.forEach(w => { [c + ds + 0.005, B - c - ds - 0.005].forEach(v => l3rbStraight(bars, 10, "u", v, w, c, L - c, ML, "SB")); }); }
    const ccs = P.ccStirr / 1000, dense = Math.min(Math.max(H, 0.5), L / 3), pos = [];   // tätare bygel (halva c/c) närmast upplagen
    l3rbSpread(c, L - c, ccs).forEach(u => pos.push(u)); if (P.dense !== false) { const extra = []; for (let u = c + ccs / 2; u < dense; u += ccs / 2) { extra.push(u); extra.push(L - u); } extra.forEach(u => { if (!pos.some(q => Math.abs(q - u) < ccs / 4)) pos.push(u); }); }
    pos.sort((x, y) => x - y).forEach(u => l3rbStirrup(bars, P.dStirr, u, c + ds / 2, B - c - ds / 2, c + ds / 2, H - c - ds / 2, "S", "u"));
  } else if (type === "pelare") {
    const dc = P.dCol / 1000, dss = P.dColSt / 1000, e = c + dss + dc / 2, n = P.nCol, pos = [];
    const corners = [[e, e], [L - e, e], [L - e, B - e], [e, B - e]]; corners.forEach(q => pos.push(q));
    const extra = Math.max(0, n - 4); for (let i = 0; i < extra; i++) { const t = (i + 1) / (Math.ceil(extra / 2) + 1); if (i % 2 === 0) pos.push([e + (L - 2 * e) * t, e]); else pos.push([e + (L - 2 * e) * t, B - e]); }
    pos.forEach(q => l3rbStraight(bars, P.dCol, "w", q[0], q[1], c, H - c, ML, "P"));
    const ccw = P.ccColSt / 1000, zone = Math.min(Math.max(L, B, 0.5), H / 3), ws = l3rbSpread(c, H - c, ccw); if (P.dense !== false) { for (let w = c + ccw / 2; w < zone; w += ccw / 2) { [w, H - w].forEach(x => { if (!ws.some(q => Math.abs(q - x) < ccw / 4)) ws.push(x); }); } }
    ws.sort((x, y) => x - y).forEach(w => l3rbStirrup(bars, P.dColSt, w, c + dss / 2, L - c - dss / 2, c + dss / 2, B - c - dss / 2, "S", "w"));
  }
  // Kantarmering: U-stänger runt kanterna (plattor/sulor: alla fyra kanter, väggar: ändarna) med valfria kantstänger inuti
  if (P.edge && (type === "platta" || type === "sula" || type === "vagg")) {
    const de = P.dEdge / 1000, leg = P.legEdge / 1000, cce = P.ccEdge / 1000, e0 = c + de / 2;
    if (type === "vagg") {
      const v1 = e0, v2 = B - e0, web = Math.round((v2 - v1) * 1000), lg = Math.min(leg, L / 3), d3 = { A: Math.round(lg * 1000), B: web, C: Math.round(lg * 1000) };
      l3rbSpread(c + de / 2, H - c - de / 2, cce).forEach(w => { if (!holes.some(h => w >= h.w0 - m && w <= h.w1 + m && (h.u0 < lg + m || h.u1 > L - lg - m))) { addU([[e0 + lg, v1, w], [e0, v1, w], [e0, v2, w], [e0 + lg, v2, w]], d3); addU([[L - e0 - lg, v1, w], [L - e0, v1, w], [L - e0, v2, w], [L - e0 - lg, v2, w]], d3); } else { addU([[e0 + lg, v1, w], [e0, v1, w], [e0, v2, w], [e0 + lg, v2, w]], d3); addU([[L - e0 - lg, v1, w], [L - e0, v1, w], [L - e0, v2, w], [L - e0 - lg, v2, w]], d3); } });
    } else {
      const w1 = e0, w2 = H - e0, web = Math.round((w2 - w1) * 1000), lgU = Math.min(leg, L / 3), lgV = Math.min(leg, B / 3), inset = Math.max(c + 0.1, cce / 2), dV = { A: Math.round(lgV * 1000), B: web, C: Math.round(lgV * 1000) }, dU = { A: Math.round(lgU * 1000), B: web, C: Math.round(lgU * 1000) };
      l3rbSpread(inset, L - inset, cce).forEach(u => { addU([[u, e0 + lgV, w1], [u, e0, w1], [u, e0, w2], [u, e0 + lgV, w2]], dV); addU([[u, B - e0 - lgV, w1], [u, B - e0, w1], [u, B - e0, w2], [u, B - e0 - lgV, w2]], dV); });
      l3rbSpread(inset, B - inset, cce).forEach(v => { addU([[e0 + lgU, v, w1], [e0, v, w1], [e0, v, w2], [e0 + lgU, v, w2]], dU); addU([[L - e0 - lgU, v, w1], [L - e0, v, w1], [L - e0, v, w2], [L - e0 - lgU, v, w2]], dU); });
      if (P.edgeBar) { const eb = e0 + de / 2 + 0.01; [w1 + de / 2 + 0.005, w2 - de / 2 - 0.005].forEach(w => { l3rbStraight(bars, P.dEdge, "u", eb, w, c, L - c, ML, "K2"); l3rbStraight(bars, P.dEdge, "u", B - eb, w, c, L - c, ML, "K2"); l3rbStraight(bars, P.dEdge, "v", eb, w, c, B - c, ML, "K2"); l3rbStraight(bars, P.dEdge, "v", L - eb, w, c, B - c, ML, "K2"); }); }
    }
  }
  // Öppningar: kantarmering runt hålet, snedstänger i hörnen och förlängda kantstänger (hålens läge kommer ur elementets form)
  if (holes.length && (type === "platta" || type === "sula")) {
    const de = P.dEdge / 1000, leg = P.legEdge / 1000, cce = P.ccEdge / 1000, e0 = c + de / 2, w1 = e0, w2 = H - e0, web = Math.round((w2 - w1) * 1000), dd = { A: Math.round(leg * 1000), B: web, C: Math.round(leg * 1000) }, dm = P.dMain / 1000, ext = 0.4;
    holes.forEach(h => {
      const lenV = h.v1 - h.v0, lenU = h.u1 - h.u0;
      l3rbSpread(h.v0 + 0.05, h.v1 - 0.05, cce).forEach(v => { addU([[h.u0 - e0 - leg, v, w1], [h.u0 - e0, v, w1], [h.u0 - e0, v, w2], [h.u0 - e0 - leg, v, w2]], dd, "OK"); addU([[h.u1 + e0 + leg, v, w1], [h.u1 + e0, v, w1], [h.u1 + e0, v, w2], [h.u1 + e0 + leg, v, w2]], dd, "OK"); });
      l3rbSpread(h.u0 + 0.05, h.u1 - 0.05, cce).forEach(u => { addU([[u, h.v0 - e0 - leg, w1], [u, h.v0 - e0, w1], [u, h.v0 - e0, w2], [u, h.v0 - e0 - leg, w2]], dd, "OK"); addU([[u, h.v1 + e0 + leg, w1], [u, h.v1 + e0, w1], [u, h.v1 + e0, w2], [u, h.v1 + e0 + leg, w2]], dd, "OK"); });
      [[h.u0, h.v0, -1, -1], [h.u1, h.v0, 1, -1], [h.u1, h.v1, 1, 1], [h.u0, h.v1, -1, 1]].forEach(([cu, cv, su, sv]) => [c + dm * 1.5, H - c - dm * 1.5].forEach(w => [0, 1].forEach(i => { const o2 = 0.12 + i * 0.08, cx = cu + su * o2, cy = cv + sv * o2, tx = -sv * Math.SQRT1_2, ty = su * Math.SQRT1_2, k = 0.5; free(P.dMain, [[cx - tx * k, cy - ty * k, w], [cx + tx * k, cy + ty * k, w]], "OS", "R"); })));
      [h.v0 - e0 - de, h.v1 + e0 + de].forEach(v => [c + dm * 1.5, H - c - dm * 1.5].forEach(w => l3rbStraight(bars, P.dMain, "u", v, w, Math.max(c, h.u0 - ext), Math.min(L - c, h.u1 + ext), ML, "OF")));
      [h.u0 - e0 - de, h.u1 + e0 + de].forEach(u => [c + dm * 1.5, H - c - dm * 1.5].forEach(w => l3rbStraight(bars, P.dMain, "v", u, w, Math.max(c, h.v0 - ext), Math.min(B - c, h.v1 + ext), ML, "OF")));
    });
  }
  if (holes.length && type === "vagg") {   // dörr-/fönsteröppningar: snedstänger i hörnen och förlängda kantstänger på båda sidor
    const dh = P.dHor / 1000, dv = P.dVert / 1000, ext = 0.5;
    holes.forEach(h => { [c + dh + dv + 0.01, B - c - dh - dv - 0.01].forEach(v => { [[h.u0, h.w0, -1, -1], [h.u1, h.w0, 1, -1], [h.u1, h.w1, 1, 1], [h.u0, h.w1, -1, 1]].forEach(([cu, cw, su, sw]) => { if (cw < 0.05 && sw < 0) return; const o2 = 0.12, cx = cu + su * o2, cz = cw + sw * o2, tx = -sw * Math.SQRT1_2, tz = su * Math.SQRT1_2, k = 0.45; free(P.dHor, [[cx - tx * k, v, cz - tz * k], [cx + tx * k, v, cz + tz * k]], "OS", "R"); });
        [h.w1 + c + dh].forEach(w => l3rbStraight(bars, P.dHor, "u", v, w, Math.max(c, h.u0 - ext), Math.min(L - c, h.u1 + ext), ML, "OF")); if (h.w0 > 0.3) l3rbStraight(bars, P.dHor, "u", v, h.w0 - c - dh, Math.max(c, h.u0 - ext), Math.min(L - c, h.u1 + ext), ML, "OF");
        [h.u0 - c - dv, h.u1 + c + dv].forEach(u => l3rbStraight(bars, P.dVert, "w", u, v, Math.max(c, h.w0 - ext), Math.min(H - c, h.w1 + ext), ML, "OF")); }); });
  }
  return bars;
}
const l3rbPolyLen3 = P => { let s = 0; for (let i = 1; i < P.length; i++) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]); return s; };
/* Lista: staplar av samma Ø, form, längd (cm) och läge-grupp (mark) får ett postnummer. */
function l3rbSummary(bars) {
  const G = new Map(); bars.forEach(b => { const key = [b.d, b.code || b.shape, b.dims || "", Math.round(b.len * 100), b.mark].join("|"); let g = G.get(key); if (!g) { g = { d: b.d, shape: b.shape, code: b.code, dims: b.dims, len: b.len, mark: b.mark, n: 0 }; G.set(key, g); } g.n++; });
  const rows = [...G.values()].sort((a, b) => b.d - a.d || a.mark.localeCompare(b.mark) || b.len - a.len).map((g, i) => ({ pos: i + 1, ...g, tot: g.n * g.len, kg: g.n * g.len * l3rbKgm(g.d) }));
  return { rows, kg: rows.reduce((a, r) => a + r.kg, 0), length: rows.reduce((a, r) => a + r.tot, 0), n: bars.length };
}
const l3rbVolume = o => o.L * o.B * o.H;
function l3rbSchablon(type) { const E = (l3Prefs().rbExp || []).filter(e => e.type === type); const own = l3Prefs().rbSch || {}; if (E.length) return { v: E.reduce((a, e) => a + e.kgm3, 0) / E.length, src: `medel av ${E.length} uttag` }; return { v: Number(own[type]) || L3RB_SCH0[type], src: own[type] ? "egen schablon" : "exempelvärde" }; }
/* ---- Lokal → världskoordinater ------------------------------------------------------------------------------------------------- */
function l3rbWorld(o, u, v, w) { const c = Math.cos(o.yaw), s = Math.sin(o.yaw), du = u - o.L / 2, dv = v - o.B / 2; return [o.cx + du * c - dv * s, o.cy + du * s + dv * c, o.z0 + w]; }
function l3rbSetBars(set) { if (set.kind === "manual") return (set.groups && set.groups.length && typeof l3rbExpandGroup === "function") ? [...(set.bars || []), ...set.groups.flatMap(l3rbExpandGroup)] : (set.bars || []); return set._bars || (set._bars = l3rbGenerate(set.type, set.obb, set.params, set.holes)); }
function l3rbSetWorld(set) { const o = set.obb; return l3rbSetBars(set).map(b => ({ ...b, w: b.pts.map(p => set.kind === "manual" && b.abs ? p : l3rbWorld(o, p[0], p[1], p[2])) })); }

/* ---- 3D: stavar som rör (eller linjer vid mycket stora mängder) ---------------------------------------------------------------- */
function l3rbTubes(world, O) {
  // fyrkantiga rör (8 hörn, 12 trianglar per sträcka) i en enda geometri per färg; färg = diameter
  const byCol = new Map(), q = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3(), up = new THREE.Vector3(0, 0, 1), side = new THREE.Vector3();
  let segs = 0; world.forEach(br => segs += Math.max(1, br.w.length - (br.closed ? 0 : 1))); const tubes = segs <= 60000;
  world.forEach(br => {
    const col = L3RB_COL[br.d] || "#94a3b8"; let rec = byCol.get(col); if (!rec) { rec = { pos: [], lines: [] }; byCol.set(col, rec); }
    const n = br.w.length, m = br.closed ? n : n - 1, r = br.d / 2000;
    for (let i = 0; i < m; i++) {
      const A = br.w[i], Bp = br.w[(i + 1) % n]; a.set(A[0] - O[0], A[1] - O[1], A[2] - O[2]); b.set(Bp[0] - O[0], Bp[1] - O[1], Bp[2] - O[2]);
      if (!tubes) { rec.lines.push(a.x, a.y, a.z, b.x, b.y, b.z); continue; }
      u.copy(b).sub(a); if (u.lengthSq() < 1e-10) continue; u.normalize(); side.crossVectors(u, Math.abs(u.z) > 0.95 ? new THREE.Vector3(1, 0, 0) : up).normalize().multiplyScalar(r); w.crossVectors(u, side).normalize().multiplyScalar(r);
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([s, t]) => [side.x * s + w.x * t, side.y * s + w.y * t, side.z * s + w.z * t]), P = [];
      [a, b].forEach(e => c.forEach(o2 => P.push(e.x + o2[0], e.y + o2[1], e.z + o2[2])));
      const F = [0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]; F.forEach(k => rec.pos.push(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]));
    }
  });
  const g = new THREE.Group();
  byCol.forEach((rec, col) => {
    if (rec.pos.length) { const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(rec.pos, 3)); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide })); m.userData.noHit = true; m.raycast = () => {}; g.add(m); }
    if (rec.lines.length) { const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(rec.lines, 3)); const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: col })); l.userData.noHit = true; l.raycast = () => {}; g.add(l); }
  });
  return g;
}
function l3rbDraw(onlyId) {
  if (!l3 || !l3.scene) return; if (!l3rb.group || l3rb.group.parent !== l3.scene) { l3rb.group = new THREE.Group(); l3rb.group.name = "rebar"; l3rb.group.userData.noHit = true; l3.scene.add(l3rb.group); onlyId = null; }
  const drop = c => { c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); l3rb.group.remove(c); };
  if (onlyId) { const old = l3rb.group.children.find(c => c.userData.setId === onlyId); if (old) drop(old); const set = l3rb.sets.find(s => s.id === onlyId); if (set && !set.hide) { const g = l3rbTubes(l3rbSetWorld(set), l3.O); g.userData.setId = set.id; l3rb.group.add(g); } l3Render(); return; }
  while (l3rb.group.children.length) drop(l3rb.group.children[0]);
  l3rb.sets.forEach(set => { if (set.hide) return; const g = l3rbTubes(l3rbSetWorld(set), l3.O); g.userData.setId = set.id; l3rb.group.add(g); });
  l3Render();
}
/* ---- Skapa, spara ------------------------------------------------------------------------------------------------------------------ */
function l3rbPath() { return typeof dataPath === "function" ? dataPath("rebar_sets.json") : null; }
function l3rbSave() {
  clearTimeout(l3rb.saveT); l3rb.saveT = setTimeout(async () => {
    const path = l3rbPath(); if (!path || typeof ghWriteJSON !== "function" || typeof token === "undefined") return; const out = JSON.parse(JSON.stringify(l3rb.sets, (k, v) => (k[0] === "_" ? undefined : v)));
    try { await ghWriteJSON(token, path, () => out, `Armering (experimentell): ${out.length} set`); } catch (e) { console.warn("Kunde inte spara armering", e); if (typeof l3Status === "function") l3Status("Kunde inte spara armeringen: " + (e && e.message || e), true); }
  }, 900);
}
async function l3rbLoad() {
  if (l3rb.loaded) return; l3rb.loaded = true; const path = l3rbPath(); if (!path || typeof ghReadJSON !== "function" || typeof token === "undefined") return;
  try { const arr = await ghReadJSON(token, path); if (Array.isArray(arr)) l3rb.sets = arr; } catch (e) { /* ingen fil än */ } l3rbDraw();
}
function l3rbNewId() { return typeof ghNewId === "function" ? ghNewId() : "rb" + Math.random().toString(36).slice(2, 10); }
/* Gör ett autoarmeringsset av ett urval (ett element → ett set). Returnerar { set } eller { err }. */
function l3rbFromSelection(sel, overrideType, params) {
  const o = l3rbObb(sel.pts); if (!o) return { err: `Kunde inte läsa formen på "${sel.name}" (för få punkter).` };
  if (o.L < 0.15 || o.B < 0.05 || o.H < 0.05) return { err: `"${sel.name}" är för litet eller platt för att armeras automatiskt (${l3rbF(o.L, 2)}×${l3rbF(o.B, 2)}×${l3rbF(o.H, 2)} m).`, obb: o };
  const type = overrideType || l3rbGuess(sel.cls, o), P = { ...l3rbParamsDefault(type), ...(params || {}) };
  const holes = P.openings === false ? [] : l3rbOpenings(sel, o, type);
  const set = { id: l3rbNewId(), kind: "auto", name: `${L3RB_TYPES[type]}: ${sel.name}`.slice(0, 80), type, obb: o, params: P, holes, el: { name: sel.name, cls: sel.cls || "", guid: sel.guid || "" }, created_at: new Date().toISOString() };
  const bars = l3rbSetBars(set); if (!bars.length) return { err: `Inga stavar kunde skapas för "${sel.name}" – prova en annan elementtyp eller gå över till manuell armering.`, obb: o, type };
  if (bars.length > 40000) return { err: `Mer än 40 000 stavar (${bars.length.toLocaleString("sv-SE")}) – öka centrumavståndet eller armera i delar.`, obb: o, type };
  return { set };
}
function l3rbAdd(set) { l3rb.sets.push(set); l3rb.active = set.id; l3rbDraw(); l3rbSave(); l3rbRender(); }
function l3rbRegen(set, params, type) { if (type) { set.type = type; if (!params) set.params = l3rbParamsDefault(type); } if (params) set.params = { ...set.params, ...params }; delete set._bars; l3rbDraw(); l3rbSave(); l3rbRender(); }
/* "Gör manuell": stavarna fryses i absoluta koordinater så att de går att ändra. */
function l3rbFreeze(set) {
  if (set.kind === "manual") return; const w = l3rbSetWorld(set); set.bars = w.map(b => ({ d: b.d, shape: b.shape, closed: b.closed, len: b.len, mark: b.mark, abs: true, pts: b.w.map(p => p.map(l3rbR)) })); set.kind = "manual"; delete set._bars; l3rbDraw(); l3rbSave(); l3rbRender();
}
function l3rbManualSet(base) {
  let s = l3rb.sets.find(x => x.id === l3rb.active && x.kind === "manual"); if (s) return s;
  s = { id: l3rbNewId(), kind: "manual", name: base ? `Manuell: ${base.name}`.slice(0, 80) : "Manuell armering", type: base ? base.type : "platta", obb: base ? base.obb : { cx: 0, cy: 0, yaw: 0, L: 1, B: 1, z0: 0, H: 1 }, params: {}, bars: [], el: base ? base.el : {}, created_at: new Date().toISOString() }; l3rb.sets.push(s); l3rb.active = s.id; return s;
}
function l3rbLen(pts, closed) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); if (closed && pts.length > 2) s += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1], pts[0][2] - pts[pts.length - 1][2]); return s; }
function l3rbAddBar(set, d, pts, closed) { const n = set.bars.length + 1; const segs = []; for (let i = 1; i < pts.length; i++) segs.push(Math.round(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]) * 1000)); set.bars.push({ d, shape: closed ? "bygel" : pts.length > 2 ? "böj" : "rak", code: pts.length > 2 ? "FRI" : "R", dims: segs.slice(0, 12).map((v, i) => L3RB_ALPHA_[i] + v).join(" "), closed: !!closed, abs: true, pts: pts.map(p => p.map(l3rbR)), len: l3rbLen(pts, closed) + (closed ? 2 * Math.max(10 * d / 1000, 0.1) : 0), mark: "M" }); l3rbDraw(); l3rbSave(); l3rbRender(); }
/* Serie: kopierar senaste staven n gånger med c/c vinkelrätt mot staven i planet (eller lodrätt). */
function l3rbSeries(set, n, ccMm, vertical) {
  const last = set.bars[set.bars.length - 1]; if (!last) return false; const P = last.pts, a = P[0], b = P[Math.min(1, P.length - 1)]; let dx, dy, dz = 0;
  if (vertical) { dx = 0; dy = 0; dz = 1; } else { const ux = b[0] - a[0], uy = b[1] - a[1], L = Math.hypot(ux, uy) || 1; dx = -uy / L; dy = ux / L; }
  for (let i = 1; i <= n; i++) { const off = i * ccMm / 1000; set.bars.push({ ...last, pts: P.map(p => [l3rbR(p[0] + dx * off), l3rbR(p[1] + dy * off), l3rbR(p[2] + dz * off)]) }); }
  l3rbDraw(); l3rbSave(); l3rbRender(); return true;
}
/* Bygel runt elementet (i sektionen vinkelrätt mot långsidan) – för manuell armering. */
function l3rbStirrupsAround(set, d, ccMm, coverMm) {
  const o = set.obb, c = coverMm / 1000, dd = d / 1000, out = []; l3rbSpread(c, o.L - c, ccMm / 1000).forEach(u => l3rbStirrup(out, d, u, c + dd / 2, o.B - c - dd / 2, c + dd / 2, o.H - c - dd / 2, "M", "u"));
  out.forEach(b => set.bars.push({ d: b.d, shape: "bygel", code: b.code, dims: b.dims, closed: true, abs: true, len: b.len, mark: "M", pts: b.pts.map(p => l3rbWorld(o, p[0], p[1], p[2]).map(l3rbR)) })); l3rbDraw(); l3rbSave(); l3rbRender();
}

/* ---- Panelen ------------------------------------------------------------------------------------------------------------------------- */
const L3RB_CSS = `#v3Rb{position:absolute;left:12px;top:12px;z-index:23;width:min(372px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;box-sizing:border-box;background:var(--v3-panel,#fff);color:#0f172a;border:1px solid rgba(0,0,0,.12);border-radius:14px;box-shadow:0 10px 32px rgba(0,0,0,.22);font:12.5px system-ui,sans-serif;padding:10px 12px}
#v3Rb h4{margin:0 0 6px;font-size:14px;display:flex;align-items:center;gap:8px}#v3Rb h4 .x{margin-left:auto}#v3Rb .badge{font-size:10px;font-weight:700;letter-spacing:.05em;background:#fef3c7;color:#92400e;border-radius:6px;padding:2px 6px}
#v3Rb .warn{background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:9px;padding:6px 9px;margin:4px 0 8px;line-height:1.35}#v3Rb details{border-top:1px solid rgba(0,0,0,.08);padding:6px 0}#v3Rb summary{cursor:pointer;font-weight:600;padding:2px 0}
#v3Rb .r{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0}#v3Rb label.f{display:flex;gap:6px;align-items:center;justify-content:space-between;margin:4px 0}#v3Rb label.f input,#v3Rb label.f select{width:104px;padding:4px 6px;border:1px solid rgba(0,0,0,.18);border-radius:7px;font:inherit;box-sizing:border-box}
#v3Rb button{border:1px solid rgba(0,0,0,.15);background:#fff;border-radius:9px;padding:5px 9px;font:inherit;cursor:pointer;color:inherit}#v3Rb button.p{background:#2563eb;color:#fff;border-color:#2563eb}#v3Rb button.on{background:#f59e0b;color:#fff;border-color:#f59e0b}#v3Rb button.bad{color:#b91c1c}#v3Rb button:disabled{opacity:.45;cursor:default}
#v3Rb .t{opacity:.7;font-size:12px}#v3Rb .set{display:flex;align-items:center;gap:6px;padding:5px 6px;border-radius:9px;border:1px solid transparent}#v3Rb .set.on{background:#eff6ff;border-color:#bfdbfe}#v3Rb .set b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
#v3Rb table{width:100%;border-collapse:collapse;font-size:11.5px}#v3Rb th,#v3Rb td{padding:2px 4px;text-align:right;border-bottom:1px solid rgba(0,0,0,.06)}#v3Rb th:first-child,#v3Rb td:first-child{text-align:left}#v3Rb .kpi{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:6px 0}#v3Rb .kpi div{background:#f8fafc;border:1px solid #eef2f6;border-radius:9px;padding:5px 8px}#v3Rb .kpi b{display:block;font-size:14px}`;
function l3rbToggle(on) { const want = on == null ? !l3rb.el : on; if (want) l3rbOpen(); else l3rbClose(); }
async function l3rbOpen() {
  const host = document.getElementById("v3Canvas"); if (!host) return; if (!document.getElementById("v3RbCss")) { const st = document.createElement("style"); st.id = "v3RbCss"; st.textContent = L3RB_CSS; document.head.appendChild(st); }
  let el = document.getElementById("v3Rb"); if (!el) { el = document.createElement("div"); el.id = "v3Rb"; host.appendChild(el); l3rb.el = el; ["pointerdown", "wheel", "dblclick", "contextmenu", "keydown", "keyup"].forEach(t => el.addEventListener(t, e => e.stopPropagation())); el.addEventListener("click", l3rbClick); el.addEventListener("change", l3rbChange); if (typeof l3rb2Click === "function") { el.addEventListener("click", l3rb2Click); el.addEventListener("change", l3rb2Change); window.addEventListener("pointerdown", l3rbHandleDown, true); } }
  l3rb.sel = l3rbSelection(); l3rbRender(); await l3rbLoad(); l3rbRender();
}
function l3rbClose() { l3rbDrawStop(true); if (typeof l3rbHandleDown === "function") window.removeEventListener("pointerdown", l3rbHandleDown, true); if (typeof l3rbClearHandles === "function") l3rbClearHandles(); const e = document.getElementById("v3Rb"); if (e) e.remove(); l3rb.el = null; }
const l3rbGet = (id, d) => { const e = document.getElementById(id), v = e ? Number(String(e.value).replace(",", ".")) : NaN; return Number.isFinite(v) ? v : d; };
function l3rbParamFields(type, P) {
  const F = (id, lab, v, unit = "") => `<label class="f"><span>${lab}</span><input id="rb_${id}" type="text" inputmode="decimal" value="${l3rbF(v, 0).replace(/\s/g, "")}"> ${unit}</label>`; const row = [];
  if (type === "platta" || type === "sula") row.push(F("dMain", "Underkant Ø", P.dMain, "mm"), F("ccMain", "c/c underkant", P.ccMain, "mm"), `<label class="f"><span>Överkantsnät</span><input id="rb_top" type="checkbox" ${P.top ? "checked" : ""} style="width:auto"></label>`, F("dTop", "Överkant Ø", P.dTop, "mm"), F("ccTop", "c/c överkant", P.ccTop, "mm"));
  if (type === "vagg") row.push(F("dHor", "Liggande Ø", P.dHor, "mm"), F("ccHor", "c/c liggande", P.ccHor, "mm"), F("dVert", "Stående Ø", P.dVert, "mm"), F("ccVert", "c/c stående", P.ccVert, "mm"));
  if (type === "balk") row.push(F("dLong", "Huvudstål Ø", P.dLong, "mm"), F("nBot", "Antal underkant", P.nBot), F("nTop", "Antal överkant", P.nTop), F("dStirr", "Bygel Ø", P.dStirr, "mm"), F("ccStirr", "Bygel c/c", P.ccStirr, "mm"));
  if (type === "pelare") row.push(F("dCol", "Huvudstål Ø", P.dCol, "mm"), F("nCol", "Antal stänger", P.nCol), F("dColSt", "Bygel Ø", P.dColSt, "mm"), F("ccColSt", "Bygel c/c", P.ccColSt, "mm"));
  if (type === "platta" || type === "sula" || type === "vagg") row.push(`<label class="f"><span>Kantarmering (U-stänger)</span><input id="rb_edge" type="checkbox" ${P.edge ? "checked" : ""} style="width:auto"></label>`, F("dEdge", "Kant Ø", P.dEdge, "mm"), F("ccEdge", "Kant c/c", P.ccEdge, "mm"), F("legEdge", "Kant benlängd", P.legEdge, "mm"));
  if (type === "platta" || type === "sula") row.push(`<label class="f"><span>Kantstänger i U:et</span><input id="rb_edgeBar" type="checkbox" ${P.edgeBar ? "checked" : ""} style="width:auto"></label>`);
  const CB = (id, lab, on, tip) => `<label class="f" title="${tip}"><span>${lab}</span><input id="rb_${id}" type="checkbox" ${on ? "checked" : ""} style="width:auto"></label>`;
  if (type === "platta" || type === "sula" || type === "vagg") row.push(CB("openings", "Öppningar (läses ur formen)", P.openings !== false, "Hål i elementet hittas ur IFC-geometrin: stänger kapas och kantarmering, snedstänger och förstärkningsstänger läggs runt hålet"));
  if (type === "platta") row.push(CB("cornerBars", "Hörnstänger (snedställda)", !!P.cornerBars, "Två snedställda överkantsstänger i plattans fyra hörn"), CB("doubleNet", "Dubbla nät vid tjock platta (≥ 0,4 m)", P.doubleNet !== false, "Extra nät under och över när plattan är minst 0,4 m tjock"), CB("support", "Upplagsförstärkning (kortsidor)", !!P.support, "Extra överkantsstänger över upplag – antar upplag längs de två kortsidorna"));
  if (type === "balk") row.push(CB("sideBars", "Sidoarmering (h > 0,7 m)", P.sideBars !== false, "Ø10 var 300 mm på båda sidorna i höga balkar"), CB("dense", "Tätare bygel vid upplag", P.dense !== false, "Halva c/c närmast ändarna"));
  if (type === "pelare") row.push(CB("dense", "Tätare bygel vid ändarna", P.dense !== false, "Halva c/c närmast ändarna"));
  return row.join("") + F("maxLen", "Längsta stång", P.maxLen, "m");
}
function l3rbReadParams(type) {
  const P = l3rbParamsDefault(type), g = (k, d) => l3rbGet("rb_" + k, d), ex = document.getElementById("rb_exp"); P.exposure = ex ? ex.value : P.exposure; P.cover = L3RB_COVER[P.exposure] || P.cover;
  ["dMain", "ccMain", "dTop", "ccTop", "dHor", "ccHor", "dVert", "ccVert", "dLong", "nBot", "nTop", "dStirr", "ccStirr", "dCol", "nCol", "dColSt", "ccColSt", "maxLen", "dEdge", "ccEdge", "legEdge"].forEach(k => { P[k] = g(k, P[k]); }); const tp = document.getElementById("rb_top"); if (tp) P.top = tp.checked; const eg = document.getElementById("rb_edge"); if (eg) P.edge = eg.checked; const eb = document.getElementById("rb_edgeBar"); if (eb) P.edgeBar = eb.checked; ["openings", "cornerBars", "doubleNet", "support", "sideBars", "dense"].forEach(k => { const e = document.getElementById("rb_" + k); if (e) P[k] = e.checked; }); return P;
}
function l3rbRender() {
  const el = l3rb.el; if (!el) return; const open = new Set([...el.querySelectorAll("details[open]")].map(d => d.dataset.k)), keep = k => (open.size ? open.has(k) : k === "au") ? "open" : "";
  const selTxt = l3rb.sel.length ? l3rb.sel.slice(0, 3).map(s => { const o = l3rbObb(s.pts); return o ? `<div><b>${l3rbEsc(s.name)}</b> <span class="t">${l3rbF(o.L, 2)}×${l3rbF(o.B, 2)}×${l3rbF(o.H, 2)} m → ${L3RB_TYPES[l3rbGuess(s.cls, o)]}</span></div>` : ""; }).join("") + (l3rb.sel.length > 3 ? `<div class="t">+ ${l3rb.sel.length - 3} till</div>` : "") : `<div class="t">Markera ett eller flera objekt i 3D-vyn (IFC-objekt eller ritade/placerade objekt) och tryck <b>Använd markering</b>.</div>`;
  const type = l3rb.type || (l3rb.sel[0] ? (() => { const o = l3rbObb(l3rb.sel[0].pts); return o ? l3rbGuess(l3rb.sel[0].cls, o) : "platta"; })() : "platta"), P = l3rb.P && l3rb.P.__t === type ? l3rb.P : { ...l3rbParamsDefault(type), __t: type };
  const act = l3rb.sets.find(s => s.id === l3rb.active), sum = act ? l3rbSummary(l3rbSetBars(act)) : null;
  const sets = l3rb.sets.map(s => { const sm = l3rbSummary(l3rbSetBars(s)); return `<div class="set ${s.id === l3rb.active ? "on" : ""}" data-set="${s.id}"><input type="checkbox" data-rb="vis" ${s.hide ? "" : "checked"} title="Visa/dölj"><b data-rb="pick" title="${l3rbEsc(s.name)}">${l3rbEsc(s.name)}</b><span class="t">${l3rbF(sm.kg, 0)} kg</span><button type="button" data-rb="del" class="bad" title="Ta bort setet">✕</button></div>`; }).join("") || `<div class="t">Inga armeringsset än.</div>`;
  let det = "";
  if (act && sum) {
    const vol = l3rbVolume(act.obb), sch = l3rbSchablon(act.type), kgm3 = vol > 0 ? sum.kg / vol : 0, diff = sch.v ? (kgm3 / sch.v - 1) * 100 : 0;
    det = `<div class="kpi"><div>Stavar<b>${sum.n.toLocaleString("sv-SE")}</b></div><div>Total längd<b>${l3rbF(sum.length, 0)} m</b></div><div>Vikt<b>${l3rbF(sum.kg, 0)} kg</b></div><div>Armeringsgrad<b>${l3rbF(kgm3, 0)} kg/m³</b></div></div>
    <div class="t">Schablon ${L3RB_TYPES[act.type]}: <b>${l3rbF(sch.v, 0)} kg/m³</b> (${sch.src}) → ${diff >= 0 ? "+" : ""}${l3rbF(diff, 0)} % mot schablon · betongvolym ${l3rbF(vol, 2)} m³</div>
    <div class="r"><label class="f" style="margin:0"><span>Verkligt uttag</span><input id="rb_act" type="text" inputmode="decimal" placeholder="kg"></label><button type="button" data-rb="exp" title="Lägg verkligt uttag (kg/m³) i erfarenheten – schablonen blir medel av uttagen">Spara som erfarenhet</button></div>
    <div class="r">${act.kind === "auto" ? `<button type="button" data-rb="freeze" title="Frys stavarna så att de går att ändra för hand">Gör manuell</button><button type="button" data-rb="regen" title="Räkna om med inställningarna ovan">Räkna om</button>` : ""}<button type="button" data-rb="zoom">Zooma</button></div>`;
  }
  const tab = sum ? `<table><tr><th>Pos</th><th>Ø</th><th>Form</th><th>Mått mm</th><th>Ant</th><th>Längd m</th><th>Σ m</th><th>kg</th></tr>${sum.rows.slice(0, 60).map(r => `<tr><td>${r.pos}</td><td>${r.d}</td><td>${l3rbEsc(r.code || r.shape)}</td><td style="text-align:left">${l3rbEsc(r.dims || "")}</td><td>${r.n}</td><td>${l3rbF(r.len, 2)}</td><td>${l3rbF(r.tot, 1)}</td><td>${l3rbF(r.kg, 1)}</td></tr>`).join("")}</table>${sum.rows.length > 60 ? `<div class="t">+ ${sum.rows.length - 60} rader i exporten</div>` : ""}` : `<div class="t">Välj ett set för att se listan.</div>`;
  const schRows = Object.keys(L3RB_TYPES).map(k => `<label class="f"><span>${L3RB_TYPES[k]}</span><input data-rbsch="${k}" type="text" inputmode="decimal" value="${l3rbF((l3Prefs().rbSch || {})[k] || L3RB_SCH0[k], 0).replace(/\s/g, "")}"> kg/m³</label>`).join("");
  el.innerHTML = `<h4>🧱 Armering <span class="badge">EXPERIMENTELL</span><button type="button" class="x" data-rb="close" title="Stäng">✕</button></h4>
  <div class="warn">Autoarmeringen är ett <b>förslag enligt enkla regler</b> för mängder, planering och visualisering – <b>inte dimensionerad</b>. Konstruktörens handlingar gäller alltid.</div>
  <div>${selTxt}</div><div class="r"><button type="button" class="p" data-rb="use">Använd markering</button><span class="t">${l3rb.sel.length} markerat</span></div>
  <details data-k="au" ${keep("au")}><summary>Autoarmering</summary>
    <label class="f"><span>Elementtyp</span><select id="rb_type">${Object.keys(L3RB_TYPES).map(k => `<option value="${k}" ${k === type ? "selected" : ""}>${L3RB_TYPES[k]}</option>`).join("")}</select></label>
    <label class="f"><span>Miljö (täckskikt)</span><select id="rb_exp" style="width:190px">${Object.keys(L3RB_COVER).map(k => `<option ${k === (P.exposure || "Utomhus, fuktig (XC3/XC4)") ? "selected" : ""}>${k}</option>`).join("")}</select></label><div class="t">Täckskikt ${L3RB_COVER[P.exposure] || P.cover} mm – kontrollera mot handlingarna.</div>
    ${l3rbParamFields(type, P)}<div class="r"><button type="button" class="p" data-rb="gen" ${l3rb.sel.length ? "" : "disabled"}>Generera autoarmering</button></div><div class="t" id="rb_msg">${l3rbEsc(l3rb.msg || "")}</div>${l3rb.fail ? `<div class="r"><button type="button" data-rb="manual-from-fail">Fortsätt manuellt</button><span class="t">Skapar en tom manuell armering för elementet.</span></div>` : ""}</details>
  ${typeof l3rb2Html === "function" ? l3rb2Html(act) : ""}
  <details data-k="mn" ${keep("mn")}><summary>Manuell armering (enkel)</summary><div class="t">Rita stavar i 3D, kopiera i serie, eller lägg bygel runt elementet.</div>
    <label class="f"><span>Diameter Ø</span><select id="rb_md">${[8, 10, 12, 16, 20, 25, 32].map(d => `<option ${d === l3rb.cur.d ? "selected" : ""}>${d}</option>`).join("")}</select> mm</label>
    <div class="r"><button type="button" data-rb="draw" class="${l3rb.draw ? "on" : ""}">${l3rb.draw ? "Klar (Enter)" : "Rita stav i 3D"}</button><button type="button" data-rb="undobar" ${act && act.kind === "manual" && act.bars.length ? "" : "disabled"}>Ta bort sista</button><button type="button" data-rb="newman">Ny manuell set</button></div>
    <label class="f"><span>Serie: antal</span><input id="rb_sn" type="text" inputmode="numeric" value="10"></label><label class="f"><span>Serie: c/c</span><input id="rb_scc" type="text" inputmode="decimal" value="${l3rb.cur.cc}"> mm</label><label class="f"><span>Lodrätt</span><input id="rb_sv" type="checkbox" style="width:auto"></label>
    <div class="r"><button type="button" data-rb="series" ${act && act.kind === "manual" && act.bars.length ? "" : "disabled"}>Kopiera senaste staven</button><button type="button" data-rb="stirr" ${act ? "" : "disabled"} title="Bygel längs elementets långsida med c/c ovan">Bygel runt elementet</button></div></details>
  <details data-k="st" ${keep("st")}><summary>Set (${l3rb.sets.length})</summary>${sets}${det}</details>
  <details data-k="li" ${keep("li")}><summary>Lista och export</summary>${tab}<div class="r"><button type="button" data-rb="csv" ${sum ? "" : "disabled"}>Mängdlista (CSV)</button><button type="button" data-rb="dxf" ${l3rb.sets.length ? "" : "disabled"}>DXF (3D-linjer)</button><button type="button" data-rb2="ifc" ${l3rb.sets.length ? "" : "disabled"} title="IfcReinforcingBar med svepta cirkelprofiler – sparas i Trimble Connect eller hämtas">IFC (armering)</button><button type="button" data-rb2="html" ${l3rb.sets.length ? "" : "disabled"} title="Förteckning med skisser – öppna och skriv ut som PDF">Förteckning (HTML/PDF)</button></div></details>
  <details data-k="sc" ${keep("sc")}><summary>Schablon och erfarenhet</summary><div class="t">Exempelvärden – ersätt med era egna. Verkliga uttag du sparar ersätter schablonen (medelvärde).</div>${schRows}<div class="r t">${(l3Prefs().rbExp || []).length} sparade uttag <button type="button" data-rb="expclr" ${(l3Prefs().rbExp || []).length ? "" : "disabled"}>Rensa</button></div></details>`; l3rbAfterRender();
}
function l3rbAfterRender() { if (typeof l3rbHandles === "function") { if (l3rb.gActive) l3rbHandles(); else l3rbClearHandles(); } }
function l3rbChange(e) {
  const t = e.target; if (t.id === "rb_type") { l3rb.type = t.value; l3rb.P = null; l3rbRender(); } else if (t.id === "rb_exp") { l3rb.P = l3rbReadParams(l3rb.type || "platta"); l3rb.P.__t = l3rb.type || "platta"; l3rbRender(); }
  else if (t.id === "rb_md") l3rb.cur.d = Number(t.value) || 12; else if (t.id === "rb_scc") l3rb.cur.cc = Math.max(10, Number(String(t.value).replace(",", ".")) || 150);
  else if (t.dataset && t.dataset.rbsch) { const o = { ...(l3Prefs().rbSch || {}) }; o[t.dataset.rbsch] = Number(String(t.value).replace(",", ".")) || L3RB_SCH0[t.dataset.rbsch]; l3SetPref("rbSch", o); l3rbRender(); }
  else if (t.dataset && t.dataset.rb === "vis") { const s = l3rb.sets.find(x => x.id === t.closest("[data-set]").dataset.set); if (s) { s.hide = !t.checked; l3rbDraw(); l3rbSave(); } }
}
function l3rbCurType() { return l3rb.type || (l3rb.sel[0] ? (() => { const o = l3rbObb(l3rb.sel[0].pts); return o ? l3rbGuess(l3rb.sel[0].cls, o) : "platta"; })() : "platta"); }
function l3rbGenerateAll() {
  const type = l3rb.type || null, P = l3rbReadParams(type || l3rbCurType()); let ok = 0, fails = [], first = null;
  l3rb.sel.forEach(sel => { const r = l3rbFromSelection(sel, type, type ? P : { ...P, ...{} }); if (r.set) { const t = r.set.type; if (!type) r.set.params = { ...l3rbParamsDefault(t), cover: P.cover, exposure: P.exposure, maxLen: P.maxLen }; l3rb.sets.push(r.set); l3rb.active = r.set.id; ok++; first = first || r.set; } else fails.push({ sel, r }); });
  l3rb.fail = fails[0] || null; l3rb.msg = `${ok} set skapade${fails.length ? ` · ${fails.length} gick inte: ${fails.map(f => f.r.err).join(" ")}` : ""}`; l3rbDraw(); l3rbSave(); l3rbRender(); return { ok, fails };
}
function l3rbClick(e) {
  const b = e.target.closest("[data-rb]"); if (!b || b.disabled || b.tagName === "INPUT") return; const a = b.dataset.rb, setEl = b.closest("[data-set]"), set = setEl ? l3rb.sets.find(s => s.id === setEl.dataset.set) : l3rb.sets.find(s => s.id === l3rb.active);
  if (a === "close") return l3rbClose();
  if (a === "use") { l3rb.sel = l3rbSelection(); l3rb.msg = ""; l3rb.fail = null; l3rb.type = null; l3rb.P = null; return l3rbRender(); }
  if (a === "gen") return l3rbGenerateAll();
  if (a === "manual-from-fail") { const f = l3rb.fail; if (!f) return; const o = f.r.obb || l3rbObb(f.sel.pts) || { cx: 0, cy: 0, yaw: 0, L: 1, B: 1, z0: 0, H: 1 }; const s = { id: l3rbNewId(), kind: "manual", name: `Manuell: ${f.sel.name}`.slice(0, 80), type: f.r.type || "platta", obb: o, params: {}, bars: [], el: { name: f.sel.name, cls: f.sel.cls || "" }, created_at: new Date().toISOString() }; l3rb.sets.push(s); l3rb.active = s.id; l3rb.fail = null; l3rb.msg = "Manuell armering skapad – rita stavar eller lägg bygel."; l3rbSave(); return l3rbRender(); }
  if (a === "pick" && set) { l3rb.active = set.id; return l3rbRender(); }
  if (a === "del" && set) { l3rb.sets = l3rb.sets.filter(s => s !== set); if (l3rb.active === set.id) l3rb.active = null; l3rbDraw(); l3rbSave(); return l3rbRender(); }
  if (a === "freeze" && set) return l3rbFreeze(set);
  if (a === "regen" && set && set.kind === "auto") { const P = l3rbReadParams(set.type); return l3rbRegen(set, P, null); }
  if (a === "zoom" && set) { const o = set.obb, c = new THREE.Vector3(o.cx - l3.O[0], o.cy - l3.O[1], o.z0 + o.H / 2 - l3.O[2]); if (typeof l3FlyTo === "function") l3FlyTo(c, Math.max(4, Math.hypot(o.L, o.B, o.H) * 1.6), null, 500); return; }
  if (a === "exp" && set) { const kg = l3rbGet("rb_act", NaN), vol = l3rbVolume(set.obb); if (!(kg > 0) || !(vol > 0)) { l3Status("Skriv in verkligt uttag i kg.", true); return; } const E = [...(l3Prefs().rbExp || []), { type: set.type, kgm3: kg / vol, name: set.name, at: new Date().toISOString().slice(0, 10) }]; l3SetPref("rbExp", E); l3Status(`Erfarenhet sparad: ${L3RB_TYPES[set.type]} ${l3rbF(kg / vol, 0)} kg/m³.`); return l3rbRender(); }
  if (a === "expclr") { l3SetPref("rbExp", []); return l3rbRender(); }
  if (a === "draw") return l3rb.draw ? l3rbDrawStop(false) : l3rbDrawStart();
  if (a === "newman") { l3rb.active = null; const s = l3rbManualSet(set); l3rb.active = s.id; l3rbSave(); return l3rbRender(); }
  if (a === "undobar" && set && set.kind === "manual") { set.bars.pop(); l3rbDraw(); l3rbSave(); return l3rbRender(); }
  if (a === "series" && set && set.kind === "manual") { const n = Math.max(1, Math.min(500, Math.round(l3rbGet("rb_sn", 10)))), cc = l3rbGet("rb_scc", 150), v = document.getElementById("rb_sv"); l3rb.cur.cc = cc; return void l3rbSeries(set, n, cc, v && v.checked); }
  if (a === "stirr" && set) { if (set.kind !== "manual") l3rbFreeze(set); const d = l3rbGet("rb_md", 10), cc = l3rbGet("rb_scc", 200); return l3rbStirrupsAround(set, d, cc, (L3RB_COVER[(document.getElementById("rb_exp") || {}).value] || 35)); }
  if (a === "csv" && set) return l3rbCsv(set); if (a === "dxf") return l3rbDxf();
}
/* ---- Rita stav i 3D --------------------------------------------------------------------------------------------------------------- */
function l3rbDrawStart() {
  const set = l3rbManualSet(l3rb.sets.find(s => s.id === l3rb.active)); l3rb.active = set.id; l3rb.draw = { pts: [], set }; window.addEventListener("pointerdown", l3rbPick, true); l3.renderer.domElement.style.cursor = "crosshair";
  l3Status("Rita stav: tryck punkterna längs stången (Enter eller dubbelklick avslutar, Esc avbryter)."); l3rbRender();
}
function l3rbDrawStop(cancel) {
  const D = l3rb.draw; window.removeEventListener("pointerdown", l3rbPick, true); if (l3 && l3.renderer) l3.renderer.domElement.style.cursor = "";
  if (D && !cancel && D.pts.length >= 2) l3rbAddBar(D.set, l3rb.cur.d, D.pts, false); l3rb.draw = null; l3rbTmp(null); if (l3rb.el) l3rbRender();
}
function l3rbTmp(pts) { if (l3rb.tmp) { l3.scene.remove(l3rb.tmp); l3rb.tmp.geometry.dispose(); l3rb.tmp.material.dispose(); l3rb.tmp = null; } if (!pts || pts.length < 2) { l3Render(); return; } const O = l3.O; l3rb.tmp = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p[0] - O[0], p[1] - O[1], p[2] - O[2]))), new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false })); l3rb.tmp.renderOrder = 50; l3rb.tmp.raycast = () => {}; l3.scene.add(l3rb.tmp); l3Render(); }
function l3rbSnap(p) {   // fäst mot ändpunkter på befintliga stavar (15 cm)
  let best = null, bd = 0.15; l3rb.sets.forEach(s => { if (s.hide) return; l3rbSetWorld(s).forEach(b => { const e = [b.w[0], b.w[b.w.length - 1]]; e.forEach(q => { const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (d < bd) { bd = d; best = q; } }); }); }); return best || p;
}
function l3rbPick(e) {
  const D = l3rb.draw; if (!D || e.button !== 0 || e.target !== l3.renderer.domElement) return; e.stopImmediatePropagation(); e.preventDefault(); let hit = null;
  try { const h = l3Ray(e, l3Surfaces())[0]; if (h) hit = [h.point.x + l3.O[0], h.point.y + l3.O[1], h.point.z + l3.O[2]]; } catch (err) { /* */ }
  const pc = !hit && typeof l3pcPick === "function" ? l3pcPick(e, 10) : null; if (pc) hit = [pc.point.x + l3.O[0], pc.point.y + l3.O[1], pc.point.z + l3.O[2]];
  if (!hit) { const r = l3.renderer.domElement.getBoundingClientRect(), rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), l3.camera); const z = D.pts.length ? D.pts[D.pts.length - 1][2] - l3.O[2] : D.set.obb.z0 - l3.O[2], p = new THREE.Vector3(); if (rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), p)) hit = [p.x + l3.O[0], p.y + l3.O[1], p.z + l3.O[2]]; }
  if (!hit) return; const last = D.pts[D.pts.length - 1]; if (last && Math.hypot(hit[0] - last[0], hit[1] - last[1], hit[2] - last[2]) < 0.02) { l3rbDrawStop(false); return; }
  D.pts.push(l3rbSnap(hit)); l3rbTmp(D.pts);
}
function l3rbKey(e) {
  if (!l3rb.draw) return false; if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); l3rbDrawStop(false); return true; } if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); l3rbDrawStop(true); return true; } if (e.key === "Backspace") { e.preventDefault(); l3rb.draw.pts.pop(); l3rbTmp(l3rb.draw.pts); return true; } return false;
}
/* ---- Export ---------------------------------------------------------------------------------------------------------------------------- */
const l3rbAsc = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "?");
function l3rbDl(name, blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); }
const l3rbStamp = () => { const d = new Date(), p = x => String(x).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} kl ${p(d.getHours())}.${p(d.getMinutes())}`; };
function l3rbCsvText(sets) {
  const f = v => typeof v === "number" ? String(Math.round(v * 1000) / 1000).replace(".", ",") : `"${String(v == null ? "" : v).replace(/"/g, '""')}"`, rows = [["Armeringsförslag (experimentell, ej dimensionerad)"], [], ["Set", "Pos", "Ø mm", "Form", "Mått mm", "Antal", "Utv. längd m", "Σ längd m", "Vikt kg"]];
  let kg = 0; sets.forEach(s => { const sm = l3rbSummary(l3rbSetBars(s)); sm.rows.forEach(r => rows.push([s.name, r.pos, r.d, r.code || r.shape, r.dims || "", r.n, r.len, r.tot, r.kg])); kg += sm.kg; rows.push([s.name + " – summa", "", "", "", "", sm.n, "", sm.length, sm.kg], []); }); rows.push(["TOTALT", "", "", "", "", "", "", "", kg]);
  return "﻿" + rows.map(r => r.map(f).join(";")).join("\r\n");
}
function l3rbCsv(set) { const sets = set ? [set] : l3rb.sets; l3rbDl(`Armering ${l3rbStamp()}.csv`, new Blob([l3rbCsvText(l3rb.sets.length > 1 ? l3rb.sets.filter(s => !s.hide) : sets)], { type: "text/csv;charset=utf-8" })); l3Toast("Mängdlistan (CSV) nedladdad."); }
function l3rbDxfText(sets) {
  const o = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "9", "$INSUNITS", "70", "6", "0", "ENDSEC"], layers = new Map(), body = [], num = v => (Math.round(v * 1000) / 1000).toFixed(3);
  sets.forEach(s => { if (s.hide) return; l3rbSetWorld(s).forEach(b => { const ln = "ARM_D" + b.d; if (!layers.has(ln)) layers.set(ln, Object.keys(L3RB_COL).indexOf(String(b.d)) + 1 || 7);
    body.push("0", "POLYLINE", "8", ln, "66", "1", "70", String((b.closed ? 1 : 0) + 8)); b.w.forEach(p => body.push("0", "VERTEX", "8", ln, "10", num(p[0]), "20", num(p[1]), "30", num(p[2]), "70", "32")); body.push("0", "SEQEND", "8", ln); }); });
  o.push("0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", String(layers.size)); layers.forEach((c, n) => o.push("0", "LAYER", "2", n, "70", "0", "62", String(c), "6", "CONTINUOUS")); o.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", ...body, "0", "ENDSEC", "0", "EOF"); return o.join("\n");
}
function l3rbDxf() { if (!l3rb.sets.length) return; l3rbDl(`Armering ${l3rbStamp()}.dxf`, new Blob([l3rbDxfText(l3rb.sets)], { type: "application/dxf" })); l3Toast("Armeringen som 3D-linjer (DXF) nedladdad."); }

/* Hämtar sparade set när 3D-vyn öppnats (anropas från l3RenderSnapBar) och ritar om dem om scenen byggts om. */
function l3rbBoot() { if (!l3rb.loaded) l3rbLoad(); else if (l3rb.sets.length && (!l3rb.group || l3rb.group.parent !== l3.scene)) l3rbDraw(); }
