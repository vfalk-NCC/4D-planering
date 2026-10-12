// 3D-vyns flik 4D-planering (Victor 2026-10-12): Powerproject-tidplanen som tavla (lappar per vecka) och staplar
// i en panel nederst, tryck på en lapp markerar i 3D, tryck på en vecka flyttar datumet, kameravyer på datum
// och en inspelad film (videofil) där datumet räknas fram och kameran glider mellan vyerna.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9016;
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
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
    await page.route('https://api.github.com/**', r => {
      const f = decodeURIComponent(new URL(r.request().url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
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

    // Fliken bredvid 3D-bibliotek.
    const tabs = await page.evaluate(() => [...document.querySelectorAll('[data-paltab]')].map(b => b.dataset.paltab));
    if (tabs[tabs.indexOf('add') + 1] !== 'plan') fail('Fliken 4D-planering ska ligga bredvid 3D-bibliotek: ' + tabs);
    await page.click('[data-paltab="plan"]');
    await page.waitForSelector('#v3PalPlan #v3PlDock', { timeout: 8000 });
    const tab = await page.textContent('#v3PalPlan');
    if (!/3 aktiviteter/.test(tab) || !/K10, K11 – Gjutning pelare/.test(tab)) fail('Fliken: tidplanen och det som pågår: ' + tab.replace(/\s+/g, ' ').slice(0, 300));

    // Tavlan: en lapp per aktivitet, banor per område, dagens vecka markerad.
    await page.click('#v3PlDock');
    await page.waitForSelector('#v3PlanDock .v3-pnote, #v3PlanDock .v3-ga-out');
    await page.evaluate(() => { l3plSet('period', 'all'); l3plDockRender(); });
    const b = await page.evaluate(() => ({ notes: [...document.querySelectorAll('#v3PlanDock .v3-pnote .t')].map(n => n.textContent), lanes: [...document.querySelectorAll('#v3PlanDock .v3-pl-lane-h')].map(n => n.textContent.replace(/\s+/g, ' ').trim()), cur: (document.querySelector('#v3PlanDock .v3-pl-week.cur b') || {}).textContent }));
    if (JSON.stringify(b.notes) !== JSON.stringify(['K10, K11: Gjutning pelare', 'Fasad: Fasadmontage', 'Tak: Takmontage']) || b.lanes.join('|') !== '▾Hus A2 st|▾Hus B1 st' || b.cur !== 'v.42') fail('Tavlan: ' + JSON.stringify(b));
    // Tryck på en lapp: markera i 3D (objekten finns i en låtsad modell).
    await page.evaluate(() => { window.__sel = null; const fake = { id: 'm1', name: 'B.ifc', visible: true }; l3b.models.push(fake); const ents = new Map([['1hZq3$Bq9Fxu8nZK0bW1aA', [{ g: 1 }]], ['2hZq3$Bq9Fxu8nZK0bW1aA', [{ g: 2 }]]]); l3pEnts = m => (m === fake ? ents : new Map()); l3bsSet = list => { window.__sel = list.map(e => e.g); }; l3bsZoom = () => {}; });
    await page.click('#v3PlanDock .v3-pnote');
    if (JSON.stringify(await page.evaluate(() => window.__sel)) !== '[1,2]') fail('Lappen ska markera aktivitetens objekt i 3D');
    await page.evaluate(() => { l3b.models.pop(); });
    // Tryck på en vecka: datumet dit.
    await page.click('#v3PlanDock [data-plweek="2026-11-02"]'); await page.waitForTimeout(200);
    if (await page.evaluate(() => $('dateInput').value) !== '2026-11-02') fail('Veckan ska flytta datumet');
    // Staplar.
    await page.click('#v3PlanDock [data-plview="bars"]');
    if ((await page.$$('#v3PlanDock .v3-pl-bar')).length !== 3) fail('Staplarna');
    await page.evaluate(() => { $('dateInput').value = '2026-10-12'; });

    // Period 2 v: Tak (november) ligger utanför och räknas.
    await page.click('#v3PlanDock [data-plview="board"]');
    await page.click('#v3PlanDock [data-gaper="2w"]');
    if (!/1 aktivitet utanför/.test(await page.textContent('#v3PlanDock .v3-ga-out'))) fail('Period 2 v ska dölja Tak');
    await page.click('#v3PlanDock [data-gaper="all"]');
    // Pilar: Tak väntar på pelarna.
    await page.evaluate(() => l3plDockRender());
    await page.waitForTimeout(150);
    if ((await page.$$('#v3PlanDock .v3-ga-arrows > path')).length !== 1) fail('Pilen för beroendet: ' + await page.evaluate(() => JSON.stringify({ svg: (document.querySelector('#v3PlanDock .v3-ga-arrows') || {}).outerHTML, deps: l3plActs(false).map(a => [a.key, a.deps]), els: [...document.querySelectorAll('#v3PlanDock [data-plk]')].map(e => e.dataset.plk), P: l3gaP().arrows })));
    // Dölj ett område med högerklick, visa alla igen.
    await page.click('#v3PlanDock [data-galane="Hus B"] .v3-pl-lane-h', { button: 'right' });
    await page.click('#v3GaMenu [data-i="0"]');
    if ((await page.$$('#v3PlanDock .v3-pnote')).length !== 2 || !/1 av 2/.test(await page.textContent('#v3GaLanes'))) fail('Dölj området');
    await page.click('#v3GaLanesAll');
    // Redigerbar: dra Pelarna 3 dagar → rutan frågar, Avbryt sparar inget; Spara skriver och Tak skjuts med.
    const puts = [];
    page.on('request', r => { if (r.method() === 'PUT' && r.url().includes('pp/plan_items.json')) puts.push(JSON.parse(Buffer.from(JSON.parse(r.postData()).content, 'base64').toString())); });
    await page.evaluate(() => { l3plSet('editable', true); l3plDockRender(); });
    const drag = async () => { await page.evaluate(() => { l3plSet('full', true); l3plDockRender(); document.querySelector('#v3PlanDock .v3-pl-scroll').scrollTop = 0; }); const n = await page.$('#v3PlanDock [data-plk="g:G1"]'); const bb = await n.boundingBox(), dayPx = await page.evaluate(() => Number(document.querySelector('#v3PlanDock .v3-pl-board').dataset.daypx));
      await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.mouse.move(bb.x + bb.width / 2 + dayPx * 3, bb.y + bb.height / 2, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(400); };
    let asked = null; page.__uiDialogHandlers.push(d => { asked = d.message(); d.dismiss(); });
    await drag();
    if (!asked || !/Spara i 4D-planeringen/.test(asked) || puts.length) fail('Avbryt i rutan ska inte spara: ' + JSON.stringify({ asked, puts: puts.length }));
    page.__uiDialogHandlers.length = 0; page.__uiDialogHandlers.push(d => { asked = d.message(); d.accept(); });
    await page.evaluate(() => l3plDockRender());
    await drag();
    await page.waitForFunction(() => !l3ga.busy, null, { timeout: 10000 });
    const saved = puts[0] || [];
    const g = id => saved.find(r => r.id === id) || {};
    if (g('p1').start_date !== '2026-10-08' || g('p1').end_date !== '2026-10-19' || g('p2').end_date !== '2026-10-21' || g('p4').start_date !== '2026-10-20' || g('p4').end_date !== '2026-10-23' || g('p3').start_date !== '2026-11-02' || !/Fasadmontage/.test(asked))
      fail('Dra och spara (med det som väntar): ' + JSON.stringify({ asked, p1: g('p1'), p2: g('p2'), p3: g('p3'), p4: g('p4') }));
    if (!(await page.evaluate(() => l3ga.undo.length === 1))) fail('Ångra ska finnas');
    await page.evaluate(() => { l3plSet('editable', false); l3plSet('full', false); });
    // Lista: filter och Visa filtrerat i 3D.
    await page.evaluate(() => { l3plSet('view', 'list'); l3plDockRender(); });
    await page.selectOption('#v3PlanDock [data-galf="contractor"]', 'Peab');
    const li = await page.textContent('#v3PlanDock .v3-ga-fbtns span');
    if (!/1 av 3/.test(li)) fail('Listans filter: ' + li);
    await page.click('#v3PlanDock #v3GaClearF');
    // Koppla: markerade 3D-objekt till Tak via 4D-planering (rutan frågar först).
    const cpl = await page.evaluate(async () => {
      const fake = { id: 'f:F1', name: 'B.ifc', visible: true, src: { fileId: 'F1' } }; l3b.models.push(fake);
      const ents = new Map([['NEWGUID0000000000000001', [{ g: 9 }]], ['1hZq3$Bq9Fxu8nZK0bW1aA', [{ g: 1 }]]]); l3pEnts = m => (m === fake ? ents : new Map());
      l3bs.sel = [{ mesh: { userData: { l3b: { model: fake, ranges: [{ guid: 'NEWGUID0000000000000001', name: 'Balk' }] } } }, ri: 0 }];
      window.__oaw = []; Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
      askOpener = async (type, x) => { window.__oaw.push([type, x]); return {}; };
      await l3gaCouple(l3plActs(false).find(a => a.name === 'Takmontage'));
      l3b.models.pop(); l3bs.sel = [];
      return window.__oaw.filter(x => x[0] === 'coupleObjects').map(x => x[1]);
    });
    if (cpl.length !== 1 || cpl[0].itemId !== 'p3' || cpl[0].source !== 'pp' || JSON.stringify(cpl[0].objs) !== JSON.stringify([{ modelId: 'F1', objectId: 'NEWGUID0000000000000001' }])) fail('Koppla: ' + JSON.stringify(cpl));
    page.__uiDialogHandlers.length = 0;
    await page.evaluate(() => { l3plSet('view', 'board'); l3plDockRender(); });

    // Kameravyer och kamerans väg mellan dem.
    const cam = await page.evaluate(() => {
      l3.camera.position.set(10, 0, 50); l3.orbit.target.set(0, 0, 0); l3.camera.updateMatrixWorld();
      l3plKeyAdd(l3plCam(), '2026-10-01', 'A');
      l3.camera.position.set(30, 0, 50); l3.camera.updateMatrixWorld();
      l3plKeyAdd(l3plCam(), '2026-10-21', 'B');
      const k = l3plKeys(), O = l3.O, mid = l3plCamAt(k, l3plDate('2026-10-11').getTime()), pre = l3plCamAt(k, l3plDate('2026-09-01').getTime());
      return { n: k.length, mid: mid.p[0] - O[0], pre: pre.p[0] - O[0], rows: 2 };
    });
    if (cam.n !== 2 || Math.abs(cam.mid - 20) > 0.01 || Math.abs(cam.pre - 10) > 0.01 || cam.rows !== 2) fail('Kameravyer: ' + JSON.stringify(cam));

    // Filmens tidslinje: datum, pärlband (det som pågår poppar upp), kamerorna, ＋ Vy här där huvudet står.
    await page.evaluate(() => { l3plSet('film', { from: '2026-10-01', to: '2026-11-30', sec: 3, res: '720' }); l3plDockToggle(false); l3plRenderTab(); });
    await page.click('#v3FlStrip');
    await page.waitForSelector('#v3FilmStrip .v3-fs-pearl');
    let fs = await page.evaluate(() => ({ pearls: [...document.querySelectorAll('#v3FilmStrip .v3-fs-pearl')].map(b => b.textContent.trim()), on: [...document.querySelectorAll('#v3FilmStrip .v3-fs-pearl.on')].map(b => b.textContent.trim()), keys: document.querySelectorAll('#v3FilmStrip .v3-fs-key').length, months: [...document.querySelectorAll('#v3FilmStrip .v3-fs-axis span.m')].map(x => x.textContent) }));
    if (fs.pearls.length !== 3 || JSON.stringify(fs.on) !== JSON.stringify(['K10 +1: Gjutning pelare']) || fs.keys !== 2 || fs.months.join() !== 'nov') fail('Tidslinjen: ' + JSON.stringify(fs));
    // Spola till Tak (november) genom att trycka på tidslinjen: datumet följer med och Tak poppar upp.
    const ax = await (await page.$('#v3FilmStrip .v3-fs-axis')).boundingBox();
    await page.mouse.click(ax.x + ax.width * (36 / 60), ax.y + 20); await page.waitForTimeout(150);
    fs = await page.evaluate(() => ({ d: $('dateInput').value, on: [...document.querySelectorAll('#v3FilmStrip .v3-fs-pearl.on')].map(b => b.textContent.trim()) }));
    if (!(fs.d >= '2026-11-02' && fs.d <= '2026-11-20') || !fs.on.includes('Tak: Takmontage')) fail('Spola: ' + JSON.stringify(fs));
    await page.click('#v3FsAdd');
    fs = await page.evaluate(d => ({ n: l3plKeys().length, has: l3plKeys().some(k => k.date === d), dom: document.querySelectorAll('#v3FilmStrip .v3-fs-key').length }), fs.d);
    if (fs.n !== 3 || !fs.has || fs.dom !== 3) fail('＋ Vy här: ' + JSON.stringify(fs));
    // Högerklick på en kamera tar bort den.
    await page.click('#v3FilmStrip [data-fsk="2"]', { button: 'right' });
    if (await page.evaluate(() => l3plKeys().length) !== 2) fail('Högerklick ska ta bort kameran');
    // Pärlbandet ritas i filmen.
    const fr = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 1280; c.height = 720; const x = c.getContext('2d'); let n = 0; const ft = x.fillText.bind(x); x.fillText = (t, ...a) => { if (/Gjutning pelare/.test(t)) n++; return ft(t, ...a); }; l3fsDrawFrame(x, 1280, 720, '2026-10-12'); return n; });
    if (fr !== 1) fail('Pärlan ska ritas i filmen: ' + fr);
    await page.evaluate(() => { const f = l3plPrefs().film; l3plSet('film', { ...f, strip: false }); l3fsRender(); $('dateInput').value = '2026-10-12'; });

    // Filmen: spelas in och sparas som videofil; datumet räknas fram och återställs efteråt.
    const film = await page.evaluate(async () => {
      l3plSet('film', { from: '2026-10-01', to: '2026-10-21', sec: 3, res: '720', title: true, caption: 'Test' });
      let saved = null; const dl = downloadBlob; downloadBlob = (blob, name) => { saved = { size: blob.size, type: blob.type, name }; };
      const days = new Set(); const sd = l3plSetDay; l3plSetDay = d => { days.add(d); return sd(d); };
      const r = await l3plFilm(true);
      downloadBlob = dl; l3plSetDay = sd;
      return { r, saved, days: days.size, date: $('dateInput').value, w: l3.renderer.domElement.width };
    });
    if (!film.saved || film.saved.size < 1000 || !/^video\//.test(film.saved.type) || !/^4D-film 2026-10-01 – 2026-10-21\.(mp4|webm)$/.test(film.saved.name) || film.days < 15 || film.date !== '2026-10-12')
      fail('Filmen: ' + JSON.stringify(film));
    // Grafiken i filmen (2026-10-12): pågår nu, datumskylt (rullande vecka), milstolpe, förloppsmätare – valbara.
    const fx = await page.evaluate(async () => {
      const f = l3plPrefs().film; l3plSet('film', { ...f, from: '2026-10-01', to: '2026-10-21', title: true, fxNow: true, fxGlow: true, fxMiles: true, fxMeter: true, fxBl: true });
      const fx = await l3fxStart('2026-10-01', '2026-10-21');
      const c = document.createElement('canvas'); c.width = 1920; c.height = 1080; const x = c.getContext('2d');
      const texts = []; const ft0 = x.fillText.bind(x); x.fillText = (t, ...a) => { texts.push(String(t)); return ft0(t, ...a); };
      ['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'].forEach((d, i) => l3fxFrame(fx, d, i * 0.2));
      l3fxFrame(fx, '2026-10-14', 0.7, Date.UTC(2026, 9, 14, 6)); l3fxDraw(x, 1920, 1080, '2026-10-14', 0.7, fx, 'Etapp 1', true);
      // Procenten följer tiden inom dagen (sömlöst), inte bara dagen.
      const pa = fx.prog(Date.UTC(2026, 9, 14, 6)), pb = fx.prog(Date.UTC(2026, 9, 14, 18)); const smooth = pb > pa;
      const all = texts.join(' | ');
      const weekRoll = fx.week.prev !== fx.week.cur;
      // Klar aktivitet bockas av: Gjutning pelare slutar 18/10.
      ['2026-10-17', '2026-10-18', '2026-10-19'].forEach((d, i) => l3fxFrame(fx, d, 1 + i * 0.2));
      texts.length = 0; l3fxDraw(x, 1920, 1080, '2026-10-19', 1.5, fx, '', true); const done = texts.join(' | ');
      // Lys upp: pågående aktiviteters IFC-objekt får ett pulserande lager i statusfärgen.
      const geo = new THREE.BoxGeometry(1, 1, 1), mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
      mesh.userData.l3b = { origIdx: geo.index.array, ranges: [{ guid: '4hZq3$Bq9Fxu8nZK0bW1aA', idxStart: 0, idxCount: geo.index.count }] };
      const mdl = { id: 'mg', name: 'G.ifc', visible: true, meshes: [mesh] }; l3b.models.push(mdl);
      const pe = l3pEnts; l3pEnts = m => (m === mdl ? new Map([['4hZq3$Bq9Fxu8nZK0bW1aA', [{ mesh, ri: 0 }]]]) : new Map());
      const fxg = await l3fxStart('2026-10-01', '2026-10-21');
      l3fxFrame(fxg, '2026-10-18', 0); const op0 = fxg.glow.length === 1 && mesh.children.length === 1 && mesh.children[0].material.opacity;
      l3fxFrame(fxg, '2026-10-18', 0.35); const op1 = fxg.glow[0].material.opacity;
      l3fxFrame(fxg, '2026-10-25', 0.5); const offGlow = fxg.glow.length === 0 && mesh.children.length === 0;
      l3fxEnd(fxg); l3pEnts = pe; l3b.models.splice(l3b.models.indexOf(mdl), 1);
      const glow = !!op0 && Math.abs(op1 - op0) > 0.05 && offGlow;
      // Av: bara det som är valt ritas.
      l3plSet('film', { ...l3plPrefs().film, fxNow: false, fxMeter: false, fxMiles: false, title: false });
      const fx2 = await l3fxStart('2026-10-01', '2026-10-21'); l3fxFrame(fx2, '2026-10-14', 0.5); texts.length = 0; l3fxDraw(x, 1920, 1080, '2026-10-14', 0.5, fx2, '', true); const off = texts.length;
      l3plSet('film', { ...l3plPrefs().film, fxNow: true, fxMeter: true, fxMiles: true, title: true });
      // Uppspelning: lagret över 3D-vyn ritas och döljs efteråt.
      l3fxHud(fx, '2026-10-14', 0.7, ''); const hud = !document.getElementById('v3FilmHud').classList.contains('hidden'); l3fxEnd(fx); const hudOff = document.getElementById('v3FilmHud').classList.contains('hidden');
      const fxNoBl = await (async () => { l3plSet('film', { ...l3plPrefs().film, fxBl: false }); const f3 = await l3fxStart('2026-10-01', '2026-10-21'); l3fxFrame(f3, '2026-10-14', 0.5); texts.length = 0; l3fxDraw(x, 1920, 1080, '2026-10-14', 0.5, f3, '', true); return texts.join(' | '); })();
      return { all, weekRoll, done, off, hud, hudOff, glow, smooth, noBl: !/baslinjen/.test(fxNoBl), ahead: l3fxAhead(fx, Date.UTC(2026, 9, 12)), prog: Math.round(fx.prog(Date.UTC(2026, 9, 12)) * 100) };
    });
    const need = ['VECKA', '14 okt 2026', 'Etapp 1', 'PÅGÅR NU', 'Hus A', 'Gjutning pelare', 'PROJEKTET KLART', 'aktiviteter klara', 'Stomme klar', 'MILSTOLPE'];
    const miss = need.filter(t => !fx.all.includes(t));
    if (miss.length || !fx.weekRoll || !/före baslinjen/.test(fx.all) || !(fx.ahead > 0) || !/Klar/.test(fx.done) || fx.off !== 0 || !fx.glow || !fx.smooth || !fx.noBl || !fx.hud || !fx.hudOff) fail('Grafiken i filmen: ' + JSON.stringify({ miss, ...fx, all: fx.all.slice(0, 400) }));
    // Filmens planering: Powerproject, Excel eller båda.
    const src = await page.evaluate(async () => {
      const set = v => l3plSet('film', { ...l3plPrefs().film, src: v });
      set('excel'); await l3plLoadX(); const ex = l3plFilmActs().map(a => a.name);
      set('both'); const both = l3plFilmActs(); const fxb = await l3fxStart('2026-10-01', '2026-10-21'); l3fxFrame(fxb, '2026-10-12', 0);
      set('pp'); const pp = l3plFilmActs().map(a => a.name);
      return { ex, both: both.map(a => a.name), bothArea: both.find(a => a.name === 'Etablering bodar').area, fxAreas: [...new Set(fxb.active.map(a => a.area))], pp, sel: (() => { l3PalTab('plan'); l3plRenderTab(); return !!document.getElementById('v3FlSrc'); })() };
    });
    if (src.ex.join() !== 'Etablering bodar' || !src.both.includes('Etablering bodar') || !src.both.includes('Gjutning pelare') || src.bothArea !== 'Excel · Etablering' || !src.fxAreas.includes('Excel · Etablering') || src.pp.includes('Etablering bodar') || !src.sel)
      fail('Filmens planering (PP/Excel/båda): ' + JSON.stringify(src));
    console.log('OK: filmens planering – Powerproject, Excel eller båda (Excel-områdena märkta)');
    // Valen finns i fliken.
    const ui = await page.evaluate(() => { l3PalTab('plan'); l3plRenderTab(); return ['v3FlFxNow', 'v3FlFxGlow', 'v3FlFxMiles', 'v3FlFxMeter', 'v3FlFxBl', 'v3FlTitleOn'].every(id => document.getElementById(id)); });
    if (!ui) fail('Valen för grafiken saknas i fliken');
    console.log(`OK: filmens grafik – pågår nu (in/ut, bock), datumskylt med rullande vecka, milstolpe, förloppsmätare (${fx.prog} %, ${fx.ahead} dagar före baslinjen), valbara, lager vid uppspelning`);
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('OK: fliken 4D-planering – Powerproject som tavla och staplar, markera i 3D, vecka → datum, kameravyer, film som videofil');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
