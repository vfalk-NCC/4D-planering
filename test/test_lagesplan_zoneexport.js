// Zonerna till Excel (Victors önskemål 2026-10-05): Lägesplan räknar fram zon och överzon per
// aktivitet för alla arbetsytor (position i 3D eller zonkod) och sparar zone_export.json – bara
// när innehållet ändrats. Makrot "Hämta från 4D" i Excel läser filen.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8983;
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
  const r = await page.evaluate(async () => {
    const cal = { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] }; // 10 PDF-enheter per meter
    const sq = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
    plans = [
      { id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: cal, level: { z0: 0, z1: 10 }, zones: [
        { id: 'z1', code: '7411', name: 'SEKTIONSFICKOR', parent: '741 Sektionsfickor', polys: sq(100, 100, 200, 200), rule: { field: 'auto' } },
        { id: 'z2', code: '7412', parent: '741 sektionsfickor', polys: sq(200, 100, 300, 200), rule: { field: 'auto' } },
        { id: 'z3', code: 'PM07', polys: [], rule: { field: 'auto' } }] },
      { id: 'B', name: 'Plan 2', file_path: 'b.pdf', calib: cal, level: { z0: 10, z1: 20 }, zones: [
        { id: 'w1', code: '9001', polys: sq(100, 100, 200, 200), rule: { field: 'auto' } }] },
      { id: 'C', name: 'Utan zoner', file_path: 'c.pdf', zones: [] }];
    const it = (id, extra) => ({ id, object_name: id, activity: 'Akt ' + id, area: 'Hus', start_date: '2026-09-01', end_date: '2026-12-01', status: 'pagaende', progress: 50, ...extra });
    items = [it('i1'), it('i2', { progress: 100, status: 'klar' }), it('i3', { area: 'Hus PM07' }), it('i4'), it('i5')];
    positions = [
      { id: 'i1', x: 15, y: 15, z0: 1, z1: 2 },   // plan 1, zon 7411
      { id: 'i2', x: 25, y: 15, z0: 1, z1: 2 },   // plan 1, zon 7412
      { id: 'i4', x: 50, y: 50, z0: 1, z1: 2 },   // ingen zon
      { id: 'i5', x: 15, y: 15, z0: 12, z1: 13 }, // plan 2 (annan höjd), zon 9001
    ];
    itemCodeCache.clear();
    const d = zoneExportData();
    // Skrivningen: bara när innehållet ändrats.
    const writes = [];
    ghGetFile = async () => ({ data: null, sha: null });
    ghWriteJSON = async (t, path, fn) => { writes.push([path, fn(null)]); };
    zoneExportSig = null;
    await runZoneExport(); await runZoneExport();
    plans[0].zones[0].name = 'NYTT NAMN';
    await runZoneExport();
    return { d, writes: writes.map(w => [w[0], w[1].zones.length, !!w[1].updated_at]) };
  });
  const byId = Object.fromEntries(r.d.items.map(x => [x.id, x]));
  if (!byId.i1 || byId.i1.zones !== '7411 SEKTIONSFICKOR (Plan 1)' || byId.i1.parents !== '741 Sektionsfickor') fail('i1 ska ligga i 7411 med överzonen: ' + JSON.stringify(r.d.items));
  if (!byId.i2 || byId.i2.zones !== '7412 (Plan 1)' || byId.i2.parents !== '741 sektionsfickor') fail('i2 ska ligga i 7412: ' + JSON.stringify(byId.i2));
  if (!byId.i3 || byId.i3.zones !== 'PM07 (Plan 1)') fail('i3 ska kopplas på zonkoden: ' + JSON.stringify(byId.i3));
  if (byId.i4) fail('i4 ligger inte i någon zon');
  if (!byId.i5 || byId.i5.zones !== '9001 (Plan 2)') fail('i5 ska ligga i plan 2 (höjden avgör): ' + JSON.stringify(byId.i5));
  const z1 = r.d.zones.find(z => z.code === '7411');
  if (!z1 || z1.area_m2 !== 100 || z1.items !== 1 || z1.progress !== 50 || z1.status !== 'Pågående' || z1.start !== '2026-09-01' || z1.plan !== 'Plan 1') fail('Zonens sammanställning: ' + JSON.stringify(z1));
  const p = r.d.parents;
  if (p.length !== 1 || p[0].name !== '741 Sektionsfickor' || p[0].zones !== 2 || p[0].items !== 2 || p[0].area_m2 !== 200 || p[0].progress !== 75) fail('Överzonen (samma oavsett skiftläge) summerar sina zoner: ' + JSON.stringify(p));
  console.log('OK: zon och överzon per aktivitet för alla arbetsytor (position, höjd och zonkod), ytor och status');
  if (r.writes.length !== 2 || !r.writes.every(w => /zone_export\.json$/.test(w[0]) && w[2])) fail('Filen ska skrivas bara när något ändrats: ' + JSON.stringify(r.writes));
  console.log('OK: zone_export.json skrivs bara när innehållet ändrats');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
  console.log('OK: zonerna till Excel');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
