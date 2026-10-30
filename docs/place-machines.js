/* Maskiner (Victor 2026-10-24: "alla maskiner du kan tänka dig … riktigt bra grafik och inställningar"): smarta objekt i mappen Maskiner.
   Alla ritas med få, rena delar (lådor, cylindrar, balkar mellan leder, profiler) så att modellerna förblir små, och inställningarna styr det som är
   intressant på en arbetsplats: storlek/modell, bom- och skopvinkel, flak, redskap, utfällning av stödben, lampor, räckviddsring och färg.
   x = framåt, y = vänster, z = upp. Laddas efter place-smart-objs.js (SM, smWheel, SMM, SMG, SMLIT, smF, smN, smFmt). */
const MC_DK = "#1f2329", MC_STEEL = "#aab3bd", MC_CHR = "#d6dbe1", MC_AMB = "#f59e0b";
/* Konvex profil [a, b] som sträcks längs x (axis "x": profilen är [y, z]) eller y (axis "y": profilen är [x, z]). rot = [rx, ry, rz]. */
function mcExtrude(c, color, prof, v0, v1, axis, o, rot, at) {
  const n = prof.length, mk = (q, t) => axis === "y" ? [q[0], t, q[1]] : [t, q[0], q[1]], pts = [...prof.map(q => mk(q, v0)), ...prof.map(q => mk(q, v1))], faces = [];
  for (let i = 1; i < n - 1; i++) { faces.push([1, i + 1, i + 2]); faces.push([n + 1, n + i + 2, n + i + 1]); }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; faces.push([i + 1, j + 1, n + j + 1], [i + 1, n + j + 1, n + i + 1]); }
  const g = { pts, faces }; if (TK.volume(g) < 0) g.faces = g.faces.map(f => [f[0], f[2], f[1]]); return TK.add(c.T(color, o), g, at ? at[0] : 0, at ? at[1] : 0, at ? at[2] : 0, rot);
}
/* Riktig skopa (Victor 2026-10-30: "skopan går det inte lasta något i"): två sidoplåtar, bakstycke, bottenplåt med skärkant och tänder, öppen överdel – och valfri last som ligger i skopan.
   q(u, v) → [x, z] i maskinens lodplan (u framåt, v upp), T(x, y, z) → världen (knäleden/rotationen), sc = storlek, bw = bredd, rot = rotationen för sidoplåtarna. */
const MC_LOADCOL = { Grus: "#a8a29e", Jord: "#6b4f35", Sprängsten: "#7c7f84", Sand: "#d6b980" };
function mcScoop(c, q, bw, sc, rot, T, load, col) {
  col = col || "#4b5563"; const P = [[0.05, 0.55], [0, -0.35], [0.25, -0.62], [0.85, -0.72], [1.35, -0.6], [0.9, 0.05], [0.4, 0.45]], t = 0.07 * sc, MET = { metal: 0.5, rough: 0.55 }, Q = (u, v) => q(u * sc, v * sc), W3 = (u, y, v) => { const r = Q(u, v); return T(r[0], y, r[1]); };
  [-1, 1].forEach(sd => mcExtrude(c, col, P.map(([u, v]) => Q(u, v)), sd > 0 ? bw / 2 - t : -bw / 2, sd > 0 ? bw / 2 : -bw / 2 + t, "y", MET, rot));                                  // sidoplåtar
  const FP = [[0, -0.35], [0.25, -0.62], [0.85, -0.72], [1.35, -0.6]];
  for (let i = 0; i + 1 < FP.length; i++) c.beam(col, W3(FP[i][0], 0, FP[i][1]), W3(FP[i + 1][0], 0, FP[i + 1][1]), bw - 2 * t, 0.05 * sc, MET);                                       // botten
  c.beam(col, W3(0.05, 0, 0.55), W3(0, 0, -0.35), bw - 2 * t, 0.05 * sc, MET);                                                                                                   // bakstycke
  c.beam("#6b7280", W3(0.05, -bw / 2, 0.55), W3(0.05, bw / 2, 0.55), 0.1 * sc, 0.1 * sc, MET);                                                                                  // bakre kantbalk
  c.beam("#9ca3af", W3(1.35, -bw / 2, -0.6), W3(1.35, bw / 2, -0.6), 0.1 * sc, 0.06 * sc, SMM);                                                                                 // skärkant
  const nt = Math.max(4, Math.round(bw / (0.28 * sc))); for (let i = 0; i < nt; i++) { const y = -bw / 2 + bw * (i + 0.5) / nt; c.beam("#cbd5e1", W3(1.33, y, -0.6), W3(1.52, y, -0.56), 0.1 * sc, 0.06 * sc, SMM); }   // tänder
  if (load && load !== "Tom") {
    const lc = MC_LOADCOL[load] || "#9ca3af", H = [[0.12, -0.3], [0.1, 0.5], [0.5, 0.66], [0.95, 0.4], [1.3, -0.45], [0.85, -0.66], [0.25, -0.56]], hw = bw / 2 - t - 0.01 * sc;
    mcExtrude(c, lc, H.map(([u, v]) => Q(u, v)), -hw, hw, "y", { rough: 1 }, rot);
    if (load === "Sprängsten") for (let i = 0; i < 9; i++) { const u = 0.3 + (i % 3) * 0.3, y = (((i * 37) % 7) - 3) / 3 * hw * 0.8, r = Q(u, 0.5 + ((i * 13) % 4) * 0.05); c.box("#6b7075", ...T(r[0], y, r[1]), 0.16 * sc, 0.2 * sc, 0.14 * sc, [(i * 0.7) % 1.2, (i * 0.4) % 1, 0.3], 0.03, { rough: 1 }); }
  }
}
/* Band (larvfot): kropp, drivhjul bak, tomgångshjul fram, bärrullar, kedjeskor och kedjeklackar. */
function mcTrack(c, x, y, L, W, H, shoe) {
  const r = H * 0.5; c.box(shoe || "#2a2e33", x, y, H / 2, L - H * 0.2, W, H * 0.92, null, 0.06, { rough: 0.85 });
  [-1, 1].forEach(sx => c.cyl("#20242a", "y", x + sx * (L / 2 - r), y, r, r, r, W, 18)); c.cyl("#3b4047", "y", x - L / 2 + r, y, r, r * 0.55, r * 0.55, W * 1.04, 12, null, SMM);
  for (let i = 0; i < 5; i++) c.cyl("#5b626b", "y", x - L / 2 + r * 2 + i * (L - 4 * r) / 4, y, H * 0.28, H * 0.17, H * 0.17, W * 1.04, 10, null, SMM);
  const m = Math.max(5, Math.round(L / 0.22)); for (let i = 0; i < m; i++) { const px = x - L / 2 + r + (L - 2 * r) * (i + 0.5) / m; c.box("#3a3f46", px, y, H + 0.005, (L - 2 * r) / m * 0.7, W * 0.98, 0.04, null, 0.006, { rough: 0.8 }); }
  c.box("#14171a", x, y + (y >= 0 ? 1 : -1) * W * 0.5, H * 0.9, L - H * 0.4, 0.03, H * 0.18, null, 0.01);
}
/* Förarhytt: kaross med lutande vindruta, sido- och bakrutor, taköverhäng, speglar, torkare och dörrlinjer. */
function mcCab(c, x, y, z, L, W, H, col, rot) {
  const R = rot || [0, 0, 0], yaw = R[0], cs = Math.cos(yaw), sn = Math.sin(yaw), P = (a, b, h) => [x + a * cs - b * sn, y + a * sn + b * cs, z + h], GL = { shin: 140, metal: 0.6, rough: 0.08 }, GC = "#14202c";
  mcExtrude(c, col, [[-L / 2, 0], [L / 2, 0], [L / 2, H * 0.36], [L / 2 - L * 0.12, H * 0.97], [-L / 2 + L * 0.04, H * 0.97], [-L / 2, H * 0.88]], -W / 2, W / 2, "y", { shin: 70 }, [yaw, 0, 0], [x, y, z]);
  c.beam(GC, P(L / 2 + 0.006, 0, H * 0.4), P(L / 2 - L * 0.115, 0, H * 0.95), W * 0.9, 0.03, GL);                                                                       // vindruta
  [-1, 1].forEach(sd => { c.box(GC, ...P(-L * 0.04, sd * (W / 2 + 0.006), H * 0.64), L * 0.78, 0.02, H * 0.48, R, 0.02, GL); c.box("#0b1118", ...P(L * 0.12, sd * (W / 2 + 0.012), H * 0.4), 0.012, 0.012, H * 0.7, R, 0);            // sidoruta + dörrlinje
    c.rod("#374151", P(L / 2 - 0.05, sd * (W / 2), H * 0.62), P(L / 2 + 0.14, sd * (W / 2 + 0.28), H * 0.74), 0.014, 0.014, 5, SMM); c.box("#111827", ...P(L / 2 + 0.14, sd * (W / 2 + 0.3), H * 0.74), 0.05, 0.03, 0.2, R, 0.01); });          // speglar
  c.box(GC, ...P(-L / 2 - 0.006, 0, H * 0.64), 0.02, W * 0.74, H * 0.44, R, 0.02, GL);
  c.box(col, ...P(L * 0.02, 0, H + 0.025), L * 1.03, W * 1.04, 0.07, R, 0.03, { shin: 70 });                                                                         // tak med överhäng
  c.rod("#111827", P(L / 2 - L * 0.04, -W * 0.3, H * 0.52), P(L / 2 - L * 0.1, W * 0.1, H * 0.88), 0.01, 0.01, 4, SMM);                                                // torkare
  c.box("#111827", ...P(L / 2 - L * 0.12, 0, H * 0.98), 0.05, W * 0.8, 0.05, R, 0.01); [-1, 1].forEach(sd => c.box("#fffbe6", ...P(L / 2 - L * 0.1, sd * W * 0.3, H * 1.02), 0.05, 0.14, 0.05, R, 0.01, SMLIT));   // takljus
}
/* Däck med grova lugg (terräng) eller räfflor (väg) och skärm över hjulet. */
function mcTire(c, x, y, r, w, rim, nofender) {
  smWheel(c, x, y, r, w, rim);
  const big = r >= 0.55, n = big ? Math.max(14, Math.round(r * 28)) : Math.max(10, Math.round(r * 30));
  for (let k = 0; k < n; k++) { const a = k * 2 * Math.PI / n; c.box("#0c0e10", x + Math.cos(a) * r * 1.0, y, r + Math.sin(a) * r * 1.0, r * (big ? 0.1 : 0.04), w * 1.0, r * (big ? 0.2 : 0.17), [0, -a, 0], 0.004, { rough: 0.95 }); }
  if (!nofender && r >= 0.5) { const s = y >= 0 ? 1 : -1, R2 = r * 1.16; for (let k = 0; k < 7; k++) { const a0 = (18 + k * 24) * Math.PI / 180, a1 = (18 + (k + 1) * 24) * Math.PI / 180; c.beam("#2c3138", [x + Math.cos(a0) * R2, y + s * 0.03, r + Math.sin(a0) * R2], [x + Math.cos(a1) * R2, y + s * 0.03, r + Math.sin(a1) * R2], w * 1.18, 0.035, { rough: 0.7 }); } }
}
/* Detaljer på lastbilens framdel och sidor: stötfångare, grill, trappsteg, stänkskydd, positionsljus. */
function mcTruckDetails(c, xa) {
  c.box("#2c3138", 4.5, 0, 0.62, 0.18, 2.45, 0.34, null, 0.05, { rough: 0.7 }); c.box("#e5e7eb", 4.46, 0, 0.64, 0.02, 1.6, 0.1, null, 0.01, SMLIT);
  for (let k = 0; k < 5; k++) c.box("#0f1215", 4.43, 0, 1.55 + k * 0.14, 0.03, 1.0, 0.07, null, 0.01, SMM);
  [-1, 1].forEach(sd => { c.box("#2c3138", 3.55, sd * 1.2, 0.62, 0.5, 0.18, 0.05, null, 0.01, SMM); c.box("#2c3138", 3.55, sd * 1.2, 0.98, 0.5, 0.18, 0.05, null, 0.01, SMM); for (let k = 0; k < 5; k++) c.box("#f59e0b", 3.1 + k * 0.28, sd * 0.55, 3.53, 0.08, 0.12, 0.05, null, 0.01, SMLIT); });
  xa.slice(1).forEach(x => [-1, 1].forEach(sd => c.box("#111827", x - 0.7, sd * 1.35, 0.32, 0.03, 0.55, 0.45, null, 0.01, { rough: 0.9 })));
}
const mcBeacon = (c, x, y, z) => { c.cyl("#374151", "z", x, y, z, 0.07, 0.07, 0.04, 10, null, SMM); c.cyl(MC_AMB, "z", x, y, z + 0.08, 0.06, 0.06, 0.1, 10, null, SMLIT); };
const mcLamp = (c, x, y, z, w) => c.box("#fffbe6", x, y, z, 0.04, w || 0.16, 0.07, null, 0.01, SMLIT);
function mcRodCyl(c, a, b, r) { const m = [a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55, a[2] + (b[2] - a[2]) * 0.55]; c.rod("#3b4552", a, m, r, r, 8, SMM); c.rod(MC_CHR, m, b, r * 0.62, r * 0.62, 8, SMM); }
const mcMachineCard = (c, p, title, rows, zb) => c.card({ title, icon: "truck", color: "#475569", rows, b0: -((Number(p.B) || 2.5) / 2 + 0.9), zb: zb || 4 });

