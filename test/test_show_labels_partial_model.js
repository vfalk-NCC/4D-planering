// Funktionstest: "Visa namn i 3D" ska inte totalt misslyckas bara för att
// EN av flera markerade objekts modeller inte är inläst i Trimble Connect
// just nu - se Victors rapport 2026-09-16 ("jag får felmeddelande om inte
// en av modellerna är aktiva i TC"). Verifierar:
//  1) Markerar man objekt från TVÅ modeller, där bara en är inläst, ska
//     etiketter ändå skapas för objekten i den inlästa modellen - INGEN
//     avbrytande alert, bara en kort statusrad om att resten föll bort.
//  2) Markerar man BARA objekt vars modell inte är inläst alls, ska man
//     fortfarande få ett tydligt felmeddelande (inget att visa).
//  3) Är alla markerade objekts modeller inlästa (det vanliga fallet) ska
//     ingen statusrad visas alls och samtliga etiketter skapas som förut.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8953;
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

const store = new Map();
function shaFor(content) { return crypto.createHash('sha1').update(JSON.stringify(content)).digest('hex') + Math.random().toString(16).slice(2, 6); }

// Tre objekt: två hör till "model-loaded" (som svarar normalt på
// konverteringsanrop), ett hör till "model-not-loaded" (som kastar fel för
// hela anropet - precis som TC gör när modellen inte är inläst).
const SEED_ITEMS = [
  { id: 'row-1', project_id: PROJECT_ID, model_id: 'model-loaded', object_id: '1', object_name: 'Loaded1', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'planerad', start_date: null, end_date: null, progress: 0, updated_at: '2026-01-01T00:00:00Z' },
  { id: 'row-2', project_id: PROJECT_ID, model_id: 'model-loaded', object_id: '2', object_name: 'Loaded2', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'planerad', start_date: null, end_date: null, progress: 0, updated_at: '2026-01-01T00:00:00Z' },
  { id: 'row-3', project_id: PROJECT_ID, model_id: 'model-not-loaded', object_id: '3', object_name: 'NotLoaded3', area: 'Hus B', activity: 'Gjutning', contractor: 'NCC', status: 'planerad', start_date: null, end_date: null, progress: 0, updated_at: '2026-01-01T00:00:00Z' }
];
store.set(`projects/${PROJECT_ID}/plan_items.json`, { content: SEED_ITEMS, sha: shaFor(SEED_ITEMS) });

