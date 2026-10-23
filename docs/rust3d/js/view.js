/* Ritning: WebGL2, kameror (perspektiv/ortografisk, flera vyrutor), träffsökning, kontur och överlägg. */
import { $, S, R, f32, u8, outJson, hsl2rgb, redraw, emit, fmtD, dist3, store } from './core.js';

/* ---------- Matriser (kolumnvis) ---------- */
export const M4 = {
  persp(f, a, n, fa) { const t = 1 / Math.tan(f / 2); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, 2 * fa * n / (n - fa), 0]; },
  ortho(l, r, b, t, n, f) { return [2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]; },
  look(e, c, u) {
    let z = [e[0] - c[0], e[1] - c[1], e[2] - c[2]]; let l = Math.hypot(...z); z = z.map(v => v / l);
    let x = [u[1] * z[2] - u[2] * z[1], u[2] * z[0] - u[0] * z[2], u[0] * z[1] - u[1] * z[0]]; l = Math.hypot(...x) || 1; x = x.map(v => v / l);
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
export const canvas = $('gl'), ov = $('ov'), octx = ov.getContext('2d');
export const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
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
uniform vec3 uCam; uniform vec4 uClip; uniform int uClipOn; uniform float uGhost; uniform vec3 uAcc; uniform float uMini;
out vec4 o;
void main(){
  if (uClipOn == 1 && dot(vPos, uClip.xyz) > uClip.w) discard;
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos))); vec3 v = normalize(uCam - vPos); if (dot(n, v) < 0.0) n = -n;
  float key = max(dot(n, normalize(vec3(-0.45, -0.55, 0.72))), 0.0), fill = max(dot(n, normalize(vec3(0.62, 0.42, 0.18))), 0.0), hemi = 0.5 + 0.5 * n.z;
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.12;
  vec3 c = vCol.rgb * (0.40 + 0.26 * hemi + 0.46 * key + 0.10 * fill) + rim;
  if ((vFl & 2) != 0) c = mix(c, uAcc, 0.52);
  if ((vFl & 4) != 0) c = mix(c, uAcc, 0.22) + vec3(0.04);
  float a = vCol.a; if ((vFl & 8) != 0) a *= uGhost;
  if (uMini > 0.5) { c = mix(c, vec3(dot(c, vec3(0.33))), 0.5); }
  o = vec4(c, a);
}`;
const PVS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol; uniform mat4 uVP; uniform float uSize; out vec4 vC; out vec3 vP;
void main(){ vC = aCol; vP = aPos; gl_Position = uVP * vec4(aPos, 1.0); gl_PointSize = uSize; }`;
const PFS = `#version 300 es
precision highp float; in vec4 vC; in vec3 vP; uniform vec4 uClip; uniform int uClipOn; out vec4 o;
void main(){ if (uClipOn == 1 && dot(vP, uClip.xyz) > uClip.w) discard; vec2 d = gl_PointCoord - 0.5; if (dot(d, d) > 0.25) discard; o = vec4(vC.rgb, 1.0); }`;
const GVS = `#version 300 es
layout(location=0) in vec2 aP; uniform mat4 uVP; uniform vec3 uC; uniform float uR; out vec3 vW;
void main(){ vec3 w = vec3(uC.xy + aP * uR, uC.z); vW = w; gl_Position = uVP * vec4(w, 1.0); }`;
const GFS = `#version 300 es
precision highp float; in vec3 vW; uniform vec3 uC; uniform float uR; uniform vec3 uCol; out vec4 o;
float grid(vec2 p, float s){ vec2 g = abs(fract(p / s - 0.5) - 0.5) / (fwidth(p / s) * 1.0); return 1.0 - min(min(g.x, g.y), 1.0); }
void main(){ float d = length(vW.xy - uC.xy) / uR; float fade = 1.0 - smoothstep(0.15, 1.0, d);
  float a = max(grid(vW.xy, 1.0) * 0.16, grid(vW.xy, 10.0) * 0.34) * fade; o = vec4(uCol, a); }`;
