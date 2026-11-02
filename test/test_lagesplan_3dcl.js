// Saxen i 3D (dragbart handtag, snittkanter, släpps vid verktygsbyte), fäst mot DXF (3D först),
// DXF-texter i 3D och egna kortkommandon i snabbsöket (Victor 2026-10-10).
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9061;
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
    cadGeom.set('c1', buildCadGeom({ origin: [6512350, 150120], groups: [{ l: 0, c: '#ff0000', p: [[0, 0, 10000, 0, 10000, 5000]], t: [[2000, 2000, 500, 0, 'A12', 'lb'], [4000, 2000, 500, 90, 'K10\nFUND', 'cm']] }, { l: 1, c: '#0000ff', p: [[0, 1000, 2000, 1000]], t: [] }] }));
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
  // Hjälplinjer (construction lines): skapa, fäst i linje/skärning, parallell med avstånd, ta bort (Victor 2026-11-02)
  await page.evaluate(() => { l3SetPref('navHelp', false); l3NavHelp(); l3SetProjection && l3SetProjection(false); const c = l3.orbit.target.clone(); l3.camera.position.set(c.x, c.y - 0.01, c.z + 40); l3.orbit.update(); l3clOpen(); });
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => { const O = l3.O, S = p => { const q = l3ToScreen(new THREE.Vector3(p[0] - O[0], p[1] - O[1], p[2] - O[2])), r = l3.renderer.domElement.getBoundingClientRect(); return [r.left + q.x, r.top + q.y]; }; const c = l3.orbit.target; const base = [c.x + O[0], c.y + O[1], c.z + O[2]]; return { base, a: S([base[0] - 5, base[1] - 3, base[2]]), b: S([base[0] + 6, base[1] - 3, base[2]]) , c: S([base[0] - 5, base[1] + 4, base[2]]) }; });
  // två punkter: musklick med verktyget
  await page.click('[data-clm="two"]'); await page.mouse.click(info.a[0], info.a[1]); await page.mouse.click(info.b[0], info.b[1]); await page.waitForTimeout(150);
  const L1 = await page.evaluate(() => ({ n: l3cl.lines.length, d: l3cl.lines[0] && l3cl.lines[0].d.map(v => Math.round(v * 100) / 100), pts: l3cl.pts.length }));
  if (L1.n !== 1 || Math.abs(Math.abs(L1.d[0]) - 1) > 0.05 || L1.pts !== 2) fail('Två punkter: ' + JSON.stringify(L1));
  // Esc avslutar verktyget, sedan en lodrät axel genom en punkt och en skärning
  await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  const I = await page.evaluate(() => { const base = l3cl.lines[0].p; l3clAddLine([base[0] - 3, base[1] - 20, base[2]], [0, 1, 0], 'Y-test'); const it = l3clInter(); return { mode: l3cl.mode, n: it.length, p: it[0], base }; });
  if (I.mode !== null || I.n !== 1) fail('Esc / skärning: ' + JSON.stringify(I));
  // fäst i skärningen och på linjen
  const sn = await page.evaluate(() => { const O = l3.O, p = l3clInter()[0], q = l3ToScreen(new THREE.Vector3(p[0] - O[0], p[1] - O[1], p[2] - O[2])), r = l3.renderer.domElement.getBoundingClientRect(); const mk = (dx, dy) => ({ clientX: r.left + q.x + dx, clientY: r.top + q.y + dy, button: 0 }); const a = l3Snap(mk(4, 3)), b = l3Snap(mk(60, 4)); return { kindA: a && a.kind, errA: a ? Math.hypot(a.point.x + O[0] - p[0], a.point.y + O[1] - p[1]) : null, kindB: b && b.kind }; });
  if (sn.kindA !== 'cli' || sn.errA > 0.05) fail('Fäst i skärning: ' + JSON.stringify(sn));
  // parallell med avstånd 2 m
  await page.fill('#v3ClOff', '2'); await page.click('[data-clm="par"]');
  const pos = await page.evaluate(() => { const O = l3.O, ln = l3cl.lines[0], pt = ln.p, mk = (x, y, z) => { const q = l3ToScreen(new THREE.Vector3(x - O[0], y - O[1], z - O[2])), r = l3.renderer.domElement.getBoundingClientRect(); return [r.left + q.x, r.top + q.y]; }; return { onLine: mk(pt[0] + 8, pt[1], pt[2]), side: mk(pt[0] + 8, pt[1] + 5, pt[2]), y0: pt[1] }; });
  await page.mouse.click(pos.onLine[0] + 0, pos.onLine[1] + 0); await page.mouse.click(pos.side[0], pos.side[1]); await page.waitForTimeout(150);
  const pr = await page.evaluate(() => ({ n: l3cl.lines.length, y: l3cl.lines[l3cl.lines.length - 1].p[1], name: l3cl.lines[l3cl.lines.length - 1].name }));
  if (pr.n !== 3 || Math.abs(Math.abs(pr.y - pos.y0) - 2) > 0.05 || !/Parallell 2/.test(pr.name)) fail('Parallell med avstånd: ' + JSON.stringify({ pr, y0: pos.y0 }));
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  // hjälplinjerna syns i scenen men ingår aldrig i export: de ligger utanför placeringarna
  const ex = await page.evaluate(() => ({ grp: !!l3cl.group && l3cl.group.children.length >= 3, inPlacements: placements.some(p => /hjälp/i.test(p.name || '')), noHit: l3cl.group.userData.noHit }));
  if (!ex.grp || ex.inPlacements || !ex.noHit) fail('Hjälplinjer i scenen: ' + JSON.stringify(ex));
  // ta bort en och sedan alla
  await page.evaluate(() => { const id = l3cl.lines[0].id; l3cl.lines = l3cl.lines.filter(x => x.id !== id); l3clRedraw(); });
  await page.click('[data-clb="clear"]'); const z = await page.evaluate(() => [l3cl.lines.length, l3cl.pts.length]); if (z[0] !== 0 || z[1] !== 0) fail('Rensa alla: ' + JSON.stringify(z));
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3dcl', JSON.stringify({ L1, I: I.n, sn, pr }));
  await browser.close(); server.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
