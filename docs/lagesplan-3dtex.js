/* 3D-vyn – texturer på objekt (Victor 2026-10-28: "kan vi göra så att man kan lägga in texturer på objekten?").

   – Ett färdigt bibliotek (betong, tegel, trä, rutad plåt, gräs, asfalt, grus, puts) som ritas upp i koden, och egna bilder.
   – Texturen läggs på från alla håll (triplanar) med skala i meter – därför behövs inga UV-koordinater, och den fungerar på
     både IFC-objekt och de objekt som placeras i editorn. Texturerna ligger i en gemensam bildstapel (16 lager × 256 px).
   – Etableringsobjekt: sparas på objektet (p.tex) tillsammans med övriga placeringar. IFC-objekt: i projektets ifc_looks.json (lagesplan-3dlook.js).
   – IFC-bitar får ett extra attribut per hörn (aTex = lager+1, skala, blandning) först när något i biten får en textur;
     övriga bitar ritas precis som förut. */

const L3TEX_N = 256, L3TEX_LAYERS = 16, L3TEX_LIBN = 8;
const l3tex = { arr: null, user: [], thumbs: {}, ready: false, on: { value: 1 } }; // on: delad uniform – 0 = texturerna ritas inte (av, eller medan kameran rör sig i en stor scen)
const l3texOn = () => !(typeof l3Prefs === "function" && l3Prefs().tex === false);
/* Anropas när kameran rör sig/stannar och när valet ändras. */
function l3texSync(moving) {
  const v = l3texOn() && !(moving && typeof l3lodTris === "function" && l3lodTris() >= L3LOD_MIN_TRIS) ? 1 : 0;
  if (l3tex.on.value !== v) { l3tex.on.value = v; return true; } return false;
}

