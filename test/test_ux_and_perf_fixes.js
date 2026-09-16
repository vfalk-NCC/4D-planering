// Funktionstest för de fem sakerna Victor efterfrågade efter migreringen:
//  1) Sparning ska inte göra en onödig dubbel-läsning av plan_items.json
//     (prestanda/"lång delay"-klagomålet) - plan_items.json och
//     plan_item_progress_history.json ska skrivas PARALLELLT, och
//     plan_items.json ska bara LÄSAS en gång per sparning, inte två.
//  2) Kameran ska bara göra EN synlig rörelse vid markering (inte
//     zooma-in-och-sen-zooma-ut) - det första setCamera-anropet (Trimbles
//     auto-fit, som bara används för att räkna ut var kameran SKULLE
//     hamnat) ska ha animationTime:0.
//  3) Ctrl/Cmd-klick på en grupps "Välj alla" ska LÄGGA TILL gruppen till
//     den befintliga markeringen (både i listan och i 3D-vyn, mode "add"),
//     istället för att ersätta den, och utan att flytta kameran.
//  4) "Markera alla" ska visa ett tydligt felmeddelande (inte bara markera
//     tyst i appens lista) om inget av objekten kunde markeras i 3D-vyn,
//     och knappen ska återgå till sitt normala läge efteråt.
//  5) Den nya ↻-knappen i headern ska hämta senaste data och rita om
//     listan.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8946;
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

const store = new Map();
function shaFor(content) { return crypto.createHash('sha1').update(JSON.stringify(content)).digest('hex') + Math.random().toString(16).slice(2, 6); }

const SEED_ITEMS = [
  { id: 'row-1', project_id: PROJECT_ID, model_id: 'model-1', object_id: '10', object_name: 'A1', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'planerad', start_date: null, end_date: null, progress: 0, updated_at: '2026-01-01T00:00:00Z' },
  { id: 'row-2', project_id: PROJECT_ID, model_id: 'model-1', object_id: '20', object_name: 'A2', area: 'Hus A', activity: 'Gjutning', contractor: 'NCC', status: 'planerad', start_date: null, end_date: null, progress: 0, updated_at: '2026-01-01T00:00:00Z' },
  { id: 'row-3', project_id: PROJECT_ID, model_id: 'model-1', object_id: '30', object_name: 'B1', area: 'Hus B', activity: 'Montage', contractor: 'Skanska', status: 'planerad', start_date: null, end_date: null, progress: 0, updated_at: '2026-01-01T00:00:00Z' },
  { id: 'row-4', project_id: PROJECT_ID, model_id: 'model-1', object_id: '40', object_name: 'B2', area: 'Hus B', activity: 'Montage', contractor: 'Skanska', status: 'planerad', start_date: null, end_date: null, progress: 0, updated_at: '2026-01-01T00:00:00Z' }
];
store.set(`projects/${PROJECT_ID}/plan_items.json`, { content: SEED_ITEMS, sha: shaFor(SEED_ITEMS) });

const FIXED_BOX = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
const AUTO_FIT_CAMERA = { position: { x: 5, y: 5, z: 25 }, fieldOfView: 60, pitch: 0, yaw: 0 };

