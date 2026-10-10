// Ritade volymer som IFC (Victors önskemål 2026-10-05): ⋯-menyn "Exportera volymer som IFC" gör om
// volymerna (manuella markeringar: bottenyta + höjd) till slutna kroppar i IFC4, modellens
// koordinater i meter, statusfärg, egenskaper och namnet som 3D-text ovanpå. Filen laddas ned och
// sparas i Trimble Connect-mappen "Lägesplan export".
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8981;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PID = 'test-project';
const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const base = { project_id: PID, area: 'Etapp 1', contractor: 'NCC', status: 'planerad', progress: 0, depends_on: [] };
put('plan_items.json', [
  { ...base, status: 'klar', progress: 100, id: 'f', model_id: null, object_id: 'excel-f', object_name: 'Fyllning Del 1', activity: 'Fyllning', start_date: '2026-01-02', end_date: '2026-01-13', actual_end_date: '2026-01-13' },
  { ...base, id: 'g', model_id: null, object_id: 'excel-g', object_name: 'Schakt Å', activity: 'Schakt', start_date: '2099-01-02', end_date: '2099-02-13' },
]);
put('plan_item_activities.json', []); put('plan_item_comments.json', []);
// L-formad volym (konkav) med lutande botten, en enkel ruta, en utan höjd (hoppas över) och en linje.
const X = 6512300, Y = 150100;
put('plan_markups.json', [
  { id: 'v1', itemId: 'f', shape: 'volume', height: 2, by: 'Victor', created_at: '2026-10-01T10:00:00Z',
    pts: [[X, Y, 10], [X + 20, Y, 10.5], [X + 20, Y + 6, 10.5], [X + 6, Y + 6, 10], [X + 6, Y + 16, 10], [X, Y + 16, 10], [X, Y + 16, 10]] },
  { id: 'v2', itemId: 'g', shape: 'volume', height: 3, pts: [[X + 40, Y + 10, 5], [X + 40, Y, 5], [X + 30, Y, 5], [X + 30, Y + 10, 5]] },
  { id: 'v3', itemId: 'g', shape: 'volume', height: 0, pts: [[X, Y, 0], [X + 1, Y, 0], [X + 1, Y + 1, 0]] },
  { id: 'l1', itemId: 'g', shape: 'line', pts: [[X, Y, 0], [X + 1, Y, 0]] },
]);

