// PP-import av resurser (Victor 2026-10-08): resurs, antal och timmar per aktivitet läses från
// PERMANENT_SCHEDUL_ALLOCATION (via PERM_RESOURCE_SKILL -> PERMANENT_RESOURCE). EFFORT är sekunder.
// Saknar aktiviteten resurser i Powerproject behålls de som finns (undefined). Syntetisk fil.
const fs = require('fs'), path = require('path'), vm = require('vm');
const DOCS = path.join(__dirname, '..', 'docs');
const fail = m => { console.log('FEL: ' + m); process.exit(1); };
(async () => {
  const initSqlJs = require(path.join(DOCS, 'vendor', 'sql-wasm.js'));
  const SQL = await initSqlJs({ locateFile: f => path.join(DOCS, 'vendor', f) });
  const db = new SQL.Database();
  db.run(`CREATE TABLE PROJECT_SUMMARY (PROJECT_START, PROJECT_END, SHORT_NAME, LONG_NAME);
    CREATE TABLE BAR (ID INT, EXPANDED_TASK INT, NAME); CREATE TABLE EXPANDED_TASK (ID INT, NAME, BAR INT);
    CREATE TABLE TASK (ID INT, NAME, BAR INT, UNIQUE_TASK_ID, EARLY_START_DATE, EARLY_END_DATE_RS, OVERALL_PERCENT_COMPLETE, DURATION, GUID);
    CREATE TABLE PERMANENT_RESOURCE (ID INT, NAME); CREATE TABLE PERM_RESOURCE_SKILL (ID INT, PLAYER INT, ROLE INT);
    CREATE TABLE PERMANENT_SCHEDUL_ALLOCATION (ALLOCATION_OF INT, ALLOCATED_TO INT, EFFORT, ALLOCATION, LINKABLE_START, LINKABLE_FINISH);`);
  const run = (sql, rows) => rows.forEach(r => db.run(sql, r));
  run('INSERT INTO PROJECT_SUMMARY VALUES (?,?,?,?)', [['2026-08-01 08:00:00', '2027-12-31 16:00:00', 'T', 'Test']]);
  run('INSERT INTO BAR VALUES (?,?,?)', [[1, 0, 'Tidplan'], [11, 10, '']]);
  run('INSERT INTO EXPANDED_TASK VALUES (?,?,?)', [[10, 'Tidplan', 1]]);
  run('INSERT INTO TASK VALUES (?,?,?,?,?,?,?,?,?)', [[100, 'Gjutning', 11, 'A1', '2026-10-05 08:00:00', '2026-10-16 16:00:00', 0, '', ''], [101, 'Montage', 11, 'A2', '2026-10-19 08:00:00', '2026-10-23 16:00:00', 0, '', '']]);
  run('INSERT INTO PERMANENT_RESOURCE VALUES (?,?)', [[1, 'R012 Betongarbetare'], [2, 'R01 Byggnadsarbetare']]);
  run('INSERT INTO PERM_RESOURCE_SKILL VALUES (?,?,?)', [[501, 1, 0], [502, 2, 0]]);
  run('INSERT INTO PERMANENT_SCHEDUL_ALLOCATION VALUES (?,?,?,?,?,?)', [
    [501, 100, 4 * 80 * 3600, 4, '2026-10-05 08:00:00', '2026-10-16 16:00:00'],   // 4 betongarbetare, 320 h
    [502, 100, 1 * 40 * 3600, 1, '2026-10-05 08:00:00', '2026-10-09 16:00:00'],   // 1 byggnadsarbetare, 40 h
    [502, 100, 2 * 40 * 3600, 2, '2026-10-12 08:00:00', '2026-10-16 16:00:00'],   // samma resurs igen: 80 h, 2 st
    [999, 100, 3600, 1, '2026-10-05 08:00:00', '2026-10-05 16:00:00'],           // okänd resurs – hoppas över
  ]);
  const buf = db.export();
  const ctx = { console, window: { initSqlJs }, document: { head: { appendChild() {} }, getElementById: () => null, querySelectorAll: () => [], addEventListener() {} }, localStorage: { getItem: () => null, setItem() {} } };
  ctx.window.initSqlJs = o => initSqlJs({ locateFile: f => path.join(DOCS, 'vendor', f) });
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DOCS, 'pp-import.js'), 'utf8') + '\nthis.parsePowerproject = parsePowerproject; this.ppToParsedItems = ppToParsedItems;', ctx);
  const pp = await ctx.parsePowerproject(buf.buffer, 'test.pp');
  const g = pp.tasks.find(t => t.id === 100), m = pp.tasks.find(t => t.id === 101);
  const want = [{ name: 'R012 Betongarbetare', qty: 4, hours: 320, start: '2026-10-05', end: '2026-10-16' }, { name: 'R01 Byggnadsarbetare', qty: 2, hours: 120, start: '2026-10-05', end: '2026-10-16' }];
  if (JSON.stringify(g.resources) !== JSON.stringify(want)) fail('Resurserna på Gjutning: ' + JSON.stringify(g.resources));
  if (m.resources) fail('Montage har inga resurser: ' + JSON.stringify(m.resources));
  const items = ctx.ppToParsedItems(pp, { groups: new Set(pp.groups.map(x => x.id)), areaLib: null, contractorLib: null });
  const gi = items.find(i => i.objectName === 'Gjutning'), mi = items.find(i => i.objectName === 'Montage');
  if (JSON.stringify(gi.resources) !== JSON.stringify(want) || mi.resources !== undefined) fail('Raderna till sparningen: ' + JSON.stringify([gi.resources, mi.resources]));
  const app = fs.readFileSync(path.join(DOCS, 'app.js'), 'utf8');
  if (!app.includes('resources: p.resources !== undefined ? p.resources : (existing ? existing.resources : null)')) fail('Sparningen ska behålla befintliga resurser när PP saknar');
  if (!/\.\.\.\(Array\.isArray\(it\.resources\) && it\.resources\.length \? \{ resources: it\.resources \} : \{\}\)/.test(app) || !app.includes('resources: Array.isArray(row.resources) ? row.resources : null')) fail('toRow/fromRow ska ta med resources');
  console.log('OK: resurser per aktivitet (namn, antal, timmar, period) från Powerproject; samma resurs slås ihop; utan resurser rörs inget');
  console.log('ALLA TESTER OK');
})().catch(e => fail(e.stack || e.message));
