/* Höjdkurvor och höjdfärg ur punktmolnen (Victor 2026-11-02: "lägga in höjdkurvor och färger beroende på höjder … riktigt snygg & coolt").
   • Höjdgrid ur de tända molnen (övre yta, medel eller nedre/mark), hål fylls och ytan jämnas något.
   • Kurvor med valfritt intervall (kraftig linje var N:e), färgade efter höjd eller mörka, med höjdsiffror på de kraftiga.
   • Färgyta (hypsometrisk tint) lagd på molnets yta i 3D och under kurvorna i minimapen.
   • Export till DXF som 3D-polylinjer med höjd (lager per intervall) och text. */
const l3cn = { on: false, int: 0, major: 5, tint: true, tintOp: 0.38, in3d: true, inMap: true, colorLines: true, labels: true, smooth: 2, mode: "max", grid: null, segs: null, rev: 0, busy: false, group: null, cell: 0, info: "" };
const l3cnPrefs = () => (typeof l3Prefs === "function" && l3Prefs().cn) || {};
function l3cnLoad() { const p = l3cnPrefs(); ["on", "int", "major", "tint", "tintOp", "in3d", "inMap", "colorLines", "labels", "smooth", "mode"].forEach(k => { if (p[k] !== undefined) l3cn[k] = p[k]; }); }
function l3cnSave() { const o = {}; ["on", "int", "major", "tint", "tintOp", "in3d", "inMap", "colorLines", "labels", "smooth", "mode"].forEach(k => { o[k] = l3cn[k]; }); l3SetPref("cn", o); }
l3cnLoad();
const l3cnRev = () => (l3cn.on && l3cn.inMap ? l3cn.rev : 0);
/* Höjdfärg: blå → turkos → grön → gul → röd */
function l3cnRamp(f) { f = Math.max(0, Math.min(1, f)); const st = [[0, 49, 99, 200], [0.25, 40, 170, 200], [0.5, 70, 180, 90], [0.75, 240, 210, 60], [1, 215, 50, 40]]; for (let i = 1; i < st.length; i++) if (f <= st[i][0]) { const a = st[i - 1], b = st[i], k = (f - a[0]) / (b[0] - a[0]); return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k]; } return [215, 50, 40]; }
const l3cnNiceStep = span => { const raw = span / 14, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; };

/* Jämna kurvor (Victor 2026-11-04: "linjerna snyggare/mer smooth och inte lika hackiga"): höjdrutnätet jämnas först (några lätta medelvärdespass som inte sprider sig in i tomma rutor),
   därefter länkas kurvans delsträckor ihop till sammanhängande linjer som rundas av med Chaikin-skärning. Steg 0 = rå marching squares. */
