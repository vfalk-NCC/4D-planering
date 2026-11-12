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
    out.icon = !!document.querySelector('#v3Original svg circle');
    return out;
  });
  console.log(JSON.stringify(r));
  if (r.rows !== 10 || !r.plan || !r.planToggle || !r.hasClick || !r.orig || !r.tlOrig || !r.tlProg || !r.off || !r.clickOff || !r.pulse || !r.icon) fail('Visning-dropdown: ' + JSON.stringify(r));
  if (errors.length) fail('JS-fel: ' + errors.join(' | '));
  await browser.close(); server.close(); console.log('OK: Visning-dropdown');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
