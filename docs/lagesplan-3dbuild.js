/* 3D-vyn: den riktiga byggnaden från Trimble Connect (Victors önskemål 2026-10-08: "jag förstår inte
   vad som ritas" – lådorna runt objekten räcker inte). 4D-planering (som har TC-behörigheten) hämtar
   de IFC-modeller som är tända i TC; här läses de med web-ifc (ifc-mesh.js), i bitar om högst
   ~80 000 trianglar (snabba träffar och fästpunkter), i TC:s läge för modellen (placeModel).
   Objekt som är kopplade i planeringen (GUID = object_id) färgas i statusfärg vid datumet; övriga i
   sin egen färg, ljusad, som bakgrund. Tryck på ett objekt visar dess uppgifter. */

let l3b = { models: [], busy: false };
const L3B_CHUNK = 80000;
// Tak för trianglar (geometrin läses i en egen tråd i typade arrayer, så datorn klarar mer än förut).
/* Taket för alla inlästa modeller tillsammans (Victor 2026-10-10: "jag måste kunna ladda in IFCer upp till
   200 mb iaf"). ~90 byte per triangel i minnet + lika mycket i grafikkortet: 16 miljoner ≈ 1,5 GB. */
/* Höjt 2026-10-10 (Victor: "du får nog öka taket", tak saknades i en stor modell): färgerna lagras som byte och
   normalerna som Int8, ~70 byte per triangel. Chrome rapporterar högst 8 GB – en större dator kan höja taket
   själv under Lager → Avancerat (eller med knappen när taket nås). */
