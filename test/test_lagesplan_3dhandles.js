// 3D-editorn: direktmodifiering som i Tekla – handtag för längd/bredd/höjd (motsatt sida står kvar,
// fäster mot hörn och steget, Esc avbryter, ett ångra-steg per drag), kranens räckvidd och staketets
// punkter (flytta, lägga till med plus, ta bort med dubbelklick).
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8986;
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
  store.set('projects/p1/plan_placements.json', { content: JSON.stringify([C('a', 6512320, 150110, 'Container 1'), C('c', 6512335, 150110, 'Container 3'),
    { id: 'k', type: 'tornkran', name: 'Tornkran 1', x: 6512320, y: 150140, z: 0, L: 1.6, B: 1.6, H: 40, R: 20, rot: 0, dz: 0, color: '#facc15' },
    { id: 'f', type: 'staket', name: 'Staket 1', x: 6512340, y: 150130, z: 0, H: 2, dz: 0, color: '#16a34a', pts: [[6512340, 150130, 0], [6512350, 150130, 0], [6512350, 150140, 0]] }]), sha: 's0' });
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
  const at = async (x, y, z) => { const q = await page.evaluate(([x, y, z]) => { const q = l3ToScreen(new THREE.Vector3(x - l3.O[0], y - l3.O[1], z - l3.O[2])); return [q.x, q.y]; }, [x, y, z]); return [cv.x + q[0], cv.y + q[1]]; };
  const P = id => page.evaluate(id => JSON.parse(JSON.stringify(placements.find(x => x.id === id))), id);
  const view = () => page.evaluate(() => { l3StopFly(); const c = new THREE.Vector3(6512335 - l3.O[0], 150125 - l3.O[1], 0); l3.camera.position.set(c.x - 20, c.y - 45, 40); l3.orbit.target.copy(c); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); l3HandlesPos(); });
  const hd = async k => { const b = await page.locator(`.v3-hds [data-k="${k}"]`).boundingBox(); if (!b) fail('Handtag ' + k + ' syns inte'); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const dragTo = async (from, to, opts = {}) => {
    await page.mouse.move(from[0], from[1]); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(from[0] + (to[0] - from[0]) * i / 8, from[1] + (to[1] - from[1]) * i / 8); await page.waitForTimeout(20); }
    if (opts.esc) { await page.keyboard.press('Escape'); await page.waitForTimeout(50); }
    await page.mouse.up(); await page.waitForTimeout(120);
  };
  await page.evaluate(() => { document.getElementById('v3Step').value = '0.5'; l3ApplyStep(); });
  await view();
  await page.evaluate(() => l3SelectIds(['a']));
  await page.waitForTimeout(100);
  if (await page.locator('.v3-hds .v3-hd').count() !== 5) fail('Containern ska ha 5 handtag (4 sidor + topp): ' + await page.locator('.v3-hds .v3-hd').count());

  // Klick i ett fält utan ändring ger inget ångra-steg; en ändring ger exakt ett.
  let us = await page.evaluate(() => placeUndoStack.length);
  await page.click('[data-v3f="L"]'); await page.click('[data-v3f="B"]'); await page.mouse.click(cv.x + 5, cv.y + cv.height - 5);
  if (await page.evaluate(() => placeUndoStack.length) !== us) fail('Klick i fälten ska inte ge ångra-steg');
  await page.evaluate(() => l3SelectIds(['a']));
  await page.fill('[data-v3f="H"]', '2,5'); await page.press('[data-v3f="H"]', 'Tab');
  if ((await P('a')).H !== 2.5 || await page.evaluate(() => placeUndoStack.length) !== us + 1) fail('Ändrad höjd: ett steg i ångra');
  await page.evaluate(() => { placeUndo(); l3BuildPlacements(); l3SelectIds(['a']); });
  if ((await P('a')).H !== 2) fail('Ångra höjden');
  await view();

  // --- Längd: dra +L-handtaget 3 m österut -> L 9, västra sidan står kvar.
  const undo0 = await page.evaluate(() => placeUndoStack.length);
  await dragTo(await hd(0), await at(6512326, 150110, 1));
  let p = await P('a');
  if (p.L !== 9 || Math.abs(p.x - 6512321.5) > 1e-6) fail('L-handtaget: ' + JSON.stringify([p.L, p.x]));
  if (await page.evaluate(() => placeUndoStack.length) !== undo0 + 1) fail('Ett drag = ett steg i ångra');
  // Fäster mot c:s hörn (6512332, 150109, 2) -> L = 15 (västra sidan 6512317 står kvar).
  await view();
  await dragTo(await hd(0), await at(6512332, 150109, 2));
  p = await P('a');
  if (Math.abs(p.L - 15) > 1e-6 || Math.abs(p.x - 6512324.5) > 1e-6) fail('L-handtaget ska fästa mot hörnet: ' + JSON.stringify([p.L, p.x]));
  // Höjd.
  await view();
  await dragTo(await hd(4), await at(6512324.5, 150110, 5));
  p = await P('a');
  if (p.H !== 5) fail('H-handtaget: ' + p.H);
  // Esc avbryter och återställer (inget nytt ångra-steg).
  const before = await P('a'), u1 = await page.evaluate(() => placeUndoStack.length);
  await view();
  await dragTo(await hd(3), await at(6512324.5, 150105, 1), { esc: true });
  p = await P('a');
  if (p.B !== before.B || p.y !== before.y || await page.evaluate(() => placeUndoStack.length) !== u1) fail('Esc ska avbryta draget: ' + JSON.stringify([p.B, p.y]));
  if (await page.evaluate(() => !l3.sel.has('a'))) fail('Esc under draget ska inte avmarkera');
  // Ångra (Ctrl+Z) tar tillbaka höjden.
  await page.mouse.move(cv.x + 5, cv.y + 5);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
  if ((await P('a')).H !== 2) fail('Ctrl+Z ska ångra höjden');

  // --- Piltangenterna följer skärmen: sett från norr flyttar höger-pil åt väster (−X), upp-pil söderut.
  await page.evaluate(() => { l3StopFly(); const c = new THREE.Vector3(6512330 - l3.O[0], 150115 - l3.O[1], 0); l3.camera.position.set(c.x + 0.5, c.y + 45, 35); l3.orbit.target.copy(c); l3.orbit.update(); l3SelectIds(['a']); });
  let x0 = (await P('a')).x, y0 = (await P('a')).y;
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowUp'); await page.waitForTimeout(100);
  p = await P('a');
  if (Math.abs(p.x - (x0 - 0.5)) > 1e-6 || Math.abs(p.y - (y0 - 0.5)) > 1e-6) fail('Pilarna ska följa skärmen: ' + JSON.stringify([p.x - x0, p.y - y0]));
  await page.keyboard.press('Control+z'); await page.waitForTimeout(100);

  // --- Kranens räckvidd.
  await page.evaluate(() => l3SelectIds(['k'])); await view(); await page.waitForTimeout(80);
  if (await page.locator('.v3-hds .v3-hd-R').count() !== 1) fail('Kranen ska ha ett räckviddshandtag');
  const kR = await page.locator('.v3-hds .v3-hd-R').getAttribute('data-k');
  await dragTo(await hd(kR), await at(6512320, 150165, 0.05));
  if ((await P('k')).R !== 25) fail('Räckvidden: ' + (await P('k')).R);

  // --- Staket: flytta punkt, lägg till punkt, ta bort punkt.
  await page.evaluate(() => l3SelectIds(['f'])); await view(); await page.waitForTimeout(80);
  if (await page.locator('.v3-hds .v3-hd-pt').count() !== 3 || await page.locator('.v3-hds .v3-hd-ins').count() !== 2) fail('Staketet ska ha 3 punkter och 2 plus');
  await dragTo(await hd(1), await at(6512352, 150132, 0));
  p = await P('f');
  if (JSON.stringify(p.pts[1]) !== JSON.stringify([6512352, 150132, 0])) fail('Staketpunkten: ' + JSON.stringify(p.pts));
  await view();
  await dragTo(await hd(3), await at(6512345, 150125, 0)); // pluset på första sträckan
  p = await P('f');
  if (p.pts.length !== 4 || JSON.stringify(p.pts[1]) !== JSON.stringify([6512345, 150125, 0])) fail('Ny staketpunkt: ' + JSON.stringify(p.pts));
  await view();
  const d1 = await hd(1); await page.mouse.dblclick(d1[0], d1[1]); await page.waitForTimeout(150);
  p = await P('f');
  if (p.pts.length !== 3 || p.pts.some(q => q[1] === 150125)) fail('Dubbelklick ska ta bort punkten: ' + JSON.stringify(p.pts));
  // Första punkten: x/y följer med.
  await view();
  await dragTo(await hd(0), await at(6512338, 150128, 0));
  p = await P('f');
  if (p.x !== 6512338 || p.y !== 150128 || p.pts[0][0] !== 6512338) fail('Första punkten: ' + JSON.stringify([p.x, p.y, p.pts[0]]));

  // Inga handtag i andra verktyg eller med flera markerade.
  await page.evaluate(() => { l3SelectIds(['a', 'c']); l3Render(); }); await page.waitForTimeout(80);
  if (await page.locator('.v3-hds .v3-hd').count()) fail('Inga handtag med flera markerade');
  await page.evaluate(() => { l3SelectIds(['a']); l3SetTool('measure'); l3Render(); }); await page.waitForTimeout(80);
  if (await page.locator('.v3-hds .v3-hd').count()) fail('Inga handtag i Mät');
  await page.evaluate(() => l3SetTool('select'));

  await page.waitForTimeout(2200);
  const saved = getStore('plan_placements.json');
  if (saved.find(x => x.id === 'k').R !== 25 || saved.find(x => x.id === 'f').pts.length !== 3) fail('Ändringarna ska vara sparade');
  if (process.env.SHOT) { await page.evaluate(() => l3SelectIds(['a'])); await view(); await page.waitForTimeout(300); await page.screenshot({ path: process.env.SHOT }); }
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3dhandles');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
