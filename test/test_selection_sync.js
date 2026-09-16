// Funktionstest: 3D-markering -> "Planerade objekt"-listan (syncSelectionFromModel).
//  1) Markerar man ett kopplat objekt i modellen ska motsvarande rad
//     markeras i listan (och selCount uppdateras).
//  2) Om objektets grupp är hopfälld ska den fällas ut automatiskt så
//     raden syns, utan att andra hopfällda grupper påverkas.
//  3) Markerar man ett OKOPPLAT objekt i modellen (inget i listan matchar)
//     ska en befintlig manuell listmarkering lämnas orörd.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8948;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };

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

// Testdata: två kopplade objekt i olika områden (skilda grupper vid
// gruppering på "area"), plus ett tredje runtime-id (999) i modellen som
// INTE finns i listan (okopplat objekt).
const TEST_ITEMS_ROWS = [
  {
    id: 'row-1', project_id: 'test-project', model_id: 'model-1', object_id: '10',
    object_name: 'Pelare A1', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC',
    status: 'planerad', start_date: null, end_date: null, progress: 0, updated_at: '2026-01-01T00:00:00Z'
  },
  {
    id: 'row-2', project_id: 'test-project', model_id: 'model-1', object_id: '20',
    object_name: 'Pelare B1', area: 'Hus B', activity: 'Gjutning', contractor: 'NCC',
    status: 'planerad', start_date: null, end_date: null, progress: 0, updated_at: '2026-01-01T00:00:00Z'
  }
];

const FIXED_BOX = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
const AUTO_FIT_CAMERA = { position: { x: 5, y: 5, z: 25 }, fieldOfView: 60, pitch: 0, yaw: 0 };

async function run() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 480, height: 1000 } });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !/Failed to load resource.*404/.test(msg.text())) consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  await page.addInitScript(() => {
    window.localStorage.setItem('4dplan-unlocked', '1');
    window.localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 'test-token' }));
    window.__calls = [];
    // Testet sätter denna innan den simulerar en viewer.onSelectionChanged-
    // händelse, och mockens getSelection() svarar med den.
    window.__mockSelection = [];
  });

  await page.route('https://components.connect.trimble.com/**', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      window.TrimbleConnectWorkspace = { connect: function(target, callback) {
        // Spara callbacken så testet kan simulera "viewer.onSelectionChanged".
        window.__onWorkspaceEvent = callback;
        return Promise.resolve({
        project: { getProject: function(){ return Promise.resolve({ id: 'test-project' }); } },
        viewer: {
          convertToObjectRuntimeIds: function(modelId, objectIds) {
            window.__calls.push(['convertToObjectRuntimeIds', modelId, objectIds]);
            return Promise.resolve(objectIds.map(id => Number(id)));
          },
          convertToObjectIds: function(modelId, runtimeIds) {
            window.__calls.push(['convertToObjectIds', modelId, runtimeIds]);
            return Promise.resolve(runtimeIds.map(id => String(id)));
          },
          setSelection: function(selector, mode) {
            window.__calls.push(['setSelection', JSON.parse(JSON.stringify(selector)), mode]);
            return Promise.resolve();
          },
          setCamera: function(arg) {
            window.__calls.push(['setCamera', JSON.parse(JSON.stringify(arg))]);
            return Promise.resolve();
          },
          getCamera: function() {
            return Promise.resolve(${JSON.stringify(AUTO_FIT_CAMERA)});
          },
          getObjectBoundingBoxes: function(modelId, ids) {
            return Promise.resolve(ids.map(id => ({ id, boundingBox: ${JSON.stringify(FIXED_BOX)} })));
          },
          setObjectState: function() { return Promise.resolve(); },
          getSelection: function() { return Promise.resolve(window.__mockSelection); }
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
  if (itemCountText.trim() !== '2/2') throw new Error('Förväntade 2/2 laddade objekt, fick: ' + itemCountText);

  // ---- 1) Gruppera på område, minimera alla grupper (Hus A och Hus B).
  await page.selectOption('#groupBy', 'area');
  await page.waitForTimeout(150);
  await page.locator('#btnCollapseAllGroups').click();
  await page.waitForTimeout(150);
  let visibleRows = await page.locator('#itemList .item-row').count();
  if (visibleRows !== 0) throw new Error('Förväntade 0 synliga rader efter minimering, fick ' + visibleRows);

  // ---- 2) Simulera att objekt 20 (Pelare B1, Hus B) markeras i 3D-vyn.
  await page.evaluate(() => { window.__calls.length = 0; });
  await page.evaluate(() => {
    window.__mockSelection = [{ modelId: 'model-1', objectRuntimeIds: [20] }];
  });
  await page.evaluate(() => window.__onWorkspaceEvent('viewer.onSelectionChanged', {}));
  await page.waitForTimeout(250);

  const selCountText = await page.locator('#selCount').innerText();
  if (selCountText.trim() !== '1') throw new Error('Förväntade selCount=1, fick: ' + selCountText);

  const calls = await page.evaluate(() => window.__calls);
  const convertCalls = calls.filter(c => c[0] === 'convertToObjectIds');
  if (convertCalls.length !== 1 || convertCalls[0][1] !== 'model-1' || JSON.stringify(convertCalls[0][2]) !== JSON.stringify([20])) {
    throw new Error('convertToObjectIds anropades inte korrekt: ' + JSON.stringify(convertCalls));
  }

  // Hus B-gruppen ska nu ha fällts ut automatiskt (och bara den).
  visibleRows = await page.locator('#itemList .item-row').count();
  if (visibleRows !== 1) throw new Error('Förväntade 1 synlig (utfälld) rad, fick ' + visibleRows);
  const visibleRowText = await page.locator('#itemList .item-row').innerText();
  if (!visibleRowText.includes('Pelare B1')) throw new Error('Fel rad blev synlig: ' + visibleRowText);
  const selectedRowCount = await page.locator('#itemList .item-row.selected').count();
  if (selectedRowCount !== 1) throw new Error('Förväntade exakt 1 markerad rad, fick ' + selectedRowCount);
  console.log('OK: 3D-markering av kopplat objekt markerar rätt rad och fäller ut dess grupp');

  // ---- 3) Simulera att ett OKOPPLAT objekt (runtime-id 999) markeras.
  // Den befintliga listmarkeringen (Pelare B1) ska då lämnas orörd.
  await page.evaluate(() => {
    window.__mockSelection = [{ modelId: 'model-1', objectRuntimeIds: [999] }];
  });
  await page.evaluate(() => window.__onWorkspaceEvent('extension.onSelectionChanged', {}));
  await page.waitForTimeout(250);

  const stillSelectedText = await page.locator('#itemList .item-row.selected').innerText();
  if (!stillSelectedText.includes('Pelare B1')) {
    throw new Error('Markeringen i listan rensades felaktigt vid okopplat 3D-objekt: ' + stillSelectedText);
  }
  console.log('OK: markering i listan lämnas orörd när ett okopplat 3D-objekt markeras');

  await browser.close();
  server.close();

  console.log('Konsolfel:', consoleErrors);
  if (consoleErrors.length > 0) throw new Error('Konsolfel upptäcktes: ' + consoleErrors.join(' | '));
  console.log('OK: 3D-markering -> listmarkering (syncSelectionFromModel) fungerar korrekt');
}

run().catch(e => { console.error(e); process.exit(1); });
