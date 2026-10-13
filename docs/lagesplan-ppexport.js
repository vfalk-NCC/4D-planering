/* 3D-vyn – Export av aktiviteter till Powerproject. Samma fil och samma regler som i 4D-dashboardens Gantt (pp-export.js):
   byggstenarna (buildMspXml, mallen, beroenden) är oförändrade; här finns bara dialogen och omvandlingen av tidplanens rader.
   Ursprunglig text: Export av aktiviteter till Powerproject (Victor 2026-10-13): Microsoft Project-XML (MSPDI) som Powerproject kan importera
   (Import/Export → Importera från Microsoft Project®, XML). Områdets delar (delade på "/") blir sammanfattningsrader,
   aktiviteterna får start, slut, framdrift och "Väntar på" med glapp, och resurser (antal × timmar) kan följa med. */

const ppxEsc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
/* Arbetsdagar (mån–fre) mellan två datum, båda inräknade – minst 1. */
function ppxWorkdays(a, b) {
  const d0 = Date.parse(a + "T00:00:00Z"), d1 = Date.parse(b + "T00:00:00Z");
  let n = 0;
  for (let t = d0; t <= d1; t += 86400000) { const wd = new Date(t).getUTCDay(); if (wd !== 0 && wd !== 6) n++; }
  return Math.max(1, n);
}
const ppxDur = days => `PT${days * 8}H0M0S`;
const ppxHours = h => `PT${Math.max(0, Math.round(Number(h) * 100) / 100)}H0M0S`.replace(/(\.\d+)?H/, m => m);

/* En uppgift exakt som Powerproject själv skriver den i sin Microsoft Project-XML (samma fält, samma ordning, inga andra) –
   Powerprojects egen inläsning avvisade en fuller MSP-fil som "inte en giltig XML fil" (Victor 2026-10-13). */
function ppxTask(t) {
  return `<Task><UID>${t.uid}</UID><ID>${t.uid}</ID><Name>${ppxEsc(t.name)}</Name><Type>0</Type><IsNull>0</IsNull><WBS>${t.num}</WBS><OutlineNumber>${t.num}</OutlineNumber><OutlineLevel>${t.level}</OutlineLevel><Start>${t.start}</Start><Finish>${t.finish}</Finish><ManualStart>${t.start}</ManualStart><ManualFinish>${t.finish}</ManualFinish><Duration>${t.dur}</Duration><ManualDuration>${t.dur}</ManualDuration><DurationFormat>7</DurationFormat><Milestone>${t.milestone}</Milestone><Summary>${t.summary}</Summary><Critical>0</Critical><FixedCost>0</FixedCost><FixedCostAccrual>3</FixedCostAccrual><PercentComplete>${t.pct}</PercentComplete><ConstraintType>4</ConstraintType><CalendarUID>1</CalendarUID><ConstraintDate>${t.start}</ConstraintDate>${t.preds}${t.ext || ""}</Task>`;
}

/* acts: sammanslagna aktiviteter (som Gantten visar). opts: { project, resources }.
   Returnerar { xml, tasks, links, droppedLinks, resources }. */
