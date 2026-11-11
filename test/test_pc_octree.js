const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9067;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : q.url.includes('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  // Syntetisk LAS (4 milj. punkter, format 2 med färg) – större än punktbudgeten (satt till 1 milj.) → okträd
  const N = 4000000, lasPath = path.join(require('os').tmpdir(), 'oct_test.las'), hdr = 227, rec = 26, buf = Buffer.alloc(hdr + N * rec);
  buf.write('LASF', 0); buf[24] = 1; buf[25] = 2; buf.writeUInt16LE(hdr, 94); buf.writeUInt32LE(hdr, 96); buf.writeUInt32LE(0, 100); buf[104] = 2; buf.writeUInt16LE(rec, 105); buf.writeUInt32LE(N, 107);
  [0.001, 0.001, 0.001].forEach((v, i) => buf.writeDoubleLE(v, 131 + i * 8)); [6512000, 150000, 0].forEach((v, i) => buf.writeDoubleLE(v, 155 + i * 8));
  buf.writeDoubleLE(6512400, 179); buf.writeDoubleLE(6512000, 187); buf.writeDoubleLE(150400, 195); buf.writeDoubleLE(150000, 203); buf.writeDoubleLE(40, 211); buf.writeDoubleLE(0, 219);
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < N; i++) { const clustered = i % 3 === 0, x = clustered ? 100 + rnd() * 60 : rnd() * 400, y = clustered ? 100 + rnd() * 60 : rnd() * 400, z = 18 + 8 * Math.sin(x / 40) + 6 * Math.cos(y / 30) + (clustered ? 3 : 0), o = hdr + i * rec;
    buf.writeInt32LE(Math.round(x * 1000), o); buf.writeInt32LE(Math.round(y * 1000), o + 4); buf.writeInt32LE(Math.round(z * 1000), o + 8); buf.writeUInt16LE(100, o + 12); buf.writeUInt16LE(Math.round(z * 1000), o + 20); buf.writeUInt16LE(30000, o + 22); buf.writeUInt16LE(Math.round(x * 100), o + 24); }
  fs.writeFileSync(lasPath, buf);
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A'); l3SetPref('pcBudget', 1000000);
  });
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  const tConv = Date.now(); const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.evaluate(() => l3pcFromFile())]); await fc.setFiles(lasPath);
  await page.waitForFunction(() => l3pc.clouds.length === 1 || /Kunde inte/.test((document.getElementById('v3Status') || {}).textContent || ''), null, { timeout: 240000 });
  console.log('bygge (s):', (Date.now() - tConv) / 1000); const a = await page.evaluate(async () => { const c = l3pc.clouds[0]; if (!c) return { err: 'inget moln' }; const L = c.lod; return { lod: !!L, total: c.info.total, pinned: c.nTot, nodes: L && L.nodes.length, depth: L && Math.max(...L.nodes.map(n => n.l)), bytes: L && L.file.size, ownPts: L && L.nodes.reduce((s, n) => s + n.n, 0) }; });
  console.log(JSON.stringify(a));
  if (!a.lod) fail('inget okträd byggdes: ' + JSON.stringify(a));
  if (a.ownPts !== N) fail('okträdet har inte alla punkter: ' + a.ownPts + ' av ' + N);
  if (!(a.pinned >= 0.9e6 && a.pinned < 3e6 && a.nodes > 20 && a.depth >= 2)) fail('konstigt okträd');
  // Zooma in – djupare noder ska läsas in
  const b = await page.evaluate(async () => { const c = l3pc.clouds[0], L = c.lod; l3pcShow(c.id, true); const t = c.info.center; const cam = l3.camera; const cx = 130 + c.info.min[0] - t[0] + (t[0] - l3.O[0]), cy = 130 + c.info.min[1] - t[1] + (t[1] - l3.O[1]);
    const tgt = new THREE.Vector3(c.info.min[0] + 130 - l3.O[0], c.info.min[1] + 130 - l3.O[1], 10 - l3.O[2]); cam.position.set(tgt.x + 15, tgt.y - 15, tgt.z + 20); cam.lookAt(tgt); if (l3.controls) { l3.controls.target.copy(tgt); l3.controls.update(); }
    for (let i = 0; i < 40; i++) { l3Render(); await new Promise(r => setTimeout(r, 120)); if (L.res.size > 80 && !L.loading) break; }
    try { l3pcFrame(); } catch (e) { window.__err = e.message + ' ' + (e.stack || '').split('\n')[1]; } const deep = [...L.res].filter(n => n.l >= 3).length; return { res: L.res.size, resPts: L.resPts, deep, sel: L.sel, selPts: L.selPts, vis: L.shown.length, maxBud: L.maxBud, err: window.__err, hud: (document.getElementById('v3PcHud') || {}).textContent }; });
  console.log(JSON.stringify(b));
  if (!(b.deep > 0 && b.selPts > 0 && b.selPts <= b.maxBud * 1.1)) fail('detaljnoder lästes inte in: ' + JSON.stringify(b));
  // Fästa mot punkterna i okträdsmolnet (översikt + detalj) – ska träffa en punkt nära strålen
  const pk = await page.evaluate(async () => { const c = l3pc.clouds[0], L = c.lod; const r = l3.renderer.domElement.getBoundingClientRect(); let hit = 0, tot = 0, det = 0;
    for (const f of [[0.5, 0.5], [0.45, 0.55], [0.55, 0.45], [0.5, 0.6]]) { tot++; const h = l3pcPick({ clientX: r.left + r.width * f[0], clientY: r.top + r.height * f[1] }, 14); if (h) { hit++; } }
    const detailIdx = [...L.res].filter(n => !n.pinned && n.cd && n.cd.cells).length; const pinIdx = L.nodes.filter(n => n.pinned && n.cd && n.cd.cells).length;
    // färger ska följa positionerna efter indexeringen: antal färger = antal punkter i varje ritad nod
    const bad = [...L.res].filter(n => n.pts && n.pts.geometry.getAttribute('color').count !== n.pts.geometry.getAttribute('position').count).length;
    return { hit, tot, detailIdx, pinIdx, bad }; });
  console.log(JSON.stringify(pk));
  if (pk.hit < 1 || pk.bad) fail('fäst mot okträdsmoln fungerar inte: ' + JSON.stringify(pk));
  // Ta bort molnet och öppna på nytt ur disken utan filen
  await page.evaluate(() => { const c = l3pc.clouds[0]; l3pcRemove(c.id); });
  const d = await page.evaluate(async () => { const s = l3pcRemembered()[0]; const { on, ...src } = s; const t0 = performance.now(); await l3pcLoad(src, null, { cacheOnly: true, zoom: false }); const c = l3pc.clouds[0]; return { ok: !!(c && c.lod), ms: Math.round(performance.now() - t0), total: c && c.info.total }; });
  console.log(JSON.stringify(d));
  if (!d.ok || d.total !== 4000000) fail('molnet öppnades inte ur disken: ' + JSON.stringify(d));
  console.log('OK: stort punktmoln byggs till okträd, detaljer läses in vid inzoomning och molnet öppnas direkt ur disken');
  if (errors.length) fail('sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
