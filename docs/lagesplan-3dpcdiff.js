/* Differentialanalys och volym (Victor 2026-10-24): jämför ett punktmoln mot ett annat punktmoln, en 3D-modell (IFC) eller en 3D-ritning (DWG/DXF)
   och se skillnaderna i färg (blå = lägre = schakt, röd = högre = fyllning), samt räkna ut volymer – antingen mellan två ytor eller inom ett område
   som pekas ut i modellen (schaktgrop, hög med makadam). Allt görs på en höjdkarta (rutnät): varje ruta får en höjd per yta, skillnaden per ruta × rutans yta
   blir volymen. Inget ritas i eller skickas till Trimble Connect. */
const l3df = { aId: null, A: null, R: null, stats: null, busy: "", note: "", refLabel: "", vol: null };
const L3DF_TOL = [0.02, 0.05, 0.1, 0.2];
const L3DF_COL = ["#1e3a8a", "#2563eb", "#60a5fa", "#bfdbfe", "#e5e7eb", "#fecaca", "#f87171", "#ef4444", "#991b1b"];
const l3dfPref = (k, d) => { const v = l3Prefs()[k]; return v == null || v === "" ? d : v; };
const l3dfF = v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(Math.round(v * 100) / 100).toLocaleString("sv-SE");
const l3dfM3 = v => Math.round(v).toLocaleString("sv-SE") + " m³";

/* Färgbanden för skillnaden (m, relativt referensen): egna om de ställts in i teckenförklaringen, annars en standardskala runt toleransen. */
function l3dfZones() {
  const K = l3pcZCustom("pcDCustom");
  if (K) return { custom: true, b: K.b.slice(), c: K.c.slice(), zones: K.c.map((col, i) => ({ lo: i ? K.b[i - 1] : -Infinity, hi: i < K.b.length ? K.b[i] : Infinity, col })) };
  const tol = Number(l3dfPref("pcDTol", 0.1)), b = [-1, -0.5, -0.25, -tol, tol, 0.25, 0.5, 1].filter((v, i, a) => i === 3 || i === 4 || Math.abs(v) > tol + 1e-9), c = [];
  // färgerna följer antalet gränser: blå sida (mörkast längst ner), grå mitt (inom toleransen), röd sida
  const neg = b.filter(v => v < 0).length, pos = b.filter(v => v > 0).length, blue = L3DF_COL.slice(0, 4), red = L3DF_COL.slice(5);
  for (let i = 0; i < neg; i++) c.push(blue[Math.max(0, 4 - neg + i)]);
  c.push(L3DF_COL[4]); for (let i = 0; i < pos; i++) c.push(red[Math.max(0, 4 - pos + i)]);
  return { custom: false, b, c, zones: c.map((col, i) => ({ lo: i ? b[i - 1] : -Infinity, hi: i < b.length ? b[i] : Infinity, col })) };
}
const l3dfNote = () => l3df.A ? `${l3df.note || ""}` : "Välj vad molnet ska jämföras mot (inställningar → Differentialanalys)";
function l3dfFoot() {
  const s = l3df.stats; if (l3df.busy) return `<div class="v3-pcl-s">${l3df.busy}</div>`; if (!s) return "";
  return `<div class="v3-pcl-s"><div><b>Fyllning</b> <span class="up">+${l3dfM3(s.fill)}</span></div><div><b>Schakt</b> <span class="dn">−${l3dfM3(s.cut)}</span></div><div><b>Netto</b> ${s.fill - s.cut >= 0 ? "+" : "−"}${l3dfM3(Math.abs(s.fill - s.cut))}</div><div class="m">${Math.round(s.area).toLocaleString("sv-SE")} m² jämförs · ruta ${String(Math.round(s.cell * 100) / 100).replace(".", ",")} m</div></div>`;
}
/* Färg per punkt: skillnaden mot referensens höjd i samma ruta. Punkter utanför referensen blir grå. */
function l3dfColors(c, ch, n, out) {
  const R = l3df.R, grey = [156, 163, 175];
  if (!R || l3df.aId !== c.id) { for (let i = 0; i < n; i++) { out[i * 3] = grey[0]; out[i * 3 + 1] = grey[1]; out[i * 3 + 2] = grey[2]; } return out; }
  const Zs = l3dfZones(), rgb = Zs.c.map(l3pcRgb), b = Zs.b, nb = b.length, pos = ch.pos, cx = c.info.center[0], cy = c.info.center[1], cz = c.info.center[2] + (c.dz || 0);
  for (let i = 0; i < n; i++) {
    const ix = Math.floor((pos[i * 3] + cx - R.x0) / R.cell), iy = Math.floor((pos[i * 3 + 1] + cy - R.y0) / R.cell); let q = grey;
    if (ix >= 0 && iy >= 0 && ix < R.nx && iy < R.ny) { const zr = R.z[iy * R.nx + ix]; if (zr === zr) { const d = pos[i * 3 + 2] + cz - zr; let k = 0; while (k < nb && d >= b[k]) k++; q = rgb[k]; } }
    out[i * 3] = q[0]; out[i * 3 + 1] = q[1]; out[i * 3 + 2] = q[2];
  }
  return out;
}

