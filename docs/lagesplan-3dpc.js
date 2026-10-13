/* 3D-vyn – punktmoln (Victor 2026-10-12: "stöd för punktmoln i min 3d-editor utan att kompromissa med prestandan?
   Då ska dom moln gå att hämta från 'Reality capture' i Trimble connect om möjligt").

   – Källor: projektets mappar i Trimble Connect (Lager → Trimble Connect mapp – samma LAS/LAZ/E57-filer som
     Reality Capture tar emot) och en fil från datorn (Lager → ＋ Punktmoln från fil…).
   – Format: LAS, LAZ, XYZ/PTS/TXT och PLY (pc-worker.js). E57: exportera till LAZ/LAS.
   – Prestanda: läses i bakgrunden och glesas ut jämnt till en punktbudget (dator 6 milj., iPhone/iPad 1,5 milj.,
     ändras under Avancerat), delas i rutor så att det som inte syns inte ritas, punkterna är några skärmpixlar
     stora (billigt att rita). Det utglesade molnet sparas i webbläsarens cache – nästa gång öppnas det direkt.
   – Lager → Punktmoln: tänd/släck, zooma, ta bort; punktstorlek och färg (molnets färg, intensitet, höjd).
   – Visning (Victor 2026-10-12: "fler inställningar och verktyg till punktmolnet, jag älskar att fixa och trixa"):
     runda punkter, storlek i meter (växer när man zoomar in), enfärgat, ljusstyrka/kontrast, genomskinlighet,
     höjdfilter (bara ett skikt av molnet), höjdjustering per moln och "visa bara detta". Allt i grafikkortet
     eller en omfärgning – inget läses om.
   – Förlopp i molnets rad och i statusraden medan det hämtas och läses (Victor: "laddningsindikator"). */

const l3pc = { clouds: [], busy: false, worker: null, loading: null };
const L3PC_EXT = /\.(las|laz|xyz|pts|txt|ply|e57)$/i;
const L3PC_DB = "lagesplan-pc-cache", L3PC_STORE = "clouds", L3PC_KEEP = 4;
const l3pcKey = () => `lagesplan-pc-${projectId}`;
/* Punktbudget. "all" = full upplösning (Victor 2026-10-12: "ladda in punktmolnen i dess fulla upplösning"), med ett
   tak efter datorns minne så att fliken inte kraschar: ~16 byte per punkt i minnet och lika mycket i grafikkortet. */
const l3pcMaxPts = () => { const gb = (typeof navigator !== "undefined" && navigator.deviceMemory) || 8; return Math.round(Math.max(20e6, Math.min(250e6, gb * 1e9 / 45))); };
const l3pcBudget = () => { const v = l3Prefs().pcBudget; if (v === "all") return l3pcMaxPts(); const b = Number(v); return b > 0 ? b : (typeof lowMemDevice !== "undefined" && lowMemDevice ? 1.5e6 : 6e6); };
const l3pcSize = () => Number(l3Prefs().pcSize) || 2;
const l3pcMode = () => l3Prefs().pcMode || "auto";
const l3pcPref = (k, d) => { const v = l3Prefs()[k]; return v == null || v === "" ? d : v; };
const l3pcMil = n => (n < 100000 ? Math.round(n).toLocaleString("sv-SE") + " p" : (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(".", ",") + " milj.");

/* ---- Ihågkomna moln (per projekt, i webbläsaren) -------------------------------------------------- */
function l3pcRemembered() { try { return JSON.parse(localStorage.getItem(l3pcKey()) || "[]") || []; } catch (e) { return []; } }
function l3pcRemember(src, on) {
  const list = l3pcRemembered().filter(x => x.id !== src.id);
  list.push({ id: src.id, name: src.name, fileId: src.fileId || null, version: src.version || "", parentId: src.parentId || null, local: !!src.local, on: !!on, dz: Number(src.dz) || 0 });
  try { localStorage.setItem(l3pcKey(), JSON.stringify(list.slice(-20))); } catch (e) { /* privat läge */ }
}
function l3pcForget(id) {
  try { localStorage.setItem(l3pcKey(), JSON.stringify(l3pcRemembered().filter(x => x.id !== id))); } catch (e) { /* privat läge */ }
  l3pcRemove(id);
  if (typeof l3LayersRender === "function") l3LayersRender();
}

/* ---- Cache (det utglesade molnet) ----------------------------------------------------------------- */
function l3pcDb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === "undefined") return rej(new Error("ingen IndexedDB"));
    const q = indexedDB.open(L3PC_DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(L3PC_STORE);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}
const l3pcCacheKey = src => `${projectId}|${src.id}|${src.version || ""}|${l3pcBudget()}`;
async function l3pcCacheGet(src) {
  try {
    const db = await l3pcDb();
    return await new Promise(res => { const t = db.transaction(L3PC_STORE).objectStore(L3PC_STORE).get(l3pcCacheKey(src)); t.onsuccess = () => res(t.result || null); t.onerror = () => res(null); });
  } catch (e) { return null; }
}
async function l3pcCachePut(src, data) {
  try {
    const db = await l3pcDb(), st = db.transaction(L3PC_STORE, "readwrite").objectStore(L3PC_STORE);
    st.put({ ...data, at: Date.now() }, l3pcCacheKey(src));
    // Högst några moln sparade – de äldsta tas bort.
    const keys = await new Promise(res => { const q = db.transaction(L3PC_STORE).objectStore(L3PC_STORE).getAllKeys(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); });
    if (keys.length > L3PC_KEEP) {
      const ages = await Promise.all(keys.map(k => new Promise(res => { const q = db.transaction(L3PC_STORE).objectStore(L3PC_STORE).get(k); q.onsuccess = () => res([k, (q.result && q.result.at) || 0]); q.onerror = () => res([k, 0]); })));
      ages.sort((a, b) => a[1] - b[1]).slice(0, keys.length - L3PC_KEEP).forEach(([k]) => db.transaction(L3PC_STORE, "readwrite").objectStore(L3PC_STORE).delete(k));
    }
  } catch (e) { console.warn("Punktmolnets cache", e); }
}

