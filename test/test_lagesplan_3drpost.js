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
    const W = await page.evaluate(async () => {
      const O = l3.O, bx = placeNew('lada', [O[0] + 2, O[1] + 22, O[2]]); bx.L = 40; bx.B = 40; bx.H = 0.5; bx.color = '#6b6b6b'; placements.push(bx); l3AddPlacementMesh(bx);
      l3.camera.position.set(2, 8, 55); l3.orbit.target.set(2, 22, 0.5); l3.orbit.update();
      const own0 = []; l3.scene.traverse(o => { if (o.isMesh && o.material && !Array.isArray(o.material) && Object.prototype.hasOwnProperty.call(o.material, 'customProgramCacheKey')) own0.push(1); });
      const lum = c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0, n = 0; for (let y = Math.round(c.height * 0.4); y < c.height * 0.6; y++) for (let x = Math.round(c.width * 0.4); x < c.width * 0.6; x++) { const i = (y * c.width + x) * 4; s += d[i] + d[i + 1] + d[i + 2]; n++; } return s / n / 3; };
      const base = { width: 480, height: 270, samples: 6, bloom: 0, sunAz: 150, sunEl: 40 }, r0 = await l3rnRender({ ...base, env: {} }), rw = await l3rnRender({ ...base, env: { wet: 1 } }), rs = await l3rnRender({ ...base, env: { snow: 1 } }), rr = await l3rnRender({ ...base, env: { rain: 1 } });
      const own = []; l3.scene.traverse(o => { if (o.isMesh && o.material && !Array.isArray(o.material) && Object.prototype.hasOwnProperty.call(o.material, 'customProgramCacheKey')) own.push(1); });
      const t1 = await l3rnRender({ ...base, env: { rain: 1 }, time: 0 }), t2 = await l3rnRender({ ...base, env: { rain: 1 }, time: 3 }), da = t1.canvas.getContext('2d').getImageData(0, 0, 480, 270).data, db = t2.canvas.getContext('2d').getImageData(0, 0, 480, 270).data; let diff = 0; for (let i = 0; i < da.length; i += 4) diff += Math.abs(da[i] - db[i]);
      return { l0: lum(r0.canvas), lw: lum(rw.canvas), ls: lum(rs.canvas), lr: lum(rr.canvas), leftover: own.length - own0.length, diff: diff / (da.length / 4) };
    });
    console.log('väder:', JSON.stringify(W)); if (process.env.WXPNG) { const im = await page.evaluate(async () => { const r = await l3rnRender({ width: 480, height: 270, samples: 6, bloom: 0, sunAz: 150, sunEl: 40, env: { snow: 1 } }); return r.canvas.toDataURL('image/png').split(',')[1]; }); require('fs').writeFileSync(process.env.WXPNG, Buffer.from(im, 'base64')); }
    if (!(W.lw < W.l0 - 1)) fail('Blött underlag ska bli mörkare: ' + JSON.stringify(W));
    if (!(W.ls > W.l0 + 8)) fail('Snö ska göra uppåtvända ytor ljusare: ' + JSON.stringify(W));
    if (!(W.lr < W.l0 && W.diff > 0.1)) fail('Regn ska ritas och röra sig mellan bilderna: ' + JSON.stringify(W));
    if (W.leftover) fail('Väderpatchen ska tas bort från materialen efteråt: ' + JSON.stringify(W));
    console.log('OK: väder – blött underlag, snö på uppåtvända ytor, regn som rör sig, materialen återställda');
    const TL = await page.evaluate(async () => {
      l3.camera.position.set(30, -45, 14); l3.orbit.target.set(2, 22, 3); l3.orbit.update();
      const base = { width: 1100, height: 620, samples: 4, bloom: 0, sunAz: 150, sunEl: 40 }, one = await l3rnRender({ ...base, tile: 4096 }), prog = [], many = await l3rnRender({ ...base, tile: 512, onProgress: (d, n) => prog.push([d, n]) });
      const a = one.canvas.getContext('2d').getImageData(0, 0, 1100, 620).data, b = many.canvas.getContext('2d').getImageData(0, 0, 1100, 620).data; let diff = 0, seam = 0, base0 = 0; const edge = x => { let s = 0; for (let y = 0; y < 620; y++) { const i = (y * 1100 + x) * 4, j = (y * 1100 + x - 1) * 4; s += Math.abs(b[i] - b[j]) + Math.abs(b[i + 1] - b[j + 1]) + Math.abs(b[i + 2] - b[j + 2]); } return s / 620 / 3; };
      for (let i = 0; i < a.length; i += 4) diff += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      const xs = [367, 734]; seam = Math.max(...xs.map(edge)); base0 = (edge(300) + edge(500) + edge(900)) / 3;
      return { tiles: many.tiles, one: one.tiles, diff: diff / (a.length / 4) / 3, seam, base0, prog: prog.length, last: prog[prog.length - 1], w: many.canvas.width, h: many.canvas.height };
    });
    console.log('rutor:', JSON.stringify(TL));
    if (TL.tiles !== 6 || TL.one !== 1 || TL.w !== 1100 || TL.h !== 620 || TL.last[0] !== TL.last[1]) fail('Stor bild ska delas i rutor (3×2) och sättas ihop: ' + JSON.stringify(TL));
    if (!(TL.diff < 2.5) || !(TL.seam < TL.base0 + 4)) fail('Rutindelad bild ska se likadan ut som en hel och sakna skarvar: ' + JSON.stringify(TL));
    console.log('OK: rutindelad rendering – 3×2 rutor ger samma bild som en hel (snittskillnad ' + TL.diff.toFixed(2) + ' nivåer), inga skarvar');
    const PA = await page.evaluate(async () => {
      l3.camera.position.set(30, -45, 14); l3.orbit.target.set(2, 22, 3); l3.orbit.update();
      const pos0 = l3.camera.position.toArray().map(v => +v.toFixed(5)), r = await l3rnRender({ width: 1024, panorama: true, samples: 3, bloom: 0, sunAz: 150, sunEl: 40 }), c = r.canvas, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let sx = 0, sy = 0, n = 0, top = [0, 0, 0], tn = 0; for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; if (d[i] > 190 && d[i + 1] > 150 && d[i + 2] < 90) { sx += x; sy += y; n++; } if (y < 40) { top[0] += d[i]; top[1] += d[i + 1]; top[2] += d[i + 2]; tn++; } }
      return { w: c.width, h: c.height, pano: r.panorama, n, cx: sx / Math.max(1, n), cy: sy / Math.max(1, n), top: top.map(v => Math.round(v / tn)), pos0, pos1: l3.camera.position.toArray().map(v => +v.toFixed(5)), busy: l3rn.busy };
    });
    console.log('panorama:', JSON.stringify(PA));
    if (PA.w !== 1024 || PA.h !== 512 || !PA.pano || PA.n < 30) fail('Panorama ska bli 2:1 och visa kranen: ' + JSON.stringify(PA));
    if (!(PA.cx > 512 && PA.cx < 590) || !(PA.cy > 262 && PA.cy < 330)) fail('Kranen ska ligga några grader till höger om mitten och under horisonten (inte spegelvänd): ' + JSON.stringify(PA));
    if (!(PA.top[2] > PA.top[0]) || JSON.stringify(PA.pos0) !== JSON.stringify(PA.pos1) || PA.busy) fail('Himlen ska vara överst och kameran orörd: ' + JSON.stringify(PA));
    console.log('OK: 360°-panorama – equirektangulär 1024×512, kranen på rätt plats (' + PA.cx.toFixed(0) + ',' + PA.cy.toFixed(0) + '), himmel överst');
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
