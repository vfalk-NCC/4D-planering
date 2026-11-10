const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9052;
const PDFJS = `window.pdfjsLib = { GlobalWorkerOptions: {}, AnnotationMode: { DISABLE: 0, ENABLE: 1 },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => {
    const vp = (s, ox = 0, oy = 0) => ({ width: 1000 * s, height: 500 * s, transform: [s, 0, 0, -s, ox, 500 * s + oy],
      convertToViewportPoint: (x, y) => [x * s + ox, (500 - y) * s + oy], convertToPdfPoint: (x, y) => [(x - ox) / s, 500 - (y - oy) / s] });
    return { view: [0, 0, 1000, 500], getViewport: ({ scale, offsetX, offsetY }) => vp(scale, offsetX || 0, offsetY || 0), render: ({ canvasContext: c, viewport: v }) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, v.width, v.height); return { promise: Promise.resolve(), cancel() {} };
    } };
  } }) }) };`;
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': q.url.includes('.js') ? 'application/javascript' : q.url.includes('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const fail = m => { throw new Error(m); };
  const page = await (await browser.newContext({ viewport: { width: 1300, height: 850 } })).newPage();
  await require('./_dialogs').bridge(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' ')));
  await page.addInitScript(() => { localStorage.setItem('4dplan-unlocked', '1'); localStorage.setItem('4dplan-settings', JSON.stringify({ githubToken: 't', userName: 'Victor' })); });
  await page.route('https://cdnjs.cloudflare.com/**', r => r.fulfill({ contentType: 'application/javascript', body: PDFJS }));
  await page.route('https://api.github.com/**', r => r.fulfill({ status: 404, body: '{}' }));
  await page.goto(`http://localhost:${PORT}/lagesplan.html?project=p1`); await page.waitForTimeout(900);
  await page.evaluate(async () => {
    plans = [{ id: 'A', name: 'Plan 1', file_path: 'a.pdf', calib: { model: [[6512300, 150100, 0], [6512400, 150100, 0]], pdf: [[0, 0], [1000, 0]] }, zones: [] }];
    pdfCache.set('A', new Uint8Array([1]).buffer); items = []; positions = []; renderPlanSelect(); await openPlan('A');
  });
  await page.click('#btn3d');
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  const r = await page.evaluate(async () => {
    // Punktmoln: sluttning 20 % längs x och 30 % tvärs (så att vägen får både schakt och fyllning).
    const c0 = [6512330, 150130, 100], P = [];
    for (let y = -30; y <= 30; y += 0.5) for (let x = -35; x <= 35; x += 0.5) P.push(x, y, 0.2 * x + 0.3 * y);
    l3pc.clouds.push({ id: 'pcR', name: 'Moln R', visible: false, dz: 0, nTot: P.length / 3, info: { center: c0, min: [c0[0] - 35, c0[1] - 30, 60], max: [c0[0] + 35, c0[1] + 30, 140] }, chunks: [{ pos: new Float32Array(P) }] });
    const pts = [[6512300, 150130, 100 + 0.2 * -30], [6512315, 150134, 100 + 0.2 * -15 + 0.3 * 4], [6512330, 150130, 100], [6512345, 150126, 100 + 3 - 1.2], [6512360, 150130, 106]].map(p => p.map(v => Math.round(v * 1000) / 1000));
    window.__pts = pts;
    l3roadOpen({ pts, spec: { ...L3R_DEF, src: ['pc:pcR'], grade: 10, width: 5, mode: 'terrain' }, res: null, geom: null, st: null, busy: '', err: '' });
    for (let i = 0; i < 80 && !(l3road.cur && (l3road.cur.res || l3road.cur.err)); i++) await new Promise(r => setTimeout(r, 150));
    const c = l3road.cur; if (!c) return { err: 'ingen väg' };
    if (c.err) return { err: c.err };
    const res = c.res, st = c.st; let maxG = 0; for (let i = 1; i < st.length; i++) maxG = Math.max(maxG, Math.abs(st[i].z - st[i - 1].z) / (st[i].s - st[i - 1].s));
    return { res: { len: res.len, maxG, cut: res.cut, fill: res.fill, slopeCut: res.slopeCut, slopeFill: res.slopeFill, unreached: res.unreached, tight: res.tight.length }, hasRoad: !!c.geom.road.idx.length, hasCut: !!c.geom.cut, hasFill: !!c.geom.fill, panel: !!document.getElementById('v3RoadPanel'), txt: document.getElementById('v3RoadPanel').innerText.slice(0, 200) };
  });
  if (process.env.SHOT) { await page.evaluate(() => { const c = l3road.cur, O = l3.O, t = new THREE.Vector3(6512330 - O[0], 150130 - O[1], 100 - O[2]); // ytan som mesh för bild
      const g = new THREE.PlaneGeometry(70, 60, 70, 60), pa = g.getAttribute('position'); for (let i = 0; i < pa.count; i++) pa.setZ(i, 0.2 * pa.getX(i) + 0.3 * pa.getY(i)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x8a8f98, side: THREE.DoubleSide })); m.position.copy(t); m.userData.noHit = true; l3.scene.add(m);
      l3.camera.position.set(t.x - 30, t.y - 55, t.z + 45); l3.orbit.target.copy(t); l3.camera.lookAt(t); l3.camera.updateMatrixWorld(); l3.orbit.update(); l3Render(); }); await page.waitForTimeout(500); await page.screenshot({ path: process.env.SHOT }); }
  if (r.err) fail('Byggväg: ' + r.err);
  if (!(r.res.len > 55 && r.res.len < 80) || r.res.maxG > 0.1005) fail('Längd/lutning: ' + JSON.stringify(r));
  if (!r.hasRoad || !r.hasCut || !r.hasFill || r.res.cut < 20 || r.res.fill < 20 || r.res.slopeCut < 10 || r.res.slopeFill < 10) fail('Väg, slänter och volymer ska finnas: ' + JSON.stringify(r));
  if (!r.panel || !/Byggväg/.test(r.txt)) fail('Panelen ska visas: ' + r.txt);
  console.log('OK: byggvägen följer punktmolnet, lutningen begränsas till 10 %, slänter i schakt och fyllning med volymer', JSON.stringify(r.res));
  // Skapa objekt: tre ritade ytor (väg, schaktslänt, fyllningsslänt).
  const made = await page.evaluate(async () => { const n0 = placements.length; l3roadMake(); return { add: placements.length - n0, names: placements.slice(n0).map(p => p.name), closed: !l3road.cur }; });
  if (made.add !== 3 || !made.closed || !/Byggväg/.test(made.names[0])) fail('Skapa objekt: ' + JSON.stringify(made));
  console.log('OK: Skapa objekt ger väg + schaktslänt + fyllningsslänt som vanliga ytor', JSON.stringify(made.names));
  // Mät → Byggväg: mittlinjen via verktyget (Enter avslutar) öppnar panelen.
  const tool = await page.evaluate(async () => {
    l3SetPref('measure', 'road'); l3SetTool('measure');
    l3t.mp = window.__pts.map(p => new THREE.Vector3(p[0] - l3.O[0], p[1] - l3.O[1], p[2] - l3.O[2]));
    l3roadStart(); await new Promise(r => setTimeout(r, 1500));
    const seg = [...document.querySelectorAll('[data-mmode]')].map(b => b.textContent);
    return { open: !!l3road.cur, seg };
  });
  if (!tool.open || !tool.seg.includes('Byggväg')) fail('Verktyget Byggväg: ' + JSON.stringify(tool));
  // Höjdpunkt: som standard den högsta klickade punkten; vägen går aldrig över den och lutningen begränsas därifrån.
  const an = await page.evaluate(async () => { const c = l3road.cur; c.spec.mode = 'anchor'; l3rSchedule(0); for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 150)); if (c.res && !c.busy && c.st && c.st.length) break; } return { mode: c.spec.mode, top: Math.max(...c.pts.map(p => p[2])), maxZ: Math.max(...c.st.map(p => p.z)), maxG: c.res.maxG, grade: c.spec.grade }; });
  if (an.mode !== 'anchor' || an.maxZ > an.top + 0.01 || an.maxG > an.grade / 100 + 0.0005) fail('Höjdpunkt: ' + JSON.stringify(an));
  console.log('OK: Från höjdpunkt – högsta punkten du klickat är vägens högsta och lutningen begränsas därifrån', JSON.stringify(an));
  // Lastbil som kör vägen: följer höjden och lutningen, kommer framåt, loop.
  const dr = await page.evaluate(async () => {
    const c = l3road.cur; l3rDriveReset(); l3rDriveToggle(); const out = { grp: !!l3rDrv.grp, on: l3rDrv.on };
    l3rDrv.follow = false; let txt = ''; for (let i = 0; i < 20; i++) txt = l3rDriveStep(0.5);
    const g = l3rDrv.grp, O = l3.O, p = g.position, near = c.st.reduce((b, q) => Math.min(b, Math.hypot(q.x - O[0] - p.x, q.y - O[1] - p.y)), 1e9);
    out.s = l3rDrv.s; out.near = near; out.zOff = Math.abs(l3rAt(c.st, l3rDrv.s + 1.8).z - O[2] - p.z); out.pitchSign = Math.sign(-g.rotation.y); out.txt = txt; out.kids = g.children[0].children.length;
    l3rDrv.s = c.st[c.st.length - 1].s; l3rDriveStep(0.2); out.loop = l3rDrv.s;
    l3rDriveStop(true); out.removed = !l3rDrv.grp; return out;
  });
  if (!dr.grp || !dr.on || dr.s < 5 || dr.near > 1.5 || dr.zOff > 1.2 || dr.kids < 20 || !/km\/h/.test(dr.txt) || dr.loop > 1 || !dr.removed) fail('Lastbil: ' + JSON.stringify(dr));
  console.log('OK: lastbilen kör vägen – följer höjd och lutning, avläsning, loop och städas bort', JSON.stringify(dr));
  // Genom mina punkter: vägens höjd följer klickpunkternas höjd (högsta punkten blir vägens högsta).
  const pn = await page.evaluate(async () => { const c = l3road.cur; c.spec.mode = 'pins'; l3rSchedule(0); for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 150)); if (c.res && !c.busy && c.st && c.st.length) break; }
    const zs = c.st.map(p => p.z), top = Math.max(...c.pts.map(p => p[2])), at = c.pts.map(p => { let b = 1e9, z = 0; c.st.forEach(q => { const d = Math.hypot(q.x - p[0], q.y - p[1]); if (d < b) { b = d; z = q.z; } }); return Math.abs(z - p[2]); });
    const r = { maxZ: Math.max(...zs), top, off: Math.max(...at) }; c.spec.mode = 'terrain'; l3rSchedule(0); for (let i = 0; i < 60; i++) { await new Promise(r2 => setTimeout(r2, 150)); if (c.res && !c.busy) break; } return r; });
  if (Math.abs(pn.maxZ - pn.top) > 0.01 || pn.off > 0.6) fail('Genom mina punkter: ' + JSON.stringify(pn));
  console.log('OK: Genom mina punkter – vägen går genom klickpunkternas höjd, högsta punkten blir vägens högsta', JSON.stringify(pn));
  // Glest punktmoln: marken saknas strax utanför vägen – slänten ska ändå ritas (hål fylls, senast kända markhöjd används).
  const sp = await page.evaluate(async () => {
    const c0 = [6512330, 150130, 100], P = [];
    for (let y = -2.6; y <= 2.6; y += 0.5) for (let x = -35; x <= 35; x += 0.5) P.push(x, y, 0.1 * x);
    l3pc.clouds.push({ id: 'pcH', name: 'Moln H', visible: false, dz: 0, nTot: P.length / 3, info: { center: c0, min: [c0[0] - 35, c0[1] - 3, 60], max: [c0[0] + 35, c0[1] + 3, 140] }, chunks: [{ pos: new Float32Array(P) }] });
    const pts = [[6512300, 150130, 97], [6512360, 150130, 103]];
    l3roadOpen({ pts, spec: { ...L3R_DEF, src: ['pc:pcH'], mode: 'terrain', width: 4, grade: 5 }, res: null, geom: null, st: null, busy: '', err: '' });
    const c = l3road.cur; for (let i = 0; i < 80 && !(c.res || c.err); i++) await new Promise(r => setTimeout(r, 150));
    return c.err ? { err: c.err } : { slopes: c.res.slopeCut + c.res.slopeFill, hasCut: !!c.geom.cut, hasFill: !!c.geom.fill };
  });
  if (sp.err || !(sp.slopes > 5)) fail('Slänt vid glest moln: ' + JSON.stringify(sp));
  console.log('OK: slänten ritas även där punktmolnet saknar mark utanför vägen', JSON.stringify(sp));
  // Tvärsektion och längdprofil: ritas, följer reglaget, exporterar DXF med sektioner och profil.
  const sc = await page.evaluate(async () => {
    const c = l3road.cur; c.spec.mode = 'terrain'; l3rSchedule(0); for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 150)); if (c.res && !c.busy && c.st && c.ctx) break; }
    l3rsOpen(); await new Promise(r => setTimeout(r, 400)); const out = { panel: !!document.getElementById('v3RoadSec'), cv: !!l3rs.cv && l3rs.cv.width > 50 };
    out.dim = [l3rs.cv.clientWidth, l3rs.cv.clientHeight, l3rs.cv.width, l3rs.lp.clientWidth];
    l3rsSet(30, false); const a = l3rs.sec; l3rsSet(45, false); const b = l3rs.sec;
    out.s = [a.s, b.s]; out.hasGround = a.ground.filter(q => q[1] !== null).length > 20; out.line = a.line.length; out.scatter = (l3rs.scat || []).length; out.areas = [a.cut, a.fill].map(v => Math.round(v * 10) / 10);
    out.differ = Math.abs(a.z - b.z) > 0.5 || Math.abs((a.gc || 0) - (b.gc || 0)) > 0.5;
    const r = l3rsDxf(10, true); out.dxf = !!r && r.n >= 6 && /SEK-MARK/.test(r.text) && /SEK-SLANT/.test(r.text) && /PROFIL-VAG/.test(r.text) && /Tv.rsektion/.test(r.text) && /Station 0\+030/.test(r.text);
    l3rsClose(); out.closed = !document.getElementById('v3RoadSec'); return out; });
  if (process.env.SHOT2) { await page.evaluate(() => { l3rsOpen(); l3rsSet(33, false); }); await page.waitForTimeout(500); await page.screenshot({ path: process.env.SHOT2 }); await page.evaluate(() => l3rsClose()); }
  if (!sc.panel || !sc.cv || !sc.hasGround || sc.line < 3 || !sc.differ || !sc.dxf || !sc.closed) fail('Tvärsektion: ' + JSON.stringify(sc));
  console.log('OK: tvärsektion och längdprofil – mark, väg, slänter, areor, punkter i skivan, reglage och DXF med sektioner och profil', JSON.stringify(sc));
  // Lokal breddning: bredare mellan två sträckor och avtonad; syns i snittet och i ytan.
  const bw = await page.evaluate(async () => {
    const c = l3road.cur; c.spec.mode = 'terrain'; c.spec.widen = []; l3rSchedule(0); for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 150)); if (c.res && !c.busy) break; }
    const area0 = c.res.roadArea; c.spec.widen = [{ s0: 20, s1: 35, add: 4, side: 'both', taper: 8 }]; l3rSchedule(0); await new Promise(r => setTimeout(r, 300));
    for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 150)); if (c.res && !c.busy && c.res.roadArea > area0 + 1) break; }
    const mid = l3rsSection(c, 27), far = l3rsSection(c, 3), tap = l3rsSection(c, 16);
    const out = { area0: Math.round(area0), area1: Math.round(c.res.roadArea), mid: [mid.wl, mid.wr], far: [far.wl, far.wr], tap: tap.wl, W: c.spec.width, stW: c.st.map(p => p.wl).filter(v => v > c.spec.width / 2 + 3.9).length };
    c.spec.widen = [{ s0: 20, s1: 35, add: 3, side: 'L', taper: 5 }]; const one = l3rsSection(c, 27); out.one = [one.wl, one.wr]; c.spec.widen = []; l3rSchedule(0); return out; });
  if (!(bw.area1 > bw.area0 + 20) || Math.abs(bw.mid[0] - (bw.W / 2 + 4)) > 0.01 || Math.abs(bw.mid[1] - (bw.W / 2 + 4)) > 0.01 || bw.far[0] !== bw.W / 2 || !(bw.tap > bw.W / 2 + 0.3 && bw.tap < bw.W / 2 + 3.8) || bw.one[0] !== bw.W / 2 + 3 || bw.one[1] !== bw.W / 2) fail('Breddning: ' + JSON.stringify(bw));
  console.log('OK: lokal breddning – bredare mellan två sträckor på båda eller en sida, avtonas mjukt, ger större vägyta', JSON.stringify(bw));
  // Slänter åt båda hållen: väg i skärning (marken högre på båda sidor) ska få schaktslänt på både vänster och höger sida.
  const bs = await page.evaluate(async () => {
    const c0 = [6512330, 150130, 100], P = [];
    for (let y = -30; y <= 30; y += 0.5) for (let x = -35; x <= 35; x += 0.5) P.push(x, y, 0.1 * x + 0.0 * y);
    l3pc.clouds.push({ id: 'pcB', name: 'Moln B', visible: false, dz: 0, nTot: P.length / 3, info: { center: c0, min: [c0[0] - 35, c0[1] - 30, 60], max: [c0[0] + 35, c0[1] + 30, 140] }, chunks: [{ pos: new Float32Array(P) }] });
    const pts = [[6512300, 150130, 97 - 2.5], [6512330, 150136, 100 - 2.5], [6512360, 150130, 103 - 2.5]];
    l3roadOpen({ pts, spec: { ...L3R_DEF, src: ['pc:pcB'], mode: 'pins', width: 4 }, res: null, geom: null, st: null, busy: '', err: '' });
    const c = l3road.cur; for (let i = 0; i < 80 && !(c.res || c.err); i++) await new Promise(r => setTimeout(r, 150));
    if (c.err) return { err: c.err };
    const side = sd => c.st.filter(p => p[sd].kind === 'cut' && p[sd].d > 0.5).length, G = c.geom.cut, tris = G ? G.idx.length / 3 : 0;
    // trianglarnas sida: normalen vinkelrätt mot färdriktningen – räkna trianglar med medelpunkt vänster respektive höger om mittlinjen
    let left = 0, right = 0; if (G) for (let i = 0; i < G.idx.length; i += 3) { let cx = 0, cy = 0; for (let k = 0; k < 3; k++) { cx += G.pos[G.idx[i + k] * 3] + c.geom.org[0]; cy += G.pos[G.idx[i + k] * 3 + 1] + c.geom.org[1]; } cx /= 3; cy /= 3;
      const near = c.st.reduce((b, q) => Math.hypot(q.x - cx, q.y - cy) < Math.hypot(b.x - cx, b.y - cy) ? q : b), side2 = (cx - near.x) * near.nx + (cy - near.y) * near.ny; if (side2 > 0) left++; else right++; }
    return { L: side('L'), R: side('R'), n: c.st.length, tris, left, right };
  });
  if (bs.err || bs.L < bs.n * 0.8 || bs.R < bs.n * 0.8 || bs.left < 20 || bs.right < 20 || Math.abs(bs.left - bs.right) > bs.tris * 0.2) fail('Slänter åt båda hållen: ' + JSON.stringify(bs));
  console.log('OK: slänter ritas åt både vänster och höger (väg i skärning)', JSON.stringify(bs));
  // Metertal längs linjen + breddningens sträcka som etikett.
  const ml = await page.evaluate(async () => {
    const c = l3road.cur; c.spec.widen = [{ s0: 20, s1: 35, add: 4, side: 'both', taper: 8 }]; l3rDraw(); const el = () => [...l3m.labels.entries()].filter(([k]) => k.startsWith('road:')).map(([k, e]) => [k, e.textContent]);
    const a = el(); l3mDraw(); const b = el(); c.spec.widen = []; l3rDraw(); const cc = el(); return { a, nb: b.length, nc: cc.length };
  });
  const txt = ml.a.map(x => x[1]);
  if (!txt.includes('0 m') || !txt.includes('10 m') || !txt.includes('20 m') || !txt.some(t => /Bredd\. 20–35 m/.test(t)) || ml.nb !== ml.a.length || ml.nc >= ml.a.length) fail('Metertal på linjen: ' + JSON.stringify(ml));
  console.log('OK: metertal längs linjen och breddningens sträcka syns som etiketter (överlever omritning)', JSON.stringify(txt));
  // Avancerat: breddning runt objekt (peka ut hörn + offset) och dragbara start/slut på linjen.
  const ad = await page.evaluate(async () => {
    const c = l3road.cur, O = l3.O; c.spec.mode = 'terrain'; c.spec.widen = []; const out = {};
    // Pekar ut ett objekt på höger sida (negativt y) via samma väg som i verktyget: samla hörn, Enter.
    l3rCaptureStart(-1); l3t.mp = [[6512325, 150128], [6512335, 150128], [6512335, 150126], [6512325, 150126]].map(p => new THREE.Vector3(p[0] - O[0], p[1] - O[1], 0)); l3roadStart();
    out.zone = (c.spec.widen[0] || {}).kind; out.cap = !!l3road.capture; c.spec.widen[0].offset = 2; l3rSchedule(0);
    for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 150)); if (c.res && !c.busy) break; }
    const mid = l3rsSection(c, c.pts[0] ? 30 : 30), far = l3rsSection(c, 3), side = l3rsSection(c, 36); out.mid = [mid.wl, mid.wr]; out.far = [far.wl, far.wr]; out.edge = [side.wl, side.wr];
    out.W2 = c.spec.width / 2; out.labels = [...l3m.labels.entries()].some(([k, e]) => k === 'road:o0' && /Runt objekt/.test(e.textContent));
    // Dragbara handtag
    c.spec.widen = [{ s0: 20, s1: 35, add: 3, side: 'both', taper: 5 }]; l3SetPref('rdHandles', true); l3rDraw(); l3rwPlace(); out.handles = l3rw.els.length;
    const a = l3rPosAt(c, 40), q = l3ToScreen(new THREE.Vector3(a.x - O[0], a.y - O[1], a.z - O[2])), r0 = l3.renderer.domElement.parentElement.getBoundingClientRect();
    out.sAt = Math.round(l3rwSAt(q.x + r0.left, q.y + r0.top)); l3rwMove(0, 's1', 44.26); out.s1 = c.spec.widen[0].s1; l3rwMove(0, 's0', 99); out.s0 = c.spec.widen[0].s0;
    l3SetPref('rdHandles', false); l3rwPlace(); out.off = l3rw.els.length; return out; });
  if (ad.zone !== 'obj' || ad.cap || !(ad.mid[1] > ad.W2 + 6) || ad.mid[1] > ad.W2 + 12 || ad.mid[0] !== ad.W2 || ad.far[1] !== ad.W2 || !(ad.edge[1] > ad.W2 + 2) || !ad.labels || ad.handles !== 2 || Math.abs(ad.sAt - 40) > 1 || ad.s1 !== 44.5 || ad.s0 !== 44.5 || ad.off !== 0) fail('Avancerad breddning: ' + JSON.stringify(ad));
  console.log('OK: avancerat – breddning runt utpekat objekt (kontur + offset, bara på objektets sida) och dragbara start/slut på linjen', JSON.stringify(ad));
  // Handtag: en ring per punkt, + mellan ringarna, ta bort med högerklick/funktion, Ctrl+Z ångrar.
  const hd = await page.evaluate(async () => {
    const c = l3road.cur, n0 = c.pts.length, out = {}; l3mHandlesPlace(); out.rings = l3mH.els.length; out.plus = l3mH.plus.length; out.n0 = n0;
    l3mPlusDown({ button: 0, preventDefault() {}, stopPropagation() {} }, 1); window.dispatchEvent(new PointerEvent('pointerup')); await new Promise(r => setTimeout(r, 200));
    out.afterAdd = c.pts.length; out.ringsAdd = l3mH.els.length;
    l3roadRemovePt(2); out.afterRemove = c.pts.length;
    if (typeof l3Undo === 'function') { l3Undo(); out.afterUndo = c.pts.length; }
    for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 150)); if (c.res && !c.busy) break; }
    out.res = !!c.res; return out;
  });
  if (hd.rings !== hd.n0 || hd.plus !== hd.n0 - 1 || hd.afterAdd !== hd.n0 + 1 || hd.ringsAdd !== hd.n0 + 1 || hd.afterRemove !== hd.n0 || (hd.afterUndo !== undefined && hd.afterUndo !== hd.n0 + 1) || !hd.res) fail('Handtag på byggvägen: ' + JSON.stringify(hd));
  console.log('OK: byggvägens punkter har dragringar, + lägger till punkt, punkt kan tas bort och ångras', JSON.stringify(hd));
  // Lutningsgräns: 5 % ger en flackare väg (mer schakt/fyllning).
  const g5 = await page.evaluate(async () => { const c = l3road.cur; c.spec.mode = 'terrain'; c.spec.grade = 5; l3rSchedule(0); for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 150)); if (!c.busy && c.res && c.res.maxG < 0.0505) break; } return c.res.maxG; });
  if (g5 > 0.0505) fail('5 % gräns: ' + g5);
  console.log('OK: Mät → Byggväg öppnar panelen och högsta lutning kan ändras');
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
