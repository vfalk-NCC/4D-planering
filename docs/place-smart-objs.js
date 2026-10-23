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
const GJ_FORM_FIELDS = free => (free ? [["radie", "Hörnradie (m)", "num", 0]] : [["form", "Form", ["Rektangel", "L-form", "T-form", "U-form"], "Rektangel"], ["cutL", "Utskärning längd (m)", "num", 4], ["cutB", "Utskärning bredd (m)", "num", 3], ["radie", "Hörnradie (m)", "num", 0]]);
const GJ_ARM_FIELDS = () => [["arm", "Armering", ["Visa", "Dölj"], "Visa"], ["uD", "Undre nät Ø (mm)", "num", 12], ["uS", "Undre nät c/c (mm)", "num", 150], ["oD", "Övre nät Ø (mm, 0 = inget)", "num", 0], ["oS", "Övre nät c/c (mm)", "num", 150], ["tak", "Täckskikt (mm)", "num", 40], ["ang", "Armeringens riktning (°)", "num", 0]];
const GJ_INFO_FIELDS = () => [["vol", "Volym (m³, 0 = ur formen)", "num", 0], ["kval", "Kvalitet", "text", "C30/37"], ["pump", "Pumpplats", "text", ""], ["start", "Starttid", "text", "07:00"], ["bil", "m³ per bil", "num", 8], ["kap", "Pumpkapacitet (m³/h)", "num", 30]];
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
function gjutBuild(p, c, poly, zb, free) {
  const H = Math.max(0.05, Number(p.H) || 0.25), xs = poly.map(q => q[0]), ys = poly.map(q => q[1]), minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys), area = Math.abs(TK.area2(poly));
  const v = smN(p, "vol", 0) > 0 ? smN(p, "vol", 0) : area * H, bilar = Math.ceil(v / Math.max(1, smN(p, "bil", 8))), tim = v / Math.max(1, smN(p, "kap", 30));
  c.prism("#9aa4b2", poly, zb, zb + H, { transp: 0.55, rough: 0.9 });                                                                                                   // betongen (genomskinlig så att armeringen syns)
  const ccw = TK.area2(poly) >= 0, n = poly.length;                                                                                                                      // kantreglar (formsida) längs hela konturen
  for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], dd = Math.hypot(dx, dy); if (dd < 0.02) continue; const nx = (ccw ? dy : -dy) / dd * 0.1, ny = (ccw ? -dx : dx) / dd * 0.1; c.prism("#475569", [[a[0], a[1]], [b[0], b[1]], [b[0] + nx, b[1] + ny], [a[0] + nx, a[1] + ny]], zb - 0.02, zb + H + 0.1); }
  let kg = 0, txt = "";
  if (smF(p, "arm", "Visa") !== "Dölj") {
    const cover = Math.max(0.01, smN(p, "tak", 40) / 1000), ang = smN(p, "ang", 0) * Math.PI / 180, layers = [];
    const uD = smN(p, "uD", 12), uS = Math.max(50, smN(p, "uS", 150)), oD = smN(p, "oD", 0), oS = Math.max(50, smN(p, "oS", 150));
    if (uD > 0) layers.push([uD, uS, cover + uD / 2000, cover + uD * 1.5 / 1000]); if (oD > 0) layers.push([oD, oS, H - cover - oD * 1.5 / 1000, H - cover - oD / 2000]);
    layers.forEach(([d, sMM, z1, z2], li) => { let s = sMM / 1000; const side = Math.max(maxX - minX, maxY - minY); if (side / s > 70) s = side / 70; // för många stänger: visa glesare (mängden räknas ändå med riktig delning)
      [[ang, z1], [ang + Math.PI / 2, z2]].forEach(([a, z]) => { gjutScan(poly, a, s, cover).forEach(([q0, q1]) => c.rod(li ? "#2563eb" : "#475569", [q0[0], q0[1], zb + z], [q1[0], q1[1], zb + z], d / 2000, d / 2000, 6, { metal: 0.85, rough: 0.35, shin: 90 }));
        gjutScan(poly, a, sMM / 1000, cover).forEach(([q0, q1]) => { kg += Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) * d * d / 162; }); }); });
    txt = layers.map(([d, sMM], li) => `${li ? "Övre" : "Undre"} Ø${d} c/c${sMM}`).join(" · ");
  }
  const mx = (minX + maxX) / 2, my = (minY + maxY) / 2, ar = Math.min(2.4, Math.max(0.8, (maxX - minX) * 0.16));
  c.prism("#f59e0b", [[-1.6, -0.35], [0.4, -0.35], [0.4, -0.8], [1.8, 0], [0.4, 0.8], [0.4, 0.35], [-1.6, 0.35]].map(([x, y]) => [mx + x * ar / 1.8, my + y * ar / 1.8]), zb + H + 0.01, zb + H + 0.03, { unlit: true });  // gjutriktning
  c.card({ title: "Gjutetapp", icon: "box", color: "#475569", left: ["m³", smFmt(v, 1)], rows: [["Kvalitet", smF(p, "kval")], ["Pumpplats / start", [smF(p, "pump"), smF(p, "start")].filter(Boolean).join(" · ")], ["Bilar / pumptid", `ca ${bilar} bilar · ${smFmt(tim, 1)} h`], ...(txt ? [["Armering", txt], ["Stål", `${smFmt(kg, 0)} kg · ${smFmt(kg / Math.max(0.1, v), 0)} kg/m³`]] : [])], b0: minY - 0.4, zb: 2.45 + zb });
}
const SM = {
  leverans: { group: "Logistik", label: "Leverans / upplag", color: "#f59e0b", L: 2.4, B: 1.2, H: 1.1, icon: "box", fields: [["innehall", "Innehåll", "text", "HD/F pelare ×12"], ["lev", "Leverantör", "text", ""], ["datum", "Leveransdatum", "date", ""], ["status", "Status", ["Beställd", "På väg", "Levererad"], "Beställd"]],
    build(p, c) { const L = p.L / 2, B = p.B / 2, st = smF(p, "status", "Beställd"), sc = SM_ST[st] || "#f59e0b", H = Math.max(0.5, p.H);
      [-0.8, 0, 0.8].forEach(a => c.box("#a16f3a", a * L, 0, 0.07, 0.22, p.B + 0.04, 0.12, null, 0.02)); [-0.55, 0, 0.55].forEach(b => c.box("#b8844a", 0, b * B, 0.15, p.L + 0.04, 0.12, 0.03, null, 0.01)); // lastpall
      c.box("#8a5a2b", 0, 0, 0.12, p.L, p.B, 0.06, null, 0.015);
      c.box(sc, 0, 0, 0.15 + H / 2 - 0.02, p.L - 0.16, p.B - 0.16, H - 0.1, null, 0.06, { shin: 40 });                                                     // godset
      [-0.55, 0.05, 0.6].forEach(a => { c.box("#e5e7eb", a * L, 0, 0.15 + H / 2 - 0.02, 0.05, p.B - 0.12, H - 0.06, null, 0.012); c.box("#e5e7eb", a * L, 0, 0.15 + H / 2 - 0.02, 0.052, p.B - 0.14, H - 0.04, null, 0.012); });  // sträckband
      c.box("#f3f4f6", L - 0.3, -B - 0.002, 0.15 + H * 0.6, 0.34, 0.01, 0.22, null, 0, SMLIT);                                                                  // fraktsedel
      c.card({ title: "Leverans: " + st, icon: "truck", color: sc, rows: [["Innehåll", smF(p, "innehall")], ["Leverantör", smF(p, "lev")], ["Datum", smF(p, "datum")]], b0: -(B + 0.3) }); } },
  gjutetapp: { group: "Logistik", label: "Gjutetapp", color: "#64748b", L: 12, B: 8, H: 0.25, icon: "box", fields: [...GJ_FORM_FIELDS(false), ...GJ_ARM_FIELDS(), ...GJ_INFO_FIELDS()],
    build(p, c) { gjutBuild(p, c, gjutPoly(p), 0, false); } },
  gjutform: { group: "Logistik", label: "Gjutetapp (fri form)", color: "#64748b", path: true, H: 0.25, icon: "box", fields: [...GJ_FORM_FIELDS(true), ...GJ_ARM_FIELDS(), ...GJ_INFO_FIELDS()],
    build(p, c) { const P = p.pts || [], ox = Number(p.x) || 0, oy = Number(p.y) || 0; if (P.length < 3) { P.forEach(q => c.cyl("#f59e0b", "z", q[0] - ox, q[1] - oy, 0.5, 0.12, 0.12, 1, 10)); return; }
      gjutBuild(p, c, smFillet(P.map(q => [q[0] - ox, q[1] - oy, 0]), smN(p, "radie", 0), true).map(q => [q[0], q[1]]), (P[0][2] || 0) + (Number(p.dz) || 0) - c.z, true); } },
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
  saxlift: { group: "Lyft & montage", label: "Skylift / saxlift", color: "#16a34a", L: 2.6, B: 1.2, H: 6, icon: "crane", fields: [["hojd", "Arbetshöjd (m)", "num", 8], ["anv", "Används av", "text", ""]],
    build(p, c) { const wh = Math.max(3, smN(p, "hojd", 8)), top = Math.max(1.3, wh - 1.8 + 0.1), L = p.L / 2, B = p.B / 2, col = "#f59e0b";
      c.box(col, 0, 0, 0.5, p.L, p.B, 0.5, null, 0.08, { shin: 50 }); c.box("#1f2937", 0, 0, 0.2, p.L - 0.1, p.B - 0.1, 0.16, null, 0.04); [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([a, b]) => smWheel(c, a * (L - 0.45), b * (B + 0.02), 0.3, 0.22));
      c.box("#111827", L - 0.02, 0, 0.5, 0.04, B * 1.5, 0.32, null, 0.01); c.box("#dc2626", L + 0.01, 0.45, 0.65, 0.03, 0.12, 0.05, null, 0, SMLIT);
      const n = Math.max(2, Math.round(top / 1.0)), seg = (top - 0.78) / n;                                                                                    // sax: korsade armar
      for (let i = 0; i < n; i++) { const z0 = 0.78 + i * seg, z1 = z0 + seg, ax = L * 0.62; [-1, 1].forEach(sd => { c.rod("#9ca3af", [-ax, sd * B * 0.55, z0], [ax, sd * B * 0.55, z1], 0.06, 0.06, 6, SMM); c.rod("#9ca3af", [ax, sd * B * 0.55, z0], [-ax, sd * B * 0.55, z1], 0.06, 0.06, 6, SMM); }); c.cyl("#374151", "y", 0, 0, (z0 + z1) / 2, 0.06, 0.06, B * 1.2, 8); }
      const zt = 0.78 + top; c.box("#9ca3af", 0, 0, zt + 0.05, p.L, p.B, 0.1, null, 0.03, SMM); c.box("#4b5563", 0, 0, zt + 0.11, p.L - 0.1, p.B - 0.1, 0.02, null, 0, { rough: 0.9 });
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => c.cyl(SM_YEL, "z", a * (L - 0.04), b * (B - 0.04), zt + 0.62, 0.025, 0.025, 1.05, 8)); [0.55, 1.0].forEach(h => { c.box(SM_YEL, 0, -B + 0.04, zt + h, p.L - 0.04, 0.045, 0.045, null, 0.01); c.box(SM_YEL, 0, B - 0.04, zt + h, p.L - 0.04, 0.045, 0.045, null, 0.01); c.box(SM_YEL, -L + 0.04, 0, zt + h, 0.045, p.B - 0.04, 0.045, null, 0.01); c.box(SM_YEL, L - 0.04, 0, zt + h, 0.045, p.B - 0.04, 0.045, null, 0.01); });
      c.box("#374151", L - 0.5, 0, zt + 0.55, 0.28, 0.4, 0.45, null, 0.03); c.box("#2563eb", L - 0.35, 0, zt + 0.62, 0.02, 0.28, 0.2, null, 0, SMLIT);
      if (smF(p, "anv") || true) c.card({ title: "Lift " + smFmt(wh, 0) + " m", icon: "crane", color: "#d97706", rows: smF(p, "anv") ? [["Används av", smF(p, "anv")]] : [["Arbetshöjd", smFmt(wh, 1) + " m"]], zb: zt + 1.7, b0: -(B + 0.5) }); } },
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
