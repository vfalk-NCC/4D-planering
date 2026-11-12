/* Rutnät / axlar (Victor 2026-11-12: "väldigt snygga innovativa gridlinjer … lätt att ändra färger, tjocklek, synlighet och ett väldigt smart sätt att skapa det").
   Knappen Rutnät i övre raden: lista med alla rutnät (tänd/släck, färg, redigera, zooma, ta bort) och ＋ Nytt rutnät.
   Smart skapande: placera med två tryck (origo + riktning) eller ”Från markerat objekt” (passar objektets utsträckning och vridning), skriv avstånden som
   ”5x6; 7,2; 3x4” (5 fack à 6 m, ett på 7,2 m, 3 à 4 m) – förhandsvisning direkt i 3D – och välj etiketter (1,2,3 / A,B,C, valfri start).
   Utseende: färg, tjocklek (cm), opacitet, linjetyp (heldragen/streckad/prickad/streckprick), cirklar med etiketter i ändarna, höjd, ovanpå allt.
   Delas i projektet (plan_grids.json). Linjerna ritas som tunna band i marknivå (tjockleken är verklig bredd). Prefix l3gd. */
const l3gd = { dims: [], vis: [], hover: null, list: [], loaded: false, loading: null, pid: null, group: null, host: null, edit: null, items: [] };
const l3gdPath = () => `projects/${encodeURIComponent(projectId)}/plan_grids.json`;
const l3gdOk = () => typeof projectId !== "undefined" && projectId && typeof ghReadJSON === "function" && typeof token !== "undefined" && token;
const l3gdDef = () => ({ id: ghNewId(), name: "", x: 0, y: 0, z: 0, rot: 0, xsT: "4x6", ysT: "3x6", xl: "num", yl: "abc", xs0: "1", ys0: "A", ext: 3, color: "#2f7bff", w: 0.2, op: 90, dash: "solid", bub: "both", bsz: 28, vis: true, top: false, edge: true, dims: false, hov: true, sub: 0 });
/* ---- Tolkning ---- */
function l3gdParse(t) {   // "5x6; 7,2; 3x4" → [0, 6, 12, ...]
  const pos = [0]; let ok = true;
  String(t || "").split(/[;\s]+/).filter(Boolean).forEach(tok => {
    const m = /^(?:(\d+)\s*[x×*]\s*)?(\d+(?:[.,]\d+)?)$/i.exec(tok); if (!m) { ok = false; return; }
    const n = m[1] ? Math.min(200, Number(m[1])) : 1, d = Number(m[2].replace(",", ".")); if (!(d > 0)) { ok = false; return; }
    for (let i = 0; i < n; i++) pos.push(Math.round((pos[pos.length - 1] + d) * 1000) / 1000);
  });
  return { pos, ok: ok && pos.length > 1 };
}
const l3gdAbc = n => { let s = ""; n++; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const l3gdAbcIdx = s => String(s || "A").toUpperCase().split("").reduce((a, c) => a * 26 + (c.charCodeAt(0) - 64), 0) - 1;
function l3gdLabels(kind, start, n) {
  if (kind === "abc") { const b = Math.max(0, l3gdAbcIdx(start)); return Array.from({ length: n }, (_, i) => l3gdAbc(b + i)); }
  const b = Number.isFinite(Number(start)) ? Number(start) : 1; return Array.from({ length: n }, (_, i) => String(b + i));
}
function l3gdLines(g) {   // lokala koordinater: lodräta linjer (x = konstant, numrerade) och vågräta (y = konstant, bokstäver)
  const X = l3gdParse(g.xsT), Y = l3gdParse(g.ysT), xs = X.pos, ys = Y.pos, e = Math.max(0, Number(g.ext) || 0), x0 = xs[0] - e, x1 = xs[xs.length - 1] + e, y0 = ys[0] - e, y1 = ys[ys.length - 1] + e;
  const xl = l3gdLabels(g.xl, g.xs0, xs.length), yl = l3gdLabels(g.yl, g.ys0, ys.length), out = [];
  xs.forEach((x, i) => out.push({ a: [x, y0], b: [x, y1], label: xl[i] })); ys.forEach((y, j) => out.push({ a: [x0, y], b: [x1, y], label: yl[j] }));
  return { lines: out, ok: X.ok && Y.ok, W: xs[xs.length - 1], H: ys[ys.length - 1] };
}
const l3gdW = (g, p) => { const c = Math.cos(g.rot * Math.PI / 180), s = Math.sin(g.rot * Math.PI / 180); return [g.x + p[0] * c - p[1] * s, g.y + p[0] * s + p[1] * c]; };
/* ---- Ritning ---- */
function l3gdDashes(len, w, kind) {
  if (kind === "solid") return [[0, len]];
  const d = Math.max(0.6, w * 8), dot = Math.max(0.15, w * 1.2), pat = kind === "dash" ? [d, d * 0.5] : kind === "dot" ? [dot, dot * 1.6] : [d, d * 0.4, dot, d * 0.4], out = []; let t = 0, i = 0;
  while (t < len) { const L = pat[i % pat.length]; if (i % 2 === 0) out.push([t, Math.min(len, t + L)]); t += L; i++; }
  return out;
}
function l3gdQuads(g, segs, w, dash) {   // segs: [[A, B]] i världskoordinater → trianglar (band i marknivå)
  const P = [], O = l3.O, z = g.z - O[2] + 0.03, hw = Math.max(0.004, w / 2);
  segs.forEach(([A, B]) => {
    const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, nx = -uy * hw, ny = ux * hw;
    l3gdDashes(len, w, dash).forEach(([s0, e0]) => { const a = [A[0] + ux * s0 - O[0], A[1] + uy * s0 - O[1]], b = [A[0] + ux * e0 - O[0], A[1] + uy * e0 - O[1]]; P.push(a[0] + nx, a[1] + ny, z, a[0] - nx, a[1] - ny, z, b[0] - nx, b[1] - ny, z, a[0] + nx, a[1] + ny, z, b[0] - nx, b[1] - ny, z, b[0] + nx, b[1] + ny, z); });
  });
  return P;
}
function l3gdMesh(g, P, op) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: g.color, transparent: true, opacity: Math.max(0.03, Math.min(1, op / 100)), side: THREE.DoubleSide, depthWrite: false, depthTest: !g.top, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.frustumCulled = false; m.renderOrder = g.top ? 9 : 4; m.userData.noHit = true; m.userData.noIfc = true; m.raycast = () => {}; return m;
}
function l3gdBuild(g) {
  const { lines } = l3gdLines(g), grp = new THREE.Group(), seg = L => [l3gdW(g, L.a), l3gdW(g, L.b)];
  grp.add(l3gdMesh(g, l3gdQuads(g, lines.map(seg), g.w, g.dash), g.op));
  const sub = Number(g.sub) || 0;   // hjälplinjer (delrutnät): tunna, svaga linjer var sub:e meter inne i rutnätet
  if (sub >= 0.1) {
    const X = l3gdParse(g.xsT).pos, Y = l3gdParse(g.ysT).pos, e = Math.max(0, Number(g.ext) || 0), segs = [], x0 = X[0] - e, x1 = X[X.length - 1] + e, y0 = Y[0] - e, y1 = Y[Y.length - 1] + e;
    const main = new Set([...X.map(x => Math.round(x * 1000)), ...Y.map(y => Math.round(y * 1000))]);
    for (let x = X[0] + sub, n = 0; x < X[X.length - 1] - 1e-6 && n < 300; x += sub, n++) if (!main.has(Math.round(x * 1000))) segs.push([l3gdW(g, [x, y0]), l3gdW(g, [x, y1])]);
    for (let y = Y[0] + sub, n = 0; y < Y[Y.length - 1] - 1e-6 && n < 300; y += sub, n++) if (!main.has(Math.round(y * 1000))) segs.push([l3gdW(g, [x0, y]), l3gdW(g, [x1, y])]);
    if (segs.length) grp.add(l3gdMesh(g, l3gdQuads(g, segs, Math.max(0.01, g.w * 0.35), "solid"), g.op * 0.45));
  }
  grp.userData.noHit = true; return grp;
}
function l3gdAll() { const d = l3gd.edit; return d ? [...l3gd.list.filter(x => x.id !== d.id), d] : l3gd.list; }
function l3gdDraw() {
  if (!l3 || !l3.scene) return;
  if (!l3gd.group) { l3gd.group = new THREE.Group(); l3gd.group.name = "rutnat"; l3.scene.add(l3gd.group); }
  l3Clear(l3gd.group); l3gd.items = []; l3gd.dims = []; l3gd.vis = [];
  const all = l3Prefs().gdAll !== false;
  l3gdAll().forEach(g => {
    if (!g.vis || (!all && !(l3gd.edit && l3gd.edit.id === g.id))) return;
    l3gd.group.add(l3gdBuild(g)); l3gd.vis.push(g);
    if (g.bub !== "off") { const { lines } = l3gdLines(g); lines.forEach(L => { const ends = g.bub === "start" ? [L.a] : [L.b, L.a]; if (g.bub === "end") ends.splice(1); ends.forEach(p => { const w = l3gdW(g, p), dir = [L.a, L.b], u = (() => { const q = l3gdW(g, L.b), r = l3gdW(g, L.a), l = Math.hypot(q[0] - r[0], q[1] - r[1]) || 1; return [(q[0] - r[0]) / l, (q[1] - r[1]) / l]; })(), sgn = p === L.a ? -1 : 1, off = (Number(g.bsz) || 28) * 0.0; void dir; void off; l3gd.items.push({ g, label: L.label, v: new THREE.Vector3(w[0] + sgn * u[0] * 0.0 - l3.O[0], w[1] + sgn * u[1] * 0.0 - l3.O[1], g.z - l3.O[2] + 0.05), u: [sgn * u[0], sgn * u[1]] }); }); }); }
    if (g.dims) {   // måttkedja: avstånden mellan linjerna längs rutnätets nedre och vänstra kant
      const X = l3gdParse(g.xsT).pos, Y = l3gdParse(g.ysT).pos, e = Math.max(0, Number(g.ext) || 0), zz = g.z - l3.O[2] + 0.05, f = v => v.toFixed(2).replace(".", ","), at = (lx, ly) => { const w = l3gdW(g, [lx, ly]); return new THREE.Vector3(w[0] - l3.O[0], w[1] - l3.O[1], zz); };
      for (let i = 0; i + 1 < X.length; i++) l3gd.dims.push({ g, text: f(X[i + 1] - X[i]), v: at((X[i] + X[i + 1]) / 2, Y[0] - e * 0.5) });
      for (let j = 0; j + 1 < Y.length; j++) l3gd.dims.push({ g, text: f(Y[j + 1] - Y[j]), v: at(X[0] - e * 0.5, (Y[j] + Y[j + 1]) / 2) });
    }
  });
  l3Render();
}
function l3gdPlace() {   // cirklar, kantetiketter, mått och pekarens position – följer kameran
  if (l3gd.loaded === false && !l3gd.loading) l3gdLoad(); if (l3gd.group && l3gd.group.parent !== l3.scene) { l3gd.group = null; l3gdDraw(); }
  if (!l3gd.host) { const c = document.getElementById("v3Canvas"); if (!c) return; l3gd.host = document.createElement("div"); l3gd.host.id = "v3GridLabels"; l3gd.host.className = "v3-gd-host"; c.appendChild(l3gd.host); l3gd.nodes = []; l3gdHoverInit(); }
  const host = l3gd.host, nodes = l3gd.nodes, r = l3.renderer.domElement.getBoundingClientRect(), cv = host.parentElement.getBoundingClientRect(), ox = r.left - cv.left, oy = r.top - cv.top, W = r.width, H = r.height;
  const list = [];   // { x, y, text, cls, col, sz }
  l3gd.items.forEach(it => { const p = it.v.clone().project(l3.camera), g = it.g; if (p.z > 1 || p.x < -1.1 || p.x > 1.1 || p.y < -1.1 || p.y > 1.1) return; const sz = Number(g.bsz) || 28, o = it.v.clone().add(new THREE.Vector3(it.u[0], it.u[1], 0)).project(l3.camera); let dx = (o.x - p.x) * W, dy = -(o.y - p.y) * H; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl; list.push({ x: (p.x + 1) / 2 * W + dx * sz * 0.62, y: (1 - p.y) / 2 * H + dy * sz * 0.62, text: it.label, cls: "v3-gd-b", col: g.color, sz }); });
  // Kantetiketter: när en linjes ände ligger utanför bilden (inzoomat) hamnar dess etikett vid bildkanten, så man ser var man är
  l3gdAllActive().forEach(g => {
    if (g.edge === false) return; const { lines } = l3gdLines(g), zz = g.z - l3.O[2] + 0.03, sz = Math.max(18, Math.round((Number(g.bsz) || 28) * 0.7)), m = sz / 2 + 4;
    lines.forEach(L => {
      const A = l3gdW(g, L.a), B = l3gdW(g, L.b), pa = new THREE.Vector3(A[0] - l3.O[0], A[1] - l3.O[1], zz).project(l3.camera), pb = new THREE.Vector3(B[0] - l3.O[0], B[1] - l3.O[1], zz).project(l3.camera); if (pa.z > 1 || pb.z > 1) return;
      const a = [(pa.x + 1) / 2 * W, (1 - pa.y) / 2 * H], b = [(pb.x + 1) / 2 * W, (1 - pb.y) / 2 * H], inside = q => q[0] >= m && q[0] <= W - m && q[1] >= m && q[1] <= H - m;
      const dx = b[0] - a[0], dy = b[1] - a[1]; let t0 = 0, t1 = 1;   // Liang–Barsky mot bildrutan
      [[-dx, a[0] - m], [dx, W - m - a[0]], [-dy, a[1] - m], [dy, H - m - a[1]]].forEach(([pp, qq]) => { if (Math.abs(pp) < 1e-9) { if (qq < 0) t1 = -1; } else { const t = qq / pp; if (pp < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t); } });
      if (t0 >= t1) return;
      if (!inside(a)) list.push({ x: a[0] + dx * t0, y: a[1] + dy * t0, text: L.label, cls: "v3-gd-e", col: g.color, sz });
      if (!inside(b)) list.push({ x: a[0] + dx * t1, y: a[1] + dy * t1, text: L.label, cls: "v3-gd-e", col: g.color, sz });
    });
  });
  l3gd.dims.forEach(d => { if (d.g.edge === false && false) return; const p = d.v.clone().project(l3.camera); if (p.z > 1 || p.x < -1 || p.x > 1 || p.y < -1 || p.y > 1) return; list.push({ x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H, text: d.text, cls: "v3-gd-d", col: d.g.color, sz: 0 }); });
  if (l3gd.hover) list.push({ x: l3gd.hover.x + 16, y: l3gd.hover.y + 18, text: l3gd.hover.text, cls: "v3-gd-h", col: l3gd.hover.col, sz: 0 });
  while (nodes.length < list.length) { const e = document.createElement("div"); host.appendChild(e); nodes.push(e); }
  nodes.forEach((e, i) => {
    const it = list[i]; if (!it) { if (e.style.display !== "none") e.style.display = "none"; return; }
    const cls = it.cls; if (e.className !== cls) e.className = cls; e.style.display = "flex"; e.style.borderColor = it.col; e.style.color = it.col;
    if (it.sz) { e.style.width = e.style.height = it.sz + "px"; e.style.fontSize = Math.round(it.sz * (cls === "v3-gd-e" ? 0.5 : 0.46)) + "px"; e.style.transform = `translate(${it.x + ox - it.sz / 2}px, ${it.y + oy - it.sz / 2}px)`; }
    else { e.style.width = e.style.height = ""; e.style.fontSize = ""; e.style.transform = cls === "v3-gd-h" ? `translate(${it.x + ox}px, ${it.y + oy}px)` : `translate(${it.x + ox}px, ${it.y + oy}px) translate(-50%, -50%)`; }
    if (e.textContent !== it.text) e.textContent = it.text;
  });
}
const l3gdAllActive = () => (l3Prefs().gdAll === false ? l3gdAll().filter(g => g.vis && l3gd.edit && l3gd.edit.id === g.id) : l3gdAll().filter(g => g.vis));
/* Pekarens position i rutnätet (Visa position vid pekaren): "C–4  +1,25 / −0,40 m" från närmaste korsning. */
function l3gdHoverInit() {
  const el = l3.renderer.domElement; let raf = 0, ev = null;
  el.addEventListener("pointermove", e => { ev = e; if (raf) return; raf = requestAnimationFrame(() => { raf = 0; l3gdHoverCalc(ev); }); });
  el.addEventListener("pointerleave", () => { if (l3gd.hover) { l3gd.hover = null; l3Render(); } });
}
function l3gdHoverCalc(e) {
  const gs = l3gdAllActive().filter(g => g.hov !== false); let out = null;
  if (gs.length && !(e.buttons)) {
    const ray = l3MouseRay(e), O = l3.O, r = l3Rect();
    for (const g of gs) {
      const P = new THREE.Vector3(); if (!ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -(g.z - O[2] + 0.03)), P)) continue;
      const [lx, ly] = l3gdLocal(g, P.x + O[0], P.y + O[1]), X = l3gdParse(g.xsT).pos, Y = l3gdParse(g.ysT).pos, ex = Math.max(0, Number(g.ext) || 0);
      if (lx < X[0] - ex || lx > X[X.length - 1] + ex || ly < Y[0] - ex || ly > Y[Y.length - 1] + ex) continue;
      const near = (A, v) => A.reduce((bi, a, i) => (Math.abs(a - v) < Math.abs(A[bi] - v) ? i : bi), 0), i = near(X, lx), j = near(Y, ly), xl = l3gdLabels(g.xl, g.xs0, X.length), yl = l3gdLabels(g.yl, g.ys0, Y.length), f = v => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2).replace(".", ",");
      out = { x: e.clientX - r.left, y: e.clientY - r.top, col: g.color, text: `${yl[j]}–${xl[i]}  ${f(lx - X[i])} / ${f(ly - Y[j])} m` }; break;
    }
  }
  const was = l3gd.hover; l3gd.hover = out; if (out || was) l3Render();
}
const l3gdLocal = (g, X, Y) => { const dx = X - g.x, dy = Y - g.y, c = Math.cos(-g.rot * Math.PI / 180), s = Math.sin(-g.rot * Math.PI / 180); return [dx * c - dy * s, dx * s + dy * c]; };
/* Fäst mot rutnätet (Fäst mot-menyn): korsningar och längs linjerna. Korsningar vinner inom 14 px, linjen inom 10 px och bara när inget starkare fäste finns. */
function l3gdSnapAt(e, S) {
  const gs = l3gdAllActive(); if (!gs.length || (!S.gridx && !S.gridl)) return null;
  const r = l3Rect(), mx = e.clientX - r.left, my = e.clientY - r.top, O = l3.O, ray = l3MouseRay(e); let bx = null, bl = null;
  gs.forEach(g => {
    const zs = g.z - O[2] + 0.03, X = l3gdParse(g.xsT).pos, Y = l3gdParse(g.ysT).pos, xl = l3gdLabels(g.xl, g.xs0, X.length), yl = l3gdLabels(g.yl, g.ys0, Y.length);
    if (S.gridx) X.forEach((x, i) => Y.forEach((y, j) => { const w = l3gdW(g, [x, y]), v = new THREE.Vector3(w[0] - O[0], w[1] - O[1], zs), q = l3ToScreen(v); if (q.behind) return; const d = Math.hypot(q.x - mx, q.y - my); if (d < 14 && (!bx || d < bx.d)) bx = { d, v, label: `Rutnät ${yl[j]}–${xl[i]}` }; }));
    if (S.gridl) { const P = new THREE.Vector3(); if (!ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -zs), P)) return; l3gdLines(g).lines.forEach(L => {
      const A = l3gdW(g, L.a), B = l3gdW(g, L.b), a = new THREE.Vector3(A[0] - O[0], A[1] - O[1], zs), ab = new THREE.Vector3(B[0] - O[0], B[1] - O[1], zs).sub(a), t = Math.max(0, Math.min(1, P.clone().sub(a).dot(ab) / (ab.lengthSq() || 1))), q3 = a.clone().add(ab.multiplyScalar(t)), q = l3ToScreen(q3);
      if (q.behind) return; const d = Math.hypot(q.x - mx, q.y - my); if (d < 10 && (!bl || d < bl.d)) bl = { d, v: q3, label: `På rutnätslinje ${L.label}` }; }); }
  });
  if (bx) return { point: bx.v, kind: "gridx", label: bx.label, placeId: null };
  return bl ? { point: bl.v, kind: "gridl", label: bl.label, placeId: null } : null;
}
(() => { window.addEventListener("load", () => { const f = window.l3Snap; if (typeof f !== "function" || f._gd) return; const w = function () { const s = f.apply(this, arguments), g = l3gdSnapAt(arguments[0], l3Snaps()); if (!g) return s; if (g.kind === "gridx" || !s || ["face", "ground", "grid"].includes(s.kind)) return g; return s; }; w._gd = true; window.l3Snap = w; }); })();
/* ---- Lagring ---- */
async function l3gdLoad() {
  if (!l3gdOk()) { l3gd.loaded = true; return; }
  if (l3gd.pid !== projectId) { l3gd.pid = projectId; l3gd.loaded = false; l3gd.loading = null; l3gd.list = []; }
  if (l3gd.loaded) return; if (!l3gd.loading) l3gd.loading = ghReadJSON(token, l3gdPath()).then(r => { l3gd.list = r.filter(x => x && x.id).map(x => ({ ...l3gdDef(), ...x })); }, e => console.warn("Kunde inte läsa plan_grids.json", e)).then(() => { l3gd.loaded = true; l3gdDraw(); l3gdRenderDlg(); if (typeof l3OrigPopRender === "function") l3OrigPopRender(); });
  return l3gd.loading;
}
async function l3gdSave(g, del) {
  if (!l3gdOk()) return;
  try { await ghWriteJSON(token, l3gdPath(), arr => { const out = (Array.isArray(arr) ? arr : []).filter(x => x && x.id !== g.id); if (!del) out.push(g); return out; }, `Rutnät: ${g.name || g.id}${del ? " borttaget" : ""}`); }
  catch (e) { l3Status("Kunde inte spara rutnätet i projektet: " + e.message, true); }
}
/* ---- Dialog ---- */
const L3GD_ICO = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16M4 15h16M9 4v16M15 4v16"/></svg>';
function l3gdOpen() { l3gdLoad(); l3gdRenderDlg(true); }
function l3gdRenderDlg(open) {
  const was = document.getElementById("v3GridDlg"); if (!open && (!was || was.classList.contains("hidden"))) return; const E = escHtml;
  const d = l3gd.edit, all = l3Prefs().gdAll !== false;
  const sw = (id, on, t) => `<label class="v3-lay-sw v3-lf-sw" title="${t}"><input type="checkbox" role="switch" data-gdv="${id}" ${on ? "checked" : ""} /><i></i></label>`;
  const listHtml = `<div class="v3-gd-top"><span>Alla rutnät</span>${sw("__all", all, "Visa/dölj alla rutnät")}</div>
    ${l3gd.list.map(g => `<div class="v3-lf v3-pill v3-gd-row"><span class="v3-gd-dot" style="background:${E(g.color)}"></span><button type="button" class="v3-pal-g v3-nochev" data-gdedit="${E(g.id)}" title="Redigera"><span>${E(g.name || "Rutnät")}</span><em>${l3gdLines(g).lines.length}</em></button><input type="color" value="${E(g.color)}" data-gdcol="${E(g.id)}" title="Färg" />${sw(g.id, g.vis, "Visa/dölj")}<button type="button" class="v3-lf-ic v3-gd-ic" data-gdgo="${E(g.id)}" title="Zooma hit">⌖</button><button type="button" class="v3-lf-ic v3-gd-ic" data-gddel="${E(g.id)}" title="Ta bort">✕</button></div>`).join("") || `<div class="v3-pal-hint">Inga rutnät ännu.</div>`}
    <button type="button" class="v3-wide v3-primary" data-gdnew>＋ Nytt rutnät</button>`;
  let body = listHtml;
  if (d) {
    const S = l3gdLines(d), f = (k, lab, ex = "") => `<label class="v3-field"><span>${lab}</span><input type="text" data-gdf="${k}" value="${E(d[k])}" ${ex} /></label>`;
    const sel = (k, opts) => `<select data-gdf="${k}">${opts.map(([v, t]) => `<option value="${v}" ${d[k] === v ? "selected" : ""}>${t}</option>`).join("")}</select>`;
    body = `<div class="v3-gd-sec">Placering</div>
      <div class="v3-gd-btns"><button type="button" data-gdpick title="Tryck origo och sedan en punkt i X-riktningen">⌖ Två tryck</button><button type="button" data-gdsel title="Passar rutnätet till markerat objekt (läge, vridning och storlek)">▣ Från markerat</button></div>
      <div class="v3-gd-g2"><label class="v3-field"><span>Vridning °</span><input type="number" step="0.1" data-gdf="rot" value="${d.rot}" /></label><label class="v3-field"><span>Höjd Z (m)</span><input type="number" step="0.01" data-gdf="z" value="${d.z}" /></label></div>
      <div class="v3-gd-sec">Avstånd <small>5x6; 7,2 = fem à 6 m, en à 7,2 m</small></div>
      <div class="v3-gd-g2">${f("xsT", "Längs X (1,2,3…)", 'placeholder="4x6"')}${f("ysT", "Längs Y (A,B,C…)", 'placeholder="3x6"')}</div>
      <div class="v3-gd-meta ${S.ok ? "" : "bad"}">${S.ok ? `${S.lines.length} linjer · ${S.W.toFixed(1).replace(".", ",")} × ${S.H.toFixed(1).replace(".", ",")} m` : "Skriv avstånd som 6 eller 5x6; 7,2 (m)"}</div>
      <div class="v3-gd-g2"><label class="v3-field"><span>Etiketter X</span><div class="v3-gd-inl">${sel("xl", [["num", "1,2,3"], ["abc", "A,B,C"]])}<input type="text" data-gdf="xs0" value="${E(d.xs0)}" title="Första etiketten" /></div></label><label class="v3-field"><span>Etiketter Y</span><div class="v3-gd-inl">${sel("yl", [["abc", "A,B,C"], ["num", "1,2,3"]])}<input type="text" data-gdf="ys0" value="${E(d.ys0)}" title="Första etiketten" /></div></label></div>
      <div class="v3-gd-sec">Utseende</div>
      <div class="v3-gd-g2"><label class="v3-field"><span>Färg</span><input type="color" data-gdf="color" value="${E(d.color)}" /></label><label class="v3-field"><span>Linjetyp</span>${sel("dash", [["solid", "Heldragen"], ["dash", "Streckad"], ["dot", "Prickad"], ["dashdot", "Streckprick"]])}</label></div>
      <label class="v3-gd-sl"><span>Tjocklek</span><input type="range" min="2" max="100" step="1" data-gdf="wcm" value="${Math.round(d.w * 100)}" /><output>${Math.round(d.w * 100)} cm</output></label>
      <label class="v3-gd-sl"><span>Opacitet</span><input type="range" min="5" max="100" step="5" data-gdf="op" value="${d.op}" /><output>${d.op} %</output></label>
      <div class="v3-gd-g2"><label class="v3-field"><span>Cirklar</span>${sel("bub", [["both", "Båda ändar"], ["start", "Bara start"], ["end", "Bara slut"], ["off", "Av"]])}</label><label class="v3-field"><span>Cirkelstorlek</span><input type="range" min="16" max="56" step="2" data-gdf="bsz" value="${d.bsz}" /></label></div>
      <div class="v3-gd-g2"><label class="v3-field"><span>Linjer utanför (m)</span><input type="number" min="0" step="0.5" data-gdf="ext" value="${d.ext}" /></label><label class="v3-chk" style="align-self:end"><input type="checkbox" data-gdf="top" ${d.top ? "checked" : ""} /> Ovanpå allt</label></div>
      <div class="v3-gd-sec">Smarta funktioner</div>
      <label class="v3-chk" title="När en linjes ände ligger utanför bilden (inzoomad) visas dess siffra eller bokstav vid bildkanten – så vet du alltid var du är"><input type="checkbox" data-gdf="edge" ${d.edge !== false ? "checked" : ""} /> Etiketter i bildkanten när jag zoomar in</label>
      <label class="v3-chk" title="Avståndet mellan linjerna skrivs ut längs rutnätets nedre och vänstra kant"><input type="checkbox" data-gdf="dims" ${d.dims ? "checked" : ""} /> Måttkedja (avstånd mellan linjerna)</label>
      <label class="v3-chk" title="Vid pekaren visas närmaste korsning (t.ex. C–4) och avståndet dit"><input type="checkbox" data-gdf="hov" ${d.hov !== false ? "checked" : ""} /> Visa position vid pekaren</label>
      <label class="v3-field"><span>Hjälplinjer var … m (0 = av)</span><input type="number" min="0" step="0.5" data-gdf="sub" value="${d.sub || 0}" title="Tunna, svaga delningslinjer mellan huvudlinjerna, t.ex. 1 m" /></label>
      ${f("name", "Namn", 'placeholder="t.ex. Hus A"')}
      <div class="v3-gd-btns end"><button type="button" data-gdcancel>Avbryt</button><button type="button" class="v3-primary" data-gdsave>${l3gd.list.some(x => x.id === d.id) ? "Spara" : "Skapa rutnät"}</button></div>`;
  }
  const dlg = l3Dlg("v3GridDlg", d ? "Rutnät – " + (l3gd.list.some(x => x.id === d.id) ? "redigera" : "nytt") : "Rutnät", body, {});
  l3gdBind(dlg);
}
function l3gdBind(dlg) {
  const q = s => dlg.querySelector(s), qa = s => [...dlg.querySelectorAll(s)], d = l3gd.edit;
  qa("[data-gdv]").forEach(c => { c.onchange = () => { if (c.dataset.gdv === "__all") { l3SetPref("gdAll", c.checked); l3gdDraw(); return; } const g = l3gd.list.find(x => x.id === c.dataset.gdv); if (g) { g.vis = c.checked; l3gdDraw(); l3gdSave(g); } }; });
  qa("[data-gdcol]").forEach(c => { c.oninput = () => { const g = l3gd.list.find(x => x.id === c.dataset.gdcol); if (g) { g.color = c.value; l3gdDraw(); } }; c.onchange = () => { const g = l3gd.list.find(x => x.id === c.dataset.gdcol); if (g) { g.color = c.value; l3gdSave(g); l3gdRenderDlg(); } }; });
  qa("[data-gdedit]").forEach(b => { b.onclick = () => { const g = l3gd.list.find(x => x.id === b.dataset.gdedit); if (g) { l3gd.edit = { ...g }; l3gdDraw(); l3gdRenderDlg(); } }; });
  qa("[data-gdgo]").forEach(b => { b.onclick = () => { const g = l3gd.list.find(x => x.id === b.dataset.gdgo); if (g) l3gdZoom(g); }; });
  qa("[data-gddel]").forEach(b => { b.onclick = async () => { const g = l3gd.list.find(x => x.id === b.dataset.gddel); if (!g || !(await uiConfirm(`Ta bort rutnätet "${g.name || "Rutnät"}"?`, { ok: "Ta bort" }))) return; l3gd.list = l3gd.list.filter(x => x !== g); l3gdDraw(); l3gdRenderDlg(); await l3gdSave(g, true); }; });
  const nw = q("[data-gdnew]"); if (nw) nw.onclick = () => { const g = l3gdDef(); g.name = "Rutnät " + (l3gd.list.length + 1); const c = l3.orbit && l3.orbit.target; if (c) { g.x = Math.round((c.x + l3.O[0]) / 1) * 1; g.y = Math.round((c.y + l3.O[1]) / 1) * 1; g.z = Math.round((c.z + l3.O[2]) * 100) / 100; } l3gd.edit = g; l3gdDraw(); l3gdRenderDlg(); };
  if (!d) return;
  const upd = () => { l3gdDraw(); const S = l3gdLines(d), m = q(".v3-gd-meta"); if (m) { m.classList.toggle("bad", !S.ok); m.textContent = S.ok ? `${S.lines.length} linjer · ${S.W.toFixed(1).replace(".", ",")} × ${S.H.toFixed(1).replace(".", ",")} m` : "Skriv avstånd som 6 eller 5x6; 7,2 (m)"; } };
  qa("[data-gdf]").forEach(i => { const ev = i.tagName === "SELECT" || i.type === "checkbox" || i.type === "color" ? "onchange" : "oninput"; i[ev] = () => {
    const k = i.dataset.gdf, v = i.type === "checkbox" ? i.checked : i.type === "number" || i.type === "range" ? Number(i.value) : i.value;
    if (k === "wcm") { d.w = v / 100; const o = i.nextElementSibling; if (o) o.textContent = v + " cm"; } else { d[k] = v; if (k === "op") { const o = i.nextElementSibling; if (o) o.textContent = v + " %"; } }
    if (i.type === "color") { /* färgväljaren skickar change */ } upd(); }; if (i.type === "color") i.oninput = () => { d.color = i.value; l3gdDraw(); }; });
  const pk = q("[data-gdpick]"); if (pk) pk.onclick = () => { const dl = document.getElementById("v3GridDlg"); l3DlgPick(2, ["Tryck rutnätets origo (första skärningen).", "Tryck en punkt längs X-riktningen."], ([a, b]) => { d.x = Math.round(a.x * 100) / 100; d.y = Math.round(a.y * 100) / 100; d.z = Math.round(a.z * 100) / 100; d.rot = Math.round(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI * 10) / 10; l3gdDraw(); l3gdRenderDlg(true); l3Status("Rutnätet är placerat – justera avstånd och utseende."); }); void dl; };
  const sl = q("[data-gdsel]"); if (sl) sl.onclick = () => l3gdFromSel();
  const cn = q("[data-gdcancel]"); if (cn) cn.onclick = () => { l3gd.edit = null; l3gdDraw(); l3gdRenderDlg(); };
  const sv = q("[data-gdsave]"); if (sv) sv.onclick = async () => { const S = l3gdLines(d); if (!S.ok) { l3Status("Avstånden går inte att tolka – skriv t.ex. 6 eller 5x6; 7,2.", true); return; } const g = { ...d, name: d.name || "Rutnät " + (l3gd.list.length + 1) }; const i = l3gd.list.findIndex(x => x.id === g.id); if (i >= 0) l3gd.list[i] = g; else l3gd.list.push(g); l3gd.edit = null; l3gdDraw(); l3gdRenderDlg(); l3Toast(`Rutnätet "${g.name}" är sparat (${S.lines.length} linjer).`); await l3gdSave(g); };
}
function l3gdFromSel() {
  const d = l3gd.edit; if (!d) return; const b = l3SelBox(); if (!b || b.isEmpty()) { l3Status("Markera ett objekt först (eller flera) – rutnätet anpassas efter det.", true); return; }
  const p = typeof l3SelList === "function" ? l3SelList()[0] : null; d.rot = p && p.rot ? Number(p.rot) : 0;
  const c = Math.cos(-d.rot * Math.PI / 180), s = Math.sin(-d.rot * Math.PI / 180), O = l3.O, pts = []; for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) pts.push([x + O[0], y + O[1]]);
  const ref = [b.min.x + O[0], b.min.y + O[1]], loc = pts.map(q => [(q[0] - ref[0]) * c - (q[1] - ref[1]) * s, (q[0] - ref[0]) * s + (q[1] - ref[1]) * c]), x0 = Math.min(...loc.map(q => q[0])), y0 = Math.min(...loc.map(q => q[1])), W = Math.max(...loc.map(q => q[0])) - x0, H = Math.max(...loc.map(q => q[1])) - y0;
  const rc = Math.cos(d.rot * Math.PI / 180), rs = Math.sin(d.rot * Math.PI / 180); d.x = Math.round((ref[0] + x0 * rc - y0 * rs) * 100) / 100; d.y = Math.round((ref[1] + x0 * rs + y0 * rc) * 100) / 100; d.z = Math.round((b.min.z + O[2]) * 100) / 100;
  const bay = L => { const n = Math.max(1, Math.round(L / 6)); return `${n}x${Math.round(L / n * 100) / 100}`; }; d.xsT = bay(W); d.ysT = bay(H);
  l3gdDraw(); l3gdRenderDlg(true); l3Status(`Rutnätet passar objektet (${W.toFixed(1).replace(".", ",")} × ${H.toFixed(1).replace(".", ",")} m).`);
}
function l3gdZoom(g) {
  const S = l3gdLines(g), P = [[0, 0], [S.W, 0], [S.W, S.H], [0, S.H]].map(p => l3gdW(g, p)), box = new THREE.Box3(); P.forEach(p => box.expandByPoint(new THREE.Vector3(p[0] - l3.O[0], p[1] - l3.O[1], g.z - l3.O[2])));
  l3FlyTo(box.getCenter(new THREE.Vector3()), Math.max(12, box.getSize(new THREE.Vector3()).length() * 1.5), new THREE.Vector3(-0.3, -0.7, 0.65), 0);
}
(() => {
  const t = setInterval(() => { const bar = document.querySelector("#view3d .v3-bar"), fit = document.getElementById("v3Fit"); if (!bar || !fit || document.getElementById("v3GridBtn")) { if (document.getElementById("v3GridBtn")) clearInterval(t); return; }
    const b = document.createElement("button"); b.type = "button"; b.id = "v3GridBtn"; b.className = "v3-ghost"; b.title = "Rutnät / axlar – skapa och styr gridlinjer (färg, tjocklek, synlighet)"; b.innerHTML = L3GD_ICO + "<span>Rutnät</span>"; fit.parentNode.insertBefore(b, fit); b.onclick = () => { const d = document.getElementById("v3GridDlg"); if (d && !d.classList.contains("hidden")) { l3gd.edit = null; l3gdDraw(); l3DlgClose("v3GridDlg"); } else l3gdOpen(); };
    if (typeof l3gdLoad === "function" && typeof l3 !== "undefined" && l3 && l3.renderer) l3gdLoad(); clearInterval(t); }, 500);
  setTimeout(() => clearInterval(t), 180000);
})();
