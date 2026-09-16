// Funktionstest: "Byt namn"-funktionen (#btnRenameValue) och versionsetiketten
// i headern (#versionBadge).
//  1) Versionsetiketten bredvid "4D-planering" visar "Version <APP_VERSION>".
//  2) "Byt namn"-dialogen listar bara faktiskt förekommande värden för det
//     valda fältet (Område/Aktivitet/Entreprenör), och räknaren visar hur
//     många objekt som matchar det valda värdet.
//  3) Att byta namn uppdaterar ALLA objekt med det gamla värdet till det
//     nya - momentant i listan (optimistiskt), och korrekt i bakgrunden
//     (en enda PUT mot plan_items.json) - UTAN att röra objekt som hade
//     ett annat värde.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8949;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PROJECT_ID = 'test-project';

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(DOCS_DIR, req.url === '/' ? 'index.html' : req.url);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

const TEST_ITEMS_ROWS = [
  {
    id: 'row-1', project_id: PROJECT_ID, model_id: 'model-1', object_id: '10',
    object_name: 'Pelare S1', area: 'Sikthall', activity: 'Gjutning', contractor: 'NCC',
    status: 'planerad', start_date: null, end_date: null, progress: 0, updated_at: '2026-01-01T00:00:00Z'
  },
  {
    id: 'row-2', project_id: PROJECT_ID, model_id: 'model-1', object_id: '20',
    object_name: 'Pelare S2', area: 'Sikthall', activity: 'Gjutning', contractor: 'NCC',
    status: 'planerad', start_date: null, end_date: null, progress: 0, updated_at: '2026-01-01T00:00:00Z'
  },
  {
    id: 'row-3', project_id: PROJECT_ID, model_id: 'model-1', object_id: '30',
    object_name: 'Pelare B1', area: 'Hus B', activity: 'Gjutning', contractor: 'NCC',
    status: 'planerad', start_date: null, end_date: null, progress: 0, updated_at: '2026-01-01T00:00:00Z'
  }
];

const store = new Map(); // path -> { content, sha }
store.set(`projects/${PROJECT_ID}/plan_items.json`, { content: TEST_ITEMS_ROWS, sha: 'seed-sha' });
function shaFor(content) {
  return crypto.createHash('sha1').update(JSON.stringify(content)).digest('hex') + Math.random().toString(16).slice(2, 6);
}

