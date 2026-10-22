/* 3D-vyn – gå-läge (Victor 2026-10-12: "vy-läge där man kan släppa ner vyn så att det blir som POV där jag
   styr med WASD").

   Vyer → Gå runt (WASD)…: tryck där du vill stå – kameran släpps ner i ögonhöjd (1,7 m) och tittar åt samma håll
   som förut. W/S framåt/bakåt, A/D åt sidan, Q ner / E upp (rakt lodrätt), Skift springer, C smyger, piltangenterna vrider;
   dra med musen för att titta runt, hjulet ändrar farten. "Följ marken": kameran följer golv, mark, modeller
   och punktmoln under fötterna (trappsteg upp till 0,6 m). Esc eller ✕ avslutar – vyn blir vanlig 3D där du står.
   Bara perspektiv (parallell projektion stängs av medan man går). */

const l3w = { kind: "human", cfg: null, av: null, ownRot: 0, work: 0, workOn: false, travel: 0, t: 0, fv: 0, curV: 1.4, p: null, person: "first", ghost: true, run: false, crouchTog: false, crouch: 0, jz: 0, vz: 0, bz: 0, phase: 0, heading: 0, joy: false, jm: { x: 0, y: 0 }, jl: { x: 0, y: 0 }, avatar: null, cmtPick: false, on: false, picking: false, keys: new Set(), yaw: 0, pitch: 0, speed: 1.4, eye: 1.7, gz: null, raf: 0, last: 0, drag: null, hud: null };
const L3W_KEYS = new Set(["w", "a", "s", "d", "q", "e", "c", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift", "space"]);
/* Fysisk tangent först (WASD fungerar likadant på alla tangentbordslayouter), annars tecknet. */
const L3W_CODE = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", KeyQ: "q", KeyE: "e", KeyC: "c", ArrowUp: "arrowup", ArrowDown: "arrowdown", ArrowLeft: "arrowleft", ArrowRight: "arrowright", ShiftLeft: "shift", ShiftRight: "shift", Space: "space" };
const l3wKeyName = e => L3W_CODE[e.code] || String(e.key || "").toLowerCase();
/* Skrivfält (inte kryssrutor/knappar): där ska tangenterna skriva, inte gå. */
const l3wTyping = t => !!t && (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || (t.tagName === "INPUT" && !/^(checkbox|radio|button|range|submit|reset|color|file)$/i.test(t.type || "text")));
const l3wFollow = () => l3Prefs().walkFollow !== false;
const l3wCoarse = () => { try { return matchMedia("(pointer: coarse)").matches; } catch (e) { return false; } };

function l3wStart() {
  if (l3w.on) { l3wExit(); return; }
  l3HideMenus();
  l3w.picking = true;
  l3.renderer.domElement.style.cursor = "crosshair";
  l3Status("Gå runt: tryck där du vill stå (Esc avbryter).");
}
/* Trycket som väljer var man ställer sig (från l3Tap). */
function l3wTap(e) {
  l3w.picking = false; l3.renderer.domElement.style.cursor = "";
  const s = typeof l3Snap === "function" ? l3Snap(e) : null;
  let P = s && s.point;
  if (!P) { const h = typeof l3pcNearer === "function" ? l3pcNearer(e, l3Ray(e, l3Surfaces())[0]) : l3Ray(e, l3Surfaces())[0]; P = h && h.point; }
  if (!P) { try { const ray = l3MouseRay(e), pl = new THREE.Plane(new THREE.Vector3(0, 0, 1), -l3GroundZ()), p = new THREE.Vector3(); if (ray.intersectPlane(pl, p)) P = p; } catch (err) { /* okalibrerad */ } }
  if (!P) { l3Status("Ingen punkt där – tryck på marken eller ett objekt.", true); return true; }
  l3wEnter(P.clone());
  return true;
}
function l3wEnter(P) {
  if (typeof l3StopFly === "function") l3StopFly();
  if (l3.camera.isOrthographicCamera) { l3w.wasOrtho = true; l3SetProjection(false); }
  const d = l3.camera.getWorldDirection(new THREE.Vector3());
  l3w.yaw = Math.atan2(d.y, d.x); l3w.pitch = 0;
  if (!Number.isFinite(l3w.yaw) || Math.hypot(d.x, d.y) < 1e-3) l3w.yaw = Math.PI / 2; // rakt uppifrån: titta norrut
  l3w.on = true; l3w.keys.clear(); l3w.gz = P.z; l3w.jz = 0; l3w.vz = 0; l3w.crouch = 0; l3w.crouchTog = false; l3w.run = false; l3w.cmtPick = false; l3w.jm = { x: 0, y: 0 }; l3w.jl = { x: 0, y: 0 };
  { const pr = l3Prefs(); l3w.person = pr.walkPerson === "third" ? "third" : "first"; l3w.ghost = pr.walkGhost !== false; l3w.joy = pr.walkJoy == null ? l3wCoarse() : !!pr.walkJoy; l3w.kind = L3C_CFG[pr.walkKind] ? pr.walkKind : "human"; l3w.work = 0; l3w.workOn = false; l3w.travel = 0; l3w.fv = 0; l3w.cfg = L3C_CFG[l3w.kind]; if (l3w.kind === "own" && !(l3.sel && l3.sel.size)) { l3w.kind = "human"; l3w.cfg = L3C_CFG.human; } if (l3w.cfg.vehicle) { l3w.person = "third"; l3w.eye = l3w.cfg.eye; } else l3w.eye = 1.7; }
  l3w.prevFov = l3.camera.fov; l3.camera.fov = 70; l3.camera.near = 0.05; l3.camera.updateProjectionMatrix();
  l3.orbit.enabled = false;
  l3w.p = new THREE.Vector3(P.x, P.y, P.z + l3w.eye); l3w.bz = l3w.p.z; l3w.heading = l3w.yaw;
  l3.camera.position.copy(l3w.p);
  document.body.classList.add("v3-walking");
  l3wHud(true); l3wApply();
  l3Status("Gå runt: W/A/S/D går, dra med musen för att titta, Q ner, E upp, Skift springer, M mäter, hjulet ändrar farten. Esc avslutar.");
  l3wLoop();
}
function l3wExit(quiet) {
  if (!l3w.on) { l3w.picking = false; return; }
  l3w.on = false; l3w.keys.clear(); l3w.drag = null; l3wAvatarRemove(); l3wJoyShow(false);
  if (l3w.p) { l3.camera.position.copy(l3w.p); l3.camera.updateMatrixWorld(); }
  cancelAnimationFrame(l3w.raf); l3w.raf = 0;
  if (l3w.prevFov) { l3.camera.fov = l3w.prevFov; l3.camera.updateProjectionMatrix(); }
  // Vanlig 3D där man står: orbit-målet en bit framför kameran.
  const d = l3.camera.getWorldDirection(new THREE.Vector3());
  l3.orbit.target.copy(l3.camera.position).addScaledVector(d, 8);
  l3.orbit.enabled = true; l3.orbit.update();
  if (l3w.wasOrtho) { l3w.wasOrtho = false; }
  document.body.classList.remove("v3-walking");
  l3wHud(false); l3Render();
  if (!quiet) l3Status("Gå-läget är avslutat.");
}
function l3wApply() {
  const cam = l3.camera, cp = Math.cos(l3w.pitch), P = l3w.p || cam.position;
  const dir = new THREE.Vector3(cp * Math.cos(l3w.yaw), cp * Math.sin(l3w.yaw), Math.sin(l3w.pitch));
  cam.up.set(0, 0, 1);
  if (l3w.person === "third") {
    const cf = l3w.cfg || L3C_CFG.human, D = l3wCamDist(P, dir, cf.camD);
    cam.position.copy(P).addScaledVector(dir, -D); cam.position.z += cf.camUp;
    cam.lookAt(P.clone().add(new THREE.Vector3(0, 0, 0.12)));
  } else { cam.position.copy(P); cam.lookAt(P.clone().add(dir)); }
  l3.orbit.target.copy(P).addScaledVector(dir, 5);
  cam.updateMatrixWorld();
  l3wAvatarUpdate();
  if (typeof l3DrawTriad === "function") l3DrawTriad();
  l3Render();
  l3wHudUpdate();
}
/* Tredje person: kameran backar bakom figuren (3,2 m för byggaren, mer för fordon), men stannar framför en vägg. */
function l3wCamDist(P, dir, D0) {
  const back = dir.clone().negate(), D1 = D0 || 3.2, rc = new THREE.Raycaster(P.clone(), back, 0, D1 + 0.4); rc.firstHitOnly = true;
  let D = D1;
  try { const h = rc.intersectObjects(l3Surfaces(), true).find(x => x.object.visible && !x.object.userData.noHit && x.object.type !== "LineSegments" && x.object.type !== "Line" && l3VisibleChain(x.object)); if (h) D = Math.max(0.5, Math.min(D, h.distance - 0.3)); } catch (e) { /* ingen skyddskoll */ }
  return D;
}
/* ---- Figuren: se lagesplan-3dchar.js (byggare, mobilkran, grävmaskin, lastbil, hjullastare, markerat objekt) ---------------------------- */
function l3wAvatarUpdate() {
  if (l3w.person !== "third" || !l3w.on) { l3wAvatarRemove(); return; }
  if (!l3w.av) { const av = l3cBuild(l3w.kind, l3w.ownRot); if (av.kind !== l3w.kind) { l3w.kind = av.kind; } l3w.av = av; l3w.cfg = av.cfg; l3w.avatar = av.g; l3.scene.add(av.g); }
  const g = l3w.av.g, P = l3w.p, cf = l3w.cfg, follow = l3wFollow(), ft = follow && l3w.gz != null ? l3w.gz + l3w.jz : P.z - l3w.eye;
  g.position.set(P.x, P.y, ft); g.rotation.z = l3w.heading + (l3w.kind === "own" ? 0 : 0);
  const sc = cf.vehicle ? 1 : Math.max(0.5, Math.min(2, l3w.eye / 1.7)); g.scale.set(sc, sc, sc);
  l3w.av.update({ moving: l3w.moving, phase: l3w.phase, speed: l3w.curV, crouch: l3w.crouch, jz: l3w.jz, work: l3w.work, t: l3w.t, travel: l3w.travel });
}
function l3wAvatarRemove() {
  const g = l3w.avatar; l3w.avatar = null; l3w.av = null; if (!g) return;
  if (g.parent) g.parent.remove(g);
  g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); } });
}
function l3wSetKind(k) {
  if (!L3C_CFG[k]) k = "human"; if (k === "own" && !(l3.sel && l3.sel.size)) { l3Status("Markera ett placerat objekt (t.ex. en kran från biblioteket) först – då kan du vara det.", true); return; }
  l3wAvatarRemove(); l3w.kind = k; l3w.cfg = L3C_CFG[k]; l3SetPref("walkKind", k);
  if (l3w.cfg.vehicle) { l3w.person = "third"; l3w.eye = l3w.cfg.eye; } else l3w.eye = 1.7; l3w.crouchTog = false; l3w.settled = false; l3w.gz = null; l3w.workOn = false; l3w.work = 0;
  l3wApply(); l3wHud(true); l3wJoyShow(l3w.joy); l3Status(`Du är nu ${(L3C_KINDS.find(x => x[0] === k) || ["", k])[1].toLowerCase()}${k === "own" ? " (kopia av det markerade objektet)" : ""}.`);
}
/* Kollision (när Spöke är av): strålar i gångriktningen i flera höjder och med sidoförskjutning (kroppens bredd). Ger närmaste träff med väggens normal, så att man glider längs väggen. */
function l3wHit(P, delta, rad) {
  const len = delta.length(); if (len < 1e-6) return null;
  const dir = delta.clone().multiplyScalar(1 / len), cf = l3w.cfg || L3C_CFG.human, base = l3w.gz != null ? l3w.gz : P.z - l3w.eye, lat = new THREE.Vector3(dir.y, -dir.x, 0), far = len + rad;
  const hs = cf.vehicle ? [cf.step + 0.2, Math.max(0.8, l3w.eye * 0.55), l3w.eye * 0.95] : [0.7, 1.3, 1.65 * (l3w.eye / 1.7)], sides = [0, rad * 0.7, -rad * 0.7];
  let best = null; const surf = l3Surfaces();
  for (const hz of hs) for (const sd of sides) {
    const o = new THREE.Vector3(P.x + lat.x * sd, P.y + lat.y * sd, base + hz), rc = new THREE.Raycaster(o, dir, 0, far); rc.firstHitOnly = true;
    const h = rc.intersectObjects(surf, true).find(x => x.object.visible && !x.object.userData.noHit && x.object.type !== "LineSegments" && x.object.type !== "Line" && l3VisibleChain(x.object) && l3NotClipped(x.point));
    if (h && (!best || h.distance < best.d)) { let n = null; if (h.face) { n = h.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(h.object.matrixWorld)).normalize(); } if (!n || !isFinite(n.x)) n = dir.clone().negate(); if (n.dot(dir) > 0) n.negate(); n.z = 0; if (n.lengthSq() < 1e-6) n = dir.clone().negate(); n.normalize(); best = { d: h.distance, n }; }
    if (typeof l3pcPickRay === "function") { try { const q = l3pcPickRay(o, dir, 0, 0.12); if (q && q.distance <= far && (!best || q.distance < best.d)) best = { d: q.distance, n: dir.clone().negate() }; } catch (e) { /* utan punktmoln */ } }
  }
  return best;
}
function l3wMoveSolid(P, mv, rad) {
  if (l3w.ghost) { P.add(mv); return; }
  const h = l3wHit(P, mv, rad);
  if (!h) { P.add(mv); return; }
  const n = h.n; if (h.d < rad * 0.6) P.addScaledVector(n, Math.min(0.08, rad * 0.6 - h.d)); // ur väggen om man hamnat för nära
  const sl = mv.clone().addScaledVector(n, -mv.dot(n)).multiplyScalar(0.9);
  if (sl.lengthSq() > 1e-8 && !l3wHit(P, sl, rad)) P.add(sl);
}
/* Marken under fötterna: modeller, etablering, ritningen och punktmolnen – högst 0,6 m upp (trappsteg). */
function l3wGround(pos) {
  // Utgår från markens senast kända höjd (inte ögonhöjden): Q/E ändrar ögonhöjden utan att markspaningen tappar marken.
  const from = new THREE.Vector3(pos.x, pos.y, (l3w.gz != null ? l3w.gz : pos.z - l3w.eye) + ((l3w.cfg && l3w.cfg.step) || 0.6)), down = new THREE.Vector3(0, 0, -1);
  const rc = new THREE.Raycaster(from, down, 0, 60); rc.firstHitOnly = true;
  const h = rc.intersectObjects(l3Surfaces(), true).find(x => x.object.visible && !x.object.userData.noHit && x.object.type !== "LineSegments" && x.object.type !== "Line" && l3VisibleChain(x.object) && l3NotClipped(x.point));
  let z = h ? h.point.z : null;
  if (typeof l3pcPickRay === "function") { const p = l3pcPickRay(from, down, 0, 0.25); if (p && (z == null || p.point.z > z)) z = p.point.z; }
  if (z == null) { let g = null; try { g = l3GroundZ(); } catch (e) { /* okalibrerad */ } if (g != null && g <= from.z) z = g; }
  return z;
}
function l3wLoop() {
  l3w.last = performance.now();
  // Ett fel i en bild (t.ex. markspaningen) får aldrig stoppa slingan – då "låste sig" WASD tills man startade om gåendet.
  const step = t => {
    if (!l3w.on) return;
    try { frame(t); } catch (err) { if (!l3w.warned) { l3w.warned = true; console.warn("Gå-läget: fel i en bild", err); } }
    if (l3w.on) l3w.raf = requestAnimationFrame(step);
  };
  const frame = t => {
    const dt = Math.min(0.1, (t - l3w.last) / 1000); l3w.last = t;
    const K = l3w.keys, cam = l3.camera, cfg = l3w.cfg || L3C_CFG.human, veh = !!cfg.vehicle, third = l3w.person === "third";
    if (!third) l3w.p.copy(cam.position);
    const P = l3w.p; let moved = false; l3w.moving = false; l3w.t += dt;
    // Piltangenterna vrider (90°/s) och tittar upp/ner.
    const jl = l3w.jl, turn = (K.has("arrowleft") ? 1 : 0) - (K.has("arrowright") ? 1 : 0) - jl.x * 1.6, look = (K.has("arrowup") ? 1 : 0) - (K.has("arrowdown") ? 1 : 0) - jl.y * 1.0;
    if (turn) { l3w.yaw += turn * dt * Math.PI / 2; moved = true; }
    if (look) { l3w.pitch = Math.max(-1.5, Math.min(1.5, l3w.pitch + look * dt * Math.PI / 4)); moved = true; }
    const f = (K.has("w") ? 1 : 0) - (K.has("s") ? 1 : 0) - l3w.jm.y, sd = (K.has("d") ? 1 : 0) - (K.has("a") ? 1 : 0) + l3w.jm.x, up = (K.has("e") ? 1 : 0) - (K.has("q") ? 1 : 0);
    const crouchT = !veh && (K.has("c") || l3w.crouchTog) ? 1 : 0; l3w.crouch += (crouchT - l3w.crouch) * Math.min(1, dt * 10); if (Math.abs(crouchT - l3w.crouch) < 0.01) l3w.crouch = crouchT; else moved = true;
    const v = l3w.speed * cfg.speedMul * (K.has("shift") || l3w.run ? 3 : 1) * (crouchT ? 0.45 : 1);
    if (K.has("space")) { K.delete("space"); l3wJump(); }
    // Arbetsläge (kranarm, skopa, tipp): mjuk övergång 0–1 och pågående rörelse
    { const wt = l3w.workOn ? 1 : 0; l3w.work += (wt - l3w.work) * Math.min(1, dt * 1.6); if (Math.abs(wt - l3w.work) < 0.003) l3w.work = wt; else moved = true; if (l3w.workOn && veh) moved = true; }
    l3w.curV = 0;
    if (f || sd) {
      const fw = new THREE.Vector3(Math.cos(l3w.yaw), Math.sin(l3w.yaw), 0), rt = new THREE.Vector3(Math.sin(l3w.yaw), -Math.cos(l3w.yaw), 0);
      const m = fw.multiplyScalar(f).add(rt.multiplyScalar(sd)); if (m.lengthSq() > 1) m.normalize(); const mag = m.length();
      let dirv = m.clone();
      if (third) {
        const ang = Math.atan2(m.y, m.x), wrap = a => Math.atan2(Math.sin(a), Math.cos(a)), diff = wrap(ang - l3w.heading);
        if (veh && Math.abs(diff) > 2.45 && Math.abs(sd) < 0.35) { dirv = new THREE.Vector3(-Math.cos(l3w.heading), -Math.sin(l3w.heading), 0).multiplyScalar(mag * 0.5); } // backa utan att vända
        else { l3w.heading = wrap(l3w.heading + Math.max(-cfg.turn * dt, Math.min(cfg.turn * dt, diff))); dirv = new THREE.Vector3(Math.cos(l3w.heading), Math.sin(l3w.heading), 0).multiplyScalar(mag * Math.max(0, Math.cos(diff))); }
      }
      const mv = dirv.multiplyScalar(v * dt), dist = mv.length();
      if (dist > 1e-7 || (third && veh)) { l3w.moving = true; l3w.curV = dist / Math.max(dt, 1e-3); l3w.phase += dist * 2.6 / Math.max(0.2, cfg.speedMul > 1 ? 1 : 1); l3w.travel += dist * (f < 0 && veh ? -1 : 1); l3wMoveSolid(P, mv, cfg.radius); }
      moved = true;
    }
    // Q/E: rakt lodrätt (inte dit man tittar). Med Följ marken ändras ögonhöjden över marken (0,3–200 m).
    if (up) {
      P.z += up * v * dt; moved = true;
      if (l3wFollow()) { const base = l3w.gz != null ? l3w.gz : P.z - l3w.eye; l3w.eye = Math.max(0.3, Math.min(200, P.z - base)); P.z = base + l3w.eye; }
      l3w.bz = P.z - l3w.jz;
    }
    // Hopp (bara byggaren): lodrätt ovanpå marknivån, fungerar även utan Följ marken. Takhöjd stoppar hoppet om Spöke är av.
    if (!l3wFollow() && !up) l3w.bz = P.z - l3w.jz;
    if (l3w.jz > 0 || l3w.vz !== 0) {
      l3w.vz -= 12 * dt;
      if (!l3w.ghost && l3w.vz > 0) { try { const rc = new THREE.Raycaster(P.clone(), new THREE.Vector3(0, 0, 1), 0, 0.3 + l3w.vz * dt); rc.firstHitOnly = true; if (rc.intersectObjects(l3Surfaces(), true).find(x => x.object.visible && !x.object.userData.noHit && x.object.type !== "LineSegments" && x.object.type !== "Line" && l3VisibleChain(x.object))) l3w.vz = 0; } catch (e) { /* */ } }
      l3w.jz += l3w.vz * dt; if (l3w.jz <= 0) { l3w.jz = 0; l3w.vz = 0; } moved = true;
    }
    if (l3wFollow() && (moved || !l3w.settled)) {
      const g = up ? null : l3wGround(P); // under Q/E står höjden still mot marken
      if (g != null) {
        l3w.gz = g; const want = g + l3w.eye * (1 - 0.45 * l3w.crouch), dz = want - l3w.bz;
        if (!l3w.ghost && dz < -0.4) { l3w.fv -= 16 * dt; l3w.bz = Math.max(want, l3w.bz + l3w.fv * dt); l3w.settled = false; moved = true; if (l3w.bz <= want) l3w.fv = 0; } // faller (solid mark): ingen svävning över kanter
        else { l3w.fv = 0; l3w.bz += Math.abs(dz) < 0.005 ? dz : dz * Math.min(1, dt * 12); l3w.settled = Math.abs(dz) < 0.005 && !l3w.jz; if (!l3w.settled) moved = true; }
      } else l3w.settled = !!up || g == null;
    }
    P.z = l3w.bz + l3w.jz;
    if (moved || l3w.moving) l3wApply();
  };
  cancelAnimationFrame(l3w.raf); l3w.settled = false;
  l3w.raf = requestAnimationFrame(step);
}

