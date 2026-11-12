const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9090;
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
    const out = {}, w = ms => new Promise(r => setTimeout(r, ms)); await w(1200);
    const O = l3.O, q = placeNew('sm:gjutetapp', [O[0] + 20, O[1] + 20, 0]); q.f = q.f || {}; q.f.form = 'Rektangel'; placements.push(q); placeTouch(q); l3AddPlacementMesh(q);
    const pts = [], faces = []; for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) pts.push([i * 5 - 20, j * 5 - 20, (i * 5 - 20) * 0.2]);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { const a = i * 9 + j + 1, b = a + 1, c = a + 9, d = c + 1; faces.push([a, c, b], [b, c, d]); }
    const t = modCreate({ k: 'mesh', pts, faces, closed: false }, [q.x, q.y, 0], { name: 'Berg' });
    const low = k => { q.f.gsrc = k; const local = { ...q, x: 0, y: 0, z: 0, dz: 0, rot: 0 }; Object.defineProperty(local, '__src', { value: q, enumerable: false }); const parts = placeParts(local, 48); let zmin = Infinity; parts.forEach(p => { if (p.z0 < zmin) zmin = p.z0; }); return Math.round(zmin * 100) / 100; };
    out.flat = low(''); out.rock = low('ob:' + t.id); const sel = smartSideHtml(q); out.fields = /Stöden följer berget/.test(sel) && /Snedstagets fästhöjd/.test(sel) && /Snedstagens läge/.test(sel);
    return out;
  });
  console.log(JSON.stringify(r));
  if (!(r.rock < r.flat - 0.5) || !r.fields) { console.error('FAIL Stöd mot berget: ' + JSON.stringify(r)); process.exit(1); }
  await browser.close(); server.close(); console.log('OK: stöden följer berget (ritat underlag) – foten hamnar på markhöjden, fälten finns i formvirke-gruppen');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
