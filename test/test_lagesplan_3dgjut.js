// Gjutetappen (Victor 2026-10-24): fält som reglage och listor, volymen ur formen, träformen med markanspråk, handtag för L/T/U-formens utskärning, radialmenyn med en sekunds håll.
// (uppstarten delas med test_lagesplan_3d.js) 3D-vyn ovanpå lägesplanen (Victors önskemål 2026-10-08): planen som mark via kalibreringen,
// planerade objekt som lådor i statusfärg, etableringen (plan_placements.json) med riktig geometri,
// lägga till från biblioteket med ett tryck, handtag (flytta/vrida) med fäst mot ytor, sidopanel,
// mätning, sparning i samma fil som 4D-planering och "Spara som IFC" via 4D-planering.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8995;
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
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page); // appens egna dialogrutor
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  page.on('dialog', d => d.accept());
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  // GitHub: bara etableringens filer finns.
  const store = new Map(); let n = 0;
  store.set('projects/p1/plan_placements.json', { content: JSON.stringify([{ id: 'k1', type: 'tornkran', name: 'Kran 1', x: 6512320, y: 150110, z: 0, L: 1.6, B: 1.6, H: 40, R: 50, rot: 0, dz: 0, color: '#facc15' }]), sha: 's0' });
  await page.route('https://api.github.com/**', r => {
    const req = r.request(); const f = decodeURIComponent(new URL(req.url()).pathname.replace('/repos/vfalk-NCC/4D-data/contents/', ''));
    const e = store.get(f);
    if (req.method() === 'GET') return e ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: Buffer.from(e.content).toString('base64'), sha: e.sha }) }) : r.fulfill({ status: 404, body: '{}' });
    const body = JSON.parse(req.postData()); if (e && body.sha !== e.sha) return r.fulfill({ status: 409, body: '{}' });
    const sha = 's' + (++n); store.set(f, { content: Buffer.from(body.content, 'base64').toString(), sha });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha } }) });
  });
  const getStore = f => { const e = store.get(`projects/p1/${f}`); return e ? JSON.parse(e.content) : null; };
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer);
    items = [
      { id: 'i1', object_name: 'K10', activity: 'Pelare', start_date: '2020-01-01', end_date: '2030-12-01', status: 'pagaende', progress: 40 },
      { id: 'i2', object_name: 'M30', activity: 'Gjutning', start_date: '2020-01-01', end_date: '2020-02-01', status: 'klar', progress: 100, actual_end_date: '2020-02-01' },
    ];
    positions = [
      { id: 'i1', x: 6512350, y: 150125, z0: 0, z1: 14, x0: 6512345, x1: 6512355, y0: 150120, y1: 150130 },
      { id: 'i2', x: 6512380, y: 150125, z0: 0, z1: 3, x0: 6512378, x1: 6512382, y0: 150123, y1: 150127 },
    ];
    renderPlanSelect(); await openPlan('A');
    window.__calls = [];
    Object.defineProperty(window, 'opener', { value: { closed: false }, configurable: true, writable: true });
    askOpener = async (type, extra) => { window.__calls.push(type); return type === 'placeSaveIfc' ? { n: 2, files: ['Etablering x.ifc'] } : {}; };
  });
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.objMesh && l3.placeMeshes.size === 1, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const sleep = ms => page.waitForTimeout(ms);
  const mk = async form => page.evaluate(async form => { const O = l3.O, q = placeNew('sm:gjutetapp', [O[0] + 20, O[1] + 20, 0]); q.f = q.f || {}; q.f.form = form; placements.push(q); placeTouch(q); l3AddPlacementMesh(q); l3SelectIds([q.id]); window.__g = q; return q.id; }, form);
  // 1) Panelen: reglage, knappar och listor i stället för fria siffror; volymen räknas ur formen
  await mk('L-form'); await sleep(500);
  let s = await page.evaluate(() => ({ range: document.querySelectorAll('#v3Side input[type=range][data-smf]').length, seg: document.querySelectorAll('#v3Side [data-smseg]').length, sel: document.querySelectorAll('#v3Side select[data-smf]').length, vol: !!document.querySelector('#v3Side [data-smf="vol"]'), calc: document.querySelector('#v3Side .v3-sm-calc') ? document.querySelector('#v3Side .v3-sm-calc').textContent : '', time: !!document.querySelector('#v3Side input[type=time][data-smf="start"]') }));
  if (s.range < 3 || s.seg < 3 || s.sel < 6 || s.vol || !/Volym/.test(s.calc) || !/Markanspråk/.test(s.calc) || !s.time) fail('Gjutetappens panel: ' + JSON.stringify(s));
  const a = await page.evaluate(() => { const p = window.__g, st = gjutStats(p, gjutPoly(p)); return { area: st.area, vol: st.vol, H: st.H, claim: st.claim }; });
  if (Math.abs(a.vol - a.area * a.H) > 1e-6 || a.claim <= a.area) fail('Volym = yta × tjocklek, markanspråk större än ytan: ' + JSON.stringify(a));
  await page.evaluate(() => { window.__g.f.tillagg = '10'; }); const v2 = await page.evaluate(() => gjutStats(window.__g, gjutPoly(window.__g)).vol); if (Math.abs(v2 - a.vol * 1.1) > 1e-6) fail('Spillpåslag 10 %: ' + v2);
  console.log('OK: gjutetapp – reglage/knappar/listor, volym ur formen med spillpåslag, markanspråk');
  // 2) Träformen: reglar, stöttor och snedstag runt konturen + orange markanspråk
  const g = await page.evaluate(() => { const parts = placeParts(window.__g); return { n: parts.length, wood: parts.filter(x => x.color === '#c9a15f' || x.color === '#a9824a').length, claim: parts.filter(x => x.color === '#f97316').length, sign: (parts.find(x => x.sign) || {}).sign && parts.find(x => x.sign).sign.title }; });
  if (g.wood < 2 || g.claim < 1) fail('Träform och markanspråk: ' + JSON.stringify(g));
  if (!/^Gjutetapp/.test(g.sign)) fail('Skylten visar etappens namn: ' + g.sign);
  console.log('OK: gjutetapp – träform med stöttor och snedstag, markanspråk, namnet på skylten');
  // 3) Handtag för utskärningen: L = 1 hörn, T och U = 2, rektangel = inga; dra ändrar måtten
  const counts = {}; for (const f of ['Rektangel', 'L-form', 'T-form', 'U-form']) { await mk(f); await sleep(200); counts[f] = await page.evaluate(() => l3HandleDefs(window.__g).filter(h => h.key === 'cut').length); }
  if (JSON.stringify(counts) !== JSON.stringify({ Rektangel: 0, 'L-form': 1, 'T-form': 2, 'U-form': 2 })) fail('Antal utskärningshandtag: ' + JSON.stringify(counts));
  await mk('L-form'); await sleep(300);
  await page.evaluate(() => { const p = window.__g, O = l3.O; l3StopFly(); const c = new THREE.Vector3(p.x - O[0], p.y - O[1], 0); l3.camera.position.set(c.x, c.y - 0.01, 60); l3.orbit.target.copy(c); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); l3HandlesBuild(); l3HandlesPos(); });
  const hp = await page.evaluate(() => { const el = document.querySelector('.v3-hd-cut'), r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  const before = await page.evaluate(() => [window.__g.f.cutL, window.__g.f.cutB].join());
  await page.mouse.move(hp[0], hp[1]); await page.mouse.down(); await page.mouse.move(hp[0] - 80, hp[1] + 40, { steps: 6 }); await page.mouse.up(); await sleep(300);
  const after = await page.evaluate(() => [window.__g.f.cutL, window.__g.f.cutB].join());
  if (before === after) fail('Dra utskärningens handtag ska ändra måtten: ' + before + ' -> ' + after);
  console.log('OK: handtag för L-, T- och U-formens utskärning i modellen (' + before + ' → ' + after + ')');
  // 4) Radialmenyn: håll mittenknappen stilla en sekund
  const cvb = await page.locator('#v3Canvas canvas').boundingBox(), px = cvb.x + cvb.width / 2, py = cvb.y + cvb.height / 2;
  await page.evaluate(([x, y]) => { const el = l3.renderer.domElement, o = { bubbles: true, cancelable: true, button: 1, buttons: 4, clientX: x, clientY: y, pointerId: 7 }; el.dispatchEvent(new PointerEvent('pointerdown', o)); }, [px, py]);
  await sleep(500); if (await page.locator('.v3-radial').count()) fail('Radialmenyn ska inte komma före en sekund');
  await sleep(700); if (!(await page.locator('.v3-radial').count())) fail('Radialmenyn ska komma efter en sekunds håll');
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 1, pointerId: 7 }))); await page.keyboard.press('Escape'); await sleep(300);
  await page.evaluate(([x, y]) => { const el = l3.renderer.domElement; el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 1, clientX: x, clientY: y, pointerId: 8 })); window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x + 30, clientY: y, pointerId: 8 })); }, [px, py]);
  await sleep(1300); if (await page.locator('.v3-radial').count()) fail('Rör man musen avbryts håll-menyn');
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 1, pointerId: 8 })));
  console.log('OK: radialmenyn öppnas vid markören efter en sekunds håll utan rörelse');
  // 7) Underkant mot berg: ritad profil klipper formen, volymen minskar och armeringen/träformen följer
  await mk('Rektangel'); await sleep(300);
  const pr = await page.evaluate(() => { const p = window.__g; p.H = 1; const flat = gjutStats(p, gjutPoly(p));
    const raw = []; for (let i = 0; i <= 60; i++) { const x = -p.L / 2 + p.L * i / 60; raw.push([x, 0.25 + 0.35 * Math.sin(i / 6) - 0.4 * (i > 40 ? 1 : 0)]); }
    l3gpCommit(p, raw); const st = gjutStats(p, gjutPoly(p)), parts = placeParts(p); let ok = true; try { l3PlacementGroup(p); } catch (e) { ok = String(e); }
    return { flatVol: flat.vol, vol: st.vol, tmin: st.PC && st.PC.tmin, tmax: st.PC && st.PC.tmax, prof: p.f.prof.split(';').length, parts: parts.length, ok, calc: gjutCalc(p, gjutPoly(p)).map(r => r.join(' ')).join(' | ') }; });
  if (!(pr.vol < pr.flatVol - 1) || !(pr.tmax > pr.tmin + 0.3) || pr.prof < 4 || pr.prof > 40 || pr.ok !== true || !/följer berget/.test(pr.calc)) fail('Bottenprofil: ' + JSON.stringify(pr));
  await sleep(300); const ui = await page.evaluate(() => ({ draw: !!document.querySelector('#v3Side [data-gjdraw]'), clr: !!document.querySelector('#v3Side [data-gjclear]') })); if (!ui.draw || !ui.clr) fail('Panelens knappar Rita/Rensa: ' + JSON.stringify(ui));
  await page.evaluate(() => l3gpClear(window.__g)); if ((await page.evaluate(() => gjutProfGet(window.__g))) !== null) fail('Rensa ger rak botten');
  // frihandsritning med riktiga pekarhändelser på sidan närmast kameran
  await page.evaluate(() => { const p = window.__g, O = l3.O; l3StopFly(); const c = new THREE.Vector3(p.x - O[0], p.y - O[1], 0.5); l3.camera.position.set(c.x, c.y - 22, 6); l3.orbit.target.copy(c); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); l3gpStart(p); });
  const pts = await page.evaluate(() => { const G = l3gp.g, r = l3.renderer.domElement.getBoundingClientRect(), out = []; for (let i = 0; i <= 24; i++) { const x = G.minX + (G.maxX - G.minX) * i / 24, w = l3gpWorld(G, x, 0.35 + 0.2 * Math.sin(i / 3), G.minY).project(l3.camera); out.push([r.left + (w.x + 1) / 2 * r.width, r.top + (1 - w.y) / 2 * r.height]); } return out; });
  await page.evaluate(([a]) => l3.renderer.domElement.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0, clientX: a[0], clientY: a[1], pointerId: 11 })), [pts[0]]);
  for (const q of pts.slice(1)) await page.evaluate(([a]) => window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: a[0], clientY: a[1], pointerId: 11 })), [q]);
  await page.evaluate(([a]) => window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: a[0], clientY: a[1], pointerId: 11 })), [pts[pts.length - 1]]);
  await sleep(300); const dr = await page.evaluate(() => { const pf = gjutProfGet(window.__g); return pf ? { n: pf.length, zs: pf.map(q => q[1]) } : null; });
  if (!dr || dr.n < 3 || Math.max(...dr.zs) - Math.min(...dr.zs) < 0.15) fail('Frihandsritad underkant: ' + JSON.stringify(dr));
  console.log('OK: gjutetapp – underkant mot berg (profil, volym, ritning med frihand, rensa)');
  // 8) Makadam: fraktion och tjocklek; objekt "i" gruset (placerade och IFC) dras av så att volymen blir verklig
  const mkr = await page.evaluate(async () => { const O = l3.O, q = placeNew('sm:makadam', [O[0] + 40, O[1] + 40, 0]); q.L = 10; q.B = 10; q.H = 0.3; q.rot = 0; placements.push(q); placeTouch(q); l3AddPlacementMesh(q);
    const r = {}; const s0 = mkShape(q); r.gross = s0.gross; r.net0 = s0.net; r.vol0 = mkStats(q, s0).vol;
    const f = placeNew('sm:lada' in SM ? 'lada' : 'lada', [q.x + 1, q.y + 1, 0]); f.L = 2; f.B = 2; f.H = 1; f.z = 0; placements.push(f); placeTouch(f); l3AddPlacementMesh(f);
    const s1 = mkShape(q); r.net1 = s1.net; r.cuts1 = s1.cuts.length; r.vol1 = mkStats(q, s1).vol;
    f.z = 0.5; const s2 = mkShape(q); r.cutsAbove = s2.cuts.length; f.z = 0;                                           // ovanför gruset: ingen avdrag
    q.f = { ...(q.f || {}), avdrag: 'Nej' }; r.noCut = mkShape(q).net; q.f.avdrag = 'Ja';
    // IFC-objekt: ett fundament i en inläst modell (AABB 3 × 3 m) 1 m från mitten
    const geo = new THREE.BufferGeometry(), x0 = q.x - O[0] - 3, y0 = q.y - O[1] - 3, v = []; [[0, 0, 0], [3, 0, 0], [3, 3, 0], [0, 3, 0], [0, 0, 1], [3, 0, 1], [3, 3, 1], [0, 3, 1]].forEach(([a, b, c2]) => v.push(x0 + a, y0 + b, c2 - O[2]));
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial()); mesh.userData.l3b = { ranges: [{ start: 0, count: 8, name: 'Fundament' }], hidden: new Set() };
    l3b.models.push({ id: 'mk', name: 'F.ifc', visible: true, meshes: [mesh] }); const s3 = mkShape(q); r.cuts3 = s3.cuts.length; r.net3 = s3.net; r.names = s3.cuts.map(c2 => c2.name).join();
    l3b.models.pop(); r.parts = placeParts(q).length; r.calc = mkCalc(q).map(x => x.join(' ')).join(' | '); r.fr = SM.makadam.fields.some(x => x[0] === 'fr') && SM.makadam.fields.some(x => x[0] === 'H'); return r; });
  if (mkr.gross !== 100 || mkr.net0 !== 100 || Math.abs(mkr.vol0 - 30) > 1e-6 || mkr.cuts1 !== 1 || Math.abs(mkr.net1 - 96) > 1e-6 || Math.abs(mkr.vol1 - 28.8) > 1e-6 || mkr.cutsAbove !== 0 || mkr.noCut !== 100 || mkr.cuts3 !== 2 || Math.abs(mkr.net3 - 87) > 1e-6 || !/Fundament/.test(mkr.names) || mkr.parts < 3 || !mkr.fr) fail('Makadam: ' + JSON.stringify(mkr));
  console.log('OK: makadam – fraktion/tjocklek, avdrag för placerade och IFC-objekt i gruset, verklig volym (' + mkr.calc.slice(0, 90) + '…)');
  // 9) IFC till Trimble Connect: inga räckviddsringar eller streck/pilar som tusentals kanter (valbart: med räckviddsringar)
  const ifc = await page.evaluate(() => { const O = l3.O, k = placeNew('tornkran', [O[0] + 60, O[1] + 60, 0]); k.R = 40; placements.push(k); placeTouch(k);
    const v = placeNew('sm:transport', [O[0] + 70, O[1] + 70, 0]); v.pts = [[v.x, v.y, 0], [v.x + 30, v.y, 0], [v.x + 50, v.y + 20, 0]]; placements.push(v); placeTouch(v);
    const g = placeNew('sm:gjutetapp', [O[0] + 90, O[1] + 90, 0]); placements.push(g); placeTouch(g);
    const only = new Set([k.id, v.id, g.id]); placeNameOpt.reach = false; const a = buildPlacementsIfc('T', only).text; placeNameOpt.reach = true; const b = buildPlacementsIfc('T', only).text; placeNameOpt.reach = false;
    const deco = [placeParts(v), placeParts(g)].map(ps => ps.filter(x => x.deco).length); return { noReach: (a.match(/IFCBUILDINGELEMENTPROXY/g) || []).length === 3, withReach: (b.match(/IFCBUILDINGELEMENTPROXY/g) || []).length === 4, deco, small: a.length < b.length + 1, len: a.length }; });
  if (!ifc.noReach || !ifc.withReach || !ifc.deco[0] || !ifc.deco[1]) fail('IFC utan räckviddsringar/streck: ' + JSON.stringify(ifc));
  console.log('OK: IFC till Trimble Connect – inga räckviddsringar eller markeringsstreck (valbart)');
  // 10) Skylten för sig: vridning och höjd oberoende av objektet (alla smarta objekt och bemanning)
  const sg = await page.evaluate(async () => { const O = l3.O, res = {};
    for (const t of ['sm:gjutetapp', 'sm:saxlift', 'sm:transport']) { const q = placeNew(t, [O[0] + 100, O[1] + 100, 0]); if (placeLib(q.type).fence) q.pts = [[q.x, q.y, 0], [q.x + 20, q.y, 0]]; placements.push(q); placeTouch(q);
      const sign = () => placeParts(q).find(x => x.sign).sign, a = sign(); localStorage.removeItem(CREW_SIGN_KEY); q.signYaw = 90; const b = sign(); q.signYaw = null; q.signZ = 6; const c2 = sign(); q.signZ = null;
      res[t] = { yawChanged: Math.abs(b.ax - a.ax) + Math.abs(b.ay - a.ay) > 0.5, zSet: c2.zb === 6, auto: a.zb !== 6 }; l3AddPlacementMesh(q); l3SelectIds([q.id]); await new Promise(r => setTimeout(r, 250)); res[t].panel = !!document.querySelector('#v3Side [data-sg="yaw"]') && !!document.querySelector('#v3Side [data-sg="z"]'); }
    const cw = placeNew('crew:', [O[0] + 110, O[1] + 110, 0]); placements.push(cw); placeTouch(cw); const s0 = placeParts(cw).find(x => x.sign).sign; cw.signZ = 5; res.crew = { zSet: placeParts(cw).find(x => x.sign).sign.zb === 5 && s0.zb !== 5 }; return res; });
  for (const [k, v] of Object.entries(sg)) if (!(k === 'crew' ? v.zSet : v.yawChanged && v.zSet && v.auto && v.panel)) fail('Skylt för sig (' + k + '): ' + JSON.stringify(sg));
  console.log('OK: skyltens vridning och höjd justeras för sig på alla objekt (smarta objekt och bemanning)');
  // 11) Spränga: etableringsobjekt flyttas isär, IFC-delar plockas ut, allt läggs tillbaka
  const ex = await page.evaluate(async () => { const O = l3.O, r = {}, mkp = (dx, dy) => { const q = placeNew('lada', [O[0] + 200 + dx, O[1] + 200 + dy, 0]); q.L = 2; q.B = 2; q.H = 1; placements.push(q); placeTouch(q); l3AddPlacementMesh(q); return q; };
    const a = mkp(-6, 0), b = mkp(6, 0), c = mkp(0, 6);
    const geo = new THREE.BoxGeometry(2, 2, 2), n = geo.getAttribute('position').count, cols = new Float32Array(n * 3).fill(0.8); geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); geo.translate(a.x - O[0], a.y - O[1] - 8, 1);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true })); const idx = new Uint32Array(geo.index.array); mesh.userData.l3b = { origIdx: idx, hidden: new Set(), ranges: [{ start: 0, count: n, name: 'Pelare' }] }; l3.scene.add(mesh); l3b.models.push({ id: 'xm', name: 'X.ifc', visible: true, meshes: [mesh] });
    const base = [a, b, c].map(q => l3.placeMeshes.get(q.id).position.clone()); l3bsSet([{ mesh, ri: 0 }]); l3SelectIds([a.id, b.id, c.id], { keepIfc: true }); await new Promise(rs => setTimeout(rs, 100));
    l3xStart(); r.dbg = [l3.sel.size, l3bs.sel.length, document.getElementById('v3Status').textContent]; r.on = l3x.on; if (!l3x.on) return r; r.items = l3x.items.length; r.tmp = l3x.tmp.length; r.hidden = mesh.userData.l3b.animOff.has(0); r.panel = !!document.getElementById('v3Explode');
    l3xPlay(false); l3x.t = 1; l3xApply(); const g = [a, b, c].map(q => l3.placeMeshes.get(q.id)), cx = (base[0].x + base[1].x + base[2].x) / 3;
    r.moved = g.map((o, i) => o.position.distanceTo(base[i]) > 2); r.awayB = g[1].position.x - base[1].x > 1 && g[0].position.x - base[0].x < -1;
    l3x.mode = 'lager'; l3xLayout(); l3xApply(); r.lager = g.every((o, i) => Math.abs(o.position.x - base[i].x) < 1e-6);
    l3x.mode = 'radial'; l3x.amount = 3; l3xLayout(); l3xApply(); r.farther = g[1].position.x - base[1].x > 3;
    l3xStop(); r.back = g.every((o, i) => o.position.distanceTo(base[i]) < 1e-9); r.restored = !mesh.userData.l3b.animOff.has(0) && !document.getElementById('v3Explode') && !l3x.on; r.sel = l3.sel.size === 3;
    l3b.models.pop(); l3.scene.remove(mesh); return r; });
  if (!ex.on || ex.items !== 4 || ex.tmp !== 1 || !ex.hidden || !ex.panel || !ex.moved.every(Boolean) || !ex.awayB || !ex.lager || !ex.farther || !ex.back || !ex.restored || !ex.sel) fail('Spränga: ' + JSON.stringify(ex));
  console.log('OK: spränga markerade objekt – radiellt/lager/axel, IFC-delar utplockade, reglage, allt läggs tillbaka');
  // 12) Ställning: dynamisk uppbyggnad efter höjd och längd; punktmolnsmenyns plus i Lager
  const stl = await page.evaluate(() => { const O = l3.O, q = placeNew('stallning', [O[0] + 150, O[1] + 150, 0]); placements.push(q); placeTouch(q); l3AddPlacementMesh(q); const n = h => { q.H = h; q.L = 10; const ps = placeParts(q); return { n: ps.length, top: Math.max(...ps.filter(x => !x.sign && !x.card).map(x => x.z1)) }; };
    const a = n(6), b = n(20); q.H = 20; q.L = 20; const c2 = placeParts(q).length; return { a, b, c2, lib: !!placeLib('stallning').smart, fields: SM.stallning.fields.length, hidden: !smKeys().includes('stallning') }; });
  if (!(stl.b.top > stl.a.top + 10) || !(stl.c2 > stl.b.n || stl.c2 >= 1) || !stl.lib || stl.fields < 8 || !stl.hidden) fail('Ställning: ' + JSON.stringify(stl));
  await page.evaluate(() => l3PalTab('layers')); await sleep(300);
  if (!(await page.locator('#v3PalLayers [data-ldd="pc"]').count())) fail('Plustecken vid Punktmoln i Lager saknas');
  console.log('OK: ställning byggs dynamiskt efter höjd/längd; plustecken vid Punktmoln i Lager');
  // 13) Lager: samlingsswitchar och modellens sken
  const lg = await page.evaluate(async () => { const mk = id => { const geo = new THREE.BoxGeometry(1, 1, 1), mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial()); mesh.userData.l3b = { origIdx: geo.index.array, hidden: new Set(), ranges: [] }; l3.scene.add(mesh); return { id, name: id + '.ifc', visible: true, meshes: [mesh], tris: 12 }; };
    const a = mk('ma'), b = mk('mb'); b.visible = false; b.meshes[0].visible = false; l3b.models.push(a, b); l3PalTab('layers'); await new Promise(r => setTimeout(r, 250)); const r = {};
    r.sw = ['models', 'pc', 'twoD'].every(k => !!document.querySelector(`#v3PalLayers [data-lsw="${k}"]`)); r.on0 = l3lMasterOn('models');
    l3lMaster('models', false); r.off = !a.visible && !a.meshes[0].visible && !l3lMasterOn('models'); l3lMaster('models', true); r.back = a.visible && !b.visible;     // bara det som var tänt kommer tillbaka
    l3lGlow('ma'); r.glow = a.meshes[0].material.emissive.getHex() === 0x2f7bff && b.meshes[0].material.emissive.getHex() === 0 && l3lay.glow === 'ma'; l3lGlow(null); r.glowOff = a.meshes[0].material.emissive.getHex() === 0 && !l3lay.glow;
    l3b.models.splice(l3b.models.indexOf(a), 1); l3b.models.splice(l3b.models.indexOf(b), 1); l3.scene.remove(a.meshes[0], b.meshes[0]); return r; });
  if (!lg.sw || !lg.on0 || !lg.off || !lg.back || !lg.glow || !lg.glowOff) fail('Lager-switchar/sken: ' + JSON.stringify(lg));
  console.log('OK: Lager – switchar för modeller/punktmoln/2D och sken kring vald modell');
  // 14) Formen: regeldimension (45×125 som standard, valbar) och riven form (bara betongen syns)
  const fw = await page.evaluate(() => { const O = l3.O, q = placeNew('sm:gjutetapp', [O[0] + 300, O[1] + 300, 0]); placements.push(q); placeTouch(q);
    const wood = ps => ps.filter(x => x.color === '#c9a15f' || x.color === '#a9824a').length, conc = ps => ps.filter(x => x.color === '#9aa4b2' || x.color === '#a8aeb6');
    const a = placeParts(q), r = { f0: { reg: q.f.reg, riv: q.f.riv }, wood: wood(a), concT: conc(a).map(x => x.transp) };
    const dim = (reg) => { q.f.reg = reg; const ps = placeParts(q).filter(x => x.tris && x.color === '#a9824a'); const xs = ps.flatMap(x => x.tris.pts.map(v => v[2])); return ps.length; };
    r.hasStakes = dim('45x125') > 0; q.f.riv = 'Riven'; const b = placeParts(q); r.woodRiv = wood(b); r.concRiv = conc(b).map(x => x.transp); r.claimRiv = b.filter(x => x.color === '#f97316').length; r.hasFields = SM.gjutetapp.fields.some(f => f[0] === 'riv') && SM.gjutetapp.fields.some(f => f[0] === 'reg'); return r; });
  if (fw.f0.reg !== '45x125' || !fw.wood || !fw.hasStakes || fw.woodRiv !== 0 || fw.claimRiv !== 0 || !fw.concRiv.every(t => !t) || !fw.hasFields) fail('Form/regel/riven: ' + JSON.stringify(fw));
  console.log('OK: gjutetapp – regeldimension 45×125 (valbar) och riven form där betongen syns');
  // 15) Fri form: utstick från punkterna (betong och form går ut lika långt åt alla håll) + armeringens vinkel som reglage
  const ut = await page.evaluate(() => { const O = l3.O, q = placeNew('sm:gjutform', [O[0] + 330, O[1] + 330, 0]); q.pts = [[O[0] + 330, O[1] + 330, 0], [O[0] + 334, O[1] + 330, 0], [O[0] + 334, O[1] + 334, 0], [O[0] + 330, O[1] + 334, 0]]; q.x = O[0] + 330; q.y = O[1] + 330; placements.push(q); q.f = q.f || {};
    const a = Math.abs(TK.area2(gjutFreePoly(q))); q.f.ut = 0.5; const b = Math.abs(TK.area2(gjutFreePoly(q))); q.f.ut = 0;
    return { a, b, field: !!(smDef(q).fields.find(f => f[0] === 'ut')), angRange: smDef(placeNew('sm:gjutetapp', [O[0], O[1], 0])).fields.find(f => f[0] === 'ang')[2] === 'range' }; });
  if (Math.abs(ut.a - 16) > 0.01 || Math.abs(ut.b - 25) > 0.01 || !ut.field || !ut.angRange) fail('Utstick/vinkel: ' + JSON.stringify(ut));
  console.log('OK: fri gjutform – utstick från punkterna (4×4 → 5×5 m vid 0,5 m) och armeringens vinkel som reglage');
  // 5) Sax- och bomlift: höjden styr geometrin (och går att ställa med reglage), höjdhandtag finns
  for (const t of ['sm:saxlift', 'sm:bomlift']) {
    const r = await page.evaluate(t => { const O = l3.O, q = placeNew(t, [O[0] + 30, O[1] + 30, 0]); placements.push(q); placeTouch(q); l3AddPlacementMesh(q); l3SelectIds([q.id]);
      const top = H => { q.H = H; const ps = placeParts(q).filter(x => !x.sign && !x.card); return Math.max(...ps.map(x => x.z1)); };
      const a = top(6), b = top(12), hs = l3HandleDefs(q).filter(h => h.key === 'H').length; return { a, b, hs, slider: !!document.querySelector('#v3Side input[data-smd="H"]') }; }, t);
    await sleep(300);
    if (!(r.b > r.a + 4) || r.hs !== 1) fail(t + ' – höjden styr geometrin och har ett höjdhandtag: ' + JSON.stringify(r));
  }
  const sl = await page.evaluate(() => { l3SelectIds([placements[placements.length - 1].id]); return new Promise(res => setTimeout(() => res(!!document.querySelector('#v3Side input[data-smd="H"]')), 400)); });
  if (!sl) fail('Reglaget för plattformens höjd saknas');
  await page.evaluate(() => { const el = document.querySelector('#v3Side input[data-smd="H"]'); el.value = 20; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(300); if ((await page.evaluate(() => placements[placements.length - 1].H)) !== 20) fail('Reglaget ska sätta höjden');
  console.log('OK: saxlift och bomlift – höjden styr modellen, reglage och höjdhandtag');
  // 6) Switchen för placerade objekt
  await page.evaluate(() => l3PalTab('add')); await sleep(200);
  if (!(await page.isVisible('#v3PlacedSw')) && !(await page.isVisible('.v3-lib-sw'))) fail('Switchen saknas överst i biblioteket');
  await page.evaluate(() => { const sw = document.getElementById('v3PlacedSw'); sw.checked = false; sw.dispatchEvent(new Event('change')); }); await sleep(200);
  let sv = await page.evaluate(() => ({ vis: l3.groups.places.visible, sel: l3.sel.size, t: document.getElementById('v3PlacedSwT').textContent, pref: l3Prefs().placedOn }));
  if (sv.vis !== false || sv.sel !== 0 || sv.t !== 'Släckta' || sv.pref !== false) fail('Släck placerade: ' + JSON.stringify(sv));
  await page.evaluate(() => { const sw = document.getElementById('v3PlacedSw'); sw.checked = true; sw.dispatchEvent(new Event('change')); }); await sleep(150);
  if ((await page.evaluate(() => l3.groups.places.visible)) !== true) fail('Tänd placerade');
  console.log('OK: switch för placerade objekt i 3D-biblioteket');
  const real = errors.filter(e => !/setPointerCapture/.test(e)); if (real.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3dgjut');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL: ' + e.message); process.exit(1); });
