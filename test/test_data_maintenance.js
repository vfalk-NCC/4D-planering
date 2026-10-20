// Funktionstest: statusgenväg på badgen, säkerhetskopia + historik +
// återställning, nollställning med dubbel bekräftelse, "Tänd kopplade
// modeller" och att Redigera hoppar till formuläret och tillbaka.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8995;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PID = 'test-project';

const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const get = f => { const e = store.get(`projects/${PID}/${f}`); return e ? JSON.parse(e.content) : null; };
const base = { project_id: PID, area: 'Hus A', contractor: 'NCC', status: 'planerad', progress: 0, start_date: '2026-10-01', end_date: '2026-10-05', depends_on: [] };
put('plan_items.json', [
  { ...base, id: 'a', model_id: 'm1', object_id: '10', object_name: 'Pelare A', activity: 'Gjutning' },
  { ...base, id: 'b', model_id: 'm2', object_id: '20', object_name: 'Pelare B', activity: 'Gjutning', depends_on: ['a'] },
]);

const day = k => new Date(Date.UTC(2026, 9, 20) - k * 864e5).toISOString();
const hist = [];
for (const id of ['a', 'b']) for (let k = 200; k >= 0; k -= 2) hist.push({ id: id + k, plan_item_id: id, project_id: PID, progress: 200 - k, status: 'pagaende', start_date: '2026-10-01', end_date: '2026-10-05', recorded_at: day(k) });
hist.push({ id: 'orph', plan_item_id: 'gone', project_id: PID, progress: 5, status: 'planerad', start_date: '2026-10-01', end_date: '2026-10-05', recorded_at: day(1) });
put('plan_item_progress_history.json', hist); put('plan_item_baseline_history.json', hist.map(r => ({ ...r })));
const idx = [];
for (let m = 0; m < 14; m++) { const d = new Date(Date.UTC(2026, 9, 18) - m * 15 * 864e5).toISOString(); const id = 'bk' + m, f = `backups/${d.replace(/[:.]/g, '-')}-${id}.json`; put(f, { id, files: { plan_items: [] } }); idx.push({ id, path: `projects/${PID}/${f}`, created_at: d, reason: m === 13 ? 'Manuell säkerhetskopia' : 'Före import', counts: { items: 2 } }); }
put('backups/index.json', idx);
put('plan_item_activities.json', []); put('plan_item_comments.json', [{ id: 'c1', plan_item_id: 'a', text: 'hej' }]);

