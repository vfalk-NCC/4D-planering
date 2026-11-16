// 3D-vyns flik 4D-planering (Victor 2026-10-12): Powerproject-tidplanen som tavla (lappar per vecka) och staplar
// i en panel nederst, tryck på en lapp markerar i 3D, tryck på en vecka flyttar datumet, kameravyer på datum
// och en inspelad film (videofil) där datumet räknas fram och kameran glider mellan vyerna.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9902;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => { c.fillStyle = '#fff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} }; } };
  } }) }) };`;
const PP = [
  { id: 'p1', group_id: 'G1', object_id: '1hZq3$Bq9Fxu8nZK0bW1aA', object_name: 'K10', activity: 'Gjutning pelare', area: 'Hus A', contractor: 'NCC', start_date: '2026-10-05', end_date: '2026-10-16', progress: 40, baseline_start_date: '2026-10-08', baseline_end_date: '2026-10-19' },
  { id: 'p2', group_id: 'G1', object_id: '2hZq3$Bq9Fxu8nZK0bW1aA', object_name: 'K11', activity: 'Gjutning pelare', area: 'Hus A', contractor: 'NCC', start_date: '2026-10-06', end_date: '2026-10-18', progress: 20 },
  { id: 'p3', object_id: '3hZq3$Bq9Fxu8nZK0bW1aA', object_name: 'Tak', activity: 'Takmontage', area: 'Hus B', contractor: 'Peab', start_date: '2026-11-02', end_date: '2026-11-20', progress: 0 },
  { id: 'p4', object_id: '4hZq3$Bq9Fxu8nZK0bW1aA', object_name: 'Fasad', activity: 'Fasadmontage', area: 'Hus A', contractor: 'NCC', start_date: '2026-10-17', end_date: '2026-10-20', progress: 0, depends_on: ['p1'] },
];
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  try {
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    await require('./_dialogs').bridge(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('lagesplan-3d-prefs', JSON.stringify({ plan: true })); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
    await page.route('https://api.github.com/**', r => {
      const f = decodeURIComponent(new URL(r.request().url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
      if (global.__mockWrite && r.request().method() === 'PUT' && f === 'projects/p1/pp/plan_items.json') { try { const nw = JSON.parse(Buffer.from(JSON.parse(r.request().postData()).content, 'base64').toString()); PP.splice(0, PP.length, ...nw); } catch (e) { /* ignoreras */ } }
      if (r.request().method() !== 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'x' } }) });
      const data = { 'projects/p1/pp/plan_items.json': PP, 'projects/p1/plan_items.json': [{ id: 'x1', object_id: 'X1', object_name: 'Bod', activity: 'Etablering bodar', area: 'Etablering', start_date: '2026-10-10', end_date: '2026-10-15' }], 'projects/p1/plan_milestones.json': [{ id: 'm1', name: 'Stomme klar', target_date: '2026-10-14', done: false }] }[f];
      r.fulfill(data ? { status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(JSON.stringify(data)).toString('base64'), sha: 's' }) } : { status: 404, body: '{}' });
    });
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
    await page.evaluate(async () => {
      plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
      pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = [];
      renderPlanSelect(); await openPlan('A');
      $('dateInput').value = '2026-10-12';
      open3d();
    });
    await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3plRenderTab === 'function', null, { timeout: 15000 });
    await page.evaluate(() => { $('dateInput').value = '2026-10-12'; l3SyncDate(); });   // 3D startar på dagens datum – testet vill ha ett fast datum
    const J = v => JSON.stringify(v), os = require('os'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pts-'));
    // 1) formaten
    const pxy = ['XYZ-COORD-FILE  ,V1.00,2026-10-21,                                        ,', '                                        ,                                 ,'];
    const plint = (id0, x, y, a) => [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]].map(([u, v], i) => { const X = x + u * Math.cos(a) - v * Math.sin(a), Y = y + u * Math.sin(a) + v * Math.cos(a); return `${String(id0 + i).padEnd(14)}${X.toFixed(4).padStart(12)} ${Y.toFixed(4).padStart(11)} ${(427.57 + i * 0.002).toFixed(4).padStart(11)} Grundskr   261020      ,`; });
    const A0 = 7456713.98, B0 = 169040.63; pxy.push(...plint(1, A0, B0, 0), ...plint(5, A0 + 20, B0 - 10, Math.PI / 6), ...plint(9, A0 + 40, B0 - 25, 0)); pxy.push(`13            ${(A0 + 60).toFixed(4)} ${(B0 - 40).toFixed(4)}    427.5700 Enstaka   261020      ,`);
    const P = await page.evaluate(([pxyTxt]) => {
      const a = l3xyzParse(pxyTxt, 'x.pxy'), geo = l3xyzParse('5=P1 4=BULT 37=7456713.1 38=169040.2 39=427.5\n5=P2 37=7456720.5 38=169030.1 39=427.6\n', 'a.geo'), kof = l3xyzParse('05 P7 7456713.1 169040.2 427.5 KOD\n05 P8 7456714.1 169041.2 427.6\n09 junk\n', 'a.kof'), csv = l3xyzParse('Punkt;N;E;H;Kod\nA1;7456713.100;169040.200;427.500;X\nA2;7456714.100;169041.200;427.600;Y', 'a.csv'), sw = l3xyzParse('E1 169040.200 7456713.100 5.0\nE2 169041.200 7456714.100 5.1', 'b.txt');
      return { pxy: [a.pts.length, a.format, a.pts[0].n, a.pts[0].x, a.pts[0].y, a.pts[0].z, a.pts[0].code], geo: [geo.pts.length, geo.format, geo.pts[0].n, geo.pts[0].code, geo.pts[1].z], kof: [kof.pts.length, kof.format, kof.pts[0].code], csv: [csv.pts.length, csv.pts[1].n, csv.pts[1].code, csv.pts[1].x], swap: l3xyzAutoSwap(sw.pts), noswap: l3xyzAutoSwap(a.pts), bad: (() => { try { l3xyzParse('hej\nhopp', 'x.txt'); return false; } catch (e) { return e.message.slice(0, 20); } })() };
    }, [pxy.join('\r\n')]);
    if (P.pxy.slice(0, 3).join() !== '13,pxy,1' || P.pxy[6] !== 'Grundskr 261020' || Math.abs(P.pxy[3] - 7456713.73) > 0.001) fail('PXY: ' + J(P));
    if (P.geo.join() !== '2,geodimeter,P1,BULT,427.6' || P.kof.join() !== '2,kof,KOD' || P.csv.join() !== '2,A2,Y,7456714.1' || !P.swap || P.noswap || !P.bad) fail('Formaten (.geo, .kof, .csv, byte av X/Y, felmeddelande): ' + J(P));
    console.log('OK: filformat – .pxy, .geo (Geodimeter), .kof, .csv/.txt med rubrik, automatiskt byte av norr/öst, tydligt fel för ogiltig fil');

    // 2) panelen: importera, grupper, välj objekt, placera
    const file = path.join(tmp, 'plintar.pxy'); fs.writeFileSync(file, pxy.join('\r\n'));
    await page.click('#v3PtsBtn'); await page.waitForSelector('#v3Pts #ptFile'); await page.setInputFiles('#v3Pts #ptFile', file); await page.waitForSelector('#v3Pts .pt-row', { timeout: 10000 });
    const G = await page.evaluate(() => { const s = l3xyzSet(), g = l3xyzGroups(s); return { rows: document.querySelectorAll('#v3Pts .pt-row').length, n: g.map(x => x.n).join(), rot: g.map(x => x.rot).join(), LB: [g[0].L, g[0].B], pts: l3.groups.pts.children.length, saved: !!(plan.points && plan.points.sets.length === 1) }; });
    if (G.rows !== 4 || G.n !== '4,4,4,1' || !G.saved || G.pts < 3) fail('Fyra grupper (4+4+4+1 punkter) ska visas i listan och i 3D: ' + J(G));
    const rots = G.rot.split(',').map(Number); if (Math.abs(rots[0] - 0) > 1 || Math.abs(rots[1] - 30) > 1 || Math.abs(G.LB[0] - 0.5) > 0.02 || Math.abs(G.LB[1] - 0.4) > 0.02) fail('Gruppens vridning (0°, 30°) och bultbild 0,5×0,4: ' + J(G));
    console.log('OK: punkterna visas – 4 positioner (4+4+4+1), vridning efter bultbilden (' + G.rot + '°), bultbild 0,5×0,4 m, sparat i projektet');
    await page.click('#v3Pts [data-pt="chk"][data-k="g0"]'); await page.click('#v3Pts [data-pt="chk"][data-k="g4"]');
    await page.selectOption('#v3Pts #ptType', 'lada'); await page.fill('#v3Pts #ptL', '0.8'); await page.fill('#v3Pts #ptB', '0.8'); await page.fill('#v3Pts #ptH', '0.6'); await page.fill('#v3Pts #ptName', 'Plint'); await page.dispatchEvent('#v3Pts #ptName', 'change');
    await page.click('#v3Pts [data-pt="assign"]'); await page.waitForSelector('#v3Pts .pt-row em');
    const asg = await page.evaluate(() => ({ n: Object.keys(l3xyzSet().assign).length, chips: document.querySelectorAll('#v3Pts .pt-row em').length }));
    if (asg.n !== 2 || asg.chips !== 2) fail('Två positioner ska ha fått objektet: ' + J(asg));
    await page.click('#v3Pts [data-pt="place"]'); await page.waitForTimeout(400);
    const pl = await page.evaluate(() => { const s = l3xyzSet(), g = l3xyzGroups(s), ps = placements.filter(p => p.ptSet === s.id); return { n: ps.length, names: ps.map(p => p.name).join('|'), at: ps.map(p => [Math.abs(p.x - g[0].x) < 0.001 && Math.abs(p.y - g[0].y) < 0.001, Math.abs(p.x - g[1].x) < 0.001, p.rot, p.L, p.H, p.z]), meshes: ps.every(p => l3.placeMeshes.get(p.id)) }; });
    if (pl.n !== 2 || !pl.meshes || !pl.at[0][0] || !pl.at[1][1] || Math.abs(pl.at[1][2] - 30) > 1 || pl.at[0][3] !== 0.8 || pl.at[0][4] !== 0.6 || !/Plint/.test(pl.names)) fail('Objekten ska ligga på gruppernas mitt, vridna efter bultbilden, med valda mått: ' + J(pl));
    await page.click('#v3Pts [data-pt="place"]'); await page.waitForTimeout(300);
    const again = await page.evaluate(() => placements.filter(p => p.ptSet === l3xyzSet().id).length); if (again !== 2) fail('Placera om ska inte ge dubbletter: ' + again);
    console.log('OK: objekt på punkterna – tilldela markerade, placera i modellen (mitt, vridning, mått), ny placering utan dubbletter');
    if (process.env.L3PTS) { await page.evaluate(() => { const g = l3xyzGroups(l3xyzSet()); l3.camera.far = 1e5; l3xyzFly(g[1]); l3Render(); }); await page.waitForTimeout(500); await page.screenshot({ path: process.env.L3PTS }); }
    // utan markering, byt läge, ta bort
    await page.evaluate(() => { const s = l3xyzSet(); s.mode = 'point'; s.assign = {}; l3xyzSave(); });
    const pm = await page.evaluate(() => document.querySelectorAll('#v3Pts .pt-row').length); if (pm !== 13) fail('Varje punkt för sig ska ge 13 rader: ' + pm);
    await page.evaluate(() => { const s = l3xyzSet(); s.mode = 'group'; s.assign = {}; l3xyzSave(); l3xyzUnplace(s); });
    const gone = await page.evaluate(() => ({ left: placements.filter(p => p.ptSet).length, set: l3xyzSet().placed.length })); if (gone.left || gone.set) fail('Ta bort placerade ska tömma: ' + J(gone));
    await page.click('#v3Pts [data-pt="x"]'); const closed = await page.evaluate(() => !document.getElementById('v3Pts')); if (!closed) fail('Panelen ska stängas');
    if (errors.length) fail('Sidan gav fel: ' + errors.slice(0, 3).join(' | '));
    console.log('OK test_lagesplan_3dpts');
  } catch (e) { console.log('FEL: ' + e.message); process.exitCode = 1; }
  await browser.close(); server.close();
})();