/* ---- Läsning i bakgrunden ------------------------------------------------------------------------- */
function l3pcParse(bytes, name, onProgress) {
  return new Promise((res, rej) => {
    const w = new Worker("pc-worker.js?v=1");
    w.onmessage = ev => {
      const d = ev.data;
      if (d.type === "progress") { if (onProgress) onProgress(d.f); return; }
      w.terminate();
      if (d.type === "done") res(d); else rej(new Error(d.message || "Kunde inte läsa punktmolnet."));
    };
    w.onerror = e => { w.terminate(); rej(new Error(e.message || "Kunde inte läsa punktmolnet.")); };
    // En fil från datorn (Blob) läses av workern direkt från disken, bit för bit – ingen kopia i minnet.
    if (typeof Blob !== "undefined" && bytes instanceof Blob) w.postMessage({ file: bytes, name, budget: l3pcBudget() });
    else w.postMessage({ bytes, name, budget: l3pcBudget() }, [bytes]);
  });
}

/* ---- Visning --------------------------------------------------------------------------------------- */
const L3PC_RAMP = [[0, [43, 131, 186]], [0.25, [171, 221, 164]], [0.5, [255, 255, 191]], [0.75, [253, 174, 97]], [1, [215, 25, 28]]];
function l3pcRamp(t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < L3PC_RAMP.length; i++) if (t <= L3PC_RAMP[i][0]) {
    const [a, A] = L3PC_RAMP[i - 1], [b, B] = L3PC_RAMP[i], k = (t - a) / (b - a || 1);
    return [0, 1, 2].map(c => Math.round(A[c] + (B[c] - A[c]) * k));
  }
  return L3PC_RAMP[L3PC_RAMP.length - 1][1];
}
/* Färgen per punkt: molnets egen färg, intensitet (grå) eller höjd (blå → röd). */
function l3pcColors(c, ch) {
  const out = l3pcColorsBase(c, ch);
  const b = Number(l3pcPref("pcBright", 0)) * 2.55, k = Number(l3pcPref("pcContrast", 100)) / 100;
  if (!b && k === 1) return out;
  const res = out === ch.rgb ? new Uint8Array(out) : out, lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.max(0, Math.min(255, Math.round((v - 128) * k + 128 + b)));
  for (let i = 0; i < res.length; i++) res[i] = lut[res[i]];
  return res;
}
function l3pcColorsBase(c, ch) {
  let mode = l3pcMode();
  if (mode === "solid") {
    const hx = String(l3pcPref("pcColor", "#94a3b8")).replace("#", ""), r = parseInt(hx.slice(0, 2), 16) || 0, g = parseInt(hx.slice(2, 4), 16) || 0, bl = parseInt(hx.slice(4, 6), 16) || 0;
    const n = ch.pos.length / 3, o = new Uint8Array(n * 3); for (let i = 0; i < n; i++) { o[i * 3] = r; o[i * 3 + 1] = g; o[i * 3 + 2] = bl; } return o;
  }
  if (mode === "auto") mode = c.info.rgb ? "rgb" : c.info.intensity ? "int" : "z";
  if (mode === "rgb" && !c.info.rgb) mode = c.info.intensity ? "int" : "z";
  if (mode === "rgb") return ch.rgb;
  const n = ch.inten.length, out = new Uint8Array(n * 3);
  if (mode === "int") { for (let i = 0; i < n; i++) { const v = 40 + ch.inten[i] * 0.84; out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = v; } return out; }
  const z0 = c.info.min[2] - c.info.center[2], dz = Math.max(1e-6, c.info.max[2] - c.info.min[2]);
  const lut = []; for (let k = 0; k < 256; k++) lut.push(l3pcRamp(k / 255));
  for (let i = 0; i < n; i++) { const q = lut[Math.max(0, Math.min(255, Math.round((ch.pos[i * 3 + 2] - z0) / dz * 255)))]; out[i * 3] = q[0]; out[i * 3 + 1] = q[1]; out[i * 3 + 2] = q[2]; }
  return out;
}
function l3pcBuild(src, data) {
  if (!l3.groups.pc) { const g = new THREE.Group(); g.name = "pc"; l3.groups.pc = g; l3.scene.add(g); }
  const grp = new THREE.Group(), mat = new THREE.PointsMaterial({ size: l3pcSize(), sizeAttenuation: false, vertexColors: true });
  const c = { id: src.id, name: src.name, src, info: data.info, chunks: data.chunks, group: grp, mat, visible: true, dz: Number(src.dz) || 0 };
  data.chunks.forEach(ch => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(ch.pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(l3pcColors(c, ch), 3, true));
    g.computeBoundingSphere();
    const p = new THREE.Points(g, mat);
    p.userData.noHit = true; p.raycast = () => {}; // punkterna är inte ytor (mät/fäst)
    grp.add(p);
  });
  grp.userData.pc = c;
  l3.groups.pc.add(grp);
  l3pcBuildLod(c);
  if (typeof l3RenderSnapBar === "function") l3RenderSnapBar(); // Fäst-raden får knappen Moln
  l3pc.clouds.push(c);
  l3pcPlace(c);
  l3pcIndexIdle(c); // för att fästa mot punkterna
  return c;
}
/* Molnet ligger i modellens koordinater (som IFC och DXF) – flyttas med 3D-vyns origo (och sin höjdjustering). */
function l3pcPlace(c) { c.group.position.set(c.info.center[0] - l3.O[0], c.info.center[1] - l3.O[1], c.info.center[2] - l3.O[2] + (c.dz || 0)); if (c.lod) c.lod.position.copy(c.group.position); l3pcMatApply(c); }
/* ---- Smidig navigering i stora moln (Victor 2026-10-12: "navigera bättre"): medan kameran rör sig ritas en
   jämnt utglesad kopia (~2 milj. punkter per moln); när den stannat ritas hela molnet igen. Kopian är ~1/k av
   minnet och följer färg, storlek och filter (samma material). -------------------------------------------- */