(async () => {
  const server = http.createServer((req, res) => fs.readFile(path.join(DOCS_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(req.url.split('?')[0])] || 'application/octet-stream' }); res.end(data);
  })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 }, acceptDownloads: true });
  require('./_reveal').autoReveal(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    localStorage.setItem('4dplan-unlocked', '1');
    localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' }));
  });
  await page.route('https://components.connect.trimble.com/**', r => r.fulfill({ contentType: 'application/javascript', body: `
    window.TrimbleConnectWorkspace = { connect: function(t, cb) { window.__cb = cb; return Promise.resolve({
      project: { getProject: () => Promise.resolve({ id: '${PID}', name: 'Kv Testet', location: 'europe' }) },
      extension: { requestPermission: p => Promise.resolve(p === 'accesstoken' ? 'aaa.bbb.ccc' : 'x') },
      markup: { addLineMarkups: a => Promise.resolve(a.map((m, i) => ({ ...m, id: i }))), getLineMarkups: () => Promise.resolve([]), removeMarkups: () => Promise.resolve() },
      viewer: {
        getSelection: () => Promise.resolve([]), convertToObjectIds: (m, r) => Promise.resolve(r.map(String)),
        convertToObjectRuntimeIds: (m, ids) => Promise.resolve(ids.map(Number)), setSelection: () => Promise.resolve(),
        setCamera: () => Promise.resolve(), getCamera: () => Promise.resolve({ position: { x: 0, y: -40, z: 30 }, lookAt: { x: 0, y: 0, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 }, fieldOfView: 60 }),
        getObjectBoundingBoxes: () => Promise.resolve([]), getObjectProperties: () => Promise.resolve([]),
        setObjectState: () => Promise.resolve(), getModels: () => Promise.resolve([]), toggleModel: () => Promise.resolve()
      } }); } };` }));
  // Trimble Connects Core API (attrapp): region, projekt, rotmapp, mappar och uppladdning i tre steg
  // (initiate → PUT till lagringen → commit), som Trimbles eget SDK.
  const tc = { folders: [{ id: 'f-annat', name: 'Modeller', type: 'FOLDER' }], files: [], log: [], uploads: new Map() };
  await page.route('https://app.connect.trimble.com/tc/api/2.0/regions', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ location: 'europe', origin: 'app21.connect.trimble.com', 'tc-api': 'https://app21.connect.trimble.com/tc/api/2.0/' }]) }));
  await page.route('https://app21.connect.trimble.com/tc/api/2.0/**', async r => {
    const req = r.request(), u = new URL(req.url()), p = u.pathname.replace('/tc/api/2.0/', ''), m = req.method();
    tc.log.push(m + ' ' + p);
    if (req.headers().authorization !== 'Bearer aaa.bbb.ccc') return r.fulfill({ status: 401, body: '{}' });
    const json = (b, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (m === 'GET' && p === `projects/${PID}`) return json({ id: PID, rootId: 'root' });
    if (m === 'GET' && p === 'folders/root/items') return json(tc.folders);
    if (m === 'POST' && p === 'folders') { const b = JSON.parse(req.postData()); if (b.parentId !== 'root') return json({}, 400); if (tc.folders.some(x => x.name.normalize('NFC').toLowerCase() === b.name.normalize('NFC').toLowerCase())) return json({ message: 'A file/folder with same name already exists.', errorcode: 'DUPLICATE_NAME' }, 409); const f = { id: 'f' + tc.folders.length, name: b.name, type: 'FOLDER' }; tc.folders.push(f); return json(f, 201); }
    if (m === 'POST' && p === 'files/fs/initiate') { const b = JSON.parse(req.postData()); const id = 'up' + tc.uploads.size; tc.uploads.set(id, { ...b }); return json({ uploadId: id, uploadURL: 'https://s3.example.test/put/' + id }); }
    if (m === 'POST' && p === 'files/fs/commit') { const b = JSON.parse(req.postData()); const up = tc.uploads.get(b.uploadId); if (!up || up.body === undefined) return json({}, 400); tc.files.push(up); return json({ id: 'file1', name: up.name, parentId: up.parentId }); }
    return json({ message: 'okänd ' + m + ' ' + p }, 404);
  });
  await page.route('https://s3.example.test/**', async r => {
    const req = r.request(); const id = req.url().split('/').pop();
    if (req.method() !== 'PUT' || req.headers().authorization) return r.fulfill({ status: 403, body: '' });
    tc.uploads.get(id).body = req.postDataBuffer().toString('utf8'); r.fulfill({ status: 200, body: '' });
  });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'x' } }) });
  });
  const fail = m => { throw new Error(m); };
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    document.getElementById('timelineDate').value = '2026-10-05';
  });

  // Via menyn: knappen finns i ⋯-menyn och ger en nedladdning + en uppladdning till TC.
  await page.click('#btnListMenu');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnExportVolumesIfc')]);
  const name = dl.suggestedFilename();
  if (!/^Volymer Kv Testet 2026-10-05 kl \d\d\.\d\d\.\d\d\.ifc$/.test(name)) fail('Filnamnet: ' + name);
  const text = fs.readFileSync(await dl.path(), 'utf8');
  for (let i = 0; i < 50 && !tc.files.length; i++) await page.waitForTimeout(100);
  const folder = tc.folders.find(f => f.name === 'Lägesplan export');
  if (!folder) fail('Mappen Lägesplan export ska skapas i projektets rotmapp: ' + tc.log.join(', '));
  if (tc.files.length !== 1) fail('En fil ska sparas i Trimble Connect: ' + tc.log.join(', '));
  const up = tc.files[0];
  if (up.parentId !== folder.id || up.parentType !== 'FOLDER' || up.name !== name) fail('TC-uppladdningen: ' + JSON.stringify({ p: up.parentId, t: up.parentType, n: up.name }));
  if (up.body !== text) fail('Filen i TC ska vara samma som den nedladdade');
  // Andra gången finns mappen redan: ingen ny mapp, ny uppladdning (blir en ny version i TC).
  await page.click('#btnListMenu');
  await Promise.all([page.waitForEvent('download'), page.click('#btnExportVolumesIfc')]);
  for (let i = 0; i < 50 && tc.files.length < 2; i++) await page.waitForTimeout(100);
  if (tc.files.length !== 2 || tc.log.filter(l => l === 'POST folders').length !== 1 || tc.files[1].parentId !== folder.id) fail('Andra exporten ska hamna i samma mapp: ' + tc.log.join(', '));
  // Mappen heter likadant men med andra versaler och å/ä/ö kodade på annat sätt (Victor 2026-10-10: 409
  // DUPLICATE_NAME): samma mapp används, ingen ny skapas och inget fel.
  folder.name = 'LÄGESPLAN EXPORT'.normalize('NFD');
  await page.click('#btnListMenu');
  await Promise.all([page.waitForEvent('download'), page.click('#btnExportVolumesIfc')]);
  for (let i = 0; i < 50 && tc.files.length < 3; i++) await page.waitForTimeout(100);
  if (tc.files.length !== 3 || tc.files[2].parentId !== folder.id || tc.log.filter(l => l === 'POST folders').length !== 1) fail('Samma mapp trots annan stavning: ' + tc.log.join(', '));
  console.log('OK: menyn laddar ned', name, 'och sparar samma fil i Trimble Connect (Lägesplan export)');

  // Innehållet.
  if (!/^ISO-10303-21;/.test(text) || !/FILE_SCHEMA\(\('IFC4'\)\)/.test(text) || !/END-ISO-10303-21;\r\n$/.test(text)) fail('Inte en IFC4-fil');
  if (/[^\x00-\x7f]/.test(text)) fail('IFC-filen ska vara ren ASCII');
  if (!/'4D-planering',\$?'4D-planering',''\);|'4D-planering','4D-planering',''\)/.test(text)) fail('FILE_NAME ska ange 4D-planering som program');
  const vols = [...text.matchAll(/IFCBUILDINGELEMENTPROXY\('[^']+',\$,'([^']*)','([^']*)','4D-volym',(#\d+),(#\d+)/g)];
  if (vols.length !== 2) fail('Två volymer (utan höjd och linjer hoppas över), fick ' + vols.length);
  if (!vols.some(v => v[1] === 'Fyllning Del 1' && v[2] === 'Klar')) fail('Volym 1: ' + vols.map(v => v[1] + '/' + v[2]));
  if (!vols.some(v => v[1] === 'Schakt \\X2\\00C5\\X0\\' && v[2] === 'Planerad men ej startad')) fail('Volym 2: ' + vols.map(v => v[1] + '/' + v[2]));
  if ((text.match(/'4D-volymtext'/g) || []).length !== 2) fail('Varje volym ska ha en 3D-text');
  if (!/'Volym m\\X2\\00B3\\X0\\',\$,IFCREAL\(\d/.test(text) || !/'Basyta m\\X2\\00B2\\X0\\',\$,IFCREAL\(180\.\)/.test(text)) fail('Egenskaperna Basyta (180 m²) och Volym ska finnas');
  console.log('OK: två volymer i statusfärg med egenskaper (bas 180 m² för L-formen) och 3D-text');
  // Texten: i L-formens stora del (inte i det tomma hörnet), ovanpå volymen; kvadraten läses vågrätt.
  const spots = await page.evaluate(() => {
    const L = [[0, 0], [20, 0], [20, 6], [6, 6], [6, 16], [0, 16]];
    const ifcStrW = n => ifcTextStrokes(n).width / 6;
    return { l: volLabelSpot(L, 1, 0, ifcStrW('Fyllning Del 1')), sq: volLabelSpot([[0, 0], [10, 0], [10, 10], [0, 10]], 1, 0, ifcStrW('Schakt Å')) };
  });
  if (!(spots.l.y > 0 && spots.l.y < 6 && spots.l.x > 6 && spots.l.h >= 1)) fail('Texten i L-formen: ' + JSON.stringify(spots.l));
  const tpl = /IFCBUILDINGELEMENTPROXY\('[^']+',\$,'Fyllning Del 1 \\X2\\2013\\X0\\ text','Namn','4D-volymtext',(#\d+)/.exec(text);
  if (!tpl) fail('Textens element saknas');
  const ent = id => (new RegExp('^' + id + '=([^;]*);', 'm').exec(text) || [])[1] || '';
  const ptRef = /IFCAXIS2PLACEMENT3D\((#\d+)/.exec(ent((/IFCLOCALPLACEMENT\(#\d+,(#\d+)\)/.exec(ent(tpl[1])) || [])[1]))[1];
  const tz = Number(/\(([^)]*)\)/.exec(ent(ptRef).replace('IFCCARTESIANPOINT(', ''))[1].split(',')[2]);
  if (Math.abs(tz - 12.5) > 1e-6) fail('Texten ska ligga på volymens topp (12,5), z = ' + tz);
  // Kvadraten (alla kanter lika långa, ritad med lodrät första kant): texten vågrät.
  const sqText = /IFCBUILDINGELEMENTPROXY\('[^']+',\$,'Schakt \\X2\\00C5\\X0\\ \\X2\\2013\\X0\\ text','Namn','4D-volymtext',#\d+,(#\d+)/.exec(text);
  const meshId = /\((#\d+)\)\)$/.exec(/IFCSHAPEREPRESENTATION\([^;]*/.exec(ent(/\((#\d+)\)\)$/.exec(ent(sqText[1]))[1]))[0])[1];
  const coords = [...ent(/IFCTRIANGULATEDFACESET\((#\d+)/.exec(ent(meshId))[1]).matchAll(/\(([-\d.E]+),([-\d.E]+),([-\d.E]+)\)/g)].map(m => [+m[1], +m[2]]);
  const span = k => Math.max(...coords.map(c => c[k])) - Math.min(...coords.map(c => c[k]));
  if (!(span(0) > span(1) * 2)) fail('Kvadratens text ska läsas vågrätt: ' + span(0) + ' × ' + span(1));
  console.log('OK: namnet ligger ovanpå, i ytans största del, läsbart');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  fs.writeFileSync(path.join(require('os').tmpdir(), 'volymer_test.ifc'), text);
  console.log('ALLA TESTER OK');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
