// 3D-objekten som IFC (Victors önskemål 2026-10-05): samma som DXF:en fast i 3D – en cylinder i
// statusfärg ovanpå varje objekts högsta punkt och en stående 3D-text med namnet ovanför, vänd i
// Lägesplans läsriktning. IFC4, modellens koordinater i meter, egenskaper på cylindern.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8979;
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
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = [
      { id: 'i1', object_name: 'K10', activity: 'Pelare', start_date: '2026-09-01', end_date: '2026-12-01', status: 'pagaende', progress: 40, contractor: 'NCC' },
      { id: 'i2', group_id: 'G1', object_name: 'M30', activity: 'Gjutning väggar', start_date: '2020-01-01', end_date: '2020-02-01', status: 'klar', progress: 100, actual_end_date: '2020-02-01' },
      { id: 'i3', group_id: 'G1', object_name: 'M31', activity: 'Gjutning väggar', start_date: '2020-01-01', end_date: '2020-02-01', status: 'klar', progress: 100, actual_end_date: '2020-02-01' },
    ];
    positions = [
      { id: 'i1', x: 6512345.5, y: 150123.25, z0: 10, z1: 14.2 },
      { id: 'i2', x: 6512350, y: 150130, z0: 0, z1: 2 },
      { id: 'i3', x: 6512354, y: 150130, z0: 0, z1: 3.5 },
    ];
    renderPlanSelect(); await openPlan('A');
    view.rot = 0.6; applyView();
    $('showObjects').checked = true; invalidateVisible(); invalidatePositions(); renderZones();
    const calls = []; let got = null;
    downloadBlob = (blob, name) => { got = { blob, name }; };
    askOpener = async (type, extra) => { calls.push([type, extra.folder, extra.files[0].name]); return { folder: extra.folder }; };
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    $('cadExportToTc').checked = true;
    await exportObjectsIfc();
    const text = await got.blob.text();
    // Läsriktningen på skärmen (samma beräkning som för DXF:en).
    const rr = dxfTextRotation() * Math.PI / 180;
    const scr = mp => { const s = toPx(modelToPdf(mp[0], mp[1])); return rotAbout([s[0] * view.scale + view.tx, s[1] * view.scale + view.ty], view.rot); };
    const a = scr([6512345, 150123]), b = scr([6512345 + Math.cos(rr) * 10, 150123 + Math.sin(rr) * 10]);
    return { text, name: got.name, calls, status: $('saveStatus').textContent, dir: [b[0] - a[0], b[1] - a[1]], rr };
  });
  require('fs').writeFileSync(require('path').join(process.env.IFC_OUT || require('os').tmpdir(), 'objekt-test.ifc'), r.text);
  const t = r.text;
  if (!/^3D-objekt Plan 1 .*\.ifc$/.test(r.name) || !/FILE_SCHEMA\(\('IFC4'\)\)/.test(t) || !/IFCSIUNIT\(\*,\.LENGTHUNIT\.,\$,\.METRE\.\)/.test(t)) fail('IFC4 i meter med rätt filnamn');
  // Alla referenser finns.
  const defs = new Map([...t.matchAll(/^#(\d+)=([A-Z0-9]+)\((.*)\);$/gm)].map(m => [m[1], { type: m[2], args: m[3] }]));
  const refs = [...t.matchAll(/#(\d+)/g)].map(m => m[1]);
  const missing = refs.filter(x => !defs.has(x));
  if (missing.length) fail('Referenser som saknas: ' + missing.slice(0, 5));
  if ([...defs.values()].some(d => /[A-Z]+\([^']*IFC(?!LABEL|REAL)[A-Z]+\(/.test(d.args))) fail('Inga inbäddade entiteter (STEP kräver referenser)');
  const of = type => [...defs.values()].filter(d => d.type === type);
  const proxies = of('IFCBUILDINGELEMENTPROXY');
  const markers = proxies.filter(p => /'4D-markering'/.test(p.args)), texts = proxies.filter(p => /'4D-text'/.test(p.args));
  if (markers.length !== 2 || texts.length !== 2) fail('En cylinder och en text per markering: ' + proxies.length);
  if (!/'K10'/.test(markers.map(m => m.args).join()) || !(/'M30 \(2\)'/.test(t) && /IFCLABEL\('Gjutning v\\X2\\00E4\\X0\\ggar'\)/.test(t))) fail('Namnen (å/ä/ö som \\X2\\): ' + markers.map(m => m.args.slice(0, 80)).join(' | '));
  // Placering: cylindern ovanpå högsta punkten (+ 0,1 m).
  const ptOf = pl => { const ax = defs.get(/#(\d+)$/.exec(defs.get(pl).args)[1]); const p = defs.get(/^#(\d+)/.exec(ax.args)[1]); return p.args.replace(/[()]/g, '').split(',').map(Number); };
  const k10 = markers.find(m => /'K10'/.test(m.args)), m30 = markers.find(m => /M30/.test(m.args));
  const plOf = m => /,'4D-markering',#(\d+),/.exec(m.args)[1];
  const pk = ptOf(plOf(k10)), pm = ptOf(plOf(m30));
  if (Math.abs(pk[0] - 6512345.5) > 0.001 || Math.abs(pk[1] - 150123.25) > 0.001 || Math.abs(pk[2] - 14.3) > 0.001) fail('K10: cylindern ska stå på objektets högsta punkt i modellens koordinater: ' + pk);
  if (Math.abs(pm[0] - 6512352) > 0.001 || Math.abs(pm[2] - 3.6) > 0.001) fail('M30 (två objekt): mitten och den högsta punkten av dem: ' + pm);
  // Egenskaper på cylindern.
  if (!/IFCPROPERTYSET\('[^']+',\$,'4D-planering'/.test(t) || !/'Aktivitet',\$,IFCLABEL\('Pelare'\)/.test(t) || !/'Framdrift %',\$,IFCREAL\(40\.\)/.test(t) || !/'Entrepren\\X2\\00F6\\X0\\r',\$,IFCLABEL\('NCC'\)/.test(t)) fail('Egenskaperna på cylindern');
  // Texten: liggande (läses uppifrån), 0,5 m tjock, bredvid cylindern i läsriktningen, centrerad på tvären.
  const pls = of('IFCCARTESIANPOINTLIST3D').map(d => d.args.match(/\(([-\d.eE]+),([-\d.eE]+),([-\d.eE]+)\)/g).map(s => s.replace(/[()]/g, '').split(',').map(Number)));
  const rx = Math.cos(r.rr), ry = Math.sin(r.rr);
  pls.forEach(pl3 => {
    const zs = pl3.map(p => p[2]), al = pl3.map(p => p[0] * rx + p[1] * ry), ac = pl3.map(p => -p[0] * ry + p[1] * rx);
    if (Math.abs(Math.min(...zs)) > 0.001 || Math.abs(Math.max(...zs) - 0.5) > 0.001) fail('Bokstäverna ska vara 0,5 m tjocka (z 0–0,5): ' + [Math.min(...zs), Math.max(...zs)]);
    if (Math.min(...al) < 0.25 || Math.max(...al) - Math.min(...al) < 1.5) fail('Texten ska börja vid cylinderns kant och gå i läsriktningen: ' + [Math.min(...al), Math.max(...al)]);
    if (Math.max(...ac) > 0.6 || Math.min(...ac) < -0.6) fail('Texten ska ligga centrerad på tvären (0,8 m hög i plan): ' + [Math.min(...ac), Math.max(...ac)]);
  });
  if (!of('IFCTRIANGULATEDFACESET').every(d => /,\.T\.,/.test(d.args))) fail('Bokstäverna ska vara slutna kroppar');
  if (!(r.dir[0] > 0 && Math.abs(r.dir[1]) < Math.abs(r.dir[0]) * 0.01)) fail('Läsriktningen ska vara vågrät åt höger i vyn: ' + JSON.stringify(r.dir));
  console.log('OK: IFC4 i meter – cylinder på högsta punkten, liggande 3D-text (0,5 m tjock) i läsriktningen, egenskaper, inga trasiga referenser');
  if (r.calls.length !== 1 || r.calls[0][1] !== 'Lägesplan export' || !/\.ifc$/.test(r.calls[0][2]) || !/sparade i Trimble Connect/.test(r.status)) fail('Lokal kopia och Trimble Connect som för DXF:en: ' + JSON.stringify(r.calls) + r.status);
  console.log('OK: IFC-exporten laddas ned lokalt och sparas i Trimble Connect (Lägesplan export)');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
