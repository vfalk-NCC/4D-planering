const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9066;
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
  const store = {}; let shaN = 1, putCount = 0, netDown = false; const b64 = s => Buffer.from(s, 'utf8').toString('base64');
  await page.route('https://api.github.com/**', async r => {
    if (netDown) return r.abort('internetdisconnected');
    const u = new URL(r.request().url()), m = u.pathname.match(/\/contents\/(.+)$/); if (!m) return r.fulfill({ status: 200, body: '{}' });
    const f = decodeURIComponent(m[1]);
    if (r.request().method() === 'GET') { const o = store[f]; return o ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ content: b64(JSON.stringify(o.data)), sha: o.sha, encoding: 'base64' }) }) : r.fulfill({ status: 404, body: '{}' }); }
    const body = JSON.parse(r.request().postData()); const raw = Buffer.from(body.content, 'base64'); let txt; try { txt = require('zlib').gunzipSync(raw).toString(); } catch (e) { txt = raw.toString(); }
    putCount++; const sha = 's' + (++shaN); store[f] = { data: JSON.parse(txt), sha }; return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ content: { sha } }) });
  });
  store['data/x.json'] = { data: [{ id: 1, n: 'a' }], sha: 's1' };
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  const tok = 'tok';
  const r1 = await page.evaluate(async tok => { const a = await ghGetFile(tok, 'data/x.json', { fresh: true }); await new Promise(r => setTimeout(r, 300)); return a; }, tok);
  if (!r1.data || r1.data[0].n !== 'a') fail('läsning fel ' + JSON.stringify(r1));
  netDown = true; await page.context().setOffline(true);
  const r2 = await page.evaluate(async tok => { const a = await ghGetFile(tok, 'data/x.json', { fresh: true }); const w = await ghWriteJSON(tok, 'data/x.json', arr => [...arr, { id: 2, n: 'b' }], 'offline'); await new Promise(r => setTimeout(r, 200)); const again = await ghGetFile(tok, 'data/x.json', { fresh: true }); return { a, w, again, st: offlineSync.state, badge: document.getElementById('offlineBadge') && document.getElementById('offlineBadge').textContent }; }, tok);
  console.log(JSON.stringify(r2));
  if (!r2.a.data || r2.a.data.length !== 1) fail('offline-läsning fick inte cachen');
  if (r2.w.length !== 2 || r2.again.data.length !== 2 || r2.st.pending !== 1 || !/Offline/.test(r2.badge || '')) fail('offline-skrivning hamnade inte i kön');
  if (putCount !== 0) fail('skickade ändå');
  netDown = false; await page.context().setOffline(false);
  await page.evaluate(async () => { settings.githubToken = 'tok'; await offlineSync.flush(); });
  await page.waitForTimeout(500);
  if (putCount !== 1 || store['data/x.json'].data.length !== 2) fail('kön skickades inte när nätet kom tillbaka: ' + putCount);
  // Konflikt: någon annan ändrar filen medan vi är offline → inget skrivs över
  netDown = true; await page.context().setOffline(true);
  await page.evaluate(async tok => { await ghWriteJSON(tok, 'data/x.json', arr => [...arr, { id: 3, n: 'c' }], 'offline2'); }, tok);
  store['data/x.json'] = { data: [{ id: 1 }, { id: 2 }, { id: 99, n: 'annan' }], sha: 's77' };
  netDown = false; await page.context().setOffline(false);
  await page.evaluate(async () => { await offlineSync.flush(); }); await page.waitForTimeout(400);
  const cf = await page.evaluate(async () => (await offlineSync.conflicts()).length);
  if (cf !== 1 || store['data/x.json'].sha !== 's77' || putCount !== 1) fail('konflikt hanterades fel: ' + cf + ' ' + putCount);
  console.log('OK: offline-cache läser senast hämtade data, väntekö skickas när nätet är tillbaka, konflikt skriver inte över');
  if (errors.length) fail('sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