function l3wCommentStart() { if (typeof l3kNew !== "function") return; l3w.cmtPick = true; l3.renderer.domElement.style.cursor = "crosshair"; l3Status("Kommentar: tryck på det du vill kommentera (Esc avbryter)."); l3wHud(true); }
function l3wJump() { if (!l3w.on || (l3w.cfg && l3w.cfg.vehicle) || l3w.jz > 0 || l3w.vz !== 0) return; l3w.vz = 4.2 * Math.sqrt(Math.max(0.5, l3w.eye / 1.7)); l3w.settled = false; }
function l3wWork() { if (!l3w.on) return; l3w.workOn = !l3w.workOn; l3wHud(true); l3wJoyShow(l3w.joy); }
function l3wFullscreen() { const el = document.getElementById("view3d"); if (!el) return; if (document.fullscreenElement) { document.exitFullscreen(); return; } if (el.requestFullscreen) el.requestFullscreen().catch(() => l3Status("Webbläsaren tillät inte helskärm.", true)); else l3Status("Webbläsaren saknar helskärm.", true); }
function l3wSetPerson(p) { if (p !== "third" && l3w.cfg && l3w.cfg.vehicle) { l3Status("Fordon och objekt visas bara i tredje person – välj Byggare för första person.", true); return; } l3w.person = p === "third" ? "third" : "first"; l3SetPref("walkPerson", l3w.person); if (l3w.person === "first") l3wAvatarRemove(); l3w.p && l3w.person === "first" && l3.camera.position.copy(l3w.p); l3wApply(); l3wHud(true); l3Status(l3w.person === "third" ? "Tredje person: du ser dig själv bakifrån (V byter)." : "Första person (V byter)."); }
function l3wSetGhost(on) { l3w.ghost = !!on; l3SetPref("walkGhost", l3w.ghost); l3wHud(true); l3Status(l3w.ghost ? "Spöke på: du går igenom väggar och föremål." : "Spöke av: väggar och föremål stoppar dig."); }
/* Virtuella joysticks för surfplatta/mobil: vänster går, höger tittar. Knappar: hopp, spring, huka, spöke, person. */
function l3wJoyShow(on) {
  let j = l3w.joyEl;
  if (!on) { if (j) j.classList.add("hidden"); l3w.jm = { x: 0, y: 0 }; l3w.jl = { x: 0, y: 0 }; return; }
  if (!j) {
    j = document.createElement("div"); j.className = "v3-joys"; l3w.joyEl = j; document.getElementById("v3Canvas").appendChild(j);
    j.innerHTML = `<div class="v3-joy l" data-j="m"><i></i><span>GÅ</span></div><div class="v3-joy r" data-j="l"><i></i><span>TITTA</span></div>
      <div class="v3-jbtns"><button type="button" data-jb="ghost">Spöke</button><button type="button" data-jb="jump">Hopp</button><button type="button" data-jb="run">Spring</button><button type="button" data-jb="crouch">Huka</button><button type="button" data-jb="work">Arbeta</button></div>`;
    j.addEventListener("pointerdown", e => e.stopPropagation());
    j.querySelectorAll(".v3-joy").forEach(el => {
      const set = (e) => { const r = el.getBoundingClientRect(), R = r.width / 2, dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R), d = Math.hypot(dx, dy), k = d > R ? R / d : 1, x = dx * k / R, y = dy * k / R; el.firstElementChild.style.transform = `translate(${x * R * 0.7}px,${y * R * 0.7}px)`; (el.dataset.j === "m" ? l3w.jm : l3w.jl).x = x; (el.dataset.j === "m" ? l3w.jm : l3w.jl).y = y; };
      el.addEventListener("pointerdown", e => { e.preventDefault(); el.setPointerCapture(e.pointerId); el._id = e.pointerId; set(e); });
      el.addEventListener("pointermove", e => { if (el._id === e.pointerId) set(e); });
      const end = e => { if (el._id !== e.pointerId) return; el._id = null; el.firstElementChild.style.transform = ""; (el.dataset.j === "m" ? l3w.jm : l3w.jl).x = 0; (el.dataset.j === "m" ? l3w.jm : l3w.jl).y = 0; };
      el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
    });
    j.querySelectorAll("[data-jb]").forEach(b => b.addEventListener("click", () => { const k = b.dataset.jb; if (k === "jump") l3wJump(); else if (k === "work") l3wWork(); else if (k === "run") { l3w.run = !l3w.run; } else if (k === "crouch") { l3w.crouchTog = !l3w.crouchTog; l3w.settled = false; } else if (k === "ghost") l3wSetGhost(!l3w.ghost); l3wJoyShow(true); }));
  }
  j.classList.remove("hidden");
  { const veh = !!(l3w.cfg && l3w.cfg.vehicle); j.querySelector('[data-jb="jump"]').hidden = veh; j.querySelector('[data-jb="crouch"]').hidden = veh; j.querySelector('[data-jb="work"]').hidden = !veh; j.querySelector('[data-jb="work"]').classList.toggle("on", l3w.workOn); }
  j.querySelector('[data-jb="run"]').classList.toggle("on", l3w.run); j.querySelector('[data-jb="crouch"]').classList.toggle("on", l3w.crouchTog); j.querySelector('[data-jb="ghost"]').classList.toggle("on", l3w.ghost);
}