const L3B_CAPS = [8, 16, 24, 32, 48];
const l3bAutoTris = () => {
  if (matchMedia("(pointer: coarse)").matches) return 2500000;
  const gb = navigator.deviceMemory || 8;
  return gb >= 8 ? 24000000 : gb >= 4 ? 10000000 : 5000000;
};
const l3bMaxTris = () => { const v = Number(typeof l3Prefs === "function" && l3Prefs().triCap) || 0; return v ? v * 1e6 : l3bAutoTris(); };

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
      // Samma fil får inte visas två gånger (t.ex. både som tänd modell i TC och ur mappen under Lager):
      // två exakt likadana ytor på samma ställe ger "sågtänder" i bilden (Victor 2026-10-10).
      const twin = !opts.replace && w.name && l3b.models.find(m => m.id !== w.id && m.name && m.name.toLowerCase() === String(w.name).toLowerCase());
      if (twin) { l3Status(`${w.name} visas redan – den läses inte in en gång till (samma modell två gånger ger flimrande ytor). Ta bort den under Lager → Inlästa om du vill läsa in den på nytt.`, true); continue; }
      // Ny version som ersätter en visad: den gamla döljs så fort den nya börjar synas (annars ligger
      // båda på samma ställe en stund och ytorna flimrar).
      const old = opts.replace ? l3b.models.find(m => m.id === w.id) : null;
      const hideOld = () => { if (old && old.visible !== false) { old.meshes.forEach(x => { x.visible = false; }); old.visible = false; } };
      l3Status(`Öppnar ${w.name || "modellen"} (${i + 1} av ${list.length})…`);
      // Laddningsindikatorn: varje modell är en lika stor del av stapeln (hämtning 60 %, läsning 40 %).
      const part = (a, b) => (i + a + (b - a)) / list.length;
      const lbl = `Byggnaden: ${w.name || "modellen"}${list.length > 1 ? ` (${i + 1} av ${list.length})` : ""}`;
      busyProgress("bldg", lbl, i / list.length);
      // Redan inläst tidigare (samma version): direkt från webbläsarens cache, utan hämtning och läsning.
      const tC0 = Date.now();
      const cached = await l3bCacheGet(w);
      if (cached) {
        const tC1 = Date.now();
        const m = l3bFromCache(cached);
        // Var tiden går ur cachen (Victor 2026-10-10: modellen tog ~7 s att visa trots cachen).
        times.push(`${cached.name || w.name}: ur webbläsarens cache – läsning ${((tC1 - tC0) / 1000).toFixed(1)} s, uppbyggnad ${((Date.now() - tC1) / 1000).toFixed(1)} s`);
        // Äldre poster saknar normaler: spara om en gång med dem, så går det fortare nästa gång.
        if (cached.chunks.some(c => !c.nrm) || cached.colV !== 2) setTimeout(() => l3bCachePut(w, m), 1500);
        m.id = w.id; m.name = cached.name || w.name; m.visible = true; m.src = w;
        if (opts.replace) l3bRemove(w.id);
        total += m.tris;
        m.meshes.forEach(x => l3.groups.bldg.add(x));
        l3b.models.push(m); l3bPosition(); l3bRemember(w, true);
        busyProgress("bldg", lbl, part(0, 1));
        continue;
      }
      if (opts.cacheOnly) { missing.push(w); continue; }
      l3Status(`Hämtar ${w.name || "modellen"} från Trimble Connect (${i + 1} av ${list.length})…`);
      const tDl0 = Date.now();
      const tick = setInterval(() => { const j = busyJobs.get("bldg"); if (j && j.f < part(0, 0.55)) busyProgress("bldg", lbl, j.f + 0.01 / list.length); }, 400);
      let r;
      // En IFC-fil ur projektets mappar (Lager): hämtas som fil, utan TC:s placering i 3D-vyn.
      // Hämtningens verkliga procent kommer från 4D-planering (0–55 % av modellens del av stapeln).
      // Statusraden visar hur många MB som hämtats (Victor 2026-10-10).
      let gotMb = 0;
      const dl = (f, got, tot) => {
        clearInterval(tick);
        const mb = got ? l3bMb(got) + (tot ? ` av ${l3bMb(tot)}` : "") + " MB" : "";
        if (got) gotMb = got;
        busyProgress("bldg", mb ? `${lbl} – ${mb}` : lbl, part(0, 0.55 * f));
        l3StatusLive(`Hämtar ${w.name} (${i + 1} av ${list.length})${mb ? `: ${mb}` : ""}${tot ? ` (${Math.round(100 * Math.min(1, got / tot))} %)` : ""}…`);
      };
      // Originalfilen finns ofta redan här i webbläsaren (sparas för egenskaperna): samma version läses
      // därifrån i stället för att hämtas från TC igen (t.ex. efter höjt tak eller ändrade detaljer).
      let local = null;
      try { local = w.version && typeof l3pRawLocal === "function" ? await l3pRawLocal({ id: w.id, src: w }) : null; } catch (e) { local = null; }
      try {
        if (local && local.blob) { clearInterval(tick); r = { bytes: await local.blob.arrayBuffer(), placement: w.fileId ? null : local.placement || null, name: w.name, local: true }; }
        else r = w.fileId ? { ...(await askOpener("tcFile", { fileId: w.fileId, name: w.name }, 0, dl)), name: w.name, placement: null } : await askOpener("ifcModelData", { modelId: w.id }, 0, dl);
      }
      finally { clearInterval(tick); }
      const tDl = Date.now() - tDl0, tRd0 = Date.now();
      l3Status(r.local ? `${r.name || w.name}: ${l3bMb(r.bytes.byteLength)} MB ur webbläsarens kopia (ingen hämtning från TC).` : `Hämtade ${r.name || w.name}: ${l3bMb(r.bytes ? r.bytes.byteLength : gotMb)} MB på ${(tDl / 1000).toFixed(1)} s.`);
      busyProgress("bldg", `Läser ${r.name || w.name}`, part(0, 0.6));
      l3Status(`Läser ${r.name || w.name} (${i + 1} av ${list.length})…`);
      await new Promise(res => setTimeout(res, 30));
      const lblRead = `Läser ${r.name || w.name}`;
      if (typeof l3pKeepRaw === "function" && !r.local) l3pKeepRaw(w, r.bytes, r.placement || null); // för egenskaper, spara och exportera
      let m;
      try { m = await l3bParseAny(r.bytes, r.placement, l3bMaxTris() - total, f => busyProgress("bldg", lblRead, part(0, 0.6 + 0.4 * f)), ms => { hideOld(); ms.forEach(x => l3.groups.bldg.add(x)); l3Render(); }); }
      catch (err) { if (old) { old.meshes.forEach(x => { x.visible = true; }); old.visible = true; } throw err; } // den gamla syns igen
      busyProgress("bldg", `Läser ${r.name || w.name}`, part(0, 1));
      times.push(`${m.name || r.name || w.name}: ${r.local ? "ur webbläsarens kopia" : `hämtning ${(tDl / 1000).toFixed(1)} s`}, läsning ${((Date.now() - tRd0) / 1000).toFixed(1)} s${m.parts > 1 ? ` (${m.parts} trådar)` : ""}`);
      skippedAll += m.skipped || 0;
      // Objekt med form som web-ifc inte kunde rita – redovisas per IFC-klass (syns i statusraden och historiken).
      const miss = Object.entries(m.missing || {}).sort((a, b) => b[1] - a[1]);
      if (m.hung && m.hung.length) times.push(`${r.name || w.name}: ${m.hung.length} objekt hoppades över eftersom läsaren hängde sig på dem (${m.hung.slice(0, 4).map(([t, n]) => `${t}${n ? " " + n : ""}`).join(", ")}${m.hung.length > 4 ? " …" : ""})`);
      if (miss.length) times.push(`${r.name || w.name}: ${miss.reduce((a, x) => a + x[1], 0).toLocaleString("sv-SE")} objekt kunde inte ritas (${miss.slice(0, 6).map(([t, c]) => `${t} ${c}`).join(", ")}${miss.length > 6 ? " …" : ""})`);
      if (opts.replace) l3bRemove(w.id);
      m.id = w.id; m.name = r.name || w.name; m.visible = true; m.src = w;
      total += m.tris;
      if (!m.capped) l3bCachePut(w, m); // i bakgrunden
      m.meshes.forEach(x => l3.groups.bldg.add(x));
      l3b.models.push(m);
      l3bPosition(); l3bRemember(w, true);
      if (m.capped) {
        const cap = l3bMaxTris() / 1e6, next = L3B_CAPS.find(c => c > cap);
        const msg = `${m.name} visas bara delvis: taket på ${cap.toFixed(0)} miljoner trianglar för alla modeller tillsammans nåddes (${(total / 1e6).toFixed(1)} miljoner inlästa). Höj taket (kräver mer minne) eller ta bort modeller du inte behöver under Lager.`;
        l3Toast(msg, next ? `Höj till ${next} miljoner och läs in igen` : null, () => { l3SetPref("triCap", next); l3bLoad([w], { replace: true }); }, 20000); l3Status(msg, true);
        break;
      }
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
    const extra = [times.join(" · "), skippedAll ? `${skippedAll.toLocaleString("sv-SE")} objekt visas inte (${l3bDetails() ? "armering" : "armering, installationer och andra detaljer"}) – Lager → Avancerat` : ""].filter(Boolean).join(". ");
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
  if (typeof l3pDrop === "function") l3pDrop(id);
}
/* De hämtade modellerna sparas per projekt (Victor 2026-10-10: hämtade från Trimble Connect ska ligga kvar
   under Hämtade 3D-modeller tills de tas bort med soptunnan). De tända visas direkt (ur cachen) nästa gång
   3D-vyn öppnas; de släckta står i listan och läses in när de tänds. */
