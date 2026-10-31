/* Fler 3D-format i "Hämta modell" (Victor 2026-10-31: "lägg till stöd för importer av fler filformat").
   STL, PLY (nät), 3DS, FBX, Rhino (.3dm), STEP/IGES/BREP, LandXML-terräng (TIN) och GeoTIFF/TIFF-höjdmodell (DEM) – samt GLB/glTF/Collada/OBJ som förut.
   Allt blir trianglar i meter, Z uppåt, i samma format som övriga modeller (pmFinish). Bibliotek (WASM/skript) hämtas först när ett format behöver dem
   och ligger i vendor/formats/ (fungerar utan nätet). För tunga nät (skanningar, terräng) glesas trianglarna ut jämnt till taket PM_MAX_TRIS.
   Modeller som ligger i verkliga koordinater (terräng, SWEREF) får geo = [x, y, z] och placeras på sin riktiga plats direkt. */

const PMX_DIR = "vendor/formats/";
const PMX_EXT = /\.(stl|ply|3ds|fbx|3dm|stp|step|igs|iges|brep|brp|xml|landxml|tif|tiff)$/i;
const pmxLoaded = {};
function pmxScript(file) {
  if (!pmxLoaded[file]) pmxLoaded[file] = new Promise((res, rej) => { const s = document.createElement("script"); s.src = PMX_DIR + file; s.onload = res; s.onerror = () => { delete pmxLoaded[file]; rej(new Error(file + " kunde inte laddas")); }; document.head.appendChild(s); });
  return pmxLoaded[file];
}
async function pmxThree() { if (typeof THREE === "undefined") await pmxScript("../three/three.min.js"); }

