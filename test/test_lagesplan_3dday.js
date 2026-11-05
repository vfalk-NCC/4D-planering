// Dagsplanering i minimapen (Victor 2026-11-05): frihand, områden och markörer med text som också syns i 3D, dag/kategori/personer, kopiera från igår, lista, text, spara och ångra.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9032;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ scale: s, width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
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
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
  });
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3dayLoad === 'function', null, { timeout: 15000 });
  await page.evaluate(async () => { l3spSync(); await l3spOpen(); l3sp.follow = false; l3spFit(); });
  // Dagsplan-knappen i Verktyg-menyn öppnar verktygsraden
  await page.click('#v3Sp [data-dd="t"]'); await page.click('#spDayBtn'); await page.waitForSelector('#spDay');
  const box = await page.evaluate(() => { const b = l3sp.cv.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
  const at = (fx, fy) => [box.x + box.w * fx, box.y + box.h * fy];
  const drag = async pts => { const [x0, y0] = at(...pts[0]); await page.mouse.move(x0, y0); await page.mouse.down(); for (const p of pts.slice(1)) { const [x, y] = at(...p); await page.mouse.move(x, y, { steps: 4 }); } await page.mouse.up(); await page.waitForTimeout(80); };
  const st = () => page.evaluate(() => ({ n: l3day.items.length, kinds: l3day.items.map(i => i.kind), labels: l3day.labels.size, g3: l3day.group ? l3day.group.children.length : 0, vis: l3dayList().length }));

  // 1) Penna: frihand blir en förenklad linje i modellens koordinater och ett band + skylt i 3D
  await page.fill('#dyText', 'Gjuter platta B'); await page.fill('#dyCrew', '4'); await page.selectOption('#dyCat', 'arbete');
  await page.click('[data-dytool="pen"]');
  const wave = Array.from({ length: 24 }, (_, i) => [0.2 + i * 0.025, 0.45 + Math.sin(i / 3) * 0.08]);
  await drag(wave);
  let s = await st();
  const pen = await page.evaluate(() => l3day.items[0]);
  if (s.n !== 1 || pen.kind !== 'pen' || pen.pts.length < 3 || pen.pts.length > 60 || pen.text !== 'Gjuter platta B' || pen.crew !== 4 || pen.cat !== 'arbete' || !/^\d{4}-\d\d-\d\d$/.test(pen.day) || pen.pts[0][0] < 6512000) fail('Penna: ' + JSON.stringify({ s, pen }));
  if (s.labels !== 1 || s.g3 < 1) fail('Linjen ska ligga i 3D med skylt: ' + JSON.stringify(s));
  const lab = await page.evaluate(() => document.querySelector('.v3-day').textContent);
  if (!/Gjuter platta B/.test(lab) || !/4 pers/.test(lab)) fail('Skylten ska visa text och personer: ' + lab);
  // 2) Område: slutet och med yta i 3D
  await page.fill('#dyText', 'Schakt vid slänten'); await page.selectOption('#dyCat', 'schakt'); await page.click('[data-dytool="area"]');
  await drag([[0.55, 0.2], [0.8, 0.2], [0.82, 0.35], [0.78, 0.5], [0.58, 0.5], [0.52, 0.35], [0.55, 0.21]]);
  s = await st(); if (s.n !== 2 || s.kinds[1] !== 'area') fail('Område: ' + JSON.stringify(s));
  const ar = await page.evaluate(() => ({ m: l3day.group.children.filter(o => o.isMesh).length, area: l3dayArea(l3day.items[1].pts) }));
  if (ar.m < 3 || !(ar.area > 50)) fail('Området ska ha band och yta i 3D: ' + JSON.stringify(ar));
  // 3) Markör med text
  await page.fill('#dyText', 'Lastbil 07:00'); await page.selectOption('#dyCat', 'transport'); await page.click('[data-dytool="pin"]');
  { const [x, y] = at(0.3, 0.75); await page.mouse.click(x, y); await page.waitForTimeout(80); }
  s = await st(); if (s.n !== 3 || s.kinds[2] !== 'pin' || s.labels !== 3) fail('Markör: ' + JSON.stringify(s));
  const pin3 = await page.evaluate(() => { const o = l3.O, it = l3day.items[2]; return { lines: l3day.group.children.filter(c => c.isLine).length, labelText: [...l3day.labels.values()].map(e => e.textContent).join('|'), x: it.pts[0][0] > 6512000 }; });
  if (pin3.lines < 1 || !/Lastbil 07:00/.test(pin3.labelText) || !pin3.x) fail('Markören ska vara en stolpe med skylt: ' + JSON.stringify(pin3));
  // 4) Skyltarna följer kameran (placeras på skärmen)
  const place = await page.evaluate(() => { l3dayPlace(); return [...l3day.labels.values()].every(e => e.style.left && e.style.top); });
  if (!place) fail('Skyltarna ska placeras på skärmen');
  if (process.env.SLSHOT) { await page.evaluate(() => { l3.camera.position.set(l3.camera.position.x, l3.camera.position.y - 40, 70); l3.orbit.update && l3.orbit.update(); l3Render(); }); await page.waitForTimeout(400); await page.screenshot({ path: process.env.SLSHOT }); }
  console.log('OK: penna, område och markör ritas på minimapen och syns i 3D med skyltar', JSON.stringify(s));

  // 5) Välj + ändra text + ta bort + ångra
  await page.click('[data-dytool="sel"]');
  { const [x, y] = at(0.3, 0.75); await page.mouse.click(x, y); await page.waitForTimeout(80); }
  if ((await page.evaluate(() => l3day.sel)) !== (await page.evaluate(() => l3day.items[2].id))) fail('Välj ska markera markören');
  await page.evaluate(() => { window.prompt = () => 'Lastbil 08:30'; l3dayEdit(l3day.sel); });
  if (!(await page.evaluate(() => /08:30/.test([...l3day.labels.values()].map(e => e.textContent).join())))) fail('Texten ska kunna ändras');
  await page.keyboard.press('Delete'); await page.waitForTimeout(80);
  s = await st(); if (s.n !== 2) fail('Delete ska ta bort den valda markeringen: ' + JSON.stringify(s));
  await page.click('#dyUndo'); await page.waitForTimeout(80); s = await st(); if (s.n !== 3) fail('Ångra ska ta tillbaka markeringen: ' + JSON.stringify(s));
  // flytta en markering (Välj + dra) och ↺ Läge
  const b0 = await page.evaluate(() => { const it = l3day.items[2]; return it.pts[0].slice(); });
  { const [x, y] = at(0.3, 0.75); await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 60, y - 30, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(100); }
  const b1 = await page.evaluate(() => { const it = l3day.items[2]; return { p: it.pts[0].slice(), orig: it.orig && it.orig[0].slice(), dis: document.getElementById('dyReset').disabled }; });
  if (Math.hypot(b1.p[0] - b0[0], b1.p[1] - b0[1]) < 3 || !b1.orig || b1.orig[0] !== b0[0] || b1.dis) fail('Välj + dra ska flytta markeringen och spara originalläget: ' + JSON.stringify({ b0, b1 }));
  await page.click('#dyReset'); await page.waitForTimeout(100);
  const b2 = await page.evaluate(() => { const it = l3day.items[2]; return { p: it.pts[0].slice(), orig: it.orig, dis: document.getElementById('dyReset').disabled }; });
  if (b2.p[0] !== b0[0] || b2.p[1] !== b0[1] || b2.orig || !b2.dis) fail('↺ Läge ska lägga tillbaka markeringen: ' + JSON.stringify({ b0, b2 }));
  console.log('OK: flytta markering med Välj + dra, ↺ Läge lägger tillbaka den');
  console.log('OK: välj, ändra text, Delete och ångra');

  // 6) Dagar: filter, kopiera från igår, alla dagar, lista, text
  const today = await page.evaluate(() => l3day.day);
  await page.click('#dyPrev'); await page.waitForTimeout(60);
  s = await st(); if (s.vis !== 0 || s.labels !== 0) fail('Igår ska vara tom: ' + JSON.stringify(s));
  await page.click('#dyNext'); s = await st(); if (s.vis !== 3) fail('Idag ska ha tre markeringar');
  await page.click('#dyNext'); await page.click('#dyCopyPrev'); await page.waitForTimeout(80);
  s = await st(); if (s.n !== 6 || s.vis !== 3) fail('Kopiera från föregående dag: ' + JSON.stringify(s));
  await page.selectOption('#dyShow', 'all'); s = await st(); if (s.vis !== 6) fail('Alla dagar ska visa sex: ' + JSON.stringify(s));
  await page.click('#dyList'); const rows = await page.evaluate(() => document.querySelectorAll('#spDayList .r').length); if (rows !== 6) fail('Listan ska ha sex rader, fick ' + rows); await page.click('#dyList');
  const txt = await page.evaluate(() => l3dayText());
  if (!/Dagsplanering/.test(txt) || !/Gjuter platta B \(4 pers\)/.test(txt) || !/Totalt 8 personer/.test(txt)) fail('Texten till morgonmötet: ' + txt);
  console.log('OK: dagväljare, kopiera från igår, alla dagar, lista och text', JSON.stringify({ today }));

  // 6a) Rektangel, polylinje och polygon
  await page.click('[data-dytool="rect"]');
  const n0 = await page.evaluate(() => l3day.items.length);
  await drag([[0.15, 0.2], [0.3, 0.35]]);
  const rc = await page.evaluate(() => { const it = l3day.items[l3day.items.length - 1]; return { n: l3day.items.length, kind: it.kind, pts: it.pts.length, area: l3dayArea(it.pts) }; });
  if (rc.n !== n0 + 1 || rc.kind !== 'area' || rc.pts !== 4 || !(rc.area > 20)) fail('Rektangel: ' + JSON.stringify(rc));
  await page.click('[data-dytool="poly"]');
  for (const [fx, fy] of [[0.4, 0.2], [0.5, 0.3], [0.45, 0.45], [0.6, 0.5]]) { const [x, y] = at(fx, fy); await page.mouse.click(x, y); await page.waitForTimeout(60); }
  if ((await page.evaluate(() => l3day.poly && l3day.poly.pts.length)) !== 4) fail('Polylinjen ska samla klicken som punkter');
  await page.keyboard.press('Enter'); await page.waitForTimeout(80);
  const pl = await page.evaluate(() => { const it = l3day.items[l3day.items.length - 1]; return { n: l3day.items.length, kind: it.kind, pts: it.pts.length, straight: it.straight, poly: l3day.poly }; });
  if (pl.n !== n0 + 2 || pl.kind !== 'pen' || pl.pts !== 4 || !pl.straight || pl.poly) fail('Polylinje (Enter avslutar, raka segment): ' + JSON.stringify(pl));
  await page.click('[data-dytool="polyarea"]');
  for (const [fx, fy] of [[0.7, 0.2], [0.85, 0.25], [0.8, 0.4]]) { const [x, y] = at(fx, fy); await page.mouse.click(x, y); await page.waitForTimeout(60); }
  { const [x, y] = at(0.8, 0.4); await page.mouse.dblclick(x, y); await page.waitForTimeout(100); }
  const pg = await page.evaluate(() => { const it = l3day.items[l3day.items.length - 1]; return { n: l3day.items.length, kind: it.kind, pts: it.pts.length, poly: l3day.poly }; });
  if (pg.n !== n0 + 3 || pg.kind !== 'area' || pg.pts !== 3 || pg.poly) fail('Polygon (dubbelklick sluter ytan): ' + JSON.stringify(pg));
  // Esc avbryter en pågående polylinje utan att spara
  await page.click('[data-dytool="poly"]'); { const [x, y] = at(0.2, 0.7); await page.mouse.click(x, y); } await page.keyboard.press('Escape'); await page.waitForTimeout(60);
  if ((await page.evaluate(() => l3day.items.length)) !== n0 + 3 || (await page.evaluate(() => !!l3day.poly))) fail('Esc ska avbryta polylinjen');
  // byta färg: nästa markering och en vald markering
  await page.click('[data-dytool="rect"]'); await page.evaluate(() => { const c = document.getElementById('dyColor'); c.value = '#ff00aa'; c.dispatchEvent(new Event('input', { bubbles: true })); });
  await drag([[0.6, 0.7], [0.7, 0.8]]);
  const cc = await page.evaluate(() => { l3day.sel = null; l3dayBuild(); const it = l3day.items[l3day.items.length - 1]; return { col: it.col, eff: l3dayCol(it), mesh: l3day.group.children.some(o => o.isMesh && o.material && o.material.color && Math.abs(o.material.color.getHex() - new THREE.Color('#ff00aa').getHex()) < 0x000203), cols: l3day.group.children.filter(o => o.isMesh).map(o => o.material.color.getHexString()).join(',') }; });
  if (cc.col !== '#ff00aa' || cc.eff !== '#ff00aa' || !cc.mesh) fail('Egen färg på ny markering: ' + JSON.stringify(cc));
  await page.click('#dyColorAuto'); await page.click('[data-dytool="sel"]');
  { const [x, y] = at(0.65, 0.75); await page.mouse.click(x, y); await page.waitForTimeout(80); }
  await page.evaluate(() => { const c = document.getElementById('dyColor'); c.value = '#16a34a'; c.dispatchEvent(new Event('input', { bubbles: true })); });
  const c2 = await page.evaluate(() => { const it = l3day.items.find(x => x.id === l3day.sel); return { col: it && it.col, id: l3day.sel }; });
  if (c2.col !== '#16a34a') fail('Färgen på en vald markering ska kunna bytas: ' + JSON.stringify(c2));
  await page.click('#dyColorAuto'); if ((await page.evaluate(() => l3day.items.find(x => x.id === l3day.sel).col)) !== undefined) fail('Auto ska ta bort egen färg');
  await page.evaluate(() => { l3day.color = null; });
  console.log('OK: rektangel, polylinje och polygon', JSON.stringify({ rc, pl, pg }));
  // 6b) Panorera med mushjulet (mellanknappen) utan att släppa verktyget; entreprenör och Gantt-aktivitet; skyltar som IFC till TC
  await page.click('[data-dytool="pen"]');
  const v0 = await page.evaluate(() => ({ tx: l3sp.view.tx, ty: l3sp.view.ty, n: l3day.items.length }));
  { const [x, y] = at(0.5, 0.5); await page.mouse.move(x, y); await page.mouse.down({ button: 'middle' }); await page.mouse.move(x + 80, y + 40, { steps: 6 }); await page.mouse.up({ button: 'middle' }); await page.waitForTimeout(100); }
  const v1 = await page.evaluate(() => ({ tx: l3sp.view.tx, ty: l3sp.view.ty, n: l3day.items.length, tool: l3day.tool, cur: !!l3day.cur }));
  if (Math.hypot(v1.tx - v0.tx, v1.ty - v0.ty) < 30 || v1.n !== v0.n || v1.tool !== 'pen' || v1.cur) fail('Mushjulet ska panorera utan att verktyget släpps eller något ritas: ' + JSON.stringify({ v0, v1 }));
  await page.evaluate(() => { l3sp.follow = false; l3spFit(); });
  await page.evaluate(() => { siteItems.push({ id: 'ue-hav', type: 'ue', name: 'Havator', short: 'HAV', color: '#0e7490' }); const d = l3day.day; items = [{ id: 'g1', object_name: 'Stödmur', activity: 'Stödmur 742C', contractor: 'Havator', area: 'NSV', start_date: d, end_date: d, status: 'pagaende', progress: 10 }]; l3dayBarSync(); });
  const opts = await page.evaluate(() => ({ ue: [...document.querySelectorAll('#dyUe option')].map(o => o.textContent), act: [...document.querySelectorAll('#dyAct option')].map(o => o.textContent) }));
  if (!opts.ue.some(t => /HAV/.test(t)) || !opts.act.some(t => /Stödmur 742C/.test(t))) fail('Entreprenörer och dagens aktiviteter ska kunna väljas: ' + JSON.stringify(opts));
  await page.selectOption('#dyAct', '0'); await page.waitForTimeout(50);
  const fill = await page.evaluate(() => ({ text: document.getElementById('dyText').value, ue: document.getElementById('dyUe').value }));
  if (fill.text !== 'Stödmur 742C' || fill.ue !== 'ue-hav') fail('Aktiviteten ska fylla i text och entreprenör: ' + JSON.stringify(fill));
  await page.click('[data-dytool="pin"]'); await page.fill('#dyCrew', '6');
  { const [x, y] = at(0.7, 0.6); await page.mouse.click(x, y); await page.waitForTimeout(100); }
  const sgn = await page.evaluate(() => { const it = l3day.items[l3day.items.length - 1]; return { ue: it.ue, ueShort: it.ueShort, ueCol: it.ueCol, act: it.act, crew: it.crew, label: [...l3day.labels.values()].pop().textContent }; });
  if (sgn.ueShort !== 'HAV' || sgn.ueCol !== '#0e7490' || sgn.act !== 'Stödmur 742C' || sgn.crew !== 6 || !/HAV/.test(sgn.label) || !/Stödmur 742C/.test(sgn.label)) fail('Skylten ska bära entreprenör, aktivitet och personer: ' + JSON.stringify(sgn));
  const ifc = await page.evaluate(async () => {
    const calls = []; Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    const a0 = askOpener; askOpener = async (type, extra) => { calls.push([type, extra.folder, extra.files[0].name]); window.__ifcText = await extra.files[0].text(); return { folder: extra.folder }; };
    const r = await l3dayExportIfc(); askOpener = a0;
    return { calls, n: r && r.n, text: window.__ifcText || '' };
  });
  const T = ifc.text;
  if (ifc.calls.length !== 1 || ifc.calls[0][0] !== 'tcUpload' || ifc.calls[0][1] !== 'Lägesplan' || !/^Dagsplan \d{4}-\d\d-\d\d/.test(ifc.calls[0][2]) || !/\.ifc$/.test(ifc.calls[0][2])) fail('IFC ska sparas i Trimble Connect, en fil per dag: ' + JSON.stringify(ifc.calls));
  if (ifc.n < 4 || (T.match(/4D-dagsplan'/g) || []).length < 4 || !/IFCBUILDINGELEMENTPROXY/.test(T) || !/742C/.test(T) || !/HAV/.test(T) || !/Entrepren/.test(T) || !/IFCTRIANGULATEDFACESET/.test(T) || !/IFCRECTANGLEPROFILEDEF/.test(T)) fail('IFC-filen ska ha skyltar med info: ' + JSON.stringify({ n: ifc.n, len: T.length, proxies: (T.match(/4D-dagsplan'/g) || []).length, bep: /IFCBUILDINGELEMENTPROXY/.test(T), act: /742C/.test(T), hav: /HAV/.test(T), ent: /Entrepren/.test(T), tri: /IFCTRIANGULATEDFACESET/.test(T), rect: /IFCRECTANGLEPROFILEDEF/.test(T), sample: (T.match(/IFCBUILDINGELEMENTPROXY[^;]{0,160}/) || [''])[0] }));
  if (process.env.PROF) { const L = T.split('\n').filter(l => /IFCCARTESIANPOINTLIST3D/.test(l)).map(l => l.length).sort((a, b) => b - a); console.log('PROF', T.length, L.length, L.slice(0, 8).join(','), L.reduce((a, b) => a + b, 0)); }
  console.log('OK: mushjulet panorerar, entreprenör och Gantt-aktivitet väljs, skyltar med info och IFC till Trimble Connect', JSON.stringify({ file: ifc.calls[0][2], n: ifc.n, kB: Math.round(T.length / 1000) }));
  // 6c) Lista → markera en rad → skriv in info och redigera
  await page.evaluate(() => { l3day.sel = null; }); await page.click('#dyList'); await page.waitForSelector('#spDayList .r');
  const lastId = await page.evaluate(() => { const rows = [...document.querySelectorAll('#spDayList .r[data-dyid]')]; return rows[rows.length - 1].dataset.dyid; });
  await page.click(`#spDayList .r[data-dyid="${lastId}"]`); await page.waitForSelector('#spDayList .dyed');
  await page.fill('#spDayList [data-f="text"]', 'Gjutning platta C'); await page.press('#spDayList [data-f="text"]', 'Enter');
  await page.fill('#spDayList [data-f="info"]', 'Betongpump från norr. Spärra vägen 06:30–09:00. Kontakt: Anna 070-123 45 67'); await page.evaluate(() => document.querySelector('#spDayList [data-f="info"]').blur());
  await page.fill('#spDayList [data-f="crew"]', '9'); await page.press('#spDayList [data-f="crew"]', 'Enter');
  await page.fill('#spDayList [data-f="time"]', '06:30–14:00'); await page.press('#spDayList [data-f="time"]', 'Enter');
  await page.selectOption('#spDayList [data-f="cat"]', 'spar'); await page.selectOption('#spDayList [data-f="ue"]', 'ue-hav');
  await page.evaluate(() => { const c = document.querySelector('#spDayList [data-f="col"]'); c.value = '#7c3aed'; c.dispatchEvent(new Event('change', { bubbles: true })); });
  const ed = await page.evaluate(id => { const it = l3day.items.find(x => x.id === id); return { text: it.text, info: it.info, crew: it.crew, time: it.time, cat: it.cat, ue: it.ueShort, col: it.col, label: l3day.labels.get(id) && l3day.labels.get(id).textContent, still: !!document.querySelector('#spDayList .dyed') }; }, lastId);
  if (ed.text !== 'Gjutning platta C' || !/Betongpump/.test(ed.info) || ed.crew !== 9 || ed.time !== '06:30–14:00' || ed.cat !== 'spar' || ed.ue !== 'HAV' || ed.col !== '#7c3aed' || !/Gjutning platta C/.test(ed.label) || !/Betongpump/.test(ed.label) || !ed.still) fail('Redigera markering i listan: ' + JSON.stringify(ed));
  await page.click('[data-dyauto]'); if ((await page.evaluate(id => l3day.items.find(x => x.id === id).col, lastId)) !== undefined) fail('Auto i listan ska ta bort egen färg');
  await page.evaluate(() => l3Undo()); await page.waitForTimeout(80);
  if ((await page.evaluate(id => l3day.items.find(x => x.id === id).col, lastId)) !== '#7c3aed') fail('Ångra ska ta tillbaka färgen');
  const txt2 = await page.evaluate(() => l3dayText()); if (!/Gjutning platta C \(9 pers\) 06:30–14:00/.test(txt2) || !/Betongpump/.test(txt2)) fail('Info och tid ska med i texten: ' + txt2);
  const ifc2 = await page.evaluate(() => { const r = l3dayIfcBuild(l3dayList()); return { info: /Betongpump/.test(r.text) || /Betongp/.test(r.text), prop: /'Info'/.test(r.text) }; }); if (!ifc2.prop) fail('Info ska med som egenskap i IFC: ' + JSON.stringify(ifc2));
  if (process.env.SLSHOT2) await page.screenshot({ path: process.env.SLSHOT2 });
  await page.click('#dyList');
  console.log('OK: markera en rad i listan och skriv in/redigera info, personer, tid, kategori, entreprenör och färg (med ångra)');
  // 7) 3D av/på och att allt sparas i projektet och läses tillbaka
  await page.selectOption('#dyShow', 'day'); await page.evaluate(() => { l3SetPref('dayShow3d', false); l3dayBuild(); });
  if ((await page.evaluate(() => l3day.group.visible)) !== false) fail('3D av ska dölja dagsplaneringen');
  await page.evaluate(() => { l3SetPref('dayShow3d', true); l3dayBuild(); });
  await page.waitForTimeout(900);
  const saved = JSON.parse(gh.get('projects/p1/plan_dayplan.json') || '[]');
  const nAll = await page.evaluate(() => l3day.items.length); if (saved.length !== nAll || saved.some(x => x.plan !== 'A' || !x.pts.length)) fail('Dagsplaneringen ska sparas i projektet: ' + JSON.stringify(saved.map(x => [x.kind, x.day])));
  const back = await page.evaluate(async () => { l3day.items = []; l3day.loaded = false; await l3dayLoad(); return { n: l3day.items.length, v: l3dayList().length }; });
  if (back.n !== nAll) fail('Sparat ska läsas tillbaka: ' + JSON.stringify(back));
  // 8) Rensa dagen, stäng raden
  await page.evaluate(() => { window.confirm = () => true; }); await page.click('#dyClr'); await page.waitForTimeout(100); s = await st(); if (s.n !== 3) fail('Rensa ska ta bort dagens markeringar: ' + JSON.stringify(s));
  await page.evaluate(() => l3spClose()); if (await page.evaluate(() => !!document.getElementById('spDay'))) fail('Raden ska försvinna när minimapen stängs');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3dday');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
