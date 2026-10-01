// Kopplingsläget (Victors rapport 2026-10-01): "Om jag kopplar och sparar
// till en aktivitet och raskt hoppar vidare till att koppla nästa objekt
// hoppar och buggar det" – samma redan kopplade objekt (till C10) låg många
// gånger i listan för C11. Orsak: markeringshändelser som kom tätt hanterades
// samtidigt (alla hann se "inte i listan"), och appen markerade om även
// objekt som ändå hoppas över, vilket gav nya händelser.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8958;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PID = 'test-project';

const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const get = f => { const e = store.get(`projects/${PID}/${f}`); return e ? JSON.parse(e.content) : null; };
const base = { project_id: PID, area: 'Hus A', contractor: 'NCC', status: 'pagaende', progress: 20, depends_on: [], start_date: '2026-06-01', end_date: '2026-06-12' };
put('plan_items.json', [
  { ...base, id: 'c10', model_id: 'm1', object_id: '30', object_name: 'C10', activity: 'Fundament' },
  { ...base, id: 'c11', model_id: null, object_id: 'excel-c11', object_name: 'C11', activity: 'Fundament', source_key: 'S11' },
]);
put('plan_item_activities.json', []);
put('plan_item_comments.json', []);

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
    window.__sel = []; window.__markups = new Map(); window.__nextId = 1;
    window.TrimbleConnectWorkspace = { connect: function(t, cb) { window.__cb = cb; return Promise.resolve({
      project: { getProject: () => Promise.resolve({ id: '${PID}' }) },
      extension: { requestPermission: () => Promise.resolve('x') },
      markup: {
        addLineMarkups: arr => Promise.resolve(arr.map(m => { const id = window.__nextId++; window.__markups.set(id, { ...m, id }); return { ...m, id }; })),
        getLineMarkups: () => Promise.resolve([...window.__markups.values()]),
        removeMarkups: ids => { (ids || []).forEach(id => window.__markups.delete(id)); return Promise.resolve(); },
      },
      viewer: {
        getSelection: () => Promise.resolve(window.__sel), convertToObjectIds: (m, r) => Promise.resolve(r.map(String)),
        convertToObjectRuntimeIds: (m, ids) => Promise.resolve(ids.map(Number)), setSelection: (s, mode) => { (window.__setSel = window.__setSel || []).push({ s: JSON.parse(JSON.stringify(s)), mode }); return Promise.resolve(); },
        setCamera: () => Promise.resolve(), getCamera: () => Promise.resolve({ position: { x: 0, y: -40, z: 30 }, lookAt: { x: 0, y: 0, z: 0 } }),
        getObjectBoundingBoxes: (m, ids) => Promise.resolve(ids.map(id => ({ id, boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } }))),
        getObjectProperties: (m, ids) => new Promise(res => setTimeout(() => res(ids.map(id => ({ id, product: { name: 'Fundament ' + id } }))), 300)),
        setObjectState: () => Promise.resolve(), getModels: () => Promise.resolve([]), toggleModel: () => Promise.resolve()
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
  const select = async objs => { await page.evaluate(objs => { window.__sel = objs; window.__cb('viewer.onSelectionChanged', {}); }, objs); await page.waitForTimeout(250); };
  const fire = (objs, times) => page.evaluate(([objs, times]) => { window.__sel = objs; for (let i = 0; i < times; i++) window.__cb('viewer.onSelectionChanged', {}); }, [objs, times]);
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // C10:s objekt (30) är fortfarande markerat i 3D när man börjar koppla C11.
  await page.evaluate(() => { window.__setSel = []; armCoupleMode(items.find(i => i.id === 'c11')); });
  await page.waitForTimeout(50);
  const first = await page.evaluate(() => window.__setSel[0]);
  if (!first || first.mode !== 'set' || (first.s.modelObjectIds || []).length) fail('Kopplingsläget ska börja med en tom 3D-markering, fick ' + JSON.stringify(first));
  await page.waitForTimeout(400);

  // Många täta händelser med det redan kopplade objektet, sedan ett nytt objekt (40) utan Ctrl.
  await fire([{ modelId: 'm1', objectRuntimeIds: [30] }], 5);
  await page.waitForTimeout(100);
  await fire([{ modelId: 'm1', objectRuntimeIds: [40] }], 4);
  await page.waitForTimeout(2000);
  const list = await page.evaluate(() => coupleCollected.map(o => o.objectId));
  if (list.join(',') !== '30,40') fail('Varje objekt ska bara finnas en gång i listan, fick ' + JSON.stringify(list));
  const reselect = await page.evaluate(() => window.__setSel.slice(1).filter(c => c.mode === 'set').map(c => c.s.modelObjectIds.flatMap(m => m.objectRuntimeIds)));
  if (reselect.some(ids => ids.includes(30))) fail('Ett objekt som hoppas över (kopplat till C10) ska inte markeras om, fick ' + JSON.stringify(reselect));
  const note = await page.innerText('#coupleModeList');
  if ((note.match(/redan kopplad till "C10"/g) || []).length !== 1) fail('"redan kopplad till C10" ska stå en gång, fick ' + note);
  if ((await page.innerText('#btnSaveCoupleMode')).trim() !== 'Spara (1)') fail('Spara ska gälla 1 objekt');
  console.log('OK: täta markeringshändelser ger inga dubbletter, och redan kopplade objekt markeras inte om');

  await page.click('#btnSaveCoupleMode'); await page.waitForTimeout(1200);
  const saved = get('plan_items.json').filter(r => r.object_id === '40');
  if (saved.length !== 1 || saved[0].object_name !== 'C11') fail('Objekt 40 ska vara kopplat till C11 en gång: ' + JSON.stringify(saved));
  console.log('OK: kopplingen till C11 sparas en gång');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