/* ---- Trianglar per färg → glesas ut → pmBuilder -------------------------------------------------------------------------------------------- */
function pmxGroups() {
  const m = new Map();
  return { m, add(rgb, t, pts, idx) {
    const col = pmCol(rgb, t), key = col.c + ":" + col.t; let g = m.get(key); if (!g) { g = { col, pts: [], idx: [] }; m.set(key, g); }
    const o = g.pts.length / 3; for (let i = 0; i < pts.length; i++) g.pts.push(pts[i]); for (let i = 0; i < idx.length; i++) g.idx.push(idx[i] + o);
  } };
}
function pmxCluster(pts, idx, cell, org) {
  const map = new Map(), sum = [], cnt = [], remap = new Int32Array(pts.length / 3);
  for (let i = 0; i < pts.length; i += 3) {
    const k = Math.floor((pts[i] - org[0]) / cell) + "," + Math.floor((pts[i + 1] - org[1]) / cell) + "," + Math.floor((pts[i + 2] - org[2]) / cell); let id = map.get(k);
    if (id === undefined) { id = cnt.length; map.set(k, id); sum.push(0, 0, 0); cnt.push(0); } const j = id * 3; sum[j] += pts[i]; sum[j + 1] += pts[i + 1]; sum[j + 2] += pts[i + 2]; cnt[id]++; remap[i / 3] = id;
  }
  const P = new Array(cnt.length * 3); for (let id = 0; id < cnt.length; id++) { P[id * 3] = sum[id * 3] / cnt[id]; P[id * 3 + 1] = sum[id * 3 + 1] / cnt[id]; P[id * 3 + 2] = sum[id * 3 + 2] / cnt[id]; }
  const I = []; for (let i = 0; i + 2 < idx.length; i += 3) { const a = remap[idx[i]], b = remap[idx[i + 1]], c = remap[idx[i + 2]]; if (a !== b && b !== c && a !== c) I.push(a, b, c); }
  return { pts: P, idx: I };
}
function pmxFinish(G, opts = {}) {
  const groups = [...G.m.values()]; let tris = groups.reduce((s, g) => s + g.idx.length / 3, 0);
  if (!tris) throw new Error("Modellen innehåller ingen geometri.");
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  groups.forEach(g => { for (let i = 0; i < g.pts.length; i += 3) for (let a = 0; a < 3; a++) { const v = g.pts[i + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; } });
  let note = "";
  if (tris > PM_MAX_TRIS) {
    const from = tris, ext = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2], 1e-6); let cell = ext / Math.sqrt(from) * 1.2, out = groups.map(g => ({ col: g.col, pts: g.pts, idx: g.idx }));
    for (let it = 0; it < 24 && tris > PM_MAX_TRIS * 0.97; it++) { out = groups.map(g => { const r = pmxCluster(g.pts, g.idx, cell, mn); return { col: g.col, pts: r.pts, idx: r.idx }; }); tris = out.reduce((s, g) => s + g.idx.length / 3, 0); cell *= 1.3; }
    groups.length = 0; out.forEach(g => groups.push(g)); note = ` Förenklad från ${pmFmt(from)} till ${pmFmt(tris)} trianglar.`;
  }
  const B = pmBuilder(); groups.forEach(g => { if (g.idx.length) B.add(g.col, g.pts, g.idx); });
  const r = B.finish(), cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2, r3 = v => Math.round(v * 1000) / 1000;
  // koordinater som ser ut som SWEREF (öst 100 000–900 000, norr 6–7,8 milj.) ⇒ modellen kan placeras på sin riktiga plats
  const looksGeo = (cx > 5e4 && cx < 9e5 && cy > 5.9e6 && cy < 7.9e6);
  if (opts.geo || looksGeo) r.geo = [r3(cx), r3(cy), r3(mn[2])];
  if (note) r.note = note.trim();
  return r;
}
/* ---- THREE-geometri → grupper ---------------------------------------------------------------------------------------------------------------- */
function pmxUnitOf(root) {
  const b = new THREE.Box3().setFromObject(root), s = b.getSize(new THREE.Vector3()), m = Math.max(s.x, s.y, s.z);
  return m > 800 ? 0.001 : 1;   // långt över byggnadsstorlek ⇒ millimeter (STL/3DS/FBX saknar enhet)
}
function pmxFromThree(root, G, o = {}) {
  root.updateMatrixWorld(true); const unit = o.unit == null ? pmxUnitOf(root) : o.unit, v = new THREE.Vector3(), quant = x => Math.max(0, Math.min(15, Math.round(x * 15)));
  root.traverse(m => {
    if (!m.isMesh || !m.geometry || !m.geometry.attributes.position) return;
    const g = m.geometry, pos = g.attributes.position, idx = g.index, mats = Array.isArray(m.material) ? m.material : [m.material], col = g.attributes.color;
    const P = new Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); const x = v.x * unit, y = v.y * unit, z = v.z * unit; if (o.yUp) { P[i * 3] = x; P[i * 3 + 1] = -z; P[i * 3 + 2] = y; } else { P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; } }
    const total = idx ? idx.count : pos.count, rng = g.groups && g.groups.length && Array.isArray(m.material) ? g.groups : [{ start: 0, count: total, materialIndex: 0 }];
    rng.forEach(r => {
      const mt = mats[r.materialIndex] || mats[0] || {}, base = mt.color ? [mt.color.r, mt.color.g, mt.color.b] : [0.75, 0.75, 0.75], t = mt.transparent && mt.opacity < 1 ? 1 - mt.opacity : 0, vc = col && (mt.vertexColors || !mt.color || true) && col.itemSize >= 3 && (!mt.color || mt.vertexColors);
      const byColor = new Map(); const end = Math.min(total, r.start + r.count);
      for (let i = r.start; i + 2 < end; i += 3) {
        const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2; let rgb = base, key = "b";
        if (vc) { rgb = [(col.getX(a) + col.getX(b) + col.getX(c)) / 3, (col.getY(a) + col.getY(b) + col.getY(c)) / 3, (col.getZ(a) + col.getZ(b) + col.getZ(c)) / 3]; key = quant(rgb[0]) + "," + quant(rgb[1]) + "," + quant(rgb[2]); rgb = [quant(rgb[0]) / 15, quant(rgb[1]) / 15, quant(rgb[2]) / 15]; }
        let e = byColor.get(key); if (!e) { e = { rgb, ids: [] }; byColor.set(key, e); } e.ids.push(a, b, c);
      }
      byColor.forEach(e => { const used = new Map(), pts = [], ix = []; e.ids.forEach(id => { let k = used.get(id); if (k === undefined) { k = pts.length / 3; used.set(id, k); pts.push(P[id * 3], P[id * 3 + 1], P[id * 3 + 2]); } ix.push(k); }); G.add(e.rgb, t, pts, ix); });
    });
  });
}

