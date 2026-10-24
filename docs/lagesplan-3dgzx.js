/* Flytt-/vridhandtaget, del 2 (Victor 2026-10-24):
   – fungerar även när flera objekt är markerade (ett osynligt mittpunktsobjekt styr hela markeringen: flytt, vridning, axel-/vinkellås, steg),
   – "Kopiera vid flytt": det man drar blir en kopia (rullgardinens switch, eller håll Ctrl medan man börjar dra),
   – vridringen har pilar som snurrar runt ringen medan man vrider eller håller över den. */
const l3gx = { pivot: null, last: null, decor: null, raf: 0, t0: 0, copy: false, ctrl: false, copied: 0, made: [] };
const L3GX_MULTI = () => l3 && l3.gizmo && l3.gizmo.object && l3.gizmo.object === l3gx.pivot;
const l3gxList = () => placements.filter(p => l3.sel.has(p.id));
window.addEventListener("keydown", e => { if (e.key === "Control") l3gx.ctrl = true; }, true);
window.addEventListener("keyup", e => { if (e.key === "Control") l3gx.ctrl = false; }, true);
window.addEventListener("blur", () => { l3gx.ctrl = false; });

/* ---- Mittpunktsobjektet för flera markerade ---- */
function l3gxPlacePivot() {
  const list = l3gxList().filter(p => !(placeLib(p.type) || {}).fence || (p.pts || []).length); if (list.length < 2) return false;
  if (!l3gx.pivot) { l3gx.pivot = new THREE.Object3D(); l3gx.pivot.userData.multi = true; l3.scene.add(l3gx.pivot); }
  const P = l3gx.pivot, n = list.length, O = l3.O;
  P.position.set(list.reduce((s, p) => s + p.x, 0) / n - O[0], list.reduce((s, p) => s + p.y, 0) / n - O[1], Math.min(...list.map(p => (Number(p.z) || 0) + (Number(p.dz) || 0))) - O[2]);
  P.rotation.set(0, 0, 0); P.updateMatrixWorld(true); l3gx.last = { x: P.position.x, y: P.position.y, z: P.position.z, r: 0 };
  return true;
}
function l3gxAttach() {
  if (!l3 || !l3.gizmo) return;
  const multi = l3.sel.size > 1 && (l3.tool || "select") === "select" && !(l3.gizmo.object && l3.gizmo.object.userData.bmove) && !l3.gizmo.dragging && !(l3.gizmoR && l3.gizmoR.dragging);
  if (multi) { if (l3gxPlacePivot()) { if (l3.gizmo.object !== l3gx.pivot) l3.gizmo.attach(l3gx.pivot); l3Mode(l3.gizmo.mode || "translate"); } }
  else if (l3gx.pivot && l3.gizmo.object === l3gx.pivot) l3.gizmo.detach();
}
/* Handtaget flyttar mittpunkten: flytta/vrid alla markerade lika mycket. */
function l3gxApply() {
  const P = l3gx.pivot, L = l3gx.last; if (!P || !L) return;
  const O = l3.O, dx = P.position.x - L.x, dy = P.position.y - L.y, dz = P.position.z - L.z, dr = P.rotation.z - L.r, deg = dr * 180 / Math.PI;
  l3gxList().forEach(p => {
    if (p.locked) return;
    if (dx || dy || dz) placeShift(p, dx, dy, dz);
    if (dr) placeRotateAbout(p, P.position.x + O[0], P.position.y + O[1], deg);
    const g = l3.placeMeshes.get(p.id), fence = (placeLib(p.type) || {}).fence;
    if (g && !fence) { g.position.set(p.x - O[0], p.y - O[1], (Number(p.z) || 0) + (Number(p.dz) || 0) - O[2]); g.rotation.z = (Number(p.rot) || 0) * Math.PI / 180; }
    else if (g) l3RebuildOne(p);
    if (typeof l3MkRefresh === "function") l3MkRefresh(p);
  });
  l3gx.last = { x: P.position.x, y: P.position.y, z: P.position.z, r: P.rotation.z }; l3Render();
}
function l3gxEnd() {
  l3gxList().forEach(p => placeTouch(p));
  l3gxList().forEach(p => { if ((placeLib(p.type) || {}).fence) { try { l3RebuildOne(p); } catch (e) { console.warn(e); } } });
  l3Changed(); l3RenderSide(); l3gxPlacePivot();
  if (l3gx.copied) { l3Status(`${l3gx.copied} ${l3gx.copied === 1 ? "kopia lämnades kvar" : "kopior lämnades kvar"} på ursprungsplatsen.`); l3gx.copied = 0; }
}

