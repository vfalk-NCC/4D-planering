// Funktionstest för fyra nya funktioner (Victors förfrågningar 2026-09-17):
//  1) "Endast idag" - snabbfilter i "Planerade objekt" som bara visar
//     objekt som pågår idag (dagens datum mellan start-/slutdatum, eller
//     startdatum passerat utan slutdatum).
//  2) "Redigera markerade" - ändra status och/eller förskjuta datum på
//     flera markerade rader i ett svep, utan att röra ofyllda fält eller
//     omarkerade rader.
//  3) Auto-status "klar" när "Verkligt avslut" fylls i manuellt.
//  4) Underaktiviteter (datumhjälp) i "Koppla markering" - flera
//     aktivitet+datum-rader räknar automatiskt fram Aktivitet/Start/Slut,
//     och låser de fälten tills raderna tas bort igen.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8957;
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

function isoOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// A: pågår idag (start igår, slut om 3 dagar). B: pågår INTE idag (startar
// om 10 dagar). C: pågår idag, inget slutdatum satt (fortsatt pågående).
const TEST_ITEMS_ROWS = [
  {
    id: 'row-a', project_id: PROJECT_ID, model_id: 'model-1', object_id: '10',
    object_name: 'Pelare A', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC',
    status: 'planerad', start_date: isoOffset(-2), end_date: isoOffset(3), actual_end_date: null,
    progress: 0, updated_at: '2026-01-01T00:00:00Z'
  },
  {
    id: 'row-b', project_id: PROJECT_ID, model_id: 'model-1', object_id: '20',
    object_name: 'Pelare B', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC',
    status: 'planerad', start_date: isoOffset(10), end_date: isoOffset(15), actual_end_date: null,
    progress: 0, updated_at: '2026-01-01T00:00:00Z'
  },
  {
    id: 'row-c', project_id: PROJECT_ID, model_id: 'model-1', object_id: '30',
    object_name: 'Pelare C', area: 'Hus B', activity: 'Formning', contractor: 'Peab',
    status: 'pagaende', start_date: isoOffset(-1), end_date: null, actual_end_date: null,
    progress: 40, updated_at: '2026-01-01T00:00:00Z'
  }
];

