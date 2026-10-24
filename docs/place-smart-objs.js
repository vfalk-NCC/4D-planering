/* De smarta objekten (Victor 2026-10-23): fordon, lyft, logistik, risk och kvalitet – byggda av riktiga former (TK) med samma detaljnivå som mobilkranen: rundade karosser, hjul med fälgar,
   ledade bommar, glas, belysning, kantband. Varje typ har fält (panelen) och en skylt (smCard). Ritning: build(p, c) där c = smMakeCtx i place-smart.js. */
const SM_KRAN = () => (typeof L3L_MODELS !== "undefined" ? L3L_MODELS.map(m => m.name) : ["Mobilkran 100 t (exempel)"]);
const SM_ASPH = "#4b5563", SM_STEEL = "#8b95a1", SM_DARK = "#20252b", SM_GLASS = "#1c2b3a", SM_WHITE = "#f1f4f7", SM_YEL = "#facc15", SM_RED = "#dc2626";
const SMG = { transp: 0.45, shin: 130, metal: 0.5, rough: 0.12 }, SMM = { metal: 0.85, rough: 0.28, shin: 100 }, SMLIT = { unlit: true };
/* Hjul (axel längs b): däck, fälg, nav och hjulmuttrar. */
function smWheel(c, x, y, r, w, rim) {
  const s = y >= 0 ? 1 : -1; c.cyl("#15181b", "y", x, y, r, r, r, w, 22); c.cyl("#0f1113", "y", x, y, r, r * 0.97, r * 0.97, w * 1.01, 22);
  c.cyl(rim || "#aeb7c0", "y", x, y + s * w * 0.03, r, r * 0.6, r * 0.6, w * 1.02, 18, null, SMM); c.cyl("#6b7480", "y", x, y + s * w * 0.5, r, r * 0.24, r * 0.24, w * 0.08, 12, null, SMM);
  for (let i = 0; i < 8; i++) { const t = i * Math.PI / 4; c.sph("#d5dbe1", x + Math.cos(t) * r * 0.38, y + s * w * 0.52, r + Math.sin(t) * r * 0.38, 0.028, 0.02, 0.028, 6, 4, null, SMM); }
}
function smStripe(c, a0, a1, y, z, th, col) { c.box(col, (a0 + a1) / 2, y, z, Math.abs(a1 - a0), 0.012, th, null, 0); }
/* ---- Gjutetapp: form, kantreglar, armering (synliga stänger i objektet) och mängder ---- */
const GJ_D = [["0", "Inget"], ["8", "Ø8"], ["10", "Ø10"], ["12", "Ø12"], ["16", "Ø16"], ["20", "Ø20"], ["25", "Ø25"]], GJ_S = [["100", "c/c 100"], ["150", "c/c 150"], ["200", "c/c 200"], ["250", "c/c 250"], ["300", "c/c 300"]];
const GJ_REG = [["45x95", "45 × 95 mm"], ["45x125", "45 × 125 mm"], ["45x145", "45 × 145 mm"], ["70x145", "70 × 145 mm"], ["95x95", "95 × 95 mm"]], GJ_WOOD = [["riv", "Formen", ["Kvar", "Riven"], "Kvar", { seg: true }], ["sbx", "Borttagna stödben (rensa för att få tillbaka)", "text", ""], ["sv", "Stödben, vinkel från lodrätt", "range", 45, { min: 15, max: 75, step: 1, unit: "°" }], ["su", "Stödben, utstick (0 = enligt vinkel)", "range", 0, { min: 0, max: 4, step: 0.1, unit: "m" }], ["ark", "Arbetsyta runt formen", "range", 1, { min: 0, max: 6, step: 0.25, unit: "m" }], ["reg", "Regel till stöttor och snedstag", GJ_REG, "45x125"]];
const GJ_FORM_FIELDS = free => (free ? [["radie", "Hörnradie", "range", 0, { min: 0, max: 4, step: 0.25, unit: "m" }], ["ut", "Utstick från punkterna", "range", 0, { min: -1, max: 3, step: 0.05, unit: "m" }], ...GJ_WOOD] : [["form", "Form", ["Rektangel", "L-form", "T-form", "U-form"], "Rektangel", { seg: true }], ["cutL", "Utskärning, längd", "range", 4, { min: 0.5, max: 24, step: 0.5, unit: "m" }], ["cutB", "Utskärning, bredd", "range", 3, { min: 0.5, max: 16, step: 0.5, unit: "m" }], ["radie", "Hörnradie", "range", 0, { min: 0, max: 4, step: 0.25, unit: "m" }], ...GJ_WOOD]);
const GJ_ARM_FIELDS = () => [["arm", "Armering", ["Visa", "Dölj"], "Visa", { seg: true }], ["uD", "Undre nät", GJ_D, "12"], ["uS", "Undre nät, delning", GJ_S, "150"], ["oD", "Övre nät", GJ_D, "0"], ["oS", "Övre nät, delning", GJ_S, "150"], ["tak", "Täckskikt", [["30", "30 mm"], ["40", "40 mm"], ["50", "50 mm"], ["60", "60 mm"]], "40"], ["ang", "Armeringens riktning", "range", 0, { min: 0, max: 180, step: 1, unit: "°" }]];
const GJ_INFO_FIELDS = () => [["tillagg", "Tillägg för spill", "range", 0, { min: 0, max: 15, step: 1, unit: "%" }], ["kval", "Kvalitet", [["C25/30", "C25/30"], ["C30/37", "C30/37"], ["C32/40", "C32/40"], ["C35/45", "C35/45"], ["C40/50", "C40/50"]], "C30/37"], ["pump", "Pumpplats", "text", ""], ["start", "Starttid", "time", "07:00"], ["bil", "Betongbil", [["6", "6 m³"], ["7", "7 m³"], ["8", "8 m³"], ["9", "9 m³"], ["10", "10 m³"]], "8"], ["kap", "Pump", [["20", "20 m³/h"], ["30", "30 m³/h"], ["40", "40 m³/h"], ["60", "60 m³/h"], ["80", "80 m³/h"]], "30"], ["_prof", "Underkant (berg)", "gjprof"], ["_calc", "Beräknat från formen", "calc"]];
const GJ_GROUPS = [["Form", ["form", "cutL", "cutB", "radie", "ut", "_prof", "riv", "reg", "sv", "su", "sbx", "ark"]], ["Armering", ["arm", "uD", "uS", "oD", "oS", "tak", "ang"]], ["Betong och pump", ["kval", "tillagg", "pump", "start", "bil", "kap"]], ["Beräknat", ["_calc"]]];
/* Fri form: polygonen från punkterna, rundad (hörnradie) och sedan utvidgad "utstick" meter åt alla håll (Victor 2026-10-24: "0,5 m utstick från punkterna överallt"). */
function gjutOffset(poly, d) {
  const n = poly.length; if (!d || n < 3) return poly; const sg = TK.area2(poly) >= 0 ? 1 : -1, out = [];
  for (let i = 0; i < n; i++) { const a = poly[(i + n - 1) % n], b = poly[i], c = poly[(i + 1) % n];
    const e1 = [b[0] - a[0], b[1] - a[1]], e2 = [c[0] - b[0], c[1] - b[1]], l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1, n1 = [sg * e1[1] / l1, -sg * e1[0] / l1], n2 = [sg * e2[1] / l2, -sg * e2[0] / l2];
    const k = 1 + n1[0] * n2[0] + n1[1] * n2[1], m = [(n1[0] + n2[0]) / Math.max(k, 0.3), (n1[1] + n2[1]) / Math.max(k, 0.3)];
    out.push([b[0] + m[0] * d, b[1] + m[1] * d]); }
  return out;
}
function gjutFreePoly(p) { const P = p.pts || [], ox = Number(p.x) || 0, oy = Number(p.y) || 0; if (P.length < 3) return null; return gjutOffset(smFillet(P.map(q => [q[0] - ox, q[1] - oy, 0]), smN(p, "radie", 0), true).map(q => [q[0], q[1]]), smN(p, "ut", 0)); }
function gjutPoly(p) {
  const L = p.L / 2, B = p.B / 2, f = smF(p, "form", "Rektangel"), cl = Math.max(0.5, Math.min(smN(p, "cutL", 4), p.L - 1)), cb = Math.max(0.5, Math.min(smN(p, "cutB", 3), p.B - 1));
  let P = [[-L, -B], [L, -B], [L, B], [-L, B]];
  if (f === "L-form") P = [[-L, -B], [L, -B], [L, B - cb], [L - cl, B - cb], [L - cl, B], [-L, B]];
  else if (f === "U-form") P = [[-L, -B], [L, -B], [L, B], [cl / 2, B], [cl / 2, B - cb], [-cl / 2, B - cb], [-cl / 2, B], [-L, B]];
  else if (f === "T-form") P = [[-L + cl, -B], [L - cl, -B], [L - cl, B - cb], [L, B - cb], [L, B], [-L, B], [-L, B - cb], [-L + cl, B - cb]];
  return smFillet(P.map(q => [q[0], q[1], 0]), smN(p, "radie", 0), true).map(q => [q[0], q[1]]);
}
/* Skär en polygon med parallella linjer (riktning ang, delning s): [[a, b], …] linjesegment inne i polygonen, krympta med täckskiktet. */
function gjutScan(poly, ang, s, cover) {
  const ca = Math.cos(-ang), sa = Math.sin(-ang), R = poly.map(([x, y]) => [x * ca - y * sa, x * sa + y * ca]), ys = R.map(q => q[1]), y0 = Math.min(...ys) + cover, y1 = Math.max(...ys) - cover, out = [], back = (x, y) => [x * Math.cos(ang) - y * Math.sin(ang), x * Math.sin(ang) + y * Math.cos(ang)];
  for (let y = y0; y <= y1 + 1e-6; y += s) { const xs = []; for (let i = 0; i < R.length; i++) { const a = R[i], b = R[(i + 1) % R.length]; if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); } xs.sort((m, n) => m - n); for (let k = 0; k + 1 < xs.length; k += 2) { const x0 = xs[k] + cover, x1 = xs[k + 1] - cover; if (x1 - x0 > 0.1) out.push([back(x0, y), back(x1, y)]); } }
  return out;
}
/* Mängder ur formen (Victor 2026-10-24: "kubiken borde räkna ut sig själv"): yta, volym (yta × tjocklek + spillpåslag), stål, bilar, pumptid och markanspråk (formen + 1 m arbetsyta runt om). */
const GJ_CLAIM = 1.0;
/* Bottenprofilen (berg): sparad som "t:z;t:z …" i p.f.prof – t 0–1 längs formens x-led, z = botten över plattans nivå (negativt = djupare). Ritas fritt i modellen. */
function gjutProfGet(p) { const t = smF(p, "prof", ""); if (!t) return null; const a = String(t).split(";").map(q => q.split(":").map(Number)).filter(q => q.length === 2 && isFinite(q[0]) && isFinite(q[1])).sort((m, n) => m[0] - n[0]); return a.length >= 2 ? a : null; }
function gjutProfAt(prof, t) { if (!prof) return 0; if (t <= prof[0][0]) return prof[0][1]; for (let i = 1; i < prof.length; i++) if (t <= prof[i][0]) { const a = prof[i - 1], b = prof[i], k = (t - a[0]) / Math.max(1e-9, b[0] - a[0]); return a[1] + (b[1] - a[1]) * k; } return prof[prof.length - 1][1]; }
/* Formen i lameller längs x: varje lamell har sina y-intervall (inne i polygonen) och sin botten. zbS(x) = bottnen för den lamell x ligger i. */
function gjutProfCtx(poly, H, prof) {
  const xs = poly.map(q => q[0]), minX = Math.min(...xs), maxX = Math.max(...xs), W = Math.max(0.01, maxX - minX), N = Math.max(10, Math.min(90, Math.ceil(W / 0.2))), dx = W / N, n = poly.length, strips = [];
  const zbAt = xc => Math.max(-3, Math.min(H - 0.05, gjutProfAt(prof, (xc - minX) / W)));
  for (let i = 0; i < N; i++) { const xa = minX + i * dx, xb = xa + dx, xc = xa + dx / 2, ys = [];
    for (let k = 0; k < n; k++) { const a = poly[k], b = poly[(k + 1) % n]; if ((a[0] <= xc && b[0] > xc) || (b[0] <= xc && a[0] > xc)) ys.push(a[1] + (xc - a[0]) / (b[0] - a[0]) * (b[1] - a[1])); }
    ys.sort((m, q) => m - q); const iv = []; for (let k = 0; k + 1 < ys.length; k += 2) iv.push([ys[k], ys[k + 1]]); strips.push({ xa, xb, xc, iv, zb: zbAt(xc) }); }
  const zbS = x => strips[Math.max(0, Math.min(N - 1, Math.floor((x - minX) / dx)))].zb;
  let vol = 0, tmin = Infinity, tmax = -Infinity; strips.forEach(s => s.iv.forEach(([y0, y1]) => { vol += dx * (y1 - y0) * (H - s.zb); tmin = Math.min(tmin, H - s.zb); tmax = Math.max(tmax, H - s.zb); }));
  return { minX, maxX, W, N, dx, strips, zbS, vol, tmin, tmax };
}
/* Betongen som ett slutet skal: plan ovansida, väggar längs konturen ner till botten och en bottenyta som följer profilen (med steg mellan lamellerna). */
function gjutConcreteSolid(c, poly, H, PC, zb, opaque) {
  const pts = [], faces = [], P = (x, y, z) => pts.push([x, y, z]), n = poly.length, ccw = TK.area2(poly) >= 0;
  const tri = (a, b, d, nx, ny, nz) => { const A = pts[a - 1], B = pts[b - 1], C = pts[d - 1], ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2]; faces.push(((uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz) >= 0 ? [a, b, d] : [a, d, b]); };
  const quad = (p0, p1, p2, p3, nm) => { const b0 = pts.length; [p0, p1, p2, p3].forEach(q => P(q[0], q[1], q[2])); tri(b0 + 1, b0 + 2, b0 + 3, nm[0], nm[1], nm[2]); tri(b0 + 1, b0 + 3, b0 + 4, nm[0], nm[1], nm[2]); };
  poly.forEach(q => P(q[0], q[1], H)); TK.tri2(poly).forEach(t => tri(t[0] + 1, t[1] + 1, t[2] + 1, 0, 0, 1));
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], dd = Math.hypot(dx, dy); if (dd < 1e-6) continue; const nx = (ccw ? dy : -dy) / dd, ny = (ccw ? -dx : dx) / dd, ts = [0, 1];
    for (let k = 1; k < PC.N; k++) { const xk = PC.minX + k * PC.dx; if ((a[0] < xk && b[0] > xk) || (b[0] < xk && a[0] > xk)) ts.push((xk - a[0]) / dx); } ts.sort((m, q) => m - q);
    for (let j = 0; j + 1 < ts.length; j++) { const t0 = ts[j], t1 = ts[j + 1]; if (t1 - t0 < 1e-6) continue; const x0 = a[0] + dx * t0, y0 = a[1] + dy * t0, x1 = a[0] + dx * t1, y1 = a[1] + dy * t1, z = PC.zbS((x0 + x1) / 2); quad([x0, y0, z], [x1, y1, z], [x1, y1, H], [x0, y0, H], [nx, ny, 0]); } }
  PC.strips.forEach((s, i) => { s.iv.forEach(([y0, y1]) => quad([s.xa, y0, s.zb], [s.xb, y0, s.zb], [s.xb, y1, s.zb], [s.xa, y1, s.zb], [0, 0, -1]));
    const nx = PC.strips[i + 1]; if (nx) s.iv.forEach(([y0, y1]) => nx.iv.forEach(([v0, v1]) => { const lo = Math.max(y0, v0), hi = Math.min(y1, v1); if (hi - lo > 1e-6 && Math.abs(s.zb - nx.zb) > 1e-6) quad([s.xb, lo, Math.min(s.zb, nx.zb)], [s.xb, hi, Math.min(s.zb, nx.zb)], [s.xb, hi, Math.max(s.zb, nx.zb)], [s.xb, lo, Math.max(s.zb, nx.zb)], [s.zb < nx.zb ? 1 : -1, 0, 0]); })); });
  return TK.add(c.T(opaque ? "#a8aeb6" : "#9aa4b2", { transp: opaque ? 0 : 0.55, rough: 0.9 }), { pts, faces }, 0, 0, zb);
}
function gjutStats(p, poly) {
  const clD = Math.max(0, smN(p, "ark", GJ_CLAIM)), H = Math.max(0.05, Number(p.H) || 0.25), area = Math.abs(TK.area2(poly)), n = poly.length; let per = 0; for (let i = 0; i < n; i++) per += Math.hypot(poly[(i + 1) % n][0] - poly[i][0], poly[(i + 1) % n][1] - poly[i][1]);
  const prof = gjutProfGet(p), PC = prof ? gjutProfCtx(poly, H, prof) : null, vol = (PC ? PC.vol : area * H) * (1 + smN(p, "tillagg", 0) / 100), bilar = Math.ceil(vol / Math.max(1, smN(p, "bil", 8))), tim = vol / Math.max(1, smN(p, "kap", 30)), claim = area + per * clD + Math.PI * clD * clD;
  let kg = 0, txt = ""; const layers = [];
  if (smF(p, "arm", "Visa") !== "Dölj") {
    const cover = Math.max(0.01, smN(p, "tak", 40) / 1000), ang = smN(p, "ang", 0) * Math.PI / 180, uD = smN(p, "uD", 12), uS = Math.max(50, smN(p, "uS", 150)), oD = smN(p, "oD", 0), oS = Math.max(50, smN(p, "oS", 150));
    if (uD > 0) layers.push([uD, uS, cover + uD / 2000, cover + uD * 1.5 / 1000]); if (oD > 0) layers.push([oD, oS, H - cover - oD * 1.5 / 1000, H - cover - oD / 2000]);
    layers.forEach(([d, sMM, z1, z2]) => [[ang, z1], [ang + Math.PI / 2, z2]].forEach(([a]) => gjutScan(poly, a, sMM / 1000, cover).forEach(([q0, q1]) => { kg += Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) * d * d / 162; })));
    txt = layers.map(([d, sMM], li) => `${li ? "Övre" : "Undre"} Ø${d} c/c${sMM}`).join(" · ");
  }
  return { H, area, per, vol, bilar, tim, claim, kg, txt, layers, prof, PC };
}
const gjutCalc = (p, poly) => { const t = gjutStats(p, poly); return [["Yta", smFmt(t.area, 1) + " m²"], t.PC ? ["Tjocklek", smFmt(t.PC.tmin * 1000, 0) + "–" + smFmt(t.PC.tmax * 1000, 0) + " mm (följer berget)"] : ["Tjocklek", smFmt(t.H * 1000, 0) + " mm"], ["Volym", smFmt(t.vol, 1) + " m³"], ["Betongbilar", `ca ${t.bilar} st · ${smFmt(t.tim, 1)} h`], ...(t.txt ? [["Armering", smFmt(t.kg, 0) + " kg · " + smFmt(t.kg / Math.max(0.1, t.vol), 0) + " kg/m³"]] : []), ["Markanspråk", "ca " + smFmt(t.claim, 0) + " m² (med 1 m runt om)"]]; };
/* Utskärningens hörn (lokalt, relativt mitten) för handtagen: [tecken, x, y] – L-form ett hörn, T- och U-form två. */
function gjutCuts(p) {
  const L = p.L / 2, B = p.B / 2, f = smF(p, "form", "Rektangel"), cl = Math.max(0.5, Math.min(smN(p, "cutL", 4), p.L - 1)), cb = Math.max(0.5, Math.min(smN(p, "cutB", 3), p.B - 1)), corners = [];
  if (f === "L-form") corners.push([1, L - cl, B - cb]);
  else if (f === "T-form") corners.push([1, L - cl, B - cb], [-1, -(L - cl), B - cb]);
  else if (f === "U-form") corners.push([1, cl / 2, B - cb], [-1, -cl / 2, B - cb]);
  return { form: f, corners };
}
/* Stödbenens lägen (för klick-och-ta-bort i modellen): lokala mittpunkter för varje snedstag. Samma uppdelning som i gjutBuild. */
function gjutStuds(p, poly, free) {
  const st = gjutStats(p, poly), H = st.H, n = poly.length, ccw = TK.area2(poly) >= 0, RG = String(smF(p, "reg", "45x125")).split("x").map(Number), rw = (RG[0] || 45) / 1000, rh = (RG[1] || 125) / 1000, out = [];
  const svA = Math.max(10, Math.min(80, smN(p, "sv", 45))) * Math.PI / 180, suM = smN(p, "su", 0), stagOf = zl => suM > 0.05 ? suM : Math.max(0.3, (H + 0.24 - zl) * Math.tan(svA));
  if (smF(p, "riv", "Kvar") === "Riven") return out;
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], dd = Math.hypot(dx, dy); if (dd < 0.02) continue; const nx = (ccw ? dy : -dy) / dd, ny = (ccw ? -dx : dx) / dd, k = Math.max(1, Math.round(dd / 1.0));
    for (let j = 0; j <= k; j++) { if (j === k && dd > 0.5) continue; const t = j / k, x = a[0] + dx * t + nx * (rw + rh / 2), y = a[1] + dy * t + ny * (rw + rh / 2), zlo = st.PC ? st.PC.zbS(x) : 0, so = stagOf(zlo), hd = rh / 2;
      out.push({ id: i + "." + j, x: x + nx * (hd + so / 2), y: y + ny * (hd + so / 2), z: (H + 0.22 + zlo) / 2 }); } }
  return out;
}
function gjutBuild(p, c, poly, zb, free) {
  const st = gjutStats(p, poly), H = st.H, xs = poly.map(q => q[0]), ys = poly.map(q => q[1]), minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys), v = st.vol;
  const riven = smF(p, "riv", "Kvar") === "Riven", RG = String(smF(p, "reg", "45x125")).split("x").map(Number), rw = (RG[0] || 45) / 1000, rh = (RG[1] || 125) / 1000;
  if (st.PC) gjutConcreteSolid(c, poly, H, st.PC, zb, riven); else c.prism(riven ? "#a8aeb6" : "#9aa4b2", poly, zb, zb + H, { transp: riven ? 0 : 0.55, rough: 0.9 });                                         // betongen (genomskinlig så att armeringen syns); med bottenprofil följer botten berget
  const ccw = TK.area2(poly) >= 0, n = poly.length, WOOD = "#c9a15f", WOOD2 = "#a9824a", nrm = i => { const a = poly[i], b = poly[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], dd = Math.hypot(dx, dy) || 1; return [(ccw ? dy : -dy) / dd, (ccw ? -dx : dx) / dd, dd]; };
  // formsidan: formbräda (tjocklek = regelns bredd), stöttor av regel (standard 45 × 125 mm, högkant mot formen) var meter med snedstag av samma regel ca 45° ut mot marken, toppregel – bort när formen är riven
  const sbx = new Set(String(smF(p, "sbx", "")).split(",").filter(Boolean)), svA = Math.max(10, Math.min(80, smN(p, "sv", 45))) * Math.PI / 180, suM = smN(p, "su", 0), stagOf = zl => suM > 0.05 ? suM : Math.max(0.3, (H + 0.24 - zl) * Math.tan(svA));   // snedstagets utstick: valt mått, annars ur vinkeln mot lodlinjen
  if (!riven) for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n], [nx, ny, dd] = nrm(i); if (dd < 0.02) continue;
    { const m = st.PC ? Math.max(1, Math.ceil(dd / 0.5)) : 1; for (let j = 0; j < m; j++) { const t0 = j / m, t1 = (j + 1) / m, ax0 = a[0] + (b[0] - a[0]) * t0, ay0 = a[1] + (b[1] - a[1]) * t0, ax1 = a[0] + (b[0] - a[0]) * t1, ay1 = a[1] + (b[1] - a[1]) * t1, zlo = st.PC ? st.PC.zbS((ax0 + ax1) / 2) : 0;
      c.prism(WOOD, [[ax0, ay0], [ax1, ay1], [ax1 + nx * rw, ay1 + ny * rw], [ax0 + nx * rw, ay0 + ny * rw]], zb + zlo - 0.02, zb + H + 0.1, { rough: 0.85 }); } }
    const k = Math.max(1, Math.round(dd / 1.0)), tx = (b[0] - a[0]) / dd, ty = (b[1] - a[1]) / dd;
    for (let j = 0; j <= k; j++) { const t = j / k, x = a[0] + (b[0] - a[0]) * t + nx * (rw + rh / 2), y = a[1] + (b[1] - a[1]) * t + ny * (rw + rh / 2); if (j === k && dd > 0.5) continue; const zlo = st.PC ? st.PC.zbS(x) : 0, hw = rw / 2, hd = rh / 2;   // regeln står med den höga sidan vinkelrätt mot formen
      c.prism(WOOD2, [[x - tx * hw - nx * hd, y - ty * hw - ny * hd], [x + tx * hw - nx * hd, y + ty * hw - ny * hd], [x + tx * hw + nx * hd, y + ty * hw + ny * hd], [x - tx * hw + nx * hd, y - ty * hw + ny * hd]], zb + zlo - 0.12, zb + H + 0.32, { rough: 0.85 });
      if (!sbx.has(i + "." + j)) c.beam(WOOD2, [x + nx * hd, y + ny * hd, zb + H + 0.22], [x + nx * (hd + stagOf(zlo)), y + ny * (hd + stagOf(zlo)), zb + zlo - 0.02], rw, rh, { rough: 0.85 });                          // snedstag: samma regel, lutad ut från stöttan
      if (!sbx.has(i + "." + j)) { const fx = x + nx * (hd + stagOf(zlo)), fy = y + ny * (hd + stagOf(zlo)), fz = zb + zlo; c.box(WOOD, fx, fy, fz + 0.015, 0.5, rh + 0.05, 0.03, Math.atan2(ty, tx), 0, { rough: 0.9 });   // markreglar under snedstagets fot
        c.rod("#475569", [fx, fy, fz + 0.03], [fx, fy, fz - 0.28], 0.012, 0.012, 6, { metal: 0.8, rough: 0.4 }); }                                                                   // stålpinne som fäster foten
      if (H > 0.4 && j < k) { const mz = zb + zlo + (H + 0.3) * 0.45; c.rod("#94a3b8", [x - nx * (rw + 0.02), y - ny * (rw + 0.02), mz], [x + nx * (hd * 2 + 0.03), y + ny * (hd * 2 + 0.03), mz], 0.007, 0.007, 6, { metal: 0.85, rough: 0.35 }); }   // formstag (genomgående bult)
    }
    c.prism(WOOD, [[a[0] + nx * rw, a[1] + ny * rw], [b[0] + nx * rw, b[1] + ny * rw], [b[0] + nx * (rw + rh), b[1] + ny * (rw + rh)], [a[0] + nx * (rw + rh), a[1] + ny * (rw + rh)]], zb + H + 0.1, zb + H + 0.1 + rw, { rough: 0.85 }); }
  // markanspråk: orange kontur 1 m utanför formen (och en mjuk fyllning längs kanten), så att man ser hur mycket mark etappen tar
  const D = Math.max(0, smN(p, "ark", GJ_CLAIM)), off = i => { const [nx, ny] = nrm(i); return [nx * D, ny * D]; }, band = (p0, p1, w, col, tr) => { const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dd = Math.hypot(dx, dy); if (dd < 0.01) return; const ux = -dy / dd * w / 2, uy = dx / dd * w / 2; c.prism(col || "#f97316", [[p0[0] + ux, p0[1] + uy], [p1[0] + ux, p1[1] + uy], [p1[0] - ux, p1[1] - uy], [p0[0] - ux, p0[1] - uy]], zb + 0.004 + (tr ? 0 : 0.004), zb + 0.012 + (tr ? 0 : 0.004), { unlit: true, deco: true, ...(tr ? { transp: tr } : {}) }); };
  if (!riven && D > 0.01) for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n], o = off(i), on = off((i + 1) % n), a2 = [a[0] + o[0], a[1] + o[1]], b2 = [b[0] + o[0], b[1] + o[1]];
    c.prism("#fb923c", [[a[0], a[1]], [b[0], b[1]], [b2[0], b2[1]], [a2[0], a2[1]]], zb + 0.002, zb + 0.006, { unlit: true, deco: true, transp: 0.82 });                             // mjuk fyllning av arbetsytan
    band(a2, b2, 0.34, "#f97316", 0.8); band(a2, b2, 0.14, "#fdba74", 0.45);                                                                                                           // glow runt kontur
    const L = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]); for (let t = 0; t < L; t += 0.5) { const q0 = [a2[0] + (b2[0] - a2[0]) * t / L, a2[1] + (b2[1] - a2[1]) * t / L], q1 = [a2[0] + (b2[0] - a2[0]) * Math.min(L, t + 0.3) / L, a2[1] + (b2[1] - a2[1]) * Math.min(L, t + 0.3) / L]; band(q0, q1, 0.09, "#ea580c", 0); }   // kraftig streckad kontur
    band(b2, [b[0] + on[0], b[1] + on[1]], 0.09, "#ea580c", 0); }
  let kg = st.kg; const txt = st.txt;
  if (st.layers.length) {
    const cover = Math.max(0.01, smN(p, "tak", 40) / 1000), ang = smN(p, "ang", 0) * Math.PI / 180;
    st.layers.forEach(([d, sMM, z1, z2], li) => { let s = sMM / 1000; const side = Math.max(maxX - minX, maxY - minY); if (side / s > 70) s = side / 70; // för många stänger: visa glesare (mängden räknas ändå med riktig delning)
      const mat = { metal: 0.85, rough: 0.35, shin: 90 }, colr = li ? "#3b82f6" : "#64748b", rr = Math.max(d / 2000, 0.005), A = gjutScan(poly, ang, s, cover), B = gjutScan(poly, ang + Math.PI / 2, s, cover);   // nät: båda riktningarna, stavar syns minst 10 mm
      const bar = (q0, q1, z) => { if (!st.PC || li) return c.rod(colr, [q0[0], q0[1], zb + z], [q1[0], q1[1], zb + z], rr, rr, 6, mat);
        const len = Math.hypot(q1[0] - q0[0], q1[1] - q0[1]), m = Math.max(1, Math.ceil(len / 0.5));                                                                                   // undre nätet följer berget
        for (let j = 0; j < m; j++) { const t0 = j / m, t1 = (j + 1) / m, x0 = q0[0] + (q1[0] - q0[0]) * t0, y0 = q0[1] + (q1[1] - q0[1]) * t0, x1 = q0[0] + (q1[0] - q0[0]) * t1, y1 = q0[1] + (q1[1] - q0[1]) * t1, zz = Math.max(z, st.PC.zbS((x0 + x1) / 2) + cover + d * 1.5 / 1000); if (zz < H - cover) c.rod(colr, [x0, y0, zb + zz], [x1, y1, zb + zz], rr, rr, 6, mat); } };
      A.forEach(([q0, q1]) => bar(q0, q1, z1)); B.forEach(([q0, q1]) => bar(q0, q1, z2));
      const X = [];                                                                                                                    // skärningspunkter = svetsar/bindtråd, så att det läses som ett nät
      A.forEach(([a0, a1]) => B.forEach(([b0, b1]) => { const r = [a1[0] - a0[0], a1[1] - a0[1]], q = [b1[0] - b0[0], b1[1] - b0[1]], den = r[0] * q[1] - r[1] * q[0]; if (Math.abs(den) < 1e-9) return; const w = [b0[0] - a0[0], b0[1] - a0[1]], t = (w[0] * q[1] - w[1] * q[0]) / den, u = (w[0] * r[1] - w[1] * r[0]) / den; if (t >= 0 && t <= 1 && u >= 0 && u <= 1) X.push([a0[0] + r[0] * t, a0[1] + r[1] * t]); }));
      const stp = Math.max(1, Math.ceil(X.length / 380)), zm = zb + (z1 + z2) / 2, ds = Math.max(d * 2.4 / 1000, 0.016);
      X.forEach((q, i) => { if (i % stp) return; if (!st.PC || li) c.box(li ? "#1d4ed8" : "#334155", q[0], q[1], (st.PC && !li) ? Math.max(zm, zb + st.PC.zbS(q[0]) + cover + d * 2 / 1000) : zm, ds, ds, Math.abs(z2 - z1) + rr * 2, ang, 0, { seg: 1 }); });
      if (!li && !st.PC) X.forEach((q, i) => { if (i % (stp * 3) || z1 < 0.03) return; c.box("#9ca3af", q[0], q[1], zb + (z1 - rr) / 2, 0.035, 0.035, z1 - rr, ang + 0.4, 0, { seg: 1 }); });   // distansbockar under nätet
    });
  }
  const mx = (minX + maxX) / 2, my = (minY + maxY) / 2, ar = Math.min(2.4, Math.max(0.8, (maxX - minX) * 0.16));
  c.prism("#f59e0b", [[-1.6, -0.35], [0.4, -0.35], [0.4, -0.8], [1.8, 0], [0.4, 0.8], [0.4, 0.35], [-1.6, 0.35]].map(([x, y]) => [mx + x * ar / 1.8, my + y * ar / 1.8]), zb + H + 0.01, zb + H + 0.03, { unlit: true, deco: true });  // gjutriktning
  c.card({ title: String(p.name || "Gjutetapp"), icon: "box", color: "#475569", left: ["m³", smFmt(v, 1)], rows: [["Kvalitet", smF(p, "kval", "C30/37")], ["Pumpplats / start", [smF(p, "pump"), smF(p, "start", "07:00")].filter(Boolean).join(" · ")], ["Bilar / pumptid", `ca ${st.bilar} bilar · ${smFmt(st.tim, 1)} h`], ...(txt ? [["Armering", txt], ["Stål", `${smFmt(kg, 0)} kg · ${smFmt(kg / Math.max(0.1, v), 0)} kg/m³`]] : []), ["Markanspråk", `ca ${smFmt(st.claim, 0)} m²`]], b0: minY - 1.6, zb: 2.45 + zb });
}
/* ---- Makadam: yta, fraktion och tjocklek; objekt som står "i" gruset (fundament, bodar, IFC-objekt) dras av så att volymen blir verklig (Victor 2026-10-24) ---- */
const MK_FR = [["0–16", "0–16 mm"], ["0–32", "0–32 mm (bärlager)"], ["0–63", "0–63 mm"], ["4–8", "4–8 mm (dränering)"], ["8–16", "8–16 mm (dränering)"], ["16–32", "16–32 mm (dränering)"], ["32–64", "32–64 mm (dränering)"]];
const MK_DENS = { "0–16": 2.1, "0–32": 2.15, "0–63": 2.2, "4–8": 1.5, "8–16": 1.55, "16–32": 1.6, "32–64": 1.65 }, MK_COL = { "0–16": "#8f897f", "0–32": "#827c72", "0–63": "#756f66", "4–8": "#9d978c", "8–16": "#8c867b", "16–32": "#7e786e", "32–64": "#6f695f" };
const MK_FIELDS = (free) => [["H", "Tjocklek", "range", 0.3, { min: 0.05, max: 1.5, step: 0.05, unit: "m", dim: true }], ["fr", "Fraktion", MK_FR, "0–32"], ["pack", "Packningsmån (lös massa)", "range", 15, { min: 0, max: 30, step: 1, unit: "%" }], ["avdrag", "Dra av objekt i makadamen", ["Ja", "Nej"], "Ja", { seg: true }], ...(free ? [["radie", "Hörnradie", "range", 0, { min: 0, max: 4, step: 0.25, unit: "m" }]] : []), ["_calc", "Beräknat", "calc"]];
const mkBase = p => (p.type === "sm:makadamfri" ? (((p.pts || [])[0] || [])[2] || 0) : (Number(p.z) || 0)) + (Number(p.dz) || 0);
function mkPoly(p) { if (p.type === "sm:makadamfri") { const P = p.pts || [], ox = Number(p.x) || 0, oy = Number(p.y) || 0; return P.length < 3 ? null : smFillet(P.map(q => [q[0] - ox, q[1] - oy, 0]), smN(p, "radie", 0), true).map(q => [q[0], q[1]]); } const L = p.L / 2, B = p.B / 2; return [[-L, -B], [L, -B], [L, B], [-L, B]]; }
const mkToLocal = p => { if (p.type === "sm:makadamfri") { const ox = Number(p.x) || 0, oy = Number(p.y) || 0; return (X, Y) => [X - ox, Y - oy]; } const t = (Number(p.rot) || 0) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t); return (X, Y) => { const dx = X - p.x, dy = Y - p.y; return [dx * c + dy * s, -dx * s + dy * c]; }; };
function mkHull(P) { P = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (P.length < 3) return P; const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = []; for (const q of P) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); } for (let i = P.length - 1; i >= 0; i--) { const q = P[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); } return lo.slice(0, -1).concat(up.slice(0, -1)); }
/* Objekt som skär makadamlagret: placerade objekt (låda med läge och vridning) och objekt i inlästa IFC-modeller (fotavtryck = konvex yta av deras hörn). Returnerar polygoner i makadamens lokala system. */
function mkCuts(p, poly, base, th) {
  const toL = mkToLocal(p), out = [], z1 = base + th, xs = poly.map(q => q[0]), ys = poly.map(q => q[1]), bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const near = pl => pl.some(q => q[0] >= bb[0] - 0.5 && q[0] <= bb[2] + 0.5 && q[1] >= bb[1] - 0.5 && q[1] <= bb[3] + 0.5) || (Math.min(...pl.map(q => q[0])) <= bb[2] && Math.max(...pl.map(q => q[0])) >= bb[0] && Math.min(...pl.map(q => q[1])) <= bb[3] && Math.max(...pl.map(q => q[1])) >= bb[1]);
  (typeof placements !== "undefined" ? placements : []).forEach(q => { if (q === p || q.id === p.id || !q.L || !q.B) return; const lib = typeof placeLib === "function" ? placeLib(q.type) : null; if (lib && lib.fence) return; if (/^sm:(makadam|makadamfri|riskzon|gjutform)$/.test(String(q.type))) return;
    const H = Number(q.H) || 0, zq = (Number(q.z) || 0) + (Number(q.dz) || 0); if (H < 0.1 || zq >= z1 - 0.01 || zq + H <= base + 0.01) return;
    const t = (Number(q.rot) || 0) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t), L = q.L / 2, B = q.B / 2, pl = [[-L, -B], [L, -B], [L, B], [-L, B]].map(([a, b]) => toL(q.x + a * c - b * s, q.y + a * s + b * c)); if (near(pl)) out.push({ poly: pl, name: q.name || q.type }); });
  if (typeof l3b !== "undefined" && typeof l3 !== "undefined" && l3 && l3.O && typeof l3bsBoxes === "function") { const O = l3.O, wx0 = bb[0], wy0 = bb[1]; let wb = null;   // IFC-modellerna
    const toW = p.type === "sm:makadamfri" ? (a, b) => [a + (Number(p.x) || 0), b + (Number(p.y) || 0)] : (a, b) => { const t = (Number(p.rot) || 0) * Math.PI / 180; return [p.x + a * Math.cos(t) - b * Math.sin(t), p.y + a * Math.sin(t) + b * Math.cos(t)]; };
    const cw = [[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]]].map(([a, b]) => toW(a, b)); wb = [Math.min(...cw.map(q => q[0])) - 0.3, Math.min(...cw.map(q => q[1])) - 0.3, Math.max(...cw.map(q => q[0])) + 0.3, Math.max(...cw.map(q => q[1])) + 0.3];
    l3b.models.forEach(m => { if (!m.visible || !m.meshes) return; m.meshes.forEach(mesh => { const u = mesh.userData.l3b; if (!u || !u.ranges) return; const boxes = l3bsBoxes(mesh), pos = mesh.geometry.getAttribute("position").array, mo = mesh.position || { x: 0, y: 0, z: 0 };
      for (let i = 0; i < u.ranges.length && out.length < 400; i++) { if (u.hidden && u.hidden.has(i)) continue; const k = i * 6, x0 = boxes[k] + mo.x + O[0], y0 = boxes[k + 1] + mo.y + O[1], z0 = boxes[k + 2] + mo.z + O[2], x1 = boxes[k + 3] + mo.x + O[0], y1 = boxes[k + 4] + mo.y + O[1], z1b = boxes[k + 5] + mo.z + O[2];
        if (x1 < wb[0] || x0 > wb[2] || y1 < wb[1] || y0 > wb[3] || z0 >= z1 - 0.01 || z1b <= base + 0.01) continue;
        const r = u.ranges[i], pts = []; for (let v = r.start; v < r.start + r.count; v += Math.max(1, Math.floor(r.count / 400))) pts.push(toL(pos[v * 3] + mo.x + O[0], pos[v * 3 + 1] + mo.y + O[1])); const h = mkHull(pts); if (h.length >= 3) out.push({ poly: h, name: r.name || "IFC-objekt" }); } }); }); }
  return out;
}
/* Makadamen minus avdragen: { outer/holes via polygon-clipping, area, gross, cuts }. */
function mkShape(p) {
  const poly = mkPoly(p); if (!poly) return null; const th = Math.max(0.05, Number(p.H) || 0.3), base = mkBase(p), ring = r => r.map(q => [q[0], q[1]]), area = r => { let a = 0; for (let i = 0; i < r.length; i++) { const A = r[i], B = r[(i + 1) % r.length]; a += A[0] * B[1] - B[0] * A[1]; } return Math.abs(a) / 2; };
  const gross = area(poly), use = smF(p, "avdrag", "Ja") !== "Nej" && typeof polygonClipping !== "undefined", cuts = use ? mkCuts(p, poly, base, th) : []; let mp = [[ring(poly)]];
  if (cuts.length) { try { mp = polygonClipping.difference([ring(poly)], ...cuts.map(c => [ring(c.poly)])); } catch (e) { mp = [[ring(poly)]]; } }
  const closed = r => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) ? r.slice(0, -1) : r; let net = 0; mp.forEach(pg => pg.forEach((r, i) => { const rr = closed(r); net += (i ? -1 : 1) * area(rr); }));
  return { poly, th, base, gross, net: Math.max(0, net), mp, cuts, cutArea: Math.max(0, gross - net) };
}
function mkStats(p, sh) { const dens = MK_DENS[smF(p, "fr", "0–32")] || 2.1, vol = sh.net * sh.th, lose = vol * (1 + smN(p, "pack", 15) / 100); return { vol, lose, ton: vol * dens, dens }; }
const mkCalc = p => { const sh = mkShape(p); if (!sh) return []; const st = mkStats(p, sh); return [["Yta", smFmt(sh.gross, 1) + " m²"], ["Avdrag", sh.cuts.length ? `${sh.cuts.length} objekt · −${smFmt(sh.cutArea, 1)} m²` : "inga"], ["Netto yta", smFmt(sh.net, 1) + " m²"], ["Volym packad", smFmt(st.vol, 1) + " m³"], ["Att beställa", smFmt(st.lose, 1) + " m³ lös"], ["Vikt", "ca " + smFmt(st.ton, 0) + " ton"]]; };
function mkBuild(p, c) {
  const sh = mkShape(p); if (!sh) { (p.pts || []).forEach(q => c.cyl("#f59e0b", "z", q[0] - (Number(p.x) || 0), q[1] - (Number(p.y) || 0), 0.5, 0.12, 0.12, 1, 10)); return; }
  const fr = smF(p, "fr", "0–32"), col = MK_COL[fr] || "#aaa49a", zb = p.type === "sm:makadamfri" ? sh.base - c.z : 0, th = sh.th, st = mkStats(p, sh), rings = []; sh.mp.forEach(pg => pg.forEach(r => rings.push((r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) ? r.slice(0, -1) : r)));
  const xs = sh.poly.map(q => q[0]), minX = Math.min(...xs), maxX = Math.max(...xs), N = Math.max(8, Math.min(140, Math.ceil((maxX - minX) / 0.15))), dx = (maxX - minX) / N; let prev = null, run = null; const runs = [];
  for (let i = 0; i < N; i++) { const xc = minX + (i + 0.5) * dx, ys = []; rings.forEach(r => { for (let k = 0; k < r.length; k++) { const a = r[k], b = r[(k + 1) % r.length]; if ((a[0] <= xc && b[0] > xc) || (b[0] <= xc && a[0] > xc)) ys.push(a[1] + (xc - a[0]) / (b[0] - a[0]) * (b[1] - a[1])); } }); ys.sort((m, q) => m - q);
    const iv = []; for (let k = 0; k + 1 < ys.length; k += 2) if (ys[k + 1] - ys[k] > 0.01) iv.push([ys[k], ys[k + 1]]); const key = iv.map(q => q[0].toFixed(2) + "," + q[1].toFixed(2)).join("|");
    if (run && key === run.key) run.xb = minX + (i + 1) * dx; else { if (run) runs.push(run); run = { key, iv, xa: minX + i * dx, xb: minX + (i + 1) * dx }; } } if (run) runs.push(run);
  runs.forEach(r => r.iv.forEach(([y0, y1]) => c.prism(col, [[r.xa, y0], [r.xb, y0], [r.xb, y1], [r.xa, y1]], zb, zb + th, { rough: 1 })));
  // avdragen markeras med en tunn mörk kontur ovanpå (så att man ser vad som sparats ut)
  sh.cuts.forEach(cu => { const pl = cu.poly; for (let i = 0; i < pl.length; i++) { const a = pl[i], b = pl[(i + 1) % pl.length], dxx = b[0] - a[0], dyy = b[1] - a[1], dd = Math.hypot(dxx, dyy); if (dd < 0.05) continue; const ux = -dyy / dd * 0.02, uy = dxx / dd * 0.02; c.prism("#475569", [[a[0] + ux, a[1] + uy], [b[0] + ux, b[1] + uy], [b[0] - ux, b[1] - uy], [a[0] - ux, a[1] - uy]], zb + th, zb + th + 0.012, { unlit: true, deco: true }); } });
  c.card({ title: String(p.name || "Makadam"), icon: "box", color: "#78716c", left: ["m³", smFmt(st.vol, 1)], rows: [["Fraktion", fr + " mm"], ["Tjocklek", smFmt(th * 1000, 0) + " mm"], ["Yta netto", smFmt(sh.net, 1) + " m²" + (sh.cuts.length ? ` (−${sh.cuts.length} objekt)` : "")], ["Beställ / vikt", `${smFmt(st.lose, 1)} m³ lös · ca ${smFmt(st.ton, 0)} ton`]], b0: Math.min(...sh.poly.map(q => q[1])) - 1.2, zb: 2.2 + zb });
}
/* ---- Ställning: modulställning (Layher-lik) som anpassar sig efter höjd, längd och bredd – stolpar med rosetter, regelverk, plattformar, räcken, sparkplåt, diagonaler, trapptorn, förankring och skyddsnät (Victor 2026-10-24) ---- */
function stallningBuild(p, c) {
  const L = Math.max(2, Number(p.L) || 10), B = Math.max(0.6, Number(p.B) || 0.75), H = Math.max(1.5, Number(p.H) || 10), fack = Math.max(0.7, smN(p, "fack", 2.57)), vh = Math.max(1, smN(p, "vh", 2)), STE = "#c9d0d8", STE2 = "#aeb7c1", DECK = "#8d97a3", WOOD = "#c9a15f", acc = p.color || "#eab308";
  const nb = Math.max(1, Math.round(L / fack)), bay = L / nb, nl = Math.max(1, Math.round(H / vh)), lh = H / nl, x0 = -L / 2, yF = -B / 2, yB = B / 2, plat = smF(p, "plats", "alla"), skydd = smF(p, "skydd", "Nät"), trapp = smF(p, "trapp", "Ja") !== "Nej", ank = smF(p, "ank", "Ja") !== "Nej";
  const hasDeck = k => k >= 1 && (plat === "alla" || (plat === "var2" && k % 2 === 0) || (plat === "topp" && k === nl)), rod = (a, b, r, col) => c.rod(col || STE, a, b, r, r, 6, SMM), X = i => x0 + i * bay;
  let nStd = 0, nLed = 0, nDeck = 0;
  // stolpar med fotplatta, ställbar fot och rosett vid varje våning
  for (let i = 0; i <= nb; i++) [yF, yB].forEach(y => { nStd++; c.rod(STE, [X(i), y, 0.1], [X(i), y, H + 1.05], 0.024, 0.024, 8, SMM);
    c.box("#6b7280", X(i), y, 0.005, 0.16, 0.16, 0.01, null, 0.004, SMM); c.cyl("#dc2626", "z", X(i), y, 0.06, 0.018, 0.018, 0.12, 8, null, SMM);
    for (let k = 0; k <= nl; k++) c.cyl("#9aa4b0", "z", X(i), y, k * lh + (k === 0 ? 0.2 : 0), 0.058, 0.058, 0.01, 12, null, SMM); });
  // regelverk: längsgående rör (fram och bak) och tvärgående rör vid varje våning, räcken på fasadsidan, sparkplåt, diagonaler
  for (let k = 0; k <= nl; k++) { const z = k === 0 ? 0.2 : k * lh;
    for (let i = 0; i < nb; i++) { [yF, yB].forEach(y => { rod([X(i), y, z], [X(i + 1), y, z], 0.02); nLed++; }); }
    for (let i = 0; i <= nb; i++) rod([X(i), yF, z], [X(i), yB, z], 0.02, STE2);
    if (hasDeck(k)) {
      for (let i = 0; i < nb; i++) { c.box(DECK, (X(i) + X(i + 1)) / 2, 0, z + 0.025, bay - 0.04, B - 0.06, 0.04, null, 0.006, { metal: 0.6, rough: 0.5 }); nDeck++;
        for (let r = 1; r < 4; r++) c.box("#7a8591", (X(i) + X(i + 1)) / 2, -B / 2 + 0.03 + (B - 0.12) * r / 4, z + 0.048, bay - 0.1, 0.012, 0.006, null, 0, SMM);                      // räfflor i plåten
        c.box(WOOD, (X(i) + X(i + 1)) / 2, yF - 0.01, z + 0.16, bay - 0.04, 0.025, 0.15, null, 0.004, { rough: 0.9 }); c.box(WOOD, (X(i) + X(i + 1)) / 2, yB + 0.01, z + 0.16, bay - 0.04, 0.025, 0.15, null, 0.004, { rough: 0.9 }); }                // sparkplåt
      [0.5, 1.0].forEach((h, hi) => { for (let i = 0; i < nb; i++) { rod([X(i), yF, z + h], [X(i + 1), yF, z + h], 0.02, hi ? acc : STE); rod([X(i), yB, z + h], [X(i + 1), yB, z + h], 0.02, hi ? acc : STE); }
        rod([x0, yF, z + h], [x0, yB, z + h], 0.02, hi ? acc : STE); rod([-x0, yF, z + h], [-x0, yB, z + h], 0.02, hi ? acc : STE); });                                          // sidoräcken i ändarna
    }
  }
  const top = H; for (let i = 0; i < nb; i++) { [yF, yB].forEach(y => { rod([X(i), y, top + 0.5], [X(i + 1), y, top + 0.5], 0.02, STE); rod([X(i), y, top + 1.0], [X(i + 1), y, top + 1.0], 0.02, acc); }); }
  rod([x0, yF, top + 0.5], [x0, yB, top + 0.5], 0.02); rod([-x0, yF, top + 0.5], [-x0, yB, top + 0.5], 0.02); rod([x0, yF, top + 1.0], [x0, yB, top + 1.0], 0.02, acc); rod([-x0, yF, top + 1.0], [-x0, yB, top + 1.0], 0.02, acc);
  for (let k = 0; k < nl; k++) { const z0 = (k === 0 ? 0.2 : k * lh), z1 = (k + 1) * lh; for (let i = 0; i < nb; i++) if ((i + k) % 2 === 0) { const a = (i + k) % 4 === 0; rod([a ? X(i) : X(i + 1), yF, z0], [a ? X(i + 1) : X(i), yF, z1], 0.014, STE2); } rod([x0, yF, z0], [x0, yB, z1], 0.014, STE2); rod([-x0, yB, z0], [-x0, yF, z1], 0.014, STE2); }        // diagonalstag
  // trapptorn i sista fältet: trappstegen växlar sida varje våning
  if (trapp && nl > 0) for (let k = 0; k < nl; k++) { if (!hasDeck(k) && k > 0) continue; const z0 = (k === 0 ? 0.2 : k * lh), a0 = X(nb - 1) + 0.15, a1 = X(nb) - 0.15, up = k % 2 === 0, xs = up ? [a0, a1] : [a1, a0], ys = (up ? yF : yB) + (up ? 0.12 : -0.12);
    [-0.06, 0.06].forEach(dy => rod([xs[0], ys + dy, z0], [xs[1], ys + dy, z0 + lh], 0.014, STE)); const nst = 7; for (let s2 = 0; s2 < nst; s2++) { const t = (s2 + 0.5) / nst; c.box("#9aa4ae", xs[0] + (xs[1] - xs[0]) * t, ys, z0 + lh * t, Math.abs(xs[1] - xs[0]) / nst * 0.8, 0.22, 0.012, null, 0.002, SMM); } }
  // förankring mot väggen (baksidan) var 4:e meter
  if (ank) for (let k = 2; k <= nl; k += 2) for (let i = 0; i <= nb; i += 2) { const z = k * lh; rod([X(i), yB, z], [X(i), yB + 0.5, z], 0.016, "#6b7280"); c.box("#6b7280", X(i), yB + 0.5, z, 0.14, 0.012, 0.14, null, 0.003, SMM); }
  // skyddsnät/presenning/plank på fasadsidan
  if (skydd === "Nät") c.box("#16a34a", 0, yF - 0.05, H / 2 + 0.5, L + 0.05, 0.01, H + 1, null, 0, { transp: 0.55, rough: 1 });
  else if (skydd === "Presenning") c.box("#e5e7eb", 0, yF - 0.05, H / 2 + 0.5, L + 0.05, 0.012, H + 1, null, 0, { transp: 0.25, rough: 1 });
  else if (skydd === "Plank") for (let k = 1; k <= nl; k++) c.box(WOOD, 0, yF - 0.04, k * lh + 0.75, L, 0.02, 0.18, null, 0.003, { rough: 0.9 });
  c.card({ title: String(p.name || "Ställning"), icon: "box", color: "#475569", left: ["m", smFmt(H, 1)], rows: [["Höjd × längd", `${smFmt(H, 1)} × ${smFmt(L, 1)} m`], ["Våningar / fack", `${nl} st · ${nb} st`], ["Fasadyta", `${smFmt(L * H, 0)} m²`], ["Skydd", skydd]], b0: yF - 0.9, zb: H + 1.4 });
}
const stallningCalc = p => { const L = Math.max(2, Number(p.L) || 10), H = Math.max(1.5, Number(p.H) || 10), fack = Math.max(0.7, smN(p, "fack", 2.57)), vh = Math.max(1, smN(p, "vh", 2)), nb = Math.max(1, Math.round(L / fack)), nl = Math.max(1, Math.round(H / vh)); return [["Fack", `${nb} st à ${smFmt(L / nb, 2)} m`], ["Våningar", `${nl} st à ${smFmt(H / nl, 2)} m`], ["Stolpar", `${(nb + 1) * 2} st`], ["Fasadyta", smFmt(L * H, 0) + " m²"]]; };
const SM = {
  leverans: { group: "Logistik", label: "Leverans / upplag", color: "#f59e0b", L: 2.4, B: 1.2, H: 1.1, icon: "box", fields: [["innehall", "Innehåll", "text", "HD/F pelare ×12"], ["lev", "Leverantör", "text", ""], ["datum", "Leveransdatum", "date", ""], ["status", "Status", ["Beställd", "På väg", "Levererad"], "Beställd"]],
    build(p, c) { const L = p.L / 2, B = p.B / 2, st = smF(p, "status", "Beställd"), sc = SM_ST[st] || "#f59e0b", H = Math.max(0.5, p.H);
      [-0.8, 0, 0.8].forEach(a => c.box("#a16f3a", a * L, 0, 0.07, 0.22, p.B + 0.04, 0.12, null, 0.02)); [-0.55, 0, 0.55].forEach(b => c.box("#b8844a", 0, b * B, 0.15, p.L + 0.04, 0.12, 0.03, null, 0.01)); // lastpall
      c.box("#8a5a2b", 0, 0, 0.12, p.L, p.B, 0.06, null, 0.015);
      c.box(sc, 0, 0, 0.15 + H / 2 - 0.02, p.L - 0.16, p.B - 0.16, H - 0.1, null, 0.06, { shin: 40 });                                                     // godset
      [-0.55, 0.05, 0.6].forEach(a => { c.box("#e5e7eb", a * L, 0, 0.15 + H / 2 - 0.02, 0.05, p.B - 0.12, H - 0.06, null, 0.012); c.box("#e5e7eb", a * L, 0, 0.15 + H / 2 - 0.02, 0.052, p.B - 0.14, H - 0.04, null, 0.012); });  // sträckband
      c.box("#f3f4f6", L - 0.3, -B - 0.002, 0.15 + H * 0.6, 0.34, 0.01, 0.22, null, 0, SMLIT);                                                                  // fraktsedel
      c.card({ title: "Leverans: " + st, icon: "truck", color: sc, rows: [["Innehåll", smF(p, "innehall")], ["Leverantör", smF(p, "lev")], ["Datum", smF(p, "datum")]], b0: -(B + 0.3) }); } },
  gjutetapp: { group: "Logistik", label: "Gjutetapp", color: "#64748b", L: 12, B: 8, H: 0.25, icon: "box", fields: [...GJ_FORM_FIELDS(false), ...GJ_ARM_FIELDS(), ...GJ_INFO_FIELDS()], groups: GJ_GROUPS, calc: p => gjutCalc(p, gjutPoly(p)),
    build(p, c) { gjutBuild(p, c, gjutPoly(p), 0, false); } },
  gjutform: { group: "Logistik", label: "Gjutetapp (fri form)", color: "#64748b", path: true, H: 0.25, icon: "box", fields: [...GJ_FORM_FIELDS(true), ...GJ_ARM_FIELDS(), ...GJ_INFO_FIELDS()], groups: GJ_GROUPS.map(([t, ks]) => [t, ks.filter(k => !/^(form|cutL|cutB)$/.test(k))]), calc: p => { const P = p.pts || [], ox = Number(p.x) || 0, oy = Number(p.y) || 0; return P.length < 3 ? [] : gjutCalc(p, gjutFreePoly(p)); },
    build(p, c) { const P = p.pts || [], ox = Number(p.x) || 0, oy = Number(p.y) || 0; if (P.length < 3) { P.forEach(q => c.cyl("#f59e0b", "z", q[0] - ox, q[1] - oy, 0.5, 0.12, 0.12, 1, 10)); return; }
      gjutBuild(p, c, gjutFreePoly(p), (P[0][2] || 0) + (Number(p.dz) || 0) - c.z, true); } },
  lyftkort: { group: "Lyft & montage", label: "Lyftkort", color: "#eab308", L: 1.8, B: 1.8, H: 1.2, icon: "crane", fields: [["obj", "Objekt som lyfts", "text", ""], ["vikt", "Vikt (ton)", "num", 10], ["kran", "Kran", "kran", ""], ["rad", "Radie (m)", "num", 20], ["status", "Status", ["Planerad", "Klar"], "Planerad"]],
    build(p, c) { const vikt = smN(p, "vikt", 0), rad = smN(p, "rad", 0), kran = smF(p, "kran", SM_KRAN()[3] || ""); let util = null, hex = "#eab308";
      if (typeof l3lCap === "function" && typeof L3L_MODELS !== "undefined") { const m = L3L_MODELS.find(x => x.name === kran) || L3L_MODELS[3], ch = String(m.chart).split("\n").map(l => l.split(":").map(Number)); const cap = l3lCap(rad, ch); util = vikt > 0 ? (cap > 0 ? vikt / cap : 9.99) : 0; hex = util > 1 ? "#ef4444" : util > 0.8 ? "#f59e0b" : "#22c55e"; }
      c.cyl("#374151", "z", 0, 0, 0.04, 0.95, 0.95, 0.08, 24); c.cyl(hex, "z", 0, 0, 0.09, 0.8, 0.8, 0.02, 24, null, SMLIT); c.cyl("#f3f4f6", "z", 0, 0, 0.1, 0.62, 0.62, 0.02, 24, null, SMLIT); c.cyl(hex, "z", 0, 0, 0.11, 0.5, 0.5, 0.02, 24, null, SMLIT);
      c.cyl("#6b7280", "z", 0, 0, 0.75, 0.045, 0.06, 1.35, 10); c.box("#6b7280", 0.0, 0, 1.45, 0.62, 0.07, 0.08, null, 0.02);                                         // stolpe + bom
      c.cyl("#374151", "y", 0.28, 0, 1.45, 0.11, 0.11, 0.07, 14); c.cyl("#374151", "y", -0.28, 0, 1.45, 0.11, 0.11, 0.07, 14);
      c.rod("#9aa3ad", [0.28, 0, 1.34], [0.28, 0, 0.75], 0.012, 0.012, 6); c.box(SM_YEL, 0.28, 0, 0.7, 0.14, 0.1, 0.12, null, 0.03); c.rod("#374151", [0.28, 0, 0.64], [0.28, 0.0, 0.54], 0.02, 0.02, 6);   // lina + krok
      c.card({ title: "Lyft: " + (smF(p, "obj") || "–"), icon: "crane", color: hex, left: ["Ton", smFmt(vikt, 1)], rows: [["Kran / radie", `${kran} · ${smFmt(rad, 0)} m`], ["Utnyttjande", util == null ? "–" : util > 1 ? "ÖVERLAST " + Math.round(util * 100) + " %" : Math.round(util * 100) + " %"], ["Status", smF(p, "status")]], bar: util == null ? null : { pct: Math.min(1, util), color: hex }, b0: -1.3 }); } },
  kranplats: { group: "Lyft & montage", label: "Kranplats", color: "#f97316", L: 12, B: 12, H: 0.1, icon: "crane", fields: [["kran", "Kran", "kran", ""], ["bel", "Max stödbenskraft (kN)", "num", 600], ["grund", "Underlag", "text", "Krossad bergmaterial, packad"]],
    build(p, c) { const L = p.L / 2, B = p.B / 2;
      c.box("#a3a9b1", 0, 0, p.H / 2, p.L, p.B, p.H, null, 0.02, { transp: 0.3, rough: 0.95 }); c.box("#6b7280", 0, 0, p.H + 0.01, p.L - 0.4, p.B - 0.4, 0.015, null, 0, { transp: 0.7 });
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sa, sb]) => { const x = sa * (L - 1.4), y = sb * (B - 1.4); c.box("#c2410c", x, y, p.H + 0.06, 1.6, 1.6, 0.12, null, 0.03); c.box("#f97316", x, y, p.H + 0.13, 1.45, 1.45, 0.03, null, 0.015, SMLIT); c.box("#7c2d12", x, y, p.H + 0.15, 0.9, 0.09, 0.02, null, 0, SMLIT); c.box("#7c2d12", x, y, p.H + 0.15, 0.09, 0.9, 0.02, null, 0, SMLIT); });
      for (let i = -L + 0.6; i < L - 0.3; i += 1.2) { c.box("#f8fafc", i, -B + 0.15, p.H + 0.012, 0.6, 0.12, 0.012, null, 0, SMLIT); c.box("#f8fafc", i, B - 0.15, p.H + 0.012, 0.6, 0.12, 0.012, null, 0, SMLIT); }  // kantband
      c.card({ title: "Kranplats", icon: "crane", color: "#ea580c", rows: [["Kran", smF(p, "kran") || "–"], ["Max stödbenskraft", smN(p, "bel", 0) + " kN"], ["Underlag", smF(p, "grund")]], b0: -(B + 0.3) }); } },
  stallning: { hidden: true, group: "Etablering", label: "Ställning", color: "#eab308", L: 10, B: 0.75, H: 10, icon: "box", calc: stallningCalc, build: stallningBuild,
    fields: [["H", "Höjd", "range", 10, { min: 2, max: 40, step: 0.5, unit: "m", dim: true }], ["L", "Längd", "range", 10, { min: 2, max: 60, step: 0.5, unit: "m", dim: true }], ["B", "Bredd (djup)", "range", 0.75, { min: 0.6, max: 2, step: 0.05, unit: "m", dim: true }], ["fack", "Fackbredd", [["1.57", "1,57 m"], ["2.07", "2,07 m"], ["2.57", "2,57 m"], ["3.07", "3,07 m"]], "2.57"], ["vh", "Våningshöjd", [["1.5", "1,5 m"], ["2", "2,0 m"], ["2.5", "2,5 m"]], "2"], ["plats", "Arbetsplan", [["alla", "Alla våningar"], ["var2", "Varannan"], ["topp", "Bara överst"]], "alla"], ["skydd", "Skydd på fasaden", [["Inget", "Inget"], ["Nät", "Nät"], ["Presenning", "Presenning"], ["Plank", "Plank"]], "Nät", { seg: true }], ["trapp", "Trapptorn", ["Ja", "Nej"], "Ja", { seg: true }], ["ank", "Förankring mot vägg", ["Ja", "Nej"], "Ja", { seg: true }], ["_calc", "Beräknat", "calc"]] },
  makadam: { group: "Mark & schakt", label: "Makadam", color: "#a8a29e", L: 12, B: 8, H: 0.3, icon: "box", fields: MK_FIELDS(false), calc: mkCalc, build: mkBuild },
  makadamfri: { group: "Mark & schakt", label: "Makadam (fri form)", color: "#a8a29e", path: true, H: 0.3, icon: "box", fields: MK_FIELDS(true), calc: mkCalc, build: mkBuild },
  saxlift: { group: "Lyft & montage", label: "Skylift / saxlift", color: "#16a34a", L: 2.6, B: 1.2, H: 6, icon: "crane", fields: [["H", "Plattformens höjd", "range", 6, { min: 1.2, max: 20, step: 0.5, unit: "m", dim: true }], ["anv", "Används av", "text", ""]],
    build(p, c) { const L = p.L / 2, B = p.B / 2, top = Math.max(1.2, Math.min(22, Number(p.H) || 6)), col = p.color || "#16a34a", STEEL = "#6f7d8c", PIN = "#3b4552", z0 = 0.66;
      // chassi med kåpor, hjul, blinkers, stege och batterilucka
      c.box("#2b3138", 0, 0, 0.3, p.L, p.B, 0.3, null, 0.05, { rough: 0.7 }); c.box(col, 0, 0, 0.5, p.L - 0.1, p.B - 0.06, 0.28, null, 0.09, { shin: 70 }); c.box("#e5e7eb", 0, 0, 0.665, p.L - 0.16, p.B - 0.14, 0.03, null, 0.02, { rough: 0.5 });
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([a, b]) => smWheel(c, a * (L - 0.5), b * (B + 0.0), 0.3, 0.2)); c.box("#111827", L - 0.015, 0, 0.5, 0.03, B * 1.4, 0.3, null, 0.01); c.box("#f8fafc", -L + 0.012, 0, 0.5, 0.025, B * 0.9, 0.12, null, 0.01, SMLIT);
      c.cyl("#f59e0b", "z", L - 0.3, B - 0.2, 0.72, 0.07, 0.07, 0.1, 12, null, SMLIT); c.cyl("#fbbf24", "z", L - 0.3, B - 0.2, 0.8, 0.05, 0.05, 0.06, 12, null, SMLIT);
      [-1, 1].forEach(sd => c.rod("#cbd5e1", [-L - 0.1, sd * 0.22, 0.12], [-L - 0.1, sd * 0.22, 0.62], 0.018, 0.018, 6, SMM)); for (let h = 0.2; h < 0.6; h += 0.14) c.rod("#cbd5e1", [-L - 0.1, -0.22, h], [-L - 0.1, 0.22, h], 0.014, 0.014, 6, SMM);
      // sax: balkpar som korsar varandra, med leder, tvärrör och hydraulcylinder – antalet nivåer följer höjden
      const zt = top, span = Math.max(0.5, zt - z0 - 0.1), n = Math.max(2, Math.min(12, Math.round(span / 1.0))), seg = span / n, ax = L * 0.72;
      for (let i = 0; i < n; i++) { const za = z0 + i * seg, zb = za + seg;
        [-1, 1].forEach(sd => { const y = sd * (B * 0.62); c.beam(STEEL, [-ax, y, za], [ax, y, zb], 0.09, 0.13, SMM); c.beam(STEEL, [ax, y, za], [-ax, y, zb], 0.09, 0.13, SMM); c.cyl(PIN, "y", 0, y, (za + zb) / 2, 0.065, 0.065, 0.16, 10, null, SMM); });
        c.cyl(PIN, "y", 0, 0, (za + zb) / 2, 0.05, 0.05, B * 1.3, 8, null, SMM); [-1, 1].forEach(sx => c.cyl(PIN, "y", sx * ax, 0, zb, 0.05, 0.05, B * 1.3, 8, null, SMM)); }
      [-1, 1].forEach(sx => c.cyl(PIN, "y", sx * ax, 0, z0, 0.05, 0.05, B * 1.3, 8, null, SMM));
      c.rod("#9aa4b0", [-ax * 0.95, 0, z0 + 0.1], [0, 0, z0 + seg * 0.55], 0.075, 0.075, 12, SMM); c.rod("#d1d5db", [-ax * 0.2, 0, z0 + seg * 0.4], [0, 0, z0 + seg * 0.55], 0.045, 0.045, 10, SMM);
      // plattform: bottenplatta, utskjutande däck, ledstänger, sparkplåt, grind med kätting, manöverlåda med nödstopp
      c.box("#8d96a1", 0, 0, zt - 0.05, p.L, p.B, 0.1, null, 0.03, SMM); c.box("#4b5563", 0, 0, zt + 0.005, p.L - 0.12, p.B - 0.1, 0.02, null, 0, { rough: 0.9 }); c.box("#a7b0ba", L + 0.34, 0, zt - 0.06, 0.62, p.B - 0.1, 0.06, null, 0.02, SMM);
      const post = (x, y) => c.cyl(col, "z", x, y, zt + 0.55, 0.025, 0.025, 1.1, 8, null, SMM), rail = (a, b, h) => c.rod(col, [a[0], a[1], zt + h], [b[0], b[1], zt + h], 0.022, 0.022, 8, SMM);
      const C = [[-L + 0.03, -B + 0.03], [L + 0.62, -B + 0.03], [L + 0.62, B - 0.03], [-L + 0.03, B - 0.03]]; C.forEach(q => post(q[0], q[1])); [0.55, 1.08].forEach(h => { for (let i = 0; i < 4; i++) { if (i === 3 && h === 0.55) continue; rail(C[i], C[(i + 1) % 4], h); } });
      post((L + 0.62 + -L) / 2 + 0.3, -B + 0.03); post((L + 0.62 + -L) / 2 + 0.3, B - 0.03);
      for (let i = 0; i < 4; i++) { const a = C[i], b = C[(i + 1) % 4], dx = b[0] - a[0], dy = b[1] - a[1], dd = Math.hypot(dx, dy); c.beam("#cbd5e1", [a[0], a[1], zt + 0.1], [b[0], b[1], zt + 0.1], 0.012, 0.14, SMM); }
      c.rod("#6b7280", [-L + 0.03, -B * 0.35, zt + 0.95], [-L + 0.03, B * 0.35, zt + 0.5], 0.01, 0.01, 4); c.box("#374151", L * 0.2, -B + 0.07, zt + 0.82, 0.3, 0.14, 0.22, null, 0.02); c.cyl("#dc2626", "y", L * 0.2 - 0.07, -B + 0.15, zt + 0.9, 0.03, 0.03, 0.03, 10, null, SMLIT); c.cyl("#111827", "z", L * 0.2 + 0.05, -B + 0.07, zt + 0.98, 0.012, 0.012, 0.1, 8);
      c.card({ title: "Lift " + smFmt(top + 1.8, 0) + " m", icon: "crane", color: "#d97706", rows: smF(p, "anv") ? [["Används av", smF(p, "anv")], ["Plattformshöjd", smFmt(top, 1) + " m"]] : [["Arbetshöjd", smFmt(top + 1.8, 1) + " m"], ["Plattformshöjd", smFmt(top, 1) + " m"]], zb: zt + 1.7, b0: -(B + 0.6) }); } },
  bomlift: { group: "Lyft & montage", label: "Bomlift", color: "#f59e0b", L: 3.2, B: 1.9, H: 12, icon: "crane", fields: [["H", "Plattformens höjd", "range", 12, { min: 3, max: 40, step: 0.5, unit: "m", dim: true }], ["utskjut", "Utskjut från centrum", "range", 0, { min: 0, max: 30, step: 0.5, unit: "m" }], ["anv", "Används av", "text", ""]],
    build(p, c) { const L = p.L / 2, B = p.B / 2, top = Math.max(3, Math.min(45, Number(p.H) || 12)), col = p.color || "#f59e0b", STEEL = "#cbd5e1", DARK = "#1f2937", PIN = "#4b5563", RED = "#dc2626", tz = 0.95;
      // chassi, bandhjul/hjul, stödben, vridkrans och motviktskåpa
      c.box("#2b3138", 0, 0, 0.45, p.L, p.B * 0.78, 0.4, null, 0.07, { rough: 0.7 }); [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([a, b]) => smWheel(c, a * (L - 0.55), b * (B * 0.78 / 2 + 0.12), 0.42, 0.34));
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([a, b]) => { const x = a * (L - 0.15), y = b * (B * 0.78 / 2 + 0.5); c.rod("#f59e0b", [a * (L - 0.45), b * B * 0.3, 0.55], [x, y, 0.32], 0.045, 0.045, 8); c.box("#374151", x, y, 0.04, 0.34, 0.34, 0.08, null, 0.02); c.cyl("#9ca3af", "z", x, y, 0.2, 0.04, 0.04, 0.28, 8, null, SMM); });
      c.cyl(col, "z", -0.1, 0, 0.78, 0.82, 0.82, 0.3, 28, null, { shin: 70 }); c.cyl("#d1d5db", "z", -0.1, 0, 0.94, 0.6, 0.6, 0.04, 24, null, SMM); c.box(col, -L * 0.78, 0, 0.98, 0.9, p.B * 0.72, 0.55, null, 0.1, { shin: 70 }); c.box("#111827", -L * 0.78 - 0.455, 0, 0.98, 0.02, p.B * 0.5, 0.2, null, 0.01);
      c.cyl("#f59e0b", "z", -L * 0.78, B * 0.28, 1.34, 0.07, 0.07, 0.1, 12, null, SMLIT);
      // bomgeometri ur höjd och utskjut: nedre bom (brant), vågrät led, övre bom (sluttande) och korgen
      const px = -0.3, delta = Math.max(1.2, top - tz - 0.9), a1 = 78 * Math.PI / 180, a3 = 46 * Math.PI / 180, dz1 = delta * 0.58, dz3 = delta - dz1, x1 = dz1 / Math.tan(a1), x3 = dz3 / Math.tan(a3), R = smN(p, "utskjut", 0) || Math.max(x1 + x3 + 0.6, top * 0.32), l2 = Math.max(0.35, R - x1 - x3);
      const P0 = [px, 0, tz], P1 = [px + x1, 0, tz + dz1], P2 = [P1[0] + l2, 0, P1[2]], P3 = [P2[0] + x3, 0, P2[2] + dz3], lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
      c.box("#6b7280", px, 0, tz + 0.1, 0.5, 0.62, 0.25, null, 0.04, SMM);                                                                                                // tornfäste
      c.beam(col, P0, lerp(P0, P1, 0.62), 0.5, 0.46, { shin: 70 }); c.beam("#e5e7eb", lerp(P0, P1, 0.55), P1, 0.4, 0.36, { shin: 70 });                                 // nedre bom, två sektioner
      c.cyl(PIN, "y", P1[0], 0, P1[2], 0.24, 0.24, 0.58, 16, null, SMM);                                                                                                   // led
      c.beam(col, P1, lerp(P1, P2, 0.6), 0.42, 0.4, { shin: 70 }); c.beam("#e5e7eb", lerp(P1, P2, 0.5), P2, 0.34, 0.32, { shin: 70 }); c.cyl(PIN, "y", P2[0], 0, P2[2], 0.2, 0.2, 0.5, 16, null, SMM);  // vågrät arm
      c.beam(col, P2, lerp(P2, P3, 0.55), 0.38, 0.36, { shin: 70 }); c.beam("#e5e7eb", lerp(P2, P3, 0.5), P3, 0.3, 0.28, { shin: 70 });                                // övre bom
      c.rod("#d1d5db", lerp(P0, P1, 0.18).map((v, i) => i === 1 ? -0.34 : v), [px - 0.5, -0.34, tz - 0.05], 0.06, 0.06, 10, SMM); c.rod("#9aa4b0", lerp(P0, P1, 0.18).map((v, i) => i === 1 ? -0.34 : v), [px - 0.5, -0.34, tz - 0.05], 0.09, 0.09, 10, SMM);   // lyftcylinder
      c.rod("#d1d5db", lerp(P1, P2, 0.1).map((v, i) => i === 1 ? 0.3 : v), lerp(P2, P3, 0.3).map((v, i) => i === 1 ? 0.3 : v), 0.035, 0.035, 8, SMM);
      // korg i änden av övre bomen: hängare, golv, ledstänger, grind, manöverlåda
      const bx = P3[0] + 0.3, zt = top; c.cyl(PIN, "y", P3[0], 0, P3[2], 0.12, 0.12, 0.4, 12, null, SMM); c.beam("#6b7280", [P3[0], 0, P3[2]], [bx - 0.35, 0, zt + 0.5], 0.1, 0.08, SMM); c.beam("#6b7280", [bx - 0.35, 0, zt + 0.5], [bx - 0.35, 0, zt], 0.1, 0.08, SMM);
      c.box("#8d96a1", bx, 0, zt - 0.05, 1.5, 0.9, 0.1, null, 0.03, SMM); c.box("#4b5563", bx, 0, zt + 0.005, 1.4, 0.8, 0.02, null, 0, { rough: 0.9 });
      const C = [[bx - 0.72, -0.43], [bx + 0.72, -0.43], [bx + 0.72, 0.43], [bx - 0.72, 0.43]], post = q => c.cyl(col, "z", q[0], q[1], zt + 0.55, 0.025, 0.025, 1.1, 8, null, SMM); C.forEach(post); [0.55, 1.08].forEach(h => { for (let i = 0; i < 4; i++) { if (i === 3 && h === 0.55) continue; c.rod(col, [C[i][0], C[i][1], zt + h], [C[(i + 1) % 4][0], C[(i + 1) % 4][1], zt + h], 0.022, 0.022, 8, SMM); } });
      for (let i = 0; i < 4; i++) c.beam("#cbd5e1", [C[i][0], C[i][1], zt + 0.1], [C[(i + 1) % 4][0], C[(i + 1) % 4][1], zt + 0.1], 0.012, 0.14, SMM);
      c.box("#374151", bx + 0.55, -0.4, zt + 0.82, 0.3, 0.14, 0.22, null, 0.02); c.cyl(RED, "y", bx + 0.5, -0.33, zt + 0.9, 0.03, 0.03, 0.03, 10, null, SMLIT);
      c.card({ title: "Bomlift " + smFmt(top + 1.8, 0) + " m", icon: "crane", color: "#d97706", rows: smF(p, "anv") ? [["Används av", smF(p, "anv")], ["Plattformshöjd", smFmt(top, 1) + " m"], ["Utskjut", smFmt(R, 1) + " m"]] : [["Arbetshöjd", smFmt(top + 1.8, 1) + " m"], ["Plattformshöjd", smFmt(top, 1) + " m"], ["Utskjut", smFmt(R, 1) + " m"]], zb: top + 1.9, b0: -(B + 0.6) }); } },
  riskzon: { group: "Risk & säkerhet", label: "Riskzon", color: "#ef4444", L: 10, B: 6, H: 0.08, icon: "warn", fields: [["risk", "Risk", "text", "Lyft över arbetsplats"], ["atg", "Åtgärd / regel", "text", "Inget tillträde under lyft"], ["ans", "Ansvarig", "text", ""]],
    build(p, c) { const L = p.L / 2, B = p.B / 2;
      c.box("#ef4444", 0, 0, p.H / 2, p.L, p.B, p.H, null, 0.01, { transp: 0.68, unlit: true });
      const band = (a0, a1, y, horiz) => { const n = Math.max(2, Math.round(Math.abs(a1 - a0) / 0.6)); for (let i = 0; i < n; i++) { const t = a0 + (a1 - a0) * (i + 0.5) / n, w = Math.abs(a1 - a0) / n, col = i % 2 ? "#ffffff" : "#dc2626"; if (horiz) c.box(col, t, y, p.H + 0.012, w, 0.28, 0.02, null, 0, SMLIT); else c.box(col, y, t, p.H + 0.012, 0.28, w, 0.02, null, 0, SMLIT); } };
      band(-L, L, -B + 0.14, true); band(-L, L, B - 0.14, true); band(-B, B, -L + 0.14, false); band(-B, B, L - 0.14, false);
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => { const x = a * L, y = b * B; c.cyl("#6b7280", "z", x, y, 0.08, 0.2, 0.2, 0.08, 14); for (let k = 0; k < 4; k++) c.cyl(k % 2 ? "#ffffff" : "#dc2626", "z", x, y, 0.3 + k * 0.27, 0.06, 0.06, 0.27, 12); c.sph("#ff8a1a", x, y, 1.42, 0.1, 0.1, 0.07, 10, 5, null, SMLIT); });
      [[-1, -L, B, L, B], [1, -L, -B, L, -B]].forEach(() => {}); [[-L, -B, L, -B], [-L, B, L, B], [-L, -B, -L, B], [L, -B, L, B]].forEach(([x0, y0, x1, y1]) => { const m = [(x0 + x1) / 2, (y0 + y1) / 2], len = Math.hypot(x1 - x0, y1 - y0), n = Math.round(len / 0.5); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, sag = Math.sin(t * Math.PI) * 0.03; c.box(i % 2 ? "#ffffff" : "#dc2626", x, y, 1.12 - sag, (x1 === x0 ? 0.012 : len / n), (y1 === y0 ? 0.012 : len / n), 0.1, null, 0, SMLIT); } });   // varningsband
      c.card({ title: "Risk: " + (smF(p, "risk") || "–"), icon: "warn", color: "#dc2626", rows: [["Åtgärd / regel", smF(p, "atg")], ["Ansvarig", smF(p, "ans")]], b0: -(B + 0.35) }); } },
  samling: { group: "Risk & säkerhet", label: "Samlingsplats", color: "#22c55e", L: 6, B: 6, H: 0.06, icon: "flag", fields: [["kap", "Kapacitet (personer)", "num", 60], ["ans", "Ansvarig", "text", ""]],
    build(p, c) { const L = p.L / 2, B = p.B / 2;
      c.box("#16a34a", 0, 0, p.H / 2, p.L, p.B, p.H, null, 0.01, { transp: 0.35, unlit: true }); c.box("#ffffff", 0, 0, p.H + 0.01, p.L - 0.5, 0.14, 0.012, null, 0, SMLIT); c.box("#ffffff", 0, 0, p.H + 0.01, 0.14, p.B - 0.5, 0.012, null, 0, SMLIT);
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([ux, uy]) => { const ax = ux * (L - 0.5), ay = uy * (B - 0.5), bx = ux * 1.1, by = uy * 1.1; c.prism("#ffffff", [[ax - uy * 0.5, ay + ux * 0.5], [bx * 1.6 - uy * 0.5, by * 1.6 + ux * 0.5], [bx * 1.6 - uy * 0.9, by * 1.6 + ux * 0.9], [bx * 0.6, by * 0.6], [bx * 1.6 + uy * 0.9, by * 1.6 - ux * 0.9], [bx * 1.6 + uy * 0.5, by * 1.6 - ux * 0.5], [ax + uy * 0.5, ay - ux * 0.5]].map(q => q), p.H + 0.02, p.H + 0.035, SMLIT); });
      c.cyl("#6b7280", "z", -L + 0.3, B - 0.3, 1.6, 0.04, 0.05, 3.2, 8); c.box("#16a34a", -L + 0.3 + 0.55, B - 0.3, 2.85, 1.0, 0.025, 0.6, null, 0.01, SMLIT); c.box("#ffffff", -L + 0.3 + 0.55, B - 0.3 - 0.016, 2.85, 0.3, 0.01, 0.1, null, 0, SMLIT); c.box("#ffffff", -L + 0.3 + 0.55, B - 0.3 - 0.016, 2.85, 0.1, 0.01, 0.3, null, 0, SMLIT); // flagga med kors
      c.card({ title: "Samlingsplats", icon: "flag", color: "#16a34a", left: ["Pers", String(smN(p, "kap", 0))], rows: [["Ansvarig", smF(p, "ans")]], b0: -(B + 0.35) }); } },
  utrymning: { group: "Risk & säkerhet", label: "Utrymningsväg", color: "#22c55e", path: true, H: 0.05, icon: "flag", fields: [["bredd", "Bredd (m)", "num", 1.2], ["till", "Leder till", "text", "Samlingsplats"]],
    build(p, c) { const w = smN(p, "bredd", 1.2) / 2; c.path(w, "#16a34a", 0.04, true); const P = p.pts || []; if (P.length) c.cardAt(P[0], { title: "Utrymningsväg", icon: "flag", color: "#16a34a", rows: [["Leder till", smF(p, "till")], ["Bredd", smFmt(w * 2, 1) + " m"]], b0: -1.0, zb: 2.2 }); } },
  transport: { group: "Logistik", label: "Transportväg", color: "#475569", path: true, H: 0.04, icon: "truck", fields: [["bredd", "Bredd (m)", "num", 4.5], ["radie", "Hörnradie (m)", "num", 8], ["last", "Max last (ton)", "num", 40], ["rikt", "Trafik", ["Dubbelriktad", "Enkelriktad"], "Dubbelriktad"]],
    build(p, c) { const w = smN(p, "bredd", 4.5) / 2; c.path(w, "#64748b", 0.04, p.f && p.f.rikt === "Enkelriktad", smN(p, "radie", 8)); const P = p.pts || []; if (P.length) c.cardAt(P[0], { title: "Transportväg", icon: "truck", color: "#334155", rows: [["Bredd / last", `${smFmt(w * 2, 1)} m · ${smN(p, "last", 0)} t`], ["Trafik", smF(p, "rikt")]], b0: -1.5, zb: 2.2 }); } },
  avvikelse: { group: "Kvalitet & uppföljning", label: "Avvikelse / fråga", color: "#ef4444", L: 0.5, B: 0.5, H: 1.5, icon: "warn", fields: [["rubrik", "Rubrik", "text", ""], ["besk", "Beskrivning", "text", ""], ["ans", "Ansvarig", "text", ""], ["status", "Status", ["Öppen", "Pågår", "Åtgärdad"], "Öppen"], ["datum", "Datum", "date", ""]],
    build(p, c) { const st = smF(p, "status", "Öppen"), sc = SM_ST[st]; smPin(c, sc, "!"); c.card({ title: "Avvikelse: " + st, icon: "warn", color: sc, rows: [["Rubrik", smF(p, "rubrik")], ["Beskrivning", smF(p, "besk")], ["Ansvarig / datum", [smF(p, "ans"), smF(p, "datum")].filter(Boolean).join(" · ")]], zb: 2.0, b0: -0.5 }); } },
  egenkontroll: { group: "Kvalitet & uppföljning", label: "Egenkontroll", color: "#22c55e", L: 0.5, B: 0.5, H: 1.5, icon: "check", fields: [["obj", "Objekt", "text", ""], ["klara", "Klara kontrollpunkter", "num", 0], ["tot", "Totalt antal", "num", 10], ["ans", "Kontrollant", "text", ""]],
    build(p, c) { const k = smN(p, "klara", 0), t = Math.max(1, smN(p, "tot", 1)), pc = Math.min(1, k / t), hex = pc >= 1 ? "#22c55e" : pc >= 0.5 ? "#f59e0b" : "#ef4444"; smPin(c, hex, "ok");
      c.card({ title: "Egenkontroll", icon: "check", color: hex, left: ["%", String(Math.round(pc * 100))], rows: [["Objekt", smF(p, "obj")], ["Kontrollpunkter", `${k} av ${t} klara`], ["Kontrollant", smF(p, "ans")]], bar: { pct: pc, color: hex }, zb: 2.0, b0: -0.5 }); } },
  hojdpunkt: { group: "Kvalitet & uppföljning", label: "Höjdpunkt", color: "#0ea5e9", L: 0.4, B: 0.4, H: 1.2, icon: "pin", fields: [["not", "Anteckning", "text", ""]],
    build(p, c) { smPin(c, "#0ea5e9", "z"); const zv = typeof placeBaseZ === "function" ? placeBaseZ(p) : 0; c.card({ title: "Höjd +" + smFmt(zv, 2), icon: "pin", color: "#0284c7", rows: smF(p, "not") ? [["Anteckning", smF(p, "not")]] : [], zb: 1.7, b0: -0.4 }); } },
  pumpbil: { group: "Logistik", label: "Pumpbil", color: "#e11d48", L: 10.5, B: 2.55, H: 3.9, R: 28, icon: "truck", fields: [["kap", "Pumpkapacitet (m³/h)", "num", 90], ["firma", "Firma", "text", ""]],
    build(p, c) { const L = p.L / 2, B = p.B / 2, col = p.color || "#e11d48"; smTruck(c, { L: p.L, B: p.B, cab: col, body: col, cabX: L - 1.2 });
      const bx = -0.5; c.box(col, bx, 0, 1.55, 5.4, p.B - 0.1, 1.1, null, 0.12, { shin: 60 }); c.box("#d1d5db", bx, 0, 2.18, 5.3, p.B - 0.3, 0.1, null, 0.03, SMM);                                      // pumpkropp + lock
      [-1, 1].forEach(sd => { c.box(SM_DARK, bx, sd * (B - 0.045), 1.5, 5.2, 0.02, 0.6, null, 0.01); [-1.8, 0, 1.8].forEach(a => c.box("#9ca3af", bx + a, sd * (B - 0.04), 1.5, 0.04, 0.02, 0.58, null, 0, SMM)); });
      c.ecyl("#e5e7eb", -L + 0.9, 0, 2.2, 0.62, 0.55, 0.62, 0.55, 0.9, 16); c.ecyl("#e5e7eb", -L + 0.9, 0, 2.62, 0.62, 0.55, 0.95, 0.85, 0.5, 16); c.box("#374151", -L + 0.9, 0, 3.0, 1.4, 1.2, 0.05, null, 0.02);                  // behållare + galler
      c.cyl("#e5e7eb", "z", 1.4, 0, 2.5, 0.52, 0.52, 0.5, 18, null, SMM); c.cyl("#374151", "z", 1.4, 0, 2.8, 0.38, 0.38, 0.16, 16);                                                                                   // svängkrans
      // Z-vikt mastarm: fyra sektioner staplade ovanför hytten, leder med svängtappar, cylindrar och slang
      const J = [[1.4, 3.0], [4.9, 3.9], [-3.9, 4.25], [3.2, 4.55], [-1.0, 4.8]], rr = [0.2, 0.17, 0.15, 0.12];
      J.forEach((q, i) => { if (i < 4) { const a2 = [q[0], 0, q[1]], b2 = [J[i + 1][0], 0, J[i + 1][1]]; c.rod("#f3f4f6", a2, b2, rr[i], rr[i] * 0.9, 12, SMM); c.rod("#d1d5db", [a2[0], 0.12, a2[2] + rr[i]], [b2[0], 0.12, b2[2] + rr[i]], 0.03, 0.03, 6, SMM); }
        if (i > 0 && i < 4) c.cyl("#6b7280", "y", q[0], 0, q[1], 0.2, 0.2, 0.5, 14, null, SMM); });
      c.cyl("#6b7280", "y", J[0][0], 0, J[0][1], 0.24, 0.24, 0.55, 14, null, SMM); c.rod("#111827", [-1.0, 0, 4.8], [-1.0, 0, 4.0], 0.06, 0.06, 8); c.cyl("#111827", "z", -1.0, 0, 3.95, 0.09, 0.07, 0.2, 8);
      c.rod("#9ca3af", [-0.2, 0.3, 2.55], [1.8, 0.28, 3.4], 0.05, 0.05, 8, SMM); c.rod("#9ca3af", [-0.2, -0.3, 2.55], [1.8, -0.28, 3.4], 0.05, 0.05, 8, SMM);
      c.box("#374151", -L + 0.9, 0, 1.6, 1.4, 1.3, 1.1, null, 0.04);                                                                                                           // stöd under behållaren
      [[2.4, 1], [-3.6, 1], [2.4, -1], [-3.6, -1]].forEach(([a, sd]) => { c.box("#374151", a, sd * (B + 0.35), 0.95, 0.4, 0.5, 0.3, null, 0.05); c.cyl("#fde047", "z", a, sd * (B + 0.55), 0.55, 0.1, 0.1, 0.9, 10); c.box("#374151", a, sd * (B + 0.55), 0.06, 0.55, 0.55, 0.1, null, 0.03); });  // stödben
      if (p.R > 0) smReach(c, p.R, "#e11d48");
      c.card({ title: "Pumpbil " + smN(p, "kap", 0) + " m³/h", icon: "truck", color: "#be123c", rows: [["Räckvidd", smFmt(p.R, 0) + " m"], ["Firma", smF(p, "firma")]], b0: -(B + 0.6), zb: 4.5 }); } },
  betongbil: { group: "Logistik", label: "Betongbil", color: "#f59e0b", L: 8.8, B: 2.5, H: 3.7, icon: "truck", fields: [["m3", "Last (m³)", "num", 8]],
    build(p, c) { const L = p.L / 2, B = p.B / 2, col = p.color || "#f59e0b"; smTruck(c, { L: p.L, B: p.B, cab: col, body: col, cabX: L - 1.1, axles: [L - 1.5, -0.2, -1.5, -2.8] });
      const drum = [[0.001, -2.3], [0.55, -2.0], [1.0, -1.3], [1.28, -0.2], [1.3, 1.5], [1.1, 2.4], [0.75, 3.0], [0.35, 3.35], [0.001, 3.45]];
      c.lathe("#e5e7eb", drum, -0.3, 0, 2.38, 22, [0, Math.PI / 2 - 0.2, 0], { shin: 70 });                                                                                 // trumman (tippad)
      for (let i = 0; i < 6; i++) { const z = -1.2 + i * 0.75, r = z < 1.5 ? 1.3 : 1.3 - (z - 1.5) * 0.4; c.lathe(col, [[r * 0.96, z], [r * 1.005, z + 0.02], [r * 1.005, z + 0.3], [r * 0.96, z + 0.32]], -0.3, 0, 2.38, 22, [0, Math.PI / 2 - 0.2, 0]); }
      c.cyl("#9ca3af", "x", -3.3, 0, 2.0, 0.5, 0.35, 1.0, 14, null, SMM); c.rod(SM_STEEL, [-3.8, 0, 1.9], [-4.6, 0, 0.9], 0.07, 0.07, 8, SMM); c.box(SM_STEEL, -4.9, 0, 0.75, 0.7, 0.35, 0.05, [0, 0.4, 0], 0.01, SMM);       // inmatning + ränna
      c.box("#e5e7eb", L - 2.3, B - 0.25, 2.5, 0.7, 0.25, 0.9, null, 0.05); c.cyl("#1e3a5f", "x", 1.6, -B + 0.12, 1.15, 0.3, 0.3, 1.6, 14);                                                  // vattentank + bränsletank
      c.rod("#6b7280", [-2.5, B - 0.05, 1.0], [-2.5, B - 0.05, 3.0], 0.025, 0.025, 6); [1.2, 1.8, 2.4].forEach(h => c.box("#6b7280", -2.5, B - 0.05, h, 0.04, 0.35, 0.02, null, 0));            // stege
      c.card({ title: "Betongbil", icon: "truck", color: "#d97706", rows: [["Last", smFmt(smN(p, "m3", 0), 1) + " m³"]], b0: -(B + 0.5), zb: 4.4 }); } },
  lastbil: { group: "Logistik", label: "Lastbil med flak", color: "#2563eb", L: 9.2, B: 2.55, H: 3.5, icon: "truck", fields: [["last", "Last", "text", ""]],
    build(p, c) { const L = p.L / 2, B = p.B / 2, col = p.color || "#2563eb"; smTruck(c, { L: p.L, B: p.B, cab: col, body: col, cabX: L - 1.2, axles: [L - 1.4, -1.4, -2.7] });
      c.box("#9ca3af", -1.1, 0, 1.28, p.L - 2.9, p.B - 0.1, 0.12, null, 0.03, SMM); [-1, 1].forEach(sd => { c.box("#c9a66b", -1.1, sd * (B - 0.05), 1.78, p.L - 2.9, 0.05, 0.9, null, 0.02); for (let a = -L + 1.6; a < L - 2.2; a += 1.2) c.box("#8b6b3d", a - 0.0, sd * (B - 0.03), 1.78, 0.06, 0.06, 0.92, null, 0.01); c.box("#9ca3af", -1.1, sd * (B - 0.05), 2.26, p.L - 2.9, 0.07, 0.06, null, 0.02, SMM); });
      c.box("#c9a66b", -L + 0.05, 0, 1.78, 0.05, p.B - 0.1, 0.9, null, 0.02); c.box("#c9a66b", L - 2.35, 0, 1.78, 0.06, p.B - 0.1, 1.1, null, 0.02);
      if (smF(p, "last")) c.card({ title: "Lastbil", icon: "truck", color: col, rows: [["Last", smF(p, "last")]], b0: -(B + 0.5), zb: 3.8 }); } },
  dass: { group: "Etablering", label: "Toalett (dass)", color: "#2563eb", L: 1.25, B: 1.25, H: 2.35, icon: "box", fields: [],
    build(p, c) { const L = p.L / 2, B = p.B / 2, col = p.color || "#2563eb"; c.box("#374151", 0, 0, 0.1, p.L + 0.08, p.B + 0.08, 0.2, null, 0.03);
      c.box(col, 0, 0, 1.25, p.L, p.B, 2.1, null, 0.05, { shin: 45 }); c.box("#1e40af", 0, 0, 2.38, p.L + 0.08, p.B + 0.08, 0.1, [0, 0.05, 0], 0.03, { shin: 45 }); c.cyl("#1e293b", "z", -L + 0.2, -B + 0.2, 2.6, 0.04, 0.04, 0.4, 8);
      c.box("#1d4ed8", L + 0.015, 0, 1.2, 0.03, p.B - 0.2, 1.85, null, 0.02); c.box("#facc15", L + 0.035, -0.37, 1.3, 0.02, 0.08, 0.14, null, 0.01); c.box("#22c55e", L + 0.035, 0.27, 1.65, 0.02, 0.18, 0.07, null, 0, SMLIT);       // dörr, lås, ledig
      for (let i = 0; i < 4; i++) c.box("#0f172a", L + 0.03, 0.2 + i * 0.0, 2.0 + i * 0.04, 0.02, 0.38, 0.015, null, 0); c.cyl("#e5e7eb", "z", L + 0.04, 0.3, 1.1, 0.03, 0.03, 0.12, 6); } },
  avfall: { group: "Etablering", label: "Avfall / skip", color: "#16a34a", L: 6, B: 2.4, H: 1.5, icon: "box", fields: [["fraktion", "Fraktion", "text", "Blandat avfall"]],
    build(p, c) { const L = p.L / 2, B = p.B / 2, H = p.H, col = p.color || "#16a34a";
      c.box("#374151", 0, 0, 0.2, p.L, p.B, 0.12, null, 0.02); [-1, 1].forEach(sd => c.box("#4b5563", 0, sd * (B - 0.06), 0.12, p.L + 0.1, 0.12, 0.2, null, 0.03));
      const wall = (a, b, sa, sb, z) => c.box(col, a, b, z, sa, sb, H - 0.2, null, 0.03, { shin: 35 });
      wall(0, -B + 0.04, p.L, 0.08, 0.2 + (H - 0.2) / 2); wall(0, B - 0.04, p.L, 0.08, 0.2 + (H - 0.2) / 2); wall(-L + 0.04, 0, 0.08, p.B, 0.2 + (H - 0.2) / 2); wall(L - 0.04, 0, 0.08, p.B, 0.2 + (H - 0.2) / 2);
      c.box("#14532d", 0, -B, H + 0.0, p.L + 0.02, 0.1, 0.06, null, 0.02); c.box("#14532d", 0, B, H + 0.0, p.L + 0.02, 0.1, 0.06, null, 0.02); c.box("#14532d", -L, 0, H, 0.1, p.B + 0.02, 0.06, null, 0.02); c.box("#14532d", L, 0, H, 0.1, p.B + 0.02, 0.06, null, 0.02);
      for (let a = -L + 0.6; a < L - 0.3; a += 0.9) [-1, 1].forEach(sd => c.box("#15803d", a, sd * (B + 0.005), 0.2 + (H - 0.2) / 2, 0.06, 0.04, H - 0.28, null, 0.01));
      c.box("#e5e7eb", -L + 0.01, 0, 0.9, 0.02, 1.0, 0.5, null, 0, SMLIT); c.cyl("#9ca3af", "y", L + 0.12, 0, 1.0, 0.07, 0.07, 0.5, 10, null, SMM); c.box("#14532d", 0, 0, 0.45, p.L - 0.3, p.B - 0.3, 0.5, null, 0.05, { rough: 0.95 });
      c.card({ title: "Avfall", icon: "box", color: "#15803d", rows: [["Fraktion", smF(p, "fraktion")]], b0: -(B + 0.35), zb: 2.2 }); } },
  mast: { group: "Etablering", label: "Belysningsmast", color: "#eab308", L: 0.5, B: 0.5, H: 8, R: 14, icon: "info", fields: [],
    build(p, c) { const H = Math.max(3, p.H); c.cyl("#374151", "z", 0, 0, 0.1, 0.28, 0.28, 0.2, 14); c.cyl("#4b5563", "z", 0, 0, 0.35, 0.15, 0.13, 0.3, 12); c.cyl("#6b7280", "z", 0, 0, 0.5 + (H - 0.5) / 2, 0.11, 0.065, H - 0.5, 12, null, SMM);
      c.box("#4b5563", 0, 0, H + 0.05, 0.14, 1.5, 0.1, null, 0.03); [-1, 1].forEach(sd => { c.box("#374151", 0.1, sd * 0.55, H + 0.2, 0.3, 0.55, 0.2, [0, 0.35, 0], 0.04); c.box("#fff7c2", 0.26, sd * 0.55, H + 0.16, 0.03, 0.5, 0.15, [0, 0.35, 0], 0, SMLIT); });
      if (p.R > 0) smReach(c, p.R, "#fde047"); } },
  eltavla: { group: "Etablering", label: "Eltavla / byggström", color: "#facc15", L: 0.9, B: 0.4, H: 1.8, icon: "info", fields: [["grp", "Märkning", "text", "Byggel"]],
    build(p, c) { const L = p.L / 2, B = p.B / 2; [-1, 1].forEach(sd => c.box("#374151", sd * (L - 0.1), 0, 0.12, 0.1, p.B + 0.1, 0.24, null, 0.03)); c.box("#facc15", 0, 0, 0.12 + p.H / 2, p.L, p.B, p.H - 0.1, null, 0.04, { shin: 60 }); c.box("#ca8a04", 0, 0, 1.82, p.L + 0.04, p.B + 0.04, 0.06, null, 0.02);
      c.box("#eab308", -L / 2 - 0.01, -B - 0.008, 1.0, L - 0.04, 0.012, p.H - 0.4, null, 0.01); c.box("#eab308", L / 2 + 0.01, -B - 0.008, 1.0, L - 0.04, 0.012, p.H - 0.4, null, 0.01); c.box("#9ca3af", 0.02, -B - 0.02, 1.0, 0.03, 0.02, 0.1, null, 0.005, SMM);
      c.prism("#111827", [[-0.2, -B - 0.02], [0.2, -B - 0.02], [0, -B - 0.02]], 1.35, 1.36); const tri = [[-0.17, 1.2], [0.17, 1.2], [0, 1.5]]; c.box("#facc15", 0, -B - 0.03, 1.35, 0.4, 0.012, 0.36, null, 0, SMLIT);
      const zig = [[-0.04, 1.5], [0.06, 1.5], [0.015, 1.4], [0.07, 1.4], [-0.07, 1.22], [-0.02, 1.34], [-0.075, 1.34]]; c.box("#111827", 0, -B - 0.045, 1.37, 0.06, 0.01, 0.2, [0, 0, 0], 0, SMLIT);
      if (smF(p, "grp")) smText(c, smF(p, "grp"), 0.14, 0, 0.8, -B - 0.03, "#111827", true); } },
  slackare: { group: "Risk & säkerhet", label: "Brandsläckare", color: "#dc2626", L: 0.4, B: 0.3, H: 2.1, icon: "warn", fields: [],
    build(p, c) { c.cyl("#6b7280", "z", 0, 0.08, 0.85, 0.035, 0.035, 1.7, 8); c.box("#dc2626", 0, 0, 1.95, 0.55, 0.03, 0.55, null, 0.02, SMLIT); c.box("#ffffff", 0, -0.02, 1.95, 0.44, 0.01, 0.44, null, 0.01, SMLIT);
      c.cyl("#dc2626", "z", 0, -0.02, 0.95, 0.075, 0.075, 0.5, 14, null, { shin: 90 }); c.sph("#dc2626", 0, -0.02, 1.2, 0.075, 0.075, 0.05, 12, 5); c.cyl("#9ca3af", "z", 0, -0.02, 1.26, 0.025, 0.025, 0.06, 8, null, SMM); c.box("#374151", 0.03, -0.02, 1.31, 0.12, 0.03, 0.03, null, 0.01);
      c.rod("#1f2937", [0.05, -0.02, 1.26], [0.12, -0.04, 1.0], 0.012, 0.012, 6); c.box("#fde047", 0, -0.098, 0.98, 0.001, 0.0, 0.0, null, 0); c.box("#ffffff", 0, -0.098, 1.0, 0.07, 0.004, 0.1, null, 0, SMLIT); c.box("#dc2626", 0, -0.1, 1.9, 0.1, 0.01, 0.28, null, 0, SMLIT); c.box("#dc2626", 0, -0.1, 1.95, 0.28, 0.01, 0.1, null, 0, SMLIT); } },
  forstahjalp: { group: "Risk & säkerhet", label: "Första hjälpen", color: "#16a34a", L: 0.6, B: 0.3, H: 1.8, icon: "check", fields: [],
    build(p, c) { c.cyl("#6b7280", "z", 0, 0.08, 0.85, 0.035, 0.035, 1.7, 8); c.box("#16a34a", 0, 0, 1.45, 0.62, 0.16, 0.5, null, 0.05, { shin: 50 }); c.box("#15803d", 0, 0, 1.72, 0.64, 0.17, 0.05, null, 0.02); c.box("#ffffff", 0, -0.082, 1.45, 0.34, 0.012, 0.1, null, 0.003, SMLIT); c.box("#ffffff", 0, -0.082, 1.45, 0.1, 0.012, 0.34, null, 0.003, SMLIT); } },
  vagskylt: { group: "Risk & säkerhet", label: "Vägskylt", color: "#ef4444", L: 0.8, B: 0.2, H: 2.6, icon: "warn", fields: [["text", "Text på skylten", "text", "30"], ["typ", "Typ", ["Hastighet", "Stopp", "Förbud", "Info"], "Hastighet"]],
    build(p, c) { const ty = smF(p, "typ", "Hastighet"), tx = smF(p, "text", "30"), zc = 2.35; c.cyl("#9ca3af", "z", 0, 0.03, 1.1, 0.03, 0.03, 2.2, 10, null, SMM); c.cyl("#374151", "z", 0, 0.03, 0.04, 0.12, 0.12, 0.08, 12);
      if (ty === "Stopp") { c.cyl("#dc2626", "y", 0, 0, zc, 0.46, 0.46, 0.03, 8, [Math.PI / 8, 0, 0], { shin: 80 }); c.cyl("#ffffff", "y", 0, -0.004, zc, 0.42, 0.42, 0.034, 8, [Math.PI / 8, 0, 0], SMLIT); c.cyl("#dc2626", "y", 0, -0.008, zc, 0.39, 0.39, 0.036, 8, [Math.PI / 8, 0, 0], SMLIT); smText(c, "STOPP", 0.2, 0, zc, -0.03, "#ffffff", true); }
      else if (ty === "Info") { c.box("#2563eb", 0, 0, zc, 0.8, 0.03, 0.6, null, 0.03, { shin: 60 }); c.box("#ffffff", 0, -0.017, zc, 0.74, 0.01, 0.54, null, 0.02, SMLIT); c.box("#2563eb", 0, -0.02, zc, 0.7, 0.01, 0.5, null, 0.02, SMLIT); smText(c, tx, tx.length > 6 ? 0.1 : 0.18, 0, zc, -0.03, "#ffffff", true); }
      else { c.cyl("#dc2626", "y", 0, 0, zc, 0.46, 0.46, 0.03, 28, null, { shin: 80 }); c.cyl("#ffffff", "y", 0, -0.008, zc, 0.35, 0.35, 0.034, 28, null, SMLIT); if (ty === "Förbud") { c.box("#dc2626", 0, -0.02, zc, 0.62, 0.012, 0.07, [0, -0.78, 0], 0, SMLIT); } smText(c, tx, tx.length > 3 ? 0.14 : 0.3, 0, zc, -0.03, "#111827", true); } } },
  grind: { group: "Risk & säkerhet", label: "Grind / port", color: "#6b7280", L: 4, B: 0.2, H: 2, icon: "flag", fields: [["las", "Lås / ansvarig", "text", ""]],
    build(p, c) { const L = p.L / 2, H = p.H; [-1, 1].forEach(sd => { c.box("#374151", sd * L, 0, H / 2 + 0.1, 0.14, 0.14, H + 0.2, null, 0.03); c.cyl("#6b7280", "z", sd * L, 0, H + 0.24, 0.05, 0.05, 0.06, 8); });
      c.box("#4b5563", 0, 0, 0.18, p.L - 0.1, 0.06, 0.06, null, 0.015); c.box("#4b5563", 0, 0, H - 0.1, p.L - 0.1, 0.06, 0.06, null, 0.015); [-1, 1].forEach(sd => c.box("#4b5563", sd * (L - 0.1), 0, H / 2 + 0.05, 0.06, 0.06, H - 0.2, null, 0.015));
      c.rod("#4b5563", [-L + 0.1, 0, 0.2], [L - 0.1, 0, H - 0.1], 0.025, 0.025, 6); for (let a = -L + 0.25; a < L - 0.15; a += 0.18) c.rod("#9ca3af", [a, 0, 0.22], [a, 0, H - 0.12], 0.008, 0.008, 4, { transp: 0.0 });
      c.box("#facc15", 0, 0.0, 1.0, 0.14, 0.09, 0.2, null, 0.02); c.box("#6b7280", L - 0.2, -0.04, 1.0, 0.16, 0.05, 0.1, null, 0.01);
      if (smF(p, "las")) c.card({ title: "Grind", icon: "flag", color: "#4b5563", rows: [["Lås / ansvarig", smF(p, "las")]], b0: -0.5, zb: 2.5 }); } },
  infoskylt: { group: "Kvalitet & uppföljning", label: "Informationsskylt", color: "#2563eb", L: 0.4, B: 0.4, H: 2, icon: "info", fields: [["rubrik", "Rubrik", "text", "Information"], ["rad1", "Text 1", "text", ""], ["rad2", "Text 2", "text", ""], ["rad3", "Text 3", "text", ""]],
    build(p, c) { c.card({ title: smF(p, "rubrik", "Information"), icon: "info", color: p.color || "#2563eb", rows: ["rad1", "rad2", "rad3"].map(k => ["", smF(p, k)]).filter(r => r[1]), b0: -0.3, zb: 1.4 }); } },
};
/* Gemensam lastbilschassi + hytt (pumpbil, betongbil, lastbil): ram, hjulaxlar med mudgardar, hytt med glas, grill, strålkastare, speglar, stege, ljusramp. */
function smTruck(c, o) {
  const L = o.L / 2, B = o.B / 2, cx = o.cabX, ax = o.axles || [L - 1.5, -1.0, -2.3, -3.6].filter(x => x > -L + 0.5), cab = o.cab;
  c.box("#262b31", 0, 0, 0.95, o.L - 0.2, 0.95, 0.3, null, 0.05); ax.forEach(x => { smWheel(c, x, B - 0.28, 0.55, 0.36); smWheel(c, x, -(B - 0.28), 0.55, 0.36); c.box("#1f2328", x, B - 0.2, 0.62, 1.3, 0.5, 0.06, null, 0.03); c.box("#1f2328", x, -(B - 0.2), 0.62, 1.3, 0.5, 0.06, null, 0.03); });
  c.box(cab, cx, 0, 1.95, 2.3, B * 2 - 0.1, 2.1, null, 0.14, { shin: 70 });                                                                                             // hytt
  c.box(cab, cx + 0.5, 0, 3.12, 1.3, B * 2 - 0.2, 0.3, null, 0.1, { shin: 70 }); c.box("#e5e7eb", cx + 0.9, 0, 3.2, 0.4, B * 2 - 0.4, 0.1, null, 0.03);               // tak + spoiler
  c.box(SM_GLASS, cx + 1.19, 0, 2.35, 0.08, B * 2 - 0.45, 0.85, [0, 0.1, 0], 0.03, SMG); [-1, 1].forEach(sd => { c.box(SM_GLASS, cx + 0.45, sd * B, 2.35, 1.1, 0.08, 0.78, null, 0.03, SMG); c.box("#0f1113", cx + 0.2, sd * (B + 0.14), 2.5, 0.08, 0.1, 0.3, null, 0.02); });     // rutor + speglar
  c.box("#1f2328", cx + 1.16, 0, 1.32, 0.12, B * 2 - 0.3, 0.55, null, 0.04); for (let i = 0; i < 5; i++) c.box("#9ca3af", cx + 1.23, 0, 1.12 + i * 0.1, 0.02, B * 2 - 0.5, 0.025, null, 0, SMM);   // grill
  [-1, 1].forEach(sd => { c.box("#fff7c2", cx + 1.2, sd * (B - 0.35), 1.1, 0.05, 0.3, 0.16, null, 0.03, SMLIT); c.box("#ff8a1a", cx + 1.2, sd * (B - 0.12), 1.1, 0.04, 0.1, 0.12, null, 0.02, SMLIT); });
  c.box("#1f2328", cx + 1.25, 0, 0.72, 0.14, B * 2, 0.22, null, 0.05); c.box("#ff8a1a", cx + 0.6, 0, 3.4, 0.2, 0.6, 0.1, null, 0.03, SMLIT);                                     // stötfångare + varningsljus
  c.cyl("#9ca3af", "z", cx - 1.0, B - 0.1, 2.8, 0.06, 0.06, 1.8, 8, null, SMM); c.cyl("#6b7280", "z", cx - 1.0, B - 0.1, 3.75, 0.08, 0.07, 0.3, 8, null, SMM);               // avgasrör
  c.box("#3b4048", cx - 0.3, B + 0.05, 1.1, 0.3, 0.1, 0.35, null, 0.03); c.box("#3b4048", cx - 0.3, -B - 0.05, 1.1, 0.3, 0.1, 0.35, null, 0.03);
}
/* Smart prick (Avvikelse, Egenkontroll, Höjdpunkt): fot, stolpe, klotformad markör i statusfärg med vit symbol. */
function smPin(c, hex, sym) {
  c.cyl("#374151", "z", 0, 0, 0.04, 0.2, 0.22, 0.08, 16); c.cyl("#9aa3ad", "z", 0, 0, 0.6, 0.025, 0.025, 1.1, 8, null, SMM); c.cyl("#6b7280", "z", 0, 0, 0.1, 0.07, 0.04, 0.12, 8);
  c.sph(hex, 0, 0, 1.4, 0.24, 0.24, 0.24, 18, 10, null, { shin: 90 }); c.cyl(hex, "z", 0, 0, 1.15, 0.05, 0.2, 0.12, 14, null, { shin: 90 });
  const ring = c.cyl("#ffffff", "y", 0, -0.215, 1.4, 0.17, 0.17, 0.02, 24, null, SMLIT);
  if (sym === "!") { c.box(hex, 0, -0.235, 1.43, 0.045, 0.01, 0.15, null, 0, SMLIT); c.sph(hex, 0, -0.235, 1.3, 0.027, 0.01, 0.027, 8, 4, null, SMLIT); }
  else if (sym === "ok") { c.box(hex, -0.045, -0.235, 1.37, 0.045, 0.01, 0.1, [0, 0.7, 0], 0, SMLIT); c.box(hex, 0.04, -0.235, 1.4, 0.04, 0.01, 0.2, [0, -0.7, 0], 0, SMLIT); }
  else { c.box(hex, 0, -0.235, 1.46, 0.14, 0.01, 0.035, null, 0, SMLIT); c.box(hex, 0, -0.235, 1.4, 0.1, 0.01, 0.03, [0, -0.0, 0], 0, SMLIT); c.box(hex, 0, -0.235, 1.34, 0.14, 0.01, 0.035, null, 0, SMLIT); }
}
/* Räckviddscirkel: mycket svag fyllning och en tunn ring – ur belysning så att den inte flimrar mot marken. */
function smReach(c, r, color) {
  const p = c.p, W = c.W; c.parts.push({ poly: Array.from({ length: 96 }, (_, i) => W(r * Math.cos(i * 2 * Math.PI / 96), r * Math.sin(i * 2 * Math.PI / 96))), z0: c.z + 0.01, z1: c.z + 0.03, role: "reach", transp: 0.9, color, unlit: true });
  TK.add(c.T(color, { unlit: true, transp: 0.2, role: "reach" }), TK.ring(r - 0.07, r + 0.07, 0.02, 0.07, Math.max(64, Math.round(r * 5))), 0, 0, 0);
}
