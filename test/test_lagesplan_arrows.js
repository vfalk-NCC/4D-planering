// Pilar i utskriftslayouten (Victor 2026-10-08): elementet "Pil" med klassiska och moderna stilar och
// formerna rak, böjd, S-kurva och vinklad. Start och spets dras med handtagen, panelen byter stil/form,
// pilen kommer med i PDF:en och i DXF:en, ångra fungerar.
// SHOT=fil.png sparar en bild av alla stilar × former.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8991;
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
    // Alla stilar × former ritas utan fel och med synligt innehåll.
    const grid = await page.evaluate(() => {
      const styles = Object.keys(ARROW_STYLES), shapes = Object.keys(ARROW_SHAPES);
      const c = document.createElement('canvas'); c.width = 1200; c.height = 140 * styles.length + 40;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      const empty = [];
      styles.forEach((st, i) => shapes.forEach((sh, j) => {
        const x = 40 + j * 290, y = 30 + i * 140;
        const el = { style: st, shape: sh, stroke: ['#dc2626', '#0f172a', '#2563eb'][i % 3], lw: ARROW_STYLES[st].lw, head: 100, bend: 45, shadow: i > 2, double: j === 3 && i === 1, dash: sh === 'elbow' && !ARROW_RIBBON.has(st) ? 'dotted' : 'solid', outline: '#000' };
        g.fillStyle = '#334155'; g.font = '13px Arial'; g.fillText(`${ARROW_STYLES[st].label} – ${ARROW_SHAPES[sh]}`, x, y + 6);
        drawArrow(g, [x + 10, y + 100], [x + 240, y + 30], el, 6);
        const d = g.getImageData(x, y + 15, 260, 110).data; let n = 0; for (let k = 0; k < d.length; k += 4) if (d[k] < 200 || d[k + 2] < 200) n++;
        if (n < 80) empty.push(st + '/' + sh);
      }));
      return { url: c.toDataURL('image/png'), empty };
    });
    if (process.env.SHOT) fs.writeFileSync(process.env.SHOT, Buffer.from(grid.url.split(',')[1], 'base64'));
    if (grid.empty.length) fail('Pilar som inte syns: ' + grid.empty.join(', '));
    console.log('OK: alla stilar (klassisk, öppen, block, avsmalnande, rundad, toning) i alla former (rak, böjd, S-kurva, vinklad)');
    // I utskriftslayouten: knappen lägger in en pil, handtaget i spetsen flyttar bara spetsen, panelen byter stil och form.
    const r = await page.evaluate(async () => {
      viewport = { transform: [1, 0, 0, 1, 0, 0], width: 1000, height: 800, convertToPdfPoint: (x, y) => [x, y], convertToViewportPoint: (x, y) => [x, y] };
      plan = { id: 'pl', name: 'P', zones: [], photos: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } };
      await openPrint();
      const btn = document.querySelector('#prAdd [data-add="arrow"]'); btn.click();
      const el = pr.tpl.elements[pr.tpl.elements.length - 1];
      const out = { type: el.type, style: el.style, sel: pr.sels[0] === el.id };
      out.panel = document.querySelectorAll('#prProps [data-arrow]').length === 6 && document.querySelectorAll('#prProps [data-ashape]').length === 4;
      const box = elBox(el); out.box = box.h > 15 && box.w > 50; // spetsens bredd och tjockleken får plats i markeringen
      document.querySelector('#prProps [data-arrow="classic"]').click();
      out.classic = el.style === 'classic' && el.lw === 0.35 && !!document.querySelector('#prProps select[data-f="dash"]');
      document.querySelector('#prProps [data-ashape="s"]').click();
      out.shape = el.shape === 's';
      const undoN = pr.undo.length; prUndo(); const el2 = pr.tpl.elements.find(e => e.id === el.id); out.undo = el2.shape === 'straight' && pr.undo.length === undoN - 1;
      prRedo();
      return out;
    });
    if (r.type !== 'arrow' || r.style !== 'modern' || !r.sel || !r.panel || !r.box || !r.classic || !r.shape || !r.undo) fail('Pil i utskriftslayouten: ' + JSON.stringify(r));
    // Dra i spetsens handtag (index 3) med musen: bara spetsen flyttas, starten står still.
    const pts = await page.evaluate(() => {
      const el = pr.tpl.elements.find(e => e.type === 'arrow'), { k } = pageDims(), { u, ox, oy, dpr, c } = pr.L, r = c.getBoundingClientRect();
      const toScr = ([x, y]) => [r.left + (x * k * u + ox) / dpr, r.top + (y * k * u + oy) / dpr];
      return { el: { x: el.x, y: el.y, w: el.w, h: el.h }, tip: toScr([el.x + el.w, el.y + el.h]), start: toScr([el.x, el.y]) };
    });
    await page.mouse.move(...pts.tip); await page.mouse.down(); await page.mouse.move(pts.tip[0] + 40, pts.tip[1] + 60, { steps: 4 }); await page.mouse.up();
    const after = await page.evaluate(() => { const el = pr.tpl.elements.find(e => e.type === 'arrow'); return { x: el.x, y: el.y, w: el.w, h: el.h }; });
    if (Math.abs(after.x - pts.el.x) > 0.01 || Math.abs(after.y - pts.el.y) > 0.01 || after.w <= pts.el.w + 2 || after.h <= pts.el.h + 2) fail('Spetsens handtag ska flytta spetsen, inte starten: ' + JSON.stringify({ before: pts.el, after }));
    console.log('OK: Pil-knappen, stil- och formval i panelen, handtag i start/spets, ångra');
    // DXF (bladet): pilen hamnar i lagret PILAR. PDF: pilen rastreras utan fel.
    const ex = await page.evaluate(async () => {
      const files = await buildPrintDxf(pr.tpl, () => {}, 'sheet');
      const d = parseDxf(files[0].text);
      const el = pr.tpl.elements.find(e => e.type === 'arrow'); el.style = 'gradient'; el.shadow = true; el.double = true;
      const b = arrowBounds(el), c = newCanvas(Math.ceil(b.w * 10), Math.ceil(b.h * 10)), g = c.getContext('2d');
      g.translate(-b.x * 10, -b.y * 10); drawElement(g, el, pr.tpl, 10, 1);
      const px = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 40) n++;
      // Pilen ska rymmas i sin ruta: kanterna av rastret är tomma.
      let edge = 0; for (let x = 0; x < c.width; x++) { if (px[(x) * 4 + 3] > 40) edge++; if (px[((c.height - 1) * c.width + x) * 4 + 3] > 40) edge++; }
      pr.dirty = false; closePrint();
      return { pilar: 'PILAR' in d.layers, raster: n > 200, edge };
    });
    if (!ex.pilar || !ex.raster || ex.edge > 2) fail('Pilen i DXF/PDF: ' + JSON.stringify(ex));
    console.log('OK: pilen i DXF:en (lager PILAR) och i PDF-rastret (ryms i sin ruta)');
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('ALLA TESTER OK');
  } catch (e) { console.log('FEL: ' + e.message); process.exitCode = 1; }
  await browser.close(); server.close();
})();
