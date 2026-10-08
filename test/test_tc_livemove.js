// Flytta och vrid modell live i TC (viewer.placeModel): finjustering X/Y/höjd, vridning kring vald
// punkt, punkt till punkt, vrid mot riktning, ångra/återställ och Spara läget (flyttad IFC som ny fil,
// kontrollerad med ifcopenshell mot läget som TC visade).
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8975;
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
  const ifc = ["ISO-10303-21;", "HEADER;", "FILE_DESCRIPTION((''),'2;1');", "FILE_NAME('a.ifc','',(''),(''),'','','');", "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;",
    "#1=IFCCARTESIANPOINT((0.,0.,0.));", "#2=IFCAXIS2PLACEMENT3D(#1,$,$);", "#3=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#2,$);",
    "#4=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);", "#5=IFCUNITASSIGNMENT((#4));", "#6=IFCPROJECT('2O2Fr$t4X7Zf8NOew3FLOH',$,'Lib',$,$,$,$,(#3),#5);",
    "#7=IFCLOCALPLACEMENT($,#2);", "#8=IFCSITE('2O2Fr$t4X7Zf8NOew3FLOI',$,'Site',$,$,#7,$,$,.ELEMENT.,$,$,$,$,$);", "#9=IFCRELAGGREGATES('2O2Fr$t4X7Zf8NOew3FLOJ',$,$,$,#6,(#8));",
    "#20=IFCCARTESIANPOINT((169100000.,7456689000.,0.));", "#21=IFCAXIS2PLACEMENT3D(#20,$,$);",
    "#10=IFCLOCALPLACEMENT(#7,#21);", "#11=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,1000.,2000.);", "#12=IFCDIRECTION((0.,0.,1.));",
    "#13=IFCEXTRUDEDAREASOLID(#11,#2,#12,3000.);", "#14=IFCSHAPEREPRESENTATION(#3,'Body','SweptSolid',(#13));", "#15=IFCPRODUCTDEFINITIONSHAPE($,$,(#14));",
    "#16=IFCBUILDINGELEMENTPROXY('2O2Fr$t4X7Zf8NOew3FLOK',$,'Pall',$,$,#10,#15,$,$);", "#17=IFCRELCONTAINEDINSPATIALSTRUCTURE('2O2Fr$t4X7Zf8NOew3FLOL',$,$,$,(#16),#8);",
    "ENDSEC;", "END-ISO-10303-21;"].join("\n");
  // Simulerad TC: objektet (lokalt 169099,5–169100,5 × 7456688–7456690 × 0–3 m) följer placeringen: värld = R·lokal + pos.
  await page.evaluate(ifc => {
    let pl = { position: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 1 }, refDirection: { x: 1, y: 0, z: 0 }, scale: 1 };
    window.__pl = () => pl; window.__ifc = ifc;
    const L = [[169099.5, 7456688], [169100.5, 7456688], [169100.5, 7456690], [169099.5, 7456690]];
    window.__tf = (x, y) => { const r = pl.refDirection; return [r.x * x - r.y * y + pl.position.x / 1000, r.y * x + r.x * y + pl.position.y / 1000]; };
    API.viewer.getSelection = async () => [{ modelId: 'f1', objectRuntimeIds: [7] }];
    API.viewer.getModels = async () => [{ id: 'f1', versionId: 'v1', name: 'Pall leverantör.ifc', placement: JSON.parse(JSON.stringify(pl)) }];
    API.viewer.placeModel = async (id, p) => { pl = JSON.parse(JSON.stringify(p)); };
    API.viewer.getObjectBoundingBoxes = async (m, ids) => {
      const cs = L.map(([x, y]) => __tf(x, y)), xs = cs.map(c => c[0]), ys = cs.map(c => c[1]), z = pl.position.z / 1000;
      return ids.map(i => ({ id: i, boundingBox: { min: { x: Math.min(...xs), y: Math.min(...ys), z }, max: { x: Math.max(...xs), y: Math.max(...ys), z: z + 3 } } }));
    };
    window.__toggled = [];
    API.viewer.toggleModel = async (id, on) => { window.__toggled.push([id, on]); };
    ifcSubsetDownload = async spec => { window.__dl = spec; return new TextEncoder().encode(window.__ifc); };
    window.__up = [];
    tcUploadFiles = async (files, folder) => { const out = []; for (const f of files) { window.__up.push({ name: f.name, folder, text: await f.text() }); out.push({ name: f.name, res: { id: 'f2' } }); } return { uploaded: files.length, files: out }; };
  }, ifc);
  const center = () => page.evaluate(async () => { const b = (await API.viewer.getObjectBoundingBoxes('f1', [7]))[0].boundingBox; return [(b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.min.z].map(v => Math.round(v * 1000) / 1000); });
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 0.002);
  await page.click('#planSourceBar [data-design]');
  await page.click('#lmPick'); await page.waitForTimeout(200);
  if (!(await page.locator('#lmName').innerText()).includes('Pall leverantör.ifc') || !(await page.locator('#lmPivotTxt').innerText()).includes('markerade objektets mitt')) fail('Hämta modellen');
  let c0 = await center();
  // Finjustering: X+ (0,1 m), Y+ 2 gånger med 1 m, Upp 0,5 m.
  await page.click('[data-lmmove="1,0,0"]');
  await page.selectOption('#lmStep', '1'); await page.click('[data-lmmove="0,1,0"]'); await page.click('[data-lmmove="0,1,0"]');
  await page.selectOption('#lmStep', '0.5'); await page.click('[data-lmmove="0,0,1"]');
  await page.waitForTimeout(200);
  let c = await center();
  if (!near(c, [c0[0] + 0.1, c0[1] + 2, 0.5])) fail('Finjustering X/Y/höjd: ' + c + ' från ' + c0);
  // Vrid 90° kring objektets mitt: mitten står kvar.
  await page.selectOption('#lmRotStep', '90'); await page.click('[data-lmrot="1"]'); await page.waitForTimeout(150);
  if (!near(await center(), c)) fail('Vridning kring objektets mitt ska lämna mitten kvar: ' + await center());
  // Vridpunkt vald i modellen: 10 m väster om objektet -> vrid 90° moturs: mitten hamnar 10 m söder om punkten.
  await page.click('[data-lmpick="pivot"]');
  if (!(await page.locator('#lmMode').innerText()).includes('vridas kring')) fail('Välj punkt ska förklara');
  await pick(c[0] - 10, c[1], 0); await page.waitForTimeout(150);
  if (!(await page.locator('#lmPivotTxt').innerText()).includes('vald punkt')) fail('Vridpunkten ska vara vald punkt');
  await page.click('[data-lmrot="1"]'); await page.waitForTimeout(150);
  const c2 = await center();
  if (!near(c2, [c[0] - 10, c[1] + 10, 0.5])) fail('Vridning 90° kring vald punkt: ' + c2 + ' (förväntat ' + [c[0] - 10, c[1] + 10] + ')');
  // Vridpunkten följer med modellen: flytta 1 m öster och vrid 90° medurs tillbaka -> mitten 1 m öster om ursprunget.
  await page.selectOption('#lmStep', '1'); await page.click('[data-lmmove="1,0,0"]');
  await page.click('[data-lmrot="-1"]'); await page.waitForTimeout(150);
  const c3 = await center();
  if (!near(c3, [c[0] + 1, c[1], 0.5])) fail('Vridpunkten ska följa med när modellen flyttas: ' + c3);
  // Punkt till punkt.
  await page.click('[data-lmpick="p2p"]');
  await pick(c3[0], c3[1], 0.5); await pick(c3[0] + 3, c3[1] - 4, 1.5); await page.waitForTimeout(150);
  const c4 = await center();
  if (!near(c4, [c3[0] + 3, c3[1] - 4, 1.5])) fail('Punkt till punkt: ' + c4);
  // Vrid mot riktning: vridpunkt = mitten, utgång österut, ny riktning ungefär norrut (fäster 90°).
  await page.click('[data-lmpick="rot3"]');
  await pick(c4[0], c4[1], 1.5); await pick(c4[0] + 5, c4[1], 1.5); await pick(c4[0] + 0.1, c4[1] + 5, 1.5); await page.waitForTimeout(150);
  const ang = await page.evaluate(() => Math.round(Math.atan2(__pl().refDirection.y, __pl().refDirection.x) * 180 / Math.PI));
  if (ang !== 180 || !near(await center(), c4)) fail('Vrid mot riktning (90° till, totalt 180°): ' + ang + ' ' + await center());
  // Ångra en gång -> vinkeln tillbaka till 90°.
  await page.click('#lmUndo'); await page.waitForTimeout(150);
  if (await page.evaluate(() => Math.round(Math.atan2(__pl().refDirection.y, __pl().refDirection.x) * 180 / Math.PI)) !== 90) fail('Ångra');
  // Tangentbord: → flyttar ett steg (1 m).
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  const c5 = await center(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150);
  if (!near(await center(), [c5[0] + 1, c5[1], c5[2]])) fail('Piltangent: ' + await center());
  if (!(await page.locator('#lmState').innerText()).includes('vriden 90')) fail('Läget ska sammanfattas: ' + await page.locator('#lmState').innerText());

  // Spara läget: flyttad IFC som ny fil – samma läge som TC visade.
  const shownC = await center();
  const shownPl = await page.evaluate(() => __pl());
  await page.click('#lmSave'); await page.waitForTimeout(800);
  const up = await page.evaluate(() => window.__up);
  if (up.length !== 1 || up[0].folder !== '4D Etablering' || !/^Pall leverantör flyttad \d{4}-\d\d-\d\d kl [\d.]+\.ifc$/.test(up[0].name)) fail('Spara läget som ny fil: ' + JSON.stringify(up.map(u => [u.name, u.folder])));
  const tog = await page.evaluate(() => window.__toggled);
  if (JSON.stringify(tog) !== JSON.stringify([['f2', true], ['f1', false]])) fail('Den nya ska tändas och den gamla släckas: ' + JSON.stringify(tog));
  const back = await page.evaluate(() => __pl());
  if (back.position.x !== 0 || back.refDirection.x !== 1) fail('Den gamla modellen ska tillbaka till sitt ursprungliga läge');
  const SP = process.env.PLACE_TMP || '/tmp';
  fs.writeFileSync(path.join(SP, 'lm.ifc'), up[0].text);
  const out = execFileSync('python3', ['-I', '-c', `
import ifcopenshell, ifcopenshell.geom
s = ifcopenshell.geom.settings(); s.set(s.USE_WORLD_COORDS, True)
f = ifcopenshell.open(${JSON.stringify(path.join(SP, 'lm.ifc'))})
e = f.by_type('IfcBuildingElementProxy')[0]
v = ifcopenshell.geom.create_shape(s, e).geometry.verts
print((min(v[0::3]) + max(v[0::3])) / 2, (min(v[1::3]) + max(v[1::3])) / 2, min(v[2::3]), e.GlobalId)
`]).toString().trim().split(' ');
  const geo = out.slice(0, 3).map(Number);
  // ifcopenshell räknar i 32/64-bitar med SWEREF-tal: ett par mm tolerans.
  if (!geo.every((v, i) => Math.abs(v - shownC[i]) < 0.005)) fail('Den sparade IFC:n ska ligga där TC visade modellen: ' + geo + ' mot ' + shownC + ' (placering ' + JSON.stringify(shownPl) + ')');
  if (out[3] !== '2O2Fr$t4X7Zf8NOew3FLOK') fail('Objekt-id:n ska vara oförändrade i den flyttade kopian');
  if (!(await page.locator('#lmMode').innerText()).includes('Sparad som')) fail('Statusen efter sparning');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_tc_livemove');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
