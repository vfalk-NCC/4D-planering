/* Markerade objekt som HTML (Victor 2026-11-20: "kan man göra det som html och behålla färgerna jag lagt manuellt i TC?").
   Knappen "HTML" bredvid IFC: samma urval som IFC-knappen (markerat i 3D-vyn, utan underdelar). Modellens IFC hämtas ur Trimble Connect, de markerade
   objekten plockas ut (ifc-subset.js) och görs om till trianglar med web-ifc (ifc-mesh.js). Resultatet blir EN fristående HTML-fil med samma
   läsare som 3D-editorns HTML-export (lager, klick, sök, zoom, bildexport) – öppnas utan Trimble Connect.
   Färger: i första hand de du satt i Trimble Connect (läses med viewer.getObjectProperties → color, om Trimble Connect lämnar ut dem), annars
   modellens egna IFC-färger. Statusraden anger hur många objekt som fick sin Trimble Connect-färg, så att det syns om färgerna lästes eller inte. */

const IFCH_LIM = 300e6;
function ifchParseColor(c) {
  if (c == null) return null;
  if (typeof c === "string") {
    let m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c.trim()); if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
    m = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c.trim()); if (m) return [1, 2, 3].map(i => parseInt(m[i] + m[i], 16));
    m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c); if (m) return [m[1], m[2], m[3]].map(v => Math.max(0, Math.min(255, Math.round(+v))));
    return null;
  }
  if (typeof c === "object") { const r = c.r ?? c.red, g = c.g ?? c.green, b = c.b ?? c.blue; if ([r, g, b].every(v => typeof v === "number")) { const k = Math.max(r, g, b) <= 1 ? 255 : 1; return [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v * k)))); } }
  return null;
}
/* Trimble Connects egna färg per objekt (runtime-id -> [r,g,b]); tom karta om den inte går att läsa. */
async function ifchTcColors(modelId, rids) {
  const out = new Map(), V = API && API.viewer; if (!V || typeof V.getObjectProperties !== "function") return out;
  for (let i = 0; i < rids.length; i += 400) {
    const chunk = rids.slice(i, i + 400); let props = [];
    try { props = await V.getObjectProperties(modelId, chunk) || []; } catch (e) { console.warn("getObjectProperties", e); continue; }
    props.forEach((p, k) => { const col = ifchParseColor(p && (p.color ?? (p.properties && p.properties.color))); if (col) out.set(p.id != null ? p.id : chunk[k], col); });
  }
  return out;
}
/* IFC-text -> ett objekt per IFC-element: { guid, name, cls, pos, idx, vc, tris }. Koordinater i meter, Z uppåt. */
async function ifchMesh(text, colorOf, onProgress) {
  const api = await ifcmLoad(), id = api.OpenModel(new TextEncoder().encode(text), { COORDINATE_TO_ORIGIN: false, CIRCLE_SEGMENTS: 12 }), objs = new Map();
  try {
    api.StreamAllMeshes(id, mesh => {
      let o = objs.get(mesh.expressID); if (!o) { o = { eid: mesh.expressID, p: [], c: [], i: [] }; objs.set(mesh.expressID, o); }
      for (let gi = 0; gi < mesh.geometries.size(); gi++) {
        const pg = mesh.geometries.get(gi), geom = api.GetGeometry(id, pg.geometryExpressID), v = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize()), ix = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
        if (geom.delete) geom.delete();
        const T = pg.flatTransformation, c = pg.color || { x: 0.75, y: 0.75, z: 0.75, w: 1 }, base = o.p.length / 3, rgb = [c.x, c.y, c.z].map(q => Math.max(0, Math.min(255, Math.round(q * 255))));
        for (let k = 0; k < v.length; k += 6) {
          const x = v[k], y = v[k + 1], z = v[k + 2];
          const wx = T[0] * x + T[4] * y + T[8] * z + T[12], wy = T[1] * x + T[5] * y + T[9] * z + T[13], wz = T[2] * x + T[6] * y + T[10] * z + T[14];
          o.p.push(wx, -wz, wy); o.c.push(rgb[0], rgb[1], rgb[2]); // web-ifc: Y uppåt -> Z uppåt
        }
        for (let k = 0; k < ix.length; k++) o.i.push(ix[k] + base);
      }
    });
    const out = [];
    for (const o of objs.values()) {
      if (!o.i.length) continue; let guid = "", name = "", cls = "";
      try { const line = api.GetLine(id, o.eid); guid = (line.GlobalId && line.GlobalId.value) || ""; name = (line.Name && line.Name.value) || ""; cls = String(api.GetNameFromTypeCode ? api.GetNameFromTypeCode(api.GetLineType(id, o.eid)) : "").replace(/^IFC/i, ""); } catch (e) { /* utan namn */ }
      out.push({ guid, name, cls, p: o.p, c: o.c, i: o.i });
    }
    return out;
  } finally { api.CloseModel(id); }
}
const ifchB64 = (parts, arr) => { const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); for (let i = 0; i < u.length; i += 0x6000) parts.push(btoa(String.fromCharCode.apply(null, u.subarray(i, i + 0x6000)))); };

