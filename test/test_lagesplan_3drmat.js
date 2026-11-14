const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs'), { spawn } = require('child_process');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9888;
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
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer && typeof l3api !== 'undefined', null, { timeout: 15000 });


  const J = (v) => JSON.stringify(v);
  // enkel scen: två lådor och en kamera snett ovanifrån
  const S0 = await page.evaluate(() => {
    const O = l3.O, mk = (x, y, w, d, h, name, color) => { const L = MG.rect2([-w / 2, -d / 2], [w / 2, d / 2]).map(q => [MG.r3(q[0]), MG.r3(q[1])]), p = modCreate({ k: 'solid', pl: { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] }, loops: [MG.ccw(L)], d: h }, [O[0] + x, O[1] + y, O[2]], { name, color }); return p.id; };
    const a = mk(0, 0, 6, 4, 3, 'A', '#a8b3c4'), b = mk(10, 0, 6, 4, 3, 'B', '#a8b3c4');
    l3.camera.position.set(12, -22, 14); l3.orbit.target.set(5, 0, 1); l3.orbit.update(); l3.camera.updateMatrixWorld();
    return { a, b };
  });
  const pxAt = (wx, wy, wz) => page.evaluate(async ([wx, wy, wz, opt]) => {
    const r = await l3rnRender({ samples: 3, width: 400, soft: 0.5, ...opt }), q = new THREE.Vector3(wx, wy, wz).project(l3.camera), X = Math.round((q.x + 1) / 2 * r.canvas.width), Y = Math.round((1 - q.y) / 2 * r.canvas.height);
    if (X < 0 || Y < 0 || X >= r.canvas.width || Y >= r.canvas.height) throw new Error('punkten ligger utanför bilden: ' + [wx, wy, wz, X, Y, r.canvas.width, r.canvas.height]);
    const d = r.canvas.getContext('2d').getImageData(X, Y, 1, 1).data; return [d[0], d[1], d[2]];
  }, [wx, wy, wz, {}]);
  const lum = c => (c[0] + c[1] + c[2]) / 3;

  // 1) biblioteket
  const lib = await page.evaluate(() => { const out = { n: L3RM_LIB.length, groups: L3RM_GROUPS.length, bad: [], ids: new Set(L3RM_LIB.map(m => m.id)).size, thumbs: 0 };
    L3RM_LIB.forEach(m => { const t = l3rmTextures(m), a = t.alb.image.getContext('2d').getImageData(0, 0, 512, 512).data; let mn = 255, mx = 0; for (let i = 0; i < a.length; i += 4 * 211) { const l = a[i] + a[i + 1] + a[i + 2]; mn = Math.min(mn, l); mx = Math.max(mx, l); } if (!(m.id.startsWith('farg_') || m.id === 'gummi' || m.id.startsWith('glas')) && mx - mn < 20) out.bad.push(m.id); if (l3rmThumb(m.id).startsWith('data:image/png')) out.thumbs++; });
    return out; });
  if (lib.n < 45 || lib.groups !== 7 || lib.ids !== lib.n || lib.bad.length || lib.thumbs !== lib.n) fail('Materialbiblioteket ska ha ≥45 material med riktiga texturer: ' + J(lib));
  console.log('OK: biblioteket – ' + lib.n + ' material i 7 grupper, alla med sömlösa texturer och miniatyrer');

  // 2) editorn påverkas inte, och material syns i bilden
  const base = await pxAt(0, 0, 3.0);
  const before = await page.evaluate(id => { const g = l3.placeMeshes.get(id), ms = []; g.traverse(o => { if (o.isMesh) ms.push(o); }); const o = ms[0], m = o.material; return { n: ms.length, uuid: m.uuid, color: m.color.getHex(), map: !!m.map, type: m.type, meshes: l3.scene.children.length, total: (() => { let c = 0; l3.scene.traverse(() => c++); return c; })() }; }, S0.a);
  await page.evaluate(id => l3rmSetRule({ t: 'obj', ref: id }, 'tegel_rod', { s: 1 }), S0.a);
  const withMat = await pxAt(0, 0, 3.0);
  const after = await page.evaluate(id => { const g = l3.placeMeshes.get(id), ms = []; g.traverse(o => { if (o.isMesh) ms.push(o); }); const o = ms[0], m = o.material; return { n: ms.length, uuid: m.uuid, color: m.color.getHex(), map: !!m.map, type: m.type, mat: !!m.userData.l3rm, total: (() => { let c = 0, tmp = 0; l3.scene.traverse(x => { c++; if (x.userData && x.userData.l3rmTmp) tmp++; }); return [c, tmp]; })(), busy: l3rn.busy }; }, S0.a);
  if (Math.abs(withMat[0] - base[0]) + Math.abs(withMat[1] - base[1]) + Math.abs(withMat[2] - base[2]) < 40 || !(withMat[0] > withMat[2] + 15)) fail('Tegelmaterialet ska synas i renderingen (rödaktigt): ' + J({ base, withMat }));
  if (after.uuid !== before.uuid || after.color !== before.color || after.map !== before.map || after.mat || after.total[1] !== 0 || after.busy) fail('Editorns material ska vara orörda efter renderingen: ' + J({ before, after }));
  const edit = await page.evaluate(id => { l3vmSet('shaded', true); const g = l3.placeMeshes.get(id); let m; g.traverse(o => { if (o.isMesh && !m) m = o.material; }); return { type: m.type, userData: !!m.userData.l3rm, hasMap: !!m.map }; }, S0.a);
  if (edit.userData || edit.hasMap) fail('Editorns material ska vara oförändrade: ' + J(edit));
  console.log('OK: renderingsmaterial syns i bilden men editorns material är orörda (samma material, färg, ingen textur, inga kvarlämnade nät)', J({ base, withMat }));

  // 3) sparas i projektet (plan.render)
  const saved = await page.evaluate(() => ({ has: !!plan.render, rules: plan.render && plan.render.rules.length, json: JSON.stringify(plan).includes('"tegel_rod"') }));
  if (!saved.has || saved.rules !== 1 || !saved.json) fail('Reglerna ska sparas i planen: ' + J(saved));
  console.log('OK: regler, mark och miljö sparas i planen (plan.render)');

  // 4) regelprioritet: objekt före färg
  await page.evaluate(() => l3rmSetRule({ t: 'color', ref: '#a8b3c4' }, 'granit', {}));
  const pa = await pxAt(0, 0, 3.0), pb = await pxAt(10, 0, 3.0);
  if (Math.abs(lum(pa) - lum(pb)) < 8 && Math.abs(pa[0] - pb[0]) < 8) fail('A (objektregel) och B (färgregel) ska se olika ut: ' + J({ pa, pb }));
  if (!(pa[0] > pa[2] + 15)) fail('Objektregeln (tegel) ska gå före färgregeln: ' + J({ pa, pb }));
  console.log('OK: regelordning – objekt går före färg');

  // 5) marken: grundmaterial och väg
  await page.evaluate(() => { l3rmData().rules = []; l3rmSetGroundBase('gras', { s: 1 }); });
  const gp = await pxAt(5, 8, 0.0);
  if (!(gp[1] > gp[0] + 6 && gp[1] > gp[2] + 12)) fail('Marken ska bli grön med gräs: ' + J(gp));
  const road = await page.evaluate(() => { const O = l3.O; const a = l3rmAddArea({ kind: 'road', pts: [[O[0] - 20, O[1] - 7], [O[0] + 30, O[1] - 7]], width: 5, mat: 'asfalt', name: 'Väg' }); return a.id; });
  const rp = await pxAt(5, -7, 0.02);
  const gr2 = gp;
  if (lum(rp) === 0) { const again = await pxAt(5, -12, 0.02), info = await page.evaluate(() => ({ last: l3rn.last && [l3rn.last.width, l3rn.last.height, l3rn.last.samples], size: l3.renderer.getSize(new THREE.Vector2()).toArray(), areas: l3rmData().ground.areas.length, base: !!l3rmData().ground.base, busy: l3rn.busy })); console.log('DIAG', J({ again, info })); }
  if (!(lum(rp) < lum(gr2) - 8 && lum(rp) > 15 && Math.abs(rp[0] - rp[1]) < 30)) fail('Vägen ska vara mörkare grå asfalt mot gräset: ' + J({ rp, gr2 }));
  const gcount = await page.evaluate(() => { let tmp = 0; l3.scene.traverse(x => { if (x.userData && x.userData.l3rmTmp) tmp++; }); return { tmp, planMesh: l3.planMesh ? l3.planMesh.visible : null, areas: l3rmData().ground.areas.length }; });
  if (gcount.tmp !== 0) fail('Markytorna ska tas bort efter renderingen: ' + J(gcount));
  console.log('OK: marken – grundmaterial (gräs) och väg (asfalt) syns i bilden och tas bort efteråt', J({ gp, rp }));
  await page.evaluate(id => l3rmRemoveArea(id), road);

  // 6) miljön
  await page.evaluate(() => l3rmSetEnv({ time: 'dag', clouds: 0 }));
  const dayL = await page.evaluate(async () => { const r = await l3rnRender({ samples: 3, width: 300, soft: 0.5 }), d = r.canvas.getContext('2d').getImageData(0, 0, r.canvas.width, r.canvas.height).data; let s = 0; for (let i = 0; i < d.length; i += 40) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 40) / 3; });
  await page.evaluate(() => l3rmSetEnv({ time: 'kvall', clouds: 0.8, haze: 0.5 }));
  const eveL = await page.evaluate(async () => { const r = await l3rnRender({ samples: 3, width: 300, soft: 0.5 }), d = r.canvas.getContext('2d').getImageData(0, 0, r.canvas.width, r.canvas.height).data; let s = 0, red = 0, blue = 0; for (let i = 0; i < d.length; i += 40) { s += d[i] + d[i + 1] + d[i + 2]; red += d[i]; blue += d[i + 2]; } return { l: s / (d.length / 40) / 3, warm: red > blue }; });
  if (!(Math.abs(dayL - eveL.l) > 5)) fail('Tid på dygnet/moln ska ändra bilden: ' + J({ dayL, eveL }));
  const fogLeft = await page.evaluate(() => ({ fog: !!l3.scene.fog, env: l3rmEnvResolved() }));
  if (fogLeft.fog) fail('Dis ska tas bort efter renderingen');
  await page.evaluate(() => { l3rmData().env = {}; l3rmSave(); });
  console.log('OK: miljön – tid på dygnet, moln och dis ändrar bilden', J({ dayL: Math.round(dayL), eveL }));

  // 7) IFC: delas efter klass under renderingen och sätts tillbaka
  const ifc = await page.evaluate(async () => {
    const pos = new Float32Array([0, 0, 0, 8, 0, 0, 8, 0, 3, 0, 0, 3,  0, 0, 3.0, 8, 0, 3.0, 8, 6, 3.0, 0, 6, 3.0]), col = new Uint8Array(24).fill(200), idx = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];
    const ranges = [{ start: 0, count: 4, idxStart: 0, idxCount: 6, guid: 'W1', name: 'Vägg', cls: 'IFCWALL', base: [0.8, 0.8, 0.8], lay: 'x' }, { start: 4, count: 4, idxStart: 6, idxCount: 6, guid: 'S1', name: 'Platta', cls: 'IFCSLAB', base: [0.8, 0.8, 0.8], lay: 'x' }];
    const out = { meshes: [], ranges: [] }, m = l3bMeshFromArrays(pos, col, idx, ranges, out); m.position.set(-30, -10, 0); l3.groups.bldg.add(m); m.updateMatrixWorld(true);
    l3rmData().rules = []; l3rmSetRule({ t: 'cls', ref: 'ifcslab' }, 'betong_form', { s: 1 });
    let during = null; await l3rnRender({ samples: 3, width: 240, onProgress: (d) => { if (!during) { during = { hidden: !m.visible, tmp: 0 }; l3.scene.traverse(x => { if (x.userData && x.userData.l3rmTmp) during.tmp++; }); } } });
    const a = { visible: m.visible, tmp: 0, idx: m.geometry.index.count, orig: m.userData.l3b.origIdx.length }; l3.scene.traverse(x => { if (x.userData && x.userData.l3rmTmp) a.tmp++; });
    const T = l3rmTargets(); const cls = T.cls.map(x => x[0]); l3.groups.bldg.remove(m); l3rmData().rules = []; return { during, after: a, cls };
  });
  if (!ifc.during || !ifc.during.hidden || ifc.during.tmp < 2) fail('IFC-biten ska delas i delar under renderingen: ' + J(ifc));
  if (!ifc.after.visible || ifc.after.tmp !== 0 || ifc.after.idx !== 12) fail('IFC-biten ska vara orörd efteråt: ' + J(ifc));
  if (!ifc.cls.includes('IFCSLAB') || !ifc.cls.includes('IFCWALL')) fail('Klasserna ska hittas i scenen: ' + J(ifc.cls));
  console.log('OK: IFC – regeln per klass delar biten under renderingen och allt sätts tillbaka (index, synlighet)', J(ifc.cls));

  // 8) mallar via MCP-API:t
  const api = await page.evaluate(async (ids) => {
    const r = {}; const call = (m, p) => l3api.call(m, p);
    r.list = (await call('list_render_materials', { group: 'metall' })).result.materials.length;
    r.set = (await call('set_render_material', { object_ids: [ids.a, ids.b], material: 'rutad', scale: 2 }));
    r.bad = (await call('set_render_material', { object_id: ids.a, material: 'finns-inte' }));
    r.none = (await call('set_render_material', { material: 'rutad' }));
    r.gm = (await call('set_ground_material', { material: 'jord' }));
    r.env = (await call('set_render_environment', { time: 'morgon', clouds: 0.3 }));
    r.area = (await call('add_ground_area', { kind: 'area', points: [[l3.O[0], l3.O[1] + 20], [l3.O[0] + 10, l3.O[1] + 20], [l3.O[0] + 10, l3.O[1] + 30]], material: 'grus', name: 'Grusplan' }));
    r.setup = (await call('get_render_setup', {})).result;
    r.rm = (await call('remove_render_material', { object_id: ids.a }));
    r.rmall = (await call('remove_render_material', { all: true }));
    r.rarea = (await call('remove_ground_area', { id: r.area.result.id }));
    r.img = (await call('render_image', { quality: 'fast', samples: 2, width: 320 })).ok;
    await call('set_ground_material', {}); await call('set_render_environment', { time: '', clouds: 0, haze: 0 }); l3rmData().env = {};
    return { ...r, set: r.set.ok && r.set.result.set, bad: r.bad.error, none: r.none.error, area: r.area.ok, setupRules: r.setup.rules.length, setupAreas: r.setup.ground.areas.length, setupEnv: r.setup.environment.az, rm: r.rm.result.removed, rmall: r.rmall.result.removed, rarea: r.rarea.ok };
  }, S0);
  if (api.list < 5 || api.set !== 2 || !/Okänt material/.test(api.bad) || !/Ange object_id/.test(api.none) || !api.area || api.setupRules !== 2 || api.setupAreas !== 1 || api.setupEnv !== 95 || api.rm !== 1 || api.rmall !== 1 || !api.rarea || !api.img) fail('MCP-verktygen för renderingsmaterial: ' + J(api));
  console.log('OK: MCP-verktyg – material, regler, mark, miljö och render_image med lagret');

  // 9) rutan: flikarna Material, Mark och Miljö
  await page.evaluate(() => { l3.sel = new Set([placements.find(p => p.name === 'A').id]); l3SelectIds([placements.find(p => p.name === 'A').id]); });
  await page.click('#v3RenderBtn'); await page.waitForSelector('#v3Render');
  await page.click('.rn-tabs [data-t="material"]'); await page.waitForSelector('#v3Render .rn-mat');
  const ui = await page.evaluate(() => ({ t: document.getElementById('rmT').value, mats: document.querySelectorAll('#v3Render .rn-mat').length }));
  if (ui.t !== 'sel' || ui.mats < 10) fail('Materialfliken ska ha markerat objekt som mål och ett rutnät: ' + J(ui));
  if (process.env.L3UI) await page.screenshot({ path: process.env.L3UI });
  await page.click('#v3Render .rn-mat[data-m="asfalt"]'); await page.waitForTimeout(300);
  const r1 = await page.evaluate(() => ({ rules: l3rmData().rules.map(r => r.t + ':' + r.mat), listed: document.querySelectorAll('#v3Render .rn-rule').length }));
  if (r1.rules.length !== 1 || !/^obj:asfalt$/.test(r1.rules[0]) || r1.listed !== 1) fail('Klick på ett material ska lägga det på det markerade: ' + J(r1));
  await page.click('#v3Render [data-rm]'); await page.waitForTimeout(200);
  await page.click('.rn-tabs [data-t="mark"]'); await page.waitForSelector('#v3Render #gArea');
  await page.click('#v3Render .rn-mat[data-m="gras"]'); await page.waitForTimeout(250);
  const g1 = await page.evaluate(() => l3rmData().ground.base && l3rmData().ground.base.mat);
  if (g1 !== 'gras') fail('Marken ska få grundmaterial vid klick: ' + g1);
  await page.click('#v3Render #gArea'); await page.waitForTimeout(200);
  const g2 = await page.evaluate(() => l3rmData().ground.areas.length); if (g2 !== 1) fail('Markyta av markerad yta: ' + g2);
  await page.click('.rn-tabs [data-t="miljo"]'); await page.waitForSelector('#v3Render [data-time]');
  await page.click('#v3Render [data-time="kvall"]'); await page.waitForTimeout(250);
  const e1 = await page.evaluate(() => l3rmData().env.time); if (e1 !== 'kvall') fail('Tid på dygnet via knapp: ' + e1);
  await page.waitForFunction(() => /Förhandsvisning/.test(document.getElementById('rnMsg').textContent) && document.getElementById('rnCv').width >= 500, null, { timeout: 60000 });
  await page.click('#v3Render .rn-x');
  await page.evaluate(() => { l3rmData().rules = []; l3rmData().ground = { base: null, areas: [] }; l3rmData().env = {}; });
  console.log('OK: rutan – Material, Mark och Miljö: klick lägger på material, markyta av markerad yta, tid på dygnet, förhandsvisning uppdateras');

  if (process.env.L3KIDS) console.log('KIDS', JSON.stringify(await page.evaluate(() => l3.scene.children.map(c => [c.type, c.name || '', c.visible, c.children.length, Object.keys(c.userData || {}).join(',')]))));
  if (process.env.L3MAT) {   // bild att titta på
    await page.evaluate(async (ids) => { l3rmSetGroundBase('gras', {}); l3rmAddArea({ kind: 'road', pts: [[l3.O[0] - 20, l3.O[1] - 10], [l3.O[0] + 30, l3.O[1] - 10]], width: 6, mat: 'asfalt' }); l3rmAddArea({ kind: 'area', pts: [[l3.O[0] - 6, l3.O[1] + 6], [l3.O[0] + 20, l3.O[1] + 6], [l3.O[0] + 20, l3.O[1] + 16], [l3.O[0] - 6, l3.O[1] + 16]], mat: 'grus', name: 'Grusplan' }); l3rmSetRule({ t: 'obj', ref: ids.a }, 'tegel_rod', {}); l3rmSetRule({ t: 'obj', ref: ids.b }, 'betong_form', {}); l3rmSetEnv({ time: 'eftermiddag', clouds: 0.2, haze: 0.2 }); }, S0);
    const im = await page.evaluate(async () => { const r = await l3rnRender({ samples: 40, width: 1000 }); return r.canvas.toDataURL('image/png').split(',')[1]; });
    fs.writeFileSync(process.env.L3MAT, Buffer.from(im, 'base64'));
  }
  if (errors.length) fail('Sidfel: ' + errors.join(' | '));
  console.log('OK test_lagesplan_3drmat');
  await browser.close(); server.close();
})().catch(e => { console.error('FEL:', e.message); process.exit(1); });
