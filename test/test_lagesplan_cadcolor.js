// Funktionstest: färg på DXF-lager direkt i lagerlistan (Victors önskemål 2026-10-02).
// Färgrutan vid varje CAD-lager under en DXF-ritning är en färgväljare. Färgen
// gäller lagret i alla DXF-ritningar (samma som under "Alla DXF-lager"),
// sparas i projektet och kan återställas till DXF:ens originalfärg.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const PORT = 8965;
const PID = 'p1';
const store = new Map([[`projects/${PID}/plan_items.json`, '[]'], [`projects/${PID}/status_plans.json`, '[]']]);

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS_DIR, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message + (process.env.DBG ? e.stack : '')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); localStorage.setItem('lagesplan-field', '0'); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error("x")) }) };' }));
  await page.route('https://api.github.com/**', r => {
    const u = new URL(r.request().url());
    const f = decodeURIComponent(u.pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (r.request().method() === 'PUT') { const b = JSON.parse(r.request().postData()); store.set(f, Buffer.from(b.content, 'base64').toString()); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"content":{"sha":"s"}}' }); }
    if (!store.has(f)) return r.fulfill({ status: 404, body: '{}' });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(store.get(f)).toString('base64'), sha: 's' }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=${PID}`); await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const mk = (id, name, ls) => ({ id, type: 'cad', name, path: 'x/' + id + '.json', colorMode: 'orig', layers: ls.map(n => ({ name: n, color: '#ff0000', n: 5 })), stats: { lines: 1, texts: 0, kb: 1 } });
    siteItems.push(mk('c1', 'WBS - 3D-Text', ['WBS - 3D-TEXT', 'MÅTT']), mk('c2', 'Ritning 2', ['wbs - 3d-text']));
    layerState['cadopen:c1'] = true; showTab('work'); renderLayerPanel();
  });
  const row = page.locator('.layer-row[data-layer="cadl:c1:WBS - 3D-TEXT"]');
  if (!(await row.locator('input.cl-color').count())) fail('Färgrutan vid DXF-lagret ska vara en färgväljare');
  await row.locator('input.cl-color').evaluate(el => { el.value = '#16a34a'; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(300);
  const meta = JSON.parse(store.get(`projects/${PID}/site_layers.json`)).find(x => x.type === 'layermeta');
  if (!meta || meta.cadColors['WBS - 3D-TEXT'] !== '#16a34a') fail('Färgen ska sparas i projektet: ' + JSON.stringify(meta));
  const cols = await page.evaluate(() => [cadLayerColor(cads()[0], 'WBS - 3D-TEXT', '#ff0000'), cadLayerColor(cads()[1], 'wbs - 3d-text', '#ff0000'), cadLayerColor(cads()[0], 'MÅTT', '#ff0000')]);
  if (cols[0] !== '#16a34a' || cols[1] !== '#16a34a' || cols[2] !== '#ff0000') fail('Färgen ska gälla lagret i alla DXF-ritningar (och bara det lagret): ' + JSON.stringify(cols));
  const sw = await page.locator('.layer-row[data-layer="cadl:c1:WBS - 3D-TEXT"] .ca-sw').evaluate(el => getComputedStyle(el).backgroundColor);
  if (sw !== 'rgb(22, 163, 74)') fail('Rutan ska visa den nya färgen: ' + sw);
  if (await page.evaluate(() => layerSel.size)) fail('Att välja färg ska inte markera raden');
  await page.locator('.layer-row[data-layer="cadl:c1:WBS - 3D-TEXT"] .cl-reset').click(); await page.waitForTimeout(300);
  if (await page.evaluate(() => cadColorOverride('WBS - 3D-TEXT'))) fail('↺ ska återställa originalfärgen');
  console.log('OK: färg på DXF-lager i lagerlistan – gäller alla ritningar, sparas och kan återställas');
  // Bild i utskriftslayouten: beskär och gör vit bakgrund genomskinlig.
  const img = await page.evaluate(async () => {
    const src = document.createElement('canvas'); src.width = 200; src.height = 100;
    const g = src.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 200, 100); g.fillStyle = '#0b3d91'; g.fillRect(60, 30, 80, 40);
    const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src.toDataURL('image/png'); });
    const el = { path: 'x.png' };
    const plain = printImageSource(el, im), ar0 = el.ar;
    el.knockout = true; const S = printImageSource(el, im);
    const px = (c, x, y) => c.getContext('2d').getImageData(x, y, 1, 1).data[3];
    const corner = px(S.src, 2, 2), logo = px(S.src, 100, 50);
    el.cropL = 25; el.cropR = 25; const C = printImageSource(el, im);
    return { same: plain.src === im, ar0, corner, logo, cropAr: el.ar, cropW: C.src.width };
  });
  if (!img.same || img.ar0 !== 2) fail('Utan val ska bilden vara orörd: ' + JSON.stringify(img));
  if (img.corner !== 0 || img.logo !== 255) fail('Vit bakgrund ska bli genomskinlig, loggan ska vara kvar: ' + JSON.stringify(img));
  if (img.cropAr !== 1 || img.cropW !== 100) fail('Beskärning 25 % vänster och höger ska ge en kvadrat: ' + JSON.stringify(img));
  console.log('OK: bild i utskriften – vit bakgrund genomskinlig och beskärning');
  const leg = await page.evaluate(() => {
    const el = { phases: true, extra: '#e11d48 Betongbarriär' };
    const before = legendItems(el).map(i => i.label);
    el.legHide = { 'phase:pausad': true }; el.legText = { 'phase:pagaende': 'Pågår' }; el.legColor = { 'phase:klar': '#000000' };
    el.legOrder = ['extra:0', 'phase:klar'];
    const after = legendItems(el), all = legendItems(el, true);
    return { before: before.length, labels: after.map(i => i.label), klar: after.find(i => i.key === 'phase:klar').color, all: all.length };
  });
  if (leg.before !== 6 || leg.all !== 6 || leg.labels.length !== 5) fail('Dolda rader ska bara försvinna ur förklaringen: ' + JSON.stringify(leg));
  if (leg.labels[0] !== 'Betongbarriär' || leg.labels[1] !== 'Klar' || !leg.labels.includes('Pågår') || leg.labels.includes('Pausad') || leg.klar !== '#000000') fail('Egen text, färg och ordning ska gälla: ' + JSON.stringify(leg));
  // Faserna ritas som samma prickar som på kartan (rund färgad prick med vit ring).
  const dots = await page.evaluate(() => {
    const el = { phases: true, size: 7, title: '' };
    const kinds = legendItems(el).map(i => i.kind);
    const ops = []; const ctx = new Proxy({}, { get: (t, k) => k === 'measureText' ? (() => ({ width: 10 })) : ['arc', 'fillRect', 'strokeRect'].includes(k) ? ((...a) => ops.push(k)) : (() => {}), set: () => true });
    drawLegend(ctx, el, 0, 0, 200, 200, v => v);
    return { kinds, arcs: ops.filter(o => o === 'arc').length, rects: ops.filter(o => o === 'fillRect').length };
  });
  if (!dots.kinds.length || dots.kinds.some(k => k !== 'dot') || dots.arcs < dots.kinds.length * 2 || dots.rects) fail('Faserna i förklaringen ska vara prickar som på kartan: ' + JSON.stringify(dots));
  console.log('OK: förklaringens rader kan döljas, döpas om, färgas och flyttas');
  // Panelen i utskriftslayouten: förklaringens rader och bildens val.
  const ui = await page.evaluate(async () => {
    viewport = { transform: [1, 0, 0, 1, 0, 0], width: 1000, height: 800, convertToPdfPoint: (x, y) => [x, y], convertToViewportPoint: (x, y) => [x, y] };
    plan = { id: 'pl', name: 'P', zones: [], photos: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } };
    await openPrint();
    const lg = pr.tpl.elements.find(e => e.type === 'legend');
    setSel([lg.id]); renderPrintProps();
    const rows = document.querySelectorAll('#prProps .pr-leg-row').length;
    const cb = document.querySelector('#prProps .pr-leg-row .pl-vis'); cb.checked = false; cb.dispatchEvent(new Event('change'));
    const hidden = Object.keys(lg.legHide || {}).length;
    const im = { id: 'im', type: 'image', x: 10, y: 10, w: 40, h: 20, path: 'x.png' }; pr.tpl.elements.push(im);
    printImgs.set('x.png', await new Promise(r => { const c = document.createElement('canvas'); c.width = 200; c.height = 100; const i = new Image(); i.onload = () => r(i); i.src = c.toDataURL(); }));
    setSel(['im']); renderPrintProps();
    const crop = document.querySelector('#prProps [data-f="cropL"]'); crop.value = 25; crop.dispatchEvent(new Event('input'));
    const ko = !!document.querySelector('#prProps [data-f="knockout"]');
    const sz = { x: im.x, y: im.y, w: im.w, h: im.h };
    const cb2 = document.querySelector('#prProps [data-f="cropB"]'); cb2.value = 50; cb2.dispatchEvent(new Event('input'));
    const sz2 = { x: im.x, y: im.y, w: im.w, h: im.h };
    cb2.value = 0; cb2.dispatchEvent(new Event('input'));
    return { rows, hidden, ko, h: im.h, ar: im.ar, sz, sz2 };
  });
  if (ui.rows < 5 || ui.hidden !== 1) fail('Panelen ska lista förklaringens rader och kunna dölja en: ' + JSON.stringify(ui));
  // Beskärning skär bort (skalan behålls): vänster 25 % => rutan blir 10 mm smalare och vänsterkanten flyttas 10 mm.
  if (JSON.stringify(ui.sz) !== JSON.stringify({ x: 20, y: 10, w: 30, h: 20 }) || JSON.stringify(ui.sz2) !== JSON.stringify({ x: 20, y: 10, w: 30, h: 10 })) fail('Beskärning ska skära bort, inte skala om bilden: ' + JSON.stringify(ui));
  if (!ui.ko || Math.abs(ui.ar - 1.5) > 0.01 || Math.abs(ui.h - 20) > 0.1) fail('Bildens val (beskär, genomskinlig) ska finnas och rutan följa beskärningen: ' + JSON.stringify(ui));
  console.log('OK: utskriftspanelen visar förklaringens rader och bildens beskärning/genomskinlighet');
  // Beskär med musen (Victors önskemål 2026-10-08): handtag och flytta utsnittet, Enter använder, Esc avbryter.
  await page.click('#prImgCrop');
  const area = await page.locator('#imgCropModal .ic-img').boundingBox();
  const hb = async h => { const b = await page.locator(`#imgCropModal .ic-${h}`).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const drag = async ([x, y], dx, dy) => { await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx / 2, y + dy / 2); await page.mouse.move(x + dx, y + dy); await page.mouse.up(); };
  if (!area || area.width < 100) fail('Beskärningsdialogen ska visa bilden: ' + JSON.stringify(area));
  await drag(await hb('e'), -area.width * 0.25, 0);   // höger 25 %
  await drag(await hb('n'), 0, area.height * 0.2);   // över 20 %
  await drag(await hb('sw'), -area.width * 0.5, 0);  // vänster ända ut till 0 (stoppar vid kanten)
  const mid = await page.locator('#imgCropModal .ic-box').boundingBox();
  await drag([mid.x + mid.width / 2, mid.y + mid.height / 2], 0, area.height * 0.5); // flytta nedåt: stoppar vid underkanten
  const cancelState = await page.evaluate(() => { const el = pr.tpl.elements.find(e => e.id === 'im'); return [el.cropL, el.cropR, el.cropT, el.cropB]; });
  if (cancelState[0] !== 25 || cancelState[1]) fail('Elementet ska inte ändras förrän man trycker Använd: ' + JSON.stringify(cancelState));
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  const cr = await page.evaluate(() => { const el = pr.tpl.elements.find(e => e.id === 'im'); return { l: el.cropL || 0, r: el.cropR || 0, t: el.cropT || 0, b: el.cropB || 0, h: el.h, w: el.w, x: el.x, y: el.y, open: !!document.getElementById('imgCropModal'), num: +document.querySelector('#prProps [data-f="cropR"]').value }; });
  const near = (a, b) => Math.abs(a - b) < 1.5;
  if (cr.open || !near(cr.l, 0) || !near(cr.r, 25) || !near(cr.t, 20) || !near(cr.b, 0) || !near(cr.num, cr.r)) fail('Dra i handtagen/flytta ska ge rätt beskärning och sifferrutorna följa med: ' + JSON.stringify(cr));
  if (!near(cr.w, 30) || !near(cr.h, 16) || !near(cr.x, 10) || !near(cr.y, 14)) fail('Rutan ska följa beskärningen med samma skala (bara skära bort): ' + JSON.stringify(cr));
  await page.click('#prImgCrop'); await drag(await hb('w'), area.width * 0.3, 0); await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  const esc = await page.evaluate(() => ({ l: pr.tpl.elements.find(e => e.id === 'im').cropL || 0, open: !!document.getElementById('imgCropModal'), sel: pr.sels.includes('im') }));
  if (esc.open || !near(esc.l, 0) || !esc.sel) fail('Esc ska avbryta utan ändring och utan att påverka markeringen: ' + JSON.stringify(esc));
  await page.evaluate(() => prUndo());
  if ((await page.evaluate(() => pr.tpl.elements.find(e => e.id === 'im').cropL)) !== 25) fail('Ctrl+Z ska ångra beskärningen');
  console.log('OK: beskär bild med musen – handtag, flytta utsnittet, Enter/Esc, ångra');
  // Ritningens lager (Victors önskemål 2026-10-06): exakt samma lagerpanel som på skärmen, men den
  // tänder och släcker bara i den markerade ritningen; skärmens lager påverkas inte.
  const prl = await page.evaluate(async () => {
    siteItems.push({ id: 'cx', type: 'cad', name: '5082591_Utsättningsplan', layers: [{ name: '0-1', n: 3 }, { name: '0-2', n: 2 }, { name: 'K-Y2N', n: 1 }] });
    renderLayerPanel();
    const screenZones = ls('zones').visible;
    const map = pr.tpl.elements.find(e => e.type === 'map'); map.layers = migrateLayers({ follow: false, keys: { 'cad:cx': true, 'cadl:cx:0-1': true, zones: screenZones } }); // gammalt format -> eget urval
    setSel([map.id]); renderPrintProps(); await new Promise(r => setTimeout(r, 50));
    const out = { inProps: !!document.querySelector('#prProps #layerList .layer-row[data-layer="zones"]'), search: !!document.querySelector('#prProps #layerSearch'), views: !!document.querySelector('#prProps #lsViewSel'),
      homeEmpty: !document.querySelector('details.sec[data-sec="layers"] #layerList'), cadOn: ls('cad:cx').visible, cadl2: ls('cadl:cx:0-2').visible };
    const vis = document.querySelector('#prProps .layer-row[data-layer="zones"] .lr-vis'); vis.click(); await new Promise(r => setTimeout(r, 200));
    out.mapZones = map.layers.state && map.layers.state.zones.visible; out.screenWhile = prLayerHold.screen.zones.visible; out.dirty = pr.dirty; out.undo = pr.undo.length > 0;
    out.stored = JSON.parse(localStorage.getItem(LAYER_KEY()) || '{}').zones;
    setSel([]); renderPrintProps(); await new Promise(r => setTimeout(r, 50));
    out.back = !!document.querySelector('details.sec[data-sec="layers"] #layerList') && !document.querySelector('#prProps #layerList');
    out.screenAfter = ls('zones').visible; out.screenZones = screenZones;
    // Igen: ritningens eget läge kommer tillbaka.
    setSel([map.id]); renderPrintProps(); await new Promise(r => setTimeout(r, 50));
    out.again = ls('zones').visible; out.keysZones = map.layers.state.zones.visible;
    setSel([]); renderPrintProps(); await new Promise(r => setTimeout(r, 50));
    return out;
  });
  if (!prl.inProps || !prl.search || !prl.views || !prl.homeEmpty || !prl.cadOn || prl.cadl2) fail('Lagerpanelen ska flyttas in under ritningen och visa ritningens lager: ' + JSON.stringify(prl));
  if (prl.mapZones !== !prl.screenZones || prl.screenWhile !== prl.screenZones || !prl.dirty || !prl.undo) fail('Tänd/släck i panelen ska gälla ritningen, inte skärmen: ' + JSON.stringify(prl));
  if (!prl.back || prl.screenAfter !== prl.screenZones || prl.again !== !prl.screenZones || prl.keysZones !== !prl.screenZones) fail('Panelen tillbaka och skärmens lager återställda när ritningen inte är markerad: ' + JSON.stringify(prl));
  console.log('OK: utskriftens ritning har samma lagerpanel som skärmen – tänd/släck gäller bara ritningen');
  // Lås element (särskilt ritningen), zoom i layouten och skalstocken med bladformat.
  const pl = await page.evaluate(async () => {
    const map = pr.tpl.elements.find(e => e.type === 'map');
    setSel([map.id]); renderPrintProps();
    document.getElementById('prLock').click();
    const locked = !!map.locked, panDisabled = document.getElementById('prPan').disabled;
    const x0 = map.x;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    const notMoved = map.x === x0;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    const notDeleted = pr.tpl.elements.includes(map);
    const c = document.getElementById('prCanvas');
    const u0 = pr.L.u;
    document.getElementById('prZoomIn').click();
    const zoomed = pr.L.u / u0, lbl = document.getElementById('prZoomLbl').textContent;
    document.getElementById('prZoomFit').click();
    const back = Math.abs(pr.L.u - u0) < 1e-6;
    // Skalstockens text med formatet.
    let txt = []; const ctx = { save() {}, restore() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, fillText: t => txt.push(t), measureText: t => ({ width: t.length * 5 }), setLineDash() {} };
    pr.tpl.format = 'A1';
    drawElement(ctx, pr.tpl.elements.find(e => e.type === 'scalebar'), pr.tpl, 1, 1, {});
    return { locked, panDisabled, notMoved, notDeleted, zoomed, lbl, back, txt };
  });
  if (!pl.locked || !pl.panDisabled || !pl.notMoved || !pl.notDeleted) fail('En låst ritning ska inte gå att flytta, panorera eller ta bort: ' + JSON.stringify(pl));
  if (!(Math.abs(pl.zoomed - 1.25) < 1e-6) || pl.lbl !== '125 %' || !pl.back) fail('Zoom i layouten: ' + JSON.stringify(pl));
  if (!pl.txt.some(t => /^SKALA 1:\d+ \(A1\)$/.test(t))) fail('Skalstocken ska visa bladformatet: ' + JSON.stringify(pl.txt));
  console.log('OK: lås ritningen i utskriftslayouten, zoom i layouten, skalstocken visar (A1)');
  // QR-kod i ram med egen text.
  const qr = await page.evaluate(() => {
    const el = { id: 'q1', type: 'qr', x: 20, y: 20, w: 40, h: 40, text: 'https://x' };
    pr.tpl.elements.push(el); setSel(['q1']); renderPrintProps();
    const cb = document.querySelector('#prProps [data-f="frame"]'); cb.checked = true; cb.dispatchEvent(new Event('change'));
    const fields = ['title', 'subtitle', 'footer', 'frameColor', 'phone'].map(f => !!document.querySelector(`#prProps [data-f="${f}"]`));
    const t = document.querySelector('#prProps [data-f="title"]'); t.value = 'TIDPLAN {plan}'; t.dispatchEvent(new Event('input'));
    const texts = []; const ctx = new Proxy({}, { get: (o, k) => k === 'measureText' ? (s => ({ width: String(s).length * 5 })) : k === 'fillText' ? (s => texts.push(s)) : (() => {}), set: () => true });
    drawElement(ctx, el, pr.tpl, 4, 1, {});
    return { frame: el.frame, h: el.h, title: el.title, defaults: [el.subtitle, el.footer, el.frameColor, el.phone], fields, texts };
  });
  if (!qr.frame || Math.abs(qr.h - 58.8) > 0.1 || !qr.fields.every(Boolean)) fail('Ram med egen text ska slås på med fält och kortets proportioner: ' + JSON.stringify(qr));
  if (qr.defaults[0] !== 'Skanna för detaljer' || !qr.defaults[3]) fail('Ramen ska få standardtexter: ' + JSON.stringify(qr));
  if (!qr.texts.includes('TIDPLAN P') || !qr.texts.includes('Skanna för detaljer')) fail('Rubrik (med platshållare) och underrubrik ska ritas: ' + JSON.stringify(qr.texts));
  await page.evaluate(() => { pr.tpl.elements = pr.tpl.elements.filter(e => e.id !== 'q1'); });
  console.log('OK: QR-kod i ram med egen rubrik, underrubrik, text och färg');
  // Ritningshuvudet som kort: rader fylls i med fält i sidomenyn.
  const tb = await page.evaluate(() => {
    const el = { id: 't9', type: 'title', x: 300, y: 200, w: 85, h: 69, size: 7, ...TITLE_CARD_DEFAULTS };
    pr.tpl.elements.push(el); setSel(['t9']); renderPrintProps();
    const rows0 = document.querySelectorAll('#prProps .pr-tb-row').length;
    const v = document.querySelectorAll('#prProps .pr-tb-row')[2].querySelector('.tb-v'); v.value = 'NCC Green Industry'; v.dispatchEvent(new Event('input'));
    document.querySelectorAll('#prProps .pr-tb-row')[2].querySelector('.tb-split').click();
    const afterSplit = el.rows.split('\n')[2];
    document.getElementById('prTbAdd').click();
    const n = el.rows.split('\n').length;
    const h = document.getElementById('prProps').querySelector('[data-f="heading"]'); h.value = 'INFO'; h.dispatchEvent(new Event('input'));
    const texts = []; const ctx = new Proxy({}, { get: (o, k) => k === 'measureText' ? (s => ({ width: String(s).length * 5 })) : k === 'fillText' ? (s => texts.push(s)) : (() => {}), set: () => true });
    drawElement(ctx, el, pr.tpl, 4, 1, {});
    document.getElementById('prTbStyle').value = 'classic'; document.getElementById('prTbStyle').dispatchEvent(new Event('change'));
    const classic = el.style;
    pr.tpl.elements = pr.tpl.elements.filter(e => e.id !== 't9');
    return { rows0, afterSplit, n, texts, classic, hasLogoBtn: true };
  });
  if (tb.rows0 !== 6) fail('Kortet ska ha sex standardrader: ' + JSON.stringify(tb));
  if (tb.afterSplit !== 'PROJEKT: NCC Green Industry | ') fail('Fältet ska sparas och raden kunna delas: ' + JSON.stringify(tb));
  if (tb.n !== 7) fail('＋ Rad ska lägga till en rad: ' + JSON.stringify(tb));
  if (!tb.texts.includes('INFO') || !tb.texts.includes('PROJEKT') || !tb.texts.includes('NCC Green Industry')) fail('Kortet ska rita rubrik, etiketter och texter: ' + JSON.stringify(tb.texts));
  if (tb.classic !== 'classic') fail('Utseendet ska gå att byta till enkel ruta');
  const trim = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 400, 200); x.fillStyle = '#1f3b73'; x.fillRect(150, 80, 100, 40);
    const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = c.toDataURL(); });
    printImgs.set('lg.png', im);
    const t = titleLogoSource({ logo: 'lg.png', logoWhite: true });
    const d = t.getContext('2d').getImageData(Math.floor(t.width / 2), Math.floor(t.height / 2), 1, 1).data;
    return { w: t.width, h: t.height, white: d[0] === 255 && d[3] === 255 };
  });
  if (Math.abs(trim.w - 100) > 2 || Math.abs(trim.h - 40) > 2 || !trim.white) fail('Loggans tomma kanter ska beskäras bort och loggan kunna göras vit: ' + JSON.stringify(trim));
  console.log('OK: ritningshuvudet som kort (rubrik, rader i sidomenyn, dela/lägg till rad, logga)');
  // Bibliotek med symboler (gemensamt för alla projekt).
  await page.evaluate(() => { document.getElementById('prLib').open = true; });
  await page.waitForTimeout(300);
  if (!/Biblioteket är tomt/.test(await page.textContent('#prLibBody'))) fail('Tomt bibliotek ska förklaras');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAADUlEQVR4nGP4z8AARAAI/gH/xp559wAAAABJRU5ErkJggg==', 'base64');
  page.once('dialog', d => d.accept('Säkerhet'));
  await page.setInputFiles('#prLibInput', [{ name: 'AED_hjartstartare.png', mimeType: 'image/png', buffer: png }]);
  await page.waitForTimeout(800);
  const lib = JSON.parse(store.get('library/print_symbols.json') || '[]');
  if (lib.length !== 1 || lib[0].name !== 'AED hjartstartare' || lib[0].cat !== 'Säkerhet' || !/^library\/print\//.test(lib[0].path) || Math.abs(lib[0].ar - 2) > 0.01) fail('Symbolen ska sparas i det gemensamma biblioteket: ' + JSON.stringify(lib));
  if (!store.has(lib[0].path)) fail('Bilden ska laddas upp till biblioteket');
  const libUi = await page.$$eval('#prLibBody .pr-lib-item', b => b.map(x => x.textContent.trim()));
  if (libUi.length !== 1 || !/AED/.test(libUi[0]) || !/Säkerhet/i.test(await page.textContent('#prLibBody'))) fail('Biblioteket ska visa symbolen under sin kategori: ' + JSON.stringify(libUi));
  const n0 = await page.evaluate(() => pr.tpl.elements.length);
  await page.click('#prLibBody .pr-lib-item .pr-lib-name');
  const added = await page.evaluate(() => { const e = pr.tpl.elements[pr.tpl.elements.length - 1]; return { n: pr.tpl.elements.length, type: e.type, path: e.path, w: e.w, h: e.h, sel: pr.sels[0] === e.id }; });
  if (added.n !== n0 + 1 || added.type !== 'image' || added.path !== lib[0].path || added.w !== 25 || Math.abs(added.h - 12.5) > 0.1 || !added.sel) fail('Klick ska lägga in symbolen som bild: ' + JSON.stringify(added));
  // Ta bort ur biblioteket (bilden i layouten ligger kvar).
  page.once('dialog', d => d.accept());
  await page.hover('#prLibBody .pr-lib-item'); await page.click('#prLibBody .pr-lib-del');
  await page.waitForTimeout(400);
  if (JSON.parse(store.get('library/print_symbols.json')).length !== 0) fail('Symbolen ska kunna tas bort ur biblioteket');
  // Spara en markerad bild i biblioteket.
  page.once('dialog', d => d.accept('WC'));
  await page.click('#prLibSaveSel'); await page.waitForTimeout(400);
  const lib2 = JSON.parse(store.get('library/print_symbols.json'));
  if (lib2.length !== 1 || lib2[0].name !== 'WC' || lib2[0].path !== lib[0].path) fail('Markerad bild ska kunna sparas i biblioteket: ' + JSON.stringify(lib2));
  await page.evaluate(() => { pr.tpl.elements.pop(); document.getElementById('prLib').open = false; });
  console.log('OK: bibliotek med symboler – ladda upp, kategori, lägg in med ett klick, ta bort, spara markerad bild');
  // PDF-lager (avancerat): avslaget från början, namn på lägesplanens lager och på element.
  const pdl = await page.evaluate(async () => {
    const d = document.getElementById('prPdfLayers'); d.open = true; d.dispatchEvent(new Event('toggle')); await new Promise(r => setTimeout(r, 50));
    const offAtStart = !document.getElementById('prPdfOn').checked && !document.querySelector('[data-plk]');
    const lg = pr.tpl.elements.find(e => e.type === 'legend'); setSel([lg.id]); renderPrintProps();
    const noElField = !document.getElementById('prElPdfLayer');
    const on = document.getElementById('prPdfOn'); on.checked = true; on.dispatchEvent(new Event('change'));
    const zi = document.querySelector('[data-plk="zones"]'); zi.value = '1.1 - WBS-områden'; zi.dispatchEvent(new Event('change'));
    renderPrintProps();
    const ef = document.getElementById('prElPdfLayer'); ef.value = '1.1 - WBS-områden'; ef.dispatchEvent(new Event('change'));
    const tb = pr.tpl.elements.find(e => e.type === 'title'); setSel([tb.id]); renderPrintProps();
    const ef2 = document.getElementById('prElPdfLayer'); ef2.value = '2 - Info'; ef2.dispatchEvent(new Event('change'));
    renderPdfLayersUi();
    const names = [...document.querySelectorAll('[data-pln]')].map(i => i.dataset.pln);
    const cb = document.querySelector('[data-pln="2 - Info"]'); cb.checked = false; cb.dispatchEvent(new Event('change'));
    const plan2 = pdfLayerPlan(pr.tpl);
    // Exporten märker innehållet (jsPDF ersatt: skrivna operatorer och bilder samlas).
    plan.zones = [{ id: 'z', code: 'PM1', polys: [[[100, 100], [600, 100], [600, 500], [100, 500]]], labels: [] }];
    const ops = [];
    window.jspdf = { jsPDF: function () { return new Proxy({}, { get: (t, k) => k === 'internal' ? { write: s => ops.push(s) } : k === 'addImage' ? ((u, f) => ops.push('IMG ' + f)) : k === 'splitTextToSize' ? (s => [String(s)]) : k === 'output' ? (() => new ArrayBuffer(8)) : (() => {}) }); } };
    document.querySelectorAll('.pdf-vec-chk').forEach(c => c.checked = false);
    const alerts = []; window.alert = m => alerts.push(m);
    window.savePdfBytes = () => ops.push('SAVED');
    await exportPrintPdf();
    return { offAtStart, noElField, names, plan: { ids: [...plan2.ids], off: [...plan2.off], groups: plan2.groups.map(g => [g.name, [...g.keys]]) }, ops, alerts };
  });
  if (!pdl.offAtStart || !pdl.noElField) fail('PDF-lager ska vara avslaget och dolt från början: ' + JSON.stringify(pdl));
  if (JSON.stringify(pdl.names) !== JSON.stringify(['1.1 - WBS-områden', '2 - Info'])) fail('Lagren ska listas (samma namn = samma lager): ' + JSON.stringify(pdl.names));
  if (JSON.stringify(pdl.plan.ids) !== JSON.stringify([['1.1 - WBS-områden', 'L1'], ['2 - Info', 'L2']]) || pdl.plan.off[0] !== '2 - Info' || pdl.plan.groups[0][1][0] !== 'zones') fail('Fel lagerplan: ' + JSON.stringify(pdl.plan));
  const seq = pdl.ops.join(' | ');
  const depth = pdl.ops.reduce((d, o) => d < 0 ? d : d + (/BDC$/.test(o) ? 1 : o === 'EMC' ? -1 : 0), 0);
  if (depth !== 0) fail('BDC/EMC ska vara balanserade: ' + seq);
  if (!/\/OC \/L1 BDC \| IMG PNG \| EMC/.test(seq)) fail('Zonerna ska ligga i en egen bild i lager L1: ' + seq);
  if (!/\/OC \/L2 BDC \| IMG PNG \| EMC/.test(seq)) fail('Ritningshuvudet ska ligga i lager L2: ' + seq);
  if (!pdl.ops.includes('SAVED')) fail('PDF:en ska sparas (även om lagren inte kunde läggas till här): ' + JSON.stringify(pdl.alerts));
  await page.evaluate(() => { pr.tpl.pdfLayers = { on: false, map: {}, off: [] }; pr.tpl.elements.forEach(e => delete e.pdfLayer); });
  console.log('OK: PDF-lager (avancerat) – lägesplanens lager och element i namngivna lager, märkt i PDF:en');
  // Text i en låg ruta (t.ex. rubriken TIDPLAN) ska komma med i PDF:en, som i layouten.
  const pdfTexts = await page.evaluate(async () => {
    const texts = [];
    window.jspdf = { jsPDF: function () { return new Proxy({}, { get: (t, k) => k === 'text' ? (s => texts.push(String(s))) : k === 'splitTextToSize' ? (s => String(s).split('\n')) : (() => {}) }); } };
    const k0 = pageDims().k;
    pr.tpl.elements = [{ id: 't1', type: 'text', x: 10, y: 10, w: 40, h: 1.2 + 10 * PT_MM, size: 10, bold: true, align: 'center', text: 'TIDPLAN\nFÖR LÅG' }];
    pr.tpl.frame = { on: false };
    window.alert = m => texts.push('ALERT ' + m);
    await exportPrintPdf();
    return { texts, k0 };
  });
  if (!pdfTexts.texts.includes('TIDPLAN')) fail('Rubriken i en låg textruta ska skrivas i PDF:en: ' + JSON.stringify(pdfTexts));
  if (pdfTexts.texts.includes('FÖR LÅG')) fail('En rad som inte ryms i rutan ska inte skrivas: ' + JSON.stringify(pdfTexts));
  console.log('OK: text i låga rutor kommer med i PDF:en');
  if (errors.length) fail('Fel i sidan: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
