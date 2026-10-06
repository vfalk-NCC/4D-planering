// Funktionstest: ångra/gör om (Ctrl+Z/Y, ↶ ↷) för status, ny aktivitet,
// radering och Byt namn, ✏️ på grupprubriken, samt kortkommandon.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8973;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PID = 'test-project';

const store = new Map(); let n = 0;
const put = (f, c) => store.set(`projects/${PID}/${f}`, { content: JSON.stringify(c), sha: 's' + (++n) });
const get = f => { const e = store.get(`projects/${PID}/${f}`); return e ? JSON.parse(e.content) : null; };
const base = { project_id: PID, area: 'Hus A', contractor: 'NCC', status: 'planerad', progress: 0, depends_on: [], start_date: '2026-10-01', end_date: '2026-10-10' };
put('plan_items.json', [
  { ...base, id: 'h', group_id: 'g1', model_id: null, object_id: 'excel-h', object_name: 'Gjutning plan 2', progress: 30, activity: 'Formning + Gjutning' },
  { ...base, id: 'a1', group_id: 'g1', model_id: 'm1', object_id: '10', object_name: 'Gjutning plan 2', progress: 30, start_date: '2026-10-01', end_date: '2026-10-04' },
  { ...base, id: 'a2', group_id: 'g1', model_id: 'm1', object_id: '11', object_name: 'Gjutning plan 2', progress: 30, start_date: '2026-10-08', end_date: '2026-10-10' },
  { ...base, id: 'b1', group_id: 'g2', model_id: 'm1', object_id: '20', object_name: 'Gammal data', progress: 20 },
  { ...base, id: 'b2', group_id: 'g2', model_id: 'm1', object_id: '21', object_name: 'Gammal data', progress: 80 },
  { ...base, id: 'c', model_id: 'm1', object_id: '30', object_name: 'Annan', progress: 10, status: 'pagaende' },
]);
put('plan_item_activities.json', [
  { id: 'x1', plan_item_id: 'a1', project_id: PID, name: 'Formning', start_date: '2026-10-01', end_date: '2026-10-04' },
  { id: 'x2', plan_item_id: 'a2', project_id: PID, name: 'Gjutning', start_date: '2026-10-08', end_date: '2026-10-10' },
]);
put('plan_item_comments.json', []);
put('plan_markups.json', [{ id: 'mk1', itemId: 'a2', shape: 'line', pts: [[0,0,0],[1,0,0]] }]);

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
  const row = id => get('plan_items.json').find(r => r.id === id);
  // Statusen räknas mot dagens datum (liveItemStatus) – klockan står fast inom fixturens period.
  await page.clock.setFixedTime(new Date('2026-10-06T10:00:00Z'));
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const wait = ms => page.waitForTimeout(ms);

  // 1) Status → Ctrl+Z → Ctrl+Y
  await page.evaluate(() => setStatusQuick([items.find(x => x.id === 'c')], 'klar'));
  await wait(2200);
  if (row('c').status !== 'klar') fail('statusen ska sparas');
  if (!(await page.isVisible('#undoToast'))) fail('ett meddelande med Ångra ska visas');
  if (await page.isDisabled('#btnUndo')) fail('↶ ska vara aktiv');
  await page.keyboard.press('Control+z'); await wait(1200);
  if (row('c').status !== 'pagaende') fail('Ctrl+Z ska ångra statusen, fick ' + row('c').status);
  await page.keyboard.press('Control+y'); await wait(1200);
  if (row('c').status !== 'klar') fail('Ctrl+Y ska göra om');
  await page.click('#btnUndo'); await wait(1200);
  if (row('c').status !== 'pagaende') fail('↶ ska ångra');
  console.log('OK: ångra/gör om av status med Ctrl+Z, Ctrl+Y och ↶');

  // 2) Ny aktivitet med kortkommando N → ångra tar bort den
  await page.mouse.click(5, 300);
  await page.keyboard.press('n'); await wait(200);
  if (!(await page.isVisible('#linkForm'))) fail('N ska öppna Ny aktivitet');
  await page.fill('#fName', 'Temp'); await page.click('#btnSaveLink'); await wait(2200);
  if (!get('plan_items.json').some(r => r.object_name === 'Temp')) fail('ny aktivitet ska sparas');
  await page.keyboard.press('Control+z'); await wait(1500);
  if (get('plan_items.json').some(r => r.object_name === 'Temp')) fail('ångra ska ta bort den nya aktiviteten');
  console.log('OK: N öppnar Ny aktivitet och ångra tar bort den igen');

  // 3) Radera aktivitet med delaktiviteter och markering → ångra återställer allt
  await page.evaluate(() => { window.confirm = () => true; });
  await page.evaluate(() => deleteActivityConfirmed(items.find(x => x.id === 'a1')));
  await wait(3000);
  if (row('a1') || row('a2') || row('h')) fail('aktiviteten ska vara raderad');
  if ((get('plan_markups.json') || []).some(m => m.id === 'mk1')) fail('markeringen ska raderas med aktiviteten');
  await page.keyboard.press('Control+z'); await wait(2500);
  if (!row('a1') || !row('a2') || !row('h')) fail('ångra ska återställa alla objekt i aktiviteten');
  const subs = get('plan_item_activities.json').filter(r => ['a1', 'a2'].includes(r.plan_item_id)).map(r => r.name).sort().join(',');
  if (subs !== 'Formning,Gjutning') fail('delaktiviteterna ska komma tillbaka, fick ' + subs);
  if (!(get('plan_markups.json') || []).some(m => m.id === 'mk1' && m.itemId === 'a2')) fail('den manuella markeringen ska komma tillbaka');
  console.log('OK: en raderad aktivitet kommer tillbaka med delaktiviteter');

  // 4) ✏️ på grupprubriken byter namn på området för alla, ångra återställer
  await page.locator('.group-header [data-action="rename-group"]').first().click(); await wait(200);
  if ((await page.inputValue('#renameOldValue')) !== 'Hus A') fail('dialogen ska ha området ifyllt');
  await page.fill('#renameNewValue', 'Hus A1');
  await page.click('#btnDoRename'); await wait(2500);
  if (get('plan_items.json').some(r => r.area === 'Hus A')) fail('alla aktiviteter i området ska få nya namnet');
  await page.keyboard.press('Control+z'); await wait(2000);
  if (get('plan_items.json').some(r => r.area === 'Hus A1')) fail('ångra ska återställa områdesnamnet');
  console.log('OK: ✏️ på grupprubriken byter namn på hela området, och det går att ångra');

  // 5) Kortkommandon: , . och ?, samt byta tangent
  const d0 = await page.inputValue('#timelineDate');
  await page.mouse.click(5, 300);
  await page.keyboard.press('.'); await wait(100);
  const d1 = await page.inputValue('#timelineDate');
  if (new Date(d1) - new Date(d0) !== 86400000) fail(`. ska flytta en dag framåt (${d0} → ${d1})`);
  await page.keyboard.press('?'); await wait(150);
  if (!(await page.isVisible('#planKeysDialog'))) fail('? ska visa kortkommandona');
  await page.click('#planKeysList .kr[data-id="newActivity"] .kb');
  await page.keyboard.press('j'); await wait(100);
  if (!(await page.innerText('#planKeysList .kr[data-id="newActivity"] .kb')).includes('J')) fail('ny tangent ska sparas');
  await page.keyboard.press('Escape'); await wait(100);
  await page.keyboard.press('j'); await wait(200);
  if (!(await page.isVisible('#linkForm'))) fail('den nya tangenten ska fungera');
  await page.keyboard.press('Escape');
  console.log('OK: kortkommandon fungerar och går att ändra');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK: ångra, gruppnamn och kortkommandon fungerar');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
