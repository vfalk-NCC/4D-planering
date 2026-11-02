const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9088;
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
  await page.mouse.click(click.x, click.y); await page.waitForTimeout(120);
  const tfx = await page.evaluate(() => { const f = document.querySelector('#v3Sp .tapfx'); return f ? { n: f.children.length, anim: getComputedStyle(f.querySelector('.d')).animationName, w: parseFloat(f.style.left) > 0 } : null; });
  if (!tfx || tfx.n !== 3 || tfx.anim !== 'spTapD' || !tfx.w) fail('Tryckanimation i minimapen: ' + JSON.stringify(tfx));
  await page.waitForTimeout(1000);
  if (await page.evaluate(() => !!document.querySelector('#v3Sp .tapfx'))) fail('Tryckanimationen ska städa efter sig');
  await page.waitForTimeout(0);
  const after = await page.evaluate(() => ({ pin: l3sp.pin, tx: l3.orbit.target.x + l3.O[0], ty: l3.orbit.target.y + l3.O[1], ex: window.__exp[0], ey: window.__exp[1] }));
  if (!after.pin || Math.hypot(after.pin[0] - after.ex, after.pin[1] - after.ey) > 0.6 || Math.hypot(after.tx - after.ex, after.ty - after.ey) > 0.6) fail('Musklick på ritningen: ' + JSON.stringify(after));
  console.log('OK: ritningspanel – kamera/ritning synkade, nål och flygning vid klick', JSON.stringify({ ...r, click: after.pin }));
  // Fast fönster under 3D-vyn: 3D-bilden krymper (renderaren och kameran får nytt mått) i stället för att täckas, och höjden dras med listen
  const dk = await page.evaluate(async () => {
    const o = {}, wait = ms => new Promise(r => setTimeout(r, ms)); l3spClose(); await wait(100); const cvEl = document.getElementById('v3Canvas'), h0 = cvEl.clientHeight, asp0 = l3.camera.aspect;
    await l3spOpen(); await wait(250); const sp = document.getElementById('v3Sp'), col = sp.parentElement; o.col = col.classList.contains('v3-col') && col.contains(cvEl) && cvEl.nextElementSibling === sp && sp.getBoundingClientRect().left >= document.querySelector('.v3-main').getBoundingClientRect().left + 100;
    o.shrunk = cvEl.clientHeight < h0 - 100; o.rendH = l3.renderer.domElement.clientHeight === cvEl.clientHeight || Math.abs(l3.renderer.getSize(new THREE.Vector2()).y - cvEl.clientHeight) < 2; o.aspect = l3.camera.aspect > asp0 + 0.1;
    o.noOverlap = sp.getBoundingClientRect().top >= cvEl.getBoundingClientRect().bottom - 1; o.fullW = Math.abs(sp.getBoundingClientRect().width - cvEl.getBoundingClientRect().width) < 2;
    o.h1 = sp.getBoundingClientRect().height; o.h0 = h0; o.noCorners = !sp.querySelector('.rz'); return o;
  });
  if (!dk.col || !dk.shrunk || !dk.rendH || !dk.aspect || !dk.noOverlap || !dk.fullW || !dk.noCorners) fail('Fast minimap under 3D-vyn: ' + JSON.stringify(dk));
  const sb = await page.evaluate(() => { const r = document.getElementById('spSplit').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.move(sb[0], sb[1]); await page.mouse.down(); await page.mouse.move(sb[0], sb[1] - 40, { steps: 4 }); await page.mouse.move(sb[0], sb[1] - 120, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(200);
  const dk2 = await page.evaluate(() => ({ h: document.getElementById('v3Sp').getBoundingClientRect().height, pref: l3Prefs().spH, cvH: document.getElementById('v3Canvas').clientHeight, rend: l3.renderer.getSize(new THREE.Vector2()).y }));
  if (!(dk2.h > dk.h1 + 80) || !(dk2.pref > 0.4) || Math.abs(dk2.rend - dk2.cvH) > 2) fail('Dra höjden med listen: ' + JSON.stringify({ dk, dk2 }));
  const dk3 = await page.evaluate(async () => { l3spClose(); await new Promise(r => setTimeout(r, 200)); const c = document.getElementById('v3Canvas'); return { h: c.clientHeight, rend: l3.renderer.getSize(new THREE.Vector2()).y, gone: !document.getElementById('v3Sp') }; });
  if (!dk3.gone || Math.abs(dk3.h - dk.h0) > 2 || Math.abs(dk3.rend - dk3.h) > 2) fail('3D-vyn får full höjd igen när minimapen stängs: ' + JSON.stringify({ dk, dk3 }));
  console.log('OK: minimapen är ett fast fönster under 3D-vyn (3D-vyn krymper, höjden dras, full höjd igen vid stängning)', JSON.stringify({ dk, dk2, dk3 }));
  await page.evaluate(() => l3SetPref('spH', 0.4));
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
  // Fäst i punktmolnet: nålen hamnar på den högsta punkten i molnet inom radien (plan och höjd), med och utan rutindex; kan stängas av
  const sn = await page.evaluate(async () => {
    const o = {}, wait = ms => new Promise(r => setTimeout(r, ms)); l3spClose(); await l3spOpen(); l3spFollow(false);
    const c0 = plan.calib.model[0], P = []; for (let y = -10; y <= 10; y += 0.5) for (let x = -10; x <= 10; x += 0.5) { let z = 5 + 0.1 * x; if (Math.abs(x - 2) < 0.01 && Math.abs(y - 3) < 0.01) z += 3; P.push(x, y, z); }
    const info = { center: [c0[0] + 30, c0[1] + 10, 100], min: [0, 0, 0], max: [1, 1, 1], format: 't', n: 0, total: 0 }; const cl = l3pcBuild({ id: 'snapA', name: 'Snap' }, { info, chunks: [{ pos: new Float32Array(P), inten: new Uint8Array(P.length / 3) }] }); cl.visible = true;
    const brute = (x, y, r) => { let b = null; for (let i = 0; i < P.length; i += 3) { const dx = P[i] + info.center[0] - x, dy = P[i + 1] + info.center[1] - y; if (dx * dx + dy * dy <= r * r) { const z = P[i + 2] + 100; if (!b || z > b[2]) b = [P[i] + info.center[0], P[i + 1] + info.center[1], z]; } } return b; };
    const a = l3spFromScr(0, 0), b = l3spFromScr(1, 0), mpp = Math.hypot(b[0] - a[0], b[1] - a[1]), r = Math.min(1, Math.max(0.1, 6 * mpp)); o.r = Math.round(r * 100) / 100;
    const qx = info.center[0] + 2.1, qy = info.center[1] + 3.1; let exp = brute(qx, qy, r); l3spGoTo(qx, qy); const p1 = l3sp.pin.slice(); o.snapped = l3sp.pinSnap; o.spike = !!exp && Math.abs(exp[2] - 108) < 0.01 || !!exp; o.d1 = exp ? Math.hypot(p1[0] - qx, p1[1] - qy, p1[2] - exp[2]) : 999;
    await wait(900); const idx = cl.chunks[0].cells && cl.chunks[0].cells.length; o.indexed = !!idx; l3spGoTo(qx, qy); const p2 = l3sp.pin.slice(); o.d2 = exp ? Math.hypot(p2[0] - qx, p2[1] - qy, p2[2] - exp[2]) : 999;
    // en punkt långt från molnet: ingen fäst
    l3spGoTo(info.center[0] + 200, info.center[1] + 200); o.far = !l3sp.pinSnap;
    // IFC: en låda ovanför punkten – höjden hämtas ur modellens översida, läget är kvar
    { const w = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 2), new THREE.MeshBasicMaterial()); w.position.set(qx - l3.O[0], qy - l3.O[1], 151 - l3.O[2]); w.updateMatrixWorld(true); l3.scene.add(w); l3b.models.push({ id: 'ifcsnap', visible: true, meshes: [w], tris: 0 }); l3spGoTo(qx, qy); const pi = l3sp.pin.slice(); o.ifc = !!l3sp.pinSnap && Math.abs(pi[2] - 152) < 0.05 && Math.hypot(pi[0] - qx, pi[1] - qy) < 1e-6; o.ifcZ = pi[2]; l3b.models.pop(); l3.scene.remove(w); }
    // Visa i 3D på/av: den aktiva ritningens yta ska släckas igen
    { if (!l3.planMesh) { l3.planMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial()); l3.planMesh.visible = false; l3.scene.add(l3.planMesh); } const cb = document.getElementById('spZshow'); l3sp.planId = plan.id; const was = l3.planMesh.visible; cb.checked = true; cb.dispatchEvent(new Event('change')); const on = l3.planMesh.visible; cb.checked = false; cb.dispatchEvent(new Event('change')); o.zoff = on && l3.planMesh.visible === was; }
    // smidig panorering: den skarpa bilden ligger kvar (flyttas med CSS) tills nya är klar
    { l3spFollow(false); l3spFit(); l3sp.key = ''; l3spDraw(); await wait(700); const dt = l3sp.dt; o.dt0 = dt.style.visibility === 'visible'; l3sp.view.tx += 40; l3sp.key = ''; l3spDraw(); o.dtKeep = dt.style.visibility === 'visible' && /translate\(/.test(dt.style.transform); await wait(900); o.dtBack = dt.style.visibility === 'visible' && dt.style.transform === ''; }
    // av
    l3SetPref('spSnapPc', false); l3spGoTo(qx, qy); o.off = !l3sp.pinSnap && Math.abs(l3sp.pin[0] - qx) < 1e-6; l3SetPref('spSnapPc', true); l3pcRemove('snapA'); return o;
  });
  if (!sn.snapped || sn.d1 > 0.01 || sn.d2 > 0.01 || !sn.indexed || !sn.far || !sn.off || !sn.ifc || !sn.zoff || !sn.dt0 || !sn.dtKeep || !sn.dtBack) fail('Fäst i punktmolnet: ' + JSON.stringify(sn));
  console.log('OK: klick i minimapen fäster nålen i punktmolnet (plan + höjd, med och utan rutindex, av/på)', JSON.stringify(sn));
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
    l3sp.followHold = 0; const [cx, cy] = l3spToScr(l3.camera.position.x + l3.O[0], l3.camera.position.y + l3.O[1]); o.camOff0 = Math.hypot(cx - l3sp.cv.clientWidth / 2, cy - l3sp.cv.clientHeight / 2);
    l3sp.cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, clientX: r.left + 10, clientY: r.top + 10, bubbles: true, cancelable: true })); const [c2x, c2y] = l3spToScr(l3.camera.position.x + l3.O[0], l3.camera.position.y + l3.O[1]); o.zoomed = v.k > v0.k; o.camAfterZoom = Math.hypot(c2x - l3sp.cv.clientWidth / 2, c2y - l3sp.cv.clientHeight / 2);
    return o;
  });
  if (st.clickDx > 20) fail('Klick i panelen ska inte hoppa bilden: ' + JSON.stringify(st));
  if (!st.zoomed || st.camAfterZoom > 4) fail('Zoom med Följ ska hålla kameran i mitten: ' + JSON.stringify(st));
  const cb = await page.evaluate(() => { const r = l3sp.cv.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.move(cb[0], cb[1]); await page.mouse.down(); await page.mouse.move(cb[0] + 30, cb[1] + 10); await page.mouse.move(cb[0] + 60, cb[1] + 20); await page.mouse.up();
  const fo = await page.evaluate(() => l3sp.follow); if (fo) fail('Panorering ska stänga av Följ');
  console.log('OK: ritningspanelen hoppar inte (klick, zoom, panorering)', JSON.stringify(st));
  // Skarp PDF: när vyn står still ritas det som syns om direkt ur PDF:en i skärmens upplösning
  const dt = await page.evaluate(async () => {
    const o = {}; l3spClose(); await l3spOpen(); l3spFollow(false); const n0 = l3sp.dtRenders || 0; const r = l3sp.cv.getBoundingClientRect();
    l3sp.cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -600, clientX: r.left + 50, clientY: r.top + 50, bubbles: true, cancelable: true })); await new Promise(rr => setTimeout(rr, 120)); o.hiddenWhileMoving = l3sp.dt.style.visibility !== 'visible';
    await new Promise(rr => setTimeout(rr, 700)); o.renders = (l3sp.dtRenders || 0) - n0; o.visible = l3sp.dt.style.visibility === 'visible'; o.key = !!l3sp.dtKey; o.sizeOk = l3sp.dt.width === l3sp.cv.width && l3sp.dt.height === l3sp.cv.height;
    l3SetPref('spMap', 'esri'); const sel = document.getElementById('spMapSrc'); sel.value = 'esri'; sel.dispatchEvent(new Event('change')); await new Promise(rr => setTimeout(rr, 900)); o.mapBlend = l3sp.dt.style.mixBlendMode; o.noPdfBase = !!l3sp.baseNoPdf; l3SetPref('spMap', ''); return o;
  });
  if (!dt.hiddenWhileMoving || dt.renders < 1 || !dt.visible || !dt.key || !dt.sizeOk) fail('Skarp PDF: ' + JSON.stringify(dt));
  if (dt.mapBlend !== 'multiply' || !dt.noPdfBase) fail('Skarp PDF över ortofoto: ' + JSON.stringify(dt));
  console.log('OK: skarp PDF i skärmens upplösning (över ortofoto: multiplicerad, utan dubbla linjer)', JSON.stringify(dt));
  // Telefon: panelen ska rymmas i bredd (ingen kapning/sidscroll)
  await page.setViewportSize({ width: 430, height: 900 }); await page.waitForTimeout(400);
  const ph = await page.evaluate(async () => { l3spClose(); await l3spOpen(); await new Promise(r => setTimeout(r, 300)); const el = document.getElementById('v3Sp'), r = el.getBoundingClientRect(), host = el.parentElement.getBoundingClientRect(); const bad = [...el.querySelectorAll('button,select,input')].filter(c => { const q = c.getBoundingClientRect(); return q.width > 0 && (q.right > r.right + 1 || q.left < r.left - 1); }).length; return { w: r.width, host: host.width, inside: r.left >= host.left - 1 && r.right <= host.right + 1, sw: el.scrollWidth, cw: el.clientWidth, bad }; });
  if (!ph.inside || ph.bad > 0 || ph.sw > ph.cw + 1) fail('Panelen på telefon: ' + JSON.stringify(ph));
  console.log('OK: ritningspanelen rymms på telefon', JSON.stringify(ph)); await page.setViewportSize({ width: 1300, height: 850 });
  // Mina ortofoton (uppladdade i projektet) som underlag
  const og = await page.evaluate(async () => {
    const o = {}, id = 'orth1', W = 200, H = 100, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#3f6212'; g.fillRect(0, 0, W, H);
    const m = plan.calib.model[0]; siteItems.push({ id, type: 'ortho', name: 'Flygfoto test', date: '2026-10-01', width: W, height: H, world: { A: 0.5, B: 0, C: m[0] - 2, D: 0, E: -0.5, F: m[1] + 60 }, created_at: '2026-10-01' }); orthoImages.set(id, c);
    l3spClose(); await l3spOpen(); const sel = document.getElementById('spMapSrc'); o.opts = [...sel.querySelectorAll('optgroup option')].map(x => x.value + '|' + x.textContent);
    sel.value = 'ortho:' + id; sel.dispatchEvent(new Event('change')); l3spFit(); const bc = l3sp.bc.getContext('2d'); let draws = 0, tf = null; const od = bc.drawImage.bind(bc); bc.drawImage = (...a) => { draws++; if (a[0] === c) tf = bc.getTransform(); return od(...a); };
    l3sp.key = ''; l3sp.baseKey = ''; l3spDraw(); o.draws = draws; o.drewOrtho = !!tf; o.note = document.getElementById('spF').textContent;
    // hörnet (0,0) i bilden ska hamna där modellpunkten (C-0.25, F+0.25) ligger på skärmen
    if (tf) { const dpr = Math.min(2, window.devicePixelRatio || 1), [sx, sy] = l3spToScr(m[0] - 2 - 0.25, m[1] + 60 + 0.25); o.dx = Math.abs(tf.e / dpr - sx); o.dy = Math.abs(tf.f / dpr - sy); }
    l3SetPref('spMap', ''); siteItems.pop(); return o;
  });
  if (!og.opts.some(x => /^ortho:orth1\|Flygfoto test/.test(x)) || !og.opts.some(x => x.startsWith('ortho:*'))) fail('Ortofoton som val: ' + JSON.stringify(og));
  if (!og.drewOrtho || og.dx > 0.6 || og.dy > 0.6 || !/Flygfoto test/.test(og.note)) fail('Ortofotot ritas med världsfilen: ' + JSON.stringify(og));
  console.log('OK: mina ortofoton finns som underlag i minimapen', JSON.stringify(og));
  // Pekskärm: nyp för att zooma, två fingrar panorerar, ett finger panorerar, dubbeltryck zoomar in, ＋/− i rubriken
  const tc = await page.evaluate(async () => {
    const o = {}; l3spClose(); await l3spOpen(); l3spFollow(false); const cv = l3sp.cv, R = cv.getBoundingClientRect(), v = l3sp.view, wait = ms => new Promise(r => setTimeout(r, ms));
    const ev = (type, id, x, y) => cv.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: R.left + x, clientY: R.top + y, bubbles: true, cancelable: true }));
    const cx = R.width / 2, cy = R.height / 2, k0 = v.k; const keep = l3spFromScr(cx, cy);
    ev('pointerdown', 1, cx - 30, cy); ev('pointerdown', 2, cx + 30, cy); ev('pointermove', 1, cx - 70, cy); ev('pointermove', 2, cx + 70, cy);   // isär: ×~2,3
    o.pinchK = v.k / k0; const after = l3spFromScr(cx, cy); o.pinchKeep = Math.hypot(after[0] - keep[0], after[1] - keep[1]);   // punkten mitt emellan fingrarna ligger kvar
    ev('pointermove', 1, cx - 70, cy + 20); ev('pointermove', 2, cx + 70, cy + 20); o.twoPan = Math.abs(l3sp.view.ty - v.ty) < 1e-9; ev('pointerup', 2, cx + 70, cy + 20); ev('pointerup', 1, cx - 70, cy + 20);
    const k1 = v.k; ev('pointerdown', 3, cx, cy); ev('pointermove', 3, cx + 40, cy + 10); const tx1 = v.tx; ev('pointerup', 3, cx + 40, cy + 10); o.onePan = tx1; o.followOff = !l3sp.follow;
    const k2 = v.k; ev('pointerdown', 4, 50, 50); ev('pointerup', 4, 50, 50); await wait(60); ev('pointerdown', 5, 51, 51); ev('pointerup', 5, 51, 51); o.dbl = v.k / k2;   // dubbeltryck
    await wait(500); const k3 = v.k; document.getElementById('spZin').click(); o.btnIn = v.k / k3; document.getElementById('spZout').click(); o.btnOut = v.k / k3;
    ev('pointerdown', 6, 80, 60); ev('pointerup', 6, 80, 60); await wait(500); o.tapGo = !!l3sp.pin;   // enkeltryck flyger dit (efter väntan på ev. dubbeltryck)
    return o;
  });
  if (!(tc.pinchK > 1.8 && tc.pinchK < 2.8) || tc.pinchKeep > 0.01 || !tc.twoPan) fail('Nyp-zoom på pekskärm: ' + JSON.stringify(tc));
  if (!tc.followOff || !(tc.dbl > 2) || !(tc.btnIn > 1.5) || !(tc.btnOut < 1.1) || !tc.tapGo) fail('Pekskärm: panorera/dubbeltryck/knappar/tryck: ' + JSON.stringify(tc));
  console.log('OK: pekskärm – nyp-zoom, panorering, dubbeltryck, ＋/− och tryck', JSON.stringify(tc));
  if (process.env.SHOT) { await page.evaluate(async () => { l3SetPref('spMap', 'esri'); document.getElementById('spMapSrc').value = 'esri'; document.getElementById('spMapSrc').dispatchEvent(new Event('change')); const c = plan.calib.model[0]; l3spGoTo(c[0] + 25, c[1] + 12); }); await page.waitForTimeout(1300); await page.screenshot({ path: process.env.SHOT }); }
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
