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
      if (r.request().method() === 'PUT') { const b = JSON.parse(r.request().postData()); store.set(f, Buffer.from(b.content, 'base64').toString()); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + Date.now() } }) }); }
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
  // Frihand med mus i den vanliga vyn.
  await d.page.evaluate(() => { viewport = { transform: [1, 0, 0, 1, 0, 0], width: 1000, height: 800, convertToPdfPoint: (x, y) => [x, y], convertToViewportPoint: (x, y) => [x, y] }; $('empty').classList.add('hidden'); plan = { id: 'pl', name: 'P', zones: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } }; startSiteTool('sketch'); });
  const vb = await d.page.locator('#viewport').boundingBox();
  await d.page.mouse.move(vb.x + 300, vb.y + 300); await d.page.mouse.down();
  for (let k = 1; k <= 6; k++) await d.page.mouse.move(vb.x + 300 + k * 20, vb.y + 300 + k * 5);
  await d.page.mouse.up(); await d.page.waitForTimeout(200);
  if ((await d.page.evaluate(() => siteItems.filter(x => x.type === 'sketch').length)) !== 1) fail('Frihand ska gå att rita med mus också');
  if (!(await d.page.locator('[data-site="sketch"]').count())) fail('Frihand ska finnas bland verktygen i den vanliga vyn');
  console.log('OK: med mus är allt som förut (och Frihand finns bland verktygen)');

  // GPS: WGS84 -> SWEREF 99 20 15 (zonen väljs efter planens kalibrering) och EXIF-GPS ur en JPEG.
  const gps = await d.page.evaluate(async () => {
    const z = SWEREF_ZONES.find(z => z.name === 'SWEREF 99 20 15');
    const [N, E] = geodeticToGrid(67.0, 20.25, z);
    plan = { id: 'pl', name: 'P', zones: [], calib: { model: [[E, N, 0], [E + 100, N, 0]], pdf: [[0, 0], [1000, 0]] } };
    const hit = gpsToModel(67.0001, 20.2504);
    // JPEG med EXIF-GPS (67°0'1.08"N 20°15'1.44"E)
    const le16 = n => [n & 255, n >> 8], le32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24];
    const gOff = 26, dOff = gOff + 2 + 4 * 12 + 4;
    const ent = (t, ty, c, v) => [...le16(t), ...le16(ty), ...le32(c), ...v];
    const tiff = [0x49, 0x49, ...le16(42), ...le32(8), ...le16(1), ...ent(0x8825, 4, 1, le32(gOff)), ...le32(0),
      ...le16(4), ...ent(1, 2, 2, [78, 0, 0, 0]), ...ent(2, 5, 3, le32(dOff)), ...ent(3, 2, 2, [69, 0, 0, 0]), ...ent(4, 5, 3, le32(dOff + 24)), ...le32(0),
      ...[67, 1, 0, 1, 108, 100, 20, 1, 15, 1, 144, 100].flatMap(le32)];
    const app1 = [0xFF, 0xE1, (tiff.length + 8) >> 8, (tiff.length + 8) & 255, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    const ex = await readExifGps(new Blob([new Uint8Array([0xFF, 0xD8, ...app1, 0xFF, 0xD9])]));
    return { zone: hit && hit.zone, dE: hit && hit.m[0] - E, dN: hit && hit.m[1] - N, lat: ex && ex.lat, lon: ex && ex.lon };
  });
  if (gps.zone !== 'SWEREF 99 20 15') fail('GPS ska räknas om i projektets zon SWEREF 99 20 15, fick ' + JSON.stringify(gps));
  if (Math.abs(gps.dN - 11.1) > 0.5 || Math.abs(gps.dE - 17.4) > 0.5) fail('GPS-förflyttningen ska bli ca 17 m öst / 11 m norr, fick ' + JSON.stringify(gps));
  if (Math.abs(gps.lat - 67.0003) > 1e-6 || Math.abs(gps.lon - 20.2504) > 1e-6) fail('EXIF-GPS ska läsas ur fotot, fick ' + JSON.stringify(gps));
  console.log('OK: GPS räknas om till SWEREF 99 20 15 och läses ur fotots EXIF');

  // Etablering kan fällas ut: objekten listas, klick visar, 🗑 tar bort.
  await d.page.evaluate(() => {
    siteItems.push({ id: 'n1', type: 'note', layer: 'Etablering', pts: [[1, 1], [2, 2]], text: 'Notering A' }, { id: 'b1', type: 'shed', layer: 'Etablering', cx: 5, cy: 5, w: 3, h: 6, rot: 0, name: 'Bod 1' });
    renderLayerPanel();
  });
  if (await d.page.isVisible('.site-item-row')) fail('Objekten ska vara hopfällda från början');
  await d.page.click('.ul-toggle[data-ul="Etablering"]'); await d.page.waitForTimeout(100);
  const rowsTxt = await d.page.evaluate(() => [...document.querySelectorAll('.site-item-row:not(.hidden) .ln')].map(e => e.textContent.trim()).join('|'));
  if (rowsTxt !== 'Bod 1|Frihand|Notering A') fail('Etablering ska lista sina objekt, fick ' + rowsTxt);
  await d.page.click('.site-item-row:has-text("Notering A") .si-del'); await d.page.waitForTimeout(400);
  if (await d.page.evaluate(() => siteItems.some(x => x.id === 'n1'))) fail('🗑 ska ta bort objektet');
  if (!(await d.page.isVisible('.site-item-row:has-text("Bod 1")'))) fail('Listan ska ligga kvar utfälld');
  // Flerval med Ctrl/Shift i lagret, Delete tar bort alla markerade (frågar först).
  d.page.on('dialog', dl => dl.accept());
  await d.page.evaluate(() => { siteItems.push({ id: 'b2', type: 'shed', layer: 'Etablering', cx: 9, cy: 5, w: 3, h: 6, rot: 0, name: 'Bod 2' }, { id: 'k1', type: 'crane', layer: 'Etablering', pts: [[3, 3]], radius: 20, name: 'Kran 1' }); renderLayerPanel(); });
  await d.page.locator('.site-item-row', { hasText: 'Bod 1' }).locator('.ln').click(); await d.page.evaluate(() => closeSitePop());
  await d.page.locator('.site-item-row', { hasText: 'Kran 1' }).locator('.ln').click({ modifiers: ['Shift'] });
  // (Frihandsstrecket från tidigare i testet ligger mellan Bod och Kran i listan.)
  const shiftSel = await d.page.evaluate(() => [...itemSel].map(k => siteItems.find(x => 's:' + x.id === k)).map(x => x.type === 'sketch' ? 'frihand' : x.id).sort().join(','));
  if (shiftSel !== 'b1,b2,frihand,k1') fail('Shift-klick ska markera intervallet, fick ' + shiftSel);
  await d.page.locator('.site-item-row', { hasText: 'Bod 2' }).locator('.ln').click({ modifiers: ['Control'] });
  if (!(await d.page.innerText('#layerSelBar')).includes('3 markerade')) fail('Raden ska visa 3 markerade');
  await d.page.keyboard.press('Delete'); await d.page.waitForTimeout(300);
  const left = await d.page.evaluate(() => siteItems.filter(x => x.layer === 'Etablering' && x.type !== 'sketch').map(x => x.id).sort().join(','));
  if (left !== 'b2' || (await d.page.evaluate(() => siteItems.some(x => x.type === 'sketch')))) fail('Delete ska ta bort de markerade (Bod 1, frihand, Kran 1), kvar: ' + left);
  console.log('OK: Etablering fälls ut, flerval med Ctrl/Shift, ta bort direkt i listan');
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
  await page.evaluate(() => { viewport = { transform: [1, 0, 0, 1, 0, 0], width: 1000, height: 800, convertToPdfPoint: (x, y) => [x, y], convertToViewportPoint: (x, y) => [x, y] }; $('empty').classList.add('hidden'); });
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

  // 3b) ✏️ Rita på frihand (kalibrerad plan): ett drag sparas, nyp avbryter inte zoomen och sparar inget.
  await page.evaluate(() => { plan = { id: 'pl', name: 'P', zones: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } }; view.scale = 1; view.tx = 0; view.ty = 0; applyView(); });
  const n0 = await page.evaluate(() => siteItems.filter(x => x.type === 'sketch').length);
  await page.tap('#btnFieldSketch'); await page.waitForTimeout(100);
  if (!(await page.isVisible('#fieldTools'))) fail('Ritverktyget ska visa sin rad (färger, Klar)');
  await page.tap('.ft-color[data-c="#16a34a"]');
  await touch('touchStart', [[300, 300]]); for (let k = 1; k <= 8; k++) await touch('touchMove', [[300 + k * 20, 300 + k * 8]]); await touch('touchEnd', []);
  await page.waitForTimeout(400);
  let sk = await page.evaluate(() => siteItems.filter(x => x.type === 'sketch').map(x => ({ n: x.pts.length, c: x.color })));
  if (sk.length !== n0 + 1 || sk[sk.length - 1].n < 8 || sk[sk.length - 1].c !== '#16a34a') fail('Ett drag ska sparas som frihand i vald färg, fick ' + JSON.stringify(sk));
  const sc = await page.evaluate(() => view.scale);
  await touch('touchStart', [[500, 400]]); await touch('touchStart', [[500, 400], [600, 400]]);
  for (let k = 1; k <= 5; k++) await touch('touchMove', [[500 - k * 10, 400], [600 + k * 10, 400]]); await touch('touchEnd', []);
  await page.waitForTimeout(300);
  if ((await page.evaluate(() => siteItems.filter(x => x.type === 'sketch').length)) !== n0 + 1) fail('Nyp under ritning ska inte spara ett streck');
  if (!((await page.evaluate(() => view.scale)) > sc * 1.5)) fail('Nyp ska zooma även med ritverktyget aktivt');
  await page.tap('#btnFieldToolDone'); await page.waitForTimeout(100);
  if (await page.evaluate(() => siteTool !== null)) fail('Klar ska stänga ritverktyget');
  await page.waitForTimeout(600);
  if (!(store.get(`projects/${PID}/site_layers.json`) || '').includes('"sketch"')) fail('Frihandsritningen ska sparas i projektet (syns på datorn)');
  if (!(await page.evaluate(() => document.querySelector('meta[name="viewport"]').content)).includes('maximum-scale=1')) fail('Fältläge ska låsa sidzoomen');
  console.log('OK: ✏️ rita på frihand sparas i projektet, nyp zoomar utan att rita');
  // ↶ / ↷ i fältläget.
  if (await page.isDisabled('#btnFieldUndo')) fail('↶ ska gå att trycka på efter en ritning');
  await page.tap('#btnFieldUndo'); await page.waitForTimeout(300);
  if ((await page.evaluate(() => siteItems.filter(x => x.type === 'sketch').length)) !== n0) fail('↶ ska ångra senaste strecket');
  if ((JSON.parse(store.get(`projects/${PID}/site_layers.json`)).filter(x => x.type === 'sketch').length) !== n0) fail('Ångringen ska sparas');
  if (await page.isDisabled('#btnFieldRedo')) fail('↷ ska gå att trycka på efter en ångring');
  await page.tap('#btnFieldRedo'); await page.waitForTimeout(300);
  if ((await page.evaluate(() => siteItems.filter(x => x.type === 'sketch').length)) !== n0 + 1) fail('↷ ska göra om strecket');
  if (!(await page.isDisabled('#btnFieldRedo'))) fail('↷ ska vara avstängd när det inte finns något att göra om');
  console.log('OK: ↶ ångra och ↷ gör om i fältläget');

  // 📍 Min position i realtid (som Google Maps).
  const gl = await page.evaluate(async () => {
    const z = SWEREF_ZONES.find(z => z.name === 'SWEREF 99 20 15');
    const [N, E] = geodeticToGrid(67.0, 20.25, z);
    plan = { id: 'pl', name: 'P', zones: [], calib: { model: [[E, N, 0], [E + 100, N, 0]], pdf: [[0, 0], [1000, 0]] } };
    view.scale = 1; view.tx = 0; view.ty = 0; applyView();
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition: (ok, err) => { window.__gs = ok; window.__ge = err; return 7; }, clearWatch: id => { window.__cleared = id; } } });
    const out = {};
    $('btnFieldGps').click();
    __gs({ coords: { latitude: 67.0001, longitude: 20.2504, accuracy: 8, heading: 90, speed: 1.2 } });
    const el = $('gpsMe'), r = $('viewport').getBoundingClientRect();
    out.shown = !el.classList.contains('hidden');
    out.center = [parseFloat(el.style.left) - r.width / 2, parseFloat(el.style.top) - r.height / 2];
    out.btn = $('btnFieldGps').textContent; out.follow = $('btnFieldGps').classList.contains('gps-follow');
    out.acc = parseFloat(el.querySelector('.gm-acc').style.width);
    out.head = el.querySelector('.gm-head').style.display !== 'none';
    // Ny position medan den följer: kartan följer med.
    __gs({ coords: { latitude: 67.0002, longitude: 20.2504, accuracy: 6, heading: null, speed: 0 } });
    out.center2 = [parseFloat(el.style.left) - r.width / 2, parseFloat(el.style.top) - r.height / 2];
    // Panorera själv: slutar följa, pricken följer med kartan.
    const x0 = parseFloat(el.style.left); view.tx += 100; applyView();
    out.panned = parseFloat(el.style.left) - x0; out.followAfterPan = $('btnFieldGps').classList.contains('gps-follow');
    $('btnFieldGps').click(); // centrera igen
    out.recentered = Math.abs(parseFloat(el.style.left) - r.width / 2) < 1 && $('btnFieldGps').classList.contains('gps-follow');
    $('btnFieldGps').click(); // stäng av
    out.stopped = window.__cleared === 7 && el.classList.contains('hidden') && $('btnFieldGps').textContent === '📍';
    // Långt bort från planen: stängs av med besked.
    $('btnFieldGps').click();
    __gs({ coords: { latitude: 59.33, longitude: 18.06, accuracy: 5 } });
    out.far = gpsLive === null && /inte i närheten av planen \(ca 8\d0 km bort\)/.test($('gpsToast').textContent) && $('gpsToast').classList.contains('show') && getComputedStyle($('gpsToast')).display !== 'none'; out.toast = $('gpsToast').textContent;
    return out;
  });
  if (!gl.shown || Math.abs(gl.center[0]) > 1 || Math.abs(gl.center[1]) > 1) fail('Pricken ska visas mitt på skärmen (följer): ' + JSON.stringify(gl));
  if (gl.btn !== '📍 ±8 m' || !gl.follow || !(gl.acc > 20) || !gl.head) fail('Knappen visar noggrannheten, cirkel och riktning: ' + JSON.stringify(gl));
  if (Math.abs(gl.center2[0]) > 1 || Math.abs(gl.center2[1]) > 1) fail('Kartan ska följa ny position: ' + JSON.stringify(gl));
  if (Math.abs(gl.panned - 100) > 1 || gl.followAfterPan) fail('Panorering: pricken följer kartan och slutar följa positionen: ' + JSON.stringify(gl));
  if (!gl.recentered || !gl.stopped || !gl.far) fail('📍 centrerar igen, stänger av, och långt bort stängs av: ' + JSON.stringify(gl));
  console.log('OK: 📍 min position i realtid – prick, noggrannhet, riktning, följ/centrera/stäng av');

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

  // iPhone: kompakt fältläge – en rad överst, resten i ⋯, paneler över hela bredden.
  const ph = await browser.newContext({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true });
  const P = await setup(ph);
  const ip = P.page;
  if (!(await ip.evaluate(() => document.body.classList.contains('field') && document.body.classList.contains('phone')))) fail('iPhone: fältläge i telefonformat');
  const top = await ip.$$eval('#fieldTop > *', els => els.filter(e => getComputedStyle(e).display !== 'none').map(e => e.id || e.className));
  if (JSON.stringify(top) !== JSON.stringify(['fieldPlan', 'btnFieldGps', 'btnFieldDay', 'btnFieldLayers', 'btnFieldMore'])) fail('iPhone: bara plan, 📍, 👷, 🗂 och ⋯ överst: ' + JSON.stringify(top));
  const tb = await ip.locator('#fieldTop').boundingBox();
  if (tb.height > 60) fail('iPhone: toppraden ska vara en rad, höjd ' + tb.height);
  for (const id of ['#btnFieldPrevW', '#btnFieldToday', '#fieldDateLabel']) { const bb = await ip.locator(id).boundingBox(); if (bb.x < 0 || bb.x + bb.width > 390) fail('iPhone: ' + id + ' utanför skärmen'); }
  if (await ip.isVisible('#btnZoomIn')) fail('iPhone: +/− döljs (nyp för att zooma)');
  await ip.click('#btnFieldMore');
  for (const id of ['#btnFieldNote', '#btnFieldSketch', '#btnFieldPhoto', '#btnFieldUndo', '#btnFieldHide', '#btnFieldFull']) if (!(await ip.isVisible(id))) fail('iPhone: ' + id + ' ska finnas i ⋯');
  const noteY = (await ip.locator('#btnFieldNote').boundingBox()).y, moreY = (await ip.locator('#btnFieldMore').boundingBox()).y;
  if (noteY <= moreY + 10) fail('iPhone: ⋯-menyns knappar ska ligga under första raden');
  await ip.click('#btnFieldHide'); await ip.waitForTimeout(100);
  if (await ip.evaluate(() => document.body.classList.contains('field-more'))) fail('iPhone: ett val stänger ⋯-menyn');
  await ip.click('#btnFieldShow'); await ip.waitForTimeout(100);
  await ip.click('#btnFieldDay'); await ip.waitForTimeout(200);
  const day = await ip.locator('#fieldDay').boundingBox();
  if (day.x > 1 || day.width < 388) fail('iPhone: dagsplaneringen ska täcka hela bredden: ' + JSON.stringify(day));
  // iPad påverkas inte.
  if (await page.evaluate(() => document.body.classList.contains('phone'))) fail('iPad ska inte få telefonformatet');
  if (P.errors.length) fail('Sidfel (iPhone): ' + P.errors.join(' | '));
  console.log('OK: iPhone – kompakt toppfält med ⋯-meny, mindre datumrad, paneler över hela bredden');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
  console.log('OK: pekstöd och fältläge i Lägesplan');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
