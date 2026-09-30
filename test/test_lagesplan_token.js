// Funktionstest: GitHub-token manuellt i Lägesplan. En manuell token sparas
// separat och går före den gamla/sparade, dialogen öppnas av sig själv vid
// 401, "Testa" provar token:en, och "Ta bort manuell token" återgår.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8979;
const PID = 'p1';
const store = new Map([[`projects/${PID}/plan_items.json`, JSON.stringify([{ id: 'a', object_name: 'A', status: 'planerad' }])],
  [`projects/${PID}/status_plans.json`, '[]']]);

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS_DIR, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1');
      localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 'old-token-xyz' })); }
  });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib = window.pdfjsLib || { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error("ingen pdf")) }) };' }));
  const used = [];
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const auth = (req.headers()['authorization'] || '').replace(/^(Bearer|token) /, '');
    used.push(auth);
    if (auth !== 'new-token-1234') return r.fulfill({ status: 401, body: '{"message":"Bad credentials"}' });
    const u = new URL(req.url());
    if (u.pathname === '/repos/vfalk-NCC/4D-data') return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    const f = decodeURIComponent(u.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (!store.has(f)) return r.fulfill({ status: 404, body: '{}' });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(store.get(f)).toString('base64'), sha: 's' }) });
  });
  const fail = m => { throw new Error(m); };
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=${PID}`); await page.waitForTimeout(1200);

  // 1) Gammal token → 401 → dialogen öppnas själv
  if (!(await page.isVisible('#tokenModal'))) fail('dialogen ska öppnas vid 401');
  if (!(await page.innerText('#tokenMsg')).includes('401')) fail('dialogen ska förklara 401');
  if (!(await page.innerText('#tokenStatus')).includes('old-to')) fail('status ska visa den maskade token:en som används');
  console.log('OK: vid 401 öppnas token-dialogen med förklaring');

  // 2) Testa + spara ny token → laddar om och används före den gamla
  await page.fill('#tokenInput', 'new-token-1234');
  await page.click('#btnTokenTest'); await page.waitForTimeout(300);
  if (!(await page.innerText('#tokenMsg')).includes('fungerar')) fail('Testa ska bekräfta token:en, fick ' + await page.innerText('#tokenMsg'));
  used.length = 0;
  await page.click('#btnTokenSave'); await page.waitForTimeout(1500);
  if (await page.isVisible('#tokenModal')) fail('dialogen ska vara stängd efter omladdning');
  if (!(await page.innerText('#projectInfo')).includes('1 planerade objekt')) fail('data ska laddas med den nya token:en, fick ' + await page.innerText('#projectInfo'));
  if (used.some(t => t && t !== 'new-token-1234')) fail('bara den manuella token:en ska användas, fick ' + [...new Set(used)].join(','));
  console.log('OK: en manuell token testas, sparas och används före den gamla');

  // 3) Nyckelknappen visar att manuell token används; Ta bort återgår
  await page.click('#btnToken'); await page.waitForTimeout(100);
  if (!(await page.innerText('#tokenStatus')).includes('manuell')) fail('status ska visa manuell token');
  await page.click('#btnTokenClear'); await page.waitForTimeout(1500);
  if (!(await page.isVisible('#tokenModal'))) fail('utan manuell token ska den gamla ge 401 igen');
  console.log('OK: nyckelknappen visar källan och "Ta bort manuell token" återgår');

  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK: GitHub-token i Lägesplan fungerar');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