async function run() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 480, height: 1200 } });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !/Failed to load resource.*404/.test(msg.text())) consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));
  const alerts = [];
  page.on('dialog', async (dialog) => { alerts.push(dialog.message()); await dialog.accept(); });

  await page.route('https://components.connect.trimble.com/**', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.TrimbleConnectWorkspace = { connect: function() { return Promise.resolve({
      project: { getProject: function(){ return Promise.resolve({ id: '${PROJECT_ID}' }); } },
      viewer: {
        getSelection: function() { return Promise.resolve([]); },
        convertToObjectIds: function() { return Promise.resolve([]); },
        setSelection: function() { return Promise.resolve(); }
      }
    }); } };`
  }));
  await page.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));

  let putCount = 0;
  await page.route('https://api.github.com/repos/vfalk-NCC/4D-data/contents/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const filePath = decodeURIComponent(url.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));

    if (req.method() === 'GET') {
      const entry = store.get(filePath);
      if (!entry) { route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) }); return; }
      const b64 = Buffer.from(JSON.stringify(entry.content)).toString('base64');
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: b64, sha: entry.sha }) });
      return;
    }
    if (req.method() === 'PUT') {
      if (filePath === `projects/${PROJECT_ID}/plan_items.json`) putCount++;
      const body = JSON.parse(req.postData() || '{}');
      const existing = store.get(filePath);
      if (existing && existing.sha !== body.sha) {
        route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'conflict' }) });
        return;
      }
      const content = JSON.parse(Buffer.from(body.content, 'base64').toString('utf-8'));
      const newSha = shaFor(content);
      store.set(filePath, { content, sha: newSha });
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: newSha } }) });
      return;
    }
    route.fulfill({ status: 405, body: 'method not allowed' });
  });

  await page.addInitScript(() => {
    window.localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 'fake-token-for-test' }));
    window.localStorage.setItem('4dplan-unlocked', '1');
  });

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const itemCountText = await page.locator('#itemCount').innerText();
  if (itemCountText.trim() !== '3/3') throw new Error('Förväntade 3/3 laddade objekt, fick: ' + itemCountText);

  // ---- 1) Versionsetiketten i headern.
  const versionText = await page.locator('#versionBadge').innerText();
  if (!/^Version \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(versionText.trim())) {
    throw new Error('Versionsetiketten ser inte ut som "Version ÅÅÅÅ-MM-DD TT:MM": ' + JSON.stringify(versionText));
  }
  console.log('OK: versionsetiketten i headern visar "Version <datum/klockslag>"');

  // ---- 2) Öppna "Byt namn", välj fältet Område, kontrollera alternativ + räknare.
  await page.locator('#btnRenameValue').click();
  await page.waitForTimeout(150);
  const dialogVisible = await page.locator('#renameDialog').isHidden();
  if (dialogVisible) throw new Error('renameDialog borde synas efter klick på "Byt namn"');

  const fieldOptions = await page.locator('#renameField option').allTextContents();
  if (JSON.stringify(fieldOptions) !== JSON.stringify(['Område', 'Aktivitet', 'Entreprenör'])) {
    throw new Error('Fel fältalternativ i renameField: ' + JSON.stringify(fieldOptions));
  }

  const oldValueOptions = await page.locator('#renameOldValue option').allTextContents();
  if (JSON.stringify(oldValueOptions) !== JSON.stringify(['Hus B', 'Sikthall'])) {
    throw new Error('renameOldValue ska bara lista faktiskt förekommande områden, fick: ' + JSON.stringify(oldValueOptions));
  }

  await page.selectOption('#renameOldValue', 'Sikthall');
  await page.waitForTimeout(100);
  const countText = await page.locator('#renameCount').innerText();
  if (countText.trim() !== '2') throw new Error('Förväntade renameCount=2 (två objekt med området Sikthall), fick: ' + countText);
  console.log('OK: "Byt namn"-dialogen listar bara befintliga värden och räknar rätt antal träffar');

  // ---- 3) Byt namn "Sikthall" -> "741 - Sikthall".
  await page.locator('#renameNewValue').fill('741 - Sikthall');
  await page.locator('#btnDoRename').click();

  // Direkt (optimistiskt): dialogen stängs och listan visar redan det nya namnet.
  await page.waitForTimeout(50);
  const dialogHiddenImmediately = await page.evaluate(() => document.getElementById('renameDialog').classList.contains('hidden'));
  if (!dialogHiddenImmediately) throw new Error('renameDialog skulle stängas direkt efter "Byt namn"');
  const listTextImmediately = await page.locator('#itemList').innerText();
  if (!listTextImmediately.includes('741 - Sikthall')) {
    throw new Error('Listan skulle visa det nya områdesnamnet direkt (optimistiskt): ' + listTextImmediately);
  }

  await page.waitForTimeout(500);
  if (putCount !== 1) throw new Error('Förväntade exakt 1 PUT mot plan_items.json för namnbytet, fick ' + putCount);

  const finalRows = store.get(`projects/${PROJECT_ID}/plan_items.json`).content;
  const renamed = finalRows.filter(r => r.area === '741 - Sikthall');
  const untouched = finalRows.filter(r => r.object_id === '30');
  if (renamed.length !== 2) throw new Error('Förväntade 2 rader med det nya områdesnamnet i den sparade filen, fick ' + renamed.length);
  if (untouched.length !== 1 || untouched[0].area !== 'Hus B') {
    throw new Error('Objektet i "Hus B" skulle lämnas orört av namnbytet: ' + JSON.stringify(untouched));
  }
  // Övriga fält (namn, aktivitet, entreprenör, status m.m.) ska vara oförändrade.
  const row1After = finalRows.find(r => r.id === 'row-1');
  if (row1After.object_name !== 'Pelare S1' || row1After.activity !== 'Gjutning' || row1After.contractor !== 'NCC') {
    throw new Error('Namnbytet rörde felaktigt andra fält på raden: ' + JSON.stringify(row1After));
  }
  console.log('OK: "Byt namn" uppdaterar alla matchande objekt (och bara dem) både i UI:t direkt och i bakgrundssparningen');

  if (alerts.length > 0) throw new Error('Oväntad alert() under namnbytet: ' + alerts.join(' | '));

  await browser.close();
  server.close();

  console.log('Konsolfel:', consoleErrors);
  if (consoleErrors.length > 0) throw new Error('Konsolfel upptäcktes: ' + consoleErrors.join(' | '));
  console.log('OK: versionsetikett + "Byt namn"-funktionen fungerar korrekt');
}

run().catch(e => { console.error(e); process.exit(1); });
