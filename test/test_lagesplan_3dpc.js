// Punktmoln i 3D-editorn (Victor 2026-10-12: "stöd för punktmoln … utan att kompromissa med prestandan … hämta från
// Reality capture i Trimble connect"). Workern läser LAS, LAZ (laz-perf), XYZ och PLY och glesar ut till en budget;
// 3D-vyn visar molnet i rutor, med tänd/släck, färgläge, punktstorlek, cache och läsning ur Trimble Connect-mappar.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9013;
const LAS = fs.readFileSync(path.join(__dirname, 'data', 'simple.las')), LAZ = fs.readFileSync(path.join(__dirname, 'data', 'simple.laz'));
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => { c.fillStyle = '#fff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} }; } };
  } }) }) };`;

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { const u = q.url.split('?')[0]; r.writeHead(200, { 'Content-Type': u.endsWith('.js') ? 'application/javascript' : u.endsWith('.wasm') ? 'application/wasm' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  try {
    const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
    await require('./_dialogs').bridge(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
    await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);

    // 1. Workern: LAS och LAZ ger samma moln; XYZ och PLY; utglesning till budgeten.
    const parse = (b64, name, budget) => page.evaluate(([b64, name, budget]) => new Promise((res, rej) => {
      const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const w = new Worker('pc-worker.js');
      w.onmessage = ev => { if (ev.data.type === 'progress') return; w.terminate(); if (ev.data.type === 'error') return res({ error: ev.data.message });
        const { info, chunks } = ev.data; let n = 0, sx = 0, rgbSum = 0; chunks.forEach(c => { n += c.pos.length / 3; for (let i = 0; i < c.pos.length; i += 3) sx += c.pos[i]; for (let i = 0; i < c.rgb.length; i++) rgbSum += c.rgb[i]; });
        res({ info, n, chunks: chunks.length, sx: Math.round(sx * 100) / 100, rgbSum }); };
      w.onerror = e => rej(new Error(e.message));
      w.postMessage({ bytes: u.buffer, name, budget }, [u.buffer]);
    }), [b64, name, budget]);
    const las = await parse(LAS.toString('base64'), 'simple.las', 1e7), laz = await parse(LAZ.toString('base64'), 'simple.laz', 1e7);
    if (las.error || laz.error) fail('LAS/LAZ: ' + (las.error || laz.error));
    if (las.n !== 1065 || laz.n !== 1065 || las.info.total !== 1065 || las.sx !== laz.sx || las.rgbSum !== laz.rgbSum || !las.info.rgb || !las.rgbSum || laz.info.format.indexOf('LAZ') !== 0)
      fail('LAS och LAZ ska ge samma 1065 punkter med färg: ' + JSON.stringify({ las, laz }));
    const sub = await parse(LAZ.toString('base64'), 'simple.laz', 300);
    if (!(sub.n > 200 && sub.n < 420) || sub.info.total !== 1065) fail('Utglesning till budgeten: ' + JSON.stringify({ n: sub.n, total: sub.info.total }));
    const xyz = 'x y z\n' + Array.from({ length: 500 }, (_, i) => `${6512300 + i * 0.1} ${150100 + (i % 20)} ${2 + i * 0.01} 200 100 50`).join('\n');
    const tx = await parse(Buffer.from(xyz).toString('base64'), 'moln.xyz', 1e7);
    if (tx.error || tx.n !== 500 || !tx.info.rgb || Math.round(tx.info.min[0]) !== 6512300) fail('XYZ: ' + JSON.stringify(tx));
    const nP = 200, ph = Buffer.from(`ply\nformat binary_little_endian 1.0\nelement vertex ${nP}\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nend_header\n`);
    const pb = Buffer.alloc(nP * 15); for (let i = 0; i < nP; i++) { pb.writeFloatLE(i, i * 15); pb.writeFloatLE(i * 2, i * 15 + 4); pb.writeFloatLE(1, i * 15 + 8); pb[i * 15 + 12] = 255; }
    const ply = await parse(Buffer.concat([ph, pb]).toString('base64'), 'moln.ply', 1e7);
    if (ply.error || ply.n !== nP || !ply.info.rgb || ply.info.max[0] !== nP - 1) fail('PLY: ' + JSON.stringify(ply));
    const e57 = await parse(Buffer.from('ASTM-E57').toString('base64'), 'moln.e57', 1e7);
    if (!e57.error || !/LAZ eller LAS/.test(e57.error)) fail('E57 ska ge ett tydligt besked: ' + JSON.stringify(e57));
    console.log('OK: workern läser LAS, LAZ (samma moln), XYZ och PLY, glesar ut till budgeten, E57 ger besked');

    // 2. I 3D-vyn: från en fil, ur Trimble Connect-mappen, tänd/släck, färg, storlek, cache.
    const center = await page.evaluate(b64 => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); window.__laz = u.buffer; return null; }, LAZ.toString('base64'));
    await page.evaluate(async () => {
      plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[637000, 849000, 400], [637100, 849000, 400]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
      pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = [];
      renderPlanSelect(); await openPlan('A');
      Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
      window.__calls = [];
      askOpener = async (type, extra, t, onP) => {
        window.__calls.push(type);
        if (type === 'tcFolder' && !extra.folderId) return { folderId: 'root', projectName: 'Kvarteret', items: [{ id: 'd1', name: 'Skanning', type: 'folder' }] };
        if (type === 'tcFolder') return { folderId: 'd1', items: [{ id: 'L1', name: 'simple.laz', type: 'file', size: 18217, versionId: 'v1' }, { id: 'E1', name: 'stort.e57', type: 'file', size: 9e8 }] };
        if (type === 'tcFile' && extra.fileId === 'L1') { if (onP) onP(0.5, 9000, 18217); return { bytes: window.__laz.slice(0) }; }
        return {};
      };
    });
    await page.evaluate(() => { open3d(); });
    await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3pcLoad === 'function', null, { timeout: 15000 });
    // Lager → Trimble Connect mapp: molnfilen syns och läses in med ett tryck.
    await page.evaluate(() => { l3PalTab('layers'); l3SetPref('laySort', 'tree'); l3LayersRender(); });
    await page.waitForSelector('#v3PalLayers [data-l3l-dir="d1"]', { timeout: 5000 });
    await page.click('#v3PalLayers [data-l3l-dir="d1"]');
    await page.waitForSelector('#v3PalLayers [data-pc-tc="L1"]', { timeout: 5000 });
    if (!(await page.isVisible('#v3PalLayers [data-pc-tc="E1"]'))) fail('E57-filen ska också synas i mappen');
    await page.click('#v3PalLayers [data-pc-tc="L1"]');
    await page.waitForFunction(() => l3pc.clouds.length === 1 && !l3pc.busy, null, { timeout: 15000 });
    const st = await page.evaluate(() => { const c = l3pc.clouds[0], g = c.group; let n = 0; g.children.forEach(p => { n += p.geometry.getAttribute('position').count; }); const wp = new THREE.Vector3(); g.getWorldPosition(wp); return { id: c.id, n, kids: g.children.length, pts: g.children.every(p => p.isPoints), x: wp.x + l3.O[0], size: c.mat.size, att: c.mat.sizeAttenuation, rem: l3pcRemembered().map(x => x.id).join(), file: window.__calls.includes('tcFile') }; });
    if (st.id !== 'pc:f:L1' || st.n !== 1065 || !st.pts || Math.abs(st.x - las.info.center[0]) > 0.01 || st.att !== false || st.rem !== 'pc:f:L1' || !st.file) fail('Molnet i 3D: ' + JSON.stringify(st));
    // Hämtade 3D-modeller: raden, tänd/släck, färg och storlek.
    await page.evaluate(() => { l3SetPref('laySort', 'list'); l3LayersRender(); });
    const row = await page.evaluate(() => { const r = document.querySelector('#v3PalLayers [data-pc-eye="pc:f:L1"]'); return r && r.closest('.v3-lr').textContent; });
    if (!row || !/simple\.laz/.test(row) || !/1\s065 p/.test(row)) fail('Raden för punktmolnet: ' + row);
    await page.click('#v3PalLayers [data-pc-eye="pc:f:L1"]');
    if (await page.evaluate(() => l3pc.clouds[0].group.visible)) fail('Ögat ska släcka molnet');
    await page.click('#v3PalLayers [data-pc-eye="pc:f:L1"]');
    const col = await page.evaluate(() => { const a = () => Array.from(l3pc.clouds[0].group.children[0].geometry.getAttribute('color').array.slice(0, 6)).join(); const rgb = a(); const s = document.getElementById('v3PcMode'); s.value = 'z'; s.dispatchEvent(new Event('change')); const z = a(); const r = document.getElementById('v3PcSize'); r.value = '4'; r.dispatchEvent(new Event('input')); return { rgb, z, size: l3pc.clouds[0].mat.size }; });
    if (col.rgb === col.z || col.size !== 4) fail('Färg efter höjd och punktstorlek: ' + JSON.stringify(col));
    // Cache: bort ur vyn och tillbaka utan Trimble Connect.
    await page.waitForTimeout(500);
    await page.evaluate(async () => { l3pcRemove('pc:f:L1'); window.__calls = []; await l3pcRestore(); });
    const re = await page.evaluate(() => ({ n: l3pc.clouds.length, tc: window.__calls.includes('tcFile') }));
    if (re.n !== 1 || re.tc) fail('Ur webbläsarens cache utan att hämta från TC: ' + JSON.stringify(re));
    await page.evaluate(() => { l3Frame(true); l3Render(); }); await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(process.env.PLACE_TMP || '.', '3dpc.png') });
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    // Fil från datorn läses i bitar; för stor fil och oläsbar fil ger begripliga besked (Victor 2026-10-12).
    const rf = await page.evaluate(async () => {
      const ok = new Uint8Array(await l3pcReadFile(new File([new Uint8Array([1, 2, 3, 4, 5])], 'a.las'), () => {}));
      const big = await l3pcReadFile({ size: 3e9, slice() { throw new Error('ska inte läsas'); } }, () => {}).catch(e => e.message);
      const bad = await l3pcReadFile({ size: 10, slice() { return { arrayBuffer: () => Promise.reject(Object.assign(new Error('x'), { name: 'NotReadableError' })) }; } }, () => {}).catch(e => e.message);
      return { ok: [...ok].join(), big, bad };
    });
    if (rf.ok !== '1,2,3,4,5' || !/3,0 GB/.test(rf.big) || !/OneDrive/.test(rf.bad)) fail('Läsa fil från datorn: ' + JSON.stringify(rf));
    console.log('OK: punktmoln i 3D – ur TC-mappen, tänd/släck, färg efter höjd, punktstorlek, cache');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
