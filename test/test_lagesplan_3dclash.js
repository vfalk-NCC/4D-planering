// 3D-editorn: kollisionskontroll – etablering mot etablering och mot byggnadens objekt, staplat räknas
// inte, kranens räckvidd räknas inte, tid (4D), minsta avstånd, bara markerade, körs om vid ändring.
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
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  // GitHub: bara etableringens filer finns.
  const store = new Map(); let n = 0;
  const C = (id, x, y, name) => ({ id, type: 'container', name, x, y, z: 0, L: 6, B: 2, H: 2, rot: 0, dz: 0, color: '#2563eb' });
  const B = (id, type, x, y, z, L, B, H, extra = {}) => ({ id, type, name: id.toUpperCase(), x, y, z, L, B, H, rot: 0, dz: 0, color: '#2563eb', ...extra });
  store.set('projects/p1/plan_placements.json', { content: JSON.stringify([
    B('a', 'container', 6512320, 150110, 0, 6, 2, 2), B('c', 'container', 6512324, 150110, 0, 6, 2, 2),
    B('u', 'upplag', 6512360, 150100, 0, 10, 5, 0.3), B('d', 'container', 6512360, 150100, 0.3, 6, 2, 2),
    B('b', 'bod', 6512348, 150122, 0, 8.4, 3, 2.7, { end: '2019-12-01' }),
    B('e', 'container', 6512320, 150130, 0, 6, 2, 2), B('f', 'container', 6512320, 150132.5, 0, 6, 2, 2),
    { id: 'k', type: 'tornkran', name: 'K', x: 6512300, y: 150140, z: 0, L: 1.6, B: 1.6, H: 40, R: 50, rot: 0, dz: 0, color: '#facc15' }]), sha: 's0' });
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
      { id: 'i2', object_name: 'M30', activity: 'Gjutning', start_date: '2020-01-01', end_date: '2020-02-01', status: 'klar', progress: 100, actual_end_date: '2020-02-01', temporary: true },
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
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.placeMeshes.size === 8, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  // --- Temporärt byggnadsobjekt (M30, slut 2020-02-01): syns inte i dag, men 2020-01-15.
  const objIds = () => page.evaluate(() => [...new Set((l3.objMesh && l3.objMesh.userData.ids) || [])].sort().join(','));
  if (await objIds() !== 'i1') fail('Temporärt objekt efter sitt slut ska inte synas i 3D: ' + await objIds());
  if (await page.evaluate(() => visibleItems().some(r => r.id === 'i2'))) fail('Temporärt objekt efter sitt slut ska inte färga zoner/objekt i planen');
  await page.evaluate(() => { $('dateInput').value = '2020-01-15'; }); await page.waitForTimeout(900);
  if (await objIds() !== 'i1,i2' || !(await page.evaluate(() => visibleItems().some(r => r.id === 'i2')))) fail('Under sin tid ska det temporära objektet synas: ' + await objIds());
  await page.evaluate(() => { $('dateInput').value = todayIso(); }); await page.waitForTimeout(900);

  // --- 4D för etableringen: boden (slut 2019-12-01) är tonad på dagens datum, syns i förklaringen.
  let e4 = await page.evaluate(() => { const g = l3.placeMeshes.get('b'); let o = 1; g.traverse(m => { if (m.isMesh) o = Math.min(o, m.material.opacity); }); return { off: g.userData.off4d, o, a: l3.placeMeshes.get('a').userData.off4d }; });
  if (!e4.off || e4.o > 0.3 || e4.a) fail('Boden ska vara tonad (inte på plats), a inte: ' + JSON.stringify(e4));
  if (!(await page.textContent('#v3Legend')).includes('Etablering ej på plats')) fail('Förklaringen ska visa etablering som inte är på plats');
  if (!(await page.locator('.v3-label.off', { hasText: 'B' }).count())) fail('Bodens etikett ska vara tonad');
  await page.click('#v3ShowBtn'); await page.click('[data-v3e4d="all"]');
  e4 = await page.evaluate(() => { const g = l3.placeMeshes.get('b'); let o = 0; g.traverse(m => { if (m.isMesh) o = Math.max(o, m.material.opacity); }); return { off: g.userData.off4d, o }; });
  if (e4.off || e4.o < 0.99) fail('Visa allt: boden ska vara normal: ' + JSON.stringify(e4));
  // Datum före bodens slut -> på plats även med tonning.
  await page.click('[data-v3e4d="ghost"]'); await page.keyboard.press('Escape');
  await page.evaluate(() => { $('dateInput').value = '2019-06-01'; }); await page.waitForTimeout(900);
  if (await page.evaluate(() => l3.placeMeshes.get('b').userData.off4d)) fail('2019-06-01: boden ska vara på plats');
  await page.evaluate(() => { $('dateInput').value = todayIso(); }); await page.waitForTimeout(900);
  // Dolda objekt har ingen etikett.
  await page.evaluate(() => { l3SelectIds(['a']); l3HideSel(); }); await page.waitForTimeout(100);
  if (await page.locator('.v3-label', { hasText: /^A$/ }).count()) fail('Dolt objekt ska inte ha etikett');
  await page.evaluate(() => l3ShowAll());

  // --- Lista till Excel (CSV): semikolon, decimalkomma, BOM, formler neutraliseras.
  await page.evaluate(() => { placements.find(p => p.id === 'e').name = '=SUMMA(A1)'; });
  await page.evaluate(() => l3PalTab('list'));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#v3ObjCsv')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  if (!dl.suggestedFilename().endsWith('.csv') || csv.charCodeAt(0) !== 0xfeff) fail('CSV med BOM: ' + dl.suggestedFilename());
  const lines = csv.slice(1).trim().split('\r\n');
  if (lines.length !== 9 || !lines[0].startsWith('Namn;Typ;Längd (m)')) fail('CSV-rader: ' + lines.length + ' ' + lines[0]);
  const la = lines.find(l => l.startsWith('A;'));
  if (!la || !la.includes(';6;2;2;') || !la.includes('6512320;150110')) fail('Rad A: ' + la);
  if (!lines.some(l => l.startsWith("'=SUMMA(A1);"))) fail('Formel ska neutraliseras');
  if (!lines.find(l => l.startsWith('B;')).includes('2019-12-01') || !lines.find(l => l.startsWith('B;')).endsWith('Ej på plats')) fail('Rad B: 4D');
  await page.evaluate(() => { placements.find(p => p.id === 'e').name = 'E'; });

  const pairs = () => page.evaluate(() => l3ClashRes.map(c => [c.a, c.b].sort().join('-')).sort());
  await page.click('#v3EditBtn'); await page.click('[data-v3cmd="clash"]');
  await page.click('#v3ClashGo'); await page.waitForTimeout(100);
  let r = await pairs();
  if (JSON.stringify(r) !== '["a-c"]') fail('Standard: bara a–c ska krocka (staplad container, kranens räckvidd och boden som är borta räknas inte): ' + r);
  if (!(await page.textContent('.v3-clash-sum')).includes('1 krock')) fail('Summeringen');
  if (await page.evaluate(() => l3.groups.clash.children.length) !== 1) fail('En röd markering');
  const g = await page.evaluate(() => l3ClashRes[0].g);
  if (Math.abs(g + 2) > 1e-6) fail('Överlappet ska vara 2 m: ' + g);
  // Utan tid: boden krockar med byggnadens objekt K10.
  await page.click('[data-co="time"]'); await page.click('#v3ClashGo'); await page.waitForTimeout(100);
  r = await pairs();
  if (JSON.stringify(r) !== '["a-c","b-i1"]') fail('Utan tid: ' + r);
  // Minsta avstånd 1 m: e–f (0,5 m isär) räknas.
  await page.fill('#v3ClashGap', '1'); await page.click('#v3ClashGo'); await page.waitForTimeout(100);
  r = await pairs();
  if (!r.includes('e-f') || r.includes('d-u')) fail('Minsta avstånd 1 m: ' + r);
  // Tryck på en krock -> båda markeras.
  const ia = await page.evaluate(() => l3ClashRes.findIndex(c => [c.a, c.b].sort().join('-') === 'a-c'));
  await page.click(`[data-clash="${ia}"]`); await page.waitForTimeout(100);
  if (JSON.stringify(await page.evaluate(() => [...l3.sel].sort())) !== '["a","c"]') fail('Krocken ska markera båda');
  // Flytta c bort -> kontrollen körs om och krocken försvinner.
  await page.evaluate(() => { placeSnapshot(); const p = placements.find(x => x.id === 'c'); placeShift(p, 10, 0, 0); placeTouch(p); l3RebuildOne(p); l3Changed(); });
  await page.waitForTimeout(100);
  r = await pairs();
  if (r.includes('a-c')) fail('Löst krock ska försvinna direkt: ' + r);
  // Bara markerade.
  await page.fill('#v3ClashGap', '0');
  await page.evaluate(() => { l3DlgClose('v3Clash'); l3SelectIds(['b']); l3OpenClash(); });
  if (!(await page.isChecked('[data-co="onlySel"]'))) fail('Med markering ska Bara markerade vara ikryssad');
  await page.click('#v3ClashGo'); await page.waitForTimeout(100);
  r = await pairs();
  if (JSON.stringify(r) !== '["b-i1"]') fail('Bara markerade (b, utan tid): ' + r);
  // Esc stänger och tar bort markeringarna.
  await page.mouse.move(5, 300); await page.keyboard.press('Escape'); await page.waitForTimeout(80);
  if (await page.evaluate(() => l3.groups.clash.children.length) || await page.locator('#v3Clash').isVisible()) fail('Esc ska stänga kontrollen');
  if (process.env.SHOT) { await page.evaluate(() => { l3SelectIds([]); l3OpenClash(); document.querySelector('#v3ClashGo').click(); l3Frame(false); }); await page.waitForTimeout(400); await page.screenshot({ path: process.env.SHOT }); }
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3dclash');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
