// Optimeringar i Lägesplan (Victor 2026-10-07: "rejäl genomgång … effektivisera … optimera"):
// zonlagret i skärmens upplösning utzoomat, zonmönster bara inom zonen, zonraderna uppdateras på plats,
// borttagna lager rensas ur sparade lägen och DXF:er hämtas flera åt gången.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8993;
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
  let answer = ''; const dlgs = []; page.on('dialog', d => { dlgs.push(d.message()); d.type() === 'prompt' ? d.accept(answer) : d.accept(); });
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  // Lagringen: status_plans.json i minnet.
  const store = new Map(); let n = 0;
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    if (req.method() === 'PUT') { const b = JSON.parse(req.postData() || '{}'); const sha = 's' + (++n); store.set(f, { content: Buffer.from(b.content, 'base64').toString('utf8'), sha }); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) }); }
    r.fulfill({ status: 404, body: '{}' });
  });
  const saved = () => JSON.parse([...store.entries()].find(([k]) => k.endsWith('status_plans.json'))[1].content)[0];
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  const sq = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
  const r = await page.evaluate(async ({ a, b }) => {
    const O = [6512300, 150100], out = {};
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[O[0], O[1], 0], [O[0] + 100, O[1], 0]], pdf: [[0, 0], [1000, 0]] },
      zones: [{ id: 'z1', code: '7411', name: 'A', polys: a, rule: { field: 'auto' }, style: { pattern: 'hatch' } }, { id: 'z2', code: '7412', name: 'B', polys: b, rule: { field: 'auto' } }] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    await ghWriteJSON(token, dataPath('status_plans.json'), () => JSON.parse(JSON.stringify(plans)), 'test');
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    // 1) Utzoomat: zonlagret i skärmens upplösning (inte ritningens), bildexporten i full upplösning.
    view.scale = 0.3; applyView(); renderZones();
    const pc = $('pdfCanvas'), zc = $('zoneCanvas');
    out.small = zc.width < pc.width * 0.5 && Math.abs(zc.width / pc.width - ovStep(0.3 * (window.devicePixelRatio || 1))) < 0.05;
    ovFull = true; renderZones(); out.fullForExport = zc.width === pc.width; ovFull = false; renderZones();
    // Textstorleken följer ritningen, inte zonlagret (samma vid zoom).
    const f1 = planFontPx(); view.scale = 0.6; applyView(); renderZones(); out.sameFont = planFontPx() === f1;
    // 2) Mönstret ritas bara inom zonens ruta.
    let lines = 0; const ctx = { canvas: { width: 4000, height: 4000 }, save() {}, restore() {}, clip() {}, beginPath() {}, moveTo() { lines++; }, lineTo() {}, stroke() {}, fill() {}, arc() {}, getTransform: () => new DOMMatrix([1, 0, 0, 1, 0, 0]), globalAlpha: 1 };
    zonePatternFill(ctx, 'hatch', '#000', 20); const all = lines; lines = 0;
    zonePatternFill(ctx, 'hatch', '#000', 20, [100, 100, 300, 300]); out.patternSmall = lines > 0 && lines < all / 10;
    // 3) Markera en zon: zonraderna uppdateras på plats, lagerpanelen byggs inte om.
    let full = 0; const orig = renderLayerPanel; renderLayerPanel = function () { full++; return orig.apply(this, arguments); };
    renderZoneList();
    full = 0; selectZone('z2'); renderZones();
    out.noFullRebuild = full === 0 && !!document.querySelector('.zone-layer-row.sel[data-zone="z2"]');
    plan.zones.push({ id: 'z3', code: '7413', name: 'C', polys: a, rule: { field: 'auto' } }); renderZones();
    out.newZoneRebuilds = full === 1;
    renderLayerPanel = orig;
    // 4) Borttagna DXF:er och ortofoton rensas ur sparade lagerlägen.
    siteItems.push({ id: 'c1', type: 'cad', name: 'Finns', path: 'x', layers: [{ name: 'L1', n: 1 }], stats: { lines: 1, texts: 0, kb: 1 } });
    const st = { 'cad:c1': { visible: true, opacity: 100 }, 'cadl:c1:L1': { visible: true, opacity: 100 }, 'cadl:c1:L2': { visible: false, opacity: 100 }, 'cad:gone': { visible: true, opacity: 100 }, 'cadl:gone:X': { visible: true, opacity: 100 }, 'cadopen:gone': true, 'ortho:gone': { visible: true, opacity: 100 }, zones: { visible: false, opacity: 50 } };
    const p1 = pruneLayerState(st), p2 = pruneLayerState(st, { dropDefaults: true });
    out.prune = JSON.stringify(Object.keys(p1).sort()) === JSON.stringify(['cad:c1', 'cadl:c1:L1', 'cadl:c1:L2', 'zones']) && JSON.stringify(Object.keys(p2).sort()) === JSON.stringify(['cad:c1', 'cadl:c1:L2', 'zones']);
    // 5) DXF:erna hämtas flera åt gången.
    siteItems = siteItems.filter(x => x.id !== 'c1'); await new Promise(res => setTimeout(res, 200)); // ingen DXF på skärmen samtidigt
    let active = 0, peak = 0; const origE = ensureCadGeom;
    ensureCadGeom = async rec => { active++; peak = Math.max(peak, active); await new Promise(res => setTimeout(res, 30)); active--; cadGeom.set(rec.id, { files: [] }); };
    await ensureCadGeoms(Array.from({ length: 12 }, (_, i) => ({ id: 'p' + i, name: 'D' + i })));
    out.peak = peak; out.parallel = peak === 6 && [...Array(12).keys()].every(i => cadGeom.has('p' + i));
    ensureCadGeom = origE;
    return out;
  }, { a: sq(100, 100, 200, 200), b: sq(300, 100, 400, 200) });
  const bad = Object.entries(r).filter(([k, v]) => k !== 'peak' && v !== true);
  if (bad.length) fail('Fel: ' + JSON.stringify(r));
  console.log('OK: zonlagret i skärmens upplösning utzoomat (full vid bildexport), samma textstorlek, mönster bara inom zonen, zonrader på plats, rensning av borttagna lager, DXF:er sex åt gången');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('ALLA TESTER OK');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
