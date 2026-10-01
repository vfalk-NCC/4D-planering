// Namnbyte vid import (Victors önskemål 2026-10-01): "M30 - Fundament DP2 -
// Betongarbeten" omdöpt till "M30 - Fundament" i Excel ska vara samma
// aktivitet – 3D-kopplingar och kommentarer behålls. Två kandidater med
// samma kod (J14) matchas inte gissningsvis.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8960;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PID = 'test-project';

const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const get = f => { const e = store.get(`projects/${PID}/${f}`); return e ? JSON.parse(e.content) : null; };
const base = { project_id: PID, area: 'Hus A', contractor: 'NCC', status: 'planerad', progress: 0, depends_on: [], start_date: '2026-10-01', end_date: '2026-10-10' };
const SH = '745 - FÖRTJOCKARHUS';
put('plan_items.json', [
  // M30 med underrader, kopplad till två 3D-objekt (samma aktivitet = samma group_id).
  { ...base, id: 'm30a', group_id: 'GM30', model_id: 'm1', object_id: '30', object_name: 'M30', activity: 'Fundament DP2 - Betongarbeten', area: SH + ' / Linje M', source_key: SH + '||Linje M||M30||Fundament DP2 - Betongarbeten' },
  { ...base, id: 'm30b', group_id: 'GM30', model_id: 'm1', object_id: '31', object_name: 'M30', activity: 'Fundament DP2 - Betongarbeten', area: SH + ' / Linje M', source_key: SH + '||Linje M||M30||Fundament DP2 - Betongarbeten' },
  // J14: två aktiviteter med samma kod – båda döps om, ska INTE gissas ihop.
  { ...base, id: 'j1', model_id: 'm1', object_id: '50', object_name: 'J14', activity: 'Fundament gammal', area: SH + ' / Linje J', source_key: SH + '||Linje J||J14||Fundament gammal' },
  { ...base, id: 'j2', model_id: 'm1', object_id: '51', object_name: 'J14', activity: 'Kontrefor gammal', area: SH + ' / Linje J', source_key: SH + '||Linje J||J14||Kontrefor gammal' },
]);
put('plan_item_activities.json', []);
put('plan_item_comments.json', [{ id: 'cm', plan_item_id: 'm30a', project_id: PID, text: 'kvar?', author: 'V', created_at: '2026-10-01T09:00:00Z' }]);

put('plan_markups.json', [{ id: 'm', itemId: 'mk', shape: 'line', pts: [[0, 0, 0], [1, 0, 0]] }]);

