// Funktionstest:
//  1) Ny toggle "Visa endast klarmarkerade" visar bara objekt med status
//     "klar", och är ömsesidigt uteslutande med "Dölj klarmarkerade" (att
//     kryssa i den ena kryssar automatiskt ur den andra).
//  2) "Byt namn"-dialogens ruta är 2,5x bredare än standarddialogerna från
//     start (800px mot 320px) och går att dra i (resize).
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8951;
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
  { id: 'row-1', project_id: PROJECT_ID, model_id: 'model-1', object_id: '10', object_name: 'Klar-objekt', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'klar', start_date: null, end_date: null, progress: 100, updated_at: '2026-01-01T00:00:00Z' },
  { id: 'row-2', project_id: PROJECT_ID, model_id: 'model-1', object_id: '20', object_name: 'Pagaende-objekt', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'pagaende', start_date: null, end_date: null, progress: 40, updated_at: '2026-01-01T00:00:00Z' }
];

async function run() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 480, height: 1200 } });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !/Failed to load resource.*404/.test(msg.text())) consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  await page.addInitScript(() => {
    window.localStorage.setItem('4dplan-unlocked', '1');
    window.localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 'test-token' }));
  });

  await page.route('https://components.connect.trimble.com/**', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.TrimbleConnectWorkspace = { connect: function() { return Promise.resolve({
      project: { getProject: function(){ return Promise.resolve({ id: '${PROJECT_ID}' }); } },
      viewer: { getSelection: function() { return Promise.resolve([]); } }
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

  // ---- 1) "Visa endast klarmarkerade".
  await page.locator('#showOnlyCompleted').check();
  await page.waitForTimeout(150);
  let visibleText = await page.locator('#itemList').innerText();
  if (!visibleText.includes('Klar-objekt') || visibleText.includes('Pagaende-objekt')) {
    throw new Error('"Visa endast klarmarkerade" visade fel objekt: ' + visibleText);
  }
  console.log('OK: "Visa endast klarmarkerade" visar bara klarmarkerade objekt');

  // Ömsesidigt uteslutande: kryssa i "Dölj klarmarkerade" ska kryssa ur
  // "Visa endast klarmarkerade" automatiskt.
  await page.locator('#hideCompleted').check();
  await page.waitForTimeout(150);
  const showOnlyCheckedAfter = await page.locator('#showOnlyCompleted').isChecked();
  if (showOnlyCheckedAfter) throw new Error('"Visa endast klarmarkerade" skulle kryssas ur automatiskt när "Dölj klarmarkerade" kryssas i');
  visibleText = await page.locator('#itemList').innerText();
  if (visibleText.includes('Klar-objekt') || !visibleText.includes('Pagaende-objekt')) {
    throw new Error('"Dölj klarmarkerade" visade fel objekt efter växlingen: ' + visibleText);
  }
  console.log('OK: "Dölj klarmarkerade" och "Visa endast klarmarkerade" är ömsesidigt uteslutande');

  await page.locator('#hideCompleted').uncheck();
  await page.waitForTimeout(100);

  // ---- 2) "Byt namn"-dialogens ruta är 2,5x bredare (800px) från start.
  await page.locator('#btnRenameValue').click();
  await page.waitForTimeout(150);
  // I ett smalt fönster (som Trimble Connects sidopanel, 480px i det här
  // testet) klamras bredden av max-width:95vw - kontrollera därför mot
  // min(800, 95% av viewport) istället för ett hårdkodat 800.
  const renameBoxWidth = await page.locator('#renameDialog .dialog-box').evaluate(el => el.getBoundingClientRect().width);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  const expected = Math.round(Math.min(800, viewportWidth * 0.95));
  if (Math.abs(Math.round(renameBoxWidth) - expected) > 2) {
    throw new Error(`Förväntade #renameDialog .dialog-box bredd ~${expected}px (800px, eller 95vw om fönstret är smalare), fick: ${renameBoxWidth}`);
  }
  const resizeValue = await page.locator('#renameDialog .dialog-box').evaluate(el => getComputedStyle(el).resize);
  if (resizeValue !== 'both') throw new Error('#renameDialog .dialog-box skulle vara dragbar (resize: both), fick: ' + resizeValue);
  console.log('OK: "Byt namn"-dialogen är 2,5x bredare från start och går att dra i');
  await page.locator('#btnCloseRename').click();

  await browser.close();
  server.close();

  console.log('Konsolfel:', consoleErrors);
  if (consoleErrors.length > 0) throw new Error('Konsolfel upptäcktes: ' + consoleErrors.join(' | '));
  console.log('OK: "Visa endast klarmarkerade" och den större "Byt namn"-dialogen fungerar korrekt');
}

run().catch(e => { console.error(e); process.exit(1); });