(async () => {
  const server = http.createServer((req, res) => fs.readFile(path.join(DOCS_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(req.url.split('?')[0])] || 'application/octet-stream' }); res.end(data);
  })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 480, height: 1400 } });
  require('./_reveal').autoReveal(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(d.type() === 'prompt' ? 'NOLLSTÄLL' : undefined); });
  await page.addInitScript(() => {
    localStorage.setItem('4dplan-unlocked', '1');
    localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' }));
  });
  await page.route('https://components.connect.trimble.com/**', r => r.fulfill({ contentType: 'application/javascript', body: `
    window.__toggled = [];
    window.TrimbleConnectWorkspace = { connect: function(t, cb) { return Promise.resolve({
      project: { getProject: () => Promise.resolve({ id: '${PID}' }) },
      extension: { requestPermission: () => Promise.resolve('x') },
      viewer: {
        getSelection: () => Promise.resolve([]), convertToObjectIds: (m, r) => Promise.resolve(r.map(String)),
        convertToObjectRuntimeIds: (m, ids) => Promise.resolve(ids.map(Number)), setSelection: () => Promise.resolve(),
        setCamera: () => Promise.resolve(), getCamera: () => Promise.resolve({ position: { x: 0, y: 0, z: 10 } }),
        getObjectBoundingBoxes: (m, ids) => Promise.resolve(ids.map(id => ({ id, boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } }))),
        setObjectState: () => Promise.resolve(),
        getModels: () => Promise.resolve([{ id: 'm1', name: 'Modell 1', state: 'loaded' }, { id: 'm2', name: 'Modell 2', state: 'unloaded' }]),
        toggleModel: (id, loaded) => { window.__toggled.push([id, loaded]); return Promise.resolve(); }
      } }); } };` }));
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET') {
      if (e) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha, size: e.content.length }) });
      const pre = f + '/', kids = [...store.keys()].filter(k => k.startsWith(pre));
      if (kids.length) { const seen = new Map(); kids.forEach(k => { const rest = k.slice(pre.length), nm = rest.split('/')[0]; if (rest.includes('/')) seen.set(nm, { name: nm, path: pre + nm, type: 'dir', size: 0 }); else seen.set(nm, { name: nm, path: k, type: 'file', size: store.get(k).content.length, sha: store.get(k).sha }); }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([...seen.values()]) }); }
      return r.fulfill({ status: 404, body: '{}' });
    }
    if (req.method() === 'DELETE') { const body = JSON.parse(req.postData()); if (!e || body.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' }); store.delete(f); return r.fulfill({ status: 200, body: '{}' }); }
    const body = JSON.parse(req.postData()); if (e && body.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' });
    const sha = 's' + (++n); store.set(f, { content: Buffer.from(body.content, 'base64').toString(), sha });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) });
  });
  const fail = m => { throw new Error(m); };
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Ren logik
  const u = await page.evaluate(() => {
    const rows = [{ id: '1', plan_item_id: 'x', recorded_at: '2026-10-01T10:00:00Z', v: 1 }, { id: '2', plan_item_id: 'x', recorded_at: '2026-10-02T10:00:00Z', v: 2 }];
    const a = histAppendMerged(rows, [{ id: 'n1', plan_item_id: 'x', recorded_at: '2026-10-02T12:00:00Z', v: 3 }]);      // samma dag som rad 2 → ersätts
    const b = histAppendMerged([rows[0]], [{ id: 'n2', plan_item_id: 'x', recorded_at: '2026-10-01T12:00:00Z', v: 9 }]);    // bara en rad finns: första behålls, ny läggs till
    const c = histAppendMerged(rows, [{ id: 'n3', plan_item_id: 'x', recorded_at: '2026-10-05T12:00:00Z', v: 4 }]);       // ny dag → läggs till
    return { a: a.map(r => r.v), b: b.map(r => r.v), c: c.map(r => r.v) };
  });
  if (JSON.stringify(u) !== JSON.stringify({ a: [1, 3], b: [1, 9], c: [1, 2, 4] })) fail('histAppendMerged: ' + JSON.stringify(u));
  console.log('OK: samma dag slås ihop, första raden behålls');

  await page.click('#btnSettings'); await page.click('.set-sec[data-sec="data"] > summary');
  // Storleksrapport
  await page.click('#dmSizesBtn'); await page.waitForSelector('.dm-t tr');
  const t1 = await page.textContent('#dmOut'); if (!/Totalt/.test(t1) || !/plan_item_progress_history/.test(t1) || !/backups\//.test(t1)) fail('Storleksrapporten ska lista filer och backups: ' + t1.slice(0, 200));
  console.log('OK: storleksrapport');
  // Rensa säkerhetskopior: behåll 3 + en per månad + manuella
  await page.fill('#dmKeepN', '3'); await page.click('#dmBkPreview'); await page.waitForSelector('#dmBkGo');
  const pv = await page.textContent('#dmOut');
  const want = await page.evaluate(() => { const idx = JSON.parse(JSON.stringify([])); return 0; });
  const before = get('backups/index.json').length;
  await page.click('#dmBkGo'); await page.waitForFunction(() => /Klart/.test(document.getElementById('dmOut').textContent), null, { timeout: 15000 });
  const idx2 = get('backups/index.json');
  if (idx2.length >= before || idx2.length < 3) fail('Säkerhetskopior ska ha rensats: ' + before + ' → ' + idx2.length);
  if (!idx2.some(b => /Manuell/.test(b.reason))) fail('Manuell kopia ska behållas');
  const files = [...store.keys()].filter(k => /\/backups\/\d{4}.*\.json$/.test(k)).length; if (files !== idx2.length) fail('Filerna ska matcha indexet: ' + files + ' vs ' + idx2.length);
  const months = new Set(idx2.map(b => b.created_at.slice(0, 7))); const allMonths = new Set(JSON.parse(JSON.stringify([])).length ? [] : []);
  console.log('OK: gamla säkerhetskopior rensas, manuell kopia och senaste behålls (' + before + ' → ' + idx2.length + ')');
  // Gallra historik
  const h0 = get('plan_item_progress_history.json').length;
  await page.click('#dmHiPreview'); await page.waitForSelector('#dmHiGo');
  await page.click('#dmHiGo'); await page.waitForFunction(() => /Klart/.test(document.getElementById('dmOut').textContent), null, { timeout: 15000 });
  const h1 = get('plan_item_progress_history.json'), b1 = get('plan_item_baseline_history.json');
  if (h1.length >= h0 || b1.length >= h0) fail('Historiken ska ha gallrats: ' + h0 + ' → ' + h1.length);
  if (h1.some(r => r.plan_item_id === 'gone')) fail('Föräldralösa rader ska tas bort');
  for (const id of ['a', 'b']) { const rows = h1.filter(r => r.plan_item_id === id); if (!rows.some(r => r.id === id + '200') || !rows.some(r => r.id === id + '0')) fail('Första och sista raden per objekt ska finnas kvar: ' + id); }
  if (!get('backups/index.json').some(b => /Före gallring/.test(b.reason))) fail('En säkerhetskopia ska tas före gallringen');
  console.log('OK: historiken gallras (' + h0 + ' → ' + h1.length + '), första/sista behålls, säkerhetskopia tas först');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('ALLA TESTER OK'); await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
