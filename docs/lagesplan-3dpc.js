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
const l3pcSize = () => Number(l3Prefs().pcSize) || 2.5;
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
const l3pcCacheKey = src => `${projectId}|${src.id}|${src.version || ""}|${l3pcBudget()}|s2`;   // s2 = slumpad ordning i rutorna (detaljnivå med drawRange)
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
/* Färgskalor för höjd (Victor 2026-10-24): några färdiga, som i bra punktmolnsprogram – Turbo ("regnbåge"), Viridis, terräng, blå→röd, grått och "över/under"
   (blått under nollnivån, vitt vid den, rött över – bra för att se om något ligger över eller under en given höjd). */
const L3PC_RAMPS = {
  turbo: ["Regnbåge", [[0, [48, 18, 59]], [0.13, [70, 107, 227]], [0.25, [40, 170, 235]], [0.38, [27, 229, 181]], [0.5, [110, 254, 98]], [0.63, [200, 239, 52]], [0.75, [250, 186, 57]], [0.88, [239, 95, 18]], [1, [122, 4, 3]]]],
  blared: ["Blå → röd", [[0, [43, 131, 186]], [0.25, [171, 221, 164]], [0.5, [255, 255, 191]], [0.75, [253, 174, 97]], [1, [215, 25, 28]]]],
  viridis: ["Viridis", [[0, [68, 1, 84]], [0.25, [59, 82, 139]], [0.5, [33, 145, 140]], [0.75, [94, 201, 98]], [1, [253, 231, 37]]]],
  terrain: ["Terräng", [[0, [0, 100, 60]], [0.25, [90, 160, 70]], [0.5, [220, 210, 120]], [0.75, [170, 120, 80]], [1, [245, 245, 245]]]],
  grey: ["Grått", [[0, [30, 34, 40]], [1, [236, 238, 240]]]],
  diverg: ["Över / under nollnivån", [[0, [37, 99, 235]], [0.5, [245, 245, 245]], [1, [220, 38, 38]]]],
};
function l3pcRamp(t, name) {
  const R = (L3PC_RAMPS[name || "blared"] || L3PC_RAMPS.blared)[1];
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < R.length; i++) if (t <= R[i][0]) {
    const [a, A] = R[i - 1], [b, B] = R[i], k = (t - a) / (b - a || 1);
    return [0, 1, 2].map(c => Math.round(A[c] + (B[c] - A[c]) * k));
  }
  return R[R.length - 1][1];
}
/* Höjdfärgningens inställningar för ett moln: nollnivå (Z0, m), steg (0 = jämn skala), skala och intervall relativt Z0. Höjder i modellens höjdsystem (inkl. höjdjustering). */
function l3pcZParams(c) {
  const dz = c.dz || 0, mn = c.info.min[2] + dz, mx = c.info.max[2] + dz, P = l3Prefs();
  const z0 = P.pcZ0 != null && P.pcZ0 !== "" && isFinite(Number(P.pcZ0)) ? Number(P.pcZ0) : 0;   // utan egen referens: absoluta höjder (plushöjder, m ö.h.)
  let lo = P.pcZFrom != null && P.pcZFrom !== "" && isFinite(Number(P.pcZFrom)) ? Number(P.pcZFrom) : mn - z0, hi = P.pcZTo != null && P.pcZTo !== "" && isFinite(Number(P.pcZTo)) ? Number(P.pcZTo) : mx - z0;
  if (hi <= lo + 1e-6) hi = lo + 1;
  const step = Math.max(0, Number(P.pcZStep) || 0), ramp = L3PC_RAMPS[P.pcZRamp] ? P.pcZRamp : "blared";
  return { dz, mn, mx, z0, lo, hi, step, ramp };
}
/* Egna färgband (Victor 2026-10-24: "ställa färgerna själv … justera mellan vilka nivåer"): gränser b (m ö.h., stigande) och n+1 färger c – lägsta bandet först. */
function l3pcZCustom(key = "pcZCustom") { const k = l3Prefs()[key]; return k && Array.isArray(k.b) && Array.isArray(k.c) && k.b.length && k.c.length === k.b.length + 1 ? k : null; }
const l3pcHex = q => "#" + q.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
const l3pcRgb = h => [parseInt(h.slice(1, 3), 16) || 0, parseInt(h.slice(3, 5), 16) || 0, parseInt(h.slice(5, 7), 16) || 0];
function l3pcZoneColors(n, ramp) { return Array.from({ length: n }, (_, i) => l3pcHex(l3pcRamp(n > 1 ? i / (n - 1) : 0.5, ramp))); }
function l3pcZCustomSet(b, c, key = "pcZCustom") { l3SetPref(key, b && b.length ? { b: b.map(v => Math.round(v * 1000) / 1000), c } : null); l3pcRecolor(); }
/* Bandens gränser och färger som visas just nu (för legend, texter och omvandling till egna band). */
function l3pcZZones(c) {
  const Z = l3pcZParams(c), K = l3pcZCustom(), mn = Z.mn, mx = Z.mx;
  if (K) return { custom: true, b: K.b.slice(), c: K.c.slice(), zones: K.c.map((col, i) => ({ lo: i ? K.b[i - 1] : -Infinity, hi: i < K.b.length ? K.b[i] : Infinity, col })) };
  if (Z.step > 0) {
    let step = Z.step; const iLo0 = Math.floor(Z.lo / step); let iHi0 = Math.max(iLo0, Math.floor((Z.hi - 1e-9) / step)); while (iHi0 - iLo0 + 1 > 60) { step *= 2; }
    const iLo = Math.floor(Z.lo / step), iHi = Math.max(iLo, Math.floor((Z.hi - 1e-9) / step)), n = iHi - iLo + 1, zones = [];
    for (let i = iLo; i <= iHi; i++) { const t = Z.ramp === "diverg" ? l3pcZT((i + 0.5) * step, { ...Z, step }) : n > 1 ? (i - iLo) / (n - 1) : 0.5, q = l3pcRamp(t, Z.ramp); zones.push({ lo: i === iLo ? -Infinity : Z.z0 + i * step, hi: i === iHi ? Infinity : Z.z0 + (i + 1) * step, col: l3pcHex(q) }); }
    return { custom: false, step, zones, b: zones.slice(0, -1).map(z => z.hi), c: zones.map(z => z.col) };
  }
  const N = 6, b = Array.from({ length: N - 1 }, (_, k) => Z.z0 + Z.lo + (Z.hi - Z.lo) * (k + 1) / N), cols = l3pcZoneColors(N, Z.ramp);
  return { custom: false, gradient: true, zones: cols.map((col, i) => ({ lo: i ? b[i - 1] : -Infinity, hi: i < N - 1 ? b[i] : Infinity, col })), b, c: cols };
}
/* Skalans värde 0–1 för en höjd v över Z0 (stegvis i band som ligger på hela steg från Z0). */
function l3pcZT(v, Z) {
  if (Z.ramp === "diverg") { const S = Math.max(Math.abs(Z.lo), Math.abs(Z.hi), 1e-6), vv = Z.step > 0 ? (Math.floor(v / Z.step) + 0.5) * Z.step : v; return 0.5 + Math.max(-0.5, Math.min(0.5, vv / (2 * S))); }
  if (Z.step > 0) { const iLo = Math.floor(Z.lo / Z.step), iHi = Math.max(iLo, Math.floor((Z.hi - 1e-9) / Z.step)), n = iHi - iLo + 1, i = Math.max(iLo, Math.min(iHi, Math.floor(v / Z.step))); return n > 1 ? (i - iLo) / (n - 1) : 0.5; }
  return Math.max(0, Math.min(1, (v - Z.lo) / (Z.hi - Z.lo)));
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
  if (mode === "diff" && typeof l3dfColors === "function") return l3dfColors(c, ch, n, out);
  const Z = l3pcZParams(c), cz = c.info.center[2] + Z.dz, K = l3pcZCustom();
  if (K) { const rgb = K.c.map(l3pcRgb), b = K.b, nb = b.length; for (let i = 0; i < n; i++) { const v = ch.pos[i * 3 + 2] + cz; let k = 0; while (k < nb && v >= b[k]) k++; const q = rgb[k]; out[i * 3] = q[0]; out[i * 3 + 1] = q[1]; out[i * 3 + 2] = q[2]; } return out; }
  const lut = []; for (let k = 0; k < 256; k++) lut.push(l3pcRamp(k / 255, Z.ramp));
  for (let i = 0; i < n; i++) { const q = lut[Math.max(0, Math.min(255, Math.round(l3pcZT(ch.pos[i * 3 + 2] + cz - Z.z0, Z) * 255)))]; out[i * 3] = q[0]; out[i * 3 + 1] = q[1]; out[i * 3 + 2] = q[2]; }
  return out;
}
function l3pcBuild(src, data) {
  if (!l3.groups.pc) { const g = new THREE.Group(); g.name = "pc"; l3.groups.pc = g; l3.scene.add(g); }
  const grp = new THREE.Group(), mat = new THREE.PointsMaterial({ size: l3pcSize(), sizeAttenuation: false, vertexColors: true });
  const c = { id: src.id, name: src.name, src, info: data.info, chunks: data.chunks, group: grp, mat, visible: true, dz: Number(src.dz) || 0, chunkPts: [], nTot: data.chunks.reduce((a, ch) => a + ch.pos.length / 3, 0) };
  data.chunks.forEach(ch => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(ch.pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(l3pcColors(c, ch), 3, true));
    g.computeBoundingSphere();
    const p = new THREE.Points(g, mat); p.userData.n = ch.pos.length / 3; c.chunkPts.push(p);
    p.userData.noHit = true; p.raycast = () => {}; // punkterna är inte ytor (mät/fäst)
    grp.add(p);
  });
  grp.userData.pc = c;
  l3.groups.pc.add(grp);
  if (typeof l3RenderSnapBar === "function") l3RenderSnapBar(); // Fäst-raden får knappen Moln
  l3pc.clouds.push(c);
  setTimeout(l3pcLegend, 0);
  l3pcPlace(c);
  l3pcIndexIdle(c); // för att fästa mot punkterna
  return c;
}
/* Molnet ligger i modellens koordinater (som IFC och DXF) – flyttas med 3D-vyns origo (och sin höjdjustering). */
function l3pcPlace(c) { c.group.position.set(c.info.center[0] - l3.O[0], c.info.center[1] - l3.O[1], c.info.center[2] - l3.O[2] + (c.dz || 0)); l3pcMatApply(c); }
/* ---- Smidig navigering i stora moln (Victor 2026-10-24: "många andra punktmolnshanterare är mycket mer smooth"): ingen växling mellan
   två kopior längre. Punkterna ligger slumpade i varje ruta, så att början av bufferten är ett jämnt urval – detaljnivån är då bara hur
   många punkter som ritas (drawRange) per ruta. Varje bild: rutor utanför bilden hoppas över, resten får punkter efter hur stor yta de tar
   på skärmen (nära = tätt, långt bort = glest) inom en punktbudget som styrs av den faktiska bildtiden (tung bild → färre punkter nästa,
   lätt bild → fler). Står kameran still ritas allt. Punktstorleken växer med glesheten så att ytor hålls ihop. ------------------------ */
