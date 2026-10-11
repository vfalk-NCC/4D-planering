// 3D-editorn på iPhone/iPad (pekskärm, 390 × 844): nyp-zoom, ett finger roterar, dubbeltryck zoomar,
// ark nedtill, stora handtag, knappar för Mått/Klar/Avbryt utan tangentbord, biblioteket fälls ihop.
const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 8986;
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
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  await require('./_dialogs').bridge(page); // appens egna dialogrutor
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  let promptAnswer = '';
  page.on('dialog', d => d.type() === 'prompt' ? d.accept(promptAnswer) : d.accept());
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  // GitHub: bara etableringens filer finns.
  const store = new Map(); let n = 0;
  const C = (id, x, y, name) => ({ id, type: 'container', name, x, y, z: 0, L: 6, B: 2, H: 2, rot: 0, dz: 0, color: '#2563eb' });
  store.set('projects/p1/plan_placements.json', { content: JSON.stringify([C('a', 6512320, 150110, 'Container 1'), C('b', 6512320, 150120, 'Container 2'), C('c', 6512335, 150110, 'Container 3'), { id: 'u', type: 'upplag', name: 'Upplag 1', x: 6512360, y: 150100, z: 0, L: 10, B: 5, H: 0.3, rot: 0, dz: 0, color: '#a16207' }]), sha: 's0' });
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
  // open3d() startas utan att vänta på dess löfte inne i sidan (Playwright tappade ibland svaret på det långa
  // anropet – sidan var oskadd); att 3D är klar kontrolleras nedan.
  await page.evaluate(() => { open3d(); });
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.placeMeshes.size === 4, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  const cv = await page.locator('#v3Canvas canvas').boundingBox();
  const scr = (x, y, z) => page.evaluate(([x, y, z]) => { const q = l3ToScreen(new THREE.Vector3(x - l3.O[0], y - l3.O[1], z - l3.O[2])); return [q.x, q.y]; }, [x, y, z]);
  const at = async (x, y, z) => { const [sx, sy] = await scr(x, y, z); return [cv.x + sx, cv.y + sy]; };
  const top = () => page.evaluate(() => { l3StopFly(); const c = new THREE.Vector3(6512335 - l3.O[0], 150115 - l3.O[1], 0); l3.camera.position.set(c.x, c.y - 0.01, 150); l3.orbit.target.copy(c); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); });
  const P = id => page.evaluate(id => ({ ...placements.find(x => x.id === id) }), id);
  const tap = async (x, y) => { await page.touchscreen.tap(x, y); await page.waitForTimeout(120); };

  // --- Grunder: pekskärm, biblioteket ihopfällt, ingen sidled.
  if (!(await page.evaluate(() => l3IsTouch()))) fail('Pekskärm ska kännas igen');
  if (await page.isVisible('#v3Pal') || !(await page.isVisible('#v3PalOpen'))) fail('Biblioteket ska börja ihopfällt på iPhone');
  const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.getElementById('view3d').scrollWidth, innerWidth]);
  if (sw[0] > sw[2] + 1 || sw[1] > sw[2] + 1) fail('Inget får sticka ut i sidled: ' + sw);
  // Verktygsraden ryms på en rad – resten ligger under ⋯ Mer (Victor 2026-10-11); Tillbaka, Välj, Flytta och Ångra syns alltid.
  const bar = await page.evaluate(() => { const b = document.querySelector('.v3-bar'), vis = id => { const e = document.querySelector(id); return !!(e && e.offsetParent && e.getBoundingClientRect().right <= innerWidth); }; return { fits: b.scrollWidth <= b.clientWidth + 1, more: vis('#v3More'), keep: ['#v3Close', '[data-v3tool="select"]', '[data-v3tool="move"]', '#v3Undo'].every(vis), n: l3.barHidden.length }; });
  if (!bar.fits || !bar.more || !bar.keep || !bar.n) fail('Verktygsraden ska rymmas med ⋯ Mer: ' + JSON.stringify(bar));
  if (!(await page.evaluate(() => l3.gizmo.size > 1))) fail('Större handtag (gizmo) på pekskärm');

  // --- Tryck = markera; egenskaperna som ark nedtill inom skärmen.
  await top();
  let [x, y] = await at(6512335, 150110, 2); await tap(x, y);
  if (JSON.stringify(await page.evaluate(() => [...l3.sel])) !== '["c"]') fail('Tryck ska markera containern');
  await page.waitForTimeout(150);
  const cy3 = (await at(6512335, 150110, 1))[1], sb = await page.locator('#v3Side').boundingBox();
  if (!(cy3 < sb.y)) fail('Det markerade ska flyttas upp ovanför arket: ' + cy3 + ' / ' + sb.y);
  if (sb.x < 0 || sb.x + sb.width > 391 || sb.y + sb.height > 845 || sb.y < 300) fail('Egenskaperna som ark nedtill: ' + JSON.stringify(sb));
  await page.tap('#v3Side .v3-side-min'); await page.waitForTimeout(100);
  const sbMin = await page.locator('#v3Side').boundingBox();
  if (!(sbMin.height < 80)) fail('▾ ska fälla ihop arket: ' + sbMin.height);
  await page.tap('#v3Side .v3-side-min'); await page.waitForTimeout(100);
  if (await page.isVisible('#v3SnapBar')) fail('Fästlägesraden behövs inte i Välj på iPhone');
  if (await page.evaluate(() => getComputedStyle(document.getElementById('apSheet') || document.body).display) !== 'none' && await page.$('#apSheet')) fail('Fältlägets ark ska vara dolt under 3D');
  const hd = await page.locator('.v3-hds .v3-hd').first().boundingBox();
  if (!hd || hd.width < 20) fail('Handtagen ska vara stora nog för fingret: ' + JSON.stringify(hd));

  // --- Nyp-zoom med två fingrar.
  await page.evaluate(() => l3SelectIds([])); await page.waitForTimeout(100);
  const cdp = await page.context().newCDPSession(page);
  const dist = () => page.evaluate(() => l3.camera.position.distanceTo(l3.orbit.target));
  const d0 = await dist(), cx = cv.x + cv.width / 2, cy = cv.y + cv.height / 3;
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
  await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[cx - 30 - i * 12, cy], [cx + 30 + i * 12, cy]]); await page.waitForTimeout(16); }
  await touch('touchEnd', []); await page.waitForTimeout(150);
  const d1 = await dist();
  if (!(d1 < d0 * 0.8)) fail('Nyp isär ska zooma in: ' + d0 + ' -> ' + d1);
  // Ett finger roterar (snett ovanifrån, inget markerat).
  await page.evaluate(() => { l3SelectIds([]); l3StopFly(); const c = new THREE.Vector3(6512335 - l3.O[0], 150115 - l3.O[1], 0); l3.camera.position.set(c.x - 30, c.y - 40, 30); l3.orbit.target.copy(c); l3.orbit.update(); });
  const dir0 = await page.evaluate(() => l3.camera.getWorldDirection(new THREE.Vector3()).toArray());
  await touch('touchStart', [[cx, cy]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[cx + i * 15, cy + i * 6]]); await page.waitForTimeout(16); }
  await touch('touchEnd', []); await page.waitForTimeout(150);
  const dir1 = await page.evaluate(() => l3.camera.getWorldDirection(new THREE.Vector3()).toArray());
  if (Math.hypot(...dir1.map((v, i) => v - dir0[i])) < 0.05) fail('Ett finger ska rotera');
  // Rotationscentrum (Victor 2026-10-11: "Rotationscentrum på iPhone är konstigt"): ett finger vrider kring punkten
  // under fingret – containern man tar tag i står kvar under fingret, och den runda markeringen syns där.
  await page.evaluate(() => { l3SelectIds([]); l3StopFly(); const c = new THREE.Vector3(6512335 - l3.O[0], 150115 - l3.O[1], 0); l3.camera.position.set(c.x - 30, c.y - 40, 30); l3.orbit.target.set(c.x + 60, c.y + 80, -20); l3.orbit.update(); l3.camera.lookAt(c); l3.orbit.target.copy(l3.camera.position).addScaledVector(l3.camera.getWorldDirection(new THREE.Vector3()), 400); l3.orbit.update(); });
  {
    const [gx, gy] = await at(6512340, 150120, 1); // Container 2 (mitt)
    await touch('touchStart', [[gx, gy]]);
    let mark = false, P = null;
    const cam0 = await page.evaluate(() => l3.camera.position.toArray());
    for (let i = 1; i <= 8; i++) { await touch('touchMove', [[gx + i * 12, gy + i * 4]]); await page.waitForTimeout(16); if (i === 4) [mark, P] = await page.evaluate(() => [!!(l3.pivEl && !l3.pivEl.classList.contains('hidden')), l3Piv && l3Piv.touch && l3Piv.P.toArray().map((v, a) => v + l3.O[a])]); }
    await touch('touchEnd', []); await page.waitForTimeout(150);
    if (!P) fail('Vridningen ska ske kring en punkt under fingret');
    const onBox = Math.hypot(P[0] - 6512340, P[1] - 150120, P[2] - 1) < 3; // på eller precis vid containern
    const [hx, hy] = await at(P[0], P[1], P[2]);
    const moved = await page.evaluate(c => l3.camera.position.distanceTo(new THREE.Vector3(...c)), cam0);
    if (!onBox || Math.hypot(hx - gx, hy - gy) > 3 || !(moved > 1)) fail('Ett finger ska vrida kring punkten under fingret (containern – den står kvar under fingret): ' + JSON.stringify({ P, gx, gy, hx, hy, moved }));
    if (!mark) fail('Den runda markeringen ska visa rotationspunkten medan man vrider');
    if (await page.evaluate(() => l3.orbit.touches.ONE) === -1) fail('OrbitControls ska få tillbaka ett-fingers-läget efteråt');
  }

  // Panorering med två fingrar i rätt takt (Victor 2026-10-11: "Panoreringen är alldeles för snabb på iPhone"):
  // det man håller i följer fingrarna även när OrbitControls målpunkt ligger långt bort.
  for (const far of [400, 3]) {
    await page.waitForTimeout(400);
    await page.evaluate(far => { l3SelectIds([]); l3StopFly(); const c = new THREE.Vector3(6512340 - l3.O[0], 150120 - l3.O[1], 1); l3.camera.position.set(c.x - 25, c.y - 35, 25); l3.camera.lookAt(c); l3.orbit.target.copy(l3.camera.position).addScaledVector(l3.camera.getWorldDirection(new THREE.Vector3()), far); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); }, far);
    const [gx, gy] = await at(6512340, 150120, 2); // Containerns ovansida
    await touch('touchStart', [[gx - 40, gy], [gx + 40, gy]]);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [[gx - 40 + i * 10, gy + i * 5], [gx + 40 + i * 10, gy + i * 5]]); await page.waitForTimeout(16); }
    await touch('touchEnd', []); await page.waitForTimeout(150);
    const [hx, hy] = await at(6512340, 150120, 2);
    const mv = Math.hypot(hx - gx, hy - gy), want = Math.hypot(60, 30);
    if (!(mv > want * 0.7 && mv < want * 1.3)) fail(`Två fingrar ska panorera i fingrarnas takt (målpunkt ${far} m bort): flyttade ${mv.toFixed(0)} px, fingrarna ${want.toFixed(0)} px`);
  }

  // Nypzoom i rätt takt och mot fingrarna (Victor 2026-10-11: "Zoomen också"): nyp isär från 80 till 160 px över
  // containern – den blir dubbelt så stor och står kvar mellan fingrarna, även när målpunkten ligger långt bort.
  for (const far of [400, 3]) {
    await page.waitForTimeout(400);
    await page.evaluate(far => { l3SelectIds([]); l3StopFly(); const c = new THREE.Vector3(6512340 - l3.O[0], 150120 - l3.O[1], 1); l3.camera.position.set(c.x - 40, c.y - 55, 40); l3.camera.lookAt(c); l3.orbit.target.copy(l3.camera.position).addScaledVector(l3.camera.getWorldDirection(new THREE.Vector3()), far); l3.orbit.update(); l3.renderer.render(l3.scene, l3.camera); }, far);
    const span = async () => { const a = await at(6512337, 150120, 2), b = await at(6512343, 150120, 2); return Math.hypot(a[0] - b[0], a[1] - b[1]); };
    const s0 = await span(), [gx, gy] = await at(6512340, 150120, 2);
    await touch('touchStart', [[gx - 40, gy], [gx + 40, gy]]);
    for (let i = 1; i <= 8; i++) { await touch('touchMove', [[gx - 40 - i * 5, gy], [gx + 40 + i * 5, gy]]); await page.waitForTimeout(16); }
    await touch('touchEnd', []); await page.waitForTimeout(150);
    const s1 = await span(), [hx, hy] = await at(6512340, 150120, 2), ratio = s1 / s0;
    if (!(ratio > 1.75 && ratio < 2.3) || Math.hypot(hx - gx, hy - gy) > 12) fail(`Nypzoom (målpunkt ${far} m bort): ${ratio.toFixed(2)} gånger större (ska vara 2), punkten flyttade ${Math.hypot(hx - gx, hy - gy).toFixed(0)} px`);
  }
  if (await page.evaluate(() => l3.orbit.touches.TWO) === -1) fail('OrbitControls ska få tillbaka två-fingers-läget efteråt');

  // --- Hela verktygsraden syns (Victor 2026-10-11: "jag kan inte öppna alla menyer i 3d-vyn") och menyerna ryms.
  {
    await page.waitForTimeout(700); // fingerdraget ovan är helt avslutat (pekgesterna i webbläsaren)
    const out = await page.evaluate(() => [...document.querySelectorAll('#view3d .v3-bar button')].filter(b => b.offsetParent).filter(b => { const r = b.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).map(b => b.id || b.title));
    if (out.length) fail('Knappar utanför skärmen: ' + out.join(', '));
    const tapEl = async sel => { const b = await page.locator(sel).boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(200); };
    for (const [btn, pop] of [['v3ShowBtn', 'v3Show'], ['v3ViewsBtn', 'v3Views'], ['v3EditBtn', 'v3Edit'], ['v3HelpBtn', 'v3Help']]) {
      // Knappen syns i raden, annars ligger den under ⋯ Mer.
      const i = await page.evaluate(id => { const e = document.getElementById(id); return e.offsetParent ? -1 : l3.barHidden.indexOf(e); }, btn);
      if (i < 0) await tapEl('#' + btn);
      else {
        await tapEl('#v3More');
        const rows = await page.evaluate(() => [...document.querySelectorAll('#v3MorePop button')].map(b => b.textContent));
        if (!(await page.isVisible('#v3MorePop')) || rows.length !== (await page.evaluate(() => l3.barHidden.length))) fail('⋯ Mer ska lista det som inte får plats: ' + rows);
        await tapEl(`#v3MorePop button:nth-child(${i + 1})`);
      }
      const m = await page.evaluate(id => { const e = document.getElementById(id), r = e.getBoundingClientRect(); return { open: !e.classList.contains('hidden'), l: r.left, r: r.right, sw: e.scrollWidth, cw: e.clientWidth }; }, pop);
      if (!m.open || m.l < 0 || m.r > 391 || m.sw > m.cw + 1) fail(`Menyn ${pop} ska öppnas och rymmas: ` + JSON.stringify(m));
      if (await page.isVisible('#v3MorePop')) fail('⋯ Mer ska stängas när en meny öppnas');
      await page.evaluate(() => l3HideMenus()); await page.waitForTimeout(100);
    }
  }

  // --- Dubbeltryck på marken zoomar dit.
  await top();
  const dd0 = await dist();
  [x, y] = await at(6512345, 150125, 0);
  await page.touchscreen.tap(x, y); await page.waitForTimeout(80); await page.touchscreen.tap(x, y); await page.waitForTimeout(700);
  if (!((await dist()) < dd0 * 0.7)) fail('Dubbeltryck ska zooma in: ' + dd0 + ' -> ' + await dist());

  // --- Flytta med exakt mått via 123-knappen (inget tangentbord).
  await top(); await page.evaluate(() => l3SelectIds([])); // arket nedtill skulle täcka punkten
  await page.evaluate(() => l3SetTool('move')); await page.waitForTimeout(150);
  if (!(await page.isVisible('.v3-touchbar')) || await page.isVisible('.v3-touchbar [data-tb="num"]')) fail('Avbryt ska synas, Mått först efter baspunkten');
  [x, y] = await at(6512318, 150109.6, 2);
  await tap(x, y);
  if (!(await page.isVisible('#v3SnapBar'))) fail('Fästlägesraden ska synas när man pekar ut punkter');
  if (!(await page.isVisible('.v3-touchbar [data-tb="num"]'))) fail('Mått… efter baspunkten: ' + JSON.stringify(await page.evaluate(() => [l3t.step, l3.tool, document.getElementById('v3Status').textContent, [...l3.sel]])));
  const a0 = await P('a');
  promptAnswer = '3;0;0';
  await page.tap('.v3-touchbar [data-tb="num"]'); await page.waitForTimeout(200);
  const a1 = await P('a');
  if (Math.abs(a1.x - a0.x - 3) > 1e-6 || Math.abs(a1.y - a0.y) > 1e-6) fail('Mått 3;0;0 ska flytta 3 m i X: ' + (a1.x - a0.x));
  // Avbryt / Välj.
  await page.tap('.v3-touchbar [data-tb="cancel"]'); await page.waitForTimeout(100);
  if (await page.evaluate(() => l3.tool) !== 'select') fail('✕ ska gå tillbaka till Välj');
  if (await page.isVisible('.v3-touchbar')) fail('Inga knappar när inget pågår');

  // --- Lägga till från biblioteket: panelen fälls ihop, tryck i 3D.
  await page.tap('#v3PalOpen'); await page.waitForTimeout(150);
  if (!(await page.isVisible('#v3Pal'))) fail('＋ Lägg till ska öppna biblioteket');
  const n0 = await page.evaluate(() => placements.length);
  await page.tap('#v3Lib [data-v3add="container"]'); await page.waitForTimeout(150);
  if (await page.isVisible('#v3Pal')) fail('Biblioteket ska fällas ihop när man valt objekt');
  if (!(await page.isVisible('.v3-touchbar [data-tb="cancel"]'))) fail('Avbryt ska synas när man lägger till');
  await top(); [x, y] = await at(6512345, 150125, 0); await tap(x, y);
  if (await page.evaluate(() => placements.length) !== n0 + 1) fail('Tryck i 3D ska lägga till containern');

  // --- Dialoger som ark nedtill.
  await page.evaluate(() => { l3SelectIds(['a']); l3OpenSpecial('copy'); });
  const db = await page.locator('#v3Special').boundingBox();
  if (db.x < 0 || db.x + db.width > 391 || db.y + db.height > 845) fail('Dialogen ska rymmas på skärmen: ' + JSON.stringify(db));
  await page.evaluate(() => l3DlgClose('v3Special'));
  if (process.env.SHOT) { await page.evaluate(() => l3SelectIds(['c'])); await page.waitForTimeout(300); await page.screenshot({ path: process.env.SHOT }); }
  // --- iPad liggande: inget sticker ut, panelerna ryms.
  await page.setViewportSize({ width: 1180, height: 820 }); await page.waitForTimeout(400);
  await page.evaluate(() => { l3Resize(); l3SelectIds(['c']); }); await page.waitForTimeout(200);
  const ip = await page.evaluate(() => { const side = document.getElementById('v3Side'), r = side.getBoundingClientRect(); return [document.documentElement.scrollWidth, document.getElementById('view3d').scrollWidth, innerWidth, Math.max(r.right, ...[...side.querySelectorAll('input,select,button')].map(e => e.getBoundingClientRect().right > r.right + 1 ? 99999 : 0))]; });
  if (ip[0] > ip[2] + 1 || ip[1] > ip[2] + 1 || ip[3] > ip[2] + 1) fail('iPad: inget får sticka ut: ' + ip);
  if (process.env.SHOT_IPAD) await page.screenshot({ path: process.env.SHOT_IPAD });
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3dmobile');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
