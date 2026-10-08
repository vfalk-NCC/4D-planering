/* 4D-planering – import av Asta Powerproject (.pp) (Victors önskemål 2026-10-06).

   En .pp-fil är en SQLite-databas. Den läses direkt i webbläsaren med sql.js (vendor/sql-wasm.js,
   MIT) – inget skickas någonstans. Aktiviteterna (TASK) och milstolparna (MILESTONE) blir rader i
   Powerproject-planeringen (planSource "pp", egna filer i projects/<id>/pp/), med samma
   förhandsgranskning och sparning som Excel-importen:
   – namn, start/slut (beräknade datum), framdrift och verklig start/slut (avklarade delar),
   – område: valt kodbibliotek (t.ex. "3.5 Zoner"), annars sammanfattningsraden i tidplanen,
   – entreprenör: valt kodbibliotek (t.ex. "1. Utförs av"),
   – beroenden: länkarna mellan aktiviteterna,
   – nyckel: Powerprojects egna id – samma aktivitet känns igen vid nästa import och behåller
     sina 3D-kopplingar, kommentarer och markeringar.
   – baseline (Victors önskemål 2026-10-06: "kan den tidigare tändas upp som en baseline?"): vid
     importen väljs vad som blir baseline (baseline_start_date/baseline_end_date på raderna, som
     dashboarden visar som en grå stapel): förra importens datum, nuvarande baseline, en
     Powerproject-baseline (.ppb – Powerproject sparar sina baselines i en egen fil) eller ingen.
   Bara läsning: .pp-filen ändras aldrig. */

let ppParsed = null; // senast inlästa fil: { fileName, project, groups, libs, tasks, links }
let ppBaselineParsed = null; // vald baseline-fil (.ppb/.pp), samma form som ppParsed

let sqlJsPromise = null;
function loadSqlJs() {
  if (sqlJsPromise) return sqlJsPromise;
  sqlJsPromise = new Promise((resolve, reject) => {
    if (window.initSqlJs) return resolve(window.initSqlJs);
    const s = document.createElement("script");
    s.src = "vendor/sql-wasm.js";
    s.onload = () => resolve(window.initSqlJs);
    s.onerror = () => reject(new Error("Kunde inte ladda SQLite-läsaren (vendor/sql-wasm.js)"));
    document.head.appendChild(s);
  }).then(init => init({ locateFile: f => "vendor/" + f })).catch(e => { sqlJsPromise = null; throw e; });
  return sqlJsPromise;
}

const ppDate = v => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
const ppNum = v => { const m = /<([-\d.E+]+)>/i.exec(String(v || "")); return m ? Number(m[1]) || 0 : 0; };

/* Resurstilldelningar: aktivitets-id -> [{ name, qty, hours, start, end }]. Samma resurs två gånger på
   en aktivitet slås ihop (timmarna summeras, antalet är det största). */
function ppResources(q, has) {
  const out = new Map();
  if (!has("PERMANENT_SCHEDUL_ALLOCATION") || !has("PERMANENT_RESOURCE")) return out;
  const resName = new Map(q("SELECT ID, NAME FROM PERMANENT_RESOURCE").map(r => [r.ID, String(r.NAME || "").trim()]));
  // Tilldelningen pekar på en "färdighet" (PERM_RESOURCE_SKILL) vars PLAYER är resursen.
  const skill = has("PERM_RESOURCE_SKILL") ? new Map(q("SELECT ID, PLAYER, ROLE FROM PERM_RESOURCE_SKILL").map(r => [r.ID, r])) : new Map();
  const nameOf = id => resName.get(id) || (skill.has(id) ? resName.get(skill.get(id).PLAYER) || resName.get(skill.get(id).ROLE) : "") || "";
  const r1 = v => Math.round((Number(v) || 0) * 10) / 10;
  q("SELECT ALLOCATION_OF, ALLOCATED_TO, EFFORT, ALLOCATION, LINKABLE_START, LINKABLE_FINISH FROM PERMANENT_SCHEDUL_ALLOCATION").forEach(a => {
    const name = nameOf(a.ALLOCATION_OF);
    if (!name) return;
    const hours = (Number(a.EFFORT) || 0) / 3600, qty = Number(a.ALLOCATION) || 0;
    if (!(hours > 0) && !(qty > 0)) return;
    if (!out.has(a.ALLOCATED_TO)) out.set(a.ALLOCATED_TO, []);
    const list = out.get(a.ALLOCATED_TO), start = ppDate(a.LINKABLE_START), end = ppDate(a.LINKABLE_FINISH);
    const same = list.find(x => x.name === name);
    if (same) {
      same.hours = r1(same.hours + hours); same.qty = Math.max(same.qty, r1(qty));
      if (start && (!same.start || start < same.start)) same.start = start;
      if (end && (!same.end || end > same.end)) same.end = end;
    } else list.push({ name, qty: r1(qty), hours: r1(hours), start, end });
  });
  return out;
}

