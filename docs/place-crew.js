/* Bemanning i 3D (Victor 2026-10-22: "en sorts gubbe för alla olika entreprenörer i ganttschemat … öka antalet på en knapp … placera ut i kluster hur många som är på respektive plats …
   en kommentar ovanför gubbarna som följer med i IFC-exporten"). En bemanning är en vanlig placering (typ "crew:<entreprenör>") med antal och kommentar. Gubbarna är små
   raka prismor (ben, kropp, armar, huvud, hjälm) i entreprenörens färg, ordnade i ringar runt placeringen, och kommentaren är en skylt med text som riktig geometri ovanför dem.
   Samma delar ritas i 3D-editorn och skrivs till IFC (place3d.js), så det som syns är det som exporteras. */
const CREW_PAL = ["#e5484d", "#f59e0b", "#2f9e44", "#1c7ed6", "#9c36b5", "#0ca678", "#f76707", "#364fc7", "#c2255c", "#5c940d", "#1098ad", "#a61e4d"];
const CREW_MAX = 200;
function crewContractors() {
  const s = new Set(); (typeof items !== "undefined" ? items : []).forEach(r => { const c = String(r.contractor || "").trim(); if (c) s.add(c); });
  return [...s].sort((a, b) => a.localeCompare(b, "sv", { numeric: true }));
}
function crewColor(name) {
  const i = crewContractors().indexOf(name); if (i >= 0) return CREW_PAL[i % CREW_PAL.length];
  let h = 0; for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return CREW_PAL[h % CREW_PAL.length];
}
const crewType = c => "crew:" + (c || "");
const crewIsType = t => String(t || "").startsWith("crew:");
function crewLib(type) {
  const c = String(type).slice(5);
  return { group: "Personal", label: c ? "Bemanning " + c : "Bemanning", color: crewColor(c), crew: true, contractor: c, L: 2.4, B: 2.4, H: 1.8, title: "Gubbar i kluster – antal och kommentar ställs in när du markerat placeringen" };
}
/* Platserna i klustret: mitten, sedan ringar (6, 12, 18 … personer) med 0,8 m mellan varje. Returnerar [[a, b]] lokalt och klustrets radie. */
function crewSlots(n) {
  const out = []; let ring = 0;
  while (out.length < n) { if (ring === 0) out.push([0, 0]); else { const k = 6 * ring, r = 0.8 * ring, off = ring % 2 ? 0 : Math.PI / k; for (let i = 0; i < k && out.length < n; i++) { const t = off + 2 * Math.PI * i / k; out.push([r * Math.cos(t), r * Math.sin(t)]); } } ring++; }
  return { slots: out, R: 0.8 * Math.max(0, ring - 1) + 0.45 };
}
const crewDash = a => String(a || "").trim().replace(/^(\d{3}\w{0,2})\s+(?!-\s)(?=\S)/, "$1 - ");
function crewArea(p) { // Område på skylten: eget (t.ex. "741 - Sektionsfickor"), annars den valda aktivitetens område
  const own = String(p.area || "").trim(); if (own) return crewDash(own);
  if (p.actArea) return crewDash(p.actArea);
  const it = p.itemId && typeof items !== "undefined" ? items.find(x => x.id === p.itemId) : null; return it ? crewDash(String(it.area || "").split(" / ").pop()) : "";
}
function crewAreaChoices() { const s = new Set(); (typeof items !== "undefined" ? items : []).forEach(r => { const a = crewDash(String(r.area || "").split(" / ").pop()); if (a) s.add(a); }); return [...s].sort((a, b) => a.localeCompare(b, "sv", { numeric: true })); }
function crewActivity(p) { // Aktivitet på skylten: egen text, annars den valda aktiviteten (4D)
  const own = String(p.comment || "").trim(); if (own) return own;
  if (p.actName) return String(p.actName).trim();
  const it = p.itemId && typeof items !== "undefined" ? items.find(x => x.id === p.itemId) : null; return it ? String(it.activity || it.object_name || it.objectName || "").trim() : "";
}
const crewCount = p => Math.max(1, Math.min(CREW_MAX, Math.round(Number(p.count) || 1)));
/* Platserna för placeringen: ringar (auto), skalade till vald spridning (diameter, m) och med eventuella handflyttade gubbar (p.pos[i] = [a, b]) ovanpå. R = klustrets radie. */
function crewLayout(p) {
  const base = crewSlots(crewCount(p)); let slots = base.slots.map(q => q.slice()); const sp = Number(p.spread) || 0;
  if (sp > 0) { const cur = Math.max(0.01, base.R - 0.45), k = cur > 0.02 ? Math.max(0.2, sp / 2 - 0.35) / cur : 1; slots = slots.map(([a, b]) => [a * k, b * k]); }
  const pos = Array.isArray(p.pos) ? p.pos : []; slots = slots.map((q, i) => (pos[i] && isFinite(pos[i][0]) && isFinite(pos[i][1]) ? [Number(pos[i][0]), Number(pos[i][1])] : q));
  return { slots, R: Math.max(0.45, ...slots.map(([a, b]) => Math.hypot(a, b) + 0.45)) };
}
const crewAutoDiam = p => { const R = crewSlots(crewCount(p)).R; return Math.round((R * 2 - 0.7) * 2) / 2; };
function crewSync(p) { const R = crewLayout(p).R; p.L = p.B = Math.round(R * 2 * 10) / 10; p.H = 1.8; }
/* En raka list i planet (a = längs skylten, z = upp) med tjocklek t i b-led: 8 hörn, 12 trianglar. */
function crewBar(T, a0, z0, a1, z1, w, t, b, ext) {
  const da = a1 - a0, dz = z1 - z0, L = Math.hypot(da, dz) || 1, ua = da / L, uz = dz / L, na = -uz, nz = ua, e = w / 2, x = ext == null ? e : ext, base = T.loc.length;
  [[a0 - ua * x, z0 - uz * x], [a1 + ua * x, z1 + uz * x]].forEach(([pa, pz]) => { [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sb]) => T.loc.push([pa + na * e * sx, b + sb * t / 2, pz + nz * e * sx])); });
  const q = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]; q.forEach(f => T.faces.push([base + f[0] + 1, base + f[1] + 1, base + f[2] + 1], [base + f[0] + 1, base + f[2] + 1, base + f[3] + 1]));
}
/* Rund "prick" (10-hörnig skiva) i skyltens plan – ger runda ändar och mjuka böjar där strecken möts. */
function crewDot(T, a, z, d, t, b) {
  const n = 10, base = T.loc.length, r = d / 2;
  for (let i = 0; i < n; i++) { const th = i * 2 * Math.PI / n; T.loc.push([a + r * Math.cos(th), b - t / 2, z + r * Math.sin(th)]); }
  for (let i = 0; i < n; i++) { const th = i * 2 * Math.PI / n; T.loc.push([a + r * Math.cos(th), b + t / 2, z + r * Math.sin(th)]); }
  for (let k = 1; k + 1 < n; k++) T.faces.push([base + 1, base + k + 2, base + k + 1], [base + n + 1, base + n + k + 1, base + n + k + 2]);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; T.faces.push([base + i + 1, base + j + 1, base + j + n + 1], [base + i + 1, base + j + n + 1, base + i + n + 1]); }
}
/* Text som streck (IFC-skrivarens streckfont, versaler/siffror) stående på skylten. Returnerar bredden. */
function crewText(T, text, size, a, z, b, align, bold) {
  const t = ifcTextStrokes(text), k = size / 6, w = t.width * k, a0 = align === "c" ? a - w / 2 : align === "r" ? a - w : a, th = Math.max(0.025, size * (bold ? 0.21 : 0.15));
  t.strokes.forEach(pl => { for (let i = 0; i + 1 < pl.length; i++) crewBar(T, a0 + pl[i][0] * k, z + pl[i][1] * k, a0 + pl[i + 1][0] * k, z + pl[i + 1][1] * k, th, th * 0.8, b, 0); pl.forEach(q => crewDot(T, a0 + q[0] * k, z + q[1] * k, th, th * 0.8, b)); });
  return w;
}
function crewWrap(text, max) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean), lines = []; let cur = "";
  words.forEach(w => { while (w.length > max) { if (cur) { lines.push(cur); cur = ""; } lines.push(w.slice(0, max)); w = w.slice(max); } if ((cur + " " + w).trim().length > max) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); });
  if (cur) lines.push(cur); return lines.slice(0, 5);
}
/* Gubben (Victor 2026-10-23: "samma detaljnivå som mobilkranen"): byggare i arbetskläder byggd av riktiga former (TK i place-geo.js) – rundade ben och armar, kängor med sula, bälte med
   verktygsficka och radio, reflexväst med band, händer i handskar, huvud med näsa, öron, ögon och skyddsglasögon samt skyddshjälm med skärm i entreprenörens färg.
   lod 2 (≤ 12 personer) = full detalj, 1 (≤ 40) = medel, 0 (fler) = enkel – så att stora kluster inte blir tunga. Varje gubbe får lite egen hållning, hudton och längd. */
