/* 3D-vyn – mått som ligger kvar och kan sparas (Victor 2026-10-10: "Måtten ska också ligga kvar och man
   ska ha möjlighet att spara dom"; "när man håller inne shift med mätverktyget ska den hoppa 5 grader åt
   gången så att man kan mäta i raka linjer").

   – Varje färdigt mått (avstånd, vinkel, yta) ligger kvar i vyn med sin etikett, även efter att man
     bytt verktyg. Listan Mått (i fästraden när Mät är valt, och under Lager) tar bort, döljer och sparar.
   – Spara i projektet: projects/<id>/plan_measures.json (egen fil, sammanslagen per mått-id), så att
     måtten finns kvar nästa gång och för andra i projektet. Osparade mått finns kvar tills sidan stängs.
   – Skift med mätverktyget: riktningen från förra punkten hoppar 5° åt gången (vågrätt), höjden följer
     fästpunkten. */

const l3m = { list: [], loaded: false, hidden: false, labels: new Map(), sel: new Set(), anchor: null };
/* Etiketten i 3D: bara måttet, eller "12,95 m – Mått mellan fundament" när kommentaren ska visas (Victor 2026-10-10). */
const l3mLabel = m => (m.showNote && m.note ? `${m.text} – ${m.note}` : m.text);
const l3mPath = () => `projects/${encodeURIComponent(projectId)}/plan_measures.json`;

/* Skift: riktningen från base låst till var 5:e grad (anropas av l3Target). */
function l3mShiftSnap(base, s) {
  if (!s) return s;
  const dx = s.point.x - base.x, dy = s.point.y - base.y, h = Math.hypot(dx, dy);
  if (h < 1e-6) return s;
  const step = Math.PI / 36, a = Math.round(Math.atan2(dy, dx) / step) * step;
  const p = new THREE.Vector3(base.x + h * Math.cos(a), base.y + h * Math.sin(a), s.point.z);
  return { point: p, kind: "deg5", deg: ((Math.round(a * 180 / Math.PI) % 360) + 360) % 360 };
}

async function l3mLoad() {
  if (l3m.plan !== (plan && plan.id)) { l3m.plan = plan && plan.id; l3m.list = []; l3m.loaded = false; }
  if (l3m.loaded) { l3mDraw(); return; }
  l3m.loaded = true;
  try {
    const arr = await ghReadJSON(token, l3mPath());
    (Array.isArray(arr) ? arr : []).filter(x => x && x.plan === (plan && plan.id)).forEach(x => { if (!l3m.list.some(y => y.id === x.id)) l3m.list.push({ ...x, saved: true }); });
  } catch (e) { console.warn("Kunde inte läsa plan_measures.json", e); }
  l3mDraw();
}
/* Färdigt mått från mätverktyget: pts i scenens koordinater. */
function l3mAdd(kind, pts, text, objs) {
  const m = { id: ghNewId(), plan: plan && plan.id, kind, text, objs: (objs || []).map(o => o || null), folder: (typeof l3a !== "undefined" && l3a.cur) || null, pts: pts.map(p => [p.x + l3.O[0], p.y + l3.O[1], p.z + l3.O[2]].map(v => Math.round(v * 1000) / 1000)), at: new Date().toISOString(), by: (settings && settings.userName) || null, saved: false };
  l3m.list.push(m);
  // Nya mått syns alltid – även om de andra är dolda (Victor 2026-10-10).
  l3mDraw();
  l3mRenderBar();
  return m;
}
/* Måttlinjen kan dras ut från fästpunkterna (Victor 2026-10-10: "dra måttet uppåt eller nedåt i samma
   vinkel som måttet är taget. Då ska fästpunkterna sitta kvar men den längsgående måttkedjan ska föras
   uppåt inklusive mått-texten"). m.off = avstånd (meter) längs riktningen nedan: vinkelrätt mot måttet och
   så nära uppåt som möjligt; för ett lodrätt mått vågrätt. Måttlinjen förblir parallell med måttet. */
function l3mOffDir(a, b) {
  const u = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  const n = new THREE.Vector3(0, 0, 1).addScaledVector(u, -u.z);
  if (n.lengthSq() < 1e-6) n.set(1, 0, 0).addScaledVector(u, -u.x);
  return n.normalize();
}
/* Avstånd och polylinje kan dras ut (polylinjen: Victor 2026-10-10 "Polyline ska också gå att dra upp").
   Polylinjens riktning räknas från första till sista punkten – en vågrät kedja dras rakt uppåt. */
