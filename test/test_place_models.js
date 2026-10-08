// Funktionstest: Placera i 3D – egna modeller. Sketchfab (inloggning med API-nyckel, sökning,
// nedladdning av GLB) och IFC från fil; GLB blir trianglar i Etablering-IFC:n, IFC-filen flyttas
// och vrids till punkten och blir en egen fil. Geometrin kontrolleras med ifcopenshell.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8972;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PID = 'test-project';

const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const get = f => { const e = store.get(`projects/${PID}/${f}`); return e ? JSON.parse(e.content) : null; };
const base = { project_id: PID, area: 'Sektionsfickor', contractor: 'NCC', status: 'planerad', progress: 0, depends_on: [] };
put('plan_items.json', [
  { ...base, id: 'a', model_id: 'm1', object_id: '10', object_name: 'Borrning', activity: 'Borrning', start_date: '2026-06-01', end_date: '2026-06-10' },
  { ...base, status: 'klar', id: 'f', model_id: null, object_id: 'excel-f', object_name: 'Fyllning Del 1', activity: 'Fyllning', start_date: '2026-01-02', end_date: '2026-01-13' },
]);
put('plan_item_activities.json', []); put('plan_item_comments.json', []);

(async () => {
  const server = http.createServer((req, res) => fs.readFile(path.join(DOCS_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(req.url.split('?')[0])] || 'application/octet-stream' }); res.end(data);
  })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 520, height: 1400 } });
  require('./_reveal').autoReveal(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    localStorage.setItem('4dplan-unlocked', '1');
    localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' }));
  });
  await page.route('https://components.connect.trimble.com/**', r => r.fulfill({ contentType: 'application/javascript', body: `
    window.__markups = new Map(); window.__nextId = 1; window.__camera = null; window.__toggled = [];
    window.__noIds = false;
    const addLines = arr => Promise.resolve(arr.map(m => { const id = window.__nextId++; window.__markups.set(id, { type: 'line', ...m, id }); return window.__noIds ? { ...m } : { ...m, id }; }));
    window.TrimbleConnectWorkspace = { connect: function(t, cb) { window.__cb = cb; return Promise.resolve({
      project: { getProject: () => Promise.resolve({ id: '${PID}' }) },
      extension: { requestPermission: () => Promise.resolve('x') },
      markup: {
        addLineMarkups: addLines,
        getLineMarkups: () => Promise.resolve([...window.__markups.values()]),
        removeMarkups: ids => { (ids || []).forEach(id => window.__markups.delete(id)); return Promise.resolve(); },
      },
      viewer: {
        getSelection: () => Promise.resolve([]), convertToObjectIds: (m, r) => Promise.resolve(r.map(String)),
        convertToObjectRuntimeIds: (m, ids) => Promise.resolve(ids.map(Number)), setSelection: () => Promise.resolve(),
        setCamera: c => { window.__camera = c; return Promise.resolve(); }, getCamera: () => Promise.resolve(window.__camera || { position: { x: 0, y: -40, z: 30 }, lookAt: { x: 0, y: 0, z: 0 }, quaternion: { x: 0.3, y: 0, z: 0, w: 0.95 }, fieldOfView: 60 }),
        getObjectBoundingBoxes: (m, ids) => Promise.resolve(ids.map(id => ({ id, boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } }))),
        getObjectProperties: () => Promise.resolve([]),
        setObjectState: () => Promise.resolve(),
        getModels: () => Promise.resolve([{ id: 'm1', name: 'Modell 1', state: 'unloaded' }]),
        toggleModel: (id, loaded) => { window.__toggled.push([id, loaded]); return Promise.resolve(); }
      } }); } };` }));
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET' && e && /raw/.test(req.headers()['accept'] || '')) return r.fulfill({ status: 200, body: e.content });
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    const body = JSON.parse(req.postData()); if (e && body.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' });
    const sha = 's' + (++n); store.set(f, { content: Buffer.from(body.content, 'base64').toString(), sha });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) });
  });
  const fail = m => { throw new Error(m); };
  const pick = (x, y, z) => page.evaluate(([x, y, z]) => window.__cb('viewer.onPicked', { data: { position: { x, y, z }, modelId: 'm1', objectRuntimeId: 1 } }), [x, y, z]);
  const shown = () => page.evaluate(() => [...window.__markups.values()]);
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);



  const { execFileSync } = require('child_process');
  // --- en GLB: kub 2×2×2 (röd), nod skalad 3 i Y (upp) och flyttad; plus en blå halvgenomskinlig triangel
  const pos1 = new Float32Array([-1,-1,-1, 1,-1,-1, 1,1,-1, -1,1,-1, -1,-1,1, 1,-1,1, 1,1,1, -1,1,1]);
  const idx1 = new Uint16Array([0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7]);
  const pos2 = new Float32Array([0,0,0, 1,0,0, 0,1,0]);
  const bin = Buffer.concat([Buffer.from(pos1.buffer), Buffer.from(idx1.buffer), Buffer.from(pos2.buffer)]);
  const gj = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ children: [1], translation: [10, 0, 0] }, { mesh: 0, scale: [1, 3, 1] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }, { attributes: { POSITION: 2 }, material: 1 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1] } }, { alphaMode: 'BLEND', pbrMetallicRoughness: { baseColorFactor: [0, 0, 1, 0.5] } }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 8, type: 'VEC3' }, { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' }, { bufferView: 2, componentType: 5126, count: 3, type: 'VEC3' }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 96 }, { buffer: 0, byteOffset: 96, byteLength: 72 }, { buffer: 0, byteOffset: 168, byteLength: 36 }],
    buffers: [{ byteLength: bin.length }] };
  let js = Buffer.from(JSON.stringify(gj)); while (js.length % 4) js = Buffer.concat([js, Buffer.from(' ')]);
  const hdr = Buffer.alloc(12); hdr.writeUInt32LE(0x46546C67, 0); hdr.writeUInt32LE(2, 4); hdr.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
  const glb = Buffer.concat([hdr, ch(js.length, 0x4E4F534A), js, ch(bin.length, 0x004E4942), bin]);

  // --- Sketchfab
  const sfAuth = [];
  await page.route('https://api.sketchfab.com/**', r => {
    const u = new URL(r.request().url()), a = r.request().headers()['authorization'];
    if (u.pathname === '/v3/me') { sfAuth.push(a); return a === 'Token abc' ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ username: 'victor', displayName: 'Victor F' }) }) : r.fulfill({ status: 401, body: '{}' }); }
    if (u.pathname === '/v3/search') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ next: null, results: [{ uid: 'u1', name: 'Byggbod röd', user: { displayName: 'Modellare' }, faceCount: 13, vertexCount: 11, license: { label: 'CC Attribution' }, likeCount: 1520, viewCount: 30200, animationCount: 0, publishedAt: '2024-05-17T10:00:00', description: '<p>En röd <b>byggbod</b> för etableringsplaner.</p>', tags: [{ name: 'bod' }, { name: 'bygg' }], categories: [{ name: 'Architecture' }], archives: { glb: { size: 3355443, faceCount: 13, vertexCount: 11, textureCount: 2, textureMaxResolution: 2048 } }, viewerUrl: 'https://sketchfab.com/3d-models/u1', thumbnails: { images: [{ url: 'https://media.sketchfab.com/t.jpg', width: 200, height: 112 }] } }] }) });
    if (u.pathname === '/v3/models/u1/download') { sfAuth.push(a); return a === 'Token abc' ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ glb: { url: 'https://dl.sketchfab.test/u1.glb', size: glb.length } }) }) : r.fulfill({ status: 401, body: '{}' }); }
    return r.fulfill({ status: 404, body: '{}' });
  });
  await page.route('https://dl.sketchfab.test/**', r => r.fulfill({ status: 200, contentType: 'model/gltf-binary', body: glb }));
  await page.route('https://media.sketchfab.com/**', r => r.fulfill({ status: 404, body: '' }));

  const wait = ms => page.waitForTimeout(ms);
  await page.click('#planSourceBar [data-design]');
  await page.click('#placeOpenBrowser');
  await page.fill('#pmToken', 'fel');
  await page.click('#pmLogin'); await wait(300);
  if (!(await page.locator('.pm-msg').innerText()).includes('godkände inte')) fail('Fel nyckel ska ge ett tydligt fel');
  await page.fill('#pmToken', 'abc');
  await page.click('#pmLogin'); await wait(300);
  if (!(await page.locator('.pm-who').innerText()).includes('Victor F')) fail('Inloggad som ska visas');
  if (await page.evaluate(() => localStorage.getItem('4dplan-sketchfab-token')) !== 'abc') fail('Nyckeln ska sparas lokalt');
  await page.fill('#pmQuery', 'bod');
  await page.click('#pmSearch'); await wait(300);
  if (await page.locator('.pm-card').count() !== 1) fail('Sökningen ska visa ett kort');
  const key = await page.locator('.pm-card .pm-key').innerText();
  if (!key.includes('3,2 MB') || !key.includes('13 tri')) fail('Kortet ska visa storlek och trianglar direkt: ' + key);
  await page.evaluate(() => { document.querySelector('.pm-more').open = true; });
  const more = await page.locator('.pm-more').innerText();
  for (const t of ['GLB', 'Hörn', '2 st, max 2048 px', '2024-05-17', '1\u00a0520 gillar', 'Architecture', 'bod, bygg', 'En röd byggbod för etableringsplaner.', 'Öppna på Sketchfab'])
    if (!more.includes(t)) fail(`"Mer info" ska innehålla ${t}: ${more}`);
  if (await page.locator('.pm-more b').count()) fail('Beskrivningens HTML ska tas bort');
  await page.click('[data-sf-uid="u1"]'); await wait(800);
  const conf = await page.locator('.pm-confirm').innerText();
  if (!/\d+ kB/.test(conf)) fail('Bekräftelsen ska visa nedladdad storlek: ' + conf);
  if (!conf.includes('13 trianglar') || !conf.includes('2 × 2 × 6 m') || !conf.includes('CC Attribution')) fail('Bekräftelsen ska visa trianglar, storlek och licens: ' + conf);
  await page.fill('#pmHeight', '12');
  await page.click('#pmAccept'); await wait(800);
  let assets = get('plan_models.json');
  if (!assets || assets.length !== 1 || assets[0].scale !== 2 || assets[0].author !== 'Modellare' || assets[0].source !== 'Sketchfab') fail('Modellen ska sparas i biblioteket med skala 2: ' + JSON.stringify(assets));
  if (!Array.isArray(assets[0].outline) || assets[0].outline.length !== 15) fail('Konturbilden ska vara kubens 12 kanter + triangelns 3: ' + JSON.stringify(assets[0].outline));
  const meshFile = store.get(assets[0].path);
  if (!meshFile || JSON.parse(meshFile.content).parts.length !== 2) fail('Geometrin ska sparas som egen fil med två färger');
  if (!(await page.locator('.place-mode').innerText()).includes('Tryck i modellen')) fail('Efter hämtning ska man direkt kunna placera');
  await pick(50, 60, 1); await wait(400);
  let m = await shown();
  const xs = m.flatMap(l => [l.start.positionX, l.end.positionX]), zs = m.flatMap(l => [l.start.positionZ, l.end.positionZ]);
  if (m.length !== 19 || Math.round(Math.min(...xs)) !== 48000 || Math.round(Math.max(...xs)) !== 52000 || Math.round(Math.max(...zs)) !== 13000) fail('Modellen ska förhandsvisas som konturbild (kubens 12 kanter) + fotavtryck, 4×4×12 m: ' + m.length);

  // --- IFC från fil (millimeter): rektangel 1000×2000, 3000 hög
  const ifc = ["ISO-10303-21;", "HEADER;", "FILE_DESCRIPTION((''),'2;1');", "FILE_NAME('a.ifc','',(''),(''),'','','');", "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;",
    "#1=IFCCARTESIANPOINT((0.,0.,0.));", "#2=IFCAXIS2PLACEMENT3D(#1,$,$);", "#3=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#2,$);",
    "#4=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);", "#5=IFCUNITASSIGNMENT((#4));",
    "#6=IFCPROJECT('2O2Fr$t4X7Zf8NOew3FLOH',$,'Lib',$,$,$,$,(#3),#5);",
    "#7=IFCLOCALPLACEMENT($,#2);", "#8=IFCSITE('2O2Fr$t4X7Zf8NOew3FLOI',$,'Site',$,$,#7,$,$,.ELEMENT.,$,$,$,$,$);",
    "#9=IFCRELAGGREGATES('2O2Fr$t4X7Zf8NOew3FLOJ',$,$,$,#6,(#8));",
    "#10=IFCLOCALPLACEMENT(#7,#2);", "#11=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,1000.,2000.);", "#12=IFCDIRECTION((0.,0.,1.));",
    "#13=IFCEXTRUDEDAREASOLID(#11,#2,#12,3000.);", "#14=IFCSHAPEREPRESENTATION(#3,'Body','SweptSolid',(#13));", "#15=IFCPRODUCTDEFINITIONSHAPE($,$,(#14));",
    "#16=IFCBUILDINGELEMENTPROXY('2O2Fr$t4X7Zf8NOew3FLOK',$,'Pall',$,$,#10,#15,$,$);",
    "#17=IFCRELCONTAINEDINSPATIALSTRUCTURE('2O2Fr$t4X7Zf8NOew3FLOL',$,$,$,(#16),#8);",
    "#18=IFCCARTESIANPOINT((-500.,-1000.,0.));", "#19=IFCCARTESIANPOINT((500.,1000.,3000.));",
    "ENDSEC;", "END-ISO-10303-21;"].join("\n");
  await page.click('#placeOpenBrowser');
  await page.click('[data-pmtab="file"]');
  await page.setInputFiles('#pmFile', { name: 'Pall.ifc', mimeType: 'application/octet-stream', buffer: Buffer.from(ifc) });
  await wait(500);
  const conf2 = await page.locator('.pm-confirm').innerText();
  if (!conf2.includes('IFC-fil') || !conf2.includes('1 × 2 × 3 m') || !conf2.includes('12 trianglar') || conf2.includes('ungefär')) fail('IFC-bekräftelsen ska visa storleken i meter: ' + conf2);
  await page.click('#pmAccept'); await wait(800);
  await pick(100, 200, 5); await wait(300);
  await page.fill('[data-pf="rot"]', '90'); await wait(300);
  if (await page.locator('[data-pf="mH"]').count()) fail('IFC-modeller ska inte kunna skalas');
  assets = get('plan_models.json');
  if (assets.length !== 2 || assets[1].kind !== 'ifc' || assets[1].factor !== 0.001) fail('IFC-filen ska ligga i biblioteket (mm)');
  // web-ifc: riktig geometri sparad bredvid, exakt storlek och konturbild (lådans 12 kanter).
  const ia = assets[1];
  if (!ia.meshPath || !store.get(ia.meshPath) || ia.tris !== 12) fail('IFC-geometrin ska sparas som egen fil: ' + JSON.stringify({ meshPath: ia.meshPath, tris: ia.tris }));
  if (JSON.stringify(ia.bbox) !== JSON.stringify({ min: [-0.5, -1, 0], max: [0.5, 1, 3] })) fail('Exakt storlek från geometrin: ' + JSON.stringify(ia.bbox));
  if (!Array.isArray(ia.outline) || ia.outline.length !== 12) fail('Konturbild för IFC: ' + JSON.stringify(ia.outline));
  if ((await shown()).length !== 20) fail('Den aktiva IFC-modellen (konturbild 12 + fotavtryck 4) + GLB-modellens fotavtryck (4): ' + (await shown()).length);

  // Georefererad fil: mitten placeras i punkten.
  const geo = await page.evaluate(t => pmIfcInfo(t.replace('(-500.,-1000.,0.)', '(169000000.,7456000000.,0.)').replace('(500.,1000.,3000.)', '(169002000.,7456001000.,3000.)').replace(/IFCRECTANGLEPROFILEDEF[^;]*/, 'IFCRECTANGLEPROFILEDEF(.AREA.,$,$,1.,1.)')), ifc);
  if (!(geo.offset[0] < -1000)) fail('Långt från origo ska ge en förskjutning: ' + JSON.stringify(geo));

  // --- Spara: läs om från "GitHub" (tomma cachar), en Etablering-IFC + en flyttad IFC
  await page.evaluate(() => { placeMeshCache.clear(); placeIfcCache.clear(); window.__up = []; window.tcUploadFiles = async (files, folder) => { for (const f of files) window.__up.push({ name: f.name, folder, text: await f.text() }); return { uploaded: files.length }; }; });
  await page.click('#placeSaveIfc'); await wait(2000);
  const up = await page.evaluate(() => window.__up);
  if (up.length !== 2) fail('Två filer ska laddas upp: ' + JSON.stringify(up.map(u => u.name)));
  const SP = process.env.PLACE_TMP || '/tmp';
  up.forEach((u, i) => fs.writeFileSync(path.join(SP, `pm${i}.ifc`), u.text));
  const py = `
import sys, ifcopenshell, ifcopenshell.geom
s = ifcopenshell.geom.settings(); s.set(s.USE_WORLD_COORDS, True)
for fn in sys.argv[1:]:
    f = ifcopenshell.open(fn)
    for e in f.by_type('IfcProduct'):
        if not e.Representation: continue
        v = ifcopenshell.geom.create_shape(s, e).geometry.verts
        xs, ys, zs = v[0::3], v[1::3], v[2::3]
        print(e.Name, e.GlobalId, *[round(x, 2) for x in (min(xs), max(xs), min(ys), max(ys), min(zs), max(zs))])
`;
  const out = execFileSync('python3', ['-I', '-c', py, path.join(SP, 'pm0.ifc'), path.join(SP, 'pm1.ifc')]).toString();
  const lines = out.trim().split('\n').map(l => l.split(' '));
  const bod = lines.find(l => l[0].startsWith('Byggbod')), pall = lines.find(l => l[0] === 'Pall');
  if (!bod || bod.slice(-6).join(' ') !== '48.0 52.0 58.0 62.0 1.0 13.0') fail('GLB-modellen ska hamna i punkten med skala 2: ' + out);
  if (!pall || pall.slice(-6).join(' ') !== '99.0 101.0 199.5 200.5 5.0 8.0') fail('IFC-filen ska flyttas och vridas till punkten: ' + out);
  if (pall[1] === '2O2Fr$t4X7Zf8NOew3FLOK') fail('Den placerade IFC:n ska få egna objekt-id:n');
  if (!up[0].text.includes('IFCCOLOURRGB($,1.,0.,0.)')) fail('Modellens röda färg ska följa med');
  if (!up[0].text.includes('CC Attribution') || !up[0].text.includes('Modellare')) fail('Upphov och licens ska stå i egenskaperna');
  if (sfAuth.some(a => a && a !== 'Token abc' && a !== 'Token fel')) fail('Nyckeln ska skickas som Token');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_place_models');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
