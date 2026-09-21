// Funktionstest: "Föreslå beroenden" (Victors uppföljande förfrågan
// 2026-09-21: "Är det någon av de här alternativen som är gratis och som
// vi kan implementera direkt? Och vi behöver inte skapa ett konto på nån
// annan sajt.?" -> ett rent regelbaserat (inte AI) förslag byggt på en
// vanlig byggordning, se ACTIVITY_SEQUENCE_KEYWORDS/computeDependency-
// Suggestions i app.js).
//  1) Två rader i samma område med samma bas-namn ("Formning Pelare A" /
//     "Gjutning Pelare A" - aktiviteten är ett prefix på namnet, se
//     baseNameForGrouping) och igenkända aktiviteter -> ett förslag.
//  2) Ett tredje, obesläktat objekt (annat namn) genererar INGET förslag.
//  3) Ett par som redan har depends_on satt genererar INGET nytt förslag.
//  4) Att klicka "Lägg till" på ett förslag skriver depends_on till
//     plan_items.json OCH tar bort förslaget ur listan.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8976;
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

const A_ID = 'row-a-formning';
const B_ID = 'row-b-gjutning';
const C_ID = 'row-c-obereoende';
const D_ID = 'row-d-formning-balk';
const E_ID = 'row-e-gjutning-balk';

const TEST_ITEMS_ROWS = [
  // Pelare A: Formning + Gjutning, samma område, inget beroende ännu -> ska föreslås.
  { id: A_ID, project_id: PROJECT_ID, model_id: 'model-1', object_id: '10', object_name: 'Formning Pelare A', area: 'Hus A', activity: 'Formning', contractor: 'NCC', status: 'pagaende', start_date: isoOffset(-5), end_date: isoOffset(2), actual_start_date: null, actual_end_date: null, estimated_hours: null, progress: 40, depends_on: [], updated_at: '2026-01-01T00:00:00Z' },
  { id: B_ID, project_id: PROJECT_ID, model_id: 'model-1', object_id: '11', object_name: 'Gjutning Pelare A', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'planerad', start_date: isoOffset(3), end_date: isoOffset(8), actual_start_date: null, actual_end_date: null, estimated_hours: null, progress: 0, depends_on: [], updated_at: '2026-01-01T00:00:00Z' },
  // Obesläktat objekt - annat namn, ska inte generera något förslag.
  { id: C_ID, project_id: PROJECT_ID, model_id: 'model-1', object_id: '12', object_name: 'Oberoende objekt', area: 'Hus B', activity: 'Montage', contractor: 'Skanska', status: 'planerad', start_date: isoOffset(0), end_date: isoOffset(5), actual_start_date: null, actual_end_date: null, estimated_hours: null, progress: 0, depends_on: [], updated_at: '2026-01-01T00:00:00Z' },
  // Balk A: Formning + Gjutning, MEN redan kopplade (depends_on satt) - ska inte generera ett NYTT förslag.
  { id: D_ID, project_id: PROJECT_ID, model_id: 'model-1', object_id: '13', object_name: 'Formning Balk A', area: 'Hus A', activity: 'Formning', contractor: 'NCC', status: 'klar', start_date: isoOffset(-10), end_date: isoOffset(-5), actual_start_date: isoOffset(-10), actual_end_date: isoOffset(-5), estimated_hours: null, progress: 100, depends_on: [], updated_at: '2026-01-01T00:00:00Z' },
  { id: E_ID, project_id: PROJECT_ID, model_id: 'model-1', object_id: '14', object_name: 'Gjutning Balk A', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'planerad', start_date: isoOffset(-4), end_date: isoOffset(0), actual_start_date: null, actual_end_date: null, estimated_hours: null, progress: 0, depends_on: [D_ID], updated_at: '2026-01-01T00:00:00Z' }
];

const store = new Map();
store.set(`projects/${PROJECT_ID}/plan_items.json`, { content: TEST_ITEMS_ROWS, sha: 'seed-sha' });
store.set(`projects/${PROJECT_ID}/plan_item_progress_history.json`, { content: [], sha: 'seed-sha-hist' });
store.set(`projects/${PROJECT_ID}/plan_item_baseline_history.json`, { content: [], sha: 'seed-sha-baseline' });
store.set(`projects/${PROJECT_ID}/plan_item_activities.json`, { content: [], sha: 'seed-sha-act' });
store.set(`projects/${PROJECT_ID}/plan_item_comments.json`, { content: [], sha: 'seed-sha-comments' });
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

  let lastItemsPutBody = null;
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

  await page.locator('#btnSuggestDeps').click();
  await page.waitForTimeout(150);
  const dialogVisible = await page.locator('#suggestDepsDialog').isVisible();
  if (!dialogVisible) throw new Error('Förväntade att "Föreslå beroenden"-dialogen öppnas vid klick');

  const rows = page.locator('.suggest-dep-row');
  const rowCount = await rows.count();
  if (rowCount !== 1) throw new Error('Förväntade exakt 1 förslag (Pelare A: Formning -> Gjutning; Balk A är redan kopplat, Hus B är obesläktat), fick: ' + rowCount);
  const rowText = await rows.first().innerText();
  if (!/Formning Pelare A/.test(rowText) || !/Gjutning Pelare A/.test(rowText)) {
    throw new Error('Förväntade att förslaget gäller Formning Pelare A -> Gjutning Pelare A, fick: ' + rowText);
  }
  console.log('OK: "Föreslå beroenden" hittar rätt (och bara rätt) förslag - känner igen att "Formning X"/"Gjutning X" är samma plats trots olika namn, hoppar över redan kopplade par och obesläktade objekt');

  await rows.first().locator('[data-action="accept-suggestion"]').click();
  await page.waitForTimeout(400);

  if (!lastItemsPutBody) throw new Error('Förväntade en PUT mot plan_items.json efter "Lägg till"');
  const savedB = lastItemsPutBody.find(r => r.id === B_ID);
  if (!savedB || !Array.isArray(savedB.depends_on) || !savedB.depends_on.includes(A_ID)) {
    throw new Error('Förväntade att Gjutning Pelare A (B) fått depends_on=[A] efter att förslaget accepterats, fick: ' + JSON.stringify(savedB && savedB.depends_on));
  }
  console.log('OK: att klicka "Lägg till" på ett förslag sparar beroendet till plan_items.json');

  const rowCountAfter = await page.locator('.suggest-dep-row').count();
  if (rowCountAfter !== 0) throw new Error('Förväntade att förslaget försvinner ur listan efter att det lagts till, fick ' + rowCountAfter + ' kvarvarande rader');
  const emptyText = await page.locator('#suggestDepsList').innerText();
  if (!/Inga nya förslag/.test(emptyText)) throw new Error('Förväntade ett "Inga nya förslag"-meddelande när listan är tom, fick: ' + emptyText);
  console.log('OK: förslaget försvinner ur listan direkt efter att det lagts till, och ett tydligt tomt-läge visas');

  await browser.close();
  server.close();

  console.log('Konsolfel:', consoleErrors);
  if (consoleErrors.length > 0) throw new Error('Konsolfel upptäcktes: ' + consoleErrors.join(' | '));
  console.log('OK: "Föreslå beroenden" (gratis, regelbaserat, inget nytt konto) fungerar korrekt');
}

run().catch(e => { console.error(e); process.exit(1); });