const L3CN_BLUR = [0, 1, 3, 6], L3CN_CHAIKIN = [0, 1, 1, 2];
function l3cnBlur(z, nx, ny, passes) {
  let a = z; for (let p = 0; p < passes; p++) { const b = a.slice();
    for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const k = i + j * nx; if (a[k] !== a[k]) continue; let s = a[k] * 4, w = 4;
      for (const [di, dj, wt] of [[-1, 0, 2], [1, 0, 2], [0, -1, 2], [0, 1, 2], [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]]) { const v = a[k + di + dj * nx]; if (v === v) { s += v * wt; w += wt; } }
      b[k] = s / w; }
    a = b; }
  return a;
}
/* Segment (x0,y0,x1,y1,L)-lista → sammanlänkade linjer → Chaikin → nya segment. */
function l3cnSmoothSegs(arr, cell, iters) {
  const n = arr.length / 5; if (!n || !iters) return arr; const q = cell * 1e-3, key = (x, y, L) => Math.round(x / q) + "," + Math.round(y / q) + "," + L, ends = new Map(), used = new Uint8Array(n);
  const add = (k, i, e) => { let l = ends.get(k); if (!l) ends.set(k, l = []); l.push(i * 2 + e); };
  for (let i = 0; i < n; i++) { const o = i * 5; add(key(arr[o], arr[o + 1], arr[o + 4]), i, 0); add(key(arr[o + 2], arr[o + 3], arr[o + 4]), i, 1); }
  const next = (k, from) => { const l = ends.get(k); if (!l) return -1; for (const c of l) { const i = c >> 1; if (!used[i] && i !== from) return c; } return -1; };
  const lines = [];
  for (let s0 = 0; s0 < n; s0++) {
    if (used[s0]) continue; used[s0] = 1; const o = s0 * 5, L = arr[o + 4]; const pts = [arr[o], arr[o + 1], arr[o + 2], arr[o + 3]]; let kTail = key(arr[o + 2], arr[o + 3], L), kHead = key(arr[o], arr[o + 1], L);
    for (let side = 0; side < 2; side++) { let cur = -1;
      for (;;) { const k = side === 0 ? kTail : kHead, c = next(k, cur); if (c < 0) break; const i = c >> 1, e = c & 1, oo = i * 5; used[i] = 1; cur = i;
        const fx = e === 0 ? arr[oo + 2] : arr[oo], fy = e === 0 ? arr[oo + 3] : arr[oo + 1];   // andra änden
        if (side === 0) { pts.push(fx, fy); kTail = key(fx, fy, L); } else { pts.unshift(fx, fy); kHead = key(fx, fy, L); } } }
    lines.push({ L, pts, closed: kHead === kTail && pts.length >= 8 });
  }
  const out = [];
  lines.forEach(ln => { let P = ln.pts; if (ln.closed) P = P.slice(0, P.length - 2);
    for (let it = 0; it < iters && P.length >= 6; it++) { const m = P.length / 2, R = []; const cnt = ln.closed ? m : m - 1;
      if (!ln.closed) R.push(P[0], P[1]);
      for (let i = 0; i < cnt; i++) { const a = i, b = (i + 1) % m, ax = P[a * 2], ay = P[a * 2 + 1], bx = P[b * 2], by = P[b * 2 + 1]; R.push(0.75 * ax + 0.25 * bx, 0.75 * ay + 0.25 * by, 0.25 * ax + 0.75 * bx, 0.25 * ay + 0.75 * by); }
      if (!ln.closed) R.push(P[P.length - 2], P[P.length - 1]); P = R; }
    const m = P.length / 2; for (let i = 1; i < m; i++) out.push(P[i * 2 - 2], P[i * 2 - 1], P[i * 2], P[i * 2 + 1], ln.L); if (ln.closed && m > 2) out.push(P[m * 2 - 2], P[m * 2 - 1], P[0], P[1], ln.L); });
  return Float32Array.from(out);
}
/* ---- Grid ------------------------------------------------------------------------------------------------------------ */
function l3cnBuildGrid() {
  const O = l3.O, clouds = (typeof l3pc !== "undefined" ? l3pc.clouds : []).filter(c => c.visible); if (!clouds.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  clouds.forEach(c => { const g = c.group.position; c.chunks.forEach(ch => { const P = ch.pos, n = P.length / 3; for (let i = 0; i < n; i += 5) { const x = P[i * 3] + g.x, y = P[i * 3 + 1] + g.y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }); });
  if (!isFinite(x0)) return null; const W = x1 - x0, H = y1 - y0, cell = Math.max(0.1, Math.sqrt((W * H) / 250000), Math.max(W, H) / 700), nx = Math.max(2, Math.ceil(W / cell) + 1), ny = Math.max(2, Math.ceil(H / cell) + 1);
  const z = new Float32Array(nx * ny).fill(NaN), cnt = new Uint16Array(nx * ny), mode = l3cn.mode;
  clouds.forEach(c => { const g = c.group.position;
    c.chunks.forEach(ch => { const P = ch.pos, n = P.length / 3;
      for (let i = 0; i < n; i++) { const x = P[i * 3] + g.x, y = P[i * 3 + 1] + g.y, k = Math.floor((x - x0) / cell) + Math.floor((y - y0) / cell) * nx, zz = P[i * 3 + 2] + g.z + O[2], v = z[k];
        if (mode === "mean") { if (v !== v) { z[k] = zz; cnt[k] = 1; } else { z[k] = (v * cnt[k] + zz) / (cnt[k] + 1); if (cnt[k] < 65000) cnt[k]++; } }
        else if (mode === "min") { if (v !== v || zz < v) z[k] = zz; } else if (v !== v || zz > v) z[k] = zz; } }); });
  // fyll små hål (grannmedelvärde) och jämna lätt
  for (let pass = 0; pass < 4; pass++) { const nz = z.slice(); for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const k = i + j * nx; if (z[k] === z[k]) continue; let s = 0, m = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const v = z[k + di + dj * nx]; if (v === v) { s += v; m++; } } if (m >= 3) nz[k] = s / m; } z.set(nz); }
  const sm = z.slice(); for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const k = i + j * nx; if (z[k] !== z[k]) continue; let s = z[k] * 4, w = 4; for (const [di, dj, wt] of [[-1, 0, 2], [1, 0, 2], [0, -1, 2], [0, 1, 2], [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]]) { const v = z[k + di + dj * nx]; if (v === v) { s += v * wt; w += wt; } } sm[k] = s / w; }
  const smo = L3CN_BLUR[Math.max(0, Math.min(3, Number(l3cn.smooth) | 0))]; if (smo) { const bl = l3cnBlur(sm, nx, ny, smo); sm.set(bl); }
  let zmin = Infinity, zmax = -Infinity; for (let k = 0; k < sm.length; k++) { const v = sm[k]; if (v === v) { if (v < zmin) zmin = v; if (v > zmax) zmax = v; } }
  if (!isFinite(zmin)) return null; return { x0: x0 + O[0], y0: y0 + O[1], cell, nx, ny, z: sm, zmin, zmax };
}
/* ---- Kurvor (marching squares) ------------------------------------------------------------------------------------ */
function l3cnTrace(G, int) {
  const { x0, y0, cell, nx, ny, z } = G, minor = [], major = [], levels = [], step = int, start = Math.ceil(G.zmin / step) * step, mj = Math.max(1, Math.round(l3cn.major));
  for (let L = start, n = 0; L <= G.zmax && n < 600; L += step, n++) levels.push(Math.round(L / step * 1000) / 1000 * step);
  // Varje ruta läggs bara i de nivåer den faktiskt korsar (förut gicks hela rutnätet igenom för varje nivå – minuter i stora moln).
  const per = levels.map(() => []), L0 = levels[0];
  if (levels.length) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const k = i + j * nx, a = z[k], b = z[k + 1], c = z[k + 1 + nx], d = z[k + nx]; if (a !== a || b !== b || c !== c || d !== d) continue;
    const mn = Math.min(a, b, c, d), mx = Math.max(a, b, c, d); if (mn === mx) continue;
    let l0 = Math.max(0, Math.floor((mn - L0) / step - 1e-6)), l1 = Math.min(levels.length - 1, Math.ceil((mx - L0) / step + 1e-6));
    for (let li = l0; li <= l1; li++) { const L = levels[li]; if (L >= mn && L <= mx) per[li].push(k); }
  }
  levels.forEach((L, li) => {
    const isMajor = Math.abs(Math.round(L / step) % mj) === 0, out = isMajor ? major : minor, list = per[li];
    for (let q = 0; q < list.length; q++) {
      const k = list[q], i = k % nx, j = (k - i) / nx, a = z[k], b = z[k + 1], c = z[k + 1 + nx], d = z[k + nx];
      const pts = [], e = (v1, v2, xa, ya, xb, yb) => { if ((v1 < L) !== (v2 < L)) { const t = (L - v1) / (v2 - v1); pts.push(x0 + (xa + (xb - xa) * t) * cell, y0 + (ya + (yb - ya) * t) * cell); } };
      e(a, b, i, j, i + 1, j); e(b, c, i + 1, j, i + 1, j + 1); e(d, c, i, j + 1, i + 1, j + 1); e(a, d, i, j, i, j + 1);
      if (pts.length >= 4) out.push(pts[0], pts[1], pts[2], pts[3], L); if (pts.length === 8) out.push(pts[4], pts[5], pts[6], pts[7], L);
    }
  });
  return { levels, minor: Float32Array.from(minor), major: Float32Array.from(major), step, mj };
}
function l3cnCompute(quiet) {
  if (typeof l3pc === "undefined" || !l3pc.clouds.some(c => c.visible)) { l3cnClear(); l3cn.info = "Tänd ett punktmoln (Lager → Punktmoln)."; return; }
  const t0 = performance.now(); const G = l3cnBuildGrid(); if (!G) { l3cn.info = "Inga höjder att räkna kurvor på."; return; }
  const int = l3cn.int > 0 ? l3cn.int : l3cnNiceStep(G.zmax - G.zmin); let S = l3cnTrace(G, int), guard = 0; while ((S.minor.length + S.major.length) / 5 > 260000 && guard++ < 3) S = l3cnTrace(G, int * 2 ** guard);
  let sIt = L3CN_CHAIKIN[Math.max(0, Math.min(3, Number(l3cn.smooth) | 0))]; const raw = (S.minor.length + S.major.length) / 5; while (sIt > 0 && raw * 2 ** sIt > 1100000) sIt--;   // rundningen får inte göra linjerna för många
  if (sIt) { S.minor = l3cnSmoothSegs(S.minor, G.cell, sIt); S.major = l3cnSmoothSegs(S.major, G.cell, sIt); }
  l3cn.grid = G; l3cn.segs = S; l3cn.rev++; l3cnPaintTint(); l3cn.info = `${S.levels.length} nivåer, intervall ${String(S.step).replace(".", ",")} m · ${((S.minor.length + S.major.length) / 5).toLocaleString("sv-SE")} linjestycken · ruta ${String(Math.round(G.cell * 100) / 100).replace(".", ",")} m · ${Math.round(performance.now() - t0)} ms`;
  l3cnDraw3d(); l3cnMapRefresh(); if (!quiet) l3Status("Höjdkurvor: " + l3cn.info);
}
/* Färgyta som bild (för minimapen) */
function l3cnPaintTint() {
  const G = l3cn.grid; if (!G) return; const cv = G.tint || (G.tint = document.createElement("canvas")); cv.width = G.nx; cv.height = G.ny; const c = cv.getContext("2d"), im = c.createImageData(G.nx, G.ny), d = im.data, span = Math.max(0.01, G.zmax - G.zmin);
  for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) { const v = G.z[i + j * G.nx], o = ((G.ny - 1 - j) * G.nx + i) * 4; if (v !== v) { d[o + 3] = 0; continue; } const col = l3cnRamp((v - G.zmin) / span); d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255; }
  c.putImageData(im, 0, 0);
}
/* ---- 3D ----------------------------------------------------------------------------------------------------------------- */
function l3cnClear() { if (l3cn.group) { l3.scene.remove(l3cn.group); l3cn.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); l3cn.group = null; } l3cn.grid = null; l3cn.segs = null; l3cn.rev++; l3cnMapRefresh(); if (typeof l3Render === "function") l3Render(); }
function l3cnDraw3d() {
  if (l3cn.group) { l3.scene.remove(l3cn.group); l3cn.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); l3cn.group = null; }
  const G = l3cn.grid, S = l3cn.segs; if (!G || !S || !l3cn.on || !l3cn.in3d) { l3.scene && l3Render(); return; }
  const O = l3.O, grp = new THREE.Group(), span = Math.max(0.01, G.zmax - G.zmin); grp.name = "contours";
  const mk = (arr, major) => { const n = arr.length / 5; if (!n) return; const pos = new Float32Array(n * 6), col = new Float32Array(n * 6);
    for (let k = 0; k < n; k++) { const L = arr[k * 5 + 4], c = l3cn.colorLines ? l3cnRamp((L - G.zmin) / span) : [20, 28, 45], f = major ? 0.72 : 1.0; for (let q = 0; q < 2; q++) { pos[k * 6 + q * 3] = arr[k * 5 + q * 2] - O[0]; pos[k * 6 + q * 3 + 1] = arr[k * 5 + q * 2 + 1] - O[1]; pos[k * 6 + q * 3 + 2] = L - O[2] + (major ? 0.07 : 0.05); col[k * 6 + q * 3] = c[0] / 255 * f; col[k * 6 + q * 3 + 1] = c[1] / 255 * f; col[k * 6 + q * 3 + 2] = c[2] / 255 * f; } }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: !major, opacity: major ? 1 : 0.85 })); l.renderOrder = 6; l.userData.noHit = true; l.raycast = () => {}; grp.add(l);
    if (major) { const l2 = l.clone(); l2.position.z += 0.04; l2.material = new THREE.LineBasicMaterial({ vertexColors: true }); l2.renderOrder = 7; l2.raycast = () => {}; grp.add(l2); } };
  mk(S.minor, false); mk(S.major, true);
  if (l3cn.tint && l3cn.tintOp > 0) { // färgyta
    const nx = G.nx, ny = G.ny, pos = new Float32Array(nx * ny * 3), col = new Float32Array(nx * ny * 3), idx = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = i + j * nx, v = G.z[k], c = v === v ? l3cnRamp((v - G.zmin) / span) : [0, 0, 0]; pos[k * 3] = G.x0 + i * G.cell - O[0]; pos[k * 3 + 1] = G.y0 + j * G.cell - O[1]; pos[k * 3 + 2] = (v === v ? v : G.zmin) - O[2] + 0.03; col[k * 3] = c[0] / 255; col[k * 3 + 1] = c[1] / 255; col[k * 3 + 2] = c[2] / 255; }
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const k = i + j * nx; if (G.z[k] !== G.z[k] || G.z[k + 1] !== G.z[k + 1] || G.z[k + nx] !== G.z[k + nx] || G.z[k + nx + 1] !== G.z[k + nx + 1]) continue; idx.push(k, k + 1, k + nx + 1, k, k + nx + 1, k + nx); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.setIndex(idx.length > 65535 * 3 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: l3cn.tintOp, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); m.renderOrder = 4; m.userData.noHit = true; m.raycast = () => {}; grp.add(m); }
  if (l3cn.labels && S.major.length) { // höjdsiffror på de kraftiga kurvorna (några per nivå)
    const byL = new Map(); for (let k = 0; k < S.major.length; k += 5) { const L = S.major[k + 4]; let a = byL.get(L); if (!a) byL.set(L, a = []); a.push(k); }
    let made = 0; byL.forEach((ks, L) => { const take = Math.min(3, Math.max(1, Math.floor(ks.length / 40))); for (let t = 0; t < take && made < 90; t++) { const k = ks[Math.floor((t + 0.5) / take * ks.length)], cv = document.createElement("canvas"), c = cv.getContext("2d"), txt = String(Math.round(L * 100) / 100).replace(".", ","); c.font = "600 28px system-ui, sans-serif"; const w = Math.ceil(c.measureText(txt).width) + 26, h = 44; cv.width = w; cv.height = h; c.font = "600 28px system-ui, sans-serif"; c.textBaseline = "middle"; c.textAlign = "center";
      c.shadowColor = "rgba(15,23,42,.35)"; c.shadowBlur = 6; c.shadowOffsetY = 2; c.fillStyle = "rgba(255,255,255,.86)"; c.beginPath(); if (c.roundRect) c.roundRect(3, 3, w - 6, h - 8, (h - 8) / 2); else c.rect(3, 3, w - 6, h - 8); c.fill(); c.shadowColor = "transparent";
      c.strokeStyle = "rgba(37,99,235,.55)"; c.lineWidth = 2; c.stroke(); c.lineJoin = "round"; c.lineWidth = 5; c.strokeStyle = "rgba(255,255,255,.9)"; c.strokeText(txt, w / 2, h / 2 - 2); c.fillStyle = "#12305f"; c.fillText(txt, w / 2, h / 2 - 2);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: true, sizeAttenuation: false })); sp.scale.set(0.026 * w / 44, 0.026, 1); sp.material.map.anisotropy = 8; sp.material.depthWrite = false; sp.position.set((S.major[k] + S.major[k + 2]) / 2 - O[0], (S.major[k + 1] + S.major[k + 3]) / 2 - O[1], L - O[2] + 0.3); sp.renderOrder = 8; sp.userData.noHit = true; sp.raycast = () => {}; grp.add(sp); made++; } }); }
  l3.scene.add(grp); l3cn.group = grp; l3Render();
}
/* ---- Minimapen: färgyta + kurvor ritas i bakgrundslagret (när vyn ändras) --------------------------------------------- */
function l3cnMapRefresh() { if (typeof l3sp !== "undefined") { l3sp.key = ""; l3sp.baseKey = ""; l3sp.mapRev = (l3sp.mapRev || 0) + 1; } }
function l3cnDrawMap(b, r) {
  if (!l3cn.on || !l3cn.inMap || !l3cn.grid || !l3cn.segs || typeof l3spToScr !== "function") return; const G = l3cn.grid, S = l3cn.segs, span = Math.max(0.01, G.zmax - G.zmin);
  b.save();
  if (l3cn.tint && G.tint && l3cn.tintOp > 0) { // färgytans bild: world → skärm som affin matris
    const [ax, ay] = l3spToScr(G.x0, G.y0 + (G.ny - 1) * G.cell), [bx, by] = l3spToScr(G.x0 + (G.nx - 1) * G.cell, G.y0 + (G.ny - 1) * G.cell), [cx, cy] = l3spToScr(G.x0, G.y0), w = G.nx - 1, h = G.ny - 1;
    b.setTransform(((bx - ax) / w) * (b.canvas.width / r.width || 1), ((by - ay) / w) * (b.canvas.width / r.width || 1), ((cx - ax) / h) * (b.canvas.width / r.width || 1), ((cy - ay) / h) * (b.canvas.width / r.width || 1), ax * (b.canvas.width / r.width || 1), ay * (b.canvas.width / r.width || 1)); b.globalAlpha = l3cn.tintOp; b.imageSmoothingEnabled = true; b.drawImage(G.tint, 0, 0); b.globalAlpha = 1;
  }
  b.restore(); b.save(); const dpr = b.canvas.width / r.width || 1; b.setTransform(dpr, 0, 0, dpr, 0, 0); b.lineCap = "round";
  const draw = (arr, major) => { const n = arr.length / 5; if (!n) return; if (l3cn.colorLines) { // färg per nivå – gruppera per nivå för färre strokes
      const by = new Map(); for (let k = 0; k < n; k++) { const L = arr[k * 5 + 4]; let a = by.get(L); if (!a) by.set(L, a = []); a.push(k); }
      by.forEach((ks, L) => { const c = l3cnRamp((L - G.zmin) / span); b.strokeStyle = `rgb(${c[0] * 0.55 | 0},${c[1] * 0.55 | 0},${c[2] * 0.55 | 0})`; b.lineWidth = major ? 1.8 : 0.8; b.beginPath(); ks.forEach(k => { const p = l3spToScr(arr[k * 5], arr[k * 5 + 1]), q = l3spToScr(arr[k * 5 + 2], arr[k * 5 + 3]); b.moveTo(p[0], p[1]); b.lineTo(q[0], q[1]); }); b.stroke(); });
    } else { b.strokeStyle = major ? "#0f172a" : "rgba(15,23,42,.6)"; b.lineWidth = major ? 1.8 : 0.8; b.beginPath(); for (let k = 0; k < n; k++) { const p = l3spToScr(arr[k * 5], arr[k * 5 + 1]), q = l3spToScr(arr[k * 5 + 2], arr[k * 5 + 3]); b.moveTo(p[0], p[1]); b.lineTo(q[0], q[1]); } b.stroke(); } };
  draw(S.minor, false); draw(S.major, true);
  if (l3cn.labels && S.major.length) { b.font = "600 10.5px system-ui, sans-serif"; b.textAlign = "center"; const seen = new Map(); for (let k = 0; k < S.major.length; k += 5) { const L = S.major[k + 4], c = (seen.get(L) || 0); seen.set(L, c + 1); if (c % 60 !== 30) continue; const p = l3spToScr((S.major[k] + S.major[k + 2]) / 2, (S.major[k + 1] + S.major[k + 3]) / 2); if (p[0] < 0 || p[1] < 0 || p[0] > r.width || p[1] > r.height) continue; const txt = String(Math.round(L * 100) / 100).replace(".", ","), w = b.measureText(txt).width + 8; b.save(); b.shadowColor = "rgba(15,23,42,.3)"; b.shadowBlur = 4; b.fillStyle = "rgba(255,255,255,.86)"; b.beginPath(); if (b.roundRect) b.roundRect(p[0] - w / 2, p[1] - 8, w, 16, 8); else b.rect(p[0] - w / 2, p[1] - 8, w, 16); b.fill(); b.restore(); b.strokeStyle = "rgba(37,99,235,.5)"; b.lineWidth = 1; b.stroke(); b.lineJoin = "round"; b.lineWidth = 3; b.strokeStyle = "rgba(255,255,255,.9)"; b.strokeText(txt, p[0], p[1] + 4); b.fillStyle = "#12305f"; b.fillText(txt, p[0], p[1] + 4); } }
  b.restore();
}
/* ---- DXF ----------------------------------------------------------------------------------------------------------------- */
function l3cnDxfText() {
  const S = l3cn.segs, G = l3cn.grid; if (!S || !G) return ""; const num = v => (Math.round(v * 1000) / 1000).toFixed(3), body = [], layers = new Map(), asc = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "?");
  const emit = (arr, layer, aci) => { layers.set(layer, aci); const by = new Map(); for (let k = 0; k < arr.length; k += 5) { const L = arr[k + 4]; let a = by.get(L); if (!a) by.set(L, a = []); a.push(arr[k], arr[k + 1], arr[k + 2], arr[k + 3]); }
    by.forEach((segs, L) => { const polys = typeof l3pfChain === "function" ? l3pfChain(Float32Array.from(segs)) : null;
      if (polys) polys.forEach(p => { if (p.pts.length < 2) return; body.push("0", "POLYLINE", "8", layer, "66", "1", "70", String((p.closed ? 1 : 0) + 8)); p.pts.forEach(q => body.push("0", "VERTEX", "8", layer, "10", num(q[0]), "20", num(q[1]), "30", num(L), "70", "32")); body.push("0", "SEQEND", "8", layer);
        if (layer === "HOJDKURVA_KRAFTIG" && p.pts.length > 12) { const m = p.pts[p.pts.length >> 1]; body.push("0", "TEXT", "8", "HOJDKURVA_TEXT", "10", num(m[0]), "20", num(m[1]), "30", num(L), "40", "1.2", "1", asc(String(Math.round(L * 100) / 100))); layers.set("HOJDKURVA_TEXT", 7); } });
      else for (let q = 0; q < segs.length; q += 4) body.push("0", "LINE", "8", layer, "10", num(segs[q]), "20", num(segs[q + 1]), "30", num(L), "11", num(segs[q + 2]), "21", num(segs[q + 3]), "31", num(L)); }); };
  emit(S.minor, "HOJDKURVA_TUNN", 8); emit(S.major, "HOJDKURVA_KRAFTIG", 7);
  const o = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "9", "$INSUNITS", "70", "6", "0", "ENDSEC", "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", String(layers.size)];
  layers.forEach((aci, name) => o.push("0", "LAYER", "2", name, "70", "0", "62", String(aci), "6", "CONTINUOUS")); o.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", ...body, "0", "ENDSEC", "0", "EOF"); return o.join("\n");
}
function l3cnDxf() { const t = l3cnDxfText(); if (!t) { l3Status("Räkna kurvorna först.", true); return; } const a = document.createElement("a"), d = new Date(), p = x => String(x).padStart(2, "0"); a.href = URL.createObjectURL(new Blob([t], { type: "application/dxf" })); a.download = `Hojdkurvor ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} kl ${p(d.getHours())}.${p(d.getMinutes())}.dxf`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); l3Toast("Höjdkurvorna (DXF, 3D-polylinjer med höjd) nedladdade."); }
/* ---- Panel (i punktmolnsverktygen) ------------------------------------------------------------------------------------- */
function l3cnHtml() {
  const opt = (v, l) => `<option value="${v}" ${Number(l3cn.int) === v ? "selected" : ""}>${l}</option>`, ck = (k, lab, tip) => `<label class="f" title="${tip}"><span>${lab}</span><input type="checkbox" data-cn="${k}" ${l3cn[k] ? "checked" : ""} style="width:auto"></label>`;
  return `<div class="t">Höjdkurvor och färg efter höjd ur de tända punktmolnen – i 3D-vyn och i minimapen.</div>
  <div class="r"><button type="button" class="p" data-cnb="calc">${l3cn.on && l3cn.grid ? "Räkna om" : "Visa höjdkurvor"}</button><button type="button" data-cnb="off" ${l3cn.on ? "" : "disabled"}>Dölj</button></div>
  <label class="f"><span>Intervall</span><select data-cn="int">${[[0, "Auto"], [0.1, "0,1 m"], [0.25, "0,25 m"], [0.5, "0,5 m"], [1, "1 m"], [2, "2 m"], [5, "5 m"], [10, "10 m"]].map(([v, l]) => opt(v, l)).join("")}</select></label>
  <label class="f"><span>Kraftig var</span><select data-cn="major">${[2, 4, 5, 10].map(v => `<option value="${v}" ${Number(l3cn.major) === v ? "selected" : ""}>${v}:e kurva</option>`).join("")}</select></label>
  <label class="f"><span>Yta</span><select data-cn="mode"><option value="max" ${l3cn.mode === "max" ? "selected" : ""}>Övre (topp)</option><option value="mean" ${l3cn.mode === "mean" ? "selected" : ""}>Medel</option><option value="min" ${l3cn.mode === "min" ? "selected" : ""}>Nedre (mark)</option></select></label>
  ${ck("colorLines", "Färg på linjerna", "Linjerna får höjdfärg (blått lågt → rött högt) – annars mörka")}${ck("tint", "Färgyta", "Genomskinlig höjdfärg över ytan")}
  <label class="f" title="Hur mjukt kurvorna rundas av: Av = rå, Kraftig = mycket jämna"><span>Jämnhet</span><select data-cn="smooth">${[[0, "Av"], [1, "Lätt"], [2, "Normal"], [3, "Kraftig"]].map(([v, l]) => `<option value="${v}" ${(Number(l3cn.smooth) | 0) === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
  <label class="f"><span>Färgytans styrka</span><input type="range" min="0.1" max="0.9" step="0.05" data-cn="tintOp" value="${l3cn.tintOp}" style="width:110px"></label>
  ${ck("labels", "Höjdsiffror", "Siffror på de kraftiga kurvorna")}${ck("in3d", "Visa i 3D-vyn", "")}${ck("inMap", "Visa i minimapen", "")}
  <div class="r"><button type="button" data-cnb="dxf" ${l3cn.segs ? "" : "disabled"}>Exportera DXF (3D-polylinjer)</button></div><div class="t" data-cninfo>${l3ptEsc ? l3ptEsc(l3cn.info || "") : l3cn.info}</div>`;
}
function l3cnBind(el) {
  if (el._cnBound) return; el._cnBound = true;
  el.addEventListener("click", e => { const b = e.target.closest("[data-cnb]"); if (!b) return; const a = b.dataset.cnb; if (a === "calc") { l3cn.on = true; l3cnSave(); l3Busy && l3Busy(true); setTimeout(() => { try { l3cnCompute(); } finally { l3Busy && l3Busy(false); if (typeof l3ptRender === "function") l3ptRender(); } }, 20); } else if (a === "off") { l3cn.on = false; l3cnSave(); l3cnClear(); l3cnDraw3d(); if (typeof l3ptRender === "function") l3ptRender(); } else if (a === "dxf") l3cnDxf(); });
  el.addEventListener("change", e => { const t = e.target.closest("[data-cn]"); if (!t) return; const k = t.dataset.cn, v = t.type === "checkbox" ? t.checked : t.type === "range" ? Number(t.value) : (k === "mode" ? t.value : Number(t.value)); l3cn[k] = v; l3cnSave();
    if (["int", "major", "mode", "smooth"].includes(k)) { if (l3cn.on) { l3Busy && l3Busy(true); setTimeout(() => { try { l3cnCompute(true); } finally { l3Busy && l3Busy(false); if (typeof l3ptRender === "function") l3ptRender(); } }, 20); } } else { l3cnDraw3d(); l3cnMapRefresh(); } });
  el.addEventListener("input", e => { const t = e.target.closest('[data-cn="tintOp"]'); if (!t) return; l3cn.tintOp = Number(t.value); l3cnDraw3d(); l3cnMapRefresh(); });
}
