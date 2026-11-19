/* 3D-vyn – RITNINGAR (Victor 2026-11-19: "ett enkelt sätt att lägga ritningarna ovanpå eller i mina 3d-modeller, justera opacitet och croppa dom").
   Prefix l3rd. Ett eget block "RITNINGAR" i Lager-fliken (under 2D-MODELLER). Inte kopplat till 2D-lägesplanen: egen delad fil i projektet
   (projects/<id>/drawings3d.json) och egna källfiler (projects/<id>/drawings3d/…), så alla ser samma ritningar med samma inpassning på vilken dator som helst.

   – PDF som VEKTOR: linjer, ytor och text läses ur PDF-sidan (samma tolk som PDF-objekten i lägesplanen, lagesplan-pdfobj.js) och ritas som riktiga linjer i 3D (skarpa på
     alla avstånd). Text läggs som en hög upplöst genomskinlig bild. Bilder i PDF:en (skannat) tas inte med – använd då en bildfil. PNG/JPG läggs som en bild på planet.
   – Placering: vågrät (plan) eller lodrät (snitt/fasad). "Passa in" = två punkter: klicka en punkt på ritningen och motsvarande punkt i modellen, och en till
     – skala, vridning och läge räknas ut. Därefter finjustering (X/Y/Z, vridning, skala, flytta/vrid i steg, spegla) och lås.
   – Genomskinlighet, "syns genom modellen" eller dold av modellen, enfärgad eller ritningens egna färger, fyllda ytor och text av/på.
   – Beskärning: rektangel (procent eller dra kanterna i vyn) och polygon (klicka punkter på ritningen). Samma sida kan läggas flera gånger med olika beskärning.
   – Allt sparas automatiskt i projektet. Valfritt med i HTML-exporten (bakat med genomskinlighet och beskärning). */

const l3rd = { list: [], items: new Map(), loaded: false, loading: null, pid: null, group: null, cache: new Map(), sel: null, fit: null, crop: null, saveT: 0, dirty: new Set(), gone: new Set(), busy: new Set() };
const L3RD_PT = 0.0003528;   // meter på pappret per PDF-punkt
const L3RD_DEF = { plane: "plan", az: 0, rot: 0, s: 1, mirror: false, opacity: 0.7, ontop: true, color: null, fills: true, text: true, vis: true, lock: false, crop: { l: 0, r: 0, t: 0, b: 0 }, poly: null };
const l3rdPath = () => `projects/${encodeURIComponent(projectId)}/drawings3d.json`;
const l3rdFile = (id, ext) => `projects/${encodeURIComponent(projectId)}/drawings3d/${id}.${ext}`;
const l3rdN = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const l3rdEsc = v => (typeof escHtml === "function" ? escHtml(String(v)) : String(v));
const l3rdGet = id => l3rd.list.find(x => x.id === id) || null;

/* ---- Registret i projektet ---- */
function l3rdClean(d) { const o = {}; Object.keys(d).forEach(k => { if (k[0] !== "_" && k !== "local") o[k] = d[k]; }); return o; }
function l3rdLoad() {
  const pid = typeof projectId !== "undefined" ? projectId : null; if (l3rd.pid !== pid) { l3rd.pid = pid; l3rd.loaded = false; l3rd.loading = null; l3rdClearAll(); l3rd.list = []; }
  if (l3rd.loaded || !pid || typeof ghReadJSON !== "function" || typeof token === "undefined" || !token) return;
  if (!l3rd.loading) l3rd.loading = (async () => {
    try { const a = await ghReadJSON(token, l3rdPath()); l3rd.list = (Array.isArray(a) ? a : []).filter(x => x && x.id).map(x => ({ ...JSON.parse(JSON.stringify(L3RD_DEF)), ...x })); l3rd.loaded = true; }
    catch (e) { console.warn("Kunde inte läsa ritningarna", e); l3rd.loaded = true; }
    l3rd.loading = null; l3rd.list.filter(d => d.vis).forEach(d => l3rdShow(d)); l3rdRender();
  })();
}
function l3rdTouch(d) { if (d) { d.rev = Math.random().toString(36).slice(2, 7); l3rd.dirty.add(d.id); } clearTimeout(l3rd.saveT); l3rd.saveT = setTimeout(l3rdFlush, 900); }
async function l3rdFlush() {
  const ids = [...l3rd.dirty], gone = [...l3rd.gone]; l3rd.dirty.clear(); l3rd.gone.clear(); if (!ids.length && !gone.length) return;
  if (typeof projectId === "undefined" || !projectId || typeof ghWriteJSON !== "function" || typeof token === "undefined" || !token) return;
  const upd = ids.map(id => l3rdGet(id)).filter(Boolean).map(l3rdClean);
  try { await ghWriteJSON(token, l3rdPath(), arr => { const m = new Map((Array.isArray(arr) ? arr : []).map(x => [x.id, x])); upd.forEach(x => m.set(x.id, x)); gone.forEach(id => m.delete(id)); return [...m.values()]; }, "Ritningar i 3D"); }
  catch (e) { console.warn("Kunde inte spara ritningarna", e); ids.forEach(id => l3rd.dirty.add(id)); gone.forEach(id => l3rd.gone.add(id)); if (typeof l3Status === "function") l3Status("Kunde inte spara ritningarna i projektet: " + e.message, true); }
}

/* ---- Läge: bas (U, V) i meter per ritningsenhet ---- */
function l3rdBasis(d) {
  const a = (Number(d.az) || 0) * Math.PI / 180, r = (Number(d.rot) || 0) * Math.PI / 180, s = Number(d.s) || 1;
  const e1 = d.plane === "vert" ? [Math.cos(a), Math.sin(a), 0] : [1, 0, 0], e2 = d.plane === "vert" ? [0, 0, 1] : [0, 1, 0], c = Math.cos(r), n = Math.sin(r), m = d.mirror ? -1 : 1;
  const U = [0, 1, 2].map(i => m * s * (c * e1[i] + n * e2[i])), V = [0, 1, 2].map(i => s * (-n * e1[i] + c * e2[i])); return { U, V, e1, e2 };
}
function l3rdMatrix(d) {
  const { U, V } = l3rdBasis(d), u = new THREE.Vector3(...U), v = new THREE.Vector3(...V), n = new THREE.Vector3().crossVectors(u, v).normalize(), m = new THREE.Matrix4().makeBasis(u, v, n);
  m.setPosition(d.o[0] - l3.O[0], d.o[1] - l3.O[1], d.o[2] - l3.O[2]); return m;
}
const l3rdW = (d, x, y) => { const { U, V } = l3rdBasis(d); return [d.o[0] + x * U[0] + y * V[0], d.o[1] + x * U[1] + y * V[1], d.o[2] + x * U[2] + y * V[2]]; };   // ritningsenheter → SWEREF
function l3rdLocal(d, P) {   // SWEREF-punkt → ritningsenheter (minsta kvadrat på planet)
  const { U, V } = l3rdBasis(d), q = [P[0] - d.o[0], P[1] - d.o[1], P[2] - d.o[2]], uu = U[0] ** 2 + U[1] ** 2 + U[2] ** 2, vv = V[0] ** 2 + V[1] ** 2 + V[2] ** 2;
  return [(q[0] * U[0] + q[1] * U[1] + q[2] * U[2]) / (uu || 1), (q[0] * V[0] + q[1] * V[1] + q[2] * V[2]) / (vv || 1)];
}