/* ---- Höjdkartor ---- */
function l3dfGrid(bd, cell) {
  let w = bd.x1 - bd.x0, h = bd.y1 - bd.y0; cell = Math.max(0.05, cell);
  while ((w / cell) * (h / cell) > 4e6) cell *= 2;
  const nx = Math.max(1, Math.ceil(w / cell)), ny = Math.max(1, Math.ceil(h / cell));
  return { x0: bd.x0, y0: bd.y0, cell, nx, ny, z: new Float32Array(nx * ny).fill(NaN) };
}
/* Punktmoln → medelhöjd per ruta. */
function l3dfFromCloud(c, g, lim) {
  const n = g.nx * g.ny, sum = new Float64Array(n), cnt = new Uint32Array(n), cx = c.info.center[0], cy = c.info.center[1], cz = c.info.center[2] + (c.dz || 0), stride = Math.max(1, Math.floor(c.nTot / 8e6));
  c.chunks.forEach(ch => { const p = ch.pos, m = p.length / 3; for (let i = 0; i < m; i += stride) {
    const x = p[i * 3] + cx, y = p[i * 3 + 1] + cy; if (lim && (x < lim.x0 || x > lim.x1 || y < lim.y0 || y > lim.y1)) continue;
    const ix = Math.floor((x - g.x0) / g.cell), iy = Math.floor((y - g.y0) / g.cell); if (ix < 0 || iy < 0 || ix >= g.nx || iy >= g.ny) continue; const k = iy * g.nx + ix; sum[k] += p[i * 3 + 2] + cz; cnt[k]++; } });
  for (let k = 0; k < n; k++) if (cnt[k]) g.z[k] = sum[k] / cnt[k];
  return g;
}
/* Triangel → översta höjden per ruta (ytan man ser uppifrån). */
function l3dfTri(g, a, b, c) {
  const cs = g.cell, x0 = Math.min(a[0], b[0], c[0]), x1 = Math.max(a[0], b[0], c[0]), y0 = Math.min(a[1], b[1], c[1]), y1 = Math.max(a[1], b[1], c[1]);
  let ix0 = Math.floor((x0 - g.x0) / cs), ix1 = Math.floor((x1 - g.x0) / cs), iy0 = Math.floor((y0 - g.y0) / cs), iy1 = Math.floor((y1 - g.y0) / cs); if (ix1 < 0 || iy1 < 0 || ix0 >= g.nx || iy0 >= g.ny) return;
  ix0 = Math.max(0, ix0); iy0 = Math.max(0, iy0); ix1 = Math.min(g.nx - 1, ix1); iy1 = Math.min(g.ny - 1, iy1);
  const put = (k, z) => { const o = g.z[k]; if (!(o >= z)) g.z[k] = z; };
  const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (ix0 === ix1 && iy0 === iy1 || Math.abs(det) < 1e-12) { put(iy0 * g.nx + ix0, Math.max(a[2], b[2], c[2])); return; }
  for (let iy = iy0; iy <= iy1; iy++) for (let ix = ix0; ix <= ix1; ix++) {
    const px = g.x0 + (ix + 0.5) * cs, py = g.y0 + (iy + 0.5) * cs, l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / det, l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / det, l3 = 1 - l1 - l2, e = -0.02;
    if (l1 >= e && l2 >= e && l3 >= e) put(iy * g.nx + ix, l1 * a[2] + l2 * b[2] + l3 * c[2]);
  }
}
function l3dfMeshes(g, meshes) {
  const O = l3.O, A = [0, 0, 0], B = [0, 0, 0], C = [0, 0, 0], v = new THREE.Vector3();
  meshes.forEach(m => { const geo = m.geometry, pos = geo.getAttribute("position"); if (!pos) return; m.updateWorldMatrix(true, false); const W = m.matrixWorld, idx = geo.index, tri = (idx ? idx.count : pos.count) / 3;
    const get = (i, out) => { v.fromBufferAttribute(pos, i).applyMatrix4(W); out[0] = v.x + O[0]; out[1] = v.y + O[1]; out[2] = v.z + O[2]; };
    for (let t = 0; t < tri; t++) { const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2; get(i0, A); get(i1, B); get(i2, C); l3dfTri(g, A, B, C); } });
  return g;
}
/* Små hål (rutor utan punkter) fylls från grannarna så att skillnaden blir sammanhängande. */
function l3dfFill(g, passes = 2) {
  for (let p = 0; p < passes; p++) { const src = g.z.slice();
    for (let iy = 1; iy < g.ny - 1; iy++) for (let ix = 1; ix < g.nx - 1; ix++) { const k = iy * g.nx + ix; if (src[k] === src[k]) continue; let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const z = src[k + dy * g.nx + dx]; if (z === z) { s += z; n++; } }
      if (n >= 4) g.z[k] = s / n; } }
  return g;
}
/* Källor att jämföra mot (och mäta mot). */
function l3dfSources() {
  const out = [];
  l3pc.clouds.forEach(c => out.push({ k: "pc:" + c.id, label: "Punktmoln: " + c.name }));
  if (typeof l3b !== "undefined") l3b.models.forEach(m => { if (m.meshes && m.meshes.length) out.push({ k: "md:" + m.id, label: "3D-modell: " + m.name }); });
  if (typeof l3s !== "undefined" && l3s.cad && typeof cads === "function") cads().forEach(r => { let n = 0; l3s.cad.forEach(o => { if (o.userData.cadId === r.id && o.isMesh && o.geometry.getAttribute("position")) n++; }); if (n) out.push({ k: "cad:" + r.id, label: "3D-ritning: " + r.name }); });
  return out;
}
function l3dfBuild(key, g) {
  const [kind, ...rest] = key.split(":"), id = rest.join(":");
  if (kind === "pc") { const c = l3pc.clouds.find(x => x.id === id); if (!c) return null; l3dfFromCloud(c, g); return l3dfFill(g, 2); }
  if (kind === "md") { const m = l3b.models.find(x => x.id === id); if (!m) return null; l3dfMeshes(g, m.meshes); return l3dfFill(g, 1); }
  if (kind === "cad") { const ms = []; l3s.cad.forEach(o => { if (o.userData.cadId === id && o.isMesh) ms.push(o); }); if (!ms.length) return null; l3dfMeshes(g, ms); return l3dfFill(g, 1); }
  return null;
}
const l3dfLabel = key => (l3dfSources().find(s => s.k === key) || { label: key }).label;
const l3dfTick = () => new Promise(r => setTimeout(r, 20));

