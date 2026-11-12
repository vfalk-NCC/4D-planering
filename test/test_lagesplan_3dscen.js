const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9104;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : q.url.includes('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A');
  });
  await page.click('#btn3d');
  const r = await page.evaluate(async () => {
    const w = ms => new Promise(r => setTimeout(r, ms)); await w(1000); const out = {};
    const mkRow = (id, name, cur, main, bl, extra) => ({ id, group_id: 'g' + id, activity: name, object_name: name, area: 'A', start_date: cur[0], end_date: cur[1], baseline_start_date: main && main[0], baseline_end_date: main && main[1], baselines: bl ? { rev2: bl } : undefined, ...(extra || {}) });
    l3pl.rows = [mkRow('1', 'Platta A1', ['2026-02-02', '2026-05-29'], ['2026-02-02', '2026-05-29'], ['2026-02-02', '2026-05-29']), mkRow('2', 'Stomme B2', ['2026-06-15', '2026-11-27'], ['2026-06-01', '2026-10-09'], ['2026-06-01', '2026-10-09']), mkRow('3', 'Förtjockarhuset G', ['2026-07-13', '2027-01-29'], ['2026-06-15', '2026-10-30'], null), mkRow('4', 'Kontor', ['2026-11-02', '2027-05-07'], ['2026-10-05', '2027-03-05'], ['2026-10-05', '2027-03-05'])];
    const REG = [{ id: 'main', name: 'Kontraktstidplan' }, { id: 'rev2', name: 'Tidplan före omplanering Förtjockarhuset' }, { id: 'rev3', name: 'Reviderad kontraktstidplan' }];
    // rev3 saknar datum på raderna → listas inte; rev2 och main finns
    window.ghReadJSON = async (t, p) => /plan_baselines/.test(p) ? REG : [];
    out.dates = JSON.stringify(l3scDatesOf(l3pl.rows[1], 'main')) === '["2026-06-01","2026-10-09"]' && JSON.stringify(l3scDatesOf(l3pl.rows[1], 'bl:rev2')) === '["2026-06-01","2026-10-09"]' && l3scDatesOf(l3pl.rows[2], 'bl:rev2') === null && JSON.stringify(l3scDatesOf(l3pl.rows[2], 'cur')) === '["2026-07-13","2027-01-29"]';
    out.rowFor = l3scRowFor(l3pl.rows[2], 'bl:rev2') === null && l3scRowFor(l3pl.rows[1], 'bl:rev2').end_date === '2026-10-09'; l3sc.opts.missing = 'plan'; out.rowForPlan = l3scRowFor(l3pl.rows[2], 'bl:rev2') === l3pl.rows[2]; l3sc.opts.missing = 'hide';
    // hooken: Tid-läge med strikta datum per scenario
    l3sc.sel = ['main', 'cur', 'bl:rev2']; l3sc.reg = REG; l3scBuildList(); out.list = l3sc.list.some(x => x.id === 'main') && l3sc.list.some(x => x.id === 'bl:rev2') && !l3sc.list.some(x => x.id === 'bl:rev3') && l3sc.list.find(x => x.id === 'cur').n === 4;
    const was = l3gm.mode; l3gm.mode = 'time'; const rowsB2 = [l3pl.rows[1]], rowsNew = [l3pl.rows[2]];
    l3sc.render = 0; const ph0 = l3gmRange(rowsB2, '2026-11-12', {}); const gh = l3gmRange(rowsNew, '2026-11-12', {});   // A = kontrakt: Stomme B2 slutade 9 okt → klart; Förtjockarhuset G slutar 30 okt → klart
    l3sc.render = 1; const ph1 = l3gmRange(rowsB2, '2026-11-12', {}); const gh1 = l3gmRange(rowsNew, '2026-11-12', {});   // B = nuvarande: B2 slutar 27 nov → pågår; Förtjockarhuset pågår
    l3sc.render = 2; const ph2 = l3gmRange(rowsNew, '2026-11-12', {});   // C = före omplanering: Förtjockarhuset fanns inte → osynligt
    out.hook = ph0.phase === 'klar' && gh.phase === 'klar' && ph1.phase === 'pagaende' && gh1.phase === 'pagaende' && ph2.off === true;
    l3sc.tally = {}; l3sc.render = 0; l3gmRange(rowsB2, '2026-11-12', {}); l3gmRange([l3pl.rows[3]], '2026-11-12', {}); out.tally = l3sc.tally.klar === 1 && l3sc.tally.pagaende === 1; l3sc.tally = null;
    l3sc.render = 'delta'; const dl = l3gmRange(rowsB2, '2026-11-12', {}), dn = l3gmRange(rowsNew, '2026-11-12', {}); l3sc.sel = ['bl:rev2', 'cur', '']; const dnew = l3gmRange(rowsNew, '2026-11-12', {}); l3sc.sel = ['main', 'cur', 'bl:rev2'];
    out.delta = dl.phase === 'd_late' && dn.phase === 'd_late' && dnew.phase === 'd_new'; l3sc.render = null; l3gm.mode = was;
    out.diff = (() => { const d = l3scDiffRows(); return d.length === 3 && d[0].d > 0 && d.some(x => x.name === 'Förtjockarhuset G' && x.d === 91); })();
    // överlägget
    const btn = document.getElementById('v3ScenBtn'); out.btn = !!btn && btn.closest('#v3Views'); l3sc.sel = ['', '', '']; l3sc.loaded = true; await l3scOpen(); await w(800);
    const el = document.getElementById('v3Scen'); out.open = !!el && el.querySelectorAll('figure[data-k]').length >= 2; out.sel = [...el.querySelectorAll('select[data-sc^=sel]')].map(s => s.value).join(',');
    out.kpi = !!el.querySelector('[data-pct="0"]') && /%/.test(el.querySelector('[data-pct="0"]').textContent) && !!el.querySelector('figure[data-k="delta"]') && el.querySelectorAll('#scTb tr').length >= 2;
    const cv = l3scCompose(); out.report = !!cv && cv.width === 3300 && cv.height > 1500;
    const pdf = l3scPdfBytes(l3scCompose()); out.pdf = String.fromCharCode(...pdf.slice(0, 8)) === '%PDF-1.4' && String.fromCharCode(...pdf.slice(-6)).includes('%%EOF') && pdf.length > 10000;
    el.querySelector('#scDate').value = '2026-08-03'; el.querySelector('#scDate').dispatchEvent(new Event('change')); await w(500); out.date = l3sc.date === '2026-08-03' && el.querySelector('.sc-big').textContent === '2026-08-03';
    el.querySelector('[data-sc-go="1"]').click(); await w(300); out.explore = !!document.getElementById('v3ScBadge') && l3sc.render === 1 && el.style.display === 'none'; document.getElementById('v3ScBadge').querySelectorAll('button')[0].click(); await w(500); out.back = el.style.display !== 'none';
    l3scClose(); await w(200); out.closed = !document.getElementById('v3Scen') && l3sc.render === null && l3gm.mode === was && !document.getElementById('v3ScBadge');
    return out;
  });
  console.log(JSON.stringify(r)); if (errors.length) { console.error('FAIL JS-fel', errors.join(' | ').slice(0, 700)); process.exit(1); }
  const bad = Object.entries(r).filter(([k, v]) => v === false).map(x => x[0]); if (bad.length) { console.error('FAIL scenarier: ' + bad.join(',')); process.exit(1); }
  await browser.close(); server.close(); console.log('OK: tidplansscenarier – baselines som scenarier, 4D-färger per plan, skillnadsvy, rapportbild/PDF, utforska och återställ');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
