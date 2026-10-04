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
  console.log('OK: fotona i datummappar i lagerpanelen – fälls ut, tänds och släcks per dag');
  // Zonfilter: bara foton i en zon (2 m marginal vid gränsen med kalibrerad plan).
  await page.evaluate(() => {
    plan.calib = { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] }; // 1 m = 10 enheter, 2 m = 20
    plan.zones = [{ id: 'z1', code: 'A1', name: 'Sektionsfickor del 2', polys: [[[-0.5, -0.5], [1.5, -0.5], [1.5, 1.5], [-0.5, 1.5]]], labels: [] },
      { id: 'z2', code: 'B1', name: 'Fläkthus', polys: [[[100, 100], [200, 100], [200, 200], [100, 200]]], labels: [] },
      { id: 'z3', code: 'C1', name: 'Bara etikett', polys: [], labels: [[0, 0]] }];
    Object.assign(plan.photos.find(p => p.id === 'c'), { x: 60, y: 60 }); Object.assign(plan.photos.find(p => p.id === 'd'), { x: 40, y: 40 });
    plan.photos.push({ id: 'e', x: 215, y: 150, date: '2026-10-02', caption: 'Nära kanten' }, { id: 'f', x: 230, y: 150, date: '2026-10-02', caption: 'Utanför' });
    layerState['ulopen:zones'] = true; renderLayerPanel();
  });
  const opts = await page.evaluate(() => [...document.querySelectorAll('#layerList .pz-sel option')].map(o => o.value + ':' + o.textContent));
  if (JSON.stringify(opts) !== JSON.stringify([':Alla zoner', 'z1:A1 Sektionsfickor del 2', 'z2:B1 Fläkthus'])) fail('Zonvalet listar zoner med yta: ' + JSON.stringify(opts));
  await page.selectOption('#layerList .pz-sel', 'z1');
  const f1 = await page.evaluate(() => ({ ids: visiblePhotos().map(p => p.id), days: [...document.querySelectorAll('#layerList .photo-day-row')].map(r => r.dataset.phday + ':' + r.querySelector('small').textContent), cnt: document.querySelector('#layerList .layer-row[data-layer="photos"] .ln small').textContent }));
  if (JSON.stringify(f1.ids) !== '["a","b"]' || JSON.stringify(f1.days) !== '["2026-10-04:2"]' || f1.cnt !== '2 av 6') fail('Zonfilter A1: bara fotona i zonen: ' + JSON.stringify(f1));
  await page.selectOption('#layerList .pz-sel', 'z2');
  const z2 = await page.evaluate(() => ({ ids: visiblePhotos().map(p => p.id), z: photoZoneId(), all: photos().map(p => p.id + '@' + p.x + ',' + p.y) })); if (JSON.stringify(z2.ids) !== '["e"]') fail('Foto 1,5 m utanför zongränsen räknas med, 3 m utanför inte: ' + JSON.stringify(z2));
  // Sparad vy tar med filtret.
  if ((await page.evaluate(() => lsViewSnapshot().photoZone)) !== 'z2') fail('Zonfiltret ska följa med i en sparad vy');
  // 📷 på zonraden: visa fotona i zonen, tryck igen för alla.
  await page.selectOption('#layerList .pz-sel', '');
  await page.evaluate(() => { layerState['ulopen:__zones'] = true; renderLayerPanel(); });
  await page.click('#layerList .zone-layer-row[data-zone="z1"] .zl-ph');
  if ((await page.evaluate(() => photoZoneId() + ':' + visiblePhotos().length)) !== 'z1:2') fail('📷 på zonen ska filtrera fotona');
  if (!(await page.evaluate(() => document.querySelector('#layerList .zone-layer-row[data-zone="z1"] .zl-ph').classList.contains('on')))) fail('📷 ska markeras när zonen filtrerar');
  await page.click('#layerList .zone-layer-row[data-zone="z1"] .zl-ph');
  if ((await page.evaluate(() => photoZoneId() + ':' + visiblePhotos().length)) !== ':6') fail('📷 igen ska visa alla foton');
  if (await page.evaluate(() => !document.querySelector('#layerList .zone-layer-row[data-zone="z3"] .zl-ph').disabled)) fail('Zon utan yta kan inte filtrera');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK: zonfilter för fotona – rullgardin, 2 m marginal, 📷 på zonen, följer med i vyer');
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
  // Zonfiltret i lagerträdet.
  await ph.page.evaluate(() => { plan.zones = [{ id: 'z1', code: 'A1', name: 'Sektionsfickor', polys: [[[-0.5, -0.5], [1.5, -0.5], [1.5, 1.5], [-0.5, 1.5]]], labels: [] }]; renderLayerPanel(); renderFieldSheet(); });
  await ph.page.selectOption('#fieldSheetBody [data-fpsel]', 'z1'); await ph.page.waitForTimeout(150);
  const pz = await ph.page.evaluate(() => ({ ids: visiblePhotos().map(p => p.id), sel: document.querySelector('#fieldSheetBody [data-fpsel]').value, on: document.querySelector('#fieldSheetBody .fp-zone').classList.contains('on') }));
  if (JSON.stringify(pz) !== JSON.stringify({ ids: ['a', 'b'], sel: 'z1', on: true })) fail('iPhone: zonfiltret i lagerträdet: ' + JSON.stringify(pz));
  if (ph.errors.length) fail('Sidfel (iPhone): ' + ph.errors.join(' | '));
  await browser.close(); server.close();
  console.log('OK: fotona i datummappar och zonfilter i lagerträdet på iPhone');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