/* ---- Grävmaskin: band eller hjul, 1,8–45 ton, bom/stick/redskap med riktiga ledvinklar ---- */
const MC_EXC_T = ["1.8", "3", "5", "8", "14", "20", "30", "45"], MC_EXC_TOOL = ["Skopa", "Planeringsskopa", "Hydraulhammare", "Sorteringsklo", "Pålhammare"];
function mcExcDims(p) { const t = Number(smF(p, "ton", "14")) || 14, s = Math.cbrt(t / 14); return { t, s, reach: 9.9 * s, depth: 6.2 * s, foot: [5.8 * s, 2.5 * s, 3 * s] }; }
function mcExcBuild(p, c) {
  const { t, s } = mcExcDims(p), col = p.color || "#f59e0b", wheels = smF(p, "chassi", "Band") === "Hjul", blade = smF(p, "blad", wheels ? "Ja" : "Nej") === "Ja", tool = smF(p, "redskap", "Skopa"), lamps = smF(p, "lampor", "Ja") === "Ja";
  const sw = (smN(p, "sving", 0)) * Math.PI / 180, a = smN(p, "bom", 38) * Math.PI / 180, d = smN(p, "stick", 105) * Math.PI / 180, tc = smN(p, "skopa", 25) * Math.PI / 180, cs = Math.cos(sw), sn = Math.sin(sw);
  const u = (x, y, z) => [x * cs - y * sn, x * sn + y * cs, z], R = [sw, 0, 0], ub = (colr, x, y, z, sx, sy, sz, r, o) => c.box(colr, ...u(x, y, z), sx, sy, sz, R, r, o);
  const TW = 0.62 * s, TL = 3.35 * s, TH = 0.82 * s, ty = 0.97 * s, z0 = wheels ? 1.15 * s : TH + 0.18 * s;
  // underrede
  if (!wheels) { [-1, 1].forEach(sd => mcTrack(c, 0, sd * ty, TL, TW, TH)); c.box("#2c3138", 0, 0, TH * 0.55, TL * 0.82, ty * 2 - TW * 0.4, TH * 0.6, null, 0.05, { rough: 0.7 }); if (blade) { c.box(col, TL / 2 + 0.35 * s, 0, 0.45 * s, 0.22 * s, 2.6 * s, 0.7 * s, null, 0.05, { shin: 70 }); [-1, 1].forEach(sd => c.beam("#3b4552", [TL / 2 - 0.2 * s, sd * 0.9 * s, 0.4 * s], [TL / 2 + 0.3 * s, sd * 1.15 * s, 0.4 * s], 0.2 * s, 0.22 * s, SMM)); } }
  else { c.box("#2c3138", 0, 0, 0.7 * s, 3.9 * s, 1.15 * s, 0.4 * s, null, 0.05, { rough: 0.7 }); [-1, 1].forEach(sx => [-1, 1].forEach(sd => mcTire(c, sx * 1.4 * s, sd * 1.06 * s, 0.62 * s, 0.5 * s))); c.cyl("#3b4047", "y", 1.4 * s, 0, 0.62 * s, 0.1 * s, 0.1 * s, 2.1 * s, 8, null, SMM); c.cyl("#3b4047", "y", -1.4 * s, 0, 0.62 * s, 0.1 * s, 0.1 * s, 2.1 * s, 8, null, SMM);
    if (blade) { c.box(col, 2.45 * s, 0, 0.5 * s, 0.2 * s, 2.5 * s, 0.7 * s, null, 0.05, { shin: 70 }); [-1, 1].forEach(sd => c.beam("#3b4552", [1.6 * s, sd * 0.8 * s, 0.75 * s], [2.4 * s, sd * 1.1 * s, 0.6 * s], 0.2 * s, 0.2 * s, SMM)); }
    [-1, 1].forEach(sx => [-1, 1].forEach(sd => { c.rod("#3b4552", [sx * 1.4 * s, sd * 1.0 * s, 0.9 * s], [sx * 1.6 * s, sd * 1.6 * s, 0.35 * s], 0.06 * s, 0.06 * s, 8, SMM); c.box("#4b5563", sx * 1.6 * s, sd * 1.6 * s, 0.03, 0.34 * s, 0.34 * s, 0.06, null, 0.02, SMM); })); }
  // vridkrans och överbyggnad (vrids med "sving")
  c.cyl("#3b4047", "z", 0, 0, z0 - 0.2 * s, 0.78 * s, 0.78 * s, 0.22 * s, 28, null, SMM);
  ub("#2c3138", -0.1 * s, 0, z0 + 0.06 * s, 3.3 * s, 2.3 * s, 0.14 * s, 0.03, { rough: 0.75 });
  ub(col, -1.55 * s, 0, z0 + 0.62 * s, 1.0 * s, 2.35 * s, 1.0 * s, 0.14 * s, { shin: 70 }); ub("#111827", -2.06 * s, 0, z0 + 0.55 * s, 0.03, 1.4 * s, 0.35 * s, 0.01);          // motvikt + baklucka
  ub(col, -0.45 * s, -0.4 * s, z0 + 0.6 * s, 1.55 * s, 1.55 * s, 0.85 * s, 0.1 * s, { shin: 70 }); [0.2, 0.55, 0.9].forEach(k => ub("#111827", -0.45 * s - 0.6 * s + k * 1.3 * s * 0.7, -0.4 * s, z0 + 1.03 * s, 0.05, 1.3 * s, 0.01));      // motorhuv + gallerspår
  ub("#2c3138", 0.65 * s, -0.95 * s, z0 + 0.5 * s, 1.5 * s, 0.5 * s, 0.65 * s, 0.05, { rough: 0.8 }); ub(col, 0.65 * s, -1.2 * s, z0 + 0.5 * s, 1.0 * s, 0.03, 0.4 * s, 0.01, { shin: 70 });             // verktygslåda/hydraultank
  c.rod("#374151", u(-1.0 * s, -0.7 * s, z0 + 1.0 * s), u(-1.0 * s, -0.7 * s, z0 + 1.65 * s), 0.05 * s, 0.05 * s, 8, SMM);                                                                            // avgasrör
  { const cp = u(0.55 * s, 0.7 * s, z0 + 0.2 * s); mcCab(c, cp[0], cp[1], cp[2], 1.35 * s, 1.15 * s, 1.75 * s, col, R); if (lamps) { const lp = u(1.25 * s, 0.7 * s, z0 + 1.7 * s); mcLamp(c, lp[0], lp[1], lp[2], 0.3 * s); const bp = u(-0.1 * s, 0.7 * s, z0 + 1.95 * s); mcBeacon(c, bp[0], bp[1], bp[2]); } }
  for (let k = 0; k < 7; k++) ub(k % 2 ? "#111827" : "#f8fafc", -2.07 * s, (-0.9 + k * 0.3) * s, z0 + 0.2 * s, 0.02, 0.3 * s, 0.12 * s, 0.002);                           // varningsränder på motvikten
  [-0.9, 0.5, 1.7].forEach(x => c.rod("#e5e7eb", u(x * s, -1.12 * s, z0 + 0.2 * s), u(x * s, -1.12 * s, z0 + 0.95 * s), 0.02, 0.02, 6, SMM)); c.rod("#e5e7eb", u(-0.9 * s, -1.12 * s, z0 + 0.95 * s), u(1.7 * s, -1.12 * s, z0 + 0.95 * s), 0.02, 0.02, 6, SMM); c.rod("#e5e7eb", u(-0.9 * s, -1.12 * s, z0 + 0.6 * s), u(1.7 * s, -1.12 * s, z0 + 0.6 * s), 0.016, 0.016, 6, SMM);   // ledstång
  ub("#2c3138", 1.55 * s, -0.95 * s, z0 - 0.02 * s, 0.4 * s, 0.35 * s, 0.05 * s, 0.01); ub("#2c3138", 1.55 * s, -0.95 * s, z0 - 0.38 * s, 0.4 * s, 0.35 * s, 0.05 * s, 0.01);      // upptrappa
  // bom, stick och redskap i lodplanet x–z (vrids med sving)
  const P0 = [0.95 * s, z0 + 0.55 * s], Lb = 5.7 * s, Ls = 2.9 * s, dir = ang => [Math.cos(ang), Math.sin(ang)], nrm = ang => [-Math.sin(ang), Math.cos(ang)];
  const kink = 0.42 * s, mid = [P0[0] + dir(a)[0] * Lb * 0.5 + nrm(a)[0] * kink, P0[1] + dir(a)[1] * Lb * 0.5 + nrm(a)[1] * kink], P1 = [P0[0] + dir(a)[0] * Lb, P0[1] + dir(a)[1] * Lb];
  const phi = a - (Math.PI - d), P2 = [P1[0] + dir(phi)[0] * Ls, P1[1] + dir(phi)[1] * Ls], pt = q => u(q[0], 0, q[1]), P = q => pt(q);
  c.beam(col, P(P0), P(mid), 0.5 * s, 0.62 * s, { shin: 70 }); c.beam(col, P(mid), P(P1), 0.46 * s, 0.5 * s, { shin: 70 }); c.cyl("#3b4047", "y", ...u(P0[0], 0, P0[1]), 0.18 * s, 0.18 * s, 0.7 * s, 14, R, SMM);
  c.beam(col, P(P1), P(P2), 0.32 * s, 0.42 * s, { shin: 70 }); c.cyl("#3b4047", "y", ...u(P1[0], 0, P1[1]), 0.16 * s, 0.16 * s, 0.55 * s, 14, R, SMM);
  const up = (q, ang, k) => [q[0] + nrm(ang)[0] * k, q[1] + nrm(ang)[1] * k], on = (q, ang, k) => [q[0] + dir(ang)[0] * k, q[1] + dir(ang)[1] * k];
  [-1, 1].forEach(sd => { const yo = sd * 0.0; void yo; });
  mcRodCyl(c, P([P0[0] - 0.4 * s, P0[1] - 0.25 * s]), P(up(on(P0, a, Lb * 0.3), a, -0.34 * s)), 0.1 * s);                                                                                                  // bomcylinder
  mcRodCyl(c, P(up(on(P0, a, Lb * 0.7), a, 0.4 * s)), P(up(on(P1, phi, Ls * 0.18), phi, 0.33 * s)), 0.085 * s);                                                                                         // stickcylinder
  // redskap
  const psi = phi - 0.65 - tc, tp = (uu, vv) => [P2[0] + Math.cos(psi) * uu - Math.sin(psi) * vv, P2[1] + Math.sin(psi) * uu + Math.cos(psi) * vv];
  c.cyl("#3b4047", "y", ...u(P2[0], 0, P2[1]), 0.12 * s, 0.12 * s, 0.5 * s, 12, R, SMM);
  mcRodCyl(c, P(up(on(P1, phi, Ls * 0.42), phi, 0.3 * s)), P(tp(0.0, 0.0)), 0.07 * s);                                                                                                                      // skopcylinder (förenklad länk)
  const W = tool === "Planeringsskopa" ? 1.9 * s : tool === "Skopa" ? 0.95 * s : 0.5 * s, col2 = "#374151";
  if (tool === "Skopa" || tool === "Planeringsskopa") {
    mcScoop(c, tp, W, (tool === "Skopa" ? 0.85 : 0.6) * s, R, u, smF(p, "last", "Tom"), "#4b5563");
  } else if (tool === "Hydraulhammare" || tool === "Pålhammare") {
    const len = tool === "Pålhammare" ? 2.6 * s : 1.5 * s, A = tp(0.15 * s, 0), B = tp(0.15 * s + len, 0), C = tp(0.3 * s + len + 0.8 * s, 0);
    c.beam(col, P(A), P(B), 0.5 * s, 0.5 * s, { shin: 70 }); c.beam("#374151", P(B), P(C), 0.18 * s, 0.18 * s, SMM); c.beam("#9ca3af", P(B), P(tp(0.15 * s + len + 0.1 * s, 0)), 0.3 * s, 0.3 * s, SMM);
  } else {                                                                                                                                                                                                        // sorteringsklo: två tänder som öppnar/stänger
    const open = 0.9 - tc * 0.6; [-1, 1].forEach(sd => { const a2 = psi + sd * 0.25 * open + 0.2, q0 = [P2[0], P2[1]], q1 = [q0[0] + Math.cos(a2) * 1.7 * s, q0[1] + Math.sin(a2) * 1.7 * s];
      c.beam("#4b5563", u(q0[0], sd * 0.18 * s, q0[1]), u(q1[0], sd * 0.4 * s, q1[1]), 0.12 * s, 0.2 * s, SMM); c.beam("#4b5563", u(q0[0], sd * 0.18 * s, q0[1]), u(q0[0] + Math.cos(psi + 0.4) * 0.5 * s, sd * 0.18 * s, q0[1] + Math.sin(psi + 0.4) * 0.5 * s), 0.14 * s, 0.14 * s, SMM); }); c.box(col2, ...pt(tp(0.1 * s, 0)), 0.4 * s, 0.7 * s, 0.4 * s, R, 0.04, SMM);
  }
  if (smF(p, "ring", "Nej") === "Ja") c.reach(9.9 * s, "#f59e0b");
  mcMachineCard(c, p, `Grävmaskin ${t} t`, [["Räckvidd", smFmt(9.9 * s, 1) + " m"], ["Grävdjup", smFmt(6.2 * s, 1) + " m"], ["Redskap", tool], ["Chassi", wheels ? "Hjul" : "Band"]], 3.2 * s + 1.2 + (a > 0.8 ? 3 : 0));
}
const mcExcCalc = p => { const d = mcExcDims(p); return [["Vikt", smFmt(d.t, 1) + " ton"], ["Max räckvidd", smFmt(d.reach, 1) + " m"], ["Max grävdjup", smFmt(d.depth, 1) + " m"], ["Längd × bredd", `${smFmt(d.foot[0], 1)} × ${smFmt(d.foot[1], 1)} m`]]; };

Object.assign(SM, {
  grav: { group: "Maskiner", label: "Grävmaskin", color: "#f59e0b", L: 5.8, B: 2.5, H: 3, icon: "crane", calc: mcExcCalc, build: mcExcBuild,
    fields: [["ton", "Storlek", MC_EXC_T.map(t => [t, t.replace(".", ",") + " ton"]), "14"], ["chassi", "Chassi", ["Band", "Hjul"], "Band", { seg: true }], ["redskap", "Redskap", MC_EXC_TOOL, "Skopa"], ["last", "Last i skopan", ["Tom", "Grus", "Jord", "Sprängsten", "Sand"], "Tom"],
      ["sving", "Sväng (överbyggnad)", "range", 0, { min: -180, max: 180, step: 5, unit: "°" }], ["bom", "Bomvinkel", "range", 38, { min: -10, max: 75, step: 1, unit: "°" }], ["stick", "Stickvinkel", "range", 105, { min: 40, max: 175, step: 1, unit: "°" }], ["skopa", "Skopvinkel", "range", 25, { min: -40, max: 90, step: 1, unit: "°" }],
      ["blad", "Planerblad", ["Nej", "Ja"], "Nej", { seg: true }], ["lampor", "Lampor", ["Ja", "Nej"], "Ja", { seg: true }], ["ring", "Räckviddsring", ["Nej", "Ja"], "Nej", { seg: true }], ["_calc", "Data", "calc"]],
    groups: [["Maskin", ["ton", "chassi", "redskap", "last"]], ["Position", ["sving", "bom", "stick", "skopa"]], ["Alternativ", ["blad", "lampor", "ring"], "fold"], ["Data", ["_calc"]]] },
});

