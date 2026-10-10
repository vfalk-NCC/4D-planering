/* 3D-vyn: den riktiga byggnaden från Trimble Connect (Victors önskemål 2026-10-08: "jag förstår inte
   vad som ritas" – lådorna runt objekten räcker inte). 4D-planering (som har TC-behörigheten) hämtar
   de IFC-modeller som är tända i TC; här läses de med web-ifc (ifc-mesh.js), i bitar om högst
   ~80 000 trianglar (snabba träffar och fästpunkter), i TC:s läge för modellen (placeModel).
   Objekt som är kopplade i planeringen (GUID = object_id) färgas i statusfärg vid datumet; övriga i
   sin egen färg, ljusad, som bakgrund. Tryck på ett objekt visar dess uppgifter. */

let l3b = { models: [], busy: false };
const L3B_CHUNK = 80000;
// Tak för trianglar (geometrin läses i en egen tråd i typade arrayer, så datorn klarar mer än förut).
const l3bMaxTris = () => (matchMedia("(pointer: coarse)").matches ? 2000000 : 6000000);

/* Lista över tända IFC-modeller (från 4D-planering) och val av vilka som ska visas. */
async function l3bOpenDialog(boxId = "v3BldgBox") {
  const box = document.getElementById(boxId);
  if (!box) return;
  box.innerHTML = `<div class="v3-pop-hint">Hämtar listan över tända modeller i Trimble Connect…</div>`;
  let list = [];
  try { list = (await askOpener("ifcModelsList", {}, 20000)).models || []; }
  catch (e) { box.innerHTML = `<div class="v3-pop-hint bad">${escHtml(e.message)}</div><button type="button" class="v3-wide" id="v3BldgRetry">Försök igen</button>`; box.querySelector("#v3BldgRetry").onclick = () => l3bOpenDialog(boxId); return; }
  const loaded = new Map(l3b.models.map(m => [m.id, m]));
  if (!list.length && !loaded.size) { box.innerHTML = `<div class="v3-pop-hint">Inga IFC-modeller är tända i Trimble Connect. Tänd byggnadens modeller i TC och försök igen.</div><button type="button" class="v3-wide" id="v3BldgRetry">Försök igen</button>`; box.querySelector("#v3BldgRetry").onclick = () => l3bOpenDialog(boxId); return; }
  box.innerHTML = `<div class="v3-pop-hint">Välj vilka modeller som ska visas. Etableringsfiler visas redan som etablering.</div>
    <div class="v3-bldg-list">${list.map(m => {
      const L = loaded.get(m.id);
      return `<label class="v3-chk"><input type="checkbox" data-bldg="${escHtml(m.id)}" ${L ? (L.visible ? "checked" : "") : (m.etab ? "" : "checked")} /> <span>${escHtml(m.name)}</span>${L ? `<em>${(L.tris / 1000).toFixed(0)}k tri</em>` : ""}</label>`;
    }).join("")}</div>
    <button type="button" class="v3-wide v3-primary" id="v3BldgGo">Visa valda</button>`;
  box.querySelector("#v3BldgGo").onclick = async () => {
    const want = [...box.querySelectorAll("[data-bldg]")].map(c => { const m = list.find(x => x.id === c.dataset.bldg) || {}; return { id: c.dataset.bldg, on: c.checked, name: m.name, version: m.version || "" }; });
    want.filter(w => !w.on).forEach(w => l3bShow(w.id, false));
    want.filter(w => w.on && loaded.has(w.id)).forEach(w => l3bShow(w.id, true));
    const todo = want.filter(w => w.on && !loaded.has(w.id));
    l3HideMenus();
    if (todo.length) await l3bLoad(todo);
    l3RenderLegend(); l3Render();
  };
}
function l3bShow(id, on) {
  const m = l3b.models.find(x => x.id === id);
  if (!m) return;
  m.visible = on; m.meshes.forEach(x => { x.visible = on; });
  l3bRemember(m.src, on);
  if (typeof l3LayersRender === "function") l3LayersRender();
}
/* opts.cacheOnly: bara det som finns i cachen (direkt vid öppning); opts.replace: en ny version ersätter den visade. */
async function l3bLoad(list, opts = {}) {
  if (l3b.busy) return { missing: list };
  l3b.busy = true;
  const first = !l3b.models.length, missing = [], times = [];
  let total = l3b.models.reduce((s, m) => s + m.tris, 0), skippedAll = 0;
  try {
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      if (!opts.replace && l3b.models.some(m => m.id === w.id)) continue;
      l3Status(`Hämtar ${w.name || "modellen"} från Trimble Connect (${i + 1} av ${list.length})…`);
      // Laddningsindikatorn: varje modell är en lika stor del av stapeln (hämtning 60 %, läsning 40 %).
      const part = (a, b) => (i + a + (b - a)) / list.length;
      const lbl = `Byggnaden: ${w.name || "modellen"}${list.length > 1 ? ` (${i + 1} av ${list.length})` : ""}`;
      busyProgress("bldg", lbl, i / list.length);
      // Redan inläst tidigare (samma version): direkt från webbläsarens cache, utan hämtning och läsning.
      const cached = await l3bCacheGet(w);
      if (cached) {
        const m = l3bFromCache(cached);
        m.id = w.id; m.name = cached.name || w.name; m.visible = true; m.src = w;
        if (opts.replace) l3bRemove(w.id);
        total += m.tris;
        m.meshes.forEach(x => l3.groups.bldg.add(x));
        l3b.models.push(m); l3bPosition(); l3bRemember(w, true);
        busyProgress("bldg", lbl, part(0, 1));
        continue;
      }
      if (opts.cacheOnly) { missing.push(w); continue; }
      const tDl0 = Date.now();
      const tick = setInterval(() => { const j = busyJobs.get("bldg"); if (j && j.f < part(0, 0.55)) busyProgress("bldg", lbl, j.f + 0.01 / list.length); }, 400);
      let r;
      // En IFC-fil ur projektets mappar (Lager): hämtas som fil, utan TC:s placering i 3D-vyn.
      // Hämtningens verkliga procent kommer från 4D-planering (0–55 % av modellens del av stapeln).
      const dl = f => { clearInterval(tick); busyProgress("bldg", lbl, part(0, 0.55 * f)); };
      try { r = w.fileId ? { ...(await askOpener("tcFile", { fileId: w.fileId, name: w.name }, 0, dl)), name: w.name, placement: null } : await askOpener("ifcModelData", { modelId: w.id }, 0, dl); }
      finally { clearInterval(tick); }
      const tDl = Date.now() - tDl0, tRd0 = Date.now();
      busyProgress("bldg", `Läser ${r.name || w.name}`, part(0, 0.6));
      l3Status(`Läser ${r.name || w.name} (${i + 1} av ${list.length})…`);
      await new Promise(res => setTimeout(res, 30));
      const lblRead = `Läser ${r.name || w.name}`;
      const m = await l3bParseAny(r.bytes, r.placement, l3bMaxTris() - total, f => busyProgress("bldg", lblRead, part(0, 0.6 + 0.4 * f)), ms => { ms.forEach(x => l3.groups.bldg.add(x)); l3Render(); });
      busyProgress("bldg", `Läser ${r.name || w.name}`, part(0, 1));
      times.push(`${m.name || r.name || w.name}: hämtning ${(tDl / 1000).toFixed(1)} s, läsning ${((Date.now() - tRd0) / 1000).toFixed(1)} s${m.parts > 1 ? ` (${m.parts} trådar)` : ""}`);
      skippedAll += m.skipped || 0;
      if (opts.replace) l3bRemove(w.id);
      m.id = w.id; m.name = r.name || w.name; m.visible = true; m.src = w;
      total += m.tris;
      if (!m.capped) l3bCachePut(w, m); // i bakgrunden
      m.meshes.forEach(x => l3.groups.bldg.add(x));
      l3b.models.push(m);
      l3bPosition(); l3bRemember(w, true);
      if (m.capped) { l3Toast(`${m.name} är för stor för att visas helt här – en del av den visas.`); break; }
    }
    l3bRecolor();
    // Lådorna behövs inte när byggnaden syns.
    if (first && ["solid", "ghost"].includes(l3Prefs().objs) && l3.objMesh) {
      l3SetPref("objs", "hidden");
      document.querySelectorAll("[data-v3objs]").forEach(b => b.classList.toggle("on", b.dataset.v3objs === "hidden"));
      l3BuildObjects();
      l3Toast("Byggnaden visas. Lådorna runt de planerade objekten är dolda (Visa → Planerade objekt).");
    }
    const n = l3b.models.reduce((s, m) => s + m.ranges.filter(r => r.itemId).length, 0);
    // Var tiden gick (hämtning från TC respektive läsning) och vad som hoppades över.
    const extra = [times.join(" · "), skippedAll ? `${skippedAll.toLocaleString("sv-SE")} detaljer (armering, inredning, installationer) visas inte – Lager → Visa detaljer` : ""].filter(Boolean).join(". ");
    if (l3b.models.length) l3Status(`Byggnaden visas (${l3b.models.length} ${l3b.models.length === 1 ? "modell" : "modeller"}, ${(total / 1000).toFixed(0)}k trianglar). ${n} objekt är kopplade och färgas efter status.${extra ? " " + extra + "." : ""}`);
    if (first && l3b.models.length) l3Frame(true);
  } catch (e) { l3Status("Kunde inte visa byggnaden: " + (e && e.message ? e.message : e), true); }
  busyProgress("bldg", "", null);
  l3b.busy = false;
  if (typeof l3LayersRender === "function") l3LayersRender();
  l3Render();
  return { missing };
}
function l3bRemove(id) {
  const i = l3b.models.findIndex(m => m.id === id);
  if (i < 0) return;
  if (typeof l3bs !== "undefined" && l3bs.sel.some(e => e.mesh.userData.l3b.model === l3b.models[i])) l3bsSet(l3bs.sel.filter(e => e.mesh.userData.l3b.model !== l3b.models[i]));
  l3b.models[i].meshes.forEach(x => { if (x.parent) x.parent.remove(x); x.geometry.dispose(); x.material.dispose(); });
  l3b.models.splice(i, 1);
}
/* Modellerna som var tända sparas per projekt och visas direkt (ur cachen) nästa gång 3D-vyn öppnas. */
const l3bRememberKey = () => `lagesplan-bldg-${projectId}`;
function l3bRemembered() { try { return JSON.parse(localStorage.getItem(l3bRememberKey()) || "[]") || []; } catch (e) { return []; } }
function l3bRemember(w, on) {
  if (!w || !w.id) return;
  const list = l3bRemembered().filter(x => x.id !== w.id);
  if (on) list.push({ id: w.id, fileId: w.fileId || null, name: w.name || "", version: w.version || "", parentId: w.parentId || null });
  try { localStorage.setItem(l3bRememberKey(), JSON.stringify(list.slice(-8))); } catch (e) { /* privat läge */ }
}
/* Vid öppning: direkt ur cachen, sedan i bakgrunden – finns en nyare version i TC läses den och ersätter den visade. */
async function l3bRestore() {
  const list = l3bRemembered();
  if (!list.length || !l3) return;
  const r = await l3bLoad(list, { cacheOnly: true });
  let fresh = [];
  try {
    const onTc = list.filter(w => !w.fileId);
    if (onTc.length) {
      const tc = (await askOpener("ifcModelsList", {}, 20000)).models || [];
      onTc.forEach(w => { const m = tc.find(x => x.id === w.id); if (m && m.version && m.version !== w.version) fresh.push({ ...w, version: m.version }); });
    }
    const byFolder = new Map();
    list.filter(w => w.fileId && w.parentId).forEach(w => { if (!byFolder.has(w.parentId)) byFolder.set(w.parentId, []); byFolder.get(w.parentId).push(w); });
    for (const [folderId, ws] of byFolder) {
      const items = (await askOpener("tcFolder", { folderId }, 30000)).items || [];
      ws.forEach(w => { const f = items.find(x => x.id === w.fileId); const v = f && (f.versionId || (f.modified ? String(f.modified) : "")); if (v && v !== w.version) fresh.push({ ...w, version: v }); });
    }
  } catch (e) { fresh = []; /* 4D-planering inte öppen: visa det som finns i cachen */ }
  const todo = [...(r && r.missing || []).filter(w => !fresh.some(f => f.id === w.id)), ...fresh];
  if (todo.length) { l3Toast(fresh.length ? "En nyare version av byggnaden finns i Trimble Connect – den läses in och ersätter den visade." : "Byggnaden läses in…"); await l3bLoad(todo, { replace: true }); }
}
/* Bitarna ligger relativt O när de lästes; flytta dem om origo bytts (annan arbetsyta). */
function l3bPosition() { l3b.models.forEach(m => m.meshes.forEach(x => x.position.set(m.O[0] - l3.O[0], m.O[1] - l3.O[1], m.O[2] - l3.O[2]))); }
function l3bRebuild() { if (!l3b.models.length) return; l3b.models.forEach(m => m.meshes.forEach(x => { if (!x.parent) l3.groups.bldg.add(x); })); l3bPosition(); l3bRecolor(); }

