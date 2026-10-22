/* Mobilkranen lyfter objekt ur modellen (Victor 2026-10-22: "visualisera montage av prefabpelare, prefabbalkar och prefabelement … ta tag i 3D-objekten med kranen,
   lyfta och flytta runt dem"). Sänk kroken ned mot ett objekt (eller markera objekt först) och tryck H: objektet hakas i kroken med slingor, pendlar lite när kranen
   svänger, kan vridas med , och . (eller knapparna) och sätts ner med H. Släppet blir en vanlig flytt i modellen (Ångra, och "Spara som ny IFC" i Trimble Connect
   som för andra flyttade objekt) – bygger på samma sessions-grupp som Flytta (l3bmStart med crane). */
const l3lift = { s: null, rig: null, cur: null, yaw: 0, h: 0, ext: null, supT: 0, supZ: null, last: 0 };
function l3liftHookPos() {
  const a = l3w.av; if (!a || !a.hookObj) return null; a.g.updateMatrixWorld(true);
  return a.hookObj.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0, -0.55));
}
const l3liftOk = x => x.object.visible && !x.object.userData.noHit && x.object.type !== "LineSegments" && x.object.type !== "Line" && (typeof l3VisibleChain !== "function" || l3VisibleChain(x.object));
/* Underlagets höjd under lasten (högsta träffen av fem strålar: mitten och hörnen) – lasten hänger aldrig under marken eller ner i andra objekt. */
function l3liftSupport(G, x, y, zTop) {
  const surf = l3Surfaces(), ex = l3lift.ext, pts = [[0, 0], [ex.x, ex.y], [-ex.x, ex.y], [ex.x, -ex.y], [-ex.x, -ex.y]], cs = Math.cos(G.rotation.z), sn = Math.sin(G.rotation.z); let best = typeof l3GroundZ === "function" ? l3GroundZ() : -1e9;
  pts.forEach(([px, py]) => { const o = new THREE.Vector3(x + px * cs - py * sn, y + px * sn + py * cs, zTop), rc = new THREE.Raycaster(o, new THREE.Vector3(0, 0, -1), 0, 400); rc.firstHitOnly = true; const h = rc.intersectObjects(surf, true).find(l3liftOk); if (h && h.point.z > best) best = h.point.z; });
  return best;
}
function l3liftGrab() {
  if (l3lift.s) { l3liftRelease(); return; }
  if (!l3w.on || l3w.kind !== "crane" || !l3w.workOn) { l3Status("Res kranen först (X, fäll ut stödben och bom) – sedan hakar du i objekt med H.", true); return; }
  if (l3bm.session) { l3Status("Avsluta pågående flytt först.", true); return; }
  const hp = l3liftHookPos(); if (!hp) return;
  let ents = null; const rc = new THREE.Raycaster(hp.clone().add(new THREE.Vector3(0, 0, 0.5)), new THREE.Vector3(0, 0, -1), 0, 4); rc.firstHitOnly = true;
  const h = rc.intersectObjects(l3Surfaces(), true).find(l3liftOk), e = h && l3bsFromHit(h);
  if (e && e.mesh.userData.l3b.ranges[e.ri].guid) { ents = l3bs.sel.some(s => s.mesh === e.mesh && s.ri === e.ri) ? l3bs.sel.map(s => ({ mesh: s.mesh, ri: s.ri })) : [{ mesh: e.mesh, ri: e.ri }]; }
  if (!ents && l3bs.sel.length) ents = l3bs.sel.map(s => ({ mesh: s.mesh, ri: s.ri }));
  if (!ents) { l3Status("Inget att haka i: sänk kroken (Lina) ner mot ett objekt i modellen och tryck H – eller markera objekt först.", true); return; }
  l3bsSet(ents); l3bmStart({ crane: true });
  const s = l3bm.session; if (!s) return; l3lift.s = s; const G = s.G, b = new THREE.Box3().setFromObject(G);
  l3lift.h = Math.max(0.3, b.max.z - G.position.z); l3lift.ext = { x: Math.max(0.1, (b.max.x - b.min.x) / 2), y: Math.max(0.1, (b.max.y - b.min.y) / 2) }; l3lift.yaw = 0; l3lift.cur = G.position.clone().add(new THREE.Vector3(0, 0, 0.3)); l3lift.supZ = null;
  const pts = []; for (let i = 0; i < 4; i++) pts.push(new THREE.Vector3(), new THREE.Vector3()); const rg = new THREE.BufferGeometry().setFromPoints(pts), rig = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xffd23f })); rig.frustumCulled = false; rig.userData.noHit = true; rig.userData.noIfc = true; rig.raycast = () => {}; rig.renderOrder = 7; l3.scene.add(rig); l3lift.rig = rig;
  l3Status(`Haktade i ${ents.length} objekt. Kör/sväng kranen för att flytta, ‹ › (, .) vrider lasten, H sätter ner den.`); l3wCtlPanel(); l3Render();
}
function l3liftRig() { if (l3lift.rig) { l3.scene.remove(l3lift.rig); l3lift.rig.geometry.dispose(); l3lift.rig.material.dispose(); l3lift.rig = null; } }
function l3liftRelease(silent) {
  const s = l3lift.s; if (!s) return; const G = s.G;
  if (l3bm.session === s) { // sätt ner: på underlaget under lasten
    const z = l3liftSupport(G, G.position.x, G.position.y, G.position.z + l3lift.h + 60); G.position.z = Math.max(z, -1e6) + 0.01; G.rotation.x = G.rotation.y = 0; G.updateMatrix();
  }
  l3liftRig(); l3lift.s = null;
  if (l3bm.session === s) l3bmAccept();
  if (!silent) l3wCtlPanel();
}
function l3liftYaw(d) { if (!l3lift.s) return; l3lift.yaw += d; }
/* Varje bildruta (anropas efter att kranen uppdaterats): lasten hänger under kroken med lite fördröjning och pendling. */
function l3liftUpdate() {
  const s = l3lift.s; if (!s) return;
  if (l3bm.session !== s || !l3w.on || l3w.kind !== "crane") { l3liftRig(); l3lift.s = null; if (l3bm.session === s) l3bmCancel(); return; }
  const now = performance.now(), dt = Math.min(0.1, (now - (l3lift.last || now)) / 1000); l3lift.last = now;
  const hp = l3liftHookPos(); if (!hp) return; const G = s.G, SL = 1.5, tgt = new THREE.Vector3(hp.x, hp.y, hp.z - SL - l3lift.h), k = 1 - Math.exp(-dt * 6), prev = l3lift.cur.clone();
  l3lift.cur.lerp(tgt, k);
  if (now - l3lift.supT > 90) { l3lift.supT = now; l3lift.supZ = l3liftSupport(G, l3lift.cur.x, l3lift.cur.y, l3lift.cur.z + l3lift.h + 40); }
  const touching = l3lift.supZ != null && l3lift.cur.z < l3lift.supZ + 0.02; if (touching) l3lift.cur.z = l3lift.supZ + 0.02;
  G.position.copy(l3lift.cur); const vx = (l3lift.cur.x - prev.x) / Math.max(dt, 1e-3), vy = (l3lift.cur.y - prev.y) / Math.max(dt, 1e-3);
  G.rotation.z += (l3lift.yaw - G.rotation.z) * Math.min(1, dt * 5); G.rotation.x = touching ? 0 : Math.max(-0.1, Math.min(0.1, vy * 0.02)); G.rotation.y = touching ? 0 : Math.max(-0.1, Math.min(0.1, -vx * 0.02)); G.updateMatrix(); G.updateMatrixWorld(true);
  const a = l3lift.rig.geometry.attributes.position, ex = l3lift.ext, hk = hp.clone(); let i = 0;
  [[ex.x, ex.y], [-ex.x, ex.y], [-ex.x, -ex.y], [ex.x, -ex.y]].forEach(([px, py]) => { const c = new THREE.Vector3(px, py, l3lift.h).applyMatrix4(G.matrixWorld); a.setXYZ(i++, hk.x, hk.y, hk.z); a.setXYZ(i++, c.x, c.y, c.z); });
  a.needsUpdate = true; l3lift.rig.geometry.computeBoundingSphere();
  const rel = Math.max(0, G.position.z - (l3lift.supZ != null ? l3lift.supZ : G.position.z));
  if (l3w.info) { l3w.info = l3w.info.filter(r => r[0] !== "Last"); l3w.info.push(["Last", `${l3bs.sel.length || s.ents.length} obj. · ${rel.toFixed(1).replace(".", ",")} m över underlaget`]); }
  l3Render();
}
