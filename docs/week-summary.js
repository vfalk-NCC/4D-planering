/* Veckosammanfattning (avancerat, test – Victor 2026-10-07: "lägg in detta som ett avancerat alt.
   så får jag testa"). En sammanfattning av veckan för byggmötet eller ett mejl, räknad helt ur
   planeringen (datum, framdrift, kopplingar med glapp och baseline) – ingen AI, inget skickas någonstans.

   En rad per aktivitet (objekten i samma aktivitet slås ihop). Statusen är den levande (mot dagens
   datum), veckan styr vad som räknas som "klart denna vecka" och "startar nästa vecka".
   Klick på en rad markerar aktiviteten i 3D och i listan. Kopiera (till mejl/Teams) och Skriv ut. */

const WS_DAY = 86400000;
const wsIso = d => d.toISOString().slice(0, 10);
const wsParse = s => new Date(s + "T00:00:00Z");
const wsAdd = (s, n) => wsIso(new Date(wsParse(s).getTime() + n * WS_DAY));
const wsDiff = (a, b) => Math.round((wsParse(b) - wsParse(a)) / WS_DAY); // b - a i dagar
const WS_MON = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const WS_WD = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];
const wsDay = s => { const d = wsParse(s); return `${d.getUTCDate()} ${WS_MON[d.getUTCMonth()]}`; };
const wsWd = s => { const d = wsParse(s); return `${WS_WD[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`; };
function wsMonday(s) { const d = wsParse(s); const wd = (d.getUTCDay() + 6) % 7; return wsAdd(s, -wd); }
function wsWeekNo(s) {
  const d = wsParse(s); const t = new Date(d); t.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t - y) / WS_DAY - 3 + ((y.getUTCDay() + 6) % 7)) / 7);
}
const wsPlural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const wsDays = n => wsPlural(Math.abs(n), "dag", "dagar");

/* Aktiviteterna (objekt i samma aktivitet ihopslagna). */
function wsActivities(list) {
  const byKey = new Map();
  list.forEach(it => {
    const k = it.groupId ? "g:" + it.groupId : it.sourceKey ? "s:" + it.sourceKey : "i:" + it.id;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(it);
  });
  const acts = [];
  const keyOfId = new Map();
  byKey.forEach((m, key) => {
    m.forEach(x => keyOfId.set(String(x.id), key));
    const starts = m.map(x => x.startDate).filter(Boolean).sort(), ends = m.map(x => x.endDate).filter(Boolean).sort();
    const st = m.every(x => x.status === "klar") ? "klar" : m.some(x => x.status === "forsenad") ? "forsenad" : m.some(x => x.status === "pagaende") ? "pagaende" : m.some(x => x.status === "pausad") ? "pausad" : (m[0].status || "planerad");
    const actEnds = m.map(x => x.actualEndDate).filter(Boolean).sort();
    acts.push({ key, members: m, name: m[0].objectName || m[0].activity || "Okänd aktivitet", area: m[0].area || "", contractor: m[0].contractor || "",
      start: starts[0] || null, end: ends[ends.length - 1] || null, status: st,
      progress: Math.round(m.reduce((s, x) => s + (Number(x.progress) || 0), 0) / m.length),
      actualEnd: st === "klar" && actEnds.length ? actEnds[actEnds.length - 1] : null, predIds: [...new Set(m.flatMap(x => (x.dependsOn || []).map(String)))], lags: Object.assign({}, ...m.map(x => x.depLags || {})) });
  });
  const byK = new Map(acts.map(a => [a.key, a]));
  acts.forEach(a => {
    const preds = new Map();
    a.predIds.forEach(id => { const k = keyOfId.get(id); if (k && k !== a.key && !preds.has(k)) preds.set(k, a.lags[id] !== undefined && a.lags[id] !== null && a.lags[id] !== "" ? Number(a.lags[id]) : 0); });
    a.preds = [...preds].map(([k, lag]) => ({ act: byK.get(k), lag }));
  });
  acts.forEach(a => { a.succs = []; });
  acts.forEach(a => a.preds.forEach(p => p.act.succs.push(a)));
  return acts;
}
function wsDownstream(a) {
  const seen = new Set(), stack = [...a.succs];
  while (stack.length) { const x = stack.pop(); if (seen.has(x.key) || x === a) continue; seen.add(x.key); stack.push(...x.succs); }
  return seen.size;
}

