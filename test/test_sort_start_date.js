// Funktionstest: sortering på A-Ö och startdatum i "Planerade objekt" –
// sorteringen sker inom varje grupp, och en aktivitet med flera objekt
// placeras efter sitt tidigaste startdatum. "Visa endast ej kopplade" visar
// bara aktiviteter utan 3D-objekt och utan manuell markering.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8956;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PID = 'test-project';

const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const get = f => { const e = store.get(`projects/${PID}/${f}`); return e ? JSON.parse(e.content) : null; };
const base = { project_id: PID, area: 'Hus A', contractor: 'NCC', status: 'planerad', progress: 0, depends_on: [], start_date: '2026-10-01', end_date: '2026-10-10' };
put('plan_items.json', [
  { ...base, id: 'x', model_id: 'm1', object_id: '1', object_name: 'Alfa', start_date: '2026-10-05' },
  { ...base, id: 'y', model_id: 'm1', object_id: '2', object_name: 'Beta', start_date: '2026-10-01' },
  { ...base, id: 'g1', group_id: 'g', model_id: 'm1', object_id: '3', object_name: 'Cesar', start_date: '2026-10-08' },
  { ...base, id: 'g2', group_id: 'g', model_id: 'm1', object_id: '4', object_name: 'Cesar', start_date: '2026-10-02' },
  { ...base, id: 'd', model_id: 'm1', object_id: '5', object_name: 'Delta', start_date: null, end_date: null },
  { ...base, id: 'u', area: 'Hus B', model_id: null, object_id: 'excel-u', object_name: 'Okopplad', start_date: '2026-11-01' },
  { ...base, id: 'mk', area: 'Hus B', model_id: null, object_id: 'excel-mk', object_name: 'Ritad', start_date: '2026-11-02' },
  { ...base, id: 'z', area: 'Hus B', model_id: 'm1', object_id: '6', object_name: 'Aaa', start_date: '2026-09-01' },
]);
put('plan_item_activities.json', []);
put('plan_item_comments.json', []);
put('plan_markups.json', [{ id: 'm', itemId: 'mk', shape: 'line', pts: [[0, 0, 0], [1, 0, 0]] }]);

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
  const order = () => page.evaluate(() => [...document.querySelectorAll('#itemList .group-header .group-title, #itemList .item-row:not(.group-member) .item-name')].map(e => e.textContent.split(' (')[0].trim()));
  const nameOf = async () => (await order()).join('|');

  let o = await nameOf();
  if (!/^Hus A\|.*Alfa.*Beta.*Cesar.*Delta.*\|Hus B\|.*Aaa/.test(o)) fail('A-Ö inom varje område, fick ' + o);
  console.log('OK: A-Ö sorterar inom varje område');

  await page.selectOption('#sortBy', 'start'); await page.waitForTimeout(200);
  o = await nameOf();
  if (!/^Hus A\|.*Beta.*Cesar.*Alfa.*Delta.*\|Hus B\|.*Aaa/.test(o)) fail('startdatum inom varje område (aktivitet efter tidigaste objekt, utan datum sist), fick ' + o);
  console.log('OK: Startdatum sorterar inom varje område, aktiviteten efter sitt tidigaste objekt');

  await page.selectOption('#groupBy', ''); await page.waitForTimeout(200);
  o = await nameOf();
  if (!/Aaa.*Beta.*Cesar.*Alfa.*Delta/.test(o)) fail('startdatum utan gruppering, fick ' + o);
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  if ((await page.inputValue('#sortBy')) !== 'start') fail('sorteringsvalet ska kommas ihåg');
  console.log('OK: sortering utan gruppering och valet sparas');

  await page.check('#uncoupledOnly'); await page.waitForTimeout(200);
  o = await nameOf();
  if (o !== 'Hus B|Okopplad') fail('"Visa endast ej kopplade" ska bara visa aktiviteter utan objekt och markering, fick ' + o);
  await page.uncheck('#uncoupledOnly'); await page.waitForTimeout(200);
  if (!(await nameOf()).includes('Alfa')) fail('avkryssat ska visa allt igen');
  console.log('OK: "Visa endast ej kopplade" filtrerar fram okopplade aktiviteter');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK: sortering på A-Ö och startdatum fungerar');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
