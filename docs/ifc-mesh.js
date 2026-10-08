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
