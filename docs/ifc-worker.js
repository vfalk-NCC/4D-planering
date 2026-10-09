/* IFC -> trianglar i en egen tråd (Web Worker), Victor 2026-10-09: "den har problem att hämta in mina
   bygg-IFC:er på 115 MB" – sidan (och 4D-planering i Trimble Connect, som delar process med den) frös
   medan web-ifc läste filen. Här läses modellen utan att låsa sidan, och geometrin skickas tillbaka i
   bitar (typade arrayer, utan kopiering) så att byggnaden byggs upp medan resten läses.

   In:  { bytes: ArrayBuffer (överförd), placement, O: [x,y,z], maxTris, chunkTris, base: vendor-URL }
   Ut:  { type: "progress", f, n } – andel klar (0–1) och antal objekt
        { type: "chunk", pos: Float32Array, col: Float32Array, idx: Uint32Array, ranges: [...] }
        { type: "done", tris, capped, products } | { type: "error", message }
   Rymder (IfcSpace) och öppningar hoppas över – de är osynliga volymer som bara tar plats. */

let api = null;
async function load(base) {
  if (api) return api;
  importScripts(base + "web-ifc-api-iife.js");
  const a = new WebIFC.IfcAPI();
  a.SetWasmPath(base, true);
  await a.Init(undefined, true); // en tråd: fungerar utan särskilda serverhuvuden
  try { a.SetLogLevel(WebIFC.LogLevel.LOG_LEVEL_OFF); } catch (e) { /* äldre version */ }
  api = a;
  return a;
}

/* Växande typad array (ingen JS-lista med miljontals tal). */
function grow(Type, cap) {
  let a = new Type(cap), n = 0;
  return {
    push3(x, y, z) { if (n + 3 > a.length) { const b = new Type(a.length * 2); b.set(a); a = b; } a[n++] = x; a[n++] = y; a[n++] = z; },
    push(v) { if (n + 1 > a.length) { const b = new Type(a.length * 2); b.set(a); a = b; } a[n++] = v; },
    get length() { return n; },
    take() { const out = a.slice(0, n); a = new Type(cap); n = 0; return out; },
  };
}

self.onmessage = async ev => {
  const { bytes, placement, O, maxTris = 6e6, chunkTris = 80000, base } = ev.data || {};
  let id = null;
  try {
    const A = await load(base);
    self.postMessage({ type: "progress", f: 0.02, n: 0 });
    id = A.OpenModel(new Uint8Array(bytes), { COORDINATE_TO_ORIGIN: false, CIRCLE_SEGMENTS: 12 });
    // Antal objekt med geometri (för procenten): byggdelar och andra produkter.
    let total = 0;
    try { total = A.GetLineIDsWithType(id, WebIFC.IFCPRODUCT, true).size(); } catch (e) { total = 0; }
    const skip = new Set([WebIFC.IFCSPACE, WebIFC.IFCOPENINGELEMENT].filter(Boolean));
    const pl = placement || { position: { x: 0, y: 0, z: 0 }, refDirection: { x: 1, y: 0, z: 0 } };
    const rd = pl.refDirection || { x: 1, y: 0, z: 0 }, rl = Math.hypot(rd.x, rd.y) || 1, cs = rd.x / rl, sn = rd.y / rl;
    const P = pl.position || { x: 0, y: 0, z: 0 };
    const ox = P.x / 1000 - O[0], oy = P.y / 1000 - O[1], oz = P.z / 1000 - O[2];
    const pos = grow(Float32Array, 3 * 200000), col = grow(Float32Array, 3 * 200000), idx = grow(Uint32Array, 3 * chunkTris + 3000);
    let ranges = [], tris = 0, capped = false, n = 0, lastPost = 0, chunkStartTris = 0;
    const flush = () => {
      if (!idx.length) return;
      const m = { type: "chunk", pos: pos.take(), col: col.take(), idx: idx.take(), ranges };
      ranges = []; chunkStartTris = tris;
      self.postMessage(m, [m.pos.buffer, m.col.buffer, m.idx.buffer]);
    };
    const hasGuid = typeof A.GetGuidFromExpressId === "function";
    A.StreamAllMeshes(id, mesh => {
      if (capped) return;
      n++;
      let type = 0;
      try { type = A.GetLineType(id, mesh.expressID); } catch (e) { /* okänd */ }
      if (skip.has(type)) return;
      let guid = null, name = "";
      try {
        if (hasGuid) guid = A.GetGuidFromExpressId(id, mesh.expressID) || null;
        const line = A.GetLine(id, mesh.expressID, false);
        if (!guid && line && line.GlobalId) guid = line.GlobalId.value;
        name = line && line.Name ? line.Name.value || "" : "";
      } catch (e) { /* utan namn */ }
      const start = pos.length / 3;
      let baseCol = null;
      for (let gi = 0; gi < mesh.geometries.size(); gi++) {
        const pg = mesh.geometries.get(gi), geom = A.GetGeometry(id, pg.geometryExpressID);
        const v = A.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
        const ix = A.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
        if (geom.delete) geom.delete();
        if (tris + ix.length / 3 > maxTris) { capped = true; return; }
        tris += ix.length / 3;
        const T = pg.flatTransformation, c = pg.color || { x: 0.8, y: 0.8, z: 0.8 };
        // Samma ljusning som tidigare (mot ljusgrått) – byggnaden är bakgrund till etableringen.
        const r = c.x + (0.875 - c.x) * 0.45, g = c.y + (0.894 - c.y) * 0.45, b = c.z + (0.918 - c.z) * 0.45;
        if (!baseCol) baseCol = [r, g, b];
        const o = pos.length / 3;
        for (let k = 0; k < v.length; k += 6) {
          const x = v[k], y = v[k + 1], z = v[k + 2];
          const wx = T[0] * x + T[4] * y + T[8] * z + T[12], wy = T[1] * x + T[5] * y + T[9] * z + T[13], wz = T[2] * x + T[6] * y + T[10] * z + T[14];
          const X = wx, Y = -wz, Z = wy; // web-ifc: Y uppåt -> Z uppåt
          pos.push3(cs * X - sn * Y + ox, sn * X + cs * Y + oy, Z + oz);
          col.push3(r, g, b);
        }
        for (let k = 0; k < ix.length; k++) idx.push(ix[k] + o);
      }
      const count = pos.length / 3 - start;
      if (count) ranges.push({ start, count, guid, name, base: baseCol || [0.85, 0.87, 0.9] });
      if (tris - chunkStartTris > chunkTris) flush();
      const now = Date.now();
      if (now - lastPost > 250) { lastPost = now; self.postMessage({ type: "progress", f: total ? Math.min(0.99, n / total) : 0.5, n }); }
    });
    flush();
    self.postMessage({ type: "done", tris, capped, products: n });
  } catch (e) {
    self.postMessage({ type: "error", message: (e && e.message) || String(e) });
  } finally {
    try { if (api && id != null) api.CloseModel(id); } catch (e) { /* redan stängd */ }
  }
};
