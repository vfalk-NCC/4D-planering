const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9347;
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
  // Murar i flera former: Smartmått ska mäta längs ytans egna riktningar och sluta exakt där ytan slutar (urtag, sluttande överkant, skarvar), oavsett vridning.
  const res = await page.evaluate(async () => {
    const out = {}, poly = [[0, 0.5], [0, 3], [5, 3.4], [5, 1.2], [4, 1.2], [4, 0.8], [3, 0.8], [3, 0.3], [2, 0.3], [2, 0], [1, 0], [1, 0.5]];
    const extr = (pts, th) => { const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1]))), { depth: th, bevelEnabled: false }); g.rotateX(Math.PI / 2); return g; };
    const mat = () => new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    const wallAt = (id, deg, pos, parts) => { const grp = new THREE.Group(); grp.userData.placeId = id; parts.forEach(m => grp.add(m)); grp.rotation.z = deg * Math.PI / 180; grp.position.copy(pos); l3.scene.add(grp); grp.updateMatrixWorld(true); placements.push({ id, type: 'model:x', rot: 0, x: 0, y: 0, z: 0 }); l3.placeMeshes.set(id, grp); return grp; };
    const hit = (grp, deg, lx, lz, mesh) => { const a = deg * Math.PI / 180, fwd = new THREE.Vector3(Math.sin(a), -Math.cos(a), 0), loc = new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 0, 1), a).add(grp.position); const rc = new THREE.Raycaster(loc.clone().addScaledVector(fwd, -5), fwd); return rc.intersectObjects(grp.children, true)[0]; };
    const hits = (h, lbl) => { const L = l3mxLaserAt({ clientX: -9999, clientY: -9999 }, h); return L && L.hits.filter(x => x.lbl === lbl).map(x => Math.round(x.d * 100) / 100)[0]; };
    // 1) en mur i flera vinklar (rot = 0 i placeringen, vriden i geometrin)
    [0, 37, 123].forEach((deg, k) => {
      const grp = wallAt('w' + k, deg, new THREE.Vector3(30 + 10 * k, 30, 0), [new THREE.Mesh(extr(poly, 0.3), mat())]);
      out['w' + deg] = { mid: [hits(hit(grp, deg, 2.5, 1.8), 'Längd'), hits(hit(grp, deg, 2.5, 1.8), 'Höjd')], low: hits(hit(grp, deg, 1.5, 0.2), 'Längd'), right: hits(hit(grp, deg, 4.5, 2.0), 'Höjd') };
    });
    // 2) en mur byggd av fem delar med skarvar (olika höjd per del)
    const hs = [3, 3.2, 2.6, 3.4, 3];
    const parts = hs.map((h, i) => { const m = new THREE.Mesh(extr([[i, 0], [i, h], [i + 1, h], [i + 1, 0]], 0.3), mat()); return m; });
    const grp5 = wallAt('w5', 21, new THREE.Vector3(70, 30, 0), parts);
    out.parts = { len: hits(hit(grp5, 21, 2.5, 1.0), 'Längd'), h3: hits(hit(grp5, 21, 2.5, 1.0), 'Höjd'), h4: hits(hit(grp5, 21, 3.5, 1.0), 'Höjd') };
    // 3) hörn: ett mått per sida
    l3FlyTo(grp5.position.clone().add(new THREE.Vector3(2, -12, 6)), 25, grp5.position.clone().add(new THREE.Vector3(2, 0, 1.5)), 0); l3Render(); await new Promise(r => setTimeout(r, 400));
    const a = 21 * Math.PI / 180, corner = new THREE.Vector3(5, 0, 3).applyAxisAngle(new THREE.Vector3(0, 0, 1), a).add(grp5.position), cv = l3.renderer.domElement, r = cv.getBoundingClientRect(), q = l3ToScreen(corner);
    const h = hit(grp5, 21, 4.9, 2.9), L = l3mxLaserAt({ clientX: r.left + q.x + 3, clientY: r.top + q.y + 3 }, h);
    out.corner = L && { corner: L.corner, sides: L.hits.length, allSide: L.hits.every(x => x.side) };
    return out;
  });
  console.log(JSON.stringify(res));
  const near = (v, w, t = 0.03) => v != null && Math.abs(v - w) <= t;
  [0, 37, 123].forEach(d => { const r = res['w' + d]; ok(r && near(r.mid[0], 5.0, 0.03) && near(r.mid[1], 2.9, 0.03) && near(r.low, 1.0, 0.03) && near(r.right, 2.16, 0.04), 'Mur ' + d + '°: ' + JSON.stringify(r)); });
  ok(res.parts && near(res.parts.len, 5, 0.04) && near(res.parts.h3, 2.6, 0.04) && near(res.parts.h4, 3.4, 0.04), 'Mur med skarvar: ' + JSON.stringify(res.parts));
  ok(res.corner && res.corner.corner && res.corner.allSide && res.corner.sides >= 3, 'Hörn ger sidomått: ' + JSON.stringify(res.corner));
  ok(!errors.length, 'JS-fel: ' + errors.join(' | '));
  await browser.close(); server.close(); console.log('OK test_lagesplan_3dmxface');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
