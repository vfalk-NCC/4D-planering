/* Dagsplanering i minimapen (Victor 2026-11-05: "ett planeringsläge i minimapen där man ritar på frihand – pennan följer och markerar i 3D-editorn i punktmolnet,
   så man också i 3D ser var dagens arbete ska ske. Flera markörer med text som visualiseras i 3D").
   • Minimapen → Verktyg → 📋 Dagsplan öppnar en verktygsrad: ✋ flytta, ✎ penna (frihand), ▭ område (frihand, sluts automatiskt), 📍 markör med text, ⌖ välj.
   • Allt ritas på minimapen och ligger samtidigt i 3D: linjer och områden som band som följer punktmolnet/marken, markörer som stolpar med skylt.
   • Kategorier med färg (arbetsområde, schakt/fyllning, lyft/kran, avspärrning, transport/leverans, upplag, gångväg, info), text, antal personer och dag.
   • Datumväljare: visa bara vald dag eller alla, "Kopiera från föregående dag", lista (⧉), kopiera som text till ett morgonmöte, spara minimapen som bild, ångra och radera.
   • Sparas i projektet (plan_dayplan.json) när lagring finns, annars i webbläsaren. Inget skrivs till Trimble Connect. */
const L3DAY_CATS = {
  arbete: ["Arbetsområde", "#2563eb"], schakt: ["Schakt / fyllning", "#d97706"], lyft: ["Lyft / kran", "#7c3aed"], spar: ["Avspärrning / farligt", "#dc2626"],
  transport: ["Transport / leverans", "#16a34a"], upplag: ["Upplag", "#ca8a04"], gang: ["Gångväg / ledning", "#0891b2"], info: ["Info", "#475569"]
};
const l3day = { items: [], loaded: false, plan: null, tool: null, cat: "arbete", day: "", show: "day", sel: null, cur: null, group: null, labels: new Map(), bar: null, rev: 0 };
const l3dayPath = () => `projects/${encodeURIComponent(projectId)}/plan_dayplan.json`;
const l3dayLsKey = () => `lagesplan-day-${projectId}`;
const l3dayToday = () => { const d = new Date(), p = x => String(x).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const l3dayAddDays = (s, n) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); const p = x => String(x).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const l3dayVisible = it => l3day.show === "all" || it.day === l3day.day;
const l3dayCol = it => it.col || it.ueCol || (L3DAY_CATS[it.cat] || L3DAY_CATS.info)[1];
const l3dayUes = () => (typeof ues === "function" ? ues() : []);
/* Aktiviteterna (Gantten i Trimble Connect = Powerproject-tidplanen, annars planens egna rader) som pågår vald dag. */
function l3dayActs() {
  const day = l3day.day || l3dayToday(); let acts = [];
  try { if (typeof l3plActs === "function" && typeof l3pl !== "undefined" && l3pl.rows && l3pl.rows.length) acts = l3plActs().map(a => ({ name: a.name, area: a.area, contractor: a.contractor, start: a.start, end: a.end, progress: a.progress })); } catch (e) { /* */ }
  if (!acts.length && typeof items !== "undefined") { const m = new Map(); items.forEach(r => { if (!r.start_date || !r.end_date) return; const nm = String(r.activity || r.object_name || "").trim(), k = nm + "|" + (r.contractor || ""); if (!nm || m.has(k)) return; m.set(k, { name: nm, area: r.area || "", contractor: r.contractor || "", start: r.start_date.slice(0, 10), end: r.end_date.slice(0, 10), progress: Number(r.progress) || 0 }); }); acts = [...m.values()]; }
  return acts.filter(a => a.start <= day && a.end >= day).sort((a, b) => (a.contractor || "").localeCompare(b.contractor || "", "sv") || a.name.localeCompare(b.name, "sv", { numeric: true }));
}
const l3dayList = () => l3day.items.filter(l3dayVisible);
function l3dayCss() {
  if (document.getElementById("l3dayCss")) return;
  const st = document.createElement("style"); st.id = "l3dayCss";
  st.textContent = `.v3-day{position:absolute;z-index:3;pointer-events:none;transform:translate(-50%,-110%);background:#fff;color:#0f172a;font:600 12px/1.25 system-ui,sans-serif;padding:3px 9px;border-radius:7px;border-left:5px solid var(--dc,#2563eb);box-shadow:0 2px 8px rgba(0,0,0,.28);white-space:nowrap}
.v3-day b{font-weight:800;margin-right:5px;color:var(--dc,#2563eb)}.v3-day.sel{outline:2px solid #f59e0b}.v3-day.dim{opacity:.6}
#v3Sp .spday{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center;padding:5px 8px;border-bottom:1px solid rgba(0,0,0,.08);background:rgba(37,99,235,.06)}
#v3Sp .spday input[type=text],#v3Sp .spday input[type=date],#v3Sp .spday input[type=number],#v3Sp .spday select{padding:3px 6px;border:1px solid rgba(0,0,0,.18);border-radius:7px;font:inherit;max-width:150px}
#v3Sp .spday input[type=number]{width:54px}#v3Sp .spday .sep{width:1px;align-self:stretch;background:rgba(0,0,0,.14);margin:0 2px}
#v3Sp .spday-list{position:absolute;left:8px;bottom:8px;z-index:6;max-height:calc(100% - 16px);overflow:auto;background:#fff;border:1px solid rgba(0,0,0,.18);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);padding:6px;min-width:230px;font-size:12px}
#v3Sp .spday-list{width:290px;max-width:calc(100% - 16px)}#v3Sp .spday-list .r.on{background:rgba(37,99,235,.14);font-weight:700}#v3Sp .dyed{border-top:1px solid rgba(0,0,0,.12);margin-top:6px;padding-top:6px;display:flex;flex-direction:column;gap:5px}#v3Sp .dyed label{display:flex;flex-direction:column;gap:2px;font-size:11px;color:#475569}#v3Sp .dyed input,#v3Sp .dyed select,#v3Sp .dyed textarea{padding:3px 6px;border:1px solid rgba(0,0,0,.18);border-radius:7px;font:inherit;font-size:12px;color:#0f172a;width:100%;box-sizing:border-box;max-width:none!important}#v3Sp .dyed .g2{display:grid;grid-template-columns:1fr 1fr;gap:6px}#v3Sp .dyed .hd2{display:flex;align-items:center;gap:6px;font-size:12px}#v3Sp .dyed input[type=color]{height:28px;padding:1px}#v3Sp .spday-list .r{display:flex;gap:6px;align-items:center;padding:3px 4px;border-radius:6px;cursor:pointer}#v3Sp .spday-list .r:hover{background:rgba(37,99,235,.08)}#v3Sp .spday-list .r i{width:10px;height:10px;border-radius:50%;flex:none}#v3Sp .spday-list .r span{flex:1}`;
  document.head.appendChild(st);
}

/* ---- Spara och läsa ---------------------------------------------------------------------------------- */
const l3dayRec = ({ ...x }) => x;
async function l3dayLoad() {
  const pid = plan && plan.id; if (l3day.plan !== pid) { l3day.plan = pid; l3day.items = []; l3day.loaded = false; }
  if (l3day.loaded) { l3dayBuild(); return; }
  l3day.loaded = true;
  let arr = [];
  try { if (typeof token !== "undefined" && token && typeof ghReadJSON === "function") arr = await ghReadJSON(token, l3dayPath()); else arr = JSON.parse(localStorage.getItem(l3dayLsKey()) || "[]"); } catch (e) { console.warn("Kunde inte läsa plan_dayplan.json", e); }
  l3day.items = (Array.isArray(arr) ? arr : []).filter(x => x && x.plan === pid && Array.isArray(x.pts) && x.pts.length);
  if (!l3day.day) l3day.day = l3dayToday();
  l3dayBuild(); l3dayBarSync();
}
let l3daySaveT = 0;
function l3daySave() {
  clearTimeout(l3daySaveT);
  l3daySaveT = setTimeout(() => {
    const pid = plan && plan.id, mine = l3day.items.map(l3dayRec);
    try { localStorage.setItem(l3dayLsKey(), JSON.stringify(mine)); } catch (e) { /* fullt */ }
    if (typeof token !== "undefined" && token && typeof ghWriteJSON === "function")
      ghWriteJSON(token, l3dayPath(), arr => [...(Array.isArray(arr) ? arr : []).filter(x => x.plan !== pid), ...mine], "3D: dagsplanering").catch(e => l3Status("Kunde inte spara dagsplaneringen: " + e.message, true));
  }, 600);
}
function l3dayChanged() { l3day.rev++; l3daySave(); l3dayBuild(); l3dayBarSync(); if (typeof l3sp !== "undefined") { l3sp.ovDirty = true; l3sp.key = ""; } }