const l3bRememberKey = () => `lagesplan-bldg-${projectId}`;
function l3bRememberedAll() { try { return JSON.parse(localStorage.getItem(l3bRememberKey()) || "[]") || []; } catch (e) { return []; } }
function l3bRemembered() { return l3bRememberedAll().filter(x => x.on !== false); }
function l3bRemember(w, on) {
  if (!w || !w.id) return;
  const list = l3bRememberedAll().filter(x => x.id !== w.id);
  list.push({ id: w.id, fileId: w.fileId || null, name: w.name || "", version: w.version || "", parentId: w.parentId || null, on: !!on });
  try { localStorage.setItem(l3bRememberKey(), JSON.stringify(list.slice(-30))); } catch (e) { /* privat läge */ }
}
/* Soptunnan: bort ur listan och ur vyn. Bara här i webbläsaren – inget i Trimble Connect ändras. */
function l3bForget(id) {
  try { localStorage.setItem(l3bRememberKey(), JSON.stringify(l3bRememberedAll().filter(x => x.id !== id))); } catch (e) { /* privat läge */ }
  l3bRemove(id);
}
/* Vid öppning: direkt ur cachen, sedan i bakgrunden – finns en nyare version i TC läses den och ersätter den visade. */
async function l3bRestore() {
  const list = l3bRemembered().map(({ on, ...w }) => w);
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
// Sex modeller (Victor 2026-10-10: stål- och byggmodell på 130–150 MB vardera ska inte tränga ut varandra).
const L3B_DB = "lagesplan-ifc-cache", L3B_STORE = "models", L3B_KEEP = 6;
function l3bDb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === "undefined") return rej(new Error("ingen IndexedDB"));
    const q = indexedDB.open(L3B_DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(L3B_STORE);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}
