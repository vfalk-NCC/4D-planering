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
const l3dayCol = it => (L3DAY_CATS[it.cat] || L3DAY_CATS.info)[1];
const l3dayList = () => l3day.items.filter(l3dayVisible);
function l3dayCss() {
  if (document.getElementById("l3dayCss")) return;
  const st = document.createElement("style"); st.id = "l3dayCss";
  st.textContent = `.v3-day{position:absolute;z-index:3;pointer-events:none;transform:translate(-50%,-110%);background:#fff;color:#0f172a;font:600 12px/1.25 system-ui,sans-serif;padding:3px 9px;border-radius:7px;border-left:5px solid var(--dc,#2563eb);box-shadow:0 2px 8px rgba(0,0,0,.28);white-space:nowrap}
.v3-day b{font-weight:800;margin-right:5px;color:var(--dc,#2563eb)}.v3-day.sel{outline:2px solid #f59e0b}.v3-day.dim{opacity:.6}
#v3Sp .spday{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center;padding:5px 8px;border-bottom:1px solid rgba(0,0,0,.08);background:rgba(37,99,235,.06)}
#v3Sp .spday input[type=text],#v3Sp .spday input[type=date],#v3Sp .spday input[type=number],#v3Sp .spday select{padding:3px 6px;border:1px solid rgba(0,0,0,.18);border-radius:7px;font:inherit;max-width:150px}
#v3Sp .spday input[type=number]{width:54px}#v3Sp .spday .sep{width:1px;align-self:stretch;background:rgba(0,0,0,.14);margin:0 2px}
#v3Sp .spday-list{position:absolute;left:8px;bottom:8px;z-index:6;max-height:60%;overflow:auto;background:#fff;border:1px solid rgba(0,0,0,.18);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.25);padding:6px;min-width:230px;font-size:12px}
#v3Sp .spday-list .r{display:flex;gap:6px;align-items:center;padding:3px 4px;border-radius:6px;cursor:pointer}#v3Sp .spday-list .r:hover{background:rgba(37,99,235,.08)}#v3Sp .spday-list .r i{width:10px;height:10px;border-radius:50%;flex:none}#v3Sp .spday-list .r span{flex:1}`;
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
  const extra = [it.crew ? `${it.crew} pers` : "", it.kind !== "pin" && it.text ? "" : ""].filter(Boolean).join(" · ");
  el.innerHTML = `<b>${nr}</b>${escHtml(it.text || (L3DAY_CATS[it.cat] || ["Markör"])[0])}${extra ? ` <span style="font-weight:500;opacity:.75">· ${escHtml(extra)}</span>` : ""}`;
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
  const list = l3dayList(); if (!list.length && !l3day.cur) return;
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
  if (l3day.cur) draw({ kind: l3day.cur.kind, pts: l3day.cur.pts, cat: l3day.cat }, true);
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
function l3dayPtr(e, phase) {
  const t = l3day.tool; if (!t || !l3day.bar || e.button > 0 || e.shiftKey) return false;
  const cv = l3sp.cv, r = l3spBox(cv), sx = e.clientX - r.left, sy = e.clientY - r.top;
  if (phase === "down") { try { cv.setPointerCapture(e.pointerId); } catch (err) { /* */ } l3day.down = { sx, sy, t: performance.now() };
    if (t === "sel") { const it = l3dayHit(sx, sy); if (it) { l3day.sel = it.id; l3day.mv = { id: it.id, w0: l3spFromScr(sx, sy), pts0: it.pts.map(q => q.slice()), moved: false }; l3dayBarSync(); l3sp.ovDirty = true; l3sp.key = ""; } }
    if (t === "pen" || t === "area") l3day.cur = { kind: t, pts: [l3spFromScr(sx, sy).map(l3dayR2)], last: [sx, sy] };
    return true; }
  if (phase === "move") { if (!l3day.down) return true;
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
  const had = l3day.items.slice();
  l3day.items.push(it); l3day.sel = it.id;
  if (typeof l3VPush === "function") l3VPush(() => { l3day.items = had.slice(); l3dayChanged(); }, () => { l3day.items = [...had, it]; l3dayChanged(); }, "dagsplanering");
  l3dayChanged();
  if (l3day.bar) { l3day.bar.querySelector("#dyText").value = ""; l3day.bar.querySelector("#dyCrew").value = ""; }
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
    return `${l3day.items.indexOf(it) + 1}. ${cat}${it.text ? ": " + it.text : ""}${it.crew ? ` (${it.crew} pers)` : ""}${m ? ` – ${m}` : ""}${l3day.show === "all" ? ` [${it.day}]` : ""}`;
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

/* ---- Verktygsraden ----------------------------------------------------------------------------------------- */
function l3dayBarHtml() {
  const tb = (k, ico, tip) => `<button type="button" data-dytool="${k}" title="${tip}">${ico}</button>`;
  return `${tb("", "✋", "Flytta och zooma minimapen")}${tb("pen", "✎", "Penna – rita på frihand, linjen följer marken i 3D")}${tb("area", "▭", "Område – rita runt det på frihand, ytan sluts automatiskt")}${tb("pin", "📍", "Markör med text – tryck på kartan")}${tb("sel", "⌖", "Välj – tryck på en markering (Delete tar bort, dubbelklick på skylten ändrar texten)")}
<span class="sep"></span><select id="dyCat" title="Kategori (färg)">${Object.entries(L3DAY_CATS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("")}</select>
<input type="text" id="dyText" placeholder="Text, t.ex. Gjuter platta B" title="Text som följer med nästa markering"><input type="number" id="dyCrew" min="0" step="1" placeholder="pers" title="Antal personer (valfritt)">
<span class="sep"></span><button type="button" id="dyPrev" title="Dagen före">‹</button><input type="date" id="dyDay" title="Dagen som planeras"><button type="button" id="dyNext" title="Dagen efter">›</button>
<select id="dyShow" title="Vad som visas"><option value="day">Vald dag</option><option value="all">Alla dagar</option></select>
<button type="button" id="dyCopyPrev" title="Kopiera föregående dags markeringar till den här dagen">⧉ Från igår</button>
<span class="sep"></span><button type="button" id="dyList" title="Lista över markeringarna">☰ Lista</button><button type="button" id="dyTxt" title="Kopiera som text (morgonmötet)">📋 Text</button><button type="button" id="dyImg" title="Spara minimapen som bild">🖼 Bild</button>
<button type="button" id="dyReset" title="Flytta tillbaka den valda markeringen dit den ritades (Välj → dra för att flytta)">↺ Läge</button><button type="button" id="dyUndo" title="Ångra (Ctrl+Z)">↶</button><button type="button" id="dyClr" title="Ta bort dagens markeringar">🗑 Rensa</button>
<label title="Visa dagsplaneringen i 3D-vyn" style="display:inline-flex;gap:4px;align-items:center"><input type="checkbox" id="dy3d"> 3D</label>`;
}
function l3dayBarSync() {
  const b = l3day.bar; if (!b) return;
  b.querySelectorAll("[data-dytool]").forEach(x => x.classList.toggle("on", (x.dataset.dytool || null) === (l3day.tool || null) || (!x.dataset.dytool && !l3day.tool)));
  b.querySelector("#dyCat").value = l3day.cat; b.querySelector("#dyDay").value = l3day.day; b.querySelector("#dyShow").value = l3day.show; b.querySelector("#dy3d").checked = l3Prefs().dayShow3d !== false;
  { const sel = l3day.items.find(x => x.id === l3day.sel), r = b.querySelector("#dyReset"); if (r) r.disabled = !(sel && sel.orig); }
  const cnt = l3dayList().length; b.querySelector("#dyClr").title = `Ta bort ${cnt} markeringar`;
  const lst = document.getElementById("spDayList"); if (lst) l3dayListFill(lst);
  const cv = l3sp.cv; if (cv) cv.style.cursor = l3day.tool === "sel" ? "pointer" : l3day.tool ? "crosshair" : "";
}
function l3dayListFill(box) {
  const L = l3dayList();
  box.innerHTML = L.length ? L.map(it => `<div class="r" data-dyid="${it.id}"><i style="background:${l3dayCol(it)}"></i><span>${l3day.items.indexOf(it) + 1}. ${escHtml(it.text || (L3DAY_CATS[it.cat] || ["Info"])[0])}${it.crew ? ` · ${it.crew} pers` : ""}</span><button type="button" data-dydel="${it.id}" title="Ta bort">✕</button></div>`).join("") : `<div class="r">Inga markeringar för ${l3day.show === "all" ? "projektet" : l3day.day}.</div>`;
  box.querySelectorAll("[data-dydel]").forEach(b => { b.onclick = e => { e.stopPropagation(); l3dayRemove(b.dataset.dydel); }; });
  box.querySelectorAll("[data-dyid]").forEach(r => { r.onclick = () => { const it = l3day.items.find(x => x.id === r.dataset.dyid); if (!it) return; l3day.sel = it.id; const [x, y] = l3dayAnchor(it); if (typeof l3spGoTo === "function") l3spGoTo(x, y); l3dayBuild(); l3dayBarSync(); }; r.ondblclick = () => l3dayEdit(r.dataset.dyid); });
}
function l3dayOpenBar() {
  const el = l3sp.el; if (!el || l3day.bar) return;
  l3dayCss(); if (!l3day.day) l3day.day = l3dayToday();
  const bar = document.createElement("div"); bar.className = "spday"; bar.id = "spDay"; bar.innerHTML = l3dayBarHtml();
  const cw = el.querySelector(".cw"); cw.parentNode.insertBefore(bar, cw); l3day.bar = bar;
  bar.addEventListener("keydown", e => e.stopPropagation());
  bar.querySelectorAll("[data-dytool]").forEach(b => { b.onclick = () => { l3day.tool = b.dataset.dytool || null; l3day.cur = null; l3dayBarSync(); }; });
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
  l3dayLoad().catch(e => console.warn(e)); l3dayBarSync();
}
/* Tangenter (anropas av l3Key i 3D-vyn): Delete tar bort vald markering, Esc går tillbaka till flytta/zooma. */
function l3dayKey(e) {
  if (!l3day.bar) return false;
  if ((e.key === "Delete" || e.key === "Backspace") && l3day.sel && l3day.tool === "sel") { e.preventDefault(); l3dayRemove(l3day.sel); return true; }
  if (e.key === "Escape" && l3day.tool) { l3day.tool = null; l3day.cur = null; l3dayBarSync(); return true; }
  return false;
}
function l3dayCloseBar() {
  if (l3day.bar) { l3day.bar.remove(); l3day.bar = null; } const lst = document.getElementById("spDayList"); if (lst) lst.remove();
  l3day.tool = null; l3day.cur = null; l3day.down = null;
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
