/* 3D-vyn – Förbered för offline (Victor 2026-11-19: "sitta och koppla till min 4D-kalender, Gantt-schemat alltså, på flygplanet utan internet").
   Prefix l3of. Panel i högermenyn (⋯-menyn → "Förbered för offline…", eller klick på offline-rutan längst ner till vänster).
   – "Hämta allt för offline": programmets alla filer (så att tjänstens cache har även arbetartrådar och wasm), projektets alla datafiler (tidplaner, kopplingar, placeringar, lager …)
     och dess binärfiler (ritningens PDF, bilder, DXF) sparas i webbläsaren. Utan nät används de, och ändringar läggs i en kö (offline.js) som skickas när nätet är tillbaka.
   – Köns innehåll visas: väntande ändringar och konflikter (någon annan hann ändra samma fil) med Skicka nu / Spara som fil / Släng.
   – Modeller (IFC) och punktmoln sparas när de tänds en gång online – panelen visar vilka som är sparade. */
const l3of = { busy: false };
const L3OF_KEY = "4dplan-offline-prepared";
const l3ofMb = n => (n / 1048576).toFixed(n >= 1e7 ? 0 : 1).replace(".", ",");
async function l3ofList(path, depth, out) {
  const res = await fetch(`${ghContentsUrl(path)}?ref=${GH_BRANCH}`, { headers: ghHeaders(token), cache: "no-store" });
  if (res.status === 404) return out; if (!res.ok) throw new Error(`Kunde inte lista ${path} (${res.status})`);
  const arr = await res.json(); if (!Array.isArray(arr)) return out;
  for (const e of arr) { if (e.type === "dir") { if (depth > 0) await l3ofList(e.path, depth - 1, out); } else out.push({ path: e.path, size: e.size || 0 }); }
  return out;
}
async function l3ofPool(list, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const k = i++; try { await fn(list[k], k); } catch (e) { /* räknas som miss i fn */ } } })); }
async function l3ofPrepare(onP) {
  if (l3of.busy) return null; l3of.busy = true;
  const R = { app: 0, appBytes: 0, appFail: 0, data: 0, dataBytes: 0, bin: 0, binBytes: 0, skipped: [], failed: [], at: Date.now() };
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("Du är offline – förberedelsen måste göras med internet.");
    // 1. Programmets filer
    onP && onP("Programfiler…", 0);
    let mani = null; try { mani = await (await fetch("offline-manifest.json", { cache: "no-store" })).json(); } catch (e) { /* utan lista */ }
    if (mani && mani.files) { let done = 0; await l3ofPool(mani.files, 6, async ([p, size]) => { try { const r = await fetch(p, { cache: "reload" }); if (r.ok) { await r.arrayBuffer(); R.app++; R.appBytes += size; } else R.appFail++; } catch (e) { R.appFail++; } onP && onP(`Programfiler ${++done} av ${mani.files.length}`, done / mani.files.length * 0.4); }); }
    // 2. Projektets data
    onP && onP("Listar projektets filer…", 0.4);
    if (typeof projectId === "undefined" || !projectId || typeof token === "undefined" || !token) throw new Error("Inget projekt är öppet.");
    const pf = await l3ofList(`projects/${encodeURIComponent(projectId)}`, 4, []), root = await l3ofList("", 0, []).catch(() => []), all = [...pf, ...root.filter(x => /\.json$/i.test(x.path))];
    let done = 0;
    await l3ofPool(all, 4, async f => {
      try {
        if (/\.json$/i.test(f.path)) { await ghGetFile(token, f.path, { fresh: true }); R.data++; R.dataBytes += f.size; }
        else if (f.size > 60e6) R.skipped.push(f.path + ` (${l3ofMb(f.size)} MB)`);
        else { const u = await ghReadBinaryUrl(token, f.path); try { URL.revokeObjectURL(u); } catch (e) { /* */ } R.bin++; R.binBytes += f.size; }
      } catch (e) { R.failed.push(f.path); }
      onP && onP(`Projektfiler ${++done} av ${all.length}`, 0.4 + done / Math.max(1, all.length) * 0.6);
    });
    try { localStorage.setItem(L3OF_KEY, JSON.stringify({ at: R.at, app: R.app, data: R.data, bin: R.bin, bytes: R.appBytes + R.dataBytes + R.binBytes, pid: projectId })); } catch (e) { /* */ }
    return R;
  } finally { l3of.busy = false; }
}
async function l3ofOpen() {
  if (typeof l3bfPanel !== "function") return; const esc = typeof escHtml === "function" ? escHtml : s => String(s);
  let last = null; try { last = JSON.parse(localStorage.getItem(L3OF_KEY) || "null"); } catch (e) { /* */ }
  const sync = window.offlineSync, pend = sync ? await sync.pending() : [], bins = sync ? await sync.cachedBins() : [], files = sync ? await sync.cachedFiles() : [];
  const models = typeof l3b !== "undefined" ? l3b.models.map(m => m.name) : [], rem = typeof l3bRememberedAll === "function" ? l3bRememberedAll().map(w => w.name).filter(Boolean) : [];
  const when = t => new Date(t).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
  const el = l3bfPanel("v3OffPanel", "Offline", `
    <div class="v3-sub">${navigator.onLine === false ? "🔴 Du är offline – sparade filer används och ändringar köas." : "🟢 Online."}</div>
    <div class="v3-sec">Förbered för offline</div>
    <div class="v3-sub">Hämtar programmets filer och projektets alla datafiler och ritningar så att du kan arbeta utan internet (till exempel på flyget). Gör det hemma, med nät.</div>
    <div class="an-actions"><button type="button" id="v3OffGo">📴 Hämta allt för offline</button></div>
    <progress id="v3OffBar" max="1" value="0" style="width:100%;display:none"></progress><div class="v3-sub" id="v3OffTxt">${last ? `Senast klart ${esc(when(last.at))}: ${last.app} programfiler, ${last.data} datafiler, ${last.bin} ritningar/bilder (${l3ofMb(last.bytes)} MB).` : "Inte förberett än."}</div>
    <div class="v3-sub">Sparat i webbläsaren nu: ${files.length} datafiler, ${bins.length} binärfiler (${l3ofMb(bins.reduce((a, b) => a + b.size, 0))} MB).</div>
    <div class="v3-sec">Modeller och punktmoln</div>
    <div class="v3-sub">Sparas i webbläsaren första gången du tänder dem online – tänd de du behöver innan du åker. ${models.length ? "Tända nu: " + esc(models.join(", ")) + "." : ""} ${rem.length ? "Kom ihåg från förut: " + esc(rem.join(", ")) + "." : ""}</div>
    <div class="v3-sec">Väntande ändringar</div>
    ${pend.length ? pend.map(p => `<div class="v3-sub" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span style="flex:1;min-width:0;word-break:break-all">${p.conflict ? "⚠ " : "⏳ "}${esc(p.path)} <small>${esc(when(p.at))}</small></span>${p.conflict ? `<button type="button" class="pcs-mini" data-of-save="${esc(p.path)}">Spara som fil</button><button type="button" class="pcs-mini" data-of-drop="${esc(p.path)}">Släng</button>` : ""}</div>`).join("") : '<div class="v3-sub">Inga – allt är skickat.</div>'}
    ${pend.some(p => !p.conflict) ? '<div class="an-actions"><button type="button" id="v3OffSend">Skicka väntande nu</button></div>' : ""}
    ${pend.some(p => p.conflict) ? '<div class="v3-sub">⚠ Konflikt: någon annan har ändrat samma fil. Din ändring ligger kvar och skrivs inte över – spara den som fil och lägg in den för hand.</div>' : ""}`);
  if (!el) return; const $ = id => el.querySelector("#" + id);
  $("v3OffGo").onclick = async () => {
    const b = $("v3OffGo"), bar = $("v3OffBar"), txt = $("v3OffTxt"); b.disabled = true; bar.style.display = ""; bar.value = 0;
    try { const R = await l3ofPrepare((t, f) => { txt.textContent = t; bar.value = f; }); bar.style.display = "none";
      txt.innerHTML = `<b>Klart för offline.</b> ${R.app} programfiler, ${R.data} datafiler, ${R.bin} ritningar/bilder (${l3ofMb(R.appBytes + R.dataBytes + R.binBytes)} MB).${R.appFail ? ` ${R.appFail} programfiler kunde inte hämtas.` : ""}${R.failed.length ? ` Kunde inte hämta: ${esc(R.failed.slice(0, 5).join(", "))}${R.failed.length > 5 ? " …" : ""}.` : ""}${R.skipped.length ? ` För stora och hoppade över: ${esc(R.skipped.slice(0, 3).join(", "))}.` : ""} Tänd även modellerna du behöver.`; }
    catch (e) { bar.style.display = "none"; txt.textContent = "Kunde inte förbereda: " + e.message; }
    b.disabled = false;
  };
  const send = $("v3OffSend"); if (send) send.onclick = async () => { await sync.flush(); setTimeout(l3ofOpen, 600); };
  el.querySelectorAll("[data-of-save]").forEach(b => { b.onclick = async () => { const p = (await sync.pending()).find(x => x.path === b.dataset.ofSave); if (!p) return; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(p.data, null, 1)], { type: "application/json" })); a.download = p.path.split("/").pop(); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }; });
  el.querySelectorAll("[data-of-drop]").forEach(b => { b.onclick = async () => { if (typeof uiConfirm === "function" && !(await uiConfirm("Kasta den väntande ändringen? Den går inte att få tillbaka (spara den som fil först).")) ) return; await sync.clearConflict(b.dataset.ofDrop); l3ofOpen(); }; });
}
