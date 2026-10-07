// Veckosammanfattning (avancerat, test – Victor 2026-10-07): klart denna vecka (före/efter plan),
// försenat med vad det påverkar, värt att hålla koll på, startar nästa vecka och läget mot baseline.
// En rad per aktivitet. Del 1: beräkningen (node). Del 2: dialogen i appen (⋯-menyn), veckobyte,
// filter, klick markerar i 3D, kopiera.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
global.escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const W = require('../docs/week-summary.js');
const fail = m => { throw new Error(m); };
const PID = 'test-project';
let k = 0;
const row = (name, s, e, x = {}) => ({ id: 'a' + (++k), project_id: PID, model_id: 'm1', object_id: 'o' + k, object_name: name, activity: 'x', area: 'Linje E', contractor: 'NCC', depends_on: [], start_date: s, end_date: e, progress: 0, status: 'planerad', ...x });
const rows = [
  row('Bergstag EF 17-30', '2026-09-28', '2026-10-08', { status: 'klar', progress: 100, actual_end_date: '2026-10-07' }),            // a1 – 1 dag före
  row('Formning E31-40', '2026-09-30', '2026-10-06', { status: 'klar', progress: 100, actual_end_date: '2026-10-08' }),              // a2 – 2 dagar efter
  row('Grovbetong E31-40', '2026-10-01', '2026-10-07', { progress: 40, depends_on: ['a2'], baseline_start_date: '2026-09-29', baseline_end_date: '2026-10-03' }), // a3 – försenad
  row('Armering E41-50', '2026-10-12', '2026-10-16', { depends_on: ['a3'] }),                                                          // a4 – startar mån, väntar
  row('Montage pelare', '2026-10-20', '2026-10-22', { contractor: 'Havator', depends_on: ['a4'], baseline_start_date: '2026-10-16', baseline_end_date: '2026-10-18' }), // a5
  row('Btg-fyllning', '2026-10-05', '2026-10-15'),                                                                                     // a6 – borde ha startat
  row('Schakt linje K', '2026-10-01', '2026-10-15', { area: 'Linje K', contractor: 'Peab', progress: 10 }),                         // a7 – efter i tid
  row('Spont', '2026-10-14', '2026-10-16', { area: 'Linje K', contractor: 'Peab', group_id: 'g1', baseline_start_date: '2026-10-14', baseline_end_date: '2026-10-17' }), // a8
  row('Spont', '2026-10-15', '2026-10-17', { area: 'Linje K', contractor: 'Peab', group_id: 'g1', object_id: 'o9b' }),               // a9 – samma aktivitet
];
{
  // Samma fält som 4D-planeringens fromRow, status satt som den levande statusen 8 okt.
  const live = { a3: 'forsenad', a6: 'forsenad', a7: 'pagaende' };
  const items = rows.map(r => ({ id: r.id, objectId: r.object_id, modelId: r.model_id, objectName: r.object_name, area: r.area, contractor: r.contractor, startDate: r.start_date, endDate: r.end_date,
    actualEndDate: r.actual_end_date || null, progress: r.progress, status: live[r.id] || r.status, dependsOn: r.depends_on, groupId: r.group_id || null, baselineStartDate: r.baseline_start_date || null, baselineEndDate: r.baseline_end_date || null }));
  const blGet = (o, id) => o.baselineStartDate ? [o.baselineStartDate, o.baselineEndDate] : null;
  const S = W.buildWeekSummary(items, '2026-10-08', { today: '2026-10-08', blId: 'main', blGet });
  if (S.week !== 41 || S.ws !== '2026-10-05' || S.we !== '2026-10-11') fail('Veckan: ' + JSON.stringify([S.week, S.ws, S.we]));
  if (JSON.stringify(S.done.map(x => [x.a.name, x.note])) !== JSON.stringify([['Bergstag EF 17-30', '1 dag före plan'], ['Formning E31-40', '2 dagar efter plan']])) fail('Klart: ' + JSON.stringify(S.done.map(x => [x.a.name, x.note])));
  const late = S.late.map(x => [x.a.name, x.label, x.date, x.ds, x.firstSucc && x.firstSucc.name]);
  if (JSON.stringify(late) !== JSON.stringify([['Grovbetong E31-40', 'Skulle vara klar', '2026-10-07', 2, 'Armering E41-50'], ['Btg-fyllning', 'Skulle ha startat', '2026-10-05', 0, undefined]])) fail('Försenat: ' + JSON.stringify(late));
  if (JSON.stringify(S.next.map(x => [x.a.name, x.a.start, x.waits.length])) !== JSON.stringify([['Armering E41-50', '2026-10-12', 1], ['Spont', '2026-10-14', 0]])) fail('Nästa vecka (Spont en gång): ' + JSON.stringify(S.next.map(x => [x.a.name, x.a.start, x.waits.length])));
  const watch = S.watch.map(w => w.text);
  if (watch.length !== 2 || !/Armering E41-50 startar mån 12\/10, men väntar på Grovbetong E31-40 som ligger efter/.test(watch[0]) || !/Schakt linje K: 10 % klart men 50 % av tiden har gått/.test(watch[1])) fail('Värt att hålla koll på: ' + JSON.stringify(watch));
  if (!S.bl || S.bl.endShift !== 4 || S.bl.endNow !== '2026-10-22' || S.bl.endBl !== '2026-10-18' || JSON.stringify(S.bl.top.map(x => [x.a.name, x.shift])) !== JSON.stringify([['Grovbetong E31-40', 4], ['Montage pelare', 4]])) fail('Baseline: ' + JSON.stringify(S.bl));
  if (JSON.stringify(S.counts) !== JSON.stringify({ done: 2, running: 1, late: 2, next: 2 })) fail('Antal: ' + JSON.stringify(S.counts));
  const P = W.buildWeekSummary(items, '2026-10-08', { today: '2026-10-08', contractor: 'Peab' });
  if (P.total !== 2 || P.late.length || P.next.length !== 1) fail('Filter Peab');
  const A = W.buildWeekSummary(items, '2026-10-08', { today: '2026-10-08', area: 'Linje E' });
  if (A.total !== 6) fail('Filter område');
  const T = W.weekSummaryText(S, { project: 'NSV' });
  if (!/^Vecka 41 · 5 okt–11 okt 2026 · NSV/.test(T) || !/FÖRSENAT – BEHÖVER ÅTGÄRD\n- Grovbetong E31-40 \(NCC\) – skulle vara klar 7 okt, 40 %, påverkar 2 akt\./.test(T)) fail('Texten:\n' + T);
  console.log('OK: beräkningen – klart före/efter plan, försenat med påverkan, risker, nästa vecka (en rad per aktivitet), baseline, filter, text');
}

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8988;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
put('plan_items.json', rows); put('plan_item_activities.json', []); put('plan_item_comments.json', []);
(async () => {
  const server = http.createServer((req, res) => fs.readFile(path.join(DOCS_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(req.url.split('?')[0])] || 'application/octet-stream' }); res.end(data);
  })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${PORT}` });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2026-10-08T10:00:00'));
  require('./_reveal').autoReveal(page);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    localStorage.setItem('4dplan-unlocked', '1');
    localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' }));
  });
  await page.route('https://components.connect.trimble.com/**', r => r.fulfill({ contentType: 'application/javascript', body: `
    window.__sel = [];
    window.TrimbleConnectWorkspace = { connect: function(t, cb) { window.__cb = cb; return Promise.resolve({
      project: { getProject: () => Promise.resolve({ id: '${PID}', name: 'NSV-test' }) },
      extension: { requestPermission: () => Promise.resolve('x') },
      markup: { addLineMarkups: a => Promise.resolve(a.map((m, i) => ({ ...m, id: i + 1 }))), removeMarkups: () => Promise.resolve(), getLineMarkups: () => Promise.resolve([]) },
      viewer: {
        getSelection: () => Promise.resolve([]), convertToObjectIds: (m, r) => Promise.resolve(r.map(String)),
        convertToObjectRuntimeIds: (m, ids) => Promise.resolve(ids.map((x, i) => i + 1)), setSelection: s => { window.__sel.push(s); return Promise.resolve(); }, setCamera: () => Promise.resolve(),
        getObjectBoundingBoxes: () => Promise.resolve([]), getObjectProperties: () => Promise.resolve([]),
        setObjectState: () => Promise.resolve(), getModels: () => Promise.resolve([]), toggleModel: () => Promise.resolve()
      } }); } };` }));
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'x' } }) });
  });
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.click('#btnListMenu');
  await page.click('#btnWeekSummary'); await page.waitForTimeout(400);
  const body = () => page.innerText('#weekSumDialog .ws-body');
  let t = await body();
  for (const want of ['Vecka 41 · 5 okt–11 okt 2026 · NSV-test', '2 klara', '2 försenade', 'Bergstag EF 17-30', '1 dag före plan', 'Grovbetong E31-40', '2 akt.', 'Armering E41-50 startar mån 12/10, men väntar på Grovbetong E31-40', 'Startar nästa vecka (v.42)', '4 dagar efter']) if (!t.includes(want)) fail(`Saknas "${want}":\n` + t);
  if ((t.match(/Spont/g) || []).length !== 1) fail('Spont ska vara en rad');
  await page.locator('#weekSumDialog .ws-box').screenshot({ path: path.join(require('os').tmpdir(), 'week_summary.png') });
  // Klick på en rad markerar i 3D.
  await page.click('#weekSumDialog .ws-body [data-ws-key] >> text=Grovbetong E31-40'); await page.waitForTimeout(300);
  if (!(await page.evaluate(() => window.__sel.length))) fail('Klick ska markera i 3D');
  // Filter och veckobyte.
  await page.selectOption('#weekSumDialog .ws-contr', 'Peab'); await page.waitForTimeout(150);
  t = await body();
  if (t.includes('Grovbetong') || !t.includes('Schakt linje K') || !t.includes('Peab')) fail('Filter Peab:\n' + t);
  await page.selectOption('#weekSumDialog .ws-contr', ''); await page.click('#weekSumDialog .ws-next'); await page.waitForTimeout(150);
  t = await body();
  if (!t.startsWith('📋 Vecka 42') || !t.includes('Startar nästa vecka (v.43)') || !t.includes('Montage pelare')) fail('Nästa vecka:\n' + t);
  await page.click('#weekSumDialog .ws-now'); await page.waitForTimeout(150);
  // Kopiera: html + text i urklipp.
  await page.click('#weekSumDialog .ws-copy'); await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  if (!/^Vecka 41/.test(clip) || !clip.includes('KLART DENNA VECKA')) fail('Kopierad text:\n' + clip);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  if (!(await page.evaluate(() => document.getElementById('weekSumDialog').classList.contains('hidden')))) fail('Esc stänger');
  console.log('OK: dialogen – öppnas från ⋯-menyn, en rad per aktivitet, klick markerar i 3D, filter, veckobyte, kopiera, Esc');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('ALLA TESTER OK');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
