// 3D-vyns flik 4D-planering (Victor 2026-10-12): Powerproject-tidplanen som tavla (lappar per vecka) och staplar
// i en panel nederst, tryck på en lapp markerar i 3D, tryck på en vecka flyttar datumet, kameravyer på datum
// och en inspelad film (videofil) där datumet räknas fram och kameran glider mellan vyerna.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9897;
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
    await page.evaluate(() => { window.__S = 48; }); const OUT = process.env.OUT, fsx = require('fs'); fsx.mkdirSync(OUT, { recursive: true });
    await page.evaluate(async () => {
      const A = l3api.methods, O = l3.O, P = (x, y, z = 0) => [O[0] + x, O[1] + y, O[2] + z], rule = (id, m, o = {}) => l3rmSetRule({ t: 'obj', ref: id }, m, o);
      A.set_ground_material({ material: 'gras', scale: 1.4 });
      A.add_ground_area({ kind: 'road', points: [P(-70, -17), P(80, -17)].map(p => [p[0], p[1]]), width: 7, material: 'asfalt' });
      A.add_ground_area({ kind: 'area', points: [P(-34, -12), P(-10, -12), P(-10, -22), P(-34, -22)].map(p => [p[0], p[1]]), material: 'grus' });
      A.add_ground_area({ kind: 'area', points: [P(14, 14), P(30, 12), P(33, 22), P(18, 26)].map(p => [p[0], p[1]]), material: 'vatten' });
      A.add_ground_area({ kind: 'area', points: [P(-14, -11), P(14, -11), P(14, -14), P(-14, -14)].map(p => [p[0], p[1]]), material: 'plattor' });
      const slab = A.create_box({ x: O[0], y: O[1], z: O[2], length: 24, width: 14, height: 0.4, name: 'Platta', color: '#cccccc' }); rule(slab.id, 'betong_ljus');
      const walls = A.create_wall({ points: [P(-10, -5), P(10, -5), P(10, 5), P(-10, 5)], closed: true, thickness: 0.4, height: 7, z: O[2] + 0.4, name: 'Fasad', color: '#b05040' }); rule(walls.id, 'tegel_rod', { s: 1.3 });
      const roof = A.create_gable_roof({ x: O[0], y: O[1], z: O[2] + 7.4, length: 21, width: 10, rise: 3.2, overhang: 0.5, name: 'Tak', color: '#444444' }); rule(roof.id, 'takpannor', { s: 1.5 });
      for (const [i, x] of [-7.5, -3.5, 0.5, 4.5, 8].entries()) for (const [j, z] of [1.5, 4.5].entries()) { const w = A.create_box({ x: O[0] + x, y: O[1] - 5.22, z: O[2] + 0.4 + z, length: 1.6, width: 0.12, height: 1.6, name: 'Fönster', color: '#88aacc' }); rule(w.id, 'glas'); }
      const door = A.create_box({ x: O[0] - 1.5, y: O[1] - 5.22, z: O[2] + 0.4, length: 1.4, width: 0.14, height: 2.4, name: 'Dörr', color: '#222222' }); rule(door.id, 'farg_svart');
      A.create_stairs({ x: O[0] - 1.5, y: O[1] - 8.2, z: O[2], steps: 3, rise: 0.15, run: 0.35, width: 2, name: 'Trappa', color: '#aaaaaa', rot: 90 });
      const wing = A.create_box({ x: O[0] + 16, y: O[1], z: O[2] + 0.4, length: 9, width: 8, height: 4.5, name: 'Annex', color: '#ddd' }); rule(wing.id, 'puts_vit');
      const wr = A.create_box({ x: O[0] + 16, y: O[1], z: O[2] + 4.9, length: 9.6, width: 8.6, height: 0.3, name: 'Annextak', color: '#333' }); rule(wr.id, 'takpapp');
      for (const [i, c] of [['#c0392b', 0], ['#2e6da4', 1], ['#e1b12c', 2]].map((a, i) => [i, a[0]])) { const k = A.create_box({ x: O[0] - 26 + i * 3.2, y: O[1] - 17, z: O[2], length: 6, width: 2.5, height: 2.6, name: 'Container', color: c }); rule(k.id, 'korrugerad', { tint: c }); }
      for (let i = 0; i < 9; i++) { const a = i * 0.9, x = -30 + (i % 3) * 9 + 62, y = 24 + Math.floor(i / 3) * 7; const tr = A.create_cylinder({ x: O[0] + x, y: O[1] + y, z: O[2], radius: 0.3, height: 3, name: 'Stam', color: '#6b4a2b' }); rule(tr.id, 'furu'); for (let k = 0; k < 3; k++) { const cr = A.create_cylinder({ x: O[0] + x, y: O[1] + y, z: O[2] + 2 + k * 1.6, radius: 2.4 - k * 0.7, height: 2.2, name: 'Krona', color: '#2f6b35' }); rule(cr.id, 'gras_torr', { tint: '#2f7a3a' }); } }
      const pile = A.create_prism({ points: [P(-8, 14), P(0, 12), P(3, 18), P(-5, 21)].map(p => [p[0], p[1]]), z: O[2], height: 2.2, name: 'Jordhög', color: '#6b5a40' }); rule(pile.id, 'jord');
      const mk = (type, x, y, rot, name) => { const p = placeNew(type, [O[0] + x, O[1] + y, O[2]]); p.rot = rot; p.name = name; placements.push(p); l3AddPlacementMesh(p); return p; };
      const crane = mk('mach:crane', -24, -6, 20, 'Mobilkran'), exc = mk('mach:excavator', -4, 17, 200, 'Grävmaskin'), truck = mk('mach:truck', 34, -15.5, 180, 'Lastbil'), loader = mk('mach:loader', -18, 12, 330, 'Hjullastare'), human = mk('mach:human', 24, -12, 100, 'Byggare'), hum2 = mk('mach:human', -12, -10, 250, 'Byggare 2');
      const tk = mk('tornkran', 17, 8, 0, 'Tornkran'); tk.H = 24; tk.R = 30; l3AddPlacementMesh(tk);
      const T = Date.UTC(2026, 10, 15), d = n => new Date(T + n * 86400000).toISOString().slice(0, 10);
      const key = (p, w) => { p.anim = [{ date: d(0), x: p.x, y: p.y, dz: 0, rot: p.rot, ...(w ? { w: 1 } : {}) }]; };
      key(crane, 1); key(exc, 1); key(loader, 1); key(truck, 0); key(human, 0); key(hum2, 0);
      l3animApply(T); l3SelectIds([placements[0].id]);
    });
    const shots = [
      ['01_hus_dag', { az: 215, el: 48, clouds: 0.15, haze: 0.2 }, [52, -58, 20], [0, 0, 5], {}],
      ['02_gyllene_timmen', { az: 255, el: 7, clouds: 0.25, haze: 0.15 }, [-46, -50, 9], [4, 2, 5], { exposure: 1.1 }],
      ['03_overkast_regn', { az: 200, el: 40, rain: 0.8 }, [44, -52, 14], [2, 0, 5], {}],
      ['04_sno', { az: 160, el: 22, snow: 0.9, haze: 0.25 }, [-40, -46, 16], [2, 0, 5], {}],
      ['05_narbild_skarpedjup', { az: 225, el: 38, clouds: 0.1 }, [-30, -3, 4.5], [-24, -6, 3.5], { dof: 2.2, focus: 8 }],
      ['06_panorama_360', { az: 215, el: 40, clouds: 0.2, haze: 0.1 }, [-6, -40, 5], [0, 0, 5], { panorama: true, width: 3072 }],
    ];
    for (const [name, env, cam, tgt, opt] of shots) {
      const t0 = Date.now();
      const b64 = await page.evaluate(async ([env, cam, tgt, opt]) => { l3.camera.position.set(...cam); l3.orbit.target.set(...tgt); l3.orbit.update(); const r = await l3rnRender({ samples: Number(window.__S) || 40, width: 1600, height: 900, env, ...opt }); return r.canvas.toDataURL('image/png').split(',')[1]; }, [env, cam, tgt, opt]);
      fsx.writeFileSync(OUT + '/' + name + '.png', Buffer.from(b64, 'base64')); console.log('klar', name, ((Date.now() - t0) / 1000).toFixed(0) + ' s');
    }
    console.log('OK klart'); await browser.close(); server.close();
  } catch (e) { console.log('FEL: ' + e.message); process.exit(1); }
})();