/**
 * Sammanfattningen för veckan som börjar weekStart (måndag).
 * opts: { today, area, contractor, blId, blGet(item, id) }
 */
function buildWeekSummary(list, weekStart, opts = {}) {
  const today = opts.today || wsIso(new Date());
  const ws = wsMonday(weekStart), we = wsAdd(ws, 6), ns = wsAdd(ws, 7), ne = wsAdd(ws, 13);
  const all = wsActivities(list);
  const inFilter = a => (!opts.area || a.area === opts.area || a.area.startsWith(opts.area + " / ")) && (!opts.contractor || a.contractor === opts.contractor);
  const acts = all.filter(inFilter);
  const within = (d, a, b) => d && d >= a && d <= b;

  const done = acts.filter(a => a.status === "klar" && within(a.actualEnd || a.end, ws, we)).map(a => {
    const fin = a.actualEnd || a.end, d = a.actualEnd && a.end ? wsDiff(a.end, a.actualEnd) : 0;
    return { a, fin, note: d < 0 ? `${wsDays(d)} före plan` : d > 0 ? `${wsDays(d)} efter plan` : "enligt plan", tone: d > 0 ? "late" : d < 0 ? "early" : "" };
  }).sort((x, y) => x.fin.localeCompare(y.fin));

  const late = acts.filter(a => a.status === "forsenad").map(a => {
    const notStarted = a.progress < 1 && a.start && a.start < today && !(a.end && a.end < today);
    const ds = wsDownstream(a);
    const firstSucc = a.succs.slice().sort((x, y) => String(x.start || "").localeCompare(String(y.start || "")))[0];
    return { a, label: notStarted ? "Skulle ha startat" : "Skulle vara klar", date: notStarted ? a.start : a.end, ds, firstSucc };
  }).sort((x, y) => y.ds - x.ds || String(x.date).localeCompare(String(y.date)));

  // Föregångare som inte hinner bli klara: försenade (slutdatumet gäller inte längre) eller som slutar för sent.
  const unfinishedPred = a => a.preds.filter(p => p.act.status !== "klar" && (p.act.status === "forsenad" || (p.act.end && wsAdd(p.act.end, 1 + p.lag) > a.start)));
  const next = acts.filter(a => within(a.start, ns, ne) && a.status !== "klar").sort((x, y) => x.start.localeCompare(y.start) || x.name.localeCompare(y.name, "sv"))
    .map(a => ({ a, waits: unfinishedPred(a) }));

  // Värt att hålla koll på.
  const watch = [];
  next.filter(x => x.waits.length).forEach(x => {
    const p = x.waits.sort((m, n) => (n.act.status === "forsenad") - (m.act.status === "forsenad") || String(n.act.end).localeCompare(String(m.act.end)))[0];
    watch.push({ a: x.a, html: `<b>${escapeHtml(x.a.name)}</b> startar ${escapeHtml(wsWd(x.a.start))}, men väntar på <i>${escapeHtml(p.act.name)}</i>${p.act.status === "forsenad" ? " som ligger efter" : ` som slutar ${escapeHtml(wsDay(p.act.end))}`}${p.lag ? ` (+ glapp ${p.lag > 0 ? "+" : "−"}${Math.abs(p.lag)} d)` : ""} → risk för förskjutning.`,
      text: `${x.a.name} startar ${wsWd(x.a.start)}, men väntar på ${p.act.name}${p.act.status === "forsenad" ? " som ligger efter" : ` som slutar ${wsDay(p.act.end)}`} → risk för förskjutning.` });
  });
  acts.filter(a => a.status === "pagaende" && a.start && a.end && a.end > a.start).forEach(a => {
    const time = Math.round(100 * Math.min(1, Math.max(0, wsDiff(a.start, today) / Math.max(1, wsDiff(a.start, a.end)))));
    if (time - a.progress >= 30) watch.push({ a, html: `<b>${escapeHtml(a.name)}</b>: ${a.progress} % klart men ${time} % av tiden har gått (slutar ${escapeHtml(wsDay(a.end))}).`, text: `${a.name}: ${a.progress} % klart men ${time} % av tiden har gått (slutar ${wsDay(a.end)}).`, gap: time - a.progress });
  });

  // Mot baseline.
  let bl = null;
  if (opts.blId && opts.blGet) {
    const withBl = acts.map(a => {
      const bs = a.members.map(m => opts.blGet(m, opts.blId)).filter(Boolean);
      if (!bs.length || !a.end) return null;
      const be = bs.map(b => b[1]).sort().pop();
      return { a, be, shift: wsDiff(be, a.end) };
    }).filter(Boolean);
    if (withBl.length) {
      const endNow = acts.map(a => a.end).filter(Boolean).sort().pop(), endBl = withBl.map(x => x.be).sort().pop();
      bl = { n: withBl.length, later: withBl.filter(x => x.shift > 0).length, earlier: withBl.filter(x => x.shift < 0).length,
        endNow, endBl, endShift: endNow && endBl ? wsDiff(endBl, endNow) : 0,
        top: withBl.filter(x => x.shift > 0 && x.a.status !== "klar").sort((x, y) => y.shift - x.shift).slice(0, 3) };
    }
  }
  return { ws, we, ns, ne, week: wsWeekNo(ws), today, total: acts.length, done, late, next, watch: watch.slice(0, 8),
    counts: { done: done.length, running: acts.filter(a => a.status === "pagaende").length, late: late.length, next: next.length }, bl };
}

