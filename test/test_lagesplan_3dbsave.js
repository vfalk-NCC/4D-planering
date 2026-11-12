const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9077;
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
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A');
  });
  await page.click('#btn3d');
  const r = await page.evaluate(async () => {
    const out = {}; out.tok = typeof token !== 'undefined' && !!token; out.pid = typeof projectId !== 'undefined' && projectId;
    const store = {}; window.ghReadJSON = async (t, p) => JSON.parse(JSON.stringify(store[p] || [])); window.ghWriteJSON = async (t, p, fn) => (store[p] = fn(JSON.parse(JSON.stringify(store[p] || []))));
    const build = () => {
      const P = [0,0,0, 1,0,0, 1,1,0, 0,1,0, 0,0,1, 1,0,1, 1,1,1, 0,1,1], idx = [0,2,1,0,3,2, 4,5,6,4,6,7, 0,1,5,0,5,4, 1,2,6,1,6,5, 2,3,7,2,7,6, 3,0,4,3,4,7];
      const pos = new Float32Array(P), col = new Uint8Array(P.length).fill(160), ranges = [{ start: 0, count: 8, idxStart: 0, idxCount: idx.length, guid: 'BOX1', name: 'Låda' }];
      const model = { id: 'mdl', name: 'M', meshes: [], ranges: [], visible: true, tris: 0 }; l3b.models.push(model);
      const mesh = l3bMeshFromArrays(pos, col, new Uint32Array(idx), ranges, model); model.meshes.push(mesh); model.ranges.push(...mesh.userData.l3b.ranges); l3.groups.bldg.add(mesh); mesh.updateMatrixWorld(true);
      return { model, mesh };
    };
    let { model, mesh } = build();
    const O = new THREE.Matrix4().makeTranslation(l3.O[0], l3.O[1], l3.O[2]), Oi = O.clone().invert();
    const mv = (x, y) => { const D = new THREE.Matrix4().makeTranslation(x, y, 0), Dg = O.clone().multiply(D).multiply(Oi); return [D, Dg]; };
    let [D, Dg] = mv(5, 0, 0); l3bmCopyAccept([{ mesh, ri: 0 }], D, Dg);          // kopia 5 m åt sidan
    [D, Dg] = mv(0, 3); l3bmApplyDelta([{ mesh, ri: 0 }], D, Dg);                 // originalet flyttas
    await new Promise(r => setTimeout(r, 1800));
    const rec = (store['projects/' + encodeURIComponent(projectId) + '/plan_ifcedits.json'] || [])[0];
    out.saved = !!rec && Object.keys(rec.copies).length === 1 && Object.keys(rec.moves).length === 1 && rec.k === 'mdl';
    const cg = rec && Object.keys(rec.copies)[0];
    // "ny användare": rensa allt och läs in modellen igen
    l3b.models.splice(0).forEach(m => m.meshes.forEach(x => x.parent && x.parent.remove(x))); l3bm.edits.clear(); l3bv.recs = null; l3bv.loading = null; l3bv.done = new Set();
    ({ model, mesh } = build()); await l3bvApply();
    out.models = l3b.models.length; out.meshes = model.meshes.length;
    const ed = l3bm.edits.get('mdl'); out.ed = !!ed && ed.copies.size === 1 && ed.moves.size === 1 && ed.copies.has(cg);
    const bb = new THREE.Box3(); model.meshes.forEach(m => { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld); bb.union(b); });
    const c = model.meshes.map(m => { m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld), v = new THREE.Vector3(); return b.getCenter(v).toArray().map(x => Math.round(x * 10) / 10); });
    out.centers = c;
    return out;
  });
  console.log(JSON.stringify(r));
  const near = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 0.15);
  if (!r.tok || !r.saved || r.meshes !== 2 || !r.ed) fail('IFC-ändringar delas: ' + JSON.stringify(r));
  const orig = r.centers.find(c => near(c, [0.5, 3.5, 0.5])), cp = r.centers.find(c => near(c, [5.5, 0.5, 0.5]));
  if (!orig || !cp) fail('Flytt och kopia ska ligga rätt efter återläsning: ' + JSON.stringify(r.centers));
  await browser.close(); server.close(); console.log('OK: IFC-flyttar och kopior sparas i projektet och läggs tillbaka');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
