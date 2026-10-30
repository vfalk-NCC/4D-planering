const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9084;
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
    // Modell: en platta 0..30 x 0..30, överkant z = 2 (som en grundplatta / projekterad yta).
    const cube = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]], tri = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
    const pos = new Float32Array(24 * 3), col = new Uint8Array(24 * 3), idx = new Uint32Array(36), ranges = [];
    for (let v = 0; v < 8; v++) { const o = v * 3; pos[o] = cube[v][0] * 30; pos[o + 1] = cube[v][1] * 30; pos[o + 2] = cube[v][2] * 2; col[o] = col[o + 1] = col[o + 2] = 200; }
    for (let t = 0; t < 36; t++) idx[t] = tri[t];
    ranges.push({ start: 0, count: 8, idxStart: 0, idxCount: 36, guid: 'g0', name: 'Platta', cls: 'IFCSLAB', base: [0.8, 0.8, 0.8] });
    const m = { id: 'vm', name: 'Platta', visible: true, meshes: [], ranges, tris: 12, O: [0, 0, 0], src: { id: 'vm', version: 'v1' } };
    const mesh = l3bMeshFromArrays(pos, col, idx, ranges, m, null); m.meshes.push(mesh); l3.groups.bldg.add(mesh); l3b.models.push(m); l3bPosition();
    mesh.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(mesh), lo = bb.min.clone().add(new THREE.Vector3(l3.O[0], l3.O[1], l3.O[2]));
    // Punktmoln: platå z = lo.z + 1.5 över hela ytan (tät rutnät), i molnets egna koordinater runt mitten.
    const c0 = [lo.x + 15, lo.y + 15, lo.z + 1.5], P = [];
    for (let y = -15; y <= 15; y += 0.25) for (let x = -15; x <= 15; x += 0.25) P.push(x, y, 0);
    l3pc.clouds.push({ id: 'pcA', name: 'Moln A', visible: false, dz: 0, nTot: P.length / 3, info: { center: c0, min: [lo.x, lo.y, c0[2]], max: [lo.x + 30, lo.y + 30, c0[2]] }, chunks: [{ pos: new Float32Array(P) }] });
    window.__lo = [lo.x, lo.y, lo.z];
    const c = l3.camera, ce = bb.getCenter(new THREE.Vector3()); l3.orbit.target.copy(ce); c.position.set(ce.x + 25, ce.y - 30, ce.z + 22); c.lookAt(ce); c.updateMatrixWorld(); l3.orbit.update(); l3Render();
    return { lo: window.__lo };
  });
  const ok = (c, m) => { if (!c) fail(m); };
  const o = await page.evaluate(async () => {
    const out = {}; try { l3anOpen('take'); await l3anTakeRun(); out.take = l3an.takeRows.map(x => [x.k, x.n, Math.round(x.vol)]);
    // Massegenskaper: markera plattan
    const m = l3b.models[0], mesh = m.meshes[0]; l3bsSet([{ mesh, ri: 0 }]); const S = l3anSelection(), st = l3anStats(S[0].tris); out.mass = [Math.round(st.vol), Math.round(st.area)];
    // Smart markering
    l3bsSet([]); out.found = l3anFind({ cls: 'IFCSLAB', name: 'plat', minSize: 5 }).length; out.none = l3anFind({ cls: 'IFCWALL' }).length;
    // Fria avstånd: plattan mot en liten kub 3 m ovanför
    const T = []; const cube = (x, y, z, s) => { const c = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]].map(v => [x + v[0] * s, y + v[1] * s, z + v[2] * s]), f = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]; for (const i of f) T.push(c[i]); return T; };
    const A = S[0].tris, bb = new THREE.Box3().setFromObject(mesh), B = cube(bb.min.x + 10, bb.min.y + 10, bb.max.z + 3, 1); const r = l3anMinDist(A, B); out.dist = Math.round(r.d * 1000) / 1000;
    // Jämför: dubblera modellen, flytta kopian
    const m2 = { ...m, id: 'vm2', name: 'Platta v2', meshes: [] }; const mesh2 = new THREE.Mesh(mesh.geometry, mesh.material); mesh2.userData = { ...mesh.userData, l3b: { ...mesh.userData.l3b, model: m2, ranges: mesh.userData.l3b.ranges.map(r => ({ ...r })) } }; mesh2.position.copy(mesh.position); mesh2.position.x += 1; m2.meshes.push(mesh2); l3.groups.bldg.add(mesh2); l3b.models.push(m2);
    mesh2.userData.l3b.ranges.push({ start: 0, count: 8, idxStart: 0, idxCount: 36, guid: 'g1', name: 'Ny', cls: 'IFCWALL' });
    const SA = l3anCmpStats(m), SB = l3anCmpStats(m2); out.cmp = [SA.size, SB.size, [...SB.keys()].filter(k => !SA.has(k)).length, (() => { const a = SA.get('g0'), b = SB.get('g0'); return Math.round(Math.abs(b.b[0] - a.b[0]) * 100) / 100; })()];
    // Lutning över punktmolnet
    l3an.slopeKey = 'pc:pcA'; l3an.slopeSpan = 50; await l3anSlopeRun(); out.slope = l3an.slopeRes && [Math.round(l3an.slopeRes.tot), Math.round(l3an.slopeRes.area[0]), Math.round(l3an.slopeRes.max)];
    // flikarna renderas
    out.tabs = []; for (const [k] of L3AN_TABS) { l3anOpen(k); out.tabs.push(!!document.querySelector('#v3AnPanel .v3-an-tabs')); }
    } catch (e) { out.err = String(e && e.message) + ' ' + String(e && e.stack).split('\n').slice(0, 4).join(' | '); }
    return out;
  });
  console.log(JSON.stringify(o));
  ok(o.take.some(r => /Platta/.test(r[0]) && Math.abs(r[2] - 1800) < 2), 'Mängdning platta 1800 m³: ' + JSON.stringify(o.take));
  ok(o.mass[0] === 1800 && o.mass[1] === 2*900 + 4*60, 'Massa: ' + JSON.stringify(o.mass));
  ok(o.found === 1 && o.none === 0, 'Smart markering: ' + o.found + '/' + o.none);
  ok(Math.abs(o.dist - 3) < 0.05, 'Fritt avstånd 3 m: ' + o.dist);
  ok(o.cmp[0] === 1 && o.cmp[1] === 2 && o.cmp[2] === 1 && Math.abs(o.cmp[3] - 1) < 0.01, 'Jämför: ' + JSON.stringify(o.cmp));
  ok(o.slope && o.slope[2] <= 5 && o.slope[1] > 0, 'Lutning på platt moln: ' + JSON.stringify(o.slope));
  ok(o.tabs.every(Boolean), 'Alla flikar öppnas');
  ok(!errors.length, 'JS-fel: ' + errors.join(' | '));
  console.log('OK: analys – mängdning, massa, smart markering, fria avstånd, jämför, lutning');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
