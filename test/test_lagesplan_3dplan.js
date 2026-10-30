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

    // Fliken bredvid 3D-bibliotek.
    const tabs = await page.evaluate(() => [...document.querySelectorAll('[data-paltab]')].map(b => b.dataset.paltab));
    if (tabs[tabs.indexOf('add') + 1] !== 'plan') fail('Fliken 4D-planering ska ligga bredvid 3D-bibliotek: ' + tabs);
    await page.click('[data-paltab="plan"]');
    await page.waitForSelector('#v3PalPlan #v3PlDock', { timeout: 8000 });
    await page.evaluate(() => { l3plSet('secOpen', { film: true, link: false, other: true }); l3plRenderTab(); }); // Film och Övrigt är hopfällda från start
    const tab = await page.textContent('#v3PalPlan');
    if (!/3 aktiviteter/.test(tab) || /Pågår 20\d\d-/.test(tab)) fail('Fliken: tidplanen visas men listan Pågår <datum> är borttagen: ' + tab.replace(/\s+/g, ' ').slice(0, 300));

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
    await page.click('#v3PlanDock [data-galm="contractor"]'); await page.check('#v3GaMultiPop .v3-ga-mrow:has-text("Peab") input'); await page.waitForTimeout(200);
    await page.evaluate(() => { const p = document.getElementById('v3GaMultiPop'); if (p) p.remove(); });
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
    // Redigeringsdialogen som i dashboarden: Temporär/Rivning/Egen färg efter slut, och ✕ för ett objekt.
    {
      const n0 = puts.length; let ask2 = null; const PP0 = JSON.parse(JSON.stringify(PP)); global.__mockWrite = true;
      page.__uiDialogHandlers.push(d => { ask2 = d.message(); d.accept(); });
      const dl = await page.evaluate(() => { l3gaEdit('g:G1'); const w = document.querySelector('.v3-ga-dlg'); return { objs: w.querySelectorAll('.v3-ga-obj').length, adv: !!w.querySelector('[data-f="temp"]') && !!w.querySelector('[data-f="demo"]') && !!w.querySelector('[data-f="donechk"]'), maxH: w.querySelector('.ui-dlg-main').style.maxHeight }; });
      if (dl.objs !== 2 || !dl.adv || !dl.maxH) fail('Redigeringsdialogen saknar fält: ' + JSON.stringify(dl));
      await page.evaluate(() => { const w = document.querySelector('.v3-ga-dlg'); w.querySelector('[data-f="temp"]').click(); const c = w.querySelector('[data-f="donecol"]'); c.value = '#ff0000'; c.dispatchEvent(new Event('input')); const o = w.querySelector('[data-f="doneop"]'); o.value = '55'; o.dispatchEvent(new Event('input')); w.querySelector('.ui-dlg-ok').click(); });
      await page.waitForFunction(() => !l3ga.busy && document.querySelectorAll('.v3-ga-dlg').length === 0, null, { timeout: 10000 }).catch(async e => fail('Efter Spara: ' + JSON.stringify(await page.evaluate(() => ({ busy: l3ga.busy, dlg: document.querySelectorAll('.v3-ga-dlg').length, st: (document.getElementById('v3Status') || {}).textContent })))));
      await page.waitForTimeout(500);
      const sv = (puts[n0] || []).filter(r => r.group_id === 'G1');
      if (puts.length !== n0 + 1 || !sv.length || !sv.every(r => r.temporary === true && r.done_color === '#ff0000' && r.done_opacity === 55) || !/temporär/.test(ask2 || '') || !/färg efter slut/.test(ask2 || '')) fail('Spara Temporär/färg efter slut: ' + JSON.stringify({ n0, n: puts.length, sv, ask2 }));
      // Rivning och Temporär utesluter varandra.
      const ex = await page.evaluate(() => { l3gaEdit('g:G1'); const w = document.querySelector('.v3-ga-dlg'); const t = w.querySelector('[data-f="temp"]').checked; w.querySelector('[data-f="demo"]').click(); const r = { wasTemp: t, temp: w.querySelector('[data-f="temp"]').checked, demo: w.querySelector('[data-f="demo"]').checked }; w.querySelector('.ui-dlg-cancel').click(); return r; }); await page.waitForFunction(() => !document.querySelector('.v3-ga-dlg-wrap'));
      if (!ex.wasTemp || ex.temp || !ex.demo) fail('Temporär/Rivning utesluter varandra: ' + JSON.stringify(ex));
      // Ctrl-klick väljer flera objekt i listan (knapp för att ta bort alla valda); markering i modellen följs i listan.
      const ms = await page.evaluate(async () => {
        l3gaEdit('g:G1'); const w = document.querySelector('.v3-ga-dlg'), rows = [...w.querySelectorAll('.v3-ga-obj')];
        rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
        const n = w.querySelectorAll('.v3-ga-obj.msel').length, bar = (w.querySelector('.v3-ga-objs-bar') || {}).textContent || '', pe = getComputedStyle(document.querySelector('.v3-ga-dlg-wrap')).pointerEvents;
        rows[1].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); const n2 = w.querySelectorAll('.v3-ga-obj.msel').length;
        rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })); const bar0 = w.querySelector('.v3-ga-objs-bar').style.display;
        const origEnts = window.l3plEntsOf; window.l3plEntsOf = a => a.rows.map(r => ({ mesh: { uuid: 'u' + r.id }, ri: 0 })); const m1 = l3pl.rows.find(r => r.id === 'p1'), ents = l3plEntsOf({ rows: [m1] }); let syncOn = null;
        if (ents.length) { l3bs.sel = [ents[0]]; await new Promise(r => setTimeout(r, 450)); syncOn = w.querySelector('.v3-ga-obj[data-mid="p1"]').classList.contains('on') && !w.querySelector('.v3-ga-obj[data-mid="p2"]').classList.contains('on'); l3bs.sel = []; }
        window.l3plEntsOf = origEnts; w.querySelector('.ui-dlg-cancel').click(); return { n, bar, pe, n2, bar0, syncOn };
      });
      await page.waitForFunction(() => !document.querySelector('.v3-ga-dlg-wrap'));
      if (process.env.DBG) console.log('MS', JSON.stringify(ms));
      if (ms.n !== 2 || !/2 valda/.test(ms.bar) || ms.pe !== 'none' || ms.n2 !== 1 || ms.bar0 !== 'none' || ms.syncOn !== true) fail('Flera objekt i aktiviteten (ctrl-klick) / markering följs: ' + JSON.stringify(ms));
      // ✕: frågar, tar bort bara det objektet.
      const n1 = puts.length; ask2 = null;
      await page.evaluate(() => { l3gaEdit('g:G1'); document.querySelector('.v3-ga-obj-x[data-mid="p2"]').click(); });
      await page.waitForFunction(() => !l3ga.busy && l3ga.undo.some(u => u.removed), null, { timeout: 6000 }).catch(async e => fail('Efter ✕: ' + JSON.stringify({ ask2, st: await page.evaluate(() => ({ busy: l3ga.busy, undo: l3ga.undo.length, alert: [...document.querySelectorAll('.ui-dlg-body,.ui-dlg-title')].map(x => x.textContent) })) })));
      const rm = puts[n1] || [];
      if (puts.length !== n1 + 1 || rm.some(r => r.id === 'p2') || !rm.some(r => r.id === 'p1') || !/Ta bort/.test(ask2 || '')) fail('Ta bort ett objekt ur aktiviteten: ' + JSON.stringify({ n1, n: puts.length, ids: rm.map(r => r.id), ask2 }));
      await page.evaluate(() => document.querySelectorAll('.v3-ga-dlg').forEach(w => w.querySelector('.ui-dlg-cancel').click())); await page.waitForFunction(() => !document.querySelector('.v3-ga-dlg-wrap'));
      global.__mockWrite = false; PP.splice(0, PP.length, ...PP0); await page.evaluate(() => { l3ga.undo.length = 0; l3pl.rows = null; return l3plLoad(true); });
      console.log('OK: redigeringsdialogen – Temporär, Rivning, Egen färg efter slut och ✕ ta bort objekt (med frågeruta)');
      page.__uiDialogHandlers.length = 0;
    }

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
    await page.waitForSelector('#v3FilmStrip .v3-fs-days i');
    let fs = await page.evaluate(() => ({ pearls: document.querySelectorAll('#v3FilmStrip .v3-fs-pearl').length, days: document.querySelectorAll('#v3FilmStrip .v3-fs-days i').length, we: document.querySelectorAll('#v3FilmStrip .v3-fs-days i.we').length, keys: document.querySelectorAll('#v3FilmStrip .v3-fs-key').length, months: [...document.querySelectorAll('#v3FilmStrip .v3-fs-axis span.m')].map(x => x.textContent) }));
    // Inga aktiviteter på tidslinjen (2026-10-12) – en markering per dag (61 dagar, helgerna märkta).
    if (fs.pearls || fs.days !== 61 || fs.we !== 18 || fs.keys !== 2 || fs.months.join() !== 'nov') fail('Tidslinjen: ' + JSON.stringify(fs));
    // Spola till Tak (november) genom att trycka på tidslinjen: datumet följer med och Tak poppar upp.
    const ax = await (await page.$('#v3FilmStrip .v3-fs-axis')).boundingBox();
    await page.mouse.click(ax.x + ax.width * (36 / 60), ax.y + 20); await page.waitForTimeout(150);
    fs = await page.evaluate(() => ({ d: $('dateInput').value }));
    if (!(fs.d >= '2026-11-02' && fs.d <= '2026-11-20')) fail('Spola: ' + JSON.stringify(fs));
    await page.click('#v3FsAdd');
    fs = await page.evaluate(d => ({ n: l3plKeys().length, has: l3plKeys().some(k => k.date === d), dom: document.querySelectorAll('#v3FilmStrip .v3-fs-key').length }), fs.d);
    if (fs.n !== 3 || !fs.has || fs.dom !== 3) fail('＋ Vy här: ' + JSON.stringify(fs));
    // Högerklick på en kamera tar bort den.
    await page.click('#v3FilmStrip [data-fsk="2"]', { button: 'right' });
    if (await page.evaluate(() => l3plKeys().length) !== 2) fail('Högerklick ska ta bort kameran');
    // I filmen: inga aktiviteter på tidslinjen, men veckonummer och månaden.
    const fr = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 1280; c.height = 720; const x = c.getContext('2d'); let n = 0, wk = 0; const ft = x.fillText.bind(x); x.fillText = (t, ...a) => { if (/Gjutning pelare/.test(t)) n++; if (/^v\d+$/.test(t)) wk++; return ft(t, ...a); }; l3fsDrawFrame(x, 1280, 720, '2026-10-12'); return n === 0 && wk >= 4 ? 1 : 0; });
    if (fr !== 1) fail('Tidslinjen i filmen (inga aktiviteter, veckor): ' + fr);
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
      l3fxEnd(fxg);
      const glow = !!op0 && Math.abs(op1 - op0) > 0.05 && offGlow;
      // Animering per aktivitet: Fasadmontage (17–20 okt) växer upp; före syns den inte, efter som vanligt.
      mesh.userData.l3b.hidden = new Set(); mesh.userData.l3b.ranges[0].start = 0; mesh.userData.l3b.ranges[0].count = geo.getAttribute('position').count;
      l3plSet('film', { ...l3plPrefs().film, anim: { def: 'color', by: { Fasadmontage: 'grow' } } });
      const fxa = await l3fxStart('2026-10-01', '2026-10-21');
      l3fxFrame(fxa, '2026-10-12', 0); const before = mesh.userData.l3b.animOff.has(0) && mesh.geometry.index.count === 0 && mesh.children.length === 0;
      l3fxFrame(fxa, '2026-10-18', 1, Date.UTC(2026, 9, 18, 12)); const ov = mesh.children.find(c => c.userData.pt), during = mesh.userData.l3b.animOff.has(0) && !!ov && ov.scale.z > 0.02 && ov.scale.z < 1;
      l3fxFrame(fxa, '2026-10-21', 2); const after = mesh.userData.l3b.animOff.size === 0 && mesh.children.length === 0 && mesh.geometry.index.count === geo.index.count;
      l3fxEnd(fxa); l3pEnts = pe; l3b.models.splice(l3b.models.indexOf(mdl), 1);
      const anim = before && during && after; window.__anim = { before, during, after, idx: mesh.geometry.index.count, kids: mesh.children.length };
      l3plSet('film', { ...l3plPrefs().film, anim: { def: 'color', by: {} }, fxLegend: true });
      const fxl = await l3fxStart('2026-10-01', '2026-10-21'); l3fxFrame(fxl, '2026-10-14', 0.5); texts.length = 0; l3fxDraw(x, 1920, 1080, '2026-10-14', 0.5, fxl, '', true); const legend = texts.includes('STATUS') && texts.includes('Ej startad');
      l3plSet('film', { ...l3plPrefs().film, fxLegend: false });
      // Etablering i takt med tidplanen: tornkranen etableras 10/10 – tonas in, skylt, bommen svänger när det pågår.
      const kr = { id: 'kr1', type: 'tornkran', name: 'Tornkran 1', x: l3.O[0] + 5, y: l3.O[1] + 5, z: 0, L: 4, B: 4, H: 30, R: 50, rot: 0, start: '2026-10-10' };
      placements.push(kr); const kg = l3AddPlacementMesh(kr);
      const fxe = await l3fxStart('2026-10-01', '2026-10-21');
      const opa = () => kg.children[0].material.opacity, jib = () => kg.children[1].rotation.z;
      l3fxFrame(fxe, '2026-10-05', 0, Date.UTC(2026, 9, 5)); const o0 = opa();
      l3fxFrame(fxe, '2026-10-10', 1, Date.UTC(2026, 9, 10, 6)); const toast = fxe.toasts.some(x => /Tornkran 1 etableras/.test(x.txt)); const o1 = opa();
      let j0 = jib(); for (let i = 0; i < 60; i++) l3fxFrame(fxe, '2026-10-14', 2 + i * 0.1, Date.UTC(2026, 9, 14, 12)); const o2 = opa(), j1 = jib();
      texts.length = 0; l3fxDraw(x, 1920, 1080, '2026-10-14', 2.5, fxe, '', true); const sign = texts.some(t => /etableras/.test(t));
      l3fxEnd(fxe); const restored = kg.children[1].rotation.z === 0;
      placements.splice(placements.indexOf(kr), 1); l3.placeMeshes.delete('kr1'); kg.parent && kg.parent.remove(kg);
      const etab = o0 < 0.3 && o1 < o2 && o2 > 0.95 && toast && Math.abs(j1 - j0) > 0.05 && restored;
      window.__etab = { o0, o1, o2, toast, j0, j1, sign, restored };
      // Av: bara det som är valt ritas.
      l3plSet('film', { ...l3plPrefs().film, fxNow: false, fxMeter: false, fxMiles: false, title: false });
      const fx2 = await l3fxStart('2026-10-01', '2026-10-21'); l3fxFrame(fx2, '2026-10-14', 0.5); texts.length = 0; l3fxDraw(x, 1920, 1080, '2026-10-14', 0.5, fx2, '', true); const off = texts.length;
      l3plSet('film', { ...l3plPrefs().film, fxNow: true, fxMeter: true, fxMiles: true, title: true });
      // Uppspelning: lagret över 3D-vyn ritas och döljs efteråt.
      l3fxHud(fx, '2026-10-14', 0.7, ''); const hud = !document.getElementById('v3FilmHud').classList.contains('hidden'); l3fxEnd(fx); const hudOff = document.getElementById('v3FilmHud').classList.contains('hidden');
      const fxNoBl = await (async () => { l3plSet('film', { ...l3plPrefs().film, fxBl: false }); const f3 = await l3fxStart('2026-10-01', '2026-10-21'); l3fxFrame(f3, '2026-10-14', 0.5); texts.length = 0; l3fxDraw(x, 1920, 1080, '2026-10-14', 0.5, f3, '', true); return texts.join(' | '); })();
      return { all, weekRoll, done, off, hud, hudOff, glow, anim, legend, etab, smooth, noBl: !/baslinjen/.test(fxNoBl), ahead: l3fxAhead(fx, Date.UTC(2026, 9, 12)), prog: Math.round(fx.prog(Date.UTC(2026, 9, 12)) * 100) };
    });
    const need = ['VECKA', '14 okt 2026', 'Etapp 1', 'PÅGÅR NU', 'Hus A', 'Gjutning pelare', 'PROJEKTET KLART', 'aktiviteter klara', 'Stomme klar', 'MILSTOLPE'];
    const miss = need.filter(t => !fx.all.includes(t));
    if (miss.length || !fx.weekRoll || !/före baslinjen/.test(fx.all) || !(fx.ahead > 0) || !/Klar/.test(fx.done) || fx.off !== 0 || !fx.glow || !fx.anim || !fx.legend || !fx.etab || !fx.smooth || !fx.noBl || !fx.hud || !fx.hudOff) fail('Grafiken i filmen: ' + JSON.stringify({ miss, ...fx, all: fx.all.slice(0, 100), a: await page.evaluate(() => window.__anim), e: await page.evaluate(() => window.__etab) }));
    // Paus (mellanslag/⏸): bilden och grafiken står kvar; ■ stoppar, går till filmens början och tar bort grafiken.
    const pz = await page.evaluate(async () => {
      l3plSet('film', { ...l3plPrefs().film, from: '2026-10-01', to: '2026-10-21', sec: 4, fxNow: true });
      const run = l3plFilm(false);
      await new Promise(r => setTimeout(r, 900));
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      await new Promise(r => setTimeout(r, 200)); const d1 = $('dateInput').value; await new Promise(r => setTimeout(r, 700)); const d2 = $('dateInput').value;
      const hud = !document.getElementById('v3FilmHud').classList.contains('hidden'), btn = document.getElementById('v3FlPause').textContent;
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      await new Promise(r => setTimeout(r, 900)); const d3 = $('dateInput').value;
      document.getElementById('v3FlPreview').click(); await run;
      return { d1, d2, d3, paused: d1 === d2, resumed: d3 > d2, hud, btn, start: $('dateInput').value, hudGone: document.getElementById('v3FilmHud').classList.contains('hidden') };
    });
    if (!pz.paused || !pz.resumed || !pz.hud || !/Fortsätt/.test(pz.btn) || pz.start !== '2026-10-01' || !pz.hudGone) fail('Paus och stopp: ' + JSON.stringify(pz));
    console.log('OK: filmen pausas med mellanslag (grafiken står kvar), fortsätter, ■ går till början utan grafik');
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
    // 4D-koppling (listan i vänstermenyn): Powerproject, Excel eller båda; Excel-rader går inte att redigera här.
    const lk = await page.evaluate(async () => {
      l3PalTab('plan'); l3plSet('secOpen', { film: true, link: true, other: true }); l3plRenderTab();
      const names = () => { const P = l3gaP(); l3plSet('dock', P); return [...document.querySelectorAll('#v3PlLinkHost [data-galopen]')].map(b => b.textContent); };
      const pick = async v => { const s = document.getElementById('v3PlLinkSrc'); s.value = v; s.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 200)); };
      await pick('both'); const both = l3plLinkActs(false).map(a => a.name);
      document.querySelectorAll('#v3PlLinkHost [data-galopen]').forEach(b => l3ga.open.add('l:' + b.dataset.galopen)); l3plRenderTab();
      const xrow = document.querySelector('#v3PlLinkHost [data-plk^="x"]'); let dlg = false;
      if (xrow) { xrow.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); dlg = !!document.querySelector('.v3-ga-dlg'); }
      // Visa alla kopplade med båda planerna: objekten från både Powerproject och Excel markeras.
      const seenG = []; const pe = l3pEnts, bs = l3bsSet, iso = typeof l3bsIsolate === 'function' ? l3bsIsolate : null; const fm = { id: 'mk', visible: true }; l3b.models.push(fm);
      l3pEnts = m => (m === fm ? { get: g => { seenG.push(g); return [{ g }]; } } : new Map()); l3bsSet = () => {}; if (iso) l3bsIsolate = () => {};
      document.getElementById('v3GaShowCoupled').click();
      l3pEnts = pe; l3bsSet = bs; if (iso) l3bsIsolate = iso; l3b.models.splice(l3b.models.indexOf(fm), 1);
      const coupledBoth = seenG.includes('X1') && seenG.includes('1hZq3$Bq9Fxu8nZK0bW1aA');
      await pick('excel'); const ex = l3plLinkActs(false).map(a => a.name);
      await pick('pp'); const pp = l3plLinkActs(false).map(a => a.name);
      const synth = l3plRealObj({ object_id: 'excel-abc' }) || l3plRealObj({ object_id: 'manuell-1' }) || !l3plRealObj({ object_id: 'X1' });
      return { both, ex, pp, xrow: !!xrow, dlg, coupledBoth, synth };
    });
    if (!lk.both.includes('Etablering bodar') || !lk.both.includes('Gjutning pelare') || lk.ex.join() !== 'Etablering bodar' || lk.pp.includes('Etablering bodar') || !lk.xrow || lk.dlg || !lk.coupledBoth || lk.synth) fail('4D-koppling PP/Excel/båda: ' + JSON.stringify(lk));
    // Animera placerade objekt på tidslinjen: ◆ Nyckel sparar läget på datumet, mjuk rörelse mellan nycklarna.
    const an = await page.evaluate(async () => {
      const O = l3.O, p = { id: 'an1', type: 'tornkran', name: 'Sketchfab-bil', x: O[0] + 5, y: O[1] + 5, z: 0, L: 4, B: 4, H: 10, R: 0, rot: 0 };
      placements.push(p); const g = l3AddPlacementMesh(p); l3SelectIds(['an1']);
      l3plSet('film', { ...l3plPrefs().film, strip: false }); l3fsToggle(true); await new Promise(r => setTimeout(r, 300));
      const none = (l3.sel.clear(), l3animCapture('2026-10-10')); l3SelectIds(['an1']);
      g.position.x = 5; g.rotation.z = 0; const n1 = l3animCapture('2026-10-10');
      g.position.x = 15; g.rotation.z = Math.PI / 2; const n2 = l3animCapture('2026-10-20');
      const D = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
      l3animApply(D('2026-10-15')); const mid = [g.position.x, Math.round(g.rotation.z * 180 / Math.PI)];
      l3animApply(D('2026-10-01')); const before = g.position.x; l3animApply(D('2026-11-01')); const after = g.position.x;
      l3fsRender(); const marks = document.querySelectorAll('#v3FilmStrip .v3-fs-ak').length;
      const btn = !!document.getElementById('v3FsAKey'), saved = Array.isArray(p.anim) && p.anim.length === 2;
      l3animMove('an1', '2026-10-20', '2026-10-22'); const moved = p.anim[1].date === '2026-10-22';
      l3animRemove('an1', '2026-10-22'); const removed = p.anim.length === 1;
      l3animReset(); const back = g.position.x === p.x - O[0];
      l3fsToggle(false); placements.splice(placements.indexOf(p), 1); l3.groups.places.remove(g); l3.placeMeshes.delete('an1');
      return { none, n1, n2, mid, before, after, marks, btn, saved, moved, removed, back };
    });
    if (an.none !== 0 || an.n1 !== 1 || an.n2 !== 1 || Math.abs(an.mid[0] - 10) > 0.01 || an.mid[1] !== 45 || an.before !== 5 || an.after !== 15 || an.marks !== 2 || !an.btn || !an.saved || !an.moved || !an.removed || !an.back) fail('Objektanimering på tidslinjen: ' + JSON.stringify(an));
    else console.log('OK: objektanimering – ◆ Nyckel på tidslinjen, mjuk rörelse och vridning mellan nycklarna, flytta/ta bort nyckel');
    // Sparade vyer: snitt (med läge), mått, kommentarer och dolda objekt ingår.
    const vw = await page.evaluate(async () => {
      const O = l3.O, p = { id: 'svw1', type: 'container', name: 'Dold', x: O[0] + 70, y: O[1] + 70, z: 0, L: 2, B: 2, H: 2, R: 0, rot: 0 };
      placements.push(p); const g = l3AddPlacementMesh(p);
      const m = l3mAdd('dist', [new THREE.Vector3(1, 1, 0), new THREE.Vector3(3, 1, 0)], '2 m', []);
      l3AddClip(new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 2)); l3.clips[0].off = 2.5; l3.hidden.add('svw1'); g.visible = false;
      l3SaveView('TestVy'); const idx = l3SavedViews().findIndex(v => v.name === 'TestVy'), sv = l3SavedViews()[idx];
      const saved = sv.clips.length === 1 && sv.clips[0].off === 2.5 && sv.meas.includes(m.id) && sv.hid.place.includes('svw1');
      // Ändra allt, hoppa tillbaka till vyn.
      m.hid = true; l3.clips = []; l3ApplyClips(); l3.hidden.delete('svw1'); g.visible = true;
      const m2 = l3mAdd('dist', [new THREE.Vector3(5, 5, 0), new THREE.Vector3(6, 5, 0)], '1 m', []); // nytt mått efter sparandet
      l3GoView(idx); await new Promise(r => setTimeout(r, 100));
      const back = l3.clips.length === 1 && l3.clips[0].off === 2.5 && !m.hid && m2.hid === true && l3.hidden.has('svw1') && g.visible === false && Math.abs(l3.renderer.clippingPlanes.length - 1) === 0;
      // Cleanup
      l3DelView(idx); l3m.list = l3m.list.filter(x => x.id !== m.id && x.id !== m2.id); l3mDraw(); l3.clips = []; l3ApplyClips(); l3.hidden.delete('svw1'); placements.splice(placements.indexOf(p), 1); l3.groups.places.remove(g); l3.placeMeshes.delete('svw1');
      return { saved, back, nClips: sv.clips.length };
    });
    if (!vw.saved || !vw.back) fail('Sparad vy (snitt, mått, dolda objekt): ' + JSON.stringify(vw));
    else console.log('OK: sparade vyer tar med snitten (med läge), måtten och dolda objekt – hoppar man till en vy byts allt');
    // Smart mått: bredd, höjd och objektets volym med ett tryck.
    const sm = await page.evaluate(async () => {
      const O = l3.O, p = { id: 'smt1', type: 'container', name: 'Container', x: O[0] + 40, y: O[1] + 40, z: 0, L: 6.06, B: 2.44, H: 2.59, R: 0, rot: 0 };
      placements.push(p); const g = l3AddPlacementMesh(p); g.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(g), c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
      l3StopFly(); l3.camera.position.set(c.x, bb.min.y - 22, c.z + 1); l3.orbit.target.set(c.x, c.y, c.z); l3.orbit.update(); l3.camera.updateMatrixWorld(); l3Render();
      const q = l3ToScreen(new THREE.Vector3(c.x + sz.x * 0.1, bb.min.y, c.z - sz.z * 0.1)), r = l3.renderer.domElement.getBoundingClientRect();
      l3SetTool('measure'); l3SetPref('measure', 'smart'); l3RenderSnapBar(); const seg = !!document.querySelector('[data-mmode="smart"]');
      const n0 = l3m.list.length; l3SmartMeasure({ clientX: r.left + q.x, clientY: r.top + q.y, button: 0 }); const added = l3m.list.slice(n0);
      const dist = added.filter(m => m.kind === 'dist' && /^(Bredd|Höjd|Längd)$/.test(m.note || '')), vol = added.find(m => m.kind === 'objvol');
      const val = m => parseFloat(String(m.text).replace(',', '.')), W = dist[0] && val(dist[0]), H = dist[1] && val(dist[1]);
      const down = added.find(m => /^Ner till/.test(m.note || '')); const ok = added.length >= 3 && !!down && Math.abs(W - sz.x) < 0.02 && Math.abs(H - sz.z) < 0.02 && dist[0].note === 'Bredd' && dist[1].note === 'Höjd' && vol && vol.dims && Math.abs(vol.dims[2] - sz.y) < 0.02 && val(vol) > 0.5 * sz.x * sz.y * sz.z && val(vol) <= sz.x * sz.y * sz.z * 1.03;
      const tab = (l3mTabHtml().match(/Objektvolym/g) || []).length === 1, info = l3mInfo(vol).rows.some(([k]) => k === 'Måttbox (B×H×D)');
      const nx = document.querySelectorAll('.v3-meas-x').length, before = l3m.list.length; document.querySelector('.v3-meas-x').click(); const xRemoved = l3m.list.length === before - 1 && nx >= added.length; // litet kryss efter varje mått
      l3m.list.splice(n0); l3mDraw(); l3SetTool('select'); placements.splice(placements.indexOf(p), 1); l3.groups.places.remove(g); l3.placeMeshes.delete('smt1');
      return { seg, ok, tab, info, xRemoved, W, H, sz: [sz.x, sz.y, sz.z], vol: vol && vol.text, n: added.length };
    });
    if (!sm.seg || !sm.ok || !sm.tab || !sm.info || !sm.xRemoved) fail('Smart mått: ' + JSON.stringify(sm));
    else console.log('OK: smart mått – bredd, höjd och objektets volym med ett tryck');
    // Raderade mått lämnar inga handtag (orange prickar) kvar; måttlistan visar inga objektnamn.
    const mh = await page.evaluate(() => {
      l3SetTool('select'); const m = l3mAdd('dist', [new THREE.Vector3(1, 1, 0), new THREE.Vector3(3, 1, 0)], '2 m', [{ name: 'Foundation Slab:Concrete', kind: 'ifc' }, { name: 'Foundation Slab:Concrete', kind: 'ifc' }]);
      const compact = !l3mTabHtml().includes('Foundation Slab') && l3mInfo(m).rows.some(([k, v]) => /Foundation Slab/.test(v));
      l3m.sel.clear(); l3m.sel.add(m.id); l3mDraw(); const shown = document.querySelectorAll('.v3-mhandle').length;
      l3mRemove(m.id); const left = document.querySelectorAll('.v3-mhandle').length;
      const m2 = l3mAdd('dist', [new THREE.Vector3(1, 1, 0), new THREE.Vector3(3, 1, 0)], '2 m', []); l3m.sel.clear(); l3m.sel.add(m2.id); l3mDraw(); const shown2 = document.querySelectorAll('.v3-mhandle').length;
      l3m.list = l3m.list.filter(x => x.id !== m2.id); l3mDraw(); const left2 = document.querySelectorAll('.v3-mhandle').length; // även om måttet försvinner på annat sätt
      return { compact, shown, left, shown2, left2 };
    });
    if (!mh.compact || mh.shown !== 2 || mh.left !== 0 || mh.shown2 !== 2 || mh.left2 !== 0) fail('Mått: handtag kvar efter radering / objektnamn i listan: ' + JSON.stringify(mh));
    else console.log('OK: raderade mått lämnar inga handtag kvar, måttlistan utan objektnamn');
    // Kortkommandon: även standardgenvägar går att ta bort och återställa.
    const kc = await page.evaluate(async () => {
      l3SetPref('keys', {}); l3OpenLaunch(); const q = document.getElementById('v3LaunchQ'); q.value = 'Vrid'; q.dispatchEvent(new Event('input'));
      const row = () => [...document.querySelectorAll('.v3-launch-r')].find(r => r.textContent.includes('Vrid') && !r.textContent.includes('Vrid ')) || document.querySelector('.v3-launch-r');
      const hadX = !!row().querySelector('[data-lx]'); row().querySelector('[data-lx]').click();
      const off = l3KeysOwn()['Vrid'] === '' && !!row().querySelector('[data-lr]') && !!row().querySelector('kbd.off');
      const tool0 = l3.tool, ev = new KeyboardEvent('keydown', { key: 'q', code: 'KeyQ', bubbles: true, cancelable: true }); const swallowed = l3KeyCustom(ev) === true;
      row().querySelector('[data-lr]').click(); const back = l3KeysOwn()['Vrid'] === undefined && !!row().querySelector('[data-lx]') && l3KeyCustom(new KeyboardEvent('keydown', { key: 'q', code: 'KeyQ' })) === false;
      l3DlgClose('v3Launch'); l3SetPref('keys', {});
      return { hadX, off, swallowed, back, tool0 };
    });
    if (!kc.hadX || !kc.off || !kc.swallowed || !kc.back) fail('Ta bort/återställ standardgenväg: ' + JSON.stringify(kc));
    else console.log('OK: standardgenvägar går att ta bort och återställa i snabbsök');
    // Gå-läge: E rakt upp, Q rakt ner, tangenterna fastnar inte, M/mät fungerar, tangenterna syns i rutan.
    const wk = await page.evaluate(async () => {
      l3wInit(); const wait = ms => new Promise(r => setTimeout(r, ms)), key = (t, code, extra = {}, tgt = document.body) => tgt.dispatchEvent(new KeyboardEvent(t, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true, ...extra }));
      l3SetPref('walkFollow', true); l3SetPref('navHelp', false); l3NavHelp();
      l3wEnter(new THREE.Vector3(0, 0, l3GroundZ())); await wait(300);
      const p0 = l3.camera.position.clone();
      key('keydown', 'KeyE'); await wait(500); key('keyup', 'KeyE'); const p1 = l3.camera.position.clone();
      key('keydown', 'KeyQ'); await wait(400); key('keyup', 'KeyQ'); const p2 = l3.camera.position.clone();
      const up = p1.z - p0.z > 0.3 && Math.hypot(p1.x - p0.x, p1.y - p0.y) < 1e-6, down = p2.z < p1.z - 0.2 && Math.hypot(p2.x - p1.x, p2.y - p1.y) < 1e-6;
      // Fokus på en kryssruta i rutan: WASD ska ändå gå (förut "låste" det sig).
      const cb = document.getElementById('v3WalkFollow'); cb.focus(); const q0 = l3.camera.position.clone();
      key('keydown', 'KeyW', {}, cb); await wait(400); key('keyup', 'KeyW', {}, cb); const moved = l3.camera.position.distanceTo(q0) > 0.2;
      // Ctrl+W (flik) och Ctrl+S ska inte tolkas som gång.
      const q1 = l3.camera.position.clone(); key('keydown', 'KeyW', { ctrlKey: true }); await wait(250); key('keyup', 'KeyW', { ctrlKey: true }); const ctrlOk = l3.camera.position.distanceTo(q1) < 1e-6;
      // Tangent som släpps i ett skrivfält fastnar inte; fokus i skrivfält rensar tangenterna.
      key('keydown', 'KeyD'); const inp = document.createElement('input'); inp.type = 'text'; document.body.appendChild(inp); inp.focus(); await wait(50); const cleared = l3w.keys.size === 0; key('keyup', 'KeyD', {}, inp); inp.remove();
      const hud = document.querySelector('.v3-walk'), keysShown = hud && ['W', 'A', 'S', 'D', 'E', 'Q', 'Skift', 'C', 'M', 'Esc'].every(k => [...hud.querySelectorAll('kbd')].some(x => x.textContent === k));
      // Mäta medan man går: tryck på marken två gånger med Mät-verktyget.
      document.activeElement.blur(); l3SetTool('measure'); l3SetPref('measure', 'dist'); const n0 = l3m.list.length, cv = l3.renderer.domElement, r = cv.getBoundingClientRect();
      const tap = (x, y) => { const o = { pointerId: 5, pointerType: 'mouse', button: 0, buttons: 1, bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y }; cv.dispatchEvent(new PointerEvent('pointerdown', o)); cv.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 })); };
      tap(r.width * 0.4, r.height * 0.85); tap(r.width * 0.6, r.height * 0.85); await wait(100);
      const measured = l3m.list.length === n0 + 1 && l3m.list[l3m.list.length - 1].kind === 'dist';
      l3m.list.splice(n0); l3mDraw(); l3SetTool('select'); l3wExit(true);
      return { up, down, moved, ctrlOk, cleared, keysShown, measured, dz: [p1.z - p0.z, p2.z - p1.z] };
    });
    if (!wk.up || !wk.down || !wk.moved || !wk.ctrlOk || !wk.cleared || !wk.keysShown || !wk.measured) fail('Gå-läge (E/Q, fastnade tangenter, mäta, tangentlista): ' + JSON.stringify(wk));
    else console.log('OK: gå-läge – E rakt upp, Q rakt ner, tangenterna fastnar inte, mäta fungerar, tangentlistan syns');
    // Gå-läge som i Nira: tredje person med figur, hopp, huka, spöke/kollision, joysticks.
    const wk2 = await page.evaluate(async () => {
      l3wInit(); const wait = ms => new Promise(r => setTimeout(r, ms)), key = (t, code) => document.body.dispatchEvent(new KeyboardEvent(t, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true }));
      l3SetPref('walkFollow', true); l3SetPref('navHelp', false); l3NavHelp(); l3SetPref('walkPerson', 'third'); l3SetPref('walkGhost', true); l3SetPref('walkJoy', true);
      const gz = l3GroundZ(); l3wEnter(new THREE.Vector3(0, 0, gz)); l3w.yaw = 0; l3w.heading = 0; l3w.pitch = 0; l3wApply(); await wait(300);
      const out = {};
      out.avatar = !!l3w.avatar && !!l3w.avatar.parent; out.camDist = l3.camera.position.distanceTo(l3w.p); out.joys = !!document.querySelector('.v3-joys:not(.hidden)');
      const a0 = l3w.p.clone(); key('keydown', 'KeyW'); await wait(500); key('keyup', 'KeyW'); out.walked = l3w.p.x - a0.x > 0.3; out.avFollows = Math.abs(l3w.avatar.position.x - l3w.p.x) < 1e-6 && Math.abs(l3w.avatar.position.y - l3w.p.y) < 1e-6;
      // hopp
      const z0 = l3w.p.z; l3wJump(); await wait(220); out.jumped = l3w.p.z - z0 > 0.25; await wait(900); out.landed = Math.abs(l3w.p.z - z0) < 0.05 && l3w.jz === 0;
      // huka
      key('keydown', 'KeyC'); await wait(500); out.crouched = z0 - l3w.p.z > 0.4; key('keyup', 'KeyC'); await wait(500); out.stood = Math.abs(l3w.p.z - z0) < 0.05;
      // joystick (framåt = upp på spaken)
      const j0 = l3w.p.x; l3w.jm.y = -1; await wait(400); l3w.jm.y = 0; out.joyMove = l3w.p.x - j0 > 0.3;
      // kollision: en vägg framför; spöke på går igenom, spöke av stoppas
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, 8, 4), new THREE.MeshBasicMaterial()); wall.position.set(l3w.p.x + 2.5, l3w.p.y, gz + 2); l3.groups.bldg.add(wall); wall.updateMatrixWorld(true);
      l3wSetGhost(false); l3w.speed = 4; key('keydown', 'KeyW'); await wait(1500); key('keyup', 'KeyW'); out.blockedX = l3w.p.x; out.wallX = wall.position.x; out.blocked = l3w.p.x < wall.position.x - 0.15;
      l3wSetGhost(true); key('keydown', 'KeyW'); await wait(1500); key('keyup', 'KeyW'); out.ghostThrough = l3w.p.x > wall.position.x + 0.2;
      l3.groups.bldg.remove(wall);
      // byt person med V
      key('keydown', 'KeyV'); await wait(200); key('keyup', 'KeyV'); out.first = l3w.person === 'first' && !l3w.avatar && l3.camera.position.distanceTo(l3w.p) < 1e-6;
      l3SetPref('walkPerson', 'first'); l3SetPref('walkJoy', false); l3SetPref('walkGhost', true); l3wExit(true); out.avGone = !l3w.avatar && !!document.querySelector('.v3-joys.hidden');
      return out;
    });
    if (!wk2.avatar || wk2.camDist < 2 || wk2.camDist > 3.4 || !wk2.joys || !wk2.walked || !wk2.avFollows || !wk2.jumped || !wk2.landed || !wk2.crouched || !wk2.stood || !wk2.joyMove || !wk2.blocked || !wk2.ghostThrough || !wk2.first || !wk2.avGone) fail('Gå-läge som Nira (3:e person, hopp, huka, kollision, joysticks): ' + JSON.stringify(wk2));
    else console.log('OK: gå-läge – tredje person med figur, hopp, huka, spöke/kollision, joysticks och V byter person');
    // Gå-läge: fordon i tredje person, hopp utan Följ marken, glid längs väggar och fall (solid mark).
    const wk3 = await page.evaluate(async () => {
      l3wInit(); const wait = ms => new Promise(r => setTimeout(r, ms)), key = (t, code) => document.body.dispatchEvent(new KeyboardEvent(t, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true }));
      l3SetPref('walkFollow', true); l3SetPref('navHelp', false); l3NavHelp(); l3SetPref('walkPerson', 'third'); l3SetPref('walkGhost', false); l3SetPref('walkJoy', false); l3SetPref('walkKind', 'crane');
      const gz = l3GroundZ(); l3wEnter(new THREE.Vector3(0, 0, gz)); l3w.yaw = 0; l3w.heading = 0; l3w.pitch = 0; l3wApply(); await wait(300);
      const out = {}; out.kind = l3w.kind; out.vehicle = !!l3w.cfg.vehicle; out.eye = l3w.eye; out.camFar = l3.camera.position.distanceTo(l3w.p) > 8; out.hasAv = !!l3w.avatar && l3w.avatar.children.length > 10;
      const x0 = l3w.p.x; key('keydown', 'KeyW'); await wait(900); key('keyup', 'KeyW'); out.drove = l3w.p.x - x0 > 0.8; out.travel = l3w.travel > 0.8;
      l3wWork(); await wait(1500); out.workOn = l3w.work > 0.7; l3wWork(); await wait(100);
      // fordon kan inte hoppa
      const z0 = l3w.p.z; l3wJump(); await wait(150); out.noJump = Math.abs(l3w.p.z - z0) < 0.05;
      // byt till byggare, hoppa utan Följ marken
      l3wSetKind('human'); out.human = l3w.kind === 'human' && Math.abs(l3w.eye - 1.7) < 1e-6; l3SetPref('walkFollow', false); l3w.settled = false; await wait(150);
      const y0 = l3w.p.z; l3wJump(); await wait(220); out.jumpNoFollow = l3w.p.z - y0 > 0.25; await wait(900); out.landNoFollow = Math.abs(l3w.p.z - y0) < 0.05;
      l3SetPref('walkFollow', true); l3w.settled = false; await wait(300);
      // schräg vägg: glid längs den i stället för att fastna (spöke av)
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 12, 4), new THREE.MeshBasicMaterial()); wall.position.set(l3w.p.x + 3, l3w.p.y, gz + 2); wall.rotation.z = 0.5; l3.groups.bldg.add(wall); wall.updateMatrixWorld(true);
      l3wSetGhost(false); l3w.speed = 3; l3w.yaw = 0; const p0 = l3w.p.clone(); key('keydown', 'KeyW'); for (let i = 0; i < 14 && Math.abs(l3w.p.y - p0.y) <= 0.9; i++) await wait(500); key('keyup', 'KeyW'); const d = l3w.p.clone().sub(p0);
      out.slid = Math.abs(d.y) > 0.8; out.notThrough = l3w.p.x < wall.position.x + 6 * Math.sin(0.5) + 0.4 && !(Math.abs(d.x) > 5.5);
      l3.groups.bldg.remove(wall);
      // fall från kant: marken 3 m ner (spöke av) ger fall, inte svävning
      l3wSetKind('own'); out.ownRefused = l3w.kind === 'human';
      l3SetPref('walkKind', 'human'); l3SetPref('walkGhost', true); l3wExit(true); out.gone = !l3w.avatar;
      return out;
    });
    if (wk3.kind !== 'crane' || !wk3.vehicle || wk3.eye < 3 || !wk3.camFar || !wk3.hasAv || !wk3.drove || !wk3.travel || !wk3.workOn || !wk3.noJump || !wk3.human || !wk3.jumpNoFollow || !wk3.landNoFollow || !wk3.slid || !wk3.notThrough || !wk3.ownRefused || !wk3.gone) fail('Gå-läge fordon/hopp/glid: ' + JSON.stringify(wk3));
    else console.log('OK: gå-läge – mobilkran i tredje person (kör, arbetsläge), hopp utan Följ marken, glid längs vägg, markerat objekt kräver markering');
    // Mobilkran och grävmaskin: stödben, bom, radie, kranpanel och reglage.
    const wk4 = await page.evaluate(async () => {
      l3wInit(); const wait = ms => new Promise(r => setTimeout(r, ms)), key = (t, code) => document.body.dispatchEvent(new KeyboardEvent(t, { code, key: code, bubbles: true, cancelable: true }));
      l3SetPref('walkFollow', true); l3SetPref('navHelp', false); l3NavHelp(); l3SetPref('walkPerson', 'third'); l3SetPref('walkGhost', true); l3SetPref('walkJoy', false); l3SetPref('walkKind', 'crane'); l3SetPref('walkRadius', true);
      const gz = l3GroundZ(); l3wEnter(new THREE.Vector3(0, 0, gz)); l3w.yaw = 0; l3w.heading = 0; l3w.pitch = 0; l3wApply(); await wait(300); const out = {};
      out.ctl0 = JSON.stringify(l3w.ctl); out.panelHidden = !document.querySelector('.v3-ctl:not(.hidden)');
      l3wWork(); out.panel = !!document.querySelector('.v3-ctl:not(.hidden)'); for (let i = 0; i < 40 && !(l3w.ctl.out >= 0.97 && l3w.ctl.ang >= 0.9 && l3w.ctl.ext >= 0.25); i++) await wait(500); const c = l3w.ctl;
      out.out = c.out; out.ang = c.ang; out.ext = c.ext; out.info = (l3w.info || []).map(x => x[0] + ':' + x[1]).join('|'); out.rings = l3w.avatar.children.some(ch => ch.type === 'Group' && ch.children.length > 10 && ch.visible);
      // utan stödben åker man inte, med stödben ute blockeras körning
      const x0 = l3w.p.x; key('keydown', 'KeyW'); await wait(500); key('keyup', 'KeyW'); out.blocked = Math.abs(l3w.p.x - x0) < 0.05;
      // reglage: pil upp höjer bommen, sväng, utskjut med +, lina med ]
      const a0 = l3w.ctlT.ang, s0 = l3w.ctlT.slew, e0 = l3w.ctlT.ext; key('keydown', 'ArrowDown'); await wait(500); key('keyup', 'ArrowDown'); out.angDown = l3w.ctlT.ang < a0 - 0.1;
      key('keydown', 'ArrowLeft'); await wait(600); key('keyup', 'ArrowLeft'); out.slew = l3w.ctlT.slew > s0 + 0.2; key('keydown', 'Equal'); await wait(600); key('keyup', 'Equal'); out.extUp = l3w.ctlT.ext > e0 + 0.05;
      await wait(1200); const R1 = (l3w.info.find(x => x[0] === 'Radie') || [])[1]; out.R1 = R1;
      // sliders: sätt bomvinkel via panelen
      const sl = document.querySelector('.v3-ctl [data-c="ang"]'); sl.value = 30; sl.dispatchEvent(new Event('input', { bubbles: true })); await wait(2500); out.sliderAng = Math.abs(l3w.ctl.ang - 30 * Math.PI / 180) < 0.08; const R2 = (l3w.info.find(x => x[0] === 'Radie') || [])[1]; out.radiusGrows = parseFloat(String(R2).replace(',', '.')) > parseFloat(String(R1).replace(',', '.'));
      // ta in: stödben och bom
      l3wWork(); for (let i = 0; i < 60 && !(l3w.ctl.out < 0.02 && l3w.ctl.ang < 0.1 && l3w.ctl.ext < 0.02); i++) await wait(500); out.stowed = l3w.ctl.out < 0.02 && l3w.ctl.ang < 0.1 && l3w.ctl.ext < 0.02;
      // grävmaskin
      l3wSetKind('excavator'); l3wWork(); const e1 = JSON.stringify(l3w.ctl); out.excPanel = !!document.querySelector('.v3-ctl:not(.hidden) [data-cb="auto"]'); document.querySelector('.v3-ctl [data-cb="auto"]').click(); await wait(2500); out.dig = JSON.stringify(l3w.ctl) !== e1 && l3w.auto; out.reach = (l3w.info || []).some(x => /Räckvidd/.test(x[0]));
      l3wSetKind('human'); out.hidden = !document.querySelector('.v3-ctl:not(.hidden)'); l3SetPref('walkKind', 'human'); l3wExit(true); return out;
    });
    if (!wk4.panelHidden || !wk4.panel || wk4.out < 0.97 || wk4.ang < 0.9 || wk4.ext < 0.25 || !wk4.rings || !/Radie/.test(wk4.info) || !wk4.blocked || !wk4.angDown || !wk4.slew || !wk4.extUp || !wk4.sliderAng || !wk4.radiusGrows || !wk4.stowed || !wk4.excPanel || !wk4.dig || !wk4.reach || !wk4.hidden) fail('Mobilkran/grävmaskin (stödben, bom, radie, panel, reglage): ' + JSON.stringify(wk4));
    else console.log('OK: mobilkran – stödben ut, bom upp, radie och höjd, kranpanel och tangenter, stödben in; grävmaskin – reglage och automatisk grävning');
    // Verktygshjul: håll Tab, dra åt ett håll, släpp – verktyget byts; ◎-knappen öppnar det som klickmeny.
    const wh = await page.evaluate(async () => {
      const wait = ms => new Promise(r => setTimeout(r, ms)), out = {}; if (typeof l3wExit === 'function' && l3w.on) l3wExit(); await wait(200);
      const cx = 600, cy = 400, mv = (x, y) => window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true }));
      mv(cx, cy); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })); await wait(100); out.open = !!document.querySelector('.l3wh') && document.querySelectorAll('.l3wh-it').length >= 10;
      mv(cx + 60, cy - 104); await wait(50); out.on = (document.querySelector('.l3wh-it.on') || {}).dataset && document.querySelector('.l3wh-it.on').dataset.k;
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', bubbles: true })); await wait(100); out.closed = !document.querySelector('.l3wh'); out.tool = l3.tool;
      document.querySelector('[data-v3tool="select"]').click(); l3whOpen(300, 300, true); await wait(100); out.btnOpen = !!document.querySelector('.l3wh');
      document.querySelector('.l3wh-it[data-k="measure"]').click(); await wait(100); out.btnPick = l3.tool === 'measure' && !document.querySelector('.l3wh'); document.querySelector('[data-v3tool="select"]').click();
      return out; });
    if (!wh.open || wh.on !== 'move' || !wh.closed || wh.tool !== 'move' || !wh.btnOpen || !wh.btnPick) fail('Verktygshjul: ' + JSON.stringify(wh));
    else console.log('OK: verktygshjul i 3D-editorn – håll Tab, dra åt ett håll och släpp; ◎-knappen som klickmeny');
    // Normal styrning i tredje person: W/S längs figurens riktning, A/D svänger – oberoende av hur vyn vridits.
    const wk5 = await page.evaluate(async () => {
      l3wInit(); const wait = ms => new Promise(r => setTimeout(r, ms)), key = (t, code) => document.body.dispatchEvent(new KeyboardEvent(t, { code, key: code.replace('Key', '').toLowerCase(), bubbles: true, cancelable: true }));
      l3SetPref('walkFollow', true); l3SetPref('navHelp', false); l3NavHelp(); l3SetPref('walkPerson', 'third'); l3SetPref('walkGhost', true); l3SetPref('walkJoy', false); l3SetPref('walkKind', 'human');
      const gz = l3GroundZ(); l3wEnter(new THREE.Vector3(0, 0, gz)); l3w.heading = 0; l3w.yaw = Math.PI / 2; l3w.pitch = 0; l3wApply(); l3w.lastLook = performance.now() + 60000; await wait(200); const out = {};
      const p0 = l3w.p.clone(); key('keydown', 'KeyW'); await wait(500); key('keyup', 'KeyW'); const d1 = l3w.p.clone().sub(p0); out.fwdOwn = d1.x > 0.4 && Math.abs(d1.y) < 0.05; // vyn tittar åt +y men figuren går åt +x
      const h0 = l3w.heading; key('keydown', 'KeyD'); await wait(500); key('keyup', 'KeyD'); out.turnsRight = l3w.heading < h0 - 0.5; out.stayedPut = l3w.p.distanceTo(p0.clone().add(d1)) < 0.05; // A/D svänger utan att gå sidledes
      const p1 = l3w.p.clone(), hh = l3w.heading; key('keydown', 'KeyS'); await wait(400); key('keyup', 'KeyS'); const d2 = l3w.p.clone().sub(p1); out.backOwn = d2.x * -Math.cos(hh) + d2.y * -Math.sin(hh) > 0.15 === false || (d2.x * Math.cos(hh) + d2.y * Math.sin(hh)) < -0.15;
      // kameran följer efter när man styr och inte tittat själv
      l3w.lastLook = 0; l3w.yaw = Math.PI; key('keydown', 'KeyW'); await wait(1500); key('keyup', 'KeyW'); const wrap = a => Math.atan2(Math.sin(a), Math.cos(a)); out.camFollows = Math.abs(wrap(l3w.heading - l3w.yaw)) < 0.5;
      // första person: blicken styr fortfarande (strafe)
      l3wSetPerson('first'); l3w.yaw = Math.PI / 2; l3w.pitch = 0; const q0 = l3.camera.position.clone(); key('keydown', 'KeyW'); await wait(500); key('keyup', 'KeyW'); const d3 = l3.camera.position.clone().sub(q0); out.firstView = d3.y > 0.4 && Math.abs(d3.x) < 0.1;
      l3SetPref('walkPerson', 'first'); l3wExit(true); return out;
    });
    if (!wk5.fwdOwn || !wk5.turnsRight || !wk5.stayedPut || !wk5.camFollows || !wk5.firstView) fail('Normal styrning i tredje person: ' + JSON.stringify(wk5));
    else console.log('OK: tredje person – normal styrning (W/S längs egen riktning, A/D svänger), kameran följer efter, första person styr efter blicken');
    // Inskrivna mått, lås fordonet, flyg runt och exportera som IFC; zoom i tredje person.
    const wk6 = await page.evaluate(async () => {
      l3wInit(); const wait = ms => new Promise(r => setTimeout(r, ms)); window.__vehKeep = true; window.__dl = null; const keepDl = window.downloadBlob; window.downloadBlob = (b, n) => { window.__dl = { b, n }; };
      l3SetPref('walkFollow', true); l3SetPref('navHelp', false); l3NavHelp(); l3SetPref('walkPerson', 'third'); l3SetPref('walkGhost', true); l3SetPref('walkJoy', false); l3SetPref('walkKind', 'crane'); l3SetPref('walkRadius', true);
      const gz = l3GroundZ(); l3wEnter(new THREE.Vector3(0, 0, gz)); l3w.yaw = 0; l3w.heading = 0; l3w.pitch = 0; l3wApply(); await wait(300); const out = {};
      // zooma ut i tredje person med hjulet
      const d0 = l3.camera.position.distanceTo(l3w.p); for (let i = 0; i < 4; i++) l3.renderer.domElement.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })); await wait(100); const d1 = l3.camera.position.distanceTo(l3w.p); out.zoomOut = d1 > d0 * 1.4; l3w.camMul = 1; l3wApply();
      l3wWork(); await wait(5200);
      // skriv in mått: bomlängd 20 m, radie 12 m
      const set = (sel, v) => { const i = document.querySelector(sel); i.value = v; i.dispatchEvent(new Event('change', { bubbles: true })); };
      set('[data-n="len"]', 20); for (let i = 0; i < 40; i++) { await wait(500); const q = parseFloat(String(((l3w.info || []).find(x => x[0] === 'Bomlängd') || [])[1]).replace(',', '.')); if (Math.abs(q - 20) < 0.3) break; } await wait(300); const len = parseFloat((l3w.info.find(x => x[0] === 'Bomlängd') || [])[1].replace(',', '.')); out.len = len;
      set('[data-n="rad"]', 12); for (let i = 0; i < 40; i++) { await wait(500); const q = parseFloat(String(((l3w.info || []).find(x => x[0] === 'Radie') || [])[1]).replace(',', '.')); if (Math.abs(q - 12) < 0.3) break; } await wait(300); const rad = parseFloat((l3w.info.find(x => x[0] === 'Radie') || [])[1].replace(',', '.')); out.rad = rad;
      set('[data-n="slew"]', 45); for (let i = 0; i < 40 && Math.abs(l3w.ctl.slew - Math.PI / 4) >= 0.05; i++) await wait(500); await wait(100); out.slew = Math.abs(l3w.ctl.slew - Math.PI / 4) < 0.05;
      // lås
      const gBefore = l3w.avatar; l3wLock(); out.locked = l3w.locked.length === 1 && !l3w.on && !!gBefore.parent && !!document.querySelector('.v3-lockp'); out.panelGone = !document.querySelector('.v3-ctl:not(.hidden)');
      const snap = JSON.stringify(l3w.locked[0].ctl); await wait(400); out.frozen = snap === JSON.stringify(l3w.locked[0].ctl);
      // IFC
      const r = await l3vIfcExport(l3w.locked[0], false); out.ifc = !!r && /\.ifc$/.test(r.name) && r.tris > 500; const txt = r && r.text || ''; out.radie = !!r && r.radie === true && (txt.match(/IFCBUILDINGELEMENTPROXY\(/g) || []).length === 2 && /Radie \(m\)/.test(txt) && r.tris > 3000; out.ifcHas = /IFCTRIANGULATEDFACESET/.test(txt) && /IFCSTYLEDITEM/.test(txt) && /IFCBUILDINGELEMENTPROXY\('[^']+',\$,'Mobilkran 1'/.test(txt) && txt.includes('Boml\\X2\\00E4\\X0\\ngd'); out.parts = r && r.parts;
      // flyg runt: orbit är på igen, kameran är fri; styr igen återtar
      out.orbit = l3.orbit.enabled === true; l3wLockResume(l3w.locked[0].id); out.resumed = l3w.on && l3w.kind === 'crane' && Math.abs(l3w.ctl.slew - Math.PI / 4) < 0.05 && l3w.workOn && l3w.locked.length === 0;
      l3wLock(); l3wLockRemove(l3w.locked[0].id); out.removed = !l3w.locked.length && !document.querySelector('.v3-lockp');
      window.downloadBlob = keepDl; l3SetPref('walkKind', 'human'); l3SetPref('walkPerson', 'first'); l3wExit(true); return out;
    });
    if (!wk6.zoomOut || Math.abs(wk6.len - 20) > 0.6 || Math.abs(wk6.rad - 12) > 0.8 || !wk6.slew || !wk6.locked || !wk6.panelGone || !wk6.frozen || !wk6.ifc || !wk6.radie || !wk6.ifcHas || !wk6.orbit || !wk6.resumed || !wk6.removed) fail('Inskrivna mått, lås, IFC, zoom: ' + JSON.stringify(wk6));
    else console.log('OK: zoom i 3:e person, inskrivna mått (bomlängd/radie/sväng), lås och flyg runt, IFC-export av exakta läget, styr igen');
    // Nederkanten: knappar för Status och Navigering (ingen knapp längre över bilden).
    const ft = await page.evaluate(() => {
      const L = () => document.getElementById('v3Legend'), N = () => document.getElementById('v3NavHelp'), bl = document.getElementById('v3FtLegend'), bn = document.getElementById('v3FtNav');
      if (!bl || !bn) return { missing: true };
      l3SetPref('legend', true); l3SetPref('navHelp', true); l3NavHelp(); L().classList.remove('hidden');
      const open0 = !!N().querySelector('.v3-nh-card') && bn.classList.contains('on') && !N().querySelector('.v3-nh-b');
      bn.click(); const closed = !N().querySelector('.v3-nh-card') && !bn.classList.contains('on') && l3Prefs().navHelp === false;
      bn.click(); const reopen = !!N().querySelector('.v3-nh-card') && bn.classList.contains('on');
      N().querySelector('.v3-nh-x').click(); const xclose = !N().querySelector('.v3-nh-card') && !bn.classList.contains('on');
      bl.click(); const legOff = L().classList.contains('hidden') && !bl.classList.contains('on') && l3Prefs().legend === false && document.getElementById('v3LegendChk').checked === false;
      bl.click(); const legOn = !L().classList.contains('hidden') && bl.classList.contains('on');
      bn.click(); return { open0, closed, reopen, xclose, legOff, legOn };
    });
    if (ft.missing || !ft.open0 || !ft.closed || !ft.reopen || !ft.xclose || !ft.legOff || !ft.legOn) fail('Status/Navigering i nederkanten: ' + JSON.stringify(ft));
    else console.log('OK: knappar för Status och Navigering längst ner (navigeringsrutan utan egen knapp över bilden)');
    // Synlig mellan datum, rörelsebana och följ banan (vrids efter färdriktningen).
    const vf = await page.evaluate(async () => {
      const O = l3.O, p = { id: 'vf1', type: 'tornkran', name: 'Lastbil', x: O[0], y: O[1], z: 0, L: 2, B: 2, H: 3, R: 0, rot: 0 };
      placements.push(p); const g = l3AddPlacementMesh(p); l3SelectIds(['vf1']);
      l3plSet('film', { ...l3plPrefs().film, strip: false, animPath: true }); l3fsToggle(true); await new Promise(r => setTimeout(r, 300));
      const D = iso => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)), at = (x, y, rot, date, vis) => { g.position.set(x - O[0], y - O[1], g.position.z); g.rotation.z = rot * Math.PI / 180; l3fs.vis = vis; return l3animCapture(date); };
      at(O[0], O[1], 0, '2026-10-10', true); at(O[0] + 10, O[1], 0, '2026-10-20', true); at(O[0] + 10, O[1] + 10, 0, '2026-10-30', false); l3fs.vis = true;
      l3fsRender(); const pathKids = l3.groups.anim ? l3.groups.anim.children.length : 0, marks = document.querySelectorAll('#v3FilmStrip .v3-fs-ak').length, off = document.querySelectorAll('#v3FilmStrip .v3-fs-ak.off').length;
      const sb = parseFloat(document.getElementById('v3Canvas').style.getPropertyValue('--v3-sb')) || 0, lift = l3.triadEl && parseFloat(getComputedStyle(l3.triadEl).bottom) >= sb + 5 && sb > 40;
      l3animApply(D('2026-10-15')); const vis1 = g.visible; l3animApply(D('2026-10-25')); const vis2 = g.visible; /* osynlig först från sista nyckeln */ l3animApply(D('2026-10-30')); const vis3 = g.visible;
      const face0 = Math.round(g.rotation.z * 180 / Math.PI);
      document.getElementById('v3FsFace').checked = true; document.getElementById('v3FsFace').dispatchEvent(new Event('change'));
      const on = p.animFace === true;
      l3animApply(D('2026-10-15')); const r1 = Math.round(g.rotation.z * 180 / Math.PI);
      l3animApply(D('2026-10-25')); const r2 = Math.round(g.rotation.z * 180 / Math.PI);
      l3animApply(D('2026-10-20')); const rk = Math.round(g.rotation.z * 180 / Math.PI);
      document.getElementById('v3FsPath').checked = false; document.getElementById('v3FsPath').dispatchEvent(new Event('change')); const hidden = l3.groups.anim.visible === false;
      l3animReset(); const back = g.visible === true;
      l3fsToggle(false); placements.splice(placements.indexOf(p), 1); l3.groups.places.remove(g); l3.placeMeshes.delete('vf1');
      return { lift, sb, pathKids, marks, off, vis1, vis2, vis3, face0, on, r1, r2, rk, hidden, back };
    });
    if (!vf.lift || vf.pathKids !== 2 || vf.marks !== 3 || vf.off !== 1 || !vf.vis1 || !vf.vis2 || vf.vis3 || vf.face0 !== 0 || !vf.on || vf.r1 !== 0 || vf.r2 !== 90 || Math.abs(vf.rk - 45) > 1 || !vf.hidden || !vf.back) fail('Synlig/bana/följ banan: ' + JSON.stringify(vf));
    else console.log('OK: objektanimering – synlig mellan datum, rörelsebana och följ banan (vrids efter färdriktningen)');
    // Sparade filmer: intervall, grafik, kameravyer och objektens animering sparas under ett namn och läses in igen.
    const hFilm = d => d.accept(d.type() === 'prompt' ? 'Testfilm' : undefined); page.__uiDialogHandlers.push(hFilm);
    const sf = await page.evaluate(async () => {
      const O = l3.O, p = { id: 'sf1', type: 'tornkran', name: 'Bil', x: O[0] + 2, y: O[1] + 2, z: 0, L: 2, B: 2, H: 5, R: 0, rot: 0, anim: [{ date: '2026-10-10', x: O[0] + 2, y: O[1] + 2, dz: 0, rot: 0 }, { date: '2026-10-20', x: O[0] + 9, y: O[1] + 2, dz: 0, rot: 90 }] };
      placements.push(p); const g = l3AddPlacementMesh(p);
      l3plSet('film', { ...l3plPrefs().film, sec: 33, fxMeter: false }); l3plKeysSet([{ date: '2026-10-12', name: 'Vy A', p: [1, 2, 3], t: [4, 5, 6] }]);
      await l3plFilmSave(); const saved = l3plFilms().length === 1 && l3plFilms()[0].name === 'Testfilm' && l3plFilms()[0].keys.length === 1 && l3plFilms()[0].anim.sf1.length === 2 && l3plFilms()[0].film.sec === 33;
      l3plSet('film', { ...l3plPrefs().film, sec: 5, fxMeter: true }); l3plKeysSet([]); delete p.anim;
      await l3plFilmLoad('Testfilm');
      const loaded = l3plPrefs().film.sec === 33 && l3plPrefs().film.fxMeter === false && l3plKeys().length === 1 && l3plKeys()[0].name === 'Vy A' && Array.isArray(p.anim) && p.anim.length === 2 && p.anim[1].rot === 90;
      const ui = !!document.getElementById('v3FlSaved') && document.getElementById('v3FlSaved').value === 'Testfilm' && !!document.getElementById('v3FlSavedDel');
      await l3plFilmDelete(); const gone = l3plFilms().length === 0;
      l3plKeysSet([]); l3plSet('film', { ...l3plPrefs().film, sec: 20, fxMeter: true });
      placements.splice(placements.indexOf(p), 1); l3.groups.places.remove(g); l3.placeMeshes.delete('sf1');
      return { saved, loaded, ui, gone };
    });
    page.__uiDialogHandlers.splice(page.__uiDialogHandlers.indexOf(hFilm), 1);
    if (!sf.saved || !sf.loaded || !sf.ui || !sf.gone) fail('Sparade filmer: ' + JSON.stringify(sf));
    else console.log('OK: sparade filmer – spara under namn, läs in (kameravyer och objektanimering följer med), ta bort');
    // Pågår nu: rubriken bara sista ledet, områdesnamnet bort från raderna.
    const hd = await page.evaluate(() => [l3fxAreaHead('Produktion / 743 Krosshall'), l3fxAreaHead('Excel · Produktion / 741 Sektionsfickor'), l3fxAreaHead('Hus A'),
      l3fxActText({ name: '743 Krosshall', area: 'Produktion / 743 Krosshall', objs: ['743 Krosshall - Bergstag', '743 Krosshall – Extra sprängning'] }),
      l3fxActText({ name: '741 Sektionsfickor SF2: Gjutning', area: 'Produktion / 741 Sektionsfickor', objs: [] })]);
    if (hd.join('|') !== '743 Krosshall|Excel · 741 Sektionsfickor|Hus A|Bergstag, Extra sprängning|SF2: Gjutning') fail('Pågår nu, rubrik/rader: ' + JSON.stringify(hd));
    else console.log('OK: Pågår nu – rubriken utan "Produktion /", raderna utan områdesnamnet');
    // 3D-färger i Powerproject-lägesplanen: Excel-kopplade objekt färgas också (Powerproject först), valbart.
    const cs = await page.evaluate(async () => {
      await l3plLoadX(); $('dateInput').value = '2026-10-12'; const ps0 = planSource, it0 = items; planSource = 'pp'; items = l3pl.rows;
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(18).fill(0), 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(18).fill(0), 3));
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial()), base = [0.85, 0.87, 0.9];
      mesh.userData.l3b = { origIdx: [0, 1, 2, 3, 4, 5], hidden: new Set(), ranges: [{ guid: '1hZq3$Bq9Fxu8nZK0bW1aA', start: 0, count: 3, base }, { guid: 'X1', start: 3, count: 3, base }] };
      const mdl = { id: 'mc', name: 'C.ifc', visible: true, meshes: [mesh] }; l3b.models.push(mdl);
      const col = i => [...geo.getAttribute('color').array.slice(i * 9, i * 9 + 3)].map(v => Math.round(v * 100)).join();
      const isBase = i => col(i) === base.map(v => Math.round(v * 100)).join();
      const res = {};
      for (const v of ['both', 'pp', 'excel']) { l3plSet('colorSrc', v); l3bRecolor(); res[v] = [isBase(0), isBase(1)]; }
      l3plSet('secOpen', { film: false, link: false, other: true }); l3plRenderTab(); const sel = !!document.getElementById('v3PlColorSrc'); l3plSet('secOpen', { film: true, link: true, other: true }); l3plRenderTab();
      l3plSet('colorSrc', 'both'); l3bRecolor(); l3b.models.splice(l3b.models.indexOf(mdl), 1); planSource = ps0; items = it0;
      return { ...res, sel, itemId: mesh.userData.l3b.ranges[0].itemId, xId: mesh.userData.l3b.ranges[1].itemId };
    });
    if (cs.both.join() !== 'false,false' || cs.pp.join() !== 'false,true' || cs.excel.join() !== 'true,false' || !cs.sel || cs.itemId !== 'p1' || cs.xId !== null) fail('3D-färger PP/Excel/båda: ' + JSON.stringify(cs));
    else console.log('OK: 3D-färgerna i Powerproject-lägesplanen tar med Excel-kopplade objekt (båda/PP/Excel)');
    // Ganttens 3D-lägen som i dashboarden: Alla / Kopplade / Okopplade / Tid (regler, färger, klart-opacitet, pulsering, markera pågående).
    const gm = await page.evaluate(async () => {
      await l3plLoadX(); const ps0 = planSource, it0 = items; planSource = 'pp'; items = l3pl.rows; l3plSet('colorSrc', 'pp'); l3plSet('gm', {});
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(new Array(27).fill(0), 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(27).fill(0), 3));
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial()), base = [0.85, 0.87, 0.9];
      mesh.userData.l3b = { origIdx: [0, 1, 2, 3, 4, 5, 6, 7, 8], hidden: new Set(), ranges: [{ guid: '1hZq3$Bq9Fxu8nZK0bW1aA', start: 0, count: 3, base }, { guid: '2hZq3$Bq9Fxu8nZK0bW1aA', start: 3, count: 3, base }, { guid: 'ZZZ', start: 6, count: 3, base }] };
      const mdl = { id: 'mg', name: 'G.ifc', visible: true, meshes: [mesh] }; l3b.models.push(mdl);
      const u = mesh.userData.l3b, off = () => [...(u.tempOff || [])].sort().join(), rgb = i => [...geo.getAttribute('color').array.slice(i * 9, i * 9 + 3)].map(v => Math.round(v * 255));
      const hex = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
      const R = {};
      l3plSetDay('2026-10-12'); l3bRecolor();
      R.all = off();
      l3gmSetMode('isolate', true); R.iso = off();
      l3gmSetMode('hide', true); R.hide = off();
      l3gmSetMode('off', true); R.back = off();
      l3gmSetMode('time', true); l3plSetDay('2026-10-12'); l3bRecolor();
      R.t1 = { off: off(), col: rgb(0), want: hex(phaseColor('pagaende')), act: l3gm.act.length };
      // Återställ: Originalvyn – modellens egna färger, inget dolt, läget Alla; ✕ tillbaka ger 4D-färgerna igen.
      l3Original(true); R.orig = { col: rgb(0), off: off(), mode: l3gm.mode, flag: l3b.orig, pill: !!document.getElementById('v3OrigPill') }; l3Original(false); R.origBack = { col: rgb(0), flag: l3b.orig, pill: !!document.getElementById('v3OrigPill') };
      l3gmSetMode('time', true); l3plSetDay('2026-10-12'); l3bRecolor();
      const pr0 = l3pl.rows.map(r => r.progress); l3pl.rows.forEach(r => { r.progress = 0; }); l3plSetDay('2026-10-01'); l3bRecolor(); R.t0 = off();               // före start (0 %), Kommande av: släckt
      l3gmSet('future', true); l3bRecolor(); R.tf = { off: off(), col: rgb(0), want: hex(phaseColor('planerad')) };
      // Klart: opacitet från Klart-reglaget, eller objektets egen färg/opacitet efter slut.
      l3pl.rows.forEach((r, i) => { r.progress = pr0[i]; });
      const rows = l3pl.rows; const p1 = rows.find(r => r.id === 'p1'), p2 = rows.find(r => r.id === 'p2'); const sv = [p1.progress, p2.progress];
      p1.progress = 100; p2.progress = 100; l3plSetDay('2026-11-30'); l3gmSet('doneOp', 30); l3bRecolor();
      R.done = { off: off(), alpha: [...(u.gAlpha || [])].map(([i, a]) => i + ':' + a).join(), ghosts: (u.ghosts || []).length };
      p1.done_color = '#ff0000'; p1.done_opacity = 55; l3bRecolor(); R.own = { col: rgb(0), alpha: u.gAlpha.get(0) }; delete p1.done_color; delete p1.done_opacity;
      l3gmSet('doneOp', 0); l3bRecolor(); R.zero = off();
      l3gmSet('doneOp', 30); p1.progress = sv[0]; p2.progress = sv[1];
      // Pulsera + Markera pågående
      l3plSetDay('2026-10-12'); l3gmSet('pulse', true); l3gmSet('selAct', true); window.__sel = null; l3bRecolor();
      R.sel = (window.__sel || []).length; // l3bsSet är ersatt av en provfunktion längre upp
      const c1 = rgb(0).join(); await new Promise(r => setTimeout(r, 450)); const c2 = rgb(0).join(); await new Promise(r => setTimeout(r, 450)); const c3 = rgb(0).join();
      R.pulse = [c1, c2, c3].some(c => c !== c1) && !!l3gm.pulseIv;
      l3gmSet('pulse', false); l3gmSet('selAct', false); l3gmPulseStop();
      // Gränssnittet: raden, tidsraden, dragstrecket
      const dock0 = l3pl.dock, view0 = l3plPrefs().view; if (!l3pl.dock) l3plDockToggle(true); l3plSet('view', 'board'); l3plDockRender();
      R.ui = { seg: document.querySelectorAll('#v3GmSeg [data-gmode]').length, time: !!document.getElementById('v3GmTime'), scrub: !!document.querySelector('#v3PlanDock .v3-gscrub'), cols: (() => { l3gmMenuOpen(document.getElementById('v3GmMenuBtn')); const n = document.querySelectorAll('#v3GmMenu [data-tcol]').length; document.getElementById('v3GmMenu').remove(); return n; })(), step: !!document.getElementById('v3GmPrev') && !!document.getElementById('v3GmNext'), sum: document.getElementById('v3GmSum').textContent, btns: ['v3GaRefresh', 'v3GaLoadModels', 'v3GaPpExport'].every(id => !!document.getElementById(id)) };
      const sl = document.getElementById('v3GmSlider'); sl.value = Number(sl.value) + 3; sl.dispatchEvent(new Event('input')); R.slid = $('dateInput').value;
      l3gmMenuOpen(document.getElementById('v3GmMenuBtn')); const col = document.querySelector('#v3GmMenu [data-tcol="pagaende"]'); col.value = '#00ff00'; col.dispatchEvent(new Event('input')); R.colSet = settings.statusColors.pagaende; settings.statusColors.pagaende = '#f5a623'; // tillbaka
      { const d0 = $('dateInput').value; document.getElementById('v3GmNext').click(); const d1 = $('dateInput').value; document.getElementById('v3GmPrev').click(); R.stepd = [d0, d1, $('dateInput').value]; }
      { const op = document.querySelector('#v3GmMenu [data-topc="pagaende"]'); op.value = 50; op.dispatchEvent(new Event('input')); R.op50 = l3gmCfg().ops.pagaende; op.value = 0; op.dispatchEvent(new Event('input')); R.op0 = l3gmRange([l3pl.rows.find(r => r.id === 'p1')], '2026-10-12', null); op.value = 100; op.dispatchEvent(new Event('input')); document.getElementById('v3GmMenu').remove(); }
      l3gmSetMode('off', true); R.gone = !document.getElementById('v3GmTime') && !document.querySelector('.v3-gscrub');
      if (!dock0) l3plDockToggle(false); l3plSet('view', view0 || 'board');
      l3b.models.splice(l3b.models.indexOf(mdl), 1); planSource = ps0; items = it0; l3plSet('colorSrc', 'both'); l3plSet('gm', {}); l3bRecolor();
      return R;
    });
    if (gm.orig.col.join() !== [217, 222, 229].join() || gm.orig.off !== '' || gm.orig.mode !== 'off' || !gm.orig.flag || !gm.orig.pill || gm.origBack.flag || gm.origBack.pill || gm.origBack.col.join() === [217, 222, 229].join()) fail('Återställ till original: ' + JSON.stringify([gm.orig, gm.origBack]));
    if (gm.all !== '' || gm.iso !== '2' || gm.hide !== '0,1' || gm.back !== '' || gm.t1.off !== '2' || gm.t1.col.join() !== gm.t1.want.join() || gm.t1.act < 1 || gm.t0 !== '0,1,2' || gm.tf.off !== '2' || gm.tf.col.join() !== gm.tf.want.join()
      || gm.done.off !== '2' || !/^0:0\.3,1:0\.3$/.test(gm.done.alpha) || gm.own.col.join() !== '255,0,0' || gm.own.alpha !== 0.55 || gm.zero !== '0,1,2' || gm.sel < 1 || !gm.pulse
      || gm.ui.seg !== 4 || !gm.ui.time || !gm.ui.scrub || gm.ui.cols !== 4 || !gm.ui.step || !gm.stepd || gm.stepd[1] !== new Date(Date.parse(gm.stepd[0]) + 86400000).toISOString().slice(0, 10) || gm.stepd[2] !== gm.stepd[0] || gm.op50 !== 50 || !gm.op0 || gm.op0.off !== true || !/klara .* pågår .* försenade .* kvar/.test(gm.ui.sum) || !gm.ui.btns || gm.slid <= '2026-10-12' || gm.colSet !== '#00ff00' || !gm.gone)
      fail('Ganttens 3D-lägen: ' + JSON.stringify(gm));
    else console.log('OK: Ganttens 3D-lägen – Alla/Kopplade/Okopplade/Tid, Klart-opacitet, egen färg efter slut, pulsera, markera pågående, tidsrad och dragstreck');
    // Export till Powerproject (MS Project-XML) och Läs in modeller – som i dashboardens Gantt.
    const px = await page.evaluate(async () => {
      const R = {}; let blobText = null, name = null; const dl0 = downloadBlob; downloadBlob = (b, n) => { name = n; b.text().then(t => { blobText = t; }); };
      l3gaPpExport(); const w = document.querySelector('.v3-ga-dlg');
      R.scopes = [...w.querySelectorAll('input[name=ppxScope]')].map(i => i.value + (i.disabled ? '-' : '+')).join();
      w.querySelector('input[value=all]').click(); w.querySelector('#ppxPreds').click(); R.links = w.querySelector('#ppxLinks').textContent;
      w.querySelector('.ppx-go').click(); await new Promise(r => setTimeout(r, 300)); downloadBlob = dl0;
      R.name = name; R.xml = blobText || '';
      // Läs in modeller: bara de som saknas, via listan från TC.
      l3pl.rows[0].model_id = 'M-1'; l3pl.rows[1].model_id = 'M-2';
      const ask0 = askOpener, bl0 = l3bLoad; let loaded = null;
      askOpener = async (t) => (t === 'ifcModelsList' ? { models: [{ id: 'M-1', name: 'A.ifc', version: 'v1' }] } : {}); l3bLoad = async list => { loaded = list.map(x => x.id); };
      await l3gmLoadModels(null);
      askOpener = ask0; l3bLoad = bl0; delete l3pl.rows[0].model_id; delete l3pl.rows[1].model_id;
      R.loaded = loaded;
      return R;
    });
    if (px.scopes !== 'own-,marked-,shown+,all+' || !/aktiviteter/.test(px.links) || px.name !== '4D-aktiviteter ' + new Date().toISOString().slice(0, 10) + '.xml' && !/^4D-aktiviteter \d{4}-\d\d-\d\d\.xml$/.test(px.name || '')
      || !px.xml.includes('<Project xmlns="http://schemas.microsoft.com/project">') || !px.xml.includes('Fasadmontage') || !px.xml.includes('<PredecessorLink>') || !px.xml.includes('<Summary>1</Summary>') || !px.xml.includes('Hus A') || JSON.stringify(px.loaded) !== '["M-1"]')
      fail('Export till Powerproject / Läs in modeller: ' + JSON.stringify({ ...px, xml: px.xml.slice(0, 300) }));
    else console.log('OK: Export till Powerproject (XML med områden, aktiviteter och beroenden) och Läs in modeller');
    // Ctrl-klick på flera aktiviteter: markeras tillsammans, raden "N markerade", Esc rensar.
    const mu = await page.evaluate(async () => {
      const dock0 = l3pl.dock; if (!l3pl.dock) l3plDockToggle(true); l3plSet('view', 'board'); l3plDockRender(); window.__sel = null;
      const els = [...document.querySelectorAll('#v3PlanDock [data-plk]')].slice(0, 2); const R = { avail: els.length, dlg: [...document.querySelectorAll('.ui-dlg-wrap')].map(w => w.className) }; const ee0 = l3plEntsOf; l3plEntsOf = () => [{ g: 1 }];
      els.forEach(el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })));
      R.size = l3pl.multi.size; R.marked = document.querySelectorAll('#v3PlanDock .v3-multisel').length; R.bar = (document.getElementById('v3MultiN') || {}).textContent;
      R.sel = (window.__sel || []).length;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      R.after = { size: l3pl.multi.size, bar: !!document.getElementById('v3MultiBar') };
      l3plEntsOf = ee0; if (!dock0) l3plDockToggle(false);
      return R;
    });
    if (mu.avail < 2 || mu.size !== 2 || mu.marked !== 2 || mu.bar !== '2 markerade' || mu.sel < 1 || mu.after.size !== 0 || mu.after.bar) fail('Ctrl-markering av flera aktiviteter: ' + JSON.stringify(mu));
    else console.log('OK: Ctrl-klick på flera aktiviteter – markeras tillsammans, "N markerade"-rad, Esc rensar');
    // Reglaget i fotraden (alltid tillgängligt): flyttar datumet, ‹ › en dag.
    const fsl = await page.evaluate(async () => {
      const sl = document.getElementById('v3DSlider'); if (!sl) return { none: true };
      const d0 = $('dateInput').value; l3SyncDate(); const max = Number(sl.max);
      sl.value = Math.min(max, Number(sl.value) + 5); sl.dispatchEvent(new Event('input')); await new Promise(r => setTimeout(r, 250)); sl.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 150));
      const d1 = $('dateInput').value; document.getElementById('v3DNext').click(); await new Promise(r => setTimeout(r, 100)); const d2 = $('dateInput').value;
      document.getElementById('v3DPrev').click(); document.getElementById('v3DPrev').click(); const d3 = $('dateInput').value;
      $('dateInput').value = d0; $('dateInput').dispatchEvent(new Event('change')); l3SyncDate();
      return { d0, d1, d2, d3, max };
    });
    const dd = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
    if (fsl.none || dd(fsl.d0, fsl.d1) < 1 || dd(fsl.d1, fsl.d2) !== 1 || dd(fsl.d2, fsl.d3) !== -2) fail('Tidsreglaget i fotraden: ' + JSON.stringify(fsl));
    else console.log('OK: tidsreglaget i fotraden – alltid tillgängligt, ‹ › en dag');
    console.log('OK: 4D-koppling – Powerproject, Excel eller båda; Excel-raderna skyddade mot redigering här');
    // Pågående objekt: gul kontur (val under 4D-planering), av = borta.
    const act = await page.evaluate(async () => {
      const orig = window.l3actActive; window.l3actActive = () => true; // alla kopplade räknas som pågående i testet
      placements = [{ id: 'tp1', type: 'bod', name: 'Bod', x: 6512340, y: 150105, z: 0, L: 8, B: 3, H: 2.7, rot: 0, dz: 0, color: '#f59e0b', itemId: 'p1' }]; l3BuildPlacements();
      l3SetPref('actOutline', true); l3actRebuild();
      await new Promise(r => setTimeout(r, 900));
      const dbg = { models: l3b.models.map(m => [m.visible, m.meshes.length, m.meshes.map(x => !!(x.userData.l3b && x.userData.l3b.ranges && x.userData.l3b.ranges.length) + ':' + x.visible)]), cnt: l3act.count, prefs: l3Prefs().actOutline, edges: typeof l3bsObjEdges };
      const on = l3act.ov.length, lines = l3act.ov.every(o => o.isLineSegments && o.parent), col = l3act.ov[0] && l3act.ov[0].material.color.getHex();
      l3SetPref('actOutline', false); l3actRebuild();
      const off = l3act.ov.length;
      window.l3actActive = orig;
      return { on, lines, col, off, dbg };
    });
    if (!(act.on > 0) || !act.lines || act.col !== 0xffc400 || act.off !== 0) fail('Pågående objekt – gul kontur: ' + JSON.stringify(act));
    console.log('OK: pågående objekt får en gul kontur (val), av = borta');
    { const tmp = await page.evaluate(() => { const r = { id: 'tx', start_date: '2026-10-01', end_date: '2026-12-31', progress: 10, temporary: true }; return { temp: l3actActive(r, '2026-10-12'), normal: l3actActive({ ...r, temporary: false }, '2026-10-12') }; });
      if (tmp.temp !== false || tmp.normal !== true) fail('Gul kontur ska inte gälla temporära objekt: ' + JSON.stringify(tmp));
      console.log('OK: gul kontur gäller inte temporära objekt'); }
    // Info-bubblor i 3D-editorn: ett kort per aktivitet med namn, datum, framdrift, område och aktivitet.
    const bub = await page.evaluate(async () => {
      const row = items.find(r => r.start_date) || (items.push({ id: 'zz1', object_name: 'Test', start_date: '2026-10-01', end_date: '2026-10-09' }), items[items.length - 1]);
      placements = [{ id: 'tp1', type: 'bod', name: 'Bod', x: 6512340, y: 150105, z: 0, L: 8, B: 3, H: 2.7, rot: 0, dz: 0, color: '#f59e0b', itemId: row.id }]; l3BuildPlacements();
      row.progress = 40; row.end_date = '2026-12-31'; row.area = 'PRODUKTION / 741 Hus'; row.activity = 'Betong';
      l3SetPref('bubFields', { area: true, activity: true }); l3SetPref('bubScope', 'all'); l3SetPref('bubOn', true); l3bub.sig = ''; l3RenderLabels();
      await new Promise(r => setTimeout(r, 300));
      let err = ''; try { l3bubRebuild(); } catch (e) { err = String(e && e.stack || e).slice(0, 300); }
      const n0 = l3bub.anchors.length, a0 = l3bub.anchors[0];
      if (a0) { l3.camera.position.set(a0.v.x + 12, a0.v.y - 12, a0.v.z + 9); l3.camera.up.set(0, 0, 1); l3.camera.lookAt(a0.v); l3.camera.updateMatrixWorld(true); l3.camera.updateProjectionMatrix(); l3bub.sig = ''; l3RenderLabels(); }
      const el = document.querySelector('#v3Bubbles .v3-bub'); const txt = el ? el.innerText : '';
      const e0 = row.end_date; row.end_date = '2026-10-01'; l3bub.sig = ''; l3RenderLabels(); const past = document.querySelectorAll('#v3Bubbles .v3-bub').length; row.end_date = e0; // slutdatum passerat: ingen bubbla
      l3SetPref('bubScope', 'marked'); l3bub.sig = ''; l3RenderLabels(); const marked = document.querySelectorAll('#v3Bubbles .v3-bub').length;
      l3SetPref('bubOn', false); l3RenderLabels(); const off = document.querySelectorAll('#v3Bubbles .v3-bub').length;
      return { txt, marked, off, past, n: n0, err, dbg0: { pm: l3.placeMeshes.size, vis: [...l3.placeMeshes.values()].map(g => g.visible), pl: placements.length, row: { id: row.id, sd: row.start_date }, scope: l3bubCfg().scope, on: l3bubOn(), temp: typeof rowTempOffAt === 'function' && rowTempOffAt(row, $('dateInput').value || todayIso()) } };
    });
    if (!/\d+ %/.test(bub.txt) || !/PRODUKTION \/ 741 Hus/.test(bub.txt) || !/Betong/.test(bub.txt) || bub.marked !== 0 || bub.off !== 0 || bub.past !== 0) fail('Info-bubblor i 3D-editorn: ' + JSON.stringify(bub));
    console.log('OK: info-bubblor i 3D-editorn – namn, datum, framdrift, område, aktivitet; urval; av');
    // Bubblorna som val i filmens grafik: ritas i filmbilden (canvas) med kort och ledlinje.
    const fb = await page.evaluate(() => {
      l3SetPref('bubScope', 'all'); l3plSet('film', { ...l3plPrefs().film, fxBubbles: true }); const o = l3fxOpts().bub;
      const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720; const ctx = cv.getContext('2d');
      l3fxBubbles(ctx, 1280, 720, 720 / 1080); const d = ctx.getImageData(0, 0, 1280, 720).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      l3plRenderTab(); const chip = !!document.getElementById('v3FlFxBub'); l3plSet('film', { ...l3plPrefs().film, fxBubbles: false });
      return { o, n, chip };
    });
    if (!fb.o || fb.n < 500 || !fb.chip) fail('Bubblor i filmens grafik: ' + JSON.stringify(fb));
    console.log('OK: bubblor som val under Grafik i filmen – ritas i filmbilden');
    // Valen finns i fliken.
    const ui = await page.evaluate(() => { l3PalTab('plan'); l3plRenderTab(); return ['v3FlFxNow', 'v3FlFxGlow', 'v3FlFxMiles', 'v3FlFxMeter', 'v3FlFxBl', 'v3FlFxLegend', 'v3FlAnimDef', 'v3PlLinkHost', 'v3FlTitleOn'].every(id => document.getElementById(id)); });
    if (!ui) fail('Valen för grafiken saknas i fliken');
    // Animering per aktivitet väljs i aktivitetens redigeringsdialog (ersätter Animering-kortet); standarden finns kvar i Film.
    const anx = await page.evaluate(async () => {
      l3PalTab('plan'); l3plSet('film', { ...l3plPrefs().film, anim: {} }); l3plSet('secOpen', { film: true, link: true, other: true }); l3plRenderTab();
      const card = !!document.querySelector('.v3-pl-anim, [data-animx]'), def = !!document.getElementById('v3FlAnimDef');
      const act = l3plActs(l3gaP().split)[0]; l3gaEdit(act.key); await new Promise(r => setTimeout(r, 50));
      const sel = document.querySelector('.v3-ga-dlg [data-f="anim"]'); if (!sel) return { noSel: true, card, def };
      sel.value = 'grow'; document.querySelector('.v3-ga-dlg .ui-dlg-ok').click(); await new Promise(r => setTimeout(r, 300));
      const saved = ((l3plPrefs().film.anim || {}).by || {})['k:' + act.key];
      const fa = l3plFilmActs().find(x => x.key === act.key), t0 = fa ? l3fxAnimType(fa) : null;
      l3gaEdit(act.key); await new Promise(r => setTimeout(r, 50)); const again = document.querySelector('.v3-ga-dlg [data-f="anim"]').value; document.querySelector('.v3-ga-dlg .ui-dlg-cancel').click();
      // Förhandsvisning utanför filmen: valet ger en animering som byggs för det dragna datumet.
      l3fsAnimPreview(); await new Promise(r => setTimeout(r, 400)); const prev = !!l3fs.fx && l3fs.fx.anim.some(x => x.type === 'grow' && x.a.key === act.key);
      return { card, def, saved, t0, again, prev };
    });
    if (anx.noSel || anx.card || !anx.def || anx.saved !== 'grow' || (anx.t0 !== null && anx.t0 !== 'grow') || anx.again !== 'grow' || !anx.prev) fail('Animering per aktivitet i redigeringsdialogen: ' + JSON.stringify(anx));
    else console.log('OK: animering – väljs per aktivitet i redigeringsdialogen (Animering-kortet borttaget), standard kvar under Film');
    // Följ datum (strikt) och Färgskala efter datum (egna färger).
    const sc = await page.evaluate(() => {
      const rows = l3pl.rows.filter(r => r.start_date).slice().sort((a, b) => a.start_date.localeCompare(b.start_date)), lo = rows[0], hi = rows[rows.length - 1];
      l3gmSet('strict', true); l3gmBegin(); const pr = { before: l3gmPhaseRow({ start_date: '2026-10-05', end_date: '2026-10-09', progress: 100, status: 'klar' }, '2026-10-07'), early: l3gmPhaseRow({ start_date: '2026-10-05', end_date: '2026-10-09', progress: 0 }, '2026-10-04'), after: l3gmPhaseRow({ start_date: '2026-10-05', end_date: '2026-10-09', progress: 0 }, '2026-10-10') };
      l3gmSet('strict', false); l3gmSet('scale', true); l3gmSet('scaleBy', 'start'); l3gmSet('scaleA', '#ff0000'); l3gmSet('scaleB', '#0000ff'); l3gmBegin();
      const c0 = l3gmScaleRgb([lo]), c1 = l3gmScaleRgb([hi]); const mode = l3gm.mode; l3gm.mode = 'off'; const off = l3gmRange([lo], '2026-10-12', null); l3gm.mode = mode;
      l3gmSet('scale', false); l3gmBegin(); return { pr, c0, c1, off, none: l3gm.scale };
    });
    if (sc.pr.before !== 'pagaende' || sc.pr.early !== 'planerad' || sc.pr.after !== 'klar' || Math.round(sc.c0[0]) !== 1 || Math.round(sc.c1[2]) !== 1 || !sc.off || sc.off.phase !== 'scale' || sc.none !== null) fail('Följ datum / Färgskala: ' + JSON.stringify(sc));
    else console.log('OK: Följ datum (strikt) och Färgskala efter datum med egna färger');
    // Foto: kameraknappen bredvid inspelningsknappen sparar en högupplöst PNG av 3D-vyn.
    { await page.evaluate(() => { l3plSet('film', { ...l3plPrefs().film, strip: true }); l3fsRender(); });
      const btn = await page.$('#v3FsPhoto'); if (!btn) fail('Kameraknappen saknas bredvid inspelningsknappen');
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), page.evaluate(() => document.getElementById('v3FsPhoto').click())]);
      const path = await dl.path(), fsm = require('fs'), buf = fsm.readFileSync(path), w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
      if (buf.slice(1, 4).toString() !== 'PNG' || Math.max(w, h) < 1280) fail('Fotot ska vara en PNG i hög upplösning: ' + JSON.stringify({ w, h, name: dl.suggestedFilename() }));
      console.log('OK: kameraknappen tar ett foto i hög upplösning (' + w + '×' + h + ' PNG)');
      await page.evaluate(() => { l3plSet('film', { ...l3plPrefs().film, strip: false }); l3fsRender(); }); }
    // Dölj knappar på Gantten (3D-editorn): bara tidsraden och knappen för att visa dem igen finns kvar.
    { const hb = await page.evaluate(async () => {
        if (!l3pl.dock) l3plDockToggle(true); await new Promise(r => setTimeout(r, 200));
        const vis = sel => { const e = document.querySelector('#v3PlanDock ' + sel); return !!e && getComputedStyle(e).display !== 'none' && e.offsetParent !== null; };
        const before = { row2: vis('.v3-ga-row2'), search: vis('#v3PlQ'), hide: vis('#v3GaHide') };
        document.getElementById('v3GaHide').click(); await new Promise(r => setTimeout(r, 200));
        const hidden = { row2: vis('.v3-ga-row2'), search: vis('#v3PlQ'), hide: vis('#v3GaHide'), close: vis('#v3PlClose'), txt: document.getElementById('v3GaHide').getAttribute('aria-label'), cls: document.getElementById('v3PlanDock').classList.contains('v3-hidebtns') };
        document.getElementById('v3GaHide').click(); await new Promise(r => setTimeout(r, 200));
        const back = { row2: vis('.v3-ga-row2'), search: vis('#v3PlQ') };
        return { before, hidden, back };
      });
      if (!hb.before.row2 || !hb.before.search || !hb.before.hide || hb.hidden.row2 || hb.hidden.search || !hb.hidden.hide || !hb.hidden.close || hb.hidden.txt !== 'Visa knappar' || !hb.hidden.cls || !hb.back.row2 || !hb.back.search) fail('Dölj knappar på Gantten: ' + JSON.stringify(hb));
      console.log('OK: Dölj knappar på Gantten i 3D-editorn'); }
    { const wd = await page.evaluate(() => { l3plSet('period', '4w'); l3plDockRender(); const d = document.getElementById('v3PlanDock'), b = d.querySelector('.v3-pl-board'); return { dock: d.clientWidth, board: b ? b.scrollWidth : 0 }; });
      if (!wd.board || wd.board < wd.dock - 70 || wd.board > wd.dock + 10) fail('Gantten ska täcka hela bredden: ' + JSON.stringify(wd));
      console.log('OK: Gantten fyller hela bredden i 3D-editorn (' + wd.board + ' av ' + wd.dock + ' px)'); }
    // Startvy: exakt det som är ikryssat/inställt när man sparar läggs tillbaka (kamera, datum, 3D-läge, visningsval, färger).
    { page.__uiDialogHandlers.push(d => d.accept());
      const sv = await page.evaluate(async () => {
        l3plSetDay('2026-10-12'); l3gmSetMode('time', true); l3SetPref('bubOn', true); l3SetPref('bubProg', 'plan'); l3plSet('film', { ...l3plPrefs().film, sec: 41 });
        settings.statusColors = { ...(settings.statusColors || {}), pagaende: '#12ab34' };
        l3.camera.position.set(l3.camera.position.x + 3, l3.camera.position.y + 3, l3.camera.position.z + 2); l3.orbit.update();
        const camSaved = l3.camera.position.toArray().map(v => Math.round(v * 100) / 100);
        await l3StartSave(); const saved = !!l3StartGet() && !!document.getElementById('v3SvStart');
        // Ändra allt, "öppna om" och kontrollera att startvyn lägger tillbaka det.
        l3gmSetMode('off', true); l3plSetDay('2026-10-20'); l3SetPref('bubOn', false); l3SetPref('bubProg', 'calc'); l3plSet('film', { ...l3plPrefs().film, sec: 7 }); settings.statusColors.pagaende = '#000000';
        l3.camera.position.set(1, 2, 3); l3.orbit.update();
        window.__l3StartPrefs = false; window.__l3StartApplied = false;
        l3StartApplyPrefs(); await l3StartApply(); await new Promise(r => setTimeout(r, 2500));
        const camNow = l3.camera.position.toArray().map(v => Math.round(v * 100) / 100);
        const r = { saved, date: $('dateInput').value, mode: l3gm.mode, bub: l3Prefs().bubOn, prog: l3Prefs().bubProg, sec: l3plPrefs().film.sec, col: settings.statusColors.pagaende, camSaved, camNow, views: l3SavedViews().filter(v => v.name === 'Startvy').length };
        l3StartClear(); r.cleared = !l3StartGet(); return r;
      });
      if (!sv.saved || sv.date !== '2026-10-12' || sv.mode !== 'time' || !sv.bub || sv.prog !== 'plan' || sv.sec !== 41 || sv.col !== '#12ab34' || sv.views !== 0 || !sv.cleared || Math.abs(sv.camNow[0] - sv.camSaved[0]) > 1.5) fail('Startvy: ' + JSON.stringify(sv));
      console.log('OK: startvy – kamera, datum, 3D-läge, visningsval och färger läggs tillbaka (och kan tas bort)');
      page.__uiDialogHandlers.length = 0; }
    // Dra i veckoraden (alltid synlig) = flytta datumet var som helst i Gantten; procenten ligger i statusraden, handtaget följer med.
    { await page.evaluate(async () => { if (!l3pl.dock) l3plDockToggle(true); l3plSet('period', '4w'); l3gmSetMode('time', true); l3plDockRender(); await new Promise(r => setTimeout(r, 300)); });
      const geo = await page.evaluate(() => { const b = document.querySelector('#v3PlanDock .v3-pl-board'), w = b.querySelector('.v3-pl-weeks').getBoundingClientRect(); return { x: w.left, y: w.top + w.height / 2, head: parseFloat(getComputedStyle(b).getPropertyValue('--head')) || 170, dpx: Number(b.dataset.daypx), w0: b.dataset.w0, d0: l3plDay() }; });
      await page.evaluate(([x, y]) => { const wk = document.querySelector('#v3PlanDock .v3-pl-weeks'), ev = (t, cx) => wk.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, clientX: cx, clientY: y, pointerId: 1, button: 0 })); ev('pointerdown', x); ev('pointermove', x + 3); ev('pointerup', x + 3); }, [geo.x + geo.head + 9.5 * geo.dpx, geo.y]); await page.waitForTimeout(300);
      const after = await page.evaluate(() => ({ bound: !!document.querySelector('#v3PlanDock .v3-pl-weeks').onpointerdown, mode: l3gm.mode, scrub: !!document.querySelector('#v3PlanDock .v3-gscrub'), d: l3plDay(), sticky: getComputedStyle(document.querySelector('#v3PlanDock .v3-gscrub-h')).position, pc: document.querySelectorAll('#v3PlanDock .v3-pnote .pc').length }));
      const exp = await page.evaluate(([w0, n]) => l3gaAdd(w0, n), [geo.w0, 9]);
      if (after.d !== exp || after.sticky !== 'sticky' || after.pc) fail('Dra i veckoraden / handtaget: ' + JSON.stringify({ geo, after, exp }));
      console.log('OK: veckoraden går att dra i (datumet följer), handtaget är sticky och procenten krockar inte med titeln');
      await page.evaluate(() => { l3gmSetMode('off', true); }); }
    // Bubblor för klickade (markerade) objekt visar år och område; de automatiska för pågående är oförändrade.
    { const bl = await page.evaluate(() => { const r = { start_date: '2026-10-09', end_date: '2026-10-17', area: 'PRODUKTION / 741 Hus', object_name: 'X', progress: 10 }, f = { name: true, date: true, progress: true, area: false, activity: false };
        return { mk: l3bubLines(r, f, true), au: l3bubLines(r, f, false) }; });
      if (!/2026/.test(bl.mk.date) || bl.mk.date.split('2026').length !== 3 || bl.mk.area !== 'PRODUKTION / 741 Hus' || /2026/.test(bl.au.date) || bl.au.area) fail('Bubblor: l3bubLines med marked=true ska ge år + område: ' + JSON.stringify(bl));
      console.log('OK: bubblor för klickade objekt visar år och område, de automatiska är oförändrade'); }
    // Markerar man objekt (klara, pågående eller kommande) kommer alltid en bubbla – även med automatiska bubblor avstängda.
    { const mk = await page.evaluate(async () => {
        l3SetPref('bubOn', false); l3bub.sig = '';
        const p = placements.find(x => x.itemId) || null; if (!p) return { noPlacement: true };
        const row = items.find(r => r.id === p.itemId); const e0 = row.end_date; row.end_date = '2026-10-01'; // slutdatumet passerat: markerad ska ändå visas
        l3.sel = new Set([p.id]); l3bub.sig = ''; l3RenderLabels();
        const n = document.querySelectorAll('#v3Bubbles .v3-bub').length, txt = (document.querySelector('#v3Bubbles .v3-bub') || {}).innerText || '';
        l3.sel = new Set(); l3bub.sig = ''; l3RenderLabels(); const none = document.querySelectorAll('#v3Bubbles .v3-bub').length; row.end_date = e0;
        return { n, txt, none };
      });
      if (process.env.DBG) console.log('MK', JSON.stringify(mk));
      if (!mk.noPlacement && (mk.n < 1 || !/20\d\d/.test(mk.txt) || mk.none !== 0)) fail('Bubbla vid markering: ' + JSON.stringify(mk));
      console.log('OK: markerade objekt får alltid en bubbla (även med automatiska av och efter slutdatum)'); }
    // Byter man markerat objekt (lika många markerade) ska bubblan följa med utan att man trycker Esc emellan.
    { const sg = await page.evaluate(() => { const keep = l3bs.sel; l3bs.sel = [{ mesh: { uuid: 'm' }, ri: 1, key: 'm:1' }]; const a = l3bubSig(); l3bs.sel = [{ mesh: { uuid: 'm' }, ri: 2, key: 'm:2' }]; const b = l3bubSig(); l3bs.sel = keep; return a !== b; });
      if (!sg) fail('Bubblan ska följa med när man markerar ett annat objekt (signaturen ändras)');
      console.log('OK: byte av markerat objekt uppdaterar bubblan direkt (utan Esc)'); }
    // Filmknapparna (Spela upp/Paus/Spela in) ligger i flödet i Film-panelen – inte ovanpå menyn (klasskrock med Gantt-staplarna).
    { const ab = await page.evaluate(() => { l3plSet('secOpen', { film: true, link: true, other: true }); l3plRenderTab(); const b = document.querySelector('#v3PalPlan .v3-pl-actbar'), f = document.getElementById('v3PlFBar'); const r = b.getBoundingClientRect(), fr = f.getBoundingClientRect(); return { pos: getComputedStyle(b).position, below: r.top >= fr.bottom - 1 }; });
      if (ab.pos !== 'static' || !ab.below) fail('Filmknapparna ligger ovanpå menyn: ' + JSON.stringify(ab));
      console.log('OK: filmknapparna ligger i flödet och inte ovanpå menyn'); }
    // Bubbla för temporära objekt kan stängas av (kryssruta i redigeringen); klickade objekt får bubbla ändå.
    { const tb = await page.evaluate(() => { const row = items.find(r => r.start_date) , keep = [row.temporary, row.bubble_off, row.start_date, row.end_date]; row.temporary = true; row.bubble_off = false; row.start_date = '2026-10-01'; row.end_date = '2026-12-31'; l3SetPref('bubScope', 'all'); l3SetPref('bubOn', true);
        const cnt = () => { l3bub.sig = ''; l3bubRebuild(); return l3bub.anchors.filter(a => a.row.id === row.id).length; };
        const on = cnt(); row.bubble_off = true; const off = cnt(); row.temporary = false; const normal = cnt();
        [row.temporary, row.bubble_off, row.start_date, row.end_date] = keep; l3SetPref('bubScope', 'auto'); l3SetPref('bubOn', false); l3bub.sig = ''; return { on, off, normal }; });
      if (tb.on < 1 || tb.off !== 0 || tb.normal < 1) fail('Bubbla för temporära objekt av/på: ' + JSON.stringify(tb));
      console.log('OK: bubblan kan stängas av för temporära objekt (kryssruta i redigeringen)'); }
    // Filter överst i vänstermenyn (sticky) och Följa tidplan.
    const fl = await page.evaluate(async () => {
      l3plSet('secOpen', { film: true, link: true, other: true }); l3plRenderTab();
      const fb = document.getElementById('v3PlFBar'), host = document.getElementById('v3PalPlan');
      const first = host.firstElementChild === fb, sticky = fb && getComputedStyle(fb).position === 'sticky';
      // Område: flervalslista med kryssrutor; "Alla (rensa)" och ✕ tar tillbaka allt; "Visa filtrerat i 3D" är alltid synlig.
      const vis3d = (() => { const b = fb.querySelector('#v3GaShow3d'); return !!b && b.offsetParent !== null; })();
      fb.querySelector('[data-galm="area"]').click(); await new Promise(r => setTimeout(r, 100));
      const cbs = [...document.querySelectorAll('#v3GaMultiPop input[data-v]')], opt = cbs[0] && cbs[0].dataset.v; cbs[0].checked = true; cbs[0].dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 150));
      const lfOn = (l3gaP().lf || {}).area, shown = l3gaListFilter(l3plLinkActs(false), l3gaP().lf).length, allN = l3plLinkActs(false).length;
      document.querySelector('#v3GaMultiPop [data-ma="all"]').click(); await new Promise(r => setTimeout(r, 150));
      const cleared = !((l3gaP().lf || {}).area || []).length, backAll = l3gaListFilter(l3plLinkActs(false), l3gaP().lf).length === allN;
      document.getElementById('v3GaMultiPop') && document.getElementById('v3GaMultiPop').remove();
      fb.querySelector('[data-galm="area"]').click(); await new Promise(r => setTimeout(r, 100)); for (let i = 0; i < 2; i++) { const c = document.querySelectorAll('#v3GaMultiPop input[data-v]')[i]; if (c) { c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 150)); } }
      const two = ((l3gaP().lf || {}).area || []).length; document.getElementById('v3GaMultiPop').remove(); document.getElementById('v3GaClearF').click(); await new Promise(r => setTimeout(r, 150));
      const multiOk = { vis3d, lfOn, shown, allN, cleared, backAll, two, clr: !((l3gaP().lf || {}).area || []).length };
      const multiBad = !vis3d || !opt || !(Array.isArray(lfOn) && lfOn.length === 1) || !cleared || !backAll || (cbs.length > 1 && two !== 2) || !multiOk.clr; window.__multi = multiOk;
      const f1 = document.getElementById('v3GaFollow'); f1.click(); const on = l3gaP().follow === true && l3gm.mode === 'time';
      const fol = l3gm.follow instanceof Set || l3gm.follow === null;
      document.getElementById('v3GaFollow').click(); const off = !l3gaP().follow && l3gm.mode === 'off';
      document.getElementById('v3GaClearF').click();
      return { first, sticky, on, off, fol, opt, multiBad, multi: multiOk };
    });
    if (fl.multiBad) fail('Flerval med kryssrutor (Område): ' + JSON.stringify(fl.multi));
    if (!fl.first || !fl.sticky || !fl.on || !fl.off || !fl.opt) fail('Filter överst / Följa tidplan: ' + JSON.stringify(fl));
    else console.log('OK: filtren ligger överst i vänstermenyn (sticky) och Följa tidplan slår på/av Tid för det filtret släpper igenom');
    console.log(`OK: filmens grafik – pågår nu (in/ut, bock), datumskylt med rullande vecka, milstolpe, förloppsmätare (${fx.prog} %, ${fx.ahead} dagar före baslinjen), valbara, lager vid uppspelning`);
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('OK: fliken 4D-planering – Powerproject som tavla och staplar, markera i 3D, vecka → datum, kameravyer, film som videofil');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
