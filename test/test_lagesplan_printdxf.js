// Utskriftslayouten som DXF (Victor 2026-10-08): A = hela bladet i mm, B = ritningens innehåll i
// modellens koordinater (val per ritning). Och laddningsindikatorn 0–100 % när en ritning ritas i
// layouten.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8996;
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
    // 1 pdf-enhet = 0,1 m (1000 pdf = 100 m).
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[O[0], O[1], 0], [O[0] + 100, O[1], 0]], pdf: [[0, 0], [1000, 0]] },
      zones: [{ id: 'z1', code: '7411', name: 'Inne', polys: a, rule: { field: 'auto' } }, { id: 'z2', code: '7499', name: 'Utanför', polys: b, rule: { field: 'auto' } }] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    await ghWriteJSON(token, dataPath('status_plans.json'), () => JSON.parse(JSON.stringify(plans)), 'test');
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    ls('pdf').visible = false; ls('zones').visible = true; saveLayerState();
    // --- Inspelaren ---
    const rec = dxfRecorder();
    rec.strokeStyle = '#ff0000'; rec.strokeRect(10, 10, 20, 5);
    rec.fillStyle = '#0000ff'; rec.fillRect(0, 0, 4, 4);
    rec.beginPath(); rec.arc(50, 50, 1, 0, Math.PI * 2); rec.fill();
    rec.beginPath(); rec.arc(60, 60, 10, 0, Math.PI * 2); rec.stroke();
    rec.font = '10px Helvetica'; rec.textAlign = 'center'; rec.textBaseline = 'top'; rec.fillText('Hej', 5, 6);
    rec.fillStyle = '#ffffff'; rec.fillRect(0, 0, 100, 100); // vit bakgrund: hoppas över
    const E = rec.finish();
    out.recorder = JSON.stringify(E.map(e => e.t)) === JSON.stringify(['PL', 'SOLID', 'DOT', 'CIRCLE', 'TEXT']) && E[4].ha === 1 && E[4].va === 3 && Math.abs(E[4].h - 7.2) < 0.01;
    // Klippning och förenkling.
    const cl = dxfClipToRect([{ t: 'PL', pts: [[-10, 5], [5, 5], [20, 5]] }, { t: 'TEXT', x: 50, y: 50 }], [0, 0, 10, 10]);
    out.clip = cl.length === 1 && cl[0].pts[0][0] === 0 && cl[0].pts[cl[0].pts.length - 1][0] === 10;
    out.simplify = dxfSimplify([[0, 0], [1, 0.001], [2, 0], [3, 5]], 0.03).length === 3;
    // --- Hela bladet ---
    await openPrint();
    const map = pr.tpl.elements.find(e => e.type === 'map');
    Object.assign(map, { center: [O[0] + 15, O[1] + 15], scale: 500, w: 100, h: 60, x: 20, y: 20 }); // 100 mm à 1:500 = 50 m
    map.layers = { follow: true };
    const files = await buildPrintDxf(pr.tpl, () => {}, 'sheet');
    const mfiles = await buildPrintDxf(pr.tpl, () => {}, 'model4d');
    const afiles = await buildPrintDxf(pr.tpl, () => {}, 'modelAll');
    out.nFiles = files.length + mfiles.length + afiles.length;
    const sheet = files[0].text, model = mfiles[0] ? mfiles[0].text : '';
    out.names = /koordinatriktig\)\.dxf$/.test(mfiles[0].name) && /med DXF-underlag\)\.dxf$/.test(afiles[0].name) && /\$INSUNITS\r\n70\r\n6\r\n/.test(afiles[0].text);
    out.menu = !!document.querySelector('#prDxfMenu');
    out.mm = /\$INSUNITS\r\n70\r\n4\r\n/.test(sheet) && /\$INSUNITS\r\n70\r\n6\r\n/.test(model);
    const d = parseDxf(sheet), geo = dxfToGeometry(d);
    out.layers = ['RAM', 'RITNINGSRAM', 'ZONER', 'FORKLARING', 'SKALSTOCK', 'NORRPIL'].every(l => l in d.layers);
    // Zonen inuti ramen (x 20–120 mm, y på papperet 20–80 mm => i DXF:en y = 297-80 .. 297-20).
    const zone = geo.filter(g => g.layer === 'ZONER' && g.pts);
    const xs = zone.flatMap(g => g.pts.filter((_, i) => i % 2 === 0)), ys = zone.flatMap(g => g.pts.filter((_, i) => i % 2 === 1));
    out.zoneInFrame = zone.length > 0 && Math.min(...xs) >= 19.99 && Math.max(...xs) <= 120.01 && Math.min(...ys) >= 297 - 80.01 && Math.max(...ys) <= 297 - 19.99;
    out.texts = geo.some(g => g.text === '7411') && !geo.some(g => g.text === '7499'); // zonen utanför ramen följer inte med
    // B: samma zon i modellens koordinater (meter): zon z1 = pdf 100–200 => modell O + 10..20 m.
    const gm = dxfToGeometry(parseDxf(model)).filter(g => g.layer === 'ZONER' && g.pts);
    const mx = gm.flatMap(g => g.pts.filter((_, i) => i % 2 === 0)), my = gm.flatMap(g => g.pts.filter((_, i) => i % 2 === 1));
    out.model = gm.length > 0 && Math.abs(Math.min(...mx) - (O[0] + 10)) < 0.05 && Math.abs(Math.max(...mx) - (O[0] + 20)) < 0.05 && Math.abs(Math.min(...my) - (O[1] + 10)) < 0.05 && Math.abs(Math.max(...my) - (O[1] + 20)) < 0.05;
    // --- Laddningsindikatorn ---
    mapPreviews.clear(); mapPending.clear();
    const seen = [];
    const orig = mapProgressSet; mapProgressSet = (id, f, label) => { if (f != null) seen.push(Math.round(f * 100)); return orig(id, f, label); };
    drawPrintPage(); await new Promise(res => setTimeout(res, 1500));
    mapProgressSet = orig;
    out.progress = seen.length > 0 && seen.every((v, i) => !i || v >= seen[i - 1]) && !mapProgress.size;
    out.button = !!document.getElementById('prExportDxf');
    // Menyn hamnar framför allt och inom fönstret (sidopanelen klipper den inte).
    const btn = document.getElementById('prExportDxf'), mn = document.getElementById('prDxfMenu');
    btn.click();
    const mr = mn.getBoundingClientRect(), first = mn.querySelector('button').getBoundingClientRect();
    const hit = document.elementFromPoint(first.left + 5, first.top + first.height / 2);
    out.menuVisible = !mn.classList.contains('hidden') && mr.left >= 0 && mr.right <= innerWidth + 0.5 && mr.top >= 0 && getComputedStyle(mn).position === 'fixed' && !!hit && mn.contains(hit);
    document.body.click(); out.menuCloses = mn.classList.contains('hidden');
    // Sidopanelen kan dras bredare/smalare och minns bredden.
    const side = document.querySelector('#printModal .pr-side'), rz = document.getElementById('prResize');
    const w0 = side.getBoundingClientRect().width;
    const pe = (t, x) => rz.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: 300, pointerId: 1, bubbles: true }));
    rz.setPointerCapture = () => {};
    pe('pointerdown', innerWidth - w0); pe('pointermove', innerWidth - 500); pe('pointerup', innerWidth - 500);
    const w1 = side.getBoundingClientRect().width;
    pe('pointerdown', innerWidth - 500); pe('pointerup', innerWidth - 50);
    const w2 = side.getBoundingClientRect().width;
    rz.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const w3 = side.getBoundingClientRect().width;
    out.resize = Math.abs(w1 - 500) < 2 && Math.abs(w2 - 260) < 2 && Math.abs(w3 - 340) < 2 && localStorage.getItem('lp.prSideW') === '340';
    pr.dirty = false; closePrint();
    return out;
  }, { a: sq(100, 100, 200, 200), b: sq(800, 300, 900, 400) });
  const bad = Object.entries(r).filter(([k, v]) => k !== 'nFiles' && v !== true);
  if (bad.length || r.nFiles !== 3) fail('Fel: ' + JSON.stringify(r));
  console.log('OK: DXF – inspelaren (linjer, ytor, prickar, cirklar, text), klippning, förenkling, bladet i mm med lager, zonerna inom ramen, B i modellens koordinater, laddningsindikatorn');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('ALLA TESTER OK');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
