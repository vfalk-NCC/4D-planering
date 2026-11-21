const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9323;
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

  const files = new Map();   // projektets "GitHub": sökväg -> base64
  const route = async pg => {
    await pg.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
    await pg.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
    await pg.route('https://api.github.com/**', r => {
      const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace(/^\/repos\/[^/]+\/[^/]+\/contents\//, ''));
      if (req.method() === 'GET') { const b = files.get(f); if (b == null) return r.fulfill({ status: 404, body: '{}' }); if (/raw/.test(req.headers()['accept'] || '')) return r.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(b, 'base64') }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: b, sha: 's' + b.length, size: b.length }) }); }
      const body = JSON.parse(req.postData()); files.set(f, body.content); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + body.content.length } }) });
    });
  };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage(); await require('./_dialogs').bridge(page, d => d.accept());
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const openEditor = async pg => {
    await route(pg); await pg.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await pg.waitForTimeout(900);
    await pg.evaluate(async () => { plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[169000, 7456000, 400], [169100, 7456000, 400]], pdf: [[0, 0], [1000, 0]] }, zones: [] }]; pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A'); });
    await pg.click('#btn3d'); await pg.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3bubPanel === 'function', null, { timeout: 15000 });
    await pg.evaluate(() => l3dkToggle(true));
  };
  await openEditor(page);
  const ok = (c, m) => { if (!c) fail(m); };
  await page.evaluate(() => { placements = [{ id: 'b1', type: 'bod', name: 'Bod', x: 6512340, y: 150105, z: 0, L: 8, B: 3, H: 2.7, rot: 0, dz: 0, color: '#f59e0b' }, { id: 'b2', type: 'container', name: 'Container', x: 6512352, y: 150105, z: 0, L: 6, B: 2.5, H: 2.6, rot: 0, dz: 0, color: '#2563eb' }]; l3BuildPlacements(); l3Render(); });
  // 1) Mått som visas: avstånd med valda delar
  const t1 = await page.evaluate(() => { const A = new THREE.Vector3(0, 0, 0), B = new THREE.Vector3(3, 4, 12); const all = l3mxDistText(A, B); l3mxSet('dist', 'xy', 1); l3mxSet('dist', 'z', 1); l3mxSet('dist', 'ang', 1); l3mxSet('dist', 'xyz', 0); const sel = l3mxDistText(A, B); l3mxSet('point', 'x', 0); l3mxSet('point', 'y', 0); const pt = l3mxPointText(1, 2, 3); l3mxSet('area', 'perim', 1); const ar = l3mxAreaText([new THREE.Vector3(0, 0, 0), new THREE.Vector3(4, 0, 0), new THREE.Vector3(4, 3, 0), new THREE.Vector3(0, 3, 0)]); return { all, sel, pt, ar }; });
  ok(/^13 m|^13,0|13/.test(t1.all) && /↔ 5/.test(t1.sel) && /↕ 12/.test(t1.sel) && /∠ 67/.test(t1.sel) && !/⟷|^13/.test(t1.sel) && t1.pt === 'Z 3,00 m' || /Z 3/.test(t1.pt), 'Text efter val: ' + JSON.stringify(t1));
  ok(/12 m²/.test(t1.ar) && /\(14/.test(t1.ar), 'Yta med omkrets: ' + t1.ar);
  // nya mått följer valen, och befintliga kan räknas om
  const t2 = await page.evaluate(() => { l3mx.plain = false; const m = l3mAdd('dist', [new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, 4, 12)], '13 m', [null, null]); const first = m.text; l3mxSet('dist', 'xyz', 1); l3mxSet('dist', 'xy', 0); l3mxSet('dist', 'z', 0); l3mxSet('dist', 'ang', 0); l3mxReapply(); return { first, after: m.text }; });
  ok(/↔ 5/.test(t2.first) && /^13 m$/.test(t2.after), 'Mått får text efter val och räknas om: ' + JSON.stringify(t2));
  // 2) Panelen
  await page.evaluate(() => l3mxPanel()); await page.waitForSelector('#v3MxCfg [data-mxg="smart"]', { state: 'attached' });
  const chips = await page.evaluate(() => document.querySelectorAll('#v3MxCfg [data-mxg]').length); ok(chips >= 25, 'Panelen har valen: ' + chips);
  await page.evaluate(() => document.querySelector('#v3MxCfg [data-mxg="smart"][data-mxk="up"]').click()); ok(await page.evaluate(() => l3mxCfg().smart.up) === 0, 'Brytare slår av Upp');
  await page.evaluate(() => document.querySelector('#v3MxCfg [data-mxg="smart"][data-mxk="up"]').click());
  // 3) Smart mått med få val: bara bredd och höjd
  const sm = await page.evaluate(async () => {
    ['w', 'h'].forEach(k => l3mxSet('smart', k, 1)); ['d', 'vol', 'up', 'down', 'left', 'right', 'out'].forEach(k => l3mxSet('smart', k, 0));
    const g = l3.placeMeshes.get('b1'); l3FlyTo(g.position.clone().add(new THREE.Vector3(0, 0, 1.3)), 14, new THREE.Vector3(0, -1, 0.15), 0); l3Render(); await new Promise(r => setTimeout(r, 400));
    const cv = l3.renderer.domElement, r = cv.getBoundingClientRect(), q = l3ToScreen(g.position.clone().add(new THREE.Vector3(0, -1.5, 1.3)));
    const ev = { clientX: r.left + q.x, clientY: r.top + q.y, preventDefault() {}, stopPropagation() {} };
    l3m.list.length = 0; l3SmartMeasure(ev); return { n: l3m.list.length, notes: l3m.list.map(m => m.note || m.kind) };
  });
  ok(sm.n === 2, 'Smart mått med bara bredd och höjd ger två mått: ' + JSON.stringify(sm));
  // 4) 3-axlig laser längs objektets egna axlar (objektet är vridet 30°, så världens X/Y ska inte användas)
  const lz = await page.evaluate(async () => {
    ['u', 'v', 'n'].forEach(k => l3mxSet('laser', k, 1)); l3mxSet('laser', 'nbr', 0);
    const p = placements.find(x => x.id === 'b1'); p.rot = 30; l3RebuildOne(p); l3Render();
    const g = l3.placeMeshes.get('b1'); l3FlyTo(g.position.clone().add(new THREE.Vector3(0, 0, 1)), 20, new THREE.Vector3(0.0001, -0.0001, 1), 0); l3Render(); await new Promise(r => setTimeout(r, 400));
    const cv = l3.renderer.domElement, r = cv.getBoundingClientRect(), q = l3ToScreen(g.position.clone().add(new THREE.Vector3(0.5, 0.2, 2.7)));
    const L = l3mxLaserAt({ clientX: r.left + q.x, clientY: r.top + q.y }); if (!L) return null;
    const ang = 30 * Math.PI / 180, ax = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0), ay = new THREE.Vector3(-Math.sin(ang), Math.cos(ang), 0);
    return { n: L.hits.length, lbl: L.hits.map(h => h.lbl), along: L.hits.filter(h => /Axel/.test(h.lbl)).map(h => Math.round(Math.max(Math.abs(h.dir.dot(ax)), Math.abs(h.dir.dot(ay))) * 1000) / 1000), d: L.hits.map(h => Math.round(h.d * 100) / 100) };
  });
  ok(lz && lz.n >= 5 && lz.along.length === 4 && lz.along.every(v => v > 0.99), 'Lasern följer objektets axlar (30°): ' + JSON.stringify(lz));
  // 4b) Yta med håltagning: nettoyta, brutto och hål (syntetiskt nät med ett hål)
  const rg = await page.evaluate(() => { const V = [], tris = [], id = (x, y) => y * 5 + x; for (let y = 0; y <= 3; y++) for (let x = 0; x <= 4; x++) V.push(new THREE.Vector3(x, y, 0)); for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) { if (x === 1 && y === 1) continue; tris.push([id(x, y), id(x + 1, y), id(x + 1, y + 1)], [id(x, y), id(x + 1, y + 1), id(x, y + 1)]); }
    const R = l3mxRegion({ g: { V, tris }, P: new THREE.Vector3(0.3, 0.2, 0), n: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0) }); return R && { net: R.net, gross: R.gross, holes: R.holes.length, holeA: R.holeA }; });
  ok(rg && Math.abs(rg.net - 11) < 1e-6 && Math.abs(rg.gross - 12) < 1e-6 && rg.holes === 1 && Math.abs(rg.holeA - 1) < 1e-6, 'Nettoyta med håltagning: ' + JSON.stringify(rg));
  // 4c) Yta & volym på riktigt objekt: mått med volym, kub och yta
  const sv = await page.evaluate(async () => {
    ['area', 'holes', 'vol', 'cube', 'outline'].forEach(k => l3mxSet('ytvol', k, 1));
    const g = l3.placeMeshes.get('b1'), cv = l3.renderer.domElement, r = cv.getBoundingClientRect(), q = l3ToScreen(g.position.clone().add(new THREE.Vector3(0.5, 0.2, 2.7)));
    l3m.list.length = 0; l3mxSurfVolClick({ clientX: r.left + q.x, clientY: r.top + q.y }); const ov = l3m.list.find(m => m.kind === 'objvol'); return { n: l3m.list.length, note: ov && ov.text, text: ov && ov.text, kinds: l3m.list.map(m => m.kind).join() };
  });
  ok(sv.n >= 2 && /Kub/.test(sv.note) && /Volym/.test(sv.note) && /Yta/.test(sv.note) && /m³/.test(sv.text), 'Yta & volym: ' + JSON.stringify(sv));
  // utan kub/volym i valen
  const sv2 = await page.evaluate(() => { ['vol', 'cube', 'outline'].forEach(k => l3mxSet('ytvol', k, 0)); const g = l3.placeMeshes.get('b1'), cv = l3.renderer.domElement, r = cv.getBoundingClientRect(), q = l3ToScreen(g.position.clone().add(new THREE.Vector3(0.5, 0.2, 2.7))); l3m.list.length = 0; l3mxSurfVolClick({ clientX: r.left + q.x, clientY: r.top + q.y }); const ov = l3m.list.find(m => m.kind === 'objvol'); return { n: l3m.list.length, note: ov && ov.text }; });
  ok(sv2.n === 1 && !/Kub|Volym/.test(sv2.note || ''), 'Valen styr Yta & volym: ' + JSON.stringify(sv2));
  // 5) Profil: snitt genom allt som är tänt
  const pr = await page.evaluate(() => { const g = l3.placeMeshes.get('b1'), A = g.position.clone().add(new THREE.Vector3(-10, 0, 1)), B = g.position.clone().add(new THREE.Vector3(22, 0, 1)); l3mxProfileOpen(A, B); const P = l3mx.prof; return P ? { names: P.sec.series.map(s => s.name), n: P.sec.series.map(s => s.n), L: Math.round(P.sec.L * 10) / 10 } : null; });
  ok(pr && pr.names.includes('Etablering') && pr.L === 32 && pr.n[0] >= 8, 'Profil genom etableringsobjekten: ' + JSON.stringify(pr));
  await page.waitForSelector('#v3MxCv', { state: 'attached' });
  const ch = await page.evaluate(() => { const cv = document.getElementById('v3MxCv'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let colored = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - d[i + 2]) > 60) colored++; return { colored, map: !!l3mx.prof.map }; });
  ok(ch.colored > 200 && ch.map, 'Diagrammet ritas: ' + JSON.stringify(ch));
  // klick i diagrammet: två punkter ger mått
  const rd = await page.evaluate(() => { const cv = document.getElementById('v3MxCv'), r = cv.getBoundingClientRect(), P = l3mx.prof, M = P.map, k = cv.width / r.width, at = (s, z) => ({ clientX: r.left + M.X(s) / k, clientY: r.top + M.Y(z) / k }); cv.onclick(at(2, 1)); cv.onclick(at(20, 2)); return { p1: !!P.p1, p2: !!P.p2, txt: document.getElementById('v3MxRead').textContent }; });
  ok(rd.p1 && rd.p2 && /↔/.test(rd.txt) && /%/.test(rd.txt), 'Mätning i diagrammet: ' + JSON.stringify(rd));
  // lager av/på
  await page.evaluate(() => { const c = document.querySelector('[data-mxs="Etablering"]'); c.checked = false; c.dispatchEvent(new Event('change')); }); ok(await page.evaluate(() => !l3mx.prof.on.has('Etablering')), 'Lager kan stängas av');
  await page.screenshot({ path: '/tmp/mx.png' });
  ok(!errors.length, 'JS-fel: ' + errors.join(' | '));
  await browser.close(); server.close(); console.log('OK test_lagesplan_3dmx');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