function prog(vs, fs) {
  const mk = (t, s) => { const sh = gl.createShader(t); gl.shaderSource(sh, s); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p;
}
let P1, P2, P3, quad;
const U = (p, n) => gl.getUniformLocation(p, n);
export function initGL() {
  if (!gl) throw new Error('Webbläsaren saknar WebGL2.');
  P1 = prog(VS, FS); P2 = prog(PVS, PFS); P3 = prog(GVS, GFS);
  quad = gl.createVertexArray(); gl.bindVertexArray(quad); const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
}

/* ---------- Modell i GPU ---------- */
export const G = { vbo: null, vao: null, nVerts: 0, nOpaque: 0, stateTex: null, stateData: null, stateRows: 1, stateDirty: false };
export function uploadModel() {
  const E = R.E; G.nVerts = E.model_verts_count(); G.nOpaque = E.model_opaque_count();
  if (G.vbo) gl.deleteBuffer(G.vbo); if (G.vao) gl.deleteVertexArray(G.vao);
  G.vao = gl.createVertexArray(); gl.bindVertexArray(G.vao); G.vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, G.vbo);
  gl.bufferData(gl.ARRAY_BUFFER, u8(E.model_verts_ptr(), G.nVerts * 20), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, true, 20, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribIPointer(2, 1, gl.UNSIGNED_INT, 20, 16); gl.bindVertexArray(null);
}
export function buildStateTex() {
  const rows = Math.max(1, Math.ceil(S.nObj / SW)); G.stateData = new Uint8Array(SW * rows * 4); G.stateRows = rows;
  if (G.stateTex) gl.deleteTexture(G.stateTex); G.stateTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, G.stateTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, SW, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, G.stateData);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
export function setFlag(oi, bit, on) { const i = oi * 4, d = G.stateData; const v = on ? d[i] | bit : d[i] & ~bit; if (v !== d[i]) { d[i] = v; G.stateDirty = true; redraw(); } }
/* Färg per objekt: ett eget värde (kollision, tidplan) vinner över "Färglägg". */
export function colorFor(oi) {
  const o = S.override.get(oi); if (o) return o;
  if (S.colorBy === 'class') return hsl2rgb(S.objClass[oi]); if (S.colorBy === 'cont') return hsl2rgb(S.objCont[oi] + 3); return null;
}
export function refreshFlags() {
  const d = G.stateData; if (!d) return; const any = S.sel.size > 0;
  for (let i = 0; i < S.nObj; i++) {
    let f = d[i * 4] & 1; if (S.sel.has(i)) f |= 2; if (i === S.hover) f |= 4;
    if (S.ghost && any && !S.sel.has(i) && !S.override.has(i)) f |= 8; if (S.ghostAll && S.ghostAll.has(i)) f |= 8;
    const c = colorFor(i); if (c) { f |= 16; d[i * 4 + 1] = c[0]; d[i * 4 + 2] = c[1]; d[i * 4 + 3] = c[2]; }
    d[i * 4] = f;
  }
  G.stateDirty = true; redraw();
}
export function setVisible(list, vis) { for (const oi of list) { setFlag(oi, 1, !vis); S.shown[oi] = vis ? 1 : 0; R.E.model_set_visible(oi, vis ? 1 : 0); } emit('visibility'); }

/* ---------- Kameror och vyrutor ---------- */
export const V = { vps: [], active: 0, layout: '3d', anim: null, edgeCache: new Map() };
const mkCam = (o = {}) => ({ tx: 0, ty: 0, tz: 0, dist: 50, yaw: -0.8, pitch: 0.5, fov: 0.8, ortho: false, half: 20, ...o });
export const main = () => V.vps[0];
export function resetViews() { V.vps = [{ id: 'main', kind: 'persp', cam: mkCam(), rect: { x: 0, y: 0, w: 1, h: 1 } }]; V.layout = '3d'; }
export function layoutViewports(mode) {
  V.layout = mode; const keep = V.vps[0].cam; const mk = (id, kind, cam) => ({ id, kind, cam: cam || mkOrtho(kind), rect: { x: 0, y: 0, w: 1, h: 1 } });
  const ex = id => V.vps.find(v => v.id === id);
  if (mode === '3d') V.vps = [V.vps[0]];
  else if (mode === 'split') V.vps = [V.vps[0], ex('top') || mk('top', 'top')];
  else V.vps = [V.vps[0], ex('top') || mk('top', 'top'), ex('front') || mk('front', 'front'), ex('side') || mk('side', 'side')];
  V.vps[0].cam = keep; V.active = 0; sizeViewports(); if (S.sum) V.vps.slice(1).forEach(vp => fitBox(S.sum.bbox.slice(0, 3), S.sum.bbox.slice(3), vp, 0)); redraw();
}
function mkOrtho(kind) {
  const c = mkCam({ ortho: true, dist: S.radius * 3, half: S.radius * 1.1, ...(S.sum ? centerOf() : {}) });
  if (kind === 'top') { c.yaw = -Math.PI / 2; c.pitch = Math.PI / 2; } else if (kind === 'front') { c.yaw = -Math.PI / 2; c.pitch = 0; } else { c.yaw = 0; c.pitch = 0; } return c;
}
function centerOf() { const b = S.sum.bbox; return { tx: (b[0] + b[3]) / 2, ty: (b[1] + b[4]) / 2, tz: (b[2] + b[5]) / 2 }; }
export function sizeViewports() {
  const W = S.w, H = S.h, g = Math.round(6 * S.dpr), n = V.vps.length;
  if (n === 1) V.vps[0].rect = { x: 0, y: 0, w: W, h: H };
  else if (n === 2) { const a = Math.round(W * 0.56); V.vps[0].rect = { x: 0, y: 0, w: a - g / 2, h: H }; V.vps[1].rect = { x: a + g / 2, y: 0, w: W - a - g / 2, h: H }; }
  else { const a = Math.round(W * 0.6), h2 = Math.round(H / 3); V.vps[0].rect = { x: 0, y: 0, w: a - g / 2, h: H }; [1, 2, 3].forEach((i, k) => V.vps[i].rect = { x: a + g / 2, y: k * h2 + (k ? g / 2 : 0), w: W - a - g / 2, h: k === 2 ? H - 2 * h2 - g / 2 : h2 - (k ? g / 2 : 0) - (k === 0 ? g / 2 : 0) }); }
}
export function resize() {
  const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  S.w = Math.max(1, Math.round(r.width * dpr)); S.h = Math.max(1, Math.round(r.height * dpr)); canvas.width = ov.width = S.w; canvas.height = ov.height = S.h; S.dpr = dpr; sizeViewports(); redraw();
}
function eyeOf(c) { return [c.tx + c.dist * Math.cos(c.pitch) * Math.cos(c.yaw), c.ty + c.dist * Math.cos(c.pitch) * Math.sin(c.yaw), c.tz + c.dist * Math.sin(c.pitch)]; }
export function matrices(vp) {
  const c = vp.cam, r = vp.rect, asp = r.w / Math.max(1, r.h);
  const ed = c.ortho && vp.kind !== 'persp' ? S.radius * 3 : c.dist, e = [c.tx + ed * Math.cos(c.pitch) * Math.cos(c.yaw), c.ty + ed * Math.cos(c.pitch) * Math.sin(c.yaw), c.tz + ed * Math.sin(c.pitch)];
  const up = [-Math.sin(c.pitch) * Math.cos(c.yaw), -Math.sin(c.pitch) * Math.sin(c.yaw), Math.cos(c.pitch)];
  const v = M4.look(e, [c.tx, c.ty, c.tz], up); let p;
  if (c.ortho) { const h = vp.kind === 'persp' ? c.dist * Math.tan(c.fov / 2) : c.half; p = M4.ortho(-h * asp, h * asp, -h, h, Math.max(0.05, ed - S.radius * 4 - c.dist), ed + S.radius * 4 + c.dist); }
  else p = M4.persp(c.fov, asp, Math.max(0.02, c.dist * 0.01), Math.max(200, c.dist + S.radius * 6));
  vp.vp = M4.mul(p, v); vp.ivp = M4.inv(vp.vp); vp.eye = e; return vp;
}
export const vpAt = (cx, cy) => { const b = canvas.getBoundingClientRect(), x = (cx - b.left) * S.dpr, y = (cy - b.top) * S.dpr; for (let i = V.vps.length - 1; i >= 0; i--) { const r = V.vps[i].rect; if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return { vp: V.vps[i], i, x: x - r.x, y: y - r.y, px: x, py: y }; } return { vp: V.vps[0], i: 0, x: x, y: y, px: x, py: y }; };
export function ray(vp, lx, ly) { // lokal pixel i vyrutan → stråle
  matrices(vp); const r = vp.rect, x = (lx / r.w) * 2 - 1, y = 1 - (ly / r.h) * 2; const a = M4.xform(vp.ivp, [x, y, -1]), b = M4.xform(vp.ivp, [x, y, 1]);
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d); return { o: [a[0], a[1], a[2]], d: d.map(v => v / l) };
}
export function project(vp, p) { const q = M4.xform(vp.vp, p); if (!(q[3] > 0) && !vp.cam.ortho) return null; const r = vp.rect; return [r.x + (q[0] * 0.5 + 0.5) * r.w, r.y + (1 - (q[1] * 0.5 + 0.5)) * r.h]; }
export function pick(vp, lx, ly) {
  if (!S.loaded) return null; const r = ray(vp, lx, ly), E = R.E;
  const oi = E.model_pick(r.o[0], r.o[1], r.o[2], r.d[0], r.d[1], r.d[2]); if (oi < 0) return null;
  const f = f32(E.res_ptr(), 16); return { oi, t: f[0], p: [f[1], f[2], f[3]], v: [f[4], f[5], f[6]], e: [f[7], f[8], f[9]] };
}

