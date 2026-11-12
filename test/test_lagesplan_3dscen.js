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
    const w = ms => new Promise(r => setTimeout(r, ms)); await w(1000); const out = {}; try {
    const mkRow = (id, obj, name, cur, main, bl) => ({ id, object_id: obj, group_id: 'g' + id, activity: name, object_name: name, area: 'A', start_date: cur[0], end_date: cur[1], baseline_start_date: main && main[0], baseline_end_date: main && main[1], baselines: bl ? { rev2: bl } : undefined });
    const ROWS = [mkRow('1', 'G1', 'Platta A1', ['2026-02-02', '2026-05-29'], ['2026-02-02', '2026-05-29'], ['2026-02-02', '2026-05-29']), mkRow('2', 'G2', 'Stomme B2', ['2026-06-15', '2026-11-27'], ['2026-06-01', '2026-10-09'], ['2026-06-01', '2026-10-09']), mkRow('3', 'G3', 'Förtjockarhuset G', ['2026-07-13', '2027-01-29'], ['2026-06-15', '2026-10-30'], null)]; l3pl.rows = ROWS;
    const writes = []; let stored = [];
    window.ghReadJSON = async (t, p) => /plan_items/.test(p) ? ROWS : /plan_baselines/.test(p) ? [{ id: 'main', name: 'Kontraktstidplan' }, { id: 'rev2', name: 'Rev 2' }] : /plan_scenarios/.test(p) ? stored : [];
    window.ghWriteJSON = async (t, p, fn) => { const v = fn(stored); stored = v; writes.push(p); return v; };
    const ctx = g => ({ mesh: { userData: { l3b: { ranges: [{ guid: g }] } } }, ri: 0 });
    // 1) Nollställt: inget valt, inget kopplat mot tidplanen
    await l3scLoad(true); out.empty = l3sc.mine.length === 0 && l3sc.sel.join('') === '' && l3sc.list === undefined;
    await l3scOpen(); await w(600); const p0 = document.getElementById('v3ScPanel'); out.emptyUi = !!p0 && /Det börjar tomt och är inte kopplat mot tidplanen/.test(p0.textContent) && p0.querySelectorAll('.sc-a').length === 0 && l3sc.render === null; l3scClose(); await w(200);
    // 2) Egna scenarier utan tidplan
    const A = l3scNew('Reviderat kontrakt'), B = l3scNew('Nuvarande'); l3sc.mine = [A, B]; l3sc.sel = [A.id, B.id, '']; l3sc.cache = {};
    A.acts.push({ id: 'a1', name: 'Stomme', start: '2026-06-01', end: '2026-10-09', g: ['G2'], pl: [] }); B.acts.push({ id: 'b1', name: 'Stomme', start: '2026-06-15', end: '2026-11-27', g: ['G2'], pl: [] }, { id: 'b2', name: 'Förtjockarhuset', start: '2026-07-13', end: '2027-01-29', g: ['G3'], pl: [], color: '#a855f7' }); A._v = 1; B._v = 1;
    const was = l3gm.mode; l3gm.mode = 'time';
    l3sc.render = 0; const a2 = l3gmRange([l3pl.rows[1]], '2026-11-12', ctx('G2')), a3 = l3gmRange([l3pl.rows[2]], '2026-11-12', ctx('G3'));   // A: G2 klart; G3 inte kopplat (trots rad i tidplanen)
    l3sc.render = 1; const b2 = l3gmRange([], '2026-11-12', ctx('G2')), b3 = l3gmRange([], '2026-11-12', ctx('G3')), b1 = l3gmRange([], '2026-02-01', ctx('G2'));
    out.hookOwn = a2.phase === 'klar' && b2.phase === 'pagaende' && b3.phase === 'pagaende' && Math.abs(b3.rgb[0] - 0xa8 / 255) < 0.01 && b1.phase === 'planerad' && b1.alpha > 0 && b1.alpha < 0.5;
    out.unlinked = a3.phase === 'okopplad' && a3.alpha < 0.3; A.unlinked = 'hide'; const hide = (l3sc.render = 0, l3gmRange([l3pl.rows[2]], '2026-11-12', ctx('G3'))); A.unlinked = 'orig'; const orig = l3gmRange([], '2026-11-12', ctx('GX')); A.unlinked = 'ghost'; out.unlinkedOpts = hide.off === true && orig.orig === true;
    l3sc.tally = {}; l3sc.render = 1; l3gmRange([], '2026-11-12', ctx('G2')); l3gmRange([], '2026-11-12', ctx('G3')); l3gmRange([], '2026-11-12', ctx('G9')); out.tally = l3sc.tally.pagaende === 2 && l3sc.tally.okopplad === 1; l3sc.tally = null;
    l3sc.render = 'delta'; const d2 = l3gmRange([], '2026-11-12', ctx('G2')), d3 = l3gmRange([], '2026-11-12', ctx('G3')); out.delta = d2.phase === 'd_late' && d3.phase === 'd_new';
    out.diff = (() => { const d = l3scDiffRows(); return d.length === 2 && d.some(x => x.name === 'Stomme' && x.d === 49) && d.some(x => x.name === 'Förtjockarhuset' && x.kind === 'ny'); })();
    l3sc.render = null; l3gm.mode = was;
    // 3) Kopplat mot tidplanen: bara när man väljer det
    const C = l3scNew('Från kontraktet'); C.src = 'main'; l3sc.mine.push(C); C._v = 1; l3sc.sel = [C.id, '', '']; l3gm.mode = 'time'; l3sc.render = 0; const c1 = l3gmRange([l3pl.rows[1]], '2026-11-12', ctx('G2')); l3sc.render = null; l3gm.mode = was; out.linked = c1.phase === 'klar';
    out.sources = l3scSources().map(x => x[0]).join(',') === ',cur,main,bl:rev2';
    // 4) Placerade objekt
    const pm = modCreate({ k: 'mesh', pts: [[0,0,0],[4,0,0],[4,4,0],[0,4,0],[0,0,3],[4,0,3],[4,4,3],[0,4,3]], faces: [[1,3,2],[1,4,3],[5,6,7],[5,7,8],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,4,8],[3,8,7],[4,1,5],[4,5,8]], closed: true }, [6512330, 150130, 100], { name: 'Bod' });
    A.acts.push({ id: 'a2', name: 'Bod upp', start: '2026-03-01', end: '2026-12-01', g: [], pl: [pm.id] }); A._v++; l3sc.cache = {}; l3sc.sel = [A.id, B.id, '']; l3sc.date = '2026-08-01';
    let mat = null; l3.placeMeshes.get(pm.id).traverse(m => { if (m.isMesh && !mat) mat = m.material; }); const c0 = mat.color.getHex(), o0 = mat.opacity, undo = l3scPlacePatch(A.id, '2026-08-01'), c1h = mat.color.getHex(); undo(); out.place = c1h !== c0 && mat.color.getHex() === c0 && mat.opacity === o0;
    { const tl = {}, u2 = l3scPlacePatch(A.id, '2026-08-01', tl); u2(); out.placeTally = tl.pagaende === 1; B.acts.push({ id: 'b3', name: 'Bod upp', start: '2026-05-01', end: '2027-01-01', g: [], pl: [pm.id] }); B._v++; l3sc.cache = {}; l3sc.sel = [A.id, B.id, '']; const dl = {}, u3 = l3scPlacePatch('delta', '2026-08-01', dl); u3(); out.placeDelta = dl.d_late === 1 && l3scDiffRows().some(x => x.name === 'Bod upp'); B.acts.pop(); B._v++; l3sc.cache = {}; }
    // 5) Panelen: välja, bygga och koppla – och jämföra
    l3sc.mine = [A, B]; l3sc.sel = ['', '', '']; await l3scPersist(); await l3scOpen(); await w(600);
    const pn = document.getElementById('v3ScPanel'); out.panelCls = !!pn && pn.classList.contains('v3-vp') && !!pn.querySelector('.v3-vp-h') && !!pn.querySelector('[data-s="sel"]') && l3sc.sel[0] === '' && l3sc.render === null;   // inget valt, ingenting kopplat
    const selEl = pn.querySelector('[data-s="sel"]'); selEl.value = A.id; selEl.dispatchEvent(new Event('change')); await w(500); const Ao = l3scById(A.id);
    out.chosen = l3sc.sel[0] === A.id && l3sc.render === 0 && document.querySelectorAll('#v3ScPanel .sc-a').length === 2;
    document.querySelector('#v3ScPanel [data-s="add"]').click(); await w(150); out.add = Ao.acts.length === 3 && Ao.acts[2].start === l3scDay();
    l3SelectIds([pm.id]); await w(700); out.selSync = !!document.querySelector('#v3ScPanel [data-s="addsel"]:not([disabled])');
    document.querySelector('#v3ScPanel [data-s="addsel"]').click(); await w(150); const last = Ao.acts[Ao.acts.length - 1]; out.addsel = last.pl.includes(pm.id) && !Ao.acts.find(a => a.id === 'a2').pl.includes(pm.id);
    document.querySelector('#v3ScPanel .sc-a:last-of-type [data-a="unlink"]').click(); await w(150); out.unlink = Ao.acts[Ao.acts.length - 1].pl.length === 0;
    const nm = document.querySelector('#v3ScPanel .sc-a:last-of-type [data-a="name"]'); nm.value = 'Kran'; nm.dispatchEvent(new Event('change')); out.rename = Ao.acts[Ao.acts.length - 1].name === 'Kran';
    document.querySelector('#v3ScPanel .sc-a:last-of-type [data-a="del"]').click(); await w(150); out.del = Ao.acts.length === 3;
    const sr = document.querySelector('#v3ScPanel [data-s="src"]'); sr.value = 'main'; sr.dispatchEvent(new Event('change')); await w(150); out.srcSet = Ao.src === 'main'; Ao.src = ''; l3scTouch(Ao);
    // appens datum styr visningen: byt datum, placerat objekt följer
    $('dateInput').value = '2026-02-01'; await w(900); out.followsDate = l3sc.date === '2026-02-01';
    // jämförelsen
    document.querySelector('#v3ScPanel [data-s="cmp"]').click(); await w(400); const cmp = document.getElementById('v3ScCmp'); out.cmpOpen = !!cmp && cmp.classList.contains('v3-dlg') && cmp.querySelectorAll('select[data-c^=sel]').length === 3;
    cmp.querySelector('[data-c="sel1"]').value = B.id; cmp.querySelector('[data-c="sel1"]').dispatchEvent(new Event('change')); await w(1200); out.cmpFigs = cmp.querySelectorAll('figure[data-k]').length >= 3 && /%/.test(cmp.querySelector('[data-pct="0"]').textContent);
    const cv = l3scCompose(); out.report = cv.width === 3300 && cv.height > 1500; const pdf = l3scPdfBytes(cv); out.pdf = String.fromCharCode(...pdf.slice(0, 8)) === '%PDF-1.4' && pdf.length > 8000;
    cmp.querySelector('[data-c="next"]').click(); await w(900); out.cmpDate = l3sc.date === '2026-02-08' && cmp.querySelector('[data-c="date"]').textContent === '2026-02-08';
    l3DlgClose('v3ScCmp'); await w(400); out.cmpClosed = (!document.getElementById('v3ScCmp') || document.getElementById('v3ScCmp').classList.contains('hidden')) && l3sc.cmpOpen === false && l3sc.render === 0;
    await w(900); out.saved = writes.length >= 1 && stored.some(x => x.id === A.id && x.acts.length === 3);
    l3scClose(); await w(300); out.closed = !document.getElementById('v3ScPanel') && l3sc.render === null && l3gm.mode === was;
    // 6) Ny session: allt sparat finns men inget är valt
    l3sc.sel = ['', '', '']; await l3scLoad(true); out.reload = l3sc.mine.length === 2 && l3sc.mine.find(x => x.id === A.id).acts.length === 3 && l3sc.sel.join('') === '';
    } catch (e) { out.ERR = e.message + ' @ ' + (e.stack || '').split('\n')[1]; }
    return out;
  });
  console.log(JSON.stringify(r)); if (errors.length) { console.error('FAIL JS-fel', errors.join(' | ').slice(0, 700)); process.exit(1); }
  const bad = Object.entries(r).filter(([k, v]) => v === false || k === 'ERR').map(x => x[0]); if (bad.length) { console.error('FAIL scenarier: ' + bad.join(',')); process.exit(1); }
  await browser.close(); server.close(); console.log('OK: tidplansscenarier – nollställda, egna aktiviteter och kopplade objekt, valfri koppling mot tidplanen, skillnadsvy, bygge, rapportbild/PDF');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
