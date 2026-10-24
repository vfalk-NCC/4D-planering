// 3D-ritningar (DWG/DXF med höjder): z följer med linjer, polylinjer, ytor och block, och ritas i 3D-editorn (Victor 2026-10-24).
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9013;
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
  const D3 = ['0','SECTION','2','BLOCKS','0','BLOCK','8','0','2','B1','70','0','10','0','20','0','30','0','3','B1','0','LINE','8','0','10','0','20','0','30','0','11','1','21','0','31','2','0','ENDBLK','8','0','0','ENDSEC',
    '0','SECTION','2','ENTITIES',
    '0','LINE','8','A','10','6512340','20','150110','30','10','11','6512345','21','150110','31','14',
    '0','POLYLINE','8','A','66','1','70','8','10','0','20','0','30','0','0','VERTEX','8','A','10','6512340','20','150115','30','5','70','32','0','VERTEX','8','A','10','6512342','20','150115','30','9','70','32','0','SEQEND','8','A',
    '0','3DFACE','8','F','10','6512340','20','150120','30','1','11','6512344','21','150120','31','1','12','6512344','22','150124','32','3','13','6512340','23','150124','33','3','70','0',
    '0','INSERT','8','A','2','B1','10','6512350','20','150110','30','20','41','1','42','1','43','2','50','0',
    '0','ENDSEC','0','EOF',''].join('\n');
  const r = await page.evaluate(async d3 => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    const geo = dxfToGeometry(parseDxf(d3));
    const line = geo.find(g => g.zs && g.zs[0] === 10), poly = geo.find(g => g.zs && g.zs[0] === 5), tris = geo.find(g => g.tris), ins = geo.find(g => g.zs && g.zs[0] === 20);
    await addDxfFiles([new File([d3], 'tre.dxf')], { noTc: true });
    const rec = siteItems.find(x => x.type === 'cad' && x.name === 'tre'), g = rec && await ensureCadGeom(rec);
    return { n: geo.length, line: !!line && line.zs[1], poly: !!poly && poly.zs.join(), tris: !!tris && tris.tris.length, ins: !!ins && ins.zs.join(), rec: !!rec, has3d: rec && rec.stats && rec.stats.has3d, z: g && g.groups.some(x => x.z && x.z.some(a => a && a.some(v => v === 14000))), f: g && g.groups.some(x => x.f && x.f.length) };
  }, D3);
  if (r.line !== 14 || r.poly !== '5,9' || r.tris !== 18 || r.ins !== '20,24' || !r.rec || !r.has3d || !r.z || !r.f) fail('3D-DXF: ' + JSON.stringify(r));
  console.log('OK: 3D-ritning – höjder i linjer, polylinjer, block (skalad höjd) och ytor sparas');
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  await page.waitForFunction(() => l3s.snap2d, null, { timeout: 10000 });
  await page.evaluate(() => { setLayersVisible(cads().map(rr => 'cad:' + rr.id), true); l3sRefresh(0); });
  await page.waitForFunction(() => l3.groups.cad && l3.groups.cad.children.length >= 2, null, { timeout: 10000 });
  const v = await page.evaluate(() => { const kids = l3.groups.cad.children, lines = kids.filter(o => o.isLineSegments), mesh = kids.filter(o => o.isMesh && o.userData.cadId);
    const zr = lines.map(o => { const p = o.geometry.attributes.position; let lo = 1e9, hi = -1e9; for (let i = 0; i < p.count; i++) { lo = Math.min(lo, p.getZ(i)); hi = Math.max(hi, p.getZ(i)); } return [lo + o.position.z, hi + o.position.z]; });
    return { lines: lines.length, mesh: mesh.length, hi: Math.max(...zr.map(x => x[1])) + l3.O[2], lo: Math.min(...zr.map(x => x[0])) + l3.O[2] }; });
  if (!v.lines || !v.mesh || Math.abs(v.hi - 24) > 0.2 || Math.abs(v.lo - 1) > 1.5 && Math.abs(v.lo - 0) > 1.5) fail('3D-ritning i 3D-editorn: ' + JSON.stringify(v));
  console.log('OK: 3D-ritning i 3D-editorn – linjer och ytor på sina höjder (' + v.lo.toFixed(1) + '–' + v.hi.toFixed(1) + ' m)');
  // Färg: markera ritningen (sidomenyn) och byt färg; IFC-export med solida stavar och ytor, inga linjer
  const col = await page.evaluate(async () => { const r = cads().find(x => x.name === 'tre'); l3ssSelect({ kind: 'cad', id: r.id }); l3ssFlash({ kind: 'cad', id: r.id }); await new Promise(res => setTimeout(res, 200));
    const hasCol = !!document.querySelector('#v3Side #v3SsCol'); const inp = document.querySelector('#v3SsCol'); inp.value = '#ff0000'; inp.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(res => setTimeout(res, 200));
    const lines = [...l3s.cad.values()].filter(o => o.userData.cadId === r.id && o.isLineSegments); return { hasCol, mode: r.colorMode, c: r.color, hex: lines.map(o => o.material.color.getHexString()), sel: !!l3ss.sel }; });
  if (!col.hasCol || col.mode !== 'mono' || col.c !== '#ff0000' || !col.hex.every(h => h === 'ff0000')) fail('Färg på 3D-ritning: ' + JSON.stringify(col));
  console.log('OK: 3D-ritning – markeras (sidomenyn/sken), färg kan bytas');

  const pick = await page.evaluate(() => { const r = cads().find(x => x.name === 'tre'), o = [...l3s.cad.values()].find(q => q.userData.cadId === r.id && q.isLineSegments); o.updateMatrixWorld(); const p = o.geometry.attributes.position, v = new THREE.Vector3((p.getX(0) + p.getX(1)) / 2, (p.getY(0) + p.getY(1)) / 2, (p.getZ(0) + p.getZ(1)) / 2).applyMatrix4(o.matrixWorld);
    const q = l3ToScreen(v), R = l3.renderer.domElement.getBoundingClientRect(); const hit = l3ssCadAt({ clientX: R.left + q.x, clientY: R.top + q.y }), miss = l3ssCadAt({ clientX: R.left + 3, clientY: R.top + 3 }); return { hit: hit && hit.id === r.id, miss: !miss }; });
  if (!pick.hit || !pick.miss) fail('Markera 3D-ritning med klick i bilden: ' + JSON.stringify(pick));
  console.log('OK: 3D-ritningen markeras med ett klick på en linje (även på hög höjd)');
  const cx = await page.evaluate(() => { const r = cads().find(x => x.name === 'tre'), o = [...l3s.cad.values()].find(q => q.userData.cadId === r.id && q.isLineSegments); o.updateMatrixWorld(); const p = o.geometry.attributes.position, v = new THREE.Vector3((p.getX(0) + p.getX(1)) / 2, (p.getY(0) + p.getY(1)) / 2, (p.getZ(0) + p.getZ(1)) / 2).applyMatrix4(o.matrixWorld);
    const q = l3ToScreen(v), R = l3.renderer.domElement.getBoundingClientRect(), ev = { clientX: R.left + q.x, clientY: R.top + q.y }; l3OpenCtx(ev.clientX, ev.clientY, ev); const pop = document.getElementById('v3Pop'); const t = pop ? pop.textContent : ''; l3PopClose(); return t; });
  if (!/Markera ritningen/.test(cx) || !/Zooma hit/.test(cx) || !/Byt färg/.test(cx)) fail('Högerklick på 3D-ritning: ' + cx);
  console.log('OK: högerklick på en 3D-ritning i modellen – markera, zooma, byt färg, redigera');
  const ifc = await page.evaluate(() => { const rr = buildSiteIfc(); return rr && { n: rr.cad.recs, segs: rr.cad.segs, faces: rr.cad.faces, poly: /IFCPOLYLINE\(/.test(rr.text), faceset: /IFCTRIANGULATEDFACESET/.test(rr.text), red: /IFCCOLOURRGB\([^)]*1\.,\s*0\.,\s*0\./.test(rr.text) }; });
  if (!ifc || ifc.n !== 1 || ifc.segs < 3 || ifc.faces < 1 || ifc.poly || !ifc.faceset) fail('IFC av 3D-ritning: ' + JSON.stringify(ifc));
  console.log('OK: 3D-ritning som IFC – ' + ifc.segs + ' linjer som solida stavar, ' + ifc.faces + ' ytor, inga IFC-linjer');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close(); console.log('OK test_cad3d');
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