/* ---------- Kamerarörelser ---------- */
export function fitBox(mn, mx, vp = V.vps[0], ms = 420) {
  const c = vp.cam, ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]], r = Math.max(0.5, Math.hypot(...ext) / 2), asp = vp.rect.w / Math.max(1, vp.rect.h);
  let half = r * 1.05; if (vp.kind === 'top') half = Math.max(ext[1] / 2, ext[0] / 2 / asp) * 1.14 + 0.3; else if (vp.kind === 'front') half = Math.max(ext[2] / 2, ext[0] / 2 / asp) * 1.14 + 0.3; else if (vp.kind === 'side') half = Math.max(ext[2] / 2, ext[1] / 2 / asp) * 1.14 + 0.3;
  animateTo(vp, { tx: (mn[0] + mx[0]) / 2, ty: (mn[1] + mx[1]) / 2, tz: (mn[2] + mx[2]) / 2, dist: r / Math.sin(c.fov / 2) * 1.05, half }, ms);
}
export function fitAll(ms) { if (S.sum) V.vps.forEach(vp => fitBox(S.sum.bbox.slice(0, 3), S.sum.bbox.slice(3), vp, ms)); }
export function objBox(oi) { const j = outJson(R.E.model_object(oi)); return j.bbox; }
export const boxOf = new Map();
export function selBox() { const mn = [1e30, 1e30, 1e30], mx = [-1e30, -1e30, -1e30]; for (const oi of S.sel) { let b = boxOf.get(oi); if (!b) boxOf.set(oi, b = objBox(oi)); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], b[k]); mx[k] = Math.max(mx[k], b[k + 3]); } } return S.sel.size ? [mn, mx] : null; }
export function fitSel(ms) { const b = selBox(); if (!b) return fitAll(ms); V.vps.forEach(vp => fitBox(b[0], b[1], vp, ms)); }
const lerp = (a, b, t) => a + (b - a) * t;
export function animateTo(vp, to, ms = 420) {
  const c = vp.cam, from = { ...c }; const dy = ((to.yaw ?? c.yaw) - c.yaw + Math.PI * 3) % (Math.PI * 2) - Math.PI; const t0 = performance.now(); const id = Symbol();
  vp._anim = id; if (!ms) { Object.assign(c, to); redraw(); return; }
  const step = t => { if (vp._anim !== id) return; let k = Math.min(1, (t - t0) / ms); k = k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    for (const key of ['tx', 'ty', 'tz', 'dist', 'half', 'pitch']) if (to[key] != null) c[key] = lerp(from[key], to[key], k);
    if (to.yaw != null) c.yaw = from.yaw + dy * k; redraw(); if (k < 1) requestAnimationFrame(step); else if (to.yaw != null) c.yaw = to.yaw; };
  requestAnimationFrame(step);
}
export function stdView(name, ms = 450) {
  const vp = V.vps[0], P = Math.PI, m = { front: [-P / 2, 0.0], back: [P / 2, 0.0], right: [0, 0.0], left: [P, 0.0], top: [vp.cam.yaw, 1.5], bottom: [vp.cam.yaw, -1.5], iso: [-0.8, 0.5] }[name]; if (!m) return;
  animateTo(vp, { yaw: m[0], pitch: m[1] }, ms);
}
export const camState = vp => { const c = vp.cam; return { tx: c.tx, ty: c.ty, tz: c.tz, dist: c.dist, yaw: c.yaw, pitch: c.pitch, ortho: c.ortho, half: c.half }; };

