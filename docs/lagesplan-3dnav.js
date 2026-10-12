/* 3D-vyn: navigering och markering som i Tekla Structures (Victor 2026-10-08: "ta alla godbitar från
   Tekla och gör det 10 gånger bättre"). Två musscheman (Visa → Mus):
   - Tekla (standard): vänster = markera (dra en ruta), mitten = panorera, Ctrl/Skift + mitten = rotera,
     höger = meny, hjulet zoomar mot markören.
   - Standard: vänster = rotera, höger/mitten = panorera, hjulet zoomar mot markören.
   Områdesmarkering som i Tekla/AutoCAD: dra från vänster till höger = det som ligger helt inne i
   rutan, från höger till vänster = allt som rutan nuddar. Skift lägger till, Ctrl växlar.
   V + tryck = vyn centreras kring punkten (rotationscentrum). Ctrl+P = plan (uppifrån, parallell
   projektion) <-> 3D. Parallell/perspektiv kan också väljas i Vyer. Axelkors med norrpil i hörnet. */

function l3NavInit() {
  const el = l3.renderer.domElement, host = el.parentElement;
  l3.orbit.enableZoom = false; // egen zoom mot markören (OrbitControls r147 zoomar bara mot mitten)
  l3ApplyMouse();
  host.addEventListener("pointerdown", l3NavDown, true); // före OrbitControls/TransformControls
  window.addEventListener("pointermove", l3NavMove);
  window.addEventListener("pointerup", l3NavUp);
  window.addEventListener("pointercancel", e => { if (e.pointerType === "touch") { l3Touches.delete(e.pointerId); l3TouchAt.delete(e.pointerId); if (l3Pinch) l3PinchEnd(); } if (l3Piv) l3OrbitPivotEnd(); });
  window.addEventListener("blur", () => { if (l3Piv) l3OrbitPivotEnd(); }); // släppt utanför fönstret
  el.addEventListener("wheel", l3Wheel, { passive: false });
  host.addEventListener("wheel", () => { l3.orbit.enableZoom = false; }, { capture: true, passive: true }); // före OrbitControls
  if (l3IsTouch()) { l3.gizmo.size = 1.5; l3.orbit.rotateSpeed = 0.8; }
  // Egenskapsarket (iPhone): ▾ fäller ihop det så att modellen syns.
  const side = document.getElementById("v3Side");
  if (side) side.addEventListener("click", e => { if (e.target.closest(".v3-side-min")) side.classList.toggle("min"); });
  // Mittenknappen: ingen autoscroll (Windows) och ingen inklistring (Linux) – den panorerar/roterar.
  el.addEventListener("mousedown", e => { if (e.button === 1) e.preventDefault(); });
  el.addEventListener("auxclick", e => { if (e.button === 1) e.preventDefault(); });
  const rect = document.createElement("div"); rect.className = "v3-rect hidden"; host.appendChild(rect); l3.rectEl = rect;
  const tri = document.createElement("div"); tri.className = "v3-triad"; tri.title = "Klicka för vy uppifrån (plan)"; host.appendChild(tri); l3.triadEl = tri;
  tri.onclick = () => l3View("top");
  l3.orbit.addEventListener("change", l3DrawTriad);
  l3DrawTriad();
  l3NavHelp();
}
/* Navigeringen synlig (Victor 2026-10-12: "se vilka knappar man använder för att navigera och navigera mer
   intuitivt"): en liten knapp vid axelkorset fäller ut en ruta med musens och tangenternas funktioner för det
   valda musschemat, och schemat kan bytas direkt där. Öppen första gången, sedan som man lämnade den. */
const L3_NAV_ICO = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/></svg>';
function l3NavHelp() {
  const host = l3.renderer.domElement.parentElement;
  let box = document.getElementById("v3NavHelp");
  if (!box) { box = document.createElement("div"); box.id = "v3NavHelp"; box.className = "v3-navhelp"; host.appendChild(box); box.addEventListener("pointerdown", e => e.stopPropagation()); box.addEventListener("wheel", e => e.stopPropagation()); }
  const P = l3Prefs(), open = P.navHelp !== false, tekla = l3IsTekla(), touch = l3IsTouch();
  const r = (k, t) => `<div class="v3-nh-r"><span class="v3-nh-k">${k}</span><span>${t}</span></div>`;
  const m = (b, x) => `<i class="v3-nh-m ${b}"></i>${x || ""}`;
  const rows = touch ? [
    r("1 finger", "Rotera kring punkten under fingret"), r("2 fingrar", "Panorera och nyp för att zooma"), r("Två tryck", "Flyg dit"), r("Håll kvar", "Meny")]
    : [
      ...(tekla ? [r(m("l") + "Klick / dra", "Markera · ruta"), r(m("m") + "Dra", "Panorera"), r("Ctrl/Skift + " + m("m") + "dra", "Rotera kring punkten")]
        : [r(m("l") + "Dra", "Rotera kring punkten"), r(m("r") + "/" + m("m") + "Dra", "Panorera"), r("Ctrl + " + m("l") + "dra", "Markera med ruta")]),
      r(m("w") + "Hjul", "Zooma mot markören"), r("Dubbelklick", "Flyg till punkten"),
      r("<kbd>V</kbd>", "Rotationscentrum"), r("<kbd>F</kbd>", "Zooma till markerat"), r("<kbd>Ctrl</kbd>+<kbd>P</kbd>", "Plan ↔ 3D"),
      r("<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>", `<button type="button" class="v3-link" data-nh="walk">Gå runt…</button>`)];
  // Knappen sitter nederst i menyraden (Victor 2026-10-12): här bara rutan, med ✕ för att stänga.
  box.innerHTML = (open ? `<div class="v3-nh-card"><button type="button" class="v3-nh-x" data-nh="tog" title="Dölj navigeringen">✕</button>${touch ? "" : `<div class="v3-segs v3-nh-seg">${[["standard", "Standard"], ["tekla", "Som i Tekla"]].map(([k, l]) => `<button type="button" data-nh-mouse="${k}" class="${(tekla ? "tekla" : "standard") === k ? "on" : ""}">${l}</button>`).join("")}</div>`}${rows.join("")}</div>` : "");
  const tog = box.querySelector('[data-nh="tog"]'); if (tog) tog.onclick = () => { l3SetPref("navHelp", false); l3NavHelp(); };
  const fb = document.getElementById("v3FtNav"); if (fb) { fb.classList.toggle("on", open); fb.setAttribute("aria-pressed", open); }
  host.style.setProperty("--v3-nh", open && box.offsetHeight ? box.offsetHeight + 8 + "px" : "0px"); // förklaringen ligger ovanför rutan
  const w = box.querySelector('[data-nh="walk"]'); if (w) w.onclick = () => { if (typeof l3wStart === "function") l3wStart(); };
  box.querySelectorAll("[data-nh-mouse]").forEach(b => { b.onclick = () => {
    l3SetPref("mouse", b.dataset.nhMouse); l3ApplyMouse(); l3NavHelp();
    document.querySelectorAll("[data-v3mouse]").forEach(x => x.classList.toggle("on", x.dataset.v3mouse === b.dataset.nhMouse));
    l3Status(b.dataset.nhMouse === "tekla" ? "Mus som i Tekla: vänster markerar, mitten panorerar, Ctrl/Skift + mitten roterar." : "Mus Standard: vänster roterar, höger/mitten panorerar, Ctrl + vänster markerar.");
  }; });
}
/* Pekskärm som huvudsaklig inmatning (iPad/iPhone): större handtag, inga tangentbordstips. */
function l3IsTouch() { try { return matchMedia("(pointer: coarse)").matches; } catch (e) { return false; } }
function l3IsTekla() { return l3Prefs().mouse !== "standard"; }
function l3ApplyMouse() {
  const M = THREE.MOUSE;
  l3.orbit.mouseButtons = l3IsTekla() ? { LEFT: -1, MIDDLE: M.PAN, RIGHT: -1 } : { LEFT: l3.multi ? -1 : M.ROTATE, MIDDLE: M.PAN, RIGHT: M.PAN };
}

