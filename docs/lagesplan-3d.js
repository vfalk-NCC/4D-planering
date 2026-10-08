/* Lägesplanen i 3D (Victors önskemål 2026-10-08): en riktig 3D-vy ovanpå lägesplanen, eftersom ett
   Trimble Connect-tillägg inte kan rita egen geometri i TC:s vy. Visar:
   - arbetsytans PDF som mark (via kalibreringen mot 3D-modellen),
   - de planerade objekten som lådor i statusfärg vid valt datum (från plan_item_positions),
   - etableringen från Placera i 3D med riktig geometri (biblioteksobjekt och hämtade modeller;
     IFC-modeller som sin omslutande låda).
   Etableringen redigeras direkt: dra med handtag (flytta/vrida), fäst mot ytor, lägg till från
   biblioteket med ett tryck, mät, kopiera, ta bort, ångra. Ändringarna sparas i samma fil som i
   4D-planering (plan_placements.json, via place3d.js) och "Spara som IFC" körs av 4D-planering.
   three.js r147 ligger lokalt i vendor/three och laddas först när 3D-vyn öppnas. Koordinaterna
   räknas relativt kalibreringens första punkt (stora SWEREF-tal tål inte 32-bitarsgrafik). */

const L3_SCRIPTS = ["vendor/three/three.min.js", "vendor/three/OrbitControls.js", "vendor/three/TransformControls.js"];
let l3 = null; // { renderer, scene, camera, orbit, gizmo, O, groups, meshes, … }
let l3Loading = null;

function l3LoadScripts() {
  if (window.THREE && THREE.TransformControls) return Promise.resolve();
  if (l3Loading) return l3Loading;
  l3Loading = L3_SCRIPTS.reduce((p, src) => p.then(() => new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Kunde inte ladda " + src));
    document.head.appendChild(s);
  })), Promise.resolve());
  return l3Loading;
}

/* PDF-punkt -> modellens XY (inversen av modelToPdf). */
function l3PdfToModel(px, py) {
  const [m1, m2] = plan.calib.model, [p1, p2] = plan.calib.pdf;
  const mx = m2[0] - m1[0], my = m2[1] - m1[1], qx = p2[0] - p1[0], qy = p2[1] - p1[1];
  const d = mx * mx + my * my, ar = (qx * mx + qy * my) / d, ai = (qy * mx - qx * my) / d, n = ar * ar + ai * ai;
  const dx = px - p1[0], dy = py - p1[1];
  return [m1[0] + (ar * dx + ai * dy) / n, m1[1] + (ar * dy - ai * dx) / n];
}

async function open3d() {
  if (!plan) { alert("Välj en arbetsyta först."); return; }
  if (!plan.calib) { alert("Arbetsytan behöver kalibreras mot 3D-modellen först (Zoner & 3D → Kalibrera). Annars vet 3D-vyn inte var planen ligger."); return; }
  if (!settings.githubToken && token) settings.githubToken = token;
  const box = l3Dom();
  box.classList.remove("hidden");
  l3Status("Laddar 3D…");
  try {
    await l3LoadScripts();
    if (!l3) l3Init(box);
    if (typeof place3dLoad === "function") await place3dLoad({ fresh: true });
    if (typeof placeModelsPrepare === "function") await placeModelsPrepare();
    await l3BuildPlan();
    l3BuildObjects();
    l3BuildPlacements();
    l3Frame();
    l3RenderLib();
    l3Select(null);
    l3Status(`${positions.length ? positions.length + " planerade objekt" : "Inga objektpositioner – hämta dem i Zoner & 3D"} · ${placements.length} etableringsobjekt. Tryck på ett etableringsobjekt för att flytta eller vrida det.`);
  } catch (e) { l3Status("3D-vyn kunde inte öppnas: " + e.message, true); console.error(e); }
  l3Resize(); l3Render();
}
function close3d() {
  const box = document.getElementById("view3d");
  if (box) box.classList.add("hidden");
  if (l3) { l3.gizmo.detach(); l3.addType = null; l3.measure = null; }
  if (typeof placeSaveNow === "function") placeSaveNow().then(l3NotifyOpener).catch(() => {});
}

