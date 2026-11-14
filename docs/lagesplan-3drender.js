/* Lägesplan – renderingsmotor för stillbilder av 3D-modellen (Victor 2026-11-14: "en snygg motor för rendering av min modell").

   Progressiv renderare ovanpå three.js (inga extra bibliotek): bilden är medelvärdet av många delbilder, där varje delbild
     – flyttar kameran en bråkdel av en bildpunkt            → kantutjämning utan trasiga linjer
     – flyttar solen inom dess skiva (mjukhet)              → mjuka skuggor med naturlig halvskugga
     – lägger ett himmelsljus från en slumpad riktning över himlavalvet med skugga → ambient occlusion: mörkare i vinklar, under tak, intill väggar
   Summan läggs ihop i en flyttalsbuffert (GPU), därefter exponering, filmisk tonkurva, sRGB och valfri vinjett → PNG.
   Bygger på läget "Realistisk" (fysikaliskt baserade material, himmelskarta, skuggplan på marken). Vyn rörs inte: allt ritas i egna buffertar och inställningarna återställs.
   Hjälpgrupper (markering, mått, tillfälliga linjer, handtag) göms under renderingen. Punktmoln ritas inte (för tungt för många delbilder).
   Prefix l3rn. Används av knappen "🎬 Rendera" i 3D-vyn och av MCP-verktyget render_image (lagesplan-l3api.js). */

const l3rn = { busy: false, cancel: false, last: null, ui: null, sticky: null };
/* Filmen (sticky) lämnar den stora skuggkartan kvar mellan bilderna; när filmen är klar sätts vyns egen storlek tillbaka. */
function l3rnRelease() { const s = l3rn.sticky; l3rn.sticky = null; if (s) { const [L, n] = s; L.shadow.mapSize.set(n, n); if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; } } }
const L3RN_Q = { fast: 12, good: 48, best: 160 };
const l3rnClamp = (v, a, b, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
function l3rnHalton(i, b) { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }

/* Solens riktning (mot solen) ur azimut (grader från norr, medurs) och höjd över horisonten. Projektets Y är norr, X öster, Z upp. */
function l3rnSunDir(az, el) { const a = az * Math.PI / 180, e = el * Math.PI / 180; return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)).normalize(); }

/* Himmelsfärger efter tid på dygnet, molnighet och dis. */
function l3rnSky(E) {
  const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t)), hex = c => "#" + c.map(v => v.toString(16).padStart(2, "0")).join(""), warm = E.warm || 0, c = E.clouds || 0, h = E.haze || 0;
  let top = lerp([111, 163, 221], [74, 92, 150], warm * 0.7), mid = lerp([207, 224, 242], [236, 176, 140], warm * 0.8), low = lerp([243, 240, 234], [250, 214, 170], warm * 0.8);
  top = lerp(top, [150, 162, 178], c * 0.75); mid = lerp(mid, [196, 204, 212], c * 0.7); low = lerp(low, [214, 216, 218], c * 0.6);
  top = lerp(top, mid, h * 0.5); mid = lerp(mid, low, h * 0.4);
  return { top: hex(top), mid: hex(mid), low: hex(low) };
}


/* ---- Linjär färgpipeline: materialens färger (sRGB) görs linjära medan bilden räknas och sätts tillbaka efteråt ---- */
const l3rnLin = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
const l3rnLinCol = c => { c.r = l3rnLin(c.r); c.g = l3rnLin(c.g); c.b = l3rnLin(c.b); return c; };
const l3rnLinCache = new WeakMap();   // geometri → { ver, attr }: hörnfärger i linjärt, räknas om först när de ändrats
function l3rnLinearize(S, scene) {
  const seenM = new Set(), seenG = new Set();
  scene.traverse(o => {
    if (!o.isMesh || !o.material || (o.userData && (o.userData.l3skSky || o.userData.vmEdge))) return;
    [].concat(o.material).forEach(m => {
      if (!m || seenM.has(m) || m.isShaderMaterial || m.userData && m.userData.l3rm) return; seenM.add(m);
      if (m.color) { const c0 = m.color.clone(); l3rnLinCol(m.color); S.linUndo.push(() => m.color.copy(c0)); }
      if (m.emissive) { const e0 = m.emissive.clone(); l3rnLinCol(m.emissive); S.linUndo.push(() => m.emissive.copy(e0)); }
      if (m.map && m.map.encoding !== THREE.sRGBEncoding) { const t = m.map, e = t.encoding; t.encoding = THREE.sRGBEncoding; t.needsUpdate = true; m.needsUpdate = true; S.linUndo.push(() => { t.encoding = e; t.needsUpdate = true; m.needsUpdate = true; }); }
    });
    const g = o.geometry, ca = g && g.attributes && g.attributes.color;
    if (ca && !seenG.has(g) && [].concat(o.material).some(m => m && m.vertexColors && !m.isShaderMaterial)) {
      seenG.add(g); let c = l3rnLinCache.get(g);
      if (!c || c.ver !== ca.version || c.src !== ca) { const n = ca.count, iz = ca.itemSize, arr = new Float32Array(n * iz); for (let i = 0; i < n; i++) { for (let k = 0; k < Math.min(3, iz); k++) arr[i * iz + k] = l3rnLin(ca.getX ? (k === 0 ? ca.getX(i) : k === 1 ? ca.getY(i) : ca.getZ(i)) : ca.array[i * iz + k]); if (iz > 3) arr[i * iz + 3] = ca.getW(i); } c = { ver: ca.version, src: ca, attr: new THREE.BufferAttribute(arr, iz) }; l3rnLinCache.set(g, c); }
      g.setAttribute("color", c.attr); S.linUndo.push(() => g.setAttribute("color", ca));
    }
  });
  scene.traverse(o => { if (o.isLight && o.color) { const c0 = o.color.clone(); l3rnLinCol(o.color); S.linUndo.push(() => o.color.copy(c0)); if (o.groundColor) { const g0 = o.groundColor.clone(); l3rnLinCol(o.groundColor); S.linUndo.push(() => o.groundColor.copy(g0)); } } });
}

/* ---- Väder: blött underlag (mörkare, blankare) och snö (vitt på det som vetter uppåt) för alla standardmaterial ---- */
const L3RN_WX = { wet: { value: 0 }, snow: { value: 0 } };
const L3RN_WX_GLSL = `{ float wxUp = clamp(normalize((vec4(normal, 0.0) * viewMatrix).xyz).z, 0.0, 1.0);
  float wxSn = uWxSnow * smoothstep(0.30, 0.80, wxUp);
  diffuseColor.rgb *= 1.0 - 0.38 * uWxWet * (0.5 + 0.5 * wxUp); roughnessFactor = max(roughnessFactor * (1.0 - 0.75 * uWxWet), 0.05);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78), wxSn); roughnessFactor = mix(roughnessFactor, 0.9, wxSn); metalnessFactor *= 1.0 - wxSn; }`;
