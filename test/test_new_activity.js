// Funktionstest: "＋ Ny aktivitet" skapar en okopplad egen aktivitet, "⧉ Duplicera"
// kopierar med delaktiviteter, egna aktiviteter kan kopplas senare och rörs
// aldrig av 4-veckorsimporten.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8959;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PID = 'test-project';

const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const get = f => { const e = store.get(`projects/${PID}/${f}`); return e ? JSON.parse(e.content) : null; };
const base = { project_id: PID, area: 'Hus A', contractor: 'NCC', status: 'planerad', progress: 0, depends_on: [], start_date: '2026-10-01', end_date: '2026-10-10' };
put('plan_items.json', [
  { ...base, id: 'a1', group_id: 'g1', model_id: 'm1', object_id: '10', object_name: 'Gjutning plan 2', activity: 'Gjutning' },
  { ...base, id: 'a2', group_id: 'g1', model_id: 'm1', object_id: '11', object_name: 'Gjutning plan 2', activity: 'Gjutning' },
  { ...base, id: 'b', model_id: 'm1', object_id: '20', object_name: 'Pelare B', activity: 'Montage' },
  { ...base, id: 'c', group_id: 'g3', model_id: 'm1', object_id: '30', object_name: 'Stomme', activity: 'Stomme' },
  { ...base, id: 'c2', group_id: 'g3', model_id: 'm1', object_id: '31', object_name: 'Stomme', activity: 'Stomme' },
]);
put('plan_item_activities.json', [
  { id: 'x1', plan_item_id: 'a1', project_id: PID, name: 'Formning', start_date: '2026-10-01', end_date: '2026-10-04' },
  { id: 'x2', plan_item_id: 'a2', project_id: PID, name: 'Formning', start_date: '2026-10-01', end_date: '2026-10-04' },
  { id: 'x3', plan_item_id: 'a2', project_id: PID, name: 'Gjutning', start_date: '2026-10-08', end_date: '2026-10-10' },
]);
put('plan_item_comments.json', []);
put('plan_markups.json', []);