/* Kör analysen: molnet A mot referensen. Resultatet färgar molnet och ger fyllning/schakt i teckenförklaringen. */
async function l3dfRun() {
  const srcs = l3dfSources(), aKey = l3dfPref("pcDA", ""), A = l3pc.clouds.find(c => "pc:" + c.id === aKey) || l3pc.clouds.find(c => c.visible) || l3pc.clouds[0];
  if (!A) { l3Status("Läs in ett punktmoln först.", true); return; }
  let rk = l3dfPref("pcDRef", ""); if (!srcs.some(s => s.k === rk) || rk === "pc:" + A.id) rk = (srcs.find(s => s.k !== "pc:" + A.id) || {}).k;
  if (!rk) { l3Status("Det behövs något att jämföra mot – ett till punktmoln, en IFC-modell eller en 3D-ritning.", true); return; }
  const cell = Number(l3dfPref("pcDCell", 0.5));
  l3df.busy = "Räknar…"; l3pcLegend(); await l3dfTick();
  const bd = { x0: A.info.min[0], y0: A.info.min[1], x1: A.info.max[0], y1: A.info.max[1] }, gA = l3dfGrid(bd, cell), gR = l3dfGrid(bd, gA.cell);
  l3dfFromCloud(A, gA); l3dfFill(gA, 1); await l3dfTick();
  const R = l3dfBuild(rk, gR); if (!R) { l3df.busy = ""; l3Status("Kunde inte läsa referensen.", true); l3pcLegend(); return; }
  let fill = 0, cut = 0, area = 0; const ca = gA.cell * gA.cell;
  for (let k = 0; k < gA.z.length; k++) { const a = gA.z[k], r = R.z[k]; if (a !== a || r !== r) continue; const d = a - r; area += ca; if (d > 0) fill += d * ca; else cut -= d * ca; }
  l3df.aId = A.id; l3df.A = gA; l3df.R = R; l3df.refLabel = l3dfLabel(rk); l3df.note = `${A.name} mot ${l3df.refLabel.replace(/^[^:]+: /, "")}`; l3df.busy = ""; l3df.stats = { fill, cut, area, cell: gA.cell };
  l3SetPref("pcMode", "diff"); l3pcRecolor(); l3Status(area ? `Differentialanalys klar: fyllning +${l3dfM3(fill)}, schakt −${l3dfM3(cut)} på ${Math.round(area).toLocaleString("sv-SE")} m².` : "Ytorna överlappar inte – inget att jämföra.", !area);
  if (typeof l3LayersRender === "function") l3LayersRender();
}
function l3dfOff() { l3df.R = l3df.A = null; l3df.stats = null; l3df.aId = null; if (l3pcMode() === "diff") l3SetPref("pcMode", null); l3pcRecolor(); }

