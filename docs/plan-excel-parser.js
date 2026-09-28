// Delad tolkningslogik för Victors 4-veckorsplanering i Excel (NSV_Bygg_-_4-
// veckorsplanering-Cl.xlsm-strukturen). Ren funktion utan beroenden till
// DOM/SheetJS/Node - tar emot redan utlästa cellvärden som råa arrayer, så att
// EXAKT samma logik kan köras dels här (validering mot en JSON-dump av den
// riktiga filen, se validate.js), dels i appen (docs/app.js, där en tunn
// SheetJS-adapter bygger samma "rows"-form från den inlästa arbetsboken - se
// buildRowsFromSheet).
//
// Speglar (och ersätter helt) prototypen /home/claude/excel_import_prototype/
// parse.py - se den filens historik för de två tidigare buggfixarna
// (rubrikrader kan inte kännas igen via B==C, kodregex måste kräva mellanslag
// runt klyvningsbindestrecket) och den tredje (flera hopkedjade elementkoder
// i samma rad, t.ex. "K14 - K17 - Betongarbeten...").

const PLAN_COL = { // 1-indexerade kolumnnummer, enligt header-raden (rad 4)
  vecka: 1, rubric: 2, aktivitet: 3, s: 4, typ: 5,
  datumStart: 6, planStart: 7, antalDagar: 8,
  datumSlut: 9, planSlut: 10, dp: 11, block: 12,
  ata: 13, framdrift: 14, helg: 15, veckointervall: 16, filter: 17,
};

// Se COD_SHAPE/SPLIT_RE i parse.py för fullständig motivering. Kräver
// mellanslag på BÅDA sidor av klyvningsbindestrecket (annars klyvs t.ex.
// "J19-J27 - Bergförankring..." på fel bindestreck, mellan J19 och J27, som
// saknar mellanslag och därför ska hållas ihop som EN kod).
const PLAN_SPLIT_RE = /^(\S+)\s+-\s+(.+)$/;
const PLAN_CODE_SHAPE_RE = /^[A-ZÅÄÖ]{0,3}\d{1,4}[A-Za-z]{0,2}(-[A-ZÅÄÖ]{0,3}\d{1,4}[A-Za-z]{0,2})?$/;

/**
 * Skalar av så många kodformade tokens som möjligt från början av texten
 * ("K14 - K17 - Betongarbeten..." -> kod "K14-K17", resten "Betongarbeten...").
 * Returnerar null om texten inte alls börjar med en kodformad token (då är
 * hela texten en fristående aktivitetstext utan elementkoppling).
 */
function matchPlanElementCode(text) {
  const codes = [];
  let remaining = text;
  while (true) {
    const m = PLAN_SPLIT_RE.exec(remaining);
    if (!m) break;
    const candidate = m[1];
    const rest = m[2];
    if (!PLAN_CODE_SHAPE_RE.test(candidate)) break;
    codes.push(candidate);
    remaining = rest;
  }
  if (codes.length === 0) return null;
  return { code: codes.join("-"), rest: remaining };
}

