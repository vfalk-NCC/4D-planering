const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9293;
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
  const page = await (await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })).newPage();
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
  await page.evaluate(() => { open3d(); });
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 }); await page.waitForTimeout(500);
  const ok = (c, m) => { if (!c) fail(m); };
  const info = () => page.evaluate(() => {
    const cv = document.getElementById('v3Canvas').getBoundingClientRect(), r = sel => { const e = document.querySelector(sel); if (!e || e.classList.contains('hidden') || !e.offsetParent) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x - cv.x), y: Math.round(b.y - cv.y), w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right - cv.x), b: Math.round(b.bottom - cv.y) }; };
    return { cv: [Math.round(cv.width), Math.round(cv.height)], hud: r('.v3-walk'), ctl: r('.v3-ctl'), hudCol: !!(document.querySelector('.v3-walk') || { classList: { contains: () => false } }).classList.contains('col'), ctlCol: !!(document.querySelector('.v3-ctl') || { classList: { contains: () => false } }).classList.contains('col'), kbd: document.querySelectorAll('.v3-walk kbd').length, fs: !!document.querySelector('.v3-walk [data-w="fs"]'), joy: !!document.querySelector('.v3-joys:not(.hidden)') };
  });
  await page.evaluate(() => { l3SetPref('walkPerson', 'third'); l3wEnter(new THREE.Vector3(0, 0, 0)); l3wSetKind('loader'); l3wWork(); l3wCtlPanel(); });
  await page.waitForTimeout(400);
  let a = await info(); console.log(JSON.stringify(a));
  ok(a.hudCol && a.hud && a.hud.h < a.cv[1] * 0.25 && a.hud.r <= a.cv[0] && a.hud.x >= 0, 'Gå-rutan ska starta ihopfälld och rymmas på telefonen: ' + JSON.stringify(a));
  ok(a.ctlCol && a.ctl && a.ctl.h < 80 && a.ctl.r <= a.cv[0], 'Reglagepanelen ska starta ihopfälld: ' + JSON.stringify(a));
  const fsv = await page.evaluate(() => { const c = document.getElementById('v3Canvas').getBoundingClientRect(), vis = s => { const e = document.querySelector(s); return !!e && e.offsetParent !== null; }; return { cls: document.body.classList.contains('v3-walkfs'), c: [Math.round(c.width), Math.round(c.height)], w: [innerWidth, innerHeight], bar: vis('#view3d .v3-bar'), foot: vis('#view3d .v3-foot'), jb: [...document.querySelectorAll('.v3-jbtns button')].filter(b => b.offsetParent).map(b => b.dataset.jb) }; });
  ok(fsv.cls && fsv.c[0] === fsv.w[0] && fsv.c[1] === fsv.w[1] && !fsv.bar && !fsv.foot, 'Gå-läget på telefon ska fylla hela skärmen utan verktygsrader: ' + JSON.stringify(fsv));
  ok(fsv.jb.every(j => ['jump', 'run', 'crouch'].includes(j)), 'Bara Hopp/Spring/Huka som små knappar vid rattarna: ' + JSON.stringify(fsv.jb));
  await page.evaluate(() => l3wExit(true)); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !document.body.classList.contains('v3-walkfs') && document.querySelector('#view3d .v3-bar').offsetParent !== null), 'Verktygsraderna ska komma tillbaka när man lämnar gå-läget');
  await page.evaluate(() => { l3wEnter(new THREE.Vector3(0, 0, 0)); l3wSetKind('loader'); l3wWork(); l3wCtlPanel(); }); await page.waitForTimeout(300);
  ok(a.kbd === 0 && !a.fs && a.joy, 'Ingen tangentlista eller helskärmsknapp på telefon, joysticks på: ' + JSON.stringify(a));
  // utfälld ska rymmas och scrolla i stället för att täcka skärmen
  await page.evaluate(() => { document.querySelector('.v3-walk [data-w="col"]').click(); document.querySelector('.v3-ctl [data-cb="col"]').click(); }); await page.waitForTimeout(200);
  a = await info(); console.log(JSON.stringify(a));
  ok(a.hud.h <= a.cv[1] * 0.45 && a.ctl.h <= a.cv[1] * 0.5 && a.hud.r <= a.cv[0] && a.ctl.r <= a.cv[0] && a.hud.x >= 0, 'Utfällda rutor ska inte täcka skärmen: ' + JSON.stringify(a));
  ok(!errors.length, 'JS-fel: ' + errors.join('|'));
  console.log('OK: gå-läget på telefon – kompakta rutor som startar ihopfällda');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
