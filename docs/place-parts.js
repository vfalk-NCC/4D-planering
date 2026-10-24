/* Byggdelar och material (Victor 2026-10-24: "standardbalkar, håldäck och andra byggdelar som ofta förekommer på en byggplats och kan behöva lagras … alla HEA-profiler, UPE …"):
   smarta objekt i mappen Byggdelar – stålprofiler med riktiga mått (HEA, HEB, HEM, IPE, UPE, UPN, kvadrat- och rektangelrör, rundrör, vinkeljärn), håldäck i alla tjocklekar och
   bredder, betongelement (pelare, balk, vägg, sandwichvägg, plattbärlag, trappa), virkespaket, armering, rörbuntar och material på pall. Allt kan staplas/buntas i valfritt antal;
   mått och vikt räknas ut och visas på skylten. Laddas efter place-smart-objs.js (SM, SMM, smF, smN, smFmt, mcExtrude saknas här – bara lådor och cylindrar). */
const BD_CONC = "#b8bbbe", BD_STEEL = "#8d97a3", BD_WOOD = "#d3a972", BD_DARK = "#4b5563";
const bdKg = (A_mm2) => A_mm2 * 0.00785;               // kg per meter av tvärsnittsarean i mm² (stål 7850 kg/m³)
/* Profiler: [namn, h, b, tw, tf] i mm (valsade I- och U-profiler). */
const BD_I = {
  HEA: [[100, 96, 100, 5, 8], [120, 114, 120, 5, 8], [140, 133, 140, 5.5, 8.5], [160, 152, 160, 6, 9], [180, 171, 180, 6, 9.5], [200, 190, 200, 6.5, 10], [220, 210, 220, 7, 11], [240, 230, 240, 7.5, 12], [260, 250, 260, 7.5, 12.5], [280, 270, 280, 8, 13], [300, 290, 300, 8.5, 14], [320, 310, 300, 9, 15.5], [340, 330, 300, 9.5, 16.5], [360, 350, 300, 10, 17.5], [400, 390, 300, 11, 19], [450, 440, 300, 11.5, 21], [500, 490, 300, 12, 23], [550, 540, 300, 12.5, 24], [600, 590, 300, 13, 25], [650, 640, 300, 13.5, 26], [700, 690, 300, 14.5, 27], [800, 790, 300, 15, 28], [900, 890, 300, 16, 30], [1000, 990, 300, 16.5, 31]],
  HEB: [[100, 100, 100, 6, 10], [120, 120, 120, 6.5, 11], [140, 140, 140, 7, 12], [160, 160, 160, 8, 13], [180, 180, 180, 8.5, 14], [200, 200, 200, 9, 15], [220, 220, 220, 9.5, 16], [240, 240, 240, 10, 17], [260, 260, 260, 10, 17.5], [280, 280, 280, 10.5, 18], [300, 300, 300, 11, 19], [320, 320, 300, 11.5, 20.5], [340, 340, 300, 12, 21.5], [360, 360, 300, 12.5, 22.5], [400, 400, 300, 13.5, 24], [450, 450, 300, 14, 26], [500, 500, 300, 14.5, 28], [550, 550, 300, 15, 29], [600, 600, 300, 15.5, 30], [650, 650, 300, 16, 31], [700, 700, 300, 17, 32], [800, 800, 300, 17.5, 33], [900, 900, 300, 18.5, 35], [1000, 1000, 300, 19, 36]],
  HEM: [[100, 120, 106, 12, 20], [120, 140, 126, 12.5, 21], [140, 160, 146, 13, 22], [160, 180, 166, 14, 23], [180, 200, 186, 14.5, 24], [200, 220, 206, 15, 25], [220, 240, 226, 15.5, 26], [240, 270, 248, 18, 32], [260, 290, 268, 18, 32.5], [280, 310, 288, 18.5, 33], [300, 340, 310, 21, 39], [320, 359, 309, 21, 40], [340, 377, 309, 21, 40], [360, 395, 308, 21, 40], [400, 432, 307, 21, 40]],
  IPE: [[80, 80, 46, 3.8, 5.2], [100, 100, 55, 4.1, 5.7], [120, 120, 64, 4.4, 6.3], [140, 140, 73, 4.7, 6.9], [160, 160, 82, 5, 7.4], [180, 180, 91, 5.3, 8], [200, 200, 100, 5.6, 8.5], [220, 220, 110, 5.9, 9.2], [240, 240, 120, 6.2, 9.8], [270, 270, 135, 6.6, 10.2], [300, 300, 150, 7.1, 10.7], [330, 330, 160, 7.5, 11.5], [360, 360, 170, 8, 12.7], [400, 400, 180, 8.6, 13.5], [450, 450, 190, 9.4, 14.6], [500, 500, 200, 10.2, 16], [550, 550, 210, 11.1, 17.2], [600, 600, 220, 12, 19]],
  UPE: [[80, 80, 50, 4, 7], [100, 100, 55, 4.5, 7.5], [120, 120, 60, 5, 8], [140, 140, 65, 5, 9], [160, 160, 70, 5.5, 9.5], [180, 180, 75, 5.5, 10.5], [200, 200, 80, 6, 11], [220, 220, 85, 6.5, 12], [240, 240, 90, 7, 12.5], [270, 270, 95, 7.5, 13.5], [300, 300, 100, 9.5, 15], [330, 330, 105, 11, 16], [360, 360, 110, 12, 17], [400, 400, 115, 13.5, 18]],
  UPN: [[80, 80, 45, 6, 8], [100, 100, 50, 6, 8.5], [120, 120, 55, 7, 9], [140, 140, 60, 7, 10], [160, 160, 65, 7.5, 10.5], [180, 180, 70, 8, 11], [200, 200, 75, 8.5, 11.5], [220, 220, 80, 9, 12.5], [240, 240, 85, 9.5, 13], [260, 260, 90, 10, 14], [280, 280, 95, 10, 15], [300, 300, 100, 10, 16], [320, 320, 100, 14, 17.5], [350, 350, 100, 14, 16], [380, 380, 102, 13.5, 16], [400, 400, 110, 14, 18]],
};
/* Rör och vinkel: [h, b, t] i mm (rektangel/kvadrat: yttermått), rundrör [D, t], vinkel [a, t]. */
const BD_RHS = [[40, 40, 3], [50, 50, 4], [60, 60, 4], [70, 70, 4], [80, 80, 5], [90, 90, 5], [100, 100, 5], [120, 120, 6], [140, 140, 6], [150, 150, 8], [160, 160, 8], [180, 180, 8], [200, 200, 10], [250, 250, 10], [300, 300, 12], [400, 400, 16], [80, 40, 4], [100, 50, 4], [120, 60, 5], [150, 100, 6], [200, 100, 8], [250, 150, 8], [300, 200, 10], [400, 200, 12]];
const BD_CHS = [[48.3, 3.2], [60.3, 4], [76.1, 4], [88.9, 4], [101.6, 5], [114.3, 5], [139.7, 6.3], [168.3, 6.3], [193.7, 8], [219.1, 8], [273, 10], [323.9, 10], [355.6, 12.5], [406.4, 12.5], [508, 16]];
const BD_L = [[50, 5], [60, 6], [80, 8], [100, 10], [120, 12], [150, 15], [200, 20]];
const BD_SER = ["HEA", "HEB", "HEM", "IPE", "UPE", "UPN", "Kvadrat-/rektangelrör", "Rundrör", "Vinkeljärn"];
const bdNum = v => String(v).replace(".", ",");
function bdSizes(ser) {
  if (BD_I[ser]) return BD_I[ser].map(r => [String(r[0]), `${ser} ${r[0]}`]);
  if (ser === "Kvadrat-/rektangelrör") return BD_RHS.map(r => [r.join("x"), `${r[0]}×${r[1]}×${bdNum(r[2])}`]);
  if (ser === "Rundrör") return BD_CHS.map(r => [r.join("x"), `Ø${bdNum(r[0])}×${bdNum(r[1])}`]);
  return BD_L.map(r => [r.join("x"), `${r[0]}×${r[0]}×${r[1]}`]);
}
/* Mått (m) och kg/m för vald profil. */
function bdSection(ser, size) {
  if (BD_I[ser]) { const r = BD_I[ser].find(x => String(x[0]) === String(size)) || BD_I[ser].reduce((m, x) => Math.abs(x[0] - Number(size)) < Math.abs(m[0] - Number(size)) ? x : m, BD_I[ser][4]), [, h, b, tw, tf] = r, U = /^U/.test(ser), A = U ? 2 * b * tf + (h - 2 * tf) * tw : 2 * b * tf + (h - 2 * tf) * tw; return { kind: U ? "U" : "I", h: h / 1000, b: b / 1000, tw: tw / 1000, tf: tf / 1000, kg: bdKg(A) * (U ? 1 : 1.04), name: `${ser} ${r[0]}` }; }
  if (ser === "Kvadrat-/rektangelrör") { const r = BD_RHS.find(x => x.join("x") === String(size)) || BD_RHS[6], [h, b, t] = r; return { kind: "R", h: h / 1000, b: b / 1000, t: t / 1000, kg: bdKg(2 * t * (h + b - 2 * t)), name: `${h}×${b}×${bdNum(t)} KKR/RHS` }; }
  if (ser === "Rundrör") { const r = BD_CHS.find(x => x.join("x") === String(size)) || BD_CHS[5], [D, t] = r; return { kind: "C", D: D / 1000, t: t / 1000, h: D / 1000, b: D / 1000, kg: bdKg(Math.PI * t * (D - t)), name: `Ø${bdNum(D)}×${bdNum(t)}` }; }
  const r = BD_L.find(x => x.join("x") === String(size)) || BD_L[3], [a, t] = r; return { kind: "L", h: a / 1000, b: a / 1000, t: t / 1000, kg: bdKg(t * (2 * a - t)), name: `L ${a}×${a}×${t}` };
}
/* En profil i längd L med centrum i (cx, cy), underkant z0. */
function bdBeam(c, S, L, cx, cy, z0, col) {
  const o = { metal: 0.7, rough: 0.5, shin: 70 };
  if (S.kind === "I") { c.box(col, cx, cy, z0 + S.h / 2, L, S.tw, S.h - 2 * S.tf + 0.002, null, 0, o); c.box(col, cx, cy, z0 + S.tf / 2, L, S.b, S.tf, null, 0.002, o); c.box(col, cx, cy, z0 + S.h - S.tf / 2, L, S.b, S.tf, null, 0.002, o); }
  else if (S.kind === "U") { c.box(col, cx, cy - S.b / 2 + S.tw / 2, z0 + S.h / 2, L, S.tw, S.h, null, 0, o); c.box(col, cx, cy, z0 + S.tf / 2, L, S.b, S.tf, null, 0.002, o); c.box(col, cx, cy, z0 + S.h - S.tf / 2, L, S.b, S.tf, null, 0.002, o); }
  else if (S.kind === "R") { c.box(col, cx, cy, z0 + S.h - S.t / 2, L, S.b, S.t, null, 0.002, o); c.box(col, cx, cy, z0 + S.t / 2, L, S.b, S.t, null, 0.002, o); [-1, 1].forEach(sd => c.box(col, cx, cy + sd * (S.b / 2 - S.t / 2), z0 + S.h / 2, L, S.t, S.h - 2 * S.t + 0.002, null, 0, o)); }
  else if (S.kind === "C") { c.cyl(col, "x", cx, cy, z0 + S.D / 2, S.D / 2, S.D / 2, L, 14, null, o); [-1, 1].forEach(sd => c.cyl(BD_DARK, "x", cx + sd * (L / 2 + 0.001), cy, z0 + S.D / 2, S.D / 2 - S.t, S.D / 2 - S.t, 0.004, 12)); }
  else { c.box(col, cx, cy - S.b / 2 + S.t / 2, z0 + S.h / 2, L, S.t, S.h, null, 0, o); c.box(col, cx, cy, z0 + S.t / 2, L, S.b, S.t, null, 0, o); }
}
/* Stapel av n lika delar (b bred, h hög) – nx i bredd; mellan lagren ligger distanslister, och underst två underlagsbalkar. Returnerar { nx, ny, W, Hs }. */
function bdStack(c, n, nx, b, h, L, draw, opt = {}) {
  nx = Math.max(1, Math.min(n, nx)); const ny = Math.ceil(n / nx), gap = opt.gap == null ? 0.01 : opt.gap, st = opt.stick == null ? 0.05 : opt.stick, W = nx * b + (nx - 1) * gap, base = 0.1;
  c.box("#a98558", -L * 0.38, 0, base / 2, 0.1, W + 0.2, base, null, 0.005, { rough: 1 }); c.box("#a98558", L * 0.38, 0, base / 2, 0.1, W + 0.2, base, null, 0.005, { rough: 1 });
  let i = 0; for (let r = 0; r < ny; r++) { const z0 = base + r * (h + st); if (r) [-0.38, 0, 0.38].forEach(k => c.box("#c49a66", L * k, 0, z0 - st / 2, 0.05, W, st, null, 0.003, { rough: 1 }));
    for (let k = 0; k < nx && i < n; k++, i++) draw(-W / 2 + b / 2 + k * (b + gap), z0, i); }
  return { nx, ny, W, Hs: base + ny * (h + st) };
}
const bdCard = (c, p, title, rows, H, W) => c.card({ title, icon: "box", color: "#475569", rows, b0: -(W / 2 + 0.7), zb: H + 0.6 });

