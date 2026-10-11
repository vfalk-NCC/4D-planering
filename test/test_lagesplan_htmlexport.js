// Fristående HTML-export (Victor 2026-10-11, efter BubbleBIM): lägesplanen och 3D i EN fil som kan skickas till
// någon utan Trimble Connect och öppnas offline. Testet exporterar, öppnar filen i en ny sida utan nät och
// kontrollerar 2D-bilden, 3D-scenen (objekten och marken) och att inga fel uppstår.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9005;
const OUT = process.env.PLACE_TMP || path.join(__dirname, '..', '.tmp');
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); c.fillStyle = '#2563eb'; c.fillRect(v.width * 0.2, v.height * 0.3, v.width * 0.3, v.height * 0.3); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
const PAKO = `window.pako = { gzip: s => new TextEncoder().encode(String(s)), ungzip: (u, o) => new TextDecoder().decode(u) };`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 850 }, acceptDownloads: true });
    const page = await ctx.newPage();
    await require('./_dialogs').bridge(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); window.__hxKeep = true; });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: /pako/.test(r.request().url()) ? PAKO : PDFJS }));
    const gh = new Map([['projects/p1/plan_placements.json', JSON.stringify([
      { id: 'k1', type: 'tornkran', name: 'Kran 1', x: 6512320, y: 150110, z: 0, L: 1.6, B: 1.6, H: 40, R: 50, rot: 0, dz: 0, color: '#facc15' },
      { id: 'b1', type: 'bod', name: 'Bod A', x: 6512340, y: 150105, z: 0, L: 8.4, B: 3, H: 2.7, rot: 0, dz: 0, color: '#f59e0b' }])]]);
    await page.route('https://api.github.com/**', r => {
      const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
      if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
      const body = JSON.parse(req.postData() || '{}'); gh.set(f, Buffer.from(body.content || '', 'base64').toString());
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
    });
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
    await page.evaluate(async () => {
      plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
      pdfCache.set('A', new Uint8Array([1]).buffer);
      items = []; positions = [];
      renderPlanSelect(); await openPlan('A');
    });
    await page.waitForTimeout(500);
    if (await page.evaluate(() => placements.length) !== 2) await page.evaluate(pl => { placements = pl; }, JSON.parse(gh.get('projects/p1/plan_placements.json')));

    // Knappen finns i Export; exporten från 2D öppnar 3D en kort stund och stänger det igen.
    if (!(await page.$('#btnHtmlOffline'))) fail('Knappen Fristående HTML saknas');
    const dls = []; page.on('download', x => dls.push(x.suggestedFilename()));
    const dl = page.waitForEvent('download', { timeout: 60000 });
    const res = await page.evaluate(() => exportOfflineHtml());
    const d = await dl;
    if (!res || !res.html) fail('Exporten gav inget: ' + JSON.stringify(res && { ...res, html: !!res.html }));
    // (Testwebbläsaren byter namn med å/ä/ö mot "download" – namnet kontrolleras i exportens resultat.)
    if (!/^Lägesplan – Plan 1 \d{4}-\d{2}-\d{2}\.html$/.test(res.name) || dls.length !== 1 || !d) fail('Filnamn: ' + res.name + ' ' + JSON.stringify(dls));
    if (!(res.tris > 0)) fail('3D-scenen ska ha trianglar: ' + res.tris);
    if (await page.evaluate(() => !document.getElementById('view3d').classList.contains('hidden'))) fail('3D ska stängas igen efter exporten från 2D');
    if (/src="(https?:)?\/\//.test(res.html) || /<script src=/.test(res.html)) fail('Filen ska inte hämta något utifrån');
    const file = path.join(OUT, 'hx-export.html'); fs.writeFileSync(file, res.html);

    // Öppna filen offline i en ny sida.
    const ctx2 = await browser.newContext({ viewport: { width: 1200, height: 800 }, offline: true });
    const v = await ctx2.newPage(); const err2 = []; v.on('pageerror', e => err2.push(e.message));
    let ext = 0; await v.route('**', r => { if (!r.request().url().startsWith('file:') && !r.request().url().startsWith('data:')) ext++; r.continue(); });
    await v.goto('file://' + file);
    const two = await v.evaluate(() => { const i = document.getElementById('img'); return { w: i.naturalWidth, h: i.naturalHeight, title: document.title, tabs: document.querySelectorAll('.tabs button').length }; });
    if (!(two.w > 1000 && two.h > 400) || two.title !== 'Lägesplan – Plan 1' || two.tabs !== 2) fail('2D i filen: ' + JSON.stringify(two));
    await v.screenshot({ path: path.join(OUT, 'hx-2d.png') });
    await v.click('.tabs button[data-t="3"]');
    await v.waitForFunction(() => window.__hx3, null, { timeout: 20000 });
    const three = await v.evaluate(() => { let tex = 0; window.__hx3.scene.traverse(o => { if (o.isMesh && o.material.map) tex++; }); const names = []; window.__hx3.scene.traverse(o => { (o.userData.names || []).forEach(n => names.push(n[2])); }); return { meshes: window.__hx3.meshes, tex, names: [...new Set(names)].sort().join() }; });
    if (!(three.meshes >= 2) || three.tex !== 1 || three.names !== 'Bod A,Kran 1') fail('3D i filen: ' + JSON.stringify(three));
    await v.waitForTimeout(400);
    await v.screenshot({ path: path.join(OUT, 'hx-3d.png') });
    if (ext) fail('Filen försökte hämta ' + ext + ' resurser utifrån');
    if (err2.length) fail('Fel i den exporterade filen: ' + err2.join(' | '));
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('OK htmlexport', JSON.stringify({ mb: (res.size / 1e6).toFixed(2), tris: res.tris, meshes: three.meshes }));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