/* ---- Kopiera vid flytt: kopiorna ligger kvar där objekten stod ---- */
function l3gxCopyOnStart() {
  l3gx.made = []; l3gx.copied = 0;
  if (!(l3gx.copy || l3gx.ctrl) || !(l3.gizmo.dragging || (l3.gizmoR && l3.gizmoR.dragging))) return;
  const list = l3gxList().filter(p => !p.locked); if (!list.length) return;
  list.forEach(p => { const c = JSON.parse(JSON.stringify(p)); delete c.locked; delete c.ifc_at; Object.assign(c, { id: ghNewId(), created_at: new Date().toISOString(), by: settings.userName || null, name: placeNextName(String(p.name || "").replace(/\s+\d+$/, "")) }); placements.push(c); placeTouch(c); l3AddPlacementMesh(c); l3gx.copied++; l3gx.made.push(c.id); });
  if (l3gx.pivot && l3.gizmo.object === l3gx.pivot) l3gxPlacePivot();
}

/* Bara ett klick på handtaget (inget flyttades): kopiorna tas bort igen. */
function l3gxDropCopies() {
  const ids = new Set(l3gx.made); if (!ids.size) return; l3gx.made = []; l3gx.copied = 0;
  placements = placements.filter(p => !ids.has(p.id)); ids.forEach(id => { placeDirty.delete(id); const g = l3.placeMeshes.get(id); if (g) l3.groups.places.remove(g); l3.placeMeshes.delete(id); });
  if (typeof l3RenderObjList === "function") l3RenderObjList();
}
function l3gxMoved() { const s = l3.dragStart, g = l3.gizmo.object; return !s || !g || Math.abs(s.x - g.position.x) > 1e-4 || Math.abs(s.y - g.position.y) > 1e-4 || Math.abs(s.z - g.position.z) > 1e-4 || Math.abs(s.r - g.rotation.z) > 1e-6; }

/* ---- Verktygstips vid markören: vad handtaget under den gör ---- */
const L3GX_TIPS = { X: ["Flytta längs X-axeln", "Dra för att flytta åt öst/väst"], Y: ["Flytta längs Y-axeln", "Dra för att flytta åt norr/söder"], Z: ["Flytta i höjd", "Dra uppåt eller nedåt"], XY: ["Flytta i planet", "Dra för att flytta fritt i sidled"], XYZ: ["Flytta fritt", "Dra för att flytta åt alla håll"], E: ["Vrid runt lodaxeln", "Dra runt ringen – Skift ger steg"] };
function l3gxTip(axis, ring) {
  const host = l3.renderer.domElement.parentElement; let el = document.getElementById("v3GzTip"); if (!el) { el = document.createElement("div"); el.id = "v3GzTip"; el.className = "v3-gz-tip"; host.appendChild(el); }
  if (!axis || l3.gizmo.dragging || (l3.gizmoR && l3.gizmoR.dragging)) { el.style.display = "none"; return; }
  const rot = ring || l3.gizmo.mode === "rotate", t = rot ? L3GX_TIPS.E : (L3GX_TIPS[axis] || null); if (!t) { el.style.display = "none"; return; }
  const copy = !rot && !l3gx.copy ? "Håll Ctrl för att kopiera" : t[1];
  el.innerHTML = `<b>${t[0]}</b><span>${rot ? t[1] : copy}</span>`; const r = host.getBoundingClientRect(), p = l3gx.ptr || { x: r.width / 2, y: r.height / 2 };
  el.style.left = Math.min(r.width - 200, Math.max(8, p.x + 16)) + "px"; el.style.top = Math.max(8, p.y - 64) + "px"; el.style.display = "block";
}

