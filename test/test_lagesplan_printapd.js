// Utskriftslayoutens verktyg (Victor 2026-10-08): tom färg = "ingen", högerklicksmeny, fördela jämnt,
// kopiera/klistra stil, ruta/linje (rundade hörn, streckad, genomskinlig) m.m.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9301;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  try {
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    await require('./_dialogs').bridge(page, d => d.accept()); // appens egna dialogrutor
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error("x")) }) };' }));
    await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(800);
    await page.evaluate(async () => {
      viewport = { transform: [1, 0, 0, 1, 0, 0], width: 1000, height: 800, convertToPdfPoint: (x, y) => [x, y], convertToViewportPoint: (x, y) => [x, y] };
      plan = { id: 'pl', name: 'P', zones: [], photos: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } };
      await openPrint();
      pr.tpl.elements = [];
      [[20, 'a'], [70, 'b'], [200, 'c']].forEach(([x, id]) => pr.tpl.elements.push({ id, type: 'rect', x, y: 30, w: 20, h: 10, stroke: '#000000', fill: '', lw: 0.35 }));
      pr.tpl.elements.push({ id: 't', type: 'text', x: 20, y: 100, w: 60, h: 20, text: 'Hej', size: 9, color: '#000000', fill: '', border: '' });
      setSel(['t']); renderPrintPanel(); drawPrintPage();
    });

    // APD A1-mallen: ny layout ur knappen, rätt format och alla delar inom bladet
    const ap = await page.evaluate(async () => {
      pr.tpl.elements = []; document.getElementById('prNewApd').click(); await new Promise(r => setTimeout(r, 400));
      await new Promise(r => setTimeout(r, 400));
      const t = pr.tpl; return { name: t.name, format: t.format, types: t.elements.map(e => e.type).join(), out: t.elements.filter(e => e.x < 0 || e.y < 0 || e.x + e.w > 420.01 || e.y + e.h > 297.01).map(e => e.type), scale: (t.elements.find(e => e.type === 'map') || {}).scale, mapId: t.elements.filter(e => e.mapId).every(e => e.mapId === t.elements.find(x => x.type === 'map').id) };
    });
    if (ap.format !== 'A1' || !/map/.test(ap.types) || !/view3d/.test(ap.types) || !/qr/.test(ap.types) || !/legend/.test(ap.types) || !/scalebar/.test(ap.types) || !/title/.test(ap.types) || ap.out.length || ap.scale !== 1000 || !ap.mapId) fail('APD A1-mall: ' + JSON.stringify(ap));
    await page.evaluate(() => drawPrintPage()); await page.waitForTimeout(300);
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('OK: APD A1-mallen läggs som ny layout (karta, norrpil, fot med referenser, förklaring, QR, 3D-vy, skalstock, ritningshuvud) inom bladet', JSON.stringify({ n: ap.types.split(',').length, scale: ap.scale }));
  } catch (e) { console.error('FAIL', e.message); process.exitCode = 1; }
  finally { await browser.close(); server.close(); }
})();
