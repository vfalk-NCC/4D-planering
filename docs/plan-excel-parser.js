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
 * Returnerar en lista planobjekt, varje med ett stabilt `sourceKey` som
 * inte beror på radnummer (så att en ny import känner igen samma
 * element/aktivitet igen även om rader lagts till/tagits bort någon
 * annanstans i fliken - se buildSourceKey).
 */
function parsePlanSheet(rows, sheetName) {
  const items = new Map(); // groupKey (radnummer-oberoende) -> item
  const duplicateActivityCounts = new Map(); // `${rubric}||${activityText}` -> antal hittills

  function cell(row, colName) {
    const arr = rows[row - 1];
    if (!arr) return null;
    const v = arr[PLAN_COL[colName] - 1];
    return (v === undefined || v === "") ? null : v;
  }

  let currentRubric = null;
  const maxRow = rows.length;

  for (let row = 5; row <= maxRow; row++) {
    const b = cell(row, "rubric");
    const c = cell(row, "aktivitet");
    const k = cell(row, "dp");
    if (!c) continue;

    // Rubrik-/summeringsrad: se motivering i parse.py - K (DP/Entreprenad)
    // är ALDRIG ifylld på en sådan rad, till skillnad från B==C som gav
    // falska positiva för flikens egen radel-5-summering.
    if (k === null || String(k).trim() === "") {
      if (b) currentRubric = String(b).trim();
      continue;
    }

    const rubric = currentRubric || "(utan rubrik)";
    const activityText = String(c).trim();
    const matched = matchPlanElementCode(activityText);

    const plannedStart = cell(row, "planStart");
    const plannedEnd = cell(row, "planSlut");
    const actualStartRaw = cell(row, "datumStart");
    const actualEndRaw = cell(row, "datumSlut");
    const progressRaw = cell(row, "framdrift");
    const progressPct = (typeof progressRaw === "number") ? Math.round(progressRaw * 100) : 0;
    const actualStart = progressPct > 0 ? actualStartRaw : null;
    const actualEnd = progressPct >= 100 ? actualEndRaw : null;

    let groupKey, objectName, phase = null, sourceKeyBase;
    if (matched) {
      objectName = matched.code;
      phase = matched.rest.trim();
      groupKey = `elem::${rubric}::${matched.code}`;
      sourceKeyBase = `${sheetName}||${rubric}||${matched.code}`;
    } else {
      objectName = activityText;
      const dupKey = `${rubric}||${activityText}`;
      const occurrence = duplicateActivityCounts.get(dupKey) || 0;
      duplicateActivityCounts.set(dupKey, occurrence + 1);
      // radnummer-oberoende dedupe-nyckel: om SAMMA rubrik+text upprepas
      // (sällsynt), skiljs de åt av löpnummer i den ordning de påträffas -
      // stabilt mot att rader läggs till/tas bort ANNANSTANS i fliken.
      groupKey = `standalone::${rubric}::${activityText}::${occurrence}`;
      sourceKeyBase = occurrence === 0
        ? `${sheetName}||${rubric}||${activityText}`
        : `${sheetName}||${rubric}||${activityText}||${occurrence + 1}`;
    }

    if (!items.has(groupKey)) {
      items.set(groupKey, {
        sourceKey: sourceKeyBase,
        area: `${sheetName} / ${rubric}`,
        objectName,
        activity: matched ? null : activityText,
        startDate: plannedStart,
        endDate: plannedEnd,
        actualStartDate: actualStart,
        actualEndDate: actualEnd,
        subActivities: [],
        _progresses: [],
      });
    }
    const it = items.get(groupKey);
    it._progresses.push(progressPct);

    if (matched) {
      it.subActivities.push({
        name: phase, start: plannedStart, end: plannedEnd,
        actualStart, actualEnd, progress: progressPct,
      });
      const starts = it.subActivities.map(s => s.start).filter(Boolean);
      const ends = it.subActivities.map(s => s.end).filter(Boolean);
      if (starts.length) it.startDate = starts.reduce((a, b2) => (a < b2 ? a : b2));
      if (ends.length) it.endDate = ends.reduce((a, b2) => (a > b2 ? a : b2));
      it.activity = it.subActivities.map(s => s.name).join(" + ");
    }
  }

  const result = [];
  items.forEach(it => {
    const progresses = it._progresses;
    delete it._progresses;
    it.progress = progresses.length ? Math.round(progresses.reduce((a, b2) => a + b2, 0) / progresses.length) : 0;
    result.push(it);
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