/* ---- Geometri ----------------------------------------------------------------------------------------- */
const l3dayR2 = v => Math.round(v * 100) / 100;
function l3dayDP(P, tol) {   // Douglas–Peucker
  if (P.length < 3) return P.slice();
  const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1; const st = [[0, P.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let md = 0, mi = -1; const [ax, ay] = P[a], dx = P[b][0] - ax, dy = P[b][1] - ay, L = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((P[i][0] - ax) * dy - (P[i][1] - ay) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return P.filter((_, i) => keep[i]);
}
function l3dayChaikin(P, closed, n = 1) {
  let Q = P;
  for (let k = 0; k < n; k++) { const R = [], m = Q.length; if (m < 3) return Q; for (let i = 0; i < (closed ? m : m - 1); i++) { const a = Q[i], b = Q[(i + 1) % m]; R.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } Q = closed ? R : [P[0], ...R.slice(1, -1), P[P.length - 1]]; }
  return Q;
}
const l3dayPathLen = (P, closed) => { let L = 0; for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (closed && P.length > 2) L += Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]); return L; };
function l3dayArea(P) { let a = 0; for (let i = 0; i < P.length; i++) { const q = P[(i + 1) % P.length]; a += P[i][0] * q[1] - q[0] * P[i][1]; } return Math.abs(a) / 2; }
const l3dayAnchor = it => it.kind === "pin" ? it.pts[0] : it.kind === "area" ? [it.pts.reduce((s, p) => s + p[0], 0) / it.pts.length, it.pts.reduce((s, p) => s + p[1], 0) / it.pts.length] : it.pts[Math.floor(it.pts.length / 2)];
/* Markens höjd: det som syns i punktmolnet, annars ytorna/ritningens nivå. Tål att 3D-vyn ännu inte har någon yta. */
const l3dayZ = (x, y) => { try { return typeof l3spProfZ === "function" ? l3spProfZ(x, y) : 0; } catch (e) { return 0; } };
/* Linjen tätas så att bandet följer markens form (högst var 0,8 m, aldrig fler än 260 provpunkter). */
function l3dayDense(P, closed) {
  const L = l3dayPathLen(P, closed), step = Math.max(0.8, L / 260), out = [], m = closed ? P.length : P.length - 1;
  for (let i = 0; i < m; i++) { const a = P[i], b = P[(i + 1) % P.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); for (let k = 0; k < n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  if (!closed) out.push(P[P.length - 1]);
  return out;
}

/* ---- 3D ------------------------------------------------------------------------------------------------ */
function l3dayClear() { l3day.labels.forEach(e => e.remove()); l3day.labels.clear(); if (l3day.group) { l3Clear(l3day.group); } }
function l3dayLabelEl(it, nr, at) {
  const host = document.getElementById("v3Canvas"); if (!host) return;
  const el = document.createElement("div"); el.className = "v3-day" + (l3day.sel === it.id ? " sel" : ""); el.style.setProperty("--dc", l3dayCol(it));
  const extra = [it.act && it.text && it.text !== it.act ? it.act : "", it.crew ? `${it.crew} pers` : ""].filter(Boolean).join(" · ");
  el.innerHTML = `<b>${nr}</b>${it.ueShort ? `<span style="background:${escHtml(it.ueCol || "#2563eb")};color:#fff;border-radius:4px;padding:0 5px;margin-right:5px;font-size:11px">${escHtml(it.ueShort)}</span>` : ""}${escHtml(it.text || it.act || (L3DAY_CATS[it.cat] || ["Markör"])[0])}${extra ? ` <span style="font-weight:500;opacity:.75">· ${escHtml(extra)}</span>` : ""}${it.time ? ` <span style="font-weight:500;opacity:.75">· ${escHtml(it.time)}</span>` : ""}${it.info ? `<br><span style="font-weight:500;font-size:11px;opacity:.85;white-space:normal;display:inline-block;max-width:260px">${escHtml(String(it.info).slice(0, 90))}${String(it.info).length > 90 ? "…" : ""}</span>` : ""}`;
  if (it.info) el.title = it.info;
  host.appendChild(el); el._at = at; el._id = it.id; l3day.labels.set(it.id, el);
}
function l3dayBuild() {
  if (typeof l3 === "undefined" || !l3 || !l3.scene) return;
  if (!l3day.group) { const g = new THREE.Group(); g.name = "dayplan"; l3day.group = g; l3.scene.add(g); l3.groups.day = g; }
  l3dayClear();
  const O = l3.O, grp = l3day.group, on = l3Prefs().dayShow3d !== false; grp.visible = on;
  if (!on) { l3Render(); return; }
  l3dayList().forEach((it, idx) => {
    const col = new THREE.Color(l3dayCol(it)), sel = l3day.sel === it.id, nr = l3day.items.indexOf(it) + 1;
    const mat = new THREE.MeshBasicMaterial({ color: sel ? 0xf59e0b : col, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.92 });
    if (it.kind === "pin") {
      const [x, y] = it.pts[0], z = l3dayZ(x, y) - O[2], H = 6;
      const pole = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x - O[0], y - O[1], z), new THREE.Vector3(x - O[0], y - O[1], z + H)]), new THREE.LineBasicMaterial({ color: sel ? 0xf59e0b : col, depthTest: false })); pole.renderOrder = 12; pole.userData.noHit = true; pole.raycast = () => {}; grp.add(pole);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.8, 28), mat); ring.position.set(x - O[0], y - O[1], z + 0.1); ring.renderOrder = 12; ring.userData.noHit = true; ring.raycast = () => {}; grp.add(ring);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 14), mat); cone.rotation.x = Math.PI / 2; cone.position.set(x - O[0], y - O[1], z + 0.4); cone.renderOrder = 12; cone.userData.noHit = true; cone.raycast = () => {}; grp.add(cone);
      l3dayLabelEl(it, nr, new THREE.Vector3(x - O[0], y - O[1], z + H));
      return;
    }
    const closed = it.kind === "area", P = l3dayDense(it.pts, closed), N = P.length; if (N < 2) return;
    const ext = Math.max(...[0, 1].map(k => Math.max(...it.pts.map(p => p[k])) - Math.min(...it.pts.map(p => p[k])))), w = Math.min(1.6, Math.max(0.35, ext / 110)) / 2;
    const Z = P.map(p => l3dayZ(p[0], p[1]) - O[2] + 0.12), pos = [], idx2 = [];
    for (let i = 0; i < N; i++) {
      const a = P[Math.max(0, i - (closed ? 1 : 1))], b = P[Math.min(N - 1, i + 1)], pa = closed ? P[(i + N - 1) % N] : a, pb = closed ? P[(i + 1) % N] : b;
      let dx = pb[0] - pa[0], dy = pb[1] - pa[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
      pos.push(P[i][0] - O[0] - dy * w, P[i][1] - O[1] + dx * w, Z[i], P[i][0] - O[0] + dy * w, P[i][1] - O[1] - dx * w, Z[i]);
    }
    for (let i = 0; i < (closed ? N : N - 1); i++) { const a = i * 2, b = ((i + 1) % N) * 2; idx2.push(a, a + 1, b, a + 1, b + 1, b); }
    const gm = new THREE.BufferGeometry(); gm.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); gm.setIndex(idx2);
    const rib = new THREE.Mesh(gm, mat); rib.renderOrder = 12; rib.userData.noHit = true; rib.raycast = () => {}; grp.add(rib);
    if (closed && it.pts.length >= 3) {   // genomskinlig yta: trianglar med marknivå i varje hörn
      const tri = THREE.ShapeUtils.triangulateShape(it.pts.map(p => new THREE.Vector2(p[0], p[1])), []), fp = [];
      it.pts.forEach(p => fp.push(p[0] - O[0], p[1] - O[1], l3dayZ(p[0], p[1]) - O[2] + 0.1));
      const fg = new THREE.BufferGeometry(); fg.setAttribute("position", new THREE.Float32BufferAttribute(fp, 3)); fg.setIndex(tri.flat());
      const fill = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: sel ? 0xf59e0b : col, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.2, depthWrite: false })); fill.renderOrder = 11; fill.userData.noHit = true; fill.raycast = () => {}; grp.add(fill);
    }
    const [ax, ay] = l3dayAnchor(it); l3dayLabelEl(it, nr, new THREE.Vector3(ax - O[0], ay - O[1], l3dayZ(ax, ay) - O[2] + 1.2));
  });
  l3dayPlace(); l3Render();
}
function l3dayPlace() {
  if (typeof l3 === "undefined" || !l3 || !l3day.labels.size) return;
  l3day.labels.forEach(el => { const q = l3ToScreen(el._at); el.style.display = q.behind ? "none" : "block"; el.style.left = q.x + "px"; el.style.top = q.y + "px"; });
}

