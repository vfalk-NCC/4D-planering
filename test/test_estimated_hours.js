// Funktionstest: "Uppskattade timmar" per delaktivitet/objekt (Victors
// förfrågan 2026-09-17: "Lägg till ett alternativ att lägga in tid på
// aktiviteten, så att man kan se hur lång tid det tar att göra hela
// objektet").
//  1) Utan delaktiviteter: fylls i för hand på huvudobjektet, sparas som
//     estimated_hours i plan_items.json.
//  2) Med delaktiviteter: varje delaktivitet har ett eget timmar-fält,
//     huvudfältet "Uppskattade timmar" summeras automatiskt och låses,
//     precis som Aktivitet/Start/Slut redan gör.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8962;
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

const TEST_ITEMS_ROWS = [
  { id: 'row-a', project_id: PROJECT_ID, model_id: 'model-1', object_id: '10', object_name: 'Pelare A', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'planerad', start_date: isoOffset(-2), end_date: isoOffset(3), actual_start_date: null, actual_end_date: null, estimated_hours: null, progress: 0, updated_at: '2026-01-01T00:00:00Z' }
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

  let lastItemsPutBody = null;
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
      if (filePath === `projects/${PROJECT_ID}/plan_items.json`) lastItemsPutBody = content;
      if (filePath === `projects/${PROJECT_ID}/plan_item_activities.json`) lastActivitiesPutBody = content;
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

  // ---- 1) Utan delaktiviteter: manuellt ifyllt.
  await page.locator('.item-row', { hasText: 'Pelare A' }).first().locator('[data-action="edit"]').click();
  await page.waitForTimeout(150);
  const hoursFieldReadonly0 = await page.locator('#fEstimatedHours').evaluate(el => el.readOnly);
  if (hoursFieldReadonly0) throw new Error('Uppskattade timmar ska vara redigerbart när inga delaktiviteter finns');
  await page.locator('#fEstimatedHours').fill('12.5');
  await page.locator('#btnSaveLink').click();
  await page.waitForTimeout(400);

  if (!lastItemsPutBody) throw new Error('Förväntade en PUT mot plan_items.json');
  const rowA = lastItemsPutBody.find(r => r.id === 'row-a');
  if (rowA.estimated_hours !== 12.5) throw new Error('Förväntade estimated_hours=12.5 för Pelare A, fick: ' + rowA.estimated_hours);
  console.log('OK: manuellt ifyllda "Uppskattade timmar" sparas korrekt på objektet');

  // ---- 2) Med delaktiviteter: summeras automatiskt och låses.
  await page.locator('.item-row', { hasText: 'Pelare A' }).first().locator('[data-action="edit"]').click();
  await page.waitForTimeout(150);
  const existingHours = await page.locator('#fEstimatedHours').inputValue();
  if (existingHours !== '12.5') throw new Error('Förväntade förifyllt 12.5 timmar vid omöppning, fick: ' + existingHours);

  await page.locator('#btnAddSubActivity').click();
  await page.locator('#btnAddSubActivity').click();
  const rows = page.locator('.sub-activity-row');
  await rows.nth(0).locator('.sub-activity-name').fill('Formning');
  await rows.nth(0).locator('.sub-activity-start').fill(isoOffset(1));
  await rows.nth(0).locator('.sub-activity-end').fill(isoOffset(2));
  await rows.nth(0).locator('.sub-activity-hours').fill('4');
  await rows.nth(0).locator('.sub-activity-hours').dispatchEvent('input');
  await rows.nth(1).locator('.sub-activity-name').fill('Gjutning');
  await rows.nth(1).locator('.sub-activity-start').fill(isoOffset(3));
  await rows.nth(1).locator('.sub-activity-end').fill(isoOffset(4));
  await rows.nth(1).locator('.sub-activity-hours').fill('6.5');
  await rows.nth(1).locator('.sub-activity-hours').dispatchEvent('input');
  await page.waitForTimeout(100);

  const summedHours = await page.locator('#fEstimatedHours').inputValue();
  if (summedHours !== '10.5') throw new Error('Förväntade summerade timmar 4+6.5=10.5, fick: ' + summedHours);
  const hoursFieldReadonly1 = await page.locator('#fEstimatedHours').evaluate(el => el.readOnly);
  if (!hoursFieldReadonly1) throw new Error('Uppskattade timmar ska låsas (readonly) när delaktiviteter finns');
  console.log('OK: "Uppskattade timmar" summeras automatiskt från delaktiviteterna och låses');

  await page.locator('#btnSaveLink').click();
  await page.waitForTimeout(400);

  const rowAAfter = lastItemsPutBody.find(r => r.id === 'row-a');
  if (rowAAfter.estimated_hours !== 10.5) throw new Error('Förväntade estimated_hours=10.5 efter sparning med delaktiviteter, fick: ' + rowAAfter.estimated_hours);
  if (!lastActivitiesPutBody) throw new Error('Förväntade en PUT mot plan_item_activities.json');
  const savedActivities = lastActivitiesPutBody.filter(a => a.plan_item_id === 'row-a');
  if (savedActivities.length !== 2) throw new Error('Förväntade 2 sparade delaktiviteter, fick: ' + JSON.stringify(savedActivities));
  const formning = savedActivities.find(a => a.name === 'Formning');
  const gjutning = savedActivities.find(a => a.name === 'Gjutning');
  if (formning.estimated_hours !== 4) throw new Error('Förväntade Formning=4h, fick: ' + formning.estimated_hours);
  if (gjutning.estimated_hours !== 6.5) throw new Error('Förväntade Gjutning=6.5h, fick: ' + gjutning.estimated_hours);
  console.log('OK: varje delaktivitets timmar sparas korrekt i plan_item_activities.json');

  await browser.close();
  server.close();

  console.log('Konsolfel:', consoleErrors);
  if (consoleErrors.length > 0) throw new Error('Konsolfel upptäcktes: ' + consoleErrors.join(' | '));
  console.log('OK: Uppskattade timmar (manuellt + summerat från delaktiviteter) fungerar korrekt');
}

run().catch(e => { console.error(e); process.exit(1); });
