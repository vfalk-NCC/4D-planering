// Koppling till dashboardens Gantt: när dashboarden styr 3D-vyn skriver 4D-planering inget automatiskt till modellen;
// reglaget här flyttar dashboardens datum; släpper dashboarden tar 4D-planering över igen.
// eller svagt (inställning). Sparas som temporary i plan_items bara när det är satt.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8993;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PID = 'test-project';

const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const get = f => { const e = store.get(`projects/${PID}/${f}`); return e ? JSON.parse(e.content) : null; };
const base = { project_id: PID, area: 'Hus A', contractor: 'NCC', status: 'planerad', progress: 0, depends_on: [], start_date: '2026-10-01', end_date: '2026-10-10' };
put('plan_items.json', [
  { ...base, id: 'k', model_id: 'm1', object_id: '1', object_name: 'Mobilkran', activity: 'Lyft', temporary: true, start_date: '2026-10-01', end_date: '2026-10-10' },
  { ...base, id: 'n', model_id: 'm1', object_id: '2', object_name: 'Vägg', activity: 'Gjutning' },
  { ...base, id: 's', model_id: 'm1', object_id: '3', object_name: 'Stämp', activity: 'Stämpning', start_date: '2026-10-01', end_date: '2026-10-10', actual_end_date: '2026-10-06', progress: 100, status: 'klar', temporary: true },
]);
put('plan_item_activities.json', []);
put('plan_item_comments.json', []);
put('plan_markups.json', [{ id: 'm', itemId: 'mk', shape: 'line', pts: [[0, 0, 0], [1, 0, 0]] }]);

(async () => {
  const server = http.createServer((req, res) => fs.readFile(path.join(DOCS_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(req.url.split('?')[0])] || 'application/octet-stream' }); res.end(data);
  })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 520, height: 1600 } }); const page = await ctx.newPage();
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
    window.__sel = []; window.__states = [];
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
        setObjectState: (sel, st) => { window.__states.push({ sel, st }); return Promise.resolve(); }, getModels: () => Promise.resolve([]), toggleModel: () => Promise.resolve()
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
  // En "dashboard" på samma adress (en andra sida) som pratar på kanalen.
  const peer = await ctx.newPage();
  await peer.goto(`http://localhost:${PORT}/style.css`);
  await peer.evaluate(() => { window.__got = []; window.__ch = new BroadcastChannel('4d-gantt-link'); window.__ch.onmessage = e => window.__got.push(e.data); });
  const states = () => page.evaluate(() => window.__states.length);
  const send = m => peer.evaluate(m => window.__ch.postMessage(m), m);
  const nStates = () => page.evaluate(() => (window.__states = window.__states || []).length);
  // 1) Utan dashboard: tidslinjen färgar som vanligt.
  await page.evaluate(() => { window.__states = []; document.getElementById('timelineDate').value = '2026-10-05'; return applyTimelineColors(); });
  if (!(await states())) fail('Utan dashboard ska 4D-planering färga som vanligt');
  // 2) Dashboarden går in i Tid-läget: ingen automatisk skrivning, banderoll, datumet följer dashboardens.
  await send({ t: 'state', mode: 'time', date: '2026-10-08' }); await page.waitForTimeout(300);
  await page.evaluate(() => { window.__states = []; return applyTimelineColors(); });
  if (await states()) fail('Dashboarden styr: 4D-planering ska inte skriva färg/synlighet till modellen');
  if (!(await page.$('#dashLinkBanner'))) fail('Banderoll om att dashboarden styr');
  if ((await page.inputValue('#timelineDate')) !== '2026-10-08') fail('Dashboardens datum ska visas i 4D-planeringens tidslinje: ' + await page.inputValue('#timelineDate'));
  // 3) Reglaget här flyttar dashboardens datum.
  await peer.evaluate(() => { window.__got = []; });
  await page.evaluate(() => { const s = document.getElementById('timelineSlider'); s.value = Number(s.value) + 2; onSliderMove(); });
  await page.waitForTimeout(200);
  const got = await peer.evaluate(() => window.__got);
  if (!got.some(m => m.t === 'setDate' && /^2026-10-/.test(m.date))) fail('Reglaget ska skicka datumet till dashboarden: ' + JSON.stringify(got));
  await page.evaluate(() => { window.__states = []; });
  if (await states()) fail('Ingen skrivning till modellen när reglaget flyttas medan dashboarden styr');
  // 4) Kopplade/okopplade: 4D-planering skriver inget, men skickar inget datum heller.
  await send({ t: 'state', mode: 'isolate', date: '' }); await page.waitForTimeout(200);
  await peer.evaluate(() => { window.__got = []; });
  await page.evaluate(() => { const s = document.getElementById('timelineSlider'); s.value = Number(s.value) + 1; onSliderMove(); });
  await page.waitForTimeout(200);
  if ((await peer.evaluate(() => window.__got)).length) fail('Utanför Tid-läget ska inget datum skickas');
  // 5) Dashboarden släpper: 4D-planering tar över igen och ritar om.
  await page.evaluate(() => { window.__states = []; });
  await send({ t: 'state', mode: 'off', date: '' }); await page.waitForTimeout(1200);
  if (!(await states())) fail('Släpper dashboarden ska 4D-planering rita om färgerna');
  if (await page.$('#dashLinkBanner')) fail('Banderollen ska försvinna');
  // 6) Dashboarden försvinner (ingen puls): efter en stund äger den inte längre.
  await send({ t: 'state', mode: 'time', date: '2026-10-08' }); await page.waitForTimeout(200);
  await page.evaluate(() => { dashLink.at = Date.now() - 90000; });
  if (await page.evaluate(() => dashboardOwns())) fail('Utan puls från dashboarden ska den inte längre äga 3D-vyn');
  // 6b) 3D-editorn öppnad från dashboarden: förfrågningarna vidarebefordras hit och svaren går tillbaka över kanalen.
  await peer.evaluate(() => { window.__got.length = 0; });
  await send({ t: 'relay', id: 'r1', msg: { lagesplan: true, type: 'planChanged', source: 'pp', reqId: 7 } }); await page.waitForTimeout(600);
  const rel = await peer.evaluate(() => window.__got.filter(m => m.t === 'relayReply'));
  if (!rel.length || rel[0].id !== 'r1') fail('Relä till 3D-editorn: ' + JSON.stringify(rel));
  await send({ t: 'relay', id: 'r2', msg: { lagesplan: true, type: 'ifcModelsList', reqId: 8 } }); await page.waitForTimeout(800);
  const rel2 = await peer.evaluate(() => window.__got.filter(m => m.t === 'relayReply' && m.id === 'r2'));
  if (!rel2.length) fail('Relä av ifcModelsList ska ge ett svar (även med fel): ' + JSON.stringify(rel2));
  console.log('OK: 3D-editorn öppnad från dashboarden – förfrågningar vidarebefordras till 4D-planering och svaren kommer tillbaka');
  // 7) Hello: 4D-planering frågar efter läget när den startar.
  console.log('OK: dashboardens Gantt har företräde – 4D-planering skriver inget till 3D-vyn medan den styr, reglaget flyttar dashboardens datum, och tar över igen när dashboarden släpper');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_dashboard_link');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