async function run() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 480, height: 1200 } });

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !/Failed to load resource.*(404|409)/.test(msg.text())) consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  const alerts = [];
  page.on('dialog', async (dialog) => { alerts.push(dialog.message()); await dialog.accept(); });

  await page.route('https://components.connect.trimble.com/**', route => route.fulfill({
    contentType: 'application/javascript',
    body: `
      window.__calls = [];
      window.TrimbleConnectWorkspace = { connect: function() { return Promise.resolve({
        project: { getProject: function(){ return Promise.resolve({ id: '${PROJECT_ID}' }); } },
        viewer: {
          convertToObjectRuntimeIds: function(modelId, objectIds) {
            window.__calls.push(['convertToObjectRuntimeIds', modelId, objectIds]);
            if (window.__forceNoMatch) return Promise.resolve(objectIds.map(() => undefined));
            return Promise.resolve(objectIds.map(id => Number(id)));
          },
          setSelection: function(selector, mode) {
            window.__calls.push(['setSelection', JSON.parse(JSON.stringify(selector)), mode]);
            return Promise.resolve();
          },
          setCamera: function(arg, options) {
            window.__calls.push(['setCamera', JSON.parse(JSON.stringify(arg)), options ? JSON.parse(JSON.stringify(options)) : null]);
            return Promise.resolve();
          },
          getCamera: function() { return Promise.resolve(${JSON.stringify(AUTO_FIT_CAMERA)}); },
          getObjectBoundingBoxes: function(modelId, ids) {
            return Promise.resolve(ids.map(id => ({ id, boundingBox: ${JSON.stringify(FIXED_BOX)} })));
          },
          setObjectState: function() { return Promise.resolve(); },
          getSelection: function() { return Promise.resolve([{ modelId: 'model-1', objectRuntimeIds: [999] }]); },
          convertToObjectIds: function() { return Promise.resolve(['90']); }
        }
      }); } };`
  }));
  await page.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));

  const netLog = [];
  let artificialDelayMs = 0; // sätts >0 runt sparningstestet, för att kunna mäta parallellitet på ett robust sätt
  await page.route('https://api.github.com/repos/vfalk-NCC/4D-data/contents/**', async route => {
    if (artificialDelayMs > 0) await new Promise(r => setTimeout(r, artificialDelayMs));
    const req = route.request();
    const url = new URL(req.url());
    const filePath = decodeURIComponent(url.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));

    if (req.method() === 'GET') {
      netLog.push({ method: 'GET', path: filePath, t: Date.now() });
      const entry = store.get(filePath);
      if (!entry) { route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Not Found' }) }); return; }
      const b64 = Buffer.from(JSON.stringify(entry.content)).toString('base64');
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: b64, sha: entry.sha }) });
      return;
    }
    if (req.method() === 'PUT') {
      netLog.push({ method: 'PUT', path: filePath, t: Date.now() });
      const body = JSON.parse(req.postData() || '{}');
      const existing = store.get(filePath);
      if (existing && existing.sha !== body.sha) {
        route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'conflict' }) });
        return;
      }
      const content = JSON.parse(Buffer.from(body.content, 'base64').toString('utf-8'));
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

  await page.selectOption('#groupBy', 'area');
  await page.waitForTimeout(200);

  // ============================================================
  // 1) Ctrl/Cmd-klick på "Välj alla" i en andra grupp lägger till,
  //    ersätter inte, och flyttar inte kameran.
  // ============================================================
  const groupButtons = page.locator('.group-select-all');
  const count = await groupButtons.count();
  if (count !== 2) throw new Error('Förväntade 2 grupper (Hus A, Hus B), fick ' + count);

  await page.evaluate(() => { window.__calls.length = 0; });
  await groupButtons.nth(0).click(); // Hus A, vanligt klick
  await page.waitForTimeout(200);

  let calls = await page.evaluate(() => window.__calls);
  let selCalls = calls.filter(c => c[0] === 'setSelection');
  if (selCalls.length !== 1 || selCalls[0][2] !== 'set') throw new Error('Första gruppklicket skulle vara mode "set": ' + JSON.stringify(selCalls));
  let camCallsAfterFirst = calls.filter(c => c[0] === 'setCamera').length;
  if (camCallsAfterFirst !== 2) throw new Error('Förväntade 2 setCamera-anrop (auto-fit + dubblering) vid vanligt gruppklick, fick ' + camCallsAfterFirst);

  await page.evaluate(() => { window.__calls.length = 0; });
  await groupButtons.nth(1).click({ modifiers: ['Control'] }); // Hus B, Ctrl-klick
  await page.waitForTimeout(200);

  calls = await page.evaluate(() => window.__calls);
  selCalls = calls.filter(c => c[0] === 'setSelection');
  if (selCalls.length !== 1 || selCalls[0][2] !== 'add') throw new Error('Ctrl-klick på andra gruppen skulle ge mode "add": ' + JSON.stringify(selCalls));
  const camCallsAfterCtrl = calls.filter(c => c[0] === 'setCamera').length;
  if (camCallsAfterCtrl !== 0) throw new Error('Ctrl-klick skulle INTE flytta kameran, men setCamera anropades ' + camCallsAfterCtrl + ' gång(er)');

  const selectedRows = await page.locator('.item-row.selected').count();
  if (selectedRows !== 4) throw new Error('Förväntade 4 markerade rader (Hus A + Hus B) efter Ctrl-klick, fick ' + selectedRows);
  console.log('OK: Ctrl/Cmd-klick på "Välj alla" lägger till en till grupp i markeringen (mode "add"), utan att flytta kameran');

  // ============================================================
  // 2) Kameran gör bara EN synlig rörelse (första anropet instant).
  // ============================================================
  const camCallsFirstClick = calls; // reuse from ctrl click doesn't have camera calls; check the FIRST (non-ctrl) click's calls instead
  await page.evaluate(() => { window.__calls.length = 0; });
  await groupButtons.nth(0).click();
  await page.waitForTimeout(200);
  const camCalls = (await page.evaluate(() => window.__calls)).filter(c => c[0] === 'setCamera');
  if (camCalls.length !== 2) throw new Error('Förväntade 2 setCamera-anrop, fick ' + camCalls.length);
  if (!camCalls[0][2] || camCalls[0][2].animationTime !== 0) throw new Error('Första setCamera-anropet (auto-fit) ska ha animationTime:0 (osynligt), fick options: ' + JSON.stringify(camCalls[0][2]));
  console.log('OK: bara EN synlig kamerarörelse (auto-fit-anropet är instant/osynligt, bara det slutgiltiga är animerat)');

  // ============================================================
  // 3) "Markera alla" visar fel om inget objekt hittas i modellen.
  // ============================================================
  await page.evaluate(() => { window.__forceNoMatch = true; });
  await page.locator('#btnSelectAllCoupled').click();
  await page.waitForTimeout(300);
  if (alerts.length === 0) throw new Error('"Markera alla" skulle visa ett felmeddelande när inget objekt hittas i modellen, men inget alert visades');
  if (!/Hittade inga/.test(alerts[alerts.length - 1])) throw new Error('Oväntat felmeddelande: ' + alerts[alerts.length - 1]);
  const btnAfterFail = page.locator('#btnSelectAllCoupled');
  if (await btnAfterFail.isDisabled()) throw new Error('"Markera alla"-knappen förblev inaktiverad efter felet');
  if ((await btnAfterFail.innerText()).trim() !== 'Markera alla') throw new Error('"Markera alla"-knappens text återställdes inte efter felet');
  await page.evaluate(() => { window.__forceNoMatch = false; });
  // Felet ovan loggas avsiktligen även med console.error (inte bara alert)
  // av selectAllCoupledObjects - det är förväntat i just det här steget,
  // inte ett tecken på ett verkligt konsolfel, så det rensas bort innan
  // det slutliga "inga konsolfel"-kontroll längst ned i testet.
  consoleErrors.length = 0;
  console.log('OK: "Markera alla" visar ett tydligt felmeddelande när inget kunde markeras i 3D-vyn, och knappen återställs');

  // ============================================================
  // 4) Sparning: EN läsning av plan_items.json (inte två), och
  //    plan_items.json + progress_history.json skrivs parallellt.
  //
  //    För att robust kunna mäta parallellitet (utan att förlita sig på
  //    millisekund-exakta rådatumstämplar, som är brusiga p.g.a. normal
  //    async-schemaläggning) läggs en konstgjord fördröjning på varje
  //    mockat nätverksanrop under just det här testet. Varje anrops `t`
  //    loggas EFTER fördröjningen (dvs ungefär när svaret skickas), så:
  //      - Om plan_items- och historik-anropen körs PARALLELLT startar
  //        PUT plan_items.json och GET progress_history.json vid ungefär
  //        samma tidpunkt (direkt efter den inledande GET:en), och deras
  //        loggade tidsstämplar hamnar därför nära varandra (skillnad
  //        << artificialDelayMs).
  //      - Om de i stället körs i TUR OCH ORDNING (den gamla, långsamma
  //        varianten) hinner hela plan_items-skrivningen (GET+PUT) bli
  //        klar innan historik-läsningen ens startar, vilket ger en
  //        skillnad på ungefär en hel artificialDelayMs mellan dem.
  // ============================================================
  netLog.length = 0;
  artificialDelayMs = 200;
  await page.locator('#btnLinkSelection').click();
  await page.waitForTimeout(150);
  await page.locator('#fName').fill('Ny testbalk');
  await page.locator('#btnSaveLink').click();
  await page.waitForTimeout(1800);
  artificialDelayMs = 0;

  const itemsGets = netLog.filter(e => e.method === 'GET' && e.path === `projects/${PROJECT_ID}/plan_items.json`);
  if (itemsGets.length !== 1) throw new Error(`Förväntade exakt 1 GET mot plan_items.json per sparning (inte en dubbel läsning), fick ${itemsGets.length}`);

  const itemsPut = netLog.find(e => e.method === 'PUT' && e.path === `projects/${PROJECT_ID}/plan_items.json`);
  const historyGet = netLog.find(e => e.method === 'GET' && e.path === `projects/${PROJECT_ID}/plan_item_progress_history.json`);
  if (!itemsPut || !historyGet) throw new Error('Saknar förväntade nätverksanrop: ' + JSON.stringify(netLog));
  const gap = Math.abs(historyGet.t - itemsPut.t);
  if (gap > 120) {
    throw new Error(`Historik-läsningen (t=${historyGet.t}) och plan_items-skrivningen (t=${itemsPut.t}) ligger ${gap}ms isär (tröskel 120ms vid en konstgjord fördröjning på ${200}ms) - ser ut att köras i tur och ordning, inte parallellt`);
  }
  console.log(`OK: sparning gör bara EN läsning av plan_items.json, och skriver plan_items.json + historik parallellt (tidsstämpelskillnad ${gap}ms)`);

  // ============================================================
  // 5) ↻-knappen hämtar senaste data.
  // ============================================================
  const extraItem = { id: 'row-5', project_id: PROJECT_ID, model_id: 'model-1', object_id: '50', object_name: 'C1', area: 'Hus C', activity: 'Gjutning', contractor: 'NCC', status: 'planerad', start_date: null, end_date: null, progress: 0, updated_at: '2026-01-01T00:00:00Z' };
  const current = store.get(`projects/${PROJECT_ID}/plan_items.json`).content;
  const withExtra = [...current, extraItem];
  store.set(`projects/${PROJECT_ID}/plan_items.json`, { content: withExtra, sha: shaFor(withExtra) });

  const countBefore = await page.locator('#itemCount').innerText();
  await page.locator('#btnRefresh').click();
  await page.waitForTimeout(400);
  const countAfter = await page.locator('#itemCount').innerText();
  if (countAfter === countBefore) throw new Error(`↻-knappen hämtade inte ny data - itemCount oförändrat (${countBefore})`);
  const totalAfter = Number(countAfter.split('/')[1]);
  if (totalAfter !== withExtra.length) throw new Error(`Förväntade ${withExtra.length} objekt totalt efter uppdatering, fick räknaren "${countAfter}"`);
  console.log('OK: ↻-knappen hämtar senaste data från GitHub och ritar om listan');

  await browser.close();
  server.close();

  console.log('Konsolfel:', consoleErrors);
  if (consoleErrors.length > 0) throw new Error('Konsolfel upptäcktes: ' + consoleErrors.join(' | '));
  console.log('OK: samtliga UX/prestandafixar fungerar korrekt');
}

run().catch(e => { console.error(e); process.exit(1); });
