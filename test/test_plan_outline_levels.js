// Enhetstest (Node): 4-veckorsplaneringens radgruppering (Excel-nivåer) blir
// underaktiviteter, datum från "Datum start/slut" (F/I) med "Plan." (G/J)
// som ursprungsplan, och framdrift viktad på "Antal dagar" (H).
const P = require('../docs/plan-excel-parser.js');

const rows = [];
const levels = [];
const set = (excelRow, level, v) => {
  const a = new Array(17).fill(null);
  const C = P.PLAN_COL;
  a[C.rubric - 1] = v.b; a[C.aktivitet - 1] = v.c; a[C.datumStart - 1] = v.f; a[C.planStart - 1] = v.g;
  a[C.antalDagar - 1] = v.h; a[C.datumSlut - 1] = v.i; a[C.planSlut - 1] = v.j; a[C.dp - 1] = v.k; a[C.framdrift - 1] = v.n;
  rows[excelRow - 1] = a; levels[excelRow - 1] = level;
};
for (let r = 1; r <= 4; r++) { rows[r - 1] = new Array(17).fill(null); levels[r - 1] = 0; }
set(5, 0, { b: 'Linje J', c: 'Linje J' });
set(6, 0, { b: 'Linje J', c: 'J14 - Fundament DP1', f: '2026-08-11', g: '2026-08-11', h: 20, i: '2026-09-15', j: '2026-09-10', k: 'DP1', n: 1 });
set(7, 1, { b: 'Linje J', c: 'Borrning', f: '2026-08-11', g: '2026-08-11', h: 10, i: '2026-08-20', j: '2026-08-20', k: 'DP1', n: 1 });
set(8, 1, { b: 'Linje J', c: 'J14 - Bergförankring', f: '2026-09-09', g: '2026-09-05', h: 10, i: '2026-09-15', j: '2026-09-10', k: 'DP1', n: 0.5 });
set(9, 0, { b: 'Linje J', c: 'J14 - Betongarbeten - (Kontrefor)', f: '2026-09-08', g: '2026-09-08', h: 42, i: '2026-10-19', j: '2026-10-19', k: 'DP2', n: 0.52 });
set(10, 1, { b: 'Linje J', c: 'Grovbetong', f: '2026-09-08', g: '2026-09-08', h: 11, i: '2026-09-18', j: '2026-09-18', k: 'DP1', n: 1 });
set(11, 1, { b: 'Linje J', c: 'Gjutning (gjutfas 1)', f: '2026-09-30', g: '2026-10-02', h: 3, i: '2026-10-02', j: '2026-10-07', k: 'DP2', n: 0 });
set(12, 1, { b: 'Linje J', c: 'Demontage byggställning', f: '2026-10-12', g: '2026-10-12', h: 8, i: '2026-10-19', j: '2026-10-19', k: 'DP2', n: 0 });
set(13, 0, { b: 'Linje J', c: 'Ställningsmontage (fallskydd)', f: '2026-09-14', g: '2026-09-12', h: 5, i: '2026-09-18', j: '2026-09-16', k: 'DP2', n: 0.8 });
rows.levels = levels;

const out = P.parsePlanSheet(rows, '742 - SIKTHALL');
const fail = m => { console.error('FEL: ' + m + '\n' + JSON.stringify(out, null, 1)); process.exit(1); };
if (out.length !== 3) fail('förväntade 3 aktiviteter (J14 Fundament, J14 Betongarbeten, Ställningsmontage), fick ' + out.length);
const fund = out.find(x => x.activity === 'Fundament DP1');
const bet = out.find(x => x.activity === 'Betongarbeten - (Kontrefor)');
const st = out.find(x => x.objectName === 'Ställningsmontage (fallskydd)');
if (!fund || !bet || !st) fail('saknar någon av aktiviteterna');
if (fund.objectName !== 'J14' || bet.objectName !== 'J14') fail('båda J14-aktiviteterna ska ha elementkoden J14');
if (fund.sourceKey === bet.sourceKey) fail('J14 Fundament och J14 Betongarbeten ska ha olika source_key');
if (JSON.stringify(fund.subActivities.map(s => s.name)) !== '["Borrning","Bergförankring"]') fail('fel underaktiviteter för Fundament (koden ska skalas av): ' + JSON.stringify(fund.subActivities.map(s => s.name)));
if (bet.subActivities.length !== 3) fail('Betongarbeten ska ha 3 underaktiviteter');
if (fund.startDate !== '2026-08-11' || fund.endDate !== '2026-09-15') fail('aktuella datum ska komma från Datum start/slut');
if (fund.baselineEndDate !== '2026-09-10') fail('ursprungsplanen ska komma från Plan. slut');
if (fund.progress !== 75) fail('framdrift ska viktas på antal dagar: (10*100+10*50)/20 = 75, fick ' + fund.progress);
if (bet.progress !== 50) fail('Betongarbeten: (11*100+3*0+8*0)/22 = 50, fick ' + bet.progress);
const gj = bet.subActivities.find(s => s.name === 'Gjutning (gjutfas 1)');
if (gj.start !== '2026-09-30' || gj.end !== '2026-10-02') fail('underaktivitetens datum ska komma från Datum start/slut');
if (st.subActivities.length !== 0 || st.startDate !== '2026-09-14' || st.baselineStartDate !== '2026-09-12' || st.progress !== 80) fail('fristående rad fel: ' + JSON.stringify(st));
console.log('OK: Excels radgruppering blir underaktiviteter, J14 Fundament/Betongarbeten hålls isär, datum från Datum start/slut med Plan. som ursprungsplan, framdrift viktad på antal dagar');