/**
 * Tolkar en enskild WBS-områdesflik. `rows` är en array, 0-indexerad men
 * motsvarande Excel-radnummer (rows[0] = Excel-rad 1, ... rows[3] = header-
 * raden på Excel-rad 4, data börjar Excel-rad 5 = rows[4]), där varje rad i
 * sig är en array av cellvärden (0-indexerad, PLAN_COL-numren är 1-
 * indexerade och subtraheras med 1 vid läsning). Cellvärden ska redan vara
 * normaliserade: datum som "YYYY-MM-DD"-strängar (eller null), tal som JS-
 * nummer, text som strängar, tomt som null/undefined/"".
 *
 * `rows.levels` (valfri) är Excels radgruppering (dispositionsnivå per rad,
 * samma indexering som rows). En datarad på nivå 1 direkt under en datarad
 * på nivå 0 är en UNDERAKTIVITET till den (Victors 4-veckorsplanering,
 * 2026-09-28: t.ex. "J14 - Betongarbeten" med Grovbetong, Formning
 * (gjutfas 1) ...). En sådan överordnad rad blir en egen aktivitet med
 * underaktiviteterna - även om samma elementkod förekommer i andra
 * aktiviteter (J14 - Fundament och J14 - Betongarbeten är olika).
 *
 * Datum (Victors val 2026-09-28): "Datum start/slut" (F/I) är de aktuella
 * datum man planerar efter; "Plan. start/slut" (G/J) är ursprungsplanen och
 * följer med som baseline. Framdrift för en aktivitet med underaktiviteter
 * viktas på "Antal dagar" (H) - samma som Excels egen summeringsformel.
 *
 * Returnerar en lista planobjekt, varje med ett stabilt `sourceKey` som
 * inte beror på radnummer (så att en ny import känner igen samma
 * element/aktivitet igen även om rader lagts till/tagits bort någon
 * annanstans i fliken).
 */