function buildMspXml(acts, opts = {}) {
  const project = opts.project || "Nya aktiviteter från 4D";
  const list = acts.filter(a => a.startDate && (a.endDate || a.startDate));
  // Träd: områdets delar → sammanfattningsrader.
  const root = { name: project, kids: new Map(), acts: [], level: 0 };
  list.forEach(a => {
    const path = String(a.area || "").split("/").map(x => x.trim()).filter(Boolean);
    let node = root;
    (path.length ? path : ["Nya aktiviteter"]).forEach(seg => {
      if (!node.kids.has(seg)) node.kids.set(seg, { name: seg, kids: new Map(), acts: [], level: node.level + 1 });
      node = node.kids.get(seg);
    });
    node.acts.push(a);
  });
  // UID och disposition (1.2.3) i utskriftsordning.
  let uid = 0; const order = [], uidOfAct = new Map();
  const walk = (node, num) => {
    node.uid = uid++; node.num = num; order.push({ node });
    let c = 0;
    node.acts.forEach(a => { const u = uid++; uidOfAct.set(a, u); order.push({ act: a, uid: u, level: node.level + 1, num: (num ? num + "." : "") + (++c) }); });
    node.kids.forEach(k => walk(k, (num ? num + "." : "") + (++c)));
  };
  walk(root, "");
  // Alla id (även objekten i en sammanslagen aktivitet) → aktivitetens UID, för "Väntar på".
  const uidOfId = new Map();
  list.forEach(a => (a.members || [a]).forEach(m => uidOfId.set(String(m.id), uidOfAct.get(a))));
  const range = node => {
    const all = []; const rec = n => { n.acts.forEach(a => all.push(a)); n.kids.forEach(rec); }; rec(node);
    const s = all.map(a => a.startDate).sort(), e = all.map(a => a.endDate || a.startDate).sort();
    return { s: s[0], e: e[e.length - 1] };
  };
  const rootR0 = list.length ? list.map(a => a.startDate).sort()[0] : new Date().toISOString().slice(0, 10);
  const iso = (d, end) => `${d}T${end ? "16:00:00" : "08:00:00"}`;
  let links = 0, droppedLinks = 0;
  const taskXml = [];
  order.forEach(o => {
    if (o.node) {
      const n = o.node;
      if (n.level === 0) return; // projektraden skrivs inte (Powerproject skriver heller ingen)
      const r = range(n);
      const days = r.s ? ppxWorkdays(r.s, r.e) : 1;
      taskXml.push(ppxTask({ uid: n.uid, name: n.name, level: n.level, num: n.level === 0 ? "0" : n.num, start: iso(r.s || rootR0), finish: iso(r.e || rootR0, true), dur: ppxDur(days), summary: 1, milestone: 0, pct: 0, preds: "", ext: opts.extSummary || "" }));
    } else {
      const a = o.act, end = a.endDate || a.startDate, days = ppxWorkdays(a.startDate, end);
      const num = o.num;
      const milestone = a.startDate === end && a.activity === "Milstolpe";
      const preds = new Set(); let pl = "";
      (a.members || [a]).flatMap(m => (m.dependsOn || []).map(d => [m, String(d)])).forEach(([m, d]) => {
        const pu = uidOfId.get(d);
        if (pu === undefined) { droppedLinks++; return; }
        if (pu === o.uid || preds.has(pu)) return;
        preds.add(pu); links++;
        const lag = (m.depLags && m.depLags[d] !== undefined && m.depLags[d] !== null && m.depLags[d] !== "" ? Number(m.depLags[d]) : 0) || 0;
        pl += `<PredecessorLink><PredecessorUID>${pu}</PredecessorUID><Type>1</Type><CrossProject>0</CrossProject><LinkLag>${Math.round(lag * 4800)}</LinkLag><LagFormat>7</LagFormat></PredecessorLink>`;
      });
      taskXml.push(ppxTask({ uid: o.uid, name: a.objectName || a.activity || "Aktivitet", level: o.level, num, start: iso(a.startDate), finish: iso(end, true), dur: ppxDur(days), summary: 0, milestone: milestone ? 1 : 0, pct: Math.max(0, Math.min(100, Math.round(Number(a.progress) || 0))), preds: pl, ext: opts.extLeaf || "" }));
    }
  });
  // Resurser och tilldelningar.
  const resList = [], resUid = new Map(), assign = [], assignList = [];
  if (opts.resources !== false) list.forEach(a => {
    const rs = (a.members || [a]).map(m => m.resources).find(r => Array.isArray(r) && r.length) || [];
    rs.forEach(r => {
      if (!r || !r.name) return;
      if (!resUid.has(r.name)) { resUid.set(r.name, resList.length + 1); resList.push(r.name); }
      assignList.push({ task: uidOfAct.get(a), res: r.name, units: Number(r.qty) || 1, hours: r.hours });
      assign.push(`<Assignment><UID>${assign.length + 1}</UID><TaskUID>${uidOfAct.get(a)}</TaskUID><ResourceUID>${resUid.get(r.name)}</ResourceUID><Units>${Number(r.qty) || 1}</Units><Work>${ppxHours(r.hours)}</Work></Assignment>`);
    });
  });
  const rootR = range(root);
  const dayW = d => d === 1 || d === 7 ? `<WeekDay><DayType>${d}</DayType><DayWorking>0</DayWorking></WeekDay>` : `<WeekDay><DayType>${d}</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>16:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>`;
  const cal = `<Calendars><Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar><BaseCalendarUID>-1</BaseCalendarUID><WeekDays>${[1, 2, 3, 4, 5, 6, 7].map(dayW).join("")}</WeekDays></Calendar></Calendars>`;
  const hdr = `<Name>${ppxEsc(project)}</Name><Title>${ppxEsc(project)}</Title><Company></Company><Author></Author><ScheduleFromStart>1</ScheduleFromStart>${rootR.s ? `<StartDate>${iso(rootR.s)}</StartDate><FinishDate>${iso(rootR.e, true)}</FinishDate>` : ""}<FYStartDate>1</FYStartDate><CurrencyDigits>0</CurrencyDigits><CurrencySymbol>kr</CurrencySymbol><CurrencySymbolPosition>0</CurrencySymbolPosition><CalendarUID>1</CalendarUID><MinutesPerDay>480</MinutesPerDay><MinutesPerWeek>2400</MinutesPerWeek><DaysPerMonth>21</DaysPerMonth><DurationFormat>7</DurationFormat><WorkFormat>2</WorkFormat><FiscalYearStart>1</FiscalYearStart><WeekStartDay>1</WeekStartDay><ProjectExternallyEdited>0</ProjectExternallyEdited><ActualsInSync>0</ActualsInSync>`;
  const resXml = resList.length ? `<Resources>${resList.map((n, i) => `<Resource><UID>${i + 1}</UID><ID>${i + 1}</ID><Name>${ppxEsc(n)}</Name><Type>1</Type><MaxUnits>1</MaxUnits><StandardRateFormat>2</StandardRateFormat><Cost>0</Cost><OvertimeRateFormat>2</OvertimeRateFormat><IsCostResource>0</IsCostResource><AccrueAt>3</AccrueAt><CalendarUID>1</CalendarUID><IsGeneric>0</IsGeneric></Resource>`).join("")}</Resources><Assignments>${assign.join("")}</Assignments>` : "<Resources/><Assignments/>";
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project">${hdr}${cal}<Tasks>${taskXml.join("")}</Tasks>${resXml}</Project>`;
  return { xml, tasks: list.length, links, droppedLinks, resources: resList.length, taskXml: taskXml.join(""), assignList, rootR, hdrName: project };
}

