const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9297;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  const gh = new Map();
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
    const body = JSON.parse(req.postData()); gh.set(f, Buffer.from(body.content, 'base64').toString());
    if (/ifc_groups\.json$/.test(f)) page.evaluate(t => { window.__gsaved = JSON.parse(t); }, gh.get(f)).catch(() => {});
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async ifc => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    window.__fetch = 0;
  }, '');
  await page.evaluate(() => { open3d(); }); await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 }); await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const mk = (w, d, rot) => { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.BoxGeometry(w, d, 2), new THREE.MeshBasicMaterial()); m.rotation.z = rot; g.add(m); l3.scene.add(g); g.updateMatrixWorld(true); const a = l3GzObjAngle(g); l3.scene.remove(g); return a; };
    const mod = a => ((a % Math.PI) + Math.PI) % Math.PI;
    const g2 = new THREE.Group(), m2 = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 1), new THREE.MeshBasicMaterial()); g2.add(m2); g2.rotation.z = 0.7; l3.scene.add(g2); g2.updateMatrixWorld(true); const own = l3GzObjAngle(g2); l3.scene.remove(g2);
    return { slanted: mod(mk(10, 4, 0.5)), slanted2: mod(mk(4, 10, 0.5)), straight: mk(10, 4, 0), tiny: mk(10, 4, 0.001), own };
  });
  const ok = (c, m) => { if (!c) fail(m); };
  ok(Math.abs(r.slanted - 0.5) < 0.03, 'Lång sida på en snedställd kropp: ' + JSON.stringify(r));
  ok(Math.abs(r.slanted2 - (0.5 + Math.PI / 2) % Math.PI) < 0.03, 'Långa sidan även när kroppen är djupare än bred: ' + JSON.stringify(r));
  ok(r.straight === 0 && r.tiny === 0, 'Rakt objekt ger 0°: ' + JSON.stringify(r));
  ok(Math.abs(r.own - 0.7) < 1e-9, 'Objektets egen vridning har företräde: ' + JSON.stringify(r));
  ok(!errors.length, 'JS-fel: ' + errors.join('|'));
  console.log('OK: Flytta längs objektet – riktningen följer objektets långa sida även när vinkeln ligger i geometrin');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
