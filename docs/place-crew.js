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
function crewActivity(p) { // Aktivitet på skylten: egen text, annars den valda aktiviteten (4D)
  const own = String(p.comment || "").trim(); if (own) return own;
  const it = p.itemId && typeof items !== "undefined" ? items.find(x => x.id === p.itemId) : null; return it ? String(it.activity || it.object_name || it.objectName || "").trim() : "";
}
const crewCount = p => Math.max(1, Math.min(CREW_MAX, Math.round(Number(p.count) || 1)));
function crewSync(p) { const R = crewSlots(crewCount(p)).R; p.L = p.B = Math.round(R * 2 * 10) / 10; p.H = 1.8; }
/* En raka list i planet (a = längs skylten, z = upp) med tjocklek t i b-led: 8 hörn, 12 trianglar. */
function crewBar(T, a0, z0, a1, z1, w, t, b) {
  const da = a1 - a0, dz = z1 - z0, L = Math.hypot(da, dz) || 1, ua = da / L, uz = dz / L, na = -uz, nz = ua, e = w / 2, base = T.loc.length;
  [[a0 - ua * e, z0 - uz * e], [a1 + ua * e, z1 + uz * e]].forEach(([pa, pz]) => { [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sb]) => T.loc.push([pa + na * e * sx, b + sb * t / 2, pz + nz * e * sx])); });
  const q = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]]; q.forEach(f => T.faces.push([base + f[0] + 1, base + f[1] + 1, base + f[2] + 1], [base + f[0] + 1, base + f[2] + 1, base + f[3] + 1]));
}
/* Text som streck (IFC-skrivarens streckfont, versaler/siffror) stående på skylten. Returnerar bredden. */
function crewText(T, text, size, a, z, b, align, bold) {
  const t = ifcTextStrokes(text), k = size / 6, w = t.width * k, a0 = align === "c" ? a - w / 2 : align === "r" ? a - w : a, th = Math.max(0.025, size * (bold ? 0.21 : 0.15));
  t.strokes.forEach(pl => { if (pl.length === 1) crewBar(T, a0 + pl[0][0] * k, z + pl[0][1] * k, a0 + pl[0][0] * k + 0.001, z + pl[0][1] * k, th, th * 0.8, b); for (let i = 0; i + 1 < pl.length; i++) crewBar(T, a0 + pl[i][0] * k, z + pl[i][1] * k, a0 + pl[i + 1][0] * k, z + pl[i + 1][1] * k, th, th * 0.8, b); });
  return w;
}
function crewWrap(text, max) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean), lines = []; let cur = "";
  words.forEach(w => { while (w.length > max) { if (cur) { lines.push(cur); cur = ""; } lines.push(w.slice(0, max)); w = w.slice(max); } if ((cur + " " + w).trim().length > max) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); });
  if (cur) lines.push(cur); return lines.slice(0, 5);
}
/* Gubben: lowpoly-hjälte (stövlar, bälte, reflexväst, axelskydd, hjälm med skärm, skyddsglasögon). */
const CREW_STYLES = [["a", "Lowpoly-hjälte"]];
const crewStyleOf = () => "a";
function crewPerson(style, add, P, col, hs) {
  const R = (a0, a1, b0, b1) => [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, b]) => P(a, b)), O = (r, n, ox = 0, oy = 0) => Array.from({ length: n }, (_, i) => { const t = Math.PI / n + i * 2 * Math.PI / n; return P(ox + r * Math.cos(t), oy + r * Math.sin(t)); }), Z = v => v * hs;
  const SK = "#e8b98f", PANTS = "#3b4252", BOOT = "#2a2118", SHIRT = "#35507d", GLOVE = "#2c3036", REF = "#f3f4f6";
  // a: lowpoly-hjälte
  add(R(-0.09, 0.16, -0.17, -0.01), 0, Z(0.11), BOOT); add(R(-0.09, 0.16, 0.01, 0.17), 0, Z(0.11), BOOT);
  add(R(-0.065, 0.075, -0.15, -0.03), Z(0.11), Z(0.86), PANTS); add(R(-0.065, 0.075, 0.03, 0.15), Z(0.11), Z(0.86), PANTS);
  add(R(-0.12, 0.12, -0.21, 0.21), Z(0.84), Z(0.94), "#2b2f3a"); add(R(-0.05, 0.05, 0.2, 0.27), Z(0.86), Z(1.0), "#5b4630");
  add(R(-0.125, 0.125, -0.2, 0.2), Z(0.94), Z(1.2), col); add(R(-0.14, 0.14, -0.24, 0.24), Z(1.2), Z(1.42), col); add(R(-0.13, 0.13, -0.205, 0.205), Z(1.02), Z(1.09), REF); add(R(-0.145, 0.145, -0.245, 0.245), Z(1.28), Z(1.34), REF);
  add(R(-0.075, 0.075, -0.35, -0.2), Z(1.3), Z(1.42), col); add(R(-0.075, 0.075, 0.2, 0.35), Z(1.3), Z(1.42), col);
  add(R(-0.05, 0.05, -0.33, -0.24), Z(0.9), Z(1.32), SHIRT); add(R(-0.05, 0.05, 0.24, 0.33), Z(0.9), Z(1.32), SHIRT); add(R(-0.058, 0.058, -0.34, -0.23), Z(0.8), Z(0.9), GLOVE); add(R(-0.058, 0.058, 0.23, 0.34), Z(0.8), Z(0.9), GLOVE);
  add(O(0.055, 10), Z(1.42), Z(1.48), SK); add(O(0.115, 12), Z(1.46), Z(1.66), SK); add(R(0.085, 0.125, -0.1, 0.1), Z(1.54), Z(1.6), "#1f2a37");
  add(O(0.14, 12), Z(1.62), Z(1.72), col); add(O(0.115, 12), Z(1.72), Z(1.78), col); add(R(0.1, 0.23, -0.12, 0.12), Z(1.62), Z(1.65), col);
}
/* Delarna för placeringen p (i världskoordinater som övriga placeringar; z = underkant). */
function crewParts(p, z) {
  const lib = placeLib(p.type) || {}, col = p.color || lib.color || crewColor(lib.contractor), n = crewCount(p), { slots, R } = crewSlots(n), parts = [], style = crewStyleOf(p);
  const W = (a, b) => placeToWorld(p, a, b), add = (pl, z0, z1, color, extra) => parts.push({ poly: pl, z0: z + z0, z1: z + z1, role: "body", transp: 0, color, ...(extra || {}) });
  slots.forEach(([cx, cy], i) => {
    const yaw = ((i * 137.5) % 360) * Math.PI / 180 * (i ? 0.35 : 0.2), c = Math.cos(yaw), s = Math.sin(yaw), hs = 0.96 + ((i * 53) % 9) / 100;
    crewPerson(style, (pl, z0, z1, color) => add(pl, z0, z1, color), (a, b) => W(cx + a * c - b * s, cy + a * s + b * c), col, hs);
  });
  // skylt: stående kort (ur belysning, alltid läsbart) – färgat huvud "Entreprenör: X", "Antal YA" med stort tal och "Aktivitet" med egen text eller vald aktivitet; stolpar, vänd mot lokala −b
  const cname = String(lib.contractor || "Bemanning"), act = crewActivity(p), TW = { loc: [], faces: [] }, TG = { loc: [], faces: [] }, TD = { loc: [], faces: [] }, wd = s2 => ifcTextStrokes(s2).width / 6;
  const head = `ENTREPRENÖR: ${cname}`.toUpperCase(), hs0 = 0.22, colW = 0.95, actLines = act ? crewWrap(act, 30).map(x => x.toUpperCase()) : [], vs = 0.2, lh = 0.3;
  const need = Math.max(wd(head) * hs0 + 0.4, colW + 0.5 + Math.max(2.0, ...actLines.map(l => wd(l) * vs + 0.1)));
  const w2 = Math.max(1.7, need / 2), hdr = 0.52, rows = Math.max(1, actLines.length), bodyH = Math.max(1.02, 0.42 + rows * lh + 0.12), hh = hdr + bodyH, b0 = -(R + 0.2), zb = 2.45, rect = (a0, a1, b1, b2) => [[a0, b1], [a1, b1], [a1, b2], [a0, b2]].map(([a, b]) => W(a, b));
  add(rect(-w2 + 0.15, -w2 + 0.23, b0 - 0.03, b0 + 0.01), 0, zb + 0.02, "#6b7280"); add(rect(w2 - 0.23, w2 - 0.15, b0 - 0.03, b0 + 0.01), 0, zb + 0.02, "#6b7280");   // stolpar
  add(rect(-w2 - 0.05, w2 + 0.05, b0 - 0.005, b0 + 0.04), zb - 0.05, zb + hh + 0.05, "#cbd5e1", { unlit: true });                                                  // skugga/kant bakom
  add(rect(-w2, w2, b0 - 0.03, b0 + 0.01), zb, zb + hh, "#ffffff", { unlit: true });                                                                                  // kortet
  add(rect(-w2, w2, b0 - 0.035, b0 + 0.012), zb + bodyH, zb + hh, col, { unlit: true });                                                                              // färgat huvud
  add(rect(-w2 + colW + 0.25, -w2 + colW + 0.27, b0 - 0.035, b0 + 0.012), zb + 0.15, zb + bodyH - 0.12, "#d1d5db", { unlit: true });                                    // skiljelinje
  const bT = b0 - 0.05, ax = -w2 + 0.2;
  crewText(TW, head, hs0, ax, zb + bodyH + (hdr - hs0) / 2, bT, "l", true);                                                                                            // "ENTREPRENÖR: X" (vit)
  crewText(TG, "ANTAL YA", 0.13, ax, zb + bodyH - 0.3, bT, "l", false); crewText(TD, String(n), 0.44, ax, zb + bodyH - 0.86, bT, "l", true);                            // antal
  const rx = -w2 + colW + 0.45; crewText(TG, "AKTIVITET", 0.13, rx, zb + bodyH - 0.3, bT, "l", false);
  if (actLines.length) actLines.forEach((l, i) => crewText(TD, l, vs, rx, zb + bodyH - 0.3 - 0.2 - (i + 1) * lh + 0.2, bT, "l", i === 0 && actLines.length === 1)); else crewText(TG, "–", 0.2, rx, zb + bodyH - 0.62, bT, "l", false);
  [[TW, "#ffffff"], [TG, "#6b7280"], [TD, "#111827"]].forEach(([T2, color]) => { if (!T2.faces.length) return;
    const pts2 = T2.loc.map(([a, b2, zz]) => { const w = W(a, b2); return [w[0], w[1], z + zz]; }), xs = pts2.map(q => q[0]), ys = pts2.map(q => q[1]), zs = pts2.map(q => q[2]);
    parts.push({ tris: { pts: pts2, faces: T2.faces }, poly: [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]], z0: Math.min(...zs), z1: Math.max(...zs), role: "body", transp: 0, color, unlit: true }); });
  return parts;
}
/* Slår ihop alla delar med samma färg (och ur-belysning-flagga) till en enda trianglelista (pts relativt o, ytor 1-baserade): tusentals prismor blir några få nät. */
function crewMergeGroups(parts, o) {
  const m = new Map();
  parts.forEach(pt => {
    const k = (pt.color || "#888888") + "|" + (pt.unlit ? 1 : 0), G = m.get(k) || m.set(k, { color: pt.color || "#888888", unlit: !!pt.unlit, pts: [], faces: [] }).get(k), base = G.pts.length;
    if (pt.tris) { pt.tris.pts.forEach(q => G.pts.push([q[0] - o[0], q[1] - o[1], q[2] - o[2]])); pt.tris.faces.forEach(f => G.faces.push([f[0] + base, f[1] + base, f[2] + base])); return; }
    const n = pt.poly.length; pt.poly.forEach(q => G.pts.push([q[0] - o[0], q[1] - o[1], pt.z0 - o[2]])); pt.poly.forEach(q => G.pts.push([q[0] - o[0], q[1] - o[1], pt.z1 - o[2]]));
    for (let k2 = 1; k2 + 1 < n; k2++) G.faces.push([base + 1, base + k2 + 2, base + k2 + 1], [base + n + 1, base + n + k2 + 1, base + n + k2 + 2]);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; G.faces.push([base + i + 1, base + j + 1, base + j + n + 1], [base + i + 1, base + j + n + 1, base + i + n + 1]); }
  });
  return [...m.values()];
}
function crewGroupGeometry(G) { // platt skuggning (ingen delning av hörn mellan ytor)
  const pos = new Float32Array(G.faces.length * 9); G.faces.forEach((f, i) => f.forEach((v, j) => { const P = G.pts[v - 1]; pos[i * 9 + j * 3] = P[0]; pos[i * 9 + j * 3 + 1] = P[1]; pos[i * 9 + j * 3 + 2] = P[2]; }));
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}
/* Panelen i 3D-editorn: entreprenör, antal (med knappar) och kommentar. onChange(p) ritar om. */
function crewActOptions(p, cur) {
  const esc = typeof escHtml === "function" ? escHtml : s => String(s), all = (typeof items !== "undefined" ? items : []).filter(r => r.activity || r.object_name || r.objectName), mine = all.filter(r => (r.contractor || "") === cur), list = (mine.length ? mine : all).slice(0, 400), seen = new Set();
  return list.filter(r => { const k = (r.activity || r.object_name || r.objectName) + "|" + (r.start_date || r.startDate || ""); if (seen.has(k) && r.id !== p.itemId) return false; seen.add(k); return true; }).map(r => `<option value="${esc(r.id)}"${r.id === p.itemId ? " selected" : ""}>${esc(r.activity || r.object_name || r.objectName)}${(r.start_date || r.startDate) ? ` (${r.start_date || r.startDate} – ${r.end_date || r.endDate || ""})` : ""}</option>`).join("");
}
function crewSideHtml(p) {
  const esc = typeof escHtml === "function" ? escHtml : s => String(s), lib = placeLib(p.type) || {}, cs = crewContractors(), cur = lib.contractor || "";
  const opts = [...new Set([cur, ...cs])].filter(x => x !== undefined).map(c => `<option value="${esc(c)}"${c === cur ? " selected" : ""}>${esc(c || "(ingen entreprenör)")}</option>`).join("");
  return `<div class="v3-sec">Bemanning</div>
    <label class="v3-field"><span>Entreprenör</span><select data-crew="contractor">${opts}</select></label>
    <div class="v3-crew-n"><span>Antal personer</span><button type="button" data-crew="dec" title="En person färre">−</button><input type="text" inputmode="numeric" data-crew="count" value="${crewCount(p)}" /><button type="button" data-crew="inc" title="En person till">＋</button><button type="button" data-crew="inc5" title="Fem till">＋5</button></div>
    <label class="v3-field"><span>Aktivitet (väljs ur schemat)</span><select data-crew="act"><option value="">– ingen vald –</option>${crewActOptions(p, cur)}</select></label>
    <label class="v3-field"><span>Egen text (visas som Aktivitet på skylten – tom = vald aktivitet)</span><textarea data-crew="comment" rows="2" maxlength="140" placeholder="T.ex. Armerar plattan, skift 1">${esc(p.comment || "")}</textarea></label>`;
}
function crewBindSide(side, p, redraw) {
  const apply = fn => { placeSnapshot(); fn(); crewSync(p); placeTouch(p); redraw(); const c = side.querySelector('[data-crew="count"]'); if (c) c.value = crewCount(p); };
  const q = k => side.querySelector(`[data-crew="${k}"]`);
  q("inc").onclick = () => apply(() => { p.count = Math.min(CREW_MAX, crewCount(p) + 1); }); q("inc5").onclick = () => apply(() => { p.count = Math.min(CREW_MAX, crewCount(p) + 5); }); q("dec").onclick = () => apply(() => { p.count = Math.max(1, crewCount(p) - 1); });
  q("count").onchange = e => apply(() => { p.count = Math.max(1, Math.min(CREW_MAX, parseInt(e.target.value, 10) || 1)); });
  q("act").onchange = e => apply(() => { const id = e.target.value; p.itemId = id || null; const r = id && typeof items !== "undefined" ? items.find(x => x.id === id) : null; if (r) { p.start = r.start_date || r.startDate || p.start || ""; p.end = r.end_date || r.endDate || p.end || ""; } });
  q("comment").onchange = e => apply(() => { p.comment = String(e.target.value || "").slice(0, 140); });
  q("contractor").onchange = e => apply(() => { const c = e.target.value; const was = crewColor((placeLib(p.type) || {}).contractor); p.type = crewType(c); if (!p.color || p.color === was) p.color = crewColor(c); if (/^Bemanning/.test(p.name || "")) p.name = placeNextName(crewLib(p.type).label); });
}
/* Rutnät som mesh-data för 3D-editorn och IFC: trianglar (1-baserade ytor) → geometri / IFC. */
function crewTrisGeometry(tr, sub) {
  const pos = new Float32Array(tr.faces.length * 9); tr.faces.forEach((f, i) => f.forEach((v, j) => { const P = tr.pts[v - 1]; pos[i * 9 + j * 3] = P[0] - sub[0]; pos[i * 9 + j * 3 + 1] = P[1] - sub[1]; pos[i * 9 + j * 3 + 2] = P[2] - sub[2]; }));
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}
