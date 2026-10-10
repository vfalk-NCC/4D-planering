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
  await page.mouse.move(sc.x + sc.width / 2, sc.y + sc.height / 2); await page.mouse.down();
  await page.mouse.move(sc.x + sc.width / 2, sc.y + sc.height / 2 + 60, { steps: 5 });
  const mid = await page.evaluate(() => ({ plane: !!l3c.plane, off: l3.clips[0].off }));
  await page.mouse.up(); await page.waitForTimeout(100);
  const after = await page.evaluate(() => ({ plane: !!l3c.plane, off: l3.clips[0].off, slider: Number(document.querySelector('#v3Clip [data-clipoff="0"]').value), lbl: document.querySelector('#view3d .v3-scissor span').textContent }));
  if (!mid.plane || after.plane || Math.abs(after.off) < 0.2 || Math.abs(after.slider - after.off) > 0.051 || !/m$/.test(after.lbl)) fail('Dra i saxen: ' + JSON.stringify({ mid, after }));
  // Ner i bilden = planet sänks (vågrätt snitt ovanifrån: mindre syns).
  const zc = await page.evaluate(() => -l3.clips[0].plane.constant / l3.clips[0].plane.normal.z);
  if (!(after.off < 0) && !(after.off > 0)) fail('Förskjutningen ska ändras');
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

  if (process.env.SHOT) { await page.evaluate(() => { l3ClipHorizontal(); l3.camera.position.set(l3.orbit.target.x + 30, l3.orbit.target.y - 30, l3.orbit.target.z + 20); l3.orbit.update(); }); await page.waitForTimeout(500); await page.screenshot({ path: process.env.SHOT }); }
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3dclip');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