function l3Dom() {
  let box = document.getElementById("view3d");
  if (box) return box;
  box = document.createElement("div");
  box.id = "view3d"; box.className = "hidden";
  box.innerHTML = `<div class="v3-bar">
      <button type="button" id="v3Close" title="Tillbaka till lägesplanen">✕ 2D</button>
      <span class="v3-sep"></span>
      <button type="button" data-v3mode="translate" class="on" title="Flytta det valda objektet med handtagen (W)">Flytta</button>
      <button type="button" data-v3mode="rotate" title="Vrid det valda objektet (E)">Vrid</button>
      <label class="v3-chk" title="Objektet ställer sig på ytan under sig när du släpper det"><input type="checkbox" id="v3Snap" checked /> Fäst mot ytor</label>
      <select id="v3Step" title="Steg för handtagen"><option value="0">fritt</option><option value="0.1">0,1 m · 5°</option><option value="0.5" selected>0,5 m · 15°</option><option value="1">1 m · 45°</option></select>
      <span class="v3-sep"></span>
      <button type="button" id="v3Measure" title="Mät: tryck två punkter">Mät</button>
      <button type="button" id="v3Undo" title="Ångra (Ctrl+Z)">↶</button>
      <span class="v3-sep"></span>
      <label class="v3-chk"><input type="checkbox" id="v3ShowPlan" checked /> Plan</label>
      <label class="v3-chk"><input type="checkbox" id="v3ShowObjs" checked /> Objekt</label>
      <label class="v3-chk" title="Planerade objekt halvgenomskinliga"><input type="checkbox" id="v3Ghost" /> Genomskinliga</label>
      <span class="v3-grow"></span>
      <button type="button" id="v3SaveIfc" class="v3-primary" title="Etableringen som IFC i Trimble Connect (görs av 4D-planering)">Spara som IFC i TC</button>
    </div>
    <div class="v3-lib" id="v3Lib"></div>
    <div class="v3-canvas" id="v3Canvas"><div class="v3-side hidden" id="v3Side"></div><div class="v3-status" id="v3Status"></div></div>`;
  (document.querySelector("main") || document.body).appendChild(box);
  box.querySelector("#v3Close").onclick = close3d;
  box.querySelectorAll("[data-v3mode]").forEach(b => { b.onclick = () => l3Mode(b.dataset.v3mode); });
  box.querySelector("#v3Step").onchange = l3ApplyStep;
  box.querySelector("#v3Measure").onclick = () => { l3.addType = null; l3.measure = { pts: [] }; l3ClearMeasure(); l3Status("Mät: tryck på första punkten."); l3RenderLib(); };
  box.querySelector("#v3Undo").onclick = l3Undo;
  box.querySelector("#v3ShowPlan").onchange = e => { if (l3.planMesh) l3.planMesh.visible = e.target.checked; l3Render(); };
  box.querySelector("#v3ShowObjs").onchange = e => { if (l3.objMesh) l3.objMesh.visible = e.target.checked; l3Render(); };
  box.querySelector("#v3Ghost").onchange = () => { l3BuildObjects(); l3Render(); };
  box.querySelector("#v3SaveIfc").onclick = l3SaveIfc;
  return box;
}
function l3Status(t, bad) { const el = document.getElementById("v3Status"); if (el) { el.textContent = t || ""; el.classList.toggle("bad", !!bad); } }