/* ---- Hjullastare: knäled, lyftarmar, skopa/gafflar, tre storlekar ---- */
function mcLoaderBuild(p, c) {
  const sz = smF(p, "stor", "Mellan (15 t)"), s = sz.startsWith("Liten") ? 0.78 : sz.startsWith("Stor") ? 1.3 : 1, col = p.color || "#facc15", tool = smF(p, "redskap", "Skopa"), g = smN(p, "knaled", 0) * Math.PI / 180, lift = smN(p, "lyft", 20) / 100, curl = smN(p, "skopa", 15) * Math.PI / 180;
  const cg = Math.cos(g), sg = Math.sin(g), f = (x, y, z) => [x * cg - y * sg, x * sg + y * cg, z], Rg = [g, 0, 0], fb = (colr, x, y, z, sx, sy, sz2, r, o) => c.box(colr, ...f(x, y, z), sx, sy, sz2, Rg, r, o);
  const WR = 0.95 * s, WW = 0.78 * s, ax = 1.7 * s;
  // bakre del: ram, motor, hytt, motvikt
  c.box("#2c3138", -ax * 0.75, 0, 0.95 * s, 3.0 * s, 1.5 * s, 0.7 * s, null, 0.08 * s, { rough: 0.7 }); c.box(col, -2.35 * s, 0, 1.55 * s, 1.3 * s, 2.3 * s, 1.15 * s, null, 0.2 * s, { shin: 70 }); c.box("#111827", -3.0 * s, 0, 1.45 * s, 0.03, 1.4 * s, 0.4 * s, null, 0.01);
  mcCab(c, -0.55 * s, 0.0, 1.35 * s, 1.55 * s, 1.75 * s, 1.75 * s, col); c.box(col, -1.0 * s, 0.9 * s, 1.55 * s, 1.0 * s, 0.4 * s, 0.9 * s, null, 0.06 * s, { shin: 70 }); c.rod("#374151", [-1.95 * s, -0.7 * s, 2.1 * s], [-1.95 * s, -0.7 * s, 3.4 * s], 0.06 * s, 0.06 * s, 8, SMM); mcBeacon(c, -0.55 * s, 0, 3.2 * s + 0.1);
  [-1, 1].forEach(sd => { mcTire(c, -ax, sd * 1.15 * s, WR, WW); c.box(col, -ax, sd * 1.5 * s, WR * 1.45, WR * 2.3, 0.1, 0.12, null, 0.03, { shin: 70 }); }); c.cyl("#3b4047", "y", -ax, 0, WR, 0.14 * s, 0.14 * s, 2.3 * s, 8, null, SMM);
  // knäled och främre del
  c.cyl("#3b4047", "z", 0, 0, 0.7 * s, 0.32 * s, 0.32 * s, 1.4 * s, 12, null, SMM);
  fb("#2c3138", ax * 0.65, 0, 0.95 * s, 2.6 * s, 1.3 * s, 0.6 * s, 0.08 * s, { rough: 0.7 }); [-1, 1].forEach(sd => { const q = f(ax, sd * 1.15 * s, WR); mcTire(c, q[0], q[1], WR, WW); c.cyl("#3b4047", "y", ...f(ax, 0, WR), 0.14 * s, 0.14 * s, 2.3 * s, 8, Rg, SMM); });
  // lyftarmar och redskap (i lodplanet, vrids med knäleden)
  const piv = [ax * 0.45, 1.85 * s], A = (-12 + lift * 62) * Math.PI / 180, La = 3.3 * s, tipP = [piv[0] + Math.cos(A) * La + 0.35 * s, piv[1] + Math.sin(A) * La];
  [-1, 1].forEach(sd => c.beam(col, f(piv[0], sd * 0.62 * s, 1.0 * s), f(piv[0], sd * 0.62 * s, piv[1]), 0.3 * s, 0.34 * s, { shin: 70 }));                                // lyfttorn på främre ramen (armarna sitter i den)
  [-1, 1].forEach(sd => { c.beam(col, f(piv[0], sd * 0.62 * s, piv[1]), f(tipP[0], sd * 0.62 * s, tipP[1]), 0.22 * s, 0.4 * s, { shin: 70 }); c.cyl("#3b4047", "y", ...f(piv[0], sd * 0.62 * s, piv[1]), 0.1 * s, 0.1 * s, 0.3 * s, 10, Rg, SMM); });
  c.beam(col, f(tipP[0] - 0.2 * s, -0.62 * s, tipP[1]), f(tipP[0] - 0.2 * s, 0.62 * s, tipP[1]), 0.3 * s, 0.3 * s, { shin: 70 });                                                               // tvärbalk
  mcRodCyl(c, f(ax * 0.5, 0.35 * s, 1.1 * s), f(piv[0] + Math.cos(A) * La * 0.45, 0.62 * s, piv[1] + Math.sin(A) * La * 0.45 - 0.25 * s), 0.1 * s); mcRodCyl(c, f(ax * 0.5, -0.35 * s, 1.1 * s), f(piv[0] + Math.cos(A) * La * 0.45, -0.62 * s, piv[1] + Math.sin(A) * La * 0.45 - 0.25 * s), 0.1 * s);
  const bp = [tipP[0], tipP[1]], psi = -curl, bw = (tool === "Skopa" ? 3.0 : 2.6) * s, tp = (uu, vv) => [bp[0] + Math.cos(psi) * uu - Math.sin(psi) * vv, bp[1] + Math.sin(psi) * uu + Math.cos(psi) * vv];
  mcRodCyl(c, f(tipP[0] - 0.9 * s, 0, tipP[1] + 0.55 * s), f(...tp(0.05 * s, 0.35 * s).concat([0]).slice(0, 1), 0, tp(0.05 * s, 0.35 * s)[1]), 0.08 * s);
  if (tool === "Skopa") mcScoop(c, tp, bw, s * 1.15, Rg, f, smF(p, "last", "Tom"), "#4b5563"); else if (tool === "Gafflar") { c.box("#4b5563", ...f(tp(0.05 * s, 0.5 * s)[0], 0, tp(0.05 * s, 0.5 * s)[1]), 0.15 * s, bw, 1.7 * s, Rg, 0.02, SMM); [-1, 1].forEach(sd => { const q0 = tp(0.1 * s, -0.7 * s), q1 = tp(1.9 * s, -0.7 * s); c.beam("#6b7280", f(q0[0], sd * 0.9 * s, q0[1]), f(q1[0], sd * 0.9 * s, q1[1]), 0.18 * s, 0.1 * s, SMM); });
  } else mcScoop(c, tp, bw * 1.1, s * 1.55, Rg, f, smF(p, "last", "Tom"), "#4b5563");
  mcLamp(c, 0.3 * s, 0.7 * s, 2.85 * s, 0.3 * s); mcLamp(c, 0.3 * s, -0.7 * s, 2.85 * s, 0.3 * s);
  mcMachineCard(c, p, "Hjullastare " + sz.replace(/ \(.*/, ""), [["Skopa/redskap", tool], ["Vikt", sz.match(/\((.*)\)/)[1]], ["Lyfthöjd", smFmt(3.9 * s * (0.4 + lift * 0.7), 1) + " m"]], 4.2 * s + 1.2);
}

/* ---- Dumper (knäledad, 25–40 t) med flak som tippar och valbar last ---- */
function mcDumperBuild(p, c) {
  const sz = smF(p, "stor", "30 t"), s = sz === "25 t" ? 0.9 : sz === "40 t" ? 1.12 : 1, col = p.color || "#f59e0b", tip = smN(p, "tipp", 0) * Math.PI / 180, g = smN(p, "knaled", 0) * Math.PI / 180, load = smF(p, "last", "Tom");
  const cg = Math.cos(g), sg = Math.sin(g), f = (x, y, z) => [x * cg - y * sg, x * sg + y * cg, z], Rg = [g, 0, 0], WR = 0.95 * s, WW = 0.85 * s;
  // främre enhet (hytt, motor, framaxel) – roterar i knäleden vid x = 0
  c.box("#2c3138", 1.5 * s, 0, 1.0 * s, 3.3 * s, 1.5 * s, 0.7 * s, null, 0.1 * s, { rough: 0.7 }); c.box(col, 2.2 * s, 0, 1.75 * s, 2.0 * s, 2.1 * s, 1.0 * s, null, 0.25 * s, { shin: 70 }); c.box("#111827", 3.22 * s, 0, 1.55 * s, 0.03, 1.4 * s, 0.4 * s, null, 0.01);
  mcCab(c, 0.7 * s, 0.0, 1.8 * s, 1.6 * s, 2.0 * s, 1.65 * s, col); c.rod("#374151", [1.8 * s, 0.9 * s, 2.7 * s], [1.8 * s, 0.9 * s, 3.5 * s], 0.06 * s, 0.06 * s, 8, SMM); mcBeacon(c, 0.7 * s, 0, 3.55 * s);
  [-1, 1].forEach(sd => { mcTire(c, 2.0 * s, sd * 1.45 * s, WR, WW); c.box(col, 2.0 * s, sd * 1.5 * s, WR * 1.5, WR * 2.4, 0.1, 0.12, null, 0.03, { shin: 70 }); }); c.cyl("#3b4047", "y", 2.0 * s, 0, WR, 0.15 * s, 0.15 * s, 2.8 * s, 8, null, SMM);
  mcLamp(c, 3.25 * s, 0.75 * s, 2.1 * s, 0.3 * s); mcLamp(c, 3.25 * s, -0.75 * s, 2.1 * s, 0.3 * s);
  // bakre enhet: ram, två boggi-axlar, flak med svängbar bakkant
  c.cyl("#3b4047", "z", 0, 0, 0.8 * s, 0.4 * s, 0.4 * s, 1.2 * s, 14, null, SMM);
  [-1, 1].forEach(sx => [-1, 1].forEach(sd => { const q = f(-3.0 * s + sx * 0.0, 0, 0); void q; })); const ax2 = [-2.6 * s, -4.6 * s];
  c.box("#2c3138", ...f(-3.0 * s, 0, 1.0 * s), 6.0 * s, 1.5 * s, 0.6 * s, Rg, 0.08 * s, { rough: 0.7 }); ax2.forEach(x => { [-1, 1].forEach(sd => mcTire(c, ...(() => { const q = f(x, sd * 1.45 * s, WR); return [q[0], q[1], WR, WW]; })())); c.cyl("#3b4047", "y", ...f(x, 0, WR), 0.15 * s, 0.15 * s, 2.8 * s, 8, Rg, SMM); });
  const H0 = -7.6 * s, hinge = [-7.0 * s, 1.35 * s], rot = ([x, z]) => { const dx = x - hinge[0], dz = z - hinge[1]; return [hinge[0] + dx * Math.cos(tip) - dz * Math.sin(tip), hinge[1] + dx * Math.sin(tip) + dz * Math.cos(tip)]; };
  const W = 3.0 * s, T = 0.12 * s, Hb = 1.95 * s, X0 = -7.5 * s, X1 = -0.9 * s;
  const bed = (prof, y0, y1, colr, o) => mcExtrude(c, colr, prof.map(q => { const r = rot(q); const w = f(r[0], 0, r[1]); return [w[0], w[2]]; }), y0, y1, "y", o, Rg);
  bed([[X0, 1.35 * s], [X1, 1.35 * s], [X1 + 0.25 * s, 1.35 * s + 0.4 * s], [X1 + 0.1 * s, 1.35 * s + Hb], [X0, 1.35 * s + Hb * 0.88]], -W / 2, -W / 2 + T, "#d97706", { shin: 60 });                                              // vänster sida (profil)
  bed([[X0, 1.35 * s], [X1, 1.35 * s], [X1 + 0.25 * s, 1.35 * s + 0.4 * s], [X1 + 0.1 * s, 1.35 * s + Hb], [X0, 1.35 * s + Hb * 0.88]], W / 2 - T, W / 2, "#d97706", { shin: 60 });
  bed([[X0, 1.35 * s - 0.05], [X1 + 0.25 * s, 1.35 * s - 0.05], [X1 + 0.25 * s, 1.35 * s + 0.4 * s], [X0, 1.35 * s + T * 0.5]], -W / 2, W / 2, "#b45309", { shin: 60 });                                                 // botten
  bed([[X1 - 0.02, 1.35 * s + 0.35 * s], [X1 + 0.25 * s, 1.35 * s + 0.4 * s], [X1 + 0.1 * s, 1.35 * s + Hb + 0.25 * s], [X1 - 0.2 * s, 1.35 * s + Hb + 0.2 * s]], -W / 2, W / 2, "#d97706", { shin: 60 });                  // främre vägg med visir
  const LC = { Grus: "#a79a7e", Jord: "#6b4f36", Sprängsten: "#7a7e85", Sand: "#d4be86" }[load];
  if (LC) bed([[X0 + 0.15 * s, 1.35 * s + 0.1], [X1, 1.35 * s + 0.1], [X1 + 0.1 * s, 1.35 * s + Hb * 0.6], [X0 + 2.5 * s, 1.35 * s + Hb * 1.15], [X0 + 0.15 * s, 1.35 * s + Hb * 0.55]], -W / 2 + T, W / 2 - T, LC, { rough: 1 });
  { const q = rot([hinge[0] + 0.5 * s, 0.7 * s]), w = f(q[0], 0, q[1]); void w; const a0 = f(-4.4 * s, 0, 1.05 * s), a1 = (() => { const r = rot([-3.4 * s, 1.35 * s + 0.1]); return f(r[0], 0, r[1]); })(); [-1, 1].forEach(sd => mcRodCyl(c, [a0[0], sd * 0.5 * s, a0[2]], [a1[0], sd * 0.5 * s, a1[2]], 0.12 * s)); }       // tippcylindrar
  c.box("#3b4047", ...f(hinge[0], 0, hinge[1]), 0.3 * s, W * 0.8, 0.3 * s, Rg, 0.05, SMM);
  mcMachineCard(c, p, "Dumper " + sz, [["Last", load], ["Vikt", sz], ["Flak", smFmt(tip * 180 / Math.PI, 0) + "° tippat"]], 3.8 * s + 1.5);
}

/* ---- Lastbil: tippbil, flakbil, kranbil, containerbil – gemensam hytt och chassi ---- */
function mcTruckBuild(p, c) {
  const typ = smF(p, "typ", "Tippbil"), col = p.color || "#2563eb", ax = Number(smF(p, "axlar", "3")) || 3, tip = smN(p, "tipp", 0) * Math.PI / 180, load = smF(p, "last", "Tom"), WR = 0.52, WW = 0.32, Lc = 2.6 + (ax - 2) * 1.35;
  const xa = Array.from({ length: ax }, (_, i) => (i === 0 ? 3.4 : 3.4 - 3.6 - (i - 1) * 1.35) - 0); const tail = xa[xa.length - 1] - 1.3;
  c.box("#20242a", (3.9 + tail) / 2, 0, 0.85, 3.9 - tail, 0.9, 0.22, null, 0.03, { rough: 0.7 }); xa.forEach((x, i) => { [-1, 1].forEach(sd => { mcTire(c, x, sd * 1.15, WR, WW); if (i > 0) mcTire(c, x, sd * 1.55, WR, WW); }); c.cyl("#3b4047", "y", x, 0, WR, 0.07, 0.07, 2.2, 8, null, SMM); });
  [xa[0] - 0.8, xa[1] ? xa[1] + 1.6 : xa[0] - 2].forEach(x => c.cyl("#9aa4ae", "y", x, 1.1, 0.7, 0.28, 0.28, 0.75, 12, null, SMM));                                                       // bränsletankar
  // hytt (profil sträckt över bredden) med vindruta, lampor och speglar
  const cabP = [[2.9, 1.0], [4.3, 1.0], [4.4, 1.4], [4.4, 2.6], [3.9, 3.1], [3.3, 3.5], [2.7, 3.5], [2.6, 3.0], [2.6, 1.3]];
  mcTruckDetails(c, xa); mcExtrude(c, col, cabP, -1.25, 1.25, "y", { shin: 80 }); c.beam("#1c2b3a", [4.36, 0, 2.55], [3.9, 0, 3.08], 2.3, 0.04, SMG); [-1, 1].forEach(sd => c.box("#1c2b3a", 3.5, sd * 1.255, 2.45, 0.9, 0.02, 0.7, null, 0.02, SMG));
  c.box("#111827", 4.41, 0, 1.2, 0.02, 1.6, 0.4, null, 0.02); [-1, 1].forEach(sd => { mcLamp(c, 4.41, sd * 0.85, 1.55, 0.35); c.box("#111827", 3.9, sd * 1.4, 2.9, 0.05, 0.12, 0.45, null, 0.02); });
  c.box("#e5e7eb", 3.45, 0, 3.7, 0.9, 1.9, 0.18, null, 0.05, { rough: 0.5 }); mcBeacon(c, 3.0, 0, 3.78);
  c.cyl("#374151", "z", 2.7, 1.2, 2.2, 0.06, 0.06, 1.9, 8, null, SMM);                                                                                                                   // stående avgasrör
  // överbyggnad per typ
  const bx0 = tail + 0.1, bx1 = 2.55, L = bx1 - bx0, z0 = 1.0;
  if (typ === "Tippbil") {
    const hinge = [bx0, z0 + 0.1], rot = ([x, z]) => { const dx = x - hinge[0], dz = z - hinge[1]; return [hinge[0] + dx * Math.cos(tip) - dz * Math.sin(tip), hinge[1] + dx * Math.sin(tip) + dz * Math.cos(tip)]; }, Hb = 1.45, W = 2.5, T = 0.1;
    const bed = (prof, y0, y1, colr, o) => mcExtrude(c, colr, prof.map(rot), y0, y1, "y", o);
    bed([[bx0, z0 + 0.1], [bx1, z0 + 0.1], [bx1, z0 + 0.1 + Hb], [bx0, z0 + 0.1 + Hb]], -W / 2, -W / 2 + T, "#9ca3af", { metal: 0.4, rough: 0.5 }); bed([[bx0, z0 + 0.1], [bx1, z0 + 0.1], [bx1, z0 + 0.1 + Hb], [bx0, z0 + 0.1 + Hb]], W / 2 - T, W / 2, "#9ca3af", { metal: 0.4, rough: 0.5 });
    bed([[bx0, z0 + 0.04], [bx1, z0 + 0.04], [bx1, z0 + 0.16], [bx0, z0 + 0.16]], -W / 2, W / 2, "#6b7280", { metal: 0.5, rough: 0.5 }); bed([[bx1 - 0.1, z0 + 0.1], [bx1, z0 + 0.1], [bx1 + 0.05, z0 + 0.1 + Hb + 0.4], [bx1 - 0.2, z0 + 0.1 + Hb + 0.3]], -W / 2, W / 2, "#9ca3af", { metal: 0.4, rough: 0.5 });
    const LC = { Grus: "#a79a7e", Jord: "#6b4f36", Sprängsten: "#7a7e85", Sand: "#d4be86" }[load]; if (LC) bed([[bx0 + 0.1, z0 + 0.16], [bx1 - 0.15, z0 + 0.16], [bx1 - 0.15, z0 + 0.1 + Hb * 0.8], [bx0 + 1.3, z0 + 0.1 + Hb * 1.2], [bx0 + 0.1, z0 + 0.1 + Hb * 0.7]], -W / 2 + T, W / 2 - T, LC, { rough: 1 });
    const q = rot([bx0 + 2.6, z0 + 0.1]); mcRodCyl(c, [bx0 + 2.2, 0, z0 + 0.05], [q[0], 0, q[1]], 0.1);
  } else if (typ === "Flakbil" || typ === "Kranbil") {
    c.box("#6b7280", (bx0 + bx1) / 2, 0, z0 + 0.12, L, 2.5, 0.14, null, 0.02, SMM); c.box("#c9a15f", (bx0 + bx1) / 2, 0, z0 + 0.21, L - 0.04, 2.46, 0.05, null, 0.01, { rough: 0.9 });
    [-1, 1].forEach(sd => c.box("#9ca3af", (bx0 + bx1) / 2, sd * 1.25, z0 + 0.5, L, 0.05, 0.6, null, 0.01, { metal: 0.4 })); if (typ === "Flakbil") { c.box("#9ca3af", bx0, 0, z0 + 0.5, 0.05, 2.5, 0.6, null, 0.01, { metal: 0.4 }); c.box("#9ca3af", bx1, 0, z0 + 0.7, 0.05, 2.5, 1.0, null, 0.01, { metal: 0.4 }); }
    if (typ === "Kranbil") { const sw = smN(p, "sving", 0) * Math.PI / 180, a = smN(p, "bom", 55) * Math.PI / 180, out = smN(p, "utskjut", 50) / 100, cs = Math.cos(sw), sn = Math.sin(sw), u = (x, y, z) => [x * cs - y * sn, x * sn + y * cs, z], bz = z0 + 0.2, bxp = bx1 - 0.7;
      c.cyl("#374151", "z", bxp, 0, bz + 0.6, 0.38, 0.38, 1.2, 14, null, SMM); c.box(col, bxp, 0, bz + 0.5, 0.9, 0.9, 0.9, null, 0.08, { shin: 70 });
      const P0 = [0.0, bz + 1.2], L1 = 3.4, L2 = 1.0 + 3.4 * out, P1 = [P0[0] + Math.cos(a) * L1, P0[1] + Math.sin(a) * L1], a2 = a - 1.05 * (1 - out) - 0.35, P2 = [P1[0] + Math.cos(a2) * L2, P1[1] + Math.sin(a2) * L2], pp = q => { const r = u(q[0], 0, q[1]); return [bxp + r[0], r[1], r[2]]; };
      c.beam(col, pp(P0), pp(P1), 0.32, 0.4, { shin: 70 }); c.beam("#e5e7eb", pp(P1), pp(P2), 0.24, 0.28, { shin: 70 }); c.cyl("#3b4047", "y", ...pp(P1), 0.13, 0.13, 0.4, 10, [sw, 0, 0], SMM);
      mcRodCyl(c, pp([P0[0] - 0.1, P0[1] - 0.4]), pp([P0[0] + Math.cos(a) * 1.6, P0[1] + Math.sin(a) * 1.6 - 0.25]), 0.07); c.rod("#1f2937", pp(P2), [pp(P2)[0], pp(P2)[1], pp(P2)[2] - 2.4 * (0.4 + out * 0.6)], 0.012, 0.012, 4, SMM); c.box("#f59e0b", pp(P2)[0], pp(P2)[1], pp(P2)[2] - 2.5 * (0.4 + out * 0.6), 0.22, 0.14, 0.2, null, 0.03);
      [-1, 1].forEach(sd => { c.beam("#6b7280", [bxp, sd * 0.6, z0 + 0.05], [bxp, sd * 2.0, z0 + 0.05], 0.14, 0.14, SMM); c.rod("#9ca3af", [bxp, sd * 2.0, z0 + 0.05], [bxp, sd * 2.0, 0.04], 0.07, 0.07, 8, SMM); c.box("#4b5563", bxp, sd * 2.0, 0.03, 0.4, 0.4, 0.05, null, 0.01, SMM); }); }
    if (load === "Pall") for (let i = 0; i < 6; i++) c.box(["#e5e7eb", "#d4a574"][i % 2], bx0 + 0.9 + (i % 3) * 1.4, ((i / 3) | 0) * 1.1 - 0.55, z0 + 0.7, 1.2, 1.0, 0.9, null, 0.05, { rough: 0.8 });
  } else {                                                                                                                                                                                                   // containerbil (lastväxlare)
    c.box("#3b4047", (bx0 + bx1) / 2, 0, z0 + 0.15, L, 1.2, 0.2, null, 0.03, SMM); const cx0 = bx0 - 0.3, cx1 = bx1 + 0.3; c.box(col, (cx0 + cx1) / 2, 0, z0 + 0.35 + 1.3, cx1 - cx0, 2.5, 2.6, null, 0.04, { rough: 0.6 });
    for (let x = cx0 + 0.3; x < cx1 - 0.2; x += 0.3) c.box("#00000022", x, 0, z0 + 0.35 + 1.3, 0.04, 2.52, 2.4, null, 0, { rough: 0.8 }); c.box("#e5e7eb", cx1, 0, z0 + 0.35 + 1.3, 0.06, 2.2, 2.4, null, 0.01);
  }
  mcMachineCard(c, p, typ, [["Axlar", String(ax)], ["Last", typ === "Tippbil" ? load : typ === "Kranbil" ? "Kran" : typ === "Flakbil" ? load : "Container"]], 4.5);
}
Object.assign(SM, {
  hjullastare: { group: "Maskiner", label: "Hjullastare", color: "#facc15", L: 9, B: 3, H: 3.6, icon: "truck", build: mcLoaderBuild,
    fields: [["stor", "Storlek", ["Liten (5 t)", "Mellan (15 t)", "Stor (30 t)"], "Mellan (15 t)"], ["redskap", "Redskap", ["Skopa", "Gafflar", "Höglyftsskopa"], "Skopa"], ["knaled", "Knäled (styrning)", "range", 0, { min: -40, max: 40, step: 1, unit: "°" }], ["last", "Last i skopan", ["Tom", "Grus", "Jord", "Sprängsten", "Sand"], "Tom"], ["lyft", "Lyfthöjd", "range", 20, { min: 0, max: 100, step: 1, unit: "%" }], ["skopa", "Skopvinkel", "range", 15, { min: -30, max: 70, step: 1, unit: "°" }]],
    groups: [["Maskin", ["stor", "redskap", "last"]], ["Position", ["knaled", "lyft", "skopa"]]] },
  dumper: { group: "Maskiner", label: "Dumper", color: "#f59e0b", L: 10, B: 3, H: 3.6, icon: "truck", build: mcDumperBuild,
    fields: [["stor", "Storlek", ["25 t", "30 t", "40 t"], "30 t"], ["last", "Last", ["Tom", "Grus", "Jord", "Sprängsten", "Sand"], "Tom"], ["tipp", "Flaktippning", "range", 0, { min: 0, max: 60, step: 1, unit: "°" }], ["knaled", "Knäled (styrning)", "range", 0, { min: -40, max: 40, step: 1, unit: "°" }]],
    groups: [["Maskin", ["stor", "last"]], ["Position", ["tipp", "knaled"]]] },
  lastbil: { group: "Maskiner", label: "Lastbil", color: "#2563eb", L: 10, B: 2.6, H: 3.9, icon: "truck", build: mcTruckBuild,
    fields: [["typ", "Typ", ["Tippbil", "Flakbil", "Kranbil", "Containerbil"], "Tippbil"], ["axlar", "Axlar", [["2", "2 (4×2)"], ["3", "3 (6×4)"], ["4", "4 (8×4)"]], "3", { seg: true }], ["last", "Last", ["Tom", "Grus", "Jord", "Sprängsten", "Sand", "Pall"], "Tom"], ["tipp", "Flaktippning", "range", 0, { min: 0, max: 55, step: 1, unit: "°" }],
      ["bom", "Kranbom, vinkel", "range", 55, { min: 0, max: 80, step: 1, unit: "°" }], ["utskjut", "Kranbom, utskjut", "range", 50, { min: 0, max: 100, step: 1, unit: "%" }], ["sving", "Kran, sväng", "range", 0, { min: -180, max: 180, step: 5, unit: "°" }]],
    groups: [["Lastbil", ["typ", "axlar", "last"]], ["Position", ["tipp", "bom", "utskjut", "sving"]]] },
});

/* Gemensamt lastbilschassi med hytt (betongbil, pump m.fl.): returnerar axelpositioner och bakkant. */
function mcTruckBase(c, ax, col, WR = 0.52) {
  const WW = 0.32, xa = Array.from({ length: ax }, (_, i) => (i === 0 ? 3.4 : 3.4 - 3.6 - (i - 1) * 1.35)), tail = xa[xa.length - 1] - 1.3;
  c.box("#20242a", (3.9 + tail) / 2, 0, 0.85, 3.9 - tail, 0.9, 0.22, null, 0.03, { rough: 0.7 }); xa.forEach((x, i) => { [-1, 1].forEach(sd => { mcTire(c, x, sd * 1.15, WR, WW); if (i > 0) mcTire(c, x, sd * 1.55, WR, WW); }); c.cyl("#3b4047", "y", x, 0, WR, 0.07, 0.07, 2.2, 8, null, SMM); });
  const cabP = [[2.9, 1.0], [4.3, 1.0], [4.4, 1.4], [4.4, 2.6], [3.9, 3.1], [3.3, 3.5], [2.7, 3.5], [2.6, 3.0], [2.6, 1.3]];
  mcTruckDetails(c, xa); mcExtrude(c, col, cabP, -1.25, 1.25, "y", { shin: 80 }); c.beam("#1c2b3a", [4.36, 0, 2.55], [3.9, 0, 3.08], 2.3, 0.04, SMG); [-1, 1].forEach(sd => c.box("#1c2b3a", 3.5, sd * 1.255, 2.45, 0.9, 0.02, 0.7, null, 0.02, SMG));
  c.box("#111827", 4.41, 0, 1.2, 0.02, 1.6, 0.4, null, 0.02); [-1, 1].forEach(sd => { mcLamp(c, 4.41, sd * 0.85, 1.55, 0.35); c.box("#111827", 3.9, sd * 1.4, 2.9, 0.05, 0.12, 0.45, null, 0.02); }); c.box("#e5e7eb", 3.45, 0, 3.7, 0.9, 1.9, 0.18, null, 0.05, { rough: 0.5 }); mcBeacon(c, 3.0, 0, 3.78);
  return { xa, tail };
}
/* ---- Betongbil (mixer): lutande trumma med skruvband, rutschkana, vattentank ---- */
function mcMixerBuild(p, c) {
  const ax = Number(smF(p, "axlar", "4")) || 4, col = p.color || "#e5e7eb", { tail } = mcTruckBase(c, ax, "#e5e7eb"), chute = smF(p, "rutschkana", "Uppfälld"), vol = Number(smF(p, "volym", "9")) || 9, s = Math.cbrt(vol / 9), spin = smN(p, "rotation", 0) * Math.PI / 180;
  c.box("#3b4047", (2.6 + tail) / 2, 0, 1.15, 2.6 - tail, 1.0, 0.18, null, 0.03, SMM);
  const r = 1.16 * s, t0 = 0.24, L = 5.6 * s, ct = Math.cos(t0), st = Math.sin(t0), B = [2.35, 0, 1.95];                              // trummans botten sitter bak hytten, öppningen pekar bakåt/uppåt
  const drum = [[0.04, 0], [r * 0.5, 0.03], [r * 0.95, 0.7 * s], [r, 1.3 * s], [r, 3.5 * s], [r * 0.88, 4.6 * s], [r * 0.5, L - 0.5 * s], [r * 0.34, L]];
  c.lathe(col, drum, B[0], 0, B[2], 30, [0, -(Math.PI / 2 - t0), 0], { shin: 70 });
  const at = (t, rr, a) => [B[0] - t * ct + Math.cos(a) * rr * st, Math.sin(a) * rr, B[2] + t * st + Math.cos(a) * rr * ct];
  const pts = []; for (let k = 0; k <= 26; k++) { const t = 0.8 * s + (k / 26) * (L - 1.9 * s), rr = (t < 3.5 * s ? r : r * (1 - (t - 3.5 * s) * 0.1)) * 1.025; pts.push(at(t, rr, k * 0.58 + spin)); }
  for (let k = 0; k + 1 < pts.length; k++) c.beam("#6b7280", pts[k], pts[k + 1], 0.13, 0.07, SMM);                                      // spiralblad (ränna på utsidan)
  [0.45 * s, 3.7 * s].forEach(t => { const q = at(t, 0, 0); c.cyl("#9ca3af", "x", q[0], 0, q[2], r * 1.03, r * 1.03, 0.14, 26, null, SMM); });
  c.cyl("#9ca3af", "x", B[0] + 0.1, 0, B[2] - 0.2, 0.3, 0.3, 0.5, 12, null, SMM);                                                      // drivning
  const m = at(L, 0, 0), hx = m[0] - 0.35, hz = m[2] + 0.1; c.box("#9ca3af", hx, 0, hz, 0.8, 1.0, 0.7, [0, 0.4, 0], 0.06, SMM);
  if (chute === "Utfälld") { c.beam("#9ca3af", [hx - 0.2, 0, hz - 0.3], [hx - 3.2, 0, 0.9], 0.55, 0.12, SMM); c.beam("#6b7280", [hx - 2.9, 0, 1.0], [hx - 3.7, 0, 0.55], 0.5, 0.1, SMM); }
  else { c.beam("#9ca3af", [hx - 0.2, 0, hz - 0.1], [hx + 0.9, 0, hz + 0.95], 0.55, 0.12, SMM); c.beam("#9ca3af", [hx + 0.9, 0, hz + 0.95], [hx + 1.7, 0, hz + 0.6], 0.5, 0.1, SMM); }
  c.cyl("#1e3a8a", "y", 0.3, 1.0, 1.5, 0.28, 0.28, 0.9, 14, null, SMM); c.rod("#9ca3af", [hx + 0.5, 1.15, 1.2], [hx + 0.5, 1.15, hz + 0.9], 0.04, 0.04, 8, SMM); c.rod("#9ca3af", [hx + 0.5, 0.85, 1.2], [hx + 0.5, 0.85, hz + 0.9], 0.04, 0.04, 8, SMM);
  for (let z = 1.4; z < hz + 0.7; z += 0.35) c.rod("#9ca3af", [hx + 0.5, 0.85, z], [hx + 0.5, 1.15, z], 0.02, 0.02, 6, SMM);          // stege
  mcMachineCard(c, p, "Betongbil " + vol + " m³", [["Volym", vol + " m³"], ["Axlar", String(ax)], ["Rutschkana", chute]], 4.9 * s);
}
/* ---- Betongpump (mastpump på lastbil): fyra utfällbara mastsektioner, stödben ---- */
function mcPumpBuild(p, c) {
  const reach = Number(smF(p, "rackvidd", "36")) || 36, ax = reach >= 42 ? 5 : 4, col = p.color || "#dc2626", { xa, tail } = mcTruckBase(c, ax, "#dc2626", 0.55), u = smN(p, "utfallning", 70) / 100, sw = smN(p, "sving", 0) * Math.PI / 180, out = smF(p, "stod", "Utfällda") === "Utfällda", bz = 2.2;
  const nSec = reach >= 42 ? 5 : reach >= 32 ? 4 : 3, sl = reach / nSec * 0.92, cs = Math.cos(sw), sn = Math.sin(sw), bxp = 1.6;
  c.box("#3b4047", (2.4 + tail) / 2, 0, 1.1, 2.4 - tail, 1.5, 0.22, null, 0.03, SMM); c.box(col, bxp, 0, bz + 0.2, 1.6, 1.8, 0.9, null, 0.12, { shin: 70 });
  const fold = [0.04, 3.05, 0.1, 3.05, 0.1].slice(0, nSec), open = [0.85, 0.12, -0.1, -0.2, -0.3].slice(0, nSec);
  let P = [0, bz + 0.9], ang = 0, prevA = null; const pts = [];
  for (let k = 0; k < nSec; k++) { const a = fold[k] + (open[k] - fold[k]) * u; ang = a; const L = sl * (k === 0 ? 0.95 : 1), off = k * 0.22 * (1 - u); const Q = [P[0] + Math.cos(a) * L, P[1] + Math.sin(a) * L]; pts.push([P.slice(), Q.slice(), off]); P = [Q[0], Q[1] + 0 + 0]; prevA = a; }
  const T = q => { const x = q[0], y = 0; return [bxp + x * cs - y * sn, x * sn + y * cs, q[1]]; };
  pts.forEach(([a, b, off], k) => { const A = T([a[0], a[1] + off]), B = T([b[0], b[1] + off]); c.beam(k % 2 ? "#e5e7eb" : col, A, B, 0.5 - k * 0.05, 0.6 - k * 0.06, { shin: 70 }); c.cyl("#3b4047", "y", ...A, 0.17, 0.17, 0.7 - k * 0.06, 12, [sw, 0, 0], SMM); mcRodCyl(c, T([a[0] + (b[0] - a[0]) * 0.1, a[1] + off + 0.55]), T([a[0] + (b[0] - a[0]) * 0.45, a[1] + (b[1] - a[1]) * 0.45 + off + 0.5]), 0.07); });
  const tip = T(pts[pts.length - 1][1]); c.rod("#111827", tip, [tip[0], tip[1], Math.max(0.3, tip[2] - 3.0)], 0.07, 0.07, 8); c.rod("#111827", [tip[0], tip[1], Math.max(0.3, tip[2] - 3.0)], [tip[0] + 0.3, tip[1], Math.max(0.2, tip[2] - 3.4)], 0.07, 0.07, 8);
  [0.5, 3.0].forEach(x => { [-1, 1].forEach(sd => { const ox = x + (sd > 0 ? 0 : 0); if (out) { c.beam("#6b7280", [ox, sd * 0.7, 1.0], [ox, sd * 3.5, 1.0], 0.22, 0.22, SMM); c.rod("#9ca3af", [ox, sd * 3.5, 1.0], [ox, sd * 3.5, 0.06], 0.1, 0.1, 8, SMM); c.box("#374151", ox, sd * 3.5, 0.03, 0.7, 0.7, 0.06, null, 0.01, SMM); } else { c.beam("#6b7280", [ox, sd * 0.7, 1.0], [ox, sd * 1.4, 1.0], 0.22, 0.22, SMM); c.rod("#9ca3af", [ox, sd * 1.4, 1.0], [ox, sd * 1.4, 0.3], 0.08, 0.08, 8, SMM); } }); });
  c.box("#e5e7eb", tail + 0.6, 0, 1.6, 1.0, 1.9, 0.9, null, 0.06, SMM); c.box("#9ca3af", tail + 0.3, 0, 2.2, 0.5, 1.4, 0.5, [0, 0.4, 0], 0.05, SMM);               // pumpenhet + hopp
  mcMachineCard(c, p, "Betongpump " + reach + " m", [["Räckvidd", reach + " m"], ["Mastsektioner", String(nSec)], ["Stödben", out ? "Utfällda" : "Inne"]], 4.6);
}
/* ---- Vält: vibrovält (tandem), markvält eller gummihjulsvält ---- */
function mcRollerBuild(p, c) {
  const typ = smF(p, "typ", "Vibrovält (tandem)"), W = Number(smF(p, "bredd", "1.4")) || 1.4, col = p.color || "#facc15", vib = smF(p, "vibration", "Av") === "På";
  if (typ.startsWith("Gummi")) {
    c.box("#2c3138", 0, 0, 0.8, 3.6, 1.9, 0.5, null, 0.06, { rough: 0.7 }); [-1.4, -0.5, 0.4, 1.3].forEach((x, i) => [-0.75, -0.25, 0.25, 0.75].forEach(y => { mcTire(c, x + (y > 0 ? 0 : 0.0) + (i % 2 ? 0 : 0.05), y * 1.12, 0.38, 0.4); }));
    c.box(col, -0.2, 0, 1.55, 2.6, 1.5, 0.9, null, 0.12, { shin: 70 }); c.box("#e5e7eb", -0.2, 0, 2.05, 1.6, 1.4, 0.06, null, 0.03, SMM); [-1, 1].forEach(sx => [-1, 1].forEach(sy => c.rod("#374151", [sx * 0.7 - 0.2, sy * 0.65, 1.1], [sx * 0.7 - 0.2, sy * 0.65, 2.9], 0.035, 0.035, 8, SMM))); c.box("#374151", -0.2, 0, 2.95, 1.6, 1.4, 0.06, null, 0.02, SMM); mcBeacon(c, -0.2, 0, 3.0);
  } else {
    const R = typ.startsWith("Mark") ? 0.85 : 0.65, dl = typ.startsWith("Mark") ? 2.2 : 1.2, fx = [dl / 2 * 1.6, -dl / 2 * 1.6]; const dW = typ.startsWith("Mark") ? 2.1 : W;
    c.box("#2c3138", 0, 0, R * 1.5, dl * 1.6 + 1.0, 0.9, 0.5, null, 0.06, { rough: 0.7 }); fx.forEach((x, i) => { c.cyl("#6b7280", "y", x, 0, R, R, R, dW, 28, null, { metal: 0.8, rough: 0.5 }); [-1, 1].forEach(sd => { c.cyl("#374151", "y", x, sd * (dW / 2 + 0.05), R, 0.16, 0.16, 0.12, 10, null, SMM); }); c.box("#374151", x, 0, R * 2.2, 0.5, dW * 0.9, 0.12, null, 0.03, SMM); if (vib) c.cyl("#f59e0b", "y", x, 0, R, R * 1.03, R * 1.03, dW * 0.12, 28, null, { unlit: true }); c.cyl("#1f2937", "y", x, 0, R * 0.18 - 0.05, R * 0.04, R * 0.04, dW * 0.98, 8); });
    c.box(col, -0.4, 0, R * 1.5 + 0.7, 1.9, 1.5, 0.9, null, 0.14, { shin: 70 }); c.box("#374151", 0.6, 0, R * 1.5 + 1.15, 0.8, 0.5, 0.15, null, 0.04, SMM);                                      // motorhuv, förarsäte
    [-1, 1].forEach(sx => [-1, 1].forEach(sy => c.rod("#374151", [sx * 0.55 + 0.3, sy * 0.55, R * 1.5 + 1.1], [sx * 0.55 + 0.3, sy * 0.55, R * 1.5 + 2.7], 0.03, 0.03, 8, SMM))); c.box("#374151", 0.3, 0, R * 1.5 + 2.75, 1.3, 1.3, 0.06, null, 0.02, SMM); mcBeacon(c, 0.3, 0, R * 1.5 + 2.8);
    c.box("#e5e7eb", dl * 1.6 / 2 + 0.55, 0, R * 1.5 + 0.1, 0.1, 0.9, 0.3, null, 0.02);
  }
  mcMachineCard(c, p, typ.replace(/ \(.*/, ""), [["Valsbredd", String(W).replace(".", ",") + " m"], ["Vibration", vib ? "På" : "Av"]], 4.2);
}
Object.assign(SM, {
  betongbil: { group: "Maskiner", label: "Betongbil", color: "#e5e7eb", L: 9, B: 2.55, H: 4, icon: "truck", build: mcMixerBuild,
    fields: [["volym", "Volym", [["7", "7 m³"], ["9", "9 m³"], ["12", "12 m³"]], "9"], ["axlar", "Axlar", [["3", "3"], ["4", "4"], ["5", "5"]], "4", { seg: true }], ["rutschkana", "Rutschkana", ["Uppfälld", "Utfälld"], "Uppfälld", { seg: true }], ["rotation", "Trummans vridning", "range", 0, { min: 0, max: 360, step: 5, unit: "°" }]],
    groups: [["Maskin", ["volym", "axlar"]], ["Position", ["rutschkana", "rotation"]]] },
  betongpump: { group: "Maskiner", label: "Betongpump", color: "#dc2626", L: 10.5, B: 2.55, H: 4, icon: "truck", build: mcPumpBuild,
    fields: [["rackvidd", "Räckvidd", [["24", "24 m"], ["28", "28 m"], ["32", "32 m"], ["36", "36 m"], ["42", "42 m"], ["52", "52 m"]], "36"], ["utfallning", "Mastens utfällning", "range", 70, { min: 0, max: 100, step: 1, unit: "%" }], ["sving", "Sväng", "range", 0, { min: -180, max: 180, step: 5, unit: "°" }], ["stod", "Stödben", ["Utfällda", "Inne"], "Utfällda", { seg: true }]],
    groups: [["Maskin", ["rackvidd", "stod"]], ["Position", ["utfallning", "sving"]]] },
  valt: { group: "Maskiner", label: "Vält", color: "#facc15", L: 4.2, B: 2.2, H: 3, icon: "truck", build: mcRollerBuild,
    fields: [["typ", "Typ", ["Vibrovält (tandem)", "Markvält", "Gummihjulsvält"], "Vibrovält (tandem)"], ["bredd", "Valsbredd", [["1.2", "1,2 m"], ["1.4", "1,4 m"], ["1.7", "1,7 m"], ["2.1", "2,1 m"]], "1.4"], ["vibration", "Vibration", ["Av", "På"], "Av", { seg: true }]],
    groups: [["Maskin", ["typ", "bredd", "vibration"]]] },
});

/* ---- Minilastare (skid steer): lyftarmar bakåt, hjul eller band, redskap ---- */
function mcSkidBuild(p, c) {
  const col = p.color || "#f59e0b", tracks = smF(p, "chassi", "Hjul") === "Band", tool = smF(p, "redskap", "Skopa"), lift = smN(p, "lyft", 35) / 100, curl = smN(p, "skopa", 10) * Math.PI / 180;
  if (tracks) { [-1, 1].forEach(sd => mcTrack(c, 0, sd * 0.78, 1.9, 0.38, 0.6)); c.box("#2c3138", 0, 0, 0.5, 1.8, 1.0, 0.4, null, 0.05, { rough: 0.7 }); } else { c.box("#2c3138", 0, 0, 0.55, 2.0, 1.45, 0.4, null, 0.05, { rough: 0.7 }); [-1, 1].forEach(sx => [-1, 1].forEach(sd => mcTire(c, sx * 0.72, sd * 0.88, 0.36, 0.3))); }
  c.box(col, -0.55, 0, 1.05, 1.0, 1.55, 0.85, null, 0.14, { shin: 70 }); c.box("#111827", -1.06, 0, 1.0, 0.03, 0.9, 0.3, null, 0.01);                          // motorhuv
  // hytt med öppet tak (ROPS) och lyftarmar på sidorna
  [-1, 1].forEach(sx => [-1, 1].forEach(sd => c.rod(col, [sx * 0.4 + 0.1, sd * 0.55, 1.0], [sx * 0.4 + 0.1, sd * 0.55, 2.0], 0.035, 0.035, 8, SMM))); c.box(col, 0.1, 0, 2.02, 1.0, 1.2, 0.05, null, 0.02, { shin: 70 }); c.box("#1c2b3a", 0.52, 0, 1.55, 0.03, 1.1, 0.8, null, 0.01, SMG); c.box("#374151", 0.1, 0, 1.15, 0.4, 0.45, 0.25, null, 0.05, SMM); mcBeacon(c, 0.1, 0.0, 2.08);
  const A = (-20 + lift * 75) * Math.PI / 180, piv = [-0.35, 1.7], La = 2.0, tp = [piv[0] + Math.cos(A) * La, piv[1] + Math.sin(A) * La];
  [-1, 1].forEach(sd => { c.beam(col, [piv[0], sd * 0.78, piv[1]], [tp[0], sd * 0.78, tp[1]], 0.13, 0.28, { shin: 70 }); mcRodCyl(c, [0.2, sd * 0.68, 0.95], [piv[0] + Math.cos(A) * 1.0 + 0.3, sd * 0.68, piv[1] + Math.sin(A) * 1.0 - 0.1], 0.06); });
  const psi = -curl, bw = 1.8, q = (uu, vv) => [tp[0] + Math.cos(psi) * uu - Math.sin(psi) * vv, tp[1] + Math.sin(psi) * uu + Math.cos(psi) * vv];
  if (tool === "Skopa") mcScoop(c, q, bw, 0.75, null, (x, y, z) => [x, y, z], smF(p, "last", "Tom"), "#4b5563");
  else if (tool === "Pallgafflar") { c.box("#4b5563", ...(() => { const r = q(0.05, 0.3); return [r[0], 0, r[1]]; })(), 0.1, bw, 1.0, null, 0.02, SMM); [-1, 1].forEach(sd => { const a = q(0.1, -0.2), b = q(1.2, -0.2); c.beam("#6b7280", [a[0], sd * 0.55, a[1]], [b[0], sd * 0.55, b[1]], 0.12, 0.06, SMM); }); }
  else { const a = q(0.1, 0.0), b = q(0.9, -0.1); c.box("#4b5563", a[0], 0, a[1], 0.2, 1.3, 0.8, null, 0.03, SMM); c.cyl("#9ca3af", "z", b[0], 0, b[1], 0.55, 0.55, 0.9, 16, null, SMM); }                               // jordborr
  mcLamp(c, 1.0, 0.45, 1.5, 0.25); mcLamp(c, 1.0, -0.45, 1.5, 0.25);
  mcMachineCard(c, p, "Minilastare", [["Redskap", tool], ["Chassi", tracks ? "Band" : "Hjul"]], 3.2);
}
/* ---- Teleskoplastare: teleskopbom med vinkel och utskjut, gafflar/skopa/personkorg/vinsch, stödben ---- */
function mcTeleBuild(p, c) {
  const col = p.color || "#dc2626", tool = smF(p, "redskap", "Pallgafflar"), a = smN(p, "bom", 30) * Math.PI / 180, ext = smN(p, "utskjut", 30) / 100, stod = smF(p, "stod", "Nej") === "Ja", curl = smN(p, "redskapsvinkel", 0) * Math.PI / 180;
  c.box("#2c3138", 0, 0, 0.85, 4.2, 1.5, 0.55, null, 0.08, { rough: 0.7 }); [-1, 1].forEach(sx => [-1, 1].forEach(sd => mcTire(c, sx * 1.5, sd * 1.05, 0.78, 0.5))); c.box(col, -0.9, 0.0, 1.55, 1.9, 1.35, 1.0, null, 0.12, { shin: 70 });
  mcCab(c, 0.7, -0.55, 1.25, 1.2, 0.95, 1.55, col); c.rod("#374151", [-1.2, 0.5, 2.0], [-1.2, 0.5, 3.0], 0.05, 0.05, 8, SMM); mcBeacon(c, 0.7, -0.55, 2.85); mcLamp(c, 2.0, 0.6, 1.2, 0.25); mcLamp(c, 2.0, -0.6, 1.2, 0.25);
  if (stod) [-1, 1].forEach(sd => [-1, 1].forEach(sx => { c.rod("#9ca3af", [sx * 1.5, sd * 0.9, 0.9], [sx * 1.6, sd * 1.5, 0.05], 0.06, 0.06, 8, SMM); c.box("#374151", sx * 1.6, sd * 1.5, 0.03, 0.4, 0.4, 0.05, null, 0.01, SMM); }));
  const piv = [-1.2, 1.75], L0 = 3.3, L1 = L0 + ext * 3.3, d = [Math.cos(a), Math.sin(a)], mid = [piv[0] + d[0] * L0, piv[1] + d[1] * L0], tip = [piv[0] + d[0] * L1, piv[1] + d[1] * L1];
  const T = (x, z, y = 0.45) => [x, y, z]; c.beam(col, T(piv[0], piv[1]), T(...mid), 0.42, 0.5, { shin: 70 }); c.beam("#e5e7eb", T(mid[0] - d[0] * 0.2, mid[1] - d[1] * 0.2), T(...tip), 0.34, 0.4, { shin: 70 }); c.cyl("#3b4047", "y", piv[0], 0.45, piv[1], 0.14, 0.14, 0.5, 12, null, SMM);
  mcRodCyl(c, T(-0.4, 0.95), T(piv[0] + d[0] * 1.4, piv[1] + d[1] * 1.4 - 0.2), 0.09);
  const psi = -curl - 0.05, q = (uu, vv) => [tip[0] + Math.cos(psi) * uu - Math.sin(psi) * vv, tip[1] + Math.sin(psi) * uu + Math.cos(psi) * vv]; const o = q(0, 0);
  if (tool === "Pallgafflar") { const a0 = q(0.1, -0.5); c.box("#4b5563", ...T(a0[0], a0[1] + 0.4, 0.45), 0.1, 1.6, 0.9, null, 0.02, SMM); [-1, 1].forEach(sd => { const A0 = q(0.1, -0.55), B0 = q(1.4, -0.6); c.beam("#6b7280", T(A0[0], A0[1], 0.45 + sd * 0.55), T(B0[0], B0[1], 0.45 + sd * 0.55), 0.14, 0.07, SMM); }); }
  else if (tool === "Skopa") mcExtrude(c, "#4b5563", [q(0.1, -0.5), q(0.5, -0.9), q(1.1, -0.85), q(1.4, -0.3), q(1.2, 0.2), q(0.4, 0.1)], -1.1 + 0.45, 1.1 + 0.45, "y", { metal: 0.5, rough: 0.55 });
  else if (tool === "Personkorg") { const b0 = q(0.3, -1.3); c.box("#e5e7eb", b0[0] + 0.5, 0.45, b0[1], 1.4, 2.2, 0.1, null, 0.02, SMM); [-1, 1].forEach(sd => { c.beam("#f59e0b", T(b0[0] - 0.2, b0[1], 0.45 + sd * 1.1), T(b0[0] + 1.2, b0[1], 0.45 + sd * 1.1), 0.05, 0.05, SMM); c.beam("#f59e0b", T(b0[0] - 0.2, b0[1] + 1.1, 0.45 + sd * 1.1), T(b0[0] + 1.2, b0[1] + 1.1, 0.45 + sd * 1.1), 0.05, 0.05, SMM); [-0.2, 1.2].forEach(x => c.rod("#f59e0b", [b0[0] + x, 0.45 + sd * 1.1, b0[1]], [b0[0] + x, 0.45 + sd * 1.1, b0[1] + 1.1], 0.03, 0.03, 8, SMM)); }); }
  else { c.box("#4b5563", o[0] + 0.05, 0.45, o[1] - 0.1, 0.3, 0.3, 0.4, null, 0.04, SMM); c.rod("#1f2937", T(o[0] + 0.1, o[1] - 0.2), T(o[0] + 0.1, o[1] - 2.4), 0.012, 0.012, 4, SMM); c.box("#f59e0b", o[0] + 0.1, 0.45, o[1] - 2.5, 0.2, 0.15, 0.25, null, 0.03); }       // vinschkrok
  mcMachineCard(c, p, "Teleskoplastare", [["Redskap", tool], ["Utskjut", smFmt(L1, 1) + " m"], ["Stödben", stod ? "Utfällda" : "Inne"]], 4.3);
}
/* ---- Gaffeltruck: mast som höjs, gafflar, last (pall/betongelement) ---- */
function mcTruckLiftBuild(p, c) {
  const col = p.color || "#f59e0b", h = smN(p, "lyft", 40) / 100, load = smF(p, "last", "Pall"), mast = smN(p, "mast", 4.5), z = 0.15 + h * (mast - 1.4);
  c.box(col, -0.35, 0, 0.75, 1.7, 1.15, 0.65, null, 0.12, { shin: 70 }); c.box("#2c3138", 0.55, 0, 0.55, 1.2, 1.1, 0.35, null, 0.05, { rough: 0.7 }); [-1, 1].forEach(sd => { mcTire(c, 0.7, sd * 0.55, 0.33, 0.28); mcTire(c, -0.9, sd * 0.42, 0.27, 0.22); });
  [-1, 1].forEach(sx => [-1, 1].forEach(sd => c.rod("#374151", [sx * 0.35 - 0.15, sd * 0.5, 1.1], [sx * 0.35 - 0.15, sd * 0.5, 2.1], 0.03, 0.03, 8, SMM))); c.box("#374151", -0.15, 0, 2.12, 1.0, 1.1, 0.04, null, 0.02, SMM); c.box("#1f2937", -0.1, 0, 1.15, 0.5, 0.45, 0.2, null, 0.05, SMM); mcBeacon(c, -0.15, 0, 2.18); c.box("#f8fafc", -1.2, 0, 0.75, 0.04, 0.5, 0.3, null, 0.01, SMLIT);
  [-1, 1].forEach(sd => { c.beam("#4b5563", [1.15, sd * 0.4, 0.1], [1.15, sd * 0.4, mast + 0.1], 0.12, 0.12, SMM); c.beam("#6b7280", [1.22, sd * 0.38, 0.1], [1.22, sd * 0.38, 0.1 + (mast - 0.5) * (0.5 + h * 0.5)], 0.1, 0.1, SMM); });
  c.beam("#4b5563", [1.15, -0.4, mast + 0.1], [1.15, 0.4, mast + 0.1], 0.1, 0.1, SMM); c.box("#4b5563", 1.35, 0, z + 0.4, 0.08, 1.1, 0.8, null, 0.02, SMM); [-1, 1].forEach(sd => c.beam("#6b7280", [1.4, sd * 0.35, z + 0.03], [2.5, sd * 0.35, z + 0.03], 0.14, 0.06, SMM));
  if (load === "Pall") { c.box("#c9a15f", 1.95, 0, z + 0.17, 1.2, 0.8, 0.14, null, 0.01, { rough: 0.9 }); c.box("#e5e7eb", 1.95, 0, z + 0.7, 1.1, 0.75, 0.9, null, 0.05, { rough: 0.8 }); c.box("#9ca3af", 1.95, 0, z + 0.7, 1.12, 0.77, 0.04, null, 0, SMM); }
  else if (load === "Betongelement") c.box("#b8bcc2", 1.95, 0, z + 0.65, 1.9, 0.8, 0.9, null, 0.03, { rough: 1 });
  c.box("#9ca3af", -1.2, 0, 1.0, 0.5, 1.0, 0.7, null, 0.1, SMM);
  mcMachineCard(c, p, "Gaffeltruck", [["Lyfthöjd", smFmt(z + 0.1, 1) + " m"], ["Last", load]], mast + 1);
}
Object.assign(SM, {
  minilastare: { group: "Maskiner", label: "Minilastare", color: "#f59e0b", L: 3.2, B: 1.9, H: 2.1, icon: "truck", build: mcSkidBuild,
    fields: [["chassi", "Chassi", ["Hjul", "Band"], "Hjul", { seg: true }], ["redskap", "Redskap", ["Skopa", "Pallgafflar", "Jordborr"], "Skopa"], ["last", "Last i skopan", ["Tom", "Grus", "Jord", "Sprängsten", "Sand"], "Tom"], ["lyft", "Lyfthöjd", "range", 35, { min: 0, max: 100, step: 1, unit: "%" }], ["skopa", "Skopvinkel", "range", 10, { min: -30, max: 70, step: 1, unit: "°" }]],
    groups: [["Maskin", ["chassi", "redskap", "last"]], ["Position", ["lyft", "skopa"]]] },
  teleskoplastare: { group: "Maskiner", label: "Teleskoplastare", color: "#dc2626", L: 5, B: 2.2, H: 2.6, icon: "crane", build: mcTeleBuild,
    fields: [["redskap", "Redskap", ["Pallgafflar", "Skopa", "Personkorg", "Vinsch/krok"], "Pallgafflar"], ["bom", "Bomvinkel", "range", 30, { min: 0, max: 70, step: 1, unit: "°" }], ["utskjut", "Utskjut", "range", 30, { min: 0, max: 100, step: 1, unit: "%" }], ["redskapsvinkel", "Redskapets vinkel", "range", 0, { min: -30, max: 40, step: 1, unit: "°" }], ["stod", "Stödben", ["Nej", "Ja"], "Nej", { seg: true }]],
    groups: [["Maskin", ["redskap", "stod"]], ["Position", ["bom", "utskjut", "redskapsvinkel"]]] },
  gaffeltruck: { group: "Maskiner", label: "Gaffeltruck", color: "#f59e0b", L: 3.6, B: 1.3, H: 2.2, icon: "truck", build: mcTruckLiftBuild,
    fields: [["mast", "Masthöjd", "range", 4.5, { min: 3, max: 7, step: 0.5, unit: "m" }], ["lyft", "Lyfthöjd", "range", 40, { min: 0, max: 100, step: 1, unit: "%" }], ["last", "Last", ["Ingen", "Pall", "Betongelement"], "Pall"]],
    groups: [["Maskin", ["mast", "last"]], ["Position", ["lyft"]]] },
});

/* ---- Bandkran (gallerkran): gallerbom med vinkel och längd, kroklina, motvikt, band ---- */
function mcCrawlerCraneBuild(p, c) {
  const col = p.color || "#facc15", len = smN(p, "bomlangd", 36), a = smN(p, "bomvinkel", 65) * Math.PI / 180, sw = smN(p, "sving", 0) * Math.PI / 180, jib = smF(p, "spets", "Nej") === "Ja", cs = Math.cos(sw), sn = Math.sin(sw), R = [sw, 0, 0];
  const u = (x, y, z) => [x * cs - y * sn, x * sn + y * cs, z];
  [-1, 1].forEach(sd => mcTrack(c, 0, sd * 2.5, 7.0, 1.2, 1.5)); c.box("#2c3138", 0, 0, 1.0, 5.2, 4.6, 0.9, null, 0.1, { rough: 0.7 }); c.cyl("#3b4047", "z", 0, 0, 1.6, 1.9, 1.9, 0.3, 28, null, SMM);
  const ub = (colr, x, y, z, sx, sy, sz, r, o) => c.box(colr, ...u(x, y, z), sx, sy, sz, R, r, o);
  ub("#2c3138", 0, 0, 1.9, 6.0, 3.6, 0.3, 0.05, { rough: 0.75 }); ub(col, -1.8, 0, 2.7, 2.6, 3.3, 1.5, 0.25, { shin: 70 }); ub("#475569", -3.2, 0, 2.5, 1.6, 3.4, 1.2, 0.1, { metal: 0.3, rough: 0.7 });  // maskinhus + motvikt
  ub(col, 0.6, -1.1, 2.9, 2.4, 1.3, 1.5, 0.12, { shin: 70 }); { const cp = u(1.9, 1.35, 2.05); mcCab(c, cp[0], cp[1], cp[2], 1.5, 1.2, 1.9, col, R); }
  const bp = [1.6, 3.0], d = [Math.cos(a), Math.sin(a)], tip = [bp[0] + d[0] * len, bp[1] + d[1] * len], n = [-d[1], d[0]], wd = 1.3, T = (q, y) => u(q[0], y, q[1]);
  // gallerbom: fyra hörnrör + tvärstag i sicksack – avtagande bredd
  const sec = Math.max(4, Math.round(len / 2.2)), prof = k => { const t = k / sec, w = wd * (1 - 0.55 * t) * (t > 0.85 ? 0.7 : 1); return w; };
  for (let k = 0; k <= sec; k++) { const t = k / sec, q = [bp[0] + d[0] * len * t, bp[1] + d[1] * len * t], w = prof(k) / 2; if (k > 0) { const pq = [bp[0] + d[0] * len * (k - 1) / sec, bp[1] + d[1] * len * (k - 1) / sec], pw = prof(k - 1) / 2;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sy, sz]) => c.rod("#e5e7eb", T([pq[0] + n[0] * pw * sz, pq[1] + n[1] * pw * sz], pw * sy), T([q[0] + n[0] * w * sz, q[1] + n[1] * w * sz], w * sy), 0.07, 0.07, 6, SMM));
      c.rod(col, T([pq[0] + n[0] * pw, pq[1] + n[1] * pw], -pw), T([q[0] - n[0] * w, q[1] - n[1] * w], w), 0.035, 0.035, 5, SMM); c.rod(col, T([pq[0] - n[0] * pw, pq[1] - n[1] * pw], pw), T([q[0] + n[0] * w, q[1] + n[1] * w], -w), 0.035, 0.035, 5, SMM); }
    [[-1, 1]].forEach(() => { c.rod("#cbd5e1", T([q[0] + n[0] * w, q[1] + n[1] * w], -w), T([q[0] - n[0] * w, q[1] - n[1] * w], w), 0.03, 0.03, 5, SMM); }); }
  c.cyl("#3b4047", "y", ...T(bp, 0), 0.25, 0.25, 1.4, 12, R, SMM);
  // mast bakåt (A-ram) och stag
  const mast = [bp[0] - 1.2, bp[1] + 7.0]; [-1, 1].forEach(sy => { c.rod("#9ca3af", T([bp[0] - 0.9, bp[1] - 0.3], sy * 0.9), T(mast, sy * 0.35), 0.1, 0.07, 8, SMM); }); c.beam("#9ca3af", T(mast, -0.35), T(mast, 0.35), 0.2, 0.2, SMM);
  c.rod("#6b7280", T(mast, 0), T(tip, 0), 0.03, 0.03, 4, SMM); c.rod("#6b7280", T([mast[0], mast[1]], 0), T([-3.2, 2.3], 0), 0.04, 0.04, 6, SMM);
  const hook = [tip[0], Math.max(1.2, tip[1] - 9)]; c.rod("#1f2937", T(tip, 0), T(hook, 0), 0.025, 0.025, 5, SMM); c.box("#374151", ...T([hook[0], hook[1] - 0.3], 0), 0.5, 0.4, 0.6, R, 0.05, SMM); c.cyl("#f59e0b", "y", ...T([hook[0], hook[1] - 0.8], 0), 0.22, 0.22, 0.2, 10, R, SMM);
  if (jib) { const jl = 9, a2 = a - 0.45, j2 = [tip[0] + Math.cos(a2) * jl, tip[1] + Math.sin(a2) * jl]; c.beam("#e5e7eb", T(tip, 0), T(j2, 0), 0.35, 0.35, SMM); }
  mcMachineCard(c, p, "Bandkran", [["Bomlängd", smFmt(len, 0) + " m"], ["Bomvinkel", smFmt(a * 180 / Math.PI, 0) + "°"], ["Räckvidd", smFmt(Math.cos(a) * len + 1.6, 1) + " m"]], 4.5);
}
/* ---- Borrigg / pålmaskin: bandgående med hög mast, borr/auger, vinkel ---- */
function mcDrillBuild(p, c) {
  const col = p.color || "#2563eb", typ = smF(p, "typ", "Pålmaskin (CFA)"), mastH = smN(p, "mast", 18), tilt = smN(p, "lutning", 0) * Math.PI / 180, depth = smN(p, "borr", 40) / 100, sw = smN(p, "sving", 0) * Math.PI / 180, cs = Math.cos(sw), sn = Math.sin(sw), R = [sw, 0, 0], u = (x, y, z) => [x * cs - y * sn, x * sn + y * cs, z];
  [-1, 1].forEach(sd => mcTrack(c, 0, sd * 1.7, 5.2, 0.9, 1.1)); c.box("#2c3138", 0, 0, 0.8, 4.2, 2.8, 0.7, null, 0.08, { rough: 0.7 }); c.cyl("#3b4047", "z", 0, 0, 1.2, 1.3, 1.3, 0.2, 24, null, SMM);
  const ub = (colr, x, y, z, sx, sy, sz, r, o) => c.box(colr, ...u(x, y, z), sx, sy, sz, R, r, o);
  ub("#2c3138", -0.2, 0, 1.45, 4.4, 2.8, 0.25, 0.04, { rough: 0.75 }); ub(col, -1.6, 0, 2.2, 1.8, 2.6, 1.3, 0.2, { shin: 70 }); ub("#475569", -2.8, 0, 2.0, 1.0, 2.6, 1.0, 0.1, { metal: 0.3, rough: 0.7 }); { const cp = u(0.7, 1.1, 1.55); mcCab(c, cp[0], cp[1], cp[2], 1.4, 1.1, 1.8, col, R); }
  // mast (leader) på bom framför maskinen
  const foot = [2.3, 1.7], top = [foot[0] + Math.sin(tilt) * mastH, foot[1] + Math.cos(tilt) * mastH], T = (q, y = 0) => u(q[0], y, q[1]);
  [-1, 1].forEach(sy => c.beam("#cbd5e1", T(foot, sy * 0.35), T(top, sy * 0.35), 0.16, 0.2, SMM)); for (let k = 0; k <= mastH; k += 1.5) { const q = [foot[0] + Math.sin(tilt) * k, foot[1] + Math.cos(tilt) * k]; c.rod("#9ca3af", T(q, -0.35), T(q, 0.35), 0.03, 0.03, 5, SMM); }
  c.rod(col, T([0.2, 1.8], 0), T([foot[0], foot[1] + 1.2], 0), 0.2, 0.2, 10, SMM); mcRodCyl(c, T([-0.4, 1.6], 0.5), T([foot[0] + Math.sin(tilt) * 4, foot[1] + Math.cos(tilt) * 4], 0.5), 0.12);
  const dz = 0.9 + (mastH - 3.2) * (1 - depth), hd = [foot[0] + Math.sin(tilt) * dz, foot[1] + Math.cos(tilt) * dz]; c.box("#374151", ...T(hd, 0), 0.8, 0.9, 1.0, R, 0.06, SMM);                                      // roterande borrhuvud
  const aug = (typ.startsWith("Pål") ? 0.3 : 0.12), bot = [foot[0] - Math.sin(tilt) * 3.5 + Math.sin(tilt) * 0, 0.0], endP = [foot[0] + Math.sin(tilt) * 0.2, 0.15];
  if (typ.startsWith("Pål")) { c.rod("#9ca3af", T(hd, 0), T(endP, 0), aug, aug, 10, SMM); for (let k = 0; k < 9; k++) { const t = k / 9, q = [hd[0] + (endP[0] - hd[0]) * t, hd[1] + (endP[1] - hd[1]) * t]; c.cyl("#6b7280", "z", ...T(q, 0), aug * 1.5, aug * 1.5, 0.05, 10, R, SMM); } }
  else { c.rod("#9ca3af", T(hd, 0), T(endP, 0), 0.09, 0.09, 8, SMM); c.cyl("#475569", "z", ...T([endP[0], 0.4], 0), 0.2, 0.28, 0.5, 12, R, SMM); }
  mcBeacon(c, ...(() => { const q = u(0.7, 1.1, 3.5); return q; })());
  mcMachineCard(c, p, typ, [["Masthöjd", smFmt(mastH, 0) + " m"], ["Lutning", smFmt(tilt * 180 / Math.PI, 0) + "°"], ["Borrdjup", smFmt(depth * (mastH - 3), 1) + " m"]], mastH + 1.5);
}
/* ---- Asfaltutläggare: lastbilsmatning, snigel och bom (screed) ---- */
function mcPaverBuild(p, c) {
  const col = p.color || "#facc15", W = smN(p, "bredd", 3.5);
  [-1, 1].forEach(sd => mcTrack(c, 0.1, sd * 1.1, 3.4, 0.55, 0.75)); c.box("#2c3138", 0.1, 0, 0.7, 3.0, 2.0, 0.6, null, 0.08, { rough: 0.7 });
  { const HM = { rough: 0.8 }, hw = 2.8;   // matarficka (hopper): öppen med botten, bak- och framvägg (sidovingarna nedan)
    c.beam("#374151", [1.0, 0, 1.0], [2.3, 0, 1.0], hw, 0.06, HM); c.beam("#374151", [2.3, 0, 1.0], [2.5, 0, 1.5], hw, 0.06, HM); c.beam("#374151", [2.5, 0, 1.5], [2.5, 0, 2.4], hw, 0.06, HM); c.beam("#374151", [1.0, 0, 1.0], [1.0, 0, 2.0], hw, 0.06, HM);
    c.box("#1f2328", 1.7, 0, 1.12, 2.2, 2.7, 0.14, null, 0.04, { rough: 1 }); }
  [-1, 1].forEach(sd => mcExtrude(c, "#4b5563", [[1.0, 1.0], [2.5, 1.5], [2.7, 2.7], [2.45, 2.7], [1.0, 2.0]], sd * 1.45 - 0.04, sd * 1.45 + 0.04, "y", { rough: 0.8 }));
  c.box(col, -0.8, 0, 1.45, 1.8, 1.8, 0.9, null, 0.15, { shin: 70 }); c.box("#374151", -0.5, 0, 2.25, 1.3, 1.2, 0.07, null, 0.02, SMM); [-1, 1].forEach(sx => [-1, 1].forEach(sy => c.rod("#374151", [sx * 0.5 - 0.5, sy * 0.5, 1.9], [sx * 0.5 - 0.5, sy * 0.5, 3.2], 0.03, 0.03, 8, SMM))); c.box("#374151", -0.5, 0, 3.25, 1.4, 1.3, 0.06, null, 0.02, SMM); c.box("#374151", -0.7, 0, 1.95, 0.5, 0.45, 0.25, null, 0.05, SMM); mcBeacon(c, -0.5, 0, 3.3);
  c.box("#4b5563", -1.9, 0, 0.55, 0.9, W, 0.55, null, 0.05, SMM); c.box("#111827", -2.4, 0, 0.3, 0.2, W, 0.14, null, 0.02);                                                  // snigelkåpa, bom (screed)
  [-1, 1].forEach(sd => c.beam("#6b7280", [-0.2, sd * 1.0, 0.7], [-2.0, sd * (W / 2 - 0.2), 0.5], 0.14, 0.14, SMM)); c.cyl("#9ca3af", "x", -1.9, 0, 0.9, 0.2, 0.2, W * 0.9, 10, null, SMM);
  mcMachineCard(c, p, "Asfaltutläggare", [["Läggbredd", smFmt(W, 1) + " m"]], 3.6);
}
/* ---- Traktorgrävare (hjulgående med lastare fram och grävarm bak) ---- */
function mcBackhoeBuild(p, c) {
  const col = p.color || "#f59e0b", a = smN(p, "bom", 30) * Math.PI / 180, d = smN(p, "stick", 110) * Math.PI / 180, tc = smN(p, "skopa", 20) * Math.PI / 180, lift = smN(p, "lyft", 15) / 100, stod = smF(p, "stod", "Utfällda") === "Utfällda";
  c.box("#2c3138", 0, 0, 0.8, 3.8, 1.5, 0.6, null, 0.08, { rough: 0.7 }); mcTire(c, 1.35, 1.1, 0.7, 0.5); mcTire(c, 1.35, -1.1, 0.7, 0.5); mcTire(c, -1.1, 1.1, 0.55, 0.45); mcTire(c, -1.1, -1.1, 0.55, 0.45);
  c.box(col, 0.6, 0, 1.5, 1.6, 1.4, 0.8, null, 0.15, { shin: 70 }); mcCab(c, -0.4, 0, 1.2, 1.5, 1.6, 1.8, col); mcBeacon(c, -0.4, 0, 3.0);
  // frontlastare
  const Pf = [1.4, 1.3], A = (-5 + lift * 70) * Math.PI / 180, tip = [Pf[0] + Math.cos(A) * 2.2 + 0.7, Pf[1] + Math.sin(A) * 2.2]; [-1, 1].forEach(sd => c.beam(col, [Pf[0], sd * 0.9, Pf[1]], [tip[0], sd * 0.9, tip[1]], 0.15, 0.3, { shin: 70 }));
  const psi = -tc * 0.5 - 0.2, q = (uu, vv) => [tip[0] + Math.cos(psi) * uu - Math.sin(psi) * vv, tip[1] + Math.sin(psi) * uu + Math.cos(psi) * vv]; mcScoop(c, q, 2.3, 0.85, null, (x, y, z) => [x, y, z], smF(p, "last", "Tom"), "#4b5563");
  // grävarm bak med utfällbara stödben
  const bpv = [-2.0, 1.7], Lb = 3.4, Ls = 2.4, dir = ang => [Math.cos(ang), Math.sin(ang)], ba = Math.PI - a, P1 = [bpv[0] + Math.cos(ba) * Lb, bpv[1] + Math.sin(ba) * Lb], phi = ba + (Math.PI - d) * -1 + 0, P2 = [P1[0] + Math.cos(phi) * Ls, P1[1] + Math.sin(phi) * Ls];
  c.box("#4b5563", -2.0, 0, 1.4, 0.7, 1.0, 1.2, null, 0.08, SMM); c.beam(col, [bpv[0], 0, bpv[1]], [(bpv[0] + P1[0]) / 2, 0, (bpv[1] + P1[1]) / 2 + 0.25], 0.32, 0.4, { shin: 70 }); c.beam(col, [(bpv[0] + P1[0]) / 2, 0, (bpv[1] + P1[1]) / 2 + 0.25], [P1[0], 0, P1[1]], 0.3, 0.34, { shin: 70 }); c.beam(col, [P1[0], 0, P1[1]], [P2[0], 0, P2[1]], 0.22, 0.28, { shin: 70 });
  mcRodCyl(c, [-1.6, 0, 1.4], [P1[0] * 0.5 + bpv[0] * 0.5, 0, (bpv[1] + P1[1]) / 2 - 0.2], 0.07); const psi2 = phi - 0.9 - tc, q2 = (uu, vv) => [P2[0] + Math.cos(psi2) * uu - Math.sin(psi2) * vv, P2[1] + Math.sin(psi2) * uu + Math.cos(psi2) * vv];
  mcScoop(c, q2, 0.65, 0.5, null, (x, y, z) => [x, y, z], "Tom", "#4b5563");
  [-1, 1].forEach(sd => { const sx = stod ? 1.9 : 1.1; c.beam("#6b7280", [-2.0, sd * 0.7, 0.9], [-2.0, sd * sx, 0.9], 0.2, 0.2, SMM); c.rod("#9ca3af", [-2.0, sd * sx, 0.9], [-2.0, sd * sx, stod ? 0.05 : 0.4], 0.07, 0.07, 8, SMM); if (stod) c.box("#374151", -2.0, sd * sx, 0.03, 0.5, 0.5, 0.05, null, 0.01, SMM); });
  mcLamp(c, 2.1, 0.55, 1.5, 0.25); mcLamp(c, 2.1, -0.55, 1.5, 0.25);
  mcMachineCard(c, p, "Traktorgrävare", [["Stödben", stod ? "Utfällda" : "Inne"]], 3.4);
}
/* ---- Bandschaktare (bulldozer) med blad och rippertand ---- */
function mcDozerBuild(p, c) {
  const col = p.color || "#facc15", bl = smN(p, "blad", 0) / 100, ang = smN(p, "bladvinkel", 0) * Math.PI / 180, rip = smF(p, "ripper", "Ja") === "Ja";
  [-1, 1].forEach(sd => mcTrack(c, 0, sd * 1.15, 3.8, 0.65, 1.2)); c.box("#2c3138", 0, 0, 0.9, 3.2, 1.9, 0.7, null, 0.08, { rough: 0.7 });
  c.box(col, 0.7, 0, 1.6, 2.0, 1.6, 0.9, null, 0.15, { shin: 70 }); c.box("#111827", 1.72, 0, 1.55, 0.03, 1.0, 0.35, null, 0.01); mcCab(c, -0.7, 0, 1.25, 1.5, 1.5, 1.8, col); mcBeacon(c, -0.7, 0, 3.05); c.rod("#374151", [1.2, 0.5, 2.0], [1.2, 0.5, 3.0], 0.05, 0.05, 8, SMM);
  const z = 0.5 + bl * 0.8, bz = z + 0.55, yaw = ang; const cs = Math.cos(yaw), sn = Math.sin(yaw);
  mcExtrude(c, col, [[-0.2, -0.45], [0.0, 0.45], [0.2, 0.5], [0.2, -0.45]], -1.95, 1.95, "y", { shin: 70 }, [yaw, 0, 0], [2.7, 0, z + 0.45]); [-1, 1].forEach(sd => c.beam("#6b7280", [1.4, sd * 1.0, 0.9], [2.55, sd * 1.0 + Math.sin(yaw) * sd * 0.2, z + 0.45], 0.22, 0.22, SMM));
  c.beam("#9ca3af", [2.9 - Math.sin(yaw) * 1.95, -1.95 * Math.cos(yaw), z], [2.9 + Math.sin(yaw) * 1.95, 1.95 * Math.cos(yaw), z], 0.1, 0.1, SMM); void bz; void cs; void sn;
  if (rip) { c.box("#4b5563", -2.3, 0, 1.0, 0.6, 1.8, 0.7, null, 0.06, SMM); [-0.6, 0, 0.6].forEach(y => c.beam("#6b7280", [-2.3, y, 1.1], [-2.8, y, 0.15], 0.15, 0.18, SMM)); }
  mcMachineCard(c, p, "Bandschaktare", [["Blad", bl > 0.5 ? "Upplyft" : "Nere"], ["Ripper", rip ? "Ja" : "Nej"]], 3.4);
}
/* ---- Väghyvel (grader): lång ram, stort hyvelblad mellan axlarna ---- */
function mcGraderBuild(p, c) {
  const col = p.color || "#facc15", ba = smN(p, "bladvinkel", 25) * Math.PI / 180, bz = smN(p, "bladhojd", 30) / 100, STEEL = { metal: 0.6, rough: 0.5 };
  // chassi: ramen stiger framåt, framaxel med lutbara hjul, boggi bak
  c.box("#2c3138", -0.2, 0, 1.3, 6.6, 0.7, 0.35, null, 0.05, { rough: 0.7 }); c.beam("#2c3138", [2.9, 0, 1.3], [3.3, 0, 1.0], 0.7, 0.35, { rough: 0.7 });
  [-1, 1].forEach(sd => { mcTire(c, 3.2, sd * 1.05, 0.65, 0.45); c.box("#3b4047", 3.2, sd * 0.6, 0.95, 0.2, 0.7, 0.2, null, 0.03, SMM); [-3.3, -1.7].forEach(x => { mcTire(c, x, sd * 1.12, 0.7, 0.5); c.box("#3b4047", x, sd * 0.7, 0.95, 0.3, 0.7, 0.2, null, 0.03, SMM); }); c.box("#2c3138", -2.5, sd * 0.78, 1.15, 1.9, 0.18, 0.5, null, 0.04, { rough: 0.7 }); });
  c.cyl("#3b4047", "y", 3.2, 0, 0.65, 0.1, 0.1, 2.2, 8, null, SMM); [-3.3, -1.7].forEach(x => c.cyl("#3b4047", "y", x, 0, 0.7, 0.1, 0.1, 2.3, 8, null, SMM));
  // motor bak, hytt över ramen, avgasrör, kyl
  c.box(col, -3.9, 0, 2.0, 2.2, 2.3, 1.2, null, 0.22, { shin: 70 }); c.box("#111827", -5.02, 0, 2.0, 0.04, 1.6, 0.6, null, 0.01); for (let i = 0; i < 4; i++) c.box("#0f1215", -5.03, 0, 1.75 + i * 0.12, 0.02, 1.7, 0.05, null, 0);
  c.cyl("#374151", "z", -3.3, 0.9, 3.0, 0.08, 0.08, 1.4, 8, null, SMM);
  mcCab(c, -1.9, 0, 1.55, 1.9, 1.9, 2.0, col); mcBeacon(c, -1.9, 0, 3.62); c.box(col, 2.5, 0, 1.6, 1.2, 0.8, 0.55, null, 0.1, { shin: 70 }); mcLamp(c, 3.1, 0.35, 1.9, 0.25); mcLamp(c, 3.1, -0.35, 1.9, 0.25);
  // dragstång (A-ram), cirkel och blad
  const cx = 0.1, cy = 0, z = 0.55 + bz * 0.55, L = 3.7, sa = Math.sin(ba), ca = Math.cos(ba);
  [-1, 1].forEach(sd => c.beam("#6b7280", [2.5, sd * 0.1, 1.2], [cx + 0.3, sd * 0.55, z + 0.45], 0.14, 0.2, SMM)); c.cyl("#3b4047", "z", 2.5, 0, 1.2, 0.2, 0.2, 0.3, 12, null, SMM);
  c.cyl("#4b5563", "z", cx, cy, z + 0.4, 1.0, 1.0, 0.14, 28, null, STEEL); c.cyl("#1f2937", "z", cx, cy, z + 0.48, 0.82, 0.82, 0.05, 28);                                              // cirkeln
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.box("#9ca3af", cx + Math.cos(a) * 0.91, cy + Math.sin(a) * 0.91, z + 0.48, 0.06, 0.06, 0.06, null, 0.005, SMM); }
  const bladeAt = [cx, cy, z], bp = [[-0.14, -0.32], [0.03, -0.28], [0.15, 0.0], [0.13, 0.32], [0.02, 0.46], [-0.03, 0.43], [0.08, 0.3], [0.1, 0.0], [0.02, -0.24], [-0.16, -0.3]];
  mcExtrude(c, "#6b7280", bp, -L / 2, L / 2, "y", STEEL, [-ba, 0, 0], bladeAt);                                                                                                  // krökt skär
  c.beam("#d1d5db", [cx + sa * -L / 2 - ca * 0.15, cy - ca * L / 2 + sa * 0.15 * 0, z - 0.3], [cx + sa * L / 2 - ca * 0.15, cy + ca * L / 2, z - 0.3], 0.1, 0.07, SMM);              // skäreggen
  [-1, 1].forEach(sd => { const e = [cx + sa * sd * L / 2, cy + ca * sd * L / 2]; c.box("#4b5563", e[0], e[1], z + 0.05, 0.12, 0.12, 0.7, [-ba, 0, 0], 0.02, STEEL); });
  [-1, 1].forEach(sd => { const e = [cx + sa * sd * L * 0.4, cy + ca * sd * L * 0.4]; mcRodCyl(c, [1.6, sd * 0.35, 1.3], [e[0], e[1], z + 0.4], 0.07); });                                                   // lyftcylindrar
  c.box("#6b7280", 3.9, 0, 0.6, 0.4, 1.8, 0.5, null, 0.05, SMM);                                                                                                                  // frontvikt
  mcMachineCard(c, p, "Väghyvel", [["Bladvinkel", smFmt(ba * 180 / Math.PI, 0) + "°"]], 3.6);
}
Object.assign(SM, {
  bandkran: { group: "Maskiner", label: "Bandkran", color: "#facc15", L: 8, B: 5, H: 4, icon: "crane", build: mcCrawlerCraneBuild,
    fields: [["bomlangd", "Bomlängd", "range", 36, { min: 12, max: 70, step: 2, unit: "m" }], ["bomvinkel", "Bomvinkel", "range", 65, { min: 25, max: 85, step: 1, unit: "°" }], ["sving", "Sväng", "range", 0, { min: -180, max: 180, step: 5, unit: "°" }], ["spets", "Hjälpbom (jib)", ["Nej", "Ja"], "Nej", { seg: true }]],
    groups: [["Kran", ["bomlangd", "spets"]], ["Position", ["bomvinkel", "sving"]]] },
  borrigg: { group: "Maskiner", label: "Borrigg / pålmaskin", color: "#2563eb", L: 6, B: 3.4, H: 18, icon: "crane", build: mcDrillBuild,
    fields: [["typ", "Typ", ["Pålmaskin (CFA)", "Borrigg (berg)"], "Pålmaskin (CFA)"], ["mast", "Masthöjd", "range", 18, { min: 8, max: 32, step: 1, unit: "m" }], ["borr", "Borrdjup", "range", 40, { min: 0, max: 100, step: 1, unit: "%" }], ["lutning", "Mastlutning", "range", 0, { min: -20, max: 20, step: 1, unit: "°" }], ["sving", "Sväng", "range", 0, { min: -180, max: 180, step: 5, unit: "°" }]],
    groups: [["Maskin", ["typ", "mast"]], ["Position", ["borr", "lutning", "sving"]]] },
  asfaltutlaggare: { group: "Maskiner", label: "Asfaltutläggare", color: "#facc15", L: 5, B: 3.5, H: 3.3, icon: "truck", build: mcPaverBuild, fields: [["bredd", "Läggbredd", "range", 3.5, { min: 2, max: 9, step: 0.1, unit: "m" }]], groups: [["Maskin", ["bredd"]]] },
  traktorgravare: { group: "Maskiner", label: "Traktorgrävare", color: "#f59e0b", L: 6, B: 2.5, H: 3.2, icon: "crane", build: mcBackhoeBuild,
    fields: [["last", "Last i skopan", ["Tom", "Grus", "Jord", "Sprängsten", "Sand"], "Tom"], ["bom", "Grävarm, bom", "range", 30, { min: -10, max: 70, step: 1, unit: "°" }], ["stick", "Grävarm, stick", "range", 110, { min: 50, max: 170, step: 1, unit: "°" }], ["skopa", "Grävskopa", "range", 20, { min: -30, max: 80, step: 1, unit: "°" }], ["lyft", "Frontskopa, lyft", "range", 15, { min: 0, max: 100, step: 1, unit: "%" }], ["stod", "Stödben", ["Utfällda", "Inne"], "Utfällda", { seg: true }]],
    groups: [["Grävarm", ["bom", "stick", "skopa"]], ["Övrigt", ["last", "lyft", "stod"]]] },
  bandschaktare: { group: "Maskiner", label: "Bandschaktare", color: "#facc15", L: 5.5, B: 3.9, H: 3.2, icon: "truck", build: mcDozerBuild,
    fields: [["blad", "Bladhöjd", "range", 0, { min: 0, max: 100, step: 1, unit: "%" }], ["bladvinkel", "Bladvinkel", "range", 0, { min: -25, max: 25, step: 1, unit: "°" }], ["ripper", "Ripper", ["Ja", "Nej"], "Ja", { seg: true }]], groups: [["Maskin", ["ripper"]], ["Position", ["blad", "bladvinkel"]]] },
  vaghyvel: { group: "Maskiner", label: "Väghyvel", color: "#facc15", L: 9, B: 2.6, H: 3.5, icon: "truck", build: mcGraderBuild,
    fields: [["bladvinkel", "Bladvinkel", "range", 25, { min: -45, max: 45, step: 1, unit: "°" }], ["bladhojd", "Bladhöjd", "range", 30, { min: 0, max: 100, step: 1, unit: "%" }]], groups: [["Position", ["bladvinkel", "bladhojd"]]] },
});

