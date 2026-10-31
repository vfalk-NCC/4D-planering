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
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    // UTF-8 rakt i filen ("Stålbolaget") – som en del program skriver.
  }, '');

  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  const r = await page.evaluate(async () => {
    const out = {}; l3spSync(); out.btn = !!document.getElementById('v3SpBtn');
    await l3spOpen(); out.open = l3sp.open; out.img = !!l3sp.img; out.panel = !!document.getElementById('v3Sp');
    // kamerans punkt ska hamna i bild: modell → ritning → modell går runt
    const x = plan.calib.model[0][0] + 20, y = plan.calib.model[0][1] + 10, [sx, sy] = l3spToScr(x, y), [bx, by] = l3spFromScr(sx, sy);
    out.round = Math.hypot(bx - x, by - y);
    l3spGoTo(x, y); out.pin = !!l3sp.pin && !!l3sp.pinObj; await new Promise(r => setTimeout(r, 700));
    out.tx = l3.orbit.target.x + l3.O[0] - x; out.ty = l3.orbit.target.y + l3.O[1] - y;
    l3spDraw(); out.drew = true; l3spPinClear(); out.cleared = !l3sp.pin && !l3sp.pinObj;
    return out;
  });
  if (!r.btn || !r.open || !r.img || !r.panel) fail('Ritningspanelen ska öppnas: ' + JSON.stringify(r));
  if (r.round > 0.01) fail('Ritning ↔ modell ska gå runt: ' + JSON.stringify(r));
  if (!r.pin || Math.hypot(r.tx, r.ty) > 0.6) fail('Tryck på ritningen ska flytta 3D-målet och sätta nål: ' + JSON.stringify(r));
  if (!r.cleared) fail('Nålen ska kunna tas bort: ' + JSON.stringify(r));
  // riktig musklick på ritningen
  const click = await page.evaluate(() => { const b = l3sp.cv.getBoundingClientRect(); l3sp.follow = false; l3spFit(); const sx = b.width * 0.62, sy = b.height * 0.4, [mx, my] = l3spFromScr(sx, sy); window.__exp = [mx, my]; return { x: b.left + sx, y: b.top + sy }; });
  await page.mouse.click(click.x, click.y); await page.waitForTimeout(700);
  const after = await page.evaluate(() => ({ pin: l3sp.pin, tx: l3.orbit.target.x + l3.O[0], ty: l3.orbit.target.y + l3.O[1], ex: window.__exp[0], ey: window.__exp[1] }));
  if (!after.pin || Math.hypot(after.pin[0] - after.ex, after.pin[1] - after.ey) > 0.6 || Math.hypot(after.tx - after.ex, after.ty - after.ey) > 0.6) fail('Musklick på ritningen: ' + JSON.stringify(after));
  console.log('OK: ritningspanel – kamera/ritning synkade, nål och flygning vid klick', JSON.stringify({ ...r, click: after.pin }));
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