/* ---- Snurrande pilar på vridringen ---- */
function l3gxDecor() {
  if (l3gx.decor) return l3gx.decor;
  const grp = new THREE.Group(), spin = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: 0x4f9bff, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95, toneMapped: false });
  const tip = new THREE.LatheGeometry([[0.0001, 0], [0.026, 0.006], [0.043, 0.028], [0.043, 0.056], [0.026, 0.088], [0.0001, 0.122]].map(q => new THREE.Vector2(q[0], q[1])), 20); tip.translate(0, -0.06, 0);
  for (let k = 0; k < 3; k++) { const a = new THREE.Group(); a.rotation.z = k * Math.PI * 2 / 3; const m = new THREE.Mesh(tip, mat); m.position.set(0.5, 0, 0); m.renderOrder = 11; m.raycast = () => {}; a.add(m);
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.009, 6, 18, Math.PI / 5), new THREE.MeshBasicMaterial({ color: 0x4f9bff, depthTest: false, depthWrite: false, transparent: true, opacity: 0.5, toneMapped: false })); tail.rotation.z = -Math.PI / 5; tail.renderOrder = 11; tail.raycast = () => {}; a.add(tail); spin.add(a); }
  grp.add(spin); grp.userData.spin = spin;
  const dm = new THREE.MeshBasicMaterial({ color: 0x3b82f6, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95, toneMapped: false });
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2, d = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), dm); d.position.set(0.5 * Math.cos(a), 0.5 * Math.sin(a), 0); d.rotation.z = a; d.renderOrder = 11; d.raycast = () => {}; grp.add(d); }   // diskreta handtag på ringen
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.022, 8, 128), new THREE.MeshBasicMaterial({ color: 0x60a5fa, depthTest: false, depthWrite: false, transparent: true, opacity: 0.14, toneMapped: false })); halo.renderOrder = 10; halo.raycast = () => {}; grp.add(halo);
  grp.userData.noHit = true; grp.visible = false; l3.scene.add(grp); l3gx.decor = grp; return grp;
}
function l3gxDecorUpdate() {
  const o = l3.gizmo.object, rot = l3.gizmo.mode === "rotate", ring = l3.gizmoR, d = l3gxDecor();
  const show = !!o && !o.userData.bmove && (rot ? l3.gizmo.showZ : !!(ring && ring.object)) && !l3.dlgPick && !l3.clipPick && !l3.vPick;
  d.visible = show; if (!show) return false;
  const cam = l3.camera, size = rot ? l3.gizmo.size : ring.size, pos = o.position;
  const f = cam.isOrthographicCamera ? (cam.top - cam.bottom) / cam.zoom : pos.distanceTo(cam.position) * Math.min(1.9 * Math.tan(Math.PI * cam.fov / 360) / cam.zoom, 7);
  d.position.copy(pos); d.scale.setScalar(f * size / 4);
  const active = rot || (ring && (ring.dragging || ring.axis)) || l3.gizmo.dragging === "z";
  return !!active;
}
function l3gxTick(now) {
  if (!l3 || !l3.gizmo) { l3gx.raf = 0; return; }
  if (!l3gx.t0) l3gx.t0 = now;
  const spin = l3gxDecorUpdate(); l3gx.decor.userData.spin.rotation.z = -((now - l3gx.t0) / 1000) * 0.9;   // medsols ... pilarna visar vridriktningen
  l3gx.raw(); if (spin && now - (l3gx.lastRender || 0) >= 0) { l3gx.lastRender = now; l3gx.raf = requestAnimationFrame(l3gxTick); } else l3gx.raf = 0;
}
function l3gxKick() { if (!l3gx.raf && l3gx.raw) l3gx.raf = requestAnimationFrame(l3gxTick); }

