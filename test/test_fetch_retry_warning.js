// Funktionstest: statusgenväg på badgen, säkerhetskopia + historik +
// återställning, nollställning med dubbel bekräftelse, "Tänd kopplade
// modeller" och att Redigera hoppar till formuläret och tillbaka.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8952;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PID = 'test-project';

const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const get = f => { const e = store.get(`projects/${PID}/${f}`); return e ? JSON.parse(e.content) : null; };
const base = { project_id: PID, area: 'Hus A', contractor: 'NCC', status: 'planerad', progress: 0, start_date: '2026-10-01', end_date: '2026-10-05', depends_on: [] };
put('plan_items.json', [
  { ...base, id: 'a', model_id: 'm1', object_id: '10', object_name: 'Pelare A', activity: 'Gjutning' },
  { ...base, id: 'b', model_id: 'm2', object_id: '20', object_name: 'Pelare B', activity: 'Gjutning', depends_on: ['a'] },
]);
put('plan_item_activities.json', []); put('plan_item_comments.json', [{ id: 'c1', plan_item_id: 'a', text: 'hej' }]);

global.abortItems = 1;
(async () => {
  const server = http.createServer((req, res) => fs.readFile(path.join(DOCS_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(req.url.split('?')[0])] || 'application/octet-stream' }); res.end(data);
  })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 480, height: 1400 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(d.type() === 'prompt' ? 'NOLLSTÄLL' : undefined); });
  await page.addInitScript(() => {
    localStorage.setItem('4dplan-unlocked', '1');
    localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' }));
  });
  await page.route('https://components.connect.trimble.com/**', r => r.fulfill({ contentType: 'application/javascript', body: `
    window.__toggled = [];
    window.TrimbleConnectWorkspace = { connect: function(t, cb) { return Promise.resolve({
      project: { getProject: () => Promise.resolve({ id: '${PID}' }) },
      extension: { requestPermission: () => Promise.resolve('x') },
      viewer: {
        getSelection: () => Promise.resolve([]), convertToObjectIds: (m, r) => Promise.resolve(r.map(String)),
        convertToObjectRuntimeIds: (m, ids) => Promise.resolve(ids.map(Number)), setSelection: () => Promise.resolve(),
        setCamera: () => Promise.resolve(), getCamera: () => Promise.resolve({ position: { x: 0, y: 0, z: 10 } }),
        getObjectBoundingBoxes: (m, ids) => Promise.resolve(ids.map(id => ({ id, boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } }))),
        setObjectState: () => Promise.resolve(),
        getModels: () => Promise.resolve([{ id: 'm1', name: 'Modell 1', state: 'loaded' }, { id: 'm2', name: 'Modell 2', state: 'unloaded' }]),
        toggleModel: (id, loaded) => { window.__toggled.push([id, loaded]); return Promise.resolve(); }
      } }); } };` }));
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (req.method() === 'GET' && f.endsWith('/plan_items.json') && global.abortItems > 0) { global.abortItems--; return r.abort('failed'); }
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    const body = JSON.parse(req.postData()); if (e && body.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' });
    const sha = 's' + (++n); store.set(f, { content: Buffer.from(body.content, 'base64').toString(), sha });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) });
  });
  const fail = m => { throw new Error(m); };
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const warn = () => page.evaluate(() => { const w = document.getElementById('connectionWarning'); return w.classList.contains('hidden') ? '' : w.innerText; });
  if (await warn()) fail('ett enstaka nätverksfel ska klaras av med nytt försök, men varning visades: ' + await warn());
  if (await page.locator('#itemList .item-row').count() !== 2) fail('listan ska visa objekten');
  console.log('OK: ett tillfälligt nätverksfel vid hämtning ger nytt försök utan varning');
  global.abortItems = 3;
  await page.click('#btnRefresh'); await page.waitForTimeout(3500);
  if (!/Kunde inte hämta planeringen/.test(await warn())) fail('efter upprepade fel ska varningen visas');
  await page.click('#btnRefresh'); await page.waitForTimeout(1500);
  if (await warn()) fail('varningen ska försvinna när hämtningen lyckas igen, står: ' + await warn());
  if (await page.locator('#itemList .item-row').count() !== 2) fail('listan ska visa objekten igen');
  console.log('OK: varningen visas vid upprepade fel och försvinner när hämtningen lyckas igen');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
