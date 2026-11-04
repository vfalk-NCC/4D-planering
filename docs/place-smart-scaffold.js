/* Ställning som följer berget (Victor 2026-11-04: "bygga ett 3d-objekt ställning som kan anpassa sig efter bergskonturen – punktmolnet – så att jag kan ställa ställningar i slänter").
   Ett smart 3D-objekt (typ "sm:stallningfri") som ritas punkt för punkt längs bergets fot, precis som staketet. Varje punkt har en markhöjd (hämtas där man klickar i punktmolnet),
   och ställningen delas in i fack längs linjen:
     – stolparna står på markhöjden vid varje fack (ställbar fot) och har olika längd, men
     – plattformarna ligger i jämna nivåer (en våningshöjd isär) hela vägen, så att man kan gå längs ställningen.
   Överkanten = högsta markpunkten + Höjd. Plattformar som skulle hamna inne i berget utelämnas. Den inre raden ligger på den klickade linjen, den yttre en bredd ut åt vald sida.
   "Följ markytan": när linjen avslutas (Enter) fylls markhöjden i var fack i från punktmolnet, så att ställningen följer konturen (stallningFriFollow, kräver ett tänt punktmoln). */

const SM_SCF_FACK = [["1.57", "1,57 m"], ["2.07", "2,07 m"], ["2.57", "2,57 m"], ["3.07", "3,07 m"]], SM_SCF_VH = [["1.5", "1,5 m"], ["2", "2,0 m"], ["2.5", "2,5 m"]];

