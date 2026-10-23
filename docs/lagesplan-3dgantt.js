/* 3D-vyn – fliken 4D-planering: tavlan, Gantten och listan (Victor 2026-10-12: "titta i dashboarden hur det ser ut
   och lägga till alla funktioner … Lägg till skydd också och extra dialogruta för att fråga om jag verkligen vill
   spara över saker i TC 4d-planeringen").

   Samma tidplan som 4D-dashboarden och 4D-planering visar för Powerproject (projects/<id>/pp/…):
   – Tavla (post-it-lappar per vecka), Staplar (Gantt) och Lista (som Planerade objekt i 4D-planering).
   – Period 2 v / 4 v / 3 mån / Allt eller eget intervall, Gruppera, Färga efter, sök, En rad, Hela texten, Pilar
     (beroenden), En lapp per objekt, Baseline, områden att visa, helskärm och utskrift.
   – Redigerbar: dra en lapp/stapel för att flytta den, dra i kanterna för start/slut – det som väntar på den flyttas
     med (Shift: bara den). Dubbelklick: redigera namn, datum och framdrift. Högerklick: markera i 3D, koppla de
     markerade 3D-objekten, redigera, visa beroendekedjan. Ångra/Gör om.
   – Skydd: ingenting sparas utan en ruta som visar exakt vad som ändras och frågar om det ska sparas i
     4D-planeringen. Har någon annan ändrat samma aktivitet sedan den lästes sparas inget (läs om och försök igen).
     Kopplingar till 3D-objekt görs av 4D-planering i Trimble Connect (samma som "Koppla till markering"). */