/* ---- 2D på minimapen ------------------------------------------------------------------------------------ */
function l3dayDraw2D(g) {
  const list = l3dayList(); if (!list.length && !l3day.cur && !l3day.poly) return;
  const draw = (it, cur) => {
    const col = cur ? "#f59e0b" : l3day.sel === it.id ? "#f59e0b" : l3dayCol(it), S = it.pts.map(p => l3spToScr(p[0], p[1]));
    g.save(); g.lineCap = "round"; g.lineJoin = "round";
    if (it.kind === "pin") { const [x, y] = S[0]; g.fillStyle = col; g.strokeStyle = "#fff"; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 9, 0, 6.2832); g.fill(); g.stroke(); }
    else if (S.length > 1) {
      g.beginPath(); S.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); if (it.kind === "area") g.closePath();
      if (it.kind === "area") { g.fillStyle = col + "38"; g.fill(); }
      g.strokeStyle = "#fff"; g.lineWidth = 6; g.stroke(); g.strokeStyle = col; g.lineWidth = 3.2; if (it.cat === "spar") g.setLineDash([9, 6]); g.stroke(); g.setLineDash([]);
    }
    if (!cur) {
      const nr = l3day.items.indexOf(it) + 1, [ax, ay] = l3spToScr(...l3dayAnchor(it)), txt = `${nr}${it.text ? "  " + it.text : ""}`;
      g.font = "600 12px system-ui,sans-serif"; const w = g.measureText(txt).width + 12, ty = it.kind === "pin" ? ay - 24 : ay - 4;
      g.fillStyle = "#fff"; g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.roundRect ? g.roundRect(ax - w / 2, ty - 10, w, 20, 6) : g.rect(ax - w / 2, ty - 10, w, 20); g.fill(); g.stroke();
      g.fillStyle = "#0f172a"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(txt, ax, ty);
    }
    g.restore();
  };
  list.forEach(it => draw(it, false));
  if (l3day.cur && l3day.cur.pts.length) draw({ kind: l3day.cur.kind, pts: l3day.cur.pts, cat: l3day.cat }, true);
  if (l3day.poly && l3day.poly.pts.length) { const P = l3day.poly, pts = P.hover ? [...P.pts, P.hover] : P.pts; draw({ kind: P.kind === "polyarea" && pts.length >= 3 ? "area" : "pen", pts, cat: l3day.cat }, true); P.pts.forEach(q => { const [x, y] = l3spToScr(q[0], q[1]); g.fillStyle = "#f59e0b"; g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 4, 0, 6.2832); g.fill(); g.stroke(); }); }
}

