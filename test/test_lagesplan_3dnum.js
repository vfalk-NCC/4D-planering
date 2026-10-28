// 3D-editorn: direktmodifiering som i Tekla – handtag för längd/bredd/höjd (motsatt sida står kvar,
// fäster mot hörn och steget, Esc avbryter, ett ångra-steg per drag), kranens räckvidd och staketets
// punkter (flytta, lägga till med plus, ta bort med dubbelklick).
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 18986;
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
  await page.waitForTimeout(150);
  const pa = await P('a'); const x0 = pa.x, y0 = pa.y, r0 = Number(pa.rot) || 0;
  // Flytt längs X: musen över X-pilen (axeln sätts som när handtaget hovras), börja skriva 6,43 och Enter
  await page.evaluate(() => { l3.gizmo.axis = 'X'; });
  await page.keyboard.press('6'); await page.waitForSelector('#v3Num input', { timeout: 3000 });
  const lab = await page.textContent('#v3Num span');
  await page.keyboard.type(',43'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  const pb = await P('a');
  if (!/längs X/.test(lab) || Math.abs(pb.x - x0 - 6.43) > 0.006 || Math.abs(pb.y - y0) > 0.006) fail('Flytt 6,43 längs X: ' + JSON.stringify({ lab, dx: pb.x - x0, dy: pb.y - y0 }));
  if (await page.$('#v3Num')) fail('Rutan ska stängas efter Enter');
  // Vrid: musen över ringen, skriv 32,3 och Enter
  await page.evaluate(() => { l3.gizmo.axis = null; l3.gizmoR.axis = 'Z'; });
  await page.keyboard.press('3'); await page.waitForSelector('#v3Num input', { timeout: 3000 });
  const lab2 = await page.textContent('#v3Num span');
  await page.keyboard.type('2,3'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  const pc = await P('a'); const dr = ((Number(pc.rot) || 0) - r0 + 360) % 360;
  if (lab2 !== 'Vrid' || Math.abs(dr - 32.3) > 0.11) fail('Vrid 32,3: ' + JSON.stringify({ lab2, dr, rot: pc.rot }));
  // Ogiltigt värde ger inget; Esc stänger; flytt i höjd och i planet
  await page.evaluate(() => { l3.gizmoR.axis = null; l3.gizmo.axis = 'Z'; });
  await page.keyboard.press('1'); await page.waitForSelector('#v3Num input'); await page.keyboard.type('abc'); await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  if (!(await page.$('#v3Num'))) fail('Ogiltigt värde ska lämna rutan öppen');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  if (await page.$('#v3Num')) fail('Esc ska stänga rutan');
  const pd = await P('a');
  await page.evaluate(() => { l3.gizmo.axis = 'XY'; });
  await page.keyboard.press('2'); await page.waitForSelector('#v3Num input'); await page.keyboard.type(';3'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  const pe = await P('a');
  if (Math.abs(pe.x - pd.x - 2) > 0.006 || Math.abs(pe.y - pd.y - 3) > 0.006) fail('Flytt i planet 2;3: ' + JSON.stringify({ dx: pe.x - pd.x, dy: pe.y - pd.y }));
  // Tryck på ringen utan att dra öppnar rutan (tryck i tomma luften avmarkerar annars – här ersatt av en tom funktion)
  await page.evaluate(() => { window.__tap = l3Tap; l3Tap = () => {}; l3SelectIds(['a']); });
  await page.waitForTimeout(150);
  await page.evaluate(() => { l3.gizmo.axis = null; l3.gizmoR.axis = 'Z'; });
  await page.mouse.move(cv.x + 300, cv.y + 300); await page.evaluate(() => { l3.gizmoR.axis = 'Z'; });
  await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(300);
  if (!(await page.$('#v3Num input')) || await page.textContent('#v3Num span') !== 'Vrid') fail('Klick på ringen ska öppna vridrutan ' + JSON.stringify(await page.evaluate(() => ({ t: l3numTarget(), ro: !!l3.gizmoR.object, ra: l3.gizmoR.axis, go: !!l3.gizmo.object, tool: l3.tool, el: document.elementFromPoint(window.__x || 0, 0) && 1 }))));
  await page.keyboard.press('Escape');
  // Smart mått: sidled mått (blå pil) åt höger/vänster till närmaste andra objekt
  { const sm = await page.evaluate(async () => {
      const O = l3.O, mk = (id, dx) => { const p = { id, type: 'container', name: id, x: O[0] + 200 + dx, y: O[1] + 200, z: 0, L: 6.06, B: 2.44, H: 2.59, R: 0, rot: 0 }; placements.push(p); const g = l3AddPlacementMesh(p); g.updateMatrixWorld(true); return [p, g]; };
      const [p1, g1] = mk('smA', 0), [p2, g2] = mk('smB', 10);
      const bb = new THREE.Box3().setFromObject(g1), c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
      l3StopFly(); l3.camera.position.set(c.x + 5, bb.min.y - 22, c.z + 1); l3.orbit.target.set(c.x + 5, c.y, c.z); l3.orbit.update(); l3.camera.updateMatrixWorld(); l3Render();
      const q = l3ToScreen(new THREE.Vector3(c.x, bb.min.y, c.z)), r = l3.renderer.domElement.getBoundingClientRect();
      const n0 = l3m.list.length; l3SmartMeasure({ clientX: r.left + q.x, clientY: r.top + q.y, button: 0 }); const added = l3m.list.slice(n0);
      const right = added.find(m => /^Höger till/.test(m.note || '')), left = added.find(m => /^Vänster till/.test(m.note || ''));
      const out = { right: right && right.text, left: !!left, notes: added.map(m => m.note), sz: sz.x };
      l3m.list.splice(n0); l3mDraw(); placements.splice(placements.indexOf(p1), 1); placements.splice(placements.indexOf(p2), 1); [[p1, g1], [p2, g2]].forEach(([p, g]) => { l3.groups.places.remove(g); l3.placeMeshes.delete(p.id); });
      return out;
    });
    const gap = parseFloat(String(sm.right || '').replace(',', '.'));
    if (!(gap > 3 && gap < 12)) fail('Smart mått åt höger: ' + JSON.stringify(sm)); console.log('smart mått sidled OK', JSON.stringify(sm)); }
  // Flera markerade: handtagets riktning (Objekt-rymd) utgår från det första markerade objektet
  { const r = await page.evaluate(async () => {
      const [a, b] = placements.filter(p => !(placeLib(p.type) || {}).fence); a.rot = 30; b.rot = 70; l3RebuildOne(a); l3RebuildOne(b);
      l3SelectIds([b.id, a.id]); await new Promise(r => setTimeout(r, 150)); const first = l3gx.pivot && Math.round(l3gx.pivot.rotation.z * 180 / Math.PI);
      l3SelectIds([a.id, b.id]); await new Promise(r => setTimeout(r, 150)); const second = l3gx.pivot && Math.round(l3gx.pivot.rotation.z * 180 / Math.PI);
      return { first, second, multi: l3.gizmo.object === l3gx.pivot };
    });
    if (!r.multi || r.first !== 70 || r.second !== 30) fail('Flera markerade: pivot ska följa första objektets vridning: ' + JSON.stringify(r)); console.log('flera markerade OK', JSON.stringify(r)); }
  if (errors.filter(e => !/allow-same-origin/.test(e)).length) fail('sidfel: ' + errors.slice(0, 3).join(' | '));
  console.log('OK test_lagesplan_3dnum – exakt flytt och vridning med tangentbordet (6,43 m längs X, 32,3°, i planet)');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
