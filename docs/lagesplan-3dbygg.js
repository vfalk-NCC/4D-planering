/* 3D-vyn – Byggdelar (Victor 2026-11-12): trä och stomme, fasad och tak, invändigt. Samma arbetssätt som Stödmur: Mät → Stödmur (eller kortet under "Byggdelar" i 3D-biblioteket),
   tryck ut linjen (eller rummets hörn), Enter, välj typ och mått i panelen och tryck Skapa. Resultatet är vanliga redigerbara 3D-objekt med mängder, vikt och IFC-klass,
   och byggdelen går att öppna igen (✎ Redigera). Alla typer ritas av riktiga delar (reglar, takstolar, skivor …) och ger en stycklista.
   Typerna: Regelvägg, Trä-bjälklag, Takstolar, Skivplacering, Fasad, Taktäckning, Skiktuppbyggnad (isolering/golv), Undertak, Rum, Installationsstråk. Prefix l3swb. */
const l3swbDef = {};   // typ → { name, group, input, fields, build }
const L3SWB_GROUPS = [["Trä & stomme", ["stud", "joist", "truss", "sheets"]], ["Fasad & tak", ["facade", "roofcover", "layers"]], ["Invändigt", ["ceiling", "layers", "room", "service"]]];
const L3SWB_MAT = { gips13: ["Gips 13 mm", 0.013, "#e5e7eb", 700], gips2: ["Gips 2 × 13 mm", 0.026, "#e5e7eb", 700], osb11: ["OSB 11 mm", 0.011, "#d4a05a", 620], ply12: ["Plywood 12 mm", 0.012, "#d9b27c", 600], ply22: ["Plywood 22 mm", 0.022, "#d9b27c", 600],
  vind9: ["Vindskyddsskiva 9 mm", 0.009, "#fde68a", 400], fib9: ["Fasadskiva (fibercement) 9 mm", 0.009, "#94a3b8", 1300], cem12: ["Cementskiva 12 mm", 0.012, "#9ca3af", 1300] };
