/* 3D-vyn – visningslägen (Victor 2026-10-30: "lägg till Wireframe, Shaded, X-Ray och realistisk vy i 3D-editorn").

   – Skuggad (som förut), Tråd (kanterna ritas som linjer), X-Ray (genomskinligt med konturer – man ser genom allt) och Realistisk
     (fysikaliskt baserat ljus, himmelsljus som reflekteras, mjuka skuggor och en skuggplan på marken).
   – Gäller byggnaden (IFC), de placerade objekten och lådorna. Färgning efter status/egenskaper, urval, dolda objekt, snitt, mått och
     texturer fungerar som vanligt i alla lägen.
   – Läget sparas som inställning och läggs på igen nästa gång 3D öppnas. Valet finns under Visa → Visningsläge och i Ctrl+K.
   – I stora modeller (över ca 1,5 miljoner trianglar) kastar inte byggnaden skuggor i Realistisk (bara tar emot dem), och konturerna i
     X-Ray hoppas över för de allra största delarna – annars blir det för tungt. */

const l3vm = { mode: "shaded", env: null, groundMesh: null, edgeTris: 0, vctr: 1000, sunWas: null, shadowOn: false, lastSig: "" };
const L3VM_MODES = [["shaded", "Skuggad"], ["wire", "Tråd"], ["xray", "X-Ray"], ["real", "Realistisk"]];
const L3VM_XRAY_OP = 0.16, L3VM_EDGE_MAX = 250000, L3VM_EDGE_SUM = 900000, L3VM_SHADOW_IFC_MAX = 1.5e6;
const l3vmPref = () => { const v = (typeof l3Prefs === "function" ? l3Prefs().vmode : null); return L3VM_MODES.some(m => m[0] === v) ? v : "shaded"; };

function l3vmEach(cb) {
  ["bldg", "places", "objs"].forEach(k => { const g = l3.groups[k]; if (g) g.traverse(o => { if (o.isMesh && !o.userData.vmEdge && !o.userData.noVm && o.material) cb(o); }); });
}
function l3vmTris() { let n = 0; if (typeof l3b !== "undefined") l3b.models.forEach(m => { if (m.visible) n += m.tris || 0; }); return n; }

/* Himmelsljuset (miljökartan) i Realistisk: en mjuk gradient ovanifrån och ned som reflekteras i ytorna. */
function l3vmEnv() {
  if (l3vm.env) return l3vm.env;
  const pm = new THREE.PMREMGenerator(l3.renderer), sc = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: "varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "varying vec3 vP; void main() { float h = normalize(vP).z; vec3 top = vec3(0.50, 0.68, 0.92), hor = vec3(0.96, 0.97, 0.98), low = vec3(0.45, 0.46, 0.48); vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.55)) : mix(hor, low, pow(-h, 0.7)); float sun = pow(max(0.0, dot(normalize(vP), normalize(vec3(-0.5, -0.8, 1.2)))), 60.0); gl_FragColor = vec4(c + vec3(1.0, 0.95, 0.85) * sun * 2.2, 1.0); }",
  }));
  sc.add(sky);
  l3vm.env = pm.fromScene(sc, 0.02).texture; pm.dispose(); sky.geometry.dispose(); sky.material.dispose();
  return l3vm.env;
}

