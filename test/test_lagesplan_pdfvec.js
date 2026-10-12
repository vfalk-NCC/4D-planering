// Etiketter och prickar som vektorer i utskriftens PDF (Victor 2026-10-12: bättre skärpa utan större fil).
// Inspelaren (pdfVecRecorder) ska rita samma sak som canvasen, och PDF:en ska få vektorer och riktig text.
// Riktig jsPDF används om den finns (JSPDF=<sökväg till jspdf.umd.min.js>), annars en inspelande låtsas-jsPDF.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9017;
const JSPDF = [process.env.JSPDF, path.join(process.env.PLACE_TMP || '/nonexistent', 'lib/jspdf-2.5.1/package/dist/jspdf.umd.min.js')].find(p => p && fs.existsSync(p));
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  try {
    const page = await (await browser.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
    await require('./_dialogs').bridge(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: 'window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(new Error("x")) }) };' }));
    await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(800);

    // 1) Samma bild: direkt i canvas mot inspelning som spelas upp (etikett, pille, prick, rundad ruta, streckad ram).
    const same = await page.evaluate(() => {
      const draw = c => {
        c.setTransform(2, 0, 0, 2, 10, 5);
        drawBadge(c, [60, 30], 'K22', '#22c55e', 14, false, null);
        drawBadge(c, [60, 80], 'Betongvägg', '#facc15', 12, false, { label: 'text', labelSize: 1 });
        c.beginPath(); c.arc(150, 30, 7, 0, Math.PI * 2); c.fillStyle = '#22c55e'; c.fill(); c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.93)'; c.strokeStyle = '#16a34a'; c.lineWidth = 1.4; c.setLineDash([4, 2]);
        c.beginPath(); c.roundRect(170, 60, 70, 22, 7); c.fill(); c.stroke(); c.setLineDash([]);
      };
      const mk = () => { const c = document.createElement('canvas'); c.width = 520; c.height = 200; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 520, 200); return c; };
      const a = mk(); draw(a.getContext('2d'));
      const rec = pdfVecRecorder(); draw(rec);
      const b = mk(); pdfVecReplay(b.getContext('2d'), rec);
      const da = a.getContext('2d').getImageData(0, 0, 520, 200).data, db = b.getContext('2d').getImageData(0, 0, 520, 200).data;
      let diff = 0, ink = 0;
      for (let i = 0; i < da.length; i += 4) { const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]); if (d > 120) diff++; if (da[i] + da[i + 1] + da[i + 2] < 600) ink++; }
      return { items: rec.items.length, texts: rec.items.filter(x => x.t === 'T').map(x => x.s), ratio: diff / Math.max(1, ink) };
    });
    if (same.items < 6 || !same.texts.includes('K22') || !same.texts.includes('Betongvägg') || same.ratio > 0.08) fail('Inspelaren ritar inte som canvasen: ' + JSON.stringify(same));
    console.log(`OK: inspelaren ritar som canvasen (${same.items} delar, ${(same.ratio * 100).toFixed(1)} % avvikande pixlar)`);

    // 2) PDF:en: riktig jsPDF om den finns – vektorer + text, och mindre än samma etiketter som bild.
    if (JSPDF) {
      await page.addScriptTag({ content: fs.readFileSync(JSPDF, 'utf8') });
      const pdf = await page.evaluate(() => {
        const { jsPDF } = window.jspdf;
        const W = 200, H = 120, px = Math.round(W / 25.4 * 200), py = Math.round(H / 25.4 * 200), k = px / 400;
        const draw = c => { for (let i = 0; i < 40; i++) { const x = 30 + (i % 8) * 45, y = 30 + Math.floor(i / 8) * 45; c.save(); c.setTransform(k, 0, 0, k, 0, 0); c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fillStyle = '#22c55e'; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.stroke(); drawBadge(c, [x + 18, y], 'K' + (20 + i), '#22c55e', 11, true, null); c.restore(); } };
        const raster = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [W, H], compress: true });
        const cv = document.createElement('canvas'); cv.width = px; cv.height = py; draw(cv.getContext('2d'));
        raster.addImage(cv.toDataURL('image/png'), 'PNG', 0, 0, W, H, undefined, 'FAST');
        const vec = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [W, H], compress: true });
        const rec = pdfVecRecorder(); draw(rec);
        pdfVecEmit(vec, rec, [W / px, 0, 0, H / py, 0, 0], [0, 0, W, H]);
        const plain = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [W, H], compress: false });
        pdfVecEmit(plain, rec, [W / px, 0, 0, H / py, 0, 0], [0, 0, W, H]);
        const txt = new TextDecoder('latin1').decode(plain.output('arraybuffer'));
        return { raster: raster.output('arraybuffer').byteLength, vec: vec.output('arraybuffer').byteLength, text: /\(K22\) Tj/.test(txt) && /\(K59\) Tj/.test(txt), fills: (txt.match(/\bf\n/g) || []).length };
      });
      if (!pdf.text || pdf.fills < 40 || pdf.vec >= pdf.raster) fail('PDF med vektorer: ' + JSON.stringify(pdf));
      console.log(`OK: PDF – etiketterna som riktig text och vektorer, ${Math.round(pdf.vec / 1024)} kB mot ${Math.round(pdf.raster / 1024)} kB som bild`);
    } else console.log('(hoppar över riktig jsPDF – sätt JSPDF=<jspdf.umd.min.js>)');

    // 3) Utskriftens export: prickar/etiketter går till inspelaren och skrivs ovanpå bilden; fel -> bild som förut.
    const exp = await page.evaluate(() => {
      const ops = [];
      const mock = { lines: () => ops.push('L'), fill: () => ops.push('F'), stroke: () => ops.push('S'), text: s => ops.push('T:' + s), getTextWidth: s => s.length * 1.5, rect: () => {}, clip: () => {}, discardPath: () => {},
        saveGraphicsState: () => {}, restoreGraphicsState: () => {}, setFillColor: () => {}, setDrawColor: () => {}, setTextColor: () => {}, setLineWidth: () => {}, setLineCap: () => {}, setLineJoin: () => {}, setLineDashPattern: () => {}, setFont: () => {}, setFontSize: () => {} };
      const rec = pdfVecRecorder(); drawBadge(rec, [50, 50], 'J24', '#facc15', 12, false, null);
      drawBadge(rec, [50, 80], 'Kran 🏗', '#facc15', 12, false, null);
      const sk = pdfVecEmit(mock, rec, [0.1, 0, 0, 0.1, 5, 5], [0, 0, 100, 100]);
      const film = renderFilmOverlay.toString();
      return { emoji: sk.length === 1 && sk[0].s === 'Kran 🏗' && !ops.includes('T:Kran 🏗'), text: ops.includes('T:J24'), shape: ops.includes('F') && ops.includes('S') && ops.includes('L'), wired: /o\.vec \|\| ctx/.test(film) && /pdfVecEmit\(doc, rec/.test(exportPrintPdf.toString()) };
    });
    if (Object.values(exp).some(v => v !== true)) fail('Exporten: ' + JSON.stringify(exp));
    console.log('OK: utskriftens PDF – prickar och etiketter skrivs som vektorer ovanpå bilden (reserv: bild)');
    // 4) WBS-zonerna (yta, prickmönster, streckad kant) som vektorer: samma bild, prickarna som korta streck, klippta mot zonen.
    const zl = await page.evaluate(() => {
      viewport = { transform: [1, 0, 0, 1, 0, 0], width: 1000, height: 800, convertToPdfPoint: (x, y) => [x, y], convertToViewportPoint: (x, y) => [x, y] };
      plan = { id: 'pl', name: 'P', zones: [
        { id: 'z1', code: '742', name: 'Sikthall', polys: [[[10, 10], [300, 10], [300, 180], [10, 180]]], style: { fill: 'custom', fillColor: '#facc15', dash: 'dashed', pattern: 'dots' } },
        { id: 'z2', code: '744', name: 'Fläkthus', polys: [[[320, 10], [520, 10], [420, 180]]], style: { fill: 'custom', fillColor: '#ef4444', dash: 'solid', pattern: 'hatch' } }], photos: [] };
      const mk = () => { const c = document.createElement('canvas'); c.width = 560; c.height = 200; return c; };
      const a = mk(); drawZoneShapes(a.getContext('2d'), 16, null, false);
      const rec = pdfVecRecorder(); drawZoneShapes(rec, 16, null, false);
      const b = mk(); pdfVecReplay(b.getContext('2d'), rec);
      const da = a.getContext('2d').getImageData(0, 0, 560, 200).data, db = b.getContext('2d').getImageData(0, 0, 560, 200).data;
      let diff = 0, ink = 0;
      for (let i = 0; i < da.length; i += 4) { if (Math.abs(da[i + 3] - db[i + 3]) > 90 || (da[i + 3] > 60 && Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 150)) diff++; if (da[i + 3] > 60) ink++; }
      const dots = rec.items.filter(x => x.t === 'F').reduce((n, x) => n + x.subs.filter(sp => sp.circle).length, 0);
      const clipped = rec.items.some(x => x.clip && x.t === 'S') && rec.items.some(x => x.clip && x.t === 'F');
      const st = rec.items.filter(x => x.t === 'S' && !x.clip);
      return { same: diff / Math.max(1, ink) < 0.06, ratio: +(diff / Math.max(1, ink)).toFixed(3), dots: dots > 100, clipped, dashed: st.some(x => x.dash.length === 2) };
    });
    if (!zl.same || !zl.dots || !zl.clipped || !zl.dashed) fail('Zonerna som vektorer: ' + JSON.stringify(zl));
    console.log(`OK: WBS-zonerna som vektorer – yta, prickar, snedstreck (klippta mot zonen) och streckad kant (${(zl.ratio * 100).toFixed(1)} % avvikande pixlar)`);
    if (JSPDF) {
      const sz = await page.evaluate(() => {
        const { jsPDF } = window.jspdf; const W = 280, H = 100, px = Math.round(W / 25.4 * 200), py = Math.round(H / 25.4 * 200), k = px / 560;
        const draw = c => { c.save(); c.setTransform(k, 0, 0, k, 0, 0); drawZoneShapes(c, 16, null, false); c.restore(); };
        const r = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [W, H], compress: true }); const cv = document.createElement('canvas'); cv.width = px; cv.height = py; draw(cv.getContext('2d'));
        r.addImage(cv.toDataURL('image/png'), 'PNG', 0, 0, W, H, undefined, 'FAST');
        const v = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [W, H], compress: true }); const rec = pdfVecRecorder(); draw(rec); pdfVecEmit(v, rec, [W / px, 0, 0, H / py, 0, 0], [0, 0, W, H]);
        window.__zonePdf = new Uint8Array(v.output('arraybuffer'));
        return { raster: r.output('arraybuffer').byteLength, vec: window.__zonePdf.byteLength };
      });
      if (sz.vec > sz.raster * 1.5) fail('Zonerna som vektorer blir för stora: ' + JSON.stringify(sz));
      console.log(`OK: zonerna som vektorer ${Math.round(sz.vec / 1024)} kB mot ${Math.round(sz.raster / 1024)} kB som bild`);
    }
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('ALLA TESTER OK');
  } catch (e) { console.log('FEL: ' + e.message); process.exitCode = 1; }
  await browser.close(); server.close();
})();
