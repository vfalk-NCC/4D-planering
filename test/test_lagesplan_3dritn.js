const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9311;
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
  const openEditor = async pg => {
    await route(pg); await pg.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await pg.waitForTimeout(900);
    await pg.evaluate(async () => { plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[169000, 7456000, 400], [169100, 7456000, 400]], pdf: [[0, 0], [1000, 0]] }, zones: [] }]; pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A'); });
    await pg.click('#btn3d'); await pg.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3rdImportFiles === 'function', null, { timeout: 15000 });
    await pg.evaluate(() => l3dkToggle(true));
  };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage(); await require('./_dialogs').bridge(page, d => d.accept());
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await openEditor(page);
  const ok = (c, m) => { if (!c) fail(m); };
  // PDF-sidan: 600×400 enheter med ram, en röd diagonal, en blå fylld triangel och en text (pdf.js och tolken attrapperas)
  const PDFMOCK = () => { window.pdfjsLib.getDocument = () => ({ promise: Promise.resolve({ numPages: 3, getPage: async () => ({ view: [0, 0, 600, 400] }) }) });
    window.pdfObjParse = async () => [
      { kind: 'path', d: [['M', 0, 0], ['L', 600, 0], ['L', 600, 400], ['L', 0, 400], ['Z']], stroke: '#000000', fill: null },
      { kind: 'path', d: [['M', 0, 0], ['L', 600, 400]], stroke: '#ff0000', fill: null },
      { kind: 'path', d: [['M', 100, 100], ['L', 200, 100], ['L', 150, 200], ['Z']], stroke: null, fill: '#0000ff' },
      { kind: 'path', d: [['M', 300, 100], ['L', 400, 100], ['L', 400, 200], ['L', 300, 200], ['Z']], stroke: null, fill: '#ffffff' },
      { kind: 'text', s: 'BV001', x: 300, y: 300, fs: 12, rot: 0, color: '#000000', w: 40 }]; };
  await page.evaluate(PDFMOCK);
  // 1) Import: PDF som vektor, skala 1:500, läggs i RITNINGAR, sparas i projektet
  const imp = await page.evaluate(async () => { const f = new File([new Uint8Array([37, 80, 68, 70, 45])], 'Sektion A.pdf', { type: 'application/pdf' }); const r = await l3rdImportFiles([f], { plane: 'plan', scale: 500, page: 1, allPages: false });
    const d = r[0], E = d._e; await new Promise(res => setTimeout(res, 300)); return { n: l3rd.list.length, name: d.name, kind: d.kind, s: d.s, kids: E.group.children.map(c => c.type + (c.userData.fills ? ':fill' : c.userData.lines ? ':lines' : c.userData.txt ? ':txt' : c.userData.frame ? ':frame' : '')).join(), segs: E.S.seg.length / 4, tris: E.S.tri.length / 6, path: d.path }; });
  ok(imp.n === 1 && imp.name === 'Sektion A' && imp.kind === 'pdf' && Math.abs(imp.s - 500 * 0.0003528) < 1e-9, 'Import: ' + JSON.stringify(imp));
  ok(/LineSegments:lines/.test(imp.kids) && /Mesh:fill/.test(imp.kids) && /Mesh:txt/.test(imp.kids) && imp.segs === 5 && imp.tris === 1, 'Vektor: linjer, fyllning (vitt hoppas över) och text: ' + JSON.stringify(imp));
  await page.evaluate(() => l3rdFlush()); await page.waitForTimeout(400);
  const saved = await page.evaluate(() => 1); const regs = [...files.keys()].filter(k => /drawings3d/.test(k)); ok(regs.length === 2 && regs.some(k => /drawings3d\.json$/.test(k)) && regs.some(k => /drawings3d\/.*\.pdf$/.test(k)), 'Registret och källfilen sparade i projektet: ' + regs.join());
  // 2) Blocket RITNINGAR i Lager-fliken (eget block, inte i 2D-lägesplanen)
  await page.evaluate(() => l3PalTab('layers')); await page.waitForSelector('[data-lsec="ritn"]');
  const blk = await page.evaluate(() => ({ t: document.querySelector('[data-lsec="ritn"]').textContent.replace(/\s+/g, ' '), after: document.querySelector('[data-lsec="ritn"]').previousElementSibling && document.querySelector('[data-lsec="ritn"]').previousElementSibling.dataset.lsec, plan: typeof placements !== 'undefined' ? placements.length : -1 }));
  ok(/RITNINGAR/.test(blk.t) && /Sektion A/.test(blk.t) && blk.after === 'site2d', 'Blocket RITNINGAR under 2D-MODELLER: ' + JSON.stringify(blk));
  // 3) Passa in (2 punkter): plan, vridet 90°, och lodrätt
  const fit = await page.evaluate(() => { const d = l3rd.list[0]; l3rdSolve(d, [[0, 0], [600, 0]], [[169010, 7456020, 410], [169010, 7456320, 410]]); const b = l3rdBasis(d), r = { s: d.s, rot: d.rot, o: d.o.slice(), U: b.U.map(v => Math.round(v * 1e6) / 1e6) };
    l3rdSolve(d, [[0, 0], [600, 0]], [[169000, 7456000, 400], [169300, 7456000, 400]]); const r2 = { s: d.s, rot: d.rot, o: d.o.slice() };
    d.plane = 'vert'; l3rdSolve(d, [[0, 0], [600, 0]], [[169000, 7456000, 400], [169300, 7456000, 550]]); const r3 = { s: d.s, rot: d.rot, az: d.az, o: d.o.slice() }; const w = l3rdW(d, 600, 0); d.plane = 'plan'; l3rdSolve(d, [[0, 0], [600, 0]], [[169000, 7456000, 400], [169300, 7456000, 400]]);
    return { r, r2, r3, w }; });
  ok(Math.abs(fit.r.s - 0.5) < 1e-9 && Math.abs(fit.r.rot - 90) < 1e-6 && Math.abs(fit.r.U[1] - 0.5) < 1e-6 && Math.abs(fit.r.U[0]) < 1e-6 && Math.abs(fit.r.o[0] - 169010) < 1e-6 && fit.r.o[2] === 410, 'Plan, vridet 90°: ' + JSON.stringify(fit.r));
  ok(Math.abs(fit.r2.s - 0.5) < 1e-9 && Math.abs(fit.r2.rot) < 1e-6 && Math.abs(fit.r2.o[0] - 169000) < 1e-6, 'Plan utan vridning: ' + JSON.stringify(fit.r2));
  ok(Math.abs(fit.r3.s - Math.hypot(300, 150) / 600) < 1e-9 && Math.abs(fit.r3.rot - Math.atan2(150, 300) * 180 / Math.PI) < 1e-6 && Math.abs(fit.w[0] - 169300) < 1e-6 && Math.abs(fit.w[2] - 550) < 1e-6, 'Lodrätt plan: slutpunkten hamnar på rätt ställe: ' + JSON.stringify(fit.r3) + JSON.stringify(fit.w));
  // 4) Panelen i högermenyn: genomskinlighet, beskärning (rektangel och polygon), lås
  await page.evaluate(() => l3rdSelect(l3rd.list[0].id)); await page.waitForSelector('#v3RdPanel [data-rd="opacity"]');
  await page.evaluate(() => { const i = document.querySelector('#v3RdPanel [data-rd="opacity"]'); i.value = '40'; i.dispatchEvent(new Event('input')); });
  await page.fill('#v3RdPanel [data-rd="cl"]', '10'); await page.dispatchEvent('#v3RdPanel [data-rd="cl"]', 'change'); await page.fill('#v3RdPanel [data-rd="ct"]', '25'); await page.dispatchEvent('#v3RdPanel [data-rd="ct"]', 'change');
  const st = await page.evaluate(() => { const d = l3rd.list[0], E = d._e; return { op: d.opacity, matOp: E.mats.map(m => m.opacity).join(), crop: d.crop, rect: E.U.rdR.value.toArray().join(), onTop: E.mats.every(m => m.depthTest === false) }; });
  ok(Math.abs(st.op - 0.6) < 1e-9 && st.matOp.split(',').every(v => Math.abs(v - 0.6) < 1e-6) && Math.abs(st.crop.l - 0.1) < 1e-9 && st.rect === '60,0,600,300' && st.onTop, 'Genomskinlighet och rektangelbeskärning: ' + JSON.stringify(st));
  await page.evaluate(() => { const d = l3rd.list[0]; l3rdSet(d, { poly: [[100, 50], [500, 50], [300, 350]] }, { crop: 1 }); }); ok(await page.evaluate(() => l3rd.list[0]._e.U.rdN.value === 3), 'Polygonbeskärning når skuggaren');
  await page.click('#v3RdPanel [data-rd-act="clear"]'); ok(await page.evaluate(() => { const d = l3rd.list[0]; return !d.poly && d.crop.l === 0 && d._e.U.rdN.value === 0; }), 'Rensa beskärning');
  await page.evaluate(() => { document.querySelector('#v3RdPanel [data-rd="ontop"]').click(); }); ok(await page.evaluate(() => l3rd.list[0]._e.mats.every(m => m.depthTest === true)), 'Dold av modellen när "syns genom" är av');
  await page.evaluate(() => { document.querySelector('#v3RdPanel [data-rd="ontop"]').click(); const c = document.querySelector('#v3RdPanel [data-rd="cmode"]'); c.value = 'solid'; c.dispatchEvent(new Event('change')); }); ok(await page.evaluate(() => l3rd.list[0].color === '#dc2626' && l3rd.list[0]._e.mats.filter(m => m.userData.lines).every(m => m.vertexColors === false)), 'Enfärgad');
  // 5) Skärmpunkter: Passa in med riktiga klick (4 st) och dra kanterna för beskärning
  await page.evaluate(() => { const d = l3rd.list[0]; l3rdSet(d, { color: null }, { style: 1 }); l3rdSolve(d, [[0, 0], [600, 0]], [[169000, 7456000, 400], [169120, 7456000, 400]]); const c = l3rdW(d, 300, 200); l3FlyTo(new THREE.Vector3(c[0] - l3.O[0], c[1] - l3.O[1], c[2] - l3.O[2]), 160, new THREE.Vector3(0, -0.2, 1), 0); }); await page.waitForTimeout(500);
  const sp = await page.evaluate(() => { const d = l3rd.list[0], r = l3.renderer.domElement.getBoundingClientRect(), P = (x, y) => { const w = l3rdW(d, x, y), v = new THREE.Vector3(w[0] - l3.O[0], w[1] - l3.O[1], w[2] - l3.O[2]).project(l3.camera); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; }; return { c0: P(150, 100), c1: P(450, 100), mid: P(0, 200), tgt: P(300, 200) }; });
  await page.evaluate(() => l3rdFit(l3rd.list[0]));
  const before = await page.evaluate(() => ({ s: l3rd.list[0].s, o: l3rd.list[0].o.slice() }));
  await page.mouse.click(sp.c0[0], sp.c0[1]); await page.mouse.click(sp.c0[0], sp.c0[1] + 60); await page.mouse.click(sp.c1[0], sp.c1[1]); await page.mouse.click(sp.c1[0] - 40, sp.c1[1] + 60);
  await page.waitForTimeout(300); const aft = await page.evaluate(() => ({ s: l3rd.list[0].s, o: l3rd.list[0].o.slice(), fit: !!l3rd.fit }));
  ok(!aft.fit && Math.abs(aft.s - before.s) > 1e-6 && Math.abs(aft.s - before.s) < before.s * 30, 'Inpassning med fyra klick ger ny skala: ' + JSON.stringify({ before, aft }));
  await page.evaluate(() => { const d = l3rd.list[0]; l3rdSet(d, { crop: { l: 0, r: 0, t: 0, b: 0 }, poly: null }, { crop: 1 }); const c = l3rdW(d, 300, 200); l3FlyTo(new THREE.Vector3(c[0] - l3.O[0], c[1] - l3.O[1], c[2] - l3.O[2]), 160, new THREE.Vector3(0, -0.2, 1), 0); l3rdCropDrag(d); }); await page.waitForTimeout(500);
  const ed = await page.evaluate(() => { const d = l3rd.list[0], r = l3.renderer.domElement.getBoundingClientRect(), P = (x, y) => { const w = l3rdW(d, x, y), v = new THREE.Vector3(w[0] - l3.O[0], w[1] - l3.O[1], w[2] - l3.O[2]).project(l3.camera); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; }; return { l: P(0, 200), r: P(600, 200) }; });
  await page.mouse.move(ed.l[0], ed.l[1]); await page.mouse.down(); await page.mouse.move(ed.l[0] + 60, ed.l[1], { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(200);
  const cr = await page.evaluate(() => ({ l: l3rd.list[0].crop.l, orbit: l3.orbit.enabled })); ok(cr.l > 0.02 && cr.l < 0.9 && cr.orbit === true, 'Dra vänsterkanten beskär: ' + JSON.stringify({ ed, cr }));
  await page.evaluate(() => l3rdCropStop());
  // HTML-export: ritningen bakad med beskärning (polygon) och genomskinlighet, och visaren visar lagret
  const bk = await page.evaluate(async () => { const d = l3rd.list[0]; l3rdSet(d, { crop: { l: 0.1, r: 0, t: 0.25, b: 0 }, poly: [[100, 50], [500, 50], [300, 290]], opacity: 0.5 }, { crop: 1, style: 1 }); const B = await l3rdBake(d), L = B.find(x => x.k === 'dlines'), ok = [];
    for (let i = 0; i < L.pos.length; i += 3) { const q = l3rdLocal(d, [L.pos[i] + l3.O[0], L.pos[i + 1] + l3.O[1], L.pos[i + 2] + l3.O[2]]); const P3 = [[100, 50], [500, 50], [300, 290]], near = P3.some((a, i) => { const b = P3[(i + 1) % 3], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(q[0] - a[0] - dx * t, q[1] - a[1] - dy * t) < 0.3; }); ok.push(q[0] >= 59.9 && q[0] <= 600.1 && q[1] >= -0.1 && q[1] <= 300.1 && (l3rdInPoly(P3, q[0], q[1]) || near)); }
    return { kinds: B.map(x => x.k).join(), n: L.pos.length / 6, allIn: ok.every(Boolean), op: L.op, img: (B.find(x => x.k === 'dplane') || {}).img ? B.find(x => x.k === 'dplane').img.slice(0, 22) : '' }; });
  ok(/dlines/.test(bk.kinds) && /dplane/.test(bk.kinds) && bk.n > 0 && bk.allIn && bk.op === 0.5 && /^data:image\/png/.test(bk.img), 'Bakad ritning (beskärning innanför polygonen): ' + JSON.stringify(bk));
  const ex = await page.evaluate(async () => { const d = l3rd.list[0]; const r = await l3xhExport({ models: [], clouds: [], areas: [], budget: 0, docs: false, drawings: [d], title: 'Rit', noDownload: true }); return { layers: r.layers, html: await r.blob.text() }; });
  const vp = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); const verr = []; vp.on('pageerror', e => verr.push(e.message)); await vp.setContent(ex.html, { waitUntil: 'load' }); await vp.waitForFunction(() => window.__scene && window.__scene.L.length > 0, null, { timeout: 15000 });
  const vv = await vp.evaluate(() => ({ kinds: __scene.L.map(o => o.d.k).join(), rows: document.querySelectorAll('#lys .ly').length, sliders: document.querySelectorAll('#lys input[data-op]').length, op: __scene.L[0].mesh.material.opacity }));
  ok(/dlines/.test(vv.kinds) && vv.sliders >= 2 && Math.abs(vv.op - 0.5) < 1e-6 && !verr.length, 'Visaren visar ritningslagren med opacitetsreglage: ' + JSON.stringify({ vv, verr }));
  // 6) Från en annan dator: samma ritning, samma inpassning (läses ur projektet)
  await page.evaluate(() => l3rdFlush()); await page.waitForTimeout(500);
  const ref = await page.evaluate(() => { const d = l3rd.list[0]; return { s: d.s, rot: d.rot, o: d.o.slice(), crop: d.crop, name: d.name }; });
  const pg2 = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage(); const err2 = []; pg2.on('pageerror', e => err2.push(e.message)); await require('./_dialogs').bridge(pg2, d => d.accept());
  await openEditor(pg2); await pg2.evaluate(PDFMOCK);
  await pg2.waitForFunction(() => l3rd.list.length === 1 && l3rd.list[0]._e, null, { timeout: 15000 });
  const two = await pg2.evaluate(() => { const d = l3rd.list[0]; return { s: d.s, rot: d.rot, o: d.o.slice(), crop: d.crop, name: d.name, segs: d._e.S.seg.length / 4, vis: d._e.group.visible }; });
  ok(JSON.stringify([two.s, two.rot, two.o, two.crop, two.name]) === JSON.stringify([ref.s, ref.rot, ref.o, ref.crop, ref.name]) && two.segs === 5 && two.vis, 'Ny dator: samma ritning och inpassning: ' + JSON.stringify({ ref, two }));
  // 7) Bild (PNG), duplicera med annan beskärning, ta bort
  const img = await pg2.evaluate(async () => { const c = document.createElement('canvas'); c.width = 80; c.height = 40; const g = c.getContext('2d'); g.fillStyle = '#00aa00'; g.fillRect(0, 0, 80, 40); const b = await new Promise(r => c.toBlob(r, 'image/png')); const r = await l3rdImportFiles([new File([b], 'foto.png', { type: 'image/png' })], { plane: 'vert', scale: 0, page: 1, allPages: false }); const d = r[0]; await new Promise(res => setTimeout(res, 300)); return { kind: d.kind, plane: d.plane, W: d._e.S.W, H: d._e.S.H, mesh: d._e.group.children.some(c => c.material && c.material.userData.img) }; });
  ok(img.kind === 'img' && img.plane === 'vert' && img.W === 80 && img.H === 40 && img.mesh, 'Bild som lodrät ritning: ' + JSON.stringify(img));
  const dup = await pg2.evaluate(async () => { document.querySelector('#v3RdPanel [data-rd-act="dup"]').click(); await new Promise(r => setTimeout(r, 400)); return l3rd.list.length; }); ok(dup === 3, 'Duplicera: ' + dup);
  await pg2.evaluate(async () => { const id = l3rd.list[0].id; l3rdSelect(id); await new Promise(r => setTimeout(r, 200)); document.querySelector('#v3RdPanel [data-rd-act="del"]').click(); await new Promise(r => setTimeout(r, 300)); });
  await pg2.evaluate(() => l3rdFlush()); await pg2.waitForTimeout(400);
  const left = JSON.parse(Buffer.from(files.get([...files.keys()].find(k => /drawings3d\.json$/.test(k))), 'base64').toString()); ok(left.length === 2, 'Borttagen ritning försvinner ur projektet: ' + left.length);
  ok(!errors.length, 'Sidfel: ' + errors.join(' | ')); ok(!err2.length, 'Sidfel (ny dator): ' + err2.join(' | '));
  console.log('OK: RITNINGAR – PDF som vektor och bild, block under 2D-modeller, inpassning med två punkter (plan och lodrätt), genomskinlighet, beskärning (rektangel, polygon, dra kanter), delas i projektet');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
