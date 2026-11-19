const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9291;
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
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  const gh = new Map();
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
    const body = JSON.parse(req.postData()); gh.set(f, Buffer.from(body.content, 'base64').toString());
    if (/ifc_groups\.json$/.test(f)) page.evaluate(t => { window.__gsaved = JSON.parse(t); }, gh.get(f)).catch(() => {});
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async ifc => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[169000, 7456000, 400], [169100, 7456000, 400]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    window.__fetch = 0;
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    // UTF-8 rakt i filen ("Stålbolaget") – som en del program skriver.
  }, '');


  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3xhExport === 'function', null, { timeout: 15000 });
  const ok = (c, m) => { if (!c) fail(m); };
  await page.evaluate(() => l3dkToggle(true));   // högermenyn dockad: panelerna staplas där

  // Modell (IFC) – fyra objekt som i geometritestet
  await page.evaluate(() => {
    const cube = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]], tri = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
    const objs = [['g0', 'Platta betong', 'IFCSLAB', 30, 30, 2, 0, 36], ['g1', 'Balk', 'IFCBEAM', 10, 2, 3, 30, 50], ['g2', 'Stålstolpe HEA', 'IFCCOLUMN', 1, 1, 4, 0, 60], ['g3', 'Öppen', 'IFCWALL', 4, 4, 4, 0, 70]];
    const pos = new Float32Array(objs.length * 24 * 3), col = new Uint8Array(objs.length * 24 * 3).fill(200), idx = new Uint32Array(objs.length * 36), ranges = [];
    objs.forEach(([g, n, c, a, b, h, rot, x0], k) => { const r = rot * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r); for (let v = 0; v < 8; v++) { const o = (k * 8 + v) * 3, X = cube[v][0] * a, Y = cube[v][1] * b; pos[o] = x0 + X * cs - Y * sn; pos[o + 1] = Y * cs + X * sn; pos[o + 2] = cube[v][2] * h; }
      const f = tri.slice(); let cnt = 36; if (g === 'g3') cnt = 30;   // saknar ett par trianglar → öppet nät
      for (let t = 0; t < 36; t++) idx[k * 36 + t] = k * 8 + f[t]; ranges.push({ start: k * 8, count: 8, idxStart: k * 36, idxCount: cnt, guid: g, name: n, cls: c, base: [0.8, 0.8, 0.8] }); });
    const m = { id: 'vm', name: 'Geo.ifc', visible: true, meshes: [], ranges, tris: objs.length * 12, O: [169000, 7456000, 400], src: { id: 'vm', version: 'v1' } };
    const mesh = l3bMeshFromArrays(pos, col, idx, ranges, m, null); m.meshes.push(mesh); l3.groups.bldg.add(mesh); l3b.models.push(m); l3bPosition(); mesh.updateMatrixWorld(true);
  });

  const mk = () => {
    const it = []; let y = 800;
    const row = (cells) => { let x = 50; cells.forEach(c => { it.push({ s: c, x, y, w: c.length * 5.5, h: 11, pg: 1 }); x += c.length * 5.5 + 20; }); y -= 19; };
    row(['STAG', 'NR:', 'X', '(m)', 'Y', '(m)', 'Z', '(m)', 'I', 'BERG', '(m)', 'DIMENSION']);
    row(['BV001', '169000.000', '7456000.000', '427.300', '2', '⌀25']);
    row(['BV002', '169010.000', '7456000.000', '427.300', '3', '⌀32']);
    row(['BV003', '169020.000', '7456000.000', '+401.400', '3', '25']);          // utan ⌀, med plustecken (som 5082380)
    row(['BV004', '--UTGÅTT--']);
    row(['BV005', '169030.000', '7456000.000', '414.500', '⌀25']);                  // sättdjup saknas
    row(['BH100', '169100.000', '7456100.000', '440.000', '⌀25', 'BH100', '169103.000', '7456104.000', '438.000', '⌀25']);
    // BH101 med vattenstämpel (lösa tecken) mellan kolumnerna
    row(['BH101', '169110.000', '7456100.000', 'T', '5', '441.000', '⌀32', 'BH101', '169110.000', '7456100.000', 'UT', '1', '441.000', '⌀32']);   // samma punkt → hoppas över
    row(['BH102', '169120.000', '7456100.000', '441.000', '⌀32', 'BH102', '169124.000', '7456100.000', 'R', '15', '441.000', '⌀32']);
    it.push({ s: 'UTGÅTT', x: 300, y: 600, w: 80, h: 60, pg: 1 });                // stor vattenstämpeltext
    return it;
  };

  const items = mk(), mkPdf = it => { window.pdfjsLib.getDocument = () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ view: [0, 0, 1000, 850], getViewport: ({ scale }) => ({ width: 1000 * scale, height: 850 * scale }), render: () => ({ promise: Promise.resolve() }), getTextContent: async () => ({ items: it.map(i => ({ str: i.s, width: i.w, transform: [i.h, 0, 0, i.h, i.x, i.y] })) }) }) }) }); };
  await page.evaluate(mkPdf.toString().replace(/^it =>/, '').length ? '(' + mkPdf.toString() + ')(' + JSON.stringify(items) + ')' : '');
  // Stängerna (en per stång, mappar) + ritning + punktmoln
  await page.evaluate(items => {
    const res = l3bfParse(items, 'tabell.pdf'); l3bf.rows = res; l3bf.docs = [{ name: 'tabell.pdf', buf: new Uint8Array([37, 80, 68, 70]).buffer }];
    l3bfCreate(res, { dir: 'down', extra: 0, scale: 4, as: 'bar', per: 'bar', replace: true });
    const g = new THREE.Group(), N = 5000, pos = new Float32Array(N * 3), col = new Uint8Array(N * 3).fill(180);
    for (let i = 0; i < N; i++) { pos[i * 3] = Math.random() * 40; pos[i * 3 + 1] = Math.random() * 40; pos[i * 3 + 2] = Math.random() * 5; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true)); geo.computeBoundingSphere(); const pm = new THREE.PointsMaterial({ size: 2, vertexColors: true }), pts = new THREE.Points(geo, pm); pts.userData.n = N; g.add(pts);
    l3.groups.pc = l3.groups.pc || new THREE.Group(); l3.scene.add(l3.groups.pc); l3.groups.pc.add(g); l3pc.clouds.push({ id: 'c1', name: 'Skanning.laz', group: g, visible: true, nTot: N, mat: pm, chunkPts: [pts], info: { center: [0, 0, 0] } });
  }, items);
  const info = await page.evaluate(() => ({ models: l3xhModels().map(m => m.name), clouds: l3xhClouds().length, areas: l3xhAreas().map(([a, l]) => a + ':' + l.length) }));
  ok(info.models.length === 1 && info.clouds === 1 && info.areas.join('|') === 'Bergförankring/Horisontella ⌀25:1|Bergförankring/Horisontella ⌀32:1|Bergförankring/Vertikala ⌀25:3|Bergförankring/Vertikala ⌀32:1', 'Det som går att exportera: ' + JSON.stringify(info));
  // Panelen i högermenyn
  await page.click('#v3XhBtn'); await page.waitForSelector('#v3XhPanel #v3XhGo');
  const pan = await page.textContent('#v3XhPanel'); ok(/Geo\.ifc/.test(pan) && /Skanning\.laz/.test(pan) && /Vertikala ⌀25/.test(pan) && /Ungefärlig filstorlek/.test(pan), 'Panelens val: ' + pan.replace(/\s+/g, ' ').slice(0, 300));
  // Exporten (utan nedladdning) → html-text
  const ex = await page.evaluate(async () => { const r = await l3xhExport({ models: l3xhModels(), clouds: l3xhClouds(), areas: l3xhAreas(), budget: 3000, docs: true, title: 'Testscen', noDownload: true }); return { name: r.name, size: r.size, layers: r.layers, docs: r.docs, html: await r.blob.text() }; });
  ok(ex.name === 'Testscen.html' && ex.layers === 6 && ex.docs === 1 && ex.size > 300000, 'Exporten: ' + JSON.stringify({ n: ex.name, l: ex.layers, d: ex.docs, s: ex.size }));
  // Visaren
  const pg = await (await browser.newContext({ viewport: { width: 1300, height: 800 } })).newPage(); const perr = []; pg.on('pageerror', e => perr.push(e.message)); pg.on('console', m => { if (m.type() === 'error') perr.push(m.text()); });
  await pg.setContent(ex.html, { waitUntil: 'load' }); await pg.waitForFunction(() => window.__scene && window.__scene.L.length > 0, null, { timeout: 15000 });
  const V = await pg.evaluate(() => ({ kinds: __scene.L.map(o => o.d.k + ':' + (o.d.objs ? o.d.objs.length : 0)).join(), pts: __scene.L.find(o => o.d.k === 'cloud').geo.getAttribute('position').count, byId: [...__scene.byId.keys()].sort().join(), title: document.getElementById('ttl').textContent, hot: document.querySelectorAll('#dwrap .hot').length, lys: document.querySelectorAll('#lys .ly').length }));
  ok(/^model:4,/.test(V.kinds) && V.kinds.split(',').filter(k => /^objs:/.test(k)).length === 4 && V.pts <= 3000 && V.pts > 2000 && V.byId === 'BH100,BH102,BV001,BV002,BV003,BV005' && V.title === 'Testscen' && V.hot >= 6 && V.lys === 6, 'Visarens innehåll: ' + JSON.stringify(V));
  // Klick på stag nr i ritningen → stången väljs; väljs en stång → ritningen markerar stagen
  await pg.click('#dwrap .hot[data-id="BV003"]'); await pg.waitForTimeout(700);
  const s1 = await pg.evaluate(() => ({ id: __scene.sel && __scene.sel.ob.id, info: document.getElementById('info').textContent }));
  ok(s1.id === 'BV003' && /Stag nr/.test(s1.info) && /Sättdjup i berg/.test(s1.info), 'Klick i ritningen väljer BV003 med egenskaper: ' + JSON.stringify(s1).slice(0, 300));
  // Klick i vyn på en stång (pixel) → välj + ritningen
  const px = await pg.evaluate(() => { const t = __scene.byId.get('BV001'), o = t.o, P = o.geo.getAttribute('position'), I = o.geo.index.array, v = new THREE.Vector3(), b = new THREE.Box3(); for (let i = t.ob.s; i < t.ob.s + t.ob.k; i++) b.expandByPoint(v.fromBufferAttribute(P, I[i])); __scene.fly(b); return null; });
  await pg.waitForTimeout(700);
  const xy = await pg.evaluate(() => { const t = __scene.byId.get('BV001'), o = t.o, P = o.geo.getAttribute('position'), I = o.geo.index.array, b = new THREE.Box3(), v = new THREE.Vector3(); for (let i = t.ob.s; i < t.ob.s + t.ob.k; i++) b.expandByPoint(v.fromBufferAttribute(P, I[i])); const c = b.getCenter(new THREE.Vector3()).project(__scene.C), r = document.querySelector('#cv canvas').getBoundingClientRect(); return { x: r.left + (c.x + 1) / 2 * r.width, y: r.top + (1 - c.y) / 2 * r.height }; });
 await pg.mouse.click(xy.x, xy.y); await pg.waitForTimeout(300);
  const s2 = await pg.evaluate(() => ({ id: __scene.sel && __scene.sel.ob.id, hot: [...document.querySelectorAll('#dwrap .hot.sel')].map(h => h.dataset.id).join() }));
  ok(s2.id === 'BV001' && s2.hot === 'BV001', 'Klick på stången i vyn väljer BV001 och markerar stagen i ritningen: ' + JSON.stringify(s2));
  // Ritningarna i egen flik ur HTML-filen: klickbara stag, kopplade åt båda håll (postMessage)
  const [pop] = await Promise.all([pg.context().waitForEvent('page'), pg.click('#dopen')]); await pop.waitForSelector('.hot', { timeout: 8000 });
  await pop.click('.hot[data-id="BV002"]'); await pg.waitForTimeout(500);
  ok(await pg.evaluate(() => __scene.sel && __scene.sel.ob.id) === 'BV002', 'Klick i ritningsfliken väljer BV002 i visaren');
  await pg.evaluate(() => { const t = __scene.byId.get('BH100'); __scene.select(t.o, t.ob, false); }); await pop.waitForFunction(() => document.querySelector('.hot.sel') && document.querySelector('.hot.sel').dataset.id === 'BH100', null, { timeout: 5000 });
  await pop.close();
  ok(await pg.evaluate(() => document.getElementById('ptbr').value === '0.75'), 'Punktljus finns (förvalt 0,75)');
  // IFC-objekt: klick ger klass, namn, GUID; sök; lager av/på
  const s3 = await pg.evaluate(() => { const o = __scene.L[0], ob = o.d.objs[1]; __scene.select(o, ob, false); return document.getElementById('info').textContent; }); ok(/Balk/.test(s3) && /IFCBEAM|BEAM/i.test(s3) && /g1/.test(s3), 'IFC-objektets info: ' + s3);
  await pg.fill('#q', 'stål'); const found = await pg.evaluate(() => document.querySelectorAll('#list .it[data-k]').length); ok(found === 1, 'Sök hittar Stålstolpe: ' + found);
  await pg.click('#lys input[data-i="0"]'); ok(await pg.evaluate(() => __scene.L[0].mesh.visible === false), 'Lagret kan släckas');
  ok(!perr.length, 'Sidfel i visaren: ' + perr.join(' | ')); ok(!errors.length, 'Sidfel: ' + errors.join(' | '));
  console.log('OK: HTML-export av scenen – modell, punktmoln, ritade objekt i mappar och ritningar; visaren: lager, klick åt båda håll, egenskaper, sök');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
