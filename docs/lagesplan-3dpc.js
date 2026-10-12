/* 3D-vyn – punktmoln (Victor 2026-10-12: "stöd för punktmoln i min 3d-editor utan att kompromissa med prestandan?
   Då ska dom moln gå att hämta från 'Reality capture' i Trimble connect om möjligt").

   – Källor: projektets mappar i Trimble Connect (Lager → Trimble Connect mapp – samma LAS/LAZ/E57-filer som
     Reality Capture tar emot) och en fil från datorn (Lager → ＋ Punktmoln från fil…).
   – Format: LAS, LAZ, XYZ/PTS/TXT och PLY (pc-worker.js). E57: exportera till LAZ/LAS.
   – Prestanda: läses i bakgrunden och glesas ut jämnt till en punktbudget (dator 6 milj., iPhone/iPad 1,5 milj.,
     ändras under Avancerat), delas i rutor så att det som inte syns inte ritas, punkterna är några skärmpixlar
     stora (billigt att rita). Det utglesade molnet sparas i webbläsarens cache – nästa gång öppnas det direkt.
   – Lager → Punktmoln: tänd/släck, zooma, ta bort; punktstorlek och färg (molnets färg, intensitet, höjd). */

const l3pc = { clouds: [], busy: false, worker: null };
const L3PC_EXT = /\.(las|laz|xyz|pts|txt|ply|e57)$/i;
const L3PC_DB = "lagesplan-pc-cache", L3PC_STORE = "clouds", L3PC_KEEP = 4;
const l3pcKey = () => `lagesplan-pc-${projectId}`;
const l3pcBudget = () => { const b = Number(l3Prefs().pcBudget); return b > 0 ? b : (typeof lowMemDevice !== "undefined" && lowMemDevice ? 1.5e6 : 6e6); };
const l3pcSize = () => Number(l3Prefs().pcSize) || 2;
const l3pcMode = () => l3Prefs().pcMode || "auto";
const l3pcMil = n => (n < 100000 ? Math.round(n).toLocaleString("sv-SE") + " p" : (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(".", ",") + " milj.");

/* ---- Ihågkomna moln (per projekt, i webbläsaren) -------------------------------------------------- */
function l3pcRemembered() { try { return JSON.parse(localStorage.getItem(l3pcKey()) || "[]") || []; } catch (e) { return []; } }
function l3pcRemember(src, on) {
  const list = l3pcRemembered().filter(x => x.id !== src.id);
  list.push({ id: src.id, name: src.name, fileId: src.fileId || null, version: src.version || "", parentId: src.parentId || null, local: !!src.local, on: !!on });
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
    w.postMessage({ bytes, name, budget: l3pcBudget() }, [bytes]);
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
  let mode = l3pcMode();
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
  const c = { id: src.id, name: src.name, src, info: data.info, chunks: data.chunks, group: grp, mat, visible: true };
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
/* Molnet ligger i modellens koordinater (som IFC och DXF) – flyttas med 3D-vyns origo. */
function l3pcPlace(c) { c.group.position.set(c.info.center[0] - l3.O[0], c.info.center[1] - l3.O[1], c.info.center[2] - l3.O[2]); }
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
function l3pcResize() { l3pc.clouds.forEach(c => { c.mat.size = l3pcSize(); }); l3Render(); }
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
  try {
    const t0 = performance.now();
    let data = await l3pcCacheGet(src), how = "ur webbläsarens cache";
    if (!data) {
      if (opts.cacheOnly) return;
      if (!getBytes) throw new Error("Filen finns inte kvar – välj den igen.");
      busyProgress(key, lbl + " – hämtar", 0);
      const bytes = await getBytes(f => busyProgress(key, lbl + " – hämtar", f * 0.5));
      busyProgress(key, lbl + " – läser", 0.5);
      data = await l3pcParse(bytes, src.name, f => busyProgress(key, lbl + " – läser", 0.5 + f * 0.45));
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
    l3pc.busy = false;
    if (typeof l3LayersRender === "function") l3LayersRender();
    l3Render();
  }
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
      l3pcLoad(src, async onP => { onP(1); return f.arrayBuffer(); });
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

/* ---- Lager → 3D-modeller: avsnittet Punktmoln ---------------------------------------------------- */
function l3pcHtml(row, esc) {
  const rest = l3pcRemembered().filter(s => !l3pc.clouds.some(c => c.id === s.id));
  const rows = [...l3pc.clouds.map(c => ({ c, name: c.name })), ...rest.map(s => ({ s, name: s.name }))].sort((a, b) => String(a.name).localeCompare(String(b.name), "sv", { numeric: true }));
  const del = id => `<button type="button" class="v3-lr-zoom v3-lr-del" data-pc-forget="${esc(id)}" title="Ta bort ur listan (inget i Trimble Connect ändras)">${L3_ICO.trash}</button>`;
  let h = `<div class="v3-lg v3-lr-sub" style="margin-top:8px">Punktmoln</div>`;
  h += rows.map(({ c, s, name }) => c
    ? row(`data-pc-eye="${esc(c.id)}"`, c.visible, `☁ ${esc(name)}`, `<button type="button" class="v3-lr-zoom" data-pc-zoom="${esc(c.id)}" title="Zooma till molnet">${L3_ICO.focus}</button><em class="v3-lr-k" title="${esc(c.info.format)} · ${c.info.n.toLocaleString("sv-SE")} av ${c.info.total.toLocaleString("sv-SE")} punkter">${l3pcMil(c.info.n)}</em>` + del(c.id))
    : row(`data-pc-rem="${esc(s.id)}"`, false, `☁ ${esc(name)}`, del(s.id))).join("");
  if (l3pc.clouds.length) h += `<div class="v3-pc-set"><label title="Punkternas storlek på skärmen">Punktstorlek <input type="range" id="v3PcSize" min="1" max="6" step="0.5" value="${l3pcSize()}" /></label><label>Färg <select id="v3PcMode">${[["auto", "Automatiskt"], ["rgb", "Molnets färg"], ["int", "Intensitet"], ["z", "Höjd"]].map(([v, l]) => `<option value="${v}" ${l3pcMode() === v ? "selected" : ""}>${l}</option>`).join("")}</select></label></div>`;
  h += `<button type="button" class="v3-wide" id="v3PcFile" title="LAS, LAZ, XYZ/PTS/TXT eller PLY från datorn. Moln i Trimble Connect (även de som laddats upp till Reality Capture) finns under Trimble Connect mapp.">＋ Punktmoln från fil…</button>`;
  return h;
}
function l3pcBind(host) {
  host.querySelectorAll("[data-pc-eye]").forEach(b => { b.onclick = () => { const c = l3pc.clouds.find(x => x.id === b.dataset.pcEye); if (c) { l3pcShow(c.id, !c.visible); l3LayersRender(); } }; });
  host.querySelectorAll("[data-pc-rem]").forEach(b => { b.onclick = () => l3pcLoadRemembered(b.dataset.pcRem); });
  host.querySelectorAll("[data-pc-zoom]").forEach(b => { b.onclick = () => l3pcZoom(b.dataset.pcZoom); });
  host.querySelectorAll("[data-pc-forget]").forEach(b => { b.onclick = () => l3pcForget(b.dataset.pcForget); });
  const sz = host.querySelector("#v3PcSize"); if (sz) sz.oninput = () => { l3SetPref("pcSize", Number(sz.value)); l3pcResize(); };
  const md = host.querySelector("#v3PcMode"); if (md) md.onchange = () => { l3SetPref("pcMode", md.value); l3pcRecolor(); };
  const fb = host.querySelector("#v3PcFile"); if (fb) fb.onclick = () => l3pcFromFile();
}
