// Funktionstest: "Norr uppåt" (Victors önskemål 2026-10-02). Hela planen vrids
// på skärmen så att modellens norr pekar uppåt. Knappen ligger undangömd och
// frågar först. Klick, panorering, zoom och fotonålar träffar rätt i den
// vridna vyn, vinkeln sparas per plan och följer med i sparade vyer.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8966;
const PID = 'p1';
const store = new Map([[`projects/${PID}/plan_items.json`, '[]'], [`projects/${PID}/status_plans.json`, '[]']]);

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS_DIR, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let dialogs = 0, accept = false; page.on('dialog', d => { dialogs++; accept ? d.accept() : d.dismiss(); });
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
  // Ritningen är vriden: modellens X-axel går snett nedåt höger i PDF:en (30°).
  await page.evaluate(() => {
    viewport = { transform: [1, 0, 0, 1, 0, 0], width: 1000, height: 800, convertToPdfPoint: (x, y) => [x, y], convertToViewportPoint: (x, y) => [x, y] };
    $('empty').classList.add('hidden');
    const a = 30 * Math.PI / 180;
    plan = { id: 'pl', name: 'P', zones: [], photos: [{ id: 'ph', x: 400, y: 300, date: '2026-10-01', caption: 'Foto' }], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[300, 200], [300 + 1000 * Math.cos(a), 200 + 1000 * Math.sin(a)]] } };
    view.scale = 1; view.tx = 0; view.ty = 0; applyView(); renderZones(); showTab('zones'); updateCalibInfo();
  });
  if (await page.isHidden('#btnNorthUp')) fail('Knappen ska finnas under Zoner & 3D');
  const n = await page.evaluate(() => northUpAngle() * 180 / Math.PI);
  // Avbryt i frågan: ingenting händer.
  await page.click('#btnNorthUp'); await page.waitForTimeout(100);
  if (dialogs !== 1 || (await page.evaluate(() => view.rot))) fail('Knappen ska fråga först, och Avbryt ska inte vrida planen');
  accept = true;
  await page.click('#btnNorthUp'); await page.waitForTimeout(200);
  const north = await page.evaluate(() => { const a = stageToScreen(mToPx([0, 0])), b = stageToScreen(mToPx([0, 10])); return [b[0] - a[0], b[1] - a[1]]; });
  if (Math.abs(north[0]) > 1e-6 || !(north[1] < 0)) fail(`Norr ska peka rakt uppåt på skärmen (vinkel ${n}°): ` + JSON.stringify(north));
  if (!/rotate\(/.test(await page.evaluate(() => $('stage').style.transform))) fail('Planen ska vridas på skärmen');
  if (!(await page.evaluate(() => localStorage.getItem(northKey())))) fail('Vinkeln ska sparas för planen');
  if (await page.isHidden('#northBadge')) fail('Norrpilen ska synas på planen');
  console.log(`OK: Norr uppåt vrider planen ${Math.round(n)}° efter en fråga, norrpilen visas`);

  // Klick träffar rätt: ett lag placeras precis där man klickar.
  const vb = await page.locator('#viewport').boundingBox();
  const target = [12, 7]; // modell-meter
  const sp = await page.evaluate(m => stageToScreen(mToPx(m)), target);
  await page.evaluate(() => { showTab('day'); startDailyTool('crew', {}); });
  await page.mouse.click(vb.x + sp[0], vb.y + sp[1]); await page.waitForTimeout(200);
  const got = await page.evaluate(() => siteItems.find(x => x.type === 'crew').pts[0]);
  if (Math.hypot(got[0] - target[0], got[1] - target[1]) > 0.15) fail('Klick i vriden vy ska hamna rätt: ' + JSON.stringify(got));
  await page.keyboard.press('Escape');
  // Panorera: punkten under musen följer med.
  const before = await page.evaluate(m => stageToScreen(mToPx(m)), [40, 30]);
  await page.mouse.move(vb.x + 700, vb.y + 700); await page.mouse.down(); await page.mouse.move(vb.x + 760, vb.y + 650, { steps: 5 }); await page.mouse.up();
  const after = await page.evaluate(m => stageToScreen(mToPx(m)), [40, 30]);
  if (Math.abs(after[0] - before[0] - 60) > 1 || Math.abs(after[1] - before[1] + 50) > 1) fail('Panorering i vriden vy ska följa musen: ' + JSON.stringify([before, after]));
  // Zoom: punkten under musen står still.
  const z0 = await page.evaluate(() => screenToStage([500, 400]));
  await page.mouse.move(vb.x + 500, vb.y + 400); await page.mouse.wheel(0, -200); await page.waitForTimeout(100);
  const z1 = await page.evaluate(() => screenToStage([500, 400]));
  if (Math.hypot(z1[0] - z0[0], z1[1] - z0[1]) > 0.5) fail('Zoom i vriden vy ska ske kring musen: ' + JSON.stringify([z0, z1]));
  // Fotonålen: träffytan följer vridningen.
  const hitPin = await page.evaluate(() => { const [tx, ty] = photoScreenPt(photos()[0]); const head = toPdf(screenToStage([tx, ty - (PIN_H - PIN_R)])); const miss = toPdf(screenToStage([tx + 60, ty])); return [photoAt(head) && photoAt(head).id, photoAt(miss)]; });
  if (hitPin[0] !== 'ph' || hitPin[1]) fail('Fotonålens huvud ska gå att träffa i vriden vy (och inte bredvid): ' + JSON.stringify(hitPin));
  console.log('OK: klick, panorering, zoom och fotonålar träffar rätt i den vridna vyn');

  // Sparad vy tar med vinkeln; Ritningens riktning vrider tillbaka.
  await page.evaluate(() => saveLsView('Norr upp', { camera: true }));
  await page.evaluate(() => showTab('zones'));
  await page.click('#btnNorthReset'); await page.waitForTimeout(150);
  if (await page.evaluate(() => view.rot)) fail('"Ritningens riktning" ska vrida tillbaka');
  if (await page.evaluate(() => localStorage.getItem(northKey()))) fail('Tillbakavridningen ska sparas');
  await page.evaluate(() => applyLsView(lsViews().find(v => v.name === 'Norr upp'))); await page.waitForTimeout(200);
  if (Math.abs((await page.evaluate(() => view.rot * 180 / Math.PI)) - n) > 0.01) fail('En sparad vy ska ta med vridningen');
  console.log('OK: sparade vyer tar med vridningen, "Ritningens riktning" vrider tillbaka');

  if (errors.length) fail('Fel i sidan: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
