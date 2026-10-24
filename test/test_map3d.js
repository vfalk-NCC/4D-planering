// Bakgrundskarta i 3D (kartplattor + höjdplattor, SWEREF 99 20 15) – Victor 2026-10-24.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9014;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
// pako (komprimering av CAD-geometrin): en enkel ersättare – testet läser aldrig tillbaka filen.
const PAKO = `window.pako = { gzip: s => new TextEncoder().encode(String(s)), ungzip: (u, o) => new TextDecoder().decode(u) };`;
const DXF = n => ['0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '8', n, '10', '6512340', '20', '150110', '11', '6512345', '21', '150110', '0', 'ENDSEC', '0', 'EOF', ''].join('\n');

const zlib = require('zlib');
const crc = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return b => { let c = 0xFFFFFFFF; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }; })();
const png = (w, h, rgba) => { const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; for (let x = 0; x < w; x++) rgba(x, y).forEach((v, i) => { raw[y * (w * 4 + 1) + 1 + x * 4 + i] = v; }); }
  const chunk = (t, d) => { const b = Buffer.concat([Buffer.from(t), d]), o = Buffer.alloc(4 + b.length + 4); o.writeUInt32BE(d.length, 0); b.copy(o, 4); o.writeUInt32BE(crc(b), 4 + b.length); return o; };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); };

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: /pako/.test(r.request().url()) ? PAKO : PDFJS }));
  const gh = new Map();
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
    const body = JSON.parse(req.postData() || '{}'); gh.set(f, Buffer.from(body.content || '', 'base64').toString());
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
  });
  const tile = png(8, 8, (x, y) => [200, 220, 200, 255]), dem = png(8, 8, () => [128, 10, 0, 255]);   // jämn karta; höjd 10 m (128·256 + 10 − 32768)
  let hits = { osm: 0, dem: 0 };
  await page.route('https://tile.openstreetmap.org/**', r => { hits.osm++; r.fulfill({ contentType: 'image/png', body: tile, headers: { 'access-control-allow-origin': '*' } }); });
  await page.route('https://s3.amazonaws.com/elevation-tiles-prod/**', r => { hits.dem++; r.fulfill({ contentType: 'image/png', body: dem, headers: { 'access-control-allow-origin': '*' } }); });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => { plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[150100, 6512300, 3], [150200, 6512300, 3]], pdf: [[0, 0], [1000, 0]] }, zones: [] }]; pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A'); });
  await page.click('#btn3d'); await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  const rt = await page.evaluate(() => { const z = l3mapZone(), [la, lo] = l3mapModelToGeo(150100, 6512300, z), back = l3mapGeoToModel(la, lo, z), fw = geodeticToGrid(60, 20.25, z), inv = l3mapGridToGeo(fw[0], fw[1], z); return { zone: z.name, la, lo, dx: back[0] - 150100, dy: back[1] - 6512300, d1: Math.abs(inv[0] - 60), d2: Math.abs(inv[1] - 20.25) }; });
  if (rt.zone !== 'SWEREF 99 20 15' || Math.abs(rt.dx) > 0.01 || Math.abs(rt.dy) > 0.01 || rt.d1 > 1e-7 || rt.d2 > 1e-7 || rt.la < 58 || rt.la > 59.5 || rt.lo < 20 || rt.lo > 20.5) fail('SWEREF ↔ lat/lon: ' + JSON.stringify(rt));
  console.log('OK: SWEREF 99 20 15 ↔ WGS84 (' + rt.la.toFixed(4) + ', ' + rt.lo.toFixed(4) + ') tur och retur inom 1 cm');
  // Karta på: plattor hämtas, nätet ligger kring origo och är plant vid planens höjd
  await page.evaluate(() => { l3SetPref('mapOn', true); l3SetPref('mapR', 0.5); l3mapRefresh(true); });
  await page.waitForFunction(() => l3map.stats && l3map.stats.ok > 0 && l3.groups.map.children.length > 0, null, { timeout: 15000 });
  const m1 = await page.evaluate(() => { const g = l3.groups.map; const bb = new THREE.Box3().setFromObject(g); return { n: g.children.length, st: l3map.stats, min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z], zs: l3sZ(), lic: !!document.getElementById('v3MapLic') && !document.getElementById('v3MapLic').classList.contains('hidden') }; });
  if (!(m1.min[0] < -200 && m1.max[0] > 200 && m1.min[1] < -200 && m1.max[1] > 200) || Math.abs(m1.min[2] - (m1.zs - 0.2)) > 0.01 || !m1.lic || !hits.osm) fail('Karta (plan): ' + JSON.stringify(m1) + ' ' + JSON.stringify(hits));
  console.log('OK: bakgrundskarta – ' + m1.n + ' plattor kring origo, plan vid ' + m1.zs.toFixed(1) + ' m, källhänvisning');
  // Terräng: följer höjddata (10 m) med överdrift
  await page.evaluate(() => { l3SetPref('mapTerrain', true); l3SetPref('mapEx', 2); l3mapRefresh(true); });
  await page.waitForFunction(() => l3map.stats && l3map.stats.terrain && l3.groups.map.children.length > 0, null, { timeout: 15000 });
  const m2 = await page.evaluate(() => { const bb = new THREE.Box3().setFromObject(l3.groups.map); return { z: bb.min.z, exp: (10 - l3.O[2]) * 2 - 0.2, dem: l3map.stats.terrain }; });
  if (Math.abs(m2.z - m2.exp) > 0.05) fail('Karta (terräng): ' + JSON.stringify(m2));
  console.log('OK: bakgrundskarta med markhöjd – höjd ' + m2.z.toFixed(2) + ' m (överdrift 2×)');
  // Lager: sektionen med switch och kugghjul; av = dold
  const ui = await page.evaluate(async () => { l3PalTab('layers'); await new Promise(r => setTimeout(r, 300)); l3LayersRender(); const sec = !!document.querySelector('[data-lsec="map"]'), gear = !!document.querySelector('[data-ldd="mapset"]'), sw = document.querySelector('[data-lmapsw]'); sw.checked = false; sw.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 400)); return { sec, gear, off: l3.groups.map.visible === false }; });
  if (!ui.sec || !ui.gear || !ui.off) fail('Lager → Bakgrundskarta: ' + JSON.stringify(ui));
  console.log('OK: Lager – bakgrundskarta med switch och inställningar');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close(); console.log('OK test_map3d');
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
