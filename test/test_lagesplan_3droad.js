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
  await page.evaluate(() => { L3R_DEF.bodies = false; });   // fyllnings-/schaktkropparna testas för sig (nedan)
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
  const made = await page.evaluate(async () => { const n0 = placements.length, hadBtn = !!document.querySelector('#v3RoadPanel [data-rb="ifc"]'); l3roadMake(); return { add: placements.length - n0, names: placements.slice(n0).map(p => p.name), closed: !l3road.cur, sel: l3.sel.size, hadBtn, sets: new Set(placements.slice(n0).map(p => p.set)).size }; });
  if (made.add !== 4 || made.sel !== 4 || !/Metertal/.test(made.names[0]) || !made.hadBtn || made.sets !== 1 || !made.closed || !made.names.some(n => /Byggväg/.test(n))) fail('Skapa objekt: ' + JSON.stringify(made));
  console.log('OK: Skapa objekt ger väg + schaktslänt + fyllningsslänt som vanliga ytor', JSON.stringify(made.names));
  // Metertalen som 3D-text: ett nät med text och streck (tillval) – av = bara de tre ytorna.
  const mt = await page.evaluate(async () => {
    const mk = async on => { l3SetPref('rdIfcMeters', on); const pts = window.__pts; l3roadOpen({ pts, spec: { ...L3R_DEF, src: ['pc:pcR'], mode: 'terrain', grade: 10, width: 5 }, res: null, geom: null, st: null, busy: '', err: '' }); const c = l3road.cur; for (let i = 0; i < 80 && !(c.res || c.err); i++) await new Promise(r => setTimeout(r, 150)); const n0 = placements.length; l3roadMake(); return placements.slice(n0); };
    const on = await mk(true), off = await mk(false), t = on.find(p => p.text);
    return { on: on.length, off: off.length, name: t && t.name, pts: t && t.m.pts.length, faces: t && t.m.faces.length, flat: t && Math.max(...t.m.pts.map(q => q[2])) - Math.min(...t.m.pts.map(q => q[2])), vol: l3dfSources().some(s => /Metertal/.test(s.label)) };
  });
  if (mt.on !== 4 || mt.off !== 3 || !/^Metertal byggväg/.test(mt.name || '') || !(mt.pts > 300) || !(mt.faces > 300) || mt.vol) fail('Metertal som 3D-text: ' + JSON.stringify(mt));
  console.log('OK: metertalen följer med som 3D-text (och streck) när rutan är ikryssad – av ger bara väg och slänter', JSON.stringify(mt));
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
    const r = l3rsDxf(10, true); out.dxf = !!r && r.n >= 6 && /SEK-MARK/.test(r.text) && /SEK-SLANT/.test(r.text) && /PROFIL-VAG/.test(r.text) && /Tv.rsektion/.test(r.text) && /Km 0\+030/.test(r.text);
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
  // Volym mot ritade objekt: punktmoln (z = 98) mot en ritad platta (z = 100) på 20 × 20 m ≈ 800 m³.
  const vo = await page.evaluate(async () => {
    const O = l3.O, x0 = 6512400, y0 = 150200, P = [];
    for (let y = -5; y <= 25; y += 0.5) for (let x = -5; x <= 25; x += 0.5) P.push(x - 10, y - 10, 0);
    l3pc.clouds.push({ id: 'pcV', name: 'Moln V', visible: false, dz: 0, nTot: P.length / 3, info: { center: [x0 + 10, y0 + 10, 98], min: [x0 - 5, y0 - 5, 98], max: [x0 + 25, y0 + 25, 98] }, chunks: [{ pos: new Float32Array(P) }] });
    const made = modCreate({ k: 'mesh', pts: [[0, 0, 0], [20, 0, 0], [20, 20, 0], [0, 20, 0]], faces: [[1, 2, 3], [1, 3, 4]], closed: false }, [x0, y0, 100], { name: 'Ritad platta', color: '#9ca3af', snapshot: false });
    const srcs = l3dfSources().map(s => s.k + '|' + s.label), key = 'ob:' + made.id;
    const cur = { pts: [[x0 + 2, y0 + 2, 99], [x0 + 18, y0 + 2, 99], [x0 + 18, y0 + 18, 99], [x0 + 2, y0 + 18, 99]], surf: null, spec: { a: { k: 'pc:pcV', side: 'top' }, b: { k: key, side: 'top', z: null }, cell: 0.5, tin: false } };
    const r = await l3volCompute(cur, () => true); return { has: srcs.some(s => s.startsWith(key + '|Ritat objekt: Ritad platta')), err: r.err, res: r.res && { cut: r.res.cut, fill: r.res.fill, net: r.res.net } };
  });
  if (!vo.has || vo.err || !(Math.abs(vo.res.cut + vo.res.fill - 256 * 2) < 25)) fail('Volym mot ritat objekt: ' + JSON.stringify(vo));
  console.log('OK: Volym kan räkna mot ritade objekt (t.ex. byggväg) – punktmoln mot ritad platta ger rätt volym', JSON.stringify(vo.res));
  // Volym mot byggvägen som helhet (väg + slänter) och mot markerade ritade objekt.
  const vs = await page.evaluate(async () => {
    const O = l3.O, x0 = 6512500, y0 = 150300, P = [];
    for (let y = -5; y <= 25; y += 0.5) for (let x = -5; x <= 25; x += 0.5) P.push(x - 10, y - 10, 0);
    l3pc.clouds.push({ id: 'pcS', name: 'Moln S', visible: false, dz: 0, nTot: P.length / 3, info: { center: [x0 + 10, y0 + 10, 98], min: [x0 - 5, y0 - 5, 98], max: [x0 + 25, y0 + 25, 98] }, chunks: [{ pos: new Float32Array(P) }] });
    const mkp = (xa, name, set) => { const p = modCreate({ k: 'mesh', pts: [[0, 0, 0], [8, 0, 0], [8, 16, 0], [0, 16, 0]], faces: [[1, 2, 3], [1, 3, 4]], closed: false }, [x0 + xa, y0, 100], { name, color: '#9ca3af', snapshot: false }); if (set) p.set = set; return p; };
    const a = mkp(2, 'Byggväg 16 m', 'S1'), b = mkp(10, 'Släntyta schakt', 'S1');   // två intilliggande delar: 2 × 128 m² på +2 m
    const srcs = l3dfSources(), set = srcs.find(s => s.k === 'obs:S1'); l3.sel = new Set([a.id, b.id]); const sel = l3dfSources().find(s => s.k.startsWith('obm:'));
    const calc = async key => { const cur = { pts: [[x0 + 1, y0 + 1, 99], [x0 + 19, y0 + 1, 99], [x0 + 19, y0 + 15, 99], [x0 + 1, y0 + 15, 99]], surf: null, spec: { a: { k: 'pc:pcS', side: 'top' }, b: { k: key, side: 'top', z: null }, cell: 0.5, tin: false } }; const r = await l3volCompute(cur, () => true); return r.res ? Math.round(r.res.cut + r.res.fill) : r.err; };
    return { set: set && set.label, sel: sel && sel.label, vSet: await calc('obs:S1'), vSel: await calc(sel.k), vOne: await calc('ob:' + a.id) };
  });
  if (!/Ritad helhet: Byggväg 16 m \(2 delar\)/.test(vs.set || '') || !/Markerade ritade objekt \(2\)/.test(vs.sel || '') || !(vs.vSet > vs.vOne * 1.8) || Math.abs(vs.vSet - vs.vSel) > 5) fail('Volym mot helhet: ' + JSON.stringify(vs));
  console.log('OK: byggväg + slänter kan väljas som en helhet (och markerade ritade objekt som en yta) i Volym', JSON.stringify(vs));
  // Äldre byggvägar utan märkning grupperas ändå som helhet (skapade inom några sekunder), och en markering på ett enda objekt går att välja.
  const lg = await page.evaluate(async () => {
    const t0 = Date.parse('2026-01-01T10:00:00Z'), mk = (name, dt) => { const p = modCreate({ k: 'mesh', pts: [[0, 0, 0], [4, 0, 0], [4, 4, 0], [0, 4, 0]], faces: [[1, 2, 3], [1, 3, 4]], closed: false }, [6512600, 150400, 100], { name, color: '#999', snapshot: false }); p.created_at = new Date(t0 + dt).toISOString(); delete p.set; return p; };
    const a = mk('Byggväg 127 m', 0), b = mk('Släntyta schakt', 300), c = mk('Släntyta fyllning', 600), d = mk('Annan platta', 1200);
    l3.sel = new Set([a.id]); const labels = l3dfSources().map(s => s.label), set = l3dfSources().find(s => /Ritad helhet: Byggväg 127 m/.test(s.label));
    return { set: set && set.label, one: labels.some(l => /Markerade ritade objekt \(1\)/.test(l)), n: set && l3dfObjOf(set.k).length };
  });
  if (!/\(3 delar\)/.test(lg.set || '') || !lg.one || lg.n !== 3) fail('Äldre helhet och enstaka markering: ' + JSON.stringify(lg));
  console.log('OK: äldre byggvägar grupperas som helhet och även en enstaka markering går att välja i Volym', JSON.stringify(lg));
  // Flytta punkt exakt: steg i modellens X/Y/Z, längs/tvärs/höjd, absoluta värden, Z till marken, ångra.
  const pm = await page.evaluate(async () => {
    const c = l3road.cur; c.spec.mode = 'terrain'; l3road.sel = 1; const out = {}; const P = () => c.pts[1].slice(), p0 = P();
    l3SetPref('rdPtMode', 'xyz'); l3SetPref('rdStep', 0.01); l3rNudge('x', 1, false); l3rNudge('y', -1, false); l3rNudge('z', 1, true); const p1 = P(); out.xyz = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]].map(v => Math.round(v * 1000) / 1000);
    l3rSetPt(2, 123.456); out.z = P()[2]; l3rSetPt(0, p0[0]); l3rSetPt(1, p0[1]);
    l3SetPref('rdPtMode', 'lat'); l3SetPref('rdStep', 1); const a = c.pts[0], b = c.pts[2], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), q0 = P(); l3rNudge('y', 1, false); const q1 = P();
    out.along = Math.round(((q1[0] - q0[0]) * dx / L + (q1[1] - q0[1]) * dy / L) * 100) / 100; out.acrossLeak = Math.round(Math.abs((q1[0] - q0[0]) * -dy / L + (q1[1] - q0[1]) * dx / L) * 100) / 100;
    l3rNudge('x', 1, false); const q2 = P(); out.right = Math.round(((q2[0] - q1[0]) * dy / L + (q2[1] - q1[1]) * -dx / L) * 100) / 100;
    const zg = c.ctx.gz(P()[0], P()[1]); l3rSetPt(2, l3rtR3(zg)); out.dz = Math.abs(P()[2] - zg) < 0.001;
    out.panel = !!document.querySelector('#v3RoadPanel [data-rpx]') && !!document.querySelector('#v3RoadPanel [data-rpn="z+"]');
    out.keys = (() => { const z0 = P()[2]; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true, cancelable: true })); return Math.round((P()[2] - z0) * 1000) / 1000; })();
    l3Undo(); out.undo = Math.round((P()[2] - c.pts[1][2]) * 1000) / 1000; return out; });
  if (pm.xyz.join() !== '0.01,-0.01,0.1' || pm.z !== 123.456 || pm.along !== 1 || pm.acrossLeak > 0.01 || pm.right !== 1 || !pm.dz || !pm.panel || pm.keys !== 1) fail('Flytta punkt exakt: ' + JSON.stringify(pm));
  console.log('OK: flytta punkt exakt – steg i X/Y/Z och längs/tvärs/höjd, absoluta värden, Z till marken, piltangenter', JSON.stringify(pm));
  // Vägöverbyggnad (lager): terrassyta, mängder per lager, schakt/fyllning till terrassen, objekt, sektion och DXF.
  if (process.env.SHOT3) await page.evaluate(() => { window.__shot3 = true; });
  const ly = await page.evaluate(async () => {
    const c = l3road.cur, out = {}; c.spec.mode = 'terrain'; c.spec.widen = []; c.spec.layersOn = false; l3rSchedule(0); for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 150)); if (c.res && !c.busy) break; }
    const cut0 = c.res.cut + c.res.fill; c.spec.layersOn = true; c.spec.layers = JSON.parse(JSON.stringify(L3R_PRESETS.bygg[1])); l3rSchedule(0); await new Promise(r => setTimeout(r, 300)); for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 150)); if (c.res && !c.busy && c.res.layers.length) break; }
    const R = c.res, D = 0.15 + 0.35 + 0.2; out.D = R.D; out.layers = R.layers.map(l => [l.name.slice(0, 6), l.t, Math.round(l.vol), Math.round(l.area)]); out.volOk = R.layers[1].vol > R.layers[1].area * 0.35 * 0.999 && R.layers[1].vol < R.layers[1].area * 0.35 * 1.5;   // sluttande kanter gör lagret något bredare nedåt
    { const p8 = c.st[8], tE = p8.wl + D * l3rK(c.spec); out.slopeFromTerrass = Math.abs(p8.L.ze - (p8.z - l3rFall(c.spec, tE) - D)) < 1e-6; } out.earthChanged = Math.round((R.cut + R.fill) - cut0) !== 0;
    if (window.__shot3) { l3rsOpen(); l3rsSet(30, false); }
    const sec = l3rsSection(c, 30); out.sec = [sec.layers.length, Math.round((sec.z - sec.zE) * 100) / 100]; const dx = l3rsDxf(10, false); out.dxf = !!dx && /SEK-LAGER-1/.test(dx.text) && /Terrass/.test(dx.text);
    const n0 = placements.length; l3roadMake(); const mk = placements.slice(n0); out.objs = mk.filter(p => p.layerObj).map(p => [p.name.slice(0, 12), p.m.faces.length]); out.panel = true;
    out.closed = mk.filter(p => p.layerObj).every(p => p.m.closed && p.m.pts.length === c.st.length * 6);
    l3roadOpen({ pts: window.__pts, spec: { ...L3R_DEF, src: ['pc:pcR'], mode: 'terrain', grade: 10, width: 5 }, res: null, geom: null, st: null, busy: '', err: '' }); const c2 = l3road.cur; for (let i = 0; i < 80 && !(c2.res || c2.err); i++) await new Promise(r => setTimeout(r, 150));
    return out; });
  if (process.env.SHOT3) { await page.waitForTimeout(500); await page.screenshot({ path: process.env.SHOT3 }); }
  if (Math.abs(ly.D - 0.7) > 1e-6 || ly.layers.length !== 3 || !ly.volOk || !ly.slopeFromTerrass || !ly.earthChanged || ly.sec[0] !== 3 || ly.sec[1] !== 0.7 || !ly.dxf || ly.objs.length !== 3 || !ly.closed) fail('Vägöverbyggnad: ' + JSON.stringify(ly));
  console.log('OK: vägöverbyggnad – lager med tjocklek, mängder per lager, terrassyta, schakt/fyllning till terrassen, objekt, sektion och DXF', JSON.stringify(ly));
  // Svensk tvärsektion: tvärfall, lager med sluttande kanter, terrassyta, dike med innerslänt/ytterslänt, ritning
  const xs = await page.evaluate(async () => {
    const out = {}; l3roadOpen({ pts: window.__pts, spec: { ...L3R_DEF, src: ['pc:pcR'], mode: 'terrain', grade: 10, width: 6, fall: 2.5, edgeK: 1.5, inK: 3, ditchD: 0.4, ditchBw: 0.6, cutR: 1, layersOn: true, layers: JSON.parse(JSON.stringify(L3R_PRESETS.gata[1])) }, res: null, geom: null, st: null, busy: '', err: '' });
    const c = l3road.cur; for (let i = 0; i < 80 && !(c.res || c.err); i++) await new Promise(r => setTimeout(r, 150)); if (c.err) return { err: c.err };
    const p = c.st[10], D = c.res.D, k = 1.5, tE = p.wl + D * k;
    out.fall = [l3rFall(c.spec, 3), l3rFall(c.spec, -3), l3rFall({ ...c.spec, fallMode: 'L' }, 3), l3rFall({ ...c.spec, fallMode: 'R' }, 3), l3rFall({ ...c.spec, fallMode: 'flat' }, 3)];
    const roadPos = c.geom.road.pos; out.roadEdgeDrop = Math.round((roadPos[2] - 0) * 0) + 0; const i0 = 10 * 3 * 3; out.drop = [roadPos[i0 + 2] - roadPos[i0 + 5], roadPos[i0 + 8] - roadPos[i0 + 5]].map(v => Math.round(v * 1000) / 1000);
    const cutSide = [p.L, p.R].find(S => S.kind === 'cut'); out.cut = !!cutSide; if (cutSide) { out.prof = cutSide.prof.length; out.inner = Math.round(cutSide.prof[1][0] * 100) / 100; out.innerExp = Math.round(0.4 * 3 * 100) / 100; out.bottomW = Math.round((cutSide.prof[2][0] - cutSide.prof[1][0]) * 100) / 100; out.ditchZ = Math.round((cutSide.prof[0][1] - cutSide.prof[1][1]) * 100) / 100; }
    const ze = p.L.ze; out.zeOk = Math.abs(ze - (p.z - l3rFall(c.spec, tE) - D)) < 1e-6;
    const M = l3rLayerMesh(c, c.geom, 2); out.layerPts = M.pts.length === c.st.length * 6; out.layerClosed = M.closed;
    const sec = l3rsSection(c, 30); out.lay = sec.lay.length; out.poly6 = sec.lay.every(l => l.poly.length === 6); out.terrW = Math.round((sec.tEl + sec.tEr) * 100) / 100; out.terrExp = Math.round((sec.wl + sec.wr + 2 * D * k) * 100) / 100;
    // nedersta lagret är bredare än vägbanan (sluttande kant)
    const lastPoly = sec.lay[sec.lay.length - 1].poly; out.bottomWider = Math.abs(lastPoly[3][0] - lastPoly[5][0]) > Math.abs(sec.lay[0].poly[0][0] - sec.lay[0].poly[2][0]) + 1;
    l3rsOpen(); l3rsSet(30, false); out.near = l3rs.near !== false; l3rs.near = false; l3rsRedraw(); out.drawn = true; l3rs.near = undefined;
    const g = c.geom; out.cutIdx = g.cut ? g.cut.idx.length : 0; out.panelFig = !!document.querySelector('#v3RoadPanel .v3-rd-fig') && document.querySelectorAll('#v3RoadPanel .v3-rd-k').length >= 8;
    l3rsClose(); return out; });
  console.log('tvärsektion:', JSON.stringify(xs));
  if (xs.err || Math.abs(xs.fall[0] - 0.075) > 1e-9 || Math.abs(xs.fall[1] - 0.075) > 1e-9 || Math.abs(xs.fall[2] - 0.075) > 1e-9 || Math.abs(xs.fall[3] + 0.075) > 1e-9 || xs.fall[4] !== 0 || !xs.cut || xs.prof !== 4 || xs.inner !== xs.innerExp || xs.bottomW !== 0.6 || xs.ditchZ !== 0.4 || !xs.zeOk || !xs.layerPts || !xs.layerClosed || xs.lay !== 4 || !xs.poly6 || Math.abs(xs.terrW - xs.terrExp) > 0.01 || !xs.bottomWider || !xs.drawn || !xs.panelFig) fail('Svensk tvärsektion: ' + JSON.stringify(xs));
  if (Math.abs(xs.drop[0] + 0.075) > 0.002 || Math.abs(xs.drop[1] + 0.075) > 0.002) fail('Tvärfall i vägytan (3 m halv bredd × 2,5 % = 7,5 cm lägre vid kanten än i mitten): ' + JSON.stringify(xs.drop));
  console.log('OK: svensk tvärsektion – tvärfall, lager som sluttande solider, terrassyta, dike med innerslänt, ytterslänt, ritning och förklarande figur');

  // Fyllning och schakt som slutna kroppar + vägens uppbyggnad (förval) + slänten hänger ihop mellan stationer
  const bd = await page.evaluate(async () => {
    const out = {}; l3roadOpen({ pts: window.__pts, spec: { ...L3R_DEF, src: ['pc:pcR'], mode: 'terrain', grade: 10, width: 5, bodies: true, layersOn: false }, res: null, geom: null, st: null, busy: '', err: '' });
    const c = l3road.cur; for (let i = 0; i < 80 && !(c.res || c.err); i++) await new Promise(r => setTimeout(r, 150)); if (c.err) return { err: c.err };
    const V = M => { let v = 0; M.faces.forEach(f => { const a = M.pts[f[0] - 1], b = M.pts[f[1] - 1], d = M.pts[f[2] - 1]; v += (a[0] * (b[1] * d[2] - b[2] * d[1]) - a[1] * (b[0] * d[2] - b[2] * d[0]) + a[2] * (b[0] * d[1] - b[1] * d[0])) / 6; }); return v; };
    const F = l3rBodyMesh(c, 'fill'), C = l3rBodyMesh(c, 'cut'); out.f = !!F; out.c = !!C; if (F) { out.fv = Math.round(V(F)); out.fRes = Math.round(c.res.fill); } if (C) { out.cv = Math.round(V(C)); out.cRes = Math.round(c.res.cut); }
    // alla stationer har fyrapunktsprofiler på båda sidor, även när slaget växlar mellan stationerna
    out.prof4 = c.st.every(p => p.L.prof.length === 4 && p.R.prof.length === 4);
    // förvalet: uppbyggnad + tvärfall
    const sp = { ...L3R_DEF }; l3rApplyPreset(sp, 'grus'); out.preset = [sp.layersOn, sp.layers.length, sp.fall]; const sp2 = { ...L3R_DEF }; l3rApplyPreset(sp2, 'gata'); out.preset2 = [sp2.layers.length, sp2.fall];
    l3roadClose(); l3roadOpen({ pts: window.__pts, spec: { ...L3R_DEF, src: ['pc:pcR'], mode: 'terrain', grade: 10, width: 5, bodies: true, layersOn: true, preset: 'bygg', layers: JSON.parse(JSON.stringify(L3R_PRESETS.bygg[1])) }, res: null, geom: null, st: null, busy: '', err: '' }); const c2 = l3road.cur; for (let i = 0; i < 80 && !(c2.res || c2.err); i++) await new Promise(r => setTimeout(r, 150));
    out.dropdown = !!document.querySelector('#v3RoadPanel select[data-rlp2]') && document.querySelector('#v3RoadPanel select[data-rlp2]').options.length >= 6; out.dropSel = document.querySelector('#v3RoadPanel select[data-rlp2]').value;
    const n0 = placements.length; l3roadMake(); const mk = placements.slice(n0); out.objs = mk.map(p => p.name.slice(0, 14)); out.bodyObjs = mk.filter(p => p.bodyObj).map(p => [p.bodyObj, p.m.closed, p.m.faces.length]); out.layerObjs = mk.filter(p => p.layerObj).length;
    l3roadOpen({ pts: window.__pts, spec: { ...L3R_DEF, src: ['pc:pcR'], mode: 'terrain', grade: 10, width: 5 }, res: null, geom: null, st: null, busy: '', err: '' }); const c3 = l3road.cur; for (let i = 0; i < 80 && !(c3.res || c3.err); i++) await new Promise(r => setTimeout(r, 150));   // lämnar en väg öppen åt nästa test
    return out; });
  console.log('kroppar:', JSON.stringify(bd));
  if (bd.err || !bd.f || !bd.c || Math.abs(bd.fv - bd.fRes) > 0.35 * Math.max(10, bd.fRes) || Math.abs(bd.cv - bd.cRes) > 0.35 * Math.max(10, bd.cRes) || !bd.prof4 || bd.preset[0] !== true || bd.preset[1] !== 3 || bd.preset[2] !== 4 || bd.preset2[0] !== 4 || bd.preset2[1] !== 2.5 || !bd.dropdown || bd.dropSel !== 'bygg' || bd.bodyObjs.length !== 2 || !bd.bodyObjs.every(b => b[1] && b[2] > 50) || bd.layerObjs !== 3) fail('Kroppar och uppbyggnad: ' + JSON.stringify(bd));
  console.log('OK: fyllning och schakt som slutna kroppar, volymerna stämmer med mängderna, uppbyggnadsval med lager och tvärfall, slänten hänger ihop mellan stationer');
  // Menyerna i flikar: en flik i taget, kompakt sammanfattning alltid synlig.
  const tb = await page.evaluate(async () => {
    const vis = () => [...document.querySelectorAll('#v3RoadPanel [data-rtab]')].filter(e => !e.hidden).map(e => e.dataset.rtab), out = {};
    out.def = vis(); document.querySelector('#v3RoadPanel [data-rt="over"]').click(); out.over = vis(); out.pref = l3Prefs().rdTab; out.mini = /Schakt/.test(document.querySelector('#v3RoadPanel [data-rmini]').textContent);
    document.querySelector('#v3RoadPanel [data-rt="kor"]').click(); out.kor = vis(); out.veh = !!document.querySelector('#v3RoadPanel [data-rtab="kor"] select[data-rv]');
    document.querySelector('#v3RoadPanel [data-rt="vag"]').click(); out.vag = vis(); out.tabs = document.querySelectorAll('#v3RoadPanel [data-rt]').length; out.h = Math.round(document.getElementById('v3RoadPanel').getBoundingClientRect().height);
    return out; });
  if (tb.over.join() !== 'over' || tb.kor.join() !== 'kor' || !tb.veh || tb.vag.join() !== 'vag' || tb.tabs !== 5 || tb.pref !== 'over' || !tb.mini) fail('Flikar i byggvägspanelen: ' + JSON.stringify(tb));
  console.log('OK: byggvägspanelen har flikar (Väg, Punkter, Breddning, Överbyggnad, Kör) och en kompakt sammanfattning', JSON.stringify(tb));
  if (process.env.SHOT4) { await page.evaluate(() => { l3SetPref('rdTab', 'over'); l3rPanel(); }); await page.screenshot({ path: process.env.SHOT4 }); }
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
