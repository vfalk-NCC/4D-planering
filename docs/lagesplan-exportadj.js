/* Justera exportpunkter (Victor 2026-11-13: "lägga kommentarer och ange vilken plushöjd punkterna ligger på vid export … markera flera samtidigt och ändra plushöjder").
   CAD-export → 3D-objekt → "✎ Justera höjder & kommentarer": alla punkter som exporten tar med (Powerproject-objekten och Excel-planeringens punkter som syns i vyn) i en panel
   som kan dockas till höger (kartan krymper och går att panorera/zooma medan tabellen visas) eller flyta fritt.
   – Kolumnerna sorteras (tryck på rubriken) och bredderna ändras (dra i rubrikkanten). Tryck på ett namn: punkten markeras och visas i 2D-vyn.
   – Punkterna kan dras på kartan: Powerproject-prickarna som förut (sparas som flyttad markering), Excel-prickarna när panelen är öppen. X/Y i tabellen följer automatiskt.
   – Plushöjd och kommentar per punkt, flera markerade ändras samtidigt. Allt sparas i projektet (arbetsytans data, plan.exportAdj).
   – Varningar: punkter som ligger långt från de andra, utanför ritningen eller på 0,0, eller med en höjd som avviker kraftigt från grannarna, märks ⚠ med förslag på placering/höjd som kan tas med ett klick.
   Prefix exportAdj / adj. */
/* ---- Lagring (arbetsytans data) ---- */
const exportAdjLocalKey = () => `lagesplan-exportadj-${typeof projectId !== "undefined" ? projectId : ""}-${plan ? plan.id : ""}`;
function exportAdjAll() {
  if (!plan) return {};
  if (!plan.exportAdj) {
    let v = {}; try { v = JSON.parse(localStorage.getItem(exportAdjLocalKey()) || "{}") || {}; } catch (e) { v = {}; }
    plan.exportAdj = v;
    if (Object.keys(v).length && typeof schedulePlanSave === "function") { schedulePlanSave(); try { localStorage.removeItem(exportAdjLocalKey()); } catch (e) { /* privat läge */ } }
  }
  return plan.exportAdj;
}
let exportAdjVer = 0;   // ändras när lägen/höjder ändras (Excel-prickarnas cache)
function exportAdjSave() { if (plan && plan.exportAdj && !Object.keys(plan.exportAdj).length) delete plan.exportAdj; exportAdjVer++; if (typeof schedulePlanSave === "function") schedulePlanSave(); }
/* Läggs på markeringarna i objExportMarkers(): zTop/zManual, kommentar och (Excel) eget läge. */
function exportAdjApply(marks) {
  const A = exportAdjAll();
  marks.forEach(m => {
    const a = A[m.key]; if (!a) return;
    if (Number.isFinite(a.z)) { m.zTop = a.z; m.zManual = true; }
    if (Number.isFinite(a.x) && Number.isFinite(a.y) && m.key.startsWith("xl:")) { m.x = a.x; m.y = a.y; m.xyManual = true; }
    if (a.comment) m.adj = { comment: a.comment };
  });
}
function exportAdjSet(key, patch) {
  const A = exportAdjAll(), a = { ...(A[key] || {}), ...patch };
  ["z", "x", "y"].forEach(k => { if (!Number.isFinite(a[k])) delete a[k]; }); if (!a.comment) delete a.comment;
  if (Object.keys(a).length) A[key] = a; else delete A[key];
}

