/* 3D-labb (Rust/WebAssembly). Rust-motorn (rust3d.wasm) läser IFC, bygger trianglar, svarar på träffar och räknar avvikelse.
   Den här filen är gränssnittet: WebGL2-ritning, kamera, träd, egenskaper, mått, snitt och punktmoln. */
const $ = id => document.getElementById(id);
const td = new TextDecoder(), te = new TextEncoder();

/* ---------- Rust-motorn ---------- */
let E = null;
const mem = () => E.memory.buffer;
function put(bytes) { const p = E.alloc(bytes.length); new Uint8Array(mem(), p, bytes.length).set(bytes); return p; }
function withBytes(bytes, fn) { const p = put(bytes); try { return fn(p, bytes.length); } finally { E.dealloc(p, bytes.length); } }
const outText = n => td.decode(new Uint8Array(mem(), E.out_ptr(), n));
const outJson = n => JSON.parse(outText(n));
const callStr = (fn, s, ...rest) => { const b = te.encode(s); return withBytes(b, (p, n) => fn(p, n, ...rest)); };

async function boot() {
  const r = await fetch('rust3d.wasm?v=1'); const buf = await r.arrayBuffer();
  E = (await WebAssembly.instantiate(buf, {})).instance.exports;
}

/* ---------- Matriser (kolumnvis) ---------- */
const M4 = {
  persp(f, a, n, fa) { const t = 1 / Math.tan(f / 2); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0]; },
  look(e, c, u) {
    let z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]]; let l = Math.hypot(...z); z = z.map(v => v / l);
    let x = [u[1] * z[2] - u[2] * z[1], u[2] * z[0] - u[0] * z[2], u[0] * z[1] - u[1] * z[0]]; l = Math.hypot(...x); x = x.map(v => v / l);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -(x[0] * e[0] + x[1] * e[1] + x[2] * e[2]), -(y[0] * e[0] + y[1] * e[1] + y[2] * e[2]), -(z[0] * e[0] + z[1] * e[1] + z[2] * e[2]), 1];
  },
  mul(a, b) { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3]; return o; },
  inv(m) {
    const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let d = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!d) return null; d = 1 / d;
    return [(a11 * b11 - a12 * b10 + a13 * b09) * d, (a02 * b10 - a01 * b11 - a03 * b09) * d, (a31 * b05 - a32 * b04 + a33 * b03) * d, (a22 * b04 - a21 * b05 - a23 * b03) * d, (a12 * b08 - a10 * b11 - a13 * b07) * d, (a00 * b11 - a02 * b08 + a03 * b07) * d, (a32 * b02 - a30 * b05 - a33 * b01) * d, (a20 * b05 - a22 * b02 + a23 * b01) * d, (a10 * b10 - a11 * b08 + a13 * b06) * d, (a01 * b08 - a00 * b10 - a03 * b06) * d, (a30 * b04 - a31 * b02 + a33 * b00) * d, (a21 * b02 - a20 * b04 - a23 * b00) * d, (a11 * b07 - a10 * b09 - a12 * b06) * d, (a00 * b09 - a01 * b07 + a02 * b06) * d, (a31 * b01 - a30 * b03 - a32 * b00) * d, (a20 * b03 - a21 * b01 + a22 * b00) * d];
  },
  xform(m, p) { const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]; return [(m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w, (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w, (m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]) / w, w]; },
};

/* ---------- WebGL ---------- */
const canvas = $('gl'), ov = $('ov'), octx = ov.getContext('2d');
const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
if (!gl) { document.body.innerHTML = '<p style="padding:40px;font:16px system-ui">Webbläsaren saknar WebGL2.</p>'; throw new Error('WebGL2 saknas'); }
const SW = 2048;
const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol; layout(location=2) in uint aId;
uniform mat4 uVP; uniform sampler2D uState;
out vec3 vPos; out vec4 vCol; flat out int vFl;
void main(){
  ivec4 s = ivec4(texelFetch(uState, ivec2(int(aId) & 2047, int(aId) >> 11), 0) * 255.0 + 0.5);
  vFl = s.r; vPos = aPos; vCol = aCol; if ((s.r & 16) != 0) vCol.rgb = vec3(s.gba) / 255.0;
  gl_Position = (s.r & 1) != 0 ? vec4(2.0, 2.0, 2.0, 1.0) : uVP * vec4(aPos, 1.0);
}`;
const FS = `#version 300 es
precision highp float;
in vec3 vPos; in vec4 vCol; flat in int vFl;
uniform vec3 uCam; uniform vec4 uClip; uniform int uClipOn; uniform float uGhost;
out vec4 o;
void main(){
  if (uClipOn == 1 && dot(vPos, uClip.xyz) > uClip.w) discard;
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos))); vec3 v = normalize(uCam - vPos); if (dot(n, v) < 0.0) n = -n;
  float key = max(dot(n, normalize(vec3(-0.45, -0.55, 0.7))), 0.0), fill = max(dot(n, normalize(vec3(0.6, 0.4, 0.2))), 0.0), hemi = 0.5 + 0.5 * n.z;
  vec3 c = vCol.rgb * (0.34 + 0.30 * hemi + 0.50 * key + 0.12 * fill);
  if ((vFl & 2) != 0) c = mix(c, vec3(1.0, 0.52, 0.08), 0.62);
  if ((vFl & 4) != 0) c += vec3(0.10, 0.12, 0.2);
  float a = vCol.a; if ((vFl & 8) != 0) a *= uGhost;
  o = vec4(c, a);
}`;
const PVS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol; uniform mat4 uVP; uniform float uSize; out vec4 vC; out vec3 vP;
void main(){ vC = aCol; vP = aPos; gl_Position = uVP * vec4(aPos, 1.0); gl_PointSize = uSize; }`;
const PFS = `#version 300 es
precision highp float; in vec4 vC; in vec3 vP; uniform vec4 uClip; uniform int uClipOn; out vec4 o;
void main(){ if (uClipOn == 1 && dot(vP, uClip.xyz) > uClip.w) discard; vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; o = vec4(vC.rgb, 1.0); }`;
function prog(vs, fs) {
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p;
}
const P1 = prog(VS, FS), P2 = prog(PVS, PFS);
const U1 = n => gl.getUniformLocation(P1, n), U2 = n => gl.getUniformLocation(P2, n);

