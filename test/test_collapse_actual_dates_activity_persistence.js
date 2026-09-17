// Funktionstest för fem nya funktioner (Victors förfrågan 2026-09-17):
//  1) "Collapsa alla"-knapp i headern (#btnCollapseAll), samma beteende som
//     i 4D-dashboard - minimerar/expanderar samtliga paneler i ett klick.
//  2) Nollställ-knappar bredvid "Verklig start" och "Verkligt avslut".
//  3) Nytt fält "Verklig start" (mellan Startdatum och Slutdatum-blocket).
//  4) "Verklig start"/"Verkligt avslut" som en valfri, hopfällbar
//     "extra"-sektion - hopfälld som standard, fälls ut automatiskt om
//     objektet redan har någon av datumen ifyllda.
//  5) Delaktiviteter sparas numera på riktigt (plan_item_activities.json)
//     istället för att bara vara en datumräknehjälp som glöms bort -
//     verifieras både via PUT-anropet och genom att öppna om formuläret.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8959;
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

// X: inga verkliga datum satta än. Y: har redan verklig start+avslut (ska
// fälla ut "extra"-sektionen automatiskt). Z: har två sparade delaktiviteter
// sedan tidigare (plan_item_activities.json), ska laddas in vid redigering.
const TEST_ITEMS_ROWS = [
  {
    id: 'row-x', project_id: PROJECT_ID, model_id: 'model-1', object_id: '10',
    object_name: 'Pelare X', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC',
    status: 'planerad', start_date: isoOffset(-2), end_date: isoOffset(3),
    actual_start_date: null, actual_end_date: null,
    progress: 0, updated_at: '2026-01-01T00:00:00Z'
  },
  {
    id: 'row-y', project_id: PROJECT_ID, model_id: 'model-1', object_id: '20',
    object_name: 'Pelare Y', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC',
    status: 'pagaende', start_date: isoOffset(-5), end_date: isoOffset(5),
    actual_start_date: isoOffset(-4), actual_end_date: null,
    progress: 30, updated_at: '2026-01-01T00:00:00Z'
  },
  {
    id: 'row-z', project_id: PROJECT_ID, model_id: 'model-1', object_id: '30',
    object_name: 'Pelare Z', area: 'Hus B', activity: 'Formning + Gjutning', contractor: 'Peab',
    status: 'planerad', start_date: isoOffset(1), end_date: isoOffset(8),
    actual_start_date: null, actual_end_date: null,
    progress: 0, updated_at: '2026-01-01T00:00:00Z'
  }
];

const TEST_ACTIVITY_ROWS = [
  { id: 'act-1', plan_item_id: 'row-z', project_id: PROJECT_ID, name: 'Formning', start_date: isoOffset(1), end_date: isoOffset(4) },
  { id: 'act-2', plan_item_id: 'row-z', project_id: PROJECT_ID, name: 'Gjutning', start_date: isoOffset(5), end_date: isoOffset(8) }
];

