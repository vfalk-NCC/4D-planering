/* Stomme – enskilda delar att modellera med (Victor 2026-10-24: "jag vill kunna modellera till exempel en stålstomme genom att välja olika
   profiler och håldäck som snappar till varandra som Tekla"). Till skillnad från Byggdelar (lagring, stapel, skylt) är det här ensamma delar
   utan underlag och skylt. Varje del har sina mått (d.box → [längd, bredd, höjd]) så att lagesplan-3dframe.js kan snappa hörn, kanter och
   ytor mot andra delar. Delen ligger med längdaxeln längs X, centrerad i plan, med underkant på Z; lutning/stående ställer den upp. */
const SF_STAND = ["stand", "Läge", ["Liggande", "Stående"], "Liggande", { seg: true }];
const SF_TILT = [["lutning", "Lutning", "range", 0, { min: -90, max: 90, step: 5, unit: "°" }], ["rull", "Vridning runt längdaxeln", "range", 0, { min: -180, max: 180, step: 5, unit: "°" }]];
function sfSteelBox(p) { const S = bdSection(smF(p, "serie", "HEA"), smF(p, "dim", "200")); return [smN(p, "langd", 6), S.kind === "C" ? S.D : S.b, S.kind === "C" ? S.D : S.h]; }
function sfHdBox(p) { return [smN(p, "langd", 8), Number(smF(p, "bredd", "1.2")), Number(smF(p, "tjock", "265")) / 1000]; }
function sfConcBox(p) { const t = smF(p, "typ", "Pelare"), L = smN(p, "langd", 3), B = smN(p, "bredd", 0.4), H = smN(p, "hojd", 0.4); if (t === "Pelare") return [B, H, L]; return [L, B + (t === "T-balk" ? 0.4 : t === "L-balk" ? 0.2 : 0), H]; }
const sfSync = (d, p) => { const [L, B, H] = d.box(p); p.L = L; p.B = B; p.H = H; };
function sfSteelBuild(p, c) {
  const S = bdSection(smF(p, "serie", "HEA"), smF(p, "dim", "200")), L = smN(p, "langd", 6), yta = smF(p, "yta", "Valsad");
  sfSync(SM.stomstal, p); bdBeam(c, S, L, 0, 0, 0, p.color || ({ Valsad: BD_STEEL, Grundmålad: "#9a4a3c", Varmförzinkad: "#c3cbd3", Svartmålad: "#2a2f35" }[yta] || BD_STEEL));
}
function sfHdBuild(p, c) {
  const [L, W, T] = sfHdBox(p), col = p.color || BD_CONC, nC = Math.max(2, Math.round(W / (T > 0.3 ? 0.27 : 0.2))), cw = W / nC * 0.62, ch = T * 0.55;
  sfSync(SM.stomhd, p); c.box(col, 0, 0, T / 2, L, W, T, null, 0.008, { rough: 1 });
  for (let k = 0; k < nC; k++) [-1, 1].forEach(sd => c.box("#5b5f66", sd * (L / 2 + 0.002), -W / 2 + W / nC * (k + 0.5), T / 2, 0.006, cw, ch, null, 0.002, { rough: 1 }));
  [-1, 1].forEach(sd => c.box("#9a9da1", 0, sd * (W / 2 - 0.004), T * 0.4, L - 0.02, 0.012, T * 0.35, null, 0, { rough: 1 }));
}
function sfConcBuild(p, c) {
  const typ = smF(p, "typ", "Pelare"), L = smN(p, "langd", 3), B = smN(p, "bredd", 0.4), H = smN(p, "hojd", 0.4), col = p.color || BD_CONC, o = { rough: 1 };
  sfSync(SM.stombet, p);
  if (typ === "Pelare") { c.box(col, 0, 0, L / 2, B, H, L, null, 0.01, o); if (smF(p, "konsol", "Nej") === "Ja") [-1, 1].forEach(sd => c.box(col, 0, sd * (H / 2 + 0.1), L * 0.78, 0.25, 0.2, L * 0.25, null, 0.01, o)); return; }
  c.box(col, 0, 0, H / 2, L, B, H, null, 0.01, o);
  if (typ === "L-balk") c.box(col, 0, B / 2 + 0.1, H * 0.2, L, 0.2, H * 0.4, null, 0.01, o);
  else if (typ === "T-balk") [-1, 1].forEach(sd => c.box(col, 0, sd * (B / 2 + 0.1), H * 0.2, L, 0.2, H * 0.4, null, 0.01, o));
}
Object.assign(SM, {
  stomstal: { group: "Stomme", label: "Stålprofil (stomme)", color: "#8d97a3", L: 6, B: 0.2, H: 0.2, icon: "box", box: sfSteelBox, calc: SM.stalprofil.calc, build: sfSteelBuild,
    fields: [SM.stalprofil.fields[0], SM.stalprofil.fields[1], ["langd", "Längd", "range", 6, { min: 0.3, max: 18, step: 0.1, unit: "m" }], SF_STAND, ...SF_TILT, ["yta", "Ytbehandling", ["Valsad", "Grundmålad", "Varmförzinkad", "Svartmålad"], "Valsad"], ["_calc", "Data", "calc"]],
    groups: [["Profil", ["serie", "dim", "langd"]], ["Läge", ["stand", "lutning", "rull"]], ["Yta", ["yta"], "fold"], ["Data", ["_calc"]]] },
  stomhd: { group: "Stomme", label: "Håldäck (stomme)", color: "#b8bbbe", L: 8, B: 1.2, H: 0.265, icon: "box", box: sfHdBox, calc: SM.haldack.calc, build: sfHdBuild,
    fields: [SM.haldack.fields[0], SM.haldack.fields[1], ["langd", "Längd", "range", 8, { min: 1, max: 18, step: 0.1, unit: "m" }], SF_STAND, ...SF_TILT, ["_calc", "Data", "calc"]],
    groups: [["Håldäck", ["tjock", "bredd", "langd"]], ["Läge", ["stand", "lutning", "rull"], "fold"], ["Data", ["_calc"]]] },
  stombet: { group: "Stomme", label: "Betongelement (stomme)", color: "#b8bbbe", L: 3, B: 0.4, H: 0.4, icon: "box", box: sfConcBox, build: sfConcBuild,
    fields: [["typ", "Typ", ["Pelare", "Balk", "L-balk", "T-balk", "Massiv vägg"], "Pelare"], ["langd", "Längd / höjd (pelare)", "range", 3, { min: 0.3, max: 16, step: 0.1, unit: "m" }], ["bredd", "Bredd/tjocklek", "range", 0.4, { min: 0.1, max: 1.5, step: 0.05, unit: "m" }], ["hojd", "Höjd / djup", "range", 0.4, { min: 0.1, max: 4, step: 0.05, unit: "m" }], ["konsol", "Konsoler (pelare)", ["Ja", "Nej"], "Nej", { seg: true }], SF_STAND, ...SF_TILT],
    groups: [["Element", ["typ", "langd", "bredd", "hojd", "konsol"]], ["Läge", ["stand", "lutning", "rull"]]] },
});
["stomstal", "stomhd", "stombet"].forEach(k => { const d = SM[k]; d.build = bdTilted(d.build); });
