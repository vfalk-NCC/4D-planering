const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9061;
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
  await page.evaluate(() => {
    ['Stomme A', 'Stomme B', 'Bygg C', 'Etablering'].forEach((n, i) => l3b.models.push({ id: 'md' + i, name: n + '.ifc', visible: i % 2 === 0, meshes: [], ranges: [], tris: 1000 * (i + 1), O: [0, 0, 0], src: { id: 'md' + i, version: 'v' } }));
    ['Moln 1', 'Moln 2', 'Moln 3'].forEach((n, i) => l3pc.clouds.push({ id: 'pc' + i, name: n + '.laz', visible: i === 0, dz: 0, nTot: 1000, info: { format: 'las', n: 1000, total: 1000, center: [0, 0, 0], min: [0, 0, 0], max: [1, 1, 1] }, chunks: [], group: new THREE.Group() }));
    l3SetPref('palTab', 'layers'); document.querySelector('[data-paltab="layers"]').click(); l3SetPref('layFolders', {}); l3LayersRender();
  });
  await page.waitForTimeout(300);
  const q = fn => page.evaluate(fn);
  const r0 = await q(() => ({ rows: document.querySelectorAll('#v3PalLayers [data-l3l-model]').length, pcs: document.querySelectorAll('#v3PalLayers [data-pc-eye]').length, newBtn: document.querySelectorAll('.v3-lyf-add').length, par: [...document.querySelectorAll('.v3-lyf-new')].map(b => b.parentElement.className + '<' + (b.parentElement.parentElement && b.parentElement.parentElement.className) + '<' + (b.closest('[id]') && b.closest('[id]').id)) }));
  if (r0.rows !== 4 || r0.pcs !== 3 || r0.newBtn !== 2) fail('Utgångsläge: ' + JSON.stringify(r0));
  const r1 = await q(async () => { const f = l3lfCreate('models', 'Stomme', 'data-l3l-model=md0'); l3lfAssign('models', 'data-l3l-model=md1', f.id); const g = l3lfCreate('pc', 'Skanningar', 'data-pc-eye=pc2'); await new Promise(r => setTimeout(r, 100));
    const el = document.querySelector('.v3-lyf[data-lf="' + f.id + '"]'); return { folders: document.querySelectorAll('.v3-lyf').length, inFolder: el.querySelectorAll('.v3-lr').length, name: el.querySelector('.v3-lyf-t b').textContent, count: el.querySelector('.v3-lyf-t em').textContent, top: document.querySelector('[data-lsub="models"] .v3-lsub-b').firstElementChild.className, pcIn: document.querySelectorAll('.v3-lyf[data-lf="' + g.id + '"] [data-pc-eye]').length, other: document.querySelectorAll('#v3PalLayers [data-l3l-model]').length, saved: JSON.stringify(l3Prefs().layFolders).length > 20, fid: f.id }; });
  if (r1.folders !== 2 || r1.inFolder !== 2 || r1.name !== 'Stomme' || r1.count !== '2' || !/v3-lyf/.test(r1.top) || r1.pcIn !== 1 || r1.other !== 4 || !r1.saved) fail('Mappar och flytt: ' + JSON.stringify(r1));
  // tänd/släck allt i mappen (md0 på, md1 av → någon är på → släcks alla)
  const r2 = await q(async () => { const fid = document.querySelector('.v3-lyf').dataset.lf; await l3lfToggleAll('models', fid); await new Promise(r => setTimeout(r, 400)); return { md0: l3b.models.find(m => m.id === 'md0').visible, md1: l3b.models.find(m => m.id === 'md1').visible }; });
  if (r2.md0 || r2.md1) fail('Släck allt i mappen: ' + JSON.stringify(r2));
  // dra-och-släpp via händelser, ta ur mappen, byt namn, fäll ihop, ta bort
  const r3 = await q(async () => { const fid = document.querySelector('.v3-lyf').dataset.lf, row = document.querySelector('[data-l3l-model="md2"]').closest('.v3-lr'), dt = new DataTransfer(); const ev = (t, el) => el.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: dt }));
    ev('dragstart', row); ev('dragover', document.querySelector('.v3-lyf[data-lf="' + fid + '"]')); ev('drop', document.querySelector('.v3-lyf[data-lf="' + fid + '"]')); await new Promise(r => setTimeout(r, 100)); const n3 = document.querySelectorAll('.v3-lyf[data-lf="' + fid + '"] .v3-lr').length;
    l3lfRename('models', fid, 'Stomme 2'); const nm = document.querySelector('.v3-lyf-t b').textContent; l3lfToggleShut('models', fid); const shut = document.querySelector('.v3-lyf').classList.contains('shut');
    l3lfAssign('models', 'data-l3l-model=md2', null); l3lfToggleShut('models', fid); const n4 = document.querySelectorAll('.v3-lyf[data-lf="' + fid + '"] .v3-lr').length; l3lfDelete('models', fid); const gone = document.querySelectorAll('.v3-lyf[data-lf="' + fid + '"]').length, rows = document.querySelectorAll('#v3PalLayers [data-l3l-model]').length;
    return { n3, nm, shut, n4, gone, rows }; });
  if (r3.n3 !== 3 || r3.nm !== 'Stomme 2' || !r3.shut || r3.n4 !== 2 || r3.gone !== 0 || r3.rows !== 4) fail('Dra och släpp, byt namn, fäll, ta bort: ' + JSON.stringify(r3));
  console.log('OK: egna mappar under 3D-modeller och Punktmoln (skapa, flytta, dra och släpp, tänd/släck, byt namn, fäll, ta bort)', JSON.stringify({ r1, r3 }));
  // Ctrl+klick väljer flera modeller; tänd/släck och flytta gäller alla valda
  const ms = await page.evaluate(async () => {
    l3lfCreate('models', 'Valda'); await new Promise(r => setTimeout(r, 80));
    const row = id => document.querySelector('[data-l3l-model="' + id + '"]').closest('.v3-lr'), click = (id, o) => row(id).querySelector('.v3-lr-n').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...o }));
    click('md0', { ctrlKey: true }); click('md2', { ctrlKey: true }); click('md3', { ctrlKey: true });
    const out = { sel: l3lyS.keys.size, bar: !!document.querySelector('.v3-lysel-bar'), painted: document.querySelectorAll('.v3-lr.v3-lysel').length, glow: 0 };
    // ctrl+klick på en rad släcker inte modellen
    out.vis0 = ['md0', 'md1', 'md2', 'md3'].map(id => l3b.models.find(m => m.id === id).visible).join();
    // släck på en vald rads öga: alla valda blir släckta
    window.__bs = []; { const o = l3bShow; l3bShow = function (id, on) { window.__bs.push(id + ':' + on); return o.apply(this, arguments); }; } out.eye0 = document.querySelector('[data-l3l-model="md0"]').className; document.querySelector('[data-l3l-model="md0"]').click(); await new Promise(r => setTimeout(r, 600)); out.bs = window.__bs.join(); out.eye0b = document.querySelector('[data-l3l-model="md0"]').className; out.vis1 = ['md0', 'md1', 'md2', 'md3'].map(id => l3b.models.find(m => m.id === id).visible).join();
    // flytta alla valda till en mapp
    const f = l3lfList('models').find(x => x.name === 'Valda'); l3lfAssign('models', [...l3lyS.keys], f.id); await new Promise(r => setTimeout(r, 100)); out.inF = document.querySelectorAll('.v3-lyf[data-lf="' + f.id + '"] .v3-lr').length;
    // skift-klick = intervall, Esc avmarkerar
    click('md1', { shiftKey: true }); out.range = l3lyS.keys.size; l3lySelClear(); out.cleared = l3lyS.keys.size;
    return out; });
  if (ms.sel !== 3 || !ms.bar || ms.painted !== 3 || ms.vis0 !== 'false,false,true,false' || ms.vis1 !== 'true,false,true,true' || ms.inF !== 3 || ms.cleared !== 0) fail('Ctrl+klick, flera valda: ' + JSON.stringify(ms));
  console.log('OK: Ctrl+klick väljer flera modeller – tänd/släck, flytta till mapp och skift-intervall gäller alla valda', JSON.stringify(ms));
  if (process.env.SHOT) { await page.evaluate(() => { const f = l3lfCreate('models', 'Stomme', 'data-l3l-model=md0'); l3lfAssign('models', 'data-l3l-model=md1', f.id); l3lfCreate('models', 'Tom mapp'); }); await page.waitForTimeout(300); await page.screenshot({ path: process.env.SHOT }); }
  const real = errors.filter(e => !/userData/.test(e)); if (real.length) fail('sidfel: ' + real.slice(0, 3).join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
