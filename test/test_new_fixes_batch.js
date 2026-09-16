// Funktionstest för sex saker Victor efterfrågade:
//  1) "Planerade objekt" ska som STANDARD vara grupperat på Område och
//     sorterat A-Ö direkt när appen öppnas (utan att man behöver välja det).
//  2) Om VISSA (men inte alla) objekt i en "Välj alla"-markering saknas i
//     den just nu inlästa 3D-modellen ska de som faktiskt finns ändå
//     markeras, och de saknade ska märkas med en varningstagg i listan -
//     INTE en alert() och ingen markering alls.
//  3) "Välj alla" på en HOPFÄLLD grupp ska inte fälla ut den (självinitierad
//     markering ska inte trigga listsynkens gruppexpansion).
//  4) Fälten med egen dropdown (fArea, renameNewValue) ska ha ett slumpat
//     `name`-attribut (skydd mot webbläsarens "Sparade data"-ruta).
//  5) "Byt namn"-dialogens "Nytt/befintligt namn"-fält ska föreslå
//     befintliga värden för det valda fältet.
//  6) "Visa filtrerat" ska isolera via viewer.isolateEntities (inte dölja
//     allt via setObjectState), och "Visa alla kopplade objekt" i Filter-
//     headern ska återställa synligheten utan att fälla ihop panelen.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8950;
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

// Tre objekt i samma område ("Hus A") - object_id '30' finns INTE i den
// mockade 3D-modellen (simulerar en äldre modellversion), '10' och '20' gör
// det. Ett fjärde objekt i ett annat område ("Alby") för att kunna verifiera
// standardsorteringen (Alby ska komma FÖRE Hus A i bokstavsordning).
const TEST_ITEMS_ROWS = [
  { id: 'row-1', project_id: PROJECT_ID, model_id: 'model-1', object_id: '10', object_name: 'Pelare A1', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'planerad', start_date: null, end_date: null, progress: 0, updated_at: '2026-01-01T00:00:00Z' },
  { id: 'row-2', project_id: PROJECT_ID, model_id: 'model-1', object_id: '20', object_name: 'Pelare A2', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'planerad', start_date: null, end_date: null, progress: 0, updated_at: '2026-01-01T00:00:00Z' },
  { id: 'row-3', project_id: PROJECT_ID, model_id: 'model-1', object_id: '30', object_name: 'Pelare A3 (äldre modellversion)', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'planerad', start_date: null, end_date: null, progress: 0, updated_at: '2026-01-01T00:00:00Z' },
  { id: 'row-4', project_id: PROJECT_ID, model_id: 'model-1', object_id: '40', object_name: 'Fundament', area: 'Alby', activity: 'Gjutning', contractor: 'NCC', status: 'planerad', start_date: null, end_date: null, progress: 0, updated_at: '2026-01-01T00:00:00Z' }
];