/* Beroenden: hur många "Väntar på" som pekar på aktiviteter inom exporten (följer med) respektive utanför (kan inte följa med). */
function ppxLinkStats(acts) {
  const ids = new Set(); acts.forEach(a => (a.members || [a]).forEach(m => ids.add(String(m.id))));
  let inside = 0, outside = 0;
  acts.forEach(a => { const seen = new Set(); (a.members || [a]).forEach(m => (m.dependsOn || []).forEach(d => { d = String(d); if (own(a, d)) return; if (ids.has(d)) { if (!seen.has("i" + d)) { seen.add("i" + d); inside++; } } else if (!seen.has("o" + d)) { seen.add("o" + d); outside++; } })); });
  function own(a, d) { return (a.members || [a]).some(m => String(m.id) === d); }
  return { inside, outside };
}
/* Tar med aktiviteterna som de valda väntar på (så att kopplingarna kan följa med). Transitivt, högst 3 led. */
function ppxWithPredecessors(acts, all) {
  const byId = new Map(); all.forEach(a => (a.members || [a]).forEach(m => byId.set(String(m.id), a)));
  const set = new Set(acts); let frontier = [...acts];
  for (let lvl = 0; lvl < 3 && frontier.length; lvl++) {
    const next = [];
    frontier.forEach(a => (a.members || [a]).forEach(m => (m.dependsOn || []).forEach(d => { const p = byId.get(String(d)); if (p && !set.has(p) && p.startDate) { set.add(p); next.push(p); } })));
    frontier = next;
  }
  return [...set];
}

