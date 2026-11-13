// Punktmoln → mesh (TIN/rutnät, färger, DXF/IFC)
// (mall: pcslice): en LAS-fil per zon/överzon och en fil för det som ligger utanför, samlade i en ZIP.
// cachen sparas en ruta åt gången och läses tillbaka identiskt, bygget görs i delar utan att blockera, inläsningen kan avbrytas
// och en läsare som slutar svara avbryts av ett hängskydd, och molnen delar på ett gemensamt punkttak.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9136;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => { c.fillStyle = '#fff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} }; } };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { const u = q.url.split('?')[0]; r.writeHead(200, { 'Content-Type': u.endsWith('.js') ? 'application/javascript' : u.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  try {
    const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
    await require('./_dialogs').bridge(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
    await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
    await page.evaluate(async () => { plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[637000, 849000, 400], [637100, 849000, 400]], pdf: [[0, 0], [1000, 0]] }, zones: [] }]; pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A'); open3d(); });
    await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3pcBuild === 'function', null, { timeout: 20000 });

    await page.evaluate(() => {
      plan.zones = [
        { id: 'zA', code: '7421', name: 'Förtjockardelen', parent: '742 Sikthall', polys: [[[100, 100], [300, 100], [300, 300], [100, 300]]] },
        { id: 'zB', code: '7422', name: 'Sikten', parent: '742 Sikthall', polys: [[[500, 100], [700, 100], [700, 300], [500, 300]]] },
        { id: 'zC', code: '7430', name: 'Lager', polys: [[[100, 330], [200, 330], [200, 380], [100, 380]]] }];
    });
    await page.evaluate(() => {
      const cx = 637050, cy = 849020, cz = 100, L = []; let n = 0;
      for (let i = 0; i < 100; i++) for (let j = 0; j < 40; j++) { const x = 637000.5 + i, y = 849000.5 + j; L.push([x - cx, y - cy, 3 - cz + Math.sin(i / 9) * 2, i, j]); n++; }
      const pos = new Float32Array(n * 3), rgb = new Uint8Array(n * 3), inten = new Uint8Array(n); L.forEach((p, k) => { pos.set(p.slice(0, 3), k * 3); rgb[k * 3] = p[3] * 2; rgb[k * 3 + 1] = p[4] * 5; rgb[k * 3 + 2] = 77; inten[k] = k % 200; });
      const info = { n, total: n, center: [cx, cy, cz], min: [637000.5, 849000.5, 1], max: [637099.5, 849039.5, 5], rgb: true, intensity: true, format: 'LAS' };
      l3pcBuild({ id: 'pc:mesh', name: 'Skanning.laz' }, { info, chunks: [{ pos, rgb, inten }] });
    });
    // 1. Delaunay: tomma cirklar och rätt antal trianglar på slumpade punkter
    const D = await page.evaluate(() => { let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647, n = 400, X = new Float64Array(n), Y = new Float64Array(n); for (let i = 0; i < n; i++) { X[i] = rnd() * 1000 + 5e5; Y[i] = rnd() * 600 + 6e6; }
      const T = l3pmDelaunay(X, Y); let bad = 0; const nt = T.length / 3;
      for (let t = 0; t < nt; t++) { const a = T[t * 3], b = T[t * 3 + 1], c = T[t * 3 + 2]; const o = (X[b] - X[a]) * (Y[c] - Y[a]) - (Y[b] - Y[a]) * (X[c] - X[a]); if (o <= 0) { bad++; continue; }
        for (let p = 0; p < n; p++) { if (p === a || p === b || p === c) continue; const ax = X[a] - X[p], ay = Y[a] - Y[p], bx = X[b] - X[p], by = Y[b] - Y[p], cx = X[c] - X[p], cy = Y[c] - Y[p]; if ((ax * ax + ay * ay) * (bx * cy - cx * by) - (bx * bx + by * by) * (ax * cy - cx * ay) + (cx * cx + cy * cy) * (ax * by - bx * ay) > 1e-6) { bad++; break; } } }
      return { nt, bad }; });
    if (D.bad > 0 || D.nt < 600 || D.nt > 800) fail('Delaunay: ' + JSON.stringify(D));
    console.log('OK: Delaunay-trianglering – alla trianglar moturs och med tom cirkel', JSON.stringify(D));
    // 2. TIN och rutnät från molnet
    const R = await page.evaluate(async () => { const c = l3pc.clouds.find(x => x.id === 'pc:mesh'); const mk = async o => { const r = await l3pmBuild(c, Object.assign({ cell: 2, zmode: 'mean', maxEdge: 6, color: 'rgb' }, o)); return { v: r.V.length, t: r.F.length / 3, area: Math.round(r.area), fc: r.FC.length, c0: r.FC[0] }; };
      return { tin: await mk({ type: 'tin' }), grid: await mk({ type: 'grid' }), min: await mk({ type: 'tin', zmode: 'min' }), none: await mk({ type: 'tin', color: 'none' }), z: await mk({ type: 'tin', color: 'z' }), int: await mk({ type: 'grid', color: 'int' }) }; });
    if (R.tin.v < 900 || R.tin.t < 1500 || R.tin.fc !== R.tin.t) fail('TIN: ' + JSON.stringify(R.tin));
    if (R.grid.t !== 2 * 49 * 19 || R.grid.v !== 50 * 20) fail('Rutnät (2 m): ' + JSON.stringify(R.grid));
    if (Math.abs(R.tin.area - R.grid.area) / R.grid.area > 0.1) fail('Samma yta i TIN och rutnät: ' + JSON.stringify([R.tin.area, R.grid.area]));
    if (R.none.c0[0] !== R.none.c0[1] && R.none.c0[0] !== 160) fail('Ingen färg = grå: ' + JSON.stringify(R.none)); if (JSON.stringify(R.tin.c0) === JSON.stringify(R.z.c0)) fail('Färgläget påverkar färgen: ' + JSON.stringify([R.tin.c0, R.z.c0]));
    console.log('OK: TIN och rutnät, höjd per ruta, färgval', JSON.stringify(R));
    // 2b. Spikar: tre punkter långt över/under molnet och ett flygande brus utanför
    const SP = await page.evaluate(async () => { const c = l3pc.clouds.find(x => x.id === 'pc:mesh'), ch = c.chunks[0], n = ch.pos.length / 3, pos = new Float32Array((n + 4) * 3), rgb = new Uint8Array((n + 4) * 3), inten = new Uint8Array(n + 4); pos.set(ch.pos); rgb.set(ch.rgb); inten.set(ch.inten);
      [[10.3, 5.3, 40], [50.3, 20.3, -30], [80.3, 30.3, 25], [140, 5, 3]].forEach((q, i) => { pos.set([637000.5 + q[0] - 637050, 849000.5 + q[1] - 849020, q[2] - 100], (n + i) * 3); });
      c.chunks[0] = { pos, rgb, inten }; const zr = r => Math.max(...r.V.map(v => v[2])) - Math.min(...r.V.map(v => v[2])), mk = async sp => { const r = await l3pmBuild(c, { type: 'tin', cell: 1, zmode: 'mean', maxEdge: 6, color: 'rgb', spike: sp }); return { z: Math.round(zr(r)), sp: r.spikes, v: r.V.length }; };
      const out = { off: await mk(0), on: await mk(1) }; c.chunks[0] = ch; return out; });
    if (SP.off.z < 30 || SP.on.z > 6 || SP.on.sp < 4) fail('Spikfilter: ' + JSON.stringify(SP));
    console.log('OK: spikfiltret tar bort punkter som sticker iväg', JSON.stringify(SP));
    // 3. Dialogen: skapa, DXF, IFC, i modellen
    await page.evaluate(() => { l3PalTab('layers'); l3LayersRender(); }); await page.waitForSelector('#v3PalLayers [data-pc-more]');
    await page.evaluate(() => document.querySelector('#v3PalLayers [data-pc-more]').click()); await page.evaluate(() => document.querySelector('.v3-pc-menu [data-a="mesh"]').click()); await page.waitForSelector('#l3pmDlg');
    await page.selectOption('#pmType', 'tin'); await page.fill('#pmCell', '2'); await page.selectOption('#pmCol', 'rgb'); await page.click('#pmGo'); await page.waitForFunction(() => !document.getElementById('pmDxf').disabled || /⚠/.test(document.getElementById('pmOut').textContent), null, { timeout: 30000 }); { const t = await page.textContent('#pmOut'); if (/⚠/.test(t)) fail('Dialog: ' + t); }
    const [d1] = await Promise.all([page.waitForEvent('download'), page.click('#pmDxf')]); const dxf = fs.readFileSync(await d1.path(), 'utf8');
    const nf = (dxf.match(/\n3DFACE\n/g) || []).length; if (nf < 1500 || !/\n420\n\d+\n/.test(dxf)) fail('DXF med 3DFACE och färg: ' + nf + ' ' + d1.suggestedFilename());
    const [d2] = await Promise.all([page.waitForEvent('download'), page.click('#pmIfc')]); const ifc = fs.readFileSync(await d2.path(), 'utf8');
    if (!/IFCTRIANGULATEDFACESET/.test(ifc) || !/IFCINDEXEDCOLOURMAP/.test(ifc) || !/IFCCOLOURRGBLIST/.test(ifc) || !/IFCBUILDINGELEMENTPROXY/.test(ifc)) fail('IFC med färgtabell');
    const nIdx = ifc.match(/IFCINDEXEDCOLOURMAP\(#\d+,\$,#\d+,\(([\d,]+)\)\)/); if (!nIdx || nIdx[1].split(',').length !== nf) fail('En färg per triangel i IFC: ' + (nIdx && nIdx[1].split(',').length) + ' / ' + nf);
    const before = await page.evaluate(() => placements.length); await page.click('#pmMod'); const after = await page.evaluate(() => ({ n: placements.length, k: placements[placements.length - 1].m && placements[placements.length - 1].m.k, name: placements[placements.length - 1].name }));
    if (after.n !== before + 1 || after.k !== 'mesh') fail('Meshen i modellen: ' + JSON.stringify(after));
    console.log('OK: dialogen ger DXF (3DFACE + färg), IFC (färgtabell) och ett ritat objekt', JSON.stringify({ nf, name: d1.suggestedFilename() }));
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('OK test_lagesplan_pcmesh');
  } catch (e) { console.error('FEL:', e.message); process.exitCode = 1; }
  finally { await browser.close(); server.close(); }
})();
