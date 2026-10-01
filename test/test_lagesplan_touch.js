// Funktionstest: Lägesplan på iPad (Victors önskemål 2026-10-01).
// Pekstöd: ett finger panorerar, två fingrar nyper (zoom). Fältläge: slås på
// av sig själv på pekskärm (inte med mus), förenklad vy med stora knappar
// som styr de vanliga kontrollerna (datum, lager), "Fullständig" går tillbaka
// och valet kommer ihåg.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8961;
const PID = 'p1';
const store = new Map([[`projects/${PID}/plan_items.json`, JSON.stringify([{ id: 'a', object_name: 'A', status: 'planerad' }])],
  [`projects/${PID}/status_plans.json`, '[]']]);

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS_DIR, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const setup = async ctx => {
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib = window.pdfjsLib || { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error("ingen pdf")) }) };' }));
    await page.route('https://api.github.com/**', r => {
      const u = new URL(r.request().url());
      if (u.pathname === '/repos/vfalk-NCC/4D-data') return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      const f = decodeURIComponent(u.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
      if (!store.has(f)) return r.fulfill({ status: 404, body: '{}' });
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(store.get(f)).toString('base64'), sha: 's' }) });
    });
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=${PID}`); await page.waitForTimeout(1200);
    return { page, errors };
  };

  // 1) Med mus: allt som förut (inget fältläge).
  const desk = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const d = await setup(desk);
  if (await d.page.evaluate(() => document.body.classList.contains('field'))) fail('Med mus ska den vanliga vyn visas');
  if (!(await d.page.isVisible('aside'))) fail('Menyn ska synas med mus');
  if (await d.page.isVisible('#fieldTop')) fail('Fältlägets knappar ska inte synas med mus');
  console.log('OK: med mus är allt som förut');
  await desk.close();

  // 2) iPad: fältläge från början.
  const pad = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });
  const { page, errors } = await setup(pad);
  if (!(await page.evaluate(() => document.body.classList.contains('field')))) fail('Pekskärm: fältläge ska vara på');
  if (await page.isVisible('aside')) fail('Menyn ska vara dold i fältläge');
  for (const id of ['#fieldPlan', '#btnFieldLayers', '#btnFieldFull', '#btnFieldToday', '#fieldSlider']) if (!(await page.isVisible(id))) fail(id + ' ska synas i fältläge');
  const h = (await page.locator('#btnFieldToday').boundingBox()).height;
  if (h < 44) fail('Knapparna ska vara stora (minst 44 px), fick ' + h);
  console.log('OK: pekskärm ger fältläge med stora knappar');

  // 3) Pekstöd: ett finger panorerar, nyp zoomar.
  const cdp = await pad.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  // Utan PDF i testet: låtsas att en plan är inläst (annars ignoreras musdrag i planen).
  await page.evaluate(() => { viewport = { transform: [1, 0, 0, 1, 0, 0], width: 1000, height: 800 }; $('empty').classList.add('hidden'); });
  const v0 = await page.evaluate(() => ({ ...view }));
  await touch('touchStart', [[500, 400]]); for (let k = 1; k <= 5; k++) await touch('touchMove', [[500 + k * 20, 400 + k * 10]]); await touch('touchEnd', []);
  await page.waitForTimeout(100);
  const v1 = await page.evaluate(() => ({ ...view }));
  if (Math.round(v1.tx - v0.tx) !== 100 || Math.round(v1.ty - v0.ty) !== 50) fail(`Ett finger ska panorera 100/50 px, fick ${v1.tx - v0.tx}/${v1.ty - v0.ty}`);
  await touch('touchStart', [[500, 400], [600, 400]]); for (let k = 1; k <= 5; k++) await touch('touchMove', [[500 - k * 10, 400], [600 + k * 10, 400]]); await touch('touchEnd', []);
  await page.waitForTimeout(100);
  const v2 = await page.evaluate(() => ({ ...view }));
  if (!(v2.scale > v1.scale * 1.8)) fail(`Nyp isär ska zooma in ~2x, fick ${v1.scale} -> ${v2.scale}`);
  console.log('OK: ett finger panorerar, två fingrar nyper för att zooma');

  // 4) Datum och lager via de stora knapparna.
  await page.evaluate(() => { $('dateInput').value = '2026-10-01'; $('dateInput').dispatchEvent(new Event('change')); });
  await page.tap('#btnFieldNextW'); await page.waitForTimeout(150);
  if ((await page.inputValue('#dateInput')) !== '2026-10-08') fail('v ▶ ska gå en vecka framåt, fick ' + await page.inputValue('#dateInput'));
  if (!(await page.innerText('#fieldDateLabel')).includes('8 okt')) fail('Datumet ska visas stort, fick ' + await page.innerText('#fieldDateLabel'));
  await page.tap('#btnFieldLayers'); await page.waitForTimeout(150);
  const zon = page.locator('#fieldSheetBody [data-key="zones"]');
  if (!(await zon.isVisible())) fail('Lagerpanelen ska visa Zoner');
  const before = await page.evaluate(() => ls('zones').visible);
  await zon.tap(); await page.waitForTimeout(150);
  if ((await page.evaluate(() => ls('zones').visible)) === before) fail('Zoner ska växla');
  if ((await page.locator('#layerList .layer-row[data-layer="zones"] .lr-vis').isChecked()) === before) fail('Den vanliga lagerlistan ska följa med');
  await page.tap('#btnFieldSheetClose');
  console.log('OK: datum och lager i fältläget styr samma sak som den vanliga vyn');

  // 4b) Dölj alla knappar – bara 👁 kvar, som tar tillbaka dem.
  await page.tap('#btnFieldHide'); await page.waitForTimeout(100);
  for (const id of ['#fieldTop', '#fieldBottom', '#zoomCtl']) if (await page.isVisible(id)) fail(id + ' ska döljas');
  if (!(await page.isVisible('#btnFieldShow'))) fail('👁 ska synas när knapparna är dolda');
  await page.tap('#btnFieldShow'); await page.waitForTimeout(100);
  if (!(await page.isVisible('#fieldTop')) || !(await page.isVisible('#zoomCtl')) || await page.isVisible('#btnFieldShow')) fail('👁 ska ta tillbaka knapparna');
  console.log('OK: Dölj gömmer alla knappar, 👁 tar tillbaka dem');

  // 5) Fullständig vy, och valet kommer ihåg.
  await page.tap('#btnFieldFull'); await page.waitForTimeout(150);
  if (!(await page.isVisible('aside')) || await page.isVisible('#fieldTop')) fail('Fullständig ska visa den vanliga vyn');
  await page.reload(); await page.waitForTimeout(1200);
  if (await page.evaluate(() => document.body.classList.contains('field'))) fail('Valet (fullständig) ska kommas ihåg');
  await page.click('#btnFieldMode'); await page.waitForTimeout(150);
  if (!(await page.isVisible('#fieldTop'))) fail('📱 ska slå på fältläget igen');
  console.log('OK: växla mellan fältläge och fullständig vy, valet kommer ihåg');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
  console.log('OK: pekstöd och fältläge i Lägesplan');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
