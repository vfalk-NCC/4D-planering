// Funktionstest: statusgenväg på badgen, säkerhetskopia + historik +
// återställning, nollställning med dubbel bekräftelse, "Tänd kopplade
// modeller" och att Redigera hoppar till formuläret och tillbaka.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8951;
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
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    const body = JSON.parse(req.postData()); if (e && body.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' });
    const sha = 's' + (++n); store.set(f, { content: Buffer.from(body.content, 'base64').toString(), sha });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) });
  });
  const fail = m => { throw new Error(m); };
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // 1) Statusgenväg
  await page.locator('#itemList .item-row[data-item-id="a"] [data-action="status"]').click();
  await page.locator('.status-menu [data-status="klar"]').click();
  await page.waitForTimeout(800);
  const a = get('plan_items.json').find(r => r.id === 'a');
  if (a.status !== 'klar') fail('statusgenvägen ska spara status klar, fick ' + a.status);
  if (JSON.stringify(get('plan_items.json').find(r => r.id === 'b').depends_on) !== '["a"]') fail('beroenden får inte försvinna');
  console.log('OK: klick på statusbadgen ger en meny och sparar ny status');

  // 2) Tänd kopplade modeller
  await page.click('#btnLoadCoupledModels'); await page.waitForTimeout(200);
  const toggled = await page.evaluate(() => window.__toggled);
  if (JSON.stringify(toggled) !== '[["m2",true]]') fail('bara den släckta modellen m2 ska tändas, fick ' + JSON.stringify(toggled));
  console.log('OK: "Tänd kopplade modeller" tänder de kopplade modeller som är släckta');

  // 3) Redigera hoppar till formuläret och tillbaka efter Spara
  await page.locator('#itemList .item-row[data-item-id="b"] [data-action="edit"]').click();
  await page.waitForTimeout(600);
  // Formuläret öppnas nu som en panel ovanpå listan (UI-översynen 2026-09-30).
  const formTop = await page.evaluate(() => document.querySelector('#linkForm .form-sheet-box').getBoundingClientRect().top);
  if (!(await page.isVisible('#linkForm')) || Math.abs(formTop) > 40) fail('formuläret ska synas som panel överst, top=' + formTop);
  await page.click('#btnSaveLink'); await page.waitForTimeout(700);
  const flashed = await page.evaluate(() => { const r = document.querySelector('#itemList .item-row[data-item-id="b"]'); const b = r.getBoundingClientRect(); return { flash: r.classList.contains('flash-edit'), visible: b.top >= 0 && b.bottom <= innerHeight }; });
  if (!flashed.flash || !flashed.visible) fail('efter Spara ska listan hoppa tillbaka till raden: ' + JSON.stringify(flashed));
  console.log('OK: pennan hoppar till "Koppla markering" och Spara hoppar tillbaka till raden');

  // 4) Säkerhetskopia + historik
  await page.click('#btnSettings'); await page.click('#btnBackupNow'); await page.waitForTimeout(800);
  const idx = get('backups/index.json');
  if (!idx || idx.length !== 1 || idx[0].counts.items !== 2) fail('förväntade en säkerhetskopia med 2 objekt, fick ' + JSON.stringify(idx));
  if (await page.locator('#backupList .backup-row').count() !== 1) fail('historiken ska visa kopian');
  console.log('OK: manuell säkerhetskopia syns i historiken i inställningarna');

  // 5) Nollställ (dubbel bekräftelse) - tar kopia först
  await page.locator('.danger-zone summary').click();
  await page.click('#btnResetPlanning'); await page.waitForTimeout(1500);
  if (get('plan_items.json').length !== 0 || get('plan_item_comments.json').length !== 0) fail('nollställningen ska tömma planeringen');
  if (!dialogs.some(d => /Nollställa HELA/.test(d)) || !dialogs.some(d => /NOLLSTÄLL/.test(d))) fail('två bekräftelser krävs');
  if (get('backups/index.json').length !== 2) fail('en säkerhetskopia ska tas före nollställningen');
  if (await page.locator('#itemList .item-row').count() !== 0) fail('listan ska vara tom efter nollställning');
  console.log('OK: nollställning kräver två bekräftelser, tar säkerhetskopia först och tömmer planeringen');

  // 6) Återställ till den manuella kopian
  await page.waitForTimeout(300);
  const rows = page.locator('#backupList .backup-row');
  await rows.filter({ hasText: 'Manuell' }).locator('[data-action="restore-backup"]').click();
  await page.waitForTimeout(2000);
  const restored = get('plan_items.json');
  if (restored.length !== 2 || restored.find(r => r.id === 'a').status !== 'klar') fail('återställningen ska ge tillbaka 2 objekt med status klar, fick ' + JSON.stringify(restored));
  if (get('plan_item_comments.json').length !== 1) fail('kommentarerna ska återställas');
  if (await page.locator('#itemList .item-row').count() !== 2) fail('listan ska visa de återställda objekten');
  console.log('OK: återställning från historiken ger tillbaka planeringen (och tar en ny kopia först)');

  await browser.close(); server.close();
  if (errors.length) fail('Konsolfel: ' + errors.join(' | '));
  console.log('OK: säkerhetskopior, nollställning, statusgenväg, modeller och redigeringshopp fungerar');
})().catch(e => { console.error(e); process.exit(1); });
