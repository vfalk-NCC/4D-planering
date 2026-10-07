// Powerproject-import och växeln Excel/Powerproject (Victors önskemål 2026-10-06):
//  – växeln överst visar antingen Excel-planeringen (som förut) eller Powerproject-tidplanen,
//    som har egna filer (projects/<id>/pp/) och aldrig blandas med Excel;
//  – en .pp-fil (SQLite) läses i webbläsaren: aktiviteter, milstolpar, datum, framdrift,
//    länkar (beroenden), zon (område) och "Utförs av" (entreprenör) – samma förhandsgranskning
//    och sparning som Excel-importen; en ny import känner igen aktiviteterna (Powerprojects id).
// Testfilen byggs här med sql.js (samma bibliotek som appen) – ingen riktig tidplan i repot.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8993;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
const PID = 'test-project';
const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const get = f => { const e = store.get(`projects/${PID}/${f}`); return e ? JSON.parse(e.content) : null; };
put('plan_items.json', [{ id: 'e1', project_id: PID, object_id: 'excel-e1', object_name: 'E1', activity: 'Excel-aktivitet', area: 'Hus A', status: 'planerad', progress: 0, depends_on: [], start_date: '2026-10-01', end_date: '2026-10-10', source_key: 'X||Y||E1' }]);
put('plan_item_activities.json', []); put('plan_item_comments.json', []);

