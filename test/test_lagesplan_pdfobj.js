// En PDF med egna lager (Victors önskemål 2026-10-26): lagren blir egna rader (tänd/släck), och objekten (textrutor, vägar, skyltar)
// kan göras redigerbara – egna objekt i användarlager som går att markera, flytta och som ritas som vanligt.
// Kräver pdf.js (hämtas ur tools/smoke/.cache om den finns; annars hoppas testet över).
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PDFJS_DIR = path.join(__dirname, '..', 'tools', 'smoke', '.cache', 'pdfjs-dist_3.11.174', 'package', 'build');
if (!fs.existsSync(path.join(PDFJS_DIR, 'pdf.min.js'))) { console.log('SKIP test_lagesplan_pdfobj (pdf.js saknas i tools/smoke/.cache)'); process.exit(0); }
const PORT = 9021, PID = 'p1';
const store = new Map([[`projects/${PID}/plan_items.json`, '[]'], [`projects/${PID}/status_plans.json`, '[]']]);
const bytes = fs.readFileSync(path.join(__dirname, 'fixtures', 'ocg-demo.pdf')).toString('base64');

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await require('./_dialogs').bridge(page); require('./_reveal').autoReveal(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + (process.env.DBG ? e.stack : '')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); localStorage.setItem('lagesplan-field', '0'); });
  await page.route('https://cdnjs.cloudflare.com/**', r => {
    const u = r.request().url(), f = /worker/.test(u) ? 'pdf.worker.min.js' : /pdf\.min/.test(u) ? 'pdf.min.js' : null;
    if (f) return r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(PDFJS_DIR, f)) });
    r.fulfill({ contentType: 'application/javascript', body: '' });
  });
  await page.route('https://api.github.com/**', r => {
    const u = new URL(r.request().url()), f = decodeURIComponent(u.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (r.request().method() === 'PUT') { const b = JSON.parse(r.request().postData()); store.set(f, Buffer.from(b.content, 'base64').toString('latin1')); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"content":{"sha":"s"}}' }); }
    if (!store.has(f)) return r.fulfill({ status: 404, body: '{}' });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(store.get(f), 'latin1').toString('base64'), sha: 's' }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=${PID}`); await page.waitForTimeout(1200);
  await page.evaluate(async b64 => {
    const buf = () => Uint8Array.from(atob(b64), c => c.charCodeAt(0)).buffer;
    const calib = { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [600, 0]] };
    plans = [{ id: 'A', name: 'Grund', file_path: 'a.pdf', zones: [], calib }, { id: 'B', name: 'NSV-DP2-001', file_path: 'b.pdf', zones: [], calib }];
    pdfCache.set('A', buf()); pdfCache.set('B', buf());
    siteItems.push({ id: META_ID, type: 'layermeta', folders: [], folderOf: {} });
    await openPlan('A'); renderLayerPanel();
    window.uiConfirm = async () => true;
  }, bytes);
  await page.waitForTimeout(600);
  // 0) Vrid ritningen: en kalibrering som visar att ritningen står upp och ner föreslår 180°, och allt följer med
  { const rot = await page.evaluate(async () => {
      const A = plans[0]; A.calib = { model: [[0, 0, 0], [0, 100, 0]], pdf: [[300, 300], [300, 200]] };   // modellens norr = nedåt i PDF:en
      const sug = planRotSuggest(A.calib), north0 = (() => { const a = mToPx([0, 0]), b = mToPx([0, 1]); return b[1] - a[1]; })();
      await setPlanRotation(sug);
      const a = mToPx([0, 0]), b = mToPx([0, 1]), north1 = b[1] - a[1];
      const out = { sug, north0, north1, rot: plan.rot, w: viewport.width, back: null };
      await setPlanRotation(0); const a2 = mToPx([0, 0]), b2 = mToPx([0, 1]); out.back = b2[1] - a2[1]; out.rot0 = plan.rot;
      A.calib = { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [600, 0]] };
      return out;
    });
    if (rot.sug !== 180 || !(rot.north0 > 0) || !(rot.north1 < 0) || rot.rot !== 180 || !(rot.back > 0) || rot.rot0 !== undefined) fail('Vrid ritningen 180°: ' + JSON.stringify(rot));
    const r90 = await page.evaluate(async () => { const c = { model: [[0, 0, 0], [0, 100, 0]], pdf: [[0, 0], [100, 0]] }; plans[0].calib = c; const sug = planRotSuggest(c); await setPlanRotation(sug); const a = mToPx([0, 0]), b = mToPx([0, 1]); const r = { sug, dx: b[0] - a[0], dy: b[1] - a[1] }; await setPlanRotation(0); plans[0].calib = { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [600, 0]] }; return r; });
    if (r90.sug !== 270 || !(r90.dy < 0) || Math.abs(r90.dx) > 1e-6 * 1 + 1e-3) fail('90°: norr ska peka uppåt efter vridningen: ' + JSON.stringify(r90));
  }
  // 1) PDF:ens egna lager blir rader när PDF:en tänds
  await page.click('#layerList .layer-row[data-layer="pdfp:B"] .lr-vis'); await page.waitForTimeout(1500);
  const rows = await page.evaluate(() => ({ n: pdfOcgList(plans[1]).length, rows: [...document.querySelectorAll('#layerList .layer-row[data-layer^="pdfpl:B:"]')].map(r => r.querySelector('.ln').textContent.trim()), toggle: !!document.querySelector('#layerList .pdf-ocg-toggle') }));
  if (rows.n !== 4 || rows.rows.length !== 4 || !rows.toggle || !rows.rows.some(t => /^1\.7 - Text-boxar$/.test(t))) fail('PDF-lagren som rader: ' + JSON.stringify(rows));
  const red = () => page.evaluate(() => { const c = document.querySelector('#stage canvas.pdfov[data-key="pdfp:B"]'), ctx = c.getContext('2d'), d = ctx.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 80 && d[i + 2] < 80 && d[i + 3] > 200) n++; return n; });
  await page.click('#layerList .pdf-ocg-toggle'); await page.waitForTimeout(200);
  const r1 = await red();
  const k = await page.evaluate(() => pdfOcgList(plans[1]).find(g => /1\.7/.test(g.name)).id);
  await page.click(`#layerList .layer-row[data-layer="pdfpl:B:${k}"] .lr-vis`); await page.waitForTimeout(1200);
  const r2 = await red();
  if (!(r1 > 20) || r2 > r1 - 1000) fail('Släcka ett PDF-lager ska ta bort dess innehåll: ' + r1 + ' -> ' + r2);
  await page.click(`#layerList .layer-row[data-layer="pdfpl:B:${k}"] .lr-vis`); await page.waitForTimeout(900);
  // 2) Gör objekten redigerbara
  await page.evaluate(() => pdfObjImport(plans[1])); await page.waitForTimeout(800);
  const res = await page.evaluate(() => {
    const o = siteItems.filter(x => x.type === 'pdfobj');
    return { n: o.length, layers: [...new Set(o.map(x => x.layer))].sort(), kinds: o.map(x => x.parts.map(p => p.t).join('')).sort(), names: o.map(x => x.name).sort(), imgPaths: o.flatMap(x => x.parts.filter(p => p.t === 'i').map(p => p.img)),
      grid: !!pdfOcgList(plans[1]).find(g => /0\.3/.test(g.name) && ls(pdfOcgKey(plans[1], g.id)).visible), text: !pdfOcgList(plans[1]).some(g => /1\.7/.test(g.name) && ls(pdfOcgKey(plans[1], g.id)).visible) };
  });
  if (res.n !== 4 || JSON.stringify(res.layers) !== JSON.stringify(['0.4 - Skyltar', '1.7 - Text-boxar', '1.8 - Vägar']) || !res.grid || !res.text) fail('Objekt ur PDF:en: ' + JSON.stringify(res));
  if (!res.names.includes('Skylt A') || !res.names.includes('Skylt B') || res.imgPaths.length !== 1 || !res.imgPaths[0] || ![...store.keys()].some(k2 => /pdfobj\/B-/.test(k2))) fail('Namn och bild: ' + JSON.stringify(res));
  if (!store.has(`projects/${PID}/site_layers.json`) || JSON.parse(store.get(`projects/${PID}/site_layers.json`)).filter(x => x.type === 'pdfobj').length !== 4) fail('Objekten sparas i projektet');
  // Användarlagren finns i lagerpanelen och går att släcka
  const ul = await page.evaluate(() => [...document.querySelectorAll('#layerList .layer-row[data-layer^="ul:"]')].map(r => r.dataset.layer).filter(k => /Text-boxar|Vägar|Skyltar/.test(k)));
  if (ul.length !== 3) fail('Användarlager för PDF-lagren: ' + JSON.stringify(ul));
  // 3) Objekten ritas på rätt ställe och går att markera och flytta
  const where = await page.evaluate(() => {
    const o = siteItems.find(x => x.type === 'pdfobj' && x.name === 'Skylt A'), c = o.pts.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4], [0, 0]);
    const cx = modelToPdf(c[0], c[1]), hit = siteAt(cx);
    return { id: o.id, hit: hit && hit.id === o.id, pts0: o.pts[0] };
  });
  if (!where.hit) fail('siteAt hittar objektet: ' + JSON.stringify(where));
  const moved = await page.evaluate(id => {
    const o = siteItems.find(x => x.id === id), d = { orig: JSON.parse(JSON.stringify(o)), handle: { kind: 'move' }, startM: [0, 0] };
    const w = applySiteDrag(d, [10, 5]); return { dx: w.pts[0][0] - o.pts[0][0], dy: w.pts[0][1] - o.pts[0][1], same: w.parts === undefined ? false : w.parts.length === o.parts.length };
  }, where.id);
  if (Math.abs(moved.dx - 10) > 1e-6 || Math.abs(moved.dy - 5) > 1e-6 || !moved.same) fail('Flytta objektet: ' + JSON.stringify(moved));
  // Ritas: röda ramen finns på planen (egna objekt), och försvinner när användarlagret släcks
  const redZone = () => page.evaluate(() => { const o = composeImageNow(0, true), d = o.getContext('2d').getImageData(0, 0, o.width, o.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] < 80 && d[i + 2] < 80) n++; return n; });
  await page.evaluate(() => { ls('pdfp:B').visible = false; applyLayerCss(); renderZones(); }); await page.waitForTimeout(300);
  const a1 = await redZone();
  await page.evaluate(() => { ls('ul:1.7 - Text-boxar').visible = false; renderZones(); }); await page.waitForTimeout(200);
  const a2 = await redZone();
  if (!(a1 > 15) || a2 >= a1 * 0.3) fail('Objekten ritas (och släcks med sitt lager): ' + a1 + ' -> ' + a2);
  // Flytta på riktigt, spara, ångra
  await page.evaluate(() => { ls('ul:1.7 - Text-boxar').visible = true; });
  await page.evaluate(async id => { const o = siteItems.find(x => x.id === id); await saveSiteItem({ ...o, pts: o.pts.map(p => [p[0] + 10, p[1]]) }, false, { prev: o }); }, where.id);
  const after = await page.evaluate(id => siteItems.find(x => x.id === id).pts[0][0], where.id);
  if (Math.abs(after - where.pts0[0] - 10) > 1e-6) fail('Flytt sparas: ' + after);
  // Utskriftslayouten: ritningen med objekten ritas utan fel
  await page.evaluate(async () => { await openPrint(); const A = pr.tpl.elements.find(e => e.type === 'map'); A.layers = { follow: true }; await renderMapCanvasNow(A, 100, 80, 400, 320, { preview: true }); });
  if (errors.length) fail('sidfel: ' + errors.slice(0, 3));
  console.log('OK test_lagesplan_pdfobj – PDF-lager som rader, objekt ur PDF:en, flytta, utskrift');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
