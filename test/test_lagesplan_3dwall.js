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
    l3SetPref('measure', 'wall'); const O = l3.O, V = (x, y, z) => new THREE.Vector3(x, y, z);
    const out = {};
    l3t.mp = [V(5, 5, 10), V(11, 5, 10), V(11, 9, 10.5)];   // 6 m + 4 m, 90° hörn
    l3swStart(); const c = l3sw.cur; out.panel = !!document.getElementById('v3WallPanel'); out.kind = c.spec.kind; out.typ = c.spec.typ; out.nL = c.res.parts.length;
    const P = l3swProfile(c.spec), A = Math.abs(l3swArea(P)); out.area = A; out.volL = c.res.parts.reduce((a, p) => a + p.vol, 0); out.expL = A * (6 + 4) - 0 /* fogar (0,01 m) ger lite mindre */;
    out.grp = !!l3.groups.wall && l3.groups.wall.children.length;
    l3swMake(); out.made = placements.filter(p => /L-stöd/.test(p.name || '')).length; out.ifc = placements.filter(p => /L-stöd/.test(p.name || '')).every(p => p.m.ifc === 'IFCWALL' && p.m.closed);
    const ifcText = buildPlacementsIfc('T', new Set(placements.filter(p => /L-stöd/.test(p.name || '')).map(p => p.id)));
    out.ifcWall = ifcText ? (ifcText.text.match(/IFCWALL\(/g) || []).length : 0;
    // gjuten mur sammanhängande
    l3t.mp = [V(5, 5, 10), V(11, 5, 10), V(11, 9, 10.5)]; l3swStart(); l3sw.cur.spec.kind = 'cast'; l3sw.cur.spec.H = 2.4; l3swDraw();
    const rc = l3sw.cur.res; out.nCast = rc.parts.length; const Ac = Math.abs(l3swArea(l3swProfile(l3sw.cur.spec))); out.volCast = rc.parts[0].vol; out.expCast = Ac * 10;
    l3swMake(); out.castObj = placements.filter(p => /Stödmur/.test(p.name || '')).length;
    // egen murtyp sparas och används
    l3t.mp = [V(5, 5, 10), V(9, 5, 10)]; l3swStart(); l3SetPref('wallTypes', [{ id: 'u:t1', name: 'Test 1,0', maker: 'Test', kind: 'L', H: 1.0, t: 0.1, bt: 0.1, tl: 0.2, hl: 0.5, len: 1.0 }]); l3swApplyType(l3sw.cur.spec, l3swType('u:t1')); l3swDraw();
    out.custom = l3sw.cur.res.parts.length; l3swClose();
    return out;
  });
  console.log(JSON.stringify(r));
  if (!r.panel || r.kind !== 'L' || r.nL !== 5 || !(r.volL > r.expL * 0.97 && r.volL <= r.expL + 0.001) || !r.grp) fail('L-stöd längs fotlinjen: ' + JSON.stringify(r));
  if (r.made !== 5 || !r.ifc || r.ifcWall !== 5) fail('objekt/IFC för L-stöd: ' + JSON.stringify(r));
  if (r.nCast !== 1 || Math.abs(r.volCast - r.expCast) / r.expCast > 0.1 || r.castObj !== 1) fail('gjuten mur: ' + JSON.stringify(r));
  if (r.custom !== 4) fail('egen murtyp (1,0 m element på 4 m): ' + JSON.stringify(r));
  // Trappa vid: höjdskillnad som krävs för ett nytt steg
  const ST = await page.evaluate(() => { const V = (x, y, z) => new THREE.Vector3(x, y, z); const zs = spec => { const pts = [[5, 5, 10], [15, 5, 11]], r = l3swBuild(pts, { ...L3SW_DEF, ...spec }); return [...new Set(r.parts.map(p => Math.round(Math.min(...p.mesh.pts.map(q => q[2])) * 100) / 100))].length; };
    return { each: zs({ step: true, stepMin: 0 }), half: zs({ step: true, stepMin: 0.5 }), big: zs({ step: true, stepMin: 5 }), slope: zs({ step: false }) }; });
  console.log('trappning:', JSON.stringify(ST));
  if (!(ST.each === 5 && ST.half < ST.each && ST.half >= 2 && ST.big === 1 && ST.slope === 5)) fail('Trappa vid (höjdskillnad): ' + JSON.stringify(ST));
  // Dragbara punkter + plus (som byggvägen)
  const D0 = await page.evaluate(() => { const V = (x, y, z) => new THREE.Vector3(x, y, z); l3SetPref('measure', 'wall'); l3t.mp = [V(5, 5, 0), V(11, 5, 0)]; l3swStart(); const c = new THREE.Vector3(8, 5, 0); l3.camera.position.set(c.x, c.y - 16, c.z + 14); l3.camera.lookAt(c); if (l3.controls) { l3.controls.target.copy(c); l3.controls.update(); } l3.camera.updateMatrixWorld(true); l3Render(); const tt = document.getElementById('v3Toast'); if (tt) tt.style.display = 'none'; return { rings: l3swH.rings.length, plus: l3swH.plus.length, pts: l3sw.cur.pts.map(p => p.slice()) }; });
  await page.waitForTimeout(600);
  console.log('punkter:', JSON.stringify(D0));
  if (D0.rings !== 2 || D0.plus !== 1) fail('ringar/plus saknas: ' + JSON.stringify(D0));
  const pl = await page.evaluate(() => { l3swPlace(); const b = l3swH.plus[0].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, shown: l3swH.plus[0].style.display }; });
  await page.mouse.move(pl.x, pl.y); await page.mouse.down(); await page.mouse.move(pl.x, pl.y + 60, { steps: 6 }); await page.mouse.up();
  const D1 = await page.evaluate(() => ({ n: l3sw.cur.pts.length, pts: l3sw.cur.pts.map(p => p.slice()), rings: l3swH.rings.length }));
  console.log('efter plus+drag:', JSON.stringify(D1));
  if (D1.n !== 3 || D1.rings !== 3 || Math.abs(D1.pts[1][1] - 5) < 0.3) fail('plus + dra lade inte till/flyttade punkten: ' + JSON.stringify([D0.pts, D1.pts]));
  await page.evaluate(() => l3swRemove(1)); const D2 = await page.evaluate(() => ({ n: l3sw.cur.pts.length, rings: l3swH.rings.length })); if (D2.n !== 2 || D2.rings !== 2) fail('ta bort punkt: ' + JSON.stringify(D2));
  await page.evaluate(() => l3swClose()); if (await page.evaluate(() => document.querySelectorAll('.v3-mhandle').length)) fail('ringar ska städas när muren stängs');
  console.log('OK: stödmur – L-stöd element för element, gjuten mur sammanhängande, volym stämmer, IFCWALL, egna murtyper');
  if (errors.length) fail('sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