// ---------------------------------------------------------------------
// Områdesmarkering och höger-dra (ingen meny efter panorering)
// ---------------------------------------------------------------------
let l3Area = null, l3RightDown = null;
function l3NavDown(e) {
  // Nyp-zoom med två fingrar sköts av OrbitControls; mushjulet av l3Wheel (zoom mot markören).
  l3.orbit.enableZoom = e.pointerType === "touch" || e.pointerType === "pen";
  if (e.pointerType === "touch") { l3TouchDown(e); return; }
  if (e.pointerType !== "mouse") return;
  if (e.button === 1 && e.target === l3.renderer.domElement) e.preventDefault();
  if (typeof l3dGripDown === "function" && l3dGripDown(e)) return; // DXF: dra i en hörnpunkt
  if (l3OrbitPivotStart(e)) return;
  l3PanAnchor(e);
  if (e.button === 2) { l3RightDown = { x: e.clientX, y: e.clientY }; return; }
  // Standardläget: Ctrl + vänster-dra (Victor 2026-10-10) eller Flera på ger markeringsfönster i stället för att vrida.
  const ctrl = e.ctrlKey || e.metaKey, tekla = l3IsTekla();
  if (e.button !== 0 || !(tekla || l3.multi || ctrl)) return;
  if (e.target !== l3.renderer.domElement) return; // paneler ovanpå
  if (l3.tool !== "select" || l3.addType || l3.vPick || l3.gizmo.axis || l3.gizmo.dragging || (l3.gizmoR && (l3.gizmoR.axis || l3.gizmoR.dragging))) return;
  if (!tekla && l3.orbit.enabled) { l3.orbit.enabled = false; l3.orbitOffForArea = true; } // OrbitControls panorerar annars med Ctrl
  l3Area = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, add: e.shiftKey, toggle: tekla && ctrl, on: false };
}
/* Panorering i rätt takt (Victor 2026-10-10: "ibland blir panoreringen jätteseg så man panorerar pyttelite i
   taget"): OrbitControls panorerar efter avståndet till sin målpunkt, och den kan efter zoom mot markören
   ligga nästan i kameran. När en panorering börjar läggs målpunkten på samma djup som det man tar tag i
   (ytan under markören) – rakt fram, så att bilden inte rör sig – och det man håller i följer musen. */
