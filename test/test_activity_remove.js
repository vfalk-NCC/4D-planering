// Funktionstest: en aktivitet raderas aldrig utan två frågor (och tar en
// säkerhetskopia först), objekt kan tas bort ur en aktivitet med ✂ – och
// när det sista objektet tas bort blir aktiviteten kvar som "Ej kopplad"
// med sina delaktiviteter och manuella markeringar.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8955;
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
put('plan_markups.json', [{ id: 'mk', itemId: 'a2', shape: 'line', pts: [[0, 0, 0], [1, 0, 0]] }]);

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
  const idList = () => get('plan_items.json').map(r => r.id);
  const ids = () => idList().sort().join(',');
  const backups = () => (get('backups/index.json') || []).length;
  const row = name => page.locator('#itemList .item-row:not(.group-member)', { hasText: name }).first();
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // 1) Radera aktivitet: två frågor
  answers = [true, false];
  await row('Pelare B').locator('[data-action="delete"]').click(); await page.waitForTimeout(400);
  if (asked.length !== 2 || !asked[1].includes('helt säker')) fail('radering ska kräva två frågor, fick ' + JSON.stringify(asked));
  if (!idList().includes('b')) fail('nej på andra frågan ska avbryta raderingen');
  answers = [true, true]; asked.length = 0;
  await row('Pelare B').locator('[data-action="delete"]').click(); await page.waitForTimeout(1200);
  if (idList().includes('b')) fail('två ja ska radera aktiviteten');
  if (backups() !== 1) fail('en säkerhetskopia ska tas innan aktiviteten raderas, fick ' + backups());
  console.log('OK: en aktivitet raderas bara efter två frågor, och en säkerhetskopia tas först');

  // 2) ✂: ta bort ett av två objekt – aktiviteten finns kvar
  await row('Gjutning plan 2').locator('[data-action="remove-objs"]').click(); await page.waitForTimeout(400);
  if (!(await page.isVisible('#removeObjDialog'))) fail('✂ ska öppna dialogen');
  if ((await page.locator('#removeObjList input').count()) !== 2) fail('dialogen ska lista aktivitetens två objekt');
  await page.evaluate(() => { window.__sel = [{ modelId: 'm1', objectRuntimeIds: [10] }]; });
  await page.click('#btnRemoveObjFromSel'); await page.waitForTimeout(200);
  if ((await page.innerText('#btnRemoveObjOk')) !== 'Ta bort (1)') fail('"Från markeringen i 3D" ska kryssa i objektet som är markerat');
  asked.length = 0;
  await page.click('#btnRemoveObjOk'); await page.waitForTimeout(1200);
  if (asked.length) fail('dialogen ska inte fråga igen, fick ' + JSON.stringify(asked));
  if (ids() !== 'a2,c,c2') fail('a1 ska vara borta och a2 kvar, fick ' + ids());
  console.log('OK: ✂ tar bort valda objekt ur aktiviteten (lista eller markering i 3D)');

  // 3) ✂ på sista objektet: aktiviteten blir kvar som ej kopplad
  await row('Gjutning plan 2').locator('[data-action="remove-objs"]').click(); await page.waitForTimeout(400);
  await page.click('#btnRemoveObjAll'); await page.click('#btnRemoveObjOk'); await page.waitForTimeout(1200);
  const a2 = get('plan_items.json').find(r => r.id === 'a2');
  if (!a2 || a2.model_id !== null || !a2.object_id.startsWith('excel-')) fail('sista objektet ska bli en okopplad aktivitet, fick ' + JSON.stringify(a2));
  const acts = get('plan_item_activities.json').filter(r => r.plan_item_id === 'a2').map(r => r.name).sort().join(',');
  if (acts !== 'Formning,Gjutning') fail('delaktiviteterna ska finnas kvar, fick ' + acts);
  if (get('plan_markups.json')[0].itemId !== 'a2') fail('markeringen ska finnas kvar på aktiviteten');
  const tag = await row('Gjutning plan 2').innerText();
  if (!tag.includes('Manuell markering') && !tag.includes('Ej kopplad')) fail('aktiviteten ska synas som ej kopplad eller med sin markering, fick ' + tag);
  console.log('OK: tas det sista objektet bort blir aktiviteten kvar som ej kopplad med delaktiviteter och markeringar');

  // 4) ✂ på en objektrad i en utfälld aktivitet
  await row('Stomme').locator('[data-action="toggle-members"]').click(); await page.waitForTimeout(200);
  answers = [true]; asked.length = 0;
  await page.locator('#itemList .item-row.group-member').first().locator('[data-action="delete"]').click(); await page.waitForTimeout(1200);
  if (asked.length !== 1 || !asked[0].includes('Aktiviteten finns kvar')) fail('en objektrad ska fråga en gång om att ta bort objektet, fick ' + JSON.stringify(asked));
  if (idList().includes('c') === idList().includes('c2')) fail('ett av Stommes två objekt ska vara borttaget, fick ' + ids());
  console.log('OK: ✂ på en objektrad tar bort just det objektet');

  // 5) Radera markerade som omfattar en hel aktivitet: extra fråga
  const left = idList().includes('c2') ? 'c2' : 'c';
  await page.evaluate(id => { const it = items.find(x => x.id === id); selectedItemKeys.add(it.objectId); renderItemList(); }, left);
  answers = [true, false]; asked.length = 0;
  await page.click('#btnDeleteSelected'); await page.waitForTimeout(500);
  if (asked.length !== 2 || !asked[1].includes('hel aktivitet')) fail('Radera markerade ska fråga extra när en hel aktivitet omfattas, fick ' + JSON.stringify(asked));
  if (!idList().includes(left)) fail('nej ska avbryta');
  console.log('OK: "Radera markerade" frågar extra när hela aktiviteter omfattas');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK: radering av aktiviteter och borttagning av objekt fungerar');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
