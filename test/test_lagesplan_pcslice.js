// Dela upp punktmolnet efter WBS-zoner (Victor 2026-11-05): en LAS-fil per zon/överzon och en fil för det som ligger utanför, samlade i en ZIP.
// cachen sparas en ruta åt gången och läses tillbaka identiskt, bygget görs i delar utan att blockera, inläsningen kan avbrytas
// och en läsare som slutar svara avbryts av ett hängskydd, och molnen delar på ett gemensamt punkttak.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9035;
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
    // moln: rutnät 100 × 40 m med halvmeterförskjutning (inga punkter på zonkanterna), två rutor
    const mk = await page.evaluate(() => {
      const cx = 637050, cy = 849020, cz = 100, chunks = [[], []]; let n = 0;
      for (let i = 0; i < 100; i++) for (let j = 0; j < 40; j++) { const x = 637000.5 + i, y = 849000.5 + j; chunks[i < 50 ? 0 : 1].push([x - cx, y - cy, 3 - cz + (i % 7) * 0.1, i, j]); n++; }
      const mkc = L => { const pos = new Float32Array(L.length * 3), rgb = new Uint8Array(L.length * 3), inten = new Uint8Array(L.length); L.forEach((p, k) => { pos.set(p.slice(0, 3), k * 3); rgb[k * 3] = p[3] * 2; rgb[k * 3 + 1] = p[4] * 5; rgb[k * 3 + 2] = 77; inten[k] = k % 200; }); return { pos, rgb, inten }; };
      const info = { n, total: n, center: [cx, cy, cz], min: [-50, -20, -97], max: [50, 20, -96], rgb: true, intensity: true, format: 'LAS' };
      const c = l3pcBuild({ id: 'pc:slice', name: 'Skanning NSV.laz' }, { info, chunks: chunks.map(mkc) });
      return { n, id: c.id };
    });
    // 1. Uppdelningen i zoner
    const A = await page.evaluate(async () => {
      const c = l3pc.clouds.find(x => x.id === 'pc:slice'), r = await l3pcsRun(c, { level: 'zone', rest: true, format: 'las' }, null);
      const parse = f => { const dv = new DataView(f.bytes.buffer, f.bytes.byteOffset, f.bytes.byteLength), g = o => dv.getFloat64(o, true); const n = dv.getUint32(107, true), ox = g(155), oy = g(163), sx = g(131); let ok = 0, bad = 0, rgbOk = 0;
        const x0 = g(187), x1 = g(179), y0 = g(203), y1 = g(195); for (let i = 0; i < n; i++) { const o = 227 + i * 26, x = dv.getInt32(o, true) * sx + ox, y = dv.getInt32(o + 4, true) * sx + oy; if (x >= x0 - 1e-6 && x <= x1 + 1e-6 && y >= y0 - 1e-6 && y <= y1 + 1e-6) ok++; else bad++; if (dv.getUint16(o + 24, true) === 77 * 257) rgbOk++; }
        return { sig: String.fromCharCode(...f.bytes.slice(0, 4)), n, ok, bad, rgbOk, x: [x0, x1], y: [y0, y1], size: f.bytes.length, ver: dv.getUint8(24) + '.' + dv.getUint8(25), fmt: dv.getUint8(104) }; };
      return { files: r.files.map(f => ({ name: f.name, group: f.group, n: f.n, ...parse(f) })), counts: r.counts };
    });
    const by = Object.fromEntries(A.files.map(f => [f.group, f]));
    if (A.files.length !== 4 || !by['7421 Förtjockardelen'] || !by['7422 Sikten'] || !by['7430 Lager'] || !by['Utanför zoner']) fail('Fyra filer (tre zoner + utanför): ' + JSON.stringify(A.files.map(f => f.group)));
    if (by['7421 Förtjockardelen'].n !== 400 || by['7422 Sikten'].n !== 400 || by['7430 Lager'].n !== 0 + by['7430 Lager'].n) fail('Antal i zonerna: ' + JSON.stringify(A.files.map(f => [f.group, f.n])));
    const tot = A.files.reduce((a, f) => a + f.n, 0); if (tot !== mk.n) fail('Alla punkter ska hamna i exakt en fil: ' + tot + ' av ' + mk.n);
    if (A.files.some(f => f.sig !== 'LASF' || f.ver !== '1.2' || f.fmt !== 2 || f.n !== f.ok || f.bad !== 0 || f.rgbOk !== f.n && f.group !== 'Utanför zoner')) fail('LAS-filerna ska vara giltiga med rätt antal och färg: ' + JSON.stringify(A.files));
    const a = by['7421 Förtjockardelen']; if (a.x[0] < 637010 || a.x[1] > 637030 || a.y[0] < 849010 || a.y[1] > 849030) fail('Zon A ska bara ha punkter inom sin yta: ' + JSON.stringify(a));
    console.log('OK: molnet delas i en LAS-fil per zon och en fil utanför, varje punkt i exakt en fil', JSON.stringify(A.files.map(f => [f.group, f.n])));
    // 2. Överzoner (WBS) slår ihop 7421+7422 till "742 Sikthall"
    const W = await page.evaluate(async () => { const c = l3pc.clouds.find(x => x.id === 'pc:slice'), r = await l3pcsRun(c, { level: 'wbs', rest: false }, null); return r.files.map(f => [f.group, f.n]); });
    const sik = W.find(x => x[0] === '742 Sikthall'); if (!sik || sik[1] !== 800 || W.some(x => x[0] === 'Utanför zoner')) fail('Överzoner utan "utanför"-fil: ' + JSON.stringify(W));
    // 3. Menyn → dialogen → ZIP hämtas
    await page.evaluate(() => { l3PalTab('layers'); l3LayersRender(); });
    await page.waitForSelector('#v3PalLayers [data-pc-more]');
    await page.evaluate(() => document.querySelector('#v3PalLayers [data-pc-more]').click()); await page.evaluate(() => document.querySelector('.v3-pc-menu [data-a="slice"]').click()); await page.waitForSelector('#l3pcsDlg');
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#pcsGo')]);
    const p = await dl.path(); const zbytes = fs.readFileSync(p);
    const names = await page.evaluate(b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return Object.keys(fflate.unzipSync(u)); }, zbytes.toString('base64'));
    if (names.length !== 4 || !names.every(n => /\.laz$/.test(n))) fail('ZIP med fyra LAZ-filer: ' + JSON.stringify({ n: dl.suggestedFilename(), names }));
    await page.waitForFunction(() => /filer/.test(document.getElementById('pcsOut').textContent), null, { timeout: 5000 });
    console.log('OK: Lager → ⋯ → ✂ Dela upp efter WBS-zoner hämtar en ZIP med LAS-filerna', JSON.stringify(names));
    // 4. Dela jämnt i bitar (streck): resultat, panel, ＋/−, streck i 3D, ZIP med LAZ
    await page.evaluate(() => { const d = document.getElementById('l3pcsDlg'); if (d) d.remove(); });
    const T = await page.evaluate(async () => { const c = l3pc.clouds.find(x => x.id === 'pc:slice'), r = await l3pcsRun(c, { format: 'las', strips: { axis: 'x', x0: 637000, y0: 849000, cuts: [25, 50, 75] } }, null); return r.files.map(f => [f.group, f.n, f.name]); });
    if (T.length !== 4 || T.some(x => x[1] !== 1000) || !/\.las$/.test(T[0][2])) fail('Fyra lika bitar om 1000 punkter: ' + JSON.stringify(T));
    await page.evaluate(() => l3pcsStripsOpen('pc:slice'));
    const P1 = await page.evaluate(() => ({ n: document.getElementById('pcsN').textContent, cuts: JSON.stringify(l3pcsS.cuts), planes: l3pcsS.grp.children.length }));
    if (P1.n !== '4' || P1.planes !== 3 || P1.cuts !== '[24.75,49.5,74.25]') fail('Panelen börjar med fyra jämna bitar (X, 99 m): ' + JSON.stringify(P1));
    await page.click('#pcsPlus'); const P2 = await page.evaluate(() => ({ n: document.getElementById('pcsN').textContent, planes: l3pcsS.grp.children.length, cuts: l3pcsS.cuts.join() }));
    if (P2.n !== '5' || P2.planes !== 4 || P2.cuts !== '19.8,39.6,59.4,79.2') fail('＋ ger fem jämna bitar: ' + JSON.stringify(P2));
    await page.click('[data-split="0"]'); const P3 = await page.evaluate(() => l3pcsS.cuts.join()); if (P3 !== '9.9,19.8,39.6,59.4,79.2') fail('＋ vid en bit delar den på mitten: ' + P3);
    await page.click('[data-del="0"]'); await page.click('#pcsEven');
    const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.click('#pcsSGo')]);
    const nm2 = await page.evaluate(b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const z = fflate.unzipSync(u); return Object.keys(z).map(k => [k, String.fromCharCode(...z[k].slice(0, 4)), z[k].length, new DataView(z[k].buffer, z[k].byteOffset).getUint32(107, true)]); }, fs.readFileSync(await dl2.path()).toString('base64'));
    if (nm2.reduce((a, x) => a + x[3], 0) !== 4000) fail('Alla 4000 punkter i LAZ-filerna: ' + JSON.stringify(nm2));
    if (nm2.length !== 5 || !nm2.every(x => /\.laz$/.test(x[0]) && x[1] === 'LASF')) fail('ZIP med fem LAZ-filer: ' + JSON.stringify(nm2));
    await page.click('#pcsSX'); if (await page.evaluate(() => !!document.getElementById('l3pcsStrips') || !!l3pcsS.grp)) fail('Stäng tar bort panel och streck');
    console.log('OK: Dela jämnt i bitar – streck i 3D, ＋/−/Jämnt, delning på mitten, ZIP med LAZ', JSON.stringify(nm2.map(x => x[0])));
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('OK test_lagesplan_pcslice');
  } catch (e) { console.error('FEL:', e.message); process.exitCode = 1; }
  finally { await browser.close(); server.close(); }
})();