/* ---- Varningar och förslag ---- */
function exportAdjAnalyze(marks) {
  const n = marks.length, out = new Map(); if (n < 4) return out;
  const X = Float64Array.from(marks, m => m.x), Y = Float64Array.from(marks, m => m.y), Z = Float64Array.from(marks, m => m.zTop), K = Math.min(5, n - 1), K2 = Math.min(8, n - 1), dk = new Float64Array(n), nbr = new Array(n);
  for (let i = 0; i < n; i++) {   // de K2 närmaste grannarna (sorterade efter avstånd)
    const best = []; for (let j = 0; j < n; j++) { if (j === i) continue; const d = Math.hypot(X[i] - X[j], Y[i] - Y[j]); if (best.length < K2 || d < best[best.length - 1][0]) { best.push([d, j]); best.sort((a, b) => a[0] - b[0]); if (best.length > K2) best.pop(); } }
    dk[i] = best[K - 1][0]; nbr[i] = best;
  }
  const med = a => { const s = Array.from(a).sort((p, q) => p - q); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
  const thr = Math.max(80, 8 * med(dk)), pdfOut = (x, y) => { try { const [px, py] = modelToPdf(x, y), vp = typeof pdfViewBox === "function" ? pdfViewBox() : null; if (vp) return px < vp[0] - vp[2] * 0.1 || px > vp[2] * 1.1 || py < vp[1] - vp[3] * 0.1 || py > vp[3] * 1.1; } catch (e) { /* ingen kalibrering */ } return false; };
  const far = new Set(); for (let i = 0; i < n; i++) if (dk[i] > thr || (Math.abs(X[i]) < 1e-6 && Math.abs(Y[i]) < 1e-6) || pdfOut(X[i], Y[i])) far.add(i);
  const good = []; for (let i = 0; i < n; i++) if (!far.has(i)) good.push(i);
  for (let i = 0; i < n; i++) {
    const m = marks[i], warns = []; let sx = null, sy = null, sz = null;
    if (far.has(i) && good.length >= 3) {
      const why = Math.abs(X[i]) < 1e-6 && Math.abs(Y[i]) < 1e-6 ? "ligger på 0,0" : pdfOut(X[i], Y[i]) ? "ligger utanför ritningen" : `ligger ${Math.round(dk[i])} m från de närmaste punkterna`;
      const peers = m.it && m.it.area ? good.filter(j => j !== i && marks[j].it && marks[j].it.area === m.it.area) : [];
      if (peers.length >= 2) { sx = med(peers.map(j => X[j])); sy = med(peers.map(j => Y[j])); } else { let bj = good[0], bd = Infinity; good.forEach(j => { const d = Math.hypot(X[i] - X[j], Y[i] - Y[j]); if (d < bd) { bd = d; bj = j; } }); sx = X[bj] + 2; sy = Y[bj]; }
      const near = good.map(j => [Math.hypot(sx - X[j], sy - Y[j]), j]).sort((a, b) => a[0] - b[0]).slice(0, K2); sz = med(near.map(([, j]) => Z[j]));
      warns.push(`Punkten ${why}. Förslag: placera vid ${Math.round(sx * 10) / 10}, ${Math.round(sy * 10) / 10} (höjd ${Math.round(sz * 10) / 10}).`);
    } else if (!m.zManual && nbr[i].length >= 4) {
      const mz = med(nbr[i].map(([, j]) => Z[j]));
      if (Math.abs(Z[i] - mz) > 8) { sz = mz; warns.push(`Höjden ${Math.round(Z[i] * 10) / 10} avviker ${Math.round(Math.abs(Z[i] - mz))} m från grannarna. Förslag: ${Math.round(mz * 10) / 10}.`); }
    }
    if (warns.length) out.set(m.key, { text: warns.join(" "), sx, sy, sz });
  }
  return out;
}

/* ---- Panelen ---- */
const adj = { open: false, mode: "dock", w: 560, el: null, marks: [], warn: new Map(), sel: new Set(), focus: null, sort: { k: "name", dir: 1 }, q: "", filter: "all", sig: "", timer: 0, floatPos: { x: 380, y: 90, w: 820, h: 560 } };
const ADJ_COLS = [
  { k: "sel", t: "", w: 34, nosort: true }, { k: "warn", t: "", w: 30, nosort: false }, { k: "name", t: "Namn", w: 230 }, { k: "src", t: "Källa", w: 118 }, { k: "ph", t: "Status", w: 130 },
  { k: "x", t: "X", w: 104, num: true }, { k: "y", t: "Y", w: 104, num: true }, { k: "za", t: "Auto-höjd", w: 92, num: true }, { k: "z", t: "Plushöjd", w: 104, num: true }, { k: "c", t: "Kommentar", w: 240 },
];
const ADJ_PREF = "lagesplan-adjpanel";
function adjLoadPrefs() { try { const p = JSON.parse(localStorage.getItem(ADJ_PREF) || "{}"); if (p.mode) adj.mode = p.mode; if (p.w) adj.w = p.w; if (p.floatPos) adj.floatPos = { ...adj.floatPos, ...p.floatPos }; if (p.cols) ADJ_COLS.forEach(c => { if (p.cols[c.k]) c.w = p.cols[c.k]; }); } catch (e) { /* standard */ } }
function adjSavePrefs() { try { localStorage.setItem(ADJ_PREF, JSON.stringify({ mode: adj.mode, w: adj.w, floatPos: adj.floatPos, cols: Object.fromEntries(ADJ_COLS.map(c => [c.k, c.w])) })); } catch (e) { /* privat läge */ } }
const adjFmt = v => (Math.round(v * 100) / 100).toLocaleString("sv-SE");
const adjSelf = () => adj.el;
const adjEff = m => ({ name: (m.name || m.it.object_name || m.it.activity || "").toLowerCase(), src: m.src, ph: (PHASE_LABELS[m.ph] || m.ph), x: m.x, y: m.y, za: m.zAuto, z: m.zTop, c: ((exportAdjAll()[m.key] || {}).comment || ""), warn: adj.warn.has(m.key) ? 0 : 1 });
function adjRows() {
  const A = exportAdjAll(), q = adj.q;
  let list = adj.marks.filter(m => {
    if (adj.filter === "adj" && !A[m.key]) return false; if (adj.filter === "warn" && !adj.warn.has(m.key)) return false; if (!q) return true;
    return `${m.name || ""} ${m.it.activity || ""} ${m.it.object_name || ""} ${PHASE_LABELS[m.ph] || m.ph} ${m.src}`.toLowerCase().includes(q);
  });
  const k = adj.sort.k, d = adj.sort.dir, key = k === "warn" ? "warn" : k === "sel" ? "name" : k;
  list = list.map(m => ({ m, e: adjEff(m) })).sort((a, b) => { const p = a.e[key], r = b.e[key]; const c = typeof p === "number" ? p - r : String(p).localeCompare(String(r), "sv", { numeric: true }); return (c || String(a.e.name).localeCompare(String(b.e.name), "sv")) * d; });
  return list.map(x => x.m);
}
function adjBuild() {
  const el = document.createElement("div"); el.id = "adjPanel"; adj.el = el;
  el.innerHTML = `<div class="adj-h"><div class="adj-title"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg><b>Justera exportpunkter</b><span class="adj-count" id="adjCount"></span></div>
      <div class="adj-hb"><button type="button" class="adj-ib" id="adjMode" title="Docka till vänster / flyt fritt"></button><button type="button" class="adj-ib" id="adjClose" title="Stäng">✕</button></div></div>
    <div id="adjWarn" class="adj-warn" hidden></div>
    <div class="adj-bar"><div class="adj-search"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/></svg><input type="search" id="adjQ" placeholder="Sök namn, aktivitet, status…" autocomplete="off"></div>
      <div class="adj-seg" id="adjFilter"><button type="button" data-f="all" class="on">Alla</button><button type="button" data-f="adj">Justerade</button><button type="button" data-f="warn">Varningar</button></div></div>
    <div class="adj-bulk"><b id="adjSel">0 markerade</b><button type="button" class="adj-lk" id="adjAll">Markera alla som visas</button><button type="button" class="adj-lk" id="adjNone">Avmarkera</button><span class="adj-sp"></span>
      <label class="adj-f">Höjd <input type="number" id="adjZ" step="0.1" placeholder="m"><button type="button" id="adjZSet">Sätt</button></label>
      <label class="adj-f">± <input type="number" id="adjDz" step="0.1" placeholder="m"><button type="button" id="adjDzSet">Tillämpa</button></label>
      <label class="adj-f adj-fc">Kommentar <input type="text" id="adjC" placeholder="Text"><button type="button" id="adjCSet">Sätt</button></label><button type="button" class="adj-lk danger" id="adjReset" title="Tillbaka till automatisk höjd och ingen kommentar">Återställ markerade</button></div>
    <div class="adj-tw" id="adjTW"><table id="adjT"></table></div>
    <div class="adj-ft">Dra en punkt på kartan för att flytta den – X/Y uppdateras här. Tryck på ett namn för att visa punkten. Allt sparas i projektet.</div>`;
  return el;
}
function adjPlace() {
  const el = adj.el, docked = adj.mode === "dock" && typeof rdockAdd === "function" && rdockAllowed();
  el.classList.toggle("adj-dock", docked); el.classList.toggle("adj-float", !docked);
  if (docked) { el.style.cssText = ""; rdockAdd(el, 2); }   // dockad till höger (lagesplan-rdock.js), samma ram som egenskapsrutan
  else { if (typeof rdockRemove === "function" && el.classList.contains("rd-docked")) rdockRemove(el, document.body); if (el.parentNode !== document.body) document.body.appendChild(el); const f = adj.floatPos; el.style.cssText = `left:${f.x}px;top:${f.y}px;width:${f.w}px;height:${f.h}px`; }
  const mb = el.querySelector("#adjMode"); mb.textContent = docked ? "⧉ Flyt" : "⇥ Docka"; mb.title = docked ? "Flyt panelen fritt över kartan" : "Docka panelen till höger";
  adjResizeView();
}
function adjResizeView() { window.__keepViewOnResize = true; try { window.dispatchEvent(new Event("resize")); } finally { window.__keepViewOnResize = false; } if (typeof scheduleOrthoRender === "function") scheduleOrthoRender(); }
function adjRender() {
  const el = adj.el; if (!el) return; const $$ = s => el.querySelector(s), A = exportAdjAll(), list = adjRows(), shown = list.slice(0, 400), nAdj = adj.marks.filter(m => A[m.key]).length, esc = escHtml;
  $$("#adjCount").textContent = `${adj.marks.length} punkter · ${nAdj} justerade`; $$("#adjSel").textContent = `${adj.sel.size} markerade`;
  const nw = adj.warn.size, wb = $$("#adjWarn"); wb.hidden = !nw; if (nw) wb.innerHTML = `<span class="adj-wi">⚠</span><span><b>${nw} ${nw === 1 ? "punkt ligger" : "punkter ligger"} konstigt</b> – långt från de andra, utanför ritningen eller med en avvikande höjd.</span><button type="button" id="adjShowW">Visa</button><button type="button" id="adjAllSug">Använd alla förslag</button>`;
  $$("#adjFilter").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.f === adj.filter));
  const total = ADJ_COLS.reduce((a, c) => a + c.w, 0);
  $$("#adjT").style.width = total + "px";
  $$("#adjT").innerHTML = `<colgroup>${ADJ_COLS.map(c => `<col style="width:${c.w}px">`).join("")}</colgroup><thead><tr>${ADJ_COLS.map(c => `<th data-k="${c.k}" class="${c.num ? "n" : ""} ${adj.sort.k === c.k ? "sorted" : ""}">${c.k === "warn" ? "⚠" : esc(c.t)}${adj.sort.k === c.k ? `<i>${adj.sort.dir > 0 ? "▲" : "▼"}</i>` : ""}<span class="adj-cr" data-r="${c.k}"></span></th>`).join("")}</tr></thead><tbody>${shown.map(m => {
    const a = A[m.key] || {}, w = adj.warn.get(m.key), isSel = adj.sel.has(m.key), isFocus = adj.focus === m.key, col = m.color || phaseColor(m.ph);
    return `<tr data-key="${esc(m.key)}" class="${isSel ? "sel" : ""} ${isFocus ? "focus" : ""} ${w ? "warn" : ""} ${Object.keys(a).length ? "edited" : ""}"><td><input type="checkbox" data-k="${esc(m.key)}" ${isSel ? "checked" : ""}></td>
      <td class="wc">${w ? `<span class="adj-wtip" title="${esc(w.text)}">⚠</span>` : ""}</td><td class="nm" data-nm="${esc(m.key)}" title="Visa i kartan">${esc(m.name || m.it.object_name || m.it.activity || "–")}</td><td class="mu">${esc(m.src)}</td>
      <td><span class="adj-st"><i style="background:${col}"></i>${esc(PHASE_LABELS[m.ph] || m.ph)}</span></td><td class="n ${m.xyManual ? "man" : ""}">${adjFmt(m.x)}</td><td class="n ${m.xyManual ? "man" : ""}">${adjFmt(m.y)}</td><td class="n mu">${adjFmt(m.zAuto)}</td>
      <td class="n"><input type="number" step="0.1" class="adj-in n" data-z="${esc(m.key)}" value="${Number.isFinite(a.z) ? a.z : ""}" placeholder="auto"></td><td><input type="text" class="adj-in" data-c="${esc(m.key)}" value="${esc(a.comment || "")}" placeholder="Lägg till kommentar"></td></tr>
      ${w && isFocus ? `<tr class="adj-sugr"><td colspan="${ADJ_COLS.length}"><span>${esc(w.text)}</span><button type="button" data-sug="${esc(m.key)}">Använd förslag</button></td></tr>` : ""}`;
  }).join("")}${list.length > shown.length ? `<tr><td colspan="${ADJ_COLS.length}" class="adj-more">Visar de första ${shown.length} av ${list.length} – sök eller filtrera för att hitta fler (”Markera alla som visas” gäller alla ${list.length}).</td></tr>` : ""}</tbody>`;
  adjBindTable(); adjRings();
}
function adjBindTable() {
  const el = adj.el, $$ = s => el.querySelector(s), T = $$("#adjT");
  T.querySelectorAll("th").forEach(th => { th.onclick = e => { if (e.target.classList.contains("adj-cr")) return; const k = th.dataset.k; if (k === "sel") return; if (adj.sort.k === k) adj.sort.dir *= -1; else adj.sort = { k, dir: 1 }; adjRender(); }; });
  T.querySelectorAll(".adj-cr").forEach(h => { h.onpointerdown = e => { e.stopPropagation(); e.preventDefault(); const c = ADJ_COLS.find(x => x.k === h.dataset.r), x0 = e.clientX, w0 = c.w; h.setPointerCapture(e.pointerId); h.classList.add("drag");
    const mv = ev => { c.w = Math.max(44, Math.round(w0 + ev.clientX - x0)); T.querySelector(`col:nth-child(${ADJ_COLS.indexOf(c) + 1})`).style.width = c.w + "px"; T.style.width = ADJ_COLS.reduce((a, q) => a + q.w, 0) + "px"; }, up = () => { h.classList.remove("drag"); h.removeEventListener("pointermove", mv); h.removeEventListener("pointerup", up); adjSavePrefs(); };
    h.addEventListener("pointermove", mv); h.addEventListener("pointerup", up); }; h.onclick = e => e.stopPropagation(); h.ondblclick = e => { e.stopPropagation(); const c = ADJ_COLS.find(x => x.k === h.dataset.r); c.w = { name: 230, c: 240 }[c.k] || 110; adjSavePrefs(); adjRender(); }; });
  T.querySelectorAll("[data-k]").forEach(c => { if (c.tagName !== "INPUT") return; c.onchange = () => { if (c.checked) adj.sel.add(c.dataset.k); else adj.sel.delete(c.dataset.k); adjSelUi(); adjRings(); c.closest("tr").classList.toggle("sel", c.checked); }; });
  T.querySelectorAll("[data-nm]").forEach(td => { td.onclick = e => { adjFocusOn(td.dataset.nm, e.ctrlKey || e.metaKey); }; });
  T.querySelectorAll("[data-z]").forEach(c => { c.onchange = () => { exportAdjSet(c.dataset.z, { z: c.value === "" ? NaN : Number(c.value) }); exportAdjSave(); adjRefresh(true); }; });
  T.querySelectorAll("[data-c]").forEach(c => { c.onchange = () => { exportAdjSet(c.dataset.c, { comment: c.value.trim() }); exportAdjSave(); adjRefresh(true); }; });
  T.querySelectorAll("[data-sug]").forEach(b => { b.onclick = () => { adjApplySuggestion(b.dataset.sug); adjRefresh(true); }; });
  const sw = adj.el.querySelector("#adjShowW"); if (sw) sw.onclick = () => { adj.filter = "warn"; adjRender(); };
  const sa = adj.el.querySelector("#adjAllSug"); if (sa) sa.onclick = () => { [...adj.warn.keys()].forEach(adjApplySuggestion); adjRefresh(true); };
}
const adjSelUi = () => { if (adj.el) adj.el.querySelector("#adjSel").textContent = `${adj.sel.size} markerade`; };
function adjApplySuggestion(key) {
  const w = adj.warn.get(key), m = adj.marks.find(x => x.key === key); if (!w || !m) return;
  if (w.sx != null) {
    if (key.startsWith("xl:")) exportAdjSet(key, { x: Math.round(w.sx * 1000) / 1000, y: Math.round(w.sy * 1000) / 1000 });
    else if (typeof saveObjMarks === "function" && typeof objMarks === "function") saveObjMarks({ ...objMarks(), [key.slice(3)]: [Math.round(w.sx * 1000) / 1000, Math.round(w.sy * 1000) / 1000] });
  }
  if (w.sz != null) exportAdjSet(key, { z: Math.round(w.sz * 100) / 100 });
  exportAdjSave(); if (typeof invalidatePositions === "function") invalidatePositions(); if (typeof renderZones === "function") renderZones();
}
/* Markera ett namn: punkten markeras i tabellen och på kartan, och kartan centreras på den. */
function adjFocusOn(key, add) {
  const m = adj.marks.find(x => x.key === key); if (!m) return;
  if (!add) adj.sel.clear(); adj.sel.add(key); adj.focus = key;
  try { const p = modelToPdf(m.x, m.y); if (typeof centerOnPdf === "function") centerOnPdf(p); } catch (e) { /* utan kalibrering */ }
  adjRender();
}
/* Ringar på kartan runt de markerade punkterna (följer vyn). */
function adjRings() {
  const vp = document.getElementById("viewport"); if (!vp) return; let host = document.getElementById("adjRings");
  if (!adj.open || !adj.sel.size) { if (host) host.remove(); return; }
  if (!host) { host = document.createElement("div"); host.id = "adjRings"; vp.appendChild(host); }
  const keys = [...adj.sel].slice(0, 300); while (host.children.length > keys.length) host.lastChild.remove(); while (host.children.length < keys.length) { const d = document.createElement("div"); d.className = "adj-ring"; host.appendChild(d); }
  keys.forEach((k, i) => { const m = adj.marks.find(x => x.key === k), d = host.children[i]; if (!m) { d.style.display = "none"; return; } try { const s = stageToScreen(toPx(modelToPdf(m.x, m.y))); d.style.display = ""; d.style.left = s[0] + "px"; d.style.top = s[1] + "px"; d.classList.toggle("focus", k === adj.focus); } catch (e) { d.style.display = "none"; } });
}
function adjRefresh(force) {
  if (!adj.open) return;
  const marks = objExportMarkers(), sig = marks.map(m => `${m.key}|${Math.round(m.x * 100)}|${Math.round(m.y * 100)}|${Math.round(m.zTop * 100)}|${m.adj ? m.adj.comment : ""}`).join(";") + "#" + Object.keys(exportAdjAll()).length;
  if (!force && sig === adj.sig) { adjRings(); return; }
  adj.sig = sig; adj.marks = marks; adj.warn = exportAdjAnalyze(marks); [...adj.sel].forEach(k => { if (!marks.some(m => m.key === k)) adj.sel.delete(k); }); adjRender();
}
function adjAfterRender() { if (!adj.open) return; adjRings(); clearTimeout(adj.timer); adj.timer = setTimeout(() => adjRefresh(false), 350); }
function exportAdjOpen() {
  if (!plan) return; if (adj.open) { adjClose(); return; }
  if (!objExportMarkers().length) { alert("Inga punkter syns i vyn att justera (tänd objekten/Excel-planeringen och kontrollera filtret)."); return; }
  adjLoadPrefs(); if (!adj.el) adjBuild(); adj.open = true; adjPlace(); adjBind(); adjRefresh(true);
}
function adjClose() { adj.open = false; if (adj.el) { if (typeof rdockRemove === "function" && adj.el.classList.contains("rd-docked")) rdockRemove(adj.el, document.body); adj.el.remove(); adj.el = null; } const h = document.getElementById("adjRings"); if (h) h.remove(); adjResizeView(); }
function adjBind() {
  const el = adj.el, $$ = s => el.querySelector(s); if (el._bound) return; el._bound = true;
  $$("#adjClose").onclick = adjClose; $$("#adjMode").onclick = () => { adj.mode = adj.mode === "dock" ? "float" : "dock"; adjSavePrefs(); adjPlace(); adjRender(); };
  $$("#adjQ").oninput = e => { adj.q = e.target.value.trim().toLowerCase(); adjRender(); };
  $$("#adjFilter").onclick = e => { const b = e.target.closest("button[data-f]"); if (!b) return; adj.filter = b.dataset.f; adjRender(); };
  $$("#adjAll").onclick = () => { adjRows().forEach(m => adj.sel.add(m.key)); adjRender(); }; $$("#adjNone").onclick = () => { adj.sel.clear(); adj.focus = null; adjRender(); };
  const tg = () => adj.marks.filter(m => adj.sel.has(m.key)), done = () => { exportAdjSave(); adjRefresh(true); };
  $$("#adjZSet").onclick = () => { const v = Number($$("#adjZ").value); if ($$("#adjZ").value === "" || !Number.isFinite(v)) { alert("Skriv en höjd i meter."); return; } tg().forEach(m => exportAdjSet(m.key, { z: v })); done(); };
  $$("#adjDzSet").onclick = () => { const d = Number($$("#adjDz").value); if ($$("#adjDz").value === "" || !Number.isFinite(d)) { alert("Skriv hur mycket (± m)."); return; } tg().forEach(m => { const a = exportAdjAll()[m.key]; exportAdjSet(m.key, { z: (a && Number.isFinite(a.z) ? a.z : m.zAuto) + d }); }); done(); };
  $$("#adjCSet").onclick = () => { const c = $$("#adjC").value.trim(); tg().forEach(m => exportAdjSet(m.key, { comment: c })); done(); };
  $$("#adjReset").onclick = () => { const A = exportAdjAll(); tg().forEach(m => { delete A[m.key]; }); done(); };
  // Dockbredd (dra i högerkanten) och flytande fönster (dra i rubriken)
  const rs = $$("#adjDockRs"); if (rs) rs.onpointerdown = e => { e.preventDefault(); rs.setPointerCapture(e.pointerId); const x0 = e.clientX, w0 = el.getBoundingClientRect().width; document.body.classList.add("resizing");
    const mv = ev => { adj.w = Math.max(380, Math.min(window.innerWidth - ((document.querySelector("aside") || { offsetWidth: 0 }).offsetWidth) - 340, Math.round(w0 + ev.clientX - x0))); el.style.flexBasis = adj.w + "px"; el.style.width = adj.w + "px"; }, up = () => { rs.removeEventListener("pointermove", mv); rs.removeEventListener("pointerup", up); document.body.classList.remove("resizing"); adjSavePrefs(); adjResizeView(); }; rs.addEventListener("pointermove", mv); rs.addEventListener("pointerup", up); };
  const hd = $$(".adj-h"); hd.onpointerdown = e => { if (adj.mode !== "float" || e.target.closest("button")) return; const x0 = e.clientX - el.offsetLeft, y0 = e.clientY - el.offsetTop; hd.setPointerCapture(e.pointerId);
    const mv = ev => { adj.floatPos.x = Math.max(0, Math.min(window.innerWidth - 120, ev.clientX - x0)); adj.floatPos.y = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - y0)); el.style.left = adj.floatPos.x + "px"; el.style.top = adj.floatPos.y + "px"; }, up = () => { hd.removeEventListener("pointermove", mv); hd.removeEventListener("pointerup", up); adjSavePrefs(); }; hd.addEventListener("pointermove", mv); hd.addEventListener("pointerup", up); };
  new ResizeObserver(() => { if (adj.mode === "float" && adj.open) { adj.floatPos.w = el.offsetWidth; adj.floatPos.h = el.offsetHeight; adjSavePrefs(); } }).observe(el);
}

