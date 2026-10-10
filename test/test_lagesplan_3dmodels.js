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
    if (req.method() === 'GET' && e && /raw/.test(req.headers()['accept'] || '')) return r.fulfill({ status: 200, contentType: 'application/octet-stream', body: e.content }); // som GitHub: rå fil
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    const body = JSON.parse(req.postData()); if (e && body.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' });
    const sha = 's' + (++n); store.set(f, { content: Buffer.from(body.content, 'base64').toString(), sha });
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

  // Lager: ritningen som mark, etableringen per typ och projektets modeller i mappar.
  await page.click('[data-paltab="layers"]');
  await page.waitForSelector('#v3PalLayers [data-l3l="plan"]');
  const plan0 = await page.evaluate(() => l3Prefs().plan);
  await page.click('#v3PalLayers [data-l3l="plan"]');
  const st = await page.evaluate(() => [l3Prefs().plan, l3.planMesh ? l3.planMesh.visible : null]);
  if (st[0] !== !plan0 || (st[1] !== null && st[1] !== !plan0)) fail('Ritningen ska tändas/släckas i Lager: ' + st);
  const typeBtn = '#v3PalLayers [data-l3l-type^="model:"]';
  await page.click(typeBtn);
  if (await page.evaluate(() => l3.placeMeshes.get(placements[0].id).visible)) fail('Typen ska kunna släckas i Lager');
  await page.click(typeBtn);
  if (!(await page.evaluate(() => l3.placeMeshes.get(placements[0].id).visible))) fail('Typen ska kunna tändas igen');
  // Fliken Trimble Connect mapp (Hämtade 3D-modeller är förvald).
  await page.click('#v3PalLayers [data-l3l-sort="tree"]');
  await page.waitForSelector('#v3PalLayers [data-l3l-dir="f1"]', { timeout: 5000 });
  await page.click('#v3PalLayers [data-l3l-dir="f1"]');
  await page.waitForSelector('#v3PalLayers [data-l3l-file="F2"]', { timeout: 5000 });
  if (await page.$('#v3PalLayers [data-l3l-file="F1"]')) fail('Lager ska bara visa IFC-filer');
  await page.click('#v3PalLayers [data-l3l-file="F2"]');
  await page.waitForFunction(() => l3b.models.some(m => m.id === 'f:F2' && m.visible), null, { timeout: 30000 });
  await page.waitForTimeout(200);
  if (!(await page.evaluate(() => document.querySelector('#v3PalLayers [data-l3l-file="F2"]').classList.contains('on')))) fail('Ögat ska visa att modellen är tänd');
  // Normalerna kommer färdiga från tråden (Int8) och pekar som ytorna; färgerna är modellens egna.
  const nq = await page.evaluate(() => { let ok = 0, bad = 0, int8 = true; l3b.models.find(m => m.id === 'f:F2').meshes.forEach(x => { const g = x.geometry, P = g.getAttribute('position'), N = g.getAttribute('normal'), I = g.index.array; int8 = int8 && N.array instanceof Int8Array; for (let t = 0; t < I.length; t += 3) { const a = new THREE.Vector3().fromBufferAttribute(P, I[t]), b = new THREE.Vector3().fromBufferAttribute(P, I[t + 1]), c = new THREE.Vector3().fromBufferAttribute(P, I[t + 2]); const f = b.sub(a).cross(c.sub(a)).normalize(), n = new THREE.Vector3().fromBufferAttribute(N, I[t]).normalize(); if (f.dot(n) > 0.95) ok++; else bad++; } }); return { ok, bad, int8 }; });
  if (!nq.int8 || nq.bad || !nq.ok) fail('Normalerna från tråden: ' + JSON.stringify(nq));
  if (process.env.SHOTL) { await page.evaluate(() => { const b = new THREE.Box3(); l3b.models.forEach(m => m.meshes.forEach(x => b.expandByObject(x))); const c = b.getCenter(new THREE.Vector3()); l3StopFly(); l3.orbit.target.copy(c); l3.camera.position.copy(c).add(new THREE.Vector3(-22, -30, 18)); l3.orbit.update(); l3Render(); }); await page.waitForTimeout(400); await page.screenshot({ path: process.env.SHOTL }); }
  await page.click('#v3PalLayers [data-l3l-file="F2"]');
  if (await page.evaluate(() => l3b.models.find(m => m.id === 'f:F2').visible)) fail('Ögat ska släcka modellen');
  await page.click('#v3PalLayers [data-l3l-sort="list"]');
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