/* ---- Pekare på minimapen (frihand m.m.) ------------------------------------------------------------------ */
const l3dayTolM = () => { const a = l3spFromScr(0, 0), b = l3spFromScr(1, 0); return Math.hypot(a[0] - b[0], a[1] - b[1]); };   // meter per skärmpixel
function l3dayHit(sx, sy) {
  const px = l3dayTolM(), tol = 10 * px, [x, y] = l3spFromScr(sx, sy); let best = null, bd = Infinity;
  l3dayList().forEach(it => {
    let d = Infinity;
    if (it.kind === "pin") d = Math.hypot(it.pts[0][0] - x, it.pts[0][1] - y);
    else { const m = it.kind === "area" ? it.pts.length : it.pts.length - 1; for (let i = 0; i < m; i++) { const a = it.pts[i], b = it.pts[(i + 1) % it.pts.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)); d = Math.min(d, Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y)); }
      if (it.kind === "area") { let inside = false; for (let i = 0, j = it.pts.length - 1; i < it.pts.length; j = i++) { const A = it.pts[i], B = it.pts[j]; if ((A[1] > y) !== (B[1] > y) && x < (B[0] - A[0]) * (y - A[1]) / (B[1] - A[1]) + A[0]) inside = !inside; } if (inside) d = Math.min(d, tol * 0.9); } }
    if (d < tol && d < bd) { bd = d; best = it; }
  });
  return best;
}
/* Rektangel (dragen är hörn mot hörn på skärmen) och polylinje/polygon (klick för klick; Skift = rak 5°-linje). */
function l3dayRectPts(a, b) { return [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]].map(q => l3spFromScr(q[0], q[1]).map(l3dayR2)); }
function l3dayPolyPt(e, w) { const P = l3day.poly, last = P && P.pts[P.pts.length - 1]; return (e.shiftKey && last ? l3spProfSnap(last, w, true) : w).map(l3dayR2); }
function l3dayPolyFinish(cancel) {
  const P = l3day.poly; l3day.poly = null; l3sp.ovDirty = true; l3sp.key = ""; if (!P || cancel) { l3dayBarSync(); return false; }
  const need = P.kind === "polyarea" ? 3 : 2; if (P.pts.length < need) { l3dayBarSync(); return false; }
  l3dayAdd({ kind: P.kind === "polyarea" ? "area" : "pen", pts: P.pts, straight: true }); return true;
}
function l3dayPtr(e, phase) {
  const t = l3day.tool; if (!t || !l3day.bar || e.button > 0 || e.shiftKey) return false;
  if (e.buttons & 6) return false;   // höger- eller mellanknapp (mushjulet) nedtryckt: minimapens vanliga panorering, verktyget behålls
  if ((t === "poly" || t === "polyarea") && l3day.poly && phase === "move") { const r0 = l3spBox(l3sp.cv), pp = l3dayPolyPt(e, l3spFromScr(e.clientX - r0.left, e.clientY - r0.top)); l3day.poly.hover = pp; l3sp.ovDirty = true; l3sp.key = ""; }   // gummibandet följer musen
  if (phase !== "down" && !l3day.down) return false;   // ingen pågående ritning: rörelser och släpp går till minimapen
  const cv = l3sp.cv, r = l3spBox(cv), sx = e.clientX - r.left, sy = e.clientY - r.top;
  if (phase === "down") { try { cv.setPointerCapture(e.pointerId); } catch (err) { /* */ } l3day.down = { sx, sy, t: performance.now() };
    if (t === "sel") { const it = l3dayHit(sx, sy); if (it) { l3day.sel = it.id; l3day.mv = { id: it.id, w0: l3spFromScr(sx, sy), pts0: it.pts.map(q => q.slice()), moved: false }; l3dayBarSync(); l3sp.ovDirty = true; l3sp.key = ""; } }
    if (t === "rect") l3day.cur = { kind: "area", rect: true, a: [sx, sy], pts: [], last: [sx, sy] };
    if (t === "pen" || t === "area") l3day.cur = { kind: t, pts: [l3spFromScr(sx, sy).map(l3dayR2)], last: [sx, sy] };
    return true; }
  if (phase === "move") { if (!l3day.down) return true;
    if (l3day.cur && l3day.cur.rect) { const c = l3day.cur; c.pts = l3dayRectPts(c.a, [sx, sy]); c.last = [sx, sy]; l3sp.ovDirty = true; l3sp.key = ""; return true; }
    const mv = l3day.mv; if (mv && Math.hypot(sx - l3day.down.sx, sy - l3day.down.sy) > 4) { const it = l3day.items.find(x => x.id === mv.id), w = l3spFromScr(sx, sy); if (it) { const dx = w[0] - mv.w0[0], dy = w[1] - mv.w0[1]; it.pts = mv.pts0.map(q => [l3dayR2(q[0] + dx), l3dayR2(q[1] + dy)]); mv.moved = true; l3sp.ovDirty = true; l3sp.key = ""; } return true; } const c = l3day.cur; if (c && Math.hypot(sx - c.last[0], sy - c.last[1]) > 3) { c.pts.push(l3spFromScr(sx, sy).map(l3dayR2)); c.last = [sx, sy]; l3sp.ovDirty = true; l3sp.key = ""; } return true; }
  if (phase === "up") {
    const d = l3day.down; l3day.down = null; if (!d) return true;
    if (t === "sel" && l3day.mv) { const mv = l3day.mv; l3day.mv = null; const it = l3day.items.find(x => x.id === mv.id);
      if (it && mv.moved) { const was = mv.pts0, now = it.pts.map(q => q.slice()), hadOrig = it.orig; if (!it.orig) it.orig = was.map(q => q.slice());
        if (typeof l3VPush === "function") l3VPush(() => { it.pts = was.map(q => q.slice()); if (!hadOrig) delete it.orig; l3dayChanged(); }, () => { it.pts = now.map(q => q.slice()); if (!it.orig) it.orig = was.map(q => q.slice()); l3dayChanged(); }, "flytta dagsplanering");
        l3dayChanged(); l3Status("Flyttad – ↺ Läge lägger tillbaka den där den ritades."); return true; }
      l3dayBuild(); l3dayBarSync(); return true; }
    if (t === "sel") { const it = l3dayHit(sx, sy); l3day.sel = it ? it.id : null; l3dayBuild(); l3dayBarSync(); l3sp.ovDirty = true; l3sp.key = ""; return true; }
    if (t === "pin") { l3dayAdd({ kind: "pin", pts: [l3spFromScr(sx, sy).map(l3dayR2)] }); return true; }
    if (t === "rect") { const c = l3day.cur; l3day.cur = null; l3sp.ovDirty = true; l3sp.key = ""; if (c && c.a && Math.hypot(sx - c.a[0], sy - c.a[1]) > 6 && Math.abs(sx - c.a[0]) > 3 && Math.abs(sy - c.a[1]) > 3) l3dayAdd({ kind: "area", pts: l3dayRectPts(c.a, [sx, sy]) }); return true; }
    if (t === "poly" || t === "polyarea") { if (Math.hypot(sx - d.sx, sy - d.sy) > 5) return true;   // drag räknas inte som klick
      const pp = l3dayPolyPt(e, l3spFromScr(sx, sy)), P = l3day.poly || (l3day.poly = { kind: t, pts: [], hover: null }), last = P.pts[P.pts.length - 1];
      if (!last || Math.hypot(pp[0] - last[0], pp[1] - last[1]) > 3 * l3dayTolM()) P.pts.push(pp); l3sp.ovDirty = true; l3sp.key = ""; l3dayBarSync(); return true; }
    const c = l3day.cur; l3day.cur = null;
    if (c) { const tol = Math.max(0.15, l3dayTolM() * 1.6); let P = l3dayDP(c.pts, tol); const closed = c.kind === "area";
      if (P.length < 2 || l3dayPathLen(P, false) < 3 * l3dayTolM()) { l3sp.ovDirty = true; l3sp.key = ""; return true; }   // bara ett tryck
      if (closed && P.length < 3) { l3sp.ovDirty = true; l3sp.key = ""; return true; }
      P = l3dayChaikin(P, closed, 1).map(p => [l3dayR2(p[0]), l3dayR2(p[1])]);
      l3dayAdd({ kind: c.kind, pts: P }); }
    return true;
  }
  return false;
}
function l3dayAdd(o) {
  const text = (l3day.bar && l3day.bar.querySelector("#dyText").value.trim()) || "", crew = Number(l3day.bar && l3day.bar.querySelector("#dyCrew").value) || 0;
  const it = { id: ghNewId(), plan: plan && plan.id, kind: o.kind, cat: l3day.cat, text, crew: crew || undefined, day: l3day.day || l3dayToday(), pts: o.pts };
  if (o.straight) it.straight = true; if (l3day.color) it.col = l3day.color;   // egen färg (väljs i färgrutan) går före entreprenörens och kategorins
  const ue = l3dayUes().find(u => u.id === l3day.ue), a = l3day.act;
  if (ue) { it.ue = ue.id; it.ueShort = ueShort(ue); it.ueName = ue.name || ""; it.ueCol = ueColor(ue); }
  if (a) { it.act = a.name; it.actStart = a.start; it.actEnd = a.end; it.area = a.area || ""; if (!it.text) it.text = a.name; }
  const had = l3day.items.slice();
  l3day.items.push(it); l3day.sel = it.id;
  if (typeof l3VPush === "function") l3VPush(() => { l3day.items = had.slice(); l3dayChanged(); }, () => { l3day.items = [...had, it]; l3dayChanged(); }, "dagsplanering");
  l3dayChanged();
  if (l3day.bar) { l3day.bar.querySelector("#dyText").value = ""; l3day.bar.querySelector("#dyCrew").value = ""; l3day.act = null; const sa = l3day.bar.querySelector("#dyAct"); if (sa) sa.value = ""; }
}
function l3dayRemove(id) {
  const it = l3day.items.find(x => x.id === id); if (!it) return; const had = l3day.items.slice();
  l3day.items = l3day.items.filter(x => x.id !== id); if (l3day.sel === id) l3day.sel = null;
  if (typeof l3VPush === "function") l3VPush(() => { l3day.items = had.slice(); l3dayChanged(); }, () => { l3day.items = had.filter(x => x.id !== id); l3dayChanged(); }, "ta bort dagsplanering");
  l3dayChanged();
}
function l3dayEdit(id) {
  const it = l3day.items.find(x => x.id === id); if (!it) return;
  const t = prompt("Text på markeringen:", it.text || ""); if (t == null) return; const before = it.text || "";
  const set = v => { it.text = v; l3dayChanged(); };
  if (typeof l3VPush === "function") l3VPush(() => set(before), () => set(t.trim()), "ändra text");
  set(t.trim());
}
/* Kopiera från föregående dag med anteckningar: markeringarna från dagen före den valda får den valda dagen. */
function l3dayCopyPrev() {
  const from = l3dayAddDays(l3day.day, -1), src = l3day.items.filter(x => x.day === from);
  if (!src.length) { const last = [...new Set(l3day.items.map(x => x.day))].filter(d => d < l3day.day).sort().pop(); if (!last) { l3Status("Det finns ingen tidigare dag att kopiera från.", true); return 0; } return l3dayCopyFrom(last); }
  return l3dayCopyFrom(from);
}
function l3dayCopyFrom(from) {
  const src = l3day.items.filter(x => x.day === from), had = l3day.items.slice();
  const add = src.map(x => ({ ...x, id: ghNewId(), day: l3day.day, pts: x.pts.map(p => p.slice()) }));
  l3day.items = [...had, ...add];
  if (typeof l3VPush === "function") l3VPush(() => { l3day.items = had.slice(); l3dayChanged(); }, () => { l3day.items = [...had, ...add]; l3dayChanged(); }, "kopiera dagsplanering");
  l3dayChanged(); l3Status(`${add.length} markeringar kopierade från ${from} till ${l3day.day}.`); return add.length;
}
function l3dayClearDay() {
  const del = l3dayList(); if (!del.length) return; if (!confirm(`Ta bort ${del.length} markeringar för ${l3day.show === "all" ? "alla dagar" : l3day.day}?`)) return;
  const had = l3day.items.slice(), keep = had.filter(x => !del.includes(x)); l3day.items = keep; l3day.sel = null;
  if (typeof l3VPush === "function") l3VPush(() => { l3day.items = had.slice(); l3dayChanged(); }, () => { l3day.items = keep.slice(); l3dayChanged(); }, "rensa dagsplanering");
  l3dayChanged();
}
/* Text till morgonmötet: en rad per markering med kategori, text, antal personer och mått. */
function l3dayText() {
  const L = l3dayList(); if (!L.length) return "";
  const head = `Dagsplanering ${l3day.show === "all" ? "(alla dagar)" : l3day.day}${plan ? " – " + plan.name : ""}`;
  return [head, ...L.map((it, i) => {
    const cat = (L3DAY_CATS[it.cat] || ["Info"])[0], m = it.kind === "area" ? `${Math.round(l3dayArea(it.pts))} m²` : it.kind === "pen" ? `${Math.round(l3dayPathLen(it.pts, false))} m` : "";
    return `${l3day.items.indexOf(it) + 1}. ${it.ueShort ? "[" + it.ueShort + "] " : ""}${cat}${it.text ? ": " + it.text : ""}${it.crew ? ` (${it.crew} pers)` : ""}${it.time ? ` ${it.time}` : ""}${m ? ` – ${m}` : ""}${it.info ? ` – ${String(it.info).replace(/\s+/g, " ")}` : ""}${l3day.show === "all" ? ` [${it.day}]` : ""}`;
  }), `Totalt ${L.reduce((s, it) => s + (it.crew || 0), 0)} personer angivna.`].join("\n");
}
async function l3dayCopyText() {
  const t = l3dayText(); if (!t) { l3Status("Inget att kopiera – rita först.", true); return; }
  try { await navigator.clipboard.writeText(t); l3Status("Dagsplaneringen är kopierad som text."); } catch (e) { prompt("Kopiera texten:", t); }
}
/* Minimapen med markeringarna som bild (png). */
function l3daySaveImg() {
  const bc = l3sp.bc, cv = l3sp.cv; if (!bc || !cv) return;
  const o = document.createElement("canvas"); o.width = cv.width; o.height = cv.height; const g = o.getContext("2d"); g.drawImage(bc, 0, 0); g.drawImage(cv, 0, 0);
  g.setTransform(1, 0, 0, 1, 0, 0); g.font = `700 ${Math.round(o.width / 42)}px system-ui,sans-serif`; g.fillStyle = "rgba(255,255,255,.88)"; const tx = `Dagsplan ${l3day.show === "all" ? "" : l3day.day} ${plan ? plan.name : ""}`.trim(); const w = g.measureText(tx).width + 24; g.fillRect(10, 10, w, o.width / 42 + 18); g.fillStyle = "#0f172a"; g.textBaseline = "top"; g.fillText(tx, 22, 18);
  o.toBlob(b => { const u = URL.createObjectURL(b), a = document.createElement("a"); a.href = u; a.download = `Dagsplan ${l3day.day}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); l3Status("Minimapen sparad som bild."); }, "image/png");
}


/* ---- Dagens skyltar som IFC (Victor 2026-11-05: "exportera skyltarna via minimapen dagligen till en IFC som går till TC") ---------------------------------------- */
const L3DAY_IFC = { T: 0.08, tT: 0.03, pad: 0.25, h1: 0.62, h2: 0.46, pole: 6 };
function l3dayIfcBuild(list) {
  if (!list.length) return null;
  const day = l3day.day || l3dayToday(), doc = ifcDoc("4D-planering – Dagsplan " + day, `Dagsplanering ${day}${plan ? " – " + plan.name : ""}`), E = doc.E, O = l3.O;
  const d = l3.orbit.target.clone().sub(l3.camera.position); d.z = 0; if (d.lengthSq() < 1e-9) d.set(0, 1, 0); d.normalize();
  const r = [d.y, -d.x], n = [-d.x, -d.y], dir = v => E(`IFCDIRECTION(${ifcPt(v)})`);
  const white = doc.style("dag-skylt", "#ffffff", "Dagsplan skylt"), stC = new Map(), stOf = (c, a = 0) => { const k = c + a; if (!stC.has(k)) stC.set(k, doc.style("dag-" + c.slice(1) + (a ? "-t" : ""), c, "Dagsplan", a)); return stC.get(k); };
  const W1 = (t, h) => ifcTextStrokes(t).width * h / 6, elems = [], axes = (p, rx, ry, nx, ny) => E(`IFCLOCALPLACEMENT(${doc.sitePl},${E(`IFCAXIS2PLACEMENT3D(${E(`IFCCARTESIANPOINT(${ifcPt(p)})`)},${dir([nx, ny, 0])},${dir([rx, ry, 0])})`)})`);
  const tri = (g, st) => { if (!g.pts.length) return null; const pl = E(`IFCCARTESIANPOINTLIST3D((${g.pts.map(v => ifcPt([v.x, v.y, v.z])).join(",")}))`), fs = E(`IFCTRIANGULATEDFACESET(${pl},$,.T.,(${g.tris.map(t => `(${t.join(",")})`).join(",")}),$)`); E(`IFCSTYLEDITEM(${fs},(${st}),$)`); return fs; };
  const V3 = p => new THREE.Vector3(p[0], p[1], p[2]);
  list.forEach(it => {
    const nr = l3day.items.indexOf(it) + 1, col = l3dayCol(it), st = stOf(col), closed = it.kind === "area", catName = (L3DAY_CATS[it.cat] || ["Info"])[0];
    const base = it.pts.map(p => [p[0], p[1], l3dayZ(p[0], p[1])]), o = base[0], rel = p => [p[0] - o[0], p[1] - o[1], p[2] - o[2]], meshItems = [], swept = [];
    const ext = Math.max(1, ...[0, 1].map(k => Math.max(...it.pts.map(p => p[k])) - Math.min(...it.pts.map(p => p[k])))), rad = Math.min(0.3, Math.max(0.08, ext / 300));
    let at;   // skyltens punkt (på marken)
    if (it.kind === "pin") { const p0 = V3([0, 0, 0]), p1 = V3([0, 0, L3DAY_IFC.pole]); const t = tri(l3mSweep([p0, p1], 0.07, 6), st); if (t) meshItems.push(t); const c = tri(l3mCone({ x: 0, y: 0, z: 0 }, 0.7, 0.3), st); if (c) meshItems.push(c); at = base[0]; }
    else {
      const dense0 = l3dayDense(it.pts, closed), kk = Math.max(1, Math.ceil(dense0.length / 110)), dense = dense0.filter((_, i) => i % kk === 0 || i === dense0.length - 1).map(p => { const z = l3dayZ(p[0], p[1]) + 0.15; return rel([p[0], p[1], z]); }), path = dense.map(V3); if (closed) path.push(path[0].clone());
      const t = tri(l3mSweep(path, rad, 6), st); if (t) meshItems.push(t);
      if (closed && it.pts.length >= 3) { const zAvg = dense.reduce((sum, q) => sum + q[2], 0) / dense.length, poly = E(`IFCPOLYLINE((${[...it.pts, it.pts[0]].map(p => E(`IFCCARTESIANPOINT(${ifcPt([p[0] - o[0], p[1] - o[1]])})`)).join(",")}))`);
        const fill = E(`IFCEXTRUDEDAREASOLID(${E(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${poly})`)},${E(`IFCAXIS2PLACEMENT3D(${E(`IFCCARTESIANPOINT(${ifcPt([0, 0, zAvg])})`)},$,$)`)},${dir([0, 0, 1])},0.05)`); E(`IFCSTYLEDITEM(${fill},(${stOf(col, 0.55)}),$)`); swept.push(fill); }
      const [ax, ay] = l3dayAnchor(it); at = [ax, ay, l3dayZ(ax, ay)];
    }
    // skylten: UE, aktivitet, text, personer, tid, mått
    const meas = it.kind === "area" ? `${Math.round(l3dayArea(it.pts))} m²` : it.kind === "pen" ? `${Math.round(l3dayPathLen(it.pts, false))} m` : "";
    const lines = [{ t: `${nr}. ${it.ueShort ? it.ueShort + (it.ueName ? " – " + it.ueName : "") : catName}`.slice(0, 60), h: L3DAY_IFC.h1, c: true },
      ...(it.act ? [{ t: String(it.act).slice(0, 60), h: L3DAY_IFC.h2 }] : []), ...(it.text && it.text !== it.act ? [{ t: String(it.text).slice(0, 60), h: L3DAY_IFC.h2 }] : []),
      ...(it.info ? String(it.info).replace(/\s+/g, " ").match(/.{1,44}(\s|$)/g).slice(0, 4).map(t => ({ t: t.trim(), h: L3DAY_IFC.h2 * 0.8 })) : []),
      { t: [it.ueShort ? catName : "", it.crew ? `${it.crew} pers` : "", it.time || "", meas, it.actStart ? `${it.actStart.slice(5)} → ${it.actEnd.slice(5)}` : ""].filter(Boolean).join(" · ") || day, h: L3DAY_IFC.h2 * 0.85 }].filter(l => l.t);
    const W = Math.max(2, ...lines.map(l => W1(l.t, l.h))) + L3DAY_IFC.pad * 2, H = lines.reduce((a, l) => a + l.h * 1.4, 0) + L3DAY_IFC.pad * 1.4, up = it.kind === "pin" ? L3DAY_IFC.pole + 0.4 : 3 + H / 2;
    const center = [at[0], at[1], at[2] + up + (it.kind === "pin" ? H / 2 : 0)];
    if (it.kind !== "pin") { const lead = l3mSweep([V3(rel(at)), V3(rel([at[0], at[1], center[2] - H / 2]))], 0.04), lt = tri(lead, white); if (lt) meshItems.push(lt); }
    const reps = []; if (swept.length) reps.push(E(`IFCSHAPEREPRESENTATION(${doc.body},'Body','SweptSolid',(${swept.join(",")}))`)); if (meshItems.length) reps.push(E(`IFCSHAPEREPRESENTATION(${doc.body},'Body','Tessellation',(${meshItems.join(",")}))`));
    const nm = `Dagsplan ${nr}: ${it.ueShort ? it.ueShort + " " : ""}${it.text || it.act || catName}`.slice(0, 120);
    const el = doc.proxy(nm, catName, "4D-dagsplan", doc.place(o), E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${reps.join(",")}))`), it.id); elems.push(el);
    doc.props(el, [["Typ", it.kind === "pin" ? "Markör" : it.kind === "area" ? "Område" : "Linje"], ["Kategori", catName], ["Dag", it.day || day], ["Text", it.text || ""], ["Entreprenör", it.ueName || it.ueShort || ""], ["Aktivitet (Gantt)", it.act || ""],
      ["Aktivitet start", it.actStart || ""], ["Aktivitet slut", it.actEnd || ""], ["Område", it.area || ""], ["Personer", it.crew || 0], ["Tid", it.time || ""], ["Info", it.info || ""], ["Mått", meas], ["Nummer", nr], ["Arbetsyta", plan ? plan.name || "" : ""]]);
    const board = E(`IFCEXTRUDEDAREASOLID(${E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${ifcNum(W)},${ifcNum(H)})`)},${E(`IFCAXIS2PLACEMENT3D(${E(`IFCCARTESIANPOINT(${ifcPt([0, 0, -L3DAY_IFC.T / 2])})`)},$,$)`)},${dir([0, 0, 1])},${ifcNum(L3DAY_IFC.T)})`); E(`IFCSTYLEDITEM(${board},(${white}),$)`);
    elems.push(doc.proxy(`${nm.slice(0, 100)} – skylt`, "Skylt", "4D-dagsplanskylt", axes(center, r[0], r[1], n[0], n[1]), doc.shape(board, "SweptSolid"), it.id));
    [[1, 1], [-1, -1]].forEach(([sr, sn]) => { const meshes = []; let y = H / 2 - L3DAY_IFC.pad * 0.7;
      lines.forEach(({ t, h, c }) => { const msh = ifcTextSolid(doc, t, { h, t: L3DAY_IFC.tT, rx: 1, ry: 0, start: -W / 2 + L3DAY_IFC.pad, across: y - h / 2, style: c ? st : doc.textStyle }); if (msh) meshes.push(msh); y -= h * 1.4; });
      if (!meshes.length) return; const p = [center[0] + sn * n[0] * L3DAY_IFC.T / 2, center[1] + sn * n[1] * L3DAY_IFC.T / 2, center[2]];
      elems.push(doc.proxy(`${nm.slice(0, 100)} – text`, "Text", "4D-dagsplantext", axes(p, sr * r[0], sr * r[1], sn * n[0], sn * n[1]), doc.shape(meshes.join(","), "Tessellation"), it.id)); });
  });
  const fileName = `Dagsplan ${day} ${plan ? plan.name : ""}.ifc`.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
  const fn = typeof tcUniqueName === "function" ? tcUniqueName(fileName) : fileName;
  return { text: doc.finish(elems, fn), fileName: fn, n: list.length };
}
async function l3dayExportIfc() {
  const list = l3dayList(); if (!list.length) { l3Status("Det finns inga skyltar att exportera för " + (l3day.show === "all" ? "projektet" : l3day.day) + " – rita eller placera först.", true); return null; }
  const r = l3dayIfcBuild(list), file = new File([new TextEncoder().encode(r.text)], r.fileName, { type: "application/x-step" }), key = "dayifc";
  busyProgress(key, `Sparar ${r.fileName}`, 0.3);
  try {
    if (!window.opener || window.opener.closed) { const u = URL.createObjectURL(file), a = document.createElement("a"); a.href = u; a.download = r.fileName; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); busyProgress(key, "", null); l3Toast(`${r.n} skyltar hämtade som IFC (${r.fileName}). Öppna lägesplanen från Trimble Connect för att spara direkt dit.`, null, null, 9000); return r; }
    const up = await askOpener("tcUpload", { folder: "Lägesplan", files: [file] }, 10 * 60 * 1000); busyProgress(key, "", null);
    l3Toast(`${r.n} skyltar sparade som 3D-objekt i Trimble Connect: ${r.fileName}${up && up.folder ? ` (${up.folder})` : ""}.`, null, null, 9000); return r;
  } catch (e) { busyProgress(key, "", null); throw e; }
}