/* ---- Dra Excel-prickarna på kartan (Powerproject-prickarna dras redan av lagesplan-objmarks.js) ---- */
let adjXlsDrag = null;
document.addEventListener("DOMContentLoaded", () => {
  const b = document.getElementById("btnObjAdj"); if (b) b.onclick = exportAdjOpen;
  if (typeof renderZones === "function") { const rz = renderZones; renderZones = function () { const r = rz.apply(this, arguments); adjAfterRender(); return r; }; }
  if (typeof objMarkPointerDown === "function") {
    const omd = objMarkPointerDown;
    objMarkPointerDown = function (e) {
      if (adj.open && e.button === 0 && plan && plan.calib && typeof xlsAt === "function" && typeof xlsActive === "function" && xlsActive()) {
        const pdf = toPdf(stagePoint(e)), hit = xlsAt(pdf)[0];
        if (hit) { e.preventDefault(); adjXlsDrag = { key: "xl:" + hit.it.id, o: hit, sx: e.clientX, sy: e.clientY, moved: false, start: stagePoint(e), c0: toPx(hit.pt) }; return true; }
      }
      return omd.apply(this, arguments);
    };
  }
  window.addEventListener("mousemove", e => {
    const d = adjXlsDrag; if (!d) return; if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return; d.moved = true;
    const p = stagePoint(e); d.pdf = toPdf([d.c0[0] + p[0] - d.start[0], d.c0[1] + p[1] - d.start[1]]); d.o.pt = d.pdf; if (typeof renderZonesSoon === "function") renderZonesSoon();
  });
  window.addEventListener("mouseup", () => {
    const d = adjXlsDrag; if (!d) return; adjXlsDrag = null;
    if (!d.moved) { adjFocusOn(d.key, false); return; }
    const m = pdfToModel(d.pdf); exportAdjSet(d.key, { x: Math.round(m[0] * 1000) / 1000, y: Math.round(m[1] * 1000) / 1000 }); exportAdjSave(); if (xls) xls.posPdf = null;
    if (typeof renderZones === "function") renderZones(); adjRefresh(true); if (typeof setSaveStatus === "function") setSaveStatus("📍 Excel-pricken är flyttad – X/Y uppdaterade i exporten.");
  });
});