/* ---- Volym i ett uppritat område ---- */
const l3dfV = { on: false, pts: [], line: null, dots: null, card: null, key: null, down: null, mode: "plane", level: 0 };
function l3dfVolStart() {
  if (!l3pc.clouds.some(c => c.visible)) { l3Status("Tänd ett punktmoln först.", true); return; }
  l3dfVolEnd(true); l3dfV.on = true; l3dfV.pts = []; const dom = l3.renderer.domElement; dom.style.cursor = "crosshair";
  l3Status("Volym: tryck ut punkter runt området (t.ex. kanten på schaktgropen). Enter eller dubbelklick räknar ut volymen. Backsteg tar bort senaste punkten, Esc avbryter.");
  l3dfCard();
  l3dfV.down = e => {
    if (e.button !== 0) return; if (e.detail > 1) { e.stopPropagation(); e.preventDefault(); l3dfVolDone(); return; }
    const h = l3pcPick(e, 9) || l3Ray(e, l3Surfaces())[0]; e.stopPropagation(); e.preventDefault();
    if (!h) { l3Status("Ingen punkt här – försök igen.", true); return; }
    l3dfV.pts.push([h.point.x + l3.O[0], h.point.y + l3.O[1], h.point.z + l3.O[2]]); l3dfDraw(); l3dfCard();
  };
  l3dfV.key = e => { if (!l3dfV.on) return; if (e.key === "Escape") { e.stopPropagation(); l3dfVolEnd(); l3Status("Volymmätningen avbröts."); } else if (e.key === "Enter") { e.stopPropagation(); l3dfVolDone(); } else if (e.key === "Backspace") { e.stopPropagation(); e.preventDefault(); l3dfV.pts.pop(); l3dfDraw(); l3dfCard(); } };
  dom.addEventListener("pointerdown", l3dfV.down, true); window.addEventListener("keydown", l3dfV.key, true);
}
function l3dfDraw() {
  if (!l3.groups.dfvol) { l3.groups.dfvol = new THREE.Group(); l3.groups.dfvol.name = "dfvol"; l3.scene.add(l3.groups.dfvol); }
  const g = l3.groups.dfvol; l3Clear(g); const P = l3dfV.pts.map(p => new THREE.Vector3(p[0] - l3.O[0], p[1] - l3.O[1], p[2] - l3.O[2])); if (!P.length) { l3Render(); return; }
  const lg = new THREE.BufferGeometry().setFromPoints(l3dfV.done && P.length > 2 ? [...P, P[0]] : P), line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false, transparent: true })); line.renderOrder = 40; line.userData.noHit = true; line.raycast = () => {}; g.add(line);
  const dots = new THREE.Points(new THREE.BufferGeometry().setFromPoints(P), new THREE.PointsMaterial({ color: 0xffffff, size: 9, sizeAttenuation: false, depthTest: false })); dots.renderOrder = 41; dots.userData.noHit = true; dots.raycast = () => {}; g.add(dots); l3Render();
}
function l3dfVolEnd(keepDraw) {
  const dom = l3.renderer.domElement; dom.style.cursor = ""; if (l3dfV.down) dom.removeEventListener("pointerdown", l3dfV.down, true); if (l3dfV.key) window.removeEventListener("keydown", l3dfV.key, true);
  l3dfV.on = false; l3dfV.down = l3dfV.key = null; l3dfV.done = false; if (!keepDraw) { l3dfV.pts = []; if (l3.groups.dfvol) l3Clear(l3.groups.dfvol); if (l3dfV.card) l3dfV.card.classList.add("hidden"); l3Render(); }
}
function l3dfVolDone() {
  if (l3dfV.pts.length < 3) { l3Status("Peka ut minst tre punkter.", true); return; }
  l3dfV.done = true; l3dfVolEnd(true); l3dfV.done = true; l3dfDraw(); l3dfCard(); l3dfVolCalc();
}
/* Planet som passar bäst genom punkterna (minsta kvadrat), z = a·x + b·y + c; med färre än tre punkter en vågrät nivå. */
function l3dfPlane(P) {
  const n = P.length, mx = P.reduce((s, p) => s + p[0], 0) / n, my = P.reduce((s, p) => s + p[1], 0) / n, mz = P.reduce((s, p) => s + p[2], 0) / n;
  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0; P.forEach(p => { const x = p[0] - mx, y = p[1] - my, z = p[2] - mz; sxx += x * x; sxy += x * y; syy += y * y; sxz += x * z; syz += y * z; });
  const d = sxx * syy - sxy * sxy; if (n < 3 || Math.abs(d) < 1e-9) return { a: 0, b: 0, c: mz, mx: 0, my: 0 };
  const a = (sxz * syy - syz * sxy) / d, b = (syz * sxx - sxz * sxy) / d; return { a, b, c: mz - a * mx - b * my, mx: 0, my: 0 };
}
function l3dfVolCalc() {
  const P = l3dfV.pts; if (P.length < 3) return; const xs = P.map(p => p[0]), ys = P.map(p => p[1]), bd = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const c = l3pc.clouds.find(x => "pc:" + x.id === l3dfPref("pcDA", "")) || l3pc.clouds.find(x => x.visible) || l3pc.clouds[0]; if (!c) return;
  let cell = Math.max(0.1, Math.sqrt(((bd.x1 - bd.x0) * (bd.y1 - bd.y0)) / 250000)); if (cell < 0.25) cell = 0.25;
  const g = l3dfGrid(bd, cell); l3dfFromCloud(c, g); l3dfFill(g, 2);
  let base; const mode = l3dfV.mode;
  if (mode === "ref") { const rk = l3dfPref("pcDRef", ""), R = rk ? l3dfBuild(rk, l3dfGrid(bd, g.cell)) : null; if (R) base = (x, y) => { const ix = Math.floor((x - R.x0) / R.cell), iy = Math.floor((y - R.y0) / R.cell); return ix >= 0 && iy >= 0 && ix < R.nx && iy < R.ny ? R.z[iy * R.nx + ix] : NaN; }; }
  if (!base && mode === "level") { const lv = Number(l3dfV.level) || 0; base = () => lv; }
  if (!base) { const pl = l3dfPlane(P), cx0 = P.reduce((s, p) => s + p[0], 0) / P.length, cy0 = P.reduce((s, p) => s + p[1], 0) / P.length; base = (x, y) => pl.a * (x - cx0) + pl.b * (y - cy0) + pl.c + (pl.a * cx0 + pl.b * cy0 - pl.a * cx0 - pl.b * cy0); l3dfV.mode = mode === "ref" || mode === "level" ? mode : "plane"; }
  // punkt-i-polygon per ruta
  const inside = (x, y) => { let r = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) r = !r; } return r; };
  let fill = 0, cut = 0, area = 0, miss = 0, mn = Infinity, mx = -Infinity; const ca = g.cell * g.cell;
  for (let iy = 0; iy < g.ny; iy++) for (let ix = 0; ix < g.nx; ix++) { const x = g.x0 + (ix + 0.5) * g.cell, y = g.y0 + (iy + 0.5) * g.cell; if (!inside(x, y)) continue; const z = g.z[iy * g.nx + ix], zb = base(x, y); if (z !== z || zb !== zb) { miss++; continue; }
    const d = z - zb; area += ca; if (d > 0) fill += d * ca; else cut -= d * ca; mn = Math.min(mn, d); mx = Math.max(mx, d); }
  l3dfV.res = { fill, cut, area, miss, cell: g.cell, mn, mx, pts: P.length }; l3dfCard();
}
function l3dfCard() {
  const host = document.getElementById("v3Canvas"); if (!host) return; let el = l3dfV.card;
  if (!el || !el.isConnected) { el = l3dfV.card = document.createElement("div"); el.id = "v3PcVol"; el.className = "v3-pcvol"; host.appendChild(el); ["pointerdown", "wheel", "contextmenu", "dblclick", "click", "keydown"].forEach(t => el.addEventListener(t, e => e.stopPropagation())); }
  el.classList.remove("hidden"); const R = l3dfV.res, m = l3dfV.mode, f1 = v => Math.round(v * 100) / 100, hasRef = !!l3dfPref("pcDRef", "");
  let body;
  if (l3dfV.on) body = `<div class="v3-pcv-t">Tryck ut punkter runt området (${l3dfV.pts.length} st). Enter eller dubbelklick när du är klar.</div><div class="v3-pcv-b"><button type="button" data-v="done" ${l3dfV.pts.length < 3 ? "disabled" : ""}>Räkna ut</button><button type="button" data-v="undo" ${l3dfV.pts.length ? "" : "disabled"}>Ångra punkt</button></div>`;
  else if (R) body = `<div class="v3-pcv-r"><div><b>Fyllning</b><span class="up">+${l3dfM3(R.fill)}</span></div><div><b>Schakt</b><span class="dn">−${l3dfM3(R.cut)}</span></div><div><b>Netto</b><span>${R.fill - R.cut >= 0 ? "+" : "−"}${l3dfM3(Math.abs(R.fill - R.cut))}</span></div><div><b>Yta</b><span>${Math.round(R.area).toLocaleString("sv-SE")} m²</span></div></div>
    <label class="v3-pcv-f"><span>Mät mot</span><select data-v="mode"><option value="plane" ${m === "plane" ? "selected" : ""}>Plan genom punkterna</option><option value="level" ${m === "level" ? "selected" : ""}>Egen nivå</option>${hasRef ? `<option value="ref" ${m === "ref" ? "selected" : ""}>Referensen (modell/moln)</option>` : ""}</select>${m === "level" ? `<input type="number" step="0.1" data-v="level" value="${f1(Number(l3dfV.level) || (R.mn === Infinity ? 0 : 0))}" /> m` : ""}</label>
    <div class="v3-pcv-t">Största höjd ${f1(R.mx === -Infinity ? 0 : R.mx)} m · djupaste ${f1(R.mn === Infinity ? 0 : R.mn)} m · ruta ${String(R.cell).replace(".", ",")} m${R.miss ? ` · ${R.miss} rutor utan punkter hoppades över` : ""}</div>
    <div class="v3-pcv-b"><button type="button" data-v="copy">Kopiera</button><button type="button" data-v="again">Nytt område</button><button type="button" data-v="close">Stäng</button></div>`;
  else body = "";
  el.innerHTML = `<div class="v3-pcv-h">Volym i område</div>${body}`;
  const on = (k, fn) => el.querySelectorAll(`[data-v="${k}"]`).forEach(b => { b.onclick = fn; });
  on("done", () => l3dfVolDone()); on("undo", () => { l3dfV.pts.pop(); l3dfDraw(); l3dfCard(); }); on("again", () => { l3dfV.res = null; l3dfVolStart(); }); on("close", () => { l3dfV.res = null; l3dfVolEnd(); });
  on("copy", () => { const t = `Fyllning +${Math.round(R.fill)} m³, schakt −${Math.round(R.cut)} m³, netto ${Math.round(R.fill - R.cut)} m³ på ${Math.round(R.area)} m²`; try { navigator.clipboard.writeText(t); l3Status("Kopierat: " + t); } catch (e) { l3Status(t); } });
  const ms = el.querySelector('select[data-v="mode"]'); if (ms) ms.onchange = () => { l3dfV.mode = ms.value; l3dfVolCalc(); };
  const lv = el.querySelector('input[data-v="level"]'); if (lv) lv.onchange = () => { l3dfV.level = Number(String(lv.value).replace(",", ".")) || 0; l3dfVolCalc(); };
}