/* ---------- Tillstånd ---------- */
const S = {
  loaded: false, sum: null, objs: null, classes: [], conts: [], nObj: 0, origin: [0, 0, 0],
  vbo: null, vao: null, nVerts: 0, nOpaque: 0, stateTex: null, stateData: null, stateDirty: false,
  sel: new Set(), hover: -1, tool: 'select', edits: 0, colorBy: 'orig', shown: null,
  cloud: null, cloudMode: 0, cloudSize: 2,
  cam: { tx: 0, ty: 0, tz: 0, dist: 50, yaw: -0.8, pitch: 0.5, fov: 0.8 }, radius: 30,
  section: { on: false, axis: 'z', pos: 0, flip: false, min: 0, max: 1 }, measures: [], mPick: null, mHover: null,
  vp: null, ivp: null, eye: [0, 0, 0], w: 1, h: 1, dirty: true, fps: 0,
};
let objIds = [], objClass = [], objCont = [], objName = [], groups = null;

function resize() {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  S.w = Math.max(1, Math.round(r.width * dpr)); S.h = Math.max(1, Math.round(r.height * dpr));
  canvas.width = ov.width = S.w; canvas.height = ov.height = S.h; S.dpr = dpr; S.dirty = true;
}
window.addEventListener('resize', resize); new ResizeObserver(resize).observe($('stage'));

/* ---------- Kamera ---------- */
function camMatrices() {
  const c = S.cam, e = [c.tx + c.dist * Math.cos(c.pitch) * Math.cos(c.yaw), c.ty + c.dist * Math.cos(c.pitch) * Math.sin(c.yaw), c.tz + c.dist * Math.sin(c.pitch)];
  S.eye = e; const near = Math.max(0.02, c.dist * 0.01), far = Math.max(200, c.dist + S.radius * 6);
  const v = M4.look(e, [c.tx, c.ty, c.tz], [0, 0, 1]), p = M4.persp(c.fov, S.w / S.h, near, far);
  S.vp = M4.mul(p, v); S.ivp = M4.inv(S.vp);
}
function ray(px, py) { // skärmpunkt (css-px) → stråle i modellens lokala koordinater
  const r = canvas.getBoundingClientRect(), x = ((px - r.left) / r.width) * 2 - 1, y = 1 - ((py - r.top) / r.height) * 2;
  const a = M4.xform(S.ivp, [x, y, -1]), b = M4.xform(S.ivp, [x, y, 1]);
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d); return { o: S.eye.slice(), d: d.map(v => v / l) };
}
function project(p) { const q = M4.xform(S.vp, p); if (q[3] <= 0) return null; return [(q[0] * 0.5 + 0.5) * S.w, (1 - (q[1] * 0.5 + 0.5)) * S.h]; }
function fitBox(mn, mx) {
  const c = S.cam; c.tx = (mn[0] + mx[0]) / 2; c.ty = (mn[1] + mx[1]) / 2; c.tz = (mn[2] + mx[2]) / 2;
  const r = Math.max(0.5, Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2); c.dist = r / Math.sin(c.fov / 2) * 1.05; S.dirty = true;
}
function fitAll() { if (S.sum) fitBox(S.sum.bbox.slice(0, 3), S.sum.bbox.slice(3)); }
function fitSel() {
  if (!S.sel.size) return fitAll(); const mn = [1e30, 1e30, 1e30], mx = [-1e30, -1e30, -1e30];
  for (const oi of S.sel) { const b = objBox(oi); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], b[k]); mx[k] = Math.max(mx[k], b[k + 3]); } } fitBox(mn, mx);
}
const boxCache = new Map();
function objBox(oi) { if (!boxCache.has(oi)) { const j = outJson(E.model_object(oi)); boxCache.set(oi, j.bbox); } return boxCache.get(oi); }

/* ---------- Ladda modell ---------- */
const nice = c => { const m = { WALL: 'Vägg', WALLSTANDARDCASE: 'Vägg', SLAB: 'Bjälklag', COLUMN: 'Pelare', BEAM: 'Balk', WINDOW: 'Fönster', DOOR: 'Dörr', ROOF: 'Tak', STAIR: 'Trappa', STAIRFLIGHT: 'Trapplöp', RAILING: 'Räcke', FOOTING: 'Fundament', SPACE: 'Rum', BUILDINGELEMENTPROXY: 'Generiskt objekt', COVERING: 'Beklädnad', MEMBER: 'Stag/regel', PLATE: 'Platta', PILE: 'Påle', FURNISHINGELEMENT: 'Inredning', RAMP: 'Ramp', CURTAINWALL: 'Fasadvägg' }; const k = c.replace(/^IFC/, ''); return m[k] || (k.charAt(0) + k.slice(1).toLowerCase()); };
const palette = i => `hsl(${(i * 137.508) % 360} 62% 52%)`;
const hsl2rgb = i => { const h = ((i * 137.508) % 360) / 360, s = 0.62, l = 0.52, a = s * Math.min(l, 1 - l), f = n => { const k = (n + h * 12) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return [f(0), f(8), f(4)]; };

function busy(t) { $('busy').hidden = !t; if (t) $('busyT').textContent = t; }
function toast(t, ms = 3200) { const e = $('toast'); e.textContent = t; e.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => e.hidden = true, ms); }
const tick = () => new Promise(r => setTimeout(r, 30));

async function loadIfc(buf, name) {
  busy('Rust läser ' + name + ' …'); await tick();
  const t0 = performance.now(), bytes = new Uint8Array(buf);
  const rc = withBytes(bytes, (p, n) => E.model_load(p, n));
  if (rc !== 0) { busy(''); toast('Kunde inte läsa filen: ' + outText(-rc), 6000); return false; }
  const tRust = performance.now() - t0;
  const sum = outJson(E.model_summary()), ol = outJson(E.model_objects());
  S.sum = sum; S.radius = Math.max(1, Math.hypot(sum.bbox[3] - sum.bbox[0], sum.bbox[4] - sum.bbox[1], sum.bbox[5] - sum.bbox[2]) / 2); S.objs = ol.objs; S.classes = ol.classes; S.conts = ol.containers; S.nObj = sum.objects; S.origin = sum.origin;
  objIds = ol.objs.map(o => o[0]); objClass = ol.objs.map(o => o[1]); objCont = ol.objs.map(o => o[2]); objName = ol.objs.map(o => o[3]);
  boxCache.clear(); S.sel.clear(); S.hover = -1; S.edits = 0; S.measures = []; S.mPick = null; S.shown = new Uint8Array(sum.objects).fill(1);
  uploadModel(); buildStateTex(); buildTree(); renderMeasures(); renderInsp(); $('btnExport').disabled = true; $('empty').hidden = true;
  S.loaded = true; S.fileName = name; fitAll(); setupSection(); applyColorBy();
  const t1 = performance.now();
  $('hSt').textContent = `${name} · ${sum.objects.toLocaleString('sv')} objekt · ${sum.tris.toLocaleString('sv')} trianglar`;
  $('hPerf').textContent = `Rust: ${tRust.toFixed(0)} ms (${(bytes.length / 1e6).toFixed(1)} MB → ${(bytes.length / 1e6 / (tRust / 1000)).toFixed(0)} MB/s) · gränssnitt ${(t1 - t0 - tRust).toFixed(0)} ms`;
  S.perf = { rustMs: tRust, mb: bytes.length / 1e6 };
  busy('');
  if (sum.skipped.length) toast('Geometri som inte stöds än hoppades över: ' + sum.skipped.slice(0, 4).map(s => `${s[0].replace(/^IFC/, '')} ×${s[1]}`).join(', '), 6500);
  return true;
}