const l3mCanOff = m => m.kind === "dist" || (m.kind === "poly" && m.pts.length >= 2);
function l3mOffN(m) {
  const a = m.pts[0], b = m.pts[m.pts.length - 1];
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) < 1e-6 ? new THREE.Vector3(0, 0, 1) : l3mOffDir(a, b);
}
/* Måttlinjens punkter (samma koordinater som pts) – fästpunkterna själva när måttet inte är utdraget. */
function l3mDimPts(m) {
  if (!l3mCanOff(m) || !m.off) return m.pts.slice();
  const n = l3mOffN(m), o = [n.x * m.off, n.y * m.off, n.z * m.off];
  return m.pts.map(p => p.map((v, i) => v + o[i]));
}
function l3mDraw() {
  if (!l3) return;
  if (!l3.groups.measKeep) { const g = new THREE.Group(); g.name = "measKeep"; l3.groups.measKeep = g; l3.scene.add(g); }
  const grp = l3.groups.measKeep;
  l3Clear(grp);
  const host = l3.renderer.domElement.parentElement;
  l3m.labels.forEach(el => el.remove()); l3m.labels.clear();
  grp.visible = true;
  l3m.list.forEach(m => {
    if (!(typeof l3aOn !== "function" || l3aOn(m))) return; // släckt mapp
    if (m.hid) return; // dolt (Dölj måtten gäller de mått som fanns då)
    const P = m.pts.map(p => new THREE.Vector3(p[0] - l3.O[0], p[1] - l3.O[1], p[2] - l3.O[2]));
    const sel = l3m.sel && l3m.sel.has(m.id), own = m.kind === "volume" && m.color ? new THREE.Color(m.color).getHex() : null;
    const col = sel ? 0xf59e0b : own != null ? own : m.saved ? 0x2563eb : 0xdc2626;
    const line = (a, b, op = 1) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: col, depthTest: false, transparent: op < 1, opacity: op })); l.renderOrder = 10; l.userData.noHit = true; l.raycast = () => {}; grp.add(l); };
    const D = l3mDimPts(m).map(p => new THREE.Vector3(p[0] - l3.O[0], p[1] - l3.O[1], p[2] - l3.O[2]));
    if (l3mCanOff(m) && m.off) {
      // Hjälplinjer från fästpunkterna ut till måttlinjen (lite förlängda), och måttlinjen/kedjan.
      const n = D[0].clone().sub(P[0]).normalize().multiplyScalar(Math.min(0.15, Math.abs(m.off) * 0.2));
      P.forEach((p, i) => line(p, D[i].clone().add(n), 0.55));
      for (let i = 1; i < D.length; i++) line(D[i - 1], D[i]);
      const ends = new THREE.Points(new THREE.BufferGeometry().setFromPoints(D), new THREE.PointsMaterial({ color: col, size: 5, sizeAttenuation: false, depthTest: false }));
      ends.renderOrder = 11; ends.userData.noHit = true; ends.raycast = () => {}; grp.add(ends);
    } else for (let i = 1; i < P.length; i++) line(P[i - 1], P[i]);
    if (m.kind === "volume" && P.length > 2) {
      // Volymen som en lodrät prisma (Victor 2026-10-10: "volymgrafiken lite tydligare och snyggare"):
      // belysta, halvgenomskinliga väggar (sidorna får olika ljus och läses som en kropp), tydligare tak och
      // botten, heldragna kanter, hörnpunkter uppe och nere och ett höjdmått på närmaste hörnkant.
      const h = Number(m.h) || 0, T = P.map(p => p.clone().add(new THREE.Vector3(0, 0, h)));
      line(P[P.length - 1], P[0]); for (let i = 0; i < T.length; i++) { line(T[i], T[(i + 1) % T.length]); line(P[i], T[i], 0.85); }
      const shp = new THREE.Shape(P.map(p => new THREE.Vector2(p.x, p.y))), zb = Math.min(0, h) + P.reduce((s, p) => s + p.z, 0) / P.length;
      const fc = own != null ? own : col; // egen färg syns i ytan även när volymen är markerad
      const mat = o => new THREE.MeshLambertMaterial({ color: fc, emissive: fc, emissiveIntensity: 0.25, transparent: true, opacity: o, side: THREE.DoubleSide, depthWrite: false });
      const box = new THREE.Mesh(new THREE.ExtrudeGeometry(shp, { depth: Math.abs(h), bevelEnabled: false }), [mat(0.3), mat(0.2)]); // tak/botten, väggar
      box.renderOrder = 9; box.position.z = zb; box.userData.noHit = true; box.raycast = () => {}; grp.add(box);
      const tops = new THREE.Points(new THREE.BufferGeometry().setFromPoints(T), new THREE.PointsMaterial({ color: col, size: 6, sizeAttenuation: false, depthTest: false }));
      tops.renderOrder = 11; tops.userData.noHit = true; tops.raycast = () => {}; grp.add(tops);
      // Höjdmåttet på den hörnkant som ligger närmast kameran.
      const cam = l3.camera.position; let k = 0; P.forEach((p, i) => { if (p.distanceToSquared(cam) < P[k].distanceToSquared(cam)) k = i; });
      const hl = document.createElement("div");
      hl.className = "v3-meas v3-meas-keep v3-meas-h" + (m.saved ? " saved" : "") + (sel ? " sel" : "");
      hl.textContent = `h ${l3Fmt(Math.abs(h), 2)} m`;
      if (m.color && !sel) hl.style.color = m.color;
      host.appendChild(hl); hl._at = P[k].clone().lerp(T[k], 0.5); l3m.labels.set(m.id + ":h", hl);
    }
    if (m.kind === "area" && P.length > 2) {
      line(P[P.length - 1], P[0]);
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(P.map(p => new THREE.Vector2(p.x, p.y)))), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false }));
      fill.position.z = P.reduce((s, p) => s + p.z, 0) / P.length + 0.02; fill.userData.noHit = true; fill.raycast = () => {}; grp.add(fill);
    }
    const pts = new THREE.Points(new THREE.BufferGeometry().setFromPoints(P), new THREE.PointsMaterial({ color: col, size: 6, sizeAttenuation: false, depthTest: false }));
    pts.renderOrder = 11; pts.userData.noHit = true; pts.raycast = () => {}; grp.add(pts);
    const at = m.kind === "point" ? P[0].clone() : m.kind === "volume" ? P.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / P.length).add(new THREE.Vector3(0, 0, (Number(m.h) || 0) / 2)) : m.kind === "poly" ? l3mPathMid(D) : m.kind === "angle" ? P[1] : m.kind === "area" ? P.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / P.length) : D[0].clone().add(D[1]).multiplyScalar(0.5);
    const el = document.createElement("div");
    el.className = "v3-meas v3-meas-keep" + (m.kind === "point" ? " pt" : "") + (m.saved ? " saved" : "") + (sel ? " sel" : "") + (l3mCanOff(m) ? " drag" : "");
    if (l3mCanOff(m)) el.title = "Tryck för att markera måttet – dra för att föra måttlinjen uppåt eller nedåt (fästpunkterna sitter kvar). Dubbelklick: tillbaka.";
    el.onpointerdown = e => l3mLabelDown(e, m);
    el.ondblclick = e => { e.stopPropagation(); if (l3mCanOff(m) && m.off && !m.locked) l3mSetOff(m, 0, m.off); };
    if (m.locked) { el.classList.remove("drag"); el.classList.add("locked"); el.title = "Låst mått – lås upp det i listan Mått för att ändra det."; }
    el.textContent = l3mLabel(m); el.dataset.mid = m.id;
    if (own != null && !sel) el.style.background = m.color;
    host.appendChild(el);
    l3m.labels.set(m.id, el); el._at = at;
  });
  l3mPlaceLabels();
  l3Render();
}
/* Etiketterna följer kameran (anropas när bilden ritas). */
function l3mPlaceLabels() {
  if (!l3 || !l3m.labels.size) return;
  l3m.labels.forEach(el => {
    const q = l3ToScreen(el._at);
    el.style.display = q.behind ? "none" : "block"; el.style.left = q.x + "px"; el.style.top = q.y + "px";
    el.style.pointerEvents = l3.tool === "select" || !l3.tool ? "auto" : "none"; // med andra verktyg går trycket igenom
  });
  l3mHandlesPlace();
}
/* ---- Ändpunkterna (Victor 2026-10-10: "dra ändpunkterna på måtten jag har satt ut") ------------------
   För ett ensamt markerat, olåst mått: ett handtag på varje punkt. Dra = punkten fäster som när man mäter
   (hörn, kanter, ytor, DXF); Skift = var 5:e grad från grannpunkten. Måttet räknas om; Ctrl+Z ångrar. */