/* ---- Källan: PDF (vektor) eller bild ---- */
async function l3rdBytes(d) {
  const url = d.local || await ghReadBinaryUrl(token, d.path); const r = await fetch(url); if (!r.ok) throw new Error("Kunde inte hämta " + d.path); const buf = await r.arrayBuffer(); if (!d.local) URL.revokeObjectURL(url); return buf;
}
const l3rdRgb = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ""); const v = m ? parseInt(m[1], 16) : 0; return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
function l3rdFlat(d, x0, y0) {   // sökväg → [{ pts, closed }]
  const out = []; let cur = null, start = null; const P = (x, y) => [x - x0, y - y0];
  d.forEach(o => {
    if (o[0] === "M") { cur = { pts: [P(o[1], o[2])], closed: false }; out.push(cur); start = cur.pts[0]; }
    else if (!cur) return;
    else if (o[0] === "L") cur.pts.push(P(o[1], o[2]));
    else if (o[0] === "C") { const a = cur.pts[cur.pts.length - 1], b = P(o[1], o[2]), c = P(o[3], o[4]), e = P(o[5], o[6]); for (let i = 1; i <= 6; i++) { const t = i / 6, w = 1 - t; cur.pts.push([w ** 3 * a[0] + 3 * w * w * t * b[0] + 3 * w * t * t * c[0] + t ** 3 * e[0], w ** 3 * a[1] + 3 * w * w * t * b[1] + 3 * w * t * t * c[1] + t ** 3 * e[1]]); } }
    else if (o[0] === "Z") { cur.closed = true; if (start) { cur = { pts: [start], closed: false }; out.push(cur); } }
  });
  return out.filter(p => p.pts.length > 1 || p.closed);
}
async function l3rdParsePdf(buf, pageNo) {
  if (typeof pdfjsLib === "undefined" || typeof pdfObjParse !== "function") throw new Error("PDF-läsaren är inte laddad");
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise, page = await doc.getPage(Math.max(1, Math.min(doc.numPages, pageNo || 1))), view = page.view || [0, 0, 1000, 700];
  const shapes = await pdfObjParse(page, doc), x0 = view[0], y0 = view[1], W = view[2] - view[0], H = view[3] - view[1];
  const seg = [], sc = [], tri = [], tc = [], texts = []; let images = 0, nFill = 0;
  shapes.forEach(sh => {
    if (sh.kind === "image") { images++; return; }
    if (sh.kind === "text") { texts.push({ s: sh.s, x: sh.x - x0, y: sh.y - y0, fs: sh.fs, rot: sh.rot, color: sh.color, w: sh.w }); return; }
    if (sh.kind !== "path") return; const polys = l3rdFlat(sh.d, x0, y0);
    if (sh.stroke) { const c = l3rdRgb(sh.stroke); polys.forEach(pl => { const p = pl.pts; for (let i = 1; i < p.length; i++) { seg.push(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]); sc.push(c[0], c[1], c[2]); } if (pl.closed && p.length > 2) { seg.push(p[p.length - 1][0], p[p.length - 1][1], p[0][0], p[0][1]); sc.push(c[0], c[1], c[2]); } }); }
    if (sh.fill && nFill < 30000) {
      const c = l3rdRgb(sh.fill); if (c[0] > 245 && c[1] > 245 && c[2] > 245) return;   // vita ytor (bakgrund/mask) hoppas över
      polys.forEach(pl => { const p = pl.pts.slice(); if (p.length > 1 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]) p.pop(); if (p.length < 3 || p.length > 500) return;
        try { const v2 = p.map(q => new THREE.Vector2(q[0], q[1])), idx = THREE.ShapeUtils.triangulateShape(v2, []); idx.forEach(t => { t.forEach(i => { tri.push(p[i][0], p[i][1]); tc.push(c[0], c[1], c[2]); }); }); nFill++; } catch (e) { /* */ } });
    }
  });
  return { k: "pdf", W, H, seg: new Float32Array(seg), sc: new Uint8Array(sc), tri: new Float32Array(tri), tc: new Uint8Array(tc), texts, images, shapes: shapes.length };
}
async function l3rdSource(d) {
  const key = d.path + "|" + (d.page || 1) + (d.local || ""); if (l3rd.cache.has(key)) return l3rd.cache.get(key);
  const p = (async () => {
    const buf = await l3rdBytes(d);
    if (d.kind === "pdf") return await l3rdParsePdf(buf, d.page);
    const url = URL.createObjectURL(new Blob([buf], { type: d.mime || "image/png" })), im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Bilden kunde inte läsas")); i.src = url; });
    return { k: "img", W: im.naturalWidth, H: im.naturalHeight, im };
  })();
  l3rd.cache.set(key, p); p.catch(() => l3rd.cache.delete(key)); return p;
}
function l3rdTextCanvas(S, color) {
  const sc = Math.min(4, 4096 / Math.max(S.W, S.H)), cv = document.createElement("canvas"); cv.width = Math.max(1, Math.ceil(S.W * sc)); cv.height = Math.max(1, Math.ceil(S.H * sc)); const g = cv.getContext("2d");
  S.texts.forEach(t => { g.save(); g.translate(t.x * sc, (S.H - t.y) * sc); g.rotate(-t.rot); g.font = `${Math.max(1, t.fs * sc)}px Arial, sans-serif`; g.fillStyle = color || t.color || "#000"; g.textBaseline = "alphabetic"; const w = g.measureText(t.s).width; if (t.w > 0 && w > 0) g.scale(t.w * sc / w, 1); g.fillText(t.s, 0, 0); g.restore(); });
  return cv;
}

/* ---- Material med beskärning (rektangel + polygon) i skuggaren ---- */
function l3rdPatch(mat, U) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.rdN = U.rdN; sh.uniforms.rdP = U.rdP; sh.uniforms.rdR = U.rdR;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec2 vRd;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvRd = position.xy;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec2 vRd;\nuniform float rdN;\nuniform vec2 rdP[64];\nuniform vec4 rdR;\nbool rdIn(vec2 p){ bool c=false; for(int i=0;i<64;i++){ if(float(i)>=rdN) break; int j = i==0 ? int(rdN)-1 : i-1; vec2 a=rdP[i], b=rdP[j]; if(((a.y>p.y)!=(b.y>p.y)) && (p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)) c=!c; } return c; }")
      .replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\nif(vRd.x<rdR.x||vRd.x>rdR.z||vRd.y<rdR.y||vRd.y>rdR.w) discard;\nif(rdN>=3.0 && !rdIn(vRd)) discard;");
  };
  mat.customProgramCacheKey = () => "l3rdclip";
  return mat;
}
function l3rdUniforms() { return { rdN: { value: 0 }, rdP: { value: Array.from({ length: 64 }, () => new THREE.Vector2()) }, rdR: { value: new THREE.Vector4(-1e9, -1e9, 1e9, 1e9) } }; }
function l3rdCropRect(d, S) { const c = d.crop || {}, W = S.W, H = S.H; return [W * (Number(c.l) || 0), H * (Number(c.b) || 0), W * (1 - (Number(c.r) || 0)), H * (1 - (Number(c.t) || 0))]; }
function l3rdApplyCrop(d) {
  const E = d._e; if (!E) return; const U = E.U, r = l3rdCropRect(d, E.S); U.rdR.value.set(r[0], r[1], r[2], r[3]);
  const poly = d.poly && d.poly.length >= 3 ? d.poly.slice(0, 64) : null; U.rdN.value = poly ? poly.length : 0; if (poly) poly.forEach((q, i) => U.rdP.value[i].set(q[0], q[1]));
  l3Render();
}
function l3rdStyle(d) {
  const E = d._e; if (!E) return; const col = d.color ? new THREE.Color(d.color) : null;
  E.mats.forEach(m => { m.opacity = Math.max(0.02, Math.min(1, Number(d.opacity))); m.transparent = true; m.depthWrite = false; m.depthTest = !d.ontop; m.polygonOffset = !d.ontop; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
    if (m.userData.lines || m.userData.fills) { const vc = !col; if (m.vertexColors !== vc) { m.vertexColors = vc; m.needsUpdate = true; } m.color.set(col || 0xffffff); } });
  E.group.children.forEach(o => { o.renderOrder = d.ontop ? 900 : 5; if (o.userData.fills) o.visible = d.fills !== false; if (o.userData.txt) o.visible = d.text !== false; });
  if (E.txtMat && E.S.texts) { const key = d.color || ""; if (E.txtKey !== key) { E.txtKey = key; if (E.txtMat.map) E.txtMat.map.dispose(); E.txtMat.map = new THREE.CanvasTexture(l3rdTextCanvas(E.S, d.color)); E.txtMat.map.needsUpdate = true; E.txtMat.needsUpdate = true; } }
  E.group.visible = !!d.vis; if (E.frame) E.frame.visible = l3rd.sel === d.id; l3Render();
}
function l3rdPlace(d) { const E = d._e; if (!E) return; E.group.matrixAutoUpdate = false; E.group.matrix.copy(l3rdMatrix(d)); E.group.matrixWorldNeedsUpdate = true; E.group.updateMatrixWorld(true); l3Render(); }
function l3rdClearOne(d) { const E = d._e; if (!E) return; if (E.group.parent) E.group.parent.remove(E.group); E.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); d._e = null; }
function l3rdClearAll() { l3rd.list.forEach(l3rdClearOne); }
async function l3rdShow(d) {
  if (!l3 || !l3.scene || d._e || l3rd.busy.has(d.id)) return; l3rd.busy.add(d.id);
  try {
    const S = await l3rdSource(d); if (d._e) return; if (!l3rd.group) { l3rd.group = new THREE.Group(); l3rd.group.name = "ritningar"; l3.scene.add(l3rd.group); }
    const g = new THREE.Group(), U = l3rdUniforms(), mats = []; g.userData.rd = d.id; g.userData.noHit = true;
    const mk = (m, userData) => { Object.assign(m.userData, userData || {}); mats.push(l3rdPatch(m, U)); return m; };
    const base = o => { o.raycast = () => {}; o.userData.noHit = true; o.userData.noVm = true; return o; };
    let txtMat = null;
    if (S.k === "pdf") {
      if (S.tri.length) { const geo = new THREE.BufferGeometry(), n = S.tri.length / 2, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { p[i * 3] = S.tri[i * 2]; p[i * 3 + 1] = S.tri[i * 2 + 1]; } geo.setAttribute("position", new THREE.BufferAttribute(p, 3)); geo.setAttribute("color", new THREE.BufferAttribute(S.tc, 3, true)); const o = base(new THREE.Mesh(geo, mk(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), { fills: true }))); o.userData.fills = true; g.add(o); }
      if (S.seg.length) { const geo = new THREE.BufferGeometry(), n = S.seg.length / 2, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { p[i * 3] = S.seg[i * 2]; p[i * 3 + 1] = S.seg[i * 2 + 1]; } geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
        const sc = new Uint8Array(n * 3); for (let i = 0; i < n / 2; i++) for (let k = 0; k < 2; k++) { sc[(i * 2 + k) * 3] = S.sc[i * 3]; sc[(i * 2 + k) * 3 + 1] = S.sc[i * 3 + 1]; sc[(i * 2 + k) * 3 + 2] = S.sc[i * 3 + 2]; }
        geo.setAttribute("color", new THREE.BufferAttribute(sc, 3, true)); const o = base(new THREE.LineSegments(geo, mk(new THREE.LineBasicMaterial({ vertexColors: true }), { lines: true }))); o.userData.lines = true; g.add(o); }
      if (S.texts.length) { const cv = l3rdTextCanvas(S, d.color), tex = new THREE.CanvasTexture(cv); tex.anisotropy = 8; txtMat = mk(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }), { txt: true }); const geo = new THREE.PlaneGeometry(S.W, S.H); geo.translate(S.W / 2, S.H / 2, 0); const o = base(new THREE.Mesh(geo, txtMat)); o.userData.txt = true; g.add(o); }
    } else {
      const tex = new THREE.Texture(S.im); tex.needsUpdate = true; tex.anisotropy = 8; if ("encoding" in tex) tex.encoding = THREE.sRGBEncoding; const geo = new THREE.PlaneGeometry(S.W, S.H); geo.translate(S.W / 2, S.H / 2, 0); g.add(base(new THREE.Mesh(geo, mk(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }), { img: true }))));
    }
    const fg = new THREE.BufferGeometry(); fg.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, S.W, 0, 0, S.W, S.H, 0, 0, S.H, 0], 3)); const frame = base(new THREE.LineLoop(fg, new THREE.LineBasicMaterial({ color: 0x2563eb, depthTest: false, transparent: true }))); frame.renderOrder = 999; frame.userData.frame = true; g.add(frame);
    d._e = { group: g, mats, U, S, frame, txtMat, txtKey: d.color || "" }; l3rd.group.add(g);
    l3rdPlace(d); l3rdApplyCrop(d); l3rdStyle(d);
  } catch (e) { console.warn("Ritningen kunde inte visas", d.name, e); if (typeof l3Status === "function") l3Status(`Ritningen "${d.name}" kunde inte visas: ${e.message}`, true); }
  finally { l3rd.busy.delete(d.id); }
}
function l3rdRefresh(d, what) { if (!d) return; if (!d._e) { if (d.vis) l3rdShow(d); return; } if (!what || what.place) l3rdPlace(d); if (!what || what.crop) l3rdApplyCrop(d); if (!what || what.style) l3rdStyle(d); }

