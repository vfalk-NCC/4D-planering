// Funktionstest: foto i helskärm (Victors önskemål 2026-10-04). Tryck på det öppnade fotot så fyller
// det skärmen; dubbeltryck zoomar in/ut, nyp zoomar, ett tryck (ej inzoomat) eller Esc går tillbaka.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8997;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 390, height: 744 }, hasTouch: true, isMobile: true })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib = { GlobalWorkerOptions: {} };' }));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`);
  await page.waitForFunction(() => document.body.classList.contains('field'));
  // Ett öppnat foto (en liten bild som data-URL).
  await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#4a7'; x.fillRect(0, 0, 400, 300);
    photoFull(false); $('photoModal').classList.remove('hidden'); $('pmMeta').textContent = 'Foto'; $('pmImg').src = c.toDataURL();
  });
  await page.waitForTimeout(100);
  const box0 = await page.locator('#pmImg').boundingBox();
  await page.mouse.click(box0.x + box0.width / 2, box0.y + box0.height / 2); await page.waitForTimeout(100);
  const full = await page.evaluate(() => ({ on: $('photoModal').classList.contains('pm-full'), r: $('pmImg').getBoundingClientRect().toJSON(), bg: getComputedStyle($('photoModal')).backgroundColor, meta: getComputedStyle($('pmMeta')).display }));
  if (!full.on || full.r.width < 389 || full.r.height < 740 || full.bg !== 'rgb(0, 0, 0)' || full.meta !== 'none') fail('Tryck på fotot ska ge helskärm: ' + JSON.stringify(full));
  // Dubbeltryck zoomar in, dubbeltryck igen zoomar ut.
  await page.mouse.click(200, 300); await page.waitForTimeout(80); await page.mouse.click(200, 300); await page.waitForTimeout(400);
  const z = await page.evaluate(() => ({ s: pmZ.s, x: pmZ.x, y: pmZ.y, tf: $('pmImg').style.transform, full: $('photoModal').classList.contains('pm-full') }));
  if (z.s !== 2.5 || !/scale\(2\.5\)/.test(z.tf) || !z.full) fail('Dubbeltryck ska zooma in och stanna i helskärm: ' + JSON.stringify(z));
  // Dra när inzoomat flyttar bilden.
  await page.mouse.move(200, 300); await page.mouse.down(); await page.mouse.move(260, 340, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(400);
  const pan = await page.evaluate(() => ({ ...pmZ, full: $('photoModal').classList.contains('pm-full') }));
  if (!pan.full || Math.abs(pan.x - z.x - 60) > 2 || Math.abs(pan.y - z.y - 40) > 2) fail('Dra ska flytta den inzoomade bilden: ' + JSON.stringify(pan));
  await page.mouse.click(200, 300); await page.waitForTimeout(80); await page.mouse.click(200, 300); await page.waitForTimeout(400);
  if ((await page.evaluate(() => pmZ.s)) !== 1) fail('Dubbeltryck igen ska zooma ut');
  // Nyp med två fingrar zoomar.
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  await touch('touchStart', [[150, 370], [240, 370]]); for (let k = 1; k <= 5; k++) await touch('touchMove', [[150 - k * 15, 370], [240 + k * 15, 370]]); await touch('touchEnd', []);
  await page.waitForTimeout(100);
  const pin = await page.evaluate(() => pmZ.s);
  if (!(pin > 2 && pin < 3)) fail('Nyp isär ska zooma in ~2,7x, fick ' + pin);
  await page.evaluate(() => { Object.assign(pmZ, { s: 1, x: 0, y: 0 }); pmApply(false); });
  await page.waitForTimeout(350);
  // Ett tryck går tillbaka till det vanliga fönstret med fotot.
  await page.mouse.click(200, 300); await page.waitForTimeout(450);
  const back = await page.evaluate(() => ({ full: $('photoModal').classList.contains('pm-full'), open: !$('photoModal').classList.contains('hidden') }));
  if (back.full || !back.open) fail('Ett tryck ska lämna helskärmen men behålla fotot: ' + JSON.stringify(back));
  // Esc: först ur helskärm, sedan stäng.
  await page.mouse.click(box0.x + box0.width / 2, box0.y + box0.height / 2); await page.waitForTimeout(100);
  await page.keyboard.press('Escape');
  if (await page.evaluate(() => $('photoModal').classList.contains('pm-full') || $('photoModal').classList.contains('hidden'))) fail('Esc ska först lämna helskärmen');
  await page.keyboard.press('Escape');
  if (!(await page.evaluate(() => $('photoModal').classList.contains('hidden')))) fail('Esc igen ska stänga fotot');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
  console.log('OK: foto i helskärm – tryck in/ut, dubbeltryck zoomar, dra flyttar, Esc');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
