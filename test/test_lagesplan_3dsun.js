const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9090;
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
  const ok = (c, m) => { if (!c) fail(m); };
  const o = await page.evaluate(async () => {
    const r = {}; const [la, lo] = l3sunLatLon(6512300, 150100); r.ll = [la, lo].map(v => Math.round(v * 1000) / 1000);
    const mx = (d) => { let b = null; for (let m = 0; m < 1440; m += 1) { const q = l3sunPos(d, m, 59.33, 18.07); if (!b || q.el > b.el) b = q; } return b; }, noon = mx('2026-06-21'), win = mx('2026-12-21'), night = l3sunPos('2026-06-21', 60, 59.33, 18.07);
    r.noon = Math.round(noon.el * 10) / 10; r.win = Math.round(win.el * 10) / 10; r.night = night.el < 0; r.south = Math.abs(noon.az - 180) < 6;
    r.tz = [l3sunTz(2026, 6, 21), l3sunTz(2026, 12, 21)]; const rs = l3sunRiseSet('2026-06-21', 59.33, 18.07); r.rise = rs.rise && Math.round(rs.rise / 60); r.set = rs.set && Math.round(rs.set / 60);
    // i editorn: bod i mitten, sol i söder
    const O = l3.O, b = placeNew('bod', [O[0] + 5, O[1] + 5, 0]); placements.push(b); placeTouch(b); l3AddPlacementMesh(b);
    l3sun.date = '2026-06-21'; l3sun.min = 13 * 60 + 33; l3sun.lat = 59.33; l3sun.lon = 18.07; l3sunStart();
    r.mode = l3vm.mode; r.dir = l3vm.sunDir && [l3vm.sunDir.x, l3vm.sunDir.y, l3vm.sunDir.z].map(v => Math.round(v * 100) / 100); const sun = l3vmSun(); r.shadow = !!sun.castShadow; r.panel = !!document.querySelector('#v3AnPanel[data-kind="sun"]');
    l3sun.min = 60; l3sunApply(); r.nightShadow = !l3vmSun().castShadow;
    l3sun.min = 12 * 60 + 49; l3sun.span = 40; await l3sunHours(); r.hours = l3sun.res && [Math.round(l3sun.res.max * 10) / 10, Math.round(l3sun.res.cnt.reduce((a, c) => a + c, 0))];
    r.mean = l3sun.res && l3sun.res.mean > 0 && l3sun.res.good >= 0;
    // sol i en punkt / per objekt / film
    const occ = l3sunOcc(), bx = new THREE.Box3().setFromObject(l3.placeMeshes.get(b.id)), cxy = [(bx.min.x + bx.max.x) / 2, (bx.min.y + bx.max.y) / 2];
    const roof = new THREE.Vector3(cxy[0], cxy[1], bx.max.z + 0.05), northFace = new THREE.Vector3(bx.max.x, cxy[1], (bx.min.z + bx.max.z) / 2);
    r.roofSum = l3sunProbeAt(roof, null, '2026-06-21', occ, 20).h; r.roofWin = l3sunProbeAt(roof, null, '2026-12-21', occ, 20).h;
    r.northWin = l3sunProbeAt(northFace, new THREE.Vector3(1, 0, 0), '2026-12-21', occ, 20).h; r.southWin = l3sunProbeAt(new THREE.Vector3(bx.min.x, cxy[1], (bx.min.z + bx.max.z) / 2), new THREE.Vector3(-1, 0, 0), '2026-12-21', occ, 20).h;
    r.normal = l3sunNormalAt(roof, occ).z;
    l3sun.probe = { day: l3sunProbeAt(roof, null, '2026-06-21', occ), seas: [['Vår', 5]], dir: 'vågrät yta uppåt', P: roof }; l3sunOpen(); r.probeUi = !!document.querySelector('.v3-sn-strip') && !!document.querySelector('.v3-sn-seas');
    await l3sunObjects(); r.objs = l3sun.objs.rows.length; r.objsUi = !!document.querySelector('.v3-sn-list');
    const blob = await l3sunFilm({ frames: 8, noDownload: true }); r.film = blob && blob.size; r.filmDone = !l3sun.filming && !l3.hudHide;
    l3sunOff(); r.off = l3vm.sunDir === null;
    return r;
  });
  console.log(JSON.stringify(o));
  ok(Math.abs(o.ll[1] - 20.249) < 0.01 && o.ll[0] > 58 && o.ll[0] < 59.5, 'SWEREF → lat/lon: ' + o.ll);
  ok(Math.abs(o.noon - 54.1) < 1.2 && Math.abs(o.win - 7.2) < 1.2 && o.night && o.south, 'Solhöjd: ' + JSON.stringify([o.noon, o.win, o.night, o.south]));
  ok(o.tz[0] === 2 && o.tz[1] === 1 && o.rise >= 3 && o.rise <= 4 && o.set >= 21 && o.set <= 22, 'Tid/tidzon/uppgång: ' + JSON.stringify([o.tz, o.rise, o.set]));
  ok(o.mode === 'real' && o.dir && o.dir[2] > 0.7 && o.shadow && o.panel && o.nightShadow, 'Solstudien styr skuggorna: ' + JSON.stringify([o.mode, o.dir, o.shadow]));
  ok(o.hours && o.hours[0] > 10 && o.hours[1] > 1000 && o.off, 'Soltimmar: ' + JSON.stringify(o.hours));
  ok(o.mean, 'Soltimmar: medel och andel med minst 6 h');
  ok(o.roofSum > 10 && o.roofWin > 1 && o.roofSum > o.roofWin, 'Sol på taket sommar/vinter: ' + JSON.stringify([o.roofSum, o.roofWin]));
  ok(o.northWin === 0 && o.southWin > 0 && o.normal > 0.9, 'Norrfasad får ingen sol på vintern, sydfasad får: ' + JSON.stringify([o.northWin, o.southWin, o.normal]));
  ok(o.probeUi && o.objs >= 1 && o.objsUi, 'Panelen visar punkt och sol per objekt: ' + JSON.stringify([o.probeUi, o.objs, o.objsUi]));
  ok(o.film > 1000 && o.filmDone, 'Dagsfilmen ger en videofil: ' + JSON.stringify([o.film, o.filmDone]));
  ok(!errors.length, 'JS-fel: ' + errors.join('|'));
  console.log('OK: solstudie – solläge, tidszon, skuggor, soltimmar');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
