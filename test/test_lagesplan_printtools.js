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
    await page.evaluate(() => { pr.dirty = false; closePrint(); });
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('ALLA TESTER OK');
  } catch (e) { console.log('FEL: ' + e.message); process.exitCode = 1; }
  await browser.close(); server.close();
})();
