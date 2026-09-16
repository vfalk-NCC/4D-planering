// Funktionstest: verifierar de tre nya funktionerna i 4D-planering:
//  1) "Markera alla" (#btnSelectAllCoupled) markerar samtliga kopplade
//     objekt i 3D-vyn, och kameran hamnar på DUBBLA avståndet från
//     markeringens mittpunkt jämfört med Trimbles auto-zoom.
//  2) "Minimera alla" (#btnCollapseAllGroups) minimerar alla grupper i
//     "Planerade objekt"-listan.
//  3) Filtrets rullistor (Område/Aktivitet/Entreprenör/Status) är
//     drabara (CSS resize: vertical) och markerar (men zoomar/isolerar
//     inte) matchande objekt direkt vid ändring.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8943;
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

// Testdata: två kopplade objekt i samma modell, olika status så att
// gruppering på status ger två grupper.
const TEST_ITEMS_ROWS = [
  {
    id: 'row-1', project_id: 'test-project', model_id: 'model-1', object_id: '10',
    object_name: 'Pelare A1', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC',
    status: 'planerad', start_date: null, end_date: null, progress: 0, updated_at: '2026-01-01T00:00:00Z'
  },
  {
    id: 'row-2', project_id: 'test-project', model_id: 'model-1', object_id: '20',
    object_name: 'Pelare A2', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC',
    status: 'klar', start_date: null, end_date: null, progress: 100, updated_at: '2026-01-01T00:00:00Z'
  }
];

