const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9087;
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
  const r = await page.evaluate(() => {
    const P = []; for (let y = -10; y < 10; y += 0.5) for (let x = -10; x < 10; x += 0.5) P.push(x, y, (x + 10) * 0.1);   // 1600 punkter, 20 x 20 m
    const info = { center: [l3.O[0] + 5, l3.O[1] + 5, l3.O[2] + 1], min: [0, 0, 0], max: [1, 1, 1], format: 'test', n: P.length / 3, total: P.length / 3 };
    const src = { id: 'pcEd', name: 'Testmoln' }; const c = l3pcBuild(src, { info, chunks: [{ pos: new Float32Array(P), inten: new Uint8Array(P.length / 3) }] }); window.__c = c;
    // kameran rakt uppifrån så att ringen i bilden motsvarar ett område i planen
    const cam = l3.camera; l3.orbit.target.set(5 - 5, 5 - 5, 0); cam.position.set(0, 0, 60); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); if (cam.updateProjectionMatrix) cam.updateProjectionMatrix(); l3.orbit.update(); l3Render();
    const v = new THREE.Vector3(0, 0, 0).project(cam), a = new THREE.Vector3(-5, -5, 0).project(cam), b = new THREE.Vector3(5, 5, 0).project(cam);
    const n0 = c.nTot; l3peStart('pcEd');
    l3pe.pend = { poly: [[a.x, a.y], [b.x, a.y], [b.x, b.y], [a.x, b.y]] }; l3peDo('in');   // 10 x 10 m i mitten (molnets centrum ligger i origo)
    const n1 = c.nTot; l3peUndo(c); const n2 = c.nTot; l3pe.pend = { poly: [[a.x, a.y], [b.x, a.y], [b.x, b.y], [a.x, b.y]] }; l3peDo('out'); const n3 = c.nTot;
    const saved = JSON.stringify((l3Prefs().pcEdits || {}).pcEd || []).length;
    const edN = c.edits.length; l3peStop(); l3peReset(c); const n4 = c.nTot;
    return { n0, n1, n2, n3, n4, saved, edN, panel: !document.getElementById('v3PcEdPanel') };
  });
  if (!(r.n1 < r.n0 && r.n1 > 0)) fail('Ta bort innanför ska ta bort punkter: ' + JSON.stringify(r));
  if (r.n2 !== r.n0) fail('Ångra ska ta tillbaka alla punkter: ' + JSON.stringify(r));
  if (!(r.n3 < r.n0 && r.n3 > 0 && Math.abs(r.n3 + r.n1 - r.n0) <= r.n0 * 0.1)) fail('Ta bort utanför ska vara motsatsen: ' + JSON.stringify(r));
  if (r.n4 !== r.n0 || !r.panel) fail('Återställ alla / Klar: ' + JSON.stringify(r));
  console.log('OK: punktmoln – ta bort innanför/utanför, ångra, återställ', JSON.stringify(r));
  // Redigeringen sparas och läggs på igen när molnet byggs om.
  const r2 = await page.evaluate(() => {
    const c = window.__c; l3peStart('pcEd'); const cam = l3.camera, a = new THREE.Vector3(-5, -5, 0).project(cam), b = new THREE.Vector3(5, 5, 0).project(cam);
    l3pe.pend = { poly: [[a.x, a.y], [b.x, a.y], [b.x, b.y], [a.x, b.y]] }; l3peDo('in'); const n1 = c.nTot; l3peStop();
    l3pcRemove('pcEd'); const P = []; for (let y = -10; y < 10; y += 0.5) for (let x = -10; x < 10; x += 0.5) P.push(x, y, (x + 10) * 0.1);
    const c2 = l3pcBuild({ id: 'pcEd', name: 'Testmoln' }, { info: { ...c.info }, chunks: [{ pos: new Float32Array(P), inten: new Uint8Array(P.length / 3) }] });
    return { n1, again: c2.nTot, edits: (c2.edits || []).length };
  });
  if (r2.again !== r2.n1 || r2.edits !== 1) fail('Redigeringen ska läggas på igen vid inläsning: ' + JSON.stringify(r2));
  console.log('OK: redigeringen sparas och läggs på igen vid inläsning', JSON.stringify(r2));
  // Riktiga musklick: ring med fyra punkter + dubbelklick, sedan knappen Ta bort innanför.
  await page.evaluate(() => { window.__c = l3pc.clouds.find(x => x.id === 'pcEd'); l3peReset(window.__c); l3peStart('pcEd'); window.__n = window.__c.nTot; });
  const box = await page.evaluate(() => { const r = l3.renderer.domElement.getBoundingClientRect(), cam = l3.camera, f = (x, y) => { const v = new THREE.Vector3(x, y, 0).project(cam); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; }; return [f(-4, -4), f(4, -4), f(4, 4), f(-4, 4)]; });
  for (const [x, y] of box) await page.mouse.click(x, y);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => l3pe.pend, null, { timeout: 3000 });
  await page.click('[data-pe="in"]'); await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({ n: window.__c.nTot, was: window.__n, edits: window.__c.edits.length }));
  if (!(after.n < after.was) || after.edits < 1) fail('Ring med musen + Ta bort innanför: ' + JSON.stringify(after));
  console.log('OK: ring med musen och knappen Ta bort innanför', JSON.stringify(after)); await page.evaluate(() => l3peStop());
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
