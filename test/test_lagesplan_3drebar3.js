const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9021;
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
  // Markera, flytta, ta bort, ångra (Victor 2026-11-01).
  await page.evaluate(() => { l3rb.sel = l3rbSelection(); l3rb.shape = 'R'; l3rb.cur.d = 12; l3rbPlaceGroup(); l3rbPlaceGroup(); l3rbSetPick(null); });
  const scr = () => page.evaluate(() => { const set = l3rb.sets.find(s => s.id === l3rb.active), g = set.groups[0], b = l3rbExpandGroup(g)[0], m = Math.floor(b.pts.length / 2), p = b.pts[0], q = b.pts[b.pts.length - 1], v = new THREE.Vector3((p[0] + q[0]) / 2 - l3.O[0], (p[1] + q[1]) / 2 - l3.O[1], (p[2] + q[2]) / 2 - l3.O[2]).project(l3.camera), r = l3.renderer.domElement.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, g: g.id, n: set.groups.length, o: g.origin.slice() }; });
  await page.evaluate(() => { const set = l3rb.sets.find(s => s.id === l3rb.active), g = set.groups[0]; l3rbFitGroup(g, set.obb); l3rbTouch(set); l3.orbit.target.set(10, 10, 1); l3.camera.position.set(10, 4, 12); l3.camera.lookAt(l3.orbit.target); l3.camera.updateMatrixWorld(true); l3.camera.updateProjectionMatrix && l3.camera.updateProjectionMatrix(); l3Render(); });
  let s0 = await scr();
  await page.mouse.click(s0.x, s0.y); await page.waitForTimeout(150);
  const P1 = await page.evaluate(() => ({ pick: l3rb.pick && l3rb.pick.gid, hl: !!l3rb.hl, txt: /Markerat: Stavgrupp/.test(document.getElementById('v3Rb').textContent) }));
  if (process.env.DBG) console.log(JSON.stringify(s0), await page.evaluate(([x, y]) => ({ el: String(document.elementFromPoint(x, y)), hit: l3rbPickAt(x, y), cam: l3.camera.position.toArray(), listen: !!l3rb.el }), [s0.x, s0.y]));
  if (!P1.pick || !P1.hl || !P1.txt) fail('Markera i 3D: ' + JSON.stringify(P1));
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('PageUp'); await page.waitForTimeout(100);
  const s1 = await scr(); const moved = Math.hypot(s1.o[0] - s0.o[0], s1.o[1] - s0.o[1]) > 0.005 && s1.o[2] - s0.o[2] > 0.005;
  if (!moved) fail('Flytta med pilar: ' + JSON.stringify([s0.o, s1.o]));
  await page.keyboard.press('Delete'); await page.waitForTimeout(100);
  const D = await page.evaluate(() => { const set = l3rb.sets.find(s => s.id === l3rb.active); return { n: set.groups.length, pick: l3rb.pick, hist: l3rb.hist.length }; });
  if (D.n !== 1 || D.pick) fail('Delete: ' + JSON.stringify(D));
  await page.keyboard.press('Control+z'); await page.waitForTimeout(100);
  const U = await page.evaluate(() => l3rb.sets.find(s => s.id === l3rb.active).groups.length);
  if (U !== 2) fail('Ångra: ' + U);
  // enskild manuell stav + autoarmering
  const M = await page.evaluate(() => { const r = l3rbFromSelection(l3rb.sel[0]); l3rb.sets.push(r.set); l3rbDraw(); const w = l3rbSetWorld(r.set)[0], p = w.w[0], v = new THREE.Vector3(p[0] - l3.O[0], p[1] - l3.O[1], p[2] - l3.O[2]).project(l3.camera); const hit = l3rbPickAt(l3.renderer.domElement.getBoundingClientRect().left + (v.x + 1) / 2 * l3.renderer.domElement.clientWidth, l3.renderer.domElement.getBoundingClientRect().top + (1 - v.y) / 2 * l3.renderer.domElement.clientHeight); l3rbSetPick(hit); const I = l3rbPickInfo(); const auto = I && I.kind; l3rbPickDelete(); const still = r.set.kind; l3rbFreeze(r.set); const n0 = r.set.bars.length; l3rbSetPick({ setId: r.set.id, bi: 0 }); l3rbPickDelete(); return { auto, still, n0, n1: r.set.bars.length }; });
  if (M.auto !== 'auto' || M.still !== 'auto' || M.n1 !== M.n0 - 1) fail('Enskilda stavar: ' + JSON.stringify(M));
  await page.evaluate(() => l3rbUndo());
  const back = await page.evaluate(() => l3rb.sets.some(s => s.kind === 'manual' && s.bars.length > 1));
  if (!back) fail('Ångra stav');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3drebar3');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