function l3PanAnchor(e) {
  if (e.target !== l3.renderer.domElement || l3.camera.isOrthographicCamera) return;
  const M = THREE.MOUSE, mb = l3.orbit.mouseButtons;
  const act = e.button === 0 ? mb.LEFT : e.button === 1 ? mb.MIDDLE : e.button === 2 ? mb.RIGHT : -1;
  const pan = act === M.PAN || (act === M.ROTATE && (e.ctrlKey || e.metaKey || e.shiftKey) && l3.orbit.enabled);
  if (!pan) return;
  const cam = l3.camera, fwd = cam.getWorldDirection(new THREE.Vector3());
  let hit = l3Ray(e, l3Surfaces())[0];
  if (typeof l3pcNearer === "function") hit = l3pcNearer(e, hit); // panorera med punkten i molnet under markören
  let d = hit ? hit.point.clone().sub(cam.position).dot(fwd) : 0;
  if (!(d > 0.3)) { const c = l3SceneBox().getCenter(new THREE.Vector3()); d = Math.max(c.sub(cam.position).dot(fwd), l3.orbit.target.distanceTo(cam.position)); }
  if (!(d > 0.3)) return;
  l3StopFly();
  l3.orbit.target.copy(cam.position).addScaledVector(fwd, d);
  l3.orbit.update();
}
function l3NavMove(e) {
  if (e.pointerType === "touch" && l3TouchAt.has(e.pointerId)) {
    l3TouchAt.set(e.pointerId, [e.clientX, e.clientY]);
    if (l3Pinch) { l3PinchMove(); return; }
  }
  if (l3Piv) { l3OrbitPivotMove(e); return; }
  if (!l3Area) return;
  l3Area.x1 = e.clientX; l3Area.y1 = e.clientY;
  if (!l3Area.on && Math.hypot(l3Area.x1 - l3Area.x0, l3Area.y1 - l3Area.y0) > 6) l3Area.on = true;
  if (!l3Area.on) return;
  const r = l3.renderer.domElement.getBoundingClientRect(), el = l3.rectEl;
  const x = Math.min(l3Area.x0, l3Area.x1) - r.left, y = Math.min(l3Area.y0, l3Area.y1) - r.top;
  el.style.left = x + "px"; el.style.top = y + "px";
  el.style.width = Math.abs(l3Area.x1 - l3Area.x0) + "px"; el.style.height = Math.abs(l3Area.y1 - l3Area.y0) + "px";
  el.classList.toggle("cross", l3Area.x1 < l3Area.x0);
  el.classList.remove("hidden");
}
function l3NavUp(e) {
  if (e.pointerType === "touch") { l3TouchUp(e); return; }
  if (l3Piv && !l3Piv.touch && e.button === l3Piv.button) l3OrbitPivotEnd();
  if (e.button === 2 && l3RightDown) { l3.noCtx = Math.hypot(e.clientX - l3RightDown.x, e.clientY - l3RightDown.y) > 6; l3RightDown = null; }
  if (l3.orbitOffForArea) { l3.orbitOffForArea = false; l3.orbit.enabled = true; }
  if (!l3Area) return;
  const a = l3Area; l3Area = null;
  l3.rectEl.classList.add("hidden");
  if (!a.on) return;
  if (typeof l3dRect === "function" && l3dRect(a)) return; // DXF-redigering: linjer
  const ids = l3IdsInRect(a.x0, a.y0, a.x1, a.y1, a.x1 < a.x0);
  // Ingen etablering i rutan: objekt i byggnaden (IFC) vars mitt ligger i rutan.
  if (!ids.length && typeof l3bsInRect === "function" && l3b.models.length) {
    const r = l3.renderer.domElement.getBoundingClientRect();
    const cross = a.x1 < a.x0;
    const bs = l3bsInRect(Math.min(a.x0, a.x1) - r.left, Math.max(a.x0, a.x1) - r.left, Math.min(a.y0, a.y1) - r.top, Math.max(a.y0, a.y1) - r.top, r, cross);
    if (bs.length) {
      const cur = a.add || a.toggle ? l3bs.sel.map(x => ({ mesh: x.mesh, ri: x.ri })) : [];
      const have = new Set(cur.map(x => l3bsKey(x.mesh, x.ri)));
      bs.forEach(x => { const k = l3bsKey(x.mesh, x.ri); if (have.has(k)) { if (a.toggle) { const i = cur.findIndex(y => l3bsKey(y.mesh, y.ri) === k); cur.splice(i, 1); } } else cur.push(x); });
      l3bsSet(cur);
      l3Status(`${l3bs.sel.length} objekt markerade (${cross ? "allt som rutan nuddar" : "helt inne i rutan"}).${bs.length >= 200000 ? " (högst 200 000 åt gången)" : ""}`);
      return;
    }
  }
  let next;
  if (a.toggle) { next = new Set(l3.sel); ids.forEach(id => (next.has(id) ? next.delete(id) : next.add(id))); next = [...next]; }
  else next = a.add ? [...new Set([...l3.sel, ...ids])] : ids;
  l3SelectIds(next);
  l3Status(ids.length ? `${ids.length} objekt markerade (${a.x1 < a.x0 ? "allt som rutan nuddar" : "helt inne i rutan"}).` : "Inget etableringsobjekt i rutan.");
}
/* Etableringsobjekt i en skärmruta. cross = allt som rutan nuddar, annars bara de som ligger helt inne. */
function l3IdsInRect(x0, y0, x1, y1, cross) {
  const r = l3.renderer.domElement.getBoundingClientRect();
  const L = Math.min(x0, x1) - r.left, R = Math.max(x0, x1) - r.left, T = Math.min(y0, y1) - r.top, B = Math.max(y0, y1) - r.top;
  const out = [];
  l3.placeMeshes.forEach((g, id) => {
    if (!g.visible) return;
    const b = new THREE.Box3(); // utan kranens räckviddsskiva
    g.updateMatrixWorld(true); g.children.forEach(m => { if (!m.userData.noHit) b.expandByObject(m); });
    if (b.isEmpty()) return;
    const pts = [];
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      const q = new THREE.Vector3(x, y, z).project(l3.camera);
      if (q.z > 1) continue;
      pts.push([(q.x + 1) / 2 * r.width, (1 - q.y) / 2 * r.height]);
    }
    if (!pts.length) return;
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const inside = Math.min(...xs) >= L && Math.max(...xs) <= R && Math.min(...ys) >= T && Math.max(...ys) <= B;
    const touch = Math.max(...xs) >= L && Math.min(...xs) <= R && Math.max(...ys) >= T && Math.min(...ys) <= B;
    if (cross ? touch : inside) out.push(id);
  });
  return out;
}

// ---------------------------------------------------------------------
// Automatiskt rotationscentrum (Tekla): rotationen sker kring punkten under markören där man
// tryckte ner (Ctrl/Skift + mitten i Tekla-läget, vänster i standardläget). Kameran hoppar inte –
// kamera och mål vrids tillsammans kring punkten. Av/på under Visa → Mus.
// ---------------------------------------------------------------------
let l3Piv = null;
function l3AutoRot() { return l3Prefs().autoRot !== false; }
function l3OrbitPivotStart(e) {
  if (l3Piv) l3OrbitPivotEnd();
  if (!l3AutoRot() || e.target !== l3.renderer.domElement) return false;
  const tekla = l3IsTekla();
  const want = tekla ? e.button === 1 && (e.ctrlKey || e.shiftKey || e.metaKey) : e.button === 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey && !l3.multi;
  if (!want || l3.gizmo.axis || l3.gizmo.dragging || (l3.gizmoR && (l3.gizmoR.axis || l3.gizmoR.dragging))) return false;
  const P = l3PivotPoint(e);
  // OrbitControls får inte rotera samtidigt: stäng av knappen tills släpp (trycket når ändå
  // duken så att ett vanligt tryck fortfarande markerar).
  const key = e.button === 1 ? "MIDDLE" : "LEFT";
  l3Piv = { button: e.button, key, prev: l3.orbit.mouseButtons[key], x: e.clientX, y: e.clientY, P, on: false };
  l3.orbit.mouseButtons = { ...l3.orbit.mouseButtons, [key]: -1 };
  if (e.button === 1) e.preventDefault(); // ingen autoscroll i webbläsaren
  return true;
}
/* Pekskärm (Victor 2026-10-11: "Rotationscentrum på iPhone är konstigt"): ett finger vrider kring punkten
   under fingret – som med musen – i stället för kring OrbitControls målpunkt, som efter nyp och panorering kan
   ligga långt bort. Den runda markeringen visar punkten. Två fingrar (nyp/panorera) sköts av OrbitControls. */
