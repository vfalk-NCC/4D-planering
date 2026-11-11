const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9070;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : q.url.includes('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => { plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }]; pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A'); });
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  const setup = await page.evaluate(async () => {
    const O = l3.O, x0 = O[0] + 5, y0 = O[1] + 5, z0 = O[2] + 10, T = 0.4, top = 4;
    const P = [], idx = [], v = (x, y, z) => { P.push(x0 - O[0] + x, y0 - O[1] + y, z0 - O[2] + z); return P.length / 3 - 1; };
    const prof = [[0, 0], [10, 0], [10, 0.8], [20, 0.8], [20, 1.6], [30, 1.6], [30, top], [0, top]];
    const A = prof.map(p => v(p[0], 0, p[1])), B = prof.map(p => v(p[0], T, p[1]));
    for (let i = 0; i < prof.length; i++) { const j = (i + 1) % prof.length; idx.push(A[i], A[j], B[j], A[i], B[j], B[i]); }
    THREE.ShapeUtils.triangulateShape(prof.map(p => new THREE.Vector2(p[0], p[1])), []).forEach(f => { idx.push(A[f[0]], A[f[2]], A[f[1]]); idx.push(B[f[0]], B[f[1]], B[f[2]]); });
    const pos = new Float32Array(P), col = new Uint8Array(P.length).fill(160), ranges = [{ start: 0, count: P.length / 3, idxStart: 0, idxCount: idx.length, guid: 'WALL1', name: 'Bergsmur' }];
    const model = { id: 'mm', name: 'M', meshes: [], ranges: [], visible: true, tris: 0 }; l3b.models.push(model);
    const mesh = l3bMeshFromArrays(pos, col, new Uint32Array(idx), ranges, model); model.meshes.push(mesh); model.ranges.push(...mesh.userData.l3b.ranges); l3.groups.bldg.add(mesh); mesh.updateMatrixWorld(true);
    window.__mesh = mesh; l3bsSet([{ mesh, ri: 0 }]);
    // gjutform som följer formen (på IFC-objektet)
    const f = l3bqFormMake(0, 0.03), fp = placements.find(q => q.id === f[0]); let zmin = Infinity, zmax = -Infinity; fp.m.pts.forEach(q => { zmin = Math.min(zmin, q[2]); zmax = Math.max(zmax, q[2]); });
    const form = { area: fp.formArea, zspan: zmax - zmin };
    // redigerbar
    l3bsSet([{ mesh, ri: 0 }]); const ids = l3bqMake(), p = placements.find(q => q.id === ids[0]); window.__pid = p.id;
    const vol0 = Math.abs(modMeshStats(p.m.pts, p.m.faces).volume); window.__vol0 = vol0;
    // vy mot muren
    const g0 = l3.placeMeshes.get(p.id), c = g0.localToWorld(new THREE.Vector3(p.m.pts.reduce((a, q) => a + q[0], 0) / p.m.pts.length, p.m.pts.reduce((a, q) => a + q[1], 0) / p.m.pts.length, 2));
    l3.camera.position.set(c.x + 4, c.y - 30, c.z + 14); l3.camera.lookAt(c); if (l3.controls) { l3.controls.target.copy(c); l3.controls.update(); } l3.camera.updateMatrixWorld(true); l3Render();
    l3bqCutStart(p); const a = l3bqS.ax, rect = l3.renderer.domElement.getBoundingClientRect(), q = l3ToScreen(l3bqWorld(p, a, a.t0 + a.len * 0.3, (a.w0 + a.w1) / 2, 1.5));
    return { ids: ids.length, closed: p.m.closed, vol0, form, x: rect.left + q.x, y: rect.top + q.y, len: a.len };
  });
  console.log(JSON.stringify(setup));
  const exp = 30 * 0.4 * 4 - 0.4 * (10 * 0.8 + 10 * 1.6);
  if (setup.ids !== 1 || Math.abs(setup.vol0 - exp) > 0.05) fail('IFC-objektet blev inte redigerbart / fel volym: ' + JSON.stringify(setup));
  if (!(setup.form.area > 100) || setup.form.zspan < 3.5) fail('formen följer inte muren: ' + JSON.stringify(setup.form));
  // klick på muren (riktig mus) sätter ett snitt – kameran får först landa
  await page.evaluate(() => { const t = document.getElementById('v3Toast'); if (t) t.style.display = 'none'; }); await page.waitForTimeout(1500);
  const cp = await page.evaluate(() => { const p = placements.find(q => q.id === window.__pid), a = l3bqS.ax, rect = l3.renderer.domElement.getBoundingClientRect(), q = l3ToScreen(l3bqWorld(p, a, a.t0 + a.len * 0.3, (a.w0 + a.w1) / 2, 1.5)); return { x: rect.left + q.x, y: rect.top + q.y }; });
  await page.mouse.click(cp.x, cp.y); await page.waitForTimeout(150);
  const s1 = await page.evaluate(() => ({ cuts: l3bqS.cuts.slice(), rings: l3bqS.rings.length, plus: l3bqS.plus.length, panel: !!document.querySelector('.v3-bqpanel') }));
  console.log('klick:', JSON.stringify(s1));
  if (s1.cuts.length !== 1 || s1.rings !== 1 || s1.plus !== 2 || !s1.panel) fail('snitt sattes inte med klick: ' + JSON.stringify(s1));
  const rg = await page.evaluate(() => { const e = l3bqS.rings[0], b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, disp: e.style.display, cls: e.className, left: e.style.left, top: e.style.top }; }); console.log('ring', JSON.stringify(rg));
  console.log('top el', await page.evaluate(p => { const e = document.elementFromPoint(p.x, p.y); return e ? e.tagName + '.' + e.className + '#' + e.id + ' txt=' + (e.textContent || '').slice(0, 40) + ' parent=' + e.parentElement.className + '#' + e.parentElement.id : null; }, rg)); await page.mouse.move(rg.x, rg.y); await page.mouse.down(); console.log('drag state', await page.evaluate(() => JSON.stringify(l3bqS.drag))); await page.mouse.move(rg.x + 40, rg.y, { steps: 5 }); console.log('mid', await page.evaluate(() => JSON.stringify(l3bqS.cuts))); await page.mouse.up();
  const dbg = await page.evaluate((p) => { const el = document.elementFromPoint(p.x, p.y); return { tag: el && el.className, drag: !!l3bqS.drag }; }, rg); console.log('under musen:', JSON.stringify(dbg));
  const s2 = await page.evaluate(() => l3bqS.cuts.slice()); console.log('dragen:', JSON.stringify(s2));
  if (s2.length !== 1 || Math.abs(s2[0] - s1.cuts[0]) < 0.05) fail('ringen gick inte att dra: ' + JSON.stringify([s1.cuts, s2]));
  await page.evaluate(() => l3bqS.plus[0].click());
  const s3 = await page.evaluate(() => l3bqS.cuts.length); if (s3 !== 2) fail('plus lade inte till ett snitt: ' + s3);
  const r = await page.evaluate(() => { l3bqCutGo(); const made = placements.filter(q => /Bergsmur \d\/3/.test(q.name || '')), v = made.map(q => Math.abs(modMeshStats(q.m.pts, q.m.faces).volume)); return { n: made.length, sum: v.reduce((a, b) => a + b, 0), closed: made.every(q => q.m.closed), ui: !document.querySelector('.v3-bqpanel') && !l3bqS.rings.length }; });
  console.log(JSON.stringify(r));
  if (r.n !== 3 || Math.abs(r.sum - setup.vol0) > 0.05 || !r.closed || !r.ui) fail('delning vid placerade snitt fel: ' + JSON.stringify(r));
  // lika långa bitar via egenskapspanelen (6 m)
  const r2 = await page.evaluate(() => { const p = placements.filter(q => /Bergsmur \d\/3/.test(q.name || ''))[2]; const made = l3bqRun(p, { mode: 'length', value: 3 }); return { n: made ? made.length : 0 }; });
  if (r2.n < 2) fail('delning efter längd misslyckades');
  console.log('OK: IFC-objekt blir redigerbara, snitt placeras med klick/ringar/plus, delning ger rätt volym och gjutformen följer den bergsanpassade muren');
  if (errors.length) fail('sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