/* ---- Rullgardinens extra rad ---- */
function l3gxPopRow() {
  const pop = document.getElementById("v3GzP"); if (!pop || !l3gz.open || pop.querySelector("#v3GxCopy")) return;
  pop.insertAdjacentHTML("afterbegin", `<label class="v3-lay-sw-row" title="Det du drar blir en kopia – originalet ligger kvar. Du kan också hålla Ctrl när du börjar dra."><span>Kopiera vid flytt <small>(Ctrl)</small></span><span class="v3-lay-sw"><input type="checkbox" role="switch" id="v3GxCopy" ${l3gx.copy ? "checked" : ""} /><i></i></span></label>`);
  pop.querySelector("#v3GxCopy").onchange = e => { l3gx.copy = e.target.checked; };
}

(function () {
  if (typeof l3FromGizmo === "function") { const f = l3FromGizmo; l3FromGizmo = function () { if (L3GX_MULTI()) { try { l3GzConstrain(); l3GzReadout(); } catch (e) { /* bara visning */ } l3gxApply(); return; } return f.apply(this, arguments); }; }
  if (typeof l3DragEnd === "function") { const f = l3DragEnd; l3DragEnd = function () { if (l3gx.made.length && !l3gxMoved()) l3gxDropCopies(); if (L3GX_MULTI()) { if (l3gxMoved()) l3gxEnd(); else l3gxPlacePivot(); return; } const cp = l3gx.copied; const r = f.apply(this, arguments); if (cp) { l3Status(cp + (cp === 1 ? ' kopia lämnades kvar' : ' kopior lämnades kvar') + ' på ursprungsplatsen.'); l3gx.copied = 0; } return r; }; }
  if (typeof l3RefreshSel === "function") { const f = l3RefreshSel; l3RefreshSel = function () { const r = f.apply(this, arguments); try { if (!l3gx.bound && l3 && l3.gizmo) { l3gx.bound = true; [l3.gizmo, l3.gizmoR].forEach(g => g && g.addEventListener("mouseDown", l3gxCopyOnStart)); l3.gizmo.addEventListener("axis-changed", e => l3gxTip(e.value, false)); if (l3.gizmoR) l3.gizmoR.addEventListener("axis-changed", e => l3gxTip(e.value, true)); [l3.gizmo, l3.gizmoR].forEach(g => g && g.addEventListener("mouseDown", () => l3gxTip(null))); l3.renderer.domElement.addEventListener("pointermove", e => { const r = l3.renderer.domElement.parentElement.getBoundingClientRect(); l3gx.ptr = { x: e.clientX - r.left, y: e.clientY - r.top }; const t = document.getElementById("v3GzTip"); if (t && t.style.display === "block") { t.style.left = Math.min(r.width - 200, Math.max(8, l3gx.ptr.x + 16)) + "px"; t.style.top = Math.max(8, l3gx.ptr.y - 64) + "px"; } }); } l3gxAttach(); } catch (e) { console.warn(e); } return r; }; }
  if (typeof l3Mode === "function") { const f = l3Mode; l3Mode = function (m) { f(m); if (l3.gizmo) l3.gizmo.size = m === "rotate" ? 0.8 : 0.62; l3gxKick(); }; }
  if (typeof l3GzPopHtml === "function") { const f = l3GzPopHtml; l3GzPopHtml = function () { return f.apply(this, arguments); }; }
  if (typeof l3Render === "function") { const f = l3Render; l3gx.raw = f; l3Render = function () { let on = false; try { on = l3gxDecorUpdate(); } catch (e) { /* bara visning */ } const r = f.apply(this, arguments); if (on && !l3gx.raf) { l3gx.t0 = 0; l3gxKick(); } return r; }; }
})();