/* Läser .pp-filen (ArrayBuffer). Kastar ett begripligt fel om det inte är en Powerproject-fil. */
async function parsePowerproject(buf, fileName) {
  const SQL = await loadSqlJs();
  let db;
  try { db = new SQL.Database(new Uint8Array(buf)); } catch (e) { throw new Error("Filen gick inte att öppna som Powerproject-fil (.pp)."); }
  try {
    const q = (sql, params) => { const st = db.prepare(sql); if (params) st.bind(params); const out = []; while (st.step()) out.push(st.getAsObject()); st.free(); return out; };
    const has = t => q("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [t]).length > 0;
    const hasCol = (t, c) => q(`PRAGMA table_info(${t})`).some(r => r.name === c);
    if (!has("TASK") || !has("BAR") || !has("EXPANDED_TASK")) throw new Error("Det här ser inte ut som en Powerproject-fil (tabellerna TASK/BAR saknas).");
    const proj = has("PROJECT_SUMMARY") ? q("SELECT PROJECT_START, PROJECT_END, SHORT_NAME, LONG_NAME FROM PROJECT_SUMMARY")[0] || {} : {};
    // Hierarkin: aktivitet -> stapel (BAR) -> sammanfattningsrad (EXPANDED_TASK) -> dess stapel -> …
    const bars = new Map(q("SELECT ID, EXPANDED_TASK, NAME FROM BAR").map(r => [r.ID, r]));
    const exps = new Map(q("SELECT ID, NAME, BAR FROM EXPANDED_TASK").map(r => [r.ID, r]));
    const chainOf = barId => { // [{ kind, id, name }] uppifrån och ned, plus stapeln själv sist
      const out = [];
      let b = barId, guard = 0;
      while (bars.has(b) && guard++ < 50) {
        const bar = bars.get(b);
        out.unshift({ kind: "bar", id: b, name: bar.NAME || "" });
        const e = exps.get(bar.EXPANDED_TASK);
        if (!e) break;
        // En sammanfattningsrad utan eget namn visas i Powerproject med sin stapels namn
        // (t.ex. "7421 Förtjockardel") – samma här, annars hamnar aktiviteterna en nivå för högt.
        const own = bars.get(e.BAR);
        out.unshift({ kind: "exp", id: e.ID, name: (e.NAME || "").trim() || String((own && own.NAME) || "").trim() });
        b = e.BAR;
      }
      return out;
    };
    // Koder (kodbiblioteken): objekt-id -> { biblioteks-id: kodens namn }. Ärvs från stapel/sammanfattning.
    const libs = has("CODE_LIBRARY") ? q("SELECT ID, NAME FROM CODE_LIBRARY").map(r => ({ id: r.ID, name: String(r.NAME || "").trim(), count: 0 })) : [];
    const libById = new Map(libs.map(l => [l.id, l]));
    const entries = has("CODE_LIBRARY_ENTRY") ? new Map(q("SELECT ID, NAME, CODE_LIBRARY FROM CODE_LIBRARY_ENTRY").map(r => [r.ID, r])) : new Map();
    const codesOf = new Map();
    if (has("CODE_LIBRARY_ASSIGNABL_CODES")) q("SELECT CODES, ASSIGNED_TO FROM CODE_LIBRARY_ASSIGNABL_CODES").forEach(r => {
      const e = entries.get(r.ASSIGNED_TO);
      if (!e || !libById.has(e.CODE_LIBRARY)) return;
      if (!codesOf.has(r.CODES)) codesOf.set(r.CODES, {});
      codesOf.get(r.CODES)[e.CODE_LIBRARY] = String(e.NAME || "").trim();
    });
    const inherited = (ownId, chain) => {
      const out = {};
      [...chain.map(c => c.id), ownId].forEach(id => Object.assign(out, codesOf.get(id) || {}));
      return out;
    };
    // Framdrift: avklarade delar (TASK_COMPLETED_SECTION).
    const secs = new Map();
    if (has("TASK_COMPLETED_SECTION")) q("SELECT TASK, OVERALL_PERCENT_COMPLETE, ACTUAL_START, ACTUAL_END, DURATION FROM TASK_COMPLETED_SECTION").forEach(r => {
      if (!secs.has(r.TASK)) secs.set(r.TASK, []);
      secs.get(r.TASK).push(r);
    });
    const tasks = [];
    const add = (r, kind) => {
      const name = String(r.NAME || "").trim();
      if (!name || /^https?:\/\//i.test(name)) return;
      const start = ppDate(r.EARLY_START_DATE) || (kind === "ms" ? ppDate(r.GIVEN_DATE_TIME) : null);
      const end = kind === "ms" ? start : ppDate(r.EARLY_END_DATE_RS);
      if (!start || !end) return;
      const chain = chainOf(r.BAR), path = chain.filter(c => c.kind === "exp").map(c => c.name);
      const top = chain.find(c => c.kind === "exp");
      let progress = Math.round(Number(r.OVERALL_PERCENT_COMPLETE) || 0), aStart = null, aEnd = null;
      const ss = secs.get(r.ID) || [];
      if (ss.length) {
        const dur = ppNum(r.DURATION);
        const done = ss.reduce((a, x) => a + ppNum(x.DURATION) * (Number(x.OVERALL_PERCENT_COMPLETE) || 0) / 100, 0);
        const fromSecs = dur > 0 ? Math.round(Math.min(100, done / dur * 100)) : Math.round(Math.max(...ss.map(x => Number(x.OVERALL_PERCENT_COMPLETE) || 0)));
        progress = Math.max(progress, fromSecs);
        const started = ss.filter(x => (Number(x.OVERALL_PERCENT_COMPLETE) || 0) > 0);
        aStart = started.map(x => ppDate(x.ACTUAL_START)).filter(Boolean).sort()[0] || null;
        if (progress >= 100) aEnd = ss.map(x => ppDate(x.ACTUAL_END)).filter(Boolean).sort().pop() || null;
      }
      if (kind === "ms" && Number(r.COMPLETED)) { progress = 100; aEnd = aStart = start; }
      if (progress > 0 && !aStart) aStart = start;
      if (progress >= 100 && !aEnd) aEnd = end;
      const guid = /^\{?[0-9A-F-]{36}\}?$/i.test(String(r.GUID || "")) && !/^\{?[0-]+\}?$/.test(String(r.GUID)) ? String(r.GUID).toUpperCase() : null;
      tasks.push({ id: r.ID, uid: r.UNIQUE_TASK_ID || "", guid, name, kind, start, end, progress, actualStart: aStart, actualEnd: aEnd,
        path, top: top ? top.id : 0, topName: top ? top.name || "Tidplan" : "Tidplan", codes: inherited(r.ID, chain) });
    };
    const g = t => (hasCol(t, "GUID") ? ", GUID" : "");
    q(`SELECT ID, NAME, BAR, UNIQUE_TASK_ID, EARLY_START_DATE, EARLY_END_DATE_RS, OVERALL_PERCENT_COMPLETE, DURATION${g("TASK")} FROM TASK`).forEach(r => add(r, "task"));
    if (has("MILESTONE")) q(`SELECT ID, NAME, BAR, UNIQUE_TASK_ID, EARLY_START_DATE, GIVEN_DATE_TIME, COMPLETED${g("MILESTONE")} FROM MILESTONE`).forEach(r => add(r, "ms"));
    tasks.forEach(t => Object.keys(t.codes).forEach(l => { const lib = libById.get(Number(l)); if (lib) lib.count++; }));
    const links = has("LINK") ? q("SELECT START_TASK, END_TASK FROM LINK").map(r => [r.START_TASK, r.END_TASK]) : [];
    // Resurser (Victor 2026-10-08): tilldelningarna (PERMANENT_SCHEDUL_ALLOCATION) per aktivitet –
    // resursens namn, antal (ALLOCATION) och timmar (EFFORT är i sekunder: antal × varaktighet).
    const resOf = ppResources(q, has);
    tasks.forEach(t => { const r = resOf.get(t.id); if (r && r.length) t.resources = r; });
    // Delarna (översta sammanfattningsraderna). Förvalt: de som ligger inom projektets period.
    const pStart = ppDate(proj.PROJECT_START), pEnd = ppDate(proj.PROJECT_END);
    const groupMap = new Map();
    tasks.forEach(t => {
      if (!groupMap.has(t.top)) groupMap.set(t.top, { id: t.top, name: t.topName, count: 0, start: null, end: null });
      const g = groupMap.get(t.top); g.count++;
      if (!g.start || t.start < g.start) g.start = t.start;
      if (!g.end || t.end > g.end) g.end = t.end;
    });
    const groups = [...groupMap.values()].sort((a, b) => b.count - a.count);
    groups.forEach(g => { g.defaultOn = pStart && pEnd ? g.end >= pStart && g.start <= pEnd : true; });
    if (!groups.some(g => g.defaultOn) && groups[0]) groups[0].defaultOn = true;
    return { fileName, project: { name: String(proj.LONG_NAME || proj.SHORT_NAME || fileName || "").trim(), start: pStart, end: pEnd }, groups, libs: libs.filter(l => l.count), tasks, links };
  } finally { db.close(); }
}

/* Raderna i samma form som Excel-tolkningen (parsePlanWorkbookRows), så att förhandsgranskningen och
   sparningen är desamma. opts: { groups: Set(id), areaLib, contractorLib }. */
function ppToParsedItems(pp, opts) {
  const picked = pp.tasks.filter(t => opts.groups.has(t.top));
  const keyOf = t => `PP ${t.topName}||${t.id}`;
  const keyById = new Map(picked.map(t => [t.id, keyOf(t)]));
  const preds = new Map();
  pp.links.forEach(([from, to]) => {
    if (!keyById.has(from) || !keyById.has(to) || from === to) return;
    if (!preds.has(to)) preds.set(to, []);
    if (!preds.get(to).includes(keyById.get(from))) preds.get(to).push(keyById.get(from));
  });
  return picked.map(t => {
    const summary = t.path.length > 1 ? t.path.slice(1, 3).filter(Boolean).join(" / ") : (t.path[0] || "");
    const area = (opts.areaLib && t.codes[opts.areaLib]) || summary || t.topName;
    return {
      sourceKey: keyOf(t), area, objectName: t.name,
      activity: t.kind === "ms" ? "Milstolpe" : (t.path[t.path.length - 1] || t.name),
      elementType: null, code: null,
      startDate: t.start, endDate: t.end, baselineStartDate: null, baselineEndDate: null,
      actualStartDate: t.actualStart, actualEndDate: t.actualEnd, progress: t.progress,
      subActivities: [],
      // Entreprenören skrivs bara över när Powerproject har en (Victor 2026-10-08): saknas koden på
      // aktiviteten behålls den som fyllts i i 4D/dashboarden (undefined = rör inte).
      contractor: opts.contractorLib && t.codes[opts.contractorLib] ? t.codes[opts.contractorLib] : undefined,
      // Resurser bara när Powerproject har några på aktiviteten – annars behålls de som finns (undefined).
      resources: opts.resources !== false && t.resources && t.resources.length ? t.resources : undefined,
      dependsOnKeys: preds.get(t.id) || [], sheet: null, excelMap: null, id4d: null, ppId: t.id, ppUid: t.uid, ppGuid: t.guid,
    };
  });
}

/* ------------------------------------------------------------- panelen */
function ppOptionsFromUi() {
  const groups = new Set([...document.querySelectorAll("#ppOptions [data-ppg]")].filter(c => c.checked).map(c => Number(c.dataset.ppg)));
  const a = document.getElementById("ppAreaLib").value, c = document.getElementById("ppContractorLib").value;
  const r = document.getElementById("ppResources");
  return { groups, areaLib: a ? Number(a) : null, contractorLib: c ? Number(c) : null, resources: r ? r.checked : true };
}
/* Resurserna i de valda delarna (Victor 2026-10-08: "det står inget om resurser vid importfönstret"). */
function ppResourceSummary(pp, groups) {
  const tasks = pp.tasks.filter(t => groups.has(t.top) && t.resources && t.resources.length);
  const byName = new Map();
  let hours = 0;
  tasks.forEach(t => t.resources.forEach(r => { hours += Number(r.hours) || 0; byName.set(r.name, (byName.get(r.name) || 0) + (Number(r.hours) || 0)); }));
  const top = [...byName].sort((a, b) => b[1] - a[1]);
  return { tasks: tasks.length, hours, names: top.map(([n]) => n), top };
}
const ppOptsKey = () => `4dplan-pp-opts-${typeof projectId !== "undefined" ? projectId : ""}`;
function ppSavedOpts() {
  try { return JSON.parse(localStorage.getItem(ppOptsKey()) || "{}") || {}; } catch (e) { return {}; }
}
function renderPpOptions() {
  const box = document.getElementById("ppOptions");
  if (!box) return;
  if (!ppParsed) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  const pp = ppParsed, fmt = d => d ? d.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2 $1") : "–";
  const libOpts = (pick, none) => `<option value="">${none}</option>` + pp.libs.map(l => `<option value="${l.id}"${pick(l) ? " selected" : ""}>${escapeHtml(l.name)} (${l.count})</option>`).join("");
  // Förval (Victor 2026-10-06): alla delar, område = sammanfattningsraden, ingen entreprenör – och
  // därefter det som valdes senast i projektet. Baseline sköts i ett eget block (Baseline).
  const saved = ppSavedOpts();
  const areaDefault = saved.area ? pp.libs.find(l => l.name === saved.area) : null, contrDefault = saved.contr ? pp.libs.find(l => l.name === saved.contr) : null;
  const groupOn = g => !(saved.off || []).includes(g.name);
  const libName = id => { const l = pp.libs.find(x => String(x.id) === String(id)); return l ? l.name : ""; };
  box.innerHTML = `
    <div class="pp-head"><b>${escapeHtml(pp.project.name || pp.fileName)}</b> <span class="hint">${pp.tasks.length} aktiviteter · ${pp.links.length} länkar${pp.project.start ? ` · ${fmt(pp.project.start)} – ${fmt(pp.project.end)}` : ""}</span></div>
    <div class="pp-step"><span class="pp-n">1</span><div class="pp-step-body"><b>Delar</b>
      <div class="pp-groups">${pp.groups.map(g => `<label class="check pp-chip" title="${fmt(g.start)} – ${fmt(g.end)}"><input type="checkbox" data-ppg="${g.id}"${groupOn(g) ? " checked" : ""} /> ${escapeHtml(g.name)} <span class="hint">${g.count} st · ${fmt(g.start).slice(-4)}${fmt(g.end).slice(-4) !== fmt(g.start).slice(-4) ? "–" + fmt(g.end).slice(-4) : ""}</span></label>`).join("")}</div>
    </div></div>
    <div class="pp-step"><span class="pp-n">2</span><div class="pp-step-body"><b>Resurser</b>
      <div class="pp-groups"><label class="check pp-chip"><input type="checkbox" id="ppResources"${saved.res === false ? "" : " checked"} /> Ta med resurser <span class="hint">resurs, antal och timmar per aktivitet</span></label></div>
      <div class="hint" id="ppResSum"></div>
    </div></div>
    <details class="pp-more"><summary>Område: <b id="ppAreaSum"></b> · Entreprenör: <b id="ppContrSum"></b> <span class="hint">ändra</span></summary>
      <div class="pp-grid">
        <label class="pp-l" for="ppAreaLib">Område</label><select id="ppAreaLib">${libOpts(l => l === areaDefault, "Sammanfattningsraden i tidplanen")}</select>
        <label class="pp-l" for="ppContractorLib">Entreprenör</label><select id="ppContractorLib">${libOpts(l => l === contrDefault, "Ingen")}</select>
      </div>
      <p class="hint">Område: aktivitetens kod i biblioteket, annars sammanfattningsraden ovanför den.</p>
    </details>
    <div class="row"><button type="button" id="btnPpPreview" class="primary">Förhandsgranska importen</button><span class="hint">Inget sparas förrän du bekräftar.</span></div>`;
  const sums = () => {
    document.getElementById("ppAreaSum").textContent = libName(document.getElementById("ppAreaLib").value) || "sammanfattningsraden";
    document.getElementById("ppContrSum").textContent = libName(document.getElementById("ppContractorLib").value) || "ingen";
  };
  sums();
  const resSum = () => {
    const el = document.getElementById("ppResSum"), on = document.getElementById("ppResources").checked;
    const groups = new Set(pp.groups.filter(g => box.querySelector(`[data-ppg="${g.id}"]`).checked).map(g => g.id));
    const r = ppResourceSummary(pp, groups);
    el.innerHTML = !r.tasks ? "Inga resurser inlagda i Powerproject för de valda delarna – resurser som redan finns i 4D behålls."
      : `${on ? "" : "<b>Tas inte med</b> – "}${r.tasks} ${r.tasks === 1 ? "aktivitet" : "aktiviteter"} har resurser · ${Math.round(r.hours).toLocaleString("sv-SE")} timmar · ${r.names.length} ${r.names.length === 1 ? "resurs" : "resurser"}${r.names.length ? ` (${r.top.slice(0, 3).map(([n, h]) => `${escapeHtml(n)} ${Math.round(h).toLocaleString("sv-SE")} h`).join(", ")}${r.names.length > 3 ? " …" : ""})` : ""}.${on ? " Aktiviteter utan resurser i Powerproject behåller sina." : " Resurserna i 4D lämnas orörda."}`;
  };
  resSum();
  box.querySelectorAll("[data-ppg]").forEach(c => c.addEventListener("change", resSum));
  document.getElementById("ppResources").addEventListener("change", resSum);
  document.getElementById("ppAreaLib").onchange = sums;
  document.getElementById("ppContractorLib").onchange = sums;
  box.classList.remove("hidden");
  document.getElementById("btnPpPreview").onclick = () => ppPreview();
  const remember = () => {
    const off = pp.groups.filter(g => !box.querySelector(`[data-ppg="${g.id}"]`).checked).map(g => g.name);
    try { localStorage.setItem(ppOptsKey(), JSON.stringify({ off, area: libName(document.getElementById("ppAreaLib").value) || null, contr: libName(document.getElementById("ppContractorLib").value) || null, res: document.getElementById("ppResources").checked })); } catch (e) {}
  };
  box.querySelectorAll("[data-ppg]").forEach(c => { c.onchange = remember; });
  document.getElementById("ppAreaLib").addEventListener("change", remember);
  document.getElementById("ppResources").addEventListener("change", remember);
  document.getElementById("ppContractorLib").addEventListener("change", remember);
}
/* Namngivna baselines (Victor 2026-10-06: "en baseline som alltid ligger i grunden, Kontraktstidplanen
   … men tillkommer akt. vill man ha en baseline för dessa också"). Huvudbaselinen ("main") ligger i
   baseline_start_date/baseline_end_date (som förut, och som Excels Plan. start/slut); övriga i
   baselines: { id: [start, slut] } på raderna. Registret (plan_baselines.json) har namnen. */
const PP_BL_MAIN = "main";
let ppBaselineRegistry = []; // [{ id, name, source, mode, file, set_at, filled_at, by, created_at }]
function ppBlGet(o, id) {
  if (!o) return null;
  if (id === PP_BL_MAIN) return o.baselineStartDate && o.baselineEndDate ? [o.baselineStartDate, o.baselineEndDate] : null;
  const v = o.baselines && o.baselines[id];
  return Array.isArray(v) && v[0] && v[1] ? v : null;
}
function ppBlSet(p, id, v) {
  if (id === PP_BL_MAIN) { p.baselineStartDate = v ? v[0] : null; p.baselineEndDate = v ? v[1] : null; return; }
  p.baselines = { ...(p.baselines || {}) };
  if (v) p.baselines[id] = [v[0], v[1]]; else delete p.baselines[id];
}
function ppBlName(id) {
  const r = ppBaselineRegistry.find(x => x.id === id);
  return (r && r.name) || (id === PP_BL_MAIN ? "Baseline" : id);
}
function ppBlTargetOptions() {
  const ids = [PP_BL_MAIN, ...ppBaselineRegistry.map(r => r.id).filter(id => id !== PP_BL_MAIN)];
  const count = id => items.filter(it => ppBlGet(it, id)).length;
  return ids.map(id => `<option value="${escapeHtml(id)}">${id === PP_BL_MAIN ? "★ " : ""}${escapeHtml(ppBlName(id))} · ${count(id)} akt.</option>`).join("")
    + `<option value="__new">+ Ny baseline…</option>`;
}
async function ppLoadBaselineRegistry() {
  try { ppBaselineRegistry = await ghReadJSON(settings.githubToken, baselineRegistryPath()); }
  catch (e) { ppBaselineRegistry = []; }
}

/* Baseline-filens aktiviteter: Powerprojects id (TASK.ID) i första hand, annars GUID.
   OBS: UNIQUE_TASK_ID används inte – trots namnet är det en aktivitetskod (t.ex. "a09") som många
   aktiviteter delar (Victors rapport 2026-10-06: baseline hundratals dagar fel). */
function ppBaselineIndex(pp) {
  return { byId: new Map(pp.tasks.map(t => [t.id, t])), byGuid: new Map(pp.tasks.filter(t => t.guid).map(t => [t.guid, t])) };
}
const ppBaselineTask = (ix, t) => ix.byId.get(t.id) || (t.guid && ix.byGuid.get(t.guid)) || null;
const ppFmtDate = d => (d ? d.replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, "$3/$2 $1") : "");

/* Vilken befintlig aktivitet varje rad i filen är (Map parsed -> item):
   1) Powerprojects id (TASK.ID) – även om översta raden döpts om eller aktiviteten bytt del,
   2) Powerprojects GUID – om id:t ändrats (Victors rapport 2026-10-06: en flyttad aktivitet blev
      "finns inte längre" + en ny),
   3) samma namn: exakt en aktivitet i filen utan träff och exakt en tidigare aktivitet med samma
      namn som inte längre finns i filen – samma regel som namnbytena i Excel-importen.
   Den känns då igen och behåller 3D-kopplingar, kommentarer och markeringar. */
function ppMatchExisting(parsed) {
  const pp = items.filter(it => it.origin !== "manuell" && /^PP .*\|\|\d+$/.test(it.sourceKey || ""));
  const idOf = it => Number(/\|\|(\d+)$/.exec(it.sourceKey)[1]);
  const byId = new Map(), byGuid = new Map();
  pp.forEach(it => { if (!byId.has(idOf(it))) byId.set(idOf(it), it); if (it.ppGuid && !byGuid.has(it.ppGuid)) byGuid.set(it.ppGuid, it); });
  const out = new Map(), taken = new Set();
  const take = (p, it) => { out.set(p, it); taken.add(it.sourceKey); };
  parsed.forEach(p => { const it = byId.get(p.ppId); if (it) take(p, it); });
  parsed.forEach(p => {
    if (out.has(p) || !p.ppGuid) return;
    const it = byGuid.get(p.ppGuid);
    if (it && !taken.has(it.sourceKey)) take(p, it);
  });
  const norm = t => String(t || "").trim().toLowerCase().replace(/\s+/g, " ");
  const orphans = new Map(), loose = new Map();
  pp.forEach(it => { if (taken.has(it.sourceKey)) return; const k = norm(it.objectName); if (!orphans.has(k)) orphans.set(k, new Set()); orphans.get(k).add(it.sourceKey); });
  parsed.forEach(p => { if (out.has(p)) return; const k = norm(p.objectName); if (!loose.has(k)) loose.set(k, []); loose.get(k).push(p); });
  loose.forEach((list, k) => {
    const keys = orphans.get(k);
    if (list.length !== 1 || !keys || keys.size !== 1) return;
    const key = [...keys][0];
    take(list[0], pp.find(it => it.sourceKey === key));
  });
  return out;
}

/* Sätter baselineStartDate/baselineEndDate på raderna enligt valet. Returnerar
   { text (för förhandsgranskningen), meta (sparas i plan_baseline.json; undefined = rör inte) }. */
function ppApplyBaseline(parsed, exOfP, opts) {
  const target = opts.target, name = opts.name || ppBlName(target);
  // Alla baselines följer med oförändrade; bara den valda räknas om.
  parsed.forEach(p => {
    const ex = exOfP(p);
    p.baselineStartDate = ex ? ex.baselineStartDate || null : null; p.baselineEndDate = ex ? ex.baselineEndDate || null : null;
    p.baselines = ex && ex.baselines ? { ...ex.baselines } : {};
  });
  const r = ppApplyBaselineMode(parsed, exOfP, target, opts);
  r.target = target; r.name = name; r.file = opts.file || null; r.mode = opts.mode;
  r.details = ppBaselineDetails(parsed, exOfP, r);
  r.html = ppBaselineHtml(r);
  r.registry = opts.mode === "untouched" ? null : ppNextRegistry(target, name, r.meta);
  if (r.meta) r.meta = { ...r.meta, target, name };
  return r;
}
/* Registret efter en ändring: namnet, och varifrån datumen kommer (ändras inte när nya aktiviteter
   bara fylls på). null = oförändrat. */
function ppNextRegistry(target, name, meta) {
  const at = new Date().toISOString(), by = (typeof settings !== "undefined" && settings.userName) || null;
  const old = ppBaselineRegistry.find(x => x.id === target) || null;
  let next = ppBaselineRegistry.filter(x => x.id !== target);
  if (!(meta && meta.mode === "none" && target !== PP_BL_MAIN)) {
    const e = { ...(old || { id: target, created_at: at }), name, by };
    if (meta && meta.mode !== "keepfill") Object.assign(e, { source: meta.label, mode: meta.mode, file: meta.file || null, set_at: at });
    if (meta && meta.mode === "keepfill") e.filled_at = at;
    if (target === PP_BL_MAIN) next = [e, ...next]; else next.push(e);
  }
  return JSON.stringify(next) !== JSON.stringify(ppBaselineRegistry) ? next : null;
}

const ppDays = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
/* Siffrorna för förhandsgranskningen: hur planen i filen ligger mot den nya baseline, och vad
   som ändras mot den baseline som finns nu (Victor 2026-10-06: "mer info, speciellt kring baseline"). */
function ppBaselineDetails(parsed, exOfP, r) {
  const tid = r.target || PP_BL_MAIN;
  const bl = p => ppBlGet(p, tid);
  const withBl = parsed.filter(bl).map(p => ({ ...p, baselineStartDate: bl(p)[0], baselineEndDate: bl(p)[1] }));
  const rows = withBl.map(p => ({ p, end: ppDays(p.baselineEndDate, p.endDate), start: ppDays(p.baselineStartDate, p.startDate) }))
    .map(x => ({ ...x, shift: x.end || x.start }));
  const later = rows.filter(x => x.shift > 0), earlier = rows.filter(x => x.shift < 0);
  const changed = parsed.filter(p => JSON.stringify(ppBlGet(exOfP(p), tid)) !== JSON.stringify(bl(p))).length;
  const top = list => list.slice().sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift)).slice(0, 6);
  const dates = withBl.flatMap(p => [p.baselineStartDate, p.baselineEndDate]).sort();
  const lastEnd = (list, key) => list.map(p => p[key]).filter(Boolean).sort().pop() || null;
  return { total: parsed.length, withBl: withBl.length, without: parsed.length - withBl.length, later: later.length, earlier: earlier.length,
    same: rows.length - later.length - earlier.length, changed, topLater: top(later), topEarlier: top(earlier),
    span: dates.length ? [dates[0], dates[dates.length - 1]] : null,
    endBl: lastEnd(withBl, "baselineEndDate"), endPlan: lastEnd(withBl, "endDate") };
}
function ppBaselineHtml(r) {
  const d = r.details, e = s => escapeHtml(String(s == null ? "" : s));
  const m = r.meta;
  const src = String(r.text || "").replace(/^Baseline:\s*/, "");
  if (!d.withBl) return `<div class="plan-import-baseline"><b>▭ Baseline “${e(r.name || ppBlName(r.target))}”</b><div>${e(src)}</div></div>`;
  const when = r.file && r.file.savedAt ? ` · filen sparad ${ppFmtDate(r.file.savedAt.slice(0, 10))}` : "";
  const shiftTxt = n => (n > 0 ? `+${n} d` : `${n} d`);
  const li = x => `<li><b class="${x.shift > 0 ? "bl-later" : "bl-earlier"}">${shiftTxt(x.shift)}</b> ${e(x.p.objectName)} <span class="hint">${e(x.p.area || "")} · baseline ${e(ppFmtDate(x.p.baselineStartDate))}–${e(ppFmtDate(x.p.baselineEndDate))} → nu ${e(ppFmtDate(x.p.startDate))}–${e(ppFmtDate(x.p.endDate))}</span></li>`;
  const endShift = d.endBl && d.endPlan ? ppDays(d.endBl, d.endPlan) : 0;
  const warn = !d.later && !d.earlier && r.mode !== "current" ? `<div class="bl-warn">⚠ Alla datum är identiska med baseline – baseline kommer inte att visa någon skillnad. Är det rätt fil/version?</div>` : "";
  return `<details class="plan-import-baseline" open>
    <summary><b>▭ Baseline “${e(r.name || ppBlName(r.target))}”</b> – ${e(src)}${e(when)}</summary>
    ${warn}
    <div class="bl-grid">
      <span><b>${d.withBl}</b> av ${d.total} aktiviteter får baseline${d.without ? ` <span class="hint">(${d.without} utan – visas utan grå/gul stapel)</span>` : ""}</span>
      <span><b class="bl-later">${d.later}</b> ligger senare än baseline · <b class="bl-earlier">${d.earlier}</b> tidigare · <b>${d.same}</b> oförändrade</span>
      ${d.span ? `<span>Baselinens datum: ${e(ppFmtDate(d.span[0]))} – ${e(ppFmtDate(d.span[1]))}${endShift ? ` · sista slut nu ${e(ppFmtDate(d.endPlan))} (<b class="${endShift > 0 ? "bl-later" : "bl-earlier"}">${shiftTxt(endShift)}</b> mot baseline)` : ""}</span>` : ""}
      <span>${d.changed ? `<b>${d.changed}</b> aktiviteter får en annan baseline än i dag` : "Baseline är densamma som i dag"}</span>
    </div>
    ${d.topLater.length ? `<div class="bl-list"><span class="hint">Mest försenade mot baseline:</span><ul>${d.topLater.map(li).join("")}</ul></div>` : ""}
    ${d.topEarlier.length ? `<div class="bl-list"><span class="hint">Mest tidigarelagda:</span><ul>${d.topEarlier.map(li).join("")}</ul></div>` : ""}
  </details>`;
}

