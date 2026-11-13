// Polylinjemått: summan ligger vid sidan av linjen och täcker inte delmåtten
// (mall: pcslice): en LAS-fil per zon/överzon och en fil för det som ligger utanför, samlade i en ZIP.
// cachen sparas en ruta åt gången och läses tillbaka identiskt, bygget görs i delar utan att blockera, inläsningen kan avbrytas
// och en läsare som slutar svara avbryts av ett hängskydd, och molnen delar på ett gemensamt punkttak.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9194;
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
    const R = await page.evaluate(async () => { const O = l3.O, c = new THREE.Vector3(637050 - O[0], 849020 - O[1], 100 - O[2]); l3.camera.position.set(c.x, c.y - 0.01, c.z + 40); l3.orbit.target.copy(c); l3.camera.lookAt(c); l3.orbit.update && l3.orbit.update(); l3Render();
      const pts = [[0, 0, 0], [8, 0, 0], [16, 0, 0], [24, 0, 0]].map(p => new THREE.Vector3(c.x + p[0] - 12, c.y + p[1], c.z + p[2])); l3mAdd('poly', pts, '24 m', []); l3mPlaceLabels(); await new Promise(r => setTimeout(r, 300)); l3mPlaceLabels();
      const els = [...document.querySelectorAll('#v3Canvas .v3-meas')].map(e => ({ t: e.textContent.replace(/✕|×/g, '').trim(), tot: e.classList.contains('tot'), x: parseFloat(e.style.left), y: parseFloat(e.style.top) }));
      return els; });
    const tot = R.find(e => e.tot), segs = R.filter(e => !e.tot && Number.isFinite(e.x));
    if (!tot || segs.length < 3) fail('Totalmått + delmått finns: ' + JSON.stringify(R));
    const dmin = Math.min(...segs.map(e => Math.hypot(e.x - tot.x, e.y - tot.y)));
    if (!(dmin >= 25)) fail('Summan ska ligga vid sidan av delmåtten (>= 25 px): ' + JSON.stringify([dmin, R]));
    console.log('OK: polylinjens summa dras ut åt sidan och täcker inte delmåtten', JSON.stringify({ dmin: Math.round(dmin), n: R.length }));
  } catch (e) { console.error('FEL:', e.message); process.exitCode = 1; }
  finally { await browser.close(); server.close(); }
})();