function uploadModel() {
  S.nVerts = E.model_verts_count(); S.nOpaque = E.model_opaque_count();
  if (S.vbo) gl.deleteBuffer(S.vbo); if (S.vao) gl.deleteVertexArray(S.vao);
  S.vao = gl.createVertexArray(); gl.bindVertexArray(S.vao); S.vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, S.vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(mem(), E.model_verts_ptr(), S.nVerts * 20), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, 20, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribIPointer(2, 1, gl.UNSIGNED_INT, 20, 16);
  gl.bindVertexArray(null);
}
function buildStateTex() {
  const rows = Math.max(1, Math.ceil(S.nObj / SW)); S.stateData = new Uint8Array(SW * rows * 4);
  if (S.stateTex) gl.deleteTexture(S.stateTex); S.stateTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, S.stateTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, SW, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, S.stateData);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); S.stateRows = rows;
}
function setFlag(oi, bit, on) { const i = oi * 4, d = S.stateData; const v = on ? d[i] | bit : d[i] & ~bit; if (v !== d[i]) { d[i] = v; S.stateDirty = true; S.dirty = true; } }
function refreshFlags() {
  if (!S.stateData) return;
  const any = S.sel.size > 0;
  for (let i = 0; i < S.nObj; i++) { let f = S.stateData[i * 4] & (1 | 16); if (S.sel.has(i)) f |= 2; if (i === S.hover) f |= 4; if (any && !S.sel.has(i) && S.ghost) f |= 8; S.stateData[i * 4] = f; }
  S.stateDirty = true; S.dirty = true;
}
function setVisible(list, vis) { for (const oi of list) { setFlag(oi, 1, !vis); S.shown[oi] = vis ? 1 : 0; E.model_set_visible(oi, vis ? 1 : 0); } refreshTreeVis(); }

/* ---------- Färglägg ---------- */
function applyColorBy() {
  if (!S.stateData) return; const m = S.colorBy;
  for (let i = 0; i < S.nObj; i++) {
    const d = S.stateData; if (m === 'orig') { d[i * 4] &= ~16; continue; }
    const k = m === 'class' ? objClass[i] : objCont[i], c = hsl2rgb(k); d[i * 4] |= 16; d[i * 4 + 1] = c[0]; d[i * 4 + 2] = c[1]; d[i * 4 + 3] = c[2];
  }
  S.stateDirty = true; S.dirty = true; buildTree();
}

/* ---------- Rita ---------- */
function draw() {
  S.dirty = false; camMatrices();
  gl.viewport(0, 0, S.w, S.h); const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const bg = dark ? [0.06, 0.082, 0.15] : [0.914, 0.929, 0.953]; gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
  const sc = S.section, cl = sc.on ? clipPlane() : [0, 0, 0, 0];
  if (S.loaded) {
    if (S.stateDirty) { gl.bindTexture(gl.TEXTURE_2D, S.stateTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SW, S.stateRows, gl.RGBA, gl.UNSIGNED_BYTE, S.stateData); S.stateDirty = false; }
    gl.useProgram(P1); gl.uniformMatrix4fv(U1('uVP'), false, S.vp); gl.uniform3fv(U1('uCam'), S.eye); gl.uniform4fv(U1('uClip'), cl); gl.uniform1i(U1('uClipOn'), sc.on ? 1 : 0); gl.uniform1f(U1('uGhost'), 0.12);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, S.stateTex); gl.uniform1i(U1('uState'), 0);
    gl.bindVertexArray(S.vao); gl.disable(gl.BLEND); gl.depthMask(true); gl.drawArrays(gl.TRIANGLES, 0, S.nOpaque);
    if (S.nVerts > S.nOpaque) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.drawArrays(gl.TRIANGLES, S.nOpaque, S.nVerts - S.nOpaque); gl.depthMask(true); gl.disable(gl.BLEND); }
    gl.bindVertexArray(null);
  }
  if (S.cloud && S.cloud.show) {
    gl.useProgram(P2); gl.uniformMatrix4fv(U2('uVP'), false, S.vp); gl.uniform1f(U2('uSize'), S.cloudSize * S.dpr); gl.uniform4fv(U2('uClip'), cl); gl.uniform1i(U2('uClipOn'), sc.on ? 1 : 0);
    gl.bindVertexArray(S.cloud.vao); gl.drawArrays(gl.POINTS, 0, S.cloud.n); gl.bindVertexArray(null);
  }
  drawOverlay();
}
function clipPlane() { const s = S.section, sg = s.flip ? -1 : 1, n = [s.axis === 'x' ? sg : 0, s.axis === 'y' ? sg : 0, s.axis === 'z' ? sg : 0]; return [n[0], n[1], n[2], sg * s.pos]; }