const MISSING_OBJECT_IDS = new Set(['30']);

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

  await page.addInitScript(() => {
    window.localStorage.setItem('4dplan-unlocked', '1');
    window.localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 'test-token' }));
    window.__calls = [];
  });

  await page.route('https://components.connect.trimble.com/**', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      window.TrimbleConnectWorkspace = { connect: function(target, callback) {
        window.__onWorkspaceEvent = callback;
        return Promise.resolve({
        project: { getProject: function(){ return Promise.resolve({ id: '${PROJECT_ID}' }); } },
        viewer: {
          // Simulerar Trimbles verkliga (buggiga) beteende: HELA batch-
          // anropet avvisas om NÅGOT av de efterfrågade objekten saknas i
          // modellen - appens convertToRuntimeIdsSafe() ska då falla
          // tillbaka till ett objekt i taget.
          convertToObjectRuntimeIds: function(modelId, objectIds) {
            window.__calls.push(['convertToObjectRuntimeIds', modelId, objectIds.slice()]);
            const missing = ${JSON.stringify(Array.from(MISSING_OBJECT_IDS))};
            if (objectIds.some(id => missing.includes(id))) {
              if (objectIds.length > 1) return Promise.reject(new Error('object not found'));
              return Promise.resolve([undefined]);
            }
            return Promise.resolve(objectIds.map(id => Number(id)));
          },
          convertToObjectIds: function(modelId, runtimeIds) { return Promise.resolve(runtimeIds.map(id => String(id))); },
          setSelection: function(selector, mode) {
            window.__calls.push(['setSelection', JSON.parse(JSON.stringify(selector)), mode]);
            return Promise.resolve();
          },
          setCamera: function(arg) {
            window.__calls.push(['setCamera', JSON.parse(JSON.stringify(arg))]);
            return Promise.resolve();
          },
          isolateEntities: function(modelEntities) {
            window.__calls.push(['isolateEntities', JSON.parse(JSON.stringify(modelEntities))]);
            return Promise.resolve(true);
          },
          setObjectState: function(selector, state) {
            window.__calls.push(['setObjectState', selector === undefined ? undefined : JSON.parse(JSON.stringify(selector)), JSON.parse(JSON.stringify(state))]);
            return Promise.resolve();
          },
          getSelection: function() { return Promise.resolve([]); }
        }
      }); } };`
  }));
  await page.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));

  await page.route('https://api.github.com/**', route => {
    const url = route.request().url();
    if (url.includes('plan_items.json')) {
      const content = Buffer.from(JSON.stringify(TEST_ITEMS_ROWS)).toString('base64');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content, sha: 'abc123' }) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) });
  });

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const itemCountText = await page.locator('#itemCount').innerText();
  if (itemCountText.trim() !== '4/4') throw new Error('Förväntade 4/4 laddade objekt, fick: ' + itemCountText);

  // ---- 1) Standardsortering: grupperat på Område, "Sortera A-Ö" ikryssad,
  //         och grupperna visas i bokstavsordning (Alby FÖRE Hus A) direkt.
  const groupByValue = await page.locator('#groupBy').inputValue();
  if (groupByValue !== 'area') throw new Error('Förväntade #groupBy="area" som standard, fick: ' + groupByValue);
  const sortAlphaChecked = await page.locator('#sortAlpha').isChecked();
  if (!sortAlphaChecked) throw new Error('Förväntade #sortAlpha ikryssad som standard');
  const groupTitles = await page.locator('#itemList .group-title').allTextContents();
  if (!groupTitles[0].toLowerCase().startsWith('alby')) {
    throw new Error('Förväntade Alby som FÖRSTA grupp (bokstavsordning), fick: ' + JSON.stringify(groupTitles));
  }
  console.log('OK: listan är grupperad på Område och sorterad A-Ö direkt när appen öppnas');

  // ---- 4) Slumpat name-attribut på autocomplete-fälten (skydd mot Chromes
  //         egen "Sparade data"-ruta, som ignorerar autocomplete="off").
  const fAreaName = await page.locator('#fArea').getAttribute('name');
  if (!fAreaName || fAreaName === 'fArea' || !fAreaName.startsWith('fArea-')) {
    throw new Error('#fArea skulle ha ett slumpat name-attribut (t.ex. "fArea-xyz"), fick: ' + JSON.stringify(fAreaName));
  }
  console.log('OK: autocomplete-fälten har ett slumpat name-attribut som skydd mot webbläsarens egen "Sparade data"-ruta');

  // ---- 2) + 3) "Välj alla" på en HOPFÄLLD grupp: markerar de objekt som
  //         finns i modellen, badgear det som saknas, fäller INTE ut gruppen,
  //         och visar ingen alert().
  await page.locator('#btnCollapseAllGroups').click();
  await page.waitForTimeout(150);
  let visibleRows = await page.locator('#itemList .item-row').count();
  if (visibleRows !== 0) throw new Error('Förväntade 0 synliga rader efter "Minimera alla", fick ' + visibleRows);

  await page.evaluate(() => { window.__calls.length = 0; });
  // "Hus A" är andra gruppen (Alby kommer först i bokstavsordning).
  const husAGroupButton = page.locator('.group-header', { hasText: 'HUS A' }).locator('.group-select-all');
  await husAGroupButton.click();
  await page.waitForTimeout(250);

  if (alerts.length > 0) throw new Error('"Välj alla" med delvis saknade objekt skulle INTE visa alert(): ' + alerts.join(' | '));

  const calls = await page.evaluate(() => window.__calls);
  const selectionCalls = calls.filter(c => c[0] === 'setSelection');
  if (selectionCalls.length !== 1) throw new Error('Förväntade exakt 1 setSelection-anrop, fick ' + selectionCalls.length);
  const selectedRuntimeIds = selectionCalls[0][1].modelObjectIds[0].objectRuntimeIds.slice().sort((a, b) => a - b);
  if (JSON.stringify(selectedRuntimeIds) !== JSON.stringify([10, 20])) {
    throw new Error('Skulle markera de TVÅ objekt som finns i modellen (10, 20), fick: ' + JSON.stringify(selectedRuntimeIds));
  }

  // Gruppen ska fortfarande vara hopfälld - "Välj alla" ska inte fälla ut den.
  visibleRows = await page.locator('#itemList .item-row').count();
  if (visibleRows !== 0) throw new Error('"Välj alla" fällde felaktigt ut gruppen (' + visibleRows + ' rader syns nu)');
  console.log('OK: "Välj alla" på en hopfälld grupp markerar inte ut den, och visar ingen alert() vid delvis saknade objekt');

  // Fäll ut gruppen manuellt för att kunna se badgen på det saknade objektet.
  await page.locator('.group-header', { hasText: 'HUS A' }).locator('.group-title').click();
  await page.waitForTimeout(150);
  const missingRowText = await page.locator('#itemList .item-row', { hasText: 'Pelare A3' }).innerText();
  if (!missingRowText.includes('Ej i modellen')) {
    throw new Error('Objektet som saknas i modellen skulle märkas med en varningstagg i listan: ' + missingRowText);
  }
  const foundRowText = await page.locator('#itemList .item-row', { hasText: 'Pelare A1' }).innerText();
  if (foundRowText.includes('Ej i modellen')) {
    throw new Error('Ett objekt som FINNS i modellen fick felaktigt varningstaggen: ' + foundRowText);
  }
  console.log('OK: objektet som saknas i den inlästa 3D-modellen märks tydligt i listan, utan att påverka de andra raderna');

  // ---- 5) "Byt namn": "Nytt/befintligt namn" föreslår befintliga värden.
  await page.locator('#btnRenameValue').click();
  await page.waitForTimeout(100);
  await page.selectOption('#renameField', 'area');
  await page.locator('#renameNewValue').click();
  await page.waitForTimeout(100);
  const renameSuggestions = await page.evaluate(() => Array.from(document.querySelectorAll('#renameNewValueList .autocomplete-item')).map(el => el.dataset.value));
  if (JSON.stringify(renameSuggestions) !== JSON.stringify(['Alby', 'Hus A'])) {
    throw new Error('"Nytt/befintligt namn" skulle föreslå befintliga områden (Alby, Hus A), fick: ' + JSON.stringify(renameSuggestions));
  }
  const renameNewValueName = await page.locator('#renameNewValue').getAttribute('name');
  if (!renameNewValueName || !renameNewValueName.startsWith('renameNewValue-')) {
    throw new Error('#renameNewValue skulle också ha ett slumpat name-attribut, fick: ' + JSON.stringify(renameNewValueName));
  }
  console.log('OK: "Byt namn"-dialogens "Nytt/befintligt namn"-fält föreslår befintliga värden för det valda fältet');
  await page.keyboard.press('Escape'); // stäng dropdownen igen innan vi klickar på knappen under den
  await page.waitForTimeout(100);
  await page.locator('#btnCloseRename').click();
  await page.waitForTimeout(100);

  // ---- 6) "Visa filtrerat" isolerar via isolateEntities (inte döljer allt
  //         själv), och "Visa alla kopplade objekt" återställer synligheten
  //         utan att fälla ihop Filter-panelen.
  // Filtrerar på "Alby" (inget saknat objekt där) - det här testet gäller
  // isolateEntities-bytet, inte det delvis-saknade-objekt-scenariot ovan.
  await page.evaluate(() => { window.__calls.length = 0; });
  await page.selectOption('#filterArea', ['Alby']);
  await page.locator('#btnApplyFilter').click();
  await page.waitForTimeout(250);

  const filterCalls = await page.evaluate(() => window.__calls);
  const isolateCalls = filterCalls.filter(c => c[0] === 'isolateEntities');
  const hideAllCalls = filterCalls.filter(c => c[0] === 'setObjectState' && c[1] === undefined && c[2] && c[2].visible === false);
  if (isolateCalls.length !== 1) throw new Error('"Visa filtrerat" skulle anropa isolateEntities exakt 1 gång, fick ' + isolateCalls.length);
  if (hideAllCalls.length !== 0) throw new Error('"Visa filtrerat" skulle INTE längre dölja allt själv via setObjectState(undefined, {visible:false})');
  const filterMsgAfterApply = await page.locator('#filterMsg').innerText();
  if (!filterMsgAfterApply.includes('Visar')) throw new Error('Oväntat filterMsg efter "Visa filtrerat": ' + filterMsgAfterApply);
  console.log('OK: "Visa filtrerat" använder Trimbles isolateEntities ("Visa endast valda objekt") istället för att själv dölja allt');

  const filterPanelCollapsedBefore = await page.locator('.panel[data-panel-id="filter"]').evaluate(el => el.classList.contains('collapsed'));
  if (filterPanelCollapsedBefore) throw new Error('Filter-panelen var oväntat redan hopfälld innan testet av "Visa alla kopplade objekt"');

  await page.evaluate(() => { window.__calls.length = 0; });
  await page.locator('#btnShowAllCoupled').click();
  await page.waitForTimeout(150);

  const resetCalls = (await page.evaluate(() => window.__calls)).filter(c => c[0] === 'setObjectState' && c[1] === undefined && c[2] && c[2].visible === 'reset');
  if (resetCalls.length !== 1) throw new Error('"Visa alla kopplade objekt" skulle återställa synligheten via setObjectState(undefined, {visible:"reset"}), fick ' + resetCalls.length + ' sådana anrop');
  const filterPanelCollapsedAfter = await page.locator('.panel[data-panel-id="filter"]').evaluate(el => el.classList.contains('collapsed'));
  if (filterPanelCollapsedAfter) throw new Error('"Visa alla kopplade objekt" fällde felaktigt ihop Filter-panelen (klicket bubblade till panelens header)');
  console.log('OK: "Visa alla kopplade objekt" återställer synligheten utan att fälla ihop Filter-panelen');

  await browser.close();
  server.close();

  console.log('Konsolfel:', consoleErrors);
  if (consoleErrors.length > 0) throw new Error('Konsolfel upptäcktes: ' + consoleErrors.join(' | '));
  console.log('OK: standardsortering, delvis-saknade-objekt-hantering, ingen oönskad gruppexpansion, dropdown-skydd, byt-namn-dropdown och isolateEntities-filtrering fungerar korrekt');
}

run().catch(e => { console.error(e); process.exit(1); });
