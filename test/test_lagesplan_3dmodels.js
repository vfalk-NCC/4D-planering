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
    if (req.method() === 'GET' && e && /raw/.test(req.headers()['accept'] || '')) return r.fulfill({ status: 200, contentType: 'application/octet-stream', body: e.raw || e.content }); // som GitHub: rå fil
    if (req.method() === 'DELETE') { store.delete(f); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); }
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    const body = JSON.parse(req.postData()); if (e && body.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' });
    const sha = 's' + (++n); store.set(f, { content: Buffer.from(body.content, 'base64').toString(), raw: Buffer.from(body.content, 'base64'), sha });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) });
  });
  const ifc = ["ISO-10303-21;", "HEADER;", "FILE_DESCRIPTION((''),'2;1');", "FILE_NAME('b.ifc','',(''),(''),'','','');", "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;",
    "#1=IFCCARTESIANPOINT((0.,0.,0.));", "#2=IFCAXIS2PLACEMENT3D(#1,$,$);", "#3=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#2,$);",
    "#4=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);", "#5=IFCUNITASSIGNMENT((#4));", "#6=IFCPROJECT('2O2Fr$t4X7Zf8NOew3FLOH',$,'B',$,$,$,$,(#3),#5);",
    "#7=IFCLOCALPLACEMENT($,#2);", "#8=IFCSITE('2O2Fr$t4X7Zf8NOew3FLOI',$,'Site',$,$,#7,$,$,.ELEMENT.,$,$,$,$,$);", "#9=IFCRELAGGREGATES('2O2Fr$t4X7Zf8NOew3FLOJ',$,$,$,#6,(#8));",
    "#12=IFCDIRECTION((0.,0.,1.));",
    "#20=IFCCARTESIANPOINT((6512350.,150125.,0.));", "#21=IFCAXIS2PLACEMENT3D(#20,$,$);", "#22=IFCLOCALPLACEMENT(#7,#21);",
    "#23=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,4.,4.);", "#24=IFCEXTRUDEDAREASOLID(#23,#2,#12,6.);", "#25=IFCSHAPEREPRESENTATION(#3,'Body','SweptSolid',(#24));", "#26=IFCPRODUCTDEFINITIONSHAPE($,$,(#25));",
    "#27=IFCBUILDINGELEMENTPROXY('1hZq3$Bq9Fxu8nZK0bW1aA',$,'Pelare K10',$,$,#22,#26,$,$);",
    "#30=IFCCARTESIANPOINT((6512380.,150125.,0.));", "#31=IFCAXIS2PLACEMENT3D(#30,$,$);", "#32=IFCLOCALPLACEMENT(#7,#31);",
    "#33=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,2.,10.);", "#34=IFCEXTRUDEDAREASOLID(#33,#2,#12,3.);", "#35=IFCSHAPEREPRESENTATION(#3,'Body','SweptSolid',(#34));", "#36=IFCPRODUCTDEFINITIONSHAPE($,$,(#35));",
    "#37=IFCBUILDINGELEMENTPROXY('3vB2YO$MX4xv5uCqZZG05x',$,'Vagg V1',$,$,#32,#36,$,$);",
    "#40=IFCRELCONTAINEDINSPATIALSTRUCTURE('2O2Fr$t4X7Zf8NOew3FLOL',$,$,$,(#27,#37),#8);",
    "ENDSEC;", "END-ISO-10303-21;"].join("\n");
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async ([obj, ifc]) => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    window.__calls = [];
    // Räkna IFC-trådar (stora modeller läses utanför sidans tråd).
    const W = window.Worker; window.__workers = 0; window.Worker = function (u, o) { window.__workers++; return new W(u, o); };
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    // 4D-planering (som har TC-behörigheten) svarar på mapplistor och filer.
    askOpener = async (type, extra) => {
      window.__calls.push([type, extra && (extra.folderId || extra.fileId) || null]);
      if (type === 'tcFolder' && !extra.folderId) return { folderId: 'root', projectName: 'Kvarteret', items: [{ id: 'f1', name: 'Etablering', type: 'folder' }, { id: 'x1', name: 'Ritning.pdf', type: 'file', size: 2000 }] };
      if (type === 'tcFolder' && extra.folderId === 'f1') return { folderId: 'f1', items: [{ id: 'F1', name: 'Bod.obj', type: 'file', size: obj.length, modified: '2026-10-01T10:00:00Z' }, { id: 'F2', name: 'Hus A.ifc', type: 'file', size: ifc.length, versionId: 'v1' }, { id: 'x2', name: 'Bild.png', type: 'file', size: 10 }] };
      if (type === 'tcFile' && extra.fileId === 'F1') return { bytes: new TextEncoder().encode(obj).buffer };
      if (type === 'tcFile' && extra.fileId === 'F2') return { bytes: new TextEncoder().encode(ifc).buffer };
      return {};
    };
  }, [OBJ, ifc]);
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
  // Namnet föreslås som dagens datum (ÅÅMMDD) + modellens namn och är markerat för att kunna ändras.
  const dn = await page.evaluate(() => ({ v: document.querySelector('#pmName').value, f: document.activeElement && document.activeElement.id }));
  const ymd = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  if (dn.v !== `${ymd} Bod` || dn.f !== 'pmName') fail('Namnet ska föreslås som ÅÅMMDD + namn och vara markerat: ' + JSON.stringify(dn));
  const conf = await page.textContent('#v3Models .pm-confirm');
  if (!/6 × 2.6 × 2.5 m/.test(conf)) fail('Bekräftelsen ska visa modellens mått: ' + conf);
  await page.fill('#pmName', 'Bod från TC');
  await page.click('#pmAccept');
  await page.waitForFunction(() => placeAssets.length === 1 && l3.addType && l3.addType.startsWith('model:'), null, { timeout: 10000 });
  const lib = JSON.parse(store.get('projects/p1/plan_models.json').content);
  if (lib.length !== 1 || lib[0].source !== 'Trimble Connect' || lib[0].name !== 'Bod från TC' || ![...store.keys()].some(k => /models\/.+\.json$/.test(k))) fail('Modellen ska sparas i biblioteket med källan Trimble Connect: ' + JSON.stringify(lib));
  if (!(await page.isHidden('#v3Models'))) fail('Rutan ska stängas när modellen är tillagd');
  if (!/Bod från TC/.test(await page.textContent('#v3Lib'))) fail('Modellen ska finnas under Egna modeller');

  // Ett tryck i scenen placerar den – geometrin hämtas då (inte bara en låda; Victor 2026-10-10).
  await page.evaluate(() => placeMeshCache.clear());
  const cv = await page.locator('#v3Canvas canvas').boundingBox();
  await page.evaluate(() => { l3StopFly(); const c = new THREE.Vector3(6512340 - l3.O[0], 150120 - l3.O[1], 0); l3.camera.position.set(c.x, c.y - 0.01, 90); l3.orbit.target.copy(c); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); });
  const [sx, sy] = await page.evaluate(() => { const q = l3ToScreen(new THREE.Vector3(6512340 - l3.O[0], 150120 - l3.O[1], 0)); return [q.x, q.y]; });
  await page.mouse.move(cv.x + sx, cv.y + sy); await page.waitForTimeout(60); await page.mouse.click(cv.x + sx, cv.y + sy); await page.waitForTimeout(300);
  const placed = await page.evaluate(() => placements.map(p => ({ type: p.type, x: p.x, y: p.y })));
  if (placed.length !== 1 || !placed[0].type.startsWith('model:') || Math.abs(placed[0].x - 6512340) > 1.5) fail('Ett tryck ska placera modellen: ' + JSON.stringify(placed));
  await page.waitForFunction(() => { const p = placements[0], g = l3.placeMeshes.get(p.id); return placeMeshCache.size === 1 && g && g.children.some(c => c.isMesh && c.geometry.index); } /* modellens delar är indexerade – lådan är det inte */, null, { timeout: 8000 }).catch(() => fail('Den placerade modellen ska visas med sin geometri, inte som en låda'));

  // Z (Victor 2026-10-09): underkant i modellens koordinater, går att skriva in; överkant visas.
  await page.waitForSelector('#v3Side [data-v3f="zAbs"]', { timeout: 5000 });
  const z0 = await page.inputValue('#v3Side [data-v3f="zAbs"]');
  await page.fill('#v3Side [data-v3f="zAbs"]', '12,5'); await page.press('#v3Side [data-v3f="zAbs"]', 'Enter');
  await page.$eval('#v3Side [data-v3f="zAbs"]', el => el.dispatchEvent(new Event('change')));
  await page.waitForTimeout(150);
  const zs = await page.evaluate(() => ({ dz: placements[0].dz, z: placements[0].z, base: placeBaseZ(placements[0]), txt: document.querySelector('#v3Side .v3-ztop').textContent, csv: l3CsvRows()[1].join(';') }));
  if (zs.base !== 12.5 || !/Z 12,500 \(underkant\) – 15,000 \(överkant\)/.test(zs.txt) || !/12,5;15/.test(zs.csv)) fail('Z ska visas och gå att ändra: ' + JSON.stringify({ z0, ...zs }));

  // Tydlig markering: lila konturer på det markerade objektet.
  const edges = await page.evaluate(() => { let n = 0; l3.placeMeshes.get(placements[0].id).traverse(o => { if (o.userData.selEdge) n++; }); return n; });
  if (!edges) fail('Det markerade objektet ska få konturer');
  // Högerpanelen kan breddas.
  const rs = await page.locator('#view3d .v3-rs-right').boundingBox();
  const w0 = await page.evaluate(() => document.getElementById('v3Side').getBoundingClientRect().width);
  await page.mouse.move(rs.x + 3, rs.y + rs.height / 2); await page.mouse.down(); await page.mouse.move(rs.x - 120, rs.y + rs.height / 2, { steps: 4 }); await page.mouse.up();
  const w1 = await page.evaluate(() => ({ w: document.getElementById('v3Side').getBoundingClientRect().width, pref: l3Prefs().sideW }));
  if (w1.w < w0 + 100 || Math.abs(w1.pref - w1.w) > 2) fail('Högerpanelen ska gå att bredda och bredden sparas: ' + JSON.stringify({ w0, ...w1 }));
  await page.evaluate(() => l3SelectIds([]));

  // Lägg till-menyn: grupperna fälls ihop och ut.
  await page.evaluate(() => l3PalTab('add'));
  await page.click('#v3Lib [data-v3grp="g:Maskiner"]');
  if (await page.$('#v3Lib [data-v3add="tornkran"]') || !(await page.evaluate(() => (l3Prefs().palClosed || []).includes('g:Maskiner')))) fail('Gruppen ska fällas ihop och sparas');
  await page.click('#v3Lib [data-v3grp="g:Maskiner"]');
  if (!(await page.$('#v3Lib [data-v3add="tornkran"]'))) fail('Gruppen ska fällas ut igen');

  // 3D-biblioteket (Victor 2026-10-10): kategorierna är mappar – dra objekt mellan dem, tänd/släck per mapp.
  const mid = await page.evaluate(() => placements[0].type);
  const drag = async (from, to) => {
    const a = await page.locator(from).boundingBox(), b = await page.locator(to).boundingBox();
    await page.mouse.move(a.x + 20, a.y + a.height / 2); await page.mouse.down();
    await page.mouse.move(a.x + 40, a.y + a.height / 2 + 10, { steps: 3 }); await page.mouse.move(b.x + 30, b.y + b.height / 2, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(250);
  };
  await drag(`#v3Lib [data-v3add="${mid}"]`, '#v3Lib [data-lfid="g:Maskiner"]');
  await page.waitForFunction(m => l3libFolderOf(m) === 'g:Maskiner', mid, { timeout: 5000 }).catch(() => fail('Modellen ska kunna dras till mappen Maskiner'));
  await page.waitForTimeout(200);
  const lf = JSON.parse(store.get('projects/p1/plan_libfolders.json').content);
  if (!lf.some(x => x.t === mid && x.f === 'g:Maskiner')) fail('Mappvalet ska sparas i plan_libfolders.json: ' + JSON.stringify(lf));
  if (!(await page.$(`#v3Lib [data-lfid="g:Maskiner"] + .v3-pal-items [data-v3add="${mid}"]`))) fail('Modellen ska visas i Maskiner');
  // Ny mapp genom att släppa på ＋ Ny mapp.
  page.once('dialog', d => d.accept('Mina kranar'));
  await drag('#v3Lib [data-v3add="tornkran"]', '#v3LibNew');
  await page.waitForFunction(() => l3lib.folders.some(f => f.name === 'Mina kranar') && l3libFolderOf('tornkran') === l3lib.folders.find(f => f.name === 'Mina kranar').id, null, { timeout: 5000 }).catch(async () => fail('Släpp på Ny mapp ska skapa mappen och flytta objektet dit' + JSON.stringify(await page.evaluate(() => [l3lib, l3libFolderOf('tornkran'), document.getElementById('v3LibNew').getBoundingClientRect(), document.getElementById('v3Status') && document.getElementById('v3Status').textContent]))));
  // Bocken släcker mappens placerade objekt (och Ctrl+Z ångrar).
  await page.click('#v3Lib [data-lfvis="g:Maskiner"]');
  if (await page.evaluate(() => l3.placeMeshes.get(placements[0].id).visible)) fail('Bocken ska släcka mappens objekt');
  await page.click('#v3Lib [data-lfvis="g:Maskiner"]');
  if (!(await page.evaluate(() => l3.placeMeshes.get(placements[0].id).visible))) fail('Bocken ska tända mappens objekt igen');
  // Mappen tas bort – objekten går tillbaka till sina vanliga mappar.
  const fid = await page.evaluate(() => l3lib.folders.find(f => f.name === 'Mina kranar').id);
  page.once('dialog', d => d.accept());
  await page.click(`#v3Lib [data-lfdel="${fid}"]`);
  await page.waitForFunction(() => l3libFolderOf('tornkran') === 'g:Maskiner' && !l3lib.folders.some(f => f.name === 'Mina kranar'), null, { timeout: 5000 }).catch(() => fail('Borttagen mapp: objekten ska tillbaka'));
  // En modell som används kan inte tas bort ur biblioteket – de placerade objekten markeras.
  await page.click(`#v3Lib [data-v3libdel="${mid.slice(6)}"]`);
  if (!(await page.evaluate(() => placeAssets.length === 1 && l3.sel.has(placements[0].id)))) fail('En använd modell ska inte tas bort');
  await page.evaluate(() => l3SelectIds([]));
  // En oanvänd modell tas bort ur biblioteket (filerna och TC rörs inte).
  await page.evaluate(async () => { const a = { id: 'old1', name: 'Gammal kran', kind: 'mesh', path: 'projects/p1/models/old1.json' }; placeAssets.push(a); await ghWriteJSON(settings.githubToken, pmAssetsPath(), arr => [...arr, a], 't'); l3RenderLib(); });
  const tc0 = await page.evaluate(() => window.__calls.length);
  page.once('dialog', d => d.accept());
  await page.click('#v3Lib [data-v3libdel="old1"]');
  await page.waitForFunction(() => !placeAssets.some(a => a.id === 'old1') && !document.querySelector('#v3Lib [data-v3add="model:old1"]'), null, { timeout: 5000 }).catch(() => fail('Modellen ska tas bort ur biblioteket'));
  await page.waitForTimeout(200);
  const lib2 = JSON.parse(store.get('projects/p1/plan_models.json').content);
  if (lib2.length !== 1 || lib2[0].id === 'old1' || (await page.evaluate(() => window.__calls.length)) !== tc0) fail('Bara biblioteksposten ska tas bort, inget i TC: ' + JSON.stringify(lib2));

  // Ritningen som mark (Visa-menyn) och projektets modeller i mappar (Lager → ＋ → Bläddra i Trimble Connect).
  await page.click('[data-paltab="layers"]');
  const plan0 = await page.evaluate(() => l3Prefs().plan);
  await page.evaluate(() => { const c = document.getElementById('v3ShowPlan'); c.checked = !c.checked; c.dispatchEvent(new Event('change')); });
  const st = await page.evaluate(() => [l3Prefs().plan, l3.planMesh ? l3.planMesh.visible : null]);
  if (st[0] !== !plan0 || (st[1] !== null && st[1] !== !plan0)) fail('Ritningen ska tändas/släckas under Visa: ' + st);
  await page.click('#v3PalLayers [data-ldd="models"]');
  await page.click('#v3PalLayers [data-l3l-browse]');
  await page.waitForSelector('#v3PalLayers [data-l3l-dir="f1"]', { timeout: 5000 });
  await page.click('#v3PalLayers [data-l3l-dir="f1"]');
  await page.waitForSelector('#v3PalLayers [data-l3l-file="F2"]', { timeout: 5000 });
  if (await page.$('#v3PalLayers [data-l3l-file="F1"]')) fail('Lager ska bara visa IFC-filer');
  await page.click('#v3PalLayers [data-l3l-file="F2"]');
  await page.waitForFunction(() => l3b.models.some(m => m.id === 'f:F2' && m.visible), null, { timeout: 30000 });
  await page.waitForTimeout(200);
  if (!(await page.evaluate(() => document.querySelector('#v3PalLayers [data-l3l-file="F2"]').classList.contains('on')))) fail('Ögat ska visa att modellen är tänd');
  // Lätt kopia för mobilen (Victor 2026-10-11): datorn sparar den i datalagret (inte i TC); mobilen läser den i stället för IFC:n.
  await page.waitForFunction(() => window.__lt || (l3lt.list && l3lt.list.some(x => x.key === 'f:F2')), null, { timeout: 20000 }).catch(() => fail('Den lätta kopian ska sparas: ' + [...store.keys()].join(', ')));
  const ltEntry = JSON.parse(store.get('projects/p1/mobil3d.json').content).find(x => x.key === 'f:F2');
  if (!ltEntry || !ltEntry.parts.length || !ltEntry.parts.every(p => store.has(p) && /^projects\/p1\/mobil3d\//.test(p))) fail('Kopian ska ligga i datalagret: ' + JSON.stringify(ltEntry));
  const lt = await page.evaluate(async () => {
    const m = l3b.models.find(x => x.id === 'f:F2'), n0 = window.__calls.filter(c => c[0] === 'tcFile').length;
    const out = await l3ltLoad(m.src);
    const sum = o => o.ranges.map(r => r.name + ':' + r.count).sort().join('|');
    const bb = o => { const b = new THREE.Box3(); o.meshes.forEach(x => { x.geometry.computeBoundingBox(); b.union(x.geometry.boundingBox); }); return b.min.toArray().concat(b.max.toArray()).map(v => Math.round(v * 100) / 100); };
    const r = { same: sum(out) === sum(m), tris: [out.tris, m.tris], bb: [bb(out), bb(m)], tc: window.__calls.filter(c => c[0] === 'tcFile').length - n0, nrm: out.meshes.every(x => x.geometry.getAttribute('normal').array instanceof Int8Array) };
    out.meshes.forEach(x => x.geometry.dispose()); return r;
  });
  if (!lt.same || lt.tris[0] !== lt.tris[1] || JSON.stringify(lt.bb[0]) !== JSON.stringify(lt.bb[1]) || lt.tc || !lt.nrm) fail('Mobilen ska läsa samma modell ur den lätta kopian, utan TC: ' + JSON.stringify(lt));

  // Normalerna kommer färdiga från tråden (Int8) och pekar som ytorna; färgerna är modellens egna.
  const nq = await page.evaluate(() => { let ok = 0, bad = 0, int8 = true; l3b.models.find(m => m.id === 'f:F2').meshes.forEach(x => { const g = x.geometry, P = g.getAttribute('position'), N = g.getAttribute('normal'), I = g.index.array; int8 = int8 && N.array instanceof Int8Array; for (let t = 0; t < I.length; t += 3) { const a = new THREE.Vector3().fromBufferAttribute(P, I[t]), b = new THREE.Vector3().fromBufferAttribute(P, I[t + 1]), c = new THREE.Vector3().fromBufferAttribute(P, I[t + 2]); const f = b.sub(a).cross(c.sub(a)).normalize(), n = new THREE.Vector3().fromBufferAttribute(N, I[t]).normalize(); if (f.dot(n) > 0.95) ok++; else bad++; } }); return { ok, bad, int8 }; });
  if (!nq.int8 || nq.bad || !nq.ok) fail('Normalerna från tråden: ' + JSON.stringify(nq));
  // Allt ska med (Victor 2026-10-10): detaljer (t.ex. IfcDiscreteAccessory) ritas som standard, och ett objekt vars
  // form inte går att läsa redovisas per klass i stället för att försvinna tyst.
  const ifc2 = ifc.replace("#40=IFCRELCONTAINEDINSPATIALSTRUCTURE('2O2Fr$t4X7Zf8NOew3FLOL',$,$,$,(#27,#37),#8);", [
    "#50=IFCCARTESIANPOINT((6512360.,150125.,0.));", "#51=IFCAXIS2PLACEMENT3D(#50,$,$);", "#52=IFCLOCALPLACEMENT(#7,#51);",
    "#53=IFCEXTRUDEDAREASOLID(#23,#2,#12,1.);", "#54=IFCSHAPEREPRESENTATION(#3,'Body','SweptSolid',(#53));", "#55=IFCPRODUCTDEFINITIONSHAPE($,$,(#54));",
    "#56=IFCDISCRETEACCESSORY('2b3K1nUZ90qeBq0yNYB3Qm',$,'Takplåt',$,$,#52,#55,$,$);",
    "#60=IFCSHAPEREPRESENTATION(#3,'Body','SweptSolid',(#99));", "#61=IFCPRODUCTDEFINITIONSHAPE($,$,(#60));",
    "#62=IFCBEAM('0r1kK1nUZ90qeBq0yNYB3Qn',$,'Trasig balk',$,$,#52,#61,$,$);",
    "#40=IFCRELCONTAINEDINSPATIALSTRUCTURE('2O2Fr$t4X7Zf8NOew3FLOL',$,$,$,(#27,#37,#56,#62),#8);"].join("\n"));
  const all = await page.evaluate(async t => { const out = await l3bParseWorker(new TextEncoder().encode(t).buffer, null, 1e6); out.meshes.forEach(m => m.geometry.dispose()); return { names: out.ranges.map(r => r.name), missing: out.missing || {} }; }, ifc2);
  if (!all.names.includes('Takplåt') || all.missing.IfcBeam !== 1) fail('Allt ska läsas in och det som inte går redovisas: ' + JSON.stringify(all));
  // En tråd som tystnar (Chrome stänger den vid minnesbrist utan fel): vakten märker det och läser om med en tråd.
  const stall = await page.evaluate(async t => {
    const W0 = window.Worker; let n = 0;
    window.Worker = function (u) { const w = new W0(u); if (n++ === 0) { const pm = w.postMessage.bind(w); w.postMessage = () => {}; } return w; }; // den första tråden får aldrig sitt jobb
    window.__l3Parts = 2; window.__l3OpenMs = 1500;
    try { const out = await l3bParseAny(new TextEncoder().encode(t).buffer, null, 1e6); const names = out.ranges.map(r => r.name); out.meshes.forEach(m => { if (m.parent) m.parent.remove(m); m.geometry.dispose(); }); return { names, parts: out.parts, status: document.getElementById('v3Status').textContent }; }
    finally { window.Worker = W0; delete window.__l3Parts; delete window.__l3OpenMs; }
  }, ifc2);
  if (stall.parts !== 1 || !stall.names.includes('Takplåt') || !stall.names.includes('Pelare K10')) fail('En tyst tråd ska ge ett nytt försök med en tråd: ' + JSON.stringify(stall));
  // Läsaren hänger sig mitt i (Victor 2026-10-10: stannade vid 88 %): ny tråd från senaste kontrollpunkt, bara
  // portionen där den hängde (tio objekt) hoppas över och redovisas – inget dubbelt, resten kommer med.
  const many = (() => {
    const L = ifc.split('\n'), end = L.findIndex(l => l.startsWith('#40=')), add = [], ids = [];
    for (let i = 0; i < 25; i++) {
      const b = 1000 + i * 10;
      add.push(`#${b}=IFCCARTESIANPOINT((${6512300 + i * 3}.,150150.,0.));`, `#${b + 1}=IFCAXIS2PLACEMENT3D(#${b},$,$);`, `#${b + 2}=IFCLOCALPLACEMENT(#7,#${b + 1});`,
        `#${b + 3}=IFCEXTRUDEDAREASOLID(#23,#2,#12,1.);`, `#${b + 4}=IFCSHAPEREPRESENTATION(#3,'Body','SweptSolid',(#${b + 3}));`, `#${b + 5}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${b + 4}));`,
        `#${b + 6}=IFCBUILDINGELEMENTPROXY('${('B' + String(i).padStart(21, '0'))}',$,'Låda ${i}',$,$,#${b + 2},#${b + 5},$,$);`);
      ids.push('#' + (b + 6));
    }
    L.splice(end, 1, ...add, `#40=IFCRELCONTAINEDINSPATIALSTRUCTURE('2O2Fr$t4X7Zf8NOew3FLOL',$,$,$,(${ids.join(',')}),#8);`);
    return L.join('\n');
  })();
  const hang = await page.evaluate(async t => {
    const W0 = window.Worker; let n = 0;
    window.Worker = function (u) {
      const w = new W0(u);
      if (n++ === 0) { let dead = false; const real = w.addEventListener.bind(w); Object.defineProperty(w, 'onmessage', { set(fn) { real('message', ev => { if (dead) return; if (ev.data && ev.data.type === 'at' && ev.data.i === 10) dead = true; fn(ev); }); } }); }
      return w;
    };
    window.__l3Parts = 1; window.__l3StallMs = 1500;
    try { const out = await l3bParseWorker(new TextEncoder().encode(t).buffer, null, 1e6); const names = out.ranges.map(r => r.name); out.meshes.forEach(m => m.geometry.dispose()); return { names, hung: out.hung.map(h => h[1]) }; }
    finally { window.Worker = W0; delete window.__l3Parts; delete window.__l3StallMs; }
  }, many);
  // ifc-lite (Victor 2026-10-11): samma geometri som web-ifc på samma ställe; och det web-ifc hängde sig på läses av ifc-lite.
  const cmp = await page.evaluate(async t => {
    const box = out => { const b = {}; out.meshes.forEach(m => { const P = m.geometry.getAttribute('position'), N = m.geometry.getAttribute('normal'); m.userData.l3b.ranges.forEach(r => { const bb = new THREE.Box3(); for (let i = r.start; i < r.start + r.count; i++) bb.expandByPoint(new THREE.Vector3().fromBufferAttribute(P, i)); b[r.name] = { min: bb.min.toArray().map(v => Math.round(v * 1000) / 1000), max: bb.max.toArray().map(v => Math.round(v * 1000) / 1000), guid: r.guid, nrm: N && N.array instanceof Int8Array }; }); }); return b; };
    const a = await l3bParseWorker(new TextEncoder().encode(t).buffer, null, 1e6, null, null, 1);
    const b = await l3bParseWorker(new TextEncoder().encode(t).buffer, null, 1e6, null, null, 1, { engine: 'lite' });
    const r = { web: box(a), lite: box(b) }; [a, b].forEach(o => o.meshes.forEach(m => m.geometry.dispose())); return r;
  }, ifc2);
  for (const n of ['Pelare K10', 'Vagg V1', 'Takplåt']) if (!cmp.lite[n] || JSON.stringify(cmp.lite[n]) !== JSON.stringify(cmp.web[n])) fail('ifc-lite ska ge samma objekt på samma ställe som web-ifc (' + n + '): ' + JSON.stringify({ web: cmp.web[n], lite: cmp.lite[n] }));
  const rec = await page.evaluate(async t => {
    const W0 = window.Worker; let n = 0;
    window.Worker = function (u, o) {
      const w = new W0(u, o);
      if (n++ === 0) { let dead = false; const real = w.addEventListener.bind(w); Object.defineProperty(w, 'onmessage', { set(fn) { real('message', ev => { if (dead) return; if (ev.data && ev.data.type === 'at' && ev.data.i === 10) dead = true; fn(ev); }); } }); }
      return w;
    };
    window.__l3Parts = 1; window.__l3StallMs = 1500;
    try { const out = await l3bParseAny(new TextEncoder().encode(t).buffer, null, 1e6); const names = out.ranges.map(r => r.name); out.meshes.forEach(m => m.geometry.dispose()); return { names, hung: out.hung.length, recovered: out.recovered }; }
    finally { window.Worker = W0; delete window.__l3Parts; delete window.__l3StallMs; }
  }, many);
  const rboxes = rec.names.filter(x => /^Låda/.test(x));
  if (rboxes.length !== 25 || new Set(rboxes).size !== 25 || rec.hung !== 0 || rec.recovered !== 10) fail('Det web-ifc hängde sig på ska läsas med ifc-lite: ' + JSON.stringify(rec));
  const boxes = hang.names.filter(x => /^Låda/.test(x));
  if (boxes.length !== 15 || new Set(boxes).size !== 15 || hang.hung.length !== 10 || hang.hung.some(h => boxes.includes(h))) fail('Läsaren som hänger sig ska hoppa över just den portionen: ' + JSON.stringify(hang));
  if (process.env.SHOTL) { await page.evaluate(() => { const b = new THREE.Box3(); l3b.models.forEach(m => m.meshes.forEach(x => b.expandByObject(x))); const c = b.getCenter(new THREE.Vector3()); l3StopFly(); l3.orbit.target.copy(c); l3.camera.position.copy(c).add(new THREE.Vector3(-22, -30, 18)); l3.orbit.update(); l3Render(); }); await page.waitForTimeout(400); await page.screenshot({ path: process.env.SHOTL }); }
  await page.click('#v3PalLayers [data-l3l-file="F2"]');
  if (await page.evaluate(() => l3b.models.find(m => m.id === 'f:F2').visible)) fail('Ögat ska släcka modellen');
  await page.click('#v3PalLayers [data-l3l-sort="list"]'); // ‹ Modeller
  if (!/Hus A\.ifc/.test(await page.textContent('#v3PalLayers'))) fail('Inlästa ska lista modellen');
  if (!(await page.evaluate(() => window.__calls.some(c => c[0] === 'tcFile' && c[1] === 'F2')))) fail('Modellen ska hämtas via 4D-planering');
  // Läst i en egen tråd och sparad i webbläsarens cache (samma version öppnas direkt nästa gång).
  const wc = await page.evaluate(async () => { for (let i = 0; i < 40; i++) { const r = await l3bCacheGet({ fileId: 'F2', version: 'v1' }); if (r) return { workers: window.__workers, chunks: r.chunks.length, tris: r.tris }; await new Promise(res => setTimeout(res, 100)); } return { workers: window.__workers }; });
  if (!wc.workers || !wc.chunks || !wc.tris) fail('IFC:n ska läsas i en egen tråd och sparas i cachen: ' + JSON.stringify(wc));
  const fromCache = await page.evaluate(async () => { const rec = await l3bCacheGet({ fileId: 'F2', version: 'v1' }); const m = l3bFromCache(rec); const n = m.meshes[0].geometry.getAttribute('normal'); return { meshes: m.meshes.length, tris: m.tris, ranges: m.ranges.length, nrm: rec.chunks.every(c => c.nrm instanceof Int8Array), int8: n.array instanceof Int8Array && n.normalized }; });
  if (!fromCache.meshes || !fromCache.ranges || !fromCache.nrm || !fromCache.int8) fail('Cachen ska ge tillbaka modellen: ' + JSON.stringify(fromCache));
  // Nästa öppning: modellen som var tänd visas direkt ur cachen (ingen ny hämtning) ...
  const re1 = await page.evaluate(async () => {
    l3bShow('f:F2', true); l3bRemove('f:F2'); const n0 = window.__calls.filter(c => c[0] === 'tcFile').length;
    await l3bRestore();
    return { loaded: l3b.models.some(m => m.id === 'f:F2' && m.visible), fetched: window.__calls.filter(c => c[0] === 'tcFile').length - n0, remembered: l3bRemembered().map(w => w.id + '@' + w.version) };
  });
  if (!re1.loaded || re1.fetched !== 0 || !re1.remembered.includes('f:F2@v1')) fail('Tända modeller ska visas direkt ur cachen vid öppning: ' + JSON.stringify(re1));
  // ... och finns en ny version i TC läses den in och ersätter den visade.
  const re2 = await page.evaluate(async () => {
    const orig = askOpener;
    askOpener = async (type, extra, t, p) => { const r = await orig(type, extra, t, p); if (type === 'tcFolder' && extra.folderId === 'f1') r.items = r.items.map(x => x.id === 'F2' ? { ...x, versionId: 'v2' } : x); return r; };
    const n0 = window.__calls.filter(c => c[0] === 'tcFile').length;
    await l3bRestore(); askOpener = orig;
    return { n: l3b.models.filter(m => m.id === 'f:F2').length, ver: (l3b.models.find(m => m.id === 'f:F2') || {}).src.version, fetched: window.__calls.filter(c => c[0] === 'tcFile').length - n0 };
  });
  if (re2.n !== 1 || re2.ver !== 'v2' || re2.fetched !== 1) fail('En ny version i TC ska ersätta den visade: ' + JSON.stringify(re2));
  // Hämtade 3D-modeller (Victor 2026-10-10): släckta hämtade står kvar i listan, soptunnan tar bort (inget i TC).
  await page.evaluate(() => { const k = l3bRememberKey(), a = JSON.parse(localStorage.getItem(k)); a.push({ id: 'f:F9', fileId: 'F9', name: 'Gammal.ifc', version: 'v1', parentId: 'f1', on: false }); localStorage.setItem(k, JSON.stringify(a)); l3SetPref('laySort', 'list'); l3LayersRender(); });
  const hm = await page.evaluate(() => ({ rem: !!document.querySelector('#v3PalLayers [data-l3l-rem="f:F9"]'), trashF2: !!document.querySelector('#v3PalLayers [data-l3l-forget="f:F2"]'), restoreSkips: !l3bRemembered().some(w => w.id === 'f:F9') }));
  if (!hm.rem || !hm.trashF2 || !hm.restoreSkips) fail('Släckta hämtade modeller ska stå kvar med soptunna: ' + JSON.stringify(hm));
  const tcF = await page.evaluate(() => window.__calls.length);
  await page.click('#v3PalLayers [data-l3l-forget="f:F9"]'); await page.waitForTimeout(150);
  if (await page.$('#v3PalLayers [data-l3l-rem="f:F9"]') || await page.evaluate(() => l3bRememberedAll().some(w => w.id === 'f:F9')) || (await page.evaluate(() => window.__calls.length)) !== tcF) fail('Soptunnan ska ta bort modellen ur Hämtade (utan anrop till TC)');

  // Blandad markering: fundament (IFC-objekt) + pelare (etablering) med Ctrl-klick, högerklick → Exportera markerade som IFC.
  {
    const hExp = d => d.accept(); page.__uiDialogHandlers.push(hExp);
    const mx = await page.evaluate(async () => {
      const m = l3b.models.find(x => x.id === 'f:F2'); m.visible = true; m.meshes.forEach(x => { x.visible = true; });
      let ent = null; m.meshes.forEach(mesh => mesh.userData.l3b.ranges.forEach((r, ri) => { if (/K10/.test(r.name)) ent = { mesh, ri }; }));
      const O = l3.O, p = { id: 'mx1', type: 'container', name: 'Pelare', x: O[0] + 60, y: O[1] + 60, z: 0, L: 1, B: 1, H: 5, R: 0, rot: 0 };
      placements.push(p); const g = l3AddPlacementMesh(p);
      l3SelectIds([]); l3bsSet([ent]);
      const side0 = l3bs.sel.length === 1;
      l3SelectIds(['mx1'], { keepIfc: true }); // Ctrl-klick på pelaren: fundamentet ska ligga kvar
      const both = l3bs.sel.length === 1 && l3.sel.has('mx1');
      const panel = /1 IFC-objekt \+ 1 etableringsobjekt/.test(document.getElementById('v3Side').textContent) && !!document.getElementById('v3MixExport');
      l3bsSet([ent, ent], { keepPlaces: true }); const keep = l3.sel.has('mx1') && l3bs.sel.length === 1; // Ctrl-klick på IFC-objekt behåller etableringen
      l3SelectIds(['mx1']); const plain = l3bs.sel.length === 0 && l3.sel.has('mx1'); // vanligt klick byter ut
      { const r0 = document.getElementById('v3Canvas').getBoundingClientRect(); l3OpenCtx(r0.left + 300, r0.top + 200, { clientX: r0.left + 5, clientY: r0.top + 5 }); } var menuSingle = !!document.querySelector('#v3Ctx [data-ctx="exp"]'); l3HideMenus();
      l3SelectIds(['mx1'], { keepIfc: true }); l3bsSet([ent], { keepPlaces: true });
      // Högerklicksmenyn har Exportera markerade som IFC…
      const r = document.getElementById('v3Canvas').getBoundingClientRect(); l3OpenCtx(r.left + 300, r.top + 200, { clientX: r.left + 5, clientY: r.top + 5 });
      const menu = !!document.querySelector('#v3Ctx [data-ctx="exp"]');
      const calls = []; const oIfc = l3bsExportIfc, oAsk = askOpener;
      let merge = true;
      l3bsExportIfc = async opts => { calls.push(['ifc', l3bs.sel.length, opts && opts.graft || null]); const r = [{ name: 'Modell urval.ifc' }]; if (merge && opts && opts.graft) r.merged = 1; else if (opts && opts.graft) r.graftWhy = 'ingen plats'; return r; };
      askOpener = async (type, extra, t, pr) => { if (type === 'placeIfcText') { calls.push(['text', extra.ids.join()]); return { text: 'GRAFT', n: extra.ids.length }; } if (type === 'placeSaveIfc') { calls.push(['place', extra.ids.join()]); return { n: extra.ids.length, files: ['Etablering urval.ifc'] }; } return oAsk(type, extra, t, pr); };
      document.querySelector('#v3Ctx [data-ctx="exp"]').click(); for (let i = 0; i < 60 && calls.length < 2; i++) await new Promise(r => setTimeout(r, 50));
      const merged = JSON.stringify(calls); // allt i EN fil: text → IFC-export med etableringen inlagd, ingen egen etableringsfil
      // Går det inte att lägga in (t.ex. ingen plats): etableringen sparas som en egen fil.
      calls.length = 0; merge = false; l3bsSet([ent], { keepPlaces: true }); l3SelectIds(['mx1'], { keepIfc: true });
      await l3ExportSelected(); const fallback = JSON.stringify(calls);
      l3bsExportIfc = oIfc; askOpener = oAsk;
      l3bsSet([]); l3SelectIds([]); placements.splice(placements.indexOf(p), 1); l3.groups.places.remove(g); l3.placeMeshes.delete('mx1');
      return { side0, both, panel, keep, plain, menuSingle, menu, merged, fallback };
    });
    page.__uiDialogHandlers.splice(page.__uiDialogHandlers.indexOf(hExp), 1);
    if (!mx.side0 || !mx.both || !mx.panel || !mx.keep || !mx.plain || !mx.menuSingle || !mx.menu || mx.merged !== JSON.stringify([['text', 'mx1'], ['ifc', 1, 'GRAFT']]) || mx.fallback !== JSON.stringify([['text', 'mx1'], ['ifc', 1, 'GRAFT'], ['place', 'mx1']])) fail('Blandad markering och export (IFC + etablering): ' + JSON.stringify(mx));
    else console.log('OK: Ctrl-klick markerar IFC-objekt och etablering tillsammans; högerklick → Exportera markerade som IFC (allt i en fil, egen fil för etableringen om det inte går)');
  }
  // Bemanning: gubbar per entreprenör i kluster, antal på knappar, kommentar som skylt – och med i IFC.
  const crew = await page.evaluate(async () => {
    const out = {}, wait = ms => new Promise(r => setTimeout(r, ms));
    items.push({ id: 'crewx', contractor: 'Procyon', area: 'A', activity: 'X', start_date: '2026-10-19', end_date: '2026-10-30' }); items.push({ id: 'crewy', contractor: 'Betongteknik', area: 'A', activity: 'Y', start_date: '2026-10-19', end_date: '2026-10-30' });
    const cs = crewContractors(); out.cs = cs.includes('Procyon') && cs.includes('Betongteknik'); const t = crewType('Procyon'), lib = placeLib(t); out.lib = !!lib.crew && lib.group === 'Personal' && lib.contractor === 'Procyon' && crewColor('Procyon') !== crewColor('Betongteknik');
    out.menu = l3libItems().some(it => it.k === t) && l3libFolderOf(t) === 'g:Personal';
    const O = l3.O, p = placeNew(t, [O[0] + 40, O[1] + 40, 0]); out.defaults = p.count === 4 && p.comment === '' && p.name === 'Bemanning Procyon 1'.replace(' 1', '') + ' ' + p.name.split(' ').pop() || /^Bemanning Procyon/.test(p.name);
    placements.push(p); placeTouch(p); l3AddPlacementMesh(p); l3SelectIds([p.id]); await wait(100);
    const side = document.getElementById('v3Side'); out.panel = !!side.querySelector('[data-crew="inc"]') && !!side.querySelector('[data-crew="comment"]');
    const n0 = placeParts(p).filter(x => !x.tris).length; side.querySelector('[data-crew="inc"]').click(); await wait(100); const n1 = placeParts(p).filter(x => !x.tris).length; out.inc = p.count === 5 && n1 > n0;
    document.querySelector('#v3Side [data-crew="inc5"]').click(); await wait(100); out.inc5 = p.count === 10; document.querySelector('#v3Side [data-crew="dec"]').click(); await wait(100); out.dec = p.count === 9;
    const ta = document.querySelector('#v3Side [data-crew="comment"]'); ta.value = 'Armerar plattan, skift 1'; ta.dispatchEvent(new Event('change', { bubbles: true })); await wait(100); out.comment = p.comment === 'Armerar plattan, skift 1' && placeParts(p).some(x => x.tris && x.tris.faces.length > 100);
    out.mesh = l3.placeMeshes.get(p.id).children.length >= 3 && p.L > 2.4;
    p.comment = ''; p.itemId = 'crewx'; out.actFromItem = crewActivity(p) === 'X' && placeParts(p).some(x => x.tris); p.comment = 'Armerar plattan, skift 1'; p.itemId = null;
    const ifc = buildPlacementsIfc('T', new Set([p.id])); out.ifc = !!ifc && /IFCTRIANGULATEDFACESET/.test(ifc.text) && /Antal personer/.test(ifc.text) && /Armerar plattan, skift 1/.test(ifc.text) && /Procyon/.test(ifc.text);
    placements.splice(placements.indexOf(p), 1); l3.groups.places.remove(l3.placeMeshes.get(p.id)); l3.placeMeshes.delete(p.id); l3SelectIds([]); items.pop(); items.pop();
    return out; });
  if (!Object.values(crew).every(v => v === true)) fail('Bemanning: ' + JSON.stringify(crew)); else console.log('OK: bemanning – gubbar per entreprenör i kluster, antal på knappar, kommentar-skylt och med i IFC');
  // Mobilkranen lyfter ett objekt ur modellen: haka i, bär (pendlar efter kroken), sätt ner = flytt som kan ångras.
  const lift1 = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms)), out = {};
    const m = l3b.models.find(x => x.id === 'f:F2'); m.visible = true; m.meshes.forEach(x => { x.visible = true; });
    let ent = null; m.meshes.forEach(mesh => mesh.userData.l3b.ranges.forEach((r, ri) => { if (/K10/.test(r.name)) ent = { mesh, ri }; }));
    const P = ent.mesh.geometry.getAttribute('position'), r = ent.mesh.userData.l3b.ranges[ent.ri], x0 = P.getX(r.start), z0 = P.getZ(r.start);
    const box = new THREE.Box3(), v = new THREE.Vector3(); ent.mesh.updateMatrixWorld(true); for (let i = r.start; i < r.start + r.count; i++) box.expandByPoint(v.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(ent.mesh.matrixWorld));
    const top = box.getCenter(new THREE.Vector3()); top.z = box.max.z + 0.3;
    const hook = new THREE.Object3D(); l3.scene.add(hook); hook.position.copy(top).add(new THREE.Vector3(0, 0, 0.55));
    const avG = new THREE.Group(); l3.scene.add(avG);
    Object.assign(l3w, { on: true, kind: 'crane', workOn: true, av: { g: avG, hookObj: hook }, info: [] });
    l3bsSet([]); l3liftGrab(); out.session = !!(l3lift.s && l3bm.session && l3bm.session.crane); out.gizmo = !l3.gizmo.object;
    const move = async (dx, ms) => { hook.position.x += dx; for (let i = 0; i < ms / 40; i++) { l3liftUpdate(); await wait(40); } };
    await move(0, 200); await move(12, 1400); out.carried = Math.abs(l3bm.session.G.position.x - hook.position.x) < 1.2;
    out.info = (l3w.info || []).some(q => q[0] === 'Last'); l3liftYaw(Math.PI / 2); await move(0, 800); out.yaw = Math.abs(l3bm.session.G.rotation.z - Math.PI / 2) < 0.15;
    l3liftRelease(); out.released = !l3lift.s && !l3bm.session && !l3lift.rig;
    const cx = (() => { const b2 = new THREE.Box3(); ent.mesh.updateMatrixWorld(true); for (let i = r.start; i < r.start + r.count; i++) b2.expandByPoint(v.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(ent.mesh.matrixWorld)); return b2.getCenter(new THREE.Vector3()); })();
    out.moved = Math.abs(cx.x - (top.x + 12)) < 1.2; out.pending = l3bmPending('f:F2');
    l3Undo(); const bu = new THREE.Box3(); ent.mesh.updateMatrixWorld(true); for (let i = r.start; i < r.start + r.count; i++) bu.expandByPoint(v.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(ent.mesh.matrixWorld)); out.undone = Math.abs(bu.getCenter(new THREE.Vector3()).x - top.x) < 0.05 && l3bmPending('f:F2') === 0;
    out.models = (() => { l3SetPref('craneModel', 'm60'); const a = l3lCap(20); l3SetPref('craneModel', 'm400'); const b2 = l3lCap(20); l3SetPref('craneModel', 'own'); l3SetPref('craneChart', '5:10\n20:2'); const c = l3lCap(20); l3SetPref('craneModel', 'm220'); return L3L_MODELS.length >= 6 && a === 8 && b2 === 92 && Math.abs(c - 2) < 1e-6 && l3lCap(20) === 50; })();
    // lastdiagram: utnyttjande och överlast
    l3w.info = [['Radie', '20,0 m']]; l3lift.loadT = 30; l3liftLoadInfo(); out.util = Math.abs(l3lift.util - 0.6) < 0.02 && l3w.info.some(q => q[0] === 'Utnyttjande' && /60 %/.test(q[1]));
    l3lift.loadT = 80; l3liftLoadInfo(); out.over = l3lift.util > 1 && l3w.info.some(q => /ÖVERLAST/.test(q[1])); l3lift.loadT = 0; l3lift.warned = false;
    // spela in och spela upp: objektet lyfts, flyttas, sätts ner; uppspelningen återställer och gör om det
    l3w.ctl = { slew: 0, ang: 0.5, ext: 0, hook: 3, out: 1 }; l3w.ctlT = { ...l3w.ctl }; l3w.p = new THREE.Vector3(); l3w.heading = 0; l3w.keys = new Set(); hook.position.copy(top).add(new THREE.Vector3(0, 0, 0.55));
    const tick = async ms => { for (let i = 0; i < ms / 40; i++) { l3liftTick(); await wait(40); } };
    const centerX = () => { const b2 = new THREE.Box3(); ent.mesh.updateMatrixWorld(true); for (let i = r.start; i < r.start + r.count; i++) b2.expandByPoint(v.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(ent.mesh.matrixWorld)); return b2.getCenter(new THREE.Vector3()).x; };
    l3liftRecToggle(); out.rec = !!l3lift.rec; await tick(300); l3bsSet([]); l3liftGrab(); await tick(300); hook.position.x += 8; l3w.ctl.slew += 0.3; await tick(1000); l3liftRelease(); await tick(200); l3liftRecToggle();
    out.recd = !!l3lift.recd && l3lift.recd.samples.length > 8 && l3lift.recd.ev.some(e => e.type === 'grab') && l3lift.recd.ev.some(e => e.type === 'release') && !!l3lift.tracePts && l3lift.tracePts.length > 5;
    const cx1 = centerX(); l3liftPlay(); out.reset = Math.abs(centerX() - top.x) < 0.05 && !!l3lift.play;
    for (let i = 0; i < 250 && l3lift.play; i++) { l3liftTick(); await wait(40); } await tick(200);
    out.played = !l3lift.play && Math.abs(centerX() - cx1) < 1.5; out.cx = [cx1, centerX()];
    l3liftTraceClear(); l3lift.recd = null; for (let i = 0; i < 3; i++) l3Undo();
    l3w.ctlT = null; if (l3w.ctlEl) { l3w.ctlEl.remove(); l3w.ctlEl = null; }
    l3.scene.remove(hook); l3.scene.remove(avG); l3w.on = false; l3w.av = null; l3w.workOn = false; l3w.kind = 'human'; l3bsSet([]);
    return out;
  });
  if (!lift1.session || !lift1.gizmo || !lift1.carried || !lift1.info || !lift1.yaw || !lift1.released || !lift1.moved || lift1.pending < 1 || !lift1.undone || !lift1.models || !lift1.util || !lift1.over || !lift1.rec || !lift1.recd || !lift1.reset || !lift1.played) fail('Kranen lyfter objekt: ' + JSON.stringify(lift1));
  else console.log('OK: mobilkranen hakar i ett objekt ur modellen, bär det efter kroken, vrider och sätter ner det (flytt som går att ångra)');
  // Flytta ett objekt i IFC:n och spara som ny fil i samma mapp i TC (Victor 2026-10-10).
  const mv = await page.evaluate(async () => {
    const m = l3b.models.find(x => x.id === 'f:F2'); m.visible = true; m.meshes.forEach(x => { x.visible = true; });
    let ent = null; m.meshes.forEach(mesh => mesh.userData.l3b.ranges.forEach((r, ri) => { if (/K10/.test(r.name)) ent = { mesh, ri }; }));
    l3bsSet([ent]);
    const p = ent.mesh.geometry.getAttribute('position'), r = ent.mesh.userData.l3b.ranges[ent.ri], x0 = p.getX(r.start);
    l3bmStart();
    const side = document.getElementById('v3Side'); side.querySelector('[data-bm="dx"]').value = '5'; l3bmApplyFields(side);
    l3bmAccept();
    window.__up = null;
    const orig = askOpener;
    askOpener = async (type, extra, t, pr) => { if (type === 'tcUpload') { const f = extra.files[0]; window.__up = { name: f.name, folderId: extra.folderId, text: await f.text() }; return { uploaded: 1, folder: 'Etablering' }; } return orig(type, extra, t, pr); };
    return { moved: p.getX(r.start) - x0, pending: l3bmPending('f:F2'), btn: !!document.querySelector('#v3Side [data-bmsave]') };
  });
  if (Math.abs(mv.moved - 5) > 1e-3 || mv.pending !== 1 || !mv.btn) fail('Flytta IFC-objekt: ' + JSON.stringify(mv));
  await page.click('#v3Side [data-bmsave]');
  await page.waitForFunction(() => window.__up, null, { timeout: 30000 });
  const sv = await page.evaluate(async ifc0 => {
    const up = window.__up, api = await ifcmLoad();
    const centers = text => {
    const id = api.OpenModel(new TextEncoder().encode(text), { COORDINATE_TO_ORIGIN: false });
    const cx = {};
    api.StreamAllMeshes(id, mesh => {
      const g = api.GetLine(id, mesh.expressID).GlobalId.value; let sx = 0, n = 0;
      for (let i = 0; i < mesh.geometries.size(); i++) { const pg = mesh.geometries.get(i), geom = api.GetGeometry(id, pg.geometryExpressID), v = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize()), T = pg.flatTransformation;
        for (let k = 0; k < v.length; k += 6) { sx += T[0] * v[k] + T[4] * v[k + 1] + T[8] * v[k + 2] + T[12]; n++; } }
      cx[g] = sx / n;
    });
    api.CloseModel(id);
    return cx; };
    const a = centers(ifc0), b = centers(up.text);
    return { name: up.name, folderId: up.folderId, pelare: b['1hZq3$Bq9Fxu8nZK0bW1aA'] - a['1hZq3$Bq9Fxu8nZK0bW1aA'], vagg: b['3vB2YO$MX4xv5uCqZZG05x'] - a['3vB2YO$MX4xv5uCqZZG05x'], pending: l3bmPending('f:F2') };
  }, ifc);
  if (!/^Hus A flyttad \d{4}-\d\d-\d\d kl \d\d\.\d\d\.\d\d\.ifc$/.test(sv.name) || sv.folderId !== 'f1' || Math.abs(sv.pelare - 5) > 0.001 || Math.abs(sv.vagg) > 0.001 || sv.pending !== 0)
    fail('Spara som ny IFC: ny fil i samma mapp, pelaren 5 m längre bort, väggen orörd: ' + JSON.stringify(sv));

  // Exportera markerade som ny IFC: bara pelaren, med flytten inräknad (Victor 2026-10-10).
  await page.evaluate(() => { window.__up = null; l3RenderSide(); });
  await page.click('#v3BsExport');
  await page.waitForFunction(() => window.__up, null, { timeout: 30000 });
  const ex = await page.evaluate(async ifc0 => {
    const up = window.__up, api = await ifcmLoad();
    const centers = text => { const id = api.OpenModel(new TextEncoder().encode(text), { COORDINATE_TO_ORIGIN: false }); const cx = {};
      api.StreamAllMeshes(id, mesh => { const g = api.GetLine(id, mesh.expressID).GlobalId.value; let sx = 0, n = 0;
        for (let i = 0; i < mesh.geometries.size(); i++) { const pg = mesh.geometries.get(i), geom = api.GetGeometry(id, pg.geometryExpressID), v = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize()), T = pg.flatTransformation;
          for (let k = 0; k < v.length; k += 6) { sx += T[0] * v[k] + T[4] * v[k + 1] + T[8] * v[k + 2] + T[12]; n++; } }
        cx[g] = sx / n; });
      api.CloseModel(id); return cx; };
    const a = centers(ifc0), b = centers(up.text);
    return { name: up.name, folderId: up.folderId, guids: Object.keys(b), pelare: b['1hZq3$Bq9Fxu8nZK0bW1aA'] - a['1hZq3$Bq9Fxu8nZK0bW1aA'] };
  }, ifc);
  if (!/^Hus A urval 1 objekt \d{4}-\d\d-\d\d kl \d\d\.\d\d\.\d\d\.ifc$/.test(ex.name) || ex.folderId !== 'f1' || ex.guids.length !== 1 || Math.abs(ex.pelare - 5) > 0.001)
    fail('Exportera markerade: bara pelaren, flyttad 5 m, ny fil i samma mapp: ' + JSON.stringify(ex));

  // Exportera markerade tillsammans med en etableringspelare: EN IFC-fil med båda (Victor 2026-10-13).
  await page.evaluate(() => { window.__up = null; l3RenderSide(); });
  const gr = await page.evaluate(async () => {
    const doc = ifcDoc('Test', 'Etablering'), E = doc.E, pts = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 3], [1, 0, 3], [1, 1, 3], [0, 1, 3]];
    const pl = E(`IFCCARTESIANPOINTLIST3D((${pts.map(ifcPt).join(',')}))`), faces = [[1, 3, 2], [1, 4, 3], [5, 6, 7], [5, 7, 8], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 4, 8], [3, 8, 7], [4, 1, 5], [4, 5, 8]];
    const mesh = E(`IFCTRIANGULATEDFACESET(${pl},$,.T.,(${faces.map(f => `(${f.join(',')})`).join(',')}),$)`);
    const el = E(`IFCBUILDINGELEMENTPROXY('3GRAFTxxxxxxxxxxxxxxxx',$,'Egen låda 3','Placerad','Container',${doc.place([6512330, 150120, 5])},${doc.shape(mesh, 'Tessellation')},'x',.NOTDEFINED.)`);
    const text = doc.finish([el], 'Etablering.ifc');
    const m = l3b.models.find(x => x.id === 'f:F2'); let ent = null; m.meshes.forEach(mesh => mesh.userData.l3b.ranges.forEach((r, ri) => { if (r.guid === '1hZq3$Bq9Fxu8nZK0bW1aA') ent = { mesh, ri }; }));
    l3SelectIds([]); l3bsSet([ent]);
    const r = await l3bsExportIfc({ graft: text });
    return { merged: r.merged || 0, why: r.graftWhy || null, name: r[0] && r[0].name };
  });
  if (gr.merged) {
    await page.waitForFunction(() => window.__up, null, { timeout: 30000 });
    const mg = await page.evaluate(async () => { const t = window.__up.text, P = ifcParse(t), ids = new Set(P.ids); let bad = 0; P.ids.forEach((id, k) => ifcRefs(t.slice(P.starts[k], P.ends[k])).forEach(r => { if (!ids.has(r)) bad++; })); return { name: window.__up.name, bad, dup: P.ids.length - ids.size, hasPelare: t.includes("1hZq3$Bq9Fxu8nZK0bW1aA"), hasGraft: t.includes('3GRAFTxxxxxxxxxxxxxxxx') }; });
    if (!/urval 1 objekt \+ 1 etablering/.test(mg.name) || mg.bad || mg.dup || !mg.hasPelare || !mg.hasGraft) fail('En fil med IFC-objekt + etablering: ' + JSON.stringify(mg));
    console.log('OK: exporterade markerade – IFC-objekt och etablering i EN ny IFC-fil (inga trasiga referenser)');
  } else console.log('OK (reserv): testfilen går inte att utöka (' + gr.why + ') – etableringen sparas då som egen fil');

  // Kopiera (Victor 2026-10-12): kopian 3 m i Y, originalet kvar; sparas som ny fil med kopian som nytt objekt
  // i samma våning. Ctrl+Z tar bort kopian.
  const cp = await page.evaluate(() => {
    const m = l3b.models.find(x => x.id === 'f:F2');
    let ent = null; m.meshes.forEach(mesh => mesh.userData.l3b.ranges.forEach((r, ri) => { if (r.guid === '1hZq3$Bq9Fxu8nZK0bW1aA') ent = { mesh, ri }; }));
    l3bsSet([ent]); l3RenderSide();
    document.getElementById('v3BsCopy').click();
    const hidden = ent.mesh.userData.l3b.hidden.has(ent.ri);
    const side = document.getElementById('v3Side'); side.querySelector('[data-bm="dy"]').value = '3'; l3bmApplyFields(side);
    l3bmAccept();
    const sel = l3bs.sel.map(e => e.mesh.userData.l3b.ranges[e.ri]);
    window.__up = null;
    return { hidden, meshes: m.meshes.length, sel: sel.map(r => ({ guid: r.guid, copyOf: r.copyOf })), pending: l3bmPending('f:F2') };
  });
  if (cp.hidden || cp.sel.length !== 1 || cp.sel[0].copyOf !== '1hZq3$Bq9Fxu8nZK0bW1aA' || !/^[0-9A-Za-z_$]{22}$/.test(cp.sel[0].guid) || cp.pending !== 2) fail('Kopiera: ' + JSON.stringify(cp));
  await page.click('#v3Side [data-bmsave]');
  await page.waitForFunction(() => window.__up, null, { timeout: 30000 });
  const cs = await page.evaluate(async ([ifc0, ng]) => {
    const up = window.__up, api = await ifcmLoad();
    const centers = text => { const id = api.OpenModel(new TextEncoder().encode(text), { COORDINATE_TO_ORIGIN: false }); const cx = {};
      api.StreamAllMeshes(id, mesh => { const g = api.GetLine(id, mesh.expressID).GlobalId.value; let sx = 0, sy = 0, n = 0;
        for (let i = 0; i < mesh.geometries.size(); i++) { const pg = mesh.geometries.get(i), geom = api.GetGeometry(id, pg.geometryExpressID), v = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize()), T = pg.flatTransformation;
          for (let k = 0; k < v.length; k += 6) { sx += T[0] * v[k] + T[4] * v[k + 1] + T[8] * v[k + 2] + T[12]; sy += T[1] * v[k] + T[5] * v[k + 1] + T[9] * v[k + 2] + T[13]; n++; } }
        cx[g] = [sx / n, sy / n]; });
      api.CloseModel(id); return cx; };
    const a = centers(ifc0), b = centers(up.text), P = '1hZq3$Bq9Fxu8nZK0bW1aA';
    const contained = new RegExp(`IFCRELCONTAINEDINSPATIALSTRUCTURE\\([^;]*#${(new RegExp(`#(\\d+)=IFC[A-Z]+\\('${ng.replace(/\$/g, '\\$')}'`).exec(up.text) || [])[1]}[,)]`).test(up.text);
    // Placeringarna i filen (web-ifc ger delad form samma läge, därför räknas kedjan här).
    const ix = l3bmIndex(up.text), at = g => { let id = null; ix.starts.forEach((st, k) => { if (up.text.slice(st, st + 80).includes(`'${g}'`)) id = k; }); return new THREE.Vector3().setFromMatrixPosition(l3bmWorld(ix, l3bmRef(l3bmArgs(ix.line(id))[5]))); };
    const po = at(P), pc = at(ng), p0 = new THREE.Vector3(6512350, 150125, 0);
    const r = { name: up.name, opens: !!(b[P] && b[ng]), orig: [po.x - p0.x, po.y - p0.y], copy: [pc.x - p0.x, pc.y - p0.y], contained };
    l3Undo();
    const m = l3b.models.find(x => x.id === 'f:F2');
    r.afterUndo = { pending: l3bmPending('f:F2'), has: m.meshes.some(x => x.userData.l3b.ranges.some(q => q.guid === ng)) };
    return r;
  }, [ifc, cp.sel[0].guid]);
  if (!cs.opens || Math.abs(cs.orig[0] - 5) > 0.001 || Math.abs(cs.orig[1]) > 0.001 || Math.abs(cs.copy[0] - 5) > 0.001 || Math.abs(cs.copy[1] - 3) > 0.001 || !cs.contained || cs.afterUndo.has || cs.afterUndo.pending !== 1)
    fail('Kopiera sparas som ny IFC (kopian 3 m från den flyttade pelaren, i våningen) och Ctrl+Z tar bort kopian: ' + JSON.stringify(cs));
  // Delete raderar markerade kopior (Victor 2026-10-12); originalet står kvar, Ctrl+Z tar tillbaka kopian.
  const dl = await page.evaluate(() => {
    const m = l3b.models.find(x => x.id === 'f:F2');
    let ent = null; m.meshes.forEach(mesh => mesh.userData.l3b.ranges.forEach((r, ri) => { if (r.guid === '1hZq3$Bq9Fxu8nZK0bW1aA') ent = { mesh, ri }; }));
    l3bsSet([ent]); l3bmStart({ copy: true });
    const side = document.getElementById('v3Side'); side.querySelector('[data-bm="dy"]').value = '4'; l3bmApplyFields(side); l3bmAccept();
    const ng = l3bs.sel[0].mesh.userData.l3b.ranges[l3bs.sel[0].ri].guid, p0 = l3bmPending('f:F2');
    const btn = !!document.getElementById('v3BsDel');
    const has = () => m.meshes.some(x => x.userData.l3b.ranges.some(q => q.guid === ng));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    const r = { btn, p0, gone: !has(), p1: l3bmPending('f:F2'), orig: m.meshes.some(x => x.userData.l3b.ranges.some(q => q.guid === '1hZq3$Bq9Fxu8nZK0bW1aA')) };
    l3Undo(); r.back = has(); r.p2 = l3bmPending('f:F2');
    // Originalet kan inte raderas.
    l3bsSet([ent]); r.origDel = l3bmCopyDelete(); r.origKept = m.meshes.includes(ent.mesh);
    return r;
  });
  if (!dl.btn || dl.p0 !== 2 || !dl.gone || dl.p1 !== 1 || !dl.orig || !dl.back || dl.p2 !== 2 || dl.origDel !== false || !dl.origKept) fail('Radera kopior med Delete: ' + JSON.stringify(dl));

  // Zooma till modell i lagerhanteraren.
  const zm = await page.evaluate(() => { l3PalTab('layers'); l3SetPref('laySort', 'list'); l3LayersRender(); const b = document.querySelector('[data-l3l-zoom="f:F2"]'); if (!b) return null; const t0 = l3.orbit.target.clone(); b.click(); return true; });
  await page.waitForTimeout(700);
  const zm2 = await page.evaluate(() => { const m = l3b.models.find(x => x.id === 'f:F2'), bx = new THREE.Box3(); m.meshes.forEach(x => bx.union(x.geometry.boundingBox.clone().applyMatrix4(x.matrixWorld))); return l3.orbit.target.distanceTo(bx.getCenter(new THREE.Vector3())); });
  if (!zm || zm2 > 0.5) fail('Zooma till modell: ' + JSON.stringify({ zm, zm2 }));

  // Statusradens historik (F2) och MB vid hämtning.
  const lg = await page.evaluate(() => { l3Status('Testrad A'); l3Status('Testrad B', true); l3StatusLive('Hämtar 1,0 MB'); l3LogToggle(true); const box = document.getElementById('v3Log'); return { open: !box.classList.contains('hidden'), a: /Testrad A/.test(box.textContent), b: !!box.querySelector('.v3-log-r.bad'), live: /Hämtar 1,0 MB/.test(box.textContent), mb: l3bMb(115 * 1048576) }; });
  await page.keyboard.press('F2'); await page.waitForTimeout(100);
  if (!lg.open || !lg.a || !lg.b || lg.live || lg.mb !== '115' || !(await page.isHidden('#v3Log'))) fail('Historik i statusraden: ' + JSON.stringify(lg));
  const hist = await page.evaluate(() => l3Log.map(x => x.text).join(' | '));
  if (!/Hämtade Hus A\.ifc: [\d,]+ MB på/.test(hist)) fail('Historiken ska visa hämtade MB: ' + hist);

  // Esc stänger rutan.
  await page.evaluate(() => l3PalTab('add'));
  await page.click('#v3GetModel'); await page.waitForTimeout(150);
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  if (!(await page.isHidden('#v3Models'))) fail('Esc ska stänga Hämta modell');
  // Snabbsök (Ctrl+K) har kommandot.
  if (!(await page.evaluate(() => l3Commands().some(c => /Hämta modell/.test(c.label))))) fail('Snabbsök ska ha Hämta modell');

  // Samma modell två gånger (annat id, samma namn) läses inte in – dubbla ytor flimrar.
  const dup = await page.evaluate(async () => { const m = l3b.models.find(x => x.visible && x.name); if (!m) return { skip: true }; const n0 = l3b.models.length; await l3bLoad([{ id: 'dubblett', fileId: 'X9', name: m.name.toUpperCase(), version: 'v1' }]); return { n0, n1: l3b.models.length }; });
  if (!dup.skip && dup.n1 !== dup.n0) fail('Samma modell ska inte läsas in två gånger: ' + JSON.stringify(dup));
  if (process.env.SHOT) {
    await page.evaluate(() => { l3PalTab('layers'); l3SetPref('laySort', 'tree'); l3LayersRender(); l3SelectIds([placements[0].id]); });
    await page.waitForTimeout(300); await page.screenshot({ path: process.env.SHOT });
  }
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3dmodels');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
