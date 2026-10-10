// 3D-vyn: verktyg som i SketchUp – Flytta (punkt till punkt med fästpunkter, axellås med pilar,
// avstånd med siffror + Enter), Vrid (vridpunkt, utgångsriktning, vinkel), Rikta (kant mot kant) –
// och IFC-modeller med riktig geometri (sparad bredvid IFC-filen av web-ifc).
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8982;
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
  store.set('projects/p1/plan_placements.json', { content: JSON.stringify([
    { id: 'c1', type: 'container', name: 'Container 1', x: 6512320, y: 150110, z: 0, L: 6, B: 2, H: 2, rot: 0, dz: 0, color: '#2563eb' },
    { id: 'm1', type: 'model:ifc1', name: 'Pall 1', x: 6512330, y: 150140, z: 0, rot: 0, dz: 0, scale: 1, color: '#64748b' }]), sha: 's0' });
  // IFC-modell med geometri bredvid (två färger, 1×2×3 m).
  const box = (x0, x1, y0, y1, z0, z1) => { const p = []; for (const z of [z0, z1]) for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) p.push(x * 1000, y * 1000, z * 1000); return p; };
  const F = [0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7];
  store.set('projects/p1/plan_models.json', { content: JSON.stringify([{ id: 'ifc1', name: 'Pall', kind: 'ifc', path: 'projects/p1/models/ifc1.ifc', meshPath: 'projects/p1/models/ifc1.mesh.json', bbox: { min: [-0.5, -1, 0], max: [0.5, 1, 3] }, offset: [0, 0, 0], factor: 0.001, outline: [] }]), sha: 'm0' });
  store.set('projects/p1/models/ifc1.mesh.json', { content: JSON.stringify({ v: 1, parts: [{ c: '#aa3300', t: 0, p: box(-0.5, 0.5, -1, 1, 0, 2), i: F }, { c: '#00aa33', t: 0, p: box(-0.5, 0.5, -1, 1, 2, 3), i: F }] }), sha: 'x0' });
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET' && e && /raw/.test(req.headers()['accept'] || '')) return r.fulfill({ status: 200, body: e.content });
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
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.objMesh && l3.placeMeshes.size === 2, null, { timeout: 15000 });
  // IFC-modellen visas med sin riktiga geometri (två delar i sina färger), inte som en låda.
  let s = await page.evaluate(() => { const g = l3.placeMeshes.get('m1'); const cols = []; g.traverse(o => { if (o.isMesh) cols.push('#' + o.material.color.getHexString()); }); return cols.sort(); });
  if (JSON.stringify(s) !== JSON.stringify(['#00aa33', '#aa3300'])) fail('IFC-modellen ska visas med riktig geometri: ' + JSON.stringify(s));
  // Kameran rakt uppifrån (förutsägbara skärmpunkter).
  const top = () => page.evaluate(() => { l3StopFly(); const c = new THREE.Vector3(6512335 - l3.O[0], 150125 - l3.O[1], 0); l3.camera.position.set(c.x, c.y - 0.01, 60); l3.orbit.target.copy(c); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); });
  await top();
  const rect = await page.locator('#v3Canvas canvas').boundingBox();
  const scr = (x, y, z) => page.evaluate(([x, y, z]) => { const q = l3ToScreen(new THREE.Vector3(x - l3.O[0], y - l3.O[1], z - l3.O[2])); return [q.x, q.y]; }, [x, y, z]);
  const at = async (x, y, z, dx = 2, dy = 2) => { const [sx, sy] = await scr(x, y, z); return [rect.x + sx + dx, rect.y + sy + dy]; };
  const move = async (x, y, z, dx, dy) => { const [px, py] = await at(x, y, z, dx, dy); await page.mouse.move(px, py); await page.waitForTimeout(80); return [px, py]; };
  const click = async (x, y, z, dx, dy) => { const [px, py] = await move(x, y, z, dx, dy); await page.mouse.click(px, py); await page.waitForTimeout(120); };
  const marker = () => page.evaluate(() => { const m = document.querySelector('.v3-snap'); return m.style.display === 'none' ? '' : m.textContent; });
  const P = id => page.evaluate(id => ({ ...placements.find(p => p.id === id) }), id);

  // --- Flytta (M): containerns övre hörn (x+3, y+1, z 2) till pelarens övre hörn (6512345, 150120, 14).
  await page.keyboard.press('m');
  if (!(await page.locator('[data-v3tool="move"]').getAttribute('class')).includes('on')) fail('M ska välja Flytta');
  await move(6512323, 150111, 2, -3, 3);
  if ((await marker()) !== 'Ändpunkt') fail('Nära hörnet ska markören fästa mot Ändpunkt: ' + await marker());
  await click(6512323, 150111, 2, -3, 3);
  await move(6512345, 150120, 14, 3, -3);
  if ((await marker()) !== 'Ändpunkt') fail('Målet ska fästa mot pelarens hörn: ' + await marker());
  if (!(await page.locator('.v3-vcb').innerText()).includes('Avstånd')) fail('Måttrutan ska visa avståndet');
  await click(6512345, 150120, 14, 3, -3);
  s = await P('c1');
  if (s.x !== 6512342 || s.y !== 150119 || Math.abs(s.dz - 12) > 1e-6) fail('Flytta punkt till punkt: hörnet ska hamna exakt på pelarens hörn: ' + JSON.stringify(s));

  // --- Flytta med axellås och inskrivet avstånd: ← (grön axel), peka söderut, 5,5 + Enter.
  await top();
  await click(6512339, 150118, 14, 3, -3);
  await page.keyboard.press('ArrowLeft');
  if (!(await page.locator('#v3Status').innerText()).includes('grön axel')) fail('← ska låsa grön axel');
  await move(6512339, 150110, 14, 0, 0);
  for (const k of ['5', ',', '5']) await page.keyboard.press(k);
  if (!(await page.locator('.v3-vcb').innerText()).includes('5,5')) fail('Måttrutan ska visa det inskrivna: ' + await page.locator('.v3-vcb').innerText());
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  s = await P('c1');
  if (s.x !== 6512342 || s.y !== 150113.5 || Math.abs(s.dz - 12) > 1e-6) fail('Flytta 5,5 m söderut längs grön axel: ' + JSON.stringify(s));
  if (await page.evaluate(() => typeof activeTab === 'function' ? activeTab() : '') === 'zones') fail('Lägesplanens genvägar ska vara avstängda i 3D');

  // --- Vrid (Q): kring hörnet (x-3, y-1), utgångsriktning längs långsidan, skriv 90 + Enter.
  await page.keyboard.press('q');
  await top();
  await click(6512339, 150112.5, 14, 3, -3);
  await click(6512345, 150112.5, 14, -3, -3);
  for (const k of ['9', '0']) await page.keyboard.press(k);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  s = await P('c1');
  if (s.rot !== 90 || Math.abs(s.x - 6512338) > 1e-6 || Math.abs(s.y - 150115.5) > 1e-6) fail('Vrid 90° kring hörnet: ' + JSON.stringify(s));
  await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
  s = await P('c1');
  if (s.rot !== 0 || s.x !== 6512342 || s.y !== 150113.5) fail('Ctrl+Z ska ångra vridningen: ' + JSON.stringify(s));

  // --- Rikta (A): containerns långsida mot pelarens västra kant.
  await page.keyboard.press('a');
  await top();
  await click(6512339, 150112.5, 14, 3, -3);   // A1
  await click(6512345, 150112.5, 14, -3, -3);  // A2 (österut längs långsidan)
  await click(6512345, 150120, 14, 3, -3);     // B1: pelarens sydvästra hörn
  await click(6512345, 150130, 14, 3, 3);      // B2: pelarens nordvästra hörn
  s = await P('c1');
  if (s.rot !== 90 || Math.abs(s.x - 6512344) > 1e-6 || Math.abs(s.y - 150123) > 1e-6 || Math.abs(s.dz - 12) > 1e-6) fail('Rikta: vriden 90° med hörnet på pelarens hörn: ' + JSON.stringify(s));

  // --- Esc lämnar verktyget, V/Välj ger handtagen igen.
  await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  if (!(await page.locator('[data-v3tool="select"]').getAttribute('class')).includes('on')) fail('Esc ska gå tillbaka till Välj');
  await page.evaluate(() => l3Select('c1'));
  if (!(await page.evaluate(() => !!l3.gizmo.object))) fail('I Välj ska handtagen visas');
  // Sparat i samma fil.
  await page.waitForTimeout(2600);
  const saved = getStore('plan_placements.json').find(p => p.id === 'c1');
  if (!saved || saved.rot !== 90 || Math.abs(saved.x - 6512344) > 1e-6) fail('plan_placements.json: ' + JSON.stringify(saved));
  // Kantfästning längs hela objektets kant (även strax utanför): punkten glider längs kanten.
  const es = await page.evaluate(() => {
    l3SetPref('snaps', { ...l3Snaps(), end: true, mid: true, edge: true, axis: false, grid: false, ortho: false });
    const g = l3.placeMeshes.get('c1'); g.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(g), c = b.getCenter(new THREE.Vector3());
    l3StopFly(); l3.orbit.target.copy(c); const sz = b.getSize(new THREE.Vector3()).length(); l3.camera.position.copy(c).add(new THREE.Vector3(0.5, -1.1, 0.8).multiplyScalar(sz * 1.1)); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera);
    const r = l3.renderer.domElement.getBoundingClientRect(), out = [];
    // Övre långa kanten på sidan som vetter mot kameran (x = max, z = max, längs y), vid 30 % och 70 %.
    [0.3, 0.7].forEach(t => {
      const p = new THREE.Vector3(b.max.x, b.min.y + (b.max.y - b.min.y) * t, b.max.z), q = l3ToScreen(p), qc = l3ToScreen(new THREE.Vector3(c.x, p.y, b.max.z));
      const dx = q.x - qc.x, dy = q.y - qc.y, L = Math.hypot(dx, dy) || 1;
      const s = l3Snap({ clientX: r.left + q.x + dx / L * 4, clientY: r.top + q.y + dy / L * 4 }); // 4 px utanför kanten
      out.push(s && { kind: s.kind, dx: Math.abs(s.point.x - b.max.x), dz: Math.abs(s.point.z - b.max.z), y: s.point.y, want: p.y });
    });
    return out;
  });
  if (es.some(x => !x || x.kind !== 'edge' || x.dx > 0.02 || x.dz > 0.02 || Math.abs(x.y - x.want) > 0.25)) fail('Fäst längs hela kanten: ' + JSON.stringify(es));
  // Vinkelrätt: från en punkt på ena långsidan fäster andra punkten i fotpunkten på motstående kant.
  const pp = await page.evaluate(() => {
    const g = l3.placeMeshes.get('c1'), b = new THREE.Box3().setFromObject(g), r = l3.renderer.domElement.getBoundingClientRect();
    const base = new THREE.Vector3(b.min.x, b.min.y + (b.max.y - b.min.y) * 0.5, b.max.z); // på kanten x = min
    // Markören på kanten x = max, en bit från fotpunkten (y + 0,4 m).
    const near = new THREE.Vector3(b.max.x, base.y + 0.4, b.max.z), q = l3ToScreen(near);
    l3SetPref('snaps', { ...l3Snaps(), perp: true, axis: false });
    const s = l3Target({ clientX: r.left + q.x, clientY: r.top + q.y }, base);
    return s && { kind: s.kind, x: s.point.x - b.max.x, y: s.point.y - base.y };
  });
  if (!pp || pp.kind !== 'perp' || Math.abs(pp.x) > 0.02 || Math.abs(pp.y) > 0.02) fail('Vinkelrätt (kortaste vägen): ' + JSON.stringify(pp));
  if (process.env.SHOT) { await page.evaluate(() => { l3Frame(); l3.renderer.render(l3.scene, l3.camera); }); await page.keyboard.press('m'); await move(6512346, 150123, 14, 0, 0); await page.screenshot({ path: process.env.SHOT }); }
  if (process.env.SHOTGZ) { await page.evaluate(() => { l3SetTool('select'); l3SelectIds(['c1']); const g = l3.placeMeshes.get('c1'), c = new THREE.Box3().setFromObject(g).getCenter(new THREE.Vector3()); l3StopFly(); l3.orbit.target.copy(c); l3.camera.position.copy(c).add(new THREE.Vector3(9, -12, 8)); l3.orbit.update(); l3Render(); }); await page.waitForTimeout(400); await page.screenshot({ path: process.env.SHOTGZ }); }
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3dtools');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
