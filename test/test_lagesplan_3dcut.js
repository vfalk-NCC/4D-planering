const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9298;
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
  const ok = (c, m) => { if (!c) fail(m); };
  const r = await page.evaluate(async () => {
    const O = l3.O, A = [O[0] + 5, O[1] + 5, 0], pl = MG.planeFrom([0, 0, 1], [0, 0, 0]), out = {};
    const vol = p => modDims(p).volume;
    const a = modCreate({ k: 'solid', pl, loops: [MG.rect2([0, 0], [4, 4])], d: 4 }, A);
    const b = modCreate({ k: 'solid', pl, loops: [MG.rect2([1, 1], [3, 3])], d: 6 }, [A[0], A[1], -1]);
    out.v0 = vol(a); const aid = a.id, n0 = placements.length;
    await l3dxCutCommit(a, b);
    const res = placements.find(p => p.m && p.m.k === 'mesh' && p.id !== b.id);
    out.gone = !placements.some(p => p.id === aid); out.cutterKept = placements.some(p => p.id === b.id); out.vol = res && modMeshStats(res.m.pts, res.m.faces).volume; out.n = placements.length - n0; out.sel = res && l3.sel.has(res.id);
    // en andra skärning på resultatet: hörnet bort
    const c = modCreate({ k: 'solid', pl, loops: [MG.rect2([3, 3], [5, 5])], d: 2 }, [A[0], A[1], 3]);
    await l3dxCutCommit(res, c); const res2 = placements.find(p => p.m && p.m.k === 'mesh' && p.id !== c.id && p.id !== b.id);
    out.vol2 = res2 && modMeshStats(res2.m.pts, res2.m.faces).volume;
    // ingen överlappning: ändras inget
    const far = modCreate({ k: 'solid', pl, loops: [MG.rect2([0, 0], [1, 1])], d: 1 }, [A[0] + 50, A[1], 0]); const before = placements.length; await l3dxCutCommit(res2, far); out.noOverlap = placements.length === before && placements.some(p => p.id === res2.id);
    // ett vanligt biblioteksobjekt (Egen låda) som skärobjekt
    const big = modCreate({ k: 'solid', pl, loops: [MG.rect2([0, 0], [10, 10])], d: 4 }, [A[0] + 100, A[1], 0]), lada = placeNew('lada', [A[0] + 105, A[1] + 5, 0]); lada.L = 2; lada.B = 2; lada.H = 6; lada.z = -1; placements.push(lada); placeTouch(lada); l3AddPlacementMesh(lada);
    const vb = vol(big); await l3dxCutCommit(big, lada); const rb = placements.find(p => p.m && p.m.k === 'mesh' && Math.abs(p.x - (A[0] + 100)) < 1e-6 && p.id !== big.id); out.ladaVol = rb ? modMeshStats(rb.m.pts, rb.m.faces).volume : null; out.ladaV0 = vb;
    // via musklick-vägen: l3dxClick med verktyget – kontrollera att tillståndet hålls efter en skärning
    out.opKept = !!(l3dw.op && l3dw.op.type === 'xint');
    out.status = document.getElementById('v3Status').textContent;
    return out;
  });
  ok(Math.abs(r.v0 - 64) < 0.01, 'Kroppen är 4×4×4 m: ' + JSON.stringify(r));
  ok(r.gone && r.cutterKept && r.n === 0 && Math.abs(r.vol - 48) < 0.05 && r.sel, 'Skärning med en genomgående kropp: 64 − 16 = 48 m³, skärobjektet ligger kvar: ' + JSON.stringify(r));
  ok(Math.abs(r.vol2 - (48 - 1 * 1 * 1)) < 0.05, 'Andra skärningen tar bort hörnet (1 m³ överlapp): ' + JSON.stringify(r));
  ok(r.ladaVol != null && r.ladaVol < r.ladaV0 - 1, 'Ett biblioteksobjekt kan skära bort sin volym: ' + JSON.stringify([r.ladaV0, r.ladaVol, r.status]));
  ok(r.noOverlap, 'Ingen överlappning ändrar ingenting: ' + JSON.stringify(r));
  // med riktiga musklick: tryck på kroppen, sedan på objektet som ligger i den
  await page.evaluate(() => { l3StopFly(); const O = l3.O, c = new THREE.Vector3(O[0] + 5 + 300 - O[0], O[1] + 5 - O[1], 0); placements.slice().filter(p => p.m || p.type === 'lada').forEach(p => { if (p.x < O[0] + 200) l3dxRemove([p.id]); }); });
  const e2e = await page.evaluate(async () => {
    const O = l3.O, A = [O[0] + 300, O[1] + 5, 0], pl = MG.planeFrom([0, 0, 1], [0, 0, 0]);
    const a = modCreate({ k: 'solid', pl, loops: [MG.rect2([0, 0], [8, 8])], d: 3 }, A), b = modCreate({ k: 'solid', pl, loops: [MG.rect2([3, 3], [5, 5])], d: 5 }, [A[0], A[1], -1]);
    const c = new THREE.Vector3(A[0] + 4 - O[0], A[1] + 4 - O[1], 0); l3.camera.position.set(c.x, c.y - 0.01, 40); l3.orbit.target.copy(c); l3.orbit.update(); l3Render();
    l3SetTool('model'); l3dwSetMode('intersect'); await new Promise(r => setTimeout(r, 200));
    const q = (x, y, z) => { const s = l3ToScreen(new THREE.Vector3(A[0] + x - O[0], A[1] + y - O[1], z)); const r = l3.renderer.domElement.getBoundingClientRect(); return [r.left + s.x, r.top + s.y]; };
    window.__pts = { a: q(1, 1, 3), b: q(4, 4, 4), id: [a.id, b.id], v0: modDims(a).volume };
    return window.__pts;
  });
  await page.mouse.move(e2e.a[0], e2e.a[1]); await page.waitForTimeout(100); await page.mouse.click(e2e.a[0], e2e.a[1]); await page.waitForTimeout(200);
  const st1 = await page.evaluate(() => ({ op: l3dw.op && l3dw.op.type, hint: document.getElementById('v3Status').textContent }));
  await page.mouse.move(e2e.b[0], e2e.b[1]); await page.waitForTimeout(100); await page.mouse.click(e2e.b[0], e2e.b[1]); await page.waitForTimeout(1500);
  const fin = await page.evaluate(() => { const a = placements.find(p => p.id === window.__pts.id[0]); const made = placements.find(p => p.m && p.m.k === 'mesh' && Math.abs(p.x - placements.find(q => q.id === window.__pts.id[1]).x) < 1e-6 && Math.abs(p.y - placements.find(q => q.id === window.__pts.id[1]).y) < 1e-6 ); return { aGone: !a, vol: made && modMeshStats(made.m.pts, made.m.faces).volume, op: l3dw.op && l3dw.op.type }; });
  ok(st1.op === 'xint' && fin.aGone && fin.vol && Math.abs(fin.vol - (8 * 8 * 3 - 2 * 2 * 3)) < 0.1 && fin.op === 'xint', 'Två musklick: kropp, sedan skärobjekt – ' + JSON.stringify([st1, fin, 8 * 8 * 3 - 12]));
  ok(!errors.length, 'JS-fel: ' + errors.join('|'));
  console.log('OK: Skär ytor som cut by part – kroppens volym kapas av ett objekt som ligger i den');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
