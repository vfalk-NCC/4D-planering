// Länk till en aktivitet (Victors önskemål 2026-10-05): lagesplan.html?project=…&item=<id>
// ("Visa på kartan" i Excel) öppnar rätt arbetsyta, zoomar in på aktiviteten, markerar och
// blinkar den och visar namn, status, framdrift och zon.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8982;
// Attrapp av pdf.js: plan A ritar en blå ruta, plan B en röd ruta på samma ställe (140–160).
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: ({ data }) => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const kind = new Uint8Array(data)[0];
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      const [x, y] = v.convertToViewportPoint(kind === 2 ? 140 : 280, kind === 2 ? 160 : 320), w = (kind === 2 ? 20 : 40) * v.transform[0];
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height);
      c.fillStyle = kind === 2 ? '#ff0000' : '#0000ff'; c.fillRect(x, y, w, w);
      return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  const setup = async item => page.evaluate(async item => {
    history.replaceState(null, '', location.pathname + '?project=p1' + (item ? '&item=' + item : ''));
    const cal = { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] };
    const sq = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
    plans = [
      { id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: cal, level: { z0: 0, z1: 10 }, zones: [{ id: 'z1', code: '7411', name: 'SEKTIONSFICKOR', polys: sq(100, 100, 200, 200), rule: { field: 'auto' } }] },
      { id: 'B', name: 'Plan 2', file_path: 'b.pdf', calib: cal, level: { z0: 10, z1: 20 }, zones: [{ id: 'w1', code: '9001', polys: sq(100, 100, 200, 200), rule: { field: 'auto' } }] }];
    pdfCache.set('A', new Uint8Array([1]).buffer); pdfCache.set('B', new Uint8Array([2]).buffer);
    items = [{ id: 'i5', object_name: 'K10', activity: 'Pelare', start_date: '2026-09-01', end_date: '2026-12-01', status: 'pagaende', progress: 40 },
      { id: 'i9', object_name: 'X9', activity: 'Utan plats', start_date: '2026-09-01', end_date: '2026-12-01', progress: 0 }];
    positions = [{ id: 'i5', x: 15, y: 15, z0: 12, z1: 13, x0: 14, x1: 16, y0: 14, y1: 16 }];
    itemCodeCache.clear(); renderPlanSelect();
    await openPlan('A');
    selectedObjId = null;
    const b = $('itemLinkBanner'); if (b) b.classList.add('hidden');
    await focusItemFromUrl();
    await new Promise(r => setTimeout(r, 400));
    const ban = $('itemLinkBanner'), fc = $('flashCanvas');
    const vp = $('viewport').getBoundingClientRect(), c = toPx([150, 150]);
    return { plan: plan.id, sel: selectedObjId, banner: ban && !ban.classList.contains('hidden') ? ban.textContent : null, flash: !!fc && fc.style.display !== 'none' && fc.width > 0,
      center: [c[0] * view.scale + view.tx - vp.width / 2, c[1] * view.scale + view.ty - vp.height / 2], m40: (toPx([400, 0])[0] - toPx([0, 0])[0]) * view.scale / Math.min(vp.width, vp.height) };
  }, item);
  const r1 = await setup('i5');
  if (r1.plan !== 'B') fail('Länken ska öppna arbetsytan där aktiviteten ligger (höjden avgör): ' + JSON.stringify(r1));
  if (r1.sel !== 'i5' || !r1.flash) fail('Aktiviteten ska markeras och blinka: ' + JSON.stringify(r1));
  if (!/K10 – Pelare/.test(r1.banner || '') || !/Pågående · 40 %/.test(r1.banner) || !/Zon 9001/.test(r1.banner) || !/Plan 2/.test(r1.banner)) fail('Rutan ska visa namn, status, framdrift, zon och arbetsyta: ' + JSON.stringify(r1));
  if (Math.abs(r1.center[0]) > 2 || Math.abs(r1.center[1]) > 2 || r1.m40 < 0.8 || r1.m40 > 1.2) fail('Aktiviteten ska vara centrerad, inzoomad så att ca 40 m runt den syns: ' + JSON.stringify(r1));
  console.log('OK: länken öppnar rätt arbetsyta, zoomar in, markerar och blinkar aktiviteten och visar status och zon');
  const r2 = await setup('i9');
  if (r2.plan !== 'A' || !/Ingen position på kartan/.test(r2.banner || '')) fail('Utan position: säg det, stanna kvar: ' + JSON.stringify(r2));
  const r3 = await setup('borta');
  if (!/finns inte längre/.test(r3.banner || '')) fail('Borttagen aktivitet: ' + JSON.stringify(r3));
  const r4 = await setup(null);
  if (r4.banner) fail('Utan item i länken ska ingen ruta visas');
  console.log('OK: aktivitet utan position, borttagen aktivitet och vanlig start hanteras');
  await page.click('#itemLinkBanner .ilb-x').catch(() => {});
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
