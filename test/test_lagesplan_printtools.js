// Utskriftslayoutens verktyg (Victor 2026-10-08): tom färg = "ingen", högerklicksmeny, fördela jämnt,
// kopiera/klistra stil, ruta/linje (rundade hörn, streckad, genomskinlig) m.m.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8990;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  try {
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error("x")) }) };' }));
    await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(800);
    await page.evaluate(async () => {
      viewport = { transform: [1, 0, 0, 1, 0, 0], width: 1000, height: 800, convertToPdfPoint: (x, y) => [x, y], convertToViewportPoint: (x, y) => [x, y] };
      plan = { id: 'pl', name: 'P', zones: [], photos: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } };
      await openPrint();
      pr.tpl.elements = [];
      [[20, 'a'], [70, 'b'], [200, 'c']].forEach(([x, id]) => pr.tpl.elements.push({ id, type: 'rect', x, y: 30, w: 20, h: 10, stroke: '#000000', fill: '', lw: 0.35 }));
      pr.tpl.elements.push({ id: 't', type: 'text', x: 20, y: 100, w: 60, h: 20, text: 'Hej', size: 9, color: '#000000', fill: '', border: '' });
      setSel(['t']); renderPrintPanel(); drawPrintPage();
    });
    // 1) Tom färg visas som "ingen", inte svart; vald färg tar bort markeringen.
    const col = await page.evaluate(() => {
      const fill = document.querySelector('#prProps input[data-f="fill"]'), txt = document.querySelector('#prProps input[data-f="color"]');
      const out = { fillEmpty: fill.classList.contains('empty'), noneOn: !!document.querySelector('#prProps .pr-nocolor.on[data-f="fill"]'), textNoNone: !document.querySelector('#prProps .pr-nocolor[data-f="color"]') };
      fill.value = '#ff0000'; fill.dispatchEvent(new Event('change'));
      out.picked = pr.tpl.elements.find(e => e.id === 't').fill === '#ff0000' && !fill.classList.contains('empty');
      document.querySelector('#prProps .pr-nocolor[data-f="fill"]').click();
      out.cleared = pr.tpl.elements.find(e => e.id === 't').fill === '' && document.querySelector('#prProps input[data-f="fill"]').classList.contains('empty');
      const lab = [...document.querySelectorAll('#prProps .pr-grid4 label')].every(l => l.getBoundingClientRect().height < 20);
      out.oneLine = lab;
      return out;
    });
    if (Object.values(col).some(v => v !== true)) fail('Färgrutor: ' + JSON.stringify(col));
    console.log('OK: tom färg visas som "ingen" (inte svart), ∅ tömmer, rubriker på en rad');
    // 2) Högerklick på ett element: markerar det och visar menyn; Duplicera via menyn.
    const scr = async (x, y) => page.evaluate(([x, y]) => { const { k } = pageDims(), { u, ox, oy, dpr, c } = pr.L, r = c.getBoundingClientRect(); return [r.left + (x * k * u + ox) / dpr, r.top + (y * k * u + oy) / dpr]; }, [x, y]);
    let p = await scr(80, 35);
    await page.mouse.click(p[0], p[1], { button: 'right' });
    const ctx1 = await page.evaluate(() => ({ menu: !!document.getElementById('prCtx'), sel: pr.sels.join(), head: document.querySelector('#prCtx .pc-head').textContent, drag: !pr.drag }));
    if (!ctx1.menu || ctx1.sel !== 'b' || ctx1.head !== 'Ruta' || !ctx1.drag) fail('Högerklick ska markera elementet och visa menyn: ' + JSON.stringify(ctx1));
    await page.click('#prCtx [data-ctx="dup"]');
    const dup = await page.evaluate(() => ({ n: pr.tpl.elements.length, menu: !!document.getElementById('prCtx') }));
    if (dup.n !== 5 || dup.menu) fail('Duplicera via menyn: ' + JSON.stringify(dup));
    await page.evaluate(() => prUndo());
    // Esc stänger bara menyn (inte markeringen eller layouten).
    await page.mouse.click(p[0], p[1], { button: 'right' }); await page.keyboard.press('Escape');
    const esc = await page.evaluate(() => ({ menu: !!document.getElementById('prCtx'), sel: pr.sels.join(), open: !document.getElementById('printModal').classList.contains('hidden') }));
    if (esc.menu || esc.sel !== 'b' || !esc.open) fail('Esc ska stänga menyn och inget annat: ' + JSON.stringify(esc));
    // Högerklick på tomt blad: Klistra in / Markera alla.
    p = await scr(300, 150);
    await page.mouse.click(p[0], p[1], { button: 'right' });
    const blank = await page.evaluate(() => ({ head: document.querySelector('#prCtx .pc-head').textContent, sel: pr.sels.length, all: !!document.querySelector('#prCtx [data-ctx="all"]') }));
    await page.click('#prCtx [data-ctx="all"]');
    if (blank.head !== 'Bladet' || blank.sel || !blank.all || (await page.evaluate(() => pr.sels.length)) !== 4) fail('Högerklick på tomt blad: ' + JSON.stringify(blank));
    console.log('OK: högerklicksmeny – markerar, duplicerar, Esc stänger bara menyn, tomt blad: markera alla');
    // 3) Fördela jämnt och kopiera/klistra stil.
    const dist = await page.evaluate(() => {
      setSel(['a', 'b', 'c']); renderPrintPanel();
      document.querySelector('#prProps [data-dist="h"]').click();
      const xs = ['a', 'b', 'c'].map(id => pr.tpl.elements.find(e => e.id === id).x);
      const a = pr.tpl.elements.find(e => e.id === 'a'); a.stroke = '#2563eb'; a.lw = 1;
      setSel(['a']); copyStyleSel(); setSel(['c', 't']); pasteStyleSel();
      const c = pr.tpl.elements.find(e => e.id === 'c'), t = pr.tpl.elements.find(e => e.id === 't');
      prUndo(); const c2 = pr.tpl.elements.find(e => e.id === 'c');
      return { xs, style: c.stroke === '#2563eb' && c.lw === 1 && t.stroke === '#2563eb', undo: c2.stroke === '#000000' };
    });
    if (JSON.stringify(dist.xs) !== '[20,110,200]' || !dist.style || !dist.undo) fail('Fördela jämnt / stil: ' + JSON.stringify(dist));
    console.log('OK: fördela jämnt (första/sista står still), kopiera och klistra in stil, ångra');
    // 4) Ruta: rundade hörn, streckad, genomskinlig fyllning – på skärmen och i PDF:en. Linje: streckad.
    const rc = await page.evaluate(async () => {
      const el = { id: 'r', type: 'rect', x: 0, y: 0, w: 20, h: 10, stroke: '#000000', fill: '#ff0000', lw: 0.35, radius: 3, fillOpacity: 50, dash: 'dashed' };
      const c = document.createElement('canvas'); c.width = 200; c.height = 100; const g = c.getContext('2d');
      drawElement(g, el, pr.tpl, 10, 1);
      const px = (x, y) => g.getImageData(x, y, 1, 1).data;
      const out = { corner: px(1, 1)[3] === 0, half: Math.abs(px(100, 50)[3] - 128) < 4 && px(100, 50)[0] > 200 };
      setSel([]); pr.tpl.elements.push(el, { id: 'l', type: 'line', x: 0, y: 40, w: 50, h: 0, stroke: '#000000', lw: 0.5, dash: 'dotted' }); setSel(['r']); renderPrintPanel();
      out.panel = ['radius', 'fillOpacity', 'dash'].every(f => !!document.querySelector(`#prProps [data-f="${f}"]`)) && document.querySelector('#prProps [data-f="fillOpacity"]').value === '50';
      const calls = [];
      window.jspdf = { jsPDF: function () { return new Proxy({}, { get: (t, k) => k === 'GState' ? function (o) { calls.push('GState ' + JSON.stringify(o)); } : k === 'splitTextToSize' ? (s => [String(s)]) : k === 'output' ? (() => new ArrayBuffer(8)) : ((...a) => { calls.push(k + ' ' + JSON.stringify(a)); }) }); } };
      window.alert = m => calls.push('ALERT ' + m);
      pr.tpl.elements = pr.tpl.elements.filter(e => e.id === 'r' || e.id === 'l'); pr.tpl.frame = { on: false };
      await exportPrintPdf();
      const k = pageDims().k;
      out.pdf = calls.some(c => c.startsWith('roundedRect') && c.includes('"F"')) && calls.some(c => c.startsWith('roundedRect') && c.includes('"D"'))
        && calls.some(c => c === 'GState {"opacity":0.5}') && calls.filter(c => /^setLineDashPattern \[\[\d/.test(c)).length === 2 && calls.some(c => c.startsWith('line '));
      if (!out.pdf) out.calls = calls.filter(c => /Rect|rect|GState|Dash|line /.test(c));
      return out;
    });
    if (rc.corner !== true || rc.half !== true || rc.panel !== true || rc.pdf !== true) fail('Ruta/linje: ' + JSON.stringify(rc));
    console.log('OK: ruta med rundade hörn, streckad linje och genomskinlig fyllning (skärm och PDF), streckad/prickad linje');
    // 5) Text: kursiv, lodrät justering, marginal, radavstånd – skärm och PDF.
    const tx = await page.evaluate(async () => {
      const el = { id: 'tx', type: 'text', x: 10, y: 10, w: 60, h: 40, text: 'Rad', size: 10, color: '#000000', fill: '', border: '' };
      pr.tpl.elements = [el]; setSel(['tx']); renderPrintPanel();
      const out = { panel: ['italic', 'pad', 'lineH'].every(f => !!document.querySelector(`#prProps [data-f="${f}"]`)) && document.querySelectorAll('#prProps [data-tset="valign"]').length === 3 };
      document.querySelector('#prProps [data-tset="valign"][data-v="middle"]').click();
      document.querySelector('#prProps [data-tset="align"][data-v="center"]').click();
      const it = document.querySelector('#prProps [data-f="italic"]'); it.checked = true; it.dispatchEvent(new Event('change'));
      const b = document.querySelector('#prProps [data-f="bold"]'); b.checked = true; b.dispatchEvent(new Event('change'));
      out.set = el.valign === 'middle' && el.align === 'center' && el.italic && el.bold && document.querySelector('#prProps [data-tset="valign"][data-v="middle"]').classList.contains('on');
      const calls = [];
      window.jspdf = { jsPDF: function () { return new Proxy({}, { get: (t, k) => k === 'splitTextToSize' ? (s => [String(s)]) : k === 'output' ? (() => new ArrayBuffer(8)) : ((...a) => { calls.push([k, a]); }) }); } };
      await exportPrintPdf();
      const k = pageDims().k, font = calls.find(c => c[0] === 'setFont'), t = calls.find(c => c[0] === 'text');
      const fsMm = 10 * k * PT_MM, mid = 10 * k + (40 * k - fsMm) / 2;
      out.pdf = font && font[1][1] === 'bolditalic' && t && Math.abs(t[1][2] - mid) < 0.01 && t[1][3].align === 'center';
      if (!out.pdf) out.dbg = JSON.stringify({ font, t, mid });
      return out;
    });
    if (tx.panel !== true || tx.set !== true || tx.pdf !== true) fail('Text: ' + JSON.stringify(tx));
    console.log('OK: text – kursiv, lodrät justering (mitten), justering, marginal och radavstånd, även i PDF:en');
    // 6) Pratbubbla och ellips: läggs in med knapparna, spetsen dras med sitt handtag, följer med vid flytt, PDF/DXF.
    const cb = await page.evaluate(() => {
      pr.tpl.elements = []; setSel([]);
      document.querySelector('#prAdd [data-add="callout"]').click();
      const el = pr.tpl.elements[0];
      el.x = 50; el.y = 50; el.w = 50; el.h = 20; el.tx = 80; el.ty = 40; drawPrintPage();
      const { k } = pageDims(), { u, ox, oy, dpr, c } = pr.L, r = c.getBoundingClientRect();
      const scr = (x, y) => [r.left + (x * k * u + ox) / dpr, r.top + (y * k * u + oy) / dpr];
      return { type: el.type, panel: !!document.querySelector('#prProps textarea[data-f="text"]') && !!document.querySelector('#prProps [data-f="radius"]'), tip: scr(130, 90), to: scr(20, 100), body: scr(60, 55) };
    });
    if (cb.type !== 'callout' || !cb.panel) fail('Pratbubblan ska läggas in med sina val: ' + JSON.stringify(cb));
    await page.mouse.move(...cb.tip); await page.mouse.down(); await page.mouse.move(cb.to[0], cb.to[1], { steps: 4 }); await page.mouse.up();
    const tip = await page.evaluate(() => { const el = pr.tpl.elements[0]; return { x: el.x, y: el.y, w: el.w, tx: el.tx, ty: el.ty, out: calloutOutline(el).some(([x, y]) => Math.abs(x - 20) < 0.6 && Math.abs(y - 100) < 0.6) }; });
    if (tip.x !== 50 || tip.w !== 50 || Math.abs(tip.tx + 30) > 0.6 || Math.abs(tip.ty - 50) > 0.6 || !tip.out) fail('Spetsens handtag ska flytta spetsen, inte rutan: ' + JSON.stringify(tip));
    await page.mouse.move(...cb.body); await page.mouse.down(); await page.mouse.move(cb.body[0] + 30, cb.body[1], { steps: 3 }); await page.mouse.up();
    const mv = await page.evaluate(() => { const el = pr.tpl.elements[0]; return { x: el.x, tx: el.tx }; });
    if (mv.x <= 50 || Math.abs(mv.tx + 30) > 0.6) fail('Spetsen ska följa med när bubblan flyttas: ' + JSON.stringify(mv));
    const sh = await page.evaluate(async () => {
      setSel([]); document.querySelector('#prAdd [data-add="ellipse"]').click();
      const e = pr.tpl.elements[pr.tpl.elements.length - 1];
      const out = { type: e.type, panel: !!document.querySelector('#prProps [data-f="fillOpacity"]') && !document.querySelector('#prProps [data-f="radius"]') };
      const calls = [];
      window.jspdf = { jsPDF: function () { return new Proxy({}, { get: (t, k) => k === 'GState' ? function () {} : k === 'splitTextToSize' ? (s => [String(s)]) : k === 'output' ? (() => new ArrayBuffer(8)) : ((...a) => { calls.push([k, a]); }) }); } };
      await exportPrintPdf();
      out.pdf = calls.some(c => c[0] === 'lines' && c[1][5] === true && c[1][4] === 'FD') && calls.some(c => c[0] === 'text' && c[1][0] === 'Text') && calls.some(c => c[0] === 'ellipse' && c[1][4] === 'D');
      const d = parseDxf((await buildPrintDxf(pr.tpl, () => {}, 'sheet'))[0].text);
      out.dxf = 'PRATBUBBLOR' in d.layers && 'FORMER' in d.layers;
      return out;
    });
    if (sh.type !== 'ellipse' || !sh.panel || !sh.pdf || !sh.dxf) fail('Ellips/pratbubbla i panel, PDF och DXF: ' + JSON.stringify(sh));
    console.log('OK: pratbubbla (spetsen dras med sitt handtag och följer med vid flytt) och ellips – panel, PDF (vektor) och DXF');
    // 7) Verktygsraden överst: alla verktyg med ikon och namn, och den täcker inte bladet.
    const bar = await page.evaluate(() => {
      pr.zoom = 1; pr.vx = pr.vy = 0; drawPrintPage();
      const b = document.getElementById('prAdd'), btns = [...b.querySelectorAll('[data-add]')];
      const { oy, dpr, c } = pr.L, pageTop = c.getBoundingClientRect().top + oy / dpr;
      return { n: btns.length, icons: btns.every(x => x.querySelector('svg') && x.textContent.trim() && x.title), types: btns.every(x => ELEMENT_TYPES[x.dataset.add]), clear: b.getBoundingClientRect().bottom <= pageTop, oldGone: !document.querySelector('.pr-side .tool-grid') };
    });
    if (bar.n !== 13 || !bar.icons || !bar.types || !bar.clear || !bar.oldGone) fail('Verktygsraden: ' + JSON.stringify(bar));
    console.log('OK: verktygsraden överst – 13 verktyg med ikon, namn och förklaring, täcker inte bladet');
    await page.evaluate(() => { pr.dirty = false; closePrint(); });
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('ALLA TESTER OK');
  } catch (e) { console.log('FEL: ' + e.message); process.exitCode = 1; }
  await browser.close(); server.close();
})();
