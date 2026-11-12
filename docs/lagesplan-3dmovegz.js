/* Gemensamt flytthandtag för verktyg som bygger något innan det skapas (3D-text, Stödmur/pålar): pilar i X, Y och Z så att man kan flytta det fritt i sidled och höjdled
   (Victor 2026-11-12). Verktyget anropar l3mgShow(läge, { owner, move(dx,dy,dz), end() }) och l3mgHide(owner). Prefix l3mg. */
const l3mg = { proxy: null, last: null, cb: null, owner: null };
function l3mgInit() {
  if (l3.gizmoT || typeof THREE.TransformControls !== "function") return !!l3.gizmoT;
  const g = new THREE.TransformControls(l3.camera, l3.renderer.domElement); g.setSpace("world"); g.setMode("translate"); g.size = 0.8; g.userData.noHit = true; l3.scene.add(g); l3.gizmoT = g;
  l3mg.proxy = new THREE.Object3D(); l3.scene.add(l3mg.proxy);
  g.addEventListener("change", l3Render);
  g.addEventListener("dragging-changed", e => { l3.orbit.enabled = !e.value; if (typeof l3pcHold === "function") l3pcHold(!!e.value); if (!e.value && l3mg.cb && l3mg.cb.end) l3mg.cb.end(); });
  g.addEventListener("objectChange", () => { const P = l3mg.proxy.position, L = l3mg.last; if (!l3mg.cb || !L) return; const dx = P.x - L.x, dy = P.y - L.y, dz = P.z - L.z; L.copy(P); if (dx || dy || dz) l3mg.cb.move(dx, dy, dz); });
  return true;
}
function l3mgShow(abs, cb) {
  if (!l3 || !l3.scene || !l3mgInit()) return; const O = l3.O; l3mg.cb = cb; l3mg.owner = cb.owner || null;
  if (l3.gizmoT.dragging) return;   // under dragning rörs inte handtaget
  l3mg.proxy.position.set(abs[0] - O[0], abs[1] - O[1], abs[2] - O[2]); l3mg.last = l3mg.proxy.position.clone();
  if (l3.gizmo.object) l3.gizmo.detach(); if (l3.gizmoR && l3.gizmoR.object) l3.gizmoR.detach();
  if (l3.gizmoT.object !== l3mg.proxy) l3.gizmoT.attach(l3mg.proxy); l3Render();
}
function l3mgHide(owner) { if (!l3 || !l3.gizmoT) return; if (owner && l3mg.owner !== owner) return; if (l3.gizmoT.object) l3.gizmoT.detach(); l3mg.cb = null; l3mg.owner = null; l3Render(); }
