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
function l3swpPrism(poly, holes, z0, z1, pos, t, n, taper) {
  const W = (q, k = 1) => [pos[0] + t[0] * q[0] * k + n[0] * q[1] * k, pos[1] + t[1] * q[0] * k + n[1] * q[1] * k];
  const loops = [poly, ...(holes || [])], pts = [], faces = [], ring = [];
  loops.forEach((lp, li) => { const lo = [], hi = []; lp.forEach(q => { const wlo = W(q, taper ? taper : 1), whi = W(q, 1); pts.push([wlo[0], wlo[1], z0]); lo.push(pts.length); pts.push([whi[0], whi[1], z1]); hi.push(pts.length); }); ring.push({ lo, hi }); });
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
    return { ...r, L };
  }
  const len = Math.max(0.5, +s.len || 8), top = +s.top || 0, tf = (a, d) => ({ x: pts[a][0] + (pts[a + 1][0] - pts[a][0]) * d, y: pts[a][1] + (pts[a + 1][1] - pts[a][1]) * d });
  const zAt = d => { let k = 1; while (k < cum.length - 1 && cum[k] < d) k++; const t = cum[k] > cum[k - 1] ? (d - cum[k - 1]) / (cum[k] - cum[k - 1]) : 0; return pts[k - 1][2] + (pts[k][2] - pts[k - 1][2]) * Math.max(0, Math.min(1, t)); };
  const dirAt = (d, i) => { const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  // stationer: jämnt fördelade per sträcka (c/c justeras så att linjens delar går jämnt upp)
  const stations = [], cc = Math.max(0.1, +s.p_cc || +s.cc || 1), bays = [];
  for (let i = 0; i + 1 < pts.length; i++) { const Ls = cum[i + 1] - cum[i]; if (Ls < 0.05) continue; const n = Math.max(1, Math.round(Ls / (kind === "sheet" ? (+s.p_b || 0.7) : cc))), step = Ls / n; for (let k = (stations.length ? 1 : 0); k <= n; k++) stations.push({ i, d: cum[i] + k * step, k, seg: i }); bays.push({ i, n, step }); }
  const cst = () => pts.map((q, k) => { const nb = k + 1 < pts.length ? [pts[k + 1][0] - q[0], pts[k + 1][1] - q[1]] : k > 0 ? [q[0] - pts[k - 1][0], q[1] - pts[k - 1][1]] : [1, 0], l = Math.hypot(nb[0], nb[1]) || 1, t = [nb[0] / l, nb[1] / l]; return { pos: [q[0], q[1]], t, n: [-t[1] * sign, t[0] * sign], z: q[2], k, d: 0, i: 0 }; });   // pålar i inklistrade koordinater: riktningen följer raden
  if (coords) { stations.length = 0; cst().forEach(x => stations.push(x)); }
  const frame = st => { if (st.pos) return { pos: st.pos, t: st.t, n: st.n, z: st.z }; const t = dirAt(st.d, st.i), nn = [-t[1] * sign, t[0] * sign], p = tf(st.i, (st.d - cum[st.i]) / (cum[st.i + 1] - cum[st.i] || 1)); return { pos: [p.x, p.y], t, n: nn, z: zAt(st.d) + top }; };
  const parts = [], sheetPos = [], zTop = f => f.z, zBot = f => f.z - len;
  const fmt = l3swFmt, name = (b, c) => `${b} – ${c}`;
  if (kind === "berlin") {
    const e = { h: +s.p_h, b: +s.p_b, tw: +s.p_tw, tf: +s.p_tf }, poly = l3swpIPoly(e.h, e.b, e.tw, e.tf), M = l3swpMerge();
    stations.forEach(st => { const f = frame(st); M.add(l3swpPrism(poly, null, zBot(f), zTop(f), f.pos, f.t, f.n)); });
    const g = M.get(), mass = (+s.p_kgm || 60) * len * stations.length;
    parts.push({ name: `Berlinerspont ${s.sel} – ${stations.length} pelare c/c ${fmt(cc, 2)} m, L ${fmt(len, 1)} m`, mesh: { pts: g.pts, faces: g.faces }, vol: g.vol, len: L, ifc: "IFCPILE", pile: "DRIVEN", color: L3SWP_COL.steel, mass });
    if (s.lag !== false && !coords) {
      const tp = Math.max(0.02, +s.tp || 0.075), D = Math.min(len, Math.max(0.3, +s.lagD || 4)), ML = l3swpMerge(), ov = 0.05;
      for (let k = 0; k + 1 < stations.length; k++) { const A0 = stations[k], B = stations[k + 1], A = A0.i === B.i ? A0 : { ...A0, i: B.i }; /* fack över en brytpunkt: utfackningen fortsätter i nästa riktning (förut föll den bort) */ const fa = frame(A), fb = frame(B), span = B.d - A.d, a0 = e.b / 2 - ov, a1 = span - e.b / 2 + ov; if (a1 <= a0) continue;
        const w0 = -e.h / 2 + e.tf; const poly2 = [[a0, w0], [a1, w0], [a1, w0 + tp], [a0, w0 + tp]]; ML.add(l3swpPrism(poly2, null, Math.max(zBot(fa), fa.z - D), fa.z, fa.pos, fa.t, fa.n)); void fb; }
      const gl = ML.get(); if (gl.n) parts.push({ name: `Berlinerspont – utfackning trä ${fmt(tp * 1000, 0)} mm, ned till ${fmt(D, 1)} m`, mesh: { pts: gl.pts, faces: gl.faces }, vol: gl.vol, len: L, ifc: "IFCPLATE", color: L3SWP_COL.lag, mass: gl.vol * L3SWP_TIMBER });
    }
  } else if (kind === "sheet") {
    const e = { b: +s.p_b, h: +s.p_h, tf: +s.p_tf, tw: +s.p_tw, p_t: s.p_t }, M = l3swpMerge(); let np = 0;
    bays.forEach(bay => { const sg = bay.i, Ls = cum[sg + 1] - cum[sg], n = Math.max(1, Math.round(Ls / e.b)), step = Ls / n, sc = step / e.b;   // pilarnas bredd anpassas något så att segmentet går jämnt upp
      for (let k = 0; k < n; k++) { const d = cum[sg] + k * step, t = dirAt(d, sg), nn = [-t[1] * sign, t[0] * sign], p = tf(sg, (d - cum[sg]) / (Ls || 1)), z = zAt(d) + top, poly = l3swpSheetPoly(e, k % 2 === 1).map(([a, w]) => [a * sc, w]); M.add(l3swpPrism(poly, null, z - len, z, [p.x, p.y], t, nn)); np++; sheetPos.push([p.x, p.y, z, z - len]); } });
    const g = M.get(), mass = (+s.p_kgm2 || 130) * np * e.b * len;
    parts.push({ name: `Stålspont ${s.sel} – ${np} pålar, L ${fmt(len, 1)} m`, mesh: { pts: g.pts, faces: g.faces }, vol: g.vol, len: L, ifc: "IFCWALL", color: L3SWP_COL.steel, mass });
  } else if (kind === "bored") {
    const D = +s.p_D || 0.62, c = +s.p_cc || D, sec = c < D - 1e-6, M0 = l3swpMerge(), M1 = l3swpMerge(), poly = l3swpCircle(D / 2);
    stations.length = 0; bays.length = 0; if (coords) cst().forEach(x => stations.push(x));
    else for (let i = 0; i + 1 < pts.length; i++) { const Ls = cum[i + 1] - cum[i]; if (Ls < 0.05) continue; const n = Math.max(1, Math.round(Ls / c)); for (let k = (stations.length ? 1 : 0); k <= n; k++) stations.push({ i, d: cum[i] + k * (Ls / n) }); }
    stations.forEach((st, k) => { const f = frame(st); (sec && k % 2 === 1 ? M1 : M0).add(l3swpPrism(poly, null, zBot(f), zTop(f), f.pos, f.t, f.n)); });
    const g0 = M0.get(), g1 = M1.get(), nm = sec ? "Sekantpålevägg" : "Tangentpålevägg";
    parts.push({ name: `${nm} Ø ${fmt(D * 1000, 0)} – ${sec ? "primärpålar (oarmerade)" : stations.length + " pålar"}`, mesh: { pts: g0.pts, faces: g0.faces }, vol: g0.vol, len: L, ifc: "IFCPILE", pile: "BORED", color: L3SWP_COL.conc, mass: g0.vol * L3SWP_CONC });
    if (g1.n) parts.push({ name: `${nm} Ø ${fmt(D * 1000, 0)} c/c ${fmt(c * 1000, 0)} – sekundärpålar (armerade)`, mesh: { pts: g1.pts, faces: g1.faces }, vol: g1.vol, len: L, ifc: "IFCPILE", pile: "BORED", color: "#9aa3ad", mass: g1.vol * L3SWP_CONC });
  } else {
    const M = l3swpMerge(); let poly, holes = null, taper = 0, nm, mat, col, ifcc = "IFCPILE";
    if (kind === "tube") { const D = +s.p_D || 0.17, tt = +s.p_tt || 0.005; poly = l3swpCircle(D / 2); holes = [l3swpCircle(Math.max(0.01, D / 2 - tt)).reverse()]; nm = `Stålrörspålar Ø ${fmt(D * 1000, 1)} × ${fmt(tt * 1000, 1)}`; mat = L3SWP_STEEL; col = L3SWP_COL.steel; }
    else if (kind === "conc") { const a = +s.p_a || 0.27, h = a / 2; poly = [[-h, -h], [h, -h], [h, h], [-h, h]]; nm = `Betongpålar ${fmt(a * 1000, 0)} × ${fmt(a * 1000, 0)}`; mat = L3SWP_CONC; col = L3SWP_COL.conc; }
    else { const d0 = +s.p_d0 || 0.18, d1 = +s.p_d1 || 0.12; poly = l3swpCircle(d0 / 2, 16); taper = d1 / d0; nm = `Träpålar topp Ø ${fmt(d0 * 1000, 0)} / spets Ø ${fmt(d1 * 1000, 0)}`; mat = L3SWP_TIMBER; col = L3SWP_COL.timber; }
    stations.forEach(st => { const f = frame(st); M.add(l3swpPrism(poly, holes, zBot(f), zTop(f), f.pos, f.t, f.n, taper || 0)); });
    const g = M.get(); parts.push({ name: `${nm} – ${stations.length} pålar c/c ${fmt(cc, 2)} m, L ${fmt(len, 1)} m`, mesh: { pts: g.pts, faces: g.faces }, vol: g.vol, len: L, ifc: ifcc, pile: "DRIVEN", color: col, mass: g.vol * mat });
  }
  const pos = kind === "sheet" ? sheetPos : stations.map(st => { const f = frame(st); return [f.pos[0], f.pos[1], zTop(f), zBot(f)]; });
  return { parts, L, area: 0, piles: true, pos };
}
/* ---- Inkoppling i Stödmur-verktyget ---- */
const l3swBuildBase = l3swBuild;
l3swBuild = function (pts, s) { return l3swpIs(s.kind) ? l3swpBuild(pts, s) : l3swBuildBase(pts, s); };
const l3swPanelBase = l3swPanel;
l3swPanel = function () {
  const c = l3sw.cur; if (c && l3swpIs(c.spec.kind)) l3swpInit(c.spec);
  l3swPanelBase(); const c2 = l3sw.cur; if (c2 && l3swpIs(c2.spec.kind)) l3swpPanelFix(c2);
};
function l3swpPanelFix(c) {
  const s = c.spec, el = document.getElementById("v3WallPanel"); if (!el) return; const grid = el.querySelector(".v3-rd-g"); if (!grid) return; const E = escHtml, k = s.kind, cat = L3SWP_CAT[k] || [];
  const num = (key, label, tip, unit, st, min, max) => `<label class="v3-rd-n" title="${E(tip)}"><span>${label}</span><input type="number" data-wp="${key}" value="${s[key] != null ? Math.round(s[key] * 1e4) / 1e4 : ""}" min="${min}" max="${max}" step="${st}"><em>${unit}</em></label>`;
  const f = {
    berlin: num("p_cc", "Pelare c/c", "Avstånd mellan stålpelarna (vanligt 1,5–3 m)", "m", 0.1, 0.5, 6) + num("len", "Pållängd", "Pelarens totala längd (inkl. intryckning under schaktbotten)", "m", 0.5, 1, 30) + num("top", "Överkant", "Pelarnas överkant relativt linjens höjd (+ = över)", "m", 0.1, -5, 5)
      + `<label class="v3-ga-tg" title="Plankor (trä) mellan pelarna, läggs i takt med schaktet"><input type="checkbox" data-wpchk="lag" ${s.lag !== false ? "checked" : ""}><span>Utfackning (plankor)</span></label>` + (s.lag !== false ? num("tp", "Plankor tjocklek", "Plankornas tjocklek (50–75 mm är vanligt)", "m", 0.005, 0.02, 0.2) + num("lagD", "Plankor till djup", "Hur djupt plankorna går (grävdjupet)", "m", 0.5, 0.3, 30) : ""),
    sheet: num("len", "Spontlängd", "Spontens totala längd", "m", 0.5, 1, 40) + num("top", "Överkant", "Spontens överkant relativt linjens höjd (+ = över)", "m", 0.1, -5, 5),
    bored: num("p_D", "Pålens Ø", "Borrad påles diameter", "m", 0.01, 0.2, 2) + num("p_cc", "c/c", "Mitt–mitt. Mindre än diametern = sekantpålar (överlappande), lika med diametern = tangentpålar", "m", 0.005, 0.2, 3) + num("len", "Pållängd", "Pålens längd", "m", 0.5, 1, 40) + num("top", "Överkant", "Överkant relativt linjens höjd", "m", 0.1, -5, 5),
    tube: num("p_D", "Ytterdiameter", "Rörets ytterdiameter", "m", 0.001, 0.05, 1.5) + num("p_tt", "Godstjocklek", "Rörets godstjocklek", "m", 0.0005, 0.003, 0.05) + num("p_cc", "c/c", "Mitt–mitt mellan pålarna", "m", 0.05, 0.1, 6) + num("len", "Pållängd", "Pålens längd", "m", 0.5, 1, 60) + num("top", "Överkant", "Överkant relativt linjens höjd", "m", 0.1, -5, 5),
    conc: num("p_a", "Sidmått", "Pålens sida (kvadratisk)", "m", 0.005, 0.15, 0.6) + num("p_cc", "c/c", "Mitt–mitt mellan pålarna (minst ca 3 × sidmått i en pålgrupp)", "m", 0.05, 0.2, 6) + num("len", "Pållängd", "Pålens längd", "m", 0.5, 1, 60) + num("top", "Överkant", "Överkant relativt linjens höjd", "m", 0.1, -5, 5),
    timber: num("p_d0", "Topp Ø", "Toppdiameter", "m", 0.01, 0.1, 0.5) + num("p_d1", "Spets Ø", "Spetsdiameter (pålen smalnar av jämnt)", "m", 0.01, 0.05, 0.4) + num("p_cc", "c/c", "Mitt–mitt mellan pålarna", "m", 0.05, 0.1, 6) + num("len", "Pållängd", "Pålens längd", "m", 0.5, 1, 30) + num("top", "Överkant", "Överkant relativt linjens höjd", "m", 0.1, -5, 5),
    slits: num("p_tt", "Tjocklek", "Väggens tjocklek", "m", 0.05, 0.3, 2) + num("len", "Djup", "Väggens djup under linjen", "m", 0.5, 1, 40) + num("top", "Överkant", "Överkant relativt linjens höjd", "m", 0.1, -5, 5),
  }[k] || "";
  const kindSel = `<label class="v3-rd-n" style="grid-column:1/3"><span>Typ</span><select data-wpkind style="flex:1">${Object.entries(L3SW_KINDS).map(([kk, v]) => `<option value="${kk}" ${s.kind === kk ? "selected" : ""}>${E(v)}</option>`).join("")}</select></label>`;
  const stdSel = `<label class="v3-rd-n" style="grid-column:1/3" title="Standardprofiler – källa visas efter namnet. Typiska mått: kontrollera mot tillverkarens datablad"><span>Standard</span><select data-wpstd style="flex:1"><option value="">Egna mått</option>${cat.map(x => `<option value="${E(x.id)}" ${s.sel === x.id ? "selected" : ""}>${E(x.id)} · ${l3swpSrc(x)}</option>`).join("")}</select></label>`;
  const soil = `<label class="v3-rd-n" title="Vilken sida jorden ligger på (styr bl.a. var plankorna sitter)"><span>Jord åt</span><select data-wpsoil><option value="L" ${s.soil !== "R" ? "selected" : ""}>vänster</option><option value="R" ${s.soil === "R" ? "selected" : ""}>höger</option></select></label>`;
  grid.innerHTML = kindSel + stdSel + f + soil;
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
  el.querySelectorAll("[data-wpchk]").forEach(i => { i.onchange = () => { s[i.dataset.wpchk] = i.checked; re(); }; });
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
function l3swpTable(c) {
  const r = c.res || l3swBuild(c.pts, c.spec), pos = (r && r.pos) || []; if (!pos.length) { l3Status("Inga pålar att visa än.", true); return; }
  const rows = pos.map((q, i) => `<tr><td>${i + 1}</td><td>${l3swpF(q[0])}</td><td>${l3swpF(q[1])}</td><td>${l3swpF(q[2])}</td><td>${l3swpF(q[3])}</td></tr>`).join("");
  const d = l3Dlg("v3SwpTbl", `Pålar – koordinater (${pos.length})`, `<div class="v3-swp-tw"><table class="v3-swp-t"><thead><tr><th>Nr</th><th>X (E)</th><th>Y (N)</th><th>Z överkant</th><th>Z spets</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="v3-gd-btns"><button type="button" data-tcopy>Kopiera (Excel)</button><button type="button" data-tcsv>Spara CSV</button></div>`);
  const tsv = (dec) => ["Nr\tX\tY\tZ överkant\tZ spets", ...pos.map((q, i) => [i + 1, ...q].map((v, k) => (k === 0 ? v : l3swpF(v).replace(",", dec))).join("\t"))].join("\n");
  d.querySelector("[data-tcopy]").onclick = async () => { try { await navigator.clipboard.writeText(tsv(",")); l3Toast("Tabellen är kopierad – klistra in i Excel."); } catch (e) { l3Status("Kunde inte kopiera: " + e.message, true); } };
  d.querySelector("[data-tcsv]").onclick = () => { const csv = ["Nr;X;Y;Z overkant;Z spets", ...pos.map((q, i) => [i + 1, ...q].map((v, k) => (k === 0 ? v : l3swpF(v))).join(";"))].join("\r\n"), a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })); a.download = "palar-koordinater.csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000); };
}
/* Läser rader som "X Y Z", "X;Y;Z", "nr X Y Z" eller "X,Y,Z" (komma som decimaltecken går bra när raden delas med tabb, semikolon eller mellanslag). */
function l3swpParseXYZ(text) {
  const out = [], bad = [];
  String(text || "").split(/\r?\n/).forEach((ln, i) => {
    ln = ln.trim(); if (!ln) return; const sep = /[;\t]/.test(ln) ? /[;\t]+/ : /\s/.test(ln) ? /\s+/ : /,/;
    let tk = ln.split(sep).map(x => x.trim()).filter(Boolean); if (sep.source === ",") tk = tk.map(x => x.replace(",", "."));
    const num = x => { const v = Number(String(x).replace(",", ".")); return Number.isFinite(v) && /^[-+]?[\d.,]+(e[-+]?\d+)?$/i.test(x) ? v : null; };
    let v = tk.map(num); if (v.length && v[0] === null) { v = v.slice(1); }   // namn/nr först på raden
    else if (v.length === 4 && Number.isInteger(v[0]) && Math.abs(v[0]) < 100000) v = v.slice(1);
    v = v.filter(x => x !== null);
    if (v.length >= 2) out.push([v[0], v[1], v.length >= 3 ? v[2] : null]); else bad.push(i + 1);
  });
  return { pts: out, bad };
}
function l3swpPaste() {
  const c = l3sw.cur, z0 = c && c.pts.length ? c.pts[0][2] : null;
  const d = l3Dlg("v3SwpPaste", "Placera pålar i koordinater", `<div class="v3-pal-hint">Skriv eller klistra in en rad per påle: <b>X Y Z</b> (Z = överkant). Nr eller namn först på raden går bra. Komma eller punkt som decimaltecken. Saknas Z används ${z0 != null ? "höjden på första punkten" : "0"}.</div>
    <textarea id="v3SwpTa" rows="9" spellcheck="false" placeholder="168973.693 7456741.270 430.525&#10;168975.2 7456741.3 430.5"></textarea><div class="v3-pi-sum" id="v3SwpSum">0 pålar</div>
    <div class="v3-gd-btns end"><button type="button" data-cancel>Avbryt</button><button type="button" class="v3-primary" data-go disabled>Placera pålar</button></div>`);
  const ta = d.querySelector("#v3SwpTa"), sum = d.querySelector("#v3SwpSum"), go = d.querySelector("[data-go]");
  const upd = () => { const r = l3swpParseXYZ(ta.value); sum.innerHTML = `<b>${r.pts.length}</b> ${r.pts.length === 1 ? "påle" : "pålar"}${r.bad.length ? ` · <span style="color:#dc2626">rad ${r.bad.slice(0, 5).join(", ")} kunde inte läsas</span>` : ""}`; go.disabled = !r.pts.length; };
  ta.oninput = upd; d.querySelector("[data-cancel]").onclick = () => l3DlgClose("v3SwpPaste");
  go.onclick = () => {
    const r = l3swpParseXYZ(ta.value); if (!r.pts.length) return; const zd = z0 != null ? z0 : 0, pts = r.pts.map(q => [q[0], q[1], q[2] != null ? q[2] : zd]);
    if (c) { c.pts = pts; c.spec.coords = true; if (!l3swpIs(c.spec.kind) || c.spec.kind === "sheet" || c.spec.kind === "slits") { c.spec.kind = "tube"; l3swpInit(c.spec, true); } l3swDraw(); l3swPanel(); }
    else { const spec = { ...L3SW_DEF, ...(l3sw.last || {}), coords: true }; if (!l3swpIs(spec.kind) || spec.kind === "sheet" || spec.kind === "slits") { spec.kind = "tube"; l3swpInit(spec, true); } l3swOpen({ pts, spec, res: null }); }
    l3DlgClose("v3SwpPaste"); l3Status(`${pts.length} ${pts.length === 1 ? "påle" : "pålar"} placerade i koordinaterna – välj pålens typ och tryck Skapa pålar.`);
  };
}