/* Cache i webbläsaren (IndexedDB) för lästa modeller, per modell och version (Victor 2026-10-09:
   stora bygg-IFC:er). Bara geometri och objektens GUID/namn sparas; kopplingen till planeringen räknas
   om vid öppning. Högst tre modeller sparas – den äldsta tas bort. Fel här stoppar aldrig inläsningen. */
const L3B_DB = "lagesplan-ifc-cache", L3B_STORE = "models", L3B_KEEP = 3;
function l3bDb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === "undefined") return rej(new Error("ingen IndexedDB"));
    const q = indexedDB.open(L3B_DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(L3B_STORE);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}
const l3bCacheKey = w => (w && w.version ? `v2|${projectId}|${w.fileId ? "f:" + w.fileId : w.id}|${w.version}|${l3bVoids() ? "u" : "s"}${l3bDetails() ? "d" : ""}` : null);
async function l3bCacheGet(w) {
  const key = l3bCacheKey(w);
  if (!key) return null;
  try {
    const db = await l3bDb();
    return await new Promise(res => { const q = db.transaction(L3B_STORE).objectStore(L3B_STORE).get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); });
  } catch (e) { return null; }
}
async function l3bCachePut(w, m) {
  const key = l3bCacheKey(w);
  if (!key) return;
  try {
    const db = await l3bDb();
    const rec = { key, name: m.name, O: m.O, tris: m.tris, at: Date.now(),
      chunks: m.meshes.map(x => ({ pos: x.geometry.getAttribute("position").array, col: x.geometry.getAttribute("color").array, idx: x.userData.l3b.origIdx,
        ranges: x.userData.l3b.ranges.map(r => ({ start: r.start, count: r.count, idxStart: r.idxStart, idxCount: r.idxCount, guid: r.guid, name: r.name, base: r.base })) })) };
    const st = db.transaction(L3B_STORE, "readwrite").objectStore(L3B_STORE);
    st.put(rec, key);
    // Rensa: behåll de senaste L3B_KEEP.
    const all = await new Promise(res => { const out = []; const c = db.transaction(L3B_STORE).objectStore(L3B_STORE).openCursor(); c.onsuccess = () => { const cur = c.result; if (!cur) return res(out); out.push([cur.key, cur.value.at || 0]); cur.continue(); }; c.onerror = () => res(out); });
    if (all.length > L3B_KEEP) { const del = db.transaction(L3B_STORE, "readwrite").objectStore(L3B_STORE); all.sort((a, b) => b[1] - a[1]).slice(L3B_KEEP).forEach(([k]) => del.delete(k)); }
  } catch (e) { console.warn("Kunde inte spara modellen i cachen", e); }
}
function l3bFromCache(rec) {
  const byGuid = new Map((items || []).filter(r => r.object_id).map(r => [String(r.object_id), r.id]));
  const out = { meshes: [], ranges: [], tris: rec.tris || 0, O: rec.O, capped: false };
  rec.chunks.forEach(c => {
    const ranges = c.ranges.map(r => ({ ...r, itemId: r.guid ? byGuid.get(r.guid) || null : null }));
    const m = l3bMeshFromArrays(c.pos, c.col.slice(), c.idx, ranges, out);
    out.meshes.push(m); out.ranges.push(...ranges);
  });
  return out;
}

