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
const l3plLinkSrc = () => l3plPrefs().linkSrc || "pp";
function l3plLinkActs(split) {
  const src = l3plLinkSrc(), out = [];
  if (src !== "excel") out.push(...l3plActs(split));
  if (src !== "pp") out.push(...l3plActs(split, l3pl.xrows || [], "x").map(a => (src === "both" ? { ...a, area: `Excel · ${a.area}` } : a)));
  return out.sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name, "sv", { numeric: true }));
}
/* En lapp per aktivitet (alla objekt i samma grupp blir en lapp, som på dashboardens tavla), eller en per objekt. */
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
      bl: bs.length && be.length ? [bs[0].slice(0, 10), be[be.length - 1].slice(0, 10)] : null, coupled: rows.some(x => x.model_id && x.object_id) };
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
  // Tre hopfällbara grupper (Victor 2026-10-12): Film överst, 4D-koppling (listan) och Övrigt.
  const open = { film: true, link: true, other: true, ...(P.secOpen || {}) };
  const sec = (id, title, body, extra = "") => `<section class="v3-pl-sec v3-pl-fold ${open[id] ? "" : "shut"}" data-plsec="${id}"><div class="v3-pl-h"><button type="button" class="v3-pl-ft" data-plsect="${id}" aria-expanded="${!!open[id]}"><i>›</i><b>${title}</b></button>${extra}</div>${open[id] ? `<div class="v3-pl-body">${body}</div>` : ""}</section>`;
  const filmBody = `      <div class="v3-pl-grid">
        <label>Från<input type="date" id="v3FlFrom" value="${esc(f.from || range[0])}" /></label>
        <label>Till<input type="date" id="v3FlTo" value="${esc(f.to || range[1])}" /></label>
        <label>Längd (s)<input type="number" id="v3FlSec" min="3" max="600" value="${esc(String(f.sec || 20))}" /></label>
        <label title="Vilken planering filmen följer: aktiviteterna i pärlbandet, Pågår nu, förloppet och glöden">Planering<select id="v3FlSrc">${[["pp", "Powerproject"], ["excel", "Excel (4-veckors)"], ["both", "Båda"]].map(([v, t]) => `<option value="${v}" ${l3plFilmSrc() === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label>Upplösning<select id="v3FlRes">${[["720", "720p"], ["1080", "1080p (Full HD)"], ["1440", "1440p"]].map(([v, t]) => `<option value="${v}" ${String(f.res || "1080") === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      </div>
      <details class="v3-pl-fx" ${P.fxOpen === false ? "" : "open"}><summary>Grafik i filmen</summary>
      <label class="v3-pl-chk" title="Vecka (rullar vid veckobyte) och datum uppe till vänster"><input type="checkbox" id="v3FlTitleOn" ${f.title === false ? "" : "checked"} /> Datumskylt</label>
      <label class="v3-pl-chk" title="Kort nere till höger med aktiviteterna som pågår och deras förlopp – nya glider in, klara bockas av"><input type="checkbox" id="v3FlFxNow" ${f.fxNow === false ? "" : "checked"} /> Pågår nu-ruta</label>
      <label class="v3-pl-chk" title="Objekten som hör till pågående aktiviteter pulserar svagt i statusfärgen"><input type="checkbox" id="v3FlFxGlow" ${f.fxGlow === false ? "" : "checked"} /> Lys upp det som pågår</label>
      <label class="v3-pl-chk" title="En rubrik mitt i bilden när filmen passerar en milstolpe (milstolparna i dashboarden)"><input type="checkbox" id="v3FlFxMiles" ${f.fxMiles === false ? "" : "checked"} /> Milstolpar</label>
      <label class="v3-pl-chk" title="Hur stor del av projektet som är klart och läget mot baslinjen, uppe till höger"><input type="checkbox" id="v3FlFxMeter" ${f.fxMeter === false ? "" : "checked"} /> Förloppsmätare</label>
      <label class="v3-pl-chk v3-pl-sub2" title="Under förloppsmätaren: hur många dagar planen ligger före eller efter baslinjen"><input type="checkbox" id="v3FlFxBl" ${f.fxBl === true ? "checked" : ""} /> … med dagar mot baslinjen</label>
      <label class="v3-pl-chk"><input type="checkbox" id="v3FlPearls" ${f.pearls === false ? "" : "checked"} /> Tidslinje med dagar, veckor och månader</label>
      <label class="v3-pl-chk" title="Etableringen tonas in och glider på plats när den etableras och tonas ut när den avvecklas"><input type="checkbox" id="v3FlFxEtab" ${f.fxEtab === false ? "" : "checked"} /> Etablering i takt med tidplanen</label>
      <label class="v3-pl-chk v3-pl-sub2" title="Tornkranens bom svänger medan aktiviteter pågår inom kranens räckvidd"><input type="checkbox" id="v3FlFxCrane" ${f.fxCrane === false ? "" : "checked"} /> … kranarna arbetar</label>
      <label class="v3-pl-chk v3-pl-sub2" title="Skylt till vänster: \"Tornkran 1 etableras\", \"Bodar avvecklas\""><input type="checkbox" id="v3FlFxSigns" ${f.fxSigns === false ? "" : "checked"} /> … skyltar när något etableras eller avvecklas</label>
      <label class="v3-pl-chk" title="Vad färgerna betyder (Klar, Pågår, Försenad, Ej startad) – nere till vänster"><input type="checkbox" id="v3FlFxLegend" ${f.fxLegend === true ? "checked" : ""} /> Statusförklaring</label>
      </details>
      ${l3plAnimHtml(f)}
      <input type="text" id="v3FlTitle" placeholder="Rubrik i filmen (valfri)" value="${esc(f.caption || "")}" />
      <button type="button" class="v3-wide ${l3fsOn() ? "on" : ""}" id="v3FlStrip" title="Tidslinje längst ner i 3D-fönstret med datum, aktiviteterna som ett pärlband och kameravyerna">${l3fsOn() ? "Dölj filmens tidslinje" : "🎬 Visa filmens tidslinje"}</button>
      <div class="v3-pal-hint">${keys.length ? `${keys.length} ${keys.length === 1 ? "kameravy" : "kameravyer"} (🎥 på tidslinjen). ` : ""}Dra på tidslinjen till ett datum, ställ in kameran och tryck <b>＋ Vy här</b>. Kameran glider mellan vyerna. Dra en 🎥 för att flytta den, högerklicka för att ta bort.</div>
      ${l3SavedViews().length ? `<select id="v3FlKeyView" class="v3-wide"><option value="">＋ Lägg en sparad vy på tidslinjen…</option>${l3SavedViews().map((v, i) => `<option value="${i}">${esc(v.name)}</option>`).join("")}</select>` : ""}
      <div class="v3-pl-btns"><button type="button" id="v3FlPreview" title="Spela upp i 3D-vyn utan att spela in">▶ Spela upp</button><button type="button" id="v3FlPause" title="Pausa och fortsätta (mellanslag) – grafiken står kvar som i filmen" ${l3pl.rec ? "" : "disabled"}>${l3pl.rec && l3pl.rec.paused ? "▶ Fortsätt" : "⏸ Paus"}</button><button type="button" id="v3FlRec" class="v3-primary" title="Spela in och spara som videofil">⏺ Spela in</button></div>
      <div class="v3-pal-hint" id="v3FlMsg">${typeof MediaRecorder === "undefined" ? "Webbläsaren kan inte spela in video." : ""}</div>`;
  if (open.link && l3plLinkSrc() !== "pp" && !l3pl.xrows) { l3plLoadX().then(() => l3plRenderTab()); }
  const linkActs = open.link ? l3plLinkActs(l3gaP().split) : [];
  const linkSel = `<select id="v3PlLinkSrc" class="v3-pl-srcsel" title="Vilken planering listan visar">${[["pp", "Powerproject"], ["excel", "Excel"], ["both", "Båda"]].map(([v, t]) => `<option value="${v}" ${l3plLinkSrc() === v ? "selected" : ""}>${t}</option>`).join("")}</select>`;
  const linkBody = open.link ? `<div id="v3PlLinkHost">${typeof l3gaListHtml === "function" ? l3gaListHtml(linkActs, l3gaP(), linkActs) : ""}</div>` : "";
  const otherBody = `<div class="v3-pl-sub">Powerproject-tidplanen</div>
      ${l3pl.err ? `<div class="v3-pal-hint bad">Kunde inte läsa tidplanen: ${esc(l3pl.err)}</div>` : !acts.length ? `<div class="v3-pal-hint">Ingen Powerproject-tidplan i projektet ännu (importeras i 4D-planering).</div>`
        : `<div class="v3-pal-hint">${acts.length} aktiviteter · ${esc(range[0])} – ${esc(range[1])}</div>`}
      ${typeof planSource !== "undefined" && planSource !== "pp" ? `<div class="v3-pal-hint">3D-färgerna följer Excel-planeringen (vald i 4D-planering). Öppna lägesplanen med Powerproject vald för att färga efter den här tidplanen.</div>` : ""}
      <button type="button" class="v3-wide ${l3pl.dock ? "on" : ""}" id="v3PlDock">${l3pl.dock ? "Dölj tavlan" : "Visa tavlan och Gantten"}</button>
      ${now.length ? `<div class="v3-pl-now"><div class="v3-pl-sub">Pågår ${esc(day)}</div>${now.slice(0, 12).map(a => `<button type="button" class="v3-pl-act" data-plsel="${esc(a.key)}" title="Markera aktivitetens objekt i 3D"><i style="background:${phaseColor(zonePhase(a.rows, day))}"></i><span>${esc(a.objs.length ? `${a.objs.slice(0, 2).join(", ")}${a.objs.length > 2 ? " +" + (a.objs.length - 2) : ""} – ${a.name}` : a.name)}</span></button>`).join("")}${now.length > 12 ? `<div class="v3-pal-hint">… och ${now.length - 12} till</div>` : ""}</div>` : ""}
    `;
  host.innerHTML = sec("film", "🎬 Film", filmBody) + sec("link", "4D-koppling", linkBody, linkSel) + sec("other", "Övrigt", otherBody, `<button type="button" class="v3-ic" id="v3PlReload" title="Läs om tidplanen">↻</button>`);
  host.querySelectorAll("[data-plsect]").forEach(b => { b.onclick = () => { const id = b.dataset.plsect; l3plSet("secOpen", { ...open, [id]: !open[id] }); l3plRenderTab(); }; });
  const lh = host.querySelector("#v3PlLinkHost"); if (lh && typeof l3gaBind === "function") l3gaBind(lh, () => { l3plRenderTab(); if (l3pl.dock) l3plDockRender(); }, () => l3plLinkActs(l3gaP().split));
  const ls = host.querySelector("#v3PlLinkSrc"); if (ls) ls.onchange = () => { l3plSet("linkSrc", ls.value); if (ls.value !== "pp") l3plLoadX().then(() => l3plRenderTab()); else l3plRenderTab(); };
  const on = (id, fn, ev = "onclick") => { const el = host.querySelector("#" + id); if (el) el[ev] = fn; };
  on("v3PlReload", () => { l3pl.rows = null; l3plLoad(true); l3plRenderTab(); });
  on("v3PlDock", () => l3plDockToggle());
  host.querySelectorAll("[data-plsel]").forEach(b => { b.onclick = () => l3plSelect(b.dataset.plsel); });
  const save = () => { l3plSet("film", { ...l3plPrefs().film, from: host.querySelector("#v3FlFrom").value, to: host.querySelector("#v3FlTo").value, sec: Number(host.querySelector("#v3FlSec").value) || 20, res: host.querySelector("#v3FlRes").value, src: host.querySelector("#v3FlSrc").value, title: host.querySelector("#v3FlTitleOn").checked, pearls: host.querySelector("#v3FlPearls").checked, fxNow: host.querySelector("#v3FlFxNow").checked, fxGlow: host.querySelector("#v3FlFxGlow").checked, fxMiles: host.querySelector("#v3FlFxMiles").checked, fxMeter: host.querySelector("#v3FlFxMeter").checked, fxBl: host.querySelector("#v3FlFxBl").checked, fxLegend: host.querySelector("#v3FlFxLegend").checked, fxEtab: host.querySelector("#v3FlFxEtab").checked, fxCrane: host.querySelector("#v3FlFxCrane").checked, fxSigns: host.querySelector("#v3FlFxSigns").checked, caption: host.querySelector("#v3FlTitle").value }); if (l3fsOn()) l3fsRender(); };
  on("v3FlSrc", () => { save(); l3plLoadX().then(() => { if (l3fsOn()) l3fsRender(); }); }, "onchange");
  ["v3FlFrom", "v3FlTo", "v3FlSec", "v3FlRes", "v3FlTitleOn", "v3FlPearls", "v3FlTitle", "v3FlFxNow", "v3FlFxGlow", "v3FlFxMiles", "v3FlFxMeter", "v3FlFxBl", "v3FlFxLegend", "v3FlFxEtab", "v3FlFxCrane", "v3FlFxSigns"].forEach(id => on(id, save, "onchange"));
  l3plAnimBind(host);
  const fxd = host.querySelector(".v3-pl-fx"); if (fxd) fxd.ontoggle = () => l3plSet("fxOpen", fxd.open);
  on("v3FlStrip", () => { save(); l3fsToggle(); });
  // En sparad vy läggs där tidslinjens huvud står (annars på datumet i 3D).
  on("v3FlKeyView", e => { const v = l3SavedViews()[+e.target.value]; if (!v) return; const d = l3fs.t !== null && l3fsOn() ? l3plIso(new Date(Math.round(l3fs.t / 86400000) * 86400000)) : day; l3plKeyAdd({ p: v.p, t: v.t }, d, v.name); if (l3fsOn()) l3fsRender(); }, "onchange");
  on("v3FlPreview", () => { save(); l3plFilm(false); }); // under uppspelning: ■ Stoppa (till filmens början)
  on("v3FlPause", () => l3plPause());
  on("v3FlRec", () => { save(); l3plFilm(true); });
}
/* Animering (Victor 2026-10-12: "välja på vilka aktiviteter jag vill ha de olika animationerna. Sätt standard till
   som det är nu"): en standard för alla och ett val per aktivitet (namnet), t.ex. Gjutning = Växer upp. */
const L3PL_ANIM = [["color", "Byter färg (som nu)"], ["grow", "Växer upp"], ["fade", "Tonas in"], ["drop", "Lyfts på plats"]];
function l3plAnimHtml(f) {
  const A = f.anim || {}, def = A.def || "color", by = A.by || {}, esc = escHtml;
  const names = [...new Set(l3plFilmActs().map(a => a.name))].sort((x, y) => x.localeCompare(y, "sv", { numeric: true }));
  const q = (l3pl.animQ || "").trim().toLowerCase(), list = names.filter(n => !q || n.toLowerCase().includes(q));
  const sel = (id, v, withStd) => `<select ${id}>${withStd ? `<option value="">Standard</option>` : ""}${L3PL_ANIM.map(([k, t]) => `<option value="${k}" ${v === k ? "selected" : ""}>${t}</option>`).join("")}</select>`;
  const nSet = Object.keys(by).filter(k => by[k]).length;
  return `<details class="v3-pl-fx v3-pl-anim" ${l3pl.animOpen ? "open" : ""}><summary>Animering${nSet ? ` · ${nSet} egna` : ""}</summary>
    <label class="v3-pl-arow v3-pl-adef" title="Standard för alla aktiviteter"><span>Alla</span>${sel('id="v3FlAnimDef"', def, false)}</label>
    <div class="v3-pal-hint">Välj för enskilda aktiviteter (ett namn gäller alla dess objekt). Gäller IFC-objekt som är kopplade.</div>
    ${names.length > 8 ? `<input type="search" id="v3FlAnimQ" class="v3-pp-q" placeholder="Sök aktivitet…" value="${esc(l3pl.animQ || "")}" />` : ""}
    <div class="v3-pl-alist">${list.slice(0, 200).map(n => `<label class="v3-pl-arow ${by[n] ? "set" : ""}" title="${esc(n)}"><span>${esc(n)}</span>${sel(`data-anim="${esc(n)}"`, by[n] || "", true)}</label>`).join("") || `<div class="v3-pal-hint">Inga aktiviteter.</div>`}</div>
    ${nSet ? `<button type="button" class="v3-link" id="v3FlAnimClr">Återställ alla till Standard</button>` : ""}
  </details>`;
}
function l3plAnimBind(host) {
  const f = () => l3plPrefs().film || {}, put = A => l3plSet("film", { ...f(), anim: A });
  const d = host.querySelector(".v3-pl-anim"); if (d) d.ontoggle = () => { l3pl.animOpen = d.open; };
  const def = host.querySelector("#v3FlAnimDef"); if (def) def.onchange = () => put({ ...(f().anim || {}), def: def.value });
  host.querySelectorAll("[data-anim]").forEach(s2 => { s2.onchange = () => { const A = f().anim || {}, by = { ...(A.by || {}) }; if (s2.value) by[s2.dataset.anim] = s2.value; else delete by[s2.dataset.anim]; put({ ...A, by }); s2.closest(".v3-pl-arow").classList.toggle("set", !!s2.value); }; });
  const q = host.querySelector("#v3FlAnimQ"); if (q) q.oninput = () => { l3pl.animQ = q.value; const pos = q.selectionStart; l3plRenderTab(); const n = document.getElementById("v3FlAnimQ"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
  const clr = host.querySelector("#v3FlAnimClr"); if (clr) clr.onclick = () => { put({ ...(f().anim || {}), by: {} }); l3plRenderTab(); };
}
function l3plRender() { l3plRenderTab(); if (l3pl.dock) l3plDockRender(); }
function l3plSelect(key, split = false) {
  const a = l3plActs(split).find(x => x.key === key) || l3plActs(!split).find(x => x.key === key)
    || (l3pl.xrows ? (l3plActs(split, l3pl.xrows, "x").find(x => x.key === key) || l3plActs(!split, l3pl.xrows, "x").find(x => x.key === key)) : null);
  if (!a) return;
  const guids = new Set(a.rows.map(r => String(r.object_id || "")).filter(Boolean)), ents = [];
  if (typeof l3pEnts === "function") l3b.models.forEach(m => { const map = l3pEnts(m); guids.forEach(g => (map.get(g) || []).forEach(e => ents.push(e))); });
  if (ents.length) { l3bsSet(ents); if (typeof l3bsZoom === "function") l3bsZoom(); l3Status(`${a.name}: ${ents.length} objekt markerade.`); }
  else l3Status(`${a.name}: objekten finns inte i de inlästa modellerna.`, true);
}

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
