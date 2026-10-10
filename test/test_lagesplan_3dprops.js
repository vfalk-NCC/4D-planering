// Egenskaper i inlästa IFC-modeller (Victor 2026-10-10: "Jag ska få mycket mer info än detta också, samt
// att jag ska kunna sortera på alla olika UDA som objektet har på något snyggt sätt, kanske i en
// collapsible högermeny"): högerpanelen visar attribut, våning, typ, material, Psets (UDA) och mängder,
// hopfällbara och sökbara; fliken Egenskaper grupperar alla objekt efter en egenskap, markerar och färgar.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9001;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;

// Tre objekt på en våning: två balkar (UDA Fas = 1 och 2, Tekla-stil) och en pelare med typ och material.
function box(n, x, guid, name, cls) {
  const b = n * 10;
  return [`#${b}=IFCCARTESIANPOINT((${x}.,150125.,0.));`, `#${b + 1}=IFCAXIS2PLACEMENT3D(#${b},$,$);`, `#${b + 2}=IFCLOCALPLACEMENT(#7,#${b + 1});`,
    `#${b + 3}=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,2.,2.);`, `#${b + 4}=IFCEXTRUDEDAREASOLID(#${b + 3},#2,#12,3.);`, `#${b + 5}=IFCSHAPEREPRESENTATION(#3,'Body','SweptSolid',(#${b + 4}));`, `#${b + 6}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${b + 5}));`,
    `#${b + 7}=${cls}('${guid}',$,'${name}','Beskr ${name}','Objtyp',#${b + 2},#${b + 6},'TAG-${n}',$);`];
}
const IFC = ["ISO-10303-21;", "HEADER;", "FILE_DESCRIPTION((''),'2;1');", "FILE_NAME('p.ifc','',(''),(''),'','','');", "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;",
  "#1=IFCCARTESIANPOINT((0.,0.,0.));", "#2=IFCAXIS2PLACEMENT3D(#1,$,$);", "#3=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#2,$);",
  "#4=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);", "#5=IFCUNITASSIGNMENT((#4,#8));", "#6=IFCPROJECT('2O2Fr$t4X7Zf8NOew3FLOH',$,'B',$,$,$,$,(#3),#5);",
  "#7=IFCLOCALPLACEMENT($,#2);", "#8=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);", "#12=IFCDIRECTION((0.,0.,1.));",
  "#13=IFCSITE('2O2Fr$t4X7Zf8NOew3FLOI',$,'Tomten',$,$,#7,$,$,.ELEMENT.,$,$,$,$,$);",
  "#14=IFCBUILDING('2O2Fr$t4X7Zf8NOew3FLOK',$,'Hus A',$,$,#7,$,$,.ELEMENT.,$,$,$);",
  "#15=IFCBUILDINGSTOREY('2O2Fr$t4X7Zf8NOew3FLOM',$,'Plan 2',$,$,#7,$,$,.ELEMENT.,3.);",
  "#16=IFCRELAGGREGATES('2O2Fr$t4X7Zf8NOew3FLOJ',$,$,$,#6,(#13));", "#17=IFCRELAGGREGATES('2O2Fr$t4X7Zf8NOew3FLON',$,$,$,#13,(#14));", "#18=IFCRELAGGREGATES('2O2Fr$t4X7Zf8NOew3FLOO',$,$,$,#14,(#15));",
  ...box(3, 6512350, '1hZq3$Bq9Fxu8nZK0bW1aA', 'Balk B1', 'IFCBEAM'),
  ...box(4, 6512360, '1hZq3$Bq9Fxu8nZK0bW1aB', 'Balk B2', 'IFCBEAM'),
  ...box(5, 6512370, '1hZq3$Bq9Fxu8nZK0bW1aC', 'Pelare K\\X2\\00E5\\X0\\', 'IFCCOLUMN'),
  "#60=IFCRELCONTAINEDINSPATIALSTRUCTURE('2O2Fr$t4X7Zf8NOew3FLOL',$,$,$,(#37,#47,#57),#15);",
  // UDA (Tekla: egna egenskaper i en egen grupp), en gemensam grupp och mängder.
  "#61=IFCPROPERTYSINGLEVALUE('Fas',$,IFCLABEL('1'),$);", "#62=IFCPROPERTYSINGLEVALUE('Leverant\\X2\\00F6\\X0\\r',$,IFCLABEL('Stålbolaget'),$);",
  "#63=IFCPROPERTYSET('3pZq3$Bq9Fxu8nZK0bW1aA',$,'UDA',$,(#61,#62));", "#64=IFCRELDEFINESBYPROPERTIES('3pZq3$Bq9Fxu8nZK0bW1aB',$,$,$,(#37),#63);",
  "#65=IFCPROPERTYSINGLEVALUE('Fas',$,IFCLABEL('2'),$);", "#66=IFCPROPERTYSET('3pZq3$Bq9Fxu8nZK0bW1aC',$,'UDA',$,(#65));",
  "#67=IFCRELDEFINESBYPROPERTIES('3pZq3$Bq9Fxu8nZK0bW1aD',$,$,$,(#47,#57),#66);",
  "#68=IFCPROPERTYSINGLEVALUE('LoadBearing',$,IFCBOOLEAN(.T.),$);", "#69=IFCPROPERTYSINGLEVALUE('Length',$,IFCLENGTHMEASURE(6000.5),$);",
  "#70=IFCPROPERTYSET('3pZq3$Bq9Fxu8nZK0bW1aE',$,'Pset_BeamCommon',$,(#68,#69));", "#71=IFCRELDEFINESBYPROPERTIES('3pZq3$Bq9Fxu8nZK0bW1aF',$,$,$,(#37,#47),#70);",
  "#72=IFCQUANTITYVOLUME('NetVolume',$,$,1.25,$);", "#73=IFCELEMENTQUANTITY('3pZq3$Bq9Fxu8nZK0bW1aG',$,'Qto_BeamBaseQuantities',$,$,(#72));",
  "#74=IFCRELDEFINESBYPROPERTIES('3pZq3$Bq9Fxu8nZK0bW1aH',$,$,$,(#37),#73);",
  // Typ med egen egenskapsgrupp, och material (skiktuppbyggnad).
  "#75=IFCPROPERTYSINGLEVALUE('Brandklass',$,IFCLABEL('R60'),$);", "#76=IFCPROPERTYSET('3pZq3$Bq9Fxu8nZK0bW1aI',$,'Typdata',$,(#75));",
  "#77=IFCCOLUMNTYPE('3pZq3$Bq9Fxu8nZK0bW1aJ',$,'HEA200',$,$,(#76),$,$,$,.COLUMN.);", "#78=IFCRELDEFINESBYTYPE('3pZq3$Bq9Fxu8nZK0bW1aK',$,$,$,(#57),#77);",
  "#79=IFCMATERIAL('S355',$,$);", "#80=IFCMATERIALLAYER(#79,0.2,$,$,$,$,$);", "#81=IFCMATERIALLAYERSET((#80),'Stål',$);", "#82=IFCMATERIALLAYERSETUSAGE(#81,.AXIS2.,.POSITIVE.,0.,$);",
  "#83=IFCRELASSOCIATESMATERIAL('3pZq3$Bq9Fxu8nZK0bW1aL',$,$,$,(#57),#82);",
  "ENDSEC;", "END-ISO-10303-21;"].join("\n");

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
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    window.__fetch = 0;
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    // UTF-8 rakt i filen ("Stålbolaget") – som en del program skriver.
    askOpener = async (type, extra) => { if (type === 'tcFile') { window.__fetch++; return { bytes: new TextEncoder().encode(ifc).buffer }; } return {}; };
  }, IFC);
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  await page.evaluate(() => l3bLoad([{ id: 'f:P1', fileId: 'P1', name: 'Stål.ifc', version: 'v1', parentId: 'f1' }]));
  await page.waitForFunction(() => l3b.models.length === 1, null, { timeout: 30000 });

  // Markera pelaren: hela infon i högerpanelen.
  await page.evaluate(() => { const m = l3b.models[0]; let e = null; m.meshes.forEach(mesh => mesh.userData.l3b.ranges.forEach((r, ri) => { if (r.guid === '1hZq3$Bq9Fxu8nZK0bW1aC') e = { mesh, ri }; })); l3bsSet([e]); });
  await page.waitForSelector('#v3BsProps details.v3-ps', { timeout: 15000 });
  const pel = await page.evaluate(() => {
    const secs = [...document.querySelectorAll('#v3BsProps details.v3-ps')].map(d => [d.querySelector('summary span').textContent, [...d.querySelectorAll('tr')].map(tr => [...tr.children].slice(0, 2).map(td => td.textContent).join('='))]);
    return { secs: Object.fromEntries(secs), fetched: window.__fetch };
  });
  const S = pel.secs;
  if (!S['Objekt'] || !S['Objekt'].includes('IFC-klass=IFCCOLUMN') || !S['Objekt'].includes('Namn=Pelare Kå') || !S['Objekt'].includes('Tag=TAG-5') || !S['Objekt'].includes('Beskrivning=Beskr Pelare Kå')) fail('Objekt: ' + JSON.stringify(pel));
  if (!S['Plats i byggnaden'] || S['Plats i byggnaden'].join('|') !== 'Våning=Plan 2|Byggnad=Hus A|Plats=Tomten') fail('Plats: ' + JSON.stringify(S['Plats i byggnaden']));
  if (!S['Typ och material'] || !S['Typ och material'].includes('Typ=HEA200') || !S['Typ och material'].some(x => /^Material=S355 \(0,2 m\)$/.test(x))) fail('Typ och material: ' + JSON.stringify(S['Typ och material']));
  if (!S['UDA'] || S['UDA'].join('|') !== 'Fas=2') fail('UDA: ' + JSON.stringify(S['UDA']));
  if (!S['Typdata · från typen'] || S['Typdata · från typen'][0] !== 'Brandklass=R60') fail('Typens egenskaper: ' + JSON.stringify(pel));
  if (pel.fetched !== 1) fail('Originalet ska inte hämtas igen från TC (sparat vid inläsningen): ' + pel.fetched);

  // Balken: Pset, mängder med enhet, boolesk, längd med enhet, UTF-8.
  await page.evaluate(() => { const m = l3b.models[0]; let e = null; m.meshes.forEach(mesh => mesh.userData.l3b.ranges.forEach((r, ri) => { if (r.guid === '1hZq3$Bq9Fxu8nZK0bW1aA') e = { mesh, ri }; })); l3bsSet([e]); });
  await page.waitForFunction(() => /Pset_BeamCommon/.test((document.querySelector('#v3BsProps') || {}).textContent || ''), null, { timeout: 15000 });
  const balk = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#v3BsProps details.v3-ps')].map(d => [d.querySelector('summary span').textContent, [...d.querySelectorAll('tr')].map(tr => [...tr.children].slice(0, 2).map(td => td.textContent).join('='))])));
  if (balk['UDA'].join('|') !== 'Fas=1|Leverantör=Stålbolaget' || balk['Pset_BeamCommon'].join('|') !== 'LoadBearing=Ja|Length=6000,5 m' || balk['Qto_BeamBaseQuantities'].join('|') !== 'NetVolume=1,25 m³')
    fail('Balkens egenskaper: ' + JSON.stringify(balk));
  // Sök filtrerar; hopfällning sparas.
  await page.fill('#v3BsProps .v3-psearch', 'leverant');
  const vis = await page.evaluate(() => [...document.querySelectorAll('#v3BsProps details.v3-ps')].filter(d => d.style.display !== 'none').map(d => d.dataset.sec + ':' + [...d.querySelectorAll('tr')].filter(t => t.style.display !== 'none').length));
  if (vis.join('|') !== 'p:UDA:1') fail('Sök ska bara visa Leverantör: ' + vis);
  await page.fill('#v3BsProps .v3-psearch', '');
  await page.click('#v3BsProps details[data-sec="Objekt"] > summary'); await page.waitForTimeout(100);
  if (!(await page.evaluate(() => (l3Prefs().propsClosed || []).includes('Objekt')))) fail('Hopfälld grupp ska sparas');

  // Gruppera efter UDA Fas: två värden, markera, färga.
  await page.$eval('#v3BsProps tr[data-q^="fas"] [data-pgroup]', b => b.click());
  await page.waitForSelector('#v3PalProps .v3-pp-v', { timeout: 15000 });
  const vals = await page.$$eval('#v3PalProps .v3-pp-v', b => b.map(x => x.querySelector('span').textContent + '=' + x.querySelector('em').textContent));
  if (vals.join('|') !== '2=2|1=1') fail('Grupperingen efter Fas: ' + vals);
  await page.click('#v3PalProps .v3-pp-v[data-pv="0"]');
  const sel = await page.evaluate(() => l3bs.sel.map(e => e.mesh.userData.l3b.ranges[e.ri].guid).sort().join(','));
  if (sel !== '1hZq3$Bq9Fxu8nZK0bW1aB,1hZq3$Bq9Fxu8nZK0bW1aC') fail('Värdet 2 ska markera B2 och pelaren: ' + sel);
  await page.click('#v3PpColor');
  const col = await page.evaluate(() => {
    const out = {};
    l3b.models[0].meshes.forEach(mesh => { const c = mesh.geometry.getAttribute('color'); mesh.userData.l3b.ranges.forEach(r => { out[r.name] = [c.getX(r.start), c.getY(r.start), c.getZ(r.start)].map(v => v.toFixed(2)).join(','); }); });
    return out;
  });
  if (col['Balk B2'] !== col['Pelare Kå'] || col['Balk B1'] === col['Balk B2']) fail('Färga efter värde: samma värde samma färg: ' + JSON.stringify(col));
  await page.click('#v3PpColor');
  const col2 = await page.evaluate(() => { const mesh = l3b.models[0].meshes[0], c = mesh.geometry.getAttribute('color'), r = mesh.userData.l3b.ranges[0]; return [c.getX(r.start), r.base[0]]; });
  if (Math.abs(col2[0] - col2[1]) > 1e-6) fail('Sluta färga ska återställa färgerna: ' + col2);

  // Alla egenskaper i fliken: Allmänt (attribut) och grupperna med antal.
  await page.click('#v3PpBack');
  await page.waitForSelector('#v3PalProps [data-pkey]');
  const keys = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#v3PalProps details.v3-ps')].map(d => [d.querySelector('summary span').textContent, [...d.querySelectorAll('[data-pkey]')].map(b => b.querySelector('span').textContent + '=' + b.querySelector('em').textContent)])));
  if (!keys['Allmänt'] || !keys['Allmänt'].includes('Våning=3') || keys['UDA'].join('|') !== 'Fas=3|Leverantör=1' || keys['Typdata'].join('|') !== 'Brandklass=1') fail('Egenskapslistan: ' + JSON.stringify(keys));
  await page.click('#v3PalProps [data-pkey="a:storey"]');
  await page.waitForSelector('#v3PalProps .v3-pp-v');
  const st = await page.$$eval('#v3PalProps .v3-pp-v', b => b.map(x => x.querySelector('span').textContent + '=' + x.querySelector('em').textContent));
  if (st.join('|') !== 'Plan 2=3') fail('Gruppera efter våning: ' + st);
  await page.click('#v3PpBack');
  await page.fill('#v3PalProps .v3-pp-q', 'brand');
  const filt = await page.$$eval('#v3PalProps [data-pkey]', b => b.map(x => x.dataset.pkey));
  if (filt.length !== 1 || !/Brandklass/.test(filt[0])) fail('Sök bland egenskaperna: ' + filt);

  // Ny sida (modellen ur cachen): originalet finns kvar i webbläsaren – ingen hämtning från TC.
  const again = await page.evaluate(async () => { l3p.mem.clear(); [...l3p.w.values()].forEach(s => s.wk && s.wk.terminate()); l3p.w.clear(); const n0 = window.__fetch; const d = await l3pProps(l3b.models[0], '1hZq3$Bq9Fxu8nZK0bW1aB', { local: true }); return { fas: d && d.psets.find(p => p.n === 'UDA').p[0][1], fetched: window.__fetch - n0 }; });
  if (again.fas !== '2' || again.fetched) fail('Originalet ska läsas ur webbläsarens lagring: ' + JSON.stringify(again));

  // Många markerade: ett överlägg per bit, inte ett per objekt.
  const ov = await page.evaluate(() => { const ents = []; l3b.models[0].meshes.forEach(mesh => mesh.userData.l3b.ranges.forEach((r, ri) => ents.push({ mesh, ri }))); l3bsSet(ents); return { sel: l3bs.sel.length, ov: l3bs.ov.length, meshes: l3b.models[0].meshes.length }; });
  if (ov.sel !== 3 || ov.ov > ov.meshes * 2) fail('Överläggen per bit: ' + JSON.stringify(ov));

  // Kompakt panel: verktygsrad med små knappar, handtag i hörnet ändrar bredd och höjd.
  await page.evaluate(() => { const m = l3b.models[0]; let e = null; m.meshes.forEach(mesh => mesh.userData.l3b.ranges.forEach((r, ri) => { if (r.guid === '1hZq3$Bq9Fxu8nZK0bW1aA') e = { mesh, ri }; })); l3bsSet([e]); });
  await page.waitForSelector('#v3Side .v3-acts .v3-act');
  const actH = await page.$eval('#v3BsZoom', b => b.getBoundingClientRect().height);
  if (actH > 28) fail('Knapparna ska vara kompakta: ' + actH);
  const rc = await page.locator('#view3d .v3-rc').boundingBox();
  const sz0 = await page.evaluate(() => { const r = document.getElementById('v3Side').getBoundingClientRect(); return [r.width, r.height]; });
  await page.mouse.move(rc.x + 6, rc.y + 6); await page.mouse.down(); await page.mouse.move(rc.x - 74, rc.y - 34, { steps: 4 }); await page.mouse.up();
  const sz1 = await page.evaluate(() => { const r = document.getElementById('v3Side').getBoundingClientRect(); return { w: r.width, h: r.height, pw: l3Prefs().sideW, ph: l3Prefs().sideH }; });
  const rc1 = await page.locator('#view3d .v3-rc').boundingBox(), sb = await page.evaluate(() => { const r = document.getElementById('v3Side').getBoundingClientRect(); return [r.left, r.bottom]; });
  if (Math.abs(rc1.x - sb[0]) > 1 || Math.abs(rc1.y + rc1.height - sb[1]) > 1) fail('Handtaget ska sitta i panelens nedre vänstra hörn: ' + JSON.stringify({ rc1, sb }));
  if (Math.abs(sz1.w - sz0[0] - 80) > 3 || Math.abs(sz1.h - (sz0[1] - 40)) > 3 || Math.abs(sz1.pw - sz1.w) > 2 || Math.abs(sz1.ph - sz1.h) > 2) fail('Hörnhandtaget: ' + JSON.stringify({ sz0, sz1 }));
  await page.dblclick('#view3d .v3-rc');

  // Markera flera: varje tryck lägger till.
  await page.click('#v3Multi');
  const cvb = await page.locator('#v3Canvas canvas').boundingBox();
  const tapAt = async guid => {
    const p = await page.evaluate(g => { const m = l3b.models[0]; let pt = null; m.meshes.forEach(mesh => { const pos = mesh.geometry.getAttribute('position'), r = mesh.userData.l3b.ranges.find(x => x.guid === g); if (r) { const b = new THREE.Box3(); for (let i = r.start; i < r.start + r.count; i++) b.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos, i)); pt = b.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld); pt.z = b.max.z; } }); const q = l3ToScreen(pt); return [q.x, q.y]; }, guid);
    await page.mouse.click(cvb.x + p[0], cvb.y + p[1]); await page.waitForTimeout(150);
  };
  await page.evaluate(() => { l3bsClear(); l3StopFly(); const c = new THREE.Vector3(6512361 - l3.O[0], 150126 - l3.O[1], 0); l3.camera.position.set(c.x, c.y - 0.01, 60); l3.orbit.target.copy(c); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); });
  await tapAt('1hZq3$Bq9Fxu8nZK0bW1aA'); await tapAt('1hZq3$Bq9Fxu8nZK0bW1aB');
  const multi = await page.evaluate(() => l3bs.sel.map(e => e.mesh.userData.l3b.ranges[e.ri].guid).sort().join(','));
  if (multi !== '1hZq3$Bq9Fxu8nZK0bW1aA,1hZq3$Bq9Fxu8nZK0bW1aB') fail('Markera flera ska lägga till: ' + multi);
  await page.click('#v3Multi');

  // Markeringsfönster: vänster -> höger = bara hela objekt inne i rutan, höger -> vänster = allt som rutan nuddar.
  await page.evaluate(() => { l3bsClear(); l3StopFly(); const c = new THREE.Vector3(6512361 - l3.O[0], 150126 - l3.O[1], 0); l3.camera.position.set(c.x, c.y - 0.01, 60); l3.orbit.target.copy(c); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); });
  // Rutan: från strax vänster om B1 till mitten av B2 (B1 helt inne, B2 till hälften).
  const box = await page.evaluate(() => { const a = l3ToScreen(new THREE.Vector3(6512349.5 - l3.O[0], 150124.5 - l3.O[1], 0)), b = l3ToScreen(new THREE.Vector3(6512360 - l3.O[0], 150127.5 - l3.O[1], 0)); return [a.x, a.y, b.x, b.y]; });
  const drag = async (fx, fy, tx, ty) => { await page.mouse.move(cvb.x + fx, cvb.y + fy); await page.mouse.down(); await page.mouse.move(cvb.x + (fx + tx) / 2, cvb.y + (fy + ty) / 2, { steps: 3 }); await page.mouse.move(cvb.x + tx, cvb.y + ty, { steps: 3 }); await page.mouse.up(); await page.waitForTimeout(150); };
  const selG = () => page.evaluate(() => l3bs.sel.map(e => e.mesh.userData.l3b.ranges[e.ri].guid.slice(-1)).sort().join(','));
  await page.evaluate(() => { document.getElementById('v3Side').style.visibility = 'hidden'; });
  await drag(Math.min(box[0], box[2]) - 45, Math.min(box[1], box[3]) - 30, Math.max(box[0], box[2]), Math.max(box[1], box[3]) + 30);
  const win = await selG();
  await page.evaluate(() => l3bsClear());
  await drag(Math.max(box[0], box[2]), Math.max(box[1], box[3]) + 30, Math.min(box[0], box[2]) - 45, Math.min(box[1], box[3]) - 30);
  const crs = await selG();
  await page.evaluate(() => { document.getElementById('v3Side').style.visibility = ''; });
  if (win !== 'A' || crs !== 'A,B') fail('Fönster ska ta hela objekt, kryss allt som nuddas: ' + JSON.stringify({ win, crs }));
  // Kryss som bara nuddar en kant (ingen hörnpunkt i rutan) träffar ändå.
  const edge = await page.evaluate(() => { const r = l3.renderer.domElement.getBoundingClientRect(), p = l3ToScreen(new THREE.Vector3(6512370 - l3.O[0], 150125 - l3.O[1], 3)); return l3bsInRect(p.x - 3, p.x + 3, p.y - 3, p.y + 3, r, true).map(e => e.mesh.userData.l3b.ranges[e.ri].guid.slice(-1)).join(); });
  if (edge !== 'C') fail('Kryss mitt på en yta ska träffa objektet: ' + edge);
  await page.evaluate(() => { const m = l3b.models[0]; const ents = []; m.meshes.forEach(mesh => mesh.userData.l3b.ranges.forEach((r, ri) => { if (r.guid !== '1hZq3$Bq9Fxu8nZK0bW1aC') ents.push({ mesh, ri }); })); l3bsSet(ents); });

  // Ny grupp av de markerade (Bandgång 1), sparad i projektets ifc_groups.json.
  page.on('dialog', d => d.accept('Bandgång 1'));
  await page.selectOption('#v3GAdd', '__new');
  await page.waitForFunction(() => l3g.list.length === 1 && window.__gsaved, null, { timeout: 10000 });
  const g1 = await page.evaluate(() => ({ g: l3g.list[0], chips: [...document.querySelectorAll('#v3Side .v3-gchip')].map(c => c.textContent.replace(/\s+/g, ' ').trim()), saved: window.__gsaved }));
  if (g1.g.name !== 'Bandgång 1' || g1.g.guids.length !== 2 || !/Bandgång 1/.test(g1.chips.join()) || !g1.saved.some(x => x.name === 'Bandgång 1')) fail('Ny grupp: ' + JSON.stringify(g1));
  // Fliken Grupper: markera gruppen, dölj (Ctrl+Z visar igen), färga efter grupp.
  await page.evaluate(() => { l3bsClear(); l3p.group = null; l3PalTab('groups'); });
  await page.waitForSelector('#v3PalGroups [data-gsel]');
  await page.click('#v3PalGroups .v3-gr-n');
  if ((await page.evaluate(() => l3bs.sel.length)) !== 2) fail('Gruppen ska markeras från fliken Grupper');
  await page.click('#v3PalGroups [data-gmore]');
  await page.click('#v3PalGroups [data-ghide]');
  const hid = () => page.evaluate(() => l3b.models[0].meshes.reduce((a, m) => a + m.userData.l3b.hidden.size, 0));
  if ((await hid()) !== 2) fail('Dölj gruppen');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(100);
  if ((await hid()) !== 0) fail('Ctrl+Z ska visa gruppen igen');
  await page.keyboard.press('Control+y'); await page.waitForTimeout(100);
  if ((await hid()) !== 2) fail('Ctrl+Y ska dölja den igen');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(100);
  await page.click('#v3GBy');
  await page.waitForFunction(() => l3p.colorBy && l3p.colorBy.key === 'g:4d', null, { timeout: 10000 });
  const gcol = await page.evaluate(() => { const out = {}; l3b.models[0].meshes.forEach(mesh => { const c = mesh.geometry.getAttribute('color'); mesh.userData.l3b.ranges.forEach(r => { out[r.name] = '#' + new THREE.Color(c.getX(r.start), c.getY(r.start), c.getZ(r.start)).getHexString(); }); }); return { out, g: l3g.list[0].color }; });
  if (gcol.out['Balk B1'] !== gcol.g || gcol.out['Balk B2'] !== gcol.g || gcol.out['Pelare Kå'] === gcol.g) fail('Färga efter grupp ska använda gruppens färg: ' + JSON.stringify(gcol));
  await page.click('#v3GBy');
  if (await page.evaluate(() => !!l3p.colorBy)) fail('Sluta färga');
  await page.evaluate(() => { l3p.group = null; });

  // Skriv in grupperna i IFC:n: ny fil i samma mapp, egenskapen 4D-planering › Grupp, aldrig dubblerad.
  const gs = await page.evaluate(async () => {
    window.__up = null; const orig = askOpener;
    askOpener = async (type, extra, t, p) => { if (type === 'tcUpload') { const f = extra.files[0]; window.__up = { name: f.name, folderId: extra.folderId, bytes: new Uint8Array(await f.arrayBuffer()) }; return { uploaded: 1 }; } return orig(type, extra, t, p); };
    await l3gSaveModel(l3b.models[0]);
    const up = window.__up, text = new TextDecoder('latin1').decode(up.bytes);
    const again = l3gApplyToIfc(text).text;
    // Läs tillbaka med egenskapstråden.
    const wk = new Worker('ifc-props-worker.js');
    const call = msg => new Promise(res => { wk.onmessage = ev => { if (!('prog' in ev.data)) res(ev.data.ok); }; wk.postMessage(msg); });
    await call({ id: 1, op: 'open', bytes: up.bytes.buffer.slice(0), guids: [] });
    const a = await call({ id: 2, op: 'props', guid: '1hZq3$Bq9Fxu8nZK0bW1aB' }), c = await call({ id: 3, op: 'props', guid: '1hZq3$Bq9Fxu8nZK0bW1aC' });
    wk.terminate(); askOpener = orig;
    return { name: up.name, folderId: up.folderId, b2: (a.psets.find(p => p.n === '4D-planering') || { p: [] }).p, pel: c.psets.some(p => p.n === '4D-planering'),
      sets1: (text.match(/IFCPROPERTYSET\('[^']*',[^,]*,'4D-planering'/g) || []).length, rels2: (again.match(/IFCRELDEFINESBYPROPERTIES\([^;]*/g) || []).length, rels1: (text.match(/IFCRELDEFINESBYPROPERTIES\([^;]*/g) || []).length, esc: /Bandg\\X2\\00E5\\X0\\ng 1/.test(text) };
  });
  if (!/^Stål grupper \d{4}-\d\d-\d\d kl \d\d\.\d\d\.\d\d\.ifc$/.test(gs.name) || gs.folderId !== 'f1' || gs.b2.join() !== 'Grupp,Bandgång 1' || gs.pel || gs.sets1 !== 1 || gs.rels2 !== gs.rels1 || !gs.esc)
    fail('Grupperna i IFC:n: ' + JSON.stringify(gs));

  // Ctrl+Z/Ctrl+Y på en flytt i byggnaden.
  const mz = await page.evaluate(() => {
    const m = l3b.models[0]; let e = null; m.meshes.forEach(mesh => mesh.userData.l3b.ranges.forEach((r, ri) => { if (r.guid === '1hZq3$Bq9Fxu8nZK0bW1aC') e = { mesh, ri }; }));
    l3bsSet([e]); const p = e.mesh.geometry.getAttribute('position'), r = e.mesh.userData.l3b.ranges[e.ri], x0 = p.getX(r.start);
    l3bmStart(); const side = document.getElementById('v3Side'); side.querySelector('[data-bm="dx"]').value = '5'; l3bmApplyFields(side); l3bmAccept();
    const x1 = p.getX(r.start), pend1 = l3bmPending(m.id);
    l3Undo(); const x2 = p.getX(r.start), pend2 = l3bmPending(m.id);
    l3Redo(); const x3 = p.getX(r.start);
    l3Undo();
    return { d1: x1 - x0, d2: x2 - x0, d3: x3 - x0, pend1, pend2 };
  });
  if (Math.abs(mz.d1 - 5) > 1e-3 || Math.abs(mz.d2) > 1e-3 || Math.abs(mz.d3 - 5) > 1e-3 || mz.pend1 !== 1 || mz.pend2 !== 0) fail('Ångra/gör om flytt: ' + JSON.stringify(mz));

  if (process.env.SHOT) {
    await page.evaluate(() => { const m = l3b.models[0]; let e = null; m.meshes.forEach(mesh => mesh.userData.l3b.ranges.forEach((r, ri) => { if (r.guid === '1hZq3$Bq9Fxu8nZK0bW1aA') e = { mesh, ri }; })); l3bsSet([e]); l3SetPref('propsClosed', []); l3Frame(true); });
    await page.waitForSelector('#v3BsProps details.v3-ps', { timeout: 15000 });
    await page.evaluate(() => { l3gUi.open = l3g.list[0].id; l3PalTab('groups'); });
    await page.waitForTimeout(600); await page.screenshot({ path: process.env.SHOT });
  }
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3dprops');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