/* Stora modeller (Victor 2026-10-09: 115 MB fryste sidan): läs i en egen tråd (ifc-worker.js) med
   procent, och visa bitarna medan resten läses. Går tråden inte att starta används l3bParse nedan. */
async function l3bParseAny(bytes, placement, maxTris, onProgress, onMeshes) {
  if (typeof Worker === "function" && !window.__l3NoWorker) {
    try { return await l3bParseWorker(bytes, placement, maxTris, onProgress, onMeshes); }
    catch (e) { if (!e || !e.workerStart) throw e; console.warn("IFC-tråden kunde inte starta – läser på sidan", e); }
  }
  const out = await l3bParse(bytes, placement, maxTris);
  if (onMeshes) onMeshes(out.meshes.slice());
  return out;
}
function l3bMeshFromArrays(pos, col, idx, ranges, out) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(pos.length / 3 > 65535 ? new THREE.BufferAttribute(idx, 1) : new THREE.BufferAttribute(Uint16Array.from(idx), 1));
  g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m.userData.kind = "bldg"; m.userData.surface = true;
  m.userData.l3b = { ranges, model: out, origIdx: g.index.array.slice(), hidden: new Set() };
  if (typeof l3BvhSchedule === "function") setTimeout(() => l3BvhSchedule(m), 0); // när biten ligger i scenen
  return m;
}
/* Antal trådar: stora filer delas på flera (var och en räknar vart N:te objekt), men varje tråd läser hela
   filen och behöver eget minne – därför efter filstorlek, kärnor och minne (Victor 2026-10-09: "nästan instant"). */
