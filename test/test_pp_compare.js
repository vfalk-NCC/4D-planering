// Jämförelse av två Powerproject-tidplaner: HTML-rapport över nya datum, framdrift, namnbyten, nya och borttagna aktiviteter.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8994;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
const PID = 'test-project';
const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const get = f => { const e = store.get(`projects/${PID}/${f}`); return e ? JSON.parse(e.content) : null; };
put('plan_items.json', []); put('plan_item_activities.json', []); put('plan_item_comments.json', []);

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
    CREATE TABLE TASK_COMPLETED_SECTION (TASK INT, OVERALL_PERCENT_COMPLETE, ACTUAL_START, ACTUAL_END, DURATION);
    CREATE TABLE PERMANENT_RESOURCE (ID INT, NAME); CREATE TABLE PERM_RESOURCE_SKILL (ID INT, PLAYER INT, ROLE INT);
    CREATE TABLE PERMANENT_SCHEDUL_ALLOCATION (ALLOCATION_OF INT, ALLOCATED_TO INT, EFFORT, ALLOCATION, LINKABLE_START, LINKABLE_FINISH);`);
  // Resurser (Victor 2026-10-08): 4 betongarbetare på gjutningen (320 h), mallens aktivitet 1 snickare.
  db.run('INSERT INTO PERMANENT_RESOURCE VALUES (1, "R012 Betongarbetare"), (2, "R01 Byggnadsarbetare")');
  db.run('INSERT INTO PERM_RESOURCE_SKILL VALUES (501, 1, 0), (502, 2, 0)');
  db.run(`INSERT INTO PERMANENT_SCHEDUL_ALLOCATION VALUES (501, 100, ${4 * 80 * 3600}, 4, '2026-10-05 08:00:00', '2026-10-16 16:00:00'), (502, 200, ${40 * 3600}, 1, '2015-01-02 08:00:00', '2015-01-09 16:00:00')`);
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
  await page.click('#planSourceBar [data-src="pp"]'); await page.waitForTimeout(400);
  await page.evaluate(() => { document.querySelector('.main-tabs [data-tab="tools"]').click(); });
  await page.setInputFiles('#ppCmpA', { name: 'Tidplan v1.pp', mimeType: 'application/octet-stream', buffer: await makePp(1) });
  await page.setInputFiles('#ppCmpB', { name: 'Tidplan v5.pp', mimeType: 'application/octet-stream', buffer: await makePp(5) });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.getElementById('btnPpCmp').click())]);
  const file = process.env.PPC_OUT || '/tmp/ppcmp.html'; await dl.saveAs(file);
  const h = fs.readFileSync(file, 'utf8');
  if (!/Jämförelse av tidplaner/.test(h) || !/Tidplan v1\.pp/.test(h) || !/Tidplan v5\.pp/.test(h)) fail('Rubrik och filnamn saknas');
  if (!/Gjutning bottenplatta etapp 1/.test(h)) fail('Namnbyte/nytt namn saknas');
  if (!/Ny aktivitet/.test(h)) fail('Ny aktivitet saknas');
  if (!/\+28 d/.test(h)) fail('Förskjutningen (+28 d) saknas');
  if (/Tas bort/.test(h)) fail('Kolumnen "Tas bort" ska inte finnas i jämförelsen');
  // Samma fil mot sig själv: inga ändringar.
  await page.setInputFiles('#ppCmpB', { name: 'Tidplan v1 igen.pp', mimeType: 'application/octet-stream', buffer: await makePp(1) });
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => document.getElementById('btnPpCmp').click())]);
  await dl2.saveAs('/tmp/ppcmp2.html'); const h2 = fs.readFileSync('/tmp/ppcmp2.html', 'utf8');
  if (/\+28 d|Ny aktivitet/.test(h2)) fail('Likadana filer ska inte ge några ändringar');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('ALLA TESTER OK'); await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
