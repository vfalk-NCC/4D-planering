const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9091;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ scale: s, width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
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
  // Fiktivt IFC-element (platta 10 x 4 x 0,25 m, vriden 30°)
  await page.evaluate(() => {
    const O = l3.O, a = 30 * Math.PI / 180, pos = [], P = [[0, 0], [10, 0], [10, 4], [0, 4]]; [0, 0.25].forEach(z => P.forEach(([x, y]) => pos.push(10 + (x - 5) * Math.cos(a) - (y - 2) * Math.sin(a), 10 + (x - 5) * Math.sin(a) + (y - 2) * Math.cos(a), z + 1)));
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial()); mesh.userData.l3b = { ranges: [{ start: 0, count: 8, name: 'Platta A', cls: 'IFCSLAB', guid: 'g1' }] }; l3.scene.add(mesh); l3bs.sel = [{ mesh, ri: 0, key: 'k' }];
    l3rbToggle(true);
  });
  await page.waitForTimeout(200);
  const A = await page.evaluate(async () => {
    const o = {}; const near = (a, b, t = 0.005) => Math.abs(a - b) <= t;
    // 1. formbiblioteket
    const ids = l3rbShapeList().map(s => s.id); o.shapes = ids.length; const bad = []; ids.forEach(id => { const d = l3rbShapeDef(id), i = l3rbShapeInfo(id, null, 12); if (!i || !(i.cut > 0.1)) bad.push(id); }); o.bad = bad;
    const iL = l3rbShapeInfo('L', { A: 1200, B: 400 }, 12); o.L = [Math.round(iL.cut * 10000) / 10000, iL.bends]; const iR = l3rbShapeInfo('R', { A: 3000 }, 12); o.R = iR.cut; const iB = l3rbShapeInfo('B', { A: 250, B: 450 }, 10); o.B = [Math.round(iB.cut * 100) / 100, iB.bends];
    o.U = l3rbShapeInfo('U', null, 12).bends; o.K = l3rbShapeInfo('K', null, 12).bends; o.Z = l3rbShapeInfo('Z', null, 12).bends; o.H = l3rbShapeInfo('H', null, 12).bends;
    // 2. egen form via editorn
    l3rb.ed = { name: 'Min L', segs: [{ len: 1200, turn: 90 }, { len: 400, turn: 0 }] }; document.querySelector('#v3Rb [data-rb2="edsave"]') || l3rbRender(); document.querySelector('#v3Rb [data-rb2="edsave"]').click(); const cs = l3rbCustom(); o.custom = cs.length; const iC = l3rbShapeInfo(cs[0].id, null, 12); o.customCut = near(iC.cut, iL.cut, 1e-6); o.customLetters = l3rbShapeDef(cs[0].id).letters.join('');
    // 3. lägg stavgrupp (rak stång) i elementet och passa in
    l3rb.sel = l3rbSelection(); l3rb.shape = 'R'; l3rb.cur.d = 12; l3rbPlaceGroup(); const set = l3rb.sets.find(s => s.id === l3rb.active), g = set.groups[0]; o.groups = set.groups.length; o.handles = (l3rb.hMeshes || []).map(h => h.userData.h.kind).join(',');
    l3rbFitGroup(g, set.obb); o.A = g.dims.A; o.len = g.dist.len; o.count = l3rbGroupCount(g); o.cc = l3rbGroupSpacing(g);
    g.cover.end = 50; l3rbFitGroup(g, set.obb); o.A2 = g.dims.A; const ex = l3rbExpandGroup(g); o.expanded = ex.length; o.exLen = near(ex[0].len, g.dims.A / 1000, 1e-6);
    // alla kopior ligger inom elementets låda
    let out = 0; ex.forEach(b => b.pts.forEach(p => { const q = l3rbToLocal(set.obb, p); if (q[0] < -0.001 || q[0] > set.obb.L + 0.001 || q[1] < -0.001 || q[1] > set.obb.B + 0.001 || q[2] < -0.001 || q[2] > set.obb.H + 0.001) out++; })); o.outside = out;
    // täckskikt: fäst
    const cov = { top: 35, bot: 35, side: 35, end: 35 }; const sn = l3rbSnapCover(set.obb, l3rbWorld(set.obb, 0.045, 1.0, 0.03), 12, cov); const q = l3rbToLocal(set.obb, sn.p); o.snap = [Math.round(q[0] * 1000) / 1000, Math.round(q[2] * 1000) / 1000, sn.snapped.length];
    const far = l3rbSnapCover(set.obb, l3rbWorld(set.obb, 0.5, 1.0, 0.12), 12, cov); o.noSnap = far.snapped.length;
    // panelen visar gruppen och täckskikten
    o.ui = /Stavgrupper \(1\)/.test(document.getElementById('v3Rb').textContent) && !!document.querySelector('#v3Rb [data-rb2g="cov_bot"]');
    o.gid = g.id; return o;
  });
  if (A.shapes < 14 || A.bad.length) fail('Formbiblioteket: ' + JSON.stringify(A));
  if (Math.abs(A.L[0] - 1.5871) > 0.002 || A.L[1] !== 1 || A.R !== 3 || A.B[1] < 3 || A.B[0] < 1.4 || A.B[0] > 2.0 || A.U !== 2 || A.K !== 3 || A.Z !== 2 || A.H !== 1) fail('Utvecklade längder/böjar: ' + JSON.stringify(A));
  if (A.custom !== 1 || !A.customCut || A.customLetters !== 'AB') fail('Egen form: ' + JSON.stringify(A));
  if (A.groups !== 1 || !/origin/.test(A.handles) || !/dist/.test(A.handles)) fail('Stavgrupp och handtag: ' + JSON.stringify(A));
  if (Math.abs(A.A - 9918) > 2 || A.A2 >= A.A - 20 || A.count < 20 || A.outside || A.expanded !== A.count) fail('Passa in mot täckskikt: ' + JSON.stringify(A));
  if (A.snap[0] !== 0.041 || A.snap[1] !== 0.041 || A.snap[2] !== 2 || A.noSnap !== 0 || !A.ui) fail('Fäst mot täckskikt: ' + JSON.stringify(A));
  console.log('OK: armering v2 – formbibliotek, egen form, stavgrupp, passa in, täckskikt', JSON.stringify(A));
  // 4. dra handtag med musen (uppifrån)
  await page.evaluate(() => { const set = l3rb.sets.find(s => s.id === l3rb.active), o = set.obb, O = l3.O; l3.camera.position.set(o.cx - O[0], o.cy - O[1], 40); l3.camera.up.set(0, 1, 0); l3.orbit.target.set(o.cx - O[0], o.cy - O[1], 0); l3.camera.lookAt(l3.orbit.target); l3.camera.updateMatrixWorld(); l3.camera.updateProjectionMatrix(); l3.orbit.update(); l3.O = l3.O; l3rbHandles(); l3Render(); });
  const scr = kind => page.evaluate(k => { const h = l3rb.hMeshes.find(m => m.userData.h.kind === k); if (!h) return null; const v = h.position.clone().project(l3.camera), r = l3.renderer.domElement.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; }, kind);
  const ppm = await page.evaluate(() => { const r = l3.renderer.domElement.getBoundingClientRect(), a = new THREE.Vector3(0, 0, 0).project(l3.camera), b = new THREE.Vector3(1, 0, 0).project(l3.camera); return Math.abs(b.x - a.x) / 2 * r.width; });
  const drag = async (kind, dx, dy, shift) => { const p = await scr(kind); await page.mouse.move(p[0], p[1]); await page.mouse.down(); await page.mouse.move(p[0] + dx / 2, p[1] + dy / 2, { steps: 3 }); await page.mouse.move(p[0] + dx, p[1] + dy, { steps: 3 }); await page.mouse.up(); await page.waitForTimeout(120); };
  const state = () => page.evaluate(() => { const set = l3rb.sets.find(s => s.id === l3rb.active), g = set.groups[0], q = l3rbToLocal(set.obb, g.origin); return { o: g.origin.slice(), loc: q.map(v => Math.round(v * 1000) / 1000), len: g.dist.len, A: g.dims.A }; });
  const s0 = await state();
  await drag('origin', 0.02 * ppm, 0);                    // 2 cm – hamnar i täckskiktet (fäster)
  const s1 = await state(); await drag('origin', 0.4 * ppm, 0.1 * ppm); const s2 = await state();
  const moved1 = Math.hypot(s1.o[0] - s0.o[0], s1.o[1] - s0.o[1]), moved2 = Math.hypot(s2.o[0] - s1.o[0], s2.o[1] - s1.o[1]);
  if (moved1 > 0.005 || moved2 < 0.25) fail('Dra insättningspunkten (fäster inom täckskiktet, släpper längre bort): ' + JSON.stringify({ s0, s1, s2, moved1, moved2 }));
  await page.evaluate(() => { const set = l3rb.sets.find(s => s.id === l3rb.active); l3rbFitGroup(set.groups[0], set.obb); l3rbTouch(set); l3rbRender(); });
  const d0 = (await state()).len; await drag('dist', 0, 0); const dpos = await scr('dist'); await page.mouse.move(dpos[0], dpos[1]); await page.mouse.down(); await page.mouse.move(dpos[0] + 20, dpos[1] - 0.5 * ppm, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(100); const d1 = (await state()).len;
  if (!(Math.abs(d1 - d0) > 0.1)) fail('Dra fördelningens slut: ' + JSON.stringify({ d0, d1 }));
  // vinkelhake: dra hörnet och se måttet A ändras
  await page.evaluate(() => { const set = l3rb.sets.find(s => s.id === l3rb.active); const g = set.groups[0]; g.shape = 'L'; g.dims = { A: 1200, B: 400 }; g.tilt = 90; g.dist = { mode: 'cc', cc: 150, n: 1, len: 0, dir: 'y' }; l3rbTouch(set); l3rbRender(); });
  const verts = await page.evaluate(() => l3rb.hMeshes.filter(m => m.userData.h.kind === 'vert').length);
  const before = (await state()).A; const vp = await page.evaluate(() => { const h = l3rb.hMeshes.find(m => m.userData.h.kind === 'vert' && m.userData.h.letter === 'A'); const v = h.position.clone().project(l3.camera), r = l3.renderer.domElement.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; });
  await page.mouse.move(vp[0], vp[1]); await page.mouse.down(); await page.mouse.move(vp[0] + 0.1 * ppm, vp[1] + 0.05 * ppm, { steps: 4 }); await page.mouse.move(vp[0] + 0.3 * ppm, vp[1] + 0.15 * ppm, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(100); const after = (await state()).A;
  if (verts < 1 || Math.abs(after - before) < 50) fail('Dra formens hörn ändrar måttet: ' + JSON.stringify({ verts, before, after }));
  console.log('OK: armering v2 – handtag: insättningspunkt (fäster mot täckskikt), fördelning och formens hörn', JSON.stringify({ moved1, moved2, d0, d1, verts, before, after }));
  // 5. export
  const X = await page.evaluate(() => {
    const o = {}; const set = l3rb.sets.find(s => s.id === l3rb.active); const g = set.groups[0]; g.shape = 'B'; g.dims = { A: 250, B: 450 }; g.d = 10; g.tilt = 0; g.dist = { mode: 'cc', cc: 200, n: 1, len: 2, dir: 'n' }; l3rbTouch(set);
    const gen = l3rbFromSelection(l3rb.sel[0]); l3rb.sets.push(gen.set); const sets = l3rb.sets;
    const r = l3rbIfcBuild(sets, 't.ifc'); o.ifc = !!r && /IFCREINFORCINGBAR/.test(r.text) && /IFCSWEPTDISKSOLID/.test(r.text) && /B500B/.test(r.text) && r.text.trim().endsWith('END-ISO-10303-21;'); o.ifcN = r && r.n; o.lig = r && /\.LIGATURE\./.test(r.text); o.pset = r && /Armering/.test(r.text);
    const html = l3rbHtmlText(sets); o.html = /Armeringsförteckning/.test(html) && /<svg/.test(html) && /experimentell|Experimentell/.test(html); const csv = l3rbCsvText(sets); o.csv = /Mått mm/.test(csv) && /A250 B450/.test(csv);
    const sm = l3rbSummary(l3rbSetBars(set)); o.rows = sm.rows.map(r => r.code + ':' + r.dims + ':' + r.n).join('|');
    return o;
  });
  if (!X.ifc || !X.lig || !X.pset || X.ifcN < 20 || !X.html || !X.csv) fail('Export: ' + JSON.stringify(X));
  console.log('OK: armering v2 – export (IFC, förteckning, CSV)', JSON.stringify(X));
  if (process.env.SHOT) { await page.evaluate(() => { const set = l3rb.sets.find(s => s.id === l3rb.active); const g = set.groups[0]; g.shape = 'R'; g.dims = { A: 3000 }; g.d = 12; g.tilt = 90; g.dist = { mode: 'cc', cc: 150, n: 1, len: 2, dir: 'y' }; l3rbFitGroup(g, set.obb); l3rbTouch(set); const o = set.obb, O = l3.O; l3.camera.position.set(o.cx - O[0] + 5, o.cy - O[1] - 9, 8); l3.orbit.target.set(o.cx - O[0], o.cy - O[1], 0); l3.camera.lookAt(l3.orbit.target); l3.orbit.update(); l3rbRender(); l3Render(); }); await page.waitForTimeout(500); await page.screenshot({ path: process.env.SHOT }); }
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
