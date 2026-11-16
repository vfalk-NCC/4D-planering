// 3D-vyns flik 4D-planering (Victor 2026-10-12): Powerproject-tidplanen som tavla (lappar per vecka) och staplar
// i en panel nederst, tryck på en lapp markerar i 3D, tryck på en vecka flyttar datumet, kameravyer på datum
// och en inspelad film (videofil) där datumet räknas fram och kameran glider mellan vyerna.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9904;
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
    const R = await page.evaluate(async () => {
      const mk = n => ({ name: n, p: [1, 2, 3], t: [0, 0, 0], at: '2026-11-01' }), store = { remote: [mk('Vy A'), mk('Vy B')], writes: [] };
      ghReadJSON = async () => store.remote.map(v => ({ ...v })); ghWriteJSON = async (tok, path, fn, msg) => { const out = fn(store.remote.map(v => ({ ...v }))); store.writes.push(out.map(v => v.name)); store.remote = out; return out; };
      // 1) webbläsarens gamla reserv innehåller en vy som raderats i projektet: den ska inte komma tillbaka
      const all = { ...(l3Prefs().views || {}) }; all[l3ViewKey()] = [mk('Vy A'), mk('Vy B'), mk('Test 2'), mk('Test 3')]; l3SetPref('views', all); l3vShared = null;
      await l3vLoad(true); const loaded = l3SavedViews().map(v => v.name), wrote = store.writes.length;
      // 2) en vy som lagts till av någon annan (finns i projektet, inte här) skrivs inte över när man raderar en annan
      store.remote.push(mk('Vy X (annan)')); l3DelView(0); await new Promise(r => setTimeout(r, 100)); const afterDel = store.remote.map(v => v.name);
      // 3) och när man sparar en ny vy ligger den kvar i projektets lista tillsammans med de andra
      store.remote.push(mk('Vy Y (annan)')); l3SaveView('Min nya vy', []); await new Promise(r => setTimeout(r, 100)); const afterSave = store.remote.map(v => v.name);
      return { loaded, wrote, afterDel, afterSave, local: (l3Prefs().views[l3ViewKey()] || []).map(v => v.name) };
    });
    if (R.loaded.join() !== 'Vy A,Vy B' || R.wrote !== 0) fail('Raderade vyer ur webbläsarens reserv ska inte komma tillbaka: ' + JSON.stringify(R));
    if (R.afterDel.join() !== 'Vy B,Vy X (annan)') fail('Radera ska bara ta bort den vyn ur projektets senaste lista: ' + JSON.stringify(R));
    if (!R.afterSave.includes('Vy Y (annan)') || !R.afterSave.includes('Min nya vy') || !R.afterSave.includes('Vy X (annan)')) fail('Spara ska lägga till vyn i projektets senaste lista: ' + JSON.stringify(R));
    console.log('OK: sparade vyer – raderade vyer kommer inte tillbaka från webbläsarens reserv, radera/spara läggs på projektets senaste lista');
    if (errors.length) fail('Sidan gav fel: ' + errors.slice(0, 3).join(' | '));
    console.log('OK test_lagesplan_savedviews');
  } catch (e) { console.log('FEL: ' + e.message); process.exitCode = 1; }
  await browser.close(); server.close();
})();
