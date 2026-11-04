/* IFC -> trianglar i webbläsaren med web-ifc (vendor/web-ifc, MPL-2.0), för Placera i 3D och
   3D-vyn i lägesplanen (Victors önskemål 2026-10-08: importerade IFC-modeller ska synas med riktig
   geometri och gå att fästa mot hörn och kanter). Laddas först när en IFC ska läsas.
   Resultatet är i samma lokala system som pmIfcInfo/pmIfcPlaced använder: filens koordinater i
   meter, Z uppåt, plus a.offset – alltså samma origo som när filen flyttas till punkten. */

let ifcmApi = null, ifcmLoading = null;
function ifcmLoad() {
  if (ifcmApi) return Promise.resolve(ifcmApi);
  if (ifcmLoading) return ifcmLoading;
  const base = new URL("vendor/web-ifc/", location.href).href;
  ifcmLoading = (async () => {
    if (!window.WebIFC) await new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = base + "web-ifc-api-iife.js";
      s.onload = res; s.onerror = () => rej(new Error("Kunde inte ladda IFC-läsaren (web-ifc)."));
      document.head.appendChild(s);
    });
    const api = new WebIFC.IfcAPI();
    api.SetWasmPath(base, true);
    await api.Init(undefined, true); // en tråd: fungerar utan särskilda serverhuvuden
    try { api.SetLogLevel(WebIFC.LogLevel.LOG_LEVEL_OFF); } catch (e) { /* äldre version */ }
    ifcmApi = api;
    return api;
  })();
  ifcmLoading.catch(() => { ifcmLoading = null; });
  return ifcmLoading;
}

/* IFC-text -> { tris, bbox, mesh: { v: 1, parts: [{ c, t, p (mm-heltal), i }] } }, eller kastar.
   offset (meter) läggs till varje punkt. maxTris skyddar iPaden mot jättemodeller. */
async function ifcToMesh(text, offset = [0, 0, 0], maxTris = 400000) {
  const api = await ifcmLoad();
  const id = api.OpenModel(new TextEncoder().encode(text), { COORDINATE_TO_ORIGIN: false, CIRCLE_SEGMENTS: 12 });
  const groups = new Map();
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  let tris = 0, tooBig = false;
  try {
    api.StreamAllMeshes(id, mesh => {
      if (tooBig) return;
      for (let gi = 0; gi < mesh.geometries.size(); gi++) {
        const pg = mesh.geometries.get(gi), geom = api.GetGeometry(id, pg.geometryExpressID);
        const v = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
        const ix = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
        if (geom.delete) geom.delete();
        tris += ix.length / 3;
        if (tris > maxTris) { tooBig = true; return; }
        const T = pg.flatTransformation, c = pg.color || { x: 0.75, y: 0.75, z: 0.75, w: 1 };
        const hex = "#" + [c.x, c.y, c.z].map(q => Math.max(0, Math.min(255, Math.round(q * 255))).toString(16).padStart(2, "0")).join("");
        const t = c.w < 1 ? Math.round((1 - c.w) * 100) / 100 : 0, key = hex + ":" + t;
        if (!groups.has(key)) groups.set(key, { c: hex, t, p: [], i: [] });
        const g = groups.get(key), o = g.p.length / 3;
        for (let k = 0; k < v.length; k += 6) {
          const x = v[k], y = v[k + 1], z = v[k + 2];
          // web-ifc: meter, Y uppåt -> tillbaka till IFC:ns Z uppåt.
          const wx = T[0] * x + T[4] * y + T[8] * z + T[12], wy = T[1] * x + T[5] * y + T[9] * z + T[13], wz = T[2] * x + T[6] * y + T[10] * z + T[14];
          const P = [wx + offset[0], -wz + offset[1], wy + offset[2]];
          P.forEach((q, j) => { if (q < mn[j]) mn[j] = q; if (q > mx[j]) mx[j] = q; g.p.push(Math.round(q * 1000)); });
        }
        for (let k = 0; k < ix.length; k++) g.i.push(ix[k] + o);
      }
    });
  } finally { api.CloseModel(id); }
  if (tooBig) throw new Error(`IFC-filen har mer än ${maxTris.toLocaleString("sv-SE")} trianglar – för tung för 3D-vyn. Den visas som en låda.`);
  if (!tris) throw new Error("IFC-filen innehåller ingen geometri som kan visas.");
  const r3 = q => Math.round(q * 1000) / 1000;
  return { tris, bbox: { min: mn.map(r3), max: mx.map(r3) }, mesh: { v: 1, parts: [...groups.values()] } };
}

/* Mesh → IFC, kompakt (Victor 2026-11-04: "FBX-filerna blir så extremt stora … konvertera FBX till IFC direkt").
   Delad av 3D-editorn (Exportera valda som IFC) och den fristående omvandlaren fbx2ifc.html. Krymper på fyra sätt:
     1. Punkter delas (FBX/glTF-trianglar har oftast egna hörn per triangel) – bara unika punkter skrivs.
     2. Lokala koordinater: varje del skrivs relativt sin egen nedre hörn-punkt (placeringen bär översättningen), så talen blir korta (123,456 i stället för 6512345,678).
     3. Likadana delar (samma form, samma färg) delar en enda geometri – Navisworks skickar ofta tusentals identiska pelare, fästen, rör …
     4. Valfritt: delar mindre än en gräns hoppas över, och resultatet packas som .ifczip (text komprimeras ca 10 ggr).
   Indata: list = [{ name, path, pos (Float32/64Array, XYZ i meter, världskoordinater), idx (Uint32Array eller null), color "#rrggbb", opacity 0–1 }]. */
