const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9296;
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
  }, '');
  const ok = (c, m) => { if (!c) fail(m); };
  const R = await page.evaluate(async () => {
    plan.calib = { model: [[150100, 6512300, 0], [150200, 6512300, 0]], pdf: [[0, 0], [1000, 0]] };
    const zone = SWEREF_ZONES.find(z => z.name === 'SWEREF 99 20 15'), tm = SWEREF_ZONES.find(z => z.name === 'SWEREF 99 TM');
    const [lat, lon] = l3mapGridToGeo(6512300, 150100, zone), [lat2, lon2] = l3mapGridToGeo(6512400, 150250, zone);
    const F = (name, text, type = 'text/plain') => new File([text], name, { type });
    const geo = async f => { const r = await cadvConvert(f, [f], { anchor: plan.calib.model[0] }); const g = dxfToGeometry(parseDxf(r.dxf)); const lines = g.filter(x => x.pts && x.pts.length >= 4); return { r, g, first: lines[0] && [lines[0].pts[0], lines[0].pts[1]], n: g.length, layers: r.layers }; };
    const out = {};
    out.geojson = await geo(F('a.geojson', JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Ledning' }, geometry: { type: 'LineString', coordinates: [[lon, lat], [lon2, lat2]] } }, { type: 'Feature', properties: { name: 'Hus' }, geometry: { type: 'Polygon', coordinates: [[[lon, lat], [lon2, lat], [lon2, lat2], [lon, lat]]] } }] })));
    out.kml = await geo(F('a.kml', `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder><name>Grävning</name><Placemark><name>A</name><LineString><coordinates>${lon},${lat},0 ${lon2},${lat2},0</coordinates></LineString></Placemark></Folder></Document></kml>`));
    out.gpx = await geo(F('a.gpx', `<gpx><trk><trkseg><trkpt lat="${lat}" lon="${lon}"><ele>5</ele></trkpt><trkpt lat="${lat2}" lon="${lon2}"><ele>6</ele></trkpt></trkseg></trk></gpx>`));
    // Shapefile i SWEREF 99 TM (.prj) – ska läggas om till zonen 20 15
    const [N1, E1] = geodeticToGrid(lat, lon, tm), [N2, E2] = geodeticToGrid(lat2, lon2, tm);
    const shp = new ArrayBuffer(100 + 8 + 44 + 8 + 32), dv = new DataView(shp); dv.setInt32(0, 9994, false); dv.setInt32(24, shp.byteLength / 2, false); dv.setInt32(28, 1000, true); dv.setInt32(32, 3, true);
    let o = 100; dv.setInt32(o, 1, false); dv.setInt32(o + 4, (44 + 32) / 2, false); o += 8; dv.setInt32(o, 3, true); dv.setInt32(o + 36, 1, true); dv.setInt32(o + 40, 2, true); dv.setInt32(o + 44, 0, true); dv.setFloat64(o + 48, E1, true); dv.setFloat64(o + 56, N1, true); dv.setFloat64(o + 64, E2, true); dv.setFloat64(o + 72, N2, true);
    const dbf = new Uint8Array(32 + 32 + 1 + 1 + 10), dd = new DataView(dbf.buffer); dbf[0] = 3; dd.setUint32(4, 1, true); dd.setUint16(8, 65, true); dd.setUint16(10, 11, true); 'NAME'.split('').forEach((c, i) => { dbf[32 + i] = c.charCodeAt(0); }); dbf[32 + 11] = 67; dbf[32 + 16] = 10; dbf[64] = 0x0d; dbf[65] = 0x20; 'Vattenledn'.split('').forEach((c, i) => { dbf[66 + i] = c.charCodeAt(0); });
    const files = [new File([shp], 'va.shp'), new File([dbf], 'va.dbf'), F('va.prj', 'PROJCS["SWEREF99_TM",GEOGCS["GCS_SWEREF99"],AUTHORITY["EPSG","3006"]]')];
    out.shp = await geo(files[0]); out.shpFiles = await (async () => { const r = await cadvConvert(files[0], files, {}); return /Vattenledn/.test(r.dxf); })();
    out.svg = await geo(F('a.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect x="0" y="0" width="10" height="5"/><path d="M0 0 L20 0 L20 10 Z"/></svg>'));
    out.csv = await (async () => { const r = await cadvConvert(F('punkter.csv', 'P1;6512300;150100;12.5\nP2;6512310;150110;13.5\n'), [], {}); return { dxf: r.dxf, g: dxfToGeometry(parseDxf(r.dxf)) }; })();
    out.csvHdr = await (async () => { const r = await cadvConvert(F('p2.csv', 'Namn;X;Y;Z\nA;150100;6512300;1\nB;150101;6512301;2\n'), [], {}); return /150100\.000/.test(r.dxf) && /6512300\.000/.test(r.dxf); })();
    out.lx = await geo(F('a.xml', `<?xml version="1.0"?><LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2"><Units><Metric linearUnit="meter"/></Units><CgPoints><CgPoint name="P7">6512300 150100 10</CgPoint></CgPoints><Alignments><Alignment name="V1"><CoordGeom><Line><Start>6512300 150100</Start><End>6512400 150250</End></Line></CoordGeom></Alignment></Alignments></LandXML>`));
    out.expect = { E1: 150100, N1: 6512300, E2: 150250, N2: 6512400 };
    return out;
  });
  const near = (a, b, t = 0.05) => Math.abs(a - b) < t;
  const e = R.expect;
  ok(R.geojson.first && near(R.geojson.first[0], e.E1) && near(R.geojson.first[1], e.N1), 'GeoJSON (WGS84) ska bli SWEREF 99 20 15: ' + JSON.stringify(R.geojson.first));
  ok(R.geojson.layers.length >= 1 && R.geojson.n >= 2, 'GeoJSON: linje och yta: ' + JSON.stringify(R.geojson.layers));
  ok(R.kml.first && near(R.kml.first[0], e.E1) && near(R.kml.first[1], e.N1) && R.kml.layers.includes('Grävning'), 'KML: ' + JSON.stringify([R.kml.first, R.kml.layers]));
  ok(R.gpx.first && near(R.gpx.first[0], e.E1) && near(R.gpx.first[1], e.N1), 'GPX: ' + JSON.stringify(R.gpx.first));
  ok(R.shp.first && near(R.shp.first[0], e.E1, 0.1) && near(R.shp.first[1], e.N1, 0.1) && R.shpFiles, 'Shapefile i SWEREF 99 TM ska läggas om till zonen 20 15 (med attribut): ' + JSON.stringify(R.shp.first));
  ok(R.svg.n >= 2 && R.svg.first && near(R.svg.first[0], 150090, 0.01) && near(R.svg.first[1], 6512305, 0.01), 'SVG ska läggas vid planens kalibreringspunkt: ' + JSON.stringify(R.svg.first));
  ok(R.csv.g.length >= 2 && /P1/.test(R.csv.dxf) && /150100\.000/.test(R.csv.dxf) && /6512300\.000/.test(R.csv.dxf), 'CSV norr;öst ska bytas till öst;norr: ' + R.csv.dxf.slice(0, 300));
  ok(R.csvHdr, 'CSV med rubriker X;Y;Z');
  ok(R.lx.first && near(R.lx.first[0], 150100, 0.01) && near(R.lx.first[1], 6512300, 0.01) && R.lx.layers.some(l => /Linjeföring/.test(l)), 'LandXML (N E) ska bli öst/norr: ' + JSON.stringify(R.lx.first));
  ok(!errors.length, 'JS-fel: ' + errors.join('|'));
  console.log('OK: fler ritningsformat – GeoJSON, KML, GPX, Shapefile (+prj/dbf), SVG, CSV, LandXML omvandlas till rätt koordinater');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
