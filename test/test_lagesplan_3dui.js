// UI-lyftet i 3D-editorn (Victor 2026-10-23): lås och flyttbara knappar/paneler, arbetsytor, snabbfält, radialmeny, vykub.
// (uppstarten delas med test_lagesplan_3d.js) 3D-vyn ovanpå lägesplanen (Victors önskemål 2026-10-08): planen som mark via kalibreringen,
// planerade objekt som lådor i statusfärg, etableringen (plan_placements.json) med riktig geometri,
// lägga till från biblioteket med ett tryck, handtag (flytta/vrida) med fäst mot ytor, sidopanel,
// mätning, sparning i samma fil som 4D-planering och "Spara som IFC" via 4D-planering.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8994;
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
  const prefs = () => page.evaluate(() => JSON.parse(localStorage.getItem('lagesplan-3d-prefs') || '{}').ui || {});
  const barKeys = () => page.evaluate(() => l3UiItems().map(l3UiKey));
  // 1) Låst från start, ikonrad utan text, vykub och flikikoner
  let s = await page.evaluate(() => ({ locked: l3UiGet().locked, cls: document.getElementById('view3d').classList.contains('v3-nordic'),
    txt: [...document.querySelectorAll('#view3d .v3-bar > button:not(.v3-primary) span, #view3d .v3-bar .v3-seg button span')].filter(e => e.offsetParent).length,
    faces: document.querySelectorAll('.v3-cube-f').length, tr: document.querySelector('.v3-cube-f.f-top').style.transform.startsWith('matrix3d'),
    tabs: [...document.querySelectorAll('[data-paltab]')].every(b => b.querySelector('svg') && b.dataset.tip), title: document.getElementById('v3PalTitle').textContent }));
  if (!s.locked || !s.cls || s.txt || s.faces !== 6 || !s.tr || !s.tabs || !s.title) fail('Utgångsläget: ' + JSON.stringify(s));
  console.log('OK: låst nordiskt gränssnitt – ikonrad, vykub och flikar med ikoner');
  // 2) Vykuben: ett tryck på en sida flyger dit
  await page.evaluate(() => l3.camera.position.set(l3.orbit.target.x + 30, l3.orbit.target.y - 30, l3.orbit.target.z + 20));
  await page.evaluate(() => document.querySelector('.v3-cube-f.f-top').click()); await sleep(1400);
  s = await page.evaluate(() => ({ z: l3.camera.position.z - l3.orbit.target.z, d: Math.hypot(l3.camera.position.x - l3.orbit.target.x, l3.camera.position.y - l3.orbit.target.y) }));
  if (s.z < s.d * 5) fail('Kuben: Topp ska flyga till vy uppifrån: ' + JSON.stringify(s));
  console.log('OK: vykuben flyger till vald sida');
  // 3) Snabbfältet följer markeringen och duplicerar
  const n0 = await page.evaluate(() => placements.length);
  if (await page.isVisible('#v3CtxBar')) fail('Snabbfältet ska vara dolt utan markering');
  await page.evaluate(() => l3SelectIds([placements[0].id])); await sleep(700);
  if (!(await page.isVisible('#v3CtxBar')) || !/1 vald/.test(await page.textContent('#v3CbN'))) fail('Snabbfältet ska visas vid markering');
  // Färgburken: färg + opacitet på markerat etableringsobjekt
  await page.click('#v3CtxBar [data-cb="p:paint"]'); await page.waitForSelector('#v3TintPop');
  await page.click('#v3TintPop [data-tc="#ef4444"]');
  await page.$eval('#v3PaintOp', i => { i.value = '0.5'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
  const pt = await page.evaluate(() => { const p = l3SelList()[0]; return { c: p.color, o: p.opacity }; });
  if (pt.c !== '#ef4444' || pt.o !== 0.5) fail('Färgburken: ' + JSON.stringify(pt));
  await page.click('#v3PaintClr'); await sleep(50); await page.keyboard.press('Escape'); await sleep(100);
  if (await page.$('#v3TintPop')) fail('Färgrutan ska stängas med Esc ' + await page.evaluate(() => document.querySelectorAll('#v3TintPop').length + ' ' + (document.activeElement && document.activeElement.tagName)));
  await page.click('#v3CtxBar [data-cb="c:dup"]'); await sleep(300);
  if (await page.evaluate(() => placements.length) !== n0 + 1) fail('Duplicera i snabbfältet');
  await page.evaluate(() => { l3Undo(); l3SelectIds([]); }); await sleep(600);
  if (await page.evaluate(() => placements.length) !== n0) fail('Ångra duplicering');
  console.log('OK: snabbfältet – visas vid markering, duplicerar, göms utan markering');
  // 4) Radialmenyn
  await page.evaluate(() => l3UiRadial(600, 400)); await sleep(500);
  if ((await page.locator('.v3-rad-i').count()) !== 8) fail('Radialmenyn ska ha 8 val');
  await page.click('.v3-rad-i[data-r="t:measure"]'); await sleep(300);
  if (await page.evaluate(() => l3.tool) !== 'measure' || await page.locator('.v3-radial').count()) fail('Radialmenyn: Mät ska väljas och menyn stängas');
  await page.evaluate(() => l3SetTool('select')); await sleep(100);
  console.log('OK: radialmenyn väljer verktyg');
  // 5) Låsa upp, dra en knapp, högerklicka för att dölja, flytta egenskapsarket
  await page.click('#v3UiLock'); await sleep(300);
  if (!(await page.isVisible('#v3UiBanner')) || !(await page.evaluate(() => document.getElementById('view3d').classList.contains('v3-unlocked')))) fail('Upplåst: banner och klass');
  const k0 = await barKeys(), nT = await page.evaluate(() => l3.tool);
  const b = await page.locator('#v3PhotoBtn').boundingBox(), t = await page.locator('#v3EditBtn').boundingBox();
  await page.mouse.move(b.x + 8, b.y + 8); await page.mouse.down(); await page.mouse.move(t.x + 2, t.y + 8, { steps: 8 }); await page.mouse.up(); await sleep(200);
  const k1 = await barKeys();
  if (k1.indexOf('v3PhotoBtn') >= k1.indexOf('v3EditBtn') || JSON.stringify(k0) === JSON.stringify(k1)) fail('Dra en knapp ska byta plats: ' + k1);
  if ((await prefs()).order.indexOf('v3PhotoBtn') < 0) fail('Ordningen ska sparas');
  if (await page.evaluate(() => l3.tool) !== nT || await page.evaluate(() => !!document.querySelector('#v3Photo,.v3-photo-dlg:not(.hidden)'))) fail('Dra får inte aktivera knappen');
  await page.click('#v3ClipBtn', { button: 'right' }); await sleep(150);
  if (!(await prefs()).hide.includes('v3ClipBtn')) fail('Högerklick döljer knappen');
  await page.evaluate(() => l3SelectIds([placements[0].id])); await sleep(500);
  const sd = await page.locator('#v3Side').boundingBox();
  await page.mouse.move(sd.x + 40, sd.y + 12); await page.mouse.down(); await page.mouse.move(sd.x - 260, sd.y + 180, { steps: 8 }); await page.mouse.up(); await sleep(200);
  s = (await prefs()).pos.v3Side; const sd2 = await page.locator('#v3Side').boundingBox();
  if (!s || Math.abs(sd2.x - (sd.x - 300)) > 20) fail('Egenskapsarket ska flyttas: ' + JSON.stringify([s, sd, sd2]));
  console.log('OK: upplåst – knappar byter plats och sparas, högerklick döljer, egenskapsarket flyttas');
  // 6) Låsa: dolda knappar borta, ordningen kvar, inget flyttas längre
  await page.click('#v3UiLock'); await sleep(300);
  if (await page.isVisible('#v3ClipBtn')) fail('Dold knapp ska vara borta när layouten är låst');
  const before = await page.locator('#v3Side').boundingBox(); await page.mouse.move(before.x + 40, before.y + 12); await page.mouse.down(); await page.mouse.move(before.x + 140, before.y + 80, { steps: 4 }); await page.mouse.up();
  const after = await page.locator('#v3Side').boundingBox(); if (Math.abs(after.x - before.x) > 2) fail('Låst: inget ska gå att flytta');
  console.log('OK: låst igen – dolda knappar borta, inget flyttas');
  // 7) Arbetsytor: spara, Fokus, tillbaka, ta bort; layouten överlever att 3D stängs och öppnas
  await page.click('#v3UiLayBtn'); await page.fill('#v3UiName', 'Min yta'); await page.click('#v3UiSave'); await sleep(200);
  if (!(await page.evaluate(() => !!l3UiGet().layouts['Min yta']))) fail('Egen arbetsyta ska sparas');
  await page.click('[data-ul="p:fokus"]'); await sleep(400);
  s = await page.evaluate(() => ({ pal: document.getElementById('v3Pal').classList.contains('hidden'), hide: l3UiGet().hide.length, clip: !!document.getElementById('v3ClipBtn').offsetParent }));
  if (!s.pal || s.hide || !s.clip) fail('Fokus: panelen dold och alla knappar tillbaka: ' + JSON.stringify(s));
  await page.evaluate(() => l3UiApplyLayout(l3UiGet().layouts['Min yta'], 'u:Min yta')); await sleep(300);
  s = await page.evaluate(() => ({ pal: document.getElementById('v3Pal').classList.contains('hidden'), hide: l3UiGet().hide.join(), pos: !!l3UiGet().pos.v3Side, ord: l3UiItems().map(l3UiKey).indexOf('v3PhotoBtn') < l3UiItems().map(l3UiKey).indexOf('v3EditBtn') }));
  if (s.pal || s.hide !== 'v3ClipBtn' || !s.pos || !s.ord) fail('Egen arbetsyta ska läggas tillbaka: ' + JSON.stringify(s));
  await page.evaluate(() => { l3UiApplyPreset('standard'); }); await sleep(300);
  s = await page.evaluate(() => ({ hide: l3UiGet().hide.length, pos: Object.keys(l3UiGet().pos).length, clip: !!document.getElementById('v3ClipBtn').offsetParent }));
  if (s.hide || s.pos || !s.clip) fail('Standard återställer layouten: ' + JSON.stringify(s));
  await page.evaluate(() => { l3UiApplyLayout(l3UiGet().layouts['Min yta'], 'u:Min yta'); }); await sleep(200);
  await page.evaluate(() => close3d()); await sleep(300); await page.click('#btn3d'); await page.waitForFunction(() => l3 && l3.placeMeshes.size >= 1, null, { timeout: 15000 }); await sleep(400);
  s = await page.evaluate(() => ({ ord: l3UiItems().map(l3UiKey).indexOf('v3PhotoBtn') < l3UiItems().map(l3UiKey).indexOf('v3EditBtn'), clip: !!document.getElementById('v3ClipBtn').offsetParent }));
  if (!s.ord || s.clip) fail('Layouten ska finnas kvar när 3D öppnas igen: ' + JSON.stringify(s));
  await page.evaluate(() => { l3UiApplyPreset('standard'); const u = l3UiGet(); delete u.layouts['Min yta']; l3UiSave(u); });
  console.log('OK: arbetsytor – spara, Fokus, Standard, överlever omstart');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3dui');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