const l3bCacheKey = w => (w && w.version ? `v2|${projectId}|${w.fileId ? "f:" + w.fileId : w.id}|${w.version}|${l3bVoids() ? "u" : "s"}${l3bDetails() ? "d" : ""}${l3bRebar() ? "r" : ""}` : null);
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
    // Be webbläsaren att inte rensa cachen när disken blir trång (annars kan stora modeller försvinna).
    if (!l3bCachePut.asked && navigator.storage && navigator.storage.persist) { l3bCachePut.asked = true; navigator.storage.persist().catch(() => {}); }
    const db = await l3bDb();
    const rec = { key, name: m.name, O: m.O, tris: m.tris, at: Date.now(), colV: 2,
      chunks: m.meshes.map(x => ({ pos: x.geometry.getAttribute("position").array, col: x.geometry.getAttribute("color").array, idx: x.userData.l3b.origIdx, nrm: l3bNrm8(x.geometry),
        ranges: x.userData.l3b.ranges.map(r => ({ start: r.start, count: r.count, idxStart: r.idxStart, idxCount: r.idxCount, guid: r.guid, name: r.name, base: r.base })) })) };
    const st = db.transaction(L3B_STORE, "readwrite").objectStore(L3B_STORE);
    st.put(rec, key);
    // Rensa: behåll de senaste L3B_KEEP.
    const all = await new Promise(res => { const out = []; const c = db.transaction(L3B_STORE).objectStore(L3B_STORE).openCursor(); c.onsuccess = () => { const cur = c.result; if (!cur) return res(out); out.push([cur.key, cur.value.at || 0]); cur.continue(); }; c.onerror = () => res(out); });
    if (all.length > L3B_KEEP) { const del = db.transaction(L3B_STORE, "readwrite").objectStore(L3B_STORE); all.sort((a, b) => b[1] - a[1]).slice(L3B_KEEP).forEach(([k]) => del.delete(k)); }
  } catch (e) { console.warn("Kunde inte spara modellen i cachen", e); }
}
/* Normalerna som Int8 (en fjärdedel av minnet): slipper räkna om dem för miljontals trianglar vid öppning. */
function l3bNrm8(g) {
  const a = g.getAttribute("normal");
  if (!a) return null;
  if (a.array instanceof Int8Array) return a.array;
  const s = a.array, o = new Int8Array(s.length);
  for (let i = 0; i < s.length; i++) o[i] = Math.round(Math.max(-1, Math.min(1, s[i])) * 127);
  return o;
}
/* Äldre cacheposter har färgerna blandade 45 % mot ljusgrått (före 2026-10-10) – räknas tillbaka till
   modellens egna färger, så att cachen inte behöver läsas om från Trimble Connect. */
const L3B_OLDMIX = [0.875, 0.894, 0.918];
function l3bUnmix(a) { for (let i = 0; i < a.length; i++) a[i] = Math.min(1, Math.max(0, (a[i] - L3B_OLDMIX[i % 3] * 0.45) / 0.55)); return a; }
function l3bFromCache(rec) {
  if (rec.colV !== 2) rec.chunks.forEach(c => { l3bUnmix(c.col); c.ranges.forEach(r => { if (r.base) r.base = l3bUnmix(r.base.slice()); }); });
  const byGuid = new Map((items || []).filter(r => r.object_id).map(r => [String(r.object_id), r.id]));
  const out = { meshes: [], ranges: [], tris: rec.tris || 0, O: rec.O, capped: false };
  rec.chunks.forEach(c => {
    const ranges = c.ranges.map(r => ({ ...r, itemId: r.guid ? byGuid.get(r.guid) || null : null }));
    const m = l3bMeshFromArrays(c.pos, c.col, c.idx, ranges, out, c.nrm || null); // posten är redan en egen kopia
    out.meshes.push(m); out.ranges.push(...ranges);
  });
  return out;
}