const l3ga = { undo: [], redo: [], open: new Set(), chain: null, busy: false };
const L3GA_LINK = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>`;
const L3GA_WD = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];
const l3gaAdd = (iso, n) => { const d = l3plDate(iso.slice(0, 10)); d.setUTCDate(d.getUTCDate() + n); return l3plIso(d); };
const l3gaDays = (a, b) => Math.round((l3plDate(b.slice(0, 10)) - l3plDate(a.slice(0, 10))) / 86400000);
const l3gaWd = iso => { const d = l3plDate(iso.slice(0, 10)); return `${L3GA_WD[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`; };
const l3gaPath = f => `projects/${encodeURIComponent(projectId)}/pp/${f}`;
const l3gaRow = id => (l3pl.rows || []).find(r => String(r.id) === String(id));
const l3gaKeyOf = r => (r.group_id ? "g:" + r.group_id : r.source_key ? "s:" + r.source_key : "i:" + r.id);
const l3gaP = () => ({ view: "board", groupBy: "area", colorBy: "contractor", period: "4w", oneLine: false, fullText: false, arrows: true, split: false, editable: false, baseline: false, hidden: [], lf: {}, ...l3plPrefs() });

/* ---- Perioden ----------------------------------------------------------------------------------- */
function l3gaDomain(acts, P) {
  const day = l3plDay(), mon = l3plIso(l3plMonday(day));
  if (P.period === "2w") return [mon, l3gaAdd(mon, 13)];
  if (P.period === "4w") return [mon, l3gaAdd(mon, 27)];
  if (P.period === "3m") return [mon, l3gaAdd(mon, 90)];
  if (P.period === "custom" && P.from && P.to && P.to >= P.from) return [P.from, P.to];
  if (!acts.length) return [mon, l3gaAdd(mon, 27)];
  return [acts.reduce((m, a) => (a.start < m ? a.start : m), acts[0].start), acts.reduce((m, a) => (a.end > m ? a.end : m), acts[0].end)];
}
const l3gaLaneKey = (a, by) => (by === "contractor" ? a.contractor || "(ingen entreprenör)" : by === "activity" ? a.name : by === "area" ? a.area : "Alla");
const l3gaColorKey = (a, by) => (by === "area" ? a.area : by === "activity" ? a.name : a.contractor || "(ingen entreprenör)");

/* ---- Panelen ------------------------------------------------------------------------------------ */
function l3plDockToggle(on = !l3pl.dock) { l3pl.dock = on; l3plSet("dock", on); l3plDockRender(); l3plRenderTab(); }
function l3plDockRender() {
  const host = document.getElementById("v3Canvas");
  if (!host) return;
  let d = document.getElementById("v3PlanDock");
  if (!l3pl.dock) { if (d) d.remove(); if (typeof l3fsOn === "function" && l3fsOn()) l3fsRender(); return; }
  const P = l3gaP();
  if (!d) {
    d = document.createElement("div"); d.id = "v3PlanDock"; d.className = "v3-pldock";
    host.appendChild(d);
    ["pointerdown", "wheel", "contextmenu", "dblclick", "click", "keydown"].forEach(t => d.addEventListener(t, e => e.stopPropagation()));
  }
  d.classList.toggle("full", !!P.full);
  d.style.height = P.full ? "" : (P.dockH || 320) + "px";
  if (!l3pl.rows) { d.innerHTML = `<div class="v3-pal-hint" style="padding:12px"><span class="pm-spin"></span> Hämtar tidplanen…</div>`; l3plLoad(); return; }
  const sc0 = d.querySelector(".v3-pl-scroll"), keepScroll = sc0 ? [sc0.scrollLeft, sc0.scrollTop] : null;
  const E = escHtml, day = l3plDay();
  let acts = l3plActs(P.split);
  const q = String(P.q || "").toLowerCase();
  if (q) acts = acts.filter(a => `${a.name} ${a.objs.join(" ")} ${a.area} ${a.contractor}`.toLowerCase().includes(q));
  const lanesAll = [...new Set(acts.map(a => l3gaLaneKey(a, P.groupBy)))].sort((x, y) => x.localeCompare(y, "sv", { numeric: true }));
  const hid = new Set((P.hidden || []).filter(k => k.startsWith(P.groupBy + ":")).map(k => k.slice(P.groupBy.length + 1)));
  const colorKeys = [...new Set(l3plActs(P.split).map(a => l3gaColorKey(a, P.colorBy)))].sort((x, y) => x.localeCompare(y, "sv", { numeric: true }));
  const bar = `<div class="v3-pldock-grip" title="Dra för att ändra höjden"></div>
    <div class="v3-pldock-bar v3-ga-row1">
      <div class="v3-segs"><button type="button" data-plview="bars" class="${P.view === "bars" ? "on" : ""}">Staplar</button><button type="button" data-plview="board" class="${P.view === "board" ? "on" : ""}">Tavla</button><button type="button" data-plview="list" class="${P.view === "list" ? "on" : ""}">Lista</button></div>
      <label>Gruppera <select id="v3GaGroup">${[["area", "Område"], ["contractor", "Entreprenör"], ["activity", "Aktivitet"], ["", "Ingen"]].map(([v, t]) => `<option value="${v}" ${P.groupBy === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <label>Färga efter <select id="v3PlBy">${[["contractor", "Entreprenör"], ["area", "Område"], ["activity", "Aktivitet"]].map(([v, t]) => `<option value="${v}" ${P.colorBy === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      <input type="search" id="v3PlQ" placeholder="Sök område eller aktivitet…" value="${E(P.q || "")}" />
      <button type="button" id="v3GaUndo" ${l3ga.undo.length ? "" : "disabled"} title="${l3ga.undo.length ? "Ångra: " + E(l3ga.undo[l3ga.undo.length - 1].label) : "Inget att ångra"}">↶ Ångra</button>
      <button type="button" id="v3GaRedo" ${l3ga.redo.length ? "" : "disabled"} title="${l3ga.redo.length ? "Gör om: " + E(l3ga.redo[l3ga.redo.length - 1].label) : "Inget att göra om"}">↷ Gör om</button>
      <button type="button" id="v3GaFull" title="${P.full ? "Tillbaka till panelen" : "Hela 3D-ytan"}">${P.full ? "⤓ Panel" : "⛶ Helskärm"}</button>
      <button type="button" id="v3GaPrint" title="Skriv ut tavlan eller Gantten">🖨 Skriv ut</button>
      <button type="button" id="v3GaHide" class="v3-ga-hide ${P.hideBtns ? "on" : ""}" aria-pressed="${!!P.hideBtns}" title="${P.hideBtns ? "Visa alla knappar och filter igen" : "Dölj knapparna så att Gantten får mer plats – tidsraden finns kvar"}">${P.hideBtns ? "Visa knappar" : "Dölj knappar"}</button>
      <button type="button" class="v3-ic" id="v3PlClose" title="Stäng">✕</button>
    </div>
    <div class="v3-pldock-bar v3-ga-row2">
      <span class="v3-ga-lbl">Period</span>
      <div class="v3-segs">${[["2w", "2 v"], ["4w", "4 v"], ["3m", "3 mån"], ["all", "Allt"]].map(([v, t]) => `<button type="button" data-gaper="${v}" class="${P.period === v ? "on" : ""}">${t}</button>`).join("")}</div>
      <input type="date" id="v3GaFrom" value="${E(l3gaDomain(acts, P)[0])}" /> – <input type="date" id="v3GaTo" value="${E(l3gaDomain(acts, P)[1])}" /><button type="button" id="v3GaApply">Använd</button>
      ${P.view !== "list" ? `<label class="v3-ga-tg"><input type="checkbox" id="v3GaOne" ${P.oneLine ? "checked" : ""}/> En rad</label>
      <label class="v3-ga-tg"><input type="checkbox" id="v3GaFullTxt" ${P.fullText ? "checked" : ""}/> Hela texten</label>
      <label class="v3-ga-tg"><input type="checkbox" id="v3GaArrows" ${P.arrows ? "checked" : ""}/> Pilar</label>` : ""}
      <label class="v3-ga-tg"><input type="checkbox" id="v3GaSplit" ${P.split ? "checked" : ""}/> En lapp per objekt</label>
      ${P.view !== "list" ? `<label class="v3-ga-tg" title="Dra i lappar/staplar för att flytta dem eller ändra start och slut – sparas i 4D-planeringen efter att du godkänt"><input type="checkbox" id="v3GaEdit" ${P.editable ? "checked" : ""}/> Redigerbar</label>
      <label class="v3-ga-tg"><input type="checkbox" id="v3GaBl" ${P.baseline ? "checked" : ""}/> Baseline</label>` : ""}
    </div>
    ${typeof l3gmBarHtml === "function" ? l3gmBarHtml(acts) : ""}
    ${P.editable && P.view !== "list" ? `<div class="v3-ga-hint">✏️ Redigerbart: dra en lapp för att flytta den, eller dess vänster-/högerkant för start/slut. Det som väntar på den flyttas med – håll <b>Shift</b> för att bara flytta den. Dubbelklicka för att redigera, högerklicka för fler val. Inget sparas utan att du godkänner det.</div>` : ""}
    <div class="v3-pldock-bar v3-ga-legend">${["planerad", "pagaende", "forsenad", "klar", "pausad"].map(k => `<span><i style="background:${phaseColor(k)}"></i>${E(PHASE_LABELS[k] || k)}</span>`).join("")}
      <span class="v3-ga-sep"></span>${colorKeys.slice(0, 14).map(k => { const c = l3plColor(P.colorBy, k, colorKeys); return `<span class="v3-ga-chip" style="--bg:${c.bg};--bd:${c.bd};--ink:${c.ink}">${E(k)}</span>`; }).join("")}${colorKeys.length > 14 ? `<span>+${colorKeys.length - 14}</span>` : ""}
      ${P.groupBy ? `<button type="button" id="v3GaLanes" class="v3-ga-lanes">${({ area: "Områden", contractor: "Entreprenörer", activity: "Aktiviteter" })[P.groupBy]}: ${lanesAll.length - lanesAll.filter(k => hid.has(k)).length} av ${lanesAll.length} visas ▾</button>${hid.size ? `<button type="button" id="v3GaLanesAll" class="v3-link">Visa alla</button>` : ""}` : ""}
    </div>`;
  d.classList.toggle("v3-hidebtns", !!P.hideBtns);
  if (!acts.length) { d.innerHTML = bar + `<div class="v3-pal-hint" style="padding:12px">${l3pl.rows.length ? "Ingen aktivitet matchar." : "Ingen Powerproject-tidplan i projektet."}</div>`; l3gaBind(d); return; }
  const shown = acts.filter(a => !hid.has(l3gaLaneKey(a, P.groupBy)));
  d.classList.toggle("v3-hidebtns", !!P.hideBtns);
  d.innerHTML = bar + `<div class="v3-pl-scroll">${P.view === "list" ? l3gaListHtml(shown, P) : l3gaTimelineHtml(shown, P, colorKeys)}</div>`;
  l3gaBind(d);
  const sc = d.querySelector(".v3-pl-scroll");
  if (keepScroll && sc) { sc.scrollLeft = keepScroll[0]; sc.scrollTop = keepScroll[1]; }
  if (P.view !== "list" && P.arrows) requestAnimationFrame(() => l3gaArrows(d));
  if (P.view !== "list" && typeof l3gmAddScrub === "function") l3gmAddScrub();
  if (typeof l3fsOn === "function" && l3fsOn()) l3fsRender(); // tidslinjen ovanför panelen
}

/* Tavlan och staplarna. */
function l3gaTimelineHtml(acts, P, colorKeys) {
  const E = escHtml, day = l3plDay(), [ds, de] = l3gaDomain(acts, P);
  const w0 = l3plMonday(ds), nWeeks = Math.max(1, Math.round((l3plMonday(de) - w0) / 604800000) + 1), nDays = nWeeks * 7, w0i = l3plIso(w0);
  const dayOf = s => l3gaDays(w0i, s);
  // Gantten täcker hela bredden (Victor 2026-10-14): veckokolumnerna sträcks ut så att tidslinjen fyller panelen – aldrig smalare än förut.
  const board = P.view === "board", HEAD = 170, dockW = (document.getElementById("v3PlanDock") || {}).clientWidth || 0;
  const colPx = Math.max(board ? 190 : 84, dockW ? Math.floor((dockW - HEAD - 28) / nWeeks) : 0), dayPx = colPx / 7, todayD = dayOf(day);
  const vis = acts.filter(a => a.start <= l3gaAdd(w0i, nDays - 1) && a.end >= w0i);
  const outside = acts.length - vis.length;
  const lanes = new Map();
  vis.forEach(a => { const k = l3gaLaneKey(a, P.groupBy); if (!lanes.has(k)) lanes.set(k, []); lanes.get(k).push(a); });
  const laneKeys = [...lanes.keys()].sort((x, y) => x.localeCompare(y, "sv", { numeric: true }));
  const weeks = Array.from({ length: nWeeks }, (_, i) => { const ws = new Date(w0); ws.setUTCDate(ws.getUTCDate() + i * 7); const we = new Date(ws); we.setUTCDate(we.getUTCDate() + 6);
    const cur = todayD >= i * 7 && todayD < i * 7 + 7;
    return `<button type="button" class="v3-pl-week${cur ? " cur" : ""}" data-plweek="${l3plIso(ws)}" title="Visa ${l3plIso(ws)} i 3D"><b>v.${l3plWeekNo(ws)}</b><span>${l3plShort(ws)} – ${l3plShort(we)}</span></button>`; }).join("");
  const item = a => {
    const c0 = Math.max(0, dayOf(a.start)), c1 = Math.min(nDays - 1, dayOf(a.end)), ph = zonePhase(a.rows, day), st = phaseColor(ph), c = l3plColor(P.colorBy, l3gaColorKey(a, P.colorBy), colorKeys);
    const label = a.objs.length ? `${a.objs.slice(0, 3).join(", ")}${a.objs.length > 3 ? " +" + (a.objs.length - 3) : ""}: ${a.name}` : a.name;
    const sub = [P.groupBy !== "area" ? a.area : "", P.groupBy !== "contractor" ? a.contractor : ""].filter(Boolean).join(" · ");
    const dates = a.start === a.end ? `${l3gaWd(a.start)} · 1 dag` : `${l3gaWd(a.start)} – ${l3gaWd(a.end)}`;
    const tip = [label, a.area, a.contractor, `${a.start} – ${a.end}`, `${PHASE_LABELS[ph] || ph} · ${a.progress} %`, a.coupled ? "Kopplad till 3D" : "Inte kopplad till 3D", a.deps.length ? `Väntar på ${a.deps.length}` : "", a.temporary ? "Temporär" : ""].filter(Boolean).join("\n");
    const cls = `${ph === "forsenad" ? " late" : ""}${ph === "klar" ? " done" : ""}${a.temporary ? " temp" : ""}${P.editable ? " edit" : ""}${l3ga.chain && l3ga.chain.has(a.key) ? " chain" : ""}`;
    let bl = "";
    if (P.baseline && a.bl) {
      const b0 = Math.max(0, dayOf(a.bl[0])), b1 = Math.min(nDays - 1, dayOf(a.bl[1])), sh = l3gaDays(a.bl[1], a.end);
      if (b1 >= b0) bl = `<span class="v3-ga-bl" style="left:${(b0 - c0) * dayPx}px;width:${(b1 - b0 + 1) * dayPx}px"></span>`;
      if (sh) bl += `<span class="v3-ga-bld${sh > 0 ? " later" : ""}" title="Mot baseline">${sh > 0 ? "+" : ""}${sh} d</span>`;
    }
    const attrs = `data-plk="${E(a.key)}" title="${E(tip)}"`;
    const link = a.coupled ? `<span class="v3-ga-lk" title="Kopplad till 3D-objekt">${L3GA_LINK}</span>` : "";
    if (!board) return `<div class="v3-pl-row"><div class="v3-pl-bar${cls}" ${attrs} style="left:${c0 * dayPx}px;width:${Math.max(dayPx, (c1 - c0 + 1) * dayPx)}px;--st:${st};--bg:${c.bg};--bd:${c.bd};--ink:${c.ink}"><span class="v3-pl-bar-p" style="width:${a.progress}%"></span><span class="v3-pl-bar-t">${E(label)}</span>${bl}<i class="v3-ga-h l"></i><i class="v3-ga-h r"></i></div></div>`;
    const span = Math.max(c1 - c0 + 1, P.oneLine ? 1 : Math.min(nDays - c0, 5)); // korta lappar: plats för texten
    return `<div class="v3-pnote${P.oneLine ? " one" : ""}${P.fullText ? " full" : ""}${cls}" ${attrs} style="grid-column:${c0 + 1} / ${c0 + span + 1};--real:${(c1 - c0 + 1) * dayPx}px;--bg:${c.bg};--bd:${c.bd};--ink:${c.ink};--st:${st}">
      ${P.oneLine ? `<i style="background:${st}"></i><span class="t">${E(label)}</span>${link}${sub ? `<span class="s">${E(sub)}</span>` : ""}<span class="d">${E(dates)}</span>`
        : `<div class="t">${E(label)}${link}</div>${sub ? `<div class="s">${E(sub)}</div>` : ""}<div class="m"><span><i style="background:${st}"></i>${E(PHASE_LABELS[ph] || ph)}${a.progress ? ` · <b class="pcb">${a.progress} %</b>` : ""}</span><span>${E(dates)}</span></div><div class="pg"><span style="width:${a.progress}%;background:${st}"></span></div>`}
      <span class="p" style="width:${a.progress}%;background:${st}"></span>${bl}<i class="v3-ga-h l"></i><i class="v3-ga-h r"></i></div>`;
  };
  const laneHtml = k => {
    const list = lanes.get(k), lc = P.groupBy ? l3plColor(P.groupBy === P.colorBy ? P.colorBy : P.groupBy, k, [...new Set(acts.map(a => l3gaLaneKey(a, P.groupBy)))].sort((x, y) => x.localeCompare(y, "sv", { numeric: true }))) : { bg: "#fffdf8", bd: "#e4ded2", ink: "#1f2328" };
    const open = !l3ga.open.has("c:" + k);
    const head = `<div class="v3-pl-lane-h" style="--bg:${lc.bg};--bd:${lc.bd};--ink:${lc.ink}" title="${E(k)} – högerklicka för att dölja"><button type="button" class="v3-ga-fold" data-gafold="${E(k)}">${open ? "▾" : "▸"}</button><span>${E(k)}</span><small>${list.length} st</small></div>`;
    if (!open) return `<div class="v3-pl-lane shut" data-galane="${E(k)}">${head}<div class="v3-pl-shut"></div></div>`;
    return board ? `<div class="v3-pl-lane" data-galane="${E(k)}">${head}<div class="v3-pl-grid-b" style="grid-template-columns:repeat(${nDays}, ${dayPx}px)">${list.map(item).join("")}</div></div>`
      : `<div class="v3-pl-lane" data-galane="${E(k)}">${head}<div class="v3-pl-rows" style="width:${nDays * dayPx}px">${list.map(item).join("")}</div></div>`;
  };
  return `${outside ? `<div class="v3-ga-out">${outside} ${outside === 1 ? "aktivitet" : "aktiviteter"} utanför det valda datumintervallet visas inte.</div>` : ""}
    <div class="v3-pl-board ${board ? "board" : "bars"}" data-w0="${w0i}" data-daypx="${dayPx}" style="--col:${colPx}px;--day:${dayPx}px;--head:${HEAD}px;width:${HEAD + nDays * dayPx}px">
      <div class="v3-pl-weeks"><div class="v3-pl-corner">${E(({ area: "Område", contractor: "Entreprenör", activity: "Aktivitet" })[P.groupBy] || "")}</div><div class="v3-pl-wk" style="grid-template-columns:repeat(${nWeeks}, ${colPx}px)">${weeks}</div></div>
      ${todayD >= 0 && todayD < nDays ? `<div class="v3-pl-today" style="left:${HEAD + (todayD + 0.5) * dayPx}px" title="${E(day)}"></div>` : ""}
      ${laneKeys.map(laneHtml).join("")}<svg class="v3-ga-arrows"></svg></div>`;
}
/* Pilar för beroendena (föregångare → efterföljare). */
function l3gaArrows(d) {
  const b = d.querySelector(".v3-pl-board"), svg = b && b.querySelector(".v3-ga-arrows");
  if (!svg) return;
  const br = b.getBoundingClientRect(), els = new Map([...b.querySelectorAll("[data-plk]")].map(el => [el.dataset.plk, el]));
  const acts = l3plActs(l3gaP().split), keyOfRow = new Map();
  acts.forEach(a => a.rows.forEach(r => keyOfRow.set(String(r.id), a.key)));
  let paths = "";
  acts.forEach(a => {
    const to = els.get(a.key); if (!to) return;
    new Set(a.deps.map(id => keyOfRow.get(String(id))).filter(k => k && k !== a.key)).forEach(pk => {
      const from = els.get(pk); if (!from) return;
      const r1 = from.getBoundingClientRect(), r2 = to.getBoundingClientRect();
      const x1 = r1.left - br.left + Math.min(r1.width, parseFloat(from.style.getPropertyValue("--real")) || r1.width), y1 = r1.top - br.top + r1.height / 2;
      const x2 = r2.left - br.left - 2, y2 = r2.top - br.top + r2.height / 2, h = Math.max(14, Math.min(60, Math.abs(x2 - x1) / 2));
      const hot = l3ga.chain && l3ga.chain.has(a.key) && l3ga.chain.has(pk);
      paths += `<path class="${hot ? "hot" : ""}" d="M${x1},${y1} C${x1 + h},${y1} ${x2 - h},${y2} ${x2},${y2}" marker-end="url(#v3GaArr)"/>`;
    });
  });
  svg.setAttribute("width", b.scrollWidth); svg.setAttribute("height", b.scrollHeight);
  svg.innerHTML = `<defs><marker id="v3GaArr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#64748b"/></marker></defs>${paths}`;
}

/* Listan (som Planerade objekt i 4D-planering): filter, grupper, Markera gruppen, Visa filtrerat i 3D. */
function l3gaListFilter(acts, lf) {
  const day = l3plDay();
  return acts.filter(a => {
    const ph = zonePhase(a.rows, day);
    const L = v => (Array.isArray(v) ? v : v ? [v] : []); // flera val (kryssrutor); äldre sparade val är en enda text
    if (L(lf.area).length && !L(lf.area).includes(a.area)) return false;
    if (L(lf.activity).length && !L(lf.activity).includes(a.name)) return false;
    if (L(lf.contractor).length && !L(lf.contractor).includes(a.contractor)) return false;
    if (lf.status && ph !== lf.status) return false;
    if (lf.within && !(a.start >= day && a.start <= l3gaAdd(day, Number(lf.within)))) return false;
    if (lf.hideDone && ph === "klar") return false;
    if (lf.onlyDone && ph !== "klar") return false;
    if (lf.today && !(a.start <= day && a.end >= day)) return false;
    if (lf.uncoupled && a.coupled) return false;
    return true;
  });
}
function l3gaListHtml(acts, P, allIn = null, noF = false) {
  const E = escHtml, lf = P.lf || {}, day = l3plDay(), all = allIn || l3plActs(P.split);
  const opts = (k, f) => [...new Set(all.map(f).filter(Boolean))].sort((x, y) => x.localeCompare(y, "sv", { numeric: true })).map(v => `<option value="${E(v)}" ${lf[k] === v ? "selected" : ""}>${E(v)}</option>`).join("");
  const list = l3gaListFilter(acts, lf);
  const sel1 = (k, ttl, optsHtml) => `<select data-galf="${k}" title="${ttl}" class="${lf[k] ? "set" : ""}"><option value="">${ttl}</option>${optsHtml}</select>`;
  const Lv = v => (Array.isArray(v) ? v : v ? [v] : []);
  const multi = (k, all1, many) => { const n = Lv(lf[k]).length; return `<button type="button" class="v3-fc-multi ${n ? "set" : ""}" data-galm="${k}" title="${n ? Lv(lf[k]).map(E).join(" · ") : all1}">${E(n === 0 ? all1 : n === 1 ? Lv(lf[k])[0] : `${n} ${many}`)} ▾</button>`; };
  const nF = Object.keys(lf).filter(k => Lv(lf[k]).length || (typeof lf[k] === "boolean" && lf[k])).length;
  const filtersHtml = () => `<div class="v3-ga-filters v3-ga-fc">
      <div class="v3-fc-r3">${multi("area", "Alla områden", "områden")}${multi("activity", "Alla aktiviteter", "aktiviteter")}${multi("contractor", "Alla entreprenörer", "entreprenörer")}</div>
      <div class="v3-fc-r2">${sel1("status", "Status", ["planerad", "pagaende", "forsenad", "klar", "pausad"].map(k => `<option value="${k}" ${lf.status === k ? "selected" : ""}>${E(PHASE_LABELS[k] || k)}</option>`).join(""))}${sel1("within", "Startar inom", [["7", "1 vecka"], ["14", "2 veckor"], ["28", "4 veckor"]].map(([v, t]) => `<option value="${v}" ${lf.within === v ? "selected" : ""}>${t}</option>`).join(""))}<button type="button" class="v3-fc-follow ${P.follow ? "on" : ""}" id="v3GaFollow" title="Följa tidplan: Tid-läget gäller bara det som filtren släpper igenom – de objekten dyker upp kronologiskt enligt tidplanen, allt annat döljs. Listan sorteras efter startdatum." aria-pressed="${!!P.follow}">⏱ Följa tidplan</button><button type="button" class="v3-fc-clr" id="v3GaClearF" title="Rensa filtren" ${nF ? "" : "disabled"}>✕${nF ? " " + nF : ""}</button></div>
      <div class="v3-fc-r4 v3-ga-fbtns"><button type="button" class="v3-primary" id="v3GaShow3d">Visa filtrerat i 3D</button><button type="button" id="v3GaShowCoupled">Visa alla kopplade</button><span>${list.length} av ${all.length}</span></div>
      <details class="v3-fc-more"><summary>Fler val</summary><div class="v3-ga-checks">${[["hideDone", "Dölj klara"], ["onlyDone", "Endast klara"], ["today", "Endast idag"], ["uncoupled", "Endast ej kopplade"]].map(([k, t]) => `<label><input type="checkbox" data-galc="${k}" ${lf[k] ? "checked" : ""} /> ${t}</label>`).join("")}</div></details>
    </div>`;
  if (noF === "only") return filtersHtml();
  const groups = new Map(); list.forEach(a => { const k = l3gaLaneKey(a, P.groupBy || "area"); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a); });
  const first = k => groups.get(k).reduce((m, a) => (a.start < m ? a.start : m), "9999");
  if (P.follow) groups.forEach(g => g.sort((x, y) => (x.start + x.end).localeCompare(y.start + y.end))); // Följa tidplan: kronologiskt
  const keys = [...groups.keys()].sort(P.follow ? (x, y) => first(x).localeCompare(first(y)) || x.localeCompare(y, "sv", { numeric: true }) : (x, y) => x.localeCompare(y, "sv", { numeric: true }));
  const chip = ph => `<span class="v3-ga-st" style="--st:${phaseColor(ph)}">${E(PHASE_LABELS[ph] || ph)}</span>`;
  const row = a => { const ph = zonePhase(a.rows, day), label = a.objs.length ? `${a.objs.slice(0, 3).join(", ")}${a.objs.length > 3 ? " +" + (a.objs.length - 3) : ""}: ${a.name}` : a.name;
    return `<div class="v3-ga-li" data-plk="${E(a.key)}" title="Klicka: markera i 3D · Dubbelklicka: redigera · Högerklicka: fler val">
      <div class="v3-ga-li-t"><b>${E(label)}</b>${a.coupled ? `<span class="v3-ga-lk">${L3GA_LINK}</span>` : `<span class="v3-ga-unc">◇ Ej kopplad</span>`}${a.temporary ? `<span class="v3-ga-tmp">⏱ Temporär</span>` : ""}</div>
      <div class="v3-ga-li-s">${E([a.area, a.contractor].filter(Boolean).join(" · "))}</div>
      <div class="v3-ga-li-s">${E(a.start)} → ${E(a.end)} · Framdrift ${a.progress} %${a.rows.length > 1 ? ` · ${a.rows.length} objekt` : ""}</div>
      <div class="v3-ga-li-r">${chip(ph)}</div><div class="v3-ga-li-pg"><span style="width:${a.progress}%;background:${phaseColor(ph)}"></span></div></div>`; };
  return `<div class="v3-ga-list">
    ${noF ? "" : filtersHtml()}
    ${keys.map(k => { const g = groups.get(k), open = l3ga.open.has("l:" + k);
      return `<div class="v3-ga-grp"><div class="v3-ga-grp-h"><button type="button" data-galopen="${E(k)}">${open ? "▼" : "▶"} ${E(k)} (${g.length})</button><button type="button" class="v3-ga-mark" data-gamark="${E(k)}">Markera gruppen</button></div>${open ? g.map(row).join("") : ""}</div>`; }).join("") || `<div class="v3-pal-hint">Inget matchar filtret.</div>`}
  </div>`;
}

/* Flervalslista med kryssrutor för Område/Aktivitet/Entreprenör (sök, Alla). Ändringarna sparas direkt i filtret och ritar om. */
function l3gaMultiPop(btn, key, A, rr) {
  const old = document.getElementById("v3GaMultiPop"); if (old) { const same = old.dataset.k === key; old.remove(); document.removeEventListener("pointerdown", l3gaMultiOff, true); if (same) return; }
  const E = escHtml, field = { area: a => a.area, activity: a => a.name, contractor: a => a.contractor }[key], title = { area: "område", activity: "aktivitet", contractor: "entreprenör" }[key];
  const pop = document.createElement("div"); pop.id = "v3GaMultiPop"; pop.className = "v3-gm-pop v3-ga-multipop"; pop.dataset.k = key;
  pop.innerHTML = `<input type="search" class="v3-ga-mq" placeholder="Sök ${title}…" /><div class="v3-ga-macts"><button type="button" data-ma="all">Alla (rensa)</button><button type="button" data-ma="match" class="hidden">Välj träffarna</button></div><div class="v3-ga-mlist"></div>`;
  document.body.appendChild(pop);
  const r = btn.getBoundingClientRect(); pop.style.left = `${Math.max(6, Math.min(r.left, innerWidth - 330))}px`; if (innerHeight - r.bottom < 260 && r.top > innerHeight - r.bottom) { pop.style.bottom = `${innerHeight - r.top + 4}px`; pop.style.maxHeight = `${Math.max(200, r.top - 16)}px`; } // ingen plats under: öppnas ovanför knappen
  else { pop.style.top = `${r.bottom + 4}px`; pop.style.maxHeight = `${Math.max(200, innerHeight - r.bottom - 16)}px`; }
  const cur = () => { const v = (l3gaP().lf || {})[key]; return new Set(Array.isArray(v) ? v : v ? [v] : []); };
  const options = () => [...new Set(A().map(field).filter(Boolean))].sort((x, y) => x.localeCompare(y, "sv", { numeric: true }));
  const q = pop.querySelector(".v3-ga-mq");
  const fill = () => { const f = q.value.trim().toLowerCase(), sel = cur(), opts = options().filter(o => !f || o.toLowerCase().includes(f)); pop.querySelector('[data-ma="match"]').classList.toggle("hidden", !f);
    pop.querySelector(".v3-ga-mlist").innerHTML = opts.map(o => `<label class="v3-ga-mrow" title="${E(o)}"><input type="checkbox" data-v="${E(o)}" ${sel.has(o) ? "checked" : ""} /><span>${E(o)}</span></label>`).join("") || `<div class="v3-pal-hint">Inga träffar.</div>`; };
  const put = set => { const lf = { ...(l3gaP().lf || {}) }; if (set.size) lf[key] = [...set]; else delete lf[key]; l3plSet("lf", lf); rr(); fill(); };
  q.oninput = fill;
  pop.querySelector(".v3-ga-macts").onclick = e => { const b = e.target.closest("[data-ma]"); if (!b) return; if (b.dataset.ma === "all") put(new Set()); else { const f = q.value.trim().toLowerCase(); put(new Set([...cur(), ...options().filter(o => o.toLowerCase().includes(f))])); } };
  pop.querySelector(".v3-ga-mlist").onchange = e => { const c = e.target.closest("input[data-v]"); if (!c) return; const s = cur(); if (c.checked) s.add(c.dataset.v); else s.delete(c.dataset.v); put(s); };
  ["pointerdown", "click", "keydown", "wheel"].forEach(t => pop.addEventListener(t, e => { e.stopPropagation(); if (t === "keydown" && e.key === "Escape") { pop.remove(); document.removeEventListener("pointerdown", l3gaMultiOff, true); } }));
  fill(); setTimeout(() => document.addEventListener("pointerdown", l3gaMultiOff, true), 0); q.focus();
}
function l3gaMultiOff(e) { const p = document.getElementById("v3GaMultiPop"); if (!p || p.contains(e.target) || e.target.closest("[data-galm]")) return; p.remove(); document.removeEventListener("pointerdown", l3gaMultiOff, true); }
function l3gaBind(d, rr = l3plDockRender, actsFn = null) {
  // rr: ritar om där innehållet visas (panelen nederst eller listan 4D-koppling i vänstermenyn).
  const P = l3gaP(), A = actsFn || (() => l3plActs(P.split)), set = (k, v) => { l3plSet(k, v); rr(); };
  const on = (sel, ev, fn) => d.querySelectorAll(sel).forEach(el => { el[ev] = e => fn(el, e); });
  if (d.id === "v3PlanDock" && typeof l3gmBind === "function") l3gmBind(d); // 3D-lägen, tidslinje m.m. (lagesplan-3dmode.js)
  on("[data-plview]", "onclick", b => set("view", b.dataset.plview));
  on("#v3GaGroup", "onchange", s => set("groupBy", s.value));
  on("#v3PlBy", "onchange", s => set("colorBy", s.value));
  on("#v3PlQ", "oninput", q => { l3plSet("q", q.value); const pos = q.selectionStart; rr(); const q2 = document.getElementById("v3PlQ"); if (q2) { q2.focus(); q2.setSelectionRange(pos, pos); } });
  on("#v3PlClose", "onclick", () => l3plDockToggle(false));
  on("#v3GaFull", "onclick", () => set("full", !P.full));
  on("#v3GaHide", "onclick", () => set("hideBtns", !P.hideBtns));
  on("#v3GaPrint", "onclick", () => l3gaPrint(d));
  on("#v3GaUndo", "onclick", () => l3gaUndo(false));
  on("#v3GaRedo", "onclick", () => l3gaUndo(true));
  on("[data-gaper]", "onclick", b => set("period", b.dataset.gaper));
  on("#v3GaApply", "onclick", () => { const f = d.querySelector("#v3GaFrom").value, t = d.querySelector("#v3GaTo").value; if (!f || !t || t < f) { l3Status("Välj ett intervall där Från ligger före Till.", true); return; } l3plSet("from", f); l3plSet("to", t); set("period", "custom"); });
  [["#v3GaOne", "oneLine"], ["#v3GaFullTxt", "fullText"], ["#v3GaArrows", "arrows"], ["#v3GaSplit", "split"], ["#v3GaEdit", "editable"], ["#v3GaBl", "baseline"]].forEach(([s, k]) => on(s, "onchange", c => set(k, c.checked)));
  on("#v3GaLanes", "onclick", b => l3gaLanePicker(b));
  on("#v3GaLanesAll", "onclick", () => set("hidden", (P.hidden || []).filter(k => !k.startsWith(P.groupBy + ":"))));
  on("[data-gafold]", "onclick", b => { const k = "c:" + b.dataset.gafold; l3ga.open.has(k) ? l3ga.open.delete(k) : l3ga.open.add(k); rr(); });
  on(".v3-pl-lane-h", "oncontextmenu", (h, e) => { e.preventDefault(); const k = h.closest("[data-galane]").dataset.galane; l3gaMenu(e, [[`Dölj ${k}`, () => set("hidden", [...new Set([...(P.hidden || []), P.groupBy + ":" + k])])], [`Visa bara ${k}`, () => set("hidden", [...(P.hidden || []).filter(x => !x.startsWith(P.groupBy + ":")), ...[...d.querySelectorAll("[data-galane]")].map(x => x.dataset.galane).filter(x => x !== k).map(x => P.groupBy + ":" + x)])]]); });
  on("[data-plweek]", "onclick", b => { $("dateInput").value = b.dataset.plweek; $("dateInput").dispatchEvent(new Event("change")); setTimeout(l3plDockRender, 50); });
  // Lappar, staplar och listrader.
  d.querySelectorAll("[data-plk]").forEach(el => {
    el.classList.toggle("v3-multisel", l3pl.multi && l3pl.multi.has(el.dataset.plk));
    el.onclick = e => { if (el._dragged) { el._dragged = false; return; } if (e.ctrlKey || e.metaKey) { e.preventDefault(); l3plSelectMulti(el.dataset.plk, P.split); return; } l3plSelect(el.dataset.plk, P.split); };
    // Excel-planeringens rader (nyckel "x…"): bara markera i 3D – de ändras i 4D-planering (skydd mot fel fil).
    const xls = /^x/.test(el.dataset.plk);
    el.ondblclick = e => { e.preventDefault(); if (xls) { l3Status("Excel-planeringen ändras i 4D-planering – här går den att markera i 3D.", true); return; } l3gaEdit(el.dataset.plk); };
    el.oncontextmenu = e => { e.preventDefault(); if (xls) { l3gaMenu(e, [["Markera i 3D", () => l3plSelect(el.dataset.plk, P.split)]]); return; } l3gaNoteMenu(e, el.dataset.plk); };
    if (P.editable && !el.classList.contains("v3-ga-li")) el.onpointerdown = e => l3gaDragStart(e, el, d);
  });
  // Listan.
  on("[data-galm]", "onclick", (b, e) => { e.stopPropagation(); l3gaMultiPop(b, b.dataset.galm, A, rr); });
  on("[data-galf]", "onchange", s => set("lf", { ...(P.lf || {}), [s.dataset.galf]: s.value }));
  on("[data-galc]", "onchange", c => set("lf", { ...(P.lf || {}), [c.dataset.galc]: c.checked }));
  on("#v3GaClearF", "onclick", () => set("lf", {}));
  on("#v3GaFollow", "onclick", () => { const v = !P.follow; l3plSet("follow", v); if (typeof l3gmSetMode === "function") l3gmSetMode(v ? "time" : "off", true); if (typeof l3Status === "function") l3Status(v ? "Följer tidplanen: bara det filtret släpper igenom visas, kronologiskt (Tid)." : "Följer inte tidplanen längre – hela modellen visas igen."); rr(); });
  on("[data-galopen]", "onclick", b => { const k = "l:" + b.dataset.galopen; l3ga.open.has(k) ? l3ga.open.delete(k) : l3ga.open.add(k); rr(); });
  on("[data-gamark]", "onclick", b => { const acts = l3gaListFilter(A(), P.lf || {}).filter(a => l3gaLaneKey(a, P.groupBy || "area") === b.dataset.gamark); l3gaSelectActs(acts, false, b.dataset.gamark); });
  on("#v3GaShow3d", "onclick", () => l3gaSelectActs(l3gaListFilter(A(), P.lf || {}), true, "Filtrerat"));
  on("#v3GaShowCoupled", "onclick", () => l3gaSelectActs(A().filter(a => a.coupled), true, "Alla kopplade"));
  // Höjden.
  const g = d.querySelector(".v3-pldock-grip");
  if (g) g.onpointerdown = e => {
    if (P.full) return;
    e.preventDefault(); const y0 = e.clientY, h0 = d.offsetHeight, host = document.getElementById("v3Canvas");
    const mv = ev => { d.style.height = Math.max(140, Math.min(host.clientHeight - 40, h0 + (y0 - ev.clientY))) + "px"; };
    const up = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); l3plSet("dockH", d.offsetHeight); if (typeof l3fsOn === "function" && l3fsOn()) l3fsRender(); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  };
}
/* Markera flera aktiviteters objekt i 3D (isolate: visa bara dem). */
function l3gaEnts(acts) {
  const guids = new Set(acts.flatMap(a => a.rows.map(r => String(r.object_id || ""))).filter(Boolean)), ents = [];
  if (typeof l3pEnts === "function") l3b.models.forEach(m => { const map = l3pEnts(m); guids.forEach(g => (map.get(g) || []).forEach(e => ents.push(e))); });
  return ents;
}
function l3gaSelectActs(acts, isolate, label) {
  const ents = l3gaEnts(acts);
  if (!ents.length) { l3Status(`${label}: inga av objekten finns i de inlästa modellerna.`, true); return; }
  l3bsSet(ents);
  if (isolate && typeof l3bsIsolate === "function") l3bsIsolate(); else if (typeof l3bsZoom === "function") l3bsZoom();
  l3Status(`${label}: ${ents.length} objekt ${isolate ? "visas (Visa alla – U – visar resten igen)" : "markerade"}.`);
}
function l3gaLanePicker(btn) {
  const P = l3gaP(), acts = l3plActs(P.split), keys = [...new Set(acts.map(a => l3gaLaneKey(a, P.groupBy)))].sort((x, y) => x.localeCompare(y, "sv", { numeric: true }));
  const hid = new Set(P.hidden || []);
  l3gaMenu({ clientX: btn.getBoundingClientRect().left, clientY: btn.getBoundingClientRect().bottom + 4 }, keys.map(k => [`${hid.has(P.groupBy + ":" + k) ? "☐" : "☑"} ${k}`, () => {
    const h = new Set(l3gaP().hidden || []), key = P.groupBy + ":" + k; h.has(key) ? h.delete(key) : h.add(key); l3plSet("hidden", [...h]); l3plDockRender();
  }, true]));
}
/* Enkel meny (högerklick m.m.). items: [[text, fn, keepOpen?]] */
function l3gaMenu(e, items) {
  let m = document.getElementById("v3GaMenu");
  if (!m) { m = document.createElement("div"); m.id = "v3GaMenu"; m.className = "v3-ga-menu"; document.body.appendChild(m); document.addEventListener("pointerdown", ev => { if (!ev.target.closest("#v3GaMenu")) m.classList.add("hidden"); }, true); }
  m.innerHTML = items.map(([t], i) => (t === "-" ? `<hr/>` : `<button type="button" data-i="${i}">${escHtml(t)}</button>`)).join("");
  m.classList.remove("hidden");
  m.style.left = Math.min(e.clientX, window.innerWidth - 300) + "px";
  m.style.top = Math.min(e.clientY, window.innerHeight - Math.min(420, items.length * 30 + 12)) + "px";
  m.querySelectorAll("[data-i]").forEach(b => { b.onclick = () => { const it = items[+b.dataset.i]; if (!it[2]) m.classList.add("hidden"); it[1](); if (it[2]) l3gaLanePicker(document.getElementById("v3GaLanes")); }; });
}
function l3gaNoteMenu(e, key) {
  const a = l3plActs(l3gaP().split).find(x => x.key === key); if (!a) return;
  const n = typeof l3bs !== "undefined" ? l3bs.sel.length : 0;
  l3gaMenu(e, [
    ["Markera i 3D", () => l3plSelect(key, l3gaP().split)],
    [n ? `Koppla de ${n} markerade 3D-objekten hit…` : "Koppla: markera 3D-objekt först", () => (n ? l3gaCouple(a) : l3Status("Markera objekten i 3D först (klick, ruta, Flera, en grupp …), högerklicka sedan på aktiviteten.", true))],
    ["Redigera…", () => l3gaEdit(key)],
    [l3ga.chain && l3ga.chain.has(key) ? "Dölj beroendekedjan" : "Visa beroendekedjan", () => { l3ga.chain = l3ga.chain && l3ga.chain.has(key) ? null : l3gaChain(key); l3plDockRender(); }],
  ]);
}
/* Kedjan av föregångare och efterföljare (aktivitetsnycklar). */
function l3gaChain(key) {
  const acts = l3plActs(l3gaP().split), keyOfRow = new Map(); acts.forEach(a => a.rows.forEach(r => keyOfRow.set(String(r.id), a.key)));
  const preds = new Map(acts.map(a => [a.key, new Set(a.deps.map(id => keyOfRow.get(String(id))).filter(Boolean))]));
  const succs = new Map(); preds.forEach((ps, k) => ps.forEach(p => { if (!succs.has(p)) succs.set(p, new Set()); succs.get(p).add(k); }));
  const out = new Set([key]);
  const walk = (k, m) => (m.get(k) || []).forEach(x => { if (!out.has(x)) { out.add(x); walk(x, m); } });
  walk(key, preds); walk(key, succs);
  return out;
}

/* ---- Redigera: dra, kanter, dubbelklick ------------------------------------------------------------ */
function l3gaDragStart(e, el, d) {
  if (e.button !== 0) return;
  const r = el.getBoundingClientRect(), x = e.clientX - r.left, board = el.closest(".v3-pl-board"), dayPx = Number(board.dataset.daypx) || 20;
  const realW = Math.min(r.width, parseFloat(el.style.getPropertyValue("--real")) || r.width);
  const mode = x < 8 ? "left" : Math.abs(x - realW) < 8 ? "right" : "move";
  const x0 = e.clientX; let delta = 0;
  el.setPointerCapture && el.setPointerCapture(e.pointerId);
  el.classList.add("drag");
  const mv = ev => {
    delta = Math.round((ev.clientX - x0) / dayPx);
    if (mode === "move") el.style.transform = `translateX(${delta * dayPx}px)`;
    else if (mode === "right") el.style.width = Math.max(dayPx, realW + delta * dayPx) + "px";
    else { el.style.transform = `translateX(${delta * dayPx}px)`; el.style.width = Math.max(dayPx, realW - delta * dayPx) + "px"; }
    if (delta) el._dragged = true;
  };
  const up = async ev => {
    el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
    el.classList.remove("drag");
    if (!delta) { el.style.transform = ""; el.style.width = ""; return; }
    const a = l3plActs(l3gaP().split).find(x => x.key === el.dataset.plk);
    const plan = a ? l3gaPlanFor(a, mode, delta, !ev.shiftKey) : null;
    const ok = plan && await l3gaCommit(plan, `${mode === "move" ? "Flytta" : mode === "left" ? "Ändra start för" : "Ändra slut för"} ${a.name}`);
    if (!ok) l3plDockRender();
  };
  el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
}
/* Ändringen som karta rad-id → { start_date, end_date } (med det som väntar på den, om withDeps). */
function l3gaPlanFor(a, mode, delta, withDeps) {
  const plan = new Map(), cur = r => plan.get(String(r.id)) || { start_date: r.start_date.slice(0, 10), end_date: r.end_date.slice(0, 10) };
  if (mode === "move") a.rows.forEach(r => { const c = cur(r); plan.set(String(r.id), { start_date: l3gaAdd(c.start_date, delta), end_date: l3gaAdd(c.end_date, delta) }); });
  else if (mode === "left") { const g = a.start; a.rows.filter(r => r.start_date.slice(0, 10) === g).forEach(r => { const c = cur(r); let s = l3gaAdd(c.start_date, delta); if (s > c.end_date) s = c.end_date; plan.set(String(r.id), { start_date: s, end_date: c.end_date }); }); }
  else { const g = a.end; a.rows.filter(r => r.end_date.slice(0, 10) === g).forEach(r => { const c = cur(r); let en = l3gaAdd(c.end_date, delta); if (en < c.start_date) en = c.start_date; plan.set(String(r.id), { start_date: c.start_date, end_date: en }); }); }
  if (withDeps && mode !== "left") l3gaPush(new Set(a.rows.map(r => String(r.id))), plan);
  return plan;
}
/* Skjuter det som väntar på de flyttade (samma regler som dashboardens tavla: glapp hålls, överlapp behålls,
   aldrig bakåt utan glapp). */
function l3gaPush(targetIds, plan) {
  const rows = (l3pl.rows || []).filter(r => r.start_date && r.end_date), byId = new Map(rows.map(r => [String(r.id), r]));
  const groups = new Map(); rows.forEach(r => { const k = l3gaKeyOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
  const cur = r => plan.get(String(r.id)) || { start_date: r.start_date.slice(0, 10), end_date: r.end_date.slice(0, 10) };
  const lagOf = (m, pid) => { const v = m.dep_lags && m.dep_lags[String(pid)]; return v !== null && v !== "" && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : undefined; };
  for (let guard = 0; guard < 500; guard++) {
    let pushed = false; const done = new Set();
    for (const it of rows) {
      if (targetIds.has(String(it.id)) || done.has(String(it.id))) continue;
      const members = groups.get(l3gaKeyOf(it)).filter(m => !targetIds.has(String(m.id)));
      members.forEach(m => done.add(String(m.id)));
      let need = 0, lagNeed = null, plainMoved = false, floor = -Infinity;
      members.forEach(m => (Array.isArray(m.depends_on) ? m.depends_on : []).forEach(pid => {
        const p = byId.get(String(pid)); if (!p) return;
        const inPlan = plan.has(String(pid)), newEnd = cur(p).end_date, oldEnd = p.end_date.slice(0, 10), curStart = cur(m).start_date, ms = m.start_date.slice(0, 10), lag = lagOf(m, pid);
        if (lag !== undefined) { if (!inPlan || newEnd === oldEnd) return; const dd = l3gaDays(curStart, l3gaAdd(newEnd, 1 + lag)); lagNeed = lagNeed === null ? dd : Math.max(lagNeed, dd); return; }
        if (oldEnd < ms) floor = Math.max(floor, l3gaDays(curStart, l3gaAdd(newEnd, 1)));
        if (!inPlan || newEnd <= oldEnd) return;
        const target = oldEnd >= ms ? l3gaAdd(ms, l3gaDays(oldEnd, newEnd)) : l3gaAdd(newEnd, 1);
        need = Math.max(need, l3gaDays(curStart, target)); plainMoved = true;
      }));
      if (lagNeed !== null) need = Math.max(plainMoved ? need : -Infinity, lagNeed, floor);
      if (need && Number.isFinite(need)) { members.forEach(m => { const c = cur(m); plan.set(String(m.id), { start_date: l3gaAdd(c.start_date, need), end_date: l3gaAdd(c.end_date, need) }); }); pushed = true; }
    }
    if (!pushed) break;
  }
  return plan;
}
/* Dubbelklick: namn, datum och framdrift – samma fält som i dashboardens redigeringsdialog (Victor 2026-10-13: "Dom ska
   vara exakt lika"): Temporär, Rivning, Egen färg efter slut och Objekt i aktiviteten (✕ tar bort ett objekt). */
function l3gaEdit(key) {
  const a = l3plActs(l3gaP().split).find(x => x.key === key); if (!a) return;
  const E = escHtml, w = document.createElement("div");
  const members = a.rows.slice();
  // Filmen använder alltid aktiviteterna ihopslagna (en per aktivitet) – nyckeln är den även när Gantten visar en lapp per objekt.
  const fkey = ((l3plActs(false).find(x => x.rows.some(r => String(r.id) === String(a.rows[0].id)))) || a).key;
  const anim0 = ((((l3plPrefs().film || {}).anim) || {}).by || {})["k:" + fkey] || "";
  const temp0 = a.rows.some(r => r.temporary === true), demo0 = a.rows.some(r => r.demolition === true);
  const dm = a.rows.find(r => /^#[0-9a-f]{6}$/i.test(String(r.done_color || "")) || (r.done_opacity != null && r.done_opacity !== "" && Number.isFinite(Number(r.done_opacity))));
  const doneCol0 = dm && /^#[0-9a-f]{6}$/i.test(String(dm.done_color || "")) ? dm.done_color : "", doneOp0 = dm && dm.done_opacity != null && dm.done_opacity !== "" && Number.isFinite(Number(dm.done_opacity)) ? Math.max(0, Math.min(100, Number(dm.done_opacity))) : 30;
  w.className = "ui-dlg-wrap v3-ga-dlg-wrap";
  w.innerHTML = `<div class="ui-dlg v3-ga-dlg" role="dialog" aria-modal="true"><div class="ui-dlg-main">
    <div class="ui-dlg-title">Redigera aktiviteten</div>
    <div class="ui-dlg-body">${E([a.area, a.contractor, a.rows.length > 1 ? a.rows.length + " objekt" : a.objs[0] || ""].filter(Boolean).join(" · "))}</div>
    <label>Aktivitet<input type="text" data-f="name" value="${E(a.name)}" /></label>
    <div class="v3-ga-dlg-2"><label>Start<input type="date" data-f="start" value="${E(a.start)}" /></label><label>Slut<input type="date" data-f="end" value="${E(a.end)}" /></label></div>
    <label>Framdrift (%)<input type="number" min="0" max="100" data-f="progress" value="${a.progress}" /></label>
    <label title="Hur objekten visas i filmen (3D-editorns film). Standard = valet för alla aktiviteter under Film.">Animering i filmen<select data-f="anim"><option value="">Standard</option>${(typeof L3PL_ANIM !== "undefined" ? L3PL_ANIM : []).map(([k, t]) => `<option value="${k}" ${anim0 === k ? "selected" : ""}>${E(t)}</option>`).join("")}</select></label>
    ${a.rows.length > 1 ? `<details class="v3-ga-objs"><summary>Objekt i aktiviteten <span class="v3-pal-hint v3-ga-objs-n">(${a.rows.length})</span></summary><div class="v3-ga-objs-list"></div><div class="v3-pal-hint">✕ tar bort bara det objektet ur aktiviteten – aktiviteten och de andra objekten finns kvar.</div></details>` : ""}
    <details class="v3-ga-adv"${temp0 || demo0 || doneCol0 ? " open" : ""}><summary>Avancerat (temporär, rivning, färg efter slut)</summary>
      <label class="v3-pl-chk" title="T.ex. en mobilkran, stämp eller tillfällig vägg: syns i 3D bara från start till slut och försvinner sedan"><input type="checkbox" data-f="temp" ${temp0 ? "checked" : ""} /> <span><b>Temporär</b> – syns i 3D bara mellan start och slut (t.ex. mobilkran)</span></label>
      <label class="v3-pl-chk v3-pl-sub2" title="Av = ingen bubbla med info för det här temporära objektet (t.ex. långvariga mobilkranar). Klickar du på objektet visas bubblan ändå."><input type="checkbox" data-f="tbub" ${a.rows.some(r => r.bubble_off === true) ? "" : "checked"} /> <span>Visa bubbla med info för det temporära objektet</span></label>
      <label class="v3-pl-chk" title="Rivning: objektet syns hela tiden före start, färgas som vanligt under aktiviteten och försvinner efter slut"><input type="checkbox" data-f="demo" ${demo0 ? "checked" : ""} /> <span><b>Rivning</b> – syns även före start, försvinner efter slut</span></label>
      <label class="v3-pl-chk" title="Efter slutdatum visas objektet i den här färgen och genomskinligheten i 3D-tidslinjen – så att man ser arbeten innanför färdiga delar"><input type="checkbox" data-f="donechk" ${doneCol0 || doneOp0 !== 30 ? "checked" : ""} /> <span><b>Egen färg efter slut</b> – <input type="color" data-f="donecol" value="${doneCol0 || "#3fb950"}" /> opacitet <input type="range" data-f="doneop" min="0" max="100" step="5" value="${doneOp0}" /> <b class="v3-ga-doneval">${doneOp0}</b> %</span></label>
    </details>
    <label class="v3-pl-chk"><input type="checkbox" data-f="deps" checked /> Flytta det som väntar på den</label>
    <div class="ui-dlg-btns"><button type="button" class="ui-dlg-cancel">Avbryt</button><button type="button" class="ui-dlg-ok primary">Fortsätt…</button></div></div></div>`;
  document.body.appendChild(w); requestAnimationFrame(() => w.classList.add("in"));
  const close = () => { w.classList.add("out"); setTimeout(() => w.remove(), 120); };
  const f = k => w.querySelector(`[data-f="${k}"]`);
  // Fönstret får aldrig hamna utanför bilden: höjden begränsas och resten rullar.
  const fit = () => { const m = w.querySelector(".ui-dlg-main"); if (m) { m.style.maxHeight = `${Math.max(240, window.innerHeight - 24)}px`; m.style.overflowY = "auto"; } };
  fit(); window.addEventListener("resize", fit); w.addEventListener("toggle", fit, true);
  f("doneop").oninput = e => { w.querySelector(".v3-ga-doneval").textContent = e.target.value; f("donechk").checked = true; };
  f("donecol").oninput = () => { f("donechk").checked = true; };
  f("temp").onchange = e => { if (e.target.checked) f("demo").checked = false; };
  f("demo").onchange = e => { if (e.target.checked) f("temp").checked = false; };
  const renderObjs = () => {
    const list = w.querySelector(".v3-ga-objs-list"); if (!list) return;
    if (members.length < 2) { const sec = w.querySelector(".v3-ga-objs"); if (sec) sec.remove(); return; }
    list.innerHTML = members.map(m => { const coupled = l3plRealObj(m); return `<div class="v3-ga-obj" data-mid="${E(String(m.id))}" title="${coupled ? "Klicka för att markera och zooma till objektet i 3D" : ""}"><span class="v3-ga-obj-name" title="${E(String(m.object_id || ""))}">${E(m.object_name || m.object_id || "Objekt")}${coupled ? ` <span class="v3-pal-hint">· ${E(String(m.object_id || "").slice(-6))} · 3D-kopplad</span>` : ""}</span><button type="button" class="v3-ga-obj-x" data-mid="${E(String(m.id))}" title="Ta bort objektet ur aktiviteten" aria-label="Ta bort objektet">✕</button></div>`; }).join("");
    w.querySelector(".v3-ga-objs-n").textContent = `(${members.length})`;
    const pick = m => { list.querySelectorAll(".v3-ga-obj").forEach(r => r.classList.toggle("on", r.dataset.mid === String(m.id))); const ents = l3plEntsOf({ rows: [m] }); if (ents.length) { l3bsSet(ents); if (typeof l3bsZoom === "function") l3bsZoom(); } else l3Status("Objektet finns inte i de inlästa modellerna.", true); };
    // Ctrl/Cmd-klick: välj flera objekt (Skift: ett område); ✕ (eller knappen) tar bort alla valda på en gång.
    const msel = new Set(); let lastI = -1;
    const bar = () => { let b = w.querySelector(".v3-ga-objs-bar"); if (!b) { b = document.createElement("div"); b.className = "v3-ga-objs-bar"; list.after(b); } b.innerHTML = msel.size ? `<span>${msel.size} valda</span><button type="button" class="v3-ga-objs-del">✕ Ta bort ${msel.size}</button><button type="button" class="v3-ga-objs-none">Avmarkera</button>` : ""; b.style.display = msel.size ? "" : "none";
      const d = b.querySelector(".v3-ga-objs-del"); if (d) d.onclick = () => removeSel(); const nn = b.querySelector(".v3-ga-objs-none"); if (nn) nn.onclick = () => { msel.clear(); paint(); }; };
    const paint = () => { list.querySelectorAll(".v3-ga-obj").forEach(r => r.classList.toggle("msel", msel.has(r.dataset.mid))); bar(); };
    const removeSel = async () => {
      const ms = members.filter(x => msel.has(String(x.id))); if (!ms.length) return;
      if (await l3gaRemoveRow(a, ms, members.length)) { ms.forEach(m => { const i = members.indexOf(m); if (i >= 0) members.splice(i, 1); }); msel.clear(); renderObjs(); }
    };
    const rowsEls = () => [...list.querySelectorAll(".v3-ga-obj")];
    rowsEls().forEach((row, i) => { row.onclick = e => {
      if (e.target.closest(".v3-ga-obj-x")) return;
      const id = row.dataset.mid, m = members.find(x => String(x.id) === id); if (!m) return;
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); if (msel.has(id)) msel.delete(id); else msel.add(id); lastI = i; paint(); const ms = members.filter(x => msel.has(String(x.id))), ents = l3plEntsOf({ rows: ms }); if (ents.length) l3bsSet(ents); return; }
      if (e.shiftKey && lastI >= 0) { e.preventDefault(); const [x0, x1] = [Math.min(lastI, i), Math.max(lastI, i)]; rowsEls().slice(x0, x1 + 1).forEach(r => msel.add(r.dataset.mid)); paint(); const ms = members.filter(x => msel.has(String(x.id))), ents = l3plEntsOf({ rows: ms }); if (ents.length) l3bsSet(ents); return; }
      msel.clear(); lastI = i; paint(); pick(m);
    }; });
    list.querySelectorAll(".v3-ga-obj-x").forEach(b => { b.onclick = async () => {
      const m = members.find(x => String(x.id) === b.dataset.mid); if (!m) return;
      if (msel.has(String(m.id)) && msel.size > 1) { removeSel(); return; } // ✕ på ett valt objekt: alla valda
      pick(m); // visa vilket objekt det gäller innan frågan
      if (await l3gaRemoveRow(a, m, members.length)) { const i = members.indexOf(m); if (i >= 0) members.splice(i, 1); msel.delete(String(m.id)); renderObjs(); }
    }; });
    paint();
  };
  renderObjs();
  // Markeras objekt i modellen markeras de i listan (och rullas fram) – så att man ser vilka i aktiviteten det gäller.
  { let last = ""; const keyOf = e => `${e.mesh && e.mesh.uuid}:${e.ri}`;
    const sync = () => {
      if (!w.isConnected) { clearInterval(iv); return; }
      const sel = new Set((typeof l3bs !== "undefined" ? l3bs.sel : []).map(keyOf)), sig = [...sel].sort().join("|"); if (sig === last) return; last = sig;
      const list = w.querySelector(".v3-ga-objs-list"); if (!list) return; let firstEl = null;
      list.querySelectorAll(".v3-ga-obj").forEach(r => { const m = members.find(x => String(x.id) === r.dataset.mid), hit = !!m && sel.size > 0 && l3plEntsOf({ rows: [m] }).some(e => sel.has(keyOf(e))); r.classList.toggle("on", hit); if (hit && !firstEl) firstEl = r; });
      if (firstEl) { const det = w.querySelector(".v3-ga-objs"); if (det && !det.open) det.open = true; firstEl.scrollIntoView({ block: "nearest" }); }
    };
    const iv = setInterval(sync, 250); w.addEventListener("remove", () => clearInterval(iv)); }
  w.querySelector(".ui-dlg-cancel").onclick = () => { window.removeEventListener("resize", fit); close(); };
  w.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape") { window.removeEventListener("resize", fit); close(); } });
  w.querySelector(".ui-dlg-ok").onclick = async () => {
    const name = f("name").value.trim(), s = f("start").value, en = f("end").value, pr = Math.max(0, Math.min(100, Math.round(Number(f("progress").value) || 0))), deps = f("deps").checked;
    if (!name || !s || !en || en < s) { l3Status("Fyll i namn och ett slutdatum som inte ligger före start.", true); return; }
    const temp = f("temp").checked, tbub = f("tbub").checked, demo = f("demo").checked, doneOn = f("donechk").checked, doneCol = f("donecol").value, doneOp = Number(f("doneop").value);
    window.removeEventListener("resize", fit);
    close();
    const rows = members;
    let plan = new Map();
    if (s !== a.start) plan = l3gaPlanFor(a, "move", l3gaDays(a.start, s), deps);
    if (en !== l3gaAdd(a.end, s !== a.start ? l3gaDays(a.start, s) : 0)) {
      const a2 = { ...a, rows: rows.map(r => ({ ...r, ...(plan.get(String(r.id)) || {}) })), start: s, end: l3gaAdd(a.end, l3gaDays(a.start, s)) };
      const p2 = l3gaPlanFor(a2, "right", l3gaDays(a2.end, en), deps);
      p2.forEach((v, k) => plan.set(k, v));
    }
    rows.forEach(r => {
      const c = { ...(plan.get(String(r.id)) || {}) };
      if (name !== a.name) c.activity = name;
      if (pr !== a.progress) c.progress = pr;
      if (temp !== (r.temporary === true)) c.temporary = temp;
      if (tbub === (r.bubble_off === true)) c.bubble_off = !tbub; // sparas bara när det ändras
      if (demo !== (r.demolition === true)) c.demolition = demo;
      const curCol = /^#[0-9a-f]{6}$/i.test(String(r.done_color || "")) ? r.done_color.toLowerCase() : null, curOp = r.done_opacity != null && r.done_opacity !== "" && Number.isFinite(Number(r.done_opacity)) ? Number(r.done_opacity) : null;
      if (doneOn) { if (curCol !== doneCol.toLowerCase()) c.done_color = doneCol; if (curOp !== doneOp) c.done_opacity = doneOp; }
      else { if (curCol !== null) c.done_color = null; if (curOp !== null) c.done_opacity = null; }
      if (Object.keys(c).length) plan.set(String(r.id), c);
    });
    // Animeringen i filmen är en inställning i webbläsaren (inte en rad i tidplanen): sparas på aktivitetens nyckel.
    const an = f("anim").value;
    if (an !== anim0) { const f0 = l3plPrefs().film || {}, A = f0.anim || {}, by = { ...(A.by || {}) }; if (an) by["k:" + fkey] = an; else delete by["k:" + fkey]; l3plSet("film", { ...f0, anim: { ...A, by } }); if (typeof l3fsAnimPreview === "function") l3fsAnimPreview(); if (!plan.size) { l3Status(`Animeringen för "${a.name}" sparad.`); if (typeof l3plRenderTab === "function") l3plRenderTab(); } }
    if (!plan.size) { if (an === anim0) l3Status("Inget ändrades."); return; }
    await l3gaCommit(plan, `Redigera ${a.name}`);
  };
}
/* Ta bort ETT objekt ur en aktivitet (✕ i redigeringsdialogen). Frågar först, kontrollerar att ingen annan hunnit ändra raden
   och kan ångras med Ångra. Aktiviteten och de andra objekten finns kvar. */
async function l3gaRemoveRow(a, mIn, n) {
  const ms = Array.isArray(mIn) ? mIn : [mIn], m = ms[0], many = ms.length > 1;
  if (ms.length >= n) { l3Status("Minst ett objekt måste vara kvar i aktiviteten – ta bort hela aktiviteten i stället.", true); return false; }
  if (l3ga.busy) { l3Status("Väntar på förra sparningen…", true); return false; }
  const nm = many ? `${ms.length} objekt` : (m.object_name || m.object_id || "objektet");
  const ok = await uiConfirm(`Ta bort "${nm}" ur aktiviteten "${a.name}"?\n\nAktiviteten finns kvar med de ${n - ms.length} andra objekten.${ms.some(x => l3plRealObj(x)) ? (many ? "\n⚠ Objektens 3D-kopplingar försvinner." : "\n⚠ Objektets 3D-koppling försvinner.") : ""}${many ? "\n\n" + ms.slice(0, 8).map(x => "• " + (x.object_name || x.object_id || "Objekt")).join("\n") + (ms.length > 8 ? `\n… och ${ms.length - 8} till` : "") : ""}\n⚠ ${many ? "Objekten kommer" : "Objektet kommer"} från Powerproject-filen och kommer tillbaka vid nästa import.\n\nRaden tas bort ur Powerproject-tidplanen i Trimble Connect-projektets 4D-planering – det syns för alla. Kan ångras här efteråt.`, { ok: many ? `Ta bort ${ms.length} objekt` : "Ta bort objektet" });
  if (!ok) { l3Status("Inget togs bort."); return false; }
  l3ga.busy = true;
  const key = "gasave";
  try {
    if (typeof busyProgress === "function") busyProgress(key, "Sparar i 4D-planeringen…", 0.3);
    const ids = new Set(ms.map(x => String(x.id)));
    const fresh = await ghReadJSON(token, l3gaPath("plan_items.json"), { fresh: true });
    const cur = Array.isArray(fresh) ? fresh : [];
    if (!ms.every(x => { const th = cur.find(r => String(r.id) === String(x.id)); return th && JSON.stringify(th) === JSON.stringify(x); })) {
      l3pl.rows = fresh; l3plRender();
      uiAlert("Inget togs bort – raden har ändrats eller tagits bort av någon annan sedan tidplanen lästes. Tidplanen är nu omläst – försök igen.");
      return false;
    }
    await ghWriteJSON(token, l3gaPath("plan_items.json"), arr => (Array.isArray(arr) ? arr : []).filter(r => !ids.has(String(r.id))), `Ta bort ${ms.length} objekt ur ${a.name} (3D-vyn)`);
    l3pl.rows = (l3pl.rows || []).filter(r => !ids.has(String(r.id)));
    if (typeof planSource !== "undefined" && planSource === "pp" && Array.isArray(items)) { items = items.filter(r => !ids.has(String(r.id))); if (typeof l3bRecolor === "function") l3bRecolor(); if (typeof l3BuildObjects === "function") l3BuildObjects(); if (typeof renderZones === "function") renderZones(); }
    l3ga.undo.push({ label: `Ta bort ${nm} ur ${a.name}`, removed: ms.map(x => ({ ...x })) }); if (l3ga.undo.length > 40) l3ga.undo.shift(); l3ga.redo = [];
    if (typeof bridgeOk === "function" && bridgeOk()) askOpener("planChanged", { source: "pp" }, 20000).catch(() => {});
    l3Status(`${nm} borttaget ur ${a.name}.`);
    l3plRender();
    return true;
  } catch (e) {
    uiAlert(`Kunde inte spara i 4D-planeringen: ${e.message}\n\nInget har ändrats.`);
    l3pl.rows = null; l3plLoad(true);
    return false;
  } finally { l3ga.busy = false; if (typeof busyProgress === "function") busyProgress(key, "", null); }
}
/* Ångra ett borttaget objekt: raden läggs tillbaka (om den inte redan finns). */
async function l3gaRestoreRows(rows) {
  if (l3ga.busy) return false;
  l3ga.busy = true;
  try {
    await ghWriteJSON(token, l3gaPath("plan_items.json"), arr => { const a = Array.isArray(arr) ? arr : []; const have = new Set(a.map(r => String(r.id))); return [...a, ...rows.filter(r => !have.has(String(r.id)))]; }, `Ångra borttagning (3D-vyn, ${rows.length} rad)`);
    l3pl.rows = null; await l3plLoad(true);
    if (typeof planSource !== "undefined" && planSource === "pp") { try { const fr = await ghReadJSON(token, dataPath("plan_items.json"), { fresh: true }); if (Array.isArray(fr)) { items = fr; if (typeof l3bRecolor === "function") l3bRecolor(); if (typeof renderZones === "function") renderZones(); } } catch (e) { /* uppdateras vid nästa läsning */ } }
    if (typeof bridgeOk === "function" && bridgeOk()) askOpener("planChanged", { source: "pp" }, 20000).catch(() => {});
    return true;
  } catch (e) { uiAlert(`Kunde inte ångra: ${e.message}`); return false; } finally { l3ga.busy = false; }
}

/* ---- Spara (med skydd) ---------------------------------------------------------------------------- */
const L3GA_FIELDS = { start_date: "start", end_date: "slut", activity: "namn", progress: "framdrift", temporary: "temporär", demolition: "rivning", done_color: "färg efter slut", done_opacity: "opacitet efter slut" };
const L3GA_GUARD = Object.keys(L3GA_FIELDS);
function l3gaDescribe(plan) {
  const byAct = new Map(), acts = l3plActs(false), keyOfRow = new Map(); acts.forEach(a => a.rows.forEach(r => keyOfRow.set(String(r.id), a)));
  plan.forEach((c, id) => { const a = keyOfRow.get(String(id)); if (a && !byAct.has(a.key)) byAct.set(a.key, { a, c }); });
  const lines = [...byAct.values()].slice(0, 6).map(({ a, c }) => {
    const parts = [];
    if (c.start_date || c.end_date) { const ns = a.rows.map(r => (plan.get(String(r.id)) || {}).start_date || r.start_date.slice(0, 10)).sort()[0], ne = a.rows.map(r => (plan.get(String(r.id)) || {}).end_date || r.end_date.slice(0, 10)).sort().pop(); parts.push(`${a.start} – ${a.end} → ${ns} – ${ne}`); }
    if (c.activity !== undefined) parts.push(`namn → "${c.activity}"`);
    if (c.progress !== undefined) parts.push(`framdrift ${a.progress} % → ${c.progress} %`);
    if (c.temporary !== undefined) parts.push(c.temporary ? "blir temporär" : "inte längre temporär");
    if (c.demolition !== undefined) parts.push(c.demolition ? "blir rivning" : "inte längre rivning");
    if (c.done_color !== undefined || c.done_opacity !== undefined) parts.push(c.done_color === null && c.done_opacity === null ? "egen färg efter slut tas bort" : `egen färg efter slut ${c.done_color || ""} ${c.done_opacity != null ? c.done_opacity + " %" : ""}`.trim());
    return `• ${a.name}${a.area ? " (" + a.area + ")" : ""}: ${parts.join(", ")}`;
  });
  return { n: byAct.size, rows: plan.size, text: lines.join("\n") + (byAct.size > 6 ? `\n… och ${byAct.size - 6} aktiviteter till` : "") };
}
async function l3gaCommit(plan, label, opts = {}) {
  if (l3ga.busy) { l3Status("Väntar på förra sparningen…", true); return false; }
  const desc = l3gaDescribe(plan);
  const ok = await uiConfirm(`${opts.undo ? "Ångra i 4D-planeringen?" : "Spara i 4D-planeringen?"}\n\n${label}\n${desc.text}\n\n${desc.n} ${desc.n === 1 ? "aktivitet" : "aktiviteter"} (${desc.rows} rader) ändras i Powerproject-tidplanen i Trimble Connect-projektets 4D-planering – det syns för alla i 4D-planering, dashboarden och 3D. Kan ångras här efteråt.`, { ok: opts.undo ? "Ångra och spara" : "Spara i 4D-planeringen" });
  if (!ok) { l3Status("Inget sparades."); return false; }
  l3ga.busy = true;
  const key = "gasave";
  try {
    if (typeof busyProgress === "function") busyProgress(key, "Sparar i 4D-planeringen…", 0.3);
    // Skydd: har någon annan ändrat samma rader sedan de lästes sparas inget.
    const fresh = await ghReadJSON(token, l3gaPath("plan_items.json"), { fresh: true });
    const fById = new Map((Array.isArray(fresh) ? fresh : []).map(r => [String(r.id), r]));
    const changed = [...plan.keys()].filter(id => { const mine = l3gaRow(id), theirs = fById.get(id); return !theirs || !mine || L3GA_GUARD.some(k => String(theirs[k] ?? "") !== String(mine[k] ?? "")); });
    if (changed.length) {
      l3pl.rows = fresh; l3plRender();
      uiAlert(`Inget sparades – någon annan har ändrat ${changed.length === 1 ? "aktiviteten" : changed.length + " av raderna"} sedan tidplanen lästes. Tidplanen är nu omläst – försök igen.`);
      return false;
    }
    const before = new Map([...plan.keys()].map(id => { const r = l3gaRow(id), c = plan.get(id); return [id, Object.fromEntries(Object.keys(c).map(k => [k, k.endsWith("_date") ? String(r[k] || "").slice(0, 10) : r[k]]))]; }));
    const now = new Date().toISOString();
    await ghWriteJSON(token, l3gaPath("plan_items.json"), arr => (Array.isArray(arr) ? arr : []).map(r => { const c = plan.get(String(r.id)); return c ? { ...r, ...c, updated_at: now } : r; }), `${label} (3D-vyn, ${plan.size} rader)`);
    const dated = [...plan].filter(([, c]) => c.start_date || c.end_date);
    if (dated.length) {
      try { await ghWriteJSON(token, l3gaPath("plan_item_baseline_history.json"), arr => { const add = dated.map(([id, c]) => ({ id: ghNewId(), plan_item_id: id, project_id: projectId, start_date: c.start_date || l3gaRow(id).start_date, end_date: c.end_date || l3gaRow(id).end_date, recorded_at: now })), cur = Array.isArray(arr) ? arr : []; return typeof histAppendMerged === "function" ? histAppendMerged(cur, add) : [...cur, ...add]; }, "Logga baseline-historik (omplanering i 3D-vyn)"); }
      catch (e) { console.warn("Baseline-historik", e); }
    }
    // Lokalt: tidplanen här, planeringen i lägesplanen (om Powerproject är vald) och 3D-färgerna.
    (l3pl.rows || []).forEach(r => { const c = plan.get(String(r.id)); if (c) Object.assign(r, c, { updated_at: now }); });
    if (typeof planSource !== "undefined" && planSource === "pp" && Array.isArray(items)) {
      items.forEach(r => { const c = plan.get(String(r.id)); if (c) Object.assign(r, c, { updated_at: now }); });
      if (typeof l3bRecolor === "function") l3bRecolor(); if (typeof l3BuildObjects === "function") l3BuildObjects(); if (typeof renderZones === "function") renderZones();
    }
    if (!opts.undo) { l3ga.undo.push({ label, before, after: plan }); if (l3ga.undo.length > 40) l3ga.undo.shift(); l3ga.redo = []; }
    // 4D-planering i TC läser om (om den är öppen).
    if (typeof bridgeOk === "function" && bridgeOk()) askOpener("planChanged", { source: "pp" }, 20000).catch(() => {});
    l3Status(`Sparat i 4D-planeringen: ${label} (${desc.n} ${desc.n === 1 ? "aktivitet" : "aktiviteter"}).`);
    l3plRender();
    return true;
  } catch (e) {
    uiAlert(`Kunde inte spara i 4D-planeringen: ${e.message}\n\nInget har ändrats.`);
    l3pl.rows = null; l3plLoad(true);
    return false;
  } finally { l3ga.busy = false; if (typeof busyProgress === "function") busyProgress(key, "", null); }
}
async function l3gaUndo(redo) {
  const from = redo ? l3ga.redo : l3ga.undo, to = redo ? l3ga.undo : l3ga.redo, st = from[from.length - 1];
  if (!st) return;
  if (st.removed) { // borttaget objekt: ångra = lägg tillbaka raden, gör om = ta bort igen
    if (redo) { const ids = new Set(st.removed.map(r => String(r.id))); if (!(await uiConfirm(`Ta bort objektet igen?\n\n${st.label}`, { ok: "Ta bort" }))) return; l3ga.busy = true; try { await ghWriteJSON(token, l3gaPath("plan_items.json"), arr => (Array.isArray(arr) ? arr : []).filter(r => !ids.has(String(r.id))), `Gör om: ${st.label} (3D-vyn)`); l3pl.rows = null; await l3plLoad(true); from.pop(); to.push(st); l3plDockRender(); } catch (e) { uiAlert(`Kunde inte spara: ${e.message}`); } finally { l3ga.busy = false; } return; }
    if (!(await uiConfirm(`Lägg tillbaka objektet i 4D-planeringen?\n\n${st.label}`, { ok: "Ångra och spara" }))) return;
    if (await l3gaRestoreRows(st.removed)) { from.pop(); to.push(st); l3plDockRender(); }
    return;
  }
  const plan = redo ? st.after : st.before;
  if (await l3gaCommit(plan, `${redo ? "Gör om" : "Ångra"}: ${st.label}`, { undo: true })) { from.pop(); to.push(st); l3plDockRender(); }
}

/* ---- Koppla 3D-objekt till en aktivitet (görs av 4D-planering i TC) -------------------------------- */
/* Modellens id i Trimble Connect: samma som befintliga kopplingar till objekt i modellen, annars filens id. */
function l3gaTcModelId(m) {
  const map = typeof l3pEnts === "function" ? l3pEnts(m) : new Map(), cnt = new Map();
  [...(l3pl.rows || []), ...(Array.isArray(items) ? items : [])].forEach(r => { if (r.model_id && r.object_id && map.has(String(r.object_id))) cnt.set(r.model_id, (cnt.get(r.model_id) || 0) + 1); });
  if (cnt.size) return [...cnt].sort((x, y) => y[1] - x[1])[0][0];
  const w = m.src || {};
  return w.fileId || w.id || String(m.id || "").replace(/^f:/, "") || null;
}
async function l3gaCouple(a) {
  const sel = (typeof l3bs !== "undefined" ? l3bs.sel : []);
  const objs = [], seen = new Set();
  sel.forEach(e => { const u = e.mesh.userData.l3b, r = u.ranges[e.ri]; if (!r.guid || seen.has(r.guid) || e.mesh.userData.bcopy) return; seen.add(r.guid); objs.push({ modelId: l3gaTcModelId(u.model), objectId: r.guid, name: r.name }); });
  if (!objs.length) { l3Status("Inget av de markerade objekten kan kopplas (saknar IFC-id, eller är osparade kopior).", true); return; }
  const mine = new Set(a.rows.map(r => String(r.object_id || ""))), add = objs.filter(o => !mine.has(o.objectId)), already = objs.length - add.length;
  if (!add.length) { l3Status(`Alla ${objs.length} markerade objekt är redan kopplade till ${a.name}.`); return; }
  if (add.some(o => !o.modelId)) { uiAlert("Kunde inte avgöra vilken modell i Trimble Connect objekten hör till. Läs in modellen från Trimble Connect (Lager → Trimble Connect) och försök igen."); return; }
  if (typeof bridgeOk === "function" && !bridgeOk()) { uiAlert("Kopplingen görs av 4D-planering i Trimble Connect. Öppna lägesplanen med kartknappen i 4D-planering (på datorn) och försök igen."); return; }
  const elsewhere = new Map();
  (l3pl.rows || []).forEach(r => { if (r.object_id && add.some(o => o.objectId === String(r.object_id)) && l3gaKeyOf(r) !== a.key) elsewhere.set(String(r.object_id), String(r.activity || r.object_name || "")); });
  const others = [...new Set(elsewhere.values())];
  const ok = await uiConfirm(`Koppla ${add.length} objekt till ${a.name}?\n\n${a.area ? a.area + " · " : ""}${a.start} – ${a.end}${already ? `\n${already} av de markerade är redan kopplade hit och hoppas över.` : ""}${elsewhere.size ? `\n${elsewhere.size} av objekten är redan kopplade till ${others.slice(0, 3).join(", ")}${others.length > 3 ? " m.fl." : ""} – de kopplingarna finns kvar.` : ""}\n\nKopplingen sparas i 4D-planeringen (Powerproject) i Trimble Connect – samma som Koppla till markering i 4D-planering – och syns i TC, dashboarden och 3D.`, { ok: "Koppla och spara" });
  if (!ok) { l3Status("Inget kopplades."); return; }
  try {
    const r = await askOpener("coupleObjects", { source: "pp", itemId: a.rows[0].id, objs: add.map(o => ({ modelId: o.modelId, objectId: o.objectId })) }, 120000);
    if (r && r.failed) { uiAlert(`Kunde inte koppla: ${r.failed}`); return; }
    l3Status(`${add.length} objekt kopplade till ${a.name} i 4D-planeringen.`);
    l3pl.rows = null; await l3plLoad(true);
    if (typeof planSource !== "undefined" && planSource === "pp") {
      try { const fr = await ghReadJSON(token, dataPath("plan_items.json"), { fresh: true }); if (Array.isArray(fr)) { items = fr; if (typeof l3bRecolor === "function") l3bRecolor(); if (typeof renderZones === "function") renderZones(); } } catch (e) { /* färgerna uppdateras vid nästa läsning */ }
    }
    if (typeof l3RenderSide === "function") l3RenderSide();
  } catch (e) { uiAlert(`Kunde inte koppla: ${e.message}`); }
}
/* "Koppla" i markeringspanelen: välj aktivitet. */
async function l3gaCouplePick() {
  await l3plLoad();
  const acts = l3plActs(false), E = escHtml, w = document.createElement("div");
  w.className = "ui-dlg-wrap v3-ga-dlg-wrap";
  w.innerHTML = `<div class="ui-dlg v3-ga-dlg v3-ga-pick"><div class="ui-dlg-main"><div class="ui-dlg-title">Koppla ${l3bs.sel.length} markerade till en aktivitet</div>
    <div class="ui-dlg-body">Powerproject-tidplanen. Du får se vad som sparas innan något ändras.</div>
    <input type="search" class="v3-ga-pq" placeholder="Sök aktivitet, objekt, område…" /><div class="v3-ga-plist"></div>
    <div class="ui-dlg-btns"><button type="button" class="ui-dlg-cancel">Avbryt</button></div></div></div>`;
  document.body.appendChild(w); requestAnimationFrame(() => w.classList.add("in"));
  const close = () => { w.classList.add("out"); setTimeout(() => w.remove(), 120); };
  const draw = () => {
    const q = w.querySelector(".v3-ga-pq").value.toLowerCase(), day = l3plDay();
    const list = acts.filter(a => !q || `${a.name} ${a.objs.join(" ")} ${a.area} ${a.contractor}`.toLowerCase().includes(q)).slice(0, 200);
    w.querySelector(".v3-ga-plist").innerHTML = list.map(a => `<button type="button" data-k="${E(a.key)}"><i style="background:${phaseColor(zonePhase(a.rows, day))}"></i><span><b>${E(a.objs.length ? a.objs.slice(0, 2).join(", ") + ": " + a.name : a.name)}</b><small>${E([a.area, a.contractor, a.start + " – " + a.end].filter(Boolean).join(" · "))}</small></span></button>`).join("") || `<div class="v3-pal-hint">Inget matchar.</div>`;
    w.querySelectorAll("[data-k]").forEach(b => { b.onclick = () => { close(); l3gaCouple(acts.find(a => a.key === b.dataset.k)); }; });
  };
  w.querySelector(".v3-ga-pq").oninput = draw;
  w.querySelector(".ui-dlg-cancel").onclick = close;
  w.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape") close(); });
  draw(); w.querySelector(".v3-ga-pq").focus();
}

/* ---- Skriv ut ----------------------------------------------------------------------------------- */
function l3gaPrint(d) {
  const sc = d.querySelector(".v3-pl-scroll"); if (!sc) return;
  const css = [...document.querySelectorAll("style")].map(s => s.textContent).join("\n");
  const w = window.open("", "_blank");
  if (!w) { l3Status("Webbläsaren stoppade utskriftsfönstret – tillåt popup-fönster och försök igen.", true); return; }
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>4D-planering – ${escHtml(l3plDay())}</title><style>${css}
    @page { size: A3 landscape; margin: 10mm } body { margin: 0; background: #fff; } #view3d .v3-pl-scroll { overflow: visible !important; } #view3d { position: static !important; display: block !important; }
    #view3d .v3-pl-weeks, #view3d .v3-pl-corner, #view3d .v3-pl-lane-h { position: static !important; } .v3-ga-fbtns, .v3-ga-filters { display: none !important; }</style></head>
    <body><div id="view3d"><h3 style="font:600 15px system-ui;margin:8px 4px">4D-planering · Powerproject · ${escHtml(l3plDay())}</h3><div class="v3-pldock" style="position:static;height:auto;box-shadow:none">${sc.outerHTML}</div></div></body></html>`);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch (e) { /* stängt */ } }, 400);
}