/* En liten Powerproject-fil: projektet (Projekttidplan) och ett mallbibliotek med gamla datum. */
async function makePp(variant) {
  const initSqlJs = require(path.join(DOCS_DIR, 'vendor', 'sql-wasm.js'));
  const SQL = await initSqlJs({ locateFile: f => path.join(DOCS_DIR, 'vendor', f) });
  const db = new SQL.Database();
  db.run(`CREATE TABLE PROJECT_SUMMARY (PROJECT_START, PROJECT_END, SHORT_NAME, LONG_NAME);
    CREATE TABLE BAR (ID INT, EXPANDED_TASK INT, NAME);
    CREATE TABLE EXPANDED_TASK (ID INT, NAME, BAR INT);
    CREATE TABLE TASK (ID INT, NAME, BAR INT, UNIQUE_TASK_ID, EARLY_START_DATE, EARLY_END_DATE_RS, OVERALL_PERCENT_COMPLETE, DURATION, GUID);
    CREATE TABLE MILESTONE (ID INT, NAME, BAR INT, UNIQUE_TASK_ID, EARLY_START_DATE, GIVEN_DATE_TIME, COMPLETED);
    CREATE TABLE LINK (START_TASK INT, END_TASK INT);
    CREATE TABLE CODE_LIBRARY (ID INT, NAME);
    CREATE TABLE CODE_LIBRARY_ENTRY (ID INT, NAME, CODE_LIBRARY INT);
    CREATE TABLE CODE_LIBRARY_ASSIGNABL_CODES (CODES INT, ASSIGNED_TO INT);
    CREATE TABLE TASK_COMPLETED_SECTION (TASK INT, OVERALL_PERCENT_COMPLETE, ACTUAL_START, ACTUAL_END, DURATION);`);
  const run = (sql, rows) => rows.forEach(r => db.run(sql, r));
  run('INSERT INTO PROJECT_SUMMARY VALUES (?,?,?,?)', [['2026-08-18 08:00:00', '2028-08-21 18:00:00', 'NSV', 'NSV-LKAB Huvudtidplan']]);
  // Sammanfattningsraden 742 Sikthall har inget eget namn (som i NSV-tidplanen) – stapelns namn gäller.
  // Hierarki: rotstapel 1 -> Projekttidplan (10) -> stapel 11 -> PRODUKTION (20) -> stapel 21 -> 742 Sikthall (30) -> stapel 31 (aktiviteterna)
  run('INSERT INTO BAR VALUES (?,?,?)', [[1, 0, 'Projekttidplan'], [11, 10, ''], [21, 20, '742 Sikthall'], [31, 30, ''], [2, 0, ''], [51, 50, '']]);
  run('INSERT INTO EXPANDED_TASK VALUES (?,?,?)', [[10, variant === 3 ? 'Projekttidplan rev B' : 'Projekttidplan', 1], [20, 'PRODUKTION', 11], [30, '', 21], [50, 'Building', 2]]);
  const ren = variant === 2 || variant === 5;
  // Montage har samma UNIQUE_TASK_ID ('a01') som Gjutning – som i NSV-tidplanen är det en kod, inte unikt.
  // Variant 4: Montage och Schakt har flyttats i Powerproject och fått nya id (Montage har kvar sitt GUID).
  const mv = variant === 4, nid = id => mv && id === 101 ? 111 : mv && id === 102 ? 112 : id;
  run('INSERT INTO TASK VALUES (?,?,?,?,?,?,?,?,?)', [
    [100, ren ? 'Gjutning bottenplatta etapp 1' : 'Gjutning bottenplatta', 31, 'a01', ren ? '2026-11-02 08:00:00' : '2026-10-05 08:00:00', ren ? '2026-11-13 16:00:00' : '2026-10-16 16:00:00', 0, '0,0,<8.0E01>,', null],
    [nid(101), 'Montage stomme', 31, 'a01', '2026-10-19 08:00:00', '2026-11-06 16:00:00', 0, '0,0,<1.2E02>,', '{6F319DCE-1824-4C1B-8B1A-8C35B46CCD3D}'],
    [nid(102), 'Schakt', 31, 'a03', '2026-09-01 08:00:00', '2026-09-14 16:00:00', 0, '0,0,<8.0E01>,', '{00000000-0000-0000-0000-000000000000}'],
    [103, 'https://apps.powerapps.com/x', 31, '', '2026-10-01 08:00:00', '2026-10-01 16:00:00', 0, '', null],
    [104, 'Utan datum', 31, '', null, null, 0, '', null],
    ...(variant === 5 ? [[106, 'Ny aktivitet', 31, 'a05', '2026-12-01 08:00:00', '2026-12-05 16:00:00', 0, '0,0,<4.0E01>,', null]] : []),
    [200, 'Mallaktivitet', 51, '', '2015-01-02 08:00:00', '2015-01-09 16:00:00', 0, '0,0,<4.0E01>,', null],
  ]);
  run('INSERT INTO MILESTONE VALUES (?,?,?,?,?,?,?)', [[300, 'Tätt hus', 31, 'a04', '2026-11-10 08:00:00', '2026-11-10 08:00:00', 0]]);
  run('INSERT INTO LINK VALUES (?,?)', [[nid(102), 100], [100, nid(101)], [nid(101), 300], [200, 100]]);
  run('INSERT INTO CODE_LIBRARY VALUES (?,?)', [[1, '1. Utförs av'], [2, '3.5 Zoner'], [3, '9.6 Kran']]);
  run('INSERT INTO CODE_LIBRARY_ENTRY VALUES (?,?,?)', [[11, 'K01 NCC Bygg', 1], [12, 'K20 UE Betong', 1], [21, '7421 Sikthall del 1', 2]]);
  // Entreprenör NCC på sammanfattningsraden (ärvs), UE Betong på gjutningen; zonen bara på gjutningen.
  run('INSERT INTO CODE_LIBRARY_ASSIGNABL_CODES VALUES (?,?)', [[30, 11], [100, 12], [100, 21]]);
  // Schakt klar (två delar), montage halvvägs.
  run('INSERT INTO TASK_COMPLETED_SECTION VALUES (?,?,?,?,?)', [
    [nid(102), 100, '2026-09-02 07:00:00', '2026-09-08 16:00:00', '0,0,<4.0E01>,'], [nid(102), 100, '2026-09-09 07:00:00', '2026-09-15 16:00:00', '0,0,<4.0E01>,'],
    [nid(101), 100, '2026-10-20 07:00:00', '2026-10-27 16:00:00', '0,0,<6.0E01>,']]);
  const bytes = db.export(); db.close();
  return Buffer.from(bytes);
}