const L3SWB_WOOD = 450, L3SWB_STEEL = 7850;
const l3swbF = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace(".", ",");
const l3swbSgn = s => (s.soil === "R" ? -1 : 1);
/* ---- Geometri: låda mellan axlar, regel/bjälke mellan två punkter ---- */
function l3swbBox(M, O, X, Y, Z, rx, ry, rz) {
  const pts = [], faces = [];
  for (let i = 0; i < 8; i++) { const a = rx[i & 1], b = ry[(i >> 1) & 1], c = rz[(i >> 2) & 1]; pts.push([O[0] + X[0] * a + Y[0] * b + Z[0] * c, O[1] + X[1] * a + Y[1] * b + Z[1] * c, O[2] + X[2] * a + Y[2] * b + Z[2] * c]); }
  [[0, 1, 3, 2], [4, 6, 7, 5], [0, 2, 6, 4], [1, 5, 7, 3], [0, 4, 5, 1], [2, 3, 7, 6]].forEach(q => { faces.push([q[0] + 1, q[1] + 1, q[2] + 1], [q[0] + 1, q[2] + 1, q[3] + 1]); });
  let vol = 0; faces.forEach(f => { const a = pts[f[0] - 1], b = pts[f[1] - 1], c = pts[f[2] - 1]; vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; });
  if (vol < 0) faces.forEach(f => { const q = f[1]; f[1] = f[2]; f[2] = q; });
  M.add({ pts, faces, vol: Math.abs(vol) });
}
const l3swbCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], l3swbNorm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function l3swbRod(M, P0, P1, w, h, side) {   // rektangulärt tvärsnitt w (längs side) × h (vinkelrätt), centrerat på linjen P0–P1
  const L = Math.hypot(P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]); if (L < 1e-4) return; const u = l3swbNorm([P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]]);
  let sd = side || [0, 0, 1]; const d = sd[0] * u[0] + sd[1] * u[1] + sd[2] * u[2]; sd = [sd[0] - u[0] * d, sd[1] - u[1] * d, sd[2] - u[2] * d]; if (Math.hypot(...sd) < 1e-6) sd = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], sd = l3swbNorm([sd[0] - u[0] * (sd[0] * u[0] + sd[1] * u[1] + sd[2] * u[2]), sd[1] - u[1] * (sd[0] * u[0] + sd[1] * u[1] + sd[2] * u[2]), sd[2] - u[2] * (sd[0] * u[0] + sd[1] * u[1] + sd[2] * u[2])]);
  sd = l3swbNorm(sd); const v = l3swbCross(u, sd), O = [P0[0] - sd[0] * w / 2 - v[0] * h / 2, P0[1] - sd[1] * w / 2 - v[1] * h / 2, P0[2] - sd[2] * w / 2 - v[2] * h / 2];
  l3swbBox(M, O, u, sd, v, [0, L], [0, w], [0, h]);
}
function l3swbPart(parts, M, name, ifc, color, dens, len, extra) { const g = M.get(); if (!g.n) return null; const p = { name, mesh: { pts: g.pts, faces: g.faces }, vol: g.vol, len: len || 0, ifc, color, mass: g.vol * dens, ...(extra || {}) }; parts.push(p); return p; }
function l3swbSegs(pts, s) {   // linjens sträckor med riktning t och sidoriktning n
  const sg = l3swbSgn(s), out = []; let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) { const A = pts[i], B = pts[i + 1], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy); if (L < 0.05) continue; const t = [dx / L, dy / L, 0]; out.push({ A, B, L, t, n: [-t[1] * sg, t[0] * sg, 0], a0: acc, i }); acc += L; }
  return out;
}
const l3swbZ = [0, 0, 1];
/* Fördelar stolpar/reglar: första och sista i kanten, resten c/c från starten. */
function l3swbPos(L, cc, w) { const a = [w / 2]; for (let x = cc; x < L - w / 2 - 0.02; x += cc) a.push(x); if (L - w / 2 > a[a.length - 1] + 0.02) a.push(L - w / 2); else if (a.length === 1 && L > w) a.push(L - w / 2); return a; }
/* ---- Plan för skivor/skikt: ursprung, riktning längs (a), "uppåt" i planet (b) och normal (N) ---- */
function l3swbPlane(seg, tiltDeg) {
  const T = (tiltDeg || 0) * Math.PI / 180, c = Math.cos(T), sn = Math.sin(T);
  return { O: [seg.A[0], seg.A[1], seg.A[2]], a: seg.t, b: [seg.n[0] * sn, seg.n[1] * sn, c], N: [-seg.n[0] * c, -seg.n[1] * c, sn] };   // N pekar utåt (bort från sidan planet lutar åt); tilt 0 = lodrät vägg, 90 = vågrät yta (N upp)
}
/* Lägger skivor (storlek sw × sh) över ytan L × H: stående eller liggande, med/utan förskjutning. Returnerar { n, whole, cut, area, used } */
function l3swbTile(M, pl, L, H, o) {
  const { sw, sh, th, stand, bond, gap = 0.003, off = 0 } = o, u = stand ? sw : sh, v = stand ? sh : sw, res = { n: 0, whole: 0, cut: 0, area: 0 };
  const put = (a0, a1, b0, b1) => { a0 = Math.max(0, a0); b0 = Math.max(0, b0); a1 = Math.min(L, a1); b1 = Math.min(H, b1); if (a1 - a0 < 0.02 || b1 - b0 < 0.02) return; const full = Math.abs((a1 - a0) - u + gap) < 0.003 && Math.abs((b1 - b0) - v + gap) < 0.003;
    l3swbBox(M, pl.O, pl.a, pl.b, pl.N, [a0 + gap / 2, a1 - gap / 2], [b0 + gap / 2, b1 - gap / 2], [off, off + th]); res.n++; if (full) res.whole++; else res.cut++; res.area += (a1 - a0) * (b1 - b0); };
  if (stand) { let j = 0; for (let a = 0; a < L - 1e-6; a += u, j++) { const sh0 = bond && j % 2 === 1 ? v / 2 : 0; if (sh0) put(a, a + u, 0, sh0); for (let b = sh0; b < H - 1e-6; b += v) put(a, a + u, b, b + v); } }
  else { let j = 0; for (let b = 0; b < H - 1e-6; b += v, j++) { const sh0 = bond && j % 2 === 1 ? u / 2 : 0; if (sh0) put(0, sh0, b, b + v); for (let a = sh0; a < L - 1e-6; a += u) put(a, a + u, b, b + v); } }
  return res;
}
/* ---- Typer ---- */
const L3SWB_DIMS = [["45x95", "45 × 95"], ["45x120", "45 × 120"], ["45x145", "45 × 145"], ["45x195", "45 × 195"], ["45x220", "45 × 220"], ["70x195", "70 × 195"]];
const L3SWB_CC = [["300", "c/c 300"], ["400", "c/c 400"], ["450", "c/c 450"], ["600", "c/c 600"], ["900", "c/c 900"], ["1200", "c/c 1200"]];
const L3SWB_BOARD = [["none", "Ingen"], ["gips13", "Gips 13 mm"], ["gips2", "Gips 2 × 13 mm"], ["osb11", "OSB 11 mm"], ["ply12", "Plywood 12 mm"], ["vind9", "Vindskyddsskiva 9 mm"]];
const L3SWB_SHEETMAT = Object.entries(L3SWB_MAT).map(([k, v]) => [k, v[0]]);
const dimOf = v => String(v || "45x95").split("x").map(x => Number(x) / 1000);
function l3swbOpenings(text, total) {   // en rad per öppning: "x bredd höjd bröstning" (m från linjens början, komma eller punkt)
  return String(text || "").split(/\n|\|/).map(t => t.trim()).filter(Boolean).map(t => t.split(/[;\s]+/).filter(Boolean).map(x => Number(x.replace(",", ".")))).filter(a => a.length >= 3 && a.every(Number.isFinite)).map(a => ({ x: a[0], b: Math.max(0.2, a[1]), h: Math.max(0.3, a[2]), br: Math.max(0, a[3] || 0) })).filter(o => o.x >= 0 && o.x < total);
}
l3swbDef.stud = {
  name: "Regelvägg (trä)", group: "Trä & stomme", input: "line",
  fields: [["dim", "Reglar", "sel", "45x145", L3SWB_DIMS], ["cc", "Regelavstånd", "sel", "450", L3SWB_CC.slice(0, 5)], ["H", "Vägghöjd", "num", 2.5, { u: "m", st: 0.05, min: 1, max: 8 }], ["top", "Hammarband", "sel", "2", [["1", "Enkelt"], ["2", "Dubbelt"]]], ["fa", "Skiva framsida", "sel", "gips13", L3SWB_BOARD], ["fb", "Skiva baksida", "sel", "vind9", L3SWB_BOARD], ["ins", "Isolering (mineralull)", "chk", true], ["open", "Öppningar", "txt", "", { ph: "1,5 0,9 2,1 0   (läge bredd höjd bröstning)", tip: "En öppning per rad: läge från linjens början, bredd, höjd och bröstning (0 = dörr), skilda med mellanslag. Ger dubbla reglar, överstycke och korta reglar." }]],
  build(pts, s) {
    const parts = [], list = [], segs = l3swbSegs(pts, s); if (!segs.length) return { parts: [], err: "Linjen är för kort." };
    const [bw, dp] = dimOf(s.dim), H = +s.H || 2.5, cc = (+s.cc || 450) / 1000, np = +s.top === 1 ? 1 : 2, plate = bw, total = segs.reduce((a, q) => a + q.L, 0), ops = l3swbOpenings(s.open, total);
    const MS = l3swpMerge(), MP = l3swpMerge(), MH = l3swpMerge(); let nStud = 0, lmStud = 0, lmPlate = 0, nHead = 0, nCrip = 0;
    const stud = (seg, a, z0, z1) => { if (z1 - z0 < 0.02) return; l3swbBox(MS, seg.A, seg.t, seg.n, l3swbZ, [a - bw / 2, a + bw / 2], [-dp / 2, dp / 2], [seg.A[2] - seg.A[2] + z0, z1].map((v, i) => v + (i ? 0 : 0))); nStud++; lmStud += z1 - z0; };
    segs.forEach(seg => {
      const base = seg.A[2], zb = 0, zt = H - np * plate;
      const sl = (z0, z1, a0, a1, M) => l3swbBox(M, [seg.A[0], seg.A[1], base], seg.t, seg.n, l3swbZ, [a0, a1], [-dp / 2, dp / 2], [z0, z1]);
      sl(0, plate, 0, seg.L, MP); lmPlate += seg.L; for (let k = 0; k < np; k++) { sl(H - (k + 1) * plate, H - k * plate, 0, seg.L, MP); lmPlate += seg.L; }
      const op = ops.filter(o => o.x + o.b > seg.a0 && o.x < seg.a0 + seg.L).map(o => ({ a: Math.max(0, o.x - seg.a0), b: Math.min(seg.L, o.x + o.b - seg.a0), h: o.h, br: o.br }));
      const inOp = a => op.some(o => a > o.a - bw * 1.6 && a < o.b + bw * 1.6);
      const stu = (a, z0, z1) => { if (z1 - z0 < 0.02) return; l3swbBox(MS, [seg.A[0], seg.A[1], base], seg.t, seg.n, l3swbZ, [a - bw / 2, a + bw / 2], [-dp / 2, dp / 2], [z0, z1]); nStud++; lmStud += z1 - z0; };
      l3swbPos(seg.L, cc, bw).forEach(a => { if (!inOp(a)) stu(a, plate, zt); });
      op.forEach(o => {
        stu(o.a - bw * 1.5, plate, zt); stu(o.b + bw * 1.5, plate, zt);                 // bärande reglar
        stu(o.a - bw * 0.5, plate, plate + o.br + o.h); stu(o.b + bw * 0.5, plate, plate + o.br + o.h);   // stödreglar
        const hh = Math.min(0.195, Math.max(0.095, (o.b - o.a) / 8 + 0.095)), zh = plate + o.br + o.h;   // överstycke (dubbelt)
        [0, 1].forEach(k => { l3swbBox(MH, [seg.A[0], seg.A[1], base], seg.t, seg.n, l3swbZ, [o.a - bw, o.b + bw], [-dp / 2 + k * (dp - bw * 0.99) * 0.5, -dp / 2 + (k + 1) * dp / 2 - k * 0.0], [zh, zh + hh]); }); nHead += 2;
        for (let a = o.a; a < o.b; a += cc) { if (a > o.a + bw && a < o.b - bw) { stu(a, zh + hh, zt); nCrip++; } }
        if (o.br > 0) { l3swbBox(MH, [seg.A[0], seg.A[1], base], seg.t, seg.n, l3swbZ, [o.a, o.b], [-dp / 2, dp / 2], [plate + o.br - bw, plate + o.br]); nHead++; for (let a = o.a + cc; a < o.b - bw; a += cc) { stu(a, plate, plate + o.br - bw); nCrip++; } }
      });
    });
    const gs = l3swbPart(parts, MS, `Reglar ${l3swbF(bw * 1000, 0)}×${l3swbF(dp * 1000, 0)} – ${nStud} st, ${l3swbF(lmStud, 1)} lpm`, "IFCMEMBER", "#d6b98c", L3SWB_WOOD, total);
    l3swbPart(parts, MP, `Syll och hammarband ${l3swbF(bw * 1000, 0)}×${l3swbF(dp * 1000, 0)} – ${l3swbF(lmPlate, 1)} lpm`, "IFCMEMBER", "#c9a979", L3SWB_WOOD, total); if (MH.get().n) l3swbPart(parts, MH, `Överstycken och bröstregel – ${nHead} st`, "IFCMEMBER", "#c9a979", L3SWB_WOOD, total);
    list.push([`Regel ${l3swbF(bw * 1000, 0)}×${l3swbF(dp * 1000, 0)}`, nStud + nCrip, "olika", l3swbF(lmStud, 1)], [`Syll/hammarband ${l3swbF(bw * 1000, 0)}×${l3swbF(dp * 1000, 0)}`, 1 + np, `${l3swbF(total, 1)} m`, l3swbF(lmPlate, 1)]);
    const board = (key, side) => { if (!s[key] || s[key] === "none") return; const m = L3SWB_MAT[s[key]]; if (!m) return; const M = l3swpMerge(); let area = 0;
      segs.forEach(seg => { const base = [seg.A[0], seg.A[1], seg.A[2]], pcs = []; let cur = 0; const op = ops.filter(o => o.x + o.b > seg.a0 && o.x < seg.a0 + seg.L).map(o => ({ a: Math.max(0, o.x - seg.a0), b: Math.min(seg.L, o.x + o.b - seg.a0), h: o.h, br: o.br })).sort((x, y) => x.a - y.a);
        op.forEach(o => { pcs.push([cur, o.a, 0, H]); pcs.push([o.a, o.b, o.br + o.h, H]); if (o.br > 0) pcs.push([o.a, o.b, 0, o.br]); cur = o.b; }); pcs.push([cur, seg.L, 0, H]);
        pcs.forEach(([a0, a1, z0, z1]) => { if (a1 - a0 < 0.01 || z1 - z0 < 0.01) return; area += (a1 - a0) * (z1 - z0); l3swbBox(M, base, seg.t, seg.n, l3swbZ, [a0, a1], side > 0 ? [dp / 2, dp / 2 + m[1]] : [-dp / 2 - m[1], -dp / 2], [z0, z1]); }); });
      l3swbPart(parts, M, `${m[0]} ${side > 0 ? "baksida" : "framsida"} – ${l3swbF(area, 1)} m²`, "IFCPLATE", m[2], m[3], total); list.push([m[0] + (side > 0 ? " (baksida)" : " (framsida)"), "", "", `${l3swbF(area, 1)} m²`]); };
    board("fa", -1); board("fb", 1);
    if (s.ins) { const M = l3swpMerge(); let area = 0;
      segs.forEach(seg => { const op = ops.filter(o => o.x + o.b > seg.a0 && o.x < seg.a0 + seg.L).map(o => ({ a: Math.max(0, o.x - seg.a0), b: Math.min(seg.L, o.x + o.b - seg.a0), h: o.h, br: o.br })).sort((x, y) => x.a - y.a), pcs = []; let cur = 0;
        op.forEach(o => { pcs.push([cur, o.a - bw * 1.5, plate, H - np * plate]); pcs.push([o.a - bw * 1.5, o.b + bw * 1.5, plate + o.br + o.h + 0.2, H - np * plate]); if (o.br > 0) pcs.push([o.a, o.b, plate, plate + o.br - bw]); cur = o.b + bw * 1.5; }); pcs.push([cur, seg.L - bw, plate, H - np * plate]);
        pcs.forEach(([a0, a1, z0, z1]) => { a0 = Math.max(bw, a0); a1 = Math.min(seg.L - bw, a1); if (a1 - a0 < 0.02 || z1 - z0 < 0.02) return; area += (a1 - a0) * (z1 - z0); l3swbBox(M, [seg.A[0], seg.A[1], seg.A[2]], seg.t, seg.n, l3swbZ, [a0, a1], [-dp / 2 + 0.004, dp / 2 - 0.004], [z0, z1]); }); });
      const p = l3swbPart(parts, M, `Isolering mineralull ${l3swbF(dp * 1000, 0)} mm – ${l3swbF(area, 1)} m²`, "IFCBUILDINGELEMENTPROXY", "#fde047", 25, total); if (p) { p.vol *= 0.8; p.mass = p.vol * 25; } list.push([`Isolering ${l3swbF(dp * 1000, 0)} mm`, "", "", `${l3swbF(area, 1)} m²`]); }
    void gs; return { parts, L: total, area: total * H, list };
  },
};
l3swbDef.joist = {
  name: "Trä-bjälklag", group: "Trä & stomme", input: "line",
  fields: [["B", "Djup (spännvidd)", "num", 4, { u: "m", st: 0.1, min: 0.5, max: 12 }], ["dim", "Bjälkar", "sel", "45x195", L3SWB_DIMS], ["cc", "Bjälkavstånd", "sel", "450", L3SWB_CC.slice(0, 5)], ["deck", "Golvskiva", "sel", "ply22", [["none", "Ingen"], ["ply22", "Plywood 22 mm"], ["osb11", "OSB 11 mm"]]], ["blk", "Kortlingar", "chk", true], ["dz", "Underkant (relativt linjen)", "num", 0, { u: "m", st: 0.05, min: -5, max: 8 }]],
  build(pts, s) {
    const parts = [], segs = l3swbSegs(pts, s); if (!segs.length) return { parts: [], err: "Linjen är för kort." };
    const [bw, dp] = dimOf(s.dim), B = Math.max(0.5, +s.B || 4), cc = (+s.cc || 450) / 1000, dz = +s.dz || 0, MJ = l3swpMerge(), MR = l3swpMerge(), MK = l3swpMerge(); let nJ = 0, nK = 0, area = 0, lm = 0;
    segs.forEach(seg => { const O = [seg.A[0], seg.A[1], seg.A[2] + dz], z = [0, dp]; area += seg.L * B;
      l3swbPos(seg.L, cc, bw).forEach(a => { l3swbBox(MJ, O, seg.t, seg.n, l3swbZ, [a - bw / 2, a + bw / 2], [bw, B - bw], z); nJ++; lm += B - 2 * bw; });
      l3swbBox(MR, O, seg.t, seg.n, l3swbZ, [0, seg.L], [0, bw], z); l3swbBox(MR, O, seg.t, seg.n, l3swbZ, [0, seg.L], [B - bw, B], z); lm += 2 * seg.L;
      if (s.blk && B > 2.4) { const pos = l3swbPos(seg.L, cc, bw); for (let i = 0; i + 1 < pos.length; i++) { l3swbBox(MK, O, seg.t, seg.n, l3swbZ, [pos[i] + bw / 2, pos[i + 1] - bw / 2], [B / 2 - bw / 2, B / 2 + bw / 2], z); nK++; } } });
    l3swbPart(parts, MJ, `Bjälkar ${l3swbF(bw * 1000, 0)}×${l3swbF(dp * 1000, 0)} c/c ${l3swbF(cc * 1000, 0)} – ${nJ} st × ${l3swbF(B - 2 * bw, 2)} m`, "IFCMEMBER", "#d6b98c", L3SWB_WOOD, B);
    l3swbPart(parts, MR, `Randbalkar ${l3swbF(bw * 1000, 0)}×${l3swbF(dp * 1000, 0)}`, "IFCMEMBER", "#c9a979", L3SWB_WOOD, B); if (nK) l3swbPart(parts, MK, `Kortlingar – ${nK} st`, "IFCMEMBER", "#c9a979", L3SWB_WOOD, B);
    if (s.deck && s.deck !== "none") { const m = L3SWB_MAT[s.deck], M = l3swpMerge(); segs.forEach(seg => l3swbBox(M, [seg.A[0], seg.A[1], seg.A[2] + dz], seg.t, seg.n, l3swbZ, [0, seg.L], [0, B], [dp, dp + m[1]])); l3swbPart(parts, M, `${m[0]} golvskiva – ${l3swbF(area, 1)} m²`, "IFCSLAB", m[2], m[3], B); }
    return { parts, L: segs.reduce((a, q) => a + q.L, 0), area, list: [[`Bjälke ${l3swbF(bw * 1000, 0)}×${l3swbF(dp * 1000, 0)}`, nJ, `${l3swbF(B - 2 * bw, 2)} m`, l3swbF(nJ * (B - 2 * bw), 1)], [`Randbalk ${l3swbF(bw * 1000, 0)}×${l3swbF(dp * 1000, 0)}`, 2 * segs.length, "", l3swbF(2 * segs.reduce((a, q) => a + q.L, 0), 1)], ["Golvyta", "", "", `${l3swbF(area, 1)} m²`]] };
  },
};
l3swbDef.truss = {
  name: "Takstolar (trä)", group: "Trä & stomme", input: "line",
  fields: [["span", "Spännvidd", "num", 8, { u: "m", st: 0.1, min: 2, max: 24 }], ["form", "Form", "sel", "sadel", [["sadel", "Sadeltak (Fink)"], ["pult", "Pulpettak"]]], ["ang", "Takvinkel", "num", 27, { u: "°", st: 1, min: 5, max: 60 }], ["cc", "Takstolsavstånd", "sel", "1200", L3SWB_CC.slice(3)], ["dim", "Virke", "sel", "45x120", L3SWB_DIMS], ["ov", "Takutsprång", "num", 0.5, { u: "m", st: 0.05, min: 0, max: 1.5 }], ["lath", "Åsar (bärläkt)", "chk", true]],
  build(pts, s) {
    const parts = [], segs = l3swbSegs(pts, s); if (!segs.length) return { parts: [], err: "Linjen är för kort." };
    const [bw, dp] = dimOf(s.dim), S = Math.max(2, +s.span || 8), al = (Math.max(5, Math.min(60, +s.ang || 27))) * Math.PI / 180, cc = (+s.cc || 1200) / 1000, ov = +s.ov || 0, pult = s.form === "pult", h = (pult ? S : S / 2) * Math.tan(al), M = l3swpMerge(), MA = l3swpMerge(); let nT = 0, lenAll = 0;
    segs.forEach(seg => { const O = seg.A, X = seg.t, Y = seg.n;
      const P = (a, y, z) => [O[0] + X[0] * a + Y[0] * y, O[1] + X[1] * a + Y[1] * y, O[2] + z], zb = dp / 2;
      l3swbPos(seg.L, cc, bw).forEach(a => {
        l3swbBox(M, O, X, Y, l3swbZ, [a - bw / 2, a + bw / 2], [-ov * 0.0, S], [0, dp]);   // underram
        const top = (y) => zb + (pult ? y : Math.min(y, S - y)) * Math.tan(al), cs = Math.cos(al), sn = Math.sin(al);
        if (pult) { l3swbRod(M, P(a, -ov * cs, zb - ov * sn), P(a, S, top(S)), bw, dp, X); l3swbRod(M, P(a, S - bw / 2, zb), P(a, S - bw / 2, top(S)), bw, dp, X);
          [[0, S / 3], [S / 3, 2 * S / 3], [2 * S / 3, S]].forEach(([y0, y1], k) => { const yb = k === 1 ? y0 : y0, zt = top(k === 1 ? y0 : y1); void yb; void zt; });
          l3swbRod(M, P(a, 0, zb), P(a, S / 3, top(S / 3)), bw, dp * 0.8, X); l3swbRod(M, P(a, S / 3, top(S / 3)), P(a, 2 * S / 3, zb), bw, dp * 0.8, X); l3swbRod(M, P(a, 2 * S / 3, zb), P(a, S, top(S)), bw, dp * 0.8, X); }
        else { l3swbRod(M, P(a, -ov * cs, zb - ov * sn), P(a, S / 2, top(S / 2)), bw, dp, X); l3swbRod(M, P(a, S + ov * cs, zb - ov * sn), P(a, S / 2, top(S / 2)), bw, dp, X);
          const w = dp * 0.8; l3swbRod(M, P(a, S / 3, zb), P(a, S / 4, top(S / 4)), bw, w, X); l3swbRod(M, P(a, S / 3, zb), P(a, S / 2, top(S / 2)), bw, w, X); l3swbRod(M, P(a, 2 * S / 3, zb), P(a, S / 2, top(S / 2)), bw, w, X); l3swbRod(M, P(a, 2 * S / 3, zb), P(a, 3 * S / 4, top(3 * S / 4)), bw, w, X); }
        nT++; });
      if (s.lath) { const rows = pult ? [0.4, S / 3, 2 * S / 3, S - 0.3] : [0.4, S / 4, S / 2 - 0.3, S / 2 + 0.3, 3 * S / 4, S - 0.4], cs = Math.cos(al), up = (y) => (pult ? y : Math.min(y, S - y)); rows.forEach(y => { const z = zb + up(y) * Math.tan(al) + (dp / 2 + 0.035) * cs; l3swbRod(MA, P(-0.1, y, z), P(seg.L + 0.1, y, z), 0.045, 0.07, l3swbZ); }); }
      lenAll += seg.L; });
    l3swbPart(parts, M, `Takstolar ${s.form === "pult" ? "pulpet" : "sadel"} ${l3swbF(S, 1)} m, ${l3swbF(al * 180 / Math.PI, 0)}° – ${nT} st (${l3swbF(bw * 1000, 0)}×${l3swbF(dp * 1000, 0)})`, "IFCMEMBER", "#d6b98c", L3SWB_WOOD, S); if (s.lath) l3swbPart(parts, MA, "Åsar 45×70 (bärläkt)", "IFCMEMBER", "#c9a979", L3SWB_WOOD, lenAll);
    return { parts, L: lenAll, area: lenAll * S, list: [[`Takstol ${l3swbF(S, 1)} m`, nT, "", ""], ["Takyta (ca)", "", "", `${l3swbF((lenAll + 2 * ov) * (pult ? S : S) / Math.cos(al), 1)} m²`]] };
  },
};
l3swbDef.sheets = {
  name: "Skivplacering (vägg/tak)", group: "Trä & stomme", input: "line",
  fields: [["H", "Höjd/bredd på ytan", "num", 2.5, { u: "m", st: 0.05, min: 0.3, max: 12 }], ["mat", "Skivtyp", "sel", "gips13", L3SWB_SHEETMAT], ["fmt", "Skivformat", "sel", "1200x2400", [["900x1800", "900 × 1800"], ["1200x2400", "1200 × 2400"], ["1200x2700", "1200 × 2700"], ["1200x3000", "1200 × 3000"], ["600x2400", "600 × 2400"]]], ["ori", "Läggning", "sel", "stand", [["stand", "Stående"], ["lag", "Liggande"]]], ["bond", "Förskjutning (halv skiva)", "chk", true], ["tilt", "Lutning (0 = lodrät, 90 = tak)", "num", 0, { u: "°", st: 5, min: 0, max: 90 }], ["off", "Avstånd från linjen", "num", 0, { u: "m", st: 0.005, min: -1, max: 1 }]],
  build(pts, s) {
    const parts = [], segs = l3swbSegs(pts, s); if (!segs.length) return { parts: [], err: "Linjen är för kort." };
    const m = L3SWB_MAT[s.mat] || L3SWB_MAT.gips13, [sw, sh] = String(s.fmt || "1200x2400").split("x").map(x => Number(x) / 1000), H = Math.max(0.3, +s.H || 2.5), M = l3swpMerge(); const t = { n: 0, whole: 0, cut: 0, area: 0 };
    segs.forEach(seg => { const r = l3swbTile(M, l3swbPlane(seg, s.tilt), seg.L, H, { sw, sh, th: m[1], stand: s.ori !== "lag", bond: !!s.bond, off: +s.off || 0 }); t.n += r.n; t.whole += r.whole; t.cut += r.cut; t.area += r.area; });
    const sheetArea = sw * sh, spill = t.n ? Math.max(0, (t.n * sheetArea - t.area) / (t.n * sheetArea)) : 0;
    l3swbPart(parts, M, `${m[0]} ${l3swbF(sw * 1000, 0)}×${l3swbF(sh * 1000, 0)} – ${t.n} skivor (${t.whole} hela, ${t.cut} kapade), spill ${l3swbF(spill * 100, 0)} %`, "IFCPLATE", m[2], m[3], t.area);
    return { parts, L: segs.reduce((a, q) => a + q.L, 0), area: t.area, list: [[`${m[0]} ${l3swbF(sw * 1000, 0)}×${l3swbF(sh * 1000, 0)}`, t.n, `${t.whole} hela / ${t.cut} kapade`, `${l3swbF(t.area, 1)} m²`], ["Spill (kapat)", "", "", `${l3swbF(spill * 100, 0)} %`]] };
  },
};
/* ---- Fasad, tak och skikt ---- */
const L3SWB_FAC = [["lock", "Stående lockpanel"], ["lagg", "Liggande panel"], ["plat", "Profilerad plåt"], ["puts", "Puts på skiva"]];
l3swbDef.facade = {
  name: "Fasad (panel, plåt, puts)", group: "Fasad & tak", input: "line",
  fields: [["H", "Fasadhöjd", "num", 3, { u: "m", st: 0.1, min: 0.5, max: 20 }], ["typ", "Fasadtyp", "sel", "lock", L3SWB_FAC], ["bw", "Panelbredd", "num", 0.145, { u: "m", st: 0.005, min: 0.07, max: 0.3 }, p => p.typ === "lock" || p.typ === "lagg"], ["col", "Färg", "col", "#8b3a2f"], ["lath", "Läkt bakom (28×70 c/c 600)", "chk", true], ["corner", "Hörnlister", "chk", true], ["dz", "Underkant (relativt linjen)", "num", 0, { u: "m", st: 0.05, min: -2, max: 5 }]],
  build(pts, s) {
    const parts = [], segs = l3swbSegs(pts, s); if (!segs.length) return { parts: [], err: "Linjen är för kort." };
    const H = Math.max(0.5, +s.H || 3), dz = +s.dz || 0, typ = s.typ || "lock", bw = Math.max(0.07, +s.bw || 0.145), col = s.col || "#8b3a2f", lt = s.lath ? 0.028 : 0, MB = l3swpMerge(), ML = l3swpMerge(), MC = l3swpMerge(); let nB = 0, area = 0, lmL = 0, lmB = 0;
    segs.forEach(seg => { const O = [seg.A[0], seg.A[1], seg.A[2] + dz], X = seg.t, Y = seg.n, Z = l3swbZ; area += seg.L * H;
      if (s.lath) { if (typ === "lagg") { for (const a of l3swbPos(seg.L, 0.6, 0.07)) { l3swbBox(ML, O, X, Y, Z, [a - 0.035, a + 0.035], [0, lt], [0, H]); lmL += H; } } else { for (let z = 0.2; z < H; z += 0.6) { l3swbBox(ML, O, X, Y, Z, [0, seg.L], [0, lt], [z - 0.035, z + 0.035]); lmL += seg.L; } } }
      if (typ === "lock") { const pitch = bw - 0.02; for (let a = 0; a < seg.L - 1e-6; a += pitch) { const a1 = Math.min(seg.L, a + bw); l3swbBox(MB, O, X, Y, Z, [a, a1], [lt, lt + 0.022], [0, H]); nB++; lmB += H; } }
      else if (typ === "lagg") { const pitch = bw - 0.02; for (let z = 0; z < H - 1e-6; z += pitch) { l3swbBox(MB, O, X, Y, Z, [0, seg.L], [lt + (0.022 * 0), lt + 0.022], [z, Math.min(H, z + bw)]); nB++; lmB += seg.L; } }
      else if (typ === "plat") { l3swbBox(MB, O, X, Y, Z, [0, seg.L], [lt, lt + 0.0007], [0, H]); for (let a = 0.1; a < seg.L; a += 0.2) { l3swbBox(MB, O, X, Y, Z, [a - 0.02, a + 0.02], [lt, lt + 0.02], [0, H]); nB++; } lmB += seg.L / 0.2 * H; }
      else { l3swbBox(MB, O, X, Y, Z, [0, seg.L], [lt, lt + 0.015], [0, H]); nB = nB + 1; }
      if (s.corner) { [0, seg.L].forEach(a => { l3swbBox(MC, O, X, Y, Z, [a - 0.035, a + 0.035], [lt + 0.0, lt + 0.05], [0, H]); }); } });
    const nm = L3SWB_FAC.find(f => f[0] === typ)[1];
    l3swbPart(parts, MB, `${nm}${typ === "lock" || typ === "lagg" ? ` ${l3swbF(bw * 1000, 0)}×22 mm` : ""} – ${l3swbF(area, 1)} m²`, "IFCCOVERING", col, typ === "plat" ? L3SWB_STEEL * 0.12 : typ === "puts" ? 1800 : L3SWB_WOOD, area);
    if (ML.get().n) l3swbPart(parts, ML, `Läkt 28×70 – ${l3swbF(lmL, 1)} lpm`, "IFCMEMBER", "#c9a979", L3SWB_WOOD, lmL); if (MC.get().n) l3swbPart(parts, MC, "Hörnlister", "IFCCOVERING", "#f1f5f9", L3SWB_WOOD, H);
    return { parts, L: segs.reduce((a, q) => a + q.L, 0), area, list: [[nm, typ === "lock" || typ === "lagg" ? nB : "", typ === "lock" ? `${l3swbF(lmB, 0)} lpm` : "", `${l3swbF(area, 1)} m²`], ["Läkt 28×70", "", "", `${l3swbF(lmL, 0)} lpm`]] };
  },
};
const L3SWB_ROOF = [["pann", "Takpannor (betong)"], ["plat", "Plåt (falsad)"], ["papp", "Papp (tätskikt)"]];
l3swbDef.roofcover = {
  name: "Taktäckning", group: "Fasad & tak", input: "line",
  fields: [["len", "Längd uppför taket", "num", 6, { u: "m", st: 0.1, min: 0.5, max: 30 }], ["ang", "Takvinkel", "num", 27, { u: "°", st: 1, min: 3, max: 70 }], ["typ", "Täckning", "sel", "pann", L3SWB_ROOF], ["col", "Färg", "col", "#44403c"], ["under", "Råspont/underlagstak", "chk", true], ["lath", "Läkt (ströläkt + bärläkt)", "chk", true], ["ov", "Takfotsutsprång", "num", 0.05, { u: "m", st: 0.05, min: 0, max: 1 }]],
  build(pts, s) {
    const parts = [], segs = l3swbSegs(pts, s); if (!segs.length) return { parts: [], err: "Linjen är för kort." };
    const Ls = Math.max(0.5, +s.len || 6), al = Math.max(3, Math.min(70, +s.ang || 27)) * Math.PI / 180, typ = s.typ || "pann", col = s.col || "#44403c", MT = l3swpMerge(), MU = l3swpMerge(), ML = l3swpMerge(); let nT = 0, area = 0, lmL = 0;
    const cs = Math.cos(al), sn = Math.sin(al);
    segs.forEach(seg => { const O = [seg.A[0], seg.A[1], seg.A[2]], X = seg.t, Yb = [seg.n[0] * cs, seg.n[1] * cs, sn], Zn = [-seg.n[0] * sn, -seg.n[1] * sn, cs]; area += seg.L * Ls; let z0 = 0;
      if (s.under) { l3swbBox(MU, O, X, Yb, Zn, [0, seg.L], [-(+s.ov || 0), Ls], [0, 0.022]); z0 = 0.022; }
      if (s.lath) { for (const a of l3swbPos(seg.L, 0.6, 0.045)) { l3swbBox(ML, O, X, Yb, Zn, [a - 0.0225, a + 0.0225], [0, Ls], [z0, z0 + 0.025]); lmL += Ls; } z0 += 0.025; for (let b = 0.1; b < Ls; b += 0.37) { l3swbBox(ML, O, X, Yb, Zn, [0, seg.L], [b - 0.0175, b + 0.0175], [z0, z0 + 0.025]); lmL += seg.L; } z0 += 0.025; }
      if (typ === "pann") { const pw = 0.33, ph = 0.37; let j = 0; for (let b = -(+s.ov || 0); b < Ls - 1e-6; b += ph, j++) for (let a = (j % 2 ? pw / 2 : 0) - (j % 2 ? pw : 0); a < seg.L - 1e-6; a += pw) { const a0 = Math.max(0, a), a1 = Math.min(seg.L, a + pw); if (a1 - a0 < 0.02) continue; l3swbBox(MT, O, X, Yb, Zn, [a0 + 0.002, a1 - 0.002], [b, Math.min(Ls + 0.05, b + 0.42)], [z0, z0 + 0.018]); nT++; } }
      else if (typ === "plat") { const w = 0.5; for (let a = 0; a < seg.L - 1e-6; a += w) { const a1 = Math.min(seg.L, a + w); l3swbBox(MT, O, X, Yb, Zn, [a, a1], [-(+s.ov || 0), Ls + 0.05], [z0, z0 + 0.0006]); l3swbBox(MT, O, X, Yb, Zn, [a1 - 0.012, a1], [-(+s.ov || 0), Ls + 0.05], [z0, z0 + 0.025]); nT++; } }
      else { l3swbBox(MT, O, X, Yb, Zn, [0, seg.L], [-(+s.ov || 0), Ls], [z0, z0 + 0.004]); nT = nT + 1; } });
    const nm = L3SWB_ROOF.find(f => f[0] === typ)[1];
    l3swbPart(parts, MT, `${nm} – ${l3swbF(area, 1)} m²${typ === "pann" ? ` (${nT} pannor, ca ${l3swbF(nT / Math.max(1, area), 1)} st/m²)` : ""}`, "IFCCOVERING", col, typ === "pann" ? 1700 : typ === "plat" ? L3SWB_STEEL * 0.03 : 1100, area);
    if (MU.get().n) l3swbPart(parts, MU, `Råspont 22 mm – ${l3swbF(area, 1)} m²`, "IFCPLATE", "#d6b98c", L3SWB_WOOD, area); if (ML.get().n) l3swbPart(parts, ML, `Läkt – ${l3swbF(lmL, 0)} lpm`, "IFCMEMBER", "#c9a979", L3SWB_WOOD, lmL);
    return { parts, L: segs.reduce((a, q) => a + q.L, 0), area, list: [[nm, typ === "pann" ? nT : "", "", `${l3swbF(area, 1)} m²`], ["Läkt", "", "", `${l3swbF(lmL, 0)} lpm`], ...(s.under ? [["Råspont 22 mm", "", "", `${l3swbF(area, 1)} m²`]] : [])] };
  },
};
const L3SWB_PRESET = {
  vagg: ["Yttervägg trä", "Gips 13:13:#e5e7eb;Plastfolie:0.2:#bfdbfe;Isolering + reglar 45×145:145:#fde047;Vindskydd 9:9:#fde68a;Luftspalt 28:28:#f8fafc;Fasadpanel 22:22:#8b3a2f", "wall"],
  inner: ["Innervägg (regel)", "Gips 13:13:#e5e7eb;Gips 13:13:#e5e7eb;Reglar + isolering 70:70:#fde047;Gips 13:13:#e5e7eb;Gips 13:13:#e5e7eb", "wall"],
  mark: ["Golv på mark", "Parkett 14:14:#d6a35c;Underlag 3:3:#94a3b8;Avjämning 20:20:#cbd5e1;Betongplatta 100:100:#9ca3af;Cellplast 200:200:#93c5fd;Dränerande krossbädd 150:150:#a1a1aa", "floor"],
  bjalk: ["Trä-bjälklag", "Golvbeläggning 14:14:#d6a35c;Golvskiva 22:22:#d9b27c;Bjälkar + mineralull 195:195:#fde047;Glespanel 28:28:#c9a979;Gips 13:13:#e5e7eb", "floor"],
  tak: ["Tak, kallvind", "Betongpannor 35:35:#44403c;Läkt 25:25:#c9a979;Underlagspapp 4:4:#1f2937;Råspont 22:22:#d6b98c;Luftad takstol:100:#f8fafc;Mineralull 300:300:#fde047;Plastfolie:0.2:#bfdbfe;Gips 13:13:#e5e7eb", "ceil"],
};
function l3swbLayers(text) { return String(text || "").split(";").map(t => t.trim()).filter(Boolean).map(t => { const q = t.split(":"); return { n: (q[0] || "Skikt").trim(), mm: Math.max(0.1, Number(String(q[1] || "10").replace(",", "."))), col: (q[2] || "#cbd5e1").trim() }; }); }
l3swbDef.layers = {
  name: "Skiktuppbyggnad (vägg/golv/tak)", group: "Fasad & tak", input: "line",
  fields: [["preset", "Förval", "sel", "vagg", Object.entries(L3SWB_PRESET).map(([k, v]) => [k, v[0]])], ["layers", "Skikt (namn:mm:färg; …)", "txt", L3SWB_PRESET.vagg[1], { tip: "Ett skikt per post, utifrån och in (vägg) eller uppifrån och ned (golv). Namn:tjocklek i mm:färg (valfri)." }], ["ori", "Yta", "sel", "wall", [["wall", "Vägg (lodrät)"], ["floor", "Golv (vågrät, uppåt)"], ["ceil", "Tak (vågrät, nedåt)"]]], ["H", "Höjd / djup på ytan", "num", 2.6, { u: "m", st: 0.1, min: 0.3, max: 30 }]],
  build(pts, s) {
    const parts = [], segs = l3swbSegs(pts, s); if (!segs.length) return { parts: [], err: "Linjen är för kort." };
    const L = l3swbLayers(s.layers); if (!L.length) return { parts: [], err: "Lägg in minst ett skikt." }; const H = Math.max(0.3, +s.H || 2.6), ori = s.ori || "wall", list = []; const Ms = L.map(() => l3swpMerge()); let area = 0, tot = 0;
    segs.forEach(seg => { area += seg.L * H; let off = 0; L.forEach((ly, i) => { const th = ly.mm / 1000;
      if (ori === "wall") l3swbBox(Ms[i], seg.A, seg.t, seg.n, l3swbZ, [0, seg.L], [off, off + th], [0, H]);   // inifrån: utåt är n
      else { const dir = ori === "floor" ? -1 : 1; l3swbBox(Ms[i], seg.A, seg.t, seg.n, l3swbZ, [0, seg.L], [0, H], dir > 0 ? [off, off + th] : [-off - th, -off]); }
      off += th; }); });
    L.forEach((ly, i) => { tot += ly.mm; const dens = /isol|ull|cell/i.test(ly.n) ? 30 : /betong|avj/i.test(ly.n) ? 2200 : /gips|skiva|spont|panel|parkett|läkt|reglar/i.test(ly.n) ? 600 : 400; const p = l3swbPart(parts, Ms[i], `${ly.n} (${l3swbF(ly.mm, 0)} mm) – ${l3swbF(area, 1)} m²`, /isol|ull|cell|folie|papp|duk/i.test(ly.n) ? "IFCBUILDINGELEMENTPROXY" : "IFCCOVERING", ly.col, dens, area); if (p) list.push([ly.n, "", `${l3swbF(ly.mm, 0)} mm`, `${l3swbF(area, 1)} m²`]); });
    list.push(["Total tjocklek", "", `${l3swbF(tot, 0)} mm`, ""]); return { parts, L: segs.reduce((a, q) => a + q.L, 0), area, list };
  },
};
/* ---- Invändigt ---- */
l3swbDef.ceiling = {
  name: "Undertak (gips)", group: "Invändigt", input: "line",
  fields: [["B", "Rummets djup", "num", 4, { u: "m", st: 0.1, min: 0.5, max: 30 }], ["H", "Takhöjd (underkant gips)", "num", 2.6, { u: "m", st: 0.05, min: 1.8, max: 12 }], ["up", "Avstånd upp till stomme", "num", 0.3, { u: "m", st: 0.05, min: 0.1, max: 2 }], ["mat", "Skiva", "sel", "gips13", [["gips13", "Gips 13 mm"], ["gips2", "Gips 2 × 13 mm"]]], ["fmt", "Skivformat", "sel", "1200x2400", [["900x1800", "900 × 1800"], ["1200x2400", "1200 × 2400"], ["1200x2700", "1200 × 2700"]]], ["cc", "Skenavstånd", "sel", "450", [["300", "c/c 300"], ["450", "c/c 450"], ["600", "c/c 600"]]]],
  build(pts, s) {
    const parts = [], segs = l3swbSegs(pts, s); if (!segs.length) return { parts: [], err: "Linjen är för kort." };
    const B = Math.max(0.5, +s.B || 4), H = +s.H || 2.6, up = Math.max(0.1, +s.up || 0.3), cc = (+s.cc || 450) / 1000, m = L3SWB_MAT[s.mat] || L3SWB_MAT.gips13, [sw, sh] = String(s.fmt || "1200x2400").split("x").map(x => Number(x) / 1000);
    const MR = l3swpMerge(), MH = l3swpMerge(), MG = l3swpMerge(); let lmR = 0, nH = 0, area = 0, nG = 0, whole = 0, cut = 0, aG = 0;
    segs.forEach(seg => { const O = [seg.A[0], seg.A[1], seg.A[2] + H], X = seg.t, Y = seg.n, Z = l3swbZ; area += seg.L * B;
      for (const y of l3swbPos(B, cc, 0.027)) { l3swbBox(MR, O, X, Y, Z, [0, seg.L], [y - 0.0135, y + 0.0135], [m[1], m[1] + 0.027]); lmR += seg.L; }
      for (const a of l3swbPos(seg.L, 1.2, 0.027)) { l3swbBox(MR, O, X, Y, Z, [a - 0.0135, a + 0.0135], [0, B], [m[1] + 0.027, m[1] + 0.054]); lmR += B; for (const y of [0.3, 1.5, 2.7, 3.9, 5.1].filter(v => v < B)) { l3swbBox(MH, O, X, Y, Z, [a - 0.003, a + 0.003], [y - 0.003, y + 0.003], [m[1] + 0.054, m[1] + up]); nH++; } }
      const r = l3swbTile(MG, { O, a: X, b: Y, N: Z }, seg.L, B, { sw, sh, th: m[1], stand: false, bond: true, off: 0 }); nG += r.n; whole += r.whole; cut += r.cut; aG += r.area; });
    l3swbPart(parts, MG, `${m[0]} ${l3swbF(sw * 1000, 0)}×${l3swbF(sh * 1000, 0)} – ${nG} skivor (${whole} hela, ${cut} kapade) – ${l3swbF(area, 1)} m²`, "IFCPLATE", m[2], m[3], area);
    l3swbPart(parts, MR, `Skenor CD 60 (c/c ${l3swbF(cc * 1000, 0)} + bärskenor c/c 1200) – ${l3swbF(lmR, 0)} lpm`, "IFCMEMBER", "#94a3b8", L3SWB_STEEL * 0.0016, lmR); l3swbPart(parts, MH, `Hängare – ${nH} st`, "IFCMEMBER", "#64748b", L3SWB_STEEL, nH);
    return { parts, L: segs.reduce((a, q) => a + q.L, 0), area, list: [[`${m[0]} ${l3swbF(sw * 1000, 0)}×${l3swbF(sh * 1000, 0)}`, nG, `${whole} hela / ${cut} kapade`, `${l3swbF(area, 1)} m²`], ["Skena CD 60", "", "", `${l3swbF(lmR, 0)} lpm`], ["Hängare", nH, "", ""]] };
  },
};
l3swbDef.room = {
  name: "Rum (golv, area, volym)", group: "Invändigt", input: "poly",
  fields: [["name", "Rumsnamn", "txt1", "Rum 101"], ["H", "Takhöjd", "num", 2.6, { u: "m", st: 0.05, min: 1.5, max: 12 }], ["th", "Golvplatta (tjocklek)", "num", 0.02, { u: "m", st: 0.005, min: 0.005, max: 0.5 }], ["col", "Färg", "col", "#93c5fd"], ["fn", "Funktion", "sel", "", [["", "–"], ["Bostad", "Bostad"], ["Kontor", "Kontor"], ["Våtrum", "Våtrum"], ["Teknik", "Teknik"], ["Förråd", "Förråd"], ["Trapphus", "Trapphus"], ["Korridor", "Korridor"]]]],
  build(pts, s) {
    if (!pts || pts.length < 3) return { parts: [], err: "Rummet behöver minst tre hörn." };
    const P = pts.map(q => [q[0] - pts[0][0], q[1] - pts[0][1]]); let a = 0, per = 0; for (let i = 0; i < P.length; i++) { const q = P[(i + 1) % P.length]; a += P[i][0] * q[1] - q[0] * P[i][1]; per += Math.hypot(q[0] - P[i][0], q[1] - P[i][1]); } a = Math.abs(a) / 2;
    const th = Math.max(0.005, +s.th || 0.02), z0 = Math.min(...pts.map(q => q[2])), H = +s.H || 2.6, pr = l3swpPrism(P, null, z0, z0 + th, [pts[0][0], pts[0][1]], [1, 0], [0, 1]), vol = a * H;
    return { parts: [{ name: `${s.name || "Rum"}${s.fn ? " – " + s.fn : ""} – ${l3swbF(a, 1)} m² · ${l3swbF(vol, 1)} m³ (takhöjd ${l3swbF(H, 2)} m)`, mesh: { pts: pr.pts, faces: pr.faces }, vol: pr.vol, len: per, ifc: "IFCSLAB", color: s.col || "#93c5fd", mass: pr.vol * 2400 }], L: per, area: a, list: [[s.name || "Rum", "", `${l3swbF(per, 1)} m omkrets`, `${l3swbF(a, 1)} m²`], ["Rumsvolym", "", `takhöjd ${l3swbF(H, 2)} m`, `${l3swbF(vol, 1)} m³`]] };
  },
};
const L3SWB_SVC = [["stege", "Kabelstege (300 mm)"], ["kanal", "Ventkanal rektangulär"], ["rund", "Ventkanal rund"], ["rorp", "Rör Ø 110 (avlopp)"], ["rorv", "Rör Ø 50 (vatten, isolerat)"]];
l3swbDef.service = {
  name: "Installationsstråk (vent, el, rör)", group: "Invändigt", input: "line",
  fields: [["typ", "Typ", "sel", "kanal", L3SWB_SVC], ["w", "Bredd / Ø", "num", 0.4, { u: "m", st: 0.01, min: 0.03, max: 1.5 }], ["h", "Höjd", "num", 0.2, { u: "m", st: 0.01, min: 0.03, max: 1.5 }, p => p.typ === "kanal" || p.typ === "stege"], ["dz", "Nivå relativt linjen", "num", 0, { u: "m", st: 0.05, min: -5, max: 8 }], ["hang", "Upphängning c/c", "chk", true], ["hc", "Hängaravstånd", "num", 1.5, { u: "m", st: 0.1, min: 0.5, max: 4 }, p => p.hang], ["up", "Upp till stomme", "num", 0.4, { u: "m", st: 0.05, min: 0.1, max: 3 }, p => p.hang]],
  build(pts, s) {
    const parts = [], list = [], typ = s.typ || "kanal", w = Math.max(0.03, +s.w || 0.4), h = Math.max(0.03, +s.h || 0.2), dz = +s.dz || 0, M = l3swpMerge(), MR = l3swpMerge(), MH = l3swpMerge(), pp = pts.map(q => [q[0], q[1], q[2] + dz]); let L = 0, nH = 0;
    if (pp.length < 2) return { parts: [], err: "Linjen behöver minst två punkter." };
    for (let i = 0; i + 1 < pp.length; i++) { const A = pp[i], B = pp[i + 1], l = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]); if (l < 0.05) continue; L += l;
      if (typ === "kanal") l3swbRod(M, A, B, w, h, l3swbZ);
      else if (typ === "stege") { const u = l3swbNorm([B[0] - A[0], B[1] - A[1], B[2] - A[2]]), sd = l3swbNorm(l3swbCross(u, l3swbZ)); [-1, 1].forEach(k => l3swbRod(MR, [A[0] + sd[0] * k * w / 2, A[1] + sd[1] * k * w / 2, A[2]], [B[0] + sd[0] * k * w / 2, B[1] + sd[1] * k * w / 2, B[2]], 0.03, h, l3swbZ)); for (let a = 0.15; a < l; a += 0.3) { const P = [A[0] + u[0] * a, A[1] + u[1] * a, A[2] + u[2] * a]; l3swbRod(MR, [P[0] - sd[0] * w / 2, P[1] - sd[1] * w / 2, P[2] - h / 2 + 0.01], [P[0] + sd[0] * w / 2, P[1] + sd[1] * w / 2, P[2] - h / 2 + 0.01], 0.02, 0.012, l3swbZ); } }
      else { const r = typ === "rund" ? w / 2 : typ === "rorp" ? 0.0575 : (w ? Math.min(w, 0.06) : 0.03) / 2 + (typ === "rorv" ? 0.02 : 0); l3swpBar0(M, A, B, r); }
      if (s.hang) { for (let a = (+s.hc || 1.5) / 2; a < l; a += (+s.hc || 1.5)) { const k = a / l, P = [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k]; l3swbRod(MH, [P[0], P[1], P[2] + (typ === "kanal" || typ === "stege" ? h / 2 : w / 2)], [P[0], P[1], P[2] + (+s.up || 0.4)], 0.008, 0.008, [1, 0, 0]); nH++; } } }
    const nm = L3SWB_SVC.find(q => q[0] === typ)[1], col = typ === "stege" ? "#94a3b8" : typ === "kanal" || typ === "rund" ? "#cbd5e1" : typ === "rorp" ? "#6b7280" : "#60a5fa";
    l3swbPart(parts, M, `${nm} – ${l3swbF(L, 1)} m`, "IFCBUILDINGELEMENTPROXY", col, typ === "kanal" || typ === "rund" ? 12 : 600, L); l3swbPart(parts, MR, `Kabelstege – ${l3swbF(L, 1)} m`, "IFCMEMBER", col, L3SWB_STEEL * 0.002, L); if (nH) l3swbPart(parts, MH, `Hängare (gängstång) – ${nH} st`, "IFCMEMBER", "#64748b", L3SWB_STEEL, nH);
    list.push([nm, "", `${l3swbF(L, 1)} m`, ""], ["Hängare", nH, "", ""]); return { parts, L, area: 0, list };
  },
};
function l3swpBar0(M, A, B, r) { const g = l3swpBar(A, B, r, 12); M.add(g); }
/* ---- Inkoppling i Stödmur-verktyget ---- */
Object.keys(l3swbDef).forEach(k => { L3SW_KINDS[k] = l3swbDef[k].name; });
const l3swbIs = k => !!l3swbDef[k];
function l3swbInit(s) {
  const d = l3swbDef[s.kind]; if (!d || s._bk === s.kind) return; const bv = s._bv = s._bv || {};
  if (s._bk && l3swbDef[s._bk]) { const o = {}; l3swbDef[s._bk].fields.forEach(f => { o[f[0]] = s[f[0]]; }); bv[s._bk] = o; }   // fälten per typ minns sina värden (Höjd m.fl. delas annars med stödmurarnas)
  const fresh = !!s._bk; s._bk = s.kind; const sv = bv[s.kind] || {};
  d.fields.forEach(f => { const k = f[0]; let v = sv[k]; if (v === undefined || v === null) { const cur = s[k], base = k in L3SW_DEF && cur === L3SW_DEF[k], okSel = f[2] !== "sel" || (cur != null && f[4].some(o => o[0] === String(cur))); v = !fresh && cur !== undefined && cur !== null && !base && okSel ? cur : f[3]; } s[k] = v; });
}
{ const b0 = l3swBuild; l3swBuild = function (pts, s) { if (!l3swbIs(s.kind)) return b0(pts, s); l3swbInit(s); const r = l3swbDef[s.kind].build(pts, s); r.list = r.list || []; return r; }; }
function l3swbFieldHtml(f, s) {
  const [k, label, type, def, o] = f, E = escHtml, v = s[k] != null ? s[k] : def, show = (type === "num" || type === "sel" || type === "chk" || type === "txt" || type === "col") && typeof (type === "num" ? f[5] : f[5]) === "function" ? f[5] : null; void show;
  if (type === "sel") return `<label class="v3-rd-n" style="grid-column:1/3"><span>${E(label)}</span><select data-bk="${k}" style="flex:1">${o.map(([a, t]) => `<option value="${E(a)}" ${String(v) === a ? "selected" : ""}>${E(t)}</option>`).join("")}</select></label>`;
  if (type === "num") return `<label class="v3-rd-n"><span>${E(label)}</span><input type="number" data-bkn="${k}" value="${v}" min="${o.min}" max="${o.max}" step="${o.st}"><em>${o.u || ""}</em></label>`;
  if (type === "chk") return `<label class="v3-ga-tg" style="grid-column:1/3"><input type="checkbox" data-bkc="${k}" ${v ? "checked" : ""}><span>${E(label)}</span></label>`;
  if (type === "col") return `<label class="v3-rd-n"><span>${E(label)}</span><input type="color" data-bk="${k}" value="${E(v)}"></label>`;
  if (type === "txt1") return `<label class="v3-rd-n" style="grid-column:1/3"><span>${E(label)}</span><input type="text" data-bk="${k}" value="${E(v)}" style="flex:1"></label>`;
  return `<label class="v3-rd-n" style="grid-column:1/3;align-items:flex-start;flex-direction:column;gap:2px" ${o && o.tip ? `title="${E(o.tip)}"` : ""}><span>${E(label)}</span><textarea data-bk="${k}" rows="3" placeholder="${E((o && o.ph) || "")}" style="width:100%;box-sizing:border-box;font:11px/1.35 ui-monospace,monospace">${E(v)}</textarea></label>`;
}
function l3swbPanel(c) {
  const el = document.getElementById("v3WallPanel"); if (!el) return; const s = c.spec, d = l3swbDef[s.kind], r = c.res || { parts: [] }, E = escHtml; l3swbInit(s);
  const vol = (r.parts || []).reduce((a, p) => a + p.vol, 0), mass = (r.parts || []).reduce((a, p) => a + (p.mass != null ? p.mass : 0), 0);
  const kinds = [...L3SWB_GROUPS.map(([g, ks]) => `<optgroup label="${E(g)}">${ks.map(k => `<option value="${k}" ${s.kind === k ? "selected" : ""}>${E(l3swbDef[k].name)}</option>`).join("")}</optgroup>`)].join("");
  const fields = d.fields.filter(f => typeof f[5] !== "function" || f[5](s)).filter(f => !(f[2] === "num" && typeof f[4] === "function")).map(f => (f[2] === "num" || f[2] === "sel") && typeof f[5] === "function" ? f : f);
  const html = d.fields.filter(f => { const cond = f[2] === "num" ? f[5] : f[5]; return typeof cond !== "function" || cond(s); }).map(f => l3swbFieldHtml(f, s)).join(""); void fields;
  el.innerHTML = `<div class="v3-vp-h"><b>${E(d.name)}</b><span>${l3swbF(r.L || 0, 1)} m · ${c.pts.length} punkter</span><button type="button" data-wb="x" title="Stäng (Esc)">✕</button></div>
    <div class="v3-vq-note" style="background:#f1f5f9;color:#334155">${(r.parts || []).length} del${(r.parts || []).length === 1 ? "" : "ar"} · volym ${l3swbF(vol, 2)} m³ · ca ${l3swbF(mass, 0)} kg${r.area ? ` · yta ${l3swbF(r.area, 1)} m²` : ""}</div>
    ${r.err ? `<div class="v3-vq-note" style="background:#fef2f2;color:#b91c1c;margin-top:4px">${E(r.err)}</div>` : ""}
    <div class="v3-rd-g" style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;margin-top:6px">
      <label class="v3-rd-n" style="grid-column:1/3"><span>Byggdel</span><select data-bkind style="flex:1">${kinds}</select></label>
      ${s.kind === "layers" ? "" : ""}${html}
      ${d.input === "poly" ? "" : `<label class="v3-rd-n" title="Vilken sida byggdelen läggs åt (sett i linjens riktning)"><span>Läggs åt</span><select data-bsoil><option value="L" ${s.soil !== "R" ? "selected" : ""}>vänster</option><option value="R" ${s.soil === "R" ? "selected" : ""}>höger</option></select></label>`}
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><button type="button" class="v3-primary" data-wb="make">${c.editSet ? "Uppdatera" : "Skapa"}</button>${d.input === "poly" ? "" : `<button type="button" data-wb="flip" title="Vänd sidan">⇄ Vänd</button>`}<button type="button" data-bklist title="Stycklista och mängder: kopiera till Excel eller spara som CSV">☰ Stycklista</button></div>
    <div class="v3-pal-hint" style="margin-top:6px">Dra i ringarna för att flytta linjens punkter, ＋ lägger till en punkt. Delarna blir vanliga redigerbara objekt med mängd, vikt och IFC-klass – ✎ Redigera i objektets panel öppnar byggdelen igen.</div>`;
  const q = sel => el.querySelector(sel), re = () => { l3swPanel(); l3swDraw(); };
  q('[data-wb="x"]').onclick = () => l3swClose(); q('[data-wb="make"]').onclick = () => l3swMake(); const fl = q('[data-wb="flip"]'); if (fl) fl.onclick = () => { s.soil = s.soil === "R" ? "L" : "R"; re(); };
  q("[data-bkind]").onchange = e => { const nk = e.target.value; s.kind = nk; s._bk = null; if (nk === "layers") { s.preset = s.preset || "vagg"; } re(); };
  const sd = q("[data-bsoil]"); if (sd) sd.onchange = e => { s.soil = e.target.value; re(); };
  el.querySelectorAll("[data-bkn]").forEach(i => { i.onchange = () => { const v = Number(String(i.value).replace(",", ".")); if (Number.isFinite(v)) s[i.dataset.bkn] = v; re(); }; });
  el.querySelectorAll("[data-bkc]").forEach(i => { i.onchange = () => { s[i.dataset.bkc] = i.checked; re(); }; });
  el.querySelectorAll("[data-bk]").forEach(i => { i.onchange = () => { s[i.dataset.bk] = i.value; if (s.kind === "layers" && i.dataset.bk === "preset") { const p = L3SWB_PRESET[i.value]; if (p) { s.layers = p[1]; s.ori = p[2]; } } re(); }; });
  q("[data-bklist]").onclick = () => l3swbList(c);
}
{ const p0 = l3swPanel; l3swPanel = function () { p0(); const c = l3sw.cur; if (c && l3swbIs(c.spec.kind)) l3swbPanel(c); }; }
function l3swbList(c) {
  const r = c.res || l3swBuild(c.pts, c.spec), rows = [...(r.list || []), ...((r.parts || []).map(p => [p.name, "", "", `${l3swbF(p.vol, 3)} m³ · ${l3swbF(p.mass || 0, 0)} kg`]))];
  if (!rows.length) { l3Status("Inget att lista än.", true); return; }
  const E = escHtml, d = l3Dlg("v3SwbList", "Stycklista", `<div class="v3-swp-tw"><table class="v3-swp-t"><thead><tr><th class="l">Benämning</th><th>Antal</th><th>Längd/format</th><th>Mängd</th></tr></thead><tbody>${rows.map(q => `<tr><td class="l">${E(q[0])}</td><td>${E(String(q[1]))}</td><td>${E(String(q[2]))}</td><td>${E(String(q[3]))}</td></tr>`).join("")}</tbody></table></div><div class="v3-gd-btns"><button type="button" data-lc>Kopiera (Excel)</button><button type="button" data-lv>Spara CSV</button></div>`);
  d.style.width = "min(640px, 94%)";
  d.querySelector("[data-lc]").onclick = async () => { try { await navigator.clipboard.writeText(["Benämning\tAntal\tLängd/format\tMängd", ...rows.map(q => q.join("\t"))].join("\n")); l3Toast("Stycklistan är kopierad – klistra in i Excel."); } catch (e) { l3Status("Kunde inte kopiera: " + e.message, true); } };
  d.querySelector("[data-lv]").onclick = () => { const csv = ["Benämning;Antal;Längd/format;Mängd", ...rows.map(q => q.map(v => String(v).replace(/;/g, ",")).join(";"))].join("\r\n"), a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = "stycklista.csv"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000); };
}
/* ---- Biblioteket: "Byggdelar" under Objektbibliotek ---- */
function l3swbCard(kind) {
  const d = l3swbDef[kind]; if (!d) return; if (typeof l3SetTool === "function" && l3.tool !== "select") l3SetTool("select");
  l3sw.last = { ...(l3sw.last || {}), kind, _bk: null }; try { l3SetPref("measure", "wall"); l3SetTool("measure"); } catch (e) {}
  l3Status(d.input === "poly" ? "Tryck rummets hörn i 3D och Enter när du är klar." : "Tryck ut linjen i 3D (väggens/kantens läge), Enter när du är klar.");
}
function l3swbHookLib() {
  if (typeof l3RenderLib !== "function" || l3RenderLib._bygg) return; const r0 = l3RenderLib;
  l3RenderLib = window.l3RenderLib = function () {
    r0(); const el = document.getElementById("v3Lib"); if (!el) return; const closed = new Set(l3Prefs().palClosed || []), q = ((document.getElementById("v3PalSearch") || {}).value || "").trim().toLowerCase(), E = escHtml;
    const open = !!q || !closed.has("__bygg"); const all = Object.keys(l3swbDef), hit = k => !q || l3swbDef[k].name.toLowerCase().includes(q) || l3swbDef[k].group.toLowerCase().includes(q); if (q && !all.some(hit)) return;
    const wrap = document.createElement("div"); wrap.id = "v3Bygg"; wrap.innerHTML = `<div class="v3-lf v3-lf-all v3-pill"><button type="button" class="v3-pal-g" data-bgrp aria-expanded="${open}" title="Fäll ihop eller ut byggdelarna"><span>Byggdelar</span><em>${all.length}</em></button></div>` + (open ? L3SWB_GROUPS.map(([g, ks]) => { const list = ks.filter(hit); if (!list.length) return ""; return `<div class="v3-lf v3-pill"><button type="button" class="v3-pal-g" style="cursor:default"><span>${E(g)}</span><em>${list.length}</em></button></div><div class="v3-pal-items">` + list.map(k => `<div class="v3-li"><button type="button" data-bygg="${k}" title="${E(l3swbDef[k].name)} – tryck ut linjen i 3D och Enter"><i style="background:#c9a979"></i><span>${E(l3swbDef[k].name)}</span></button></div>`).join("") + `</div>`; }).join("") : "");
    el.appendChild(wrap);
    wrap.querySelector("[data-bgrp]").onclick = e => { const set = new Set(l3Prefs().palClosed || []); if (e.currentTarget.getAttribute("aria-expanded") === "true") set.add("__bygg"); else set.delete("__bygg"); l3SetPref("palClosed", [...set]); l3RenderLib(); };
    wrap.querySelectorAll("[data-bygg]").forEach(b => { b.onclick = () => l3swbCard(b.dataset.bygg); });
  };
  l3RenderLib._bygg = true;
}
if (document.readyState === "complete") l3swbHookLib(); else window.addEventListener("load", () => { l3swbHookLib(); if (typeof l3RenderLib === "function") { try { l3RenderLib(); } catch (e) { /* biblioteket ritas senare */ } } });