/* ---- Stålprofiler ---- */
function bdSteelBuild(p, c) {
  const ser = smF(p, "serie", "HEA"), size = smF(p, "dim", "200"), S = bdSection(ser, size), L = smN(p, "langd", 6), n = Math.max(1, Math.round(smN(p, "antal", 1))), nx = Math.max(1, Math.round(smN(p, "bredd", 4)));
  const yta = smF(p, "yta", "Valsad"), col = p.color || ({ Valsad: BD_STEEL, Grundmålad: "#9a4a3c", Varmförzinkad: "#c3cbd3", Svartmålad: "#2a2f35" }[yta] || BD_STEEL);
  const wy = S.kind === "C" ? S.D : S.b, hz = S.kind === "C" ? S.D : S.h, r = bdStack(c, n, nx, wy, hz, L, (y, z0) => bdBeam(c, S, L, 0, y, z0, col), { gap: 0.02 });
  const tot = S.kg * L * n;
  bdCard(c, p, `${S.name} · ${smFmt(L, 1)} m${n > 1 ? " × " + n : ""}`, [["Profil", S.name + " (" + ser + ")"], ["Vikt", `${smFmt(S.kg, 1)} kg/m`], ["Längd × antal", `${smFmt(L, 1)} m × ${n}`], ["Total vikt", tot >= 1000 ? smFmt(tot / 1000, 2) + " ton" : Math.round(tot) + " kg"], ["Yta", yta]], r.Hs, r.W);
}
const bdSteelCalc = p => { const ser = smF(p, "serie", "HEA"), S = bdSection(ser, smF(p, "dim", "200")), L = smN(p, "langd", 6), n = Math.max(1, Math.round(smN(p, "antal", 1))); return [["Profil", S.name], ["Vikt per meter", smFmt(S.kg, 1) + " kg/m"], ["Vikt per längd", smFmt(S.kg * L, 0) + " kg"], ["Total vikt", smFmt(S.kg * L * n / 1000, 2) + " ton"], ["Mått", `${Math.round(S.h * 1000)} × ${Math.round(S.b * 1000)} mm`]]; };

