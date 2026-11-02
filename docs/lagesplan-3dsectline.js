/* Snittlinje som följer terrängen (Victor 2026-11-02): där ett lodrätt snitt (saxen eller profilklippet) skär punktmolnet ritas en röd, glödande linje i snittytans överkant – formad efter
   terrängen i stället för en rak linje. Höjden hämtas från de tända punktmolnen (annars översta IFC-träffen). Linjen byggs om en kort stund efter att snittet flyttats. */
const l3sl = { grp: null, key: "", t: 0, busy: false };
const l3slOn = () => l3Prefs().clipLine !== false;
function l3slKey() {
  if (!l3 || !l3.clips || !l3.clips.length || !l3slOn()) return "";
  const c = l3.camera ? l3.orbit.target : null, dist = l3.camera && c ? l3.camera.position.distanceTo(c) : 0;
  return l3.clips.filter(k => Math.abs(k.plane.normal.z) < 0.2).map(k => [k.plane.normal.x, k.plane.normal.y, k.plane.constant].map(v => v.toFixed(3)).join(",")).join("|") + "#" + Math.round(Math.log(Math.max(1, dist)) * 4) + "#" + (typeof l3pc !== "undefined" ? l3pc.clouds.filter(q => q.visible).length : 0);
}
function l3slClear() { if (!l3sl.grp) return; l3.scene.remove(l3sl.grp); l3sl.grp.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); l3sl.grp = null; }
function l3slCheck() {
  if (!l3 || !l3.scene) return; const k = l3slKey(); if (k === l3sl.key) return; l3sl.key = k;
  if (l3sl.grp) l3sl.grp.visible = false;   // gammal linje stämmer inte längre
  clearTimeout(l3sl.t); if (!k) { l3slClear(); return; } l3sl.t = setTimeout(l3slBuild, 220);
}
/* Höjd (m ö.h.) i världskoordinater: punktmolnets högsta punkt nära, annars översta IFC-träffen. */
function l3slZ(x, y, r) { let c = null; if (typeof l3spCloudSnap === "function" && typeof l3pc !== "undefined" && l3pc.clouds.some(q => q.visible)) { try { c = l3spCloudSnap(x, y, r); } catch (e) { c = null; } } if (c) return c[2]; try { return typeof l3spIfcSnap === "function" ? l3spIfcSnap(x, y) : null; } catch (e) { return null; } }
function l3slBuild() {
  if (l3sl.busy || !l3 || !l3.scene) return; l3sl.busy = true;
  try {
    l3slClear(); const clips = l3.clips.filter(k => Math.abs(k.plane.normal.z) < 0.2), O = l3.O, tg = l3.orbit.target, dist = l3.camera.position.distanceTo(tg), E = Math.max(40, Math.min(600, dist * 1.4)), N = 180, rad = Math.max(0.05, dist * 0.0035), grp = new THREE.Group();
    clips.forEach(k => {
      const n = new THREE.Vector3(k.plane.normal.x, k.plane.normal.y, 0).normalize(), d = new THREE.Vector3(-n.y, n.x, 0), dd = k.plane.distanceToPoint(new THREE.Vector3(tg.x, tg.y, 0)), c0 = new THREE.Vector3(tg.x, tg.y, 0).addScaledVector(n, -dd / (k.plane.normal.length() ? Math.hypot(k.plane.normal.x, k.plane.normal.y) : 1)), step = 2 * E / N, pts = []; let run = [];
      const flush = () => { if (run.length >= 2) pts.push(run); run = []; };
      for (let i = 0; i <= N; i++) { const p = c0.clone().addScaledVector(d, -E + i * step), z = l3slZ(p.x + O[0], p.y + O[1], Math.max(0.5, step * 0.8)); if (z == null) { flush(); continue; } run.push(new THREE.Vector3(p.x, p.y, z - O[2]).addScaledVector(n, rad * 1.1)); } flush();
      pts.forEach(r => {
        const curve = new THREE.CatmullRomCurve3(r, false, "centripetal"), geo = new THREE.TubeGeometry(curve, Math.min(600, r.length * 2), rad, 6, false);
        const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff1744, depthTest: false, transparent: true })), glow = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.min(600, r.length * 2), rad * 3.2, 8, false), new THREE.MeshBasicMaterial({ color: 0xff1744, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false }));
        [core, glow].forEach((m, i) => { m.renderOrder = 12 + i; m.userData.noHit = true; m.raycast = () => {}; grp.add(m); });
      });
    });
    if (grp.children.length) { l3.scene.add(grp); l3sl.grp = grp; } l3Render();
  } finally { l3sl.busy = false; }
}
(function () { if (typeof l3Render !== "function") return; const orig = l3Render; l3Render = function () { try { l3slCheck(); } catch (e) { /* bara en hjälplinje */ } return orig.apply(this, arguments); }; })();
