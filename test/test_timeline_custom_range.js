// Funktionstest: manuellt inställbart start-/slutdatum för tidslinjens
// slider (Victors förfrågan 2026-09-17: "Man ska kunna ställa in egna
// intervallen på tidslinje, [...] ställa start och slutdatum på slidern").
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8963;
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
  const page = await browser.newPage({ viewport: { width: 480, height: 1400 } });

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
        setSelection: function() { return Promise.resolve(); },
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
    // addInitScript körs vid VARJE navigering (inklusive reload) - skriv
    // bara startvärdet om inget redan finns, annars skulle en omladdning i
    // testet (steg 5) nollställa det Victor precis sparat via appen.
    if (!window.localStorage.getItem('4dplan-settings')) {
      window.localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 'fake-token-for-test' }));
    }
    window.localStorage.setItem('4dplan-unlocked', '1');
  });

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // ---- 1) Auto-intervall som standard (brett, minst 2025-01-01 - 2030-12-31).
  const sliderMaxAuto = await page.locator('#timelineSlider').getAttribute('max');
  if (Number(sliderMaxAuto) < 2000) throw new Error('Förväntade ett brett auto-intervall (flera tusen dagar) innan något eget intervall satts, fick max=' + sliderMaxAuto);
  const rangeStartEmpty = await page.locator('#timelineRangeStart').inputValue();
  if (rangeStartEmpty !== '') throw new Error('"Anpassat intervall"-fälten ska vara tomma innan Victor satt något eget');
  console.log('OK: tidslinjen använder det breda auto-intervallet som standard');

  // ---- 2) Sätt eget intervall. Fälten ligger i ett hopfällt <details>-block.
  await page.locator('#timelineRangeDetails summary').click();
  await page.waitForTimeout(50);
  await page.locator('#timelineRangeStart').fill('2026-01-01');
  await page.locator('#timelineRangeEnd').fill('2026-03-31');
  await page.locator('#btnApplyTimelineRange').click();
  await page.waitForTimeout(100);

  const sliderMaxCustom = await page.locator('#timelineSlider').getAttribute('max');
  if (sliderMaxCustom !== '89') throw new Error('Förväntade slider max=89 (2026-01-01 till 2026-03-31), fick: ' + sliderMaxCustom);
  const dateMin = await page.locator('#timelineDate').getAttribute('min');
  const dateMax = await page.locator('#timelineDate').getAttribute('max');
  if (dateMin !== '2026-01-01' || dateMax !== '2026-03-31') throw new Error(`Förväntade datumfältets min/max att matcha det egna intervallet, fick min=${dateMin} max=${dateMax}`);
  console.log('OK: "Använd intervall" snävar in slidern till det angivna Från/Till');

  // ---- 3) Ogiltigt intervall (Från efter Till) avvisas med felmeddelande.
  await page.locator('#timelineRangeStart').fill('2026-06-01');
  await page.locator('#timelineRangeEnd').fill('2026-01-01');
  await page.locator('#btnApplyTimelineRange').click();
  await page.waitForTimeout(100);
  const errMsg = await page.locator('#timelineRangeStatus').innerText();
  if (!/tidigare/.test(errMsg)) throw new Error('Förväntade ett felmeddelande om att Från måste vara tidigare än Till, fick: ' + errMsg);
  const sliderMaxStillCustom = await page.locator('#timelineSlider').getAttribute('max');
  if (sliderMaxStillCustom !== '89') throw new Error('Ett ogiltigt intervall ska inte ändra det redan aktiva intervallet, fick max=' + sliderMaxStillCustom);
  console.log('OK: ett ogiltigt intervall (Från efter Till) avvisas utan att påverka det aktiva intervallet');

  // ---- 4) Återställ till auto.
  await page.locator('#btnResetTimelineRange').click();
  await page.waitForTimeout(100);
  const sliderMaxReset = await page.locator('#timelineSlider').getAttribute('max');
  if (Number(sliderMaxReset) < 2000) throw new Error('Förväntade att "Återställ" ger tillbaka det breda auto-intervallet, fick max=' + sliderMaxReset);
  const rangeStartAfterReset = await page.locator('#timelineRangeStart').inputValue();
  if (rangeStartAfterReset !== '') throw new Error('"Anpassat intervall"-fälten ska tömmas efter Återställ');
  console.log('OK: "Återställ" ger tillbaka det automatiska intervallet och tömmer fälten');

  // ---- 5) Intervallet är sparat i localStorage (överlever en omladdning).
  await page.locator('#timelineRangeStart').fill('2026-02-01');
  await page.locator('#timelineRangeEnd').fill('2026-02-28');
  await page.locator('#btnApplyTimelineRange').click();
  await page.waitForTimeout(100);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const rangeStartAfterReload = await page.locator('#timelineRangeStart').inputValue();
  const rangeEndAfterReload = await page.locator('#timelineRangeEnd').inputValue();
  if (rangeStartAfterReload !== '2026-02-01' || rangeEndAfterReload !== '2026-02-28') {
    throw new Error(`Det egna intervallet skulle sparas i localStorage och gälla efter omladdning, fick: ${rangeStartAfterReload} - ${rangeEndAfterReload}`);
  }
  console.log('OK: det egna intervallet sparas och gäller igen efter en omladdning');

  await browser.close();
  server.close();

  console.log('Konsolfel:', consoleErrors);
  if (consoleErrors.length > 0) throw new Error('Konsolfel upptäcktes: ' + consoleErrors.join(' | '));
  console.log('OK: anpassat intervall på tidslinjens slider fungerar korrekt');
}

run().catch(e => { console.error(e); process.exit(1); });
