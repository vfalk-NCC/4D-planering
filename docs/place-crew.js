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
function crewSync(p) { const R = crewSlots(crewCount(p)).R; p.L = p.B = Math.round(R * 2 * 10) / 10; p.H = 1.8; }
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
  // skylt: stående kort (smCard i place-smart.js): färgat huvud "Entreprenör: X", "Antal YA" med stort tal, Område och Aktivitet (egen text eller vald aktivitet)
  smCard({ parts, W, add, z }, { title: `ENTREPRENÖR: ${String(lib.contractor || "Bemanning")}`, color: col, left: ["ANTAL YA", String(n)], rows: [["Område", crewArea(p)], ["Aktivitet", crewActivity(p)], ...(smDateText(p) ? [["Datum", smDateText(p)]] : [])], zb: 2.45, b0: -(R + 0.2) });
  return parts;
}
/* Slår ihop alla delar med samma färg (och ur-belysning-flagga) till en enda trianglelista (pts relativt o, ytor 1-baserade): tusentals prismor blir några få nät. */
function crewMergeGroups(parts, o) {
  const m = new Map();
  parts.forEach(pt => {
    const k = (pt.color || "#888888") + "|" + (pt.unlit ? 1 : 0) + "|" + (pt.transp || 0) + "|" + (pt.role === "reach" ? 1 : 0), G = m.get(k) || m.set(k, { color: pt.color || "#888888", unlit: !!pt.unlit, transp: pt.transp || 0, reach: pt.role === "reach", pts: [], faces: [] }).get(k), base = G.pts.length;
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
    ${typeof smDateFieldsHtml === "function" ? smDateFieldsHtml(p) : ""}
    <button type="button" class="v3-wide" data-crew="report" title="Alla bemanningar per område och entreprenör med summa YA, som tabell och CSV">Σ Sammanställ bemanning…</button>
    <label class="v3-field"><span>Område (välj eller skriv, t.ex. 741 - Sektionsfickor)</span><input type="text" class="v3-cb" data-crew="area" autocomplete="off" maxlength="60" value="${esc(p.area || "")}" placeholder="${esc(crewArea({ actArea: p.actArea, itemId: p.itemId }) || "741 - Sektionsfickor")}" /></label>
    <label class="v3-field"><span>Aktivitet i Gantten (sök, t.ex. Linje I - H gjutning)</span><input type="text" class="v3-cb" data-crew="act" autocomplete="off" value="${esc(p.actName || "")}" placeholder="Sök aktivitet …" />${p.actName ? `<button type="button" class="v3-cb-x" data-crew="actclear" title="Ta bort vald aktivitet">✕ ta bort</button>` : ""}</label>
    <label class="v3-field"><span>Egen text (visas som Aktivitet på skylten – tom = vald aktivitet)</span><textarea data-crew="comment" rows="2" maxlength="140" placeholder="T.ex. Armerar plattan, skift 1">${esc(p.comment || "")}</textarea></label>`;
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