function l3Init(box) {
  const host = box.querySelector("#v3Canvas");
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8edf3);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 20000);
  camera.up.set(0, 0, 1);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.85));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6); sun.position.set(-0.5, -0.8, 1.2); scene.add(sun);
  const orbit = new THREE.OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = false; orbit.screenSpacePanning = true; orbit.maxPolarAngle = Math.PI * 0.495;
  const gizmo = new THREE.TransformControls(camera, renderer.domElement);
  gizmo.setSpace("world"); gizmo.size = 0.9;
  scene.add(gizmo);
  const groups = { plan: new THREE.Group(), objs: new THREE.Group(), places: new THREE.Group(), tmp: new THREE.Group() };
  Object.values(groups).forEach(g => scene.add(g));
  const [m1] = plan.calib.model;
  l3 = { renderer, scene, camera, orbit, gizmo, groups, O: [m1[0], m1[1], m1[2] || 0], placeMeshes: new Map(), date: null, addType: null, measure: null };
  orbit.addEventListener("change", l3Render);
  gizmo.addEventListener("change", l3Render);
  gizmo.addEventListener("dragging-changed", e => { orbit.enabled = !e.value; });
  gizmo.addEventListener("mouseDown", () => { if (typeof placeSnapshot === "function") placeSnapshot(); l3.dragStart = l3GroupState(); });
  gizmo.addEventListener("objectChange", l3FromGizmo);
  gizmo.addEventListener("mouseUp", l3DragEnd);
  l3ApplyStep();
  // Tryck (inte dra) = välj / lägg till / mät.
  let down = null;
  renderer.domElement.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY }; });
  renderer.domElement.addEventListener("pointerup", e => {
    if (!down || gizmo.dragging) { down = null; return; }
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    if (moved < 6) l3Tap(e);
  });
  window.addEventListener("resize", () => { if (l3 && !document.getElementById("view3d").classList.contains("hidden")) { l3Resize(); l3Render(); } });
  document.addEventListener("keydown", l3Key);
  // Datum (uppspelning m.m.) -> statusfärgerna följer med.
  setInterval(() => {
    const box = document.getElementById("view3d");
    if (!l3 || !box || box.classList.contains("hidden")) return;
    const d = $("dateInput").value;
    if (d !== l3.date) { l3BuildObjects(); l3Render(); }
  }, 700);
}
function l3Resize() {
  if (!l3) return;
  const host = document.getElementById("v3Canvas"), w = host.clientWidth || 800, h = host.clientHeight || 600;
  l3.renderer.setSize(w, h); l3.camera.aspect = w / h; l3.camera.updateProjectionMatrix();
}
let l3Raf = 0;
function l3Render() { if (!l3 || l3Raf) return; l3Raf = requestAnimationFrame(() => { l3Raf = 0; l3.renderer.render(l3.scene, l3.camera); }); }
const l3Clear = g => { while (g.children.length) { const c = g.children.pop(); c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); }); } };

/* Arbetsytans PDF som mark, på kalibreringens höjd. */
async function l3BuildPlan() {
  l3Clear(l3.groups.plan); l3.planMesh = null;
  const z = (plan.calib.model[0][2] || 0) - l3.O[2];
  if (!page) { l3.groups.plan.add(new THREE.GridHelper(200, 40, 0x94a3b8, 0xcbd5e1).rotateX(Math.PI / 2)); return; }
  const v1 = page.getViewport({ scale: 1 });
  const s = Math.min(4096 / Math.max(v1.width, v1.height), 4);
  const vp = page.getViewport({ scale: s });
  const cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const corners = [[0, cv.height], [cv.width, cv.height], [cv.width, 0], [0, 0]];
  const pos = [], uv = [];
  corners.forEach(([cx, cy]) => {
    const [px, py] = vp.convertToPdfPoint(cx, cy), [mx, my] = l3PdfToModel(px, py);
    pos.push(mx - l3.O[0], my - l3.O[1], z); uv.push(cx / cv.width, 1 - cy / cv.height);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 8;
  if ("encoding" in tex) tex.encoding = THREE.sRGBEncoding;
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
  m.userData.surface = true;
  l3.planMesh = m; l3.groups.plan.add(m);
  m.visible = document.getElementById("v3ShowPlan").checked;
}

/* De planerade objekten som lådor i statusfärg (en enda geometri – tål tusentals objekt). */
function l3BuildObjects() {
  l3Clear(l3.groups.objs); l3.objMesh = null;
  const at = $("dateInput").value || todayIso(); l3.date = $("dateInput").value;
  const warn = Number.isFinite(settings.warningDaysBeforeEnd) ? settings.warningDaysBeforeEnd : 7;
  const byId = new Map(items.map(r => [r.id, r]));
  const pos = [], col = [], ids = [];
  const F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  positions.forEach(p => {
    const r = byId.get(p.id);
    const ph = r ? computeItemPhase(r, at, warn) || "planerad" : "ingen";
    const c = new THREE.Color(phaseColor(ph));
    const h = 0.25;
    const x0 = (p.x0 ?? p.x - h) - l3.O[0], x1 = (p.x1 ?? p.x + h) - l3.O[0], y0 = (p.y0 ?? p.y - h) - l3.O[1], y1 = (p.y1 ?? p.y + h) - l3.O[1];
    const z0 = (p.z0 ?? 0) - l3.O[2], z1 = Math.max(p.z1 ?? 0, (p.z0 ?? 0) + 0.05) - l3.O[2];
    const V = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    F.forEach(f => f.forEach(i => { pos.push(...V[i]); col.push(c.r, c.g, c.b); ids.push(p.id); }));
  });
  if (!pos.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const ghost = document.getElementById("v3Ghost").checked;
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: ghost, opacity: ghost ? 0.35 : 1, depthWrite: !ghost }));
  m.userData.surface = true; m.userData.ids = ids;
  m.visible = document.getElementById("v3ShowObjs").checked;
  l3.objMesh = m; l3.groups.objs.add(m);
}