const CREW_SKIN = ["#e3b28a", "#c98f66", "#8d5a3c", "#f0c9a3"], CREW_SHIRT = ["#3b5b8c", "#4a5d46", "#5b4a6e", "#3f4c5a"];
function crewPerson(ctx, col, cx, cy, yaw, hs, i, lod) {
  const c = Math.cos(yaw), s = Math.sin(yaw), P = (a, b) => [cx + a * c - b * s, cy + a * s + b * c], Z = v => v * hs, skin = CREW_SKIN[i % 4], shirt = CREW_SHIRT[(i * 3) % 4];
  const PANTS = "#39424f", BOOT = "#2a2119", SOLE = "#14100c", REF = "#e9eef3", DARK = "#2a2e34", GLASS = "#18222e";
  const bevel = lod === 2 ? 0.035 : lod === 1 ? 0.025 : 0, sg = lod === 2 ? [12, 7] : lod === 1 ? [8, 5] : [6, 4], lg = lod === 2 ? 10 : lod === 1 ? 7 : 5;
  const swing = (((i * 37) % 7) - 3) * 0.035, step = (i % 3 === 1) ? 0.07 : 0, lean = (i % 5 === 2) ? 0.06 : 0;
  const bx = (color, a, b, zz, sa, sb, sz, rot, bv, o) => { const [X, Y] = P(a, b); ctx.box(color, X, Y, Z(zz), sa, sb, Z(sz), rot ? [yaw + (rot[0] || 0), rot[1] || 0, rot[2] || 0] : [yaw, 0, 0], bv == null ? bevel : bv, o); };
  const cy2 = (color, a, b, zz, r0, r1, len, rot, seg) => { const [X, Y] = P(a, b); ctx.cyl(color, "z", X, Y, Z(zz), r0, r1, Z(len), seg || lg, rot ? [yaw + (rot[0] || 0), rot[1] || 0, rot[2] || 0] : [yaw, 0, 0]); };
  const sp = (color, a, b, zz, rx, ry, rz, rot, o) => { const [X, Y] = P(a, b); ctx.sph(color, X, Y, Z(zz), rx, ry, rz, sg[0], sg[1], rot ? [yaw + (rot[0] || 0), rot[1] || 0, rot[2] || 0] : [yaw, 0, 0], o); };
  // ---- ben och kängor (steg: ena benet lite framför)
  [[-1, 0], [1, step]].forEach(([sd, fw]) => { const b = sd * 0.1, a = fw;
    bx(BOOT, a + 0.05, b, 0.075, 0.29, 0.135, 0.15, null, lod ? 0.04 : 0); if (lod) bx(SOLE, a + 0.055, b, 0.012, 0.3, 0.13, 0.026, null, 0);
    if (lod === 2) sp(BOOT, a + 0.165, b, 0.06, 0.07, 0.062, 0.05);
    cy2(PANTS, a, b, 0.33, 0.058, 0.07, 0.42, [0, fw ? -0.12 : 0, 0]); cy2(PANTS, a, b, 0.7, 0.07, 0.09, 0.42, [0, fw ? 0.12 : 0, 0]);
    if (lod === 2) { sp(PANTS, a + 0.01, b, 0.5, 0.074, 0.074, 0.074); sp("#465163", a + 0.068, b, 0.52, 0.026, 0.055, 0.066); } // knä + knäskydd
  });
  // ---- höft, bälte, verktygsficka
  bx(PANTS, 0, 0, 0.9, 0.24, 0.35, 0.2, null, lod ? 0.05 : 0); bx("#2b2f3a", 0, 0, 0.99, 0.25, 0.365, 0.05, null, lod ? 0.015 : 0); if (lod) { bx("#b8bcc2", 0.128, 0, 0.99, 0.012, 0.05, 0.035, null, 0, { metal: 0.85, rough: 0.3 }); bx("#5b4630", -0.01, 0.2, 0.88, 0.085, 0.07, 0.15, null, 0.02); }
  if (lod === 2) { bx("#5b4630", 0.04, -0.2, 0.9, 0.075, 0.06, 0.13, null, 0.02); }
  // ---- överkropp: elliptisk bål (tröja + reflexväst med band), axlar, radio
  { const [X, Y] = P(0, 0), rot = [yaw + lean * 0.5, lean, 0], e = (color, z0, rx0, ry0, rx1, ry1, len, o) => ctx.ecyl(color, X, Y, Z(z0 + len / 2), rx0, ry0, rx1, ry1, Z(len), lod === 2 ? 14 : lod === 1 ? 10 : 6, rot, o);
    e(shirt, 0.92, 0.1, 0.165, 0.118, 0.205, 0.5); sp(shirt, -0.005, 0, 1.4, 0.115, 0.215, 0.075, [0, 0, 0]);
    e(col, 0.94, 0.108, 0.176, 0.126, 0.214, 0.43, { shin: 30 }); [-1, 1].forEach(sd => bx(col, 0.0, sd * 0.115, 1.395, 0.1, 0.075, 0.07, [0, 0, sd * 0.2], lod ? 0.025 : 0, { shin: 30 }));
    if (lod) { [1.03, 1.255].forEach(zz => e(REF, zz, 0.116, 0.186, 0.12, 0.192, 0.04, { metal: 0.7, rough: 0.35 })); }
    if (lod === 2) { [-1, 1].forEach(sd => { bx(REF, 0.118, sd * 0.088, 1.2, 0.01, 0.05, 0.3, [0, lean, 0], 0, { metal: 0.7, rough: 0.35 }); bx(REF, -0.118, sd * 0.088, 1.2, 0.01, 0.05, 0.3, [0, lean, 0], 0, { metal: 0.7, rough: 0.35 }); }); bx(DARK, 0.128, 0.115, 1.3, 0.045, 0.07, 0.11, null, 0.012); bx("#8a929b", 0.14, 0.115, 1.355, 0.008, 0.008, 0.07, null, 0); bx("#f2c230", 0.126, -0.1, 1.31, 0.012, 0.07, 0.05, null, 0.004); } }
  // ---- armar med händer i handskar
  [-1, 1].forEach(sd => { const b = sd * 0.24, sw = sd * swing;
    sp(shirt, 0, b, 1.37, 0.062, 0.062, 0.062);
    if (lod) { cy2(shirt, 0.0, b + sd * 0.02, 1.2, 0.044, 0.056, 0.3, [sw, 0, sd * 0.13]); sp(shirt, 0.01, b + sd * 0.03, 1.06, 0.047, 0.047, 0.047); cy2(shirt, 0.04, b + sd * 0.045, 0.93, 0.04, 0.046, 0.28, [sw, -0.28, sd * 0.07]);
      cy2("#f2c230", 0.085, b + sd * 0.055, 0.815, 0.046, 0.046, 0.03, [sw, -0.28, sd * 0.07]); sp(DARK, 0.1, b + sd * 0.055, 0.78, 0.05, 0.045, 0.062); if (lod === 2) sp(DARK, 0.135, b + sd * 0.04, 0.8, 0.02, 0.017, 0.032); }
    else { bx(shirt, 0.02, b + sd * 0.02, 1.07, 0.09, 0.09, 0.6, [0, -0.1, 0], 0); bx(DARK, 0.06, b + sd * 0.04, 0.75, 0.09, 0.09, 0.1, null, 0); } });
  // ---- hals, huvud, ansikte
  cy2(skin, 0.0, 0, 1.47, 0.048, 0.054, 0.09); sp(skin, 0.012, 0, 1.56, 0.1, 0.088, 0.112);
  if (lod) { sp(skin, 0.098, 0, 1.545, 0.022, 0.02, 0.026); [-1, 1].forEach(sd => sp(skin, -0.005, sd * 0.09, 1.55, 0.018, 0.012, 0.03)); }
  if (lod === 2) { [-1, 1].forEach(sd => { sp("#f4f1ec", 0.088, sd * 0.036, 1.575, 0.013, 0.016, 0.018); sp("#1c1713", 0.099, sd * 0.036, 1.575, 0.007, 0.008, 0.009); bx("#3b2a1e", 0.092, sd * 0.036, 1.6, 0.01, 0.04, 0.01, null, 0); }); bx("#7a4a3a", 0.098, 0, 1.51, 0.008, 0.04, 0.008, null, 0); }
  if (lod) bx(GLASS, 0.094, 0, 1.575, 0.03, 0.17, 0.038, null, 0.012, { transp: 0.35, shin: 120, metal: 0.4, rough: 0.15 });
  // ---- skyddshjälm med skärm (entreprenörens färg)
  { const [X, Y] = P(0.005, 0), dome = [[0.118, 0], [0.128, 0.025], [0.125, 0.065], [0.108, 0.1], [0.075, 0.12], [0.03, 0.132], [0.0, 0.134]];
    ctx.lathe(col, dome, X, Y, Z(1.605), lod === 2 ? 16 : lod === 1 ? 10 : 7, [yaw, 0, 0], { shin: 90 }); if (lod) { bx(col, 0.13, 0, 1.612, 0.1, 0.17, 0.014, [0, 0.12, 0], 0.005, { shin: 90 }); bx("#e9eef3", 0.0, 0, 1.742, 0.2, 0.034, 0.012, null, 0.004, { shin: 90 }); }
    if (lod === 2) { bx("#20262c", -0.115, 0, 1.64, 0.03, 0.07, 0.04, null, 0.01); [-1, 1].forEach(sd => bx("#20262c", 0.0, sd * 0.088, 1.585, 0.01, 0.01, 0.07, [0, 0, sd * 0.35], 0)); } }
}
/* Delarna för placeringen p (i världskoordinater som övriga placeringar; z = underkant). */
/* Skyltens vridning (grader): egen om den är satt, annars standarden som sparats för alla bemanningar. */
const CREW_SIGN_KEY = "4dplan-crew-sign-yaw";
function crewSignDefault() { try { const v = parseFloat(localStorage.getItem(CREW_SIGN_KEY)); return isFinite(v) ? v : 0; } catch (e) { return 0; } }
function crewSignDefaultSet(v) { try { localStorage.setItem(CREW_SIGN_KEY, String(v)); } catch (e) { /* privat läge */ } }
const crewSignYaw = p => (p.signYaw != null && isFinite(Number(p.signYaw)) ? Number(p.signYaw) : crewSignDefault());
function crewParts(p, z) {
  const lib = placeLib(p.type) || {}, col = p.color || lib.color || crewColor(lib.contractor), n = crewCount(p), { slots, R } = crewLayout(p), ctx = smMakeCtx(p, z, col), lod = n <= 12 ? 2 : n <= 40 ? 1 : 0;
  slots.forEach(([cx, cy], i) => { const yaw = -Math.PI / 2 + ((((i * 137.5) % 360) - 180) * Math.PI / 180) * 0.22, hs = 0.96 + ((i * 53) % 9) / 100; crewPerson(ctx, col, cx, cy, yaw, hs, i, lod); });
  const spec = { title: `Entreprenör: ${String(lib.contractor || "Bemanning")}`, icon: "hat", color: col, left: ["Antal YA", String(n)], rows: [["Område", crewArea(p)], ["Aktivitet", crewActivity(p)], ...(smDateText(p) ? [["Datum", smDateText(p)]] : [])], zb: smSignZ(p) == null ? 2.45 : smSignZ(p), b0: -(R + 0.2) };
  smCard(ctx, { ...spec, yaw: crewSignYaw(p), at: Array.isArray(p.signPos) && isFinite(p.signPos[0]) && isFinite(p.signPos[1]) ? [Number(p.signPos[0]), Number(p.signPos[1])] : null });
  if (p.signPlan) smCard(ctx, { ...spec, plan: { at: Array.isArray(p.planPos) && isFinite(p.planPos[0]) ? [Number(p.planPos[0]), Number(p.planPos[1])] : [0, -(R + 2.6)], yaw: Number(p.planYaw) || 0 } });
  return ctx.flush();
}
/* Slår ihop alla delar med samma färg (och ur-belysning-flagga) till en enda trianglelista (pts relativt o, ytor 1-baserade): tusentals prismor blir några få nät. */
function crewMergeGroups(parts, o) {
  const m = new Map();
  parts.forEach(pt => {
    if (pt.sign) return; const mt = pt.mat || {};
    const k = (pt.color || "#888888") + "|" + (pt.unlit ? 1 : 0) + "|" + (pt.transp || 0) + "|" + (pt.role === "reach" ? 1 : 0) + "|" + (mt.shin == null ? "" : mt.shin) + "|" + (mt.metal == null ? "" : mt.metal) + "|" + (mt.rough == null ? "" : mt.rough), G = m.get(k) || m.set(k, { color: pt.color || "#888888", unlit: !!pt.unlit, transp: pt.transp || 0, reach: pt.role === "reach", mat: mt, pts: [], faces: [], sg: [] }).get(k), base = G.pts.length;
    if (pt.tris) { pt.tris.pts.forEach(q => G.pts.push([q[0] - o[0], q[1] - o[1], q[2] - o[2]])); pt.tris.faces.forEach((f, i) => { G.faces.push([f[0] + base, f[1] + base, f[2] + base]); G.sg.push(pt.tris.sg ? pt.tris.sg[i] : 0); }); return; }
    let poly = pt.poly; if (typeof TK !== "undefined" && TK.area2(poly) < 0) poly = poly.slice().reverse(); const n = poly.length; poly.forEach(q => G.pts.push([q[0] - o[0], q[1] - o[1], pt.z0 - o[2]])); poly.forEach(q => G.pts.push([q[0] - o[0], q[1] - o[1], pt.z1 - o[2]]));
    const fp = f => { G.faces.push(f); G.sg.push(0); };
    if (typeof TK !== "undefined") TK.tri2(poly).forEach(([a, b2, c2]) => { fp([base + a + 1, base + c2 + 1, base + b2 + 1]); fp([base + n + a + 1, base + n + b2 + 1, base + n + c2 + 1]); });
    else for (let k2 = 1; k2 + 1 < n; k2++) { fp([base + 1, base + k2 + 2, base + k2 + 1]); fp([base + n + 1, base + n + k2 + 1, base + n + k2 + 2]); }
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; fp([base + i + 1, base + j + 1, base + j + n + 1]); fp([base + i + 1, base + j + n + 1, base + i + n + 1]); }
  });
  return [...m.values()];
}
function crewGroupGeometry(G) { // platta ytor för skarpa kanter, mjuka normaler där formen är rund (sg > 0)
  const nF = G.faces.length, pos = new Float32Array(nF * 9), nor = new Float32Array(nF * 9), acc = new Map(), fn = new Float32Array(nF * 3);
  G.faces.forEach((f, i) => { const A = G.pts[f[0] - 1], B = G.pts[f[1] - 1], C = G.pts[f[2] - 1]; for (let j = 0; j < 3; j++) { const P = G.pts[f[j] - 1]; pos[i * 9 + j * 3] = P[0]; pos[i * 9 + j * 3 + 1] = P[1]; pos[i * 9 + j * 3 + 2] = P[2]; }
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2]; let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; fn[i * 3] = nx; fn[i * 3 + 1] = ny; fn[i * 3 + 2] = nz;
    if (G.sg[i]) f.forEach(v => { let a2 = acc.get(v); if (!a2) acc.set(v, a2 = [0, 0, 0]); a2[0] += nx; a2[1] += ny; a2[2] += nz; }); });
  G.faces.forEach((f, i) => { for (let j = 0; j < 3; j++) { let n = G.sg[i] ? acc.get(f[j]) : [fn[i * 3], fn[i * 3 + 1], fn[i * 3 + 2]]; const l = Math.hypot(n[0], n[1], n[2]) || 1; nor[i * 9 + j * 3] = n[0] / l; nor[i * 9 + j * 3 + 1] = n[1] / l; nor[i * 9 + j * 3 + 2] = n[2] / l; } });
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); return g;
}
/* Panelen i 3D-editorn: entreprenör, antal (med knappar) och kommentar. onChange(p) ritar om. */
function crewActOptions(p, cur) {
  const esc = typeof escHtml === "function" ? escHtml : s => String(s), all = (typeof items !== "undefined" ? items : []).filter(r => r.activity || r.object_name || r.objectName), mine = all.filter(r => (r.contractor || "") === cur), list = (mine.length ? mine : all).slice(0, 400), seen = new Set();
  return list.filter(r => { const k = (r.activity || r.object_name || r.objectName) + "|" + (r.start_date || r.startDate || ""); if (seen.has(k) && r.id !== p.itemId) return false; seen.add(k); return true; }).map(r => `<option value="${esc(r.id)}"${r.id === p.itemId ? " selected" : ""}>${esc(r.activity || r.object_name || r.objectName)}${(r.start_date || r.startDate) ? ` (${r.start_date || r.startDate} – ${r.end_date || r.endDate || ""})` : ""}</option>`).join("");
}
const smFmtD = v => String(Math.round(v * 10) / 10).replace(".", ",");
function crewSideHtml(p) {
  const esc = typeof escHtml === "function" ? escHtml : s => String(s), lib = placeLib(p.type) || {}, cs = crewContractors(), cur = lib.contractor || "";
  const opts = [...new Set([cur, ...cs])].filter(x => x !== undefined).map(c => `<option value="${esc(c)}"${c === cur ? " selected" : ""}>${esc(c || "(ingen entreprenör)")}</option>`).join("");
  const n = crewCount(p), d0 = p.start || "", d1 = p.end || "", dt = d0 ? (d1 && d1 !== d0 ? d0 + " → " + d1 : d0) : "inget datum", col = p.color || (typeof crewColor === "function" ? crewColor(cur) : "#2563eb");
  return `<div class="v3-sec">Bemanning</div>
    <div class="v3-cw-head"><i style="background:${esc(col)}"></i><div><b>${esc(cur || "Bemanning")}</b><small data-crew="sum">${n} ${n === 1 ? "person" : "personer"} · ${esc(dt)}</small></div></div>
    <div class="v3-cw-card"><h4>Antal personer</h4>
      <div class="v3-crew-n"><button type="button" data-crew="dec" title="En person färre">${UI_MINUS}</button><input type="text" inputmode="numeric" data-crew="count" value="${n}" aria-label="Antal personer" /><button type="button" data-crew="inc" title="En person till">${UI_PLUS}</button><button type="button" data-crew="inc5" class="v3-crew-5" title="Fem till">＋5</button></div>
      <label class="v3-field v3-crew-sp"><span>Spridning (diameter) <b class="v3-cw-badge" data-crew="spreadv">${smFmtD(p.spread || crewAutoDiam(p))}</b> m${p.spread ? "" : " (auto)"}</span><input type="range" min="1" max="40" step="0.5" data-crew="spread" value="${p.spread || crewAutoDiam(p)}" /></label>
      <div class="v3-btns"><button type="button" data-crew="dragon" class="${crewDrag.on && crewDrag.id === p.id ? "on" : ""}" title="Slå på och dra gubbarna med musen på marken. Esc stänger av.">✋ Flytta gubbar/skylt (dra)</button><button type="button" data-crew="resetpos" title="Ordna om gubbarna automatiskt i ringar">Ordna om</button></div>
    </div>
    <div class="v3-cw-card"><h4>Skylt</h4>
      <label class="v3-field"><span>Entreprenör</span><select data-crew="contractor">${opts}</select></label>
      <label class="v3-field"><span>Område (välj eller skriv, t.ex. 741 - Sektionsfickor)</span><input type="text" class="v3-cb" data-crew="area" autocomplete="off" maxlength="60" value="${esc(p.area || "")}" placeholder="${esc(crewArea({ actArea: p.actArea, itemId: p.itemId }) || "741 - Sektionsfickor")}" /></label>
      <label class="v3-field"><span>Aktivitet i Gantten (sök, t.ex. Linje I - H gjutning)</span><input type="text" class="v3-cb" data-crew="act" autocomplete="off" value="${esc(p.actName || "")}" placeholder="Sök aktivitet …" />${p.actName ? `<button type="button" class="v3-cb-x" data-crew="actclear" title="Ta bort vald aktivitet">✕ ta bort</button>` : ""}</label>
      <label class="v3-field"><span>Egen text (visas som Aktivitet på skylten – tom = vald aktivitet)</span><textarea data-crew="comment" rows="2" maxlength="140" placeholder="T.ex. Armerar plattan, skift 1">${esc(p.comment || "")}</textarea></label>
    </div>
    <div class="v3-cw-card"><h4>Skyltens läge</h4>
      <label class="v3-lay-sw-row"><span>Visa skylt</span><span class="v3-lay-sw"><input type="checkbox" role="switch" data-crew="signshow" ${p.signOff === true ? "" : "checked"} /><i></i></span></label>
      <label class="v3-field v3-crew-sp"><span>Vridning <b class="v3-cw-badge" data-crew="syv">${Math.round(crewSignYaw(p))}°</b>${p.signYaw == null ? " (standard)" : ""}</span><input type="range" min="-180" max="180" step="5" data-crew="syaw" value="${Math.round(crewSignYaw(p))}" /></label>
      <label class="v3-field v3-crew-sp"><span>Höjd <b class="v3-cw-badge" data-crew="szv">${smFmt(smSignZ(p) == null ? 2.45 : smSignZ(p), 1)} m</b></span><input type="range" min="0.3" max="30" step="0.1" data-crew="sz" value="${smSignZ(p) == null ? 2.45 : smSignZ(p)}" /></label>
      <div class="v3-btns"><button type="button" data-crew="sy" data-v="0">0°</button><button type="button" data-crew="sy" data-v="90">90°</button><button type="button" data-crew="sy" data-v="-90">−90°</button><button type="button" data-crew="sy" data-v="180">180°</button></div>
      <div class="v3-btns"><button type="button" data-crew="sydef" title="Alla nya och alla bemanningar utan egen vridning får samma riktning">★ Spara som standard</button><button type="button" data-crew="syall" title="Sätter standarden och nollställer egen vridning på alla bemanningar">Använd på alla</button></div>
      <div class="v3-btns"><button type="button" data-crew="signreset" title="Skylten tillbaka framför gruppen, standardvridning">Återställ skylten</button></div>
      <label class="chk"><input type="checkbox" data-crew="plan" ${p.signPlan ? "checked" : ""}> Extra skylt i planvy (liggande, läses uppifrån)</label>
      ${p.signPlan ? `<label class="v3-field v3-crew-sp"><span>Planvyskyltens vridning <b class="v3-cw-badge" data-crew="pyv">${Math.round(Number(p.planYaw) || 0)}°</b></span><input type="range" min="-180" max="180" step="5" data-crew="pyaw" value="${Math.round(Number(p.planYaw) || 0)}" /></label>` : ""}
      <div class="muted" style="font-size:11.5px">Dra skylten med "Flytta gubbar (dra)" påslaget för fri placering.</div>
    </div>
    <div class="v3-cw-card"><h4>Datum</h4>${typeof smDateFieldsHtml === "function" ? smDateFieldsHtml(p) : ""}</div>
    <button type="button" class="v3-wide" data-crew="report" title="Alla bemanningar per område och entreprenör med summa YA, som tabell och CSV">Σ Sammanställ bemanning…</button>`;
}
function crewBindSide(side, p, redraw) {
  let lt = 0; const live = () => { clearTimeout(lt); lt = setTimeout(() => { crewSync(p); placeTouch(p); if (typeof l3RebuildOne === "function") { l3RebuildOne(p); if (typeof l3Changed === "function") l3Changed(); } }, 250); }; // skriver man i ett fält ritas skylten om direkt och inget går förlorat vid kopiering
  const apply = fn => { placeSnapshot(); fn(); crewSync(p); placeTouch(p); redraw(); const c = side.querySelector('[data-crew="count"]'); if (c) c.value = crewCount(p); };
  const q = k => side.querySelector(`[data-crew="${k}"]`);
  q("inc").onclick = () => apply(() => { p.count = Math.min(CREW_MAX, crewCount(p) + 1); }); q("inc5").onclick = () => apply(() => { p.count = Math.min(CREW_MAX, crewCount(p) + 5); }); q("dec").onclick = () => apply(() => { p.count = Math.max(1, crewCount(p) - 1); });
  q("count").onchange = e => apply(() => { p.count = Math.max(1, Math.min(CREW_MAX, parseInt(e.target.value, 10) || 1)); });
  { const cur = (placeLib(p.type) || {}).contractor || ""; if (typeof smComboBind === "function") {
      smComboBind(q("act"), () => smActItems(cur), it => apply(() => { p.actKey = it.v; p.actName = it.t; p.actArea = String((it.a && it.a.area) || "").split(" / ").pop(); }), null);
      smComboBind(q("area"), () => smAreaItems(), it => apply(() => { p.area = it.t; }), v => { p.area = v.slice(0, 60); live(); }); }
    const cl = side.querySelector('[data-crew="actclear"]'); if (cl) cl.onclick = () => apply(() => { p.actKey = p.actName = p.actArea = null; p.itemId = p.itemId; }); }
  if (typeof smDateBind === "function") smDateBind(side, p, redraw);
  { const sp = q("spread"), sv = q("spreadv"); let snap = false; sp.onpointerdown = () => { if (!snap) { placeSnapshot(); snap = true; } };
    sp.oninput = () => { p.spread = Number(sp.value); p.pos = null; if (sv) sv.textContent = smFmtD(p.spread); live(); }; sp.onchange = () => { snap = false; crewSync(p); placeTouch(p); redraw(); }; }
  q("dragon").onclick = () => { crewDragSet(!(crewDrag.on && crewDrag.id === p.id), p); redraw(); };
  q("resetpos").onclick = () => apply(() => { p.pos = null; p.spread = null; });
  if (crewDrag.on && crewDrag.id !== p.id) crewDragSet(false);
  { const sy = q("syaw"), sv = q("syv"); let snap = false; sy.onpointerdown = () => { if (!snap) { placeSnapshot(); snap = true; } };
    sy.oninput = () => { p.signYaw = Number(sy.value); if (sv) sv.textContent = Math.round(p.signYaw) + "°"; live(); }; sy.onchange = () => { snap = false; placeTouch(p); redraw(); };
    side.querySelectorAll('[data-crew="sy"]').forEach(b => b.onclick = () => apply(() => { p.signYaw = Number(b.dataset.v); }));
    q("sydef").onclick = () => { crewSignDefaultSet(crewSignYaw(p)); if (typeof l3Toast === "function") l3Toast(`Standard: skyltarna vrids ${Math.round(crewSignYaw(p))}° (gäller alla utan egen vridning)`); redraw(); if (typeof l3RebuildAll === "function") l3RebuildAll(); };
    q("syall").onclick = () => { placeSnapshot(); crewSignDefaultSet(crewSignYaw(p)); placements.filter(x => crewIsType(x.type)).forEach(x => { x.signYaw = null; placeTouch(x); if (typeof l3RebuildOne === "function") l3RebuildOne(x); }); if (typeof l3Changed === "function") l3Changed(); if (typeof l3Toast === "function") l3Toast("Alla bemanningsskyltar har nu samma vridning"); redraw(); };
    { const sh = q("signshow"); if (sh) sh.onchange = () => apply(() => { p.signOff = !sh.checked; }); }
    q("signreset").onclick = () => apply(() => { p.signYaw = null; p.signZ = null; p.signPos = null; p.planPos = null; p.planYaw = 0; });
  { const sz = q("sz"), sv2 = q("szv"); if (sz) { let snp = false; sz.onpointerdown = () => { if (!snp) { placeSnapshot(); snp = true; } }; sz.oninput = () => { p.signZ = Number(sz.value); if (sv2) sv2.textContent = smFmt(p.signZ, 1) + " m"; live(); }; sz.onchange = () => { snp = false; placeTouch(p); redraw(); }; } }
    q("plan").onchange = e => apply(() => { p.signPlan = !!e.target.checked; });
    const py = q("pyaw"); if (py) { py.oninput = () => { p.planYaw = Number(py.value); const pv = q("pyv"); if (pv) pv.textContent = Math.round(p.planYaw) + "°"; live(); }; py.onchange = () => { placeTouch(p); redraw(); }; } }
  q("report").onclick = () => crewReportOpen();
  q("area").onchange = e => apply(() => { p.area = String(e.target.value || "").trim().slice(0, 60); });
  q("comment").addEventListener("input", e => { p.comment = String(e.target.value || "").slice(0, 140); live(); });
  q("comment").onchange = e => apply(() => { p.comment = String(e.target.value || "").slice(0, 140); });
  q("contractor").onchange = e => apply(() => { const c = e.target.value; const was = crewColor((placeLib(p.type) || {}).contractor); p.type = crewType(c); if (!p.color || p.color === was) p.color = crewColor(c); if (/^Bemanning/.test(p.name || "")) p.name = placeNextName(crewLib(p.type).label); });
}
/* Rutnät som mesh-data för 3D-editorn och IFC: trianglar (1-baserade ytor) → geometri / IFC. */
function crewTrisGeometry(tr, sub) {
  const pos = new Float32Array(tr.faces.length * 9); tr.faces.forEach((f, i) => f.forEach((v, j) => { const P = tr.pts[v - 1]; pos[i * 9 + j * 3] = P[0] - sub[0]; pos[i * 9 + j * 3 + 1] = P[1] - sub[1]; pos[i * 9 + j * 3 + 2] = P[2] - sub[2]; }));
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}

