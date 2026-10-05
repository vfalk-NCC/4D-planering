// Funktionstest: ritordning i lagerhanteraren (Victors önskemål 2026-10-05). Listans ordning är
// ritordningen (överst ritas överst), ändras genom att dra lager och mappar, sparas i lagermetan
// och följer med i exporten. Ritningens rad visar arbetsytans namn och märket "Bas".
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8997;
// Attrapp av pdf.js: plan A ritar en blå ruta, plan B en röd ruta på samma ställe (140–160).
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: ({ data }) => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const kind = new Uint8Array(data)[0];
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      const [x, y] = v.convertToViewportPoint(kind === 2 ? 140 : 280, kind === 2 ? 160 : 320), w = (kind === 2 ? 20 : 40) * v.transform[0];
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height);
      c.fillStyle = kind === 2 ? '#ff0000' : '#0000ff'; c.fillRect(x, y, w, w);
      return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => {
    // Plan B ligger på samma ställe som A (samma kalibrering).
    plans = [{ id: 'A', name: 'Grundplan', file_path: 'a.pdf', zones: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } },
      { id: 'B', name: 'Mark', file_path: 'b.pdf', zones: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } }];
    pdfCache.set('A', new Uint8Array([1]).buffer); pdfCache.set('B', new Uint8Array([2]).buffer);
    siteItems.push({ id: META_ID, type: 'layermeta', folders: [{ id: 'f1', name: '1.1 - PDF-ritningar' }], folderOf: { pdf: 'f1' } });
    await openPlan('A'); renderLayerPanel();
    ls('pdfp:B').visible = true; layerState['pdfcolor:pdfp:B'] = true; $('grayPdf').checked = false; $('grayPdf').dispatchEvent(new Event('change'));
    applyLayerCss();
  });
  await page.waitForTimeout(500);
  // Bas-raden: arbetsytans namn och märket Bas.
  const bas = await page.evaluate(() => { const r = document.querySelector('#layerList .layer-row[data-layer="pdf"]'); return { name: r.querySelector('.pdfov-name').textContent, bas: !!r.querySelector('.pdf-bas'), opt: !!r.querySelector('.lr-opt-toggle') }; });
  if (!/Grundplan/.test(bas.name) || !bas.bas || !bas.opt) fail('Ritningens rad ska visa arbetsytans namn, Bas och pilen: ' + JSON.stringify(bas));
  const state = () => page.evaluate(() => {
    const z = el => Number(el.style.zIndex) || 0, ov = document.querySelector('#stage canvas.pdfov[data-key="pdfp:B"]');
    const rows = [...document.querySelectorAll('#layerList .layer-row')].filter(r => /^(pdf|pdfp:)/.test(r.dataset.layer || '')).map(r => r.dataset.layer);
    const o = composeImageNow(0, true), [x, y] = toPx([150, 150]);
    return { rows, pdf: z($('pdfCanvas')), b: z(ov), zones: z($('zoneCanvas')), top: z($('topCanvas')), px: [...o.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data], order: (siteItems.find(x => x.id === META_ID) || {}).order };
  });
  // Standard: Bas överst bland PDF:erna, zonerna över, topCanvas överst.
  const s0 = await state();
  if (JSON.stringify(s0.rows) !== JSON.stringify(['pdf', 'pdfp:B']) || !(s0.pdf > s0.b) || !(s0.zones > s0.pdf) || !(s0.top > s0.zones)) fail('Standardordningen: ' + JSON.stringify(s0));
  // Flytta B över Bas (som ett drag i listan): listan, nivåerna och sparad ordning följer.
  await page.evaluate(() => placeLayers(['pdfp:B'], 'pdf', false));
  await page.waitForTimeout(300);
  const s1 = await state();
  if (JSON.stringify(s1.rows) !== JSON.stringify(['pdfp:B', 'pdf']) || !(s1.b > s1.pdf) || !s1.order || s1.order.indexOf('pdfp:B') > s1.order.indexOf('pdf')) fail('B över Bas: ' + JSON.stringify(s1));
  // Bas utan multiplicering (inget ortofoto) täcker B där den ligger över: exporten följer ordningen.
  // B överst: röd ruta syns i exporten. Bas överst: Bas vita bakgrund täcker.
  if (!(s1.px[0] > 200 && s1.px[1] < 60)) fail('Exporten ska rita B överst (röd): ' + JSON.stringify(s1.px));
  if (!(s0.px[0] > 200 && s0.px[1] > 200 && s0.px[2] > 200)) fail('Exporten med Bas överst ska täcka B (vitt): ' + JSON.stringify(s0.px));
  // Dra-och-släpp i listan: B nedanför Bas igen (släpp på nedre halvan av Bas-raden).
  await page.evaluate(() => {
    const src = document.querySelector('#layerList .layer-row[data-layer="pdfp:B"]'), dst = document.querySelector('#layerList .layer-row[data-layer="pdf"]');
    const dt = new DataTransfer(); src.querySelector('.ln').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    const r = dst.getBoundingClientRect(), y = r.top + r.height * 0.8;
    dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
    dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
  });
  await page.waitForTimeout(300);
  const s2 = await state();
  if (JSON.stringify(s2.rows) !== JSON.stringify(['pdf', 'pdfp:B']) || !(s2.pdf > s2.b)) fail('Drag i listan: ' + JSON.stringify(s2));
  // Mappen dras under zonerna: hela mappen (och dess nivåer) flyttas.
  await page.evaluate(() => {
    const src = document.querySelector('#layerList .folder-row[data-folder="f1"]'), dst = document.querySelector('#layerList .layer-row[data-layer="zones"]');
    const dt = new DataTransfer(); src.querySelector('.fr-name').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    const r = dst.getBoundingClientRect(), y = r.top + 2;
    dst.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
    dst.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y }));
  });
  await page.waitForTimeout(300);
  const s3 = await state();
  const flat = await page.evaluate(() => layerDrawOrder());
  if (!(s3.pdf > s3.zones) || !(s3.top > s3.pdf) || flat.indexOf('pdf') > flat.indexOf('zones') || flat.indexOf('pdfp:B') > flat.indexOf('zones')) fail('Mappen över zonerna: ' + JSON.stringify({ s3, flat }));
  // Låsta lager (Victors önskemål 2026-10-05): bara Objekt och Zoner är låsta – Allmänt och Etablering kan tas bort.
  page.on('dialog', d => d.accept());
  await page.evaluate(() => { ghWriteJSON = async (t, p, fn) => fn([]); siteItems.push({ id: 'n1', type: 'note', layer: 'Allmänt', text: 'Hej', pts: [[1, 1], [3, 3]] }); renderLayerPanel(); });
  const lock = await page.evaluate(() => ['objects', 'zones', 'ul:Allmänt', 'ul:Etablering'].map(k => !!document.querySelector(`#layerList .layer-row[data-layer="${k}"] .lr-del`)));
  if (JSON.stringify(lock) !== JSON.stringify([false, false, true, true])) fail('Bara Objekt och Zoner ska vara låsta: ' + JSON.stringify(lock));
  await page.click('#layerList .layer-row[data-layer="ul:Allmänt"] .lr-del'); await page.waitForTimeout(300);
  const d1 = await page.evaluate(() => ({ layers: userLayers(), note: (siteItems.find(x => x.id === 'n1') || {}).layer, row: !!document.querySelector('#layerList .layer-row[data-layer="ul:Allmänt"]') }));
  if (d1.layers.includes('Allmänt') || d1.note !== 'Etablering' || d1.row) fail('Allmänt ska kunna tas bort, objekten flyttas till Etablering: ' + JSON.stringify(d1));
  await page.click('#layerList .layer-row[data-layer="ul:Etablering"] .lr-del'); await page.waitForTimeout(300);
  const d2 = await page.evaluate(() => ({ layers: userLayers(), note: !!siteItems.find(x => x.id === 'n1') }));
  if (d2.layers.length || d2.note) fail('Sista lagret tas bort med sina objekt: ' + JSON.stringify(d2));
  await page.evaluate(() => createLayer('Allmänt')); await page.waitForTimeout(200);
  if (!(await page.evaluate(() => userLayers().includes('Allmänt')))) fail('Ett borttaget lager ska kunna skapas igen');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
  console.log('OK: ritordning – listan styr nivåerna och exporten, drag av lager och mappar, Bas-raden, bara Objekt och Zoner låsta');
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