function l3texHash(x, y, s) { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
/* Jämn värdebrus som går runt (px × py rutor över 0–1), så att texturen kan läggas sida vid sida utan synliga skarvar. */
function l3texNoise(u, v, px, py, s) {
  const x = u * px, y = v * py, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const w = t => t * t * (3 - 2 * t), wx = w(fx), wy = w(fy);
  const a = l3texHash(x0 % px, y0 % py, s), b = l3texHash((x0 + 1) % px, y0 % py, s), c = l3texHash(x0 % px, (y0 + 1) % py, s), d = l3texHash((x0 + 1) % px, (y0 + 1) % py, s);
  return a + (b - a) * wx + (c - a) * wy + (a - b - c + d) * wx * wy;
}
const l3texFbm = (u, v, s) => l3texNoise(u, v, 4, 4, s) * 0.5 + l3texNoise(u, v, 8, 8, s + 1) * 0.3 + l3texNoise(u, v, 16, 16, s + 2) * 0.2;
const l3texFrac = x => x - Math.floor(x);
const L3TEX_LIB = [
  { id: "betong", name: "Betong", f: (u, v) => { const g = 0.78 + 0.35 * l3texFbm(u, v, 1) + 0.12 * (l3texNoise(u, v, 64, 64, 9) - 0.5); return [158 * g, 158 * g, 154 * g]; } },
  { id: "tegel", name: "Tegel", f: (u, v) => {
      const rows = 8, r = Math.floor(v * rows), off = r % 2 ? 0.5 / 4 : 0, uu = l3texFrac(u + off), c = Math.floor(uu * 4), fx = l3texFrac(uu * 4), fy = l3texFrac(v * rows);
      if (fx < 0.05 || fx > 0.95 || fy < 0.09 || fy > 0.91) { const g = 0.92 + 0.12 * l3texNoise(u, v, 64, 64, 3); return [190 * g, 184 * g, 172 * g]; }
      const g = (0.78 + 0.4 * l3texHash(c, r, 5)) * (0.92 + 0.16 * l3texFbm(u, v, 6)); return [168 * g, 78 * g, 56 * g]; } },
  { id: "tra", name: "Trä", f: (u, v) => {
      const pl = Math.floor(u * 4), fx = l3texFrac(u * 4), grain = l3texNoise(u, v, 8, 48, 11 + pl) * 0.6 + l3texNoise(u, v, 16, 96, 14 + pl) * 0.4, base = 0.8 + 0.3 * l3texHash(pl, 0, 7);
      const seam = fx < 0.025 || fx > 0.975 ? 0.55 : 1, g = (0.7 + 0.55 * grain) * base * seam; return [160 * g, 108 * g, 62 * g]; } },
  { id: "plat", name: "Rutad plåt", f: (u, v) => {
      const a = l3texFrac(u * 8) - 0.5, b = l3texFrac(v * 8) - 0.5, odd = (Math.floor(u * 8) + Math.floor(v * 8)) % 2, p = odd ? a : -a, d = Math.abs(p - b) * 0.7071, e = Math.abs(p + b) * 0.7071;
      const lug = d < 0.075 && e < 0.3 ? 1 : 0, g = (0.7 + 0.28 * lug + 0.06 * l3texNoise(u, v, 32, 32, 2)); return [124 * g, 130 * g, 140 * g]; } },
  { id: "gras", name: "Gräs", f: (u, v) => { const g = 0.62 + 0.5 * l3texFbm(u, v, 21) + 0.25 * (l3texNoise(u, v, 96, 96, 22) - 0.5); return [64 * g, 118 * g, 44 * g]; } },
  { id: "asfalt", name: "Asfalt", f: (u, v) => { const s = l3texHash(Math.floor(u * 128), Math.floor(v * 128), 31) > 0.965 ? 38 : 0, g = 0.72 + 0.4 * l3texNoise(u, v, 64, 64, 32) + 0.2 * l3texFbm(u, v, 33); return [52 * g + s, 53 * g + s, 57 * g + s]; } },
  { id: "grus", name: "Grus", f: (u, v) => { const h = l3texHash(Math.floor(u * 96), Math.floor(v * 96), 41), g = 0.55 + 0.7 * h; const m = 0.9 + 0.2 * l3texFbm(u, v, 42); return [150 * g * m, 140 * g * m, 124 * g * m]; } },
  { id: "puts", name: "Puts", f: (u, v) => { const g = 0.94 + 0.12 * l3texNoise(u, v, 64, 64, 51) + 0.05 * l3texFbm(u, v, 52); return [226 * g, 223 * g, 215 * g]; } },
];
const l3texLayerOf = id => { const i = L3TEX_LIB.findIndex(t => t.id === id); if (i >= 0) return i; const u = l3tex.user.find(t => t.id === id); return u ? u.layer : -1; };
const l3texInfo = id => L3TEX_LIB.find(t => t.id === id) || l3tex.user.find(t => t.id === id) || null;

/* Bildstapeln skapas första gången en textur behövs. */
function l3texArray() {
  if (l3tex.arr) return l3tex.arr;
  const N = L3TEX_N, data = new Uint8Array(N * N * 4 * L3TEX_LAYERS);
  L3TEX_LIB.forEach((t, li) => {
    const o = li * N * N * 4;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const c = t.f(x / N, y / N), i = o + (y * N + x) * 4;
      data[i] = Math.max(0, Math.min(255, c[0])); data[i + 1] = Math.max(0, Math.min(255, c[1])); data[i + 2] = Math.max(0, Math.min(255, c[2])); data[i + 3] = 255;
    }
  });
  for (let i = L3TEX_LIBN * N * N * 4 + 3; i < data.length; i += 4) data[i] = 255;
  const tx = new THREE.DataArrayTexture(data, N, N, L3TEX_LAYERS);
  tx.format = THREE.RGBAFormat; tx.type = THREE.UnsignedByteType; tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
  tx.minFilter = THREE.LinearMipmapLinearFilter; tx.magFilter = THREE.LinearFilter; tx.generateMipmaps = true; tx.anisotropy = 4; tx.needsUpdate = true;
  l3tex.arr = tx; return tx;
}
function l3texThumb(id) {
  if (l3tex.thumbs[id]) return l3tex.thumbs[id];
  const layer = l3texLayerOf(id); if (layer < 0) return "";
  const N = L3TEX_N, d = l3texArray().image.data, cv = document.createElement("canvas"); cv.width = cv.height = 48;
  const big = document.createElement("canvas"); big.width = big.height = N;
  big.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(d.buffer, layer * N * N * 4, N * N * 4), N, N), 0, 0);
  cv.getContext("2d").drawImage(big, 0, 0, 48, 48);
  return (l3tex.thumbs[id] = cv.toDataURL("image/jpeg", 0.8));
}