function ppApplyBaselineMode(parsed, exOfP, tid, opts) {
  const mode = opts.mode, isNew = !!opts.isNew, blFile = opts.file || null;
  const exOf = exOfP;
  const by = (typeof settings !== "undefined" && settings.userName) || null, at = new Date().toISOString();
  const cur = ppBaselineRegistry.find(x => x.id === tid);
  if (mode === "prev") {
    const known = parsed.filter(exOf);
    if (!known.length) {
      parsed.forEach(p => ppBlSet(p, tid, null));
      return { text: "Första importen – ingen baseline ännu. Vid nästa import blir de här datumen baseline.", meta: undefined };
    }
    const moved = known.filter(p => { const ex = exOf(p); return ex.startDate !== p.startDate || ex.endDate !== p.endDate; }).length;
    if (!moved && !isNew) {
      // Samma datum som nu (t.ex. samma fil igen): baseline skulle bli identisk – behåll den som finns.
      return { text: "Inga datum har ändrats sedan förra importen – nuvarande baseline behålls.", meta: undefined };
    }
    parsed.forEach(p => { const ex = exOf(p); ppBlSet(p, tid, ex && ex.startDate && ex.endDate ? [ex.startDate, ex.endDate] : null); });
    const last = typeof lastPlanImport !== "undefined" && lastPlanImport ? lastPlanImport : null;
    const label = last ? `Import ${ppFmtDate(String(last.at || "").slice(0, 10))}${last.file ? ` (${last.file})` : ""}` : `Före importen ${ppFmtDate(at.slice(0, 10))}`;
    return { text: `Baseline: förra importen (${label}) – ${moved} av ${known.length} aktiviteter har nya datum.`, meta: { mode, label, file: last ? last.file || null : null, set_at: at, by } };
  }
  if (mode === "untouched") {
    return { text: "Ingen baseline är satt – sätt den i blocket Baseline (t.ex. kontraktstidplanen från en .ppb-fil).", meta: undefined };
  }
  if (mode === "keepfill") {
    // Baselinen rörs inte; bara helt nya aktiviteter får sitt första datum (datumet i den här filen).
    let fresh = 0;
    parsed.forEach(p => {
      if (ppBlGet(p, tid) || exOf(p) || !p.startDate || !p.endDate) return;
      ppBlSet(p, tid, [p.startDate, p.endDate]);
      fresh++;
    });
    const src = cur && cur.source ? ` (${cur.source})` : "";
    const text = fresh ? `Baselinen${src} rörs inte; ${fresh} ${fresh === 1 ? "ny aktivitet får" : "nya aktiviteter får"} sitt första datum som baseline.`
      : `Baselinen${src} rörs inte – inga nya aktiviteter.`;
    return { text, meta: fresh ? { mode, label: (cur && cur.source) || `Första datum ${ppFmtDate(at.slice(0, 10))}`, set_at: at, by, filled: fresh } : undefined };
  }

  if (mode === "keep") {
    if (isNew) throw new Error("Välj varifrån den nya baselinens datum ska komma.");
    return { text: "Datumen behålls – bara namnet ändras.", meta: undefined };
  }
  if (mode === "file") {
    if (!blFile) throw new Error("Välj baseline-filen (.ppb) först.");
    const ix = ppBaselineIndex(blFile), tById = new Map(((ppParsed && ppParsed.tasks) || []).map(t => [t.id, t]));
    let hit = 0;
    parsed.forEach(p => {
      const b = ppBaselineTask(ix, tById.get(p.ppId) || { id: p.ppId, guid: p.ppGuid });
      ppBlSet(p, tid, b ? [b.start, b.end] : null);
      if (b) hit++;
    });
    if (!hit) throw new Error(`Ingen aktivitet i ${blFile.fileName} känns igen – är det en baseline för samma tidplan?`);
    const label = blFile.fileName.replace(/\.(ppb|pp)$/i, "").trim();
    return { text: `Baseline: ${blFile.fileName} – ${hit} av ${parsed.length} aktiviteter känns igen${hit < parsed.length ? " (övriga får ingen baseline)" : ""}.`, meta: { mode, label, file: blFile.fileName, set_at: at, by } };
  }
  if (mode === "current") {
    let n = 0;
    parsed.forEach(p => { const v = p.startDate && p.endDate ? [p.startDate, p.endDate] : null; ppBlSet(p, tid, v); if (v) n++; });
    const label = `Tidplanen ${ppFmtDate(at.slice(0, 10))}`;
    return { text: `Tidplanen som gäller nu blir baseline – ${n} aktiviteter.`, meta: { mode, label, file: (typeof lastPlanImport !== "undefined" && lastPlanImport && lastPlanImport.file) || null, set_at: at, by } };
  }
  if (isNew) throw new Error("Välj varifrån den nya baselinens datum ska komma.");
  parsed.forEach(p => ppBlSet(p, tid, null));
  return { text: "Ingen baseline – den här baselinen tas bort.", meta: { mode: "none", label: null, file: null, set_at: at, by } };
}

