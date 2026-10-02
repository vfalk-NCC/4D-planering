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

  // 3b) Dra en sida: båda hörnen flyttas parallellt längs sidans normal.
  {
    const P = (await zones())[0].polys[0], a0 = P[1], b0 = P[2];
    const mid = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2];
    const nx = -(b0[1] - a0[1]), ny = b0[0] - a0[0], nl = Math.hypot(nx, ny);
    const cur = await page.evaluate(([x, y]) => { const ev = { clientX: x, clientY: y }; const h = zoneEdgeAt(ev); return h ? zoneEdgeCursor(h) : null; }, [vb.x + mid[0], vb.y + mid[1]]);
    if (!cur || !/resize/.test(cur)) fail('Sidan ska kännas igen under pekaren: ' + cur);
    await page.mouse.move(vb.x + mid[0], vb.y + mid[1]); await page.mouse.down();
    await page.mouse.move(vb.x + mid[0] + 25, vb.y + mid[1] + 15, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(200);
    const off = (25 * nx + 15 * ny) / nl, ex = nx / nl * off, ey = ny / nl * off;
    const Q = (await zones())[0].polys[0];
    const near = (p, q) => Math.abs(p[0] - q[0]) < 1.5 && Math.abs(p[1] - q[1]) < 1.5;
    if (!near(Q[1], [a0[0] + ex, a0[1] + ey]) || !near(Q[2], [b0[0] + ex, b0[1] + ey])) fail('Sidan ska flyttas parallellt: ' + JSON.stringify({ a0, b0, Q, ex, ey }));
    if (!near(Q[0], P[0]) || Q.length !== P.length) fail('Övriga hörn ska ligga kvar: ' + JSON.stringify([P, Q]));
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
    if (!near((await zones())[0].polys[0][1], a0)) fail('Ctrl+Z ska ångra flytten av sidan');
  }
  console.log('OK: sidorna dras parallellt och Ctrl+Z ångrar');

  // 4) Etiketten redigeras som en notering: dra för att flytta, klicka för text, radbrytning, rotation, storlek.
  const lb0 = await page.evaluate(() => { const b = zoneLabelBoxes[0]; return stageToScreen([b.x, b.y]); });
  await page.mouse.move(vb.x + lb0[0], vb.y + lb0[1]); await page.mouse.down();
  await page.mouse.move(vb.x + lb0[0] + 30, vb.y + lb0[1] + 20, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(150);
  const lb = (await zones())[0].labels;
  if (!lb || !lb.length || Math.abs(lb[0][0] - lb0[0] - 30) > 1.5 || Math.abs(lb[0][1] - lb0[1] - 20) > 1.5) fail('Etiketten ska gå att dra: ' + JSON.stringify([lb0, lb]));
  await page.keyboard.press('Control+z'); await page.waitForTimeout(100);
  if (((await zones())[0].labels || []).length) fail('Ctrl+Z ska ångra flytten av etiketten');
  const lb1 = await page.evaluate(() => { const b = zoneLabelBoxes[0]; return stageToScreen([b.x, b.y]); });
  await page.mouse.click(vb.x + lb1[0], vb.y + lb1[1]); await page.waitForTimeout(150);
  if (!(await page.isVisible('#sitePop .zl-text'))) fail('Klick på etiketten ska öppna redigeringen (som för noteringar)');
  await page.fill('#sitePop .zl-text', '{kod}\nFörtjockardelen {%}');
  await page.selectOption('#sitePop .zl-wrap', '12');
  await page.click('#sitePop [data-rot="90"]');
  await page.$eval('#sitePop .zl-size', el => { el.value = 150; el.dispatchEvent(new Event('input')); });
  const live = await page.evaluate(() => zoneLabelBoxes[0]);
  if (Math.abs(live.rot - Math.PI / 2) > 1e-6 || !(live.h > 40)) fail('Rotation och flera rader ska synas direkt: ' + JSON.stringify(live));
  await page.click('#sitePop .zl-cancel'); await page.waitForTimeout(100);
  if ((await zones())[0].style.labelRot) fail('Avbryt ska återställa etiketten');
  await page.mouse.click(vb.x + lb1[0], vb.y + lb1[1]); await page.waitForTimeout(150);
  await page.fill('#sitePop .zl-text', '{kod}\nFörtjockardelen');
  await page.fill('#sitePop .zl-rotv', '-30'); await page.$eval('#sitePop .zl-rotv', el => el.dispatchEvent(new Event('change')));
  await page.click('#sitePop .zl-save'); await page.waitForTimeout(1500);
  const zst = (await zones())[0].style;
  if (zst.labelText !== '{kod}\nFörtjockardelen' || zst.labelRot !== -30) fail('Text och rotation ska sparas: ' + JSON.stringify(zst));
  if (!savedZones()[0].style || savedZones()[0].style.labelRot !== -30) fail('Etiketten ska sparas i projektet');
  // Klick på en roterad etikett träffar den.
  const lb2 = await page.evaluate(() => { const b = zoneLabelBoxes[0]; return stageToScreen([b.x + Math.cos(b.rot) * b.w * 0.35, b.y + Math.sin(b.rot) * b.w * 0.35]); });
  await page.mouse.click(vb.x + lb2[0], vb.y + lb2[1]); await page.waitForTimeout(150);
  if (!(await page.isVisible('#sitePop .zl-text'))) fail('En roterad etikett ska gå att klicka på längs sin riktning');
  await page.click('#sitePop .zl-cancel');
  // 🎯 Markera i 3D ligger på zonraden.
  if (!(await page.locator('#zoneList .zone-item .z3d').count())) fail('🎯 Markera i 3D ska ligga på zonraden');
  if (await page.locator('#zeSelect3d').count()) fail('Markera i 3D ska inte längre ligga i zonrutan');
  console.log('OK: zonetiketten dras och redigeras som en notering (text med radbrytning, rotation, storlek), 🎯 på zonraden');

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

  // 6c) Zoner fäster mot varandra och överlappar aldrig.
  await page.evaluate(() => { view.scale = 1; view.tx = 0; view.ty = 0; applyView(); plan.zones = [{ id: 'A', code: 'PM40', polys: [[[600, 100], [800, 100], [800, 300], [600, 300]]], labels: [] }]; selectZone(null); showTab('zones'); renderZones(); });
  answer = 'PM41';
  await page.click('#btnZonePoly');
  // Hörn 4 px från A:s kant fäster på kanten; zonen ritas så att den sticker in 50 px i A.
  for (const [x, y] of [[804, 150], [950, 150], [950, 250], [750, 250]]) await page.mouse.click(vb.x + x, vb.y + y);
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  const B = await page.evaluate(() => plan.zones.find(z => z.code === 'PM41'));
  if (!B) fail('Den nya zonen ska skapas');
  const xs = B.polys[0].map(p => Math.round(p[0])), minX = Math.min(...xs);
  if (minX !== 800) fail('Den nya zonen ska fästa mot och klippas vid grannens kant (x = 800): ' + JSON.stringify(B.polys));
  const overlap = await page.evaluate(() => { const pc = polygonClipping, r = p => [[...p, p[0]]]; const [a, b] = plan.zones; return pc.intersection(r(a.polys[0]), r(b.polys[0])).reduce((s, pg) => s + Math.abs(polyArea(pg[0].slice(0, -1))), 0); });
  if (overlap > 0.01) fail('Zonerna får inte överlappa: ' + overlap);
  if (!/klipptes mot PM40/.test(await page.textContent('#zoneDrawHint'))) fail('Det ska framgå att zonen klipptes: ' + await page.textContent('#zoneDrawHint'));
  // Dra ett hörn på PM41 in i PM40: zonen klipps igen.
  await page.evaluate(() => { view.tx = 0; view.ty = 0; applyView(); selectZone(plan.zones.find(z => z.code === 'PM41').id); });
  const v = await page.evaluate(() => { const z = plan.zones.find(z => z.code === 'PM41'); return z.polys.flat().sort((p, q) => Math.hypot(p[0] - 950, p[1] - 150) - Math.hypot(q[0] - 950, q[1] - 150))[0]; });
  await page.mouse.move(vb.x + v[0], vb.y + v[1]); await page.mouse.down(); await page.mouse.move(vb.x + 700, vb.y + 150, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(200);
  const ov2 = await page.evaluate(() => { const pc = polygonClipping, r = p => [[...p, p[0]]]; const a = plan.zones.find(z => z.code === 'PM40'), b = plan.zones.find(z => z.code === 'PM41'); return b.polys.reduce((s, q) => s + pc.intersection(r(a.polys[0]), r(q)).reduce((t, pg) => t + Math.abs(polyArea(pg[0].slice(0, -1))), 0), 0); });
  if (ov2 > 0.01) fail('Ett hörn som dras in i grannen ska klippas: ' + ov2);
  const moved = await page.evaluate(() => plan.zones.find(z => z.code === 'PM41').polys.flat().some(p => Math.abs(p[0] - 950) < 1 && Math.abs(p[1] - 150) < 1));
  if (moved) fail('Hörnet ska ha flyttats (och klippts vid grannens kant)');
  // En zon helt inuti en annan går inte att skapa.
  answer = 'PM42';
  await page.evaluate(() => { view.tx = 0; view.ty = 0; applyView(); selectZone(null); });
  await page.click('#btnZonePoly');
  for (const [x, y] of [[650, 150], [700, 150], [700, 200]]) await page.mouse.click(vb.x + x, vb.y + y);

  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  if (await page.evaluate(() => plan.zones.some(z => z.code === 'PM42'))) fail('En zon helt inuti en annan ska inte skapas: ' + JSON.stringify(await page.evaluate(() => plan.zones.map(z => [z.code, z.polys]))));
  console.log('OK: zoner fäster mot varandras hörn och kanter och klipps så att de aldrig överlappar');

  // 6d) Zonerna i lagerhanteraren: fäll ut, släck/tänd per zon, klick markerar.
  await page.evaluate(() => { selectZone(null); showTab('work'); renderZones(); renderLayerPanel(); });
  if (await page.locator('#layerList .zone-layer-row:not(.hidden)').count()) fail('Zonraderna ska vara ihopfällda från början');
  await page.click('#layerList [data-ul="__zones"]');
  const zl = await page.$$eval('#layerList .zone-layer-row:not(.hidden) .ln', r => r.map(x => x.textContent.trim()));
  if (zl.length !== 2 || !/PM40/.test(zl[0]) || !/PM41/.test(zl[1])) fail('Lagret Zoner ska fällas ut med en rad per zon: ' + JSON.stringify(zl));
  await page.uncheck('#layerList .zone-layer-row[data-zone="A"] .zl-vis'); await page.waitForTimeout(200);
  if (!(await page.evaluate(() => plan.zones.find(z => z.id === 'A').style.hidden))) fail('Kryssrutan ska släcka zonen');
  if (!(await page.locator('#layerList .zone-layer-row[data-zone="A"]').evaluate(r => r.classList.contains('off')))) fail('Släckt zon ska synas som släckt i listan');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
  if (await page.evaluate(() => !!(plan.zones.find(z => z.id === 'A').style || {}).hidden)) fail('Ctrl+Z ska tända zonen igen');
  if (!(await page.isChecked('#layerList .zone-layer-row[data-zone="A"] .zl-vis'))) fail('Listan ska följa med när zonen tänds igen');
  await page.click('#layerList .zone-layer-row[data-zone="A"] .ln'); await page.waitForTimeout(150);
  if (await page.evaluate(() => selectedZoneId) !== 'A') fail('Klick på zonraden ska markera zonen');
  // Ny zon syns direkt i listan.
  await page.evaluate(() => { plan.zones.push({ id: 'C', code: 'PM43', polys: [[[1000, 400], [1100, 400], [1100, 500]]], labels: [] }); renderZones(); });
  if (!(await page.locator('#layerList .zone-layer-row[data-zone="C"]').count())) fail('En ny zon ska dyka upp i lagerlistan');
  console.log('OK: zonerna i lagerhanteraren – fäll ut, släck/tänd per zon, klick markerar');

  // 6e) WBS-nivåer (avancerat, avslaget från början): överzonen räknas fram ur sina zoner.
  await page.evaluate(() => { showTab('zones'); selectZone('A'); });
  if (await page.isVisible('#zeWbs')) fail('Överzon ska inte synas innan alternativet slagits på');
  if (await page.isVisible('#zoWbsRow')) fail('Nivåvalet ska inte synas innan alternativet slagits på');
  await page.evaluate(() => { $('zoneOptsBox').open = true; });
  await page.check('#zoWbs'); await page.waitForTimeout(100);
  if (!(await page.isVisible('#zeWbs')) || !(await page.isVisible('#zoWbsRow'))) fail('Med WBS-nivåer ska Överzon och nivåvalet synas');
  await page.fill('#zeParent', '742 Sikthall'); await page.dispatchEvent('#zeParent', 'change'); await page.waitForTimeout(100);
  const b41 = await page.evaluate(() => plan.zones.find(z => z.code === 'PM41').id);
  await page.evaluate(id => selectZone(id), b41); await page.waitForTimeout(100);
  const opts = await page.$$eval('#zeParents option', o => o.map(x => x.value));
  if (!opts.includes('742 Sikthall')) fail('Befintliga överzoner ska föreslås: ' + JSON.stringify(opts));
  await page.fill('#zeParent', '742 sikthall'); await page.dispatchEvent('#zeParent', 'change'); await page.waitForTimeout(150);
  const wg = await page.evaluate(() => { const g = wbsGroups(); return g.map(x => ({ name: x.name, n: x.children.length, parts: x.polys.length, area: x.polys.reduce((s, r) => s + Math.abs(polyArea(r[0])), 0) })); });
  const sumA = await page.evaluate(() => plan.zones.filter(z => z.parent).reduce((s, z) => s + z.polys.reduce((t, p) => t + Math.abs(polyArea(p)), 0), 0));
  if (wg.length !== 1 || wg[0].n !== 2) fail('Zoner med samma överzon (oavsett skiftläge) ska bli en överzon: ' + JSON.stringify(wg));
  if (wg[0].parts !== 1 || Math.abs(wg[0].area - sumA) > 1) fail('Överzonen ska vara sammanslagningen av zonerna: ' + JSON.stringify({ wg, sumA }));
  const wl = await page.textContent('#zoneList .wbs-item');
  if (!/742 Sikthall/.test(wl) || !/2 zoner/.test(wl)) fail('Zonlistan ska visa överzonen med samlad status: ' + wl);
  // Nivåerna: båda, bara överzoner, bara zoner.
  const lv = async v => { await page.selectOption('#zoWbsLevel', v); await page.waitForTimeout(100);
    return page.evaluate(() => { const c = document.createElement('canvas'); c.width = 2000; c.height = 2000; return drawZoneShapes(c.getContext('2d'), 14, null).map(b => [b[1], b[5]]); }); };
  const both = await lv('both'), one = await lv('1'), two = await lv('2');
  const hasWbs = l => l.some(([t, id]) => !id && /742 Sikthall/.test(t)), hasKid = l => l.some(([t, id]) => id === 'A');
  if (!hasWbs(both) || !hasKid(both)) fail('Båda nivåerna: överzon och zoner: ' + JSON.stringify(both));
  if (!hasWbs(one) || hasKid(one) || !one.some(([t, id]) => id === 'C')) fail('Bara överzoner: zonerna i överzonen döljs, andra zoner syns: ' + JSON.stringify(one));
  if (hasWbs(two) || !hasKid(two)) fail('Bara zoner: ingen överzon: ' + JSON.stringify(two));
  await page.selectOption('#zoWbsLevel', 'both');
  // Ångra: överzonen tas bort från zonen igen.
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
  if (await page.evaluate(id => !!plan.zones.find(z => z.id === id).parent, b41)) fail('Ctrl+Z ska ångra överzonen');
  // Avslaget: inget av detta syns.
  await page.uncheck('#zoWbs'); await page.waitForTimeout(100);
  if (await page.locator('#zoneList .wbs-item').count()) fail('Utan alternativet ska överzonerna inte synas i listan');
  if ((await page.evaluate(() => { const c = document.createElement('canvas'); return drawZoneShapes(c.getContext('2d'), 14, null).filter(b => !b[5]).length; }))) fail('Utan alternativet ska överzonerna inte ritas');
  const lpRule = await page.evaluate(() => { const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
    return [computeItemPhase({ start_date: d(-3), end_date: d(10), status: 'pagaende', progress: 0 }, d(0), 0), computeItemPhase({ start_date: d(-3), end_date: d(10), progress: 5 }, d(0), 0)].join(','); });
  if (lpRule !== 'forsenad,pagaende') fail('Lägesplanen: startad utan framdrift = försenad, med framdrift = pågående: ' + lpRule);
  console.log('OK: WBS-nivåer (avancerat) – överzon räknas fram ur zonerna, visa båda/nivå 1/nivå 2, ångra');

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
