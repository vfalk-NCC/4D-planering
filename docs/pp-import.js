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
   Bara läsning: .pp-filen ändras aldrig. */

let ppParsed = null; // senast inlästa fil: { fileName, project, groups, libs, tasks, links }

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
        out.unshift({ kind: "exp", id: e.ID, name: (e.NAME || "").trim() });
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
      tasks.push({ id: r.ID, uid: r.UNIQUE_TASK_ID || "", name, kind, start, end, progress, actualStart: aStart, actualEnd: aEnd,
        path, top: top ? top.id : 0, topName: top ? top.name || "Tidplan" : "Tidplan", codes: inherited(r.ID, chain) });
    };
    q("SELECT ID, NAME, BAR, UNIQUE_TASK_ID, EARLY_START_DATE, EARLY_END_DATE_RS, OVERALL_PERCENT_COMPLETE, DURATION FROM TASK").forEach(r => add(r, "task"));
    if (has("MILESTONE")) q("SELECT ID, NAME, BAR, UNIQUE_TASK_ID, EARLY_START_DATE, GIVEN_DATE_TIME, COMPLETED FROM MILESTONE").forEach(r => add(r, "ms"));
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
      dependsOnKeys: preds.get(t.id) || [], sheet: null, excelMap: null, id4d: null, ppId: t.id, ppUid: t.uid,
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
    <p class="hint">Område: aktivitetens kod i biblioteket, annars sammanfattningsraden ovanför den. Länkarna blir beroenden. Inget sparas förrän du bekräftar i förhandsgranskningen.</p>
    <div class="row"><button type="button" id="btnPpPreview" class="primary">Förhandsgranska importen</button></div>`;
  box.classList.remove("hidden");
  document.getElementById("btnPpPreview").onclick = () => ppPreview();
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
  planImportDiff = buildPlanImportDiff(parsed);
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