const l3mH = { els: [], drag: null };
function l3mActive() {
  if (!l3 || !l3m.sel || l3m.sel.size !== 1 || (l3.tool && l3.tool !== "select")) return null;
  const m = l3m.list.find(x => l3m.sel.has(x.id));
  return m && !m.locked && (typeof l3aOn !== "function" || l3aOn(m)) ? m : null;
}
function l3mHandlesPlace() {
  const m = l3mActive(), n = m ? m.pts.length : 0, host = l3.renderer.domElement.parentElement;
  while (l3mH.els.length > n) l3mH.els.pop().remove();
  while (l3mH.els.length < n) {
    const i = l3mH.els.length, b = document.createElement("button");
    b.type = "button"; b.className = "v3-mhandle"; b.title = "Dra för att flytta måttets punkt (fäster mot hörn, kanter och ytor; Skift = var 5:e grad)";
    b.onpointerdown = e => l3mHDown(e, i); b.onclick = e => e.stopPropagation();
    host.appendChild(b); l3mH.els.push(b);
  }
  if (!m) return;
  m.pts.forEach((p, i) => {
    const q = l3ToScreen(new THREE.Vector3(p[0] - l3.O[0], p[1] - l3.O[1], p[2] - l3.O[2])), el = l3mH.els[i];
    el.style.display = q.behind ? "none" : "block"; el.style.left = q.x + "px"; el.style.top = q.y + "px";
    el.classList.toggle("drag", !!(l3mH.drag && l3mH.drag.i === i));
  });
}
/* Värdet ur punkterna (efter att en punkt flyttats). */
function l3mRecalc(m) {
  const P = m.pts.map(p => new THREE.Vector3(p[0], p[1], p[2]));
  if (m.kind === "dist") m.text = `${l3Fmt(P[0].distanceTo(P[1]))} m`;
  else if (m.kind === "point") m.text = `X ${l3Fmt(P[0].x, 2)} m | Y ${l3Fmt(P[0].y, 2)} m | Z ${l3Fmt(P[0].z, 2)} m`;
  else if (m.kind === "volume" && typeof l3PolyArea === "function") m.text = `${l3Fmt(Math.abs(l3PolyArea(P).area * (Number(m.h) || 0)))} m³`;
  else if (m.kind === "poly") { let s = 0; for (let i = 1; i < P.length; i++) s += P[i].distanceTo(P[i - 1]); m.text = `${l3Fmt(s)} m`; }
  else if (m.kind === "angle" && typeof l3Angle3 === "function") m.text = `${l3Fmt(l3Angle3(P[0], P[1], P[2]), 1)}°`;
  else if (m.kind === "area" && typeof l3PolyArea === "function") m.text = `${l3Fmt(l3PolyArea(P).area)} m²`;
}
function l3mHDown(e, i) {
  const m = l3mActive(); if (!m || e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const was = { pts: m.pts.map(p => p.slice()), text: m.text, objs: (m.objs || []).slice() };
  l3mH.drag = { i };
  let moved = false;
  const mv = ev => {
    let s = typeof l3Snap === "function" ? l3Snap(ev) : null;
    const nb = m.pts[i === 0 ? 1 : i - 1];
    if (s && ev.shiftKey && nb) s = l3mShiftSnap(new THREE.Vector3(nb[0] - l3.O[0], nb[1] - l3.O[1], nb[2] - l3.O[2]), s);
    if (typeof l3ShowMarker === "function") l3ShowMarker(s);
    if (!s) return;
    moved = true;
    m.pts[i] = [s.point.x + l3.O[0], s.point.y + l3.O[1], s.point.z + l3.O[2]].map(v => Math.round(v * 1000) / 1000);
    l3mRecalc(m); l3mDraw(); l3StatusLive(`${L3M_KIND[m.kind] || "Mått"} ${m.text}`);
  };
  const up = ev => {
    window.removeEventListener("pointermove", mv, true); window.removeEventListener("pointerup", up, true); window.removeEventListener("pointercancel", up, true);
    l3mH.drag = null; if (typeof l3ShowMarker === "function") l3ShowMarker(null);
    if (!moved || JSON.stringify(m.pts) === JSON.stringify(was.pts)) { l3mDraw(); return; }
    if (typeof l3mObjAt === "function") { m.objs = (m.objs || []).slice(); m.objs[i] = l3mObjAt(ev); }
    const now = { pts: m.pts.map(p => p.slice()), text: m.text, objs: (m.objs || []).slice() };
    const set = st => { m.pts = st.pts.map(p => p.slice()); m.text = st.text; m.objs = st.objs.slice(); l3mChanged(m); };
    if (typeof l3VPush === "function") l3VPush(() => set(was), () => set(now), "flytta måttets punkt");
    l3mChanged(m);
    l3Status(`${L3M_KIND[m.kind] || "Måttet"} är nu ${m.text} (Ctrl+Z ångrar).`);
  };
  window.addEventListener("pointermove", mv, true); window.addEventListener("pointerup", up, true); window.addEventListener("pointercancel", up, true);
}
/* Låsa mått (Victor 2026-10-10: "låsa måtten i måttmenyn"): låsta går inte att flytta, dra ut eller ta bort. */
const L3M_LOCK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';
const L3M_UNLOCK = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>';
function l3mLock(list, on) {
  const ch = list.filter(m => !!m.locked !== on);
  if (!ch.length) return;
  const apply = v => { ch.forEach(m => { m.locked = v; }); l3mDraw(); l3kRenderTab(); l3mWriteMany(ch); };
  if (typeof l3VPush === "function") l3VPush(() => apply(!on), () => apply(on), on ? "lås mått" : "lås upp mått");
  apply(on);
  l3Status(`${ch.length === 1 ? "Måttet" : `${ch.length} mått`} ${on ? "låst – går inte att flytta eller ta bort" : "upplåst"}.`);
}
/* Tryck på måttets text: markera måttet; dra = för måttlinjen längs l3mOffDir (Skift: jämna 10 cm). */
function l3mLabelDown(e, m) {
  if (e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  if (!(l3m.sel.size === 1 && l3m.sel.has(m.id))) { l3m.sel.clear(); l3m.sel.add(m.id); l3m.anchor = m.id; l3mDraw(); if (typeof l3kRenderTab === "function") l3kRenderTab(); }
  if (!l3mCanOff(m) || m.locked) return;
  const D0 = l3mDimPts(m).map(p => new THREE.Vector3(p[0] - l3.O[0], p[1] - l3.O[1], p[2] - l3.O[2]));
  const mid = D0[0].clone().add(D0[D0.length - 1]).multiplyScalar(0.5), n = l3mOffN(m);
  const p0 = l3ToScreen(mid), p1 = l3ToScreen(mid.clone().add(n));
  const v = [p1.x - p0.x, p1.y - p0.y], vv = v[0] * v[0] + v[1] * v[1];
  const off0 = m.off || 0, x0 = e.clientX, y0 = e.clientY;
  let moved = false;
  const mv = ev => {
    if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 3) return;
    moved = true;
    if (vv < 1) return; // riktningen syns inte på skärmen (rakt framifrån) – vrid vyn
    let off = off0 + ((ev.clientX - x0) * v[0] + (ev.clientY - y0) * v[1]) / vv;
    if (ev.shiftKey) off = Math.round(off * 10) / 10;
    m.off = Math.round(off * 1000) / 1000;
    l3mDraw();
  };
  const up = () => {
    window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
    if (moved && m.off !== off0) l3mSetOff(m, m.off, off0);
  };
  window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
}
function l3mSetOff(m, off, was) {
  m.off = off;
  if (typeof l3VPush === "function") l3VPush(() => { m.off = was; l3mChanged(m); }, () => { m.off = off; l3mChanged(m); }, "flytta måttlinjen");
  l3mChanged(m);
  l3Status(off ? `Måttlinjen ligger ${l3Fmt(Math.abs(off), 2)} m ${off > 0 ? "ovanför" : "nedanför"} fästpunkterna (dubbelklick på måttet: tillbaka, Ctrl+Z ångrar).` : "Måttlinjen är tillbaka vid fästpunkterna.");
}
function l3mRemove(id) {
  const m = l3m.list.find(x => x.id === id); if (!m) return;
  if (m.locked) { l3Status("Måttet är låst – lås upp det i listan Mått för att ta bort det.", true); return; }
  l3m.list = l3m.list.filter(x => x.id !== id);
  if (m.saved) ghWriteJSON(token, l3mPath(), arr => (Array.isArray(arr) ? arr : []).filter(x => x.id !== id), "3D: mått borttaget").catch(e => l3Status("Kunde inte ta bort måttet ur projektet: " + e.message, true));
  if (typeof l3VPush === "function") l3VPush(() => { l3m.list.push(m); if (m.saved) l3mSave([m]); l3mDraw(); l3mRenderBar(); }, () => l3mRemove(id), "ta bort mått");
  l3mDraw(); l3mRenderBar();
}
async function l3mSave(only) {
  const list = (only || l3m.list.filter(x => !x.saved));
  if (!list.length) { l3Status("Alla mått är redan sparade."); return; }
  const recs = list.map(({ saved, hid, ...x }) => x), ids = new Set(recs.map(x => x.id));
  try {
    await ghWriteJSON(token, l3mPath(), arr => [...(Array.isArray(arr) ? arr : []).filter(x => !ids.has(x.id)), ...recs], `3D: ${recs.length} mått sparade`);
    list.forEach(x => { x.saved = true; });
    l3Toast(`${recs.length} mått sparade i projektet – de finns kvar nästa gång.`);
  } catch (e) { l3Status("Kunde inte spara måtten: " + e.message, true); }
  l3mDraw(); l3mRenderBar();
}
function l3mClearUnsaved() {
  const gone = l3m.list.filter(x => !x.saved && !x.locked);
  if (!gone.length) return;
  { const s0 = new Set(gone); l3m.list = l3m.list.filter(x => !s0.has(x)); }
  if (typeof l3VPush === "function") l3VPush(() => { l3m.list.push(...gone); l3mDraw(); l3mRenderBar(); }, () => { const s = new Set(gone); l3m.list = l3m.list.filter(x => !s.has(x)); l3mDraw(); l3mRenderBar(); }, "rensa mått");
  l3mDraw(); l3mRenderBar();
}
/* Dölj/visa måtten: gäller de mått som finns nu (m.hid) – mått som mäts efteråt syns (Victor 2026-10-10). */
const l3mAllHidden = () => l3m.list.length > 0 && l3m.list.every(m => m.hid);
function l3mToggle(on) { const show = on === undefined ? l3mAllHidden() : !!on; l3m.list.forEach(m => { m.hid = !show; }); l3m.hidden = false; l3mDraw(); l3mRenderBar(); }

/* Fästraden (när Mät är valt): en knapp som visar måtten under fliken Kommentarer (Victor 2026-10-10:
   "Måtten tycker jag att ni kan lägga in under kommentarer"). */
function l3mBarHtml() {
  const n = l3m.list.length, uns = l3m.list.filter(x => !x.saved).length;
  return `<span class="v3-snapbar-sep"></span><button type="button" id="v3MeasBtn" title="Måtten som ligger kvar – visas under fliken Kommentarer (ta bort, dölj, spara, detaljer)">Mått ${n}${uns ? ` <em>${uns} osparade</em>` : ""} ›</button>`;
}
function l3mRenderBar() { if (typeof l3RenderSnapBar === "function") l3RenderSnapBar(); if (typeof l3LayersRender === "function") l3LayersRender(); if (typeof l3kRenderTab === "function") l3kRenderTab(); }
function l3mShowInTab() {
  if (typeof l3PalTab === "function") l3PalTab("comments");
  const pal = document.getElementById("v3Pal"); if (pal && pal.classList.contains("hidden") && typeof l3PalToggle === "function") l3PalToggle(true);
  l3m.secOpen = true;
  if (typeof l3kRenderTab === "function") l3kRenderTab();
  const sec = document.getElementById("v3MeasSec"); if (sec) sec.scrollIntoView({ block: "nearest" });
}
function l3mBindBar(bar) {
  const b = bar.querySelector("#v3MeasBtn");
  if (b) b.onclick = e => { e.stopPropagation(); l3mShowInTab(); };
}

/* Vilket objekt en mätpunkt ligger på (från tryckets träff i 3D). */
function l3mObjAt(e) {
  try {
    const h = typeof l3Ray === "function" ? l3Ray(e, typeof l3Surfaces === "function" ? l3Surfaces() : [l3.scene])[0] : null;
    if (!h || typeof l3kTarget !== "function") return null;
    const t = l3kTarget(h);
    return { kind: t.kind, name: t.name || "", guid: t.guid || null, model: t.model || null };
  } catch (err) { return null; }
}

/* Allt som går att räkna ut ur måttet (Victor 2026-10-10: "lägg in mer information än bara måttet"). */
function l3mInfo(m) {
  // Nära noll visas som 0 (inte "−0"); sg ger tecken framför höjder och lutningar.
  const P = m.pts.map(p => new THREE.Vector3(p[0], p[1], p[2])), f = (v, d = 3) => l3Fmt(Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v, d), rows = [];
  const sg = (v, d = 3) => (Math.abs(v) < 0.5 * Math.pow(10, -d) ? "0" : (v > 0 ? "+" : "") + f(v, d));
  const deg = r => r * 180 / Math.PI;
  let sub = "";
  if (m.kind === "dist" && P.length >= 2) {
    const [a, b] = P, d = a.distanceTo(b), hz = Math.hypot(b.x - a.x, b.y - a.y), dz = b.z - a.z;
    const slope = hz > 1e-6 ? dz / hz * 100 : null, ang = deg(Math.atan2(dz, hz));
    rows.push(["Avstånd (3D)", `${f(d)} m`], ["Vågrätt", `${f(hz)} m`], ["Höjdskillnad", `${sg(dz)} m`],
      ["Lutning", slope == null ? "lodrätt" : `${sg(slope, 1)} % (${sg(ang, 1)}°)`], ["ΔX / ΔY", `${f(b.x - a.x)} / ${f(b.y - a.y)} m`]);
    sub = `vågrätt ${f(hz, 2)} m · höjd ${sg(dz, 2)} m${slope != null && Math.abs(dz) > 0.005 ? ` · ${sg(slope, 1)} %` : ""}`;
  } else if (m.kind === "point" && P.length >= 1) {
    rows.push(["X", `${f(P[0].x)} m`], ["Y", `${f(P[0].y)} m`], ["Z", `${f(P[0].z)} m`]);
    sub = "koordinat";
  } else if (m.kind === "volume" && P.length >= 3) {
    let a = 0, per = 0;
    for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p.x * q.y - q.x * p.y; per += Math.hypot(q.x - p.x, q.y - p.y); }
    const base = Math.abs(a) / 2, h = Number(m.h) || 0, z0 = P.reduce((s2, p) => s2 + p.z, 0) / P.length;
    rows.push(["Volym", `${f(base * Math.abs(h), 2)} m³`], ["Basyta (i plan)", `${f(base, 2)} m²`], ["Höjd", `${sg(h)} m`], ["Basens höjd (medel)", `${f(z0)} m`], ["Toppens höjd", `${f(z0 + h)} m`], ["Omkrets", `${f(per)} m`], ["Hörn", String(P.length)]);
    sub = `basyta ${f(base, 2)} m² · höjd ${sg(h, 2)} m`;
  } else if (m.kind === "poly" && P.length >= 2) {
    let len = 0, hz = 0; const parts = [];
    for (let i = 1; i < P.length; i++) { const d = P[i].distanceTo(P[i - 1]); len += d; hz += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y); parts.push(d); }
    const dz = P[P.length - 1].z - P[0].z;
    rows.push(["Längd (3D)", `${f(len)} m`], ["Vågrätt", `${f(hz)} m`], ["Höjdskillnad (start → slut)", `${sg(dz)} m`], ["Punkter", String(P.length)], ["Rakt start → slut", `${f(P[0].distanceTo(P[P.length - 1]))} m`],
      ...parts.map((d, i) => [`Delsträcka ${i + 1}`, `${f(d)} m`]));
    sub = `${P.length} punkter · ${parts.length} delsträckor · vågrätt ${f(hz, 2)} m`;
  } else if (m.kind === "angle" && P.length >= 3) {
    const a3 = (p, v, q) => { const u = p.clone().sub(v), w = q.clone().sub(v), d = u.length() * w.length(); return d ? deg(Math.acos(Math.max(-1, Math.min(1, u.dot(w) / d)))) : 0; };
    const flat = P.map(p => new THREE.Vector3(p.x, p.y, 0));
    const v = a3(P[0], P[1], P[2]), vh = a3(flat[0], flat[1], flat[2]);
    rows.push(["Vinkel (3D)", `${f(v, 2)}°`], ["Vinkel i plan", `${f(vh, 2)}°`], ["Ben 1", `${f(P[0].distanceTo(P[1]))} m`], ["Ben 2", `${f(P[2].distanceTo(P[1]))} m`]);
    sub = `i plan ${f(vh, 1)}° · ben ${f(P[0].distanceTo(P[1]), 2)} / ${f(P[2].distanceTo(P[1]), 2)} m`;
  } else if (m.kind === "area" && P.length >= 3) {
    let a = 0, per = 0, per3 = 0;
    const n3 = new THREE.Vector3();
    for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p.x * q.y - q.x * p.y; per += Math.hypot(q.x - p.x, q.y - p.y); per3 += p.distanceTo(q); n3.add(new THREE.Vector3().crossVectors(p.clone().sub(P[0]), q.clone().sub(P[0]))); }
    const plan = Math.abs(a) / 2, real = n3.length() / 2, zs = P.map(p => p.z);
    rows.push(["Yta i plan", `${f(plan, 2)} m²`], ["Verklig yta (lutande)", `${f(real, 2)} m²`], ["Omkrets i plan", `${f(per)} m`], ["Omkrets (3D)", `${f(per3)} m`], ["Hörn", String(P.length)],
      ["Höjd", `${f(Math.min(...zs))} – ${f(Math.max(...zs))} m (medel ${f(zs.reduce((s2, z) => s2 + z, 0) / zs.length)})`]);
    sub = `omkrets ${f(per, 2)} m · ${P.length} hörn${Math.abs(real - plan) > plan * 0.01 ? ` · lutande ${f(real, 2)} m²` : ""}`;
  }
  const names = (m.objs || []).map(o => (o && o.name) || "");
  const objTxt = names.some(Boolean) ? (m.kind === "dist" ? `${names[0] || "?"} → ${names[1] || "?"}` : [...new Set(names.filter(Boolean))].join(", ")) : "";
  if (objTxt) rows.push([m.kind === "dist" ? "Från → till" : "Objekt", objTxt]);
  P.forEach((p, i) => rows.push([`Punkt ${i + 1}`, `X ${f(p.x)}\nY ${f(p.y)}\nZ ${f(p.z)}`]));
  rows.push(["Mätt av", `${m.by || "–"} · ${m.at ? new Date(m.at).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}`], ["Status", m.saved ? "Sparad i projektet" : "Inte sparad"]);
  return { sub, objTxt, rows };
}
const L3M_KIND = { point: "Punkt", dist: "Avstånd", poly: "Polylinje", angle: "Vinkel", area: "Yta", volume: "Volym" };
/* Punkten mitt längs en polylinje (för etiketten). pts: [x, y, z] eller THREE.Vector3. */
function l3mPathMid(pts) {
  const V = pts.map(p => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1], p[2])));
  let tot = 0; for (let i = 1; i < V.length; i++) tot += V[i].distanceTo(V[i - 1]);
  let left = tot / 2;
  for (let i = 1; i < V.length; i++) { const d = V[i].distanceTo(V[i - 1]); if (left <= d) return V[i - 1].clone().lerp(V[i], d ? left / d : 0); left -= d; }
  return V[V.length - 1].clone();
}
function l3mTabHtml() {
  const esc = escHtml, I = L3_ICO, n = l3m.list.length, uns = l3m.list.filter(x => !x.saved).length;
  l3m.exp = l3m.exp || new Set();
  const open = l3m.secOpen !== false;
  l3m.sel.forEach(id => { if (!l3m.list.some(m => m.id === id)) l3m.sel.delete(id); });
  const nSel = l3m.sel.size, withNotes = l3Prefs().measExpNotes !== false;
  return `<section class="v3-msec" id="v3MeasSec"><button type="button" class="v3-msec-h" id="v3MeasHead" aria-expanded="${open}"><i>›</i>Mått <span>${n}${uns ? ` · ${uns} osparade` : ""}</span></button>
    ${open ? `${n ? `<div class="v3-kc-list">${l3m.list.map((m, i) => { const inf = l3mInfo(m), ex = l3m.exp.has(m.id); return `<div class="v3-mr ${ex ? "ex" : ""}">
      <div class="v3-kc ${l3m.sel.has(m.id) ? "sel" : ""} ${typeof l3aOn !== "function" || l3aOn(m) ? "" : "off"}">${m.kind === "volume" ? `<label class="v3-mdot v3-mcol ${m.saved ? "saved" : ""}" style="${m.color ? `background:${esc(m.color)}` : ""}" title="Volymens färg – klicka för att välja (${m.saved ? "sparad i projektet" : "inte sparad"})"><input type="color" data-mcol="${esc(m.id)}" value="${esc(m.color || (m.saved ? "#2563eb" : "#dc2626"))}" /></label>` : `<i class="v3-mdot ${m.saved ? "saved" : ""}" title="${m.saved ? "Sparad i projektet" : "Inte sparad"}"></i>`}
        <button type="button" class="v3-kc-b" data-mzoom="${esc(m.id)}" title="Klick: zooma till måttet · Ctrl+klick: välj flera · Skift+klick: välj flera i rad"><b>${L3M_KIND[m.kind] || ""} ${esc(m.text).replace(/ (m²?|°)$/, "&nbsp;$1")}</b>${m.folder && typeof l3aFolderName === "function" && l3aFolderName(m.folder) ? `<em><span class="v3-fchip">${esc(l3aFolderName(m.folder))}</span></em>` : ""}${m.note ? `<em class="v3-mnote">${m.showNote ? "" : "(dold) "}${esc(m.note)}</em>` : ""}<em>${esc(inf.sub)}</em>${inf.objTxt ? `<em>${esc(inf.objTxt)}</em>` : ""}</button>
        <button type="button" class="v3-ic" data-mexp="${esc(m.id)}" title="${ex ? "Dölj detaljerna" : "Visa alla detaljer"}" aria-expanded="${ex}">${ex ? "▴" : "▾"}</button>
        <button type="button" class="v3-ic" data-mcopy="${esc(m.id)}" title="Kopiera måttet med alla detaljer">${I.copy || "⧉"}</button>
        <button type="button" class="v3-ic ${m.locked ? "on" : ""}" data-mlock="${esc(m.id)}" title="${m.locked ? "Låst – tryck för att låsa upp" : "Lås måttet (går inte att flytta eller ta bort)"}" aria-pressed="${!!m.locked}">${m.locked ? L3M_LOCK : L3M_UNLOCK}</button>
        <button type="button" class="v3-ic" data-mdel="${esc(m.id)}" title="${m.locked ? "Låst – lås upp för att ta bort" : "Ta bort måttet"}" ${m.locked ? "disabled" : ""}>${I.trash}</button></div>
      ${ex ? `<div class="v3-mnoteed"><input type="text" data-mnote="${esc(m.id)}" value="${esc(m.note || "")}" placeholder="Kommentar till måttet, t.ex. Mått mellan fundament" maxlength="120" />
        <label class="v3-chk" title="Visa kommentaren efter måttet i 3D: ${esc(m.text)} – kommentar"><input type="checkbox" data-mshow="${esc(m.id)}" ${m.showNote ? "checked" : ""} ${m.note ? "" : "disabled"} /> Visa i 3D</label></div>
      <dl class="v3-mdl">${inf.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}</div>`; }).join("")}</div>` : `<div class="v3-pal-hint">Inga mått än. Mät med Mät (M) – avstånd, vinkel eller yta – så hamnar de här.</div>`}
    ${n ? `<div class="v3-grp-acts">
      <button type="button" id="v3MeasIfcSel" ${nSel ? "" : "disabled"} title="De markerade måtten (Ctrl+klick / Skift+klick) som 3D-objekt i en ny IFC-fil i Trimble Connect">${I.upload} Exportera markerade${nSel ? ` (${nSel})` : ""}</button>
      <button type="button" id="v3MeasIfc" title="Alla mått som 3D-objekt (linje, ändpunkter och skylt med måttet) i en ny IFC-fil i Trimble Connect">${I.upload} Exportera alla mått</button>
      <label class="v3-chk" title="Ta med måttens kommentarer på skyltarna i IFC:n"><input type="checkbox" id="v3MeasExpNotes" ${withNotes ? "checked" : ""} /> Med kommentarer</label>
      ${nSel ? `<button type="button" id="v3MeasSelClr">Avmarkera</button>` : ""}
      <button type="button" id="v3MeasSave" ${uns ? "" : "disabled"} title="Spara de osparade måtten i projektet (finns kvar nästa gång och för andra)">${I.upload} Spara i projektet${uns ? ` (${uns})` : ""}</button>
      ${l3m.list.some(m => m.note) ? `<button type="button" id="v3MeasNotesOn" title="Visa kommentaren efter måttet i 3D för alla mått som har en kommentar">${I.eye} Visa alla måttkommentarer</button>
      <button type="button" id="v3MeasNotesOff" title="Visa bara måtten i 3D (kommentarerna finns kvar)">${I.eyeOff} Dölj alla måttkommentarer</button>` : ""}
      ${l3m.list.some(m => !m.locked) ? `<button type="button" id="v3MeasLockAll" title="Lås alla mått">${L3M_LOCK} Lås alla</button>` : ""}
      ${l3m.list.some(m => m.locked) ? `<button type="button" id="v3MeasUnlockAll" title="Lås upp alla mått">${L3M_UNLOCK} Lås upp alla</button>` : ""}
      <button type="button" id="v3MeasHide">${l3mAllHidden() ? I.eye + " Visa måtten" : I.eyeOff + " Dölj måtten"}</button>
      <button type="button" id="v3MeasCopyAll" title="Alla mått med detaljer som text (t.ex. till e-post eller Excel)">${I.copy || "⧉"} Kopiera alla</button>
      <button type="button" id="v3MeasClr" ${uns ? "" : "disabled"}>${I.trash} Rensa osparade</button></div>` : ""}` : ""}</section>`;
}
function l3mCopyText(list) {
  return list.map(m => { const inf = l3mInfo(m); return `${L3M_KIND[m.kind] || ""} ${m.text}\n${inf.rows.map(([k, v]) => `  ${k}: ${String(v).replace(/\n/g, ", ")}`).join("\n")}`; }).join("\n\n");
}
function l3mBindTab(host) {
  const on = (sel, fn) => { const x = host.querySelector(sel); if (x) x.onclick = e => { e.stopPropagation(); fn(x); }; };
  on("#v3MeasHead", () => { l3m.secOpen = !(l3m.secOpen !== false); l3kRenderTab(); });
  // Volymens färg (Victor 2026-10-10: "välja färg på volymboxarna genom att klicka på den lilla röda punkten").
  host.querySelectorAll("[data-mcol]").forEach(x => {
    x.onclick = e => e.stopPropagation();
    x.oninput = () => { const m = l3m.list.find(q => q.id === x.dataset.mcol); if (m) { m.color = x.value; l3mDraw(); } };
    x.onchange = () => {
      const m = l3m.list.find(q => q.id === x.dataset.mcol); if (!m) return;
      const was = x.dataset.was !== undefined ? x.dataset.was || null : null, now = x.value;
      if (typeof l3VPush === "function") l3VPush(() => { m.color = was; l3mChanged(m); }, () => { m.color = now; l3mChanged(m); }, "volymens färg");
      m.color = now; l3mChanged(m);
    };
    x.onfocus = () => { const m = l3m.list.find(q => q.id === x.dataset.mcol); x.dataset.was = (m && m.color) || ""; };
  });
  host.querySelectorAll("[data-mdel]").forEach(x => { x.onclick = e => { e.stopPropagation(); l3mRemove(x.dataset.mdel); }; });
  host.querySelectorAll("[data-mexp]").forEach(x => { x.onclick = e => { e.stopPropagation(); const id = x.dataset.mexp; l3m.exp.has(id) ? l3m.exp.delete(id) : l3m.exp.add(id); l3kRenderTab(); }; });
  const copy = t => { try { navigator.clipboard.writeText(t).then(() => l3Toast("Kopierat."), () => l3Status("Kunde inte kopiera.", true)); } catch (err) { l3Status("Kunde inte kopiera.", true); } };
  host.querySelectorAll("[data-mcopy]").forEach(x => { x.onclick = e => { e.stopPropagation(); const m = l3m.list.find(y => y.id === x.dataset.mcopy); if (m) copy(l3mCopyText([m])); }; });
  const ids = l3m.list.map(m => m.id);
  host.querySelectorAll("[data-mzoom]").forEach(x => { x.onclick = e => { e.stopPropagation(); const m = l3m.list.find(y => y.id === x.dataset.mzoom); if (!m) return;
    // Som kommentarerna: Ctrl+klick väljer flera, Skift+klick ett intervall, vanligt klick zoomar.
    if (e.shiftKey && l3m.anchor && ids.includes(l3m.anchor)) { const a = ids.indexOf(l3m.anchor), z = ids.indexOf(m.id); if (!(e.ctrlKey || e.metaKey)) l3m.sel.clear(); ids.slice(Math.min(a, z), Math.max(a, z) + 1).forEach(id => l3m.sel.add(id)); l3kRenderTab(); l3mDraw(); return; }
    if (e.ctrlKey || e.metaKey) { l3m.sel.has(m.id) ? l3m.sel.delete(m.id) : l3m.sel.add(m.id); l3m.anchor = m.id; l3kRenderTab(); l3mDraw(); return; }
    l3m.sel.clear(); l3m.sel.add(m.id); l3m.anchor = m.id; l3kRenderTab(); l3mDraw();
    if (m.hid) { m.hid = false; l3mDraw(); } const b3 = new THREE.Box3(); m.pts.forEach(p => b3.expandByPoint(new THREE.Vector3(p[0] - l3.O[0], p[1] - l3.O[1], p[2] - l3.O[2]))); l3FlyTo(b3.getCenter(new THREE.Vector3()), Math.max(6, b3.getSize(new THREE.Vector3()).length() * 1.6)); }; });
  on("#v3MeasSave", () => l3mSave());
  on("#v3MeasLockAll", () => l3mLock(l3m.list, true));
  on("#v3MeasUnlockAll", () => l3mLock(l3m.list, false));
  host.querySelectorAll("[data-mlock]").forEach(x => { x.onclick = e => { e.stopPropagation(); const m = l3m.list.find(y => y.id === x.dataset.mlock); if (m) l3mLock([m], !m.locked); }; });
  on("#v3MeasNotesOn", () => l3mNotesAll(true));
  on("#v3MeasNotesOff", () => l3mNotesAll(false));
  on("#v3MeasSelClr", () => { l3m.sel.clear(); l3m.anchor = null; l3kRenderTab(); l3mDraw(); });
  const ex = (sel, idsFn) => on(sel, async b => { b.disabled = true; try { await l3mExportIfc(idsFn && idsFn()); } catch (err) { /* statusraden */ } if (b.isConnected) b.disabled = false; });
  ex("#v3MeasIfc", null); ex("#v3MeasIfcSel", () => [...l3m.sel]);
  const wn = host.querySelector("#v3MeasExpNotes"); if (wn) wn.onchange = () => l3SetPref("measExpNotes", wn.checked);
  host.querySelectorAll("[data-mnote]").forEach(inp => {
    inp.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") inp.blur(); if (e.key === "Escape") { inp.value = (l3m.list.find(y => y.id === inp.dataset.mnote) || {}).note || ""; inp.blur(); } };
    inp.onchange = () => { const m = l3m.list.find(y => y.id === inp.dataset.mnote); if (!m) return; const v = inp.value.trim(); if ((m.note || "") === v) return; m.note = v; if (v && m.showNote === undefined) m.showNote = false; if (!v) m.showNote = false; l3mChanged(m); };
  });
  host.querySelectorAll("[data-mshow]").forEach(cb => { cb.onchange = () => { const m = l3m.list.find(y => y.id === cb.dataset.mshow); if (!m) return; m.showNote = cb.checked; l3mChanged(m); }; });
  on("#v3MeasHide", () => l3mToggle());
  on("#v3MeasCopyAll", () => copy(l3mCopyText(l3m.list)));
  on("#v3MeasClr", () => l3mClearUnsaved());
}

/* Kommentaren på ett mått ändrad: rita om och – om måttet redan är sparat – spara ändringen i projektet. */
function l3mChanged(m) {
  l3mDraw(); l3kRenderTab();
  if (!m.saved) return;
  const { saved, hid, ...rec } = m;
  ghWriteJSON(token, l3mPath(), arr => [...(Array.isArray(arr) ? arr : []).filter(x => x.id !== m.id), rec], "3D: måttets kommentar").catch(e => l3Status("Kunde inte spara måttets kommentar: " + e.message, true));
}

/* ---- Måtten som 3D-objekt i IFC (Victor 2026-10-10: "exportera måtten likt jag kan göra med
   3d-kommentarerna … med eller utan kommentarer") ------------------------------------------------------
   Varje mått: linjerna som tunna rör med markerade ändpunkter (ytan: kanterna och en tunn platta) och en
   vit skylt med måttet – och kommentaren om den ska med – som 3D-text på båda sidor, vänd mot vyn.
   Egenskaperna (värde, vågrätt, höjdskillnad, lutning, objekt, koordinater …) ligger i "4D-planering". */
// Victor 2026-10-10: tunnare linjer, rundade brytningar, en upp-och-nedvänd kon på varje mätpunkt, mindre text.
const L3M_IFC = { r: 0.012, bend: 0.08, cone: { h: 0.14, r: 0.045 }, T: 0.03, tT: 0.012, pad: 0.07, lift: 0.3, red: "#dc2626", h1: 0.14, h2: 0.1 };
/* Väg med rundade hörn: raka bitar och en båge (radie R, begränsad av bitarnas längd) i varje brytning. */
function l3mFillet(P, closed, R) {
  const V = P.map(p => new THREE.Vector3(p[0], p[1], p[2])), n = V.length, out = [];
  if (n < 3 && !closed) return V;
  for (let i = 0; i < n; i++) {
    const prev = V[(i - 1 + n) % n], cur = V[i], next = V[(i + 1) % n];
    if (!closed && (i === 0 || i === n - 1)) { out.push(cur.clone()); continue; }
    const u = cur.clone().sub(prev), w = next.clone().sub(cur), lu = u.length(), lw = w.length();
    if (lu < 1e-6 || lw < 1e-6) { out.push(cur.clone()); continue; }
    u.divideScalar(lu); w.divideScalar(lw);
    const th = Math.acos(Math.max(-1, Math.min(1, u.dot(w)))); // vinkeln man svänger
    if (th < 0.02) { out.push(cur.clone()); continue; }
    const d = Math.min(R * Math.tan(th / 2), lu * 0.45, lw * 0.45), A = cur.clone().addScaledVector(u, -d), B = cur.clone().addScaledVector(w, d);
    // Kvadratisk Bézier A–cur–B: en mjuk båge in i hörnet.
    const k = Math.max(3, Math.round(th / (Math.PI / 12)));
    for (let j = 0; j <= k; j++) { const t = j / k, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t; out.push(new THREE.Vector3(A.x * a + cur.x * b + B.x * c, A.y * a + cur.y * b + B.y * c, A.z * a + cur.z * b + B.z * c)); }
  }
  if (closed) out.push(out[0].clone());
  return out;
}
/* Rör längs en väg som slutna trianglar (ringar med parallellförflyttad ram), ändarna stängda. */
function l3mSweep(path, r, seg = 10) {
  const pts = [], tris = [], rings = [];
  let nPrev = null;
  for (let i = 0; i < path.length; i++) {
    const t = (i < path.length - 1 ? path[i + 1].clone().sub(path[i]) : path[i].clone().sub(path[i - 1])).normalize();
    if (i > 0 && i < path.length - 1) t.add(path[i].clone().sub(path[i - 1]).normalize()).normalize();
    let nrm = nPrev ? nPrev.clone().addScaledVector(t, -nPrev.dot(t)) : new THREE.Vector3(0, 0, 1).cross(t);
    if (nrm.lengthSq() < 1e-8) nrm = new THREE.Vector3(1, 0, 0).cross(t);
    nrm.normalize(); nPrev = nrm;
    const bin = t.clone().cross(nrm).normalize(), ring = [];
    for (let k = 0; k < seg; k++) { const a = 2 * Math.PI * k / seg, q = path[i].clone().addScaledVector(nrm, Math.cos(a) * r).addScaledVector(bin, Math.sin(a) * r); pts.push(q); ring.push(pts.length); }
    rings.push(ring);
  }
  for (let i = 0; i + 1 < rings.length; i++) for (let k = 0; k < seg; k++) { const a = rings[i][k], b = rings[i][(k + 1) % seg], c = rings[i + 1][(k + 1) % seg], d = rings[i + 1][k]; tris.push([a, b, c], [a, c, d]); }
  [[0, -1], [rings.length - 1, 1]].forEach(([ri, sgn]) => { pts.push(path[ri].clone()); const c = pts.length, R = rings[ri]; for (let k = 0; k < seg; k++) tris.push(sgn > 0 ? [c, R[k], R[(k + 1) % seg]] : [c, R[(k + 1) % seg], R[k]]); });
  return { pts, tris };
}
/* Upp-och-nedvänd kon med spetsen i punkten. */
function l3mCone(p, h, r, seg = 16) {
  const pts = [new THREE.Vector3(p.x, p.y, p.z), new THREE.Vector3(p.x, p.y, p.z + h)], tris = [];
  for (let k = 0; k < seg; k++) { const a = 2 * Math.PI * k / seg; pts.push(new THREE.Vector3(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, p.z + h)); }
  for (let k = 0; k < seg; k++) { const a = 3 + k, b = 3 + (k + 1) % seg; tris.push([1, b, a], [2, a, b]); }
  return { pts, tris };
}
function l3mIfcBuild(list, withNotes) {
  if (!list.length) return null;
  const doc = ifcDoc("4D-planering – " + (plan ? plan.name : ""), "Mått från 3D-vyn i Lägesplan"), E = doc.E;
  const d = l3.orbit.target.clone().sub(l3.camera.position); d.z = 0;
  if (d.lengthSq() < 1e-9) d.set(0, 1, 0);
  d.normalize();
  const r = [d.y, -d.x], n = [-d.x, -d.y];
  const dir = v => E(`IFCDIRECTION(${ifcPt(v)})`);
  const red = doc.style("matt", L3M_IFC.red, "Mått"), white = doc.style("matt-skylt", "#ffffff", "Måttskylt"), fillSt = doc.style("matt-yta", L3M_IFC.red, "Måttyta", 0.6);
  const elems = [];
  // Volymens egna färg (vald i måttlistan) – en stil per färg.
  const stC = new Map(), stOf = (c, fill) => { const k = c + (fill ? "f" : ""); if (!stC.has(k)) stC.set(k, fill ? doc.style("matt-yta-" + c.slice(1), c, "Måttyta", 0.6) : doc.style("matt-" + c.slice(1), c, "Mått")); return stC.get(k); };
  const W1 = (t, h) => ifcTextStrokes(t).width * h / 6;
  // Rör från a till b (relativt elementets punkt o), cirkelprofil med radie rad.
  // ext: förläng röret med radien i båda ändar – då möts rören i en måttkedja utan glipa i hörnen.
  const tube = (a0, b0, rad, st = red, ext = false) => {
    const v0 = [b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]], L0 = Math.hypot(...v0);
    if (L0 < 1e-4) return null;
    const e = ext ? rad : 0, u = v0.map(x => x / L0), a = a0.map((x, i) => x - u[i] * e), b = b0.map((x, i) => x + u[i] * e);
    const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...v);
    const ax = v.map(x => x / L), ref = Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    // refDirection vinkelrät mot axeln.
    const dt = ref[0] * ax[0] + ref[1] * ax[1] + ref[2] * ax[2], rf = [ref[0] - dt * ax[0], ref[1] - dt * ax[1], ref[2] - dt * ax[2]], rl = Math.hypot(...rf);
    const s = E(`IFCEXTRUDEDAREASOLID(${E(`IFCCIRCLEPROFILEDEF(.AREA.,$,$,${ifcNum(rad)})`)},${E(`IFCAXIS2PLACEMENT3D(${E(`IFCCARTESIANPOINT(${ifcPt(a)})`)},${dir(ax)},${dir(rf.map(x => x / rl))})`)},${dir([0, 0, 1])},${ifcNum(L)})`);
    E(`IFCSTYLEDITEM(${s},(${st}),$)`);
    return s;
  };
  // Ändpunkt: en kort tjockare cylinder längs linjen.
  const dotAt = (p, ax) => { const h = L3M_IFC.dot; return tube(p.map((x, i) => x - ax[i] * h), p.map((x, i) => x + ax[i] * h), L3M_IFC.dot); };
  list.forEach(({ m, nr }) => {
    const P = m.pts, o = P[0], rel = p => [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
    const items = [];
    const DP = l3mDimPts(m);
    const segs = m.kind === "area" ? P.map((p, i) => [p, P[(i + 1) % P.length]]) : m.kind === "dist" && m.off ? [[P[0], DP[0]], [DP[0], DP[1]], [DP[1], P[1]]] : P.slice(1).map((p, i) => [P[i], p]);
    const offd = l3mCanOff(m) && m.off;
    // Måttlinjen/kedjan som ett rör med rundade brytningar, och en kon på varje mätpunkt.
    const way = offd ? [P[0], ...DP, P[P.length - 1]] : P;
    const path = m.kind === "point" ? [] : l3mFillet(way.map(rel), m.kind === "area" || m.kind === "volume", L3M_IFC.bend);
    const tri = (g, st) => { if (!g.pts.length) return null; const pl = E(`IFCCARTESIANPOINTLIST3D((${g.pts.map(v => ifcPt([v.x, v.y, v.z])).join(",")}))`), fs = E(`IFCTRIANGULATEDFACESET(${pl},$,.T.,(${g.tris.map(t => `(${t.join(",")})`).join(",")}),$)`); E(`IFCSTYLEDITEM(${fs},(${st}),$)`); return fs; };
    const meshItems = [];
    const own = m.kind === "volume" && /^#[0-9a-f]{6}$/i.test(m.color || ""), mRed = own ? stOf(m.color) : red, mFill = own ? stOf(m.color, true) : fillSt;
    if (path.length >= 2) { const t = tri(l3mSweep(path, L3M_IFC.r), mRed); if (t) meshItems.push(t); }
    // Utdragen polylinje: hjälplinjer även från mellanpunkterna upp till kedjan.
    if (offd) for (let i = 1; i < P.length - 1; i++) { const t = tri(l3mSweep([rel(P[i]), rel(DP[i])].map(v => new THREE.Vector3(v[0], v[1], v[2])), L3M_IFC.r * 0.6), red); if (t) meshItems.push(t); }
    P.forEach(p => { const v = rel(p), t = tri(l3mCone({ x: v[0], y: v[1], z: v[2] }, L3M_IFC.cone.h, L3M_IFC.cone.r), mRed); if (t) meshItems.push(t); });
    void segs; void dotAt;
    if (m.kind === "volume" && P.length >= 3) {
      // Volymen som en halvgenomskinlig prisma.
      const h = Number(m.h) || 0, zAvg = P.reduce((s2, p) => s2 + p[2], 0) / P.length - o[2];
      const poly = E(`IFCPOLYLINE((${[...P, P[0]].map(p => E(`IFCCARTESIANPOINT(${ifcPt([p[0] - o[0], p[1] - o[1]])})`)).join(",")}))`);
      const vol = E(`IFCEXTRUDEDAREASOLID(${E(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${poly})`)},${E(`IFCAXIS2PLACEMENT3D(${E(`IFCCARTESIANPOINT(${ifcPt([0, 0, zAvg + Math.min(0, h)])})`)},$,$)`)},${dir([0, 0, 1])},${ifcNum(Math.max(0.001, Math.abs(h)))})`);
      E(`IFCSTYLEDITEM(${vol},(${mFill}),$)`); items.push(vol);
    }
    if (m.kind === "area" && P.length >= 3) {
      const zAvg = P.reduce((s2, p) => s2 + p[2], 0) / P.length - o[2];
      const poly = E(`IFCPOLYLINE((${[...P, P[0]].map(p => E(`IFCCARTESIANPOINT(${ifcPt([p[0] - o[0], p[1] - o[1]])})`)).join(",")}))`);
      const fill = E(`IFCEXTRUDEDAREASOLID(${E(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${poly})`)},${E(`IFCAXIS2PLACEMENT3D(${E(`IFCCARTESIANPOINT(${ifcPt([0, 0, zAvg])})`)},$,$)`)},${dir([0, 0, 1])},0.01)`);
      E(`IFCSTYLEDITEM(${fill},(${fillSt}),$)`); items.push(fill);
    }
    const inf = l3mInfo(m), name = `Mått ${nr}: ${m.text}${withNotes && m.note ? " – " + m.note : ""}`;
    // Skylten med måttet (och kommentaren) – vit platta strax ovanför mitten, 3D-text på båda sidor.
    const raw = withNotes && m.note ? (typeof wrapText === "function" ? wrapText(m.note, 30) : m.note).split("\n").filter(Boolean).slice(0, 3) : [];
    const lines = [{ t: m.text, h: L3M_IFC.h1 }, ...raw.map(t => ({ t, h: L3M_IFC.h2 }))];
    const W = Math.max(0.6, ...lines.map(l => W1(l.t, l.h))) + L3M_IFC.pad * 2, H = lines.reduce((a, l) => a + l.h * 1.4, 0) + L3M_IFC.pad * 1.4;
    const at = m.kind === "point" ? P[0] : m.kind === "volume" ? (c => [c[0], c[1], c[2] + Math.max(0, Number(m.h) || 0)])(P.reduce((s2, p) => [s2[0] + p[0] / P.length, s2[1] + p[1] / P.length, s2[2] + p[2] / P.length], [0, 0, 0])) : m.kind === "poly" ? l3mPathMid(DP).toArray() : m.kind === "angle" ? P[1] : m.kind === "dist" ? [(DP[0][0] + DP[1][0]) / 2, (DP[0][1] + DP[1][1]) / 2, (DP[0][2] + DP[1][2]) / 2] : P.reduce((s2, p) => [s2[0] + p[0] / P.length, s2[1] + p[1] / P.length, s2[2] + p[2] / P.length], [0, 0, 0]);
    const center = [at[0], at[1], (m.kind === "area" ? Math.max(...P.map(p => p[2])) : at[2]) + L3M_IFC.lift + H / 2];
    // Vit linje från skylten ner till måttlinjen – visar att skylten hör till måttet (Victor 2026-10-10).
    const lead = tube(rel(at), rel([at[0], at[1], center[2] - H / 2]), 0.012, white);
    if (lead) items.push(lead); // hör till måttets element
    // Rör och konor som trianglar (Tessellation), platta och ledlinje som extruderade (SweptSolid).
    const reps = [];
    if (items.length) reps.push(E(`IFCSHAPEREPRESENTATION(${doc.body},'Body','SweptSolid',(${items.join(",")}))`));
    if (meshItems.length) reps.push(E(`IFCSHAPEREPRESENTATION(${doc.body},'Body','Tessellation',(${meshItems.join(",")}))`));
    const el = doc.proxy(name.slice(0, 120), withNotes ? m.note || "" : "", "4D-mått", doc.place(o), E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${reps.join(",")}))`), m.id);
    elems.push(el);
    doc.props(el, [["Typ", L3M_KIND[m.kind] || m.kind], ["Värde", m.text], ...(withNotes ? [["Kommentar", m.note || ""]] : []), ["Nummer", nr],
      ...inf.rows.filter(([k]) => k !== "Status").map(([k, v]) => [k, String(v).replace(/\n/g, ", ")]), ["Arbetsyta", plan ? plan.name || "" : ""]]);
    const axes = (p, rx, ry, nx, ny) => E(`IFCLOCALPLACEMENT(${doc.sitePl},${E(`IFCAXIS2PLACEMENT3D(${E(`IFCCARTESIANPOINT(${ifcPt(p)})`)},${dir([nx, ny, 0])},${dir([rx, ry, 0])})`)})`);
    const board = E(`IFCEXTRUDEDAREASOLID(${E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${ifcNum(W)},${ifcNum(H)})`)},${E(`IFCAXIS2PLACEMENT3D(${E(`IFCCARTESIANPOINT(${ifcPt([0, 0, -L3M_IFC.T / 2])})`)},$,$)`)},${dir([0, 0, 1])},${ifcNum(L3M_IFC.T)})`);
    E(`IFCSTYLEDITEM(${board},(${white}),$)`);
    const bEl = doc.proxy(`${name.slice(0, 100)} – skylt`, "Skylt", "4D-måttskylt", axes(center, r[0], r[1], n[0], n[1]), doc.shape(board, "SweptSolid"), m.id);
    elems.push(bEl);
    [[1, 1], [-1, -1]].forEach(([sr, sn]) => {
      const meshes = [];
      let y = H / 2 - L3M_IFC.pad * 0.7;
      lines.forEach(({ t, h }, li) => { const msh = ifcTextSolid(doc, t, { h, t: L3M_IFC.tT, rx: 1, ry: 0, start: -W / 2 + L3M_IFC.pad, across: y - h / 2, style: li ? doc.textStyle : red }); if (msh) meshes.push(msh); y -= h * 1.4; });
      if (!meshes.length) return;
      const p = [center[0] + sn * n[0] * L3M_IFC.T / 2, center[1] + sn * n[1] * L3M_IFC.T / 2, center[2]];
      elems.push(doc.proxy(`${name.slice(0, 100)} – text`, "Text", "4D-måtttext", axes(p, sr * r[0], sr * r[1], sn * n[0], sn * n[1]), doc.shape(meshes.join(","), "Tessellation"), m.id));
    });
  });
  const d2 = new Date(), p2 = x => String(x).padStart(2, "0");
  const fileName = `Mått ${plan ? plan.name : ""} ${d2.getFullYear()}-${p2(d2.getMonth() + 1)}-${p2(d2.getDate())} kl ${p2(d2.getHours())}.${p2(d2.getMinutes())}.${p2(d2.getSeconds())}.ifc`.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ");
  const fn = typeof tcUniqueName === "function" ? tcUniqueName(fileName) : fileName;
  return { text: doc.finish(elems, fn), fileName: fn, n: list.length };
}
/* ids: bara de måtten (markerade); annars alla. Ny fil i TC (mappen Lägesplan) varje gång. */
async function l3mExportIfc(ids) {
  const want = ids ? new Set(ids) : null;
  const list = l3m.list.map((m, i) => ({ m, nr: i + 1 })).filter(({ m }) => want ? want.has(m.id) : (typeof l3aOn !== "function" || l3aOn(m)));
  if (!list.length) { l3Status("Inga mått att exportera.", true); return null; }
  const withNotes = l3Prefs().measExpNotes !== false;
  const r = l3mIfcBuild(list, withNotes);
  const file = new File([new TextEncoder().encode(r.text)], r.fileName, { type: "application/x-step" });
  const key = "mifc";
  busyProgress(key, `Sparar ${r.fileName}`, 0.3);
  try {
    if (!window.opener || window.opener.closed) throw new Error("öppna lägesplanen via 4D-planering för att spara i Trimble Connect");
    const up = await askOpener("tcUpload", { folder: "Lägesplan", files: [file] }, 10 * 60 * 1000);
    busyProgress(key, "", null);
    l3Toast(`${r.n} mått sparade som 3D-objekt i Trimble Connect${withNotes ? " (med kommentarer)" : ""}: ${r.fileName}${up && up.folder ? ` (${up.folder})` : ""}.`, null, null, 9000);
    return r;
  } catch (e) { busyProgress(key, "", null); l3Status("Kunde inte spara måtten som IFC: " + e.message, true); throw e; }
}

/* Visa/dölj kommentarerna efter måtten i 3D för alla mått på en gång (Victor 2026-10-10). Sparade mått
   skrivs i en enda ändring. */
function l3mNotesAll(on) {
  const ch = l3m.list.filter(m => m.note && !!m.showNote !== on);
  if (!ch.length) { l3Status(on ? "Alla måttkommentarer visas redan." : "Inga måttkommentarer visas."); return; }
  ch.forEach(m => { m.showNote = on; });
  const apply = v => { ch.forEach(m => { m.showNote = v; }); l3mDraw(); l3kRenderTab(); l3mWriteMany(ch); };
  if (typeof l3VPush === "function") l3VPush(() => apply(!on), () => apply(on), on ? "visa måttkommentarer" : "dölj måttkommentarer");
  l3mDraw(); l3kRenderTab(); l3mWriteMany(ch);
  l3Status(`${ch.length} måttkommentarer ${on ? "visas" : "är dolda"} i 3D.`);
}
function l3mWriteMany(list) {
  const recs = list.filter(m => m.saved).map(({ saved, hid, ...x }) => x);
  if (!recs.length) return;
  const ids = new Set(recs.map(x => x.id));
  ghWriteJSON(token, l3mPath(), arr => [...(Array.isArray(arr) ? arr : []).filter(x => !ids.has(x.id)), ...recs], "3D: måttkommentarer").catch(e => l3Status("Kunde inte spara: " + e.message, true));
}
