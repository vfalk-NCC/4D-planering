// Punktmoln → mesh (TIN/rutnät, färger, DXF/IFC)
// (mall: pcslice): en LAS-fil per zon/överzon och en fil för det som ligger utanför, samlade i en ZIP.
// cachen sparas en ruta åt gången och läses tillbaka identiskt, bygget görs i delar utan att blockera, inläsningen kan avbrytas
// och en läsare som slutar svara avbryts av ett hängskydd, och molnen delar på ett gemensamt punkttak.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9137;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => { c.fillStyle = '#fff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} }; } };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { const u = q.url.split('?')[0]; r.writeHead(200, { 'Content-Type': u.endsWith('.js') ? 'application/javascript' : u.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  try {
    const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
    await require('./_dialogs').bridge(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
    await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
    await page.evaluate(async () => { plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[637000, 849000, 400], [637100, 849000, 400]], pdf: [[0, 0], [1000, 0]] }, zones: [] }]; pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A'); open3d(); });
    await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3pcBuild === 'function', null, { timeout: 20000 });

    await page.evaluate(() => {
      plan.zones = [
        { id: 'zA', code: '7421', name: 'Förtjockardelen', parent: '742 Sikthall', polys: [[[100, 100], [300, 100], [300, 300], [100, 300]]] },
        { id: 'zB', code: '7422', name: 'Sikten', parent: '742 Sikthall', polys: [[[500, 100], [700, 100], [700, 300], [500, 300]]] },
        { id: 'zC', code: '7430', name: 'Lager', polys: [[[100, 330], [200, 330], [200, 380], [100, 380]]] }];
    });
    await page.evaluate(() => {
      const cx = 637050, cy = 849020, cz = 100, n = 2500, pos = new Float32Array(n * 3), rgb = new Uint8Array(n * 3), inten = new Uint8Array(n);
      for (let i = 0; i < n; i++) { pos.set([(i % 50) * 0.2 - 5, ((i / 50) | 0) * 0.2 - 5, 0], i * 3); rgb.set([200, 100, 50], i * 3); }
      const info = { n, total: n, center: [cx, cy, cz], min: [-5, -5, -100].map((v, k) => v + [cx, cy, cz][k]), max: [5, 5, -100].map((v, k) => v + [cx, cy, cz][k]), rgb: true, intensity: false, format: 'LAS' };
      l3pcBuild({ id: 'pc:sel', name: 'Valbart.laz' }, { info, chunks: [{ pos, rgb, inten }] });
      l3FlyTo && 0; });
    await page.evaluate(() => { const c = l3pc.clouds[0]; l3.camera.position.set(c.info.center[0] - l3.O[0], c.info.center[1] - l3.O[1] - 0.01, c.info.center[2] - l3.O[2] + 30); l3.orbit.target.set(c.info.center[0] - l3.O[0], c.info.center[1] - l3.O[1], c.info.center[2] - l3.O[2]); l3.camera.lookAt(l3.orbit.target); l3.orbit.update && l3.orbit.update(); l3Render(); });
    await page.waitForTimeout(400);
    const pt = await page.evaluate(() => { const c = l3pc.clouds[0], p = new THREE.Vector3(c.info.center[0] - l3.O[0], c.info.center[1] - l3.O[1], c.info.center[2] - l3.O[2]).project(l3.camera), r = l3.renderer.domElement.getBoundingClientRect(); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; });
    await page.mouse.click(pt[0], pt[1]); await page.waitForTimeout(500);
    const S = await page.evaluate(() => ({ sel: l3ss.sel, ring: !!l3ss.ring, side: !!document.getElementById('v3PcMesh'), row: !!document.querySelector('.v3-lr-pcsel') }));
    if (!S.sel || S.sel.kind !== 'pc' || !S.ring || !S.side) fail('Klick på molnet markerar det: ' + JSON.stringify(S));
    await page.keyboard.press('Escape'); await page.waitForTimeout(200); if (await page.evaluate(() => !!l3ss.sel)) fail('Esc avmarkerar molnet');
    console.log('OK: klick på punktmolnet markerar det (ram, sidopanel, rad i listan)', JSON.stringify(S));
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('OK test_lagesplan_pcselect');
  } catch (e) { console.error('FEL:', e.message); process.exitCode = 1; }
  finally { await browser.close(); server.close(); }
})();
