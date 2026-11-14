// 3D-vyns flik 4D-planering (Victor 2026-10-12): Powerproject-tidplanen som tavla (lappar per vecka) och staplar
// i en panel nederst, tryck på en lapp markerar i 3D, tryck på en vecka flyttar datumet, kameravyer på datum
// och en inspelad film (videofil) där datumet räknas fram och kameran glider mellan vyerna.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9893;
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
    const J = v => JSON.stringify(v); await page.evaluate(() => { window.showSaveFilePicker = undefined; });

    // 1) maskinerna finns i biblioteket och placeras som vanliga objekt
    const lib = await page.evaluate(() => ['crane', 'excavator', 'truck', 'loader', 'human'].map(k => { const l = placeLib('mach:' + k); return l && l.group + '/' + l.mach; }));
    if (lib.some(x => !x || !x.startsWith('Maskiner/'))) fail('Maskinerna ska finnas under Maskiner: ' + J(lib));
    const setup = await page.evaluate(() => {
      const O = l3.O, out = {};
      ['excavator', 'truck', 'crane'].forEach((k, i) => { const p = placeNew('mach:' + k, [O[0] + 5, O[1] + 5 + i * 12, O[2]]); placements.push(p); l3AddPlacementMesh(p); out[k] = p.id; });
      l3Render(); return { ids: out, O, built: Object.fromEntries(Object.entries(out).map(([k, id]) => [k, !!(l3.placeMeshes.get(id).userData.mach && l3.placeMeshes.get(id).children.length)])) };
    });
    if (!Object.values(setup.built).every(Boolean)) fail('Maskinerna ska byggas: ' + J(setup.built));
    console.log('OK: maskiner i biblioteket och placerade i 3D – ' + Object.keys(setup.ids).join(', '));

    // 2) nycklar: grävaren kör 40 m och börjar arbeta, lastbilen kör, kranen står och arbetar
    const R = await page.evaluate(async ids => {
      const O = l3.O, ex = placements.find(p => p.id === ids.excavator), tr = placements.find(p => p.id === ids.truck), cr = placements.find(p => p.id === ids.crane);
      ex.anim = [{ date: '2026-10-05', x: O[0] + 5, y: O[1] + 5, dz: 0, rot: 0 }, { date: '2026-10-15', x: O[0] + 45, y: O[1] + 5, dz: 0, rot: 0 }, { date: '2026-10-20', x: O[0] + 45, y: O[1] + 5, dz: 0, rot: 0, w: 1 }];
      tr.anim = [{ date: '2026-10-05', x: O[0] + 5, y: O[1] + 17, dz: 0, rot: 0 }, { date: '2026-10-15', x: O[0] + 5, y: O[1] + 57, dz: 0, rot: 90 }];
      cr.anim = [{ date: '2026-10-05', x: O[0] + 5, y: O[1] + 29, dz: 0, rot: 0 }, { date: '2026-10-20', x: O[0] + 5, y: O[1] + 29, dz: 0, rot: 0, w: 1 }];
      const T = d => Date.UTC(...d.split('-').map((v, i) => i === 1 ? v - 1 : +v)), snap = () => { const o = {}; Object.entries(ids).forEach(([k, id]) => { const g = l3.placeMeshes.get(id), v = []; g.traverse(m => { if (m.isMesh) v.push(m.parent.rotation.x + m.parent.rotation.y + m.parent.rotation.z); }); o[k] = { x: +(g.position.x + O[0] - O[0]).toFixed(2), rot: +(g.rotation.z * 180 / Math.PI).toFixed(1), sig: v.reduce((a, b) => a + b, 0).toFixed(4) }; }); return o; };
      const at = {}; for (const d of ['2026-10-05', '2026-10-10', '2026-10-15', '2026-10-17', '2026-10-20']) { l3animApply(T(d)); at[d] = snap(); }
      l3animApply(T('2026-10-10')); const wheelsMid = (() => { let r = 0; l3.placeMeshes.get(ids.truck).traverse(m => { r += Math.abs(m.rotation.y); }); return +r.toFixed(3); })();
      l3animApply(T('2026-10-15')); const wheelsStill = (() => { let r = 0; l3.placeMeshes.get(ids.truck).traverse(m => { r += Math.abs(m.rotation.y); }); return +r.toFixed(3); })();
      return { at, wheelsMid, wheelsStill };
    }, setup.ids);
    const A = R.at;
    if (Math.abs(A['2026-10-10'].excavator.x - A['2026-10-05'].excavator.x - 20) > 0.5 || Math.abs(A['2026-10-15'].excavator.x - A['2026-10-05'].excavator.x - 40) > 0.1) fail('Grävaren ska köra mellan nycklarna: ' + J(A));
    if (A['2026-10-15'].excavator.sig === A['2026-10-20'].excavator.sig) fail('Grävarens delar ska röra sig när den arbetar: ' + J(A));
    if (A['2026-10-17'].excavator.sig === A['2026-10-15'].excavator.sig) fail('Arbetet ska glida in mjukt mellan nycklarna: ' + J(A));
    if (A['2026-10-20'].crane.sig === A['2026-10-05'].crane.sig) fail('Kranen ska arbeta: ' + J(A));
    if (Math.abs(A['2026-10-15'].truck.rot - 90) > 0.5) fail('Lastbilens vridning: ' + J(A));
    if (!(R.wheelsMid > 0)) fail('Hjulen ska rulla när lastbilen kör: ' + J(R));
    console.log('OK: nycklar – grävaren kör 40 m och börjar arbeta (mjuk övergång), kranen arbetar, lastbilen svänger, hjulen rullar vid körning');

    // 3) renderingsfilmen använder animeringen: grävaren ska flytta sig i bilden mellan första och sista bilden
    const F = await page.evaluate(async ids => {
      const O = l3.O, ex = l3.placeMeshes.get(ids.excavator), xs = [], jpgs = [];
      l3plSet('film', { from: '2026-10-05', to: '2026-10-20', sec: 1, res: '240', title: false, pearls: false });
      const r = await l3rfFilm({ from: '2026-10-05', to: '2026-10-20', sec: 1, fps: 24, res: 240, samples: 1, format: 'zip', onProgress: (i) => { xs.push(+(ex.position.x + O[0]).toFixed(2)); } });
      return { frames: r.frames, xs, last: +(ex.position.x + O[0]).toFixed(2) };
    }, setup.ids);
    if (F.frames !== 24 || F.xs[F.xs.length - 1] - F.xs[0] < 39 || !F.xs.every((x, i, a) => !i || x >= a[i - 1] - 1e-6)) fail('Renderingsfilmen ska flytta grävaren framåt bild för bild: ' + J(F));
    console.log('OK: renderingsfilmen spelar upp animeringen – grävaren ' + F.xs[0] + ' → ' + F.xs[F.xs.length - 1] + ' m över ' + F.frames + ' bilder');
    if (process.env.L3MACHPNG) { const d = await page.evaluate(async ids => { const O = l3.O; l3animApply(Date.UTC(2026, 9, 20)); const g = l3.placeMeshes.get(ids.crane).position; l3plCamApply && 0; l3.camera.position.set(g.x + 40, g.y - 45, 30); l3.orbit.target.set(g.x + 10, g.y - 5, 0); l3.orbit.update(); const r = await l3rnRender({ width: 900, height: 520, samples: 3 }); return r.canvas.toDataURL('image/png').split(',')[1]; }, setup.ids); fs.writeFileSync(process.env.L3MACHPNG, Buffer.from(d, 'base64')); }
    if (errors.length) fail('Sidan gav fel: ' + errors.slice(0, 3).join(' | '));
    console.log('OK test_lagesplan_3dmach');
  } catch (e) { console.log('FEL: ' + e.message); process.exitCode = 1; }
  await browser.close(); server.close();
})();
