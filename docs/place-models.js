/* 4D-planering – egna modeller i Placera i 3D (Victors önskemål 2026-10-08): hämta 3D-modeller
   från Sketchfab (inloggning med den egna API-nyckeln) eller från en fil (t.ex. IFC från
   BIMobject) och placera dem fritt i modellen med ett tryck, precis som biblioteksobjekten.
   - Sketchfab levererar glTF/GLB (aldrig IFC). Geometrin görs om till trianglar i meter, Z uppåt,
     med origo i modellens botten-mitt, och följer med i Etablering-IFC:n (place3d.js).
   - En IFC-fil behålls som den är: vid sparning skrivs bara dess yttersta placering om (flyttad
     och vriden till punkten man tryckt på) och objektens id:n görs unika per placering. Den blir
     en egen fil i samma mapp i Trimble Connect.
   Biblioteket ligger i projects/<id>/plan_models.json och filerna i projects/<id>/models/
   (nya filer – inget befintligt skrivs över). Sketchfab-nyckeln sparas bara i den här webbläsaren. */

const SF_API = "https://api.sketchfab.com/v3";
const SF_TOKEN_KEY = "4dplan-sketchfab-token";
const PM_MAX_TRIS = 200000;
const PM_MAX_DOWNLOAD = 80 * 1048576, PM_MAX_IFC = 40 * 1048576;

let placeAssets = [];
const placeMeshCache = new Map();  // asset-id -> { parts: [{ c, t, p, i }] }
const placeIfcCache = new Map();   // asset-id -> IFC-text
let pmState = { open: false, tab: "sketchfab", q: "", results: [], next: null, busy: false, msg: "", bad: false, me: null, pending: null };

const pmAssetsPath = () => `projects/${encodeURIComponent(projectId)}/plan_models.json`;
async function placeAssetsLoad() {
  try { placeAssets = (await ghReadJSON(settings.githubToken, pmAssetsPath())) || []; }
  catch (e) { placeAssets = []; console.warn("Kunde inte läsa plan_models.json", e); }
}
function placeAssetOf(id) { return placeAssets.find(a => a.id === id) || null; }
function placeMeshReady(id) { return placeMeshCache.has(id); }
function sfToken() { try { return localStorage.getItem(SF_TOKEN_KEY) || ""; } catch (e) { return ""; } }
function sfSetToken(t) { try { if (t) localStorage.setItem(SF_TOKEN_KEY, t); else localStorage.removeItem(SF_TOKEN_KEY); } catch (e) {} }

