// Funktionstest: framdrift, status och verkliga datum hör till huvudaktiviteten –
// ändras de på ett objekt (t.ex. ett som bara är kopplat till en delaktivitet)
// följer resten av aktiviteten med, medan datumen stannar per objekt.
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
  { ...base, id: 'h', group_id: 'g1', model_id: null, object_id: 'excel-h', object_name: 'Gjutning plan 2', progress: 30 },
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
  const row = id => get('plan_items.json').find(r => r.id === id);
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // 1) Status på ett objekt som bara hör till en delaktivitet → hela aktiviteten
  await page.evaluate(() => setStatusQuick([items.find(x => x.id === 'a2')], 'pagaende'));
  await page.waitForTimeout(1200);
  const st = ['h', 'a1', 'a2'].map(id => row(id).status).join(',');
  if (st !== 'pagaende,pagaende,pagaende') fail('status ska spridas till hela aktiviteten, fick ' + st);
  if (row('c').status !== 'planerad') fail('andra aktiviteter ska inte påverkas');
  console.log('OK: status på ett delaktivitetsobjekt gäller hela aktiviteten');

  // 2) Framdrift + verkligt avslut via ett enskilt objekt (som "Redigera markerade")
  await page.evaluate(() => {
    const it = items.find(x => x.id === 'a1');
    const records = [{ ...it, progress: 100, status: 'klar', actualEndDate: '2026-10-09' }];
    applyOptimisticRecords(records);
    const jobId = ++saveJobCounter;
    saveJobs.set(jobId, { id: jobId, records, label: 't', status: 'pending', error: null });
    runSaveJob(jobId);
  });
  await page.waitForTimeout(1500);
  for (const id of ['h', 'a1', 'a2']) {
    const r = row(id);
    if (r.progress !== 100 || r.status !== 'klar' || r.actual_end_date !== '2026-10-09') fail(`${id} ska följa huvudaktiviteten, fick ` + JSON.stringify(r));
  }
  if (row('a1').start_date !== '2026-10-01' || row('a2').start_date !== '2026-10-08') fail('datumen ska stanna per objekt/delaktivitet');
  console.log('OK: framdrift, status och verkligt avslut följer huvudaktiviteten, datumen stannar per delaktivitet');

  // 3) Äldre data där objekten skiljer sig: listan visar aktivitetens (högsta) framdrift
  const txt = await page.locator('#itemList .item-row:not(.group-member)', { hasText: 'Gammal data' }).first().innerText();
  if (!txt.includes('Framdrift 80%')) fail('aktivitetsraden ska visa huvudaktivitetens framdrift, fick ' + txt);
  console.log('OK: aktivitetsraden visar huvudaktivitetens framdrift');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK: framdriften baseras på huvudaktiviteten');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
