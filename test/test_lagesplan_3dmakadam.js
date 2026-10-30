const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9096;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  const gh = new Map();
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
    const body = JSON.parse(req.postData()); gh.set(f, Buffer.from(body.content, 'base64').toString());
    if (/ifc_groups\.json$/.test(f)) page.evaluate(t => { window.__gsaved = JSON.parse(t); }, gh.get(f)).catch(() => {});
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async ifc => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    window.__fetch = 0;
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    // UTF-8 rakt i filen ("Stålbolaget") – som en del program skriver.
  }, '');

  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  const ok = (c, m) => { if (!c) fail(m); };
  const sig = () => page.evaluate(() => { const g = l3.placeMeshes.get('mk'); let rows = ''; g.traverse(o => { if (o.userData && o.userData.isSign && o.userData.signSpec && !o.userData.flat) rows = o.userData.signSpec.rows.map(r => r.lines.join(' ')).join('|'); }); return rows; });
  await page.evaluate(() => { const O = l3.O; placements.push({ id: 'mk', type: 'sm:makadam', name: 'Makadam 1', x: O[0] + 20, y: O[1] + 20, z: 0, L: 12, B: 8, H: 0.3, rot: 0, dz: 0, f: { avdrag: 'Ja', fr: '0–32', pack: 15 } }); smartInit && 0; l3AddPlacementMesh(placements[placements.length - 1]); });
  const a0 = await sig(); ok(/96/.test(a0) && !/objekt/.test(a0), 'Makadamen utan objekt: ' + a0);
  // lägg ett objekt i makadamen (via biblioteket) – skylten ska dra av direkt
  await page.evaluate(() => { const O = l3.O, p = placeNew('container', [O[0] + 20, O[1] + 20, 0]); p.id = 'cx'; placements.push(p); placeTouch(p); l3AddPlacementMesh(p); });
  await page.waitForTimeout(500); const a1 = await sig(); ok(/-1 objekt|−1 objekt/.test(a1) || /1 objekt/.test(a1), 'Skylten ska dra av nyplacerat objekt: ' + a1);
  // ta bort det
  await page.evaluate(() => { l3SelectIds(['cx']); l3DeleteSel(); }); await page.waitForTimeout(400); const a2 = await sig(); ok(!/objekt/.test(a2), 'Skylten ska följa med när objektet tas bort: ' + a2);
  // roterad makadam och drag i realtid: objektet flyttas ut ur ytan och in igen
  await page.evaluate(() => { const O = l3.O, m = placements.find(p => p.id === 'mk'); m.rot = 90; placeTouch(m); l3RebuildOne(m); const p = placeNew('container', [O[0] + 20, O[1] + 24, 0]); p.id = 'cy'; placements.push(p); placeTouch(p); l3AddPlacementMesh(p); });
  await page.waitForTimeout(500); const r1 = await sig(); ok(/1 objekt/.test(r1), 'Roterad makadam ska dra av objekt i sin yta: ' + r1);
  await page.evaluate(() => { const O = l3.O, p = placements.find(q => q.id === 'cy'); p.x = O[0] + 80; l3MkRefresh(p); }); await page.waitForTimeout(500); const r2 = await sig(); ok(!/objekt/.test(r2), 'Skylten ska följa med när objektet flyttas ut: ' + r2);
  await page.evaluate(() => { const O = l3.O, p = placements.find(q => q.id === 'cy'); p.x = O[0] + 20; l3MkRefresh(p); }); await page.waitForTimeout(500); const r3 = await sig(); ok(/1 objekt/.test(r3), 'Skylten ska följa med när objektet flyttas in: ' + r3);
  console.log('OK: makadamskylten följer objekt som läggs i och tas bort', JSON.stringify([a0, a1, a2]).slice(0, 300));
  ok(!errors.length, errors.join('|'));
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