/* ---- Import ---- */
const L3RD_SCALES = [50, 100, 200, 250, 500, 1000, 2000, 5000];
function l3rdView() {   // var och hur ritningen läggs först: vid kamerans mål, i bildens riktning
  const t = l3.orbit.target.clone().add(new THREE.Vector3(l3.O[0], l3.O[1], l3.O[2])), cam = l3.camera.position.clone().sub(l3.orbit.target), dist = Math.max(10, cam.length());
  const f = new THREE.Vector3(); l3.camera.getWorldDirection(f); const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 0, 1)); right.z = 0; if (right.length() < 1e-6) right.set(1, 0, 0); right.normalize();
  return { t: [t.x, t.y, t.z], dist, az: Math.atan2(right.y, right.x) * 180 / Math.PI };
}
function l3rdNew(file, ext, kind, page, S, opt) {
  const V = l3rdView(), d = { ...JSON.parse(JSON.stringify(L3RD_DEF)), id: ghNewId(), name: opt.name, kind, path: opt.path, ext, page: page || 1, mime: opt.mime || "", plane: opt.plane, created: new Date().toISOString(), by: (typeof settings !== "undefined" && settings.userName) || "" };
  const long = Math.max(S.W, S.H); d.s = opt.scale ? opt.scale * L3RD_PT : Math.max(0.02, Math.min(500, V.dist * 0.9)) / long; d.az = d.plane === "vert" ? V.az : 0;
  const { U, V: Vv } = l3rdBasis(d); d.o = [V.t[0] - (S.W / 2) * U[0] - (S.H / 2) * Vv[0], V.t[1] - (S.W / 2) * U[1] - (S.H / 2) * Vv[1], V.t[2] - (S.W / 2) * U[2] - (S.H / 2) * Vv[2]];
  if (d.plane === "plan") d.o[2] = V.t[2]; return d;
}
async function l3rdImportFiles(files, opt) {
  if (!files.length) return; const made = [];
  for (const f of files) {
    const ext = ((f.name.match(/\.([a-z0-9]+)$/i) || [0, ""])[1] || "").toLowerCase(), isPdf = ext === "pdf", isImg = /^(png|jpe?g|webp)$/.test(ext); if (!isPdf && !isImg) { l3Status(`${f.name}: bara PDF och bilder (PNG/JPG) kan läggas som ritning.`, true); continue; }
    const id0 = ghNewId(), path = l3rdFile(id0, ext); let local = null, saved = false; l3Status(`Laddar upp ${f.name}…`);
    try { if (typeof ghUploadBinary === "function" && typeof token !== "undefined" && token) { await ghUploadBinary(token, path, f, `Ritning i 3D: ${f.name}`); saved = true; } } catch (e) { console.warn("Uppladdning misslyckades", e); }
    if (!saved) { local = URL.createObjectURL(f); l3Status(`${f.name}: kunde inte sparas i projektet – ritningen finns bara i den här sessionen.`, true); }
    const buf = await f.arrayBuffer(); let pages = [1];
    if (isPdf) { try { const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise; pages = opt.allPages ? Array.from({ length: doc.numPages }, (_, i) => i + 1) : [Math.max(1, Math.min(doc.numPages, Number(opt.page) || 1))]; } catch (e) { l3Status(`${f.name}: PDF:en kunde inte läsas (${e.message})`, true); continue; } }
    for (const pg of pages) {
      const tmp = { path, kind: isPdf ? "pdf" : "img", page: pg, local, mime: f.type || (ext === "jpg" ? "image/jpeg" : "image/" + ext) };
      let S; try { S = await l3rdSource(tmp); } catch (e) { l3Status(`${f.name}: ${e.message}`, true); continue; }
      const d = l3rdNew(f, ext, tmp.kind, pg, S, { ...opt, path, name: f.name.replace(/\.[a-z0-9]+$/i, "") + (pages.length > 1 ? ` s.${pg}` : ""), mime: tmp.mime }); if (local) d.local = local;
      if (isPdf && S.images && !S.seg.length && !S.texts.length) l3Status(`${f.name}: sidan består av bilder (skannad) – ladda upp den som PNG/JPG i stället för vektor.`, true);
      l3rd.list.push(d); l3rdTouch(d); made.push(d); await l3rdShow(d);
    }
  }
  l3rdRender(); if (made.length) { l3rdSelect(made[0].id); l3rdZoom(made[0]); l3Status(`${made.length} ritning${made.length > 1 ? "ar" : ""} inlagd${made.length > 1 ? "a" : ""} i RITNINGAR. Passa in dem med "Passa in (2 punkter)" i panelen.`); }
  return made;
}
function l3rdImportPanel() {
  if (typeof l3bfPanel !== "function") return; const o = l3rd.imp = l3rd.imp || { plane: "plan", scale: 0, page: 1, allPages: false };
  const d = l3bfPanel("v3RdImport", "Läs in ritning", `
    <div class="v3-sub">PDF läses som vektor (skarpa linjer), PNG/JPG som bild. Ritningen läggs först i vyn och passas sedan in med två punkter. Den hamnar i blocket RITNINGAR och delas i projektet.</div>
    <input type="file" id="v3RdFile" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*" multiple />
    <label class="v3-row">Läge <select id="v3RdPlane"><option value="plan">Vågrät (plan, på en höjd)</option><option value="vert">Lodrät (snitt / fasad)</option></select></label>
    <label class="v3-row">Skala (PDF) <select id="v3RdScale"><option value="0">Okänd – passa in efteråt</option>${L3RD_SCALES.map(s => `<option value="${s}">1:${s}</option>`).join("")}</select></label>
    <label class="v3-row">Sida <input type="number" id="v3RdPage" min="1" value="${o.page}" style="width:60px"> <label style="display:flex;gap:4px;align-items:center"><input type="checkbox" id="v3RdAll"> alla sidor</label></label>
    <div class="an-actions"><button type="button" id="v3RdGo">Läs in</button></div>`);
  if (!d) return; const $ = id => d.querySelector("#" + id); $("v3RdPlane").value = o.plane; $("v3RdScale").value = String(o.scale);
  $("v3RdGo").onclick = async () => { o.plane = $("v3RdPlane").value; o.scale = Number($("v3RdScale").value) || 0; o.page = Number($("v3RdPage").value) || 1; o.allPages = $("v3RdAll").checked; const files = [...$("v3RdFile").files]; if (!files.length) { l3Status("Välj en eller flera filer först.", true); return; } $("v3RdGo").disabled = true; try { await l3rdImportFiles(files, o); l3bfPanelClose("v3RdImport"); } catch (e) { l3Status("Kunde inte läsa in: " + e.message, true); } $("v3RdGo") && ($("v3RdGo").disabled = false); };
}

