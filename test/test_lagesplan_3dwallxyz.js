const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9094;
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
    const spec = () => { const s = { ...L3SW_DEF, kind: 'berlin' }; l3swpInit(s, true); s.p_cc = 2.5; return s; };
    const lag = r => (r.parts.find(p => /utfackning/.test(p.name)) || { vol: 0 }).vol;
    const a = l3swpBuild([[0, 0, 10], [20, 0, 10]], spec()), b = l3swpBuild([[0, 0, 10], [10, 0, 10], [20, 0, 10]], spec()), c = l3swpBuild([[0, 0, 10], [10, 0, 10], [10, 10, 10]], spec());
    out.straight = Math.round(lag(a) * 1000) / 1000; out.vertex = Math.round(lag(b) * 1000) / 1000; out.bend = Math.round(lag(c) * 1000) / 1000;
    out.noGap = Math.abs(lag(a) - lag(b)) / lag(a) < 0.03 && lag(c) > lag(a) * 0.85;
    out.dbg = [a.err, Object.keys(a).join(), (a.pos||[]).length]; out.pos = (a.pos||[]).length === 9 && a.pos[0].length === 4 && a.pos[0][2] === 10;
    const P = l3swpParseXYZ('168973.693 7456741.27 430.5\nP2;168975,2;7456741,3;430,5\n1 168976 7456742 431\n\nfel rad'); out.parse = P.pts.length === 3 && P.pts[1][0] === 168975.2 && P.pts[1][2] === 430.5 && P.pts[2][0] === 168976 && P.bad.length === 1;
    // klistra in: skapar pålar i koordinaterna
    l3SetPref('measure', 'wall'); l3SetTool('measure'); await w(200); out.entry = !!document.getElementById('v3SwPaste'); l3swpPaste(); const ta = document.getElementById('v3SwpTa'); ta.value = '6512330 150130 100\n6512332.5 150130 100\n6512335 150130.5 99.8'; ta.dispatchEvent(new Event('input')); await w(100);
    out.sum = document.getElementById('v3SwpSum').textContent; document.querySelector('#v3SwpPaste [data-go]').click(); await w(500);
    const cur = l3sw.cur; out.dbg2 = cur ? [cur.spec.kind, cur.spec.coords, cur.pts.length, cur.res && cur.res.err, cur.res && (cur.res.pos || []).length] : null; out.cur = !!cur && cur.spec.coords === true && cur.pts.length === 3 && !!cur.res && cur.res.pos.length === 3 && cur.res.parts.length >= 1 && cur.res.parts[0].vol > 0;
    if (!out.cur) return out;
    out.xy = cur && Math.abs(cur.res.pos[1][0] - 6512332.5) < 1e-6 && cur.res.pos[2][2] === 99.8;
    out.acts = !!document.querySelector('#v3WallPanel [data-swpt]') && !!document.querySelector('#v3WallPanel [data-swpp]');
    document.querySelector('#v3WallPanel [data-swpt]').click(); await w(300); out.tbl = document.querySelectorAll('#v3SwpTbl tbody tr').length === 3;
    return out;
  });
  console.log(JSON.stringify(r)); if (errors.length) { console.error('FAIL JS-fel', errors.join(' | ').slice(0, 400)); process.exit(1); }
  if (!r.noGap || !r.pos || !r.parse || !r.entry || !/3 pålar/.test(r.sum) || !r.cur || !r.xy || !r.acts || !r.tbl) { console.error('FAIL Pålkoordinater: ' + JSON.stringify(r)); process.exit(1); }
  await browser.close(); server.close(); console.log('OK: utfackningen faller inte bort vid brytpunkter, tabell X Y Z och pålar i inklistrade koordinater');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