async function ppRead() {
  const input = document.getElementById("ppFile"), status = document.getElementById("ppStatus");
  const f = input && input.files && input.files[0];
  if (!f) { status.innerText = "Välj en Powerproject-fil (.pp) först."; return; }
  status.innerText = "Läser tidplanen…";
  try {
    ppParsed = await parsePowerproject(await f.arrayBuffer(), f.name);
    await ppLoadBaselineRegistry();
    status.innerText = ppParsed.tasks.length ? "" : "Hittade inga aktiviteter med datum i filen.";
    renderPpOptions();
  } catch (e) {
    console.error("Kunde inte läsa Powerproject-filen", e);
    ppParsed = null; renderPpOptions();
    status.innerText = "Kunde inte läsa filen: " + e.message;
  }
}
function ppPreview() {
  const status = document.getElementById("ppStatus");
  if (!ppParsed) return;
  if (planSource !== "pp") { status.innerText = "Byt till Powerproject överst först."; return; }
  const opts = ppOptionsFromUi();
  if (!opts.groups.size) { status.innerText = "Välj minst en del att importera."; return; }
  const parsed = ppToParsedItems(ppParsed, opts);
  if (!parsed.length) { status.innerText = "Inga aktiviteter i de valda delarna."; return; }
  const exByP = ppMatchExisting(parsed);
  parsed.forEach(p => { const ex = exByP.get(p); if (ex && ex.sourceKey !== p.sourceKey) p.id4d = ex.id; });
  let bl;
  // Importen rör aldrig baselinen (Victor 2026-10-06: "för att det ska finnas en baseline ska jag aktivt
  // ha importerat och sagt att det är en baseline"). Är huvudbaselinen satt i blocket Baseline får
  // bara helt nya aktiviteter sitt första datum i den.
  const mainSet = ppBaselineRegistry.some(x => x.id === PP_BL_MAIN && x.set_at && x.mode !== "none");
  try { bl = ppApplyBaseline(parsed, p => exByP.get(p) || null, { target: PP_BL_MAIN, mode: mainSet ? "keepfill" : "untouched" }); } catch (e) { status.innerText = e.message; return; }
  planImportDiff = buildPlanImportDiff(parsed);
  planImportDiff.baseline = bl;
  // Resurserna i förhandsgranskningen.
  const rs = ppResourceSummary(ppParsed, opts.groups);
  if (bl) {
    const rtxt = opts.resources === false ? "Resurser: tas inte med – resurserna i 4D lämnas orörda."
      : rs.tasks ? `Resurser: ${rs.tasks} ${rs.tasks === 1 ? "aktivitet" : "aktiviteter"} får resurs, antal och timmar (${Math.round(rs.hours).toLocaleString("sv-SE")} h, ${rs.names.length} ${rs.names.length === 1 ? "resurs" : "resurser"}). Aktiviteter utan resurser i Powerproject behåller sina.`
      : "Resurser: inga i Powerproject för de valda delarna – resurserna i 4D lämnas orörda.";
    bl.html = (bl.html || (bl.text ? `<div class="plan-import-baseline">▭ ${escapeHtml(bl.text)}</div>` : "")) + `<div class="plan-import-baseline">${escapeHtml(rtxt)}</div>`;
  }
  planImportDiff.fileName = ppParsed.fileName;
  planImportDiff.excelComments = null;
  renderPlanImportPreview(planImportDiff);
  toggle("planImportPreviewDialog", true);
  status.innerText = "";
}

