const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9089;
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
  const ok = (c, m) => { if (!c) fail(m); };
  const o = await page.evaluate(() => {
    const O = l3.O, z1 = ps => Math.max(...ps.filter(q => q.role !== 'reach').map(q => q.z1)), tris = ps => ps.reduce((n, q) => n + (q.tris ? q.tris.faces.length : 0), 0), r = {};
    const b = placeNew('bod', [O[0] + 5, O[1] + 5, 0]); r.h1 = z1(placeParts(b)); b.bod = { floors: 2 }; r.h2 = z1(placeParts(b)); const t2 = tris(placeParts(b)); b.bod = { floors: 2, doors: false }; r.noDoor = tris(placeParts(b)) < t2;
    b.sign = true; r.sign = placeParts(b).some(q => q.sign); b.signOff = true; r.signOff = !placeParts(b).some(q => q.sign); b.signOff = false; b.sign = false; r.noSign = !placeParts(b).some(q => q.sign);
    const k = placeNew('mobilkran', [O[0] + 30, O[1], 0]); r.k0 = z1(placeParts(k)); k.mk = { mode: 'ut', ang: 55, ext: 0.7 }; r.k1 = z1(placeParts(k)); k.mk = { mode: 'ut', ang: 55, ext: 0 }; r.k2 = z1(placeParts(k));
    const rch = q => { const pt = placeParts(q).find(x => x.role === 'reach'); return pt ? Math.round(Math.hypot(pt.poly[0][0] - pt.poly[Math.floor(pt.poly.length / 2)][0], pt.poly[0][1] - pt.poly[Math.floor(pt.poly.length / 2)][1]) / 2 * 10) / 10 : 0; };
    k.mk = { mode: 'ut', ang: 50, ext: 0 }; r.rc0 = rch(k); k.mk = { mode: 'ut', ang: 50, ext: 1 }; r.rc1 = rch(k); k.mk = { mode: 'ut', ang: 80, ext: 1 }; r.rc2 = rch(k);
    const l = placeNew('lada', [O[0], O[1] + 20, 0]); l.sign = true; r.lada = placeParts(l).some(q => q.sign);
    return r;
  });
  console.log(JSON.stringify(o));
  ok(o.h2 > o.h1 * 1.6, 'Två våningar är högre: ' + JSON.stringify(o)); ok(o.noDoor, 'Dörrar av ger färre delar'); ok(o.sign && o.signOff && o.noSign, 'Skylt av/på'); ok(o.k1 > o.k0 + 3 && o.k1 > o.k2, 'Utskjutet läge: bommen är högre och längre'); ok(o.rc1 > o.rc0 + 3 && o.rc2 < o.rc1, 'Arbetsradien följer bomutskjut och vinkel: ' + [o.rc0, o.rc1, o.rc2]); ok(o.lada, 'Egen låda kan ha skylt');
  ok(!errors.length, 'JS-fel: ' + errors.join('|'));
  console.log('OK: bod i två våningar, dörrar av/på, skyltar på alla objekt, mobilkran utskjutet läge');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
