/* Lägesplan – renderingsmotor för stillbilder av 3D-modellen (Victor 2026-11-14: "en snygg motor för rendering av min modell").

   Progressiv renderare ovanpå three.js (inga extra bibliotek): bilden är medelvärdet av många delbilder, där varje delbild
     – flyttar kameran en bråkdel av en bildpunkt            → kantutjämning utan trasiga linjer
     – flyttar solen inom dess skiva (mjukhet)              → mjuka skuggor med naturlig halvskugga
     – lägger ett himmelsljus från en slumpad riktning över himlavalvet med skugga → ambient occlusion: mörkare i vinklar, under tak, intill väggar
   Summan läggs ihop i en flyttalsbuffert (GPU), därefter exponering, filmisk tonkurva, sRGB och valfri vinjett → PNG.
   Bygger på läget "Realistisk" (fysikaliskt baserade material, himmelskarta, skuggplan på marken). Vyn rörs inte: allt ritas i egna buffertar och inställningarna återställs.
   Hjälpgrupper (markering, mått, tillfälliga linjer, handtag) göms under renderingen. Punktmoln ritas inte (för tungt för många delbilder).
   Prefix l3rn. Används av knappen "🎬 Rendera" i 3D-vyn och av MCP-verktyget render_image (lagesplan-l3api.js). */

const l3rn = { busy: false, cancel: false, last: null, ui: null };
const L3RN_Q = { fast: 12, good: 48, best: 160 };
const l3rnClamp = (v, a, b, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
function l3rnHalton(i, b) { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }

/* Solens riktning (mot solen) ur azimut (grader från norr, medurs) och höjd över horisonten. Projektets Y är norr, X öster, Z upp. */
function l3rnSunDir(az, el) { const a = az * Math.PI / 180, e = el * Math.PI / 180; return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)).normalize(); }

