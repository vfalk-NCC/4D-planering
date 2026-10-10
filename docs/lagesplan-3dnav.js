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
  window.addEventListener("pointercancel", () => { if (l3Piv) l3OrbitPivotEnd(); });
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
  if (e.pointerType !== "mouse") return;
  if (e.button === 1 && e.target === l3.renderer.domElement) e.preventDefault();
  if (typeof l3dGripDown === "function" && l3dGripDown(e)) return; // DXF: dra i en hörnpunkt
  if (l3OrbitPivotStart(e)) return;
  if (e.button === 2) { l3RightDown = { x: e.clientX, y: e.clientY }; return; }
  // Standardläget: Ctrl + vänster-dra (Victor 2026-10-10) eller Flera på ger markeringsfönster i stället för att vrida.
  const ctrl = e.ctrlKey || e.metaKey, tekla = l3IsTekla();
  if (e.button !== 0 || !(tekla || l3.multi || ctrl)) return;
  if (e.target !== l3.renderer.domElement) return; // paneler ovanpå
  if (l3.tool !== "select" || l3.addType || l3.vPick || l3.gizmo.axis || l3.gizmo.dragging) return;
  if (!tekla && l3.orbit.enabled) { l3.orbit.enabled = false; l3.orbitOffForArea = true; } // OrbitControls panorerar annars med Ctrl
  l3Area = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, add: e.shiftKey, toggle: tekla && ctrl, on: false };
}
function l3NavMove(e) {
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
  if (l3Piv && e.button === l3Piv.button) l3OrbitPivotEnd();
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
  if (!want || l3.gizmo.axis || l3.gizmo.dragging) return false;
  const P = l3PivotPoint(e);
  // OrbitControls får inte rotera samtidigt: stäng av knappen tills släpp (trycket når ändå
  // duken så att ett vanligt tryck fortfarande markerar).
  const key = e.button === 1 ? "MIDDLE" : "LEFT";
  l3Piv = { button: e.button, key, prev: l3.orbit.mouseButtons[key], x: e.clientX, y: e.clientY, P, on: false };
  l3.orbit.mouseButtons = { ...l3.orbit.mouseButtons, [key]: -1 };
  if (e.button === 1) e.preventDefault(); // ingen autoscroll i webbläsaren
  return true;
}
/* Punkten under markören: närmaste yta, annars planet genom målpunkten vinkelrätt mot blicken. */
function l3PivotPoint(e) {
  const hit = l3Ray(e, l3Surfaces())[0];
  if (hit) return hit.point.clone();
  const r = l3.renderer.domElement.getBoundingClientRect(), rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), l3.camera);
  const n = l3.camera.getWorldDirection(new THREE.Vector3()), pl = new THREE.Plane().setFromNormalAndCoplanarPoint(n, l3.orbit.target);
  return rc.ray.intersectPlane(pl, new THREE.Vector3()) || l3.orbit.target.clone();
}
function l3OrbitPivotMove(e) {
  const v = l3Piv;
  if (e.buttons === 0) { l3OrbitPivotEnd(); return; } // knappen släpptes utan att vi märkte det
  if (!v.on) {
    if (Math.hypot(e.clientX - v.x, e.clientY - v.y) < 3) return;
    v.on = true; l3StopFly(); l3PivMark(true);
  }
  const h = l3.renderer.domElement.clientHeight || 600, dx = e.clientX - v.x, dy = e.clientY - v.y;
  v.x = e.clientX; v.y = e.clientY;
  l3OrbitAbout(v.P, -2 * Math.PI * dx / h, 2 * Math.PI * dy / h); // markeringen flyttas när bilden ritas (l3Render)
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
    const hit = l3Ray(e, l3Surfaces())[0];
    let P = hit ? hit.point : null;
    if (!P) {
      const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, cam);
      const n = cam.getWorldDirection(new THREE.Vector3()), pl = new THREE.Plane().setFromNormalAndCoplanarPoint(n, orbit.target);
      P = rc.ray.intersectPlane(pl, new THREE.Vector3()) || orbit.target.clone();
    }
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
