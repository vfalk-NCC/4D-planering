// Funktionstest: 3D-objekt i lagerlistan och "Tänd alla" i fältläget
// (Victors önskemål 2026-10-02). Lagret 3D-Objekt fälls ut med en rad per
// aktivitet; klick markerar på planen (och i 3D), Ctrl/Shift markerar flera,
// 👁 släcker/tänder, Delete släcker, Ctrl+Z ångrar.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8968;
const PID = 'p1';
const it = (id, name, extra) => ({ id, object_name: name, activity: 'Gjutning ' + name, area: 'PM1', status: 'pagaende', start_date: '2000-01-01', end_date: '2999-01-01', progress: 10, ...extra });
const items = [it('a', 'J1', { source_key: 'k1' }), it('b', 'J1b', { source_key: 'k1', activity: 'Gjutning J1' }), it('c', 'K2'), it('d', 'L3'), it('e', 'Utanför')];
const pos = [{ id: 'a', x: 10, y: 10, z0: 0, z1: 1 }, { id: 'b', x: 12, y: 10, z0: 0, z1: 1 }, { id: 'c', x: 30, y: 20, z0: 0, z1: 1 }, { id: 'd', x: 50, y: 30, z0: 0, z1: 1 }];
const store = new Map([[`projects/${PID}/plan_items.json`, JSON.stringify(items)], [`projects/${PID}/status_plans.json`, '[]'], [`projects/${PID}/plan_item_positions.json`, JSON.stringify(pos)]]);

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS_DIR, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const setup = async (ctxOpts, field) => {
    const page = await (await browser.newContext(ctxOpts)).newPage();
    require('./_reveal').autoReveal(page); // flikar och menyer (UI-översynen 2026-10-09)
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(f => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); localStorage.setItem('lagesplan-field', f ? '1' : '0'); }, field);
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
      $('empty').classList.add('hidden');
      plan = { id: 'pl', name: 'P', zones: [], photos: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } };
      invalidatePositions(); view.scale = 1; applyView(); renderZones(); showTab('work'); renderLayerPanel();
    });
    return { page, errors };
  };
  const { page, errors } = await setup({ viewport: { width: 1400, height: 900 } }, false);

  // 1) 3D-Objekt fälls ut: en rad per aktivitet med objekt på planen.
  const tog = page.locator('.layer-row[data-layer="objects"] .ul-toggle');
  if (!(await tog.count())) fail('3D-Objekt ska gå att fälla ut');
  await tog.click(); await page.waitForTimeout(100);
  const names = await page.locator('.obj-item-row .ln').allInnerTexts();
  if (names.length !== 3 || !names.some(n => /J1.*2 obj/.test(n)) || names.some(n => /Utanför/.test(n))) fail('En rad per aktivitet på planen: ' + JSON.stringify(names));
  console.log('OK: 3D-Objekt fälls ut med en rad per aktivitet (bara de som ligger på planen)');

  // 2) Klick markerar på planen; Ctrl-klick flera; markeringsraden.
  const row = n => page.locator('.obj-item-row', { hasText: n });
  await row('K2').locator('.ln').click(); await page.waitForTimeout(100);
  if (JSON.stringify(await page.evaluate(() => [...objFamSel])) !== '["c"]') fail('Klick ska markera aktiviteten på planen');
  await row('L3').locator('.ln').click({ modifiers: ['Control'] }); await page.waitForTimeout(150);
  if (!(await page.isVisible('#layerSelBar [data-a="sel3d"]'))) fail('Med flera markerade ska raden ha 🎯 Markera i 3D');
  if ((await page.evaluate(() => [...objFamSel].sort().join(','))) !== 'c,d') fail('Flera markerade ska visas på planen: ' + await page.evaluate(() => [...objFamSel].join(',')));
  console.log('OK: klick och Ctrl-klick markerar aktiviteterna på planen');

  // 3) Delete släcker de markerade, Ctrl+Z ångrar; 👁 släcker/tänder en rad.
  await page.keyboard.press('Delete'); await page.waitForTimeout(150);
  const hid = await page.evaluate(() => items.filter(isObjHidden).map(i => i.id).sort().join(','));
  if (hid !== 'c,d') fail('Delete ska släcka de markerade (inte ta bort dem): ' + hid);
  if ((await page.evaluate(() => items.length)) !== 5) fail('Inget ska tas bort ur planeringen');
  if (!(await row('K2').evaluate(el => el.classList.contains('off')))) fail('Släckta rader ska synas som släckta');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
  if (await page.evaluate(() => items.filter(isObjHidden).length)) fail('Ctrl+Z ska tända dem igen');
  await row('J1').locator('.oi-eye').click(); await page.waitForTimeout(100);
  if ((await page.evaluate(() => items.filter(isObjHidden).map(i => i.id).sort().join(','))) !== 'a,b') fail('👁 ska släcka hela aktiviteten');
  await row('J1').locator('.oi-eye').click(); await page.waitForTimeout(100);
  if (await page.evaluate(() => items.filter(isObjHidden).length)) fail('👁 igen ska tända den');
  // Ett objekt släckt via högerklick (id) tänds också från raden.
  await page.evaluate(() => { setObjHidden({ ids: ['c'], fams: [], acts: [], view: '' }); renderLayerPanel(); });
  await row('K2').locator('.oi-eye').click(); await page.waitForTimeout(100);
  if (await page.evaluate(() => items.filter(isObjHidden).length)) fail('👁 ska tända även objekt som släckts ett och ett');
  console.log('OK: Delete och 👁 släcker/tänder, Ctrl+Z ångrar, inget tas bort');
  if (errors.length) fail('Fel i sidan: ' + errors.join(' | '));

  // 4) Fältläget: 💡 Tänd alla 3D-objekt i lagerpanelen.
  const f = await setup({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true }, true);
  await f.page.evaluate(() => { setObjHidden({ ids: ['a', 'c'], fams: [], acts: [], view: '' }); });
  await f.page.tap('#apLayers'); await f.page.waitForTimeout(600);
  const btn = f.page.locator('#fieldSheetBody [data-objshow]');
  if (!(await btn.count()) || !/\(2\)/.test(await btn.innerText())) fail('Fältläget ska ha "Tänd alla 3D-objekt" med antal');
  if (!(await f.page.evaluate(() => { const b = document.querySelector('#fieldSheetBody [data-objshow]'), t = document.querySelector('#fieldSheetBody .fp-tree'); return b.classList.contains('fp-showall') && !!(t.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); }))) fail('"Tänd alla" ska ligga diskret under listan');
  await btn.tap(); await f.page.waitForTimeout(200);
  if (await f.page.evaluate(() => hiddenObjCount())) fail('Knappen ska tända alla objekt');
  if (await f.page.locator('#fieldSheetBody [data-objshow]').count()) fail('Knappen ska försvinna när inget är släckt');
  console.log('OK: fältläget har 💡 Tänd alla 3D-objekt');
  if (f.errors.length) fail('Fel i sidan: ' + f.errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
