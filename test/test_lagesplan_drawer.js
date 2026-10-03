// Funktionstest: sidomenyn på iPhone (Victors önskemål 2026-10-03, test – som i Claude-appen).
// Avatarknappen eller ett drag från vänsterkanten skjuter vyn åt höger och visar menyn;
// tryck på den nedtonade vyn stänger; menyns val styr samma knappar som förut.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8996;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const ctx = await browser.newContext({ viewport: { width: 390, height: 744 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor Falk' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error("x")) }) };' }));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`);
  await page.waitForFunction(() => document.body.classList.contains('phone') && document.getElementById('apDrawer'));
  await page.evaluate(() => {
    const fp = $('fieldPlan'); fp.innerHTML = '<option value="a">Plan A</option><option value="b">Plan B</option>'; fp.value = 'a';
    const fv = $('fieldView'); fv.innerHTML = '<option value="">Vy…</option><option value="v1">📑 Grundplan</option>';
    window.__plan = []; fp.addEventListener('change', () => __plan.push(fp.value));
  });
  // Öppna med avatarknappen.
  await page.click('#apAvatar'); await page.waitForTimeout(550);
  const o = await page.evaluate(() => ({ on: document.body.classList.contains('dr-on'), shift: new DOMMatrix(getComputedStyle($('layout')).translate === 'none' ? '' : `translateX(${getComputedStyle($('layout')).translate.split(' ')[0]})`).m41, w: $('apDrawer').getBoundingClientRect().width, items: [...document.querySelectorAll('#apDrawer .dr-item span')].map(s => s.textContent), ini: document.querySelector('#apDrawer .dr-avatar').textContent, plansOn: document.querySelector('#apDrawer [data-dr-plan="a"]').classList.contains('on') }));
  if (!o.on || Math.abs(o.shift - o.w) > 2) fail('Avatarknappen ska skjuta vyn åt höger lika långt som menyn är bred: ' + JSON.stringify(o));
  ['Dag', 'Lager', 'Foto', 'Rita', 'Spara vy', 'Fullständig vy', 'Guide', 'Grundplan', 'Plan A', 'Plan B'].forEach(t => { if (!o.items.includes(t)) fail('Menyn saknar ' + t + ': ' + JSON.stringify(o.items)); });
  if (o.ini !== 'VF' || !o.plansOn) fail('Initialer och aktuell plan markerad: ' + JSON.stringify(o));
  // Tryck på den nedtonade vyn stänger.
  await page.mouse.click(370, 300); await page.waitForTimeout(550);
  if (await page.evaluate(() => document.body.classList.contains('dr-on'))) fail('Tryck på vyn ska stänga menyn');
  // Drag från vänsterkanten öppnar och följer fingret.
  await page.mouse.move(4, 300); await page.mouse.down(); await page.mouse.move(120, 305, { steps: 6 });
  const mid = await page.evaluate(() => parseFloat(getComputedStyle(document.body).getPropertyValue('--dr-shift')));
  await page.mouse.move(260, 305, { steps: 6 }); await page.waitForTimeout(120); await page.mouse.up(); await page.waitForTimeout(550);
  if (!(mid > 80 && mid < 140) || !(await page.evaluate(() => drOpen))) fail('Drag från kanten ska följa fingret och öppna: ' + mid);
  // Välj en plan i menyn.
  await page.click('#apDrawer [data-dr-plan="b"]'); await page.waitForTimeout(550);
  if (JSON.stringify(await page.evaluate(() => __plan)) !== '["b"]' || (await page.evaluate(() => drOpen))) fail('Planen ska bytas och menyn stängas');
  // Lager i menyn öppnar lagerkortet.
  await page.click('#apAvatar'); await page.waitForTimeout(550);
  await page.click('#apDrawer [data-dr-btn="btnFieldLayers"]'); await page.waitForTimeout(600);
  if (!(await page.isVisible('#fieldSheet'))) fail('Lager i menyn ska öppna lagren');
  // Drag åt vänster på menyn stänger.
  await page.click('#fieldSheet .fs-head button'); await page.click('#apAvatar'); await page.waitForTimeout(550);
  await page.mouse.move(250, 400); await page.mouse.down(); await page.mouse.move(60, 402, { steps: 8 }); await page.waitForTimeout(120); await page.mouse.up(); await page.waitForTimeout(550);
  if (await page.evaluate(() => drOpen)) fail('Drag åt vänster ska stänga menyn');
  // iPad (pekskärm, större): samma meny.
  await page.setViewportSize({ width: 1024, height: 768 }); await page.waitForTimeout(200);
  await page.evaluate(() => drOpenFn()); await page.waitForTimeout(500);
  if (!(await page.evaluate(() => drOpen && document.body.classList.contains('ap-wide')))) fail('Menyn ska finnas på iPad också');
  await page.evaluate(() => drClose());
  // Dator med mus: ingen meny.
  const dctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const dp = await dctx.newPage();
  await dp.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
  await dp.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib = { GlobalWorkerOptions: {} };' }));
  await dp.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await dp.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await dp.waitForTimeout(800);
  await dp.evaluate(() => drOpenFn());
  if (await dp.evaluate(() => drOpen || document.body.classList.contains('phone'))) fail('Med mus: ingen meny och ingen telefonlayout');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
  console.log('OK: sidomeny på iPhone – öppnas med avatarknappen eller från kanten, stängs med tryck eller drag, styr samma knappar');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