/* Fullskärmsruta för att lägga ihop och tonmappa. */
function l3rnQuad(frag, uniforms) {
  const m = new THREE.ShaderMaterial({ uniforms, depthTest: false, depthWrite: false, transparent: false, blending: THREE.NoBlending,
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }", fragmentShader: frag });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); mesh.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(mesh); return { scene: sc, mat: m, mesh, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
}
const L3RN_ADD = "uniform sampler2D t, tAcc; uniform float w; varying vec2 vUv; void main() { gl_FragColor = vec4(texture2D(tAcc, vUv).rgb + texture2D(t, vUv).rgb * w, 1.0); }";
const L3RN_TONE = `uniform sampler2D t; uniform float ex, vig, srgb; varying vec2 vUv;
  vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  void main() {
    vec3 c = texture2D(t, vUv).rgb * ex;
    c = aces(c);                                                                  // filmisk tonkurva: ljusa partier mjukas av i stället för att klippas
    c = mix(c, c * c * (3.0 - 2.0 * c), 0.28);                                       // lite mer kontrast
    float l = dot(c, vec3(0.299, 0.587, 0.114)); c = clamp(mix(vec3(l), c, 1.14), 0.0, 1.0);   // och färgmättnad
    if (srgb > 0.5) c = pow(c, vec3(1.0 / 2.2));
    vec2 p = vUv - 0.5; c *= 1.0 - vig * smoothstep(0.25, 0.85, dot(p, p) * 2.0);    // lätt vinjett
    gl_FragColor = vec4(c, 1.0);
  }`;

/* Renderar en stillbild. opt: { width, height, samples|quality (fast/good/best), sunAz, sunEl (grader), soft (solens mjukhet, grader), ao (0–1.6), exposure, vignette (0–1), edges (behåll CAD-konturer), background ("sky"|"keep"), onProgress(done,total,canvas) }.
   Returnerar { canvas, width, height, samples, ms }. */
async function l3rnRender(opt = {}) {
  if (typeof l3 === "undefined" || !l3 || !l3.renderer) throw new Error("3D-editorn är inte öppen");
  if (l3rn.busy) throw new Error("En rendering pågår redan");
  const r = l3.renderer, scene = l3.scene, cam = l3.camera, view = r.getSize(new THREE.Vector2());
  const asp = view.x / Math.max(1, view.y), maxT = Math.min(4096, r.capabilities.maxTextureSize || 4096);
  const W = Math.round(l3rnClamp(opt.width, 160, maxT, 1600)), H = Math.round(l3rnClamp(opt.height, 90, maxT, W / asp));
  const N = Math.round(l3rnClamp(opt.samples || L3RN_Q[opt.quality] || L3RN_Q.good, 1, 512, L3RN_Q.good));
  const soft = l3rnClamp(opt.soft, 0, 15, 1.6), ao = l3rnClamp(opt.ao, 0, 1.6, 1), exposure = l3rnClamp(opt.exposure, 0.2, 4, 0.95), vig = l3rnClamp(opt.vignette, 0, 1, 0.25);
  const t0 = performance.now();
  l3rn.busy = true; l3rn.cancel = false;
  const S = { mode: l3vm.mode, aspect: cam.aspect, near: cam.near, far: cam.far, target: r.getRenderTarget(), sunDir: l3vm.sunDir ? l3vm.sunDir.clone() : null, lights: [], vis: [], env: new Map(), gizmo: l3.gizmo ? l3.gizmo.visible : null, autoClear: r.autoClear, clear: r.getClearColor(new THREE.Color()), clearA: r.getClearAlpha(), bg: scene.background };
  let sky = null, bgTex = null, rtS = null, rtA = null, rtB = null, rtOut = null, addQ = null, toneQ = null;
  try {
    // 1) Realistisk (material, himmelskarta, skuggor, skuggplan) – hör till motorn
    if (l3vm.mode !== "real") l3vmSet("real", true);
    if (opt.sunAz != null || opt.sunEl != null) l3vm.sunDir = l3rnSunDir(l3rnClamp(opt.sunAz, -720, 720, 200), l3rnClamp(opt.sunEl, 1, 89, 45));
    l3vmShadows(true); l3vmSync(true);
    const sun = l3vmSun(); if (!sun) throw new Error("Ingen sol i scenen");
    // 2) göm hjälpgrupper och CAD-konturer
    ["sel", "meas", "tmp"].forEach(k => { const g = l3.groups[k]; if (g) { S.vis.push([g, g.visible]); g.visible = false; } });
    if (l3.gizmo) l3.gizmo.visible = false;
    scene.traverse(o => { if (o.userData && o.userData.vmEdge) { S.vis.push([o, o.visible]); o.visible = false; } });
    if (!opt.edges) scene.traverse(o => { if (o.isLineSegments && o.userData.noVm && o.material && o.material.color && o.material.color.getHex() === 0x1f2937) { S.vis.push([o, o.visible]); o.visible = false; } });   // kroppars konturlinjer (CAD-utseendet)
    if (opt.background !== "keep") {   // himmel: mjuk gradient uppifrån och ned
      const g = document.createElement("canvas"); g.width = 2; g.height = 256; const gx = g.getContext("2d"), gr = gx.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, "#6fa3dd"); gr.addColorStop(0.55, "#cfe0f2"); gr.addColorStop(1, "#f3f0ea"); gx.fillStyle = gr; gx.fillRect(0, 0, 2, 256);
      bgTex = new THREE.CanvasTexture(g); bgTex.minFilter = bgTex.magFilter = THREE.LinearFilter; bgTex.generateMipmaps = false; bgTex.encoding = r.outputEncoding; scene.background = bgTex;
    }
    // 3) ljus: solen mjukas upp, himmelsljus med skugga läggs till, grundljuset sänks så att skuggor kan bli mörka
    scene.traverse(o => { if (o.isLight) S.lights.push([o, o.intensity, o.position.clone(), o.castShadow]); });
    const d0 = sun.position.clone().sub(sun.target.position).normalize();
    const bb = new THREE.Box3(); ["bldg", "places", "objs"].forEach(k => { const g = l3.groups[k]; if (g && g.visible) bb.expandByObject(g); });
    if (bb.isEmpty()) bb.set(new THREE.Vector3(-30, -30, 0), new THREE.Vector3(30, 30, 10));
    const sph = bb.getBoundingSphere(new THREE.Sphere()), R = Math.max(8, sph.radius * 1.08), dist = R * 2.4, mapN = sun.shadow.mapSize.x;
    const fit = L => { L.shadow.bias = -0.0003; L.shadow.normalBias = Math.max(0.02, (2 * R / mapN) * 1.3); Object.assign(L.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: dist - R * 1.15, far: dist + R * 1.15 }); L.shadow.camera.updateProjectionMatrix(); };   // skuggkartan följer modellen (inte hela marken)
    sun.target.position.copy(sph.center); sun.castShadow = true; fit(sun);
    const hemi = scene.children.find(c => c.isHemisphereLight), fill = scene.children.find(c => c.isDirectionalLight && c !== sun);
    if (hemi) hemi.intensity = 0.08 + 0.12 * (1 - Math.min(1, ao)); if (fill) fill.intensity = 0.03;
    sun.intensity = 0.95;
    sky = new THREE.DirectionalLight(0xdbe8ff, 0.8 * ao); sky.castShadow = ao > 0; sky.shadow.mapSize.set(mapN, mapN); fit(sky);
    sky.target.position.copy(sph.center); scene.add(sky, sky.target);
    scene.traverse(o => { if (o.isMesh && o.material) [].concat(o.material).forEach(m => { if (m.envMapIntensity != null && !S.env.has(m)) { S.env.set(m, m.envMapIntensity); m.envMapIntensity = 0.1 + 0.2 * (1 - Math.min(1, ao)); } }); });
    // 4) buffertar: delbild (HDR, halvflyttal), två summabuffertar (ping-pong, flyttal) och slutbilden (8 bit)
    rtS = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true });
    rtA = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: false }); rtB = rtA.clone();
    rtOut = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false });
    addQ = l3rnQuad(L3RN_ADD, { t: { value: rtS.texture }, tAcc: { value: rtA.texture }, w: { value: 1 / N } });
    toneQ = l3rnQuad(L3RN_TONE, { t: { value: rtA.texture }, ex: { value: exposure }, vig: { value: vig }, srgb: { value: r.outputEncoding === THREE.sRGBEncoding ? 1 : 0 } });
    r.autoClear = true; [rtA, rtB].forEach(t => { r.setRenderTarget(t); r.setClearColor(0x000000, 0); r.clear(); });
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
    const out = document.createElement("canvas"); out.width = W; out.height = H; const octx = out.getContext("2d"), px = new Uint8Array(W * H * 4), img = octx.createImageData(W, H);
    const finish = (scale) => {
      toneQ.mat.uniforms.t.value = rtA.texture; toneQ.mat.uniforms.ex.value = exposure * (scale || 1);
      r.setRenderTarget(rtOut); r.render(toneQ.scene, toneQ.cam); r.readRenderTargetPixels(rtOut, 0, 0, W, H, px); r.setRenderTarget(S.target);
      for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);   // GL läser nerifrån och upp
      octx.putImageData(img, 0, 0); return out;
    };
    // 5) delbilderna
    const T = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), bg0 = S.clear;
    let done = 0;
    for (let i = 0; i < N; i++) {
      if (l3rn.cancel) break;
      cam.setViewOffset(W, H, l3rnHalton(i + 1, 2) - 0.5, l3rnHalton(i + 1, 3) - 0.5, W, H);                    // kantutjämning: bråkdel av en bildpunkt
      e1.set(-d0.y, d0.x, 0); if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0); e1.normalize(); e2.crossVectors(d0, e1).normalize();
      const rr = Math.tan(soft * Math.PI / 180) * Math.sqrt(l3rnHalton(i + 1, 5)), th = 2 * Math.PI * l3rnHalton(i + 1, 7);   // solen: en punkt på dess skiva
      T.copy(d0).addScaledVector(e1, rr * Math.cos(th)).addScaledVector(e2, rr * Math.sin(th)).normalize();
      sun.position.copy(sph.center).addScaledVector(T, dist);
      const z = 0.08 + 0.92 * l3rnHalton(i + 1, 11), ph = 2 * Math.PI * l3rnHalton(i + 1, 13), s2 = Math.sqrt(1 - z * z);   // himmelsljuset: slumpad riktning över övre halvklotet (z upp)
      sky.position.set(sph.center.x + Math.cos(ph) * s2 * dist, sph.center.y + Math.sin(ph) * s2 * dist, sph.center.z + z * dist);
      sun.updateMatrixWorld(); sun.target.updateMatrixWorld(); sky.updateMatrixWorld(); sky.target.updateMatrixWorld();
      r.setRenderTarget(rtS); r.setClearColor(bg0, 1); r.render(scene, cam);
      addQ.mat.uniforms.tAcc.value = rtA.texture; r.setRenderTarget(rtB); r.render(addQ.scene, addQ.cam); [rtA, rtB] = [rtB, rtA];
      done++;
      if (i % 3 === 2 || i === N - 1) {
        if (typeof opt.onProgress === "function" && (done === N || done % Math.max(2, Math.round(N / 12)) === 0)) opt.onProgress(done, N, finish(N / done));
        r.setRenderTarget(S.target);   // ritar något annat i väntan (vyns egen ritloop) ska det inte hamna i våra buffertar
        await new Promise(res => setTimeout(res, 0));
      }
    }
    const canvas = finish(N / Math.max(1, done));   // avbruten: det som hunnit läggas ihop skalas upp
    l3rn.last = { canvas, width: W, height: H, samples: done, ms: Math.round(performance.now() - t0) };
    return l3rn.last;
  } finally {
    // 6) återställ allt
    r.setRenderTarget(S.target); r.autoClear = S.autoClear; r.setClearColor(S.clear, S.clearA); scene.background = S.bg; if (bgTex) bgTex.dispose();
    if (cam.clearViewOffset) cam.clearViewOffset(); cam.aspect = S.aspect; cam.near = S.near; cam.far = S.far; cam.updateProjectionMatrix();
    if (sky) { scene.remove(sky, sky.target); if (sky.shadow && sky.shadow.map) sky.shadow.map.dispose(); }
    S.lights.forEach(([o, inten, pos, cs]) => { o.intensity = inten; o.position.copy(pos); o.castShadow = cs; });
    S.env.forEach((v, m) => { m.envMapIntensity = v; });
    S.vis.forEach(([o, v]) => { o.visible = v; }); if (l3.gizmo && S.gizmo != null) l3.gizmo.visible = S.gizmo;
    l3vm.sunDir = S.sunDir; if (S.mode !== "real") l3vmSet(S.mode, true); else l3vmShadows(true);
    [rtS, rtA, rtB, rtOut].forEach(t => t && t.dispose()); [addQ, toneQ].forEach(q => { if (q) { q.mesh.geometry.dispose(); q.mat.dispose(); } });
    l3rn.busy = false;
    l3Render();
  }
}
(function () {   // medan renderingen pågår ritar inte vyn själv (delar ljus och skuggor)
  if (typeof l3Render === "function") { const f = l3Render; l3Render = function () { if (l3rn.busy) return; return f.apply(this, arguments); }; }
})();

