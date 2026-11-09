// Funktionstest: placera okopplade aktiviteter i 2D-lägesplanen, exportera IFC och koppla till Gantten (Victor 2026-11-09).
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8987;
const PID = 'p1';
const it = (id, name, extra) => ({ id, object_name: name, activity: 'Gjutning ' + name, area: 'PM1', status: 'pagaende', start_date: '2000-01-01', end_date: '2999-01-01', progress: 10, ...extra });
const items = [it('a', 'J1', { model_id: 'M1', object_id: 'g1' }), it('x', 'Armering platta', { activity: 'Armering platta', contractor: 'NordStål' }), it('y', 'Etablering kontor', { activity: 'Etablering kontor' })];
const pos = [{ id: 'a', x: 10, y: 10, z0: 0, z1: 1 }];
const store = new Map([[`projects/${PID}/plan_items.json`, JSON.stringify(items)], [`projects/${PID}/status_plans.json`, '[]'], [`projects/${PID}/plan_item_positions.json`, JSON.stringify(pos)]]);

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS_DIR, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await require('./_dialogs').bridge(page); // appens egna dialogrutor
  require('./_reveal').autoReveal(page); // flikar och menyer (UI-översynen 2026-10-09)
  page.on('dialog', d => d.accept());
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('lagesplan-objmovefree', '0'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); localStorage.setItem('lagesplan-field', '0'); });
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


  // 1) Okopplade aktiviteter utan prick listas; kopplade och placerade gör det inte.
  const list = await page.evaluate(() => apUnplaced().map(f => f.name).sort());
  if (JSON.stringify(list) !== JSON.stringify(['Armering platta', 'Etablering kontor'])) fail('Listan ska visa de okopplade aktiviteterna utan prick: ' + JSON.stringify(list));
  { const f = await page.evaluate(() => objListFamilies().map(q => [famName(q.it), q.unplaced]).sort()); const names = f.map(q => q[0]).join('|');
    if (!f.some(q => q[0] === 'Armering platta' && q[1]) || !f.some(q => q[0] === 'J1' && !q[1])) fail('Lagerlistan ska visa både placerade och oplacerade aktiviteter: ' + names); }
  await page.click('#btnApPlace'); await page.waitForTimeout(200);
  if (!(await page.isVisible('#apPanel'))) fail('Panelen ska öppnas');
  // 2) Välj Armering platta och tryck i planen.
  await page.click('#apPanel .ap-it >> text=Armering platta'); await page.waitForTimeout(100);
  if ((await page.evaluate(() => objTool)) !== 'actplace') fail('Verktyget ska vara aktivt när en aktivitet valts');
  await page.mouse.click(vb.x + 400, vb.y + 300); await page.waitForTimeout(500);
  const p1 = await page.evaluate(() => positions.find(p => p.id === 'x'));
  if (!p1 || Math.abs(p1.x - 40) > 0.01 || Math.abs(p1.y - 30) > 0.01 || !p1.placed) fail('Pricken ska ligga där jag tryckte (modell 40,30): ' + JSON.stringify(p1));
  if (!JSON.parse(store.get(`projects/${PID}/plan_item_positions.json`)).some(r => r.id === 'x' && r.placed)) fail('Placeringen ska sparas i projektet');
  if (!(await page.evaluate(() => objectShapesInPdf().some(o => o.it.id === 'x')))) fail('Pricken ska synas i planen');
  if (!(await page.evaluate(() => objIsFree(items.find(i => i.id === 'x'))))) fail('Placerad prick ska gå att dra fritt');
  if ((await page.evaluate(() => objTool)) !== null || (await page.evaluate(() => ap.sel)) !== null) fail('Efter en placering ska verktyget avslutas (inget klick placerar fler av misstag)');
  { // Drag med musen i verktygsläget ska panorera, inte förstöra vyn eller placera
    await page.click('#apPanel .ap-it >> text=Etablering kontor'); await page.waitForTimeout(100);
    const v0 = await page.evaluate(() => [view.tx, view.ty]);
    await page.mouse.move(vb.x + 300, vb.y + 300); await page.mouse.down(); await page.mouse.move(vb.x + 360, vb.y + 340, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(200);
    const v1 = await page.evaluate(() => [view.tx, view.ty, apPlacedRows().length]);
    if (!v1.every(Number.isFinite) || Math.abs(v1[0] - v0[0] - 60) > 1 || Math.abs(v1[1] - v0[1] - 40) > 1 || v1[2] !== 1) fail('Drag i placeringsläget ska panorera (inte ge NaN eller placera): ' + JSON.stringify({ v0, v1 })); }
  await page.evaluate(() => { ap.multi = true; });
  await page.mouse.click(vb.x + 600, vb.y + 500); await page.waitForTimeout(500);
  if ((await page.evaluate(() => apPlacedRows().length)) !== 2) fail('Båda aktiviteterna ska vara placerade');
  { await page.evaluate(() => apRender()); const t = await page.locator('#apPanel .ap-pl').allInnerTexts();
    if (!t.length || !t.every(x => /PM1/.test(x)) || !t.some(x => /Armering platta/.test(x))) fail('Placerade ska visa namn och område/uppgifter: ' + JSON.stringify(t)); }
  console.log('OK: okopplade aktiviteter placeras med klick i planen och sparas');
  // 3) Ångra: sista placeringen tas bort.
  await page.evaluate(() => objStatusUndo()); await page.waitForTimeout(400);
  if ((await page.evaluate(() => apPlacedRows().length)) !== 1) fail('Ångra ska ta bort sista placeringen');
  await page.mouse.click(vb.x + 600, vb.y + 500); await page.waitForTimeout(500);
  // 4) IFC-exporten: fasta GUID, namn och egenskaper; laddas upp till TC.
  await page.evaluate(() => { window.__calls = []; window.opener = { closed: false }; window.downloadBlob = () => {}; askOpener = async (type, extra) => { window.__calls.push([type, extra]); if (type === 'tcUpload') { window.__ifc = await extra.files[0].text(); return { folder: 'X' }; } if (type === 'ifcModelsList') return { models: [{ id: 'MODEL9', name: apFileName() }] }; return {}; }; });
  const g1 = await page.evaluate(() => [apGuid('x'), apGuid('x'), apGuid('y')]);
  if (g1[0] !== g1[1] || g1[0] === g1[2] || !/^[0-3][0-9A-Za-z_$]{21}$/.test(g1[0])) fail('GUID ska vara fast per id och giltigt: ' + g1);
  { // Höjd: grannar → uppskattad, fast höjd → exakt
    const h = await page.evaluate(async () => { positions.push({ id: 'n1', x: 35, y: 30, z0: 412.6, z1: 414.5 }, { id: 'n2', x: 45, y: 28, z0: 412.8, z1: 414.5 }, { id: 'n3', x: 40, y: 38, z0: 412.4, z1: 414.5 }); const g = apGroundZ(40, 30); const fam = apPlacedRows().filter(r => r.id === 'x'); await apSetZ({ rows: fam, name: 'x' }, '415,5'); const f = apHeightOf(positions.find(p => p.id === 'x')); return { g, f }; });
    if (h.g.src !== 'grannar' || Math.abs(h.g.z - 412.6) > 0.01) fail('Höjden ska uppskattas från närmaste objekt: ' + JSON.stringify(h.g));
    if (h.f.src !== 'fast' || Math.abs(h.f.z - 415.5) > 0.001) fail('Fast höjd ska gälla: ' + JSON.stringify(h.f));
    if (!JSON.parse(store.get(`projects/${PID}/plan_item_positions.json`)).some(r => r.id === 'x' && r.zFixed && r.z1 === 415.5)) fail('Den fasta höjden ska sparas i projektet'); }
  await page.evaluate(() => apExport()); await page.waitForTimeout(600);
  const ifc = await page.evaluate(() => window.__ifc || '');
  if (!ifc.includes(g1[0]) || !ifc.includes(g1[2]) || !ifc.includes('Armering platta') || !ifc.includes('IFCBUILDINGELEMENTPROXY')) fail('IFC-filen ska ha en markör per aktivitet med fast id: ' + ifc.length + ' ' + ifc.includes(g1[0]) + ifc.includes(g1[2]) + ifc.includes('Armering platta') + ' ' + await page.evaluate(() => JSON.stringify(window.__calls.map(c => c[0]))) + ' ' + ifc.slice(0, 80));
  if (!/IFCCARTESIANPOINT\(\(40\.,30\.,415\.6\)\)/.test(ifc) || !/H\\X2\\00F6\\X0\\jdk/.test(ifc)) fail('IFC-markören ska ligga på rätt höjd (415,5 + 0,1) med höjdkälla: ' + (ifc.match(/IFCCARTESIANPOINT\(\([-0-9.]+,[-0-9.]+,41[0-9.]+\)\)/g) || []).slice(0, 4) + ' ' + ifc.includes('Höjdkälla'));
  if (!(await page.evaluate(() => window.__calls.some(c => c[0] === 'tcUpload' && /^Aktiviteter /.test(c[1].files[0].name))))) fail('Filen ska laddas upp till Trimble Connect');
  console.log('OK: IFC med en markör per aktivitet (fasta GUID) sparas i TC');
  // 5) Koppla till Gantt: coupleObjects per aktivitet med modellens id och markörens GUID.
  await page.evaluate(() => { window.__calls = []; askOpener = async (type, extra) => { window.__calls.push([type, extra]); if (type === 'ifcModelsList') return { models: [{ id: 'MODEL9', name: apFileName() }] }; return { n: 1 }; }; });
  await page.evaluate(() => apCouple()); await page.waitForTimeout(400);
  await page.waitForTimeout(800);
  const cp = await page.evaluate(() => window.__calls.filter(c => c[0] === 'coupleObjects').map(c => [c[1].itemId, c[1].objs[0].modelId, c[1].objs[0].objectId]));
  if (cp.length !== 2 || cp.some(c => c[1] !== 'MODEL9') || !cp.some(c => c[0] === 'x' && c[2] === g1[0]) || !cp.some(c => c[0] === 'y' && c[2] === g1[2])) fail('Varje aktivitet ska kopplas till sin markör: ' + JSON.stringify(cp));
  console.log('OK: aktiviteterna kopplas till IFC-markörerna i TC-modellen', JSON.stringify(cp));
  { const h = await page.evaluate(() => objRowsHtml(objListFamilies(), {})), rows = (h.match(/obj-item-row[^>]*>/g) || []).length, dels = (h.match(/class="oi-del"/g) || []).length;
    if (dels !== 2 || rows < 3) fail('Placerade prickar ska ha 🗑 (men inte modellens): ' + dels + '/' + rows);
    const key = await page.evaluate(() => apFam(items.find(i => i.id === 'y'))); await page.evaluate(k => objRemoveDots(k), key); await page.waitForTimeout(500);
    const gone = await page.evaluate(() => !positions.some(p => p.id === 'y') && positions.some(p => p.id === 'x') && positions.some(p => p.id === 'a') && items.some(i => i.id === 'y'));
    if (!gone) fail('🗑 ska ta bort pricken (positionen) men låta aktiviteten vara kvar');
    if (JSON.parse(store.get(`projects/${PID}/plan_item_positions.json`)).some(r => r.id === 'y')) fail('Borttagningen ska sparas i projektet');
    console.log('OK: 🗑 tar bort en placerad prick från kartan (aktiviteten finns kvar)'); }
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close(); console.log('OK test_lagesplan_actplace');
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
