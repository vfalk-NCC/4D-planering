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
    // 2c. Stora meshar: exportfunktionerna får inte spränga stacken, och för stora meshar avvisas med ett begripligt fel
    const BIG = await page.evaluate(async () => { const n = 700000, V = new Array(n), C = new Array(n); for (let i = 0; i < n; i++) { V[i] = [i % 1000, (i / 1000) | 0, i % 7]; C[i] = [1, 2, 3]; }
      const F = []; for (let i = 0; i < 3000; i++) F.push(i, i + 1, i + 2); const r = { V, C, F, FC: Array.from({ length: F.length / 3 }, () => [9, 9, 9]), area: 1, bb: { min: [0, 0, 0], max: [1000, 700, 7] } };
      let ok = true, msg = ''; try { const t = l3pmIfc(r, 'stor', true); ok = t.length > 1000; l3pmToModel; } catch (e) { ok = false; msg = e.message; }
      const c = l3pc.clouds.find(x => x.id === 'pc:mesh'); let err = ''; try { await l3pmBuild(c, { type: 'grid', cell: 0.05, zmode: 'mean', maxEdge: 0, color: 'none', spike: 0 }); } catch (e) { err = e.message; } return { ok, msg, err }; });
    if (!BIG.ok) fail('IFC med 700 000 hörn: ' + JSON.stringify(BIG)); if (!/för stor|för många|större/.test(BIG.err)) fail('För stor mesh ska avvisas: ' + JSON.stringify(BIG));
    console.log('OK: stora meshar – ingen stackspräckning, för stora avvisas', JSON.stringify(BIG));
    // 2d. Rutstorlek 0,1 m i ett avgränsat område (zon A: 20 × 20 m, 400 punkter)
    const F01 = await page.evaluate(async () => { const c = l3pc.clouds.find(x => x.id === 'pc:mesh'), z = l3pcsGroups('zone')[0], t0 = performance.now(); const mk = async o => { const r = await l3pmBuild(c, Object.assign({ cell: 0.1, zmode: 'mean', maxEdge: 0, color: 'rgb', spike: 0, area: z }, o)); return { v: r.V.length, t: r.F.length / 3, x: [Math.min(...r.V.map(p => p[0])), Math.max(...r.V.map(p => p[0]))] }; };
      let whole = ''; try { await l3pmBuild(c, { type: 'tin', cell: 0.1, zmode: 'mean', maxEdge: 0, color: 'none', spike: 0 }); } catch (e) { whole = e.message; } return { tin: await mk({ type: 'tin' }), whole, ms: Math.round(performance.now() - t0) }; });
    if (F01.tin.v !== 400 || F01.tin.t < 700 || F01.tin.x[0] < 637010 || F01.tin.x[1] > 637030) fail('0,1 m i en zon: ' + JSON.stringify(F01));
    console.log('OK: rutstorlek 0,1 m i ett avgränsat område (för stora ytor avvisas med tips)', JSON.stringify(F01));
    // 2e. Stor mesh delas i flera modeller (0,1 m över hela molnet): rutor kant i kant, ZIP med en fil per modell
    const TL = await page.evaluate(async () => { window.showSaveFilePicker = undefined; const c = l3pc.clouds.find(x => x.id === 'pc:mesh'), o = { type: 'tin', cell: 0.1, zmode: 'mean', maxEdge: 0, color: 'rgb', spike: 0 }, pl = l3pmTilePlan(c, o);
      const x = await l3pmExportTiles(c, o, ['dxf'], 'Skanning – mesh'); const u = new Uint8Array(await x.blob.arrayBuffer()), z = fflate.unzipSync(u), names = Object.keys(z), faces = names.reduce((a, k) => a + (new TextDecoder().decode(z[k]).match(/\n3DFACE\n/g) || []).length, 0);
      let tooMany = ''; try { await l3pmExportTiles(c, Object.assign({}, o, { cell: 0.1 }), ['dxf'], 'x', null, 1); } catch (e) { tooMany = e.message; }
      return { tiles: pl.tiles.length, tx: pl.tx, made: x.made, names, faces, tri: x.tri }; });
    if (TL.tiles < 2 || TL.made !== TL.tiles || TL.names.length !== TL.tiles || !TL.names.every(n => /\.dxf$/.test(n)) || TL.faces !== TL.tri || TL.faces < 7000) fail('Flera modeller: ' + JSON.stringify(TL));
    console.log('OK: stor mesh delas i flera modeller (ZIP med en DXF per modell)', JSON.stringify(TL));
    // 2f. Platta ut områden: en maskin (kulle 3 m) ersätts med plan yta på medelhöjden runt, eller yta mellan kanten
    const AA = await page.evaluate(async () => { const cx = 637050, cy = 849020, cz = 100, n = 80 * 80, pos = new Float32Array(n * 3), rgb = new Uint8Array(n * 3), inten = new Uint8Array(n);
      for (let i = 0; i < n; i++) { const x = (i % 80) * 0.5 - 20, y = ((i / 80) | 0) * 0.5 - 20, d = Math.hypot(x, y); pos.set([x, y, (d < 3 ? 3 : 0) + x * 0.02], i * 3); rgb.set([d < 3 ? 255 : 90, 120, 60], i * 3); }
      const info = { n, total: n, center: [cx, cy, cz], min: [cx - 20, cy - 20, cz], max: [cx + 20, cy + 20, cz + 4], rgb: true, intensity: false, format: 'LAS' }; const c = l3pcBuild({ id: 'pc:ma', name: 'Maskin.laz' }, { info, chunks: [{ pos, rgb, inten }] });
      const poly = Array.from({ length: 32 }, (_, i) => [cx + Math.cos(i / 32 * 6.283) * 4.2, cy + Math.sin(i / 32 * 6.283) * 4.2]), maxZ = r => Math.max(...r.V.filter(v => Math.hypot(v[0] - cx, v[1] - cy) < 3.2).map(v => v[2] - cz));
      const base = { type: 'tin', cell: 0.5, zmode: 'mean', maxEdge: 1.5, color: 'rgb', spike: 0 };
      const none = await l3pmBuild(c, base), flat = await l3pmBuild(c, Object.assign({}, base, { areas: [{ poly, mode: 'flat' }] })), fill = await l3pmBuild(c, Object.assign({}, base, { areas: [{ poly, mode: 'fill' }] })), grid = await l3pmBuild(c, Object.assign({}, base, { type: 'grid', areas: [{ poly, mode: 'flat' }] }));
      const holeTris = r => { let k = 0; for (let i = 0; i < r.F.length; i += 3) { const a = r.V[r.F[i]], b = r.V[r.F[i + 1]], d = r.V[r.F[i + 2]], mx = (a[0] + b[0] + d[0]) / 3, my = (a[1] + b[1] + d[1]) / 3; if (Math.hypot(mx - cx, my - cy) < 3) k++; } return k; };
      return { none: Math.round(maxZ(none) * 10) / 10, flat: Math.round(maxZ(flat) * 10) / 10, fill: Math.round(maxZ(fill) * 10) / 10, grid: Math.round(maxZ(grid) * 10) / 10, filled: flat.filledAreas, holeFlat: holeTris(flat), holeFill: holeTris(fill) }; });
    if (AA.none < 2.9 || AA.flat > 0.5 || AA.fill > 0.5 || AA.grid > 0.5 || AA.filled !== 1 || AA.holeFlat < 20 || AA.holeFill < 20) fail('Platta ut område: ' + JSON.stringify(AA));
    await page.evaluate(() => l3pcRemove('pc:ma'));
    console.log('OK: maskinen plattas ut (medelhöjd runt / fyll mellan kanten / rutnät) och ytan är sluten', JSON.stringify(AA));
    // 2g. Markera område i 3D via dialogen (cirkel runt en klickad punkt)
    await page.evaluate(() => { l3PalTab('layers'); l3LayersRender(); }); await page.waitForSelector('#v3PalLayers [data-pc-more]');
    await page.evaluate(() => document.querySelector('#v3PalLayers [data-pc-more]').click()); await page.evaluate(() => document.querySelector('.v3-pc-menu [data-a="mesh"]').click()); await page.waitForSelector('#l3pmDlg');
    await page.waitForFunction(() => /trianglar/.test(document.getElementById('pmOut').textContent), null, { timeout: 30000 });
    await page.evaluate(() => { const c = l3pc.clouds[0], t = new THREE.Vector3(c.info.center[0] - l3.O[0], c.info.center[1] - l3.O[1], c.info.center[2] - l3.O[2]); l3.camera.position.set(t.x, t.y - 0.01, t.z + 60); l3.orbit.target.copy(t); l3.camera.lookAt(t); l3.orbit.update && l3.orbit.update(); l3Render(); });
    await page.waitForTimeout(300);
    const sp = await page.evaluate(() => { const c = l3pc.clouds[0], p = new THREE.Vector3(c.info.center[0] - l3.O[0], c.info.center[1] - l3.O[1], c.info.center[2] - l3.O[2]).project(l3.camera), r = l3.renderer.domElement.getBoundingClientRect(); return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; });
    await page.click('#pmArCirc'); await page.mouse.click(sp[0], sp[1]); await page.waitForTimeout(800);
    const AR2 = await page.evaluate(() => ({ n: l3pm.areas.length, drawn: !!(l3pmAr.grp && l3pmAr.grp.children.length), list: document.querySelectorAll('[data-armode]').length })); if (AR2.n !== 1 || !AR2.drawn || AR2.list !== 1) fail('Cirkel-område via klick: ' + JSON.stringify(AR2));
    await page.selectOption('[data-armode="0"]', 'fill'); await page.click('[data-ardel="0"]'); const AR3 = await page.evaluate(() => ({ n: l3pm.areas.length })); if (AR3.n !== 0) fail('Ta bort område');
    console.log('OK: område markeras med klick i 3D (cirkel), läge kan ändras, tas bort', JSON.stringify(AR2));
    await page.click('#pmX'); await page.waitForTimeout(200);
    // 3. Dialogen: skapa, DXF, IFC, i modellen
    await page.evaluate(() => { l3PalTab('layers'); l3LayersRender(); }); await page.waitForSelector('#v3PalLayers [data-pc-more]');
    await page.evaluate(() => document.querySelector('#v3PalLayers [data-pc-more]').click()); await page.evaluate(() => document.querySelector('.v3-pc-menu [data-a="mesh"]').click()); await page.waitForSelector('#l3pmDlg');
    await page.selectOption('#pmType', 'tin'); await page.fill('#pmCell', '2'); await page.selectOption('#pmCol', 'rgb');
    // live: ändringarna bygger om förhandsvisningen utan att man trycker på något
    await page.waitForFunction(() => /1862trianglar/.test(document.getElementById('pmOut').textContent.replace(/\s/g, '')) && !document.getElementById('pmDxf').disabled, null, { timeout: 30000 }).catch(async e => { fail('Dialog: ' + (await page.textContent('#pmOut'))); });
    console.log('OK: förhandsvisningen uppdateras direkt när valen ändras');
    const PV = await page.evaluate(() => ({ g: !!l3pmPrev.grp, n: l3pmPrev.grp && l3pmPrev.grp.children[0].geometry.getAttribute('position').count, inScene: l3.scene.children.includes(l3pmPrev.grp) })); if (!PV.g || !PV.inScene || PV.n !== 1862 * 3) fail('Förhandsvisning i 3D: ' + JSON.stringify(PV));
    await page.check('#pmHide'); await page.check('#pmWire'); const PV2 = await page.evaluate(() => ({ hid: !l3pc.clouds[0].group.visible, kids: l3pmPrev.grp.children.length })); if (!PV2.hid || PV2.kids !== 2) fail('Dölj moln + nät: ' + JSON.stringify(PV2));
    console.log('OK: förhandsvisning av meshen i 3D, dölj molnet, visa nät');
    const [d1] = await Promise.all([page.waitForEvent('download'), page.click('#pmDxf')]); const dxf = fs.readFileSync(await d1.path(), 'utf8');
    const nf = (dxf.match(/\n3DFACE\n/g) || []).length; if (nf < 1500 || !/\n420\n\d+\n/.test(dxf)) fail('DXF med 3DFACE och färg: ' + nf + ' ' + d1.suggestedFilename());
    { const lay = [...dxf.matchAll(/\n0\nLAYER\n2\n(Mesh_\d+)\n70\n0\n62\n(\d+)\n/g)].map(m => [m[1], +m[2]]), used = new Set([...dxf.matchAll(/\n3DFACE\n8\n(Mesh_\d+)\n/g)].map(m => m[1]));
      if (lay.length < 5 || new Set(lay.map(x => x[1])).size < 4 || [...used].some(u => !lay.some(l => l[0] === u))) fail('DXF med lager per färg (lagerfärg ACI): ' + JSON.stringify([lay.length, [...used].length, lay.slice(0, 4)])); }
    const [d2] = await Promise.all([page.waitForEvent('download'), page.click('#pmIfc')]); const ifc = fs.readFileSync(await d2.path(), 'utf8');
    if (!/IFCTRIANGULATEDFACESET/.test(ifc) || !/IFCBUILDINGELEMENTPROXY/.test(ifc)) fail('IFC med trianglar');
    if ((ifc.match(/IFCBUILDINGELEMENTPROXY\(/g) || []).length < 5) fail('Ett eget objekt per färg (appen färgar ett objekt med en färg)');
    { const sets = (ifc.match(/IFCTRIANGULATEDFACESET\(/g) || []).length, styled = (ifc.match(/IFCSTYLEDITEM\(/g) || []).length, cols = new Set([...ifc.matchAll(/IFCCOLOURRGB\(\$,([\d.]+),([\d.]+),([\d.]+)\)/g)].map(m => m[1] + m[2] + m[3])).size, grey = /IFCCOLOURRGB\(\$,0\.639,0\.659,0\.706\)/.test(ifc);
      const nTri = ifc.match(/IFCTRIANGULATEDFACESET\(#\d+,\$,\.F\.,\(((?:\(\d+,\d+,\d+\),?)+)\)/g).reduce((a, m) => a + (m.match(/\(\d+,\d+,\d+\)/g) || []).length, 0);
      if (sets < 5 || styled !== sets || cols < 5 || grey || nTri !== nf) fail('IFC: en färgad delmängd per färg, alla trianglar med, ingen grå standard: ' + JSON.stringify({ sets, styled, cols, grey, nTri, nf })); }
    // IFC läses av appens egen IFC-läsare (web-ifc): flera färgade delar, inte grått
    { const R2 = await page.evaluate(async txt => { const m = await ifcToMesh(txt); return { tris: m.tris, cols: m.mesh.parts.map(p => p.c) }; }, ifc).catch(e => ({ err: String(e.message || e) }));
      const EL = await page.evaluate(async txt => { const api = await ifcmLoad(), id = api.OpenModel(new TextEncoder().encode(txt), { COORDINATE_TO_ORIGIN: false }); const cols = []; api.StreamAllMeshes(id, m => { const g = m.geometries.get(0); cols.push([g.color.x, g.color.y, g.color.z].map(v => Math.round(v * 255)).join()); }); api.CloseModel(id); return { objects: cols.length, distinct: new Set(cols).size }; }, ifc);
      if (EL.objects < 5 || EL.distinct < 5) fail('web-ifc: ett objekt per färg: ' + JSON.stringify(EL)); console.log('OK: web-ifc ger ett objekt per färg', JSON.stringify(EL));
      if (R2.err || R2.tris !== nf || new Set(R2.cols).size < 5 || R2.cols.every(c => /^#(a3a8b4|bfbfbf)$/i.test(c))) fail('IFC visar färg i web-ifc: ' + JSON.stringify(R2)); console.log('OK: IFC:en läses av web-ifc med färgade delar', JSON.stringify({ tris: R2.tris, colors: new Set(R2.cols).size })); }
    const before = await page.evaluate(() => placements.length); await page.click('#pmMod'); const after = await page.evaluate(() => ({ n: placements.length, k: placements[placements.length - 1].m && placements[placements.length - 1].m.k, name: placements[placements.length - 1].name }));
    if (after.n !== before + 1 || after.k !== 'mesh') fail('Meshen i modellen: ' + JSON.stringify(after));
    { const V = await page.evaluate(() => { const p = placements[placements.length - 1], g = l3.placeMeshes.get(p.id); let mesh = null; g.traverse(o => { if (o.isMesh && !mesh) mesh = o; }); const col = mesh && mesh.geometry.getAttribute('color'); let distinct = 0; if (col) { const S = new Set(); for (let i = 0; i < col.count; i += 3) S.add([col.getX(i), col.getY(i), col.getZ(i)].map(v => Math.round(v * 255)).join()); distinct = S.size; } return { pal: (p.m.pal || []).length, vc: !!(mesh && mesh.material.vertexColors), distinct }; });
      if (V.pal < 5 || !V.vc || V.distinct < 5) fail('Meshen i modellen visas med färg per yta (inte en enda färg): ' + JSON.stringify(V)); console.log('OK: meshen i modellen har färg per yta', JSON.stringify(V)); }
    if (await page.evaluate(() => !!l3pmPrev.grp || !l3pc.clouds[0].group.visible)) fail('Förhandsvisningen försvinner och molnet visas när meshen läggs i modellen');
    console.log('OK: dialogen ger DXF (3DFACE + färg), IFC (färgtabell) och ett ritat objekt', JSON.stringify({ nf, name: d1.suggestedFilename() }));
    await page.fill('#pmCell', '0.1'); await page.fill('#pmEdge', '0'); await page.waitForFunction(() => /Stor mesh/.test(document.getElementById('pmOut').textContent) || /⚠/.test(document.getElementById('pmOut').textContent), null, { timeout: 30000 });
    const TT = await page.evaluate(() => ({ out: document.getElementById('pmOut').textContent.slice(0, 160), est: document.getElementById('pmEst').textContent, tiled: !!(l3pm.res && l3pm.res.tiled) })); if (!TT.tiled || !/modeller/.test(TT.est)) fail('Dialogen delar stor mesh i flera modeller: ' + JSON.stringify(TT));
    console.log('OK: 0,1 m över hela molnet → dialogen delar i flera modeller med grövre förhandsvisning', JSON.stringify(TT));
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('OK test_lagesplan_pcmesh');
  } catch (e) { console.error('FEL:', e.message); process.exitCode = 1; }
  finally { await browser.close(); server.close(); }
})();
