const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(require('path').join(__dirname,'..','docs'));
const PORT = 9071;
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
  await page.evaluate(async () => { plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }]; pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A'); });
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  const r = await page.evaluate(async () => {
    const O = l3.O, m = { k: 'mesh', pts: [[0,0,0],[30,0,0],[30,0.4,0],[0,0.4,0],[0,0,3],[30,0,3],[30,0.4,3],[0,0.4,3]], faces: [[1,3,2],[1,4,3],[5,6,7],[5,7,8],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,4,8],[3,8,7],[4,1,5],[4,5,8]], closed: true };
    const p = modCreate(m, [O[0] + 3, O[1] + 3, O[2] + 1], { name: 'Mur', color: '#aaaaaa', snapshot: false });
    const made = l3bqRun(p, { mode: 'count', value: 4 });
    const calls = []; window.__ao = askOpener; // wrapper redan på plats; fånga det som går vidare till "öppnaren"
    const real = window.__ao; let captured = [];
    // byt ut den underliggande öppnaren genom att köra via en ny wrapper-kedja: ersätt postMessage-bryggan
    const orig = window.opener; 
    return { n: made.length, ids: made.map(q => q.id), wrapped: askOpener.toString().includes('placeUploadIfc') };
  });
  console.log(JSON.stringify(r));
  // fånga meddelandet till öppnaren: askOpener skickar window.opener.postMessage – ersätt window.opener
  const out = await page.evaluate(async (ids) => {
    const got = []; Object.defineProperty(window, 'opener', { value: { postMessage: (m) => { got.push(m); }, closed: false }, configurable: true });
    const res = await Promise.race([askOpener('placeSaveIfc', { ids, fileName: 'Mur delad', placementData: ids.map(id => JSON.parse(JSON.stringify(placements.find(p => p.id === id)))) }, 1500).catch(e => ({ err: e.message })), new Promise(r => setTimeout(() => r({ timeout: true }), 3000))]);
    const up = got.find(g => g && g.type === 'placeUploadIfc') || {}, txt = up.text || '';
    return { types: got.map(g => g && g.type), len: txt.length, tri: (txt.match(/IFCTRIANGULATEDFACESET/g) || []).length, elems: (txt.match(/IFCBUILDINGELEMENTPROXY/g) || []).length, res };
  }, r.ids);
  console.log(JSON.stringify(out));
  if (!(out.tri >= 4 && out.elems >= 4)) { console.error('FAIL: ifc saknar geometri'); process.exit(1); }
  console.log('OK: delade bitar exporteras som IFC med geometri');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
