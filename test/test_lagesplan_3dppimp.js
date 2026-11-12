const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9089;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : q.url.includes('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A');
  });
  await page.click('#btn3d');
  const r = await page.evaluate(async () => {
    const out = {}, w = ms => new Promise(r => setTimeout(r, ms)); await w(1200);
    const dir = 'projects/' + encodeURIComponent(projectId) + '/pp', store = {}; store[dir + '/plan_items.json'] = [
      { id: 'a1', project_id: projectId, model_id: 'M1', object_id: 'GUID1', object_name: 'Gammalt namn', area: 'X', activity: 'Gjutning', start_date: '2026-01-01', end_date: '2026-01-05', progress: 10, status: 'planerad', source_key: 'PP Del||1', temporary: true, baseline_start_date: '2025-12-01', group_id: 'g1' },
      { id: 'm1', project_id: projectId, object_id: 'manual-1', object_name: 'Egen', origin: 'manuell', start_date: '2026-02-01', end_date: '2026-02-02', source_key: 'PP Del||99' }];
    window.ghReadJSON = async (t, p) => JSON.parse(JSON.stringify(store[p] || [])); window.ghWriteJSON = async (t, p, fn) => (store[p] = fn(JSON.parse(JSON.stringify(store[p] || [])))); window.ghPutFile = async (t, p, b) => { store[p] = 'file'; };
    const task = (id, name, s, e, extra) => ({ id, uid: id, guid: 'G' + id, name, kind: 'task', top: 1, topName: 'Del', path: ['Del', 'Hus A'], start: s, end: e, actualStart: null, actualEnd: null, progress: 0, codes: {}, ...extra });
    l3pi.pp = { fileName: 't.pp', project: { name: 'Test', start: '2026-01-01', end: '2026-12-31' }, groups: [{ id: 1, name: 'Del', count: 3, start: '2026-01-01', end: '2026-03-01', defaultOn: true }], libs: [], tasks: [task(1, 'Nytt namn', '2026-01-03', '2026-01-09', { progress: 40 }), task(2, 'Armering', '2026-01-10', '2026-01-20'), task(3, 'Form', '2026-01-21', '2026-02-01')], links: [[1, 2], [2, 3]] };
    l3piDlg(); await w(800);
    out.sum = document.getElementById('v3PiSum').textContent; const btn = document.querySelector('[data-pigo]'); out.enabled = !btn.disabled;
    btn.click(); await w(1500);
    const rows = store[dir + '/plan_items.json'], a = rows.find(x => x.id === 'a1'), man = rows.find(x => x.id === 'm1'), n2 = rows.find(x => x.source_key === 'PP Del||2'), n3 = rows.find(x => x.source_key === 'PP Del||3');
    out.upd = a.start_date === '2026-01-03' && a.end_date === '2026-01-09' && a.progress === 40 && a.object_name === 'Nytt namn';
    out.kept = a.model_id === 'M1' && a.object_id === 'GUID1' && a.temporary === true && a.baseline_start_date === '2025-12-01' && a.group_id === 'g1';
    out.fresh = !!n2 && !!n3 && n2.model_id === null && /^excel-/.test(n2.object_id) && n2.depends_on.join() === 'a1' && n3.depends_on.join() === n2.id;
    out.manual = JSON.stringify(man) === JSON.stringify({ id: 'm1', project_id: projectId, object_id: 'manual-1', object_name: 'Egen', origin: 'manuell', start_date: '2026-02-01', end_date: '2026-02-02', source_key: 'PP Del||99' });
    out.count = rows.length === 4; out.backup = Object.keys(store).some(k => /backups\/index\.json$/.test(k)) && Object.keys(store).some(k => /backups\/.*\.json$/.test(k) && !/index/.test(k));
    return out;
  });
  console.log(JSON.stringify(r));
  if (!/2 nya/.test(r.sum) || !/1 uppdateras/.test(r.sum) || !r.enabled || !r.upd || !r.kept || !r.fresh || !r.manual || !r.count || !r.backup) fail('PP-import: ' + JSON.stringify(r));
  if (errors.length) fail('JS-fel: ' + errors.join(' | '));
  await browser.close(); server.close(); console.log('OK: Powerproject-import i 3D-editorn – uppdaterar, lägger till, behåller kopplingar och egna val, tar säkerhetskopia');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