/* Egna bilder: 256 px kvadrat, sparas i webbläsaren (och på etableringsobjektet som använder dem). */
function l3texUserLoad() { try { const a = JSON.parse(localStorage.getItem("l3-user-tex") || "[]"); if (Array.isArray(a)) a.forEach(t => { if (t && t.id && t.data) l3texRegisterUser(t.id, t.name, t.data, true); }); } catch (e) { /* ingen lagring */ } }
function l3texUserSave() { try { localStorage.setItem("l3-user-tex", JSON.stringify(l3tex.user.map(t => ({ id: t.id, name: t.name, data: t.data })))); } catch (e) { /* full lagring: bilden finns kvar i sessionen */ } }
function l3texRegisterUser(id, name, dataUrl, quiet) {
  const ex = l3tex.user.find(t => t.id === id); if (ex) return ex.layer;
  if (l3tex.user.length >= L3TEX_LAYERS - L3TEX_LIBN) return -1;
  const layer = L3TEX_LIBN + l3tex.user.length, rec = { id, name: name || "Egen bild", data: dataUrl, layer };
  l3tex.user.push(rec);
  const img = new Image();
  img.onload = () => {
    const N = L3TEX_N, cv = document.createElement("canvas"); cv.width = cv.height = N;
    const cx = cv.getContext("2d"), s = Math.min(img.width, img.height); cx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, N, N);
    const px = cx.getImageData(0, 0, N, N).data, arr = l3texArray(); arr.image.data.set(px, layer * N * N * 4); arr.needsUpdate = true;
    delete l3tex.thumbs[id]; rec.ready = true; if (typeof l3Render === "function") l3Render();
    if (typeof l3texRefreshUi === "function") l3texRefreshUi();
  };
  img.src = dataUrl;
  if (!quiet) l3texUserSave();
  return layer;
}
function l3texAddFile(file) {
  return new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement("canvas"), N = L3TEX_N; cv.width = cv.height = N; const s = Math.min(img.width, img.height);
        cv.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, N, N);
        const id = "u" + Date.now().toString(36), name = (file.name || "Egen bild").replace(/\.[^.]+$/, "").slice(0, 24);
        const layer = l3texRegisterUser(id, name, cv.toDataURL("image/jpeg", 0.85));
        res(layer < 0 ? null : id);
      };
      img.onerror = () => res(null); img.src = fr.result;
    };
    fr.onerror = () => res(null); fr.readAsDataURL(file);
  });
}