function parsePlanSheet(rows, sheetName) {
  const levels = rows.levels || [];
  const duplicateCounts = new Map(); // nyckel -> antal hittills (radnummer-oberoende dedupe)

  function cell(row, colName) {
    const arr = rows[row - 1];
    if (!arr) return null;
    const v = arr[PLAN_COL[colName] - 1];
    return (v === undefined || v === "") ? null : v;
  }
  const levelOf = row => Number(levels[row - 1]) || 0;

  /** En datarad som objekt. */
  function readRow(row, rubric) {
    const activityText = String(cell(row, "aktivitet")).trim();
    const progressRaw = cell(row, "framdrift");
    const progress = (typeof progressRaw === "number") ? Math.round(progressRaw * 100) : 0;
    const planStart = cell(row, "planStart"), planEnd = cell(row, "planSlut");
    const start = cell(row, "datumStart") || planStart;
    const end = cell(row, "datumSlut") || planEnd;
    const daysRaw = cell(row, "antalDagar");
    const days = typeof daysRaw === "number" && daysRaw > 0 ? daysRaw : 0;
    return {
      row, rubric, activityText, matched: matchPlanElementCode(activityText),
      start, end, baselineStart: planStart, baselineEnd: planEnd,
      actualStart: progress > 0 ? start : null,
      actualEnd: progress >= 100 ? end : null,
      progress, days, children: [],
    };
  }

  // 1) Läs raderna: rubriker, överordnade rader (nivå 0) och deras underrader.
  let currentRubric = null;
  const entries = [];
  let parent = null;
  for (let row = 5; row <= rows.length; row++) {
    const b = cell(row, "rubric");
    const c = cell(row, "aktivitet");
    const k = cell(row, "dp");
    if (!c) continue;
    // Rubrik-/summeringsrad: K (DP/Entreprenad) är ALDRIG ifylld på en sådan
    // rad (se parse.py - B==C gav falska positiva).
    if (k === null || String(k).trim() === "") {
      if (b) currentRubric = String(b).trim();
      parent = null;
      continue;
    }
    const e = readRow(row, currentRubric || "(utan rubrik)");
    if (levelOf(row) > 0 && parent && e.rubric === parent.rubric) {
      parent.children.push(e);
      continue;
    }
    entries.push(e);
    parent = levelOf(row) === 0 ? e : null;
  }

  // Framdrift viktad på antal dagar (faller tillbaka på raden själv om inga dagar finns).
  const weighted = (list, fallback) => {
    const tw = list.reduce((s, x) => s + x.days, 0);
    if (tw > 0) return Math.round(list.reduce((s, x) => s + x.days * x.progress, 0) / tw);
    return fallback;
  };
  const minDate = list => list.filter(Boolean).reduce((a, b2) => (a === null || b2 < a ? b2 : a), null);
  const maxDate = list => list.filter(Boolean).reduce((a, b2) => (a === null || b2 > a ? b2 : a), null);
  const uniqueKey = base => {
    const n = duplicateCounts.get(base) || 0;
    duplicateCounts.set(base, n + 1);
    return n === 0 ? base : `${base}||${n + 1}`;
  };
  const subOf = (x, parentCode) => {
    // "J18 - Formrivning & rengöring" under J18 -> "Formrivning & rengöring"
    const name = x.matched && parentCode && x.matched.code === parentCode ? x.matched.rest.trim() : x.activityText;
    return { name, start: x.start, end: x.end, baselineStart: x.baselineStart, baselineEnd: x.baselineEnd,
      actualStart: x.actualStart, actualEnd: x.actualEnd, progress: x.progress, days: x.days };
  };

  // 2) Bygg aktiviteterna.
  const items = new Map(); // gruppnyckel -> item (för rader UTAN underrader, grupperade på elementkod som förut)
  const result = [];
  entries.forEach(e => {
    const area = `${sheetName} / ${e.rubric}`;
    if (e.children.length) {
      // Överordnad rad med underaktiviteter = en egen aktivitet.
      const code = e.matched ? e.matched.code : null;
      const title = e.matched ? e.matched.rest.trim() : e.activityText;
      const subs = e.children.map(x => subOf(x, code));
      result.push({
        sourceKey: uniqueKey(code ? `${sheetName}||${e.rubric}||${code}||${title}` : `${sheetName}||${e.rubric}||${e.activityText}`),
        area,
        objectName: code || e.activityText,
        activity: title,
        startDate: e.start || minDate(subs.map(x => x.start)),
        endDate: e.end || maxDate(subs.map(x => x.end)),
        baselineStartDate: e.baselineStart,
        baselineEndDate: e.baselineEnd,
        actualStartDate: e.actualStart,
        actualEndDate: e.actualEnd,
        progress: weighted(e.children, e.progress),
        subActivities: subs,
      });
      return;
    }
    // Rad utan underrader: som tidigare - rader med samma elementkod blir
    // faser av ett element, rader utan kod blir fristående aktiviteter.
    let groupKey, sourceKey;
    if (e.matched) {
      groupKey = `elem::${e.rubric}::${e.matched.code}`;
      sourceKey = `${sheetName}||${e.rubric}||${e.matched.code}`;
    } else {
      groupKey = `standalone::${e.rubric}::${e.activityText}::${result.length}`;
      sourceKey = uniqueKey(`${sheetName}||${e.rubric}||${e.activityText}`);
    }
    if (!items.has(groupKey)) {
      const it = {
        sourceKey, area,
        objectName: e.matched ? e.matched.code : e.activityText,
        activity: e.matched ? null : e.activityText,
        startDate: e.start, endDate: e.end,
        baselineStartDate: e.baselineStart, baselineEndDate: e.baselineEnd,
        actualStartDate: e.actualStart, actualEndDate: e.actualEnd,
        subActivities: [], _rows: [],
      };
      items.set(groupKey, it);
      result.push(it);
    }
    const it = items.get(groupKey);
    it._rows.push(e);
    if (e.matched) it.subActivities.push(subOf(e, null));
  });

  result.forEach(it => {
    if (!it._rows) return;
    const rs = it._rows;
    delete it._rows;
    if (it.subActivities.length) {
      it.subActivities = rs.map(x => ({ ...subOf(x, null), name: x.matched.rest.trim() }));
      it.startDate = minDate(it.subActivities.map(x => x.start)) || it.startDate;
      it.endDate = maxDate(it.subActivities.map(x => x.end)) || it.endDate;
      it.baselineStartDate = minDate(rs.map(x => x.baselineStart));
      it.baselineEndDate = maxDate(rs.map(x => x.baselineEnd));
      it.actualStartDate = minDate(rs.map(x => x.actualStart));
      it.actualEndDate = rs.every(x => x.actualEnd) ? maxDate(rs.map(x => x.actualEnd)) : null;
      it.activity = it.subActivities.map(s => s.name).join(" + ");
    }
    // Ett ensamt element utan faser/underrader behöver ingen delaktivitet.
    if (it.subActivities.length === 1 && rs.length === 1) {
      it.activity = it.subActivities[0].name;
      it.subActivities = [];
    }
    it.progress = weighted(rs, rs.length ? Math.round(rs.reduce((s, x) => s + x.progress, 0) / rs.length) : 0);
  });
  return result;
}

