// Gjutetappen (Victor 2026-10-24): fält som reglage och listor, volymen ur formen, träformen med markanspråk, handtag för L/T/U-formens utskärning, radialmenyn med en sekunds håll.
// (uppstarten delas med test_lagesplan_3d.js) 3D-vyn ovanpå lägesplanen (Victors önskemål 2026-10-08): planen som mark via kalibreringen,
// planerade objekt som lådor i statusfärg, etableringen (plan_placements.json) med riktig geometri,
// lägga till från biblioteket med ett tryck, handtag (flytta/vrida) med fäst mot ytor, sidopanel,
// mätning, sparning i samma fil som 4D-planering och "Spara som IFC" via 4D-planering.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8995;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: ({ data }) => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const kind = new Uint8Array(data)[0];
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      const [x, y] = v.convertToViewportPoint(kind === 2 ? 140 : 280, kind === 2 ? 160 : 320), w = (kind === 2 ? 20 : 40) * v.transform[0];
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height);
      c.fillStyle = kind === 2 ? '#ff0000' : '#0000ff'; c.fillRect(x, y, w, w);
      return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page); // appens egna dialogrutor
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  // GitHub: bara etableringens filer finns.
  const store = new Map(); let n = 0;
  store.set('projects/p1/plan_placements.json', { content: JSON.stringify([{ id: 'k1', type: 'tornkran', name: 'Kran 1', x: 6512320, y: 150110, z: 0, L: 1.6, B: 1.6, H: 40, R: 50, rot: 0, dz: 0, color: '#facc15' }]), sha: 's0' });
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    const body = JSON.parse(req.postData()); if (e && body.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' });
    const sha = 's' + (++n); store.set(f, { content: Buffer.from(body.content, 'base64').toString(), sha });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) });
  });
  const getStore = f => { const e = store.get(`projects/p1/${f}`); return e ? JSON.parse(e.content) : null; };
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = [
      { id: 'i1', object_name: 'K10', activity: 'Pelare', start_date: '2020-01-01', end_date: '2030-12-01', status: 'pagaende', progress: 40 },
      { id: 'i2', object_name: 'M30', activity: 'Gjutning', start_date: '2020-01-01', end_date: '2020-02-01', status: 'klar', progress: 100, actual_end_date: '2020-02-01' },
    ];
    positions = [
      { id: 'i1', x: 6512350, y: 150125, z0: 0, z1: 14, x0: 6512345, x1: 6512355, y0: 150120, y1: 150130 },
      { id: 'i2', x: 6512380, y: 150125, z0: 0, z1: 3, x0: 6512378, x1: 6512382, y0: 150123, y1: 150127 },
    ];
    renderPlanSelect(); await openPlan('A');
    window.__calls = [];
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    askOpener = async (type, extra) => { window.__calls.push(type); return type === 'placeSaveIfc' ? { n: 2, files: ['Etablering x.ifc'] } : {}; };
  });
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.objMesh && l3.placeMeshes.size === 1, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const sleep = ms => page.waitForTimeout(ms);
  const mk = async form => page.evaluate(async form => { const O = l3.O, q = placeNew('sm:gjutetapp', [O[0] + 20, O[1] + 20, 0]); q.f = q.f || {}; q.f.form = form; placements.push(q); placeTouch(q); l3AddPlacementMesh(q); l3SelectIds([q.id]); window.__g = q; return q.id; }, form);
  // 1) Panelen: reglage, knappar och listor i stället för fria siffror; volymen räknas ur formen
  await mk('L-form'); await sleep(500);
  let s = await page.evaluate(() => ({ range: document.querySelectorAll('#v3Side input[type=range][data-smf]').length, seg: document.querySelectorAll('#v3Side [data-smseg]').length, sel: document.querySelectorAll('#v3Side select[data-smf]').length, vol: !!document.querySelector('#v3Side [data-smf="vol"]'), calc: document.querySelector('#v3Side .v3-sm-calc') ? document.querySelector('#v3Side .v3-sm-calc').textContent : '', time: !!document.querySelector('#v3Side input[type=time][data-smf="start"]') }));
  if (s.range < 3 || s.seg < 3 || s.sel < 6 || s.vol || !/Volym/.test(s.calc) || !/Markanspråk/.test(s.calc) || !s.time) fail('Gjutetappens panel: ' + JSON.stringify(s));
  const a = await page.evaluate(() => { const p = window.__g, st = gjutStats(p, gjutPoly(p)); return { area: st.area, vol: st.vol, H: st.H, claim: st.claim }; });
  if (Math.abs(a.vol - a.area * a.H) > 1e-6 || a.claim <= a.area) fail('Volym = yta × tjocklek, markanspråk större än ytan: ' + JSON.stringify(a));
  await page.evaluate(() => { window.__g.f.tillagg = '10'; }); const v2 = await page.evaluate(() => gjutStats(window.__g, gjutPoly(window.__g)).vol); if (Math.abs(v2 - a.vol * 1.1) > 1e-6) fail('Spillpåslag 10 %: ' + v2);
  console.log('OK: gjutetapp – reglage/knappar/listor, volym ur formen med spillpåslag, markanspråk');
  // 2) Träformen: reglar, stöttor och snedstag runt konturen + orange markanspråk
  const g = await page.evaluate(() => { const parts = placeParts(window.__g); return { n: parts.length, wood: parts.filter(x => x.color === '#c9a15f' || x.color === '#a9824a').length, claim: parts.filter(x => x.color === '#f97316').length, sign: (parts.find(x => x.sign) || {}).sign && parts.find(x => x.sign).sign.title }; });
  if (g.wood < 2 || g.claim < 1) fail('Träform och markanspråk: ' + JSON.stringify(g));
  if (!/^Gjutetapp/.test(g.sign)) fail('Skylten visar etappens namn: ' + g.sign);
  console.log('OK: gjutetapp – träform med stöttor och snedstag, markanspråk, namnet på skylten');
  // 3) Handtag för utskärningen: L = 1 hörn, T och U = 2, rektangel = inga; dra ändrar måtten
  const counts = {}; for (const f of ['Rektangel', 'L-form', 'T-form', 'U-form']) { await mk(f); await sleep(200); counts[f] = await page.evaluate(() => l3HandleDefs(window.__g).filter(h => h.key === 'cut').length); }
  if (JSON.stringify(counts) !== JSON.stringify({ Rektangel: 0, 'L-form': 1, 'T-form': 2, 'U-form': 2 })) fail('Antal utskärningshandtag: ' + JSON.stringify(counts));
  await mk('L-form'); await sleep(300);
  await page.evaluate(() => { const p = window.__g, O = l3.O; l3StopFly(); const c = new THREE.Vector3(p.x - O[0], p.y - O[1], 0); l3.camera.position.set(c.x, c.y - 0.01, 60); l3.orbit.target.copy(c); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); l3HandlesBuild(); l3HandlesPos(); });
  const hp = await page.evaluate(() => { const el = document.querySelector('.v3-hd-cut'), r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  const before = await page.evaluate(() => [window.__g.f.cutL, window.__g.f.cutB].join());
  await page.mouse.move(hp[0], hp[1]); await page.mouse.down(); await page.mouse.move(hp[0] - 80, hp[1] + 40, { steps: 6 }); await page.mouse.up(); await sleep(300);
  const after = await page.evaluate(() => [window.__g.f.cutL, window.__g.f.cutB].join());
  if (before === after) fail('Dra utskärningens handtag ska ändra måtten: ' + before + ' -> ' + after);
  console.log('OK: handtag för L-, T- och U-formens utskärning i modellen (' + before + ' → ' + after + ')');
  // 4) Radialmenyn: håll mittenknappen stilla en sekund
  const cvb = await page.locator('#v3Canvas canvas').boundingBox(), px = cvb.x + cvb.width / 2, py = cvb.y + cvb.height / 2;
  await page.evaluate(([x, y]) => { const el = l3.renderer.domElement, o = { bubbles: true, cancelable: true, button: 1, buttons: 4, clientX: x, clientY: y, pointerId: 7 }; el.dispatchEvent(new PointerEvent('pointerdown', o)); }, [px, py]);
  await sleep(500); if (await page.locator('.v3-radial').count()) fail('Radialmenyn ska inte komma före en sekund');
  await sleep(700); if (!(await page.locator('.v3-radial').count())) fail('Radialmenyn ska komma efter en sekunds håll');
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 1, pointerId: 7 }))); await page.keyboard.press('Escape'); await sleep(300);
  await page.evaluate(([x, y]) => { const el = l3.renderer.domElement; el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 1, clientX: x, clientY: y, pointerId: 8 })); window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x + 30, clientY: y, pointerId: 8 })); }, [px, py]);
  await sleep(1300); if (await page.locator('.v3-radial').count()) fail('Rör man musen avbryts håll-menyn');
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 1, pointerId: 8 })));
  console.log('OK: radialmenyn öppnas vid markören efter en sekunds håll utan rörelse');
  const real = errors.filter(e => !/setPointerCapture/.test(e)); if (real.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3dgjut');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
