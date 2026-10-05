// 3D-objekten som DXF (Victors önskemål 2026-10-05): prickarna och aktivitetsnamnen i modellens
// koordinater (meter), lager per status, fotavtryck och namn. Läses tillbaka med Lägesplans egen
// DXF-läsare; å/ä/ö i Windows-1252.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8980;
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
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  const r = await page.evaluate(async () => {
    const cal = { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] };
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: cal, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = [
      { id: 'i1', object_name: 'K10', activity: 'Pelare', start_date: '2026-09-01', end_date: '2026-12-01', status: 'pagaende', progress: 40 },
      { id: 'i2', group_id: 'G1', object_name: 'M30', activity: 'Gjutning väggar', start_date: '2020-01-01', end_date: '2020-02-01', status: 'klar', progress: 100, actual_end_date: '2020-02-01' },
      { id: 'i3', group_id: 'G1', object_name: 'M31', activity: 'Gjutning väggar', start_date: '2020-01-01', end_date: '2020-02-01', status: 'klar', progress: 100, actual_end_date: '2020-02-01' },
    ];
    positions = [
      { id: 'i1', x: 6512345.5, y: 150123.25, z0: 10, z1: 14, x0: 6512345, x1: 6512346, y0: 150123, y1: 150123.5 },
      { id: 'i2', x: 6512350, y: 150130, z0: 0, z1: 2, x0: 6512349, x1: 6512351, y0: 150129, y1: 150131 },
      { id: 'i3', x: 6512354, y: 150130, z0: 0, z1: 2 },
    ];
    // Kalibrera så att objekten ligger på ritningen.
    plans[0].calib = { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] };
    renderPlanSelect(); await openPlan('A');
    $('showObjects').checked = true; invalidateVisible(); invalidatePositions(); renderZones();
    let got = null; downloadBlob = (blob, name) => { got = { name, blob }; };
    exportObjectsDxf();
    if (!got) return { dbg: 'ingen nedladdning: ' + $('saveStatus').textContent };
    got.bytes = [...new Uint8Array(await got.blob.arrayBuffer())];
    const text = new TextDecoder('windows-1252').decode(new Uint8Array(got.bytes));
    const dxf = parseDxf(text), geo = dxfToGeometry(dxf);
    return { name: got.name, text, bytes: got.bytes, layers: Object.keys(dxf.layers).sort(), ents: dxf.entities.map(e => e.type + ':' + (e.g.find(p => p[0] === 8) || [])[1]), geo: geo.filter(x => x.text).map(x => [x.text, x.x, x.y]), units: dxf.header.insunits, cp: [...dxfCp1252('åäö–')], aci: Object.fromEntries(['klar', 'pagaende', 'forsenad', 'planerad', 'pausad'].map(p => [p, dxfAci(phaseColor(p))])) };
  });
  if (r.dbg) fail(JSON.stringify(r.dbg));
  require('fs').writeFileSync(require('path').join(process.env.DXF_OUT || require('os').tmpdir(), 'objekt-test.dxf'), Buffer.from(r.bytes));
  if (!/^3D-objekt Plan 1 .*\.dxf$/.test(r.name)) fail('Filnamn: ' + r.name);
  if (r.units !== 6) fail('Enheten ska vara meter ($INSUNITS 6): ' + r.units);
  if (JSON.stringify(r.layers) !== JSON.stringify(['4D-KLAR', '4D-NAMN', '4D-PAGAENDE'])) fail('Lager per status, fotavtryck och namn: ' + JSON.stringify(r.layers));
  const t = Object.fromEntries(r.geo.map(([s, x, y]) => [s, [x, y]]));
  if (!t['K10'] || Math.abs(t['K10'][0] - 6512346.15) > 0.001 || Math.abs(t['K10'][1] - 150122.75) > 0.001) fail('Namnet ska stå vid objektet i modellens koordinater (meter): ' + JSON.stringify(r.geo));
  if (!r.text.includes('\r\n10\r\n6512345.500\r\n20\r\n150123.250\r\n30\r\n0.000')) fail('Punkten ska ligga exakt i modellens koordinater med höjden: ' + r.text.slice(0, 2000));
  if (!r.geo.some(([s]) => s === 'M30 (2)')) fail('Två objekt i samma aktivitet blir en markering med antalet, å/ä/ö kvar: ' + JSON.stringify(r.geo));
  if (r.ents.some(e => /^POLYLINE:4D-(FOTAVTRYCK|NAMN)/.test(e)) || r.ents.filter(e => /^POLYLINE:4D-(KLAR|PAGAENDE)/.test(e)).length !== 2) fail('En fylld prick per markering, inga fotavtryck (raka lådor blir fel vridna): ' + JSON.stringify(r.ents));
  if (JSON.stringify(r.aci) !== JSON.stringify({ klar: 3, pagaende: 30, forsenad: 1, planerad: 8, pausad: 8 })) fail('Statusfärgerna som CAD-färger: ' + JSON.stringify(r.aci));
  if (JSON.stringify(r.cp) !== JSON.stringify([0xe5, 0xe4, 0xf6, 0x96])) fail('å/ä/ö ska kodas i Windows-1252: ' + r.cp);
  if (!/\$EXTMIN/.test(r.text) || !/\r\nSTYLE\r\n2\r\nSTANDARD/.test(r.text) || !/\r\n2\r\n\*ACTIVE/.test(r.text)) fail('Utbredning, textstil och vy ska finnas så att filen öppnas på objekten med synliga namn');
  // Texterna läses vågrätt i den vy man har: vriden ritning (kalibrering) och vriden vy.
  const rot = await page.evaluate(async () => {
    plans[0].calib = { model: [[6512300, 150100, 0], [6512370, 150170, 0]], pdf: [[0, 0], [1000, 0]] }; // modellen 45° mot ritningen
    await openPlan('A'); view.rot = 0.6; applyView(); invalidatePositions(); renderZones();
    let got = null; downloadBlob = (blob, name) => { got = blob; };
    exportObjectsDxf();
    const text = new TextDecoder('windows-1252').decode(new Uint8Array(await got.arrayBuffer()));
    const m = /\r\nTEXT\r\n[\s\S]*?\r\n50\r\n([-\d.]+)/.exec(text);
    const deg = m ? Number(m[1]) : 0, rr = deg * Math.PI / 180;
    // Läsriktningen i modellen -> skärmen.
    const scr = mp => { const s = toPx(modelToPdf(mp[0], mp[1])); return rotAbout([s[0] * view.scale + view.tx, s[1] * view.scale + view.ty], view.rot); };
    const a = scr([6512345, 150123]), b = scr([6512345 + Math.cos(rr) * 10, 150123 + Math.sin(rr) * 10]);
    const up = scr([6512345 - Math.sin(rr) * 10, 150123 + Math.cos(rr) * 10]);
    return { deg, dx: b[0] - a[0], dy: b[1] - a[1], upY: up[1] - a[1] };
  });
  if (!(rot.dx > 0 && Math.abs(rot.dy) < Math.abs(rot.dx) * 0.01 && rot.upY < 0)) fail('Namnen ska läsas vågrätt från vänster till höger, rätt väg upp, i vyn: ' + JSON.stringify(rot));
  // Varje export: en lokal kopia och (om rutan är ikryssad) en till Trimble Connect via 4D-planering.
  const tc = await page.evaluate(async () => {
    const calls = [], downloads = [];
    downloadBlob = (blob, name) => downloads.push(name);
    askOpener = async (type, extra) => { calls.push([type, extra.folder, extra.files.map(f => f.name + ':' + f.size).join()]); return { folder: extra.folder }; };
    const run = async (opener, checked) => {
      Object.defineProperty(window, 'opener', { value: opener, configurable: true, writable: true });
      $('cadExportToTc').checked = checked;
      await exportObjectsDxf();
      return $('saveStatus').textContent;
    };
    const s1 = await run({ closed: false }, true), s2 = await run({ closed: false }, false), s3 = await run(null, true);
    return { calls, downloads, s1, s2, s3, def: (() => { try { return localStorage.getItem('lagesplan-cadexport-tc'); } catch (e) { return 'x'; } })() };
  });
  if (tc.downloads.length !== 3 || tc.calls.length !== 1 || tc.calls[0][0] !== 'tcUpload' || tc.calls[0][1] !== 'Lägesplan export' || !/^3D-objekt Plan 1 .*\.dxf:\d+$/.test(tc.calls[0][2])) fail('Lokal kopia varje gång, Trimble Connect bara med rutan ikryssad: ' + JSON.stringify(tc));
  if (!/sparade i Trimble Connect \(Lägesplan export\)/.test(tc.s1) || /Trimble/.test(tc.s2) || !/öppna lägesplanen via/.test(tc.s3)) fail('Statusen ska säga var filen hamnade: ' + JSON.stringify(tc));
  console.log('OK: DXF-exporten laddas ned lokalt och sparas i Trimble Connect (Lägesplan export) när rutan är ikryssad');
  // Tätt placerade objekt: namnen krockar inte med varandra eller med grannens prick.
  const lay = await page.evaluate(() => {
    view.rot = 0; plans[0].calib = { model: [[0, 0, 0], [100, 0, 0]], pdf: [[0, 0], [1000, 0]] }; applyView();
    const marks = [{ x: 0, y: 0, name: 'L12' }, { x: 1.5, y: 0, name: 'L14' }, { x: 3, y: 0, name: 'L16' }, { x: 0, y: 1.2, name: 'K12' }];
    const L = objLabelLayout(marks, { h: 1, r: 0.4, gap: 0.25, widthOf: n => 0.85 * n.length });
    const rr = dxfTextRotation() * Math.PI / 180;
    return { L, marks, rr };
  });
  const boxes = lay.marks.map((m, i) => { const a = m.x * Math.cos(lay.rr) + m.y * Math.sin(lay.rr), c = -m.x * Math.sin(lay.rr) + m.y * Math.cos(lay.rr); return [a + lay.L[i].da, c + lay.L[i].dc, a + lay.L[i].da + 0.85 * 3, c + lay.L[i].dc + 1]; });
  const over = (p, q) => p[0] < q[2] && p[2] > q[0] && p[1] < q[3] && p[3] > q[1];
  if (boxes.some((b, i) => boxes.some((q, j) => j > i && over(b, q)))) fail('Namnen ska inte överlappa: ' + JSON.stringify(lay.L));
  console.log('OK: namnen på tätt placerade objekt hamnar fritt från varandra');
  console.log('OK: 3D-objekten som DXF – meter, modellens koordinater, lager per status, fotavtryck och namn (å/ä/ö)');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
