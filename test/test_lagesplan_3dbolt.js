const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9281;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  const gh = new Map();
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
    const body = JSON.parse(req.postData()); gh.set(f, Buffer.from(body.content, 'base64').toString());
    if (/ifc_groups\.json$/.test(f)) page.evaluate(t => { window.__gsaved = JSON.parse(t); }, gh.get(f)).catch(() => {});
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async ifc => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    window.__fetch = 0;
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    // UTF-8 rakt i filen ("Stålbolaget") – som en del program skriver.
  }, '');


  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3bfParse === 'function', null, { timeout: 15000 });
  const ok = (c, m) => { if (!c) fail(m); };
  await page.evaluate(() => l3dkToggle(true));   // högermenyn dockad: panelerna staplas där
  // Syntetiska textobjekt som i ritningarnas tabeller: en rad = y, kolumner = x. Vattenstämpelns lösa siffror/bokstäver och en UTGÅTT-rad ska inte störa.
  const mk = () => {
    const it = []; let y = 800;
    const row = (cells) => { let x = 50; cells.forEach(c => { it.push({ s: c, x, y, w: c.length * 5.5, h: 11, pg: 1 }); x += c.length * 5.5 + 20; }); y -= 19; };
    row(['STAG', 'NR:', 'X', '(m)', 'Y', '(m)', 'Z', '(m)', 'I', 'BERG', '(m)', 'DIMENSION']);
    row(['BV001', '169000.000', '7456000.000', '427.300', '2', '⌀25']);
    row(['BV002', '169010.000', '7456000.000', '427.300', '3', '⌀32']);
    row(['BV003', '169020.000', '7456000.000', '+401.400', '3', '25']);          // utan ⌀, med plustecken (som 5082380)
    row(['BV004', '--UTGÅTT--']);
    row(['BV005', '169030.000', '7456000.000', '414.500', '⌀25']);                  // sättdjup saknas
    row(['BH100', '169100.000', '7456100.000', '440.000', '⌀25', 'BH100', '169103.000', '7456104.000', '438.000', '⌀25']);
    // BH101 med vattenstämpel (lösa tecken) mellan kolumnerna
    row(['BH101', '169110.000', '7456100.000', 'T', '5', '441.000', '⌀32', 'BH101', '169110.000', '7456100.000', 'UT', '1', '441.000', '⌀32']);   // samma punkt → hoppas över
    row(['BH102', '169120.000', '7456100.000', '441.000', '⌀32', 'BH102', '169124.000', '7456100.000', 'R', '15', '441.000', '⌀32']);
    it.push({ s: 'UTGÅTT', x: 300, y: 600, w: 80, h: 60, pg: 1 });                // stor vattenstämpeltext
    return it;
  };
  const R = await page.evaluate(mk => { const r = l3bfParse(eval('(' + mk + ')')(), 'test.pdf'); return r; }, mk.toString());
  ok(R.vert.length === 4 && R.vert.map(v => v.id).join() === 'BV001,BV002,BV003,BV005', 'Vertikala: ' + JSON.stringify(R.vert.map(v => v.id)));
  ok(R.vert[2].z === 401.4 && R.vert[2].dim === 25 && R.vert[1].dim === 32 && R.vert[1].len === 3 && R.vert[3].len === 2 && R.vert[3].guess, 'Värden: ' + JSON.stringify(R.vert));
  ok(R.hor.length === 2 && R.hor.map(h => h.id).join() === 'BH100,BH102', 'Horisontella: ' + JSON.stringify(R.hor.map(h => h.id)));
  ok(R.hor[1].b[0] === 169124 && R.hor[1].b[2] === 441 && R.hor[0].a[2] === 440 && R.hor[0].b[2] === 438, 'Start/slut: ' + JSON.stringify(R.hor));
  ok(R.warn.some(w => /BV005.*saknas/.test(w)) && R.warn.some(w => /BH101.*samma punkt/.test(w)), 'Varningar: ' + R.warn.join('|'));
  // Cylinderns volym (8-kant): 2√2·r²·L, positiv (utåtvända trianglar), sluten
  const C = await page.evaluate(() => { const c = l3bfCyl([0, 0, 0], [3, 4, 12], 0.0125), s = modMeshStats(c.pts, c.faces.map(f => f.slice())); return { v: s.volume, closed: l3bqClosed(c.faces.map(f => [f[0] - 1, f[1] - 1, f[2] - 1])) }; });
  ok(Math.abs(C.v - 2 * Math.SQRT2 * 0.0125 ** 2 * 13) < 1e-6 && C.closed, 'Cylinder: ' + JSON.stringify(C));
  // Dialogen: filval via pdf.js-attrapp, sammanfattning, skapa
  await page.evaluate(mk => { const items = eval('(' + mk + ')')(); window.pdfjsLib.getDocument = () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ view: [0, 0, 1000, 850], getViewport: ({ scale }) => ({ width: 1000 * scale, height: 850 * scale }), render: () => ({ promise: Promise.resolve() }), getTextContent: async () => ({ items: items.map(i => ({ str: i.s, width: i.w, transform: [i.h, 0, 0, i.h, i.x, i.y] })).concat([{ str: 'UTGÅTT', width: 50, transform: [0, 40, -40, 0, 320, 500] }]) }) }) }) }); }, mk.toString());
  await page.click('#v3BoltBtn'); await page.waitForSelector('#v3BfFile');
  await page.setInputFiles('#v3BfFile', { name: 'tabell.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await page.waitForFunction(() => /bergförankringar/.test(document.getElementById('v3BfRes').textContent), null, { timeout: 5000 });
  const sum = await page.textContent('#v3BfRes'); ok(/6 bergförankringar/.test(sum) && /vertikala 3 st ⌀25 \+ 1 st ⌀32/.test(sum) && /horisontella 1 st ⌀25 \+ 1 st ⌀32/.test(sum), 'Sammanfattning: ' + sum);
  await page.selectOption('#v3BfPer', 'group'); await page.selectOption('#v3BfDir', 'down'); await page.fill('#v3BfExtra', '0'); await page.fill('#v3BfScale', '4'); await page.dispatchEvent('#v3BfScale', 'change');
  await page.click('#v3BfGo');
  const G = await page.evaluate(() => placements.filter(p => p.bf).map(p => ({ name: p.name, n: p.bf.n, area: p.area, x: p.x, y: p.y, z: p.z, parts: (p.m.parts || []).length, p0z: p.m.parts ? Math.min(...p.m.parts[0].m.pts.map(q => q[2])) : 0, closed: p.m.closed, vol: modMeshStats(p.m.pts, p.m.faces).volume, zs: p.m.pts.map(q => q[2]) })));
  ok(G.length === 4 && G.every(g => /^Bergförankring\/(Vertikala|Horisontella) ⌀(25|32)$/.test(g.area) && g.closed), 'Fyra grupper: ' + JSON.stringify(G.map(g => [g.name, g.n])));
  const v25 = G.find(g => /vertikala ⌀25/.test(g.name)), h32 = G.find(g => /horisontella ⌀32/.test(g.name)), h25 = G.find(g => /horisontella ⌀25/.test(g.name));
  ok(v25 && v25.n === 3 && v25.x === 169000 && v25.y === 7456000 && v25.z === 427.3, 'Vertikal grupp ligger i SWEREF-koordinater: ' + JSON.stringify(v25));
  // BV001 ⌀25: sättdjup 2 m nedåt, förstorat ×4 → diameter 100 mm. BV005: 2 m antaget. Sammanlagd längd 2+3+2 m
  ok(Math.abs(v25.vol - 2 * Math.SQRT2 * 0.05 ** 2 * 7) < 1.5e-3 && Math.abs(v25.p0z + 2) < 0.06, 'Volym och riktning nedåt: ' + v25.vol + ' ' + Math.min(...v25.zs));
  ok(h25 && h25.n === 1 && Math.abs(h25.vol - 2 * Math.SQRT2 * 0.05 ** 2 * Math.hypot(3, 4, 2)) < 1.5e-3, 'Horisontell stång mellan start och slut: ' + JSON.stringify(h25 && h25.vol));
  ok(h32 && Math.abs(h32.vol - 2 * Math.SQRT2 * (0.032 * 4 / 2) ** 2 * 4) < 1.5e-3, 'Horisontell ⌀32 4 m: ' + JSON.stringify(h32 && h32.vol));
  // Ritningen som bild med klickbara stag: öppnas efter Skapa, stagen i 3D är orangea fält, klick flyger dit och lyser röd
  await page.waitForSelector('#v3BoltDoc .bfhot', { timeout: 5000 });
  const H = await page.evaluate(() => [...document.querySelectorAll('#v3BoltDoc .bfhot')].map(h => ({ id: h.dataset.id, on: /245,\s*158/.test(h.style.background) })));
  ok(H.length >= 8 && H.find(h => h.id === 'BV001').on && !H.find(h => h.id === 'BV004').on, 'Stag-fält på bilden (de som finns i 3D är markerade): ' + JSON.stringify(H));
  await page.click('#v3BoltDoc .bfhot[data-id="BV001"]'); await page.waitForTimeout(900);
  const Z = await page.evaluate(() => ({ t: l3.orbit.target.toArray().map((v, i) => v + l3.O[i]), hl: l3bf.hl.children.length, vis: l3bf.hl.children[0].material.depthTest === false }));
  ok(Math.abs(Z.t[0] - 169000) < 0.5 && Math.abs(Z.t[1] - 7456000) < 0.5 && Math.abs(Z.t[2] - 426.3) < 0.5 && Z.hl === 1 && Z.vis, 'Klick på BV001 flyger till stången och lyser: ' + JSON.stringify(Z));
  await page.fill('#v3BdQ', 'BH102'); await page.press('#v3BdQ', 'Enter'); await page.waitForTimeout(900);
  const Z2 = await page.evaluate(() => l3.orbit.target.toArray().map((v, i) => v + l3.O[i])); ok(Math.abs(Z2[0] - 169122) < 0.5 && Math.abs(Z2[2] - 441) < 0.5, 'Sök BH102 zoomar dit: ' + JSON.stringify(Z2));
  // Omvänt: klick på en stång i 3D → rätt stag lyser i ritningen (och ritningen bläddrar dit)
  const pos = await page.evaluate(() => { const e = l3bfIndex().get('BV003'), O = l3.O, v = new THREE.Vector3(e.center[0] - O[0], e.center[1] - O[1], e.center[2] - O[2]); l3FlyTo(v, 6, new THREE.Vector3(0, -1, 0.3), 0); l3.camera.updateMatrixWorld(true); const s = v.clone().project(l3.camera), r = l3.renderer.domElement.getBoundingClientRect(); return { x: r.left + (s.x + 1) / 2 * r.width, y: r.top + (1 - s.y) / 2 * r.height }; });
  await page.evaluate(() => { l3bfPanelClose('v3BoltDoc'); });
  await page.mouse.click(pos.x, pos.y); await page.waitForTimeout(900);
  const back = await page.evaluate(() => ({ doc: !!document.getElementById('v3BoltDoc'), sel: [...document.querySelectorAll('#v3BoltDoc .bfhot.sel')].map(h => h.dataset.id), hl: l3bf.hl.children.length }));
  ok(back.doc && back.sel.join() === 'BV003' && back.hl === 1, 'Klick på stången i 3D visar BV003 i ritningen: ' + JSON.stringify(back));
  const saved = await page.evaluate(async () => (await l3bfLoadDocs()).length); ok(saved === 1, 'Ritningen sparad i webbläsaren: ' + saved);
  // Egenskaper: per del i gruppen, i högerpanelen (grupp) och i IFC-egenskaperna
  const P = await page.evaluate(() => { try { const p = placements.find(q => q.bf && /vertikala ⌀25/.test(q.name)), b = p.m.parts[0].m.bfp, g = k => (b.find(x => x[0] === k) || [])[1]; return { id: g('Stag nr'), typ: g('Typ'), dim: g('Dimension stång mm'), hole: g('Borrhål mm'), len: g('Längd m'), sd: g('Sättdjup i berg m'), kg: g('Vikt stål kg (7850 kg/m³)'), z: g('Startpunkt Z (RH 2000)'), src: g('Källa (ritning)'), sideH: modSideHtml(p).replace(/<[^>]+>/g, ' '), ifc: modProps(p).map(x => x[0]).join('|') }; } catch (e) { return { err: e.stack }; } });
  ok(P.id === 'BV001' && /Vertikal/.test(P.typ) && P.dim === '⌀25' && P.hole === '⌀45' && P.len === 2 && P.sd === 2 && P.z === 427.3 && Math.abs(P.kg - Math.PI * 0.0125 ** 2 * 2 * 7850) < 0.1 && P.src === 'tabell', 'Egenskaper per stång: ' + JSON.stringify(P));
  ok(/Bergförankring – 3 st/.test(P.sideH) && /Total längd m\s+7/.test(P.sideH.replace(/\s+/g, ' ')) && /BV003/.test(P.sideH) && /Antal stänger/.test(P.ifc), 'Gruppens sammanfattning i panelen/IFC: ' + P.sideH.replace(/\s+/g, ' ').slice(0, 300) + ' ' + P.ifc);
  await page.evaluate(() => { const p = placements.find(q => q.bf && /vertikala ⌀25/.test(q.name)); l3SelectIds([p.id]); l3dxExplode(); });
  const X = await page.evaluate(() => placements.filter(q => q.m && q.m.bfp).map(q => ({ n: q.m.bfp[0][1], side: (() => { try { return modSideHtml(q); } catch (e) { return 'ERR ' + e.stack.split('\n').slice(0,3).join(' / '); } })().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), ifc: modProps(q).some(x => x[0] === 'Stag nr' && x[1] === q.m.bfp[0][1]) })));
  const XV = X.filter(x => /^BV/.test(x.n)); ok(XV.length === 4 && XV.every(x => /Bergförankring – BV00/.test(x.side) && /Startpunkt Y/.test(x.side) && x.ifc), 'Efter Dela upp har varje stång alla egenskaper: ' + JSON.stringify(XV.map(x => [x.n, /Bergförankring – BV00/.test(x.side), x.ifc, x.side.slice(0, 60)])));
  // Ny körning med "uppåt" + extra längd ersätter de gamla (inga dubbletter) och Dela upp ger enskilda stänger
  await page.click('#v3BoltBtn'); await page.setInputFiles('#v3BfFile', { name: 'tabell.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await page.waitForFunction(() => /bergförankringar/.test(document.getElementById('v3BfRes').textContent), null, { timeout: 5000 });
  await page.selectOption('#v3BfDir', 'up'); await page.fill('#v3BfExtra', '0.5'); await page.dispatchEvent('#v3BfExtra', 'change'); await page.selectOption('#v3BfPer', 'bar');
  await page.click('#v3BfGo');
  const G2 = await page.evaluate(() => placements.filter(p => p.bf).map(p => ({ name: p.name, zs: p.m.pts.map(q => q[2]), z: p.z })));
  ok(G2.length === 6, 'Ersätter tidigare: ett objekt per stång (6): ' + G2.length);
  const ar = await page.evaluate(() => [...new Set(placements.filter(p => p.bf).map(p => p.area))].sort().join('|')); ok(ar === 'Bergförankring/Horisontella ⌀25|Bergförankring/Horisontella ⌀32|Bergförankring/Vertikala ⌀25|Bergförankring/Vertikala ⌀32', 'Mappar per typ och dimension: ' + ar);
  const b1 = G2.find(g => /^BV001/.test(g.name)); ok(b1 && Math.abs(Math.max(...b1.zs) - 2.5) < 0.06 && Math.abs(b1.z - (427.3 - 0.5)) < 1e-6, 'Uppåt 2 m + 0,5 m extra, startpunkten 0,5 m under (extra längd): ' + JSON.stringify(b1 && [b1.z, Math.max(...b1.zs)]));
  const csv = await page.evaluate(() => l3bfCsv(l3bf.rows, l3bf.opt)); ok(csv.split('\r\n').length === 7 && /Vertikal;BV001;25;169000;7456000;427.3/.test(csv) && /Horisontell;BH100/.test(csv), 'CSV: ' + csv.slice(0, 200));
  ok(!errors.length, 'Sidfel: ' + errors.join(' | '));
  console.log('OK: bergförankring från PDF – tabellparser (vattenstämpel, UTGÅTT, saknat sättdjup), cylindrar med rätt volym i SWEREF-koordinater, riktning/extra längd, ersätt, ett per stång, CSV');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
