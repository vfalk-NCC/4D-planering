// Funktionstest: UI-skalet efter översynen 2026-09-30 – flikar, Filter ▾ med
// etiketter som styr listan, aktiva filter med ✕, ⋯-menyn, radmenyn,
// åtgärdsraden för markerade rader, formuläret som panel och fast tidslinje.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8971;
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
  { ...base, id: 'c', model_id: 'm1', object_id: '30', object_name: 'Annan', progress: 10 },
]);
put('plan_item_activities.json', [
  { id: 'x1', plan_item_id: 'a1', project_id: PID, name: 'Formning', start_date: '2026-10-01', end_date: '2026-10-04' },
  { id: 'x2', plan_item_id: 'a2', project_id: PID, name: 'Gjutning', start_date: '2026-10-08', end_date: '2026-10-10' },
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
  await page.waitForTimeout(500);
  const names = () => page.evaluate(() => [...document.querySelectorAll('#itemList .item-row:not(.group-member) .item-name')].map(e => e.textContent.trim()).join('|'));

  // 1) Flikar
  if (!(await page.isVisible('section[data-panel-id="items"]')) || await page.isVisible('section[data-panel-id="excel"]')) fail('Planera ska visas först');
  await page.click('#mainTabs [data-tab="tools"]');
  if (!(await page.isVisible('section[data-panel-id="excel"]')) || await page.isVisible('section[data-panel-id="items"]')) fail('Import & verktyg-fliken');
  if (!(await page.isVisible('#timelineSlider'))) fail('tidslinjen ska alltid synas');
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(400);
  if (!(await page.isVisible('section[data-panel-id="excel"]'))) fail('fliken ska kommas ihåg');
  await page.click('#mainTabs [data-tab="plan"]');
  console.log('OK: flikarna växlar block, kommer ihåg valet och tidslinjen syns alltid');

  // 2) Filter ▾ med etiketter styr listan, aktiva filter med ✕
  await page.click('#btnListFilter');
  await page.click('#filterAreaChips .ms-btn');
  await page.check('#filterAreaChips input[data-value="Hus A"]');
  if ((await page.innerText('#filterAreaChips .ms-btn')).trim().replace(/\s*▾$/, '') !== 'Hus A') fail('rullgardinen ska visa valt område');
  await page.waitForTimeout(150);
  await page.check('#hideCompleted'); await page.waitForTimeout(150);
  if ((await page.innerText('#filterCountBadge')).trim() !== '2') fail('räknaren på Filter ska visa 2');
  const chips = await page.innerText('#activeFilterChips');
  if (!chips.includes('Dölj klara') || !chips.includes('Hus A')) fail('aktiva filter ska visas som etiketter, fick ' + chips);
  await page.evaluate(() => { items.find(x => x.id === 'c').area = 'Hus B'; buildFilterOptions(); renderItemList(); });
  if ((await names()).includes('Annan')) fail('områdesfiltret ska styra listan, fick ' + await names());
  await page.click('#activeFilterChips .active-chip:has-text("Hus A") button'); await page.waitForTimeout(150);
  if (!(await names()).includes('Annan')) fail('✕ på etiketten ska ta bort filtret');
  await page.click('#btnClearFilter'); await page.waitForTimeout(150);
  if (await page.isChecked('#hideCompleted') || (await page.innerText('#activeFilterChips')).trim()) fail('Rensa filter ska rensa allt');
  await page.click('#btnListFilter');
  console.log('OK: Filter ▾ styr listan, aktiva filter visas med ✕ och Rensa filter rensar allt');

  // 3) ⋯-menyn stängs vid klick utanför
  await page.click('#btnListMenu');
  if (!(await page.isVisible('#btnRenameValue'))) fail('⋯-menyn ska öppnas');
  await page.mouse.click(5, 5); await page.waitForTimeout(100);
  if (await page.isVisible('#btnRenameValue')) fail('⋯-menyn ska stängas vid klick utanför');
  console.log('OK: ⋯-menyn öppnas och stängs');

  // 4) Åtgärdsrad + radmeny
  if (await page.isVisible('#selectionBar')) fail('åtgärdsraden ska vara dold utan markering');
  await page.locator('#itemList .item-row:not(.group-member)', { hasText: 'Annan' }).first().locator('.item-main').click();
  await page.waitForTimeout(200);
  if (!(await page.isVisible('#selectionBar')) || (await page.innerText('#selectedCount')).trim() !== '1') fail('åtgärdsraden ska visas med 1 vald');
  await page.click('#btnClearSelection'); await page.waitForTimeout(150);
  if (await page.isVisible('#selectionBar')) fail('✕ ska avmarkera');
  const row = page.locator('#itemList .item-row:not(.group-member)', { hasText: 'Annan' }).first();
  if (await row.locator('[data-action="delete"]').isVisible()) fail('radera ska ligga i radmenyn');
  await row.locator('[data-action="row-menu"]').click();
  if (!(await row.locator('[data-action="delete"]').isVisible())) fail('radmenyn ska visa Radera');
  console.log('OK: åtgärdsraden och radmenyn fungerar');

  // 5) Formuläret som panel, Esc stänger, Mer öppnas när det finns data
  await page.keyboard.press('Escape');
  await page.evaluate(() => { items.find(x => x.id === 'c').contractor = null; });
  await row.locator('[data-action="edit"]').click(); await page.waitForTimeout(200);
  if ((await page.innerText('#linkFormTitle')).trim() !== 'Redigera Annan') fail('rubriken ska visa vad som redigeras');
  if (await page.evaluate(() => document.getElementById('formMore').open)) fail('Mer ska vara stängt när fälten är tomma');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  if (await page.isVisible('#linkForm')) fail('Esc ska stänga formuläret');
  await page.evaluate(() => { items.find(x => x.id === 'c').contractor = 'NCC'; });
  await row.locator('[data-action="edit"]').click(); await page.waitForTimeout(200);
  if (!(await page.evaluate(() => document.getElementById('formMore').open))) fail('Mer ska öppnas när det finns en entreprenör');
  console.log('OK: formuläret öppnas som panel med rubrik, Esc stänger och Mer öppnas vid behov');

  // 6) Kopplingsrutan ligger kvar överst när man scrollar
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.setViewportSize({ width: 420, height: 500 });
  await page.evaluate(() => { for (let i = 0; i < 30; i++) items.push({ ...items[0], id: 'z' + i, objectId: 'z' + i, objectName: 'Rad ' + i, groupId: null, sourceKey: null }); renderItemList(); });
  await page.locator('#itemList .item-row:not(.group-member)', { hasText: 'Rad 20' }).first().locator('[data-action="couple"]').click();
  await page.waitForTimeout(200);
  await page.evaluate(() => window.scrollBy(0, 800)); await page.waitForTimeout(200);
  const top = await page.evaluate(() => document.getElementById('coupleModeBanner').getBoundingClientRect().top);
  if (!(await page.isVisible('#coupleModeBanner')) || top < 0 || top > 80) fail('kopplingsrutan ska ligga kvar överst vid scroll, top=' + top);
  await page.click('#btnCancelCoupleMode');
  console.log('OK: kopplingsrutan ligger kvar överst när man scrollar');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK: UI-skalet fungerar');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
