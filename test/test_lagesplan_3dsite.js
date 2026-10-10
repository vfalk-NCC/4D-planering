// DXF och 2D-lägesplanens lager i 3D (Victor 2026-10-10: "visning och import av DXF" och "tända upp alla
// lager och saker som ligger i 2d-lägesplanen också"): CAD-underlagen ritas som linjer på marken med
// tänd/släck per CAD-lager (samma inställning som i 2D), övriga 2D-lager som en bild på marken, och en DXF
// kan läsas in direkt i 3D – från fil eller ur projektets mappar i Trimble Connect.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9002;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
// pako (komprimering av CAD-geometrin): en enkel ersättare – testet läser aldrig tillbaka filen.
const PAKO = `window.pako = { gzip: s => new TextEncoder().encode(String(s)), ungzip: (u, o) => new TextDecoder().decode(u) };`;
const DXF = n => ['0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '8', n, '10', '6512340', '20', '150110', '11', '6512345', '21', '150110', '0', 'ENDSEC', '0', 'EOF', ''].join('\n');

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: /pako/.test(r.request().url()) ? PAKO : PDFJS }));
  const gh = new Map();
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
    const body = JSON.parse(req.postData() || '{}'); gh.set(f, Buffer.from(body.content || '', 'base64').toString());
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async grund => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    // En inlagd DXF (Utsättning) med två CAD-lager, i modellens koordinater.
    const rec = { id: 'c1', type: 'cad', name: 'Utsättning', path: 'x', colorMode: 'orig', weight: 1, layers: [{ name: 'AXLAR', color: '#ff0000', n: 1 }, { name: 'MÅTT', color: '#0000ff', n: 1 }], stats: { lines: 2, texts: 0, kb: 1 } };
    siteItems.push(rec); ls('cad:c1').visible = true;
    cadGeom.set('c1', buildCadGeom({ origin: [6512350, 150120], groups: [{ l: 0, c: '#ff0000', p: [[0, 0, 10000, 0, 10000, 5000]], t: [] }, { l: 1, c: '#0000ff', p: [[0, 1000, 2000, 1000]], t: [] }] }));
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    window.__calls = [];
    askOpener = async (type, extra) => {
      window.__calls.push([type, extra && (extra.fileId || extra.folderId) || null]);
      if (type === 'tcFolder' && !extra.folderId) return { folderId: 'root', projectName: 'Kvarteret', items: [{ id: 'f1', name: 'CAD', type: 'folder' }] };
      if (type === 'tcFolder' && extra.folderId === 'f1') return { folderId: 'f1', items: [{ id: 'D1', name: 'Grund.dxf', type: 'file', size: 300 }, { id: 'P1', name: 'Plan.pdf', type: 'file', size: 10 }] };
      if (type === 'tcFile' && extra.fileId === 'D1') return { bytes: new TextEncoder().encode(grund).buffer };
      if (type === 'tcUpload') { window.__calls.push(['upload', extra.files.map(f => f.name).join()]); return { uploaded: 1 }; }
      return {};
    };
  }, DXF('GRUND'));
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  // 2D-lagren är släckta när 3D öppnas (Victor 2026-10-10); 2D-läget sparas undan och står kvar i webbläsaren.
  await page.waitForFunction(() => l3s.snap2d, null, { timeout: 10000 });
  const st0 = await page.evaluate(() => ({ cad: ls('cad:c1').visible, snap: l3s.snap2d['cad:c1'], saved: (JSON.parse(localStorage.getItem(LAYER_KEY()) || '{}')['cad:c1'] || {}).visible }));
  if (st0.cad !== false || st0.snap !== true) fail('2D-lagren ska vara släckta när 3D öppnas: ' + JSON.stringify(st0));
  await page.evaluate(() => { saveLayerState(); });
  if (await page.evaluate(() => (JSON.parse(localStorage.getItem(LAYER_KEY()) || '{}')['cad:c1'] || {}).visible) !== true) fail('Webbläsaren ska spara 2D-läget medan 3D är öppen');
  await page.click('#v3PalLayers [data-l3s="cad:c1"]').catch(async () => { await page.click('[data-paltab="layers"]'); await page.click('#v3PalLayers [data-l3s="cad:c1"]'); });
  await page.waitForFunction(() => l3.groups.cad && l3.groups.cad.children.length === 2, null, { timeout: 10000 });

  // DXF som linjer på marken, i modellens koordinater.
  const lines = await page.evaluate(() => {
    const [a, b] = l3.groups.cad.children, p = a.geometry.getAttribute('position');
    return { n: p.count, x0: p.getX(0) + l3.O[0], y0: p.getY(0) + l3.O[1], x1: p.getX(1) + l3.O[0], z: a.position.z + l3.O[2], col: '#' + a.material.color.getHexString(), col2: '#' + b.material.color.getHexString(), vis: [a.visible, b.visible] };
  });
  if (lines.n !== 4 || Math.abs(lines.x0 - 6512350) > 1e-3 || Math.abs(lines.y0 - 150120) > 1e-3 || Math.abs(lines.x1 - 6512360) > 1e-3 || lines.z < 0 || lines.z > 0.1 || lines.col !== '#ff0000' || lines.col2 !== '#0000ff' || lines.vis.join() !== 'true,true')
    fail('DXF-linjerna i 3D: ' + JSON.stringify(lines));

  // Markera DXF:en genom att trycka på en linje: panel med uppgifter och läge (förskjutning 2D+3D, höjd i 3D).
  {
    const scrOf = (x, y, z = 0.03) => page.evaluate(([x, y, z]) => { const r = l3.renderer.domElement.getBoundingClientRect(), q = l3ToScreen(new THREE.Vector3(x - l3.O[0], y - l3.O[1], l3sZ() + z)); return [r.left + q.x, r.top + q.y]; }, [x, y, z]);
    const [lx, ly] = await scrOf(6512355, 150120);
    await page.mouse.click(lx, ly); await page.waitForTimeout(200);
    const s1 = await page.evaluate(() => ({ sel: l3ss.sel, side: (document.querySelector('#v3Side .v3-sub') || {}).textContent, col: l3.groups.cad.children.filter(o => o.userData.cadId === 'c1').map(o => '#' + o.material.color.getHexString()) }));
    if (!s1.sel || s1.sel.kind !== 'cad' || s1.sel.id !== 'c1' || !/DXF/.test(s1.side || '') || s1.col.some(c => c !== '#f59e0b')) fail('Markera DXF i 3D: ' + JSON.stringify(s1));
    await page.fill('#v3Side [data-ssf="dx"]', '2'); await page.fill('#v3Side [data-ssf="dy"]', '1'); await page.fill('#v3Side [data-ssf="z3"]', '0,5');
    await page.click('#v3SsApply'); await page.waitForTimeout(500);
    const mv = await page.evaluate(() => { const o = l3.groups.cad.children.find(c => c.userData.cadId === 'c1' && c.visible), p = o.geometry.getAttribute('position'); return { x0: p.getX(0) + l3.O[0], y0: p.getY(0) + l3.O[1], z: o.position.z, z0: l3sZ() + 0.03, origin: cadGeom.get('c1').origin, shift: cads().find(r => r.id === 'c1').shift }; });
    const saved = JSON.parse(gh.get('projects/p1/site_layers.json') || '[]').find(r => r.id === 'c1') || {};
    if (Math.abs(mv.x0 - 6512352) > 1e-3 || Math.abs(mv.y0 - 150121) > 1e-3 || Math.abs(mv.z - mv.z0 - 0.5) > 1e-6 || JSON.stringify(saved.shift) !== '[2,1]' || saved.z3 !== 0.5) fail('Flytta DXF: ' + JSON.stringify({ mv, saved: { shift: saved.shift, z3: saved.z3 } }));
    await page.keyboard.press('Control+z'); await page.waitForTimeout(400);
    const back = await page.evaluate(() => { const o = l3.groups.cad.children.find(c => c.userData.cadId === 'c1' && c.visible), p = o.geometry.getAttribute('position'); return { x0: p.getX(0) + l3.O[0], shift: cads().find(r => r.id === 'c1').shift || null }; });
    if (Math.abs(back.x0 - 6512350) > 1e-3 || back.shift) fail('Ctrl+Z ska flytta tillbaka DXF:en: ' + JSON.stringify(back));
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    if (await page.evaluate(() => !!l3ss.sel)) fail('Esc ska avmarkera DXF:en');
    // Tryck på marken (inget markerat): arbetsytans PDF markeras; flytta 1 m i X ändrar kalibreringen.
    const [gx, gy] = await scrOf(6512330, 150140, 0);
    await page.mouse.click(gx, gy); await page.waitForTimeout(200);
    const pd = await page.evaluate(() => ({ sel: l3ss.sel, side: (document.querySelector('#v3Side .v3-sub') || {}).textContent, ring: !!l3ss.ring, m0: plan.calib.model[0].slice() }));
    if (!pd.sel || pd.sel.kind !== 'pdf' || !/PDF/.test(pd.side || '') || !pd.ring) fail('Markera PDF:en: ' + JSON.stringify(pd));
    await page.fill('#v3Side [data-ssf="dx"]', '1'); await page.click('#v3SsApply'); await page.waitForTimeout(500);
    const m1 = await page.evaluate(() => plan.calib.model[0].slice());
    if (Math.abs(m1[0] - pd.m0[0] - 1) > 1e-6 || Math.abs(m1[1] - pd.m0[1]) > 1e-6) fail('Flytta PDF:en: ' + JSON.stringify({ m0: pd.m0, m1 }));
    await page.keyboard.press('Control+z'); await page.waitForTimeout(400);
    if (Math.abs((await page.evaluate(() => plan.calib.model[0][0])) - pd.m0[0]) > 1e-6) fail('Ctrl+Z ska ta tillbaka kalibreringen');
    if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS });
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  }

  // Lager: 2D-lagren med DXF:en och dess CAD-lager; tänd/släck är samma som i 2D.
  await page.click('[data-paltab="layers"]');
  await page.waitForSelector('#v3PalLayers [data-l3s="cad:c1"]');
  await page.click('#v3PalLayers [data-l3s-open="cad:c1"]');
  await page.click('#v3PalLayers [data-l3s="cadl:c1:MÅTT"]');
  await page.waitForTimeout(250);
  const off = await page.evaluate(() => ({ ls: ls('cadl:c1:MÅTT').visible, vis: l3.groups.cad.children.map(o => o.visible) }));
  if (off.ls !== false || off.vis.join() !== 'true,false') fail('CAD-lagret MÅTT ska släckas i både 2D och 3D: ' + JSON.stringify(off));
  await page.click('#v3PalLayers [data-l3s="cad:c1"]');
  await page.waitForTimeout(250);
  if (await page.evaluate(() => ls('cad:c1').visible || l3.groups.cad.children.some(o => o.visible))) fail('Hela DXF:en ska kunna släckas');
  await page.click('#v3PalLayers [data-l3s="cad:c1"]');
  await page.waitForTimeout(250);

  // Övriga 2D-lager (zoner, noteringar …) som bild på marken; kan stängas av.
  await page.evaluate(() => { setLayersVisible(layerDrawOrder().filter(k => k !== 'pdf' && !k.startsWith('cad')), true); l3sRefresh(0); l3LayersRender(); });
  await page.waitForFunction(() => l3.groups.ground2d && l3.groups.ground2d.children.length === 1, null, { timeout: 10000 });
  const gr = await page.evaluate(() => { const m = l3.groups.ground2d.children[0], p = m.geometry.getAttribute('position'), xs = [0, 1, 2, 3].map(i => p.getX(i) + l3.O[0]); return { minX: Math.min(...xs), maxX: Math.max(...xs), transparent: m.material.transparent, img: m.material.map.image.width }; });
  if (Math.abs(gr.minX - 6512300) > 0.01 || Math.abs(gr.maxX - 6512400) > 0.01 || !gr.transparent || gr.img < 500) fail('2D-lagren på marken: ' + JSON.stringify(gr));
  if (await page.$('#v3S2d')) fail('Kryssrutan "på marken" ska vara borta – varje lager tänds för sig');

  // Läs in en DXF direkt i 3D (fil) – blir ett CAD-lager i lägesplanen, ritas som linjer.
  await page.setInputFiles('#v3SDxfIn', { name: 'Ny ritning.dxf', mimeType: 'application/dxf', buffer: Buffer.from(DXF('NYTT')) });
  await page.waitForFunction(() => cads().length === 2 && l3.groups.cad.children.length === 3, null, { timeout: 15000 });
  const nyy = await page.evaluate(() => { const r = cads().find(x => x.name === 'Ny ritning'), o = l3.groups.cad.children.find(c => c.userData.cadId === r.id), p = o.geometry.getAttribute('position'); return { layers: r.layers.map(l => l.name).join(), x: p.getX(0) + l3.O[0], x1: p.getX(1) + l3.O[0], uploads: window.__calls.filter(c => c[0] === 'upload').length }; });
  if (nyy.layers !== 'NYTT' || Math.abs(nyy.x - 6512340) > 1e-3 || Math.abs(nyy.x1 - 6512345) > 1e-3) fail('DXF från fil: ' + JSON.stringify(nyy));
  if (!gh.has('projects/p1/site_layers.json') || !/Ny ritning/.test(gh.get('projects/p1/site_layers.json'))) fail('DXF:en ska sparas som CAD-lager i lägesplanen');

  // DXF ur projektets mappar i Trimble Connect: syns i trädet och läses in (laddas inte upp igen).
  // Fliken Trimble Connect mapp (Hämtade 3D-modeller är förvald).
  await page.click('#v3PalLayers [data-l3l-sort="tree"]');
  await page.waitForSelector('#v3PalLayers [data-l3l-dir="f1"]', { timeout: 5000 });
  await page.click('#v3PalLayers [data-l3l-dir="f1"]');
  await page.waitForSelector('#v3PalLayers [data-l3l-dxf="D1"]', { timeout: 5000 });
  if (await page.$('#v3PalLayers [data-l3l-file="P1"], #v3PalLayers [data-l3l-dxf="P1"]')) fail('PDF ska inte listas bland modellerna');
  await page.click('#v3PalLayers [data-l3l-dxf="D1"]');
  await page.waitForFunction(() => cads().some(r => r.name === 'Grund'), null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const tc = await page.evaluate(() => ({ uploads: window.__calls.filter(c => c[0] === 'upload' && /Grund/.test(c[1])).length, eye: document.querySelector('#v3PalLayers [data-l3l-dxf="D1"]').classList.contains('on'), lines: l3.groups.cad.children.filter(o => o.visible).length }));
  if (tc.uploads || !tc.eye || tc.lines !== 3) fail('DXF från TC (MÅTT är släckt sedan tidigare): ' + JSON.stringify(tc));
  // Ögat i trädet släcker den inlästa DXF:en.
  await page.click('#v3PalLayers [data-l3l-dxf="D1"]'); await page.waitForTimeout(250);
  if ((await page.evaluate(() => l3.groups.cad.children.filter(o => o.visible).length)) !== 2) fail('Ögat ska släcka DXF:en');

  if (process.env.SHOT) { await page.evaluate(() => { l3Frame(true); }); await page.waitForTimeout(700); await page.screenshot({ path: process.env.SHOT }); }
  // Tillbaka till 2D: lagren som de var i 2D (DXF:en tänd, de övriga som före 3D).
  const before = await page.evaluate(() => ({ ...l3s.snap2d }));
  await page.click('#v3Close'); await page.waitForTimeout(200);
  const after = await page.evaluate(keys => ({ snap: l3s.snap2d, vis: Object.fromEntries(keys.map(k => [k, ls(k).visible])) }), Object.keys(before));
  if (after.snap || Object.keys(before).some(k => before[k] !== after.vis[k])) fail('2D-lagren ska återställas när 3D stängs: ' + JSON.stringify({ before, after }));
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3dsite');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