const l3Touches = new Set(), l3TouchAt = new Map();
function l3TouchDown(e) {
  l3Touches.add(e.pointerId); l3TouchAt.set(e.pointerId, [e.clientX, e.clientY]);
  if (l3Touches.size > 1) { // två fingrar: nyp/panorera (OrbitControls)
    if (l3Piv && l3Piv.touch) l3OrbitPivotEnd();
    if (l3Touches.size === 2) l3PinchStart(); else l3PinchEnd();
    return;
  }
  if (!l3AutoRot() || e.target !== l3.renderer.domElement || l3.camera.isOrthographicCamera) return;
  if (l3.tool !== "select" || l3.addType || l3.multi || l3.gizmo.axis || l3.gizmo.dragging || (l3.gizmoR && (l3.gizmoR.axis || l3.gizmoR.dragging))) return;
  if (l3Piv) l3OrbitPivotEnd();
  l3Piv = { touch: true, id: e.pointerId, button: 0, x: e.clientX, y: e.clientY, P: l3PivotPoint(e), on: false, prevOne: l3.orbit.touches.ONE };
  l3.orbit.touches = { ...l3.orbit.touches, ONE: -1 }; // OrbitControls vrider inte samtidigt (ett tryck markerar fortfarande)
}
function l3TouchUp(e) {
  l3Touches.delete(e.pointerId); l3TouchAt.delete(e.pointerId);
  if (l3Pinch) l3PinchEnd();
  if (l3Piv && l3Piv.touch && l3Piv.id === e.pointerId) l3OrbitPivotEnd();
}
/* Två fingrar i rätt takt (Victor 2026-10-11: "Panoreringen är alldeles för snabb på iPhone" – "Zoomen också"):
   OrbitControls panorerade och zoomade efter avståndet till sin målpunkt (som kan ligga långt bort) och zoomade
   mot skärmens mitt. Nu sköts två fingrar här: punkten mellan fingrarna (ytan där, annars modellens djup) står
   kvar under fingrarna – nyp isär och det växer i fingrarnas takt, dra och det följer med. */
let l3Pinch = null;
function l3PinchPts() { const p = [...l3TouchAt.values()].slice(0, 2); return p.length < 2 ? null : { m: [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2], d: Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]) }; }
function l3PinchStart() {
  l3PinchEnd();
  if (!l3 || l3.camera.isOrthographicCamera) return; // parallell projektion: OrbitControls följer redan fingrarna
  const q = l3PinchPts(); if (!q || q.d < 4) return;
  const cam = l3.camera, fwd = cam.getWorldDirection(new THREE.Vector3()), ev = { clientX: q.m[0], clientY: q.m[1] };
  const hit = l3Ray(ev, l3Surfaces())[0];
  let P = hit ? hit.point.clone() : null;
  if (!P) { // ingen yta mellan fingrarna: planet genom modellens mitt (vinkelrätt mot blicken)
    const c = l3SceneBox().getCenter(new THREE.Vector3()), pl = new THREE.Plane().setFromNormalAndCoplanarPoint(fwd, c.clone().sub(cam.position).dot(fwd) > 0.3 ? c : l3.orbit.target);
    P = l3PinchRay(q.m).intersectPlane(pl, new THREE.Vector3());
  }
  if (!P || P.clone().sub(cam.position).dot(fwd) < 0.05) return;
  l3StopFly();
  l3Pinch = { P, last: q, prevTwo: l3.orbit.touches.TWO };
  l3.orbit.touches = { ...l3.orbit.touches, TWO: -1 }; // OrbitControls gör inget med två fingrar medan vi sköter dem
}
function l3PinchRay(m) {
  const r = l3.renderer.domElement.getBoundingClientRect(), rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2((m[0] - r.left) / r.width * 2 - 1, -((m[1] - r.top) / r.height) * 2 + 1), l3.camera);
  return rc.ray;
}
function l3PinchMove() {
  const v = l3Pinch, q = l3PinchPts(); if (!v || !q || q.d < 4) return;
  const cam = l3.camera, T = l3.orbit.target, P = v.P;
  // Zoom kring P (P ligger kvar på samma ställe i bilden), högst 3 cm från punkten och 20 km bort.
  let k = v.last.d / q.d;
  const dist = cam.position.distanceTo(P);
  k = Math.max(0.03 / dist, Math.min(20000 / dist, k));
  cam.position.sub(P).multiplyScalar(k).add(P);
  T.sub(P).multiplyScalar(k).add(P);
  cam.updateMatrixWorld();
  // Panorera: punkten följer fingrarnas mittpunkt.
  const fwd = cam.getWorldDirection(new THREE.Vector3()), pl = new THREE.Plane().setFromNormalAndCoplanarPoint(fwd, P);
  const Q = l3PinchRay(q.m).intersectPlane(pl, new THREE.Vector3());
  if (Q) { const sh = P.clone().sub(Q); cam.position.add(sh); T.add(sh); }
  v.last = q;
  l3.orbit.update();
  if (typeof l3PivFlash === "function") l3PivFlash(P);
  l3Render();
}
function l3PinchEnd() {
  if (!l3Pinch) return;
  l3.orbit.touches = { ...l3.orbit.touches, TWO: l3Pinch.prevTwo };
  l3Pinch = null;
}
/* Punkten under markören: närmaste yta, annars planet genom målpunkten vinkelrätt mot blicken. */
function l3PivotPoint(e) {
  let hit = l3Ray(e, l3Surfaces())[0];
  if (typeof l3pcNearer === "function") hit = l3pcNearer(e, hit); // punkten i molnet om den ligger närmare
  if (hit) return hit.point.clone();
  const r = l3.renderer.domElement.getBoundingClientRect(), rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), l3.camera);
  const n = l3.camera.getWorldDirection(new THREE.Vector3()), pl = new THREE.Plane().setFromNormalAndCoplanarPoint(n, l3.orbit.target);
  return rc.ray.intersectPlane(pl, new THREE.Vector3()) || l3.orbit.target.clone();
}
function l3OrbitPivotMove(e) {
  const v = l3Piv;
  if (v.touch && e.pointerId !== v.id) return; // ett annat finger
  // Fingret tog tag i flytt-/vridhandtaget eller ett mått-/DXF-handtag: det draget gäller, inte vridningen.
  if (v.touch && (!l3.orbit.enabled || l3.gizmo.dragging || (l3.gizmoR && l3.gizmoR.dragging))) { l3OrbitPivotEnd(); return; }
  if (e.buttons === 0) { l3OrbitPivotEnd(); return; } // knappen släpptes utan att vi märkte det
  if (!v.on) {
    if (Math.hypot(e.clientX - v.x, e.clientY - v.y) < (v.touch ? 6 : 3)) return; // ett tryck ska fortfarande markera
    v.on = true; l3StopFly(); l3PivMark(true);
  }
  const h = l3.renderer.domElement.clientHeight || 600, dx = e.clientX - v.x, dy = e.clientY - v.y, k = v.touch ? 0.8 : 1;
  v.x = e.clientX; v.y = e.clientY;
  l3OrbitAbout(v.P, -2 * Math.PI * dx / h * k, 2 * Math.PI * dy / h * k); // markeringen flyttas när bilden ritas (l3Render)
}
/* Vrid kameran kring P: yaw kring lodaxeln, pitch = minskning av blickens polvinkel (uppåt i bilden
   = man tittar mer uppifrån). Samma gränser som OrbitControls (hela vägen från rakt ovanifrån till rakt underifrån). */
