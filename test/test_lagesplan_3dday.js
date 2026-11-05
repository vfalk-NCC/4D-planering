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

  // 7) 3D av/på och att allt sparas i projektet och läses tillbaka
  await page.selectOption('#dyShow', 'day'); await page.evaluate(() => { l3SetPref('dayShow3d', false); l3dayBuild(); });
  if ((await page.evaluate(() => l3day.group.visible)) !== false) fail('3D av ska dölja dagsplaneringen');
  await page.evaluate(() => { l3SetPref('dayShow3d', true); l3dayBuild(); });
  await page.waitForTimeout(900);
  const saved = JSON.parse(gh.get('projects/p1/plan_dayplan.json') || '[]');
  if (saved.length !== 6 || saved.some(x => x.plan !== 'A' || !x.pts.length)) fail('Dagsplaneringen ska sparas i projektet: ' + JSON.stringify(saved.map(x => [x.kind, x.day])));
  const back = await page.evaluate(async () => { l3day.items = []; l3day.loaded = false; await l3dayLoad(); return { n: l3day.items.length, v: l3dayList().length }; });
  if (back.n !== 6) fail('Sparat ska läsas tillbaka: ' + JSON.stringify(back));
  // 8) Rensa dagen, stäng raden
  await page.evaluate(() => { window.confirm = () => true; }); await page.click('#dyClr'); await page.waitForTimeout(100); s = await st(); if (s.n !== 3) fail('Rensa ska ta bort dagens markeringar: ' + JSON.stringify(s));
  await page.evaluate(() => l3spClose()); if (await page.evaluate(() => !!document.getElementById('spDay'))) fail('Raden ska försvinna när minimapen stängs');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3dday');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