function l3bParts(size, voids = l3bVoids()) {
  const cores = navigator.hardwareConcurrency || 4, memGb = navigator.deviceMemory || 8;
  if (size < 25e6) return 1;
  // Varje tråd läser hela filen: utan urtag är geometrin lätt och flera trådar lönar sig bara på stora datorer.
  if (!voids && cores < 8) return 1;
  const byMem = Math.max(1, Math.floor(memGb * 1e9 * 0.5 / (size * 10))); // ~10 × filen per tråd, högst halva minnet
  return Math.max(1, Math.min(6, Math.floor(cores / 2), byMem)); // halva de logiska kärnorna (hypertrådar konkurrerar)
}
/* Urtag (fönster- och dörrhål) är den i särklass dyraste delen – av som standard, kan slås på under Lager. */
const l3bVoids = () => !!(typeof l3Prefs === "function" && l3Prefs().ifcVoids);
const l3bDetails = () => !!(typeof l3Prefs === "function" && l3Prefs().ifcDetails);
function l3bParseWorker(bytes, placement, maxTris, onProgress, onMeshes) {
  return new Promise((resolve, reject) => {
    const buf0 = bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes).slice().buffer;
    // Samma versionsstämpel som skripten (tools/stamp.py), så att en ny tråd-fil inte fastnar i webbläsarens cache.
    const ver = ((document.querySelector('script[src*="lagesplan-3dbuild.js"]') || {}).src || "").split("?")[1] || "";
    const N = window.__l3Parts || l3bParts(buf0.byteLength), url = new URL("ifc-worker.js" + (ver ? "?" + ver : ""), location.href).href;
    const wks = [];
    try { for (let k = 0; k < N; k++) wks.push(new Worker(url)); }
    catch (e) { wks.forEach(w => w.terminate()); e.workerStart = true; reject(e); return; }
    const byGuid = new Map((items || []).filter(r => r.object_id).map(r => [String(r.object_id), r.id]));
    const out = { meshes: [], ranges: [], tris: 0, O: [...l3.O], capped: false, parts: N };
    const prog = new Array(N).fill(0);
    let started = false, left = N, failed = false;
    // Avbrutet mitt i (t.ex. slut på minne): stoppa alla trådar och ta bort de bitar som hann visas.
    const fail = err => {
      if (failed) return; failed = true;
      wks.forEach(w => w.terminate());
      out.meshes.forEach(m => { if (m.parent) m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); });
      reject(err);
    };
    wks.forEach((wk, k) => {
      wk.onmessage = ev => {
        const d = ev.data || {};
        if (failed) return;
        started = true;
        if (d.type === "progress") { prog[k] = d.f; if (onProgress) onProgress(prog.reduce((a, b) => a + b, 0) / N); }
        else if (d.type === "chunk") {
          d.ranges.forEach(r => { r.itemId = r.guid ? byGuid.get(r.guid) || null : null; });
          const m = l3bMeshFromArrays(d.pos, d.col, d.idx, d.ranges, out);
          out.meshes.push(m); out.ranges.push(...d.ranges); out.tris += d.idx.length / 3;
          if (onMeshes) onMeshes([m]);
        } else if (d.type === "done") {
          out.capped = out.capped || !!d.capped; out.skipped = (out.skipped || 0) + (d.skipped || 0); wk.terminate(); prog[k] = 1;
          if (--left === 0) resolve(out);
        } else if (d.type === "error") fail(new Error(d.message));
      };
      wk.onerror = e => { const err = new Error(e.message || "IFC-tråden avbröts (för lite minne?)"); err.workerStart = !started; fail(err); };
    });
    const base = new URL("vendor/web-ifc/", location.href).href, voids = l3bVoids(), details = l3bDetails();
    wks.forEach((wk, k) => {
      const b = k === N - 1 ? buf0 : buf0.slice(0); // varje tråd sin kopia; den sista får originalet
      wk.postMessage({ bytes: b, placement, O: out.O, maxTris: Math.ceil(maxTris / N), chunkTris: L3B_CHUNK, base, part: k, parts: N, voids, details }, [b]);
    });
  });
}
/* IFC-bytes -> bitar (Mesh) med färg per objekt. placement = TC:s placering av modellen (mm). */
async function l3bParse(bytes, placement, maxTris) {
  const api = await ifcmLoad();
  const id = api.OpenModel(new Uint8Array(bytes), { COORDINATE_TO_ORIGIN: false, CIRCLE_SEGMENTS: 12 });
  const pl = placement || { position: { x: 0, y: 0, z: 0 }, refDirection: { x: 1, y: 0, z: 0 } };
  const rd = pl.refDirection || { x: 1, y: 0, z: 0 }, rl = Math.hypot(rd.x, rd.y) || 1, cs = rd.x / rl, sn = rd.y / rl;
  const P = pl.position || { x: 0, y: 0, z: 0 }, O = [...l3.O];
  const byGuid = new Map((items || []).filter(r => r.object_id).map(r => [String(r.object_id), r.id]));
  const ctx = new THREE.Color(0xdfe4ea);
  const out = { meshes: [], ranges: [], tris: 0, O, capped: false };
  let cur = null;
  const open = () => { cur = { pos: [], col: [], idx: [], ranges: [] }; };
  const close = () => {
    if (!cur || !cur.idx.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(cur.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(cur.col, 3));
    g.setIndex(cur.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(cur.idx, 1) : new THREE.Uint16BufferAttribute(cur.idx, 1));
    g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    m.userData.kind = "bldg"; m.userData.surface = true; m.userData.l3b = { ranges: cur.ranges, model: out, origIdx: cur.idx.slice(), hidden: new Set() };
    if (typeof l3BvhSchedule === "function") setTimeout(() => l3BvhSchedule(m), 0);
    out.meshes.push(m); out.ranges.push(...cur.ranges);
    cur = null;
  };
  open();
  try {
    api.StreamAllMeshes(id, mesh => {
      if (out.capped) return;
      let guid = null, name = "";
      try { const line = api.GetLine(id, mesh.expressID); guid = line && line.GlobalId ? line.GlobalId.value : null; name = line && line.Name ? line.Name.value || "" : ""; } catch (e) { /* utan namn */ }
      const start = cur.pos.length / 3;
      let base = null;
      for (let gi = 0; gi < mesh.geometries.size(); gi++) {
        const pg = mesh.geometries.get(gi), geom = api.GetGeometry(id, pg.geometryExpressID);
        const v = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
        const ix = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
        if (geom.delete) geom.delete();
        if (out.tris + ix.length / 3 > maxTris) { out.capped = true; return; }
        out.tris += ix.length / 3;
        const T = pg.flatTransformation, c = pg.color || { x: 0.8, y: 0.8, z: 0.8 };
        const col = new THREE.Color(c.x, c.y, c.z).lerp(ctx, 0.45);
        if (!base) base = [col.r, col.g, col.b];
        const o = cur.pos.length / 3;
        for (let k = 0; k < v.length; k += 6) {
          const x = v[k], y = v[k + 1], z = v[k + 2];
          const wx = T[0] * x + T[4] * y + T[8] * z + T[12], wy = T[1] * x + T[5] * y + T[9] * z + T[13], wz = T[2] * x + T[6] * y + T[10] * z + T[14];
          const X = wx, Y = -wz, Z = wy; // web-ifc: Y uppåt -> Z uppåt
          cur.pos.push(cs * X - sn * Y + P.x / 1000 - O[0], sn * X + cs * Y + P.y / 1000 - O[1], Z + P.z / 1000 - O[2]);
          cur.col.push(col.r, col.g, col.b);
        }
        for (let k = 0; k < ix.length; k++) cur.idx.push(ix[k] + o);
      }
      const count = cur.pos.length / 3 - start;
      if (count) cur.ranges.push({ start, count, guid, name, itemId: guid ? byGuid.get(guid) || null : null, base: base || [0.85, 0.87, 0.9] });
      if (cur.idx.length / 3 > L3B_CHUNK) { close(); open(); }
    });
  } finally { api.CloseModel(id); }
  close();
  return out;
}
/* Statusfärg för kopplade objekt vid datumet i lägesplanen. */
function l3bRecolor() {
  if (!l3 || !l3b.models.length) return;
  const byId = new Map((items || []).map(r => [r.id, r]));
  const byGuid = new Map((items || []).filter(r => r.object_id).map(r => [String(r.object_id), r.id]));
  const at = $("dateInput").value || todayIso();
  l3b.models.forEach(m => m.meshes.forEach(x => {
    const col = x.geometry.getAttribute("color"), d = col.array, u = x.userData.l3b;
    const off = new Set();
    u.ranges.forEach((r, ri) => {
      if (r.guid && !r.itemId) r.itemId = byGuid.get(r.guid) || null; // kopplad efter att modellen lästes
      const row = r.itemId ? byId.get(r.itemId) : null;
      if (row && typeof rowTempOffAt === "function" && rowTempOffAt(row, at)) off.add(ri); // temporär utanför sin tid: syns inte
      const c = r.itemId ? new THREE.Color(phaseColor(l3Phase(row))) : null;
      const rgb = c ? [c.r, c.g, c.b] : r.base;
      for (let i = r.start; i < r.start + r.count; i++) { d[i * 3] = rgb[0]; d[i * 3 + 1] = rgb[1]; d[i * 3 + 2] = rgb[2]; }
    });
    col.needsUpdate = true;
    const was = u.tempOff || new Set();
    if (off.size !== was.size || [...off].some(i => !was.has(i))) { u.tempOff = off; l3bApplyHidden(x); }
  }));
}
function l3bCoupledIds() { const s = new Set(); l3b.models.forEach(m => m.visible && m.ranges.forEach(r => { if (r.itemId) s.add(r.itemId); })); return s; }
/* Träff i byggnaden -> objektets uppgifter. */
function l3bHitInfo(h) {
  const u = h.object.userData.l3b;
  if (!u || !h.face) return null;
  const v = h.face.a, R = u.ranges;
  let lo = 0, hi = R.length - 1, r = null;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (R[mid].start <= v) { r = R[mid]; lo = mid + 1; } else hi = mid - 1; }
  if (!r || v >= r.start + r.count) return null;
  const model = l3b.models.find(m => m === u.model);
  return { itemId: r.itemId, name: r.name || "Objekt i modellen", extra: [["Modell", model ? model.name : ""], ["IFC-id", r.guid || ""]] };
}