const L3PC_LOD_PTS = 2e6;
function l3pcBuildLod(c) {
  const n = c.chunks.reduce((a, ch) => a + ch.pos.length / 3, 0);
  if (n <= L3PC_LOD_PTS * 1.25) return;
  const k = Math.ceil(n / L3PC_LOD_PTS), g = new THREE.Group();
  g.name = "pc-lod"; g.visible = false; g.userData.noHit = true;
  c.lodChunks = c.chunks.map(ch => {
    const m = Math.floor(ch.pos.length / 3 / k), pos = new Float32Array(m * 3), rgb = ch.rgb ? new Uint8Array(m * 3) : null, inten = ch.inten ? new Uint8Array(m) : null;
    // Slumpmässig förskjutning per steg så att inga rader/ränder syns i kopian.
    let seed = 12345;
    for (let j = 0; j < m; j++) {
      seed = (seed * 1103515245 + 12345) >>> 0; const i = j * k + (seed % k);
      pos[j * 3] = ch.pos[i * 3]; pos[j * 3 + 1] = ch.pos[i * 3 + 1]; pos[j * 3 + 2] = ch.pos[i * 3 + 2];
      if (rgb) { rgb[j * 3] = ch.rgb[i * 3]; rgb[j * 3 + 1] = ch.rgb[i * 3 + 1]; rgb[j * 3 + 2] = ch.rgb[i * 3 + 2]; }
      if (inten) inten[j] = ch.inten[i];
    }
    return { pos, rgb, inten };
  });
  c.lodChunks.forEach(ch => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(ch.pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(l3pcColors(c, ch), 3, true));
    geo.computeBoundingSphere();
    const p = new THREE.Points(geo, c.lodMat || (c.lodMat = c.mat.clone())); p.userData.noHit = true; p.raycast = () => {};
    g.add(p);
  });
  c.lod = g; c.lodK = k;
  l3pcLodMatApply(c);
  l3.groups.pc.add(g);
}
/* Den utglesade kopian ritas med större punkter (Victor 2026-10-13: "glesar ut punktmolnet direkt man rör sig") så att
   ytor fortfarande läses som ytor medan kameran rör sig – lika många punkter, bara fyllnaden ökar. */
function l3pcLodMatApply(c) {
  const L = c.lodMat; if (!L) return;
  const m = c.mat, f = Math.min(2.4, 0.62 * Math.sqrt(c.lodK || 1));
  L.sizeAttenuation = m.sizeAttenuation; L.size = m.size * Math.max(1, f);
  L.map = m.map; L.alphaTest = m.alphaTest; L.transparent = m.transparent; L.opacity = m.opacity; L.depthWrite = m.depthWrite; L.clippingPlanes = m.clippingPlanes;
  L.needsUpdate = true;
}
let l3pcCam = null, l3pcStillT = 0, l3pcMoving = false, l3pcAnchor = null, l3pcSince = 0;
function l3pcSetMoving(on) {
  l3pcMoving = on;
  l3pc.clouds.forEach(c => { if (!c.lod) return; c.lod.visible = on && c.visible; c.group.children.forEach(p => { p.visible = !on; }); });
}
/* Anropas före varje bild: rör sig kameran på riktigt? En liten knuff (en pytteliten flytt eller vridning) räknas inte:
   det krävs en märkbar förändring mot där kameran stod stilla OCH att den håller i sig en kort stund (~90 ms) innan
   den utglesade kopian tar över. Då ser man hela molnet vid små justeringar. */
function l3pcFrame() {
  if (!l3pc.clouds.some(c => c.lod && c.visible) || l3Prefs().pcLod === false) { if (l3pcMoving) l3pcSetMoving(false); l3pcAnchor = null; return; }
  const cam = l3.camera; cam.updateMatrixWorld();
  const e = cam.matrixWorld.elements, key = e.map(v => v.toFixed(4)).join() + (cam.zoom || 1), now = performance.now();
  const pos = new THREE.Vector3(e[12], e[13], e[14]), fwd = new THREE.Vector3(-e[8], -e[9], -e[10]), zoom = cam.zoom || 1;
  if (!l3pcAnchor) l3pcAnchor = { pos, fwd, zoom };
  if (l3pcCam !== null && key !== l3pcCam) {
    const A = l3pcAnchor, dist = Math.max(1, pos.distanceTo(l3.orbit.target));
    const big = pos.distanceTo(A.pos) > Math.max(0.03, dist * 0.008) || Math.acos(Math.min(1, Math.max(-1, fwd.dot(A.fwd)))) > 0.012 || Math.abs(zoom / A.zoom - 1) > 0.02;
    if (l3pcMoving || big) {
      if (!l3pcSince) l3pcSince = now;
      if (!l3pcMoving && now - l3pcSince > 90) l3pcSetMoving(true);
      clearTimeout(l3pcStillT);
      l3pcStillT = setTimeout(() => { l3pcSince = 0; l3pcAnchor = null; l3pcSetMoving(false); l3Render(); }, 220);
    }
  } else if (l3pcCam !== null && !l3pcMoving) l3pcSince = 0;
  l3pcCam = key;
}
/* Rund punkt: en liten cirkel som mask (alphaTest) – lika billig som fyrkanten. */
let l3pcDisc = null;
function l3pcDiscTex() {
  if (l3pcDisc) return l3pcDisc;
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  const x = cv.getContext("2d"); x.fillStyle = "#fff"; x.beginPath(); x.arc(32, 32, 30, 0, Math.PI * 2); x.fill();
  l3pcDisc = new THREE.CanvasTexture(cv); return l3pcDisc;
}
/* Visningen i grafikkortet: storlek (pixlar eller meter), form, genomskinlighet och höjdfiltret. */
function l3pcMatApply(c) {
  const m = c.mat, atten = !!l3Prefs().pcAtten, round = !!l3Prefs().pcRound, op = Number(l3pcPref("pcOpacity", 100)) / 100;
  m.sizeAttenuation = atten;
  m.size = atten ? l3pcSize() * 0.02 : l3pcSize(); // i meter: 2 → 4 cm
  m.map = round ? l3pcDiscTex() : null; m.alphaTest = round ? 0.5 : 0;
  m.transparent = op < 0.999; m.opacity = op; m.depthWrite = op >= 0.999;
  const lo = Number(l3pcPref("pcZlo", 0)), hi = Number(l3pcPref("pcZhi", 100));
  if (lo > 0 || hi < 100) {
    const z0 = c.info.min[2], span = c.info.max[2] - c.info.min[2], base = -l3.O[2] + (c.dz || 0);
    m.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 0, 1), -(z0 + span * lo / 100 + base)), new THREE.Plane(new THREE.Vector3(0, 0, -1), z0 + span * hi / 100 + base)];
    l3.renderer.localClippingEnabled = true;
  } else m.clippingPlanes = null;
  m.needsUpdate = true;
  l3pcLodMatApply(c);
}
function l3pcApplyAll() { l3pc.clouds.forEach(l3pcMatApply); l3Render(); }
function l3pcRemove(id) {
  const i = l3pc.clouds.findIndex(c => c.id === id);
  if (i < 0) return;
  const c = l3pc.clouds[i];
  c.group.children.forEach(p => p.geometry.dispose()); c.mat.dispose();
  if (c.group.parent) c.group.parent.remove(c.group);
  if (c.lod) { c.lod.children.forEach(p => p.geometry.dispose()); if (c.lod.parent) c.lod.parent.remove(c.lod); }
  l3pc.clouds.splice(i, 1);
  l3Render();
}
function l3pcShow(id, on) {
  const c = l3pc.clouds.find(x => x.id === id); if (!c) return;
  c.visible = on; c.group.visible = on; if (c.lod) c.lod.visible = on && l3pcMoving; l3pcRemember(c.src, on); l3Render();
}
function l3pcRecolor() {
  l3pc.clouds.forEach(c => {
    c.group.children.forEach((p, k) => { p.geometry.setAttribute("color", new THREE.BufferAttribute(l3pcColors(c, c.chunks[k]), 3, true)); });
    if (c.lod) c.lod.children.forEach((p, k) => { p.geometry.setAttribute("color", new THREE.BufferAttribute(l3pcColors(c, c.lodChunks[k]), 3, true)); });
  });
  l3Render();
}
function l3pcResize() { l3pcApplyAll(); }
/* Höjdjustering per moln (t.ex. när molnet ligger i ett annat höjdsystem än modellen) – sparas med molnet. */
async function l3pcSetDz(id) {
  const c = l3pc.clouds.find(x => x.id === id); if (!c) return;
  const v = await uiPrompt(`Höjdjustering för ${c.name} i meter (+ uppåt, − nedåt):`, String(c.dz || 0).replace(".", ","));
  if (v == null) return;
  const dz = Number(String(v).replace(",", ".").replace(/\s/g, ""));
  if (!Number.isFinite(dz) || Math.abs(dz) > 10000) { l3Status("Höjdjusteringen ska vara ett tal i meter, t.ex. 2,5 eller -110.", true); return; }
  c.dz = dz; c.src.dz = dz; l3pcPlace(c); l3pcRemember(c.src, c.visible); l3Render();
  l3Status(`☁ ${c.name}: höjdjustering ${dz.toLocaleString("sv-SE")} m.`);
  if (typeof l3LayersRender === "function") l3LayersRender();
}
/* Visa bara detta moln (de andra släcks) – trycks igen för att tända alla. */
function l3pcSolo(id) {
  const others = l3pc.clouds.filter(c => c.id !== id);
  const solo = others.some(c => c.visible);
  others.forEach(c => l3pcShow(c.id, !solo)); l3pcShow(id, true);
  if (typeof l3LayersRender === "function") l3LayersRender();
}
function l3pcZoom(id) {
  const c = l3pc.clouds.find(x => x.id === id); if (!c) return;
  const ctr = new THREE.Vector3(...c.info.center).sub(new THREE.Vector3(...l3.O)), s = Math.max(5, Math.hypot(c.info.max[0] - c.info.min[0], c.info.max[1] - c.info.min[1], c.info.max[2] - c.info.min[2]));
  l3FlyTo(ctr, s * 0.9);
}

