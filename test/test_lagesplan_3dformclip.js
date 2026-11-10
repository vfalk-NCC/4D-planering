const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9065;
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
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  const r = await page.evaluate(async () => {
    const c0 = [6512330, 150130, 100], P = [];
    for (let y = -30; y <= 30; y += 0.5) for (let x = -35; x <= 35; x += 0.5) P.push(x, y, 0.2 * x + 0.3 * y);
    l3pc.clouds.push({ id: 'pcR', name: 'Moln R', visible: false, dz: 0, nTot: P.length / 3, info: { center: c0, min: [c0[0] - 35, c0[1] - 30, 60], max: [c0[0] + 35, c0[1] + 30, 140] }, chunks: [{ pos: new Float32Array(P) }] });
    // 1) Avrundade kurvor: kraftig knäck i planen ska ge mjuk båge (liten vinkeländring per station)
    const turn = R => { const st = l3rStations([[0, 0, 1], [40, 0, 2], [40, 30, 3]], 2, R); let m = 0; for (let i = 2; i < st.length; i++) { const a = Math.atan2(st[i - 1].y - st[i - 2].y, st[i - 1].x - st[i - 2].x), b = Math.atan2(st[i].y - st[i - 1].y, st[i].x - st[i - 1].x); m = Math.max(m, Math.abs(b - a)); } return m * 57.3; };
    const sharp = turn(0), round = turn(15);
    // 2) Klipp en låda mot punktmolnet
    const o = [c0[0], c0[1], 100]; const m = { k: 'mesh', pts: [[-5, -5, -8], [5, -5, -8], [5, 5, -8], [-5, 5, -8], [-5, -5, 8], [5, -5, 8], [5, 5, 8], [-5, 5, 8]], faces: [[1, 3, 2], [1, 4, 3], [5, 6, 7], [5, 7, 8], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 4, 8], [3, 8, 7], [4, 1, 5], [4, 5, 8]], closed: true };
    const b = modCreate(m, o, { name: 'Låda', snapshot: false }); await new Promise(r => setTimeout(r, 200));
    l3pc.clouds[l3pc.clouds.length - 1].visible = true;
    const n0 = placements.length, src = l3fcSources([b.id]).map(s => s.k);
    const html = l3fcHtml([b]);
    const dbg = (() => { const ms = l3dfObjMeshes(b); const g = l3dfGrid({ x0: 6512325, y0: 150125, x1: 6512335, y1: 150135 }, 1); l3dfBuild("pc:pcR", g); return { nm: ms.length, z: Array.from(g.z).slice(0, 5), nx: g.nx }; })(); window.__dbg = dbg; const res = l3fcBuild([b], 'pc:pcR', 'above'), res2 = l3fcBuild([b], 'pc:pcR', 'below');
    const zs = r => r.pts.map(p => p[2] + r.org[2]), mn = a => a.reduce((m, v) => Math.min(m, v), 1e9), mx = a => a.reduce((m, v) => Math.max(m, v), -1e9);
    if (res.err) return { err: res.err, dbg }; const z1 = zs(res), z2 = zs(res2);
    const p = l3fcRun([b], 'pc:pcR', 'above', false);
    return { dbg, sharp, round, src, html: /Klipp mot yta/.test(html), n0, n1: placements.length, cells: res.cells, aboveMin: mn(z1), aboveMax: mx(z1), belowMin: mn(z2), belowMax: mx(z2), name: p && p.name, face: res.faces.length };
  });
  console.log(JSON.stringify(r));
  if (!(r.round < r.sharp / 3 && r.round < 12)) fail('kurvorna blir inte runda: ' + JSON.stringify(r));
  if (!r.html || !r.src.includes('pc:pcR')) fail('klippvalet saknas');
  if (!(r.cells > 100 && r.face > 200)) fail('klippningen ger ingen form');
  if (!(r.aboveMin > 99.5 - 4 && r.aboveMax > 107 && r.aboveMax < 108.1)) fail('övre delen fel: ' + JSON.stringify(r));
  if (!(r.belowMax < 103.1 && r.belowMin < 97.5 + 0.1)) fail('undre delen fel');
  if (r.n1 !== r.n0 + 1) fail('ingen ny kropp skapades');
  console.log('OK: avrundade kurvor och klipp form mot punktmoln (över/under ytan)');
  if (errors.length) fail('sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