/* ---- Tangenter och mus (före 3D-vyns vanliga hantering) ---------------------------------------------- */
function l3wKey(e) {
  if (!l3w.on && !l3w.picking) return false;
  const k = l3wKeyName(e), typing = l3wTyping(e.target);
  // Släpp alltid: en tangent som släpps i ett skrivfält (eller efter fokusbyte) får inte fastna som nedtryckt.
  if (e.type === "keyup") { if (L3W_KEYS.has(k)) l3w.keys.delete(k); if (!e.shiftKey) l3w.keys.delete("shift"); return !typing && l3w.on && L3W_KEYS.has(k); }
  if (typing) return false;
  if (k === "escape") {
    e.preventDefault();
    if (l3w.cmtPick) { l3w.cmtPick = false; l3.renderer.domElement.style.cursor = ""; l3Status("Avbrutet."); l3wHud(true); }
    else if (l3w.picking) { l3w.picking = false; l3.renderer.domElement.style.cursor = ""; l3Status("Avbrutet."); }
    else if (l3.tool === "measure" && typeof l3t !== "undefined" && l3t.step) { if (typeof l3ToolCancel === "function") l3ToolCancel(); l3Status("Måttet avbrutet."); } // Esc avbryter först ett påbörjat mått
    else l3wExit();
    return true;
  }
  if (!l3w.on) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false; // genvägar (Ctrl+S m.fl.) lämnas åt webbläsaren
  if (e.shiftKey) l3w.keys.add("shift"); else l3w.keys.delete("shift");
  if (k === "v" && !e.repeat) { e.preventDefault(); l3wSetPerson(l3w.person === "third" ? "first" : "third"); return true; }
  if (k === "x" && !e.repeat) { e.preventDefault(); l3wWork(); return true; }
  if (k === "f" && !e.repeat) { e.preventDefault(); l3wFullscreen(); return true; }
  if (k === "g" && !e.repeat) { e.preventDefault(); l3wSetGhost(!l3w.ghost); return true; }
  if (k === "k" && !e.repeat) { e.preventDefault(); l3wCommentStart(); return true; }
  if (!L3W_KEYS.has(k) || k === "shift") return false;
  e.preventDefault();
  l3w.keys.add(k);
  return true;
}
function l3wInit() {
  if (l3w.inited) return; l3w.inited = true;
  const on3d = () => l3 && !document.getElementById("view3d").classList.contains("hidden");
  ["keydown", "keyup"].forEach(t => window.addEventListener(t, e => { if (on3d() && l3wKey(e)) e.stopImmediatePropagation(); }, true));
  // Inga fastnade tangenter: fönstret tappar fokus, fliken döljs, ett skrivfält får fokus eller menyn öppnas.
  const clearKeys = () => { l3w.keys.clear(); l3w.drag = null; };
  window.addEventListener("blur", clearKeys);
  document.addEventListener("visibilitychange", clearKeys);
  window.addEventListener("focusin", e => { if (l3wTyping(e.target)) clearKeys(); });
  window.addEventListener("contextmenu", clearKeys, true);
  const canvasEv = e => l3 && e.target === l3.renderer.domElement && l3w.on;
  window.addEventListener("pointerdown", e => {
    if (!canvasEv(e)) return;
    e.stopPropagation(); e.preventDefault();
    l3w.drag = { x: e.clientX, y: e.clientY, yaw: l3w.yaw, pitch: l3w.pitch, id: e.pointerId };
    try { l3.renderer.domElement.setPointerCapture(e.pointerId); } catch (err) { /* äldre webbläsare */ }
  }, true);
  window.addEventListener("pointermove", e => {
    if (!l3w.on || !l3w.drag || e.pointerId !== l3w.drag.id) return;
    e.stopPropagation();
    const s = 0.0045;
    l3w.yaw = l3w.drag.yaw - (e.clientX - l3w.drag.x) * s;
    l3w.pitch = Math.max(-1.5, Math.min(1.5, l3w.drag.pitch - (e.clientY - l3w.drag.y) * s));
    l3wApply();
  }, true);
  window.addEventListener("pointerup", e => {
    if (!(l3w.on && l3w.drag && e.pointerId === l3w.drag.id)) return;
    e.stopPropagation();
    const d = l3w.drag; l3w.drag = null;
    // Tryck (inte dra) gäller som vanligt medan man går (Victor 2026-10-13): mäta, trycka på en fotoikon och titta på bilden,
    // markera objekt (H döljer dem). Högerklick (utan att dra) öppnar högerklicksmenyn: Dölj, Exportera m.m.
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) {
      if (e.button === 2) { if (typeof l3OpenCtx === "function") l3OpenCtx(e.clientX, e.clientY, e); }
      else if (l3w.cmtPick) { l3w.cmtPick = false; l3.renderer.domElement.style.cursor = ""; const s0 = typeof l3Snap === "function" ? l3Snap(e) : null, h = typeof l3pcNearer === "function" ? l3pcNearer(e, l3Ray(e, l3Surfaces())[0]) : l3Ray(e, l3Surfaces())[0]; l3kNew((s0 && s0.point) || (h && h.point), h); l3wHud(true); }
      else { l3Tap(e); l3Render(); }
    }
  }, true);
  ["dblclick", "contextmenu"].forEach(t => window.addEventListener(t, e => { if (canvasEv(e)) { e.stopPropagation(); e.preventDefault(); } }, true));
  window.addEventListener("wheel", e => {
    if (!canvasEv(e)) return;
    e.stopPropagation(); e.preventDefault();
    l3w.speed = Math.max(0.2, Math.min(40, l3w.speed * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    l3wHudUpdate();
  }, { capture: true, passive: false });
}

/* ---- Rutan längst ner: tangenterna, farten, Följ marken och ✕ ------------------------------------------ */
function l3wHud(show) {
  let h = l3w.hud;
  if (!show) { if (h) h.classList.add("hidden"); return; }
  if (!h) {
    h = document.createElement("div"); h.className = "v3-walk"; l3w.hud = h;
    document.getElementById("v3Canvas").appendChild(h);
    h.addEventListener("pointerdown", e => e.stopPropagation());
  }
  h.classList.remove("hidden");
  h.innerHTML = `<b>Gå runt</b><span class="v3-walk-p" title="Första person: du ser genom ögonen. Tredje person: kameran följer bakom en figur (V byter)"><button type="button" data-w="p1" class="${l3w.person !== "third" ? "on" : ""}">1:a person</button><button type="button" data-w="p3" class="${l3w.person === "third" ? "on" : ""}">3:e person</button></span><select class="v3-walk-kind" data-w="kind" title="Vem eller vad du är i tredje person: byggare, mobilkran, grävmaskin, lastbil, hjullastare eller en kopia av det markerade objektet">${L3C_KINDS.map(([k, n]) => `<option value="${k}"${l3w.kind === k ? " selected" : ""}>${n}</option>`).join("")}</select>${l3w.cfg && l3w.cfg.vehicle ? `<button type="button" class="v3-walk-m ${l3w.workOn ? "on" : ""}" data-w="work" title="Arbetsläge: kranarm upp, grävande arm, tippat flak (X)">Arbeta</button>` : ""}${l3w.kind === "own" ? `<button type="button" class="v3-walk-m" data-w="rot" title="Vrid objektet ett kvarts varv (vilken sida som är framåt)">Vrid</button>` : ""}<span class="v3-walk-k"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> gå · <kbd>E</kbd> upp · <kbd>Q</kbd> ner · <kbd>Skift</kbd> spring · <kbd>C</kbd> huka · <kbd>Mellanslag</kbd> hopp · <kbd>V</kbd> person · <kbd>G</kbd> spöke · <kbd>X</kbd> arbeta · <kbd>F</kbd> helskärm · <kbd>K</kbd> kommentar · <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> titta · dra = titta · hjul = fart · <kbd>M</kbd> mät · <kbd>Esc</kbd> ut</span>
    <span class="v3-walk-v" title="Farten – ändras med mushjulet"><button type="button" data-w="slow">−</button><em id="v3WalkSpeed"></em><button type="button" data-w="fast">＋</button></span>
    <button type="button" class="v3-walk-m ${l3.tool === "measure" ? "on" : ""}" data-w="meas" title="Mät medan du går (M): tryck punkterna i bilden – dra för att titta">Mät</button>
    <button type="button" class="v3-walk-m ${l3w.ghost ? "on" : ""}" data-w="ghost" title="Spöke på: du går igenom väggar och föremål. Av: de stoppar dig (G)">Spöke</button>
    <button type="button" class="v3-walk-m ${l3w.cmtPick ? "on" : ""}" data-w="cmt" title="Lägg en kommentar där du trycker (K)">Kommentar</button>
    <button type="button" class="v3-walk-m ${l3w.joy ? "on" : ""}" data-w="joy" title="Visa joysticks på skärmen (för surfplatta och mobil)">Joysticks</button>
    <label class="v3-chk" title="Kameran följer golv, mark, modeller och punktmoln under fötterna"><input type="checkbox" id="v3WalkFollow" ${l3wFollow() ? "checked" : ""} /> Följ marken</label>
    <button type="button" class="v3-walk-m" data-w="fs" title="Helskärm (F)">⛶ Helskärm</button>
    <button type="button" class="v3-x" data-w="exit" title="Avsluta (Esc)">✕</button>`;
  // Fokus hos rutans knappar får aldrig stjäla tangenterna.
  h.querySelectorAll("button, input").forEach(b => b.addEventListener("click", () => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }));
  h.querySelector('[data-w="meas"]').onclick = e => { if (typeof l3SetTool === "function") l3SetTool(l3.tool === "measure" ? "select" : "measure"); e.currentTarget.classList.toggle("on", l3.tool === "measure"); };
  h.querySelector('[data-w="exit"]').onclick = () => l3wExit();
  h.querySelector('[data-w="kind"]').onchange = e => l3wSetKind(e.target.value); h.querySelector('[data-w="fs"]').onclick = () => l3wFullscreen(); { const w = h.querySelector('[data-w="work"]'); if (w) w.onclick = () => l3wWork(); const r = h.querySelector('[data-w="rot"]'); if (r) r.onclick = () => { l3w.ownRot = (l3w.ownRot + 1) % 4; l3wAvatarRemove(); l3wApply(); }; }
  h.querySelector('[data-w="p1"]').onclick = () => l3wSetPerson("first"); h.querySelector('[data-w="p3"]').onclick = () => l3wSetPerson("third");
  h.querySelector('[data-w="ghost"]').onclick = () => l3wSetGhost(!l3w.ghost); h.querySelector('[data-w="cmt"]').onclick = () => l3wCommentStart();
  h.querySelector('[data-w="joy"]').onclick = () => { l3w.joy = !l3w.joy; l3SetPref("walkJoy", l3w.joy); l3wJoyShow(l3w.joy); l3wHud(true); };
  l3wJoyShow(l3w.joy);
  h.querySelector('[data-w="slow"]').onclick = () => { l3w.speed = Math.max(0.2, l3w.speed / 1.5); l3wHudUpdate(); };
  h.querySelector('[data-w="fast"]').onclick = () => { l3w.speed = Math.min(40, l3w.speed * 1.5); l3wHudUpdate(); };
  h.querySelector("#v3WalkFollow").onchange = e => { l3SetPref("walkFollow", e.target.checked); l3w.settled = false; l3w.gz = null; };
  l3wHudUpdate();
}
function l3wHudUpdate() {
  const el = document.getElementById("v3WalkSpeed"); if (!el || !l3) return;
  const g = l3wFollow() ? ` · ögon ${l3w.eye.toFixed(1).replace(".", ",")} m` : "";
  el.textContent = `${l3w.speed.toFixed(l3w.speed < 10 ? 1 : 0).replace(".", ",")} m/s${g}`;
}
