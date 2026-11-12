const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9096;
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
    const out = {}, w = ms => new Promise(r => setTimeout(r, ms)); await w(1200);
    const mk = (kind, extra, pts) => { const sp = { ...L3SW_DEF, kind }; l3swpInit(sp, true); Object.assign(sp, extra || {}); return { sp, r: l3swpBuild(pts || [[0, 0, 100], [8, 0, 100], [12, 5, 100]], sp) }; };
    const names = (x) => x.r.parts.map(p => p.name.split(' ')[0] + ' ' + (p.name.split(' ')[1] || ''));
    const has = (x, re) => x.r.parts.some(p => re.test(p.name) && p.vol > 0 && p.mesh.faces.length > 0);
    const ok = (x) => x.r.parts.every(p => p.mesh.faces.every(f => f.every(i => i >= 1 && i <= p.mesh.pts.length)));
    const beamC = mk('berlin', { beam: 'conc', anch: true, plug: true });
    out.berlin = has(beamC, /Kantbalk/) && has(beamC, /Ankare/) && has(beamC, /Injektering/) && has(beamC, /Ankarplattor/) && has(beamC, /Betongplugg/) && ok(beamC);
    const sh = mk('sheet', { beam: 'steel', anch: true, anch_n: 3 }); const sh0 = mk('sheet', { lock: false }), sh1 = mk('sheet', {});
    out.sheet = has(sh, /Fångbalk/) && has(sh, /Ankare/) && sh1.r.parts[0].vol > sh0.r.parts[0].vol * 1.001 && ok(sh);
    const bo = mk('bored', { cage: true, beam: 'conc' }); out.bored = has(bo, /Armeringskorgar/) && has(bo, /Kantbalk/) && ok(bo);
    const tu = mk('tube', { shoe: true, cap: true, fill: true, fillH: 4, anch: true }); out.tube = has(tu, /Pålsko/) && has(tu, /Toppplatta/) && has(tu, /Betongfyllning/) && has(tu, /Ankare/) && has(tu, /plattspont/) && ok(tu);
    const co0 = mk('conc', {}), co = mk('conc', { tip: true, tipL: 0.8 }); out.conc = co.r.parts[0].vol < co0.r.parts[0].vol && co.r.parts[0].vol > co0.r.parts[0].vol * 0.9 && ok(co);
    const ti = mk('timber', { shoe: true, treat: 'imp' }); out.timber = has(ti, /Pålsko/) && ti.r.parts[0].color === '#5d7a4f';
    const sl = mk('slits', { panel: 3, beam: 'conc' }); out.slits = has(sl, /Slitsfogar/) && has(sl, /Kantbalk/) && ok(sl);
    // spont per mellanrum: en bock per mellanspont
    const base = mk('tube', { coords: true }, [[0, 0, 100], [1, 0, 100], [2, 0, 100], [3, 0, 100]]); const nsp = x => (x.r.parts.find(p => /plattspont/.test(p.name)) || { name: '0 st' }).name.match(/(\d+) st/)[1] | 0;
    const off = mk('tube', { coords: true }, [[0, 0, 100, null, null, null, true], [1, 0, 100, null, null, null, false], [2, 0, 100, null, null, null, true], [3, 0, 100]]);
    out.gapAll = nsp(base) === 3 && base.r.pos[0][6] === true && base.r.pos[3][6] === null; out.gapOne = nsp(off) === 2 && off.r.pos[1][6] === false && off.r.pos[2][6] === true;
    // panel + tabell
    l3SetPref('measure', 'wall'); l3SetTool('measure'); await w(200); const sp3 = { ...L3SW_DEF, kind: 'tube' }; l3swpInit(sp3, true); sp3.p_cc = 1.2; l3swOpen({ pts: [[6512330, 150130, 100], [6512335, 150130, 100]], spec: sp3 }); await w(300);
    const pn = document.getElementById('v3WallPanel'); out.panel = !!pn.querySelector('[data-wpchk="shoe"]') && !!pn.querySelector('[data-wpsel="beam"]') && !!pn.querySelector('[data-wpchk="anch"]');
    const bs = pn.querySelector('[data-wpsel="beam"]'); bs.value = 'steel'; bs.dispatchEvent(new Event('change')); await w(200); out.beamUi = !!document.querySelector('#v3WallPanel [data-wp="beam_b"]') && l3sw.cur.res.parts.some(p => /Fångbalk/.test(p.name));
    document.querySelector('#v3WallPanel [data-swpt]').click(); await w(300); const dlg = document.getElementById('v3SwpTbl'); out.resize = dlg.style.resize === 'both';
    const cbs = dlg.querySelectorAll('input[data-sp]'); out.cb = cbs.length === l3sw.cur.res.pos.length - 1 && [...cbs].every(c => c.checked);
    cbs[0].checked = false; cbs[0].dispatchEvent(new Event('change', { bubbles: true })); await w(100); out.cbOff = !l3sw.cur.res.parts.some(p => /plattspont/.test(p.name) && /(\d+) st/.exec(p.name)[1] > 4) && l3sw.cur.res.pos[0][6] === false && l3sw.cur.res.pos[1][6] === true;
    l3swClose(); return out;
  });
  console.log(JSON.stringify(r)); if (errors.length) { console.error('FAIL JS-fel', errors.join(' | ').slice(0, 500)); process.exit(1); }
  const bad = Object.entries(r).filter(([k, v]) => v !== true).map(x => x[0]); if (bad.length) { console.error('FAIL detaljer: ' + bad.join(',')); process.exit(1); }
  await browser.close(); server.close(); console.log('OK: påltyper och spont – detaljer, tillägg, bock per mellanspont');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
