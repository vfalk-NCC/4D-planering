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
const l3pcBudget = () => { const b = Number(l3Prefs().pcBudget); return b > 0 ? b : (typeof lowMemDevice !== "undefined" && lowMemDevice ? 1.5e6 : 6e6); };
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
  l3pc.clouds.push(c);
  l3pcPlace(c);
  return c;
}
/* Molnet ligger i modellens koordinater (som IFC och DXF) – flyttas med 3D-vyns origo (och sin höjdjustering). */
function l3pcPlace(c) { c.group.position.set(c.info.center[0] - l3.O[0], c.info.center[1] - l3.O[1], c.info.center[2] - l3.O[2] + (c.dz || 0)); l3pcMatApply(c); }
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
}
function l3pcApplyAll() { l3pc.clouds.forEach(l3pcMatApply); l3Render(); }
function l3pcRemove(id) {
  const i = l3pc.clouds.findIndex(c => c.id === id);
  if (i < 0) return;
  const c = l3pc.clouds[i];
  c.group.children.forEach(p => p.geometry.dispose()); c.mat.dispose();
  if (c.group.parent) c.group.parent.remove(c.group);
  l3pc.clouds.splice(i, 1);
  l3Render();
}
function l3pcShow(id, on) {
  const c = l3pc.clouds.find(x => x.id === id); if (!c) return;
  c.visible = on; c.group.visible = on; l3pcRemember(c.src, on); l3Render();
}
function l3pcRecolor() { l3pc.clouds.forEach(c => c.group.children.forEach((p, k) => { p.geometry.setAttribute("color", new THREE.BufferAttribute(l3pcColors(c, c.chunks[k]), 3, true)); })); l3Render(); }
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
      if (src.version || src.local) l3pcCachePut(src, data);
    }
    l3pcBuild(src, data);
    l3pcRemember(src, true);
    const i = data.info;
    l3Status(`☁ ${src.name}: ${l3pcMil(i.n).replace(/ p$/, "")} punkter visas${i.total > i.n ? ` av ${l3pcMil(i.total).replace(/ p$/, "")} (glesat jämnt för att 3D-vyn ska vara snabb – ändras under Lager → Avancerat)` : ""} – ${how}, ${((performance.now() - t0) / 1000).toFixed(1).replace(".", ",")} s.`);
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
      const src = { id: `pc:l:${f.name}:${f.size}:${f.lastModified}`, name: f.name, version: `${f.size}-${f.lastModified}`, local: true };
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
  m.innerHTML = `<button type="button" data-a="zoom">Zooma till molnet</button><button type="button" data-a="solo" ${l3pc.clouds.length < 2 ? "disabled" : ""}>${others || l3pc.clouds.length < 2 ? "Visa bara detta moln" : "Tänd alla moln"}</button><button type="button" data-a="dz">Höjdjustering…${c.dz ? ` (${String(c.dz).replace(".", ",")} m)` : ""}</button><button type="button" data-a="info">Om molnet</button><hr /><button type="button" data-a="del" class="bad">Ta bort ur listan</button>`;
  btn.closest(".v3-lr").after(m);
  m.onclick = e => {
    const a = e.target.closest("[data-a]"); if (!a) return; m.remove();
    if (a.dataset.a === "zoom") l3pcZoom(id);
    else if (a.dataset.a === "solo") l3pcSolo(id);
    else if (a.dataset.a === "dz") l3pcSetDz(id);
    else if (a.dataset.a === "del") l3pcForget(id);
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
