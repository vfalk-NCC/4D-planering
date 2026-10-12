// 3D-vyns flik 4D-planering (Victor 2026-10-12): Powerproject-tidplanen som tavla (lappar per vecka) och staplar
// i en panel nederst, tryck på en lapp markerar i 3D, tryck på en vecka flyttar datumet, kameravyer på datum
// och en inspelad film (videofil) där datumet räknas fram och kameran glider mellan vyerna.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9016;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => { c.fillStyle = '#fff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} }; } };
  } }) }) };`;
const PP = [
  { id: 'p1', group_id: 'G1', object_id: '1hZq3$Bq9Fxu8nZK0bW1aA', object_name: 'K10', activity: 'Gjutning pelare', area: 'Hus A', contractor: 'NCC', start_date: '2026-10-05', end_date: '2026-10-16', progress: 40 },
  { id: 'p2', group_id: 'G1', object_id: '2hZq3$Bq9Fxu8nZK0bW1aA', object_name: 'K11', activity: 'Gjutning pelare', area: 'Hus A', contractor: 'NCC', start_date: '2026-10-06', end_date: '2026-10-18', progress: 20 },
  { id: 'p3', object_id: '3hZq3$Bq9Fxu8nZK0bW1aA', object_name: 'Tak', activity: 'Takmontage', area: 'Hus B', contractor: 'Peab', start_date: '2026-11-02', end_date: '2026-11-20', progress: 0 },
];
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  try {
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    await require('./_dialogs').bridge(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
    await page.route('https://api.github.com/**', r => {
      const f = decodeURIComponent(new URL(r.request().url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
      if (r.request().method() !== 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'x' } }) });
      const data = { 'projects/p1/pp/plan_items.json': PP }[f];
      r.fulfill(data ? { status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(JSON.stringify(data)).toString('base64'), sha: 's' }) } : { status: 404, body: '{}' });
    });
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
    await page.evaluate(async () => {
      plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
      pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = [];
      renderPlanSelect(); await openPlan('A');
      $('dateInput').value = '2026-10-12';
      open3d();
    });
    await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3plRenderTab === 'function', null, { timeout: 15000 });

    // Fliken bredvid 3D-bibliotek.
    const tabs = await page.evaluate(() => [...document.querySelectorAll('[data-paltab]')].map(b => b.dataset.paltab));
    if (tabs[tabs.indexOf('add') + 1] !== 'plan') fail('Fliken 4D-planering ska ligga bredvid 3D-bibliotek: ' + tabs);
    await page.click('[data-paltab="plan"]');
    await page.waitForSelector('#v3PalPlan #v3PlDock', { timeout: 8000 });
    const tab = await page.textContent('#v3PalPlan');
    if (!/2 aktiviteter/.test(tab) || !/K10, K11 – Gjutning pelare/.test(tab)) fail('Fliken: tidplanen och det som pågår: ' + tab.replace(/\s+/g, ' ').slice(0, 300));

    // Tavlan: en lapp per aktivitet, banor per område, dagens vecka markerad.
    await page.click('#v3PlDock');
    await page.waitForSelector('#v3PlanDock .v3-pnote');
    const b = await page.evaluate(() => ({ notes: [...document.querySelectorAll('#v3PlanDock .v3-pnote .t')].map(n => n.textContent), lanes: [...document.querySelectorAll('#v3PlanDock .v3-pl-lane-h')].map(n => n.textContent.replace(/\s+/g, ' ').trim()), cur: (document.querySelector('#v3PlanDock .v3-pl-week.cur b') || {}).textContent }));
    if (JSON.stringify(b.notes) !== JSON.stringify(['K10, K11 – Gjutning pelare', 'Tak – Takmontage']) || b.lanes.join('|') !== 'Hus A 1|Hus B 1' || b.cur !== 'v.42') fail('Tavlan: ' + JSON.stringify(b));
    // Tryck på en lapp: markera i 3D (objekten finns i en låtsad modell).
    await page.evaluate(() => { window.__sel = null; const fake = { id: 'm1', name: 'B.ifc', visible: true }; l3b.models.push(fake); const ents = new Map([['1hZq3$Bq9Fxu8nZK0bW1aA', [{ g: 1 }]], ['2hZq3$Bq9Fxu8nZK0bW1aA', [{ g: 2 }]]]); l3pEnts = m => (m === fake ? ents : new Map()); l3bsSet = list => { window.__sel = list.map(e => e.g); }; l3bsZoom = () => {}; });
    await page.click('#v3PlanDock .v3-pnote');
    if (JSON.stringify(await page.evaluate(() => window.__sel)) !== '[1,2]') fail('Lappen ska markera aktivitetens objekt i 3D');
    await page.evaluate(() => { l3b.models.pop(); });
    // Tryck på en vecka: datumet dit.
    await page.click('#v3PlanDock [data-plweek="2026-11-02"]'); await page.waitForTimeout(200);
    if (await page.evaluate(() => $('dateInput').value) !== '2026-11-02') fail('Veckan ska flytta datumet');
    // Staplar.
    await page.click('#v3PlanDock [data-plview="bars"]');
    if ((await page.$$('#v3PlanDock .v3-pl-bar')).length !== 2) fail('Staplarna');
    await page.evaluate(() => { $('dateInput').value = '2026-10-12'; });

    // Kameravyer och kamerans väg mellan dem.
    const cam = await page.evaluate(() => {
      l3.camera.position.set(10, 0, 50); l3.orbit.target.set(0, 0, 0); l3.camera.updateMatrixWorld();
      l3plKeyAdd(l3plCam(), '2026-10-01', 'A');
      l3.camera.position.set(30, 0, 50); l3.camera.updateMatrixWorld();
      l3plKeyAdd(l3plCam(), '2026-10-21', 'B');
      const k = l3plKeys(), O = l3.O, mid = l3plCamAt(k, l3plDate('2026-10-11').getTime()), pre = l3plCamAt(k, l3plDate('2026-09-01').getTime());
      return { n: k.length, mid: mid.p[0] - O[0], pre: pre.p[0] - O[0], rows: document.querySelectorAll('#v3PalPlan .v3-pl-key').length };
    });
    if (cam.n !== 2 || Math.abs(cam.mid - 20) > 0.01 || Math.abs(cam.pre - 10) > 0.01 || cam.rows !== 2) fail('Kameravyer: ' + JSON.stringify(cam));

    // Filmen: spelas in och sparas som videofil; datumet räknas fram och återställs efteråt.
    const film = await page.evaluate(async () => {
      l3plSet('film', { from: '2026-10-01', to: '2026-10-21', sec: 3, res: '720', title: true, caption: 'Test' });
      let saved = null; const dl = downloadBlob; downloadBlob = (blob, name) => { saved = { size: blob.size, type: blob.type, name }; };
      const days = new Set(); const sd = l3plSetDay; l3plSetDay = d => { days.add(d); return sd(d); };
      const r = await l3plFilm(true);
      downloadBlob = dl; l3plSetDay = sd;
      return { r, saved, days: days.size, date: $('dateInput').value, w: l3.renderer.domElement.width };
    });
    if (!film.saved || film.saved.size < 1000 || !/^video\//.test(film.saved.type) || !/^4D-film 2026-10-01 – 2026-10-21\.(mp4|webm)$/.test(film.saved.name) || film.days < 15 || film.date !== '2026-10-12')
      fail('Filmen: ' + JSON.stringify(film));
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('OK: fliken 4D-planering – Powerproject som tavla och staplar, markera i 3D, vecka → datum, kameravyer, film som videofil');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
