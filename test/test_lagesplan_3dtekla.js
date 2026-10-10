// 3D-editorn: Tekla-funktionerna – mus som i Tekla (områdesmarkering åt båda hållen, panorera med
// mitten, zoom mot markören), Ctrl+P plan, V rotationscentrum, Kopiera/Flytta special (linjär,
// rotation, spegling, välj punkter, förhandsvisning), egenskaper för flera med kryssrutor, dölj/isolera/
// visa alla, snitt, objektlista, snabbsök, samma typ, fästlägen, rutnät, orto, relativa koordinater,
// Ctrl-kopia med *N och /N, mät vinkel och yta.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8985;
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
  const C = (id, x, y, name) => ({ id, type: 'container', name, x, y, z: 0, L: 6, B: 2, H: 2, rot: 0, dz: 0, color: '#2563eb' });
  store.set('projects/p1/plan_placements.json', { content: JSON.stringify([C('a', 6512320, 150110, 'Container 1'), C('b', 6512320, 150120, 'Container 2'), C('c', 6512335, 150110, 'Container 3'), { id: 'u', type: 'upplag', name: 'Upplag 1', x: 6512360, y: 150100, z: 0, L: 10, B: 5, H: 0.3, rot: 0, dz: 0, color: '#a16207' }]), sha: 's0' });
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
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.placeMeshes.size === 4, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  const cv = await page.locator('#v3Canvas canvas').boundingBox();
  const scr = (x, y, z) => page.evaluate(([x, y, z]) => { const q = l3ToScreen(new THREE.Vector3(x - l3.O[0], y - l3.O[1], z - l3.O[2])); return [q.x, q.y]; }, [x, y, z]);
  const at = async (x, y, z, dx = 0, dy = 0) => { const [sx, sy] = await scr(x, y, z); return [cv.x + sx + dx, cv.y + sy + dy]; };
  const tap = async (x, y, z, dx = 0, dy = 0) => { const [px, py] = await at(x, y, z, dx, dy); await page.mouse.move(px, py); await page.waitForTimeout(60); await page.mouse.click(px, py); await page.waitForTimeout(100); };
  const top = () => page.evaluate(() => { l3StopFly(); if (l3IsOrtho()) l3SetProjection(false); const c = new THREE.Vector3(6512335 - l3.O[0], 150115 - l3.O[1], 0); l3.camera.position.set(c.x, c.y - 0.01, 80); l3.orbit.target.copy(c); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); });
  const P = id => page.evaluate(id => { const p = placements.find(x => x.id === id); return p ? { ...p } : null; }, id);
  const sel = () => page.evaluate(() => [...l3.sel].sort());
  const N = () => page.evaluate(() => placements.length);
  const drag = async (a, b, button = 'left') => { await page.mouse.move(a[0], a[1]); await page.mouse.down({ button }); for (let i = 1; i <= 6; i++) await page.mouse.move(a[0] + (b[0] - a[0]) * i / 6, a[1] + (b[1] - a[1]) * i / 6); await page.mouse.up({ button }); await page.waitForTimeout(120); };
  await top();

  // --- Områdesmarkering: vänster -> höger = helt inne (a och b), höger -> vänster = nuddar (även c).
  let A = await at(6512315, 150124, 0), B = await at(6512326, 150106, 0);
  await drag([A[0], A[1]], [B[0], B[1]]);
  if (JSON.stringify(await sel()) !== '["a","b"]') fail('Ruta vänster->höger ska markera det som ligger helt inne: ' + await sel());
  A = await at(6512334, 150108, 0); B = await at(6512318, 150122, 0); // från höger, nuddar c i kanten
  await drag([A[0], A[1]], [B[0], B[1]]);
  if (JSON.stringify(await sel()) !== '["a","b","c"]') fail('Ruta höger->vänster ska markera allt som rutan nuddar: ' + await sel());

  // --- Zoom mot markören: punkten under markören står kvar.
  const [zx, zy] = await at(6512335, 150110, 2);
  await page.mouse.move(zx, zy); await page.mouse.wheel(0, -400); await page.waitForTimeout(150);
  const [zx2, zy2] = await at(6512335, 150110, 2);
  if (Math.hypot(zx2 - zx, zy2 - zy) > 2.5) fail('Hjulet ska zooma mot markören: ' + [zx, zy, zx2, zy2]);
  // Mitten-dra panorerar.
  const t0 = await page.evaluate(() => l3.orbit.target.toArray());
  await drag([cv.x + 300, cv.y + 300], [cv.x + 400, cv.y + 300], 'middle');
  const t1 = await page.evaluate(() => l3.orbit.target.toArray());
  if (Math.hypot(t1[0] - t0[0], t1[1] - t0[1]) < 0.5) fail('Mittenknappen ska panorera');
  await top();

  // --- Automatiskt rotationscentrum: Ctrl + mitten roterar kring punkten under markören – den står kvar på skärmen.
  const tilt = () => page.evaluate(() => { l3StopFly(); const c = new THREE.Vector3(6512330 - l3.O[0], 150115 - l3.O[1], 0); l3.camera.position.set(c.x - 25, c.y - 40, 35); l3.orbit.target.copy(c); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); });
  await tilt();
  const pv = await at(6512338, 150111, 2, -6, 4);                    // på c:s tak, inte i mitten av vyn
  const pivW = await page.evaluate(([x, y]) => { const r = l3.renderer.domElement.getBoundingClientRect(); return l3PivotPoint({ clientX: x, clientY: y }).toArray().map((v, i) => v + l3.O[i]); }, pv);
  const dir0 = await page.evaluate(() => l3.camera.getWorldDirection(new THREE.Vector3()).toArray());
  await page.keyboard.down('Control');
  await drag([pv[0], pv[1]], [pv[0] + 140, pv[1] + 50], 'middle');
  await page.keyboard.up('Control');
  const dir1 = await page.evaluate(() => l3.camera.getWorldDirection(new THREE.Vector3()).toArray());
  const pv2 = await at(...pivW);
  if (Math.hypot(dir1[0] - dir0[0], dir1[1] - dir0[1], dir1[2] - dir0[2]) < 0.2) fail('Ctrl + mitten ska rotera vyn: ' + dir0 + ' / ' + dir1);
  if (Math.hypot(pv2[0] - pv[0], pv2[1] - pv[1]) > 2) fail('Rotationen ska ske kring punkten under markören (den ska stå kvar): ' + pv + ' -> ' + pv2);
  if (dir1[2] > -0.01) fail('Kameran får inte hamna under horisonten: ' + dir1);
  if (await page.evaluate(() => JSON.stringify(l3.orbit.mouseButtons)) !== JSON.stringify({ LEFT: -1, MIDDLE: 2, RIGHT: -1 })) fail('Musknapparna ska återställas efter rotationen');
  if (JSON.stringify(await sel()) !== '["a","b","c"]') fail('Rotationen får inte ändra markeringen: ' + await sel());
  // Av: roterar kring målpunkten, punkten under markören flyttar sig.
  await page.evaluate(() => l3SetPref('autoRot', false)); await tilt();
  await page.keyboard.down('Control'); await drag([pv[0], pv[1]], [pv[0] + 140, pv[1] + 50], 'middle'); await page.keyboard.up('Control');
  const pv3 = await at(...pivW);
  if (Math.hypot(pv3[0] - pv[0], pv3[1] - pv[1]) < 10) fail('Utan automatiskt rotationscentrum ska vyn rotera kring målpunkten');
  await page.evaluate(() => l3SetPref('autoRot', true));
  await top();

  // --- Ctrl+P: plan (parallell, uppifrån) och tillbaka.
  await page.mouse.move(cv.x + 5, cv.y + 5);
  await page.keyboard.press('Control+p'); await page.waitForTimeout(600);
  let v = await page.evaluate(() => ({ o: l3IsOrtho(), dz: l3.orbit.target.clone().sub(l3.camera.position).normalize().z }));
  if (!v.o || v.dz > -0.99) fail('Ctrl+P ska ge planvy med parallell projektion: ' + JSON.stringify(v));
  await page.keyboard.press('Control+p'); await page.waitForTimeout(600);
  if (await page.evaluate(() => l3IsOrtho())) fail('Ctrl+P igen ska ge 3D');
  await top();

  // --- V: rotationscentrum vid tryckt punkt.
  await page.keyboard.press('v');
  await tap(6512338, 150111, 2, -3, 3);
  await page.waitForTimeout(500);
  v = await page.evaluate(() => l3.orbit.target.toArray().map((x, i) => x + l3.O[i]));
  if (Math.hypot(v[0] - 6512338, v[1] - 150111) > 0.1) fail('V ska sätta rotationscentrum i punkten (hörnet): ' + v);
  await top();

  // --- Sparade vyer: spara (med ett snitt), ändra kameran, gå tillbaka – kamera och snitt återställs.
  await page.evaluate(() => { l3StopFly(); const c = new THREE.Vector3(6512330 - l3.O[0], 150115 - l3.O[1], 0); l3.camera.position.set(c.x - 25, c.y - 40, 35); l3.orbit.target.copy(c); l3.orbit.update(); l3AddClip(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1.5)); });
  await page.click('#v3ViewsBtn'); await page.fill('#v3SvName', 'Infart'); await page.press('#v3SvName', 'Enter');
  if (await page.locator('[data-svgo]').count() !== 1 || !(await page.textContent('[data-svgo="0"]')).includes('Infart')) fail('Vyn ska listas');
  const cam0 = await page.evaluate(() => l3.camera.position.toArray());
  await page.keyboard.press('Escape');
  await page.evaluate(() => { l3ClearClips(); l3View('top'); }); await page.waitForTimeout(600);
  await page.click('#v3ViewsBtn'); await page.click('[data-svgo="0"]'); await page.waitForTimeout(700);
  v = await page.evaluate(() => ({ p: l3.camera.position.toArray(), n: l3.renderer.clippingPlanes.length, o: l3IsOrtho() }));
  if (Math.hypot(...v.p.map((x, i) => x - cam0[i])) > 0.05 || v.n !== 1 || v.o) fail('Vyn ska återställa kamera och snitt: ' + JSON.stringify(v) + ' ' + cam0);
  await page.evaluate(() => l3ClearClips());
  await page.click('#v3ViewsBtn');
  if (process.env.SHOT_VIEWS) await page.screenshot({ path: process.env.SHOT_VIEWS, clip: { x: 700, y: 0, width: 600, height: 560 } });
  await page.click('[data-svdel="0"]');
  if (await page.locator('[data-svgo]').count() !== 0) fail('Vyn ska kunna tas bort');
  await page.keyboard.press('Escape');
  await top();

  // --- Kopiera special, linjär: c, dX 10, 3 kopior, förhandsvisning.
  await page.evaluate(() => l3SelectIds(['c']));
  await page.click('#v3EditBtn'); await page.click('[data-v3cmd="cspec"]');
  await page.fill('[data-sp="dx"]', '10'); await page.fill('[data-sp="dy"]', '0'); await page.fill('[data-sp="dz"]', '0'); await page.fill('[data-sp="n"]', '3');
  await page.waitForTimeout(100);
  if (await page.evaluate(() => l3.groups.prev.children.length) !== 3) fail('Förhandsvisningen ska visa 3 kopior');
  if (!(await page.textContent('#v3SpInfo')).includes('3 nya objekt')) fail('Antal kopior ska summeras');
  await page.click('[data-spstep="1"]'); await page.waitForTimeout(80);
  if (await page.inputValue('#v3SpN') !== '4' || await page.evaluate(() => l3.groups.prev.children.length) !== 4) fail('+ ska ge 4 kopior');
  await page.click('[data-spstep="-1"]'); await page.waitForTimeout(80);
  if (await page.inputValue('#v3SpN') !== '3' || await page.evaluate(() => l3.groups.prev.children.length) !== 3) fail('− ska ge 3 kopior igen');
  await page.click('#v3SpGo'); await page.waitForTimeout(100);
  let all = await page.evaluate(() => placements.filter(p => p.type === 'container').map(p => p.x).sort((a, b) => a - b));
  if (await N() !== 7 || !all.includes(6512345) || !all.includes(6512355) || !all.includes(6512365)) fail('Kopiera special linjärt: ' + all);
  if (JSON.stringify(await sel()) !== '["c"]') fail('Originalet ska vara kvar markerat (som i Tekla)');
  // Välj två punkter fyller dX/dY/dZ.
  await page.click('[data-sppick="lin"]');
  // Dialogen ur vägen för punkterna (den bredare vänsterpanelen flyttar ritytan).
  await page.evaluate(() => { const d = document.getElementById('v3Special'), c = document.getElementById('v3Canvas'); d.style.left = (c.clientWidth - d.offsetWidth - 10) + 'px'; });
  // Punkter på marken intill objekt: fästningen mot objektens hörn/kanter är av här (den skulle fästa på objektet).
  await page.evaluate(() => { window.__sn = l3Prefs().snaps; l3SetPref('snaps', { ...l3Snaps(), end: false, mid: false, edge: false }); });
  await tap(6512320, 150110, 2, 0, 0); await tap(6512320, 150120, 2, 0, 0);
  await page.evaluate(() => l3SetPref('snaps', window.__sn || {}));
  v = await page.evaluate(() => [document.querySelector('[data-sp="dx"]').value, document.querySelector('[data-sp="dy"]').value].map(Number));
  if (Math.abs(v[0]) > 0.3 || Math.abs(v[1] - 10) > 0.3) fail('Välj två punkter ska fylla dX/dY: ' + v);
  // Rotation: 2 kopior à 90° kring (6512335, 150110) -> c (som ligger i punkten) står kvar men vrids.
  await page.click('[data-sptab="rot"]');
  await page.fill('[data-sp="x0"]', '6512330'); await page.fill('[data-sp="y0"]', '150110'); await page.fill('[data-sp="ang"]', '90'); await page.fill('[data-sp="rdz"]', '0'); await page.fill('[data-sp="rn"]', '2');
  await page.click('#v3SpGo'); await page.waitForTimeout(100);
  v = await page.evaluate(() => placements.slice(-2).map(p => [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000, p.rot]));
  if (JSON.stringify(v) !== JSON.stringify([[6512330, 150115, 90], [6512325, 150110, 180]])) fail('Kopiera special rotation: ' + JSON.stringify(v));
  await page.click('#v3SpClose');
  // Flytta special, spegling kring nord–sydlig linje genom x 6512330: c (x 6512335) -> 6512325.
  await page.evaluate(() => l3SelectIds(['c']));
  await page.click('#v3EditBtn'); await page.click('[data-v3cmd="mspec"]');
  await page.click('[data-sptab="mir"]');
  await page.fill('[data-sp="mx0"]', '6512330'); await page.fill('[data-sp="my0"]', '150110'); await page.fill('[data-sp="mang"]', '90');
  await page.click('#v3SpGo'); await page.waitForTimeout(100);
  v = await P('c');
  if (v.x !== 6512325 || v.y !== 150110 || v.rot !== 180) fail('Flytta special spegling: ' + JSON.stringify(v));
  await page.keyboard.press('Control+z'); await page.waitForTimeout(80);
  if ((await P('c')).x !== 6512335) fail('Ångra efter Flytta special');
  await page.click('#v3SpClose');

  // --- Egenskaper för flera: kryssruta per fält.
  await page.evaluate(() => l3SelectIds(['a', 'b']));
  if (!(await page.locator('#v3Side').innerText()).toLowerCase().includes('kryssa i det som ska ändras')) fail('Flera markerade: Tekla-panelen');
  await page.fill('[data-mev="dz"]', '1,5');
  if (!(await page.locator('[data-mec="dz"]').isChecked())) fail('Att skriva i fältet ska kryssa i det');
  await page.fill('[data-mev="H"]', '3'); await page.locator('[data-mec="H"]').uncheck();
  await page.click('#v3MeApply'); await page.waitForTimeout(100);
  v = [await P('a'), await P('b')];
  if (v.some(p => p.dz !== 1.5 || p.H !== 2)) fail('Ändra ska bara gälla ikryssade fält: ' + JSON.stringify(v.map(p => [p.dz, p.H])));

  // --- Dölj / visa bara markerade / visa alla.
  await page.mouse.move(cv.x + 5, cv.y + 5);
  await page.keyboard.press('h'); await page.waitForTimeout(80);
  if (await page.evaluate(() => [l3.placeMeshes.get('a').visible, l3.placeMeshes.get('b').visible].some(Boolean))) fail('H ska dölja de markerade');
  if (!(await page.locator('#v3HiddenChip').innerText()).includes('2 dolda')) fail('Antalet dolda ska synas');
  await page.evaluate(() => l3SelectIds(['c']));
  await page.keyboard.press('i'); await page.waitForTimeout(80);
  if (await page.evaluate(() => [...l3.placeMeshes.entries()].filter(([, g]) => g.visible).map(([id]) => id).join()) !== 'c') fail('I ska visa bara de markerade');
  await page.keyboard.press('u'); await page.waitForTimeout(80);
  if (await page.evaluate(() => [...l3.placeMeshes.values()].some(g => !g.visible)) || await page.locator('#v3HiddenChip').isVisible()) fail('U ska visa alla');

  // --- Snitt: tryck på containerns tak -> det ovanför tas bort, går inte att träffa; reglage; ta bort.
  await top();
  await page.click('#v3ClipBtn');
  await tap(6512335, 150110, 2, 0, 0);
  v = await page.evaluate(() => ({ n: l3.renderer.clippingPlanes.length, n0: l3.renderer.clippingPlanes[0] && l3.renderer.clippingPlanes[0].normal.toArray() }));
  if (v.n !== 1 || v.n0[2] > -0.99) fail('Snitt i taket ska ge ett vågrätt snitt: ' + JSON.stringify(v));
  await page.fill('[data-clipnum="0"]', '1'); await page.waitForTimeout(50);
  v = await page.evaluate(() => l3NotClipped(new THREE.Vector3(6512335 - l3.O[0], 150110 - l3.O[1], 1.5 - l3.O[2])));
  if (v) fail('Snittet 1 m nedåt ska skära bort punkten på 1,5 m');
  await page.click('#v3ClipClear');
  if (await page.evaluate(() => l3.renderer.clippingPlanes.length)) fail('Ta bort alla snitt');

  // --- Objektlistan.
  await page.click('[data-paltab="list"]');
  if (await page.locator('[data-olid]').count() !== await N()) fail('Objektlistan ska visa all etablering');
  await page.click('[data-olid="u"]');
  if (JSON.stringify(await sel()) !== '["u"]') fail('Klick i listan ska markera');
  await page.click('[data-oleye="u"]');
  if (await page.evaluate(() => l3.placeMeshes.get('u').visible)) fail('Ögat ska dölja');
  await page.click('[data-oleye="u"]');
  await page.click('[data-olg="Container"]');
  if ((await sel()).length !== 8) fail('Gruppnamnet ska markera hela gruppen (8 containrar): ' + (await sel()).length);
  await page.click('[data-paltab="add"]');

  // --- Markera alla av samma typ (via menyn).
  await page.evaluate(() => l3SelectIds(['u']));
  await page.click('#v3EditBtn'); await page.click('[data-v3cmd="similar"]');
  if (JSON.stringify(await sel()) !== '["u"]') fail('Samma typ: bara upplaget');

  // --- Snabbsök kommando: Ctrl+K "uppifr" Enter.
  await page.mouse.move(cv.x + 5, cv.y + 5);
  await page.keyboard.press('Control+k'); await page.waitForTimeout(80);
  await page.keyboard.type('vy uppifr'); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
  if (await page.evaluate(() => l3.orbit.target.clone().sub(l3.camera.position).normalize().z) > -0.99) fail('Snabbsök: Vy uppifrån');

  // --- Fästlägen: Hörn av -> ingen ändpunkt; rutnät 1 m.
  await top();
  await page.keyboard.press('t');
  await page.click('[data-snapk="end"]');
  const [hx, hy] = await at(6512338, 150111, 2, -3, 3); await page.mouse.move(hx, hy); await page.waitForTimeout(120);
  if ((await page.evaluate(() => document.querySelector('.v3-snap').textContent)).startsWith('Ändpunkt')) fail('Hörn av: ingen ändpunkt');
  await page.click('[data-snapk="end"]');
  await page.click('[data-snapk="grid"]');
  const [gx, gy] = await at(6512350.3, 150105.4, 0); await page.mouse.move(gx, gy); await page.waitForTimeout(120);
  v = await page.evaluate(() => ({ t: document.querySelector('.v3-snap').textContent, p: l3.lastSnap.toArray().map((x, i) => Math.round((x + l3.O[i]) * 1000) / 1000) }));
  if (v.t !== 'Rutnät' || v.p[0] !== 6512350 || v.p[1] !== 150105) fail('Rutnät 1 m: ' + JSON.stringify(v));
  await page.click('[data-snapk="grid"]');

  // --- Mät vinkel: 90° i containerns hörn.
  await page.click('[data-mmode="angle"]');
  await tap(6512332, 150111, 2, 3, -3); await tap(6512338, 150111, 2, -3, -3); await tap(6512338, 150109, 2, -3, 3);
  if (!(await page.locator('#v3Status').innerText()).startsWith('Vinkel 90')) fail('Mät vinkel: ' + await page.locator('#v3Status').innerText());
  // Mät yta: upplagets 4 hörn (10 × 5 = 50 m²), Enter.
  await page.click('[data-mmode="area"]');
  await tap(6512355, 150097.5, 0.3, 3, -3); await tap(6512365, 150097.5, 0.3, -3, -3); await tap(6512365, 150102.5, 0.3, -3, 3); await tap(6512355, 150102.5, 0.3, 3, 3);
  await page.keyboard.press('Enter');
  if (!(await page.locator('#v3Status').innerText()).startsWith('Yta 50 m²')) fail('Mät yta: ' + await page.locator('#v3Status').innerText());
  await page.click('[data-mmode="dist"]');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');

  // --- Flytta: relativa koordinater 3;4;0, orto, Ctrl-kopia och *3.
  await top();
  await page.keyboard.press('m');
  await tap(6512338, 150111, 2, -3, 3);       // c:s hörn
  for (const k of ['3', ';', '4', ';', '0']) await page.keyboard.press(k);
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  v = await P('c');
  if (v.x !== 6512338 || v.y !== 150114) fail('Relativt 3;4;0: ' + JSON.stringify([v.x, v.y]));
  await page.keyboard.press('o');
  await top();
  await tap(6512341, 150115, 2, -3, 3);       // hörnet igen
  await tap(6512350, 150116, 0, 0, 0);        // snett – orto ger bara X
  v = await P('c');
  if (v.y !== 150114 || Math.abs(v.x - (6512338 + 9)) > 0.3) fail('Orto: bara X-led: ' + JSON.stringify([v.x, v.y]));
  await page.keyboard.press('o');
  const n0 = await N();
  await top();
  await page.keyboard.press('Control'); // Ctrl tryckt och släppt = kopia
  if (!(await page.locator('#v3CopyMode').isChecked())) fail('Ctrl ska slå på Kopia');
  const cx = (await P('c')).x;
  await tap(cx + 3, 150115, 2, -3, 3);
  for (const k of ['5', ';', '0', ';', '0']) await page.keyboard.press(k);
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  if (await N() !== n0 + 1) fail('Ctrl-kopia ska skapa en kopia');
  for (const k of ['*', '3']) await page.keyboard.press(k);
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  v = await page.evaluate(() => placements.slice(-3).map(p => p.x));
  if (await N() !== n0 + 3 || Math.abs(v[2] - v[0] - 10) > 1e-6) fail('*3 ska ge 3 kopior i rad: ' + v);
  for (const k of ['/', '2']) await page.keyboard.press(k);
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  v = await page.evaluate(() => placements.slice(-2).map(p => p.x));
  if (await N() !== n0 + 2 || Math.abs(v[1] - v[0] - 2.5) > 1e-6) fail('/2 ska ge 2 kopior jämnt fördelade: ' + v);

  // --- Musschema Standard: vänster-dra roterar (ingen ruta).
  await page.keyboard.press('Escape');
  await page.click('#v3ShowBtn'); await page.click('[data-v3mouse="standard"]'); await page.keyboard.press('Escape');
  const q0 = await page.evaluate(() => l3.camera.position.toArray());
  await drag([cv.x + 300, cv.y + 300], [cv.x + 380, cv.y + 240]);
  if (Math.hypot(...(await page.evaluate(() => l3.camera.position.toArray())).map((x, i) => x - q0[i])) < 0.1) fail('Standard: vänster-dra ska rotera');
  await page.click('#v3ShowBtn'); await page.click('[data-v3mouse="tekla"]');

  await page.waitForTimeout(2200);
  if (getStore('plan_placements.json').length !== await N()) fail('Allt ska vara sparat');
  const names = await page.evaluate(() => placements.map(p => p.name));
  if (new Set(names).size !== names.length) fail('Kopiornas namn ska vara unika: ' + names);
  if (process.env.SHOT) { await page.keyboard.press('Escape'); await page.evaluate(() => { l3SelectIds(['a', 'b']); l3SetPref('special', { ...l3Prefs().special, tab: 'lin' }); l3OpenSpecial('copy'); l3Frame(false); }); await page.waitForTimeout(400); await page.screenshot({ path: process.env.SHOT }); }
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3dtekla');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
