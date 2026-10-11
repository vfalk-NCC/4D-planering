/* IFC -> trianglar med ifc-lite (MPL-2.0, Rust/WASM – vendor/ifc-lite/) i en egen modultråd (Victor 2026-10-11:
   "Utvärdera ifc-lite som läsare … med web-ifc som reserv"). Samma meddelanden som ifc-worker.js, så att sidan
   tar emot bitarna på samma sätt:
     In:  { bytes, placement, O, maxTris, chunkTris, ids?: [expressId…], details, rebar, voids, startAt, skipIdx }
          ids: bara de här objekten (t.ex. de som web-ifc hängde sig på eller inte kunde rita).
     Ut:  progress / at / ckpt / skipinfo / chunk / done / error (se ifc-worker.js).
   ifc-lite ger trianglarna i WebGL-axlar (Y uppåt) relativt objektets origo och en förskjutning (rtc) för stora
   koordinater; här blir de modellens meter (Z uppåt) relativt sidans origo O, med normaler som Int8 och färgen
   som byte – precis som från web-ifc-tråden. Hålen (urtag) skärs exakt när urtag är påslagna. */

// Hjälpfunktionerna laddas direkt, men meddelanden tas emot redan nu (inget får tappas medan filen laddas).
const common = import(new URL("ifc-common.js", self.location.href).href + (self.location.search || ""));

let lite = null;
async function load() {
  if (lite) return lite;
  const base = new URL("vendor/ifc-lite/", self.location.href).href;
  const m = await import(base + "ifc-lite.js");
  await m.default({ module_or_path: base + "ifc-lite_bg.wasm" });
  lite = m;
  return m;
}

// Samma urval som ifc-worker.js: rymder, öppningar och rumsliga nivåer har ingen kropp att rita.
const SKIP = new Set(["IFCSPACE", "IFCOPENINGELEMENT", "IFCOPENINGSTANDARDCASE", "IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY", "IFCPROJECT", "IFCANNOTATION", "IFCGRID", "IFCVIRTUALELEMENT"]);
const REBAR = new Set(["IFCREINFORCINGELEMENT", "IFCREINFORCINGBAR", "IFCREINFORCINGMESH", "IFCTENDON", "IFCTENDONANCHOR"]);
const DETAIL = new Set(["IFCFURNISHINGELEMENT", "IFCFURNITURE", "IFCSYSTEMFURNITUREELEMENT", "IFCFASTENER", "IFCMECHANICALFASTENER", "IFCDISCRETEACCESSORY",
  "IFCDISTRIBUTIONELEMENT", "IFCDISTRIBUTIONFLOWELEMENT", "IFCFLOWSEGMENT", "IFCFLOWFITTING", "IFCFLOWTERMINAL", "IFCFLOWCONTROLLER", "IFCFLOWMOVINGDEVICE", "IFCFLOWSTORAGEDEVICE", "IFCFLOWTREATMENTDEVICE", "IFCENERGYCONVERSIONDEVICE",
  "IFCDUCTSEGMENT", "IFCDUCTFITTING", "IFCPIPESEGMENT", "IFCPIPEFITTING", "IFCCABLESEGMENT", "IFCCABLECARRIERSEGMENT", "IFCCABLEFITTING", "IFCCABLECARRIERFITTING", "IFCAIRTERMINAL", "IFCLIGHTFIXTURE", "IFCSANITARYTERMINAL", "IFCVALVE", "IFCPUMP", "IFCFAN"]);
const FIRST = new Set(["IFCSLAB", "IFCWALL", "IFCWALLSTANDARDCASE", "IFCCOLUMN", "IFCBEAM", "IFCROOF", "IFCFOOTING", "IFCPILE", "IFCCURTAINWALL", "IFCSTAIR", "IFCSTAIRFLIGHT", "IFCRAMP", "IFCRAMPFLIGHT"]);

/* Postens typnamn direkt ur filen ("#123= IFCWALL(" vid start). */
function typeAt(u8, start, end) {
  let i = start; const N = Math.min(end || u8.length, start + 200);
  while (i < N && u8[i] !== 61) i++; i++; // förbi "="
  while (i < N && u8[i] === 32) i++;
  let s = "";
  for (; i < N; i++) { const c = u8[i]; if (c === 40 || c === 32) break; s += String.fromCharCode(c >= 97 && c <= 122 ? c - 32 : c); }
  return s;
}

