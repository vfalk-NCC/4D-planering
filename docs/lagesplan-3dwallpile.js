/* 3D-vyn – Spont och pålning i Stödmur-verktyget (Victor 2026-11-11: "lägg till alternativ för vanliga spontlösningar som berlinerspont, stålpålar, träpålar osv … standardpålningssätt").
   Samma arbetssätt som stödmurarna: Mät → Stödmur, tryck ut LINJEN (pålradens/spontens mittlinje), välj typ och standardprofil, Skapa. Resultatet är vanliga ritade objekt
   (IFC, redigera, dela, 4D). Typer:
   – Berlinerspont: stålpelare (HEA/HEB) med valt c/c-avstånd och utfackning av trä (plankor) mellan pelarna ned till valt grävdjup.
   – Stålspont: Larssen Z-profiler (AZ 14-700 … AZ 36-700) och U-profiler (PU 18 … PU 32), profilen läggs jämnt längs linjen; vikt efter tillverkarens kg/m² vägg.
   – Borrad pålvägg: tangentpålar (kant mot kant) eller sekantpålar (överlappande – primära oarmerade, sekundära armerade), t.ex. Ø 530 c/c 465 och Ø 621 c/c 546.
   – Stålrörspålar (RD/RR), betongpålar (CK 235–400, kvadratiska), träpålar (rundvirke, avsmalnande) med eget c/c-avstånd, längd och överkant.
   – Slitsmur / platsgjuten betongvägg med vald tjocklek.
   Måtten för AZ/PU är hämtade ur ArcelorMittals katalog (vägg-kg/m², höjd, godstjocklek), sekantmåtten ur Aarsleffs standard, betongpålarnas sidmått ur svensk pålstandard;
   övriga mått är TYPISKA – kontrollera alltid mot tillverkarens datablad och konstruktörens handlingar. Pålar ritas rakt, utan skarvar och spetsar. Prefix l3swp. */
const L3SWP_KINDS = {
  berlin: "Berlinerspont (stålpelare + utfackning)", sheet: "Stålspont (Larssen AZ / PU)", bored: "Borrad pålvägg (tangent / sekant)",
  tube: "Stålrörspålar (RD / RR)", conc: "Betongpålar (kvadratiska)", timber: "Träpålar (rundvirke)", slits: "Slitsmur (platsgjuten betongvägg)",
};
Object.assign(L3SW_KINDS, L3SWP_KINDS);
const L3SWP_STEEL = 7850, L3SWP_CONC = 2400, L3SWP_TIMBER = 550;
const L3SWP_COL = { steel: "#7b8794", conc: "#b8bcc2", timber: "#a97c50", lag: "#c19a6b" };
/* Katalogerna. src: "AM" = ArcelorMittal-katalogen, "AA" = Aarsleff, "PK" = svensk pålstandard (sidmått), annars typiska mått. */
const L3SWP_CAT = {
  sheet: [
    { id: "AZ 14-700", t: "Z", b: 0.7, h: 0.316, tf: 0.0105, tw: 0.0105, kgm2: 114.7, src: "AM" }, { id: "AZ 18-700", t: "Z", b: 0.7, h: 0.420, tf: 0.009, tw: 0.009, kgm2: 109.3, src: "AM" },
    { id: "AZ 26-700", t: "Z", b: 0.7, h: 0.460, tf: 0.0122, tw: 0.0122, kgm2: 147, src: "AM" }, { id: "AZ 36-700", t: "Z", b: 0.7, h: 0.499, tf: 0.017, tw: 0.0112, kgm2: 169, src: "AM" },
    { id: "PU 18", t: "U", b: 0.6, h: 0.430, tf: 0.0112, tw: 0.009, kgm2: 128.2, src: "AM" }, { id: "PU 22", t: "U", b: 0.6, h: 0.450, tf: 0.0121, tw: 0.0095, kgm2: 143.6, src: "AM" },
    { id: "PU 28", t: "U", b: 0.6, h: 0.454, tf: 0.0152, tw: 0.0101, kgm2: 169.6, src: "AM" }, { id: "PU 32", t: "U", b: 0.6, h: 0.452, tf: 0.0195, tw: 0.011, kgm2: 190.2, src: "AM" },
  ],
  berlin: [
    { id: "HEA 200", h: 0.190, b: 0.200, tw: 0.0065, tf: 0.010, kgm: 42.3 }, { id: "HEA 240", h: 0.230, b: 0.240, tw: 0.0075, tf: 0.012, kgm: 60.3 }, { id: "HEA 300", h: 0.290, b: 0.300, tw: 0.0085, tf: 0.014, kgm: 88.3 },
    { id: "HEB 160", h: 0.160, b: 0.160, tw: 0.008, tf: 0.013, kgm: 42.6 }, { id: "HEB 200", h: 0.200, b: 0.200, tw: 0.009, tf: 0.015, kgm: 61.3 }, { id: "HEB 240", h: 0.240, b: 0.240, tw: 0.010, tf: 0.017, kgm: 83.2 }, { id: "HEB 300", h: 0.300, b: 0.300, tw: 0.011, tf: 0.019, kgm: 117 },
  ],
  bored: [
    { id: "Tangentpåle Ø 620", D: 0.62, cc: 0.62 }, { id: "Tangentpåle Ø 900", D: 0.9, cc: 0.9 },
    { id: "Sekantpåle Ø 530 c/c 465", D: 0.53, cc: 0.465, src: "AA" }, { id: "Sekantpåle Ø 621 c/c 546", D: 0.621, cc: 0.546, src: "AA" },
    { id: "Sekantpåle Ø 900 c/c 770", D: 0.9, cc: 0.77 }, { id: "Sekantpåle Ø 1200 c/c 1000", D: 1.2, cc: 1.0 },
  ],
  tube: [
    { id: "RD 140 (Ø 139,7 × 5,0)", D: 0.1397, tt: 0.005, cc: 0.6, src: "SSAB" }, { id: "RD 170 (Ø 168,3 × 5,0)", D: 0.1683, tt: 0.005, cc: 0.8, src: "SSAB" },
    { id: "RD 220 (Ø 219,1 × 6,3)", D: 0.2191, tt: 0.0063, cc: 1.0 }, { id: "RR 115 (Ø 114,3 × 6,3)", D: 0.1143, tt: 0.0063, cc: 0.5 }, { id: "Stålrör Ø 323,9 × 10", D: 0.3239, tt: 0.010, cc: 1.0 },
  ],
  conc: [
    { id: "Betongpåle 235 × 235", a: 0.235, cc: 0.8, src: "PK" }, { id: "Betongpåle 270 × 270", a: 0.27, cc: 0.9, src: "PK" }, { id: "Betongpåle 300 × 300", a: 0.3, cc: 1.0, src: "PK" },
    { id: "Betongpåle 350 × 350", a: 0.35, cc: 1.1, src: "PK" }, { id: "Betongpåle 400 × 400", a: 0.4, cc: 1.2, src: "PK" },
  ],
  timber: [
    { id: "Träpåle topp Ø 150 / spets Ø 100", d0: 0.15, d1: 0.10, cc: 0.8 }, { id: "Träpåle topp Ø 180 / spets Ø 120", d0: 0.18, d1: 0.12, cc: 0.9 }, { id: "Träpåle topp Ø 220 / spets Ø 140", d0: 0.22, d1: 0.14, cc: 1.0 },
  ],
  slits: [
    { id: "Slitsmur 0,6 m", tt: 0.6 }, { id: "Slitsmur 0,8 m", tt: 0.8 }, { id: "Slitsmur 1,0 m", tt: 1.0 }, { id: "Slitsmur 1,2 m", tt: 1.2 },
  ],
};
/* Grundvärden per typ (len = pållängd, top = överkant relativt linjens höjd, cc = c/c). */
const L3SWP_DEF = {
  berlin: { sel: "HEB 240", p_cc: 2.5, len: 8, top: 0, tp: 0.075, lagD: 4, lag: true },
  sheet: { sel: "AZ 18-700", len: 8, top: 0 },
  bored: { sel: "Sekantpåle Ø 621 c/c 546", len: 10, top: 0 },
  tube: { sel: "RD 170 (Ø 168,3 × 5,0)", len: 10, top: 0 },
  conc: { sel: "Betongpåle 270 × 270", len: 12, top: 0 },
  timber: { sel: "Träpåle topp Ø 180 / spets Ø 120", len: 8, top: 0 },
  slits: { sel: "Slitsmur 0,8 m", len: 8, top: 0 },
};
const l3swpIs = k => !!L3SWP_KINDS[k];
const l3swpEntry = (kind, id) => (L3SWP_CAT[kind] || []).find(x => x.id === id);
const l3swpSrc = x => (x && x.src === "AM" ? "ArcelorMittal" : x && x.src === "AA" ? "Aarsleff" : x && x.src === "SSAB" ? "SSAB" : x && x.src === "PK" ? "pålstandard" : "typiskt");
/* Sätter grundvärden och katalogmått när typen byts. */
function l3swpInit(s, force) {
  if (!l3swpIs(s.kind)) return; if (s._pk === s.kind && !force) return; s._pk = s.kind;
  const d = L3SWP_DEF[s.kind]; Object.assign(s, d); l3swpApply(s, l3swpEntry(s.kind, d.sel));
}
function l3swpApply(s, e) { if (!e) return; s.sel = e.id; ["b", "h", "tf", "tw", "kgm2", "kgm", "D", "cc", "tt", "a", "d0", "d1"].forEach(k => { if (e[k] != null) s["p_" + k] = e[k]; }); if (e.t) s.p_t = e.t; }

