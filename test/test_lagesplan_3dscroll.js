const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9084;
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
    const out = {}, w = ms => new Promise(r => setTimeout(r, ms)), P = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]], F = [[1,3,2],[1,4,3],[5,6,7],[5,7,8],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,4,8],[3,8,7],[4,1,5],[4,5,8]];
    await w(1000); l3PalTab('add'); for (let i = 0; i < 60; i++) { const p = modCreate({ k: 'mesh', pts: P, faces: F, closed: true }, [6512330 + i * 2, 150130, 100], { name: 'Obj ' + i }); p.area = 'Mapp ' + (i % 3); }
    l3RenderLib(); await w(400);
    out.chain = []; { let e = document.getElementById('v3Lib'); while (e && e !== document.body) { const cs = getComputedStyle(e); out.chain.push(e.id + '.' + e.className.toString().slice(0, 14) + ':' + cs.overflowY + ':' + e.scrollHeight + '/' + e.clientHeight); e = e.parentElement; } }
    const sc = l3mnScroller(); out.sc = !!sc && sc.scrollHeight > sc.clientHeight; if (!sc) return out;
    sc.scrollTop = 600; await w(100); const t0 = sc.scrollTop; out.t0 = t0;
    out.rows = document.querySelectorAll('#v3Lib .v3-mo-r').length; out.shut = document.querySelectorAll('#v3Lib [data-moshut][aria-expanded="false"]').length; const row = [...document.querySelectorAll('#v3Lib .v3-mo-r')].find(r => { const b = r.getBoundingClientRect(); return b.top > 150 && b.bottom < innerHeight - 20; }); if (!row) return out; const id = row.dataset.moid;
    row.click(); await w(600); out.sel = l3.sel.has(id); out.t1 = sc.scrollTop;
    return out;
  });
  console.log(JSON.stringify(r));
  if (!r.sc || !r.sel || Math.abs(r.t1 - r.t0) > 2 || r.t0 < 100) fail('Menyn hoppar vid markering: ' + JSON.stringify(r));
  await browser.close(); server.close(); console.log('OK: Objekt-menyn står stilla när man markerar');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
