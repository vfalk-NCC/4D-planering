// DXF i utskriftslayouten (Victors önskemål 2026-10-06): texter som blir för små på papperet syns
// (förstoras till minst 1 mm, valbart), och linjetjockleken för DXF:erna ställs per ritning.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8987;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: () => ({ promise: Promise.resolve(), cancel() {} }) };
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
  const r = await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan', file_path: 'a.pdf', zones: [], calib: { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] } }];
    pdfCache.set('A', new Uint8Array([1]).buffer); await openPlan('A');
    // En DXF med en linje och en 0,25 m hög text (mm i filens enheter).
    const rec = { id: 'c1', type: 'cad', name: 'Utsättning', path: 'x', colorMode: 'orig', weight: 1, layers: [{ name: 'TEXT', color: '#ff0000', n: 2 }], stats: { lines: 1, texts: 1, kb: 1 } };
    siteItems.push(rec); ls('cad:c1').visible = true;
    const path2 = new Path2D(); path2.moveTo(0, 0); path2.lineTo(50000, 0);
    cadGeom.set('c1', { origin: [10, 10], groups: [{ l: 0, c: '#ff0000', path: path2, raw: [[0, 0, 50000, 0]], texts: [[1000, 1000, 250, 0, 'AXEL 28', 'lb']] }] });
    // Ritningen i 1:1000 – texten blir 0,25 mm på papperet.
    const spy = () => { const out = { texts: [], fonts: [], lw: [] }; const c = document.createElement('canvas').getContext('2d');
      return { out, ctx: new Proxy(c, { get: (o, k) => k === 'fillText' ? ((t, ...a) => { out.texts.push(t); out.fonts.push(o.font); }) : k === 'stroke' ? (p => { out.lw.push(o.lineWidth); }) : typeof o[k] === 'function' ? o[k].bind(o) : o[k], set: (o, k, v) => { o[k] = v; return true; } }) }; };
    const pxPerMm = 4, k = 0.25; // canvas-px per mm; texten 0,25 mm
    const run = opts => { const s = spy(); cadPrintOpts = { pxPerMm, ...opts }; try { drawCad(s.ctx, [1, 0, 0, 1, 0, 0], 1); } finally { cadPrintOpts = null; } return s.out; };
    // Skalan i testet: 1 m = 10 stage-px; texten 0,25 m = 2,5 stage-px = 2,5 canvas-px = 0,625 mm vid 4 px/mm.
    const asIs = run({ lw: 1, minTextMm: null }), min2 = run({ lw: 1, minTextMm: 5 }), hidden = run({ lw: 1, hideText: true }), thick = run({ lw: 2.5, minTextMm: 1 });
    const fontPx = f => parseFloat(/([\d.]+)px/.exec(f)[1]);
    // Vektor-PDF: samma val.
    const doc = { calls: [], saveGraphicsState() {}, restoreGraphicsState() {}, rect() {}, clip() {}, discardPath() {}, setLineCap() {}, setLineJoin() {}, setDrawColor() {}, lines() {}, setTextColor() {}, setFont() {},
      setLineWidth(w) { this.calls.push(['lw', w]); }, setFontSize(f) { this.calls.push(['fs', f]); }, text(t) { this.calls.push(['text', t]); } };
    cadPrintOpts = { lw: 2, minTextMm: 1.5, pxPerMm }; const plan1 = cadVectorPlan(); cadPrintOpts = null;
    drawCadVectorsToPdf(doc, plan1, [0.1, 0, 0, 0.1, 0, 0], [0, 0, 1000, 1000], 0.1, 0.3528);
    return { asIs: asIs.texts, min2: min2.fonts.map(fontPx), hidden: hidden.texts.length, lw1: asIs.lw[0], lw25: thick.lw[0], vec: doc.calls };
  });
  if (!r.asIs.includes('AXEL 28')) fail('En liten DXF-text ska inte försvinna i utskriften: ' + JSON.stringify(r));
  if (Math.abs(r.min2[0] - 20) > 0.01) fail('"Minst 5 mm" ska förstora texten till 5 mm på papperet: ' + JSON.stringify(r.min2));
  if (r.hidden) fail('"Dölj texterna" ska dölja dem');
  if (Math.abs(r.lw25 / r.lw1 - 2.5) > 0.01) fail('Linjetjockleken ska följa valet: ' + JSON.stringify(r));
  const vfs = r.vec.find(c => c[0] === 'fs'), vlw = r.vec.find(c => c[0] === 'lw');
  if (!r.vec.some(c => c[0] === 'text' && c[1] === 'AXEL 28') || Math.abs(vfs[1] - 1.5 / 0.3528) > 0.01 || Math.abs(vlw[1] - 0.2) > 1e-6) fail('Vektor-PDF:en ska få samma text och linjetjocklek: ' + JSON.stringify(r.vec));
  console.log('OK: små DXF-texter syns i utskriften (minsta höjd valbar, kan döljas), linjetjockleken följer valet – även i vektor-PDF:en');

  // Valen finns på ritningen i utskriftslayouten och ritar om förhandsvisningen.
  const ui = await page.evaluate(async () => {
    await openPrint();
    const map = pr.tpl.elements.find(e => e.type === 'map'); setSel([map.id]); renderPrintProps(); await new Promise(r => setTimeout(r, 30));
    const lw = document.querySelector('#prProps [data-f="cadLw"]'), tx = document.querySelector('#prProps [data-f="cadTextMin"]');
    const before = { lw: lw && lw.value, tx: tx && tx.value };
    lw.value = '2.5'; lw.dispatchEvent(new Event('change', { bubbles: true })); lw.dispatchEvent(new Event('input', { bubbles: true }));
    tx.value = '2'; tx.dispatchEvent(new Event('change', { bubbles: true })); tx.dispatchEvent(new Event('input', { bubbles: true }));
    return { before, lw: map.cadLw, tx: map.cadTextMin };
  });
  if (ui.before.lw !== '1' || ui.before.tx !== '1' || ui.lw !== 2.5 || ui.tx !== 2) fail('Valen ska finnas på ritningen och sparas: ' + JSON.stringify(ui));
  console.log('OK: DXF-linjer och DXF-texter ställs per ritning i utskriftslayouten');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('ALLA TESTER OK');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
