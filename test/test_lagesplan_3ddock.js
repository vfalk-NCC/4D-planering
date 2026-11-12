const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9074;
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
  await page.evaluate(() => { L3R_DEF.bodies = false; });   // fyllnings-/schaktkropparna testas för sig (nedan)
  await page.setViewportSize({ width: 1500, height: 950 });
  const r = await page.evaluate(async () => {
    const out = {}, V = (x, y, z) => new THREE.Vector3(x, y, z);
    await new Promise(r => setTimeout(r, 700)); out.init = !!document.getElementById('v3Dock') && !!document.getElementById('v3DockBtn');
    const c0 = [6512330, 150130, 100], P = []; for (let y = -30; y <= 30; y += 1) for (let x = -35; x <= 35; x += 1) P.push(x, y, 0.1 * x);
    l3pc.clouds.push({ id: 'pcR', name: 'Moln R', visible: false, dz: 0, nTot: P.length / 3, info: { center: c0, min: [c0[0] - 35, c0[1] - 30, 60], max: [c0[0] + 35, c0[1] + 30, 140] }, chunks: [{ pos: new Float32Array(P) }] });
    const pts = [[6512300, 150130, 97], [6512330, 150130, 100], [6512360, 150130, 103]];
    l3roadOpen({ pts, spec: { ...L3R_DEF, src: ['pc:pcR'], mode: 'terrain', grade: 10, width: 5, bodies: false }, res: null, geom: null, st: null, busy: '', err: '' });
    for (let i = 0; i < 60 && !(l3road.cur.res || l3road.cur.err); i++) await new Promise(r => setTimeout(r, 150));
    const cv = document.getElementById('v3Canvas'), panel = document.getElementById('v3RoadPanel'); out.floating = !!panel && panel.parentElement === cv; const w0 = cv.getBoundingClientRect().width;
    // fällbara avsnitt
    const secs = [...panel.querySelectorAll('[data-rsec]')]; out.secs = secs.length; const b = panel.querySelector('[data-rsec="xs"]'); b.click(); out.shut = panel.querySelector('[data-rsecw="xs"]').classList.contains('shut') && (l3Prefs().rdShut || []).includes('xs'); b.click(); out.reopen = !panel.querySelector('[data-rsecw="xs"]').classList.contains('shut');
    // docka
    l3dkToggle(true); await new Promise(r => setTimeout(r, 600)); const dock = document.getElementById('v3Dock'); out.docked = !dock.classList.contains('hidden') && dock.contains(panel) && panel.classList.contains('v3-docked'); const w1 = cv.getBoundingClientRect().width; out.canvasShrank = w1 < w0 - 200; out.pref = l3Prefs().dockR === true;
    const pr = panel.getBoundingClientRect(), dr = dock.getBoundingClientRect(), cr = cv.getBoundingClientRect(); out.between = cr.right <= dr.left + 2 && pr.left >= dr.left - 1;
    const rw = l3.renderer.domElement.getBoundingClientRect().width; out.rendererFits = Math.abs(rw - w1) < 4;
    out.dock = [Math.round(dr.width)]; l3dkToggle(false); await new Promise(r => setTimeout(r, 600)); out.undocked = panel.parentElement === cv && dock.classList.contains('hidden') && !panel.classList.contains('v3-docked'); out.canvasBack = Math.abs(cv.getBoundingClientRect().width - w0) < 4;
    // storleksgrepp på flytande panel
    await new Promise(r => setTimeout(r, 800)); out.grips = document.querySelectorAll('.v3-dk-gw').length >= 1;
    return out; });
  console.log('dock:', JSON.stringify(r));
  if (!r.init || !r.floating || r.secs < 5 || !r.shut || !r.reopen || !r.docked || !r.canvasShrank || !r.pref || !r.between || !r.rendererFits || !r.undocked || !r.canvasBack || !r.grips) fail('Docka/fällbara: ' + JSON.stringify(r));
  // dra i greppet: bredden ändras och sparas
  const g = await page.evaluate(() => { const e = document.querySelector('.v3-dk-gw'), r = e.getBoundingClientRect(), p = document.getElementById('v3RoadPanel').getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2, w: p.width }; });
  await page.mouse.move(g.x + 40, g.y); await page.mouse.move(g.x, g.y, { steps: 3 }); await page.mouse.down(); await page.mouse.move(g.x - 120, g.y, { steps: 4 }); await page.mouse.up();
  const w2 = await page.evaluate(() => ({ w: document.getElementById('v3RoadPanel').getBoundingClientRect().width, s: l3Prefs().panSize })); if (!(w2.w > g.w + 80) || !w2.s || !w2.s['v3RoadPanel'] || !w2.s['v3RoadPanel'].w) fail('Ändra bredd på panelen: ' + JSON.stringify([g.w, w2]));
  console.log('OK: dockade högermenyer (bilden mellan vänster- och högermenyn), fällbara avsnitt och storleksgrepp som sparas');
  if (errors.length) fail('sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
