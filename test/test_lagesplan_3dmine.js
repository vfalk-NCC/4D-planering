const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9071;
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
  await page.evaluate(async () => { plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }]; pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A'); });
  await page.evaluate(() => { document.getElementById('dateInput').value = '2025-03-04'; });
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  { const d = await page.evaluate(() => ({ v: document.getElementById('dateInput').value, t: todayIso(), s: (document.getElementById('v3Date') || {}).value })); if (d.v !== d.t || (d.s && d.s !== d.t)) fail('3D ska starta på dagens datum: ' + JSON.stringify(d)); }
  await page.evaluate(() => { l3SetTool && l3SetTool('select'); document.getElementById('v3Pal').classList.remove('hidden'); });
  const r = await page.evaluate(async () => {
    const out = {}; const mk = (n, x) => modCreate({ k: 'solid', pl: { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] }, loops: [[[0, 0], [1, 0], [1, 1], [0, 1]]], d: 1 }, [x, 0, 0], { name: n });
    const a = mk('Mur A', 0), b = mk('Mur B', 3), c = mk('Platta C', 6); l3Changed(); await new Promise(r => setTimeout(r, 300));
    out.sec = !!document.getElementById('v3Mine') && !document.getElementById('v3Mine').classList.contains('hidden'); out.rows = document.querySelectorAll('#v3Mine .v3-mo-r').length;
    l3mnSetArea([a.id, b.id], 'Område Nord'); await new Promise(r => setTimeout(r, 200));
    out.areaOf = [a.area, b.area, c.area]; out.groups = [...document.querySelectorAll('#v3Mine .v3-mo-g .v3-pal-g span')].map(e => e.textContent);
    // släck området
    const sw = document.querySelector('#v3Mine [data-movis="a:Område Nord"]'); sw.click(); await new Promise(r => setTimeout(r, 200));
    out.hid = [l3.hidden.has(a.id), l3.hidden.has(b.id), l3.hidden.has(c.id)]; out.vis = [a, b, c].map(p => l3.placeMeshes.get(p.id).visible);
    document.getElementById('v3MoAllVis').click(); await new Promise(r => setTimeout(r, 200)); out.allHid = l3mnAll().every(p => l3.hidden.has(p.id));
    document.getElementById('v3MoAllVis').click(); await new Promise(r => setTimeout(r, 200)); out.allShown = l3mnAll().every(p => !l3.hidden.has(p.id));
    // sortering
    l3SetPref('moSort', 'new'); l3mnRender(); out.order = [...document.querySelectorAll('#v3Mine .v3-mo-n b')].map(e => e.textContent);
    // markera via klick + flytta
    document.querySelector(`#v3Mine [data-moid="${c.id}"] .v3-mo-n`).click(); await new Promise(r => setTimeout(r, 200)); out.sel = [...l3.sel];
    // sektionsswitchar i Kommentarer & Mått
    l3SetPref('palTab', 'comments'); if (typeof l3SetPalTab === 'function') l3SetPalTab('comments'); else document.querySelector('[data-paltab="comments"]').click();
    await new Promise(r => setTimeout(r, 600)); if (typeof l3kRenderTab === 'function') l3kRenderTab();
    out.sw = [...document.querySelectorAll('#v3PalComments .v3-ss-row .v3-lay-sw')].length;
    l3m.list.push({ id: 'm1', kind: 'dist', text: '5 m', pts: [], saved: true }); l3kRenderTab();
    out.mDisabled = false; const ms = document.querySelector('#v3MeasHead').parentElement.querySelector('input'); ms.click(); await new Promise(r => setTimeout(r, 200)); out.mHid = l3m.list.every(m => m.hid);
    document.querySelector('#v3KListHead').parentElement.querySelector('input').click(); await new Promise(r => setTimeout(r, 200)); out.kHid = l3k.hidden === true;
    document.querySelector('#v3PhHead').parentElement.querySelector('input').click(); await new Promise(r => setTimeout(r, 200)); out.pOff = !l3phOn() || l3phList().length === 0;
    // kommentar: Flytta-knappen öppnar redigeringsläget med handtag
    l3k.list.push({ id: 'k1', text: 'Test', pos: [1, 1, 1], at: new Date().toISOString(), by: 'V', replies: [] }); l3kRenderTab();
    const mv = document.querySelector('[data-kcmove="k1"]'); out.hasMove = !!mv; if (mv) { mv.click(); await new Promise(r => setTimeout(r, 300)); out.edit = !!l3k.editMode && l3k.open && l3k.open.id === 'k1'; }
    // kommentar på en punkt utan yta (t.ex. punktmoln) + IFC-export av alla
    l3kClose && l3kClose(); l3kNew(new THREE.Vector3(2, 2, 2), null); out.ptDraft = !!(l3k.draft && l3k.draft.target && l3k.draft.target.kind === 'point'); await new Promise(r => setTimeout(r, 200)); l3kHandlesPlace(); out.handles = !!l3kActive() && ['xy', 'z'].every(k => !!document.querySelector('.v3-khandle.' + k));
    const ifc = l3kIfcBuild(l3k.list.map((c, i) => ({ c, nr: i + 1 }))); out.ifc = !!(ifc && ifc.text && /IFC/.test(ifc.text));
    // vylistan: datum, uppdatera, ta bort, storlek
    l3SetPref('views', {}); l3SaveView('Vy A'); const at0 = l3SavedViews().find(v => v.name === 'Vy A').at; l3QvRender(); const box = document.getElementById('v3Qv'); box.classList.add('open');
    out.vdate = !!box.querySelector('.v3-qv-r .v3-qv-v em') && !!at0; out.thumb = !!box.querySelector('.v3-qv-r img.v3-qv-th'); out.left = getComputedStyle(box.querySelector('.v3-qv-r .v3-qv-t b')).textAlign; out.imgKb = Math.round(((l3SavedViews()[0].img || '').length) / 1024);
    const old = '2026-01-02T10:00:00.000Z'; const lst = l3SavedViews(); lst[0].at = old; l3StoreViews(lst); l3QvRender();
    box.querySelector('[data-qvupd="0"]').click(); await new Promise(r => setTimeout(r, 200)); const v1 = l3SavedViews()[0]; out.upd = v1.at === old && !!v1.upd;
    const grip = box.querySelector('.v3-qv-grip'), gb = grip.getBoundingClientRect(); const w0 = box.querySelector('.v3-qv-p').getBoundingClientRect().width; out.w0 = w0; out.grip = !!grip;
    out.fixture = { x: gb.left + 5, y: gb.top + 5 };
    return out;
  });
  console.log(JSON.stringify(r));
  if (!r.vdate || !r.upd || !r.grip || !r.thumb || !/left|start/.test(r.left) || r.imgKb > 20) fail('vylistan: ' + JSON.stringify(r));
  { const g = r.fixture; await page.mouse.move(g.x, g.y); await page.mouse.down(); await page.mouse.move(g.x - 80, g.y - 60, { steps: 4 }); await page.mouse.up();
    const w1 = await page.evaluate(() => document.querySelector('#v3Qv .v3-qv-p').getBoundingClientRect().width), pw = await page.evaluate(() => l3Prefs().qvW);
    if (!(w1 > r.w0 + 40) || !pw) fail('storlek på vylistan: ' + JSON.stringify({ w0: r.w0, w1, pw }));
    page.on('dialog', d => d.accept()); await page.evaluate(() => { document.querySelector('#v3Qv [data-qvdel="0"]').click(); }); await page.waitForTimeout(600);
    const n = await page.evaluate(() => l3SavedViews().length); if (n !== 0) fail('ta bort vy: ' + n); }
  void 0;
  if (!r.ptDraft || !r.ifc || !r.handles) fail('kommentar på punkt/IFC: ' + JSON.stringify(r));
  if (!r.hasMove || !r.edit) fail('flytta kommentar: ' + JSON.stringify(r));
  if (!r.sec || r.rows !== 3) fail('avsnittet saknas: ' + JSON.stringify(r));
  if (r.areaOf[0] !== 'Område Nord' || r.areaOf[1] !== 'Område Nord' || r.areaOf[2] || !r.groups.includes('Område Nord') || !r.groups.includes('Utan mapp')) fail('områden: ' + JSON.stringify(r));
  if (!(r.hid[0] && r.hid[1] && !r.hid[2]) || r.vis[0] || r.vis[1] || !r.vis[2]) fail('släck område: ' + JSON.stringify(r));
  if (!r.allHid || !r.allShown) fail('släck/tänd alla: ' + JSON.stringify(r));
  if (r.order.join() !== 'Mur B,Mur A,Platta C') fail('sortera nyast först: ' + JSON.stringify(r.order));
  if (r.sel.length !== 1) fail('markera via raden: ' + JSON.stringify(r));
  if (r.sw !== 4 || !r.mHid) fail('sektionsswitchar: ' + JSON.stringify(r));
  console.log('OK: ritade objekt – eget avsnitt, områden, tänd/släck, sortering; switchar på kommentarer/mått/foton/körvägar');
  if (errors.length) fail('sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
