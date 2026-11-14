// 3D-vyns flik 4D-planering (Victor 2026-10-12): Powerproject-tidplanen som tavla (lappar per vecka) och staplar
// i en panel nederst, tryck på en lapp markerar i 3D, tryck på en vecka flyttar datumet, kameravyer på datum
// och en inspelad film (videofil) där datumet räknas fram och kameran glider mellan vyerna.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9895;
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
      const O = l3.O; const p = placeNew('mach:crane', [O[0] + 8, O[1] + 25, O[2]]); placements.push(p); l3AddPlacementMesh(p); l3Render();
      l3.camera.position.set(30, -45, 14); l3.orbit.target.set(2, 22, 3); l3.orbit.update(); l3.camera.updateMatrixWorld();
      const cam0 = l3.camera.position.toArray().map(v => +v.toFixed(5)), sh0 = l3vmSun().shadow.mapSize.x;
      const px = c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; return d; };
      const lum = d => { let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; };
      const edge = d => { let s = 0, w = 640; for (let i = 0; i < d.length - 4 * w; i += 4) s += Math.abs(d[i] - d[i + 4]) + Math.abs(d[i] - d[i + 4 * w]); return s / (d.length / 4); };
      const base = { width: 640, height: 360, samples: 6, sunAz: 20, sunEl: 7, env: {} };
      const a = await l3rnRender({ ...base, bloom: 0 }), b = await l3rnRender({ ...base, bloom: 0.8 }), f1 = await l3rnRender({ ...base, bloom: 0, dof: 0 }), f2 = await l3rnRender({ ...base, bloom: 0, dof: 5, focus: 15 }), s2 = await l3rnRender({ ...base, bloom: 0, shadowSize: 2048 });
      return { lumA: lum(px(a.canvas)), lumB: lum(px(b.canvas)), edge0: edge(px(f1.canvas)), edge1: edge(px(f2.canvas)), cam0, cam1: l3.camera.position.toArray().map(v => +v.toFixed(5)), sh0, sh1: l3vmSun().shadow.mapSize.x, view: !!l3.camera.view && l3.camera.view.enabled, busy: l3rn.busy, env: !!l3.scene.environment, bg: l3.scene.children.some(c => c.userData && c.userData.l3skSky) };
    });
    const J = v => JSON.stringify(v);
    if (!(R.lumB > R.lumA + 0.2)) fail('Bloom ska ge glöd (ljusare bild): ' + J(R));
    if (!(R.edge1 < R.edge0 * 0.97)) fail('Skärpedjup ska göra det som ligger utanför fokus suddigare: ' + J(R));
    if (J(R.cam0) !== J(R.cam1) || R.view || R.busy || R.bg) fail('Kameran och scenen ska vara som förut efter renderingen: ' + J(R));
    if (R.sh1 > 2048) fail('Skuggkartan ska inte bli kvar i den stora storleken: ' + J(R));
    console.log('OK: bloom (' + R.lumA.toFixed(1) + ' → ' + R.lumB.toFixed(1) + '), skärpedjup (kantenergi ' + R.edge0.toFixed(2) + ' → ' + R.edge1.toFixed(2) + '), kamera och skuggkarta återställda');
    if (errors.length) fail('Sidan gav fel: ' + errors.slice(0, 3).join(' | '));
    console.log('OK test_lagesplan_3drpost');
  } catch (e) { console.log('FEL: ' + e.message); process.exitCode = 1; }
  await browser.close(); server.close();
})();
