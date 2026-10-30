const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9041;
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
  await page.waitForFunction(() => typeof l3 !== 'undefined' && l3 && l3.renderer, null, { timeout: 15000 });
  const r = await page.evaluate(async () => {
    const cube = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
    const tri = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
    const n = 3, pos = new Float32Array(n * 24), col = new Uint8Array(n * 24), idx = new Uint32Array(n * 36), ranges = [];
    for (let b = 0; b < n; b++) {
      for (let v = 0; v < 8; v++) { const o = (b * 8 + v) * 3; pos[o] = b * 3 + cube[v][0] * 2; pos[o + 1] = cube[v][1] * 2; pos[o + 2] = cube[v][2] * 2; col[o] = col[o + 1] = col[o + 2] = 200; }
      for (let t = 0; t < 36; t++) idx[b * 36 + t] = b * 8 + tri[t];
      ranges.push({ start: b * 8, count: 8, idxStart: b * 36, idxCount: 36, guid: 'g' + b, name: 'O' + b, cls: 'IFCBEAM', base: [0.8, 0.8, 0.8] });
    }
    const m = { id: 'tx', name: 'T', visible: true, meshes: [], ranges, tris: n * 12, O: [0, 0, 0], src: { id: 'tx', version: 'v1' } };
    const mesh = l3bMeshFromArrays(pos, col, idx, ranges, m, null); m.meshes.push(mesh); l3.groups.bldg.add(mesh); l3b.models.push(m); l3bPosition();
    const out = {};
    l3texApplyIfc([{ mesh, ri: 0 }], { id: 'tegel', s: 0.5, k: 1 }, 'textur');
    l3texApplyIfc([{ mesh, ri: 1 }], { id: 'betong', s: 1, k: 0.8 }, 'textur');
    out.attr = !!mesh.geometry.getAttribute('aTex'); out.a0 = Array.from(mesh.geometry.getAttribute('aTex').array.slice(0, 3)); out.a2 = Array.from(mesh.geometry.getAttribute('aTex').array.slice(48, 51));
    out.patched = !!mesh.material.userData.l3tex;
    // Genomskinlig bit delar texturen
    l3tApply({ alpha: 0.5 }, 'opacitet', null);
    // Kamera mot lådorna
    mesh.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(mesh), ce = bb.getCenter(new THREE.Vector3()); out.bb = [bb.min.toArray(), bb.max.toArray()]; const c = l3.camera; l3.orbit.target.copy(ce); c.position.set(ce.x + 7, ce.y - 8, ce.z + 6); c.lookAt(ce); c.updateMatrixWorld(); l3.orbit.update(); l3Render();
    out.ghostAttr = (mesh.userData.l3b.ghosts || []).length;
    // Etableringsobjekt med textur
    const lib = (typeof placeLib === 'function' && (PLACE_LIB || placeLibrary)) || null;
    return out;
  });
  console.log(JSON.stringify(r));
  // Utseendet sparas i projektet och läggs på igen när modellen läses in på nytt.
  await page.evaluate(() => { const mesh = l3b.models[0].meshes[0]; l3bs.sel = [{ mesh, ri: 2 }]; l3tApply({ color: '#ff0000', alpha: 0.6 }, 'färg'); l3texApplyIfc(l3bs.sel, { id: 'gras', s: 2, k: 0.7 }, 'textur'); });
  await page.waitForTimeout(2600);
  const lookKey = [...gh.keys()].find(k => /ifc_looks\.json$/.test(k)); if (!lookKey) fail('ifc_looks.json ska skrivas: ' + [...gh.keys()].join());
  const lk = JSON.parse(gh.get(lookKey)); const rec = lk.find(x => x.guid === 'g2');
  if (!rec || rec.c !== '#ff0000' || rec.a !== 0.6 || !rec.t || rec.t.id !== 'gras' || rec.t.s !== 2) fail('Posten i ifc_looks.json: ' + JSON.stringify(lk));
  const re = await page.evaluate(async () => {
    l3b.models.forEach(m => m.meshes.forEach(x => l3.groups.bldg.remove(x))); l3b.models.length = 0; l3look.map = null; l3look.loading = false;
    const cube = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]], tri = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7];
    const n = 3, pos = new Float32Array(n * 24), col = new Uint8Array(n * 24), idx = new Uint32Array(n * 36), ranges = [];
    for (let b = 0; b < n; b++) { for (let v = 0; v < 8; v++) { const o = (b * 8 + v) * 3; pos[o] = b * 3 + cube[v][0] * 2; pos[o + 1] = cube[v][1] * 2; pos[o + 2] = cube[v][2] * 2; col[o] = col[o + 1] = col[o + 2] = 200; } for (let t = 0; t < 36; t++) idx[b * 36 + t] = b * 8 + tri[t]; ranges.push({ start: b * 8, count: 8, idxStart: b * 36, idxCount: 36, guid: 'g' + b, name: 'O' + b, cls: 'IFCBEAM', base: [0.8, 0.8, 0.8] }); }
    const m = { id: 'tx2', name: 'T', visible: true, meshes: [], ranges, tris: n * 12, O: [0, 0, 0], src: { id: 'tx2', version: 'v1' } };
    const mesh = l3bMeshFromArrays(pos, col, idx, ranges, m, null); m.meshes.push(mesh); l3.groups.bldg.add(mesh); l3b.models.push(m); l3bPosition();
    l3bRecolor(); await new Promise(r => setTimeout(r, 1200)); l3bRecolor(); await new Promise(r => setTimeout(r, 300));
    const u = mesh.userData.l3b, t = u.tex && u.tex.get(2), at = mesh.geometry.getAttribute('aTex');
    return { tint: !!(u.tint && u.tint.has(2)), alpha: u.alpha && u.alpha.get(2), tex: t && t.id, other: !!(u.tint && u.tint.has(0)), aTex: at ? Array.from(at.array.slice(48, 51)) : null };
  });
  if (!re.tint || re.alpha !== 0.6 || re.tex !== 'gras' || re.other || !re.aTex || re.aTex[0] !== 5) fail('Sparat utseende läggs på igen: ' + JSON.stringify(re));
  console.log('OK: IFC-utseende sparas i projektet och läggs på igen', JSON.stringify(re));
  // Etableringsobjekt: välj textur i färgrutan.
  const pid = await page.evaluate(() => {
    const ce = new THREE.Box3().setFromObject(l3b.models[0].meshes[0]).getCenter(new THREE.Vector3());
    const p = placeNew('container', [ce.x + l3.O[0] - 3, ce.y + l3.O[1] + 4, ce.z + l3.O[2] - 1]); placements.push(p); placeTouch(p); l3AddPlacementMesh(p); l3SelectIds([p.id]); return p.id;
  });
  await page.waitForTimeout(600);
  await page.click('#v3CtxBar [data-cb="p:paint"]'); await page.waitForSelector('#v3TintPop .v3-tex');
  const nb = await page.$$eval('#v3TintPop .v3-tex-grid button', l => l.length);
  if (nb !== 9) fail('Biblioteket: ∅ + 8 texturer, fick ' + nb);
  await page.click('#v3TintPop [data-tx="betong"]'); await page.waitForTimeout(300);
  let pr = await page.evaluate(id => { const p = placements.find(x => x.id === id); let patched = false; l3.scene.traverse(o => { if (o.userData.placeId === id && o.material && o.material.userData.l3tex) patched = true; }); return { tex: p.tex, patched }; }, pid);
  if (!pr.tex || pr.tex.id !== 'betong' || !pr.patched) fail('Etablering: textur sparas på objektet och ritas: ' + JSON.stringify(pr));
  await page.$eval('#v3TintPop .v3-tex-s', i => { i.value = '2'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
  pr = await page.evaluate(id => placements.find(x => x.id === id).tex, pid);
  if (pr.s !== 2) fail('Skalan sparas: ' + JSON.stringify(pr));
  // Egen bild
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGP8z8Dwn4EIwESMolGFpCsEAGAVAhHPx7hEAAAAAElFTkSuQmCC', 'base64');
  await page.setInputFiles('#v3TintPop .v3-tex-up input', { name: 'test.png', mimeType: 'image/png', buffer: png }); await page.waitForTimeout(800);
  pr = await page.evaluate(id => placements.find(x => x.id === id).tex, pid);
  if (!/^u/.test(pr.id) || !pr.img) fail('Egen bild: id och bilddata på objektet: ' + JSON.stringify(pr).slice(0, 200));
  if (await page.$$eval('#v3TintPop .v3-tex-grid button', l => l.length) !== 10) fail('Egen bild ska synas i rutan');
  await page.click('#v3TintPop [data-tx=""]'); await page.waitForTimeout(200);
  if (await page.evaluate(id => 'tex' in placements.find(x => x.id === id), pid)) fail('Ingen textur tar bort den');
  await page.click('#v3TintPop [data-tx="tra"]'); await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/tex2.png' });
  await page.keyboard.press('Escape'); await page.evaluate(() => l3SelectIds([])); await page.waitForTimeout(400);
  console.log('OK: etableringsobjekt – välj, skala, egen bild, ingen');
  { const t = await page.evaluate(() => { const o = {}; l3SetPref('tex', false); l3texSync(false); o.off = l3tex.on.value; l3SetPref('tex', true); l3texSync(false); o.on = l3tex.on.value; o.sw = typeof l3Prefs().tex; return o; });
    if (t.off !== 0 || t.on !== 1) fail('Texturbrytaren (Prestanda): ' + JSON.stringify(t)); console.log('OK: texturer av/på (Prestanda)'); }
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/tex1.png', clip: { x: 0, y: 0, width: 1300, height: 850 } });
  if (errors.length) fail('sidfel: ' + errors.slice(0, 3).join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