function l3OrbitAbout(P, yaw, pitch) {
  const cam = l3.camera, T = l3.orbit.target, Z = new THREE.Vector3(0, 0, 1);
  const off = cam.position.clone().sub(T), len = off.length();
  if (len < 1e-9) return;
  const phi0 = Math.acos(Math.max(-1, Math.min(1, off.z / len))), maxPhi = l3.orbit.maxPolarAngle, minPhi = 0.002;
  const phi1 = Math.max(minPhi, Math.min(maxPhi, phi0 - pitch)), a = phi0 - phi1;
  const q = new THREE.Quaternion();
  if (Math.abs(a) > 1e-9) {
    const f = off.clone().negate().normalize(), r = new THREE.Vector3().crossVectors(f, Z);
    if (r.lengthSq() < 1e-12) r.set(1, 0, 0).applyQuaternion(cam.quaternion); // rakt uppifrån: kamerans högeraxel
    q.setFromAxisAngle(r.normalize(), -a);
  }
  q.premultiply(new THREE.Quaternion().setFromAxisAngle(Z, yaw));
  cam.position.sub(P).applyQuaternion(q).add(P);
  T.sub(P).applyQuaternion(q).add(P);
  l3.orbit.update();
  l3Render();
}
function l3OrbitPivotEnd() {
  const v = l3Piv; l3Piv = null;
  if (v.touch) { l3.orbit.touches = { ...l3.orbit.touches, ONE: v.prevOne }; l3PivMark(false); return; }
  l3.orbit.mouseButtons = { ...l3.orbit.mouseButtons, [v.key]: v.prev };
  l3PivMark(false);
}
/* Liten markering av rotationspunkten medan man roterar. */
function l3PivMark(show) {
  let m = l3.pivEl;
  if (!m) { m = document.createElement("div"); m.className = "v3-pivot hidden"; l3.renderer.domElement.parentElement.appendChild(m); l3.pivEl = m; }
  if (!show || !l3Piv) { m.classList.add("hidden"); return; }
  // Samma kamera som bilden: matrisen uppdateras först (annars räknas punkten med förra bildens
  // kamera och markeringen hoppar fram och tillbaka mot modellen – Victor 2026-10-10).
  l3.camera.updateMatrixWorld();
  const q = l3Piv.P.clone().project(l3.camera), el = l3.renderer.domElement;
  m.style.left = ((q.x + 1) / 2 * el.clientWidth) + "px"; m.style.top = ((1 - q.y) / 2 * el.clientHeight) + "px";
  m.classList.remove("hidden");
}
/* Vid zoom (Victor 2026-10-10: "kan den runda ikonen … också visas då för att visa vart man har
   rotationscentrum"): markeringen visas en kort stund på punkten man zoomar mot – med "Rotera kring
   punkten under markören" är det också där vyn roteras; annars på vyns mittpunkt (orbit-målet). */
function l3PivFlash(P) {
  if (l3Piv) return; // roterar redan – den markeringen gäller
  l3PivMark(false);
  const m = l3.pivEl, el = l3.renderer.domElement;
  l3.camera.updateMatrixWorld();
  const q = P.clone().project(l3.camera);
  if (q.z > 1 || Math.abs(q.x) > 1 || Math.abs(q.y) > 1) return;
  m.style.left = ((q.x + 1) / 2 * el.clientWidth) + "px"; m.style.top = ((1 - q.y) / 2 * el.clientHeight) + "px";
  m.classList.remove("hidden");
  clearTimeout(l3PivFlash.t);
  l3PivFlash.t = setTimeout(() => { if (!l3Piv && l3.pivEl) l3.pivEl.classList.add("hidden"); }, 700);
}

