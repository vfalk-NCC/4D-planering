// Temporär (Victor 2026-10-09, t.ex. en mobilkran som står en viss tid): kryssruta på aktiviteten.
// I 3D syns objektet bara från start till och med slut (verkligt avslut om det finns), annars dolt
// eller svagt (inställning). Sparas som temporary i plan_items bara när det är satt.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8958;
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
  await page.waitForTimeout(500);

  // Listan: Temporär syns vid namnet.
  const tags = await page.evaluate(() => [...document.querySelectorAll('#itemList .temp-tag')].length);
  if (tags !== 2) fail('Temporär-taggen ska synas på kranen och stämpen, fick ' + tags);
  console.log('OK: temporär syns i listan');

  // 3D: alfa per objekt på ett datum (sista färgen som sattes för objektet).
  const alphaAt = d => page.evaluate(async d => {
    window.__states = []; document.getElementById('timelineDate').value = d; await applyTimelineColors();
    const out = {}; window.__states.forEach(({ sel, st }) => { if (!st || !st.color || typeof st.color !== 'object') return; sel.modelObjectIds.forEach(m => m.objectRuntimeIds.forEach(id => { out[id] = st.color.a; })); });
    return out;
  }, d);
  let a = await alphaAt('2026-09-25');
  if (a[1] !== 0 || a[2] !== 255) fail('Före start: kranen dold, väggen synlig: ' + JSON.stringify(a));
  a = await alphaAt('2026-10-05');
  if (a[1] !== 255 || a[3] !== 255) fail('Under sin tid: kranen och stämpen synliga: ' + JSON.stringify(a));
  a = await alphaAt('2026-10-10');
  if (a[1] !== 255) fail('Slutdatum räknas med: ' + JSON.stringify(a));
  if (a[3] !== 0) fail('Stämpen togs bort 2026-10-06 (verkligt avslut) – dold efter det: ' + JSON.stringify(a));
  a = await alphaAt('2026-10-11');
  if (a[1] !== 0 || a[2] !== 255) fail('Efter slut: kranen dold, väggen kvar: ' + JSON.stringify(a));
  console.log('OK: temporära objekt syns i 3D bara mellan start och slut');

  // Inställning: svaga i stället för dolda.
  await page.evaluate(() => { settings.tempOffOpacity = 0.15; });
  a = await alphaAt('2026-10-20');
  if (a[1] !== 38) fail('Svaga (15 %) utanför sin tid: ' + JSON.stringify(a));
  await page.evaluate(() => { settings.tempOffOpacity = 0; });
  console.log('OK: inställningen dolda/svaga');

  // Formuläret: kryssa i Temporär på väggen och spara; kryssa ur på kranen.
  await page.evaluate(() => editItemFromList(items.find(i => i.id === 'n'))); await page.waitForTimeout(300);
  if (await page.isChecked('#fTemporary')) fail('Väggen är inte temporär');
  await page.check('#fTemporary'); await page.click('#btnSaveLink'); await page.waitForTimeout(1200);
  if (get('plan_items.json').find(r => r.id === 'n').temporary !== true) fail('Temporär sparades inte');
  await page.evaluate(() => editItemFromList(items.find(i => i.id === 'k'))); await page.waitForTimeout(300);
  if (!(await page.isChecked('#fTemporary'))) fail('Kranen ska vara ikryssad');
  await page.uncheck('#fTemporary'); await page.click('#btnSaveLink'); await page.waitForTimeout(1200);
  const rows = get('plan_items.json');
  if (rows.find(r => r.id === 'k').temporary !== false) fail('Urkryssad ska sparas som false');
  if ('temporary' in rows.find(r => r.id === 's') === false || rows.find(r => r.id === 's').temporary !== true) fail('Stämpen ska vara orörd');
  a = await alphaAt('2026-10-20');
  if (a[1] !== 255 || a[2] !== 0) fail('Efter ändringen: kranen kvar, väggen dold efter sitt slut: ' + JSON.stringify(a));
  console.log('OK: Temporär i formuläret sparas (och kan tas bort)');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_temporary');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
