const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9261;
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
  page.on('console', m => { if (m.type() === 'warning') console.log('W:', m.text().slice(0, 600)); }); const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
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
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    window.__fetch = 0;
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    // UTF-8 rakt i filen ("Stålbolaget") – som en del program skriver.
  }, '');

  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3vrToggle === 'function', null, { timeout: 15000 }).catch(e => { throw new Error(e.message + ' :: ' + errors.join(' | ')); });
  const ok = (c, m) => { if (!c) fail(m); };
  await page.evaluate(() => {
    // Syntetiska versioner: boxar som objekt med GUID. v1 → v2: platta oförändrad, vägg flyttad 1 m, pelare borttagen, balk högre, ny pelare, bjälke med nytt GUID men samma läge.
    const cube = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]], tri = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
    const VERS = { v1: [['g0','Platta','IFCSLAB',0,0,0,30,30,2],['g1','Vägg','IFCWALL',5,5,2,10,0.2,3],['g2','Pelare','IFCCOLUMN',20,20,2,0.4,0.4,3],['g3','Balk','IFCBEAM',2,2,5,6,0.3,0.4],['g4','Bjälke','IFCMEMBER',12,12,2,2,0.2,0.2]],
                   v2: [['g0','Platta','IFCSLAB',0,0,0,30,30,2],['g1','Vägg','IFCWALL',6,5,2,10,0.2,3],['g3','Balk','IFCBEAM',2,2,5,6,0.3,0.8],['g5','Ny pelare','IFCCOLUMN',25,25,2,0.4,0.4,3],['g9','Bjälke','IFCMEMBER',12,12,2,2,0.2,0.2]] };
    window.__loads = [];
    l3bLoad = async list => { for (const w of list) {
      window.__loads.push([w.fileId, w.versionId, w.name]);
      const L = VERS[w.versionId], pos = new Float32Array(L.length * 24 * 3), col = new Uint8Array(L.length * 24 * 3).fill(200), idx = new Uint32Array(L.length * 36), ranges = [];
      L.forEach(([g, n, c, x, y, z, a, b, h], k) => { for (let v = 0; v < 8; v++) { const o = (k * 8 + v) * 3; pos[o] = x + cube[v][0] * a; pos[o + 1] = y + cube[v][1] * b; pos[o + 2] = z + cube[v][2] * h; } for (let t = 0; t < 36; t++) idx[k * 36 + t] = k * 8 + tri[t]; ranges.push({ start: k * 8, count: 8, idxStart: k * 36, idxCount: 36, guid: g, name: n, cls: c, base: [0.8, 0.8, 0.8] }); });
      const m = { id: w.id, name: w.name, visible: true, meshes: [], ranges, tris: L.length * 12, O: [0, 0, 0], src: w };
      const mesh = l3bMeshFromArrays(pos, col, idx, ranges, m, null); m.meshes.push(mesh); l3.groups.bldg.add(mesh); l3b.models.push(m); l3bPosition();
    } return { missing: [] }; };
    askOpener = async (op, args) => {
      if (op === 'tcFolder') return { folderId: 'root', projectName: 'Projekt', items: [{ id: 'fd1', name: 'Arkitekt', type: 'folder' }, { id: 'f1', name: 'Hus A.ifc', type: 'file', size: 5e6 }] };
      if (op === 'tcVersions') return { fileId: args.fileId, versions: [{ versionId: 'v1', no: 1, modified: '2026-10-01T10:00:00Z', by: 'Anna', size: 4e6 }, { versionId: 'v2', no: 2, modified: '2026-11-01T10:00:00Z', by: 'Bo', size: 5e6 }] };
      throw new Error('okänt ' + op);
    };
  });
  await page.evaluate(() => l3bLoad([{ id: 'f:f1', fileId: 'f1', versionId: 'v2', name: 'Hus A.ifc' }]));   // den vanliga inlästa modellen av samma fil
  // Panelen: välj fil i TC → versioner → jämför
  await page.evaluate(() => l3vrToggle(true));
  await page.click('#v3Ver [data-vr="tc"]'); await page.waitForSelector('#v3Ver [data-vr="file"]');
  await page.click('#v3Ver [data-vr="file"]'); await page.waitForSelector('#v3Ver input[name="vrA"]');
  const sel = await page.evaluate(() => [l3vr.A, l3vr.B, l3vr.versions.length]);
  ok(sel.join() === 'v1,v2,2', 'Standard: äldre = näst nyaste, nyare = nyaste: ' + sel);
  await page.click('#v3Ver [data-vr="run"]');
  await page.waitForFunction(() => l3vr.res && !l3vr.busy, null, { timeout: 15000 }).catch(async e => { throw new Error(e.message + ' :: ' + errors.join(' | ') + ' :: ' + JSON.stringify(await page.evaluate(() => ({ busy: l3vr.busy, st: (document.getElementById('v3Status') || {}).textContent, loads: window.__loads, ids: l3vr.ids, ms: l3b.models.map(m => m.id) })))); });
  const R = await page.evaluate(() => ({ count: l3vr.res.count, reguid: l3vr.res.reguid, rows: l3vr.res.rows.map(r => [r.guid, r.st, r.reguid ? 1 : 0, Math.round(r.dpos * 100) / 100, Math.round(r.dvol * 100) / 100]), loads: window.__loads, ids: l3vr.ids, models: l3b.models.map(m => m.name) }));
  const by = g => R.rows.find(r => r[0] === g);
  ok(R.loads.length === 3 && R.loads[1][1] === 'v1' && R.loads[2][1] === 'v2' && R.loads[1][0] === 'f1', 'Båda versionerna lästes in med fileId och versionId: ' + JSON.stringify(R.loads));
  ok(by('g0')[1] === 'same', 'Platta oförändrad: ' + by('g0'));
  ok(by('g1')[1] === 'moved' && Math.abs(by('g1')[3] - 1) < 0.01, 'Vägg flyttad 1 m: ' + by('g1'));
  ok(by('g2')[1] === 'removed', 'Pelare borttagen');
  ok(by('g3')[1] === 'reshaped' && Math.abs(by('g3')[4] - 0.72) < 0.01, 'Balk ändrad form, +0,72 m³: ' + by('g3'));
  ok(by('g5')[1] === 'added', 'Ny pelare tillkommen');
  ok(by('g9')[1] === 'same' && by('g9')[2] === 1 && R.reguid === 1, 'Bjälke med nytt GUID paras ihop på läge och namn: ' + JSON.stringify(by('g9')));
  ok(R.count.added === 1 && R.count.removed === 1 && R.count.moved === 1 && R.count.reshaped === 1 && R.count.same === 2, 'Antal: ' + JSON.stringify(R.count));
  // Färgläge: spöke på oförändrat, gammalt läge som skugga, borttaget syns
  const V = await page.evaluate(() => { const A = l3vrModel('A'), B = l3vrModel('B'); const u = m => m.meshes[0].userData.l3b; const nm = (m, g) => u(m).ranges.findIndex(r => r.guid === g);
    return { bSameGhost: u(B).cmpAlpha.has(nm(B, 'g0')), aHidden: [...u(A).cmpHide].map(i => u(A).ranges[i].guid).sort().join(), aGhost: [...u(A).cmpAlpha.keys()].map(i => u(A).ranges[i].guid).sort().join(), colB: [...l3vr.col.keys()].filter(k => k.startsWith(B.id)).length, active: l3vr.active }; });
  ok(V.bSameGhost && V.aHidden === 'g0,g4' && V.aGhost === 'g1,g3' && V.active && V.colB >= 3, 'Färgläget: ' + JSON.stringify(V));
  await page.evaluate(() => { const A = l3vrModel('A'); l3bRecolor(); window.__c = Array.from(A.meshes[0].geometry.getAttribute('color').array.slice(48, 51)); });
  const colA = await page.evaluate(() => window.__c); ok(colA[0] > colA[1] + 100, 'Borttagen pelare är röd i 3D: ' + colA);
  ok(await page.evaluate(() => l3b.models.find(m => m.id === 'f:f1').visible === false && l3vr.hid.join() === 'f:f1'), 'Den vanliga modellen av samma fil släcks under jämförelsen: ' + await page.evaluate(() => JSON.stringify([l3b.models.map(m => [m.id, m.visible]), l3vr.hid, l3vr.file])));
  // Tidplanen av: Original-läget är på och skillnadsfärgerna syns ändå; av/på med kryssrutan
  ok(await page.evaluate(() => l3b.orig === true && l3vr.setOrig === true), 'Tidplanen ignoreras som standard (Original-läget)');
  await page.evaluate(() => { l3bRecolor(); window.__c = Array.from(l3vrModel('A').meshes[0].geometry.getAttribute('color').array.slice(48, 51)); });
  { const c2 = await page.evaluate(() => window.__c); ok(c2[0] > c2[1] + 100, 'Skillnadsfärgen gäller även i Original-läget: ' + c2); }
  await page.uncheck('#v3Ver #vrNoPlan'); ok(await page.evaluate(() => l3b.orig === false), 'Kryssrutan av: tidplanen gäller igen');
  await page.check('#v3Ver #vrNoPlan'); ok(await page.evaluate(() => l3b.orig === true), 'Kryssrutan på: Original-läget');
  // Dölj kategori, oförändrat = dölj
  await page.evaluate(() => { l3vr.show.added = 0; l3vr.same = 'hide'; l3vrApply(); });
  ok(await page.evaluate(() => { const B = l3vrModel('B'), u = B.meshes[0].userData.l3b; return [...u.cmpHide].map(i => u.ranges[i].guid).sort().join(); }) === 'g0,g5,g9', 'Dölj tillkommet och oförändrat');
  await page.evaluate(() => { l3vr.show.added = 1; l3vr.same = 'ghost'; l3vrApply(); });
  // Oförändrat slås av och på med sin knapp, precis som de andra
  await page.click('#v3Ver [data-vr="show"][data-k="same"]');
  ok(await page.evaluate(() => { const B = l3vrModel('B'), u = B.meshes[0].userData.l3b; return !l3vr.show.same && [...u.cmpHide].map(i => u.ranges[i].guid).sort().join() === 'g0,g9' && l3vr.filter.st === ''; }), 'Oförändrat döljs med sin knapp');
  await page.click('#v3Ver [data-vr="show"][data-k="same"]');
  ok(await page.evaluate(() => { const B = l3vrModel('B'), u = B.meshes[0].userData.l3b; return l3vr.show.same && u.cmpHide.size === 0 && u.cmpAlpha.size === 2; }), 'Oförändrat visas igen som spöke');
  // Kategoriknapparna markerar objekten i 3D (även en avslagen kategori tänds), Ctrl lägger till, Isolera markerade
  await page.waitForTimeout(900);   // vyn flyger till modellen efter jämförelsen
  const cam0 = await page.evaluate(() => l3.camera.position.toArray().concat(l3.orbit.target.toArray()).join());
  await page.click('#v3Ver [data-vr="selk"][data-k="removed"]');
  await page.waitForTimeout(700); ok(await page.evaluate(c => l3.camera.position.toArray().concat(l3.orbit.target.toArray()).join() === c, cam0), 'Kategoriknappen markerar utan att flytta vyn');
  ok(await page.evaluate(() => l3bs.sel.length === 1 && l3bs.sel[0].mesh.userData.l3b.ranges[l3bs.sel[0].ri].guid === 'g2'), 'Borttaget markeras (äldre versionens pelare)');
  await page.click('#v3Ver [data-vr="selk"][data-k="added"]', { modifiers: ['Control'] });
  ok(await page.evaluate(() => l3bs.sel.map(e => e.mesh.userData.l3b.ranges[e.ri].guid).sort().join() === 'g2,g5'), 'Ctrl lägger till tillkommet i markeringen');
  await page.click('#v3Ver [data-vr="selk"][data-k="moved"]');
  ok(await page.evaluate(() => l3bs.sel.length === 1 && l3bs.sel[0].mesh.userData.l3b.ranges[l3bs.sel[0].ri].guid === 'g1'), 'Utan Ctrl ersätter markeringen');
  await page.click('#v3Ver [data-vr="iso"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => { const B = l3vrModel('B'), u = B.meshes[0].userData.l3b; return u.hidden.size >= 3; }), 'Isolera markerade döljer resten');
  await page.click('#v3Ver [data-vr="showall"]'); ok(await page.evaluate(() => l3vrModel('B').meshes[0].userData.l3b.hidden.size === 0), 'Visa alla tänder allt');
  // Överlägg: äldre och nyare i egna färger, nyare lite framför
  await page.selectOption('#v3Ver #vrView', 'overlay'); await page.waitForSelector('#v3Ver #vrColA');
  const ov = await page.evaluate(() => { const A = l3vrModel('A'), B = l3vrModel('B'), ca = Array.from(A.meshes[0].geometry.getAttribute('color').array.slice(0, 3)), cb = Array.from(B.meshes[0].geometry.getAttribute('color').array.slice(0, 3)); return { ca, cb, off: B.meshes[0].material.polygonOffset, offA: !!A.meshes[0].material.polygonOffset, both: A.visible && B.visible, ghosts: [A, B].every(m => !m.meshes[0].userData.l3b.cmpAlpha || m.meshes[0].userData.l3b.cmpAlpha.size === 0) }; });
  ok(ov.ca[0] > ov.ca[2] + 100 && ov.cb[2] > ov.cb[0] + 100 && ov.off && !ov.offA && ov.both && ov.ghosts, 'Överlägg: äldre röd, nyare blå, nyare framför: ' + JSON.stringify(ov));
  await page.evaluate(() => { l3vr.colB = '#00aa00'; l3vrApply(); }); ok(await page.evaluate(() => { const c = l3vrModel('B').meshes[0].geometry.getAttribute('color').array; return c[1] > c[0] + 80; }), 'Egen färg för nyare');
  await page.selectOption('#v3Ver #vrView', 'diff'); ok(await page.evaluate(() => !l3vrModel('B').meshes[0].material.polygonOffset && l3vr.modelCol.size === 0), 'Tillbaka till skillnader: förskjutningen och modellfärgerna är borta');
  // Före/efter, svep, blinka
  await page.selectOption('#v3Ver #vrView', 'before'); ok(await page.evaluate(() => [l3vrModel('A').visible, l3vrModel('B').visible].join()) === 'true,false', 'Bara äldre');
  await page.selectOption('#v3Ver #vrView', 'swipe'); await page.waitForSelector('#v3Ver #vrSwipe');
  const sw = await page.evaluate(() => { l3vr.swipe = 0.5; l3vrSwipeMove(); const f = m => m.meshes[0].material.clippingPlanes && m.meshes[0].material.clippingPlanes.length; return [f(l3vrModel('A')), f(l3vrModel('B')), l3.renderer.localClippingEnabled].join(); });
  ok(sw === '1,1,true', 'Svep: varje modell har ett klippplan: ' + sw);
  await page.selectOption('#v3Ver #vrView', 'blink'); ok(await page.evaluate(() => !!l3vr.blink && !l3vrModel('A').meshes[0].material.clippingPlanes), 'Blinka går och svepet är avslaget');
  await page.selectOption('#v3Ver #vrView', 'diff');
  // Lista, markera, CSV, egenskaper
  await page.click('#v3Ver [data-vr="row"][data-g="g1"]');
  ok(await page.evaluate(() => l3bs.sel.length === 1 && l3bs.sel[0].mesh.userData.l3b.ranges[l3bs.sel[0].ri].guid === 'g1' && l3vrModel('B').meshes.includes(l3bs.sel[0].mesh)), 'Raden markerar nyare versionens objekt');
  await page.fill('#v3Ver #vrFQ', 'pelare'); await page.dispatchEvent('#v3Ver #vrFQ', 'change');
  ok(await page.evaluate(() => l3vrRows().map(r => r.guid).sort().join()) === 'g2,g5', 'Sökfilter');
  const csv = await page.evaluate(() => { let t = ''; const B = Blob; window.Blob = function (p, o) { t = p.join(''); return new B(p, o); }; l3vrCsv(l3vrRows()); window.Blob = B; return t; });
  ok(/Typ;Namn;Klass;GUID/.test(csv) && /Tillkommit;Ny pelare/.test(csv) && /Borttaget;Pelare/.test(csv), 'CSV: ' + csv.slice(0, 160));
  await page.evaluate(() => { l3vr.filter.q = ''; });
  // Filter: förval (klasser) gäller listan och 3D-vyn; HTML-export med fristående visare
  await page.click('#v3Ver [data-vr="preset"][data-i="1"]');   // Pelare och balkar
  ok(await page.evaluate(() => [...l3vr.filter.cls].sort().join() === 'IFCBEAM,IFCCOLUMN,IFCMEMBER' && l3vrRows().map(r => r.guid).sort().join() === 'g2,g3,g5,g9'), 'Förvalet Pelare och balkar filtrerar listan');
  ok(await page.evaluate(() => { const B = l3vrModel('B'), u = B.meshes[0].userData.l3b; return [...u.cmpHide].map(i => u.ranges[i].guid).sort().join() === 'g0,g1'; }), 'Filtret döljer övriga i 3D (nyare versionen)');
  const ex = await page.evaluate(async () => { const r = await l3vrExportHtml(); return { name: r.name, size: r.size, html: r.html }; });
  ok(/\.html$/.test(ex.name) && ex.size > 100000 && /Pelare/.test(ex.name), 'HTML-filen har ett beskrivande namn: ' + ex.name + ' ' + ex.size);
  { const pg = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage(); const perr = []; pg.on('pageerror', e => perr.push(e.message)); pg.on('console', m => { if (m.type() === 'error') perr.push(m.text()); });
    await pg.setContent(ex.html, { waitUntil: 'load' }); await pg.waitForFunction(() => window.__ver && window.__ver.groups().length > 0, null, { timeout: 15000 });
    const v1 = await pg.evaluate(() => ({ n: __ver.objs.length, chips: document.querySelectorAll('.chip').length, cnt: [...document.querySelectorAll('.chip b')].map(b => b.textContent).join(), cls: document.querySelectorAll('#cls input').length, list: document.querySelectorAll('#list .it').length, title: document.getElementById('ttl').textContent, sub: document.getElementById('sub').textContent }));
    ok(v1.n === 4 && v1.chips === 6 && v1.cls === 3 && v1.list === 4 && /Hus A/.test(v1.title) && /v1/.test(v1.sub) && /v2/.test(v1.sub), 'Visaren öppnas med objekten, kategorierna och klasserna: ' + JSON.stringify(v1));
    // kategori av/på
    await pg.click('.chip[data-k="added"]'); ok(await pg.evaluate(() => __ver.objs.filter(o => o.s === 'added').every(o => !__ver.st.show.added) && document.querySelectorAll('#list .it').length === 3), 'Tillkommit av: listan krymper');
    await pg.click('.chip[data-k="added"]');
    // lägen
    for (const m of ['overlay', 'before', 'after', 'swipe', 'blink', 'diff']) { await pg.click('#modes [data-m="' + m + '"]'); await pg.waitForTimeout(120); ok(await pg.evaluate(() => __ver.groups().length > 0), 'Läget ' + m + ' ritar'); }
    await pg.click('#modes [data-m="swipe"]'); await pg.evaluate(() => { const s = document.getElementById('sw'); s.value = 0.25; s.dispatchEvent(new Event('input')); });
    ok(await pg.evaluate(() => __ver.groups().every(g => g.mesh.material.clippingPlanes && g.mesh.material.clippingPlanes.length === 1)), 'Svep: klippplan på alla delar');
    await pg.click('#modes [data-m="diff"]');
    // klassfilter + markering
    await pg.click('#clsum'); await pg.uncheck('#cls input[data-c="IFCMEMBER"]'); ok(await pg.evaluate(() => document.querySelectorAll('#list .it').length === 3), 'Klass av: listan krymper');
    await pg.click('#list .it >> nth=0'); ok(await pg.evaluate(() => __ver.st.sel >= 0 && /m³/.test(document.getElementById('info').textContent)), 'Klick i listan markerar och visar info');
    await pg.screenshot({ path: '/tmp/ver-viewer.png' }); ok(!perr.length, 'Visaren: fel i konsolen: ' + perr.join(' | ')); await pg.context().close(); }
  await page.evaluate(() => { l3vr.filter.cls = new Set(); l3vrApply(); });
  // Stäng: versionerna tas bort och färgerna är borta
  await page.evaluate(() => l3vrToggle(false));
  const end = await page.evaluate(() => ({ vis: l3b.models[0] && l3b.models[0].visible, orig: l3b.orig, models: l3b.models.length, active: l3vr.active, panel: !!document.getElementById('v3Ver'), col: l3vr.col.size }));
  ok(end.vis === true && end.orig === false && end.models === 1 && !end.active && !end.panel && end.col === 0, 'Stängd: ' + JSON.stringify(end));
  // Versioner sparas aldrig bland hämtade modeller; gamla sådana poster ignoreras (annars blev alla v9 vid omstart)
  ok(await page.evaluate(() => { localStorage.setItem(l3bRememberKey(), JSON.stringify([{ id: 'v:f1:v1', fileId: 'f1', name: 'Hus A · v1', version: 'v2:v1', on: true }, { id: 'f:f9', fileId: 'f9', name: 'Annan.ifc', version: '1', on: true }])); const a = l3bRememberedAll().map(x => x.id).join(); l3bRemember({ id: 'v:f1:v2', fileId: 'f1', name: 'x', version: 'v2:v2' }, true); return a === 'f:f9' && l3bRememberedAll().map(x => x.id).join() === 'f:f9' && !localStorage.getItem(l3bRememberKey()).includes('v:f1:v2'); }), 'Versioner ligger inte bland sparade modeller');
  // Tidigare inlästa versioner (id börjar på v:) kan också väljas
  ok(await page.evaluate(() => { l3vr.src = 'loaded'; return l3vrLoadedList().length === l3b.models.length; }), 'Alla inlästa modeller kan väljas');
  await page.evaluate(() => { l3vr.src = 'tc'; });
  // Inlästa modeller: jämför två modeller som redan finns under 3D-modeller (de tas inte bort)
  await page.evaluate(async () => { await l3bLoad([{ id: 'm:a', fileId: 'x1', versionId: 'v1', name: 'Export 1.ifc' }, { id: 'm:b', fileId: 'x2', versionId: 'v2', name: 'Export 2.ifc' }]); l3vrToggle(true); });
  await page.click('#v3Ver [data-vr="src"][data-s="loaded"]'); await page.waitForSelector('#v3Ver #vrLdA');
  await page.selectOption('#v3Ver #vrLdA', 'm:a'); await page.selectOption('#v3Ver #vrLdB', 'm:b');
  await page.click('#v3Ver [data-vr="runl"]'); await page.waitForFunction(() => l3vr.res && !l3vr.busy, null, { timeout: 15000 });
  const LR = await page.evaluate(() => ({ c: l3vr.res.count, others: l3b.models.filter(m => m.id !== 'm:a' && m.id !== 'm:b').map(m => m.visible).join(), info: !!document.querySelector('#v3Ver .fe-note') && /Jämför: A = Export 1/.test(document.getElementById('v3Ver').textContent), file: l3vr.file.name }));
  ok(LR.c.added === 1 && LR.c.removed === 1 && LR.c.moved === 1 && LR.c.reshaped === 1 && LR.c.same === 2 && LR.others === 'false' && LR.info, 'Inlästa modeller jämförs, övriga släcks: ' + JSON.stringify(LR));
  const ex2 = await page.evaluate(async () => { const r = await l3vrExportHtml(); return r.name; }); ok(/Export 1.*Export 2/.test(ex2), 'HTML-namn med modellnamnen: ' + ex2);
  await page.evaluate(() => l3vrToggle(false));
  const LE = await page.evaluate(() => ({ n: l3b.models.length, vis: l3b.models.map(m => m.visible).join() }));
  ok(LE.n === 3 && LE.vis === 'true,true,true', 'Inlästa modeller finns kvar och är tända efter stängning: ' + JSON.stringify(LE));
  // Spara versionerna: ligger kvar släckta under 3D-modeller, sparas med versions-id och läses in som rätt version när de tänds
  await page.evaluate(() => { l3SetPref('verKeep', true); l3vr.src = 'tc'; l3vrToggle(true); });
  await page.waitForSelector('#v3Ver [data-vr="run"]'); ok(await page.evaluate(() => document.getElementById('vrKeep').checked), 'Kryssrutan Spara versionerna är på');
  await page.evaluate(() => { window.__loads.length = 0; }); await page.click('#v3Ver [data-vr="run"]'); await page.waitForFunction(() => l3vr.res && !l3vr.busy, null, { timeout: 15000 });
  await page.evaluate(() => l3vrToggle(false));
  const KP = await page.evaluate(() => { const r = l3bRememberedAll().filter(x => x.keep); return { n: l3b.models.length, vers: l3b.models.filter(m => String(m.id).startsWith('v:')).map(m => [m.id, m.visible].join('=')).join(), rem: r.map(x => [x.id, x.versionId, x.on].join('/')).sort().join() }; });
  ok(KP.n === 5 && KP.vers === 'v:f1:v1=false,v:f1:v2=false' && KP.rem === 'v:f1:v1/v1/false,v:f1:v2/v2/false', 'Versionerna sparas (släckta, med versions-id): ' + JSON.stringify(KP));
  // Tänds en sparad version som inte är inläst läses rätt version in (inte den senaste)
  await page.evaluate(() => { l3bRemove('v:f1:v1'); window.__loads.length = 0; });
  await page.evaluate(() => l3lLoadRemembered('v:f1:v1')); await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.__loads.length === 1 && window.__loads[0][1] === 'v1'), 'Sparad version läses in som sin egen version: ' + await page.evaluate(() => JSON.stringify(window.__loads)));
  await page.evaluate(() => { l3SetPref('verKeep', false); });
  // Blanda: A = inläst modell (m:a = v1), B = version ur Trimble Connect (v2) – ägd bara på B-sidan
  await page.evaluate(() => { l3vr.src = 'loaded'; l3vr.file = { fileId: 'f1', name: 'Hus A.ifc', parentId: 'root' }; l3SetPref('verKeep', false); l3vrToggle(true); });
  await page.waitForSelector('#v3Ver #vrLdB option[value="tc:v2"]', { state: 'attached' });
  await page.selectOption('#v3Ver #vrLdA', 'm:a'); await page.selectOption('#v3Ver #vrLdB', 'tc:v2');
  await page.evaluate(() => { window.__loads.length = 0; }); await page.click('#v3Ver [data-vr="runl"]'); await page.waitForFunction(() => l3vr.res && !l3vr.busy, null, { timeout: 15000 });
  const MX = await page.evaluate(() => ({ c: l3vr.res.count, own: JSON.stringify(l3vr.own), loads: window.__loads.map(x => x[1]).join(), info: /Jämför: A = Export 1.*B = v2/.test(document.getElementById('v3Ver').textContent), meta: JSON.stringify(l3vr.meta), nm: l3vr.cmpName }));
  ok(MX.c.added === 1 && MX.c.removed === 1 && MX.c.moved === 1 && MX.c.reshaped === 1 && MX.c.same === 2 && MX.own === '{"A":false,"B":true}' && MX.info, 'Blandat: inläst A + TC-version B: ' + JSON.stringify(MX));
  await page.evaluate(() => l3vrToggle(false));
  ok(await page.evaluate(() => { const ids = l3b.models.map(m => m.id); return ids.includes('m:a') && !ids.includes('v:f1:v2') && l3b.models.find(m => m.id === 'm:a').visible; }), 'Stängs: den inlästa modellen finns kvar, den hämtade versionen tas bort');
  ok(!errors.length, 'Sidfel: ' + errors.join(' | '));
  console.log('OK: versioner och jämförelse – fil och versioner ur Trimble Connect, tillkommet/borttaget/flyttat/ändrad form/nytt GUID, färgläge, före/efter, svep, blinka, lista, CSV, stäng');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