function drawOverlay() {
  const c = octx; c.clearRect(0, 0, S.w, S.h); const k = S.dpr;
  const dot = (p, col, r = 5) => { c.beginPath(); c.arc(p[0], p[1], r * k, 0, 7); c.fillStyle = col; c.fill(); c.lineWidth = 2 * k; c.strokeStyle = '#fff'; c.stroke(); };
  const label = (p, t) => { c.font = `600 ${12 * k}px system-ui`; const w = c.measureText(t).width + 14 * k; c.fillStyle = 'rgba(15,23,42,.88)'; c.beginPath(); c.roundRect(p[0] - w / 2, p[1] - 24 * k, w, 22 * k, 7 * k); c.fill(); c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(t, p[0], p[1] - 8.5 * k); };
  for (const m of S.measures) {
    const a = project(m.a), b = project(m.b); if (!a || !b) continue;
    c.strokeStyle = '#f59e0b'; c.lineWidth = 2.5 * k; c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); dot(a, '#f59e0b', 4.5); dot(b, '#f59e0b', 4.5); label([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], fmtD(m.d));
  }
  if (S.mPick) { const a = project(S.mPick); if (a) dot(a, '#f59e0b', 5); if (S.mHover) { const b = project(S.mHover.p); if (a && b) { c.setLineDash([6 * k, 5 * k]); c.strokeStyle = '#f59e0b'; c.lineWidth = 2 * k; c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); c.setLineDash([]); label([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], fmtD(dist3(S.mPick, S.mHover.p))); } } }
  if (S.tool === 'measure' && S.mHover) { const p = project(S.mHover.p); if (p) { c.strokeStyle = S.mHover.kind === 'vertex' ? '#22c55e' : S.mHover.kind === 'edge' ? '#06b6d4' : '#f59e0b'; c.lineWidth = 2.5 * k; const s = 7 * k; if (S.mHover.kind === 'vertex') c.strokeRect(p[0] - s, p[1] - s, 2 * s, 2 * s); else { c.beginPath(); c.arc(p[0], p[1], s, 0, 7); c.stroke(); } } }
}
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const fmtD = d => d >= 1 ? d.toFixed(3).replace('.', ',') + ' m' : (d * 1000).toFixed(0) + ' mm';

let lastT = performance.now(), frames = 0;
function loop(t) {
  if (S.dirty) { draw(); frames++; }
  if (t - lastT > 1000) { S.fps = frames * 1000 / (t - lastT); frames = 0; lastT = t; }
  requestAnimationFrame(loop);
}

/* ---------- Pekare ---------- */
const ptrs = new Map(); let drag = null, pend = null;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) { drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, btn: e.button, shift: e.shiftKey, moved: false, ctrl: e.ctrlKey || e.metaKey }; }
  else drag = { two: true, d: pinchDist(), cx: pinchCenter()[0], cy: pinchCenter()[1] };
});
const pinchDist = () => { const v = [...ptrs.values()]; return v.length < 2 ? 0 : Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y); };
const pinchCenter = () => { const v = [...ptrs.values()]; return v.length < 2 ? [0, 0] : [(v[0].x + v[1].x) / 2, (v[0].y + v[1].y) / 2]; };
canvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId);
  if (!p || !drag) { hoverAt(e.clientX, e.clientY); return; }
  p.x = e.clientX; p.y = e.clientY;
  if (drag.two) { const d = pinchDist(), c = pinchCenter(); zoomBy(drag.d / Math.max(d, 1)); pan(c[0] - drag.cx, c[1] - drag.cy); drag.d = d; drag.cx = c[0]; drag.cy = c[1]; return; }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
  if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 4) drag.moved = true;
  if (!drag.moved) return;
  if (drag.btn === 2 || drag.btn === 1 || drag.shift) pan(dx, dy); else { S.cam.yaw -= dx * 0.0065; S.cam.pitch = Math.max(-1.5, Math.min(1.5, S.cam.pitch + dy * 0.0065)); S.dirty = true; }
});
canvas.addEventListener('pointerup', e => {
  const wasClick = drag && !drag.two && !drag.moved && e.button === 0; const d = drag; ptrs.delete(e.pointerId); if (!ptrs.size) drag = null; else if (ptrs.size === 1) { const v = [...ptrs.values()][0]; drag = { x: v.x, y: v.y, sx: v.x, sy: v.y, btn: 0, moved: true }; }
  if (wasClick) clickAt(e.clientX, e.clientY, d.ctrl || e.shiftKey);
});
canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); drag = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0012))); }, { passive: false });
canvas.addEventListener('dblclick', e => { const h = pick(e.clientX, e.clientY); if (h) { S.sel = new Set([h.oi]); refreshFlags(); selChanged(); fitSel(); } else fitAll(); });
function pan(dx, dy) {
  const c = S.cam, s = 2 * c.dist * Math.tan(c.fov / 2) / (canvas.getBoundingClientRect().height), cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const right = [-sy, cy, 0], up = [-sp * cy, -sp * sy, cp];
  c.tx += (-dx * right[0] + dy * up[0]) * s; c.ty += (-dx * right[1] + dy * up[1]) * s; c.tz += (dy * up[2]) * s; S.dirty = true;
}
function zoomBy(f) { S.cam.dist = Math.max(0.2, Math.min(S.radius * 30, S.cam.dist * f)); S.dirty = true; }
function zoomAt(x, y, f) {
  const h = S.loaded ? pick(x, y) : null, c = S.cam, nd = Math.max(0.2, Math.min(S.radius * 30, c.dist * f)), k = 1 - nd / c.dist;
  if (h) { c.tx += (h.p[0] - c.tx) * k; c.ty += (h.p[1] - c.ty) * k; c.tz += (h.p[2] - c.tz) * k; } c.dist = nd; S.dirty = true;
}