const baselineUndoPath = () => `${planDir()}/plan_baseline_undo.json`;
let ppBlUndoList = [];
async function ppBlRefreshUndo() {
  const b = document.getElementById("btnPpBlUndo");
  if (!b) return;
  try { ppBlUndoList = await ghReadJSON(settings.githubToken, baselineUndoPath()); } catch (e) { ppBlUndoList = []; }
  const last = ppBlUndoList[ppBlUndoList.length - 1];
  b.classList.toggle("hidden", !last);
  const what = { keep: "namnbytet", none: "borttagningen", file: "ändringen", current: "ändringen" }[last && last.mode] || "ändringen";
  if (last) b.textContent = `↶ Ångra ${what} av ${last.name} (${ppFmtDate(String(last.at).slice(0, 10))} ${new Date(last.at).toTimeString().slice(0, 5)})`;
}
/* Ångrar den senaste ändringen: lägger tillbaka den baselinens gamla datum och registret. */
async function ppBlUndo() {
  const last = ppBlUndoList[ppBlUndoList.length - 1], status = document.getElementById("ppBlStatus");
  if (!last) return;
  if (!confirm(`Ångra ändringen av baselinen "${last.name}"? De datum den hade före ändringen läggs tillbaka.`)) return;
  try {
    await ghWriteJSON(settings.githubToken, itemsPath(), arr => arr.map(row => {
      if (!(row.source_key in last.values)) return row;
      const v = last.values[row.source_key];
      if (last.target === PP_BL_MAIN) return { ...row, baseline_start_date: v ? v[0] : null, baseline_end_date: v ? v[1] : null };
      const bl = { ...(row.baselines || {}) };
      if (v) bl[last.target] = [v[0], v[1]]; else delete bl[last.target];
      const out = { ...row, baselines: bl };
      if (!Object.keys(bl).length) delete out.baselines;
      return out;
    }), `Ångra baseline: ${last.name}`);
    await ghWriteJSON(settings.githubToken, baselineRegistryPath(), () => last.registry || [], `Ångra baseline: ${last.name}`);
    await ghWriteJSON(settings.githubToken, baselineUndoPath(), arr => (Array.isArray(arr) ? arr : []).filter(x => x.id !== last.id), `Ångra baseline: ${last.name}`);
    await refreshItems();
    if (typeof renderItemList === "function") renderItemList();
    await ppLoadBaselineRegistry(); renderPpBlPanel();
    status.innerText = `Ändringen av "${last.name}" är ångrad.`;
  } catch (e) { status.innerText = "Kunde inte ångra: " + e.message; }
}