function l3rnWeather(S, scene, E) {
  L3RN_WX.wet.value = E.wet || 0; L3RN_WX.snow.value = E.snow || 0; if (!(E.wet > 0 || E.snow > 0)) return;
  const seen = new Set();
  scene.traverse(o => {
    if (!o.isMesh || !o.material || (o.userData && o.userData.l3skSky)) return;
    [].concat(o.material).forEach(m => {
      if (!m || seen.has(m) || !m.isMeshStandardMaterial || m.isShaderMaterial || (m.transparent && m.opacity < 0.9)) return; seen.add(m);
      const prev = m.onBeforeCompile, own = Object.prototype.hasOwnProperty.call(m, "customProgramCacheKey"), pk = m.customProgramCacheKey;
      m.onBeforeCompile = function (sh, rr) { if (prev) prev.call(this, sh, rr); sh.uniforms.uWxWet = L3RN_WX.wet; sh.uniforms.uWxSnow = L3RN_WX.snow; sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uWxWet, uWxSnow;").replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\n" + L3RN_WX_GLSL); };
      m.customProgramCacheKey = function () { return (prev ? prev.toString() : "") + "|wx"; }; m.needsUpdate = true;
      S.linUndo.push(() => { m.onBeforeCompile = prev || (() => {}); if (own) m.customProgramCacheKey = pk; else delete m.customProgramCacheKey; m.needsUpdate = true; });
    });
  });
}
/* Regn och snöfall som streck/prickar över färdig bild (slumpen följer tiden, så filmen får rörelse). */
function l3rnPrecip(ctx, W, H, E, time) {
  if (!(E.rain > 0 || E.snow > 0)) return; let s = Math.floor((time || 0) * 24) * 7919 + 13; const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  ctx.save();
  if (E.rain > 0) { const n = Math.round(E.rain * W * H / 2500), len = H / 22; ctx.lineWidth = Math.max(1, W / 1500); ctx.strokeStyle = "rgba(225,235,250,0.32)"; ctx.beginPath(); for (let i = 0; i < n; i++) { const x = rnd() * W, y = rnd() * H, l = len * (0.5 + rnd()); ctx.moveTo(x, y); ctx.lineTo(x - l * 0.18, y + l); } ctx.stroke(); }
  if (E.snow > 0) { const n = Math.round(E.snow * W * H / 3500); ctx.fillStyle = "rgba(255,255,255,0.8)"; for (let i = 0; i < n; i++) { const r = Math.max(0.8, (0.6 + rnd() * 1.8) * W / 1500); ctx.globalAlpha = 0.35 + rnd() * 0.55; ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, r, 0, 6.283); ctx.fill(); } }
  ctx.restore();
}

