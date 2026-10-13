/* 3D-vyn – gå-läge (Victor 2026-10-12: "vy-läge där man kan släppa ner vyn så att det blir som POV där jag
   styr med WASD").

   Vyer → Gå runt (WASD)…: tryck där du vill stå – kameran släpps ner i ögonhöjd (1,7 m) och tittar åt samma håll
   som förut. W/S framåt/bakåt, A/D åt sidan, Q ner / E upp (rakt lodrätt), Skift springer, C smyger, piltangenterna vrider;
   dra med musen för att titta runt, hjulet ändrar farten. "Följ marken": kameran följer golv, mark, modeller
   och punktmoln under fötterna (trappsteg upp till 0,6 m). Esc eller ✕ avslutar – vyn blir vanlig 3D där du står.
   Bara perspektiv (parallell projektion stängs av medan man går). */

const l3w = { on: false, picking: false, keys: new Set(), yaw: 0, pitch: 0, speed: 1.4, eye: 1.7, gz: null, raf: 0, last: 0, drag: null, hud: null };
const L3W_KEYS = new Set(["w", "a", "s", "d", "q", "e", "c", "arrowup", "arrowdown", "arrowleft", "arrowright", "shift"]);
/* Fysisk tangent först (WASD fungerar likadant på alla tangentbordslayouter), annars tecknet. */
const L3W_CODE = { KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d", KeyQ: "q", KeyE: "e", KeyC: "c", ArrowUp: "arrowup", ArrowDown: "arrowdown", ArrowLeft: "arrowleft", ArrowRight: "arrowright", ShiftLeft: "shift", ShiftRight: "shift" };
const l3wKeyName = e => L3W_CODE[e.code] || String(e.key || "").toLowerCase();
/* Skrivfält (inte kryssrutor/knappar): där ska tangenterna skriva, inte gå. */
const l3wTyping = t => !!t && (t.isContentEditable || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || (t.tagName === "INPUT" && !/^(checkbox|radio|button|range|submit|reset|color|file)$/i.test(t.type || "text")));
const l3wFollow = () => l3Prefs().walkFollow !== false;

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
  l3w.on = true; l3w.keys.clear(); l3w.gz = P.z;
  l3w.prevFov = l3.camera.fov; l3.camera.fov = 70; l3.camera.near = 0.05; l3.camera.updateProjectionMatrix();
  l3.orbit.enabled = false;
  l3.camera.position.set(P.x, P.y, P.z + l3w.eye);
  document.body.classList.add("v3-walking");
  l3wHud(true); l3wApply();
  l3Status("Gå runt: W/A/S/D går, dra med musen för att titta, Q ner, E upp, Skift springer, M mäter, hjulet ändrar farten. Esc avslutar.");
  l3wLoop();
}
function l3wExit(quiet) {
  if (!l3w.on) { l3w.picking = false; return; }
  l3w.on = false; l3w.keys.clear(); l3w.drag = null;
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
  const cam = l3.camera, cp = Math.cos(l3w.pitch);
  const dir = new THREE.Vector3(cp * Math.cos(l3w.yaw), cp * Math.sin(l3w.yaw), Math.sin(l3w.pitch));
  cam.up.set(0, 0, 1);
  cam.lookAt(cam.position.clone().add(dir));
  l3.orbit.target.copy(cam.position).addScaledVector(dir, 5);
  cam.updateMatrixWorld();
  if (typeof l3DrawTriad === "function") l3DrawTriad();
  l3Render();
  l3wHudUpdate();
}
/* Marken under fötterna: modeller, etablering, ritningen och punktmolnen – högst 0,6 m upp (trappsteg). */
function l3wGround(pos) {
  // Utgår från markens senast kända höjd (inte ögonhöjden): Q/E ändrar ögonhöjden utan att markspaningen tappar marken.
  const from = new THREE.Vector3(pos.x, pos.y, (l3w.gz != null ? l3w.gz : pos.z - l3w.eye) + 0.6), down = new THREE.Vector3(0, 0, -1);
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
    const K = l3w.keys, cam = l3.camera;
    let moved = false;
    // Piltangenterna vrider (90°/s) och tittar upp/ner.
    const turn = (K.has("arrowleft") ? 1 : 0) - (K.has("arrowright") ? 1 : 0), look = (K.has("arrowup") ? 1 : 0) - (K.has("arrowdown") ? 1 : 0);
    if (turn) { l3w.yaw += turn * dt * Math.PI / 2; moved = true; }
    if (look) { l3w.pitch = Math.max(-1.5, Math.min(1.5, l3w.pitch + look * dt * Math.PI / 4)); moved = true; }
    const f = (K.has("w") ? 1 : 0) - (K.has("s") ? 1 : 0), sd = (K.has("d") ? 1 : 0) - (K.has("a") ? 1 : 0), up = (K.has("e") ? 1 : 0) - (K.has("q") ? 1 : 0);
    const v = l3w.speed * (K.has("shift") ? 3 : 1) * (K.has("c") ? 0.3 : 1);
    if (f || sd) {
      const fw = new THREE.Vector3(Math.cos(l3w.yaw), Math.sin(l3w.yaw), 0), rt = new THREE.Vector3(Math.sin(l3w.yaw), -Math.cos(l3w.yaw), 0);
      const m = fw.multiplyScalar(f).add(rt.multiplyScalar(sd)); if (m.lengthSq() > 1) m.normalize();
      cam.position.addScaledVector(m, v * dt); moved = true;
    }
    // Q/E: rakt lodrätt (inte dit man tittar). Med Följ marken ändras ögonhöjden över marken (0,3–200 m).
    if (up) {
      cam.position.z += up * v * dt; moved = true;
      if (l3wFollow()) { const base = l3w.gz != null ? l3w.gz : cam.position.z - l3w.eye; l3w.eye = Math.max(0.3, Math.min(200, cam.position.z - base)); cam.position.z = base + l3w.eye; }
    }
    if (l3wFollow() && (moved || !l3w.settled)) {
      const g = up ? null : l3wGround(cam.position); // under Q/E står höjden still mot marken
      if (g != null) { l3w.gz = g; const want = g + l3w.eye, dz = want - cam.position.z; cam.position.z += Math.abs(dz) < 0.005 ? dz : dz * Math.min(1, dt * 12); l3w.settled = Math.abs(dz) < 0.005; if (!l3w.settled) moved = true; }
      else l3w.settled = !!up || g == null;
    }
    if (moved) l3wApply();
  };
  cancelAnimationFrame(l3w.raf); l3w.settled = false;
  l3w.raf = requestAnimationFrame(step);
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
    if (l3w.picking) { l3w.picking = false; l3.renderer.domElement.style.cursor = ""; l3Status("Avbrutet."); }
    else if (l3.tool === "measure" && typeof l3t !== "undefined" && l3t.step) { if (typeof l3ToolCancel === "function") l3ToolCancel(); l3Status("Måttet avbrutet."); } // Esc avbryter först ett påbörjat mått
    else l3wExit();
    return true;
  }
  if (!l3w.on) return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false; // genvägar (Ctrl+S m.fl.) lämnas åt webbläsaren
  if (e.shiftKey) l3w.keys.add("shift"); else l3w.keys.delete("shift");
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
  h.innerHTML = `<b>Gå runt</b><span class="v3-walk-k"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> gå · <kbd>E</kbd> upp · <kbd>Q</kbd> ner · <kbd>Skift</kbd> spring · <kbd>C</kbd> smyg · <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd> titta · dra = titta · hjul = fart · <kbd>M</kbd> mät · <kbd>Esc</kbd> ut</span>
    <span class="v3-walk-v" title="Farten – ändras med mushjulet"><button type="button" data-w="slow">−</button><em id="v3WalkSpeed"></em><button type="button" data-w="fast">＋</button></span>
    <button type="button" class="v3-walk-m ${l3.tool === "measure" ? "on" : ""}" data-w="meas" title="Mät medan du går (M): tryck punkterna i bilden – dra för att titta">Mät</button>
    <label class="v3-chk" title="Kameran följer golv, mark, modeller och punktmoln under fötterna"><input type="checkbox" id="v3WalkFollow" ${l3wFollow() ? "checked" : ""} /> Följ marken</label>
    <button type="button" class="v3-x" data-w="exit" title="Avsluta (Esc)">✕</button>`;
  // Fokus hos rutans knappar får aldrig stjäla tangenterna.
  h.querySelectorAll("button, input").forEach(b => b.addEventListener("click", () => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }));
  h.querySelector('[data-w="meas"]').onclick = e => { if (typeof l3SetTool === "function") l3SetTool(l3.tool === "measure" ? "select" : "measure"); e.currentTarget.classList.toggle("on", l3.tool === "measure"); };
  h.querySelector('[data-w="exit"]').onclick = () => l3wExit();
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
