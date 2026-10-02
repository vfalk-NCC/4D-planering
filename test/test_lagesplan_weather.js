// Funktionstest: väder i dagsplaneringen (Victors önskemål 2026-10-01).
// SWEREF 99 -> lat/lon, SMHI-prognosen (simulerad) sammanställs per dag och
// visas i dagspanelen, veckovyn och dagbladet. Varningar: byvind när lyft är
// bokat, kyla och regn vid gjutning. Vindgränsen ändras i inställningarna.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8964;
const PID = 'p1';
const store = new Map([[`projects/${PID}/plan_items.json`, '[]'], [`projects/${PID}/status_plans.json`, '[]']]);
const pad = n => String(n).padStart(2, '0');
const localIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Simulerad SMHI-prognos (gamla formatet pmp3g): i dag blåsigt, kallt och regnigt, i morgon lugnt.
function smhi() {
  const ts = [];
  const start = new Date(); start.setUTCMinutes(0, 0, 0); start.setUTCHours(0);
  for (let h = 0; h < 72; h++) {
    const t = new Date(start.getTime() + h * 3600000);
    const day0 = h < 22;
    const p = (name, v) => ({ name, values: [v] });
    ts.push({ validTime: t.toISOString().replace('.000', ''), parameters: [p('t', day0 ? -3 + (h % 24) / 6 : 8), p('ws', day0 ? 7 : 3), p('gust', day0 ? 14 : 6), p('pmean', day0 ? 0.6 : 0), p('Wsymb2', day0 ? 19 : 2)] });
  }
  return { timeSeries: ts };
}

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS_DIR, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); localStorage.setItem('lagesplan-field', '0'); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error("x")) }) };' }));
  const smhiCalls = [];
  await page.route('https://opendata-download-metfcst.smhi.se/**', r => {
    const u = r.request().url(); smhiCalls.push(u);
    if (u.includes('snow1g')) return r.fulfill({ status: 404, body: '{}' }); // nya formatet saknas -> det gamla används
    r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(smhi()) });
  });
  await page.route('https://api.github.com/**', r => {
    const u = new URL(r.request().url());
    const f = decodeURIComponent(u.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (r.request().method() === 'PUT') { const b = JSON.parse(r.request().postData()); store.set(f, Buffer.from(b.content, 'base64').toString()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"content":{"sha":"s"}}' }); }
    if (!store.has(f)) return r.fulfill({ status: 404, body: '{}' });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(store.get(f)).toString('base64'), sha: 's' }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=${PID}`); await page.waitForTimeout(1000);

  // 1) SWEREF 99 20 15 <-> WGS84 åt båda hållen.
  const rt = await page.evaluate(() => {
    const z = SWEREF_ZONES.find(x => x.name === 'SWEREF 99 20 15');
    const [N, E] = geodeticToGrid(65.58, 20.25, z);
    const [lat, lon] = gridToGeodetic(N, E, z);
    const tm = SWEREF_ZONES[0], [N2, E2] = geodeticToGrid(59.33, 18.07, tm), [lat2, lon2] = gridToGeodetic(N2, E2, tm);
    return { lat, lon, lat2, lon2, N, E };
  });
  if (Math.abs(rt.lat - 65.58) > 1e-7 || Math.abs(rt.lon - 20.25) > 1e-7 || Math.abs(rt.lat2 - 59.33) > 1e-7 || Math.abs(rt.lon2 - 18.07) > 1e-7) fail('SWEREF -> lat/lon ska bli exakt tillbaka: ' + JSON.stringify(rt));
  console.log('OK: SWEREF 99 (20 15 och TM) räknas om till lat/lon');

  const rt0 = rt;
  // 2) Projektets plats -> SMHI, sammanställt per dag.
  const today = localIso(new Date()), tomorrow = localIso(new Date(Date.now() + 86400000));
  await page.evaluate(({ N, E }) => {
    viewport = { transform: [1, 0, 0, 1, 0, 0], width: 1000, height: 800, convertToPdfPoint: (x, y) => [x, y], convertToViewportPoint: (x, y) => [x, y] };
    $('empty').classList.add('hidden');
    plan = { id: 'pl', name: 'Plan', zones: [], photos: [], calib: { model: [[E, N, 0], [E + 100, N, 0]], pdf: [[0, 0], [1000, 0]] } };
    view.scale = 1; applyView(); renderZones(); showTab('day');
    return loadWeather(true);
  }, rt);
  await page.waitForTimeout(300);
  if (!smhiCalls.some(u => /pmp3g.*lon\/20\.25\/lat\/65\.58\//.test(u))) fail('Prognosen ska hämtas för projektets plats: ' + JSON.stringify(smhiCalls));
  const w = await page.evaluate(d => weatherFor(d), today);
  if (!w || w.gust !== 14 || w.sym !== 19 || !(w.tmin < 0) || !(w.prec >= 5)) fail('Dagens väder ska sammanställas (byar, ikon, minsta temperatur, regn): ' + JSON.stringify(w));
  if (!/Regn .*\(byar 14\) m\/s/.test(await page.textContent('#dayPanel .dp-wx'))) fail('Vädret ska stå i dagspanelen: ' + await page.textContent('#dayPanel .dp-wx'));
  console.log('OK: SMHI-prognosen hämtas för projektets plats och visas i dagspanelen');

  // 3) Varningar: lyft i blåst, gjutning i kyla och regn – bara när något sådant är bokat.
  const none = await page.evaluate(d => computeDailyIssues(d).list.length, today);
  if (none) fail('Utan lyft eller gjutning ska vädret inte ge några varningar');
  const iss = await page.evaluate(({ d, N, E }) => {
    siteItems.push({ id: 'k1', type: 'crane', name: 'Kran 1', pts: [[E, N]], radius: 40 });
    siteItems.push({ id: 'l1', type: 'lift', pts: [[E + 10, N]], crane: 'k1', time: '08:00', from: d, to: d });
    siteItems.push({ id: 'd1', type: 'delivery', veh: 'betongbil', cx: E + 30, cy: N, w: 2.55, h: 10, rot: 0, time: '07:00', from: d, to: d });
    return computeDailyIssues(d).list.map(i => i.text);
  }, { d: today, N: rt.N, E: rt.E });
  if (!iss.some(t => /Byar upp till 14 m\/s \(gräns 10\) – lyft 08:00/.test(t))) fail('Byvind över gränsen ska varna när lyft är bokat: ' + JSON.stringify(iss));
  if (!iss.some(t => /Gjutning i kyla/.test(t)) || !iss.some(t => /Gjutning i regn/.test(t))) fail('Kyla och regn ska varna vid gjutning: ' + JSON.stringify(iss));
  const calm = await page.evaluate(d => { siteItems.filter(x => x.from).forEach(x => { x.from = x.to = d; }); return computeDailyIssues(d).list.length; }, tomorrow);
  if (calm) fail('Lugnt väder ska inte ge varningar');
  await page.evaluate(d => { siteItems.filter(x => x.from).forEach(x => { x.from = x.to = d; }); renderDayAll(true); }, today);
  console.log('OK: varningar för byvind vid lyft samt kyla och regn vid gjutning');

  // 4) Vindgränsen ändras i inställningarna (sparas i projektet).
  await page.click('#dayPanel [data-wxset]');
  await page.fill('#wxSetBox .wx-gust', '15'); await page.click('#wxSetBox .wx-save'); await page.waitForTimeout(300);
  if ((await page.evaluate(() => wxSettings().gust)) !== 15) fail('Vindgränsen ska sparas');
  if (!JSON.parse(store.get(`projects/${PID}/site_layers.json`)).some(x => x.type === 'wxset' && x.gust === 15)) fail('Inställningen ska sparas i projektet');
  if ((await page.evaluate(d => computeDailyIssues(d).list.map(i => i.text), today)).some(t => /Byar/.test(t))) fail('Med högre gräns ska blåsten inte varna');
  console.log('OK: vindgränsen ändras och sparas i projektet');

  // 5) Veckovyn och dagbladet.
  await page.click('details[data-sec="dayweek"] summary'); await page.waitForTimeout(200);
  if (!(await page.locator('#dayWeek tr.wk-wx').count())) fail('Veckovyn ska ha en väderrad');
  const line = await page.evaluate(d => weatherPdfLine(d), today);
  if (!/^Väder \(SMHI\): Regn -?\d+–\d+ °C · vind 7 \(byar 14\) m\/s/.test(line) || /[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF–]/.test(line)) fail('Dagbladet ska få en väderrad utan emoji: ' + line);
  console.log('OK: väder i veckovyn och dagbladet');

  // 5b) Väder på planen: dag- och veckoruta, egen lager, flyttas, Delete tar bort, Ctrl+Z ångrar.
  const vb = await page.locator('#viewport').boundingBox();
  await page.click('#dayPanel [data-place-wx="wxweek"]');
  await page.mouse.click(vb.x + 300, vb.y + 300); await page.waitForTimeout(200);
  const wk = await page.evaluate(() => siteItems.find(x => x.type === 'wxweek'));
  if (!wk || wk.layer !== 'Väder') fail('Veckans väder ska läggas på planen i lagret Väder: ' + JSON.stringify(wk));
  if (!(await page.evaluate(() => dailyBoxes.has(siteItems.find(x => x.type === 'wxweek').id)))) fail('Väderrutan ska ritas på planen');
  await page.mouse.move(vb.x + 300, vb.y + 300); await page.mouse.down();
  for (let k = 1; k <= 6; k++) await page.mouse.move(vb.x + 300 + k * 10, vb.y + 300);
  await page.mouse.up(); await page.waitForTimeout(200);
  const mv = await page.evaluate(() => siteItems.find(x => x.type === 'wxweek').pts[0]);
  if (Math.abs(mv[0] - (rt0.E + 36)) > 0.6) fail('Väderrutan ska gå att dra: ' + JSON.stringify(mv));
  await page.click('#dayPanel [data-place-wx="wxday"]');
  await page.mouse.click(vb.x + 600, vb.y + 200); await page.waitForTimeout(200);
  if (!(await page.evaluate(() => siteItems.some(x => x.type === 'wxday')))) fail('Dagens väder ska gå att lägga på planen');
  if (!(await page.evaluate(() => legendItems({ site: true }).every(i => !/Väder/.test(i.label))))) fail('Väderrutorna ska inte hamna i förklaringen');
  await page.mouse.click(vb.x + 600, vb.y + 200); await page.waitForTimeout(150);
  await page.keyboard.press('Delete'); await page.waitForTimeout(200);
  if (await page.evaluate(() => siteItems.some(x => x.type === 'wxday'))) fail('Delete ska ta bort den markerade väderrutan');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
  if (!(await page.evaluate(() => siteItems.some(x => x.type === 'wxday')))) fail('Ctrl+Z ska ta tillbaka den');
  console.log('OK: väder per dag och vecka på planen (eget lager, dras, Delete tar bort, Ctrl+Z ångrar)');

  // 6) Utan nät: ingen krasch, "Väder saknas".
  await page.unroute('https://opendata-download-metfcst.smhi.se/**');
  await page.route('https://opendata-download-metfcst.smhi.se/**', r => r.abort());
  await page.evaluate(() => { localStorage.removeItem('lagesplan-weather'); wx.days = new Map(); return loadWeather(true); });
  await page.waitForTimeout(200);
  if (!/Väder saknas/.test(await page.textContent('#dayPanel .dp-wx'))) fail('Utan prognos ska det stå att vädret saknas');
  console.log('OK: utan nät visas "Väder saknas" utan fel');

  if (errors.length) fail('Fel i sidan: ' + errors.join(' | '));
  await browser.close(); server.close();
  console.log('Alla vädertester gick igenom');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
