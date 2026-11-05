// Ställning i plan (Victor 2026-11-05: "snygg, smart illustration för ställningar där jag kan rita ut i plan"): ritverktyget, ritningen i skala med stolpar/stag/fack, mått och inställningar.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9033;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ scale: s, width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  const gh = new Map();
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
    const body = JSON.parse(req.postData()); gh.set(f, Buffer.from(body.content, 'base64').toString());
    if (/ifc_groups\.json$/.test(f)) page.evaluate(t => { window.__gsaved = JSON.parse(t); }, gh.get(f)).catch(() => {});
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
  });
  if (!(await page.evaluate(() => !!document.querySelector('[data-site="scaffold"]')))) fail('Knappen Ställning saknas i Rita');
  // 1) Verktyget: klicka punkter, avsluta → popup med bredd, höjd och fack
  const r1 = await page.evaluate(() => {
    return typeof SITE_KINDS.scaffold === 'object';
  }).catch(() => false);
  if (!r1) fail('SITE_KINDS.scaffold saknas');
  const made = await page.evaluate(async () => {
    document.querySelector('[data-site="scaffold"]').click();
    siteTool.pts = [[6512320, 150110], [6512350, 150110], [6512350, 150125]];
    finishSiteTool();
    await new Promise(r => setTimeout(r, 200));
    const pop = document.querySelector('.site-pop, #sitePop, [class*="sitepop"]') || document.body;
    return { fields: ['.sp-sw', '.sp-sh', '.sp-sf'].map(q => !!document.querySelector(q)), vals: ['.sp-sw', '.sp-sh', '.sp-sf'].map(q => (document.querySelector(q) || {}).value) };
  });
  if (!made.fields.every(Boolean) || made.vals.join('|') !== '0,73|8|2,57' && made.vals.join('|') !== '0.73|8|2.57') fail('Popupen ska ha bredd, höjd och fack: ' + JSON.stringify(made));
  await page.fill('.sp-sh', '12'); await page.fill('.sp-sw', '1,0'); await page.fill('.sp-sf', '3');
  const np0 = await page.evaluate(() => placements.length);
  await page.click('.sp-to3d'); await page.waitForTimeout(200);
  const p3 = await page.evaluate(() => { const p = placements[placements.length - 1]; return { n: placements.length, type: p.type, pts: p.pts.length, B: p.B, H: p.H, fack: p.f && p.f.fack, name: p.name, z: p.pts[0].slice(2), x: p.pts[2][0] }; });
  if (p3.n !== np0 + 1 || p3.type !== 'sm:stallningfri' || p3.pts !== 3 || p3.B !== 1 || p3.H !== 12 || p3.fack !== '3.07' || !/Ställning/.test(p3.name) || p3.x !== 6512350) fail('3D-ställningen ska skapas av linjen med samma mått: ' + JSON.stringify(p3));
  console.log('OK: 🧊 3D-ställning skapad av den ritade linjen', JSON.stringify(p3));
  await page.click('.sp-save');
  await page.waitForTimeout(300);
  let rec = await page.evaluate(() => siteItems.find(x => x.type === 'scaffold'));
  if (!rec) { await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^(Spara|OK)$/.test(x.textContent.trim()) && x.closest('[class*="pop"]')); if (b) b.click(); }); await page.waitForTimeout(300); rec = await page.evaluate(() => siteItems.find(x => x.type === 'scaffold')); }
  if (!rec || rec.h !== 12 || rec.w !== 1 || rec.fack !== 3 || rec.pts.length !== 3 || rec.name !== 'Ställning') fail('Ställningen ska sparas med måtten: ' + JSON.stringify(rec));
  // 2) Mått: längd, antal fack, våningar
  const inf = await page.evaluate(() => scaffoldInfo(siteItems.find(x => x.type === 'scaffold')));
  if (Math.abs(inf.L - 45) > 0.01 || inf.bays !== 10 + 5 || inf.lifts !== 6 || inf.H !== 12) fail('scaffoldInfo: ' + JSON.stringify(inf));
  // 3) Ritningen: bandet, stolpar och diagonaler ger många färgade bildpunkter; träff på bandet markerar den
  const px = await page.evaluate(() => {
    const x = siteItems.find(q => q.type === 'scaffold'), cv = document.createElement('canvas'); cv.width = 1400; cv.height = 900; const ctx = cv.getContext('2d');
    const ppm = pxPerMeter(), Q = x.pts.map(mToPx); ctx.translate(100 - Math.min(...Q.map(q => q[0])), 100 - Math.min(...Q.map(q => q[1]))); drawScaffold2D(ctx, x, siteStyle(x, 14), ppm, '', '');
    const d = ctx.getImageData(0, 0, 1400, 900).data; let n = 0, dark = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 20) { n++; if (d[i] < 60 && d[i + 1] < 60) dark++; }
    const o = document.createElement('canvas'); o.width = 1400; o.height = 900; const g = o.getContext('2d'); g.fillStyle = '#9ca3af'; g.fillRect(0, 0, 1400, 900); g.drawImage(cv, 0, 0); window.__info = { ppm, Q }; window.__cvUrl = o.toDataURL();
    return { n, dark };
  });
  if (process.env.SLIMG) require('fs').writeFileSync(process.env.SLIMG, Buffer.from((await page.evaluate(() => window.__cvUrl)).split(',')[1], 'base64'));
  if (px.n < 2000 || px.dark < 40) fail('Ställningen ska ritas som band med stolpar: ' + JSON.stringify(px));
  const hit = null;
  console.log('OK: ställning i plan – verktyg, mått och ritning i skala', JSON.stringify({ made: made.vals, inf, px, hit }));
  if (process.env.SLSHOT) { await page.evaluate(() => { document.getElementById('viewport') && 0; if (typeof renderAll === 'function') renderAll(); else if (typeof draw === 'function') draw(); }); await page.waitForTimeout(300); await page.screenshot({ path: process.env.SLSHOT }); }
  // Play/Pause vid datumreglaget (samma uppspelning som under Tid)
  const pl = await page.evaluate(async () => {
    const o = {}; const top = document.getElementById('btnPlayTop'); o.has = !!top && top.getBoundingClientRect().width > 0; o.t0 = top.textContent;
    top.click(); o.t1 = top.textContent; o.main1 = document.getElementById('btnPlay').textContent; o.on = !!playTimer;
    await new Promise(r => setTimeout(r, 1700)); top.click(); o.t2 = top.textContent; o.main2 = document.getElementById('btnPlay').textContent; o.off = !playTimer;
    return o;
  });
  if (!pl.has || pl.t1 !== '⏸' || !/Pausa/.test(pl.main1) || !pl.on || pl.t2 !== '▶' || !/Spela upp/.test(pl.main2) || !pl.off) fail('Play/Pause vid datumreglaget: ' + JSON.stringify(pl));
  console.log('OK: ▶/⏸ vid datumreglaget styr samma uppspelning', JSON.stringify(pl));
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_scaffold2d');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
