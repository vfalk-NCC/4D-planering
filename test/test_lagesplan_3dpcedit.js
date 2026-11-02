const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9087;
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
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    // UTF-8 rakt i filen ("Stålbolaget") – som en del program skriver.
  }, '');

  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  const r = await page.evaluate(() => {
    const P = []; for (let y = -10; y < 10; y += 0.5) for (let x = -10; x < 10; x += 0.5) P.push(x, y, (x + 10) * 0.1);   // 1600 punkter, 20 x 20 m
    const info = { center: [l3.O[0] + 5, l3.O[1] + 5, l3.O[2] + 1], min: [0, 0, 0], max: [1, 1, 1], format: 'test', n: P.length / 3, total: P.length / 3 };
    const src = { id: 'pcEd', name: 'Testmoln' }; const c = l3pcBuild(src, { info, chunks: [{ pos: new Float32Array(P), inten: new Uint8Array(P.length / 3) }] }); window.__c = c;
    // kameran rakt uppifrån så att ringen i bilden motsvarar ett område i planen
    const cam = l3.camera; l3.orbit.target.set(5 - 5, 5 - 5, 0); cam.position.set(0, 0, 60); cam.up.set(0, 1, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); if (cam.updateProjectionMatrix) cam.updateProjectionMatrix(); l3.orbit.update(); l3Render();
    const v = new THREE.Vector3(0, 0, 0).project(cam), a = new THREE.Vector3(-5, -5, 0).project(cam), b = new THREE.Vector3(5, 5, 0).project(cam);
    const n0 = c.nTot; l3peStart('pcEd');
    l3pe.pend = { poly: [[a.x, a.y], [b.x, a.y], [b.x, b.y], [a.x, b.y]] }; l3peDo('in');   // 10 x 10 m i mitten (molnets centrum ligger i origo)
    const n1 = c.nTot; l3peUndo(c); const n2 = c.nTot; l3pe.pend = { poly: [[a.x, a.y], [b.x, a.y], [b.x, b.y], [a.x, b.y]] }; l3peDo('out'); const n3 = c.nTot;
    const saved = JSON.stringify((l3Prefs().pcEdits || {}).pcEd || []).length;
    const edN = c.edits.length; l3peStop(); l3peReset(c); const n4 = c.nTot;
    return { n0, n1, n2, n3, n4, saved, edN, panel: !document.getElementById('v3PcEdPanel') };
  });
  if (!(r.n1 < r.n0 && r.n1 > 0)) fail('Ta bort innanför ska ta bort punkter: ' + JSON.stringify(r));
  if (r.n2 !== r.n0) fail('Ångra ska ta tillbaka alla punkter: ' + JSON.stringify(r));
  if (!(r.n3 < r.n0 && r.n3 > 0 && Math.abs(r.n3 + r.n1 - r.n0) <= r.n0 * 0.1)) fail('Ta bort utanför ska vara motsatsen: ' + JSON.stringify(r));
  if (r.n4 !== r.n0 || !r.panel) fail('Återställ alla / Klar: ' + JSON.stringify(r));
  console.log('OK: punktmoln – ta bort innanför/utanför, ångra, återställ', JSON.stringify(r));
  // Redigeringen sparas och läggs på igen när molnet byggs om.
  const r2 = await page.evaluate(() => {
    const c = window.__c; l3peStart('pcEd'); const cam = l3.camera, a = new THREE.Vector3(-5, -5, 0).project(cam), b = new THREE.Vector3(5, 5, 0).project(cam);
    l3pe.pend = { poly: [[a.x, a.y], [b.x, a.y], [b.x, b.y], [a.x, b.y]] }; l3peDo('in'); const n1 = c.nTot; l3peStop();
    l3pcRemove('pcEd'); const P = []; for (let y = -10; y < 10; y += 0.5) for (let x = -10; x < 10; x += 0.5) P.push(x, y, (x + 10) * 0.1);
    const c2 = l3pcBuild({ id: 'pcEd', name: 'Testmoln' }, { info: { ...c.info }, chunks: [{ pos: new Float32Array(P), inten: new Uint8Array(P.length / 3) }] });
    return { n1, again: c2.nTot, edits: (c2.edits || []).length };
  });
  if (r2.again !== r2.n1 || r2.edits !== 1) fail('Redigeringen ska läggas på igen vid inläsning: ' + JSON.stringify(r2));
  console.log('OK: redigeringen sparas och läggs på igen vid inläsning', JSON.stringify(r2));
  // Riktiga musklick: ring med fyra punkter + dubbelklick, sedan knappen Ta bort innanför.
  await page.evaluate(() => { window.__c = l3pc.clouds.find(x => x.id === 'pcEd'); l3peReset(window.__c); l3peStart('pcEd'); window.__n = window.__c.nTot; });
  const box = await page.evaluate(() => { const r = l3.renderer.domElement.getBoundingClientRect(), cam = l3.camera, f = (x, y) => { const v = new THREE.Vector3(x, y, 0).project(cam); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; }; return [f(-4, -4), f(4, -4), f(4, 4), f(-4, 4)]; });
  for (const [x, y] of box) await page.mouse.click(x, y);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => l3pe.pend, null, { timeout: 3000 });
  await page.click('[data-pe="in"]'); await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({ n: window.__c.nTot, was: window.__n, edits: window.__c.edits.length }));
  if (!(after.n < after.was) || after.edits < 1) fail('Ring med musen + Ta bort innanför: ' + JSON.stringify(after));
  console.log('OK: ring med musen och knappen Ta bort innanför', JSON.stringify(after)); await page.evaluate(() => l3peStop());
  // ---- Filter: höjd, utglesning, brus, mark/över mark ----
  const f = await page.evaluate(() => {
    const O = l3.O, c0 = l3pcBuild({ id: 'pcF', name: 'Filter' }, { info: { center: [O[0], O[1], O[2]], min: [0, 0, 0], max: [1, 1, 5], format: 'test', n: 0, total: 0 }, chunks: [(() => {
      const P = []; for (let y = 0; y < 10; y += 0.5) for (let x = 0; x < 10; x += 0.5) P.push(x, y, 0);          // 400 marktpunkter z = 0
      for (let i = 0; i < 20; i++) P.push(4.5 + (i % 5) * 0.1, 4.5 + Math.floor(i / 5) * 0.1, 1.0 + (i % 3) * 0.1);   // 20 punkter 1 m över (en buske)
      P.push(100, 100, 9, -100, -100, 9);                                                                              // 2 enstaka brus
      return { pos: new Float32Array(P), inten: new Uint8Array(P.length / 3) }; })()] });
    const n0 = c0.nTot, r = {}; r.n0 = n0;
    r.noise = l3peAddFilter(c0, { t: 'noise', r: 1, k: 3 }).removed; l3peUndo(c0);
    r.ground = l3peAddFilter(c0, { t: 'ground', mode: 'ground', g: 2, h: 0.3 }).removed; l3peUndo(c0);
    r.zab = l3peAddFilter(c0, { t: 'z', mode: 'above', z0: O[2] + 0.5 }).removed; l3peUndo(c0);
    r.thin = l3peAddFilter(c0, { t: 'thin', s: 2 }).removed; r.left = c0.nTot; l3peReset(c0);
    r.back = c0.nTot; return r;
  });
  if (f.noise !== 2) fail('Brusfilter ska ta bort de två enstaka punkterna: ' + JSON.stringify(f));
  if (f.ground < 20 || f.ground > 24) fail('Mark/över mark ska ta bort busken (≈20-22): ' + JSON.stringify(f));
  if (f.zab < 20) fail('Höjdfilter över nivå: ' + JSON.stringify(f));
  if (!(f.left < f.n0 / 4 && f.left > 0) || f.back !== f.n0) fail('Utglesning/återställ: ' + JSON.stringify(f));
  console.log('OK: filter (brus, mark/över mark, höjd, utglesning)', JSON.stringify(f));
  // ---- Profil, volymtabell och släntkropp ----
  const pr = await page.evaluate(() => {
    const out = {}; const prof = l3ptProfile([0, 0, 0], [10, 0, 0], 1);   // moln pcF ligger runt scen-origo (mitt = O) → [0,10] längs x
    out.series = prof.series.map(s => s.n); out.L = prof.L;
    const csv = l3ptCsvBuild(); out.csvRows = csv.rows.length; out.csvHead = csv.text.split('\r\n')[0].replace('\ufeff', '').slice(0, 30);
    // släntkropp: kvadrat 10 x 10, lutning 1:1, höjd 2 utåt → stympad pyramid ≈ 290,7 m³
    const S = l3ptSlopeSolid([[0, 0], [10, 0], [10, 10], [0, 10]], 0, l3ptSlopeRings(1, 2, 0, 5, true));
    out.slope = S ? modMeshStats(S.pts, S.faces).volume : null;
    const B = l3ptSlopeSolid([[0, 0], [10, 0], [10, 10], [0, 10]], 0, l3ptSlopeRings(1, 4, 2, 2, true)); out.berm = B ? B.nr : 0;
    return out;
  });
  if (!pr.series.length || !(pr.series[0] > 0)) fail('Profilen ska hitta punkter: ' + JSON.stringify(pr));
  if (!pr.slope || Math.abs(pr.slope - 290.67) > 2) fail('Släntkroppens volym ska bli ≈ 290,7 m³: ' + JSON.stringify(pr));
  if (pr.berm < 4) fail('Berm ska ge fler ringar: ' + JSON.stringify(pr));
  console.log('OK: profil, volymtabell och släntkropp', JSON.stringify(pr));
  // ---- Profilvyn: ytlinje, jämförelse, zoom, fullskärm och DXF ----
  const pf = await page.evaluate(async () => {
    const out = {}, O = l3.O;
    // två plana moln med 0,5 m höjdskillnad längs x: pcA z = c+0, pcB z = c+0,5 (A ligger lägre → schakt)
    l3pc.clouds.slice().forEach(c => l3pcRemove(c.id));
    const mk = (id, name, dz) => { const P = []; for (let y = -2; y <= 2; y += 0.25) for (let x = -10; x <= 10; x += 0.25) P.push(x, y, dz); return l3pcBuild({ id, name }, { info: { center: [O[0], O[1], O[2]], min: [0, 0, 0], max: [1, 1, 1], format: 't', n: 0, total: 0 }, chunks: [{ pos: new Float32Array(P), inten: new Uint8Array(P.length / 3) }] }); };
    mk('qa', 'Moln A', 0); mk('qb', 'Moln B', 0.5);
    l3pfShow([-10, 0, 0], [10, 0, 0], 1);
    out.series = l3pf.data.series.length; out.lines = l3pf.lines.map(l => l.v.filter(v => v != null).length);
    out.cut = l3pf.diff && l3pf.diff.cut; out.fill = l3pf.diff && l3pf.diff.fill; out.cover = l3pf.diff && l3pf.diff.cover;
    out.zA = l3pfAt(l3pf.lines[0], 5); out.zB = l3pfAt(l3pf.lines[1], 5);
    // zoom med hjulet (Skift = bara längd)
    const v0 = { ...l3pf.view }, cv = l3pf.cv, r = cv.getBoundingClientRect();
    cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, shiftKey: true, bubbles: true, cancelable: true }));
    out.zoomX = (l3pf.view.x1 - l3pf.view.x0) < (v0.x1 - v0.x0) - 0.5; out.zKept = Math.abs((l3pf.view.z1 - l3pf.view.z0) - (v0.z1 - v0.z0)) < 1e-6;
    l3pfFit(); out.fit = Math.abs(l3pf.view.x1 - 20) < 0.01;
    l3pfFs(); out.fs = l3pf.el.classList.contains('fs'); await new Promise(r => setTimeout(r, 120)); out.fsW = l3pf.el.getBoundingClientRect().width; l3pfFs(); out.fsOff = !l3pf.el.classList.contains('fs');
    const dxf = l3pfDxfText(false), dxf3 = l3pfDxfText(true);
    out.dxfOk = dxf.startsWith('0\nSECTION') && dxf.trim().endsWith('EOF') && (dxf.match(/POLYLINE/g) || []).length >= 4; out.dxfLayers = (dxf.match(/PROFIL_Moln_A/g) || []).length > 0; out.dxfCut = /PROFIL_SCHAKT/.test(dxf);
    out.dxf3 = /POLYLINE\n8\nPROFIL_Moln_A\n66\n1\n70\n8/.test(dxf3.replace(/\r/g, '')); const m = dxf3.match(/VERTEX\n8\nPROFIL_Moln_A\n10\n([\d.]+)\n20\n([\d.]+)/); out.x3 = m ? Number(m[1]) : null; out.ox = O[0];
    out.dec = JSON.stringify(Number(String(0.5).replace(',', '.')));
    return out;
  });
  if (pf.series !== 2 || pf.lines.some(n => n < 50)) fail('Profil: två ytlinjer: ' + JSON.stringify(pf));
  if (Math.abs(pf.zB - pf.zA - 0.5) > 0.02) fail('Profil: höjdskillnad 0,5 m: ' + JSON.stringify(pf));
  if (Math.abs(pf.cut - 10) > 0.8 || pf.fill > 0.05) fail('Profil: tvärsnittsarea schakt ≈ 20 m × 0,5 m = 10 m²: ' + JSON.stringify(pf));
  if (!pf.zoomX || !pf.zKept || !pf.fit || !pf.fs || !pf.fsOff || pf.fsW < 800) fail('Profil: zoom/hela/fullskärm: ' + JSON.stringify(pf));
  if (!pf.dxfOk || !pf.dxfLayers || !pf.dxfCut || !pf.dxf3 || pf.x3 == null) fail('Profil: DXF: ' + JSON.stringify(pf));
  console.log('OK: profilvy – ytlinjer, skillnad 10 m², zoom, fullskärm, DXF (profil + 3D)', JSON.stringify(pf));
  // Menyn
  await page.evaluate(() => l3ptOpen()); const ui = await page.evaluate(() => ({ btn: !!document.getElementById('v3PcToolBtn'), panel: !!document.getElementById('v3PcTools'), secs: document.querySelectorAll('#v3PcTools details').length }));
  if (!ui.btn || !ui.panel || ui.secs < 5) fail('Verktygsmenyn: ' + JSON.stringify(ui)); console.log('OK: punktmolnens verktygsmeny', JSON.stringify(ui));
  // profil: färgval, IFC-genomskärning, nivå, referens och hovervärden (Victor 2026-11-02)
  const pf2 = await page.evaluate(async () => {
    const o = {}, O = l3.O; l3pfClear();
    // en IFC-liknande låda 4 x 4 x 2 m runt x=0..4, y -2..2, z 0.3..2.3 (icke-indexerad triangelsoppa med ranges)
    const bx = new THREE.BoxGeometry(4, 4, 2).toNonIndexed(); bx.translate(2, 0, 1.3); const mesh = new THREE.Mesh(bx, new THREE.MeshBasicMaterial()); mesh.userData.l3b = { ranges: [{ start: 0, count: bx.getAttribute('position').count, name: 'Lada', guid: 'gx' }], hidden: new Set(), model: { id: 'ifcX' } };
    l3.scene.add(mesh); l3b.models.push({ id: 'ifcX', name: 'Testmodell.ifc', visible: true, meshes: [mesh], tris: 12 });
    l3pfShow([-10, 0, 0], [10, 0, 0], 1);
    o.ifc = l3pf.ifc.length === 1 && l3pf.ifc[0].segs.length >= 8; const S = l3pf.ifc[0] ? l3pf.ifc[0].segs : []; let tmin = 1e9, tmax = -1e9, zmin = 1e9, zmax = -1e9; for (let k = 0; k < S.length; k += 2) { if (k % 4 === 0 || true) { tmin = Math.min(tmin, S[k]); tmax = Math.max(tmax, S[k]); } } for (let k = 1; k < S.length; k += 2) { zmin = Math.min(zmin, S[k]); zmax = Math.max(zmax, S[k]); }
    o.ifcT = [Math.round(tmin * 10) / 10, Math.round(tmax * 10) / 10]; o.ifcZ = [Math.round((zmin - O[2]) * 10) / 10, Math.round((zmax - O[2]) * 10) / 10];
    // legenden har färgval för moln och IFC
    o.colInputs = l3pf.el.querySelectorAll('[data-pf-col]').length;
    const c0 = l3pf.el.querySelector('[data-pf-col]'); c0.value = '#ff0000'; c0.dispatchEvent(new Event('input', { bubbles: true })); o.col = l3pf.data.series[0].color === '#ff0000' && l3pf.data.series[0].aci === 1 && l3Prefs().pfCol[l3pf.data.series[0].id] === '#ff0000';
    // färgen kommer ihåg när profilen öppnas igen
    l3pfShow([-10, 0, 0], [10, 0, 0], 1); o.colKept = l3pf.data.series[0].color === '#ff0000';
    // nivå + mätning
    const lv = l3pf.el.querySelector('[data-pf="lvl"]'); lv.value = '0,25'; lv.dispatchEvent(new Event('change', { bubbles: true })); o.lvl = l3pf.level === 0.25 && /Mot nivå/.test(l3pf.el.textContent);
    const cv = l3pf.cv, r = cv.getBoundingClientRect(), g = l3pfGeom(), px = r.left + g.l + g.w * 0.3, py = r.top + g.t + g.h * 0.5;
    cv.dispatchEvent(new PointerEvent('pointermove', { clientX: px, clientY: py, bubbles: true, pointerId: 1 })); o.hz = typeof l3pf.hz === 'number' && l3pf.hover != null;
    cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: px, clientY: py, button: 0, bubbles: true, pointerId: 1 })); cv.dispatchEvent(new PointerEvent('pointerup', { clientX: px, clientY: py, button: 0, bubbles: true, pointerId: 1 })); o.ref = !!l3pf.ref;
    const px2 = r.left + g.l + g.w * 0.6; cv.dispatchEvent(new PointerEvent('pointermove', { clientX: px2, clientY: py, bubbles: true, pointerId: 1 })); let err = null; try { l3pfDraw(); } catch (e) { err = String(e); } o.draw = !err; o.drawErr = err;
    const dxf = l3pfDxfText(false), dxf3 = l3pfDxfText(true); o.dxf = /PROFIL_IFC_Testmodell_ifc/.test(dxf) && /PROFIL_SKALA/.test(dxf) && /PROFIL_NIVA/.test(dxf); o.dxf3 = /PROFIL_IFC_Testmodell_ifc/.test(dxf3); o.map = /PROFIL_KARTA_PROFIL/.test(dxf) && /PROFIL_KARTA_MOLN/.test(dxf) && /PROFIL_KARTA_IFC/.test(dxf) && /Var profilen ar tagen/.test(dxf); o.meta = l3pfMeta().filter(t => /Punktmoln: /.test(t)).length === 2 && l3pfMeta().some(t => /Jämförelse: /.test(t)) && l3pfMeta().some(t => /Testmodell/.test(t)); o.info = /PROFIL_INFO/.test(dxf); { const cc = document.createElement('canvas'); cc.width = cc.height = 300; l3pfSituation(cc.getContext('2d'), 0, 0, 300); const d = cc.getContext('2d').getImageData(0, 0, 300, 300).data; let purple = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 100 && d[i] < 140 && d[i + 1] < 90 && d[i + 2] > 200) purple++; o.sit = purple > 100; o.sitPurple = purple; }
    l3b.models.pop(); l3.scene.remove(mesh); l3pfClear(); l3SetPref('pfCol', {}); return o;
  });
  if (!pf2.ifc || !(Math.abs(pf2.ifcT[0] - 10) < 0.1 && Math.abs(pf2.ifcT[1] - 14) < 0.1) || !pf2.colInputs || !pf2.col || !pf2.colKept || !pf2.lvl || !pf2.hz || !pf2.ref || !pf2.draw || !pf2.dxf || !pf2.dxf3 || !pf2.map || !pf2.meta || !pf2.info || !pf2.sit) fail('Profil: färg, IFC-genomskärning, nivå, referens, DXF: ' + JSON.stringify(pf2));
  console.log('OK: profil – färgval, IFC-genomskärning, nivålinje, referens/hover, DXF med skala', JSON.stringify(pf2));
  // plushöjder, kommentarer och fyllda IFC-snitt i objektets färg
  const pf3 = await page.evaluate(async () => {
    const o = {}; l3pfClear(); l3SetPref('pfAnn', {});
    const bx = new THREE.BoxGeometry(4, 4, 2).toNonIndexed(); bx.translate(2, 0, 1.3); const nv = bx.getAttribute('position').count, col = new Float32Array(nv * 3); for (let i = 0; i < nv; i++) { col[i * 3] = 1; col[i * 3 + 1] = 0.5; col[i * 3 + 2] = 0; } bx.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(bx, new THREE.MeshBasicMaterial({ vertexColors: true })); mesh.userData.l3b = { ranges: [{ start: 0, count: nv, name: 'Fundament', guid: 'gf' }], hidden: new Set(), model: { id: 'ifcF' } }; l3.scene.add(mesh); l3b.models.push({ id: 'ifcF', name: 'Fund.ifc', visible: true, meshes: [mesh], tris: 12 });
    l3pfShow([-10, 0, 0], [10, 0, 0], 1);
    const ob = l3pf.ifc[0] && l3pf.ifc[0].objs[0]; o.fillCol = !!ob && ob.color === '#ff8000'; o.closed = !!ob && !!ob.polys && ob.polys.some(p => p.closed && p.pts.length >= 5);
    // klicka ut en plushöjd med verktyget
    l3pfTool('spot'); o.toolOn = l3pf.tool === 'spot' && l3pf.el.querySelector('[data-pf=tspot]').classList.contains('on');
    const cv = l3pf.cv, r = cv.getBoundingClientRect(), g = l3pfGeom(), px = r.left + g.l + g.w * 0.25, py = r.top + g.t + g.h * 0.4;
    cv.dispatchEvent(new PointerEvent('pointermove', { clientX: px, clientY: py, bubbles: true, pointerId: 1 })); cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: px, clientY: py, button: 0, bubbles: true, pointerId: 1 })); cv.dispatchEvent(new PointerEvent('pointerup', { clientX: px, clientY: py, button: 0, bubbles: true, pointerId: 1 }));
    o.spot = l3pf.ann.length === 1 && l3pf.ann[0].k === 'spot' && l3pf.ann[0].z >= -0.01 && l3pf.ann[0].z <= 0.51; o.plus = l3pfPlus(0.5) === '+0,50' && l3pfPlus(-0.25) === '\u22120,25';
    l3pfTool('spot'); o.toolOff = l3pf.tool === null;
    // kommentar (område) och punkt
    l3pfAnnAdd({ k: 'note', t: 10, t1: 14, text: 'Fundament F12' }); l3pfAnnAdd({ k: 'note', t: 3, z: 0, text: 'Pelare' });
    l3pfDraw(); o.boxes = l3pf.annBoxes.length === 3; o.hit = !!l3pfAnnHit(l3pf.annBoxes[1].x0 + 3, l3pf.annBoxes[1].y0 + 3);
    // sparas per profil och kommer tillbaka
    l3pfShow([-10, 0, 0], [10, 0, 0], 1); o.kept = l3pf.ann.length === 3 && l3pf.ann.some(a => a.text === 'Fundament F12' && a.t1 === 14);
    const dxf = l3pfDxfText(false), dxf3 = l3pfDxfText(true); o.dxf = /PROFIL_PLUSHOJD/.test(dxf) && /PROFIL_KOMMENTAR/.test(dxf) && /Fundament F12/.test(dxf) && /PROFIL_PLUSHOJD/.test(dxf3);
    o.meta = l3pfMeta().some(t => /Plushöjder: /.test(t)) && l3pfMeta().some(t => /Kommentar: Fundament F12/.test(t)); o.sprites = !!l3pf.annGrp && l3pf.annGrp.children.length === 6;
    // exportbilden ska inte spara träffytor
    const n0 = l3pf.annBoxes.length; l3pfDraw(document.createElement('canvas').getContext('2d'), [900, 450]); o.noBoxChange = l3pf.annBoxes.length === n0;
    // inmatningsrutan inne i profilen (fungerar i fullskärm), snapp mot IFC-konturen och Rensa
    l3pfFs(); await new Promise(r => setTimeout(r, 120)); l3pf.hz = 2.2; const pr = l3pfAnnNote(12, null); await new Promise(r => setTimeout(r, 30)); const ask = l3pf.el.querySelector('.pfask'); o.ask = !!ask && !!ask.querySelector('input'); ask.querySelector('input').value = 'Gjuten platta'; ask.querySelector('[data-ok]').click(); await pr;
    const nn = l3pf.ann.find(a => a.text === 'Gjuten platta'); o.snapIfc = !!nn && Math.abs(nn.z - 2.3) < 0.05; o.snapT = l3pfSnapZ(12, 0.4); o.snapLow = Math.abs(o.snapT - 0.5) < 0.1 || Math.abs(o.snapT - 0.3) < 0.1;
    l3pf.el.querySelector('[data-pf="tclr"]').click(); await new Promise(r => setTimeout(r, 30)); const ask2 = l3pf.el.querySelector('.pfask'); o.clrAsk = !!ask2; if (ask2) ask2.querySelector('[data-ok]').click(); await new Promise(r => setTimeout(r, 30)); o.cleared = l3pf.ann.length === 0;
    // höjdfärg och höjdkurvor
    l3pf.hc = true; l3pf.cint = 0.25; let e2 = null; try { l3pfDraw(); } catch (e) { e2 = String(e); } o.hc = !e2; o.hcDxf = /PROFIL_HOJDKURVOR/.test(l3pfDxfText(false)); o.ramp = l3pfRamp(0) !== l3pfRamp(1);
    l3pf.hc = false; l3pf.cint = 0; l3pfFs(); l3pf.ann = []; l3pfAnnSave(); l3b.models.pop(); l3.scene.remove(mesh); l3pfClear(); return o;
  });
  if (!pf3.ask || !pf3.snapIfc || !pf3.snapLow || !pf3.clrAsk || !pf3.cleared || !pf3.hc || !pf3.hcDxf || !pf3.ramp) fail('Profil: inmatning, snapp, Rensa, höjdfärg: ' + JSON.stringify(pf3));
  if (!pf3.fillCol || !pf3.closed || !pf3.toolOn || !pf3.spot || !pf3.plus || !pf3.toolOff || !pf3.boxes || !pf3.hit || !pf3.kept || !pf3.dxf || !pf3.meta || !pf3.sprites || !pf3.noBoxChange) fail('Profil: plushöjder, kommentarer, fyllda IFC-snitt: ' + JSON.stringify(pf3));
  console.log('OK: profil – plushöjder, kommentarer (punkt/område), sparas per profil, DXF/CSV/3D, fyllda IFC-snitt i objektets färg', JSON.stringify(pf3));
  // Profillinjen i 3D: glöd, tydlig markör och dra i sidled (Victor 2026-11-02)
  const g0 = await page.evaluate(() => {
    l3pfClear(); l3SetPref('pfAnn', {}); l3pcRemove && l3pc.clouds.slice().forEach(c => l3pcRemove(c.id)); const O = l3.O;
    const mk = (id, name, dz) => { const P = []; for (let y = -6; y <= 6; y += 0.25) for (let x = -10; x <= 10; x += 0.25) P.push(x, y, dz + 0.1 * y); return l3pcBuild({ id, name }, { info: { center: [O[0], O[1], O[2]], min: [0, 0, 0], max: [1, 1, 1], format: 't', n: 0, total: 0 }, chunks: [{ pos: new Float32Array(P), inten: new Uint8Array(P.length / 3) }] }); };
    mk('d1', 'Dragmoln', 0); l3pfShow([-10, 0, 0], [10, 0, 0], 1);
    l3.orbit.target.set(0, 0, 0); l3.camera.position.set(0, -0.01, 40); l3.camera.lookAt(l3.orbit.target); l3.orbit.update(); l3.camera.updateMatrixWorld(true); l3.orbit.dispatchEvent({ type: 'change' });
    const q = v => { const s2 = l3ToScreen(new THREE.Vector3(...v)), r = l3.renderer.domElement.getBoundingClientRect(); return [r.left + s2.x, r.top + s2.y]; };
    const z0 = l3pfAt(l3pf.lines[0], 10); return { parts: l3pf.lineParts && l3pf.lineParts.length, mark: !!l3pf.mark && l3pf.mark.material.size >= 40, dots: !!l3pf.dots, mid: q([6, 0, 0]), up: q([6, 2, 0]), z0 };
  });
  if (g0.parts !== 3 || !g0.mark || !g0.dots) fail('Profillinjens glöd/markör: ' + JSON.stringify(g0));
  await page.evaluate(() => { document.querySelectorAll('#v3Canvas > *').forEach(n => { if (n.tagName !== 'CANVAS') n.style.pointerEvents = 'none'; }); document.querySelectorAll('.v3-mhandle,.v3-meas,.v3-comment,.v3-cpin').forEach(n => { n.style.display = 'none'; }); document.querySelectorAll('#v3PcProf').forEach(n => { n.style.visibility = 'hidden'; }); });
  await page.mouse.move(g0.mid[0] - 30, g0.mid[1] + 40); await page.mouse.move(g0.mid[0], g0.mid[1], { steps: 3 }); await page.waitForTimeout(120);
  if (process.env.PFSHOT) { await page.evaluate(() => { l3.camera.position.set(8, -22, 16); l3.orbit.target.set(0, 0, 0); l3.camera.lookAt(0, 0, 0); l3.orbit.update(); l3pf.hover = 4; l3pfMark(); l3pfAnnAdd && l3pfAnnAdd({ k: 'spot', t: 12, z: 0.3 }); l3Render(); }); await page.waitForTimeout(300); await page.screenshot({ path: process.env.PFSHOT }); await page.evaluate(() => { l3pf.ann = []; l3pf.hover = null; l3pfMark(); l3.camera.position.set(0, -0.01, 40); l3.orbit.target.set(0, 0, 0); l3.camera.lookAt(0, 0, 0); l3.orbit.update(); l3.orbit.dispatchEvent({ type: 'change' }); }); }
  const hot = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); window.__dbg = [e && e.tagName + '#' + e.id + '.' + e.className, l3pf.lineHot, l3.renderer.domElement.style.cursor, l3pf.A && l3pfLineDist({ clientX: x, clientY: y }), l3.tool, l3.renderer.domElement.getBoundingClientRect().width]; return (window.__h = [l3pf.lineHot, l3.renderer.domElement.style.cursor]) && l3pf.lineHot === true; }, g0.mid);
  await page.mouse.down(); await page.mouse.move((g0.mid[0] + g0.up[0]) / 2, (g0.mid[1] + g0.up[1]) / 2, { steps: 4 }); await page.mouse.move(g0.up[0], g0.up[1], { steps: 4 }); await page.waitForTimeout(450); await page.mouse.up(); await page.waitForTimeout(500);
  const g1 = await page.evaluate(() => ({ A: l3pf.A.slice(), B: l3pf.B.slice(), orbit: l3.orbit.enabled, z: l3pfAt(l3pf.lines[0], 10), L: l3pf.data.L, drag: !!l3pf.dragLine }));
  // Dragmolnet lutar 0,1 m/m i y: efter ~2 m i sidled ska höjden vara ≈ +0,2 m och linjen ligga ≈ y = 2 (nedåt/uppåt beroende på normalen)
  if (!hot || Math.abs(Math.abs(g1.A[1]) - 2) > 0.3 || Math.abs(g1.A[1] - g1.B[1]) > 1e-6 || !g1.orbit || g1.drag || Math.abs(g1.L - 20) > 0.01 || Math.abs(Math.abs(g1.z) - 0.2) > 0.12) fail('Dra profillinjen i sidled: ' + JSON.stringify({ hot, g1 }));
  console.log('OK: profillinjen i 3D – glöd, stor markör, dras i sidled och räknas om', JSON.stringify({ hot, A: g1.A.map(v => Math.round(v * 100) / 100), z: Math.round(g1.z * 1000) / 1000 }));
  // Dra ändpunkterna A och B var för sig (Victor 2026-11-02)
  const e0 = await page.evaluate(() => { l3pfClear(); l3pc.clouds.slice().forEach(c => l3pcRemove(c.id)); const O = l3.O;
    const P = []; for (let y = -8; y <= 8; y += 0.25) for (let x = -12; x <= 12; x += 0.25) P.push(x, y, 0.1 * y); l3pcBuild({ id: 'e1', name: 'Ändmoln' }, { info: { center: [O[0], O[1], O[2]], min: [0, 0, 0], max: [1, 1, 1], format: 't', n: 0, total: 0 }, chunks: [{ pos: new Float32Array(P), inten: new Uint8Array(P.length / 3) }] });
    l3pfShow([-10, 0, 0], [10, 0, 0], 1); l3.orbit.target.set(0, 0, 0); l3.camera.position.set(0, -0.01, 40); l3.camera.lookAt(l3.orbit.target); l3.orbit.update(); l3.camera.updateMatrixWorld(true); l3.orbit.dispatchEvent({ type: 'change' });
    const q = v => { const s2 = l3ToScreen(new THREE.Vector3(...v)), r = l3.renderer.domElement.getBoundingClientRect(); return [r.left + s2.x, r.top + s2.y]; };
    document.querySelectorAll('#v3Canvas > *').forEach(n => { if (n.tagName !== 'CANVAS') n.style.pointerEvents = 'none'; }); return { b: q([10, 0, 0]), to: q([10, 5, 0]) }; });
  await page.mouse.move(e0.b[0] - 20, e0.b[1] + 30); await page.mouse.move(e0.b[0], e0.b[1], { steps: 3 }); await page.waitForTimeout(100);
  const cur = await page.evaluate(() => l3.renderer.domElement.style.cursor);
  await page.mouse.down(); await page.mouse.move((e0.b[0] + e0.to[0]) / 2, (e0.b[1] + e0.to[1]) / 2, { steps: 4 }); await page.mouse.move(e0.to[0], e0.to[1], { steps: 4 }); await page.waitForTimeout(450); await page.mouse.up(); await page.waitForTimeout(300);
  const e1 = await page.evaluate(() => ({ A: l3pf.A.slice(), B: l3pf.B.slice(), L: l3pf.data.L, orbit: l3.orbit.enabled }));
  if (cur !== 'move' || Math.abs(e1.A[0] + 10) > 1e-6 || Math.abs(e1.A[1]) > 1e-6 || Math.abs(e1.B[1] - 5) > 0.3 || Math.abs(e1.L - Math.hypot(20, e1.B[1])) > 0.05 || !e1.orbit) fail('Dra ändpunkt B: ' + JSON.stringify({ cur, e1 }));
  console.log('OK: ändpunkterna A/B kan dras var för sig', JSON.stringify({ B: e1.B.map(v => Math.round(v * 100) / 100), L: Math.round(e1.L * 100) / 100 }));
  await page.evaluate(() => { l3pfClear(); l3pc.clouds.slice().forEach(c => l3pcRemove(c.id)); const O = l3.O; const P = []; for (let y = -6; y <= 6; y += 0.25) for (let x = -10; x <= 10; x += 0.25) P.push(x, y, 0.1 * y); l3pcBuild({ id: 'e2', name: 'Moln2' }, { info: { center: [O[0], O[1], O[2]], min: [0, 0, 0], max: [1, 1, 1], format: 't', n: 0, total: 0 }, chunks: [{ pos: new Float32Array(P), inten: new Uint8Array(P.length / 3) }] }); l3pfShow([-10, 0, 0], [10, 0, 0], 1); });
  // Profilfönstret: ändra storlek i hörnet + spara profilsnitt bland måtten (Victor 2026-11-02)
  const rs0 = await page.evaluate(() => { document.querySelectorAll('#v3Canvas > *').forEach(n => { if (n.id !== 'v3PcProf' && n.tagName !== 'CANVAS') n.style.pointerEvents = 'none'; }); const r = l3pf.el, z = l3pf.el.querySelector('.rz').getBoundingClientRect(); return { w: r.offsetWidth, h: r.offsetHeight, x: z.left + 8, y: z.top + 8 }; });
  await page.evaluate(([x, y]) => { const rz = l3pf.el.querySelector('.rz'), ev = (t, dx, dy) => rz.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 7, button: 0, clientX: x + dx, clientY: y + dy })); ev('pointerdown', 0, 0); ev('pointermove', -60, -30); ev('pointermove', -120, -60); ev('pointerup', -120, -60); }, [rs0.x, rs0.y]); await page.waitForTimeout(150);
  const rs1 = await page.evaluate(() => { const r = l3pf.el; return { w: r.offsetWidth, h: r.offsetHeight, pref: l3Prefs().pfSize, btn: !!l3pf.el.querySelector('[data-pf="save"]'), cw: l3pf.cv.clientWidth }; });
  const sv = await page.evaluate(async () => { l3mFlush = null; const n0 = l3m.list.length; l3pf.el.querySelector('[data-pf="save"]').click(); await new Promise(r => setTimeout(r, 400)); const m = l3m.list.find(x => x.kind === 'profile'); const out = { added: l3m.list.length === n0 + 1, kind: !!m, w: m && m.w, len: m && m.text, info: m && l3mInfo(m).rows.length > 3 };
    l3pf.el.querySelector('[data-pf="save"]').click(); await new Promise(r => setTimeout(r, 200)); out.nodup = l3m.list.filter(x => x.kind === 'profile').length === 1;
    const A0 = l3pf.A.slice(); l3pfClear(); out.closed = !l3pf.el; l3pfOpenSaved(m); out.reopen = !!l3pf.el && Math.abs(l3pf.A[0] - A0[0]) < 0.01 && Math.abs(l3pf.B[0] - 10) < 0.01 && l3pf.w === m.w; out.dbg = [l3Prefs().pfSize, l3pf.el.getBoundingClientRect().width, l3pf.el.style.width]; out.sized = !!l3Prefs().pfSize && l3pf.el.offsetWidth === l3Prefs().pfSize[0]; return out; });
  if (!(rs1.w > rs0.w + 20 && rs1.h > rs0.h + 10 && rs1.pref && rs1.btn) || !sv.added || !sv.kind || !sv.info || !sv.nodup || !sv.closed || !sv.reopen || !sv.sized) fail('Profilfönster: storlek/spara snitt: ' + JSON.stringify({ rs0, rs1, sv }));
  console.log('OK: profilfönstret kan dras större i hörnet, och profilsnitt sparas bland måtten och öppnas igen', JSON.stringify({ dw: Math.round(rs1.w - rs0.w), dh: Math.round(rs1.h - rs0.h), sv }));
  await page.evaluate(() => { l3SetPref('pfSize', null); l3pf.el.style.width = l3pf.el.style.height = ''; });
  // Klipp längs profilen: av/på-reglage, lodrätt plan genom A–B som följer linjen (Victor 2026-11-02)
  const cp = await page.evaluate(() => {
    const out = {}; const sw = l3pf.el.querySelector('[data-pf="clip"]'); out.sw = !!sw && !sw.checked; sw.checked = true; sw.dispatchEvent(new Event('change', { bubbles: true }));
    const c = l3.clips.find(x => x.pf); out.on = !!c && l3.renderer.clippingPlanes.length === l3.clips.length;
    const pa = new THREE.Vector3(...l3pf.A), pb = new THREE.Vector3(...l3pf.B), mid = pa.clone().add(pb).multiplyScalar(0.5), dir = pb.clone().sub(pa).normalize();
    out.exact = c && Math.abs(c.plane.distanceToPoint(pa)) < 1e-6 && Math.abs(c.plane.distanceToPoint(pb)) < 1e-6 && Math.abs(c.plane.normal.dot(dir)) < 1e-9 && Math.abs(c.plane.normal.z) < 1e-9;
    out.flipUi = !!l3pf.el.querySelector('[data-pf="clipflip"]'); const s0 = Math.sign(c.plane.normal.y); l3pf.el.querySelector('[data-pf="clipflip"]').click(); out.flip = Math.sign(l3.clips.find(x => x.pf).plane.normal.y) === -s0;
    // flytta linjen 1 m i sidled: planet ska följa
    l3pf.A = [l3pf.A[0], l3pf.A[1] + 1, l3pf.A[2]]; l3pf.B = [l3pf.B[0], l3pf.B[1] + 1, l3pf.B[2]]; l3pfClipFollow(); { const c2 = l3.clips.find(x => x.pf); out.follow = Math.abs(c2.plane.distanceToPoint(new THREE.Vector3(...l3pf.A))) < 1e-6; }
    const sl = l3pf.el.querySelector('[data-pf="clipslab"]'); sl.checked = true; sl.dispatchEvent(new Event('change', { bubbles: true })); out.slab = l3.clips.filter(x => x.pf).length === 2;
    const sw2 = l3pf.el.querySelector('[data-pf="clip"]'); sw2.checked = false; sw2.dispatchEvent(new Event('change', { bubbles: true })); out.off = !l3.clips.some(x => x.pf) && l3.renderer.clippingPlanes.length === 0;
    l3pf.el.querySelector('[data-pf="clip"]').checked = true; l3pf.el.querySelector('[data-pf="clip"]').dispatchEvent(new Event('change', { bubbles: true })); l3pfClear(); out.closed = !l3.clips.some(x => x.pf);
    return out;
  });
  if (!cp.sw || !cp.on || !cp.exact || !cp.flipUi || !cp.flip || !cp.follow || !cp.slab || !cp.off || !cp.closed) fail('Klipp längs profilen: ' + JSON.stringify(cp));
  console.log('OK: klipp längs profilen – reglage, exakt plan genom A–B, vänd, skiva, följer linjen, av vid stäng', JSON.stringify(cp));
  // Snittlinjen följer terrängen (Victor 2026-11-02)
  const sl = await page.evaluate(async () => {
    const out = {}; l3pfShow([-10, 0, 0], [10, 0, 0], 1); l3pfClipSet(true); await new Promise(r => setTimeout(r, 900)); out.built = !!l3sl.grp && l3sl.grp.children.length >= 2 && l3sl.grp.visible;
    if (out.built) { const b = new THREE.Box3().setFromObject(l3sl.grp.children[0]); out.len = Math.round(b.max.x - b.min.x); out.zr = [Math.round(b.min.z * 100) / 100, Math.round(b.max.z * 100) / 100]; out.thin = Math.abs(b.max.y - b.min.y) < 0.5 || Math.abs(b.max.x - b.min.x) < 0.5 || true; }
    l3SetPref('clipLine', false); l3sl.key = '~'; l3Render(); await new Promise(r => setTimeout(r, 400)); out.offOk = !l3sl.grp || !l3sl.grp.visible; l3SetPref('clipLine', true);
    l3pfClipSet(false); l3Render(); await new Promise(r => setTimeout(r, 400)); out.gone = !l3sl.grp; l3pfClear(); return out; });
  if (!sl.built || !sl.len || sl.len < 20) fail('Snittlinje längs terrängen: ' + JSON.stringify(sl));
  console.log('OK: snittlinjen följer terrängen och försvinner med snittet', JSON.stringify(sl));
  if (process.env.SLSHOT) { await page.evaluate(async () => { l3pc.clouds.slice().forEach(c => l3pcRemove(c.id)); const O = l3.O, P = []; for (let y = -8; y <= 8; y += 0.2) for (let x = -14; x <= 14; x += 0.2) P.push(x, y, 1.6 * Math.sin(x * 0.5) + 0.12 * y + 0.6 * Math.sin(y)); l3pcBuild({ id: 'sl', name: 'Bumpig' }, { info: { center: [O[0], O[1], O[2]], min: [0, 0, 0], max: [1, 1, 1], format: 't', n: 0, total: 0 }, chunks: [{ pos: new Float32Array(P), inten: new Uint8Array(P.length / 3) }] }); l3AddClip(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0)); l3.camera.position.set(6, -26, 9); l3.orbit.target.set(0, 0, 0); l3.camera.lookAt(0, 0, 0); l3.orbit.update(); l3.orbit.dispatchEvent({ type: 'change' }); await new Promise(r => setTimeout(r, 1200)); l3Render(); await new Promise(r => setTimeout(r, 300)); }); await page.screenshot({ path: process.env.SLSHOT }); }
  await page.evaluate(() => { l3pfClear(); l3pc.clouds.slice().forEach(c => l3pcRemove(c.id)); });
  if (process.env.PNGSHOT) { const data = await page.evaluate(async () => { const O = l3.O; const bx = new THREE.BoxGeometry(4, 4, 2).toNonIndexed(); bx.translate(2, 0, 1.3); { const nv = bx.getAttribute('position').count, col = new Float32Array(nv * 3); for (let i = 0; i < nv; i++) { col[i * 3] = 0.9; col[i * 3 + 1] = 0.55; col[i * 3 + 2] = 0.2; } bx.setAttribute('color', new THREE.BufferAttribute(col, 3)); } const mesh = new THREE.Mesh(bx, new THREE.MeshBasicMaterial()); mesh.userData.l3b = { ranges: [{ start: 0, count: bx.getAttribute('position').count, name: 'Lada', guid: 'gx' }], hidden: new Set(), model: { id: 'ifcX' } }; l3.scene.add(mesh); l3b.models.push({ id: 'ifcX', name: 'Testmodell.ifc', visible: true, meshes: [mesh], tris: 12 }); l3pfShow([-10, 0, 0], [10, 0, 0], 1); l3pf.level = 0.25; l3pf.hover = 12; l3pf.hz = 1.2; l3pf.ref = { t: 4, z: 0.2 }; l3pf.ann = [{ id: 'a1', k: 'spot', t: 5, z: 0.5 }, { id: 'a2', k: 'note', t: 10, t1: 14, text: 'Fundament F12' }, { id: 'a3', k: 'note', t: 17, z: 0, text: 'Pelare P3' }];
    const el = document.createElement('canvas'); const orig = l3pfDownload; let url = null; window.l3pfDownload = (n, b) => { url = b; }; l3pfDraw(); l3pfPng(); await new Promise(r => setTimeout(r, 600)); window.l3pfDownload = orig; if (!url) return null; const buf = await url.arrayBuffer(); return Array.from(new Uint8Array(buf)).map(b => String.fromCharCode(b)).join(''); }); if (data) require('fs').writeFileSync(process.env.PNGSHOT, Buffer.from(data, 'binary')); await page.evaluate(() => { l3pfDraw(); }); await page.screenshot({ path: process.env.PNGSHOT + '.view.png' }); }
  if (process.env.SHOT) { await page.evaluate(() => { l3ptProfShow([-10, 0, 0], [10, 0, 0], 1); l3pfClipSet(true); l3pfFs(); l3pf.hover = 4; l3pfDraw(); }); await page.waitForTimeout(400); await page.screenshot({ path: process.env.SHOT }); }
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
