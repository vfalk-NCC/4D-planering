// Fristående HTML-export (Victor 2026-10-11, efter BubbleBIM): lägesplanen och 3D i EN fil som kan skickas till
// någon utan Trimble Connect och öppnas offline. Testet exporterar, öppnar filen i en ny sida utan nät och
// kontrollerar 2D-bilden, 3D-scenen (objekten och marken) och att inga fel uppstår.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9015;
const OUT = process.env.PLACE_TMP || path.join(__dirname, '..', '.tmp');
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); c.fillStyle = '#2563eb'; c.fillRect(v.width * 0.2, v.height * 0.3, v.width * 0.3, v.height * 0.3); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
const PAKO = `window.pako = { gzip: s => new TextEncoder().encode(String(s)), ungzip: (u, o) => new TextDecoder().decode(u) };`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 850 }, acceptDownloads: true });
    const page = await ctx.newPage();
    await require('./_dialogs').bridge(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); window.__hxKeep = true; });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: /pako/.test(r.request().url()) ? PAKO : PDFJS }));
    const ITEMS = [{ id: 'i1', object_name: 'F18', activity: 'Pålning', group_id: 'g1', area: 'A', start_date: '2026-10-01', end_date: '2026-10-10', progress: 0, status: 'planerad' }, { id: 'i2', object_name: 'F19', activity: 'Pålning', group_id: 'g1', area: 'A', start_date: '2026-10-01', end_date: '2026-10-10', progress: 0, status: 'planerad' }];
    const gh = new Map([['projects/p1/plan_items.json', JSON.stringify(ITEMS)], ['projects/p1/plan_placements.json', JSON.stringify([
      { id: 'k1', type: 'tornkran', name: 'Kran 1', x: 6512320, y: 150110, z: 0, L: 1.6, B: 1.6, H: 40, R: 50, rot: 0, dz: 0, color: '#facc15' },
      { id: 'b1', type: 'bod', name: 'Bod A', x: 6512340, y: 150105, z: 0, L: 8.4, B: 3, H: 2.7, rot: 0, dz: 0, color: '#f59e0b' }])]]);
    await page.route('https://api.github.com/**', r => {
      const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
      if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
      const body = JSON.parse(req.postData() || '{}'); gh.set(f, Buffer.from(body.content || '', 'base64').toString());
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
    });
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
    await page.evaluate(async () => {
      plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
      pdfCache.set('A', new Uint8Array([1]).buffer);
      items = []; positions = [];
      renderPlanSelect(); await openPlan('A');
    });
    await page.waitForTimeout(500);
    if (await page.evaluate(() => placements.length) !== 2) await page.evaluate(pl => { placements = pl; }, JSON.parse(gh.get('projects/p1/plan_placements.json')));

    const res = await page.evaluate(async () => {
      items = JSON.parse(JSON.stringify([{ id: 'i1', object_name: 'F18', activity: 'Pålning', group_id: 'g1', area: 'A', start_date: '2026-10-01', end_date: '2026-10-10', progress: 0, status: 'planerad' }, { id: 'i2', object_name: 'F19', activity: 'Pålning', group_id: 'g1', area: 'A', start_date: '2026-10-01', end_date: '2026-10-10', progress: 0, status: 'planerad' }]));
      $('dateInput').value = '2026-10-05';
      const out = {};
      const html = objMenuHtml([items[0]]); out.menu = ['ej', 'pagaende', 'klar', 'pausad', 'pct'].every(k => html.includes(`data-ost="${k}"`)) && html.includes('data-ost-all');
      await objSetStatus([items[0]], 'klar');
      out.klar = { p: items[0].progress, s: items[0].status, ae: !!items[0].actual_end_date, ph: computeItemPhase(items[0], '2026-10-05', 7), other: items[1].progress };
      await objSetStatus([items[1]], 'pct', 40);
      out.pct = { p: items[1].progress, s: items[1].status, ph: computeItemPhase(items[1], '2026-10-05', 7) };
      await objSetStatus([items[1]], 'pausad'); out.pausad = computeItemPhase(items[1], '2026-10-05', 7);
      await objSetStatus([items[0]], 'ej'); out.ej = { p: items[0].progress, ae: items[0].actual_end_date };
      await objStatusUndo(); out.undo = items[0].status;
      return out;
    });
    const saved = JSON.parse(gh.get('projects/p1/plan_items.json'));
    if (!res.menu) fail('Menyn ska ha Status-knapparna: ' + JSON.stringify(res));
    if (res.klar.p !== 100 || res.klar.s !== 'klar' || !res.klar.ae || res.klar.ph !== 'klar' || res.klar.other !== 0) fail('Klar: ' + JSON.stringify(res.klar));
    if (res.pct.p !== 40 || res.pct.s !== 'pagaende' || res.pct.ph !== 'pagaende' || res.pausad !== 'pausad') fail('Procent/pausad: ' + JSON.stringify(res));
    if (res.ej.p !== 0 || res.ej.ae !== null || res.undo !== 'klar') fail('Ej påbörjad/ångra: ' + JSON.stringify(res));
    const s1 = saved.find(r => r.id === 'i1'), s2 = saved.find(r => r.id === 'i2');
    if (s1.status !== 'klar' || s1.progress !== 100 || s2.status !== 'pausad' || s2.progress !== 40) fail('Sparat i plan_items.json: ' + JSON.stringify(saved));
    // Dra en ruta: alla prickar i rutan får status; ny prick: kopierar aktivitet/datum från närmaste och sparas med position.
    await page.evaluate(() => {
      positions = [{ id: 'i1', x: 6512330, y: 150100, z0: 0, z1: 2 }, { id: 'i2', x: 6512360, y: 150100, z0: 0, z1: 2 }]; invalidatePositions();
      items.forEach(r => { r.status = 'planerad'; r.progress = 0; r.actual_end_date = null; });
      renderZones();
    });
    const box = await page.evaluate(async () => {
      const shapes = objectShapesInPdf() || []; const n0 = shapes.length;
      objStatusBox(toPx([0, -400]), toPx([1000, 400]), { clientX: 200, clientY: 200 });
      if (!$('labelMenu')) return { n0, nomenu: true, st: document.getElementById('saveStatus') && document.getElementById('saveStatus').textContent, shapes: shapes.map(o => o.center) };
      const m = $('labelMenu'); const vis = m && !m.classList.contains('hidden') && /2 objekt i rutan/.test(m.textContent);
      m.querySelector('[data-ost="klar"]').click(); await new Promise(r => setTimeout(r, 400));
      return { n0, vis, st: items.map(r => r.status) };
    });
    if (box.n0 < 1 || !box.vis || box.st.join() !== 'klar,klar') fail('Status i ruta: ' + JSON.stringify(box));
    const add = await page.evaluate(async () => {
      window.uiPrompt = async () => 'F20';
      const n = items.length; await objAddDot(modelToPdf(6512340, 150100));
      const r = items[items.length - 1];
      return { added: items.length === n + 1, name: r.object_name, act: r.activity, grp: r.group_id, st: r.status, pos: positions.some(p => p.id === r.id), id: r.id };
    });
    if (!add.added || add.name !== 'F20' || add.act !== 'Pålning' || add.grp !== 'g1' || add.st !== 'planerad' || !add.pos) fail('Ny prick: ' + JSON.stringify(add));
    const sIt = JSON.parse(gh.get('projects/p1/plan_items.json')), sPos = JSON.parse(gh.get('projects/p1/plan_item_positions.json') || '[]');
    if (!sIt.some(r => r.id === add.id && r.origin === 'manuell') || !sPos.some(p => p.id === add.id)) fail('Ny prick sparad i data: ' + JSON.stringify({ sIt: sIt.length, sPos: sPos.length }));
    await page.evaluate(() => objStatusUndo()); await page.waitForTimeout(300);
    if (JSON.parse(gh.get('projects/p1/plan_items.json')).some(r => r.id === add.id) || await page.evaluate(() => items.some(r => r.object_name === 'F20'))) fail('Ångra ska ta bort den nya pricken');
    // Reglage för framdrift och egen färg i prickens meny
    const mc = await page.evaluate(async () => {
      positions = [{ id: 'i1', x: 6512330, y: 150100, z0: 0, z1: 2 }, { id: 'i2', x: 6512360, y: 150100, z0: 0, z1: 2 }]; invalidatePositions(); items.forEach(r => { r.status = 'planerad'; r.progress = 0; });
      const m = document.createElement('div'); m.id = 'tmpMenu'; m.innerHTML = objStatusMenuHtml([items[0]]); document.body.appendChild(m); objStatusBind(m, [items[0]]);
      const r = { has: !!m.querySelector('[data-ost-sl]') && !!m.querySelector('[data-ost-col]') };
      const sl = m.querySelector('[data-ost-sl]'); sl.value = '65'; sl.dispatchEvent(new Event('input')); sl.dispatchEvent(new Event('change')); await new Promise(r2 => setTimeout(r2, 400)); r.p = items[0].progress;
      const sw = m.querySelectorAll('[data-ost-col]')[3]; const col = sw.dataset.ostCol; sw.click(); r.col = (plan.dotColors || {})[items[0].id] === col; const sh = (objectShapesInPdf() || []).find(o => o.it.id === items[0].id); objSetDotColor(sh.members && sh.members.length ? sh.members : [sh.it], col); r.fn = objDotColor(sh) === col; objSetDotColor(sh.members && sh.members.length ? sh.members : [sh.it], null);
      m.querySelector('.om-sw-auto').click(); r.cleared = !(plan.dotColors && plan.dotColors[items[0].id]); m.remove(); return r; });
    if (!mc.has || mc.p !== 65 || !mc.col || mc.fn === false || !mc.cleared) fail('Framdriftsreglage/egen färg i prickens meny: ' + JSON.stringify(mc));
    const kom = await page.evaluate(async () => {
      const m = document.createElement('div'); m.id = 'tmpMenu2'; m.innerHTML = objStatusMenuHtml([items[0]]); document.body.appendChild(m); objStatusBind(m, [items[0]]);
      await new Promise(r => setTimeout(r, 300)); const r = { box: !!m.querySelector('[data-ost-ki]') };
      m.querySelector('[data-ost-ki]').value = 'Betongen levereras sent'; m.querySelector('[data-ost-kb]').click(); await new Promise(r2 => setTimeout(r2, 500)); r.shown = /Betongen levereras sent/.test(m.querySelector('[data-ost-kl]').textContent); m.remove(); return r; });
    const cs = JSON.parse(gh.get('projects/p1/plan_item_comments.json') || '[]');
    if (!kom.box || !kom.shown || !cs.some(c => c.body === 'Betongen levereras sent' && c.plan_item_id === 'i1')) fail('Kommentar på prick: ' + JSON.stringify({ kom, cs }));
    // Riktig högerklick på en prick (contextmenu-händelse på ritytan) ska öppna menyn med status, framdrift, färg och kommentar
    const rc = await page.evaluate(async () => {
      positions = [{ id: 'i1', x: 6512330, y: 150100, z0: 0, z1: 2 }, { id: 'i2', x: 6512360, y: 150100, z0: 0, z1: 2 }]; invalidatePositions(); items.forEach(r => { r.status = 'planerad'; r.progress = 0; }); renderZones();
      const sh = (objectShapesInPdf() || [])[0]; if (!sh) return { noshape: true };
      const [sx, sy] = toPx(sh.center), vr = $('viewport').getBoundingClientRect(), sc = stageToScreen([sx, sy]);
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: vr.left + sc[0], clientY: vr.top + sc[1], button: 2 });
      $('viewport').dispatchEvent(ev); const m = $('labelMenu');
      return { prevented: ev.defaultPrevented, menu: !!m && !m.classList.contains('hidden'), sl: !!(m && m.querySelector('[data-ost-sl]')), col: !!(m && m.querySelector('[data-ost-col]')), kom: !!(m && m.querySelector('[data-ost-ki]')), hits: objectsAt(toPdf(sh.center)).length };
    });
    if (!rc.menu || !rc.sl || !rc.col || !rc.kom) fail('Högerklick på prick ska öppna menyn: ' + JSON.stringify(rc));
    // Med riktig mus (nedtryck + släpp + contextmenu) i stället för en syntetisk händelse
    await page.evaluate(() => { const m = $('labelMenu'); if (m) m.classList.add('hidden'); });
    const pt = await page.evaluate(() => { const sh = (objectShapesInPdf() || [])[0], [sx, sy] = toPx(sh.center), vr = $('viewport').getBoundingClientRect(), sc = stageToScreen([sx, sy]); return { x: vr.left + sc[0], y: vr.top + sc[1], inView: sc[0] > 0 && sc[1] > 0 && sc[0] < vr.width && sc[1] < vr.height, scale: view.scale, rs: renderScale, minPx: objMinPx }; });
    await page.mouse.click(pt.x, pt.y, { button: 'right' }); await page.waitForTimeout(300);
    const rc2 = await page.evaluate(() => { const m = $('labelMenu'); return { menu: !!m && !m.classList.contains('hidden'), sl: !!(m && m.querySelector('[data-ost-sl]')), rect: m ? m.getBoundingClientRect().toJSON() : null }; });
    if (!rc2.menu || !rc2.sl) fail('Riktig högerklick på prick ska öppna menyn: ' + JSON.stringify({ pt, rc2 }));

    // Excel-planeringens ringar (PP-lägesplanen): samma meny med framdrift, färg och kommentar, sparar i Excel-planens egen plan_items.json
    const xr = await page.evaluate(async () => {
      const it = items[0]; xls.items = items; xls.positions = []; const list = [{ it, pt: [10, 10] }];
      xlsOpenMenu(list, { clientX: 20, clientY: 20 }); const m = $('labelMenu'); const r = { sl: !!m.querySelector('[data-ost-sl]'), col: !!m.querySelector('[data-ost-col]'), kom: !!m.querySelector('[data-ost-ki]'), hide: !!m.querySelector('[data-x="obj"]') };
      const sl = m.querySelector('[data-ost-sl]'); sl.value = '30'; sl.dispatchEvent(new Event('change')); await new Promise(r2 => setTimeout(r2, 400)); r.p = it.progress; m.classList.add('hidden'); return r;
    });
    const xs = JSON.parse(gh.get('projects/p1/plan_items.json')).find(r => r.id === 'i1');
    if (!xr.sl || !xr.col || !xr.kom || !xr.hide || xr.p !== 30 || !xs || xs.progress !== 30) fail('Excel-ringarnas meny: ' + JSON.stringify({ xr, xs: xs && xs.progress }));
    // Ta bort kommentar och byt namn på aktiviteten/pricken
    const rn = await page.evaluate(async () => {
      window.uiConfirm = async () => true; window.uiPrompt = async () => 'Nytt aktivitetsnamn';
      const m = document.createElement('div'); m.id = 'tmpMenu3'; m.innerHTML = objStatusMenuHtml([items[0]]); document.body.appendChild(m); objStatusBind(m, [items[0]]); await new Promise(r => setTimeout(r, 400));
      const r = { kd: m.querySelectorAll('[data-ost-kd]').length }; const kd = m.querySelector('[data-ost-kd]'); if (kd) { kd.click(); await new Promise(r2 => setTimeout(r2, 500)); r.kdAfter = m.querySelectorAll('[data-ost-kd]').length; }
      m.querySelector('[data-ost-rn="act"]').click(); await new Promise(r2 => setTimeout(r2, 500)); r.act = items[0].activity; m.remove(); return r; });
    const sv = JSON.parse(gh.get('projects/p1/plan_items.json')).find(r => r.id === 'i1'), cs2 = JSON.parse(gh.get('projects/p1/plan_item_comments.json') || '[]');
    if (!(rn.kd >= 1) || rn.kdAfter !== rn.kd - 1 || rn.act !== 'Nytt aktivitetsnamn' || !sv || sv.activity !== 'Nytt aktivitetsnamn' || cs2.some(c => c.body === 'Betongen levereras sent')) fail('Ta bort kommentar / byt namn: ' + JSON.stringify({ rn, sv: sv && sv.activity, cs2: cs2.length }));
    // Startval: fråga 2D eller 3D när lägesplanen öppnas
    if (process.env.SCSHOT) await page.exposeFunction('__SCSHOT', async () => { await page.waitForTimeout(400); await page.screenshot({ path: process.env.SCSHOT }); });
    const sc = await page.evaluate(async () => {
      history.replaceState(null, '', '?project=p1&start=visa'); localStorage.removeItem('lagesplan-startval'); const r = {};
      startChoice(plan); await new Promise(r2 => setTimeout(r2, 150)); if (window.__SCSHOT) await window.__SCSHOT(); const el = document.getElementById('v3Start'); r.shown = !!el; r.tiles = el ? el.querySelectorAll('[data-sc]').length : 0; r.has3d = !!(plan && plan.calib);
      el.querySelector('#v3StartK').checked = true; el.querySelector('[data-sc="2d"]').click(); await new Promise(r2 => setTimeout(r2, 400)); r.closed = !document.getElementById('v3Start'); r.saved = localStorage.getItem('lagesplan-startval');
      startChoice(plan); await new Promise(r2 => setTimeout(r2, 100)); r.noAsk = !document.getElementById('v3Start'); r.note = !!document.querySelector('.v3-start-n'); localStorage.removeItem('lagesplan-startval'); document.querySelectorAll('.v3-start-n').forEach(n => n.remove()); return r; });
    if (!sc.shown || sc.tiles !== 2 || !sc.closed || sc.saved !== '2d' || !sc.noAsk || !sc.note) fail('Startval 2D/3D: ' + JSON.stringify(sc));
    // Visuellt namn: bara i lägesplanen, rör inte tidplanen
    const vn = await page.evaluate(async () => {
      window.uiPrompt = async () => 'Pelare P7'; const before = JSON.stringify(items.map(r => [r.id, r.object_name, r.activity]));
      const m = document.createElement('div'); m.innerHTML = objStatusMenuHtml([items[0]]); document.body.appendChild(m); objStatusBind(m, [items[0]]);
      m.querySelector('[data-ost-rn="vis"]').click(); await new Promise(r => setTimeout(r, 300)); const r = { lbl: objLabelText(items[0]), same: JSON.stringify(items.map(x => [x.id, x.object_name, x.activity])) === before, saved: !!(plan.dotNames && plan.dotNames[items[0].id]) };
      objSetVisualName([items[0]], ''); r.back = objLabelText(items[0]) !== 'Pelare P7'; m.remove(); return r; });
    if (vn.lbl !== 'Pelare P7' || !vn.same || !vn.saved || !vn.back) fail('Visuellt namn: ' + JSON.stringify(vn));
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('ALLA TESTER OK');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
