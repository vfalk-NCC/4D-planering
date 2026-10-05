// Funktionstest: andra planers PDF:er som lager under ritningens mapp (Victors önskemål 2026-10-05).
// Lagret läggs på rätt ställe via båda planernas kalibrering, är släckt från början, har Färg-val;
// ritningens gråskala styrs nu från lagret (Färg).
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8999;
// Attrapp av pdf.js: sidan är 1000×500 punkter; plan B ritar en röd ruta vid (140–160, 140–160).
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: ({ data }) => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const kind = new Uint8Array(data)[0];
    const vp = s => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, 0, 500 * s],
      convertToViewportPoint: (x, y) => [x * s, (500 - y) * s], convertToPdfPoint: (x, y) => [x / s, 500 - y / s] });
    return { getViewport: ({ scale }) => vp(scale), render: ({ canvasContext: c, viewport: v }) => {
      if (kind === 2) { const [x, y] = v.convertToViewportPoint(140, 160), w = 20 * v.transform[0]; c.fillStyle = '#ff0000'; c.fillRect(x, y, w, w); }
      return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => {
    // Plan A: 10 enheter/m. Plan B: 5 enheter/m (samma modellpunkter). Plan C: ej kalibrerad.
    plans = [{ id: 'A', name: 'Grundplan', file_path: 'a.pdf', zones: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } },
      { id: 'B', name: 'NSV-DP2-002 Mark', file_path: 'b.pdf', zones: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [500, 0]] } },
      { id: 'C', name: 'Okalibrerad', file_path: 'c.pdf', zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer); pdfCache.set('B', new Uint8Array([2]).buffer); pdfCache.set('C', new Uint8Array([3]).buffer);
    siteItems.push({ id: META_ID, type: 'layermeta', folders: [{ id: 'f1', name: '1.1 - PDF-ritningar' }], folderOf: { pdf: 'f1' } });
    await openPlan('A'); renderLayerPanel();
  });
  // Raderna: under ritningens mapp, släckta, med Färg; okalibrerad markerad.
  const rows = await page.evaluate(() => [...document.querySelectorAll('#layerList .layer-row')].filter(r => /^(pdf|pdfp:)/.test(r.dataset.layer || '') || r.classList.contains('folder-row'))
    .map(r => (r.dataset.layer || 'folder') + (r.classList.contains('in-folder') ? '+in' : '') + (r.querySelector('.lr-vis') && r.querySelector('.lr-vis').checked ? '+on' : '') + (r.querySelector('.lr-color') ? '+färg' : '') + (/ej kalibrerad/.test(r.textContent) ? '+ejkal' : '')));
  if (JSON.stringify(rows) !== JSON.stringify(['folder', 'pdf+in+on+färg', 'pdfp:B+in+färg', 'pdfp:C+in+färg+ejkal'])) fail('PDF-lagren under ritningens mapp, släckta: ' + JSON.stringify(rows));
  // Tänd B: den röda rutan hamnar på modellpunkten (30, 30) = A:s PDF (300, 300), inte vid (150, 150).
  await page.click('#layerList .layer-row[data-layer="pdfp:B"] .lr-vis'); await page.waitForTimeout(300);
  const px = await page.evaluate(() => {
    const c = document.querySelector('#stage canvas.pdfov[data-key="pdfp:B"]'), ctx = c.getContext('2d');
    const at = p => { const [x, y] = toPx(p); return [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data]; };
    return { size: [c.width, c.height], right: at([300, 300]), wrong: at([150, 150]), blend: c.style.mixBlendMode, disp: c.style.display, filter: c.style.filter };
  });
  if (px.right[0] < 200 || px.right[1] > 60 || px.wrong[0] > 200 && px.wrong[1] < 60) fail('Plan B ska ligga på rätt ställe via kalibreringen: ' + JSON.stringify(px));
  if (px.blend !== 'multiply' || px.disp !== '' || px.filter !== '') fail('PDF-lagret: multiplicera, synligt, i färg: ' + JSON.stringify(px));
  // Bildexporten tar med PDF-lagret.
  const ex = await page.evaluate(() => { const o = composeImageNow(0, true), ctx = o.getContext('2d'), [x, y] = toPx([300, 300]); return [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data]; });
  if (ex[0] < 200 || ex[1] > 60) fail('Exporten ska ta med PDF-lagret: ' + JSON.stringify(ex));
  // Färg av: gråskala.
  await page.click('#layerList .layer-row[data-layer="pdfp:B"] .lr-color');
  if ((await page.evaluate(() => document.querySelector('#stage canvas.pdfov[data-key="pdfp:B"]').style.filter)) !== 'grayscale(1)') fail('Färg av ska ge gråskala');
  // Okalibrerad plan ritas inte även om den tänds.
  await page.click('#layerList .layer-row[data-layer="pdfp:C"] .lr-vis'); await page.waitForTimeout(200);
  if (await page.evaluate(() => { const c = document.querySelector('#stage canvas.pdfov[data-key="pdfp:C"]'); return !!(c && c.width && c.style.display !== 'none'); })) fail('Okalibrerad plan kan inte läggas på rätt ställe');
  // Släck B: minnet frigörs.
  await page.click('#layerList .layer-row[data-layer="pdfp:B"] .lr-vis'); await page.waitForTimeout(100);
  if ((await page.evaluate(() => document.querySelector('#stage canvas.pdfov[data-key="pdfp:B"]').width)) !== 0) fail('Släckt PDF-lager ska frigöra sin bild');
  // Ritningens egen Färg styr gråskalan (den gamla rutan är flyttad hit).
  const g0 = await page.evaluate(() => $('grayPdf').checked);
  await page.click('#layerList .layer-row[data-layer="pdf"] .lr-color');
  const g1 = await page.evaluate(() => ({ gray: $('grayPdf').checked, filter: $('pdfCanvas').style.filter, oldHidden: $('grayPdf').closest('label').classList.contains('hidden') }));
  if (g1.gray === g0 || (g1.gray ? g1.filter !== 'grayscale(1)' : g1.filter !== '') || !g1.oldHidden) fail('Färg på ritningen ska styra gråskalan: ' + JSON.stringify({ g0, g1 }));
  // Sparad vy tar med PDF-lagren.
  if (!('pdfp:B' in (await page.evaluate(() => lsViewSnapshot().layers)))) fail('PDF-lagren ska följa med i sparade vyer');
  // Flytta ut ur mappen: stannar utanför (följer inte längre ritningens mapp).
  await page.evaluate(() => { const m = layerMeta(); m.folderOf['pdfp:B'] = ''; const i = siteItems.findIndex(x => x.id === META_ID); siteItems[i] = m; renderLayerPanel(); });
  if (await page.evaluate(() => document.querySelector('#layerList .layer-row[data-layer="pdfp:B"]').classList.contains('in-folder'))) fail('Ett PDF-lager som flyttats ut ur mappen ska stanna utanför');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
  console.log('OK: andra planers PDF:er som lager i ritningens mapp – rätt läge via kalibrering, Färg, släckt från början, vyer');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
