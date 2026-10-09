// Leveranser och upplag: leveransplanen (plan_deliveries) kopplas till upplag i planen och i 3D,
// beläggning per dag, varningar (fullt / saknar upplag), koppla och ändra i upplagets ruta.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8986;
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
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  page.on('dialog', d => d.type() === 'prompt' ? d.accept('5') : d.accept());
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  // GitHub: bara etableringens filer finns.
  const store = new Map(); let n = 0;
  const C = (id, x, y, name) => ({ id, type: 'container', name, x, y, z: 0, L: 6, B: 2, H: 2, rot: 0, dz: 0, color: '#2563eb' });
  store.set('projects/p1/plan_placements.json', { content: JSON.stringify([C('a', 6512320, 150110, 'Container 1'), C('b', 6512320, 150120, 'Container 2'), C('c', 6512335, 150110, 'Container 3'), { id: 'u', type: 'upplag', name: 'Upplag 1', x: 6512360, y: 150100, z: 0, L: 10, B: 5, H: 0.3, rot: 0, dz: 0, color: '#a16207' }]), sha: 's0' });
  const day = k => { const d = new Date(); d.setDate(d.getDate() + k); return d.toISOString().slice(0, 10); };
  store.set('projects/p1/site_layers.json', { content: JSON.stringify([{ id: 's1', type: 'storage', name: 'Upplag Norr', cx: 6512330, cy: 150130, w: 5, h: 4, rot: 0 }]), sha: 'x0' });
  store.set('projects/p1/plan_deliveries.json', { content: JSON.stringify([
    { id: 'd1', project_id: 'p1', description: 'Armering', planned_date: day(0), until_date: day(3), storage_id: 's1', space_m2: 12, status: 'planerad' },
    { id: 'd2', project_id: 'p1', description: 'Formvirke', planned_date: day(1), storage_id: 's1', space_m2: 10, status: 'planerad' },
    { id: 'd3', project_id: 'p1', description: 'Prefabtrappor', supplier: 'Abetong', planned_date: day(0), status: 'på väg' },
    { id: 'd4', project_id: 'p1', description: 'Rör', planned_date: day(0), storage_id: 'place:u', space_m2: 15, status: 'planerad' },
  ]), sha: 'x1' });
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    const body = JSON.parse(req.postData()); if (e && body.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' });
    const sha = 's' + (++n); store.set(f, { content: Buffer.from(body.content, 'base64').toString(), sha });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) });
  });
  const getStore = f => { const e = store.get(`projects/p1/${f}`); return e ? JSON.parse(e.content) : null; };
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = [
      { id: 'i1', object_name: 'K10', activity: 'Pelare', start_date: '2020-01-01', end_date: '2030-12-01', status: 'pagaende', progress: 40 },
      { id: 'i2', object_name: 'M30', activity: 'Gjutning', start_date: '2020-01-01', end_date: '2020-02-01', status: 'klar', progress: 100, actual_end_date: '2020-02-01' },
    ];
    positions = [
      { id: 'i1', x: 6512350, y: 150125, z0: 0, z1: 14, x0: 6512345, x1: 6512355, y0: 150120, y1: 150130 },
      { id: 'i2', x: 6512380, y: 150125, z0: 0, z1: 3, x0: 6512378, x1: 6512382, y0: 150123, y1: 150127 },
    ];
    renderPlanSelect(); await openPlan('A');
    window.__calls = [];
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    askOpener = async (type, extra) => { window.__calls.push(type); return type === 'placeSaveIfc' ? { n: 2, files: ['Etablering x.ifc'] } : {}; };

  });
  await page.waitForFunction(() => typeof deliveriesLoaded !== 'undefined' && deliveriesLoaded, null, { timeout: 10000 });
  await page.evaluate(() => { $('dateInput').value = todayIso(); onDateChanged(); });
  // --- Varningar i dag: Prefabtrappor saknar upplag; Upplag Norr 12 av 20 m².
  let w = await page.textContent('#storWarn');
  if (!w.includes('Prefabtrappor saknar upplag') || w.includes('fullt')) fail('Varning i dag: ' + w);
  let o = await page.evaluate(() => { const o = storageOcc('s1'); return [o.used, o.cap, o.n, o.over]; });
  if (JSON.stringify(o) !== '[12,20,1,false]') fail('Beläggning i dag: ' + JSON.stringify(o));
  if (await page.evaluate(() => storageOcc('place:u').cap) !== 50) fail('Etableringens upplag: 10 × 5 = 50 m²');
  // --- I morgon: 12 + 10 = 22 > 20 -> fullt.
  await page.evaluate(d => { $('dateInput').value = d; onDateChanged(); }, day(1));
  w = await page.textContent('#storWarn');
  if (!w.includes('Upplag Norr är fullt') || !(await page.getAttribute('#storWarn', 'class')).includes('bad')) fail('Fullt i morgon: ' + w);
  if (w.includes('Prefabtrappor')) fail('Trapporna levereras bara i dag');
  // --- Upplagets ruta: minska armeringen till 8 m² -> 18 av 20.
  await page.evaluate(() => openSitePop(siteItems.find(x => x.id === 's1')));
  if (await page.locator('#sitePop .stor-r').count() !== 2) fail('Två leveranser kopplade till upplaget');
  await page.fill('#sitePop [data-stm2="d1"]', '8'); await page.press('#sitePop [data-stm2="d1"]', 'Tab'); await page.waitForTimeout(600);
  if (getStore('plan_deliveries.json').find(d => d.id === 'd1').space_m2 !== 8) fail('Ytan ska sparas i leveransplanen');
  if ((await page.textContent('#storWarn').catch(() => '')).includes('fullt')) fail('18 av 20 m² är inte fullt');
  // --- Koppla trapporna hit (i dag), 5 m² via frågan.
  await page.evaluate(() => { $('dateInput').value = todayIso(); onDateChanged(); closeSitePop(); openSitePop(siteItems.find(x => x.id === 's1')); });
  await page.selectOption('#sitePop .stor-add', 'd3'); await page.waitForTimeout(700);
  let d3 = getStore('plan_deliveries.json').find(d => d.id === 'd3');
  if (d3.storage_id !== 's1' || d3.space_m2 !== 5 || d3.supplier !== 'Abetong') fail('Koppla leveransen: ' + JSON.stringify(d3));
  if (!(await page.isHidden('#storWarn'))) fail('Inga varningar kvar i dag: ' + await page.textContent('#storWarn'));
  if (await page.locator('#sitePop .stor-r').count() !== 3) fail('Rutan ska visa tre leveranser');
  // Ta bort från upplaget.
  await page.click('#sitePop [data-stoff="d3"]'); await page.waitForTimeout(700);
  d3 = getStore('plan_deliveries.json').find(d => d.id === 'd3');
  if ('storage_id' in d3 || d3.space_m2 !== 5) fail('✕ tar bort kopplingen men behåller ytan: ' + JSON.stringify(d3));
  await page.evaluate(() => closeSitePop());
  if (process.env.SHOT) {
    await page.evaluate(d => { $('dateInput').value = d; onDateChanged(); const s = siteItems.find(x => x.id === 's1'); openSitePop(s); }, day(1));
    await page.waitForTimeout(400); await page.screenshot({ path: process.env.SHOT });
    await page.evaluate(() => { closeSitePop(); $('dateInput').value = todayIso(); onDateChanged(); });
  }
  // --- 3D: rören som ett block på etableringens upplag.
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.placeMeshes.size === 4, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  let st = await page.evaluate(() => l3.groups.stor ? l3.groups.stor.children.map(m => m.userData.delivery) : null);
  if (JSON.stringify(st) !== '["d4"]') fail('3D: rören på upplaget: ' + JSON.stringify(st));
  // 60 m² på ett 50 m²-upplag: det som inte ryms blir rött.
  await page.evaluate(() => { planDeliveries.find(d => d.id === 'd4').space_m2 = 60; l3StorageBuild(); });
  const red = await page.evaluate(() => l3.groups.stor.children[0].material.color.getHex() === 0xdc2626);
  if (!red) fail('Över upplagets yta ska vara rött');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_storage');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
