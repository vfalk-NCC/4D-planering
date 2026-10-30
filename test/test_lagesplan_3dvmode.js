const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9061;
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
  const sig = async () => page.evaluate(() => { const o = {}; let mesh = l3b.models[0].meshes[0], pl = null; l3.groups.places.traverse(x => { if (x.isMesh && !pl) pl = x; }); const mm = o2 => (Array.isArray(o2.material) ? o2.material[0] : o2.material);
    return { ifc: { wf: mm(mesh).wireframe, tr: mm(mesh).transparent, op: mm(mesh).opacity, std: !!mm(mesh).isMeshStandardMaterial, edges: !!(mesh.userData.vmEdges && mesh.userData.vmEdges.visible) }, place: pl ? { wf: mm(pl).wireframe, tr: mm(pl).transparent, op: mm(pl).opacity, std: !!mm(pl).isMeshStandardMaterial, edges: !!(pl.userData.vmEdges && pl.userData.vmEdges.visible), cast: pl.castShadow } : null, shadow: l3.renderer.shadowMap.enabled, env: !!l3.scene.environment }; });
  await page.evaluate(() => { const ce = new THREE.Box3().setFromObject(l3b.models[0].meshes[0]).getCenter(new THREE.Vector3()); const p = placeNew('container', [ce.x + l3.O[0] - 3, ce.y + l3.O[1] + 4, ce.z + l3.O[2] - 1]); placements.push(p); placeTouch(p); l3AddPlacementMesh(p); });
  const shot = async n => { await page.waitForTimeout(500); await page.screenshot({ path: '/tmp/vm_' + n + '.png', clip: { x: 256, y: 76, width: 1034, height: 700 } }); };
  const S0 = await sig(); await shot('shaded');
  await page.click('#v3ShowBtn'); await page.waitForSelector('#v3VMode');
  const nb = await page.$$eval('#v3VMode [data-v3vm]', l => l.map(b => b.dataset.v3vm).join()); if (nb !== 'shaded,wire,xray,real') fail('Lägesväljaren: ' + nb);
  await page.click('[data-v3vm="wire"]'); await page.waitForTimeout(300); const S1 = await sig(); await shot('wire');
  if (!S1.ifc.wf || !S1.place.wf || S1.shadow) fail('Tråd: ' + JSON.stringify(S1));
  await page.click('[data-v3vm="xray"]'); await page.waitForTimeout(400); const S2 = await sig(); await shot('xray');
  if (S2.ifc.wf || !S2.ifc.tr || S2.ifc.op > 0.2 || !S2.ifc.edges || !S2.place.edges || S2.place.op > 0.2) fail('X-Ray: ' + JSON.stringify(S2));
  await page.click('[data-v3vm="real"]'); await page.waitForTimeout(600); const S3 = await sig(); await shot('real');
  if (!S3.ifc.std || !S3.place.std || !S3.shadow || !S3.env || S3.ifc.tr || S3.ifc.edges) fail('Realistisk: ' + JSON.stringify(S3));
  // Ett nytt objekt medan läget är på följer med, och tillbaka till Skuggad återställer allt.
  await page.evaluate(() => { const ce = new THREE.Box3().setFromObject(l3b.models[0].meshes[0]).getCenter(new THREE.Vector3()); const p = placeNew('container', [ce.x + l3.O[0] + 6, ce.y + l3.O[1] + 4, ce.z + l3.O[2] - 1]); placements.push(p); placeTouch(p); l3AddPlacementMesh(p); l3Render(); }); await page.waitForTimeout(500);
  const nStd = await page.evaluate(() => { let n = 0, t = 0; l3.groups.places.traverse(x => { if (x.isMesh) { t++; if (!Array.isArray(x.material) && x.material.isMeshStandardMaterial) n++; } }); return [n, t]; });
  if (nStd[0] !== nStd[1] || nStd[1] < 2) fail('Nya objekt följer med i Realistisk: ' + JSON.stringify(nStd));
  await page.click('[data-v3vm="shaded"]'); await page.waitForTimeout(400); const S4 = await sig();
  if (JSON.stringify(S4.ifc) !== JSON.stringify(S0.ifc) || S4.place.std || S4.place.wf || S4.place.tr !== S0.place.tr || S4.shadow || S4.env) fail('Tillbaka till Skuggad: ' + JSON.stringify([S0, S4]));
  // Sparas och återställs vid start.
  const pref = await page.evaluate(() => { l3vmSet('xray'); return l3Prefs().vmode; }); if (pref !== 'xray') fail('Läget sparas som inställning: ' + pref);
  console.log('OK: visningslägen (tråd, X-Ray, realistisk, skuggad)', JSON.stringify({ wire: S1.ifc.wf, xray: S2.ifc.op, real: S3.ifc.std }));
  if (errors.length) fail('sidfel: ' + errors.slice(0, 3).join(' | '));
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