/* ---- Visning ---- */
function weekSummaryHtml(S, meta = {}) {
  const e = escapeHtml, row = (a, inner) => `<li class="ws-row" data-ws-key="${e(a.key)}">${inner}</li>`;
  const more = (arr, n, fmt) => arr.slice(0, n).map(fmt).join("") + (arr.length > n ? `<li class="ws-more">… +${arr.length - n} till</li>` : "");
  const who = a => a.contractor ? ` <span class="ws-dim">· ${e(a.contractor)}</span>` : "";
  let h = `<div class="ws-doc">
    <div class="ws-title">📋 Vecka ${S.week} · ${e(wsDay(S.ws))}–${e(wsDay(S.we))} ${e(S.we.slice(0, 4))}${meta.project ? ` · ${e(meta.project)}` : ""}</div>
    <div class="ws-sub">Hämtad ${e(S.today)}${meta.filter ? ` · ${e(meta.filter)}` : ""}${S.bl ? ` · jämfört med baseline "${e(meta.blName || "Baseline")}"` : ""}</div>
    <div class="ws-chips"><span class="ws-chip done">✅ ${S.counts.done} klara</span><span class="ws-chip run">🔵 ${S.counts.running} pågår</span><span class="ws-chip late">🔴 ${S.counts.late} försenade</span><span class="ws-chip next">⏳ ${S.counts.next} startar nästa vecka</span></div>`;
  h += `<h4>✅ Klart denna vecka</h4>` + (S.done.length ? `<ul>${more(S.done, 12, x => row(x.a, `${e(x.a.name)}${who(x.a)} · <i class="ws-${x.tone || "ok"}">${e(x.note)}</i>`))}</ul>` : `<p class="ws-none">Inget klarmarkerat den här veckan.</p>`);
  h += `<h4>🔴 Försenat – behöver åtgärd</h4>` + (S.late.length ? `<table class="ws-table"><thead><tr><th>Aktivitet</th><th>Entreprenör</th><th>Datum</th><th>Framdrift</th><th>Påverkar</th></tr></thead><tbody>${S.late.slice(0, 15).map(x => `<tr class="ws-row" data-ws-key="${e(x.a.key)}"><td>${e(x.a.name)}</td><td>${e(x.a.contractor || "–")}</td><td>${e(x.label.toLowerCase())} ${e(wsDay(x.date))}</td><td>${x.a.progress} %</td><td>${x.ds ? `<b>${x.ds} akt.</b>${x.firstSucc ? ` <span class="ws-dim">bl.a. ${e(x.firstSucc.name)}</span>` : ""}` : "–"}</td></tr>`).join("")}</tbody></table>${S.late.length > 15 ? `<p class="ws-more">… +${S.late.length - 15} till</p>` : ""}` : `<p class="ws-none">Inget försenat. 👍</p>`);
  h += `<h4>⚠ Värt att hålla koll på</h4>` + (S.watch.length ? `<ul>${S.watch.map(w => row(w.a, w.html)).join("")}</ul>` : `<p class="ws-none">Inget särskilt.</p>`);
  h += `<h4>⏭ Startar nästa vecka (v.${wsWeekNo(S.ns)})</h4>` + (S.next.length ? `<ul>${more(S.next, 10, x => row(x.a, `${e(wsWd(x.a.start))} · ${e(x.a.name)}${who(x.a)}${x.waits.length ? ` · <span class="ws-late">⚠ väntar på ${e(x.waits[0].act.name)}</span>` : ""}`))}</ul>` : `<p class="ws-none">Inget startar nästa vecka.</p>`);
  if (S.bl) {
    const sh = S.bl.endShift;
    h += `<h4>📈 Mot baseline</h4><p>Sista aktiviteten slutar <b>${e(wsDay(S.bl.endNow))}</b> – ${sh ? `<b class="${sh > 0 ? "ws-late" : "ws-early"}">${wsDays(sh)} ${sh > 0 ? "efter" : "före"}</b>` : "<b>samma dag som</b>"} baseline (${e(wsDay(S.bl.endBl))}). ${S.bl.later} av ${S.bl.n} aktiviteter ligger senare än baseline${S.bl.earlier ? `, ${S.bl.earlier} tidigare` : ""}.</p>`
      + (S.bl.top.length ? `<ul>${S.bl.top.map(x => row(x.a, `${e(x.a.name)} <b class="ws-late">+${x.shift} d</b>`)).join("")}</ul>` : "");
  }
  return h + `</div>`;
}
function weekSummaryText(S, meta = {}) {
  const L = [];
  L.push(`Vecka ${S.week} · ${wsDay(S.ws)}–${wsDay(S.we)} ${S.we.slice(0, 4)}${meta.project ? ` · ${meta.project}` : ""}`);
  L.push(`${S.counts.done} klara · ${S.counts.running} pågår · ${S.counts.late} försenade · ${S.counts.next} startar nästa vecka`, "");
  L.push("KLART DENNA VECKA"); S.done.forEach(x => L.push(`- ${x.a.name}${x.a.contractor ? ` (${x.a.contractor})` : ""} – ${x.note}`)); if (!S.done.length) L.push("- Inget"); L.push("");
  L.push("FÖRSENAT – BEHÖVER ÅTGÄRD"); S.late.forEach(x => L.push(`- ${x.a.name}${x.a.contractor ? ` (${x.a.contractor})` : ""} – ${x.label.toLowerCase()} ${wsDay(x.date)}, ${x.a.progress} %${x.ds ? `, påverkar ${x.ds} akt.` : ""}`)); if (!S.late.length) L.push("- Inget"); L.push("");
  L.push("VÄRT ATT HÅLLA KOLL PÅ"); S.watch.forEach(w => L.push(`- ${w.text}`)); if (!S.watch.length) L.push("- Inget särskilt"); L.push("");
  L.push(`STARTAR NÄSTA VECKA (v.${wsWeekNo(S.ns)})`); S.next.forEach(x => L.push(`- ${wsWd(x.a.start)} ${x.a.name}${x.a.contractor ? ` (${x.a.contractor})` : ""}${x.waits.length ? ` – väntar på ${x.waits[0].act.name}` : ""}`)); if (!S.next.length) L.push("- Inget");
  if (S.bl) { L.push("", "MOT BASELINE", `Sista aktiviteten slutar ${wsDay(S.bl.endNow)} – ${S.bl.endShift ? `${wsDays(S.bl.endShift)} ${S.bl.endShift > 0 ? "efter" : "före"}` : "samma dag som"} baseline (${wsDay(S.bl.endBl)}).`); S.bl.top.forEach(x => L.push(`- ${x.a.name} +${x.shift} d`)); }
  return L.join("\n");
}
const WS_PRINT_CSS = `body{font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#111827;margin:24px}.ws-title{font-size:18px;font-weight:700}.ws-sub{color:#6b7280;font-size:12px;margin:2px 0 10px}
.ws-chips{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 4px}.ws-chip{border-radius:12px;padding:2px 10px;font-size:12px;font-weight:600;background:#f1f5f9}.ws-chip.done{background:#dcfce7}.ws-chip.run{background:#dbeafe}.ws-chip.late{background:#fee2e2}.ws-chip.next{background:#fef3c7}
h4{margin:16px 0 6px;font-size:14px;border-bottom:1px solid #e5e7eb;padding-bottom:3px}ul{margin:0;padding-left:18px}li{margin:2px 0}.ws-dim{color:#6b7280}.ws-none{color:#6b7280;font-style:italic;margin:2px 0}
.ws-late{color:#b42318}.ws-early{color:#047857}i.ws-late{color:#b42318}i.ws-early{color:#047857}i.ws-ok{color:#374151}.ws-more{color:#6b7280;font-style:italic;list-style:none}
.ws-table{border-collapse:collapse;width:100%;font-size:12px}.ws-table th{text-align:left;background:#f8fafc;font-weight:600}.ws-table th,.ws-table td{border-bottom:1px solid #e5e7eb;padding:4px 6px;vertical-align:top}`;