// ---------------------------------------------------------------------
// Zoom mot markören
// ---------------------------------------------------------------------
function l3Wheel(e) {
  e.preventDefault();
  if (!l3) return;
  l3StopFly();
  const k = Math.exp(Math.max(-60, Math.min(60, e.deltaY * (e.deltaMode === 1 ? 16 : 1))) * 0.0022); // >1 = ut
  const cam = l3.camera, orbit = l3.orbit;
  const r = l3.renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  if (cam.isOrthographicCamera) {
    const before = new THREE.Vector3(ndc.x, ndc.y, 0).unproject(cam);
    cam.zoom = Math.max(0.0005, Math.min(5000, cam.zoom / k)); cam.updateProjectionMatrix();
    const after = new THREE.Vector3(ndc.x, ndc.y, 0).unproject(cam);
    const d = before.sub(after); cam.position.add(d); orbit.target.add(d);
  } else {
    // Punkten under markören (eller i målplanet) står kvar: kamera och mål skalas kring den.
    let hit = l3Ray(e, l3Surfaces())[0];
    if (typeof l3pcNearer === "function") hit = l3pcNearer(e, hit); // punktmolnet: zooma mot punkten under markören
    let P = hit ? hit.point : null;
    if (!P) {
      const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, cam);
      const n = cam.getWorldDirection(new THREE.Vector3()), pl = new THREE.Plane().setFromNormalAndCoplanarPoint(n, orbit.target);
      P = rc.ray.intersectPlane(pl, new THREE.Vector3()) || orbit.target.clone();
    }
    l3Wheel.P = P.clone();
    const dist = cam.position.distanceTo(P);
    let kk = k;
    if (dist * kk < 0.5) kk = 0.5 / dist;               // inte genom ytan
    if (dist * kk > cam.far * 0.6) kk = (cam.far * 0.6) / dist;
    cam.position.sub(P).multiplyScalar(kk).add(P);
    orbit.target.sub(P).multiplyScalar(kk).add(P);
    cam.near = Math.max(0.02, Math.min(cam.position.distanceTo(orbit.target), dist * kk) / 2000); cam.updateProjectionMatrix();
  }
  orbit.update();
  l3Render();
  l3PivFlash(!l3AutoRot() ? orbit.target : cam.isOrthographicCamera ? l3PivotPoint(e) : l3Wheel.P);
}

// ---------------------------------------------------------------------
// Projektion: perspektiv / parallell, plan <-> 3D
// ---------------------------------------------------------------------
const L3_ORTHO_H = 100; // ortokamerans grundhöjd (m vid zoom 1)
function l3IsOrtho() { return !!(l3 && l3.camera.isOrthographicCamera); }
function l3SetProjection(ortho) {
  if (!l3 || l3IsOrtho() === !!ortho) return;
  const old = l3.camera, orbit = l3.orbit, host = document.getElementById("v3Canvas");
  const aspect = (host.clientWidth || 800) / (host.clientHeight || 600);
  const dist = old.position.distanceTo(orbit.target);
  let cam;
  if (ortho) {
    cam = new THREE.OrthographicCamera(-L3_ORTHO_H * aspect / 2, L3_ORTHO_H * aspect / 2, L3_ORTHO_H / 2, -L3_ORTHO_H / 2, 0.1, 1e6);
    const visible = 2 * dist * Math.tan(THREE.MathUtils.degToRad(old.fov / 2));
    cam.zoom = L3_ORTHO_H / Math.max(0.5, visible);
    const dir = old.position.clone().sub(orbit.target).normalize();
    cam.up.copy(old.up); cam.position.copy(orbit.target).add(dir.multiplyScalar(Math.max(2000, dist * 3)));
  } else {
    cam = new THREE.PerspectiveCamera(50, aspect, 0.1, 20000);
    const visible = L3_ORTHO_H / old.zoom, d = visible / (2 * Math.tan(THREE.MathUtils.degToRad(25)));
    const dir = old.position.clone().sub(orbit.target).normalize();
    cam.up.copy(old.up); cam.position.copy(orbit.target).add(dir.multiplyScalar(d));
    cam.far = Math.max(20000, d * 40); cam.near = Math.max(0.05, d / 2000);
  }
  cam.updateProjectionMatrix();
  l3.camera = cam; orbit.object = cam; l3.gizmo.camera = cam;
  orbit.update();
  l3SetPref("ortho", !!ortho);
  const cb = document.getElementById("v3Ortho"); if (cb) cb.checked = !!ortho;
  l3Resize(); l3Render(); l3DrawTriad();
}
/* Ctrl+P: plan (uppifrån, parallell) <-> 3D (perspektiv, snett ovanifrån) – som i Tekla. */
function l3TogglePlan() {
  if (l3.planMode) { l3.planMode = false; l3SetProjection(!!l3.prefsOrthoBefore); l3View("iso"); l3Status("3D-vy."); }
  else { l3.prefsOrthoBefore = l3IsOrtho(); l3.planMode = true; l3SetProjection(true); l3View("top"); l3Status("Planvy (uppifrån, parallell projektion). Ctrl+P tillbaka till 3D."); }
}
/* Storlek i meter för en skärmpixel vid punkten p (för markörer och gradskiva). */
function l3PxSize(p) {
  const h = l3.renderer.domElement.clientHeight || 600, cam = l3.camera;
  if (cam.isOrthographicCamera) return (cam.top - cam.bottom) / cam.zoom / h;
  return p.distanceTo(cam.position) * 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / h;
}

// ---------------------------------------------------------------------
// V: rotationscentrum
// ---------------------------------------------------------------------
function l3StartV() { l3.vPick = true; l3Render(); l3HandlesPos(); l3Status("Tryck på punkten vyn ska rotera kring (Esc avbryter)."); l3.renderer.domElement.style.cursor = "crosshair"; }
function l3VTap(e) {
  l3.vPick = false; l3.renderer.domElement.style.cursor = "";
  const s = typeof l3Snap === "function" ? l3Snap(e) : null, P = s ? s.point : (l3Ray(e, l3Surfaces())[0] || {}).point;
  if (!P) { l3Status("Ingen punkt där."); return; }
  const cam = l3.camera, dist = cam.isOrthographicCamera ? cam.position.distanceTo(l3.orbit.target) : cam.position.distanceTo(P);
  l3FlyTo(P.clone(), dist, cam.position.clone().sub(l3.orbit.target), 350, true);
  l3Status("Vyn roterar nu kring punkten (Ctrl + mitten-dra för att rotera).");
}

