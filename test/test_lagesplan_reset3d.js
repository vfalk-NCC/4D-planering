const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9879;
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
    window.__fetch = 0; localStorage.setItem('lagesplan-boot-p1', String(Date.now())); localStorage.setItem('lagesplan-3d-prefs', '{"fullQ":true}'); localStorage.setItem('lagesplan-bldg-p1', JSON.stringify([{ id: 'f:X', fileId: 'X', name: 'Hus.ifc', on: true }]));
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    // UTF-8 rakt i filen ("Stålbolaget") – som en del program skriver.
  }, '');

  // gör en IndexedDB med innehåll, ladda om med ?reset3d=1
  await page.evaluate(() => new Promise((ok, no) => { const q = indexedDB.open('lagesplan-ifc-cache', 1); q.onupgradeneeded = () => q.result.createObjectStore('models'); q.onsuccess = () => { const t = q.result.transaction('models', 'readwrite'); t.objectStore('models').put({ x: 1 }, 'a'); t.oncomplete = () => { q.result.close(); ok(); }; }; q.onerror = no; }));
  const before = await page.evaluate(async () => (await indexedDB.databases()).map(d => d.name));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1&reset3d=1`); await page.waitForTimeout(1200);
  const r = await page.evaluate(async () => { await window.__l3Reset; return { dbs: (await indexedDB.databases()).map(d => d.name), bldg: localStorage.getItem('lagesplan-bldg-p1'), boot: localStorage.getItem('lagesplan-boot-p1'), prefs: localStorage.getItem('lagesplan-3d-prefs'), settings: !!localStorage.getItem('4dplan-settings'), url: location.search }; });
  if (!before.includes('lagesplan-ifc-cache') || r.dbs.includes('lagesplan-ifc-cache') || r.bldg !== null || r.boot !== null || r.prefs !== '{"fullQ":true}' || !r.settings || /reset3d/.test(r.url)) fail('Rensa 3D-cache: ' + JSON.stringify({ before, ...r }));
  if (errors.length) fail('Fel: ' + errors.join('|'));
  console.log('OK: ?reset3d=1 rensar bara 3D-cachen (modellkopior, modelllistor) – inställningar och inloggning finns kvar ' + JSON.stringify(r));
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
