// Funktionstest: "Synliga block" i 4D-planerings inställningar (Victors
// förfrågan 2026-09-17, gäller båda apparna: "Man ska kunna välja från en
// lista vilka block man vill ha synliga").
//  1) Inställningsdialogen listar en kryssruta per block, ikryssade
//     (synliga) som standard.
//  2) Att bocka ur en kryssruta döljer blocket direkt (display:none),
//     helt oberoende av minimera/expandera-funktionen.
//  3) Valet sparas i localStorage och gäller efter en omladdning.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8967;
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
  { id: 'row-a', project_id: PROJECT_ID, model_id: 'model-1', object_id: '10', object_name: 'Pelare A', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'planerad', start_date: '2026-02-01', end_date: '2026-02-10', actual_start_date: null, actual_end_date: null, estimated_hours: null, progress: 0, updated_at: '2026-01-01T00:00:00Z' }
];

const store = new Map();
store.set(`projects/${PROJECT_ID}/plan_items.json`, { content: TEST_ITEMS_ROWS, sha: 'seed-sha' });
store.set(`projects/${PROJECT_ID}/plan_item_progress_history.json`, { content: [], sha: 'seed-sha-hist' });
store.set(`projects/${PROJECT_ID}/plan_item_activities.json`, { content: [], sha: 'seed-sha-act' });
function shaFor(content) {
  return crypto.createHash('sha1').update(JSON.stringify(content)).digest('hex') + Math.random().toString(16).slice(2, 6);
}

async function run() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 480, height: 1600 } });

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
    if (!window.localStorage.getItem('4dplan-settings')) {
      window.localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 'fake-token-for-test' }));
    }
    window.localStorage.setItem('4dplan-unlocked', '1');
  });

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // ---- 1) Inställningarna listar en kryssruta per block, ikryssade som standard.
  await page.locator('#btnSettings').click();
  await page.waitForTimeout(50);
  const checkCount = await page.locator('.panel-visibility-check').count();
  const panelCount = await page.locator('section.panel[data-panel-id]').count();
  if (checkCount !== panelCount || panelCount === 0) throw new Error(`Förväntade en kryssruta per block (${panelCount}), fick ${checkCount}`);
  const timelineCheck = page.locator('.panel-visibility-check[data-panel-id="timeline"]');
  if (!(await timelineCheck.isChecked())) throw new Error('Tidslinje-blocket skulle vara ikryssat (synligt) som standard');
  console.log('OK: inställningarna listar en kryssruta per block, alla ikryssade (synliga) som standard');

  // ---- 2) Att bocka ur "Tidslinje" döljer blocket direkt, andra block påverkas inte.
  await timelineCheck.uncheck();
  await page.waitForTimeout(50);
  const timelinePanelDisplay = await page.locator('section.panel[data-panel-id="timeline"]').evaluate(el => getComputedStyle(el).display);
  if (timelinePanelDisplay !== 'none') throw new Error('Tidslinje-blocket skulle vara dolt (display:none) efter urbockning, fick: ' + timelinePanelDisplay);
  const itemsPanelDisplay = await page.locator('section.panel[data-panel-id="items"]').evaluate(el => getComputedStyle(el).display);
  if (itemsPanelDisplay === 'none') throw new Error('Planerade objekt-blocket skulle fortfarande vara synligt (bara Tidslinje bockades ur)');
  console.log('OK: att bocka ur ett block döljer det direkt (display:none), andra block påverkas inte');

  // ---- 3) Valet överlever en omladdning (sparas i localStorage).
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const timelinePanelDisplayAfterReload = await page.locator('section.panel[data-panel-id="timeline"]').evaluate(el => getComputedStyle(el).display);
  if (timelinePanelDisplayAfterReload !== 'none') throw new Error('Det dolda blocket skulle förbli dolt efter en omladdning, fick: ' + timelinePanelDisplayAfterReload);
  console.log('OK: vilka block som är dolda sparas i localStorage och gäller efter omladdning');

  await browser.close();
  server.close();

  console.log('Konsolfel:', consoleErrors);
  if (consoleErrors.length > 0) throw new Error('Konsolfel upptäcktes: ' + consoleErrors.join(' | '));
  console.log('OK: "Synliga block"-funktionen fungerar korrekt i 4D-planering');
}

run().catch(e => { console.error(e); process.exit(1); });