/* Ett etableringsobjekt som en grupp i sitt eget lokala system (origo = insättningspunkten, ovridet),
   så att handtagens flytt/vridning blir x/y/z/rot direkt. */
function l3PlacementGroup(p) {
  const grp = new THREE.Group();
  grp.userData.placeId = p.id;
  const lib = placeLib(p.type) || {};
  const z = (Number(p.z) || 0) + (Number(p.dz) || 0);
  const add = (geo, color, transp) => {
    const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color), transparent: transp > 0, opacity: 1 - (transp || 0), depthWrite: !(transp > 0.5), side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat); m.userData.placeId = p.id; grp.add(m); return m;
  };
  const prism = (poly, z0, z1) => {
    const n = poly.length, pos = [];
    const P = (q, zz) => [q[0], q[1], zz];
    for (let k = 1; k + 1 < n; k++) pos.push(...P(poly[0], z0), ...P(poly[k + 1], z0), ...P(poly[k], z0), ...P(poly[0], z1), ...P(poly[k], z1), ...P(poly[k + 1], z1));
    for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; pos.push(...P(a, z0), ...P(b, z0), ...P(b, z1), ...P(a, z0), ...P(b, z1), ...P(a, z1)); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
  };
  if (lib.isModel) {
    const a = lib.model, mesh = a && typeof placeMeshCache !== "undefined" ? placeMeshCache.get(a.id) : null;
    const k = placeScale(p);
    if (mesh) {
      mesh.parts.forEach(pt => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pt.p.map(v => v / 1000 * k), 3));
        g.setIndex(pt.i); g.computeVertexNormals();
        add(g, pt.c, pt.t || 0);
      });
    } else if (a && a.bbox) {
      const b = a.bbox;
      const m = add(prism([[b.min[0] * k, b.min[1] * k], [b.max[0] * k, b.min[1] * k], [b.max[0] * k, b.max[1] * k], [b.min[0] * k, b.max[1] * k]], b.min[2] * k, b.max[2] * k), "#0e7490", 0.55);
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0x0e7490 })));
    }
  } else {
    // Biblioteksobjekt: delarna räknade för en kopia i origo (ovriden), staket relativt första punkten.
    const local = { ...p, x: 0, y: 0, z: 0, dz: 0, rot: 0 };
    if (p.pts) local.pts = p.pts.map(q => [q[0] - p.x, q[1] - p.y, (q[2] || 0) - (Number(p.z) || 0)]);
    placeParts(local, 48).forEach(pt => add(prism(pt.poly, pt.z0, pt.z1), p.color || lib.color || "#888888", pt.transp || 0));
  }
  grp.position.set(p.x - l3.O[0], p.y - l3.O[1], z - l3.O[2]);
  if (!lib.fence) grp.rotation.z = (Number(p.rot) || 0) * Math.PI / 180;
  return grp;
}
function l3BuildPlacements() {
  const keep = l3.gizmo.object && l3.gizmo.object.userData.placeId;
  l3.gizmo.detach();
  l3Clear(l3.groups.places); l3.placeMeshes.clear();
  placements.forEach(p => { const g = l3PlacementGroup(p); l3.groups.places.add(g); l3.placeMeshes.set(p.id, g); });
  if (keep && l3.placeMeshes.has(keep)) l3.gizmo.attach(l3.placeMeshes.get(keep));
}
function l3RebuildOne(p) {
  const old = l3.placeMeshes.get(p.id), attached = l3.gizmo.object === old;
  if (old) { if (attached) l3.gizmo.detach(); l3.groups.places.remove(old); old.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  const g = l3PlacementGroup(p); l3.groups.places.add(g); l3.placeMeshes.set(p.id, g);
  if (attached || placeActiveId === p.id) l3.gizmo.attach(g);
  l3Render();
}

function l3Frame() {
  const b = new THREE.Box3();
  [l3.groups.objs, l3.groups.places].forEach(g => b.expandByObject(g));
  if (b.isEmpty() && l3.planMesh) b.expandByObject(l3.planMesh);
  if (b.isEmpty()) b.set(new THREE.Vector3(-50, -50, 0), new THREE.Vector3(50, 50, 10));
  const c = b.getCenter(new THREE.Vector3()), size = Math.max(10, b.getSize(new THREE.Vector3()).length());
  l3.camera.position.set(c.x - size * 0.45, c.y - size * 0.75, c.z + size * 0.55);
  l3.camera.near = Math.max(0.05, size / 5000); l3.camera.far = size * 20; l3.camera.updateProjectionMatrix();
  l3.orbit.target.copy(c); l3.orbit.update();
}

// ---------------------------------------------------------------------
// Välja, dra, fästa
// ---------------------------------------------------------------------
function l3Ray(e, targets) {
  const r = l3.renderer.domElement.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), l3.camera);
  return ray.intersectObjects(targets, true).filter(h => h.object.visible && !(h.object.type === "LineSegments"));
}
const l3Surfaces = (exceptId) => [l3.planMesh, l3.objMesh, ...[...l3.placeMeshes.entries()].filter(([id]) => id !== exceptId).map(([, g]) => g)].filter(o => o && o.visible !== false);
function l3Tap(e) {
  if (l3.measure) {
    const h = l3Ray(e, l3Surfaces())[0];
    if (!h) return;
    l3.measure.pts.push(h.point.clone());
    l3DrawMeasure();
    if (l3.measure.pts.length === 2) {
      const [a, b] = l3.measure.pts, d = a.distanceTo(b), hz = Math.hypot(b.x - a.x, b.y - a.y), dz = b.z - a.z;
      const f = v => v.toLocaleString("sv-SE", { maximumFractionDigits: 2 });
      l3Status(`Avstånd ${f(d)} m · vågrätt ${f(hz)} m · höjdskillnad ${f(dz)} m. Tryck Mät för en ny mätning.`);
      l3.measure = null;
    } else l3Status("Mät: tryck på andra punkten.");
    return;
  }
  if (l3.addType) {
    const h = l3Ray(e, l3Surfaces())[0];
    if (!h) { l3Status("Tryck på marken eller ett objekt."); return; }
    placeSnapshot();
    const pt = [h.point.x + l3.O[0], h.point.y + l3.O[1], h.point.z + l3.O[2]];
    const p = placeNew(l3.addType, pt);
    placements.push(p); placeTouch(p); placeActiveId = p.id;
    const g = l3PlacementGroup(p); l3.groups.places.add(g); l3.placeMeshes.set(p.id, g);
    l3.addType = null; l3RenderLib();
    l3Select(p.id); l3Changed();
    return;
  }
  const hit = l3Ray(e, [...l3.placeMeshes.values()])[0];
  let o = hit && hit.object;
  while (o && !o.userData.placeId) o = o.parent;
  l3Select(o ? o.userData.placeId : null);
}
function l3Select(id) {
  placeActiveId = id && placements.some(p => p.id === id) ? id : null;
  const g = placeActiveId && l3.placeMeshes.get(placeActiveId);
  if (g) l3.gizmo.attach(g); else l3.gizmo.detach();
  l3Mode(l3.gizmo.mode || "translate");
  l3RenderSide();
  l3Render();
}
function l3Mode(mode) {
  const p = placeActive(), fence = p && (placeLib(p.type) || {}).fence;
  if (fence) mode = "translate";
  l3.gizmo.setMode(mode);
  const rot = mode === "rotate";
  l3.gizmo.showX = !rot; l3.gizmo.showY = !rot; l3.gizmo.showZ = true;
  document.querySelectorAll("[data-v3mode]").forEach(b => b.classList.toggle("on", b.dataset.v3mode === mode));
  l3Render();
}
function l3ApplyStep() {
  const v = Number(document.getElementById("v3Step").value) || 0;
  l3.gizmo.setTranslationSnap(v || null);
  l3.gizmo.setRotationSnap(v ? ({ 0.1: 5, 0.5: 15, 1: 45 }[v] || 15) * Math.PI / 180 : null);
}
const l3GroupState = () => { const g = l3.gizmo.object; return g ? { x: g.position.x, y: g.position.y, z: g.position.z } : null; };
/* Handtagen -> placeringen (meter i modellens system). */
function l3FromGizmo() {
  const g = l3.gizmo.object, p = g && placements.find(x => x.id === g.userData.placeId);
  if (!p) return;
  const nx = placeR3(g.position.x + l3.O[0]), ny = placeR3(g.position.y + l3.O[1]), nz = g.position.z + l3.O[2];
  if (p.pts) { const dx = nx - p.x, dy = ny - p.y; p.pts = p.pts.map(q => [placeR3(q[0] + dx), placeR3(q[1] + dy), q[2] || 0]); }
  p.x = nx; p.y = ny;
  p.dz = placeR3(nz - (Number(p.z) || 0));
  if (!(placeLib(p.type) || {}).fence) p.rot = Math.round((((g.rotation.z * 180 / Math.PI) % 360) + 360) % 360 * 10) / 10;
  l3RenderSide(true);
}
function l3DragEnd() {
  const g = l3.gizmo.object, p = g && placements.find(x => x.id === g.userData.placeId);
  if (!p) return;
  const s = l3.dragStart, moved = s && (Math.abs(s.x - g.position.x) > 1e-4 || Math.abs(s.y - g.position.y) > 1e-4);
  // Fäst mot ytan: efter en flytt i plan ställer sig objektet på det som ligger under det.
  if (moved && l3.gizmo.mode === "translate" && document.getElementById("v3Snap").checked && Math.abs(s.z - g.position.z) < 1e-4) l3DropToSurface(p, g);
  placeTouch(p); l3Changed(); l3RenderSide();
}
/* Ställer objektet på ytan rakt under dess mitt (plan, planerade objekt eller annan etablering). */
function l3DropToSurface(p, g) {
  const ray = new THREE.Raycaster(new THREE.Vector3(g.position.x, g.position.y, g.position.z + 500), new THREE.Vector3(0, 0, -1));
  const hits = ray.intersectObjects(l3Surfaces(p.id), true).filter(h => h.object.visible && h.object.type !== "LineSegments");
  if (!hits.length) return false;
  const zTop = hits[0].point.z + l3.O[2];
  p.z = placeR3(zTop); p.dz = 0;
  if (p.pts) p.pts = p.pts.map(q => [q[0], q[1], placeR3(zTop)]);
  g.position.z = zTop - l3.O[2];
  l3Render();
  return true;
}

