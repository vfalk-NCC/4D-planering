/* IFC -> trianglar i en egen tråd (Web Worker), Victor 2026-10-09: "den har problem att hämta in mina
   bygg-IFC:er på 115 MB" – sidan (och 4D-planering i Trimble Connect, som delar process med den) frös
   medan web-ifc läste filen. Här läses modellen utan att låsa sidan, och geometrin skickas tillbaka i
   bitar (typade arrayer, utan kopiering) så att byggnaden byggs upp medan resten läses.

   In:  { bytes: ArrayBuffer, placement, O: [x,y,z], maxTris, chunkTris, base: vendor-URL, part, parts, names }
        part/parts: flera trådar delar på objekten (var och en tar vart parts:e objekt, part = 0..parts-1) –
        varje tråd öppnar filen själv, så att geometrin (det tunga, t.ex. urtag) räknas parallellt.
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

/* Utan urtag (snabbt): IFCRELVOIDSELEMENT byts mot ett okänt namn med samma längd, så att web-ifc inte
   sågar ut fönster- och dörrhål (den booleska operationen är det i särklass dyraste vid inläsningen).
   Fönster, dörrar och allt annat ritas som vanligt – bara hålen i väggarna och bjälklagen uteblir. */
function dropVoids(u8) {
  const pat = "IFCRELVOIDSELEMENT", L = pat.length, P = new Uint8Array(L);
  for (let i = 0; i < L; i++) P[i] = pat.charCodeAt(i);
  let n = 0;
  for (let i = u8.indexOf(73); i !== -1 && i <= u8.length - L; i = u8.indexOf(73, i + 1)) { // 73 = "I"
    let k = 1;
    while (k < L && u8[i + k] === P[k]) k++;
    if (k === L) { u8[i + 3] = 88; n++; i += L - 1; } // IFCRELVOIDS… -> IFCXELVOIDS…
  }
  return n;
}

/* GUID och namn för alla objekt direkt ur filens text (en genomläsning) – web-ifc:s GetLine per objekt tog
   ~40 % av tiden. Raden ser ut som #123=IFCWALL('guid',#5,'Namn',…); \X2\…\X0\ (t.ex. å, ä, ö) avkodas. */
