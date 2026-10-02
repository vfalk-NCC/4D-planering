// Typ (Victors önskemål 2026-10-01): texten efter koden på huvudraden i
// 4-veckorsplaneringen ("E14 - Fundament" -> Typ "Fundament") blir ett eget
// fält under Namn. Det går att sortera och gruppera på, söka på, och
// redigera i formuläret.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8957;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PID = 'test-project';

const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const get = f => { const e = store.get(`projects/${PID}/${f}`); return e ? JSON.parse(e.content) : null; };
const base = { project_id: PID, area: 'Hus A', contractor: 'NCC', status: 'planerad', progress: 0, depends_on: [], start_date: '2026-10-01', end_date: '2026-10-10' };
put('plan_items.json', [
  { ...base, id: 'a', model_id: 'm1', object_id: '1', object_name: 'E10', element_type: 'Fundament' },
  { ...base, id: 'b', model_id: 'm1', object_id: '2', object_name: 'E14', element_type: 'Kontrefor' },
  { ...base, id: 'c', model_id: 'm1', object_id: '3', object_name: 'E12', element_type: 'Fundament' },
  { ...base, id: 'd', model_id: 'm1', object_id: '4', object_name: 'A1' },
]);
put('plan_item_activities.json', []);
put('plan_item_comments.json', []);
put('plan_markups.json', [{ id: 'm', itemId: 'mk', shape: 'line', pts: [[0, 0, 0], [1, 0, 0]] }]);

