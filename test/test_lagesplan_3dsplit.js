const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9088;
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
  const r = await page.evaluate(async () => {
    const out = {}; l3spSync(); out.btn = !!document.getElementById('v3SpBtn');
    await l3spOpen(); out.open = l3sp.open; out.img = !!l3sp.img; out.panel = !!document.getElementById('v3Sp');
    // kamerans punkt ska hamna i bild: modell → ritning → modell går runt
    const x = plan.calib.model[0][0] + 20, y = plan.calib.model[0][1] + 10, [sx, sy] = l3spToScr(x, y), [bx, by] = l3spFromScr(sx, sy);
    out.round = Math.hypot(bx - x, by - y);
    l3spGoTo(x, y); out.pin = !!l3sp.pin && !!l3sp.pinObj; await new Promise(r => setTimeout(r, 700));
    out.tx = l3.orbit.target.x + l3.O[0] - x; out.ty = l3.orbit.target.y + l3.O[1] - y;
    l3spDraw(); out.drew = true; l3spPinClear(); out.cleared = !l3sp.pin && !l3sp.pinObj;
    return out;
  });
  if (!r.btn || !r.open || !r.img || !r.panel) fail('Ritningspanelen ska öppnas: ' + JSON.stringify(r));
  if (r.round > 0.01) fail('Ritning ↔ modell ska gå runt: ' + JSON.stringify(r));
  if (!r.pin || Math.hypot(r.tx, r.ty) > 0.6) fail('Tryck på ritningen ska flytta 3D-målet och sätta nål: ' + JSON.stringify(r));
  if (!r.cleared) fail('Nålen ska kunna tas bort: ' + JSON.stringify(r));
  // riktig musklick på ritningen
  const click = await page.evaluate(() => { const b = l3sp.cv.getBoundingClientRect(); l3sp.follow = false; l3spFit(); const sx = b.width * 0.62, sy = b.height * 0.4, [mx, my] = l3spFromScr(sx, sy); window.__exp = [mx, my]; return { x: b.left + sx, y: b.top + sy }; });
  await page.mouse.click(click.x, click.y); await page.waitForTimeout(700);
  const after = await page.evaluate(() => ({ pin: l3sp.pin, tx: l3.orbit.target.x + l3.O[0], ty: l3.orbit.target.y + l3.O[1], ex: window.__exp[0], ey: window.__exp[1] }));
  if (!after.pin || Math.hypot(after.pin[0] - after.ex, after.pin[1] - after.ey) > 0.6 || Math.hypot(after.tx - after.ex, after.ty - after.ey) > 0.6) fail('Musklick på ritningen: ' + JSON.stringify(after));
  console.log('OK: ritningspanel – kamera/ritning synkade, nål och flygning vid klick', JSON.stringify({ ...r, click: after.pin }));
  // Dra i hörnen och rubriken: ställ storlek och plats själv
  const rz = async (corner, dx, dy) => { const b = await page.evaluate(c => { const r = document.querySelector('#v3Sp .rz[data-c="' + c + '"]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, corner); await page.mouse.move(b[0], b[1]); await page.mouse.down(); await page.mouse.move(b[0] + dx / 2, b[1] + dy / 2); await page.mouse.move(b[0] + dx, b[1] + dy); await page.mouse.up(); return page.evaluate(() => { const r = document.getElementById('v3Sp').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }); };
  const r0 = await page.evaluate(() => { const r = document.getElementById('v3Sp').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const rNW = await rz('nw', -120, -90);          // upp till vänster: större
  if (!(rNW.w > r0.w + 100 && rNW.h > r0.h + 70 && Math.abs(rNW.x + rNW.w - (r0.x + r0.w)) < 3)) fail('Hörn uppe till vänster: ' + JSON.stringify({ r0, rNW }));
  const rSE = await rz('se', -80, -60);           // nere till höger: mindre, vänstra övre hörnet står kvar
  if (!(rSE.w < rNW.w - 60 && rSE.h < rNW.h - 40 && Math.abs(rSE.x - rNW.x) < 3 && Math.abs(rSE.y - rNW.y) < 3)) fail('Hörn nere till höger: ' + JSON.stringify({ rNW, rSE }));
  const rNE = await rz('ne', 40, 30); const rSW = await rz('sw', 30, 20);
  if (rNE.w < 240 || rSW.h < 190) fail('Minimistorlek: ' + JSON.stringify({ rNE, rSW }));
  const mv = await page.evaluate(() => { const r = document.querySelector('#v3Sp .h').getBoundingClientRect(); return [r.left + 8, r.top + 8]; }); await page.mouse.move(mv[0], mv[1]); await page.mouse.down(); await page.mouse.move(mv[0] - 60, mv[1] - 40); await page.mouse.up();
  const rMv = await page.evaluate(() => { const r = document.getElementById('v3Sp').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, pref: l3Prefs().spRect }; });
  if (Math.abs(rMv.x - (rSW.x - 60)) > 3 || !rMv.pref || rMv.pref.w < 200) fail('Flytta med rubriken / spara: ' + JSON.stringify({ rSW, rMv }));
  console.log('OK: ritningspanelen – storlek och plats med hörnen och rubriken', JSON.stringify({ r0, rNW, rSE, rMv }));
  // Prestanda: ritningen ritas inte om när bara kameran rör sig, och bilden finns i cache när panelen öppnas igen
  const perf = await page.evaluate(async () => {
    const out = {}; l3spClose(); const t0 = performance.now(); await l3spOpen(); out.reopenMs = performance.now() - t0; out.cached = !!(l3sp.cache && l3sp.cache.size);
    l3sp.follow = false; l3spDraw(); const bk = l3sp.baseKey; let baseDraws = 0; const bcg = l3sp.bc.getContext('2d'), od = bcg.drawImage.bind(bcg); bcg.drawImage = (...a) => { baseDraws++; return od(...a); };
    const cam = l3.camera, t1 = performance.now(); for (let i = 0; i < 60; i++) { cam.position.x += 0.4; cam.updateMatrixWorld(); l3spDraw(); } out.msPerFrame = (performance.now() - t1) / 60; out.baseDraws = baseDraws; out.sameBase = bk === l3sp.baseKey;
    out.levels = (l3sp.pyr || []).length; return out;
  });
  if (!perf.cached || perf.baseDraws !== 0 || !perf.sameBase) fail('Ritningen ska inte ritas om när bara kameran rör sig: ' + JSON.stringify(perf));
  if (perf.msPerFrame > 12) fail('Markeringarna ska ritas snabbt (< 12 ms): ' + JSON.stringify(perf));
  console.log('OK: ritningspanelen är optimerad (cache, två lager, bildpyramid)', JSON.stringify(perf));
  // Höjdkalibrering: höjden hämtas från ritningens kalibrering och kan ställas in, hämtas från 3D eller nålen, och ångras
  const zc = await page.evaluate(async () => {
    const o = {}; l3spClose(); await l3spOpen(); const inp = document.getElementById('spZ'); o.start = inp.value; o.calib0 = plan.calib.model[0][2];
    inp.value = '12,5'; inp.dispatchEvent(new Event('change')); o.z1 = plan.calib.model.map(p => p[2]); o.shown = inp.value;
    document.getElementById('spZp').click(); o.zPlus = plan.calib.model[0][2]; document.getElementById('spZm').click(); o.zMinus = plan.calib.model[0][2];
    const p0 = l3spToScr; l3sp.pin = [plan.calib.model[0][0] + 5, plan.calib.model[0][1] + 5, 7.25]; document.getElementById('spZpin').click(); o.pinZ = plan.calib.model[0][2];
    o.planMeshZ = l3.planMesh ? l3.planMesh.geometry.getAttribute('position').getZ(0) + l3.O[2] : null; await new Promise(r => setTimeout(r, 300)); o.planMeshZ2 = l3.planMesh ? l3.planMesh.geometry.getAttribute('position').getZ(0) + l3.O[2] : null;
    document.getElementById('spZundo').click(); o.undo = plan.calib.model[0][2]; o.saved = !!plan._calibSet; return o;
  });
  if (zc.z1[0] !== 12.5 || zc.z1[1] !== 12.5 || zc.zPlus !== 12.6 || zc.zMinus !== 12.5 || zc.pinZ !== 7.25) fail('Höjdkalibrering: ' + JSON.stringify(zc));
  if (zc.undo !== 12.5 || !zc.saved || Math.abs(zc.planMeshZ2 - 7.25) > 0.01) fail('Ångra höjd / ritningen i 3D följer: ' + JSON.stringify(zc));
  console.log('OK: höjdkalibrering i ritningspanelen', JSON.stringify(zc));
  // Nålen: animation (faller ner), ringar, etikett, konstant skärmstorlek; ortofoto under ritningen
  const pn = await page.evaluate(async () => {
    const o = {}; l3spClose(); await l3spOpen(); l3sp.follow = false; l3spGoTo(plan.calib.model[0][0] + 10, plan.calib.model[0][1] + 10);
    const U = l3sp.pinObj.userData.pin; o.parts = !!(U.body && U.ghost && U.rings.length === 3 && U.lab); o.z0 = U.body.position.z; await new Promise(r => setTimeout(r, 900)); o.z1 = U.body.position.z; o.lab = U.lab.material.opacity;
    await new Promise(r => setTimeout(r, 1200)); o.ringVis = U.rings.filter(r => r.visible).length; const s1 = l3sp.pinObj.scale.x; l3.camera.position.multiplyScalar(2); l3.camera.updateMatrixWorld(); l3.orbit.dispatchEvent({ type: 'change' }); o.scaleGrew = l3sp.pinObj.scale.x > s1 * 1.5;
    await new Promise(r => setTimeout(r, 3300)); o.settled = !l3sp.pinRaf; o.ringsEnd = U.rings.filter(r => r.visible).length;
    // ortofoto: stubba plattorna
    let asked = 0; window.l3mapImg = async url => { asked++; const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#556b2f'; g.fillRect(0, 0, 256, 256); return c; };
    const bc = l3sp.bc.getContext('2d'); let draws = 0; const od = bc.drawImage.bind(bc); bc.drawImage = (...a) => { draws++; return od(...a); };
    l3SetPref('spMap', 'esri'); const sel = document.getElementById('spMapSrc'); sel.value = 'esri'; sel.dispatchEvent(new Event('change')); l3spFit(); l3sp.key = ''; l3spDraw(); await new Promise(r => setTimeout(r, 400)); l3sp.key = ''; l3spDraw();
    o.asked = asked; o.tileDraws = draws; o.note = document.getElementById('spF').textContent; l3SetPref('spMap', ''); return o;
  });
  if (!pn.parts || pn.z0 < 3 || pn.z1 > 0.3 || pn.lab < 0.9 || pn.ringVis < 1 || !pn.scaleGrew || !pn.settled || pn.ringsEnd !== 1) fail('Nålen (animation, etikett, skala): ' + JSON.stringify(pn));
  if (pn.asked < 1 || pn.tileDraws < 2 || !/Esri/.test(pn.note)) fail('Ortofoto i ritningspanelen: ' + JSON.stringify(pn));
  console.log('OK: nålen animeras och ortofoto ritas under ritningen', JSON.stringify(pn));
  // Inget hopp: klick ändrar inte ritningens läge, zoom med Följ håller kameran i mitten, panorering stänger av Följ
  const st = await page.evaluate(async () => {
    const o = {}; l3spClose(); await l3spOpen(); l3spFollow(true); await new Promise(r => setTimeout(r, 200)); const v = l3sp.view, r = l3sp.cv.getBoundingClientRect();
    const v0 = { tx: v.tx, ty: v.ty, k: v.k }; l3sp.followHold = performance.now() + 3500; l3spGoTo(...l3spFromScr(r.width * 0.8, r.height * 0.3)); await new Promise(rr => setTimeout(rr, 700)); o.clickDx = Math.hypot(v.tx - v0.tx, v.ty - v0.ty);
    l3sp.followHold = 0; const [cx, cy] = l3spToScr(l3.camera.position.x + l3.O[0], l3.camera.position.y + l3.O[1]); o.camOff0 = Math.hypot(cx - r.width / 2, cy - r.height / 2);
    l3sp.cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, clientX: r.left + 10, clientY: r.top + 10, bubbles: true, cancelable: true })); const [c2x, c2y] = l3spToScr(l3.camera.position.x + l3.O[0], l3.camera.position.y + l3.O[1]); o.zoomed = v.k > v0.k; o.camAfterZoom = Math.hypot(c2x - r.width / 2, c2y - r.height / 2);
    return o;
  });
  if (st.clickDx > 20) fail('Klick i panelen ska inte hoppa bilden: ' + JSON.stringify(st));
  if (!st.zoomed || st.camAfterZoom > 4) fail('Zoom med Följ ska hålla kameran i mitten: ' + JSON.stringify(st));
  const cb = await page.evaluate(() => { const r = l3sp.cv.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.move(cb[0], cb[1]); await page.mouse.down(); await page.mouse.move(cb[0] + 30, cb[1] + 10); await page.mouse.move(cb[0] + 60, cb[1] + 20); await page.mouse.up();
  const fo = await page.evaluate(() => l3sp.follow); if (fo) fail('Panorering ska stänga av Följ');
  console.log('OK: ritningspanelen hoppar inte (klick, zoom, panorering)', JSON.stringify(st));
  if (process.env.SHOT) { await page.evaluate(async () => { l3SetPref('spMap', 'esri'); document.getElementById('spMapSrc').value = 'esri'; document.getElementById('spMapSrc').dispatchEvent(new Event('change')); const c = plan.calib.model[0]; l3spGoTo(c[0] + 25, c[1] + 12); }); await page.waitForTimeout(1300); await page.screenshot({ path: process.env.SHOT }); }
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
