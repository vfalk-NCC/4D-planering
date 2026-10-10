/* 3D-vyn – mått som ligger kvar och kan sparas (Victor 2026-10-10: "Måtten ska också ligga kvar och man
   ska ha möjlighet att spara dom"; "när man håller inne shift med mätverktyget ska den hoppa 5 grader åt
   gången så att man kan mäta i raka linjer").

   – Varje färdigt mått (avstånd, vinkel, yta) ligger kvar i vyn med sin etikett, även efter att man
     bytt verktyg. Listan Mått (i fästraden när Mät är valt, och under Lager) tar bort, döljer och sparar.
   – Spara i projektet: projects/<id>/plan_measures.json (egen fil, sammanslagen per mått-id), så att
     måtten finns kvar nästa gång och för andra i projektet. Osparade mått finns kvar tills sidan stängs.
   – Skift med mätverktyget: riktningen från förra punkten hoppar 5° åt gången (vågrätt), höjden följer
     fästpunkten. */

const l3m = { list: [], loaded: false, hidden: false, labels: new Map() };
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
function l3mAdd(kind, pts, text) {
  const m = { id: ghNewId(), plan: plan && plan.id, kind, text, pts: pts.map(p => [p.x + l3.O[0], p.y + l3.O[1], p.z + l3.O[2]].map(v => Math.round(v * 1000) / 1000)), at: new Date().toISOString(), by: (settings && settings.userName) || null, saved: false };
  l3m.list.push(m);
  l3m.hidden = false;
  l3mDraw();
  l3mRenderBar();
  return m;
}
function l3mDraw() {
  if (!l3) return;
  if (!l3.groups.measKeep) { const g = new THREE.Group(); g.name = "measKeep"; l3.groups.measKeep = g; l3.scene.add(g); }
  const grp = l3.groups.measKeep;
  l3Clear(grp);
  const host = l3.renderer.domElement.parentElement;
  l3m.labels.forEach(el => el.remove()); l3m.labels.clear();
  grp.visible = !l3m.hidden;
  l3m.list.forEach(m => {
    const P = m.pts.map(p => new THREE.Vector3(p[0] - l3.O[0], p[1] - l3.O[1], p[2] - l3.O[2]));
    const col = m.saved ? 0x2563eb : 0xdc2626;
    const line = (a, b) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: col, depthTest: false })); l.renderOrder = 10; l.userData.noHit = true; l.raycast = () => {}; grp.add(l); };
    for (let i = 1; i < P.length; i++) line(P[i - 1], P[i]);
    if (m.kind === "area" && P.length > 2) {
      line(P[P.length - 1], P[0]);
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(P.map(p => new THREE.Vector2(p.x, p.y)))), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false }));
      fill.position.z = P.reduce((s, p) => s + p.z, 0) / P.length + 0.02; fill.userData.noHit = true; fill.raycast = () => {}; grp.add(fill);
    }
    const pts = new THREE.Points(new THREE.BufferGeometry().setFromPoints(P), new THREE.PointsMaterial({ color: col, size: 6, sizeAttenuation: false, depthTest: false }));
    pts.renderOrder = 11; pts.userData.noHit = true; pts.raycast = () => {}; grp.add(pts);
    const at = m.kind === "angle" ? P[1] : m.kind === "area" ? P.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / P.length) : P[0].clone().add(P[P.length - 1]).multiplyScalar(0.5);
    const el = document.createElement("div");
    el.className = "v3-meas v3-meas-keep" + (m.saved ? " saved" : "");
    el.textContent = m.text; el.dataset.mid = m.id;
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
    if (l3m.hidden) { el.style.display = "none"; return; }
    const q = l3ToScreen(el._at);
    el.style.display = q.behind ? "none" : "block"; el.style.left = q.x + "px"; el.style.top = q.y + "px";
  });
}
function l3mRemove(id) {
  const m = l3m.list.find(x => x.id === id); if (!m) return;
  l3m.list = l3m.list.filter(x => x.id !== id);
  if (m.saved) ghWriteJSON(token, l3mPath(), arr => (Array.isArray(arr) ? arr : []).filter(x => x.id !== id), "3D: mått borttaget").catch(e => l3Status("Kunde inte ta bort måttet ur projektet: " + e.message, true));
  if (typeof l3VPush === "function") l3VPush(() => { l3m.list.push(m); if (m.saved) l3mSave([m]); l3mDraw(); l3mRenderBar(); }, () => l3mRemove(id), "ta bort mått");
  l3mDraw(); l3mRenderBar();
}
async function l3mSave(only) {
  const list = (only || l3m.list.filter(x => !x.saved));
  if (!list.length) { l3Status("Alla mått är redan sparade."); return; }
  const recs = list.map(({ saved, ...x }) => x), ids = new Set(recs.map(x => x.id));
  try {
    await ghWriteJSON(token, l3mPath(), arr => [...(Array.isArray(arr) ? arr : []).filter(x => !ids.has(x.id)), ...recs], `3D: ${recs.length} mått sparade`);
    list.forEach(x => { x.saved = true; });
    l3Toast(`${recs.length} mått sparade i projektet – de finns kvar nästa gång.`);
  } catch (e) { l3Status("Kunde inte spara måtten: " + e.message, true); }
  l3mDraw(); l3mRenderBar();
}
function l3mClearUnsaved() {
  const gone = l3m.list.filter(x => !x.saved);
  if (!gone.length) return;
  l3m.list = l3m.list.filter(x => x.saved);
  if (typeof l3VPush === "function") l3VPush(() => { l3m.list.push(...gone); l3mDraw(); l3mRenderBar(); }, () => { const s = new Set(gone); l3m.list = l3m.list.filter(x => !s.has(x)); l3mDraw(); l3mRenderBar(); }, "rensa mått");
  l3mDraw(); l3mRenderBar();
}
function l3mToggle(on) { l3m.hidden = on === undefined ? !l3m.hidden : !on; l3mDraw(); l3mRenderBar(); if (typeof l3LayersRender === "function") l3LayersRender(); }

