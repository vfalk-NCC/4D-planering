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
