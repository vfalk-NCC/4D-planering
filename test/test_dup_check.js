// Dubblettkontroll (Victors önskemål 2026-10-01): samma 3D-objekt kopplat
// flera gånger till samma aktivitet visas ovanför listan, kan granskas (visa
// i 3D/listan, välja vilken som behålls) och rensas efter en säkerhetskopia.
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
  // C11: objekt 40 kopplat tre gånger (felet), objekt 41 en gång.
  { ...base, id: 'k1', group_id: 'G11', model_id: 'm1', object_id: '40', object_name: 'C11', updated_at: '2026-10-01T08:00:00Z' },
  { ...base, id: 'k2', group_id: 'G11', model_id: 'm1', object_id: '40', object_name: 'C11', updated_at: '2026-10-01T08:00:01Z' },
  { ...base, id: 'k3', group_id: 'G11', model_id: 'm1', object_id: '40', object_name: 'C11', updated_at: '2026-10-01T08:00:02Z' },
  { ...base, id: 'k4', group_id: 'G11', model_id: 'm1', object_id: '41', object_name: 'C11' },
  // C12: objekt 50 två gånger, där den SENARE har en kommentar (ska behållas som standard).
  { ...base, id: 'm1r', group_id: 'G12', model_id: 'm1', object_id: '50', object_name: 'C12', updated_at: '2026-10-01T08:00:00Z' },
  { ...base, id: 'm2r', group_id: 'G12', model_id: 'm1', object_id: '50', object_name: 'C12', updated_at: '2026-10-01T09:00:00Z' },
  // Samma objekt i två OLIKA aktiviteter är ingen dubblett här.
  { ...base, id: 'o1', group_id: 'GA', model_id: 'm1', object_id: '60', object_name: 'A' },
  { ...base, id: 'o2', group_id: 'GB', model_id: 'm1', object_id: '60', object_name: 'B' },
]);
put('plan_item_activities.json', []);
put('plan_item_comments.json', [{ id: 'cm', plan_item_id: 'm2r', project_id: PID, text: 'viktig', author: 'V', created_at: '2026-10-01T09:00:00Z' }]);

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
        convertToObjectRuntimeIds: (m, ids) => Promise.resolve(ids.map(Number)), setSelection: (s) => { window.__lastSel = s; return Promise.resolve(); },
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
  await page.waitForTimeout(700);
  const banner = await page.innerText('#dupBanner');
  if (!banner.includes('3 dubbletter') || !banner.includes('2 objekt')) fail('Raden ovanför listan ska visa 3 dubbletter på 2 objekt, fick ' + banner);
  console.log('OK: dubbletterna syns ovanför listan (olika aktiviteter räknas inte)');

  await page.click('#btnDupReview'); await page.waitForTimeout(200);
  const groups = await page.locator('.dup-group').count();
  if (groups !== 2) fail('Två grupper i granskningen, fick ' + groups);
  const keepC12 = await page.evaluate(() => [...document.querySelectorAll('.dup-group')].find(g => g.textContent.includes('C12')).querySelector('.dup-row.keep').textContent);
  if (!keepC12.includes('1 kommentar')) fail('Som standard ska kopplingen med kommentaren behållas, fick ' + keepC12);
  // Klick på objektet: markeras i 3D
  await page.locator('.dup-group', { hasText: 'C11' }).locator('.dup-show').click(); await page.waitForTimeout(400);
  const sel = await page.evaluate(() => window.__lastSel);
  if (!sel || !JSON.stringify(sel).includes('40')) fail('Klick på objektet ska markera det i 3D, fick ' + JSON.stringify(sel));
  if (!(await page.isVisible('#dupDialog'))) fail('Dialogen ska ligga kvar efter Visa');
  console.log('OK: klick på ett objekt markerar det i 3D, och kopplingen med mest data behålls som standard');

  // Välj att behålla k3 för C11, och hoppa över C12 helt.
  await page.locator('.dup-group', { hasText: 'C11' }).locator('input[value="k3"]').check(); await page.waitForTimeout(100);
  await page.locator('.dup-group', { hasText: 'C12' }).locator('[data-inc]').uncheck(); await page.waitForTimeout(100);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT });
  if ((await page.innerText('#btnDupClean')).trim() !== 'Rensa (2 kopplingar tas bort)') fail('Knappen ska visa 2 kopplingar, fick ' + await page.innerText('#btnDupClean'));
  await page.click('#btnDupClean'); await page.waitForTimeout(2000);
  const ids = get('plan_items.json').map(r => r.id).sort().join(',');
  if (ids !== 'k3,k4,m1r,m2r,o1,o2') fail('Fel rader kvar: ' + ids);
  const backups = [...store.keys()].filter(k => k.includes('backup'));
  if (!backups.length) fail('En säkerhetskopia ska tas före rensningen');
  if (!(await page.innerText('#dupMsg')).includes('2 dubblettkopplingar borttagna')) fail('Kvittens saknas: ' + await page.innerText('#dupMsg'));
  const banner2 = await page.innerText('#dupBanner');
  if (!banner2.includes('1 dubblett')) fail('Kvar: 1 dubblett (C12, som hoppades över), fick ' + banner2);
  console.log('OK: rensningen tar bara bort valda kopplingar, behåller den valda, tar säkerhetskopia först');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
