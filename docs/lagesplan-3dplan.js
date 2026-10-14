/* 3D-vyn – fliken 4D-planering (Victor 2026-10-12: "Lägg en menyknapp bredvid 3D-bibliotek. '4D-planering', där ska
   vi plocka in pp-tidplanen och den snygga Gantten med lapp-planeringen" och "Fixa ett sätt att skapa en film i
   3d-editorn").

   – Powerproject-tidplanen (projects/<id>/pp/plan_items.json) – bara läsning, inget i planeringen ändras.
   – En panel nederst i 3D-vyn med samma tavla som 4D-dashboarden: aktiviteterna som post-it-lappar per vecka,
     en bana per område, lappens färg efter entreprenör/område/aktivitet och statusfärgen i kanten. Eller staplar.
     Tryck på en lapp: aktivitetens objekt markeras i 3D. Tryck på en vecka: datumet flyttas dit (3D följer med).
   – Film: välj intervall, längd och upplösning. Kameravyer kan läggas på datum ("1 nov: vyn Fundament") –
     kameran glider mellan dem medan datumet räknas fram och 3D-objekten visas i sin status. Filmen sparas som en
     videofil på datorn (inget laddas upp). */

const l3pl = { rows: null, loading: null, err: "", dock: false, rec: null };
const L3PL_SOFT = ["#3b82f6", "#f97316", "#22c55e", "#a855f7", "#e11d48", "#0ea5e9", "#eab308", "#14b8a6", "#6366f1", "#84cc16", "#f43f5e", "#64748b"];
const l3plPrefs = () => { const p = l3Prefs().plan; return p && typeof p === "object" ? p : {}; };
const l3plSet = (k, v) => l3SetPref("plan", { ...l3plPrefs(), [k]: v });

/* ---- Tidplanen ------------------------------------------------------------------------------------ */
function l3plLoad(force) {
  if (l3pl.rows && !force) return Promise.resolve(l3pl.rows);
  if (l3pl.loading) return l3pl.loading;
  l3pl.loading = ghReadJSON(token, `projects/${encodeURIComponent(projectId)}/pp/plan_items.json`, force ? { fresh: true } : undefined)
    .then(a => { l3pl.rows = Array.isArray(a) ? a : []; l3pl.err = ""; })
    .catch(e => { l3pl.rows = []; l3pl.err = e.message; })
    .then(() => { l3pl.loading = null; l3plRender(); return l3pl.rows; });
  return l3pl.loading;
}
/* Filmens planering (Victor 2026-10-12: "välja om den ska koppla till PP-planeringen eller excel-planeringen eller
   båda samtidigt"): "pp", "excel" eller "both". Excel-planeringen läses ur projektets plan_items.json (den som redan
   är inläst om lägesplanen öppnades med Excel). */
const l3plFilmSrc = () => ((l3plPrefs().film || {}).src) || "pp";
function l3plLoadX() {
  if (l3pl.xrows) return Promise.resolve(l3pl.xrows);
  if (typeof planSource !== "undefined" && planSource !== "pp" && Array.isArray(items) && items.length) { l3pl.xrows = items; return Promise.resolve(items); }
  if (l3pl.xloading) return l3pl.xloading;
  l3pl.xloading = ghReadJSON(token, `projects/${encodeURIComponent(projectId)}/plan_items.json`).then(a => (l3pl.xrows = Array.isArray(a) ? a : [])).catch(() => (l3pl.xrows = [])).finally(() => { l3pl.xloading = null; });
  return l3pl.xloading;
}
/* Aktiviteterna för filmen (pärlbandet, tidslinjen, grafiken) efter valet ovan. Excel-aktiviteterna får "Excel · "
   framför området när båda visas, så att de går att skilja åt. */
function l3plFilmActs() {
  const src = l3plFilmSrc(), out = [];
  if (src !== "excel") out.push(...l3plActs(false));
  if (src !== "pp") out.push(...l3plActs(false, l3pl.xrows || [], "x").map(a => (src === "both" ? { ...a, area: `Excel · ${a.area}` } : a)));
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name, "sv", { numeric: true }));
}
/* 4D-koppling (listan i vänstermenyn): Powerproject, Excel eller båda (Victor 2026-10-12). */
/* 3D-färgernas planering när lägesplanen körs med Powerproject (med Excel vald är planeringen redan Excel). */
const l3plColorSrc = () => (typeof planSource !== "undefined" && planSource !== "pp" ? "pp" : l3plPrefs().colorSrc || "both");
const l3plLinkSrc = () => l3plPrefs().linkSrc || "pp";
function l3plLinkActs(split) {
  const src = l3plLinkSrc(), out = [];
  if (src !== "excel") out.push(...l3plActs(split));
  if (src !== "pp") out.push(...l3plActs(split, l3pl.xrows || [], "x").map(a => (src === "both" ? { ...a, area: `Excel · ${a.area}` } : a)));
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name, "sv", { numeric: true }));
}
/* En lapp per aktivitet (alla objekt i samma grupp blir en lapp, som på dashboardens tavla), eller en per objekt. */
/* Riktig 3D-koppling: Excel-importens nya rader har en syntetisk object_id ("excel-…", "manuell-…") tills de kopplas. */
function l3plRealObj(r) { const o = String((r && r.object_id) || ""); return !!o && !/^(excel|manuell)-/.test(o); }
function l3plActs(split = false, rowsIn = null, pre = "") {
  const map = new Map();
  (rowsIn || l3pl.rows || []).forEach(r => {
    if (!r.start_date || !r.end_date) return;
    const k = pre + (split ? "i:" + r.id : r.group_id ? "g:" + r.group_id : r.source_key ? "s:" + r.source_key : "i:" + r.id);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  });
  return [...map].map(([key, rows]) => {
    const r = rows[0], s = rows.map(x => x.start_date.slice(0, 10)).sort()[0], e = rows.map(x => x.end_date.slice(0, 10)).sort().pop();
    const name = String(r.activity || r.object_name || "Aktivitet").trim();
    const objs = [...new Set(rows.map(x => String(x.object_name || "").trim()).filter(n => n && n !== name))];
    const bs = rows.map(x => x.baseline_start_date).filter(Boolean).sort(), be = rows.map(x => x.baseline_end_date).filter(Boolean).sort();
    return { key, rows, name, objs, area: String(r.area || "").trim() || "(utan område)", contractor: String(r.contractor || "").trim(), start: s, end: e,
      progress: Math.round(rows.reduce((a, x) => a + (Number(x.progress) || 0), 0) / rows.length), temporary: rows.some(x => x.temporary === true),
      deps: [...new Set(rows.flatMap(x => (Array.isArray(x.depends_on) ? x.depends_on : []).map(String)))].filter(id => !rows.some(x => String(x.id) === id)),
      bl: bs.length && be.length ? [bs[0].slice(0, 10), be[be.length - 1].slice(0, 10)] : null, coupled: rows.some(l3plRealObj) }; // kopplad = har objektets GUID (Excel-raderna har ofta inget model_id)
  }).sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name, "sv", { numeric: true }));
}
const l3plDay = () => $("dateInput").value || todayIso();
function l3plColor(kind, key, keys) {
  const i = keys.indexOf(key), hex = L3PL_SOFT[(i < 0 ? 0 : i) % L3PL_SOFT.length];
  const n = parseInt(hex.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255];
  const mix = (t, w) => "#" + c.map(v => Math.round(v + (t - v) * w).toString(16).padStart(2, "0")).join("");
  return { bg: mix(255, 0.78), bd: mix(255, 0.25), ink: mix(0, 0.55) };
}
const l3plIso = d => d.toISOString().slice(0, 10);
const l3plDate = s => new Date(s + "T00:00:00Z");
const l3plMonday = s => { const d = l3plDate(s); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d; };
function l3plWeekNo(d) { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7)); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 86400000 + 1) / 7); }
const L3PL_MON = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const l3plShort = d => `${d.getUTCDate()} ${L3PL_MON[d.getUTCMonth()]}`;

