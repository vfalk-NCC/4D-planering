const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9082;
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
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A');
  });
  await page.click('#btn3d');
  const r = await page.evaluate(async () => {
    const out = {}, w = ms => new Promise(r => setTimeout(r, ms)), side = document.getElementById('v3Side');
    const P = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]], F = [[1,3,2],[1,4,3],[5,6,7],[5,7,8],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,4,8],[3,8,7],[4,1,5],[4,5,8]], p = modCreate({ k: 'mesh', pts: P, faces: F, closed: true }, [6512330, 150130, 100], { name: 'T' });
    await w(1500); l3SelectIds([p.id]); await w(500);
    const pin = () => side.querySelector('.v3-side-h > .v3-pin');
    out.hasPin = !!pin() && !side.classList.contains('hidden');
    if (!pin()) return out;
    pin().click(); await w(200); out.pinned = l3Prefs().sidePin === true && pin().classList.contains('on');
    l3SelectIds([]); await w(300); out.stays = !side.classList.contains('hidden') && !!pin() && /Inget objekt markerat/.test(side.textContent);
    l3SelectIds([p.id]); await w(400); out.back = !!pin() && !/Inget objekt markerat/.test(side.textContent);
    pin().click(); await w(200); l3SelectIds([]); await w(300); out.hidden = side.classList.contains('hidden');
    l3SelectIds([p.id]); await w(400); const col = side.querySelector('.v3-side-h > .v3-rcol'); out.col = !!col; col.click(); await w(300);
    out.rhide = document.getElementById('view3d').classList.contains('v3-rhide') && getComputedStyle(side).display === 'none' && !document.getElementById('v3RightOpen').classList.contains('hidden') && l3Prefs().rightHide === true;
    document.getElementById('v3RightOpen').click(); await w(300); out.rshow = !document.getElementById('view3d').classList.contains('v3-rhide') && getComputedStyle(side).display !== 'none' && document.getElementById('v3RightOpen').classList.contains('hidden');
    return out;
  });
  console.log(JSON.stringify(r));
  if (!r.hasPin || !r.pinned || !r.stays || !r.back || !r.hidden || !r.col || !r.rhide || !r.rshow) fail('Fäst meny: ' + JSON.stringify(r));
  await browser.close(); server.close(); console.log('OK: fäst högermeny – står kvar utan markering, lossas igen');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
