// Sektion i utskriftslayouten: IFC-snitt + bubblor. (Mall: ifc2d-testet.)
// Fristående HTML-export (Victor 2026-10-11, efter BubbleBIM): lägesplanen och 3D i EN fil som kan skickas till
// någon utan Trimble Connect och öppnas offline. Testet exporterar, öppnar filen i en ny sida utan nät och
// kontrollerar 2D-bilden, 3D-scenen (objekten och marken) och att inga fel uppstår.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9014;
const OUT = process.env.PLACE_TMP || path.join(__dirname, '..', '.tmp');
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); c.fillStyle = '#2563eb'; c.fillRect(v.width * 0.2, v.height * 0.3, v.width * 0.3, v.height * 0.3); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
const PAKO = `window.pako = { gzip: s => new TextEncoder().encode(String(s)), ungzip: (u, o) => new TextDecoder().decode(u) };`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, decodeURIComponent(q.url.split('?')[0])), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  try {
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 850 }, acceptDownloads: true });
    const page = await ctx.newPage();
    await require('./_dialogs').bridge(page);
    const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
    await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); window.__hxKeep = true; });
    await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: /pako/.test(r.request().url()) ? PAKO : PDFJS }));
    const gh = new Map([['projects/p1/plan_placements.json', JSON.stringify([
      { id: 'k1', type: 'tornkran', name: 'Kran 1', x: 6512320, y: 150110, z: 0, L: 1.6, B: 1.6, H: 40, R: 50, rot: 0, dz: 0, color: '#facc15' },
      { id: 'b1', type: 'bod', name: 'Bod A', x: 6512340, y: 150105, z: 0, L: 8.4, B: 3, H: 2.7, rot: 0, dz: 0, color: '#f59e0b' }])]]);
    await page.route('https://api.github.com/**', r => {
      const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
      if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
      const body = JSON.parse(req.postData() || '{}'); gh.set(f, Buffer.from(body.content || '', 'base64').toString());
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
    });
    await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
    await page.evaluate(async () => {
      plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
      pdfCache.set('A', new Uint8Array([1]).buffer);
      items = []; positions = [];
      renderPlanSelect(); await openPlan('A');
    });
    await page.waitForTimeout(500);
    if (await page.evaluate(() => placements.length) !== 2) await page.evaluate(pl => { placements = pl; }, JSON.parse(gh.get('projects/p1/plan_placements.json')));

    // En låda 4 × 2 × 2 m (Vägg A, kopplad till aktiviteten a1 med 40 % framdrift) skärs längs en linje genom lådan.
    await page.evaluate(async () => {
      items = [{ id: 'a1', object_name: 'Stomme plan 1', start_date: '2026-10-01', end_date: '2026-10-31', progress: 40, status: 'pagaende', source_key: 'S1' }];
      await open3d();
      l3.O = [6512350, 150100, 0];
      const geo = new THREE.BoxGeometry(4, 2, 2); const n = geo.getAttribute('position').count; geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
      mesh.userData.l3b = { ranges: [{ start: 0, count: n, name: 'Vägg A', itemId: 'a1' }], origIdx: Uint16Array.from(geo.index.array), hidden: new Set() };
      l3b.models = [{ id: 'm1', name: 'Hus', visible: true, meshes: [mesh], ranges: [], tris: 12 }];
      l3.scene.add(mesh);
      $('dateInput').value = '2026-10-15';
      viewport = { transform: [1, 0, 0, 1, 0, 0], width: 1000, height: 800, convertToPdfPoint: (x, y) => [x, y], convertToViewportPoint: (x, y) => [x, y] };
      await openPrint();
      pr.tpl.elements = []; addEl('section');
    });
    const el0 = await page.evaluate(() => { const e = pr.tpl.elements.find(x => x.type === 'section'); return { has: !!e, panel: !!document.querySelector('#secUpdate'), btn: !!document.querySelector('#prAdd [data-add="section"]') }; });
    if (!el0.has || !el0.panel || !el0.btn) fail('Sektionselement, panel eller knapp saknas: ' + JSON.stringify(el0));
    // Utan linje: platshållare, inget fel.
    await page.evaluate(() => { drawPrintPage(); });
    // Linje längs x genom lådans mitt (lådan går x -2..2 runt origo 6512350,150100).
    const r1 = await page.evaluate(async () => {
      const e = pr.tpl.elements.find(x => x.type === 'section');
      e.p1 = [6512346, 150100]; e.p2 = [6512354, 150100]; e.depth = 3;
      const ok = await secBuild(e, { open: false });
      const d = secData.get(e.id);
      const lines = d ? [...d.groups.values()].reduce((a, g) => a + g.length, 0) : 0;
      const pts = d ? [...d.groups.values()].flat().flatMap(l => l) : [];
      return { ok, L: d && d.L, lines, keys: d && [...d.groups.keys()], anchors: d && d.anchors.map(a => ({ key: a.key, u: Math.round(a.u * 10) / 10, z: Math.round(a.z * 10) / 10 })), zlo: d && d.zlo, zhi: d && d.zhi, umax: pts.length ? Math.max(...pts.filter((_, i) => i % 2 === 0)) / 1000 : 0 };
    });
    if (!r1.ok || Math.abs(r1.L - 8) > 0.01 || r1.lines < 1 || !r1.keys.includes('s:S1')) fail('Snittet ska ge linjer i gruppen s:S1: ' + JSON.stringify(r1));
    if (Math.abs(r1.zhi - r1.zlo - 2) > 0.01 || r1.umax < 5.9 || r1.umax > 6.1) fail('Snittet ska vara 2 m högt och sluta vid u=6: ' + JSON.stringify(r1));
    if (r1.anchors.length !== 1 || r1.anchors[0].key !== 's:S1' || Math.abs(r1.anchors[0].u - 4) > 0.3) fail('Bubblan ska sitta vid lådans mitt (u≈4): ' + JSON.stringify(r1.anchors));
    // Ritas på bladet: statusfärgad linje och ett kort (pågående), inget fel.
    const draw = await page.evaluate(() => {
      const e = pr.tpl.elements.find(x => x.type === 'section'); e.x = 0; e.y = 0; e.w = 200; e.h = 100;
      const c = document.createElement('canvas'); c.width = 2000; c.height = 1000; const g = c.getContext('2d');
      const ops = []; ['fillText', 'stroke', 'fillRect'].forEach(f => { const o = g[f].bind(g); g[f] = (...a) => { ops.push(f + (f === 'fillText' ? ':' + a[0] : '')); return o(...a); }; });
      drawElement(g, e, pr.tpl, 10, 1);
      const cards = secBubbles(e, secData.get(e.id));
      e.bub = { ...secBub(e), mode: 'all', on: false }; const off = secBubbles(e, secData.get(e.id)).length;
      e.bub.on = true; e.bub.mode = 'sel'; const sel = secBubbles(e, secData.get(e.id)).length; e.bub.mode = 'active';
      return { texts: ops.filter(o => o.startsWith('fillText')), cards: cards.length, off, sel, strokes: ops.filter(o => o === 'stroke').length, prog: secProg(secData.get(e.id).anchors[0].row, 'plan', '2026-10-15'), prog2: secProg(secData.get(e.id).anchors[0].row, 'entered', '2026-10-15') };
    });
    if (draw.cards !== 1 || draw.off !== 0 || draw.sel !== 0) fail('Bubblor: pågående=1, av=0, markerade=0: ' + JSON.stringify(draw));
    if (!draw.texts.some(t => /Stomme plan 1/.test(t)) || !draw.texts.some(t => /40 %/.test(t)) || !draw.texts.some(t => /Skala 1:/.test(t))) fail('Kortet ska ha namn, 40 % och skala: ' + JSON.stringify(draw.texts));
    if (draw.prog !== 47 || draw.prog2 !== 40) fail('Framdrift uträknad 47 / inskriven 40: ' + JSON.stringify(draw));
    // Välj i ritning: två klick på en karta sätter linjen (sidans mm -> modell).
    const pick = await page.evaluate(() => {
      const e = pr.tpl.elements.find(x => x.type === 'section'); const m = newMapEl(0, 110, 100, 80, pr.tpl.format); m.id = 'mp'; pr.tpl.elements.push(m);
      secPick.el = e; secPick.pts = []; e.p1 = e.p2 = null;
      secPickClick(10, 120); const mid = !!secPick.el; secPickClick(60, 120);
      return { mid, done: !secPick.el, p1: e.p1, p2: e.p2 };
    });
    if (!pick.mid || !pick.done || !pick.p1 || !pick.p2 || Math.abs(pick.p2[0] - pick.p1[0]) < 0.1) fail('Välj i ritning ska ge en linje: ' + JSON.stringify(pick));
    // Egen sektionsritning: bild + två passpunkter -> placeras i sektionens koordinater, bubblorna ligger kvar.
    const cal = await page.evaluate(async () => {
      const e = pr.tpl.elements.find(x => x.type === 'section'); e.x = 0; e.y = 0; e.w = 200; e.h = 100; e.src = 'pdf'; e.img = { path: 'x.png', ar: 2 };
      const cv = document.createElement('canvas'); cv.width = 200; cv.height = 100; const cg = cv.getContext('2d'); cg.fillStyle = '#ccc'; cg.fillRect(0, 0, 200, 100);
      const im = new Image(); await new Promise(r => { im.onload = r; im.src = cv.toDataURL(); }); printImgs.set('x.png', im);
      renderPrintProps(); const panel = !!document.querySelector('[data-calpick="a"]');
      const before = secCal(e);
      e.cal = { a: { fx: 0.1, fy: 0.9, u: 0, z: 0 }, b: { fx: 0.9, fy: 0.1, u: 8, z: 4 } };
      const r = secImgRect(secCal(e));
      const c = document.createElement('canvas'); c.width = 2000; c.height = 1000; const g = c.getContext('2d'); let imgs = 0; const di = g.drawImage.bind(g); g.drawImage = (...a) => { imgs++; return di(...a); };
      let err = ''; try { drawPrSection(g, e, 0, 0, 2000, 1000, v => v * 3, 10); } catch (x) { err = x.message; }
      return { panel, before, r, imgs, err, d: !!secData.get(e.id) };
    });
    if (!cal.panel || cal.before !== null || Math.abs(cal.r.u1 - cal.r.u0 - 10) > 0.01 || Math.abs(cal.r.z1 - cal.r.z0 - 5) > 0.01 || cal.imgs !== 1) fail('Egen sektionsritning: ' + JSON.stringify(cal));
    // PDF som källa: sidan görs om till en PNG (pdf.js är stubbad i testet -> bara kontroll att funktionen finns och att PDF avvisas för andra element).
    if (await page.evaluate(() => typeof pdfToImageFile !== 'function' || !document.getElementById('prImgInput').accept.includes('pdf'))) fail('PDF ska kunna väljas som sektionsritning');
    // PDF: elementet ska ritas som vektorer, inte som en bild.
    const pdf = await page.evaluate(async () => {
      const e = pr.tpl.elements.find(x => x.type === 'section'); e.src = 'ifc'; e.p1 = [6512346, 150100]; e.p2 = [6512354, 150100]; secData.delete(e.id); await secBuild(e, { open: false });
      pr.tpl.elements = [e]; pr.tpl.frame = { on: false };
      const calls = [];
      window.jspdf = { jsPDF: function () { return new Proxy({}, { get: (t, k) => k === 'splitTextToSize' ? (s => [String(s)]) : k === 'output' ? (() => new ArrayBuffer(8)) : k === 'getTextWidth' ? (s => String(s).length) : ((...a) => { calls.push(k + ' ' + JSON.stringify(a).slice(0, 80)); }) }); } };
      await exportPrintPdf();
      return { text: calls.some(c => /^text .*Stomme plan 1/.test(c)), images: calls.filter(c => /^addImage/.test(c)).length, n: calls.length };
    });
    if (!pdf.text || pdf.images > 0) fail('PDF: sektionen ska vara vektorer med text: ' + JSON.stringify(pdf));
    if (errors.length) fail('Sidfel: ' + errors.join(' | '));
    console.log('ALLA TESTER OK');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
