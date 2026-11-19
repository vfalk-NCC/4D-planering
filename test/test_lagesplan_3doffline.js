const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9331;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };


  const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64'), files = new Map();
  files.set('projects.json', b64([{ id: 'p1' }])); files.set('projects/p1/status_plans.json', b64([{ id: 'A', name: 'Plan 1', file_path: 'projects/p1/plan.pdf', zones: [], calib: { model: [[169000, 7456000, 400], [169100, 7456000, 400]], pdf: [[0, 0], [1000, 0]] } }]));
  files.set('projects/p1/pp/activities.json', b64([{ id: 'a1', name: 'Gjutning' }])); files.set('projects/p1/sub/x.json', b64({ k: 1 })); files.set('projects/p1/plan.pdf', Buffer.from('%PDF-1.4 testplan').toString('base64'));
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 850 } });
  const pg = await ctx.newPage(); await require('./_dialogs').bridge(pg, d => d.accept()); const errors = []; pg.on('pageerror', e => errors.push(e.message));
  await pg.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await pg.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  await pg.route('https://api.github.com/**', r => {
    const req = r.request(), u = new URL(req.url()), f = decodeURIComponent(u.pathname.replace(/^\/repos\/[^/]+\/[^/]+\/contents\/?/, ''));
    if (/rate_limit/.test(u.pathname)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    if (req.method() === 'GET') {
      if (f === '' || [...files.keys()].some(k => k.startsWith(f + '/')) && !files.has(f)) { const pre = f ? f + '/' : '', seen = new Map(); [...files.keys()].filter(k => k.startsWith(pre)).forEach(k => { const rest = k.slice(pre.length), n = rest.split('/')[0], isDir = rest.includes('/'); seen.set(n, { name: n, path: pre + n, type: isDir ? 'dir' : 'file', size: isDir ? 0 : Buffer.from(files.get(k), 'base64').length }); }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([...seen.values()]) }); }
      const b = files.get(f); if (b == null) return r.fulfill({ status: 404, body: '{}' }); if (/raw/.test(req.headers()['accept'] || '')) return r.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.from(b, 'base64') }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: b, sha: 's' + b.length, size: b.length }) });
    }
    const body = JSON.parse(req.postData()); files.set(f, body.content); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + body.content.length } }) });
  });
  await pg.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await pg.waitForTimeout(900);
  await pg.evaluate(async () => { plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[169000, 7456000, 400], [169100, 7456000, 400]], pdf: [[0, 0], [1000, 0]] }, zones: [] }]; pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A'); });
  await pg.click('#btn3d'); await pg.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3ofPrepare === 'function', null, { timeout: 15000 });
  const ok = (c, m) => { if (!c) fail(m); };
  // 1) Förbered (online): program, data och binärfiler sparas
  const R = await pg.evaluate(async () => { const r = await l3ofPrepare(() => {}); return { app: r.app, data: r.data, bin: r.bin, failed: r.failed, appFail: r.appFail, cachedFiles: (await offlineSync.cachedFiles()).sort(), bins: (await offlineSync.cachedBins()).map(x => x.path) }; });
  ok(R.app > 200 && R.data === 4 && R.bin === 1 && !R.failed.length && R.cachedFiles.includes('projects/p1/pp/activities.json') && R.cachedFiles.includes('projects.json') && R.bins.join() === 'projects/p1/plan.pdf', 'Förberedelsen: ' + JSON.stringify(R));
  // 2) Offline: läsa, binär, skriva (kö)
  await ctx.setOffline(true); await pg.waitForTimeout(300);
  const off = await pg.evaluate(async () => {
    const g = await ghGetFile(token, 'projects/p1/pp/activities.json', { fresh: true }); const u = await ghReadBinaryUrl(token, 'projects/p1/plan.pdf'), txt = await (await fetch(u)).text();
    await ghWriteJSON(token, 'projects/p1/pp/activities.json', arr => [...arr, { id: 'a2', name: 'Ny offline' }], 'Offline-ändring'); const p = await offlineSync.pending();
    const again = await ghGetFile(token, 'projects/p1/pp/activities.json', { fresh: true });
    await l3ofOpen(); await new Promise(r => setTimeout(r, 200)); return { n: g.data.length, txt, pend: p.map(x => x.path), again: again.data.map(x => x.id).join(), panel: document.getElementById('v3OffPanel').textContent.replace(/\s+/g, ' ') };
  });
  ok(off.n === 1 && /testplan/.test(off.txt) && off.pend.join() === 'projects/p1/pp/activities.json' && off.again === 'a1,a2', 'Offline: läsa, ritningen och köad skrivning: ' + JSON.stringify(off));
  ok(/Offline/.test(off.panel) && /pp\/activities\.json/.test(off.panel) && /Väntande ändringar/.test(off.panel) && /Du är offline/.test(off.panel), 'Offline-panelen visar kön: ' + off.panel.slice(0, 300));
  // 3) Tillbaka online: kön skickas
  await ctx.setOffline(false); await pg.evaluate(() => window.dispatchEvent(new Event('online'))); await pg.waitForFunction(() => offlineSync.state.pending === 0, null, { timeout: 15000 });
  const sent = JSON.parse(Buffer.from(files.get('projects/p1/pp/activities.json'), 'base64').toString()); ok(sent.length === 2 && sent[1].id === 'a2', 'Köade ändringen skickades när nätet kom tillbaka: ' + JSON.stringify(sent));
  ok(!errors.length, 'Sidfel: ' + errors.join(' | '));
  console.log('OK: förbered för offline – program, data och ritningar sparas; läsa/skriva utan nät (kö); panelen; skickas när nätet är tillbaka');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