/* Mall från Powerproject (Victor 2026-10-13): Powerprojects inläsning godtog inte en egenbyggd fil men godtog en fil som
   Powerproject själv exporterat. Därför byggs filen på en sådan: allt utom uppgifterna (rubrik, kalendrar, egna fält, resurser)
   tas från mallen, och uppgifterna skrivs med samma extra fält som mallens egna uppgifter. Resurser kopplas på namn. */
function ppxTemplateInfo(tplXml) {
  const d = new DOMParser().parseFromString(tplXml, "application/xml");
  if (d.getElementsByTagName("parsererror").length || !d.getElementsByTagName("Tasks").length) return null;
  const ser = new XMLSerializer(), strip = x => x.replace(/ xmlns="[^"]*"/g, "");
  const tasks = [...d.getElementsByTagName("Task")];
  const extOf = t => t ? [...t.children].filter(c => c.tagName === "ExtendedAttribute").map(c => strip(ser.serializeToString(c)).replace(/<(\w+)\/>/g, "<$1></$1>")).join("") : "";
  const leaf = tasks.find(t => (t.getElementsByTagName("Summary")[0] || {}).textContent === "0"), sum = tasks.find(t => (t.getElementsByTagName("Summary")[0] || {}).textContent === "1");
  const res = new Map(); [...d.getElementsByTagName("Resource")].forEach(r => { const n = r.getElementsByTagName("Name")[0], u = r.getElementsByTagName("UID")[0]; if (n && u) res.set(n.textContent, u.textContent); });
  return { extLeaf: extOf(leaf || sum), extSummary: extOf(sum || leaf), resources: res };
}
function buildMspXmlFromTemplate(acts, tplXml, opts = {}) {
  const info = ppxTemplateInfo(tplXml);
  if (!info) return null;
  const r = buildMspXml(acts, { ...opts, extLeaf: info.extLeaf, extSummary: info.extSummary });
  const i0 = tplXml.indexOf("<Tasks>"), i1 = tplXml.indexOf("</Tasks>") + 8;
  if (i0 < 0 || i1 < 8) return null;
  let xml = tplXml.slice(0, i0) + `<Tasks>${r.taskXml}</Tasks>` + tplXml.slice(i1);
  // Uppgifternas datum och namn i rubriken.
  const iso = (d, end) => `${d}T${end ? "16:00:00" : "08:00:00"}`;
  if (r.rootR.s) {
    xml = xml.replace(/<StartDate>[^<]*<\/StartDate>/, `<StartDate>${iso(r.rootR.s)}</StartDate>`).replace(/<FinishDate>[^<]*<\/FinishDate>/, `<FinishDate>${iso(r.rootR.e, true)}</FinishDate>`);
  }
  // Tilldelningar: resurser som finns i mallen (på namn).
  let skipped = 0, n = 0; const ass = [];
  (opts.resources === false ? [] : r.assignList).forEach(a => {
    const ru = info.resources.get(a.res);
    if (ru === undefined) { skipped++; return; }
    ass.push(`<Assignment><UID>${++n}</UID><TaskUID>${a.task}</TaskUID><ResourceUID>${ru}</ResourceUID><Units>${a.units}</Units><Work>${ppxHours(a.hours)}</Work></Assignment>`);
  });
  xml = xml.replace(/<Assignments\/>|<Assignments>[\s\S]*?<\/Assignments>/, ass.length ? `<Assignments>${ass.join("")}</Assignments>` : "<Assignments/>");
  return { ...r, xml, skippedResources: skipped, assigned: ass.length, fromTemplate: true };
}