/* ---- Håldäck ---- */
const BD_HD = { 120: 2.1, 150: 2.5, 200: 3.0, 265: 3.9, 320: 4.5, 400: 5.1, 500: 6.0 };   // kN/m² (ca) – egenvikt
const BD_HD_W = [["0.6", "600 mm (halvt)"], ["1.2", "1 200 mm (standard)"], ["2.4", "2 400 mm (dubbelt)"]];
function bdHdBuild(p, c) {
  const T = Number(smF(p, "tjock", "265")) / 1000, W = Number(smF(p, "bredd", "1.2")), L = smN(p, "langd", 8), n = Math.max(1, Math.round(smN(p, "antal", 1))), col = p.color || BD_CONC;
  const nC = Math.max(2, Math.round(W / (T > 0.3 ? 0.27 : 0.2))), cw = W / nC * 0.62, ch = T * 0.55;
  const r = bdStack(c, n, 1, W, T, L, (y, z0) => { c.box(col, 0, y, z0 + T / 2, L, W, T, null, 0.008, { rough: 1 });
    for (let k = 0; k < nC; k++) [-1, 1].forEach(sd => c.box("#5b5f66", sd * (L / 2 + 0.002), y - W / 2 + W / nC * (k + 0.5), z0 + T / 2, 0.006, cw, ch, null, 0.002, { rough: 1 }));       // hålen i ändarna
    [-1, 1].forEach(sd => c.box("#9a9da1", 0, y + sd * (W / 2 - 0.004), z0 + T * 0.4, L - 0.02, 0.012, T * 0.35, null, 0, { rough: 1 })); }, { stick: 0.1, gap: 0 });
  const kg = (BD_HD[Math.round(T * 1000)] || 3.9) * 101.97, tot = kg * W * L * n;
  bdCard(c, p, `Håldäck HD/F ${Math.round(T * 1000)} · ${smFmt(L, 1)} m${n > 1 ? " × " + n : ""}`, [["Tjocklek × bredd", `${Math.round(T * 1000)} × ${Math.round(W * 1000)} mm`], ["Längd × antal", `${smFmt(L, 1)} m × ${n}`], ["Yta", smFmt(W * L * n, 1) + " m²"], ["Vikt ca", smFmt(tot / 1000, 1) + " ton"]], r.Hs, W);
}
const bdHdCalc = p => { const T = Number(smF(p, "tjock", "265")), W = Number(smF(p, "bredd", "1.2")), L = smN(p, "langd", 8), n = Math.max(1, Math.round(smN(p, "antal", 1))), kg = (BD_HD[T] || 3.9) * 101.97; return [["Yta per element", smFmt(W * L, 2) + " m²"], ["Vikt per element", "ca " + smFmt(kg * W * L / 1000, 2) + " ton"], ["Antal", String(n)], ["Total yta", smFmt(W * L * n, 1) + " m²"], ["Total vikt", "ca " + smFmt(kg * W * L * n / 1000, 1) + " ton"]]; };

