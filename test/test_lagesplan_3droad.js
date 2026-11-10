const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9052;
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
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A');
  });
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  const r = await page.evaluate(async () => {
    // Punktmoln: sluttning 20 % längs x och 30 % tvärs (så att vägen får både schakt och fyllning).
    const c0 = [6512330, 150130, 100], P = [];
    for (let y = -30; y <= 30; y += 0.5) for (let x = -35; x <= 35; x += 0.5) P.push(x, y, 0.2 * x + 0.3 * y);
    l3pc.clouds.push({ id: 'pcR', name: 'Moln R', visible: false, dz: 0, nTot: P.length / 3, info: { center: c0, min: [c0[0] - 35, c0[1] - 30, 60], max: [c0[0] + 35, c0[1] + 30, 140] }, chunks: [{ pos: new Float32Array(P) }] });
    const pts = [[6512300, 150130, 100 + 0.2 * -30], [6512315, 150134, 100 + 0.2 * -15 + 0.3 * 4], [6512330, 150130, 100], [6512345, 150126, 100 + 3 - 1.2], [6512360, 150130, 106]].map(p => p.map(v => Math.round(v * 1000) / 1000));
    window.__pts = pts;
    l3roadOpen({ pts, spec: { ...L3R_DEF, src: ['pc:pcR'], grade: 10, width: 5 }, res: null, geom: null, st: null, busy: '', err: '' });
    for (let i = 0; i < 80 && !(l3road.cur && (l3road.cur.res || l3road.cur.err)); i++) await new Promise(r => setTimeout(r, 150));
    const c = l3road.cur; if (!c) return { err: 'ingen väg' };
    if (c.err) return { err: c.err };
    const res = c.res, st = c.st; let maxG = 0; for (let i = 1; i < st.length; i++) maxG = Math.max(maxG, Math.abs(st[i].z - st[i - 1].z) / (st[i].s - st[i - 1].s));
    return { res: { len: res.len, maxG, cut: res.cut, fill: res.fill, slopeCut: res.slopeCut, slopeFill: res.slopeFill, unreached: res.unreached, tight: res.tight.length }, hasRoad: !!c.geom.road.idx.length, hasCut: !!c.geom.cut, hasFill: !!c.geom.fill, panel: !!document.getElementById('v3RoadPanel'), txt: document.getElementById('v3RoadPanel').innerText.slice(0, 200) };
  });
  if (process.env.SHOT) { await page.evaluate(() => { const c = l3road.cur, O = l3.O, t = new THREE.Vector3(6512330 - O[0], 150130 - O[1], 100 - O[2]); // ytan som mesh för bild
      const g = new THREE.PlaneGeometry(70, 60, 70, 60), pa = g.getAttribute('position'); for (let i = 0; i < pa.count; i++) pa.setZ(i, 0.2 * pa.getX(i) + 0.3 * pa.getY(i)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x8a8f98, side: THREE.DoubleSide })); m.position.copy(t); m.userData.noHit = true; l3.scene.add(m);
      l3.camera.position.set(t.x - 30, t.y - 55, t.z + 45); l3.orbit.target.copy(t); l3.camera.lookAt(t); l3.camera.updateMatrixWorld(); l3.orbit.update(); l3Render(); }); await page.waitForTimeout(500); await page.screenshot({ path: process.env.SHOT }); }
  if (r.err) fail('Byggväg: ' + r.err);
  if (!(r.res.len > 55 && r.res.len < 80) || r.res.maxG > 0.1005) fail('Längd/lutning: ' + JSON.stringify(r));
  if (!r.hasRoad || !r.hasCut || !r.hasFill || r.res.cut < 20 || r.res.fill < 20 || r.res.slopeCut < 10 || r.res.slopeFill < 10) fail('Väg, slänter och volymer ska finnas: ' + JSON.stringify(r));
  if (!r.panel || !/Byggväg/.test(r.txt)) fail('Panelen ska visas: ' + r.txt);
  console.log('OK: byggvägen följer punktmolnet, lutningen begränsas till 10 %, slänter i schakt och fyllning med volymer', JSON.stringify(r.res));
  // Skapa objekt: tre ritade ytor (väg, schaktslänt, fyllningsslänt).
  const made = await page.evaluate(async () => { const n0 = placements.length; l3roadMake(); return { add: placements.length - n0, names: placements.slice(n0).map(p => p.name), closed: !l3road.cur }; });
  if (made.add !== 3 || !made.closed || !/Byggväg/.test(made.names[0])) fail('Skapa objekt: ' + JSON.stringify(made));
  console.log('OK: Skapa objekt ger väg + schaktslänt + fyllningsslänt som vanliga ytor', JSON.stringify(made.names));
  // Mät → Byggväg: mittlinjen via verktyget (Enter avslutar) öppnar panelen.
  const tool = await page.evaluate(async () => {
    l3SetPref('measure', 'road'); l3SetTool('measure');
    l3t.mp = window.__pts.map(p => new THREE.Vector3(p[0] - l3.O[0], p[1] - l3.O[1], p[2] - l3.O[2]));
    l3roadStart(); await new Promise(r => setTimeout(r, 1500));
    const seg = [...document.querySelectorAll('[data-mmode]')].map(b => b.textContent);
    return { open: !!l3road.cur, seg };
  });
  if (!tool.open || !tool.seg.includes('Byggväg')) fail('Verktyget Byggväg: ' + JSON.stringify(tool));
  // Lutningsgräns: 5 % ger en flackare väg (mer schakt/fyllning).
  const g5 = await page.evaluate(async () => { const c = l3road.cur; c.spec.grade = 5; l3rSchedule(0); for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 150)); if (!c.busy && c.res && c.res.maxG < 0.0505) break; } return c.res.maxG; });
  if (g5 > 0.0505) fail('5 % gräns: ' + g5);
  console.log('OK: Mät → Byggväg öppnar panelen och högsta lutning kan ändras');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
