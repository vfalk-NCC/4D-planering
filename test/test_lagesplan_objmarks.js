// Funktionstest: samlade och flyttbara objektmarkeringar (Victors önskemål 2026-10-02).
// Flera objekt i samma aktivitet blir en prick; prickarna är låsta, klick ger
// 🔓 Lås upp (dra) / 🔒 Lås / ↺ Återställ (tillbaka och låst). Sparas i projektet.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8969;
const PID = 'p1';
const it = (id, name, extra) => ({ id, object_name: name, activity: 'Gjutning ' + name, area: 'PM1', status: 'pagaende', start_date: '2000-01-01', end_date: '2999-01-01', progress: 10, ...extra });
const items = [it('a', 'J1', { source_key: 'k1' }), it('b', 'J1b', { source_key: 'k1', activity: 'Gjutning J1' }), it('c', 'K2'), it('d', 'L3'), it('e', 'Utanför')];
const pos = [{ id: 'a', x: 10, y: 10, z0: 0, z1: 1 }, { id: 'b', x: 12, y: 10, z0: 0, z1: 1 }, { id: 'c', x: 30, y: 20, z0: 0, z1: 1 }, { id: 'd', x: 50, y: 30, z0: 0, z1: 1 }];
const store = new Map([[`projects/${PID}/plan_items.json`, JSON.stringify(items)], [`projects/${PID}/status_plans.json`, '[]'], [`projects/${PID}/plan_item_positions.json`, JSON.stringify(pos)]]);

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS_DIR, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await require('./_dialogs').bridge(page); // appens egna dialogrutor
  require('./_reveal').autoReveal(page); // flikar och menyer (UI-översynen 2026-10-09)
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); localStorage.setItem('lagesplan-field', '0'); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error("x")) }) };' }));
  await page.route('https://api.github.com/**', r => {
    const u = new URL(r.request().url());
    const f = decodeURIComponent(u.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (r.request().method() === 'PUT') { const b = JSON.parse(r.request().postData()); store.set(f, Buffer.from(b.content, 'base64').toString()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"content":{"sha":"s"}}' }); }
    if (!store.has(f)) return r.fulfill({ status: 404, body: '{}' });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(store.get(f)).toString('base64'), sha: 's' }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=${PID}`); await page.waitForTimeout(1200);
  await page.evaluate(() => {
    viewport = { transform: [1, 0, 0, 1, 0, 0], width: 1000, height: 800, convertToPdfPoint: (x, y) => [x, y], convertToViewportPoint: (x, y) => [x, y] };
    ['zoneCanvas', 'objCanvas', 'topCanvas'].forEach(id => { $(id).width = 1000; $(id).height = 800; });
    $('empty').classList.add('hidden');
    plan = { id: 'pl', name: 'P', zones: [], photos: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } };
    invalidatePositions(); view.scale = 1; applyView(); renderZones();
  });
  const vb = await page.locator('#viewport').boundingBox();

  // 1) En markering per aktivitet: J1 (två objekt) blir en prick i mitten.
  let sh = await page.evaluate(() => objectShapesInPdf().map(o => ({ fam: o.fam, n: o.members.length, c: o.center })));
  const j = sh.find(s => s.n === 2);
  if (sh.length !== 3 || !j || Math.abs(j.c[0] - 110) > 0.01) fail('Två objekt i samma aktivitet ska bli en prick i mitten: ' + JSON.stringify(sh));
  await page.uncheck('#objGroup').catch(async () => { await page.evaluate(() => { showTab('work'); }); await page.uncheck('#objGroup'); });
  if ((await page.evaluate(() => objectShapesInPdf().length)) !== 4) fail('Avbockat ska varje objekt få en egen prick');
  await page.check('#objGroup');
  console.log('OK: en markering per aktivitet (med antal), går att slå av');

  // Klick på prickarna – flera i rad – markerar och zoomar i 3D varje gång (lås-listen ligger inte i vägen).
  await page.evaluate(() => { window.__calls = []; window.opener = { closed: false }; askOpener = (type, extra) => { window.__calls.push([type, extra]); return Promise.resolve({}); }; });
  for (const [x, y] of [[110, 100], [300, 200], [500, 300]]) { await page.mouse.click(vb.x + x, vb.y + y); await page.waitForTimeout(150); }
  const calls = await page.evaluate(() => window.__calls.map(c => c[0] + ':' + c[1].ids.join('+') + ':' + c[1].jump));
  if (JSON.stringify(calls) !== JSON.stringify(['select:a+b:true', 'select:c:true', 'select:d:true'])) fail('Varje klick på en prick ska markera och zooma i 3D: ' + JSON.stringify(calls));
  if (!(await page.isVisible('#objMarkBar .om-unlock'))) fail('Lås-listen ska visas för den klickade pricken');
  await page.mouse.click(vb.x + 700, vb.y + 600); await page.waitForTimeout(100);
  if (await page.isVisible('#objMarkBar')) fail('Klick bredvid ska stänga lås-listen');
  console.log('OK: klick på prickar zoomar i 3D varje gång, lås-knapparna ligger i en list längst ner');

  // 2) Låst från början: dra flyttar inte. Klick → 🔓 Lås upp → dra → sparas → 🔒 Lås.
  await page.mouse.move(vb.x + 110, vb.y + 100); await page.mouse.down(); await page.mouse.move(vb.x + 160, vb.y + 140, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(150);
  if (await page.evaluate(() => objectShapesInPdf().some(o => o.moved))) fail('En låst markering ska inte flyttas');
  await page.evaluate(() => { view.tx = 0; view.ty = 0; applyView(); }); // draget panorerade planen i stället

  await page.mouse.click(vb.x + 110, vb.y + 100); await page.waitForTimeout(150);
  if (!(await page.isVisible('#objMarkBar .om-unlock'))) fail('Klick på pricken ska visa 🔓 Lås upp');
  await page.click('#objMarkBar .om-unlock');
  await page.mouse.move(vb.x + 110, vb.y + 100); await page.mouse.down(); await page.mouse.move(vb.x + 210, vb.y + 160, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(300);
  const fam = j.fam;
  const saved = (JSON.parse(store.get(`projects/${PID}/site_layers.json`) || '[]').find(x => x.type === 'objmarks') || {}).pos || {};
  if (!saved[fam] || Math.abs(saved[fam][0] - 21) > 0.2 || Math.abs(saved[fam][1] - 16) > 0.2) fail('Den flyttade markeringen ska sparas i projektet (modellkoordinater): ' + JSON.stringify(saved));
  sh = await page.evaluate(f => objectShapesInPdf().find(o => o.fam === f), fam);
  if (!sh.moved || Math.abs(sh.center[0] - 210) > 2) fail('Pricken ska ligga där den släpptes: ' + JSON.stringify(sh.center));
  await page.mouse.click(vb.x + 210, vb.y + 160); await page.waitForTimeout(150);
  await page.click('#objMarkBar .om-lock'); await page.waitForTimeout(100);
  await page.mouse.move(vb.x + 210, vb.y + 160); await page.mouse.down(); await page.mouse.move(vb.x + 300, vb.y + 300, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(150);
  if (Math.abs((await page.evaluate(f => objectShapesInPdf().find(o => o.fam === f).center[0], fam)) - 210) > 2) fail('Låst igen ska den inte gå att dra');
  await page.evaluate(() => { view.tx = 0; view.ty = 0; applyView(); });
  console.log('OK: låst från början, 🔓 lås upp, dra, sparas, 🔒 lås');

  // 3) ↺ Återställ: tillbaka till objektens läge och låst. Ctrl+Z ångrar.
  await page.mouse.click(vb.x + 210, vb.y + 160); await page.waitForTimeout(150);
  await page.click('#objMarkBar .om-reset'); await page.waitForTimeout(300);
  sh = await page.evaluate(f => objectShapesInPdf().find(o => o.fam === f), fam);
  if (sh.moved || Math.abs(sh.center[0] - 110) > 0.01) fail('↺ ska lägga tillbaka markeringen: ' + JSON.stringify(sh.center));
  if (await page.evaluate(f => objMarkUnlocked.has(f), fam)) fail('↺ ska låsa markeringen');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  if (!(await page.evaluate(f => objectShapesInPdf().find(o => o.fam === f).moved, fam))) fail('Ctrl+Z ska ångra återställningen');
  console.log('OK: ↺ återställer till objektens läge och låser, Ctrl+Z ångrar');

  // 4) Skarpt vid inzoomning: lagren ritas i skärmens upplösning för det synliga området; export i grundupplösning.
  await page.evaluate(() => { const pc = $('pdfCanvas'); pc.width = 1000; pc.height = 800; });
  const zoomed = await page.evaluate(() => {
    view.scale = 4; view.tx = -400; view.ty = -300; applyView(); renderZones();
    const c = $('topCanvas'), o = $('objCanvas');
    const r = { w: c.width, cssW: parseFloat(c.style.width), left: parseFloat(c.style.left), objR: objMinPx };
    const full = composeImage(null, true, 'over');
    r.exportW = full.width; r.after = $('topCanvas').width;
    view.scale = 1; view.tx = 0; view.ty = 0; applyView(); renderZones();
    r.out = { w: $('topCanvas').width, cssW: parseFloat($('topCanvas').style.width) };
    return r;
  });
  if (!(zoomed.w / zoomed.cssW > 3.5) || !(zoomed.cssW < 1000)) fail('Inzoomat ska lagret ha skärmupplösning för det synliga området: ' + JSON.stringify(zoomed));
  if (zoomed.exportW !== 1000) fail('Exporten ska ha samma storlek som förut (grundupplösning): ' + JSON.stringify(zoomed));
  if (zoomed.after !== zoomed.w) fail('Efter exporten ska skärmen vara skarp igen: ' + JSON.stringify(zoomed));
  if (zoomed.out.w !== 1000 || zoomed.out.cssW !== 1000) fail('Utzoomat ska hela bladet ritas som förut: ' + JSON.stringify(zoomed.out));
  console.log('OK: skarpa prickar och etablering vid inzoomning, exporten oförändrad');
  if (errors.length) fail('Fel i sidan: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