// ---------------------------------------------------------------------
// Axelkors med norrpil
// ---------------------------------------------------------------------
function l3DrawTriad() {
  const el = l3 && l3.triadEl;
  if (!el) return;
  const q = l3.camera.quaternion.clone().invert(), S = 26, c = 36;
  const ax = [["X", 0xdc2626, [1, 0, 0]], ["Y", 0x16a34a, [0, 1, 0]], ["Z", 0x2563eb, [0, 0, 1]]].map(([n, col, v]) => {
    const p = new THREE.Vector3(...v).applyQuaternion(q);
    return { n, col: "#" + col.toString(16).padStart(6, "0"), x: c + p.x * S, y: c - p.y * S, z: p.z };
  }).sort((a, b) => a.z - b.z);
  el.innerHTML = `<svg viewBox="0 0 72 72" width="72" height="72">${ax.map(a => `<line x1="${c}" y1="${c}" x2="${a.x.toFixed(1)}" y2="${a.y.toFixed(1)}" stroke="${a.col}" stroke-width="2.5" stroke-linecap="round"/><text x="${(c + (a.x - c) * 1.28).toFixed(1)}" y="${(c + (a.y - c) * 1.28 + 3.5).toFixed(1)}" fill="${a.col}" font-size="10" font-weight="700" text-anchor="middle">${a.n === "Y" ? "N" : a.n}</text>`).join("")}<circle cx="${c}" cy="${c}" r="2.5" fill="#334155"/></svg>`;
}

// ---------------------------------------------------------------------
// Sparade vyer (som Teklas namngivna vyer): kamera, projektion och snitt per projekt.
// Sparas i webbläsaren (inställningarna för 3D-vyn), i modellens koordinater.
// ---------------------------------------------------------------------
function l3ViewKey() { return typeof projectId !== "undefined" && projectId ? String(projectId) : "_"; }
function l3SavedViews() { return ((l3Prefs().views || {})[l3ViewKey()] || []).filter(v => v && v.t && v.p); }
function l3StoreViews(list) { const all = { ...(l3Prefs().views || {}) }; all[l3ViewKey()] = list; l3SetPref("views", all); }
function l3SaveView(name) {
  name = String(name || "").trim();
  const list = l3SavedViews();
  if (!name) name = `Vy ${list.length + 1}`;
  const O = l3.O, cam = l3.camera, W = v => [0, 1, 2].map(i => Math.round((v.getComponent(i) + O[i]) * 1000) / 1000);
  const v = {
    name, p: W(cam.position), t: W(l3.orbit.target), ortho: !!cam.isOrthographicCamera, zoom: cam.zoom,
    clips: (l3.clips || []).map(c => { const pt = c.plane.coplanarPoint(new THREE.Vector3()); return { n: c.plane.normal.toArray(), p: W(pt), label: c.label }; }),
  };
  const i = list.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
  if (i >= 0) list[i] = v; else list.push(v);
  l3StoreViews(list.slice(-30));
  l3RenderSavedViews();
  l3Status(i >= 0 ? `Vyn "${name}" uppdaterad.` : `Vyn "${name}" sparad – finns under Vyer.`);
}
function l3GoView(i) {
  const v = l3SavedViews()[i];
  if (!v) return;
  const O = l3.O, S = a => new THREE.Vector3(a[0] - O[0], a[1] - O[1], a[2] - O[2]);
  l3StopFly();
  if (l3IsOrtho() !== !!v.ortho) l3SetProjection(!!v.ortho);
  const T = S(v.t), P = S(v.p), dir = P.clone().sub(T);
  const dist = v.ortho ? L3_ORTHO_H / (Math.max(1e-4, v.zoom || 1) * 2 * Math.tan(THREE.MathUtils.degToRad(25))) : dir.length();
  // Snitten i vyn.
  l3.clips = (v.clips || []).map(c => { const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...c.n), S(c.p)); return { plane, base: plane.constant, off: 0, label: c.label || "Snitt" }; });
  // Snittfönstret öppnas inte av sig självt (Victor 2026-10-10) – saxarna i bilden flyttar snitten; är det öppet uppdateras det.
  l3ApplyClips(); if (!l3.clips.length) l3DlgClose("v3Clip"); else if (document.getElementById("v3Clip") && !document.getElementById("v3Clip").classList.contains("hidden")) l3RenderClipDlg();
  l3FlyTo(T, dist, dir, 450);
  l3Status(`Vy: ${v.name}`);
}
function l3DelView(i) { const list = l3SavedViews(); const v = list.splice(i, 1)[0]; l3StoreViews(list); l3RenderSavedViews(); if (v) l3Status(`Vyn "${v.name}" borttagen.`); }
function l3RenderSavedViews() {
  const host = document.getElementById("v3SavedViews");
  if (!host) return;
  const list = l3SavedViews();
  host.innerHTML = list.length ? list.map((v, i) => `<div class="v3-sv"><button type="button" data-svgo="${i}" title="Gå till vyn">${escHtml(v.name)}${v.clips && v.clips.length ? ` <em>· ${v.clips.length} snitt</em>` : ""}</button><button type="button" class="v3-sv-x" data-svdel="${i}" title="Ta bort vyn">✕</button></div>`).join("") : `<div class="v3-pop-hint">Inga sparade vyer än.</div>`;
  host.querySelectorAll("[data-svgo]").forEach(b => { b.onclick = () => { l3HideMenus(); l3GoView(+b.dataset.svgo); }; });
  host.querySelectorAll("[data-svdel]").forEach(b => { b.onclick = e => { e.stopPropagation(); l3DelView(+b.dataset.svdel); }; });
}

