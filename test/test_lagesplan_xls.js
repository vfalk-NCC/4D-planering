// Excel-planeringen som lager i Powerproject-lägesplanen (Victor 2026-10-12: "visa excel-objekten samtidigt när jag
// har PP-lägesplanen igång … färga efter Excels datum"). Ringar i Excels statusfärg på valt datum, hovring visar
// aktiviteten, lagret går att tända/släcka, följer med i exporten och finns inte när Excel-planeringen är vald.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9012;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => { c.fillStyle = '#fff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} }; } };
  } }) }) };`;
const XLS_ITEMS = [
  { id: 'x1', object_name: 'F1', activity: 'Gjutning fundament', start_date: '2026-09-01', end_date: '2026-09-05', status: 'klar', progress: 100, actual_end_date: '2026-09-05' },
  { id: 'x2', object_name: 'F2', activity: 'Gjutning fundament', start_date: '2026-10-08', end_date: '2026-10-20', progress: 30 },
  { id: 'x3', object_name: 'F3', activity: 'Gjutning fundament', start_date: '2026-11-01', end_date: '2026-11-10' },
];
const XLS_POS = [{ id: 'x1', x: 6512320, y: 150120, z0: 0, z1: 1 }, { id: 'x2', x: 6512350, y: 150120, z0: 0, z1: 1 }, { id: 'x3', x: 6512380, y: 150120, z0: 0, z1: 1 }];
const PP_ITEMS = [{ id: 'p1', object_name: 'Etapp 1', activity: 'Grundläggning', start_date: '2026-09-01', end_date: '2026-12-01', progress: 20 }];

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  try {
    const open = async src => {
      const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
      await require('./_dialogs').bridge(page);
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
      await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
      const reads = [];
      await page.route('https://api.github.com/**', r => {
        const f = decodeURIComponent(new URL(r.request().url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
        if (r.request().method() !== 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 'x' } }) });
        reads.push(f);
        const data = { 'projects/p1/plan_items.json': XLS_ITEMS, 'projects/p1/plan_item_positions.json': XLS_POS, 'projects/p1/pp/plan_items.json': PP_ITEMS }[f];
        r.fulfill(data ? { status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(JSON.stringify(data)).toString('base64'), sha: 's' }) } : { status: 404, body: '{}' });
      });
      await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1${src === 'pp' ? '&source=pp' : ''}`); await page.waitForTimeout(1200);
      await page.evaluate(async () => {
        plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
        pdfCache.set('A', new Uint8Array([1]).buffer); positions = [];
        renderPlanSelect(); await openPlan('A');
        $('dateInput').value = '2026-10-12'; renderZones();
      });
      return { page, errors, reads };
    };
    const { page, errors, reads } = await open('pp');
    await page.waitForFunction(() => typeof xls !== 'undefined' && xls.items && xls.items.length === 3, null, { timeout: 10000 });
    await page.evaluate(() => renderZones());
    // Lagret finns under Lager och läser Excel-filerna (inte pp/), inget skrivs.
    const row = await page.evaluate(() => { renderLayerPanel(); const r = document.querySelector('#layerList [data-layer="xls"]'); return r && r.textContent.replace(/\s+/g, ' ').trim(); });
    if (!row || !/Excel-planeringen/.test(row) || !/3/.test(row)) fail('Lagret Excel-planeringen ska finnas med 3 objekt: ' + row);
    if (!reads.includes('projects/p1/plan_items.json') || !reads.includes('projects/p1/plan_item_positions.json')) fail('Excel-planeringens filer ska läsas: ' + reads.join(', '));
    await page.evaluate(() => { view.scale = 1; applyView(); renderZones(); });
    // Ringarna i Excels statusfärg på valt datum: klar, pågående, planerad.
    const ring = id => page.evaluate(id => {
      const o = xlsObjects().find(o => o.it.id === id), [x, y] = toPx(o.pt), ov = ovLast, c = $('xlsCanvas'), cx = c.getContext('2d');
      const r = Math.ceil((xlsRingPx + 4) * ov.s), X = Math.round((x - ov.x0) * ov.s), Y = Math.round((y - ov.y0) * ov.s);
      const want = phaseColor(xlsPhase(o.it)).toLowerCase(), W = [1, 3, 5].map(i => parseInt(want.slice(i, i + 2), 16));
      const d = cx.getImageData(X - r, Y - r, 2 * r, 2 * r).data; let best = 999;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 120) best = Math.min(best, Math.abs(d[i] - W[0]) + Math.abs(d[i + 1] - W[1]) + Math.abs(d[i + 2] - W[2]));
      const mid = cx.getImageData(X, Y, 1, 1).data[3];
      return { ph: xlsPhase(o.it), want, best, mid };
    }, id);
    const want = { x1: 'klar', x2: 'pagaende', x3: 'planerad' };
    for (const id of ['x1', 'x2', 'x3']) {
      const r = await ring(id);
      if (r.ph !== want[id] || r.best > 45 || r.mid !== 0) fail(`Ringen ${id} (${want[id]}) i Excels statusfärg, tom i mitten: ` + JSON.stringify(r));
    }
    // Hovra: aktiviteten och att den kommer från Excel.
    await page.evaluate(() => { const o = xlsObjects().find(o => o.it.id === 'x2'), [x, y] = toPx(o.pt), r = $('viewport').getBoundingClientRect(); view.tx = r.width / 2 - x * view.scale; view.ty = r.height / 2 - y * view.scale; applyView(); renderZones(); });
    const [hx, hy] = await page.evaluate(() => { const o = xlsObjects().find(o => o.it.id === 'x2'), [x, y] = toPx(o.pt), st = $('stage'), b = st.getBoundingClientRect(); return [b.left + x * b.width / st.offsetWidth, b.top + y * b.height / st.offsetHeight]; });
    await page.mouse.move(hx, hy); await page.waitForTimeout(150);
    const tip = await page.evaluate(() => !$('tip').classList.contains('hidden') && $('tip').textContent);
    if (!tip || !/Excel-planeringen/.test(tip) || !/F2/.test(tip) || !/Pågående/.test(tip)) fail('Hovringen: ' + tip);
    // Exporten tar med ringarna; släckt lager syns inte och följer inte med.
    const px = () => page.evaluate(() => { const o = xlsObjects().find(o => o.it.id === 'x3'), cv = composeImage(null, true), k = cv.width / $('pdfCanvas').width, [x, y] = toPx(o.pt), r = Math.ceil(xlsRingPx * k) + 3, d = cv.getContext('2d').getImageData(Math.round(x * k) - r, Math.round(y * k) - r, 2 * r, 2 * r).data, want = phaseColor('planerad'); let n = 0; const W = [1, 3, 5].map(i => parseInt(want.slice(i, i + 2), 16)); for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - W[0]) < 12 && Math.abs(d[i + 1] - W[1]) < 12 && Math.abs(d[i + 2] - W[2]) < 12) n++; return n; });
    if (!((await px()) > 3)) fail('Exporten ska ta med Excel-ringarna');
    // Namnen (Visa namn): Excel-objektens etiketter syns också (Victor 2026-10-12: "Nu visas inte 3D-namnen från Excel-planeringen").
    const lbl = await page.evaluate(() => { localStorage.setItem('lagesplan-objlabels', '1'); fitView(); renderZones(); return objLabelBoxes.map(b => b.text).sort().join(); });
    if (!/F1/.test(lbl) || !/F2/.test(lbl) || !/F3/.test(lbl)) fail('Excel-objektens namn ska synas: ' + lbl);
    await page.evaluate(() => { const b = objLabelBoxes.find(x => x.text === 'F2'); openLabelMenu(b, { clientX: 300, clientY: 300, preventDefault() {} }); });
    await page.keyboard.press('Escape');
    await page.screenshot({ path: path.join(process.env.PLACE_TMP || '.', 'xls-labels.png') });
    console.log('OK: Excel-objektens namn visas som etiketter');
    await page.evaluate(() => { const c = document.querySelector('#layerList [data-layer="xls"] .lr-vis'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); });
    if (await page.evaluate(() => $('xlsCanvas').style.display) !== 'none') fail('Släckt lager ska döljas');
    if (await page.evaluate(() => objLabelBoxes.some(b => /^F\d/.test(b.text)))) fail('Släckt lager: inga Excel-namn');
    if ((await px()) > 0) fail('Släckt lager ska inte följa med i exporten');
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('OK: Excel-planeringen i PP-lägesplanen – ringar i Excels statusfärg, hovring, tänd/släck, export');
    // Excel-planeringen vald: inget extra lager.
    const ex = await open('excel');
    await ex.page.waitForTimeout(300);
    const e = await ex.page.evaluate(() => ({ row: !!document.querySelector('#layerList [data-layer="xls"]'), canvas: $('xlsCanvas').style.display, items: xls.items }));
    if (e.row || e.canvas !== 'none' || e.items) fail('Med Excel vald ska lagret inte finnas: ' + JSON.stringify(e));
    console.log('OK: med Excel-planeringen vald finns inget extra lager');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
