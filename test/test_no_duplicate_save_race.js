// Funktionstest för optimistisk sparning (se kommentaren ovanför
// onSaveLink() i app.js) - listan och formuläret ska uppdateras DIREKT när
// man trycker Spara, medan den faktiska skrivningen till GitHub sker i
// bakgrunden, kö:ad per fil (ghWriteQueues i github-storage.js) så att
// snabba sparningar i rad inte racear mot varandra. Testar:
//  1) Listan/formuläret uppdateras momentant, INNAN nätverksanropet ens
//     hunnit svara (bevisar att det är optimistiskt, inte bara snabbt).
//  2) Raden visar "Sparar..." medan bakgrundsskrivningen pågår, och taggen
//     försvinner när den är bekräftad sparad.
//  3) Två snabba sparningar av SAMMA objekt i rad ger inte en dubblettrad -
//     bara en slutgiltig rad, och båda skrivningarna kö:as (körs efter
//     varandra) istället för att racea.
//  4) Om en bakgrundssparning misslyckas helt (inte bara en läkande 409,
//     utan ett riktigt fel) visas INGEN alert() - istället märks raden med
//     "⚠ Kunde inte spara" och en statusrad (#saveStatus) med
//     "Försök igen"/"Överge ändringen" dyker upp och försvinner inte av
//     sig själv.
//  5) "Försök igen" (efter att felet är åtgärdat) sparar om och rensar
//     felmarkeringen. "Överge ändringen" hämtar om listan från servern.
//  6) En enstaka, läkande skrivkrock (409, t.ex. en annan samtidig
//     skrivning utifrån) ska självläka via omförsöken i ghWriteJSON, utan
//     att synas som ett fel alls.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8945;
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

const store = new Map(); // path -> { content: obj, sha: string }
function shaFor(content) {
  return crypto.createHash('sha1').update(JSON.stringify(content)).digest('hex') + Math.random().toString(16).slice(2, 6);
}

