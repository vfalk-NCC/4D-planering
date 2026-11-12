const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9079;
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
    const out = {}, box = (x, y, z, w, d, h) => { const P = [[0,0,0],[w,0,0],[w,d,0],[0,d,0],[0,0,h],[w,0,h],[w,d,h],[0,d,h]], F = [[1,3,2],[1,4,3],[5,6,7],[5,7,8],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,4,8],[3,8,7],[4,1,5],[4,5,8]]; return { k: 'mesh', pts: P, faces: F, closed: true }; };
    const c0 = [6512330, 150130, 100];
    const a = modCreate(box(), [c0[0], c0[1], c0[2]], { name: 'A' }); a.m = box(0, 0, 0, 2, 1, 1); a.m.rev = modRev(); 
    const b = modCreate(box(0, 0, 0, 2, 1, 1), [c0[0] + 1, c0[1], c0[2]], { name: 'B' });
    const vol = p => Math.abs(modMeshStats(p.m.pts, p.m.faces).volume);
    out.v0 = Math.round(vol(a) * 100) / 100 + Math.round(vol(b) * 100) / 100;
    l3SelectIds([a.id, b.id]); const n0 = placements.length; const q = l3unRun();
    out.made = !!q && placements.length === n0 - 1; out.vol = q ? Math.round(vol(q) * 100) / 100 : 0; out.closed = q ? q.m.closed : null;
    out.name = q && q.name;
    const c = modCreate(box(0, 0, 0, 0.5, 0.5, 0.5), [c0[0] + 0.5, c0[1] + 0.2, c0[2] + 0.2], { name: 'C' }), d = modCreate(box(0, 0, 0, 1, 1, 1), [c0[0] + 3, c0[1], c0[2]], { name: 'D' }); // C helt inuti, D nuddar
    l3SelectIds([q.id, c.id]); const q2 = l3unRun(); out.inside = !!q2 && Math.abs(vol(q2) - 3) < 0.02;
    l3SelectIds([q2.id, d.id]); const q3 = l3unRun(); out.touch = !!q3 && Math.abs(vol(q3) - 4) < 0.02;
    return out;
  });
  console.log(JSON.stringify(r));
  if (!r.made || Math.abs(r.vol - 3) > 0.02 || !r.closed || !r.inside || !r.touch) fail('Sammanfoga: ' + JSON.stringify(r));
  await browser.close(); server.close(); console.log('OK: sammanfoga överlappande solider (volym 3 m³ = 2 + 2 − 1)');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
