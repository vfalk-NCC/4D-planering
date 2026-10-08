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
    const avg = await pmImageAvg(blob);
    // sRGB -> linjärt (glTF:s färgfaktorer är linjära)
    return avg ? avg.map(v => Math.pow(v, 2.2)) : null;
  } catch (e) { return null; }
}
/* Medelfärgen i en bild (sRGB 0–1), eller null. */
async function pmImageAvg(blob) {
  try {
    const bmp = await createImageBitmap(blob);
    const cv = document.createElement("canvas"); cv.width = 8; cv.height = 8;
    const ctx = cv.getContext("2d"); ctx.drawImage(bmp, 0, 0, 8, 8);
    const d = ctx.getImageData(0, 0, 8, 8).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    const n = d.length / 4 * 255;
    return [r / n, g / n, b / n];
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
  return pmFinish(groups, tris);
}
/* Grupperna (färg -> punkter i meter, Z upp + index) -> origo i botten-mitt, mm-heltal. */
function pmFinish(groups, tris) {
  if (!tris) throw new Error("Modellen innehåller ingen geometri.");
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  groups.forEach(g => { for (let k = 0; k < g.pos.length; k++) { const j = k % 3; if (g.pos[k] < mn[j]) mn[j] = g.pos[k]; if (g.pos[k] > mx[j]) mx[j] = g.pos[k]; } });
  const sh = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2]];
  const parts = [...groups.values()].map(g => ({ c: g.c, t: g.t, p: g.pos.map((v, k) => Math.round((v - sh[k % 3]) * 1000)), i: g.idx }));
  const r3 = v => Math.round(v * 1000) / 1000;
  return { tris, bbox: { min: [r3(mn[0] - sh[0]), r3(mn[1] - sh[1]), 0], max: [r3(mx[0] - sh[0]), r3(mx[1] - sh[1]), r3(mx[2] - sh[2])] }, mesh: { v: 1, parts } };
}

