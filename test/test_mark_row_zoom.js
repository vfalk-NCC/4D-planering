// Funktionstest: klick på en aktivitet med manuell markering zoomar dit som
// till ett kopplat objekt – utan felruta när aktiviteten saknar 3D-objekt,
// och utan dubbla kameraflyttar när den har både objekt och markering.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8977;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PID = 'test-project';

const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const get = f => { const e = store.get(`projects/${PID}/${f}`); return e ? JSON.parse(e.content) : null; };
const base = { project_id: PID, area: 'Hus A', contractor: 'NCC', status: 'planerad', progress: 0, depends_on: [], start_date: '2026-10-01', end_date: '2026-10-10' };
put('plan_items.json', [
  { ...base, id: 'h', group_id: 'g1', model_id: null, object_id: 'excel-h', object_name: 'Gjutning plan 2', progress: 30, activity: 'Formning + Gjutning' },
  { ...base, id: 'a1', group_id: 'g1', model_id: 'm1', object_id: '10', object_name: 'Gjutning plan 2', progress: 30, start_date: '2026-10-01', end_date: '2026-10-04' },
  { ...base, id: 'a2', group_id: 'g1', model_id: 'm1', object_id: '11', object_name: 'Gjutning plan 2', progress: 30, start_date: '2026-10-08', end_date: '2026-10-10' },
  { ...base, id: 'b1', group_id: 'g2', model_id: 'm1', object_id: '20', object_name: 'Gammal data', progress: 20 },
  { ...base, id: 'b2', group_id: 'g2', model_id: 'm1', object_id: '21', object_name: 'Gammal data', progress: 80 },
  { ...base, id: 'u', model_id: null, object_id: 'excel-u', object_name: 'Bara markering' },
  { ...base, id: 'c', model_id: 'm1', object_id: '30', object_name: 'Annan', progress: 10 },
]);
put('plan_item_activities.json', [
  { id: 'x1', plan_item_id: 'a1', project_id: PID, name: 'Formning', start_date: '2026-10-01', end_date: '2026-10-04' },
  { id: 'x2', plan_item_id: 'a2', project_id: PID, name: 'Gjutning', start_date: '2026-10-08', end_date: '2026-10-10' },
]);
put('plan_item_comments.json', []);
put('plan_markups.json', [{ id: 'm1', itemId: 'u', shape: 'area', pts: [[10,10,0],[20,10,0],[20,20,0]] }, { id: 'm2', itemId: 'a1', shape: 'line', pts: [[50,50,0],[60,50,0]] }]);

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
        setCamera: () => Promise.resolve(), getCamera: () => Promise.resolve({ position: { x: 0, y: 0, z: 10 }, lookAt: { x: 0, y: 1, z: 9 }, fieldOfView: 60 }),
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
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.__cams = []; const o = API.viewer.setCamera; API.viewer.setCamera = (c, opt) => { window.__cams.push(JSON.stringify(c).slice(0, 120)); return o(c, opt); }; });
  const fail = m => { throw new Error(m); };
  const clickRow = async name => { await page.evaluate(() => { window.__cams = []; }); asked.length = 0;
    await page.locator('#itemList .item-row:not(.group-member)', { hasText: name }).first().locator('.item-main').click(); await page.waitForTimeout(800);
    return page.evaluate(() => window.__cams); };
  let cams = await clickRow('Bara markering');
  if (asked.length) fail('ingen felruta ska visas, fick ' + JSON.stringify(asked));
  if (cams.length !== 1 || !cams[0].includes('"lookAt":{"x":15,"y":15')) fail('kameran ska zooma till markeringen, fick ' + JSON.stringify(cams));
  cams = await clickRow('Gjutning plan 2');
  if (cams.length !== 1 || !cams[0].includes('modelObjectIds')) fail('med objekt ska kameran flyttas en gång, till objekten, fick ' + JSON.stringify(cams));
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK: aktiviteter med manuell markering zoomas som kopplade objekt');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
