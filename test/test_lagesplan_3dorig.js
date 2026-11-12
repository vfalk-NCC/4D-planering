const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9076;
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
  await page.evaluate(() => { document.getElementById('v3Original').click(); });
  await page.waitForSelector('#v3OrigPop:not(.hidden)');
  const r = await page.evaluate(async () => {
    const out = {}, sw = k => document.querySelector(`[data-os="${k}"]`), click = k => { const e = sw(k); e.checked = !e.checked; e.dispatchEvent(new Event('change')); };
    out.rows = document.querySelectorAll('#v3OrigPop [data-os]').length; out.hasClick = !!sw('bubClick') && sw('bubClick').checked;
    click('orig'); out.orig = l3b.orig === true && sw('orig').checked;
    click('tlOrig'); out.tlOrig = l3gm.mode === 'time' && l3gmCfg().origCol === true && !l3b.orig && sw('tlOrig').checked && !sw('tlProg').checked;
    click('tlProg'); out.tlProg = l3gm.mode === 'time' && l3gmCfg().origCol === false && sw('tlProg').checked;
    click('tlProg'); out.off = l3gm.mode === 'off';
    click('bubClick'); out.clickOff = l3Prefs().bubClick === false;
    click('pulse'); out.pulse = l3gmCfg().pulse === true;
    out.plan = !!sw('plan'); { const c = document.getElementById('v3ShowPlan'), was = c.checked; click('plan'); out.planToggle = c.checked !== was; }
    { l3gmSet('origCol', true); l3gmSet('future', true); l3gmSet('futureOp', 40); l3gm.mode = 'time'; l3gm.next = [];
      const fut = l3gmRange([{ id: 'a', start_date: '2030-01-01', end_date: '2030-02-01', progress: 0 }], '2026-11-12', null), cur = l3gmRange([{ id: 'b', start_date: '2026-11-01', end_date: '2026-12-01', progress: 50 }], '2026-11-12', { mesh: 1, ri: 2 });
      out.ghost = !!fut && fut.alpha === 0.4 && fut.orig === true; out.act = l3gm.next.length === 1 && !!cur && cur.orig === true;
      l3gmSet('future', false); const hid = l3gmRange([{ id: 'a', start_date: '2030-01-01', end_date: '2030-02-01' }], '2026-11-12', null); out.hid = !!hid && hid.off === true; l3gm.mode = 'off'; l3gmSet('origCol', false); l3gmSet('future', false); }
    out.startToday = !!sw('startToday') && sw('startToday').checked; click('startToday'); out.stOff = l3Prefs().startToday === false; click('startToday'); out.stOn = l3Prefs().startToday !== false;
    { // sparad vy: Visning-menyn kommer tillbaka exakt
      click('tlOrig'); l3gmSet('pulse', true); l3gmSet('future', true); l3gmSet('futureOp', 40); l3SetPref('bubClick', false); l3SetPref('bubOn', true);
      const v = l3SaveView('Visn-test'), has = !!v.visn && v.visn.mode === 'time' && v.visn.gm.origCol === true && v.visn.prefs.bubClick === false;
      l3gmSetMode('off', true); l3gmSet('pulse', false); l3gmSet('future', false); l3gmSet('futureOp', 80); l3gmSet('origCol', false); l3SetPref('bubClick', true); l3SetPref('bubOn', false); l3Original(true);
      const i = l3SavedViews().findIndex(x => x.name === 'Visn-test'); l3GoView(i); await new Promise(r => setTimeout(r, 600));
      out.viewSave = has && l3gm.mode === 'time' && !l3b.orig && l3gmCfg().origCol === true && l3gmCfg().pulse === true && l3gmCfg().future === true && l3gmCfg().futureOp === 40 && l3Prefs().bubClick === false && l3Prefs().bubOn === true;
      l3gmSetMode('off', true); l3gmSet('pulse', false); l3gmSet('future', false); l3gmSet('origCol', false); l3SetPref('bubClick', true); l3SetPref('bubOn', false); l3DelView(i);
    }
    { // objektmapparnas tänd/släck + lager följer med vyn
      const P = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]], F = [[1,3,2],[1,4,3],[5,6,7],[5,7,8],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,4,8],[3,8,7],[4,1,5],[4,5,8]];
      const a = modCreate({ k: 'mesh', pts: P, faces: F, closed: true }, [6512330, 150130, 100], { name: 'VA' }), b = modCreate({ k: 'mesh', pts: P, faces: F, closed: true }, [6512335, 150130, 100], { name: 'VB' });
      l3mnVis([b.id], false, 'släck'); const v = l3SaveView('Obj-test'), saved = !!v.hid && v.hid.place.includes(b.id) && !!v.lager;
      l3mnVis([b.id], true, 'tänd'); l3PlacedShow(false); const i = l3SavedViews().findIndex(x => x.name === 'Obj-test'); l3GoView(i); await new Promise(r => setTimeout(r, 600));
      out.viewObj = saved && l3.hidden.has(b.id) && !l3.hidden.has(a.id) && l3Prefs().placedOn !== false; l3DelView(i); l3mnVis([b.id], true, 'tänd');
    }
    { const pr = document.getElementById('v3OrigPop').getBoundingClientRect(), cr = document.getElementById('v3Canvas').getBoundingClientRect(); out.inView = pr.top >= cr.top - 0.5 && pr.bottom <= cr.bottom + 0.5; }
    out.icon = !!document.querySelector('#v3Original svg circle');
    return out;
  });
  console.log(JSON.stringify(r));
  if (r.rows !== 11 || !r.plan || !r.planToggle || !r.hasClick || !r.orig || !r.tlOrig || !r.tlProg || !r.off || !r.clickOff || !r.pulse || !r.icon || !r.inView || !r.viewSave || !r.viewObj || !r.startToday || !r.stOff || !r.stOn || !r.ghost || !r.act || !r.hid) fail('Visning-dropdown: ' + JSON.stringify(r));
  if (errors.length) fail('JS-fel: ' + errors.join(' | '));
  await browser.close(); server.close(); console.log('OK: Visning-dropdown');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