/* ---------- Träff och markering ---------- */
function pick(x, y) {
  if (!S.loaded || !S.vp) return null; camMatrices(); const r = ray(x, y);
  const oi = E.model_pick(r.o[0], r.o[1], r.o[2], r.d[0], r.d[1], r.d[2]); if (oi < 0) return null;
  const f = new Float32Array(mem(), E.res_ptr(), 16);
  return { oi, t: f[0], p: [f[1], f[2], f[3]], v: [f[4], f[5], f[6]], e: [f[7], f[8], f[9]] };
}
let hoverRaf = 0;
function hoverAt(x, y) {
  if (hoverRaf) return; hoverRaf = requestAnimationFrame(() => {
    hoverRaf = 0; if (!S.loaded) return; const h = pick(x, y), oi = h ? h.oi : -1;
    if (S.tool === 'measure') { S.mHover = h ? snap(h, x, y) : null; S.dirty = true; }
    if (oi !== S.hover) { if (S.hover >= 0) setFlag(S.hover, 4, false); if (oi >= 0) setFlag(oi, 4, true); S.hover = oi; canvas.style.cursor = oi >= 0 ? 'pointer' : 'default'; }
  });
}
function snap(h, x, y) {
  const r = canvas.getBoundingClientRect(), sp = p => { const q = project(p); return q ? [q[0] / S.dpr + r.left, q[1] / S.dpr + r.top] : null; };
  const dv = sp(h.v), de = sp(h.e);
  if (dv && Math.hypot(dv[0] - x, dv[1] - y) < 16) return { p: h.v, kind: 'vertex' };
  if (de && Math.hypot(de[0] - x, de[1] - y) < 12) return { p: h.e, kind: 'edge' };
  return { p: h.p, kind: 'face' };
}
function clickAt(x, y, add) {
  if (!S.loaded) return; const h = pick(x, y);
  if (S.tool === 'measure') {
    if (!h) return; const s = snap(h, x, y);
    if (!S.mPick) S.mPick = s.p; else { const a = S.mPick, b = s.p; S.measures.push({ a, b, d: dist3(a, b), dx: b[0] - a[0], dy: b[1] - a[1], dz: b[2] - a[2] }); S.mPick = null; renderMeasures(); }
    S.dirty = true; return;
  }
  if (!h) { if (!add) { S.sel.clear(); refreshFlags(); selChanged(); } return; }
  if (add) { if (S.sel.has(h.oi)) S.sel.delete(h.oi); else S.sel.add(h.oi); } else S.sel = new Set([h.oi]);
  refreshFlags(); selChanged();
}
function selChanged() { renderInsp(); markTree(); }

