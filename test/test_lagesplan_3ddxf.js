// DXF-redigering i 3D, hopfällbar lagerhanterare, vänstermenyn, mätning med Skift och sparade mått,
// nålad historik (Victor 2026-10-10).
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9003;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
// pako (komprimering av CAD-geometrin): en enkel ersättare – testet läser aldrig tillbaka filen.
const PAKO = `window.pako = { gzip: s => new TextEncoder().encode(String(s)), ungzip: (u, o) => new TextDecoder().decode(u) };`;
const DXF = n => ['0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '8', n, '10', '6512340', '20', '150110', '11', '6512345', '21', '150110', '0', 'ENDSEC', '0', 'EOF', ''].join('\n');

(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : 'text/html' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: /pako/.test(r.request().url()) ? PAKO : PDFJS }));
  const gh = new Map();
  await page.route('https://api.github.com/**', r => {
    const req = r.request(), f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    if (req.method() === 'GET') { const e = gh.get(f); return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e).toString('base64'), sha: 's' + e.length }) }) : r.fulfill({ status: 404, body: '{}' }); }
    const body = JSON.parse(req.postData() || '{}'); gh.set(f, Buffer.from(body.content || '', 'base64').toString());
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: 's' + gh.get(f).length } }) });
  });
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async grund => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = []; positions = [];
    renderPlanSelect(); await openPlan('A');
    // En inlagd DXF (Utsättning) med två CAD-lager, i modellens koordinater.
    const rec = { id: 'c1', type: 'cad', name: 'Utsättning', path: 'x', colorMode: 'orig', weight: 1, layers: [{ name: 'AXLAR', color: '#ff0000', n: 1 }, { name: 'MÅTT', color: '#0000ff', n: 1 }], stats: { lines: 2, texts: 0, kb: 1 } };
    siteItems.push(rec); ls('cad:c1').visible = true;
    cadGeom.set('c1', buildCadGeom({ origin: [6512350, 150120], groups: [{ l: 0, c: '#ff0000', p: [[0, 0, 10000, 0, 10000, 5000]], t: [] }, { l: 1, c: '#0000ff', p: [[0, 1000, 2000, 1000]], t: [] }] }));
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    window.__calls = [];
    askOpener = async (type, extra) => {
      window.__calls.push([type, extra && (extra.fileId || extra.folderId) || null]);
      if (type === 'tcFolder' && !extra.folderId) return { folderId: 'root', projectName: 'Kvarteret', items: [{ id: 'f1', name: 'CAD', type: 'folder' }] };
      if (type === 'tcFolder' && extra.folderId === 'f1') return { folderId: 'f1', items: [{ id: 'D1', name: 'Grund.dxf', type: 'file', size: 300 }, { id: 'P1', name: 'Plan.pdf', type: 'file', size: 10 }] };
      if (type === 'tcFile' && extra.fileId === 'D1') return { bytes: new TextEncoder().encode(grund).buffer };
      if (type === 'tcUpload') { window.__calls.push(['upload', extra.files.map(f => f.name).join()]); window.__upText = await extra.files[0].text(); window.__upFolder = extra.folder; return { uploaded: 1, folder: extra.folder }; }
      return {};
    };
  }, DXF('GRUND'));
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  await page.waitForFunction(() => l3.groups.cad && l3.groups.cad.children.length === 2, null, { timeout: 10000 });


  const cvb = await page.locator('#v3Canvas canvas').boundingBox();
  const scr = (x, y) => page.evaluate(([x, y]) => { const q = l3ToScreen(new THREE.Vector3(x - l3.O[0], y - l3.O[1], l3dZ ? l3dZ() : 0.035)); return [q.x, q.y]; }, [x, y]);
  // Vy rakt uppifrån över ritningen.
  await page.evaluate(() => { l3StopFly(); const c = new THREE.Vector3(6512355 - l3.O[0], 150122 - l3.O[1], 0); l3.camera.position.set(c.x, c.y - 0.01, 40); l3.orbit.target.copy(c); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); });

  // Lagerhanteraren: blocken fälls ihop och ut, även alla på en gång.
  await page.click('[data-paltab="layers"]');
  await page.waitForSelector('#v3PalLayers [data-lsec-t="base"]');
  await page.click('#v3PalLayers [data-lsec-t="base"]');
  if (await page.$('#v3PalLayers [data-l3l="plan"]')) fail('Underlag ska fällas ihop');
  await page.click('#v3LayFold');
  const allShut = await page.evaluate(() => ['base', 'plan', 'site2d', 'models'].every(id => (l3Prefs().layClosed || []).includes(id)) && !document.querySelector('#v3PalLayers .v3-lsec-b'));
  if (!allShut) fail('Fäll ihop alla');
  await page.click('#v3LayFold');
  if (!(await page.$('#v3PalLayers [data-l3l="plan"]')) || !(await page.$('#v3PalLayers [data-l3s="cad:c1"]'))) fail('Fäll ut alla');

  // Sök i lagermenyn: bara det som matchar syns (även i ihopfällda block).
  await page.click('#v3PalLayers [data-lsec-t="site2d"]');
  await page.fill('#v3LayQ', 'utsätt'); await page.waitForTimeout(100);
  const sq = await page.evaluate(() => [...document.querySelectorAll('#v3PalLayers .v3-lr')].filter(r => r.offsetParent).map(r => r.textContent.trim().slice(0, 12)));
  if (sq.length !== 1 || !/Utsättning/.test(sq[0])) fail('Sök i lagermenyn: ' + JSON.stringify(sq));
  await page.fill('#v3LayQ', ''); await page.waitForTimeout(100);
  await page.click('#v3PalLayers [data-lsec-t="site2d"]');

  // Vänstermenyn: Ctrl+B döljer och visar, bredden går att dra.
  await page.keyboard.press('Control+b'); await page.waitForTimeout(150);
  if (!(await page.isHidden('#v3Pal')) || await page.isHidden('#v3PalOpen')) fail('Ctrl+B ska dölja vänstermenyn');
  await page.click('#v3PalOpen'); await page.waitForTimeout(150);
  if (await page.isHidden('#v3Pal')) fail('Fliken Meny ska visa vänstermenyn igen');
  const rsl = await page.locator('#view3d .v3-rs-left').boundingBox(), pw0 = await page.evaluate(() => document.getElementById('v3Pal').getBoundingClientRect().width);
  await page.mouse.move(rsl.x + 3, rsl.y + rsl.height / 2); await page.mouse.down(); await page.mouse.move(rsl.x + 103, rsl.y + rsl.height / 2, { steps: 4 }); await page.mouse.up();
  const pw1 = await page.evaluate(() => ({ w: document.getElementById('v3Pal').getBoundingClientRect().width, pref: l3Prefs().palW }));
  if (Math.abs(pw1.w - pw0 - 100) > 3 || Math.abs(pw1.pref - pw1.w) > 2) fail('Vänstermenyns bredd: ' + JSON.stringify({ pw0, ...pw1 }));
  await page.dblclick('#view3d .v3-rs-left');
  await page.evaluate(() => { l3StopFly(); const c = new THREE.Vector3(6512355 - l3.O[0], 150122 - l3.O[1], 0); l3.camera.position.set(c.x, c.y - 0.01, 40); l3.orbit.target.copy(c); l3.orbit.update(); l3Resize(); l3.renderer.render(l3.scene, l3.camera); });
  await page.waitForTimeout(200);
  const cv = await page.locator('#v3Canvas canvas').boundingBox();
  const click = async (x, y, mods) => { const [sx, sy] = await scr(x, y); if (mods) await page.keyboard.down(mods); await page.mouse.click(cv.x + sx, cv.y + sy); if (mods) await page.keyboard.up(mods); await page.waitForTimeout(120); };

  // DXF-redigering: pennan startar, tryck på en linje markerar den.
  await page.click('#v3PalLayers [data-l3s-edit="c1"]');
  await page.waitForSelector('#v3Side #v3DxDraw');
  await click(6512355, 150120);
  let st = await page.evaluate(() => ({ sel: [...l3d.sel], n: l3d.ents.length, orig: l3s.cad.size ? [...l3s.cad.values()].filter(o => o.visible).length : 0 }));
  if (st.sel.length !== 1 || st.n !== 2 || st.orig) fail('Tryck ska markera linjen (originalets linjer dolda under redigeringen): ' + JSON.stringify(st));
  // Flytta 2 m i X, ta bort, Ctrl+Z.
  await page.fill('#v3DxX', '2'); await page.click('#v3DxMove');
  const mv = await page.evaluate(() => l3d.ents.find(e => l3d.sel.has(e.id)).pts[0][0]);
  if (Math.abs(mv - 6512352) > 1e-6) fail('Flytta linjen: ' + mv);
  await page.keyboard.press('Delete'); await page.waitForTimeout(100);
  if ((await page.evaluate(() => l3d.ents.filter(e => !e.del).length)) !== 1) fail('Delete ska ta bort linjen');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(100);
  if ((await page.evaluate(() => l3d.ents.filter(e => !e.del).length)) !== 2) fail('Ctrl+Z ska ta tillbaka linjen');
  // Rita en egen linje på ett nytt lager: tre punkter, Skift = 5°, Enter avslutar.
  page.on('dialog', d => d.accept('4D-RITAT'));
  await page.selectOption('#v3DxLayer', '__new'); await page.waitForTimeout(150);
  await page.click('#v3DxDraw');
  await click(6512340, 150130); await click(6512346, 150130.1, 'Shift'); await click(6512346, 150136);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  const nl = await page.evaluate(() => { const e = l3d.ents.find(x => x.added); return e && { layer: e.layer, n: e.pts.length, y1: e.pts[1][1], dirty: l3d.dirty }; });
  if (!nl || nl.layer !== '4D-RITAT' || nl.n !== 3 || Math.abs(nl.y1 - 150130) > 1e-6 || !nl.dirty) fail('Rita linje (Skift låser 0°): ' + JSON.stringify(nl));
  await page.keyboard.press('Escape'); // ur ritläget
  // Ruta: höger -> vänster runt den nya linjens mitt markerar den.
  const [ax, ay] = await scr(6512347, 150133), [bx, by] = await scr(6512345, 150131);
  await page.mouse.move(cv.x + ax, cv.y + ay); await page.mouse.down(); await page.mouse.move(cv.x + bx, cv.y + by, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(150);
  if ((await page.evaluate(() => [...l3d.sel].map(id => l3d.ents.find(e => e.id === id).layer).join())) !== '4D-RITAT') fail('Kryssruta ska markera den ritade linjen');
  // Spara som ny DXF: ny fil i TC och nytt CAD-lager; originalet släckt och orört.
  await page.click('#v3DxSave');
  await page.waitForFunction(() => !l3d.rec && cads().length === 2, null, { timeout: 15000 });
  const sv = await page.evaluate(() => { const r = cads().find(x => x.id !== 'c1'); return { name: r.name, layers: r.layers.map(l => l.name).sort().join(), orig: ls('cad:c1').visible, nyOn: ls('cad:' + r.id).visible, up: window.__calls.filter(c => c[0] === 'upload').map(c => c[1]), folder: window.__upFolder, txt: window.__upText }; });
  if (!/^Utsättning redigerad \d{4}-\d\d-\d\d kl \d\d\.\d\d\.\d\d$/.test(sv.name) || sv.layers !== '4D-RITAT,AXLAR,MÅTT' || sv.orig || !sv.nyOn || sv.up.length !== 1 || !/redigerad .*\.dxf$/.test(sv.up[0]) || sv.folder !== 'Lägesplan' || !/POLYLINE/.test(sv.txt) || !/6512352\.000/.test(sv.txt))
    fail('Spara som ny DXF: ' + JSON.stringify({ ...sv, txt: (sv.txt || '').length }));

  // Fortsatt redigering (Victor 2026-10-10 "utveckla"): hörnpunkter, Alt, vrid, texter.
  await page.evaluate(async () => { await l3dStart('c1'); l3StopFly(); const c = new THREE.Vector3(6512355 - l3.O[0], 150122 - l3.O[1], 0); l3.camera.position.set(c.x, c.y - 0.01, 40); l3.orbit.target.copy(c); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); });
  const L1 = await page.evaluate(() => { const e = l3d.ents.find(x => x.pts.length === 3); l3d.sel = new Set([e.id]); l3dRebuild(); l3RenderSide(); return e.id; });
  const pts = () => page.evaluate(id => l3d.ents.find(e => e.id === id).pts.map(p => p.map(v => Math.round(v * 1000) / 1000)), L1);
  // Dra i hörnpunkten (6512360, 150125) till (6512362, 150127).
  const [vx, vy] = await scr(6512360, 150125), [tx2, ty2] = await scr(6512362, 150127);
  await page.mouse.move(cv.x + vx, cv.y + vy); await page.mouse.down(); await page.mouse.move(cv.x + (vx + tx2) / 2, cv.y + (vy + ty2) / 2, { steps: 3 }); await page.mouse.move(cv.x + tx2, cv.y + ty2, { steps: 3 }); await page.mouse.up(); await page.waitForTimeout(150);
  let P = await pts();
  if (Math.abs(P[2][0] - 6512362) > 0.1 || Math.abs(P[2][1] - 150127) > 0.1 || P[0][0] !== 6512350) fail('Dra i hörnpunkten: ' + JSON.stringify(P));
  if ((await page.evaluate(id => [...l3d.sel], L1)).join() !== String(L1)) fail('Linjen ska vara kvar markerad efter dragningen');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(100);
  P = await pts(); if (P[2][0] !== 6512360 || P[2][1] !== 150125) fail('Ctrl+Z på hörnpunkten: ' + JSON.stringify(P));
  // Alt + tryck mitt på en markerad linje: ny hörnpunkt; Alt + tryck på den: borta igen.
  await click(6512355, 150120, 'Alt'); P = await pts();
  if (P.length !== 4 || Math.abs(P[1][0] - 6512355) > 0.1) fail('Alt + tryck ska lägga till en hörnpunkt: ' + JSON.stringify(P));
  await click(6512355, 150120, 'Alt'); P = await pts();
  if (P.length !== 3) fail('Alt + tryck på hörnpunkten ska ta bort den: ' + JSON.stringify(P));
  // Vrid 90° runt markeringens mitt (6512355, 150122,5).
  await page.fill('#v3DxR', '90'); await page.click('#v3DxRot'); P = await pts();
  if (Math.abs(P[0][0] - 6512357.5) > 1e-3 || Math.abs(P[0][1] - 150117.5) > 1e-3) fail('Vrid 90°: ' + JSON.stringify(P));
  await page.keyboard.press('Control+z');
  // Verktygen Flytta och Vrid fungerar på de markerade linjerna i DXF-redigeringen.
  {
    const P0 = await pts();
    await page.evaluate(() => l3SetTool('move'));
    await click(P0[0][0], P0[0][1]); await page.mouse.move(0, 0);
    const [hx, hy] = await scr(6512353, 150118.5); await page.mouse.move(cv.x + hx, cv.y + hy); await page.waitForTimeout(100);
    const ghost = await page.evaluate(() => !!(l3dT.ghost && l3dT.ghost.parent));
    await click(6512353, 150118.5);
    let Q = await pts();
    if (!ghost || Math.abs(Q[0][0] - (6512353)) > 0.15 || Math.abs(Q[0][1] - 150118.5) > 0.15 || Math.abs((Q[2][0] - Q[0][0]) - (P0[2][0] - P0[0][0])) > 1e-6) fail('Flytta-verktyget i DXF-redigeringen: ' + JSON.stringify({ ghost, P0, Q }));
    await page.keyboard.press('Control+z'); await page.waitForTimeout(100);
    if (JSON.stringify(await pts()) !== JSON.stringify(P0)) fail('Ctrl+Z efter Flytta-verktyget');
    const n0 = await page.evaluate(() => l3d.ents.filter(e => !e.del).length);
    await click(P0[0][0], P0[0][1]); await click(6512353, 150118.5, 'Control');
    const n1 = await page.evaluate(() => l3d.ents.filter(e => !e.del).length);
    if (n1 !== n0 + 1 || JSON.stringify(await pts()) !== JSON.stringify(P0)) fail('Flytta med Ctrl ska kopiera: ' + JSON.stringify({ n0, n1 }));
    await page.keyboard.press('Control+z'); await page.waitForTimeout(100);
    await page.evaluate(id => { l3d.sel = new Set([id]); l3dRebuild(); }, L1);
    // Vrid 90° runt första punkten: vridpunkt, utgångsriktning åt öster, ny riktning åt norr.
    await page.evaluate(() => l3SetTool('rotate'));
    await click(P0[0][0], P0[0][1]); await click(P0[0][0] + 4, P0[0][1] - 1.3); await click(P0[0][0] + 1.3, P0[0][1] + 4);
    Q = await pts();
    const ex = [P0[0][0] - (P0[2][1] - P0[0][1]), P0[0][1] + (P0[2][0] - P0[0][0])];
    if (Math.abs(Q[0][0] - P0[0][0]) > 1e-6 || Math.abs(Q[2][0] - ex[0]) > 1e-3 || Math.abs(Q[2][1] - ex[1]) > 1e-3) fail('Vrid-verktyget i DXF-redigeringen: ' + JSON.stringify({ P0, Q, ex }));
    await page.keyboard.press('Control+z'); await page.waitForTimeout(100);
    await page.evaluate(() => l3SetTool('select'));
  }
  // Ny text: tryck på marken (svaret på frågan är 4D-RITAT), ändra text, höjd och vinkel.
  await page.click('#v3DxText');
  await click(6512352, 150124); await page.waitForTimeout(250);
  const t1 = await page.evaluate(() => { const t = l3d.texts.find(x => x.added); return t && { s: t.s, x: t.x, sel: l3d.sel.has(t.id), meshes: l3d.tmeshes.length }; });
  if (!t1 || t1.s !== '4D-RITAT' || Math.abs(t1.x - 6512352) > 0.1 || !t1.sel || !t1.meshes) fail('Ny text: ' + JSON.stringify(t1));
  await page.click('#v3DxSel');
  await page.fill('#v3DxTs', 'NY TEXT'); await page.fill('#v3DxTh', '0,8'); await page.fill('#v3DxTr', '45'); await page.click('#v3DxTApply');
  const t2 = await page.evaluate(() => { const t = l3d.texts.find(x => x.added); return { s: t.s, h: t.h, rot: t.rot }; });
  if (t2.s !== 'NY TEXT' || t2.h !== 0.8 || t2.rot !== 45) fail('Ändra texten: ' + JSON.stringify(t2));
  // Tryck på texten markerar den.
  await page.evaluate(() => { l3d.sel = new Set(); l3dRebuild(); });
  const tc2 = await page.evaluate(() => { const t = l3d.texts.find(x => x.added), q = l3dTextQuads(t)[0], cx = q.reduce((a, p) => a + p[0], 0) / 4, cy = q.reduce((a, p) => a + p[1], 0) / 4; return [cx, cy]; });
  await click(tc2[0], tc2[1]);
  if (!(await page.evaluate(() => l3dSelTexts().length === 1))) fail('Tryck på texten ska markera den');
  // Spara: texten med innehåll, höjd och vinkel finns i den nya DXF:en.
  await page.click('#v3DxSave');
  await page.waitForFunction(() => !l3d.rec && cads().length === 3, null, { timeout: 15000 });
  const tx3 = await page.evaluate(() => ({ dxf: window.__upText, rec: cads()[cads().length - 1] }));
  if (!/\nTEXT\r?\n[\s\S]*\nNY TEXT\r?\n/.test(tx3.dxf) || !/\n 40\r?\n0\.800\r?\n|\n40\r?\n0\.800\r?\n/.test(tx3.dxf) || !/\n50\r?\n45\.000\r?\n/.test(tx3.dxf) || tx3.rec.stats.texts !== 1)
    fail('Texten i den sparade DXF:en: ' + JSON.stringify({ stats: tx3.rec.stats, snippet: (tx3.dxf.match(/TEXT[\s\S]{0,200}/) || [''])[0] }));

  // Mät: Skift ger var 5:e grad, måtten ligger kvar och kan sparas i projektet.
  await page.evaluate(() => l3SetTool('measure'));
  await click(6512348, 150116);
  await click(6512358, 150116.4, 'Shift');
  await page.evaluate(() => l3SetTool('select'));
  const m1 = await page.evaluate(() => ({ n: l3m.list.length, text: l3m.list[0] && l3m.list[0].text, dy: l3m.list[0] && l3m.list[0].pts[1][1] - l3m.list[0].pts[0][1], lbl: document.querySelectorAll('.v3-meas-keep').length }));
  if (m1.n !== 1 || !/^10(,0\d)? m$/.test(m1.text) || Math.abs(m1.dy) > 2e-3 || m1.lbl !== 1) fail('Mått med Skift och kvar efter verktygsbyte: ' + JSON.stringify(m1));
  await page.evaluate(() => l3SetTool('measure'));
  await page.click('#v3MeasBtn');
  await page.click('#v3MeasSave');
  await page.waitForFunction(() => l3m.list.every(x => x.saved), null, { timeout: 10000 });
  const saved = JSON.parse(gh.get('projects/p1/plan_measures.json') || '[]');
  if (saved.length !== 1 || saved[0].text !== m1.text || saved[0].plan !== 'A') fail('Måtten ska sparas i projektet: ' + JSON.stringify(saved));
  await page.evaluate(() => { l3m.loaded = false; l3m.list = []; return l3mLoad(); });
  if ((await page.evaluate(() => l3m.list.length)) !== 1) fail('Sparade mått ska läsas in igen');
  // Måtten under fliken Kommentarer, med detaljer (vågrätt, höjd, lutning, objekt, koordinater).
  await page.click('#v3MeasBtn').catch(() => {}); await page.evaluate(() => l3mShowInTab()); await page.waitForTimeout(150);
  const mt = await page.evaluate(() => ({ tab: !document.getElementById('v3PalComments').classList.contains('hidden'), rows: document.querySelectorAll('#v3MeasSec [data-mzoom]').length, sub: (document.querySelector('#v3MeasSec .v3-kc-b em') || {}).textContent, objs: l3m.list[0].objs }));
  if (!mt.tab || mt.rows !== 1 || !/vågrätt 10/.test(mt.sub || '')) fail('Måtten under Kommentarer: ' + JSON.stringify(mt));
  await page.click('#v3MeasSec [data-mexp]');
  const dl = await page.evaluate(() => [...document.querySelectorAll('#v3MeasSec .v3-mdl dt')].map(x => x.textContent));
  if (!dl.includes('Vågrätt') || !dl.includes('Lutning') || !dl.some(x => /Punkt 2/.test(x)) || !dl.includes('Mätt av')) fail('Måttets detaljer: ' + JSON.stringify(dl));
  // Kommentar på måttet: syns i 3D först när Visa i 3D är ibockad.
  await page.fill('#v3MeasSec [data-mnote]', 'Mått mellan fundament'); await page.press('#v3MeasSec [data-mnote]', 'Enter'); await page.waitForTimeout(150);
  const lb1 = await page.evaluate(() => document.querySelector('.v3-meas-keep').textContent);
  await page.check('#v3MeasSec [data-mshow]'); await page.waitForTimeout(300);
  const lb2 = await page.evaluate(() => document.querySelector('.v3-meas-keep').textContent);
  const savedN = JSON.parse(gh.get('projects/p1/plan_measures.json') || '[]')[0] || {};
  if (/fundament/.test(lb1) || !/^10(,0\d)? m – Mått mellan fundament$/.test(lb2) || savedN.note !== 'Mått mellan fundament' || savedN.showNote !== true) fail('Kommentar på måttet: ' + JSON.stringify({ lb1, lb2, savedN }));
  // Exportera måtten som IFC till TC – med och utan kommentarer.
  const mex = await page.evaluate(async () => {
    const out = []; const orig = askOpener;
    askOpener = async (type, extra, t, p) => { if (type === 'tcUpload') { out.push({ name: extra.files[0].name, folder: extra.folder, bytes: new Uint8Array(await extra.files[0].arrayBuffer()) }); return { uploaded: 1, folder: extra.folder }; } return orig(type, extra, t, p); };
    l3SetPref('measExpNotes', true); await l3mExportIfc();
    l3SetPref('measExpNotes', false); await l3mExportIfc([l3m.list[0].id]);
    l3SetPref('measExpNotes', true); askOpener = orig;
    const api = await ifcmLoad(); let meshes = 0;
    const id = api.OpenModel(out[0].bytes, { COORDINATE_TO_ORIGIN: false }); api.StreamAllMeshes(id, () => { meshes++; }); api.CloseModel(id);
    window.__mexBytes = out[0].bytes;
    const t = out.map(o => new TextDecoder().decode(o.bytes));
    return { names: out.map(o => o.name), folder: out[0].folder, meshes, with: /fundament/i.test(t[0]), without: /fundament/i.test(t[1]), props: /'Lutning'/.test(t[0]) && /'Punkt 2'/.test(t[0]) };
  });
  if (mex.names.length !== 2 || mex.names[0] === mex.names[1] || !/^Mått Plan 1 \d{4}-\d\d-\d\d kl \d\d\.\d\d\.\d\d\.ifc$/.test(mex.names[0]) || mex.folder !== 'Lägesplan' || mex.meshes < 3 || !mex.with || mex.without || !mex.props) fail('Exportera måtten som IFC: ' + JSON.stringify(mex));
  if (process.env.SHOTX) {
    if (process.env.SHOTOFF) await page.evaluate(() => { window.__shotOff = true; });
    await page.evaluate(async () => {
      if (window.__shotOff) { const mm = l3m.list[0]; mm.off = 1.5; let up = null; const o0 = askOpener; askOpener = async (t, ex) => { if (t === 'tcUpload') { up = new Uint8Array(await ex.files[0].arrayBuffer()); return { uploaded: 1 }; } return o0(t, ex); }; await l3mExportIfc([mm.id]); askOpener = o0; window.__mexBytes = up; mm.off = 0; }
      const bytes = window.__mexBytes, orig = askOpener;
      askOpener = async (type, extra, t, p) => (type === 'tcFile' && extra.fileId === 'MIFC' ? { bytes: bytes.slice().buffer } : orig(type, extra, t, p));
      l3mToggle(false);
      await l3bLoad([{ id: 'f:MIFC', fileId: 'MIFC', name: 'Matt.ifc', version: 'm1' }]);
      askOpener = orig;
      const m = l3m.list[0], c = new THREE.Vector3((m.pts[0][0] + m.pts[1][0]) / 2 - l3.O[0], (m.pts[0][1] + m.pts[1][1]) / 2 - l3.O[1], m.pts[0][2] - l3.O[2] + 0.5);
      l3StopFly(); l3.orbit.target.copy(c); l3.camera.position.copy(c).add(window.__shotOff ? new THREE.Vector3(3, -9, 4) : new THREE.Vector3(0.6, -3.2, 0.4)); l3.orbit.update();
    });
    await page.waitForTimeout(900); await page.screenshot({ path: process.env.SHOTX });
    await page.evaluate(() => { l3bRemove('f:MIFC'); l3mToggle(true); });
  }
  const un = await page.evaluate(() => [tcUniqueName('X 1.ifc'), tcUniqueName('X 1.ifc'), tcUniqueName('x 1.IFC')]);
  if (un.join('|') !== 'X 1.ifc|X 1 (2).ifc|x 1 (3).IFC') fail('Unika filnamn till TC: ' + un.join('|'));
  // Visa/dölj alla måttkommentarer.
  await page.click('#v3MeasNotesOff'); await page.waitForTimeout(150);
  const nOff = await page.evaluate(() => ({ s: l3m.list[0].showNote, lbl: document.querySelector('.v3-meas-keep').textContent }));
  await page.click('#v3MeasNotesOn'); await page.waitForTimeout(150);
  const nOn = await page.evaluate(() => ({ s: l3m.list[0].showNote, lbl: document.querySelector('.v3-meas-keep').textContent }));
  if (nOff.s !== false || /fundament/.test(nOff.lbl) || nOn.s !== true || !/fundament/.test(nOn.lbl)) fail('Visa/dölj alla måttkommentarer: ' + JSON.stringify({ nOff, nOn }));
  // Markera måttet genom att trycka på texten och dra måttlinjen uppåt – fästpunkterna sitter kvar.
  await page.evaluate(() => { l3SetTool('select'); const m = l3m.list[0], c = new THREE.Vector3((m.pts[0][0] + m.pts[1][0]) / 2 - l3.O[0], (m.pts[0][1] + m.pts[1][1]) / 2 - l3.O[1], m.pts[0][2] - l3.O[2]); l3StopFly(); l3.orbit.target.copy(c); l3.camera.position.copy(c).add(new THREE.Vector3(2, -18, 7)); l3.orbit.update(); l3Render(); });
  await page.waitForTimeout(300);
  const lb0 = await page.evaluate(() => { const r = document.querySelector('.v3-meas-keep').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, pts: JSON.stringify(l3m.list[0].pts) }; });
  await page.mouse.move(lb0.x, lb0.y); await page.mouse.down(); await page.mouse.move(lb0.x, lb0.y - 60, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(400);
  const dr = await page.evaluate(() => { const r = document.querySelector('.v3-meas-keep').getBoundingClientRect(); return { y: r.top + r.height / 2, off: l3m.list[0].off, sel: l3m.sel.has(l3m.list[0].id), cls: document.querySelector('.v3-meas-keep').className, pts: JSON.stringify(l3m.list[0].pts), lines: l3.groups.measKeep.children.filter(o => o.isLine).length }; });
  const svOff = (JSON.parse(gh.get('projects/p1/plan_measures.json') || '[]')[0] || {}).off;
  if (!(dr.off > 0.5) || !dr.sel || !/ sel/.test(dr.cls) || dr.pts !== lb0.pts || dr.y > lb0.y - 30 || dr.lines !== 3 || Math.abs(svOff - dr.off) > 1e-6) fail('Dra måttlinjen uppåt: ' + JSON.stringify({ lb0, dr, svOff }));
  if (process.env.SHOTD) await page.screenshot({ path: process.env.SHOTD });
  await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
  if (await page.evaluate(() => l3m.list[0].off)) fail('Ctrl+Z ska ta tillbaka måttlinjen');
  // Polylinje dras upp på samma sätt (Victor 2026-10-10): hela kedjan och texten följer med, hjälplinje från varje punkt.
  {
    const id = await page.evaluate(() => { const m0 = l3m.list[0], v = m0.pts.map(p => new THREE.Vector3(p[0] - l3.O[0], p[1] - l3.O[1], p[2] - l3.O[2])); const mid = v[0].clone().lerp(v[1], 0.5).add(new THREE.Vector3(0, 3, 0)); const m = l3mAdd('poly', [v[0], mid, v[1]], 'poly'); l3Render(); return m.id; });
    await page.waitForTimeout(250);
    const q0 = await page.evaluate(id => { const el = document.querySelector(`.v3-meas-keep[data-mid="${id}"]`), r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, drag: el.classList.contains('drag') }; }, id);
    await page.mouse.move(q0.x, q0.y); await page.mouse.down(); await page.mouse.move(q0.x, q0.y - 60, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(300);
    const q1 = await page.evaluate(id => { const m = l3m.list.find(x => x.id === id), el = document.querySelector(`.v3-meas-keep[data-mid="${id}"]`), r = el.getBoundingClientRect(); return { off: m.off, y: r.top + r.height / 2, dz: l3mDimPts(m).map((p, i) => p[2] - m.pts[i][2]), ifc: (l3mIfcBuild([{ m, nr: 1 }], false).text || '').length }; }, id);
    if (!q0.drag || !(q1.off > 0.5) || q1.y > q0.y - 30 || q1.dz.some(d => Math.abs(d - q1.off) > 1e-6) || q1.ifc < 500) fail('Polylinjen ska gå att dra upp: ' + JSON.stringify({ q0, q1 }));
    await page.evaluate(id => { l3mRemove(id); l3m.sel = new Set(); l3mDraw(); }, id);
  }
  // Dra i en ändpunkt: måttet räknas om; Ctrl+Z ångrar. Låst mått: inga handtag, går inte att ta bort.
  {
    await page.evaluate(() => { l3m.sel = new Set([l3m.list[0].id]); l3mDraw(); l3Render(); }); await page.waitForTimeout(200);
    const h = await page.evaluate(() => [...document.querySelectorAll('.v3-mhandle')].filter(b => b.style.display !== 'none').map(b => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }));
    if (h.length !== 2) fail('Ändpunkternas handtag: ' + JSON.stringify(h));
    const t0 = await page.evaluate(() => ({ text: l3m.list[0].text, p0: l3m.list[0].pts[0].slice() }));
    await page.mouse.move(h[1][0], h[1][1]); await page.mouse.down(); await page.mouse.move(h[1][0] - 120, h[1][1] + 10, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(300);
    const t1 = await page.evaluate(() => ({ text: l3m.list[0].text, p0: l3m.list[0].pts[0].slice(), d: Math.hypot(l3m.list[0].pts[1][0] - l3m.list[0].pts[0][0], l3m.list[0].pts[1][1] - l3m.list[0].pts[0][1]) }));
    if (t1.text === t0.text || t1.p0.join() !== t0.p0.join() || !(t1.d < 9.5)) fail('Dra ändpunkten: ' + JSON.stringify({ t0, t1 }));
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
    if ((await page.evaluate(() => l3m.list[0].text)) !== t0.text) fail('Ctrl+Z ska ta tillbaka ändpunkten');
    await page.click('#v3MeasSec [data-mlock]'); await page.waitForTimeout(300);
    const lk = await page.evaluate(() => ({ locked: l3m.list[0].locked, handles: [...document.querySelectorAll('.v3-mhandle')].filter(b => b.style.display !== 'none').length, delDis: document.querySelector('#v3MeasSec [data-mdel]').disabled, cls: document.querySelector('.v3-meas-keep').className }));
    const l3mRemoveTry = await page.evaluate(() => { l3mRemove(l3m.list[0].id); return l3m.list.length; });
    const savedL = (JSON.parse(gh.get('projects/p1/plan_measures.json') || '[]')[0] || {}).locked;
    if (!lk.locked || lk.handles || !lk.delDis || !/locked/.test(lk.cls) || l3mRemoveTry !== 1 || savedL !== true) fail('Låst mått: ' + JSON.stringify({ lk, l3mRemoveTry, savedL }));
    await page.click('#v3MeasSec [data-mlock]'); await page.waitForTimeout(200);
    if (await page.evaluate(() => l3m.list[0].locked)) fail('Lås upp måttet');
  }
  if (process.env.SHOTM) await page.screenshot({ path: process.env.SHOTM });
  await page.evaluate(() => l3SetTool('select'));

  // Polylinje-mått: punkt för punkt, Enter avslutar; längden längs vägen och delsträckorna.
  {
    await page.evaluate(() => { l3SetTool('measure'); l3SetPref('measure', 'poly'); l3RenderSnapBar(); l3SetPref('snaps', { ...l3Snaps(), end: false, mid: false, edge: false, axis: false, perp: false }); });
    await click(6512341, 150127); await click(6512344, 150127); await click(6512344, 150131);
    await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    const pl = await page.evaluate(() => { const m = l3m.list[l3m.list.length - 1]; return { kind: m.kind, n: m.pts.length, text: m.text, rows: l3mInfo(m).rows.map(r => r[0]) }; });
    if (pl.kind !== 'poly' || pl.n !== 3 || !/^7(,0\d)? m$/.test(pl.text) || !pl.rows.includes('Delsträcka 2')) fail('Polylinje-mått: ' + JSON.stringify(pl));
    await page.evaluate(() => { l3mRemove(l3m.list[l3m.list.length - 1].id); l3SetPref('measure', 'dist'); l3SetPref('snaps', { ...l3Snaps(), end: true, mid: true, edge: true, axis: true, perp: true }); l3SetTool('select'); });
  }
  // Punkt (X/Y/Z) och Volym (basyta + höjd i rutan, eller till en yta).
  {
    await page.evaluate(() => { l3SetTool('measure'); l3SetPref('measure', 'point'); l3RenderSnapBar(); l3SetPref('snaps', { ...l3Snaps(), end: false, mid: false, edge: false, axis: false, perp: false }); });
    await click(6512342, 150128);
    const pt = await page.evaluate(() => { const m = l3m.list[l3m.list.length - 1]; return { kind: m.kind, text: m.text, lbl: document.querySelector(`.v3-meas-keep[data-mid="${m.id}"]`).className }; });
    if (pt.kind !== 'point' || !/^X 6\s?512\s?34[12](,\d+)? m \| Y 150\s?12[78](,\d+)? m \| Z /.test(pt.text.replace(/\u00a0/g, ' ')) || !/\bpt\b/.test(pt.lbl)) fail('Punkt-mått: ' + JSON.stringify(pt));
    await page.evaluate(() => { l3mRemove(l3m.list[l3m.list.length - 1].id); l3SetPref('measure', 'volume'); l3RenderSnapBar(); });
    await click(6512341, 150127); await click(6512345, 150127); await click(6512345, 150130); await click(6512341, 150130);
    await page.keyboard.press('Enter'); await page.waitForSelector('#v3VolDlg');
    await page.fill('#v3VolH', '2'); await page.click('#v3VolOk'); await page.waitForTimeout(150);
    const vo = await page.evaluate(() => { const m = l3m.list[l3m.list.length - 1]; return { kind: m.kind, h: m.h, text: m.text, rows: l3mInfo(m).rows.map(r => r[0]) }; });
    if (vo.kind !== 'volume' || vo.h !== 2 || !/^2[34](,\d+)? m³$/.test(vo.text) || !vo.rows.includes('Basyta (i plan)')) fail('Volym-mått: ' + JSON.stringify(vo));
    await page.evaluate(() => { l3mRemove(l3m.list[l3m.list.length - 1].id); l3SetPref('measure', 'dist'); l3SetPref('snaps', { ...l3Snaps(), end: true, mid: true, edge: true, axis: true, perp: true }); l3SetTool('select'); });
  }
  // Dolda mått: ett nytt mått syns ändå, de gamla förblir dolda. Delete tar bort ett markerat mått.
  {
    await page.evaluate(() => { l3SetTool('select'); l3mToggle(false); });
    const n0 = await page.evaluate(() => l3m.list.length);
    await page.evaluate(() => l3SetTool('measure'));
    await click(6512341, 150126); await click(6512346, 150126);
    await page.evaluate(() => l3SetTool('select'));
    const hv = await page.evaluate(() => ({ n: l3m.list.length, labels: [...document.querySelectorAll('.v3-meas-keep')].map(e => e.dataset.mid), last: l3m.list[l3m.list.length - 1].id, oldHid: l3m.list.slice(0, -1).every(m => m.hid) }));
    if (hv.n !== n0 + 1 || hv.labels.length !== 1 || hv.labels[0] !== hv.last || !hv.oldHid) fail('Nytt mått ska synas fast måtten är dolda: ' + JSON.stringify(hv));
    await page.evaluate(id => { l3m.sel = new Set([id]); l3mDraw(); }, hv.last);
    await page.keyboard.press('Delete'); await page.waitForTimeout(150);
    if ((await page.evaluate(() => l3m.list.length)) !== n0) fail('Delete ska ta bort det markerade måttet');
    await page.keyboard.press('Control+z'); await page.waitForTimeout(150);
    if ((await page.evaluate(() => l3m.list.length)) !== n0 + 1) fail('Ctrl+Z ska ta tillbaka måttet');
    await page.evaluate(id => { l3mRemove(id); l3mToggle(true); }, hv.last);
  }
  // Historiken kan nålas fast som utfälld.
  await page.keyboard.press('F2'); await page.waitForTimeout(100);
  await page.click('#v3Log [data-log="pin"]');
  if (!(await page.evaluate(() => l3Prefs().logPin)) || await page.isHidden('#v3Log')) fail('Nåla fast historiken');

  if (process.env.SHOT) { await page.waitForTimeout(300); await page.screenshot({ path: process.env.SHOT }); }
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3ddxf');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