/* ---- Formaten ----------------------------------------------------------------------------------------------------------------------------------- */
async function pmxStl(buf) { await pmxThree(); await pmxScript("STLLoader.js"); const geo = new THREE.STLLoader().parse(buf), G = pmxGroups(), root = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xbfbfbf })); if (geo.hasColors && geo.attributes.color) root.material.vertexColors = true; pmxFromThree(root, G, {}); return pmxFinish(G); }
async function pmxPly(buf) {
  await pmxThree(); await pmxScript("PLYLoader.js"); const geo = new THREE.PLYLoader().parse(buf);
  if (!geo.index) throw new Error("PLY-filen har inga ytor (det är ett punktmoln) – läs in den under Punktmoln i 3D-vyn.");
  const G = pmxGroups(), mat = new THREE.MeshBasicMaterial({ color: 0xbfbfbf }); if (geo.attributes.color) mat.vertexColors = true; pmxFromThree(new THREE.Mesh(geo, mat), G, {}); return pmxFinish(G);
}
async function pmx3ds(buf) { await pmxThree(); await pmxScript("TDSLoader.js"); const root = new THREE.TDSLoader().parse(buf, ""), G = pmxGroups(); pmxFromThree(root, G, {}); return pmxFinish(G); }
async function pmxFbx(buf) { await pmxThree(); await pmxScript("fflate.min.js"); await pmxScript("FBXLoader.js"); const root = new THREE.FBXLoader().parse(buf, ""), G = pmxGroups(); pmxFromThree(root, G, { yUp: true }); return pmxFinish(G); }
let pmxOcct = null;
async function pmxStep(buf, name) {
  if (!pmxOcct) { await pmxScript("occt-import-js.js"); pmxOcct = await occtimportjs({ locateFile: f => PMX_DIR + f }); }
  const data = new Uint8Array(buf), kind = /\.(igs|iges)$/i.test(name) ? "ReadIgesFile" : /\.(brep|brp)$/i.test(name) ? "ReadBrepFile" : "ReadStepFile";
  const res = pmxOcct[kind](data, { linearUnit: "meter", linearDeflectionType: "bounding_box_ratio", linearDeflection: 0.0015, angularDeflection: 0.4 });
  if (!res || !res.success || !res.meshes || !res.meshes.length) throw new Error("Filen kunde inte läsas som " + (kind === "ReadIgesFile" ? "IGES" : kind === "ReadBrepFile" ? "BREP" : "STEP") + " (kontrollera att den är en ASCII-fil).");
  const G = pmxGroups(); let mxd = 0;
  res.meshes.forEach(m => { const p = m.attributes.position.array; for (let i = 0; i < p.length; i++) mxd = Math.max(mxd, Math.abs(p[i])); });
  const unit = mxd > 3000 ? 0.001 : 1;   // om biblioteket ändå gav millimeter
  res.meshes.forEach(m => {
    const pa = m.attributes.position.array, ix = m.index.array, P = new Array(pa.length); for (let i = 0; i < pa.length; i++) P[i] = pa[i] * unit;
    const base = m.color || [0.72, 0.74, 0.78], faces = m.brep_faces && m.brep_faces.length ? m.brep_faces : [{ first: 0, last: ix.length / 3 - 1, color: null }];
    faces.forEach(f => { const s = f.first * 3, e = (f.last + 1) * 3, slice = Array.from(ix.subarray ? ix.subarray(s, e) : ix.slice(s, e)); if (slice.length) G.add(f.color || base, 0, P, slice); });
  });
  // varje grupp bär hela punktlistan – komprimera: bygg om per grupp med bara använda punkter
  G.m.forEach(g => { const used = new Map(), pts = [], idx = []; g.idx.forEach(id => { let k = used.get(id); if (k === undefined) { k = pts.length / 3; used.set(id, k); pts.push(g.pts[id * 3], g.pts[id * 3 + 1], g.pts[id * 3 + 2]); } idx.push(k); }); g.pts = pts; g.idx = idx; });
  return pmxFinish(G);
}
let pmxRh = null;
const PMX_RH_UNIT = { 1: 1e-6, 2: 0.001, 3: 0.01, 4: 1, 5: 1000, 8: 0.0254, 9: 0.3048, 10: 1609.344 };
async function pmx3dm(buf) {
  if (!pmxRh) { await pmxScript("rhino3dm.min.js"); pmxRh = await rhino3dm({ locateFile: f => PMX_DIR + f }); }
  const doc = pmxRh.File3dm.fromByteArray(new Uint8Array(buf)); if (!doc) throw new Error("Filen kunde inte läsas som Rhino (.3dm).");
  let unit = 1; try { unit = PMX_RH_UNIT[doc.settings().modelUnitSystem] || 1; } catch (e) { /* */ }
  const objs = doc.objects(), G = pmxGroups(), layers = doc.layers(); let n = 0;
  const addMesh = (mesh, rgb) => {
    const V = mesh.vertices(), F = mesh.faces(), pts = [], ix = [];
    for (let i = 0; i < V.count; i++) { const v = V.get(i); pts.push(v[0] * unit, v[1] * unit, v[2] * unit); }
    for (let i = 0; i < F.count; i++) { const f = F.get(i); ix.push(f[0], f[1], f[2]); if (f[3] !== f[2]) ix.push(f[0], f[2], f[3]); }
    if (ix.length) { G.add(rgb, 0, pts, ix); n++; }
  };
  for (let i = 0; i < objs.count; i++) {
    const ob = objs.get(i), geo = ob.geometry(), at = ob.attributes(); let rgb = [0.75, 0.75, 0.78];
    try { const L = layers.get(at.layerIndex), c = L && L.color; if (c) rgb = [c.r / 255, c.g / 255, c.b / 255]; } catch (e) { /* */ }
    try { if (at.colorSource === 1 && at.objectColor) rgb = [at.objectColor.r / 255, at.objectColor.g / 255, at.objectColor.b / 255]; } catch (e) { /* */ }
    const t = geo.objectType, T = pmxRh.ObjectType;
    try {
      if (t === T.Mesh) addMesh(geo, rgb);
      else if (t === T.Brep || t === T.Extrusion || t === T.SubD || t === T.Surface) {
        let brep = geo; if (t === T.Extrusion) brep = geo.toBrep(true); else if (t === T.Surface && geo.toBrep) brep = geo.toBrep(); else if (t === T.SubD && geo.toBrep) brep = geo.toBrep();
        const meshes = pmxRh.Mesh.createFromBrep(brep); if (meshes) { const list = Array.isArray(meshes) ? meshes : [meshes]; list.forEach(m => { if (m) addMesh(m, rgb); }); }
      }
    } catch (e) { /* objekt som inte går att göra till nät hoppas över */ }
  }
  if (!n) throw new Error("Rhino-filen innehåller inga nät eller kroppar som kan visas.");
  return pmxFinish(G);
}
/* LandXML: terrängytor (TIN) – punkter "N E Z" → x = öst, y = norr. */
function pmxLandXml(text) {
  const x = new DOMParser().parseFromString(text, "application/xml"); if (x.querySelector("parsererror")) throw new Error("LandXML-filen kunde inte tolkas.");
  const ft = (x.getElementsByTagName("Imperial")[0] && /foot/i.test(x.getElementsByTagName("Imperial")[0].getAttribute("linearUnit") || "")) ? 0.3048 : 1, G = pmxGroups(), surfs = [...x.getElementsByTagName("Surface")];
  if (!surfs.length) throw new Error("LandXML-filen innehåller ingen terrängyta (Surface). Linjer och punkter läses in som CAD-underlag.");
  const cols = [[0.55, 0.64, 0.42], [0.62, 0.55, 0.42], [0.5, 0.58, 0.66], [0.66, 0.5, 0.5]];
  surfs.forEach((sf, si) => {
    const idMap = new Map(), pts = []; [...sf.getElementsByTagName("P")].forEach(p => { const v = p.textContent.trim().split(/\s+/).map(Number); if (v.length >= 3 && v.every(Number.isFinite)) { idMap.set(p.getAttribute("id"), pts.length / 3); pts.push(v[1] * ft, v[0] * ft, v[2] * ft); } });
    const ix = []; [...sf.getElementsByTagName("F")].forEach(f => { if (f.getAttribute("i") === "1") return; const v = f.textContent.trim().split(/\s+/).map(s => idMap.get(s)); if (v.length >= 3 && v.every(a => a !== undefined)) ix.push(v[0], v[2], v[1]); });   // N/E-ordning vänder lindningen
    if (ix.length) G.add(cols[si % cols.length], 0, pts, ix);
  });
  return pmxFinish(G, { geo: true });
}
/* GeoTIFF/TIFF som höjdmodell: rutnätet blir ett terrängnät i projektets koordinater. */
async function pmxGeoTiff(buf) {
  await pmxScript("geotiff.js"); const tiff = await GeoTIFF.fromArrayBuffer(buf), img = await tiff.getImage(), W = img.getWidth(), H = img.getHeight();
  if (img.getSamplesPerPixel() > 1 && img.getSamplesPerPixel() >= 3) throw new Error("Färg-TIFF (ortofoto) kan inte bli en 3D-modell. Spara den som PNG/JPG med world file och läs in den under Ortofoto – eller använd en höjdmodell (DEM) med en kanal.");
  const origin = img.getOrigin(), res = img.getResolution(), keys = img.getGeoKeys ? img.getGeoKeys() : {}, noData = img.getGDALNoData ? img.getGDALNoData() : null;
  const epsg = keys.ProjectedCSTypeGeoKey || keys.GeographicTypeGeoKey || 0, crs = typeof cadvCrsFromEpsg === "function" ? cadvCrsFromEpsg(epsg) : null;
  const step = Math.max(1, Math.ceil(Math.sqrt(W * H / (PM_MAX_TRIS / 2.1)))), cols = Math.floor((W - 1) / step) + 1, rows = Math.floor((H - 1) / step) + 1;
  const win = [0, 0, W, H], ras = await img.readRasters({ window: win, samples: [0], interleave: true }), z = ras;
  const sample = [origin[0] + (W / 2) * res[0], origin[1] + (H / 2) * res[1]], xf = typeof cadvXform === "function" ? cadvXform(crs, sample) : { f: (x, y) => [x, y] };
  const val = (i, j) => { const v = z[(j * step) * W + i * step]; return Number.isFinite(v) && v > -1e30 && (noData == null || v !== noData) ? v : NaN; };
  const P = [], okv = [], zmin = [Infinity], zmax = [-Infinity];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const v = val(i, j), x = origin[0] + (i * step + 0.5) * res[0], y = origin[1] + (j * step + 0.5) * res[1], [e, n] = xf.f(x, y); P.push(e, n, Number.isFinite(v) ? v : 0); okv.push(Number.isFinite(v)); if (Number.isFinite(v)) { zmin[0] = Math.min(zmin[0], v); zmax[0] = Math.max(zmax[0], v); } }
  if (!Number.isFinite(zmin[0])) throw new Error("Höjdmodellen saknar giltiga höjdvärden.");
  const G = pmxGroups(), bands = 8, ramp = k => { const t = k / (bands - 1), c = [[0.36, 0.55, 0.3], [0.5, 0.62, 0.34], [0.72, 0.68, 0.4], [0.66, 0.52, 0.34], [0.58, 0.46, 0.38], [0.65, 0.62, 0.6], [0.85, 0.84, 0.82], [0.97, 0.97, 0.97]]; return c[Math.min(bands - 1, Math.round(t * (bands - 1)))]; };
  const per = Array.from({ length: bands }, () => []), flip = res[1] < 0 ? false : true;
  for (let j = 0; j + 1 < rows; j++) for (let i = 0; i + 1 < cols; i++) {
    const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1; if (!(okv[a] && okv[b] && okv[c] && okv[d])) continue;
    const zc = (P[a * 3 + 2] + P[d * 3 + 2]) / 2, k = Math.max(0, Math.min(bands - 1, Math.floor((zc - zmin[0]) / Math.max(1e-6, zmax[0] - zmin[0]) * bands)));
    // lindning uppåt: i bilden växer j nedåt (norr → söder) när upplösningen är negativ
    if (!flip) per[k].push(a, c, b, b, c, d); else per[k].push(a, b, c, b, d, c);
  }
  per.forEach((ix, k) => { if (ix.length) { const used = new Map(), pts = [], idx = []; ix.forEach(id => { let q = used.get(id); if (q === undefined) { q = pts.length / 3; used.set(id, q); pts.push(P[id * 3], P[id * 3 + 1], P[id * 3 + 2]); } idx.push(q); }); G.add(ramp(k), 0, pts, idx); } });
  const r = pmxFinish(G, { geo: true }); r.note = `Höjdmodell ${W}×${H} rutor, var ${step}:e ruta används (${pmFmt(r.tris)} trianglar)${xf.zone ? ` · ${xf.zone.name}` : ""}.`; return r;
}