/* ---------- Snitt ---------- */
export function clipPlane() { const s = S.section, sg = s.flip ? -1 : 1, n = [s.axis === 'x' ? sg : 0, s.axis === 'y' ? sg : 0, s.axis === 'z' ? sg : 0]; return [n[0], n[1], n[2], sg * s.pos]; }
export function setupSection(axis) { const b = S.sum.bbox, a = axis || S.section.axis, i = { x: 0, y: 1, z: 2 }[a]; S.section.axis = a; S.section.min = b[i]; S.section.max = b[i + 3]; S.section.pos = (b[i] + b[i + 3]) / 2; }

/* ---------- Ritning ---------- */
function themeDark() { const t = document.documentElement.dataset.theme; return t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches); }
export function draw() {
  S.dirty = false; if (!gl || !P1) return; const dark = themeDark();
  gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, S.w, S.h); gl.clearColor(0, 0, 0, 0);
  const bg = dark ? [0.063, 0.082, 0.118] : [0.914, 0.929, 0.949]; gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  octx.clearRect(0, 0, S.w, S.h);
  if (G.stateDirty && G.stateTex) { gl.bindTexture(gl.TEXTURE_2D, G.stateTex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, SW, G.stateRows, gl.RGBA, gl.UNSIGNED_BYTE, G.stateData); G.stateDirty = false; }
  V.vps.forEach((vp, i) => drawView(vp, i, dark));
  if (S.mini && !$('minimap').hidden) drawMini(dark);
  emit('frame');
}
function drawScene(vp, o) {
  const sc = S.section, cl = o.clip || (sc.on ? clipPlane() : [0, 0, 0, 0]), clipOn = o.clip || sc.on ? 1 : 0, dark = o.dark;
  const acc = dark ? [0.36, 0.61, 1.0] : [0.09, 0.41, 1.0];
  if (S.loaded) {
    gl.useProgram(P1); gl.uniformMatrix4fv(U(P1, 'uVP'), false, vp.vp); gl.uniform3fv(U(P1, 'uCam'), vp.eye); gl.uniform4fv(U(P1, 'uClip'), cl); gl.uniform1i(U(P1, 'uClipOn'), clipOn); gl.uniform1f(U(P1, 'uGhost'), 0.1); gl.uniform3fv(U(P1, 'uAcc'), acc); gl.uniform1f(U(P1, 'uMini'), o.mini ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.stateTex); gl.uniform1i(U(P1, 'uState'), 0);
    gl.bindVertexArray(G.vao); gl.disable(gl.BLEND); gl.depthMask(true); gl.drawArrays(gl.TRIANGLES, 0, G.nOpaque);
    if (G.nVerts > G.nOpaque) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.drawArrays(gl.TRIANGLES, G.nOpaque, G.nVerts - G.nOpaque); gl.depthMask(true); gl.disable(gl.BLEND); }
    gl.bindVertexArray(null);
  }
  if (S.cloud && S.cloud.show) { gl.useProgram(P2); gl.uniformMatrix4fv(U(P2, 'uVP'), false, vp.vp); gl.uniform1f(U(P2, 'uSize'), S.cloudSize * S.dpr); gl.uniform4fv(U(P2, 'uClip'), cl); gl.uniform1i(U(P2, 'uClipOn'), clipOn); gl.bindVertexArray(S.cloud.vao); gl.drawArrays(gl.POINTS, 0, S.cloud.n); gl.bindVertexArray(null); }
  if (!o.mini && S.sum && vp.kind === 'persp') { // golvraster
    const b = S.sum.bbox, c = [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, b[2] - 0.01]; gl.useProgram(P3); gl.uniformMatrix4fv(U(P3, 'uVP'), false, vp.vp); gl.uniform3fv(U(P3, 'uC'), c); gl.uniform1f(U(P3, 'uR'), S.radius * 6); gl.uniform3fv(U(P3, 'uCol'), dark ? [0.7, 0.78, 0.9] : [0.2, 0.25, 0.35]);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); gl.bindVertexArray(quad); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.bindVertexArray(null); gl.depthMask(true); gl.disable(gl.BLEND);
  }
}
function drawView(vp, i, dark) {
  matrices(vp); const r = vp.rect, yb = S.h - r.y - r.h; gl.enable(gl.SCISSOR_TEST); gl.scissor(r.x, yb, r.w, r.h); gl.viewport(r.x, yb, r.w, r.h);
  if (V.vps.length > 1) { const bg = dark ? [0.063, 0.082, 0.118] : [0.914, 0.929, 0.949]; gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); }
  gl.enable(gl.DEPTH_TEST); drawScene(vp, { dark });
  gl.disable(gl.SCISSOR_TEST);
  // överlägg: i den här vyrutan
  const c = octx; c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
  if (V.vps.length > 1) { c.fillStyle = dark ? 'rgba(255,255,255,.55)' : 'rgba(15,23,42,.5)'; c.font = `600 ${11 * S.dpr}px system-ui`; c.fillText({ persp: '3D', top: 'PLAN', front: 'FRAM', side: 'SIDA' }[vp.kind] || '', r.x + 10 * S.dpr, r.y + 18 * S.dpr); c.strokeStyle = i === V.active ? 'rgba(23,105,255,.75)' : (dark ? 'rgba(255,255,255,.14)' : 'rgba(15,23,42,.16)'); c.lineWidth = (i === V.active ? 2 : 1) * S.dpr; c.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2); }
  overlay(vp); c.restore();
}
/* Kontur: kanter för markerade objekt (Rust räknar ut vilka kanter som syns som konturlinjer). */
export function edgesOf(oi) { let e = V.edgeCache.get(oi); if (!e) { const n = R.E.model_edges(oi); e = new Float32Array(R.E.memory.buffer.slice(R.E.out_ptr(), R.E.out_ptr() + n)); V.edgeCache.set(oi, e); if (V.edgeCache.size > 400) V.edgeCache.delete(V.edgeCache.keys().next().value); } return e; }
function overlay(vp) {
  const c = octx, k = S.dpr, acc = themeDark() ? '#5b9bff' : '#1769ff';
  const strokeEdges = (oi, col, w, alpha = 1) => { const e = edgesOf(oi), n = e.length / 6; if (!n) return; c.beginPath(); const step = n > 8000 ? Math.ceil(n / 8000) : 1; for (let j = 0; j < n; j += step) { const a = project(vp, [e[j * 6], e[j * 6 + 1], e[j * 6 + 2]]), b = project(vp, [e[j * 6 + 3], e[j * 6 + 4], e[j * 6 + 5]]); if (a && b) { c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); } } c.globalAlpha = alpha; c.strokeStyle = col; c.lineWidth = w * k; c.lineJoin = 'round'; c.stroke(); c.globalAlpha = 1; };
  if (S.loaded) {
    if (S.hover >= 0 && !S.sel.has(S.hover) && S.shown[S.hover]) strokeEdges(S.hover, acc, 1.5, 0.75);
    let n = 0; for (const oi of S.sel) { if (n++ > 300) break; strokeEdges(oi, acc, 2.2); }
    const sb = S.sel.size && S.sel.size < 200 ? selBox() : null;
    if (sb && vp.kind === 'persp') { const [mn, mx] = sb; for (let q = 0; q < 8; q++) { const p = project(vp, [q & 1 ? mx[0] : mn[0], q & 2 ? mx[1] : mn[1], q & 4 ? mx[2] : mn[2]]); if (p) { c.beginPath(); c.arc(p[0], p[1], 3.6 * k, 0, 7); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.6 * k; c.strokeStyle = acc; c.stroke(); } } }
  }
  const dot = (p, col, r = 5) => { c.beginPath(); c.arc(p[0], p[1], r * k, 0, 7); c.fillStyle = col; c.fill(); c.lineWidth = 2 * k; c.strokeStyle = '#fff'; c.stroke(); };
  const label = (p, t, bg = 'rgba(15,23,42,.88)') => { c.font = `600 ${12 * k}px system-ui`; const w = c.measureText(t).width + 14 * k; c.fillStyle = bg; c.beginPath(); c.roundRect(p[0] - w / 2, p[1] - 24 * k, w, 22 * k, 7 * k); c.fill(); c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(t, p[0], p[1] - 8.5 * k); c.textAlign = 'left'; };
  for (const m of S.measures) { const a = project(vp, m.a), b = project(vp, m.b); if (!a || !b) continue; c.strokeStyle = '#f59e0b'; c.lineWidth = 2.5 * k; c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); dot(a, '#f59e0b', 4.5); dot(b, '#f59e0b', 4.5); label([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], fmtD(m.d)); }
  if (S.mPick) { const a = project(vp, S.mPick); if (a) dot(a, '#f59e0b', 5); if (S.mHover && vp === V.vps[V.active]) { const b = project(vp, S.mHover.p); if (a && b) { c.setLineDash([6 * k, 5 * k]); c.strokeStyle = '#f59e0b'; c.lineWidth = 2 * k; c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); c.setLineDash([]); label([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], fmtD(dist3(S.mPick, S.mHover.p))); } } }
  if (S.tool === 'measure' && S.mHover && vp === V.vps[V.active]) { const p = project(vp, S.mHover.p); if (p) { c.strokeStyle = S.mHover.kind === 'vertex' ? '#22c55e' : S.mHover.kind === 'edge' ? '#06b6d4' : '#f59e0b'; c.lineWidth = 2.5 * k; const s = 7 * k; if (S.mHover.kind === 'vertex') c.strokeRect(p[0] - s, p[1] - s, 2 * s, 2 * s); else { c.beginPath(); c.arc(p[0], p[1], s, 0, 7); c.stroke(); } } }
  // kommentarsnålar
  S.comments.forEach((cm, i) => { if (cm.hidden) return; const p = project(vp, cm.p); if (!p) return; c.beginPath(); c.arc(p[0], p[1], 11 * k, 0, 7); c.fillStyle = cm.status === 'Löst' ? '#16a34a' : acc; c.fill(); c.lineWidth = 2 * k; c.strokeStyle = '#fff'; c.stroke(); c.fillStyle = '#fff'; c.font = `700 ${11 * k}px system-ui`; c.textAlign = 'center'; c.fillText(String(i + 1), p[0], p[1] + 4 * k); c.textAlign = 'left'; cm._s = p; });
  // kollisionsmarkörer
  (S.clashMarks || []).forEach(m => { const p = project(vp, m.p); if (!p) return; c.beginPath(); c.arc(p[0], p[1], (m.on ? 13 : 8) * k, 0, 7); c.fillStyle = m.on ? 'rgba(220,38,38,.9)' : 'rgba(220,38,38,.55)'; c.fill(); c.lineWidth = 2 * k; c.strokeStyle = '#fff'; c.stroke(); });
  // snittplan med draghandtag
  if (S.section.on && S.tool === 'section' && S.sum && vp.kind === 'persp') sectionGizmo(vp, c, k, acc);
}
function sectionGizmo(vp, c, k, acc) {
  const s = S.section, b = S.sum.bbox, ax = { x: 0, y: 1, z: 2 }[s.axis], o = [0, 1, 2].filter(i => i !== ax), pad = S.radius * 0.1;
  const pt = (u, v) => { const p = [0, 0, 0]; p[ax] = s.pos; p[o[0]] = u; p[o[1]] = v; return project(vp, p); };
  const q = [pt(b[o[0]] - pad, b[o[1]] - pad), pt(b[o[0] + 3] + pad, b[o[1]] - pad), pt(b[o[0] + 3] + pad, b[o[1] + 3] + pad), pt(b[o[0]] - pad, b[o[1] + 3] + pad)];
  if (q.some(x => !x)) return; c.beginPath(); c.moveTo(...q[0]); q.slice(1).forEach(x => c.lineTo(...x)); c.closePath(); c.fillStyle = 'rgba(23,105,255,.07)'; c.fill(); c.strokeStyle = acc; c.lineWidth = 1.6 * k; c.setLineDash([8 * k, 5 * k]); c.stroke(); c.setLineDash([]);
  const mid = [0, 0, 0]; mid[ax] = s.pos; mid[o[0]] = (b[o[0]] + b[o[0] + 3]) / 2; mid[o[1]] = (b[o[1]] + b[o[1] + 3]) / 2; const hp = project(vp, mid);
  const up = [mid[0] + (ax === 0 ? 1 : 0), mid[1] + (ax === 1 ? 1 : 0), mid[2] + (ax === 2 ? 1 : 0)], hu = project(vp, up); if (!hp) return;
  s.handle = { x: hp[0], y: hp[1], vp }; c.beginPath(); c.arc(hp[0], hp[1], 15 * k, 0, 7); c.fillStyle = acc; c.fill(); c.lineWidth = 3 * k; c.strokeStyle = '#fff'; c.stroke();
  c.fillStyle = '#fff'; c.beginPath(); const dx = hu ? hu[0] - hp[0] : 0, dy = hu ? hu[1] - hp[1] : -1, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l; const tri = (sg) => { const bx = hp[0] + ux * 8 * k * sg, by = hp[1] + uy * 8 * k * sg; c.moveTo(bx + ux * 4 * k * sg, by + uy * 4 * k * sg); c.lineTo(bx - ux * 1 * k * sg - uy * 4.5 * k, by - uy * 1 * k * sg + ux * 4.5 * k); c.lineTo(bx - ux * 1 * k * sg + uy * 4.5 * k, by - uy * 1 * k * sg - ux * 4.5 * k); c.closePath(); }; tri(1); tri(-1); c.fill();
}
/* Planvyn (minikarta): rutan ritas i en egen bildbuffert och kopieras till en 2D-duk (rundade hörn, glas och etikett ligger ovanpå i DOM). */
let fbo = null, fbTex = null, fbDep = null; const FW = 416, FH = 336; let miniT = 0, miniBuf = null;
export function levelElev(ci) { let z = 1e30; for (let i = 0; i < S.nObj; i++) if (S.objCont[i] === ci) { let b = boxOf.get(i); if (!b) boxOf.set(i, b = objBox(i)); if (b[2] < z) z = b[2]; } return z; }
export function drawMini(dark) {
  const now = performance.now(); if (now - miniT < 110) { S.dirty = true; return; } miniT = now;
  const mm = $('mm'); if (mm.width !== FW) { mm.width = FW; mm.height = FH; }
  if (!fbo) { fbo = gl.createFramebuffer(); fbTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, fbTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, FW, FH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    fbDep = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, fbDep); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, FW, FH); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fbTex, 0); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, fbDep); miniBuf = new Uint8ClampedArray(FW * FH * 4); }
  const b = S.sum.bbox, dx = b[3] - b[0], dy = b[4] - b[1], asp = FW / FH, half = Math.max(dy, dx / asp) / 2 * 1.12 + 0.5;
  const vp = { kind: 'top', rect: { x: 0, y: 0, w: FW, h: FH }, cam: { tx: (b[0] + b[3]) / 2, ty: (b[1] + b[4]) / 2, tz: (b[2] + b[5]) / 2, dist: S.radius * 3, yaw: -Math.PI / 2, pitch: Math.PI / 2, fov: 0.8, ortho: true, half } }; matrices(vp); S.miniVp = vp;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.disable(gl.SCISSOR_TEST); gl.viewport(0, 0, FW, FH); const bg = dark ? [0.1, 0.12, 0.17] : [0.95, 0.96, 0.97]; gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
  const ci = S.miniLevel, zc = ci == null || ci < 0 ? b[5] + 1 : levelElev(ci) + 1.5; drawScene(vp, { dark, mini: true, clip: [0, 0, 1, zc] });
  const px = new Uint8Array(FW * FH * 4); gl.readPixels(0, 0, FW, FH, gl.RGBA, gl.UNSIGNED_BYTE, px); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  for (let y = 0; y < FH; y++) miniBuf.set(px.subarray((FH - 1 - y) * FW * 4, (FH - y) * FW * 4), y * FW * 4);
  const ctx = mm.getContext('2d'); ctx.putImageData(new ImageData(miniBuf, FW, FH), 0, 0);
  const cam = V.vps[0].cam, e = eyeOf(cam), p = project(vp, e);
  if (p) { const k = 2; ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(Math.atan2(Math.sin(cam.yaw), -Math.cos(cam.yaw)) + Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 46, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); ctx.closePath(); ctx.fillStyle = 'rgba(23,105,255,.28)'; ctx.fill(); ctx.beginPath(); ctx.arc(0, 0, 5 * k / 2, 0, 7); ctx.fillStyle = '#1769ff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore(); }
  ctx.fillStyle = 'rgba(100,116,139,.8)'; ctx.font = '600 20px system-ui'; ctx.fillText('N', FW - 26, 26);
}
