// Funktionstest: Placera i 3D – bibliotek, tryck i modellen (viewer.onPicked), justera mått/
// vridning/rikta mot kant, staket längs punkter, få linjer i förhandsvisningen, ångra, sparning i
// plan_placements.json (utan att röra andra filer), 4D-koppling och IFC med fasta id:n.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8971;
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


  const itemsBefore = store.get(`projects/${PID}/plan_items.json`).content;
  const st = () => page.evaluate(() => ({ list: placements.map(p => ({ ...p })), active: placeActiveId, mode: placeMode && placeMode.kind }));
  const wait = ms => page.waitForTimeout(ms);

  // Bod: välj, tryck i modellen.
  await page.click('[data-place-type="bod"]');
  if (!(await page.locator('.place-mode').innerText()).includes('Tryck i modellen')) fail('Läget ska visa instruktion');
  // Ett tryck som markering ska inte koppla/markera medan man placerar.
  const handled = await page.evaluate(() => place3dEvent('viewer.onSelectionChanged', {}));
  if (!handled) fail('Markeringshändelser ska slukas i placeringsläget');
  await pick(100, 200, 5);
  await wait(400);
  let s = await st();
  if (s.list.length !== 1 || s.list[0].type !== 'bod' || s.list[0].x !== 100 || s.list[0].z !== 5 || s.mode) fail('Boden ska placeras i punkten: ' + JSON.stringify(s));
  let m = await shown();
  if (m.length !== 12) fail('Aktiv låda ska ritas med 12 linjer, fick ' + m.length);

  // Ändra längden: linjerna följer med, fortfarande 12.
  await page.fill('[data-pf="L"]', '10');
  await wait(400);
  m = await shown();
  const xs = m.flatMap(l => [l.start.positionX, l.end.positionX]);
  if (m.length !== 12 || Math.abs(Math.max(...xs) - 105000) > 1 || Math.abs(Math.min(...xs) - 95000) > 1) fail('Längden 10 m ska synas i förhandsvisningen');
  await page.click('[data-rot="15"]'); await wait(50);
  if ((await st()).list[0].rot !== 15) fail('Vrid 15° ska ge rot 15');
  await page.click('#placeAim');
  await pick(100, 210, 5); await wait(300);
  if ((await st()).list[0].rot !== 90) fail('Rikta mot kant ska ge 90°, fick ' + (await st()).list[0].rot);
  await page.fill('[data-pf="dz"]', '0.5'); await wait(50);

  // 4D-koppling: aktivitet ger start/slut.
  await page.selectOption('[data-pf="itemId"]', 'a'); await wait(50);
  s = await st();
  if (s.list[0].itemId !== 'a' || s.list[0].start !== '2026-06-01' || s.list[0].end !== '2026-06-10') fail('Kopplingen ska hämta aktivitetens datum');

  // Tornkran: aktiv trådmodell + bodens fotavtryck (4 linjer) – inte mer.
  await page.click('[data-place-type="tornkran"]');
  await pick(150, 250, 4); await wait(400);
  m = await shown();
  if (m.length !== 12 + 12 + 24 + 4) fail('Kran (mast+bom+räckvidd) + bodens fotavtryck ska ge 52 linjer, fick ' + m.length);

  // Staket längs tre punkter.
  await page.click('[data-place-type="staket"]');
  await pick(0, 0, 1); await pick(10, 0, 1); await pick(10, 5, 1);
  await page.click('#placeFenceDone'); await wait(400);
  s = await st();
  const fence = s.list.find(p => p.type === 'staket');
  if (!fence || fence.pts.length !== 3) fail('Staketet ska ha tre punkter');
  m = await shown();
  if (m.length !== (3 + 2 * 2) + 4 + 4) fail('Staket (3 stolpar + 4 linjer) + två fotavtryck ska ge 15 linjer, fick ' + m.length);

  // Ångra: ta bort kranen och ångra.
  await page.click('.place-row:nth-child(2)'); await wait(50);
  await page.click('#placeDelete'); await wait(50);
  if ((await st()).list.length !== 2) fail('Kranen ska tas bort');
  await page.click('#placeUndo'); await wait(50);
  if ((await st()).list.length !== 3) fail('Ångra ska ta tillbaka kranen');

  // Sparat i egen fil, inget annat rört.
  await wait(1500);
  const saved = get('plan_placements.json');
  if (!saved || saved.length !== 3) fail('plan_placements.json ska ha 3 objekt: ' + JSON.stringify(saved));
  if (store.get(`projects/${PID}/plan_items.json`).content !== itemsBefore) fail('plan_items.json får inte ändras');
  if (saved.find(p => p.type === 'bod').dz !== 0.5) fail('Höjd över punkten ska sparas');

  // En kollegas placering i filen ska ligga kvar när vi sparar.
  const cur = get('plan_placements.json'); cur.push({ id: 'kollega', type: 'container', name: 'Kollegans', x: 1, y: 1, z: 0, L: 6, B: 2.4, H: 2.6, rot: 0, dz: 0 });
  put('plan_placements.json', cur);
  await page.click('.place-row:nth-child(2)'); await wait(50);
  await page.fill('[data-pf="name"]', 'Kran A'); await page.dispatchEvent('[data-pf="name"]', 'change');
  await wait(1500);
  const after = get('plan_placements.json');
  if (!after.some(p => p.id === 'kollega') || !after.some(p => p.name === 'Kran A')) fail('Sparningen ska slå ihop med kollegans ändringar');

  // IFC: uppladdning fångas.
  await page.evaluate(() => { window.__up = []; window.tcUploadFiles = async (files, folder) => { for (const f of files) window.__up.push({ name: f.name, folder, text: await f.text() }); return { uploaded: files.length }; }; });
  await page.click('#placeSaveIfc'); await wait(1500);
  let up = await page.evaluate(() => window.__up);
  if (up.length !== 1 || up[0].folder !== '4D Etablering' || !up[0].name.endsWith('.ifc')) fail('IFC ska laddas upp till 4D Etablering: ' + JSON.stringify(up.map(u => [u.name, u.folder])));
  const proxies = t => (t.match(/IFCBUILDINGELEMENTPROXY\('([^']+)'/g) || []).map(x => x.slice(26, 48)).sort();
  const g1 = proxies(up[0].text);
  if (g1.length !== 4) fail('3 objekt + kranens räckvidd = 4 proxies, fick ' + g1.length);
  if (await page.locator('.place-state.new').count()) fail('Efter sparning ska alla vara "i IFC"');
  m = await shown();
  if (m.length !== 48) fail('Bara det aktiva objektet ska ritas efter sparning, fick ' + m.length);
  await page.click('#placeDone'); await wait(400);
  m = await shown();
  if (m.length !== 0) fail('Sparade objekt ska inte ritas med linjer, fick ' + m.length);
  if (process.env.PLACE_IFC_OUT) fs.writeFileSync(process.env.PLACE_IFC_OUT, up[0].text);
  // Ny version: samma GUID:er.
  await page.click('#placeSaveIfc'); await wait(1500);
  up = await page.evaluate(() => window.__up);
  if (JSON.stringify(proxies(up[1].text)) !== JSON.stringify(g1)) fail('IFC-id:n ska vara desamma i nästa version');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_place3d');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
