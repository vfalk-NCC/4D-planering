const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9033;
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
    // Två lådor: en stor (10 m) och en liten (0,3 m); ranges med indexpositioner som från arbetstråden.
    const cube = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
    const tri = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
    const sizes = [10, 0.3, 0.3, 8, 0.2, 0.2], n = sizes.length, pos = new Float32Array(n * 24), col = new Uint8Array(n * 24), idx = new Uint32Array(n * 36), ranges = [];
    sizes.forEach((sz, b) => { for (let v = 0; v < 8; v++) { const o = (b * 8 + v) * 3; pos[o] = b * 20 + cube[v][0] * sz; pos[o + 1] = cube[v][1] * sz; pos[o + 2] = cube[v][2] * sz; col[o] = col[o + 1] = col[o + 2] = 200; }
      for (let t = 0; t < 36; t++) idx[b * 36 + t] = b * 8 + tri[t];
      ranges.push({ start: b * 8, count: 8, idxStart: b * 36, idxCount: 36, guid: 'g' + b, name: 'O' + b, cls: 'IFCBEAM', base: [0.8, 0.8, 0.8] }); });
    const m = { id: 'lodt', name: 'L', visible: true, meshes: [], ranges, tris: n * 12, O: [0, 0, 0], src: { id: 'lodt', version: 'v1' } };
    const mesh = l3bMeshFromArrays(pos, col, idx, ranges, m, null); m.meshes.push(mesh); l3.groups.bldg.add(mesh); l3b.models.push(m); l3bPosition();
    const out = { full: mesh.geometry.index.count / 3 };
    l3lodApply(0); out.l0 = mesh.geometry.index.count / 3;          // >= 0,35 m: allt utom de två minsta
    l3lodApply(1); out.l1 = mesh.geometry.index.count / 3;          // >= 1,5 m: de två stora
    l3lodApply(2); out.l2 = mesh.geometry.index.count / 3;          // >= 6 m: 10 m och 8 m
    l3lodApply(-1); out.back = mesh.geometry.index.count / 3; out.sameIdx = mesh.geometry.index === mesh.geometry.index;
    // Träff återställer biten (BVH bygger på fulla listan)
    await new Promise(r => setTimeout(r, 400));
    l3lodApply(2); const during = mesh.userData.l3b.lodOn;
    const rc = new THREE.Raycaster(new THREE.Vector3(-5, 5, 5), new THREE.Vector3(1, 0, 0)); rc.intersectObject(mesh); out.hitRestores = during && !mesh.userData.l3b.lodOn && mesh.geometry.index.count / 3 === out.full;
    // Dölj ett objekt: listorna räknas om, bitens index följer det dolda
    l3lodApply(1); mesh.userData.l3b.hidden.add(0); l3bApplyHidden(mesh); out.afterHide = mesh.geometry.index.count / 3; out.lodOffAfterHide = !mesh.userData.l3b.lodOn;
    l3lodApply(-1); l3lodApply(1); out.l1AfterHide = mesh.geometry.index.count / 3;   // 10 m-lådan dold: bara 8 m kvar (1,5 m-nivån)
    l3lodApply(-1);
    out.pick = l3lodPick();   // under 0,8 milj. trianglar: alltid -1
    return out;
  });
  if (r.full !== 72 || r.l0 !== 48 || r.l1 !== 24 || r.l2 !== 24 || r.back !== 72) fail('Nivåer: ' + JSON.stringify(r));
  if (!r.hitRestores) fail('Träff ska återställa den fulla indexlistan: ' + JSON.stringify(r));
  if (r.afterHide !== 60 || !r.lodOffAfterHide || r.l1AfterHide !== 12 || r.pick !== -1) fail('Dölj + nivåer: ' + JSON.stringify(r));
  if (errors.length) fail('sidfel: ' + errors.slice(0, 3).join(' | '));
  console.log('OK test_lagesplan_3dlod – förenklad bild: nivåer, återställning vid träff och dolda objekt', JSON.stringify(r));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