/* Stora modeller (Victor 2026-10-09: 115 MB fryste sidan): läs i en egen tråd (ifc-worker.js) med
   procent, och visa bitarna medan resten läses. Går tråden inte att starta används l3bParse nedan. */
async function l3bParseAny(bytes, placement, maxTris, onProgress, onMeshes) {
  if (typeof Worker === "function" && !window.__l3NoWorker) {
    try { return await l3bParseWorker(bytes, placement, maxTris, onProgress, onMeshes); }
    catch (e) {
      // Flera trådar har var sin kopia av modellen i samma minne: stannade eller kraschade läsningen
      // (Victor 2026-10-10: "sen händer inget mer") läses den om med en tråd, som behöver mindre minne.
      if (e && !e.workerStart && e.parts > 1) {
        l3Status(`${e.message} Läser om med en tråd (mindre minne, tar längre tid)…`, true);
        return await l3bParseWorker(bytes, placement, maxTris, onProgress, onMeshes, 1);
      }
      if (!e || !e.workerStart) throw e;
      console.warn("IFC-tråden kunde inte starta – läser på sidan", e);
    }
  }
  const out = await l3bParse(bytes, placement, maxTris);
  if (onMeshes) onMeshes(out.meshes.slice());
  return out;
}
function l3bMeshFromArrays(pos, col, idx, ranges, out, nrm = null) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3, col instanceof Uint8Array)); // byte (0–255) från tråden, äldre cache: tal 0–1
  g.setIndex(pos.length / 3 > 65535 ? new THREE.BufferAttribute(idx, 1) : new THREE.BufferAttribute(Uint16Array.from(idx), 1));
  if (nrm && nrm.length === pos.length) g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3, true));
  else g.computeVertexNormals();
  g.computeBoundingSphere(); g.computeBoundingBox();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m.userData.kind = "bldg"; m.userData.surface = true;
  m.userData.l3b = { ranges, model: out, origIdx: g.index.array.slice(), hidden: new Set() };
  if (typeof l3BvhSchedule === "function") setTimeout(() => l3BvhSchedule(m), 0); // när biten ligger i scenen
  return m;
}
/* Antal trådar: stora filer delas på flera (var och en räknar vart N:te objekt), men varje tråd läser hela
   filen och behöver eget minne – därför efter filstorlek, kärnor och minne (Victor 2026-10-09: "nästan instant"). */
function l3bParts(size, voids = l3bVoids()) {
  // Högst 8 GB räknas (nyare Chrome kan rapportera mer, men flikens minne räcker inte till fler trådar).
  const cores = navigator.hardwareConcurrency || 4, memGb = Math.min(8, navigator.deviceMemory || 8);
  if (size < 25e6) return 1;
  // Varje tråd läser hela filen: utan urtag är geometrin lätt och flera trådar lönar sig bara på stora datorer.
  if (!voids && cores < 8) return 1;
  // ~16 × filen per tråd (med detaljer), högst en tredjedel av minnet – alla trådar delar flikens minne.
  const byMem = Math.max(1, Math.floor(memGb * 1e9 / 3 / (size * 16)));
  return Math.max(1, Math.min(3, Math.floor(cores / 2), byMem)); // halva de logiska kärnorna, högst tre
}
/* Urtag (fönster- och dörrhål) är den i särklass dyraste delen – av som standard, kan slås på under Lager. */
const l3bVoids = () => !!(typeof l3Prefs === "function" && l3Prefs().ifcVoids);
// Allt läses in som standard (Victor 2026-10-10: "precis allt"); detaljerna kan stängas av under Lager → Avancerat.
const l3bDetails = () => !(typeof l3Prefs === "function" && l3Prefs().ifcDetails === false);
const l3bRebar = () => !!(typeof l3Prefs === "function" && l3Prefs().ifcRebar);
/* Vakt (Victor 2026-10-10: "sen händer inget mer" – läsaren kunde hänga sig på ett enstaka objekt, eller
   Chrome stänga tråden vid minnesbrist utan fel). Tråden säger före varje portion om tio objekt var den är;
   hörs inget på STALL ms startas en ny tråd från senaste kontrollpunkt (det som redan är framme ligger kvar)
   och just den portionen hoppas över och redovisas. Innan första portionen (filen öppnas) väntar vakten längre. */
