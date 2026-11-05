// Veckobilder (Victor 2026-11-05): spara planens status per vecka, lista, jämför, visa skrivskyddat, kurva/CSV och ta bort.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9034;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ scale: s, width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  const gh = new Map();
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (req.method() === 'DELETE') { gh.delete(f); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); }
    if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
    const body = JSON.parse(req.postData()); gh.set(f, Buffer.from(body.content, 'base64').toString());
    if (/ifc_groups\.json$/.test(f)) page.evaluate(t => { window.__gsaved = JSON.parse(t); }, gh.get(f)).catch(() => {});
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  const base = { project_id: 'p1', area: 'Hus A', contractor: 'NCC', start_date: '2026-10-01', end_date: '2026-12-01', depends_on: [] };
  await page.evaluate(rows => { items = rows; plans = []; window.confirm = () => true; wk.loaded = false; }, [
    { ...base, id: 'a', object_name: 'Pelare A1', status: 'pagaende', progress: 40 },
    { ...base, id: 'b', object_name: 'Pelare A2', status: 'planerad', progress: 0 },
    { ...base, id: 'c', object_name: 'Platta B', status: 'klar', progress: 100, actual_start_date: '2026-10-05', actual_end_date: '2026-10-20' },
    { ...base, id: 'd', object_name: 'Vägg C', status: 'planerad', progress: 0 }]);
  await page.evaluate(() => { $('dateInput').value = '2026-11-02'; $('dateInput').dispatchEvent(new Event('change')); });
  await page.evaluate(() => wkLoad(true)); await page.waitForSelector('#wkSave');
  const t1 = await page.innerText('#wkSave'); if (!/v\. 45/.test(t1)) fail('Knappen ska nämna veckan (v. 45): ' + t1);
  // 1) Spara vecka 45
  await page.fill('#wkNote', 'Start platta'); await page.click('#wkSave'); await page.waitForTimeout(500);
  const f1 = (JSON.parse(gh.get('projects/p1/weekly/2026-W45.json') || '[]'))[0], idx1 = JSON.parse(gh.get('projects/p1/weekly/index.json') || '[]');
  if (!f1 || f1.rows.length !== 4 || f1.rows[0][0] !== 'a' || f1.rows[0][1] !== 'p' || f1.rows[0][2] !== 40 || f1.rows[2][1] !== 'k' || f1.rows[2][4] !== '2026-10-20') fail('Veckobilden ska innehålla alla rader: ' + JSON.stringify(f1));
  if (idx1.length !== 1 || idx1[0].key !== '2026-W45' || idx1[0].klar !== 1 || idx1[0].pagar !== 1 || idx1[0].planerad !== 2 || idx1[0].avg !== 35 || idx1[0].note !== 'Start platta') fail('Förteckningen: ' + JSON.stringify(idx1));
  // 2) Planen ändras, vecka 46 sparas
  await page.evaluate(() => { items.find(x => x.id === 'a').progress = 80; items.find(x => x.id === 'b').status = 'pagaende'; items.find(x => x.id === 'b').progress = 20; items.find(x => x.id === 'd').status = 'klar'; items.find(x => x.id === 'd').progress = 100; $('dateInput').value = '2026-11-09'; $('dateInput').dispatchEvent(new Event('change')); });
  await page.waitForTimeout(100); const t2 = await page.innerText('#wkSave'); if (!/v\. 46/.test(t2)) fail('Knappen ska nu nämna v. 46: ' + t2);
  await page.click('#wkSave'); await page.waitForTimeout(500);
  const rows = await page.evaluate(() => [...document.querySelectorAll('#wkList .wk-r')].map(e => e.dataset.wk));
  if (rows.join() !== '2026-W46,2026-W45') fail('Listan ska visa nyaste först: ' + rows.join());
  console.log('OK: veckobilder sparas (fil per vecka + förteckning med nyckeltal) och listas', JSON.stringify(rows));
  // 3) Jämför v.45 → v.46 och v.45 → nu
  await page.click('[data-wk-prev]'); await page.waitForSelector('#wkCmp');
  const cmp = await page.evaluate(() => ({ txt: document.getElementById('wkCmp').innerText, rows: document.querySelectorAll('#wkCmp tbody tr').length }));
  if (cmp.rows !== 3 || !/Pelare A1/.test(cmp.txt) || !/Vägg C/.test(cmp.txt) || !/Pelare A2/.test(cmp.txt) || !/Klara\s*1 → 2/.test(cmp.txt)) fail('Jämförelsen: ' + JSON.stringify(cmp));
  await page.click('#wkCmpX');
  console.log('OK: jämförelse mellan veckor visar ändrade objekt och nyckeltal');
  // 4) Visa v.45: statusen ersätts, skrivningar spärras, Avsluta återställer allt
  await page.click('[data-wk-view="2026-W45"]'); await page.waitForSelector('#wkBanner');
  const v = await page.evaluate(async () => { const o = { a: items.find(x => x.id === 'a').progress, d: items.find(x => x.id === 'd').status, date: $('dateInput').value }; try { await ghWriteJSON(token, 'projects/p1/x.json', x => x, 'test'); o.blocked = false; } catch (e) { o.blocked = /skrivskyddad/.test(e.message); } return o; });
  if (v.a !== 40 || v.d !== 'planerad' || v.date !== '2026-11-02' || !v.blocked) fail('Visa ska ersätta status, flytta datumet och spärra skrivning: ' + JSON.stringify(v));
  await page.click('#wkBanner button'); await page.waitForTimeout(100);
  const w = await page.evaluate(async () => { const o = { a: items.find(x => x.id === 'a').progress, d: items.find(x => x.id === 'd').status, date: $('dateInput').value, banner: !!document.getElementById('wkBanner'), view: wk.view }; try { await ghWriteJSON(token, 'projects/p1/x.json', () => [], 'test'); o.writable = true; } catch (e) { o.writable = false; } return o; });
  if (w.a !== 80 || w.d !== 'klar' || w.date !== '2026-11-09' || w.banner || w.view || !w.writable) fail('Avsluta ska återställa planen och skrivningar: ' + JSON.stringify(w));
  console.log('OK: Visa är skrivskyddat och Avsluta återställer status, datum och skrivningar');
  // 4b) IFC: prickar i veckans färg med egenskaper och kommentarer (de som fanns när veckobilden sparades)
  gh.set('projects/p1/plan_item_comments.json', JSON.stringify([
    { id: 'k1', plan_item_id: 'a', author: 'Anna', body: 'Armering klar, väntar på gjutning', created_at: '2026-11-02T08:00:00Z' },
    { id: 'k2', plan_item_id: 'a', author: 'Bo', body: 'Sen kommentar efter veckobilden', created_at: '2099-01-01T08:00:00Z' }]));
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    positions = [{ id: 'a', x: 6512345, y: 150123, z0: 0, z1: 3 }, { id: 'b', x: 6512350, y: 150130, z0: 0, z1: 2 }, { id: 'c', x: 6512355, y: 150125, z0: 0, z1: 4 }, { id: 'd', x: 6512360, y: 150128, z0: 0, z1: 2 }];
    renderPlanSelect(); await openPlan('A'); $('showObjects').checked = true; invalidateVisible(); invalidatePositions(); renderZones();
    window.__dl = []; downloadBlob = (blob, name) => { window.__dl.push({ blob, name }); };
  });
  await page.click('[data-wk-ifc="2026-W45"]'); await page.waitForTimeout(800);
  const ifc = await page.evaluate(async () => { const d = window.__dl[0]; return d ? { name: d.name, text: await d.blob.text(), prog: items.find(x => x.id === 'a').progress, view: !!wk.view } : null; });
  if (!ifc || !/Veckobild/.test(ifc.name) || !/\.ifc$/.test(ifc.name)) fail('IFC-filen ska laddas ned med veckans namn: ' + JSON.stringify(ifc && ifc.name));
  if (!/Armering klar, v/.test(ifc.text) || /Sen kommentar/.test(ifc.text)) fail('Kommentarer från veckan ska med, senare inte');
  if (!/IFCEXTRUDEDAREASOLID/.test(ifc.text) || (ifc.text.match(/4D-markering/g) || []).length < 4) fail('Fyra prickar ska med som objekt');
  if (!/Veckobild/.test(ifc.text) || ifc.prog !== 80 || ifc.view) fail('Exporten ska lämna planen som den var: ' + JSON.stringify({ prog: ifc.prog, view: ifc.view }));
  // veckans status i filen: Pelare A1 var 40 % den veckan (nu 80 %)
  if (!/40/.test(ifc.text.split('Framdrift')[1] || '')) fail('Veckans framdrift (40 %) ska stå i filen');
  console.log('OK: veckobilden exporteras som IFC med prickar, status och kommentarer och lämnar planen orörd', JSON.stringify({ name: ifc.name, kB: Math.round(ifc.text.length / 1000) }));

  // 5) CSV, kurva, ta bort
  const csv = await page.evaluate(() => wkSeriesCsv()); if (!/2026-W45;2026-11-02;4;1;1;0;2;35/.test(csv) || !/2026-W46/.test(csv)) fail('CSV: ' + csv);
  if ((await page.evaluate(() => document.getElementById('wkSpark').style.display)) !== 'block') fail('Kurvan ska visas med två veckor');
  await page.click('[data-wk-del="2026-W45"]'); await page.waitForTimeout(400);
  if (gh.has('projects/p1/weekly/2026-W45.json') || JSON.parse(gh.get('projects/p1/weekly/index.json')).length !== 1) fail('Borttagning ska rensa fil och förteckning');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_weekly');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
