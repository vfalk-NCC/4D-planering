// Funktionstest: GitHubs separata rate limit för skrivande anrop ("secondary
// rate limit"/"content-generating requests") - se samtalet med Victor
// 2026-09-16 om att sparningar krävde ~60 sekunders manuell väntan mellan
// varandra. ghPutFile/ghWriteJSONAttempt i github-storage.js ska:
//  1) Känna igen ett 429/403-svar som en rate limit och räkna ut rätt
//     väntetid - i första hand från x-ratelimit-remaining/-reset (de ENDA
//     av GitHubs rate limit-headers som faktiskt är läsbara via CORS från
//     ett annat origin än api.github.com, se
//     docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests
//     - "retry-after" står INTE med i den listan, så trots att vi läser den
//     defensivt är den i praktiken alltid osynlig för oss här).
//  2) Vänta ut HELA den tiden i EN sammanhängande paus och göra EXAKT ETT
//     nytt försök efteråt - INTE upprepade snabba försök under tiden (det
//     var precis det Victor bad om att undvika).
//  3) Om ingen header alls ger en exakt tid: falla tillbaka på GitHubs egen
//     standardrekommendation, 60 sekunder.
//  4) Dela cooldown-väntan mellan OLIKA filer (paths) - träffar en skrivning
//     mot en fil en rate limit ska en samtidigt köad skrivning mot en ANNAN
//     fil också vänta in den, och nästa väntan (om den också blir
//     rate-limited) ska räknas FRÅN NÄR FÖREGÅENDE gick igenom, inte
//     oberoende från när den själv köades - annars skulle flera köade
//     skrivningar kunna studsa tillbaka och krocka med GitHub igen nästan
//     samtidigt.
//  5) Ett vanligt 403 som INTE är en rate limit (t.ex. fel token-behörighet)
//     ska fortfarande ge ett omedelbart, vanligt fel - inte vänta i onödan.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8956;

function startServer() {
  // Minimal server: bara github-storage.js + en tunn fixture-sida som laddar
  // den - vi vill testa lagringsmodulen isolerat, utan hela appens
  // Trimble-uppkoppling och UI.
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/github-storage.js') {
        fs.readFile(path.join(DOCS_DIR, 'github-storage.js'), (err, data) => {
          if (err) { res.writeHead(404); res.end('not found'); return; }
          res.writeHead(200, { 'Content-Type': 'application/javascript' });
          res.end(data);
        });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><html><head><script src="/github-storage.js"></script></head><body></body></html>');
    });
    server.listen(PORT, () => resolve(server));
  });
}

