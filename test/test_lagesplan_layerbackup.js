// Funktionstest: lagerlistans mappar – lokal kopia och återställning om de försvinner ur projektet.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8992;
const PID = 'p1';
const it = (id, name, extra) => ({ id, object_name: name, activity: 'Gjutning ' + name, area: 'PM1', status: 'pagaende', start_date: '2000-01-01', end_date: '2999-01-01', progress: 10, ...extra });
const items = [it('a', 'J1', { source_key: 'k1' }), it('b', 'J1b', { source_key: 'k1', activity: 'Gjutning J1' }), it('c', 'K2'), it('d', 'L3'), it('e', 'Utanför')];
const pos = [{ id: 'a', x: 10, y: 10, z0: 0, z1: 1 }, { id: 'b', x: 12, y: 10, z0: 0, z1: 1 }, { id: 'c', x: 30, y: 20, z0: 0, z1: 1 }, { id: 'd', x: 50, y: 30, z0: 0, z1: 1 }];
const store = new Map([[`projects/${PID}/plan_items.json`, JSON.stringify(items)], [`projects/${PID}/status_plans.json`, '[]'], [`projects/${PID}/plan_item_positions.json`, JSON.stringify(pos)]]);

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS_DIR, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await require('./_dialogs').bridge(page); // appens egna dialogrutor
  require('./_reveal').autoReveal(page); // flikar och menyer (UI-översynen 2026-10-09)
  page.on('dialog', d => d.accept());
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('lagesplan-objmovefree', '0'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); localStorage.setItem('lagesplan-field', '0'); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error("x")) }) };' }));
  await page.route('https://api.github.com/**', r => {
    const u = new URL(r.request().url());
    const f = decodeURIComponent(u.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (r.request().method() === 'PUT') { const b = JSON.parse(r.request().postData()); store.set(f, Buffer.from(b.content, 'base64').toString()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"content":{"sha":"s"}}' }); }
    if (!store.has(f)) return r.fulfill({ status: 404, body: '{}' });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(store.get(f)).toString('base64'), sha: 's' }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=${PID}`); await page.waitForTimeout(1200);
  await page.evaluate(() => {
    viewport = { transform: [1, 0, 0, 1, 0, 0], width: 1000, height: 800, convertToPdfPoint: (x, y) => [x, y], convertToViewportPoint: (x, y) => [x, y] };
    ['zoneCanvas', 'objCanvas', 'topCanvas'].forEach(id => { $(id).width = 1000; $(id).height = 800; });
    $('empty').classList.add('hidden');
    plan = { id: 'pl', name: 'P', zones: [], photos: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } };
    invalidatePositions(); view.scale = 1; applyView(); renderZones();
  });
  const vb = await page.locator('#viewport').boundingBox();


  const SP = `projects/${PID}/site_layers.json`;
  store.set(SP, JSON.stringify([{ id: 'layermeta', type: 'layermeta', folders: [{ id: 'f1', name: 'MIN MAPP' }, { id: 'f2', name: 'FOTON' }], folderOf: {}, names: {} }]));
  await page.evaluate(() => loadSiteLayers()); await page.waitForTimeout(300);
  const bk = await page.evaluate(() => lmbGet());
  if (!bk || bk.meta.folders.length !== 2) fail('En lokal kopia av mapparna ska sparas när de lästs in: ' + JSON.stringify(bk));
  // Mapparna försvinner ur projektet → erbjud återställning
  store.set(SP, '[]');
  await page.evaluate(() => loadSiteLayers()); await page.waitForTimeout(1500);
  const back = JSON.parse(store.get(SP)), m = back.find(x => x.id === 'layermeta');
  if (!m || m.folders.length !== 2 || !(await page.evaluate(() => siteItems.some(x => x.id === 'layermeta' && x.folders.length === 2)))) fail('Mapparna ska återställas från kopian: ' + JSON.stringify(back).slice(0, 200));
  console.log('OK: mapparna sparas lokalt och kan återställas om de försvunnit');
  // Inläsningsfel → tydligt fel, ingenting skrivs över
  const before = store.get(SP);
  await page.evaluate(async () => { document.getElementById('saveStatus').textContent = ''; const o = ghReadJSON; ghReadJSON = async () => { throw new Error('HTTP 500'); }; try { await loadSiteLayers(); } finally { ghReadJSON = o; } }); await page.waitForTimeout(800);
  const st = await page.evaluate(() => (document.getElementById('saveStatus') || {}).textContent || '');
  if (!/Kunde inte läsa lagren/.test(st) || store.get(SP) !== before) fail('Fel vid inläsning ska visas tydligt utan att skriva över: ' + st);
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK: inläsningsfel visas tydligt'); console.log('OK test_lagesplan_layerbackup'); await browser.close(); server.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