/* ---- Verktygsraden ----------------------------------------------------------------------------------------- */
function l3dayBarHtml() {
  const tb = (k, ico, tip) => `<button type="button" data-dytool="${k}" title="${tip}">${ico}</button>`;
  return `${tb("", "✋", "Flytta och zooma minimapen")}${tb("pen", "✎", "Penna – rita på frihand, linjen följer marken i 3D")}${tb("area", "▭", "Område – rita runt det på frihand, ytan sluts automatiskt")}${tb("rect", "⬜", "Rektangel – dra från hörn till hörn")}${tb("poly", "⟋", "Polylinje – klicka punkt för punkt, dubbelklicka eller Enter avslutar (Skift = rak 5°-linje, Backspace tar bort sista punkten)")}${tb("polyarea", "⬠", "Polygon – klicka hörnen, dubbelklicka eller Enter sluter ytan")}${tb("pin", "📍", "Markör med text – tryck på kartan")}${tb("sel", "⌖", "Välj – tryck på en markering (Delete tar bort, dubbelklick på skylten ändrar texten)")}
<span class="sep"></span><select id="dyCat" title="Kategori (färg)">${Object.entries(L3DAY_CATS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("")}</select>
<select id="dyUe" title="Entreprenör (de du skapat under Dag → Underentreprenörer) – skylten får deras färg och namn"><option value="">Entreprenör…</option></select><select id="dyAct" title="Aktivitet ur Gantten (tidplanen i Trimble Connect) som pågår vald dag – fyller i text och entreprenör"><option value="">Aktivitet (Gantt)…</option></select>
<input type="color" id="dyColor" value="#2563eb" title="Egen färg: gäller nästa markering, eller den valda markeringen i läget ⌖ Välj" style="width:34px;height:28px;padding:1px;border-radius:7px"><button type="button" id="dyColorAuto" title="Tillbaka till entreprenörens/kategorins färg">Auto</button>
<input type="text" id="dyText" placeholder="Text, t.ex. Gjuter platta B" title="Text som följer med nästa markering"><input type="number" id="dyCrew" min="0" step="1" placeholder="pers" title="Antal personer (valfritt)">
<span class="sep"></span><button type="button" id="dyPrev" title="Dagen före">‹</button><input type="date" id="dyDay" title="Dagen som planeras"><button type="button" id="dyNext" title="Dagen efter">›</button>
<select id="dyShow" title="Vad som visas"><option value="day">Vald dag</option><option value="all">Alla dagar</option></select>
<button type="button" id="dyCopyPrev" title="Kopiera föregående dags markeringar till den här dagen">⧉ Från igår</button>
<span class="sep"></span><button type="button" id="dyList" title="Lista över markeringarna">☰ Lista</button><button type="button" id="dyTxt" title="Kopiera som text (morgonmötet)">📋 Text</button><button type="button" id="dyImg" title="Spara minimapen som bild">🖼 Bild</button><button type="button" id="dyIfc" title="Dagens skyltar som IFC (3D-skyltar med info) – hämtas, och sparas i Trimble Connect när lägesplanen är öppnad därifrån">🧊 IFC → TC</button>
<button type="button" id="dyReset" title="Flytta tillbaka den valda markeringen dit den ritades (Välj → dra för att flytta)">↺ Läge</button><button type="button" id="dyUndo" title="Ångra (Ctrl+Z)">↶</button><button type="button" id="dyClr" title="Ta bort dagens markeringar">🗑 Rensa</button>
<label title="Visa dagsplaneringen i 3D-vyn" style="display:inline-flex;gap:4px;align-items:center"><input type="checkbox" id="dy3d"> 3D</label>`;
}
function l3dayBarSync() {
  const b = l3day.bar; if (!b) return;
  b.querySelectorAll("[data-dytool]").forEach(x => x.classList.toggle("on", (x.dataset.dytool || null) === (l3day.tool || null) || (!x.dataset.dytool && !l3day.tool)));
  { const su = b.querySelector("#dyUe"), sa = b.querySelector("#dyAct"), U = l3dayUes(), A = l3dayActs();
    const uk = U.map(u => u.id + "|" + ueShort(u)).join(","); if (su.dataset.k !== uk) { su.dataset.k = uk; su.innerHTML = `<option value="">Entreprenör…</option>` + U.map(u => `<option value="${escHtml(u.id)}">${escHtml(ueShort(u))} – ${escHtml(u.name || "")}</option>`).join(""); }
    su.value = l3day.ue || "";
    const ak = (l3day.day || "") + "|" + A.map(a => a.name + a.start).join(",") + "|" + (l3pl && l3pl.rows ? l3pl.rows.length : 0); if (sa.dataset.k !== ak) { sa.dataset.k = ak; l3day.actList = A; sa.innerHTML = `<option value="">Aktivitet (Gantt)…</option>` + A.map((a, i) => `<option value="${i}">${escHtml((a.contractor ? a.contractor + " – " : "") + a.name)} (${escHtml(a.start.slice(5))} → ${escHtml(a.end.slice(5))})</option>`).join(""); }
    if (!A.length && typeof l3plLoad === "function" && typeof l3pl !== "undefined" && !l3pl.rows && !l3pl.loading) Promise.resolve(l3plLoad()).then(() => l3dayBarSync()).catch(() => {}); }
  { const sel = l3day.items.find(x => x.id === l3day.sel), c = b.querySelector("#dyColor"), au = b.querySelector("#dyColorAuto"); const shown = l3day.tool === "sel" && sel ? l3dayCol(sel) : (l3day.color || (l3day.ue && (l3dayUes().find(u => u.id === l3day.ue) || {}).color) || (L3DAY_CATS[l3day.cat] || L3DAY_CATS.info)[1]); if (c && /^#[0-9a-f]{6}$/i.test(shown)) c.value = shown.toLowerCase(); if (au) au.disabled = l3day.tool === "sel" && sel ? !sel.col : !l3day.color; }
  b.querySelector("#dyCat").value = l3day.cat; b.querySelector("#dyDay").value = l3day.day; b.querySelector("#dyShow").value = l3day.show; b.querySelector("#dy3d").checked = l3Prefs().dayShow3d !== false;
  { const sel = l3day.items.find(x => x.id === l3day.sel), r = b.querySelector("#dyReset"); if (r) r.disabled = !(sel && sel.orig); }
  const cnt = l3dayList().length; b.querySelector("#dyClr").title = `Ta bort ${cnt} markeringar`;
  const lst = document.getElementById("spDayList"); if (lst) l3dayListFill(lst);
  const cv = l3sp.cv; if (cv) cv.style.cursor = l3day.tool === "sel" ? "pointer" : l3day.tool ? "crosshair" : "";
}
/* Ändra uppgifter på en markering (med ångra). patch: { fält: värde | undefined (tas bort) }. */
function l3dayPatch(id, patch) {
  const it = l3day.items.find(x => x.id === id); if (!it) return;
  const was = JSON.parse(JSON.stringify(it)), put = src => { Object.keys(it).forEach(k => delete it[k]); Object.assign(it, JSON.parse(JSON.stringify(src))); l3dayChanged(); };
  Object.keys(patch).forEach(k => { if (patch[k] === undefined || patch[k] === "") delete it[k]; else it[k] = patch[k]; });
  const now = JSON.parse(JSON.stringify(it));
  if (JSON.stringify(was) === JSON.stringify(now)) return;
  if (typeof l3VPush === "function") l3VPush(() => put(was), () => put(now), "ändra dagsplanering");
  l3dayChanged();
}
/* Listan: tryck på en rad för att markera den – då visas en ruta där all info kan skrivas in och ändras (text, info, personer, tid, kategori, entreprenör, dag, färg). */
function l3dayListFill(box) {
  const ae = document.activeElement; if (ae && box.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.closest(".dyed")) return;   // skriver just nu: rita inte om
  const L = l3dayList(), sel = L.find(x => x.id === l3day.sel) || null, nr = it => l3day.items.indexOf(it) + 1;
  const rows = L.length ? L.map(it => `<div class="r${sel === it ? " on" : ""}" data-dyid="${it.id}"><i style="background:${l3dayCol(it)}"></i><span>${nr(it)}. ${it.ueShort ? `<b>${escHtml(it.ueShort)}</b> ` : ""}${escHtml(it.text || (L3DAY_CATS[it.cat] || ["Info"])[0])}${it.crew ? ` · ${it.crew} pers` : ""}</span><button type="button" data-dydel="${it.id}" title="Ta bort">✕</button></div>`).join("") : `<div class="r">Inga markeringar för ${l3day.show === "all" ? "projektet" : l3day.day}.</div>`;
  let ed = "";
  if (sel) {
    const U = l3dayUes(), eff = l3dayCol(sel), hex = /^#[0-9a-f]{6}$/i.test(eff) ? eff : "#2563eb", kind = sel.kind === "pin" ? "Markör" : sel.kind === "area" ? "Område" : "Linje", meas = sel.kind === "area" ? ` · ${Math.round(l3dayArea(sel.pts))} m²` : sel.kind === "pen" ? ` · ${Math.round(l3dayPathLen(sel.pts, false))} m` : "";
    ed = `<div class="dyed"><div class="hd2"><b>${nr(sel)}. ${kind}${meas}</b><span style="flex:1"></span><button type="button" data-dyzoom title="Flyg dit i 3D">⌖ Visa</button></div>
      <label>Text<input type="text" data-f="text" value="${escHtml(sel.text || "")}" placeholder="t.ex. Gjuter platta B"></label>
      <label>Info<textarea data-f="info" rows="3" placeholder="Fri info: material, risker, kontakt, ordning …">${escHtml(sel.info || "")}</textarea></label>
      <div class="g2"><label>Personer<input type="number" min="0" step="1" data-f="crew" value="${sel.crew || ""}"></label><label>Tid<input type="text" data-f="time" value="${escHtml(sel.time || "")}" placeholder="07:00–16:00"></label></div>
      <div class="g2"><label>Kategori<select data-f="cat">${Object.entries(L3DAY_CATS).map(([k, v]) => `<option value="${k}"${sel.cat === k ? " selected" : ""}>${v[0]}</option>`).join("")}</select></label><label>Dag<input type="date" data-f="day" value="${escHtml(sel.day || "")}"></label></div>
      <label>Entreprenör<select data-f="ue"><option value="">(ingen)</option>${U.map(u => `<option value="${escHtml(u.id)}"${sel.ue === u.id ? " selected" : ""}>${escHtml(ueShort(u))} – ${escHtml(u.name || "")}</option>`).join("")}</select></label>
      <div class="g2"><label>Färg<input type="color" data-f="col" value="${hex}"></label><label>&nbsp;<button type="button" data-dyauto${sel.col ? "" : " disabled"}>Auto</button></label></div></div>`;
  }
  box.innerHTML = rows + ed;
  box.querySelectorAll("[data-dydel]").forEach(b => { b.onclick = e => { e.stopPropagation(); l3dayRemove(b.dataset.dydel); }; });
  box.querySelectorAll("[data-dyid]").forEach(r => { r.onclick = () => { const it = l3day.items.find(x => x.id === r.dataset.dyid); if (!it) return; l3day.sel = it.id; l3dayBuild(); l3dayBarSync(); l3sp.ovDirty = true; l3sp.key = ""; }; r.ondblclick = () => { const it = l3day.items.find(x => x.id === r.dataset.dyid); if (it && typeof l3spGoTo === "function") { const [x, y] = l3dayAnchor(it); l3spGoTo(x, y); } }; });
  if (!sel) return;
  const z = box.querySelector("[data-dyzoom]"); if (z) z.onclick = () => { const [x, y] = l3dayAnchor(sel); if (typeof l3spGoTo === "function") l3spGoTo(x, y); };
  const au = box.querySelector("[data-dyauto]"); if (au) au.onclick = () => l3dayPatch(sel.id, { col: undefined });
  box.querySelectorAll("[data-f]").forEach(f => { f.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter" && f.tagName !== "TEXTAREA") f.blur(); }); f.onchange = () => {
    const k = f.dataset.f, v = f.value;
    if (k === "crew") l3dayPatch(sel.id, { crew: Number(v) > 0 ? Number(v) : undefined });
    else if (k === "ue") { const u = l3dayUes().find(q => q.id === v); l3dayPatch(sel.id, u ? { ue: u.id, ueShort: ueShort(u), ueName: u.name || "", ueCol: ueColor(u) } : { ue: undefined, ueShort: undefined, ueName: undefined, ueCol: undefined }); }
    else if (k === "day") { if (v) l3dayPatch(sel.id, { day: v }); }
    else l3dayPatch(sel.id, { [k]: String(v).trim() === "" ? undefined : v });
  }; });
}
function l3dayOpenBar() {
  const el = l3sp.el; if (!el || l3day.bar) return;
  l3dayCss(); if (!l3day.day) l3day.day = l3dayToday();
  const bar = document.createElement("div"); bar.className = "spday"; bar.id = "spDay"; bar.innerHTML = l3dayBarHtml();
  const cw = el.querySelector(".cw"); cw.parentNode.insertBefore(bar, cw); l3day.bar = bar;
  bar.addEventListener("keydown", e => e.stopPropagation());
  bar.querySelectorAll("[data-dytool]").forEach(b => { b.onclick = () => { l3day.tool = b.dataset.dytool || null; l3day.cur = null; if (l3day.poly) l3dayPolyFinish(true); l3dayBarSync(); }; });
  bar.querySelector("#dyColor").oninput = e => { const it = l3day.items.find(x => x.id === l3day.sel); if (l3day.tool === "sel" && it) { it.col = e.target.value; l3dayChanged(); } else { l3day.color = e.target.value; l3dayBarSync(); } };
  bar.querySelector("#dyColorAuto").onclick = () => { const it = l3day.items.find(x => x.id === l3day.sel); if (l3day.tool === "sel" && it) { delete it.col; l3dayChanged(); } else { l3day.color = null; l3dayBarSync(); } };
  bar.querySelector("#dyUe").onchange = e => { l3day.ue = e.target.value || null; const it = l3day.items.find(x => x.id === l3day.sel); if (l3day.tool === "sel" && it) { const u = l3dayUes().find(q => q.id === l3day.ue); if (u) { it.ue = u.id; it.ueShort = ueShort(u); it.ueName = u.name || ""; it.ueCol = ueColor(u); } else { delete it.ue; delete it.ueShort; delete it.ueName; delete it.ueCol; } l3dayChanged(); } };
  bar.querySelector("#dyAct").onchange = e => { const a = (l3day.actList || [])[Number(e.target.value)]; l3day.act = e.target.value === "" ? null : a || null; if (!a) return; bar.querySelector("#dyText").value = a.name;
    const u = typeof ueForContractor === "function" ? ueForContractor(a.contractor) : null; if (u) { l3day.ue = u.id; bar.querySelector("#dyUe").value = u.id; } };
  bar.querySelector("#dyIfc").onclick = async () => { const b = bar.querySelector("#dyIfc"); b.disabled = true; try { await l3dayExportIfc(); } catch (err) { l3Status("Kunde inte exportera dagsplaneringen: " + err.message, true); } b.disabled = false; };
  bar.querySelector("#dyCat").onchange = e => { l3day.cat = e.target.value; const it = l3day.items.find(x => x.id === l3day.sel); if (l3day.tool === "sel" && it) { it.cat = l3day.cat; l3dayChanged(); } };
  const setDay = d => { if (!d) return; l3day.day = d; l3dayBuild(); l3dayBarSync(); l3sp.ovDirty = true; l3sp.key = ""; };
  bar.querySelector("#dyDay").onchange = e => setDay(e.target.value); bar.querySelector("#dyPrev").onclick = () => setDay(l3dayAddDays(l3day.day, -1)); bar.querySelector("#dyNext").onclick = () => setDay(l3dayAddDays(l3day.day, 1));
  bar.querySelector("#dyShow").onchange = e => { l3day.show = e.target.value; l3dayBuild(); l3dayBarSync(); l3sp.ovDirty = true; l3sp.key = ""; };
  bar.querySelector("#dyCopyPrev").onclick = () => l3dayCopyPrev();
  bar.querySelector("#dyList").onclick = () => { let b = document.getElementById("spDayList"); if (b) { b.remove(); return; } b = document.createElement("div"); b.className = "spday-list"; b.id = "spDayList"; el.querySelector(".cw").appendChild(b); l3dayListFill(b); };
  bar.querySelector("#dyTxt").onclick = () => l3dayCopyText(); bar.querySelector("#dyImg").onclick = () => l3daySaveImg();
  bar.querySelector("#dyUndo").onclick = () => { if (typeof l3Undo === "function") l3Undo(); };
  bar.querySelector("#dyReset").onclick = () => { const it = l3day.items.find(x => x.id === l3day.sel); if (!it || !it.orig) return; const now = it.pts.map(q => q.slice()), orig = it.orig.map(q => q.slice());
    if (typeof l3VPush === "function") l3VPush(() => { it.pts = now.map(q => q.slice()); it.orig = orig.map(q => q.slice()); l3dayChanged(); }, () => { it.pts = orig.map(q => q.slice()); delete it.orig; l3dayChanged(); }, "återställ läge");
    it.pts = orig; delete it.orig; l3dayChanged(); l3Status("Markeringen är tillbaka där den ritades."); };
  bar.querySelector("#dyClr").onclick = () => l3dayClearDay();
  bar.querySelector("#dy3d").onchange = e => { l3SetPref("dayShow3d", e.target.checked); l3dayBuild(); };
  if (!l3sp.cv.__dayDbl) { l3sp.cv.__dayDbl = true; l3sp.cv.addEventListener("dblclick", e => { if (l3day.poly && (l3day.tool === "poly" || l3day.tool === "polyarea")) { e.preventDefault(); e.stopPropagation(); l3dayPolyFinish(false); } }, true); }
  if (!l3sp.cv.__dayMd) { l3sp.cv.__dayMd = true; l3sp.cv.addEventListener("mousedown", e => { if (e.button === 1) e.preventDefault(); }); l3sp.cv.addEventListener("auxclick", e => { if (e.button === 1) e.preventDefault(); }); }   // mushjulet: panorera utan webbläsarens autoscroll
  l3dayLoad().catch(e => console.warn(e)); l3dayBarSync();
}
/* Tangenter (anropas av l3Key i 3D-vyn): Delete tar bort vald markering, Esc går tillbaka till flytta/zooma. */
function l3dayKey(e) {
  if (!l3day.bar) return false;
  if (l3day.poly) {
    if (e.key === "Enter") { e.preventDefault(); l3dayPolyFinish(false); return true; }
    if (e.key === "Escape") { e.preventDefault(); l3dayPolyFinish(true); return true; }
    if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); l3day.poly.pts.pop(); if (!l3day.poly.pts.length) l3day.poly = null; l3sp.ovDirty = true; l3sp.key = ""; return true; }
  }
  if ((e.key === "Delete" || e.key === "Backspace") && l3day.sel && l3day.tool === "sel") { e.preventDefault(); l3dayRemove(l3day.sel); return true; }
  if (e.key === "Escape" && l3day.tool) { l3day.tool = null; l3day.cur = null; l3dayBarSync(); return true; }
  return false;
}
function l3dayCloseBar() {
  if (l3day.bar) { l3day.bar.remove(); l3day.bar = null; } const lst = document.getElementById("spDayList"); if (lst) lst.remove();
  l3day.tool = null; l3day.cur = null; l3day.down = null; l3day.poly = null;
  if (l3sp.cv) l3sp.cv.style.cursor = "";
}
function l3dayToggleBar() { if (l3day.bar) l3dayCloseBar(); else l3dayOpenBar(); const b = document.getElementById("spDayBtn"); if (b) b.classList.toggle("on", !!l3day.bar); }
/* Minimapen skapas om vid varje öppning: lägg till knappen i Verktyg-menyn och städa raden när den stängs. */
if (typeof l3spOpen === "function") {
  const open0 = l3spOpen;
  l3spOpen = async function () {
    await open0.apply(this, arguments);
    const el = l3sp.el; if (!el) return; const m = el.querySelector('[data-dd="t"]'), menu = m && m.parentElement.querySelector(".m");
    if (menu && !menu.querySelector("#spDayBtn")) { const row = document.createElement("div"); row.className = "mr"; row.innerHTML = `<button type="button" id="spDayBtn" title="Planera dagens arbete: rita på frihand i minimapen – det syns direkt i 3D">📋 Dagsplan</button>`; menu.appendChild(row); row.querySelector("button").onclick = () => l3dayToggleBar(); }
    l3day.bar = null; if (l3Prefs().dayBar) l3dayToggleBar();
    l3dayLoad().catch(e => console.warn(e));
  };
  const close0 = l3spClose;
  l3spClose = function () { l3dayCloseBar(); return close0.apply(this, arguments); };
}