/* ---- Inställningar (i punktmolnsmenyn) ---- */
function l3dfSettingsHtml() {
  const esc = escHtml, srcs = l3dfSources(), cl = l3pc.clouds, aKey = l3dfPref("pcDA", cl[0] ? "pc:" + cl[0].id : ""), rKey = l3dfPref("pcDRef", ""), cell = Number(l3dfPref("pcDCell", 0.5)), tol = Number(l3dfPref("pcDTol", 0.1));
  const sel = (id, opts, v, label, hint) => `<label class="v3-pcs-r v3-pcz-r" title="${esc(hint || "")}"><span>${label}</span><select id="${id}">${opts.map(([k, l]) => `<option value="${esc(k)}" ${String(v) === String(k) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  const key = "df|" + (typeof l3SetPref === "function" ? "" : ""), open = typeof SM_FOLD_OPEN !== "undefined" && SM_FOLD_OPEN.has(key);
  return `<details class="v3-sm-fold" data-smfold="${key}" ${open ? "open" : ""}><summary>Differentialanalys &amp; volym</summary><div class="v3-sm-fold-b">
    ${sel("v3DfA", cl.map(c => ["pc:" + c.id, c.name]), aKey, "Jämför", "Molnet som färgas efter skillnaden")}
    ${sel("v3DfRef", [["", "– välj –"], ...srcs.filter(s => s.k !== aKey).map(s => [s.k, s.label])], rKey, "mot", "Punktmoln, IFC-modell eller 3D-ritning (DWG/DXF med ytor) som molnet jämförs mot")}
    ${sel("v3DfCell", [[0.1, "0,1 m"], [0.25, "0,25 m"], [0.5, "0,5 m"], [1, "1 m"], [2, "2 m"], [5, "5 m"]], cell, "Rutstorlek", "Mindre ruta = mer detalj men tyngre")}
    ${sel("v3DfTol", L3DF_TOL.map(v => [v, "± " + String(v).replace(".", ",") + " m"]), tol, "Tolerans", "Skillnader mindre än så visas grått")}
    <div class="v3-pcs-r"><button type="button" class="v3-wide" id="v3DfRun" data-keep="1" title="Räknar ut skillnaden och färgar molnet">Kör analys</button><button type="button" class="v3-link" id="v3DfOff" data-keep="1">Stäng av</button></div>
    <div class="v3-pal-hint">Blått = molnet ligger lägre än referensen (schakt), rött = högre (fyllning). Fyllning och schakt i m³ visas i teckenförklaringen.</div>
    <button type="button" class="v3-wide" id="v3DfVol" data-keep="1" title="Peka ut punkter runt t.ex. en schaktgrop eller en hög – volymen räknas ut mot ett plan, en nivå eller referensen">Mät volym i ett område…</button>
  </div></details>`;
}
function l3dfBind(host) {
  const g = id => host.querySelector("#" + id), set = (id, key, num) => { const el = g(id); if (el) el.onchange = () => l3SetPref(key, num ? Number(el.value) : el.value); };
  set("v3DfA", "pcDA"); set("v3DfRef", "pcDRef"); set("v3DfCell", "pcDCell", true); set("v3DfTol", "pcDTol", true);
  { const el = g("v3DfTol"); if (el) el.addEventListener("change", () => { if (l3df.R) l3pcRecolor(); }); }
  { const b = g("v3DfRun"); if (b) b.onclick = e => { e.stopPropagation(); const m = b.closest(".v3-ldd-m"); if (m) m.classList.add("hidden"); l3dfRun().catch(err => { l3df.busy = ""; l3Status("Differentialanalysen misslyckades: " + err.message, true); }); }; }
  { const b = g("v3DfOff"); if (b) b.onclick = e => { e.stopPropagation(); l3dfOff(); }; }
  { const b = g("v3DfVol"); if (b) b.onclick = e => { e.stopPropagation(); const m = b.closest(".v3-ldd-m"); if (m) m.classList.add("hidden"); l3dfVolStart(); }; }
}
