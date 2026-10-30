const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9081;
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
    const O = l3.O, A = [O[0] + 5, O[1] + 5, O[2] + 0];
    // Yta: rektangel 4 x 3 m i XY-planet; kropp: samma dragen 2 m; kurva: tre punkter
    const pl = MG.planeFrom([0, 0, 1], [0, 0, 0]);
    const face = modCreate({ k: 'face', pl, loops: [MG.rect2([0, 0], [4, 3])] }, A);
    const solid = modCreate({ k: 'solid', pl, loops: [MG.rect2([6, 0], [10, 3]), MG.circle2([8, 1.5], 0.5, 16)], d: 2, ifc: 'IFCWALL' }, A);
    const curve = modCreate({ k: 'curve', pts: [[0, 5, 0], [3, 5, 0], [3, 7, 1]] }, A);
    const parts = p => placeParts(p).length;
    const d = id => modDims(placements.find(x => x.id === id));
    window.__ids = [face.id, solid.id, curve.id];
    // yta: 12 m²; kropp: (12 − π·0,25 ≈ 11,2146) m² × 2 m; kurva ≈ 3 + √5 m
    const tri = p => { const c = modLocalMesh(p); return c.faces.length; };
    return { face: d(face.id), solid: d(solid.id), curve: d(curve.id), parts: [parts(face), parts(solid), parts(curve)], tri: [tri(face), tri(solid), tri(curve)], types: [face.type, solid.type, curve.type], meshes: [face, solid, curve].map(p => l3.placeMeshes.has(p.id)) };
  });
  console.log(JSON.stringify(r));
  const ok = (c, m) => { if (!c) fail(m); };
  ok(Math.abs(r.face.area - 12) < 1e-6 && Math.abs(r.solid.volume - (12 - Math.PI * 0.25 * 0.97) * 2) < 0.2 && Math.abs(r.curve.length - (3 + Math.sqrt(5))) < 1e-6, 'Mått: ' + JSON.stringify(r));
  ok(r.parts.every(n => n === 1) && r.meshes.every(Boolean) && r.types.join() === 'mod:yta,mod:kropp,mod:linje', 'Delar/mesher/typer');
  // Solid mesh är stängd: varje kant delas av två trianglar (hål inkluderat)
  const closed = await page.evaluate(() => { const p = placements.find(x => x.id === window.__ids[1]), c = modLocalMesh(p), E = new Map(); const q = v => v.map(x => Math.round(x * 1000)).join(','); c.faces.forEach(f => { for (let i = 0; i < 3; i++) { const a = q(c.pts[f[i] - 1]), b = q(c.pts[f[(i + 1) % 3] - 1]), k = a < b ? a + '|' + b : b + '|' + a; E.set(k, (E.get(k) || 0) + 1); } }); let bad = 0; E.forEach(n => { if (n !== 2) bad++; }); let vol = 0; c.faces.forEach(f => { const a = c.pts[f[0] - 1], b = c.pts[f[1] - 1], d = c.pts[f[2] - 1]; vol += (a[0] * (b[1] * d[2] - b[2] * d[1]) - a[1] * (b[0] * d[2] - b[2] * d[0]) + a[2] * (b[0] * d[1] - b[1] * d[0])) / 6; }); return { bad, vol }; });
  ok(closed.bad === 0 && closed.vol > 20, 'Kroppen ska vara ett stängt nät med positiv volym: ' + JSON.stringify(closed));
  // IFC: klassen följer valet, nätet och egenskaperna är med
  const ifc = await page.evaluate(() => { const r = buildPlacementsIfc('Test', null); return { wall: (r.text.match(/IFCWALL\(/g) || []).length, proxy: (r.text.match(/IFCBUILDINGELEMENTPROXY\(/g) || []).length, tri: (r.text.match(/IFCTRIANGULATEDFACESET/g) || []).length, vol: /Volym m/.test(r.text) }; });
  ok(ifc.wall === 1 && ifc.proxy === 2 && ifc.tri >= 3, 'IFC: ' + JSON.stringify(ifc));
  const dxf = await page.evaluate(() => { const t = modDxfText(placements.filter(p => p.m)); return { line: (t.match(/\nLINE\n/g) || []).length, face3d: (t.match(/3DFACE/g) || []).length }; });
  ok(dxf.line === 2 && dxf.face3d > 20, 'DXF: ' + JSON.stringify(dxf));
  // Redigera: höjden ändras, Ångra tar tillbaka
  await page.evaluate(() => { const p = placements.find(x => x.id === window.__ids[1]); modEdit(p, m => { m.d = 5; }); });
  let d5 = await page.evaluate(() => modDims(placements.find(x => x.id === window.__ids[1])).volume); ok(Math.abs(d5 - (12 - Math.PI * 0.25 * 0.97) * 5) < 0.5, 'Höjd 5: ' + d5);
  await page.evaluate(() => placeUndo()); await page.waitForTimeout(200);
  d5 = await page.evaluate(() => modDims(placements.find(x => x.id === window.__ids[1])).volume); ok(d5 < 25, 'Ångra: ' + d5);
  // Träff mot kroppens ytor: ovanifrån träffas toppen, från sidan en vägg
  const dbg = await page.evaluate(() => { const p = placements.find(x => x.id === window.__ids[1]); return { d: p.m.d, faces: modFaces(p).map(f => [f.id, f.kind, f.pl && f.pl.o, f.loops && f.loops.length]) }; }); console.log(JSON.stringify(dbg));
  const pick = await page.evaluate(() => { const p = placements.find(x => x.id === window.__ids[1]); const t = modPick(p, [7, 0.2, 10], [0, 0, -1]), s = modPick(p, [8, -5, 1], [0, 1, 0]); return { top: t && t.face.id, side: s && s.face.id, tz: t && t.p[2] }; });
  ok(pick.top === 'capd' && /^wall/.test(pick.side || ''), 'Träff: ' + JSON.stringify(pick));
  await page.screenshot({ path: '/tmp/mod1.png' });
  console.log('OK: ritade objekt – yta, kropp (med hål), kurva: mått, nät, IFC, DXF, ångra, träff');
  if (errors.length) fail('sidfel: ' + errors.slice(0, 3).join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