/* ------------------------------------------------------------- blocket Baseline
   Eget block (Victor 2026-10-06: "nya importer separat … baseline-importer på ett separat ställe").
   Välj baseline (huvudbaselinen eller en ny/befintlig revision), varifrån datumen kommer (en .ppb- eller
   äldre .pp-fil, tidplanen som gäller nu, ta bort, eller bara byt namn) → förhandsgranska → spara.
   Skriver bara baseline_start_date/baseline_end_date (huvudbaselinen) eller baselines[id]. */
let ppBlFileParsed = null, ppBlPending = null;
function ppBlPanelRefresh() {
  const box = document.getElementById("ppBlPanel");
  if (!box) return;
  ppLoadBaselineRegistry().then(() => renderPpBlPanel());
}
function renderPpBlPanel() {
  const box = document.getElementById("ppBlPanel");
  if (!box) return;
  if (!box.dataset.built) {
    box.dataset.built = "1";
    box.innerHTML = `
      <div id="ppBlOverview" class="pp-bl-overview"></div>
      <div class="pp-bl-row">
        <select id="ppBlTarget" aria-label="Vilken baseline"></select>
        <button type="button" class="link-btn" id="ppBlRename" title="Byt namn (t.ex. Kontraktstidplan)">✎ Namn</button>
      </div>
      <input type="text" id="ppBlName" class="hidden" placeholder="Namn, t.ex. Kontraktstidplan" />
      <div class="pp-grid">
        <label class="pp-l" for="ppBlSource">Datum från</label>
        <select id="ppBlSource">
          <option value="file">En baseline-fil (.ppb eller äldre .pp)</option>
          <option value="current">Tidplanen som gäller nu</option>
          <option value="keep">Behåll datumen – byt bara namn</option>
          <option value="none">Ta bort den här baselinen</option>
        </select>
      </div>
      <div class="pp-baseline-file" id="ppBlFileRow"><input type="file" id="ppBlFile" accept=".ppb,.pp" /> <span class="hint" id="ppBlFileInfo"></span></div>
      <div class="row"><button type="button" id="btnPpBlPreview" class="primary">Förhandsgranska baseline</button><span class="hint">Inget sparas förrän du bekräftar.</span></div>
      <div class="row"><button type="button" id="btnPpBlUndo" class="link-btn hidden"></button></div>`;
    const tsel = document.getElementById("ppBlTarget"), tname = document.getElementById("ppBlName"), src = document.getElementById("ppBlSource");
    tsel.onchange = () => {
      const isNew = tsel.value === "__new";
      tname.classList.toggle("hidden", !isNew);
      tname.value = isNew ? "" : ppBlName(tsel.value);
      tname.placeholder = isNew ? "Namn, t.ex. Rev 1 – ÄTA 12" : "Namn, t.ex. Kontraktstidplan";
      if (isNew) tname.focus();
    };
    document.getElementById("ppBlRename").onclick = () => { tname.classList.toggle("hidden"); if (!tname.classList.contains("hidden")) tname.focus(); };
    src.onchange = () => document.getElementById("ppBlFileRow").classList.toggle("hidden", src.value !== "file");
    const bfile = document.getElementById("ppBlFile"), binfo = document.getElementById("ppBlFileInfo");
    bfile.onchange = async () => {
      ppBlFileParsed = null; binfo.innerText = "";
      const f = bfile.files && bfile.files[0];
      if (!f) return;
      binfo.innerText = "Läser…";
      try {
        ppBlFileParsed = await parsePowerproject(await f.arrayBuffer(), f.name);
        ppBlFileParsed.savedAt = f.lastModified ? new Date(f.lastModified).toISOString() : null;
        const ix = ppBaselineIndex(ppBlFileParsed), mine = ppBlItems();
        const hit = mine.filter(it => ppBaselineTask(ix, { id: ppIdOfItem(it), guid: it.ppGuid })).length;
        binfo.innerText = `${ppBlFileParsed.tasks.length} aktiviteter i filen – ${hit} av ${mine.length} i planeringen känns igen`;
      } catch (e) { ppBlFileParsed = null; binfo.innerText = "Kunde inte läsa filen: " + e.message; }
    };
    document.getElementById("btnPpBlPreview").onclick = ppBlPreview;
    document.getElementById("btnPpBlCancel").onclick = () => { ppBlPending = null; toggle("ppBlDialog", false); };
    document.getElementById("btnPpBlConfirm").onclick = ppBlCommit;
    document.getElementById("btnPpBlUndo").onclick = ppBlUndo;
  }
  const tsel = document.getElementById("ppBlTarget");
  tsel.innerHTML = ppBlTargetOptions();
  // Idiotsäkert (Victor 2026-10-06): är huvudbaselinen redan satt föreslås en ny baseline, så att
  // kontraktstidplanen inte skrivs över av misstag.
  const mainSet = ppBlIsSet(PP_BL_MAIN);
  tsel.value = mainSet ? "__new" : PP_BL_MAIN;
  tsel.onchange();
  // Tillbaka till det vanliga valet (fil) efter varje sparning.
  const src = document.getElementById("ppBlSource"), bfile = document.getElementById("ppBlFile");
  src.value = "file"; src.onchange();
  try { bfile.value = ""; } catch (e) {}
  ppBlFileParsed = null; document.getElementById("ppBlFileInfo").innerText = "";
  // Översikten: vilka baselines som finns, när och varifrån.
  const ov = document.getElementById("ppBlOverview");
  const list = [PP_BL_MAIN, ...ppBaselineRegistry.map(r => r.id).filter(id => id !== PP_BL_MAIN)].filter(id => ppBlIsSet(id));
  ov.innerHTML = list.length ? list.map(id => {
    const r = ppBaselineRegistry.find(x => x.id === id) || {};
    return `<div>🔒 <b>${escapeHtml(ppBlName(id))}</b>${id === PP_BL_MAIN ? " <span class=\"hint\">(huvudbaseline)</span>" : ""} <span class="hint">· ${items.filter(it => ppBlGet(it, id)).length} akt.${r.set_at ? ` · satt ${ppFmtDate(r.set_at.slice(0, 10))}` : ""}${r.source ? ` från ${escapeHtml(r.source)}` : ""}</span></div>`;
  }).join("") : `<div class="hint">Ingen baseline är satt ännu.</div>`;
  ppBlRefreshUndo();
}
/* Satt = har datum på raderna (eller är satt i registret). */
function ppBlIsSet(id) {
  const r = ppBaselineRegistry.find(x => x.id === id);
  return items.some(it => ppBlGet(it, id)) || !!(r && r.set_at && r.mode !== "none");
}
const ppIdOfItem = it => { const m = /\|\|(\d+)$/.exec(it.sourceKey || ""); return m ? Number(m[1]) : null; };
/* Powerproject-aktiviteterna i planeringen (en per aktivitet – objekten i den följer med vid sparning). */
const ppBlItems = () => items.filter(it => it.origin !== "manuell" && /^PP .*\|\|\d+$/.test(it.sourceKey || ""));
function ppBlPreview() {
  const status = document.getElementById("ppBlStatus");
  status.innerText = "";
  const tsel = document.getElementById("ppBlTarget"), tname = document.getElementById("ppBlName"), mode = document.getElementById("ppBlSource").value;
  const isNew = tsel.value === "__new";
  const target = isNew ? "bl-" + Date.now().toString(36) : tsel.value;
  const name = (tname.value || "").trim() || (isNew ? "" : ppBlName(target));
  if (isNew && !name) { status.innerText = "Ge den nya baselinen ett namn (t.ex. Rev 1 – ÄTA 12)."; return; }
  const rows = ppBlItems();
  if (!rows.length) { status.innerText = "Importera tidplanen först (Powerproject-import)."; return; }
  // En rad per aktivitet (source_key) för siffrorna; alla objekt i aktiviteten får samma baseline.
  const seen = new Set(), acts = rows.filter(it => !seen.has(it.sourceKey) && seen.add(it.sourceKey));
  const pseudo = acts.map(it => ({ ...it, ppId: ppIdOfItem(it), ppGuid: it.ppGuid || null, _it: it }));
  let r;
  try { r = ppApplyBaseline(pseudo, p => p._it, { target, name, mode, isNew, file: mode === "file" ? ppBlFileParsed : null }); }
  catch (e) { status.innerText = e.message; return; }
  if (mode === "keep") {
    const by = (typeof settings !== "undefined" && settings.userName) || null;
    r.registry = ppBaselineRegistry.some(x => x.id === target) ? ppBaselineRegistry.map(x => x.id === target ? { ...x, name, by } : x)
      : [...ppBaselineRegistry, { id: target, name, by, created_at: new Date().toISOString() }];
  }
  const byKey = new Map(pseudo.map(p => [p.sourceKey, ppBlGet(p, target)]));
  ppBlPending = { target, name, mode, r, byKey };
  // Skydd: att ersätta en satt baseline kräver en bock, att ta bort kräver att namnet skrivs.
  const replacing = !isNew && mode !== "keep" && ppBlIsSet(target);
  const old = ppBaselineRegistry.find(x => x.id === target) || {};
  const oldTxt = `${old.set_at ? ` (satt ${ppFmtDate(old.set_at.slice(0, 10))}${old.source ? ` från ${escapeHtml(old.source)}` : ""})` : ""}`;
  const guard = mode === "none"
    ? `<div class="bl-danger"><span>🗑 Du tar bort baselinen <b>${escapeHtml(ppBlName(target))}</b>${oldTxt}. Skriv namnet för att bekräfta:</span><input type="text" id="ppBlGuardText" placeholder="${escapeHtml(ppBlName(target))}" /></div>`
    : replacing ? `<div class="bl-danger"><span>⚠ <b>${escapeHtml(ppBlName(target))}</b> finns redan${oldTxt} och ersätts.</span><label class="check"><input type="checkbox" id="ppBlGuardCheck" /> Ja, ersätt ${escapeHtml(ppBlName(target))}</label></div>` : "";
  document.getElementById("ppBlSummary").innerHTML = guard + (mode === "keep"
    ? `<div class="plan-import-baseline">Baselinen <b>${escapeHtml(ppBlName(target))}</b> byter namn till <b>${escapeHtml(name)}</b>. Datumen rörs inte.</div>`
    : r.html) + (mode !== "keep" ? `<p class="hint">Bara baseline-datumen ändras – tidplanen, framdriften och kopplingarna rörs inte. En säkerhetskopia tas först, och ändringen kan ångras.</p>` : "");
  const btn = document.getElementById("btnPpBlConfirm");
  btn.textContent = mode === "none" ? "Ta bort baseline" : replacing ? "Ersätt baseline" : "Spara baseline";
  btn.classList.toggle("danger", mode === "none" || replacing);
  const gt = document.getElementById("ppBlGuardText"), gc = document.getElementById("ppBlGuardCheck");
  const sync = () => { btn.disabled = gt ? gt.value.trim() !== ppBlName(target) : gc ? !gc.checked : false; };
  if (gt) gt.oninput = sync;
  if (gc) gc.onchange = sync;
  sync();
  toggle("ppBlDialog", true);
}
async function ppBlCommit() {
  const job = ppBlPending, status = document.getElementById("ppBlStatus"), btn = document.getElementById("btnPpBlConfirm");
  if (!job) return;
  btn.disabled = true;
  try {
    // Ångra: de gamla datumen för just den här baselinen och registret före ändringen.
    const prevVals = {};
    ppBlItems().forEach(it => { if (!(it.sourceKey in prevVals)) prevVals[it.sourceKey] = ppBlGet(it, job.target); });
    const undoRec = { id: ghNewId(), at: new Date().toISOString(), by: settings.userName || null, target: job.target, name: job.mode === "keep" ? ppBlName(job.target) : job.name, mode: job.mode, registry: ppBaselineRegistry, values: prevVals };
    await ghWriteJSON(settings.githubToken, baselineUndoPath(), arr => [...(Array.isArray(arr) ? arr : []).slice(-9), undoRec], `Baseline: ångra-punkt före ${job.name}`);
    if (job.mode !== "keep") {
      if (typeof createBackup === "function") await createBackup(`Före baseline: ${job.name}`);
      await ghWriteJSON(settings.githubToken, itemsPath(), arr => arr.map(row => {
        if (!job.byKey.has(row.source_key)) return row;
        const v = job.byKey.get(row.source_key);
        if (job.target === PP_BL_MAIN) return { ...row, baseline_start_date: v ? v[0] : null, baseline_end_date: v ? v[1] : null };
        const bl = { ...(row.baselines || {}) };
        if (v) bl[job.target] = [v[0], v[1]]; else delete bl[job.target];
        const out = { ...row, baselines: bl };
        if (!Object.keys(bl).length) delete out.baselines;
        return out;
      }), `Baseline: ${job.name}`);
      if (job.r.meta) await ghWriteJSON(settings.githubToken, baselineMetaPath(), arr => [...(Array.isArray(arr) ? arr : []).slice(-19), job.r.meta], `Baseline: ${job.name}`);
    }
    if (job.r.registry) await ghWriteJSON(settings.githubToken, baselineRegistryPath(), () => job.r.registry, `Baselines: ${job.name}`);
    toggle("ppBlDialog", false);
    ppBlPending = null;
    await refreshItems();
    if (typeof renderItemList === "function") renderItemList();
    await ppLoadBaselineRegistry(); renderPpBlPanel();
    status.innerText = job.mode === "keep" ? `Baselinen heter nu "${job.name}".` : job.mode === "none" ? `Baselinen "${job.name}" är borttagen.` : `Baselinen "${job.name}" är sparad – ${job.r.details.withBl} aktiviteter.`;
  } catch (e) {
    console.error("Kunde inte spara baselinen", e);
    status.innerText = "Kunde inte spara baselinen: " + e.message;
  } finally { btn.disabled = false; }
}

document.addEventListener("DOMContentLoaded", () => {
  const read = document.getElementById("btnPpRead");
  if (read) read.onclick = ppRead;
  const f = document.getElementById("ppFile");
  if (f) f.onchange = () => { ppParsed = null; renderPpOptions(); if (f.files && f.files[0]) ppRead(); };
  document.querySelectorAll("#planSourceBar [data-src]").forEach(b => { b.onclick = () => setPlanSource(b.dataset.src); });
});
