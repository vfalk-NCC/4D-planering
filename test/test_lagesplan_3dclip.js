// Saxen i 3D (dragbart handtag, snittkanter, släpps vid verktygsbyte), fäst mot DXF (3D först),
// DXF-texter i 3D och egna kortkommandon i snabbsöket (Victor 2026-10-10).
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9004;
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
    cadGeom.set('c1', buildCadGeom({ origin: [6512350, 150120], groups: [{ l: 0, c: '#ff0000', p: [[0, 0, 10000, 0, 10000, 5000]], t: [[2000, 2000, 500, 0, 'A12', 'lb'], [4000, 2000, 500, 90, 'K10\nFUND', 'cm']] }, { l: 1, c: '#0000ff', p: [[0, 1000, 2000, 1000]], t: [] }] }));
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    window.__calls = [];
    askOpener = async (type, extra) => {
      window.__calls.push([type, extra && (extra.fileId || extra.folderId) || null]);
      if (type === 'tcFolder' && !extra.folderId) return { folderId: 'root', projectName: 'Kvarteret', items: [{ id: 'f1', name: 'CAD', type: 'folder' }] };
      if (type === 'tcFolder' && extra.folderId === 'f1') return { folderId: 'f1', items: [{ id: 'D1', name: 'Grund.dxf', type: 'file', size: 300 }, { id: 'P1', name: 'Plan.pdf', type: 'file', size: 10 }] };
      if (type === 'tcFile' && extra.fileId === 'D1') return { bytes: new TextEncoder().encode(grund).buffer };
      if (type === 'tcUpload') { window.__calls.push(['upload', extra.files.map(f => f.name).join()]); return { uploaded: 1 }; }
      return {};
    };
  }, DXF('GRUND'));
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  await page.waitForFunction(() => l3.groups.cad && l3.groups.cad.children.length >= 3, null, { timeout: 10000 });


  await page.waitForTimeout(400);
  // DXF-texter: en mesh med tecken ur en atlas (två texter, tre rader).
  const tx = await page.evaluate(() => { const m = l3.groups.cad.children.filter(o => o.userData.cadText === 'c1'); return { meshes: m.length, quads: m.reduce((a, x) => a + x.geometry.getIndex().count / 6, 0), n: l3s.text.get('c1').n, vis: m.every(x => x.visible), w: m[0] && m[0].material.map.image.width }; });
  if (tx.meshes !== 1 || tx.quads !== 3 || tx.n !== 3 || !tx.vis || tx.w !== 4096) fail('DXF-texter i 3D: ' + JSON.stringify(tx));
  // Texten A12: 0,5 m hög, vänster-bas vid (6512352, 150122).
  const a12 = await page.evaluate(() => { const m = l3.groups.cad.children.find(o => o.userData.cadText === 'c1'), p = m.geometry.getAttribute('position'); let x0 = 1e9, y0 = 1e9, y1 = -1e9; for (let i = 0; i < 4; i++) { x0 = Math.min(x0, p.getX(i)); y0 = Math.min(y0, p.getY(i)); y1 = Math.max(y1, p.getY(i)); } return { x0: x0 + l3.O[0], y0: y0 + l3.O[1], h: y1 - y0 }; });
  if (Math.abs(a12.x0 - 6512352) > 0.05 || a12.y0 > 150122 || a12.y0 < 150121.5 || a12.h < 0.5 || a12.h > 1) fail('Textens läge och storlek: ' + JSON.stringify(a12));
  // Släcks med sitt CAD-lager.
  await page.evaluate(() => { setLayersVisible(['cadl:c1:AXLAR'], false); return l3sBuildCad(); });
  if ((await page.evaluate(() => l3s.text.get('c1').n)) !== 0) fail('Texterna ska släckas med CAD-lagret');
  await page.evaluate(() => { setLayersVisible(['cadl:c1:AXLAR'], true); return l3sBuildCad(); });

  // Fäst mot DXF: rakt uppifrån, mätverktyget nära linjens hörn (ingen 3D där) -> ändpunkt (DXF).
  await page.evaluate(() => { l3StopFly(); const c = new THREE.Vector3(6512355 - l3.O[0], 150122 - l3.O[1], 0); l3.camera.position.set(c.x, c.y - 0.01, 40); l3.orbit.target.copy(c); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); l3SetTool('measure'); });
  const cv = await page.locator('#v3Canvas canvas').boundingBox();
  const [ex, ey] = await page.evaluate(() => { const q = l3ToScreen(new THREE.Vector3(6512360 - l3.O[0], 150120 - l3.O[1], l3sZ() + 0.03)); return [q.x, q.y]; });
  const snap = await page.evaluate(([x, y]) => { const r = l3.renderer.domElement.getBoundingClientRect(); const s = l3Snap({ clientX: r.left + x + 5, clientY: r.top + y + 4 }); return s && { kind: s.kind, dxf: !!s.dxf, x: s.point.x + l3.O[0], y: s.point.y + l3.O[1] }; }, [ex, ey]);
  if (!snap || !snap.dxf || snap.kind !== 'end' || Math.abs(snap.x - 6512360) > 1e-3 || Math.abs(snap.y - 150120) > 1e-3) fail('Fäst mot DXF:ens hörn: ' + JSON.stringify(snap));
  await page.mouse.move(cv.x + ex + 5, cv.y + ey + 4); await page.waitForTimeout(150);
  if (!/DXF/.test(await page.evaluate(() => (document.querySelector('.v3-snap') || document.querySelector('[class*="snapmark"]') || { textContent: '' }).textContent + [...document.querySelectorAll('#v3Canvas *')].filter(e => /\(DXF\)/.test(e.textContent) && e.children.length <= 2).length))) fail('Fästmarkören ska visa (DXF)');

  // Saxen: Snitt-knappen, byte till Flytta släpper saxen.
  await page.click('#v3ClipBtn');
  if (!(await page.evaluate(() => l3.clipPick))) fail('Snitt ska vänta på en yta');
  await page.evaluate(() => l3SetTool('move'));
  if (await page.evaluate(() => l3.clipPick || l3.renderer.domElement.style.cursor === 'crosshair')) fail('Saxen ska släppas när man byter till Flytta');
  await page.evaluate(() => l3SetTool('select'));
  // Vågrätt snitt: saxen syns i bilden och dras.
  await page.evaluate(() => { l3.camera.position.set(l3.orbit.target.x + 30, l3.orbit.target.y - 30, l3.orbit.target.z + 20); l3.orbit.update(); l3ClipHorizontal(); });
  await page.waitForSelector('#view3d .v3-scissor', { timeout: 5000 });
  const sh = await page.evaluate(() => ({ lam: /l3Edge/.test(THREE.ShaderLib.lambert.fragmentShader), off: l3.clips[0].off }));
  if (!sh.lam) fail('Snittkanterna ska finnas i shadern');
  const sc = await page.locator('#view3d .v3-scissor').boundingBox();
  const z0 = await page.evaluate(() => l3.clips[0].plane.coplanarPoint(new THREE.Vector3()).z);
  await page.mouse.move(sc.x + sc.width / 2, sc.y + sc.height / 2); await page.mouse.down();
  await page.mouse.move(sc.x + sc.width / 2 + 30, sc.y + sc.height / 2 + 60, { steps: 5 });
  const mid = await page.evaluate(() => ({ plane: !!l3c.plane, off: l3.clips[0].off }));
  await page.mouse.up(); await page.waitForTimeout(100);
  const after = await page.evaluate(() => ({ plane: !!l3c.plane, off: l3.clips[0].off, slider: Number(document.querySelector('#v3Clip [data-clipoff="0"]').value), lbl: document.querySelector('#view3d .v3-scissor span').textContent }));
  if (!mid.plane || after.plane || Math.abs(after.off) < 0.2 || Math.abs(after.slider - after.off) > 1e-6 || !/m$/.test(after.lbl)) fail('Dra i saxen: ' + JSON.stringify({ mid, after }));
  // Ner i bilden = planet sänks (Victor 2026-10-10: "när jag drar saxen nedåt så går den uppåt"), och saxen
  // ligger kvar där musen släpptes.
  const z1 = await page.evaluate(() => l3.clips[0].plane.coplanarPoint(new THREE.Vector3()).z);
  const sc2 = await page.locator('#view3d .v3-scissor').boundingBox();
  if (!(z1 < z0 - 0.2)) fail('Dra nedåt ska sänka snittet: ' + JSON.stringify({ z0, z1 }));
  if (Math.abs(sc2.x + sc2.width / 2 - (sc.x + sc.width / 2 + 30)) > 4 || Math.abs(sc2.y + sc2.height / 2 - (sc.y + sc.height / 2 + 60)) > 4) fail('Saxen ska ligga där den släpptes: ' + JSON.stringify({ sc, sc2 }));
  await page.evaluate(() => { l3.camera.position.x += 3; l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); });
  await page.waitForTimeout(100);
  const sc3 = await page.evaluate(() => { const c = l3.clips[0], q = l3ToScreen(c.anchor); return Math.abs(c.plane.distanceToPoint(c.anchor)); });
  if (sc3 > 1e-6) fail('Saxen ska ligga kvar i snittplanet');
  // Högerklick på saxen: Ta bort snittet.
  const scm = await page.locator('#view3d .v3-scissor').boundingBox();
  await page.mouse.click(scm.x + scm.width / 2, scm.y + scm.height / 2, { button: 'right' }); await page.waitForTimeout(150);
  if (!(await page.isVisible('#v3Ctx [data-cc="del"]'))) fail('Högerklick på saxen ska visa Ta bort snittet');
  await page.click('#v3Ctx [data-cc="del"]'); await page.waitForTimeout(150);
  if (await page.evaluate(() => l3.clips.length || document.querySelectorAll('#view3d .v3-scissor').length)) fail('Snittet och saxen ska vara borta');
  await page.evaluate(() => l3ClearClips());
  if (await page.$('#view3d .v3-scissor')) { await page.waitForTimeout(100); if (await page.evaluate(() => document.querySelectorAll('#view3d .v3-scissor').length)) fail('Saxen ska försvinna med snittet'); }

  // Egna kortkommandon i snabbsöket: ⌨ vid Vy uppifrån, Ctrl+Skift+U, kör det.
  await page.evaluate(() => l3OpenLaunch());
  await page.fill('#v3LaunchQ', 'uppifrån');
  await page.click('#v3LaunchList [data-lk="0"]');
  await page.keyboard.press('Control+Shift+U');
  const kb = await page.evaluate(() => ({ own: l3Prefs().keys, kbd: (document.querySelector('#v3LaunchList kbd.own') || {}).textContent }));
  if (kb.own['Vy uppifrån'] !== 'Ctrl+Skift+U' || kb.kbd !== 'Ctrl+Skift+U') fail('Eget kortkommando: ' + JSON.stringify(kb));
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  await page.evaluate(() => { document.activeElement && document.activeElement.blur(); l3.camera.position.set(l3.orbit.target.x + 30, l3.orbit.target.y - 30, l3.orbit.target.z + 20); l3.orbit.update(); });
  await page.keyboard.press('Control+Shift+U'); await page.waitForTimeout(900);
  const top = await page.evaluate(() => { const d = l3.camera.position.clone().sub(l3.orbit.target).normalize(); return d.z; });
  if (top < 0.95) fail('Ctrl+Skift+U ska ge vy uppifrån: ' + top);

  // Rotation hela vägen: under horisonten går nu (underifrån).
  const rot = await page.evaluate(() => { l3StopFly(); const T = l3.orbit.target.clone(); l3.camera.position.set(T.x, T.y - 30, T.z + 20); l3.orbit.update(); for (let i = 0; i < 30; i++) l3OrbitAbout(T, 0, -0.1); return { max: l3.orbit.maxPolarAngle, below: l3.camera.position.z < T.z }; });
  if (rot.max < 3 || !rot.below) fail('Vrid ska gå under horisonten: ' + JSON.stringify(rot));
  // En sparad vy med snitt öppnar inte snittfönstret.
  const sv = await page.evaluate(() => {
    l3ClipHorizontal(); l3DlgClose('v3Clip'); l3SaveView('Snittvy'); l3.clips = []; l3ApplyClips();
    const i = l3SavedViews().findIndex(v => v.name === 'Snittvy'); l3GoView(i);
    const d = document.getElementById('v3Clip');
    return { clips: l3.clips.length, dlg: !!(d && !d.classList.contains('hidden')), scissors: document.querySelectorAll('#view3d .v3-scissor').length };
  });
  await page.waitForTimeout(600);
  if (sv.clips !== 1 || sv.dlg) fail('En sparad vy med snitt ska inte öppna snittfönstret: ' + JSON.stringify(sv));
  await page.evaluate(() => { l3.clips = []; l3ApplyClips(); });

  // Kommentar: högerklick på marken -> Kommentar här… -> popup med dagens datum, spara, svara, klar.
  await page.evaluate(() => { l3StopFly(); const c = new THREE.Vector3(6512355 - l3.O[0], 150122 - l3.O[1], 0); l3.camera.position.set(c.x, c.y - 0.01, 40); l3.orbit.target.copy(c); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); });
  const cv2 = await page.locator('#v3Canvas canvas').boundingBox();
  await page.mouse.click(cv2.x + cv2.width / 2, cv2.y + cv2.height / 2, { button: 'right' }); await page.waitForTimeout(150);
  await page.click('#v3Ctx [data-ctx="comment"]');
  await page.waitForSelector('#v3CPop #v3CText');
  const meta = await page.textContent('#v3CPop .v3-cpop-meta');
  const today = new Date().toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
  if (!meta.includes('Victor') || !meta.includes(today)) fail('Popupen ska visa namn och dagens datum: ' + meta + ' / ' + today);
  await page.fill('#v3CPop #v3CText', 'Kolla schaktet här innan gjutning');
  await page.click('#v3CPop [data-k="save"]');
  await page.waitForFunction(() => l3k.list.length === 1 && l3.groups.csigns && l3.groups.csigns.children.some(o => o.isSprite), null, { timeout: 5000 });
  await page.waitForTimeout(300);
  const saved = JSON.parse(gh.get('projects/p1/plan_comments3d.json') || '[]');
  if (saved.length !== 1 || saved[0].text !== 'Kolla schaktet här innan gjutning' || saved[0].by !== 'Victor' || saved[0].plan !== 'A' || saved[0].target.kind !== 'point') fail('Kommentaren ska sparas: ' + JSON.stringify(saved));
  // Färg på kommentaren (Victor 2026-10-10): i popupen och i fliken Kommentarer.
  await page.evaluate(() => l3kOpen(l3k.list[0]));
  await page.click('#v3CPop [data-kcol="#2563eb"]'); await page.waitForTimeout(300);
  const kcol = await page.evaluate(() => ({ c: l3k.list[0].color, pole: '#' + l3.groups.csigns.children.find(o => o.isLine).material.color.getHexString() }));
  const savedC = JSON.parse(gh.get('projects/p1/plan_comments3d.json') || '[]');
  if (kcol.c !== '#2563eb' || kcol.pole !== '2563eb'.padStart(7, '#') || savedC[0].color !== '#2563eb') fail('Byt färg i popupen: ' + JSON.stringify({ kcol, saved: savedC[0].color }));
  await page.keyboard.press('Escape');
  await page.evaluate(() => l3PalTab('comments'));
  await page.waitForSelector('#v3PalComments .v3-kc');
  const row = await page.evaluate(() => ({ n: document.querySelectorAll('#v3PalComments .v3-kc').length, txt: document.querySelector('#v3PalComments .v3-kc-b b').textContent, bg: getComputedStyle(document.querySelector('#v3PalComments .v3-kc-col i')).backgroundColor }));
  if (row.n !== 1 || !/schaktet/.test(row.txt) || row.bg !== 'rgb(37, 99, 235)') fail('Fliken Kommentarer: ' + JSON.stringify(row));
  await page.$eval('#v3PalComments [data-kccol]', el => { el.value = '#16a34a'; el.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(300);
  if ((await page.evaluate(() => l3k.list[0].color)) !== '#16a34a') fail('Byt färg i listan');
  await page.fill('#v3KQ', 'finns inte'); await page.waitForTimeout(100);
  if (await page.$('#v3PalComments .v3-kc')) fail('Sök ska filtrera kommentarerna');
  await page.fill('#v3KQ', 'schakt'); await page.waitForTimeout(100);
  await page.click('#v3PalComments [data-kcgo]'); await page.waitForTimeout(200);
  if (process.env.SHOT3) await page.screenshot({ path: process.env.SHOT3 });
  if (await page.isVisible('#v3CPop')) fail('Tryck i listan ska bara zooma, inte öppna kommentaren');
  // Ctrl+klick och Skift+klick markerar flera; Exportera markerade tar bara dem.
  await page.fill('#v3KQ', ''); await page.waitForTimeout(100);
  const k0 = await page.evaluate(() => { const c = l3k.list[0]; l3k.list.push({ ...c, id: 'kx2', text: 'Andra kommentaren med en lång text som ska synas helt och inte klippas av i listan', replies: [] }, { ...c, id: 'kx3', text: 'Tredje', replies: [] }); l3kRenderTab(); return l3k.list.length; });
  const k1 = await page.evaluate(() => l3k.list[0].id);
  await page.click(`#v3PalComments [data-kcgo="${k1}"]`);
  await page.click('#v3PalComments [data-kcgo="kx3"]', { modifiers: ['Shift'] });
  let sel = await page.evaluate(() => [...l3kUi.sel].join(','));
  if (sel.split(',').length !== 3) fail('Skift+klick ska markera en rad: ' + sel);
  await page.click('#v3PalComments [data-kcgo="kx2"]', { modifiers: ['Control'] });
  sel = await page.evaluate(() => ({ s: [...l3kUi.sel], n: document.querySelectorAll('#v3PalComments .v3-kc.sel').length, btn: document.querySelector('#v3KIfcSel').textContent, clip: (() => { const b = document.querySelector('#v3PalComments [data-kcgo="kx2"] b'); return b.scrollHeight - b.clientHeight; })() }));
  if (sel.s.length !== 2 || sel.s.includes('kx2') || sel.n !== 2 || !/Exportera markerade \(2\)/.test(sel.btn) || sel.clip > 1) fail('Ctrl+klick avmarkerar: ' + JSON.stringify(sel));
  if (await page.isVisible('#v3CPop')) fail('Markering ska inte öppna kommentaren');
  if (process.env.SHOT5) { await page.screenshot({ path: process.env.SHOT5 }); await page.evaluate(() => l3PalTab('layers')); await page.waitForTimeout(300); await page.screenshot({ path: process.env.SHOT5.replace('.png', '-lager.png') }); await page.evaluate(() => l3PalTab('comments')); await page.waitForTimeout(200); }
  const ksel = await page.evaluate(async () => {
    let up = null; const orig = askOpener;
    askOpener = async (type, extra) => { if (type === 'tcUpload') { up = new TextDecoder().decode(await extra.files[0].arrayBuffer()); return { uploaded: 1, folder: extra.folder }; } return orig(type, extra); };
    document.querySelector('#v3KIfcSel').click(); for (let i = 0; i < 50 && !up; i++) await new Promise(r => setTimeout(r, 50));
    askOpener = orig;
    l3k.list = l3k.list.filter(c => c.id !== 'kx2' && c.id !== 'kx3'); l3kUi.sel.clear(); l3kRenderTab(); l3kDraw();
    return { names: (up.match(/'Kommentar \d+: [^']*'/g) || []).filter(x => !/text'$/.test(x)) };
  });
  // Handtagen: punkten flyttas vågrätt, skylten i höjdled; sparas och Ctrl+Z ångrar.
  {
    const kid = await page.evaluate(() => l3k.list[0].id);
    await page.click(`#v3PalComments [data-kcgo="${kid}"]`); await page.waitForTimeout(1200);
    if (await page.evaluate(() => (l3.camera.getWorldDirection(new THREE.Vector3()).z < -0.97) && getComputedStyle(document.querySelector('.v3-khandle.z')).display !== 'none')) fail('Höjdhandtaget ska döljas rakt uppifrån');
    await page.evaluate(() => { const c = l3k.list[0], P = new THREE.Vector3(c.pos[0] - l3.O[0], c.pos[1] - l3.O[1], c.pos[2] - l3.O[2] + 1); l3StopFly(); l3.orbit.target.copy(P); l3.camera.position.copy(P).add(new THREE.Vector3(-6, -14, 8)); l3.orbit.update(); l3Render(); });
    await page.waitForTimeout(300);
    const h0 = await page.evaluate(() => { const g = s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, d: getComputedStyle(document.querySelector(s)).display }; }; return { xy: g('.v3-khandle.xy'), z: g('.v3-khandle.z'), pos: l3k.list[0].pos.slice(), lift: l3kLift(l3k.list[0]) }; });
    if (h0.xy.d === 'none' || h0.z.d === 'none') fail('Handtagen ska synas för den markerade kommentaren: ' + JSON.stringify(h0));
    await page.mouse.move(h0.xy.x, h0.xy.y); await page.mouse.down(); await page.mouse.move(h0.xy.x + 40, h0.xy.y + 10, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(300);
    const h1 = await page.evaluate(() => ({ pos: l3k.list[0].pos.slice(), sp: (() => { const sp = l3.groups.csigns.children.find(o => o.isSprite && o.userData.commentId === l3k.list[0].id); return [sp.position.x + l3.O[0], sp.position.y + l3.O[1]]; })() }));
    const dxy = Math.hypot(h1.pos[0] - h0.pos[0], h1.pos[1] - h0.pos[1]);
    if (dxy < 0.2 || Math.abs(h1.pos[2] - h0.pos[2]) > 1e-6 || Math.abs(h1.sp[0] - h1.pos[0]) > 0.01) fail('Flytta kommentarens punkt: ' + JSON.stringify({ h0, h1 }));
    // Kommentar på ett objekt: punkten lämnar aldrig objektet (här finns objektet inte under markören – står kvar).
    {
      const t0 = await page.evaluate(() => { const c = l3k.list[0]; c._t = c.target; c.target = { kind: 'item', id: 'finns-inte', name: 'X' }; return c.pos.slice(); });
      const b = await page.evaluate(() => { const r = document.querySelector('.v3-khandle.xy').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await page.mouse.move(b.x, b.y); await page.mouse.down(); await page.mouse.move(b.x + 50, b.y + 20, { steps: 5 });
      const off = await page.evaluate(() => document.querySelector('.v3-khandle.xy').classList.contains('off'));
      await page.mouse.up(); await page.waitForTimeout(200);
      const t1 = await page.evaluate(() => { const c = l3k.list[0]; c.target = c._t; delete c._t; return c.pos.slice(); });
      if (!off || t1.join() !== t0.join()) fail('Punkten ska inte släppa från sitt objekt: ' + JSON.stringify({ off, t0, t1 }));
      if (await page.evaluate(() => typeof l3kSameTarget !== 'function' || !l3kSameTarget({ kind: 'ifc', guid: 'G1' }, { object: {}, point: new THREE.Vector3() }) === false)) fail('l3kSameTarget');
    }
    const zb = await page.evaluate(() => { const r = document.querySelector('.v3-khandle.z').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.move(zb.x, zb.y); await page.mouse.down(); await page.mouse.move(zb.x, zb.y - 40, { steps: 5 }); await page.mouse.up();
    await page.waitForTimeout(300);
    const h2 = await page.evaluate(() => l3k.list[0].lift);
    if (!(h2 > h0.lift + 0.2)) fail('Skyltens höjd: ' + JSON.stringify({ was: h0.lift, now: h2 }));
    const file = JSON.parse(gh.get('projects/p1/plan_comments3d.json') || '[]').find(x => x.id === kid);
    if (!file || Math.abs(file.lift - h2) > 1e-6 || Math.abs(file.pos[0] - h1.pos[0]) > 1e-6) fail('Handtagen ska spara: ' + JSON.stringify(file));
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
    if (Math.abs((await page.evaluate(() => l3k.list[0].lift)) - h0.lift) > 1e-6) fail('Ctrl+Z ska ångra höjden');
    await page.keyboard.press('Control+z'); await page.waitForTimeout(200);
    const back = await page.evaluate(() => l3k.list[0].pos.slice());
    if (Math.abs(back[0] - h0.pos[0]) > 1e-6 || Math.abs(back[1] - h0.pos[1]) > 1e-6) fail('Ctrl+Z ska ångra flytten: ' + JSON.stringify({ back, was: h0.pos }));
    await page.evaluate(() => { l3kUi.sel.clear(); l3kRenderTab(); l3Render(); });
  }
  // Allt som sparas i TC ger en rad i historiken med länk till mappen.
  const tcl = await page.evaluate(() => { tcSavedNote({ folder: 'Lägesplan', uploaded: 1, link: 'https://web.connect.trimble.com/projects/P/data/folder/F' }, [{ name: 'X.ifc' }]); const last = l3Log[l3Log.length - 1], a = document.getElementById('v3StatusLink'); return { link: last.link, text: last.text, shown: !a.classList.contains('hidden'), href: a.href }; });
  if (!/folder\/F$/.test(tcl.link) || !/Lägesplan: X\.ifc/.test(tcl.text) || !tcl.shown || !/folder\/F$/.test(tcl.href)) fail('Länk till TC i historiken: ' + JSON.stringify(tcl));
  await page.evaluate(() => l3Status('Klart.'));
  if (await page.evaluate(() => !document.getElementById('v3StatusLink').classList.contains('hidden'))) fail('Länken ska försvinna vid nästa status');
  if (ksel.names.length !== 2 || !ksel.names.some(x => /Kommentar 3: Tredje/.test(x)) || ksel.names.some(x => /Kommentar 2:/.test(x))) fail('Exportera markerade: ' + JSON.stringify(ksel));

  // Kommentarerna som riktiga 3D-skyltar i IFC till TC.
  const kifc = await page.evaluate(async () => {
    window.__kup = null; const orig = askOpener;
    askOpener = async (type, extra, t, p) => { if (type === 'tcUpload') { window.__kup = { name: extra.files[0].name, folder: extra.folder, bytes: new Uint8Array(await extra.files[0].arrayBuffer()) }; return { uploaded: 1, folder: extra.folder }; } return orig(type, extra, t, p); };
    await l3kExportIfc(); askOpener = orig;
    const up = window.__kup, api = await ifcmLoad();
    const id = api.OpenModel(up.bytes, { COORDINATE_TO_ORIGIN: false });
    let meshes = 0, tris = 0, zmax = -1e9, zmin = 1e9;
    api.StreamAllMeshes(id, mesh => { meshes++; for (let i = 0; i < mesh.geometries.size(); i++) { const pg = mesh.geometries.get(i), g = api.GetGeometry(id, pg.geometryExpressID), ix = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize()), v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize()), T = pg.flatTransformation; tris += ix.length / 3; for (let k = 0; k < v.length; k += 6) { const z = T[1] * v[k] + T[5] * v[k + 1] + T[9] * v[k + 2] + T[13]; /* web-ifc: höjden i Y */ if (z > zmax) zmax = z; if (z < zmin) zmin = z; } } });
    api.CloseModel(id);
    const txt = new TextDecoder().decode(up.bytes);
    return { name: up.name, folder: up.folder, meshes, tris, zmin, zmax, hasText: /Kolla schaktet/.test(txt), status: /'Status',\$,IFCLABEL\('(Öppen|\\X2\\00D6\\X0\\ppen)'\)/.test(txt) || /'Status'/.test(txt), proxies: (txt.match(/IFCBUILDINGELEMENTPROXY\(/g) || []).length };
  });
  if (!/^Kommentarer Plan 1 \d{4}-\d\d-\d\d kl \d\d\.\d\d\.\d\d\.ifc$/.test(kifc.name) || kifc.folder !== 'Lägesplan' || kifc.meshes < 3 || kifc.tris < 100 || !kifc.hasText || !kifc.status || kifc.proxies !== 3 || kifc.zmax < kifc.zmin + 2.2)
    fail('Kommentarerna som 3D-skyltar i IFC: ' + JSON.stringify(kifc));
  if (process.env.SHOT4) {
    await page.evaluate(async () => {
      const bytes = window.__kup.bytes, orig = askOpener;
      askOpener = async (type, extra, t, p) => (type === 'tcFile' && extra.fileId === 'KIFC' ? { bytes: bytes.slice().buffer } : orig(type, extra, t, p));
      l3k.hidden = true; l3kDraw();
      await l3bLoad([{ id: 'f:KIFC', fileId: 'KIFC', name: 'Kommentarer.ifc', version: 'k1' }]);
      askOpener = orig;
      const c = l3k.list[0], P = new THREE.Vector3(c.pos[0] - l3.O[0], c.pos[1] - l3.O[1], c.pos[2] - l3.O[2] + 2.6);
      l3StopFly(); l3.orbit.target.copy(P); l3.camera.position.copy(P).add(new THREE.Vector3(-1.5, -5, 0.8)); l3.orbit.update();
    });
    await page.waitForTimeout(900); await page.screenshot({ path: process.env.SHOT4 });
    await page.evaluate(() => { l3bRemove('f:KIFC'); l3k.hidden = false; l3kDraw(); });
  }

  // Skylten i 3D: ett kort på en stolpe; numrerade bubblan döljs. Tryck på skylten öppnar kommentaren.
  const sg = await page.evaluate(() => { const sp = l3.groups.csigns.children.find(o => o.isSprite); const q = l3ToScreen(sp.position); return { x: q.x, y: q.y, w: sp.scale.x, h: sp.scale.y, lift: sp.position.z - (l3k.list[0].pos[2] - l3.O[2]), pin: getComputedStyle(document.querySelector('#view3d .v3-cpin')).display }; });
  if (sg.w < 2 || sg.h <= 0 || Math.abs(sg.lift - 2.2) > 1e-6 || sg.pin !== 'none') fail('Skylten i 3D: ' + JSON.stringify(sg));
  await page.keyboard.press('Escape');
  if (await page.isVisible('#v3CPop')) fail('Esc ska stänga kommentaren');
  await page.evaluate(() => { const c = new THREE.Vector3(6512355 - l3.O[0], 150122 - l3.O[1], 0); l3.camera.position.set(c.x, c.y - 25, 12); l3.orbit.target.copy(c); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); });
  const sg2 = await page.evaluate(() => { const sp = l3.groups.csigns.children.find(o => o.isSprite); const q = l3ToScreen(sp.position.clone().add(new THREE.Vector3(0.6, 0, 0.6))); return [q.x, q.y]; });
  await page.mouse.click(cv2.x + sg2[0], cv2.y + sg2[1]); await page.waitForTimeout(200);
  if (!(await page.isVisible('#v3CPop #v3CReply'))) fail('Tryck på skylten ska öppna kommentaren');
  await page.fill('#v3CPop #v3CReply', 'Klart, kollat');
  await page.click('#v3CPop [data-k="reply"]'); await page.waitForTimeout(200);
  await page.click('#v3CPop [data-k="done"]'); await page.waitForTimeout(300);
  const cs = await page.evaluate(() => ({ replies: l3k.list[0].replies.length, done: l3k.list[0].done, pin: document.querySelector('#view3d .v3-cpin').classList.contains('done') && l3.groups.csigns.children.some(o => o.isSprite), txt: document.querySelector('#v3CPop .v3-cpop-body').textContent }));
  const saved2 = JSON.parse(gh.get('projects/p1/plan_comments3d.json') || '[]');
  if (process.env.SHOT2) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); await page.screenshot({ path: process.env.SHOT2 }); await page.mouse.click(cv2.x + sg2[0], cv2.y + sg2[1]); await page.waitForTimeout(200); }
  if (cs.replies !== 1 || !cs.done || !cs.pin || !/Klart, kollat/.test(cs.txt) || !saved2[0].done || saved2[0].replies.length !== 1) fail('Svar och klar: ' + JSON.stringify(cs));
  await page.keyboard.press('Escape');

  if (process.env.SHOT) { await page.evaluate(() => { const m = new THREE.Mesh(new THREE.BoxGeometry(6, 6, 6), new THREE.MeshLambertMaterial({ color: 0x9aa7b8, side: THREE.DoubleSide })); m.position.copy(l3.orbit.target).add(new THREE.Vector3(0, 0, 3)); l3.groups.bldg.add(m); l3ClipHorizontal(); l3.camera.position.set(l3.orbit.target.x + 30, l3.orbit.target.y - 30, l3.orbit.target.z + 20); l3.orbit.update(); }); await page.waitForTimeout(500); await page.screenshot({ path: process.env.SHOT }); }
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3dclip');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
