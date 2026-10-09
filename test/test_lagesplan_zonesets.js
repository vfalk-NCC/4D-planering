// Zonlager WBS / WBS - Prefab (Victor 2026-10-07): ett extra lager med zoner och samma funktioner.
// De vanliga zonerna sparas som förut (zones) och påverkas aldrig av prefab-lagret (zones_prefab);
// Excel-zonexporten läser bara de vanliga.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8989;
// Attrapp av pdf.js: plan A ritar en blå ruta, plan B en röd ruta på samma ställe (140–160).
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: ({ data }) => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const kind = new Uint8Array(data)[0];
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      const [x, y] = v.convertToViewportPoint(kind === 2 ? 140 : 280, kind === 2 ? 160 : 320), w = (kind === 2 ? 20 : 40) * v.transform[0];
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height);
      c.fillStyle = kind === 2 ? '#ff0000' : '#0000ff'; c.fillRect(x, y, w, w);
      return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page); // appens egna dialogrutor
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  let answer = ''; const dlgs = []; page.on('dialog', d => { dlgs.push(d.message()); d.type() === 'prompt' ? d.accept(answer) : d.accept(); });
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  // Lagringen: status_plans.json i minnet.
  const store = new Map(); let n = 0;
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    if (req.method() === 'PUT') { const b = JSON.parse(req.postData() || '{}'); const sha = 's' + (++n); store.set(f, { content: Buffer.from(b.content, 'base64').toString('utf8'), sha }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) }); }
    r.fulfill({ status: 404, body: '{}' });
  });
  const saved = () => JSON.parse([...store.entries()].find(([k]) => k.endsWith('status_plans.json'))[1].content)[0];
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  const sq = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
  await page.evaluate(async ({ a, b }) => {
    const O = [6512300, 150100];
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[O[0], O[1], 0], [O[0] + 100, O[1], 0]], pdf: [[0, 0], [1000, 0]] }, level: { z0: 10, z1: 14 },
      zones: [{ id: 'z1', code: '7411', name: 'SEKTIONSFICKOR', parent: '741 Sektionsfickor', polys: a, rule: { field: 'auto' } }], wbs: { '741 SEKTIONSFICKOR': { style: { fill: 'custom', fillColor: '#ff0000' } } } }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    await ghWriteJSON(token, dataPath('status_plans.json'), () => JSON.parse(JSON.stringify(plans)), 'test');
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
  }, { a: sq(100, 100, 200, 200), b: sq(300, 100, 400, 200) });
  let st = await page.evaluate(() => ({ set: zoneSetOf(plan), n: plan.zones.length, seg: document.getElementById('zoneSetSeg').innerText }));
  if (st.set !== 'main' || st.n !== 1 || !/WBS 1/.test(st.seg)) fail('Start i WBS: ' + JSON.stringify(st));
  // Byt till WBS - Prefab: tomt lager, rita en zon med överzon, spara.
  await page.evaluate(() => document.querySelector('#zoneSetSeg [data-zset="prefab"]').click()); await page.waitForTimeout(200);
  st = await page.evaluate(() => ({ set: zoneSetOf(plan), n: plan.zones.length, wbs: plan.wbs || null }));
  if (st.set !== 'prefab' || st.n !== 0 || st.wbs) fail('Prefab-lagret ska vara tomt: ' + JSON.stringify(st));
  await page.evaluate(async b => {
    zoneSnapshot('Ny zon');
    plan.zones.push({ id: 'p1', code: 'P1', name: 'Prefab väggar', parent: 'Prefab etapp 1', polys: b, rule: { field: 'auto' } });
    renderZones(); await savePlan();
  }, sq(300, 100, 400, 200));
  let s = saved();
  if (s.zones.length !== 1 || s.zones[0].id !== 'z1' || !s.wbs || s.wbs['741 SEKTIONSFICKOR'].style.fillColor !== '#ff0000') fail('De vanliga zonerna ska sparas orörda: ' + JSON.stringify(s.zones));
  if (!s.zones_prefab || s.zones_prefab.length !== 1 || s.zones_prefab[0].id !== 'p1' || Object.keys(s).some(k => k.startsWith('_'))) fail('Prefab-zonerna sparas i zones_prefab: ' + JSON.stringify(Object.keys(s)));
  if (!/WBS - Prefab 1/.test(await page.innerText('#zoneSetSeg'))) fail('Växeln visar antalet');
  // Excel-zonexporten: bara de vanliga zonerna, även när prefab-lagret är valt.
  const ex = await page.evaluate(() => zoneExportData().zones.map(z => z.code));
  if (JSON.stringify(ex) !== '["7411"]') fail('Zonexporten ska bara ha de vanliga zonerna: ' + JSON.stringify(ex));
  // Exportfilerna märks med lagret.
  const names = await page.evaluate(async () => { const out = []; downloadBlob = (bl, nm) => out.push(nm); $('cadExportToTc').checked = false; await exportZonesDxf(); await exportZonesIfc(); return out; });
  if (names.length !== 3 || !names.every(x => /^Zon(er|volymer) WBS - Prefab Plan 1 /.test(x))) fail('Filnamnen: ' + JSON.stringify(names));
  // Ångra i fel lager gör ingenting med det andra lagret.
  await page.evaluate(() => document.querySelector('#zoneSetSeg [data-zset="main"]').click()); await page.waitForTimeout(200);
  await page.evaluate(() => zoneUndo());
  st = await page.evaluate(() => ({ n: plan.zones.length, id: plan.zones[0] && plan.zones[0].id, pre: (plan.zones_prefab || []).length }));
  if (st.n !== 1 || st.id !== 'z1' || st.pre !== 1) fail('Ångra från prefab-lagret ska inte röra WBS: ' + JSON.stringify(st));
  // Tillbaka i prefab: ångra tar bort zonen där.
  await page.evaluate(() => document.querySelector('#zoneSetSeg [data-zset="prefab"]').click()); await page.waitForTimeout(200);
  await page.evaluate(async () => { zoneUndo(); await savePlan(); });
  s = saved();
  if (s.zones.length !== 1 || (s.zones_prefab || []).length) fail('Ångra i prefab: ' + JSON.stringify([s.zones.length, s.zones_prefab]));
  // Samma lager när planen öppnas igen.
  await page.evaluate(async () => { plan.zones.push({ id: 'p2', code: 'P2', name: 'Pelare', polys: [[[300, 100], [400, 100], [400, 200]]] }); await savePlan(); plans = [JSON.parse(JSON.stringify(plans[0]))]; await openPlan('A'); });
  st = await page.evaluate(() => ({ set: zoneSetOf(plan), ids: plan.zones.map(z => z.id), main: zonesMainOf(plan).map(z => z.id) }));
  if (st.set !== 'prefab' || JSON.stringify(st.ids) !== '["p2"]' || JSON.stringify(st.main) !== '["z1"]') fail('Öppnas i samma lager: ' + JSON.stringify(st));
  console.log('OK: zonlagren WBS och WBS - Prefab – egna zoner och överzoner, de vanliga sparas orörda, Excel-exporten bara vanliga, filnamn, ångra per lager, samma lager vid öppning');

  // Raderingsskydd (Victor 2026-10-07): på från början, Delete-tangenten och 🗑 gör ingenting.
  await page.evaluate(() => document.querySelector('#zoneSetSeg [data-zset="main"]').click()); await page.waitForTimeout(150);
  const del = async viaKey => page.evaluate(async k => { selectZone('z1'); await deleteSelectedZone(!k); return { n: plan.zones.length, st: $('saveStatus').textContent, btn: $('btnZoneGuard').textContent }; }, viaKey);
  let d = await del(true);
  if (d.n !== 1 || !/skyddade mot radering/.test(d.st) || !/Raderingsskydd på/.test(d.btn)) fail('Skyddet ska stoppa Delete: ' + JSON.stringify(d));
  d = await del(false);
  if (d.n !== 1) fail('Skyddet ska stoppa 🗑');
  if (await page.evaluate(async () => { await deleteWbs('741 SEKTIONSFICKOR'); return plan.zones[0].parent; }) !== '741 Sektionsfickor') fail('Skyddet ska stoppa ta bort överzon');
  // Av: måste ändå skriva RADERA.
  await page.evaluate(() => $('btnZoneGuard').click());
  if (!/Raderingsskydd av/.test(await page.textContent('#btnZoneGuard'))) fail('Knappen stänger av skyddet');
  answer = 'ja'; d = await del(true);
  if (d.n !== 1) fail('Fel bekräftelse ska inte ta bort');
  answer = 'radera'; d = await del(true);
  if (d.n !== 0) fail('RADERA ska ta bort zonen');
  await page.evaluate(() => zoneUndo());
  if (await page.evaluate(() => plan.zones.length) !== 1) fail('Ctrl+Z tar tillbaka zonen');
  // Byter man lager (eller plan) är skyddet på igen.
  await page.evaluate(() => { document.querySelector('#zoneSetSeg [data-zset="prefab"]').click(); document.querySelector('#zoneSetSeg [data-zset="main"]').click(); });
  if (!/Raderingsskydd på/.test(await page.textContent('#btnZoneGuard'))) fail('Skyddet ska slås på igen vid lagerbyte');
  // Släckta zoner syns som en rad med Tänd alla.
  await page.evaluate(() => setZoneHidden(['z1'], true)); await page.waitForTimeout(100);
  const hi = await page.evaluate(() => ({ t: $('zoneHiddenInfo').textContent, h: $('zoneHiddenInfo').classList.contains('hidden') }));
  if (hi.h || !/1 av 1 zoner är släckta/.test(hi.t)) fail('Släckta zoner ska visas: ' + JSON.stringify(hi));
  await page.evaluate(() => $('zoneHiddenInfo').querySelector('button').click());
  if (await page.evaluate(() => !!(plan.zones[0].style && plan.zones[0].style.hidden)) || !(await page.evaluate(() => $('zoneHiddenInfo').classList.contains('hidden')))) fail('Tänd alla');
  // En plan med zoner tas bara bort med planens namn.
  answer = 'fel'; await page.evaluate(() => $('btnDeletePlan').click()); await page.waitForTimeout(400);
  if (await page.evaluate(() => plans.length) !== 1 || !dlgs.some(m => /Skriv planens namn/.test(m))) fail('Planen ska inte tas bort utan namnet');
  console.log('OK: raderingsskydd – på från början (Delete, 🗑, överzon), RADERA krävs, Ctrl+Z, på igen vid lagerbyte, släckta zoner med Tänd alla, planen kräver namnet');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('ALLA TESTER OK');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