(async () => {
  const server = http.createServer((req, res) => fs.readFile(path.join(DOCS_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(req.url.split('?')[0])] || 'application/octet-stream' }); res.end(data);
  })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 520, height: 1600 } });
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
  const all = () => get('plan_items.json');
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // 1) Ny aktivitet utan koppling
  await page.click('#btnNewActivity'); await page.waitForTimeout(200);
  if (await page.isVisible('#btnDuplicateActivity')) fail('Duplicera ska inte visas för en ny aktivitet');
  if (!(await page.isVisible('#linkForm')) || !(await page.isVisible('#newActivityNote'))) fail('formuläret ska öppnas med notisen');
  answers = [true]; asked.length = 0;
  await page.click('#btnSaveLink'); await page.waitForTimeout(200);
  if (!asked.some(a => a.includes('namn'))) fail('namn ska krävas');
  await page.fill('#fName', 'Schakt etapp 1'); await page.fill('#fArea', 'Hus A'); await page.fill('#fActivity', 'Schakt');
  await page.fill('#fStart', '2026-11-02'); await page.fill('#fEnd', '2026-11-06');
  await page.click('#btnAddSubActivity').catch(() => {});
  await page.evaluate(() => { subActivityRows = [{ name: 'Grovschakt', start: '2026-11-02', end: '2026-11-04', hours: '', members: null }, { name: 'Finschakt', start: '2026-11-05', end: '2026-11-06', hours: '', members: null }]; renderSubActivities(); });
  await page.click('#btnSaveLink'); await page.waitForTimeout(1500);
  const na = all().find(r => r.object_name === 'Schakt etapp 1');
  if (!na || na.model_id !== null || !na.object_id.startsWith('manuell-') || na.origin !== 'manuell' || na.source_key) fail('ny aktivitet ska sparas okopplad och egen, fick ' + JSON.stringify(na));
  const subs = get('plan_item_activities.json').filter(r => r.plan_item_id === na.id).map(r => r.name).sort().join(',');
  if (subs !== 'Finschakt,Grovschakt') fail('delaktiviteterna ska sparas, fick ' + subs);
  const txt = await page.locator('#itemList .item-row:not(.group-member)', { hasText: 'Schakt etapp 1' }).first().innerText();
  if (!txt.includes('Ej kopplad')) fail('ska synas som Ej kopplad');
  console.log('OK: ＋ Ny aktivitet skapar en okopplad egen aktivitet med delaktiviteter');

  // 2) Redigera behåller origin
  await page.locator('#itemList .item-row:not(.group-member)', { hasText: 'Schakt etapp 1' }).first().locator('[data-action="edit"]').click();
  await page.waitForTimeout(200);
  if (!(await page.innerText('#newActivityNote')).includes('Egen aktivitet')) fail('redigering av egen aktivitet ska visa notisen');
  await page.fill('#fContractor', 'NCC Mark'); await page.click('#btnSaveLink'); await page.waitForTimeout(1500);
  const e = all().find(r => r.id === na.id);
  if (e.origin !== 'manuell' || e.contractor !== 'NCC Mark' || all().filter(r => r.object_name === 'Schakt etapp 1').length !== 1) fail('redigering ska behålla origin och inte skapa ny, fick ' + JSON.stringify(e));
  console.log('OK: redigering behåller den egna aktiviteten');

  // 3) Duplicera en kopplad aktivitet med delaktiviteter
  await page.locator('#itemList .item-row:not(.group-member)', { hasText: 'Gjutning plan 2' }).first().locator('[data-action="edit"]').click();
  await page.waitForTimeout(200);
  if (!(await page.isVisible('#btnDuplicateActivity'))) fail('⧉ Duplicera ska finnas i formuläret vid redigering');
  await page.click('#btnDuplicateActivity');
  await page.waitForTimeout(300);
  if ((await page.inputValue('#fName')) !== 'Gjutning plan 2 (kopia)') fail('kopian ska få namnet (kopia)');
  answers = [true]; asked.length = 0;
  await page.fill('#fName', 'Gjutning plan 3'); await page.click('#btnSaveLink'); await page.waitForTimeout(1500);
  const d = all().find(r => r.object_name === 'Gjutning plan 3');
  if (!d || d.model_id !== null || d.origin !== 'manuell' || d.group_id === 'g1' || d.progress !== 0) fail('kopian ska vara en ny okopplad egen aktivitet, fick ' + JSON.stringify(d));
  const dsubs = get('plan_item_activities.json').filter(r => r.plan_item_id === d.id).map(r => r.name).sort().join(',');
  if (dsubs !== 'Formning,Gjutning') fail('kopian ska få samma delaktiviteter, fick ' + dsubs);
  if (all().filter(r => r.group_id === 'g1').length !== 2) fail('originalet ska vara orört');
  console.log('OK: ⧉ Duplicera skapar en okopplad kopia med samma delaktiviteter');

  // 3b) Koppla den egna aktiviteten i efterhand
  await page.evaluate(id => coupleItemToModelObjects(items.find(x => x.id === id), [{ modelId: 'm1', objectId: '77' }]), na.id);
  await page.waitForTimeout(1500);
  const c = all().find(r => r.id === na.id);
  if (c.model_id !== 'm1' || c.object_id !== '77' || c.origin !== 'manuell' || !c.group_id) fail('kopplingen i efterhand ska göra den egna aktiviteten kopplad, fick ' + JSON.stringify(c));
  console.log('OK: en egen aktivitet kan kopplas i efterhand');

  // 4) Importen matchar aldrig egna aktiviteter
  const matched = await page.evaluate(id => { const it = items.find(x => x.id === id); it.sourceKey = 'X|Y'; const diff = buildPlanImportDiff([{ sourceKey: 'X|Y', objectName: 'Z', subActivities: [] }]); it.sourceKey = null; return diff.toUpdate.length; }, na.id);
  if (matched !== 0) fail('importen ska inte matcha en egen aktivitet');
  console.log('OK: 4-veckorsimporten rör aldrig egna aktiviteter');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK: nya aktiviteter utan koppling och duplicering fungerar');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
