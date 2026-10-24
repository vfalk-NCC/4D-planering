// Fristående läge (Victor 2026-10-24): 3D-editorn utan Trimble Connect/GitHub – tom arbetsyta, IFC från datorn, lokal lagring.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8997;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 1000 * s, transform: [s, 0, 0, -s, ox, 1000 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (1000 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 1000 - (y - oy) / s] });
    return { view: [0, 0, 1000, 1000], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : q.url.includes('.html') ? 'text/html' : q.url.includes('.wasm') ? 'application/wasm' : 'application/octet-stream' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  const errors = []; let gh = 0; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  await page.route('https://api.github.com/**', r => { gh++; r.fulfill({ status: 500, body: '{}' }); });
  const IFC_TXT = ["ISO-10303-21;", "HEADER;", "FILE_DESCRIPTION((''),'2;1');", "FILE_NAME('b.ifc','',(''),(''),'','','');", "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;",
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
  
  await page.goto(`http://localhost:${PORT}/lagesplan.html?fristaende=1`);
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && plan && plan.id === 'lokal', null, { timeout: 40000 }).catch(async e => { throw new Error('3D öppnades inte i fristående läge: ' + errors.join(' | ')); });
  if (gh) fail('Fristående läge ska inte anropa GitHub (' + gh + ' anrop)');
  console.log('OK: fristående läge – 3D öppnas direkt på en tom arbetsyta utan Trimble Connect/GitHub');
  // IFC från datorn
  await page.evaluate(async (txt) => { const f = await lokalFilAdd(new File([txt], 'Hus.ifc')); window.__f = f; await l3lFile(f.id, f.name); }, IFC_TXT);
  await page.waitForFunction(() => l3b.models.length === 1 && !l3b.busy, null, { timeout: 60000 });
  const r1 = await page.evaluate(() => ({ tris: l3b.models[0].tris, id: l3b.models[0].id, local: String(l3b.models[0].id).startsWith('f:lokal-') }));
  if (!(r1.tris > 0) || !r1.local) fail('IFC från datorn: ' + JSON.stringify(r1));
  console.log('OK: IFC från datorn läses in lokalt (' + r1.tris + ' trianglar)');
  // Origo flyttas till modellen och sidan startar om; modellen kommer tillbaka ur den lokala databasen
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.O && Math.abs(l3.O[0]) > 1e6 && l3b.models.length === 1 && !l3b.busy, null, { timeout: 90000 });
  const r2 = await page.evaluate(() => ({ O: l3.O, n: l3b.models.length }));
  console.log('OK: origo flyttat till modellen (' + r2.O.map(v => Math.round(v)).join(', ') + ') och modellen öppnades igen ur lokal lagring');
  // Sparat som IFC: nedladdning i stället för Trimble Connect
  const up = await page.evaluate(async () => { const fs = []; const orig = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) fs.push(this.download); }; const r = await askOpener('tcUpload', { files: [new File(['x'], 'test.ifc')] }); HTMLAnchorElement.prototype.click = orig; return { r, fs }; });
  if (up.fs[0] !== 'test.ifc' || up.r.uploaded !== 1) fail('Spara ska bli nedladdning: ' + JSON.stringify(up));
  console.log('OK: sparade filer hämtas till datorn i stället för Trimble Connect');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close(); console.log('OK test_standalone');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
