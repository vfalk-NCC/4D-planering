// Guiden (docs/guide.html): en sida per arbetsflöde, nås från 4D-planering och lägesplanen.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8994;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0].split('#')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await require('./_dialogs').bridge(page); // appens egna dialogrutor
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/guide.html`);
  const visible = async () => page.$$eval('main section', s => s.filter(x => getComputedStyle(x).display !== 'none').map(x => x.id));
  if (JSON.stringify(await visible()) !== '["s-start"]') fail('Startsidan ska visas först: ' + await visible());
  const flows = { importera: /Importera planeringen/, koppla: /Koppla till 3D/, lagesplan: /Lägesplan/, dag: /Dagsplanering/, utskrift: /Utskrift/ };
  for (const [id, re] of Object.entries(flows)) {
    await page.click(`#nav a[href="#${id}"]`);
    await page.waitForFunction(i => document.getElementById('s-' + i).classList.contains('on'), id, { timeout: 3000 }).catch(() => {});
    const v = await visible();
    if (JSON.stringify(v) !== JSON.stringify(['s-' + id])) fail(`Bara sidan ${id} ska visas: ${v}`);
    if (!re.test(await page.textContent(`#s-${id} h2`))) fail('Fel rubrik för ' + id);
    if (await page.$$eval(`#s-${id} ol.steps > li`, l => l.length) < 3) fail('Varje arbetsflöde ska ha steg: ' + id);
    if (await page.evaluate(() => document.documentElement.scrollWidth) > 390) fail('Ingen sidledsscroll på mobil: ' + id);
  }
  // Direktlänk (som från lägesplanen) öppnar rätt sida med menyn synlig.
  await page.goto(`http://localhost:${PORT}/guide.html#lagesplan`);
  if (JSON.stringify(await visible()) !== '["s-lagesplan"]' || await page.evaluate(() => scrollY) !== 0) fail('Direktlänk till lägesplan');
  // Länkarna i apparna.
  const idx = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8'), lp = fs.readFileSync(path.join(DOCS, 'lagesplan.html'), 'utf8');
  if (!/id="btnGuide"[^>]*href="guide.html"|href="guide.html"[^>]*id="btnGuide"/.test(idx)) fail('4D-planering ska länka till guiden');
  if (!/href="guide.html#lagesplan"/.test(lp)) fail('Lägesplanen ska länka till guiden');
  if (errors.length) fail('Fel i sidan: ' + errors.join(' | '));
  await browser.close(); server.close();
  console.log('OK: guiden – start och fem arbetsflöden, mobilvänlig, länkad från båda apparna');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