(async () => {
  const server = http.createServer((req, res) => fs.readFile(path.join(DOCS_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(req.url.split('?')[0])] || 'application/octet-stream' }); res.end(data);
  })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 520, height: 1600 } });
  require('./_reveal').autoReveal(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let answers = [];                 // svar på kommande confirm-dialoger (true/false)
  const asked = [];
  page.on('dialog', d => { asked.push(d.message()); const a = answers.length ? answers.shift() : true; a ? d.accept() : d.dismiss(); });
  await page.addInitScript(() => {
    localStorage.setItem('4dplan-unlocked', '1');
    localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' }));
  });
  await page.route('https://components.connect.trimble.com/**', r => r.fulfill({ contentType: 'application/javascript', body: `
    window.__sel = [];
    window.TrimbleConnectWorkspace = { connect: function(t, cb) { window.__cb = cb; return Promise.resolve({
      project: { getProject: () => Promise.resolve({ id: '${PID}' }) },
      extension: { requestPermission: () => Promise.resolve('x') },
      markup: { addLineMarkups: a => Promise.resolve(a.map((m, i) => ({ ...m, id: i + 1 }))), removeMarkups: () => Promise.resolve(), getLineMarkups: () => Promise.resolve([]) },
      viewer: {
        getSelection: () => Promise.resolve(window.__sel), convertToObjectIds: (m, r) => Promise.resolve(r.map(String)),
        convertToObjectRuntimeIds: (m, ids) => Promise.resolve(ids.map(Number)), setSelection: () => Promise.resolve(),
        setCamera: () => Promise.resolve(), getCamera: () => Promise.resolve({ position: { x: 0, y: 0, z: 10 } }),
        getObjectBoundingBoxes: (m, ids) => Promise.resolve(ids.map(id => ({ id, boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } }))),
        getObjectProperties: (m, ids) => Promise.resolve(ids.map(id => ({ id, product: { name: 'Objekt ' + id } }))),
        setObjectState: () => Promise.resolve(), getModels: () => Promise.resolve([]), toggleModel: () => Promise.resolve()
      } }); } };` }));
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    if (req.method() === 'DELETE') { store.delete(f); return r.fulfill({ status: 200, body: '{}' }); }
    const body = JSON.parse(req.postData()); if (e && body.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' });
    const sha = 's' + (++n); store.set(f, { content: Buffer.from(body.content, 'base64').toString(), sha });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) });
  });
  const fail = m => { throw new Error(m); };
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const res = await page.evaluate(() => {
    const SH = '745 - FÖRTJOCKARHUS';
    const R = (b, c, k) => { const r = []; r[1] = b; r[2] = c; r[5] = '2026-10-12'; r[8] = '2026-10-22'; r[7] = 11; r[10] = k; r[13] = 0.5; return r; };
    const rows = [[], [], [], [],
      R('Linje M', 'Linje M', null), R(null, 'M30 - Fundament', 'DP2'), R(null, 'Grovbetong', 'DP2'), R(null, 'Gjutning', 'DP2'),
      R('Linje J', 'Linje J', null), R(null, 'J14 - Fundament', 'DP2'), R(null, 'Armering', 'DP2'), R(null, 'J14 - Kontrefor', 'DP2'), R(null, 'Formning', 'DP2')];
    rows.levels = [0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1];
    const parsed = parsePlanSheet(rows, SH);
    const diff = buildPlanImportDiff(parsed);
    window.__diff = diff;
    return { renames: diff.renames.map(r => `${r.code}:${r.from}->${r.to}:${r.coupled}`), create: diff.toCreate.map(m => m.parsed.objectName + '/' + m.parsed.activity), update: diff.toUpdate.length, removed: diff.removedExisting.map(it => it.id).sort() };
  });
  if (JSON.stringify(res.renames) !== JSON.stringify(['M30:Fundament DP2 - Betongarbeten->Fundament:2'])) fail('M30 ska kännas igen som namnbyte, fick ' + JSON.stringify(res));
  if (res.create.join(',') !== 'J14/Fundament,J14/Kontrefor' || res.removed.join(',') !== 'j1,j2') fail('J14 (två kandidater) ska inte gissas ihop, fick ' + JSON.stringify(res));
  console.log('OK: namnbytet känns igen, två kandidater med samma kod gissas inte ihop');

  // Förhandsgranskningen visar namnbytet
  await page.evaluate(() => { renderPlanImportPreview(window.__diff); toggle('planImportPreviewDialog', true); });
  const summary = await page.innerText('#planImportSummary');
  if (!summary.includes('namnbyte') || !summary.includes('Fundament DP2 - Betongarbeten → Fundament')) fail('Förhandsgranskningen ska visa namnbytet, fick ' + summary);
  console.log('OK: förhandsgranskningen visar namnbytet');

  await page.evaluate(() => commitPlanImport(window.__diff));
  await page.waitForTimeout(800);
  const m30 = get('plan_items.json').filter(r => r.object_name === 'M30');
  if (m30.length !== 2) fail('M30 ska fortfarande vara två rader (två 3D-objekt), fick ' + JSON.stringify(m30));
  if (!m30.every(r => r.model_id === 'm1' && ['30', '31'].includes(r.object_id) && r.group_id === 'GM30')) fail('3D-kopplingarna ska vara kvar: ' + JSON.stringify(m30));
  if (!m30.every(r => r.activity === 'Fundament' && r.source_key.endsWith('||M30||Fundament'))) fail('M30 ska få det nya namnet och nyckeln: ' + JSON.stringify(m30));
  if (!m30.some(r => r.id === 'm30a')) fail('Samma id ska behållas (kommentaren hänger på det)');
  if (get('plan_item_comments.json').length !== 1) fail('Kommentaren ska vara kvar');
  console.log('OK: efter import har M30 det nya namnet, samma id, kvar sina 3D-kopplingar och kommentaren');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
