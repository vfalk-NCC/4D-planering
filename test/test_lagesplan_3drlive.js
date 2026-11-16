// 3D-vyns flik 4D-planering (Victor 2026-10-12): Powerproject-tidplanen som tavla (lappar per vecka) och staplar
// i en panel nederst, tryck på en lapp markerar i 3D, tryck på en vecka flyttar datumet, kameravyer på datum
// och en inspelad film (videofil) där datumet räknas fram och kameran glider mellan vyerna.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9905;
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
    const J = v => JSON.stringify(v), sleep = ms => page.waitForTimeout(ms);
    await page.evaluate(() => { window.showSaveFilePicker = undefined; const O = l3.O; const p = placeNew('mach:crane', [O[0] + 8, O[1] + 25, O[2]]); placements.push(p); l3AddPlacementMesh(p); const t = placeNew('mach:truck', [O[0] - 4, O[1] + 18, O[2]]); placements.push(t); l3AddPlacementMesh(t);
      l3SetPref('rn', { quality: 'fast', soft: 1.6, ao: 1, exposure: 0.95, bloom: 0.12, dof: 0, shadowSize: 2048, edges: false }); l3.camera.position.set(30, -45, 14); l3.orbit.target.set(2, 22, 3); l3.orbit.update(); l3SetPref('vmode', 'shaded'); l3vmSet('shaded', true); });
    // 1) knappen: renderingsläget på/av, rutan öppnas, läget sätts tillbaka
    const mode0 = await page.evaluate(() => l3vm.mode);
    await page.click('#v3RenderBtn'); await page.waitForSelector('#v3Render');
    const on1 = await page.evaluate(() => ({ on: l3rv.on, cls: document.getElementById('v3RenderBtn').classList.contains('on'), mode: l3vm.mode, prev: document.querySelector('#v3Render .rn-v').style.display }));
    if (!on1.on || !on1.cls || on1.mode !== 'real' || on1.prev !== 'none') fail('Rendera ska slå på renderingsläget i vyn och öppna rutan utan egen förhandsbild: ' + J(on1));
    await page.waitForFunction(() => l3rv.count >= l3rvTarget() && !l3rv.busy, null, { timeout: 120000 });
    const painted = await page.evaluate(() => ({ count: l3rv.count, target: l3rvTarget(), buf: !!l3rn.liveBuf, busy: l3rn.busy }));
    console.log('OK: Rendera slår på renderingsläget direkt på 3D-vyn – ' + painted.count + ' av ' + painted.target + ' delbilder förfinade');

    // 2) vyn = filmens bild: samma motor, samma kamera/läge/inställningar → live-bilden och en separat rendering av samma storlek ska vara lika
    const cmp = await page.evaluate(async () => {
      while (l3rv.busy || l3rn.busy) await new Promise(r => setTimeout(r, 50));
      const r = l3.renderer, db = r.getDrawingBufferSize(new THREE.Vector2()), W = Math.round(db.x), H = Math.round(db.y), N = 12; let live = null;
      l3rv.dirty = false; await l3rnRender({ ...l3rnSettings(), live: true, reset: true, from: 0, step: N, target: N, capture: c => { live = c.toDataURL('image/png'); } });
      const off = await l3rnRender({ ...l3rnSettings(), width: W, height: H, samples: N });
      const img = new Image(); img.src = live; await img.decode(); const a = document.createElement('canvas'); a.width = W; a.height = H; const x = a.getContext('2d'); x.drawImage(img, 0, 0, W, H);
      const A = x.getImageData(0, 0, W, H).data, B = off.canvas.getContext('2d').getImageData(0, 0, W, H).data; let d = 0, top = [0, 0, 0], n = 0;
      for (let i = 0; i < A.length; i += 4) { d += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]); }
      for (let yy = 0; yy < 20; yy++) for (let xx = 0; xx < W; xx++) { const i = (yy * W + xx) * 4; top[0] += A[i]; top[1] += A[i + 1]; top[2] += A[i + 2]; n++; }
      return { W, H, diff: d / (A.length / 4) / 3, top: top.map(v => Math.round(v / n)), tiles: off.tiles };
    });
    if (!(cmp.diff < 3) || !(cmp.top[2] > cmp.top[0] + 10) || cmp.tiles !== 1) fail('Vyn i renderingsläget ska vara samma bild som filmens (motorn): ' + J(cmp));
    console.log('OK: vyn i renderingsläget = renderingsmotorns bild (' + cmp.W + '×' + cmp.H + ', snittskillnad ' + cmp.diff.toFixed(2) + ' nivåer, himmel överst)');

    // 3) ändringar slår igenom direkt: kamera, datum och inställningar ritar om vyn
    const inv = await page.evaluate(async () => { while (l3rv.busy) await new Promise(r => setTimeout(r, 50)); const c0 = l3rv.count; l3.camera.position.x += 5; l3.orbit.update(); l3Render(); await new Promise(r => setTimeout(r, 60)); const dirty = l3rv.dirty || l3rv.count < c0 || l3rv.busy; l3SetPref('rn', { ...l3rnSettings(), exposure: 1.2 }); l3Render(); await new Promise(r => setTimeout(r, 60)); return { dirty, sig: l3rv.sig.length > 0 }; });
    if (!inv.dirty) fail('En kamerarörelse ska rita om vyn: ' + J(inv));
    await page.waitForFunction(() => l3rv.count >= l3rvTarget() && !l3rv.busy, null, { timeout: 120000 });

    // 4) uppspelning: varje bild ritas av motorn
    const play = await page.evaluate(async () => {
      l3plSet('film', { ...l3plPrefs().film, from: '2026-10-01', to: '2026-10-21', sec: 3, res: '240', title: false, pearls: false }); let calls = 0; const f0 = l3rvFrame; l3rvFrame = async (...a) => { calls++; if (calls >= 4 && l3pl.rec) l3pl.rec.stop = true; return f0(...a); };
      await l3plFilm(false); l3rvFrame = f0; return { calls, rec: !!l3pl.rec, on: l3rv.on };
    });
    if (play.calls < 4 || play.rec || !play.on) fail('Spela upp i renderingsläget ska rita varje bild med motorn: ' + J(play));
    console.log('OK: Spela upp – ' + play.calls + ' bilder ritade av renderingsmotorn direkt på vyn');

    // 5) spela in: samma motor, bild för bild, filens format = vyns
    const rec = await page.evaluate(async () => {
      let saved = null; const d0 = downloadBlob; downloadBlob = (b, n) => { saved = { size: b.size, name: n }; };
      l3plSet('film', { ...l3plPrefs().film, from: '2026-10-01', to: '2026-10-21', sec: 1, res: '240' });
      const view = l3.renderer.domElement, ratio = view.clientWidth / view.clientHeight; const r = await l3plFilm(true); downloadBlob = d0;
      return { frames: r && r.frames, w: r && r.w, h: r && r.h, ratio: r ? r.w / r.h : 0, view: ratio, saved, fmt: r && r.format, rec: !!l3pl.rec };
    });
    if (!rec.frames || rec.frames < 20 || Math.abs(rec.ratio - rec.view) > 0.03 || !rec.saved || rec.saved.size < 1000 || rec.rec) fail('Spela in i renderingsläget ska ge en fil i vyns format med motorns bilder: ' + J(rec));
    console.log('OK: Spela in – ' + rec.frames + ' bilder med renderingsmotorn, ' + rec.w + '×' + rec.h + ' (vyns format ' + rec.view.toFixed(2) + '), sparad ' + rec.saved.name);

    // 6) av: allt tillbaka
    await page.click('#v3RenderBtn'); await sleep(300);
    const off = await page.evaluate(() => ({ on: l3rv.on, cls: document.getElementById('v3RenderBtn').classList.contains('on'), dlg: !!document.getElementById('v3Render'), mode: l3vm.mode, buf: !!l3rn.liveBuf, busy: l3rn.busy }));
    if (off.on || off.cls || off.dlg || off.mode !== mode0 || off.buf || off.busy) fail('Av ska stänga renderingsläget, rutan och sätta tillbaka visningsläget: ' + J({ off, mode0 }));
    console.log('OK: Rendera av – visningsläget (' + mode0 + ') och buffertarna återställda');
    if (errors.length) fail('Sidan gav fel: ' + errors.slice(0, 3).join(' | '));
    console.log('OK test_lagesplan_3drlive');
  } catch (e) { console.log('FEL: ' + e.message); process.exitCode = 1; }
  await browser.close(); server.close();
})();