(async () => {
  const server = http.createServer((req, res) => fs.readFile(path.join(DOCS_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(req.url.split('?')[0])] || 'application/octet-stream' }); res.end(data);
  })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 520, height: 1600 } });
  require('./_reveal').autoReveal(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    localStorage.setItem('4dplan-unlocked', '1');
    localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' }));
  });
  await page.route('https://components.connect.trimble.com/**', r => r.fulfill({ contentType: 'application/javascript', body: `
    window.__states = [];
    window.TrimbleConnectWorkspace = { connect: function(t, cb) { window.__cb = cb; return Promise.resolve({
      project: { getProject: () => Promise.resolve({ id: '${PID}' }) },
      extension: { requestPermission: () => Promise.resolve('x') },
      markup: { addLineMarkups: a => Promise.resolve(a.map((m, i) => ({ ...m, id: i + 1 }))), removeMarkups: () => Promise.resolve(), getLineMarkups: () => Promise.resolve([]) },
      viewer: {
        getSelection: () => Promise.resolve([]), convertToObjectIds: (m, r) => Promise.resolve(r.map(String)),
        convertToObjectRuntimeIds: (m, ids) => Promise.resolve(ids.map(Number)), setSelection: () => Promise.resolve(),
        getObjectBoundingBoxes: () => Promise.resolve([]), getObjectProperties: () => Promise.resolve([]),
        setObjectState: (a, b) => { window.__states.push(b); return Promise.resolve(); }, getModels: () => Promise.resolve([]), toggleModel: () => Promise.resolve()
      } }); } };` }));
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    if (req.method() === 'DELETE') { store.delete(f); return r.fulfill({ status: 200, body: '{}' }); }
    const body = JSON.parse(req.postData()); if (e && body.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' });
    const sha = 's' + (++n); store.set(f, { content: Buffer.from(body.content, 'base64').toString(), sha });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) });
  });
  const fail = m => { throw new Error(m); };
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const excelBefore = JSON.stringify(get('plan_items.json'));
  const rows = () => page.evaluate(() => items.map(it => it.objectName).sort());

  // 1) Växeln: Excel från början; Powerproject = tom egen planering, rätt block i Import & verktyg.
  const s0 = await page.evaluate(() => ({ src: planSource, active: document.querySelector('#planSourceBar .active').dataset.src }));
  if (s0.src !== 'excel' || s0.active !== 'excel' || JSON.stringify(await rows()) !== '["E1"]') fail('Excel-planeringen ska visas från början: ' + JSON.stringify(s0));
  await page.click('#planSourceBar [data-src="pp"]'); await page.waitForTimeout(500);
  await page.evaluate(() => { document.querySelector('.main-tabs [data-tab="tools"]').click(); });
  const s1 = await page.evaluate(() => ({ src: planSource, n: items.length, excelShown: getComputedStyle(document.querySelector('section[data-panel-id="excel"]')).display !== 'none', ppHidden: getComputedStyle(document.querySelector('section[data-panel-id="pp"]')).display === 'none', saved: localStorage.getItem('4dplan-source-test-project'), reset: window.__states.some(s => s && s.color === 'reset') }));
  if (s1.src !== 'pp' || s1.n !== 0 || s1.excelShown || s1.ppHidden || s1.saved !== 'pp' || !s1.reset) fail('Powerproject ska vara en egen, tom planering med sitt eget importblock: ' + JSON.stringify(s1));
  console.log('OK: växeln Excel/Powerproject – egen planering, eget importblock, 3D-färgerna nollställs');

  // 2) Läs in .pp: förvalt alla delar, område = sammanfattningsraden, ingen entreprenör (Victor 2026-10-06);
  //    det som väljs sparas till nästa gång. Baseline finns inte i importen (eget block).
  await page.evaluate(() => { document.querySelector('.main-tabs [data-tab="tools"]').click(); });
  await page.setInputFiles('#ppFile', { name: 'Huvudtidplan.pp', mimeType: 'application/octet-stream', buffer: await makePp(1) });
  await page.waitForSelector('#ppOptions:not(.hidden)', { timeout: 15000 });
  const o = await page.evaluate(() => ({ head: document.querySelector('.pp-head').innerText, groups: [...document.querySelectorAll('#ppOptions [data-ppg]')].map(c => c.closest('label').innerText.trim().split(/\s+/)[0] + (c.checked ? '+' : '-')), area: document.getElementById('ppAreaLib').selectedOptions[0].text, contr: document.getElementById('ppContractorLib').selectedOptions[0].text, bl: !!document.getElementById('ppBaseline') }));
  if (!/NSV-LKAB Huvudtidplan/.test(o.head) || !/5 aktiviteter/.test(o.head) || JSON.stringify(o.groups) !== '["Projekttidplan+","Building+"]' || o.area !== 'Sammanfattningsraden i tidplanen' || o.contr !== 'Ingen' || o.bl) fail('Inläsningen och förvalen: ' + JSON.stringify(o));
  // Välj zoner/Utförs av och bara projektet – sparas till nästa inläsning.
  await page.uncheck('#ppOptions [data-ppg="50"]');
  await page.evaluate(() => { document.querySelector('.pp-more').open = true; });
  const pickLib = (sel, re) => page.$eval(sel, (el, src) => { const o = [...el.options].find(x => new RegExp(src).test(x.text)); el.value = o.value; el.dispatchEvent(new Event('change', { bubbles: true })); }, re);
  await pickLib('#ppAreaLib', '^3\\.5 Zoner'); await pickLib('#ppContractorLib', '^1\\. Utförs av');
  console.log('OK: .pp-filen läses in direkt – förval: alla delar, sammanfattningsraden, ingen entreprenör; ingen baseline i importen');

  // 3) Förhandsgranska och importera.
  await page.click('#btnPpPreview'); await page.waitForTimeout(200);
  if (!(await page.isVisible('#planImportPreviewDialog'))) fail('Förhandsgranskningen ska öppnas');
  if (!/Ingen baseline är satt/.test(await page.innerText('#planImportSummary'))) fail('Importen ska säga att ingen baseline är satt');
  await page.click('#btnConfirmPlanImport'); await page.waitForTimeout(1500);
  const pp = get('pp/plan_items.json');
  if (!pp) fail('Powerproject-planeringen ska sparas i pp/plan_items.json');
  const by = Object.fromEntries(pp.map(r => [r.object_name, r]));
  if (Object.keys(by).sort().join(',') !== 'Gjutning bottenplatta,Montage stomme,Schakt,Tätt hus') fail('Aktiviteterna (utan länkrader, utan datumlösa, utan mallen): ' + Object.keys(by));
  const g = by['Gjutning bottenplatta'], m = by['Montage stomme'], sc = by['Schakt'], ms = by['Tätt hus'];
  if (g.area !== '7421 Sikthall del 1' || m.area !== 'PRODUKTION / 742 Sikthall' || g.contractor !== 'K20 UE Betong' || m.contractor !== 'K01 NCC Bygg') fail('Område (zon, annars sammanfattning) och entreprenör (egen, annars ärvd): ' + JSON.stringify([g.area, m.area, g.contractor, m.contractor]));
  if (g.start_date !== '2026-10-05' || g.end_date !== '2026-10-16' || g.activity !== '742 Sikthall' || ms.activity !== 'Milstolpe' || ms.start_date !== ms.end_date) fail('Datum och aktivitet: ' + JSON.stringify([g, ms]));
  if (sc.progress !== 100 || sc.actual_start_date !== '2026-09-02' || sc.actual_end_date !== '2026-09-15' || m.progress !== 50 || m.actual_start_date !== '2026-10-20' || m.actual_end_date) fail('Framdrift och verkliga datum: ' + JSON.stringify([sc, m].map(r => [r.progress, r.actual_start_date, r.actual_end_date])));
  if (JSON.stringify(g.depends_on) !== JSON.stringify([sc.id]) || JSON.stringify(m.depends_on) !== JSON.stringify([g.id]) || JSON.stringify(ms.depends_on) !== JSON.stringify([m.id]) || sc.depends_on.length) fail('Länkarna ska bli beroenden: ' + JSON.stringify(pp.map(r => [r.object_name, r.depends_on])));
  if (JSON.stringify(get('plan_items.json')) !== excelBefore) fail('Excel-planeringen får inte röras');
  if (JSON.stringify(await rows()) !== JSON.stringify(['Gjutning bottenplatta', 'Montage stomme', 'Schakt', 'Tätt hus'])) fail('Listan ska visa Powerproject-aktiviteterna');
  if (!/Import klar/.test(await page.innerText('#ppStatus'))) fail('Importen ska bekräftas i blocket');
  if (pp.some(r => r.baseline_start_date) || get('pp/plan_baseline.json') || get('pp/plan_baselines.json')) fail('Importen ska inte skapa någon baseline');
  console.log('OK: import – aktiviteter, milstolpe, zon/entreprenör, framdrift, verkliga datum och beroenden; Excel orörd; ingen baseline');

  // 4) Ny version: omdöpt och flyttad aktivitet känns igen (samma id, kopplingen kvar). Valen är sparade.
  await page.evaluate(id => { items.find(x => x.id === id).modelId = 'm1'; }, g.id);
  // Glapp satt i dashboarden (Victor 2026-10-07) ska överleva importen – bara för kopplingar som finns kvar.
  await page.evaluate(async ([id, sid]) => { await ghWriteJSON(settings.githubToken, itemsPath(), arr => arr.map(r => r.id === id ? { ...r, model_id: 'm1', object_id: '77', dep_lags: { [sid]: 2, borta: 5 } } : r), 'koppla'); await refreshItems(); }, [g.id, sc.id]);
  await page.setInputFiles('#ppFile', { name: 'Huvudtidplan v2.pp', mimeType: 'application/octet-stream', buffer: await makePp(2) });
  await page.evaluate(() => document.getElementById('ppOptions').classList.add('hidden')); await page.click('#btnPpRead'); await page.waitForSelector('#ppOptions:not(.hidden)');
  const o2 = await page.evaluate(() => ({ building: document.querySelector('#ppOptions [data-ppg="50"]').checked, area: document.getElementById('ppAreaLib').selectedOptions[0].text }));
  if (o2.building || !/3\.5 Zoner/.test(o2.area)) fail('Valen ska sparas till nästa inläsning: ' + JSON.stringify(o2));
  await page.locator('section[data-panel-id="pp"]').screenshot({ path: path.join(require('os').tmpdir(), 'pp_panel.png') });
  await page.click('#btnPpPreview'); await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelectorAll('.plan-import-changes').forEach(d => d.open = true));
  const ch = await page.innerText('#planImportSummary');
  if (!/1 nya datum \(1 senare, 0 tidigare/.test(ch) || !/\+28 d Gjutning bottenplatta etapp 1/.test(ch) || !/05\/10–16\/10 → 02\/11–13\/11/.test(ch) || !/1 nytt namn eller område/.test(ch)) fail('Ändringarna i detalj: ' + ch);
  await page.locator('#planImportPreviewDialog .dialog-box').screenshot({ path: path.join(require('os').tmpdir(), 'pp_preview_changes.png') });
  await page.click('#btnConfirmPlanImport'); await page.waitForTimeout(1500);
  const pp2 = get('pp/plan_items.json'), g2 = pp2.find(r => r.id === g.id);
  if (pp2.length !== 4 || !g2 || g2.object_name !== 'Gjutning bottenplatta etapp 1' || g2.start_date !== '2026-11-02' || g2.model_id !== 'm1' || g2.object_id !== '77') fail('En ny version ska uppdatera samma aktivitet och behålla 3D-kopplingen: ' + JSON.stringify(g2));
  if (g2.baseline_start_date) fail('Importen ska inte sätta baseline: ' + JSON.stringify(g2));
  if (JSON.stringify(g2.dep_lags) !== JSON.stringify({ [sc.id]: 2 })) fail('Glappet ska följa med kopplingen: ' + JSON.stringify(g2.dep_lags));
  console.log('OK: ny version av tidplanen – samma aktiviteter uppdateras (namn, datum), 3D-kopplingen kvar; valen sparade');
  // Översta raden omdöpt i Powerproject: aktiviteterna känns ändå igen på sitt id.
  await page.setInputFiles('#ppFile', { name: 'Huvudtidplan v3.pp', mimeType: 'application/octet-stream', buffer: await makePp(3) });
  await page.evaluate(() => document.getElementById('ppOptions').classList.add('hidden')); await page.click('#btnPpRead'); await page.waitForSelector('#ppOptions:not(.hidden)');
  await page.click('#btnPpPreview'); await page.waitForTimeout(200);
  const prev3 = await page.evaluate(() => ({ create: planImportDiff.toCreate.length, update: planImportDiff.toUpdate.length }));
  await page.click('#btnConfirmPlanImport'); await page.waitForTimeout(1500);
  const pp3 = get('pp/plan_items.json'), g3 = pp3.find(r => r.id === g.id);
  if (prev3.create !== 0 || pp3.length !== 4 || !g3 || g3.model_id !== 'm1' || !/^PP Projekttidplan rev B\|\|/.test(g3.source_key)) fail('Omdöpt översta rad ska inte ge nya aktiviteter: ' + JSON.stringify({ prev3, n: pp3.length, g3 }));
  console.log('OK: omdöpt översta rad i Powerproject – aktiviteterna känns igen på id, kopplingen kvar');

  // Blocket Baseline: huvudbaselinen från en .ppb (förhandsgranskas), sedan borttagen.
  const blk = async (setup, guard) => {
    await page.evaluate(() => { document.querySelector('.main-tabs [data-tab="tools"]').click(); });
    if (setup) await setup();
    await page.click('#btnPpBlPreview'); await page.waitForTimeout(200);
    const sum = await page.innerText('#ppBlSummary');
    if (guard) await guard();
    await page.click('#btnPpBlConfirm'); await page.waitForTimeout(2500);
    return sum;
  };
  await page.click('#btnPpBlPreview'); await page.waitForTimeout(100);
  if (!/Välj baseline-filen/.test(await page.innerText('#ppBlStatus'))) fail('Utan vald baseline-fil ska det sägas till');
  const bsum = await blk(async () => {
    await page.setInputFiles('#ppBlFile', { name: 'Huvudtidplan BL1.ppb', mimeType: 'application/octet-stream', buffer: await makePp(2) });
    await page.waitForFunction(() => /känns igen/.test(document.getElementById('ppBlFileInfo').innerText), null, { timeout: 15000 });
  });
  if (!/Huvudtidplan BL1\.ppb – 4 av 4/.test(bsum) || !/0 ligger senare än baseline · 1 tidigare · 3 oförändrade/.test(bsum) || !/Mest tidigarelagda:[\s\S]*-28 d Gjutning bottenplatta/.test(bsum)) fail('Förhandsgranskningen av baseline: ' + bsum);
  let g4 = get('pp/plan_items.json').find(r => r.id === g.id), bm4 = get('pp/plan_baseline.json'), reg = get('pp/plan_baselines.json');
  if (g4.baseline_start_date !== '2026-11-02' || g4.baseline_end_date !== '2026-11-13' || g4.start_date !== '2026-10-05' || bm4[bm4.length - 1].label !== 'Huvudtidplan BL1' || !reg || reg[0].id !== 'main' || !reg[0].set_at) fail('Baseline från .ppb (bara baseline-datumen): ' + JSON.stringify([g4, bm4, reg]));
  if (await page.inputValue('#ppBlTarget') !== '__new') fail('Satt huvudbaseline → Ny baseline förvald');
  await blk(async () => { await page.selectOption('#ppBlTarget', 'main'); await page.selectOption('#ppBlSource', 'none'); }, async () => {
    // Ta bort kräver att namnet skrivs.
    if (!(await page.isDisabled('#btnPpBlConfirm')) || await page.innerText('#btnPpBlConfirm') !== 'Ta bort baseline') fail('Ta bort ska vara spärrat tills namnet skrivs');
    await page.fill('#ppBlGuardText', 'Basel'); if (!(await page.isDisabled('#btnPpBlConfirm'))) fail('Fel namn ska inte räcka');
    await page.fill('#ppBlGuardText', 'Baseline');
  });
  g4 = get('pp/plan_items.json').find(r => r.id === g.id); bm4 = get('pp/plan_baseline.json');
  if (g4.baseline_start_date || bm4[bm4.length - 1].label !== null) fail('Ta bort ska ta bort den: ' + JSON.stringify([g4, bm4]));
  console.log('OK: blocket Baseline – .ppb förhandsgranskas och sparas (bara baseline-datumen), och kan tas bort');

  // Flyttad i Powerproject med nytt id: känns igen på GUID (Montage) eller som enda med namnet (Schakt).
  const before4 = Object.fromEntries(get('pp/plan_items.json').map(r => [r.object_name, r.id]));
  await page.setInputFiles('#ppFile', { name: 'Huvudtidplan v4.pp', mimeType: 'application/octet-stream', buffer: await makePp(4) });
  await page.evaluate(() => document.getElementById('ppOptions').classList.add('hidden')); await page.click('#btnPpRead'); await page.waitForSelector('#ppOptions:not(.hidden)');
  await page.click('#btnPpPreview'); await page.waitForTimeout(200);
  const prev4 = await page.evaluate(() => ({ create: planImportDiff.toCreate.length, removed: planImportDiff.removedExisting.length }));
  await page.click('#btnConfirmPlanImport'); await page.waitForTimeout(1500);
  const pp4 = get('pp/plan_items.json'), by4 = Object.fromEntries(pp4.map(r => [r.object_name, r]));
  if (prev4.create || prev4.removed || pp4.length !== 4 || by4['Montage stomme'].id !== before4['Montage stomme'] || !/\|\|111$/.test(by4['Montage stomme'].source_key)
    || by4['Schakt'].id !== before4['Schakt'] || !/\|\|112$/.test(by4['Schakt'].source_key) || by4['Montage stomme'].pp_guid !== '{6F319DCE-1824-4C1B-8B1A-8C35B46CCD3D}')
    fail('En flyttad aktivitet med nytt id ska kännas igen: ' + JSON.stringify({ prev4, pp4: pp4.map(r => [r.object_name, r.id, r.source_key, r.pp_guid]) }));
  if (JSON.stringify(by4['Gjutning bottenplatta'].depends_on) !== JSON.stringify([by4['Schakt'].id])) fail('Beroendena ska följa med');
  console.log('OK: flyttad aktivitet med nytt id i Powerproject känns igen (GUID, annars samma namn) – ingen ny, ingen borttagen');

  // Kontraktstidplan: sätts aktivt i blocket (tidplanen som gäller nu, med namn). Nästa import rör den
  // inte – bara den nya aktiviteten får sitt första datum som baseline.
  const imp = async (name, v) => {
    await page.setInputFiles('#ppFile', { name, mimeType: 'application/octet-stream', buffer: await makePp(v) });
    await page.evaluate(() => document.getElementById('ppOptions').classList.add('hidden')); await page.click('#btnPpRead'); await page.waitForSelector('#ppOptions:not(.hidden)');
    await page.click('#btnPpPreview'); await page.waitForTimeout(200);
    const sum = await page.innerText('#planImportSummary');
    await page.click('#btnConfirmPlanImport'); await page.waitForTimeout(1500);
    return sum;
  };
  await blk(async () => { await page.selectOption('#ppBlSource', 'current'); await page.click('#ppBlRename'); await page.fill('#ppBlName', 'Kontraktstidplan'); });
  let rows5 = Object.fromEntries(get('pp/plan_items.json').map(r => [r.object_name, r]));
  reg = get('pp/plan_baselines.json');
  if (rows5['Gjutning bottenplatta'].baseline_start_date !== '2026-10-05' || reg[0].id !== 'main' || reg[0].name !== 'Kontraktstidplan' || reg[0].mode !== 'current') fail('Kontraktstidplanen som huvudbaseline: ' + JSON.stringify([rows5['Gjutning bottenplatta'], reg]));
  if (!/★ Kontraktstidplan · 4 akt\./.test(await page.$eval('#ppBlTarget', el => [...el.options].map(o => o.text).join('|')))) fail('Baselinen ska visas med namn och antal');
  const sum5 = await imp('Huvudtidplan v5.pp', 5);
  rows5 = Object.fromEntries(get('pp/plan_items.json').map(r => [r.object_name, r]));
  if (rows5['Gjutning bottenplatta etapp 1'].baseline_start_date !== '2026-10-05' || rows5['Ny aktivitet'].baseline_start_date !== '2026-12-01' || rows5['Ny aktivitet'].baseline_end_date !== '2026-12-05')
    fail('Kontraktsbaselinen ska ligga kvar och den nya aktiviteten få sitt första datum: ' + JSON.stringify(Object.values(rows5).map(r => [r.object_name, r.baseline_start_date])));
  if (!/Baseline “Kontraktstidplan”/.test(sum5) || !/rörs inte; 1 ny aktivitet får sitt första datum som baseline/.test(sum5)) fail('Förhandsgranskningen ska förklara påfyllningen: ' + sum5);
  if (get('pp/plan_baselines.json')[0].source !== reg[0].source) fail('Källan för kontraktstidplanen ska inte ändras av påfyllningen');
  console.log('OK: kontraktstidplanen sätts aktivt och ligger kvar – en ny aktivitet får sitt första datum som baseline');

  // En namngiven revision bredvid: "Rev 1 – ÄTA 12" från en .ppb; huvudbaselinen orörd.
  await page.selectOption('#ppBlTarget', '__new');
  await page.selectOption('#ppBlSource', 'file');
  await page.click('#btnPpBlPreview'); await page.waitForTimeout(100);
  if (!/Ge den nya baselinen ett namn/.test(await page.innerText('#ppBlStatus'))) fail('En ny baseline ska kräva ett namn');
  await blk(async () => {
    await page.fill('#ppBlName', 'Rev 1 – ÄTA 12');
    await page.setInputFiles('#ppBlFile', { name: 'Rev1.ppb', mimeType: 'application/octet-stream', buffer: await makePp(1) });
    await page.waitForFunction(() => /känns igen/.test(document.getElementById('ppBlFileInfo').innerText), null, { timeout: 15000 });
  });
  reg = get('pp/plan_baselines.json'); rows5 = Object.fromEntries(get('pp/plan_items.json').map(r => [r.object_name, r]));
  const rev = reg.find(r => r.name === 'Rev 1 – ÄTA 12');
  const gj = rows5['Gjutning bottenplatta etapp 1'];
  if (reg.length !== 2 || !rev || rev.mode !== 'file' || !gj.baselines || JSON.stringify(gj.baselines[rev.id]) !== JSON.stringify(['2026-10-05', '2026-10-16']) || gj.baseline_start_date !== '2026-10-05' || rows5['Ny aktivitet'].baseline_start_date !== '2026-12-01')
    fail('Namngiven revision bredvid huvudbaselinen: ' + JSON.stringify([reg, gj]));
  await imp('Huvudtidplan v5.pp', 5);
  if (JSON.stringify(Object.fromEntries(get('pp/plan_items.json').map(r => [r.object_name, r])).Schakt.baselines) !== JSON.stringify(rows5.Schakt.baselines)) fail('Revisionen ska följa med vid nästa import');
  // Byt bara namn.
  await blk(async () => { await page.selectOption('#ppBlTarget', rev.id); await page.selectOption('#ppBlSource', 'keep'); await page.click('#ppBlRename'); await page.fill('#ppBlName', 'Rev 1 – ÄTA 12 (godkänd)'); });
  if (!get('pp/plan_baselines.json').some(r => r.id === rev.id && r.name === 'Rev 1 – ÄTA 12 (godkänd)') || JSON.stringify(get('pp/plan_items.json').find(r => r.object_name === 'Schakt').baselines) !== JSON.stringify(rows5.Schakt.baselines)) fail('Byt namn ska bara byta namn');
  console.log('OK: namngiven baseline (Rev 1 – ÄTA 12) sparas bredvid kontraktstidplanen, följer med vid nästa import och kan byta namn');

  // Idiotsäkert: satt huvudbaseline → förslaget är en ny baseline; att ersätta den kräver en bock; ångra.
  await page.evaluate(() => { document.querySelector('.main-tabs [data-tab="tools"]').click(); });
  if (await page.inputValue('#ppBlTarget') !== '__new') fail('Med en satt huvudbaseline ska "Ny baseline" vara förvalt');
  if (!/🔒 Kontraktstidplan[\s\S]*🔒 Rev 1 – ÄTA 12 \(godkänd\)/.test(await page.innerText('#ppBlOverview'))) fail('Översikten ska visa baselinerna: ' + await page.innerText('#ppBlOverview'));
  await page.locator('section[data-panel-id="ppbl"]').screenshot({ path: path.join(require('os').tmpdir(), 'pp_baseline_block.png') });
  await blk(async () => { await page.selectOption('#ppBlTarget', 'main'); await page.selectOption('#ppBlSource', 'current'); }, async () => {
    await page.locator('#ppBlDialog .dialog-box').screenshot({ path: path.join(require('os').tmpdir(), 'pp_baseline_replace.png') });
    const g0 = { dis: await page.isDisabled('#btnPpBlConfirm'), txt: await page.innerText('#btnPpBlConfirm'), sum: (await page.innerText('#ppBlSummary')).slice(0, 200) }; if (!g0.dis || g0.txt !== 'Ersätt baseline' || !/Kontraktstidplan finns redan/.test(g0.sum)) fail('Att ersätta en satt baseline ska kräva en bock: ' + JSON.stringify(g0));
    await page.check('#ppBlGuardCheck');
  });
  if (get('pp/plan_items.json').find(r => r.object_name === 'Gjutning bottenplatta etapp 1').baseline_start_date !== '2026-11-02') fail('Ersätt ska ersätta');
  await page.waitForSelector('#btnPpBlUndo:not(.hidden)');
  if (!/Ångra ändringen av Kontraktstidplan/.test(await page.innerText('#btnPpBlUndo'))) fail('Ångra-knappen ska visas: ' + await page.innerText('#btnPpBlUndo'));
  await page.click('#btnPpBlUndo'); await page.waitForTimeout(2500);
  const und = Object.fromEntries(get('pp/plan_items.json').map(r => [r.object_name, r]));
  if (und['Gjutning bottenplatta etapp 1'].baseline_start_date !== '2026-10-05' || und['Ny aktivitet'].baseline_start_date !== '2026-12-01' || get('pp/plan_baselines.json').find(r => r.id === 'main').mode !== 'current') fail('Ångra ska lägga tillbaka kontraktstidplanen: ' + JSON.stringify(und['Gjutning bottenplatta etapp 1']));
  console.log('OK: idiotsäkert – ny baseline förvald när huvudbaselinen finns, ersätt kräver bock, ta bort kräver namnet, ångra lägger tillbaka');

  // 5) Tillbaka till Excel: Excel-planeringen igen; Lägesplan öppnas med rätt planering.
  await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return { closed: false, focus() {} }; }; });
  await page.click('#btnStatusPlan'); await page.waitForTimeout(100);
  await page.click('#planSourceBar [data-src="excel"]'); await page.waitForTimeout(500);
  if (JSON.stringify(await rows()) !== '["E1"]') fail('Excel-planeringen ska visas igen');
  const opened = await page.evaluate(() => window.__opened);
  if (!opened.length || !/source=pp/.test(opened[0])) fail('Lägesplan ska öppnas med Powerproject-planeringen när den är vald: ' + JSON.stringify(opened));
  console.log('OK: tillbaka till Excel; Lägesplan öppnas med den valda planeringen');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('ALLA TESTER OK');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