/* ---- Läsa in --------------------------------------------------------------------------------------- */
/* src = { id, name, fileId?, version?, parentId?, local? }; getBytes(onProgress) ger filens ArrayBuffer. */
async function l3pcLoad(src, getBytes, opts = {}) {
  if (l3pc.clouds.some(c => c.id === src.id)) { l3pcShow(src.id, true); return; }
  if (l3pc.busy) { l3Status("Vänta tills det andra punktmolnet är inläst."); return; }
  l3pc.busy = true;
  const key = "pc", lbl = `Punktmoln: ${src.name}`;
  const prog = (phase, f) => { busyProgress(key, `${lbl} – ${phase}`, f); l3pcProgress(src, phase, f); };
  try {
    const t0 = performance.now();
    let data = await l3pcCacheGet(src), how = "ur webbläsarens cache";
    if (data) prog("ur cachen", 0.9);
    if (!data) {
      if (opts.cacheOnly) return;
      if (!getBytes) throw new Error("Filen finns inte kvar – välj den igen.");
      prog(src.local ? "öppnar filen" : "hämtar", 0);
      const bytes = await getBytes(f => prog(src.local ? "öppnar filen" : "hämtar", f * 0.5));
      prog("läser punkterna", 0.5);
      data = await l3pcParse(bytes, src.name, f => prog("läser punkterna", 0.5 + f * 0.45));
      prog("bygger 3D", 0.96);
      how = data.info.format;
      if ((src.version || src.local) && data.info.n <= 25e6) l3pcCachePut(src, data); // jättemoln sparas inte i webbläsaren (för stort)
    }
    l3pcBuild(src, data);
    l3pcRemember(src, true);
    const i = data.info;
    l3Status(`☁ ${src.name}: ${l3pcMil(i.n).replace(/ p$/, "")} punkter visas${i.total > i.n ? ` av ${l3pcMil(i.total).replace(/ p$/, "")} (${l3Prefs().pcBudget === "all" ? "taket för datorns minne" : "glesat jämnt – full upplösning: Lager → Inställningar → Punkter per moln"})` : " (full upplösning)"} – ${how}, ${((performance.now() - t0) / 1000).toFixed(1).replace(".", ",")} s.`);
    if (opts.zoom !== false && !opts.cacheOnly) l3pcZoom(src.id);
  } catch (e) {
    l3Status(`Kunde inte visa punktmolnet ${src.name}: ${e.message}`, true);
  } finally {
    busyProgress(key, "", null);
    l3pc.busy = false; l3pc.loading = null;
    if (typeof l3LayersRender === "function") l3LayersRender();
    l3Render();
  }
}
/* Förloppet: en egen rad i Lager → Punktmoln (stapel + procent) och statusraden. Uppdateras på plats –
   listan ritas bara om när raden dyker upp. */
