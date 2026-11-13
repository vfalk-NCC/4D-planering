// Exportera 3D-objekt (DXF/IFC): Excel-planeringens punkter som syns tas med, och manuella justeringar av plushöjd/kommentar följer med.
// Zonerna till Excel (Victors önskemål 2026-10-05): Lägesplan räknar fram zon och överzon per
// aktivitet för alla arbetsytor (position i 3D eller zonkod) och sparar zone_export.json – bara
// när innehållet ändrats. Makrot "Hämta från 4D" i Excel läser filen.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8990;
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
  await require('./_dialogs').bridge(page); // appens egna dialogrutor
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('lagesplan-rdock-hidden', '0'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(() => { const c = document.getElementById('cadTextLines'); if (c) c.checked = false; });   // TEXT-objekt i dessa tester (linjetexten testas separat)
  const r = await page.evaluate(async () => {
    const cal = { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] };
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: cal, level: { z0: 0, z1: 10 }, zones: [] }]; plan = plans[0]; planSource = 'pp';
    const it = (id, extra) => ({ id, object_name: id, activity: 'Akt ' + id, area: 'Hus', start_date: '2026-09-01', end_date: '2026-12-01', status: 'pagaende', progress: 50, ...extra });
    items = [it('p1')]; positions = [{ id: 'p1', x: 15, y: 15, z0: 1, z1: 2 }];
    xls.items = [it('x1', { object_name: 'L12' }), it('x2', { object_name: 'K14' })]; xls.positions = [{ id: 'x1', x: 30, y: 20, z0: 1, z1: 4.5 }, { id: 'x2', x: 40, y: 20, z0: 1, z1: 3 }]; xls.posPdf = null;
    const sho = document.getElementById('showObjects'); if (sho) sho.checked = true; invalidatePositions();
    const marks = objExportMarkers(), dxf0 = buildObjectsDxf(), ifc0 = buildObjectsIfc();
    exportAdjSet('xl:x1', { z: 7.5, comment: 'Kolla höjden' }); exportAdjSave();
    const m2 = objExportMarkers().find(m => m.key === 'xl:x1'), dxf1 = buildObjectsDxf(), ifc1 = buildObjectsIfc();
    exportAdjSet('xl:x1', { z: NaN, comment: '' }); exportAdjSave(); const back = objExportMarkers().find(m => m.key === 'xl:x1');
    return { keys: marks.map(m => m.key), srcs: marks.map(m => m.src), n: dxf0 && dxf0.n, nIfc: ifc0 && ifc0.n, txtL12: dxf0 && /L12/.test(dxf0.text), ifcL12: /L12/.test(ifc0.text) && /K14/.test(ifc0.text), z0: marks.find(m => m.key === 'xl:x1').zTop,
      zManual: m2.zTop, flag: m2.zManual, cmt: m2.adj && m2.adj.comment, dxfZ: /\r\n30\r\n7\.500\r\n/.test(dxf1.text), dxfCmt: /Kolla/.test(dxf1.text) && /4D-KOMMENTAR/.test(dxf1.text), ifcCmt: /Kolla/.test(ifc1.text) && /manuell/.test(ifc1.text) && /7\.6/.test(ifc1.text), backZ: back.zTop, backFlag: !!back.zManual };
  });
  if (r.keys.length !== 3 || !r.keys.includes('xl:x1') || !r.keys.includes('xl:x2') || !r.srcs.includes('Excel-planeringen') || r.n !== 3 || r.nIfc !== 3 || !r.txtL12 || !r.ifcL12) fail('Excel-punkterna tas med i DXF och IFC: ' + JSON.stringify(r));
  if (r.z0 !== 4.5 || r.zManual !== 7.5 || !r.flag || r.cmt !== 'Kolla höjden' || !r.dxfZ || !r.dxfCmt || !r.ifcCmt || r.backZ !== 4.5 || r.backFlag) fail('Manuell plushöjd och kommentar: ' + JSON.stringify(r));
  console.log('OK: Excel-punkterna följer med i 3D-objekt-exporten, manuell plushöjd/kommentar läggs på och kan återställas', JSON.stringify(r.keys));
  // Dubbletter (samma objekt i Powerproject och Excel) exporteras en gång; namnen i mörkgult
  const DU = await page.evaluate(() => { xls.items.push({ id: 'xd', object_name: 'p1', activity: 'Akt p1', area: 'Hus', start_date: '2026-09-01', end_date: '2026-12-01', status: 'pagaende', progress: 50 }, { id: 'xe', object_name: 'L12', activity: 'dubbel', area: 'Hus', start_date: '2026-09-01', end_date: '2026-12-01', status: 'pagaende', progress: 50 }); xls.positions.push({ id: 'xd', x: 21, y: 18, z0: 1, z1: 2 }, { id: 'xe', x: 30.5, y: 20.4, z0: 1, z1: 5 }); xls.posPdf = null; exportAdjVer++;
    const ms = objExportMarkers(), names = ms.map(m => m.name), ifc = buildObjectsIfc().text, dxf = buildObjectsDxf();
    xls.items = xls.items.filter(i => i.id !== 'xd' && i.id !== 'xe'); xls.positions = xls.positions.filter(p => p.id !== 'xd' && p.id !== 'xe'); xls.posPdf = null; exportAdjVer++;
    return { names, p1: names.filter(n => n === 'p1').length, l12: names.filter(n => n === 'L12').length, srcP1: ms.find(m => m.name === 'p1').src, gold: /IFCCOLOURRGB\(\$,0\.902,0\.702,0\.165\)/.test(ifc), black: /IFCCOLOURRGB\(\$,0\.067,0\.094,0\.153\)/.test(ifc), dxfAci: /4D-NAMN/.test(dxf.text) }; });
  if (DU.p1 !== 1 || DU.l12 !== 1 || DU.srcP1 !== 'Powerproject' || !DU.gold) fail('Inga dubbletter och namn i mörkgult: ' + JSON.stringify(DU));
  console.log('OK: dubbletter (samma objekt i PP och Excel) exporteras en gång, namnen i mörkgult', JSON.stringify({ p1: DU.p1, l12: DU.l12 }));
  // DXF: texten som linjer på plushöjden och fyllda skivor (3DFACE) i stället för bred polylinje
  const LN = await page.evaluate(() => { document.getElementById('cadTextLines').checked = true; const t = buildObjectsDxf().text; const lines = [...t.matchAll(/\r\nLINE\r\n8\r\n4D-NAMN\r\n10\r\n[-\d.]+\r\n20\r\n[-\d.]+\r\n30\r\n([-\d.]+)\r\n/g)].map(m => Number(m[1])), faces = (t.match(/\r\n3DFACE\r\n8\r\n4D-/g) || []).length, texts = (t.match(/\r\nTEXT\r\n/g) || []).length, dots = (t.match(/\r\nPOLYLINE\r\n/g) || []).length;
    document.getElementById('cadTextLines').checked = false; return { lines: lines.length, zs: [...new Set(lines)], faces, texts, dots }; });
  if (LN.lines < 20 || LN.texts !== 0 || LN.faces < 16 * 3 || LN.zs.length < 2 || !LN.zs.includes(4.5)) fail('DXF: text som linjer på plushöjd + fyllda skivor: ' + JSON.stringify(LN));
  console.log('OK: DXF-texten som linjer på plushöjden och prickarna som fyllda skivor', JSON.stringify(LN));
  // Egen färg (plan.dotColors) går alltid före statusfärgen – exporten följer färgerna som syns i vyn
  const C = await page.evaluate(() => { plan.dotColors = { p1: '#ff00aa', x2: '#00cc44' }; const ms = objExportMarkers(), dxf = buildObjectsDxf().text, ifc = buildObjectsIfc().text; const col = k => (ms.find(m => m.key === k) || {}).color;
    const dxfLayers = [...dxf.matchAll(/\r\n8\r\n(4D-[A-Z0-9-]+)\r\n/g)].map(m => m[1]); delete plan.dotColors;
    return { pp: col('pp:i:p1'), x2: col('xl:x2'), x1: col('xl:x1'), lay: [...new Set(dxfLayers)], ifcPink: /IFCCOLOURRGB\(\$,1\.,0\.,0\.667\)/.test(ifc), ifcGreen: /IFCCOLOURRGB\(\$,0\.,0\.8,0\.267\)/.test(ifc), tc: /420\r\n16711850\r\n/.test(dxf) };
  });
  if (C.pp !== '#ff00aa' || C.x2 !== '#00cc44' || C.x1 || !C.lay.includes('4D-EGEN-FF00AA') || !C.lay.includes('4D-EGEN-00CC44') || !C.lay.some(l => /^4D-(PAGAENDE|PLANERAD|KLAR|FORSENAD|INGEN)/.test(l)) || !C.ifcPink || !C.ifcGreen || !C.tc) fail('Egen färg före statusfärg i DXF/IFC: ' + JSON.stringify(C));
  console.log('OK: egen färg på punkten går före statusfärgen i DXF (eget lager + äkta färg) och IFC', JSON.stringify(C.lay));
  // Sparas i projektet (arbetsytans data), inte bara lokalt
  const SV = await page.evaluate(() => { let saves = 0; const orig = schedulePlanSave; window.schedulePlanSave = () => { saves++; }; exportAdjSet('xl:x1', { z: 6.25, comment: 'Spara mig' }); exportAdjSave(); const inPlan = JSON.parse(JSON.stringify(plans.find(p => p.id === plan.id))).exportAdj; const sv1 = saves, local = Object.keys(localStorage).filter(k => /exportadj/.test(k)).length;
    exportAdjSet('xl:x1', { z: NaN, comment: '' }); exportAdjSave(); window.schedulePlanSave = orig; return { saves: sv1, inPlan, local, after: !!plan.exportAdj }; });
  if (SV.saves !== 1 || !SV.inPlan || SV.inPlan['xl:x1'].z !== 6.25 || SV.inPlan['xl:x1'].comment !== 'Spara mig' || SV.local !== 0) fail('Justeringarna sparas i projektets arbetsyta: ' + JSON.stringify(SV));
  console.log('OK: justeringarna sparas i arbetsytans data i projektet (inte lokalt)', JSON.stringify(SV));
  // Panelen: dockad till vänster, sortering, kolumnbredd, flerval, fokus på kartan
  await page.evaluate(() => { xls.items.push({ id: 'x3', object_name: 'FAR', activity: 'Akt x3', area: 'Hus', start_date: '2026-09-01', end_date: '2026-12-01', status: 'pagaende', progress: 50 }, { id: 'x4', object_name: 'ZERO', activity: 'Akt x4', area: 'Hus', start_date: '2026-09-01', end_date: '2026-12-01', status: 'pagaende', progress: 50 }, { id: 'x5', object_name: 'N5', activity: 'a', area: 'Hus', start_date: '2026-09-01', end_date: '2026-12-01', status: 'pagaende', progress: 50 }, { id: 'x6', object_name: 'N6', activity: 'a', area: 'Hus', start_date: '2026-09-01', end_date: '2026-12-01', status: 'pagaende', progress: 50 });
    xls.positions.push({ id: 'x3', x: 5200, y: 40, z0: 1, z1: 3 }, { id: 'x4', x: 0, y: 0, z0: 1, z1: 3 }, { id: 'x5', x: 45, y: 25, z0: 1, z1: 3.2 }, { id: 'x6', x: 35, y: 25, z0: 1, z1: 3.1 }); xls.posPdf = null; exportAdjVer++; });
  await page.evaluate(() => { viewport = { convertToViewportPoint: (x, y) => [x, y], convertToPdfPoint: (x, y) => [x, y] }; view.tx = 0; view.ty = 0; view.scale = 1; view.rot = 0; });
  await page.evaluate(() => exportAdjOpen()); await page.waitForSelector('#adjPanel');
  const PN = await page.evaluate(() => ({ docked: !!document.getElementById('adjPanel').closest('#rdock .rd-body') && document.getElementById('rdock').previousElementSibling.tagName === 'MAIN' && !document.getElementById('rdock').hidden, rows: document.querySelectorAll('#adjT tbody tr[data-key]').length, warn: [...adj.warn.keys()], far: adj.warn.get('xl:x3') && adj.warn.get('xl:x3').text, zero: adj.warn.get('xl:x4') && adj.warn.get('xl:x4').text }));
  if (!PN.docked || PN.rows < 5 || !PN.warn.includes('xl:x3') || !PN.warn.includes('xl:x4') || !/Förslag/.test(PN.far) || !/0,0/.test(PN.zero)) fail('Panelen dockad + varningar för punkter långt bort / på 0,0: ' + JSON.stringify(PN));
  // 0,0 utelämnas ur filerna (spökade långt bort i 3D-editorn)
  const FX = await page.evaluate(() => { const d = buildObjectsDxf(), i = buildObjectsIfc(); return { n: d.n, nIfc: i.n, zeroIn: /ZERO/.test(d.text) || /ZERO/.test(i.text) }; });
  if (FX.zeroIn || FX.n !== FX.nIfc || FX.n < 6) fail('Punkter på 0,0 utelämnas ur DXF/IFC: ' + JSON.stringify(FX));
  // Sortera på kolumn
  await page.click('#adjT th[data-k="x"]'); const sx = await page.evaluate(() => [...document.querySelectorAll('#adjT tbody tr[data-key] td:nth-child(6)')].map(td => Number(td.textContent.replace(/\s/g, '').replace(',', '.')))); if (!sx.every((v, i) => i === 0 || v >= sx[i - 1])) fail('Sortera stigande på X: ' + JSON.stringify(sx));
  await page.click('#adjT th[data-k="x"]'); const sd = await page.evaluate(() => [...document.querySelectorAll('#adjT tbody tr[data-key] td:nth-child(6)')].map(td => Number(td.textContent.replace(/\s/g, '').replace(',', '.')))); if (!sd.every((v, i) => i === 0 || v <= sd[i - 1])) fail('Sortera fallande på X: ' + JSON.stringify(sd));
  // Kolumnbredd
  await page.evaluate(() => { document.querySelector('.adj-tw').scrollLeft = 0; }); await page.waitForTimeout(500);
  const cw = await page.evaluate(() => { const h = document.querySelector('#adjT .adj-cr[data-r="name"]').getBoundingClientRect(), c = ADJ_COLS.find(x => x.k === 'name'); return { x: h.left + h.width / 2, y: h.top + h.height / 2, w0: c.w }; });
  await page.mouse.move(cw.x, cw.y); await page.mouse.down(); await page.mouse.move(cw.x + 60, cw.y, { steps: 4 }); await page.mouse.up(); const w1 = await page.evaluate(() => ADJ_COLS.find(x => x.k === 'name').w); if (w1 < cw.w0 + 40) fail('Dra i kolumnkanten ändrar bredden: ' + JSON.stringify([cw.w0, w1]));
  // Tryck på namn: markeras och kartan centreras
  const FC = await page.evaluate(() => { const td = document.querySelector('#adjT td[data-nm="xl:x1"]'); td.click(); return { focus: adj.focus, sel: [...adj.sel], ring: !!document.querySelector('#adjRings .adj-ring') }; });
  if (FC.focus !== 'xl:x1' || FC.sel.length !== 1 || !FC.ring) fail('Tryck på namn markerar punkten på kartan: ' + JSON.stringify(FC));
  // Förslag på placering
  await page.evaluate(() => adjApplySuggestion('xl:x3')); const SG = await page.evaluate(() => { const m = objExportMarkers().find(x => x.key === 'xl:x3'); return { x: m.x, y: m.y, man: m.xyManual }; });
  if (!SG.man || Math.abs(SG.x) > 200) fail('Använd förslag flyttar punkten nära de andra: ' + JSON.stringify(SG));
  // Dra Excel-prick på kartan -> X/Y uppdateras i tabellen
  await page.evaluate(() => { adj.sel.clear(); adjRefresh(true); });
  await page.addStyleTag({ content: '#empty, [class*="empty-"], .empty { display: none !important; }' });
  const DR = await page.evaluate(() => { const o = xlsObjects().find(q => q.it.id === 'x1'), p0 = [...objExportMarkers().filter(m => m.key === 'xl:x1')][0]; const s = stageToScreen(toPx(o.pt)), r = document.getElementById('viewport').getBoundingClientRect(); return { x0: p0.x, y0: p0.y, sx: r.left + s[0], sy: r.top + s[1] }; });
  await page.mouse.move(DR.sx, DR.sy); await page.mouse.down(); await page.mouse.move(DR.sx + 40, DR.sy + 30, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(700);
  const DR2 = await page.evaluate(() => { const m = objExportMarkers().find(x => x.key === 'xl:x1'), cell = [...document.querySelectorAll('#adjT tr[data-key="xl:x1"] td')].map(t => t.textContent); return { x: m.x, y: m.y, man: m.xyManual, saved: !!(plan.exportAdj && plan.exportAdj['xl:x1'] && Number.isFinite(plan.exportAdj['xl:x1'].x)), cell: cell.slice(5, 7) }; });
  if (!DR2.man || !DR2.saved || (Math.abs(DR2.x - DR.x0) < 0.5 && Math.abs(DR2.y - DR.y0) < 0.5)) fail('Dra Excel-pricken på kartan flyttar den (X/Y sparas): ' + JSON.stringify([DR, DR2]));
  // Flerval + höjd
  await page.evaluate(() => { adj.sel.clear(); adjRender(); }); await page.click('#adjAll'); await page.fill('#adjZ', '9'); await page.click('#adjZSet');
  const z9 = await page.evaluate(() => objExportMarkers().map(m => [m.key, m.zTop, m.zManual])); if (!z9.every(x => x[1] === 9 && x[2])) fail('Sätt höjd för alla markerade: ' + JSON.stringify(z9));
  await page.fill('#adjDz', '-1.5'); await page.click('#adjDzSet'); const z75 = await page.evaluate(() => objExportMarkers().map(m => m.zTop)); if (!z75.every(v => v === 7.5)) fail('Höj/sänk markerade: ' + JSON.stringify(z75));
  await page.fill('#adjC', 'Justerad'); await page.click('#adjCSet'); const cm = await page.evaluate(() => objExportMarkers().filter(m => m.adj && m.adj.comment === 'Justerad').length); if (cm !== z9.length) fail('Kommentar på alla markerade: ' + cm);
  await page.click('#adjReset'); const rs = await page.evaluate(() => objExportMarkers().filter(m => m.zManual || m.adj).length); if (rs !== 0) fail('Återställ markerade: ' + rs);
  // Egenskapsrutan (#sitePop) dockas i samma ram via 📌
  const SP = await page.evaluate(async () => { const pop = document.getElementById('sitePop'); pop.innerHTML = '<b>Ny notering</b><label>Text</label><textarea class="sp-text"></textarea><div class="acts"><button>Spara</button></div>'; pop.classList.remove('hidden'); await new Promise(r => setTimeout(r, 50));
    const pin = pop.querySelector('.rd-pin'); const had = !!pin; pin.click(); await new Promise(r => setTimeout(r, 80)); const docked = !!pop.closest('#rdock .rd-body'), both = !!document.getElementById('adjPanel').closest('#rdock .rd-body'), order = [...document.querySelector('#rdock .rd-body').children].map(c => c.id);
    pop.querySelector('.rd-pin').click(); await new Promise(r => setTimeout(r, 80)); const back = pop.parentNode.tagName; pop.classList.add('hidden'); return { had, docked, both, order, back }; });
  if (!SP.had || !SP.docked || !SP.both || SP.order[0] !== 'sitePop' || SP.back !== 'MAIN') fail('Egenskapsrutan dockas i samma ram som exportpanelen: ' + JSON.stringify(SP));
  // Flytande läge och stäng
  await page.click('#adjMode'); const fl = await page.evaluate(() => ({ float: document.getElementById('adjPanel').classList.contains('adj-float'), parent: document.getElementById('adjPanel').parentNode.tagName })); if (!fl.float || fl.parent !== 'BODY') fail('Flyt fritt: ' + JSON.stringify(fl));
  await page.click('#adjClose'); if (await page.evaluate(() => !!document.getElementById('adjPanel') || !!document.getElementById('adjRings'))) fail('Stäng tar bort panel och ringar');
  { // Att docka/lösgöra paneler får inte zooma ut till hela planen
    const r = await page.evaluate(async () => { view.scale = 2.37; view.tx = -123; view.ty = -77; applyView(); const b = { s: view.scale, x: view.tx, y: view.ty }; rdockResizeView(); adjResizeView(); await new Promise(r => setTimeout(r, 150)); return { before: b, after: { s: view.scale, x: view.tx, y: view.ty } }; });
    if (r.after.s !== r.before.s || r.after.x !== r.before.x || r.after.y !== r.before.y) fail('Dockning ska inte ändra zoom/läge: ' + JSON.stringify(r)); }
  { // Prickens meny (#labelMenu) går att öppna i högerdockan; ligger kvar vid klick på kartan; stängs med ✕
    await page.evaluate(() => { localStorage.setItem('lagesplan-rdock-labelmenu', '0'); view.scale = 1.9; view.tx = -50; view.ty = -40; applyView(); openLabelMenu({ ids: [], text: '', act: '', box: {} }, { clientX: 400, clientY: 300 }); const m = document.getElementById('labelMenu'); m.innerHTML = '<div class="om-st">Status</div><button type="button" data-o="x">Släck X</button>'; m.classList.remove('hidden'); });
    await page.waitForTimeout(200);
    const a = await page.evaluate(() => { const m = document.getElementById('labelMenu'); return { bar: !!m.querySelector('.rd-lmbar'), pin: !!m.querySelector('.rd-lmpin'), floating: !m.closest('#rdock') }; });
    if (!a.bar || !a.pin || !a.floating) fail('Menyn ska ha en 📌-rad och ligga fritt från början: ' + JSON.stringify(a));
    await page.click('#labelMenu .rd-lmpin'); await page.waitForTimeout(250);
    const b = await page.evaluate(() => { const m = document.getElementById('labelMenu'), r = document.getElementById('rdock'); return { docked: !!m.closest('#rdock .rd-body'), dockVisible: !r.hidden, scale: view.scale, st: getComputedStyle(m).position, pref: localStorage.getItem('lagesplan-rdock-labelmenu') }; });
    if (!b.docked || !b.dockVisible || b.scale !== 1.9 || b.st !== 'static' || b.pref !== '1') fail('📌 ska docka menyn i högerdockan utan att zooma om: ' + JSON.stringify(b));
    await page.mouse.click(200, 400); await page.waitForTimeout(200);
    const c = await page.evaluate(() => !document.getElementById('labelMenu').classList.contains('hidden'));
    if (!c) fail('Den dockade menyn ska ligga kvar när man klickar på kartan');
    await page.evaluate(() => { const m = document.getElementById('labelMenu'); m.innerHTML = '<button type="button">Nästa prick</button>'; });   // ny prick: innehållet byts, raden kommer tillbaka
    await page.waitForTimeout(150);
    if (!await page.evaluate(() => !!document.querySelector('#rdock #labelMenu .rd-lmbar'))) fail('Raden ska finnas även när innehållet byts');
    await page.click('#labelMenu .rd-lmx'); await page.waitForTimeout(200);
    const d = await page.evaluate(() => ({ hidden: document.getElementById('labelMenu').classList.contains('hidden'), dockHidden: document.getElementById('rdock').hidden || ![...document.querySelectorAll('#rdock .rd-body > *')].some(e => !e.classList.contains('hidden') && !e.hidden) }));
    if (!d.hidden) fail('✕ ska stänga menyn: ' + JSON.stringify(d));
    await page.evaluate(() => { const m = document.getElementById('labelMenu'); m.classList.remove('hidden'); });
    await page.waitForTimeout(150); await page.click('#labelMenu .rd-lmpin'); await page.waitForTimeout(250);
    const e2 = await page.evaluate(() => ({ back: document.getElementById('labelMenu').parentNode.tagName, pref: localStorage.getItem('lagesplan-rdock-labelmenu') }));
    if (e2.back !== 'BODY' || e2.pref !== '0') fail('📌 igen ska lösgöra menyn: ' + JSON.stringify(e2));
    await page.evaluate(() => document.getElementById('labelMenu').classList.add('hidden')); }
  { // Högermenyn: alltid synlig (även tom), dölj-knapp och flik för att visa den igen
    await page.evaluate(() => { localStorage.setItem('lagesplan-rdock-hidden', '0'); rdockBoot(); rdockResync(); rdockRefresh(); });
    await page.waitForTimeout(250);
    const a = await page.evaluate(() => { const r = document.getElementById('rdock'); return { shown: !!r && !r.hidden && r.getBoundingClientRect().width > 300, empty: !!r.querySelector('.rd-empty') && getComputedStyle(r.querySelector('.rd-empty')).display !== 'none' || r.classList.contains('rd-has'), tab: !document.getElementById('rdockTab') || document.getElementById('rdockTab').hidden }; });
    if (!a.shown || !a.tab) fail('Dockan ska vara synlig även utan markering: ' + JSON.stringify(a));
    await page.evaluate(() => { view.scale = 1.7; view.tx = -20; view.ty = -30; applyView(); });
    await page.click('#rdock .rd-hide'); await page.waitForTimeout(250);
    const b = await page.evaluate(() => ({ hidden: document.getElementById('rdock').hidden, tab: !document.getElementById('rdockTab').hidden, pref: localStorage.getItem('lagesplan-rdock-hidden'), scale: view.scale, allowed: rdockAllowed() }));
    if (!b.hidden || !b.tab || b.pref !== '1' || b.scale !== 1.7 || b.allowed) fail('Dölj ska gömma dockan, visa fliken och behålla zoomen: ' + JSON.stringify(b));
    await page.click('#rdockTab'); await page.waitForTimeout(250);
    const c = await page.evaluate(() => ({ hidden: document.getElementById('rdock').hidden, tab: document.getElementById('rdockTab').hidden, scale: view.scale }));
    if (c.hidden || !c.tab || c.scale !== 1.7) fail('Fliken ska visa dockan igen: ' + JSON.stringify(c)); }
  console.log('OK: panelen – dockad, varningar med förslag, sortering, kolumnbredd, tryck på namn, dra prick på kartan, flerval, flytande, 0,0 utelämnas ur filerna', JSON.stringify({ PN: PN.rows, FX, w1 }));
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_objexport');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