const L3B_STALL_MS = 60000, L3B_OPEN_MS = 300000, L3B_RESTARTS = 8;
function l3bParseWorker(bytes, placement, maxTris, onProgress, onMeshes, partsOverride) {
  return new Promise((resolve, reject) => {
    const buf0 = bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes).slice().buffer;
    // Samma versionsstämpel som skripten (tools/stamp.py), så att en ny tråd-fil inte fastnar i webbläsarens cache.
    const ver = ((document.querySelector('script[src*="lagesplan-3dbuild.js"]') || {}).src || "").split("?")[1] || "";
    const N = partsOverride || window.__l3Parts || l3bParts(buf0.byteLength), url = new URL("ifc-worker.js" + (ver ? "?" + ver : ""), location.href).href;
    const byGuid = new Map((items || []).filter(r => r.object_id).map(r => [String(r.object_id), r.id]));
    const out = { meshes: [], ranges: [], tris: 0, O: [...l3.O], capped: false, parts: N, hung: [] };
    const base = new URL("vendor/web-ifc/", location.href).href, voids = l3bVoids(), details = l3bDetails(), rebar = l3bRebar();
    // En post per del (tråd): var den är (at), senaste kontrollpunkt (ckpt), bitar efter den (pending).
    const W = [];
    let left = N, failed = false, started = false;
    const finish = () => { failed = true; clearInterval(watch); W.forEach(w => w.wk && w.wk.terminate()); };
    const fail = err => {
      if (failed) return; finish();
      out.meshes.forEach(m => { if (m.parent) m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); });
      reject(err);
    };
    const drop = ms => {
      if (!ms.length) return;
      const set = new Set(ms), rset = new Set();
      ms.forEach(m => { m.userData.l3b.ranges.forEach(r => rset.add(r)); out.tris -= m.geometry.index.count / 3; if (m.parent) m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); });
      out.meshes = out.meshes.filter(m => !set.has(m)); out.ranges = out.ranges.filter(r => !rset.has(r));
    };
    const start = (k, startAt, skipIdx) => {
      let wk;
      try { wk = new Worker(url); } catch (e) { e.workerStart = !started; e.parts = N; fail(e); return; }
      const w = W[k] = Object.assign(W[k] || { restarts: 0, skips: [], prog: 0, n: 0 }, { wk, at: null, ckpt: startAt, pending: [], heard: Date.now() });
      wk.onmessage = ev => {
        const d = ev.data || {};
        if (failed || W[k] !== w || w.wk !== wk) return;
        started = true; w.heard = Date.now();
        if (d.type === "at") w.at = d.i;
        else if (d.type === "ckpt") { w.ckpt = d.i; w.pending = []; }
        else if (d.type === "skipinfo") { (d.list || []).forEach(x => { if (!out.hung.some(y => y[2] && y[2] === x[2])) out.hung.push(x); }); }
        else if (d.type === "progress") {
          w.prog = d.f; w.n = Math.max(w.n, d.n || 0);
          const f = W.reduce((a, x) => a + (x ? x.prog : 0), 0) / N, n = W.reduce((a, x) => a + (x ? x.n : 0), 0);
          if (onProgress) onProgress(f);
          if (n && typeof l3StatusLive === "function") l3StatusLive(`Läser modellen: ${n.toLocaleString("sv-SE")} objekt (${Math.round(f * 100)} %)${N > 1 ? ` – ${N} trådar` : ""}…`);
        } else if (d.type === "chunk") {
          d.ranges.forEach(r => { r.itemId = r.guid ? byGuid.get(r.guid) || null : null; });
          const m = l3bMeshFromArrays(d.pos, d.col, d.idx, d.ranges, out, d.nrm && d.nrm.length ? d.nrm : null); // normalerna från tråden
          out.meshes.push(m); out.ranges.push(...d.ranges); out.tris += d.idx.length / 3; w.pending.push(m);
          if (onMeshes) onMeshes([m]);
          // Taket gäller alla trådar tillsammans.
          if (out.tris >= maxTris && !failed) { finish(); out.capped = true; resolve(out); }
        } else if (d.type === "done") {
          out.capped = out.capped || !!d.capped; out.skipped = (out.skipped || 0) + (d.skipped || 0); wk.terminate(); w.prog = 1; w.done = true;
          Object.entries(d.missing || {}).forEach(([t, c]) => { out.missing = out.missing || {}; out.missing[t] = (out.missing[t] || 0) + c; });
          if (--left === 0) { finish(); resolve(out); }
        } else if (d.type === "error") { const err = new Error(d.message); err.parts = N; fail(err); }
      };
      wk.onerror = e => { const err = new Error(e.message || "IFC-tråden avbröts (för lite minne?)"); err.workerStart = !started; err.parts = N; fail(err); };
      const b = buf0.slice(0); // varje tråd sin kopia – originalet finns kvar för en ny tråd
      wk.postMessage({ bytes: b, placement, O: out.O, maxTris: Math.ceil(maxTris), chunkTris: L3B_CHUNK, base, part: k, parts: N, voids, details, rebar, startAt, skipIdx }, [b]);
    };
    const watch = setInterval(() => {
      if (failed) return;
      const now = Date.now();
      W.forEach((w, k) => {
        if (!w || w.done) return;
        const lim = w.at === null ? (window.__l3OpenMs || L3B_OPEN_MS) : (window.__l3StallMs || L3B_STALL_MS);
        if (now - w.heard <= lim) return;
        // Hängt: ny tråd från senaste kontrollpunkt; det som kom efter den läses om, portionen där den hängde hoppas över.
        w.wk.terminate();
        if (w.at === null || ++w.restarts > L3B_RESTARTS) { const err = new Error(`Läsningen av modellen stannade${w.at === null ? " när filen öppnades (troligen slut på minne i webbläsaren)" : ""}.`); err.parts = N; fail(err); return; }
        drop(w.pending);
        w.skips.push([w.at, w.at + 10]);
        if (typeof l3StatusLive === "function") l3StatusLive(`Läsaren hängde sig på ett objekt – hoppar över det och fortsätter (${w.restarts} av högst ${L3B_RESTARTS})…`);
        start(k, Math.min(w.ckpt, w.at), w.skips.slice());
      });
    }, 2000);
    for (let k = 0; k < N; k++) start(k, 0, []);
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
        const col = new THREE.Color(c.x, c.y, c.z); // modellens egna färger (som i Trimble Connect)
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
    const col = x.geometry.getAttribute("color"), d = col.array, u = x.userData.l3b, K = d instanceof Uint8Array ? 255 : 1; // byte eller tal 0–1
    const off = new Set();
    u.ranges.forEach((r, ri) => {
      if (r.guid && !r.itemId) r.itemId = byGuid.get(r.guid) || null; // kopplad efter att modellen lästes
      const row = r.itemId ? byId.get(r.itemId) : null;
      if (row && typeof rowTempOffAt === "function" && rowTempOffAt(row, at)) off.add(ri); // temporär utanför sin tid: syns inte
      const c = r.itemId ? new THREE.Color(phaseColor(l3Phase(row))) : null;
      const cb = typeof l3pColorFor === "function" ? l3pColorFor(m, r) : null; // Färga efter värde (Egenskaper)
      const tint = u.tint && u.tint.get(ri); // tillfällig färg (bara sessionen) går före allt
      const rgb = tint || cb || (c ? [c.r, c.g, c.b] : r.base);
      const c0 = K === 255 ? Math.round(rgb[0] * 255) : rgb[0], c1 = K === 255 ? Math.round(rgb[1] * 255) : rgb[1], c2 = K === 255 ? Math.round(rgb[2] * 255) : rgb[2];
      for (let i = r.start; i < r.start + r.count; i++) { d[i * 3] = c0; d[i * 3 + 1] = c1; d[i * 3 + 2] = c2; }
    });
    col.needsUpdate = true;
    const was = u.tempOff || new Set();
    if (off.size !== was.size || [...off].some(i => !was.has(i))) { u.tempOff = off; l3bApplyHidden(x); }
  }));
}
function l3bCoupledIds() { const s = new Set(); l3b.models.forEach(m => m.visible && m.ranges.forEach(r => { if (r.itemId) s.add(r.itemId); })); return s; }
/* Träff i byggnaden -> objektets uppgifter. */
function l3bHitInfo(h) {
  if (h && h.object && h.object.userData.l3bMain) h = { ...h, object: h.object.userData.l3bMain };
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
  const off = u.tempOff || new Set(), alpha = u.alpha || new Map();
  if (u.hidden.size || off.size || alpha.size) {
    const hid = new Uint8Array(mesh.geometry.getAttribute("position").count);
    // Genomskinliga (tillfällig opacitet) ritas i en egen bit ovanpå – inte i huvudbiten.
    [...u.hidden, ...off, ...alpha.keys()].forEach(ri => { const r = u.ranges[ri]; hid.fill(1, r.start, r.start + r.count); });
    idx = [];
    for (let i = 0; i + 2 < src.length; i += 3) if (!hid[src[i]]) idx.push(src[i], src[i + 1], src[i + 2]);
  }
  // Alltid en kopia: det rumsliga indexet (BVH) ordnar om indexlistan, origIdx måste vara orörd.
  mesh.geometry.setIndex(mesh.geometry.getAttribute("position").count > 65535 ? new THREE.Uint32BufferAttribute(idx === src ? src.slice() : idx, 1) : new THREE.Uint16BufferAttribute(idx === src ? src.slice() : idx, 1));
  if (typeof l3BvhSchedule === "function") l3BvhSchedule(mesh);
  l3bApplyAlpha(mesh);
}
/* Tillfällig opacitet (Victor 2026-10-10): de genomskinliga objekten i en bit per opacitet som delar
   huvudbitens hörn och färger (inget extra minne för geometrin), med egen indexlista. */
