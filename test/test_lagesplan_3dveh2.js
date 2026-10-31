const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9292;
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
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  const ok = (c, m) => { if (!c) fail(m); };
  const enter = kind => page.evaluate(kind => {
    if (l3w.on) l3wExit(true); l3pileClear();
    l3SetPref('walkPerson', 'third'); l3wEnter(new THREE.Vector3(0, 0, 0)); l3wSetKind(kind); l3w.heading = 0.6; l3w.yaw = 0.6; l3wWork(); l3wCtlPanel();
    const gg = l3w.av.g, rz = gg.rotation.z; gg.rotation.z = 0; gg.updateMatrixWorld(true); const bb = new THREE.Box3(); l3w.av.g.traverse(o => { if (o.isMesh && !o.userData.shadow && !(o.parent && o.parent.userData.noIfc) && !o.userData.heap) bb.expandByObject(o); }); const sz = bb.getSize(new THREE.Vector3()); gg.rotation.z = rz; gg.updateMatrixWorld(true); let meshes = 0, bad = 0; l3w.av.g.traverse(o => { if (o.isMesh) { meshes++; const p = o.geometry.attributes.position; if (!p || !isFinite(p.array[0])) bad++; } });
    return { sz: sz.toArray().map(v => Math.round(v * 10) / 10), meshes, bad, panel: !!document.querySelector('.v3-ctl:not(.hidden)'), sliders: document.querySelectorAll('.v3-ctl input[type=range]').length, auto: (document.querySelector('.v3-ctl [data-cb="auto"]') || {}).textContent };
  }, kind);
  const run = (n, dt = 0.05) => page.evaluate(([n, dt]) => { for (let i = 0; i < n; i++) { l3w.dt = dt; l3w.t += dt; l3wCtlStep(dt, new Set()); l3wApply(); } return { c: { ...l3w.ctl }, auto: l3w.auto, piles: l3pile.list.map(p => +p.vol.toFixed(2)), n: l3w.autoN || 0 }; }, [n, dt]);

  // ---- Lastbilen
  let t = await enter('truck');
  console.log(JSON.stringify(t));
  ok(t.panel && t.sliders === 3 && /Tippa lasten/.test(t.auto), 'Lastbilens reglagepanel: ' + JSON.stringify(t));
  ok(t.sz[0] > 9 && t.sz[0] < 12 && t.sz[1] > 2.4 && t.sz[1] < 4.2 && t.sz[2] > 3 && t.sz[2] < 4.5 && t.meshes > 150 && !t.bad, 'Lastbilens mått och detaljer: ' + JSON.stringify(t));
  // manuell tippning med flaket stängt tömmer inget; med öppen baklucka rinner lasten ut och bildar en hög
  let r = await page.evaluate(() => { l3w.ctlT.tip = 0.98; return 0; }); r = await run(120);
  ok(r.c.tip > 0.95 && r.c.load > 0.69 && r.piles.length === 0, 'Tippat med stängd baklucka ska inte tömma: ' + JSON.stringify(r));
  await page.evaluate(() => { l3w.ctlT.gate = 1; }); r = await run(260);
  ok(r.c.load < 0.01 && r.piles.length === 1 && Math.abs(r.piles[0] - 9.8) < 0.3, 'Lasten ska rinna ut och bilda en hög (9,8 m³): ' + JSON.stringify(r));
  await page.evaluate(() => { l3w.ctlT.tip = 0; l3w.ctlT.gate = 0; }); r = await run(200);
  ok(r.c.tip < 0.01 && r.c.gate < 0.01, 'Flak och baklucka ska gå tillbaka: ' + JSON.stringify(r.c));
  // automatiskt arbetsvarv: fyll flaket och tippa
  await page.evaluate(() => { l3w.ctlT.load = 1; }); r = await run(120);
  ok(r.c.load > 0.99, 'Fyll flaket: ' + JSON.stringify(r.c));
  await page.evaluate(() => { l3w.auto = true; l3w.autoS = 0; }); r = await run(700);
  ok(!r.auto && r.c.load === 0 && r.c.tip < 0.02 && r.piles.length === 1 && r.piles[0] > 18 && r.piles[0] < 25, 'Automatisk tippning ska tömma 14 m³ till samma hög och gå hem: ' + JSON.stringify(r));
  const mat = await page.evaluate(() => { l3v2Click('mat'); return l3w.ctl.mat; }); ok(mat === 1, 'Materialknappen byter material');
  // ---- Hjullastaren
  let l = await enter('loader');
  console.log(JSON.stringify(l));
  ok(l.panel && l.sliders === 3 && /Lasta och tippa/.test(l.auto), 'Hjullastarens reglagepanel: ' + JSON.stringify(l));
  ok(l.sz[0] > 7 && l.sz[0] < 11 && l.sz[1] > 2.8 && l.sz[1] < 4 && l.sz[2] > 3 && l.sz[2] < 4.5 && l.meshes > 100 && !l.bad, 'Hjullastarens mått och detaljer: ' + JSON.stringify(l));
  const edge0 = await page.evaluate(() => { l3w.ctl.arm = 0; l3w.ctl.bucket = 0; l3wApply(); return l3w.info.find(x => x[0] === 'Skopkant över marken')[1]; });
  ok(parseFloat(edge0.replace(',', '.')) < 0.25, 'Skopkanten ska nå marken i grundläget: ' + edge0);
  await page.evaluate(() => { l3w.auto = true; l3w.autoS = 0; l3w.autoN = 0; }); r = await run(1100);
  ok(r.n >= 1 && r.piles.reduce((a, b) => a + b, 0) + r.c.fill * 3.2 > 2.8 && r.piles.reduce((a, b) => a + b, 0) + r.c.fill * 3.2 < 6.6, 'Lasta och tippa: varven ska ge en hög av en skopa (3,2 m³) som lastaren tar ur igen: ' + JSON.stringify(r));
  await page.evaluate(() => { l3w.auto = false; }); r = await run(200);
  // lastaren tar ur högen: skopkanten i högen, skopan kröks in
  const take = await page.evaluate(() => {
    const p = l3pile.list[0], g = l3w.av.g; l3w.ctl.arm = 0; l3w.ctlT.arm = 0; l3w.ctl.bucket = 0; l3w.ctlT.bucket = 0; l3w.ctl.fill = 0; l3w.ctlT.fill = 0; l3wApply();
    const e = new THREE.Vector3(); g.updateMatrixWorld(true); let edge = null; g.traverse(o => { if (o.type === 'Object3D' && o.position.x > 1.9 && o.position.x < 2.0 && Math.abs(o.position.z + 0.85) < 0.01) edge = o; }); edge.getWorldPosition(e);
    const v0 = p.vol; p.x = e.x; p.y = e.y; p.z = g.position.z; l3pileAdd(e.x, e.y, g.position.z, 0, p.mat);
    l3w.ctlT.bucket = 0.55; for (let i = 0; i < 60; i++) { l3w.dt = 0.05; l3wCtlStep(0.05, new Set()); l3wApply(); }
    return { fill: l3w.ctl.fill, v0, v1: l3pile.list.length ? l3pile.list.reduce((a, b) => a + b.vol, 0) : 0 };
  });
  ok(take.fill > 0.2 && take.v1 < take.v0, 'Skopan ska fyllas ur högen när den kröks in: ' + JSON.stringify(take));
  // reglagepanelen och gå-rutan går att fälla ihop (valet sparas)
  const col = await page.evaluate(() => { const p = document.querySelector('.v3-ctl'), h = document.querySelector('.v3-walk'), vis = e => [...e.children].filter(c => getComputedStyle(c).display !== 'none').length, h0 = p.getBoundingClientRect().height, w0 = vis(h); p.querySelector('[data-cb="col"]').click(); h.querySelector('[data-w="col"]').click(); return { h0, h1: p.getBoundingClientRect().height, w0, w1: vis(h), pc: l3Prefs().walkCtlCol, hc: l3Prefs().walkHudCol, lab: getComputedStyle(p.querySelector('label span')).color }; });
  ok(col.h1 < col.h0 / 4 && col.w1 < col.w0 / 2 && col.pc === true && col.hc === true, 'Panelerna ska kunna fällas ihop: ' + JSON.stringify(col));
  await page.evaluate(() => { document.querySelector('.v3-ctl [data-cb="col"]').click(); document.querySelector('.v3-walk [data-w="col"]').click(); });
  // lås lastbilen i sitt läge och exportera som IFC (inga trasiga delar)
  const lk = await page.evaluate(async () => { l3wSetKind('truck'); l3wWork(); l3w.ctl.tip = 0.6; l3w.ctlT.tip = 0.6; l3wApply(); window.__vehKeep = true; l3wLock(); const it = l3w.locked[0]; const ifc = it ? await l3vIfcExport(it, false) : null; return { locked: l3w.locked.length, tris: ifc && ifc.tris, head: ifc && ifc.text && ifc.text.slice(0, 13) }; });
  ok(lk.locked === 1 && lk.tris > 3000 && lk.head === 'ISO-10303-21;', 'Låst lastbil ska kunna exporteras som IFC: ' + JSON.stringify(lk));
  ok(!errors.length, 'JS-fel: ' + errors.join('|'));
  console.log('OK: gå-läget – lastbil och hjullastare med reglage, tippning, högar och arbetsvarv');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
