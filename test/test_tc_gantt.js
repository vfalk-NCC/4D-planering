// 3D-vyns flik 4D-planering (Victor 2026-10-12): Powerproject-tidplanen som tavla (lappar per vecka) och staplar
// i en panel nederst, tryck på en lapp markerar i 3D, tryck på en vecka flyttar datumet, kameravyer på datum
// och en inspelad film (videofil) där datumet räknas fram och kameran glider mellan vyerna.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9068, PORT2 = 9069, DASH = '/home/user/4d-dashboard/docs';
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => { c.fillStyle = '#fff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} }; } };
  } }) }) };`;
const PP = [
  { id: 'p1', group_id: 'G1', object_id: '1hZq3$Bq9Fxu8nZK0bW1aA', object_name: 'K10', activity: 'Gjutning pelare', area: 'Hus A', contractor: 'NCC', start_date: '2026-10-05', end_date: '2026-10-16', progress: 40 },
  { id: 'p3', object_id: '3hZq3$Bq9Fxu8nZK0bW1aA', object_name: 'Tak', activity: 'Takmontage', area: 'Hus B', contractor: 'Peab', start_date: '2026-11-02', end_date: '2026-11-20', progress: 0 },
];
let SHA = 1;
const serve = (root, port) => http.createServer((q, r) => fs.readFile(path.join(root, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : q.url.includes('.css') ? 'text/css' : 'text/html' }); r.end(d); } })).listen(port);
(async () => {
  const s1 = serve(DOCS, PORT), s2 = serve(DASH, PORT2);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  try {
    const page = await (await browser.newContext({ viewport: { width: 1500, height: 950 } })).newPage();
    await require('./_dialogs').bridge(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(p2 => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4ddash-unlocked', '1'); localStorage.setItem('lagesplan-3d-prefs', JSON.stringify({ plan: { dock: true }, tcGanttUrl: `http://localhost:${p2}/index.html` })); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); }, PORT2);
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
    await page.route(/components\.connect\.trimble\.com/, r => r.fulfill({ contentType: 'application/javascript', body: '' }));
    await page.route('https://api.github.com/**', r => {
      const f = decodeURIComponent(new URL(r.request().url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
      if (r.request().method() !== 'GET') { if (f === 'projects/p1/pp/plan_items.json') { try { const nw = JSON.parse(Buffer.from(JSON.parse(r.request().postData()).content, 'base64').toString()); PP.splice(0, PP.length, ...nw); } catch (e) { /* ignoreras */ } } SHA++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + SHA } }) }); }
      const data = { 'projects/p1/pp/plan_items.json': PP, 'projects/p1/pp/plan_item_activities.json': [] }[f];
      r.fulfill(data ? { status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(JSON.stringify(data)).toString('base64'), sha: 's' + SHA }) } : { status: 404, body: '{}' });
    });
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
    await page.evaluate(async () => { plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }]; pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A'); });
    await page.click('#btn3d');
    await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
    await page.evaluate(() => l3plDockToggle(true));
    await page.waitForFunction(() => l3tg.loaded, null, { timeout: 40000 }).catch(() => {});
    const A = await page.evaluate(() => ({ loaded: l3tg.loaded, failed: l3tg.failed, frame: !!document.querySelector('#v3PlanDock iframe'), strip: !!document.querySelector('#v3PlanDock .v3-tg-strip'), modes: !!document.querySelector('#v3GmSeg') }));
    console.log(JSON.stringify(A));
    if (!A.loaded || !A.frame || !A.strip || !A.modes) fail('Gantten från dashboarden laddades inte: ' + JSON.stringify(A));
    const fr = page.frames().find(f => f.url().includes(`localhost:${PORT2}`)); if (!fr) fail('ingen dashboard-iframe');
    await fr.waitForFunction(() => typeof items !== 'undefined' && items.length >= 2, null, { timeout: 20000 });
    const B = await fr.evaluate(() => ({ n: items.length, embed: document.documentElement.classList.contains('embed-gantt'), panel: !!document.querySelector('[data-panel-id="gantt"]') && document.querySelector('[data-panel-id="gantt"]').offsetHeight > 100, header: getComputedStyle(document.querySelector('header')).display, text: document.querySelector('[data-panel-id="gantt"]').innerText.slice(0, 300) }));
    console.log(JSON.stringify(B));
    if (!B.embed || !B.panel || B.header !== 'none') fail('embed-läget ritas fel: ' + JSON.stringify(B));
    await page.screenshot({ path: '/tmp/claude-0/-home-user-4D-planering/867d5061-8c43-5fe8-9725-74ef03d6c450/scratchpad/tcg.png' }); if (!/K10|Gjutning|Takmontage|Hus A/.test(await fr.evaluate(() => document.body.innerText))) fail('Gantten visar inte tidplanen');
    // Sync A: ändring i dashboard-Gantten -> 3D-editorn läser om
    await fr.evaluate(() => ghWriteJSON(settings.githubToken, 'projects/p1/pp/plan_items.json', a => a.map(r => r.id === 'p1' ? { ...r, progress: 77 } : r), 'test'));
    await page.waitForFunction(() => (l3pl.rows || []).some(r => r.id === 'p1' && r.progress === 77), null, { timeout: 8000 }).catch(() => {});
    const C = await page.evaluate(() => (l3pl.rows.find(r => r.id === 'p1') || {}).progress);
    if (C !== 77) fail('3D-editorn läste inte om efter ändring i Gantten: ' + C);
    // Sync B: ändring i 3D-editorn -> Gantten läser om
    await page.evaluate(() => ghWriteJSON(token, 'projects/p1/pp/plan_items.json', a => a.map(r => r.id === 'p3' ? { ...r, progress: 55 } : r), 'test2'));
    await fr.waitForFunction(() => items.some(x => String(x.id) === 'p3' && Number(x.progress) === 55), null, { timeout: 15000 }).catch(() => {});
    const D = await fr.evaluate(() => (items.find(x => String(x.id) === 'p3') || {}).progress);
    if (Number(D) !== 55) fail('Gantten läste inte om efter ändring i 3D-editorn: ' + D);
    // Sync C: någon annan ändrar (Trimble Connect) -> upptäcks av kontrollen
    PP.find(r => r.id === 'p3').progress = 90; SHA++;
    await page.evaluate(async () => { l3tg.loaded = true; await l3tgPoll(); await l3tgPoll(); });
    await page.waitForFunction(() => (l3pl.rows || []).some(r => r.id === 'p3' && r.progress === 90), null, { timeout: 8000 }).catch(() => {});
    const E = await page.evaluate(() => (l3pl.rows.find(r => r.id === 'p3') || {}).progress);
    if (E !== 90) fail('externa ändringar upptäcktes inte: ' + E);
    await fr.waitForFunction(() => items.some(x => String(x.id) === 'p3' && Number(x.progress) === 90), null, { timeout: 15000 }).catch(() => {});
    const F = await fr.evaluate(() => (items.find(x => String(x.id) === 'p3') || {}).progress);
    if (Number(F) !== 90) fail('Gantten läste inte om efter extern ändring: ' + F);
    // Markera i 3D från Gantten
    await page.evaluate(() => { window.__sel = []; const o = l3bsSet; window.l3bsSet = e => { window.__sel.push(e.length); }; });
    await fr.evaluate(() => selectActivityInModel({ id: 'p1', name: 'Gjutning pelare', members: [{ id: 'p1' }] }));
    await page.waitForTimeout(500);
    console.log('OK: Gantten i 3D-editorn är dashboardens Gantt i en iframe och synkar åt båda hållen (ändring i Gantten, i 3D-editorn och externt)');
    if (errors.length) fail('sidfel: ' + errors.join(' | '));
  } finally { await browser.close(); s1.close(); s2.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