/* ---- Lager-fliken: blocket RITNINGAR ---- */
function l3rdSection() {
  const eye = typeof l3lEye === "function" ? l3lEye : on => (on ? "●" : "○"), esc = l3rdEsc, L = l3rd.list.slice().sort((a, b) => String(a.folder || "").localeCompare(String(b.folder || ""), "sv") || String(a.name).localeCompare(String(b.name), "sv", { numeric: true }));
  let last = null, body = "";
  L.forEach(d => { if ((d.folder || "") !== last) { last = d.folder || ""; if (last) body += `<div class="v3-lg v3-lr-sub" style="margin-top:4px">${esc(last)}</div>`; }
    body += `<div class="v3-lr ${l3rd.sel === d.id ? "glow" : ""}"><button type="button" class="v3-eye ${d.vis ? "on" : ""}" data-rd-eye="${esc(d.id)}" title="${d.vis ? "Släck" : "Tänd"}">${eye(d.vis)}</button><span class="v3-lr-n v3-lr-pick2" data-rd-sel="${esc(d.id)}" title="${esc(d.name)} – klicka för att ändra, flytta, passa in och beskära">${esc(d.name)}${d.lock ? " 🔒" : ""}</span><span class="v3-lr-acts"><button type="button" class="v3-lr-zoom" data-rd-zoom="${esc(d.id)}" title="Zooma hit">⌖</button></span></div>`; });
  if (!L.length) body += `<div class="v3-pal-hint">Inga ritningar än. Läs in en PDF eller bild med ＋ – den hamnar här och delas i projektet (inte i 2D-lägesplanen).</div>`;
  body += `<button type="button" class="v3-wide" data-rd-add="1" title="PDF (vektor) eller PNG/JPG – läggs ovanpå eller i modellerna och passas in med två punkter">＋ Läs in ritning…</button>`;
  const shut = (l3Prefs().layClosed || []).includes("ritn");
  return `<section class="v3-lsec ${shut ? "shut" : ""}" data-lsec="ritn"><div class="v3-lg v3-lsec-h"><button type="button" class="v3-lsec-t" data-rd-fold="1" aria-expanded="${!shut}"><i>›</i>RITNINGAR <em class="v3-lsec-n">${L.length}</em></button><span class="v3-ldd"><button type="button" class="v3-ldd-b" data-rd-add="1" title="Läs in ritning (PDF eller bild)">＋</button></span></div>${shut ? "" : `<div class="v3-lsec-b">${body}</div>`}</section>`;
}
function l3rdInject() {
  const host = document.getElementById("v3PalLayers"); if (!host || host.classList.contains("hidden")) return; host.querySelectorAll('[data-lsec="ritn"]').forEach(x => x.remove());
  const html = l3rdSection(), tpl = document.createElement("template"); tpl.innerHTML = html.trim(); const el = tpl.content.firstElementChild, after = host.querySelector('[data-lsec="site2d"]') || host.querySelector("[data-lsec]");
  if (after) after.insertAdjacentElement("afterend", el); else host.appendChild(el);
  el.querySelectorAll("[data-rd-add]").forEach(b => { b.onclick = e => { e.stopPropagation(); l3rdImportPanel(); }; });
  const fold = el.querySelector("[data-rd-fold]"); if (fold) fold.onclick = () => { const c = new Set(l3Prefs().layClosed || []); if (c.has("ritn")) c.delete("ritn"); else c.add("ritn"); l3SetPref("layClosed", [...c]); l3rdRender(); };
  el.querySelectorAll("[data-rd-eye]").forEach(b => { b.onclick = () => { const d = l3rdGet(b.dataset.rdEye); if (!d) return; d.vis = !d.vis; l3rdTouch(d); if (d.vis && !d._e) l3rdShow(d); else l3rdStyle(d); l3rdRender(); }; });
  el.querySelectorAll("[data-rd-sel]").forEach(b => { b.onclick = () => l3rdSelect(b.dataset.rdSel); });
  el.querySelectorAll("[data-rd-zoom]").forEach(b => { b.onclick = () => { const d = l3rdGet(b.dataset.rdZoom); if (d) l3rdZoom(d); }; });
}
function l3rdRender() { try { if (typeof l3LayersRender === "function") l3LayersRender(); } catch (e) { console.warn(e); } }
let l3rdWrapped = false;
function l3rdWrap() { if (l3rdWrapped || typeof l3LayersRender !== "function") return; l3rdWrapped = true; const orig = l3LayersRender; l3LayersRender = function () { const r = orig.apply(this, arguments); try { l3rdInject(); } catch (e) { console.warn("RITNINGAR", e); } return r; }; }   // Lager-skriptet kan laddas efter detta: fäst när det finns
l3rdWrap();