const PLAN_DATA_SHEETS = [
  "741 - SEKTIONSFICKOR", "742 - SIKTHALL", "742B & 742C - Stödmurar",
  "743 - KROSSHALL", "744 - FLÄKTHUS", "745 - FÖRTJOCKARHUS",
  "746 - STÄLLVERK", "751 - RÅGODSINFRAKT", "761 - PRODUKTUTFRAKT",
  "775 - VATTENRESERVOAR",
];

/** `sheetsData`: { sheetName: rows[][] } - se parsePlanSheet för radformen. */
function parsePlanWorkbookRows(sheetsData) {
  const all = [];
  PLAN_DATA_SHEETS.forEach(name => {
    const rows = sheetsData[name];
    if (!rows) return;
    all.push(...parsePlanSheet(rows, name));
  });
  return all;
}

/* -------------------------------------------------------------------------
   SheetJS-adapter (bara relevant i webbläsaren - körs INTE i Node-
   valideringen, se validate.js). Bygger EXAKT samma "rows[][]"-form som
   parsePlanSheet ovan förväntar sig (rows[0] = Excel-rad 1, kolumn A..Q =
   index 0..16) från en redan inläst SheetJS-arbetsbok
   (XLSX.read(..., {cellDates:true})), så att den validerade tolknings-
   logiken ovan används helt oförändrad även i appen.
   ------------------------------------------------------------------- */
function planCellToValue(cellObj) {
  if (!cellObj || cellObj.v === undefined || cellObj.v === null || cellObj.v === "") return null;
  if (cellObj.t === "d" || cellObj.v instanceof Date) {
    const d = cellObj.v instanceof Date ? cellObj.v : new Date(cellObj.v);
    if (isNaN(d)) return null;
    return d.toISOString().slice(0, 10);
  }
  if (typeof cellObj.v === "number") return cellObj.v;
  return String(cellObj.v);
}

/** `sheet`: en SheetJS-arbetsboks Sheets["Fliknamn"]. Kräver att XLSX (SheetJS) redan är inladdat globalt. */
function buildPlanRowsFromSheet(sheet) {
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows = [];
  // Börjar alltid på rad-index 0 (inte range.s.r) så att rows[0] garanterat
  // motsvarar Excel-rad 1 - annars skulle en flik vars data börjar längre
  // ner (ovanligt, men inte otänkbart) ge en förskjuten, felaktig radräkning.
  for (let r = 0; r <= range.e.r; r++) {
    const rowArr = [];
    for (let c = 0; c < 17; c++) { // A..Q
      rowArr.push(planCellToValue(sheet[XLSX.utils.encode_cell({ r, c })]));
    }
    rows.push(rowArr);
  }
  // Excels radgruppering (kräver XLSX.read(..., { cellStyles: true })).
  const rowProps = sheet["!rows"] || [];
  rows.levels = rows.map((_, r) => (rowProps[r] && rowProps[r].level) || 0);
  return rows;
}

/** Bygger { flikNamn: rows[][] } för samtliga PLAN_DATA_SHEETS som finns i arbetsboken. */
function buildPlanSheetsData(workbook) {
  const out = {};
  PLAN_DATA_SHEETS.forEach(name => {
    if (workbook.Sheets[name]) out[name] = buildPlanRowsFromSheet(workbook.Sheets[name]);
  });
  return out;
}

if (typeof module !== "undefined") {
  module.exports = { parsePlanWorkbookRows, parsePlanSheet, matchPlanElementCode, PLAN_DATA_SHEETS, PLAN_COL };
}