/* ---- Rutan "🎬 Rendera" ---- */
function l3rnUi() {
  const host = document.getElementById("view3d"); if (!host) return;
  let btn = document.getElementById("v3RenderBtn");
  if (!btn) { btn = document.createElement("button"); btn.type = "button"; btn.id = "v3RenderBtn"; btn.className = "v3-bridge v3-rnb"; btn.textContent = "🎬 Rendera"; btn.title = "Rendera en snygg bild av modellen (mjuka skuggor, ambient occlusion, kantutjämning)"; btn.onclick = l3rnOpen; host.appendChild(btn); }
}
function l3rnOpen() {
  const host = document.getElementById("view3d"); if (!host) return; let el = document.getElementById("v3Render"); if (el) { el.remove(); return; }
  el = document.createElement("div"); el.id = "v3Render"; el.className = "v3-rn";
  const sd = l3vm.sunDir, az0 = sd ? Math.round((Math.atan2(sd.x, sd.y) * 180 / Math.PI + 360) % 360) : 210, el0 = sd ? Math.round(Math.asin(Math.max(-1, Math.min(1, sd.clone().normalize().z))) * 180 / Math.PI) : 45;
  el.innerHTML = `<div class="rn-h"><b>🎬 Rendera</b><button type="button" class="rn-x" title="Stäng">✕</button></div>
    <div class="rn-g"><label>Kvalitet<select id="rnQ"><option value="fast">Snabb (12)</option><option value="good" selected>Bra (48)</option><option value="best">Bäst (160)</option></select></label>
    <label>Storlek<select id="rnS"><option value="1280">1280 px</option><option value="1920" selected>1920 px (Full HD)</option><option value="2560">2560 px</option><option value="3840">3840 px (4K)</option></select></label>
    <label>Sol, riktning <input id="rnAz" type="range" min="0" max="360" value="${az0}" /><em id="rnAzV">${az0}°</em></label>
    <label>Sol, höjd <input id="rnEl" type="range" min="5" max="85" value="${Math.max(5, Math.min(85, el0 || 45))}" /><em id="rnElV">${el0 || 45}°</em></label>
    <label>Mjuka skuggor <input id="rnSoft" type="range" min="0" max="8" step="0.5" value="1.6" /></label>
    <label>Ambient occlusion <input id="rnAo" type="range" min="0" max="1.5" step="0.1" value="1" /></label>
    <label>Exponering <input id="rnEx" type="range" min="0.5" max="2" step="0.05" value="1" /></label></div>
    <div class="rn-a"><button type="button" id="rnGo" class="rn-go">Rendera</button><button type="button" id="rnSave" disabled>Spara PNG</button><span id="rnMsg">Vyn och kameran används som de är nu.</span></div>
    <div class="rn-p"><i id="rnBar"></i></div><div class="rn-v"><canvas id="rnCv" width="16" height="9"></canvas></div>`;
  host.appendChild(el); const q = s => el.querySelector(s);
  q(".rn-x").onclick = () => { l3rn.cancel = true; el.remove(); };
  q("#rnAz").oninput = () => { q("#rnAzV").textContent = q("#rnAz").value + "°"; }; q("#rnEl").oninput = () => { q("#rnElV").textContent = q("#rnEl").value + "°"; };
  q("#rnGo").onclick = async () => {
    if (l3rn.busy) { l3rn.cancel = true; return; }
    const go = q("#rnGo"); go.textContent = "Avbryt"; q("#rnSave").disabled = true; const cv = q("#rnCv"), bar = q("#rnBar"), msg = q("#rnMsg");
    try {
      const W = +q("#rnS").value, res = await l3rnRender({ quality: q("#rnQ").value, width: W, height: Math.round(W * (l3.renderer.getSize(new THREE.Vector2()).y / l3.renderer.getSize(new THREE.Vector2()).x)), sunAz: +q("#rnAz").value, sunEl: +q("#rnEl").value, soft: +q("#rnSoft").value, ao: +q("#rnAo").value, exposure: +q("#rnEx").value,
        onProgress: (d, n, c) => { bar.style.width = Math.round(d / n * 100) + "%"; msg.textContent = `Delbild ${d} av ${n} …`; cv.width = c.width; cv.height = c.height; cv.getContext("2d").drawImage(c, 0, 0); } });
      bar.style.width = "100%"; msg.textContent = `Klar: ${res.width}×${res.height}, ${res.samples} delbilder, ${(res.ms / 1000).toFixed(1)} s.`; q("#rnSave").disabled = false;
      cv.width = res.width; cv.height = res.height; cv.getContext("2d").drawImage(res.canvas, 0, 0);
    } catch (e) { msg.textContent = "Kunde inte rendera: " + e.message; }
    go.textContent = "Rendera";
  };
  q("#rnSave").onclick = () => { const c = l3rn.last && l3rn.last.canvas; if (!c) return; c.toBlob(b => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `rendering-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, "image/png"); };
}
(function l3rnBoot() { const tick = () => { if (document.getElementById("view3d") && typeof l3 !== "undefined" && l3 && l3.renderer) l3rnUi(); else setTimeout(tick, 1500); }; setTimeout(tick, 1500); })();