/* ---- Fliken (vänstermenyn) ------------------------------------------------------------------------ */
function l3plRenderTab() {
  const host = document.getElementById("v3PalPlan");
  if (!host || host.classList.contains("hidden")) return;
  if (!l3pl.rows) { host.innerHTML = `<div class="v3-pal-hint"><span class="pm-spin"></span> Hämtar Powerproject-tidplanen…</div>`; l3plLoad(); return; }
  const acts = l3plActs(), day = l3plDay(), esc = escHtml, P = l3plPrefs();
  const now = acts.filter(a => a.start <= day && a.end >= day);
  const f = P.film || {}, keys = l3plKeys();
  const range = acts.length ? [acts[0].start, acts.reduce((m, a) => (a.end > m ? a.end : m), acts[0].end)] : [day, day];
  // Som i 4D-dashboarden (Victor 2026-10-14): grå hopfällbara paneler med versalrubrik och ＋/− samt vita kort inuti.
  const open = { film: true, link: false, other: true, ...(P.secOpen || {}) };
  const sec = (id, title, body, extra = "") => `<section class="v3-panel ${open[id] ? "" : "shut"}" data-plsec="${id}"><div class="v3-panel-h"><b>${title}</b>${extra}<button type="button" class="v3-panel-t" data-plsect="${id}" aria-expanded="${!!open[id]}" title="${open[id] ? "Fäll ihop" : "Fäll ut"}">${open[id] ? "−" : "+"}</button></div>${open[id] ? `<div class="v3-panel-b">${body}</div>` : ""}</section>`;
  const card = (title, body, cls = "") => `<section class="v3-card ${cls}"><div class="v3-card-h">${title}</div>${body}</section>`;
  const chip = (id, on, label, tip, sub) => `<label class="v3-chip ${sub ? "sub" : ""}" title="${esc(tip)}"><input type="checkbox" id="${id}" ${on ? "checked" : ""} /><span>${label}</span></label>`;
  const filmBar = `<div class="v3-pl-btns v3-pl-bar"><button type="button" id="v3FlPreview" title="Spela upp i 3D-vyn utan att spela in">▶ Spela upp</button><button type="button" id="v3FlPause" title="Pausa och fortsätta (mellanslag) – grafiken står kvar som i filmen" ${l3pl.rec ? "" : "disabled"}>${l3pl.rec && l3pl.rec.paused ? "▶ Fortsätt" : "⏸ Paus"}</button><button type="button" id="v3FlRec" class="v3-primary" title="Spela in och spara som videofil">⏺ Spela in</button></div>`;
  const filmBody = `
      ${card("Tidsintervall", `<div class="v3-pl-grid">
        <label>Från<input type="date" id="v3FlFrom" value="${esc(f.from || range[0])}" /></label>
        <label>Till<input type="date" id="v3FlTo" value="${esc(f.to || range[1])}" /></label>
        <label>Längd (s)<input type="number" id="v3FlSec" min="3" max="600" value="${esc(String(f.sec || 20))}" /></label>
        <label>Upplösning<select id="v3FlRes">${[["720", "720p"], ["1080", "1080p (Full HD)"], ["1440", "1440p"]].map(([v, t]) => `<option value="${v}" ${String(f.res || "1080") === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="wide" title="Vilken planering filmen följer: aktiviteterna i pärlbandet, Pågår nu, förloppet och glöden">Planering<select id="v3FlSrc">${[["pp", "Powerproject"], ["excel", "Excel (4-veckors)"], ["both", "Båda"]].map(([v, t]) => `<option value="${v}" ${l3plFilmSrc() === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      </div>`)}
      ${card("Grafik i filmen", `<div class="v3-chips">
      ${chip("v3FlTitleOn", f.title !== false, "Datumskylt", "Vecka (rullar vid veckobyte) och datum uppe till vänster")}
      ${chip("v3FlFxNow", f.fxNow !== false, "Pågår nu", "Kort nere till höger med aktiviteterna som pågår och deras förlopp – nya glider in, klara bockas av")}
      ${chip("v3FlFxGlow", f.fxGlow !== false, "Glöd", "Objekten som hör till pågående aktiviteter pulserar svagt i statusfärgen")}
      ${chip("v3FlFxMiles", f.fxMiles !== false, "Milstolpar", "En rubrik mitt i bilden när filmen passerar en milstolpe (milstolparna i dashboarden)")}
      ${chip("v3FlFxMeter", f.fxMeter !== false, "Förlopp", "Hur stor del av projektet som är klart och läget mot baslinjen, uppe till höger")}
      ${chip("v3FlFxBl", f.fxBl === true, "± dagar mot baslinje", "Under förloppsmätaren: hur många dagar planen ligger före eller efter baslinjen", true)}
      ${chip("v3FlPearls", f.pearls !== false, "Tidslinje", "Tidslinje med dagar, veckor och månader")}
      ${chip("v3FlFxEtab", f.fxEtab !== false, "Etablering", "Etableringen tonas in och glider på plats när den etableras och tonas ut när den avvecklas")}
      ${chip("v3FlFxCrane", f.fxCrane !== false, "Kranar arbetar", "Tornkranens bom svänger medan aktiviteter pågår inom kranens räckvidd", true)}
      ${chip("v3FlFxSigns", f.fxSigns !== false, "Etableringsskyltar", "Skylt till vänster: \"Tornkran 1 etableras\", \"Bodar avvecklas\"", true)}
      ${chip("v3FlFxBub", f.fxBubbles === true, "Bubblor", "Info-bubblor vid de aktiva aktiviteternas objekt (namn, datum, framdrift) – samma som i 3D-vyn, med framdrift som räknas fram efter datum")}
      ${chip("v3FlFxLegend", f.fxLegend === true, "Statusförklaring", "Vad färgerna betyder (Klar, Pågår, Försenad, Ej startad) – nere till vänster")}
      </div>`)}
      ${l3plAnimHtml(f)}
      ${card("Kameravyer", `<button type="button" class="v3-wide ${l3fsOn() ? "on" : ""}" id="v3FlStrip" title="Tidslinje längst ner i 3D-fönstret med datum, aktiviteterna som ett pärlband och kameravyerna">${l3fsOn() ? "Dölj filmens tidslinje" : "🎬 Visa filmens tidslinje"}</button>
      <div class="v3-pal-hint">${keys.length ? `<b>${keys.length}</b> ${keys.length === 1 ? "kameravy" : "kameravyer"} (🎥). ` : ""}Dra på tidslinjen till ett datum, ställ in kameran och tryck <b>＋ Vy här</b>. Dra en 🎥 för att flytta den, högerklicka för att ta bort.</div>
      ${l3SavedViews().length ? `<select id="v3FlKeyView" class="v3-wide"><option value="">＋ Lägg en sparad vy på tidslinjen…</option>${l3SavedViews().map((v, i) => `<option value="${i}">${esc(v.name)}</option>`).join("")}</select>` : ""}`)}
      ${card("Spara", `<div class="v3-pl-saved"><select id="v3FlSaved" title="Sparade filmer: intervall, grafik, kameravyer och objektens animering"><option value="">${l3plFilms().length ? "Sparade filmer…" : "Inga sparade filmer"}</option>${l3plFilms().map(x => `<option value="${esc(x.name)}" ${l3pl.filmSel === x.name ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select><button type="button" id="v3FlSaveAs" title="Spara filmen som den ser ut nu (kameravyer och objektens animering ingår)">Spara…</button>${l3pl.filmSel ? `<button type="button" id="v3FlSavedDel" title="Ta bort den sparade filmen">✕</button>` : ""}</div>
      <input type="text" id="v3FlTitle" placeholder="Rubrik i filmen (valfri)" value="${esc(f.caption || "")}" />`)}
      <div class="v3-pal-hint" id="v3FlMsg">${typeof MediaRecorder === "undefined" ? "Webbläsaren kan inte spela in video." : ""}</div>
      ${filmBar}`;
  if (open.link && l3plLinkSrc() !== "pp" && !l3pl.xrows) { l3plLoadX().then(() => l3plRenderTab()); }
  const linkActs = open.link ? l3plLinkActs(l3gaP().split) : [];
  const linkSel = `<select id="v3PlLinkSrc" class="v3-pl-srcsel" title="Vilken planering listan visar">${[["pp", "Powerproject"], ["excel", "Excel"], ["both", "Båda"]].map(([v, t]) => `<option value="${v}" ${l3plLinkSrc() === v ? "selected" : ""}>${t}</option>`).join("")}</select>`;
  const linkBody = open.link ? `<div class="v3-pl-linkh"><span>Planering</span>${linkSel}</div><div id="v3PlLinkHost">${typeof l3gaListHtml === "function" ? l3gaListHtml(linkActs, l3gaP(), linkActs, true) : ""}</div>` : "";
  // Filtren överst i vänstermenyn, alltid synliga (sticky) – gäller listan 4D-koppling.
  const fAll = l3plLinkActs(l3gaP().split);
  const filterBar = typeof l3gaListHtml === "function" ? `<div class="v3-pl-fbar" id="v3PlFBar">${l3gaListHtml(fAll, l3gaP(), fAll, "only")}</div>` : "";
  const otherBody = `<div class="v3-card-h">Powerproject-tidplanen</div>
      ${l3pl.err ? `<div class="v3-pal-hint bad">Kunde inte läsa tidplanen: ${esc(l3pl.err)}</div>` : !acts.length ? `<div class="v3-pal-hint">Ingen Powerproject-tidplan i projektet ännu (importeras i 4D-planering).</div>`
        : `<div class="v3-pal-hint">${acts.length} aktiviteter · ${esc(range[0])} – ${esc(range[1])}</div>`}
      ${typeof planSource !== "undefined" && planSource !== "pp" ? `<div class="v3-pal-hint">3D-färgerna följer Excel-planeringen (vald i 4D-planering). Öppna lägesplanen med Powerproject vald för att färga efter den här tidplanen.</div>`
        : `<label class="v3-pl-crow" title="Vilken planering de kopplade IFC-objekten färgas efter. Båda: Powerproject först, Excel där objektet bara är kopplat i Excel-planeringen."><span>3D-färger</span><select id="v3PlColorSrc">${[["both", "Båda"], ["pp", "Powerproject"], ["excel", "Excel"]].map(([v, t]) => `<option value="${v}" ${l3plColorSrc() === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>`}
      <label class="v3-pl-crow" title="En tydlig bubbla vid varje aktivitets objekt med namn, datum, framdrift, område och aktivitet – samma som i 4D-dashboarden."><span>Info-bubblor</span><span class="v3-pl-ctl"><input type="checkbox" id="v3PlBub" ${l3Prefs().bubOn ? "checked" : ""} /> <select id="v3PlBubScope" title="Vilka som får bubbla">${[["auto", "Pågående + markerade"], ["marked", "Bara markerade"], ["active", "Pågående och försenade"], ["all", "Alla"]].map(([v, t]) => `<option value="${v}" ${(l3Prefs().bubScope || "auto") === v ? "selected" : ""}>${t}</option>`).join("")}</select></span></label>
      <label class="v3-pl-crow" title="Framdriften i bubblorna: räknas fram efter datum och aktivitetens längd (som Pågår nu i filmen), eller så som den står i tidplanen."><span>Framdrift</span><select id="v3PlBubProg">${[["calc", "Räknas efter datum"], ["plan", "Från tidplanen"]].map(([v, t]) => `<option value="${v}" ${(l3Prefs().bubProg || "calc") === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label class="v3-pl-crow" title="Det som inte startat visas i kommande-färgen (annars dolt). Gäller 3D-läget Tid – samma val som i tidsraden."><span>Kommande</span><span class="v3-pl-ctl"><input type="checkbox" id="v3PlFuture" ${typeof l3gmCfg === "function" && l3gmCfg().future ? "checked" : ""} /> Visa</span></label>
      <label class="v3-pl-crow" title="Objekt vars aktivitet pågår (eller är försenad) vid valt datum får en tydlig gul kontur – utan att du behöver markera något."><span>Pågående objekt</span><span class="v3-pl-ctl"><input type="checkbox" id="v3PlActive" ${l3Prefs().actOutline ? "checked" : ""} /> Gul kontur</span></label>
      <button type="button" class="v3-wide ${l3pl.dock ? "on" : ""}" id="v3PlDock">${l3pl.dock ? "Dölj tavlan" : "Visa tavlan och Gantten"}</button>
    `;
  host.innerHTML = filterBar + sec("film", "Film", filmBody) + sec("link", "4D-koppling", linkBody) + sec("other", "Övrigt", otherBody, `<button type="button" class="v3-ic" id="v3PlReload" title="Läs om tidplanen">↻</button>`);
  host.querySelectorAll("[data-plsect]").forEach(b => { b.onclick = () => { const id = b.dataset.plsect; l3plSet("secOpen", { ...open, [id]: !open[id] }); l3plRenderTab(); }; });
  const lh = host.querySelector("#v3PlLinkHost"); if (lh && typeof l3gaBind === "function") l3gaBind(lh, () => { l3plRenderTab(); if (l3pl.dock) l3plDockRender(); }, () => l3plLinkActs(l3gaP().split));
  const fb = host.querySelector("#v3PlFBar"); if (fb && typeof l3gaBind === "function") l3gaBind(fb, () => { l3plRenderTab(); if (l3pl.dock) l3plDockRender(); }, () => l3plLinkActs(l3gaP().split));
  const ls = host.querySelector("#v3PlLinkSrc"); if (ls) ls.onchange = () => { l3plSet("linkSrc", ls.value); if (ls.value !== "pp") l3plLoadX().then(() => l3plRenderTab()); else l3plRenderTab(); };
  const on = (id, fn, ev = "onclick") => { const el = host.querySelector("#" + id); if (el) el[ev] = fn; };
  on("v3PlReload", () => { l3pl.rows = null; l3pl.xrows = null; l3plLoad(true); l3plRenderTab(); if (typeof l3bRecolor === "function") l3bRecolor(); });
  on("v3PlDock", () => l3plDockToggle());
  on("v3PlBub", e => { l3SetPref("bubOn", !!e.target.checked); if (typeof l3RenderLabels === "function") l3RenderLabels(); l3Render(); }, "onchange");
  on("v3PlBubScope", e => { l3SetPref("bubScope", e.target.value); if (typeof l3RenderLabels === "function") l3RenderLabels(); l3Render(); }, "onchange");
  on("v3PlBubProg", e => { l3SetPref("bubProg", e.target.value); if (typeof l3RenderLabels === "function") l3RenderLabels(); l3Render(); }, "onchange");
  on("v3PlFuture", e => { l3gmSet("future", e.target.checked); if (typeof l3gmApply === "function") l3gmApply(true); if (typeof l3gmSync === "function") l3gmSync(); }, "onchange");
  on("v3PlActive", e => { l3SetPref("actOutline", !!e.target.checked); if (typeof l3actRebuild === "function") l3actRebuild(); }, "onchange");
  on("v3PlColorSrc", e => { l3plSet("colorSrc", e.target.value); if (typeof l3bRecolor === "function") { l3bRecolor(); if (typeof l3Render === "function") l3Render(); } }, "onchange");
  host.querySelectorAll("[data-plsel]").forEach(b => { b.onclick = () => l3plSelect(b.dataset.plsel); });
  const save = () => { if (!host.querySelector("#v3FlFrom")) return; l3plSet("film", { ...l3plPrefs().film, from: host.querySelector("#v3FlFrom").value, to: host.querySelector("#v3FlTo").value, sec: Number(host.querySelector("#v3FlSec").value) || 20, res: host.querySelector("#v3FlRes").value, src: host.querySelector("#v3FlSrc").value, title: host.querySelector("#v3FlTitleOn").checked, pearls: host.querySelector("#v3FlPearls").checked, fxNow: host.querySelector("#v3FlFxNow").checked, fxGlow: host.querySelector("#v3FlFxGlow").checked, fxMiles: host.querySelector("#v3FlFxMiles").checked, fxMeter: host.querySelector("#v3FlFxMeter").checked, fxBl: host.querySelector("#v3FlFxBl").checked, fxLegend: host.querySelector("#v3FlFxLegend").checked, fxBubbles: host.querySelector("#v3FlFxBub").checked, fxEtab: host.querySelector("#v3FlFxEtab").checked, fxCrane: host.querySelector("#v3FlFxCrane").checked, fxSigns: host.querySelector("#v3FlFxSigns").checked, caption: host.querySelector("#v3FlTitle").value }); if (l3fsOn()) l3fsRender(); };
  on("v3FlSrc", () => { save(); l3plLoadX().then(() => { if (l3fsOn()) l3fsRender(); }); }, "onchange");
  ["v3FlFrom", "v3FlTo", "v3FlSec", "v3FlRes", "v3FlTitleOn", "v3FlPearls", "v3FlTitle", "v3FlFxNow", "v3FlFxGlow", "v3FlFxMiles", "v3FlFxMeter", "v3FlFxBl", "v3FlFxLegend", "v3FlFxBub", "v3FlFxEtab", "v3FlFxCrane", "v3FlFxSigns"].forEach(id => on(id, save, "onchange"));
  l3plAnimBind(host);
  on("v3FlStrip", () => { save(); l3fsToggle(); });
  // En sparad vy läggs där tidslinjens huvud står (annars på datumet i 3D).
  on("v3FlKeyView", e => { const v = l3SavedViews()[+e.target.value]; if (!v) return; const d = l3fs.t !== null && l3fsOn() ? l3plIso(new Date(Math.round(l3fs.t / 86400000) * 86400000)) : day; l3plKeyAdd({ p: v.p, t: v.t }, d, v.name); if (l3fsOn()) l3fsRender(); }, "onchange");
  on("v3FlPreview", () => { save(); l3plFilm(false); }); // under uppspelning: ■ Stoppa (till filmens början)
  on("v3FlPause", () => l3plPause());
  on("v3FlSaved", e => { if (e.target.value) l3plFilmLoad(e.target.value); else { l3pl.filmSel = ""; l3plRenderTab(); } }, "onchange");
  on("v3FlSaveAs", () => l3plFilmSave());
  on("v3FlSavedDel", () => l3plFilmDelete());
  on("v3FlRec", () => { save(); l3plFilm(true); });
}
/* Sparade filmer (Victor 2026-10-12: "spara mina animeringar och filmer som jag kan spara en vy"): ett namn på allt som
   hör till filmen – intervall, grafik, aktivitetsanimering, kameravyer och objektens animering (nycklarna). Sparas
   i webbläsaren per projekt, som de sparade vyerna; objektens egna nycklar ligger dessutom kvar på objekten. */
const l3plFilms = () => (((l3plPrefs().films || {})[l3ViewKey()]) || []).filter(x => x && x.name);
const l3plFilmsSet = list => { const all = { ...(l3plPrefs().films || {}) }; all[l3ViewKey()] = list.slice(0, 40); l3plSet("films", all); };
function l3plFilmSnap(name) {
  const f = { ...(l3plPrefs().film || {}) }; delete f.strip;
  const anim = {}, face = {}; (typeof l3animAll === "function" ? l3animAll() : []).forEach(p => { anim[p.id] = l3animKeys(p).map(k => ({ ...k })); if (p.animFace) face[p.id] = true; });
  return { name, at: new Date().toISOString(), film: JSON.parse(JSON.stringify(f)), keys: l3plKeys().map(k => ({ ...k })), anim, face };
}
async function l3plFilmSave() {
  const list = l3plFilms(), sug = l3pl.filmSel && list.find(x => x.name === l3pl.filmSel) ? l3pl.filmSel : `Film ${list.length + 1}`;
  const name = String((await uiPrompt("Spara filmen (intervall, grafik, kameravyer och objektens animering) som:", sug)) || "").trim().slice(0, 60);
  if (!name) return;
  const i = list.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
  if (i >= 0 && !(await uiConfirm(`Det finns redan en film som heter "${list[i].name}". Ersätta den med den nuvarande?`, { ok: "Ersätt" }))) return;
  const snap = l3plFilmSnap(name);
  if (i >= 0) list[i] = snap; else list.push(snap);
  l3plFilmsSet(list); l3pl.filmSel = name; l3plRenderTab(); l3Status(`Filmen "${name}" sparad.`);
}
async function l3plFilmLoad(name) {
  const snap = l3plFilms().find(x => x.name === name); if (!snap) { l3pl.filmSel = ""; return; }
  if (!(await uiConfirm(`Läsa in filmen "${snap.name}"?\n\nFilmens inställningar, kameravyer och objektens animering ersätts med de sparade. Det som inte är sparat som film försvinner.`, { ok: "Läs in" }))) { l3plRenderTab(); return; }
  const keep = (l3plPrefs().film || {}).strip;
  l3plSet("film", { ...snap.film, strip: keep });
  l3plKeysSet((snap.keys || []).map(k => ({ ...k })));
  if (typeof placements !== "undefined") placements.forEach(p => {
    const ks = (snap.anim || {})[p.id], had = Array.isArray(p.anim) && p.anim.length;
    if (ks && ks.length) { p.anim = ks.map(k => ({ ...k })); if ((snap.face || {})[p.id]) p.animFace = true; else delete p.animFace; } else if (had) { delete p.anim; delete p.animFace; } else return;
    if (typeof placeTouch === "function") placeTouch(p);
  });
  l3pl.filmSel = snap.name;
  if (typeof l3animReset === "function") l3animReset();
  l3plRenderTab(); if (l3fsOn()) l3fsRender();
  l3Status(`Filmen "${snap.name}" inläst.`);
}
async function l3plFilmDelete() {
  const name = l3pl.filmSel; if (!name) return;
  if (!(await uiConfirm(`Ta bort den sparade filmen "${name}"? Kameravyerna och objektens animering som just nu ligger i vyn rörs inte.`, { ok: "Ta bort" }))) return;
  l3plFilmsSet(l3plFilms().filter(x => x.name !== name)); l3pl.filmSel = ""; l3plRenderTab(); l3Status(`Filmen "${name}" borttagen.`);
}
/* Animering (Victor 2026-10-12: "välja på vilka aktiviteter jag vill ha de olika animationerna. Sätt standard till
   som det är nu"): en standard för alla och ett val per aktivitet (namnet), t.ex. Gjutning = Växer upp. */
const L3PL_ANIM = [["color", "Byter färg (som nu)"], ["grow", "Växer upp"], ["fade", "Tonas in"], ["drop", "Lyfts på plats"]];
function l3plAnimHtml(f) {
  const A = f.anim || {}, def = A.def || "color", by = A.by || {}, esc = escHtml, filmActs = l3plFilmActs();
  const names = [...new Set(filmActs.map(a => a.name))].sort((x, y) => x.localeCompare(y, "sv", { numeric: true }));
  const q = (l3pl.animQ || "").trim().toLowerCase(), list = names.filter(n => !q || n.toLowerCase().includes(q));
  const sel = (id, v, withStd) => `<select ${id}>${withStd ? `<option value="">Standard</option>` : ""}${L3PL_ANIM.map(([k, t]) => `<option value="${k}" ${v === k ? "selected" : ""}>${t}</option>`).join("")}</select>`;
  const nSet = Object.keys(by).filter(k => by[k]).length;
  l3pl.animX = l3pl.animX || new Set();
  // Varje område/namn kan fällas ut (▸) till enskilda aktiviteter med egen animering (går före områdets val).
  const acts = n => filmActs.filter(a => a.name === n).sort((x, y) => x.start.localeCompare(y.start));
  const actLabel = a => (a.objs.length ? `${a.objs.slice(0, 2).join(", ")}${a.objs.length > 2 ? " +" + (a.objs.length - 2) : ""}` : a.name) + ` · ${a.start.slice(5)}–${a.end.slice(5)}`;
  const rowFor = n => { const open = l3pl.animX.has(n), ks = acts(n), nOwn = ks.filter(a => by["k:" + a.key]).length;
    return `<div class="v3-pl-agrp"><label class="v3-pl-arow ${by[n] ? "set" : ""}" title="${esc(n)}"><button type="button" class="v3-pl-ax" data-animx="${esc(n)}" aria-expanded="${open}" title="Visa enskilda aktiviteter">${open ? "▾" : "▸"}</button><span>${esc(n)}${nOwn ? ` <em>· ${nOwn} egna</em>` : ""}</span>${sel(`data-anim="${esc(n)}"`, by[n] || "", true)}</label>
      ${open ? ks.map(a => `<div class="v3-pl-arow v3-pl-asub ${by["k:" + a.key] ? "set" : ""}"><span class="v3-pl-asel" data-animsel="${esc(a.key)}" title="${esc(actLabel(a))} – tryck för att markera aktivitetens objekt i modellen" role="button" tabindex="0">${esc(actLabel(a))}</span>${sel(`data-animk="${esc(a.key)}"`, by["k:" + a.key] || "", true)}</div>`).join("") : ""}</div>`; };
  return `<details class="v3-pl-fx v3-pl-anim" ${l3pl.animOpen ? "open" : ""}><summary>Animering${nSet ? ` · ${nSet} egna` : ""}</summary>
    <label class="v3-pl-arow v3-pl-adef" title="Standard för alla aktiviteter"><span>Alla</span>${sel('id="v3FlAnimDef"', def, false)}</label>
    <div class="v3-pal-hint">Välj för ett område (gäller alla dess aktiviteter) eller fäll ut ▸ och välj för enskilda aktiviteter – de går före områdets val. Gäller IFC-objekt som är kopplade.</div>
    ${names.length > 8 ? `<input type="search" id="v3FlAnimQ" class="v3-pp-q" placeholder="Sök område…" value="${esc(l3pl.animQ || "")}" />` : ""}
    <div class="v3-pl-alist">${list.slice(0, 200).map(rowFor).join("") || `<div class="v3-pal-hint">Inga aktiviteter.</div>`}</div>
    ${nSet ? `<button type="button" class="v3-link" id="v3FlAnimClr">Återställ alla till Standard</button>` : ""}
  </details>`;
}
function l3plAnimBind(host) {
  const f = () => l3plPrefs().film || {}, put = A => l3plSet("film", { ...f(), anim: A });
  const d = host.querySelector(".v3-pl-anim"); if (d) d.ontoggle = () => { l3pl.animOpen = d.open; };
  const def = host.querySelector("#v3FlAnimDef"); if (def) def.onchange = () => put({ ...(f().anim || {}), def: def.value });
  host.querySelectorAll("[data-anim]").forEach(s2 => { s2.onchange = () => { const A = f().anim || {}, by = { ...(A.by || {}) }; if (s2.value) by[s2.dataset.anim] = s2.value; else delete by[s2.dataset.anim]; put({ ...A, by }); s2.closest(".v3-pl-arow").classList.toggle("set", !!s2.value); }; });
  host.querySelectorAll("[data-animsel]").forEach(b => { const go = () => { host.querySelectorAll(".v3-pl-asel.on").forEach(x => x.classList.remove("on")); b.classList.add("on"); l3plSelect(b.dataset.animsel); }; b.onclick = go; b.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }; });
  host.querySelectorAll("[data-animk]").forEach(s2 => { s2.onchange = () => { const A = f().anim || {}, by = { ...(A.by || {}) }, k = "k:" + s2.dataset.animk; if (s2.value) by[k] = s2.value; else delete by[k]; put({ ...A, by }); l3plRenderTab(); }; });
  host.querySelectorAll("[data-animx]").forEach(b => { b.onclick = e => { e.preventDefault(); l3pl.animX = l3pl.animX || new Set(); const n = b.dataset.animx; if (l3pl.animX.has(n)) l3pl.animX.delete(n); else l3pl.animX.add(n); l3pl.animOpen = true; l3plRenderTab(); }; });
  const q = host.querySelector("#v3FlAnimQ"); if (q) q.oninput = () => { l3pl.animQ = q.value; const pos = q.selectionStart; l3plRenderTab(); const n = document.getElementById("v3FlAnimQ"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
  const clr = host.querySelector("#v3FlAnimClr"); if (clr) clr.onclick = () => { put({ ...(f().anim || {}), by: {} }); l3plRenderTab(); };
}
function l3plRender() { l3plRenderTab(); if (l3pl.dock) l3plDockRender(); }
function l3plActOf(key, split) {
  return l3plActs(split).find(x => x.key === key) || l3plActs(!split).find(x => x.key === key)
    || (l3pl.xrows ? (l3plActs(split, l3pl.xrows, "x").find(x => x.key === key) || l3plActs(!split, l3pl.xrows, "x").find(x => x.key === key)) : null);
}
function l3plEntsOf(a) {
  const guids = new Set(a.rows.map(r => String(r.object_id || "")).filter(Boolean)), ents = [];
  if (typeof l3pEnts === "function") l3b.models.forEach(m => { const map = l3pEnts(m); guids.forEach(g => (map.get(g) || []).forEach(e => ents.push(e))); });
  return ents;
}
l3pl.multi = new Set(); // Ctrl-markerade aktiviteter i tavlan/Gantten
function l3plMarkMulti() { document.querySelectorAll("[data-plk]").forEach(el => el.classList.toggle("v3-multisel", l3pl.multi.has(el.dataset.plk))); }
function l3plSelect(key, split = false) {
  if (l3pl.multi.size) { l3pl.multi.clear(); l3plMarkMulti(); l3plMultiBar(); }
  const a = l3plActOf(key, split);
  if (!a) return;
  const ents = l3plEntsOf(a);
  if (ents.length) { l3bsSet(ents); if (typeof l3bsZoom === "function") l3bsZoom(); l3Status(`${a.name}: ${ents.length} objekt markerade.`); }
  else l3Status(`${a.name}: objekten finns inte i de inlästa modellerna.`, true);
}
/* Ctrl/Cmd-klick (som i dashboarden): flera aktiviteter markeras samtidigt i 3D och visas tillsammans. */
function l3plSelectMulti(key, split = false) {
  if (l3pl.multi.has(key)) l3pl.multi.delete(key); else l3pl.multi.add(key);
  l3plMarkMulti();
  l3plMultiBar();
  const ents = l3plMultiEnts(split);
  if (!l3pl.multi.size) { l3bsSet([]); l3Status("Markeringen rensad."); return; }
  if (ents.length) { l3bsSet(ents); if (typeof l3bsZoom === "function") l3bsZoom(); l3Status(`${l3pl.multi.size} aktiviteter markerade (${ents.length} objekt) – Ctrl-klicka fler eller klicka utan Ctrl för en.`); }
  else l3Status("Objekten finns inte i de inlästa modellerna.", true);
}
function l3plMultiEnts(split = false) { const ents = []; l3pl.multi.forEach(k => { const a = l3plActOf(k, split); if (a) ents.push(...l3plEntsOf(a)); }); return ents; }
/* Raden "N markerade – Visa i 3D / Bara dessa / ✕" (som i dashboardens Gantt). */
function l3plMultiBar() {
  let bar = document.getElementById("v3MultiBar");
  if (!l3pl.multi.size) { if (bar) bar.remove(); return; }
  if (!bar) {
    bar = document.createElement("div"); bar.id = "v3MultiBar"; bar.className = "v3-multibar";
    bar.innerHTML = `<b id="v3MultiN"></b><button type="button" data-mb="show" title="Markera och zooma i 3D">Visa i 3D</button><button type="button" data-mb="only" title="Släck allt utom de markerade">Bara dessa</button><button type="button" data-mb="clear" title="Rensa (Esc)">✕</button>`;
    (document.getElementById("v3Canvas") || document.body).appendChild(bar);
    ["pointerdown", "click", "dblclick", "contextmenu"].forEach(t => bar.addEventListener(t, e => e.stopPropagation()));
    bar.onclick = e => {
      const b = e.target.closest("[data-mb]"); if (!b) return;
      const sp = typeof l3gaP === "function" ? l3gaP().split : false;
      if (b.dataset.mb === "clear") { l3plMultiClear(); return; }
      const ents = l3plMultiEnts(sp);
      if (!ents.length) { l3Status("De markerade är inte kopplade till modellen.", true); return; }
      l3bsSet(ents);
      if (b.dataset.mb === "only" && typeof l3bsIsolate === "function") l3bsIsolate(); else if (typeof l3bsZoom === "function") l3bsZoom();
    };
  }
  document.getElementById("v3MultiN").textContent = `${l3pl.multi.size} markerade`;
}
function l3plMultiClear() { l3pl.multi.clear(); l3plMarkMulti(); l3plMultiBar(); l3bsSet([]); l3Status("Markeringen rensad."); }
window.addEventListener("keydown", e => { if (e.key === "Escape" && l3pl.multi.size && ![...document.querySelectorAll(".ui-dlg-wrap, .v3-gm-pop")].some(w => !w.classList.contains("out"))) l3plMultiClear(); }, true);

/* Tavlan, Gantten och listan (panelen nederst) finns i lagesplan-3dgantt.js. */

/* ---- Kameran ---------------------------------------------------------------------------------------- */
const l3plKeys = () => (((l3plPrefs().keys || {})[l3ViewKey()]) || []).filter(k => k && k.date && k.p && k.t).sort((a, b) => a.date.localeCompare(b.date));
function l3plKeysSet(list) { const all = { ...(l3plPrefs().keys || {}) }; all[l3ViewKey()] = list.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(0, 40); l3plSet("keys", all); l3plRenderTab(); }
function l3plCam() { const O = l3.O, W = v => [0, 1, 2].map(i => Math.round((v.getComponent(i) + O[i]) * 1000) / 1000); return { p: W(l3.camera.position), t: W(l3.orbit.target) }; }
function l3plKeyAdd(cam, date, name) {
  const list = l3plKeys().filter(k => k.date !== date);
  list.push({ date, name, p: cam.p, t: cam.t });
  l3plKeysSet(list);
  l3Status(`Kameravy på ${date} tillagd i filmen.`);
}
function l3plCamApply(c) {
  const O = l3.O;
  l3.camera.position.set(c.p[0] - O[0], c.p[1] - O[1], c.p[2] - O[2]);
  l3.orbit.target.set(c.t[0] - O[0], c.t[1] - O[1], c.t[2] - O[2]);
  l3.camera.lookAt(l3.orbit.target); l3.camera.updateMatrixWorld();
  if (l3.orbit.update) l3.orbit.update();
}
/* Kameran på ett datum (dagar sedan epok): mjuk övergång mellan vyerna, stilla före första och efter sista. */
function l3plCamAt(keys, t) {
  if (!keys.length) return null;
  const T = keys.map(k => l3plDate(k.date).getTime());
  if (t <= T[0]) return keys[0];
  if (t >= T[T.length - 1]) return keys[keys.length - 1];
  let i = 0; while (i < T.length - 1 && t > T[i + 1]) i++;
  const u = T[i + 1] > T[i] ? (t - T[i]) / (T[i + 1] - T[i]) : 1, s = u * u * (3 - 2 * u);
  const L = (a, b) => a.map((v, j) => v + (b[j] - v) * s);
  return { p: L(keys[i].p, keys[i + 1].p), t: L(keys[i].t, keys[i + 1].t) };
}

/* ---- Filmen ------------------------------------------------------------------------------------------ */
/* Datumet i 3D utan att rita om hela lägesplanen för varje bild (bara 3D-vyns färger och etablering). */
function l3plSetDay(d) {
  if ($("dateInput").value === d && l3.date === d) return;
  $("dateInput").value = d;
  if (d !== l3.date) { l3BuildObjects(); if (typeof l3bRecolor === "function") l3bRecolor(); l3Etab4dAll(); if (typeof l3StorageBuild === "function") l3StorageBuild(); }
}
function l3plMime() {
  if (typeof MediaRecorder === "undefined") return null;
  return ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(t => MediaRecorder.isTypeSupported(t)) || "";
}
async function l3plFilm(record) {
  if (l3pl.rec) { l3pl.rec.stop = true; return; }
  const f = l3plPrefs().film || {}, msg = document.getElementById("v3FlMsg");
  const from = f.from, to = f.to;
  if (!from || !to || to < from) { l3Status("Välj ett intervall (Från före Till) för filmen.", true); return; }
  if (record && l3plMime() === null) { l3Status("Webbläsaren kan inte spela in video.", true); return; }
  const sec = Math.max(3, Math.min(600, Number(f.sec) || 20)), fps = 30, frames = Math.round(sec * fps);
  const t0 = l3plDate(from).getTime(), t1 = l3plDate(to).getTime(), keys = l3plKeys();
  const H = Number(f.res) || 1080, W = Math.round(H * 16 / 9);
  const day0 = $("dateInput").value, cam0 = l3plCam(), R = l3.renderer, pr0 = R.getPixelRatio();
  const st = { stop: false, paused: false, record };
  l3pl.rec = st;
  // Mellanslag ska pausa – inte "klicka" knappen som startade filmen.
  if (document.activeElement && document.activeElement.blur && document.activeElement !== document.body) document.activeElement.blur();
  const setBtn = txt => { const b = document.getElementById(record ? "v3FlRec" : "v3FlPreview"); if (b) b.textContent = txt; };
  setBtn("■ Stoppa"); const fsb = document.getElementById(record ? "v3FsRec" : "v3FsPlay"); if (fsb) fsb.textContent = "■";
  l3plPauseUi();
  let cv = null, ctx = null, rec = null, chunks = [], mime = "";
  if (record) {
    cv = document.createElement("canvas"); cv.width = W; cv.height = H; ctx = cv.getContext("2d");
    mime = l3plMime();
    const stream = cv.captureStream(0), track = stream.getVideoTracks()[0];
    rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: Math.round(W * H * fps * 0.12) });
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(1000); st.mr = rec;
    st.frame = () => { if (track.requestFrame) track.requestFrame(); };
    // Full upplösning: renderaren ritar i filmens storlek medan den spelas in.
    R.setPixelRatio(1); R.setSize(W, H, false);
    const cam = l3.camera; if (cam.isOrthographicCamera) { const h = cam.top - cam.bottom; cam.left = -h * W / H / 2; cam.right = h * W / H / 2; } else cam.aspect = W / H; cam.updateProjectionMatrix();
  }
  const title = f.title !== false, caption = String(f.caption || "").trim();
  // Grafiken (lagesplan-3dfilmfx.js): pågår nu, glöd, datumskylt, milstolpar, förloppsmätare – var och en valbar.
  const fx = typeof l3fxStart === "function" ? await l3fxStart(from, to).catch(() => null) : null;
  let start = performance.now();
  try {
    for (let i = 0; i <= frames && !st.stop; i++) {
      const t = t0 + (t1 - t0) * (i / frames), d = l3plIso(new Date(Math.round(t / 86400000) * 86400000)), ft = i / fps;
      l3plSetDay(d);
      const c = l3plCamAt(keys, t); if (c) l3plCamApply(c);
      if (typeof l3animApply === "function") l3animApply(t);
      if (fx) l3fxFrame(fx, d, ft, t);
      if (record) {
        R.render(l3.scene, l3.camera);
        ctx.drawImage(R.domElement, 0, 0, W, H);
        if (typeof l3fsDrawFrame === "function" && f.pearls !== false) l3fsDrawFrame(ctx, W, H, d);
        if (fx) l3fxDraw(ctx, W, H, d, ft, fx, caption, f.pearls !== false);
        else if (title) l3plOverlay(ctx, W, H, d, caption);
        st.frame();
      } else { l3Render(); if (fx) l3fxHud(fx, d, ft, caption); }
      if (msg) msg.textContent = `${record ? "Spelar in" : "Spelar upp"}: ${d} (${Math.round(i / frames * 100)} %)`;
      if (typeof l3fsPlayhead === "function") { l3fs.t = t; l3fsPlayhead(t); }
      // Takten: bild i vid tiden i / fps (spelar in i realtid).
      const wait = start + (i + 1) * 1000 / fps - performance.now();
      await new Promise(r => setTimeout(r, Math.max(0, wait)));
      // Paus (mellanslag eller ⏸): bilden och grafiken står kvar; tiden räknas om när den fortsätter.
      if (st.paused && !st.stop) {
        if (msg) msg.textContent = `Pausad: ${d} – mellanslag eller ▶ fortsätter.`;
        const p0 = performance.now();
        while (st.paused && !st.stop) await new Promise(r => setTimeout(r, 60));
        start += performance.now() - p0;
      }
    }
  } finally {
    if (fx) l3fxEnd(fx);
    if (record) {
      await new Promise(r => { rec.onstop = r; rec.stop(); });
      R.setPixelRatio(pr0); l3Resize();
    }
    l3pl.rec = null; l3plPauseUi();
    setBtn(record ? "⏺ Spela in" : "▶ Spela upp"); { const b1 = document.getElementById("v3FsPlay"), b2 = document.getElementById("v3FsRec"); if (b1) b1.textContent = "▶"; if (b2) b2.textContent = "⏺"; }
    // Stoppad med ■: tillbaka till filmens början (utan grafik). Annars som innan filmen.
    const back = st.stop && !record ? from : day0;
    $("dateInput").value = back; $("dateInput").dispatchEvent(new Event("change"));
    l3plSetDay(back);
    if (st.stop && !record && keys.length) { const c0 = l3plCamAt(keys, t0); if (c0) l3plCamApply(c0); }
    else if (!keys.length) l3plCamApply(cam0);
    if (typeof l3fsPlayhead === "function" && st.stop && !record) { l3fs.t = t0; l3fsPlayhead(t0, true); }
    l3Render();
  }
  if (record) {
    const ext = /mp4/.test(mime) ? "mp4" : "webm", blob = new Blob(chunks, { type: mime || "video/webm" });
    const name = `4D-film ${from} – ${to}.${ext}`;
    if (!blob.size) { l3Status("Filmen blev tom – försök igen.", true); if (msg) msg.textContent = ""; return null; }
    downloadBlob(blob, name);
    if (msg) msg.textContent = `Sparad: ${name} (${(blob.size / 1e6).toFixed(1).replace(".", ",")} MB)${st.stop ? " – avbruten" : ""}.`;
    l3Status(`Filmen är sparad: ${name}`);
    return { name, size: blob.size, type: blob.type };
  }
  if (msg) msg.textContent = st.stop ? "Avbruten." : "";
  return null;
}
/* Paus/fortsätt under uppspelning eller inspelning (inspelningen pausar också – pausen syns inte i videon). */
function l3plPause(on) {
  const st = l3pl.rec; if (!st) return false;
  st.paused = on === undefined ? !st.paused : !!on;
  if (st.mr) { try { if (st.paused && st.mr.state === "recording") st.mr.pause(); else if (!st.paused && st.mr.state === "paused") st.mr.resume(); } catch (e) { /* äldre webbläsare */ } }
  l3plPauseUi();
  l3Status(st.paused ? "Filmen är pausad – mellanslag fortsätter, ■ stoppar." : "Filmen fortsätter.");
  return true;
}
function l3plPauseUi() {
  const st = l3pl.rec, p = !!(st && st.paused);
  const b = document.getElementById("v3FlPause"); if (b) { b.disabled = !st; b.textContent = p ? "▶ Fortsätt" : "⏸ Paus"; b.classList.toggle("on", p); }
  const f = document.getElementById("v3FsPause"); if (f) { f.disabled = !st; f.textContent = p ? "▶" : "⏸"; f.title = p ? "Fortsätt (mellanslag)" : "Pausa (mellanslag)"; }
}
/* Datum, vecka och rubrik i filmen, och en tidslinje i underkanten. */
function l3plOverlay(ctx, W, H, d, caption) {
  const s = H / 1080, dt = l3plDate(d), f = l3plPrefs().film || {};
  const lbl = `v.${l3plWeekNo(dt)} · ${dt.getUTCDate()} ${L3PL_MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
  ctx.save();
  ctx.font = `700 ${Math.round(44 * s)}px system-ui, -apple-system, Segoe UI, sans-serif`;
  const w = ctx.measureText(lbl).width + 48 * s;
  ctx.fillStyle = "rgba(15,23,42,.72)"; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(32 * s, 32 * s, w, 76 * s, 14 * s) : ctx.rect(32 * s, 32 * s, w, 76 * s); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.fillText(lbl, 56 * s, 70 * s);
  if (caption) { ctx.font = `600 ${Math.round(28 * s)}px system-ui, sans-serif`; ctx.fillStyle = "rgba(15,23,42,.85)"; ctx.fillText(caption, 36 * s, 140 * s); }
  ctx.restore();
}

function l3plInit() {
  l3pl.dock = !!l3plPrefs().dock;
  if (l3pl.dock) l3plDockRender();
  if (l3fsOn()) l3fsRender();
  if (l3Prefs().palTab === "plan") l3plRenderTab();
}
document.addEventListener("DOMContentLoaded", () => {
  // Datumet ändras (uppspelning, reglaget): tavlan följer med.
  const di = $("dateInput"); if (di) di.addEventListener("change", () => { if (l3pl.dock && !l3pl.rec) l3plDockRender(); });
});
