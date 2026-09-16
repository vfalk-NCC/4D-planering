// Funktionstest: reproducerar buggen Victor stötte på i produktion -
// "Kunde inte spara: Skrivkrock (409) mot .../plan_items.json" när man
// (t.ex. via ett dubbelklick på Spara, eller två snabba tryck i följd)
// råkar starta två samtidiga sparningar mot samma plan_items.json.
//
// Verifierar två saker:
//  1) btnSaveLink inaktiveras direkt (synkront) när en sparning startar,
//     så ett andra samtidigt anrop avbryts tidigt istället för att racea
//     mot det första - dvs bara EN faktisk PUT mot plan_items.json ska
//     ske för två samtidiga onSaveLink()-anrop på samma markering.
//  2) Om en skrivkrock (409) ändå uppstår (t.ex. en annan samtidig
//     skrivning utifrån) läker ghWriteJSON:s omförsök med backoff detta
//     utan att kasta fel, istället för att ge upp för tidigt.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8945;
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

const store = new Map(); // path -> { content: obj, sha: string }
function shaFor(content) {
  return crypto.createHash('sha1').update(JSON.stringify(content)).digest('hex');
}

async function run() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 480, height: 2000 } });

  // En 404 (fil finns inte än) och den avsiktligt injicerade 409:an
  // (skrivkrock, testad ovan) är FÖRVÄNTADE, korrekt hanterade svar -
  // Chrome loggar ändå ett "Failed to load resource"-konsolfel för varje
  // sådan fetch oavsett att koden hanterar det korrekt (samma resonemang
  // som i test_github_storage.js), så de filtreras bort här.
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !/Failed to load resource.*(404|409)/.test(msg.text())) consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  // Fånga JS-alert() (den "Kunde inte spara: ..."-dialog Victor fick) så
  // testet kan verifiera att den ALDRIG visas i det här scenariot.
  const alerts = [];
  page.on('dialog', async (dialog) => { alerts.push(dialog.message()); await dialog.accept(); });

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
      const newSha = shaFor(content) + Math.random().toString(16).slice(2, 6);
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
  await page.waitForTimeout(500);

  // ---- 1) Öppna formuläret och fyll i, precis som Victor gjorde.
  await page.locator('#btnLinkSelection').click();
  await page.waitForTimeout(200);
  await page.locator('#fName').fill('Testbalk B-12');
  await page.locator('#fProgress').fill('25');

  // ---- 2) Simulera ett dubbelklick: två samtidiga anrop till onSaveLink()
  //    för SAMMA markering, precis som två snabba klick på Spara skulle ge.
  await page.evaluate(() => Promise.all([onSaveLink(), onSaveLink()]));
  await page.waitForTimeout(400);

  if (alerts.length > 0) {
    throw new Error('Ett felmeddelande visades trots att sparningen skulle lyckas tyst: ' + alerts.join(' | '));
  }
  if (putCount !== 1) {
    throw new Error(`Förväntade exakt 1 PUT mot plan_items.json (skydd mot dubbla samtidiga sparningar), fick ${putCount}`);
  }
  const itemsFile = store.get(`projects/${PROJECT_ID}/plan_items.json`);
  if (!itemsFile || itemsFile.content.length !== 1) {
    throw new Error('plan_items.json innehåller inte exakt 1 post: ' + JSON.stringify(itemsFile));
  }
  console.log('OK: dubbla samtidiga Spara-anrop ger bara EN skrivning, inget felmeddelande');

  // ---- 3) Knappen ska vara återaktiverad och visa sin ursprungliga text
  //    efter att sparningen är klar (inte fast på "Sparar...").
  const btnText = await page.locator('#btnSaveLink').innerText();
  const btnDisabled = await page.locator('#btnSaveLink').isDisabled();
  if (btnDisabled) throw new Error('Spara-knappen förblev inaktiverad efter avslutad sparning');
  if (btnText.trim() !== 'Spara') throw new Error('Spara-knappens text återställdes inte, visar: "' + btnText + '"');
  console.log('OK: Spara-knappen återaktiveras och återfår sin text efter sparning');

  // ---- 4) En äkta skrivkrock (en extern samtidig skrivning "utifrån",
  //    simulerad genom att byta sha i mock-lagret precis innan nästa
  //    sparning) ska självläka via backoff/omförsök i ghWriteJSON, inte
  //    krascha med ett felmeddelande.
  await page.locator('#btnLinkSelection').click();
  await page.waitForTimeout(200);
  await page.locator('#fProgress').fill('80');

  let conflictInjected = false;
  await page.route('https://api.github.com/repos/vfalk-NCC/4D-data/contents/**', async route => {
    const req = route.request();
    if (req.method() === 'PUT' && !conflictInjected) {
      const url = new URL(req.url());
      const filePath = decodeURIComponent(url.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
      if (filePath === `projects/${PROJECT_ID}/plan_items.json`) {
        conflictInjected = true;
        // Simulera att någon annan skrev till filen precis innan vårt PUT -
        // servern svarar 409 en gång, oavsett vilken sha vi skickade.
        route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'conflict' }) });
        return;
      }
    }
    route.fallback();
  });

  await page.locator('#btnSaveLink').click();
  await page.waitForTimeout(1500);

  if (alerts.length > 0) {
    throw new Error('En engångs-skrivkrock skulle läka av sig själv, men gav ett felmeddelande: ' + alerts.join(' | '));
  }
  const itemsFile2 = store.get(`projects/${PROJECT_ID}/plan_items.json`);
  if (!itemsFile2 || itemsFile2.content.length !== 1 || itemsFile2.content[0].progress !== 80) {
    throw new Error('Sparningen efter en enstaka skrivkrock läkte inte korrekt: ' + JSON.stringify(itemsFile2));
  }
  console.log('OK: en enstaka skrivkrock (409) läker automatiskt via omförsök, utan felmeddelande');

  await browser.close();
  server.close();

  console.log('Konsolfel:', consoleErrors);
  if (consoleErrors.length > 0) throw new Error('Konsolfel upptäcktes: ' + consoleErrors.join(' | '));
  console.log('OK: skydd mot samtidiga sparningar fungerar korrekt');
}

run().catch(e => { console.error(e); process.exit(1); });