// ---------------------------------------------------------------------
// iPad/iPhone: knappar för det som annars kräver tangentbordet (Esc, Enter, skriva ett mått)
// ---------------------------------------------------------------------
function l3FakeKey(key) {
  const e = { key, target: document.body, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {}, stopImmediatePropagation() {}, stopPropagation() {} };
  l3Key(e);
}
function l3TouchBarUpdate() {
  if (!l3) return;
  let bar = l3.touchBar;
  if (!bar) {
    bar = document.createElement("div"); bar.className = "v3-touchbar hidden";
    bar.innerHTML = `<button type="button" data-tb="num" title="Skriv ett exakt mått (avstånd, vinkel eller dx;dy;dz)">123 Mått…</button><button type="button" data-tb="done">✓ Klar</button><button type="button" data-tb="cancel">✕ Avbryt</button>`;
    l3.renderer.domElement.parentElement.appendChild(bar); l3.touchBar = bar;
    bar.onclick = e => e.stopPropagation();
    bar.querySelector('[data-tb="cancel"]').onclick = () => l3FakeKey("Escape");
    bar.querySelector('[data-tb="done"]').onclick = () => l3FakeKey("Enter");
    bar.querySelector('[data-tb="num"]').onclick = async () => {
      const lbl = l3.tool === "rotate" ? "Vinkel i grader (minus = medurs):" : "Avstånd i meter – eller dx;dy;dz från baspunkten:";
      const v = await uiPrompt(lbl, "");
      if (v === null || !v.trim()) return;
      l3t.vcb = v.trim(); l3FakeKey("Enter");
    };
  }
  const t = l3.tool || "select", st = (typeof l3t !== "undefined" && l3t.step) || 0;
  // Smal skärm: fästlägesraden visas bara när man pekar ut punkter.
  const host = l3.renderer.domElement.parentElement, mode = t === "select" && !l3.addType && !l3.dlgPick && !l3.clipPick && !l3.vPick ? "select" : "pick";
  if (host.dataset.tool !== mode) host.dataset.tool = mode;
  const area = t === "measure" && (l3t.mp || []).length;
  const num = (t === "move" || t === "measure" || (t === "rotate" && st === 2)) && st > 0;
  const done = !!l3.fenceId || (area && (l3Prefs().measure === "area" || l3Prefs().measure === "poly"));
  const cancel = st > 0 || area || !!l3.addType || !!l3.dlgPick || !!l3.clipPick || !!l3.vPick || t !== "select";
  const show = l3IsTouch() && (num || done || cancel);
  bar.classList.toggle("hidden", !show);
  if (!show) return;
  bar.querySelector('[data-tb="num"]').classList.toggle("hidden", !num);
  bar.querySelector('[data-tb="done"]').classList.toggle("hidden", !done);
  const cl = st > 0 || area || l3.addType || l3.dlgPick || l3.clipPick || l3.vPick ? "✕ Avbryt" : "✕ Välj", cb = bar.querySelector('[data-tb="cancel"]');
  if (cb.dataset.lbl !== cl) { cb.dataset.lbl = cl; cb.textContent = cl; } // bara vid ändring (ikonerna byts in automatiskt)
}
/* iPhone: arket nedtill täcker nedre halvan – flytta vyn så att det markerade hamnar i övre delen. */
function l3KeepSelVisible() {
  if (!l3 || window.innerWidth >= 700 || l3.sel.size !== 1) return;
  const g = l3.placeMeshes.get([...l3.sel][0]); if (!g) return;
  const P = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3());
  const el = l3.renderer.domElement, h = el.clientHeight || 1, q = P.clone().project(l3.camera), y = (1 - q.y) / 2 * h;
  if (q.z > 1 || y < h * 0.45) return;
  const want = new THREE.Vector2(q.x, 1 - 2 * 0.28); // samma x, 28 % från överkanten
  const rc = new THREE.Raycaster(); rc.setFromCamera(want, l3.camera);
  const n = l3.camera.getWorldDirection(new THREE.Vector3()), Q = rc.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, P), new THREE.Vector3());
  if (!Q) return;
  const d = P.clone().sub(Q);
  l3StopFly(); l3.camera.position.add(d); l3.orbit.target.add(d); l3.orbit.update(); l3Render();
}

/* Verktygsraden på smal skärm (Victor 2026-10-11: "jag kan inte öppna alla menyer i 3d-vyn"): det som inte får
   plats göms bakifrån och ligger under ⋯ Mer – inget hamnar utanför skärmen. Tillbaka, verktygen (Välj, Flytta …)
   står alltid kvar. Menyknapparna (Vyer, Visa, Redigera) göms men deras menyer finns kvar och öppnas från Mer. */
function l3BarFit() {
  const bar = document.querySelector("#view3d .v3-bar");
  if (!bar) return;
  let more = document.getElementById("v3More");
  if (!more) {
    more = document.createElement("button"); more.type = "button"; more.id = "v3More"; more.className = "v3-ghost"; more.title = "Fler verktyg och menyer";
    more.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;
    bar.appendChild(more);
    const pop = document.createElement("div"); pop.id = "v3MorePop"; pop.className = "v3-pop v3-more hidden";
    bar.appendChild(pop);
    pop.onclick = e => e.stopPropagation();
    more.onclick = e => { e.stopPropagation(); const open = pop.classList.contains("hidden"); l3HideMenus(); if (open) { l3MoreRender(); pop.classList.remove("hidden"); } };
  }
  bar.querySelectorAll("[data-ovf]").forEach(el => { el.style.display = ""; delete el.dataset.ovf; });
  more.style.display = "none"; l3.barHidden = [];
  if (bar.scrollWidth <= bar.clientWidth + 1) return;
  more.style.display = "";
  // Ordningen de göms i (det som används minst först). Tillbaka, Välj, Flytta och Ångra står alltid kvar.
  const q = sel => bar.querySelector(sel);
  const order = ["#v3SaveIfc", "#v3HelpBtn", "#v3ViewsBtn", "#v3Fit", "#v3PhotoBtn", "#v3ClipBtn", "#v3EditBtn", "#v3ShowBtn", '[data-v3tool="align"]', "#v3Multi", '[data-v3tool="rotate"]', "#v3Redo", '[data-v3tool="measure"]'].map(q).filter(b => b && b.offsetWidth);
  const hidden = [];
  for (const b of order) {
    if (bar.scrollWidth <= bar.clientWidth + 1) break;
    b.style.display = "none"; b.dataset.ovf = "1"; hidden.push(b);
  }
  // I menyn i samma ordning som i raden.
  const all = [...bar.querySelectorAll("button")];
  hidden.sort((a, b) => all.indexOf(a) - all.indexOf(b));
  l3.barHidden = hidden;
}
function l3MoreRender() {
  const pop = document.getElementById("v3MorePop");
  if (!pop) return;
  const name = b => String(b.title || b.textContent || "").split(/\s[–(]|:/)[0].trim() || "Knapp";
  pop.innerHTML = "";
  (l3.barHidden || []).forEach(b => {
    const r = document.createElement("button"); r.type = "button"; r.disabled = !!b.disabled;
    const ic = b.querySelector("svg"); r.innerHTML = (ic ? ic.outerHTML : "") + `<span>${escHtml(name(b))}</span>`;
    r.onclick = e => { e.stopPropagation(); pop.classList.add("hidden"); b.click(); };
    pop.appendChild(r);
  });
}