/* ---------- Träd ---------- */
const eyeSvg = '<svg viewBox="0 0 24 24"><path d="M2.5 12C3.5 10 7 6 12 6s8.5 4 9.5 6c-1 2-4.5 6-9.5 6s-8.5-4-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/></svg>';
function buildTree() {
  const T = $('tree'); T.innerHTML = '';
  if (!S.loaded) return;
  groups = new Map(); // cont -> class -> [oi]
  for (let i = 0; i < S.nObj; i++) { let g = groups.get(objCont[i]); if (!g) groups.set(objCont[i], g = new Map()); let l = g.get(objClass[i]); if (!l) g.set(objClass[i], l = []); l.push(i); }
  const order = [...groups.keys()].sort((a, b) => (a === 0) - (b === 0) || S.conts[a][0].localeCompare(S.conts[b][0], 'sv', { numeric: true }));
  for (const c of order) {
    const g = groups.get(c), all = [...g.values()].flat();
    const node = mkNode({ label: S.conts[c][0], count: all.length, items: () => all, open: order.length <= 4, sw: null, depth: 0 });
    const kids = document.createElement('div'); kids.className = 'kids'; kids.hidden = !node.classList.contains('open');
    for (const [cls, list] of [...g.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const cn = mkNode({ label: nice(S.classes[cls]), count: list.length, items: () => list, open: false, sw: S.colorBy === 'class' ? palette(cls) : (S.colorBy === 'cont' ? palette(c) : null), depth: 1 });
      const ck = document.createElement('div'); ck.className = 'kids'; ck.hidden = true; cn._kids = ck; cn._list = list; kids.append(cn, ck);
      cn.querySelector('.car').onclick = ev => { ev.stopPropagation(); toggleKids(cn, ck, list); };
    }
    node._kids = kids; node.querySelector('.car').onclick = ev => { ev.stopPropagation(); node.classList.toggle('open'); kids.hidden = !node.classList.contains('open'); };
    T.append(node, kids);
  }
}
function toggleKids(cn, ck, list) {
  cn.classList.toggle('open'); ck.hidden = !cn.classList.contains('open'); if (ck.hidden || ck.childElementCount) return;
  const show = n => { const slice = list.slice(ck.dataset.n | 0, (ck.dataset.n | 0) + n); slice.forEach(oi => ck.insertBefore(objRow(oi), ck.querySelector('.more'))); ck.dataset.n = (ck.dataset.n | 0) + slice.length; const m = ck.querySelector('.more'); if (m) { if ((ck.dataset.n | 0) >= list.length) m.remove(); else m.textContent = `Visa fler (${list.length - ck.dataset.n})`; } };
  if (list.length > 200) { const m = document.createElement('div'); m.className = 'more'; m.onclick = () => show(300); ck.append(m); }
  show(200);
}
function objRow(oi) {
  const r = document.createElement('div'); r.className = 'tn'; r.dataset.oi = oi; if (S.sel.has(oi)) r.classList.add('sel');
  r.innerHTML = `<span class="car"></span><span class="lab"></span>`; r.querySelector('.lab').textContent = objName[oi] || nice(S.classes[objClass[oi]]);
  r.onclick = ev => { if (ev.ctrlKey || ev.metaKey || ev.shiftKey) { S.sel.has(oi) ? S.sel.delete(oi) : S.sel.add(oi); } else S.sel = new Set([oi]); refreshFlags(); selChanged(); };
  r.ondblclick = () => { S.sel = new Set([oi]); refreshFlags(); selChanged(); fitSel(); }; return r;
}
function mkNode({ label, count, items, open, sw, depth }) {
  const n = document.createElement('div'); n.className = 'tn' + (open ? ' open' : ''); n._items = items;
  n.innerHTML = `<span class="car"><svg viewBox="0 0 24 24" style="width:14px;height:14px"><path d="m9 6 6 6-6 6"/></svg></span>${sw ? `<span class="sw" style="background:${sw}"></span>` : ''}<span class="lab"></span><span class="cnt">${count.toLocaleString('sv')}</span><button class="eye" title="Visa/dölj">${eyeSvg}</button>`;
  n.querySelector('.lab').textContent = label;
  n.onclick = () => { S.sel = new Set(items()); refreshFlags(); selChanged(); };
  n.ondblclick = () => { S.sel = new Set(items()); refreshFlags(); selChanged(); fitSel(); };
  n.querySelector('.eye').onclick = ev => { ev.stopPropagation(); const l = items(), vis = !l.every(oi => S.shown[oi]); setVisible(l, vis); };
  return n;
}
function refreshTreeVis() { document.querySelectorAll('#tree .tn').forEach(n => { if (!n._items) return; const l = n._items(), on = l.some(oi => S.shown[oi]); n.querySelector('.eye').classList.toggle('off', !on); }); }
function markTree() { document.querySelectorAll('#tree .tn[data-oi]').forEach(n => n.classList.toggle('sel', S.sel.has(+n.dataset.oi))); }

/* ---------- Egenskaper (inspektör) ---------- */
function renderInsp() {
  const I = $('insp'); I.innerHTML = '';
  if (!S.sel.size) { I.innerHTML = '<div class="hint">Klicka på ett objekt för att se och ändra dess egenskaper.</div>'; return; }
  if (S.sel.size > 1) {
    const by = new Map(); for (const oi of S.sel) by.set(objClass[oi], (by.get(objClass[oi]) || 0) + 1);
    I.innerHTML = `<div class="ttl"><div><h3>${S.sel.size.toLocaleString('sv')} objekt markerade</h3></div></div>` + [...by].map(([c, n]) => `<div class="kv"><label>${nice(S.classes[c])}</label><div>${n}</div></div>`).join('') +
      '<div class="row"><button class="btn" id="iHide">Dölj</button><button class="btn" id="iIso">Isolera</button></div>'; $('iHide').onclick = () => hideSel(); $('iIso').onclick = () => isolate(); return;
  }
  const oi = [...S.sel][0], j = outJson(E.model_object(oi)), f = n => n.toFixed(2).replace('.', ',');
  const bb = j.bbox, dx = bb[3] - bb[0], dy = bb[4] - bb[1], dz = bb[5] - bb[2], zAbs = bb[2] + S.origin[2];
  I.innerHTML = `<div class="ttl"><div><span class="chip">${nice(j.class)}</span><h3></h3></div></div>
    <div class="dim"><div><b>${f(dx)}</b><span>Längd m</span></div><div><b>${f(dy)}</b><span>Bredd m</span></div><div><b>${f(dz)}</b><span>Höjd m</span></div></div>
    <div class="kv"><label>Namn</label><input type="text" data-a="2"><label>Beskrivning</label><input type="text" data-a="3"><label>Taggnr</label><input type="text" data-a="7">
    <label>Våning</label><input class="ro" type="text" readonly><label>Underkant Z</label><input class="ro" type="text" readonly value="${f(zAbs)} m"><label>GlobalId</label><input class="ro" type="text" readonly><label>Trianglar</label><input class="ro" type="text" readonly value="${j.tris}"></div><div id="psets"></div>
    <div class="row"><button class="btn" id="iHide">Dölj</button><button class="btn" id="iIso">Isolera</button><button class="btn" id="iFit">Zooma</button></div>`;
  I.querySelector('h3').textContent = j.name || nice(j.class);
  const ins = I.querySelectorAll('input'); ins[0].value = j.name; ins[1].value = j.desc; ins[2].value = j.tag; ins[3].value = j.container; ins[5].value = j.guid;
  [ins[0], ins[1], ins[2]].forEach(inp => inp.onchange = () => { const rc = callStr((p, n) => E.model_set_attr(oi, +inp.dataset.a, p, n), inp.value); if (rc === 0) { inp.classList.add('dirty'); edited(); if (inp.dataset.a === '2') { objName[oi] = inp.value; I.querySelector('h3').textContent = inp.value; document.querySelectorAll(`#tree .tn[data-oi="${oi}"] .lab`).forEach(l => l.textContent = inp.value); } } else toast('Kunde inte ändra'); });
  const P = $('psets');
  for (const ps of j.psets) {
    if (!ps.props.length) continue; const d = document.createElement('details'); d.className = 'ps'; d.open = true; d.innerHTML = `<summary><span></span><span class="muted">${ps.props.length}</span></summary><div></div>`; d.querySelector('summary span').textContent = ps.name; const box = d.querySelector('div');
    for (const pr of ps.props) {
      const l = document.createElement('div'); l.className = 'kv'; const lb = document.createElement('label'); lb.textContent = pr.name; lb.title = pr.kind; const inp = document.createElement('input'); inp.type = 'text'; inp.value = pr.value;
      if (!pr.edit) { inp.readOnly = true; inp.className = 'ro'; } else inp.onchange = () => { const rc = callStr((p, n) => E.model_set_prop(pr.id, p, n), inp.value); if (rc === 0) { inp.classList.add('dirty'); edited(); } else toast(rc < 0 ? outText(-rc) : 'Kunde inte ändra', 4000); };
      l.append(lb, inp); box.append(l);
    }
    P.append(d);
  }
  $('iHide').onclick = hideSel; $('iIso').onclick = isolate; $('iFit').onclick = fitSel;
}
function edited() { S.edits = E.model_edits(); $('btnExport').disabled = !S.edits; $('btnExport').textContent = S.edits ? `Exportera IFC (${S.edits} ändrade)` : 'Exportera IFC'; }
function hideSel() { setVisible([...S.sel], false); S.sel.clear(); refreshFlags(); selChanged(); }
function isolate() { const keep = new Set(S.sel); const all = []; for (let i = 0; i < S.nObj; i++) all.push(i); setVisible(all.filter(i => !keep.has(i)), false); setVisible([...keep], true); }
function showAll() { const all = []; for (let i = 0; i < S.nObj; i++) all.push(i); setVisible(all, true); }

/* ---------- Mått ---------- */
function renderMeasures() {
  const L = $('mlist'); L.innerHTML = ''; $('mClear').hidden = !S.measures.length;
  S.measures.forEach((m, i) => { const e = document.createElement('div'); e.className = 'm-it'; e.innerHTML = `<div><b>${fmtD(m.d)}</b><small>ΔX ${m.dx.toFixed(3)} · ΔY ${m.dy.toFixed(3)} · ΔZ ${m.dz.toFixed(3)} m</small></div><button class="x" title="Ta bort">✕</button>`; e.querySelector('.x').onclick = () => { S.measures.splice(i, 1); renderMeasures(); S.dirty = true; }; L.append(e); });
  if (!S.measures.length) L.innerHTML = '<div class="muted">Inga mått än.</div>';
}
$('mClear').onclick = () => { S.measures = []; S.mPick = null; renderMeasures(); S.dirty = true; };

/* ---------- Snitt ---------- */
function setupSection() {
  const b = S.sum.bbox, a = S.section.axis, i = { x: 0, y: 1, z: 2 }[a]; S.section.min = b[i]; S.section.max = b[i + 3]; const v = (S.section.min + S.section.max) / 2; S.section.pos = v; $('sPos').value = 500; showSecV();
}
function showSecV() { const i = { x: 0, y: 1, z: 2 }[S.section.axis]; $('sV').textContent = (S.section.pos + S.origin[i]).toFixed(2).replace('.', ',') + ' m'; }
$('sOn').onchange = e => { S.section.on = e.target.checked; S.dirty = true; };
$('sFlip').onchange = e => { S.section.flip = e.target.checked; S.dirty = true; };
$('sPos').oninput = e => { const s = S.section; s.pos = s.min + (s.max - s.min) * (e.target.value / 1000); showSecV(); S.dirty = true; };
$('sAxis').onclick = e => { const b = e.target.closest('button'); if (!b) return; S.section.axis = b.dataset.a; [...$('sAxis').children].forEach(x => x.classList.toggle('on', x === b)); if (S.sum) setupSection(); S.dirty = true; };

/* ---------- Punktmoln ---------- */
async function loadCloud(buf, name) {
  if (!E) return; busy('Rust läser punktmoln …'); await tick(); const t0 = performance.now();
  const rc = callStr((np, nn) => withBytes(new Uint8Array(buf), (p, n) => E.cloud_load(p, n, np, nn, +$('cMax').value)), name);
  if (rc !== 0) { busy(''); toast(outText(-rc), 6000); return; }
  const n = E.cloud_count(), info = outJson(E.cloud_info());
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const b1 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b1); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mem(), E.cloud_pos_ptr(), n * 3), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const b2 = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b2); gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(mem(), E.cloud_col_ptr(), n * 4), gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, 0, 0); gl.bindVertexArray(null);
  if (S.cloud) { gl.deleteVertexArray(S.cloud.vao); gl.deleteBuffer(S.cloud.b1); gl.deleteBuffer(S.cloud.b2); }
  S.cloud = { vao, b1, b2, n, show: true, info }; S.cloudMode = 0;
  if (!S.loaded) { S.origin = [E.origin(0), E.origin(1), E.origin(2)]; S.sum = { bbox: info.bbox }; fitBox(info.bbox.slice(0, 3), info.bbox.slice(3)); $('empty').hidden = true; S.radius = Math.hypot(info.bbox[3] - info.bbox[0], info.bbox[4] - info.bbox[1]) / 2; }
  $('cInfo').innerHTML = `${n.toLocaleString('sv')} punkter visas${info.total > n ? ` av ${info.total.toLocaleString('sv')}` : ''}${info.rgb ? ' · med färg' : ''} · ${(performance.now() - t0).toFixed(0)} ms`;
  $('cColor').hidden = false; $('cDev').hidden = !S.loaded; [...$('cMode').children].forEach((x, i) => x.classList.toggle('on', i === 0)); $('devOut').innerHTML = '';
  S.dirty = true; busy(''); document.querySelector('#ltabs [data-t=cloud]').click();
}
function recolorCloud(mode) { S.cloudMode = mode; E.cloud_recolor(mode, +$('devTol').value / 1000); const c = S.cloud; gl.bindBuffer(gl.ARRAY_BUFFER, c.b2); gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Uint8Array(mem(), E.cloud_col_ptr(), c.n * 4)); S.dirty = true; }
$('cMode').onclick = e => { const b = e.target.closest('button'); if (!b || !S.cloud) return; const m = +b.dataset.m; if (m === 2 && !$('devOut').innerHTML) return toast('Beräkna avvikelsen först'); [...$('cMode').children].forEach(x => x.classList.toggle('on', x === b)); recolorCloud(m); };
$('cSize').oninput = e => { S.cloudSize = +e.target.value; $('cSizeV').textContent = e.target.value; S.dirty = true; };
$('btnDev').onclick = async () => {
  if (!S.loaded || !S.cloud) return toast('Läs in både modell och punktmoln'); busy('Rust beräknar avvikelse …'); await tick(); const t0 = performance.now();
  const tol = +$('devTol').value / 1000, md = +$('devMax').value, j = outJson(E.cloud_deviation(md, tol)); busy('');
  if (j.error) return toast(j.error);
  const c = S.cloud; gl.bindBuffer(gl.ARRAY_BUFFER, c.b2); gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Uint8Array(mem(), E.cloud_col_ptr(), c.n * 4)); S.cloudMode = 2; [...$('cMode').children].forEach((x, i) => x.classList.toggle('on', i === 2));
  const mm = v => (v * 1000).toFixed(1).replace('.', ',') + ' mm';
  $('devOut').innerHTML = `<div class="bar"><i style="width:${j.withinTolPct}%"></i></div><div class="stat"><span>Inom ${+$('devTol').value} mm</span><b>${j.withinTolPct.toFixed(1).replace('.', ',')} %</b><span>Medel</span><b>${mm(j.mean)}</b><span>RMS</span><b>${mm(j.rms)}</b><span>95:e percentilen</span><b>${mm(j.p95)}</b><span>Största</span><b>${mm(j.max)}</b><span>Utanför ${md} m</span><b>${j.beyond.toLocaleString('sv')}</b></div><div class="legend"></div><div class="leg"><span>0</span><span>${+$('devTol').value} mm</span><span>${2 * +$('devTol').value}</span><span>${4 * +$('devTol').value}+</span></div><div class="muted" style="margin-top:6px">${j.evaluated.toLocaleString('sv')} punkter på ${(performance.now() - t0).toFixed(0)} ms</div>`;
  S.devStats = j; S.dirty = true;
};
$('btnCloud').onclick = () => { $('file').accept = '.xyz,.txt,.csv,.ply,.las'; $('file').dataset.kind = 'cloud'; $('file').click(); };
$('btnDemoCloud').onclick = async () => {
  if (!S.loaded) return toast('Öppna en modell först (t.ex. exempelmodellen)'); const b = S.sum.bbox, o = S.origin; let seed = 7; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647; const out = [];
  for (let i = 0; i < 120000; i++) { const x = b[0] + rnd() * (b[3] - b[0]), y = b[1] + rnd() * (b[4] - b[1]); let z = 0.3 + (rnd() - 0.5) * 0.016 + o[2]; if (x > 20 && x < 24 && y > 5 && y < 9) z += 0.07; out.push(`${(x + o[0]).toFixed(3)} ${(y + o[1]).toFixed(3)} ${z.toFixed(3)}`); }
  await loadCloud(te.encode(out.join('\n')), 'exempel.xyz');
};

