// Egenskaper i inlästa IFC-modeller (Victor 2026-10-10: "Jag ska få mycket mer info än detta också, samt
// att jag ska kunna sortera på alla olika UDA som objektet har på något snyggt sätt, kanske i en
// collapsible högermeny"): högerpanelen visar attribut, våning, typ, material, Psets (UDA) och mängder,
// hopfällbara och sökbara; fliken Egenskaper grupperar alla objekt efter en egenskap, markerar och färgar.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9883;
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
  "#60=IFCRELCONTAINEDINSPATIALSTRUCTURE('2O2Fr$t4X7Zf8NOew3FLOL',$,$,$,(#90,#57),#15);", "#90=IFCELEMENTASSEMBLY('4qZq3$Bq9Fxu8nZK0bW1aA',$,'Fackverk F1',$,$,#7,$,'ASM-1',.NOTDEFINED.,.NOTDEFINED.);", "#92=IFCPROPERTYSINGLEVALUE('Assembly/Cast unit Mark',$,IFCLABEL('F1'),$);", "#93=IFCPROPERTYSET('5qZq3$Bq9Fxu8nZK0bW1aA',$,'Tekla Assembly',$,(#92));", "#94=IFCRELDEFINESBYPROPERTIES('5qZq3$Bq9Fxu8nZK0bW1aB',$,$,$,(#37,#47),#93);", "#91=IFCRELAGGREGATES('4qZq3$Bq9Fxu8nZK0bW1aB',$,$,$,#90,(#37,#47));",
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

  const R = await page.evaluate(async () => {
    const out = {}, m = l3b.models[0], names = () => l3bs.sel.map(e => e.mesh.userData.l3b.ranges[e.ri].name).sort().join('|');
    // egenskaperna (assembly som egenskap)
    const { out: o } = await l3pOpenAll(true); const st = o[0][1];
    const keys = await l3pCall(st, { op: 'keys' }); out.hasKey = keys.some(k => k[0] === 'a:asm');
    const vals = await l3pCall(st, { op: 'values', key: 'a:asm' }); out.vals = vals.map(([v, g]) => (v === '\u0000' ? '(saknas)' : v) + ':' + g.length).sort().join('|');
    // markera alla assemblies
    await l3pAsmAll(); out.all = names();
    // klick på en del -> hela assemblyn
    l3bsSet([]); l3SetPref('asmClick', true);
    let e1 = null; m.meshes.forEach(mesh => mesh.userData.l3b.ranges.forEach((r, ri) => { if (r.guid === '1hZq3$Bq9Fxu8nZK0bW1aA') e1 = { mesh, ri }; }));
    await l3pAsmSelect(m, '1hZq3$Bq9Fxu8nZK0bW1aA', false); out.click = names();
    // den lösa pelaren ingår inte i någon assembly
    l3bsSet([]); const ok = await l3pAsmSelect(m, '1hZq3$Bq9Fxu8nZK0bW1aC', false); out.loose = { ok, sel: l3bs.sel.length };
    return out;
  });
  // fliken Egenskaper: metadatan visas och knappen markerar alla assemblies
  await page.evaluate(() => { l3bsSet([]); l3PalTab('props'); });
  await page.waitForSelector('#v3AsmAll', { timeout: 20000 });
  const U = await page.evaluate(() => ({ cand: [...document.querySelectorAll('.v3-pp-asm [data-pkey]')].map(b => b.textContent.trim()), click: document.getElementById('v3AsmClick').checked }));
  await page.click('#v3AsmAll'); await page.waitForFunction(() => l3bs.sel.length === 2, null, { timeout: 10000 });
  R.ui = U;
  console.log(JSON.stringify(R));
  const ok = (c, m) => { if (!c) fail(m + ' ' + JSON.stringify(R)); };
  ok(R.hasKey, 'Egenskapen Assembly saknas'); ok(R.vals === '(saknas):1|Fackverk F1:2', 'Värden per assembly');
  ok(R.all === 'Balk B1|Balk B2', 'Markera alla assemblies ska ta balkarna men inte den lösa pelaren');
  ok(R.click === 'Balk B1|Balk B2', 'Klick på en del ska ge hela assemblyn');
  ok(R.loose.ok === false && R.loose.sel === 0, 'Lös del');
  ok(R.ui.cand.length === 1 && /Tekla Assembly › Assembly\/Cast unit Mark/.test(R.ui.cand[0]), 'Assembly-metadata i listan');
  if (errors.length) fail('Fel: ' + errors.join('|'));
  console.log('OK: assemblies – egenskapen Assembly, markera alla assemblies, klick markerar hela assemblyn');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
