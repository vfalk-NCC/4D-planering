// Funktionstest: framdriftsreglage per delaktivitet – sparas på delaktiviteten
// för alla objekt som har den, och aktivitetens framdrift blir ett medel
// viktat på antal dagar.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8983;
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
  { ...base, id: 'c', model_id: 'm1', object_id: '30', object_name: 'Annan', progress: 10 },
]);
put('plan_item_activities.json', [
  { id: 'x1', plan_item_id: 'a1', project_id: PID, name: 'Formning', start_date: '2026-10-01', end_date: '2026-10-04' },
  { id: 'x2', plan_item_id: 'a2', project_id: PID, name: 'Gjutning', start_date: '2026-10-08', end_date: '2026-10-10' },
]);
put('plan_item_comments.json', []);
put('plan_markups.json', []);

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
  const row = page.locator('#itemList .item-row:not(.group-member)', { hasText: 'Gjutning plan 2' }).first();
  await row.locator('[data-action="toggle-subs"]').click(); await page.waitForTimeout(200);
  const sub = page.locator('.sub-rows .sub-row', { hasText: 'Formning' }).first();
  if (!(await sub.locator('[data-action="progress"]').count())) fail('delaktiviteten ska ha ett framdriftsreglage');
  await sub.locator('[data-action="progress"]').evaluate(el => { el.value = 100; el.dispatchEvent(new Event('input')); });
  await sub.locator('[data-action="progress-save"]').click(); await page.waitForTimeout(2000);
  const acts = get('plan_item_activities.json');
  const form = acts.filter(r => r.name === 'Formning').map(r => r.progress);
  if (form.length !== 1 || form.some(p => p !== 100)) fail('Formning ska få 100 %, fick ' + JSON.stringify(form));
  if (acts.find(r => r.name === 'Gjutning').progress) fail('Gjutning ska inte påverkas');
  const items = get('plan_items.json').filter(r => r.group_id === 'g1').map(r => r.progress);
  if (items.some(p => p !== 57)) fail('aktivitetens framdrift ska bli 57 % (4 dagar à 100 %, 3 dagar à 0 %), fick ' + JSON.stringify(items));
  const txt = await page.locator('.sub-rows .sub-row', { hasText: 'Formning' }).first().innerText();
  if (!txt.includes('100%')) fail('delaktivitetsraden ska visa 100%, fick ' + txt);
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK: framdrift per delaktivitet sparas och styr aktivitetens framdrift');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
