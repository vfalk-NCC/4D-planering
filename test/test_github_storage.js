// Funktionstest: verifierar att 4D-planering pratar korrekt med den nya
// GitHub-lagringen (github-storage.js) istället för Supabase.
// Mockar GitHub Contents API in-memory (med sha-versionering, precis som
// riktiga GitHub gör) samt Trimble Workspace API och objektval i 3D.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8941;
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

// In-memory mock av GitHub Contents API för repot vfalk-NCC/4D-data.
const store = new Map(); // path -> { content: obj, sha: string }
function shaFor(content) {
  return crypto.createHash('sha1').update(JSON.stringify(content)).digest('hex');
}

async function run() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 480, height: 2000 } });

  // OBS: en 404 från GitHub Contents API är en FÖRVÄNTAD, korrekt hanterad
  // respons när en projektfil (t.ex. plan_items.json) inte skapats än -
  // ghGetFile() i github-storage.js kollar explicit efter status 404 och
  // returnerar en tom lista/null. Chrome loggar ändå ett "Failed to load
  // resource"-konsolfel för varje sådan fetch oavsett att koden hanterar
  // det korrekt, så de filtreras bort här - riktiga fel (pageerror, andra
  // konsolfel) fångas fortfarande.
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !/Failed to load resource.*404/.test(msg.text())) consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  await page.route('https://components.connect.trimble.com/**', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.TrimbleConnectWorkspace = { connect: function() { return Promise.resolve({
      project: { getProject: function(){ return Promise.resolve({ id: '${PROJECT_ID}' }); } },
      viewer: {
        getSelection: function() { return Promise.resolve([{ modelId: 'model-1', objectRuntimeIds: [1] }]); },
        convertToObjectIds: function() { return Promise.resolve(['ext-obj-1']); },
        getObjectProperties: function() { return Promise.resolve([{ id: 1, product: { name: 'Testbalk B-12' } }]); },
        setSelection: function() { return Promise.resolve(); }
      }
    }); } };`
  }));

  await page.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));

  await page.route('https://api.github.com/repos/vfalk-NCC/4D-data/contents/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const filePath = decodeURIComponent(url.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const accept = req.headers()['accept'] || '';

    if (req.method() === 'GET') {
      const entry = store.get(filePath);
      if (!entry) { route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) }); return; }
      const b64 = Buffer.from(JSON.stringify(entry.content)).toString('base64');
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: b64, sha: entry.sha }) });
      return;
    }
    if (req.method() === 'PUT') {
      const body = JSON.parse(req.postData() || '{}');
      const existing = store.get(filePath);
      if (existing && existing.sha !== body.sha) {
        route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'conflict' }) });
        return;
      }
      const content = JSON.parse(Buffer.from(body.content, 'base64').toString('utf-8'));
      const newSha = shaFor(content) + Math.random().toString(16).slice(2, 6);
      store.set(filePath, { content, sha: newSha });
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: newSha } }) });
      return;
    }
    route.fulfill({ status: 405, body: 'method not allowed' });
  });

  await page.addInitScript(() => {
    window.localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 'fake-token-for-test' }));
    // Hoppa förbi lösenordsgrinden i testet - den testas separat.
    window.localStorage.setItem('4dplan-unlocked', '1');
  });

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // 1) Länka markerat objekt -> ska skapa en plan_items-rad + en
  //    progress-history-rad (första skapelsen räknas som en ändring).
  await page.locator('#btnLinkSelection').click();
  await page.waitForTimeout(200);
  await page.locator('#fName').fill('Testbalk B-12');
  await page.locator('#fProgress').fill('25');
  await page.locator('#btnSaveLink').click();
  await page.waitForTimeout(400);

  const itemsFile = store.get(`projects/${PROJECT_ID}/plan_items.json`);
  if (!itemsFile || itemsFile.content.length !== 1) throw new Error('plan_items.json innehåller inte exakt 1 post efter länkning: ' + JSON.stringify(itemsFile));
  const savedItem = itemsFile.content[0];
  if (!savedItem.id || typeof savedItem.id !== 'string') throw new Error('Sparad post saknar ett genererat UUID-id: ' + JSON.stringify(savedItem));
  if (savedItem.progress !== 25) throw new Error('Fel progress sparades: ' + savedItem.progress);

  const historyFile = store.get(`projects/${PROJECT_ID}/plan_item_progress_history.json`);
  if (!historyFile || historyFile.content.length !== 1) throw new Error('plan_item_progress_history.json fick inte exakt 1 rad vid skapelse: ' + JSON.stringify(historyFile));
  if (historyFile.content[0].plan_item_id !== savedItem.id) throw new Error('Historikraden pekar inte på rätt plan_item_id');

  // 2) Ändra progress på samma objekt -> ska logga ÄNNU en historikrad,
  //    men fortfarande bara 1 rad i plan_items.json (upsert, inte insert).
  await page.locator('#btnLinkSelection').click();
  await page.waitForTimeout(200);
  await page.locator('#fProgress').fill('60');
  await page.locator('#btnSaveLink').click();
  await page.waitForTimeout(400);

  const itemsFile2 = store.get(`projects/${PROJECT_ID}/plan_items.json`);
  if (itemsFile2.content.length !== 1) throw new Error('plan_items.json borde fortfarande bara ha 1 post efter upsert, har: ' + itemsFile2.content.length);
  if (itemsFile2.content[0].progress !== 60) throw new Error('Progress uppdaterades inte till 60');
  if (itemsFile2.content[0].id !== savedItem.id) throw new Error('Samma objekt fick ett NYTT id vid uppdatering - upsert-nyckeln fungerar inte');

  const historyFile2 = store.get(`projects/${PROJECT_ID}/plan_item_progress_history.json`);
  if (historyFile2.content.length !== 2) throw new Error('Förväntade 2 historikrader efter progress-ändring, fick: ' + historyFile2.content.length);

  // 3) Lägg till en kommentar (via samma väg som UI:t tar, men styr
  //    currentCommentsItem direkt istället för att klicka fram dialogen -
  //    vi testar backend-anropen, inte dialogens öppningsanimation).
  await page.evaluate(() => {
    currentCommentsItem = items[0];
    document.getElementById('commentAuthor').value = 'Testaren';
  });
  await page.evaluate(async () => { await onSubmitComment('Ett testkommentar', null); });
  await page.waitForTimeout(400);

  const commentsFile = store.get(`projects/${PROJECT_ID}/plan_item_comments.json`);
  if (!commentsFile || commentsFile.content.length !== 1) throw new Error('plan_item_comments.json innehåller inte exakt 1 kommentar: ' + JSON.stringify(commentsFile));
  if (commentsFile.content[0].plan_item_id !== savedItem.id) throw new Error('Kommentaren pekar inte på rätt plan_item_id');

  // 4) Radera objektet -> kommentaren ska cascade-raderas också.
  await page.evaluate(async () => { await deleteItem(items[0]); });
  await page.waitForTimeout(400);

  const itemsFile3 = store.get(`projects/${PROJECT_ID}/plan_items.json`);
  if (itemsFile3.content.length !== 0) throw new Error('plan_items.json borde vara tom efter radering, har: ' + itemsFile3.content.length);
  const commentsFile2 = store.get(`projects/${PROJECT_ID}/plan_item_comments.json`);
  if (commentsFile2.content.length !== 0) throw new Error('Kommentaren cascade-raderades INTE när objektet togs bort: ' + JSON.stringify(commentsFile2));

  await browser.close();
  server.close();

  console.log('Konsolfel:', consoleErrors);
  if (consoleErrors.length > 0) throw new Error('Konsolfel upptäcktes: ' + consoleErrors.join(' | '));
  console.log('OK: alla GitHub-storage-kontroller för 4D-planering godkända');
}

run().catch(e => { console.error(e); process.exit(1); });
