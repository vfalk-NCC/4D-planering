const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9353;
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
  if (process.env.SHOT) { await page.waitForTimeout(500); await page.screenshot({ path: process.env.SHOT }); }
  console.log('default', JSON.stringify({ a: d.a, b: d.b, fill: d.res.fill, cut: d.res.cut, area: d.res.area, cell: d.res.cell }));
  // Fyll till plushöjd: skriv en höjd i panelen – nivån blir "Yta som mäts", punktmolnet "Mot"; fyllning = nivån minus molnet (platå 1,5 m över modellens underkant).
  await page.evaluate(() => { l3pc.clouds.find(c => c.id === 'pcA').visible = true; });
  const z0 = await page.evaluate(() => window.__lo[2]);
  await page.fill('input[data-vlv]', String(z0 + 3.5).replace('.', ',')); await page.click('[data-vb="lvl"]'); await page.evaluate(() => { l3vol.cur.spec.keepMode = 'top'; l3volSchedule(0); }); await page.waitForTimeout(400);
  await page.waitForFunction(() => l3vol.cur && l3vol.cur.spec.a.k === 'level' && !l3vol.cur.busy && l3vol.cur.res, null, { timeout: 20000 }); await page.waitForTimeout(400);
  const f = await page.evaluate(() => ({ a: l3vol.cur.spec.a, b: l3vol.cur.spec.b.k, fill: l3vol.cur.res.fill, cut: l3vol.cur.res.cut, area: l3vol.cur.res.area, txt: (document.querySelector('.v3-vq-lvlres') || {}).textContent || '' }));
  console.log(JSON.stringify(f));
  const exp = f.area * 2.0;   // (modellplattan ingår i nästa kontroll)   // 3,5 − 1,5 m över hela området
  if (f.b !== 'pc:pcA' || f.a.k !== 'level') fail('Plushöjd: nivå mot punktmolnet: ' + JSON.stringify(f));
  if (f.cut > 1 || f.fill > exp * 1.03 || f.fill < exp * 0.6) fail('Plushöjd: fyllning ' + f.fill + ' ≠ ' + exp);
  if (!/Fyllning/.test(f.txt)) fail('Plushöjd: resultatrad saknas: ' + f.txt);
  // Objekt som står kvar: modellplattan (0–2 m, står på marken, överkant 0,5 m över molnet) räknas som mark → fyllningen blir 1,5 m i stället för 2,0 m.
  await page.evaluate(() => { l3vol.cur.spec.keepMode = 'top'; l3volSchedule(0); }); await page.waitForTimeout(300); await page.waitForFunction(() => l3vol.cur && !l3vol.cur.busy && l3vol.cur.res && l3vol.cur.res.keep, null, { timeout: 20000 });
  const k0 = await page.evaluate(() => l3vol.cur.spec.keep);
  if (k0 !== true) fail('Plushöjd slår på "objekt står kvar": ' + k0);
  const withKeep = await page.evaluate(() => ({ fill: l3vol.cur.res.fill, keep: l3vol.cur.res.keep }));
  await page.evaluate(() => { l3vol.cur.spec.keep = false; l3volSchedule(0); });
  await page.waitForFunction(() => l3vol.cur && !l3vol.cur.busy && l3vol.cur.res && !l3vol.cur.res.keep, null, { timeout: 20000 }); await page.waitForTimeout(300);
  const noKeep = await page.evaluate(() => l3vol.cur.res.fill);
  console.log(JSON.stringify({ withKeep, noKeep }));
  if (Math.abs(noKeep - exp) > exp * 0.03) fail('Utan objekt: fyllning ' + noKeep + ' ≠ ' + exp);
  if (!(withKeep.keep && withKeep.keep.models === 1) || Math.abs(withKeep.fill - f.area * 1.5) > f.area * 1.5 * 0.05) fail('Objekt som står kvar räknas bort (plattan: 3,5−2,0 = 1,5 m): ' + JSON.stringify(withKeep));
  const cf0 = await page.evaluate(() => { l3vol.cur.spec.keep = true; return l3vol.cur.res.cellsFill; });
  // Hål ända upp: modellplattan täcker hela området och fortsätter upp genom fyllningen → ingen fyllning kvar
  await page.evaluate(() => { l3vol.cur.spec.keepMode = 'up'; l3volSchedule(0); }); await page.waitForTimeout(300); await page.waitForFunction(() => l3vol.cur && !l3vol.cur.busy && l3vol.cur.res && l3vol.cur.res.keep, null, { timeout: 20000 });
  const upFill = await page.evaluate(() => l3vol.cur.res.fill); if (upFill > 1) fail('Hål ända upp: plattan tar bort hela fyllningen: ' + upFill);
  await page.evaluate(() => { l3vol.cur.spec.keepMode = 'top'; l3volSchedule(0); }); await page.waitForTimeout(300); await page.waitForFunction(() => l3vol.cur && !l3vol.cur.busy && l3vol.cur.res && l3vol.cur.res.keep && l3vol.cur.res.fill > 100, null, { timeout: 20000 });
  // Placerat objekt (4 × 4 m låda som sticker upp över nivån) tar bort sin ruta: fyllning = (100 − 16) × 1,5
  await page.evaluate(() => { const lo = window.__lo, O = l3.O, q = placeNew('lada', [lo[0] + 13, lo[1] + 13, 0]); q.L = 4; q.B = 4; q.H = 4; q.z = lo[2] + 1.5; placements.push(q); placeTouch(q); l3RebuildOne(q); l3vol.cur.spec.keep = true; l3volSchedule(0); });
  await page.waitForFunction(() => l3vol.cur && !l3vol.cur.busy && l3vol.cur.res && l3vol.cur.res.keep && l3vol.cur.res.keep.objs >= 1, null, { timeout: 20000 }); await page.waitForTimeout(300);
  const withBox = await page.evaluate(() => l3vol.cur.res.fill), cf1 = await page.evaluate(() => l3vol.cur.res.cellsFill); if (!(cf1 < cf0 * 0.95)) fail('Solidens fyllningstrianglar minskar där objektet står: ' + cf0 + ' → ' + cf1); console.log('box', withBox);
  const inside = await page.evaluate(() => { const G = l3vol.cur.geom, S = G.fill, lo = window.__lo, O = l3.O; let n = 0, tot = S.pos.length / 3;   // fyllningssolidens hörn inne i lådans fotavtryck (4 × 4 m kring lo+13)
    for (let i = 0; i < S.pos.length; i += 3) { const x = S.pos[i] + G.o[0], y = S.pos[i + 1] + G.o[1]; if (Math.abs(x - (lo[0] + 13)) < 1.5 && Math.abs(y - (lo[1] + 13)) < 1.5) n++; } return { n, tot }; });
  if (inside.n > 0) fail('Soliden har hål där objektet står (inga hörn i fotavtrycket): ' + JSON.stringify(inside));
  if (Math.abs(withBox - 84 * 1.5) > 84 * 1.5 * 0.08) fail('Placerad låda tar bort sin yta: ' + withBox + ' ≠ ' + 84 * 1.5);
  // Exakt kapning (läget Hål ända upp): utan modellplattan tar lådan (4 × 4 m) exakt sin yta – fyllning (100 − 16) × 2,0 m, inte rutvis, och TIN fungerar
  await page.evaluate(() => { l3b.models.forEach(m => { m.visible = false; m.meshes.forEach(x => { x.visible = false; }); }); const c = l3vol.cur; c.spec.keepMode = 'up'; c.spec.tin = false; c.spec.cell = 1; l3volSchedule(0); });
  await page.waitForTimeout(400); await page.waitForFunction(() => l3vol.cur && !l3vol.cur.busy && l3vol.cur.res && l3vol.cur.res.cell === 1 && l3vol.cur.res.keep && l3vol.cur.res.keep.models === 0, null, { timeout: 25000 }); await page.waitForTimeout(300);
  const ex = await page.evaluate(() => { const r = l3vol.cur.res, G = l3vol.cur.geom, S = G.fill, lo = window.__lo; let inn = 0, onEdge = 0; for (let i = 0; i < S.pos.length; i += 3) { const x = S.pos[i] + G.o[0] - lo[0], y = S.pos[i + 1] + G.o[1] - lo[1]; if (x > 11.2 && x < 14.8 && y > 11.2 && y < 14.8) inn++; if (Math.abs(x - 11) < 0.05 || Math.abs(x - 15) < 0.05) onEdge++; } return { fill: r.fill, keep: r.keep, inn, onEdge }; });
  console.log('exakt', JSON.stringify(ex));
  if (Math.abs(ex.fill - 84 * 2) > 84 * 2 * 0.01) fail('Exakt kapning: fyllning ' + ex.fill + ' ≠ ' + 168);
  if (ex.inn > 0 || ex.onEdge < 8) fail('Soliden har ett exakt hål med kanter på lådans gräns: ' + JSON.stringify(ex));
  // Fickor (läget Exakt): lådans underkant 0,5 m ovanför marken → bara de 1,5 m som lådan fyller (2,0–3,5) tas bort; under den finns 0,5 m fyllning kvar
  await page.evaluate(() => { const q = placements.find(p => p.type === 'lada'), lo = window.__lo; q.z = lo[2] + 2.0; placeTouch(q); l3RebuildOne(q); const c = l3vol.cur; c.spec.keepMode = 'pocket'; c.spec.tin = false; c.spec.cell = 1; l3volSchedule(0); });
  await page.waitForTimeout(500); await page.waitForFunction(() => l3vol.cur && !l3vol.cur.busy && l3vol.cur.res && l3vol.cur.res.cell === 1 && l3vol.cur.spec.keepMode === 'pocket', null, { timeout: 25000 }); await page.waitForTimeout(500);
  const pk = await page.evaluate(() => ({ fill: l3vol.cur.res.fill, tris: l3vol.cur.res.cellsFill, kid: l3vol.cur.geom.fill.pos.length })); console.log('ficka', JSON.stringify(pk));
  if (Math.abs(pk.fill - (84 * 2 + 16 * 0.5)) > 176 * 0.015) fail('Ficka: fyllning ' + pk.fill + ' ≠ 176 (hålet tar bara lådans 1,5 m, 0,5 m blir kvar under)');
  await page.evaluate(() => { const c = l3vol.cur; c.spec.keepMode = 'up'; l3volSchedule(0); }); await page.waitForTimeout(500); await page.waitForFunction(() => l3vol.cur && !l3vol.cur.busy && l3vol.cur.res && l3vol.cur.spec.keepMode === 'up' && l3vol.cur.res.keep, null, { timeout: 25000 }); await page.waitForTimeout(500);
  const upf = await page.evaluate(() => l3vol.cur.res.fill); if (Math.abs(upf - 168) > 168 * 0.015) fail('Hål ända upp: ' + upf + ' ≠ 168');
  // TIN på + objekt kvar (Hål ända upp): en smal påle (0,2 m) tar bara sin egen yta även med 1 m ruta
  await page.evaluate(() => { const lo = window.__lo, g = placements.find(p => p.type === 'lada'); placements.splice(placements.indexOf(g), 1); l3RebuildOne && l3.placeMeshes.get(g.id) && (l3.groups.places.remove(l3.placeMeshes.get(g.id)), l3.placeMeshes.delete(g.id));
    const q = placeNew('lada', [lo[0] + 13, lo[1] + 13, 0]); q.L = 0.2; q.B = 0.2; q.H = 6; q.z = lo[2] + 1.5; placements.push(q); placeTouch(q); l3RebuildOne(q); const c = l3vol.cur; c.spec.tin = true; c.spec.keep = true; c.spec.cell = 1; l3volSchedule(0); });
  await page.waitForFunction(() => l3vol.cur && !l3vol.cur.busy && l3vol.cur.res && l3vol.cur.res.cell === 1, null, { timeout: 25000 }); await page.waitForTimeout(300);
  const thin = await page.evaluate(() => ({ fill: l3vol.cur.res.fill, tin: !!l3vol.cur.res.tin })); console.log('thin', JSON.stringify(thin));
  if (Math.abs(thin.fill - 200) > 200 * 0.03) fail('Smal påle (0,2 m) + TIN tar bara sin egen yta: ' + JSON.stringify(thin));
  // Punktmolnsgrejor som sticker upp över nivån (en 2 × 2 m skannad pelare, z 6 m) ska inte kapa fyllningen
  await page.evaluate(() => { const c = l3pc.clouds.find(x => x.id === 'pcA'), pos = Array.from(c.chunks[0].pos); for (let y = -1; y <= 1; y += 0.1) for (let x = -1; x <= 1; x += 0.1) pos.push(x - 3, y - 3, 4.5); c.chunks[0].pos = new Float32Array(pos); c.nTot = pos.length / 3;
    const q = placements.find(p => p.type === 'lada'); if (q) { placements.splice(placements.indexOf(q), 1); const g = l3.placeMeshes.get(q.id); if (g) { l3.groups.places.remove(g); l3.placeMeshes.delete(q.id); } }
    for (const p of placements.filter(p => p.type === 'lada')) { const g = l3.placeMeshes.get(p.id); if (g) { l3.groups.places.remove(g); l3.placeMeshes.delete(p.id); } }
    l3vol.cache.clear(); const cu = l3vol.cur; cu.spec.keep = false; cu.spec.tin = false; cu.spec.cell = 0.5; cu.spec.spike = false; l3volSchedule(0); });
  await page.waitForTimeout(400); await page.waitForFunction(() => l3vol.cur && !l3vol.cur.busy && l3vol.cur.res && l3vol.cur.res.cell === 0.5 && l3vol.cur.spec.spike === false, null, { timeout: 25000 }); await page.waitForTimeout(400);
  const sp0 = await page.evaluate(() => ({ fill: l3vol.cur.res.fill, cut: l3vol.cur.res.cut }));
  await page.evaluate(() => { l3vol.cur.spec.spike = true; l3volSchedule(0); }); await page.waitForTimeout(400); await page.waitForFunction(() => l3vol.cur && !l3vol.cur.busy && l3vol.cur.res && l3vol.cur.spec.spike === true && l3vol.cur.res.cut < 1, null, { timeout: 25000 }); await page.waitForTimeout(300);
  const sp1 = await page.evaluate(() => ({ fill: l3vol.cur.res.fill, cut: l3vol.cur.res.cut })); console.log('spik', JSON.stringify({ sp0, sp1 }));
  if (!(sp0.cut > 1) || Math.abs(sp1.fill - 200) > 200 * 0.02 || sp1.cut > 1) fail('Punktmolnsgrejor över nivån kapar inte fyllningen: ' + JSON.stringify({ sp0, sp1 }));
  // Samma med "Objekt står kvar" på och en stor skannad platå (5 × 5 m, över nivån): ingen kapad fläck i fyllningen
  await page.evaluate(() => { const c = l3pc.clouds.find(x => x.id === 'pcA'), pos = Array.from(c.chunks[0].pos); for (let y = -2.5; y <= 2.5; y += 0.1) for (let x = -2.5; x <= 2.5; x += 0.1) pos.push(x - 6, y - 6, 4.5); c.chunks[0].pos = new Float32Array(pos); c.nTot = pos.length / 3; l3vol.cache.clear(); const cu = l3vol.cur; cu.spec.keep = true; cu.spec.keepMode = 'pocket'; cu.spec.tin = false; cu.spec.cell = 0.5; cu.spec.spike = true; l3volSchedule(0); });
  await page.waitForTimeout(500); await page.waitForFunction(() => l3vol.cur && !l3vol.cur.busy && l3vol.cur.res && l3vol.cur.res.keep, null, { timeout: 40000 }); await page.waitForTimeout(400);
  const big = await page.evaluate(() => ({ fill: l3vol.cur.res.fill, cut: l3vol.cur.res.cut })); console.log('platå', JSON.stringify(big));
  if (Math.abs(big.fill - 200) > 200 * 0.03 || big.cut > 1) fail('Stor skannad platå över nivån ger inget hål: ' + JSON.stringify(big));
  // Förenkling av taggiga fotavtryck: en 4 × 2 m rektangel med ±1 rutas trappsteg längs kanterna blir ~4 hörn, arean ändras < 2 %
  const sm = await page.evaluate(() => { const f = 0.08, ring = []; const wob = i => (i % 2 ? f : 0); for (let i = 0; i <= 50; i++) ring.push([i * 0.08, wob(i)]); for (let j = 1; j <= 25; j++) ring.push([4 + wob(j), j * 0.08]); for (let i = 49; i >= 0; i--) ring.push([i * 0.08, 2 + wob(i)]); for (let j = 24; j >= 1; j--) ring.push([wob(j), j * 0.08]); ring.push(ring[0].slice());
    const out = l3volSimplifyRing(ring, f * 1.2), area = r => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a) / 2; }; return { n0: ring.length, n1: out.length, a0: area(ring), a1: area(out) }; });
  console.log('förenkling', JSON.stringify(sm)); if (sm.n1 > 8 || Math.abs(sm.a1 - sm.a0) / sm.a0 > 0.02) fail('Förenkling av taggiga kanter: ' + JSON.stringify(sm));
  // Dolda objekt (gruppen osynlig, t.ex. Dölj/Isolera) ska inte kapa något
  await page.evaluate(() => { const lo = window.__lo, q = placeNew('lada', [lo[0] + 12, lo[1] + 12, 0]); q.L = 3; q.B = 3; q.H = 5; q.z = lo[2] + 1.5; placements.push(q); placeTouch(q); l3RebuildOne(q); window.__hid = q.id; l3.placeMeshes.get(q.id).visible = false; l3vol.cache.clear(); const cu = l3vol.cur; cu.spec.keep = true; cu.spec.keepMode = 'pocket'; cu.spec.cell = 0.5; l3volSchedule(0); });
  await page.waitForTimeout(500); await page.waitForFunction(() => l3vol.cur && !l3vol.cur.busy && l3vol.cur.res && l3vol.cur.res.keep && l3vol.cur.res.cell === 0.5, null, { timeout: 40000 }); await page.waitForTimeout(400);
  const hid = await page.evaluate(() => ({ fill: l3vol.cur.res.fill, objs: l3vol.cur.res.keep.objs })); console.log('dolt', JSON.stringify(hid));
  if (hid.objs !== 0 || Math.abs(hid.fill - 200) > 200 * 0.03) fail('Dolt objekt kapar inget: ' + JSON.stringify(hid));
  await browser.close(); server.close(); console.log('OK test_lagesplan_3dvollvl');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
