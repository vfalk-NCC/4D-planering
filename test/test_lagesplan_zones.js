// Funktionstest: zoner (Victors önskemål 2026-10-02). Rita zon som polygon
// (Shift = raka linjer), eget utseende per zon (fyllning, opacitet, mönster,
// kantlinje, etikett, dölj), dra i hörnen, flytta etiketten, Delete tar bort,
// Ctrl+Z ångrar. DXF-filernas uppladdningsdatum syns diskret i lagerlistan.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8967;
const PID = 'p1';
const store = new Map([[`projects/${PID}/plan_items.json`, '[]'], [`projects/${PID}/status_plans.json`, '[]']]);

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS_DIR, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  let answer = 'PM20'; page.on('dialog', d => d.type() === 'prompt' ? d.accept(answer) : d.accept());
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); localStorage.setItem('lagesplan-field', '0'); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error("x")) }) };' }));
  await page.route('https://api.github.com/**', r => {
    const u = new URL(r.request().url());
    const f = decodeURIComponent(u.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (r.request().method() === 'PUT') { const b = JSON.parse(r.request().postData()); store.set(f, Buffer.from(b.content, 'base64').toString()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"content":{"sha":"s"}}' }); }
    if (!store.has(f)) return r.fulfill({ status: 404, body: '{}' });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(store.get(f)).toString('base64'), sha: 's' }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=${PID}`); await page.waitForTimeout(1000);
  await page.evaluate(() => {
    viewport = { transform: [1, 0, 0, 1, 0, 0], width: 1000, height: 800, convertToPdfPoint: (x, y) => [x, y], convertToViewportPoint: (x, y) => [x, y] };
    $('empty').classList.add('hidden');
    plan = { id: 'pl', name: 'P', zones: [], photos: [] }; plans = [plan];
    view.scale = 1; view.tx = 0; view.ty = 0; applyView(); renderZones(); showTab('zones');
  });
  const vb = await page.locator('#viewport').boundingBox();
  const savedZones = () => (JSON.parse(store.get(`projects/${PID}/status_plans.json`) || '[]')[0] || {}).zones || [];
  const zones = () => page.evaluate(() => JSON.parse(JSON.stringify(plan.zones)));

  // 1) Polygon: fyra hörn, Shift ger rak linje, Enter avslutar.
  if (!(await page.isVisible('#btnZonePoly'))) fail('⬠ Polygon ska finnas bland zonverktygen');
  if (await page.isVisible('#codePattern')) fail('Kodmönstret ska ligga under Avancerat');
  await page.click('#btnZonePoly');
  await page.mouse.click(vb.x + 100, vb.y + 100);
  await page.keyboard.down('Shift'); await page.mouse.move(vb.x + 300, vb.y + 108); await page.mouse.click(vb.x + 300, vb.y + 108); await page.keyboard.up('Shift');
  await page.mouse.click(vb.x + 320, vb.y + 260);
  await page.mouse.click(vb.x + 120, vb.y + 240);
  if (!/4 hörn/.test(await page.textContent('#zoneDrawHint'))) fail('Tipset ska visa antal hörn');
  await page.keyboard.press('Backspace');
  await page.mouse.click(vb.x + 110, vb.y + 250);
  await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
  let z = (await zones())[0];
  if (!z || z.code !== 'PM20' || z.polys[0].length !== 4) fail('Polygonen ska bli en zon med fyra hörn: ' + JSON.stringify(z));
  if (Math.abs(z.polys[0][1][1] - z.polys[0][0][1]) > 0.01) fail('Shift ska ge en rak (vågrät) linje: ' + JSON.stringify(z.polys[0]));
  if (Math.abs(z.polys[0][3][0] - 110) > 0.5) fail('⌫ ska ta bort senaste punkten: ' + JSON.stringify(z.polys[0]));
  if (!savedZones().length) fail('Zonen ska sparas');
  console.log('OK: zon som polygon – Shift ger raka linjer, ⌫ tar bort senaste punkten, Enter avslutar');

  // 2) Utseende per zon.
  if (!(await page.isVisible('#zeStyle .zs-fill'))) fail('Utseendet ska kunna ändras i zonredigeringen');
  await page.selectOption('#zeStyle .zs-fill', 'custom');
  await page.$eval('#zeStyle .zs-fillc', el => { el.value = '#ff8800'; el.dispatchEvent(new Event('input')); });
  await page.$eval('#zeStyle .zs-op', el => { el.value = 70; el.dispatchEvent(new Event('input')); });
  await page.selectOption('#zeStyle .zs-pat', 'hatch');
  await page.selectOption('#zeStyle .zs-stroke', 'custom');
  await page.$eval('#zeStyle .zs-w', el => { el.value = 3; el.dispatchEvent(new Event('input')); });
  await page.selectOption('#zeStyle .zs-dash', 'dashed');
  await page.selectOption('#zeStyle .zs-label', 'white');
  await page.fill('#zeStyle .zs-name', 'Hus A'); await page.$eval('#zeStyle .zs-name', el => el.dispatchEvent(new Event('change')));
  await page.check('#zeStyle .zs-showname');
  await page.waitForTimeout(1500);
  z = (await zones())[0];
  const st = z.style || {};
  if (st.fill !== 'custom' || st.fillColor !== '#ff8800' || st.fillOpacity !== 0.7 || st.pattern !== 'hatch' || st.stroke !== 'custom' || st.strokeWidth !== 3 || st.dash !== 'dashed' || st.label !== 'white' || !st.labelName || z.name !== 'Hus A') fail('Utseendet ska sparas på zonen: ' + JSON.stringify(z));
  if (!savedZones()[0].style || savedZones()[0].style.pattern !== 'hatch') fail('Utseendet ska sparas i projektet');
  // Alla mönster och etikettstilar ritas utan fel.
  await page.evaluate(() => { for (const p of ['none', 'hatch', 'cross', 'dots']) for (const l of ['pill', 'white', 'text', 'none']) { plan.zones[0].style.pattern = p; plan.zones[0].style.label = l; renderZones(); } plan.zones[0].style.label = 'white'; renderZones(); });
  console.log('OK: eget utseende per zon (fyllning, opacitet, mönster, kantlinje, etikett, namn) sparas');

  // 3) Dra ett hörn, Ctrl+Z ångrar.
  const v0 = z.polys[0][2];
  await page.mouse.move(vb.x + v0[0], vb.y + v0[1]); await page.mouse.down();
  await page.mouse.move(vb.x + v0[0] + 40, vb.y + v0[1] + 30, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(200);
  const v1 = (await zones())[0].polys[0][2];
  if (Math.abs(v1[0] - v0[0] - 40) > 2 || Math.abs(v1[1] - v0[1] - 30) > 2) fail('Hörnet ska gå att dra: ' + JSON.stringify([v0, v1]));
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
  const v2 = (await zones())[0].polys[0][2];
  if (Math.abs(v2[0] - v0[0]) > 0.01) fail('Ctrl+Z ska ångra flytten av hörnet: ' + JSON.stringify([v0, v2]));
  console.log('OK: hörnen dras och Ctrl+Z ångrar');

  // 4) Flytta etiketten.
  await page.click('#zeStyle .zs-move');
  await page.mouse.click(vb.x + 200, vb.y + 180); await page.waitForTimeout(150);
  const lb = (await zones())[0].labels;
  if (!lb || Math.abs(lb[0][0] - 200) > 1 || Math.abs(lb[0][1] - 180) > 1) fail('Etiketten ska flyttas dit man klickar: ' + JSON.stringify(lb));
  console.log('OK: 📍 etiketten flyttas med ett klick');

  // 5) Dölj: zonen går inte att klicka på men finns kvar i listan.
  await page.check('#zeStyle .zs-hidden'); await page.waitForTimeout(100);
  if (await page.evaluate(() => zoneAt([200, 180]))) fail('En dold zon ska inte gå att klicka på');
  if (!/dold/.test(await page.textContent('#zoneList'))) fail('En dold zon ska stå som dold i listan');
  await page.uncheck('#zeStyle .zs-hidden');
  console.log('OK: dölj zon');

  // 6) Delete tar bort den markerade zonen, Ctrl+Z tar tillbaka den.
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Delete'); await page.waitForTimeout(150);
  if ((await zones()).length) fail('Delete ska ta bort den markerade zonen');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
  if ((await zones()).length !== 1) fail('Ctrl+Z ska ta tillbaka zonen');
  console.log('OK: Delete tar bort zonen, Ctrl+Z ångrar');

  // 6b) Fler zonfunktioner (av från början): aktiviteter som kopplas, yta i m², flerval.
  await page.evaluate(() => {
    items = [{ id: 'i1', object_name: 'J1', activity: 'Gjutning', area: 'PM20', status: 'pagaende', start_date: '2000-01-01', end_date: '2999-01-01', progress: 40, source_key: 'k1' },
      { id: 'i2', object_name: 'J2', activity: 'Gjutning', area: 'PM20', status: 'pagaende', start_date: '2000-01-01', end_date: '2999-01-01', progress: 40, source_key: 'k1' },
      { id: 'i3', object_name: 'F1', activity: 'Formning', area: 'PM21', status: 'planerad', start_date: '2000-01-01', end_date: '2999-01-01', progress: 0 }];
    invalidateVisible && invalidateVisible(); itemCodeCache.clear();
    plan.calib = { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] };
    plan.zones.push({ id: 'z2', code: 'PM21', polys: [[[400, 400], [500, 400], [500, 500], [400, 500]]], labels: [] }, { id: 'z3', code: 'PM22', polys: [[[600, 400], [700, 400], [700, 500], [600, 500]]], labels: [] });
    plan.zones[0].style.pattern = 'hatch'; selectZone(plan.zones[0].id); showTab('zones'); renderZones();
  });
  if (await page.isVisible('#zeActs') || await page.isVisible('#zeArea')) fail('Aktivitetslistan och ytan ska vara avslagna från början');
  await page.evaluate(() => { $('zoneOptsBox').open = true; });
  await page.check('#zoActs'); await page.check('#zoArea'); await page.waitForTimeout(150);
  if (!/Gjutning.*\(2 obj\.\)/.test(await page.textContent('#zeActs'))) fail('Zonrutan ska lista aktiviteterna som kopplas: ' + await page.textContent('#zeActs'));
  await page.selectOption('#zeField', 'area'); await page.fill('#zeValue', 'PM21'); await page.waitForTimeout(100);
  if (!/Formning/.test(await page.textContent('#zeActs')) || /Gjutning/.test(await page.textContent('#zeActs'))) fail('Listan ska uppdateras när kopplingen ändras, innan man sparar');
  if ((await zones())[0].rule.field !== 'auto') fail('Förhandsvisningen ska inte spara kopplingen');
  await page.selectOption('#zeField', 'auto');
  if (!/Yta: [\d\s,]+ m²/.test(await page.textContent('#zeArea'))) fail('Ytan ska visas i zonrutan: ' + await page.textContent('#zeArea'));
  if (!/m²/.test(await page.textContent('#zoneList'))) fail('Ytan ska visas i zonlistan');
  const a21 = await page.evaluate(() => zoneAreaM2(plan.zones.find(z => z.code === 'PM21')));
  if (Math.abs(a21 - 100) > 0.01) fail('PM21 (10 × 10 m) ska vara 100 m²: ' + a21);
  await page.check('#zeStyle .zs-area'); await page.waitForTimeout(100);
  if (!(await zones())[0].style.labelArea) fail('Ytan ska kunna visas i etiketten');
  // Flerval: Ctrl-klick i listan, ändra utseendet på alla markerade.
  await page.check('#zoMulti');
  const rowOf = code => page.locator('#zoneList .zone-item', { hasText: code });
  await rowOf('PM21').click();
  await rowOf('PM22').click({ modifiers: ['Control'] }); await page.waitForTimeout(100);
  if (!/2 zoner markerade/.test(await page.textContent('#zeTitle'))) fail('Ctrl-klick ska markera flera zoner');
  if (await page.isVisible('#zeCode')) fail('Med flera markerade ska bara utseendet visas');
  await page.selectOption('#zeStyle .zs-pat', 'dots'); await page.waitForTimeout(100);
  const pats = await page.evaluate(() => plan.zones.map(z => [z.code, (z.style || {}).pattern || 'none']));
  if (JSON.stringify(pats) !== JSON.stringify([['PM20', 'hatch'], ['PM21', 'dots'], ['PM22', 'dots']])) fail('Utseendet ska ändras på alla markerade (och bara dem): ' + JSON.stringify(pats));
  await rowOf('PM20').click({ modifiers: ['Shift'] }); await page.waitForTimeout(100);
  if (!/3 zoner markerade/.test(await page.textContent('#zeTitle'))) fail('Shift-klick ska markera ett intervall');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(100);
  if (await page.evaluate(() => (plan.zones[1].style || {}).pattern === 'dots')) fail('Ctrl+Z ska ångra ändringen på alla markerade');
  await rowOf('PM21').click(); await page.waitForTimeout(100);
  if (!/Zon PM21/.test(await page.textContent('#zeTitle'))) fail('Vanligt klick ska gå tillbaka till en zon');
  console.log('OK: fler zonfunktioner – aktiviteter som kopplas (live), yta i m² (lista, ruta, etikett), flerval med Ctrl/Shift');

  // 7) Uppladdningsdatum för DXF – diskret (syns vid hovring).
  await page.evaluate(() => { siteItems.push({ id: 'c1', type: 'cad', name: 'Ritning', path: 'x', created_at: '2026-09-30T08:15:00Z', by: 'Victor', colorMode: 'orig', layers: [{ name: 'A', color: '#ff0000', n: 1 }], stats: { lines: 1, texts: 0, kb: 1 } }); showTab('work'); renderLayerPanel(); });
  const dt = page.locator('.layer-row[data-layer="cad:c1"] .cad-date');
  if ((await dt.textContent()) !== '2026-09-30' || !/Uppladdad .* av Victor/.test(await dt.getAttribute('title'))) fail('DXF-raden ska ha uppladdningsdatumet');
  if ((await dt.evaluate(el => getComputedStyle(el).opacity)) !== '0') fail('Datumet ska bara synas när man letar (hovrar)');
  await page.hover('.layer-row[data-layer="cad:c1"]'); await page.waitForTimeout(300);
  if (!(Number(await dt.evaluate(el => getComputedStyle(el).opacity)) > 0.3)) fail('Datumet ska synas vid hovring');
  console.log('OK: DXF-filernas uppladdningsdatum syns diskret vid hovring');

  if (errors.length) fail('Fel i sidan: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
