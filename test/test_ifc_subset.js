// Exportera markerade objekt som IFC (Victor 2026-10-07): bara det markerade – med geometri, färg,
// egenskaper, material, öppningar och våning – inga underdelar och inget annat. Del 1: själva
// urvalet på en påhittad IFC-fil (node). Del 2: hela flödet i appen mot ett simulerat Trimble Connect
// (markering → hämta modellfilen → nedladdning + sparad i mappen IFC-urval).
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const S = require('../docs/ifc-subset.js');
const fail = m => { throw new Error(m); };
const G = c => c.repeat(22).slice(0, 22); // påhittade GUID:er
const IFC = [
  "ISO-10303-21;", "HEADER;", "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
  "FILE_NAME('original.ifc','2026-10-01T10:00:00',('Victor'),('NCC'),'Tekla','Tekla','');", "FILE_SCHEMA(('IFC2X3'));", "ENDSEC;", "DATA;",
  "#1=IFCPROJECT('" + G('P') + "',#2,'Projektet',$,$,$,$,(#10),#11);",
  "#2=IFCOWNERHISTORY(#3,#4,$,.ADDED.,$,$,$,0);", "#3=IFCPERSONANDORGANIZATION(#5,#6,$);", "#4=IFCAPPLICATION(#6,'1','Tekla','T');",
  "#5=IFCPERSON($,'Falk','Victor',$,$,$,$,$);", "#6=IFCORGANIZATION($,'NCC',$,$,$);",
  "#10=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#12,$);", "#11=IFCUNITASSIGNMENT((#13));", "#12=IFCAXIS2PLACEMENT3D(#14,$,$);",
  "#13=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);", "#14=IFCCARTESIANPOINT((0.,0.,0.));",
  "#20=IFCSITE('" + G('S') + "',#2,'Plats',$,$,#26,$,$,.ELEMENT.,$,$,$,$,$);", "#21=IFCRELAGGREGATES('" + G('a') + "',#2,$,$,#1,(#20));",
  "#22=IFCBUILDING('" + G('B') + "',#2,'Hus',$,$,#27,$,$,.ELEMENT.,$,$,$);", "#23=IFCRELAGGREGATES('" + G('b') + "',#2,$,$,#20,(#22));",
  "#24=IFCBUILDINGSTOREY('" + G('V') + "',#2,'Plan 1',$,$,#32,$,$,.ELEMENT.,0.);", "#25=IFCRELAGGREGATES('" + G('c') + "',#2,$,$,#22,(#24,#28));",
  "#26=IFCLOCALPLACEMENT($,#12);", "#27=IFCLOCALPLACEMENT(#26,#12);", "#28=IFCBUILDINGSTOREY('" + G('W') + "',#2,'Plan 2',$,$,#27,$,$,.ELEMENT.,3000.);",
  // Vägg A (markerad): namn med ; och # i texten och ett rått å (byte 0xE5).
  "#30=IFCWALL('" + G('A') + "',#2,'Vägg; #99 ''test''',$,$,#31,#33,'A1');", "#31=IFCLOCALPLACEMENT(#32,#12);", "#32=IFCLOCALPLACEMENT(#27,#12);",
  "#33=IFCPRODUCTDEFINITIONSHAPE($,$,(#34));", "#34=IFCSHAPEREPRESENTATION(#10,'Body','SweptSolid',(#35));",
  "#35=IFCEXTRUDEDAREASOLID(#36,#12,#39,3000.);", "#36=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,200.,4000.);",
  "#37=IFCSTYLEDITEM(#35,(#38),$);", "#38=IFCPRESENTATIONSTYLEASSIGNMENT((#41));", "#39=IFCDIRECTION((0.,0.,1.));",
  "#41=IFCSURFACESTYLE('Grå',.BOTH.,(#42));", "#42=IFCSURFACESTYLERENDERING(#43,0.,$,$,$,$,$,$,.FLAT.);", "#43=IFCCOLOURRGB($,0.5,0.5,0.5);",
  // Vägg B (inte markerad) med egen geometri.
  "#45=IFCWALL('" + G('X') + "',#2,'Vägg B',$,$,#46,#47,'B1');", "#46=IFCLOCALPLACEMENT(#32,#12);", "#47=IFCPRODUCTDEFINITIONSHAPE($,$,(#48));",
  "#48=IFCSHAPEREPRESENTATION(#10,'Body','SweptSolid',(#49));", "#49=IFCEXTRUDEDAREASOLID(#36,#12,#39,2000.);", "#44=IFCSTYLEDITEM(#49,(#38),$);",
  // Öppning i A.
  "#50=IFCOPENINGELEMENT('" + G('O') + "',#2,'Hål',$,$,#31,$,$);", "#51=IFCRELVOIDSELEMENT('" + G('v') + "',#2,$,$,#30,#50);",
  // Sammansättning (inte markerad) med en markerad del (#61) och en omarkerad (#63).
  "#60=IFCELEMENTASSEMBLY('" + G('E') + "',#2,'Gjutning',$,$,#31,$,$,.NOTDEFINED.,.NOTDEFINED.);",
  "#61=IFCREINFORCINGBAR('" + G('R') + "',#2,'Armering 1',$,$,#31,#64,$,$,12.,$,$,$,$);", "#62=IFCRELAGGREGATES('" + G('d') + "',#2,$,$,#60,(#61,#63));",
  "#63=IFCREINFORCINGBAR('" + G('Q') + "',#2,'Armering 2',$,$,#31,$,$,$,12.,$,$,$,$);", "#64=IFCPRODUCTDEFINITIONSHAPE($,$,(#34));",
  "#70=IFCRELCONTAINEDINSPATIALSTRUCTURE('" + G('e') + "',#2,$,$,(#30,#45,#60),#24);",
  "#71=IFCRELCONTAINEDINSPATIALSTRUCTURE('" + G('f') + "',#2,$,$,(#45),#28);",
  /* en kommentar */ "/* kommentar i filen */",
  "#80=IFCPROPERTYSET('" + G('p') + "',#2,'NCC',$,(#81));", "#81=IFCPROPERTYSINGLEVALUE('Etapp',$,IFCLABEL('1'),$);",
  "#82=IFCRELDEFINESBYPROPERTIES('" + G('g') + "',#2,$,$,(#30,#45),#80);",
  "#83=IFCPROPERTYSET('" + G('q') + "',#2,'Bara B',$,(#81));", "#84=IFCRELDEFINESBYPROPERTIES('" + G('h') + "',#2,$,$,(#45),#83);",
  "#90=IFCMATERIAL('C30/37');", "#91=IFCRELASSOCIATESMATERIAL('" + G('i') + "',#2,$,$,(#30,#45,#61),#90);",
  "#92=IFCMATERIALDEFINITIONREPRESENTATION($,$,(#93),#90);", "#93=IFCSTYLEDREPRESENTATION(#10,$,$,(#94));", "#94=IFCSTYLEDITEM($,(#38),$);",
  "#95=IFCPRESENTATIONLAYERASSIGNMENT('Lager',$,(#34,#48),$);",
  "#96=IFCWALLTYPE('" + G('T') + "',#2,'Typ',$,$,$,$,$,$,.STANDARD.);", "#97=IFCRELDEFINESBYTYPE('" + G('j') + "',#2,$,$,(#30,#45),#96);",
  "ENDSEC;", "END-ISO-10303-21;", ""
].join("\n");
const bytes = Uint8Array.from(Array.from(IFC, ch => ch.charCodeAt(0))); // latin1 – å som en byte