(async () => {
  // Excel-tolkningen: Typ från huvudraden, inte från faser med samma kod.
  const { parsePlanSheet } = require('../docs/plan-excel-parser.js');
  const R = (b, c, k) => { const r = []; r[1] = b; r[2] = c; r[5] = '2026-10-12'; r[8] = '2026-10-22'; r[7] = 11; r[10] = k; r[13] = 0; return r; };
  const rows = [[], [], [], [], R('Linje E', 'Linje E', null), R(null, 'E10 - Fundament', 'DP2'), R(null, 'E14 - Fundament', 'DP2'), R(null, 'Grovbetong Fas 2', 'DP2'),
    R(null, 'E14 - Kontrefor', 'DP2'), R(null, 'Gjutning', 'DP2'), R(null, 'H18 - Formning', 'DP2'), R(null, 'H18 - Gjutning', 'DP2'), R(null, 'Maskinfundament', 'DP2')];
  rows.levels = [0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0];
  const got = parsePlanSheet(rows, '744 - FLÄKTHUS').map(x => `${x.objectName}:${x.elementType}`).join(',');
  if (got !== 'E10:Fundament,E14:Fundament,E14:Kontrefor,H18:null,Maskinfundament:null') throw new Error('Typ vid import: ' + got);
  console.log('OK: importen tar Typ från texten efter koden på huvudraden');

  const server = http.createServer((req, res) => fs.readFile(path.join(DOCS_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(req.url.split('?')[0])] || 'application/octet-stream' }); res.end(data);
  })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 520, height: 1600 } });
  require('./_reveal').autoReveal(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let answers = [];                 // svar på kommande confirm-dialoger (true/false)
  const asked = [];
  page.on('dialog', d => { asked.push(d.message()); const a = answers.length ? answers.shift() : true; a ? d.accept() : d.dismiss(); });
  await page.addInitScript(() => {
    localStorage.setItem('4dplan-unlocked', '1');
    localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' }));
  });
  await page.route('https://components.connect.trimble.com/**', r => r.fulfill({ contentType: 'application/javascript', body: `
    window.__sel = [];
    window.TrimbleConnectWorkspace = { connect: function(t, cb) { window.__cb = cb; return Promise.resolve({
      project: { getProject: () => Promise.resolve({ id: '${PID}' }) },
      extension: { requestPermission: () => Promise.resolve('x') },
      markup: { addLineMarkups: a => Promise.resolve(a.map((m, i) => ({ ...m, id: i + 1 }))), removeMarkups: () => Promise.resolve(), getLineMarkups: () => Promise.resolve([]) },
      viewer: {
        getSelection: () => Promise.resolve(window.__sel), convertToObjectIds: (m, r) => Promise.resolve(r.map(String)),
        convertToObjectRuntimeIds: (m, ids) => Promise.resolve(ids.map(Number)), setSelection: () => Promise.resolve(),
        setCamera: () => Promise.resolve(), getCamera: () => Promise.resolve({ position: { x: 0, y: 0, z: 10 } }),
        getObjectBoundingBoxes: (m, ids) => Promise.resolve(ids.map(id => ({ id, boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } }))),
        getObjectProperties: (m, ids) => Promise.resolve(ids.map(id => ({ id, product: { name: 'Objekt ' + id } }))),
        setObjectState: () => Promise.resolve(), getModels: () => Promise.resolve([]), toggleModel: () => Promise.resolve()
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
  await page.waitForTimeout(500);
  const order = () => page.evaluate(() => [...document.querySelectorAll('#itemList .group-header .group-title, #itemList .item-row:not(.group-member) .item-name')].map(e => e.textContent.split(' (')[0].trim()).join('|'));

  await page.selectOption('#groupBy', ''); await page.selectOption('#sortBy', 'type'); await page.waitForTimeout(200);
  let o = await order();
  if (o !== 'E10|E12|E14|A1') fail('Sortera på Typ: Fundament (A-Ö), Kontrefor, utan typ sist – fick ' + o);
  const tags = await page.evaluate(() => [...document.querySelectorAll('#itemList .type-tag')].map(e => e.textContent).join(','));
  if (tags !== 'Fundament,Fundament,Kontrefor') fail('Typen ska synas vid namnet, fick ' + tags);
  console.log('OK: sortering på Typ och typen syns i listan');

  await page.selectOption('#groupBy', 'elementType'); await page.waitForTimeout(200);
  o = await order();
  if (!/^Fundament\|E10\|E12\|Kontrefor\|E14\|Utan typ\|A1$/.test(o)) fail('Gruppering på Typ, fick ' + o);
  console.log('OK: gruppering på Typ');

  await page.fill('#itemSearch', 'kontre'); await page.waitForTimeout(300);
  o = await order();
  if (!o.includes('E14') || o.includes('E10')) fail('Sökning på typ, fick ' + o);
  await page.fill('#itemSearch', ''); await page.waitForTimeout(200);
  console.log('OK: sökning hittar typen');

  // Filter på Typ (filtren ovanför listan).
  await page.selectOption('#groupBy', '');
  await page.click('#btnListFilter');
  await page.click('#filterTypeChips .ms-btn');
  await page.check('#filterTypeChips input[data-value="Kontrefor"]'); await page.waitForTimeout(200);
  o = await order();
  if (o !== 'E14') fail('Filter på Typ Kontrefor, fick ' + o);
  if (!(await page.innerText('#activeFilterChips')).includes('Kontrefor')) fail('Typ-filtret ska synas som aktiv etikett');
  await page.mouse.click(5, 5);
  await page.screenshot({ path: process.env.SHOT || '/tmp/typfilter.png', clip: { x: 0, y: 0, width: 520, height: 700 } });
  await page.click('#activeFilterChips .active-chip button'); await page.waitForTimeout(200);
  if ((await order()).split('|').length !== 4) fail('✕ på etiketten ska ta bort Typ-filtret');
  console.log('OK: filter på Typ');

  // Källa: skapade i TC / från 4-veckorsplaneringen / från Excel-import.
  await page.evaluate(() => { items.find(i => i.id === 'b').sourceKey = 'k'; items.find(i => i.id === 'd').origin = 'excel'; items.find(i => i.id === 'c').origin = 'manuell'; buildFilterOptions(); renderItemList(); });
  await page.click('#btnListFilter').catch(() => {});
  if (!(await page.isVisible('#filterSourceChips'))) await page.click('#btnListFilter');
  await page.click('#filterSourceChips .ms-btn');
  await page.check('#filterSourceChips input[data-value="tc"]'); await page.waitForTimeout(200);
  o = await order();
  if (o.split('|').sort().join('|') !== 'E10|E12') fail('Källa Skapade i TC ska visa E10 och E12 (inte importerade), fick ' + o);
  if (!(await page.innerText('#activeFilterChips')).includes('Skapade i TC')) fail('Källfiltret ska synas som aktiv etikett');
  await page.mouse.click(5, 5);
  await page.click('#activeFilterChips .active-chip button'); await page.waitForTimeout(200);
  if ((await order()).split('|').length !== 4) fail('✕ på etiketten ska ta bort källfiltret');
  console.log('OK: filter på Källa (skapade i TC / importerade)');

  // Redigera: Typ finns under Namn och sparas.
  await page.evaluate(() => editItemFromList(items.find(i => i.id === 'd')));
  await page.waitForTimeout(300);
  if ((await page.inputValue('#fType')) !== '') fail('A1 har ingen typ');
  await page.evaluate(() => editItemFromList(items.find(i => i.id === 'b')));
  await page.waitForTimeout(300);
  if ((await page.inputValue('#fType')) !== 'Kontrefor') fail('Formuläret ska visa typen');
  const nameBox = await page.locator('#fName').boundingBox(), typeBox = await page.locator('#fType').boundingBox();
  if (!(typeBox.y > nameBox.y)) fail('Typ ska ligga under Namn');
  await page.fill('#fType', 'Pelarfundament');
  await page.click('#btnSaveLink'); await page.waitForTimeout(1200);
  const saved = get('plan_items.json').find(r => r.id === 'b');
  if (saved.element_type !== 'Pelarfundament') fail('Typen sparades inte: ' + JSON.stringify(saved));
  console.log('OK: Typ visas under Namn i formuläret och sparas');

  // Klar med slutdatum i framtiden (F28) ska vara grön i dag, inte gul/pågående.
  const ph = await page.evaluate(() => {
    const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
    const f28 = { startDate: d(-11), endDate: d(16), status: 'klar', progress: 100, actualStartDate: d(-11), actualEndDate: d(16) };
    const early = { startDate: d(5), endDate: d(10), status: 'klar', progress: 100, actualEndDate: d(10) };
    const going = { startDate: d(-5), endDate: d(16), status: 'pagaende', progress: 40 };
    // H30: 17 % men planerad (och importerad verklig) start om 10 dagar -> pågående i dag, ej påbörjad bakåt i tiden.
    const h30 = { startDate: d(10), endDate: d(36), status: 'planerad', progress: 17, actualStartDate: d(10) };
    const notStarted = { startDate: d(10), endDate: d(36), status: 'planerad', progress: 0 };
    return [computeItemPhase(f28, d(0), 7), computeItemPhase(f28, d(-3), 7), computeItemPhase(early, d(0), 7), computeItemPhase(going, d(0), 30),
      computeItemPhase(h30, d(0), 7), computeItemPhase(h30, d(-3), 7), computeItemPhase(notStarted, d(0), 7)].join(',');
  });
  if (ph !== 'klar,pagaende,klar,pagaende,pagaende,planerad,planerad') fail('Klar med framtida slutdatum ska vara klar i dag (och pågående bakåt i tiden), fick ' + ph);
  const parsedEnd = (() => { const { parsePlanSheet } = require('../docs/plan-excel-parser.js'); const fut = new Date(Date.now() + 16 * 864e5).toISOString().slice(0, 10);
    const r = []; r[1] = null; r[2] = 'F28 - Fundament'; r[5] = '2026-09-20'; r[8] = fut; r[7] = 28; r[10] = 'DP2'; r[13] = 1;
    const rows = [[], [], [], [], (() => { const h = []; h[1] = 'Linje F'; h[2] = 'Linje F'; return h; })(), r];
    return parsePlanSheet(rows, '744 - FLÄKTHUS')[0].actualEndDate; })();
  if (parsedEnd !== new Date().toISOString().slice(0, 10)) fail('Importen ska sätta verkligt avslut till senast i dag, fick ' + parsedEnd);
  console.log('OK: klar med slutdatum i framtiden räknas som klar i dag (3D grön)');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK: Typ fungerar (sortera, gruppera, söka, redigera)');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