// ---------------------------------------------------------------------
// glTF / GLB -> trianglar
// ---------------------------------------------------------------------
function glbSplit(buf) {
  const dv = new DataView(buf);
  if (buf.byteLength < 20 || dv.getUint32(0, true) !== 0x46546C67) throw new Error("Filen är inte en GLB-fil.");
  let off = 12, json = null, bin = null;
  while (off + 8 <= buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(data));
    else if (type === 0x004E4942 && !bin) bin = data;
    off += 8 + len + ((4 - len % 4) % 4);
  }
  if (!json) throw new Error("GLB-filen saknar innehåll.");
  return { json, bin };
}
function gltfRead(json, buffers, idx) {
  const a = json.accessors[idx];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type] || 1;
  const out = new Float64Array(a.count * n);
  if (a.bufferView === undefined) return out;
  const bv = json.bufferViews[a.bufferView], buf = buffers[bv.buffer || 0];
  if (!buf) throw new Error("Modellen hänvisar till en fil som saknas.");
  const size = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
  const dv = new DataView(buf), base = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || n * size;
  const get = { 5120: o => dv.getInt8(o), 5121: o => dv.getUint8(o), 5122: o => dv.getInt16(o, true), 5123: o => dv.getUint16(o, true), 5125: o => dv.getUint32(o, true), 5126: o => dv.getFloat32(o, true) }[a.componentType];
  const norm = a.normalized ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType] : 0;
  for (let k = 0; k < a.count; k++) for (let j = 0; j < n; j++) {
    const v = get(base + k * stride + j * size);
    out[k * n + j] = norm ? Math.max(-1, v / norm) : v;
  }
  return out;
}
const m4mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
function m4trs(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q;
  return [(1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + w * z) * s[0], 2 * (x * z - w * y) * s[0], 0,
    2 * (x * y - w * z) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + w * x) * s[1], 0,
    2 * (x * z + w * y) * s[2], 2 * (y * z - w * x) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, t[0], t[1], t[2], 1];
}
const pmHex = (r, g, b) => "#" + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, "0")).join("");
/* Medelfärgen i en textur (0–1), eller null. */
async function pmTextureColor(json, buffers, texIndex, resolveUri) {
  try {
    const tex = json.textures[texIndex], img = json.images[tex.source];
    let blob;
    if (img.bufferView !== undefined) { const bv = json.bufferViews[img.bufferView]; blob = new Blob([buffers[bv.buffer || 0].slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)], { type: img.mimeType || "image/png" }); }
    else if (img.uri) { const b = await resolveUri(img.uri); if (!b) return null; blob = new Blob([b]); }
    else return null;
    const bmp = await createImageBitmap(blob);
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
    const ctx = cv.getContext("2d"); ctx.drawImage(bmp, 0, 0, 8, 8);
    const d = ctx.getImageData(0, 0, 8, 8).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4 * 255;
    // sRGB -> linjärt (glTF:s färgfaktorer är linjära)
    const lin = v => Math.pow(v, 2.2);
    return [lin(r / n), lin(g / n), lin(b / n)];
  } catch (e) { return null; }
}
/* glTF (json + buffertar) -> { bbox, tris, mesh: { parts } }. Y uppåt -> Z uppåt, origo i botten-mitt. */
async function pmGltfToMesh(json, bin, resolveUri) {
  const req = json.extensionsRequired || [];
  if (req.some(x => /draco|meshopt/i.test(x))) throw new Error("Modellen är komprimerad (Draco/meshopt) och kan inte läsas. Välj en annan modell.");
  const buffers = [];
  for (let i = 0; i < (json.buffers || []).length; i++) {
    const b = json.buffers[i];
    if (!b.uri) buffers.push(bin);
    else if (b.uri.startsWith("data:")) buffers.push(await (await fetch(b.uri)).arrayBuffer());
    else buffers.push(await resolveUri(b.uri));
  }
  const groups = new Map(); // färgnyckel -> { c, t, pos: [], idx: [] }
  const matColor = new Map();
  const colorOf = async mi => {
    if (matColor.has(mi)) return matColor.get(mi);
    let rgba = [0.75, 0.75, 0.75, 1], blend = false;
    const m = mi === undefined ? null : (json.materials || [])[mi];
    if (m) {
      const pbr = m.pbrMetallicRoughness || {}, sg = (m.extensions || {}).KHR_materials_pbrSpecularGlossiness;
      const f = (sg && sg.diffuseFactor) || pbr.baseColorFactor || [1, 1, 1, 1];
      const ti = sg && sg.diffuseTexture ? sg.diffuseTexture.index : pbr.baseColorTexture ? pbr.baseColorTexture.index : undefined;
      const tc = ti !== undefined ? await pmTextureColor(json, buffers, ti, resolveUri) : null;
      rgba = [f[0] * (tc ? tc[0] : 1), f[1] * (tc ? tc[1] : 1), f[2] * (tc ? tc[2] : 1), f[3] === undefined ? 1 : f[3]];
      if (!tc && ti !== undefined && f[0] === 1 && f[1] === 1 && f[2] === 1) rgba = [0.75, 0.75, 0.75, rgba[3]];
      blend = m.alphaMode === "BLEND";
    }
    // linjärt -> sRGB för IFC-färgen
    const s = v => Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2);
    const r = { c: pmHex(s(rgba[0]), s(rgba[1]), s(rgba[2])), t: blend ? Math.round((1 - rgba[3]) * 100) / 100 : 0 };
    matColor.set(mi, r); return r;
  };
  let tris = 0;
  const walk = async (ni, parent) => {
    const node = json.nodes[ni];
    const local = node.matrix || m4trs(node.translation, node.rotation, node.scale);
    const M = m4mul(parent, local);
    if (node.mesh !== undefined) {
      const det = M[0] * (M[5] * M[10] - M[9] * M[6]) - M[4] * (M[1] * M[10] - M[9] * M[2]) + M[8] * (M[1] * M[6] - M[5] * M[2]);
      for (const pr of json.meshes[node.mesh].primitives || []) {
        const mode = pr.mode === undefined ? 4 : pr.mode;
        if (![4, 5, 6].includes(mode) || pr.attributes.POSITION === undefined) continue;
        const P = gltfRead(json, buffers, pr.attributes.POSITION), nv = P.length / 3;
        let I = pr.indices !== undefined ? gltfRead(json, buffers, pr.indices) : Float64Array.from({ length: nv }, (_, i) => i);
        if (mode !== 4) { // strip/fan -> lista
          const out = [];
          for (let k = 2; k < I.length; k++) out.push(...(mode === 5 ? (k % 2 ? [I[k - 1], I[k - 2], I[k]] : [I[k - 2], I[k - 1], I[k]]) : [I[0], I[k - 1], I[k]]));
          I = out;
        }
        const nt = Math.floor(I.length / 3);
        tris += nt;
        if (tris > PM_MAX_TRIS) throw new Error(`Modellen har mer än ${PM_MAX_TRIS.toLocaleString("sv-SE")} trianglar – för tung för Trimble Connect. Välj en enklare modell.`);
        const col = await colorOf(pr.material);
        const key = col.c + ":" + col.t;
        if (!groups.has(key)) groups.set(key, { c: col.c, t: col.t, pos: [], idx: [] });
        const g = groups.get(key), o = g.pos.length / 3;
        for (let k = 0; k < nv; k++) {
          const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2];
          const wx = M[0] * x + M[4] * y + M[8] * z + M[12], wy = M[1] * x + M[5] * y + M[9] * z + M[13], wz = M[2] * x + M[6] * y + M[10] * z + M[14];
          g.pos.push(wx, -wz, wy); // Y upp -> Z upp
        }
        for (let k = 0; k < nt; k++) {
          const a = I[k * 3] + o, b = I[k * 3 + 1] + o, c = I[k * 3 + 2] + o;
          g.idx.push(...(det < 0 ? [a, c, b] : [a, b, c]));
        }
      }
    }
    for (const c of node.children || []) await walk(c, M);
  };
  const scene = (json.scenes || [])[json.scene || 0];
  const roots = scene ? scene.nodes || [] : (json.nodes || []).map((_, i) => i);
  const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const r of roots) await walk(r, I4);
  if (!tris) throw new Error("Modellen innehåller ingen geometri.");
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  groups.forEach(g => { for (let k = 0; k < g.pos.length; k++) { const j = k % 3; if (g.pos[k] < mn[j]) mn[j] = g.pos[k]; if (g.pos[k] > mx[j]) mx[j] = g.pos[k]; } });
  const sh = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2]];
  const parts = [...groups.values()].map(g => ({ c: g.c, t: g.t, p: g.pos.map((v, k) => Math.round((v - sh[k % 3]) * 1000)), i: g.idx }));
  const r3 = v => Math.round(v * 1000) / 1000;
  return { tris, bbox: { min: [r3(mn[0] - sh[0]), r3(mn[1] - sh[1]), 0], max: [r3(mx[0] - sh[0]), r3(mx[1] - sh[1]), r3(mx[2] - sh[2])] }, mesh: { v: 1, parts } };
}