/* Fullskärmsruta för att lägga ihop och tonmappa. */
function l3rnQuad(frag, uniforms) {
  const m = new THREE.ShaderMaterial({ uniforms, depthTest: false, depthWrite: false, transparent: false, blending: THREE.NoBlending,
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }", fragmentShader: frag });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); mesh.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(mesh); return { scene: sc, mat: m, mesh, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
}
const L3RN_ADD = "uniform sampler2D t, tAcc; uniform float w; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tAcc, vUv).rgb + texture2D(t, vUv).rgb * w, 1.0); }";
const L3RN_TONE = `uniform sampler2D t, b0, b1, b2, b3, b4; uniform float ex, vig, bloom; uniform vec2 tOrg, tSize, full; varying vec2 vUv;
  vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  vec3 oetf(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  void main() {
    vec3 c = texture2D(t, vUv).rgb * ex;
    if (bloom > 0.0) c += bloom * (texture2D(b0, vUv).rgb * 0.30 + texture2D(b1, vUv).rgb * 0.25 + texture2D(b2, vUv).rgb * 0.20 + texture2D(b3, vUv).rgb * 0.15 + texture2D(b4, vUv).rgb * 0.10);   // glöd runt det som är ljusare än vitt
    c = aces(c);                                                                  // filmisk tonkurva: ljusa partier mjukas av i stället för att klippas
    c = oetf(c);                                                                  // linjärt → sRGB
    c = mix(c, c * c * (3.0 - 2.0 * c), 0.18);                                       // lite mer kontrast
    float l = dot(c, vec3(0.299, 0.587, 0.114)); c = clamp(mix(vec3(l), c, 1.08), 0.0, 1.0);   // och färgmättnad
    vec2 p = (tOrg + vUv * tSize) / full - 0.5; c *= 1.0 - vig * smoothstep(0.25, 0.85, dot(p, p) * 2.0);    // lätt vinjett
    gl_FragColor = vec4(c, 1.0);
  }`;

/* 360°-panorama: sex ytor (kubkarta) ritas från kamerans plats och läggs ut som en equirektangulär bild (mitten = kamerans blickriktning). */
const L3RN_PANO = `uniform samplerCube tCube; uniform vec3 bR, bU, bF; uniform vec2 tOrg, tSize, full, jit; varying vec2 vUv;
  void main() { vec2 g = (tOrg + vUv * tSize + jit) / full; float lon = (g.x - 0.5) * 6.2831853, lat = (g.y - 0.5) * 3.1415927;
    vec3 d = cos(lat) * (sin(lon) * bR + cos(lon) * bF) + sin(lat) * bU; gl_FragColor = textureCube(tCube, d); }`;
const L3RN_BRIGHT = "uniform sampler2D t; uniform float ex, thr; varying vec2 vUv; void main() { vec3 c = texture2D(t, vUv).rgb * ex; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * max(0.0, l - thr) / max(l, 1e-4), 1.0); }";
const L3RN_BLUR = "uniform sampler2D t; uniform vec2 d; varying vec2 vUv; void main() { vec3 s = texture2D(t, vUv).rgb * 0.2270270270; s += (texture2D(t, vUv + d * 1.3846153846).rgb + texture2D(t, vUv - d * 1.3846153846).rgb) * 0.3162162162; s += (texture2D(t, vUv + d * 3.2307692308).rgb + texture2D(t, vUv - d * 3.2307692308).rgb) * 0.0702702703; gl_FragColor = vec4(s, 1.0); }";

/* Renderar en stillbild. opt: { width, height, samples|quality (fast/good/best), sunAz, sunEl (grader), soft (solens mjukhet, grader), ao (0–1.6), exposure, vignette (0–1), edges (behåll CAD-konturer), background ("sky"|"keep"), onProgress(done,total,canvas) }.
   Returnerar { canvas, width, height, samples, ms }. */
async function l3rnRender(opt = {}) {
  if (typeof l3 === "undefined" || !l3 || !l3.renderer) throw new Error("3D-editorn är inte öppen");
  if (l3rn.busy) throw new Error("En rendering pågår redan");
  const r = l3.renderer, scene = l3.scene, cam = l3.camera, view = r.getSize(new THREE.Vector2());
  const asp = view.x / Math.max(1, view.y), maxT = 8192, texMax = r.capabilities.maxTextureSize || 4096;
  const pano = !!opt.panorama, W = Math.round(l3rnClamp(opt.width, 160, maxT, pano ? 4096 : 1600)), H = pano ? Math.round(W / 2) : Math.round(l3rnClamp(opt.height, 90, maxT, W / asp));
  const tileMax = Math.max(512, Math.min(texMax, Math.round(l3rnClamp(opt.tile, 512, 4096, 2048)))), nx = Math.ceil(W / tileMax), ny = Math.ceil(H / tileMax), TW = Math.ceil(W / nx), TH = Math.ceil(H / ny), tiles = []; for (let yy = 0; yy < ny; yy++) for (let xx = 0; xx < nx; xx++) tiles.push([xx * TW, yy * TH]);   // stora bilder (8K) renderas i rutor och sätts ihop
  const N = Math.round(l3rnClamp(opt.samples || L3RN_Q[opt.quality] || L3RN_Q.good, 1, 512, L3RN_Q.good));
  const E = typeof l3rmEnvResolved === "function" ? l3rmEnvResolved(opt.env || {}) : { az: null, el: null, warm: 0, clouds: 0, haze: 0, exposure: 1 };
  const soft = l3rnClamp(opt.soft, 0, 15, 1.6) + E.clouds * 6, ao = l3rnClamp(opt.ao, 0, 1.6, 1), exposure = l3rnClamp(opt.exposure, 0.2, 4, 0.95) * E.exposure, vig = pano ? 0 : l3rnClamp(opt.vignette, 0, 1, 0.25), bloomAmt = l3rnClamp(opt.bloom, 0, 1, 0.12), dofAmt = l3rnClamp(opt.dof, 0, 10, 0);
  const t0 = performance.now();
  l3rn.busy = true; l3rn.cancel = false;
  const S = { mode: l3vm.mode, aspect: cam.aspect, near: cam.near, far: cam.far, target: r.getRenderTarget(), sunDir: l3vm.sunDir ? l3vm.sunDir.clone() : null, lights: [], vis: [], env: new Map(), gizmo: l3.gizmo ? l3.gizmo.visible : null, autoClear: r.autoClear, clear: r.getClearColor(new THREE.Color()), clearA: r.getClearAlpha(), bg: scene.background, fog: scene.fog, envMap: scene.environment, restore: [], linUndo: [] };
  let cubeRT = null, cubeCam = null, panoQ = null, camPos0 = null, blur = null, bloomQ = null, blurQ = null, sky = null, skyMesh = null, bgTex = null, rtS = null, rtA = null, rtB = null, rtOut = null, addQ = null, toneQ = null;
  try {
    camPos0 = cam.position.clone();
    // 1) Realistisk (material, himmelskarta, skuggor, skuggplan) – hör till motorn
    if (l3vm.mode !== "real") l3vmSet("real", true);
    const az = opt.sunAz != null ? opt.sunAz : E.az, el = opt.sunEl != null ? opt.sunEl : E.el;
    if (az != null || el != null) l3vm.sunDir = l3rnSunDir(l3rnClamp(az, -720, 720, 200), l3rnClamp(el, 1, 89, 45));
    l3vmShadows(true); l3vmSync(true);
    const sun = l3vmSun(); if (!sun) throw new Error("Ingen sol i scenen");
    // 1b) renderingsmaterial, mark och miljö (eget lager – editorns material rörs inte; allt sätts tillbaka i slutet)
    const RM = typeof l3rmBegin === "function" ? l3rmBegin(S, opt) : null;
    if (typeof l3rmedReady === "function") await l3rmedReady();   // egna bilder (texturset) färdigladdade
    // 2) göm hjälpgrupper och CAD-konturer
    ["sel", "meas", "tmp"].forEach(k => { const g = l3.groups[k]; if (g) { S.vis.push([g, g.visible]); g.visible = false; } });
    if (l3.gizmo) l3.gizmo.visible = false;
    scene.children.forEach(c => { if ((c.type === "Object3D" && c.children.length) || (c.userData && c.userData.spin)) { S.vis.push([c, c.visible]); c.visible = false; } });   // handtag, vridcirkel och rotationspunkt syns inte i bilden
    scene.traverse(o => { if (o.userData && o.userData.vmEdge) { S.vis.push([o, o.visible]); o.visible = false; } });
    if (!opt.edges) scene.traverse(o => { if (o.isLineSegments && o.userData.noVm && o.material && o.material.color && o.material.color.getHex() === 0x1f2937) { S.vis.push([o, o.visible]); o.visible = false; } });   // kroppars konturlinjer (CAD-utseendet)
    cam.aspect = W / H;
    if (cam.isPerspectiveCamera) {   // snävt djupomfång för skärpa i djupbufferten
      const bd = new THREE.Box3(); ["bldg", "places", "objs", "plan"].forEach(k => { const g = l3.groups[k]; if (g && g.visible) bd.expandByObject(g); });
      if (!bd.isEmpty()) {
        let far = 0; const cp = cam.position;
        for (let i = 0; i < 8; i++) far = Math.max(far, new THREE.Vector3(i & 1 ? bd.max.x : bd.min.x, i & 2 ? bd.max.y : bd.min.y, i & 4 ? bd.max.z : bd.min.z).distanceTo(cp));
        const dn = bd.containsPoint(cp) ? 0 : bd.distanceToPoint(cp); cam.far = Math.max(50, far * 1.05); cam.near = Math.max(0.2, Math.min(cam.far / 3000, dn * 0.6 || 0.2));
        if (cam.far / cam.near > 6000) cam.near = cam.far / 6000;
      }
    }
    cam.updateProjectionMatrix();
    const sunV = (() => { const a = l3vmSun(); return a.position.clone().sub(a.target.position).normalize(); })();
    const time = Number(opt.time) || 0, physSky = opt.background !== "keep";
    if (physSky) {   // fysikalisk himmel (lagesplan-3drsky.js) som bakgrund och som miljökarta
      const sk = l3rnSky(E); if (E.haze > 0) scene.fog = new THREE.FogExp2(l3rnLinCol(new THREE.Color(sk.mid)).multiplyScalar(0.8), E.haze * 0.004);
      scene.background = null; skyMesh = l3skMesh(E, sunV, time, Math.max(60, cam.far * 0.9)); scene.add(skyMesh); scene.environment = l3skEnv(r, E, sunV, time);
    }
    // 3) ljus: solen mjukas upp, himmelsljus med skugga läggs till, grundljuset sänks så att skuggor kan bli mörka
    scene.traverse(o => { if (o.isLight) S.lights.push([o, o.intensity, o.position.clone(), o.castShadow, o.color ? o.color.clone() : null]); });
    const d0 = sun.position.clone().sub(sun.target.position).normalize();
    const bb = new THREE.Box3(); ["bldg", "places", "objs"].forEach(k => { const g = l3.groups[k]; if (g && g.visible) bb.expandByObject(g); });
    if (bb.isEmpty()) bb.set(new THREE.Vector3(-30, -30, 0), new THREE.Vector3(30, 30, 10));
    let sph = bb.getBoundingSphere(new THREE.Sphere());
    { // skuggkartan läggs över det kameran ser av modellen (inte hela modellen) → skarpare skuggor vid närbilder
      cam.updateMatrixWorld(); const fb = new THREE.Box3(), cp = new THREE.Vector3();
      for (let i = 0; i < 8; i++) fb.expandByPoint(cp.set(i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1).unproject(cam));
      const vb = bb.clone().intersect(fb); if (!vb.isEmpty()) { const vs = vb.getBoundingSphere(new THREE.Sphere()); if (vs.radius > 1 && vs.radius < sph.radius) sph = vs; }
    }
    const R = Math.max(8, sph.radius * 1.08), dist = R * 2.4, mapN = Math.min(maxT, Math.round(l3rnClamp(opt.shadowSize, 1024, 8192, 4096)));
    [sun].forEach(L => { if (L.shadow.mapSize.x !== mapN) { if (!S.shadowSize) S.shadowSize = [L, L.shadow.mapSize.x]; L.shadow.mapSize.set(mapN, mapN); if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; } } });
    const fit = L => { L.shadow.bias = -0.0003; L.shadow.normalBias = Math.max(0.02, (2 * R / mapN) * 1.3); Object.assign(L.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: dist - R * 1.15, far: dist + R * 1.15 }); L.shadow.camera.updateProjectionMatrix(); };   // skuggkartan följer modellen (inte hela marken)
    sun.target.position.copy(sph.center); sun.castShadow = true; fit(sun);
    const hemi = scene.children.find(c => c.isHemisphereLight), fill = scene.children.find(c => c.isDirectionalLight && c !== sun);
    if (hemi) hemi.intensity = 0.0; if (fill) fill.intensity = 0.0;
    const lowSun = el != null ? l3rnClamp(el / 14, 0.25, 1, 1) : 1;
    sun.intensity = 1.5 * (1 - 0.75 * E.clouds) * lowSun; if (E.warm > 0) sun.color.setRGB(1, 1 - 0.22 * E.warm, 1 - 0.5 * E.warm);
        sky = new THREE.DirectionalLight(0xffffff, 0.55 * ao * (1 + 0.8 * E.clouds)); sky.castShadow = ao > 0; sky.shadow.mapSize.set(mapN, mapN); fit(sky);
    sky.target.position.copy(sph.center); scene.add(sky, sky.target);
    scene.traverse(o => { if (o.isMesh && o.material) [].concat(o.material).forEach(m => { if (m.envMapIntensity != null && !S.env.has(m) && !(m.userData && m.userData.l3rm)) { S.env.set(m, m.envMapIntensity); m.envMapIntensity = physSky ? 0.3 : 0.1 + 0.2 * (1 - Math.min(1, ao)); } }); });
    l3rnLinearize(S, scene);   // linjär färgpipeline (sätts tillbaka i slutet)
    L3RM_T.value = Number(opt.time) || 0; l3rnWeather(S, scene, E);
    // 4) buffertar: delbild (HDR, halvflyttal), två summabuffertar (ping-pong, flyttal) och slutbilden (8 bit)
    const bloomOn = bloomAmt > 0 && tiles.length === 1;   // glöden räknas inte per ruta (skarvar) – av vid rutindelad rendering
    rtS = new THREE.WebGLRenderTarget(TW, TH, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true });
    rtA = new THREE.WebGLRenderTarget(TW, TH, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false }); rtB = rtA.clone();
    rtOut = new THREE.WebGLRenderTarget(TW, TH, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false });
    if (bloomOn) { blur = []; for (let k = 0; k < 5; k++) { const bw = Math.max(2, TW >> (k + 1)), bh = Math.max(2, TH >> (k + 1)), mk = () => new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false }); blur.push({ a: mk(), b: mk(), w: bw, h: bh }); } bloomQ = l3rnQuad(L3RN_BRIGHT, { t: { value: null }, ex: { value: 1 }, thr: { value: 1.2 } }); blurQ = l3rnQuad(L3RN_BLUR, { t: { value: null }, d: { value: new THREE.Vector2() } }); }
    addQ = l3rnQuad(L3RN_ADD, { t: { value: rtS.texture }, tAcc: { value: rtA.texture }, w: { value: 1 / N } });
    toneQ = l3rnQuad(L3RN_TONE, { t: { value: rtA.texture }, ex: { value: exposure }, vig: { value: vig }, bloom: { value: bloomOn ? bloomAmt : 0 }, tOrg: { value: new THREE.Vector2() }, tSize: { value: new THREE.Vector2(TW, TH) }, full: { value: new THREE.Vector2(W, H) }, b0: { value: rtA.texture }, b1: { value: rtA.texture }, b2: { value: rtA.texture }, b3: { value: rtA.texture }, b4: { value: rtA.texture } });
    r.autoClear = true; [rtA, rtB].forEach(t => { r.setRenderTarget(t); r.setClearColor(0x000000, 0); r.clear(); });
    const out = document.createElement("canvas"); out.width = W; out.height = H; const octx = out.getContext("2d"), px = new Uint8Array(TW * TH * 4), img = octx.createImageData(TW, TH);
    const finish = (scale, tx = 0, ty = 0) => {
      toneQ.mat.uniforms.t.value = rtA.texture; toneQ.mat.uniforms.ex.value = exposure * (scale || 1); toneQ.mat.uniforms.tOrg.value.set(tx, H - ty - TH);
      if (blur) {
        const pass = (q, tgt) => { r.setRenderTarget(tgt); r.render(q.scene, q.cam); };
        bloomQ.mat.uniforms.t.value = rtA.texture; bloomQ.mat.uniforms.ex.value = exposure * (scale || 1); pass(bloomQ, blur[0].a);
        blur.forEach((L, k) => {
          const src = k ? blur[k - 1].a.texture : blur[0].a.texture;
          if (k) { blurQ.mat.uniforms.t.value = src; blurQ.mat.uniforms.d.value.set(1 / blur[k - 1].w, 0); pass(blurQ, L.b); blurQ.mat.uniforms.t.value = L.b.texture; blurQ.mat.uniforms.d.value.set(0, 1 / L.h); pass(blurQ, L.a); }
          else { blurQ.mat.uniforms.t.value = L.a.texture; blurQ.mat.uniforms.d.value.set(1 / L.w, 0); pass(blurQ, L.b); blurQ.mat.uniforms.t.value = L.b.texture; blurQ.mat.uniforms.d.value.set(0, 1 / L.h); pass(blurQ, L.a); }
          toneQ.mat.uniforms["b" + k].value = L.a.texture;
        });
      }
      r.setRenderTarget(rtOut); r.render(toneQ.scene, toneQ.cam); r.readRenderTargetPixels(rtOut, 0, 0, TW, TH, px); r.setRenderTarget(S.target);
      for (let y = 0; y < TH; y++) img.data.set(px.subarray((TH - 1 - y) * TW * 4, (TH - y) * TW * 4), y * TW * 4);   // GL läser nerifrån och upp
      octx.putImageData(img, tx, ty, 0, 0, Math.min(TW, W - tx), Math.min(TH, H - ty)); return out;
    };
    // 5) delbilderna
    // skärpedjup: linsen = en skiva; varje delbild ser från en punkt på skivan men mot samma skärpeplan
    let focus = Number(opt.focus) > 0 ? Number(opt.focus) : 0; const pos0 = camPos0, bx = new THREE.Vector3(), by = new THREE.Vector3(), bz = new THREE.Vector3();
    if (dofAmt > 0 && !focus) { cam.updateMatrixWorld(); const tg = (l3.orbit && l3.orbit.target) || sph.center, fw = cam.getWorldDirection(new THREE.Vector3()); focus = Math.max(0.5, tg.clone().sub(cam.position).dot(fw)); }
    const aperture = dofAmt > 0 ? focus * 0.02 * dofAmt : 0;
    const T = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), bg0 = S.clear;
    const pb = { R: new THREE.Vector3(), U: new THREE.Vector3(), F: new THREE.Vector3() };
    if (pano) {
      cam.updateMatrixWorld(); { const f = cam.getWorldDirection(new THREE.Vector3()); f.z = 0; if (f.lengthSq() < 1e-6) f.set(0, 1, 0); pb.F.copy(f.normalize()); pb.U.set(0, 0, 1); pb.R.crossVectors(pb.F, pb.U).normalize(); }   // vågrät horisont, mitten = blickriktningen i sidled
      cubeRT = new THREE.WebGLCubeRenderTarget(Math.max(256, Math.min(texMax, 2048, Math.round(H / 2))), { type: THREE.HalfFloatType, format: THREE.RGBAFormat, generateMipmaps: false });
      cubeCam = new THREE.CubeCamera(cam.near, cam.far, cubeRT); cubeCam.position.copy(camPos0); cubeCam.updateMatrixWorld();
      panoQ = l3rnQuad(L3RN_PANO, { tCube: { value: cubeRT.texture }, bR: { value: pb.R }, bU: { value: pb.U }, bF: { value: pb.F }, tOrg: { value: new THREE.Vector2() }, tSize: { value: new THREE.Vector2(TW, TH) }, full: { value: new THREE.Vector2(W, H) }, jit: { value: new THREE.Vector2() } });
    }
    let done = 0, doneAll = 0;
    for (let ti = 0; ti < tiles.length && !l3rn.cancel; ti++) {
    const [tx, ty] = tiles[ti]; done = 0; if (ti) [rtA, rtB].forEach(t => { r.setRenderTarget(t); r.setClearColor(0x000000, 0); r.clear(); });
    for (let i = 0; i < N; i++) {
      if (l3rn.cancel) break;
      cam.setViewOffset(W, H, tx + l3rnHalton(i + 1, 2) - 0.5, ty + l3rnHalton(i + 1, 3) - 0.5, TW, TH);                    // kantutjämning: bråkdel av en bildpunkt
      e1.set(-d0.y, d0.x, 0); if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0); e1.normalize(); e2.crossVectors(d0, e1).normalize();
      const rr = Math.tan(soft * Math.PI / 180) * Math.sqrt(l3rnHalton(i + 1, 5)), th = 2 * Math.PI * l3rnHalton(i + 1, 7);   // solen: en punkt på dess skiva
      T.copy(d0).addScaledVector(e1, rr * Math.cos(th)).addScaledVector(e2, rr * Math.sin(th)).normalize();
      if (aperture > 0) {
        cam.position.copy(pos0); cam.updateMatrixWorld(); cam.matrixWorld.extractBasis(bx, by, bz);
        const la = Math.sqrt(l3rnHalton(i + 1, 17)) * aperture / 2, lt = 2 * Math.PI * l3rnHalton(i + 1, 19), ldx = la * Math.cos(lt), ldy = la * Math.sin(lt);
        cam.position.copy(pos0).addScaledVector(bx, ldx).addScaledVector(by, ldy); cam.updateMatrixWorld();
        const pe = cam.projectionMatrix.elements; pe[8] -= pe[0] * ldx / focus; pe[9] -= pe[5] * ldy / focus; cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
      }
      sun.position.copy(sph.center).addScaledVector(T, dist);
      const z = 0.08 + 0.92 * l3rnHalton(i + 1, 11), ph = 2 * Math.PI * l3rnHalton(i + 1, 13), s2 = Math.sqrt(1 - z * z);   // himmelsljuset: slumpad riktning över övre halvklotet (z upp)
      sky.position.set(sph.center.x + Math.cos(ph) * s2 * dist, sph.center.y + Math.sin(ph) * s2 * dist, sph.center.z + z * dist);
      sun.updateMatrixWorld(); sun.target.updateMatrixWorld(); sky.updateMatrixWorld(); sky.target.updateMatrixWorld();
      if (skyMesh) skyMesh.position.copy(cam.position); skyMesh && skyMesh.updateMatrixWorld();
      if (pano) {
        r.setClearColor(bg0, 1); cubeCam.update(r, scene);
        panoQ.mat.uniforms.tOrg.value.set(tx, H - ty - TH); panoQ.mat.uniforms.jit.value.set(l3rnHalton(i + 1, 2) - 0.5, l3rnHalton(i + 1, 3) - 0.5);
        r.setRenderTarget(rtS); r.render(panoQ.scene, panoQ.cam);
      } else { r.setRenderTarget(rtS); r.setClearColor(bg0, 1); r.render(scene, cam); }
      addQ.mat.uniforms.tAcc.value = rtA.texture; r.setRenderTarget(rtB); r.render(addQ.scene, addQ.cam); [rtA, rtB] = [rtB, rtA];
      done++; doneAll++;
      if (i % 3 === 2 || i === N - 1) {
        if (typeof opt.onProgress === "function" && (done === N || done % Math.max(2, Math.round(N / 12)) === 0)) opt.onProgress(doneAll, N * tiles.length, finish(N / done, tx, ty));
        r.setRenderTarget(S.target);   // ritar något annat i väntan (vyns egen ritloop) ska det inte hamna i våra buffertar
        await new Promise(res => setTimeout(res, 0));
      }
    }
    finish(N / Math.max(1, done), tx, ty);   // avbruten: det som hunnit läggas ihop skalas upp
    }
    l3rnPrecip(octx, W, H, E, Number(opt.time) || 0); const canvas = out;
    l3rn.last = { canvas, width: W, height: H, panorama: pano, samples: N, tiles: tiles.length, ms: Math.round(performance.now() - t0) };
    return l3rn.last;
  } finally {
    // 6) återställ allt
    S.linUndo.splice(0).reverse().forEach(f => { try { f(); } catch (e) { /* bara visning */ } });
    if (typeof l3rmEnd === "function") l3rmEnd(S);
    if (skyMesh) { scene.remove(skyMesh); skyMesh.geometry.dispose(); skyMesh.material.dispose(); }
    scene.environment = S.envMap;
    scene.fog = S.fog;
    r.setRenderTarget(S.target); r.autoClear = S.autoClear; r.setClearColor(S.clear, S.clearA); scene.background = S.bg; if (bgTex) bgTex.dispose();
    if (camPos0) { cam.position.copy(camPos0); cam.updateMatrixWorld(); }
    if (cam.clearViewOffset) cam.clearViewOffset(); cam.aspect = S.aspect; cam.near = S.near; cam.far = S.far; cam.updateProjectionMatrix();
    if (sky) { scene.remove(sky, sky.target); if (sky.shadow && sky.shadow.map) sky.shadow.map.dispose(); }
    if (S.shadowSize && !opt.sticky) { const [L, n] = S.shadowSize; L.shadow.mapSize.set(n, n); if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; } } else if (S.shadowSize) l3rn.sticky = S.shadowSize;
    S.lights.forEach(([o, inten, pos, cs, col]) => { o.intensity = inten; o.position.copy(pos); o.castShadow = cs; if (col) o.color.copy(col); });
    S.env.forEach((v, m) => { m.envMapIntensity = v; });
    S.vis.forEach(([o, v]) => { o.visible = v; }); if (l3.gizmo && S.gizmo != null) l3.gizmo.visible = S.gizmo;
    l3vm.sunDir = S.sunDir; if (S.mode !== "real") { if (!opt.sticky) l3vmSet(S.mode, true); } else l3vmShadows(true);   // sticky: filmen låter Realistisk stå kvar mellan bilderna och sätter tillbaka läget i slutet
    (blur || []).forEach(L => { L.a.dispose(); L.b.dispose(); }); [rtS, rtA, rtB, rtOut].forEach(t => t && t.dispose()); if (cubeRT) cubeRT.dispose(); [addQ, toneQ, bloomQ, blurQ, panoQ].forEach(q => { if (q) { q.mesh.geometry.dispose(); q.mat.dispose(); } });
    l3rn.busy = false;
    l3Render();
  }
}
(function () {   // medan renderingen pågår ritar inte vyn själv (delar ljus och skuggor)
  if (typeof l3Render === "function") { const f = l3Render; l3Render = function () { if (l3rn.busy) return; return f.apply(this, arguments); }; }
})();