/* ---------- Sök ---------- */
let qT = 0;
$('q').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(runSearch, 140); });
function runSearch() {
  const q = $('q').value.trim(), T = $('tree'); if (!S.loaded) return;
  if (!q) { $('qn').textContent = ''; buildTree(); return; }
  const t0 = performance.now(), ids = JSON.parse(outText(callStr((p, n) => E.model_search(p, n), q))); $('qn').textContent = `${ids.length.toLocaleString('sv')} träffar · ${(performance.now() - t0).toFixed(0)} ms`; S.found = ids;
  T.innerHTML = ''; const top = document.createElement('div'); top.className = 'row'; top.innerHTML = '<button class="btn" id="sSel">Markera alla</button><button class="btn" id="sIso">Isolera</button>'; T.append(top);
  $('sSel').onclick = () => { S.sel = new Set(ids); refreshFlags(); selChanged(); }; $('sIso').onclick = () => { S.sel = new Set(ids); refreshFlags(); selChanged(); isolate(); };
  ids.slice(0, 400).forEach(oi => { const r = objRow(oi); const l = r.querySelector('.lab'); l.textContent = `${objName[oi] || ''} · ${nice(S.classes[objClass[oi]])}`; T.append(r); });
  if (ids.length > 400) { const m = document.createElement('div'); m.className = 'muted'; m.textContent = `…och ${ids.length - 400} till (markera alla för att se dem i modellen)`; T.append(m); }
}
$('q').addEventListener('keydown', e => { if (e.key === 'Enter' && S.found && S.found.length) { S.sel = new Set(S.found); refreshFlags(); selChanged(); fitSel(); } if (e.key === 'Escape') { $('q').value = ''; runSearch(); $('q').blur(); } });

