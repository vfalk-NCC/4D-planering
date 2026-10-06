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
const PP_BASELINE_KEY = "4dplan-pp-baseline";

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
      subActivities: [], contractor: opts.contractorLib ? t.codes[opts.contractorLib] || null : undefined,
      dependsOnKeys: preds.get(t.id) || [], sheet: null, excelMap: null, id4d: null, ppId: t.id, ppUid: t.uid, ppGuid: t.guid,
    };
  });
}

/* ------------------------------------------------------------- panelen */
function ppOptionsFromUi() {
  const groups = new Set([...document.querySelectorAll("#ppOptions [data-ppg]")].filter(c => c.checked).map(c => Number(c.dataset.ppg)));
  const a = document.getElementById("ppAreaLib").value, c = document.getElementById("ppContractorLib").value;
  return { groups, areaLib: a ? Number(a) : null, contractorLib: c ? Number(c) : null };
}
function renderPpOptions() {
  const box = document.getElementById("ppOptions");
  if (!box) return;
  if (!ppParsed) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  const pp = ppParsed, fmt = d => d ? d.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2 $1") : "–";
  const libOpts = (pick, none) => `<option value="">${none}</option>` + pp.libs.map(l => `<option value="${l.id}"${pick(l) ? " selected" : ""}>${escapeHtml(l.name)} (${l.count})</option>`).join("");
  const areaDefault = pp.libs.find(l => /zon/i.test(l.name)), contrDefault = pp.libs.find(l => /utförs|entrepren|ue\b/i.test(l.name));
  box.innerHTML = `
    <div class="pp-head"><b>${escapeHtml(pp.project.name || pp.fileName)}</b> <span class="hint">${pp.tasks.length} aktiviteter · ${pp.links.length} länkar${pp.project.start ? ` · ${fmt(pp.project.start)} – ${fmt(pp.project.end)}` : ""}</span></div>
    <label class="pp-l">Delar att importera</label>
    <div class="pp-groups">${pp.groups.map(g => `<label class="check"><input type="checkbox" data-ppg="${g.id}"${g.defaultOn ? " checked" : ""} /> ${escapeHtml(g.name)} <span class="hint">${g.count} st · ${fmt(g.start)} – ${fmt(g.end)}</span></label>`).join("")}</div>
    <div class="pp-grid">
      <label class="pp-l" for="ppAreaLib">Område</label><select id="ppAreaLib">${libOpts(l => l === areaDefault, "Sammanfattningsraden i tidplanen")}</select>
      <label class="pp-l" for="ppContractorLib">Entreprenör</label><select id="ppContractorLib">${libOpts(l => l === contrDefault, "Ingen")}</select>
    </div>
    <div class="pp-grid">
      <label class="pp-l" for="ppBaseline">Baseline</label><select id="ppBaseline">
        <option value="prev">Förra importen – datumen som gäller nu blir baseline</option>
        <option value="keep">Behåll nuvarande baseline</option>
        <option value="file">Från en Powerproject-baseline (.ppb) eller äldre .pp-fil…</option>
        <option value="none">Ingen baseline</option>
      </select>
    </div>
    <div class="pp-baseline-file hidden" id="ppBaselineFileRow"><input type="file" id="ppBaselineFile" accept=".ppb,.pp" /> <span class="hint" id="ppBaselineFileInfo"></span></div>
    <p class="hint">Område: aktivitetens kod i biblioteket, annars sammanfattningsraden ovanför den. Länkarna blir beroenden. Baseline visas som en grå stapel i 4D-dashboarden (jämför med en tidigare version av tidplanen). Inget sparas förrän du bekräftar i förhandsgranskningen.</p>
    <div class="row"><button type="button" id="btnPpPreview" class="primary">Förhandsgranska importen</button></div>`;
  box.classList.remove("hidden");
  document.getElementById("btnPpPreview").onclick = () => ppPreview();
  const bsel = document.getElementById("ppBaseline"), brow = document.getElementById("ppBaselineFileRow");
  let saved = "prev"; try { saved = localStorage.getItem(PP_BASELINE_KEY) || "prev"; } catch (e) {}
  if (saved === "file") saved = "prev"; // filen måste väljas på nytt
  bsel.value = saved;
  bsel.onchange = () => {
    brow.classList.toggle("hidden", bsel.value !== "file");
    try { localStorage.setItem(PP_BASELINE_KEY, bsel.value); } catch (e) {}
  };
  const bfile = document.getElementById("ppBaselineFile"), binfo = document.getElementById("ppBaselineFileInfo");
  ppBaselineParsed = null;
  bfile.onchange = async () => {
    ppBaselineParsed = null; binfo.innerText = "";
    const f = bfile.files && bfile.files[0];
    if (!f) return;
    binfo.innerText = "Läser…";
    try {
      ppBaselineParsed = await parsePowerproject(await f.arrayBuffer(), f.name);
      const ids = ppBaselineIndex(ppBaselineParsed), hit = ppParsed.tasks.filter(t => ppBaselineTask(ids, t)).length;
      binfo.innerText = `${ppBaselineParsed.tasks.length} aktiviteter i filen, ${hit} av ${ppParsed.tasks.length} känns igen`;
    } catch (e) { ppBaselineParsed = null; binfo.innerText = "Kunde inte läsa filen: " + e.message; }
  };
}
/* Baseline-filens aktiviteter: Powerprojects unika id (UNIQUE_TASK_ID) i första hand, annars radens id. */
function ppBaselineIndex(pp) {
  return { byUid: new Map(pp.tasks.filter(t => t.uid).map(t => [String(t.uid), t])), byId: new Map(pp.tasks.map(t => [t.id, t])) };
}
const ppBaselineTask = (ix, t) => (t.uid && ix.byUid.get(String(t.uid))) || ix.byId.get(t.id) || null;
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
function ppApplyBaseline(parsed, exOfP) {
  const sel = document.getElementById("ppBaseline");
  let mode = sel ? sel.value : "prev";
  const exOf = exOfP;
  const keep = () => parsed.forEach(p => { const ex = exOf(p); p.baselineStartDate = ex ? ex.baselineStartDate || null : null; p.baselineEndDate = ex ? ex.baselineEndDate || null : null; });
  const by = (typeof settings !== "undefined" && settings.userName) || null, at = new Date().toISOString();
  if (mode === "prev") {
    const known = parsed.filter(exOf);
    if (!known.length) {
      parsed.forEach(p => { p.baselineStartDate = null; p.baselineEndDate = null; });
      return { text: "Första importen – ingen baseline ännu. Vid nästa import blir de här datumen baseline.", meta: undefined };
    }
    const moved = known.filter(p => { const ex = exOf(p); return ex.startDate !== p.startDate || ex.endDate !== p.endDate; }).length;
    if (!moved) {
      // Samma datum som nu (t.ex. samma fil igen): baseline skulle bli identisk – behåll den som finns.
      keep();
      return { text: "Inga datum har ändrats sedan förra importen – nuvarande baseline behålls.", meta: undefined };
    }
    parsed.forEach(p => { const ex = exOf(p); p.baselineStartDate = ex ? ex.startDate || null : null; p.baselineEndDate = ex ? ex.endDate || null : null; });
    const last = typeof lastPlanImport !== "undefined" && lastPlanImport ? lastPlanImport : null;
    const label = last ? `Import ${ppFmtDate(String(last.at || "").slice(0, 10))}${last.file ? ` (${last.file})` : ""}` : `Före importen ${ppFmtDate(at.slice(0, 10))}`;
    return { text: `Baseline: förra importen (${label}) – ${moved} av ${known.length} aktiviteter har nya datum.`, meta: { mode, label, file: last ? last.file || null : null, set_at: at, by } };
  }
  if (mode === "keep") {
    keep();
    return { text: "Nuvarande baseline behålls.", meta: undefined };
  }
  if (mode === "file") {
    if (!ppBaselineParsed) throw new Error("Välj baseline-filen (.ppb) först, eller ett annat baseline-val.");
    const ix = ppBaselineIndex(ppBaselineParsed), tById = new Map(ppParsed.tasks.map(t => [t.id, t]));
    let hit = 0;
    parsed.forEach(p => {
      const b = ppBaselineTask(ix, tById.get(p.ppId) || { id: p.ppId, uid: p.ppUid });
      p.baselineStartDate = b ? b.start : null; p.baselineEndDate = b ? b.end : null;
      if (b) hit++;
    });
    if (!hit) throw new Error(`Ingen aktivitet i ${ppBaselineParsed.fileName} känns igen – är det en baseline för samma tidplan?`);
    const label = ppBaselineParsed.fileName.replace(/\.(ppb|pp)$/i, "");
    return { text: `Baseline: ${ppBaselineParsed.fileName} – ${hit} av ${parsed.length} aktiviteter känns igen${hit < parsed.length ? " (övriga får ingen baseline)" : ""}.`, meta: { mode, label, file: ppBaselineParsed.fileName, set_at: at, by } };
  }
  parsed.forEach(p => { p.baselineStartDate = null; p.baselineEndDate = null; });
  return { text: "Ingen baseline – den som finns tas bort.", meta: { mode: "none", label: null, file: null, set_at: at, by } };
}

async function ppRead() {
  const input = document.getElementById("ppFile"), status = document.getElementById("ppStatus");
  const f = input && input.files && input.files[0];
  if (!f) { status.innerText = "Välj en Powerproject-fil (.pp) först."; return; }
  status.innerText = "Läser tidplanen…";
  try {
    ppParsed = await parsePowerproject(await f.arrayBuffer(), f.name);
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
  try { bl = ppApplyBaseline(parsed, p => exByP.get(p) || null); } catch (e) { status.innerText = e.message; return; }
  planImportDiff = buildPlanImportDiff(parsed);
  planImportDiff.baseline = bl;
  planImportDiff.fileName = ppParsed.fileName;
  planImportDiff.excelComments = null;
  renderPlanImportPreview(planImportDiff);
  toggle("planImportPreviewDialog", true);
  status.innerText = "";
}

document.addEventListener("DOMContentLoaded", () => {
  const read = document.getElementById("btnPpRead");
  if (read) read.onclick = ppRead;
  const f = document.getElementById("ppFile");
  if (f) f.onchange = () => { ppParsed = null; renderPpOptions(); };
  document.querySelectorAll("#planSourceBar [data-src]").forEach(b => { b.onclick = () => setPlanSource(b.dataset.src); });
});
