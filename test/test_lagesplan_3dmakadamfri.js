const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9352;
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

  const files = new Map();   // projektets "GitHub": sökväg -> base64
  const route = async pg => {
    await pg.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
    await pg.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
    await pg.route('https://api.github.com/**', r => {
      const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
      if (req.method() === 'GET') { const b = files.get(f); if (b == null) return r.fulfill({ status: 404, body: '{}' }); if (/raw/.test(req.headers()['accept'] || '')) return r.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(b, 'base64') }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: b, sha: 's' + b.length, size: b.length }) }); }
      const body = JSON.parse(req.postData()); files.set(f, body.content); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + body.content.length } }) });
    });
  };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage(); await require('./_dialogs').bridge(page, d => d.accept());
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const openEditor = async pg => {
    await route(pg); await pg.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await pg.waitForTimeout(900);
    await pg.evaluate(async () => { plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[169000, 7456000, 400], [169100, 7456000, 400]], pdf: [[0, 0], [1000, 0]] }, zones: [] }]; pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A'); });
    await pg.click('#btn3d'); await pg.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3bubPanel === 'function', null, { timeout: 15000 });
    await pg.evaluate(() => l3dkToggle(true));
  };
  await openEditor(page);
  const ok = (c, m) => { if (!c) fail(m); };
  const r = await page.evaluate(async () => {
    const O = l3.O, out = {}, X = O[0] + 60, Y = O[1] + 60;
    // slänt: höjden stiger 1,5 m över 12 m i x; ojämn kontur med ett hörn inåt; ett avdrag (låda) mitt i
    const q = placeNew('sm:makadamfri', [X, Y, 0]); q.H = 0.3; q.f = { lage: 'lutande' };
    q.pts = [[X, Y, 0], [X + 12, Y, 1.5], [X + 12, Y + 6, 1.5], [X + 7, Y + 6, 0.9], [X + 7, Y + 10, 0.9], [X, Y + 10, 0]]; placements.push(q); placeTouch(q);
    const f = placeNew('lada', [X + 3, Y + 3, 0.2]); f.L = 2; f.B = 2; f.H = 1.2; f.z = 0.4; placements.push(f); placeTouch(f);
    out.plane = mkPlane(q); out.base = mkBase(q);
    const sh = mkShape(q); out.net = sh.net; out.gross = sh.gross; out.cuts = sh.cuts.length; out.holes = sh.mp.reduce((a, pg) => a + pg.length - 1, 0);
    l3RebuildOne(q); l3Render();
    const g = l3.placeMeshes.get(q.id); let tris = 0, meshes = 0, zmin = 1e9, zmax = -1e9; g.traverse(o => { if (o.isMesh && o.geometry && o.geometry.getAttribute('position') && !o.userData.noHit) { meshes++; const ps = o.geometry.getAttribute('position'); tris += (o.geometry.index ? o.geometry.index.count : ps.count) / 3; for (let i = 0; i < ps.count; i++) { const z = ps.getZ(i); if (z < zmin) zmin = z; if (z > zmax) zmax = z; } } });
    out.meshes = meshes; out.tris = Math.round(tris); out.zspan = Math.round((zmax - zmin) * 100) / 100;
    const bb = new THREE.Box3().setFromObject(g); out.box = [bb.min.toArray().map(Math.round), bb.max.toArray().map(Math.round)]; out.vis = g.visible; out.cam = l3.camera.position.toArray().map(Math.round); out.q = [q.x - O[0], q.y - O[1]];
    const c0 = bb.getCenter(new THREE.Vector3()); l3FlyTo(c0, 22, new THREE.Vector3(0.4, -1, 0.9), 0); l3Render(); await new Promise(r => setTimeout(r, 2500)); l3Render();
    return out;
  });
  console.log(JSON.stringify(r));
  await page.screenshot({ path: '/tmp/mkf.png' });
  ok(r.cuts === 1 && r.holes === 1 && Math.abs(r.net - (r.gross - 4)) < 0.01, 'Avdraget blir ett hål: ' + JSON.stringify(r));
  ok(Math.abs(r.plane.gx - 0.125) < 0.02, 'Lutande plan följer punkterna: ' + JSON.stringify(r.plane));
  ok(r.meshes >= 1 && r.meshes <= 12 && r.tris > 20 && r.tris < 2000, 'Makadamen är en sammanhängande yta (inte remsor): ' + r.meshes + ' / ' + r.tris);
  ok(r.zspan > 1.5, 'Lagret följer slänten: ' + r.zspan);
  ok(!errors.length, 'JS-fel: ' + errors.join(' | '));
  await browser.close(); server.close(); console.log('OK test_lagesplan_3dmakadamfri');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