function l3pcProgress(src, phase, f) {
  const first = !l3pc.loading;
  l3pc.loading = { id: src.id, name: src.name, phase, f: Math.max(0, Math.min(1, f || 0)) };
  const pct = Math.round(l3pc.loading.f * 100);
  if (typeof l3StatusLive === "function") l3StatusLive(`☁ ${src.name} – ${phase} ${pct} %`);
  const el = document.getElementById("v3PcLoad");
  if (el) { el.querySelector("i").style.width = Math.max(2, pct) + "%"; el.querySelector("em").textContent = `${phase} ${pct} %`; }
  else if (first && typeof l3LayersRender === "function") l3LayersRender();
}
/* Ur projektets mappar i Trimble Connect (Lager → Trimble Connect mapp). */
function l3pcFromTc(fileId, name, f, parentId) {
  if (/\.e57$/i.test(name)) { l3Status("E57 kan inte läsas här än – exportera molnet som LAZ eller LAS (t.ex. i Trimble Business Center, RealWorks eller CloudCompare) och lägg filen i Trimble Connect.", true); return; }
  const src = { id: "pc:f:" + fileId, name, fileId, version: (f && (f.versionId || (f.modified ? String(f.modified) : ""))) || "", parentId: parentId || null };
  const on = l3pc.clouds.find(c => c.id === src.id);
  if (on) { l3pcShow(src.id, !on.visible); if (typeof l3LayersRender === "function") l3LayersRender(); return; }
  return l3pcLoad(src, onP => askOpener("tcFile", { fileId, name }, 0, (fr, got, tot) => onP(tot ? got / tot : fr || 0)).then(r => r.bytes));
}
/* Från datorn. */
let l3pcInput = null;
function l3pcFromFile() {
  if (!l3pcInput) {
    l3pcInput = document.createElement("input");
    l3pcInput.type = "file"; l3pcInput.accept = ".las,.laz,.xyz,.pts,.txt,.csv,.ply,.e57";
    l3pcInput.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;left:0;top:0;";
    document.getElementById("view3d").appendChild(l3pcInput);
    l3pcInput.onchange = () => {
      const f = l3pcInput.files[0]; l3pcInput.value = "";
      if (!f) return;
      if (/\.e57$/i.test(f.name)) { l3Status("E57 kan inte läsas här än – exportera molnet som LAZ eller LAS (t.ex. i Trimble Business Center, RealWorks eller CloudCompare).", true); return; }
      const src = { id: `pc:l:${f.name}:${f.size}:${f.lastModified}`, name: f.name, version: `${f.size}-${f.lastModified}`, local: true, fileObj: f };
      l3pcLoad(src, async onP => { onP(1); return f; }); // filen själv: workern läser den bit för bit (även över 2 GB)
    };
  }
  l3pcInput.click();
}
/* Vid öppning: de tända molnen direkt ur cachen (inte på iPhone/iPad – minnet; de tänds för hand). */
async function l3pcRestore() {
  if (typeof lowMemDevice !== "undefined" && lowMemDevice) return;
  for (const s of l3pcRemembered().filter(x => x.on !== false)) {
    const { on, ...src } = s;
    await l3pcLoad(src, null, { cacheOnly: true, zoom: false });
  }
}
/* Ett ihågkommet, släckt moln tänds: ur cachen, annars från Trimble Connect. */
function l3pcLoadRemembered(id) {
  const s = l3pcRemembered().find(x => x.id === id); if (!s) return;
  const { on, ...src } = s;
  if (src.fileId) return l3pcLoad(src, onP => askOpener("tcFile", { fileId: src.fileId, name: src.name }, 0, (fr, got, tot) => onP(tot ? got / tot : fr || 0)).then(r => r.bytes));
  return l3pcLoad(src, null).then(() => { if (!l3pc.clouds.some(c => c.id === id)) l3Status(`${src.name} finns inte kvar i webbläsarens cache – välj filen igen med ＋ Punktmoln från fil…`, true); });
}

