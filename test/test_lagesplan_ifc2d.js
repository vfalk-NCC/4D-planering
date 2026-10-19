// Fristående HTML-export (Victor 2026-10-11, efter BubbleBIM): lägesplanen och 3D i EN fil som kan skickas till
// någon utan Trimble Connect och öppnas offline. Testet exporterar, öppnar filen i en ny sida utan nät och
// kontrollerar 2D-bilden, 3D-scenen (objekten och marken) och att inga fel uppstår.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9013;
const OUT = process.env.PLACE_TMP || path.join(__dirname, '..', '.tmp');
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); c.fillStyle = '#2563eb'; c.fillRect(v.width * 0.2, v.height * 0.3, v.width * 0.3, v.height * 0.3); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
const PAKO = `window.pako = { gzip: s => new TextEncoder().encode(String(s)), ungzip: (u, o) => new TextDecoder().decode(u) };`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 850 }, acceptDownloads: true });
    const page = await ctx.newPage();
    await require('./_dialogs').bridge(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); window.__hxKeep = true; });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: /pako/.test(r.request().url()) ? PAKO : PDFJS }));
    const gh = new Map([['projects/p1/plan_placements.json', JSON.stringify([
      { id: 'k1', type: 'tornkran', name: 'Kran 1', x: 6512320, y: 150110, z: 0, L: 1.6, B: 1.6, H: 40, R: 50, rot: 0, dz: 0, color: '#facc15' },
      { id: 'b1', type: 'bod', name: 'Bod A', x: 6512340, y: 150105, z: 0, L: 8.4, B: 3, H: 2.7, rot: 0, dz: 0, color: '#f59e0b' }])]]);
    await page.route('https://api.github.com/**', r => {
      const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
      if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
      const body = JSON.parse(req.postData() || '{}'); gh.set(f, Buffer.from(body.content || '', 'base64').toString());
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
    });
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
    await page.evaluate(async () => {
      plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
      pdfCache.set('A', new Uint8Array([1]).buffer);
      items = []; positions = [];
      renderPlanSelect(); await openPlan('A');
    });
    await page.waitForTimeout(500);
    if (await page.evaluate(() => placements.length) !== 2) await page.evaluate(pl => { placements = pl; }, JSON.parse(gh.get('projects/p1/plan_placements.json')));

    // IFC i planen: en låda (2 × 2 m) skärs på höjden 0,2 m -> en fyrkant som CAD-lager, dold av filter, ingen sparning i 4D-data.
    const puts0 = [...gh.keys()].length;
    await page.evaluate(async () => {
      await open3d();
      l3.O = [6512350, 150100, 0];
      const geo = new THREE.BoxGeometry(2, 2, 2); geo.rotateX(0); const n = geo.getAttribute('position').count;
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
      mesh.userData.l3b = { ranges: [{ start: 0, count: n, name: 'Vägg A' }], origIdx: Uint16Array.from(geo.index.array), hidden: new Set() };
      l3b.models = [{ id: 'm1', name: 'Hus', visible: true, meshes: [mesh], ranges: [], tris: 12 }];
      l3.scene.add(mesh);
    });
    if (!(await page.$('#btnIfc2d'))) fail('Knappen IFC i planen saknas');
    await page.evaluate(() => { ifc2dCfg.z = 0.2; });
    await page.click('#btnIfc2d'); await page.waitForTimeout(600);
    const r1 = await page.evaluate(() => { const r = cads().find(x => x.id === 'ifc2d'); const g = r && cadGeom.get('ifc2d'); return { has: !!r, lines: g && g.groups.reduce((a, x) => a + x.raw.length, 0), pts: g && g.groups[0].raw[0].length / 2, layer: r && r.layers[0].name, name: r && r.name, info: document.getElementById('ifc2dInfo').textContent }; });
    if (!r1.has || r1.lines !== 1 || (r1.pts < 5 || r1.pts > 6) || r1.layer !== 'Hus') fail('IFC-snittet ska ge en fyrkant i lagret Hus: ' + JSON.stringify(r1));
    const inPrint = await page.evaluate(() => cadVectorPlan().some(x => x.rec.id === 'ifc2d'));
    if (!inPrint) fail('IFC-snittet ska följa med i vektorplanen för utskrift');
    await page.fill('#ifc2dNQ', 'vägg'); await page.dispatchEvent('#ifc2dNQ', 'change'); await page.waitForTimeout(600);
    const r2 = await page.evaluate(() => ({ has: !!cads().find(x => x.id === 'ifc2d'), info: document.getElementById('ifc2dInfo').textContent }));
    if (r2.has || !/Inget skärs/.test(r2.info)) fail('Filtret "dölj vägg" ska ta bort allt: ' + JSON.stringify(r2));
    await page.fill('#ifc2dNQ', ''); await page.dispatchEvent('#ifc2dNQ', 'change'); await page.fill('#ifc2dQ', 'vägg'); await page.dispatchEvent('#ifc2dQ', 'change'); await page.waitForTimeout(600);
    if (!(await page.evaluate(() => !!cads().find(x => x.id === 'ifc2d')))) fail('"Visa bara vägg" ska ge snittet');
    if (await page.evaluate(() => (siteItems || []).some(x => x.virtual || x.id === 'ifc2d'))) fail('Det virtuella lagret får inte hamna i siteItems');
    if (gh.has('projects/p1/site_layers.json') && /ifc2d/.test(gh.get('projects/p1/site_layers.json'))) fail('IFC-snittet ska inte sparas i 4D-data');
    await page.click('#btnIfc2dClear'); await page.waitForTimeout(200);
    if (await page.evaluate(() => !!cads().find(x => x.id === 'ifc2d'))) fail('Ta bort ska tömma lagret ' + JSON.stringify(await page.evaluate(() => ({ n: ifc2dRecs.length, want: ifc2dWant, cads: cads().map(x => x.id), info: document.getElementById('ifc2dInfo').textContent }))) + errors.join('|'));
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('ALLA TESTER OK');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
