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
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
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
  // Inställningarna (Färg, Beskär inte …) ligger bakom en pil.
  const fold = await page.evaluate(() => { const r = document.querySelector('#layerList .layer-row[data-layer="pdfp:B"]'); return { hidden: getComputedStyle(r.querySelector('.lr-opts')).display === 'none', arrow: (r.querySelector('.lr-opt-toggle') || {}).textContent }; });
  if (!fold.hidden || fold.arrow !== '▸') fail('Inställningarna ska vara hopfällda bakom en pil: ' + JSON.stringify(fold));
  for (const k of ['pdf', 'pdfp:B', 'pdfp:C']) await page.click(`#layerList .layer-row[data-layer="${k}"] .lr-opt-toggle`);
  const open = await page.evaluate(() => ['pdf', 'pdfp:B'].map(k => { const r = document.querySelector(`#layerList .layer-row[data-layer="${k}"]`); return getComputedStyle(r.querySelector('.lr-opts')).display !== 'none' && r.querySelector('.lr-opt-toggle').textContent === '▾'; }));
  if (open.some(x => !x)) fail('Pilen ska fälla ut inställningarna: ' + JSON.stringify(open));
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
  // Full skärpa vid inzoomning: den synliga delen ritas om i skärmens upplösning, på rätt ställe.
  await page.evaluate(() => { const [x, y] = toPx([300, 300]), r = $('viewport').getBoundingClientRect(); view.rot = 0; view.scale = 3; view.tx = r.width / 2 - x * 3; view.ty = r.height / 2 - y * 3; applyView(); });
  await page.waitForTimeout(900);
  const hi = await page.evaluate(() => {
    const h = document.querySelector('#stage canvas.pdfovhi[data-key="pdfp:B"]'), lo = document.querySelector('#stage canvas.pdfov[data-key="pdfp:B"]');
    if (!h || !h.width) return { none: true };
    const [x, y] = toPx([300, 300]), left = parseFloat(h.style.left), top = parseFloat(h.style.top), k = h.width / parseFloat(h.style.width);
    const px = [...h.getContext('2d').getImageData(Math.round((x - left) * k), Math.round((y - top) * k), 1, 1).data];
    const [wx, wy] = toPx([330, 300]); const off = [...h.getContext('2d').getImageData(Math.round((wx - left) * k), Math.round((wy - top) * k), 1, 1).data];
    return { k, px, off, loHidden: lo.style.visibility === 'hidden', blend: h.style.mixBlendMode };
  });
  if (hi.none || hi.k < 2.5 || hi.px[0] < 200 || hi.px[1] > 60 || hi.off[3] && hi.off[1] < 60 || !hi.loHidden || hi.blend !== 'multiply') fail('PDF-lagret ska ritas om skarpt vid inzoomning, på rätt ställe: ' + JSON.stringify(hi));
  // Panorering: den skarpa göms, den vanliga syns tills den ritats om.
  await page.evaluate(() => { view.tx += 40; applyView(); });
  if (await page.evaluate(() => getComputedStyle(document.querySelector('#stage canvas.pdfovhi')).display !== 'none' || document.querySelector('#stage canvas.pdfov[data-key="pdfp:B"]').style.visibility === 'hidden')) fail('Under panorering ska den vanliga bilden synas');
  await page.evaluate(() => fitView()); await page.waitForTimeout(400);
  // Färg av: gråskala.
  await page.click('#layerList .layer-row[data-layer="pdfp:B"] .lr-color');
  if ((await page.evaluate(() => document.querySelector('#stage canvas.pdfov[data-key="pdfp:B"]').style.filter)) !== 'grayscale(1)') fail('Färg av ska ge gråskala');
  // Beskär inte: plan B (dubbelt så stor i modellen) syns även utanför plan A:s kant, rutan på samma ställe.
  const crop0 = await page.evaluate(() => { const c = document.querySelector('#stage canvas.pdfov[data-key="pdfp:B"]'); return [c.style.left, c.style.top, c.style.width, c.style.height, $('pdfCanvas').width + 'px', $('pdfCanvas').height + 'px']; });
  if (crop0[0] !== '0px' || crop0[1] !== '0px' || crop0[2] !== crop0[4] || crop0[3] !== crop0[5]) fail('Från början klipps lagret vid planens kant: ' + JSON.stringify(crop0));
  await page.click('#layerList .layer-row[data-layer="pdfp:B"] .lr-nocrop'); await page.waitForTimeout(400);
  const nc = await page.evaluate(() => {
    const c = document.querySelector('#stage canvas.pdfov[data-key="pdfp:B"]'), l = parseFloat(c.style.left), t = parseFloat(c.style.top), w = parseFloat(c.style.width), h = parseFloat(c.style.height), q = c.width / w;
    const [x, y] = toPx([300, 300]);
    return { box: [l, t, w, h], stage: [$('pdfCanvas').width, $('pdfCanvas').height], px: [...c.getContext('2d').getImageData(Math.round((x - l) * q), Math.round((y - t) * q), 1, 1).data], saved: layerState['pdfnocrop:pdfp:B'] };
  });
  if (!(nc.box[2] > nc.stage[0] * 1.9 && nc.box[3] > nc.stage[1] * 1.9 && nc.box[1] < 0) || nc.px[0] < 200 || nc.px[1] > 60 || nc.saved !== true) fail('Beskär inte: hela ritningen, rutan på rätt ställe: ' + JSON.stringify(nc));
  const ex2 = await page.evaluate(() => { const o = composeImageNow(0, true), ctx = o.getContext('2d'), [x, y] = toPx([300, 300]); return [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data]; });
  if (ex2[0] > 150 || ex2[3] < 200) fail('Exporten med Beskär inte (Färg är av här: mörkgrå ruta): ' + JSON.stringify(ex2));
  await page.click('#layerList .layer-row[data-layer="pdfp:B"] .lr-nocrop'); await page.waitForTimeout(400);
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
