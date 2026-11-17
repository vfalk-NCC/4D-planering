// Huvudbrytaren 3D-styrning i 4D-planering: av vid start = inget skrivs till modellen (färg/synlighet); på = som förut; av igen = återställning;
// av i dashboarden stänger av den här också; rester från ett tidigare pass städas.
// eller svagt (inställning). Sparas som temporary i plan_items bara när det är satt.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8994;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PID = 'test-project';

const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const get = f => { const e = store.get(`projects/${PID}/${f}`); return e ? JSON.parse(e.content) : null; };
const base = { project_id: PID, area: 'Hus A', contractor: 'NCC', status: 'planerad', progress: 0, depends_on: [], start_date: '2026-10-01', end_date: '2026-10-10' };
put('plan_items.json', [
  { ...base, id: 'k', model_id: 'm1', object_id: '1', object_name: 'Mobilkran', activity: 'Lyft', temporary: true, start_date: '2026-10-01', end_date: '2026-10-10' },
  { ...base, id: 'n', model_id: 'm1', object_id: '2', object_name: 'Vägg', activity: 'Gjutning' },
  { ...base, id: 's', model_id: 'm1', object_id: '3', object_name: 'Stämp', activity: 'Stämpning', start_date: '2026-10-01', end_date: '2026-10-10', actual_end_date: '2026-10-06', progress: 100, status: 'klar', temporary: true },
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
  const ctx = await browser.newContext({ viewport: { width: 520, height: 1600 } }); const page = await ctx.newPage();
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
    window.__sel = []; window.__states = [];
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
        setObjectState: (sel, st) => { window.__states.push({ sel, st }); return Promise.resolve(); }, getModels: () => Promise.resolve([]), toggleModel: () => Promise.resolve()
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
  await page.waitForSelector('#mgaSwitch'); await page.waitForTimeout(400);
  const st = () => page.evaluate(() => window.__states.length);
  if (await page.evaluate(() => document.getElementById('mgaSwitch').checked)) fail('Brytaren ska vara av vid start');
  // 1) AV: varken tidslinjens färger eller direkta anrop når modellen; läsning fungerar
  await page.evaluate(async () => { window.__states = []; document.getElementById('timelineDate').value = '2026-10-05'; await applyTimelineColors(); await API.viewer.setObjectState(undefined, { color: { r: 1, g: 2, b: 3, a: 255 } }); await API.viewer.setObjectState(undefined, { visible: false }); });
  if (await st()) fail('Inget får skrivas till modellen när brytaren är av: ' + JSON.stringify(await page.evaluate(() => window.__states)));
  if (JSON.stringify(await page.evaluate(() => API.viewer.getSelection())) !== '[]') fail('Läsning ska fungera');
  // 2) PÅ: färgerna går igenom
  await page.click('#mgaLabel'); await page.waitForTimeout(300);
  if (!(await page.evaluate(() => mga.on))) fail('Brytaren slår på');
  await page.evaluate(async () => { window.__states = []; await applyTimelineColors(); });
  if (!(await st())) fail('Tidslinjen ska färga när brytaren är på');
  // 3) AV igen: återställning av färg och synlighet, därefter tyst
  await page.evaluate(() => { window.__states = []; });
  await page.click('#mgaLabel'); await page.waitForTimeout(400);
  const after = await page.evaluate(() => window.__states.map(s => s.st));
  if (!after.some(x => x && x.color === 'reset') || !after.some(x => x && x.visible === 'reset')) fail('Av återställer färg och synlighet: ' + JSON.stringify(after));
  await page.evaluate(async () => { window.__states = []; await applyTimelineColors(); });
  if (await st()) fail('Tyst efter avstängning');
  // 4) Av i dashboarden stänger av här; på delas aldrig
  const peer = await ctx.newPage(); await peer.goto(`http://localhost:${PORT}/style.css`);
  await peer.evaluate(() => { window.__ch = new BroadcastChannel('4d-gantt-link'); });
  await page.click('#mgaLabel'); await page.waitForTimeout(300);
  await peer.evaluate(() => window.__ch.postMessage({ t: 'modelOff' })); await page.waitForTimeout(500);
  if (await page.evaluate(() => mga.on)) fail('modelOff från dashboarden stänger av');
  await peer.evaluate(() => window.__ch.postMessage({ t: 'modelOn' })); await page.waitForTimeout(200);
  if (await page.evaluate(() => mga.on)) fail('På delas aldrig');
  // 5) Av i 4D-planering skickas till dashboarden
  await peer.evaluate(() => { window.__got = []; window.__ch.onmessage = e => window.__got.push(e.data); });
  await page.click('#mgaLabel'); await page.waitForTimeout(200); await page.click('#mgaLabel'); await page.waitForTimeout(500);
  if (!(await peer.evaluate(() => window.__got)).some(m => m.t === 'modelOff')) fail('Avstängning ska meddelas dashboarden');
  // 6) Omladdning: alltid av; rester från ett tidigare pass städas
  await page.evaluate(() => { localStorage.setItem('4dplan-model-touched', '1'); window.__states = []; });
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForSelector('#mgaSwitch'); await page.waitForTimeout(800);
  if (await page.evaluate(() => mga.on)) fail('Av efter omladdning');
  if (!(await page.evaluate(() => window.__states.some(s => s.st && s.st.color === 'reset'))) || await page.evaluate(() => localStorage.getItem('4dplan-model-touched'))) fail('Rester städas vid start');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK: 3D-styrning – av vid start (inget når modellen), på/av med återställning, delas bara som "av" med dashboarden, rester städas');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