/* ---- Väljaren ------------------------------------------------------------------------------------------------------------------------------------- */
async function pmxTry(buf, name) {
  const n = String(name || ""), head = new TextDecoder().decode(buf.slice(0, 600));
  if (/\.stl$/i.test(n) || (/^\s*solid\b/.test(head) && /facet\s+normal/i.test(new TextDecoder().decode(buf.slice(0, 2000))))) return pmxStl(buf);
  if (/\.ply$/i.test(n) || /^ply\r?\n/.test(head)) return pmxPly(buf);
  if (/\.3ds$/i.test(n)) return pmx3ds(buf);
  if (/\.fbx$/i.test(n) || /^Kaydara FBX Binary/.test(head) || /^; FBX/.test(head)) return pmxFbx(buf);
  if (/\.3dm$/i.test(n) || /^3D Geometry File Format/.test(head)) return pmx3dm(buf);
  if (/\.(stp|step|igs|iges|brep|brp)$/i.test(n) || /^ISO-10303-21/.test(head)) return pmxStep(buf, n);
  if (/\.(xml|landxml)$/i.test(n) && /<LandXML/i.test(new TextDecoder().decode(buf.slice(0, 4000)))) return pmxLandXml(new TextDecoder().decode(buf));
  if (/\.tiff?$/i.test(n)) return pmxGeoTiff(buf);
  return null;
}
/* Modell med egna koordinater: lägg den på sin riktiga plats i 3D-editorn. */
function pmPlaceGeo(a) {
  if (!a || !a.geo || typeof placeNew !== "function" || typeof l3AddPlacementMesh !== "function" || typeof placements === "undefined") return false;
  try {
    const p = placeNew("model:" + a.id, [a.geo[0], a.geo[1], a.geo[2]]); if (!p) return false;
    placements.push(p); placeTouch(p); l3AddPlacementMesh(p); if (typeof l3Changed === "function") l3Changed(); if (typeof l3SelectIds === "function") l3SelectIds([p.id]);
    if (typeof l3View === "function") setTimeout(() => { try { l3View("sel"); } catch (e) { /* */ } }, 100);
    return true;
  } catch (e) { console.warn("Placera på rätt plats", e); return false; }
}
