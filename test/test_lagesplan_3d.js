// 3D-vyn ovanpå lägesplanen (Victors önskemål 2026-10-08): planen som mark via kalibreringen,
// planerade objekt som lådor i statusfärg, etableringen (plan_placements.json) med riktig geometri,
// lägga till från biblioteket med ett tryck, handtag (flytta/vrida) med fäst mot ytor, sidopanel,
// mätning, sparning i samma fil som 4D-planering och "Spara som IFC" via 4D-planering.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8981;
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
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  // GitHub: bara etableringens filer finns.
  const store = new Map(); let n = 0;
  store.set('projects/p1/plan_placements.json', { content: JSON.stringify([{ id: 'k1', type: 'tornkran', name: 'Kran 1', x: 6512320, y: 150110, z: 0, L: 1.6, B: 1.6, H: 40, R: 50, rot: 0, dz: 0, color: '#facc15' }]), sha: 's0' });
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
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
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.objMesh && l3.placeMeshes.size === 1, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  if (!(await page.locator('#view3d').isVisible())) fail('3D-vyn ska visas ovanpå lägesplanen');
  let s = await page.evaluate(() => {
    const pb = new THREE.Box3().setFromObject(l3.planMesh), ob = l3.objMesh.geometry.getAttribute('color');
    const col = i => '#' + new THREE.Color(ob.getX(i), ob.getY(i), ob.getZ(i)).getHexString();
    return { plan: [pb.min.x, pb.max.x, pb.min.y, pb.max.y].map(v => Math.round(v * 10) / 10), nObj: l3.objMesh.geometry.getAttribute('position').count,
      c1: col(0), c2: col(36), ph1: phaseColor('pagaende'), ph2: phaseColor('klar'), status: $('v3Status').textContent };
  });
  if (JSON.stringify(s.plan) !== JSON.stringify([0, 100, 0, 50])) fail('PDF:en (1000×500 pt, 0,1 m/pt) ska ligga som mark 100×50 m från kalibreringspunkten: ' + s.plan);
  if (s.nObj !== 72) fail('Två lådor (36 hörn var): ' + s.nObj);
  if (s.c1 !== s.ph1.toLowerCase() || s.c2 !== s.ph2.toLowerCase()) fail('Statusfärgerna: ' + JSON.stringify(s));
  if (!s.status.includes('2 planerade objekt') || !s.status.includes('1 etableringsobjekt')) fail('Statusraden: ' + s.status);

  // Lägg till en bod med ett tryck på marken (kameran ser ned mot mitten).
  const box = await page.locator('#v3Canvas').boundingBox();
  await page.click('[data-v3add="bod"]');
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.85);
  await page.waitForTimeout(300);
  s = await page.evaluate(() => ({ n: placements.length, bod: placements.find(p => p.type === 'bod'), active: placeActiveId, side: !$('v3Side').classList.contains('hidden'), gizmo: !!l3.gizmo.object }));
  if (s.n !== 2 || !s.bod || s.active !== s.bod.id || !s.side || !s.gizmo) fail('Boden ska läggas till där man trycker och väljas med handtag: ' + JSON.stringify(s));
  if (!(s.bod.x > 6512300 && s.bod.x < 6512400 && s.bod.y > 150050 && s.bod.y < 150200)) fail('Boden ska hamna på planen: ' + JSON.stringify(s.bod));

  // Handtagen: flytta boden in över pelaren K10 (14 m hög) -> fäst mot ytan = står på taket.
  s = await page.evaluate(() => {
    const g = l3.gizmo.object; placeSnapshot(); l3.dragStart = l3GroupState();
    g.position.x = 6512350 - l3.O[0]; g.position.y = 150125 - l3.O[1]; l3FromGizmo(); l3DragEnd();
    const p = placeActive();
    return { x: p.x, y: p.y, z: p.z, dz: p.dz, gz: g.position.z };
  });
  if (s.x !== 6512350 || s.y !== 150125 || Math.abs(s.z - 14) > 1e-6 || s.dz !== 0) fail('Fäst mot ytor: boden ska stå på pelaren (z 14): ' + JSON.stringify(s));
  // Vrida med handtaget.
  s = await page.evaluate(() => { const g = l3.gizmo.object; g.rotation.z = Math.PI / 2; l3FromGizmo(); l3DragEnd(); return placeActive().rot; });
  if (s !== 90) fail('Vridning 90°: ' + s);
  // Sidopanelen: längd 12 m -> geometrin byggs om.
  await page.fill('[data-v3f="L"]', '12'); await page.dispatchEvent('[data-v3f="L"]', 'change');
  s = await page.evaluate(() => { const b = new THREE.Box3().setFromObject(l3.placeMeshes.get(placeActiveId)); return [placeActive().L, Math.round((b.max.y - b.min.y) * 100) / 100]; });
  if (s[0] !== 12 || s[1] !== 12) fail('Längden 12 m (vriden 90° = längs Y): ' + s);
  // Kopiera och ångra.
  await page.click('#v3Copy');
  if (await page.evaluate(() => placements.length) !== 3) fail('Kopiera ska ge ett tredje objekt');
  await page.click('#v3Undo');
  if (await page.evaluate(() => placements.length + ':' + l3.placeMeshes.size) !== '2:2') fail('Ångra ska ta bort kopian (även i 3D)');

  // Välja kranen genom att trycka på den -> sidopanelen visar kranen.
  await page.evaluate(() => l3Select('k1'));
  if (await page.locator('.v3-name').inputValue() !== 'Kran 1') fail('Sidopanelen ska visa kranen');
  if (await page.locator('[data-v3f="R"]').inputValue() !== '50') fail('Kranens räckvidd ska gå att ändra');

  // Mät: två tryck.
  await page.click('#v3Measure');
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.85);
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.85);
  await page.waitForTimeout(200);
  if (!(await page.locator('#v3Status').innerText()).includes('Avstånd')) fail('Mätningen ska visa avståndet: ' + await page.locator('#v3Status').innerText());

  // Sparat i samma fil som 4D-planering + 4D-planering underrättad.
  await page.waitForTimeout(2600);
  const saved = getStore('plan_placements.json');
  const bod = saved && saved.find(p => p.type === 'bod');
  if (!bod || bod.x !== 6512350 || bod.rot !== 90 || bod.L !== 12 || Math.abs(bod.z - 14) > 1e-6 || !saved.some(p => p.id === 'k1')) fail('plan_placements.json: ' + JSON.stringify(saved));
  if (!(await page.evaluate(() => window.__calls)).includes('placementsChanged')) fail('4D-planering ska få veta att etableringen ändrats');
  // Spara som IFC körs av 4D-planering.
  await page.click('#v3SaveIfc'); await page.waitForTimeout(400);
  if (!(await page.evaluate(() => window.__calls)).includes('placeSaveIfc') || !(await page.locator('#v3Status').innerText()).includes('2 objekt sparade')) fail('Spara som IFC via 4D-planering');
  // Datum ändras -> färgerna följer med.
  await page.evaluate(() => { $('dateInput').value = '2019-06-01'; });
  await page.waitForTimeout(1000);
  s = await page.evaluate(() => { const c = l3.objMesh.geometry.getAttribute('color'); return ['#' + new THREE.Color(c.getX(36), c.getY(36), c.getZ(36)).getHexString(), phaseColor('planerad').toLowerCase()]; });
  if (s[0] !== s[1]) fail('Vid ett tidigare datum ska M30 vara planerad: ' + s);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  await page.click('#v3Close');
  if (await page.locator('#view3d').isVisible()) fail('✕ 2D ska stänga 3D-vyn');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3d');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
