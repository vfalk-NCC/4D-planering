// Exportera 3D-objekt (DXF/IFC): Excel-planeringens punkter som syns tas med, och manuella justeringar av plushöjd/kommentar följer med.
// Zonerna till Excel (Victors önskemål 2026-10-05): Lägesplan räknar fram zon och överzon per
// aktivitet för alla arbetsytor (position i 3D eller zonkod) och sparar zone_export.json – bara
// när innehållet ändrats. Makrot "Hämta från 4D" i Excel läser filen.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8990;
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
  await require('./_dialogs').bridge(page); // appens egna dialogrutor
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  const r = await page.evaluate(async () => {
    const cal = { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] };
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: cal, level: { z0: 0, z1: 10 }, zones: [] }]; plan = plans[0]; planSource = 'pp';
    const it = (id, extra) => ({ id, object_name: id, activity: 'Akt ' + id, area: 'Hus', start_date: '2026-09-01', end_date: '2026-12-01', status: 'pagaende', progress: 50, ...extra });
    items = [it('p1')]; positions = [{ id: 'p1', x: 15, y: 15, z0: 1, z1: 2 }];
    xls.items = [it('x1', { object_name: 'L12' }), it('x2', { object_name: 'K14' })]; xls.positions = [{ id: 'x1', x: 30, y: 20, z0: 1, z1: 4.5 }, { id: 'x2', x: 40, y: 20, z0: 1, z1: 3 }]; xls.posPdf = null;
    const sho = document.getElementById('showObjects'); if (sho) sho.checked = true; invalidatePositions();
    const marks = objExportMarkers(), dxf0 = buildObjectsDxf(), ifc0 = buildObjectsIfc();
    exportAdjSet('xl:x1', { z: 7.5, comment: 'Kolla höjden' }); exportAdjSave();
    const m2 = objExportMarkers().find(m => m.key === 'xl:x1'), dxf1 = buildObjectsDxf(), ifc1 = buildObjectsIfc();
    exportAdjSet('xl:x1', { z: NaN, comment: '' }); exportAdjSave(); const back = objExportMarkers().find(m => m.key === 'xl:x1');
    return { keys: marks.map(m => m.key), srcs: marks.map(m => m.src), n: dxf0 && dxf0.n, nIfc: ifc0 && ifc0.n, txtL12: dxf0 && /L12/.test(dxf0.text), ifcL12: /L12/.test(ifc0.text) && /K14/.test(ifc0.text), z0: marks.find(m => m.key === 'xl:x1').zTop,
      zManual: m2.zTop, flag: m2.zManual, cmt: m2.adj && m2.adj.comment, dxfZ: /\r\n30\r\n7\.500\r\n/.test(dxf1.text), dxfCmt: /Kolla/.test(dxf1.text) && /4D-KOMMENTAR/.test(dxf1.text), ifcCmt: /Kolla/.test(ifc1.text) && /manuell/.test(ifc1.text) && /7\.6/.test(ifc1.text), backZ: back.zTop, backFlag: !!back.zManual };
  });
  if (r.keys.length !== 3 || !r.keys.includes('xl:x1') || !r.keys.includes('xl:x2') || !r.srcs.includes('Excel-planeringen') || r.n !== 3 || r.nIfc !== 3 || !r.txtL12 || !r.ifcL12) fail('Excel-punkterna tas med i DXF och IFC: ' + JSON.stringify(r));
  if (r.z0 !== 4.5 || r.zManual !== 7.5 || !r.flag || r.cmt !== 'Kolla höjden' || !r.dxfZ || !r.dxfCmt || !r.ifcCmt || r.backZ !== 4.5 || r.backFlag) fail('Manuell plushöjd och kommentar: ' + JSON.stringify(r));
  console.log('OK: Excel-punkterna följer med i 3D-objekt-exporten, manuell plushöjd/kommentar läggs på och kan återställas', JSON.stringify(r.keys));
  // Dialogen: flera markerade ändras samtidigt
  await page.evaluate(() => exportAdjOpen()); await page.waitForSelector('#exportAdjDlg');
  await page.click('#eaAll'); await page.fill('#eaZ', '9'); await page.click('#eaZSet');
  const z9 = await page.evaluate(() => objExportMarkers().map(m => [m.key, m.zTop, m.zManual]));
  if (z9.length !== 3 || !z9.every(x => x[1] === 9 && x[2])) fail('Sätt höjd för alla markerade: ' + JSON.stringify(z9));
  await page.fill('#eaDz', '-1.5'); await page.click('#eaDzSet'); const z75 = await page.evaluate(() => objExportMarkers().map(m => m.zTop)); if (!z75.every(v => v === 7.5)) fail('Höj/sänk markerade: ' + JSON.stringify(z75));
  await page.fill('#eaC', 'Justerad'); await page.click('#eaCSet'); const cm = await page.evaluate(() => objExportMarkers().filter(m => m.adj && m.adj.comment === 'Justerad').length); if (cm !== 3) fail('Kommentar på alla markerade: ' + cm);
  await page.click('#eaReset'); const rs = await page.evaluate(() => objExportMarkers().filter(m => m.zManual || m.adj).length); if (rs !== 0) fail('Återställ markerade: ' + rs);
  console.log('OK: justeringsdialogen – markera alla, sätt höjd, höj/sänk, kommentar, återställ', JSON.stringify({ z9: z9.length, cm }));
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_objexport');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