/* Material för det aktuella läget (idempotent). */
function l3vmMat(m, mode) {
  if (!m || m.isShaderMaterial && !m.userData.l3tex) return;
  const u = m.userData, s = u.vm || (u.vm = { t: m.transparent, o: m.opacity, dw: m.depthWrite, wf: m.wireframe, mode: "shaded", ao: null });
  if (s.mode === mode && (mode === "shaded" || mode === "wire" || m.opacity === s.ao)) return;
  if (s.mode !== "shaded" && m.opacity !== s.ao && s.ao != null) s.o = m.opacity; // något annat ändrade opaciteten medan läget var på
  else if (s.mode === "shaded") { s.t = m.transparent; s.o = m.opacity; s.dw = m.depthWrite; s.wf = m.wireframe; }
  m.wireframe = mode === "wire" ? true : s.wf;
  if (mode === "xray") { m.transparent = true; m.opacity = Math.min(s.o, L3VM_XRAY_OP); m.depthWrite = false; s.ao = m.opacity; }
  else { m.transparent = s.t; m.opacity = s.o; m.depthWrite = s.dw; s.ao = null; }
  s.mode = mode; m.needsUpdate = true;
}
/* Realistisk: Lambert byts mot en fysikaliskt baserad variant (och tillbaka). */
function l3vmStd(o, on) {
  if (on) {
    if (o.userData.vmStd) return; // redan realistisk
    const arr = Array.isArray(o.material) ? o.material : [o.material]; if (!arr.every(m => m && m.isMeshLambertMaterial)) return;
    const mk = m => {
      const n = new THREE.MeshStandardMaterial({ color: m.color, vertexColors: m.vertexColors, transparent: m.transparent, opacity: m.opacity, side: m.side, depthWrite: m.depthWrite, roughness: 0.62, metalness: 0.06, envMapIntensity: 0.7, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits, clippingPlanes: m.clippingPlanes, clipShadows: m.clipShadows });
      n.userData = { ...m.userData, vm: undefined, l3tex: undefined, vmFrom: m };
      if (m.userData.l3tex && typeof l3texPatch === "function") { const t = m.userData.l3tex; l3texPatch(n, t.attr ? undefined : [t.uTx.value.x, t.uTx.value.y, t.uTx.value.z, t.uTx2.value.x, t.uTx2.value.y, t.uTx2.value.z, t.uTx2.value.w, t.uTx3 ? t.uTx3.value : 0]); }
      return n;
    };
    o.userData.vmLam = o.material; o.material = o.userData.vmStd = Array.isArray(o.material) ? o.material.map(mk) : mk(o.material);
  } else if (o.userData.vmLam) {
    const cur = Array.isArray(o.material) ? o.material : [o.material], lam = Array.isArray(o.userData.vmLam) ? o.userData.vmLam : [o.userData.vmLam];
    cur.forEach((n, i) => { const l = lam[i]; if (l) { l.transparent = n.transparent; l.opacity = n.opacity; l.depthWrite = n.depthWrite; l.emissive.copy(n.emissive); l.color.copy(n.color); } });
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(n => n.dispose());
    o.material = o.userData.vmLam; o.userData.vmLam = null; o.userData.vmStd = null;
  }
}
/* Konturer (kanter över 30°) för X-Ray. */
function l3vmEdges(o, on) {
  let e = o.userData.vmEdges;
  if (!on) { if (e) { e.visible = false; } return; }
  const u = o.userData.l3b, lod = !!(u && u.lodOn && u.lodFull), idxN = lod ? u.lodFull.count : o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute("position").count; // förenklad bild räknas inte som ändring
  if (e && e.userData.vmN === idxN) { e.visible = true; return; }
  if (e) { l3vm.edgeTris -= e.userData.vmT || 0; o.remove(e); e.geometry.dispose(); o.userData.vmEdges = null; }
  const tris = idxN / 3; if (tris > L3VM_EDGE_MAX || l3vm.edgeTris + tris > L3VM_EDGE_SUM) return;
  l3vm.edgeTris += tris;
  let geo = o.geometry; if (lod) { geo = new THREE.BufferGeometry(); geo.setAttribute("position", o.geometry.getAttribute("position")); geo.setIndex(u.lodFull); } // kanterna ur den fulla indexlistan
  e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: 0x1e293b, transparent: true, opacity: 0.6 }));
  e.userData.vmEdge = true; e.userData.noHit = true; e.userData.vmN = idxN; e.userData.vmT = tris; e.raycast = () => {}; e.renderOrder = 4; o.add(e); o.userData.vmEdges = e;
}
function l3vmSun() { return l3.scene.children.find(c => c.isDirectionalLight); }
/* Skuggor och skuggplan i Realistisk. */
function l3vmShadows(on) {
  const r = l3.renderer, sun = l3vmSun();
  if (on) {
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const box = new THREE.Box3(); ["bldg", "places"].forEach(k => { if (l3.groups[k]) box.expandByObject(l3.groups[k]); });
    if (box.isEmpty()) box.set(new THREE.Vector3(-30, -30, 0), new THREE.Vector3(30, 30, 10));
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()), R = Math.min(2500, Math.max(10, sz.length() * 0.6));
    if (sun) {
      if (!l3vm.sunWas) l3vm.sunWas = { pos: sun.position.clone(), target: sun.target.position.clone() };
      const dir = (l3vm.sunDir ? l3vm.sunDir.clone() : new THREE.Vector3(-0.5, -0.8, 1.2)).normalize();   // solstudien (lagesplan-3dsun.js) styr riktningen
      sun.position.copy(c).addScaledVector(dir, R * 2); sun.target.position.copy(c); if (!sun.target.parent) l3.scene.add(sun.target); sun.target.updateMatrixWorld();
      sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
      const cam = sun.shadow.camera; cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R; cam.near = 0.5; cam.far = R * 5; cam.updateProjectionMatrix();
    }
    if (!l3vm.groundMesh) { const g = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.28 })); g.userData.noHit = true; g.userData.noVm = true; g.raycast = () => {}; g.receiveShadow = true; g.renderOrder = -1; l3vm.groundMesh = g; }
    const g = l3vm.groundMesh; g.scale.set(R * 6, R * 6, 1); g.position.set(c.x, c.y, box.min.z - 0.01); if (!g.parent) l3.scene.add(g); g.visible = true;
  } else {
    if (sun) { sun.castShadow = false; if (l3vm.sunWas) { sun.position.copy(l3vm.sunWas.pos); sun.target.position.copy(l3vm.sunWas.target); l3vm.sunWas = null; } }
    if (l3vm.groundMesh) l3vm.groundMesh.visible = false;
    r.shadowMap.enabled = false;
  }
  l3vm.shadowOn = on;
}
/* Allt på en gång för det valda läget – anropas vid byte och (i läge ≠ Skuggad) varje bild så att nya delar följer med. */
function l3vmSync(force) {
  const mode = l3vm.mode, real = mode === "real", castIfc = l3vmTris() < L3VM_SHADOW_IFC_MAX;
  if (force) l3vm.edgeTris = 0;
  l3vmEach(o => {
    if (!real) l3vmStd(o, false);
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => l3vmMat(m, real ? "shaded" : mode));
    if (real) l3vmStd(o, true);
    if (mode === "xray") l3vmEdges(o, true); else if (o.userData.vmEdges) l3vmEdges(o, false);
    if (mode === "wire" && o.userData.l3b && o.geometry.index && o.userData.vmIdx !== o.geometry.index) { o.userData.vmIdx = o.geometry.index; o.geometry.index.version = ++l3vm.vctr; } // trådens kantlista följer indexbytena (dölj/förenklad bild)
    if (real) { const ifc = !!o.userData.l3b; const mm = Array.isArray(o.material) ? o.material[0] : o.material; o.castShadow = !(mm.transparent && mm.opacity < 0.9) && (!ifc || castIfc); o.receiveShadow = true; }
    else if (o.castShadow || o.receiveShadow) { o.castShadow = o.receiveShadow = false; }
  });
}
function l3vmSet(mode, quiet) {
  if (!L3VM_MODES.some(m => m[0] === mode)) mode = "shaded";
  const prev = l3vm.mode;
  l3vm.mode = mode; if (typeof l3SetPref === "function" && l3vmPref() !== mode) l3SetPref("vmode", mode);
  if (prev === "real" && mode !== "real") { l3vmShadows(false); l3.scene.environment = null; }
  if (mode === "real") { l3.scene.environment = l3vmEnv(); l3vmShadows(true); }
  l3vmSync(true);
  if (prev === "real" || mode === "real") l3vmEach(o => { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
  document.querySelectorAll("[data-v3vm]").forEach(b => b.classList.toggle("on", b.dataset.v3vm === mode));
  if (!quiet && typeof l3Status === "function") l3Status(`Visningsläge: ${(L3VM_MODES.find(m => m[0] === mode) || [])[1]}.`);
  l3Render();
}
/* Anropas före varje bild: läget i inställningen (t.ex. vid start) och nya delar. */
function l3vmFrame() {
  const want = l3vmPref();
  if (want !== l3vm.mode) { l3vmSet(want, true); return; }
  if (l3vm.mode !== "shaded") l3vmSync(false);
}
function l3vmHtml() {
  return `<div class="v3-pop-l">Visningsläge</div><div class="v3-segs" id="v3VMode">${L3VM_MODES.map(([k, l]) => `<button type="button" data-v3vm="${k}" class="${l3vmPref() === k ? "on" : ""}" title="${{ shaded: "Fyllda ytor med ljus (standard)", wire: "Bara kanterna – trådmodell", xray: "Genomskinligt med konturer – se genom allt", real: "Realistiskt ljus, reflektioner och mjuka skuggor" }[k]}">${l}</button>`).join("")}</div>`;
}