/* ---- Geometri ---- */
function l3swpThick(center, half) {   // mittlinje + halv godstjocklek per segment → sluten polygon (hörn: skärning mellan förskjutna linjer)
  const n = center.length - 1, seg = [];
  for (let i = 0; i < n; i++) { const a = center[i], b = center[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; seg.push({ a, d: [dx / l, dy / l], n: [-dy / l, dx / l], h: half[i] }); }
  const off = (sg, sgn) => [[sg.a[0] + sg.n[0] * sg.h * sgn, sg.a[1] + sg.n[1] * sg.h * sgn], [sg.a[0] + sg.d[0] * 0 + sg.n[0] * sg.h * sgn, sg.a[1] + sg.n[1] * sg.h * sgn]];
  const chain = sgn => {
    const out = []; const first = seg[0]; out.push([first.a[0] + first.n[0] * first.h * sgn, first.a[1] + first.n[1] * first.h * sgn]);
    for (let i = 1; i < n; i++) {
      const p = seg[i - 1], q = seg[i], P = [p.a[0] + p.n[0] * p.h * sgn, p.a[1] + p.n[1] * p.h * sgn], Q = [q.a[0] + q.n[0] * q.h * sgn, q.a[1] + q.n[1] * q.h * sgn], cr = p.d[0] * q.d[1] - p.d[1] * q.d[0];
      if (Math.abs(cr) < 1e-9) { out.push(Q); continue; }
      const t = ((Q[0] - P[0]) * q.d[1] - (Q[1] - P[1]) * q.d[0]) / cr; out.push([P[0] + p.d[0] * t, P[1] + p.d[1] * t]);
    }
    const last = seg[n - 1], e = [last.a[0] + last.d[0] * Math.hypot(center[n][0] - last.a[0], center[n][1] - last.a[1]), last.a[1] + last.d[1] * Math.hypot(center[n][0] - last.a[0], center[n][1] - last.a[1])];
    out.push([e[0] + last.n[0] * last.h * sgn, e[1] + last.n[1] * last.h * sgn]); return out;
  };
  void off; return [...chain(1), ...chain(-1).reverse()];
}
function l3swpSheetPoly(e, mirror) {   // planprofil (a = längs väggen, w = tvärs) för en pil: Z = zig-zag, U = tråg
  const b = e.b, h = e.h; let c;
  if (e.p_t === "U" || e.t === "U") { const f = 0.15 * b, x = 0.1 * b; c = [[0, 0], [f, 0], [f + x, h], [b - f - x, h], [b - f, 0], [b, 0]]; }
  else { const f = 0.27 * b; c = [[0, 0], [f, 0], [b - f, h], [b, h]]; }
  if (mirror) c = c.map(([a, w]) => [a, h - w]);
  const half = c.slice(1).map((q, i) => { const p = c[i], flat = Math.abs(q[1] - p[1]) < 1e-6; return (flat ? e.tf : e.tw) / 2; });
  return l3swpThick(c, half).map(([a, w]) => [a, w - h / 2]);   // centrerad på väggens mittlinje
}
function l3swpCircle(r, n = 24) { return Array.from({ length: n }, (_, i) => [r * Math.cos(2 * Math.PI * i / n), r * Math.sin(2 * Math.PI * i / n)]); }
function l3swpIPoly(h, b, tw, tf) { const hb = b / 2, hw = tw / 2, hh = h / 2; return [[-hb, -hh], [hb, -hh], [hb, -hh + tf], [hw, -hh + tf], [hw, hh - tf], [hb, hh - tf], [hb, hh], [-hb, hh], [-hb, hh - tf], [-hw, hh - tf], [-hw, -hh + tf], [-hb, -hh + tf]]; }
/* Prisma ur en planpolygon (med ev. hål) mellan z0 och z1. pos = [x,y], t = riktning längs, n = riktning tvärs. Ger { pts, faces } (1-baserade), utåtvända ytor. */
function l3swpPrism(poly, holes, z0, z1, pos, t, n, taper, sh) {
  const W = (q, k = 1) => [pos[0] + t[0] * q[0] * k + n[0] * q[1] * k, pos[1] + t[1] * q[0] * k + n[1] * q[1] * k];
  const loops = [poly, ...(holes || [])], pts = [], faces = [], ring = [];
  loops.forEach((lp, li) => { const lo = [], hi = []; lp.forEach(q => { const wlo = W(q, taper ? taper : 1), whi = W(q, 1); const S = typeof sh === "function" ? sh(q[0], q[1]) : sh; pts.push([wlo[0] + (S ? S[0] : 0), wlo[1] + (S ? S[1] : 0), z0]); lo.push(pts.length); pts.push([whi[0], whi[1], z1]); hi.push(pts.length); }); ring.push({ lo, hi }); });
  ring.forEach(({ lo, hi }) => { const m = lo.length; for (let i = 0; i < m; i++) { const j = (i + 1) % m; faces.push([lo[i], lo[j], hi[j]], [lo[i], hi[j], hi[i]]); } });
  const c2 = poly.map(q => new THREE.Vector2(q[0], q[1])), h2 = (holes || []).map(h => h.map(q => new THREE.Vector2(q[0], q[1])));
  let tri = []; try { tri = THREE.ShapeUtils.triangulateShape(c2, h2); } catch (e) { tri = []; }
  const idx = i => { let k = i, a = 0; for (let l = 0; l < loops.length; l++) { if (k < loops[l].length) return { l, k }; k -= loops[l].length; a++; } return { l: 0, k: 0 }; };
  const get = (i, top) => { const { l, k } = idx(i); return top ? ring[l].hi[k] : ring[l].lo[k]; };
  tri.forEach(f => { faces.push([get(f[0], 0), get(f[2], 0), get(f[1], 0)]); faces.push([get(f[0], 1), get(f[1], 1), get(f[2], 1)]); });
  let vol = 0; faces.forEach(f => { const a = pts[f[0] - 1], b = pts[f[1] - 1], c = pts[f[2] - 1]; vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; });
  if (vol < 0) faces.forEach(f => { const q = f[1]; f[1] = f[2]; f[2] = q; });
  return { pts, faces, vol: Math.abs(vol) };
}
function l3swpMerge() {   // samlar prismor till ett nät (delade punkter)
  const pts = [], faces = [], idx = new Map(), key = q => Math.round(q[0] * 1e4) + "," + Math.round(q[1] * 1e4) + "," + Math.round(q[2] * 1e4); let vol = 0, n = 0;
  return { add(pr) { const map = pr.pts.map(q => { const k = key(q); let i = idx.get(k); if (!i) { pts.push(q); i = pts.length; idx.set(k, i); } return i; }); pr.faces.forEach(f => { const a = map[f[0] - 1], b = map[f[1] - 1], c = map[f[2] - 1]; if (a !== b && b !== c && a !== c) faces.push([a, b, c]); }); vol += pr.vol; n++; }, get: () => ({ pts, faces, vol, n }) };
}
/* Stång/rör mellan två punkter (n-hörnigt tvärsnitt) – ankare, armering, injektering. */
function l3swpBar(p0, p1, r, n = 8) {
  const u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], l = Math.hypot(u[0], u[1], u[2]) || 1; for (let i = 0; i < 3; i++) u[i] /= l;
  let e1 = [u[1], -u[0], 0], m = Math.hypot(e1[0], e1[1]); if (m < 1e-6) { e1 = [1, 0, 0]; m = 1; } e1 = e1.map(v => v / m);
  const e2 = [u[1] * e1[2] - u[2] * e1[1], u[2] * e1[0] - u[0] * e1[2], u[0] * e1[1] - u[1] * e1[0]], pts = [], faces = [];
  for (let i = 0; i < n; i++) { const a = 2 * Math.PI * i / n, c = Math.cos(a) * r, sn = Math.sin(a) * r, o = [e1[0] * c + e2[0] * sn, e1[1] * c + e2[1] * sn, e1[2] * c + e2[2] * sn]; pts.push([p0[0] + o[0], p0[1] + o[1], p0[2] + o[2]], [p1[0] + o[0], p1[1] + o[1], p1[2] + o[2]]); }
  const c0 = pts.push([...p0]), c1 = pts.push([...p1]);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n, li = 2 * i + 1, hi = 2 * i + 2, lj = 2 * j + 1, hj = 2 * j + 2; faces.push([li, lj, hj], [li, hj, hi], [c0, lj, li], [c1, hi, hj]); }
  let vol = 0; faces.forEach(f => { const a = pts[f[0] - 1], b = pts[f[1] - 1], c = pts[f[2] - 1]; vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; });
  if (vol < 0) faces.forEach(f => { const q = f[1]; f[1] = f[2]; f[2] = q; });
  return { pts, faces, vol: Math.abs(vol) };
}
/* Tillägg som gäller alla påltyper/spont: toppbalk (kantbalk i betong eller fångbalk i stål), ankare/stag med injekteringskropp och ankarplattor, fogar i slitsmur. */
function l3swpAdds(s, X) {
  const parts = X.parts, fmt = l3swFmt, sign = X.sign, halfT = X.halfT, line = X.line || [];
  if (s.beam && s.beam !== "none" && line.length > 1) {
    const steel = s.beam === "steel", b = Math.max(0.05, +s.beam_b || (steel ? 0.3 : 0.6)), h = Math.max(0.05, +s.beam_h || (steel ? 0.3 : 0.5)), dz = steel ? (s.beam_dz != null && s.beam_dz !== "" ? +s.beam_dz : 0.5) : 0, MB = l3swpMerge(); let Lb = 0;
    for (let i = 0; i + 1 < line.length; i++) {
      const A = line[i], B = line[i + 1], dx = B[0] - A[0], dy = B[1] - A[1], Ls = Math.hypot(dx, dy); if (Ls < 0.05) continue; Lb += Ls;
      const t = [dx / Ls, dy / Ls], nn = [-t[1] * sign, t[0] * sign], zm = (A[2] + B[2]) / 2, z1 = steel ? zm - dz : zm - 0.1 + h, z0 = z1 - h, e0 = i > 0 ? b / 2 : 0, e1 = i + 2 < line.length ? b / 2 : 0, c0 = steel ? -(halfT + b / 2) : 0;
      (steel ? [[c0 - b / 2, c0 - 0.02], [c0 + 0.02, c0 + b / 2]] : [[c0 - b / 2, c0 + b / 2]]).forEach(([w0, w1]) => MB.add(l3swpPrism([[-e0, w0], [Ls + e1, w0], [Ls + e1, w1], [-e0, w1]], null, z0, z1, [A[0], A[1]], t, nn)));
    }
    const g = MB.get(); if (g.n) parts.push({ name: steel ? `Fångbalk (stål, 2 × UPE) ${fmt(b * 1000, 0)} × ${fmt(h * 1000, 0)} mm – ${fmt(Lb, 1)} m` : `Kantbalk (betong) ${fmt(b * 1000, 0)} × ${fmt(h * 1000, 0)} mm – ${fmt(Lb, 1)} m`, mesh: { pts: g.pts, faces: g.faces }, vol: g.vol, len: Lb, ifc: "IFCBEAM", color: steel ? "#5f6b78" : L3SWP_COL.conc, mass: g.vol * (steel ? L3SWP_STEEL * 0.35 : L3SWP_CONC) });
  }
  if (s.anch && (X.st || []).length) {
    const every = Math.max(1, Math.round(+s.anch_n || 2)), ang = (s.anch_a != null && s.anch_a !== "" ? +s.anch_a : 15) * Math.PI / 180, Lt = Math.max(1, +s.anch_l || 12), Lg = Math.min(Lt - 0.5, Math.max(1, +s.anch_g || 5)), dzA = s.anch_dz != null && s.anch_dz !== "" ? +s.anch_dz : 1, MA = l3swpMerge(), MG = l3swpMerge(), MP = l3swpMerge(); let na = 0;
    X.st.forEach((q, i) => {
      if (i % every) return; const z = q.z - dzA, k = halfT + 0.03, p0 = [q.pos[0] - q.n[0] * k, q.pos[1] - q.n[1] * k, z], dir = [q.n[0] * Math.cos(ang), q.n[1] * Math.cos(ang), -Math.sin(ang)], at = d => [p0[0] + dir[0] * d, p0[1] + dir[1] * d, p0[2] + dir[2] * d];
      MA.add(l3swpBar(p0, at(Lt), 0.02)); MG.add(l3swpBar(at(Lt - Lg), at(Lt), 0.08, 10));
      MP.add(l3swpPrism([[-.125, -.03], [.125, -.03], [.125, 0], [-.125, 0]], null, z - .125, z + .125, [q.pos[0] - q.n[0] * halfT, q.pos[1] - q.n[1] * halfT], q.t, q.n)); na++;
    });
    const ga = MA.get(), gg = MG.get(), gp = MP.get();
    if (na) { parts.push({ name: `Ankare (stag Ø 40) – ${na} st, ${fmt(Lt, 1)} m, ${fmt(+s.anch_a != null && !isNaN(+s.anch_a) && s.anch_a !== "" ? +s.anch_a : 15, 0)}° ned`, mesh: { pts: ga.pts, faces: ga.faces }, vol: ga.vol, len: Lt * na, ifc: "IFCMEMBER", color: "#475569", mass: ga.vol * L3SWP_STEEL });
      parts.push({ name: `Injekteringskropp (förankringslängd ${fmt(Lg, 1)} m) – ${na} st`, mesh: { pts: gg.pts, faces: gg.faces }, vol: gg.vol, len: Lg * na, ifc: "IFCBUILDINGELEMENTPROXY", color: "#a8a29e", mass: gg.vol * L3SWP_CONC });
      parts.push({ name: `Ankarplattor – ${na} st`, mesh: { pts: gp.pts, faces: gp.faces }, vol: gp.vol, len: 0.25 * na, ifc: "IFCPLATE", color: "#334155", mass: gp.vol * L3SWP_STEEL }); }
  }
  if (s.strut && (X.st || []).length) {   // stämpning: stålrör tvärs schaktet från väggens framsida (mot motstående vägg)
    const every = Math.max(1, Math.round(+s.strut_n || 4)), sw = Math.max(1, +s.strut_w || 8), dzS = s.strut_dz != null && s.strut_dz !== "" ? +s.strut_dz : 1.5, rd = Math.max(0.1, +s.strut_d || 0.4) / 2, MT = l3swpMerge(); let nt = 0;
    X.st.forEach((q, i) => { if (i % every) return; const z = q.z - dzS, k0 = halfT + 0.03; MT.add(l3swpBar([q.pos[0] - q.n[0] * k0, q.pos[1] - q.n[1] * k0, z], [q.pos[0] - q.n[0] * (k0 + sw), q.pos[1] - q.n[1] * (k0 + sw), z], rd, 12)); nt++; });
    const g = MT.get(); if (nt) parts.push({ name: `Stämp (stålrör Ø ${fmt(rd * 2000, 0)}) – ${nt} st, ${fmt(sw, 1)} m tvärs schaktet`, mesh: { pts: g.pts, faces: g.faces }, vol: g.vol, len: sw * nt, ifc: "IFCMEMBER", color: "#64748b", mass: g.vol * L3SWP_STEEL * 0.12 });
  }
  if (X.kind === "slits" && +s.panel > 0 && line.length > 1) {   // fogar (stoprör) mellan slitsarna
    const pl = Math.max(1, +s.panel), tt = +s.p_tt || 0.8, MJ = l3swpMerge(); let d = pl, acc = 0, n = 0;
    for (let i = 0; i + 1 < line.length; i++) { const A = line[i], B = line[i + 1], Ls = Math.hypot(B[0] - A[0], B[1] - A[1]); if (Ls < 0.05) continue; const t = [(B[0] - A[0]) / Ls, (B[1] - A[1]) / Ls], nn = [-t[1] * sign, t[0] * sign];
      while (d <= acc + Ls - 0.05) { const u = (d - acc) / Ls, zt = A[2] + (B[2] - A[2]) * u, p = [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u]; MJ.add(l3swpPrism(l3swpCircle(0.05, 12), null, zt - X.len, zt, [p[0], p[1]], t, nn)); n++; d += pl; } acc += Ls; }
    const g = MJ.get(); if (g.n) parts.push({ name: `Slitsfogar (stoprör) – ${n} st, slitslängd ${fmt(pl, 1)} m`, mesh: { pts: g.pts, faces: g.faces }, vol: g.vol, len: X.len * n, ifc: "IFCBUILDINGELEMENTPROXY", color: "#64748b", mass: g.vol * L3SWP_CONC });
  }
}
/* ---- Bygger delarna ---- */
function l3swpBuild(pts, s) {
  l3swpInit(s); const kind0 = s.kind;
  if (s.coords && (kind0 === "sheet" || kind0 === "slits")) return { parts: [], err: "Koordinatplacering gäller pålar (Berlinerspont, borrade, rör-, betong- och träpålar) – inte spont." };
  const coords = !!s.coords; if (!pts || pts.length < (coords ? 1 : 2)) return { parts: [], err: coords ? "Lägg in minst en koordinat." : "Linjen behöver minst två punkter." };
  const kind = s.kind, sign = s.soil === "R" ? -1 : 1, cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1]; if (L < 0.2 && !coords) return { parts: [], err: "Linjen är för kort." };
  if (kind === "slits") {   // platsgjuten vägg: samma svepning som en enkel mur
    const r = l3swBuildBase(pts, { ...s, kind: "plain", t: +s.p_tt || 0.8, H: Math.max(0.5, +s.len || 8), embed: Math.max(0.5, +s.len || 8) - (+s.top || 0) });
    (r.parts || []).forEach(p => { p.name = `Slitsmur ${l3swFmt(+s.p_tt || 0.8, 2)} m × ${l3swFmt(+s.len || 8, 1)} m djup`; p.ifc = "IFCWALL"; p.color = L3SWP_COL.conc; p.mass = p.vol * L3SWP_CONC; });
    const sTop = +s.top || 0; l3swpAdds(s, { parts: r.parts || (r.parts = []), sign, halfT: (+s.p_tt || 0.8) / 2, len: Math.max(0.5, +s.len || 8), kind: "slits", line: pts.map(q => [q[0], q[1], q[2] + sTop]), st: pts.map((q, k) => { const b = pts[Math.min(k + 1, pts.length - 1)], a = pts[Math.min(k, pts.length - 2)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, t = [dx / l, dy / l]; return { pos: [q[0], q[1]], t, n: [-t[1] * sign, t[0] * sign], z: q[2] + sTop }; }) });
    return { ...r, L };
  }
  const len = Math.max(0.5, +s.len || 8), top = +s.top || 0, tf = (a, d) => ({ x: pts[a][0] + (pts[a + 1][0] - pts[a][0]) * d, y: pts[a][1] + (pts[a + 1][1] - pts[a][1]) * d });
  const zAt = d => { let k = 1; while (k < cum.length - 1 && cum[k] < d) k++; const t = cum[k] > cum[k - 1] ? (d - cum[k - 1]) / (cum[k] - cum[k - 1]) : 0; return pts[k - 1][2] + (pts[k][2] - pts[k - 1][2]) * Math.max(0, Math.min(1, t)); };
  const dirAt = (d, i) => { const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  // stationer: jämnt fördelade per sträcka (c/c justeras så att linjens delar går jämnt upp)
  const stations = [], cc = Math.max(0.1, +s.p_cc || +s.cc || 1), bays = [];
  for (let i = 0; i + 1 < pts.length; i++) { const Ls = cum[i + 1] - cum[i]; if (Ls < 0.05) continue; const n = Math.max(1, Math.round(Ls / (kind === "sheet" ? (+s.p_b || 0.7) : cc))), step = Ls / n; for (let k = (stations.length ? 1 : 0); k <= n; k++) stations.push({ i, d: cum[i] + k * step, k, seg: i }); bays.push({ i, n, step }); }
  const cst = () => pts.map((q, k) => { const nb = k + 1 < pts.length ? [pts[k + 1][0] - q[0], pts[k + 1][1] - q[1]] : k > 0 ? [q[0] - pts[k - 1][0], q[1] - pts[k - 1][1]] : [1, 0], l = Math.hypot(nb[0], nb[1]) || 1, t = [nb[0] / l, nb[1] / l]; return { pos: [q[0], q[1]], t, n: [-t[1] * sign, t[0] * sign], z: q[2], zb: q[3] != null ? q[3] : null, sl: +q[4] || 0, name: q[5] || null, sp: q[6] != null ? !!q[6] : null, k, d: 0, i: 0 }; });   // pålar i inklistrade koordinater: riktningen följer raden
  if (coords) { stations.length = 0; cst().forEach(x => stations.push(x)); }
  const frame = st => { if (st.pos) return { pos: st.pos, t: st.t, n: st.n, z: st.z, zb: st.zb, sl: st.sl, name: st.name }; const t = dirAt(st.d, st.i), nn = [-t[1] * sign, t[0] * sign], p = tf(st.i, (st.d - cum[st.i]) / (cum[st.i + 1] - cum[st.i] || 1)); return { pos: [p.x, p.y], t, n: nn, z: zAt(st.d) + top }; };
  let halfT = 0.1; const spOK = [], sheetSt = [], parts = [], sheetPos = [], zTop = f => f.z, zBot = f => f.zb != null ? f.zb : f.z - len, tilt = f => f.sl ? [f.n[0] * (zTop(f) - zBot(f)) / f.sl, f.n[1] * (zTop(f) - zBot(f)) / f.sl] : null;
  const fmt = l3swFmt, name = (b, c) => `${b} – ${c}`;
  if (kind === "berlin") {
    const e = { h: +s.p_h, b: +s.p_b, tw: +s.p_tw, tf: +s.p_tf }, poly = l3swpIPoly(e.h, e.b, e.tw, e.tf), M = l3swpMerge(); halfT = e.h / 2;
    stations.forEach(st => { const f = frame(st); M.add(l3swpPrism(poly, null, zBot(f), zTop(f), f.pos, f.t, f.n)); });
    const g = M.get(), mass = (+s.p_kgm || 60) * len * stations.length;
    parts.push({ name: `Berlinerspont ${s.sel} – ${stations.length} pelare c/c ${fmt(cc, 2)} m, L ${fmt(len, 1)} m`, mesh: { pts: g.pts, faces: g.faces }, vol: g.vol, len: L, ifc: "IFCPILE", pile: "DRIVEN", color: L3SWP_COL.steel, mass });
    if (s.plug) {   // förborrat hål med betongplugg under schaktbotten
      const pD = Math.max(e.h, +s.plugD || 0.5), pl = Math.min(len, Math.max(0.5, +s.plugL || 3)), MPg = l3swpMerge();
      stations.forEach(st => { const f = frame(st); MPg.add(l3swpPrism(l3swpCircle(pD / 2, 20), [l3swpIPoly(e.h, e.b, e.tw, e.tf).slice().reverse()].map(q => q), zBot(f), zBot(f) + pl, f.pos, f.t, f.n)); });
      const gp = MPg.get(); if (gp.n) parts.push({ name: `Betongplugg Ø ${fmt(pD * 1000, 0)} – ${stations.length} st, ${fmt(pl, 1)} m`, mesh: { pts: gp.pts, faces: gp.faces }, vol: gp.vol, len: L, ifc: "IFCBUILDINGELEMENTPROXY", color: "#a8a29e", mass: gp.vol * L3SWP_CONC });
    }
    if (s.lag !== false && !coords) {
      const tp = Math.max(0.02, +s.tp || 0.075), D = Math.min(len, Math.max(0.3, +s.lagD || 4)), ML = l3swpMerge(), ov = 0.05;
      for (let k = 0; k + 1 < stations.length; k++) { const A0 = stations[k], B = stations[k + 1], A = A0.i === B.i ? A0 : { ...A0, i: B.i }; /* fack över en brytpunkt: utfackningen fortsätter i nästa riktning (förut föll den bort) */ const fa = frame(A), fb = frame(B), span = B.d - A.d, a0 = e.b / 2 - ov, a1 = span - e.b / 2 + ov; if (a1 <= a0) continue;
        const w0 = -e.h / 2 + e.tf; const poly2 = [[a0, w0], [a1, w0], [a1, w0 + tp], [a0, w0 + tp]]; ML.add(l3swpPrism(poly2, null, Math.max(zBot(fa), fa.z - D), fa.z, fa.pos, fa.t, fa.n)); void fb; }
      const gl = ML.get(); if (gl.n) parts.push({ name: `Berlinerspont – utfackning trä ${fmt(tp * 1000, 0)} mm, ned till ${fmt(D, 1)} m`, mesh: { pts: gl.pts, faces: gl.faces }, vol: gl.vol, len: L, ifc: "IFCPLATE", color: L3SWP_COL.lag, mass: gl.vol * L3SWP_TIMBER });
    }
  } else if (kind === "sheet") {
    const e = { b: +s.p_b, h: +s.p_h, tf: +s.p_tf, tw: +s.p_tw, p_t: s.p_t }, M = l3swpMerge(); let np = 0; halfT = e.h / 2 + e.tf / 2;
    bays.forEach(bay => { const sg = bay.i, Ls = cum[sg + 1] - cum[sg], n = Math.max(1, Math.round(Ls / e.b)), step = Ls / n, sc = step / e.b;   // pilarnas bredd anpassas något så att segmentet går jämnt upp
      for (let k = 0; k < n; k++) { const d = cum[sg] + k * step, t = dirAt(d, sg), nn = [-t[1] * sign, t[0] * sign], p = tf(sg, (d - cum[sg]) / (Ls || 1)), z = zAt(d) + top, poly = l3swpSheetPoly(e, k % 2 === 1).map(([a, w]) => [a * sc, w]); M.add(l3swpPrism(poly, null, z - len, z, [p.x, p.y], t, nn)); np++; sheetPos.push([p.x, p.y, z, z - len]); sheetSt.push({ pos: [p.x, p.y], t, n: nn, z });
        if (s.lock !== false) { const aM = Math.max(...poly.map(q => q[0])), am = Math.min(...poly.map(q => q[0])); [k === 0 ? am : null, aM].forEach(av => { if (av == null) return; const E = poly.filter(q => Math.abs(q[0] - av) < 1e-4), w = E.reduce((a, q) => a + q[1], 0) / E.length; M.add(l3swpPrism(l3swpCircle(0.032, 10), null, z - len, z, [p.x + t[0] * av + nn[0] * w, p.y + t[1] * av + nn[1] * w], t, nn)); }); } } });   // spontlås (klo/kula) i skarvarna
    const g = M.get(), mass = (+s.p_kgm2 || 130) * np * e.b * len;
    parts.push({ name: `Stålspont ${s.sel} – ${np} pålar, L ${fmt(len, 1)} m`, mesh: { pts: g.pts, faces: g.faces }, vol: g.vol, len: L, ifc: "IFCWALL", color: L3SWP_COL.steel, mass });
  } else if (kind === "bored") {
    const D = +s.p_D || 0.62, c = +s.p_cc || D, sec = c < D - 1e-6, M0 = l3swpMerge(), M1 = l3swpMerge(), poly = l3swpCircle(D / 2); halfT = D / 2;
    stations.length = 0; bays.length = 0; if (coords) cst().forEach(x => stations.push(x));
    else for (let i = 0; i + 1 < pts.length; i++) { const Ls = cum[i + 1] - cum[i]; if (Ls < 0.05) continue; const n = Math.max(1, Math.round(Ls / c)); for (let k = (stations.length ? 1 : 0); k <= n; k++) stations.push({ i, d: cum[i] + k * (Ls / n) }); }
    stations.forEach((st, k) => { const f = frame(st); (sec && k % 2 === 1 ? M1 : M0).add(l3swpPrism(poly, null, zBot(f), zTop(f), f.pos, f.t, f.n, 0, tilt(f))); });
    if (s.cage) {   // armeringskorgar: långjärn (+ överstick) i varje påle, i sekant bara de armerade
      const nb = Math.max(6, Math.min(24, Math.round(+s.cageN || 12))), Rr = Math.max(0.05, D / 2 - (+s.cover || 0.08)), MR = l3swpMerge();
      stations.forEach((st, k) => { if (sec && k % 2 === 0) return; const f = frame(st), sh = tilt(f) || [0, 0]; for (let i = 0; i < nb; i++) { const a = 2 * Math.PI * i / nb, ox = Math.cos(a) * Rr, oy = Math.sin(a) * Rr; MR.add(l3swpBar([f.pos[0] + ox + sh[0], f.pos[1] + oy + sh[1], zBot(f) + 0.2], [f.pos[0] + ox, f.pos[1] + oy, zTop(f) + 0.4], 0.0125, 6)); } });
      const gr = MR.get(); if (gr.n) parts.push({ name: `Armeringskorgar – ${nb} Ø 25 per ${sec ? "armerad " : ""}påle`, mesh: { pts: gr.pts, faces: gr.faces }, vol: gr.vol, len: L, ifc: "IFCBUILDINGELEMENTPROXY", color: "#7c2d12", mass: gr.vol * L3SWP_STEEL });
    }
    const g0 = M0.get(), g1 = M1.get(), nm = sec ? "Sekantpålevägg" : "Tangentpålevägg";
    parts.push({ name: `${nm} Ø ${fmt(D * 1000, 0)} – ${sec ? "primärpålar (oarmerade)" : stations.length + " pålar"}`, mesh: { pts: g0.pts, faces: g0.faces }, vol: g0.vol, len: L, ifc: "IFCPILE", pile: "BORED", color: L3SWP_COL.conc, mass: g0.vol * L3SWP_CONC });
    if (g1.n) parts.push({ name: `${nm} Ø ${fmt(D * 1000, 0)} c/c ${fmt(c * 1000, 0)} – sekundärpålar (armerade)`, mesh: { pts: g1.pts, faces: g1.faces }, vol: g1.vol, len: L, ifc: "IFCPILE", pile: "BORED", color: "#9aa3ad", mass: g1.vol * L3SWP_CONC });
  } else {
    const M = l3swpMerge(); let poly, holes = null, taper = 0, nm, mat, col, ifcc = "IFCPILE";
    if (kind === "tube") { const D = +s.p_D || 0.17; halfT = D / 2; const _x = 0; void _x; const tt0 = 0; void tt0; }
    if (kind === "tube") { const D = +s.p_D || 0.17, tt = +s.p_tt || 0.005; poly = l3swpCircle(D / 2); holes = [l3swpCircle(Math.max(0.01, D / 2 - tt)).reverse()]; nm = `Stålrörspålar Ø ${fmt(D * 1000, 1)} × ${fmt(tt * 1000, 1)}`; mat = L3SWP_STEEL; col = L3SWP_COL.steel; }
    else if (kind === "conc") { const a = +s.p_a || 0.27, h = a / 2; halfT = h; poly = [[-h, -h], [h, -h], [h, h], [-h, h]]; nm = `Betongpålar ${fmt(a * 1000, 0)} × ${fmt(a * 1000, 0)}`; mat = L3SWP_CONC; col = L3SWP_COL.conc; }
    else { const d0 = +s.p_d0 || 0.18, d1 = +s.p_d1 || 0.12; halfT = d0 / 2; poly = l3swpCircle(d0 / 2, 16); taper = d1 / d0; nm = `Träpålar topp Ø ${fmt(d0 * 1000, 0)} / spets Ø ${fmt(d1 * 1000, 0)}`; mat = L3SWP_TIMBER; col = s.treat === "imp" ? "#5d7a4f" : s.treat === "kreo" ? "#4a3526" : L3SWP_COL.timber; }
    const tsc = (f, k) => { const v = tilt(f); return v ? [v[0] * k, v[1] * k] : null; }, tipL = kind === "conc" && s.tip ? Math.min(len * 0.5, Math.max(0.2, +s.tipL || 0.6)) : 0;
    stations.forEach(st => { const f = frame(st);
      if (tipL) { const v = tsc(f, 1 - tipL / len) || [0, 0]; M.add(l3swpPrism(poly, null, zBot(f) + tipL, zTop(f), f.pos, f.t, f.n, 0, v)); M.add(l3swpPrism(poly, null, zBot(f), zBot(f) + tipL, [f.pos[0] + v[0], f.pos[1] + v[1]], f.t, f.n, 0.12, tsc(f, tipL / len))); }   // pålspets
      else M.add(l3swpPrism(poly, holes, zBot(f), zTop(f), f.pos, f.t, f.n, taper || 0, tilt(f))); });
    const g = M.get(); parts.push({ name: `${nm} – ${stations.length} pålar c/c ${fmt(cc, 2)} m, L ${fmt(len, 1)} m`, mesh: { pts: g.pts, faces: g.faces }, vol: g.vol, len: L, ifc: ifcc, pile: "DRIVEN", color: col, mass: g.vol * mat });
    if (kind === "tube" || kind === "timber") {   // pålsko, toppplatta, betongfyllning
      const Ro = kind === "tube" ? (+s.p_D || 0.17) / 2 : (+s.p_d1 || 0.12) / 2, MSh = l3swpMerge(), MCp = l3swpMerge(), MFl = l3swpMerge();
      stations.forEach(st => { const f = frame(st), v = tilt(f) || [0, 0];
        if (s.shoe) MSh.add(l3swpPrism(l3swpCircle(Ro * (kind === "tube" ? 1.0 : 1.0), 20), null, zBot(f) - (kind === "tube" ? 0.3 : 0.2), zBot(f), [f.pos[0] + v[0], f.pos[1] + v[1]], f.t, f.n, 0.25));
        if (s.cap && kind === "tube") MCp.add(l3swpPrism(l3swpCircle(Ro + 0.02, 24), null, zTop(f), zTop(f) + 0.015, f.pos, f.t, f.n));
        if (s.fill && kind === "tube") { const D = +s.p_D || 0.17, tt = +s.p_tt || 0.005, fh = Math.min(len, Math.max(0.5, +s.fillH || 3)); MFl.add(l3swpPrism(l3swpCircle(Math.max(0.01, D / 2 - tt), 20), null, zTop(f) - fh, zTop(f), f.pos, f.t, f.n, 0, tsc(f, 1 - fh / len))); } });
      const gs1 = MSh.get(), gc1 = MCp.get(), gf1 = MFl.get();
      if (gs1.n) parts.push({ name: `Pålsko (stål) – ${gs1.n} st`, mesh: { pts: gs1.pts, faces: gs1.faces }, vol: gs1.vol, len: L, ifc: "IFCPLATE", color: "#475569", mass: gs1.vol * L3SWP_STEEL });
      if (gc1.n) parts.push({ name: `Toppplatta – ${gc1.n} st`, mesh: { pts: gc1.pts, faces: gc1.faces }, vol: gc1.vol, len: L, ifc: "IFCPLATE", color: "#475569", mass: gc1.vol * L3SWP_STEEL });
      if (gf1.n) parts.push({ name: `Betongfyllning i rören – ${gf1.n} st, ${fmt(Math.min(len, Math.max(0.5, +s.fillH || 3)), 1)} m`, mesh: { pts: gf1.pts, faces: gf1.faces }, vol: gf1.vol, len: L, ifc: "IFCPILE", pile: "DRIVEN", color: L3SWP_COL.conc, mass: gf1.vol * L3SWP_CONC });
    }
    if (kind === "tube" && stations.length > 1 && (s.spont !== false || stations.some(st => st.sp))) {   // mellanspont: plattspont som hakar i kopplingslås påsvetsade på rören (Victor 2026-11-12)
      const R = (+s.p_D || 0.17) / 2, cl = [[0, -.035], [.06, -.035], [.06, -.008], [.052, -.008], [.052, -.02], [.008, -.02], [.008, .02], [.052, .02], [.052, .008], [.06, .008], [.06, .035], [0, .035]];
      const MC = l3swpMerge(), MS = l3swpMerge(), tw = Math.max(0.004, +s.p_sw || 0.012) / 2; let ns = 0;
      for (let k = 0; k + 1 < stations.length; k++) {
        if ((stations[k].sp != null ? !stations[k].sp : s.spont === false)) continue;   // en bock per mellanspont i tabellen
        const A = frame(stations[k]), B = frame(stations[k + 1]), dx = B.pos[0] - A.pos[0], dy = B.pos[1] - A.pos[1], dist = Math.hypot(dx, dy); if (dist - 2 * R < 0.2) continue;
        const t = [dx / dist, dy / dist], nn = [-t[1] * sign, t[0] * sign], mt = [-t[0], -t[1]], mn = [-nn[0], -nn[1]], zA0 = zBot(A), zA1 = zTop(A), zB0 = zBot(B), zB1 = zTop(B);
        const weld = [[R - .004, -.045], [R + .03, -.045], [R + .03, .045], [R - .004, .045]], claw = cl.map(q => [R + .03 + q[0], q[1]]);
        const sA = tilt(A), sB = tilt(B);   // lutande pålar: lås och spont följer med
        MC.add(l3swpPrism(weld, null, zA0, zA1, A.pos, t, nn, 0, sA)); MC.add(l3swpPrism(claw, null, zA0, zA1, A.pos, t, nn, 0, sA));
        MC.add(l3swpPrism(weld, null, zB0, zB1, B.pos, mt, mn, 0, sB)); MC.add(l3swpPrism(claw, null, zB0, zB1, B.pos, mt, mn, 0, sB));
        const a0 = R + .045, a1 = dist - R - .045, bw = Math.min(.016, tw + .006);
        const web = [[a0, -bw], [a0 + .03, -bw], [a0 + .03, -tw], [a1 - .03, -tw], [a1 - .03, -bw], [a1, -bw], [a1, bw], [a1 - .03, bw], [a1 - .03, tw], [a0 + .03, tw], [a0 + .03, bw], [a0, bw]];
        const shW = sA || sB ? (a => { const u = Math.max(0, Math.min(1, (a - a0) / (a1 - a0 || 1))), x = sA || [0, 0], y = sB || [0, 0]; return [x[0] + (y[0] - x[0]) * u, x[1] + (y[1] - x[1]) * u]; }) : null;
        MS.add(l3swpPrism(web, null, (zA0 + zB0) / 2 + .05, (zA1 + zB1) / 2 - .05, A.pos, t, nn, 0, shW)); ns++; spOK[k] = true;
      }
      const gc = MC.get(), gs = MS.get();
      if (gc.n) parts.push({ name: `Kopplingslås (påsvetsade på rören) – ${ns * 2} st`, mesh: { pts: gc.pts, faces: gc.faces }, vol: gc.vol, len: L, ifc: "IFCMEMBER", color: "#5f6b78", mass: gc.vol * L3SWP_STEEL });
      if (gs.n) parts.push({ name: `Mellanspont (plattspont) – ${ns} st, ${fmt(tw * 2000, 0)} mm`, mesh: { pts: gs.pts, faces: gs.faces }, vol: gs.vol, len: L, ifc: "IFCWALL", color: "#9aa4ae", mass: gs.vol * L3SWP_STEEL });
    }
  }
  l3swpAdds(s, { parts, sign, halfT, len, L, kind, line: coords ? stations.map(st => { const f = frame(st); return [f.pos[0], f.pos[1], zTop(f)]; }) : pts.map(q => [q[0], q[1], q[2] + top]), st: kind === "sheet" ? sheetSt : stations.map(st => { const f = frame(st); return { pos: f.pos, t: f.t, n: f.n, z: zTop(f) }; }) });
  const pos = kind === "sheet" ? sheetPos : stations.map(st => { const f = frame(st); return [f.pos[0], f.pos[1], zTop(f), zBot(f), f.sl || 0, f.name || null, kind === "tube" ? (stations.indexOf(st) + 1 < stations.length ? !!spOK[stations.indexOf(st)] : null) : undefined]; });
  return { parts, L, area: 0, piles: true, pos };
}
/* ---- Stödmurar (L-stöd, gjuten, gravitation, enkel): dränering, bärlager och räcke (Victor 2026-11-12) ---- */
const l3swpBaseKind = k => k === "L" || k === "cast" || k === "grav" || k === "plain";
function l3swpWallExtras(res, pts, s) {
  const P = l3swProfile(s), soilSign = s.soil === "R" ? -1 : 1, emb = Math.max(0, +s.embed || 0), H = Math.max(0.1, +s.H || 1), fmt = l3swFmt, parts = res.parts, st = pts.map(q => ({ x: q[0], y: q[1], z: q[2] - emb }));
  const maxU = v => { let m = -Infinity; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; if ((a[1] - v) * (b[1] - v) <= 0 && Math.abs(a[1] - b[1]) > 1e-9) { const t = (v - a[1]) / (b[1] - a[1]); m = Math.max(m, a[0] + (b[0] - a[0]) * t); } } return m === -Infinity ? Math.max(...P.map(q => q[0])) : m; };
  const minU = v => { let m = Infinity; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; if ((a[1] - v) * (b[1] - v) <= 0 && Math.abs(a[1] - b[1]) > 1e-9) { const t = (v - a[1]) / (b[1] - a[1]); m = Math.min(m, a[0] + (b[0] - a[0]) * t); } } return m === Infinity ? Math.min(...P.map(q => q[0])) : m; };
  const add = (poly, name, color, ifc, dens, extra) => { const sw = l3swSweep(poly, st, soilSign, true); parts.push({ name, mesh: { pts: sw.pts, faces: sw.faces }, vol: sw.vol, len: res.L, ifc, color, mass: sw.vol * dens, ...(extra || {}) }); };
  const bt = s.kind === "L" || s.kind === "cast" ? Math.min(H * 0.6, Math.max(0.05, +s.bt || 0.12)) : 0;
  if (s.drain) {   // dränering bakom muren: kross, dräneringsrör och fiberduk
    const dw = Math.max(0.1, +s.dr_w || 0.4), top = s.dr_top != null && s.dr_top !== "" ? +s.dr_top : 0.3, v0 = bt, v1 = Math.max(v0 + 0.2, H - top), a0 = maxU(v0 + 1e-3), a1 = maxU(v1 - 1e-3), ui = Math.min(a0, a1);
    add([[a0, v0], [a0 + dw, v0], [a1 + dw, v1], [a1, v1]], `Dränerande kross (${fmt(dw * 1000, 0)} mm) bakom muren`, "#9ca3af", "IFCBUILDINGELEMENTPROXY", 1700);
    const pc = [a0 + Math.min(0.15, dw / 2), v0 + 0.07], pr = 0.055; add(Array.from({ length: 14 }, (_, i) => [pc[0] + pr * Math.cos(2 * Math.PI * i / 14), pc[1] + pr * Math.sin(2 * Math.PI * i / 14)]), `Dräneringsrör Ø 110 – ${fmt(res.L, 1)} m`, "#1f2937", "IFCBUILDINGELEMENTPROXY", 900);
    const uo = Math.max(a0, a1) + dw, ft = 0.006; add([[uo, v0], [uo + ft, v0], [uo + ft, v1 + ft], [ui, v1 + ft], [ui, v1], [uo, v1]], `Fiberduk (geotextil) runt dräneringen`, "#d4d4d8", "IFCCOVERING", 300);
  }
  if (s.bed) {   // bärlager under sulan
    const bd = Math.max(0.05, +s.bed_t || 0.2), ex = 0.2, u0 = Math.min(...P.map(q => q[0])) - ex, u1 = Math.max(...P.map(q => q[0])) + ex;
    add([[u0, -bd], [u1, -bd], [u1, 0], [u0, 0]], `Bärlager (krossmaterial) ${fmt(bd * 1000, 0)} mm under sulan`, "#a1a1aa", "IFCBUILDINGELEMENTPROXY", 1900);
  }
  if (s.rail) {   // räcke på murens krön (framkant)
    const rh = Math.max(0.5, +s.rail_h || 1.1), cc = Math.max(0.5, +s.rail_cc || 1.8), u0 = minU(H - 1e-3) + 0.05, MP = l3swpMerge();
    const rr = (v0, v1) => [[u0 - 0.025, v0], [u0 + 0.025, v0], [u0 + 0.025, v1], [u0 - 0.025, v1]];
    add(rr(H + rh - 0.05, H + rh), `Räcke – handledare`, "#475569", "IFCRAILING", L3SWP_STEEL * 0.25); add(rr(H + rh / 2 - 0.025, H + rh / 2 + 0.025), `Räcke – mellanreling`, "#475569", "IFCRAILING", L3SWP_STEEL * 0.25);
    let d = 0, acc = 0, n = 0; const L = res.L;
    for (let i = 0; i + 1 < st.length; i++) { const A = st[i], B = st[i + 1], Ls = Math.hypot(B.x - A.x, B.y - A.y); if (Ls < 0.05) continue; const t = [(B.x - A.x) / Ls, (B.y - A.y) / Ls], nn = [-t[1] * soilSign, t[0] * soilSign];
      while (d <= acc + Ls + 1e-6) { const u = Math.min(1, (d - acc) / Ls), z = A.z + (B.z - A.z) * u + H, p = [A.x + (B.x - A.x) * u + nn[0] * u0, A.y + (B.y - A.y) * u + nn[1] * u0]; MP.add(l3swpPrism([[-.03, -.03], [.03, -.03], [.03, .03], [-.03, .03]], null, z, z + rh, p, t, nn)); n++; d += cc; } acc += Ls; }
    const gp = MP.get(); if (gp.n) parts.push({ name: `Räcke – stolpar (${n} st c/c ${fmt(cc, 1)} m)`, mesh: { pts: gp.pts, faces: gp.faces }, vol: gp.vol, len: res.L, ifc: "IFCRAILING", color: "#475569", mass: gp.vol * L3SWP_STEEL * 0.25 });
  }
}
function l3swpExtrasPanel(c) {
  const s = c.spec, el = document.getElementById("v3WallPanel"); if (!el || !l3swpBaseKind(s.kind) || el.querySelector("#v3SwXtra")) return; const grid = el.querySelector(".v3-rd-g"); if (!grid) return; const E = escHtml;
  const chk = (k, label, tip) => `<label class="v3-ga-tg" style="grid-column:1/3" title="${E(tip)}"><input type="checkbox" data-xk="${k}" ${s[k] ? "checked" : ""}><span>${label}</span></label>`;
  const num = (k, label, tip, unit, st, min, max, d) => `<label class="v3-rd-n" title="${E(tip)}"><span>${label}</span><input type="number" data-xn="${k}" value="${s[k] != null && s[k] !== "" ? s[k] : d}" min="${min}" max="${max}" step="${st}"><em>${unit}</em></label>`;
  let h = chk("drain", "Dränering bakom muren", "Dränerande kross, dräneringsrör Ø 110 och fiberduk bakom muren");
  if (s.drain) h += num("dr_w", "Krossbredd", "Dräneringszonens bredd bakom muren", "m", 0.05, 0.1, 2, 0.4) + num("dr_top", "Under krön", "Hur långt under murens överkant dräneringen slutar", "m", 0.05, 0, 3, 0.3);
  h += chk("bed", "Bärlager under sulan", "Krossmaterial under fundamentet, 0,2 m bredare på varje sida"); if (s.bed) h += num("bed_t", "Lagertjocklek", "Bärlagrets tjocklek", "m", 0.05, 0.05, 1, 0.2);
  h += chk("rail", "Räcke på krön", "Stolpar, handledare och mellanreling vid murens framkant"); if (s.rail) h += num("rail_h", "Räckeshöjd", "Räckets höjd över krönet", "m", 0.05, 0.5, 2, 1.1) + num("rail_cc", "Stolpar c/c", "Avstånd mellan stolparna", "m", 0.1, 0.5, 4, 1.8);
  const d = document.createElement("div"); d.id = "v3SwXtra"; d.className = "v3-rd-g"; d.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;margin-top:6px;border-top:1px solid #e2e8f0;padding-top:6px"; d.innerHTML = `<div style="grid-column:1/3;font-size:11px;font-weight:600;color:#475569">Tillägg</div>` + h; grid.after(d);
  const re = () => { l3swPanel(); l3swDraw(); };
  d.querySelectorAll("[data-xk]").forEach(i => { i.onchange = () => { s[i.dataset.xk] = i.checked; re(); }; });
  d.querySelectorAll("[data-xn]").forEach(i => { i.onchange = () => { const v = Number(String(i.value).replace(",", ".")); if (Number.isFinite(v)) s[i.dataset.xn] = v; re(); }; });
}
/* ---- Inkoppling i Stödmur-verktyget ---- */
const l3swBuildBase = l3swBuild;
l3swBuild = function (pts, s) { if (l3swpIs(s.kind)) return l3swpBuild(pts, s); const r = l3swBuildBase(pts, s); if (r.parts && r.parts.length && (s.drain || s.bed || s.rail)) l3swpWallExtras(r, pts, s); return r; };
const l3swPanelBase = l3swPanel;
l3swPanel = function () {
  const c = l3sw.cur; if (c && l3swpIs(c.spec.kind)) l3swpInit(c.spec);
  l3swPanelBase(); const c2 = l3sw.cur; if (c2 && !l3swpIs(c2.spec.kind)) l3swpExtrasPanel(c2); if (c2 && l3swpIs(c2.spec.kind)) l3swpPanelFix(c2);
  if (c2 && c2.editSet) { const mk = document.querySelector('#v3WallPanel [data-wb="make"]'); if (mk) { mk.textContent = "Uppdatera"; mk.title = "Ersätter den utförda stödmuren/pålningen med ändringarna"; } }
};
function l3swpPanelFix(c) {
  const s = c.spec, el = document.getElementById("v3WallPanel"); if (!el) return; const grid = el.querySelector(".v3-rd-g"); if (!grid) return; const E = escHtml, k = s.kind, cat = L3SWP_CAT[k] || [];
  const num = (key, label, tip, unit, st, min, max) => `<label class="v3-rd-n" title="${E(tip)}"><span>${label}</span><input type="number" data-wp="${key}" value="${s[key] != null ? Math.round(s[key] * 1e4) / 1e4 : ""}" min="${min}" max="${max}" step="${st}"><em>${unit}</em></label>`;
  const f = {
    berlin: num("p_cc", "Pelare c/c", "Avstånd mellan stålpelarna (vanligt 1,5–3 m)", "m", 0.1, 0.5, 6) + num("len", "Pållängd", "Pelarens totala längd (inkl. intryckning under schaktbotten)", "m", 0.5, 1, 30) + num("top", "Överkant", "Pelarnas överkant relativt linjens höjd (+ = över)", "m", 0.1, -5, 5)
      + `<label class="v3-ga-tg" title="Plankor (trä) mellan pelarna, läggs i takt med schaktet"><input type="checkbox" data-wpchk="lag" ${s.lag !== false ? "checked" : ""}><span>Utfackning (plankor)</span></label>` + (s.lag !== false ? num("tp", "Plankor tjocklek", "Plankornas tjocklek (50–75 mm är vanligt)", "m", 0.005, 0.02, 0.2) + num("lagD", "Plankor till djup", "Hur djupt plankorna går (grävdjupet)", "m", 0.5, 0.3, 30) : ""),
    sheet: num("len", "Spontlängd", "Spontens totala längd", "m", 0.5, 1, 40) + num("top", "Överkant", "Spontens överkant relativt linjens höjd (+ = över)", "m", 0.1, -5, 5),
    bored: num("p_D", "Pålens Ø", "Borrad påles diameter", "m", 0.01, 0.2, 2) + num("p_cc", "c/c", "Mitt–mitt. Mindre än diametern = sekantpålar (överlappande), lika med diametern = tangentpålar", "m", 0.005, 0.2, 3) + num("len", "Pållängd", "Pålens längd", "m", 0.5, 1, 40) + num("top", "Överkant", "Överkant relativt linjens höjd", "m", 0.1, -5, 5),
    tube: num("p_D", "Ytterdiameter", "Rörets ytterdiameter", "m", 0.001, 0.05, 1.5) + num("p_tt", "Godstjocklek", "Rörets godstjocklek", "m", 0.0005, 0.003, 0.05) + num("p_cc", "c/c", "Mitt–mitt mellan pålarna", "m", 0.05, 0.1, 6) + num("len", "Pållängd", "Pålens längd", "m", 0.5, 1, 60) + num("top", "Överkant", "Överkant relativt linjens höjd", "m", 0.1, -5, 5) + `<label class="v3-ga-tg" title="Plattspont mellan rören som hakar i kopplingslås påsvetsade på rören"><input type="checkbox" data-wpchk="spont" ${s.spont !== false ? "checked" : ""}><span>Mellanspont (plattspont + kopplingslås)</span></label>`,
    conc: num("p_a", "Sidmått", "Pålens sida (kvadratisk)", "m", 0.005, 0.15, 0.6) + num("p_cc", "c/c", "Mitt–mitt mellan pålarna (minst ca 3 × sidmått i en pålgrupp)", "m", 0.05, 0.2, 6) + num("len", "Pållängd", "Pålens längd", "m", 0.5, 1, 60) + num("top", "Överkant", "Överkant relativt linjens höjd", "m", 0.1, -5, 5),
    timber: num("p_d0", "Topp Ø", "Toppdiameter", "m", 0.01, 0.1, 0.5) + num("p_d1", "Spets Ø", "Spetsdiameter (pålen smalnar av jämnt)", "m", 0.01, 0.05, 0.4) + num("p_cc", "c/c", "Mitt–mitt mellan pålarna", "m", 0.05, 0.1, 6) + num("len", "Pållängd", "Pålens längd", "m", 0.5, 1, 30) + num("top", "Överkant", "Överkant relativt linjens höjd", "m", 0.1, -5, 5),
    slits: num("p_tt", "Tjocklek", "Väggens tjocklek", "m", 0.05, 0.3, 2) + num("len", "Djup", "Väggens djup under linjen", "m", 0.5, 1, 40) + num("top", "Överkant", "Överkant relativt linjens höjd", "m", 0.1, -5, 5),
  }[k] || "";
  const kindSel = `<label class="v3-rd-n" style="grid-column:1/3"><span>Typ</span><select data-wpkind style="flex:1">${Object.entries(L3SW_KINDS).map(([kk, v]) => `<option value="${kk}" ${s.kind === kk ? "selected" : ""}>${E(v)}</option>`).join("")}</select></label>`;
  const stdSel = `<label class="v3-rd-n" style="grid-column:1/3" title="Standardprofiler – källa visas efter namnet. Typiska mått: kontrollera mot tillverkarens datablad"><span>Standard</span><select data-wpstd style="flex:1"><option value="">Egna mått</option>${cat.map(x => `<option value="${E(x.id)}" ${s.sel === x.id ? "selected" : ""}>${E(x.id)} · ${l3swpSrc(x)}</option>`).join("")}</select></label>`;
  const soil = `<label class="v3-rd-n" title="Vilken sida jorden ligger på (styr bl.a. var plankorna sitter)"><span>Jord åt</span><select data-wpsoil><option value="L" ${s.soil !== "R" ? "selected" : ""}>vänster</option><option value="R" ${s.soil === "R" ? "selected" : ""}>höger</option></select></label>`;
  const chk = (key, label, tip, dflt) => `<label class="v3-ga-tg" title="${E(tip)}" style="grid-column:1/3"><input type="checkbox" data-wpchk="${key}" ${(dflt ? s[key] !== false : !!s[key]) ? "checked" : ""}><span>${label}</span></label>`;
  const sel = (key, label, tip, opts) => `<label class="v3-rd-n" style="grid-column:1/3" title="${E(tip)}"><span>${label}</span><select data-wpsel="${key}" style="flex:1">${opts.map(([v, t]) => `<option value="${v}" ${String(s[key] || "") === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>`;
  const def = (key, v) => { if (s[key] == null || s[key] === "") s[key] = v; };
  let ex = "";
  if (k === "berlin") { ex += chk("plug", "Betongplugg (förborrat hål)", "Pelaren står i ett förborrat hål som gjutits med betong under schaktbotten"); if (s.plug) { def("plugD", 0.5); def("plugL", 3); ex += num("plugD", "Hål Ø", "Håldiameter", "m", 0.05, 0.3, 1.2) + num("plugL", "Plugglängd", "Betongens längd uppåt från pelarens spets", "m", 0.5, 0.5, 15); } }
  if (k === "sheet") ex += chk("lock", "Spontlås (klo/kula i skarvarna)", "Ritar spontens lås i skarvarna mellan plankorna", true);
  if (k === "bored") { ex += chk("cage", "Armeringskorgar", "Långjärn i varje påle (vid sekantpålar bara i de armerade sekundärpålarna)"); if (s.cage) { def("cageN", 12); def("cover", 0.08); ex += num("cageN", "Antal järn", "Antal längsgående järn per påle", "st", 1, 6, 24) + num("cover", "Täckskikt", "Avstånd från pålens yta till järnens mitt", "m", 0.005, 0.04, 0.2); } }
  if (k === "tube") { ex += chk("shoe", "Pålsko (konisk spets)", "Konisk stålsko under rörets spets"); ex += chk("cap", "Toppplatta", "Platta över rörets överkant"); ex += chk("fill", "Betongfyllda rör", "Betong i rören ned från överkant"); if (s.fill) { def("fillH", 3); ex += num("fillH", "Fyllning", "Betongfyllningens höjd från överkant", "m", 0.5, 0.5, 60); } }
  if (k === "conc") { ex += chk("tip", "Pålspets (avsmalnad)", "Pålens nedre del smalnar av till en spets"); if (s.tip) { def("tipL", 0.6); ex += num("tipL", "Spetslängd", "Längd på den avsmalnande spetsen", "m", 0.1, 0.2, 3); } }
  if (k === "timber") { ex += chk("shoe", "Stålsko på spetsen", "Konisk stålsko på pålens spets"); ex += sel("treat", "Behandling", "Styr färgen", [["", "Obehandlad"], ["imp", "Tryckimpregnerad (grön)"], ["kreo", "Kreosot (mörk)"]]); }
  if (k === "slits") ex += num("panel", "Slitslängd", "Avstånd mellan fogarna (stoprör). 0 = inga fogar", "m", 0.5, 0, 12);
  ex += sel("beam", "Toppbalk", "Kantbalk i betong på pålhuvudena eller fångbalk i stål längs fronten", [["none", "Ingen"], ["conc", "Kantbalk (betong)"], ["steel", "Fångbalk (stål, 2 × UPE)"]]);
  if (s.beam === "conc" || s.beam === "steel") { const st = s.beam === "steel"; def("beam_b", st ? 0.3 : 0.6); def("beam_h", st ? 0.3 : 0.5); ex += num("beam_b", "Balk bredd", "Balkens bredd", "m", 0.05, 0.1, 2) + num("beam_h", "Balk höjd", "Balkens höjd", "m", 0.05, 0.1, 2) + (st ? (def("beam_dz", 0.5), num("beam_dz", "Nivå under ÖK", "Balkens överkant under väggens överkant", "m", 0.1, 0, 10)) : ""); }
  ex += chk("strut", "Stämpning (tvärs schaktet)", "Stålrörsstämp från väggens framsida mot motstående vägg, ett alternativ/komplement till ankare");
  if (s.strut) { def("strut_w", 8); def("strut_n", 4); def("strut_dz", 1.5); def("strut_d", 0.4); ex += num("strut_w", "Schaktbredd", "Stämpens längd – avståndet till motstående vägg", "m", 0.5, 1, 40) + num("strut_n", "Var N:e påle", "Stämp i var N:e påle/spontplanka (placera på fångbalken)", "st", 1, 1, 20) + num("strut_dz", "Djup under ÖK", "Stämpens nivå under väggens överkant", "m", 0.1, 0, 20) + num("strut_d", "Rör Ø", "Stämpens ytterdiameter", "m", 0.05, 0.1, 1.2); }
  ex += chk("anch", "Ankare / stag", "Förankring bakåt i jorden: stag med injekteringskropp och ankarplatta");
  if (s.anch) { def("anch_n", 2); def("anch_l", 12); def("anch_a", 15); def("anch_dz", 1); def("anch_g", 5); ex += num("anch_n", "Var N:e påle", "Ankare i var N:e påle/spontplanka", "st", 1, 1, 20) + num("anch_l", "Längd", "Ankarets totala längd", "m", 0.5, 2, 40) + num("anch_a", "Vinkel ned", "Lutning nedåt in i jorden", "°", 1, 0, 60) + num("anch_dz", "Djup under ÖK", "Ankarets läge under väggens överkant", "m", 0.1, 0, 20) + num("anch_g", "Injektering", "Förankringslängd (injekteringskroppens längd i änden)", "m", 0.5, 1, 20); }
  grid.innerHTML = kindSel + stdSel + f + ex + soil;
  // sammanfattningen: massa efter rätt material
  const r = c.res || { parts: [] }, mass = (r.parts || []).reduce((a, p) => a + (p.mass != null ? p.mass : p.vol * L3SW_DENS), 0), note = el.querySelector(".v3-vq-note");
  if (note) note.textContent = `${(r.parts || []).length} del${(r.parts || []).length === 1 ? "" : "ar"} · volym ${l3swFmt((r.parts || []).reduce((a, p) => a + p.vol, 0), 2)} m³ · ca ${l3swFmt(mass / 1000, 1)} ton`;
  const mk = el.querySelector('[data-wb="make"]'); if (mk) mk.textContent = k === "berlin" || k === "sheet" || k === "slits" ? "Skapa spont" : "Skapa pålar";
  const hint = el.querySelector(".v3-pal-hint"); if (hint) hint.textContent = "Tryck ut linjen (pålradens/spontens mittlinje). Dra i ringarna för att flytta punkter, ＋ lägger till en punkt. Profilerna AZ/PU är från ArcelorMittal, sekantmått från Aarsleff, övrigt typiskt – kontrollera mot datablad och konstruktörens handlingar.";
  const hs = el.querySelector(".v3-vq-note + .v3-rd-g"); void hs;
  const re = () => { l3swPanel(); l3swDraw(); };
  el.querySelector("[data-wpkind]").onchange = e => { s.kind = e.target.value; s.typ = ""; if (l3swpIs(s.kind)) l3swpInit(s, true); else if (s.kind === "L") l3swApplyType(s, l3swType("L:" + (Math.round(s.H * 5) / 5)) || l3swType("L:1.6")); re(); };
  el.querySelector("[data-wpstd]").onchange = e => { if (e.target.value) l3swpApply(s, l3swpEntry(s.kind, e.target.value)); else s.sel = ""; re(); };
  el.querySelector("[data-wpsoil]").onchange = e => { s.soil = e.target.value; re(); };
  el.querySelectorAll("[data-wp]").forEach(i => { i.onchange = () => { const v = Number(String(i.value).replace(",", ".")); if (Number.isFinite(v)) { s[i.dataset.wp] = v; if (/^p_/.test(i.dataset.wp)) s.sel = ""; } re(); }; });
  el.querySelectorAll("[data-wpsel]").forEach(i => { i.onchange = () => { s[i.dataset.wpsel] = i.value; if (i.dataset.wpsel === "beam") { delete s.beam_b; delete s.beam_h; delete s.beam_dz; } re(); }; });
  el.querySelectorAll("[data-wpchk]").forEach(i => { i.onchange = () => { s[i.dataset.wpchk] = i.checked; if (i.dataset.wpchk === "spont" && c.pts) c.pts.forEach(q => { if (q.length > 6) q[6] = null; }); re(); }; });
  l3swpActs(el, c, grid, re);
}
/* Tabell över placeringen (X, Y, Z) och inklistrade koordinater (Victor 2026-11-12). */
function l3swpActs(el, c, grid, re) {
  const s = c.spec; let bar = el.querySelector(".v3-swp-acts"); if (bar) bar.remove();
  bar = document.createElement("div"); bar.className = "v3-swp-acts";
  bar.innerHTML = `<button type="button" data-swpt title="Lista över varje påles/spontpils läge: X, Y, Z (överkant och spets) – kopiera till Excel eller spara som CSV">▤ Tabell X Y Z</button><button type="button" data-swpp title="Skriv eller klistra in koordinater (X Y Z, en per rad) – pålarna placeras där">⎘ Klistra in X Y Z…</button>${s.coords ? `<button type="button" data-swpl title="Gå tillbaka till att placera längs linjen">↩ Längs linjen</button>` : ""}${s.coords ? `<div class="v3-pal-hint" style="width:100%">Pålarna står i de inklistrade koordinaterna (${c.pts.length} st). Dra i ringarna för att flytta en påle.</div>` : ""}`;
  grid.insertAdjacentHTML("afterend", ""); grid.parentNode.insertBefore(bar, grid.nextSibling);
  bar.querySelector("[data-swpt]").onclick = () => l3swpTable(c);
  bar.querySelector("[data-swpp]").onclick = () => l3swpPaste();
  const bl = bar.querySelector("[data-swpl]"); if (bl) bl.onclick = () => { delete s.coords; re(); };
}
const l3swpF = (v, d = 3) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace(".", ",");
const l3swpT = { c: null, refresh: null };
const l3swpF3 = v => (Math.round(v * 1000) / 1000).toFixed(3), l3swpOK = v => (v >= 0 ? "+" : "") + l3swpF3(v), l3swpN = x => { const t = String(x).trim().replace(/\s/g, "").replace(",", "."); const v = Number(t); return t !== "" && Number.isFinite(v) ? v : null; };
function l3swpTypeLabel(s) {   // påltyp som i pållistan, t.ex. RD 220/12.5
  if (s.kind === "tube") { const nm = (s.sel || "").split(" (")[0] || ("RD " + Math.round((+s.p_D || 0.17) * 1000)), tt = Math.round((+s.p_tt || 0.005) * 10000) / 10; return `${nm}/${String(tt).replace(",", ".")}`; }
  return (s.sel || L3SW_KINDS[s.kind] || "").split(" – ")[0];
}
function l3swpTable(c) {
  const r0 = c.res || l3swBuild(c.pts, c.spec); if (!((r0 && r0.pos) || []).length) { l3Status("Inga pålar att visa än.", true); return; }
  const editable = c.spec.kind !== "sheet" && c.spec.kind !== "slits";
  const cur = () => ((l3sw.cur === c && c.res && c.res.pos) || (r0 && r0.pos) || []);
  const nm = (q, i) => q[5] || "P" + (1001 + i), ty = () => l3swpTypeLabel(c.spec);
  const rowsHtml = () => cur().map((q, i) => { const cell = (k, v) => editable ? `<td><input type="text" inputmode="decimal" data-k="${k}" value="${v}"></td>` : `<td>${v}</td>`;
    return `<tr data-i="${i}"><td>${editable ? `<input type="text" class="l" data-k="n" value="${escHtml(nm(q, i))}">` : escHtml(nm(q, i))}</td><td class="ty">${escHtml(ty())}</td>${cell(0, l3swpF3(q[0]))}${cell(1, l3swpF3(q[1]))}${cell("s", String(Math.round((q[4] || 0) * 100) / 100))}${cell(2, l3swpOK(q[2]))}${cell("L", l3swpF3(q[2] - q[3]))}${tube ? `<td class="v3-swp-c">${i + 1 < cur().length ? `<input type="checkbox" data-sp ${q[6] ? "checked" : ""} ${editable ? "" : "disabled"} title="Mellanspont till påle ${i + 2}">` : ""}</td>` : ""}${editable ? `<td class="v3-swp-x"><button type="button" data-del title="Ta bort pålen">✕</button></td>` : ""}</tr>`; }).join("");
  const tube = c.spec.kind === "tube", head = `<tr><th class="l">Littera</th><th class="l">Påltyp</th><th>X (m)</th><th>Y (m)</th><th>Lutning (X:1)</th><th>ÖK påle (m)</th><th>Antagen pållängd (m)</th>${tube ? '<th title="Mellanspont (plattspont + kopplingslås) mellan den här pålen och nästa">Spont till nästa</th>' : ''}${editable ? "<th></th>" : ""}</tr>`;
  const d = l3Dlg("v3SwpTbl", `Pålar – koordinater (${cur().length})`, `<div class="v3-swp-tw"><table class="v3-swp-t"><thead>${head}</thead><tbody>${rowsHtml()}</tbody></table></div>
    ${editable ? `<div class="v3-swp-note">Tabellen visar modellen och går att ändra – pålen flyttas direkt i bilden, och tvärtom. Ändrar du något blir pålarna fristående punkter (c/c följer inte längre linjen). Lutning 0 = lodrät, 10 = 10:1 mot jordsidan, minus åt andra hållet.</div>` : ""}
    <div class="v3-gd-btns">${editable ? `<button type="button" data-tadd>＋ Rad</button>` : ""}<button type="button" data-tcopy>Kopiera (Excel)</button><button type="button" data-tcsv>Spara CSV</button></div>`, { onClose: () => { if (l3swpT.c === c) { l3swpT.c = null; l3swpT.refresh = null; } } });
  d.style.width = "min(760px, 94%)"; d.style.resize = "both"; d.style.overflow = "hidden"; d.style.minWidth = "420px"; d.style.minHeight = "220px"; d.style.height = "min(560px, 80%)"; d.classList.add("v3-swp-dlg");
  const body = d.querySelector("tbody"), toCoords = () => { if (c.spec.coords) return; c.pts = cur().map(q => [q[0], q[1], q[2], null, q[4] || null, q[5] || null]); c.spec.coords = true; };
  const refresh = () => { const ae = document.activeElement; if (ae && body.contains(ae) && ae.tagName === "INPUT") return; body.innerHTML = rowsHtml(); const h = d.querySelector(".v3-dlg-h b"); if (h) h.textContent = `Pålar – koordinater (${cur().length})`; };
  l3swpT.c = c; l3swpT.refresh = refresh;
  if (editable) {
    body.addEventListener("change", e => {
      const inp = e.target.closest("input[data-k]"); if (!inp) return; const i = +inp.closest("tr").dataset.i, k = inp.dataset.k; toCoords(); const q = c.pts[i]; if (!q) return;
      if (k === "n") { q[5] = inp.value.trim() || null; }
      else { const v = l3swpN(inp.value); if (v == null) { inp.value = ""; refresh(); return; }
        if (k === "0" || k === "1") q[+k] = v; else if (k === "2") { const dz = v - q[2]; q[2] = v; if (q[3] != null) q[3] += dz; } else if (k === "s") q[4] = v || null; else if (k === "L") q[3] = q[2] - Math.max(0.1, v); }
      l3swDraw(); body.innerHTML = rowsHtml();
    });
    body.addEventListener("change", e => { const cb = e.target.closest("input[data-sp]"); if (!cb) return; const i = +cb.closest("tr").dataset.i; toCoords(); if (c.pts[i]) c.pts[i][6] = cb.checked; l3swDraw(); body.innerHTML = rowsHtml(); });
    body.addEventListener("click", e => { const b = e.target.closest("[data-del]"); if (!b) return; if (cur().length <= 1) { l3Status("Minst en påle måste finnas kvar.", true); return; } toCoords(); c.pts.splice(+b.closest("tr").dataset.i, 1); l3swDraw(); body.innerHTML = rowsHtml(); });
    d.querySelector("[data-tadd]").onclick = () => { toCoords(); const L = c.pts[c.pts.length - 1], Pv = c.pts[c.pts.length - 2] || [L[0] - 1, L[1], L[2]], dx = L[0] - Pv[0], dy = L[1] - Pv[1], l = Math.hypot(dx, dy) || 1, st = Math.max(0.1, +c.spec.p_cc || 1); c.pts.push([L[0] + dx / l * st, L[1] + dy / l * st, L[2], L[3], L[4], null]); l3swDraw(); body.innerHTML = rowsHtml(); };
  }
  const lines = dec => cur().map((q, i) => [nm(q, i), ty(), l3swpF3(q[0]), l3swpF3(q[1]), String(Math.round((q[4] || 0) * 100) / 100), l3swpOK(q[2]), l3swpF3(q[2] - q[3])].map((v, k) => k > 1 ? v.replace(".", dec) : v));
  const H = ["Littera", "Påltyp", "X (m)", "Y (m)", "Lutning (X:1)", "ÖK påle (m)", "Antagen pållängd (m)"];
  d.querySelector("[data-tcopy]").onclick = async () => { try { await navigator.clipboard.writeText([H, ...lines(".")].map(r => r.join("\t")).join("\n")); l3Toast("Tabellen är kopierad – klistra in i Excel."); } catch (e) { l3Status("Kunde inte kopiera: " + e.message, true); } };
  d.querySelector("[data-tcsv]").onclick = () => { const csv = [H, ...lines(",")].map(r => r.join(";")).join("\r\n"), a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = "palar-koordinater.csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000); };
}
{ const _d = l3swDraw, _c = l3swClose;   // tabellen följer modellen
  l3swDraw = function () { _d.apply(this, arguments); if (l3swpT.refresh && l3sw.cur === l3swpT.c) l3swpT.refresh(); };
  l3swClose = function (keep) { if (l3swpT.c) l3DlgClose("v3SwpTbl"); return _c.apply(this, arguments); }; }
/* Läser rader som "X Y Z", "X;Y;Z", "nr X Y Z" eller "X,Y,Z" (komma som decimaltecken går bra när raden delas med tabb, semikolon eller mellanslag). */
function l3swpParseXYZ(text) {
  const out = [], bad = [], num = x => { const v = Number(String(x).replace(",", ".")); return Number.isFinite(v) && /^[-+]?[\d.,]+(e[-+]?\d+)?$/i.test(x) ? v : null; };
  String(text || "").split(/\r?\n/).forEach((ln, i) => {
    ln = ln.trim(); if (!ln) return;
    if (/littera|påltyp|paltyp|lutning|pållängd|pallangd|^ök\b|^\(?m\)?$|^antagen|x:1/i.test(ln) && !/\d{4,}/.test(ln)) return;   // rubrikrader ur en pållista
    const sep = /[;\t]/.test(ln) ? /[;\t]+/ : /\s/.test(ln) ? /\s+/ : /,/;
    let tk = ln.split(sep).map(x => x.trim()).filter(Boolean); if (sep.source === ",") tk = tk.map(x => x.replace(",", "."));
    // pållista: Littera  Påltyp  X  Y  Lutning  ÖK  Pållängd (t.ex. "P1001 RD 220/12.5 169184.257 7456585.734 0 +432.000 9.000")
    if (tk.length >= 7 && num(tk[0]) === null && tk.slice(-5).every(x => num(x) !== null)) {
      const n5 = tk.slice(-5).map(num), q = [n5[0], n5[1], n5[3]]; q.name = tk[0]; q.type = tk.slice(1, -5).join(" "); q.slope = n5[2]; q.len = n5[4]; out.push(q); return;
    }
    let v = tk.map(num); if (v.length && v[0] === null) { v = v.slice(1); }   // namn/nr först på raden
    else if (v.length === 4 && Number.isInteger(v[0]) && Math.abs(v[0]) < 100000) v = v.slice(1);
    v = v.filter(x => x !== null);
    if (v.length >= 2) out.push([v[0], v[1], v.length >= 3 ? v[2] : null]); else bad.push(i + 1);
  });
  return { pts: out, bad };
}
function l3swpPaste() {
  const c = l3sw.cur, z0 = c && c.pts.length ? c.pts[0][2] : null;
  const d = l3Dlg("v3SwpPaste", "Placera pålar i koordinater", `<div class="v3-pal-hint">Skriv eller klistra in en rad per påle: <b>X Y Z</b> (Z = överkant) – eller en hel pållista med kolumnerna <b>Littera, Påltyp, X, Y, Lutning, ÖK påle, Pållängd</b> (kopierad rakt från Excel/PDF-tabell). Nr eller namn först på raden går bra. Komma eller punkt som decimaltecken. Saknas Z används ${z0 != null ? "höjden på första punkten" : "0"}.</div>
    <textarea id="v3SwpTa" rows="9" spellcheck="false" placeholder="168973.693 7456741.270 430.525&#10;168975.2 7456741.3 430.5"></textarea><div class="v3-pi-sum" id="v3SwpSum">0 pålar</div>
    <div class="v3-gd-btns end"><button type="button" data-cancel>Avbryt</button><button type="button" class="v3-primary" data-go disabled>Placera pålar</button></div>`);
  const ta = d.querySelector("#v3SwpTa"), sum = d.querySelector("#v3SwpSum"), go = d.querySelector("[data-go]");
  const upd = () => { const r = l3swpParseXYZ(ta.value); sum.innerHTML = `<b>${r.pts.length}</b> ${r.pts.length === 1 ? "påle" : "pålar"}${r.bad.length ? ` · <span style="color:#dc2626">rad ${r.bad.slice(0, 5).join(", ")} kunde inte läsas</span>` : ""}`; go.disabled = !r.pts.length; };
  ta.oninput = upd; d.querySelector("[data-cancel]").onclick = () => l3DlgClose("v3SwpPaste");
  go.onclick = () => {
    const r = l3swpParseXYZ(ta.value); if (!r.pts.length) return; const zd = z0 != null ? z0 : 0, pts = r.pts.map(q => { const z = q[2] != null ? q[2] : zd; return [q[0], q[1], z, q.len != null ? z - q.len : null, q.slope || null, q.name || null]; });
    const ty = (r.pts.find(q => q.type) || {}).type, mt = ty && /^(RD|RR)\s*(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)/i.exec(ty), tspec = mt ? { kind: "tube", p_D: Number(mt[2].replace(",", ".")) / 1000, p_tt: Number(mt[3].replace(",", ".")) / 1000, sel: "" } : null;
    if (c) { c.pts = pts; c.spec.coords = true; if (tspec) { if (c.spec.kind !== "tube") { c.spec.kind = "tube"; l3swpInit(c.spec, true); } Object.assign(c.spec, tspec); } if (!l3swpIs(c.spec.kind) || c.spec.kind === "sheet" || c.spec.kind === "slits") { c.spec.kind = "tube"; l3swpInit(c.spec, true); } l3swDraw(); l3swPanel(); }
    else { const spec = { ...L3SW_DEF, ...(l3sw.last || {}), coords: true }; if (tspec) { if (spec.kind !== "tube") { spec.kind = "tube"; l3swpInit(spec, true); } Object.assign(spec, tspec); } if (!l3swpIs(spec.kind) || spec.kind === "sheet" || spec.kind === "slits") { spec.kind = "tube"; l3swpInit(spec, true); } l3swOpen({ pts, spec, res: null }); }
    l3DlgClose("v3SwpPaste"); l3Status(`${pts.length} ${pts.length === 1 ? "påle" : "pålar"} placerade i koordinaterna – välj pålens typ och tryck Skapa pålar.`);
  };
}