async function run() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 480, height: 1400 } });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !/Failed to load resource.*404/.test(msg.text())) consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  const alerts = [];
  page.on('dialog', async (dialog) => { alerts.push(dialog.message()); await dialog.accept(); });

  await page.route('https://components.connect.trimble.com/**', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      window.__calls = [];
      window.TrimbleConnectWorkspace = { connect: function() { return Promise.resolve({
        project: { getProject: function(){ return Promise.resolve({ id: '${PROJECT_ID}' }); } },
        markup: {
          addTextMarkup: function(markups) {
            window.__calls.push(['addTextMarkup', markups]);
            return Promise.resolve(markups.map((m, i) => ({ id: 'markup-' + i })));
          },
          removeMarkups: function(ids) {
            window.__calls.push(['removeMarkups', ids]);
            return Promise.resolve();
          }
        },
        viewer: {
          // Modellen "model-not-loaded" beter sig som Trimble Connect gör när
          // en modell inte är inläst: HELA anropet kastar, inte bara de
          // enskilda ID:na som saknas.
          convertToObjectRuntimeIds: function(modelId, objectIds) {
            if (modelId === 'model-not-loaded') return Promise.reject(new Error('Model not loaded'));
            return Promise.resolve(objectIds.map(id => Number(id)));
          },
          getObjectBoundingBoxes: function(modelId, ids) {
            return Promise.resolve(ids.map(id => ({ id, boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } } })));
          },
          setSelection: function() { return Promise.resolve(); },
          setCamera: function() { return Promise.resolve(); },
          getCamera: function() { return Promise.resolve({ position: { x: 5, y: 5, z: 25 }, fieldOfView: 60, pitch: 0, yaw: 0 }); },
          setObjectState: function() { return Promise.resolve(); },
          getSelection: function() { return Promise.resolve([]); },
          convertToObjectIds: function() { return Promise.resolve([]); }
        }
      }); } };`
  }));
  await page.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));

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
    route.fulfill({ status: 405, body: 'method not allowed' });
  });

  await page.addInitScript(() => {
    window.localStorage.setItem('4dplan-unlocked', '1');
    window.localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 'test-token' }));
  });

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const selectRowsByName = async (names) => {
    // Klicka på första raden, sedan Ctrl/Cmd-klicka på övriga, för att
    // markera flera rader - samma flöde som Victor använder i listan.
    for (let i = 0; i < names.length; i++) {
      const row = page.locator('.item-row', { hasText: names[i] }).first();
      if (i === 0) await row.click();
      else await row.click({ modifiers: ['Control'] });
    }
  };

  // ---- 1) Två modeller markerade, bara en inläst -> etiketter för den
  //         inlästa modellens objekt, ingen avbrytande alert, kort statusrad.
  // (Radklicken markerar även objekten i 3D-vyn - ett separat, redan
  // existerande flöde (selectItemsInModel) som tål samma sak sedan tidigare
  // och inte är vad det här testet handlar om, så alerts nollställs precis
  // innan "Visa namn i 3D" klickas för att isolera DEN knappens beteende.)
  await selectRowsByName(['Loaded1', 'NotLoaded3']);
  await page.waitForTimeout(100);
  alerts.length = 0;
  await page.locator('#btnShowLabels').click();
  await page.waitForTimeout(300);

  if (alerts.length > 0) throw new Error('Förväntade INGEN avbrytande alert från "Visa namn i 3D" när minst en modell är inläst, fick: ' + JSON.stringify(alerts));

  const markupCallsFirst = await page.evaluate(() => window.__calls.filter(c => c[0] === 'addTextMarkup'));
  if (markupCallsFirst.length !== 1) throw new Error('Förväntade exakt ett addTextMarkup-anrop, fick: ' + JSON.stringify(markupCallsFirst));
  if (markupCallsFirst[0][1].length !== 1) throw new Error('Förväntade en (1) etikett skapad (bara Loaded1, NotLoaded3 hör till en modell som inte är inläst), fick: ' + JSON.stringify(markupCallsFirst[0][1]));
  if (!markupCallsFirst[0][1][0].text.includes('Loaded1')) throw new Error('Förväntade att den skapade etiketten var för Loaded1, fick: ' + JSON.stringify(markupCallsFirst[0][1]));

  const statusTextPartial = (await page.locator('#labelsStatus').innerText()).trim();
  if (!/1 av 2/.test(statusTextPartial)) throw new Error('Förväntade en statusrad som nämner "1 av 2", fick: ' + statusTextPartial);
  console.log('OK: "Visa namn i 3D" skapar etiketter för objekt i inlästa modeller även om ett annat markerat objekt hör till en modell som inte är inläst, utan avbrytande alert');

  // ---- 2) Bara objekt från den ej inlästa modellen markerade -> tydligt
  //         felmeddelande (inget gick att visa).
  await page.evaluate(() => { window.__calls.length = 0; });
  await selectRowsByName(['NotLoaded3']);
  await page.waitForTimeout(100);
  alerts.length = 0;
  await page.locator('#btnShowLabels').click();
  await page.waitForTimeout(300);

  if (alerts.length !== 1) throw new Error('Förväntade exakt en alert från "Visa namn i 3D" när INGA av de markerade objekten kunde hittas i en inläst modell, fick: ' + JSON.stringify(alerts));
  console.log('OK: en tydlig alert visas när inget av de markerade objekten hör till en just nu inläst modell');

  // ---- 3) Alla markerade objekt i inlästa modeller -> alla etiketter
  //         skapas, ingen statusrad.
  await page.evaluate(() => { window.__calls.length = 0; });
  await selectRowsByName(['Loaded1', 'Loaded2']);
  await page.waitForTimeout(100);
  alerts.length = 0;
  await page.locator('#btnShowLabels').click();
  await page.waitForTimeout(300);
  if (alerts.length > 0) throw new Error('Förväntade INGEN alert när samtliga markerade objekts modeller är inlästa, fick: ' + JSON.stringify(alerts));

  const markupCallsAll = await page.evaluate(() => window.__calls.filter(c => c[0] === 'addTextMarkup'));
  if (markupCallsAll.length !== 1 || markupCallsAll[0][1].length !== 2) throw new Error('Förväntade två etiketter (Loaded1 + Loaded2) när alla markerade objekts modeller är inlästa, fick: ' + JSON.stringify(markupCallsAll));
  const statusTextFull = (await page.locator('#labelsStatus').innerText()).trim();
  if (statusTextFull !== '') throw new Error('Förväntade tom statusrad när samtliga markerade objekt fick etiketter, fick: ' + statusTextFull);
  console.log('OK: när samtliga markerade objekts modeller är inlästa skapas etiketter för alla, utan statusrad');

  await browser.close();
  server.close();

  console.log('Konsolfel:', consoleErrors);
  if (consoleErrors.length > 0) throw new Error('Konsolfel upptäcktes: ' + consoleErrors.join(' | '));
  console.log('OK: "Visa namn i 3D" hanterar delvis inlästa modeller korrekt (partiell framgång, tydligt fel vid total misslyckande, tyst vid fullständig framgång)');
}

run().catch(e => { console.error(e); process.exit(1); });