const store = new Map();
store.set(`projects/${PROJECT_ID}/plan_items.json`, { content: TEST_ITEMS_ROWS, sha: 'seed-sha' });
store.set(`projects/${PROJECT_ID}/plan_item_progress_history.json`, { content: [], sha: 'seed-sha-hist' });
store.set(`projects/${PROJECT_ID}/plan_item_activities.json`, { content: TEST_ACTIVITY_ROWS, sha: 'seed-sha-act' });
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

  let activitiesPutCount = 0;
  let lastActivitiesPutBody = null;
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
      const body = JSON.parse(req.postData() || '{}');
      const existing = store.get(filePath);
      if (existing && existing.sha !== body.sha) {
        route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'conflict' }) });
        return;
      }
      const content = JSON.parse(Buffer.from(body.content, 'base64').toString('utf-8'));
      if (filePath === `projects/${PROJECT_ID}/plan_item_activities.json`) {
        activitiesPutCount++;
        lastActivitiesPutBody = content;
      }
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

  // ---- 1) "Collapsa alla" i headern.
  const panelCount = await page.locator('section.panel[data-panel-id]').count();
  if (panelCount < 5) throw new Error('Förväntade minst 5 paneler med data-panel-id, hittade: ' + panelCount);

  await page.locator('#btnCollapseAll').click();
  await page.waitForTimeout(50);
  const collapsedCountAfterFirstClick = await page.locator('section.panel[data-panel-id].collapsed').count();
  if (collapsedCountAfterFirstClick !== panelCount) {
    throw new Error(`Alla ${panelCount} paneler skulle vara minimerade efter klick på "Collapsa alla", fick: ${collapsedCountAfterFirstClick}`);
  }
  const iconAfterCollapse = await page.locator('#btnCollapseAll').innerText();
  if (iconAfterCollapse.trim() !== '⊞') throw new Error('Knappens ikon skulle bli "⊞" (expandera) när allt är minimerat, fick: ' + iconAfterCollapse);

  await page.locator('#btnCollapseAll').click();
  await page.waitForTimeout(50);
  const collapsedCountAfterSecondClick = await page.locator('section.panel[data-panel-id].collapsed').count();
  if (collapsedCountAfterSecondClick !== 0) {
    throw new Error('Alla paneler skulle expanderas igen efter andra klicket på "Collapsa alla", fick fortfarande minimerade: ' + collapsedCountAfterSecondClick);
  }
  console.log('OK: "Collapsa alla" i headern minimerar/expanderar samtliga paneler och byter ikon');

  // ---- 2)+3)+4) Verklig start/avslut: nollställ-knappar + hopfällbar sektion.
  // Pelare X: inga verkliga datum -> sektionen ska börja hopfälld.
  await page.locator('.item-row', { hasText: 'Pelare X' }).first().locator('[data-action="edit"]').click();
  await page.waitForTimeout(150);
  const actualFieldsHiddenX = await page.evaluate(() => document.getElementById('actualDatesFields').classList.contains('hidden'));
  if (!actualFieldsHiddenX) throw new Error('"Verklig start/avslut" skulle vara hopfälld som standard för ett objekt utan verkliga datum (Pelare X)');

  await page.locator('#btnToggleActualDates').click();
  await page.waitForTimeout(50);
  const actualFieldsExpandedX = await page.evaluate(() => !document.getElementById('actualDatesFields').classList.contains('hidden'));
  if (!actualFieldsExpandedX) throw new Error('Klick på "+ Verklig start/avslut" skulle fälla ut sektionen');

  // Sätt värden direkt (utan att gå via .fill(), som själv triggar en riktig
  // change-händelse - vi vill isolerat testa NOLLSTÄLL-KNAPPARNAS eget
  // beteende, inte auto-status-klar-lyssnaren som redan täcks av ett annat
  // test). Statusen sätts uttryckligen till "pausad" innan, så vi entydigt
  // kan se om något oväntat ändrar den.
  await page.selectOption('#fStatus', 'pausad');
  await page.evaluate(() => {
    document.getElementById('fActualStart').value = new Date().toISOString().slice(0, 10);
    document.getElementById('fActualEnd').value = new Date().toISOString().slice(0, 10);
  });
  await page.locator('#btnClearActualStart').click();
  await page.locator('#btnClearActualEnd').click();
  const clearedStart = await page.locator('#fActualStart').inputValue();
  const clearedEnd = await page.locator('#fActualEnd').inputValue();
  if (clearedStart !== '' || clearedEnd !== '') throw new Error('Nollställ-knapparna skulle tömma respektive datumfält, fick: ' + clearedStart + ' / ' + clearedEnd);
  const statusAfterClear = await page.locator('#fStatus').inputValue();
  if (statusAfterClear !== 'pausad') throw new Error('Nollställ-knapparna ska bara tömma sitt eget fält, inte trigga auto-status-klar-lyssnaren (som bara ska reagera på riktiga change-händelser), fick status: ' + statusAfterClear);
  console.log('OK: nollställ-knapparna tömmer sina fält utan att spionera in en oväntad statusändring');

  await page.locator('#btnCancelLink').click();
  await page.waitForTimeout(100);

  // Pelare Y: har redan en verklig start -> sektionen ska fällas ut automatiskt.
  await page.locator('.item-row', { hasText: 'Pelare Y' }).first().locator('[data-action="edit"]').click();
  await page.waitForTimeout(150);
  const actualFieldsExpandedY = await page.evaluate(() => !document.getElementById('actualDatesFields').classList.contains('hidden'));
  if (!actualFieldsExpandedY) throw new Error('"Verklig start/avslut" skulle fällas ut automatiskt för ett objekt som redan har verklig start satt (Pelare Y)');
  const actualStartValY = await page.locator('#fActualStart').inputValue();
  if (actualStartValY !== isoOffset(-4)) throw new Error('Verklig start skulle förifyllas med sparat värde, fick: ' + actualStartValY);
  console.log('OK: "Verklig start/avslut" fälls ut automatiskt och förifylls när objektet redan har data där');
  await page.locator('#btnCancelLink').click();
  await page.waitForTimeout(100);

  // ---- 5) Delaktiviteter sparas på riktigt.
  // Pelare Z har två sparade delaktiviteter sedan tidigare - ska laddas in direkt.
  await page.locator('.item-row', { hasText: 'Pelare Z' }).first().locator('[data-action="edit"]').click();
  await page.waitForTimeout(150);
  const preloadedRows = page.locator('.sub-activity-row');
  const preloadedCount = await preloadedRows.count();
  if (preloadedCount !== 2) throw new Error('Pelare Z skulle ha 2 tidigare sparade delaktiviteter förifyllda, hittade: ' + preloadedCount);
  const preloadedName0 = await preloadedRows.nth(0).locator('.sub-activity-name').inputValue();
  if (preloadedName0 !== 'Formning') throw new Error('Första förifyllda delaktiviteten skulle heta "Formning", fick: ' + preloadedName0);
  const activityReadonlyPreloaded = await page.locator('#fActivity').evaluate(el => el.readOnly);
  if (!activityReadonlyPreloaded) throw new Error('Aktivitet-fältet skulle vara låst direkt när förifyllda delaktiviteter finns');
  console.log('OK: tidigare sparade delaktiviteter laddas in automatiskt när man redigerar objektet igen');
  await page.locator('#btnCancelLink').click();
  await page.waitForTimeout(100);

  // Pelare X: lägg till två NYA delaktiviteter och spara - ska skrivas till plan_item_activities.json.
  await page.locator('.item-row', { hasText: 'Pelare X' }).first().locator('[data-action="edit"]').click();
  await page.waitForTimeout(150);
  await page.locator('#btnAddSubActivity').click();
  await page.locator('#btnAddSubActivity').click();
  const newRows = page.locator('.sub-activity-row');
  await newRows.nth(0).locator('.sub-activity-name').fill('Armering');
  await newRows.nth(0).locator('.sub-activity-start').fill(isoOffset(0));
  await newRows.nth(0).locator('.sub-activity-end').fill(isoOffset(1));
  await newRows.nth(0).locator('.sub-activity-end').dispatchEvent('change');
  await newRows.nth(1).locator('.sub-activity-name').fill('Gjutning');
  await newRows.nth(1).locator('.sub-activity-start').fill(isoOffset(2));
  await newRows.nth(1).locator('.sub-activity-end').fill(isoOffset(3));
  await newRows.nth(1).locator('.sub-activity-end').dispatchEvent('change');
  await page.waitForTimeout(50);

  await page.locator('#btnSaveLink').click();
  await page.waitForTimeout(500);

  if (activitiesPutCount < 1) throw new Error('Förväntade minst 1 PUT mot plan_item_activities.json efter sparning med delaktiviteter ifyllda');
  const savedForX = lastActivitiesPutBody.filter(a => a.plan_item_id === 'row-x');
  if (savedForX.length !== 2) throw new Error('Förväntade 2 sparade delaktiviteter för Pelare X, fick: ' + JSON.stringify(savedForX));
  if (!savedForX.some(a => a.name === 'Armering') || !savedForX.some(a => a.name === 'Gjutning')) {
    throw new Error('De sparade delaktiviteterna för Pelare X matchade inte det ifyllda: ' + JSON.stringify(savedForX));
  }
  // De tidigare sparade delaktiviteterna för Pelare Z ska finnas kvar orörda.
  const stillThereForZ = lastActivitiesPutBody.filter(a => a.plan_item_id === 'row-z');
  if (stillThereForZ.length !== 2) throw new Error('Pelare Z:s tidigare sparade delaktiviteter skulle lämnas orörda, fick: ' + JSON.stringify(stillThereForZ));
  console.log('OK: nya delaktiviteter skrivs till plan_item_activities.json vid sparning, utan att röra andra objekts sparade delaktiviteter');

  // Öppna om Pelare X - de precis sparade delaktiviteterna ska nu ligga kvar
  // (verifierar att den lokala activitiesByItemId-cachen uppdaterades direkt,
  // utan att kräva en manuell "Uppdatera").
  await page.locator('.item-row', { hasText: 'Pelare X' }).first().locator('[data-action="edit"]').click();
  await page.waitForTimeout(150);
  const reopenedRows = page.locator('.sub-activity-row');
  const reopenedCount = await reopenedRows.count();
  if (reopenedCount !== 2) throw new Error('Pelare X skulle visa de precis sparade 2 delaktiviteterna direkt vid omöppning, hittade: ' + reopenedCount);
  console.log('OK: precis sparade delaktiviteter syns direkt vid omöppning av formuläret, utan omladdning');
  await page.locator('#btnCancelLink').click();

  const unexpectedAlerts = alerts.filter(a => !/^Ändra .* markerade objekt\?$/.test(a));
  if (unexpectedAlerts.length > 0) throw new Error('Oväntad alert() under testet: ' + unexpectedAlerts.join(' | '));

  await browser.close();
  server.close();

  console.log('Konsolfel:', consoleErrors);
  if (consoleErrors.length > 0) throw new Error('Konsolfel upptäcktes: ' + consoleErrors.join(' | '));
  console.log('OK: Collapsa alla, Verklig start, nollställ-knappar, hopfällbar sektion och delaktivitetspersistens fungerar korrekt');
}

run().catch(e => { console.error(e); process.exit(1); });
