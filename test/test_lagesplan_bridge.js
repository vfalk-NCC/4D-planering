// Kopplingen till 4D-planering efter en omladdning (Victor 2026-10-11: "Kunde inte läsa mapparna i Trimble Connect:
// 4D-planering är inte öppen … Tror den liksom laddar in det två gånger och då tappar det kopplingen mot TC").
// En låtsad 4D-planering öppnar lägesplanen och skickar signalen som app.js skickar; i lägesplanen finns ingen
// window.opener (som efter att iPhone laddat om fliken). Lägesplanen ska ändå få token och kunna läsa mapparna.
// Utan signal (ingen 4D-planering alls) ska 3D-vyns mappflik visa en förklaring i stället för ett fel.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9011;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => { c.fillStyle = '#fff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} }; } };
  } }) }) };`;
// Samma signal som app.js (lagesplanWin + setInterval), plus svar på hello och tcFolder.
const STUB = `<!doctype html><meta charset="utf-8"><title>4D</title><script>
let lagesplanWin = null; window.__asked = [];
setInterval(() => { try { if (lagesplanWin && !lagesplanWin.closed) lagesplanWin.postMessage({ lagesplanPing: true }, location.origin); } catch (e) {} }, 500);
window.addEventListener('message', e => {
  if (e.origin !== location.origin || !e.data || !e.data.lagesplan) return;
  const m = e.data; window.__asked.push(m.type);
  const reply = p => e.source.postMessage({ lagesplanReply: true, reqId: m.reqId, ...p }, location.origin);
  if (m.type === 'hello') reply({ settings: { githubToken: 'tok-4d', userName: 'Victor' }, projectId: 'p1' });
  else if (m.type === 'tcFolder') reply({ folderId: 'root', projectName: 'Kvarteret', items: [{ id: 'f1', name: 'Modeller', type: 'folder' }] });
  else reply({});
});
</script>`;

(async () => {
  const server = http.createServer((q, r) => {
    const u = q.url.split('?')[0];
    if (u === '/stub4d.html') { r.writeHead(200, { 'Content-Type': 'text/html' }); return r.end(STUB); }
    fs.readFile(path.join(DOCS, decodeURIComponent(u)), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': u.endsWith('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } });
  }).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 850 } });
    await ctx.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
    let auth = null;
    await ctx.route('https://api.github.com/**', r => { auth = auth || r.request().headers()['authorization']; r.fulfill({ status: 404, body: '{}' }); });
    const stub = await ctx.newPage();
    await stub.goto(`http://localhost:${PORT}/stub4d.html`);
    const [lp] = await Promise.all([ctx.waitForEvent('page'), stub.evaluate(p => { lagesplanWin = window.open(`lagesplan.html?project=p1`, 'lagesplan-p1', 'popup=yes'); }, PORT)]);
    await require('./_dialogs').bridge(lp);
    const errors = []; lp.on('pageerror', e => errors.push(e.message));
    await lp.waitForFunction(() => typeof token !== 'undefined' && token, null, { timeout: 15000 });
    // Som när iPhone laddar om fliken: kopplingen (window.opener) klipps och sidan laddas om – ingen egen token.
    await lp.evaluate(() => { window.opener = null; localStorage.removeItem('4dplan-settings'); localStorage.removeItem('4dplan-unlocked'); });
    await stub.evaluate(() => { window.__asked = []; });
    await lp.reload();
    await lp.waitForFunction(() => typeof bridgeOk === 'function' && typeof token !== 'undefined' && token, null, { timeout: 15000 });
    const st = await lp.evaluate(async () => ({ opener: !!window.opener, ok: bridgeOk(), token, src: tokenSource, folder: await askOpener('tcFolder', {}, 5000).then(r => r.projectName).catch(e => 'FEL ' + e.message) }));
    if (st.opener !== false || !st.ok || st.token !== 'tok-4d' || st.src !== '4D-planering' || st.folder !== 'Kvarteret') fail('Kopplingen efter omladdning: ' + JSON.stringify(st));
    if (!(await stub.evaluate(() => window.__asked.includes('hello')))) fail('Lägesplanen ska hämta inställningarna från 4D-planering');
    console.log('OK: utan window.opener hittar lägesplanen tillbaka till 4D-planering (token och mapparna i TC)');

    // Utan 4D-planering: mappfliken i 3D förklarar i stället för att visa ett fel.
    const solo = await ctx.newPage();
    await require('./_dialogs').bridge(solo);
    await solo.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
    const t0 = Date.now();
    await solo.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`);
    await solo.waitForFunction(() => typeof plans !== 'undefined' && typeof openPlan === 'function' && document.getElementById('boot') ? document.getElementById('boot').classList.contains('hidden') || true : true, null, { timeout: 15000 });
    await solo.waitForTimeout(3000);
    await solo.evaluate(async () => {
      plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
      pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = [];
      renderPlanSelect(); await openPlan('A');
    });
    await solo.evaluate(() => { open3d(); });
    await solo.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3LayersRender === 'function', null, { timeout: 15000 });
    await solo.evaluate(() => { l3SetPref('laySort', 'tree'); l3PalTab('layers'); l3LayersRender(); });
    await solo.waitForTimeout(300);
    const txt = await solo.evaluate(() => document.getElementById('v3PalLayers').textContent);
    if (/Kunde inte läsa mapparna/.test(txt) || !/går att bläddra i när lägesplanen är öppnad/.test(txt)) fail('Mappfliken utan 4D-planering: ' + txt.slice(0, 300));
    console.log('OK: utan 4D-planering förklarar mappfliken i stället för att visa ett fel');
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