// ---------------------------------------------------------------------
// Sidopanel för det valda objektet
// ---------------------------------------------------------------------
function l3RenderSide(liveOnly) {
  const side = document.getElementById("v3Side"), p = placeActive();
  if (!side) return;
  side.classList.toggle("hidden", !p);
  if (!p) return;
  const lib = placeLib(p.type) || {}, A = lib.isModel ? lib.model : null;
  if (liveOnly && side.dataset.id === p.id) {
    const set = (k, v) => { const el = side.querySelector(`[data-v3f="${k}"]`); if (el && document.activeElement !== el) el.value = v; };
    set("x", p.x); set("y", p.y); set("dz", p.dz); set("rot", p.rot);
    return;
  }
  side.dataset.id = p.id;
  const f = (k, label, step = "0.1", val = p[k]) => `<label>${label}<input type="number" step="${step}" data-v3f="${k}" value="${val ?? ""}" /></label>`;
  const mH = A && A.bbox ? Math.round((A.bbox.max[2] - A.bbox.min[2]) * placeScale(p) * 100) / 100 : "";
  side.innerHTML = `<input type="text" class="v3-name" data-v3f="name" value="${escHtml(p.name || "")}" />
    <div class="v3-sub">${escHtml(lib.label || p.type)}${A && A.author ? ` · ${escHtml(A.author)}` : ""}${A && A.kind === "ifc" ? " · IFC (visas som låda)" : ""}</div>
    <div class="v3-grid">${f("x", "X m", "0.1")}${f("y", "Y m", "0.1")}${f("dz", "Höjd över ytan m")}${lib.fence ? "" : f("rot", "Vrid °", "1")}
      ${lib.isModel ? (A && A.kind === "mesh" ? f("mH", "Höjd m", "0.1", mH) : "") : lib.fence ? f("H", "Höjd m") : f("L", "Längd m") + f("B", "Bredd m") + f("H", "Höjd m")}
      ${lib.R ? f("R", "Räckvidd m", "1") : ""}</div>
    <div class="v3-btns"><button type="button" id="v3Drop" title="Ställ objektet på ytan under det">Ställ på ytan</button>
      <button type="button" id="v3Copy" title="En kopia bredvid">Kopiera</button>
      <button type="button" id="v3Del" class="v3-danger">Ta bort</button>
      <button type="button" id="v3Deselect">Klar</button></div>
    <div class="v3-hint">Dra i pilarna för att flytta (rött = X, grönt = Y, blått = höjd) eller i ringen för att vrida. Mitten flyttar fritt.</div>`;
  side.querySelectorAll("[data-v3f]").forEach(inp => {
    const k = inp.dataset.v3f;
    inp.onfocus = () => placeSnapshot();
    inp.onchange = () => {
      if (k === "name") p.name = inp.value;
      else {
        const v = placeNum(inp.value, p[k]);
        if (k === "x" || k === "y") { const d = v - p[k]; if (p.pts) p.pts = p.pts.map(q => k === "x" ? [placeR3(q[0] + d), q[1], q[2]] : [q[0], placeR3(q[1] + d), q[2]]); p[k] = placeR3(v); }
        else if (k === "mH") { const h = A.bbox.max[2] - A.bbox.min[2]; if (h > 0 && v > 0) p.scale = Math.round(v / h * 10000) / 10000; }
        else if (k === "rot") p.rot = ((v % 360) + 360) % 360;
        else if (k === "dz") p.dz = v;
        else p[k] = Math.max(k === "R" ? 0 : 0.01, v);
      }
      placeTouch(p); l3RebuildOne(p); l3Changed();
    };
  });
  side.querySelector("#v3Drop").onclick = () => { placeSnapshot(); const g = l3.placeMeshes.get(p.id); if (g && l3DropToSurface(p, g)) { placeTouch(p); l3Changed(); l3RenderSide(); } else l3Status("Ingen yta under objektet."); };
  side.querySelector("#v3Copy").onclick = () => {
    placeSnapshot();
    const [c] = placeCopies(p, 1, placeExtent(p)[0] + 0.5, true);
    placements.push(c); placeTouch(c);
    const g = l3PlacementGroup(c); l3.groups.places.add(g); l3.placeMeshes.set(c.id, g);
    l3Select(c.id); l3Changed();
  };
  side.querySelector("#v3Del").onclick = () => {
    if (!confirm(`Ta bort "${p.name}"?`)) return;
    placeSnapshot();
    placements = placements.filter(x => x.id !== p.id);
    placeDeleted.add(p.id); placeDirty.delete(p.id); placeScheduleSave();
    const g = l3.placeMeshes.get(p.id); l3.gizmo.detach(); if (g) l3.groups.places.remove(g); l3.placeMeshes.delete(p.id);
    l3Select(null); l3Changed();
  };
  side.querySelector("#v3Deselect").onclick = () => l3Select(null);
}