/* ---------- Gränssnitt ---------- */
function setTool(t) { S.tool = t; document.querySelectorAll('#tools button').forEach(b => b.classList.toggle('on', b.dataset.tool === t)); canvas.style.cursor = t === 'measure' ? 'crosshair' : 'default'; S.mPick = null; S.mHover = null; if (t === 'measure') tabR('measure'); if (t === 'section') { tabR('section'); $('sOn').checked = true; S.section.on = true; } S.dirty = true; }
$('tools').onclick = e => { const b = e.target.closest('button'); if (b) setTool(b.dataset.tool); };
function tabR(n) { document.querySelectorAll('#rtabs button').forEach(b => b.classList.toggle('on', b.dataset.t === n)); document.querySelectorAll('.right .panel').forEach(p => p.classList.toggle('on', p.id === 'r-' + n)); }
$('rtabs').onclick = e => { const b = e.target.closest('button'); if (b) tabR(b.dataset.t); };
$('ltabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; document.querySelectorAll('#ltabs button').forEach(x => x.classList.toggle('on', x === b)); document.querySelectorAll('.left .panel').forEach(p => p.classList.toggle('on', p.id === 'p-' + b.dataset.t)); };
$('bFit').onclick = fitSel; $('bHide').onclick = hideSel; $('bIso').onclick = isolate; $('bAll').onclick = showAll;
$('colorBy').onchange = e => { S.colorBy = e.target.value; applyColorBy(); };
$('btnTheme').onclick = () => { const r = document.documentElement; r.dataset.theme = r.dataset.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('r3d-theme', r.dataset.theme); } catch (e) { /* utan minne */ } S.dirty = true; };
try { const t = localStorage.getItem('r3d-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* utan minne */ }
for (const id of ['btnOpen', 'btnOpen2']) $(id).onclick = () => { $('file').accept = '.ifc,.xyz,.txt,.csv,.ply,.las'; $('file').dataset.kind = ''; $('file').click(); };
$('file').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await openFile(f); };
async function openFile(f) {
  const buf = await f.arrayBuffer(), n = f.name.toLowerCase();
  if (/\.(xyz|txt|csv|ply|las|laz)$/.test(n)) await loadCloud(buf, f.name); else await loadIfc(buf, f.name);
}
const stage = $('stage');
['dragenter', 'dragover'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); stage.classList.add('drag'); }));
['dragleave', 'drop'].forEach(t => stage.addEventListener(t, e => { e.preventDefault(); stage.classList.remove('drag'); }));
stage.addEventListener('drop', async e => { const f = e.dataTransfer.files[0]; if (f) await openFile(f); });
$('btnSample').onclick = async () => { busy('Hämtar exempel …'); const r = await fetch('sample.ifc'); await loadIfc(await r.arrayBuffer(), 'exempel.ifc'); };
$('btnExport').onclick = () => {
  const n = E.model_export(); const bytes = new Uint8Array(mem(), E.out_ptr(), n).slice(); const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/x-step' })); a.download = (S.fileName || 'modell.ifc').replace(/\.ifc$/i, '') + ' (ändrad).ifc'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000); toast('Ny IFC-fil sparad med dina ändringar');
};
window.addEventListener('keydown', e => {
  if (e.target.matches('input,select,textarea')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'k') { e.preventDefault(); $('q').focus(); $('q').select(); return; }
  if (k === 'f') fitSel(); else if (k === 'h') (e.shiftKey ? showAll() : hideSel()); else if (k === 'i') isolate();
  else if (k === '1') setTool('select'); else if (k === '2') setTool('measure'); else if (k === '3') setTool('section');
  else if (k === 'escape') { S.mPick = null; S.sel.clear(); refreshFlags(); selChanged(); setTool('select'); }
  else if (k === 'g') { S.ghost = !S.ghost; refreshFlags(); toast(S.ghost ? 'Övriga objekt tonas ned vid markering' : 'Ingen nedtoning'); }
});
// Andra appar (t.ex. 4D-planering) kan skicka in en fil: postMessage({type:'rust3d-open', kind:'ifc'|'cloud', name, buffer})
window.addEventListener('message', async e => { const m = e.data; if (!m || m.type !== 'rust3d-open' || !m.buffer) return; if (m.kind === 'cloud') await loadCloud(m.buffer, m.name || 'moln.xyz'); else await loadIfc(m.buffer, m.name || 'modell.ifc'); });

// Teststöd
window.__r3d = { S, E: () => E, loadIfc, loadCloud, pick, project, camMatrices, fitAll, draw, selectIdx: oi => { S.sel = new Set([oi]); refreshFlags(); selChanged(); }, setTool, runSearch };

(async () => {
  try { await boot(); } catch (e) { toast('Kunde inte starta Rust-motorn: ' + e.message, 9000); return; }
  resize(); requestAnimationFrame(loop); renderMeasures(); document.documentElement.dataset.ready = '1';
  const u = new URLSearchParams(location.search).get('url'); if (u) { try { const r = await fetch(u); await loadIfc(await r.arrayBuffer(), u.split('/').pop()); } catch (e) { toast('Kunde inte hämta filen'); } }
})();