/* Minimal zip-läsare (Sketchfabs glTF-zip): namn -> () => ArrayBuffer. */
async function pmUnzip(buf) {
  const dv = new DataView(buf);
  let e = buf.byteLength - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("Zip-filen kunde inte läsas.");
  const n = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const files = new Map();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buf, p + 46, nlen));
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    const raw = buf.slice(start, start + csize);
    files.set(name, method === 0 ? async () => raw
      : async () => new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    p += 46 + nlen + elen + clen;
  }
  return files;
}
/* GLB eller glTF-zip (ArrayBuffer) -> mesh-resultat. */
async function pmModelFromBuffer(buf) {
  const sig = new DataView(buf).getUint32(0, true);
  if (sig === 0x46546C67) { const { json, bin } = glbSplit(buf); return pmGltfToMesh(json, bin, async () => null); }
  if (sig === 0x04034b50) {
    const files = await pmUnzip(buf);
    const gl = [...files.keys()].find(k => /\.glb$/i.test(k));
    if (gl) return pmModelFromBuffer(await files.get(gl)());
    const gf = [...files.keys()].find(k => /\.gltf$/i.test(k));
    if (!gf) throw new Error("Zip-filen innehåller ingen glTF-modell.");
    const dir = gf.includes("/") ? gf.slice(0, gf.lastIndexOf("/") + 1) : "";
    const json = JSON.parse(new TextDecoder().decode(await files.get(gf)()));
    const resolve = async uri => { const f = files.get(dir + decodeURIComponent(uri)) || files.get(decodeURIComponent(uri)); return f ? f() : null; };
    return pmGltfToMesh(json, null, resolve);
  }
  throw new Error("Okänt filformat – använd .glb, .zip (glTF) eller .ifc.");
}

