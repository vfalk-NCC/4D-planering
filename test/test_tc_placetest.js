// Testpanelen "Flytta modell live i TC": viewer.placeModel provas på den markerade modellen och
// loggen visar placering och objektets mitt före/efter (flytt 1 m, vridning kring objektets mitt, återställ).
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8974;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PID = 'test-project';

const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const get = f => { const e = store.get(`projects/${PID}/${f}`); return e ? JSON.parse(e.content) : null; };
const base = { project_id: PID, area: 'Sektionsfickor', contractor: 'NCC', status: 'planerad', progress: 0, depends_on: [] };
put('plan_items.json', [
  { ...base, id: 'a', model_id: 'm1', object_id: '10', object_name: 'Borrning', activity: 'Borrning', start_date: '2026-06-01', end_date: '2026-06-10' },
  { ...base, status: 'klar', id: 'f', model_id: null, object_id: 'excel-f', object_name: 'Fyllning Del 1', activity: 'Fyllning', start_date: '2026-01-02', end_date: '2026-01-13' },
]);
put('plan_item_activities.json', []); put('plan_item_comments.json', []);

(async () => {
  const server = http.createServer((req, res) => fs.readFile(path.join(DOCS_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(req.url.split('?')[0])] || 'application/octet-stream' }); res.end(data);
  })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 520, height: 1400 } });
  require('./_reveal').autoReveal(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    localStorage.setItem('4dplan-unlocked', '1');
    localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' }));
  });
  await page.route('https://components.connect.trimble.com/**', r => r.fulfill({ contentType: 'application/javascript', body: `
    window.__markups = new Map(); window.__nextId = 1; window.__camera = null; window.__toggled = [];
    window.__noIds = false;
    const addLines = arr => Promise.resolve(arr.map(m => { const id = window.__nextId++; window.__markups.set(id, { type: 'line', ...m, id }); return window.__noIds ? { ...m } : { ...m, id }; }));
    window.TrimbleConnectWorkspace = { connect: function(t, cb) { window.__cb = cb; return Promise.resolve({
      project: { getProject: () => Promise.resolve({ id: '${PID}' }) },
      extension: { requestPermission: () => Promise.resolve('x') },
      markup: {
        addLineMarkups: addLines,
        getLineMarkups: () => Promise.resolve([...window.__markups.values()]),
        removeMarkups: ids => { (ids || []).forEach(id => window.__markups.delete(id)); return Promise.resolve(); },
      },
      viewer: {
        getSelection: () => Promise.resolve([]), convertToObjectIds: (m, r) => Promise.resolve(r.map(String)),
        convertToObjectRuntimeIds: (m, ids) => Promise.resolve(ids.map(Number)), setSelection: () => Promise.resolve(),
        setCamera: c => { window.__camera = c; return Promise.resolve(); }, getCamera: () => Promise.resolve(window.__camera || { position: { x: 0, y: -40, z: 30 }, lookAt: { x: 0, y: 0, z: 0 }, quaternion: { x: 0.3, y: 0, z: 0, w: 0.95 }, fieldOfView: 60 }),
        getObjectBoundingBoxes: (m, ids) => Promise.resolve(ids.map(id => ({ id, boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } }))),
        getObjectProperties: () => Promise.resolve([]),
        setObjectState: () => Promise.resolve(),
        getModels: () => Promise.resolve([{ id: 'm1', name: 'Modell 1', state: 'unloaded' }]),
        toggleModel: (id, loaded) => { window.__toggled.push([id, loaded]); return Promise.resolve(); }
      } }); } };` }));
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    const body = JSON.parse(req.postData()); if (e && body.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' });
    const sha = 's' + (++n); store.set(f, { content: Buffer.from(body.content, 'base64').toString(), sha });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) });
  });
  const fail = m => { throw new Error(m); };
  const pick = (x, y, z) => page.evaluate(([x, y, z]) => window.__cb('viewer.onPicked', { data: { position: { x, y, z }, modelId: 'm1', objectRuntimeId: 1 } }), [x, y, z]);
  const shown = () => page.evaluate(() => [...window.__markups.values()]);
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);



  // Simulerad TC: objektets läge följer modellens placering (värld = vridning · lokal + position).
  await page.evaluate(() => {
    let pl = { position: { x: 1000, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 }, refDirection: { x: 1, y: 0, z: 0 } };
    const local = { min: [9, 19, 0], max: [11, 21, 3] }; // lokalt, meter
    const tf = (x, y) => { const r = pl.refDirection, c = r.x, s = r.y; return [c * x - s * y + pl.position.x / 1000, s * x + c * y + pl.position.y / 1000]; };
    window.__placed = [];
    API.viewer.getSelection = async () => [{ modelId: 'etab', objectRuntimeIds: [7] }];
    API.viewer.getModels = async () => [{ id: 'etab', name: 'Etablering.ifc', placement: JSON.parse(JSON.stringify(pl)) }];
    API.viewer.placeModel = async (id, p) => { window.__placed.push([id, p]); pl = JSON.parse(JSON.stringify(p)); };
    API.viewer.getObjectBoundingBoxes = async (m, ids) => {
      const cs = [[local.min[0], local.min[1]], [local.max[0], local.min[1]], [local.max[0], local.max[1]], [local.min[0], local.max[1]]].map(([x, y]) => tf(x, y));
      const xs = cs.map(c => c[0]), ys = cs.map(c => c[1]);
      return ids.map(i => ({ id: i, boundingBox: { min: { x: Math.min(...xs), y: Math.min(...ys), z: 0 }, max: { x: Math.max(...xs), y: Math.max(...ys), z: 3 } } }));
    };
  });
  await page.click('#planSourceBar [data-design]');
  if (!(await page.locator('#pltMove').isDisabled())) fail('Flytta ska vara avstängd innan en modell hämtats');
  await page.click('#pltPick'); await page.waitForTimeout(200);
  let log = await page.locator('#pltLog').innerText();
  if (!log.includes('placeModel finns: ja') || !log.includes('Modell: Etablering.ifc') || !log.includes('Mitten på markerat objekt: (11, 20, 1,5)')) fail('Hämta: ' + log);
  await page.click('#pltMove'); await page.waitForTimeout(900);
  log = await page.locator('#pltLog').innerText();
  if (!log.includes('placeModel: OK') || !log.includes('(skillnad (1, 0, 0) m)')) fail('Flytta 1 m österut ska flytta mitten 1 m i X: ' + log);
  await page.click('#pltRot'); await page.waitForTimeout(900);
  log = await page.locator('#pltLog').innerText();
  if (!log.includes('(skillnad (0, 0, 0) m)')) fail('Vridning kring objektets mitt ska lämna mitten kvar: ' + log);
  const placed = await page.evaluate(() => window.__placed);
  const ref = placed[1][1].refDirection;
  if (Math.abs(ref.x - Math.cos(Math.PI / 12)) > 1e-9 || Math.abs(ref.y - Math.sin(Math.PI / 12)) > 1e-9) fail('Riktningen ska vridas 15°: ' + JSON.stringify(ref));
  await page.click('#pltReset'); await page.waitForTimeout(900);
  const last = (await page.evaluate(() => window.__placed)).pop()[1];
  if (JSON.stringify(last) !== JSON.stringify({ position: { x: 1000, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 }, refDirection: { x: 1, y: 0, z: 0 } })) fail('Återställ ska skicka ursprungsplaceringen: ' + JSON.stringify(last));
  // Fel från TC loggas i klartext.
  await page.evaluate(() => { API.viewer.placeModel = async () => { throw new Error('Not supported'); }; });
  await page.click('#pltMove'); await page.waitForTimeout(300);
  if (!(await page.locator('#pltLog').innerText()).includes('placeModel: FEL – Not supported')) fail('Fel från TC ska loggas');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_tc_placetest');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