/* Samlar trianglar per färg för Collada/OBJ (punkter redan i meter, Z uppåt). */
function pmBuilder() {
  const groups = new Map();
  let tris = 0;
  return {
    add(col, pts, idx) {
      tris += idx.length / 3;
      if (tris > PM_MAX_TRIS) throw new Error(`Modellen har mer än ${PM_MAX_TRIS.toLocaleString("sv-SE")} trianglar – för tung för Trimble Connect. Välj en enklare modell.`);
      const key = col.c + ":" + col.t;
      if (!groups.has(key)) groups.set(key, { c: col.c, t: col.t, pos: [], idx: [] });
      const g = groups.get(key), o = g.pos.length / 3;
      for (const v of pts) g.pos.push(v);
      for (const i of idx) g.idx.push(i + o);
    },
    finish() { return pmFinish(groups, tris); },
  };
}
const PM_GREY = { c: "#bfbfbf", t: 0 };
const pmCol = (rgb, t = 0) => ({ c: pmHex(rgb[0], rgb[1], rgb[2]), t: Math.max(0, Math.min(0.95, Math.round(t * 100) / 100)) });
/* Fil i en zip relativt en annan fil (skiftlägesokänsligt som reserv). */
function pmZipResolver(files, baseName) {
  const dir = baseName && baseName.includes("/") ? baseName.slice(0, baseName.lastIndexOf("/") + 1) : "";
  const lower = new Map([...files.keys()].map(k => [k.toLowerCase(), k]));
  return async uri => {
    if (!files) return null;
    let u = decodeURIComponent(String(uri || "")).replace(/^file:\/+/, "").replace(/\\/g, "/").replace(/^\.\//, "");
    const tries = [dir + u, u, u.split("/").pop(), dir + u.split("/").pop()];
    for (const t of tries) { const k = files.has(t) ? t : lower.get(t.toLowerCase()); if (k) return files.get(k)(); }
    // ../ i sökvägen
    const norm = (dir + u).split("/").reduce((a, x) => (x === ".." ? a.slice(0, -1) : x === "." ? a : [...a, x]), []).join("/");
    const k = lower.get(norm.toLowerCase());
    return k ? files.get(k)() : null;
  };
}

/* Collada (.dae, t.ex. SketchUp/3D Warehouse) -> mesh. resolve(uri) ger texturfiler ur zip/kmz. */
async function pmDaeToMesh(text, resolve) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length || !doc.getElementsByTagName("COLLADA").length) throw new Error("Collada-filen kunde inte läsas.");
  const kids = (el, tag) => el ? [...el.children].filter(c => c.localName === tag) : [];
  const kid = (el, tag) => kids(el, tag)[0] || null;
  const byId = new Map();
  for (const el of doc.getElementsByTagName("*")) { const id = el.getAttribute("id"); if (id) byId.set(id, el); }
  const ref = u => byId.get(String(u || "").replace(/^#/, "")) || null;
  const nums = el => (el ? el.textContent.trim().split(/\s+/).filter(Boolean).map(Number) : []);
  const asset = kid(doc.documentElement, "asset");
  const unit = Number((kid(asset, "unit") || { getAttribute: () => 1 }).getAttribute("meter")) || 1;
  const up = ((kid(asset, "up_axis") || {}).textContent || "Y_UP").trim();
  // Material -> färg
  const matCache = new Map();
  const matColor = async matId => {
    if (matCache.has(matId)) return matCache.get(matId);
    let col = PM_GREY;
    try {
      const mat = ref(matId), eff = mat && ref(kid(mat, "instance_effect").getAttribute("url"));
      const prof = eff && kid(eff, "profile_COMMON"), tech = prof && kid(prof, "technique");
      const sh = tech && (kid(tech, "phong") || kid(tech, "lambert") || kid(tech, "blinn") || kid(tech, "constant"));
      const dif = sh && (kid(sh, "diffuse") || kid(sh, "emission"));
      let rgb = null;
      const c = kid(dif, "color");
      if (c) rgb = nums(c).slice(0, 3);
      const tx = kid(dif, "texture");
      if (tx && !rgb) {
        const sid = tx.getAttribute("texture");
        const np = sid => [...prof.getElementsByTagName("newparam")].find(n => n.getAttribute("sid") === sid);
        let img = null;
        const p1 = np(sid);
        if (p1) {
          const smp = p1.getElementsByTagName("source")[0];
          const p2 = smp ? np(smp.textContent.trim()) : p1;
          const init = p2 && p2.getElementsByTagName("init_from")[0];
          img = init ? ref(init.textContent.trim()) : null;
        } else img = ref(sid);
        const file = img && img.getElementsByTagName("init_from")[0];
        const buf = file && resolve ? await resolve(file.textContent.trim()) : null;
        if (buf) rgb = await pmImageAvg(new Blob([buf]));
      }
      let t = 0;
      const tr = kid(sh, "transparency"), f = tr && kid(tr, "float");
      if (f) { const v = Number(f.textContent); if (Number.isFinite(v) && v > 0 && v < 1) t = 1 - v; }
      if (rgb) col = pmCol(rgb, t);
    } catch (e) { /* grått */ }
    matCache.set(matId, col); return col;
  };
  // Geometri -> primitiver { sym, pos, idx }
  const geoCache = new Map();
  const geometry = gid => {
    if (geoCache.has(gid)) return geoCache.get(gid);
    const g = ref(gid), mesh = g && kid(g, "mesh"), prims = [];
    if (mesh) {
      const srcPos = new Map();
      kids(mesh, "vertices").forEach(v => { const inp = kids(v, "input").find(i => i.getAttribute("semantic") === "POSITION"); if (inp) srcPos.set(v.getAttribute("id"), inp.getAttribute("source")); });
      const floats = new Map();
      const srcData = id => {
        if (floats.has(id)) return floats.get(id);
        const s = ref(id), fa = s && kid(s, "float_array"), acc = s && s.getElementsByTagName("accessor")[0];
        const r = { f: nums(fa), stride: acc ? Number(acc.getAttribute("stride")) || 3 : 3 };
        floats.set(id, r); return r;
      };
      for (const el of mesh.children) {
        const tag = el.localName;
        if (!["triangles", "polylist", "polygons", "trifans", "tristrips"].includes(tag)) continue;
        const inputs = kids(el, "input");
        const stride = Math.max(...inputs.map(i => Number(i.getAttribute("offset")) || 0)) + 1;
        const vin = inputs.find(i => i.getAttribute("semantic") === "VERTEX");
        if (!vin) continue;
        const vo = Number(vin.getAttribute("offset")) || 0;
        const vid = vin.getAttribute("source").replace(/^#/, "");
        const ps = srcData(srcPos.get(vid) || vid);
        const P = [];
        for (let i = 0; i * ps.stride + 2 < ps.f.length; i++) P.push(ps.f[i * ps.stride], ps.f[i * ps.stride + 1], ps.f[i * ps.stride + 2]);
        const idx = [];
        const polys = [];
        if (tag === "triangles") { const p = nums(kid(el, "p")); for (let i = 0; i + 3 * stride <= p.length; i += 3 * stride) polys.push([p[i + vo], p[i + stride + vo], p[i + 2 * stride + vo]]); }
        else if (tag === "polylist") {
          const vc = nums(kid(el, "vcount")), p = nums(kid(el, "p"));
          let o = 0; vc.forEach(n => { const poly = []; for (let k = 0; k < n; k++) poly.push(p[(o + k) * stride + vo]); polys.push(poly); o += n; });
        } else kids(el, "p").forEach(pe => {
          const p = nums(pe), poly = []; for (let k = 0; k * stride < p.length; k++) poly.push(p[k * stride + vo]);
          if (tag === "tristrips") { for (let k = 2; k < poly.length; k++) polys.push(k % 2 ? [poly[k - 1], poly[k - 2], poly[k]] : [poly[k - 2], poly[k - 1], poly[k]]); }
          else polys.push(poly);
        });
        polys.forEach(poly => { for (let k = 1; k + 1 < poly.length; k++) idx.push(poly[0], poly[k], poly[k + 1]); });
        if (idx.length) prims.push({ sym: el.getAttribute("material") || "", pos: P, idx });
      }
    }
    geoCache.set(gid, prims); return prims;
  };
  const B = pmBuilder();
  const rowToCol = m => [m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14], m[3], m[7], m[11], m[15]];
  const axisRot = (x, y, z, deg) => {
    const l = Math.hypot(x, y, z) || 1, h = deg * Math.PI / 360, s = Math.sin(h) / l;
    return m4trs(undefined, [x * s, y * s, z * s, Math.cos(h)]);
  };
  // Upp-axel och enhet: Y upp -> Z upp
  const fix = up === "Z_UP" ? [unit, 0, 0, 0, 0, unit, 0, 0, 0, 0, unit, 0, 0, 0, 0, 1]
    : up === "X_UP" ? [0, unit, 0, 0, -unit, 0, 0, 0, 0, 0, unit, 0, 0, 0, 0, 1]
    : [unit, 0, 0, 0, 0, 0, unit, 0, 0, -unit, 0, 0, 0, 0, 0, 1];
  let depth = 0;
  const walk = async (node, parent) => {
    if (++depth > 64) { depth--; return; }
    let M = parent;
    for (const t of node.children) {
      const v = nums(t);
      if (t.localName === "matrix" && v.length === 16) M = m4mul(M, rowToCol(v));
      else if (t.localName === "translate") M = m4mul(M, m4trs([v[0], v[1], v[2]]));
      else if (t.localName === "rotate") M = m4mul(M, axisRot(v[0], v[1], v[2], v[3]));
      else if (t.localName === "scale") M = m4mul(M, m4trs(undefined, undefined, [v[0], v[1], v[2]]));
    }
    const det = M[0] * (M[5] * M[10] - M[9] * M[6]) - M[4] * (M[1] * M[10] - M[9] * M[2]) + M[8] * (M[1] * M[6] - M[5] * M[2]);
    for (const ig of kids(node, "instance_geometry")) {
      const bind = {};
      ig.querySelectorAll("instance_material").forEach(im => { bind[im.getAttribute("symbol")] = im.getAttribute("target"); });
      for (const pr of geometry(ig.getAttribute("url").replace(/^#/, ""))) {
        const col = await matColor(bind[pr.sym] || pr.sym);
        const pts = [];
        for (let i = 0; i < pr.pos.length; i += 3) {
          const x = pr.pos[i], y = pr.pos[i + 1], z = pr.pos[i + 2];
          pts.push(M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]);
        }
        const idx = det < 0 ? pr.idx.map((v, i) => pr.idx[i - (i % 3) + [0, 2, 1][i % 3]]) : pr.idx;
        B.add(col, pts, idx);
      }
    }
    for (const n of kids(node, "node")) await walk(n, M);
    for (const inn of kids(node, "instance_node")) { const n = ref(inn.getAttribute("url")); if (n) await walk(n, M); }
    depth--;
  };
  const sceneRef = doc.getElementsByTagName("instance_visual_scene")[0];
  const scene = sceneRef ? ref(sceneRef.getAttribute("url")) : doc.getElementsByTagName("visual_scene")[0];
  if (!scene) throw new Error("Collada-filen saknar en scen.");
  for (const n of kids(scene, "node")) await walk(n, fix);
  return B.finish();
}

/* OBJ (+ .mtl i samma zip) -> mesh. Y uppåt antas (vanligast). */
async function pmObjToMesh(text, resolve) {
  const V = [], B = pmBuilder(), mats = new Map();
  let cur = null, curPts = [], curIdx = [], map = new Map();
  const flush = async () => {
    if (curIdx.length) B.add(cur ? await cur : PM_GREY, curPts, curIdx);
    curPts = []; curIdx = []; map = new Map();
  };
  const loadMtl = async name => {
    const buf = resolve ? await resolve(name) : null;
    if (!buf) return;
    let m = null;
    for (const line of new TextDecoder().decode(buf).split(/\r?\n/)) {
      const t = line.trim().split(/\s+/), k = t[0];
      if (k === "newmtl") { m = { kd: null, d: 1, tex: null }; mats.set(t.slice(1).join(" "), m); }
      else if (!m) continue;
      else if (k === "Kd") m.kd = t.slice(1, 4).map(Number);
      else if (k === "d") m.d = Number(t[1]);
      else if (k === "Tr") m.d = 1 - Number(t[1]);
      else if (k === "map_Kd") m.tex = t[t.length - 1];
    }
  };
  const colOf = async name => {
    const m = mats.get(name);
    if (!m) return PM_GREY;
    let rgb = m.kd;
    if (m.tex && (!rgb || rgb.every(v => v >= 0.99))) { const b = resolve ? await resolve(m.tex) : null; const avg = b ? await pmImageAvg(new Blob([b])) : null; if (avg) rgb = avg.map((v, i) => v * (rgb ? rgb[i] : 1)); }
    return rgb ? pmCol(rgb, Number.isFinite(m.d) && m.d < 1 ? 1 - m.d : 0) : PM_GREY;
  };
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim().split(/\s+/), k = t[0];
    if (k === "v") V.push([Number(t[1]), Number(t[2]), Number(t[3])]);
    else if (k === "mtllib") await loadMtl(t.slice(1).join(" "));
    else if (k === "usemtl") { await flush(); cur = colOf(t.slice(1).join(" ")); }
    else if (k === "f") {
      const ids = t.slice(1).map(x => { const i = parseInt(x, 10); return i < 0 ? V.length + i : i - 1; }).filter(i => i >= 0 && i < V.length);
      const loc = ids.map(i => { if (!map.has(i)) { const v = V[i]; map.set(i, curPts.length / 3); curPts.push(v[0], -v[2], v[1]); } return map.get(i); });
      for (let j = 1; j + 1 < loc.length; j++) curIdx.push(loc[0], loc[j], loc[j + 1]);
    }
  }
  await flush();
  return B.finish();
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
const PM_SKP_MSG = "SketchUp-filer (.skp) kan inte läsas direkt. Välj Collada (.dae) eller glTF/GLB när du laddar ned från 3D Warehouse, eller exportera från SketchUp (Arkiv → Exportera → 3D-modell → .dae).";
/* GLB, glTF-zip, Collada (.dae / .zip / .kmz) eller OBJ -> mesh-resultat. name = filnamnet (för formatet). */
async function pmModelFromBuffer(buf, name = "") {
  if (/\.skp$/i.test(name)) throw new Error(PM_SKP_MSG);
  const sig = buf.byteLength >= 4 ? new DataView(buf).getUint32(0, true) : 0;
  if (sig === 0x46546C67) { const { json, bin } = glbSplit(buf); return pmGltfToMesh(json, bin, async () => null); }
  if (sig === 0x04034b50) {
    const files = await pmUnzip(buf);
    const keys = [...files.keys()].filter(k => !/(^|\/)__MACOSX\//.test(k));
    const find = re => keys.find(k => re.test(k));
    const gl = find(/\.glb$/i);
    if (gl) return pmModelFromBuffer(await files.get(gl)(), gl);
    const gf = find(/\.gltf$/i);
    if (gf) return pmGltfToMesh(JSON.parse(new TextDecoder().decode(await files.get(gf)())), null, pmZipResolver(files, gf));
    const dae = find(/\.dae$/i);
    if (dae) return pmDaeToMesh(new TextDecoder().decode(await files.get(dae)()), pmZipResolver(files, dae));
    const obj = find(/\.obj$/i);
    if (obj) return pmObjToMesh(new TextDecoder().decode(await files.get(obj)()), pmZipResolver(files, obj));
    if (find(/\.skp$/i)) throw new Error(PM_SKP_MSG);
    throw new Error("Zip-filen innehåller ingen modell (.glb, .gltf, .dae eller .obj).");
  }
  const head = new TextDecoder().decode(buf.slice(0, 2000));
  if (/<COLLADA/i.test(head) || /\.dae$/i.test(name)) return pmDaeToMesh(new TextDecoder().decode(buf), null);
  if (/\.obj$/i.test(name) || /^\s*(#.*\n\s*)*(v|o|g|mtllib)\s/m.test(head)) return pmObjToMesh(new TextDecoder().decode(buf), null);
  if (/^\s*\{/.test(head) && /"asset"/.test(head)) return pmGltfToMesh(JSON.parse(new TextDecoder().decode(buf)), null, async () => null);
  throw new Error("Okänt filformat – använd .ifc, .glb, .gltf, .dae, .obj eller en .zip/.kmz med någon av dem.");
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
async function placeModelIfcFiles(stamp = placeStamp()) {
  const out = [];
  for (const p of placements) {
    const a = String(p.type).startsWith("model:") ? placeAssetOf(p.type.slice(6)) : null;
    if (!a || a.kind !== "ifc" || !placeIsNew(p)) continue;
    let text = placeIfcCache.get(a.id);
    if (!text) { text = await pmReadAssetFile(a); placeIfcCache.set(a.id, text); }
    const name = `${p.name || a.name} ${stamp}.ifc`.replace(/[\\/:*?"<>|]/g, "-");
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
  const name = file.name.replace(/\.(ifc|glb|gltf|zip|kmz|dae|obj)$/i, "");
  if (/\.skp$/i.test(file.name)) throw new Error(PM_SKP_MSG);
  if (/\.ifc$/i.test(file.name)) {
    if (file.size > PM_MAX_IFC) throw new Error(`IFC-filen är för stor (${Math.round(file.size / 1048576)} MB, max ${PM_MAX_IFC / 1048576} MB).`);
    const text = await file.text();
    const info = pmIfcInfo(text);
    return { name, kind: "ifc", source: "Fil", text, ...info };
  }
  if (file.size > PM_MAX_DOWNLOAD) throw new Error(`Filen är för stor (${Math.round(file.size / 1048576)} MB).`);
  const r = await pmModelFromBuffer(await file.arrayBuffer(), file.name);
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
    body = `<div class="pm-drop" id="pmDrop">
        <b>Släpp en fil här</b> eller <label class="pm-pick">välj fil<input type="file" id="pmFile" accept=".ifc,.glb,.gltf,.dae,.obj,.zip,.kmz,.skp" /></label>
        <div class="hint">IFC, GLB/glTF, Collada (.dae), OBJ – eller en .zip/.kmz med modell och texturer.</div>
      </div>
      <ul class="pm-sites hint">
        <li><a href="https://3dwarehouse.sketchup.com" target="_blank" rel="noopener">3D Warehouse</a> – välj <b>Collada</b> eller <b>glTF</b> vid nedladdning (inte .skp).</li>
        <li><a href="https://www.bimobject.com/sv" target="_blank" rel="noopener">BIMobject</a> – välj <b>IFC</b>.</li>
        <li>CGTrader, TurboSquid m.fl. – välj <b>GLB</b>, <b>OBJ</b> eller <b>DAE</b>.</li>
      </ul>`;
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
  const readFile = f => { if (f) pmRun("Läser filen…", async () => { pmState.pending = await pmFromFile(f); }); };
  const fi = box.querySelector("#pmFile");
  if (fi) fi.onchange = () => readFile(fi.files[0]);
  const dz = box.querySelector("#pmDrop");
  if (dz) {
    dz.ondragover = e => { e.preventDefault(); dz.classList.add("over"); };
    dz.ondragleave = () => dz.classList.remove("over");
    dz.ondrop = e => { e.preventDefault(); dz.classList.remove("over"); readFile(e.dataTransfer && e.dataTransfer.files[0]); };
  }
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