const ifcMeshNum = (v, d) => { let s = (Math.round(v * d.m) / d.m).toFixed(d.n); if (s.indexOf(".") >= 0) s = s.replace(/0+$/, ""); if (s === "-0.") s = "0."; return s.indexOf(".") >= 0 ? s : s + "."; };
async function ifcFromMeshes(list, o = {}) {
  const dec = o.decimals == null ? 3 : o.decimals, d = { n: dec, m: Math.pow(10, dec) }, tick = () => new Promise(r => setTimeout(r, 0)), minSize = o.minSize || 0;
  const doc = ifcDoc(o.projName || "Mesh-modell", o.desc || "", o.appName), elems = [], shared = new Map(), stats = { parts: 0, skipped: 0, tris: 0, uniqueGeoms: 0, reused: 0, points: 0, tooBig: 0 };
  const styles = new Map();
  for (let li = 0; li < list.length; li++) {
    const it = list[li], pos = it.pos, idx = it.idx, nv = pos.length / 3; if (!nv) continue;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < pos.length; i += 3) { const x = pos[i], y = pos[i + 1], z = pos[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    if (!isFinite(x0)) continue; if (minSize && Math.hypot(x1 - x0, y1 - y0, z1 - z0) < minSize) { stats.skipped++; continue; }
    const bx = Math.round(x0 * d.m) / d.m, by = Math.round(y0 * d.m) / d.m, bz = Math.round(z0 * d.m) / d.m, cnt = idx ? idx.length : nv, map = new Map(), pts = [], tri = [];
    const P = i => { const xi = Math.round((pos[i * 3] - bx) * d.m), yi = Math.round((pos[i * 3 + 1] - by) * d.m), zi = Math.round((pos[i * 3 + 2] - bz) * d.m), k = xi + "," + yi + "," + zi; let n = map.get(k); if (n === undefined) { n = pts.length / 3 + 1; map.set(k, n); pts.push(xi, yi, zi); } return n; };
    for (let i = 0; i + 2 < cnt; i += 3) { const a = P(idx ? idx[i] : i), b = P(idx ? idx[i + 1] : i + 1), c = P(idx ? idx[i + 2] : i + 2); if (a !== b && b !== c && a !== c) tri.push(a, b, c); }
    if (!tri.length) { stats.skipped++; continue; }
    // samma form och färg = samma geometri
    let h = 2166136261 >>> 0; for (let i = 0; i < pts.length; i++) h = Math.imul(h ^ (pts[i] | 0), 16777619) >>> 0; for (let i = 0; i < tri.length; i++) h = Math.imul(h ^ tri[i], 16777619) >>> 0;
    const col = it.color || "#b0b8c4", op = it.opacity || 0, gk = h + ":" + pts.length + ":" + tri.length + ":" + col + ":" + op; let shape = shared.get(gk);
    if (shape) stats.reused++;
    else {
      const sk = col + op; let style = styles.get(sk); if (!style) { style = doc.style("c" + sk, col, "Färg " + col, op); styles.set(sk, style); }
      let txt = ""; const parts = []; for (let i = 0; i < pts.length; i += 3) parts.push(`(${ifcMeshNum(pts[i] / d.m, d)},${ifcMeshNum(pts[i + 1] / d.m, d)},${ifcMeshNum(pts[i + 2] / d.m, d)})`);
      const pl3 = doc.E(`IFCCARTESIANPOINTLIST3D((${parts.join(",")}))`); parts.length = 0; const fs = []; for (let i = 0; i < tri.length; i += 3) fs.push(`(${tri[i]},${tri[i + 1]},${tri[i + 2]})`);
      const mesh = doc.E(`IFCTRIANGULATEDFACESET(${pl3},$,.T.,(${fs.join(",")}),$)`); doc.E(`IFCSTYLEDITEM(${mesh},(${style}),$)`);
      shape = doc.shape(mesh, "Tessellation"); shared.set(gk, shape); stats.uniqueGeoms++; stats.points += pts.length / 3;
    }
    const path = it.path || [], el = doc.proxy(it.name || "Del", path.slice(0, -1).join(" / "), "Mesh", doc.place([bx, by, bz]), shape, "");
    if (o.props !== false) doc.props(el, [["Källfil", o.source || ""], ["Sökväg", path.join(" / ")]], "Mesh-modell");
    elems.push(el); stats.parts++; stats.tris += tri.length / 3;
    if ((li & 63) === 0) { if (o.onProgress) o.onProgress((li + 1) / list.length, stats); await tick(); }
  }
  if (!elems.length) return null;
  const fileName = o.fileName || "mesh.ifc"; return { text: doc.finish(elems, fileName), fileName, stats };
}
/* Text → .ifczip (zip med en IFC-fil), kräver fflate. */
function ifcZipBytes(text, name) { const bytes = new TextEncoder().encode(text); return fflate.zipSync({ [name]: bytes }, { level: 6 }); }