self.onmessage = async ev => {
  const { bytes, placement, O, maxTris = 6e6, chunkTris = 80000, ids = null, details = true, rebar = false, voids = false, startAt = 0, skipIdx = [] } = ev.data || {};
  let api = null;
  try {
    const t0 = Date.now();
    await common;
    const m = await load();
    self.postMessage({ type: "progress", f: 0.02, n: 0 });
    const u8 = new Uint8Array(bytes);
    api = new m.IfcAPI();
    const pre = api.buildPrePassOnce(u8);
    api.setSourceBytes(u8);
    const tOpen = Date.now() - t0;
    self.postMessage({ type: "progress", f: 0.05, n: 0 });
    // Objekten: alla med form utom de som hoppas över – eller bara de begärda (ids). Stommen först.
    const want = ids ? new Set(ids) : null, jobs = pre.jobs, first = [], rest = [], late = [];
    let skipped = 0;
    for (let k = 0; k < pre.totalJobs; k++) {
      const e = jobs[k * 3];
      if (want && !want.has(e)) continue;
      const t = typeAt(u8, jobs[k * 3 + 1], jobs[k * 3 + 2]);
      if (SKIP.has(t)) continue;
      if (!want && REBAR.has(t) && !rebar) { skipped++; continue; }
      if (!want && DETAIL.has(t)) { if (details) late.push(k); else skipped++; continue; }
      (FIRST.has(t) ? first : rest).push(k);
    }
    const order = first.concat(rest, late), mine = order.map(k => jobs[k * 3]);
    const names0 = scanNames(u8, new Set(mine));
    const rtc = pre.rtcOffset || [0, 0, 0], R = [Number(rtc[0]) || 0, Number(rtc[1]) || 0, Number(rtc[2]) || 0];
    const pl = placement || { position: { x: 0, y: 0, z: 0 }, refDirection: { x: 1, y: 0, z: 0 } };
    const rd = pl.refDirection || { x: 1, y: 0, z: 0 }, rl = Math.hypot(rd.x, rd.y) || 1, cs = rd.x / rl, sn = rd.y / rl;
    const P = pl.position || { x: 0, y: 0, z: 0 };
    const ox = P.x / 1000 - O[0], oy = P.y / 1000 - O[1], oz = P.z / 1000 - O[2];
    const noVoid = new Uint32Array(0);
    // Rumsliga block (~40 × 40 m) som i ifc-worker.js.
    const CELL = 40, cells = new Map();
    let tris = 0, capped = false, n = 0, lastPost = 0;
    const cellOf = key => { let c = cells.get(key); if (!c) { c = { pos: grow(Float32Array, 3 * 4096), col: grow(Uint8Array, 3 * 4096), nrm: grow(Int8Array, 3 * 4096), idx: grow(Uint32Array, 3 * 4096), ranges: [], tris: 0 }; cells.set(key, c); } return c; };
    const flushCell = c => {
      if (!c.idx.length) return;
      const msg = { type: "chunk", pos: c.pos.take(), col: c.col.take(), nrm: c.nrm.take(), idx: c.idx.take(), ranges: c.ranges, colV: 2, engine: "ifc-lite" };
      c.ranges = []; c.tris = 0;
      self.postMessage(msg, [msg.pos.buffer, msg.col.buffer, msg.nrm.buffer, msg.idx.buffer]);
    };
    const flush = () => cells.forEach(flushCell);
    let earlyUntil = Date.now() + 6000, lastEarly = Date.now();
    const seen = new Set();
    // Ett objekt kan komma som flera bitar (en per stil/färg): samlas per objekt innan det läggs i ett block.
    const addObject = (e, parts) => {
      let nv = 0, sx = 0, sy = 0, otris = 0;
      parts.forEach(me => { nv += me.positions.length / 3; otris += me.indices.length / 3; });
      if (!nv) return;
      if (tris + otris > maxTris) { capped = true; return; }
      const conv = [];
      parts.forEach(me => {
        const p = me.positions, nr = me.normals, org = me.origin || [0, 0, 0];
        const out = new Float32Array(p.length), on = new Int8Array(p.length);
        for (let k = 0; k < p.length; k += 3) {
          // WebGL Y upp (relativt objektets origo och rtc) -> modellens meter Z upp.
          const X = R[0] + org[0] + p[k], Y = R[1] - (org[2] + p[k + 2]), Z = R[2] + org[1] + p[k + 1];
          const px = cs * X - sn * Y + ox, py = sn * X + cs * Y + oy;
          out[k] = px; out[k + 1] = py; out[k + 2] = Z + oz; sx += px; sy += py;
          if (nr && nr.length === p.length) {
            const nx = nr[k], ny = -nr[k + 2], nz = nr[k + 1], NX = cs * nx - sn * ny, NY = sn * nx + cs * ny, L = Math.hypot(NX, NY, nz) || 1;
            on[k] = Math.round(NX / L * 127); on[k + 1] = Math.round(NY / L * 127); on[k + 2] = Math.round(nz / L * 127);
          }
        }
        conv.push([out, on, me.indices, me.color]);
      });
      tris += otris; n++; seen.add(e);
      const nm = names0.get(e), guid = nm ? nm[0] : null, name = nm ? nm[1] : "";
      const cell = cellOf(Math.floor(sx / nv / CELL) + ":" + Math.floor(sy / nv / CELL));
      const start = cell.pos.length / 3, idxStart = cell.idx.length;
      let baseCol = null;
      conv.forEach(([pos, nrm, idx, col]) => {
        const o = cell.pos.length / 3, r8 = Math.round((col[0] || 0.6) * 255), g8 = Math.round((col[1] || 0.6) * 255), b8 = Math.round((col[2] || 0.6) * 255);
        if (!baseCol) baseCol = [r8 / 255, g8 / 255, b8 / 255];
        for (let k = 0; k < pos.length; k += 3) { cell.pos.push3(pos[k], pos[k + 1], pos[k + 2]); cell.col.push3(r8, g8, b8); cell.nrm.push3(nrm[k], nrm[k + 1], nrm[k + 2]); }
        for (let k = 0; k < idx.length; k++) cell.idx.push(idx[k] + o);
      });
      cell.ranges.push({ start, count: nv, idxStart, idxCount: cell.idx.length - idxStart, guid, name, base: baseCol || [0.85, 0.87, 0.9] });
      cell.tris += otris;
      if (cell.tris > chunkTris) flushCell(cell);
    };
    // Portioner om tio objekt med "at" och kontrollpunkter (samma vakt på sidan som för web-ifc).
    const B = 10, inSkip = i => skipIdx.some(([a, b]) => i >= a && i < b);
    if (skipIdx.length) {
      const list = [];
      skipIdx.forEach(([a, b]) => { for (let j = a; j < b && j < mine.length; j++) { const nm = names0.get(mine[j]); list.push([typeAt(u8, jobs[order[j] * 3 + 1], jobs[order[j] * 3 + 2]), nm ? nm[1] : "", nm ? nm[0] : "", mine[j]]); } });
      self.postMessage({ type: "skipinfo", list });
    }
    self.postMessage({ type: "ckpt", i: startAt });
    let lastCk = Date.now();
    for (let i = startAt; i < order.length && !capped; i += B) {
      if (Date.now() - lastCk > 8000) { flush(); self.postMessage({ type: "ckpt", i }); lastCk = Date.now(); }
      self.postMessage({ type: "at", i });
      const sel = [];
      for (let j = i; j < Math.min(i + B, order.length); j++) if (!inSkip(j)) sel.push(order[j]);
      if (!sel.length) continue;
      const jf = new Uint32Array(sel.length * 3);
      sel.forEach((k, q) => { jf[q * 3] = jobs[k * 3]; jf[q * 3 + 1] = jobs[k * 3 + 1]; jf[q * 3 + 2] = jobs[k * 3 + 2]; });
      const coll = api.processGeometryBatchFromSource(jf, pre.unitScale, R[0], R[1], R[2], pre.needsShift,
        voids ? pre.voidKeys : noVoid, voids ? pre.voidCounts : noVoid, voids ? pre.voidValues : noVoid, pre.styleIds, pre.styleColors, pre.planeAngleToRadians);
      const by = new Map();
      for (let q = 0; q < coll.length; q++) {
        const me = coll.get(q);
        const rec = { positions: me.positions, normals: me.normals, indices: me.indices, color: me.color, origin: me.origin };
        const e = me.expressId; if (!by.has(e)) by.set(e, []); by.get(e).push(rec);
        me.free();
      }
      coll.free();
      by.forEach((parts, e) => addObject(e, parts));
      const now = Date.now();
      if (now < earlyUntil && now - lastEarly > 1500) { lastEarly = now; flush(); }
      if (now - lastPost > 250) { lastPost = now; self.postMessage({ type: "progress", f: order.length ? Math.min(0.99, 0.05 + 0.95 * i / order.length) : 0.5, n }); }
    }
    flush();
    // Objekt med form som inte gav några trianglar: per klass (och id:n för ett nytt försök).
    const missing = {}, missingIds = [];
    if (!capped) order.forEach((k, i) => { const e = jobs[k * 3]; if (i >= startAt && !seen.has(e) && !inSkip(i)) { const t = typeAt(u8, jobs[k * 3 + 1], jobs[k * 3 + 2]); missing[t] = (missing[t] || 0) + 1; if (missingIds.length < 5000) missingIds.push(e); } });
    self.postMessage({ type: "done", tris, capped, products: n, skipped, missing, missingIds, engine: "ifc-lite", ms: { open: tOpen, geo: Date.now() - t0 - tOpen } });
  } catch (e) {
    self.postMessage({ type: "error", message: (e && e.message) || String(e) });
  } finally {
    try { if (api) { api.clearPrePassCache && api.clearPrePassCache(); api.free(); } } catch (e) { /* redan fri */ }
  }
};
