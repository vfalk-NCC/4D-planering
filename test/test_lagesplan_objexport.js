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
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
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
  // Egen färg (plan.dotColors) går alltid före statusfärgen – exporten följer färgerna som syns i vyn
  const C = await page.evaluate(() => { plan.dotColors = { p1: '#ff00aa', x2: '#00cc44' }; const ms = objExportMarkers(), dxf = buildObjectsDxf().text, ifc = buildObjectsIfc().text; const col = k => (ms.find(m => m.key === k) || {}).color;
    const dxfLayers = [...dxf.matchAll(/\r\n8\r\n(4D-[A-Z0-9-]+)\r\n10/g)].map(m => m[1]); delete plan.dotColors;
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
  const PN = await page.evaluate(() => ({ docked: document.getElementById('adjPanel').parentNode === document.getElementById('layout') && document.getElementById('adjPanel').nextElementSibling.tagName === 'MAIN', rows: document.querySelectorAll('#adjT tbody tr[data-key]').length, warn: [...adj.warn.keys()], far: adj.warn.get('xl:x3') && adj.warn.get('xl:x3').text, zero: adj.warn.get('xl:x4') && adj.warn.get('xl:x4').text }));
  if (!PN.docked || PN.rows < 5 || !PN.warn.includes('xl:x3') || !PN.warn.includes('xl:x4') || !/Förslag/.test(PN.far) || !/0,0/.test(PN.zero)) fail('Panelen dockad + varningar för punkter långt bort / på 0,0: ' + JSON.stringify(PN));
  // 0,0 utelämnas ur filerna (spökade långt bort i 3D-editorn)
  const FX = await page.evaluate(() => { const d = buildObjectsDxf(), i = buildObjectsIfc(); return { n: d.n, nIfc: i.n, zeroIn: /ZERO/.test(d.text) || /ZERO/.test(i.text) }; });
  if (FX.zeroIn || FX.n !== FX.nIfc || FX.n < 6) fail('Punkter på 0,0 utelämnas ur DXF/IFC: ' + JSON.stringify(FX));
  // Sortera på kolumn
  await page.click('#adjT th[data-k="x"]'); const sx = await page.evaluate(() => [...document.querySelectorAll('#adjT tbody tr[data-key] td:nth-child(6)')].map(td => Number(td.textContent.replace(/\s/g, '').replace(',', '.')))); if (!sx.every((v, i) => i === 0 || v >= sx[i - 1])) fail('Sortera stigande på X: ' + JSON.stringify(sx));
  await page.click('#adjT th[data-k="x"]'); const sd = await page.evaluate(() => [...document.querySelectorAll('#adjT tbody tr[data-key] td:nth-child(6)')].map(td => Number(td.textContent.replace(/\s/g, '').replace(',', '.')))); if (!sd.every((v, i) => i === 0 || v <= sd[i - 1])) fail('Sortera fallande på X: ' + JSON.stringify(sd));
  // Kolumnbredd
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
  // Flytande läge och stäng
  await page.click('#adjMode'); const fl = await page.evaluate(() => ({ float: document.getElementById('adjPanel').classList.contains('adj-float'), parent: document.getElementById('adjPanel').parentNode.tagName })); if (!fl.float || fl.parent !== 'BODY') fail('Flyt fritt: ' + JSON.stringify(fl));
  await page.click('#adjClose'); if (await page.evaluate(() => !!document.getElementById('adjPanel') || !!document.getElementById('adjRings'))) fail('Stäng tar bort panel och ringar');
  console.log('OK: panelen – dockad, varningar med förslag, sortering, kolumnbredd, tryck på namn, dra prick på kartan, flerval, flytande, 0,0 utelämnas ur filerna', JSON.stringify({ PN: PN.rows, FX, w1 }));
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_objexport');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