let l3pcCam = null, l3pcStillT = 0, l3pcMoving = false, l3pcHolds = 0, l3pcLast = 0, l3pcBud = 0, l3pcSlow = false;
/* Hur länge kameran ska stå still innan hela molnet ritas (normalt 0,3 s; inställbart). */
const l3pcStillMs = () => { const v = Number(l3Prefs().pcStill); return v >= 100 && v <= 5000 ? v : 300; };
let l3pcFrustum = null, l3pcPM = null, l3pcSph = null, l3pcV = null;   // skapas vid första ritningen (THREE laddas först med 3D-vyn)
function l3pcRelease() { if (l3pcHolds > 0) return; l3pcSetMoving(false); l3Render(); }
/* Håll det glesa läget medan något annat dras (handtag, kommentar, mått, foto, objekt). Anropas parvis: true … false. */
function l3pcHold(on) {
  if (!l3pc.clouds.some(c => c.visible) || l3Prefs().pcLod === false) return;
  if (on) { l3pcHolds++; clearTimeout(l3pcStillT); if (!l3pcMoving) l3pcSetMoving(true); l3Render(); }
  else { l3pcHolds = Math.max(0, l3pcHolds - 1); if (!l3pcHolds) { clearTimeout(l3pcStillT); l3pcStillT = setTimeout(l3pcRelease, 200); } }
}
function l3pcSetMoving(on) { l3pcMoving = on; if (!on) l3pcLast = 0; }
/* Anropas före varje bild: rör sig kameran? Då delas punktbudgeten ut; annars ritas allt. */
function l3pcFrame() {
  const vis = l3pc.clouds.filter(c => c.visible);
  if (!vis.length) { l3pcCam = null; return; }
  const cam = l3.camera; cam.updateMatrixWorld();
  const e = cam.matrixWorld.elements, key = e.map(v => v.toFixed(4)).join() + (cam.zoom || 1), now = performance.now();
  if (l3pcCam !== null && key !== l3pcCam && l3Prefs().pcLod !== false) { if (!l3pcMoving) l3pcSetMoving(true); clearTimeout(l3pcStillT); l3pcStillT = setTimeout(l3pcRelease, l3pcStillMs()); }
  l3pcCam = key;
  const total = vis.reduce((a, c) => a + c.nTot, 0);
  if (!l3pcMoving || total < 5e5) { l3pcDraw(vis, null); l3pcLast = now; return; }
  // Bildtiden mellan två bilder under rörelse styr budgeten (mål ≈ 60 bilder/s, tål 30).
  if (!l3pcBud) l3pcBud = Math.min(total, 2.5e6);
  if (l3pcLast) { const dt = now - l3pcLast; l3pcSlow = dt > 28; if (dt > 24) l3pcBud *= Math.max(0.6, 17 / dt); else if (dt < 19) l3pcBud *= 1.06; l3pcBud = Math.max(3e5, Math.min(total, l3pcBud)); }
  l3pcLast = now;
  l3pcDraw(vis, l3pcBud);
}
/* Delar ut budgeten (null = allt) på rutorna som syns. */
function l3pcDraw(vis, budget) {
  if (!l3pcFrustum) { l3pcFrustum = new THREE.Frustum(); l3pcPM = new THREE.Matrix4(); l3pcSph = new THREE.Sphere(); l3pcV = new THREE.Vector3(); }
  const cam = l3.camera; l3pcPM.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); l3pcFrustum.setFromProjectionMatrix(l3pcPM);
  const cp = cam.getWorldPosition(l3pcV).clone(), items = []; let sumA = 0;
  vis.forEach(c => { c.group.updateWorldMatrix(true, false); c.chunkPts.forEach(p => {
    const bs = p.geometry.boundingSphere; l3pcSph.copy(bs).applyMatrix4(c.group.matrixWorld);
    const inside = l3pcFrustum.intersectsSphere(l3pcSph); p.visible = inside; if (!inside) return;
    const n = p.userData.n, d = Math.max(l3pcSph.radius * 0.5, cp.distanceTo(l3pcSph.center)), A = (l3pcSph.radius * l3pcSph.radius) / (d * d);
    items.push({ p, n, A, c }); sumA += A; }); });
  const drawn = new Map(); vis.forEach(c => drawn.set(c, 0));
  if (budget == null) items.forEach(it => { it.p.geometry.setDrawRange(0, it.n); drawn.set(it.c, drawn.get(it.c) + it.n); });
  else { items.forEach(it => { it.k = Math.min(it.n, Math.floor(budget * it.A / Math.max(1e-12, sumA))); });
    const used = items.reduce((a, it) => a + it.k, 0), open = items.filter(it => it.k < it.n), aOpen = open.reduce((a, it) => a + it.A, 0);   // det som blev över (små rutor tar inte sin del) går till resten
    if (aOpen > 0) { const spare = Math.max(0, budget - used); open.forEach(it => { it.k = Math.min(it.n, it.k + Math.floor(spare * it.A / aOpen)); }); }
    items.forEach(it => { const k = Math.min(it.n, Math.max(it.k, 2000)); it.p.geometry.setDrawRange(0, k); drawn.set(it.c, drawn.get(it.c) + k); }); }
  // Punktstorleken följer glesheten: färre punkter → lite större, så att ytor inte faller sönder.
  vis.forEach(c => { const base = c.mat.userData.base || c.mat.size, f = budget == null ? 1 : Math.min(2.2, Math.sqrt(c.nTot / Math.max(1, drawn.get(c) || 1)) * 0.75); c.mat.size = base * Math.max(1, f); });
}
/* Teckenförklaring för höjdfärgerna (över bilden, till vänster): plushöjder (m ö.h.) per färgband. Färgrutorna går att klicka på (egen färg) och
   gränserna går att skriva in – då övergår skalan till egna färgband. */
