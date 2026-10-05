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
    return { rows, hidden, ko, h: im.h, ar: im.ar };
  });
  if (ui.rows < 5 || ui.hidden !== 1) fail('Panelen ska lista förklaringens rader och kunna dölja en: ' + JSON.stringify(ui));
  if (!ui.ko || Math.abs(ui.ar - 1.5) > 0.01 || Math.abs(ui.h - 26.7) > 0.1) fail('Bildens val (beskär, genomskinlig) ska finnas och rutan följa beskärningen: ' + JSON.stringify(ui));
  console.log('OK: utskriftspanelen visar förklaringens rader och bildens beskärning/genomskinlighet');
  // Ritningens lagerlista: DXF-filernas lager hopfällda från början, pilen fäller ut.
  const prl = await page.evaluate(() => {
    siteItems.push({ id: 'cx', type: 'cad', name: '5082591_Utsättningsplan', layers: [{ name: '0-1', n: 3 }, { name: '0-2', n: 2 }, { name: 'K-Y2N', n: 1 }] });
    const map = pr.tpl.elements.find(e => e.type === 'map'); map.layers = { follow: false, keys: { 'cad:cx': true, 'cadl:cx:0-1': true } };
    setSel([map.id]); renderPrintProps();
    const subs = () => [...document.querySelectorAll('#prProps .pr-lay-row[data-parent="cad:cx"]')];
    const out = { n: subs().length, hidden0: subs().every(r => getComputedStyle(r).display === 'none'), arrow0: document.querySelector('#prProps [data-tog="cad:cx"]').textContent, count: document.querySelector('#prProps [data-lay="cad:cx"]').closest('label').querySelector('small').textContent };
    document.querySelector('#prProps [data-tog="cad:cx"]').click();
    out.shown = subs().every(r => getComputedStyle(r).display !== 'none'); out.arrow1 = document.querySelector('#prProps [data-tog="cad:cx"]').textContent;
    renderPrintProps(); out.keptOpen = subs().every(r => getComputedStyle(r).display !== 'none');
    document.querySelector('#prProps [data-tog="cad:cx"]').click(); out.hidden2 = subs().every(r => getComputedStyle(r).display === 'none');
    return out;
  });
  if (prl.n !== 3 || !prl.hidden0 || prl.arrow0 !== '▸' || prl.count !== '3' || !prl.shown || prl.arrow1 !== '▾' || !prl.keptOpen || !prl.hidden2) fail('Utskriftens lagerlista: DXF-lagren hopfällda med pil: ' + JSON.stringify(prl));
  console.log('OK: utskriftens lagerlista – DXF-filernas lager hopfällda från början, fälls ut med pilen');
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
