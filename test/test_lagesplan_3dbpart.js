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
  const r = await page.evaluate(async () => {
    // Bergsanpassad mur: 30 m lång, 0,4 m tjock, överkant 4 m, underkant i trappsteg (berget) – byggd som IFC-objekt (l3b-mesh)
    const O = l3.O, x0 = O[0] + 5, y0 = O[1] + 5, z0 = O[2] + 10, L = 30, T = 0.4, bot = x => (x < 10 ? 0 : x < 20 ? 0.8 : 1.6), top = 4;
    const xs = [0, 10, 20, 30]; const P = [], idx = [];
    const v = (x, y, z) => { P.push(x0 - O[0] + x, y0 - O[1] + y, z0 - O[2] + z); return P.length / 3 - 1; };
    // profil i xz (underkant trappsteg) som polygon, extruderad i y
    const prof = [[0, 0], [10, 0], [10, 0.8], [20, 0.8], [20, 1.6], [30, 1.6], [30, top], [0, top]];
    const A = prof.map(p => v(p[0], 0, p[1])), B = prof.map(p => v(p[0], T, p[1]));
    // sidor
    for (let i = 0; i < prof.length; i++) { const j = (i + 1) % prof.length; idx.push(A[i], A[j], B[j], A[i], B[j], B[i]); }
    // lock: fan (profilen är konvex-ish nog? triangulera med ShapeUtils)
    const tri = THREE.ShapeUtils.triangulateShape(prof.map(p => new THREE.Vector2(p[0], p[1])), []);
    tri.forEach(f => { idx.push(A[f[0]], A[f[2]], A[f[1]]); idx.push(B[f[0]], B[f[1]], B[f[2]]); });
    const pos = new Float32Array(P), col = new Uint8Array(P.length).fill(160), ranges = [{ start: 0, count: P.length / 3, idxStart: 0, idxCount: idx.length, guid: 'WALL1', name: 'Bergsmur' }];
    const model = { id: 'mm', name: 'M', meshes: [], ranges: [], visible: true, tris: 0 }; l3b.models.push(model);
    const mesh = l3bMeshFromArrays(pos, col, new Uint32Array(idx), ranges, model); model.meshes.push(mesh); model.ranges.push(...mesh.userData.l3b.ranges); l3.groups.bldg.add(mesh); mesh.updateMatrixWorld(true);
    l3bsSet([{ mesh, ri: 0 }]);
    const n0 = placements.length, ids = l3bqMake(); const p = placements.find(q => q.id === ids[0]);
    const st0 = modMeshStats(p.m.pts, p.m.faces);
    const made = l3bqRun(p, { mode: 'length', value: 6 });
    const vols = made ? made.map(q => modMeshStats(q.m.pts, q.m.faces).volume) : [];
    // gjutform som följer formen
    l3bsSet([{ mesh, ri: 0 }]);
    const f = l3bqFormMake(0, 0.03), fp = placements.find(q => q.id === f[0]), fs = fp ? modMeshStats(fp.m.pts, fp.m.faces) : null;
    let zmin = Infinity, zmax = -Infinity; if (fp) fp.m.pts.forEach(q => { zmin = Math.min(zmin, q[2]); zmax = Math.max(zmax, q[2]); });
    return { ids: ids.length, closed: p.m.closed, vol0: Math.abs(st0.volume), nPieces: made ? made.length : 0, volSum: vols.reduce((a, b) => a + Math.abs(b), 0), vols: vols.map(x => Math.round(Math.abs(x) * 100) / 100), closedAll: made ? made.every(q => q.m.closed) : false, form: !!fp, formArea: fp && fp.formArea, zspan: [zmin, zmax], total: placements.length - n0 };
  });
  console.log(JSON.stringify(r));
  const exp = 30 * 0.4 * 4 - 0.4 * (10 * 0.8 + 10 * 1.6);
  if (r.ids !== 1 || Math.abs(r.vol0 - exp) > 0.05) fail('IFC-objektet blev inte redigerbart / fel volym: ' + JSON.stringify(r) + ' väntat ' + exp);
  if (r.nPieces !== 5 || Math.abs(r.volSum - r.vol0) > 0.05 || !r.closedAll) fail('delningen gav fel bitar/volym: ' + JSON.stringify(r));
  if (!r.form || !(r.formArea > 100) || r.zspan[1] - r.zspan[0] < 3.5) fail('formen följer inte muren: ' + JSON.stringify(r));
  console.log('OK: IFC-objekt blir redigerbara byggdelar, delas i bitar med rätt volym och gjutformen följer den bergsanpassade muren');
  if (errors.length) fail('sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