function l3bApplyAlpha(mesh) {
  const u = mesh.userData.l3b;
  (u.ghosts || []).forEach(g => { mesh.remove(g); g.geometry.attributes = {}; g.geometry.dispose(); g.material.dispose(); }); // de delade hörnen lämnas orörda
  u.ghosts = [];
  if (!u.alpha || !u.alpha.size) return;
  const src = u.origIdx, n = mesh.geometry.getAttribute("position").count, gone = new Set([...u.hidden, ...(u.tempOff || [])]);
  const byA = new Map();
  u.alpha.forEach((a, ri) => { if (gone.has(ri)) return; if (!byA.has(a)) byA.set(a, []); byA.get(a).push(ri); });
  byA.forEach((ris, a) => {
    const on = new Uint8Array(n);
    ris.forEach(ri => { const r = u.ranges[ri]; on.fill(1, r.start, r.start + r.count); });
    const idx = [];
    for (let i = 0; i + 2 < src.length; i += 3) if (on[src[i]]) idx.push(src[i], src[i + 1], src[i + 2]);
    if (!idx.length) return;
    const g = new THREE.BufferGeometry();
    ["position", "color", "normal"].forEach(k => { const at = mesh.geometry.getAttribute(k); if (at) g.setAttribute(k, at); });
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    const gm = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: a, depthWrite: false, side: THREE.DoubleSide }));
    gm.userData.l3b = u; gm.userData.l3bMain = mesh; gm.userData.surface = true; gm.userData.kind = "bldg"; gm.renderOrder = 3;
    mesh.add(gm); u.ghosts.push(gm);
  });
}
function l3bHideHit(h) {
  if (h && h.object && h.object.userData.l3bMain) h = { ...h, object: h.object.userData.l3bMain };
  const u = h.object.userData.l3b;
  if (!u || !h.face) return;
  const v = h.face.a, ri = u.ranges.findIndex(r => v >= r.start && v < r.start + r.count);
  if (ri < 0) return;
  u.hidden.add(ri); l3bApplyHidden(h.object);
}
function l3bShowAllRanges() { l3b.models.forEach(m => m.meshes.forEach(x => { const u = x.userData.l3b; if (u.hidden.size) { u.hidden.clear(); l3bApplyHidden(x); } })); }
function l3bHiddenCount() { let n = 0; l3b.models.forEach(m => m.meshes.forEach(x => { n += x.userData.l3b.hidden.size; })); return n; }

function l3bMb(b) { const m = b / 1048576; const d = m < 1 ? 2 : m < 10 ? 1 : 0; return m.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }); }
