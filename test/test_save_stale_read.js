// Läs-efter-skrivning (Victors rapport 2026-10-01): "När jag har sparat ett
// objekt måste jag vänta ca 10 sekunder innan jag kan koppla ett nytt
// objekt, annars buggar det." GitHubs Contents API kan i några sekunder
// efter en skrivning fortfarande lämna ut den GAMLA versionen av filen. Den
// gamla läsningen fick ersätta appens egen nyss skrivna version, så nästa
// sparning krockade (409) om och om igen tills omförsöken tog slut.
// Testet låter den låtsade GitHub-servern svara med den gamla versionen i
// 8 sekunder efter varje skrivning och kopplar två objekt direkt efter
// varandra: båda ska sparas, utan fel och utan lång väntan.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8951;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
const PROJECT_ID = 'test-project';

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(DOCS_DIR, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, () => resolve(server));
  });
}

const store = new Map(); // path -> { content: obj, sha: string }
function shaFor(content) {
  return crypto.createHash('sha1').update(JSON.stringify(content)).digest('hex') + Math.random().toString(16).slice(2, 6);
}

async function run() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 480, height: 2000 } });
  require('./_reveal').autoReveal(page);

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !/Failed to load resource.*(404|409|500)/.test(msg.text())) consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  // Fånga JS-alert() - den optimistiska flödet ska ALDRIG visa en alert()
  // för en misslyckad bakgrundssparning (det skulle ju dyka upp efter att
  // användaren redan gått vidare och glömt bort formuläret) - fel ska bara
  // synas via radens felmarkering + #saveStatus.
  const alerts = [];
  page.on('dialog', async (dialog) => { alerts.push(dialog.message()); await dialog.accept(); });

  let selObj = 1;
  await page.route('https://components.connect.trimble.com/**', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.TrimbleConnectWorkspace = { connect: function() { return Promise.resolve({
      project: { getProject: function(){ return Promise.resolve({ id: '${PROJECT_ID}' }); } },
      viewer: {
        getSelection: function() { return Promise.resolve([{ modelId: 'model-1', objectRuntimeIds: [window.__selObj || 1] }]); },
        convertToObjectIds: function(m, ids) { return Promise.resolve(ids.map(function(i){ return 'ext-obj-' + i; })); },
        getObjectProperties: function(m, ids) { return Promise.resolve(ids.map(function(i){ return { id: i, product: { name: 'Objekt ' + i } }; })); },
        setSelection: function() { return Promise.resolve(); }
      }
    }); } };`
  }));
  await page.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));

  const LAG_MS = 8000;
  const prev = new Map(); // path -> { entry, until } – den gamla versionen som fortfarande lämnas ut
  let conflicts = 0, itemGets = 0;
  await page.route('https://api.github.com/repos/vfalk-NCC/4D-data/contents/**', async route => {
    await new Promise(r => setTimeout(r, 120));
    const req = route.request();
    const url = new URL(req.url());
    const filePath = decodeURIComponent(url.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (req.method() === 'GET') {
      if (filePath.endsWith('plan_items.json')) itemGets++;
      const p = prev.get(filePath);
      const entry = p && Date.now() < p.until ? p.entry : store.get(filePath);
      if (!entry) { route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) }); return; }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(JSON.stringify(entry.content)).toString('base64'), sha: entry.sha }) });
      return;
    }
    if (req.method() === 'PUT') {
      const body = JSON.parse(req.postData() || '{}');
      const existing = store.get(filePath);
      if (existing && existing.sha !== body.sha) {
        if (filePath.endsWith('plan_items.json')) conflicts++;
        route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'conflict' }) });
        return;
      }
      const content = JSON.parse(Buffer.from(body.content, 'base64').toString('utf-8'));
      const newSha = shaFor(content);
      if (existing) prev.set(filePath, { entry: existing, until: Date.now() + LAG_MS });
      store.set(filePath, { content, sha: newSha });
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: newSha } }) });
      return;
    }
    route.fulfill({ status: 405, body: 'method not allowed' });
  });
  store.set(`projects/${PROJECT_ID}/plan_items.json`, { content: [], sha: shaFor([]) });

  await page.addInitScript(() => {
    window.localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 'fake-token-for-test' }));
    window.localStorage.setItem('4dplan-unlocked', '1');
  });
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const couple = async (n) => {
    await page.evaluate(i => { window.__selObj = i; }, n);
    await page.locator('#btnLinkSelection').click();
    await page.waitForTimeout(200);
    await page.locator('#fName').fill('Fundament ' + n);
    await page.locator('#btnSaveLink').click();
  };
  const t0 = Date.now();
  await couple(1);
  await page.waitForTimeout(1500); // första sparningen hinner bli klar
  await couple(2);                 // ...men GitHub lämnar fortfarande ut den gamla filen
  await page.waitForTimeout(500);
  await couple(3);
  // Vänta tills inget sparas längre (högst 6 s).
  for (let i = 0; i < 60; i++) {
    const pending = await page.evaluate(() => typeof saveJobs !== 'undefined' ? saveJobs.size : 0);
    if (!pending) break;
    await page.waitForTimeout(100);
  }
  const took = Date.now() - t0;
  const rows = store.get(`projects/${PROJECT_ID}/plan_items.json`).content;
  const names = rows.map(r => r.object_name).sort();
  const errs = await page.evaluate(() => items.filter(it => it._saveError).map(it => it._saveError));
  if (names.join(',') !== 'Fundament 1,Fundament 2,Fundament 3') throw new Error('Alla tre kopplingarna sparades inte: ' + JSON.stringify(names));
  if (errs.length) throw new Error('Sparfel i listan: ' + JSON.stringify(errs));
  if (alerts.length) throw new Error('Oväntad alert: ' + JSON.stringify(alerts));
  if (took > 6000) throw new Error(`Tog ${took} ms att spara tre kopplingar – för långsamt`);
  console.log(`OK: tre kopplingar i snabb följd sparas trots att GitHub lämnar ut gammal data efter en skrivning (${took} ms, ${conflicts} skrivkrockar, ${itemGets} läsningar av plan_items.json)`);

  // ↻ efter egen sparning hämtar från GitHub (kollegors ändringar syns), utan att förstöra nästa sparning.
  await page.waitForTimeout(LAG_MS + 200);
  await page.locator('#btnRefresh').click();
  await page.waitForTimeout(800);
  await couple(4);
  for (let i = 0; i < 60; i++) { if (!(await page.evaluate(() => saveJobs.size))) break; await page.waitForTimeout(100); }
  const names2 = store.get(`projects/${PROJECT_ID}/plan_items.json`).content.map(r => r.object_name).sort();
  if (names2.length !== 4) throw new Error('Fjärde kopplingen efter ↻ sparades inte: ' + JSON.stringify(names2));
  console.log('OK: ↻ och en ny koppling efteråt fungerar');

  if (consoleErrors.length) throw new Error('Konsolfel: ' + JSON.stringify(consoleErrors));
  await browser.close(); server.close();
}
run().catch(e => { console.error(e); process.exit(1); });