/* ---- 3D-vyns dialog och omvandling ---------------------------------------------------------------------- */
/* Tidplanens rader (snake_case) -> aktiviteter i dashboardens form, så att samma byggare kan användas. */
function l3gaPpActs(acts) {
  return acts.map(a => {
    const members = a.rows.map(r => ({ id: r.id, dependsOn: Array.isArray(r.depends_on) ? r.depends_on : [], depLags: r.dep_lags || {}, resources: r.resources, origin: r.origin, objectName: r.activity || r.object_name }));
    const ae = a.rows.map(r => (r.actual_end_date || "").slice(0, 10)).filter(Boolean).sort().pop();
    return { startDate: a.start, endDate: ae && ae > a.end ? ae : a.end, area: a.area === "(utan område)" ? "" : a.area, activity: a.name, objectName: a.name, progress: a.progress, origin: a.rows.every(r => r.origin === "manuell") ? "manuell" : "", members };
  }).filter(a => a.startDate);
}
function l3gaPpExport() {
  const P = l3gaP(), all = l3plActs(false), merged = l3gaPpActs(all);
  const toMerged = ks => l3gaPpActs(all.filter(a => ks.has(a.key)));
  const own = merged.filter(a => a.origin === "manuell");
  const markedKeys = new Set([...(l3pl.multi || [])]);
  const marked = toMerged(markedKeys);
  const q = String(P.q || "").toLowerCase(), hid = new Set((P.hidden || []).filter(k => k.startsWith(P.groupBy + ":")).map(k => k.slice(P.groupBy.length + 1)));
  const shownActs = l3plActs(P.split).filter(a => (!q || `${a.name} ${a.objs.join(" ")} ${a.area} ${a.contractor}`.toLowerCase().includes(q)) && !hid.has(l3gaLaneKey(a, P.groupBy)));
  const shown = l3gaPpActs(shownActs);
  const opts = [["own", "Egna aktiviteter (skapade här)", own], ["marked", "Markerade i schemat", marked], ["shown", "Alla som visas i schemat", shown], ["all", "Alla aktiviteter", merged]];
  const first = own.length ? "own" : marked.length ? "marked" : "shown";
  const w = document.createElement("div"); w.className = "ui-dlg-wrap v3-ga-dlg-wrap";
  w.innerHTML = `<div class="ui-dlg v3-ga-dlg" role="dialog" aria-modal="true"><div class="ui-dlg-main">
    <div class="ui-dlg-title">⇪ Exportera till Powerproject</div>
    <div class="ui-dlg-body">Skapar en Microsoft Project-XML-fil. Importera den i Powerproject: <b>Importera från Microsoft Project® (XML)</b>. Din Powerproject-fil och 4D-planeringen ändras inte – filen sparas på datorn.</div>
    <div class="ppx-opts">${opts.map(([k, l, a]) => `<label class="v3-pl-chk${a.length ? "" : " off"}"><input type="radio" name="ppxScope" value="${k}"${k === first && a.length ? " checked" : ""}${a.length ? "" : " disabled"} /> ${l} <span class="v3-pal-hint">${a.length} st</span></label>`).join("")}</div>
    <div class="ppx-tpl"><b>Mall från Powerproject</b> <span class="v3-pal-hint" id="ppxTplState"></span><br><input type="file" id="ppxTplFile" accept=".xml" /> <button type="button" id="ppxTplClear">Ta bort mall</button>
      <div class="v3-pal-hint">Exportera en liten tidplan från Powerproject (<i>Exportera till Microsoft Project® XML</i>) och välj den här. Filen byggs då på den, vilket Powerproject godtar. Sparas i din webbläsare.</div></div>
    <label class="v3-pl-chk"><input type="checkbox" id="ppxRes" /> <span>Med resurser (skapar nya resurser i Powerproject om namnen inte finns)</span></label>
    <label class="v3-pl-chk"><input type="checkbox" id="ppxPreds" /> <span>Ta med aktiviteterna de väntar på (så att kopplingarna följer med)</span></label>
    <div class="v3-pal-hint" id="ppxLinks"></div><div class="v3-pal-hint" id="ppxNote"></div>
    <div class="ui-dlg-btns"><button type="button" class="ui-dlg-cancel">Avbryt</button><button type="button" class="ui-dlg-ok primary ppx-go">Exportera</button></div></div></div>`;
  document.body.appendChild(w); requestAnimationFrame(() => w.classList.add("in"));
  const close = () => { w.classList.add("out"); setTimeout(() => w.remove(), 120); };
  const sel = s => w.querySelector(s);
  w.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape") close(); });
  const scopeActs = () => {
    const scope = (sel('input[name="ppxScope"]:checked') || {}).value;
    const acts = (opts.find(o => o[0] === scope) || [])[2] || [];
    return sel("#ppxPreds").checked ? ppxWithPredecessors(acts, merged) : acts;
  };
  const stats = () => { const a = scopeActs(), st = ppxLinkStats(a); sel("#ppxLinks").textContent = a.length ? `${a.length} aktiviteter · beroenden som följer med: ${st.inside}${st.outside ? ` · pekar utanför exporten: ${st.outside} (kryssa i rutan ovan för att ta med dem)` : ""}` : ""; };
  w.addEventListener("change", stats); stats();
  const tplKey = "4dplan-pp-template";
  const tplGet = () => { try { return JSON.parse(localStorage.getItem(tplKey) || "null"); } catch (e) { return null; } };
  const tplShow = () => { const t = tplGet() || window.__ppxTplTmp; sel("#ppxTplState").textContent = t ? `✓ ${t.name}` : "(ingen vald – enklare fil)"; };
  tplShow();
  sel("#ppxTplFile").onchange = async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const txt = await f.text();
    if (!ppxTemplateInfo(txt)) { sel("#ppxNote").textContent = "Det där är ingen Microsoft Project-XML med uppgifter – exportera från Powerproject och försök igen."; return; }
    try { localStorage.setItem(tplKey, JSON.stringify({ name: f.name, xml: txt })); } catch (x) { sel("#ppxNote").textContent = "Mallen är för stor för att sparas i webbläsaren – den används bara den här gången."; window.__ppxTplTmp = { name: f.name, xml: txt }; }
    tplShow();
  };
  sel("#ppxTplClear").onclick = () => { try { localStorage.removeItem(tplKey); } catch (e) { /* ingen lagring */ } window.__ppxTplTmp = null; tplShow(); };
  sel(".ui-dlg-cancel").onclick = close;
  sel(".ppx-go").onclick = () => {
    const acts = scopeActs();
    if (!acts.length) { sel("#ppxNote").textContent = "Inget att exportera i det valet."; return; }
    const day = todayIso(), tpl = tplGet() || window.__ppxTplTmp, ro = { project: `4D – ${day}`, resources: sel("#ppxRes").checked };
    const r = (tpl && buildMspXmlFromTemplate(acts, tpl.xml, ro)) || buildMspXml(acts, ro);
    downloadBlob(new Blob([r.xml], { type: "application/xml;charset=utf-8" }), `4D-aktiviteter ${day}.xml`);
    close();
    l3Status(`${r.tasks} aktiviteter exporterade${r.fromTemplate ? " (på din mall)" : " (utan mall)"}${r.skippedResources ? `, ${r.skippedResources} resurser saknas i mallen och hoppades över` : ""}${r.links ? `, ${r.links} kopplingar` : ""}${r.droppedLinks ? ` – ${r.droppedLinks} kopplingar till aktiviteter utanför exporten utelämnades` : ""}`);
  };
}