/* Listan Mått: knapp i fästraden (när Mät är valt) med en meny. */
function l3mBarHtml() {
  const n = l3m.list.length, uns = l3m.list.filter(x => !x.saved).length;
  return `<span class="v3-snapbar-sep"></span><div class="v3-dd v3-mdd"><button type="button" id="v3MeasBtn" class="${l3m.open ? "on" : ""}" title="Måtten som ligger kvar – ta bort, dölj och spara">Mått ${n}${uns ? ` <em>${uns} osparade</em>` : ""} ▾</button>${l3m.open ? l3mMenuHtml() : ""}</div>`;
}
function l3mMenuHtml() {
  const esc = escHtml, K = { dist: "Avstånd", angle: "Vinkel", area: "Yta" };
  return `<div class="v3-pop v3-mpop">${l3m.list.length ? l3m.list.map(m => `<div class="v3-mrow"><i class="${m.saved ? "saved" : ""}" title="${m.saved ? "Sparad i projektet" : "Inte sparad"}"></i><button type="button" class="v3-mname" data-mzoom="${esc(m.id)}" title="Zooma till måttet">${K[m.kind] || ""} <b>${esc(m.text)}</b></button><button type="button" class="v3-ic" data-mdel="${esc(m.id)}" title="Ta bort måttet">${L3_ICO.trash}</button></div>`).join("") : `<div class="v3-pal-hint">Inga mått än. Mät avstånd, vinkel eller yta – måtten ligger kvar här.</div>`}
    <div class="v3-grp-acts"><button type="button" id="v3MeasSave" ${l3m.list.some(x => !x.saved) ? "" : "disabled"} title="Spara de osparade måtten i projektet (finns kvar nästa gång och för andra)">${L3_ICO.upload} Spara i projektet${l3m.list.some(x => !x.saved) ? ` (${l3m.list.filter(x => !x.saved).length})` : ""}</button>
    <button type="button" id="v3MeasHide">${l3m.hidden ? L3_ICO.eye + " Visa måtten" : L3_ICO.eyeOff + " Dölj måtten"}</button>
    <button type="button" id="v3MeasClr" ${l3m.list.some(x => !x.saved) ? "" : "disabled"}>${L3_ICO.trash} Rensa osparade</button></div></div>`;
}
function l3mRenderBar() { if (typeof l3RenderSnapBar === "function") l3RenderSnapBar(); if (typeof l3LayersRender === "function") l3LayersRender(); }
function l3mBindBar(bar) {
  const b = bar.querySelector("#v3MeasBtn");
  if (!b) return;
  b.onclick = e => { e.stopPropagation(); l3m.open = !l3m.open; l3mRenderBar(); };
  bar.querySelectorAll("[data-mdel]").forEach(x => { x.onclick = e => { e.stopPropagation(); l3mRemove(x.dataset.mdel); }; });
  bar.querySelectorAll("[data-mzoom]").forEach(x => { x.onclick = e => { e.stopPropagation(); const m = l3m.list.find(y => y.id === x.dataset.mzoom); if (!m) return; const b3 = new THREE.Box3(); m.pts.forEach(p => b3.expandByPoint(new THREE.Vector3(p[0] - l3.O[0], p[1] - l3.O[1], p[2] - l3.O[2]))); l3FlyTo(b3.getCenter(new THREE.Vector3()), Math.max(6, b3.getSize(new THREE.Vector3()).length() * 1.6)); }; });
  const sv = bar.querySelector("#v3MeasSave"); if (sv) sv.onclick = e => { e.stopPropagation(); l3mSave(); };
  const hd = bar.querySelector("#v3MeasHide"); if (hd) hd.onclick = e => { e.stopPropagation(); l3mToggle(); };
  const cl = bar.querySelector("#v3MeasClr"); if (cl) cl.onclick = e => { e.stopPropagation(); l3mClearUnsaved(); };
}
