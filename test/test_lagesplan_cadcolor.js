// Funktionstest: färg på DXF-lager direkt i lagerlistan (Victors önskemål 2026-10-02).
// Färgrutan vid varje CAD-lager under en DXF-ritning är en färgväljare. Färgen
// gäller lagret i alla DXF-ritningar (samma som under "Alla DXF-lager"),
// sparas i projektet och kan återställas till DXF:ens originalfärg.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8965;
const PID = 'p1';
const store = new Map([[`projects/${PID}/plan_items.json`, '[]'], [`projects/${PID}/status_plans.json`, '[]']]);

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS_DIR, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); localStorage.setItem('lagesplan-field', '0'); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error("x")) }) };' }));
  await page.route('https://api.github.com/**', r => {
    const u = new URL(r.request().url());
    const f = decodeURIComponent(u.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (r.request().method() === 'PUT') { const b = JSON.parse(r.request().postData()); store.set(f, Buffer.from(b.content, 'base64').toString()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"content":{"sha":"s"}}' }); }
    if (!store.has(f)) return r.fulfill({ status: 404, body: '{}' });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(store.get(f)).toString('base64'), sha: 's' }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=${PID}`); await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const mk = (id, name, ls) => ({ id, type: 'cad', name, path: 'x/' + id + '.json', colorMode: 'orig', layers: ls.map(n => ({ name: n, color: '#ff0000', n: 5 })), stats: { lines: 1, texts: 0, kb: 1 } });
    siteItems.push(mk('c1', 'WBS - 3D-Text', ['WBS - 3D-TEXT', 'MÅTT']), mk('c2', 'Ritning 2', ['wbs - 3d-text']));
    layerState['cadopen:c1'] = true; showTab('work'); renderLayerPanel();
  });
  const row = page.locator('.layer-row[data-layer="cadl:c1:WBS - 3D-TEXT"]');
  if (!(await row.locator('input.cl-color').count())) fail('Färgrutan vid DXF-lagret ska vara en färgväljare');
  await row.locator('input.cl-color').evaluate(el => { el.value = '#16a34a'; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(300);
  const meta = JSON.parse(store.get(`projects/${PID}/site_layers.json`)).find(x => x.type === 'layermeta');
  if (!meta || meta.cadColors['WBS - 3D-TEXT'] !== '#16a34a') fail('Färgen ska sparas i projektet: ' + JSON.stringify(meta));
  const cols = await page.evaluate(() => [cadLayerColor(cads()[0], 'WBS - 3D-TEXT', '#ff0000'), cadLayerColor(cads()[1], 'wbs - 3d-text', '#ff0000'), cadLayerColor(cads()[0], 'MÅTT', '#ff0000')]);
  if (cols[0] !== '#16a34a' || cols[1] !== '#16a34a' || cols[2] !== '#ff0000') fail('Färgen ska gälla lagret i alla DXF-ritningar (och bara det lagret): ' + JSON.stringify(cols));
  const sw = await page.locator('.layer-row[data-layer="cadl:c1:WBS - 3D-TEXT"] .ca-sw').evaluate(el => getComputedStyle(el).backgroundColor);
  if (sw !== 'rgb(22, 163, 74)') fail('Rutan ska visa den nya färgen: ' + sw);
  if (await page.evaluate(() => layerSel.size)) fail('Att välja färg ska inte markera raden');
  await page.locator('.layer-row[data-layer="cadl:c1:WBS - 3D-TEXT"] .cl-reset').click(); await page.waitForTimeout(300);
  if (await page.evaluate(() => cadColorOverride('WBS - 3D-TEXT'))) fail('↺ ska återställa originalfärgen');
  console.log('OK: färg på DXF-lager i lagerlistan – gäller alla ritningar, sparas och kan återställas');
  if (errors.length) fail('Fel i sidan: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
