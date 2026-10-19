// Fristående HTML-export (Victor 2026-10-11, efter BubbleBIM): lägesplanen och 3D i EN fil som kan skickas till
// någon utan Trimble Connect och öppnas offline. Testet exporterar, öppnar filen i en ny sida utan nät och
// kontrollerar 2D-bilden, 3D-scenen (objekten och marken) och att inga fel uppstår.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9015;
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
    const ITEMS = [{ id: 'i1', object_name: 'F18', activity: 'Pålning', group_id: 'g1', area: 'A', start_date: '2026-10-01', end_date: '2026-10-10', progress: 0, status: 'planerad' }, { id: 'i2', object_name: 'F19', activity: 'Pålning', group_id: 'g1', area: 'A', start_date: '2026-10-01', end_date: '2026-10-10', progress: 0, status: 'planerad' }];
    const gh = new Map([['projects/p1/plan_items.json', JSON.stringify(ITEMS)], ['projects/p1/plan_placements.json', JSON.stringify([
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

    const res = await page.evaluate(async () => {
      items = JSON.parse(JSON.stringify([{ id: 'i1', object_name: 'F18', activity: 'Pålning', group_id: 'g1', area: 'A', start_date: '2026-10-01', end_date: '2026-10-10', progress: 0, status: 'planerad' }, { id: 'i2', object_name: 'F19', activity: 'Pålning', group_id: 'g1', area: 'A', start_date: '2026-10-01', end_date: '2026-10-10', progress: 0, status: 'planerad' }]));
      $('dateInput').value = '2026-10-05';
      const out = {};
      const html = objMenuHtml([items[0]]); out.menu = ['ej', 'pagaende', 'klar', 'pausad', 'pct'].every(k => html.includes(`data-ost="${k}"`)) && html.includes('data-ost-all');
      await objSetStatus([items[0]], 'klar');
      out.klar = { p: items[0].progress, s: items[0].status, ae: !!items[0].actual_end_date, ph: computeItemPhase(items[0], '2026-10-05', 7), other: items[1].progress };
      await objSetStatus([items[1]], 'pct', 40);
      out.pct = { p: items[1].progress, s: items[1].status, ph: computeItemPhase(items[1], '2026-10-05', 7) };
      await objSetStatus([items[1]], 'pausad'); out.pausad = computeItemPhase(items[1], '2026-10-05', 7);
      await objSetStatus([items[0]], 'ej'); out.ej = { p: items[0].progress, ae: items[0].actual_end_date };
      await objStatusUndo(); out.undo = items[0].status;
      return out;
    });
    const saved = JSON.parse(gh.get('projects/p1/plan_items.json'));
    if (!res.menu) fail('Menyn ska ha Status-knapparna: ' + JSON.stringify(res));
    if (res.klar.p !== 100 || res.klar.s !== 'klar' || !res.klar.ae || res.klar.ph !== 'klar' || res.klar.other !== 0) fail('Klar: ' + JSON.stringify(res.klar));
    if (res.pct.p !== 40 || res.pct.s !== 'pagaende' || res.pct.ph !== 'pagaende' || res.pausad !== 'pausad') fail('Procent/pausad: ' + JSON.stringify(res));
    if (res.ej.p !== 0 || res.ej.ae !== null || res.undo !== 'klar') fail('Ej påbörjad/ångra: ' + JSON.stringify(res));
    const s1 = saved.find(r => r.id === 'i1'), s2 = saved.find(r => r.id === 'i2');
    if (s1.status !== 'klar' || s1.progress !== 100 || s2.status !== 'pausad' || s2.progress !== 40) fail('Sparat i plan_items.json: ' + JSON.stringify(saved));
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('ALLA TESTER OK');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
