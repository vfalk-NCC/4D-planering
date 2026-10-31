const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs');
const PORT = 9299;
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
  }, '');
  const ok = (c, m) => { if (!c) fail(m); };
  const R = await page.evaluate(async () => {
    plan.calib = { model: [[150100, 6512300, 0], [150200, 6512300, 0]], pdf: [[0, 0], [1000, 0]] };   // modellkoordinater: x = öst, y = norr
    const out = {}, enc = s => new TextEncoder().encode(s).buffer;
    const cubeV = [[0, 0, 0], [2, 0, 0], [2, 3, 0], [0, 3, 0], [0, 0, 4], [2, 0, 4], [2, 3, 4], [0, 3, 4]], cubeF = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
    const dims = r => r && [r.bbox.max[0] - r.bbox.min[0], r.bbox.max[1] - r.bbox.min[1], r.bbox.max[2] - r.bbox.min[2]].map(v => Math.round(v * 100) / 100);
    const tryIt = async (label, fn) => { try { out[label] = await fn(); } catch (e) { out[label] = { err: String(e.message || e) }; } };
    // STL (ASCII och binär)
    const stlA = 'solid cube\n' + cubeF.map(f => 'facet normal 0 0 0\n outer loop\n' + f.map(i => '  vertex ' + cubeV[i].join(' ')).join('\n') + '\n endloop\nendfacet').join('\n') + '\nendsolid cube\n';
    await tryIt('stlA', async () => { const r = await pmModelFromBuffer(enc(stlA), 'kub.stl'); return { tris: r.tris, d: dims(r) }; });
    const bin = new ArrayBuffer(84 + 50 * 12), dv = new DataView(bin); dv.setUint32(80, 12, true); cubeF.forEach((f, k) => { let o = 84 + k * 50; o += 12; f.forEach(i => cubeV[i].forEach(c => { dv.setFloat32(o, c * 1000, true); o += 4; })); });   // millimeter
    await tryIt('stlB', async () => { const r = await pmModelFromBuffer(bin, 'kub_mm.stl'); return { tris: r.tris, d: dims(r) }; });
    // PLY (nät, och punktmoln som ska avvisas)
    const ply = 'ply\nformat ascii 1.0\nelement vertex 8\nproperty float x\nproperty float y\nproperty float z\nelement face 12\nproperty list uchar int vertex_indices\nend_header\n' + cubeV.map(v => v.join(' ')).join('\n') + '\n' + cubeF.map(f => '3 ' + f.join(' ')).join('\n') + '\n';
    await tryIt('ply', async () => { const r = await pmModelFromBuffer(enc(ply), 'kub.ply'); return { tris: r.tris, d: dims(r) }; });
    await tryIt('plyPts', async () => { await pmModelFromBuffer(enc('ply\nformat ascii 1.0\nelement vertex 2\nproperty float x\nproperty float y\nproperty float z\nend_header\n0 0 0\n1 1 1\n'), 'moln.ply'); return 'ingen avvisning'; });
    // OBJ och glTF finns kvar
    await tryIt('obj', async () => { const r = await pmModelFromBuffer(enc(cubeV.map(v => 'v ' + v.join(' ')).join('\n') + '\n' + cubeF.map(f => 'f ' + f.map(i => i + 1).join(' ')).join('\n')), 'kub.obj'); return { tris: r.tris }; });
    // Rhino .3dm (skapas med biblioteket)
    await tryIt('3dm', async () => { await pmxScript('rhino3dm.min.js'); const rh = await rhino3dm({ locateFile: f => PMX_DIR + f }), d = new rh.File3dm(), m = new rh.Mesh(); cubeV.forEach(v => m.vertices().add(v[0], v[1], v[2])); cubeF.forEach(f => m.faces().addTriFace(f[0], f[1], f[2])); d.objects().add(m, null); const bytes = d.toByteArray(); const r = await pmModelFromBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 'kub.3dm'); return { tris: r.tris, d: dims(r) }; });
    // LandXML-terräng (SWEREF 99 20 15-lika koordinater: N E Z)
    await tryIt('landxml', async () => { const r = await pmModelFromBuffer(enc('<?xml version="1.0"?><LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2"><Surfaces><Surface name="T"><Definition surfType="TIN"><Pnts><P id="1">6512300 150100 10</P><P id="2">6512300 150140 11</P><P id="3">6512340 150140 12</P><P id="4">6512340 150100 10.5</P></Pnts><Faces><F>1 2 3</F><F>1 3 4</F></Faces></Definition></Surface></Surfaces></LandXML>'), 'terrang.xml'); return { tris: r.tris, d: dims(r), geo: r.geo }; });
    // GeoTIFF höjdmodell (EPSG:3016 = SWEREF 99 20 15)
    await tryIt('geotiff', async () => { await pmxScript('geotiff.js'); const W = 8, H = 6, vals = new Float32Array(W * H).map((_, i) => 10 + (i % W) * 0.5 + Math.floor(i / W) * 0.2);
      const ab = await GeoTIFF.writeArrayBuffer(vals, { width: W, height: H, ModelPixelScale: [5, 5, 0], ModelTiepoint: [0, 0, 0, 150100, 6512400, 0], GTModelTypeGeoKey: 1, GTRasterTypeGeoKey: 1, ProjectedCSTypeGeoKey: 3016, SampleFormat: [3], BitsPerSample: [32] });
      const r = await pmModelFromBuffer(ab, 'dem.tif'); return { tris: r.tris, d: dims(r), geo: r.geo, note: r.note }; });
    // STEP: en låda byggd som B-rep (hand-skriven)
    await tryIt('step', async () => {
      let n = 0; const L = [], add = s => { L.push(`#${++n}=${s};`); return n; };
      const P = cubeV.map(v => add(`CARTESIAN_POINT('',(${v.map(c=>c.toFixed(1)).join(',')}))`)), VX = P.map(p => add(`VERTEX_POINT('',#${p})`));
      const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].map(([a, b]) => { const d = cubeV[b].map((c, i) => c - cubeV[a][i]), len = Math.hypot(...d), dir = add(`DIRECTION('',(${d.map(c => (c / len).toFixed(6)).join(',')}))`), vec = add(`VECTOR('',#${dir},${len.toFixed(3)})`), ln = add(`LINE('',#${P[a]},#${vec})`); return add(`EDGE_CURVE('',#${VX[a]},#${VX[b]},#${ln},.T.)`); });
      const faces = [[[[0, 1], [1, 1], [2, 1], [3, 1]], [0, 0, 0], [0, 0, -1], [1, 0, 0]], [[[4, 1], [5, 1], [6, 1], [7, 1]], [0, 0, 4], [0, 0, 1], [1, 0, 0]], [[[0, 1], [9, 1], [4, 0], [8, 0]], [0, 0, 0], [0, -1, 0], [1, 0, 0]], [[[1, 1], [10, 1], [5, 0], [9, 0]], [2, 0, 0], [1, 0, 0], [0, 1, 0]], [[[2, 1], [11, 1], [6, 0], [10, 0]], [0, 3, 0], [0, 1, 0], [-1, 0, 0]], [[[3, 1], [8, 1], [7, 0], [11, 0]], [0, 0, 0], [-1, 0, 0], [0, -1, 0]]];
      const FA = faces.map(([loop, o, nrm, ref]) => { const oe = loop.map(([e, s]) => add(`ORIENTED_EDGE('',*,*,#${E[e]},${s ? '.T.' : '.F.'})`)), el = add(`EDGE_LOOP('',(${oe.map(x => '#' + x).join(',')}))`), fb = add(`FACE_OUTER_BOUND('',#${el},.T.)`), pt = add(`CARTESIAN_POINT('',(${o.join(',')}))`), dz = add(`DIRECTION('',(${nrm.join(',')}))`), dx = add(`DIRECTION('',(${ref.join(',')}))`), ax = add(`AXIS2_PLACEMENT_3D('',#${pt},#${dz},#${dx})`), pl = add(`PLANE('',#${ax})`); return add(`ADVANCED_FACE('',(#${fb}),#${pl},.T.)`); });
      const sh = add(`CLOSED_SHELL('',(${FA.map(f => '#' + f).join(',')}))`), sol = add(`MANIFOLD_SOLID_BREP('Box',#${sh})`);
      const ctx = add(`( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${n + 2})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${n + 3},#${n + 4},#${n + 5})) REPRESENTATION_CONTEXT('','') )`);
      add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),#${n + 2},'distance_accuracy_value','')`); add(`( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT($,.METRE.) )`); add(`( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )`); add(`( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )`);
      const rep = add(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(#${sol}),#${ctx})`);
      const app = add(`APPLICATION_CONTEXT('automotive design')`); add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${app})`);
      const pc = add(`PRODUCT_CONTEXT('',#${app},'mechanical')`), prod = add(`PRODUCT('Box','Box','',(#${pc}))`), pdf = add(`PRODUCT_DEFINITION_FORMATION('','',#${prod})`), pdc = add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${app},'design')`), pd = add(`PRODUCT_DEFINITION('design','',#${pdf},#${pdc})`), pds = add(`PRODUCT_DEFINITION_SHAPE('','',#${pd})`); add(`SHAPE_DEFINITION_REPRESENTATION(#${pds},#${rep})`);
      const txt = `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('x'),'2;1');\nFILE_NAME('b.stp','2026-01-01',(''),(''),'','','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nDATA;\n${L.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
      const r = await pmModelFromBuffer(enc(txt), 'lada.stp'); return { tris: r.tris, d: dims(r) }; });
    // FBX (ASCII): kub i centimeter (Y uppåt som standard)
    await tryIt('fbx', async () => { const V = cubeV.map(v => v.map(c => c * 100).join(',')).join(','), I = cubeF.map(f => `${f[0]},${f[1]},${-f[2] - 1}`).join(',');
      const t = `; FBX 7.4.0 project file\nFBXHeaderExtension:  {\n\tFBXHeaderVersion: 1003\n\tFBXVersion: 7400\n}\nGlobalSettings:  {\n\tVersion: 1000\n\tProperties70:  {\n\t\tP: "UpAxis", "int", "Integer", "",1\n\t\tP: "UpAxisSign", "int", "Integer", "",1\n\t\tP: "FrontAxis", "int", "Integer", "",2\n\t\tP: "FrontAxisSign", "int", "Integer", "",1\n\t\tP: "CoordAxis", "int", "Integer", "",0\n\t\tP: "CoordAxisSign", "int", "Integer", "",1\n\t}\n}\nObjects:  {\n\tGeometry: 100, "Geometry::Cube", "Mesh" {\n\t\tVertices: *24 {\n\t\t\ta: ${V}\n\t\t}\n\t\tPolygonVertexIndex: *36 {\n\t\t\ta: ${I}\n\t\t}\n\t\tGeometryVersion: 124\n\t}\n\tModel: 200, "Model::Cube", "Mesh" {\n\t\tVersion: 232\n\t\tProperties70:  {\n\t\t}\n\t}\n}\nConnections:  {\n\tC: "OO",200,0\n\tC: "OO",100,200\n}\n`;
      const r = await pmModelFromBuffer(enc(t), 'kub.fbx'); return { tris: r.tris, d: dims(r) }; });
    // glTF (inbäddad buffert) och GLB: en triangel
    await tryIt('gltf', async () => { const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), idx = new Uint16Array([0, 1, 2]), bin = new Uint8Array(pos.byteLength + 8); bin.set(new Uint8Array(pos.buffer), 0); bin.set(new Uint8Array(idx.buffer), pos.byteLength);
      const j = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }, { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }], buffers: [{ byteLength: bin.length, uri: 'data:application/octet-stream;base64,' + btoa(String.fromCharCode(...bin)) }] };
      const a = await pmModelFromBuffer(enc(JSON.stringify(j)), 'tri.gltf');
      // GLB: samma sak i en binär behållare
      const jb = { ...j, buffers: [{ byteLength: bin.length }] }, jt = new TextEncoder().encode(JSON.stringify(jb)), jp = new Uint8Array(Math.ceil(jt.length / 4) * 4).fill(32); jp.set(jt); const bp = new Uint8Array(Math.ceil(bin.length / 4) * 4); bp.set(bin);
      const glb = new Uint8Array(12 + 8 + jp.length + 8 + bp.length), dv = new DataView(glb.buffer); dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, glb.length, true); dv.setUint32(12, jp.length, true); dv.setUint32(16, 0x4E4F534A, true); glb.set(jp, 20); const o = 20 + jp.length; dv.setUint32(o, bp.length, true); dv.setUint32(o + 4, 0x004E4942, true); glb.set(bp, o + 8);
      const b = await pmModelFromBuffer(glb.buffer, 'tri.glb'); return { gltf: a.tris, glb: b.tris }; });
    // tunga nät glesas ut
    await tryIt('decimate', async () => { const N = 400, pts = [], ix = []; for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) pts.push(i * 0.1, j * 0.1, Math.sin(i / 20) * Math.cos(j / 20)); for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i; ix.push(a, a + 1, a + N + 1, a + 1, a + N + 2, a + N + 1); }
      const G = pmxGroups(); G.add([0.5, 0.5, 0.5], 0, pts, ix); const r = pmxFinish(G); return { from: ix.length / 3, tris: r.tris, note: r.note }; });
    return out;
  });
  console.log(JSON.stringify(R));
  const near = (a, b, t = 0.02) => Math.abs(a - b) < t, dimOk = (d, e) => d && e.every((v, i) => near(d[i], v));
  ok(R.stlA.tris === 12 && dimOk(R.stlA.d, [2, 3, 4]), 'STL (ASCII): ' + JSON.stringify(R.stlA));
  ok(R.stlB.tris === 12 && dimOk(R.stlB.d, [2, 3, 4]), 'STL (binär, millimeter) ska bli meter: ' + JSON.stringify(R.stlB));
  ok(R.ply.tris === 12 && dimOk(R.ply.d, [2, 3, 4]), 'PLY-nät: ' + JSON.stringify(R.ply));
  ok(R.plyPts.err && /punktmoln/i.test(R.plyPts.err), 'PLY-punktmoln ska avvisas med förklaring: ' + JSON.stringify(R.plyPts));
  ok(R.obj.tris === 12, 'OBJ: ' + JSON.stringify(R.obj));
  ok(R['3dm'].tris === 12 && dimOk(R['3dm'].d, [2, 3, 4]), 'Rhino .3dm: ' + JSON.stringify(R['3dm']));
  ok(R.landxml.tris === 2 && R.landxml.geo && near(R.landxml.geo[0], 150120, 0.05) && near(R.landxml.geo[1], 6512320, 0.05), 'LandXML-terräng (N E Z → öst/norr) placeras på sin plats: ' + JSON.stringify(R.landxml));
  ok(R.geotiff.tris > 0 && R.geotiff.geo && near(R.geotiff.geo[0], 150100 + 8 * 5 / 2, 3) && near(R.geotiff.geo[1], 6512400 - 6 * 5 / 2, 3), 'GeoTIFF-höjdmodell i SWEREF: ' + JSON.stringify(R.geotiff));
  ok(R.fbx.tris === 12 && R.fbx.d && Math.abs(Math.max(...R.fbx.d) - 400) < 1, 'FBX (ASCII, centimeter utan enhet → behåller talen): ' + JSON.stringify(R.fbx));
  ok(R.gltf.gltf === 1 && R.gltf.glb === 1, 'glTF och GLB: ' + JSON.stringify(R.gltf));
  ok(R.step.tris >= 12 && dimOk(R.step.d, [2, 3, 4]), 'STEP-låda: ' + JSON.stringify(R.step));
  ok(R.decimate.tris <= 200000 && R.decimate.tris > 50000 && /Förenklad/.test(R.decimate.note), 'Tunga nät glesas ut till taket: ' + JSON.stringify(R.decimate));
  ok(!errors.length, 'JS-fel: ' + errors.join('|'));
  console.log('OK: fler 3D-format – STL, PLY, Rhino, LandXML-terräng, GeoTIFF-höjdmodell, STEP och förenkling av tunga nät');
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
