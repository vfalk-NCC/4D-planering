/* Stomme: delarna snappar till varandra som i Tekla (Victor 2026-10-24).
   Varje del har 27 fästpunkter (hörn, kantmitter, sidornas mitt och centrum) i sin egen låda. Medan en del dras flyttas den så att den
   närmaste fästpunkten hamnar exakt på en fästpunkt hos en annan del (gul markering visar var), och vrids den nästan parallellt med
   en annan del (±4°) rätar den upp sig. Snäpp-switchen finns i flytthandtagets rullgardin. */
const L3F_RE = /^sm:stom/;
const l3f = { mark: null };
const l3fOn = () => l3Prefs().fSnap !== false;
function l3fBox(p) { const d = typeof smDef === "function" ? smDef(p) : null; return d && d.box ? d.box(p) : null; }
/* Fästpunkterna (världskoordinater) för en del i en given pose. */
function l3fAnchors(p, pose) {
  const bx = l3fBox(p); if (!bx) return [];
  const [L, W, H] = bx, pitch = ((smF(p, "stand", "") === "Stående" ? 90 : 0) + smN(p, "lutning", 0)) * Math.PI / 180, roll = smN(p, "rull", 0) * Math.PI / 180, R = TK.rot(0, -pitch, roll);
  const rot = ([x, y, z]) => [R[0][0] * x + R[0][1] * y + R[0][2] * z, R[1][0] * x + R[1][1] * y + R[1][2] * z, R[2][0] * x + R[2][1] * y + R[2][2] * z];
  let zmin = Infinity; [-1, 1].forEach(i => [-1, 1].forEach(j => [0, 1].forEach(k => { zmin = Math.min(zmin, rot([i * L / 2, j * W / 2, k * H])[2]); })));
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw), out = [];
  [-1, 0, 1].forEach(i => [-1, 0, 1].forEach(j => [0, 0.5, 1].forEach(k => { const q = rot([i * L / 2, j * W / 2, k * H]); out.push([pose.x + q[0] * c - q[1] * s, pose.y + q[0] * s + q[1] * c, pose.z + q[2] - zmin, Math.abs(i) + Math.abs(j) + (k === 0.5 ? 0 : 1)]); })));
  return out;
}
const l3fPose = p => ({ x: p.x, y: p.y, z: (Number(p.z) || 0) + (Number(p.dz) || 0), yaw: (Number(p.rot) || 0) * Math.PI / 180 });
function l3fTol() { const t = l3.gizmo && l3.gizmo.object ? l3.gizmo.object.position : l3.orbit && l3.orbit.target; return Math.min(1.2, Math.max(0.2, (t ? l3.camera.position.distanceTo(t) : 20) * 0.03)); }
/* Närmast liggande fästpar: { d: [dx,dy,dz], at: [x,y,z], fix } eller null. */
function l3fFind(p, pose) {
  const others = placements.filter(q => q !== p && q.id !== p.id && L3F_RE.test(String(q.type))); if (!others.length) return null;
  const tol = l3fTol(), r = Math.max(p.L || 0, p.B || 0, p.H || 0); let best = null, near = null, nd = Infinity;
  others.forEach(q => { const d = Math.hypot(q.x - pose.x, q.y - pose.y); if (d < nd && d < (r + (q.L || 0)) / 2 + 4) { nd = d; near = q; } });
  if (near && l3.gizmo.mode === "translate") { let dy = ((pose.yaw - (Number(near.rot) || 0) * Math.PI / 180) * 180 / Math.PI) % 90; if (dy > 45) dy -= 90; if (dy < -45) dy += 90; if (Math.abs(dy) > 0.01 && Math.abs(dy) < 4) pose = { ...pose, yaw: pose.yaw - dy * Math.PI / 180, fix: -dy }; }
  const mine = l3fAnchors(p, pose);
  others.forEach(q => { if (Math.hypot(q.x - pose.x, q.y - pose.y) > (r + (q.L || 0)) / 2 + tol + 2) return;
    l3fAnchors(q, l3fPose(q)).forEach(b => mine.forEach(a => { const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], d = Math.hypot(dx, dy, dz) + (a[3] + b[3]) * 0.004; if (d < tol && (!best || d < best.score)) best = { score: d, d: [dx, dy, dz], at: [b[0], b[1], b[2]] }; })); });
  if (best) best.fix = pose.fix || 0; else if (pose.fix) best = { score: 0, d: [0, 0, 0], at: null, fix: pose.fix };
  return best;
}
function l3fMark(at) {
  if (!at) { if (l3f.mark) l3f.mark.visible = false; return; }
  if (!l3f.mark) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xfacc15, depthTest: false, transparent: true, opacity: 0.95 })); m.renderOrder = 12; m.raycast = () => {}; m.userData.noHit = true; l3.scene.add(m); l3f.mark = m; }
  const m = l3f.mark; m.visible = true; m.position.set(at[0] - l3.O[0], at[1] - l3.O[1], at[2] - l3.O[2]); m.scale.setScalar(Math.max(0.05, l3.camera.position.distanceTo(m.position) * 0.012));
}
/* Medan man drar: flytta handtagets objekt så att fästpunkterna sammanfaller. */
function l3fLive() {
  const g = l3.gizmo.object, p = g && placements.find(x => x.id === g.userData.placeId); if (!p || !L3F_RE.test(String(p.type)) || !l3fOn() || l3gz.axis === "z") return l3fMark(null);
  const pose = { x: g.position.x + l3.O[0], y: g.position.y + l3.O[1], z: g.position.z + l3.O[2], yaw: g.rotation.z }, hit = l3fBox(p) && l3fFind(p, pose);
  if (!hit) return l3fMark(null);
  if (hit.fix) g.rotation.z += hit.fix * Math.PI / 180; g.position.x += hit.d[0]; g.position.y += hit.d[1]; g.position.z += hit.d[2]; l3fMark(hit.at);
}
/* Nyligen placerad del: snäpp mot närmaste fästpunkt direkt. */
function l3fSnapNew(p) {
  if (!p || !L3F_RE.test(String(p.type)) || !l3fOn()) return;
  const bx = l3fBox(p); if (bx) { p.L = bx[0]; p.B = bx[1]; p.H = bx[2]; }
  const hit = l3fFind(p, l3fPose(p)); if (!hit) return;
  if (hit.fix) p.rot = ((Number(p.rot) || 0) + hit.fix + 360) % 360; p.x = placeR3(p.x + hit.d[0]); p.y = placeR3(p.y + hit.d[1]); p.dz = placeR3((Number(p.dz) || 0) + hit.d[2]);
}
(function () {
  if (typeof l3FromGizmo === "function") { const f = l3FromGizmo; l3FromGizmo = function () { try { l3fLive(); } catch (e) { console.warn(e); } return f.apply(this, arguments); }; }
  if (typeof l3DragEnd === "function") { const f = l3DragEnd; l3DragEnd = function () { l3fMark(null); return f.apply(this, arguments); }; }
  if (typeof l3GzPopHtml === "function") { const f = l3GzPopHtml; l3GzPopHtml = function () {
    const r = f.apply(this, arguments), pop = document.getElementById("v3GzP"), o = l3.gizmo && l3.gizmo.object, p = o && placements.find(x => x.id === o.userData.placeId);
    if (pop && l3gz.open && p && L3F_RE.test(String(p.type)) && !pop.querySelector("#v3FSnap")) { pop.insertAdjacentHTML("afterbegin", `<label class="v3-lay-sw-row" title="Delen snappar hörn, kanter och ytor mot andra stomdelar och rätas upp mot dem"><span>Snäpp mot andra delar</span><span class="v3-lay-sw"><input type="checkbox" role="switch" id="v3FSnap" ${l3fOn() ? "checked" : ""} /><i></i></span></label>`); pop.querySelector("#v3FSnap").onchange = e => { l3SetPref("fSnap", e.target.checked); if (!e.target.checked) l3fMark(null); }; }
    return r; }; }
})();
