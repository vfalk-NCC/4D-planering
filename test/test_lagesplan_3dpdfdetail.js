// Saxen i 3D (dragbart handtag, snittkanter, släpps vid verktygsbyte), fäst mot DXF (3D först),
// DXF-texter i 3D och egna kortkommandon i snabbsöket (Victor 2026-10-10).
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9041;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
// pako (komprimering av CAD-geometrin): en enkel ersättare – testet läser aldrig tillbaka filen.
const PAKO = `window.pako = { gzip: s => new TextEncoder().encode(String(s)), ungzip: (u, o) => new TextDecoder().decode(u) };`;
const DXF = n => ['0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '8', n, '10', '6512340', '20', '150110', '11', '6512345', '21', '150110', '0', 'ENDSEC', '0', 'EOF', ''].join('\n');

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('lagesplan-3d-prefs', JSON.stringify({ plan: true })); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: /pako/.test(r.request().url()) ? PAKO : PDFJS }));
  const gh = new Map();
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
    const body = JSON.parse(req.postData() || '{}'); gh.set(f, Buffer.from(body.content || '', 'base64').toString());
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async grund => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    // En inlagd DXF (Utsättning) med två CAD-lager, i modellens koordinater.
    const rec = { id: 'c1', type: 'cad', name: 'Utsättning', path: 'x', colorMode: 'orig', weight: 1, layers: [{ name: 'AXLAR', color: '#ff0000', n: 1 }, { name: 'MÅTT', color: '#0000ff', n: 1 }], stats: { lines: 2, texts: 0, kb: 1 } };
    siteItems.push(rec); ls('cad:c1').visible = true;
    cadGeom.set('c1', buildCadGeom({ origin: [6512350, 150120], groups: [{ l: 0, c: '#ff0000', p: [[0, 0, 10000, 0, 10000, 5000]], t: [[2000, 2000, 500, 0, 'A12', 'lb'], [4000, 2000, 500, 90, 'K10\nFUND', 'cm']] }, { l: 1, c: '#0000ff', p: [[0, 1000, 2000, 1000]], t: [] }] }));
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    window.__calls = [];
    askOpener = async (type, extra) => {
      window.__calls.push([type, extra && (extra.fileId || extra.folderId) || null]);
      if (type === 'tcFolder' && !extra.folderId) return { folderId: 'root', projectName: 'Kvarteret', items: [{ id: 'f1', name: 'CAD', type: 'folder' }] };
      if (type === 'tcFolder' && extra.folderId === 'f1') return { folderId: 'f1', items: [{ id: 'D1', name: 'Grund.dxf', type: 'file', size: 300 }, { id: 'P1', name: 'Plan.pdf', type: 'file', size: 10 }] };
      if (type === 'tcFile' && extra.fileId === 'D1') return { bytes: new TextEncoder().encode(grund).buffer };
      if (type === 'tcUpload') { window.__calls.push(['upload', extra.files.map(f => f.name).join()]); return { uploaded: 1 }; }
      return {};
    };
  }, DXF('GRUND'));
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  // Skarp ritning i 3D: basbilden större än förut och en skarp detalj när man zoomat in (Victor 2026-11-02)
  const r = await page.evaluate(async () => {
    const o = {}; await new Promise(r => setTimeout(r, 600)); const pm = l3.planMesh; o.has = !!pm; if (!pm) return o;
    o.baseW = pm.material.map.image.width; o.aniso = pm.material.map.anisotropy;
    // rakt uppifrån, nära marken: detaljbilden ska skapas
    const c = new THREE.Vector3(); new THREE.Box3().setFromObject(pm).getCenter(c); l3.orbit.target.copy(c); l3.camera.position.set(c.x, c.y - 0.2, c.z + 3); l3.camera.lookAt(c); l3.orbit.update(); l3.camera.updateMatrixWorld(true); l3.orbit.dispatchEvent({ type: 'change' });
    await new Promise(r => setTimeout(r, 1400)); o.dbg = { page: !!page, lowMem: typeof lowMemDevice !== 'undefined' && lowMemDevice, vis: pm.visible, view: page && page.view, busy: l3pd.busy, have: l3pd.have, dirz: l3.camera.getWorldDirection(new THREE.Vector3()).z }; await l3pdRender(); const d = pm.userData.detail; o.detail = !!d && d.visible !== false; o.detW = d && d.material.map.image.width; o.sharper = !!d && (d.material.map.image.width / (d.geometry.boundingBox ? 1 : 1)) > 0;
    // långt bort: detaljen släcks
    l3.camera.position.set(c.x, c.y - 0.5, c.z + 4000); l3.camera.lookAt(c); l3.orbit.update(); l3.camera.updateMatrixWorld(true); l3.orbit.dispatchEvent({ type: 'change' }); await new Promise(r => setTimeout(r, 1000)); o.hidden = !pm.userData.detail || pm.userData.detail.visible === false;
    return o;
  });
  if (!r.has || r.baseW < 4096 || !(r.aniso >= 4) || !r.detail || !r.detW || !r.hidden) fail('Skarp ritning i 3D: ' + JSON.stringify(r));
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3dpdfdetail', JSON.stringify(r));
  await browser.close(); server.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
