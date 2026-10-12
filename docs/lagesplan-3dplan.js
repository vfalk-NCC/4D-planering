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
/* En lapp per aktivitet (alla objekt i samma grupp blir en lapp, som på dashboardens tavla). */
function l3plActs() {
  const map = new Map();
  (l3pl.rows || []).forEach(r => {
    if (!r.start_date || !r.end_date) return;
    const k = r.group_id ? "g:" + r.group_id : "i:" + r.id;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  });
  return [...map].map(([key, rows]) => {
    const r = rows[0], s = rows.map(x => x.start_date).sort()[0], e = rows.map(x => x.end_date).sort().pop();
    const name = String(r.activity || r.object_name || "Aktivitet").trim();
    const objs = [...new Set(rows.map(x => String(x.object_name || "").trim()).filter(n => n && n !== name))];
    return { key, rows, name, objs, area: String(r.area || "").trim() || "(utan område)", contractor: String(r.contractor || "").trim(), start: s.slice(0, 10), end: e.slice(0, 10),
      progress: Math.round(rows.reduce((a, x) => a + (Number(x.progress) || 0), 0) / rows.length), temporary: r.temporary === true };
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
  host.innerHTML = `<div class="v3-pl-sec"><div class="v3-pl-h"><b>Powerproject-tidplanen</b><button type="button" class="v3-ic" id="v3PlReload" title="Läs om tidplanen">↻</button></div>
      ${l3pl.err ? `<div class="v3-pal-hint bad">Kunde inte läsa tidplanen: ${esc(l3pl.err)}</div>` : !acts.length ? `<div class="v3-pal-hint">Ingen Powerproject-tidplan i projektet ännu (importeras i 4D-planering).</div>`
        : `<div class="v3-pal-hint">${acts.length} aktiviteter · ${esc(range[0])} – ${esc(range[1])}</div>`}
      ${typeof planSource !== "undefined" && planSource !== "pp" ? `<div class="v3-pal-hint">3D-färgerna följer Excel-planeringen (vald i 4D-planering). Öppna lägesplanen med Powerproject vald för att färga efter den här tidplanen.</div>` : ""}
      <button type="button" class="v3-wide ${l3pl.dock ? "on" : ""}" id="v3PlDock">${l3pl.dock ? "Dölj tavlan" : "Visa tavlan och Gantten"}</button>
      ${now.length ? `<div class="v3-pl-now"><div class="v3-pl-sub">Pågår ${esc(day)}</div>${now.slice(0, 12).map(a => `<button type="button" class="v3-pl-act" data-plsel="${esc(a.key)}" title="Markera aktivitetens objekt i 3D"><i style="background:${phaseColor(zonePhase(a.rows, day))}"></i><span>${esc(a.objs.length ? `${a.objs.slice(0, 2).join(", ")}${a.objs.length > 2 ? " +" + (a.objs.length - 2) : ""} – ${a.name}` : a.name)}</span></button>`).join("")}${now.length > 12 ? `<div class="v3-pal-hint">… och ${now.length - 12} till</div>` : ""}</div>` : ""}
    </div>
    <div class="v3-pl-sec"><div class="v3-pl-h"><b>🎬 Film</b></div>
      <div class="v3-pl-grid">
        <label>Från<input type="date" id="v3FlFrom" value="${esc(f.from || range[0])}" /></label>
        <label>Till<input type="date" id="v3FlTo" value="${esc(f.to || range[1])}" /></label>
        <label>Längd (s)<input type="number" id="v3FlSec" min="3" max="600" value="${esc(String(f.sec || 20))}" /></label>
        <label>Upplösning<select id="v3FlRes">${[["720", "720p"], ["1080", "1080p (Full HD)"], ["1440", "1440p"]].map(([v, t]) => `<option value="${v}" ${String(f.res || "1080") === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      </div>
      <label class="v3-pl-chk"><input type="checkbox" id="v3FlTitleOn" ${f.title === false ? "" : "checked"} /> Datum och vecka i bilden</label>
      <input type="text" id="v3FlTitle" placeholder="Rubrik i filmen (valfri)" value="${esc(f.caption || "")}" />
      <div class="v3-pl-sub">Kameravyer</div>
      <div class="v3-pal-hint">Ställ in kameran och datumet, tryck ＋. Kameran glider mellan vyerna i datumordning. Utan vyer står kameran still.</div>
      <div class="v3-pl-keys">${keys.map((k, i) => `<div class="v3-pl-key"><input type="date" value="${esc(k.date)}" data-flkd="${i}" title="Datumet då kameran ska vara här" /><button type="button" data-flkgo="${i}" title="Visa vyn">${esc(k.name || "Vy " + (i + 1))}</button><button type="button" class="v3-ic" data-flkx="${i}" title="Ta bort">✕</button></div>`).join("") || ""}</div>
      <button type="button" class="v3-wide" id="v3FlKey">＋ Lägg till kameran som den står nu (${esc(day)})</button>
      ${l3SavedViews().length ? `<select id="v3FlKeyView" class="v3-wide"><option value="">＋ Lägg till en sparad vy på ${esc(day)}…</option>${l3SavedViews().map((v, i) => `<option value="${i}">${esc(v.name)}</option>`).join("")}</select>` : ""}
      <div class="v3-pl-btns"><button type="button" id="v3FlPreview" title="Spela upp i 3D-vyn utan att spela in">▶ Förhandsvisa</button><button type="button" id="v3FlRec" class="v3-primary" title="Spela in och spara som videofil">⏺ Spela in film</button></div>
      <div class="v3-pal-hint" id="v3FlMsg">${typeof MediaRecorder === "undefined" ? "Webbläsaren kan inte spela in video." : ""}</div>
    </div>`;
  const on = (id, fn, ev = "onclick") => { const el = host.querySelector("#" + id); if (el) el[ev] = fn; };
  on("v3PlReload", () => { l3pl.rows = null; l3plLoad(true); l3plRenderTab(); });
  on("v3PlDock", () => l3plDockToggle());
  host.querySelectorAll("[data-plsel]").forEach(b => { b.onclick = () => l3plSelect(b.dataset.plsel); });
  const save = () => l3plSet("film", { ...l3plPrefs().film, from: host.querySelector("#v3FlFrom").value, to: host.querySelector("#v3FlTo").value, sec: Number(host.querySelector("#v3FlSec").value) || 20, res: host.querySelector("#v3FlRes").value, title: host.querySelector("#v3FlTitleOn").checked, caption: host.querySelector("#v3FlTitle").value });
  ["v3FlFrom", "v3FlTo", "v3FlSec", "v3FlRes", "v3FlTitleOn", "v3FlTitle"].forEach(id => on(id, save, "onchange"));
  on("v3FlKey", () => { l3plKeyAdd(l3plCam(), day, `Vy ${keys.length + 1}`); });
  on("v3FlKeyView", e => { const v = l3SavedViews()[+e.target.value]; if (v) l3plKeyAdd({ p: v.p, t: v.t }, day, v.name); }, "onchange");
  host.querySelectorAll("[data-flkd]").forEach(inp => { inp.onchange = () => { const k = l3plKeys(); k[+inp.dataset.flkd].date = inp.value; l3plKeysSet(k); }; });
  host.querySelectorAll("[data-flkgo]").forEach(b => { b.onclick = () => { const k = l3plKeys()[+b.dataset.flkgo]; if (!k) return; l3plCamApply(k); $("dateInput").value = k.date; l3Render(); }; });
  host.querySelectorAll("[data-flkx]").forEach(b => { b.onclick = () => { const k = l3plKeys(); k.splice(+b.dataset.flkx, 1); l3plKeysSet(k); }; });
  on("v3FlPreview", () => { save(); l3plFilm(false); });
  on("v3FlRec", () => { save(); l3plFilm(true); });
}
function l3plRender() { l3plRenderTab(); if (l3pl.dock) l3plDockRender(); }
function l3plSelect(key) {
  const a = l3plActs().find(x => x.key === key);
  if (!a) return;
  const guids = new Set(a.rows.map(r => String(r.object_id || "")).filter(Boolean)), ents = [];
  if (typeof l3pEnts === "function") l3b.models.forEach(m => { const map = l3pEnts(m); guids.forEach(g => (map.get(g) || []).forEach(e => ents.push(e))); });
  if (ents.length) { l3bsSet(ents); if (typeof l3bsZoom === "function") l3bsZoom(); l3Status(`${a.name}: ${ents.length} objekt markerade.`); }
  else l3Status(`${a.name}: objekten finns inte i de inlästa modellerna.`, true);
}

/* ---- Tavlan och Gantten (panelen nederst) ---------------------------------------------------------- */
function l3plDockToggle(on = !l3pl.dock) { l3pl.dock = on; l3plSet("dock", on); l3plDockRender(); l3plRenderTab(); }
function l3plDockRender() {
  const host = document.getElementById("v3Canvas");
  if (!host) return;
  let d = document.getElementById("v3PlanDock");
  if (!l3pl.dock) { if (d) d.remove(); return; }
  if (!d) {
    d = document.createElement("div"); d.id = "v3PlanDock"; d.className = "v3-pldock";
    d.style.height = (l3plPrefs().dockH || 300) + "px";
    host.appendChild(d);
    ["pointerdown", "wheel", "contextmenu", "dblclick", "click", "keydown"].forEach(t => d.addEventListener(t, e => e.stopPropagation()));
  }
  if (!l3pl.rows) { d.innerHTML = `<div class="v3-pal-hint" style="padding:12px"><span class="pm-spin"></span> Hämtar tidplanen…</div>`; l3plLoad(); return; }
  const P = l3plPrefs(), view = P.view || "board", by = P.colorBy || "contractor", q = String(P.q || "").toLowerCase(), esc = escHtml, day = l3plDay();
  let acts = l3plActs();
  if (q) acts = acts.filter(a => `${a.name} ${a.objs.join(" ")} ${a.area} ${a.contractor}`.toLowerCase().includes(q));
  const head = `<div class="v3-pldock-grip" title="Dra för att ändra höjden"></div><div class="v3-pldock-bar"><b>Powerproject</b>
      <div class="v3-segs"><button type="button" data-plview="board" class="${view === "board" ? "on" : ""}">Tavla</button><button type="button" data-plview="bars" class="${view === "bars" ? "on" : ""}">Staplar</button></div>
      <label>Färg <select id="v3PlBy"><option value="contractor" ${by === "contractor" ? "selected" : ""}>Entreprenör</option><option value="area" ${by === "area" ? "selected" : ""}>Område</option><option value="activity" ${by === "activity" ? "selected" : ""}>Aktivitet</option></select></label>
      <input type="search" id="v3PlQ" placeholder="Sök…" value="${esc(P.q || "")}" />
      <button type="button" id="v3PlToday" title="Till datumet i 3D">◎ ${esc(day)}</button>
      <button type="button" class="v3-ic" id="v3PlClose" title="Stäng">✕</button></div>`;
  if (!acts.length) { d.innerHTML = head + `<div class="v3-pal-hint" style="padding:12px">${l3pl.rows.length ? "Ingen aktivitet matchar." : "Ingen Powerproject-tidplan i projektet."}</div>`; l3plDockBind(d); return; }
  const lo = acts.reduce((m, a) => (a.start < m ? a.start : m), acts[0].start), hi = acts.reduce((m, a) => (a.end > m ? a.end : m), acts[0].end);
  const w0 = l3plMonday(lo), nWeeks = Math.max(1, Math.round((l3plMonday(hi) - w0) / 604800000) + 1), nDays = nWeeks * 7;
  const dayOf = s => Math.round((l3plDate(s) - w0) / 86400000);
  const colPx = view === "board" ? 154 : 70, dayPx = colPx / 7, todayD = dayOf(day);
  const keyOf = a => (by === "area" ? a.area : by === "activity" ? a.name : a.contractor || "(ingen entreprenör)");
  const keys = [...new Set(acts.map(keyOf))].sort((x, y) => x.localeCompare(y, "sv", { numeric: true }));
  const weeks = Array.from({ length: nWeeks }, (_, i) => { const ws = new Date(w0); ws.setUTCDate(ws.getUTCDate() + i * 7); const we = new Date(ws); we.setUTCDate(we.getUTCDate() + 6);
    const cur = todayD >= i * 7 && todayD < i * 7 + 7;
    return `<button type="button" class="v3-pl-week${cur ? " cur" : ""}" data-plweek="${l3plIso(ws)}" title="Visa ${l3plIso(ws)} i 3D"><b>v.${l3plWeekNo(ws)}</b><span>${l3plShort(ws)} – ${l3plShort(we)}</span></button>`; }).join("");
  const lanes = new Map(); acts.forEach(a => { if (!lanes.has(a.area)) lanes.set(a.area, []); lanes.get(a.area).push(a); });
  const laneKeys = [...lanes.keys()].sort((x, y) => x.localeCompare(y, "sv", { numeric: true }));
  const note = a => {
    const c0 = Math.max(0, dayOf(a.start)), c1 = Math.min(nDays - 1, dayOf(a.end)), ph = zonePhase(a.rows, day), st = phaseColor(ph), c = l3plColor(by, keyOf(a), keys);
    const label = a.objs.length ? `${a.objs.slice(0, 3).join(", ")}${a.objs.length > 3 ? " +" + (a.objs.length - 3) : ""} – ${a.name}` : a.name;
    const tip = [label, a.area, a.contractor, `${a.start} – ${a.end}`, `${PHASE_LABELS[ph] || ph} · ${a.progress} %`, a.temporary ? "Temporär" : ""].filter(Boolean).join("\n");
    if (view === "bars") return `<div class="v3-pl-bar${ph === "forsenad" ? " late" : ""}" data-plsel="${esc(a.key)}" title="${esc(tip)}" style="left:${c0 * dayPx}px;width:${Math.max(dayPx, (c1 - c0 + 1) * dayPx)}px;--st:${st};--bg:${c.bg};--bd:${c.bd};--ink:${c.ink}"><span class="v3-pl-bar-p" style="width:${a.progress}%"></span><span class="v3-pl-bar-t">${esc(label)}</span></div>`;
    return `<div class="v3-pnote${ph === "forsenad" ? " late" : ""}${ph === "klar" ? " done" : ""}${a.temporary ? " temp" : ""}" data-plsel="${esc(a.key)}" title="${esc(tip)}" style="grid-column:${c0 + 1} / ${c1 + 2};--bg:${c.bg};--bd:${c.bd};--ink:${c.ink};--st:${st}">
      <i style="background:${st}"></i><span class="t">${esc(label)}</span>${a.contractor && by !== "contractor" ? `<span class="s">${esc(a.contractor)}</span>` : ""}<span class="p" style="width:${a.progress}%;background:${st}"></span></div>`;
  };
  let body;
  if (view === "bars") {
    body = laneKeys.map(k => `<div class="v3-pl-lane"><div class="v3-pl-lane-h" title="${esc(k)}">${esc(k)} <small>${lanes.get(k).length}</small></div><div class="v3-pl-rows" style="width:${nDays * dayPx}px">${lanes.get(k).map(a => `<div class="v3-pl-row">${note(a)}</div>`).join("")}</div></div>`).join("");
  } else {
    body = laneKeys.map(k => `<div class="v3-pl-lane"><div class="v3-pl-lane-h" title="${esc(k)}">${esc(k)} <small>${lanes.get(k).length}</small></div><div class="v3-pl-grid-b" style="grid-template-columns:repeat(${nDays}, ${dayPx}px)">${lanes.get(k).map(note).join("")}</div></div>`).join("");
  }
  d.innerHTML = head + `<div class="v3-pl-scroll"><div class="v3-pl-board ${view}" style="--col:${colPx}px;--day:${dayPx}px;width:${150 + nDays * dayPx}px">
      <div class="v3-pl-weeks"><div class="v3-pl-corner">Område</div><div class="v3-pl-wk" style="grid-template-columns:repeat(${nWeeks}, ${colPx}px)">${weeks}</div></div>
      ${todayD >= 0 && todayD < nDays ? `<div class="v3-pl-today" style="left:${150 + (todayD + 0.5) * dayPx}px" title="${esc(day)}"></div>` : ""}
      ${body}</div></div>`;
  l3plDockBind(d);
  // Första gången: till dagens vecka.
  if (!d._scrolled && todayD > 0) { d._scrolled = true; const sc = d.querySelector(".v3-pl-scroll"); if (sc) sc.scrollLeft = Math.max(0, todayD * dayPx - 200); }
}
function l3plDockBind(d) {
  const P = () => l3plPrefs();
  d.querySelectorAll("[data-plview]").forEach(b => { b.onclick = () => { l3plSet("view", b.dataset.plview); l3plDockRender(); }; });
  const by = d.querySelector("#v3PlBy"); if (by) by.onchange = () => { l3plSet("colorBy", by.value); l3plDockRender(); };
  const q = d.querySelector("#v3PlQ"); if (q) q.oninput = () => { l3plSet("q", q.value); const pos = q.selectionStart; l3plDockRender(); const q2 = document.getElementById("v3PlQ"); if (q2) { q2.focus(); q2.setSelectionRange(pos, pos); } };
  const x = d.querySelector("#v3PlClose"); if (x) x.onclick = () => l3plDockToggle(false);
  const t = d.querySelector("#v3PlToday"); if (t) t.onclick = () => { d._scrolled = false; l3plDockRender(); };
  d.querySelectorAll("[data-plsel]").forEach(n => { n.onclick = () => l3plSelect(n.dataset.plsel); });
  d.querySelectorAll("[data-plweek]").forEach(b => { b.onclick = () => { $("dateInput").value = b.dataset.plweek; $("dateInput").dispatchEvent(new Event("change")); setTimeout(l3plDockRender, 50); }; });
  const g = d.querySelector(".v3-pldock-grip");
  if (g) g.onpointerdown = e => {
    e.preventDefault(); const y0 = e.clientY, h0 = d.offsetHeight, host = document.getElementById("v3Canvas");
    const mv = ev => { d.style.height = Math.max(120, Math.min(host.clientHeight - 60, h0 + (y0 - ev.clientY))) + "px"; };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); l3plSet("dockH", d.offsetHeight); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
  void P;
}

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
  const st = { stop: false };
  l3pl.rec = st;
  const setBtn = txt => { const b = document.getElementById(record ? "v3FlRec" : "v3FlPreview"); if (b) b.textContent = txt; };
  setBtn("■ Stoppa");
  let cv = null, ctx = null, rec = null, chunks = [], mime = "";
  if (record) {
    cv = document.createElement("canvas"); cv.width = W; cv.height = H; ctx = cv.getContext("2d");
    mime = l3plMime();
    const stream = cv.captureStream(0), track = stream.getVideoTracks()[0];
    rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: Math.round(W * H * fps * 0.12) });
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(1000);
    st.frame = () => { if (track.requestFrame) track.requestFrame(); };
    // Full upplösning: renderaren ritar i filmens storlek medan den spelas in.
    R.setPixelRatio(1); R.setSize(W, H, false);
    const cam = l3.camera; if (cam.isOrthographicCamera) { const h = cam.top - cam.bottom; cam.left = -h * W / H / 2; cam.right = h * W / H / 2; } else cam.aspect = W / H; cam.updateProjectionMatrix();
  }
  const title = f.title !== false, caption = String(f.caption || "").trim();
  const start = performance.now();
  try {
    for (let i = 0; i <= frames && !st.stop; i++) {
      const t = t0 + (t1 - t0) * (i / frames), d = l3plIso(new Date(Math.round(t / 86400000) * 86400000));
      l3plSetDay(d);
      const c = l3plCamAt(keys, t); if (c) l3plCamApply(c);
      if (record) {
        R.render(l3.scene, l3.camera);
        ctx.drawImage(R.domElement, 0, 0, W, H);
        if (title) l3plOverlay(ctx, W, H, d, caption);
        st.frame();
      } else l3Render();
      if (msg) msg.textContent = `${record ? "Spelar in" : "Spelar upp"}: ${d} (${Math.round(i / frames * 100)} %)`;
      // Takten: bild i vid tiden i / fps (spelar in i realtid).
      const wait = start + (i + 1) * 1000 / fps - performance.now();
      await new Promise(r => setTimeout(r, Math.max(0, wait)));
    }
  } finally {
    if (record) {
      await new Promise(r => { rec.onstop = r; rec.stop(); });
      R.setPixelRatio(pr0); l3Resize();
    }
    l3pl.rec = null;
    setBtn(record ? "⏺ Spela in film" : "▶ Förhandsvisa");
    $("dateInput").value = day0; $("dateInput").dispatchEvent(new Event("change"));
    l3plSetDay(day0);
    if (!keys.length) l3plCamApply(cam0);
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
  // Tidslinjen.
  const a = l3plDate(f.from || d).getTime(), b = l3plDate(f.to || d).getTime(), u = b > a ? (dt.getTime() - a) / (b - a) : 1;
  ctx.fillStyle = "rgba(15,23,42,.25)"; ctx.fillRect(0, H - 10 * s, W, 10 * s);
  ctx.fillStyle = "#6d5efc"; ctx.fillRect(0, H - 10 * s, W * Math.max(0, Math.min(1, u)), 10 * s);
  ctx.restore();
}

function l3plInit() {
  l3pl.dock = !!l3plPrefs().dock;
  if (l3pl.dock) l3plDockRender();
  if (l3Prefs().palTab === "plan") l3plRenderTab();
}
document.addEventListener("DOMContentLoaded", () => {
  // Datumet ändras (uppspelning, reglaget): tavlan följer med.
  const di = $("dateInput"); if (di) di.addEventListener("change", () => { if (l3pl.dock && !l3pl.rec) l3plDockRender(); });
});