/* ---- Lager → 3D-modeller: gruppen Punktmoln ------------------------------------------------------- */
function l3pcCount() { return l3pc.clouds.length + l3pcRemembered().filter(s => !l3pc.clouds.some(c => c.id === s.id)).length; }
function l3pcHtml(row, esc) {
  const rest = l3pcRemembered().filter(s => !l3pc.clouds.some(c => c.id === s.id) && !(l3pc.loading && l3pc.loading.id === s.id));
  const rows = [...l3pc.clouds.map(c => ({ c, name: c.name })), ...rest.map(s => ({ s, name: s.name }))].sort((a, b) => String(a.name).localeCompare(String(b.name), "sv", { numeric: true }));
  const del = id => `<button type="button" class="v3-lr-zoom v3-lr-del" data-pc-forget="${esc(id)}" title="Ta bort ur listan (inget i Trimble Connect ändras)">${L3_ICO.trash}</button>`;
  const more = id => `<button type="button" class="v3-lr-zoom v3-lr-more" data-pc-more="${esc(id)}" title="Fler val">⋯</button>`;
  let h = rows.map(({ c, s, name }) => c
    ? row(`data-pc-eye="${esc(c.id)}"`, c.visible, esc(name) + (c.dz ? ` <em title="Höjdjustering">${c.dz > 0 ? "+" : ""}${String(c.dz).replace(".", ",")} m</em>` : ""), `<em class="v3-lr-k" title="${esc(c.info.format)} · ${c.info.n.toLocaleString("sv-SE")} av ${c.info.total.toLocaleString("sv-SE")} punkter">${l3pcMil(c.info.n)}</em><span class="v3-lr-acts"><button type="button" class="v3-lr-zoom" data-pc-zoom="${esc(c.id)}" title="Zooma till molnet">${L3_ICO.focus}</button>${more(c.id)}${del(c.id)}</span>`)
    : row(`data-pc-rem="${esc(s.id)}"`, false, esc(name), `<span class="v3-lr-acts">${del(s.id)}</span>`)).join("");
  const L = l3pc.loading;
  if (L) h += `<div class="v3-lr v3-pc-loading"><span class="pm-spin"></span><span class="v3-lr-n" title="${esc(L.name)}">${esc(L.name)}</span><span class="v3-pc-load" id="v3PcLoad"><span class="v3-pc-bar"><i style="width:${Math.max(2, Math.round(L.f * 100))}%"></i></span><em>${esc(L.phase)} ${Math.round(L.f * 100)} %</em></span></div>`;
  if (!rows.length && !L) h += `<div class="v3-pal-hint">Inga punktmoln. Lägg till med ＋ ovan – från datorn eller ur en mapp i Trimble Connect.</div>`;
  if (l3pc.clouds.length) {
    const P = l3Prefs(), mode = l3pcMode(), lo = Number(l3pcPref("pcZlo", 0)), hi = Number(l3pcPref("pcZhi", 100));
    const c0 = l3pc.clouds[0], zAt = t => (c0.info.min[2] + (c0.info.max[2] - c0.info.min[2]) * t / 100 + (c0.dz || 0)).toFixed(1).replace(".", ",");
    const sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, l]) => `<option value="${k}" ${String(v) === k ? "selected" : ""}>${l}</option>`).join("")}</select>`;
    h += `<details class="v3-sub v3-pc-view" ${P.pcViewOpen ? "open" : ""}><summary>Visning</summary><div class="v3-pc-grid">
      <label>Färg</label><div class="v3-pc-f">${sel("v3PcMode", [["auto", "Automatiskt"], ["rgb", "Molnets färg"], ["int", "Intensitet"], ["z", "Höjd"], ["solid", "Enfärgad"]], mode)}${mode === "solid" ? `<input type="color" id="v3PcColor" value="${esc(l3pcPref("pcColor", "#94a3b8"))}" title="Färg" />` : ""}</div>
      <label title="Punkternas storlek">Storlek</label><div class="v3-pc-f"><input type="range" id="v3PcSize" min="0.5" max="8" step="0.5" value="${l3pcSize()}" /><output>${String(l3pcSize()).replace(".", ",")}</output></div>
      <label title="I skärmen: lika stora på alla avstånd. I meter: växer när du zoomar in, som riktiga ytor.">Skala</label><div class="v3-pc-f">${sel("v3PcAtten", [["", "Pixlar"], ["1", "Meter"]], P.pcAtten ? "1" : "")}</div>
      <label>Form</label><div class="v3-pc-f"><div class="v3-segs v3-pc-seg"><button type="button" data-pc-round="" class="${P.pcRound ? "" : "on"}">■ Fyrkant</button><button type="button" data-pc-round="1" class="${P.pcRound ? "on" : ""}">● Rund</button></div></div>
      <label>Ljus</label><div class="v3-pc-f"><input type="range" id="v3PcBright" min="-50" max="50" step="5" value="${l3pcPref("pcBright", 0)}" /><output>${l3pcPref("pcBright", 0)}</output></div>
      <label>Kontrast</label><div class="v3-pc-f"><input type="range" id="v3PcContrast" min="50" max="200" step="10" value="${l3pcPref("pcContrast", 100)}" /><output>${l3pcPref("pcContrast", 100)} %</output></div>
      <label title="Genomskinlighet – se modellen genom molnet">Täckning</label><div class="v3-pc-f"><input type="range" id="v3PcOpacity" min="10" max="100" step="5" value="${l3pcPref("pcOpacity", 100)}" /><output>${l3pcPref("pcOpacity", 100)} %</output></div>
      <label title="Visa bara ett skikt av molnet – t.ex. ta bort taket eller marken">Höjd</label><div class="v3-pc-f v3-pc-z"><input type="range" id="v3PcZlo" min="0" max="100" step="1" value="${lo}" /><input type="range" id="v3PcZhi" min="0" max="100" step="1" value="${hi}" /><output>${zAt(lo)}–${zAt(hi)} m</output></div>
    </div><button type="button" class="v3-link" id="v3PcReset">Återställ visningen</button></details>`;
  }
  return h;
}
/* Menyn ⋯ på ett moln. */
function l3pcMoreMenu(btn, id) {
  document.querySelectorAll(".v3-pc-menu").forEach(m => m.remove());
  const c = l3pc.clouds.find(x => x.id === id); if (!c) return;
  const m = document.createElement("div"); m.className = "v3-pc-menu v3-ldd-m";
  const others = l3pc.clouds.some(x => x.id !== id && x.visible);
  m.innerHTML = `<button type="button" data-a="zoom">Zooma till molnet</button><button type="button" data-a="solo" ${l3pc.clouds.length < 2 ? "disabled" : ""}>${others || l3pc.clouds.length < 2 ? "Visa bara detta moln" : "Tänd alla moln"}</button><button type="button" data-a="dz">Höjdjustering…${c.dz ? ` (${String(c.dz).replace(".", ",")} m)` : ""}</button><button type="button" data-a="reload" title="Med inställningen Punkter per moln som gäller nu (t.ex. full upplösning)">Läs in igen</button><button type="button" data-a="info">Om molnet</button><hr /><button type="button" data-a="del" class="bad">Ta bort ur listan</button>`;
  btn.closest(".v3-lr").after(m);
  m.onclick = e => {
    const a = e.target.closest("[data-a]"); if (!a) return; m.remove();
    if (a.dataset.a === "zoom") l3pcZoom(id);
    else if (a.dataset.a === "solo") l3pcSolo(id);
    else if (a.dataset.a === "dz") l3pcSetDz(id);
    else if (a.dataset.a === "del") l3pcForget(id);
    else if (a.dataset.a === "reload") {
      // Med den punktbudget som gäller nu; en fil från datorn läses igen ur samma fil (finns kvar tills sidan laddas om).
      const src = { ...c.src }; l3pcRemove(id); l3pcRemember(src, true);
      if (src.fileObj) l3pcLoad(src, async onP => { onP(1); return src.fileObj; }); else l3pcLoadRemembered(id);
    }
    else if (a.dataset.a === "info") { const i = c.info, f = v => v.toFixed(2).replace(".", ","); l3Status(`☁ ${c.name}: ${i.format}, ${i.n.toLocaleString("sv-SE")} av ${i.total.toLocaleString("sv-SE")} punkter visas. ${i.rgb ? "Har färg. " : ""}${i.intensity ? "Har intensitet. " : ""}X ${f(i.min[0])}–${f(i.max[0])}, Y ${f(i.min[1])}–${f(i.max[1])}, Z ${f(i.min[2])}–${f(i.max[2])} m.`); }
  };
  setTimeout(() => { const off = e => { if (!m.contains(e.target)) { m.remove(); document.removeEventListener("mousedown", off, true); } }; document.addEventListener("mousedown", off, true); }, 0);
}
function l3pcBind(host) {
  host.querySelectorAll("[data-pc-eye]").forEach(b => { b.onclick = () => { const c = l3pc.clouds.find(x => x.id === b.dataset.pcEye); if (c) { l3pcShow(c.id, !c.visible); l3LayersRender(); } }; });
  host.querySelectorAll("[data-pc-rem]").forEach(b => { b.onclick = () => l3pcLoadRemembered(b.dataset.pcRem); });
  host.querySelectorAll("[data-pc-zoom]").forEach(b => { b.onclick = () => l3pcZoom(b.dataset.pcZoom); });
  host.querySelectorAll("[data-pc-forget]").forEach(b => { b.onclick = () => l3pcForget(b.dataset.pcForget); });
  host.querySelectorAll("[data-pc-more]").forEach(b => { b.onclick = e => { e.stopPropagation(); l3pcMoreMenu(b, b.dataset.pcMore); }; });
  const out = (el, t) => { const o = el.parentElement.querySelector("output"); if (o) o.textContent = t; };
  // Omfärgning (ljus/kontrast) först när reglaget släpps – grafikkortsinställningarna direkt medan man drar.
  const live = (id, key, fn, txt) => { const el = host.querySelector("#" + id); if (!el) return; el.oninput = () => { l3SetPref(key, Number(el.value)); out(el, txt(el.value)); fn(false); }; el.onchange = () => fn(true); };
  live("v3PcSize", "pcSize", () => l3pcApplyAll(), v => String(v).replace(".", ","));
  live("v3PcOpacity", "pcOpacity", () => l3pcApplyAll(), v => v + " %");
  live("v3PcBright", "pcBright", end => end && l3pcRecolor(), v => v);
  live("v3PcContrast", "pcContrast", end => end && l3pcRecolor(), v => v + " %");
  const zl = host.querySelector("#v3PcZlo"), zh = host.querySelector("#v3PcZhi");
  if (zl && zh) {
    const c0 = l3pc.clouds[0], zAt = t => (c0.info.min[2] + (c0.info.max[2] - c0.info.min[2]) * t / 100 + (c0.dz || 0)).toFixed(1).replace(".", ",");
    const z = () => { let lo = Number(zl.value), hi = Number(zh.value); if (lo > hi - 1) { if (document.activeElement === zl) lo = hi - 1; else hi = lo + 1; zl.value = lo; zh.value = hi; } l3SetPref("pcZlo", lo); l3SetPref("pcZhi", hi); out(zh, `${zAt(lo)}–${zAt(hi)} m`); l3pcApplyAll(); };
    zl.oninput = z; zh.oninput = z;
  }
  const md = host.querySelector("#v3PcMode"); if (md) md.onchange = () => { l3SetPref("pcMode", md.value); l3pcRecolor(); l3LayersRender(); };
  const pc = host.querySelector("#v3PcColor"); if (pc) pc.oninput = () => { l3SetPref("pcColor", pc.value); l3pcRecolor(); };
  const at = host.querySelector("#v3PcAtten"); if (at) at.onchange = () => { l3SetPref("pcAtten", !!at.value); l3pcApplyAll(); };
  host.querySelectorAll("[data-pc-round]").forEach(b => { b.onclick = () => { l3SetPref("pcRound", !!b.dataset.pcRound); l3pcApplyAll(); l3LayersRender(); }; });
  const vw = host.querySelector(".v3-pc-view"); if (vw) vw.ontoggle = () => l3SetPref("pcViewOpen", vw.open);
  const rs = host.querySelector("#v3PcReset"); if (rs) rs.onclick = () => { ["pcSize", "pcAtten", "pcRound", "pcBright", "pcContrast", "pcOpacity", "pcZlo", "pcZhi", "pcMode"].forEach(k => l3SetPref(k, null)); l3pcApplyAll(); l3pcRecolor(); l3LayersRender(); };
  const fb = host.querySelector("#v3PcFile"); if (fb) fb.onclick = () => l3pcFromFile();
}

/* ---- Fästa mot punkter i molnet (Victor 2026-10-12: "snappa mot punkter i punktmolnen så att jag både kan lägga
   mått och rotera runt punkterna") ----------------------------------------------------------------------------
   Punkten närmast kameran som ligger inom några skärmpixlar från markörens stråle. Bara molnets rutor (kolumner)
   som strålen passerar gås igenom; höjdfiltret och snitten gäller (bortfiltrerade punkter går inte att fästa mot).
   Fästet av/på: Fäst-raden → Moln. */
const l3pcSnapOn = () => l3Snaps().pc !== false;
/* Index för att hitta punkter snabbt: varje ruta (kolumn) sorteras om i små celler (4×4 i plan × skikt i höjd,
   ~1000 punkter per cell) så att cellerna ligger i följd i samma arrayer – inget extra minne för punkterna.
   Byggs en gång per moln, ruta för ruta i bakgrunden när molnet visats (eller direkt vid första sökningen). */
function l3pcIndexChunk(c, k) {
  const ch = c.chunks[k], pos = ch.pos, n = pos.length / 3;
  if (!n) { ch.cells = []; return; }
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < pos.length; i += 3) { const x = pos[i], y = pos[i + 1], z = pos[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  const NX = n > 4000 ? 4 : 1, NY = NX, NZ = Math.max(1, Math.min(64, Math.ceil(n / (NX * NY * 1000))));
  const sx = (x1 - x0) / NX || 1, sy = (y1 - y0) / NY || 1, sz = (z1 - z0) / NZ || 1, NC = NX * NY * NZ;
  const cid = new Uint16Array(n), cnt = new Uint32Array(NC + 1);
  for (let i = 0; i < n; i++) {
    const ix = Math.min(NX - 1, ((pos[i * 3] - x0) / sx) | 0), iy = Math.min(NY - 1, ((pos[i * 3 + 1] - y0) / sy) | 0), iz = Math.min(NZ - 1, ((pos[i * 3 + 2] - z0) / sz) | 0);
    const id = (iz * NY + iy) * NX + ix; cid[i] = id; cnt[id + 1]++;
  }
  for (let q = 0; q < NC; q++) cnt[q + 1] += cnt[q];
  const at = cnt.slice(0, NC), P = new Float32Array(pos.length), R = ch.rgb ? new Uint8Array(ch.rgb.length) : null, I = ch.inten ? new Uint8Array(ch.inten.length) : null;
  for (let i = 0; i < n; i++) {
    const d = at[cid[i]]++;
    P[d * 3] = pos[i * 3]; P[d * 3 + 1] = pos[i * 3 + 1]; P[d * 3 + 2] = pos[i * 3 + 2];
    if (R) { R[d * 3] = ch.rgb[i * 3]; R[d * 3 + 1] = ch.rgb[i * 3 + 1]; R[d * 3 + 2] = ch.rgb[i * 3 + 2]; }
    if (I) I[d] = ch.inten[i];
  }
  pos.set(P); if (R) ch.rgb.set(R); if (I) ch.inten.set(I);
  const cells = [];
  for (let q = 0; q < NC; q++) {
    const a = cnt[q], b = cnt[q + 1]; if (a === b) continue;
    let mx = Infinity, my = Infinity, mz = Infinity, Mx = -Infinity, My = -Infinity, Mz = -Infinity;
    for (let i = a * 3; i < b * 3; i += 3) { const x = pos[i], y = pos[i + 1], z = pos[i + 2]; if (x < mx) mx = x; if (x > Mx) Mx = x; if (y < my) my = y; if (y > My) My = y; if (z < mz) mz = z; if (z > Mz) Mz = z; }
    cells.push({ a, b, min: [mx, my, mz], max: [Mx, My, Mz] });
  }
  ch.cells = cells;
  // Grafikkortets kopia följer den nya ordningen (positionerna och färgerna).
  const p = c.group.children[k];
  if (p) { p.geometry.getAttribute("position").needsUpdate = true; p.geometry.setAttribute("color", new THREE.BufferAttribute(l3pcColors(c, ch), 3, true)); }
}
function l3pcIndex(c) { c.chunks.forEach((ch, k) => { if (!ch.cells) l3pcIndexChunk(c, k); }); }
/* I bakgrunden, en ruta per ledig stund – sökningen är då snabb redan första gången. */
function l3pcIndexIdle(c) {
  let k = 0;
  const step = () => { if (!l3pc.clouds.includes(c)) return; while (k < c.chunks.length && c.chunks[k].cells) k++; if (k >= c.chunks.length) { l3Render(); return; } l3pcIndexChunk(c, k++); (window.requestIdleCallback || setTimeout)(step); };
  setTimeout(step, 300);
}
function l3pcPick(e, px = 7) {
  if (!l3 || !l3pc.clouds.some(c => c.visible)) return null;
  const r = l3.renderer.domElement.getBoundingClientRect(), cam = l3.camera;
  const rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), cam);
  const O = rc.ray.origin, D = rc.ray.direction;
  // Tolerans: perspektiv – vinkel per pixel (växer med avståndet); parallell – fast längd.
  const persp = !cam.isOrthographicCamera;
  const kAng = persp ? Math.tan(cam.fov * Math.PI / 360) * 2 / r.height * px : 0;
  const kOrtho = persp ? 0 : (cam.top - cam.bottom) / cam.zoom / r.height * px;
  return l3pcPickRay(O, D, kAng, kOrtho);
}
/* Samma sökning längs en godtycklig stråle: toleransen är kAng · avståndet + kAbs (meter). Används också av
   gå-läget för att hitta marken under fötterna. */
function l3pcPickRay(O, D, kAng, kAbs) {
  if (!l3 || !l3pc.clouds.some(c => c.visible)) return null;
  const kOrtho = kAbs || 0;
  const gcl = l3.renderer.clippingPlanes || [];
  const inv = [1 / D.x, 1 / D.y, 1 / D.z];
  let best = null;
  for (const c of l3pc.clouds) {
    if (!c.visible || !c.group.visible) continue;
    const gp = c.group.position, o = [O.x - gp.x, O.y - gp.y, O.z - gp.z], dx = D.x, dy = D.y, dz = D.z;
    const planes = [...gcl, ...(c.mat.clippingPlanes || [])];
    // Cellerna som strålen (med toleransen) passerar, närmast först.
    const cand = [];
    c.group.children.forEach((p, k) => {
      const g = p.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      const bs = g.boundingSphere, wx = bs.center.x - o[0], wy = bs.center.y - o[1], wz = bs.center.z - o[2];
      const t0 = wx * dx + wy * dy + wz * dz, d2 = wx * wx + wy * wy + wz * wz - t0 * t0;
      const tolS = Math.max(0, t0 + bs.radius) * kAng + kOrtho;
      if (t0 < -bs.radius || d2 > (bs.radius + tolS) * (bs.radius + tolS)) return; // strålen missar rutan
      const ch = c.chunks[k]; if (!ch.cells) l3pcIndexChunk(c, k);
      ch.cells.forEach(cl => {
        // Strålen mot cellens låda (utökad med toleransen på lådans bortre avstånd).
        let tn = -Infinity, tf = Infinity;
        const far = Math.hypot(cl.max[0] - o[0], cl.max[1] - o[1], cl.max[2] - o[2]) + Math.hypot(cl.min[0] - o[0], cl.min[1] - o[1], cl.min[2] - o[2]);
        const tol = far * kAng + kOrtho;
        for (let ax = 0; ax < 3; ax++) {
          let t1 = (cl.min[ax] - tol - o[ax]) * inv[ax], t2 = (cl.max[ax] + tol - o[ax]) * inv[ax];
          if (!Number.isFinite(t1) || !Number.isFinite(t2)) { if (o[ax] < cl.min[ax] - tol || o[ax] > cl.max[ax] + tol) { tn = Infinity; break; } continue; }
          if (t1 > t2) { const s2 = t1; t1 = t2; t2 = s2; }
          if (t1 > tn) tn = t1; if (t2 < tf) tf = t2;
        }
        if (tn <= tf && tf > 0) cand.push({ t: Math.max(0, tn), a: cl.a, b: cl.b, pos: ch.pos });
      });
    });
    cand.sort((x, y) => x.t - y.t);
    for (const cl of cand) {
      if (best && cl.t >= best.t) break; // resten ligger bakom den bästa träffen
      const a = cl.pos;
      for (let i = cl.a * 3; i < cl.b * 3; i += 3) {
        const qx = a[i] - o[0], qy = a[i + 1] - o[1], qz = a[i + 2] - o[2], t = qx * dx + qy * dy + qz * dz;
        if (t <= 0 || (best && t >= best.t)) continue;
        const tol = t * kAng + kOrtho, pd = qx * qx + qy * qy + qz * qz - t * t;
        if (pd > tol * tol) continue;
        const w = new THREE.Vector3(a[i] + gp.x, a[i + 1] + gp.y, a[i + 2] + gp.z);
        if (planes.length && !planes.every(pl => pl.distanceToPoint(w) >= -1e-6)) continue;
        best = { t, point: w, cloud: c };
      }
    }
  }
  return best ? { point: best.point, kind: "pc", distance: best.t, cloud: best.cloud } : null;
}
/* Ytträffen eller molnets punkt – den som ligger närmast kameran (rotationspunkt, dubbelklick, koordinaten). */
function l3pcNearer(e, hit) {
  const pc = typeof l3pcPick === "function" ? l3pcPick(e) : null;
  if (!pc) return hit || null;
  if (hit && hit.distance != null && hit.distance <= pc.distance + 0.02) return hit;
  return { point: pc.point, distance: pc.distance, pc: true };
}

