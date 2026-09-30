// Funktionstest: delaktiviteter i listan – fälla ut, koppla 3D-objekt direkt
// till en delaktivitet (nya objekt får bara den delaktiviteten och dess datum,
// objekt som redan hör till aktiviteten får delaktiviteten tillagd, objekt i
// andra aktiviteter hoppas över) och manuella markeringar per delaktivitet.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8954;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PID = 'test-project';

const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const get = f => { const e = store.get(`projects/${PID}/${f}`); return e ? JSON.parse(e.content) : null; };
const base = { project_id: PID, area: 'Hus A', contractor: 'NCC', status: 'pagaende', progress: 20, depends_on: [], start_date: '2026-06-01', end_date: '2026-06-12' };
put('plan_items.json', [
  // Betongarbeten från Excel: okopplad mall + ett objekt som redan följer hela aktiviteten
  { ...base, id: 'p', model_id: null, object_id: 'excel-p', object_name: 'Betongarbeten', activity: 'Betongarbeten', source_key: 'S1' },
  { ...base, id: 'v', model_id: 'm1', object_id: '10', object_name: 'Betongarbeten', activity: 'Betongarbeten', source_key: 'S1' },
  // Annan aktivitet
  { ...base, id: 'x', model_id: 'm2', object_id: '30', object_name: 'Stomme', activity: 'Stomme', start_date: '2026-07-01', end_date: '2026-07-10' },
]);
const subs = [['Formning', '2026-06-01', '2026-06-05'], ['Armering', '2026-06-06', '2026-06-10'], ['Gjutning', '2026-06-11', '2026-06-12']];
put('plan_item_activities.json', ['p', 'v'].flatMap(id => subs.map(([name, s, e], i) => ({ id: id + i, plan_item_id: id, project_id: PID, name, start_date: s, end_date: e, estimated_hours: null }))));
put('plan_item_comments.json', []);