// ---------------------------------------------------------------------
// IFC-filer: enhet, ungefärlig storlek och flytt till punkten
// ---------------------------------------------------------------------
function pmIfcLengthFactor(text) {
  const ua = text.match(/IFCUNITASSIGNMENT\s*\(\s*\(([^)]*)\)/i);
  const refs = ua ? ua[1].match(/#\d+/g) || [] : [];
  for (const r of refs) {
    const m = text.match(new RegExp(`${r}\\s*=\\s*([^;]*);`));
    if (!m) continue;
    const d = m[1].toUpperCase();
    if (/^IFCSIUNIT/.test(d) && d.includes(".LENGTHUNIT.")) {
      const pre = (d.match(/\.(EXA|PETA|TERA|GIGA|MEGA|KILO|HECTO|DECA|DECI|CENTI|MILLI|MICRO)\./) || [])[1];
      return { KILO: 1000, HECTO: 100, DECA: 10, DECI: 0.1, CENTI: 0.01, MILLI: 0.001, MICRO: 1e-6 }[pre] || 1;
    }
    if (/^IFCCONVERSIONBASEDUNIT/.test(d) && d.includes(".LENGTHUNIT.")) return /INCH/.test(d) ? 0.0254 : /FOOT|FEET/.test(d) ? 0.3048 : /YARD/.test(d) ? 0.9144 : 1;
  }
  return 1;
}
function pmIfcInfo(text) {
  if (!/ISO-10303-21/.test(text.slice(0, 400))) throw new Error("Filen är inte en IFC-fil (STEP).");
  const f = pmIfcLengthFactor(text);
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const add = (x, y, z) => { [x, y, z].forEach((v, j) => { if (Number.isFinite(v)) { if (v < mn[j]) mn[j] = v; if (v > mx[j]) mx[j] = v; } }); };
  const reP = /IFCCARTESIANPOINT\s*\(\s*\(\s*([-\d.eE+]+)\s*,\s*([-\d.eE+]+)\s*(?:,\s*([-\d.eE+]+))?\s*\)/gi;
  let m;
  while ((m = reP.exec(text))) add(+m[1], +m[2], m[3] === undefined ? 0 : +m[3]);
  const reL = /IFCCARTESIANPOINTLIST3D\s*\(\s*\(((?:\s*\([^()]*\)\s*,?)*)\)/gi;
  while ((m = reL.exec(text))) { const r = /\(\s*([-\d.eE+]+)\s*,\s*([-\d.eE+]+)\s*,\s*([-\d.eE+]+)\s*\)/g; let q; while ((q = r.exec(m[1]))) add(+q[1], +q[2], +q[3]); }
  if (!Number.isFinite(mn[0])) { mn.fill(0); mx.fill(1 / f); }
  const b = { min: mn.map(v => v * f), max: mx.map(v => v * f) };
  // Långt från origo (georefererad fil): flytta filens mitt/botten till punkten i stället för dess origo.
  const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
  const off = Math.hypot(cx, cy) > 50 ? [-cx, -cy, -b.min[2]] : [0, 0, 0];
  const r3 = v => Math.round(v * 1000) / 1000;
  const products = (text.match(/=\s*IFC(?!PROJECT|SITE|BUILDING\b|BUILDINGSTOREY|REL|PROPERTY|OWNERHISTORY)\w+\s*\(\s*'[0-9A-Za-z_$]{22}'/gi) || []).length;
  return { factor: f, offset: off.map(r3), bbox: { min: b.min.map((v, j) => r3(v + off[j])), max: b.max.map((v, j) => r3(v + off[j])) }, products };
}
/* IFC-filen flyttad och vriden till placeringen p (meter). Objektens GUID:er görs unika per
   placering (samma placering ger samma id:n i nästa version). */
function pmIfcPlaced(text, p, a) {
  const f = a.factor || 1, t = (Number(p.rot) || 0) * Math.PI / 180;
  let maxId = 0;
  for (const m of text.matchAll(/#(\d+)\s*=/g)) maxId = Math.max(maxId, +m[1]);
  const id = k => `#${maxId + k}`, num = v => ifcNum(v);
  const z = (Number(p.z) || 0) + (Number(p.dz) || 0), off = a.offset || [0, 0, 0];
  const add = [
    `${id(1)}=IFCCARTESIANPOINT((${num(p.x / f)},${num(p.y / f)},${num(z / f)}));`,
    `${id(2)}=IFCDIRECTION((0.,0.,1.));`,
    `${id(3)}=IFCDIRECTION((${num(Math.cos(t))},${num(Math.sin(t))},0.));`,
    `${id(4)}=IFCAXIS2PLACEMENT3D(${id(1)},${id(2)},${id(3)});`,
    `${id(5)}=IFCLOCALPLACEMENT($,${id(4)});`,
    `${id(6)}=IFCCARTESIANPOINT((${num(off[0] / f)},${num(off[1] / f)},${num(off[2] / f)}));`,
    `${id(7)}=IFCAXIS2PLACEMENT3D(${id(6)},$,$);`,
    `${id(8)}=IFCLOCALPLACEMENT(${id(5)},${id(7)});`,
  ];
  let out = text.replace(/(=\s*IFCLOCALPLACEMENT\s*\(\s*)\$(\s*,)/gi, `$1${id(8)}$2`);
  out = out.replace(/(#\d+\s*=\s*IFC\w+\s*\(\s*')([0-9A-Za-z_$]{22})'/g, (all, head, g) => `${head}${placeGuid(p.id, g)}'`);
  out = out.replace(/(\n|^)DATA;\s*\r?\n/, m => m + add.join("\r\n") + "\r\n");
  return out;
}

// ---------------------------------------------------------------------
// Etablering-IFC: geometrin för GLB-modeller (anropas från place3d.js)
// ---------------------------------------------------------------------
function placeModelMeshes(doc, p, o) {
  const a = placeAssetOf(String(p.type).slice(6)), mesh = a && placeMeshCache.get(a.id);
  if (!mesh) return [];
  const k = placeScale(p), t = (Number(p.rot) || 0) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const z = (Number(p.z) || 0) + (Number(p.dz) || 0);
  return mesh.parts.filter(pt => pt.i.length >= 3).map(pt => {
    const pts = [];
    for (let i = 0; i < pt.p.length; i += 3) {
      const lx = pt.p[i] / 1000 * k, ly = pt.p[i + 1] / 1000 * k, lz = pt.p[i + 2] / 1000 * k;
      pts.push(`(${ifcNum(p.x + lx * c - ly * s - o[0])},${ifcNum(p.y + lx * s + ly * c - o[1])},${ifcNum(z + lz - o[2])})`);
    }
    const faces = [];
    for (let i = 0; i + 2 < pt.i.length; i += 3) faces.push(`(${pt.i[i] + 1},${pt.i[i + 1] + 1},${pt.i[i + 2] + 1})`);
    const pl = doc.E(`IFCCARTESIANPOINTLIST3D((${pts.join(",")}))`);
    const m = doc.E(`IFCTRIANGULATEDFACESET(${pl},$,.F.,(${faces.join(",")}),$)`);
    doc.E(`IFCSTYLEDITEM(${m},(${doc.style(`m:${pt.c}:${pt.t}`, pt.c, a.name, pt.t || 0)}),$)`);
    return m;
  });
}
async function pmReadAssetFile(a) {
  const url = await ghReadBinaryUrl(settings.githubToken, a.path);
  try { const r = await fetch(url); return a.kind === "ifc" ? r.text() : r.json(); }
  finally { URL.revokeObjectURL(url); }
}
/* Hämtar in geometrin för de GLB-modeller som är placerade. */
async function placeModelsPrepare() {
  const ids = new Set(placements.filter(p => String(p.type).startsWith("model:")).map(p => p.type.slice(6)));
  for (const id of ids) {
    const a = placeAssetOf(id);
    if (!a || a.kind !== "mesh" || placeMeshCache.has(id)) continue;
    try { placeMeshCache.set(id, await pmReadAssetFile(a)); }
    catch (e) { setPlaceStatus(`Kunde inte läsa modellen "${a.name}": ${e.message}`, true); }
  }
}
/* En flyttad IFC-fil per ny/ändrad placering av en IFC-modell. */
async function placeModelIfcFiles() {
  const out = [];
  for (const p of placements) {
    const a = String(p.type).startsWith("model:") ? placeAssetOf(p.type.slice(6)) : null;
    if (!a || a.kind !== "ifc" || !placeIsNew(p)) continue;
    let text = placeIfcCache.get(a.id);
    if (!text) { text = await pmReadAssetFile(a); placeIfcCache.set(a.id, text); }
    const name = `${p.name || a.name} [${p.id.slice(0, 6)}].ifc`.replace(/[\\/:*?"<>|]/g, "-");
    out.push(new File([new TextEncoder().encode(pmIfcPlaced(text, p, a))], name, { type: "application/x-step" }));
  }
  return out;
}

// ---------------------------------------------------------------------
// Lägga till i biblioteket
// ---------------------------------------------------------------------
/* pending = { name, kind, source, uid, url, author, license, bbox, tris, factor, offset, mesh | text } */
async function pmSaveAsset(pd, scale) {
  if (!projectId) throw new Error("Inget projekt är inläst.");
  const id = ghNewId();
  const path = `projects/${encodeURIComponent(projectId)}/models/${id}.${pd.kind === "ifc" ? "ifc" : "json"}`;
  const body = pd.kind === "ifc" ? pd.text : JSON.stringify(pd.mesh);
  await ghUploadBinary(settings.githubToken, path, new File([body], path.split("/").pop()), `Modell till Placera i 3D: ${pd.name}`);
  const a = { id, name: pd.name, kind: pd.kind, source: pd.source, uid: pd.uid || null, url: pd.url || null, author: pd.author || null, license: pd.license || null,
    bbox: pd.bbox, tris: pd.tris || null, factor: pd.factor || null, offset: pd.offset || null, scale: pd.kind === "mesh" ? scale || 1 : 1,
    path, size: body.length, created_at: new Date().toISOString(), by: settings.userName || null };
  await ghWriteJSON(settings.githubToken, pmAssetsPath(), arr => [...(arr || []).filter(x => x.id !== id), a], `Modell till Placera i 3D: ${pd.name}`);
  placeAssets.push(a);
  if (pd.kind === "ifc") placeIfcCache.set(id, pd.text); else placeMeshCache.set(id, pd.mesh);
  return a;
}
async function pmFromFile(file) {
  const name = file.name.replace(/\.(ifc|glb|zip)$/i, "");
  if (/\.ifc$/i.test(file.name)) {
    if (file.size > PM_MAX_IFC) throw new Error(`IFC-filen är för stor (${Math.round(file.size / 1048576)} MB, max ${PM_MAX_IFC / 1048576} MB).`);
    const text = await file.text();
    const info = pmIfcInfo(text);
    return { name, kind: "ifc", source: "Fil", text, ...info };
  }
  if (file.size > PM_MAX_DOWNLOAD) throw new Error(`Filen är för stor (${Math.round(file.size / 1048576)} MB).`);
  const r = await pmModelFromBuffer(await file.arrayBuffer());
  return { name, kind: "mesh", source: "Fil", ...r };
}

// ---------------------------------------------------------------------
// Sketchfab
// ---------------------------------------------------------------------
async function sfFetch(path, auth) {
  const headers = auth ? { Authorization: `Token ${sfToken()}` } : {};
  const res = await fetch(path.startsWith("http") ? path : SF_API + path, { headers });
  if (res.status === 401 || res.status === 403) { const e = new Error("Sketchfab godkände inte inloggningen. Kontrollera API-nyckeln (Logga ut och klistra in den igen)."); e.auth = true; throw e; }
  if (res.status === 429) throw new Error("Sketchfab begränsar antalet hämtningar just nu. Vänta en stund och försök igen.");
  if (!res.ok) throw new Error(`Sketchfab svarade ${res.status}.`);
  return res.json();
}
async function sfLogin(token) {
  sfSetToken(token.trim());
  try { pmState.me = await sfFetch("/me", true); }
  catch (e) { sfSetToken(""); pmState.me = null; throw e; }
}
async function sfSearch(more) {
  const q = pmState.q.trim();
  const url = more && pmState.next ? pmState.next
    : `/search?type=models&downloadable=true&count=24&max_face_count=${PM_MAX_TRIS}&sort_by=-likeCount&q=${encodeURIComponent(q)}`;
  const r = await sfFetch(url, false);
  pmState.results = more ? [...pmState.results, ...(r.results || [])] : (r.results || []);
  pmState.next = r.next || null;
}
async function sfImport(uid) {
  const info = pmState.results.find(r => r.uid === uid) || await sfFetch(`/models/${uid}`, false).catch(() => ({ uid }));
  const dl = await sfFetch(`/models/${uid}/download`, true);
  const pick = dl.glb || dl.gltf;
  if (!pick || !pick.url) throw new Error("Modellen går inte att hämta som glTF.");
  if (pick.size > PM_MAX_DOWNLOAD) throw new Error(`Modellen är för stor (${Math.round(pick.size / 1048576)} MB). Välj en enklare modell.`);
  const res = await fetch(pick.url);
  if (!res.ok) throw new Error(`Nedladdningen misslyckades (${res.status}).`);
  const r = await pmModelFromBuffer(await res.arrayBuffer());
  let lic = info.license && (info.license.label || info.license.slug || info.license);
  if (!lic) { try { const full = await sfFetch(`/models/${uid}`, false); lic = full.license && (full.license.label || full.license.slug); } catch (e) {} }
  return { name: info.name || "Sketchfab-modell", kind: "mesh", source: "Sketchfab", uid, url: info.viewerUrl || `https://sketchfab.com/3d-models/${uid}`,
    author: info.user ? info.user.displayName || info.user.username : null, license: typeof lic === "string" ? lic : null, ...r };
}

// ---------------------------------------------------------------------
// Panelen "Hämta modell"
// ---------------------------------------------------------------------
function placeBrowserToggle(open) { pmState.open = open === undefined ? !pmState.open : !!open; renderPmBrowser(); }
async function pmRun(label, fn) {
  pmState.busy = true; pmState.msg = label; pmState.bad = false; renderPmBrowser();
  try { await fn(); pmState.msg = ""; }
  catch (e) { pmState.msg = e.message || String(e); pmState.bad = true; }
  pmState.busy = false; renderPmBrowser();
}
function pmFmt(n) { return Number(n || 0).toLocaleString("sv-SE"); }
function renderPmBrowser() {
  const box = document.getElementById("placeModelBrowser");
  if (!box) return;
  box.classList.toggle("hidden", !pmState.open);
  if (!pmState.open) { box.innerHTML = ""; return; }
  const esc = typeof escapeHtml === "function" ? escapeHtml : s => String(s);
  const tok = sfToken(), pd = pmState.pending;
  let body = "";
  if (pd) {
    const b = pd.bbox, d = j => Math.round((b.max[j] - b.min[j]) * 100) / 100;
    body = `<div class="pm-confirm">
      <label>Namn<input type="text" id="pmName" value="${esc(pd.name)}" /></label>
      <div class="hint">${pd.kind === "ifc" ? `IFC-fil · ungefär ${d(0)} × ${d(1)} × ${d(2)} m · ${pmFmt(pd.products)} objekt${pd.offset && pd.offset.some(v => v) ? " · filen ligger långt från origo – dess mitt placeras i punkten" : ""}`
        : `${pmFmt(pd.tris)} trianglar · ${d(0)} × ${d(1)} × ${d(2)} m i filen${pd.author ? ` · av ${esc(pd.author)}` : ""}${pd.license ? ` · ${esc(pd.license)}` : ""}`}</div>
      ${pd.kind === "mesh" ? `<label>Höjd i verkligheten (m)<input type="number" step="0.1" id="pmHeight" value="${d(2)}" title="Modeller från nätet har ofta fel skala – ange hur hög den ska vara" /></label>` : ""}
      <div class="row"><button type="button" id="pmAccept" class="primary">Lägg till och placera</button><button type="button" id="pmReject">Avbryt</button></div>
    </div>`;
  } else if (pmState.tab === "sketchfab") {
    if (!tok) body = `<div class="pm-login">
        <p class="hint">Logga in med din API-nyckel från Sketchfab: <a href="https://sketchfab.com/settings/password" target="_blank" rel="noopener">sketchfab.com → Settings → Password &amp; API</a> (skapa ett gratis konto om du inte har något). Nyckeln sparas bara i den här webbläsaren.</p>
        <div class="row"><input type="password" id="pmToken" placeholder="API-nyckel" style="flex:1" /><button type="button" id="pmLogin" class="primary">Logga in</button></div>
      </div>`;
    else body = `<div class="pm-who hint">Inloggad på Sketchfab${pmState.me ? ` som <b>${esc(pmState.me.displayName || pmState.me.username || "")}</b>` : ""} · <a href="#" id="pmLogout">Logga ut</a></div>
      <div class="row"><input type="search" id="pmQuery" value="${esc(pmState.q)}" placeholder="Sök modell, t.ex. tornkran, bod, grävmaskin" style="flex:1" /><button type="button" id="pmSearch" class="primary">Sök</button></div>
      <div class="pm-grid">${pmState.results.map(r => {
        const th = ((r.thumbnails && r.thumbnails.images) || []).filter(i => i.width >= 150).sort((a, b) => a.width - b.width)[0];
        const lic = r.license && (r.license.label || r.license);
        return `<div class="pm-card">${th ? `<img src="${esc(th.url)}" alt="" loading="lazy" />` : `<div class="pm-noimg"></div>`}
          <div class="pm-cn" title="${esc(r.name)}">${esc(r.name)}</div>
          <div class="hint">${esc((r.user && (r.user.displayName || r.user.username)) || "")}${r.faceCount ? ` · ${pmFmt(r.faceCount)} tri` : ""}${typeof lic === "string" ? ` · ${esc(lic)}` : ""}</div>
          <button type="button" data-sf-uid="${esc(r.uid)}">Hämta</button></div>`;
      }).join("")}</div>
      ${pmState.next ? `<button type="button" id="pmMore">Visa fler</button>` : ""}`;
  } else {
    body = `<p class="hint">Välj en IFC-fil (t.ex. nedladdad från <a href="https://www.bimobject.com/sv" target="_blank" rel="noopener">BIMobject</a> eller en leverantör) eller en 3D-modell som .glb eller glTF-zip.</p>
      <input type="file" id="pmFile" accept=".ifc,.glb,.zip" />`;
  }
  const lib = placeAssets.length ? `<details class="pm-lib"><summary>Biblioteket (${placeAssets.length})</summary>${placeAssets.map(a =>
    `<div class="pm-libr"><span>${esc(a.name)}</span><span class="hint">${a.kind === "ifc" ? "IFC" : `${pmFmt(a.tris)} tri`}${a.author ? ` · ${esc(a.author)}` : ""}${a.license ? ` · ${esc(a.license)}` : ""}</span></div>`).join("")}</details>` : "";
  box.innerHTML = `<div class="pm-head"><b>Hämta modell</b>
      <span class="pm-tabs"><button type="button" data-pmtab="sketchfab" class="${pmState.tab === "sketchfab" ? "active" : ""}">Sketchfab</button><button type="button" data-pmtab="file" class="${pmState.tab === "file" ? "active" : ""}">Från fil</button></span>
      <button type="button" id="pmClose" title="Stäng">✕</button></div>
    ${body}
    <div class="pm-msg ${pmState.bad ? "place-bad" : ""}">${pmState.busy ? '<span class="pm-spin"></span>' : ""}${esc(pmState.msg || "")}</div>${lib}`;
  box.querySelectorAll("button, input").forEach(el => { if (pmState.busy && el.id !== "pmClose") el.disabled = true; });
  const on = (id, fn) => { const el = box.querySelector("#" + id); if (el) el.onclick = fn; };
  on("pmClose", () => placeBrowserToggle(false));
  box.querySelectorAll("[data-pmtab]").forEach(b => { b.onclick = () => { pmState.tab = b.dataset.pmtab; pmState.msg = ""; renderPmBrowser(); }; });
  on("pmLogin", () => { const t = box.querySelector("#pmToken").value; if (t.trim()) pmRun("Loggar in…", () => sfLogin(t)); });
  on("pmLogout", e => { e.preventDefault(); sfSetToken(""); pmState.me = null; pmState.results = []; renderPmBrowser(); });
  const doSearch = () => { pmState.q = box.querySelector("#pmQuery").value; pmRun("Söker…", () => sfSearch(false)); };
  on("pmSearch", doSearch);
  const q = box.querySelector("#pmQuery"); if (q) q.onkeydown = e => { if (e.key === "Enter") doSearch(); };
  on("pmMore", () => pmRun("Hämtar fler…", () => sfSearch(true)));
  box.querySelectorAll("[data-sf-uid]").forEach(b => { b.onclick = () => pmRun("Laddar ned och läser modellen…", async () => { pmState.pending = await sfImport(b.dataset.sfUid); }); });
  const fi = box.querySelector("#pmFile");
  if (fi) fi.onchange = () => { const f = fi.files[0]; if (f) pmRun("Läser filen…", async () => { pmState.pending = await pmFromFile(f); }); };
  on("pmReject", () => { pmState.pending = null; renderPmBrowser(); });
  on("pmAccept", () => {
    const p = pmState.pending;
    p.name = (box.querySelector("#pmName").value || p.name).trim() || p.name;
    const hIn = box.querySelector("#pmHeight"), h0 = p.bbox.max[2] - p.bbox.min[2];
    const scale = hIn && h0 > 0 ? Math.max(0.0001, placeNum(hIn.value, h0) / h0) : 1;
    pmRun("Sparar modellen i projektet…", async () => {
      const a = await pmSaveAsset(p, Math.round(scale * 10000) / 10000);
      pmState.pending = null; pmState.open = false;
      renderPlacePanel();
      placeStart(`model:${a.id}`);
    });
  });
  // Visa vem som är inloggad (en gång).
  if (tok && !pmState.me && !pmState.busy && pmState.tab === "sketchfab" && !pmState._meTried) {
    pmState._meTried = true;
    sfFetch("/me", true).then(me => { pmState.me = me; renderPmBrowser(); }).catch(() => {});
  }
}
