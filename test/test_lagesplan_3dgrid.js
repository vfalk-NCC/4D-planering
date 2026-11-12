const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9085;
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
    const store = {}; window.ghReadJSON = async (t, p) => JSON.parse(JSON.stringify(store[p] || [])); window.ghWriteJSON = async (t, p, fn) => (store[p] = fn(JSON.parse(JSON.stringify(store[p] || []))));
    const P = l3gdParse('5x6; 7,2; 3x4'); out.parse = P.ok && P.pos.length === 10 && P.pos[5] === 30 && P.pos[6] === 37.2 && P.pos[9] === 49.2;
    out.bad = !l3gdParse('abc').ok; out.abc = l3gdLabels('abc', 'Y', 4).join('') === 'YZAAAB' && l3gdLabels('num', '3', 3).join('') === '345';
    document.getElementById('v3GridBtn').click(); await w(300);
    document.querySelector('[data-gdnew]').click(); await w(200);
    const d = l3gd.edit; d.x = 6512330; d.y = 150130; d.z = 100; d.xsT = '3x8'; d.ysT = '2x6'; d.rot = 20; d.w = 0.3; d.dash = 'dash'; l3gdDraw(); l3gdRenderDlg(true); await w(300);
    out.meshes = l3gd.group.children.length; out.items = l3gd.items.length; const nL = l3gdLines(d).lines.length; out.lines = nL === 7;
    document.querySelector('[data-gdsave]').click(); await w(500);
    out.saved = l3gd.list.length === 1 && (store['projects/' + encodeURIComponent(projectId) + '/plan_grids.json'] || []).length === 1;
    const g = l3gd.list[0]; g.vis = false; l3gdDraw(); out.hidden = l3gd.group.children.length === 0 && l3gd.items.length === 0; g.vis = true; l3gdDraw();
    l3gdZoom(g); await w(400); out.bub = [...document.querySelectorAll('.v3-gd-b')].filter(e => e.style.display !== 'none').length;
    // Smarta funktioner: kantetiketter vid inzoomning, måttkedja, fäste mot korsningar/linjer, position vid pekaren
    { const g2 = l3gd.list[0]; g2.dims = true; g2.sub = 2; l3gdDraw(); out.dims = l3gd.dims.length === 5; out.subMesh = l3gd.group.children[0].children.length === 2;
      const mid = l3gdW(g2, [12, 6]); l3FlyTo(new THREE.Vector3(mid[0] - l3.O[0], mid[1] - l3.O[1], g2.z - l3.O[2]), 6, new THREE.Vector3(0, -0.01, 1), 0); await w(500); l3Render(); await w(300);
      out.edge = [...document.querySelectorAll('.v3-gd-e')].filter(e => e.style.display !== 'none').length; out.dimsShown = [...document.querySelectorAll('.v3-gd-d')].filter(e => e.style.display !== 'none').length >= 0;
      const r = l3Rect(), O = l3.O, w0 = l3gdW(g2, [16, 6]), q = l3ToScreen(new THREE.Vector3(w0[0] - O[0], w0[1] - O[1], g2.z - O[2] + 0.03)), ev = { clientX: r.left + q.x + 3, clientY: r.top + q.y + 2, buttons: 0 };
      const sn = l3Snap(ev); out.snapX = !!sn && sn.kind === 'gridx' && /–/.test(sn.label || '');
      const lw = l3gdW(g2, [8, 3]); const ql = l3ToScreen(new THREE.Vector3(lw[0] - O[0] + 0.05, lw[1] - O[1] + 0.05, g2.z - O[2] + 0.03)); const sl = l3Snap({ clientX: r.left + ql.x, clientY: r.top + ql.y, buttons: 0 }); out.snapL = !!sl && (sl.kind === 'gridl' || sl.kind === 'gridx');
      l3gdHoverCalc(ev); out.hover = !!l3gd.hover && /–/.test(l3gd.hover.text); g2.dims = false; g2.sub = 0; l3gdDraw(); }
    return out;
  });
  console.log(JSON.stringify(r)); if (errors.length) fail('JS-fel: ' + errors.join(' | ').slice(0, 600));
  await page.screenshot({ path: '/tmp/claude-0/-home-user-4D-planering/867d5061-8c43-5fe8-9725-74ef03d6c450/scratchpad/grid.png' });
  if (!r.parse || !r.bad || !r.abc || r.meshes !== 1 || r.items !== 14 || !r.lines || !r.saved || !r.hidden || r.bub < 4 || !r.dims || !r.subMesh || r.edge < 2 || !r.snapX || !r.snapL || !r.hover) fail('Rutnät: ' + JSON.stringify(r));
  await browser.close(); server.close(); console.log('OK: rutnät – avståndsspråk, etiketter, ritning, cirklar, tänd/släck och delad sparning');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
