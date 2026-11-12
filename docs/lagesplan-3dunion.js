/* Sammanfoga objekt (Victor 2026-11-12: "två betongdelar som går i varandra ska jag kunna sammanfoga till ett solitt objekt").
   Markera två eller fler ritade solider (och/eller IFC-delar) → Redigera / högerklick → Sammanfoga. Delarna slås ihop till ETT slutet nät: där de
   går i varandra tas ytorna inuti bort (boolesk union, BSP-träd). Ritade delar ersätts av det sammanfogade objektet (Ctrl+Z ångrar);
   IFC-delar står kvar i IFC-filen. Delar som bara nuddar varandra blir ett objekt med en gemensam yta. Prefix l3un. */
const L3UN_EPS = 1e-5, L3UN_MAXTRI = 9000;
const l3unDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function l3unPlane(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(n[0], n[1], n[2]);
  if (l < 1e-12) return null; const m = [n[0] / l, n[1] / l, n[2] / l]; return { n: m, w: l3unDot(m, a) };
}
const l3unPoly = vs => { const pl = l3unPlane(vs[0], vs[1], vs[2]); return pl ? { v: vs, pl } : null; };
function l3unSplit(pl, poly, cf, cb, front, back) {
  let type = 0; const ts = poly.v.map(p => { const t = l3unDot(pl.n, p) - pl.w, k = t < -L3UN_EPS ? 2 : t > L3UN_EPS ? 1 : 0; type |= k; return k; });
  if (type === 0) (l3unDot(pl.n, poly.pl.n) > 0 ? cf : cb).push(poly);
  else if (type === 1) front.push(poly); else if (type === 2) back.push(poly);
  else {
    const f = [], b = [], n = poly.v.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, ti = ts[i], tj = ts[j], vi = poly.v[i], vj = poly.v[j];
      if (ti !== 2) f.push(vi); if (ti !== 1) b.push(vi);
      if ((ti | tj) === 3) { const d = [vj[0] - vi[0], vj[1] - vi[1], vj[2] - vi[2]], t = (pl.w - l3unDot(pl.n, vi)) / l3unDot(pl.n, d), q = [vi[0] + d[0] * t, vi[1] + d[1] * t, vi[2] + d[2] * t]; f.push(q); b.push(q); }
    }
    if (f.length >= 3) { const q = l3unPoly(f); if (q) front.push(q); } if (b.length >= 3) { const q = l3unPoly(b); if (q) back.push(q); }
  }
}
class L3unNode {
  constructor(polys) { this.pl = null; this.front = null; this.back = null; this.polys = []; if (polys && polys.length) this.build(polys); }
  invert() {
    this.polys = this.polys.map(p => ({ v: p.v.slice().reverse(), pl: { n: p.pl.n.map(x => -x), w: -p.pl.w } }));
    if (this.pl) this.pl = { n: this.pl.n.map(x => -x), w: -this.pl.w }; const t = this.front; this.front = this.back; this.back = t;
    if (this.front) this.front.invert(); if (this.back) this.back.invert();
  }
  clip(polys) {
    if (!this.pl) return polys.slice(); let f = [], b = [];
    polys.forEach(p => l3unSplit(this.pl, p, f, b, f, b));
    f = this.front ? this.front.clip(f) : f; b = this.back ? this.back.clip(b) : []; return f.concat(b);
  }
  clipTo(o) { this.polys = o.clip(this.polys); if (this.front) this.front.clipTo(o); if (this.back) this.back.clipTo(o); }
  all() { let r = this.polys.slice(); if (this.front) r = r.concat(this.front.all()); if (this.back) r = r.concat(this.back.all()); return r; }
  build(polys) {
    if (!polys.length) return; if (!this.pl) this.pl = { n: polys[0].pl.n.slice(), w: polys[0].pl.w };
    const f = [], b = []; polys.forEach(p => l3unSplit(this.pl, p, this.polys, this.polys, f, b));
    if (f.length) { if (!this.front) this.front = new L3unNode(); this.front.build(f); } if (b.length) { if (!this.back) this.back = new L3unNode(); this.back.build(b); }
  }
}
/* Union av två polygonlistor (utåtvända, slutna kroppar). */
function l3unUnion2(pa, pb) {
  const a = new L3unNode(pa), b = new L3unNode(pb);
  a.clipTo(b); b.clipTo(a); b.invert(); b.clipTo(a); b.invert(); a.build(b.all()); return a.all();
}
/* Trianglar ([[x,y,z]×3]) → polygoner, vända utåt (negativ volym vänds). */
function l3unPolys(tris) {
  const flip = l3bqSVol(tris) < 0, out = [];
  tris.forEach(t => { const v = flip ? [t[0], t[2], t[1]] : t; const p = l3unPoly(v.map(q => q.slice())); if (p) out.push(p); }); return out;
}
/* T-skarvar: en punkt som ligger mitt på en annan triangels kant delar kanten (annars blir nätet inte slutet). Upprepas tills inga finns. */
function l3unWeld(tris0) {
  const r3 = v => Math.round(v * 1000) / 1000; let tris = tris0.map(t => t.map(q => [r3(q[0]), r3(q[1]), r3(q[2])])); const key = q => q[0] + "," + q[1] + "," + q[2];
  for (let pass = 0; pass < 8; pass++) {
    const verts = new Map(); tris.forEach(t => t.forEach(q => verts.set(key(q), q))); const C = 1, grid = new Map(), cell = v => Math.floor(v / C);
    verts.forEach(q => { const k = cell(q[0]) + "|" + cell(q[1]) + "|" + cell(q[2]); (grid.get(k) || grid.set(k, []).get(k)).push(q); });
    const hit = (a, b) => { let best = null, bt = 0; const lo = [0, 1, 2].map(i => cell(Math.min(a[i], b[i]) - 2e-3)), hi = [0, 1, 2].map(i => cell(Math.max(a[i], b[i]) + 2e-3)), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]; if (L2 < 1e-9) return null;
      for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) (grid.get(x + "|" + y + "|" + z) || []).forEach(q => { const t = ((q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1] + (q[2] - a[2]) * d[2]) / L2; if (t <= 1e-3 || t >= 1 - 1e-3) return; const dx = a[0] + d[0] * t - q[0], dy = a[1] + d[1] * t - q[1], dz = a[2] + d[2] * t - q[2]; if (dx * dx + dy * dy + dz * dz < 2.5e-7 && (!best || t < bt)) { best = q; bt = t; } });
      return best; };
    let split = 0; const out = [];
    tris.forEach(t => { let done = false; for (let i = 0; i < 3 && !done; i++) { const a = t[i], b = t[(i + 1) % 3], c = t[(i + 2) % 3], p = hit(a, b); if (p) { out.push([c, a, p], [c, p, b]); done = true; split++; } } if (!done) out.push(t); });
    tris = out; if (!split) break;
  }
  return tris;
}
/* Det markerade: ritade objekt och IFC-delar som världstrianglar (SWEREF, meter). */
function l3unCollect() {
  const parts = [];
  (typeof l3SelList === "function" ? l3SelList() : []).forEach(p => {
    const lm = p.m && typeof modLocalMesh === "function" ? modLocalMesh(p) : null; if (!lm || !lm.faces || !lm.faces.length || (p.m.k !== "solid" && p.m.k !== "mesh")) return;
    const t = (Number(p.rot) || 0) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), z0 = placeBaseZ(p), P = lm.pts.map(q => [p.x + q[0] * c - q[1] * s, p.y + q[0] * s + q[1] * c, z0 + q[2]]);
    parts.push({ kind: "mod", p, name: p.name, color: p.color, tris: lm.faces.map(f => [P[f[0] - 1], P[f[1] - 1], P[f[2] - 1]]) });
  });
  (typeof l3bs !== "undefined" ? l3bs.sel : []).forEach(e => { if (!e || !e.mesh || !e.mesh.userData.l3b) return; const g = l3bqEntGeom(e); if (g.pts.length && g.faces.length) parts.push({ kind: "ifc", name: g.name, color: g.color, tris: g.faces.map(f => [g.pts[f[0]], g.pts[f[1]], g.pts[f[2]]]) }); });
  return parts;
}
function l3unRun() {
  const parts = l3unCollect();
  if (parts.length < 2) { l3Status("Markera minst två solida objekt att sammanfoga (ritade solider eller IFC-delar).", true); return null; }
  const n = parts.reduce((a, x) => a + x.tris.length, 0); if (n > L3UN_MAXTRI) { l3Status(`${n.toLocaleString("sv-SE")} trianglar är för många att sammanfoga på en gång (högst ${L3UN_MAXTRI.toLocaleString("sv-SE")}) – markera färre eller enklare delar.`, true); return null; }
  let x0 = Infinity, y0 = Infinity, z0 = Infinity; parts.forEach(x => x.tris.forEach(t => t.forEach(q => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); z0 = Math.min(z0, q[2]); })));
  const loc = x => x.tris.map(t => t.map(q => [q[0] - x0, q[1] - y0, q[2] - z0]));   // små tal ger stabil räkning
  let res; try { res = parts.map(x => l3unPolys(loc(x))).reduce((a, b) => l3unUnion2(a, b)); } catch (e) { l3Status("Sammanfogningen misslyckades: " + (e instanceof RangeError ? "för komplex geometri" : e.message), true); return null; }
  const tris = []; res.forEach(p => { for (let i = 1; i + 1 < p.v.length; i++) { const a = p.v[0], b = p.v[i], c = p.v[i + 1], cr = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])]; if (Math.hypot(...cr) > 1e-9) tris.push([a, b, c]); } });
  if (!tris.length) { l3Status("Delarna gav ingen gemensam yta – ligger de över varandra?", true); return null; }
  const m = l3bqMesh(l3unWeld(tris)), vol = Math.abs(modMeshStats(m.pts, m.faces.map(f => [f[0], f[1], f[2]])).volume), sum = parts.reduce((a, x) => a + Math.abs(l3bqSVol(x.tris)), 0);
  placeSnapshot();
  const q = modCreate(m, [x0, y0, z0], { name: placeNextName("Sammanfogat"), color: parts[0].color, snapshot: false });
  const old = parts.filter(x => x.kind === "mod").map(x => x.p.id); if (old.length) { l3SelectIds(old); l3DeleteSel(); }
  if (typeof l3bsClear === "function") l3bsClear();
  l3SelectIds([q.id]); l3Changed();
  const ifc = parts.filter(x => x.kind === "ifc").length, ov = sum - vol;
  l3Toast(`${parts.length} delar sammanfogade till ett objekt (${vol.toFixed(2).replace(".", ",")} m³${ov > 0.005 ? `, ${ov.toFixed(2).replace(".", ",")} m³ överlapp borttaget` : ""})${ifc ? `. IFC-delarna står kvar i IFC-filen` : ""}${m.closed ? "" : ". Obs: ytan har små öppningar där delarna möts"}. Ctrl+Z ångrar.`);
  return q;
}