function check(text) {
  const P = S.ifcParse(text);
  const ids = new Set(P.ids);
  P.ids.forEach((id, k) => S.ifcRefs(text.slice(P.starts[k], P.ends[k])).forEach(r => { if (!ids.has(r)) fail(`#${id} pekar på #${r} som inte finns med`); }));
  return P;
}
{
  const r = S.ifcSubset(S.ifcBytesToStr(bytes), [G('A'), G('R'), G('Z')], { fileName: 'Urval.ifc' });
  if (JSON.stringify(r.found.sort()) !== JSON.stringify([G('A'), G('R')].sort()) || JSON.stringify(r.missing) !== JSON.stringify([G('Z')])) fail('Hittade/saknade: ' + JSON.stringify(r));
  const P = check(r.text);
  const has = id => P.index.has(id);
  const body = id => { const k = P.index.get(id); return r.text.slice(P.starts[k], P.ends[k]); };
  [1, 2, 10, 11, 13, 20, 21, 22, 23, 24, 25, 30, 31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 50, 51, 61, 64, 70, 80, 81, 82, 90, 91, 92, 93, 94, 95, 96, 97].forEach(id => { if (!has(id)) fail('Ska vara med: #' + id); });
  [45, 46, 47, 48, 49, 44, 60, 62, 63, 71, 83, 84].forEach(id => { if (has(id)) fail('Ska inte vara med: #' + id); });
  if (body(70) !== '($,$,(#30),#24)'.replace('$,$', `'${G('e')}',#2,$,$`)) fail('Våningens lista ska bara ha A: ' + body(70));
  if (!/\(#30\),#80\)$/.test(body(82)) || !/\(#30,#61\),#90\)$/.test(body(91)) || !/\(#34\),\$\)$/.test(body(95)) || !/\(#30\),#96\)$/.test(body(97))) fail('Relationernas listor: ' + [body(82), body(91), body(95), body(97)].join(' | '));
  if (!/\(#24\)\)$/.test(body(25))) fail('Plan 2 ska bort ur byggnaden: ' + body(25));
  // Den lyfta delen får en egen "ligger i Plan 1".
  const extra = P.ids.filter(id => id > 97).map(id => P.types[P.index.get(id)] + body(id));
  if (extra.length !== 1 || !/^IFCRELCONTAINEDINSPATIALSTRUCTURE\('.{22}',#2,'4D-planering urval',\$,\(#61\),#24\)$/.test(extra[0])) fail('Delen ska läggas på våningen: ' + JSON.stringify(extra));
  if (!r.text.includes("Vägg; #99 ''test''") || !r.text.includes("FILE_NAME('Urval.ifc'") || !r.text.endsWith('ENDSEC;\nEND-ISO-10303-21;\n')) fail('Texten och huvudet');
  const out = S.ifcStrToBytes(r.text);
  if (!out.includes(0xe5)) fail('å ska vara kvar som samma byte');
  console.log('OK: urvalet – bara det markerade (inga underdelar, inte sammansättningen), med geometri, färg, egenskaper, material, typ, öppning, lager och våning; alla referenser finns med');
  // Sammansättningen markerad: delarna följer inte med.
  const r2 = S.ifcSubset(S.ifcBytesToStr(bytes), [G('E')]);
  const P2 = check(r2.text);
  if (!P2.index.has(60) || P2.index.has(61) || P2.index.has(63) || P2.index.has(62)) fail('Markerad sammansättning – utan sina delar');
  const r3 = S.ifcSubset(S.ifcBytesToStr(bytes), [G('Z')]);
  if (r3.text !== null) fail('Inget hittat = ingen fil');
  console.log('OK: markerad sammansättning tar inte med sina delar; inget hittat ger ingen fil');
}

// ---- Del 2: hela flödet i appen ----
const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8987;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PID = 'test-project';
const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
put('plan_items.json', []); put('plan_item_activities.json', []); put('plan_item_comments.json', []);
(async () => {
  const server = http.createServer((req, res) => fs.readFile(path.join(DOCS_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(req.url.split('?')[0])] || 'application/octet-stream' }); res.end(data);
  })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, acceptDownloads: true });
  require('./_reveal').autoReveal(page);
  const errors = [], dialogs = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.addInitScript(() => {
    localStorage.setItem('4dplan-unlocked', '1');
    localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' }));
  });
  await page.route('https://components.connect.trimble.com/**', r => r.fulfill({ contentType: 'application/javascript', body: `
    window.TrimbleConnectWorkspace = { connect: function(t, cb) { window.__cb = cb; return Promise.resolve({
      project: { getProject: () => Promise.resolve({ id: '${PID}', name: 'Kv Testet', location: 'europe' }) },
      extension: { requestPermission: p => Promise.resolve(p === 'accesstoken' ? 'aaa.bbb.ccc' : 'x') },
      viewer: {
        getSelection: () => Promise.resolve(window.__sel || []), convertToObjectIds: (m, r) => Promise.resolve(r.map(x => window.__guids[x])),
        convertToObjectRuntimeIds: (m, ids) => Promise.resolve([]), setSelection: () => Promise.resolve(), setCamera: () => Promise.resolve(),
        getObjectProperties: () => Promise.resolve([]), setObjectState: () => Promise.resolve(), toggleModel: () => Promise.resolve(),
        getModels: () => Promise.resolve([{ id: 'mod1', versionId: 'ver7', name: 'Konstruktion K1.ifc', state: 'loaded' }, { id: 'mod2', versionId: 'v2', name: 'Arkitekt.rvt', state: 'loaded' }])
      } }); } };` }));
  const tc = { folders: [], files: [], log: [], uploads: new Map() };
  await page.route('https://app.connect.trimble.com/tc/api/2.0/regions', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ location: 'europe', 'tc-api': 'https://app21.connect.trimble.com/tc/api/2.0/' }]) }));
  await page.route('https://app21.connect.trimble.com/tc/api/2.0/**', async r => {
    const req = r.request(), u = new URL(req.url()), p = u.pathname.replace('/tc/api/2.0/', ''), m = req.method();
    tc.log.push(m + ' ' + p + u.search);
    if (req.headers().authorization !== 'Bearer aaa.bbb.ccc') return r.fulfill({ status: 401, body: '{}' });
    const json = (b, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (m === 'GET' && p === 'files/fs/mod1/downloadurl') return u.searchParams.get('versionId') === 'ver7' ? json({ url: 'https://s3.example.test/get/k1.ifc' }) : json({}, 404);
    if (m === 'GET' && p === `projects/${PID}`) return json({ id: PID, rootId: 'root' });
    if (m === 'GET' && p === 'folders/root/items') return json(tc.folders);
    if (m === 'POST' && p === 'folders') { const b = JSON.parse(req.postData()); const f = { id: 'f' + tc.folders.length, name: b.name, type: 'FOLDER' }; tc.folders.push(f); return json(f, 201); }
    if (m === 'POST' && p === 'files/fs/initiate') { const b = JSON.parse(req.postData()); const id = 'up' + tc.uploads.size; tc.uploads.set(id, { ...b }); return json({ uploadId: id, uploadURL: 'https://s3.example.test/put/' + id }); }
    if (m === 'POST' && p === 'files/fs/commit') { const b = JSON.parse(req.postData()); const up = tc.uploads.get(b.uploadId); tc.files.push(up); return json({ id: 'file1', name: up.name }); }
    return json({ message: 'okänd ' + m + ' ' + p }, 404);
  });
  await page.route('https://s3.example.test/**', async r => {
    const req = r.request();
    if (req.method() === 'GET') return req.headers().authorization ? r.fulfill({ status: 400, body: '' }) : r.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(bytes) });
    const id = req.url().split('/').pop();
    tc.uploads.get(id).body = req.postDataBuffer(); r.fulfill({ status: 200, body: '' });
  });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'x' } }) });
  });
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  // Inget markerat: en tydlig uppmaning.
  await page.click('#btnExportSelIfcTop'); await page.waitForTimeout(300);
  if (!dialogs.some(d => /Markera objekten i 3D-vyn/.test(d))) fail('Utan markering: ' + JSON.stringify(dialogs));
  // A, armeringsdelen och ett objekt i en Revit-modell.
  await page.evaluate(g => { window.__guids = { 1: g.A, 2: g.R }; window.__sel = [{ modelId: 'mod1', objectRuntimeIds: [1, 2] }, { modelId: 'mod2', objectRuntimeIds: [1] }]; }, { A: G('A'), R: G('R') });
  dialogs.length = 0;
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnExportSelIfcTop')]);
  const name = dl.suggestedFilename();
  if (!/^Konstruktion K1 - urval 2 objekt \d{4}-\d{2}-\d{2}\.ifc$/.test(name)) fail('Filnamnet: ' + name);
  const got = fs.readFileSync(await dl.path());
  for (let i = 0; i < 50 && !tc.files.length; i++) await page.waitForTimeout(100);
  const folder = tc.folders.find(f => f.name === 'IFC-urval');
  if (!folder || tc.files.length !== 1 || tc.files[0].name !== name || tc.files[0].parentId !== folder.id) fail('Sparad i TC-mappen IFC-urval: ' + tc.log.join(', '));
  if (!Buffer.from(tc.files[0].body).equals(got)) fail('Samma fil i TC som nedladdad');
  const P = check(S.ifcBytesToStr(new Uint8Array(got)));
  if (!P.index.has(30) || !P.index.has(61) || P.index.has(45) || P.index.has(63)) fail('Fel objekt i filen');
  if (!got.includes(0xe5)) fail('å ska vara oförändrat');
  await page.waitForTimeout(300);
  if (!dialogs.some(d => /Arkitekt\.rvt: inte en IFC-modell/.test(d))) fail('Revit-modellen ska förklaras: ' + JSON.stringify(dialogs));
  console.log('OK: knappen – markeringen hämtas ur rätt modellversion i TC, laddas ned som', name, 'och sparas i IFC-urval; en Revit-modell förklaras');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('ALLA TESTER OK');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
