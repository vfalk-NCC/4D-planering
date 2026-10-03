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
  // iPad: samma Apple Kartor-design som iPhone, med kortet flytande till vänster.
  const pl = await page.evaluate(() => ({ phone: document.body.classList.contains('phone'), wide: document.body.classList.contains('ap-wide'), sheet: $('apSheet').getBoundingClientRect().toJSON(), plan: !!$('fieldPlan').closest('#apSheet'), ctl: $('apCtl').getBoundingClientRect().toJSON(), top: getComputedStyle($('fieldTop')).display }));
  if (!pl.phone || !pl.wide || !pl.plan || pl.sheet.x > 20 || Math.abs(pl.sheet.width - 380) > 1 || pl.ctl.right < 1150 || pl.ctl.bottom < 780 || pl.top !== 'none') fail('iPad: Apple Kartor-design med kortet till vänster: ' + JSON.stringify(pl));
  const h = (await page.locator('#apLayers').boundingBox()).height;
  if (h < 44) fail('Knapparna ska vara stora (minst 44 px), fick ' + h);
  console.log('OK: pekskärm (iPad) ger fältläge i Apple Kartor-design, kortet till vänster');

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
  await page.evaluate(() => $('btnFieldSketch').click()); await page.waitForTimeout(100);
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
    out.btnTitle = $('btnFieldGps').title; out.follow = $('btnFieldGps').classList.contains('gps-follow');
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
    out.stopped = window.__cleared === 7 && el.classList.contains('hidden') && !$('btnFieldGps').classList.contains('on');
    // Långt bort från planen: stängs av med besked.
    $('btnFieldGps').click();
    __gs({ coords: { latitude: 59.33, longitude: 18.06, accuracy: 5 } });
    out.far = gpsLive === null && /inte i närheten av planen \(ca 8\d0 km bort\)/.test($('gpsToast').textContent) && $('gpsToast').classList.contains('show') && getComputedStyle($('gpsToast')).display !== 'none'; out.toast = $('gpsToast').textContent;
    return out;
  });
  if (!gl.shown || Math.abs(gl.center[0]) > 1 || Math.abs(gl.center[1]) > 1) fail('Pricken ska visas mitt på skärmen (följer): ' + JSON.stringify(gl));
  if (!/±8 m/.test(gl.btnTitle) || !gl.follow || !(gl.acc > 20) || !gl.head) fail('Knappen visar noggrannheten, cirkel och riktning: ' + JSON.stringify(gl));
  if (Math.abs(gl.center2[0]) > 1 || Math.abs(gl.center2[1]) > 1) fail('Kartan ska följa ny position: ' + JSON.stringify(gl));
  if (Math.abs(gl.panned - 100) > 1 || gl.followAfterPan) fail('Panorering: pricken följer kartan och slutar följa positionen: ' + JSON.stringify(gl));
  if (!gl.recentered || !gl.stopped || !gl.far) fail('📍 centrerar igen, stänger av, och långt bort stängs av: ' + JSON.stringify(gl));
  console.log('OK: 📍 min position i realtid – prick, noggrannhet, riktning, följ/centrera/stäng av');

  // 4) Datum och lager via de stora knapparna.
  await page.evaluate(() => { $('dateInput').value = '2026-10-01'; $('dateInput').dispatchEvent(new Event('change')); apSetDetent(2, false); });
  await page.waitForTimeout(300); await page.tap('#btnFieldNextW'); await page.waitForTimeout(150);
  if ((await page.inputValue('#dateInput')) !== '2026-10-08') fail('v ▶ ska gå en vecka framåt, fick ' + await page.inputValue('#dateInput'));
  if (!(await page.innerText('#fieldDateLabel')).includes('8 okt')) fail('Datumet ska visas stort, fick ' + await page.innerText('#fieldDateLabel'));
  await page.evaluate(() => apSetDetent(0, false));
  await page.tap('#apLayers'); await page.waitForTimeout(600);
  const zon = page.locator('#fieldSheetBody .fs-tog', { hasText: 'Zoner' });
  if (!(await zon.isVisible())) fail('Lagerpanelen ska visa Zoner');
  const before = await page.evaluate(() => ls('zones').visible);
  await zon.tap(); await page.waitForTimeout(150);
  if ((await page.evaluate(() => ls('zones').visible)) === before) fail('Zoner ska växla');
  if ((await page.locator('#layerList .layer-row[data-layer="zones"] .lr-vis').isChecked()) === before) fail('Den vanliga lagerlistan ska följa med');
  await page.tap('#btnFieldSheetClose');
  console.log('OK: datum och lager i fältläget styr samma sak som den vanliga vyn');

  // 4b) Dölj alla knappar – bara 👁 kvar, som tar tillbaka dem.
  await page.evaluate(() => $('btnFieldHide').click()); await page.waitForTimeout(100);
  for (const id of ['#apSheet', '#apCtl', '#apDateChip']) if (await page.isVisible(id)) fail(id + ' ska döljas');
  if (!(await page.isVisible('#btnFieldShow'))) fail('👁 ska synas när knapparna är dolda');
  await page.tap('#btnFieldShow'); await page.waitForTimeout(100);
  if (!(await page.isVisible('#apSheet')) || !(await page.isVisible('#apCtl')) || await page.isVisible('#btnFieldShow')) fail('👁 ska ta tillbaka knapparna');
  console.log('OK: Dölj gömmer alla knappar, 👁 tar tillbaka dem');

  // 5) Fullständig vy, och valet kommer ihåg.
  await page.evaluate(() => $('btnFieldFull').click()); await page.waitForTimeout(150);
  if (!(await page.isVisible('aside')) || await page.isVisible('#apSheet')) fail('Fullständig ska visa den vanliga vyn');
  await page.reload(); await page.waitForTimeout(1200);
  if (await page.evaluate(() => document.body.classList.contains('field'))) fail('Valet (fullständig) ska kommas ihåg');
  await page.click('#btnFieldMode'); await page.waitForTimeout(150);
  if (!(await page.isVisible('#apSheet'))) fail('📱 ska slå på fältläget igen');
  console.log('OK: växla mellan fältläge och fullständig vy, valet kommer ihåg');

  // iPhone: som Apple Kartor (iOS 26) – flytande glaskort med tre lägen.
  const ph = await browser.newContext({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true });
  const P = await setup(ph);
  const ip = P.page;
  if (!(await ip.evaluate(() => document.body.classList.contains('field') && document.body.classList.contains('phone')))) fail('iPhone: fältläge i telefonformat');
  const lay = await ip.evaluate(() => ({
    plan: !!$('fieldPlan').closest('#apSheet .ap-search'),
    date: ['btnFieldPrevW', 'fieldDateLabel', 'btnFieldNextW', 'btnFieldToday'].every(id => $(id).closest('#apSheet .ap-date')),
    slider: !!$('fieldSlider').closest('#apSheet .ap-datecard'),
    tiles: [...document.querySelectorAll('#apSheet .ap-tools .ap-tile')].map(e => [e.getAttribute('aria-label'), getComputedStyle(e.querySelector('.ap-lb')).display === 'none' && getComputedStyle(e.querySelector('.ap-sub')).display === 'none', !!e.querySelector('.ap-ic svg')]),
    ctl: [...$('apCtl').children].map(e => e.id),
    fit: $('btnFit').parentNode.id,
    arrows: ['btnFieldPrevW', 'btnFieldNextW'].map(id => $(id).querySelector('.ap-ic svg').getBoundingClientRect().width),
    hidden: ['fieldTop', 'zoomCtl', 'fieldBottom'].every(id => getComputedStyle($(id)).display === 'none'),
    font: getComputedStyle(document.body).fontFamily,
    meta: !!document.querySelector('meta[name="apple-mobile-web-app-capable"]') && /viewport-fit=cover/.test(document.querySelector('meta[name=viewport]').content),
    chip: $('apDateChip').textContent.trim(),
    label: $('fieldDateLabel').textContent.trim(),
  }));
  if (!lay.plan || !lay.date || !lay.slider || !lay.hidden) fail('iPhone: planen som sökfält, datum och reglage i kortet, gamla rader dolda: ' + JSON.stringify(lay));
  if (JSON.stringify(lay.tiles.map(t => t[0])) !== JSON.stringify(['Dag', 'Lager', 'Notering', 'Foto', 'Rita', 'Spara vy', 'Dölj']) || !lay.tiles.every(t => t[1] && t[2])) fail('iPhone: verktygen som runda ikoner utan text (namnet för skärmläsare): ' + JSON.stringify(lay.tiles));
  if (JSON.stringify(lay.ctl) !== JSON.stringify(['apLayers', 'btnFieldGps']) || lay.fit !== 'apFitWrap') fail('iPhone: lager och min position i kapseln till höger, anpassa till vänster: ' + JSON.stringify(lay));
  if (!lay.arrows.every(w => w >= 16)) fail('iPhone: pilarna vid datumet ska synas: ' + JSON.stringify(lay.arrows));
  const off = await ip.evaluate(() => [...document.querySelectorAll('#apCtl > button, #apLeft button, #apAvatar, .ap-date #btnFieldPrevW, .ap-date #btnFieldNextW')].filter(b => b.getBoundingClientRect().width && b.querySelector('svg')).map(b => { const r = b.getBoundingClientRect(), q = b.querySelector('svg').getBoundingClientRect(); return [b.id, Math.abs(q.x + q.width / 2 - r.x - r.width / 2) + Math.abs(q.y + q.height / 2 - r.y - r.height / 2)]; }));
  if (off.length < 5 || off.some(o => o[1] > 0.6)) fail('iPhone: ikonerna ska vara centrerade i knapparna: ' + JSON.stringify(off));
  if (!/-apple-system/.test(lay.font) || !lay.meta) fail('iPhone: iOS-typsnitt, helskärm från hemskärmen: ' + JSON.stringify(lay));
  if (!lay.chip || /\d{4}/.test(lay.chip) || !lay.label.startsWith(lay.chip.slice(0, 3))) fail('iPhone: datumbrickan uppe till vänster visar dagen: ' + JSON.stringify([lay.chip, lay.label]));
  // Samma glas på alla flytande knappar (även kompassen).
  const glass = await ip.evaluate(() => { $('northBadge').classList.remove('hidden'); const r = ['apDateChip', 'apCtl', 'apFitWrap', 'apSheet', 'northBadge'].map(id => { const c = getComputedStyle($(id)); return [id, c.backgroundColor, c.backdropFilter || c.webkitBackdropFilter]; }); $('northBadge').classList.add('hidden'); return r; });
  if (new Set(glass.map(g => g[1] + g[2])).size !== 1) fail('iPhone: alla knappar med samma glas: ' + JSON.stringify(glass));
  // Anpassa centrerar planen mellan datumbrickan och kortet.
  const fi = await ip.evaluate(() => { const vp = $('viewport').getBoundingClientRect(), f = fitInsets(vp); return { top: vp.top + f.top, bot: vp.bottom - f.bottom, chip: $('apDateChip').getBoundingClientRect().bottom, sheet: $('apSheet').getBoundingClientRect().top }; });
  if (Math.abs(fi.top - fi.chip - 8) > 1 || Math.abs(fi.sheet - fi.bot - 8) > 1) fail('iPhone: anpassa ska använda ytan mellan brickan och kortet: ' + JSON.stringify(fi));
  // Ihopfällt: bara sökfältet, reglaget syns inte.
  const sh = await ip.locator('#apSheet').boundingBox();
  if (Math.abs(sh.height - 60) > 2 || sh.x < 4 || sh.y + sh.height > 664) fail('iPhone: kortet ihopfällt, flytande nertill: ' + JSON.stringify(sh));
  const frame = await ip.evaluate(() => { const s = $('apSheet').getBoundingClientRect(), p = document.querySelector('.ap-search').getBoundingClientRect(), a = $('apAvatar').getBoundingClientRect(); return [p.top - s.top, s.bottom - p.bottom, p.left - s.left, s.right - a.right, a.top - s.top].map(Math.round); });
  if (new Set(frame).size !== 1) fail('iPhone: lika tjock ram runt sökfältet: ' + JSON.stringify(frame));
  const hid = await ip.evaluate(() => ({ op: getComputedStyle(document.querySelector('#apSheet .ap-body')).opacity, ev: getComputedStyle(document.querySelector('#apSheet .ap-body')).pointerEvents }));
  if (hid.op !== '0') fail('iPhone: reglaget ska inte synas när kortet är ihopfällt: ' + JSON.stringify(hid));
  // Kapseln ligger ovanför kortet.
  const ctlB = await ip.locator('#apCtl').boundingBox();
  if (ctlB.y + ctlB.height > sh.y - 4 || ctlB.x + ctlB.width < 370) fail('iPhone: kontrollerna ovanför kortet till höger: ' + JSON.stringify(ctlB));
  // Dra upp kortet i handtaget: mellanläget visar datum och verktyg.
  const gy = sh.y + 10;
  await ip.mouse.move(195, gy); await ip.mouse.down(); await ip.mouse.move(195, gy - 260, { steps: 8 }); await ip.waitForTimeout(150); await ip.mouse.up(); await ip.waitForTimeout(650);
  const mid = await ip.evaluate(() => ({ d1: document.body.classList.contains('ap-d1'), h: $('apSheet').getBoundingClientRect().height, op: getComputedStyle(document.querySelector('#apSheet .ap-body')).opacity, toolsBottom: document.querySelector('#apSheet .ap-tools').getBoundingClientRect().bottom, sheetBottom: $('apSheet').getBoundingClientRect().bottom }));
  if (!mid.d1 || mid.op !== '1' || mid.toolsBottom > mid.sheetBottom) fail('iPhone: dra upp till mellanläget med hela verktygsraden: ' + JSON.stringify(mid));
  // Uppåt igen: stort läge, kontrollerna och brickan göms.
  const sh2 = await ip.locator('#apSheet').boundingBox();
  await ip.mouse.move(195, sh2.y + 10); await ip.mouse.down(); await ip.mouse.move(195, sh2.y - 250, { steps: 8 }); await ip.waitForTimeout(150); await ip.mouse.up(); await ip.waitForTimeout(650);
  const big = await ip.evaluate(() => ({ d2: document.body.classList.contains('ap-d2'), h: $('apSheet').getBoundingClientRect().height, ctl: getComputedStyle(document.querySelector('.ap-float')).opacity, chip: getComputedStyle($('apDateChip')).opacity }));
  if (!big.d2 || big.h < 560 || big.ctl !== '0' || big.chip !== '0') fail('iPhone: stort läge: ' + JSON.stringify(big));
  // Ett tryck i handtaget fäller ihop.
  await ip.mouse.click(195, (await ip.locator('#apSheet').boundingBox()).y + 10); await ip.waitForTimeout(650);
  if (!(await ip.evaluate(() => document.body.classList.contains('ap-d0')))) fail('iPhone: tryck i handtaget fäller ihop kortet');
  // Datumbrickan öppnar kortet; ett verktyg fäller ihop det igen.
  await ip.click('#apDateChip'); await ip.waitForTimeout(650);
  if (!(await ip.evaluate(() => document.body.classList.contains('ap-d1')))) fail('iPhone: datumbrickan öppnar kortet');
  await ip.click('#btnFieldDay'); await ip.waitForTimeout(500);
  if (!(await ip.evaluate(() => document.body.classList.contains('ap-d0')))) fail('iPhone: ett verktyg fäller ihop kortet');
  const day = await ip.locator('#fieldDay').boundingBox();
  if (day.x < 4 || day.width < 360 || day.y < 40) fail('iPhone: dagsplaneringen som flytande kort: ' + JSON.stringify(day));
  if ((await ip.evaluate(() => getComputedStyle($('apSheet')).opacity)) !== '0') fail('iPhone: öppet kort ersätter sökkortet');
  // Dag som ett kort i Apple Kartor: datum som rubrik, siffror i en rad, runda knappar, åtgärdsrutor.
  const dq = await ip.evaluate(() => { const b = $('fieldDayBody'); return { title: (b.querySelector('.dq-title b') || {}).textContent, stats: b.querySelectorAll('.dq-stats .dq-stat').length, veh: b.querySelectorAll('.dq-row [data-place-veh]').length, acts: [...b.querySelectorAll('.dq-acts .dq-act')].map(x => x.textContent.trim()), hint: !!b.querySelector('.hint'), look: getComputedStyle(b.querySelector('.dq-look')).display }; });
  if (!dq.title || dq.stats !== 5 || dq.veh !== 8 || dq.acts.length !== 5 || dq.hint || dq.look !== 'none') fail('iPhone: Dag som kompakt kort: ' + JSON.stringify(dq));
  await ip.click('#fieldDayBody [data-looktog]'); await ip.waitForTimeout(100);
  if ((await ip.evaluate(() => getComputedStyle(document.querySelector('#fieldDayBody .dq-look')).display)) === 'none') fail('iPhone: Utseende öppnar inställningarna för lagen');
  await ip.click('#fieldDayBody [data-looktog]');
  const d0 = await ip.evaluate(() => $('dateInput').value);
  await ip.click('#fieldDayBody .dq-nav [data-dnav="1"]'); await ip.waitForTimeout(150);
  if ((await ip.evaluate(() => $('dateInput').value)) === d0) fail('iPhone: › i Dag byter dag');
  await ip.click('#fieldDayBody .dq-nav [data-dnav="0"]'); await ip.waitForTimeout(150);
  await ip.click('#fieldDay .fs-head button'); await ip.waitForTimeout(400);
  if ((await ip.evaluate(() => getComputedStyle($('apSheet')).opacity)) !== '1') fail('iPhone: sökkortet tillbaka när kortet stängs');
  await ip.click('#apLayers'); await ip.waitForTimeout(200);
  if (!(await ip.isVisible('#fieldSheet'))) fail('iPhone: lagerknappen i kapseln öppnar lagren');
  await ip.waitForTimeout(500);
  // Lagren som ett lågt kort nertill (ritningen syns ovanför), kompakta rader med strömbrytare.
  const lg = await ip.evaluate(() => { const r = $('fieldSheet').getBoundingClientRect(), rows = [...document.querySelectorAll('#fieldSheetBody .fs-grid .fs-tog')]; return { top: r.top, h: r.height, vh: innerHeight, n: rows.length, rowH: Math.max(...rows.map(x => x.getBoundingClientRect().height)), sw: rows.every(x => getComputedStyle(x.querySelector('.fs-dot')).order === '3' && x.getAttribute('role') === 'switch') }; });
  if (lg.h > lg.vh * 0.5 || lg.top < lg.vh * 0.45 || !lg.n || lg.rowH > 44 || !lg.sw) fail('iPhone: lagerkortet lågt med kompakta rader: ' + JSON.stringify(lg));
  // Lagerträdet: sparade vyer som rullgardin med ＋, mappar/DXF/zoner fälls ut och tänds/släcks var för sig.
  await ip.evaluate(() => {
    const ll = $('layerList'), keep = ll.innerHTML; window.__llKeep = keep; window.__clicks = [];
    ll.innerHTML = `<div class="layer-row folder-row" data-folder="f1"><input type="checkbox" class="fr-vis" checked data-mixed="1"><span class="ln"><button class="fr-toggle">▾</button><span class="fr-name">📁 Underlag</span> <small>2</small></span></div>
      <div class="layer-row in-folder" data-layer="cad:a"><input type="checkbox" class="lr-vis" checked><span class="ln"><button class="cad-toggle">▸</button><span class="cad-name">📐 A-001</span> <small>2 lager</small></span></div>
      <div class="layer-row sub cad-sub in-folder hidden" data-layer="cadl:a:VÄGG"><input type="checkbox" class="lr-vis" checked><span class="ln">VÄGG <small>120</small></span></div>
      <div class="layer-row sub cad-sub in-folder hidden" data-layer="cadl:a:TEXT"><input type="checkbox" class="lr-vis"><span class="ln">TEXT <small>40</small></span></div>
      <div class="layer-row in-folder" data-layer="cad:b"><input type="checkbox" class="lr-vis"><span class="ln"><span class="cad-name">📐 K-002</span></span></div>
      <div class="layer-row in-folder" data-layer="cad:c"><input type="checkbox" class="lr-vis"><span class="ln"><span class="cad-name">📐 NSV_A-40-1-0012_PLANRITNING_PLAN_1_ETAPP_2_REVIDERAD_2026-09-29_slutlig</span> <small>48 lager</small><span class="cad-date">2026-09-29</span></span></div>
      <div class="layer-row" data-layer="zones"><input type="checkbox" class="lr-vis" checked><span class="ln">🟧 Zoner <small>1</small></span></div>
      <div class="layer-row sub zone-layer-row hidden" data-zone="z1"><input type="checkbox" class="zl-vis" checked><span class="ln">K10 Grundsula</span></div>`;
    ll.querySelectorAll('input').forEach(i => i.addEventListener('click', () => __clicks.push(i.closest('.layer-row').dataset.layer || i.closest('.layer-row').dataset.zone || i.closest('.layer-row').dataset.folder)));
    renderFieldSheet();
  });
  const fp0 = await ip.evaluate(() => ({ sel: !!document.querySelector('#fieldSheetBody .fp-views select.fp-vsel'), add: !!document.querySelector('#fieldSheetBody .fp-add'), top: [...document.querySelectorAll('#fieldSheetBody .fp-row.d0 .fs-lbl')].map(x => x.textContent), bg: getComputedStyle($('fieldSheet')).backdropFilter }));
  if (!fp0.sel || !fp0.add || JSON.stringify(fp0.top) !== '["📁 Underlag","🟧 Zoner","🏷 Objektnamn"]' || !/blur/.test(fp0.bg)) fail('iPhone: lagerträdet med vyrullgardin, ＋ och glas: ' + JSON.stringify(fp0));
  await ip.click('[data-fpopen="f:f1"]'); await ip.click('[data-fpopen="cad:a"]'); await ip.click('[data-fpopen="zones"]');
  const fp1 = await ip.evaluate(() => [...document.querySelectorAll('#fieldSheetBody .fp-row')].map(r => r.className.replace('fp-row ', '') + ':' + r.querySelector('.fs-lbl').textContent));
  if (JSON.stringify(fp1) !== JSON.stringify(['d0:📁 Underlag', 'd1:📐 A-001', 'd2:VÄGG', 'd2:TEXT', 'd1:📐 K-002', 'd1:📐 NSV_A-40-1-0012_PLANRITNING_PLAN_1_ETAPP_2_REVIDERAD_2026-09-29_slutlig', 'd0:🟧 Zoner', 'd1:K10 Grundsula', 'd0:🏷 Objektnamn'])) fail('iPhone: utfällt träd: ' + JSON.stringify(fp1));
  // Långt DXF-namn: strömbrytaren ryms i kortet.
  const longRow = await ip.evaluate(() => { const b = [...document.querySelectorAll('#fieldSheetBody .fs-tog')].find(x => /REVIDERAD/.test(x.textContent)), d = b.querySelector('.fs-dot').getBoundingClientRect(), s = $('fieldSheet').getBoundingClientRect(); return { dotRight: d.right, sheetRight: s.right, dotW: d.width, h: b.getBoundingClientRect().height }; });
  if (longRow.dotRight > longRow.sheetRight - 8 || longRow.dotW < 38 || longRow.h > 60) fail('iPhone: långt DXF-namn får inte trycka ut strömbrytaren: ' + JSON.stringify(longRow));
  for (const t of ['📐 K-002', 'TEXT', 'K10 Grundsula', '📁 Underlag']) await ip.locator('#fieldSheetBody .fs-tog', { hasText: t }).click();
  const clicks = await ip.evaluate(() => { const c = __clicks; $('layerList').innerHTML = __llKeep; renderFieldSheet(); return c; });
  if (JSON.stringify(clicks) !== JSON.stringify(['cad:b', 'cadl:a:TEXT', 'z1', 'f1'])) fail('iPhone: varje DXF, DXF-lager, zon och mapp tänds/släcks för sig: ' + JSON.stringify(clicks));
  const lh = await ip.locator('#fieldSheet .fs-head').boundingBox();
  await ip.mouse.move(120, lh.y + 10); await ip.mouse.down(); await ip.mouse.move(120, lh.y - 120, { steps: 5 }); await ip.mouse.up(); await ip.waitForTimeout(550);
  if ((await ip.evaluate(() => $('fieldSheet').getBoundingClientRect().height)) < lg.vh * 0.7) fail('iPhone: lagerkortet ska kunna dras upp');
  await ip.click('#fieldSheet .fs-head button');
  if (await ip.evaluate(() => $('fieldSheet').classList.contains('fs-tall'))) fail('iPhone: stängt lagerkort öppnas lågt nästa gång');
  // Ny notering som ett iOS-ark: Avbryt – rubrik – Spara överst, inställningarna i en kompakt lista.
  await ip.evaluate(() => { viewport = { transform: [1, 0, 0, 1, 0, 0], width: 1000, height: 800, convertToPdfPoint: (x, y) => [x, y], convertToViewportPoint: (x, y) => [x, y] }; plan = { id: 'pl', name: 'P', zones: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } }; openSitePop({ id: 'nt1', type: 'note', pts: [[0, 0], [5, 5]], text: '' }, true); });
  await ip.waitForTimeout(650); // arket glider in
  const np = await ip.evaluate(() => { const p = $('sitePop'), r = p.getBoundingClientRect(), sv = p.querySelector('.sp-nav .sp-save').getBoundingClientRect(); return { nav: [...p.querySelectorAll('.sp-nav button')].map(b => b.textContent), rows: p.querySelectorAll('.sp-grp .sp-r').length, h: r.height, saveTop: sv.top, help: /Tomt = alltid/.test(p.textContent) }; });
  if (JSON.stringify(np.nav) !== '["Avbryt","Spara"]' || np.rows !== 5 || np.h > 420 || np.saveTop > 140 || np.help) fail('iPhone: noteringen som kompakt iOS-ark: ' + JSON.stringify(np));
  await ip.fill('#sitePop .sp-text', 'Testnotering'); await ip.click('#sitePop .sp-nav .sp-save'); await ip.waitForTimeout(200);
  if (!(await ip.evaluate(() => siteItems.some(x => x.type === 'note' && x.text === 'Testnotering')))) fail('iPhone: Spara i arkets överkant sparar noteringen');
  // Rita: en kompakt glaskapsel på en rad – färgprickar, tjocklek, spara vy och Klar, ingen lång text.
  await ip.evaluate(() => startSiteTool('sketch')); await ip.waitForTimeout(150);
  const skb = await ip.evaluate(() => { const b = $('fieldTools'), r = b.getBoundingClientRect(); return { h: r.height, w: r.width, txt: b.textContent.replace(/\s+/g, ' ').trim(), colors: b.querySelectorAll('.ft-color').length, ico: b.querySelectorAll('.ft-ico svg').length }; });
  if (skb.h > 50 || skb.w > 380 || skb.txt !== 'Klar' || skb.colors < 3 || skb.ico !== 2) fail('iPhone: ritmenyn som kompakt kapsel: ' + JSON.stringify(skb));
  await ip.click('#fieldTools .ft-w'); await ip.click('#btnFieldToolDone'); await ip.waitForTimeout(100);
  // Liggande: kortet till vänster, kontrollerna kvar nere till höger.
  await ip.setViewportSize({ width: 844, height: 390 }); await ip.waitForTimeout(600);
  const ls = await ip.evaluate(() => ({ phone: document.body.classList.contains('phone'), sheet: $('apSheet').getBoundingClientRect().toJSON(), ctl: $('apCtl').getBoundingClientRect().toJSON() }));
  if (!ls.phone || ls.sheet.width > 400 || ls.ctl.x < 700 || ls.ctl.bottom < 360) fail('iPhone liggande: ' + JSON.stringify(ls));
  // Större pekskärm (iPad-storlek): samma design, kortet flyttar till vänster.
  await ip.setViewportSize({ width: 1024, height: 768 }); await ip.waitForTimeout(400);
  const wide = await ip.evaluate(() => ({ phone: document.body.classList.contains('phone'), wide: document.body.classList.contains('ap-wide'), sheet: $('apSheet').getBoundingClientRect().toJSON(), day: $('btnFieldDay').closest('#apSheet') !== null }));
  if (!wide.phone || !wide.wide || wide.sheet.width > 390 || wide.sheet.x > 20 || !wide.day) fail('Större pekskärm: Apple Kartor-design med kortet till vänster: ' + JSON.stringify(wide));
  // Infon om ett objekt: glaskort upptill, inte den svarta rutan.
  const tp = await ip.evaluate(() => { const t = $('tip'); t.textContent = 'I32\n742 - SIKTHALL'; t.classList.remove('hidden'); t.style.display = 'block'; const c = getComputedStyle(t), r = t.getBoundingClientRect(); const out = { top: r.top, bg: c.backgroundColor, bf: c.backdropFilter }; t.style.display = ''; t.classList.add('hidden'); return out; });
  if (tp.top > 120 || !/blur/.test(tp.bf) || /rgba\(28, 28, 30, 0\.88\)/.test(tp.bg)) fail('Objektinfon ska vara ett glaskort upptill: ' + JSON.stringify(tp));
  if (P.errors.length) fail('Sidfel (iPhone): ' + P.errors.join(' | '));
  console.log('OK: iPhone – som Apple Kartor: glaskort med tre lägen, reglaget dolt ihopfällt, kapsel, datumbricka, liggande; tillbaka på stor skärm');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
  console.log('OK: pekstöd och fältläge i Lägesplan');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