/* ---- Dialogen ---- */
let wsState = { week: null, area: "", contractor: "", blId: "main" };
async function openWeekSummary() {
  if (typeof ppLoadBaselineRegistry === "function" && (!ppBaselineRegistry || !ppBaselineRegistry.length)) { try { await ppLoadBaselineRegistry(); } catch (e) { /* utan namn */ } }
  let dlg = document.getElementById("weekSumDialog");
  if (!dlg) {
    dlg = document.createElement("div");
    dlg.id = "weekSumDialog";
    dlg.className = "dialog";
    dlg.innerHTML = `<div class="dialog-box ws-box">
      <div class="ws-head"><b>📋 Veckosammanfattning</b> <span class="ws-beta">test</span><button type="button" class="ws-x" title="Stäng">✕</button></div>
      <div class="ws-bar">
        <button type="button" class="ws-prev" title="Föregående vecka">‹</button><span class="ws-wk"></span><button type="button" class="ws-next" title="Nästa vecka">›</button><button type="button" class="ws-now">Denna vecka</button>
        <select class="ws-area" title="Område"></select><select class="ws-contr" title="Entreprenör"></select><select class="ws-bl" title="Baseline"></select>
      </div>
      <div class="ws-body"></div>
      <div class="ws-foot"><span class="hint">Räknas ur planeringen – inget skickas någonstans. Klicka på en rad för att markera den i 3D.</span><button type="button" class="ws-copy">Kopiera</button><button type="button" class="ws-print primary">Skriv ut / PDF</button></div>
    </div>`;
    document.body.appendChild(dlg);
    const q = c => dlg.querySelector(c);
    q(".ws-x").onclick = () => dlg.classList.add("hidden");
    dlg.addEventListener("click", ev => { if (ev.target === dlg) dlg.classList.add("hidden"); });
    document.addEventListener("keydown", ev => { if (ev.key === "Escape" && !dlg.classList.contains("hidden")) dlg.classList.add("hidden"); });
    q(".ws-prev").onclick = () => { wsState.week = wsAdd(wsState.week, -7); renderWeekSummary(); };
    q(".ws-next").onclick = () => { wsState.week = wsAdd(wsState.week, 7); renderWeekSummary(); };
    q(".ws-now").onclick = () => { wsState.week = wsMonday(wsIso(new Date())); renderWeekSummary(); };
    q(".ws-area").onchange = () => { wsState.area = q(".ws-area").value; renderWeekSummary(); };
    q(".ws-contr").onchange = () => { wsState.contractor = q(".ws-contr").value; renderWeekSummary(); };
    q(".ws-bl").onchange = () => { wsState.blId = q(".ws-bl").value; renderWeekSummary(); };
    q(".ws-copy").onclick = () => copyWeekSummary();
    q(".ws-print").onclick = () => printWeekSummary();
    q(".ws-body").addEventListener("click", ev => {
      const r = ev.target.closest("[data-ws-key]");
      if (!r || !dlg._S) return;
      const a = wsActivities(items).find(x => x.key === r.dataset.wsKey);
      if (!a) return;
      dlg.querySelectorAll(".ws-row.on").forEach(x => x.classList.remove("on"));
      r.classList.add("on");
      if (typeof selectItemsInModel === "function") selectItemsInModel(a.members).catch(e => { if (typeof showLagesplanBanner === "function") showLagesplanBanner(e.message, 5000); });
      if (typeof jumpToItemsInList === "function") { try { jumpToItemsInList(new Set(a.members.map(m => m.objectId))); } catch (e) { /* listan */ } }
    });
  }
  if (!wsState.week) wsState.week = wsMonday(wsIso(new Date()));
  try { wsState.project = (API && API.project && (await API.project.getProject()) || {}).name || ""; } catch (e) { wsState.project = ""; }
  dlg.classList.remove("hidden");
  renderWeekSummary();
}
function renderWeekSummary() {
  const dlg = document.getElementById("weekSumDialog");
  if (!dlg) return;
  const q = c => dlg.querySelector(c);
  const uniq = f => [...new Set(items.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, "sv", { numeric: true }));
  const areas = uniq(it => it.area);
  const opt = (v, t, sel) => `<option value="${escapeHtml(v)}"${v === sel ? " selected" : ""}>${escapeHtml(t)}</option>`;
  q(".ws-area").innerHTML = opt("", "Alla områden", wsState.area) + areas.map(a => opt(a, a, wsState.area)).join("");
  q(".ws-contr").innerHTML = opt("", "Alla entreprenörer", wsState.contractor) + uniq(it => it.contractor).map(c => opt(c, c, wsState.contractor)).join("");
  const blGet = typeof ppBlGet === "function" ? ppBlGet : (o, id) => (id === "main" && o.baselineStartDate && o.baselineEndDate ? [o.baselineStartDate, o.baselineEndDate] : null);
  const blIds = ["main", ...new Set(items.flatMap(it => Object.keys(it.baselines || {})))].filter(id => items.some(it => blGet(it, id)));
  const blName = id => (typeof ppBlName === "function" ? ppBlName(id) : id === "main" ? "Baseline" : id);
  if (!blIds.includes(wsState.blId)) wsState.blId = blIds[0] || "";
  q(".ws-bl").innerHTML = blIds.length ? blIds.map(id => opt(id, blName(id) === "Baseline" ? "Baseline" : `Baseline: ${blName(id)}`, wsState.blId)).join("") + opt("", "Ingen baseline", wsState.blId) : opt("", "Ingen baseline finns", "");
  const S = buildWeekSummary(items, wsState.week, { area: wsState.area, contractor: wsState.contractor, blId: wsState.blId, blGet });
  const meta = { project: wsState.project, filter: [wsState.area, wsState.contractor].filter(Boolean).join(" · "), blName: blName(wsState.blId) };
  dlg._S = S; dlg._meta = meta;
  q(".ws-wk").textContent = `v.${S.week} · ${wsDay(S.ws)}–${wsDay(S.we)}`;
  q(".ws-body").innerHTML = weekSummaryHtml(S, meta);
}
async function copyWeekSummary() {
  const dlg = document.getElementById("weekSumDialog");
  if (!dlg || !dlg._S) return;
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:13px">${weekSummaryHtml(dlg._S, dlg._meta)}</div>`, text = weekSummaryText(dlg._S, dlg._meta);
  const btn = dlg.querySelector(".ws-copy");
  try {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([`<style>${WS_PRINT_CSS}</style>` + html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
    else await navigator.clipboard.writeText(text);
    btn.textContent = "✓ Kopierad";
  } catch (e) {
    // Utan urklippsbehörighet (t.ex. i en ram): markera texten så att Ctrl+C fungerar.
    const r = document.createRange(); r.selectNodeContents(dlg.querySelector(".ws-body"));
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    btn.textContent = "Markerad – tryck Ctrl+C";
  }
  setTimeout(() => { btn.textContent = "Kopiera"; }, 2500);
}
function printWeekSummary() {
  const dlg = document.getElementById("weekSumDialog");
  if (!dlg || !dlg._S) return;
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(f);
  const d = f.contentDocument;
  d.open(); d.write(`<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>Vecka ${dlg._S.week}</title><style>${WS_PRINT_CSS}</style></head><body>${weekSummaryHtml(dlg._S, dlg._meta)}</body></html>`); d.close();
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { /* utskrift ej tillåten */ } setTimeout(() => f.remove(), 60000); }, 150);
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", () => {
  const b = document.getElementById("btnWeekSummary");
  if (b) b.onclick = () => { openWeekSummary(); };
});
if (typeof module !== "undefined") module.exports = { buildWeekSummary, weekSummaryText, wsActivities, wsWeekNo };