/* ---- Betongelement ---- */
const BD_BE = ["Pelare", "Balk (rektangulär)", "L-balk", "T-balk", "Massiv vägg", "Sandwichvägg", "Plattbärlag", "Trappa (prefab)"];
function bdConcBuild(p, c) {
  const typ = smF(p, "typ", BD_BE[0]), L = smN(p, "langd", 4), B = smN(p, "bredd", 0.4), H = smN(p, "hojd", 0.4), n = Math.max(1, Math.round(smN(p, "antal", 1))), col = p.color || BD_CONC, o = { rough: 1 };
  let vol = 0, Hs = H, W = B;
  const one = (y, z0) => {
    if (typ === "Pelare") { c.box(col, 0, y, z0 + H / 2, L, B, H, null, 0.01, o); if (smF(p, "konsol", "Ja") === "Ja") [-1, 1].forEach(sd => c.box(col, -L / 2 + L * 0.18, y + sd * (B / 2 + 0.1), z0 + H / 2, 0.25, 0.2, H * 0.6, null, 0.01, o)); vol = L * B * H; }
    else if (typ === "Balk (rektangulär)") { c.box(col, 0, y, z0 + H / 2, L, B, H, null, 0.01, o); vol = L * B * H; }
    else if (typ === "L-balk") { c.box(col, 0, y, z0 + H / 2, L, B, H, null, 0.01, o); c.box(col, 0, y + B / 2 + 0.1, z0 + H * 0.2, L, 0.2, H * 0.4, null, 0.01, o); vol = L * (B * H + 0.2 * H * 0.4); }
    else if (typ === "T-balk") { c.box(col, 0, y, z0 + H / 2, L, B, H, null, 0.01, o); [-1, 1].forEach(sd => c.box(col, 0, y + sd * (B / 2 + 0.1), z0 + H * 0.2, L, 0.2, H * 0.4, null, 0.01, o)); vol = L * (B * H + 2 * 0.2 * H * 0.4); }
    else if (typ === "Massiv vägg") { c.box(col, 0, y, z0 + H / 2, L, B, H, null, 0.01, o); [-0.4, 0.4].forEach(k => c.box("#7a7e84", L * k, y, z0 + H - 0.1, 0.12, B * 0.9, 0.06, null, 0, { metal: 0.6 })); vol = L * B * H; }
    else if (typ === "Sandwichvägg") { const t1 = B * 0.25, t2 = B * 0.5; c.box(col, 0, y - B / 2 + t1 / 2, z0 + H / 2, L, t1, H, null, 0.01, o); c.box("#e6d58a", 0, y, z0 + H / 2, L - 0.02, t2, H - 0.02, null, 0, { rough: 1 }); c.box("#a9aaad", 0, y + B / 2 - t1 / 2, z0 + H / 2, L, t1, H, null, 0.01, o); vol = L * H * B * 0.5; }
    else if (typ === "Plattbärlag") { const t = 0.07; c.box(col, 0, y, z0 + t / 2, L, B, t, null, 0.004, o); [-0.3, 0, 0.3].forEach(k => { c.box("#6b7280", 0, y + B * k, z0 + t + 0.06, L - 0.1, 0.012, 0.12, null, 0, { metal: 0.7 }); c.box("#6b7280", 0, y + B * k, z0 + t + 0.005, L - 0.1, 0.1, 0.01, null, 0, { metal: 0.7 }); }); vol = L * B * t; Hs = 0.2; }
    else { const nSt = Math.max(3, Math.round(H / 0.18)), rise = H / nSt, run = L / nSt; for (let k = 0; k < nSt; k++) c.box(col, -L / 2 + run * (k + 0.5), y, z0 + rise * (k + 1) / 2, run, B, rise * (k + 1), null, 0.006, o); vol = L * B * H * 0.45; }
  };
  const th = typ === "Plattbärlag" ? 0.2 : typ === "Sandwichvägg" || typ === "Massiv vägg" ? H : H, wy = B + (typ === "T-balk" ? 0.4 : typ === "L-balk" ? 0.2 : 0);
  const r = bdStack(c, n, typ === "Massiv vägg" || typ === "Sandwichvägg" ? n : Math.max(1, Math.round(smN(p, "bredd_n", 1))), wy, th, L, (y, z0) => one(y, z0), { stick: 0.1, gap: typ === "Massiv vägg" || typ === "Sandwichvägg" ? 0.05 : 0.02 });
  if (typ === "Sandwichvägg" || typ === "Massiv vägg") { /* väggar står på högkant i bunt */ }
  const dens = typ === "Sandwichvägg" ? 2400 : 2400;
  bdCard(c, p, `${typ} · ${smFmt(L, 1)} m${n > 1 ? " × " + n : ""}`, [["Typ", typ], ["Mått", `${smFmt(L, 2)} × ${smFmt(B, 2)} × ${smFmt(H, 2)} m`], ["Antal", String(n)], ["Vikt ca", smFmt(vol * dens * n / 1000, 1) + " ton"]], r.Hs + (typ === "Pelare" ? 0 : 0), r.W);
  p._ptVol = vol;
}