/* Dölja enskilda objekt i byggnaden: indexlistan byggs om utan objektets trianglar. */
function l3bApplyHidden(mesh) {
  const u = mesh.userData.l3b, src = u.origIdx;
  let idx = src;
  const off = u.tempOff || new Set();
  if (u.hidden.size || off.size) {
    const hid = new Uint8Array(mesh.geometry.getAttribute("position").count);
    [...u.hidden, ...off].forEach(ri => { const r = u.ranges[ri]; hid.fill(1, r.start, r.start + r.count); });
    idx = [];
    for (let i = 0; i + 2 < src.length; i += 3) if (!hid[src[i]]) idx.push(src[i], src[i + 1], src[i + 2]);
  }
  // Alltid en kopia: det rumsliga indexet (BVH) ordnar om indexlistan, origIdx måste vara orörd.
  mesh.geometry.setIndex(mesh.geometry.getAttribute("position").count > 65535 ? new THREE.Uint32BufferAttribute(idx === src ? src.slice() : idx, 1) : new THREE.Uint16BufferAttribute(idx === src ? src.slice() : idx, 1));
  if (typeof l3BvhSchedule === "function") l3BvhSchedule(mesh);
}
function l3bHideHit(h) {
  const u = h.object.userData.l3b;
  if (!u || !h.face) return;
  const v = h.face.a, ri = u.ranges.findIndex(r => v >= r.start && v < r.start + r.count);
  if (ri < 0) return;
  u.hidden.add(ri); l3bApplyHidden(h.object);
}
function l3bShowAllRanges() { l3b.models.forEach(m => m.meshes.forEach(x => { const u = x.userData.l3b; if (u.hidden.size) { u.hidden.clear(); l3bApplyHidden(x); } })); }
function l3bHiddenCount() { let n = 0; l3b.models.forEach(m => m.meshes.forEach(x => { n += x.userData.l3b.hidden.size; })); return n; }