/* ---- Aggregat: elverk, kompressor, värmeaggregat och ljusmast på kärra ---- */
function mcGenBuild(p, c) {
  const typ = smF(p, "typ", "Elverk"), col = p.color || ({ Elverk: "#16a34a", Kompressor: "#f59e0b", Värmeaggregat: "#dc2626", Ljusmast: "#475569" }[typ] || "#16a34a"), kw = smN(p, "effekt", 60);
  if (typ === "Ljusmast") {
    const h = smN(p, "mast", 9), tilt = smN(p, "lutning", 0) * Math.PI / 180; c.box("#374151", 0, 0, 0.45, 2.6, 1.4, 0.35, null, 0.05, SMM); [-1, 1].forEach(sx => [-1, 1].forEach(sy => mcTire(c, sx * 0.9, sy * 0.78, 0.3, 0.2))); c.box(col, -0.5, 0, 0.9, 1.1, 1.1, 0.7, null, 0.08, { shin: 60 });
    [-1, 1].forEach(sy => { c.rod("#9ca3af", [0.7, sy * 0.7, 0.55], [0.9, sy * 1.2, 0.05], 0.04, 0.04, 8, SMM); c.box("#374151", 0.9, sy * 1.2, 0.03, 0.3, 0.3, 0.05, null, 0.01, SMM); });
    const top = [Math.sin(tilt) * h, 0, 0.9 + Math.cos(tilt) * h], seg = 4; for (let k = 0; k < seg; k++) { const t0 = k / seg, t1 = (k + 1) / seg, r = 0.09 - k * 0.012; c.rod(k % 2 ? "#cbd5e1" : "#9ca3af", [top[0] * t0, 0, 0.9 + (top[2] - 0.9) * t0], [top[0] * t1, 0, 0.9 + (top[2] - 0.9) * t1], r, r - 0.012, 10, SMM); }
    c.beam("#374151", [top[0] - 0.9, 0, top[2]], [top[0] + 0.9, 0, top[2]], 0.12, 0.1, SMM); [-0.6, -0.2, 0.2, 0.6].forEach(dx => c.box("#fffbe6", top[0] + dx, 0.1, top[2] - 0.12, 0.28, 0.1, 0.22, null, 0.03, SMLIT));
    mcMachineCard(c, p, "Ljusmast", [["Masthöjd", smFmt(h, 0) + " m"]], h + 2); return;
  }
  const L = typ === "Värmeaggregat" ? 2.4 : 3.2, B = typ === "Värmeaggregat" ? 1.2 : 1.4, H = typ === "Elverk" ? 1.6 : 1.5;
  c.box("#2c3138", 0, 0, 0.35, L, B, 0.25, null, 0.04, { rough: 0.7 }); [-1, 1].forEach(sx => mcTire(c, sx * (L * 0.28), 0, 0.28, B + 0.15)); c.box("#9ca3af", L / 2 + 0.25, 0, 0.35, 0.7, 0.08, 0.06, null, 0.01, SMM); c.cyl("#9ca3af", "z", L / 2 + 0.6, 0, 0.3, 0.08, 0.08, 0.1, 8, null, SMM);
  c.box(col, 0, 0, 0.5 + H / 2, L - 0.1, B - 0.05, H, null, 0.08, { shin: 60 }); for (let i = 0; i < 6; i++) c.box("#00000030", -L / 2 + 0.5 + i * 0.35, B / 2 + 0.005, 0.5 + H * 0.5, 0.05, 0.01, H * 0.5, null, 0);
  c.box("#111827", L / 2 - 0.02, 0, 0.5 + H * 0.5, 0.03, B * 0.7, H * 0.6, null, 0.01); [0.3, 0.1, -0.1, -0.3].forEach(dy => c.cyl(dy === 0.3 ? "#dc2626" : "#374151", "x", L / 2 + 0.01, dy * B * 0.6, 0.5 + H * 0.75, 0.06, 0.06, 0.04, 10, null, SMM)); c.box("#f8fafc", L / 2 + 0.005, 0, 0.5 + H * 0.28, 0.01, B * 0.5, 0.2, null, 0, SMLIT);
  c.cyl("#374151", "z", -L / 2 + 0.3, 0.3, 0.5 + H + 0.35, 0.07, 0.07, 0.7, 8, null, SMM); mcBeacon(c, 0, -0.35, 0.5 + H + 0.02);
  if (typ === "Kompressor") { c.cyl("#9ca3af", "y", -0.3, 0, 0.5 + H + 0.25, 0.3, 0.3, B * 0.9, 16, null, SMM); c.cyl("#dc2626", "y", L / 2 - 0.1, B / 2 + 0.05, 0.5 + H * 0.4, 0.08, 0.08, 0.1, 10, null, SMLIT); }
  if (typ === "Värmeaggregat") c.cyl("#9ca3af", "x", -L / 2 - 0.35, 0, 0.5 + H * 0.5, 0.2, 0.2, 0.7, 14, null, SMM);
  mcMachineCard(c, p, typ, [typ === "Värmeaggregat" ? ["Effekt", kw + " kW"] : typ === "Elverk" ? ["Effekt", kw + " kVA"] : ["Kapacitet", kw * 10 + " l/min"]], 3);
}
/* ---- Mobilt krossverk / siktverk på band: matarficka, kross, transportband med vinkel ---- */
function mcCrusherBuild(p, c) {
  const typ = smF(p, "typ", "Backkross"), col = p.color || "#facc15", ba = smN(p, "band", 28) * Math.PI / 180, bl = smN(p, "bandlangd", 9), HOP = "#4b5563", STEEL = { metal: 0.6, rough: 0.5 };
  [-1, 1].forEach(sd => mcTrack(c, 0, sd * 1.3, 5.4, 0.7, 0.95)); c.box("#2c3138", 0, 0, 1.0, 5.6, 2.6, 0.5, null, 0.06, { rough: 0.7 });
  // inmatning: öppen ficka med sluttande sidor och grizzly-galler
  c.beam(HOP, [1.2, 0, 1.55], [2.6, 0, 1.55], 2.6, 0.06, { rough: 0.8 }); [-1, 1].forEach(sd => { mcExtrude(c, HOP, [[1.15, 1.55], [3.4, 1.7], [3.55, 3.2], [3.2, 3.6], [1.15, 3.0]], sd * 1.4 - 0.035, sd * 1.4 + 0.035, "y", { rough: 0.8 }); });
  c.beam(HOP, [3.4, 0, 1.7], [3.55, 0, 3.2], 2.8, 0.06, { rough: 0.8 }); c.beam(HOP, [1.15, 0, 1.55], [1.15, 0, 3.0], 2.8, 0.06, { rough: 0.8 });
  for (let i = 0; i < 10; i++) c.rod("#8b95a1", [1.6 + i * 0.2, -1.35, 2.2], [1.6 + i * 0.2, 1.35, 2.2], 0.025, 0.025, 5, SMM);                                                            // grizzly
  // kross: kraftig kåpa med käft, kvarn och drivning, motorhus bak
  c.box("#374151", 0.3, 0, 2.3, 1.6, 2.5, 1.7, null, 0.12, STEEL); c.box("#1f2937", 1.12, 0, 2.2, 0.06, 1.8, 1.0, null, 0.02); c.box(col, -1.0, 0, 2.5, 2.2, 2.6, 2.1, null, 0.15, { shin: 70 });
  [-1, 1].forEach(sd => { c.cyl("#6b7280", "y", 0.3, sd * 1.35, 2.2, 0.5, 0.5, 0.12, 18, null, SMM); c.cyl("#9ca3af", "y", 0.3, sd * 1.42, 2.2, 0.2, 0.2, 0.05, 12, null, SMM); });          // svänghjul
  for (let i = 0; i < 5; i++) c.box("#0f1215", -2.1, 0, 2.0 + i * 0.22, 0.04, 2.0, 0.07, null, 0.01, SMM); c.cyl("#374151", "z", -1.6, 0.9, 4.0, 0.09, 0.09, 1.0, 8, null, SMM);          // kylgaller + avgas
  // transportband bakåt/uppåt med gummiband, sidoplåtar, bockar och rullar
  const a0 = [-2.4, 1.3], d = [Math.cos(ba) * -1, Math.sin(ba)], a1 = [a0[0] + d[0] * bl, a0[1] + d[1] * bl];
  c.beam("#374151", [a0[0], 0, a0[1]], [a1[0], 0, a1[1]], 0.9, 0.2, { rough: 0.8 }); c.beam("#1f2937", [a0[0], 0, a0[1] + 0.12], [a1[0], 0, a1[1] + 0.12], 0.7, 0.03, { rough: 0.9 });
  [-1, 1].forEach(sd => { c.beam("#9ca3af", [a0[0], sd * 0.5, a0[1] + 0.05], [a1[0], sd * 0.5, a1[1] + 0.05], 0.04, 0.3, SMM); });
  const nr = Math.max(4, Math.round(bl / 0.8)); for (let i = 0; i < nr; i++) { const t = (i + 0.5) / nr, x = a0[0] + d[0] * bl * t, z = a0[1] + d[1] * bl * t; c.cyl("#6b7280", "y", x, 0, z + 0.15, 0.06, 0.06, 0.75, 8, null, SMM); }
  [0.2, 0.55, 0.9].forEach(t => { const x = a0[0] + d[0] * bl * t, z = a0[1] + d[1] * bl * t; [-1, 1].forEach(sd => c.rod("#9ca3af", [x, sd * 0.45, z], [x, sd * 0.45, 0.0], 0.04, 0.04, 8, SMM)); c.beam("#9ca3af", [x, -0.45, z - 0.05], [x, 0.45, z - 0.05], 0.06, 0.06, SMM); });
  c.cyl("#374151", "y", a1[0], 0, a1[1], 0.25, 0.25, 0.9, 12, null, SMM);                                                                                                           // topptrumma
  c.box("#a79a7e", a1[0] - 0.8, 0, 0.0 + 0.45, 2.4, 2.4, 0.9, null, 0.6, { rough: 1 }); c.box("#9a8d72", a1[0] - 0.5, 0.3, 0.2, 1.6, 1.6, 0.4, null, 0.6, { rough: 1 });              // krossad hög
  if (typ === "Siktverk") { c.box("#475569", 0.3, 0, 3.6, 2.6, 2.0, 0.4, [0, 0.1, 0], 0.06, SMM); for (let i = 0; i < 4; i++) c.box("#cbd5e1", 0.3, 0, 3.8 + i * 0.0, 2.4, 0.04, 0.04, null, 0); }
  mcBeacon(c, -1.0, 0, 3.6);
  mcMachineCard(c, p, typ === "Siktverk" ? "Mobilt siktverk" : "Mobilt krossverk", [["Bandlängd", smFmt(bl, 0) + " m"], ["Bandvinkel", smFmt(ba * 180 / Math.PI, 0) + "°"]], 4.5);
}
/* ---- Servicebil / pickup / skåpbil ---- */
function mcVanBuild(p, c) {
  const typ = smF(p, "typ", "Pickup"), col = p.color || "#e5e7eb", L = typ === "Skåpbil" ? 5.6 : 5.3, HL = L / 2, van = typ === "Skåpbil";
  c.box("#20242a", 0, 0, 0.58, L - 0.2, 1.5, 0.22, null, 0.04, { rough: 0.7 }); c.box("#1a1d22", 0, 0, 0.42, L - 0.8, 1.6, 0.14, null, 0.03);
  [-1, 1].forEach(sx => [-1, 1].forEach(sd => { mcTire(c, sx * L * 0.33, sd * 0.88, 0.38, 0.26); }));
  // kaross: motorhuv, hytt (egen hyttbyggare), flak eller skåp
  c.box(col, HL - 0.55, 0, 0.88, 1.1, 1.8, 0.5, null, 0.1, { shin: 80 }); c.box(col, HL - 0.55, 0, 1.18, 1.0, 1.7, 0.12, null, 0.04, { shin: 80 });
  if (van) {
    mcExtrude(c, col, [[-HL + 0.05, 0.5], [HL - 1.0, 0.5], [HL - 1.1, 1.2], [HL - 1.55, 1.9], [HL - 2.1, 2.35], [-HL + 0.05, 2.35]], -0.93, 0.93, "y", { shin: 80 });
    c.beam("#1c2b3a", [HL - 1.2, 0, 1.25], [HL - 1.6, 0, 1.85], 1.7, 0.03, SMG); [-1, 1].forEach(sd => { c.box("#1c2b3a", HL - 1.55, sd * 0.945, 1.55, 0.8, 0.02, 0.5, null, 0.02, SMG); c.box("#0f172a", HL - 2.2, sd * 0.945, 1.4, 0.015, 0.015, 1.2, null, 0); });
    c.box("#f59e0b", -HL + 0.7, 0, 2.4, 0.8, 1.2, 0.08, null, 0.02);
  } else {
    mcCab(c, 0.7, 0, 0.62, 1.7, 1.78, 1.3, col);
    const fx0 = -HL + 0.05, fx1 = -0.2; c.box("#374151", (fx0 + fx1) / 2, 0, 0.85, fx1 - fx0, 1.8, 0.08, null, 0.02, SMM);                                          // flakets golv
    [-1, 1].forEach(sd => c.box(col, (fx0 + fx1) / 2, sd * 0.9, 1.1, fx1 - fx0, 0.05, 0.5, null, 0.01, { shin: 80 })); c.box(col, fx0, 0, 1.1, 0.05, 1.85, 0.5, null, 0.01, { shin: 80 }); c.box(col, fx1, 0, 1.1, 0.05, 1.85, 0.5, null, 0.01, { shin: 80 });
    [-1, 1].forEach(sd => [-1, 1].forEach(sx => c.box("#1f2328", sx * 0.0 + (fx0 + fx1) / 2 + sx * 0.72, sd * 0.9, 0.62, 0.7, 0.06, 0.34, null, 0.04)));       // hjulhus i flaket
    c.box("#374151", fx0 + 0.02, 0, 0.55, 0.12, 1.7, 0.18, null, 0.03, SMM);
  }
  // front: grill, stötfångare, strålkastare, speglar, takramp
  c.box("#111827", HL + 0.0, 0, 0.9, 0.05, 1.2, 0.28, null, 0.02); for (let i = 0; i < 3; i++) c.box("#9ca3af", HL + 0.03, 0, 0.82 + i * 0.1, 0.02, 1.1, 0.025, null, 0, SMM);
  c.box("#2c3138", HL + 0.07, 0, 0.55, 0.16, 1.8, 0.22, null, 0.05, { rough: 0.7 }); [-1, 1].forEach(sd => { c.box("#fffbe6", HL + 0.02, sd * 0.68, 1.0, 0.04, 0.35, 0.12, null, 0.02, SMLIT); c.box("#ff8a1a", HL + 0.02, sd * 0.88, 0.62, 0.04, 0.12, 0.08, null, 0.01, SMLIT); });
  [-1, 1].forEach(sd => { c.rod("#374151", [HL - 1.25, sd * 0.9, 1.45], [HL - 1.1, sd * 1.05, 1.45], 0.015, 0.015, 5, SMM); c.box("#111827", HL - 1.1, sd * 1.08, 1.45, 0.14, 0.05, 0.22, null, 0.02); });
  c.box("#facc15", HL - 0.06, 0.0, 0.52, 0.02, 0.5, 0.1, null, 0, SMLIT);
  mcBeacon(c, 0.5, 0, van ? 2.43 : 1.95); mcMachineCard(c, p, typ, [["Typ", typ]], 3.2);
}
Object.assign(SM, {
  aggregat: { group: "Maskiner", label: "Aggregat & ljusmast", color: "#16a34a", L: 3.2, B: 1.4, H: 2.3, icon: "truck", build: mcGenBuild,
    fields: [["typ", "Typ", ["Elverk", "Kompressor", "Värmeaggregat", "Ljusmast"], "Elverk"], ["effekt", "Effekt/kapacitet", "range", 60, { min: 5, max: 400, step: 5, unit: "" }], ["mast", "Masthöjd (ljusmast)", "range", 9, { min: 4, max: 14, step: 0.5, unit: "m" }], ["lutning", "Mastlutning", "range", 0, { min: -20, max: 20, step: 1, unit: "°" }]],
    groups: [["Maskin", ["typ", "effekt"]], ["Ljusmast", ["mast", "lutning"]]] },
  krossverk: { group: "Maskiner", label: "Krossverk / siktverk", color: "#facc15", L: 6, B: 3, H: 4, icon: "truck", build: mcCrusherBuild,
    fields: [["typ", "Typ", ["Backkross", "Siktverk"], "Backkross", { seg: true }], ["band", "Bandets vinkel", "range", 28, { min: 5, max: 40, step: 1, unit: "°" }], ["bandlangd", "Bandets längd", "range", 9, { min: 4, max: 16, step: 0.5, unit: "m" }]],
    groups: [["Maskin", ["typ"]], ["Transportband", ["band", "bandlangd"]]] },
  servicebil: { group: "Maskiner", label: "Servicebil / pickup", color: "#e5e7eb", L: 5.4, B: 1.9, H: 1.9, icon: "truck", build: mcVanBuild, fields: [["typ", "Typ", ["Pickup", "Skåpbil"], "Pickup", { seg: true }]], groups: [["Fordon", ["typ"]]] },
});