async function exportSelectionHtml() {
  const btns = ["btnExportSelHtmlTop"].map(id => document.getElementById(id)).filter(Boolean);
  if (exportSelectionHtml.busy) return null; exportSelectionHtml.busy = true; btns.forEach(b => { b.disabled = true; });
  const say = (t, ms) => { if (typeof ifcSubsetBanner === "function") ifcSubsetBanner(t, ms); };
  try {
    if (!API || !API.viewer || typeof API.viewer.getSelection !== "function") throw new Error("3D-vyn är inte ansluten.");
    const selRaw = await API.viewer.getSelection(), sel = [];
    for (const m of selRaw || []) { const rids = m.objectRuntimeIds || []; if (!rids.length) continue; const ext = await API.viewer.convertToObjectIds(m.modelId, rids); const rows = []; rids.forEach((r, i) => { if (ext && ext[i]) rows.push([String(ext[i]), r]); }); if (rows.length) sel.push({ modelId: m.modelId, rows }); }
    if (!sel.length) { alert("Markera objekten i 3D-vyn först – sedan exporteras just de som en HTML-fil."); return null; }
    let specs = []; try { specs = await API.viewer.getModels(); } catch (e) { /* utan lista */ }
    const layers = [], all = []; let nObj = 0, nTc = 0, nStat = 0, tris = 0, srcName = "";
    for (const m of sel) {
      const spec = (specs || []).find(s => s.id === m.modelId || s.versionId === m.modelId) || { id: m.modelId }, nm = spec.name || m.modelId; srcName = srcName || nm;
      if (spec.name && !/\.ifc(zip)?$/i.test(spec.name)) { say(`✗ ${nm}: inte en IFC-modell`, 8000); continue; }
      say(`Hämtar ${nm} från Trimble Connect…`);
      const raw = await ifcSubsetUnzip(await ifcSubsetDownload(spec));
      say(`Plockar ut ${m.rows.length} objekt ur ${nm}…`); await new Promise(r => setTimeout(r, 30));
      const r = ifcSubset(ifcBytesToStr(raw), m.rows.map(x => x[0]), { fileName: "urval.ifc" });
      if (!r.text) { say(`✗ ${nm}: objekten finns inte i filen`, 8000); continue; }
      say("Läser Trimble Connects färger…");
      const tc = await ifchTcColors(m.modelId, m.rows.map(x => x[1])), ridOf = new Map(m.rows);
      say(`Gör om ${r.found.length} objekt till 3D (web-ifc)…`); await new Promise(r2 => setTimeout(r2, 30));
      const objs = await ifchMesh(r.text);
      // Status-färg från planeringen (samma regler och färger som 4D-planering sätter i 3D-vyn) för objekt som är kopplade till en aktivitet.
      const stat = new Map(); try {
        const at = (document.getElementById("timelineDate") || {}).value || new Date().toISOString().slice(0, 10), colors = { ...DEFAULT_STATUS_COLORS, ...(settings.statusColors || {}) }, wd = settings.warningDaysBeforeEnd || 0;
        (typeof items !== "undefined" ? items : []).forEach(it => { if (String(it.modelId) !== String(m.modelId) || it.objectId == null) return; const ph = computeItemPhase(it, at, wd, true); if (!ph) return; const hx = ph === "klar" && /^#[0-9a-f]{6}$/i.test(it.doneColor || "") ? it.doneColor : colors[ph]; if (hx) stat.set(String(it.objectId), ifchParseColor(hx)); });
      } catch (e) { console.warn("Statusfärger", e); }
      all.push({ nm, objs, tc, ridOf, stat });
    }
    if (!all.length) { say("Inget att exportera.", 8000); return null; }
    // Egen mittpunkt (räknas i dubbel precision INNAN talen läggs i Float32 – SWEREF-koordinater på miljontals meter tappar annars decimeter och formerna förvrängs).
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    all.forEach(M => M.objs.forEach(o => { for (let i = 0; i < o.p.length; i += 3) for (let j = 0; j < 3; j++) { const v = o.p[i + j]; if (v < mn[j]) mn[j] = v; if (v > mx[j]) mx[j] = v; } }));
    const org = mn.map((v, j) => Math.round((v + mx[j]) / 2));
    let nTcCol = 0;
    for (const M of all) {
      let nV = 0, nT = 0; M.objs.forEach(o => { nV += o.p.length / 3; nT += o.i.length; });
      const pos = new Float32Array(nV * 3), vc = new Uint8Array(nV * 3), idx = new Uint32Array(nT), list = []; let bv = 0, bi = 0;
      M.objs.forEach(o => {
        const tcc = M.tc.get(M.ridOf.get(o.guid)), stc = M.stat.get(o.guid), col = tcc || stc; if (tcc) nTcCol++; else if (stc) nStat++;
        for (let k = 0; k < o.p.length; k += 3) { const q = bv * 3 + k; pos[q] = o.p[k] - org[0]; pos[q + 1] = o.p[k + 1] - org[1]; pos[q + 2] = o.p[k + 2] - org[2]; }
        for (let k = 0; k < o.c.length; k += 3) { const q = bv * 3 + k; vc[q] = col ? col[0] : o.c[k]; vc[q + 1] = col ? col[1] : o.c[k + 1]; vc[q + 2] = col ? col[2] : o.c[k + 2]; }
        for (let k = 0; k < o.i.length; k++) idx[bi + k] = o.i[k] + bv;
        list.push({ n: o.name || o.cls || "Objekt", c: o.cls, g: o.guid, s: bi, k: o.i.length }); bv += o.p.length / 3; bi += o.i.length; nObj++;
      });
      layers.push({ k: "model", name: M.nm, pos, idx, vc, objs: list, tris: nT / 3 }); tris += nT / 3; M.objs.length = 0;
    }
    nTc = nTcCol;
    const est = layers.reduce((a, L) => a + (L.pos.byteLength + L.idx.byteLength + L.vc.byteLength) * 1.34, 0);
    if (est > IFCH_LIM) throw new Error(`Filen blir för stor (${(est / 1048576).toFixed(0)} MB, gränsen är ${(IFCH_LIM / 1048576).toFixed(0)} MB). Markera färre objekt.`);
    say("Bygger HTML-filen…"); await new Promise(r => setTimeout(r, 30));
    const get = async u => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} (${r.status})`); return r.text(); };
    const [tpl, three, orbit] = await Promise.all([get("lagesplan-3dscene-viewer.html"), get("vendor/three/three.min.js"), get("vendor/three/OrbitControls.js")]);
    const safe = t => t.replace(/<\/(script)/gi, "<\\/$1"), M1 = "/*__THREE__*/", M2 = "/*__ORBIT__*/", M3 = "/*__DATA__*/null", i1 = tpl.indexOf(M1), i2 = tpl.indexOf(M2), i3 = tpl.indexOf(M3);
    if (i1 < 0 || i2 < 0 || i3 < 0) throw new Error("Visarmallen är skadad.");
    const at = new Date().toISOString().slice(0, 10), title = `${srcName.replace(/\.ifc(zip)?$/i, "")} - urval ${nObj} objekt ${at}`;
    const meta = { title, exported: new Date().toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }), stats: `${layers.length} ${layers.length === 1 ? "modell" : "modeller"}, ${nObj} objekt, ${Math.round(tris / 1000)} tkr trianglar, ${nTc} med färg från Trimble Connect, ${nStat} med statusfärg från planeringen`, origin: org };
    const parts = [tpl.slice(0, i1), safe(three), tpl.slice(i1 + M1.length, i2), safe(orbit), tpl.slice(i2 + M2.length, i3), safe(JSON.stringify({ meta }).slice(0, -1)), ',"layers":['];
    layers.forEach((L, k) => { parts.push(k ? "," : "", safe(JSON.stringify({ k: L.k, name: L.name, objs: L.objs }).slice(0, -1)), ',"pos":"'); ifchB64(parts, L.pos); parts.push('","idx":"'); ifchB64(parts, L.idx); parts.push('","vc":"'); ifchB64(parts, L.vc); parts.push('"}'); });
    parts.push('],"docs":[]}', tpl.slice(i3 + M3.length));
    const blob = new Blob(parts, { type: "text/html;charset=utf-8" }), name = `${title}.html`.replace(/[\\/:*?"<>|]/g, "-");
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    say(`✓ ${name}: ${nObj} objekt, ${(blob.size / 1048576).toFixed(1).replace(".", ",")} MB. Färger: ${nTc} från Trimble Connect, ${nStat} statusfärg från planeringen, ${nObj - nTc - nStat} modellens egen färg.${nTc ? "" : " Trimble Connect lämnade inte ut egna färger via API:t."}`, 14000);
    return { name, size: blob.size, nObj, nTc };
  } catch (e) { console.error(e); say(`Kunde inte exportera: ${e.message}`, 10000); alert("Kunde inte exportera HTML: " + e.message); return null; }
  finally { exportSelectionHtml.busy = false; btns.forEach(b => { b.disabled = false; }); }
}
if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", () => { const b = document.getElementById("btnExportSelHtmlTop"); if (b) b.onclick = () => { exportSelectionHtml(); }; });
if (typeof module !== "undefined") module.exports = { ifchParseColor };
