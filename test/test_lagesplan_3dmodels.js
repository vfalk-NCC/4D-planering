// Hämta modell i lägesplanens 3D-editor (Victor 2026-10-09: "importera IFC:er från Trimble Connect"
// och "plocka in saker från Sketchfab i 3D-editorn"): samma panel som i Placera i 3D – bläddra i
// projektets mappar i TC (via 4D-planering), hämta en modellfil, spara den i biblioteket (Egna
// modeller) och placera den med ett tryck. Sketchfab-sökningen visas i samma ruta.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8991;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
// En bod 6 × 2,5 × 2,6 m som OBJ.
const OBJ = ['v 0 0 0', 'v 6 0 0', 'v 6 2.5 0', 'v 0 2.5 0', 'v 0 0 2.6', 'v 6 0 2.6', 'v 6 2.5 2.6', 'v 0 2.5 2.6',
  'f 1 2 3 4', 'f 5 6 7 8', 'f 1 2 6 5', 'f 2 3 7 6', 'f 3 4 8 7', 'f 4 1 5 8'].join('\n');
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); localStorage.setItem('4dplan-sketchfab-token', 'sf-key'); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  // Sketchfab: inloggad, en träff.
  await page.route('https://api.sketchfab.com/**', r => {
    const u = r.request().url();
    if (u.includes('/me')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ username: 'victor', displayName: 'Victor' }) });
    if (u.includes('/search')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [{ uid: 'u1', name: 'Tower crane', faceCount: 5000, user: { displayName: 'Anna' }, license: { label: 'CC BY' }, archives: { glb: { size: 900000, faceCount: 5000 } } }], next: null }) });
    return r.fulfill({ status: 404, body: '{}' });
  });
  const store = new Map(); let n = 0;
  store.set('projects/p1/plan_placements.json', { content: '[]', sha: 's0' });
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    const body = JSON.parse(req.postData()); if (e && body.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' });
    const sha = 's' + (++n); store.set(f, { content: Buffer.from(body.content, 'base64').toString(), sha });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async obj => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    window.__calls = [];
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    // 4D-planering (som har TC-behörigheten) svarar på mapplistor och filer.
    askOpener = async (type, extra) => {
      window.__calls.push([type, extra && (extra.folderId || extra.fileId) || null]);
      if (type === 'tcFolder' && !extra.folderId) return { folderId: 'root', projectName: 'Kvarteret', items: [{ id: 'f1', name: 'Etablering', type: 'folder' }, { id: 'x1', name: 'Ritning.pdf', type: 'file', size: 2000 }] };
      if (type === 'tcFolder' && extra.folderId === 'f1') return { folderId: 'f1', items: [{ id: 'F1', name: 'Bod.obj', type: 'file', size: obj.length, modified: '2026-10-01T10:00:00Z' }, { id: 'x2', name: 'Bild.png', type: 'file', size: 10 }] };
      if (type === 'tcFile' && extra.fileId === 'F1') return { bytes: new TextEncoder().encode(obj).buffer };
      return {};
    };
  }, OBJ);
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  await page.waitForTimeout(400);

  // Knappen under biblioteket öppnar Hämta modell med tre flikar.
  await page.click('#v3GetModel'); await page.waitForTimeout(200);
  const tabs = await page.$$eval('#v3Models [data-pmtab]', b => b.map(x => x.textContent));
  if (await page.isHidden('#v3Models') || tabs.join('|') !== 'Sketchfab|Trimble Connect|Från fil') fail('Hämta modell ska öppnas med Sketchfab, Trimble Connect och Från fil: ' + tabs);

  // Sketchfab: sök visar kort.
  await page.fill('#pmQuery', 'kran'); await page.press('#pmQuery', 'Enter');
  await page.waitForSelector('#v3Models .pm-card', { timeout: 5000 });
  if (!/Tower crane/.test(await page.textContent('#v3Models .pm-grid'))) fail('Sketchfab-sökningen ska visa träffarna i 3D-editorn');

  // Trimble Connect: rotmappen, en undermapp, bara modellfiler.
  await page.click('#v3Models [data-pmtab="tc"]');
  await page.waitForSelector('#v3Models [data-tcdir="f1"]', { timeout: 5000 });
  if (!/Kvarteret/.test(await page.textContent('#v3Models .pm-crumbs'))) fail('Sökvägen ska börja i projektet');
  if (await page.$('#v3Models [data-tcfile="x1"]')) fail('PDF-filer ska inte visas som modeller');
  await page.click('#v3Models [data-tcdir="f1"]');
  await page.waitForSelector('#v3Models [data-tcfile="F1"]', { timeout: 5000 });
  const crumbs = await page.textContent('#v3Models .pm-crumbs');
  if (!/Kvarteret.*Etablering/.test(crumbs) || !/1 andra filer/.test(await page.textContent('#v3Models'))) fail('Undermappen ska visas med sökväg och antal dolda filer: ' + crumbs);
  await page.click('#v3Models [data-tcfile="F1"]');
  await page.waitForSelector('#pmAccept', { timeout: 10000 });
  const conf = await page.textContent('#v3Models .pm-confirm');
  if (!/6 × 2.6 × 2.5 m/.test(conf)) fail('Bekräftelsen ska visa modellens mått: ' + conf);
  await page.fill('#pmName', 'Bod från TC');
  await page.click('#pmAccept');
  await page.waitForFunction(() => placeAssets.length === 1 && l3.addType && l3.addType.startsWith('model:'), null, { timeout: 10000 });
  const lib = JSON.parse(store.get('projects/p1/plan_models.json').content);
  if (lib.length !== 1 || lib[0].source !== 'Trimble Connect' || lib[0].name !== 'Bod från TC' || ![...store.keys()].some(k => /models\/.+\.json$/.test(k))) fail('Modellen ska sparas i biblioteket med källan Trimble Connect: ' + JSON.stringify(lib));
  if (!(await page.isHidden('#v3Models'))) fail('Rutan ska stängas när modellen är tillagd');
  if (!/Bod från TC/.test(await page.textContent('#v3Lib'))) fail('Modellen ska finnas under Egna modeller');

  // Ett tryck i scenen placerar den.
  const cv = await page.locator('#v3Canvas canvas').boundingBox();
  await page.evaluate(() => { l3StopFly(); const c = new THREE.Vector3(6512340 - l3.O[0], 150120 - l3.O[1], 0); l3.camera.position.set(c.x, c.y - 0.01, 90); l3.orbit.target.copy(c); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); });
  const [sx, sy] = await page.evaluate(() => { const q = l3ToScreen(new THREE.Vector3(6512340 - l3.O[0], 150120 - l3.O[1], 0)); return [q.x, q.y]; });
  await page.mouse.move(cv.x + sx, cv.y + sy); await page.waitForTimeout(60); await page.mouse.click(cv.x + sx, cv.y + sy); await page.waitForTimeout(300);
  const placed = await page.evaluate(() => placements.map(p => ({ type: p.type, x: p.x, y: p.y })));
  if (placed.length !== 1 || !placed[0].type.startsWith('model:') || Math.abs(placed[0].x - 6512340) > 1.5) fail('Ett tryck ska placera modellen: ' + JSON.stringify(placed));

  // Esc stänger rutan.
  await page.click('#v3GetModel'); await page.waitForTimeout(150);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  if (!(await page.isHidden('#v3Models'))) fail('Esc ska stänga Hämta modell');
  // Snabbsök (Ctrl+K) har kommandot.
  if (!(await page.evaluate(() => l3Commands().some(c => /Hämta modell/.test(c.label))))) fail('Snabbsök ska ha Hämta modell');

  if (process.env.SHOT) { await page.click('#v3GetModel'); await page.click('#v3Models [data-pmtab="tc"]'); await page.waitForTimeout(300); await page.screenshot({ path: process.env.SHOT }); }
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3dmodels');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