/* Sammanställning: alla bemanningar per område och entreprenör med summa YA (tabell + CSV). */
function crewReportRows() {
  return placements.filter(p => crewIsType(p.type)).map(p => { const lib = placeLib(p.type) || {}; return { area: crewArea(p) || "(inget område)", co: lib.contractor || "(ingen entreprenör)", n: crewCount(p), act: crewActivity(p), start: p.start || "", end: p.end || "", name: p.name || "" }; })
    .sort((a, b) => a.area.localeCompare(b.area, "sv", { numeric: true }) || a.co.localeCompare(b.co, "sv"));
}
function crewReportOpen() {
  const rows = crewReportRows(), esc = typeof escHtml === "function" ? escHtml : s => String(s), tot = rows.reduce((a, r) => a + r.n, 0), byA = new Map(), byC = new Map();
  rows.forEach(r => { byA.set(r.area, (byA.get(r.area) || 0) + r.n); byC.set(r.co, (byC.get(r.co) || 0) + r.n); });
  const html = rows.length ? `<div class="v3-rep"><p><b>${tot}</b> YA på ${rows.length} placeringar.</p>
    <table class="v3-rt"><thead><tr><th>Område</th><th>Entreprenör</th><th>YA</th><th>Aktivitet</th><th>Period</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.area)}</td><td>${esc(r.co)}</td><td class="n">${r.n}</td><td>${esc(r.act)}</td><td>${esc([r.start, r.end].filter(Boolean).join(" – "))}</td></tr>`).join("")}</tbody></table>
    <h4>Per område</h4><table class="v3-rt">${[...byA].map(([a, n]) => `<tr><td>${esc(a)}</td><td class="n">${n}</td></tr>`).join("")}</table>
    <h4>Per entreprenör</h4><table class="v3-rt">${[...byC].map(([a, n]) => `<tr><td>${esc(a)}</td><td class="n">${n}</td></tr>`).join("")}</table>
    <p><button type="button" id="v3CrewCsv" class="v3-wide">Ladda ner CSV</button></p></div>` : `<p>Inga bemanningar är placerade än.</p>`;
  const d = typeof l3Dlg === "function" ? l3Dlg("v3CrewRep", "Bemanning – sammanställning", html, {}) : null; if (!d) return rows;
  const b = d.querySelector("#v3CrewCsv"); if (b) b.onclick = () => { const q = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"', L = [["Område", "Entreprenör", "YA", "Aktivitet", "Start", "Slut"], ...rows.map(r => [r.area, r.co, r.n, r.act, r.start, r.end])]; downloadBlob(new Blob(["\ufeff" + L.map(l => l.map(q).join(";")).join("\n")], { type: "text/csv;charset=utf-8" }), "bemanning_sammanstallning.csv"); };
  return rows;
}

/* ---- Dra gubbarna för hand (3D-editorn): slå på "Flytta gubbar", ta tag i en gubbe och dra den på marken; släpp = sparas som p.pos ----------------------------------------------- */
const crewDrag = { on: false, id: null, i: -1, z: 0, installed: false, raf: 0 };
function crewDragSet(on, p) {
  crewDrag.on = !!on; crewDrag.id = on && p ? p.id : null; crewDrag.i = -1; if (typeof l3 === "undefined" || !l3) return;
  try { l3.renderer.domElement.style.cursor = on ? "grab" : ""; } catch (e) { /* */ }
  if (on) { crewDragInstall(); if (typeof l3Status === "function") l3Status("Dra en gubbe eller skylten med musen för att flytta den på marken. Dra i tomma ytan för att flytta vyn som vanligt. Esc stänger av."); }
}
function crewDragRay(e) {
  const r = l3.renderer.domElement.getBoundingClientRect(), v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), rc = new THREE.Raycaster(); rc.setFromCamera(v, l3.camera); return rc;
}
function crewDragInstall() {
  if (crewDrag.installed) return; crewDrag.installed = true; const host = l3.renderer.domElement.parentElement || l3.renderer.domElement;
  host.addEventListener("pointerdown", e => {
    if (!crewDrag.on || e.button !== 0 || e.target !== l3.renderer.domElement) return; const p = placements.find(x => x.id === crewDrag.id), grp = p && l3.placeMeshes.get(p.id); if (!grp) return;
    grp.updateMatrixWorld(true); const hit = crewDragRay(e).intersectObject(grp, true).find(h => h.object.visible && h.object.type === "Mesh"); if (!hit) return;
    const lp = grp.worldToLocal(hit.point.clone()), lay = crewLayout(p);
    if (hit.object.userData && hit.object.userData.isSign) { // dra skylten (den stående eller planvyskylten) fritt på marken
      const flat = !!hit.object.userData.flat, cur = flat ? (Array.isArray(p.planPos) && isFinite(p.planPos[0]) ? p.planPos : [0, -(lay.R + 2.6)]) : (Array.isArray(p.signPos) && isFinite(p.signPos[0]) ? p.signPos : [0, -(lay.R + 0.2)]);
      e.stopImmediatePropagation(); e.stopPropagation(); e.preventDefault(); placeSnapshot(); crewDrag.i = 0; crewDrag.sign = flat ? "plan" : "sign"; crewDrag.off = [cur[0] - lp.x, cur[1] - lp.y]; crewDrag.z = hit.point.z; crewDrag.moved = false; if (l3.orbit) l3.orbit.enabled = false; l3.renderer.domElement.style.cursor = "grabbing"; return; }
    crewDrag.sign = null; let bi = -1, bd = 0.75; lay.slots.forEach(([a, b], i) => { const d = Math.hypot(a - lp.x, b - lp.y); if (d < bd) { bd = d; bi = i; } }); if (bi < 0) return;
    e.stopImmediatePropagation(); e.stopPropagation(); e.preventDefault(); placeSnapshot(); crewDrag.i = bi; crewDrag.z = hit.point.z; crewDrag.moved = false; if (l3.orbit) l3.orbit.enabled = false;
    const n = crewCount(p); p.pos = Array.from({ length: n }, (_, i) => (Array.isArray(p.pos) && p.pos[i]) || null); lay.slots.forEach((q, i) => { if (!p.pos[i]) p.pos[i] = [q[0], q[1]]; }); l3.renderer.domElement.style.cursor = "grabbing";
  }, true);
  window.addEventListener("pointermove", e => {
    if (crewDrag.i < 0) return; const p = placements.find(x => x.id === crewDrag.id), grp = p && l3.placeMeshes.get(p.id); if (!p || !grp) return;
    const pt = new THREE.Vector3(); if (!crewDragRay(e).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -crewDrag.z), pt)) return; grp.updateMatrixWorld(true); const lp = grp.worldToLocal(pt);
    if (crewDrag.sign) { const v = [Math.round((lp.x + crewDrag.off[0]) * 100) / 100, Math.round((lp.y + crewDrag.off[1]) * 100) / 100]; if (crewDrag.sign === "plan") p.planPos = v; else p.signPos = v; }
    else p.pos[crewDrag.i] = [Math.round(lp.x * 100) / 100, Math.round(lp.y * 100) / 100]; crewDrag.moved = true; e.stopPropagation();
    if (!crewDrag.raf) crewDrag.raf = requestAnimationFrame(() => { crewDrag.raf = 0; crewSync(p); l3RebuildOne(p); if (typeof l3Render === "function") l3Render(); });
  }, true);
  window.addEventListener("pointerup", () => {
    if (crewDrag.i < 0) return; const p = placements.find(x => x.id === crewDrag.id); crewDrag.i = -1; if (l3.orbit) l3.orbit.enabled = true; l3.renderer.domElement.style.cursor = crewDrag.on ? "grab" : "";
    if (p && crewDrag.moved) { crewSync(p); placeTouch(p); l3RebuildOne(p); if (typeof l3Changed === "function") l3Changed(); if (typeof l3RenderSide === "function") { const sd = document.getElementById("v3Side"); if (sd) sd.dataset.id = ""; l3RenderSide(); } }
  }, true);
  window.addEventListener("keydown", e => { if (e.key === "Escape" && crewDrag.on) { crewDragSet(false); const sd = document.getElementById("v3Side"); if (sd) sd.dataset.id = ""; if (typeof l3RenderSide === "function") l3RenderSide(); e.stopPropagation(); } }, true);
}