const l3pcF = v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(Math.round(v * 100) / 100).toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function l3pcLegend() {
  const host = document.getElementById("v3Canvas"); if (!host) return;
  let el = document.getElementById("v3PcLegend");
  const c = l3pc.clouds.find(x => x.visible), mode = l3pcMode(), diff = mode === "diff" && typeof l3dfZones === "function", on = c && (mode === "z" || diff || (mode === "auto" && !c.info.rgb && !c.info.intensity));
  l3pcZLabels();
  if (!on) { if (el) el.classList.add("hidden"); return; }
  if (!el) { el = document.createElement("div"); el.id = "v3PcLegend"; el.className = "v3-pcleg"; host.appendChild(el); ["pointerdown", "wheel", "contextmenu", "dblclick", "click", "keydown"].forEach(t => el.addEventListener(t, e => e.stopPropagation())); }
  const Z = l3pcZParams(c), Zs = diff ? l3dfZones() : l3pcZZones(c), n = Zs.zones.length, KEY = diff ? "pcDCustom" : "pcZCustom", F = diff ? (v => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(Math.round(v * 100) / 100).toLocaleString("sv-SE")) : l3pcF, num = (v, bi) => `<input type="number" class="v3-pcl-n" step="0.1" data-bi="${bi}" value="${Math.round(v * 1000) / 1000}" />`;
  let rows = "";
  for (let k = n - 1; k >= 0; k--) { const z = Zs.zones[k], loTxt = z.lo === -Infinity ? "" : num(z.lo, k - 1), hiTxt = z.hi === Infinity ? "" : num(z.hi, k);
    const lab = z.hi === Infinity ? `över ${loTxt}` : z.lo === -Infinity ? `under ${hiTxt}` : `${loTxt}<b>–</b>${hiTxt}`;
    rows += `<div class="v3-pcl-r" data-z="${k}"><input type="color" class="v3-pcl-c" value="${z.col}" title="Välj egen färg för det här bandet" /><span class="v3-pcl-t">${lab}</span><button type="button" class="v3-pcl-x" data-zdel="${k}" title="Ta bort bandet (slås ihop med grannen)" ${n < 2 ? "disabled" : ""}>×</button></div>`; }
  const note = diff ? l3dfNote() : Z.z0 ? `Höjd relativt Z0 = ${l3pcF(Z.z0)} m` : "Plushöjd, m ö.h.";
  el.innerHTML = `<div class="v3-pcl-h">${diff ? "Skillnad i höjd" : "Höjdfärger"} <em>${note}</em></div>${rows}<div class="v3-pcl-f"><button type="button" class="v3-link" data-zadd="1" title="Lägg till ett färgband">＋ Band</button>${diff ? l3dfFoot() : ""}${Zs.custom ? `<button type="button" class="v3-link" data-zreset="1" title="Tillbaka till vald färgskala">Standard</button>` : ""}</div>`;
  const toCustom = () => { if (!Zs.custom) l3SetPref(KEY, { b: Zs.b.map(v => Math.round(v * 1000) / 1000), c: Zs.c.slice() }); return l3pcZCustom(KEY); };
  el.querySelectorAll(".v3-pcl-c").forEach(inp => { inp.onchange = () => { const k = Number(inp.closest("[data-z]").dataset.z), K = toCustom(); K.c[k] = inp.value; l3pcZCustomSet(K.b, K.c, KEY); }; });
  el.querySelectorAll(".v3-pcl-n").forEach(inp => { inp.onchange = () => { const bi = Number(inp.dataset.bi), K = toCustom(), v = Number(String(inp.value).replace(",", "."));
      if (!isFinite(v) || bi < 0 || bi >= K.b.length) { l3pcLegend(); return; }
      const lo = bi > 0 ? K.b[bi - 1] + 0.001 : -Infinity, hi = bi < K.b.length - 1 ? K.b[bi + 1] - 0.001 : Infinity; K.b[bi] = Math.max(lo, Math.min(hi, v)); l3pcZCustomSet(K.b, K.c, KEY); }; });
  el.querySelectorAll("[data-zdel]").forEach(b => { b.onclick = () => { const k = Number(b.dataset.zdel), K = toCustom(); if (K.c.length < 2) return; const bi = k < K.b.length ? k : K.b.length - 1; K.b.splice(bi, 1); K.c.splice(k, 1); if (!K.b.length) { l3pcZCustomSet(null, null, KEY); return; } l3pcZCustomSet(K.b, K.c, KEY); }; });
  const ad = el.querySelector("[data-zadd]"); if (ad) ad.onclick = () => { const K = toCustom(), b = K.b; let at = b.length, best = 1; for (let i = 1; i < b.length; i++) if (b[i] - b[i - 1] > best) { best = b[i] - b[i - 1]; at = i; }
    if (at === b.length) { b.push(b[b.length - 1] + 1); K.c.push(K.c[K.c.length - 1]); } else { b.splice(at, 0, (b[at - 1] + b[at]) / 2); K.c.splice(at, 0, K.c[at]); } l3pcZCustomSet(b, K.c, KEY); };
  const rs = el.querySelector("[data-zreset]"); if (rs) rs.onclick = () => l3pcZCustomSet(null, null, KEY);
  el.classList.remove("hidden");
}
/* Plushöjder som text på molnet (Victor 2026-10-24: "projicera plushöjder som en text i rätt färgzoner"): en etikett per färgband, placerad på en punkt i bandet. */
function l3pcZLabels() {
  l3pc.clouds.forEach(c => { if (c.zlab) { c.group.remove(c.zlab); c.zlab.children.forEach(s => { s.material.map.dispose(); s.material.dispose(); }); c.zlab = null; } });
  const mode = l3pcMode();
  if (l3Prefs().pcZLabels === false || mode === "diff") return;
  l3pc.clouds.filter(c => c.visible && (mode === "z" || (mode === "auto" && !c.info.rgb && !c.info.intensity))).forEach(c => {
    const Zs = l3pcZZones(c), zones = Zs.zones, nz = zones.length, cz = c.info.center[2] + (c.dz || 0), sum = zones.map(() => [0, 0, 0]), tot = c.nTot, stride = Math.max(1, Math.floor(tot / 300000));
    const zi = v => { let lo = 0, hi = nz - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (v >= zones[m].hi) lo = m + 1; else hi = m; } return lo; };
    c.chunks.forEach(ch => { const pos = ch.pos; for (let i = 0; i < pos.length / 3; i += stride) { const k = zi(pos[i * 3 + 2] + cz), s = sum[k]; s[0] += pos[i * 3]; s[1] += pos[i * 3 + 1]; s[2]++; } });
    const best = zones.map(() => ({ d: Infinity })); const cen = sum.map(s => s[2] ? [s[0] / s[2], s[1] / s[2]] : null);
    c.chunks.forEach(ch => { const pos = ch.pos; for (let i = 0; i < pos.length / 3; i += stride) { const k = zi(pos[i * 3 + 2] + cz), q = cen[k]; if (!q) continue; const d = (pos[i * 3] - q[0]) ** 2 + (pos[i * 3 + 1] - q[1]) ** 2; if (d < best[k].d) best[k] = { d, x: pos[i * 3], y: pos[i * 3 + 1], z: pos[i * 3 + 2] }; } });
    const grp = new THREE.Group(); grp.name = "pcZLabels";
    zones.forEach((z, k) => { const b = best[k]; if (!isFinite(b.d)) return; const lo = z.lo === -Infinity ? c.info.min[2] + (c.dz || 0) : z.lo, hi = z.hi === Infinity ? c.info.max[2] + (c.dz || 0) : z.hi;
      const txt = Zs.gradient ? l3pcF(b.z + cz) + " m" : `${l3pcF(lo)} – ${l3pcF(hi)} m`, cv = document.createElement("canvas"), g = cv.getContext("2d"), fs = 30; g.font = `700 ${fs}px sans-serif`; const w = Math.ceil(g.measureText(txt).width) + 22; cv.width = w; cv.height = fs + 18;
      g.font = `700 ${fs}px sans-serif`; g.textBaseline = "middle"; g.fillStyle = "rgba(255,255,255,.92)"; g.beginPath(); g.roundRect ? g.roundRect(1, 1, w - 2, cv.height - 2, 10) : g.rect(1, 1, w - 2, cv.height - 2); g.fill(); g.lineWidth = 5; g.strokeStyle = z.col; g.stroke(); g.fillStyle = "#0f172a"; g.fillText(txt, 11, cv.height / 2 + 1);
      const tex = new THREE.CanvasTexture(cv); tex.minFilter = THREE.LinearFilter; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, sizeAttenuation: false, transparent: true }));
      sp.scale.set(0.036 * w / cv.height * 1.0, 0.036, 1); sp.position.set(b.x, b.y, b.z + 0.2); sp.renderOrder = 30; sp.userData.noHit = true; sp.raycast = () => {}; grp.add(sp); });
    c.group.add(grp); c.zlab = grp; });
}
/* Välj nollnivån (Z0) genom att trycka på en punkt i molnet eller på en yta i modellen. */
function l3pcPickZ() {
  const dom = l3.renderer.domElement; l3Status("Tryck på en punkt eller yta för att sätta nollnivån (Z0). Esc avbryter.");
  dom.style.cursor = "crosshair";
  const done = () => { dom.style.cursor = ""; dom.removeEventListener("pointerdown", down, true); window.removeEventListener("keydown", key, true); };
  const key = e => { if (e.key === "Escape") { e.stopPropagation(); done(); l3Status("Avbrutet."); } };
  const down = e => {
    if (e.button !== 0) return; e.stopPropagation(); e.preventDefault();
    const p = l3pcPick(e), h = p ? null : l3Ray(e, l3Surfaces())[0], z = p ? p.point.z + l3.O[2] : h ? h.point.z + l3.O[2] : null;
    if (z == null) { l3Status("Ingen punkt här – försök igen (Esc avbryter).", true); return; }
    done(); l3SetPref("pcZ0", Math.round(z * 100) / 100); l3pcRecolor(); l3Status(`Nollnivå Z0 = ${(Math.round(z * 100) / 100).toLocaleString("sv-SE")} m.`);
    const el = document.getElementById("v3PcZ0"); if (el) el.value = String(Math.round(z * 100) / 100);
  };
  dom.addEventListener("pointerdown", down, true); window.addEventListener("keydown", key, true);
}
/* ---- Djupskuggning (Eye-Dome Lighting, som i Trimble Connect/Potree): scenen ritas till en bildyta med djup och ett efterpass mörkar
   pixlar som ligger bakom sina grannar. Då får tätt packade punkter konturer och form i stället för en platt färgmatta. Bara när ett moln
   är tänt och styrkan (Djupskuggning i punktmolnspanelen) är över 0; annars ritas scenen direkt som förut. ---- */