/* Biblioteket i 3D: tryck på en knapp och sedan i scenen. */
function l3RenderLib() {
  const el = document.getElementById("v3Lib");
  if (!el) return;
  const assets = typeof placeAssets !== "undefined" ? placeAssets : [];
  const btn = (k, l, c) => `<button type="button" data-v3add="${escHtml(k)}" class="${l3 && l3.addType === k ? "on" : ""}"><i style="background:${c}"></i>${escHtml(l)}</button>`;
  el.innerHTML = `<span class="v3-gl">Lägg till</span>${Object.entries(PLACE_LIB).filter(([, l]) => !l.fence).map(([k, l]) => btn(k, l.label, l.color)).join("")}${assets.map(a => btn(`model:${a.id}`, a.name, a.kind === "ifc" ? "#0e7490" : "#64748b")).join("")}`;
  el.querySelectorAll("[data-v3add]").forEach(b => { b.onclick = () => { l3.measure = null; l3.addType = l3.addType === b.dataset.v3add ? null : b.dataset.v3add; l3Status(l3.addType ? "Tryck där objektet ska stå (marken eller ett objekt)." : ""); l3RenderLib(); }; });
}

function l3ClearMeasure() { l3Clear(l3.groups.tmp); l3Render(); }
function l3DrawMeasure() {
  l3Clear(l3.groups.tmp);
  const pts = l3.measure ? l3.measure.pts : [];
  pts.forEach(p => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), new THREE.MeshBasicMaterial({ color: 0xdc2626 })); s.position.copy(p); l3.groups.tmp.add(s); });
  if (pts.length === 2) l3.groups.tmp.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xdc2626 })));
  l3Render();
}