// Fast bounding box (0,0,0)-(10,10,10) för alla objekt -> mittpunkt (5,5,5).
// Trimbles (mockade) auto-zoom-kamera hamnar på (5,5,25), dvs 20 enheter
// från mittpunkten längs z-axeln. Efter dubblering ska kameran hamna på
// (5,5,45) - exakt dubbla avståndet (40), på samma siktlinje.
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

  // Hoppa förbi lösenordsgrinden och GitHub-token-inställningen - körs
  // innan appens egna skript, precis som i test_access_gate.js.
  await page.addInitScript(() => {
    window.localStorage.setItem('4dplan-unlocked', '1');
    window.localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 'test-token' }));
    // Loggbok som testet läser ut i slutet - fångar exakt vilka viewer-anrop
    // som gjordes, i ordning.
    window.__calls = [];
  });

  await page.route('https://components.connect.trimble.com/**', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      window.TrimbleConnectWorkspace = { connect: function() { return Promise.resolve({
        project: { getProject: function(){ return Promise.resolve({ id: 'test-project' }); } },
        viewer: {
          convertToObjectRuntimeIds: function(modelId, objectIds) {
            window.__calls.push(['convertToObjectRuntimeIds', modelId, objectIds]);
            return Promise.resolve(objectIds.map(id => Number(id)));
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
            window.__calls.push(['getCamera']);
            return Promise.resolve(${JSON.stringify(AUTO_FIT_CAMERA)});
          },
          getObjectBoundingBoxes: function(modelId, ids) {
            window.__calls.push(['getObjectBoundingBoxes', modelId, ids]);
            return Promise.resolve(ids.map(id => ({ id, boundingBox: ${JSON.stringify(FIXED_BOX)} })));
          },
          setObjectState: function() { return Promise.resolve(); },
          getSelection: function() { return Promise.resolve([]); }
        }
      }); } };`
  }));
  await page.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));

  // Mocka GitHub Contents API: plan_items.json innehåller testdatan ovan,
  // allt annat (kommentarer, progress-historik) svarar 404 -> tom array.
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

  // ---- 0) Grinden ska vara förbikopplad, appen ska ha laddat testobjekten.
  const gateHidden = await page.locator('#accessGate').isHidden();
  if (!gateHidden) throw new Error('accessGate borde vara dold (redan upplåst via localStorage)');
  const itemCountText = await page.locator('#itemCount').innerText();
  if (itemCountText.trim() !== '2/2') throw new Error('Förväntade 2/2 laddade objekt, fick: ' + itemCountText);

  // ---- 1) Filtrets rullistor ska vara vertikalt drabara.
  const resizeValue = await page.locator('#filterArea').evaluate(el => getComputedStyle(el).resize);
  if (resizeValue !== 'vertical') throw new Error('filterArea saknar CSS resize:vertical, fick: ' + resizeValue);

  // ---- 2) "Markera alla kopplade objekt" (#btnSelectAllCoupled).
  await page.evaluate(() => { window.__calls.length = 0; });
  await page.locator('#btnSelectAllCoupled').click();
  await page.waitForTimeout(200);
  let calls = await page.evaluate(() => window.__calls);

  const selectionCalls = calls.filter(c => c[0] === 'setSelection');
  if (selectionCalls.length !== 1) throw new Error('Förväntade exakt 1 setSelection-anrop, fick ' + selectionCalls.length);
  const sel = selectionCalls[0][1];
  const runtimeIds = sel.modelObjectIds[0].objectRuntimeIds.slice().sort();
  if (sel.modelObjectIds[0].modelId !== 'model-1' || JSON.stringify(runtimeIds) !== JSON.stringify([10, 20])) {
    throw new Error('setSelection markerade fel objekt: ' + JSON.stringify(sel));
  }

  // Zoomen ska nu vara EN enda kamerarörelse - bara Trimbles egen "zooma
  // till markering", ingen egen efterjustering (den gav tidigare en synlig
  // "zoomar in, zoomar ut igen"-känsla och togs bort på Victors begäran).
  const cameraCalls = calls.filter(c => c[0] === 'setCamera');
  if (cameraCalls.length !== 1) throw new Error('Förväntade exakt 1 setCamera-anrop (bara Trimbles egen zoom, ingen dubblering), fick ' + cameraCalls.length);
  if (JSON.stringify(cameraCalls[0][1]) !== JSON.stringify(sel)) {
    throw new Error('setCamera skulle anropas med exakt samma selector som setSelection: ' + JSON.stringify(cameraCalls[0][1]));
  }
  console.log('OK: "Markera alla" markerar alla kopplade objekt och zoomar in i en enda kamerarörelse (ingen dubblering/utzoomning)');

  // ---- 3) Gruppera på status, sedan "Minimera alla" (#btnCollapseAllGroups).
  await page.selectOption('#groupBy', 'status');
  await page.waitForTimeout(150);
  let groupHeaderCount = await page.locator('#itemList .group-header').count();
  if (groupHeaderCount !== 2) throw new Error('Förväntade 2 grupper (planerad/klar), fick ' + groupHeaderCount);
  let visibleRowsBefore = await page.locator('#itemList .item-row').count();
  if (visibleRowsBefore !== 2) throw new Error('Förväntade 2 synliga rader innan minimering, fick ' + visibleRowsBefore);

  await page.locator('#btnCollapseAllGroups').click();
  await page.waitForTimeout(150);
  const visibleRowsAfter = await page.locator('#itemList .item-row').count();
  if (visibleRowsAfter !== 0) throw new Error('"Minimera alla" minimerade inte alla grupper, ' + visibleRowsAfter + ' rader syns fortfarande');
  groupHeaderCount = await page.locator('#itemList .group-header').count();
  if (groupHeaderCount !== 2) throw new Error('Gruppheaders ska fortfarande synas efter minimering, fick ' + groupHeaderCount);
  console.log('OK: "Minimera alla" minimerar samtliga grupper i objektlistan');

  // Återställ gruppering för nästa steg.
  await page.selectOption('#groupBy', '');
  await page.waitForTimeout(150);

  // ---- 4) Filterval ska markera matchande objekt direkt, UTAN att flytta kameran.
  await page.evaluate(() => { window.__calls.length = 0; });
  await page.selectOption('#filterArea', ['Hus A']);
  await page.waitForTimeout(200);
  calls = await page.evaluate(() => window.__calls);

  const filterSelectionCalls = calls.filter(c => c[0] === 'setSelection');
  if (filterSelectionCalls.length !== 1) throw new Error('Förväntade exakt 1 setSelection vid filterval, fick ' + filterSelectionCalls.length);
  const filterSel = filterSelectionCalls[0][1];
  const filterRuntimeIds = filterSel.modelObjectIds[0].objectRuntimeIds.slice().sort();
  if (JSON.stringify(filterRuntimeIds) !== JSON.stringify([10, 20])) {
    throw new Error('Filtervalet markerade fel objekt: ' + JSON.stringify(filterSel));
  }
  const filterCameraCalls = calls.filter(c => c[0] === 'setCamera');
  if (filterCameraCalls.length !== 0) throw new Error('Filtervalet skulle inte flytta kameran, men setCamera anropades ' + filterCameraCalls.length + ' gång(er)');
  console.log('OK: filterval markerar matchande objekt direkt utan att flytta kameran');

  await browser.close();
  server.close();

  console.log('Konsolfel:', consoleErrors);
  if (consoleErrors.length > 0) throw new Error('Konsolfel upptäcktes: ' + consoleErrors.join(' | '));
  console.log('OK: samtliga tre nya funktioner i 4D-planering fungerar korrekt');
}

run().catch(e => { console.error(e); process.exit(1); });