async function run() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage();

  // OBS: 429/403-svar är FÖRVÄNTADE, korrekt hanterade responser i det här
  // testet (det är precis vad vi simulerar och verifierar att koden hanterar
  // rätt) - Chrome loggar ändå ett "Failed to load resource"-konsolfel för
  // varje sådant svar oavsett att koden hanterar det korrekt, så de filtreras
  // bort här, samma mönster som 404-filtreringen i test_github_storage.js.
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !/Failed to load resource.*(429|403)/.test(msg.text())) consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  // "networkidle" hänger sig ibland i den här sandlådan (Chromiums egen
  // bakgrundstrafik mot t.ex. accounts.google.com nekas av proxyn och
  // återansluter i all oändlighet) - sidan här har inga externa resurser
  // alls (bara github-storage.js, samma origin), så "load" räcker gott.
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });

  // ---- 1)-3) En rate-limited skrivning ska vänta ut EXAKT den tid som går
  //           att räkna ut från x-ratelimit-reset (den enda av GitHubs
  //           rate limit-headrar som faktiskt syns via CORS - se filens
  //           topp-kommentar) en gång, göra ETT nytt försök, och lyckas -
  //           utan några extra PUT-anrop under väntan.
  const putCallTimes = [];
  let putCallCount = 0;
  const resetAtSec = Math.ceil(Date.now() / 1000) + 1; // ~1s fram i tiden
  await page.route('https://api.github.com/repos/vfalk-NCC/4D-data/contents/**', async route => {
    const req = route.request();
    if (req.method() === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from('[]').toString('base64'), sha: 'sha-start' }) });
      return;
    }
    if (req.method() === 'PUT') {
      putCallCount++;
      putCallTimes.push(Date.now());
      if (putCallCount === 1) {
        // Simulerar GitHubs svar vid en rate limit. retry-after sätts HÄR
        // också (precis som riktiga GitHub gör), men eftersom Chromium inte
        // exponerar den via CORS för ett cross-origin-anrop (verifierat -
        // se `retryAfterHeader`-loggen nedan om testet någonsin misslyckas)
        // är det x-ratelimit-remaining/-reset som faktiskt styr väntetiden
        // i praktiken, därför måste de EXPLICIT listas i
        // access-control-expose-headers för att synas alls - precis som
        // riktiga api.github.com gör.
        route.fulfill({
          status: 429,
          headers: {
            'retry-after': '1',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(resetAtSec),
            'access-control-expose-headers': 'x-ratelimit-remaining, x-ratelimit-reset'
          },
          contentType: 'application/json',
          body: JSON.stringify({ message: 'You have exceeded a secondary rate limit. Please retry your request again later.' })
        });
        return;
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'sha-after-write' } }) });
      return;
    }
    route.fulfill({ status: 405, body: 'method not allowed' });
  });

  const start = Date.now();
  const result = await page.evaluate(async () => {
    const written = await ghWriteJSON('fake-token', 'projects/test-project/plan_items.json', (arr) => [...arr, { id: 'row-1' }], 'test');
    return written;
  });

  if (putCallCount !== 2) throw new Error(`Förväntade exakt 2 PUT-anrop (1 rate-limited + 1 lyckat omförsök), fick: ${putCallCount}`);
  const gapMs = putCallTimes[1] - putCallTimes[0];
  if (gapMs < 700) throw new Error(`Förväntade att omförsöket väntade ut ungefär hela den uträknade tiden (~1000ms), men gapet mellan PUT-anropen var bara ${gapMs}ms - tyder på att koden försöker igen för snabbt/upprepat istället för att vänta ut hela tiden`);
  if (gapMs > 4000) throw new Error(`Väntade orimligt länge (${gapMs}ms) för en uträknad väntetid på ~1 sekund`);
  if (!Array.isArray(result) || result.length !== 1 || result[0].id !== 'row-1') throw new Error('Förväntade att skrivningen till slut lyckades och returnerade den skrivna arrayen, fick: ' + JSON.stringify(result));
  console.log(`OK: en rate-limited skrivning väntar ut den uträknade tiden (${gapMs}ms för en begärd ~1000ms-väntan från x-ratelimit-reset) i EN paus och gör exakt ett nytt försök, utan att hamra på GitHub under tiden`);

  // ---- 4) Delad cooldown mellan OLIKA paths: två samtidiga skrivningar mot
  //         olika filer där BÅDA träffar en rate limit ska köas EFTER
  //         varandra (dela samma grind) - andra skrivningens väntan börjar
  //         alltså räknas efter att den första gått igenom, inte parallellt.
  await page.unroute('https://api.github.com/repos/vfalk-NCC/4D-data/contents/**');
  const gatePutTimes = { 'projects/test-project/plan_items.json': [], 'projects/test-project/plan_item_progress_history.json': [] };
  await page.route('https://api.github.com/repos/vfalk-NCC/4D-data/contents/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    const filePath = decodeURIComponent(url.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (req.method() === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from('[]').toString('base64'), sha: 'sha-start' }) });
      return;
    }
    if (req.method() === 'PUT') {
      const times = gatePutTimes[filePath];
      times.push(Date.now());
      if (times.length === 1) {
        // Reset-tiden räknas ALLTID ~1s framåt FRÅN NU (inte ett fast
        // klockslag) - annars skulle den andra filens rate limit (som
        // triggas lite senare, efter att den väntat in den delade grinden)
        // redan ha "gått ut" och testet inte skulle mäta någon extra
        // väntan alls.
        route.fulfill({
          status: 429,
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(Math.ceil(Date.now() / 1000) + 1),
            'access-control-expose-headers': 'x-ratelimit-remaining, x-ratelimit-reset'
          },
          contentType: 'application/json',
          body: JSON.stringify({ message: 'You have exceeded a secondary rate limit.' })
        });
        return;
      }
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'sha-after-write' } }) });
      return;
    }
    route.fulfill({ status: 405, body: 'method not allowed' });
  });

  await page.evaluate(async () => {
    await Promise.all([
      ghWriteJSON('fake-token', 'projects/test-project/plan_items.json', (arr) => [...arr, { id: 'a' }], 'test-a'),
      ghWriteJSON('fake-token', 'projects/test-project/plan_item_progress_history.json', (arr) => [...arr, { id: 'b' }], 'test-b')
    ]);
  });

  const itemsRetryAt = gatePutTimes['projects/test-project/plan_items.json'][1];
  const historyRetryAt = gatePutTimes['projects/test-project/plan_item_progress_history.json'][1];
  if (!itemsRetryAt || !historyRetryAt) throw new Error('Förväntade att BÅDA filerna fick sitt lyckade omförsök, fick: ' + JSON.stringify(gatePutTimes));
  const retryGapMs = Math.abs(itemsRetryAt - historyRetryAt);
  // De två lyckade omförsöken ska INTE ligga nästan exakt samtidigt (vilket
  // skulle hända om varje path räknade sin egen väntan oberoende och de
  // råkade starta nästan samtidigt) - den delade grinden ska ha kedjat den
  // andra filens väntan EFTER den första, så det ska finnas ett tydligt
  // mellanrum mellan dem.
  if (retryGapMs < 600) throw new Error(`Förväntade att de två filernas omförsök var tydligt förskjutna i tiden (delad grind, köade efter varandra), men de låg bara ${retryGapMs}ms ifrån varandra - tyder på att varje path väntade ut sin egen cooldown oberoende av den andra`);
  console.log(`OK: en rate limit på EN fil får en samtidigt köad skrivning mot en ANNAN fil att vänta in samma delade cooldown, i tur och ordning (${retryGapMs}ms mellan de två lyckade omförsöken) istället för att räkna ner var för sig`);

  // ---- Standardfallet: inget retry-after, ingen x-ratelimit-remaining=0 -
  //      ska falla tillbaka på GitHubs egen rekommendation, 60000ms. Vi
  //      anropar ghPutFile direkt (inte hela skriv-loopen) så testet inte
  //      behöver vänta ut de 60 sekunderna för att kontrollera värdet.
  await page.unroute('https://api.github.com/repos/vfalk-NCC/4D-data/contents/**');
  await page.route('https://api.github.com/repos/vfalk-NCC/4D-data/contents/**', route => {
    route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ message: 'You have exceeded a secondary rate limit.' }) });
  });
  const fallbackInfo = await page.evaluate(async () => {
    try {
      await ghPutFile('fake-token', 'projects/test-project/plan_items.json', btoa('[]'), 'sha-x', 'test');
      return { threw: false };
    } catch (e) {
      return { threw: true, rateLimited: e.rateLimited === true, retryAfterMs: e.retryAfterMs };
    }
  });
  if (!fallbackInfo.threw || !fallbackInfo.rateLimited) throw new Error('Förväntade att ett 429 utan läsbara rate limit-headrar ändå tolkas som rate limit, fick: ' + JSON.stringify(fallbackInfo));
  if (fallbackInfo.retryAfterMs !== 60000) throw new Error('Förväntade GitHubs standardrekommendation 60000ms som fallback när ingen header ger en exakt tid, fick: ' + fallbackInfo.retryAfterMs);
  console.log('OK: saknas läsbara rate limit-headrar faller väntetiden tillbaka på GitHubs egen 60-sekundersrekommendation');

  // ---- 5) Ett 403 som INTE är en rate limit (fel behörighet på token:en)
  //         ska ge ett omedelbart, vanligt fel - inte behandlas som en
  //         rate limit och vänta i onödan.
  await page.unroute('https://api.github.com/repos/vfalk-NCC/4D-data/contents/**');
  await page.route('https://api.github.com/repos/vfalk-NCC/4D-data/contents/**', route => {
    route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'Resource not accessible by personal access token' }) });
  });
  const permissionErrorInfo = await page.evaluate(async () => {
    try {
      await ghPutFile('fake-token', 'projects/test-project/plan_items.json', btoa('[]'), 'sha-x', 'test');
      return { threw: false };
    } catch (e) {
      return { threw: true, rateLimited: e.rateLimited === true, message: e.message };
    }
  });
  if (!permissionErrorInfo.threw || permissionErrorInfo.rateLimited) throw new Error('Ett vanligt behörighetsfel (403, inte rate limit) skulle INTE flaggas som rateLimited, fick: ' + JSON.stringify(permissionErrorInfo));
  console.log('OK: ett vanligt 403-behörighetsfel (utan rate limit-signaler) behandlas fortfarande som ett omedelbart, vanligt fel');

  await browser.close();
  server.close();

  console.log('Konsolfel:', consoleErrors);
  if (consoleErrors.length > 0) throw new Error('Konsolfel upptäcktes: ' + consoleErrors.join(' | '));
  console.log('OK: GitHubs rate limit för skrivande anrop hanteras korrekt (väntar ut tiden en gång, exakt ett nytt försök, delad cooldown mellan olika filer, korrekt fallback-tid, riktiga behörighetsfel opåverkade)');
}

run().catch(e => { console.error(e); process.exit(1); });