/* ---- Rutan "🎬 Rendera": flikarna Bild, Material, Mark och Miljö – med förhandsvisning som uppdateras när du ändrar ---- */
const l3rnUi = { tab: "bild", grp: "Mark", mat: "asfalt", target: "", prevT: 0, areaMat: "gras", roadW: 6 };
function l3rnBtn() {
  const host = document.getElementById("view3d"); if (!host) return;
  let btn = document.getElementById("v3RenderBtn");
  if (!btn) { btn = document.createElement("button"); btn.type = "button"; btn.id = "v3RenderBtn"; btn.className = "v3-bridge v3-rnb"; btn.textContent = "🎬 Rendera"; btn.title = "Rendera en snygg bild av modellen – med egna renderingsmaterial, mark och miljö (påverkar inte editorns utseende)"; btn.onclick = l3rnOpen; host.appendChild(btn); }
}
const l3rnQ = (el, s) => el.querySelector(s);
function l3rnOpts(el) {
  const v = s => { const e = l3rnQ(el, s); return e ? e.value : undefined; };
  return l3rnUi.last = { quality: v("#rnQ") || "good", soft: +(v("#rnSoft") || 1.6), ao: +(v("#rnAo") || 1), exposure: +(v("#rnEx") || 0.95), bloom: +(v("#rnBl") || 0.12), dof: +(v("#rnDof") || 0), shadowSize: +(v("#rnSh") || 4096), edges: !!(l3rnQ(el, "#rnEdges") || {}).checked, panorama: !!(l3rnQ(el, "#rnPano") || {}).checked };
}
function l3rnPreviewSoon() {   // lågupplöst bild efter varje ändring (hoppar över om en full rendering pågår)
  const el = document.getElementById("v3Render"); if (!el) return; clearTimeout(l3rnUi.prevT);
  l3rnUi.prevT = setTimeout(async () => {
    if (l3rn.busy || (typeof l3rf !== "undefined" && l3rf.st)) { l3rnUi.prevT = setTimeout(l3rnPreviewSoon, 1500); return; }
    const cv = l3rnQ(el, "#rnCv"), msg = l3rnQ(el, "#rnMsg"); if (!cv) return;
    try { msg.textContent = "Förhandsvisning …"; const o = l3rnOpts(el), res = await l3rnRender({ ...o, samples: 4, width: 560, ao: o.ao }); cv.width = res.width; cv.height = res.height; cv.getContext("2d").drawImage(res.canvas, 0, 0); msg.textContent = "Förhandsvisning (4 delbilder) – tryck Rendera för full kvalitet."; }
    catch (e) { msg.textContent = "Förhandsvisning: " + e.message; }
  }, 700);
}
function l3rmUiRefresh() { const el = document.getElementById("v3Render"); if (!el || (typeof l3rf !== "undefined" && l3rf.st)) return; if (l3rnUi.tab !== "film") { l3rnTab(l3rnUi.tab, true); l3rnPreviewSoon(); } }
const l3rnSel = () => (typeof l3 !== "undefined" && l3.sel ? [...l3.sel] : []);
function l3rnRuleLabel(r) {
  if (r.t === "obj") { const p = placements.find(q => q.id === r.ref); return "Objekt: " + (p ? p.name : "(borttaget)"); }
  if (r.t === "cls") return "IFC-klass " + r.ref; if (r.t === "guid") return "IFC-element"; return "Färg " + r.ref;
}
function l3rnGrid(sel, groupKey, onPick, withNone) {
  const chips = [...L3RM_GROUPS, "Egna"].map(g => `<button type="button" class="rn-chip${l3rnUi[groupKey] === g ? " on" : ""}" data-g="${g}">${g}</button>`).join("");
  const mats = l3rnUi[groupKey] === "Egna" ? l3rmData().custom.map(c => l3rmDef(c.id)).filter(Boolean) : L3RM_LIB.filter(m => m.group === l3rnUi[groupKey]);
  return `<div class="rn-chips">${chips}</div><div class="rn-grid">${withNone ? `<button type="button" class="rn-mat${!sel ? " on" : ""}" data-m=""><span class="rn-none">Ingen</span><em>Ingen</em></button>` : ""}${mats.map(m => `<button type="button" class="rn-mat${sel === m.id ? " on" : ""}" data-m="${m.id}" title="${m.name} – ${m.size} m"><img src="${l3rmThumb(m.id)}" alt="" /><em>${m.name}</em></button>`).join("")}</div>`;
}
function l3rnTab(tab, keep) {
  const el = document.getElementById("v3Render"); if (!el) return; l3rnUi.tab = tab; const body = l3rnQ(el, ".rn-body"), D = l3rmData(), esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  el.querySelectorAll(".rn-tabs button").forEach(b => b.classList.toggle("on", b.dataset.t === tab));
  const scr = body.scrollTop;
  if (tab === "bild") {
    body.innerHTML = `<div class="rn-g"><label>Kvalitet<select id="rnQ"><option value="fast">Snabb (12)</option><option value="good" selected>Bra (48)</option><option value="best">Bäst (160)</option></select></label>
      <label>Storlek<select id="rnS"><option value="1280">1280 px</option><option value="1920" selected>1920 px (Full HD)</option><option value="2560">2560 px</option><option value="3840">3840 px (4K)</option><option value="7680">7680 px (8K, delas i rutor)</option></select></label>
      <label>Mjuka skuggor <input id="rnSoft" type="range" min="0" max="8" step="0.5" value="1.6" /></label><label>Ambient occlusion <input id="rnAo" type="range" min="0" max="1.5" step="0.1" value="1" /></label>
      <label>Exponering <input id="rnEx" type="range" min="0.5" max="2" step="0.05" value="0.95" /></label><label title="Glöd runt det som är ljusare än vitt (solen, blanka ytor)">Bloom <input id="rnBl" type="range" min="0" max="1" step="0.05" value="0.12" /></label><label title="Oskärpa före och bakom skärpeplanet (fokus ligger vid det du tittar mot). 0 = allt skarpt">Skärpedjup <input id="rnDof" type="range" min="0" max="5" step="0.25" value="0" /></label><label title="Skuggkartans storlek: större = skarpare skuggor men tyngre">Skuggor<select id="rnSh"><option value="2048">2048</option><option value="4096" selected>4096</option><option value="8192">8192 (kräver mycket grafikminne)</option></select></label><label class="rn-chk"><input id="rnEdges" type="checkbox" /> Visa konturlinjer på kroppar</label><label class="rn-chk" title="Hela omgivningen runt kamerans plats som en equirektangulär bild (2:1) – kan läggas in i en 360°-visare. Storleken är bredden."><input id="rnPano" type="checkbox" /> 360°-panorama (från kamerans plats)</label></div>
      <div class="rn-note">Material, mark och miljö väljs i flikarna bredvid och gäller bara renderingen – 3D-editorns utseende ändras inte.</div>`;
    body.querySelectorAll("input,select").forEach(i => { i.onchange = i.oninput = () => { if (i.id !== "rnS") l3rnPreviewSoon(); }; });
  } else if (tab === "material") {
    const T = l3rmTargets(), sel = l3rnSel(), opts = [];
    if (sel.length) opts.push([`sel`, `Markerade objekt i 3D (${sel.length})`]);
    T.cls.forEach(([c, n]) => opts.push([`cls:${c}`, `IFC: ${c} (${n})`]));
    T.colors.forEach(([c, n]) => opts.push([`color:${c}`, `Alla med färgen ${c} (${n})`]));
    if (!opts.some(o => o[0] === l3rnUi.target)) l3rnUi.target = opts.length ? opts[0][0] : "";
    body.innerHTML = `<div class="rn-row"><label>Lägg på<select id="rmT">${opts.length ? opts.map(o => `<option value="${esc(o[0])}"${o[0] === l3rnUi.target ? " selected" : ""}>${esc(o[1])}</option>`).join("") : "<option value=''>Inget att peka på – markera ett objekt i 3D</option>"}</select></label></div>
      <div class="rn-row rn-sl"><label>Skala <input id="rmS" type="range" min="0.25" max="4" step="0.05" value="1" /></label><label>Vridning <input id="rmR" type="range" min="0" max="180" step="5" value="0" /></label><label>Tona <input id="rmTint" type="color" value="#ffffff" /></label></div>
      <div class="rn-help">Klicka på ett material för att lägga det på det valda. Markera objekt i 3D-vyn först om du vill ändra just dem.</div>
      ${l3rnGrid(l3rnUi.mat, "grp")}
      <div class="rn-sub">Dina material (${D.rules.length})<button type="button" id="rmClear" ${D.rules.length ? "" : "disabled"}>Rensa alla</button></div>
      <div class="rn-rules">${D.rules.map(r => { const d = l3rmDef(r.mat); return `<div class="rn-rule"><img src="${l3rmThumb(r.mat)}" alt="" /><span><b>${esc(d ? d.name : r.mat)}</b><small>${esc(l3rnRuleLabel(r))}${r.s && r.s !== 1 ? ` · skala ${r.s}` : ""}${r.tint ? ` · tona ${r.tint}` : ""}</small></span><button type="button" data-rm="${r.id}" title="Ta bort">✕</button></div>`; }).join("") || '<div class="rn-note">Inga än.</div>'}</div>`;
    if (l3rnUi.grp === "Egna" && typeof l3rmedForm === "function") l3rmedForm(body);
    const tsel = l3rnQ(body, "#rmT"); if (tsel) tsel.onchange = () => { l3rnUi.target = tsel.value; };
    body.querySelectorAll(".rn-chip").forEach(b => { b.onclick = () => { l3rnUi.grp = b.dataset.g; l3rnTab("material"); }; });
    body.querySelectorAll(".rn-mat").forEach(b => { b.onclick = () => {
      const t = l3rnQ(body, "#rmT").value, o = { s: +l3rnQ(body, "#rmS").value, r: +l3rnQ(body, "#rmR").value, tint: l3rnQ(body, "#rmTint").value === "#ffffff" ? "" : l3rnQ(body, "#rmTint").value }; l3rnUi.mat = b.dataset.m; l3rnUi.target = t; if (String(b.dataset.m).startsWith("c_") && typeof l3rmedUi !== "undefined") l3rmedUi.id = b.dataset.m;
      try { if (t === "sel") l3rnSel().forEach(id => l3rmSetRule({ t: "obj", ref: id }, b.dataset.m, o)); else if (t.startsWith("cls:")) l3rmSetRule({ t: "cls", ref: t.slice(4) }, b.dataset.m, o); else if (t.startsWith("color:")) l3rmSetRule({ t: "color", ref: t.slice(6) }, b.dataset.m, o); else l3rnQ(el, "#rnMsg").textContent = "Markera ett objekt i 3D först."; } catch (e) { l3rnQ(el, "#rnMsg").textContent = e.message; }
    }; });
    body.querySelectorAll("[data-rm]").forEach(b => { b.onclick = () => l3rmRemoveRule(b.dataset.rm); });
    const cl = l3rnQ(body, "#rmClear"); if (cl) cl.onclick = () => { l3rmData().rules = []; l3rmSave(); };
  } else if (tab === "mark") {
    const g = D.ground, base = g.base;
    body.innerHTML = `<div class="rn-sub">Grundmaterial för marken</div>${l3rnGrid(base ? base.mat : "", "grp", null, true)}
      <div class="rn-row rn-sl"><label>Skala <input id="gS" type="range" min="0.25" max="4" step="0.05" value="${base ? base.s : 1}" ${base ? "" : "disabled"} /></label><label>Vridning <input id="gR" type="range" min="0" max="180" step="5" value="${base ? base.r : 0}" ${base ? "" : "disabled"} /></label></div>
      <div class="rn-help">Marken ersätter planens bild i renderingen och tar emot skuggor. Rita ytor och vägar i 3D-editorn (Rita → polygon/polylinje), markera dem här och lägg på ett material.</div>
      <div class="rn-sub">Markytor och vägar (${g.areas.length})</div>
      <div class="rn-rules">${g.areas.map(a => `<div class="rn-rule"><img src="${l3rmThumb(a.mat)}" alt="" /><span><b>${esc(a.name)}</b><small>${a.kind === "road" ? `Väg ${a.width} m bred` : "Markyta"} · ${esc((l3rmDef(a.mat) || {}).name || a.mat)}</small></span><select data-am="${a.id}">${L3RM_LIB.map(m => `<option value="${m.id}"${m.id === a.mat ? " selected" : ""}>${m.name}</option>`).join("")}</select><button type="button" data-ad="${a.id}" title="Ta bort">✕</button></div>`).join("") || '<div class="rn-note">Inga än.</div>'}</div>
      <div class="rn-row rn-add"><button type="button" id="gArea">＋ Markyta av markerad yta</button><button type="button" id="gRoad">＋ Väg av markerad linje</button><label>Bredd <input id="gW" type="number" min="1" max="60" step="0.5" value="${l3rnUi.roadW}" /> m</label></div>`;
    body.querySelectorAll(".rn-chip").forEach(b => { b.onclick = () => { l3rnUi.grp = b.dataset.g; l3rnTab("mark"); }; });
    body.querySelectorAll(".rn-mat").forEach(b => { b.onclick = () => { l3rnUi.areaMat = b.dataset.m || l3rnUi.areaMat; l3rmSetGroundBase(b.dataset.m || null, { s: base ? base.s : 1, r: base ? base.r : 0, tint: base ? base.tint : "" }); }; });
    const gs = l3rnQ(body, "#gS"), gr = l3rnQ(body, "#gR"); const upd = () => { if (l3rmData().ground.base) { const b = l3rmData().ground.base; b.s = +gs.value; b.r = +gr.value; l3rmSave(); } }; if (gs) gs.onchange = upd; if (gr) gr.onchange = upd;
    body.querySelectorAll("[data-am]").forEach(s2 => { s2.onchange = () => l3rmSetAreaMat(s2.dataset.am, s2.value); });
    body.querySelectorAll("[data-ad]").forEach(b => { b.onclick = () => l3rmRemoveArea(b.dataset.ad); });
    const fromSel = road => { const id = l3rnSel()[0], p = id && placements.find(q => q.id === id); if (!p) { l3rnQ(el, "#rnMsg").textContent = "Markera en ritad yta" + (road ? "/linje" : "") + " i 3D först."; return; }
      try { const pts = l3rmFootprint(p, road); l3rnUi.roadW = +l3rnQ(body, "#gW").value || 6; l3rmAddArea({ kind: road ? "road" : "area", pts, width: l3rnUi.roadW, mat: road ? "asfalt" : l3rnUi.areaMat, name: p.name, src: p.id }); } catch (e) { l3rnQ(el, "#rnMsg").textContent = e.message; } };
    l3rnQ(body, "#gArea").onclick = () => fromSel(false); l3rnQ(body, "#gRoad").onclick = () => fromSel(true);
  } else if (tab === "film") {
    if (typeof l3rfTab === "function") l3rfTab(body, el); else body.innerHTML = '<div class="rn-note">Filmen är inte inläst.</div>';
  } else {
    const e = l3rmEnvResolved(), T = L3RM_TIMES, cur = D.env.time || "";
    body.innerHTML = `<div class="rn-sub">Tid på dygnet</div><div class="rn-chips">${Object.keys(T).map(k => `<button type="button" class="rn-chip${cur === k ? " on" : ""}" data-time="${k}">${T[k].name}</button>`).join("")}<button type="button" class="rn-chip" data-time="">Egen</button></div>
      <div class="rn-g"><label>Sol, riktning <input id="eAz" type="range" min="0" max="360" value="${Math.round(e.az != null ? e.az : 200)}" /><em>${Math.round(e.az != null ? e.az : 200)}°</em></label><label>Sol, höjd <input id="eEl" type="range" min="3" max="85" value="${Math.round(e.el != null ? e.el : 45)}" /><em>${Math.round(e.el != null ? e.el : 45)}°</em></label>
      <label>Moln <input id="eCl" type="range" min="0" max="1" step="0.05" value="${e.clouds}" /></label><label>Dis <input id="eHz" type="range" min="0" max="1" step="0.05" value="${e.haze}" /></label>
      <label>Exponering <input id="eEx" type="range" min="0.5" max="2" step="0.05" value="${e.exposure}" /></label>
      <label>Regn <input id="eRn" type="range" min="0" max="1" step="0.05" value="${e.rain}" /></label><label>Snö <input id="eSn" type="range" min="0" max="1" step="0.05" value="${e.snow}" /></label><label>Blött underlag <input id="eWt" type="range" min="0" max="1" step="0.05" value="${D.env.wet || 0}" /></label></div>
      <div class="rn-help">Molnigt ger svagare, mjukare sol och gråare himmel. Dis tonar av det som är långt bort.</div>`;
    body.querySelectorAll("[data-time]").forEach(b => { b.onclick = () => l3rmSetEnv({ time: b.dataset.time || null, az: b.dataset.time ? undefined : D.env.az, el: b.dataset.time ? undefined : D.env.el }); });
    const sv = (id, k, f) => { const i = l3rnQ(body, id); i.onchange = () => l3rmSetEnv({ [k]: f(+i.value), ...(k === "az" || k === "el" ? { time: null, az: k === "az" ? +i.value : e.az, el: k === "el" ? +i.value : e.el } : {}) }); };
    sv("#eAz", "az", v => v); sv("#eEl", "el", v => v); sv("#eCl", "clouds", v => v); sv("#eHz", "haze", v => v); sv("#eEx", "exposure", v => v); sv("#eRn", "rain", v => v); sv("#eSn", "snow", v => v); sv("#eWt", "wet", v => v);
  }
  if (keep) body.scrollTop = scr;
}
function l3rnOpen() {
  const host = document.getElementById("view3d"); if (!host) return; let el = document.getElementById("v3Render"); if (el) { el.remove(); return; }
  el = document.createElement("div"); el.id = "v3Render"; el.className = "v3-rn";
  el.innerHTML = `<div class="rn-h"><b>🎬 Rendera</b><span class="rn-tabs"><button type="button" data-t="bild" class="on">Bild</button><button type="button" data-t="material">Material</button><button type="button" data-t="mark">Mark</button><button type="button" data-t="miljo">Miljö</button><button type="button" data-t="film">Film</button></span><button type="button" class="rn-x" title="Stäng">✕</button></div>
    <div class="rn-body"></div>
    <div class="rn-a"><button type="button" id="rnGo" class="rn-go">Rendera</button><button type="button" id="rnSave" disabled>Spara PNG</button><span id="rnMsg">Vyn och kameran används som de är nu.</span></div>
    <div class="rn-p"><i id="rnBar"></i></div><div class="rn-v"><canvas id="rnCv" width="16" height="9"></canvas></div>`;
  host.appendChild(el); const q = s => el.querySelector(s);
  el.querySelectorAll(".rn-tabs button").forEach(b => { b.onclick = () => l3rnTab(b.dataset.t); });
  q(".rn-x").onclick = () => { l3rn.cancel = true; if (typeof l3rfStop === "function") l3rfStop(); clearTimeout(l3rnUi.prevT); el.remove(); };
  l3rnTab(l3rnUi.tab || "bild");
  q("#rnGo").onclick = async () => {
    if (l3rn.busy) { l3rn.cancel = true; return; }
    clearTimeout(l3rnUi.prevT); const go = q("#rnGo"); go.textContent = "Avbryt"; q("#rnSave").disabled = true; const cv = q("#rnCv"), bar = q("#rnBar"), msg = q("#rnMsg");
    try {
      const W = +((q("#rnS") || {}).value || 1920), vs = l3.renderer.getSize(new THREE.Vector2()), o = q("#rnQ") ? l3rnOpts(el) : { quality: "good", soft: 1.6, ao: 1, exposure: 0.95 };
      const res = await l3rnRender({ ...o, width: W, height: Math.round(W * vs.y / vs.x), onProgress: (d, n, c) => { bar.style.width = Math.round(d / n * 100) + "%"; msg.textContent = `Delbild ${d} av ${n} …`; cv.width = c.width; cv.height = c.height; cv.getContext("2d").drawImage(c, 0, 0); } });
      bar.style.width = "100%"; msg.textContent = `Klar: ${res.width}×${res.height}, ${res.samples} delbilder, ${(res.ms / 1000).toFixed(1)} s.`; q("#rnSave").disabled = false;
      cv.width = res.width; cv.height = res.height; cv.getContext("2d").drawImage(res.canvas, 0, 0);
    } catch (e) { msg.textContent = "Kunde inte rendera: " + e.message; }
    go.textContent = "Rendera";
  };
  q("#rnSave").onclick = () => { const c = l3rn.last && l3rn.last.canvas; if (!c) return; c.toBlob(b => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `${l3rn.last.panorama ? "panorama" : "rendering"}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, "image/png"); };
  l3rnPreviewSoon();
}
(function l3rnBoot() { const tick = () => { if (document.getElementById("view3d") && typeof l3 !== "undefined" && l3 && l3.renderer) l3rnBtn(); else setTimeout(tick, 1500); }; setTimeout(tick, 1500); })();
