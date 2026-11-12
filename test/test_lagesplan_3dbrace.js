const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9088;
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
  const r = await page.evaluate(() => {
    const out = {}, S = (dd, f) => gjutSide(dd, { f }), t = a => a.map(o => o.t.toFixed(2) + (o.brace ? '*' : '')).join(' ');
    out.alla = t(S(3, {})); out.cen = t(S(3, { spl: 'Centrerat' })); out.mitt = t(S(4, { spl: 'Mitt' })); out.mitt2 = S(5, { spl: 'Mitt', sd: 2 }).filter(o => o.brace).map(o => o.t.toFixed(2)).join(','); out.var2 = t(S(4, { spl: 'Var 2:a' }));
    const poly = [[0, 0], [4, 0], [4, 2], [0, 2]], base = { f: { H: 2, spl: 'Mitt' } };
    try { const a = gjutStuds({ ...base, f: { ...base.f, sh: 100 } }, poly), b = gjutStuds({ ...base, f: { ...base.f, sh: 50 } }, poly); out.z100 = a[0].z; out.z50 = b[0].z; out.zok = b.length === a.length && b[0].z < a[0].z; } catch (e) { out.err = e.message; }
    return out;
  });
  console.log(JSON.stringify(r));
  const ok = r.alla === '0.00* 0.33* 0.67*' && r.cen === '0.17* 0.50* 0.83*' && r.mitt === '0.10 0.30 0.50* 0.70 0.90' && r.mitt2 === '0.50' && r.var2 === '0.13* 0.38 0.63* 0.88' && r.zok;
  if (!ok) { console.error('FAIL', JSON.stringify(r)); process.exit(1); }
  await browser.close(); server.close(); console.log('OK: snedstagens läge – Alla, Centrerat, Mitt (ett mitt på sidan), Var 2:a');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