/* ---- Markera, zooma, panelen ---- */
function l3rdZoom(d) { const S = d._e && d._e.S; if (!S) { l3rdShow(d).then(() => l3rdZoom(d)); return; } const c = l3rdW(d, S.W / 2, S.H / 2), O = l3.O, w = Math.hypot(S.W * Math.hypot(...l3rdBasis(d).U), S.H * Math.hypot(...l3rdBasis(d).V)); l3FlyTo(new THREE.Vector3(c[0] - O[0], c[1] - O[1], c[2] - O[2]), Math.max(8, w * 0.9)); }
function l3rdSelect(id) {
  const d = id ? l3rdGet(id) : null; l3rdCropStop(); l3rdFitStop(true); const prev = l3rd.sel; l3rd.sel = d ? d.id : null;
  if (prev && prev !== l3rd.sel) { const p = l3rdGet(prev); if (p && p._e) l3rdStyle(p); }
  if (d) { if (!d._e) l3rdShow(d).then(() => l3rdPanel(d)); else { l3rdStyle(d); l3rdPanel(d); } } else if (document.getElementById("v3RdPanel")) l3bfPanelClose("v3RdPanel");
  l3rdRender();
}
function l3rdSet(d, patch, what) { Object.assign(d, patch); l3rdTouch(d); l3rdRefresh(d, what); }
function l3rdSyncFields(d) {   // fälten i panelen följer läget
  const el = document.getElementById("v3RdPanel"); if (!el) return; const set = (k, v) => { const i = el.querySelector(`[data-rd="${k}"]`); if (i && document.activeElement !== i) i.value = v; };
  set("x", l3rdN(d.o[0], 3)); set("y", l3rdN(d.o[1], 3)); set("z", l3rdN(d.o[2], 3)); set("rot", l3rdN(d.rot, 2)); set("az", l3rdN(d.az, 2)); set("ratio", d.kind === "pdf" ? Math.round(d.s / L3RD_PT) : l3rdN(d.s, 4));
  const c = d.crop || {}; ["l", "r", "t", "b"].forEach(k => set("c" + k, l3rdN((Number(c[k]) || 0) * 100, 1)));
}
function l3rdPanel(d) {
  if (typeof l3bfPanel !== "function") return; const esc = l3rdEsc, pdf = d.kind === "pdf", num = (k, label, step, unit = "") => `<label class="v3-row">${label} <input type="number" data-rd="${k}" step="${step}" style="width:96px">${unit}</label>`;
  const el = l3bfPanel("v3RdPanel", "Ritning", `
    <input type="text" data-rd="name" value="${esc(d.name)}" style="width:100%" title="Namn"><label class="v3-row">Mapp <input type="text" data-rd="folder" value="${esc(d.folder || "")}" placeholder="(ingen)" style="flex:1;min-width:0"></label>
    <div class="v3-sec">Visning</div>
    <label class="v3-row">Genomskinlighet <input type="range" data-rd="opacity" min="0" max="95" step="5" value="${Math.round((1 - d.opacity) * 100)}" style="flex:1"> <b data-rd-ov>${Math.round((1 - d.opacity) * 100)} %</b></label>
    <label class="v3-row"><input type="checkbox" data-rd="ontop" ${d.ontop ? "checked" : ""}> Syns genom modellen (av = dold av modellen)</label>
    ${pdf ? `<label class="v3-row"><input type="checkbox" data-rd="fills" ${d.fills !== false ? "checked" : ""}> Fyllda ytor <input type="checkbox" data-rd="text" ${d.text !== false ? "checked" : ""} style="margin-left:10px"> Text</label>` : ""}
    ${pdf ? `<label class="v3-row">Färg <select data-rd="cmode"><option value="orig">Ritningens egna</option><option value="solid">Enfärgad</option></select> <input type="color" data-rd="color" value="${d.color || "#dc2626"}"></label>` : ""}
    <div class="v3-sec">Placering</div>
    <div class="an-actions"><button type="button" data-rd-act="fit" title="Klicka en punkt på ritningen och motsvarande punkt i modellen, två gånger">🎯 Passa in (2 punkter)</button><button type="button" data-rd-act="zoom">⌖ Zooma</button></div>
    <label class="v3-row">Läge <select data-rd="plane"><option value="plan">Vågrät</option><option value="vert">Lodrät</option></select> <label style="display:flex;gap:4px;align-items:center"><input type="checkbox" data-rd="mirror" ${d.mirror ? "checked" : ""}> spegla</label></label>
    ${num("x", "X", "0.01", " m")}${num("y", "Y", "0.01", " m")}${num("z", "Z", "0.01", " m")}${num("rot", "Vridning", "0.01", " °")}${d.plane === "vert" ? num("az", "Planets riktning", "0.1", " °") : ""}${num("ratio", pdf ? "Skala 1:" : "Meter / pixel", pdf ? "1" : "0.001")}
    <div class="v3-row" style="flex-wrap:wrap;gap:4px">Flytta <button type="button" class="pcs-mini" data-rd-nudge="x:-1">X−1</button><button type="button" class="pcs-mini" data-rd-nudge="x:1">X+1</button><button type="button" class="pcs-mini" data-rd-nudge="y:-1">Y−1</button><button type="button" class="pcs-mini" data-rd-nudge="y:1">Y+1</button><button type="button" class="pcs-mini" data-rd-nudge="z:-0.1">Z−0,1</button><button type="button" class="pcs-mini" data-rd-nudge="z:0.1">Z+0,1</button></div>
    <div class="v3-row" style="flex-wrap:wrap;gap:4px">Vrid <button type="button" class="pcs-mini" data-rd-nudge="rot:-1">−1°</button><button type="button" class="pcs-mini" data-rd-nudge="rot:-0.1">−0,1°</button><button type="button" class="pcs-mini" data-rd-nudge="rot:0.1">+0,1°</button><button type="button" class="pcs-mini" data-rd-nudge="rot:1">+1°</button> Skala <button type="button" class="pcs-mini" data-rd-nudge="s:0.99">−1 %</button><button type="button" class="pcs-mini" data-rd-nudge="s:1.01">+1 %</button></div>
    <label class="v3-row"><input type="checkbox" data-rd="lock" ${d.lock ? "checked" : ""}> Lås placeringen</label>
    <div class="v3-sec">Beskärning</div>
    <div class="v3-row" style="flex-wrap:wrap">Vänster <input type="number" data-rd="cl" min="0" max="95" step="0.5" style="width:60px"> Höger <input type="number" data-rd="cr" min="0" max="95" step="0.5" style="width:60px"> Topp <input type="number" data-rd="ct" min="0" max="95" step="0.5" style="width:60px"> Botten <input type="number" data-rd="cb" min="0" max="95" step="0.5" style="width:60px"> %</div>
    <div class="an-actions"><button type="button" data-rd-act="cropdrag" title="Dra ritningens kanter direkt i 3D-vyn">✂ Dra kanterna</button><button type="button" data-rd-act="poly" title="Klicka punkter på ritningen (Enter eller dubbelklick avslutar)">⬠ Rita beskärning</button><button type="button" data-rd-act="clear">Rensa</button></div>
    <div class="v3-sub" data-rd-info></div>
    <div class="an-actions"><button type="button" data-rd-act="dup" title="Samma ritning en gång till, till exempel med annan beskärning">⧉ Duplicera</button><button type="button" data-rd-act="del" style="color:#dc2626">🗑 Ta bort</button></div>`);
  if (!el) return; const q = k => el.querySelector(`[data-rd="${k}"]`);
  q("plane").value = d.plane; if (q("cmode")) q("cmode").value = d.color ? "solid" : "orig"; l3rdSyncFields(d); l3rdInfo(d);
  const on = (k, fn, ev = "change") => { const i = q(k); if (i) i[ev === "input" ? "oninput" : "onchange"] = () => fn(i); };
  const S = () => d._e && d._e.S, lockedMsg = () => { if (d.lock) { l3Status("Ritningen är låst – släpp låset först.", true); return true; } return false; };
  on("name", i => { d.name = i.value.trim() || d.name; l3rdTouch(d); l3rdRender(); }); on("folder", i => { d.folder = i.value.trim(); l3rdTouch(d); l3rdRender(); });
  on("opacity", i => { l3rdSet(d, { opacity: 1 - Number(i.value) / 100 }, { style: 1 }); el.querySelector("[data-rd-ov]").textContent = i.value + " %"; }, "input");
  on("ontop", i => l3rdSet(d, { ontop: i.checked }, { style: 1 })); on("fills", i => l3rdSet(d, { fills: i.checked }, { style: 1 })); on("text", i => l3rdSet(d, { text: i.checked }, { style: 1 }));
  on("cmode", i => l3rdSet(d, { color: i.value === "solid" ? q("color").value : null }, { style: 1 })); on("color", i => { if (q("cmode").value === "solid") l3rdSet(d, { color: i.value }, { style: 1 }); }, "input");
  on("lock", i => { d.lock = i.checked; l3rdTouch(d); l3rdRender(); }); on("mirror", i => { if (lockedMsg()) { i.checked = d.mirror; return; } l3rdSet(d, { mirror: i.checked }, { place: 1 }); });
  on("plane", i => { if (lockedMsg()) { i.value = d.plane; return; } const V = l3rdView(); l3rdSet(d, { plane: i.value, az: i.value === "vert" ? V.az : 0, rot: 0 }, { place: 1 }); l3rdPanel(d); });
  const numSet = (k, fn) => on(k, i => { if (lockedMsg()) { l3rdSyncFields(d); return; } const v = parseFloat(String(i.value).replace(",", ".")); if (!Number.isFinite(v)) { l3rdSyncFields(d); return; } fn(v); l3rdSyncFields(d); });
  numSet("x", v => l3rdSet(d, { o: [v, d.o[1], d.o[2]] }, { place: 1 })); numSet("y", v => l3rdSet(d, { o: [d.o[0], v, d.o[2]] }, { place: 1 })); numSet("z", v => l3rdSet(d, { o: [d.o[0], d.o[1], v] }, { place: 1 }));
  numSet("rot", v => l3rdSet(d, { rot: v }, { place: 1 })); numSet("az", v => l3rdSet(d, { az: v }, { place: 1 })); numSet("ratio", v => l3rdSet(d, { s: pdf ? Math.max(1, v) * L3RD_PT : Math.max(1e-6, v) }, { place: 1 }));
  ["l", "r", "t", "b"].forEach(k => on("c" + k, i => { const v = Math.max(0, Math.min(95, parseFloat(String(i.value).replace(",", ".")) || 0)) / 100, c = { ...(d.crop || {}) }; c[k] = v; l3rdSet(d, { crop: c }, { crop: 1 }); l3rdSyncFields(d); l3rdInfo(d); }));
  el.querySelectorAll("[data-rd-nudge]").forEach(b => { b.onclick = () => { if (lockedMsg()) return; const [k, v] = b.dataset.rdNudge.split(":"), n = Number(v);
    if (k === "x" || k === "y" || k === "z") { const o = d.o.slice(); o[{ x: 0, y: 1, z: 2 }[k]] += n; l3rdSet(d, { o }, { place: 1 }); } else if (k === "rot") { rotAbout(d, n); } else if (k === "s") { scaleAbout(d, n); } l3rdSyncFields(d); }; });
  el.querySelectorAll("[data-rd-act]").forEach(b => { b.onclick = () => { const a = b.dataset.rdAct;
    if (a === "zoom") l3rdZoom(d); else if (a === "fit") { if (!lockedMsg()) l3rdFit(d); } else if (a === "cropdrag") l3rdCropDrag(d); else if (a === "poly") l3rdPolyStart(d);
    else if (a === "clear") { l3rdSet(d, { crop: { l: 0, r: 0, t: 0, b: 0 }, poly: null }, { crop: 1 }); l3rdSyncFields(d); l3rdInfo(d); l3rdCropStop(); }
    else if (a === "dup") { const c = { ...JSON.parse(JSON.stringify(l3rdClean(d))), id: ghNewId(), name: d.name + " (kopia)", local: d.local }; c.o = c.o.slice(); l3rd.list.push(c); l3rdTouch(c); l3rdShow(c).then(() => l3rdSelect(c.id)); l3rdRender(); }
    else if (a === "del") { (typeof uiConfirm === "function" ? uiConfirm(`Ta bort ritningen "${d.name}" för hela projektet?`) : Promise.resolve(true)).then(ok => { if (!ok) return; l3rdCropStop(); l3rdClearOne(d); l3rd.list = l3rd.list.filter(x => x.id !== d.id); l3rd.gone.add(d.id); l3rd.dirty.delete(d.id); l3rd.sel = null; l3bfPanelClose("v3RdPanel"); l3rdTouch(null); l3rdRender(); }); } }; });
  function rotAbout(dd, deg) { const S0 = S(); if (!S0) return; const c = [S0.W / 2, S0.H / 2], before = l3rdW(dd, c[0], c[1]); dd.rot = (Number(dd.rot) || 0) + deg; const after = l3rdW(dd, c[0], c[1]); dd.o = [dd.o[0] + before[0] - after[0], dd.o[1] + before[1] - after[1], dd.o[2] + before[2] - after[2]]; l3rdTouch(dd); l3rdRefresh(dd, { place: 1 }); }
  function scaleAbout(dd, f) { const S0 = S(); if (!S0) return; const c = [S0.W / 2, S0.H / 2], before = l3rdW(dd, c[0], c[1]); dd.s *= f; const after = l3rdW(dd, c[0], c[1]); dd.o = [dd.o[0] + before[0] - after[0], dd.o[1] + before[1] - after[1], dd.o[2] + before[2] - after[2]]; l3rdTouch(dd); l3rdRefresh(dd, { place: 1 }); }
}
function l3rdInfo(d) { const el = document.querySelector("#v3RdPanel [data-rd-info]"); if (!el) return; const c = d.crop || {}, any = ["l", "r", "t", "b"].some(k => Number(c[k]) > 0); el.textContent = `${d.kind === "pdf" ? "Vektor" : "Bild"}${d._e && d._e.S && d._e.S.images ? " (bilder i PDF:en visas inte)" : ""} · ${d.poly ? "polygonbeskärning (" + d.poly.length + " punkter)" : any ? "rektangelbeskärning" : "ingen beskärning"}`; }

/* ---- Passa in: två punkter på ritningen ↔ två punkter i modellen ---- */
const l3rdTexs = new Map();
function l3rdTex(kind, col) {   // liten handtagsbild (ruta eller ring) som ritas lika stor på skärmen oavsett avstånd
  const key = kind + col; if (l3rdTexs.has(key)) return l3rdTexs.get(key); const c = document.createElement("canvas"); c.width = c.height = 48; const g = c.getContext("2d");
  g.fillStyle = "#ffffff"; g.strokeStyle = col; g.lineWidth = 7; if (kind === "sq") { g.fillRect(6, 6, 36, 36); g.strokeRect(6, 6, 36, 36); } else { g.beginPath(); g.arc(24, 24, 17, 0, 6.2832); g.fill(); g.stroke(); g.fillStyle = col; g.beginPath(); g.arc(24, 24, 6, 0, 6.2832); g.fill(); }
  const t = new THREE.CanvasTexture(c); l3rdTexs.set(key, t); return t;
}
function l3rdPoints(list, kind, col, size) {
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(list.flatMap(P => [P[0] - l3.O[0], P[1] - l3.O[1], P[2] - l3.O[2]]), 3));
  const o = new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: false, map: l3rdTex(kind, col), transparent: true, alphaTest: 0.2, depthTest: false })); o.renderOrder = 1002; o.raycast = () => {}; o.userData.noHit = true; return o;
}
function l3rdMarker(P, col) { const o = l3rdPoints([P], "ring", "#" + col.toString(16).padStart(6, "0"), 20); l3.scene.add(o); return o; }
function l3rdRay(e) { const r = l3.renderer.domElement.getBoundingClientRect(), rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), l3.camera); return rc.ray; }
/* Punkten där strålen träffar ritningens plan, i ritningsenheter (snäpper till närmaste linjepunkt inom 14 px). */
function l3rdPlaneHit(d, e, snap) {
  const m = l3rdMatrix(d), inv = m.clone().invert(), ray = l3rdRay(e).clone().applyMatrix4(inv), o = ray.origin, dir = ray.direction; if (Math.abs(dir.z) < 1e-9) return null; const t = -o.z / dir.z; if (t < 0) return null; let p = [o.x + dir.x * t, o.y + dir.y * t];
  if (snap && d._e && d._e.S && d._e.S.seg) { const S = d._e.S, r = l3.renderer.domElement.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, step = Math.max(1, Math.floor(S.seg.length / 2 / 400000)); let best = null, bd = 14; const v = new THREE.Vector3();
    for (let i = 0; i < S.seg.length / 2; i += step) { v.set(S.seg[i * 2], S.seg[i * 2 + 1], 0).applyMatrix4(m).project(l3.camera); const sx = (v.x + 1) / 2 * r.width, sy = (1 - v.y) / 2 * r.height, dd = Math.hypot(sx - px, sy - py); if (dd < bd) { bd = dd; best = [S.seg[i * 2], S.seg[i * 2 + 1]]; } }
    if (best) p = best; }
  return p;
}
function l3rdFit(d) {
  l3rdCropStop(); l3rdFitStop(true); const F = l3rd.fit = { d, a: [], m: [], marks: [], step: 0 }, host = document.getElementById("v3Canvas"), cv = l3.renderer.domElement;
  const prompts = ["Passa in 1/4: klicka en punkt på RITNINGEN (en linjkorsning)", "Passa in 2/4: klicka motsvarande punkt i MODELLEN", "Passa in 3/4: klicka en andra punkt på RITNINGEN, långt från den första", "Passa in 4/4: klicka motsvarande andra punkt i MODELLEN"];
  l3Status(prompts[0] + " (Esc avbryter)"); cv.style.cursor = "crosshair"; if (l3.orbit) l3.orbit.enabled = true;
  F.down = e => { if (e.target !== cv || e.button !== 0) return; F.dn = { x: e.clientX, y: e.clientY }; e.stopImmediatePropagation(); e.preventDefault(); };
  F.up = e => {
    if (!F.dn || e.target !== cv) { F.dn = null; return; } const mv = Math.hypot(e.clientX - F.dn.x, e.clientY - F.dn.y); F.dn = null; if (mv > 5) return; e.stopImmediatePropagation(); e.preventDefault();
    if (F.step % 2 === 0) { const p = l3rdPlaneHit(d, e, true); if (!p) { l3Status("Klicka på ritningen.", true); return; } F.a.push(p); F.marks.push(l3rdMarker(l3rdW(d, p[0], p[1]), 0xf59e0b)); }
    else { const s = typeof l3Snap === "function" ? l3Snap(e) : null; if (!s) { l3Status("Klicka på modellen (en yta, kant eller punkt).", true); return; } const P = [s.point.x + l3.O[0], s.point.y + l3.O[1], s.point.z + l3.O[2]]; F.m.push(P); F.marks.push(l3rdMarker(P, 0x2563eb)); }
    F.step++; l3Render(); if (F.step < 4) { l3Status(prompts[F.step] + " (Esc avbryter)"); return; }
    try { l3rdSolve(d, F.a, F.m); } catch (x) { l3Status("Kunde inte passa in: " + x.message, true); } l3rdFitStop(true);
  };
  F.key = e => { if (e.key === "Escape") { e.stopPropagation(); l3rdFitStop(); l3Status("Inpassningen avbröts."); } };
  host.addEventListener("pointerdown", F.down, true); host.addEventListener("pointerup", F.up, true); window.addEventListener("keydown", F.key, true); F.host = host;
}
function l3rdFitStop(quiet) { const F = l3rd.fit; if (!F) return; l3rd.fit = null; F.host.removeEventListener("pointerdown", F.down, true); F.host.removeEventListener("pointerup", F.up, true); window.removeEventListener("keydown", F.key, true); F.marks.forEach(m => { l3.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }); l3.renderer.domElement.style.cursor = ""; l3Render(); }
/* Likformighetstransform (skala, vridning, läge) ur två punktpar. */
function l3rdSolve(d, A, M) {
  const [a1, a2] = A, [m1, m2] = M; let e1, e2, az = d.az || 0;
  if (d.plane === "vert") { const h = Math.hypot(m2[0] - m1[0], m2[1] - m1[1]); if (h > 1e-6) az = Math.atan2(m2[1] - m1[1], m2[0] - m1[0]) * 180 / Math.PI; const a = az * Math.PI / 180; e1 = [Math.cos(a), Math.sin(a), 0]; e2 = [0, 0, 1]; } else { e1 = [1, 0, 0]; e2 = [0, 1, 0]; }
  const dm = [(m2[0] - m1[0]) * e1[0] + (m2[1] - m1[1]) * e1[1] + (m2[2] - m1[2]) * e1[2], (m2[0] - m1[0]) * e2[0] + (m2[1] - m1[1]) * e2[1] + (m2[2] - m1[2]) * e2[2]], mir = d.mirror ? -1 : 1, da = [mir * (a2[0] - a1[0]), a2[1] - a1[1]];
  const La = Math.hypot(da[0], da[1]), Lm = Math.hypot(dm[0], dm[1]); if (La < 1e-9 || Lm < 1e-6) throw new Error("punkterna ligger för nära varandra");
  const rot = (Math.atan2(dm[1], dm[0]) - Math.atan2(da[1], da[0])) * 180 / Math.PI, s = Lm / La; const nd = { ...d, plane: d.plane, az, rot, s }, { U, V } = l3rdBasis(nd);
  const o = [0, 1, 2].map(i => m1[i] - (a1[0] * U[i] + a1[1] * V[i]));
  if (d.plane === "plan") o[2] = (m1[2] + m2[2]) / 2;
  l3rdSet(d, { az, rot: ((rot % 360) + 360) % 360, s, o }, { place: 1 }); l3rdSyncFields(d); l3rdZoom(d);
  l3Status(`Ritningen är inpassad: ${d.kind === "pdf" ? "skala 1:" + Math.round(s / L3RD_PT) : l3rdN(s, 4) + " m/pixel"}, vridning ${l3rdN(d.rot, 2)}°. Finjustera med siffrorna eller stegknapparna.`);
}

/* ---- Beskärning: dra kanterna / rita polygon ---- */
function l3rdCropStop() { const C = l3rd.crop; if (!C) return; l3rd.crop = null; C.host.removeEventListener("pointerdown", C.down, true); C.host.removeEventListener("pointermove", C.move, true); C.host.removeEventListener("pointerup", C.up, true); C.host.removeEventListener("dblclick", C.dbl, true); window.removeEventListener("keydown", C.key, true); if (C.vis) { l3.scene.remove(C.vis); C.vis.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); } l3.renderer.domElement.style.cursor = ""; if (l3.orbit) l3.orbit.enabled = true; l3Render(); }
function l3rdCropVis(C) {
  const d = C.d, S = d._e && d._e.S; if (!S) return; if (C.vis) { l3.scene.remove(C.vis); C.vis.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); C.vis = null; }
  const g = new THREE.Group(), pts = C.mode === "poly" ? C.pts.map(p => [p[0], p[1]]) : (() => { const r = l3rdCropRect(d, S); return [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]]; })();
  if (pts.length) { const a = []; pts.forEach(p => { const w = l3rdW(d, p[0], p[1]); a.push(w[0] - l3.O[0], w[1] - l3.O[1], w[2] - l3.O[2]); }); const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(a, 3)); const ln = C.mode === "poly" ? new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false })) : new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false })); ln.renderOrder = 1001; ln.raycast = () => {}; g.add(ln);
    if (C.mode === "rect") { const hs = []; pts.forEach((p, i) => { const q = pts[(i + 1) % 4]; hs.push(l3rdW(d, p[0], p[1]), l3rdW(d, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2)); }); g.add(l3rdPoints(hs, "sq", "#f59e0b", 13)); }
    else if (pts.length) g.add(l3rdPoints(pts.map(p => l3rdW(d, p[0], p[1])), "ring", "#f59e0b", 14)); }
  g.raycast = () => {}; C.vis = g; l3.scene.add(g); l3Render();
}
function l3rdCropDrag(d) {
  l3rdCropStop(); l3rdFitStop(true); const host = document.getElementById("v3Canvas"), cv = l3.renderer.domElement, C = l3rd.crop = { d, mode: "rect", host, drag: null, pts: [] }; l3rdCropVis(C); l3Status("Dra ritningens kanter eller hörn (orange) för att beskära. Esc avslutar.");
  const toScr = (x, y) => { const w = l3rdW(d, x, y), v = new THREE.Vector3(w[0] - l3.O[0], w[1] - l3.O[1], w[2] - l3.O[2]).project(l3.camera), r = cv.getBoundingClientRect(); return [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height]; };
  const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)); return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t); };
  const hit = e => { const S = d._e.S, r = l3rdCropRect(d, S), rc = cv.getBoundingClientRect(), p = [e.clientX - rc.left, e.clientY - rc.top], C4 = [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]].map(q => toScr(q[0], q[1])), sides = { b: [C4[0], C4[1]], r: [C4[1], C4[2]], t: [C4[2], C4[3]], l: [C4[3], C4[0]] }, hs = []; Object.entries(sides).forEach(([k, s]) => { if (segDist(p, s[0], s[1]) < 10) hs.push(k); }); return hs; };
  C.down = e => { if (e.target !== cv || e.button !== 0) return; const hs = hit(e); if (!hs.length) return; C.drag = hs; e.stopImmediatePropagation(); e.preventDefault(); if (l3.orbit) l3.orbit.enabled = false; try { cv.setPointerCapture(e.pointerId); } catch (x) { /* */ } };
  C.move = e => {
    if (!C.drag) { if (e.target === cv && !(e.buttons & 1)) cv.style.cursor = hit(e).length ? "move" : ""; return; } e.stopImmediatePropagation(); const p = l3rdPlaneHit(d, e, false); if (!p) return; const S = d._e.S, c = { ...(d.crop || {}) };
    C.drag.forEach(k => { if (k === "l") c.l = Math.max(0, Math.min(0.95 - (c.r || 0), p[0] / S.W)); if (k === "r") c.r = Math.max(0, Math.min(0.95 - (c.l || 0), 1 - p[0] / S.W)); if (k === "b") c.b = Math.max(0, Math.min(0.95 - (c.t || 0), p[1] / S.H)); if (k === "t") c.t = Math.max(0, Math.min(0.95 - (c.b || 0), 1 - p[1] / S.H)); });
    d.crop = c; l3rdApplyCrop(d); l3rdCropVis(C); l3rdSyncFields(d);
  };
  C.up = e => { if (!C.drag) return; C.drag = null; if (l3.orbit) l3.orbit.enabled = true; try { cv.releasePointerCapture(e.pointerId); } catch (x) { /* */ } l3rdTouch(d); l3rdInfo(d); };
  C.dbl = () => {}; C.key = e => { if (e.key === "Escape") { e.stopPropagation(); l3rdCropStop(); } };
  host.addEventListener("pointerdown", C.down, true); host.addEventListener("pointermove", C.move, true); host.addEventListener("pointerup", C.up, true); window.addEventListener("keydown", C.key, true);
}
function l3rdPolyStart(d) {
  l3rdCropStop(); l3rdFitStop(true); const host = document.getElementById("v3Canvas"), cv = l3.renderer.domElement, C = l3rd.crop = { d, mode: "poly", host, pts: [] }; l3rdCropVis(C);
  l3Status("Klicka punkterna för beskärningen på ritningen. Enter eller dubbelklick avslutar, Backsteg tar bort sista punkten, Esc avbryter."); cv.style.cursor = "crosshair";
  const finish = () => { if (C.pts.length >= 3) { l3rdSet(d, { poly: C.pts.slice(0, 64).map(p => [l3rdN(p[0], 2), l3rdN(p[1], 2)]) }, { crop: 1 }); l3Status(`Beskärningen klar (${Math.min(64, C.pts.length)} punkter).`); l3rdInfo(d); } else l3Status("Minst tre punkter krävs.", true); l3rdCropStop(); };
  C.down = e => { if (e.target !== cv || e.button !== 0) return; C.dn = { x: e.clientX, y: e.clientY }; e.stopImmediatePropagation(); e.preventDefault(); };
  C.move = () => {};
  C.up = e => { if (!C.dn || e.target !== cv) return; const mv = Math.hypot(e.clientX - C.dn.x, e.clientY - C.dn.y); C.dn = null; if (mv > 5) return; e.stopImmediatePropagation(); e.preventDefault(); const p = l3rdPlaneHit(d, e, true); if (!p) return; C.pts.push(p); l3rdCropVis(C); };
  C.dbl = e => { e.stopImmediatePropagation(); e.preventDefault(); if (C.pts.length > 3) C.pts.pop(); finish(); };
  C.key = e => { if (e.key === "Escape") { e.stopPropagation(); l3rdCropStop(); l3Status("Beskärningen avbröts."); } else if (e.key === "Enter") { e.stopPropagation(); finish(); } else if (e.key === "Backspace") { e.stopPropagation(); e.preventDefault(); C.pts.pop(); l3rdCropVis(C); } };
  host.addEventListener("pointerdown", C.down, true); host.addEventListener("pointerup", C.up, true); host.addEventListener("dblclick", C.dbl, true); window.addEventListener("keydown", C.key, true);
}


/* ---- HTML-exporten: ritningen bakad (beskärning och färger ingår) som lager i världskoordinater (relativt scenens origo) ---- */
function l3rdInPoly(poly, x, y) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
/* Segment mot rektangel (Liang–Barsky) och polygon (delas där den korsar polygonens kanter): returnerar delsegment som ligger innanför. */
function l3rdClipSeg(x1, y1, x2, y2, rect, poly) {
  let t0 = 0, t1 = 1; const dx = x2 - x1, dy = y2 - y1;
  for (const [p, q] of [[-dx, x1 - rect[0]], [dx, rect[2] - x1], [-dy, y1 - rect[1]], [dy, rect[3] - y1]]) { if (p === 0) { if (q < 0) return []; } else { const r = q / p; if (p < 0) { if (r > t1) return []; if (r > t0) t0 = r; } else { if (r < t0) return []; if (r < t1) t1 = r; } } }
  const ax = x1 + dx * t0, ay = y1 + dy * t0, bx = x1 + dx * t1, by = y1 + dy * t1; if (!poly) return [[ax, ay, bx, by]];
  const ts = [0, 1], ex = bx - ax, ey = by - ay;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const c = poly[j], d = poly[i], fx = d[0] - c[0], fy = d[1] - c[1], den = ex * fy - ey * fx; if (Math.abs(den) < 1e-12) continue; const t = ((c[0] - ax) * fy - (c[1] - ay) * fx) / den, u = ((c[0] - ax) * ey - (c[1] - ay) * ex) / den; if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t); }
  ts.sort((a, b) => a - b); const out = []; for (let i = 1; i < ts.length; i++) { const m = (ts[i - 1] + ts[i]) / 2; if (l3rdInPoly(poly, ax + ex * m, ay + ey * m)) out.push([ax + ex * ts[i - 1], ay + ey * ts[i - 1], ax + ex * ts[i], ay + ey * ts[i]]); }
  return out;
}
async function l3rdBake(d) {
  const S = await l3rdSource(d), M = l3rdMatrix(d).elements, rect = l3rdCropRect(d, S), poly = d.poly && d.poly.length >= 3 ? d.poly : null, W = (x, y) => [M[0] * x + M[4] * y + M[12], M[1] * x + M[5] * y + M[13], M[2] * x + M[6] * y + M[14]];
  const op = Math.max(0.02, Math.min(1, Number(d.opacity))), over = d.color ? l3rdRgb(d.color) : null, out = [], inside = (x, y) => x >= rect[0] && x <= rect[2] && y >= rect[1] && y <= rect[3] && (!poly || l3rdInPoly(poly, x, y));
  if (S.k === "pdf") {
    const P = [], C = []; for (let i = 0; i < S.seg.length / 4; i++) l3rdClipSeg(S.seg[i * 4], S.seg[i * 4 + 1], S.seg[i * 4 + 2], S.seg[i * 4 + 3], rect, poly).forEach(q => { const a = W(q[0], q[1]), b = W(q[2], q[3]); P.push(a[0], a[1], a[2], b[0], b[1], b[2]); const c = over || [S.sc[i * 3], S.sc[i * 3 + 1], S.sc[i * 3 + 2]]; C.push(c[0], c[1], c[2], c[0], c[1], c[2]); });
    if (P.length) out.push({ k: "dlines", name: d.name, pos: new Float32Array(P), vc: new Uint8Array(C), op, ontop: !!d.ontop });
    if (d.fills !== false && S.tri.length) { const T = [], TC = []; for (let i = 0; i + 5 < S.tri.length; i += 6) { const cx = (S.tri[i] + S.tri[i + 2] + S.tri[i + 4]) / 3, cy = (S.tri[i + 1] + S.tri[i + 3] + S.tri[i + 5]) / 3; if (!inside(cx, cy)) continue; const k = i / 2; for (let v = 0; v < 3; v++) { const w = W(S.tri[i + v * 2], S.tri[i + v * 2 + 1]); T.push(w[0], w[1], w[2]); const c = over || [S.tc[(k + v) * 3], S.tc[(k + v) * 3 + 1], S.tc[(k + v) * 3 + 2]]; TC.push(c[0], c[1], c[2]); } }
      if (T.length) out.push({ k: "dtris", name: d.name + " (ytor)", pos: new Float32Array(T), vc: new Uint8Array(TC), op, ontop: !!d.ontop }); }
  }
  let src = null, sc = 1; if (S.k === "pdf") { if (d.text !== false && S.texts.length) { src = l3rdTextCanvas(S, d.color); sc = src.width / S.W; } } else { const k = Math.min(1, 4096 / Math.max(S.W, S.H)); sc = k; src = document.createElement("canvas"); src.width = Math.round(S.W * k); src.height = Math.round(S.H * k); src.getContext("2d").drawImage(S.im, 0, 0, src.width, src.height); }
  if (src) {
    const cv = document.createElement("canvas"); cv.width = src.width; cv.height = src.height; const g = cv.getContext("2d"), X = x => x * sc, Y = y => (S.H - y) * sc;
    g.beginPath(); g.rect(X(rect[0]), Y(rect[3]), X(rect[2]) - X(rect[0]), Y(rect[1]) - Y(rect[3])); g.clip(); if (poly) { g.beginPath(); poly.forEach((q, i) => { if (i) g.lineTo(X(q[0]), Y(q[1])); else g.moveTo(X(q[0]), Y(q[1])); }); g.closePath(); g.clip(); }
    g.drawImage(src, 0, 0); const q = [W(0, 0), W(S.W, 0), W(S.W, S.H), W(0, S.H)];
    out.push({ k: "dplane", name: d.name + (S.k === "pdf" ? " (text)" : ""), pos: new Float32Array(q.flat()), img: cv.toDataURL("image/png"), op, ontop: !!d.ontop });
  }
  return out;
}

/* ---- Start: läs projektets ritningar när 3D är öppet ---- */
setInterval(() => { try { l3rdWrap(); if (typeof l3 !== "undefined" && l3 && l3.scene && l3.renderer && typeof projectId !== "undefined" && projectId) l3rdLoad(); } catch (e) { /* */ } }, 1500);
