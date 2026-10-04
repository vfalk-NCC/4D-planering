// Funktionstest: fotona i lagerhanteraren sorteras in i en mapp per datum (Victors önskemål
// 2026-10-04). Varje datummapp fälls ut och tänds/släcks för sig; släckta dagar ritas inte.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8998;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const open = async ctxOpts => {
    const page = await (await browser.newContext(ctxOpts)).newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib = { GlobalWorkerOptions: {} };' }));
    await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
    await page.evaluate(() => {
      plan = { id: 'pl', name: 'P', zones: [], photos: [
        { id: 'a', x: 0, y: 0, date: '2026-10-04', caption: 'Gjutning' }, { id: 'b', x: 1, y: 1, date: '2026-10-04', caption: 'Armering' },
        { id: 'c', x: 2, y: 2, date: '2026-10-01', caption: 'Schakt' }, { id: 'd', x: 3, y: 3, caption: 'Okänt' }] };
      layerState['ulopen:__photos'] = true; renderLayerPanel();
    });
    return { page, errors };
  };
  // Dator: datummappar i lagerpanelen.
  const { page, errors } = await open({ viewport: { width: 1300, height: 850 } });
  const days = await page.evaluate(() => [...document.querySelectorAll('#layerList .photo-day-row')].map(r => r.dataset.phday + ':' + r.querySelector('small').textContent));
  if (JSON.stringify(days) !== '["2026-10-04:2","2026-10-01:1",":1"]') fail('En mapp per datum, senaste först, utan datum sist: ' + JSON.stringify(days));
  if (await page.evaluate(() => [...document.querySelectorAll('#layerList .photo-in-day')].some(r => !r.classList.contains('hidden')))) fail('Datummapparna ska vara hopfällda från början');
  await page.click('#layerList .photo-day-row[data-phday="2026-10-04"] .pd-toggle');
  const shown = await page.evaluate(() => [...document.querySelectorAll('#layerList .photo-in-day:not(.hidden) .ln')].map(n => n.textContent.trim()));
  if (JSON.stringify(shown) !== '["Armering","Gjutning"]') fail('Utfälld dag visar dagens foton: ' + JSON.stringify(shown));
  await page.click('#layerList .photo-day-row[data-phday="2026-10-04"] .pd-vis');
  const vis = await page.evaluate(() => ({ ids: visiblePhotos().map(p => p.id), off: document.querySelector('#layerList .photo-day-row[data-phday="2026-10-04"]').classList.contains('off') }));
  if (JSON.stringify(vis.ids) !== '["c","d"]' || !vis.off) fail('Släckt dag ska döljas på planen: ' + JSON.stringify(vis));
  await page.click('#layerList .photo-day-row[data-phday="2026-10-04"] .pd-vis');
  if ((await page.evaluate(() => visiblePhotos().length)) !== 4) fail('Tänd dag ska visas igen');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK: fotona i datummappar i lagerpanelen – fälls ut, tänds och släcks per dag');
  // iPhone: samma datummappar i lagerträdet, som en egen nivå under Foton.
  const ph = await open({ viewport: { width: 390, height: 744 }, hasTouch: true, isMobile: true });
  await ph.page.evaluate(() => { layerState['ulopen:__photos'] = false; renderLayerPanel(); $('btnFieldLayers').click(); });
  await ph.page.waitForTimeout(600);
  await ph.page.click('[data-fpopen="photos"]'); await ph.page.click('[data-fpopen="photos|d:2026-10-04"]');
  const tree = await ph.page.evaluate(() => [...document.querySelectorAll('#fieldSheetBody .fp-row')].filter(r => /d[12]/.test(r.className)).map(r => r.className.replace('fp-row ', '') + ':' + r.querySelector('.fs-lbl').textContent));
  const [l4, l1] = await ph.page.evaluate(() => [photoDayLabel('2026-10-04'), photoDayLabel('2026-10-01')]);
  if (!/^sön 4 okt/.test(l4) || JSON.stringify(tree) !== JSON.stringify(['d1:' + l4, 'd2:Armering', 'd2:Gjutning', 'd1:' + l1, 'd1:Utan datum'])) fail('iPhone: datummappar under Foton: ' + JSON.stringify(tree));
  await ph.page.locator('#fieldSheetBody .fs-tog', { hasText: l1 }).click(); await ph.page.waitForTimeout(150);
  if (JSON.stringify(await ph.page.evaluate(() => visiblePhotos().map(p => p.id))) !== '["a","b","d"]') fail('iPhone: strömbrytaren släcker dagens foton');
  if (ph.errors.length) fail('Sidfel (iPhone): ' + ph.errors.join(' | '));
  await browser.close(); server.close();
  console.log('OK: fotona i datummappar i lagerträdet på iPhone');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
