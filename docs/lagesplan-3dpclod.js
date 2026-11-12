/* 3D-vyn – punktmoln med detaljnivåer från disken (Victor 2026-11-10: "hur klarar Trimble Connect och Vektor.io 228 miljoner punkter?").
   Stora moln (fler punkter än punktbudgeten) glesas inte längre ut för gott. De byggs om en gång till ett okträd (pc-octree.js, samma princip som Potree som
   Trimble Connect använder) i webbläsarens filsystem (OPFS). Därefter gäller:
   – Översikten (de översta nivåerna, ≈ punktbudgeten) ligger alltid i minnet – den används av mät-, volym-, snitt- och fästverktygen som förut.
   – Varje bild väljer vilka noder som ritas: noder utanför bilden hoppas över, resten delas ut efter hur stora de är på skärmen (störst först) inom en
     punktbudget som styrs av bildtiden. Noder som saknas läses in i bakgrunden (högst tre samtidigt) och sparas i ett minne med äldst-först-rensning.
   – Molnet sparas på disken: nästa gång öppnas det på ett ögonblick, hur stort det än är. */
const L3OL_VER = "o1";
const l3olKey = src => `${typeof projectId !== "undefined" ? projectId : "p"}_${src.id}_${src.version || ""}_${L3OL_VER}`.replace(/[^A-Za-z0-9_.-]/g, "_").slice(0, 140);
const l3olOn = () => l3Prefs().pcOctree !== false && typeof Worker !== "undefined" && !!(navigator.storage && navigator.storage.getDirectory);
async function l3olTop(create) { try { return await (await navigator.storage.getDirectory()).getDirectoryHandle("4dplan-pc", { create: !!create }); } catch (e) { return null; } }
async function l3olOpen(key) {
  const top = await l3olTop(false); if (!top) return null;
  try { const d = await top.getDirectoryHandle(key), H = JSON.parse(await (await (await d.getFileHandle("hierarchy.json")).getFile()).text()), file = await (await d.getFileHandle("octree.bin")).getFile(); return H && H.nodes && H.nodes.length ? { H, file } : null; } catch (e) { return null; }
}
async function l3olDrop(src) { const top = await l3olTop(false); if (!top) return; try { await top.removeEntry(l3olKey(src), { recursive: true }); } catch (e) { /* fanns inte */ } }
/* Antal punkter i en LAS/LAZ (Blob/File eller ArrayBuffer) utan att läsa hela filen; 0 om det inte är LAS/LAZ. */
async function l3olCount(bytes, name) {
  if (!/\.(las|laz)$/i.test(name || "")) return 0;
  try {
    const u8 = bytes instanceof Blob ? new Uint8Array(await bytes.slice(0, 375).arrayBuffer()) : new Uint8Array(bytes, 0, Math.min(375, bytes.byteLength)), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== "LASF") return 0;
    let n = dv.getUint32(107, true); if (dv.getUint8(25) >= 4 && u8.length >= 255) { const big = Number(dv.getBigUint64(247, true)); if (big) n = big; } return n;
  } catch (e) { return 0; }
}
async function l3olRoom(need) { try { const e = await navigator.storage.estimate(); return !e.quota || e.quota - e.usage > need; } catch (e) { return true; } }
function l3olConvert(blob, src, key, onP) {
  return new Promise((res, rej) => {
    const w = new Worker("pc-worker.js?v=2"); let heard = Date.now(), over = false;
    const end = (fn, v) => { if (over) return; over = true; clearInterval(dog); l3pc.worker = null; l3pc.cancel = null; w.terminate(); fn(v); };
    const dog = setInterval(() => { if (Date.now() - heard > 600000) end(rej, new Error("omvandlingen hängde sig (ingen signal på 10 minuter)")); }, 5000);
    l3pc.worker = w; l3pc.cancel = () => end(rej, Object.assign(new Error("avbröts"), { cancelled: true }));
    let last = 0;
    w.onmessage = ev => { const d = ev.data; heard = Date.now(); if (d.type === "progress") { const t = Date.now(); if (t - last > 150) { last = t; onP(d.f); } return; } if (d.type === "done") end(res, d.octree); else end(rej, Object.assign(new Error(d.message || "Kunde inte bygga okträd."), { quota: d.quota })); };
    w.onerror = e => end(rej, new Error(e.message || "Kunde inte bygga okträd."));
    w.postMessage({ file: blob, name: src.name, octree: { key } });
  });
}
/* ---- Noder ---- */
function l3olNodes(H) {
  const ns = H.nodes.map((a, id) => { const [l, i, j, k, n, off, ch] = a, s = H.size / (1 << l), x0 = H.org[0] + i * s, y0 = H.org[1] + j * s, z0 = H.org[2] + k * s;
    return { id, l, n, off, ch, x0, y0, z0, s, cx: x0 + s / 2, cy: y0 + s / 2, cz: z0 + s / 2, r: s * 0.866, pts: null, rgb: null, inten: null, state: 0, last: 0, pinned: false }; });
  ns.forEach(n => { n.ch = n.ch.map(id => ns[id]); });
  return ns;
}
async function l3olRead(L, n) {
  const buf = new Uint8Array(await L.file.slice(n.off, n.off + n.n * 10).arrayBuffer()), m = n.n, q = new Uint16Array(buf.buffer, 0, m * 3), k = n.s / 65535, pos = new Float32Array(m * 3), rgb = new Uint8Array(m * 3), inten = new Uint8Array(m), o = m * 6;
  for (let i = 0; i < m; i++) { pos[i * 3] = n.x0 + q[i * 3] * k; pos[i * 3 + 1] = n.y0 + q[i * 3 + 1] * k; pos[i * 3 + 2] = n.z0 + q[i * 3 + 2] * k; rgb[i * 3] = buf[o + i * 4]; rgb[i * 3 + 1] = buf[o + i * 4 + 1]; rgb[i * 3 + 2] = buf[o + i * 4 + 2]; inten[i] = buf[o + i * 4 + 3]; }
  return { pos, rgb, inten };
}
function l3olMake(c, n, ch) {
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(ch.pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(l3pcColors(c, ch), 3, true));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(n.cx, n.cy, n.cz), n.r);
  const p = new THREE.Points(g, c.mat); p.userData.n = ch.pos.length / 3; p.userData.noHit = true; p.raycast = () => {}; p.visible = false; c.group.add(p);
  ch.pts = p; ch.node = n; n.cd = ch; n.pts = p; n.rgb = ch.rgb; n.inten = ch.inten; n.state = 2; c.lod.res.add(n); c.lod.resPts += n.n;
}
function l3olDrops(c, n) { if (!n.pts) return; c.group.remove(n.pts); n.pts.geometry.dispose(); n.pts = null; n.cd = null; n.rgb = n.inten = null; n.state = 0; c.lod.res.delete(n); c.lod.resPts -= n.n; }
function l3olDispose(c) { if (!c.lod) return; [...c.lod.res].forEach(n => l3olDrops(c, n)); c.lod.dead = true; }
/* ---- Bygger molnet ur en öppnad okträdsfil ---- */
async function l3olBuild(src, op, onP) {
  const H = op.H, nodes = l3olNodes(H), pinMax = Math.max(1e6, Math.min(l3pcBudget(), 8e6)), pin = [], q = [nodes[0]]; let tot = 0;
  for (let h = 0; h < q.length && tot < pinMax; h++) { const n = q[h]; if (tot + n.n > pinMax * 1.15 && pin.length) break; pin.push(n); tot += n.n; n.ch.forEach(x => q.push(x)); }
  const L = { H, file: op.file, nodes, root: nodes[0], res: new Set(), resPts: 0, loading: 0, bud: 3e6, maxBud: Math.min(15e6, Math.max(4e6, l3pcMaxPts() * 0.4)), cap: Math.max(10e6, l3pcMaxPts() * 0.4), shown: [], t: 0, frame: 0, minPx: 100, sel: 0, selPts: 0, dead: false };
  const chunks = []; let k = 0;
  for (const n of pin) { chunks.push(await l3olRead(L, n)); if (onP) onP(++k / pin.length); if (k % 8 === 0) await l3pcYield(); }
  const data = { info: { n: tot, total: H.total, center: H.center, min: H.min, max: H.max, rgb: H.rgb, intensity: true, format: H.format + " · okträd" }, chunks };
  const c = l3pcBuildInit(src, data); c.lod = L; c.info.total = H.total;
  pin.forEach((n, i) => { n.pinned = true; l3olMake(c, n, chunks[i]); });
  return l3pcBuildDone(c);
}
/* Krokar i l3pcLoad: öppna ett redan byggt moln, eller bygg ett om molnet är större än punktbudgeten. */
async function l3olOpenCached(src, onP) { if (!l3olOn()) return null; const op = await l3olOpen(l3olKey(src)); if (!op) return null; onP("ur disken", 0.5); return l3olBuild(src, op, f => onP("öppnar", 0.5 + f * 0.5)); }
async function l3olAfterBytes(src, bytes, prog) {
  if (!l3olOn()) return null; const n = await l3olCount(bytes, src.name); if (!n) return null;
  const forced = l3Prefs().pcOctree === true; if (!forced && n <= Math.max(l3pcBudget(), 3e6)) return null;
  if (!(await l3olRoom(n * 10 * 2.2))) { l3Status(`Ingen plats på disken för okträdet (${l3pcMil(n * 22).replace(/ p$/, "")} byte behövs) – molnet glesas ut i stället.`, true); return null; }
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes]), key = l3olKey(src);
  try {
    await l3olConvert(blob, src, key, f => prog("bygger detaljnivåer (engångsjobb)", 0.1 + f * 0.85));
    const op = await l3olOpen(key); if (!op) throw new Error("okträdet kunde inte öppnas efter bygget");
    return await l3olBuild(src, op, f => prog("öppnar", 0.95 + f * 0.05));
  } catch (e) {
    if (e && e.cancelled) throw e;
    await l3olDrop(src); l3Status(`Okträd gick inte att bygga (${e.message}) – molnet glesas ut i stället.`, true); return null;
  }
}
/* ---- Urval per bild ---- */
let l3olHud = null, l3olHudT = 0;
function l3olCloud(c) {
  const L = c.lod; if (!L || L.dead) return;
  const cam = l3.camera, H = (l3.renderer.domElement.clientHeight || 800), persp = cam.isPerspectiveCamera, f = l3pcFrustum, sph = new THREE.Sphere(), cp = cam.getWorldPosition(new THREE.Vector3());
  c.group.updateWorldMatrix(true, false); const mw = c.group.matrixWorld, sc = mw.getMaxScaleOnAxis(), pxK = persp ? H / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) : H * (cam.zoom || 1) / ((cam.top - cam.bottom) || 1);
  const now = performance.now(); if (L.t && l3pcMoving) { const dt = now - L.t; if (dt > 24) L.bud *= Math.max(0.6, 17 / dt); else if (dt < 19) L.bud *= 1.05; L.bud = Math.max(4e5, Math.min(L.maxBud, L.bud)); } L.t = now;
  const bud = l3pcMoving ? L.bud : L.maxBud, minPx = l3pcMoving ? L.minPx * 1.4 : L.minPx * 0.7, c3 = new THREE.Vector3();
  const geo = n => { c3.set(n.cx, n.cy, n.cz).applyMatrix4(mw); sph.center.copy(c3); sph.radius = n.r * sc; return sph; };
  const px = n => { const s = geo(n), d = persp ? Math.max(1e-3, cp.distanceTo(s.center)) : 1; return s.radius * pxK / d; };
  const heap = [], push = (n, p) => { heap.push([p, n]); let i = heap.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (heap[j][0] >= heap[i][0]) break; [heap[j], heap[i]] = [heap[i], heap[j]]; i = j; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] > heap[m][0]) m = l; if (r < heap.length && heap[r][0] > heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  push(L.root, 1e9); const sel = [], need = []; let used = 0; L.frame++;
  while (heap.length && used < bud) {
    const [p, n] = pop(); if (!f.intersectsSphere(geo(n))) continue;
    if (n.state !== 2) { if (need.length < 12) need.push(n); continue; }
    sel.push(n); used += n.n; n.last = L.frame;
    for (const ch of n.ch) { const q = px(ch); if (q > minPx) push(ch, q); }
  }
  const keep = new Set(sel); L.shown.forEach(n => { if (!keep.has(n) && n.pts) n.pts.visible = false; }); sel.forEach(n => { n.pts.visible = true; }); L.shown = sel; L.sel = sel.length; L.selPts = used;
  // Punktstorlek: glesare bild → lite större punkter så att ytor hålls ihop.
  const base = c.mat.userData.base || c.mat.size, fz = Math.min(2.4, Math.max(1, Math.pow(H_total(c) / Math.max(1, used), 0.2))); c.mat.size = base * fz;
  // Läs in det som saknas (störst på skärmen först).
  for (const n of need) { if (L.loading >= 3) break; if (n.state === 1 || n.state === 2) continue; n.state = 1; L.loading++; l3olLoadNode(c, n); }
  l3olHudUpdate();
}
const H_total = c => c.info.total || c.nTot;
async function l3olLoadNode(c, n) {
  const L = c.lod;
  try { let ch = await l3olRead(L, n); if (L.dead) return; if (c.edits && c.edits.length && typeof l3peFilterData === "function") ch = l3peFilterData(c, ch); l3olMake(c, n, ch); l3olEvict(c); l3Render(); }
  catch (e) { n.state = 0; n.fail = (n.fail || 0) + 1; if (n.fail >= 3) n.state = 3; }   // 3 = ger upp
  finally { L.loading--; if (!L.dead) l3Render(); }
}
function l3olEvict(c) {
  const L = c.lod; if (L.resPts <= L.cap) return;
  const list = [...L.res].filter(n => !n.pinned && n.last !== L.frame && !(n.pts && n.pts.visible)).sort((a, b) => a.last - b.last);
  for (const n of list) { if (L.resPts <= L.cap * 0.85) break; l3olDrops(c, n); }
}
function l3olRecolor(c) {
  if (!c.lod) return;
  c.lod.res.forEach(n => { if (!n.pts) return; const ch = { pos: n.pts.geometry.getAttribute("position").array, rgb: n.rgb, inten: n.inten }; n.pts.geometry.setAttribute("color", new THREE.BufferAttribute(l3pcColors(c, ch), 3, true)); });
}
function l3olHudUpdate() {
  const now = performance.now(); if (now - l3olHudT < 250) return; l3olHudT = now;
  const cs = l3pc.clouds.filter(c => c.visible && c.lod); const host = document.getElementById("view3d");
  if (!cs.length || !host) { if (l3olHud) l3olHud.style.display = "none"; return; }
  if (!l3olHud) { l3olHud = document.createElement("div"); l3olHud.id = "v3PcHud"; l3olHud.style.cssText = "position:absolute;left:12px;bottom:46px;z-index:5;padding:4px 10px;border-radius:12px;background:rgba(15,23,42,.72);color:#cbd5e1;font:600 11px system-ui,sans-serif;pointer-events:none"; host.appendChild(l3olHud); }
  l3olHud.style.display = "block";
  l3olHud.textContent = cs.map(c => `${l3pcMil(c.lod.selPts).replace(/ p$/, "")} av ${l3pcMil(H_total(c)).replace(/ p$/, "")} punkter ritas${c.lod.loading ? " · läser in…" : ""}`).join(" · ");
}
/* ---- Inkoppling i befintlig punktmolnskod ---- */
if (typeof l3pcFrame === "function") { const f0 = l3pcFrame; l3pcFrame = window.l3pcFrame = function () { f0(); const v = l3pc.clouds.filter(c => c.visible && c.lod); if (v.length) { if (!l3pcFrustum) return; v.forEach(l3olCloud); } else if (l3olHud) l3olHud.style.display = "none"; }; }
if (typeof l3pcRecolor === "function") { const r0 = l3pcRecolor; l3pcRecolor = window.l3pcRecolor = function () { r0(); l3pc.clouds.forEach(c => { if (c.lod) { l3olRecolor(c); l3Render(); } }); }; }
if (typeof l3pcRemove === "function") { const d0 = l3pcRemove; l3pcRemove = window.l3pcRemove = function (id) { const c = l3pc.clouds.find(x => x.id === id); if (c && c.lod) l3olDispose(c); return d0(id); }; }
if (typeof l3pcForget === "function") { const g0 = l3pcForget; l3pcForget = window.l3pcForget = function (id) { const s = l3pcRemembered().find(x => x.id === id); if (s) { const { on, ...src } = s; l3olDrop(src); } return g0(id); }; }
