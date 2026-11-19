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
  for (const e of arr) { if (e.type === "dir") { if (depth > 0) await l3ofList(e.path, depth - 1, out); } else out.push({ path: e.path, size: e.size || 0, sha: e.sha || null }); }
  return out;
}
async function l3ofPool(list, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < list.length) { const k = i++; try { await fn(list[k], k); } catch (e) { /* räknas som miss i fn */ } } })); }
const L3OF_GROUPS = [["data", "Tidplaner, kopplingar och övrig data (JSON)"], ["draw", "Ritningar och underlag (PDF, DXF, Excel, Powerproject …)"], ["img", "Bilder och foton"], ["other", "Övrigt"]];
const l3ofGroup = path => (/\.json$/i.test(path) ? "data" : /\.(pdf|dxf|dwg|xlsx?|csv|pp|ppb|ppx|ifc|ifczip|zip|txt|xml)$/i.test(path) ? "draw" : /\.(png|jpe?g|webp|gif|heic|svg|bmp|tiff?)$/i.test(path) ? "img" : "other");
/* Steg 1 – lista vad som finns och vad som redan är sparat (snabbt, inga stora hämtningar). */
async function l3ofScan() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("Du är offline – förberedelsen måste göras med internet.");
  if (typeof projectId === "undefined" || !projectId || typeof token === "undefined" || !token) throw new Error("Inget projekt är öppet.");
  const sync = window.offlineSync, fm = new Map(((sync && await sync.cachedFileMeta()) || []).map(x => [x.path, x.sha])), bm = new Map(((sync && await sync.binMeta()) || []).map(x => [x.path, x.sha]));
  let mani = null; try { mani = await (await fetch("offline-manifest.json", { cache: "no-store" })).json(); } catch (e) { /* utan lista */ }
  let prev = null; try { prev = JSON.parse(localStorage.getItem(L3OF_KEY) || "null"); } catch (e) { /* */ }
  const appDone = !!(mani && prev && prev.mv && prev.mv === mani.v);
  const pf = await l3ofList(`projects/${encodeURIComponent(projectId)}`, 4, []), root = await l3ofList("", 0, []).catch(() => []), all = [...pf, ...root.filter(x => /\.json$/i.test(x.path))];
  const G = { data: [], draw: [], img: [], other: [] };
  all.forEach(f => { const g = l3ofGroup(f.path), cached = g === "data" ? fm.get(f.path) === f.sha : bm.get(f.path) === f.sha; G[g].push({ ...f, cached, g }); });
  return { mani, appDone, groups: G, app: mani ? { files: mani.files.length, bytes: mani.files.reduce((a, f) => a + f[1], 0) } : null };
}
/* Steg 2 – hämta det valda: data först, sedan underlag, sist bilder. Redan sparade filer (samma sha) hoppas över. onP(text, fraktion, info). */
async function l3ofRun(scan, sel, onP, ctl) {
  const R = { app: 0, appBytes: 0, appFail: 0, data: 0, dataBytes: 0, bin: 0, binBytes: 0, skipped: [], failed: [], cancelled: false, at: Date.now(), already: 0 };
  const t0 = Date.now(); let doneBytes = 0, totalBytes = 0;
  const todo = []; ["data", "draw", "img", "other"].forEach(g => { if (!sel[g]) return; scan.groups[g].forEach(f => { if (f.cached) { R.already++; return; } if (g !== "data" && f.size > 60e6) { R.skipped.push(`${f.path} (${l3ofMb(f.size)} MB)`); return; } todo.push(f); totalBytes += f.size || 1; }); });
  const appFiles = sel.app && scan.mani && !scan.appDone ? scan.mani.files : []; appFiles.forEach(f => { totalBytes += f[1]; });
  const tick = txt => { const el = (Date.now() - t0) / 1000, rate = el > 2 ? doneBytes / el : 0, left = rate ? (totalBytes - doneBytes) / rate : 0; onP && onP(txt, totalBytes ? doneBytes / totalBytes : 1, { doneBytes, totalBytes, rate, left }); };
  let n = 0;
  await l3ofPool(appFiles, 6, async ([p, size]) => { if (ctl.cancel) return; try { const r = await fetch(p, { cache: "reload" }); if (r.ok) { await r.arrayBuffer(); R.app++; R.appBytes += size; } else R.appFail++; } catch (e) { R.appFail++; } doneBytes += size; tick(`Programfiler ${R.app + R.appFail} av ${appFiles.length}`); });
  const sync = window.offlineSync;
  await l3ofPool(todo, 4, async f => {
    if (ctl.cancel) return;
    try {
      if (f.g === "data") { await ghGetFile(token, f.path, { fresh: true }); R.data++; R.dataBytes += f.size; }
      else { const u = await ghReadBinaryUrl(token, f.path); try { URL.revokeObjectURL(u); } catch (e) { /* */ } if (sync && f.sha) await sync.tagBin(f.path, f.sha); R.bin++; R.binBytes += f.size; }
    } catch (e) { R.failed.push(f.path); }
    doneBytes += f.size || 1; tick(`${++n} av ${todo.length} projektfiler`);
  });
  R.cancelled = !!ctl.cancel;
  if (!R.cancelled) { try { localStorage.setItem(L3OF_KEY, JSON.stringify({ at: R.at, app: R.app, data: R.data + (scan.groups.data.length - todo.filter(f => f.g === "data").length), bin: R.bin, bytes: R.appBytes + R.dataBytes + R.binBytes, pid: projectId, mv: scan.mani ? scan.mani.v : null, sel })); } catch (e) { /* */ } }
  return R;
}
/* Allt på en gång (utan val): bakåtkompatibelt och för test. */
async function l3ofPrepare(onP, sel) { if (l3of.busy) return null; l3of.busy = true; try { const sc = await l3ofScan(); return await l3ofRun(sc, sel || { app: true, data: true, draw: true, img: true, other: true }, onP, { cancel: false }); } finally { l3of.busy = false; } }
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
    <div class="an-actions"><button type="button" id="v3OffGo">📴 Förbered för offline…</button></div>
    <div id="v3OffSel"></div><progress id="v3OffBar" max="1" value="0" style="width:100%;display:none"></progress><div class="v3-sub" id="v3OffTxt">${last ? `Senast klart ${esc(when(last.at))}: ${last.app} programfiler, ${last.data} datafiler, ${last.bin} ritningar/bilder (${l3ofMb(last.bytes)} MB).` : "Inte förberett än."}</div>
    <div class="v3-sub">Sparat i webbläsaren nu: ${files.length} datafiler, ${bins.length} binärfiler (${l3ofMb(bins.reduce((a, b) => a + b.size, 0))} MB).</div>
    <div class="v3-sec">Modeller och punktmoln</div>
    <div class="v3-sub">Sparas i webbläsaren första gången du tänder dem online – tänd de du behöver innan du åker. ${models.length ? "Tända nu: " + esc(models.join(", ")) + "." : ""} ${rem.length ? "Kom ihåg från förut: " + esc(rem.join(", ")) + "." : ""}</div>
    <div class="v3-sec">Väntande ändringar</div>
    ${pend.length ? pend.map(p => `<div class="v3-sub" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span style="flex:1;min-width:0;word-break:break-all">${p.conflict ? "⚠ " : "⏳ "}${esc(p.path)} <small>${esc(when(p.at))}</small></span>${p.conflict ? `<button type="button" class="pcs-mini" data-of-save="${esc(p.path)}">Spara som fil</button><button type="button" class="pcs-mini" data-of-drop="${esc(p.path)}">Släng</button>` : ""}</div>`).join("") : '<div class="v3-sub">Inga – allt är skickat.</div>'}
    ${pend.some(p => !p.conflict) ? '<div class="an-actions"><button type="button" id="v3OffSend">Skicka väntande nu</button></div>' : ""}
    ${pend.some(p => p.conflict) ? '<div class="v3-sub">⚠ Konflikt: någon annan har ändrat samma fil. Din ändring ligger kvar och skrivs inte över – spara den som fil och lägg in den för hand.</div>' : ""}`);
  if (!el) return; const $ = id => el.querySelector("#" + id);
  $("v3OffGo").onclick = async () => {
    const b = $("v3OffGo"), bar = $("v3OffBar"), txt = $("v3OffTxt"), box = $("v3OffSel"); b.disabled = true; txt.textContent = "Listar projektets filer…"; box.innerHTML = "";
    let sc; try { sc = await l3ofScan(); } catch (e) { txt.textContent = "Kunde inte förbereda: " + e.message; b.disabled = false; return; }
    const sums = g => { const L = sc.groups[g], need = L.filter(f => !f.cached); return { n: L.length, need: need.length, bytes: need.reduce((a, f) => a + (f.size || 0), 0), big: need.filter(f => f.size > 60e6 && g !== "data").length }; };
    const row = (id, label, n, need, bytes, on, note) => `<label class="v3-row" style="display:flex;gap:6px;align-items:baseline"><input type="checkbox" data-of-g="${id}" ${on ? "checked" : ""} ${need === 0 ? "disabled" : ""}><span style="flex:1">${esc(label)}${note ? ` <small style="color:#64748b">${esc(note)}</small>` : ""}</span><small style="color:#64748b;white-space:nowrap">${need === 0 ? "redan sparat" : need + " st · " + l3ofMb(bytes) + " MB"}</small></label>`;
    const ap = sc.app ? row("app", "Programmets filer", sc.app.files, sc.appDone ? 0 : sc.app.files, sc.app.bytes, !sc.appDone, sc.appDone ? "" : "") : "";
    box.innerHTML = `<div class="v3-sec">Vad ska hämtas?</div>${ap}${L3OF_GROUPS.map(([g, label]) => { const m = sums(g); return m.n ? row(g, label, m.n, m.need, m.bytes, g === "data" || g === "draw", g === "img" ? "stort – ta bara om du behöver dem" : m.big ? `${m.big} över 60 MB hoppas över` : "") : ""; }).join("")}
      <div class="v3-sub" id="v3OffEst"></div><div class="an-actions"><button type="button" id="v3OffStart">▶ Starta hämtningen</button></div>`;
    const est = () => { let bytes = 0; if ((box.querySelector('[data-of-g="app"]') || {}).checked) bytes += sc.app ? sc.app.bytes : 0; box.querySelectorAll("[data-of-g]").forEach(i => { if (i.checked && i.dataset.ofG !== "app") bytes += sums(i.dataset.ofG).bytes; }); $("v3OffEst").textContent = `Att hämta: ca ${l3ofMb(bytes)} MB.${sc.groups.data.concat(sc.groups.draw, sc.groups.img, sc.groups.other).some(f => f.cached) ? " Redan sparade filer hoppas över." : ""}`; };
    box.onchange = est; est(); txt.textContent = ""; b.disabled = false;
    $("v3OffStart").onclick = async () => {
      const sel = { app: !!(box.querySelector('[data-of-g="app"]') || {}).checked }; L3OF_GROUPS.forEach(([g]) => { sel[g] = !!(box.querySelector(`[data-of-g="${g}"]`) || {}).checked; });
      const ctl = { cancel: false }; l3of.busy = true; box.innerHTML = '<div class="an-actions"><button type="button" id="v3OffCancel">✕ Avbryt (sparat behålls)</button></div>'; $("v3OffCancel").onclick = () => { ctl.cancel = true; $("v3OffCancel").disabled = true; };
      bar.style.display = ""; bar.value = 0; b.disabled = true;
      try { const R = await l3ofRun(sc, sel, (t, f, i) => { bar.value = f; txt.textContent = `${t} – ${l3ofMb(i.doneBytes)} av ${l3ofMb(i.totalBytes)} MB${i.rate ? `, ${l3ofMb(i.rate)} MB/s, ca ${i.left > 90 ? Math.round(i.left / 60) + " min" : Math.round(i.left) + " s"} kvar` : ""}`; }, ctl);
        bar.style.display = "none"; box.innerHTML = "";
        txt.innerHTML = `<b>${R.cancelled ? "Avbrutet – det som hann hämtas är sparat." : "Klart för offline."}</b> ${R.app} programfiler, ${R.data} datafiler, ${R.bin} ritningar/bilder hämtade (${l3ofMb(R.appBytes + R.dataBytes + R.binBytes)} MB)${R.already ? `, ${R.already} fanns redan` : ""}.${R.appFail ? ` ${R.appFail} programfiler kunde inte hämtas.` : ""}${R.failed.length ? ` Kunde inte hämta: ${esc(R.failed.slice(0, 5).join(", "))}${R.failed.length > 5 ? " …" : ""}.` : ""}${R.skipped.length ? ` För stora och hoppade över: ${esc(R.skipped.slice(0, 3).join(", "))}.` : ""} ${R.cancelled ? "Tryck Hämta igen för att fortsätta där du slutade." : "Tänd även modellerna du behöver."}`; }
      catch (e) { bar.style.display = "none"; txt.textContent = "Kunde inte förbereda: " + e.message; }
      l3of.busy = false; b.disabled = false;
    };
  };
  const send = $("v3OffSend"); if (send) send.onclick = async () => { await sync.flush(); setTimeout(l3ofOpen, 600); };
  el.querySelectorAll("[data-of-save]").forEach(b => { b.onclick = async () => { const p = (await sync.pending()).find(x => x.path === b.dataset.ofSave); if (!p) return; const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(p.data, null, 1)], { type: "application/json" })); a.download = p.path.split("/").pop(); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }; });
  el.querySelectorAll("[data-of-drop]").forEach(b => { b.onclick = async () => { if (typeof uiConfirm === "function" && !(await uiConfirm("Kasta den väntande ändringen? Den går inte att få tillbaka (spara den som fil först).")) ) return; await sync.clearConflict(b.dataset.ofDrop); l3ofOpen(); }; });
}