async function run() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 480, height: 2000 } });

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

  await page.route('https://components.connect.trimble.com/**', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.TrimbleConnectWorkspace = { connect: function() { return Promise.resolve({
      project: { getProject: function(){ return Promise.resolve({ id: '${PROJECT_ID}' }); } },
      viewer: {
        getSelection: function() { return Promise.resolve([{ modelId: 'model-1', objectRuntimeIds: [1] }]); },
        convertToObjectIds: function() { return Promise.resolve(['ext-obj-1']); },
        getObjectProperties: function() { return Promise.resolve([{ id: 1, product: { name: 'Testbalk B-12' } }]); },
        setSelection: function() { return Promise.resolve(); }
      }
    }); } };`
  }));
  await page.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ contentType: 'application/javascript', body: '' }));

  let putCount = 0;
  let artificialDelayMs = 0;
  let forcedFailure = null; // sätts till ett HTTP-statustal för att tvinga PUT mot plan_items.json att misslyckas
  await page.route('https://api.github.com/repos/vfalk-NCC/4D-data/contents/**', async route => {
    if (artificialDelayMs > 0) await new Promise(r => setTimeout(r, artificialDelayMs));
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
      if (filePath === `projects/${PROJECT_ID}/plan_items.json`) {
        putCount++;
        if (forcedFailure) {
          route.fulfill({ status: forcedFailure, contentType: 'application/json', body: JSON.stringify({ message: 'forced failure' }) });
          return;
        }
      }
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

  // ============================================================
  // 1) + 2) Momentan (optimistisk) uppdatering + "Sparar..."-tagg.
  // ============================================================
  artificialDelayMs = 300; // gör nätverksrondtrippen tydligt långsammare än UI-uppdateringen, så vi kan bevisa att listan uppdateras INNAN svaret kommit
  await page.locator('#btnLinkSelection').click();
  await page.waitForTimeout(150);
  await page.locator('#fName').fill('Testbalk B-12');
  await page.locator('#fProgress').fill('25');
  await page.locator('#btnSaveLink').click();

  // Kontrollera DIREKT (utan att vänta in nätverksfördröjningen) att
  // formuläret redan stängts och raden redan syns i listan, märkt "Sparar...".
  await page.waitForTimeout(30);
  const formHiddenImmediately = await page.evaluate(() => document.getElementById('linkForm').classList.contains('hidden'));
  if (!formHiddenImmediately) throw new Error('Formuläret skulle stängas direkt (optimistiskt), inte vänta in nätverkssvaret');
  const rowVisibleImmediately = await page.evaluate(() => document.getElementById('itemList').innerText.includes('Testbalk B-12'));
  if (!rowVisibleImmediately) throw new Error('Den nya raden skulle synas i listan direkt, innan bakgrundsskrivningen ens svarat');
  const pendingTagVisible = await page.evaluate(() => document.getElementById('itemList').innerText.includes('Sparar...'));
  if (!pendingTagVisible) throw new Error('Raden skulle vara märkt "Sparar..." medan bakgrundsskrivningen pågår');
  if (putCount !== 0) throw new Error('Nätverksskrivningen hann redan svara trots den konstgjorda fördröjningen - testet mäter fel sak');
  console.log('OK: sparning känns momentan - listan/formuläret uppdateras direkt, raden märks "Sparar..." tills bakgrunden bekräftat');

  await page.waitForTimeout(1300); // låt bakgrundsskrivningen (300ms fördröjning per anrop: items-GET, sen items-PUT parallellt med historik-GET+PUT) hinna klart
  const pendingTagGoneAfterSave = await page.evaluate(() => document.getElementById('itemList').innerText.includes('Sparar...'));
  if (pendingTagGoneAfterSave) throw new Error('"Sparar..."-taggen skulle försvinna när bakgrundsskrivningen bekräftats klar');
  if (putCount !== 1) throw new Error('Förväntade exakt 1 PUT mot plan_items.json för den första sparningen, fick ' + putCount);
  const itemsFile = store.get(`projects/${PROJECT_ID}/plan_items.json`);
  if (!itemsFile || itemsFile.content.length !== 1) throw new Error('plan_items.json innehåller inte exakt 1 post: ' + JSON.stringify(itemsFile));
  console.log('OK: bakgrundsskrivningen landar korrekt och "Sparar..."-taggen försvinner');
  artificialDelayMs = 0;

  // ============================================================
  // 3) Två snabba sparningar av SAMMA objekt i rad -> ingen dubblettrad,
  //    båda skrivningarna kö:as (racear inte).
  // ============================================================
  putCount = 0;
  await page.evaluate(() => Promise.all([onSaveLink(), onSaveLink()]));
  await page.waitForTimeout(600);

  if (alerts.length > 0) throw new Error('Ett felmeddelande visades trots att båda sparningarna skulle lyckas: ' + alerts.join(' | '));
  // Minst 2 PUT (en per sparning) - kan bli fler om kön hann göra
  // preFetched-snapshotten för den andra sparningen inaktuell (den första
  // hann skriva emellan), vilket i så fall bara läker sig själv som en
  // vanlig 409 + omförsök (se kommentaren vid ghWriteJSON) - inte ett fel.
  if (putCount < 2) throw new Error(`Förväntade minst 2 PUT mot plan_items.json (en per sparning), fick ${putCount}`);
  const itemsFile2 = store.get(`projects/${PROJECT_ID}/plan_items.json`);
  if (!itemsFile2 || itemsFile2.content.length !== 1) {
    throw new Error('Två snabba sparningar av samma objekt skulle ge EN rad (inte en dubblett): ' + JSON.stringify(itemsFile2));
  }
  console.log(`OK: två snabba sparningar av samma objekt ger ingen dubblettrad, skrivningarna kö:as istället för att racea (${putCount} PUT totalt, ev. självläkande omförsök inräknade)`);

  // ============================================================
  // 4) + 5) En bakgrundssparning som misslyckas helt (inte en läkande 409)
  //    visar ingen alert(), utan märker raden + statusraden - och "Försök
  //    igen" läker felet.
  // ============================================================
  await page.locator('#btnLinkSelection').click();
  await page.waitForTimeout(150);
  await page.locator('#fProgress').fill('55');
  forcedFailure = 500; // simulera ett riktigt (icke läkande) serverfel
  await page.locator('#btnSaveLink').click();
  await page.waitForTimeout(500);

  if (alerts.length > 0) throw new Error('En misslyckad bakgrundssparning skulle INTE visa en alert(), fick: ' + alerts.join(' | '));
  const errorTagVisible = await page.evaluate(() => document.getElementById('itemList').innerText.includes('Kunde inte spara'));
  if (!errorTagVisible) throw new Error('Raden skulle märkas "⚠ Kunde inte spara" efter en misslyckad bakgrundsskrivning');
  const saveStatusVisible = await page.evaluate(() => !document.getElementById('saveStatus').classList.contains('hidden') && document.getElementById('saveStatus').innerText.includes('Kunde inte spara'));
  if (!saveStatusVisible) throw new Error('Statusraden överst (#saveStatus) skulle visa felet med en "Försök igen"-knapp');
  // Det avsiktligt framtvingade felet loggas medvetet även med console.error
  // (inte bara i UI:t) av runSaveJob() - det är förväntat i just det här
  // steget, inte ett tecken på ett verkligt konsolfel, så det rensas bort
  // innan den slutliga "inga konsolfel"-kontrollen längst ned i testet.
  consoleErrors.length = 0;
  console.log('OK: en riktigt misslyckad bakgrundssparning visar ingen alert(), utan märker raden + statusraden tydligt');

  forcedFailure = null; // "åtgärda" felet innan vi försöker igen
  await page.locator('#saveStatus [data-action="retry-save"]').click();
  await page.waitForTimeout(500);

  const errorTagGoneAfterRetry = await page.evaluate(() => document.getElementById('itemList').innerText.includes('Kunde inte spara'));
  if (errorTagGoneAfterRetry) throw new Error('Felmarkeringen skulle försvinna efter en lyckad "Försök igen"');
  const saveStatusHiddenAfterRetry = await page.evaluate(() => document.getElementById('saveStatus').classList.contains('hidden'));
  if (!saveStatusHiddenAfterRetry) throw new Error('Statusraden skulle döljas igen efter en lyckad "Försök igen"');
  const itemsFile3 = store.get(`projects/${PROJECT_ID}/plan_items.json`);
  if (!itemsFile3 || itemsFile3.content[0].progress !== 55) throw new Error('"Försök igen" skulle spara om den ursprungliga ändringen (framdrift 55%): ' + JSON.stringify(itemsFile3));
  console.log('OK: "Försök igen" läker en misslyckad sparning och rensar felmarkeringen');

  // ============================================================
  // 5b) "Överge ändringen" - hämtar om listan från servern istället för
  //     att försöka reda ut ett lokalt återställt tillstånd för hand.
  // ============================================================
  await page.locator('#btnLinkSelection').click();
  await page.waitForTimeout(150);
  await page.locator('#fProgress').fill('99');
  forcedFailure = 500;
  await page.locator('#btnSaveLink').click();
  await page.waitForTimeout(500);

  const errorTagBeforeDiscard = await page.evaluate(() => document.getElementById('itemList').innerText.includes('Kunde inte spara'));
  if (!errorTagBeforeDiscard) throw new Error('Förväntade en felmarkering innan "Överge ändringen" testas');
  consoleErrors.length = 0; // ännu en avsiktligt framtvingad, förväntad console.error - se motsvarande kommentar ovan
  forcedFailure = null; // servern fungerar igen - "Överge" ska ändå bara hämta om det senast FAKTISKT sparade (progress 55, inte 99)
  await page.locator('#saveStatus [data-action="discard-save"]').click();
  await page.waitForTimeout(500);

  const errorTagAfterDiscard = await page.evaluate(() => document.getElementById('itemList').innerText.includes('Kunde inte spara'));
  if (errorTagAfterDiscard) throw new Error('Felmarkeringen skulle vara borta efter "Överge ändringen"');
  const itemsFileAfterDiscard = store.get(`projects/${PROJECT_ID}/plan_items.json`);
  if (!itemsFileAfterDiscard || itemsFileAfterDiscard.content[0].progress !== 55) {
    throw new Error('"Överge ändringen" ska inte skriva något till GitHub - servern skulle fortfarande ha framdrift 55%: ' + JSON.stringify(itemsFileAfterDiscard));
  }
  console.log('OK: "Överge ändringen" hämtar om listan från servern istället för att spara den övergivna ändringen');

  // ============================================================
  // 6) En enstaka, läkande skrivkrock (409) ska självläka via omförsöken
  //    i ghWriteJSON, helt osynligt (ingen alert, ingen felmarkering).
  // ============================================================
  await page.locator('#btnLinkSelection').click();
  await page.waitForTimeout(150);
  await page.locator('#fProgress').fill('80');

  let conflictInjected = false;
  await page.route('https://api.github.com/repos/vfalk-NCC/4D-data/contents/**', async route => {
    const req = route.request();
    if (req.method() === 'PUT' && !conflictInjected) {
      const url = new URL(req.url());
      const filePath = decodeURIComponent(url.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
      if (filePath === `projects/${PROJECT_ID}/plan_items.json`) {
        conflictInjected = true;
        route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'conflict' }) });
        return;
      }
    }
    route.fallback();
  });

  await page.locator('#btnSaveLink').click();
  await page.waitForTimeout(1500);

  if (alerts.length > 0) throw new Error('En engångs-skrivkrock skulle läka av sig själv, men gav ett felmeddelande: ' + alerts.join(' | '));
  const errorTagAfterConflict = await page.evaluate(() => document.getElementById('itemList').innerText.includes('Kunde inte spara'));
  if (errorTagAfterConflict) throw new Error('En läkande 409 skulle inte synas som ett fel i listan');
  const itemsFile4 = store.get(`projects/${PROJECT_ID}/plan_items.json`);
  if (!itemsFile4 || itemsFile4.content.length !== 1 || itemsFile4.content[0].progress !== 80) {
    throw new Error('Sparningen efter en enstaka skrivkrock läkte inte korrekt: ' + JSON.stringify(itemsFile4));
  }
  console.log('OK: en enstaka skrivkrock (409) läker automatiskt via omförsök, helt osynligt för användaren');

  await browser.close();
  server.close();

  console.log('Konsolfel:', consoleErrors);
  if (consoleErrors.length > 0) throw new Error('Konsolfel upptäcktes: ' + consoleErrors.join(' | '));
  console.log('OK: optimistisk sparning (momentan UI, kö:ade skrivningar, tydliga felmarkeringar) fungerar korrekt');
}

run().catch(e => { console.error(e); process.exit(1); });
