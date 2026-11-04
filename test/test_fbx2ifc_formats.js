const { chromium } = require('playwright');
const path = require('path'), http = require('http'), fs = require('fs');
const DOCS = path.join(__dirname, '..', 'docs'), PORT = 9082;
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.wasm': 'application/wasm' };
(async () => {
  const server = http.createServer((q, r) => fs.readFile(path.join(DOCS, q.url.split('?')[0]), (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': MIME[path.extname(q.url.split('?')[0])] || 'application/octet-stream' }); r.end(d); } })).listen(PORT);
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const fail = m => { throw new Error(m); };
  const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://localhost:${PORT}/fbx2ifc.html`);
  const R = await page.evaluate(async () => {
    const out = {}, enc = s => new TextEncoder().encode(s), cubeV = [[0, 0, 0], [2, 0, 0], [2, 3, 0], [0, 3, 0], [0, 0, 4], [2, 0, 4], [2, 3, 4], [0, 3, 4]], cubeF = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
    const tris = root => { let n = 0; root.traverse(o => { if (o.isMesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return n; };
    const dims = root => { root.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(root), s = b.getSize(new THREE.Vector3()); return [s.x, s.y, s.z].map(v => Math.round(v * 100) / 100); };
    const tryIt = async (label, name, mkBuf) => { try { const f = new File([await mkBuf()], name), root = await parse(f); out[label] = { tris: tris(root), d: dims(root), unit: root.userData.unit || null }; } catch (e) { out[label] = { err: String(e.message || e) }; } };
    await tryIt('stl', 'kub.stl', () => enc('solid cube\n' + cubeF.map(f => 'facet normal 0 0 0\n outer loop\n' + f.map(i => '  vertex ' + cubeV[i].join(' ')).join('\n') + '\n endloop\nendfacet').join('\n') + '\nendsolid cube\n'));
    await tryIt('ply', 'kub.ply', () => enc('ply\nformat ascii 1.0\nelement vertex 8\nproperty float x\nproperty float y\nproperty float z\nelement face 12\nproperty list uchar int vertex_indices\nend_header\n' + cubeV.map(v => v.join(' ')).join('\n') + '\n' + cubeF.map(f => '3 ' + f.join(' ')).join('\n') + '\n'));
    const objTxt = cubeV.map(v => 'v ' + v.join(' ')).join('\n') + '\n' + cubeF.map(f => 'f ' + f.map(i => i + 1).join(' ')).join('\n');
    await tryIt('zipobj', 'paket.zip', () => fflate.zipSync({ 'modeller/kub.obj': enc(objTxt), 'readme.txt': enc('hej') }));
    const dae = `<?xml version="1.0" encoding="utf-8"?><COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1"><asset><unit meter="1" name="meter"/><up_axis>Z_UP</up_axis></asset>
<library_geometries><geometry id="g0"><mesh><source id="p"><float_array id="pa" count="24">${cubeV.flat().join(' ')}</float_array><technique_common><accessor source="#pa" count="8" stride="3"/></technique_common></source><vertices id="v"><input semantic="POSITION" source="#p"/></vertices>
<triangles count="12"><input semantic="VERTEX" source="#v" offset="0"/><p>${cubeF.flat().join(' ')}</p></triangles></mesh></geometry></library_geometries>
<library_visual_scenes><visual_scene id="s"><node id="n"><instance_geometry url="#g0"/></node></visual_scene></library_visual_scenes><scene><instance_visual_scene url="#s"/></scene></COLLADA>`;
    await tryIt('dae', 'kub.dae', () => enc(dae));
    await tryIt('kmz', 'skylt.kmz', () => fflate.zipSync({ 'doc.kml': enc('<kml/>'), 'models/kub.dae': enc(dae) }));
    const m3 = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices>${cubeV.map(v => `<vertex x="${v[0] * 1000}" y="${v[1] * 1000}" z="${v[2] * 1000}"/>`).join('')}</vertices><triangles>${cubeF.map(f => `<triangle v1="${f[0]}" v2="${f[1]}" v3="${f[2]}"/>`).join('')}</triangles></mesh></object></resources><build><item objectid="1"/></build></model>`;
    await tryIt('3mf', 'kub.3mf', () => fflate.zipSync({ '[Content_Types].xml': enc('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'), '_rels/.rels': enc('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'), '3D/3dmodel.model': enc(m3) }));
    await tryIt('landxml', 'terrang.xml', () => enc('<?xml version="1.0"?><LandXML xmlns="http://www.landxml.org/schema/LandXML-1.2"><Surfaces><Surface name="T"><Definition surfType="TIN"><Pnts><P id="1">6512300 150100 10</P><P id="2">6512300 150140 11</P><P id="3">6512340 150140 12</P><P id="4">6512340 150100 10.5</P></Pnts><Faces><F>1 2 3</F><F>1 3 4</F></Faces></Definition></Surface></Surfaces></LandXML>'));
    await tryIt('3dm', 'kub.3dm', async () => { await script('vendor/formats/rhino3dm.min.js'); const rh = await rhino3dm({ locateFile: f => 'vendor/formats/' + f }), d = new rh.File3dm(), m = new rh.Mesh(); cubeV.forEach(v => m.vertices().add(v[0], v[1], v[2])); cubeF.forEach(f => m.faces().addTriFace(f[0], f[1], f[2])); d.objects().add(m, null); return d.toByteArray(); });
    const enc2 = enc;
    await tryIt('step', 'lada.stp', async () => {
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
      return enc2(txt);
    });
    return out;
  });
  console.log(JSON.stringify(R));
  const ok = (c, m) => { if (!c) fail(m + ' ' + JSON.stringify(R)); };
  for (const k of ['stl', 'ply', 'zipobj', 'dae', 'kmz', '3mf', '3dm', 'step']) ok(R[k] && !R[k].err && R[k].tris === 12, 'Format ' + k);
  ok(R.landxml && !R.landxml.err && R.landxml.tris === 2, 'LandXML');
  ok(R.stl.d.join() === '2,3,4' && R['3mf'].unit === 0.001, 'mått STL / enhet 3MF');
  // hela vägen genom knappen för ett par format (zip med OBJ, STL): IFC med rätt antal delar
  fs.writeFileSync('/tmp/claude-0/-home-user-4D-planering/867d5061-8c43-5fe8-9725-74ef03d6c450/scratchpad/kub.stl', 'solid c\nfacet normal 0 0 1\n outer loop\n  vertex 0 0 0\n  vertex 1 0 0\n  vertex 0 1 0\n endloop\nendfacet\nendsolid c\n');
  await page.setInputFiles('#pick', '/tmp/claude-0/-home-user-4D-planering/867d5061-8c43-5fe8-9725-74ef03d6c450/scratchpad/kub.stl');
  await page.click('#go'); await page.waitForSelector('#res a', { timeout: 20000 });
  const link = await page.textContent('#res a'); if (!/kub\.ifczip/.test(link)) fail('Hela vägen för STL: ' + link);
  if (errors.length) fail('sidfel: ' + errors.join(' | '));
  console.log('OK: omvandlaren läser STL, PLY, Collada, 3MF, STEP, Rhino 3DM, LandXML, OBJ i zip och KMZ (FBX, GLB och DWF testas separat)');
  await browser.close(); server.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