/* Ritningen: triplanar textur i färgsteget. IFC-bitar läser aTex per hörn, etableringsobjekt en uniform. */
function l3texPatch(mat, uni) {
  if (!mat) return;
  const attr = !uni;
  if (mat.userData.l3tex) { if (uni) { mat.userData.l3tex.uTx.value.set(uni[0], uni[1], uni[2]); mat.userData.l3tex.uTx2.value.set(uni[3] || 0, uni[4] || 0, uni[5] || 0, uni[6] == null ? 1 : uni[6]); } return; }
  const uTx = { value: new THREE.Vector3(uni ? uni[0] : 0, uni ? uni[1] : 1, uni ? uni[2] : 1) }, uTx2 = { value: new THREE.Vector4(uni ? uni[3] || 0 : 0, uni ? uni[4] || 0 : 0, uni ? uni[5] || 0 : 0, uni && uni[6] != null ? uni[6] : 1) };
  mat.userData.l3tex = { uTx, uTx2, attr };
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTexA = { value: l3texArray() }; sh.uniforms.uTx = uTx; sh.uniforms.uTx2 = uTx2; sh.uniforms.uTexOn = l3tex.on;
    sh.vertexShader = (attr ? "attribute vec3 aTex; attribute vec4 aTex2;\n" : "") + "uniform vec3 uTx; uniform vec4 uTx2;\nvarying vec3 vTxP; varying vec3 vTxN; varying vec3 vTx; varying vec4 vTx2;\n" +
      sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n vTxP = position; vTxN = normal; vTx = " + (attr ? "aTex" : "uTx") + "; vTx2 = " + (attr ? "aTex2" : "uTx2") + ";");
    sh.fragmentShader = "uniform highp sampler2DArray uTexA; uniform float uTexOn;\nvarying vec3 vTxP; varying vec3 vTxN; varying vec3 vTx; varying vec4 vTx2;\nvec2 l3txUv(vec2 c, float sc){ float a = radians(vTx2.x), cs = cos(a), sn = sin(a); c += vTx2.yz; return vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y) * sc; }\n" +
      sh.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      if (vTx.x > 0.5 && uTexOn > 0.5) {
        vec3 bw = pow(abs(normalize(vTxN)), vec3(6.0)); bw /= (bw.x + bw.y + bw.z);
        float L = vTx.x - 1.0, sc = 1.0 / max(vTx.y, 0.05);
        vec3 tx = texture(uTexA, vec3(l3txUv(vTxP.yz, sc), L)).rgb * bw.x + texture(uTexA, vec3(l3txUv(vTxP.xz, sc), L)).rgb * bw.y + texture(uTexA, vec3(l3txUv(vTxP.xy, sc), L)).rgb * bw.z;
        tx = clamp(tx * (vTx2.w > 0.0 ? vTx2.w : 1.0), 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, tx, vTx.z);
      }`);
  };
  mat.customProgramCacheKey = () => "l3tex" + (attr ? "a" : "u");
  mat.needsUpdate = true;
}
/* Etableringsobjekt: anropas när objektets material skapas. */
function l3texPlaced(mat, tex) {
  if (!tex || !tex.id) return;
  if (tex.img && !l3texInfo(tex.id)) l3texRegisterUser(tex.id, tex.name, tex.img, true);
  const layer = l3texLayerOf(tex.id); if (layer < 0) return;
  l3texPatch(mat, [layer + 1, Math.max(0.05, Number(tex.s) || 1), Math.max(0, Math.min(1, tex.k == null ? 1 : Number(tex.k))), Number(tex.r) || 0, Number(tex.ox) || 0, Number(tex.oy) || 0, tex.b == null ? 1 : Number(tex.b)]);
}
/* IFC-bitar: attributet aTex skapas först när något i biten får en textur. */
function l3texEnsureMesh(mesh) {
  const g = mesh.geometry; let at = g.getAttribute("aTex");
  if (!at) { at = new THREE.BufferAttribute(new Float32Array(g.getAttribute("position").count * 3), 3); g.setAttribute("aTex", at); }
  if (!g.getAttribute("aTex2")) { const a2 = new Float32Array(g.getAttribute("position").count * 4); for (let i = 3; i < a2.length; i += 4) a2[i] = 1; g.setAttribute("aTex2", new THREE.BufferAttribute(a2, 4)); }
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  mats.forEach(m => l3texPatch(m));
  return at;
}
function l3texSnap(sel) { return sel.map(e => { const u = e.mesh.userData.l3b; return { mesh: e.mesh, ri: e.ri, t: u.tex && u.tex.get(e.ri) ? { ...u.tex.get(e.ri) } : null }; }); }
function l3texRestoreIfc(snap) { const ms = new Set(); snap.forEach(s => { l3texWrite(s.mesh, s.ri, s.t); ms.add(s.mesh); }); ms.forEach(m => l3bApplyAlpha(m)); if (typeof l3lookTouch === "function") l3lookTouch(snap); l3Render(); }
function l3texWrite(mesh, ri, spec) {
  const u = mesh.userData.l3b, r = u.ranges[ri]; if (!r) return;
  if (!u.tex) u.tex = new Map();
  if (spec) u.tex.set(ri, spec); else u.tex.delete(ri);
  if (!spec && !mesh.geometry.getAttribute("aTex")) return;
  const at = l3texEnsureMesh(mesh), a = at.array, layer = spec ? l3texLayerOf(spec.id) : -1, v0 = layer >= 0 ? layer + 1 : 0, s = spec ? spec.s : 1, k = spec ? spec.k : 1;
  const a2at = mesh.geometry.getAttribute("aTex2"), a2 = a2at.array, rr = spec ? Number(spec.r) || 0 : 0, ox = spec ? Number(spec.ox) || 0 : 0, oy = spec ? Number(spec.oy) || 0 : 0, bb = spec && spec.b != null ? Number(spec.b) : 1;
  for (let i = r.start; i < r.start + r.count; i++) { a[i * 3] = v0; a[i * 3 + 1] = s; a[i * 3 + 2] = k; a2[i * 4] = rr; a2[i * 4 + 1] = ox; a2[i * 4 + 2] = oy; a2[i * 4 + 3] = bb; }
  at.needsUpdate = true; a2at.needsUpdate = true;
}
/* Texturen på de markerade IFC-objekten (spec = { id, s, k } eller null = ingen). */
function l3texApplyIfc(sel, spec, label) {
  if (!sel || !sel.length) return;
  const before = l3texSnap(sel), ms = new Set();
  sel.forEach(e => { l3texWrite(e.mesh, e.ri, spec ? { ...spec } : null); ms.add(e.mesh); });
  ms.forEach(m => l3bApplyAlpha(m)); // de genomskinliga delarna delar hörnen och ska få samma textur
  if (typeof l3lookTouch === "function") l3lookTouch(sel);
  if (label && typeof l3VPush === "function") { const after = l3texSnap(sel); l3VPush(() => l3texRestoreIfc(before), () => l3texRestoreIfc(after), label); }
  l3Render();
}

/* ---- Rutan: bibliotek, egen bild, skala och blandning (läggs i färgrutorna). ---- */
let l3texRefreshUi = null;
function l3texSection(pop, ctx) {
  const P = ctx.P || [], ifc = () => (ctx.ifc ? ctx.ifc() : []);
  const cur = () => {
    const specs = [...P.map(p => p.tex || null), ...ifc().map(e => { const u = e.mesh.userData.l3b; return (u.tex && u.tex.get(e.ri)) || null; })];
    if (!specs.length) return null; const s0 = specs[0];
    return specs.every(s => (s ? s.id : "") === (s0 ? s0.id : "")) ? s0 : "mixed";
  };
  let box = pop.querySelector(".v3-tex"); if (box) box.remove();
  box = document.createElement("div"); box.className = "v3-tex"; pop.appendChild(box);
  const draw = () => {
    const c = cur(), id = c && c !== "mixed" ? c.id : "", s = c && c !== "mixed" ? c.s : 1, k = c && c !== "mixed" ? c.k : 1;
    box.innerHTML = `<div class="v3-tint-h"><b>Textur</b><em>${P.length ? "etablering och byggnad sparas i projektet" : "sparas i projektet"}</em></div>
      <div class="v3-tex-grid"><button type="button" data-tx="" class="${!c ? "on" : ""}" title="Ingen textur">∅</button>${[...L3TEX_LIB, ...l3tex.user].map(t => `<button type="button" data-tx="${t.id}" class="${id === t.id ? "on" : ""}" title="${t.name}" style="background-image:url(${l3texThumb(t.id)})"></button>`).join("")}<label class="v3-tex-up" title="Egen bild (kvadratiskt utsnitt, 256 px)">＋<input type="file" accept="image/*" hidden /></label></div>
      <label class="v3-tint-op"><span>Skala (m)</span><input type="range" class="v3-tex-s" min="0.1" max="8" step="0.1" value="${s}" ${c && c !== "mixed" ? "" : "disabled"} /><b class="v3-tex-sv">${Number(s).toFixed(1)}</b></label>
      <label class="v3-tint-op"><span>Rotation</span><input type="range" class="v3-tex-r" min="0" max="355" step="5" value="${c && c !== "mixed" ? c.r || 0 : 0}" ${c && c !== "mixed" ? "" : "disabled"} /><b class="v3-tex-rv">${c && c !== "mixed" ? Math.round(c.r || 0) : 0}°</b><button type="button" class="v3-tex-r90" title="Vrid 90° (t.ex. liggande/stående trä eller tegel)" ${c && c !== "mixed" ? "" : "disabled"}>↻ 90°</button></label>
      <label class="v3-tint-op"><span>Förskjut X</span><input type="range" class="v3-tex-ox" min="-2" max="2" step="0.05" value="${c && c !== "mixed" ? c.ox || 0 : 0}" ${c && c !== "mixed" ? "" : "disabled"} /><b class="v3-tex-oxv">${c && c !== "mixed" ? Number(c.ox || 0).toFixed(2) : "0.00"}</b></label>
      <label class="v3-tint-op"><span>Förskjut Y</span><input type="range" class="v3-tex-oy" min="-2" max="2" step="0.05" value="${c && c !== "mixed" ? c.oy || 0 : 0}" ${c && c !== "mixed" ? "" : "disabled"} /><b class="v3-tex-oyv">${c && c !== "mixed" ? Number(c.oy || 0).toFixed(2) : "0.00"}</b></label>
      <label class="v3-tint-op"><span>Ljusstyrka</span><input type="range" class="v3-tex-b" min="0.4" max="1.6" step="0.05" value="${c && c !== "mixed" && c.b != null ? c.b : 1}" ${c && c !== "mixed" ? "" : "disabled"} /><b class="v3-tex-bv">${c && c !== "mixed" && c.b != null ? Math.round(c.b * 100) : 100} %</b></label>
      <label class="v3-tint-op"><span>Blandning</span><input type="range" class="v3-tex-k" min="0" max="1" step="0.05" value="${k}" ${c && c !== "mixed" ? "" : "disabled"} /><b class="v3-tex-kv">${Math.round(k * 100)} %</b></label>
      <div class="v3-tex-reset"><button type="button" class="v3-wide v3-tex-rs" ${c && c !== "mixed" ? "" : "disabled"} title="Tillbaka till originalet: skala 1 m, ingen rotation eller förskjutning, full blandning och ljusstyrka">↺ Återställ textur</button></div>`;
    const q2 = n => Number(box.querySelector(".v3-tex-" + n).value), spec = id2 => ({ id: id2, s: q2("s") || 1, k: q2("k"), r: q2("r"), ox: q2("ox"), oy: q2("oy"), b: q2("b") });
    let snapped = false;
    const set = (sp, snap = true) => {
      if (P.length) {
        if (snap && typeof placeSnapshot === "function") placeSnapshot();
        P.forEach(p => { if (sp) { p.tex = { ...sp }; const u = l3tex.user.find(t => t.id === sp.id); if (u) { p.tex.img = u.data; p.tex.name = u.name; } } else delete p.tex; if (typeof placeTouch === "function") placeTouch(p); if (typeof l3RebuildOne === "function") l3RebuildOne(p); });
        if (typeof l3Changed === "function") l3Changed();
      }
      if (ifc().length) l3texApplyIfc(ifc(), sp, snap ? "textur" : null);
      if (typeof l3Render === "function") l3Render();
    };
    box.querySelectorAll("[data-tx]").forEach(b => { b.onclick = () => { const t = b.dataset.tx; set(t ? spec(t) : null); draw(); }; });
    const s1 = box.querySelector(".v3-tex-s"), k1 = box.querySelector(".v3-tex-k");
    s1.oninput = () => { box.querySelector(".v3-tex-sv").textContent = Number(s1.value).toFixed(1); set(spec(id), !snapped); snapped = true; };
    k1.oninput = () => { box.querySelector(".v3-tex-kv").textContent = Math.round(k1.value * 100) + " %"; set(spec(id), !snapped); snapped = true; };
    [["r", "rv", v => Math.round(v) + "°"], ["ox", "oxv", v => Number(v).toFixed(2)], ["oy", "oyv", v => Number(v).toFixed(2)], ["b", "bv", v => Math.round(v * 100) + " %"]].forEach(([n, o, f]) => { const el = box.querySelector(".v3-tex-" + n); el.oninput = () => { box.querySelector(".v3-tex-" + o).textContent = f(el.value); set(spec(id), !snapped); snapped = true; }; el.onchange = () => { snapped = false; }; });
    const rs = box.querySelector(".v3-tex-rs"); if (rs) rs.onclick = () => { set({ id, s: 1, k: 1, r: 0, ox: 0, oy: 0, b: 1 }); draw(); };
    const r90 = box.querySelector(".v3-tex-r90"); if (r90) r90.onclick = () => { const r = box.querySelector(".v3-tex-r"); r.value = (Number(r.value) + 90) % 360; box.querySelector(".v3-tex-rv").textContent = r.value + "°"; set(spec(id)); };
    s1.onchange = k1.onchange = () => { snapped = false; };
    const up = box.querySelector(".v3-tex-up input");
    up.onchange = async () => { const f = up.files && up.files[0]; if (!f) return; const nid = await l3texAddFile(f); if (!nid) { if (typeof l3Status === "function") l3Status("Kunde inte läsa bilden (eller så är de 8 platserna för egna bilder fulla).", true); return; } set(spec(nid)); draw(); };
  };
  l3texRefreshUi = () => { if (box.isConnected) draw(); };
  draw();
}
l3texUserLoad();
