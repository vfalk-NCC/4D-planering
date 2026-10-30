const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9099;
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
    const r = {}, O = l3.O; window.__saved = null;
    const p = placeNew('container', [O[0] + 5, O[1] + 5, 0]); placements.push(p); placeTouch(p); l3AddPlacementMesh(p);
    r.side = (l3SelectIds([p.id]), l3RenderSide(), !!document.querySelector('#v3Side [data-ed="start"]'));
    const tri0 = placeParts(p).reduce((n, q) => n + (q.tris ? q.tris.faces.length : 0), 0);
    window.uiConfirm = async () => true; await l3edStart(p);
    r.on = l3ed.on; r.n = l3edPieces().length; r.origGone = !placements.some(q => q.id === p.id); r.bar = !!document.getElementById('v3EditBar');
    const tri1 = l3edPieces().reduce((n, q) => n + modLocalMesh(q).faces.length, 0); r.triSame = Math.abs(tri1 - tri0) < tri0 * 0.02;
    // ta bort tre delar och lägg till en ny låda
    const ids = l3edPieces().slice(0, 3).map(q => q.id); l3SelectIds(ids); l3DeleteSel(); r.after = l3edPieces().length;
    const add = modCreate({ k: 'solid', pl: MG.planeFrom([0, 0, 1], [0, 0, 0]), loops: [MG.rect2([0, 0], [1, 1])], d: 1 }, [O[0] + 5, O[1] + 5, 3], { name: 'Ny del' }); l3Changed(); r.withNew = l3edPieces().length;
    // spara (biblioteket stubbas)
    window.pmSaveAsset = async pd => { const a = { id: 'asset1', name: pd.name, kind: 'mesh', bbox: pd.bbox, tris: pd.tris, scale: 1 }; placeAssets.push(a); placeMeshCache.set('asset1', pd.mesh); window.__saved = pd; return a; };
    window.uiPrompt = async () => 'Min container';
    await l3edSave();
    r.saved = !!window.__saved && window.__saved.mesh.parts.length > 0; r.parts = window.__saved && window.__saved.mesh.parts.length; r.tris = window.__saved && window.__saved.tris;
    r.off = !l3ed.on; r.model = placements.some(q => q.type === 'model:asset1'); r.pieces = placements.filter(q => q.eg).length; r.bbox = window.__saved && window.__saved.bbox;
    r.lib = l3libItems().some(x => x.k === 'model:asset1' && x.label === 'Min container');
    // avbryt
    const p2 = placeNew('bod', [O[0] + 20, O[1] + 5, 0]); placements.push(p2); placeTouch(p2); l3AddPlacementMesh(p2); await l3edStart(p2); const n2 = placements.length; l3edCancel(); r.cancel = placements.some(q => q.id === p2.id) && !l3ed.on && !placements.some(q => q.eg && q.eg.startsWith('ed') && q.m && l3ed.on);
    return r;
  });
  console.log(JSON.stringify(o));
  ok(o.side && o.on && o.n > 20 && o.origGone && o.bar && o.triSame, 'Start: ' + JSON.stringify(o));
  ok(o.after === o.n - 3 && o.withNew === o.n - 2, 'Ta bort och lägg till: ' + JSON.stringify(o));
  ok(o.saved && o.off && o.model && o.pieces === 0 && o.lib && o.tris > 100, 'Spara som nytt objekt: ' + JSON.stringify(o));
  ok(o.cancel, 'Avbryt lägger tillbaka originalet');
  ok(!errors.length, 'JS-fel: ' + errors.join('|'));
  console.log('OK: redigera objekt – dela upp, ta bort, lägg till, spara som nytt bibliotekobjekt, avbryt');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
