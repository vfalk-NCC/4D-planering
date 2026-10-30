const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9051;
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
  const lo = r.lo;
  // Mät → Volym: området 10 x 10 m (hörn i scenens koordinater), via verktygets egen väg.
  await page.evaluate(lo => { l3SetPref('measure', 'volume'); l3SetTool('measure'); const O = l3.O; l3t.mp = [[8, 8], [18, 8], [18, 18], [8, 18]].map(([x, y]) => new THREE.Vector3(lo[0] + x - O[0], lo[1] + y - O[1], lo[2] + 2 - O[2])); l3t.mpObjs = []; l3VolBase(); }, lo);
  await page.waitForSelector('#v3VolPanel'); await page.waitForFunction(() => l3vol.cur && l3vol.cur.res, null, { timeout: 15000 });
  const d = await page.evaluate(() => ({ a: l3vol.cur.spec.a.k, b: l3vol.cur.spec.b.k, res: l3vol.cur.res, solids: !!(l3vol.cur.geom && (l3vol.cur.geom.cut || l3vol.cur.geom.fill)) }));
  console.log('default', JSON.stringify({ a: d.a, b: d.b, fill: d.res.fill, cut: d.res.cut, area: d.res.area, cell: d.res.cell }));
  // Moln (platå 1,5 över underkanten) mot modellens ovansida (2,0): molnet ligger 0,5 m LÄGRE → schakt 10*10*0,5 = 50 m³.
  const setSel = async (key, v) => { await page.selectOption(`select[data-vk="${key}"]`, v); await page.waitForFunction(() => l3vol.cur && !l3vol.cur.busy && l3vol.cur.res, null, { timeout: 15000 }); await page.waitForTimeout(350); };
  await setSel('a', 'pc:pcA'); await setSel('b', 'md:vm');
  let q = await page.evaluate(() => ({ cut: l3vol.cur.res.cut, fill: l3vol.cur.res.fill, net: l3vol.cur.res.net }));
  if (Math.abs(q.cut - 50) > 2 || q.fill > 1) fail('Moln mot modell: schakt ≈ 50 m³: ' + JSON.stringify(q));
  // Modell mot nivå 0: platta 2 m hög → fyllning 200 m³. Nivå 3 → schakt 100 m³.
  await setSel('a', 'md:vm'); await setSel('b', 'level');
  await page.fill('input[data-vz="b"]', '0'); await page.dispatchEvent('input[data-vz="b"]', 'change'); await page.waitForTimeout(500); await page.waitForFunction(() => l3vol.cur && !l3vol.cur.busy && l3vol.cur.res, null, { timeout: 15000 });
  q = await page.evaluate(() => ({ cut: l3vol.cur.res.cut, fill: l3vol.cur.res.fill, z: l3vol.cur.spec.b.z, bz: l3vol.cur.pts[0][2] }));
  if (Math.abs(q.fill - 200) > 3 || q.cut > 1) fail('Modell mot nivå 0 (relativt ' + q.z + '): fyllning ≈ 200 m³ (z0 ' + q.bz + '): ' + JSON.stringify(q));
  await page.fill('input[data-vz="b"]', String(lo[2] + 3 + 0)); await page.dispatchEvent('input[data-vz="b"]', 'change'); await page.waitForTimeout(500); await page.waitForFunction(() => l3vol.cur && !l3vol.cur.busy && l3vol.cur.res, null, { timeout: 15000 });
  q = await page.evaluate(() => ({ cut: l3vol.cur.res.cut, fill: l3vol.cur.res.fill }));
  if (Math.abs(q.cut - 100) > 3 || q.fill > 1) fail('Modell mot nivå +3: schakt ≈ 100 m³: ' + JSON.stringify(q));
  console.log('OK: volymer mot moln, modell och nivå', JSON.stringify(q));
  await page.screenshot({ path: '/tmp/vol1.png' });
  // Spara som mått, räkna om från sparat, exportera IFC (hämtas utan Trimble Connect).
  await page.click('[data-vb="save"]'); await page.waitForTimeout(400);
  const sv = await page.evaluate(() => { const m = l3m.list.find(x => x.kind === 'cutfill'); return m ? { text: m.text, n: l3m.list.length, geom: l3vol.geoms.has(m), panel: !!document.getElementById('v3VolPanel'), rows: l3mInfo(m).rows.map(x => x[0]).join(',') } : null; });
  if (!sv || !/Schakt −100 m³/.test(sv.text) || !sv.geom || sv.panel) fail('Sparat mått: ' + JSON.stringify(sv));
  const ifc = await page.evaluate(async () => { const m = l3m.list.find(x => x.kind === 'cutfill'); const parts = l3volIfcParts(m).map(p => [p.kind, p.g.pts.length, p.g.tris.length]); const r = l3mIfcBuild([{ m, nr: 1 }], true); return { parts, len: r.text.length, tri: (r.text.match(/IFCTRIANGULATEDFACESET/g) || []).length, schakt: /Schakt [^']*100 m/.test(r.text), skylt: (r.text.match(/4D-m[^']{1,12}ttskylt/g) || []).length, proxies: (r.text.match(/4D-volym-schakt/g) || []).length }; });
  if (!ifc.parts.length || ifc.tri < 2 || !ifc.schakt || ifc.proxies < 1 || ifc.skylt < 1) fail('IFC: ' + JSON.stringify(ifc));
  const noTxt = await page.evaluate(() => { l3SetPref('volExpText', false); const m = l3m.list.find(x => x.kind === 'cutfill'); const r = l3mIfcBuild([{ m, nr: 1 }], false); l3SetPref('volExpText', true); return { skylt: (r.text.match(/4D-m[^']{1,12}ttskylt/g) || []).length, solids: (r.text.match(/4D-volym-schakt/g) || []).length }; });
  if (noTxt.skylt || !noTxt.solids) fail('Utan volymtext: ingen skylt men kropparna kvar: ' + JSON.stringify(noTxt));
  // Egen yta: klicka ut en sluttande yta (0 m i söder, 4 m i norr) och mät modellens ovansida (2 m) mot den → schakt ≈ 50, fyllning ≈ 50.
  await page.evaluate(lo => { const m = l3m.list.find(x => x.kind === 'cutfill'); l3volEdit(m); }, lo);
  await page.waitForSelector('#v3VolPanel [data-vb="surf"]');
  await page.click('#v3VolPanel [data-vb="surf"]');
  await page.evaluate(lo => { const O = l3.O; l3t.mp = [[8, 8, 0], [18, 8, 0], [18, 18, 4], [8, 18, 4]].map(([x, y, z]) => new THREE.Vector3(lo[0] + x - O[0], lo[1] + y - O[1], lo[2] + z - O[2])); l3t.mpObjs = []; l3VolBase(); }, lo);
  await page.waitForFunction(() => l3vol.cur && l3vol.cur.spec.b.k === 'surf' && !l3vol.cur.busy && l3vol.cur.res, null, { timeout: 15000 }); await page.waitForTimeout(400);
  q = await page.evaluate(() => ({ cut: l3vol.cur.res.cut, fill: l3vol.cur.res.fill, label: l3volLabel(l3vol.cur, l3vol.cur.spec.b), id: l3vol.cur.id }));
  if (Math.abs(q.cut - 50) > 3 || Math.abs(q.fill - 50) > 3) fail('Egen yta: schakt och fyllning ≈ 50 m³: ' + JSON.stringify(q));
  await page.screenshot({ path: '/tmp/vol3.png' });
  await page.click('[data-vb="save"]'); await page.waitForTimeout(300);
  const ed = await page.evaluate(() => { const l = l3m.list.filter(x => x.kind === 'cutfill'); const m = l[0]; let ser = true; try { JSON.stringify(m); } catch (e) { ser = false; } return { n: l.length, text: m.text, hid: !!m.hid, ser, surf: !!(m.vol && m.vol.surf), json: JSON.stringify(m).length, pan: !!document.getElementById('v3VolPanel') }; });
  if (ed.n !== 1 || ed.hid || !ed.ser || !ed.surf || ed.pan || !/Schakt −5\d m³/.test(ed.text)) fail('Ändrat mått uppdateras (inte ett nytt): ' + JSON.stringify(ed));
  // Sparat mått efter inläsning: kropparna räknas om i bakgrunden.
  const rc = await page.evaluate(async () => { const m = l3m.list.find(x => x.kind === 'cutfill'); l3vol.geoms.delete(m); l3mDraw(); await new Promise(r => setTimeout(r, 2500)); return { has: l3vol.geoms.has(m), labs: [...l3m.labels.keys()].filter(k => k.startsWith(m.id)).length }; });
  if (!rc.has || rc.labs < 3) fail('Sparat mått räknas om och ritas med etiketter: ' + JSON.stringify(rc));
  console.log('OK: egen yta, ändra sparat mått, omräkning efter inläsning', JSON.stringify(q));
  await page.evaluate(() => Object.defineProperty(window, 'opener', { value: null, configurable: true }));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => l3mExportIfc([l3m.list.find(x => x.kind === 'cutfill').id]))]);
  console.log('OK: sparat mått och IFC (' + ifc.len + ' tecken, nedladdning ' + dl.suggestedFilename() + ')', JSON.stringify(ifc.parts));
  await page.screenshot({ path: '/tmp/vol2.png' });
  if (errors.length) fail('sidfel: ' + errors.slice(0, 3).join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