/* ---- Virkespaket ---- */
const BD_TIM = ["45x70", "45x95", "45x120", "45x145", "45x170", "45x195", "45x220", "70x70", "95x95", "45x45", "22x95", "22x145", "28x120", "50x100", "50x150", "50x200", "100x100", "145x145"];
function bdTimberBuild(p, c) {
  const [a, b] = smF(p, "dim", "45x95").split("x").map(Number), L = smN(p, "langd", 4.8), nx = Math.max(1, Math.round(smN(p, "bredd", 6))), ny = Math.max(1, Math.round(smN(p, "hojd", 8))), n = nx * ny, col = p.color || BD_WOOD;
  const bw = Math.max(a, b) / 1000, bh = Math.min(a, b) / 1000, W = nx * bw, Hh = ny * bh;
  for (let r = 0; r < ny; r++) for (let k = 0; k < nx; k++) c.box(r % 2 ? "#d9b27a" : col, 0, -W / 2 + bw / 2 + k * bw, 0.12 + bh / 2 + r * bh, L, bw - 0.002, bh - 0.002, null, 0.002, { rough: 1 });
  [-0.38, 0.38].forEach(k => { c.box("#a98558", L * k, 0, 0.06, 0.1, W + 0.1, 0.12, null, 0.005, { rough: 1 }); c.box("#2563eb", L * k, 0, 0.12 + Hh / 2, 0.02, W + 0.02, Hh + 0.02, null, 0.002, { rough: 0.6 }); });   // underlag + blå remmar
  bdCard(c, p, `Virke ${a}×${b} · ${smFmt(L, 1)} m`, [["Dimension", `${a}×${b} mm`], ["Längd × antal", `${smFmt(L, 1)} m × ${n}`], ["Löpmeter", smFmt(L * n, 0) + " m"], ["Volym", smFmt(a * b / 1e6 * L * n, 2) + " m³"]], Hh + 0.12, W);
}
/* ---- Armering: stångbunt och nätpall ---- */
function bdRebarBuild(p, c) {
  const typ = smF(p, "typ", "Stångbunt"), L = smN(p, "langd", 12), d = Number(smF(p, "dia", "16")) / 1000, n = Math.max(1, Math.round(smN(p, "antal", 40))), col = "#7b4d3b";
  if (typ === "Stångbunt") {
    const rows = []; let left = n, row = 0; while (left > 0) { const k = Math.min(left, Math.max(1, Math.round(Math.sqrt(n) * 1.15) - (row % 2))); rows.push(k); left -= k; row++; }
    const W = Math.max(...rows) * d; rows.forEach((k, r) => { for (let i = 0; i < k; i++) c.cyl(col, "x", 0, -(k - 1) * d / 2 + i * d, 0.12 + d / 2 + r * d * 0.87, d / 2, d / 2, L, 6, null, { metal: 0.3, rough: 0.8 }); });
    [-0.4, 0, 0.4].forEach(kk => { c.box("#a98558", L * kk, 0, 0.06, 0.08, W + 0.1, 0.12, null, 0.005, { rough: 1 }); if (kk) c.box("#374151", L * kk, 0, 0.12 + rows.length * d * 0.45, 0.012, W + 0.01, rows.length * d * 0.9 + 0.01, null, 0, SMM); });
    const kg = Math.PI * d * d / 4 * 7850 * L * n;
    bdCard(c, p, `Armering Ø${d * 1000} · ${smFmt(L, 1)} m`, [["Stänger", `Ø${d * 1000} mm × ${n}`], ["Längd", smFmt(L, 1) + " m"], ["Vikt", smFmt(kg, 0) + " kg"]], rows.length * d + 0.12, W);
  } else {
    const sh = typ === "Nätpall (6 × 2,4 m)" ? [6, 2.4] : [5, 2.2], t = 0.006, st = smN(p, "antal", 40), H = st * t * 1.0;
    c.box("#a98558", 0, 0, 0.07, sh[0] * 0.9, 0.1, 0.14, null, 0, { rough: 1 }); [-0.4, 0, 0.4].forEach(k => c.box("#a98558", sh[0] * k, 0, 0.07, 0.1, sh[1] * 0.9, 0.14, null, 0, { rough: 1 }));
    c.box("#aab0b8", 0, 0, 0.14 + H / 2, sh[0], sh[1], H, null, 0.003, SMM); for (let i = 1; i < 12; i++) { c.box("#6b7280", -sh[0] / 2 + sh[0] * i / 12, 0, 0.14 + H + 0.003, 0.012, sh[1], 0.006, null, 0, SMM); } for (let i = 1; i < 6; i++) c.box("#6b7280", 0, -sh[1] / 2 + sh[1] * i / 6, 0.14 + H + 0.003, sh[0], 0.012, 0.006, null, 0, SMM);
    bdCard(c, p, "Armeringsnät", [["Nät", `${sh[0]} × ${sh[1]} m × ${st} st`], ["Yta", smFmt(sh[0] * sh[1] * st, 0) + " m²"], ["Vikt ca", smFmt(sh[0] * sh[1] * st * 3.0, 0) + " kg"]], H + 0.14, sh[1]);
  }
}
/* ---- Rörbunt ---- */
const BD_PIPE_MAT = { "PVC/PP (markrör)": "#b45f2a", Betong: "#a8a9ab", Stål: "#6d7783", PEH: "#1f2933", "Gjutjärn": "#3a3d42" };
function bdPipeBuild(p, c) {
  const D = Number(smF(p, "dia", "315")) / 1000, L = smN(p, "langd", 6), n = Math.max(1, Math.round(smN(p, "antal", 12))), mat = smF(p, "mat", "PVC/PP (markrör)"), col = p.color || BD_PIPE_MAT[mat] || "#b45f2a", t = Math.max(0.005, D * 0.045);
  const rows = []; let left = n, r = 0; const base = Math.max(1, Math.min(8, Math.round(Math.sqrt(n * 1.5)))); while (left > 0) { const k = Math.min(left, Math.max(1, base - r)); rows.push(k); left -= k; r++; }
  rows.forEach((k, ri) => { for (let i = 0; i < k; i++) { const y = -(k - 1) * D / 2 + i * D, z = 0.12 + D / 2 + ri * D * 0.87; c.cyl(col, "x", 0, y, z, D / 2, D / 2, L, 16, null, { rough: 0.6, shin: 50 }); [-1, 1].forEach(sd => c.cyl("#262a30", "x", sd * (L / 2 + 0.002), y, z, D / 2 - t, D / 2 - t, 0.004, 14)); } });
  const W = Math.max(...rows) * D; [-0.38, 0.38].forEach(k => c.box("#a98558", L * k, 0, 0.06, 0.1, W + 0.1, 0.12, null, 0.005, { rough: 1 }));
  bdCard(c, p, `Rör Ø${Math.round(D * 1000)} · ${n} st`, [["Material", mat], ["Mått", `Ø${Math.round(D * 1000)} × ${smFmt(L, 1)} m`], ["Antal", String(n)], ["Löpmeter", smFmt(L * n, 0) + " m"]], rows.length * D * 0.87 + D + 0.12, W);
}
/* ---- Material på pall ---- */
const BD_PALL = { "Gips (13 mm)": [1.2, 2.4, 0.9, "#e5e7eb"], "Isolering (mineralull)": [0.6, 1.2, 1.4, "#e9d77a"], "Lättbetongblock": [0.6, 1.0, 1.2, "#d7d9dc"], "Betongblock": [0.6, 1.0, 1.0, "#9a9da2"], "Tegel": [0.9, 1.1, 1.1, "#a3412d"], "Cementsäckar": [1.1, 1.1, 1.0, "#cbd0d6"], "Plywood": [1.25, 2.5, 0.9, "#d6b27c"], "Kakel/klinker": [0.8, 1.2, 0.9, "#c9ccd1"], "Eps/frigolit": [0.6, 1.2, 1.3, "#f4f4f4"] };
function bdPallBuild(p, c) {
  const typ = smF(p, "typ", "Gips (13 mm)"), d = BD_PALL[typ] || BD_PALL["Gips (13 mm)"], H = smN(p, "hojd", d[2]), n = Math.max(1, Math.round(smN(p, "antal", 1))), col = p.color || d[3], wrap = smF(p, "plast", "Ja") === "Ja";
  const L = Math.max(d[0], d[1]), W = Math.min(d[0], d[1]);
  for (let i = 0; i < n; i++) { const y = (i - (n - 1) / 2) * (W + 0.1);
    c.box("#b88a52", 0, y, 0.07, L, W, 0.14, null, 0.005, { rough: 1 }); [-0.4, 0, 0.4].forEach(k => c.box("#9a7140", L * k, y, 0.07, 0.1, W, 0.16, null, 0, { rough: 1 }));
    c.box(col, 0, y, 0.14 + H / 2, L - 0.04, W - 0.04, H, null, 0.006, { rough: 0.9 });
    if (wrap) c.box("#ffffff", 0, y, 0.14 + H / 2, L, W, H + 0.01, null, 0.004, { transp: 0.7, rough: 0.2, shin: 90 });
    [0.2, 0.6, 0.8].forEach(k => c.box("#374151", 0, y, 0.14 + H * k, L + 0.01, W + 0.01, 0.02, null, 0, SMM)); }
  bdCard(c, p, typ, [["Material", typ], ["Pall", `${smFmt(L, 2)} × ${smFmt(W, 2)} × ${smFmt(H + 0.14, 2)} m`], ["Antal pallar", String(n)]], H + 0.14, W * n);
}

