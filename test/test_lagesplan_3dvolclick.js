const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9354;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  const gh = new Map();
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
    const body = JSON.parse(req.postData()); gh.set(f, Buffer.from(body.content, 'base64').toString());
    if (/ifc_groups\.json$/.test(f)) page.evaluate(t => { window.__gsaved = JSON.parse(t); }, gh.get(f)).catch(() => {});
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async ifc => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    window.__fetch = 0;
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    // UTF-8 rakt i filen ("Stålbolaget") – som en del program skriver.
  }, '');

  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  const r = await page.evaluate(async () => {
    // Modell: en platta 0..30 x 0..30, överkant z = 2 (som en grundplatta / projekterad yta).
    const cube = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]], tri = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
    const pos = new Float32Array(24 * 3), col = new Uint8Array(24 * 3), idx = new Uint32Array(36), ranges = [];
    for (let v = 0; v < 8; v++) { const o = v * 3; pos[o] = cube[v][0] * 30; pos[o + 1] = cube[v][1] * 30; pos[o + 2] = cube[v][2] * 2; col[o] = col[o + 1] = col[o + 2] = 200; }
    for (let t = 0; t < 36; t++) idx[t] = tri[t];
    ranges.push({ start: 0, count: 8, idxStart: 0, idxCount: 36, guid: 'g0', name: 'Platta', cls: 'IFCSLAB', base: [0.8, 0.8, 0.8] });
    const m = { id: 'vm', name: 'Platta', visible: true, meshes: [], ranges, tris: 12, O: [0, 0, 0], src: { id: 'vm', version: 'v1' } };
    const mesh = l3bMeshFromArrays(pos, col, idx, ranges, m, null); m.meshes.push(mesh); l3.groups.bldg.add(mesh); l3b.models.push(m); l3bPosition();
    mesh.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(mesh), lo = bb.min.clone().add(new THREE.Vector3(l3.O[0], l3.O[1], l3.O[2]));
    // Punktmoln: platå z = lo.z + 1.5 över hela ytan (tät rutnät), i molnets egna koordinater runt mitten.
    const c0 = [lo.x + 15, lo.y + 15, lo.z + 1.5], P = [];
    for (let y = -15; y <= 15; y += 0.25) for (let x = -15; x <= 15; x += 0.25) P.push(x, y, 0);
    l3pc.clouds.push({ id: 'pcA', name: 'Moln A', visible: false, dz: 0, nTot: P.length / 3, info: { center: c0, min: [lo.x, lo.y, c0[2]], max: [lo.x + 30, lo.y + 30, c0[2]] }, chunks: [{ pos: new Float32Array(P) }] });
    window.__lo = [lo.x, lo.y, lo.z];
    const c = l3.camera, ce = bb.getCenter(new THREE.Vector3()); l3.orbit.target.copy(ce); c.position.set(ce.x + 25, ce.y - 30, ce.z + 22); c.lookAt(ce); c.updateMatrixWorld(); l3.orbit.update(); l3Render();
    return { lo: window.__lo };
  });
  const lo = r.lo;
  // Mät → Volym: området 10 x 10 m (hörn i scenens koordinater), via verktygets egen väg.
  await page.evaluate(lo => { l3SetPref('measure', 'volume'); l3SetTool('measure'); const O = l3.O; l3t.mp = [[8, 8], [18, 8], [18, 18], [8, 18]].map(([x, y]) => new THREE.Vector3(lo[0] + x - O[0], lo[1] + y - O[1], lo[2] + 2 - O[2])); l3t.mpObjs = []; l3VolBase(); }, lo);
  await page.waitForSelector('#v3VolPanel'); await page.waitForFunction(() => l3vol.cur && l3vol.cur.res, null, { timeout: 15000 });
  const d = await page.evaluate(() => ({ a: l3vol.cur.spec.a.k, b: l3vol.cur.spec.b.k, res: l3vol.cur.res, solids: !!(l3vol.cur.geom && (l3vol.cur.geom.cut || l3vol.cur.geom.fill)) }));
  if (process.env.SHOT) { await page.waitForTimeout(500); await page.screenshot({ path: process.env.SHOT }); }
  console.log('default', JSON.stringify({ a: d.a, b: d.b, fill: d.res.fill, cut: d.res.cut, area: d.res.area, cell: d.res.cell }));
  await page.evaluate(() => { l3pc.clouds.find(c => c.id === 'pcA').visible = true; });
  await page.fill('input[data-vlv]', '5'); await page.click('[data-vb="lvl"]'); await page.waitForTimeout(800);
  await page.evaluate(() => { window.l3pcPick = () => null; l3pc.clouds.find(c => c.id === 'pcA').visible = false; l3Render(); });
  for (const [btn, cap] of [['[data-vfill="box"]', 'fillbox'], ['[data-vtoe="draw"]', 'toe'], ['[data-vfill="on"]', 'fill']]) {
    await page.click(btn); await page.waitForTimeout(200);
    const st = await page.evaluate(() => ({ cap: l3vol.capture, tool: l3.tool, m: l3Prefs().measure }));
    const pts = await page.evaluate(() => { const lo = window.__lo, r = l3.renderer.domElement.getBoundingClientRect(); return [[10,10],[20,10],[20,20]].map(([x,y]) => { const q = l3ToScreen(new THREE.Vector3(lo[0]+x-l3.O[0], lo[1]+y-l3.O[1], 1.5+lo[2]-l3.O[2])); return [r.left+q.x, r.top+q.y]; }); });
    for (const [x, y] of pts) { await page.mouse.click(x, y); await page.waitForTimeout(150); }
    const after = await page.evaluate(() => ({ cap: l3vol.capture, A: (l3vol.polyA||[]).length, T: (l3vol.toeA||[]).length, F: (l3vol.cur.spec.fillPts||[]).length, sel: [...l3.sel].length }));
    if (false) await page.screenshot({ path: '/tmp/claude-0/-home-user-4D-planering/867d5061-8c43-5fe8-9725-74ef03d6c450/scratchpad/box.png' });
    console.log(cap, JSON.stringify(st), JSON.stringify(after));
    const nvis = await page.evaluate(() => l3.groups.volBoxes ? l3.groups.volBoxes.children.length : 0); if (nvis < 3) fail('Linjer/prickar ritas direkt: ' + nvis);
    if (after.sel || after.cap !== cap || (cap === 'fillbox' && after.A !== 3) || (cap === 'toe' && after.T !== 3) || (cap === 'fill' && after.F !== 3)) fail('Tryck går till volymverktyget (' + cap + '): ' + JSON.stringify(after));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  }
  await browser.close(); server.close(); console.log('OK test_lagesplan_3dvolclick');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