function l3Undo() {
  if (typeof placeUndo !== "function") return;
  placeUndo();
  l3BuildPlacements(); l3Select(placeActiveId); l3Changed();
}
function l3Key(e) {
  const box = document.getElementById("view3d");
  if (!l3 || !box || box.classList.contains("hidden")) return;
  const tag = e.target && e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); l3Undo(); return; }
  if (e.key === "Escape") { l3.addType = null; l3.measure = null; l3ClearMeasure(); l3RenderLib(); l3Select(null); }
  else if (e.key === "w" || e.key === "W") l3Mode("translate");
  else if (e.key === "e" || e.key === "E") l3Mode("rotate");
  else if ((e.key === "Delete" || e.key === "Backspace") && placeActive()) { e.preventDefault(); document.getElementById("v3Del").click(); }
}

/* Sparat i plan_placements.json (place3d.js sparar efter en kort paus) -> berätta för 4D-planering. */
let l3NotifyTimer = 0;
function l3Changed() {
  clearTimeout(l3NotifyTimer);
  l3NotifyTimer = setTimeout(async () => { try { await placeSaveNow(); await l3NotifyOpener(); } catch (e) { /* sparas igen vid nästa ändring */ } }, 1500);
  l3Render();
}
async function l3NotifyOpener() { try { await askOpener("placementsChanged", {}, 15000); } catch (e) { /* 4D-planering är inte öppen – filen är ändå sparad */ } }
async function l3SaveIfc() {
  const b = document.getElementById("v3SaveIfc");
  b.disabled = true;
  l3Status("Sparar etableringen och skapar IFC i Trimble Connect…");
  try {
    await placeSaveNow();
    const r = await askOpener("placeSaveIfc", {}, 0);
    l3Status(r && r.n ? `✓ ${r.n} objekt sparade som IFC i Trimble Connect${r.files ? ` (${r.files.join(", ")})` : ""}.` : "Inget att spara.");
  } catch (e) { l3Status("Kunde inte spara som IFC: " + e.message, true); }
  b.disabled = false;
}

document.addEventListener("DOMContentLoaded", () => {
  const b = document.getElementById("btn3d"); if (b) b.onclick = () => open3d();
  // Öppnad via "Öppna 3D-vy" i 4D-planering (?view=3d): vänta tills arbetsytan är inläst.
  if (new URLSearchParams(location.search).get("view") === "3d") {
    let n = 0;
    const t = setInterval(() => {
      if (++n > 120) return clearInterval(t);
      if (typeof plan !== "undefined" && plan && page) { clearInterval(t); open3d(); }
    }, 500);
  }
});
