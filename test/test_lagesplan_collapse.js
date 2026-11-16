// 3D-vyns flik 4D-planering (Victor 2026-10-12): Powerproject-tidplanen som tavla (lappar per vecka) och staplar
// i en panel nederst, tryck på en lapp markerar i 3D, tryck på en vecka flyttar datumet, kameravyer på datum
// och en inspelad film (videofil) där datumet räknas fram och kameran glider mellan vyerna.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9903;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => { c.fillStyle = '#fff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} }; } };
  } }) }) };`;
const PP = [
  { id: 'p1', group_id: 'G1', object_id: '1hZq3$Bq9Fxu8nZK0bW1aA', object_name: 'K10', activity: 'Gjutning pelare', area: 'Hus A', contractor: 'NCC', start_date: '2026-10-05', end_date: '2026-10-16', progress: 40, baseline_start_date: '2026-10-08', baseline_end_date: '2026-10-19' },
  { id: 'p2', group_id: 'G1', object_id: '2hZq3$Bq9Fxu8nZK0bW1aA', object_name: 'K11', activity: 'Gjutning pelare', area: 'Hus A', contractor: 'NCC', start_date: '2026-10-06', end_date: '2026-10-18', progress: 20 },
  { id: 'p3', object_id: '3hZq3$Bq9Fxu8nZK0bW1aA', object_name: 'Tak', activity: 'Takmontage', area: 'Hus B', contractor: 'Peab', start_date: '2026-11-02', end_date: '2026-11-20', progress: 0 },
  { id: 'p4', object_id: '4hZq3$Bq9Fxu8nZK0bW1aA', object_name: 'Fasad', activity: 'Fasadmontage', area: 'Hus A', contractor: 'NCC', start_date: '2026-10-17', end_date: '2026-10-20', progress: 0, depends_on: ['p1'] },
];
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  try {
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    await require('./_dialogs').bridge(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('lagesplan-3d-prefs', JSON.stringify({ plan: true })); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
    await page.route('https://api.github.com/**', r => {
      const f = decodeURIComponent(new URL(r.request().url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
      if (global.__mockWrite && r.request().method() === 'PUT' && f === 'projects/p1/pp/plan_items.json') { try { const nw = JSON.parse(Buffer.from(JSON.parse(r.request().postData()).content, 'base64').toString()); PP.splice(0, PP.length, ...nw); } catch (e) { /* ignoreras */ } }
      if (r.request().method() !== 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'x' } }) });
      const data = { 'projects/p1/pp/plan_items.json': PP, 'projects/p1/plan_items.json': [{ id: 'x1', object_id: 'X1', object_name: 'Bod', activity: 'Etablering bodar', area: 'Etablering', start_date: '2026-10-10', end_date: '2026-10-15' }], 'projects/p1/plan_milestones.json': [{ id: 'm1', name: 'Stomme klar', target_date: '2026-10-14', done: false }] }[f];
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
    await page.evaluate(() => { $('dateInput').value = '2026-10-12'; l3SyncDate(); });   // 3D startar på dagens datum – testet vill ha ett fast datum
    const J = v => JSON.stringify(v);
    // objektbiblioteket: egen knapp
    await page.waitForSelector('#v3LibCol', { timeout: 15000 });
    const open0 = await page.evaluate(() => [...document.querySelectorAll('#v3Lib .v3-lf:not(.v3-lf-all) .v3-pal-g')].filter(b => b.getAttribute('aria-expanded') === 'true').length);
    await page.evaluate(() => { const set = new Set(l3Prefs().palClosed || []); document.querySelectorAll('#v3Lib .v3-lf:not(.v3-lf-all)').forEach(f => set.delete(f.dataset.lfid)); l3SetPref('palClosed', [...set]); l3RenderLib(); });
    const openAll = await page.evaluate(() => [...document.querySelectorAll('#v3Lib .v3-lf:not(.v3-lf-all) .v3-pal-g')].filter(b => b.getAttribute('aria-expanded') === 'true').length);
    await page.click('#v3LibCol'); await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({ open: [...document.querySelectorAll('#v3Lib .v3-lf:not(.v3-lf-all) .v3-pal-g')].filter(b => b.getAttribute('aria-expanded') === 'true').length, total: document.querySelectorAll('#v3Lib .v3-lf:not(.v3-lf-all)').length, label: document.getElementById('v3LibCol').textContent, libOpen: !!document.getElementById('v3LibNew') }));
    if (openAll < 2 || after.open !== 0 || after.total < 2 || !/ut alla/.test(after.label) || !after.libOpen) fail('Fäll ihop alla i objektbiblioteket: ' + J({ open0, openAll, after }));
    await page.click('#v3LibCol'); await page.waitForTimeout(200);
    const back = await page.evaluate(() => [...document.querySelectorAll('#v3Lib .v3-lf:not(.v3-lf-all) .v3-pal-g')].filter(b => b.getAttribute('aria-expanded') === 'true').length); if (back < 2) fail('Fäll ut alla ska öppna mapparna igen: ' + back);
    console.log('OK: objektbiblioteket – Fäll ihop alla (' + openAll + ' mappar → 0) och Fäll ut alla');

    // generisk knapp i menyer med avsnitt + dockning
    await page.evaluate(() => { l3plSet('film', { from: '2026-10-01', to: '2026-10-21', sec: 10, res: '240' }); l3fsToggle(true); });
    await page.waitForSelector('#v3FilmEdit .fe-st'); await page.evaluate(() => lclScan()); await page.waitForSelector('#v3FilmEdit > .cl-all', { timeout: 5000 });
    const g1 = await page.evaluate(() => ({ open: document.querySelectorAll('#v3FilmEdit [aria-expanded="true"]').length, label: document.querySelector('#v3FilmEdit > .cl-all').textContent }));
    await page.click('#v3FilmEdit > .cl-all'); await page.waitForTimeout(500);
    const g2 = await page.evaluate(() => ({ open: document.querySelectorAll('#v3FilmEdit [aria-expanded="true"]').length, label: document.querySelector('#v3FilmEdit > .cl-all').textContent }));
    await page.click('#v3FilmEdit > .cl-all'); await page.waitForTimeout(500);
    const g3 = await page.evaluate(() => ({ open: document.querySelectorAll('#v3FilmEdit [aria-expanded="true"]').length, label: document.querySelector('#v3FilmEdit > .cl-all').textContent }));
    if (g1.open !== 1 || g2.open !== 0 || !/ut alla/.test(g2.label) || g3.open !== 1 || !/ihop alla/.test(g3.label)) fail('Generisk Fäll ihop/ut alla i filmmenyn: ' + J({ g1, g2, g3 }));
    console.log('OK: fäll ihop alla i menyer (filmmenyn: öppet avsnitt stängs och öppnas igen av Fäll ut alla)');
    await page.evaluate(() => { l3xyzToggle(true); }); await page.waitForSelector('#v3Pts');
    await page.evaluate(() => l3dkToggle(true)); await page.waitForTimeout(600);
    const dk = await page.evaluate(() => { const d = document.getElementById('v3Dock'), ids = ['v3FilmEdit', 'v3Pts'].map(i => { const e = document.getElementById(i); return !!e && d.contains(e) && e.classList.contains('v3-docked'); }); const c = document.getElementById('v3Canvas').getBoundingClientRect(), r = d.getBoundingClientRect(); return { ids, dockHidden: d.classList.contains('hidden'), right: r.left >= c.left + c.width * 0.4 }; });
    if (!dk.ids.every(Boolean) || dk.dockHidden || !dk.right) fail('Filmmenyn och Punkter ska kunna dockas till högermenyn: ' + J(dk));
    if (process.env.L3DK) await page.screenshot({ path: process.env.L3DK });
    await page.evaluate(() => l3dkToggle(false)); await page.waitForTimeout(300);
    const un = await page.evaluate(() => !document.getElementById('v3Dock').contains(document.getElementById('v3FilmEdit'))); if (!un) fail('Lösgöra ska ta ut menyerna ur dockan');
    console.log('OK: Filmredigering och Punkter dockas i högermenyn (och lösgörs)');
    if (errors.length) fail('Sidan gav fel: ' + errors.slice(0, 3).join(' | '));
    console.log('OK test_lagesplan_collapse');
  } catch (e) { console.log('FEL: ' + e.message); process.exitCode = 1; }
  await browser.close(); server.close();
})();