const store = new Map();
store.set(`projects/${PROJECT_ID}/plan_items.json`, { content: TEST_ITEMS_ROWS, sha: 'seed-sha' });
store.set(`projects/${PROJECT_ID}/plan_item_progress_history.json`, { content: [], sha: 'seed-sha-hist' });
function shaFor(content) {
  return crypto.createHash('sha1').update(JSON.stringify(content)).digest('hex') + Math.random().toString(16).slice(2, 6);
}

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
    body: `window.TrimbleConnectWorkspace = { connect: function() { return Promise.resolve({
      project: { getProject: function(){ return Promise.resolve({ id: '${PROJECT_ID}' }); } },
      viewer: {
        getSelection: function() { return Promise.resolve([]); },
        convertToObjectIds: function() { return Promise.resolve([]); },
        convertToObjectRuntimeIds: function(modelId, ids) { return Promise.resolve(ids.map(Number)); },
        setSelection: function() { return Promise.resolve(); },
        setCamera: function() { return Promise.resolve(); },
        getCamera: function() { return Promise.resolve({ position: { x: 5, y: 5, z: 25 }, fieldOfView: 60, pitch: 0, yaw: 0 }); },
        setObjectState: function() { return Promise.resolve(); },
        getObjectBoundingBoxes: function() { return Promise.resolve([]); }
      }
    }); } };`
  }));
  await page.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));

  let itemsPutCount = 0;
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
      if (filePath === `projects/${PROJECT_ID}/plan_items.json`) itemsPutCount++;
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

  const itemCountText0 = await page.locator('#itemCount').innerText();
  if (itemCountText0.trim() !== '3/3') throw new Error('Förväntade 3/3 laddade objekt, fick: ' + itemCountText0);

  // ---- 1) "Endast idag".
  await page.locator('#todayOnly').check();
  await page.waitForTimeout(150);
  const itemCountToday = await page.locator('#itemCount').innerText();
  if (itemCountToday.trim() !== '2/3') throw new Error('Förväntade 2/3 objekt med "Endast idag" ikryssat (A+C pågår idag, B gör det inte), fick: ' + itemCountToday);
  const listTextToday = await page.locator('#itemList').innerText();
  if (!listTextToday.includes('Pelare A') || !listTextToday.includes('Pelare C') || listTextToday.includes('Pelare B')) {
    throw new Error('"Endast idag" visade fel objekt: ' + listTextToday);
  }
  console.log('OK: "Endast idag" visar bara objekt som pågår idag (inkl. objekt utan slutdatum), döljer objekt som ligger i framtiden');
  await page.locator('#todayOnly').uncheck();
  await page.waitForTimeout(150);

  // ---- 2) "Redigera markerade": markera A+B, ändra status + förskjut datum +7 dagar.
  await page.locator('.item-row', { hasText: 'Pelare A' }).first().click();
  await page.locator('.item-row', { hasText: 'Pelare B' }).first().click({ modifiers: ['Control'] });
  await page.waitForTimeout(100);

  const editBtnEnabled = await page.locator('#btnEditSelected').isEnabled();
  if (!editBtnEnabled) throw new Error('"Redigera markerade" skulle vara aktiv med 2 markerade rader');

  await page.locator('#btnEditSelected').click();
  await page.waitForTimeout(100);
  const bulkCountText = await page.locator('#bulkEditCount').innerText();
  if (bulkCountText.trim() !== '2') throw new Error('Förväntade bulkEditCount=2, fick: ' + bulkCountText);

  await page.selectOption('#bulkEditStatus', 'pausad');
  await page.locator('#bulkEditShiftDays').fill('7');
  await page.locator('#btnDoBulkEdit').click();

  // Optimistiskt: dialogen stängs och listan visar redan nya statusen direkt.
  await page.waitForTimeout(50);
  const bulkDialogHidden = await page.evaluate(() => document.getElementById('bulkEditDialog').classList.contains('hidden'));
  if (!bulkDialogHidden) throw new Error('bulkEditDialog skulle stängas direkt efter "Spara"');

  await page.waitForTimeout(500);
  if (itemsPutCount < 1) throw new Error('Förväntade minst 1 PUT mot plan_items.json för bulk-redigeringen');

  const afterBulk = store.get(`projects/${PROJECT_ID}/plan_items.json`).content;
  const rowA = afterBulk.find(r => r.id === 'row-a');
  const rowB = afterBulk.find(r => r.id === 'row-b');
  const rowC = afterBulk.find(r => r.id === 'row-c');

  if (rowA.status !== 'pausad' || rowB.status !== 'pausad') throw new Error('Bulk-redigeringen satte inte status "pausad" på båda markerade raderna: ' + JSON.stringify([rowA, rowB]));
  if (rowA.start_date !== isoOffset(5) || rowA.end_date !== isoOffset(10)) {
    throw new Error(`Pelare A:s datum skulle förskjutas +7 dagar (till ${isoOffset(5)}/${isoOffset(10)}), fick: ${rowA.start_date}/${rowA.end_date}`);
  }
  if (rowB.start_date !== isoOffset(17) || rowB.end_date !== isoOffset(22)) {
    throw new Error(`Pelare B:s datum skulle förskjutas +7 dagar (till ${isoOffset(17)}/${isoOffset(22)}), fick: ${rowB.start_date}/${rowB.end_date}`);
  }
  if (rowA.area !== 'Hus A' || rowA.activity !== 'Gjutning' || rowA.contractor !== 'NCC') {
    throw new Error('Bulk-redigeringen skulle lämna ofyllda fält (område/aktivitet/entreprenör) orörda: ' + JSON.stringify(rowA));
  }
  if (rowC.status !== 'pagaende' || rowC.start_date !== isoOffset(-1)) {
    throw new Error('Bulk-redigeringen rörde felaktigt den omarkerade raden Pelare C: ' + JSON.stringify(rowC));
  }
  console.log('OK: "Redigera markerade" ändrar status och förskjuter datum på ENDAST de markerade raderna, lämnar ofyllda fält och omarkerade rader orörda');

  // ---- 3) Auto-status "klar" vid ifyllt verkligt avslut.
  await page.locator('.item-row', { hasText: 'Pelare C' }).first().locator('[data-action="edit"]').click();
  await page.waitForTimeout(150);
  const statusBeforeActualEnd = await page.locator('#fStatus').inputValue();
  if (statusBeforeActualEnd === 'klar') throw new Error('Pelare C skulle inte redan ha status "klar" innan testet fyller i verkligt avslut');
  await page.locator('#fActualEnd').fill(isoOffset(0));
  await page.locator('#fActualEnd').dispatchEvent('change');
  await page.waitForTimeout(100);
  const statusAfterActualEnd = await page.locator('#fStatus').inputValue();
  if (statusAfterActualEnd !== 'klar') throw new Error('Status skulle sättas automatiskt till "klar" när verkligt avslut fylls i manuellt, fick: ' + statusAfterActualEnd);
  console.log('OK: att fylla i "Verkligt avslut" manuellt sätter status automatiskt till "Klar"');
  await page.locator('#btnCancelLink').click();
  await page.waitForTimeout(100);

  // ---- 4) Underaktiviteter (datumhjälp) i "Koppla markering".
  await page.locator('.item-row', { hasText: 'Pelare A' }).first().locator('[data-action="edit"]').click();
  await page.waitForTimeout(150);

  await page.locator('#btnAddSubActivity').click();
  await page.locator('#btnAddSubActivity').click();
  await page.waitForTimeout(50);

  const rows = page.locator('.sub-activity-row');
  await rows.nth(0).locator('.sub-activity-name').fill('Formning');
  await rows.nth(0).locator('.sub-activity-start').fill(isoOffset(1));
  await rows.nth(0).locator('.sub-activity-end').fill(isoOffset(4));
  await rows.nth(0).locator('.sub-activity-end').dispatchEvent('change');

  await rows.nth(1).locator('.sub-activity-name').fill('Gjutning');
  await rows.nth(1).locator('.sub-activity-start').fill(isoOffset(5));
  await rows.nth(1).locator('.sub-activity-end').fill(isoOffset(8));
  await rows.nth(1).locator('.sub-activity-end').dispatchEvent('change');
  await page.waitForTimeout(100);

  const activityVal = await page.locator('#fActivity').inputValue();
  const startVal = await page.locator('#fStart').inputValue();
  const endVal = await page.locator('#fEnd').inputValue();
  if (activityVal !== 'Formning + Gjutning') throw new Error('Aktivitet skulle slås ihop till "Formning + Gjutning", fick: ' + activityVal);
  if (startVal !== isoOffset(1)) throw new Error(`Startdatum skulle bli tidigaste delaktivitetsdatumet (${isoOffset(1)}), fick: ${startVal}`);
  if (endVal !== isoOffset(8)) throw new Error(`Slutdatum skulle bli senaste delaktivitetsdatumet (${isoOffset(8)}), fick: ${endVal}`);

  const activityReadonly = await page.locator('#fActivity').evaluate(el => el.readOnly);
  const startReadonly = await page.locator('#fStart').evaluate(el => el.readOnly);
  if (!activityReadonly || !startReadonly) throw new Error('Aktivitet/Startdatum skulle vara låsta (readonly) medan delaktiviteter finns');
  console.log('OK: underaktiviteter räknar automatiskt fram Aktivitet (ihopslaget) samt tidigaste/senaste Start-/Slutdatum, och låser fälten');

  // Ta bort båda delaktiviteterna igen - huvudfälten ska låsas upp.
  await page.locator('.sub-activity-remove').first().click();
  await page.locator('.sub-activity-remove').first().click();
  await page.waitForTimeout(50);
  const activityReadonlyAfter = await page.locator('#fActivity').evaluate(el => el.readOnly);
  if (activityReadonlyAfter) throw new Error('Aktivitet-fältet skulle låsas upp igen när alla delaktiviteter tagits bort');
  console.log('OK: huvudfälten låses upp igen när samtliga delaktiviteter tas bort');

  await page.locator('#btnCancelLink').click();

  // confirm()-frågan inför bulk-redigeringen är en FÖRVÄNTAD dialog (auto-
  // accepterad ovan för att kunna klicka igenom flödet) - filtreras bort
  // härifrån, som bara ska fånga OVÄNTADE alert()-fel.
  const unexpectedAlerts = alerts.filter(a => !/^Ändra .* markerade objekt\?$/.test(a));
  if (unexpectedAlerts.length > 0) throw new Error('Oväntad alert() under testet: ' + unexpectedAlerts.join(' | '));

  await browser.close();
  server.close();

  console.log('Konsolfel:', consoleErrors);
  if (consoleErrors.length > 0) throw new Error('Konsolfel upptäcktes: ' + consoleErrors.join(' | '));
  console.log('OK: Endast idag, Redigera markerade, auto-status-klar och underaktiviteter fungerar korrekt');
}

run().catch(e => { console.error(e); process.exit(1); });
