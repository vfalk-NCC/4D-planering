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
    const out = {}; await new Promise(r => setTimeout(r, 1200));
    window.bridgeWin = () => ({ postMessage: m => setTimeout(() => { const f = bridgeWait.get(m.reqId); if (f) f(m.type === 'placeUploadIfc' ? { n: 3, name: 'Ritade objekt 1.ifc', files: ['Ritade objekt 1.ifc'], link: 'https://web.connect.trimble.com/projects/p/data/folder/f', folder: 'Lägesplan etablering' } : { n: 2, name: 'E.ifc', files: ['E.ifc'], link: 'https://web.connect.trimble.com/projects/p/data/folder/g', folder: 'Etablering' }); }, 20) });
    await askOpener('placeUploadIfc', { text: 'x', fileName: 'a' }, 2000);
    const a = l3Log[l3Log.length - 1]; out.a = a && a.link === 'https://web.connect.trimble.com/projects/p/data/folder/f' && /Ritade objekt 1\.ifc/.test(a.text);
    await askOpener('placeSaveIfc', { ids: ['1'] }, 2000);
    const b = l3Log[l3Log.length - 1]; out.b = b && /folder\/g$/.test(b.link || '') && /E\.ifc/.test(b.text);
    return out;
  });
  console.log(JSON.stringify(r));
  if (!r.a || !r.b) fail('Länk i historik: ' + JSON.stringify(r));
  await browser.close(); server.close(); console.log('OK: IFC till TC (placeUploadIfc/placeSaveIfc) ger rad med länk till mappen i historiken');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
