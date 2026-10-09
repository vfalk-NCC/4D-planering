// Zonerna som DXF och IFC (Victors önskemål 2026-10-05): DXF med zonkonturer per status,
// överzonernas kontur och "kod namn" i zonen; IFC med 0,5 m tjocka plattor i statusfärg på
// arbetsytans kalibrerade maxhöjd och kod + namn som liggande 3D-text ovanpå.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8978;
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
    const O = [6512300, 150100];
    const sq = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]]];
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[O[0], O[1], 0], [O[0] + 100, O[1], 0]], pdf: [[0, 0], [1000, 0]] }, level: { z0: 10, z1: 14 }, zones: [
      { id: 'z1', code: '7411', name: 'SEKTIONSFICKOR', parent: '741 Sektionsfickor', polys: sq(100, 100, 200, 200), rule: { field: 'auto' } },
      { id: 'z2', code: '7412', name: 'Förtjockare', parent: '741 Sektionsfickor', polys: [[[200, 100], [300, 100], [300, 100.05], [300, 200], [200, 200], [200, 100]]], rule: { field: 'auto' } }, // dubbel punkt + upprepad slutpunkt
      { id: 'z3', code: '7499', name: 'Dold', polys: sq(400, 100, 500, 200), rule: { field: 'auto' }, style: { hidden: true } }] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = [{ id: 'i1', object_name: 'K10', activity: 'Pelare', start_date: '2026-09-01', end_date: '2026-12-01', status: 'pagaende', progress: 40 }];
    positions = [{ id: 'i1', x: O[0] + 15, y: O[1] + 15, z0: 11, z1: 12 }];
    try { localStorage.setItem(ZONE_OPTS_KEY, JSON.stringify({ ...zoneOpts(), wbs: true })); } catch (e) {}
    renderPlanSelect(); await openPlan('A');
    invalidateVisible(); invalidatePositions(); renderZones();
    const files = {}, calls = [];
    downloadBlob = (blob, name) => { files[name.startsWith('Zonvolymer') ? 'vol' : name.slice(-3)] = { blob, name }; };
    askOpener = async (type, extra) => { calls.push([type, extra.folder, extra.files[0].name]); return { folder: extra.folder }; };
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    $('cadExportToTc').checked = true;
    await exportZonesDxf(); await exportZonesIfc();
    const dxfText = new TextDecoder('windows-1252').decode(new Uint8Array(await files.dxf.blob.arrayBuffer()));
    const dxf = parseDxf(dxfText), geo = dxfToGeometry(dxf);
    const { rx, ry } = ifcReadDir();
    const lbl = zoneCadList().map(e => { const L = zoneIfcLabel(e, rx, ry, []); return [e.name, L.lines, L.h]; });
    const cf = zoneIfcColors([{ parent: '741 Sektionsfickor' }, { parent: '742 Sikthall' }, { parent: '', ph: 'klar' }]);
    const grp = [cf({ parent: '741  sektionsfickor' }).col, cf({ parent: '741 Sektionsfickor' }).col, cf({ parent: '742 Sikthall' }).col, cf({ parent: '', ph: 'klar' }).col === phaseColor('klar')];
    return { grp, lbl, vol: files.vol && await files.vol.blob.text(), volName: files.vol && files.vol.name, names: [files.dxf.name, files.ifc.name], calls, status: $('saveStatus').textContent, ifc: await files.ifc.blob.text(),
      layers: Object.keys(dxf.layers).sort(), polys: dxf.entities.filter(e => e.type === 'POLYLINE').map(e => [(e.g.find(p => p[0] === 8) || [])[1], e.verts.map(v => [Number(v.g.find(p => p[0] === 10)[1]), Number(v.g.find(p => p[0] === 20)[1])])]),
      texts: geo.filter(x => x.text).map(x => [x.text, x.x, x.y]), dxfText };
  });
  require('fs').writeFileSync(require('path').join(process.env.IFC_OUT || require('os').tmpdir(), 'zoner-test.ifc'), r.ifc);
  if (!/^Zoner Plan 1 .*\.dxf$/.test(r.names[0]) || !/^Zoner Plan 1 .*\.ifc$/.test(r.names[1])) fail('Filnamn: ' + r.names);
  // DXF
  if (JSON.stringify(r.layers) !== JSON.stringify(['OVERZON', 'ZON-INGEN', 'ZON-NAMN', 'ZON-PAGAENDE'])) fail('Lager per status, namn och överzon: ' + JSON.stringify(r.layers));
  const z1 = r.polys.find(p => p[0] === 'ZON-PAGAENDE');
  if (!z1 || z1[1].length !== 4 || Math.abs(Math.min(...z1[1].map(p => p[0])) - 6512310) > 0.001 || Math.abs(Math.max(...z1[1].map(p => p[1])) - 150120) > 0.001) fail('Zonens kontur i modellens koordinater: ' + JSON.stringify(z1));
  if (r.polys.some(p => p[1].some(q => q[0] > 6512335))) fail('Dolda zoner följer inte med');
  if (!r.polys.some(p => p[0] === 'OVERZON' && Math.abs(Math.max(...p[1].map(q => q[0])) - 6512330.8) < 0.001 && Math.abs(Math.min(...p[1].map(q => q[0])) - 6512309.2) < 0.001)) fail('Överzonen som en ram 0,8 m utanför sina zoner: ' + JSON.stringify(r.polys.filter(p => p[0] === 'OVERZON')));
  const t1 = r.texts.find(t => t[0] === '7411 SEKTIONSFICKOR'), t2 = r.texts.find(t => t[0] === '7412 Förtjockare');
  const inZ = (t, x0, x1) => t && t[1] > x0 && t[1] < x1 && t[2] > 150110 && t[2] < 150120;
  if (!inZ(t1, 6512310, 6512320) || !inZ(t2, 6512320, 6512330)) fail('Kod + namn i sin zon: ' + JSON.stringify(r.texts));
  const z2 = r.polys.find(p => p[0] === 'ZON-INGEN');
  if (!z2 || z2[1].length !== 4) fail('Dubbla punkter och upprepad slutpunkt rensas bort: ' + JSON.stringify(z2));
  console.log('OK: zonerna som DXF – konturer per status, överzon, kod + namn i zonen, dolda zoner utan');
  // IFC
  const t = r.ifc;
  const defs = new Map([...t.matchAll(/^#(\d+)=([A-Z0-9]+)\((.*)\);$/gm)].map(m => [m[1], { type: m[2], args: m[3] }]));
  const miss = [...t.matchAll(/#(\d+)/g)].map(m => m[1]).filter(x => !defs.has(x));
  if (miss.length) fail('Referenser som saknas: ' + miss.slice(0, 5));
  const proxies = [...defs.values()].filter(d => d.type === 'IFCBUILDINGELEMENTPROXY');
  const plates = proxies.filter(p => /'4D-zon'/.test(p.args)), labels = proxies.filter(p => /'4D-zontext'/.test(p.args));
  if (plates.length !== 2 || labels.length !== 2) fail('En platta och en text per tänd zon: ' + proxies.length);
  const ptOf = pl => { const ax = defs.get(/#(\d+)$/.exec(defs.get(pl).args)[1]); const p = defs.get(/^#(\d+)/.exec(ax.args)[1]); return p.args.replace(/[()]/g, '').split(',').map(Number); };
  const plOf = (p, kind) => new RegExp(`,'${kind}',#(\\d+),`).exec(p.args)[1];
  const pp = ptOf(plOf(plates.find(p => /'7411 SEKTIONSFICKOR'/.test(p.args)), '4D-zon')), tp = ptOf(plOf(labels.find(p => /'7411 SEKTIONSFICKOR \\X2\\2013\\X0\\ text'/.test(p.args)), '4D-zontext'));
  if (Math.abs(pp[2] - 14) > 0.001 || Math.abs(tp[2] - 14.5) > 0.001 || Math.abs(pp[0] - 6512315) > 0.01) fail('Plattan på maxhöjden (+14), texten ovanpå (+14,5): ' + [pp, tp]);
  if (!/IFCEXTRUDEDAREASOLID\(#\d+,\$,#\d+,0\.5\)/.test(t) || !/IFCARBITRARYCLOSEDPROFILEDEF/.test(t)) fail('0,5 m tjocka plattor av zonens form');
  if (!/'Yta m\\X2\\00B2\\X0\\',\$,IFCREAL\(100\.\)/.test(t) || !/'\\X2\\00D6\\X0\\verzon',\$,IFCLABEL\('741 Sektionsfickor'\)/.test(t) || !/'Status',\$,IFCLABEL\('P\\X2\\00E5\\X0\\g\\X2\\00E5\\X0\\ende'\)/.test(t)) fail('Egenskaper på plattan (yta, överzon, status)');
  console.log('OK: zonerna som IFC – 0,5 m plattor på kalibrerad maxhöjd, kod + namn ovanpå, egenskaper, inga trasiga referenser');
  // Samma texthöjd i alla zoner, radbrytning när det blir trångt (Victor 2026-10-07).
  if (!r.lbl.every(l => l[2] === 1.5) || JSON.stringify(r.lbl.map(l => l[1])) !== JSON.stringify([['7411', 'SEKTIONSFICKOR'], ['7412', 'Förtjockare']])) fail('Texthöjd och radbrytning: ' + JSON.stringify(r.lbl));
  const reps = [...t.matchAll(/^#\d+=IFCSHAPEREPRESENTATION\(#\d+,'Body','Tessellation',\((#\d+(?:,#\d+)*)\)\);$/gm)].map(m => m[1].split(',').length);
  if (!reps.length || !reps.every(n => n === 2)) fail('Två textrader per zon: ' + JSON.stringify(reps));
  // En färg per överzon (Victor 2026-10-07): båda zonerna ligger i 741 Sektionsfickor.
  if (r.grp[0] !== r.grp[1] || r.grp[1] === r.grp[2] || r.grp[3] !== true) fail('Färg per överzon: ' + JSON.stringify(r.grp));
  const surf = [...t.matchAll(/IFCSURFACESTYLE\('([^']*)'/g)].map(m => m[1]);
  if (!surf.includes('741 Sektionsfickor') || surf.some(x => /^P\\X2\\00E5/.test(x)) || !/IFCCOLOURRGB\(\$,0\.145,0\.388,0\.922\)/.test(t)) fail('Plattorna i överzonens färg, inte statusfärg: ' + JSON.stringify(surf));
  if (!/IFCSURFACESTYLE\('741 Sektionsfickor volym'/.test(r.vol)) fail('Soliderna i överzonens färg');
  // Den långa soliden: egen fil, +370 till +500.
  if (!/^Zonvolymer Plan 1 .* \+370 till \+500\.ifc$/.test(r.volName || '')) fail('Volymfilen: ' + r.volName);
  const vdefs = new Map([...r.vol.matchAll(/^#(\d+)=([A-Z0-9]+)\((.*)\);$/gm)].map(m => [m[1], { type: m[2], args: m[3] }]));
  if ([...r.vol.matchAll(/#(\d+)/g)].some(m => !vdefs.has(m[1]))) fail('Volymfilen: trasiga referenser');
  const vols = [...vdefs.values()].filter(d => d.type === 'IFCBUILDINGELEMENTPROXY' && /'4D-zonvolym'/.test(d.args));
  if (vols.length !== 2 || !/IFCEXTRUDEDAREASOLID\(#\d+,\$,#\d+,130\.\)/.test(r.vol)) fail('En 130 m hög solid per zon');
  const vp = (() => { const pl = /,'4D-zonvolym',#(\d+),/.exec(vols[0].args)[1]; const ax = vdefs.get(/#(\d+)$/.exec(vdefs.get(pl).args)[1]); return vdefs.get(/^#(\d+)/.exec(ax.args)[1]).args.replace(/[()]/g, '').split(',').map(Number); })();
  if (Math.abs(vp[2] - 370) > 0.001) fail('Soliden börjar på +370: ' + vp);
  console.log('OK: IFC – samma texthöjd (1,5 m) i alla zoner med radbrytning, och en solid +370 till +500 per zon i en egen fil');
  if (r.calls.length !== 3 || !r.calls.every(c => c[1] === 'Lägesplan export') || !/på \+14\.00/.test(r.status)) fail('Lokal kopia och Trimble Connect för båda: ' + JSON.stringify(r.calls) + ' ' + r.status);
  console.log('OK: zonexporterna laddas ned lokalt och sparas i Trimble Connect (Lägesplan export)');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