(async () => {
  const server = http.createServer((req, res) => fs.readFile(path.join(DOCS_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(req.url.split('?')[0])] || 'application/octet-stream' }); res.end(data);
  })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 520, height: 1600 } });
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
        convertToObjectRuntimeIds: (m, ids) => Promise.resolve(ids.map(Number)), setSelection: () => Promise.resolve(),
        setCamera: () => Promise.resolve(), getCamera: () => Promise.resolve({ position: { x: 0, y: -40, z: 30 }, lookAt: { x: 0, y: 0, z: 0 } }),
        getObjectBoundingBoxes: (m, ids) => Promise.resolve(ids.map(id => ({ id, boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } }))),
        getObjectProperties: (m, ids) => Promise.resolve(ids.map(id => ({ id, product: { name: 'Vägg ' + id } }))),
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
  const subRows = () => page.evaluate(() => [...document.querySelectorAll('.sub-row')].map(r => r.innerText.replace(/\s+/g, ' ').trim()));
  const subBtn = name => page.locator('.sub-row', { hasText: name }).locator('[data-action="sub-couple"]');
  const actsOf = id => get('plan_item_activities.json').filter(a => a.plan_item_id === id).map(a => a.name).sort().join(',');
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // 1) Fäll ut delaktiviteterna
  const tgl = page.locator('[data-action="toggle-subs"]').first();
  if (!(await tgl.innerText()).includes('3 delaktiviteter')) fail('aktiviteten ska visa "3 delaktiviteter", fick ' + await tgl.innerText());
  await tgl.click(); await page.waitForTimeout(200);
  let rows = await subRows();
  if (rows.length !== 3 || !rows[0].includes('Formning') || !rows[0].includes('2026-06-01 → 2026-06-05') || !rows[0].includes('1 objekt')) fail('tre delaktiviteter med datum och objektantal ska visas, fick ' + JSON.stringify(rows));
  console.log('OK: delaktiviteterna fälls ut direkt i listan med datum och antal objekt');

  // 2) Koppla till Gjutning: nytt objekt 20, v (samma aktivitet, har redan Gjutning), x:s objekt (annan aktivitet)
  await subBtn('Gjutning').click();
  const banner = await page.innerText('#coupleModeText');
  if (!banner.includes('delaktiviteten "Gjutning"')) fail('bannern ska nämna delaktiviteten, fick ' + banner);
  await select([{ modelId: 'm1', objectRuntimeIds: [20, 10] }, { modelId: 'm2', objectRuntimeIds: [30] }]);
  const notes = await page.innerText('#coupleModeList');
  if (!notes.includes('hör redan till aktiviteten') || !notes.includes('hoppas över')) fail('listan ska visa vad som händer med varje objekt, fick ' + notes);
  if ((await page.innerText('#btnSaveCoupleMode')) !== 'Spara (2)') fail('två objekt ska kunna sparas (objekt i annan aktivitet hoppas över)');
  await page.click('#btnSaveCoupleMode'); await page.waitForTimeout(900);
  const it20 = get('plan_items.json').find(r => r.object_id === '20');
  if (!it20 || it20.start_date !== '2026-06-11' || it20.end_date !== '2026-06-12' || it20.source_key !== 'S1') fail('nytt objekt ska få Gjutnings datum och höra till aktiviteten, fick ' + JSON.stringify(it20));
  if (actsOf(it20.id) !== 'Gjutning') fail('nytt objekt ska bara ha delaktiviteten Gjutning, fick ' + actsOf(it20.id));
  if (actsOf('v') !== 'Armering,Formning,Gjutning') fail('objekt som redan följer hela aktiviteten ska vara oförändrat');
  if (get('plan_items.json').find(r => r.id === 'x').object_id !== '30' || actsOf('x')) fail('objekt i annan aktivitet ska inte röras');
  console.log('OK: koppling till en delaktivitet ger nya objekt bara den delaktiviteten och dess datum; andra aktiviteters objekt hoppas över');

  // 3) Samma objekt till Formning: delaktiviteten läggs till och datumen breddas
  await subBtn('Formning').click();
  await select([{ modelId: 'm1', objectRuntimeIds: [20] }]);
  await page.click('#btnSaveCoupleMode'); await page.waitForTimeout(900);
  const it20b = get('plan_items.json').find(r => r.object_id === '20');
  if (actsOf(it20b.id) !== 'Formning,Gjutning' || it20b.start_date !== '2026-06-01' || it20b.end_date !== '2026-06-12') fail('Formning ska läggas till på objektet och datumen breddas, fick ' + actsOf(it20b.id) + ' ' + it20b.start_date + '–' + it20b.end_date);
  rows = await subRows();
  const cnt = name => (rows.find(r => r.includes(name)) || '').match(/(\d+) objekt/);
  if (!cnt('Formning') || cnt('Formning')[1] !== '2' || cnt('Armering')[1] !== '1' || cnt('Gjutning')[1] !== '2') fail('antalet objekt per delaktivitet ska uppdateras, fick ' + JSON.stringify(rows));
  console.log('OK: ett objekt kan kopplas till flera delaktiviteter i samma aktivitet');
  if (process.env.SHOT) await page.locator('#itemList').screenshot({ path: process.env.SHOT + '/subs.png' });

  // 4) Manuell markering för Armering
  await subBtn('Armering').click();
  await page.click('#markDrawBar [data-shape="line"]');
  await page.evaluate(() => window.__cb('viewer.onPicked', { data: { position: { x: 1, y: 1, z: 0 }, modelId: 'm1', objectRuntimeId: 10 } }));
  await page.evaluate(() => window.__cb('viewer.onPicked', { data: { position: { x: 6, y: 1, z: 0 }, modelId: 'm1', objectRuntimeId: 10 } }));
  await page.waitForTimeout(900);
  const mk = (get('plan_markups.json') || [])[0];
  if (!mk || mk.subName !== 'Armering' || mk.subStart !== '2026-06-06') fail('markeringen ska höra till delaktiviteten Armering, fick ' + JSON.stringify(mk));
  rows = await subRows();
  if (!rows.find(r => r.includes('Armering')).includes('Manuell markering')) fail('delaktivitetsraden ska visa Manuell markering');
  // Färgen följer Armerings datum: på 2026-06-08 pågående, på 2026-06-03 planerad
  const colorAt = d => page.evaluate(async d => { document.getElementById('timelineDate').value = d; await renderManualMarks(); const v = [...window.__markups.values()]; return v.length ? v[0].color : null; }, d);
  const c1 = await colorAt('2026-06-08'), c2 = await colorAt('2026-06-03');
  if (JSON.stringify(c1) === JSON.stringify(c2)) fail('markeringens färg ska följa delaktivitetens datum, fick samma färg ' + JSON.stringify(c1));
  console.log('OK: manuella markeringar kan kopplas till en delaktivitet och färgas efter dess datum');

  // 5) Utfällningen minns vid omladdning
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(600);
  rows = await subRows();
  if (rows.length !== 3) fail('utfällda delaktiviteter ska vara utfällda även efter omladdning');
  console.log('OK: utfällda delaktiviteter kommer ihåg sitt läge');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK: delaktiviteter i listan med koppling och markeringar fungerar');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