Object.assign(SM, {
  stalprofil: { group: "Byggdelar", label: "Stålprofil / balk", color: "#8d97a3", L: 6, B: 0.3, H: 0.3, icon: "box", calc: bdSteelCalc, build: bdSteelBuild,
    fields: [["serie", "Serie", BD_SER, "HEA"], ["dim", "Dimension", p => { const ser = smF(p, "serie", "HEA"), L = bdSizes(ser); if (!L.some(x => x[0] === String(smF(p, "dim", "")))) { p.f = p.f || {}; p.f.dim = (L[Math.min(L.length - 1, 6)] || L[0])[0]; } return L; }, "200"],
      ["langd", "Längd", "range", 6, { min: 0.5, max: 18, step: 0.5, unit: "m" }], ["antal", "Antal", "range", 1, { min: 1, max: 120, step: 1, unit: "st" }], ["bredd", "Bredd i stapeln", "range", 4, { min: 1, max: 12, step: 1, unit: "st" }],
      ["yta", "Ytbehandling", ["Valsad", "Grundmålad", "Varmförzinkad", "Svartmålad"], "Valsad"], ["_calc", "Data", "calc"]],
    groups: [["Profil", ["serie", "dim", "langd"]], ["Stapel", ["antal", "bredd", "yta"], "fold"], ["Data", ["_calc"]]] },
  haldack: { group: "Byggdelar", label: "Håldäck", color: "#b8bbbe", L: 8, B: 1.2, H: 0.265, icon: "box", calc: bdHdCalc, build: bdHdBuild,
    fields: [["tjock", "Tjocklek", [["120", "120 mm"], ["150", "150 mm"], ["200", "200 mm"], ["265", "265 mm"], ["320", "320 mm"], ["400", "400 mm"], ["500", "500 mm"]], "265"], ["bredd", "Bredd", BD_HD_W, "1.2"], ["langd", "Längd", "range", 8, { min: 2, max: 18, step: 0.1, unit: "m" }], ["antal", "Antal i stapel", "range", 1, { min: 1, max: 40, step: 1, unit: "st" }], ["_calc", "Data", "calc"]],
    groups: [["Håldäck", ["tjock", "bredd", "langd", "antal"]], ["Data", ["_calc"]]] },
  betongelement: { group: "Byggdelar", label: "Betongelement", color: "#b8bbbe", L: 4, B: 0.4, H: 0.4, icon: "box", build: bdConcBuild,
    fields: [["typ", "Typ", BD_BE, BD_BE[0]], ["langd", "Längd", "range", 4, { min: 0.5, max: 16, step: 0.1, unit: "m" }], ["bredd", "Bredd/tjocklek", "range", 0.4, { min: 0.1, max: 1.5, step: 0.05, unit: "m" }], ["hojd", "Höjd", "range", 0.4, { min: 0.1, max: 4, step: 0.05, unit: "m" }], ["antal", "Antal i stapel", "range", 1, { min: 1, max: 30, step: 1, unit: "st" }], ["konsol", "Konsoler (pelare)", ["Ja", "Nej"], "Ja", { seg: true }]],
    groups: [["Element", ["typ", "langd", "bredd", "hojd"]], ["Stapel", ["antal", "konsol"], "fold"]] },
  virke: { group: "Byggdelar", label: "Virkespaket", color: "#d3a972", L: 4.8, B: 0.6, H: 0.5, icon: "box", build: bdTimberBuild,
    fields: [["dim", "Dimension", BD_TIM.map(t => [t, t.replace("x", "×") + " mm"]), "45x95"], ["langd", "Längd", [["2.4", "2,4 m"], ["3", "3,0 m"], ["3.6", "3,6 m"], ["4.2", "4,2 m"], ["4.8", "4,8 m"], ["5.4", "5,4 m"], ["6", "6,0 m"]], "4.8"], ["bredd", "Antal i bredd", "range", 6, { min: 1, max: 20, step: 1, unit: "st" }], ["hojd", "Antal i höjd", "range", 8, { min: 1, max: 20, step: 1, unit: "lager" }]],
    groups: [["Virke", ["dim", "langd", "bredd", "hojd"]]] },
  armering: { group: "Byggdelar", label: "Armering", color: "#7b4d3b", L: 12, B: 0.5, H: 0.4, icon: "box", build: bdRebarBuild,
    fields: [["typ", "Typ", ["Stångbunt", "Nätpall (6 × 2,4 m)", "Nätpall (5 × 2,2 m)"], "Stångbunt"], ["dia", "Diameter", [["8", "Ø8"], ["10", "Ø10"], ["12", "Ø12"], ["16", "Ø16"], ["20", "Ø20"], ["25", "Ø25"], ["32", "Ø32"]], "16"], ["langd", "Längd", "range", 12, { min: 3, max: 14, step: 0.5, unit: "m" }], ["antal", "Antal stänger / nät", "range", 40, { min: 1, max: 200, step: 1, unit: "st" }]],
    groups: [["Armering", ["typ", "dia", "langd", "antal"]]] },
  rorbunt: { group: "Byggdelar", label: "Rör (bunt)", color: "#b45f2a", L: 6, B: 1.5, H: 1, icon: "box", build: bdPipeBuild,
    fields: [["mat", "Material", Object.keys(BD_PIPE_MAT), "PVC/PP (markrör)"], ["dia", "Diameter", [["110", "Ø110"], ["160", "Ø160"], ["200", "Ø200"], ["250", "Ø250"], ["315", "Ø315"], ["400", "Ø400"], ["500", "Ø500"], ["630", "Ø630"], ["800", "Ø800"], ["1000", "Ø1000"]], "315"], ["langd", "Längd", "range", 6, { min: 1, max: 12, step: 0.5, unit: "m" }], ["antal", "Antal rör", "range", 12, { min: 1, max: 80, step: 1, unit: "st" }]],
    groups: [["Rör", ["mat", "dia", "langd", "antal"]]] },
  pall: { group: "Byggdelar", label: "Material på pall", color: "#e5e7eb", L: 2.4, B: 1.2, H: 1.1, icon: "box", build: bdPallBuild,
    fields: [["typ", "Material", Object.keys(BD_PALL), "Gips (13 mm)"], ["hojd", "Höjd", "range", 0.9, { min: 0.2, max: 2.4, step: 0.05, unit: "m" }], ["antal", "Antal pallar", "range", 1, { min: 1, max: 12, step: 1, unit: "st" }], ["plast", "Plastad", ["Ja", "Nej"], "Ja", { seg: true }]],
    groups: [["Pall", ["typ", "hojd", "antal", "plast"]]] },
});