let l3pcE = null;
const l3pcEdlStr = () => Math.max(l3pc.clouds.some(c => c.visible) ? Number(l3pcPref("pcEdl", 60)) || 0 : 0, Number(l3Prefs().sceneEdl) || 0);   // moln tänt: molnets styrka; Djupskuggning i Visa-menyn gäller hela scenen (även utan moln)
const l3pcEdlOn = () => l3pcEdlStr() > 0 && !(l3pcMoving && l3pcSlow);   // tung bild under rörelse: hoppa över efterpasset
function l3pcEdlInit(r) {
  const size = r.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, samples: r.capabilities.isWebGL2 ? 4 : 0 });
  rt.depthTexture = new THREE.DepthTexture(size.x, size.y); rt.depthTexture.type = THREE.UnsignedIntType;
  const mat = new THREE.ShaderMaterial({
    uniforms: { tC: { value: rt.texture }, tD: { value: rt.depthTexture }, px: { value: new THREE.Vector2(1 / size.x, 1 / size.y) }, near: { value: 0.1 }, far: { value: 1000 }, ortho: { value: 0 }, str: { value: 1 }, rad: { value: 1.4 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: `uniform sampler2D tC, tD; uniform vec2 px; uniform float near, far, ortho, str, rad; varying vec2 vUv;
      float lin(vec2 uv){ float d = texture2D(tD, uv).x; if (d >= 0.99999) return -1.0; if (ortho > 0.5) return near + d * (far - near); return near * far / (far - d * (far - near)); }
      void main(){ vec4 c = texture2D(tC, vUv); float z = lin(vUv); if (z < 0.0) { gl_FragColor = c; return; }
        float o = 0.0; vec2 q[8]; q[0]=vec2(1.,0.); q[1]=vec2(-1.,0.); q[2]=vec2(0.,1.); q[3]=vec2(0.,-1.); q[4]=vec2(.7,.7); q[5]=vec2(-.7,.7); q[6]=vec2(.7,-.7); q[7]=vec2(-.7,-.7);
        for (int i = 0; i < 8; i++) { float n = lin(vUv + q[i] * px * rad); if (n < 0.0) continue; o += max(0.0, log2(z) - log2(n)); }
        float sh = exp(-o * 90.0 * str); gl_FragColor = vec4(c.rgb * sh, c.a); }`,
    depthTest: false, depthWrite: false
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(quad);
  return { rt, mat, sc, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), w: size.x, h: size.y };
}
function l3pcRenderScene() {
  const r = l3.renderer;
  // Skuggningen av ytor (extra bildpass) pausas medan kameran rör sig och bildtiden är dålig – den kommer tillbaka när kameran stannat.
  const slow = typeof l3CamLast !== "undefined" && l3CamLast.moving && typeof l3lod !== "undefined" && l3lod.ema > 28 && !l3pc.clouds.some(c => c.visible);
  if (!l3pcEdlOn() || slow) { r.render(l3.scene, l3.camera); return; }
  try {
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    if (!l3pcE) l3pcE = l3pcEdlInit(r);
    if (l3pcE.w !== size.x || l3pcE.h !== size.y) { l3pcE.rt.setSize(size.x, size.y); l3pcE.w = size.x; l3pcE.h = size.y; l3pcE.mat.uniforms.px.value.set(1 / size.x, 1 / size.y); }
    const cam = l3.camera, u = l3pcE.mat.uniforms; u.near.value = cam.near; u.far.value = cam.far; u.ortho.value = cam.isOrthographicCamera ? 1 : 0; u.str.value = l3pcEdlStr() / 100;
    r.setRenderTarget(l3pcE.rt); r.clear(); r.render(l3.scene, cam); r.setRenderTarget(null); r.clear();
    r.render(l3pcE.sc, l3pcE.cam);
  } catch (e) { r.setRenderTarget(null); l3pcE = null; l3Prefs().pcEdl = 0; l3Prefs().sceneEdl = 0; r.render(l3.scene, l3.camera); }
}
/* Rund punkt: en liten cirkel som mask (alphaTest) – lika billig som fyrkanten. */
let l3pcDisc = null;
function l3pcDiscTex() {
  if (l3pcDisc) return l3pcDisc;
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  const x = cv.getContext("2d"); x.fillStyle = "#fff"; x.beginPath(); x.arc(32, 32, 30, 0, Math.PI * 2); x.fill();
  l3pcDisc = new THREE.CanvasTexture(cv); return l3pcDisc;
}
/* Mjuka runda splats (som i Trimble Connect): cirkelmask utan kantflimmer och lätt skuggning mot kanten, så att tätt packade punkter
   flyter ihop till en yta i stället för att ge en rasterbild. Görs i punktmaterialets shader – lika billigt som fyrkanten. */
function l3pcSoft(m, on) {
  if (!!m.userData.soft === on && m.onBeforeCompile) return;
  m.userData.soft = on;
  m.onBeforeCompile = on ? sh => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      float pcD = length(gl_PointCoord - vec2(0.5)); if (pcD > 0.5) discard;
      diffuseColor.rgb *= 1.0 - 0.28 * smoothstep(0.2, 0.5, pcD);`);
  } : () => {};
  m.customProgramCacheKey = () => on ? "pcsoft" : "pcsq";
  m.needsUpdate = true;
}
/* Visningen i grafikkortet: storlek (pixlar eller meter), form, genomskinlighet och höjdfiltret. */
function l3pcMatApply(c) {
  const m = c.mat, atten = !!l3Prefs().pcAtten, round = l3Prefs().pcRound !== false, op = Number(l3pcPref("pcOpacity", 100)) / 100;
  m.sizeAttenuation = atten;
  m.size = atten ? l3pcSize() * 0.02 : l3pcSize(); // i meter: 2 → 4 cm
  m.map = null; m.alphaTest = 0; l3pcSoft(m, round);
  m.transparent = op < 0.999; m.opacity = op; m.depthWrite = op >= 0.999;
  const lo = Number(l3pcPref("pcZlo", 0)), hi = Number(l3pcPref("pcZhi", 100));
  if (lo > 0 || hi < 100) {
    const z0 = c.info.min[2], span = c.info.max[2] - c.info.min[2], base = -l3.O[2] + (c.dz || 0);
    m.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, 0, 1), -(z0 + span * lo / 100 + base)), new THREE.Plane(new THREE.Vector3(0, 0, -1), z0 + span * hi / 100 + base)];
    l3.renderer.localClippingEnabled = true;
  } else m.clippingPlanes = null;
  m.needsUpdate = true;
  c.mat.userData.base = c.mat.size;
}
function l3pcApplyAll() { l3pc.clouds.forEach(l3pcMatApply); l3Render(); }
function l3pcRemove(id) {
  setTimeout(l3pcLegend, 0);
  const i = l3pc.clouds.findIndex(c => c.id === id);
  if (i < 0) return;
  const c = l3pc.clouds[i];
  c.chunkPts.forEach(p => p.geometry.dispose()); c.mat.dispose();
  if (c.group.parent) c.group.parent.remove(c.group);
  l3pc.clouds.splice(i, 1);
  l3Render();
}
function l3pcShow(id, on) {
  const c = l3pc.clouds.find(x => x.id === id); if (!c) return;
  c.visible = on; c.group.visible = on; l3pcRemember(c.src, on); l3pcLegend(); l3Render();
}
function l3pcRecolor() {
  l3pcLegend();
  l3pc.clouds.forEach(c => {
    c.chunkPts.forEach((p, k) => { p.geometry.setAttribute("color", new THREE.BufferAttribute(l3pcColors(c, c.chunks[k]), 3, true)); });
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
  return h;
}
/* Visning av punktmolnen: en liten rullgardin bredvid ＋ i blockhuvudet (Victor 2026-10-24). Reglage direkt, switchar för på/av, inget som ritar om listan. */
function l3pcSettingsHtml() {
  const P = l3Prefs(), mode = l3pcMode(), esc = escHtml, Zp = l3pc.clouds[0] ? l3pcZParams(l3pc.clouds[0]) : { mn: 0, lo: 0, hi: 1, ramp: "blared" }, lo = Number(l3pcPref("pcZlo", 0)), hi = Number(l3pcPref("pcZhi", 100)), edl = Number(l3pcPref("pcEdl", 60));
  const c0 = l3pc.clouds[0], zAt = t => c0 ? (c0.info.min[2] + (c0.info.max[2] - c0.info.min[2]) * t / 100 + (c0.dz || 0)).toFixed(1).replace(".", ",") : String(t);
  const sw = (id, on, label, hint) => `<label class="v3-pcs-r v3-pcs-sw" title="${esc(hint || "")}"><span>${label}</span><span class="v3-lay-sw"><input type="checkbox" id="${id}" role="switch" ${on ? "checked" : ""} /><i></i></span></label>`;
  const rng = (id, label, min, max, step, val, out, hint) => `<label class="v3-pcs-r v3-pcs-g" title="${esc(hint || "")}"><span>${label}</span><output>${out}</output><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}" /></label>`;
  const modes = [["auto", "Automatiskt"], ["rgb", "Skanningens färger"], ["int", "Intensitet (grå)"], ["z", "Höjd – färgskala"], ["solid", "Enfärgad"], ["diff", "Skillnad (differentialanalys)"]];
  return `<div class="v3-pcs" data-keep="1">
    <div class="v3-pcs-r v3-pcs-c"><span>Färg</span><select id="v3PcMode">${modes.map(([k, l]) => `<option value="${k}" ${mode === k ? "selected" : ""}>${l}</option>`).join("")}</select><input type="color" id="v3PcColor" value="${esc(l3pcPref("pcColor", "#94a3b8"))}" title="Färg" class="${mode === "solid" ? "" : "hidden"}" /></div>
    <div class="v3-pcz ${mode === "z" ? "" : "hidden"}" id="v3PcZbox">
      <div class="v3-set-h">Höjdfärger</div>
      <label class="v3-pcs-r v3-pcz-r"><span>Färgskala</span><select id="v3PcZRamp">${Object.entries(L3PC_RAMPS).map(([k, v]) => `<option value="${k}" ${Zp.ramp === k ? "selected" : ""}>${v[0]}</option>`).join("")}</select></label>
      <label class="v3-pcs-r v3-pcz-r" title="Jämn övergång eller ett färgband per höjdintervall"><span>Indelning</span><select id="v3PcZStep">${[[0, "Jämn övergång"], [0.1, "Band à 0,1 m"], [0.25, "Band à 0,25 m"], [0.5, "Band à 0,5 m"], [1, "Band à 1 m"], [2, "Band à 2 m"], [5, "Band à 5 m"], [10, "Band à 10 m"]].map(([v, l]) => `<option value="${v}" ${Number(P.pcZStep || 0) === v && !l3pcZCustom() ? "selected" : ""}>${l}</option>`).join("")}${l3pcZCustom() ? `<option value="custom" selected>Egna band (${l3pcZCustom().c.length} st)</option>` : ""}</select></label>
      <label class="v3-pcs-r v3-pcz-r" title="Skriv de höjder (m ö.h.) där färgen ska byta, med komma mellan. Ett enda tal = jämna steg på så många meter."><span>Egna steg</span><input type="text" id="v3PcZCust" placeholder="t.ex. 400, 401,5, 403, 405" value="${l3pcZCustom() ? l3pcZCustom().b.join(", ").replace(/\./g, ",") : ""}" /><button type="button" id="v3PcZCustGo" data-keep="1">Använd</button></label>
      <label class="v3-pcs-r v3-pcz-r" title="Höjdintervallet som färgskalan täcker. Tomt = hela molnet. Punkter utanför får ändfärgen."><span>Visa höjder${Zp.z0 ? " (rel. Z0)" : " (m ö.h.)"}</span><input type="number" step="0.1" id="v3PcZFrom" placeholder="från ${Math.round(Zp.lo * 10) / 10}" value="${P.pcZFrom != null && P.pcZFrom !== "" ? P.pcZFrom : ""}" /><input type="number" step="0.1" id="v3PcZTo" placeholder="till ${Math.round(Zp.hi * 10) / 10}" value="${P.pcZTo != null && P.pcZTo !== "" ? P.pcZTo : ""}" /></label>
      ${sw("v3PcZLab", P.pcZLabels !== false, "Höjdtext i färgzonerna", "Skriver plushöjden som en etikett i varje färgband i 3D.")}
      <label class="v3-pcs-r v3-pcz-r" title="Normalt visas plushöjder (m ö.h.). Sätt en egen referenshöjd för att i stället se höjd över den, t.ex. färdig golvnivå. Tomt = plushöjder."><span>Referenshöjd (Z0)</span><input type="number" step="0.01" id="v3PcZ0" placeholder="0 = plushöjd" value="${P.pcZ0 != null && P.pcZ0 !== "" ? P.pcZ0 : ""}" /><button type="button" id="v3PcZpick" data-keep="1" title="Tryck på en punkt eller yta i 3D-vyn">Välj punkt</button></label>
      <div class="v3-pal-hint">Klicka på en färgruta i teckenförklaringen för att välja egen färg, eller skriv in nivåerna där.</div>
    </div>
    ${rng("v3PcSize", "Punktstorlek", 0.5, 20, 0.5, l3pcSize(), String(l3pcSize()).replace(".", ","))}
    ${sw("v3PcRound", P.pcRound !== false, "Runda punkter")}
    ${sw("v3PcAtten", !!P.pcAtten, "Storlek i meter", "Av: lika stora på skärmen. På: växer när du zoomar in, som riktiga ytor.")}
    ${sw("v3PcEdlOn", edl > 0, "Djupskuggning", "Mörkar punkter som ligger bakom sina grannar (som i Trimble Connect) så att former och kanter syns.")}
    ${rng("v3PcEdl", "Styrka", 5, 100, 5, edl > 0 ? edl : 60, (edl > 0 ? edl : 60) + " %")}
    ${sw("v3PcLod", P.pcLod !== false, "Adaptiv detalj vid rörelse", "Medan kameran rör sig ritas så många punkter som bildtiden tillåter – tätast nära kameran. Hela molnet när du stannar.")}
    ${rng("v3PcBright", "Ljus", -50, 50, 5, l3pcPref("pcBright", 0), l3pcPref("pcBright", 0))}
    ${rng("v3PcOpacity", "Täckning", 10, 100, 5, l3pcPref("pcOpacity", 100), l3pcPref("pcOpacity", 100) + " %", "Genomskinlighet – se modellen genom molnet")}
    <div class="v3-pcs-r v3-pcs-g" title="Visa bara ett skikt av molnet – t.ex. ta bort taket eller marken"><span>Höjdfilter</span><output>${zAt(lo)}–${zAt(hi)} m</output><span class="v3-pc-z"><input type="range" id="v3PcZlo" min="0" max="100" step="1" value="${lo}" /><input type="range" id="v3PcZhi" min="0" max="100" step="1" value="${hi}" /></span></div>
    ${typeof l3dfSettingsHtml === "function" ? l3dfSettingsHtml() : ""}
    <button type="button" class="v3-link" id="v3PcReset">Återställ visningen</button></div>`;
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
  live("v3PcEdl", "pcEdl", () => l3Render(), v => v + " %");
  live("v3PcOpacity", "pcOpacity", () => l3pcApplyAll(), v => v + " %");
  live("v3PcBright", "pcBright", end => end && l3pcRecolor(), v => v);
  const zl = host.querySelector("#v3PcZlo"), zh = host.querySelector("#v3PcZhi");
  if (zl && zh) {
    const c0 = l3pc.clouds[0], zAt = t => c0 ? (c0.info.min[2] + (c0.info.max[2] - c0.info.min[2]) * t / 100 + (c0.dz || 0)).toFixed(1).replace(".", ",") : String(t);
    const z = () => { let lo = Number(zl.value), hi = Number(zh.value); if (lo > hi - 1) { if (document.activeElement === zl) lo = hi - 1; else hi = lo + 1; zl.value = lo; zh.value = hi; } l3SetPref("pcZlo", lo); l3SetPref("pcZhi", hi); const o = zh.closest(".v3-pcs-r").querySelector("output"); if (o) o.textContent = `${zAt(lo)}–${zAt(hi)} m`; l3pcApplyAll(); };
    zl.oninput = z; zh.oninput = z;
  }
  const zv = (id, key) => { const el = host.querySelector("#" + id); if (el) el.onchange = () => { l3SetPref(key, el.value === "" ? null : Number(el.value)); l3pcRecolor(); }; };
  zv("v3PcZ0", "pcZ0"); zv("v3PcZFrom", "pcZFrom"); zv("v3PcZTo", "pcZTo");
  { const st = host.querySelector("#v3PcZStep"); if (st) st.onchange = () => { if (st.value === "custom") return; l3SetPref("pcZCustom", null); l3SetPref("pcZStep", Number(st.value)); l3pcRecolor(); const ci = host.querySelector("#v3PcZCust"); if (ci) ci.value = ""; }; }
  { const go = host.querySelector("#v3PcZCustGo"), ci = host.querySelector("#v3PcZCust"); if (go && ci) go.onclick = () => { const v = ci.value.replace(/(\d),(\d)/g, "$1.$2").split(/[;\s,]+/).filter(t => t !== "").map(Number).filter(x => isFinite(x)); const u = [...new Set(v)].sort((a, b) => a - b);
      if (!u.length) { l3SetPref("pcZCustom", null); l3pcRecolor(); return; }
      if (u.length === 1) { l3SetPref("pcZCustom", null); l3SetPref("pcZStep", u[0]); l3pcRecolor(); l3Status(`Färgband à ${u[0]} m.`); return; }
      const c0 = l3pc.clouds[0], ramp = c0 ? l3pcZParams(c0).ramp : "blared"; l3pcZCustomSet(u, l3pcZoneColors(u.length + 1, ramp)); l3Status(`${u.length + 1} egna färgband – klicka på en färgruta i teckenförklaringen för att ändra färg.`); }; }
  { const lb = host.querySelector("#v3PcZLab"); if (lb) lb.onchange = () => { l3SetPref("pcZLabels", lb.checked); l3pcZLabels(); l3Render(); }; }
  { const r = host.querySelector("#v3PcZRamp"); if (r) r.onchange = () => { l3SetPref("pcZRamp", r.value); l3pcRecolor(); }; }
  { const pk = host.querySelector("#v3PcZpick"); if (pk) pk.onclick = e => { e.stopPropagation(); const m = pk.closest(".v3-ldd-m"); if (m) m.classList.add("hidden"); l3pcPickZ(); }; }
  const md = host.querySelector("#v3PcMode"); if (md) md.onchange = () => { l3SetPref("pcMode", md.value); { const zb = host.querySelector("#v3PcZbox"); if (zb) zb.classList.toggle("hidden", md.value !== "z"); } const c = host.querySelector("#v3PcColor"); if (c) c.classList.toggle("hidden", md.value !== "solid"); l3pcRecolor(); };
  const pc = host.querySelector("#v3PcColor"); if (pc) pc.oninput = () => { l3SetPref("pcColor", pc.value); l3pcRecolor(); };
  const sw = (id, fn) => { const el = host.querySelector("#" + id); if (el) el.onchange = () => fn(el.checked); };
  sw("v3PcAtten", on => { l3SetPref("pcAtten", on); l3pcApplyAll(); });
  sw("v3PcRound", on => { l3SetPref("pcRound", on); l3pcApplyAll(); });
  sw("v3PcLod", on => { l3SetPref("pcLod", on); l3Render(); });
  sw("v3PcEdlOn", on => { const r = host.querySelector("#v3PcEdl"); l3SetPref("pcEdl", on ? Number(r && r.value) || 60 : 0); l3Render(); });
  const rs = host.querySelector("#v3PcReset"); if (rs) rs.onclick = () => { ["pcSize", "pcEdl", "pcAtten", "pcRound", "pcLod", "pcBright", "pcOpacity", "pcZlo", "pcZhi", "pcMode", "pcZ0", "pcZFrom", "pcZTo", "pcZStep", "pcZRamp", "pcZCustom", "pcZLabels", "pcDCustom"].forEach(k => l3SetPref(k, null)); l3pcApplyAll(); l3pcRecolor(); l3Render(); };
  if (typeof l3dfBind === "function") l3dfBind(host);
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
  const p = c.chunkPts[k];
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
    c.chunkPts.forEach((p, k) => {
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


/* Dra i handtag, kommentar-/måttetiketter och fotohöjd: den glesa kopian ritas medan man drar (kameran står still men
   molnet tynger annars flytten). Gizmot (flytta/vrid objekt) kopplas av 3D-vyn via l3pcHold. */
(function () {
  const SEL = ".v3-khandle, .v3-mhandle, .v3-phh, .v3-meas, .v3-cpin, .v3-gh";
  window.addEventListener("pointerdown", e => {
    if (!e.target || !e.target.closest || !e.target.closest(SEL) || typeof l3pcHold !== "function") return;
    l3pcHold(true);
    const end = () => { window.removeEventListener("pointerup", end, true); window.removeEventListener("pointercancel", end, true); l3pcHold(false); };
    window.addEventListener("pointerup", end, true); window.addEventListener("pointercancel", end, true);
  }, true);
})();