/* Stationer längs linjen: jämnt fördelade fack, med läge, normal och markhöjd för inre/yttre rad. P = [[x, y, zInre, zYtre?], …] (x, y relativt objektet, z relativt byggkontexten). */
function stallningFriStations(P, fack, B, sida) {
  const seg = []; let tot = 0;
  for (let i = 0; i < P.length - 1; i++) { const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); if (l < 0.02) continue; seg.push({ i, l, s0: tot }); tot += l; }
  if (!seg.length) return null;
  const nb = Math.max(1, Math.round(tot / fack)), bay = tot / nb, st = [];
  const at = s => { let g = seg[seg.length - 1]; for (const q of seg) if (s <= q.s0 + q.l + 1e-9) { g = q; break; } const t = Math.max(0, Math.min(1, (s - g.s0) / g.l)), a = P[g.i], b = P[g.i + 1], ux = (b[0] - a[0]) / g.l, uy = (b[1] - a[1]) / g.l;
    const za = a[2], zb = b[2], zoa = a[3] == null ? za : a[3], zob = b[3] == null ? zb : b[3];
    return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, zi: za + (zb - za) * t, zo: zoa + (zob - zoa) * t, ux, uy }; };
  for (let j = 0; j <= nb; j++) { const q = at(j * bay), e = at(Math.max(0, j * bay - 0.4)), f = at(Math.min(tot, j * bay + 0.4)); let ux = f.x - e.x, uy = f.y - e.y; const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;   // riktning = medel över ±0,4 m (mjuk i knäpunkter)
    const nx = -uy * sida, ny = ux * sida; st.push({ x: q.x, y: q.y, zi: q.zi, zo: q.zo, ox: q.x + nx * B, oy: q.y + ny * B, ux, uy }); }
  return { st, nb, bay, tot };
}
function stallningFriBuild(p, c) {
  const P = (p.pts || []).map(q => [q[0] - (Number(p.x) || 0), q[1] - (Number(p.y) || 0), (q[2] || 0) + (Number(p.dz) || 0) - c.z, q[3] == null ? null : q[3] + (Number(p.dz) || 0) - c.z]); if (P.length < 2) return;
  const B = Math.max(0.6, Number(p.B) || 0.75), fack = Math.max(0.7, smN(p, "fack", 2.57)), vh = Math.max(1, smN(p, "vh", 2)), Ht = Math.max(1, Number(p.H) || 6), sida = smF(p, "sida", "Vänster") === "Höger" ? -1 : 1, acc = p.color || "#eab308";
  const STE = "#c9d0d8", STE2 = "#aeb7c1", DECK = "#b4bcc6", EDGE = "#6b7684", skydd = smF(p, "skydd", "Nät"), diag = smF(p, "diag", "Ja") !== "Nej", stege = smF(p, "stege", "Ja") !== "Nej", spark = smF(p, "spark", "Ja") !== "Nej";
  const S = stallningFriStations(P, fack, B, sida); if (!S) return; const { st, nb } = S, rod = (a, b, r, col) => c.rod(col || STE, a, b, r, r, r < 0.016 ? 4 : 5, SMM);
  const gmax = Math.max(...st.map(q => Math.max(q.zi, q.zo))), gmin = Math.min(...st.map(q => Math.min(q.zi, q.zo))), top = gmax + Ht, nl = Math.max(1, Math.floor((top - gmin - 0.3) / vh));
  const lev = []; for (let k = 0; k <= nl; k++) lev.push(top - k * vh);   // plattformsnivåer uppifrån och ned
  let nStd = 0, nDeck = 0, nLed = 0, nStd2 = 0;
  const topRail = top + 1.05;
  // stolpar: fotplatta + ställbar fot på markhöjden, rör upp till räckeshöjd, rosetter vid varje nivå som ligger över marken
  st.forEach(q => [[q.x, q.y, q.zi], [q.ox, q.oy, q.zo]].forEach(([x, y, g]) => { nStd++; c.rod(STE, [x, y, g + 0.1], [x, y, topRail], 0.024, 0.024, 6, SMM); c.box("#6b7280", x, y, g + 0.005, 0.16, 0.16, 0.01, null, 0, SMM); c.cyl("#dc2626", "z", x, y, g + 0.06, 0.018, 0.018, 0.12, 8, null, SMM);
    lev.forEach(z => { if (z > g + 0.25) c.cyl("#9aa4b0", "z", x, y, z, 0.058, 0.058, 0.01, 8, null, SMM); }); }));
  for (let j = 0; j < nb; j++) {
    const a = st[j], b = st[j + 1], ang = Math.atan2(b.y - a.y, b.x - a.x), len = Math.hypot(b.x - a.x, b.y - a.y), gA = Math.max(a.zi, b.zi, a.zo, b.zo), gI = Math.min(a.zi, b.zi), gO = Math.min(a.zo, b.zo);
    const mx = (a.x + b.x + a.ox + b.ox) / 4, my = (a.y + b.y + a.oy + b.oy) / 4, wy = Math.hypot((a.ox - a.x + b.ox - b.x) / 2, (a.oy - a.y + b.oy - b.y) / 2);
    lev.forEach((z, k) => {
      if (z > gI + 0.25) { rod([a.x, a.y, z], [b.x, b.y, z], 0.02); nLed++; }
      if (z > gO + 0.25) { rod([a.ox, a.oy, z], [b.ox, b.oy, z], 0.02); nLed++; }
      if (j === nb - 1 && z > b.zi + 0.25 && z > b.zo + 0.25) rod([b.x, b.y, z], [b.ox, b.oy, z], 0.02, STE2);
      if (j === 0 && z > a.zi + 0.25 && z > a.zo + 0.25) rod([a.x, a.y, z], [a.ox, a.oy, z], 0.02, STE2);
      if (z >= gA + 0.1) {   // plattformen ligger över marken i hela facket
        nDeck++; c.box(DECK, mx, my, z + 0.045, len - 0.04, Math.max(0.3, wy - 0.1), 0.03, [ang, 0, 0], 0, { metal: 0.7, rough: 0.45 });
        c.box(EDGE, (a.x + b.x) / 2, (a.y + b.y) / 2, z + 0.02, len - 0.02, 0.05, 0.08, [ang, 0, 0], 0, SMM); c.box(EDGE, (a.ox + b.ox) / 2, (a.oy + b.oy) / 2, z + 0.02, len - 0.02, 0.05, 0.08, [ang, 0, 0], 0, SMM);
        if (spark) c.box("#c9a15f", (a.ox + b.ox) / 2, (a.oy + b.oy) / 2, z + 0.16, len - 0.04, 0.025, 0.15, [ang, 0, 0], 0, { rough: 0.9 });
        [0.5, 1.0].forEach((h, hi) => { rod([a.ox, a.oy, z + h], [b.ox, b.oy, z + h], 0.02, hi ? acc : STE); if (j === 0) rod([a.x, a.y, z + h], [a.ox, a.oy, z + h], 0.02, hi ? acc : STE); if (j === nb - 1) rod([b.x, b.y, z + h], [b.ox, b.oy, z + h], 0.02, hi ? acc : STE); });
      }
    });
    // översta räcket (även över sista plattformen) på båda raderna
    [0.5, 1.0].forEach((h, hi) => { rod([a.x, a.y, top + h], [b.x, b.y, top + h], 0.02, hi ? acc : STE); rod([a.ox, a.oy, top + h], [b.ox, b.oy, top + h], 0.02, hi ? acc : STE); });
    if (diag && j % 2 === 0) { const zb0 = Math.max(Math.min(a.zo, b.zo) + 0.3, top - nl * vh); rod([j % 4 === 0 ? a.ox : b.ox, j % 4 === 0 ? a.oy : b.oy, zb0], [j % 4 === 0 ? b.ox : a.ox, j % 4 === 0 ? b.oy : a.oy, top], 0.014, STE2); }
    if (skydd === "Nät") { const g0 = Math.min(a.zo, b.zo), h = topRail - g0; c.beam("#16a34a", [(a.ox + (a.ox - a.x) * 0.07), (a.oy + (a.oy - a.y) * 0.07), g0 + h / 2], [(b.ox + (b.ox - b.x) * 0.07), (b.oy + (b.oy - b.y) * 0.07), g0 + h / 2], 0.01, h, { transp: 0.55, rough: 1 }); }
  }
  // tillträde: stege (varje nivå mellan plattformarna) vid första stationen, på insidan
  if (stege) { const a = st[0], b = st[1], xr = (a.x + b.x) / 2 + (a.ox - a.x) * 0.5, yr = (a.y + b.y) / 2 + (a.oy - a.y) * 0.5, zr = Math.max(a.zi, a.zo, b.zi, b.zo);
    rod([xr - 0.16 * a.ux, yr - 0.16 * a.uy, zr + 0.1], [xr - 0.16 * a.ux, yr - 0.16 * a.uy, top + 1.0], 0.02, STE); rod([xr + 0.16 * a.ux, yr + 0.16 * a.uy, zr + 0.1], [xr + 0.16 * a.ux, yr + 0.16 * a.uy, top + 1.0], 0.02, STE);
    for (let z = zr + 0.35; z < top + 0.9; z += 0.28) rod([xr - 0.16 * a.ux, yr - 0.16 * a.uy, z], [xr + 0.16 * a.ux, yr + 0.16 * a.uy, z], 0.012, STE2); }
  const lenTot = S.tot, area = lenTot * (top - gmin);
  c.card({ title: String(p.name || "Ställning (följer berget)"), icon: "box", color: "#475569", left: ["m", smFmt(top - gmin, 1)], rows: [["Längd × bredd", `${smFmt(lenTot, 1)} × ${smFmt(B, 2)} m`], ["Fack / våningar", `${nb} st · ${nl + 1} st`], ["Överkant", `${smFmt(top, 1)} m ö.h.`], ["Marknivå", `${smFmt(gmin, 1)}–${smFmt(gmax, 1)} m`], ["Fasadyta", `${smFmt(area, 0)} m²`]], b0: -0.9, zb: top + 1.4 });
}
const stallningFriCalc = p => {
  const P = (p.pts || []).map(q => [q[0], q[1], q[2] || 0, q[3] == null ? null : q[3]]); if (P.length < 2) return [["Linje", "Ställningen ritas punkt för punkt – klicka längs bergets fot."]];
  const B = Math.max(0.6, Number(p.B) || 0.75), fack = Math.max(0.7, smN(p, "fack", 2.57)), vh = Math.max(1, smN(p, "vh", 2)), Ht = Math.max(1, Number(p.H) || 6), S = stallningFriStations(P, fack, B, 1); if (!S) return [];
  const gmax = Math.max(...S.st.map(q => Math.max(q.zi, q.zo))), gmin = Math.min(...S.st.map(q => Math.min(q.zi, q.zo))), top = gmax + Ht, nl = Math.max(1, Math.floor((top - gmin - 0.3) / vh));
  let nd = 0; for (let j = 0; j < S.nb; j++) { const a = S.st[j], b = S.st[j + 1], g = Math.max(a.zi, b.zi, a.zo, b.zo); for (let k = 0; k <= nl; k++) if (top - k * vh >= g + 0.1) nd++; }
  return [["Längd", smFmt(S.tot, 1) + " m"], ["Fack", `${S.nb} st à ${smFmt(S.bay, 2)} m`], ["Våningar", `${nl + 1} st à ${smFmt(vh, 1)} m`], ["Stolpar", `${(S.nb + 1) * 2} st`], ["Plattformar", `${nd} st (${smFmt(nd * S.bay * B, 0)} m²)`], ["Marknivå", `${smFmt(gmin, 1)}–${smFmt(gmax, 1)} m ö.h.`], ["Överkant", smFmt(top, 1) + " m ö.h."], ["Fasadyta", smFmt(S.tot * (top - gmin), 0) + " m²"], ["Vikt ca", smFmt(S.tot * (top - gmin) * 0.025, 1) + " ton"]];
};
/* Fyller i markhöjden i varje fack ur det tända punktmolnet (och höjden vid yttre raden). Anropas när linjen avslutas; z i världskoordinater. */
function stallningFriFollow(p, zAt) {
  const pts = p.pts || []; if (pts.length < 2 || typeof zAt !== "function") return 0;
  const B = Math.max(0.6, Number(p.B) || 0.75), fack = Math.max(0.7, smN(p, "fack", 2.57)), sida = smF(p, "sida", "Vänster") === "Höger" ? -1 : 1, out = []; let found = 0;
  const sample = (x, y, fb) => { const z = zAt(x, y); if (z == null || !isFinite(z)) return fb; found++; return z; };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l < 0.02) continue; const n = Math.max(1, Math.round(l / fack)), ux = (b[0] - a[0]) / l, uy = (b[1] - a[1]) / l, nx = -uy * sida, ny = ux * sida;
    for (let k = i === 0 ? 0 : 1; k <= n; k++) { const t = k / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, zl = (a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * t;
      out.push([x, y, sample(x, y, zl), sample(x + nx * B, y + ny * B, zl)]); } }
  if (!found) return 0; p.pts = out.map(q => q.map(v => Math.round(v * 1000) / 1000)); return out.length;
}
/* Spegelvänd: ställningen flyttas till andra sidan av den klickade linjen (och markhöjden på yttre raden hämtas om ur punktmolnet). */
function stallningFriMirror(p) {
  p.f = p.f || {}; const was = smF(p, "sida", "Vänster"); p.f.sida = was === "Höger" ? "Vänster" : "Höger";
  const pts = p.pts || [], B = Math.max(0.6, Number(p.B) || 0.75), sida = p.f.sida === "Höger" ? -1 : 1; let n = 0;
  if (pts.length >= 2 && typeof l3slZ === "function") pts.forEach((q, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l * sida, ny = (b[0] - a[0]) / l * sida;
    const z = l3slZ(q[0] + nx * B, q[1] + ny * B, 0.8); if (z != null && isFinite(z)) { q[3] = Math.round(z * 1000) / 1000; n++; } else q[3] = q[2]; });
  return `Ställningen står nu på ${p.f.sida.toLowerCase()} sida om linjen${n ? " (markhöjden vid yttre raden hämtad ur punktmolnet)" : ""}.`;
}
if (typeof SM !== "undefined") SM.stallningfri = { group: "Etablering", label: "Ställning (följer berget)", color: "#eab308", path: true, H: 6, B: 0.75, icon: "box", calc: stallningFriCalc, build: stallningFriBuild,
  fields: [["H", "Höjd över högsta marken", "range", 6, { min: 1, max: 40, step: 0.5, unit: "m", dim: true }], ["B", "Bredd (djup)", "range", 0.75, { min: 0.6, max: 2, step: 0.05, unit: "m", dim: true }], ["sida", "Ställningen står", ["Vänster", "Höger"], "Vänster", { seg: true }], ["spegla", "Spegelvänd (andra sidan av linjen)", "action", "", { tip: "Flyttar ställningen till andra sidan av den klickade linjen" }], ["folj", "Följ markytan (punktmoln)", ["Ja", "Nej"], "Ja", { seg: true }],
    ["fack", "Fackbredd", SM_SCF_FACK, "2.57"], ["vh", "Våningshöjd", SM_SCF_VH, "2"], ["skydd", "Skydd", ["Nät", "Inget"], "Nät", { seg: true }], ["stege", "Stege", ["Ja", "Nej"], "Ja", { seg: true }], ["diag", "Diagonalstag", ["Ja", "Nej"], "Ja", { seg: true }], ["spark", "Sparkplåt", ["Ja", "Nej"], "Ja", { seg: true }], ["_calc", "Beräknat", "calc"]],
  act: { spegla: stallningFriMirror },
  groups: [["Mått", ["H", "B", "sida", "spegla", "folj"]], ["Alternativ", ["fack", "vh", "skydd", "stege", "diag", "spark"], "fold"], ["Beräknat", ["_calc"]]] };
