const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9351;
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

  const files = new Map();   // projektets "GitHub": sökväg -> base64
  const route = async pg => {
    await pg.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
    await pg.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
    await pg.route('https://api.github.com/**', r => {
      const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
      if (req.method() === 'GET') { const b = files.get(f); if (b == null) return r.fulfill({ status: 404, body: '{}' }); if (/raw/.test(req.headers()['accept'] || '')) return r.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(b, 'base64') }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: b, sha: 's' + b.length, size: b.length }) }); }
      const body = JSON.parse(req.postData()); files.set(f, body.content); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + body.content.length } }) });
    });
  };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage(); await require('./_dialogs').bridge(page, d => d.accept());
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const openEditor = async pg => {
    await route(pg); await pg.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await pg.waitForTimeout(900);
    await pg.evaluate(async () => { plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[169000, 7456000, 400], [169100, 7456000, 400]], pdf: [[0, 0], [1000, 0]] }, zones: [] }]; pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A'); });
    await pg.click('#btn3d'); await pg.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3bubPanel === 'function', null, { timeout: 15000 });
    await pg.evaluate(() => l3dkToggle(true));
  };
  await openEditor(page);
  const ok = (c, m) => { if (!c) fail(m); };
  const res = await page.evaluate(() => {
    const O = l3.O, out = {};
    // syntetisk mesh: 20 × 20 m, plan yta z = 5 m (SWEREF-koordinater), två trianglar per ruta
    const x0 = Math.floor(O[0]) + 5, y0 = Math.floor(O[1]) + 5, V = [], F = [], FC = [], n = 20;
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) V.push([x0 + i, y0 + j, O[2] + 5]);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i; F.push(a, a + 1, a + n + 2, a, a + n + 2, a + n + 1); FC.push([150, 120, 90], [150, 120, 90]); }
    const r = { V, F: Uint32Array.from(F), FC, opts: { cell: 0.25 } };
    out.start = l3digStart(r, 0.25); const hf = l3dig.hf; out.grid = [hf.nx, hf.ny];
    const cx = x0 + 10 - O[0], cy = y0 + 10 - O[1], z0 = 5;
    out.z = l3digZ(cx, cy);
    out.surf = l3Surfaces().includes(l3dig.group);
    // skopan: en pinne som sveps genom marken 1 m djupt längs x
    const tip = new THREE.Object3D(); l3.scene.add(tip), g = new THREE.Object3D(); l3.scene.add(g);
    l3dig.cap = 1.2; l3dig.swell = 1.3;
    for (let s = 0; s <= 40; s++) { tip.position.set(cx - 2 + s * 0.1, cy, z0 - 0.8); tip.updateMatrixWorld(true); l3digTick(g, tip, { bucket: 1.0 }); }
    out.after = l3digZ(cx - 1.5, cy); out.removed = l3dig.removed; out.load = l3dig.load;
    // skopan är full efter 1,2 m³ löst = 0,92 m³ fast
    out.capped = l3dig.load <= l3dig.cap + 1e-6;
    // tömma: spetsen över marken med öppen skopa
    const lv = l3dig.load; for (let s = 0; s < 80; s++) { tip.position.set(cx + 5, cy + 5, z0 + 1.0); tip.updateMatrixWorld(true); l3digTick(g, tip, { bucket: 0.1 }); }
    out.dumped = lv - l3dig.load; out.pile = l3digZ(cx + 5, cy + 5); out.net = l3digNet();
    // preciserar volymbalans: bortgrävt (fast) minus utlagt (löst → fast)
    out.balance = Math.abs(l3dig.removed - l3dig.piled - out.net);   // högen är löst material (större volym)
    return out;
  });
  console.log(JSON.stringify(res));
  ok(res.start && res.grid[0] >= 70, 'Jorden byggs: ' + JSON.stringify(res.grid));
  ok(Math.abs(res.z - 5) < 0.05, 'Markhöjden stämmer: ' + res.z);
  ok(res.surf, 'Jorden är en markyta (gå-läget står på den)');
  ok(res.after < 4.5 && res.removed > 0.3, 'Skopan grävde: ' + res.after + ' / ' + res.removed);
  ok(res.capped, 'Skopan fylls bara till sin storlek');
  ok(res.dumped > 0.3 && res.pile > 5.05, 'Lasten tömdes i en hög: ' + res.dumped + ' / ' + res.pile);
  ok(res.balance < 0.05, 'Volymen stämmer (bortgrävt − utlagt i hög = netto): ' + res.balance);

  // Ras: en lodrät kant mot en grop rasar ner och volymen bevaras; damm/klumpar skapas.
  const ras = await page.evaluate(async () => {
    l3digReset(); l3dig.repose = true; l3dig.angle = 35; const hf = l3dig.hf, cx = hf.x0 + 10, cy = hf.y0 + 10;
    // gräv en grop 1,5 m djup (hela volymen direkt i rutorna) med lodräta kanter
    let before = 0; for (let k = 0; k < hf.H.length; k++) before += hf.H[k];
    for (let j = 0; j < hf.ny; j++) for (let i = 0; i < hf.nx; i++) { const x = hf.x0 + i * hf.cell, y = hf.y0 + j * hf.cell; if (Math.abs(x - cx) < 1 && Math.abs(y - cy) < 1) hf.H[j * hf.nx + i] -= 1.5; }
    let mid = 0; for (let k = 0; k < hf.H.length; k++) mid += hf.H[k]; l3digApply(0, 0, hf.nx - 1, hf.ny - 1);
    const z0 = l3digZ(cx + 1.3, cy), slope0 = l3digZ(cx + 1.3, cy) - l3digZ(cx, cy);
    const g = new THREE.Object3D(), tip = new THREE.Object3D(); tip.position.set(cx - 7, cy - 7, 20); l3.scene.add(tip); l3.scene.add(g);
    for (let s = 0; s < 120; s++) l3digTick(g, tip, { bucket: 1 });
    let after = 0; for (let k = 0; k < hf.H.length; k++) after += hf.H[k];
    const z1 = l3digZ(cx + 1.3, cy), depth1 = l3digZ(cx + 2.5, cy) - l3digZ(cx, cy);
    l3dig.on = true; l3digFxEmit(new THREE.Vector3(cx, cy, 5), 5, 1, 1, false); const fx = !!l3dig.pts; return { slope0, depth1, z0, z1, dv: Math.abs(after - mid) * hf.cell * hf.cell, settled: l3dig.settled, fx };
  });
  console.log(JSON.stringify(ras));
  ok(ras.settled > 0.1, 'Kanten rasar: ' + JSON.stringify(ras));
  ok(ras.dv < 0.05, 'Rasets volym bevaras: ' + ras.dv);
  ok(ras.fx, 'Damm/klumpar skapas');
  // bild för ögonkoll
  await page.evaluate(async () => {
    l3digReset(); const hf = l3dig.hf, cx = hf.x0 + 10, cy = hf.y0 + 10, g = new THREE.Object3D(), tip = new THREE.Object3D(); l3.scene.add(tip); l3.scene.add(g); l3dig.cap = 2.5;
    for (let s = 0; s <= 60; s++) { tip.position.set(cx - 3 + s * 0.08, cy + Math.sin(s * 0.2) * 0.4, 5 - 1.1); tip.updateMatrixWorld(true); l3digTick(g, tip, { bucket: 1 }); }
    for (let s = 0; s <= 60; s++) { tip.position.set(cx + 4, cy - 3, 6.0); tip.updateMatrixWorld(true); l3digTick(g, tip, { bucket: 0.1 }); }
    l3FlyTo(new THREE.Vector3(cx, cy, 5), 14, new THREE.Vector3(0.6, -1, 0.9), 0); l3Render(); await new Promise(r => setTimeout(r, 500)); l3Render();
  });
  await page.screenshot({ path: '/tmp/dig.png' });
  ok(!errors.length, 'JS-fel: ' + errors.join(' | '));
  await browser.close(); server.close(); console.log('OK test_lagesplan_3ddig');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