function decodeIfcStr(t) {
  return t.replace(/''/g, "'")
    .replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (_, h) => { let o = ""; for (let i = 0; i + 4 <= h.length; i += 4) o += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return o; })
    .replace(/\\X\\([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\S\\(.)/g, (_, c) => String.fromCharCode(c.charCodeAt(0) + 128));
}
function scanNames(u8, want) {
  const out = new Map(), N = u8.length, dec = new TextDecoder("latin1"), utf8 = new TextDecoder("utf-8");
  // Bitkarta i stället för Set (2 miljoner rader slås upp – en Set var 5 × långsammare).
  let mx = 0; want.forEach(v => { if (v > mx) mx = v; });
  const bm = new Uint8Array(mx + 1); want.forEach(v => { bm[v] = 1; });
  let special = false;
  const str = (i) => { // läser 'text' från i (vid '); returnerar [text, slutindex]
    let j = i + 1, hi = false; special = false;
    for (; j < N; j++) { const c = u8[j]; if (c === 39) { if (u8[j + 1] === 39) { special = true; j++; continue; } break; } if (c === 92) special = true; else if (c > 127) hi = true; }
    const sub = u8.subarray(i + 1, j);
    // Rå UTF-8 (en del program skriver å/ä/ö direkt i stället för \X2\…\X0\).
    return [hi ? utf8.decode(sub) : sub.length < 4096 ? String.fromCharCode.apply(null, sub) : dec.decode(sub), j + 1];
  };
  for (let i = 0; i < N; ) {
    // Rad för rad (indexOf är inbyggd och snabb); bara rader som börjar med "#".
    const nl = u8.indexOf(10, i), next = nl < 0 ? N : nl + 1;
    if (u8[i] !== 35) { i = next; continue; }
    let j = i + 1, id = 0, c;
    while ((c = u8[j]) >= 48 && c <= 57) { id = id * 10 + c - 48; j++; }
    if (id > mx || !bm[id]) { i = next; continue; }
    while (j < N && u8[j] !== 40 && u8[j] !== 10) j++; // till "("
    if (u8[j] !== 40 || u8[j + 1] !== 39) { i = next; continue; }
    const [guid, k0] = str(j + 1);
    let k = k0;
    while (k < N && u8[k] !== 44) k++; k++;            // till "," efter GUID
    while (k < N && u8[k] !== 44) k++; k++;            // förbi ägaren (#5 eller $)
    while (k < N && u8[k] === 32) k++;
    let name = "";
    if (u8[k] === 39) { const t = str(k)[0]; name = (special ? decodeIfcStr(t) : t).slice(0, 200); }
    out.set(id, [guid, name]);
    i = Math.max(next, k); // namnet kan innehålla radbrytning (sällsynt)
    if (i < N && u8[i - 1] !== 10) { const nl2 = u8.indexOf(10, i); i = nl2 < 0 ? N : nl2 + 1; }
  }
  return out;
}

/* Växande typad array (ingen JS-lista med miljontals tal). */
function grow(Type, cap) {
  let a = new Type(cap), n = 0;
  return {
    push3(x, y, z) { if (n + 3 > a.length) { const b = new Type(a.length * 2); b.set(a); a = b; } a[n++] = x; a[n++] = y; a[n++] = z; },
    push(v) { if (n + 1 > a.length) { const b = new Type(a.length * 2); b.set(a); a = b; } a[n++] = v; },
    get length() { return n; },
    take() { const out = a.slice(0, n); a = new Type(cap); n = 0; return out; },
    view() { return a.subarray(0, n); }, // utan kopia (gäller tills nästa push)
    reset() { n = 0; },
  };
}

self.onmessage = async ev => {
  const { bytes, placement, O, maxTris = 6e6, chunkTris = 80000, base, part = 0, parts = 1, names = true, voids = false, details = false } = ev.data || {};
  let id = null;
  try {
    const t0 = Date.now();
    const A = await load(base);
    self.postMessage({ type: "progress", f: 0.02, n: 0 });
    const u8 = new Uint8Array(bytes);
    if (!voids) dropVoids(u8);
    id = A.OpenModel(u8, { COORDINATE_TO_ORIGIN: false, CIRCLE_SEGMENTS: 8 });
    const tOpen = Date.now() - t0;
    self.postMessage({ type: "progress", f: 0.05, n: 0 });
    // Objekten som ska ritas: alla produkter utom rymder, öppningar och de rumsliga nivåerna (har ingen kropp).
    const skip = new Set([WebIFC.IFCSPACE, WebIFC.IFCOPENINGELEMENT, WebIFC.IFCSITE, WebIFC.IFCBUILDING, WebIFC.IFCBUILDINGSTOREY, WebIFC.IFCPROJECT,
      WebIFC.IFCANNOTATION, WebIFC.IFCGRID, WebIFC.IFCVIRTUALELEMENT].filter(Boolean));
    const W = WebIFC, ids = (types, inh = true) => { const s = new Set(); types.filter(Boolean).forEach(t => { try { const v = A.GetLineIDsWithType(id, t, inh); for (let i = 0; i < v.size(); i++) s.add(v.get(i)); } catch (e) { /* typen finns inte i schemat */ } }); return s; };
    // Tunga detaljer som sällan behövs i en etableringsvy (av som standard, Lager → Visa detaljer):
    // armering, inredning, installationer (rör, kanaler, el, VVS-komponenter) och fästdon.
    const detailIds = details ? new Set() : ids([W.IFCREINFORCINGELEMENT, W.IFCREINFORCINGBAR, W.IFCREINFORCINGMESH, W.IFCTENDON, W.IFCTENDONANCHOR,
      W.IFCFURNISHINGELEMENT, W.IFCFURNITURE, W.IFCSYSTEMFURNITUREELEMENT, W.IFCDISTRIBUTIONELEMENT, W.IFCFASTENER, W.IFCMECHANICALFASTENER, W.IFCDISCRETEACCESSORY]);
    // Stommen och skalet först, så att byggnaden syns efter några sekunder medan resten fylls på.
    const firstIds = ids([W.IFCSLAB, W.IFCWALL, W.IFCWALLSTANDARDCASE, W.IFCCOLUMN, W.IFCBEAM, W.IFCROOF, W.IFCFOOTING, W.IFCPILE, W.IFCCURTAINWALL,
      W.IFCSTAIR, W.IFCSTAIRFLIGHT, W.IFCRAMP, W.IFCRAMPFLIGHT]);
    let mine = null, skipped = 0;
    try {
      const all = A.GetLineIDsWithType(id, W.IFCPRODUCT, true), first = [], rest = [];
      for (let i = 0; i < all.size(); i++) {
        const e = all.get(i);
        if (skip.has(A.GetLineType(id, e))) continue;
        if (detailIds.has(e)) { skipped++; continue; }
        (firstIds.has(e) ? first : rest).push(e);
      }
      first.sort((a, b) => a - b); rest.sort((a, b) => a - b);
      const list = first.concat(rest);
      mine = parts > 1 ? list.filter((_, i) => i % parts === part) : list;
    } catch (e) { mine = null; } // äldre web-ifc: alla objekt i en tråd
    // GUID och namn ur texten (snabbt); saknas något används web-ifc för just det objektet.
    let names0 = null;
    try { if (mine && names) names0 = scanNames(u8, new Set(mine)); } catch (e) { names0 = null; }
    const total = mine ? mine.length : 0, tList = Date.now() - t0 - tOpen;
    const pl = placement || { position: { x: 0, y: 0, z: 0 }, refDirection: { x: 1, y: 0, z: 0 } };
    const rd = pl.refDirection || { x: 1, y: 0, z: 0 }, rl = Math.hypot(rd.x, rd.y) || 1, cs = rd.x / rl, sn = rd.y / rl;
    const P = pl.position || { x: 0, y: 0, z: 0 };
    const ox = P.x / 1000 - O[0], oy = P.y / 1000 - O[1], oz = P.z / 1000 - O[2];
    // Rumsliga block (~40 × 40 m): bara block som syns ritas (grafikkortet hoppar över resten) och varje
    // block får ett litet rumsligt index för träffar. Objektet hamnar i blocket där dess mitt ligger.
    const CELL = 40, cells = new Map();
    let tris = 0, capped = false, n = 0, lastPost = 0;
    const objPos = grow(Float32Array, 3 * 8192), objCol = grow(Float32Array, 3 * 8192), objIdx = grow(Uint32Array, 3 * 8192), objNrm = grow(Int8Array, 3 * 8192);
    const cellOf = key => { let c = cells.get(key); if (!c) { c = { pos: grow(Float32Array, 3 * 4096), col: grow(Float32Array, 3 * 4096), nrm: grow(Int8Array, 3 * 4096), idx: grow(Uint32Array, 3 * 4096), ranges: [], tris: 0 }; cells.set(key, c); } return c; };
    const flushCell = c => {
      if (!c.idx.length) return;
      const m = { type: "chunk", pos: c.pos.take(), col: c.col.take(), nrm: c.nrm.take(), idx: c.idx.take(), ranges: c.ranges, colV: 2 };
      c.ranges = []; c.tris = 0;
      self.postMessage(m, [m.pos.buffer, m.col.buffer, m.nrm.buffer, m.idx.buffer]);
    };
    const flush = () => cells.forEach(flushCell);
    // De första sekunderna skickas även halvfulla block, så att stommen syns direkt.
    let earlyUntil = Date.now() + 6000, lastEarly = Date.now();
    const hasGuid = typeof A.GetGuidFromExpressId === "function";
    const onMesh = mesh => {
      if (capped) return;
      n++;
      if (!mine) { let type = 0; try { type = A.GetLineType(id, mesh.expressID); } catch (e) { /* okänd */ } if (skip.has(type)) return; }
      let guid = null, name = "";
      const nm = names0 && names0.get(mesh.expressID);
      if (nm) { guid = nm[0]; name = nm[1]; }
      else try {
        if (hasGuid) guid = A.GetGuidFromExpressId(id, mesh.expressID) || null;
        if (names || !guid) {
          const line = A.GetLine(id, mesh.expressID, false);
          if (!guid && line && line.GlobalId) guid = line.GlobalId.value;
          name = line && line.Name ? line.Name.value || "" : "";
        }
      } catch (e) { /* utan namn */ }
      objPos.reset(); objCol.reset(); objIdx.reset(); objNrm.reset();
      let baseCol = null, sx = 0, sy = 0, nv = 0, otris = 0;
      for (let gi = 0; gi < mesh.geometries.size(); gi++) {
        const pg = mesh.geometries.get(gi), geom = A.GetGeometry(id, pg.geometryExpressID);
        const v = A.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
        const ix = A.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
        if (geom.delete) geom.delete();
        if (tris + otris + ix.length / 3 > maxTris) { capped = true; return; }
        otris += ix.length / 3;
        const T = pg.flatTransformation, c = pg.color || { x: 0.8, y: 0.8, z: 0.8 };
        // Modellens egna färger, som i Trimble Connect (Victor 2026-10-10: "min vy känns nästan dimmig" –
        // färgerna blandades tidigare 45 % mot ljusgrått).
        const r = c.x, g = c.y, b = c.z;
        if (!baseCol) baseCol = [r, g, b];
        const o = objPos.length / 3;
        for (let k = 0; k < v.length; k += 6) {
          const x = v[k], y = v[k + 1], z = v[k + 2];
          const wx = T[0] * x + T[4] * y + T[8] * z + T[12], wy = T[1] * x + T[5] * y + T[9] * z + T[13], wz = T[2] * x + T[6] * y + T[10] * z + T[14];
          const X = wx, Y = -wz, Z = wy; // web-ifc: Y uppåt -> Z uppåt
          const px = cs * X - sn * Y + ox, py = sn * X + cs * Y + oy;
          objPos.push3(px, py, Z + oz); objCol.push3(r, g, b);
          // Normalen från web-ifc (samma vridning, utan förflyttning) – sidan slipper räkna fram dem.
          const nx0 = v[k + 3], ny0 = v[k + 4], nz0 = v[k + 5];
          const nwx = T[0] * nx0 + T[4] * ny0 + T[8] * nz0, nwy = T[1] * nx0 + T[5] * ny0 + T[9] * nz0, nwz = T[2] * nx0 + T[6] * ny0 + T[10] * nz0;
          const NX = cs * nwx + sn * nwz, NY = sn * nwx - cs * nwz, NZ = nwy, nl = Math.hypot(NX, NY, NZ) || 1;
          objNrm.push3(Math.round(NX / nl * 127), Math.round(NY / nl * 127), Math.round(NZ / nl * 127));
          sx += px; sy += py; nv++;
        }
        for (let k = 0; k < ix.length; k++) objIdx.push(ix[k] + o);
      }
      if (!nv) return;
      tris += otris;
      const cell = cellOf(Math.floor(sx / nv / CELL) + ":" + Math.floor(sy / nv / CELL));
      const start = cell.pos.length / 3, idxStart = cell.idx.length;
      const P = objPos.view(), C = objCol.view(), I = objIdx.view();
      const Nn = objNrm.view();
      for (let k = 0; k < P.length; k += 3) { cell.pos.push3(P[k], P[k + 1], P[k + 2]); cell.col.push3(C[k], C[k + 1], C[k + 2]); cell.nrm.push3(Nn[k], Nn[k + 1], Nn[k + 2]); }
      for (let k = 0; k < I.length; k++) cell.idx.push(I[k] + start);
      cell.ranges.push({ start, count: nv, idxStart, idxCount: I.length, guid, name, base: baseCol || [0.85, 0.87, 0.9] });
      cell.tris += otris;
      if (cell.tris > chunkTris) flushCell(cell);
      const now = Date.now();
      if (now < earlyUntil && now - lastEarly > 1500) { lastEarly = now; flush(); }
      if (now - lastPost > 250) { lastPost = now; self.postMessage({ type: "progress", f: total ? Math.min(0.99, 0.05 + 0.95 * n / total) : 0.5, n }); }
    };
    if (mine) A.StreamMeshes(id, mine, onMesh); else A.StreamAllMeshes(id, onMesh);
    flush();
    self.postMessage({ type: "done", tris, capped, products: n, skipped: part === 0 ? skipped : 0, ms: { open: tOpen, list: tList, geo: Date.now() - t0 - tOpen - tList } });
  } catch (e) {
    self.postMessage({ type: "error", message: (e && e.message) || String(e) });
  } finally {
    try { if (api && id != null) api.CloseModel(id); } catch (e) { /* redan stängd */ }
  }
};
