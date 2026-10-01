/* Lägesplan – CAD-underlag från DXF (Victors önskemål 2026-09-29).
   DXF-filen (exporterad från DWG) läses i webbläsaren och görs om till
   linjer och texter i modellens koordinater (samma system som modellen och
   ortofotona, t.ex. SWEREF), så den hamnar rätt utan kalibrering. Varje
   CAD-lager kan tändas/släckas. Geometrin sparas komprimerad i 4D-data
   (site_layers/<id>.cad.gz) och posten { type: "cad" } i site_layers.json. */

// ---------------------------------------------------------------------
// DXF-läsare
// ---------------------------------------------------------------------
/* AutoCAD Color Index -> #rrggbb (ungefärlig standardpalett). */
function aciColor(i) {
  const base = { 1: "#ff0000", 2: "#ffff00", 3: "#00ff00", 4: "#00ffff", 5: "#0000ff", 6: "#ff00ff", 7: "#000000", 8: "#808080", 9: "#c0c0c0" };
  if (base[i]) return base[i];
  if (i >= 250 && i <= 255) { const v = Math.round(51 + (i - 250) * 40.8); return "#" + [v, v, v].map(x => x.toString(16).padStart(2, "0")).join(""); }
  if (i < 10 || i > 249) return "#000000";
  const h = Math.floor((i - 10) / 10) * 15, r = (i - 10) % 10;
  const val = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3][r], sat = r % 2 ? 0.5 : 1;
  const c = val * sat, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = val - c;
  const [R, G, B] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + [R, G, B].map(v => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
}
const trueColor = v => "#" + (v & 0xffffff).toString(16).padStart(6, "0");

function decodeDxfText(buf) {
  let t = new TextDecoder("utf-8").decode(buf);
  if (t.includes("�")) t = new TextDecoder("windows-1252").decode(buf);
  return t;
}
function cleanDxfString(s) {
  return String(s || "")
    .replace(/\\U\+([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/%%[cC]/g, "Ø").replace(/%%[dD]/g, "°").replace(/%%[pP]/g, "±").replace(/%%[uUoO]/g, "");
}
function cleanMText(s) {
  return cleanDxfString(s)
    .replace(/\\P/g, "\n").replace(/\\~/g, " ")
    .replace(/\\[ACcFfHhQTWp][^;\\]*;/g, "").replace(/\\S([^;]*);/g, (_, x) => x.replace(/[#^]/, "/"))
    .replace(/\\[LlOoKk]/g, "").replace(/[{}]/g, "").replace(/\\\\/g, "\\");
}

/* Läser DXF-texten till { layers: {namn: {color}}, blocks, entities, units }. */
function parseDxf(text) {
  const lines = text.split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([parseInt(lines[i], 10), lines[i + 1]]);
  let i = 0;
  const layers = {}, blocks = {}, header = {};
  const entities = [];
  const readEntity = () => { // pairs[i] = [0, TYP]
    const e = { type: pairs[i][1].trim(), g: [] };
    i++;
    while (i < pairs.length && pairs[i][0] !== 0) { e.g.push(pairs[i]); i++; }
    return e;
  };
  let section = null, curBlock = null, polyline = null;
  const push = e => {
    const list = curBlock ? curBlock.ents : entities;
    if (e.type === "POLYLINE") { polyline = e; e.verts = []; list.push(e); return; }
    if (e.type === "VERTEX" && polyline) { polyline.verts.push(e); return; }
    if (e.type === "SEQEND") { polyline = null; return; }
    // Attribut (ATTRIB) efter INSERT visas som text.
    list.push(e);
  };
  while (i < pairs.length) {
    const [c, v] = pairs[i];
    if (c !== 0) { i++; continue; }
    const t = v.trim();
    if (t === "SECTION") { i++; section = pairs[i] && pairs[i][1].trim(); i++; continue; }
    if (t === "ENDSEC") { section = null; i++; continue; }
    if (t === "EOF") break;
    if (section === "HEADER") { i++; continue; }
    if (section === "TABLES" && t === "LAYER") {
      const e = readEntity();
      const name = (e.g.find(p => p[0] === 2) || [])[1];
      if (name != null) {
        const col = parseInt((e.g.find(p => p[0] === 62) || [0, "7"])[1], 10);
        const tc = e.g.find(p => p[0] === 420);
        layers[name.trim()] = { color: tc ? trueColor(parseInt(tc[1], 10)) : aciColor(Math.abs(col) || 7), off: col < 0 };
      }
      continue;
    }
    if (section === "BLOCKS") {
      if (t === "BLOCK") {
        const e = readEntity();
        const name = (e.g.find(p => p[0] === 2) || [0, ""])[1].trim();
        const bx = parseFloat((e.g.find(p => p[0] === 10) || [0, 0])[1]) || 0, by = parseFloat((e.g.find(p => p[0] === 20) || [0, 0])[1]) || 0;
        curBlock = { name, base: [bx, by], ents: [] };
        blocks[name] = curBlock;
        continue;
      }
      if (t === "ENDBLK") { curBlock = null; i++; while (i < pairs.length && pairs[i][0] !== 0) i++; continue; }
      if (curBlock) { push(readEntity()); continue; }
      i++; continue;
    }
    if (section === "ENTITIES") { push(readEntity()); continue; }
    i++;
  }
  // Enheter ur headern ($INSUNITS)
  const hi = pairs.findIndex(p => p[0] === 9 && p[1].trim() === "$INSUNITS");
  if (hi >= 0 && pairs[hi + 1]) header.insunits = parseInt(pairs[hi + 1][1], 10);
  return { layers, blocks, entities, header };
}

/* Gör om entiteterna till polylinjer och texter i ritningens koordinater. */
function dxfToGeometry(dxf) {
  const out = []; // { layer, color, pts: [x,y,...], closed } | { layer, color, text, x, y, h, rot, align }
  const get = (e, code, def) => { const p = e.g.find(q => q[0] === code); return p ? p[1] : def; };
  const num = (e, code, def = 0) => { const v = parseFloat(get(e, code, def)); return Number.isFinite(v) ? v : def; };
  const all = (e, code) => e.g.filter(q => q[0] === code).map(q => parseFloat(q[1]));
  const colorOf = (e, layer, inherit) => {
    const tc = get(e, 420, null);
    if (tc != null) return trueColor(parseInt(tc, 10));
    const c = parseInt(get(e, 62, "256"), 10);
    if (c === 256) return (dxf.layers[layer] || {}).color || "#000000";
    if (c === 0) return inherit || "#000000";
    return aciColor(Math.abs(c));
  };
  const arcPts = (cx, cy, r, a0, a1, T) => { // grader, moturs
    let span = a1 - a0; while (span <= 0) span += 360;
    const n = Math.max(8, Math.ceil(span / 6));
    const p = [];
    for (let k = 0; k <= n; k++) { const a = (a0 + span * k / n) * Math.PI / 180; p.push(...T(cx + r * Math.cos(a), cy + r * Math.sin(a))); }
    return p;
  };
  // Båge mellan två punkter (bulge = tan(vinkel/4), positiv = moturs).
  const bulgeSeg = (x1, y1, x2, y2, b, T, p) => {
    if (!b || (x1 === x2 && y1 === y2)) { p.push(...T(x2, y2)); return; }
    const th = 4 * Math.atan(b), c = (1 / b - b) / 2;
    const cx = (x1 + x2) / 2 - c * (y2 - y1) / 2, cy = (y1 + y2) / 2 + c * (x2 - x1) / 2;
    const r = Math.hypot(x1 - cx, y1 - cy), a0 = Math.atan2(y1 - cy, x1 - cx);
    const n = Math.max(4, Math.ceil(Math.abs(th) / (Math.PI / 30)));
    for (let k = 1; k <= n; k++) { const a = a0 + th * k / n; p.push(...T(cx + r * Math.cos(a), cy + r * Math.sin(a))); }
  };
  const bspline = (ctrl, deg, knots, T) => {
    const n = ctrl.length - 1;
    if (n < deg || knots.length !== n + deg + 2) return ctrl.flatMap(q => T(q[0], q[1]));
    const p = [], lo = knots[deg], hi = knots[n + 1], steps = Math.max(16, ctrl.length * 8);
    for (let s = 0; s <= steps; s++) {
      const u = lo + (hi - lo) * s / steps - (s === steps ? 1e-9 : 0);
      let k = deg; while (k < n && knots[k + 1] <= u) k++;
      const d = [];
      for (let j = 0; j <= deg; j++) d[j] = ctrl[j + k - deg].slice();
      for (let r = 1; r <= deg; r++) for (let j = deg; j >= r; j--) {
        const den = knots[j + 1 + k - r] - knots[j + k - deg];
        const a = den ? (u - knots[j + k - deg]) / den : 0;
        d[j] = [(1 - a) * d[j - 1][0] + a * d[j][0], (1 - a) * d[j - 1][1] + a * d[j][1]];
      }
      p.push(...T(d[deg][0], d[deg][1]));
    }
    return p;
  };
  const walk = (ents, M, inhLayer, inhColor, depth) => {
    if (depth > 8) return;
    const T = (x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
    const scaleM = Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) || 1;
    for (const e of ents) {
      let layer = (get(e, 8, "0") || "0").trim();
      if (layer === "0" && inhLayer) layer = inhLayer;
      const color = colorOf(e, layer, inhColor);
      // OCS spegling (extrusion 0,0,-1)
      const mir = num(e, 230, 1) < 0 ? -1 : 1;
      const line = (pts, closed) => { if (pts.length >= 4) out.push({ layer, color, pts, closed }); };
      switch (e.type) {
        case "LINE": line([...T(num(e, 10), num(e, 20)), ...T(num(e, 11), num(e, 21))]); break;
        case "LWPOLYLINE": {
          const xs = all(e, 10), ys = all(e, 20);
          const bul = []; let vi = -1;
          e.g.forEach(q => { if (q[0] === 10) { vi++; bul[vi] = 0; } else if (q[0] === 42 && vi >= 0) bul[vi] = parseFloat(q[1]) || 0; });
          const closed = (parseInt(get(e, 70, "0"), 10) & 1) === 1;
          const V = xs.map((x, k) => [x * mir, ys[k]]);
          if (!V.length) break;
          const p = T(V[0][0], V[0][1]);
          const segs = closed ? V.length : V.length - 1;
          for (let k = 0; k < segs; k++) { const a = V[k], b = V[(k + 1) % V.length]; bulgeSeg(a[0], a[1], b[0], b[1], bul[k] * mir, T, p); }
          line(p, closed);
          break;
        }
        case "POLYLINE": {
          const flags = parseInt(get(e, 70, "0"), 10);
          if (flags & 16 || flags & 64) break; // nät
          const V = (e.verts || []).map(v => [num(v, 10) * mir, num(v, 20), num(v, 42) * mir]);
          if (!V.length) break;
          const closed = (flags & 1) === 1;
          const p = T(V[0][0], V[0][1]);
          const segs = closed ? V.length : V.length - 1;
          for (let k = 0; k < segs; k++) { const a = V[k], b = V[(k + 1) % V.length]; bulgeSeg(a[0], a[1], b[0], b[1], a[2], T, p); }
          line(p, closed);
          break;
        }
        case "CIRCLE": line(arcPts(num(e, 10) * mir, num(e, 20), num(e, 40), 0, 360, T), true); break;
        case "ARC": {
          let a0 = num(e, 50), a1 = num(e, 51);
          if (mir < 0) { [a0, a1] = [180 - a1, 180 - a0]; }
          line(arcPts(num(e, 10) * mir, num(e, 20), num(e, 40), a0, a1, T));
          break;
        }
        case "ELLIPSE": {
          const cx = num(e, 10), cy = num(e, 20), mx = num(e, 11), my = num(e, 21), ratio = num(e, 40, 1);
          let t0 = num(e, 41, 0), t1 = num(e, 42, Math.PI * 2); if (t1 <= t0) t1 += Math.PI * 2;
          const n = Math.max(16, Math.ceil((t1 - t0) / (Math.PI / 36)));
          const p = [];
          for (let k = 0; k <= n; k++) { const t = t0 + (t1 - t0) * k / n; p.push(...T(cx + mx * Math.cos(t) - my * ratio * Math.sin(t), cy + my * Math.cos(t) + mx * ratio * Math.sin(t))); }
          line(p);
          break;
        }
        case "SPLINE": {
          const fx = all(e, 11), fy = all(e, 21);
          if (fx.length >= 2) { line(fx.flatMap((x, k) => T(x, fy[k]))); break; }
          const cx = all(e, 10), cy = all(e, 20);
          line(bspline(cx.map((x, k) => [x, cy[k]]), parseInt(get(e, 71, "3"), 10), all(e, 40), T));
          break;
        }
        case "LEADER": { const xs = all(e, 10), ys = all(e, 20); line(xs.flatMap((x, k) => T(x, ys[k]))); break; }
        case "SOLID": case "TRACE": case "3DFACE": {
          const q = [[num(e, 10), num(e, 20)], [num(e, 11), num(e, 21)], [num(e, 13, num(e, 12)), num(e, 23, num(e, 22))], [num(e, 12), num(e, 22)]];
          line(q.flatMap(v => T(v[0], v[1])), true);
          break;
        }
        case "TEXT": case "ATTRIB": case "MTEXT": {
          const isM = e.type === "MTEXT";
          let str = isM ? cleanMText(e.g.filter(q => q[0] === 3).map(q => q[1]).join("") + get(e, 1, "")) : cleanDxfString(get(e, 1, ""));
          if (!str.trim()) break;
          const h = num(e, 40, 1) * scaleM;
          let x = num(e, 10), y = num(e, 20), rot = num(e, 50);
          let align = "left", valign = "base";
          if (isM) {
            if (get(e, 11, null) != null) rot = Math.atan2(num(e, 21), num(e, 11)) * 180 / Math.PI;
            const ap = parseInt(get(e, 71, "1"), 10);
            align = ["left", "center", "right"][(ap - 1) % 3];
            valign = ["top", "middle", "bottom"][Math.floor((ap - 1) / 3)];
          } else {
            const ha = parseInt(get(e, 72, "0"), 10), va = parseInt(get(e, 73, "0"), 10);
            if ((ha || va) && get(e, 11, null) != null) { x = num(e, 11); y = num(e, 21); }
            align = ha === 1 || ha === 4 ? "center" : ha === 2 ? "right" : "left";
            valign = ha === 4 || va === 2 ? "middle" : va === 3 ? "top" : va === 1 ? "bottom" : "base";
          }
          const [px, py] = T(x * mir, y);
          const d = [M[0] * Math.cos(rot * Math.PI / 180) + M[2] * Math.sin(rot * Math.PI / 180), M[1] * Math.cos(rot * Math.PI / 180) + M[3] * Math.sin(rot * Math.PI / 180)];
          out.push({ layer, color, text: str, x: px, y: py, h, rot: Math.atan2(d[1], d[0]) * 180 / Math.PI, align, valign });
          break;
        }
        case "INSERT": case "DIMENSION": {
          const b = dxf.blocks[(get(e, 2, "") || "").trim()];
          if (!b) break;
          if (e.type === "DIMENSION") { walk(b.ents, M, layer, color, depth + 1); break; }
          const sx = num(e, 41, 1) * mir, sy = num(e, 42, 1), r = num(e, 50) * Math.PI / 180;
          const ix = num(e, 10) * mir, iy = num(e, 20);
          const cols = Math.max(1, parseInt(get(e, 70, "1"), 10)), rows = Math.max(1, parseInt(get(e, 71, "1"), 10));
          const cs = num(e, 44), rs = num(e, 45);
          for (let ci = 0; ci < Math.min(cols, 50); ci++) for (let ri = 0; ri < Math.min(rows, 50); ri++) {
            const ox = ci * cs, oy = ri * rs;
            // blockets punkt -> skala -> rotera -> flytta (+ rutnät)
            const L = [Math.cos(r) * sx, Math.sin(r) * sx, -Math.sin(r) * sy, Math.cos(r) * sy, 0, 0];
            L[4] = ix + Math.cos(r) * ox - Math.sin(r) * oy - (L[0] * b.base[0] + L[2] * b.base[1]);
            L[5] = iy + Math.sin(r) * ox + Math.cos(r) * oy - (L[1] * b.base[0] + L[3] * b.base[1]);
            walk(b.ents, mulAffine(M, L), layer, color, depth + 1);
          }
          break;
        }
      }
    }
  };
  walk(dxf.entities, [1, 0, 0, 1, 0, 0], null, null, 0);
  return out;
}

// ---------------------------------------------------------------------
// Import och lagring
// ---------------------------------------------------------------------
const cads = () => siteItems.filter(x => x.type === "cad");
const cadGeom = new Map(); // id -> { origin, groups: [{ l, c, path: Path2D, segs, texts }] }
/* Enheter att pröva/välja: meter per ritningsenhet. */
const CAD_UNITS = [{ f: 1, n: "meter" }, { f: 0.1, n: "decimeter" }, { f: 0.01, n: "centimeter" }, { f: 0.001, n: "millimeter" }, { f: 0.0254, n: "tum" }, { f: 0.3048, n: "fot" }];
const unitName = f => (CAD_UNITS.find(u => Math.abs(u.f - f) < 1e-12) || { n: f + " m" }).n;
const INSUNITS_M = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1, 14: 0.1 };

/* Flera filer i taget: läses och laddas upp en i taget. */
async function addDxfFiles(files) {
  const list = files.filter(f => /\.dxf$/i.test(f.name));
  const skipped = files.length - list.length;
  if (!list.length) { alert("Välj en eller flera DXF-filer. En DWG sparas som DXF i AutoCAD (Spara som → DXF) eller med ODA File Converter."); return; }
  if (!plan || !plan.calib) { alert("Kalibrera planen mot 3D (📐) först – CAD-ritningen placeras via modellens koordinater."); return; }
  const done = [];
  for (let i = 0; i < list.length; i++) {
    cadBatch = list.length > 1 ? `${i + 1}/${list.length} ` : "";
    if (await addDxfFile(list[i])) done.push(list[i].name);
  }
  cadBatch = "";
  if (list.length > 1 || skipped) setSaveStatus(`📐 ${done.length} av ${list.length} DXF-filer inlagda${skipped ? ` (${skipped} filer var inte DXF och hoppades över)` : ""}.`);
}
let cadBatch = "";
async function addDxfFile(file) {
  if (!plan || !plan.calib) { alert("Kalibrera planen mot 3D (📐) först – CAD-ritningen placeras via modellens koordinater."); return false; }
  setBusy(`${cadBatch}Läser ${file.name}…`);
  try {
    const buf = await file.arrayBuffer();
    if (new TextDecoder().decode(buf.slice(0, 22)).startsWith("AutoCAD Binary DXF")) throw new Error("Binär DXF stöds inte – spara som ASCII-DXF.");
    await new Promise(r => setTimeout(r, 20));
    const dxf = parseDxf(decodeDxfText(buf));
    setBusy(`${cadBatch}Tolkar ${file.name}…`);
    await new Promise(r => setTimeout(r, 20));
    const geo = dxfToGeometry(dxf);
    if (!geo.length) throw new Error("Hittade inga linjer eller texter i filen.");
    // Enheter: $INSUNITS, annars den skala som lägger ritningen närmast planen.
    const pts = geo.filter(g => g.pts).slice(0, 5000).flatMap(g => [[g.pts[0], g.pts[1]]]);
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const m1 = plan.calib.model[0];
    // Extra test: filhuvudet anger ofta meter fast koordinaterna är i mm.
    // Om filens enhet lägger ritningen långt från planen men en annan skala
    // (mm/cm/dm) lägger den på plats används den i stället.
    const distOf = f => Math.hypot(cx * f - m1[0], cy * f - m1[1]);
    const best = CAD_UNITS.map(u => u.f).sort((a, b) => distOf(a) - distOf(b))[0];
    const declared = INSUNITS_M[dxf.header.insunits];
    let factor = declared || best, unitNote = "";
    if (declared && best !== declared && distOf(declared) > 2000 && distOf(best) < distOf(declared) / 20) {
      factor = best;
      unitNote = `Filen anger ${unitName(declared)} men hamnade ${Math.round(distOf(declared) / 1000)} km bort – tolkas som ${unitName(best)}.`;
    } else if (!declared) unitNote = `Ingen enhet i filen – tolkas som ${unitName(best)}.`;
    const dist = distOf(factor);
    if (dist > 20000 && !confirm(`${file.name}: CAD-ritningen ligger ${Math.round(dist / 1000)} km från planens kalibreringspunkter. Ligger den verkligen i samma koordinatsystem som modellen? Lägg till ändå?`)) return false;
    // Kompakt lagring: mm-heltal relativt ett origo.
    const origin = [Math.round(cx * factor), Math.round(cy * factor)];
    const q = v => Math.round(v * factor * 1000);
    const ox = origin[0] * 1000, oy = origin[1] * 1000;
    const layerNames = [...new Set(geo.map(g => g.layer))].sort((a, b) => a.localeCompare(b, "sv"));
    const byKey = new Map();
    geo.forEach(g => {
      const k = layerNames.indexOf(g.layer) + "|" + g.color;
      if (!byKey.has(k)) byKey.set(k, { l: layerNames.indexOf(g.layer), c: g.color, p: [], t: [] });
      const grp = byKey.get(k);
      if (g.pts) {
        const a = [];
        for (let j = 0; j < g.pts.length; j += 2) a.push(q(g.pts[j]) - ox, q(g.pts[j + 1]) - oy);
        if (g.closed) a.push(a[0], a[1]);
        grp.p.push(a);
      } else grp.t.push([q(g.x) - ox, q(g.y) - oy, Math.round(g.h * factor * 1000), Math.round(g.rot * 10) / 10, g.text, g.align[0] + g.valign[0]]);
    });
    const data = { v: 1, origin, groups: [...byKey.values()] };
    setBusy(`${cadBatch}Laddar upp ${file.name}…`);
    await loadScript(PAKO_URL);
    const gz = pako.gzip(JSON.stringify(data));
    const id = ghNewId();
    const path = dataPath(`site_layers/${id}.cad.gz`);
    await ghUploadBinary(token, path, new Blob([gz], { type: "application/gzip" }), `Lägesplan: CAD ${file.name}`);
    const counts = {};
    geo.forEach(g => { counts[g.layer] = (counts[g.layer] || 0) + 1; });
    const rec = { id, type: "cad", name: file.name.replace(/\.dxf$/i, ""), path, factor, origin, unitNote: unitNote || null,
      layers: layerNames.map(n => ({ name: n, color: (dxf.layers[n] || {}).color || "#000000", n: counts[n], off: !!(dxf.layers[n] || {}).off })),
      stats: { lines: geo.filter(g => g.pts).length, texts: geo.filter(g => g.text).length, kb: Math.round(gz.length / 1024) },
      colorMode: "orig", color: "#1d4ed8", weight: 1, created_at: new Date().toISOString(), by: settings.userName || null };
    rec.layers.forEach(l => { if (l.off) ls(`cadl:${id}:${l.name}`).visible = false; });
    ls("cad:" + id).visible = true; saveLayerState();
    cadGeom.set(id, buildCadGeom(data));
    await saveSiteItem(rec, false, { record: false });
    buildCadSnap(); renderCad();
    setSaveStatus(`📐 ${rec.name}: ${rec.stats.lines} linjer, ${rec.stats.texts} texter i ${rec.layers.length} lager.${unitNote ? " " + unitNote : ""}`);
    if ($("cadToTc").checked) {
      if (!window.opener || window.opener.closed) setSaveStatus("⚠ Originalet kunde inte sparas i Trimble Connect – öppna lägesplanen via 🗺️ i 4D-planering.");
      else askOpener("tcUpload", { folder: "Lägesplan", files: [file] }, 10 * 60 * 1000)
        .then(r => setSaveStatus(`☁ ${file.name} sparad i Trimble Connect (${r.folder || "Lägesplan"}).`))
        .catch(e => setSaveStatus("⚠ Kunde inte spara i Trimble Connect: " + e.message));
    }
    return true;
  } catch (e) {
    alert(`Kunde inte läsa ${file.name}: ` + e.message);
    return false;
  } finally {
    setBusy("");
  }
}
function buildCadGeom(data) {
  return {
    origin: data.origin,
    groups: data.groups.map(g => {
      const path = new Path2D();
      let segs = 0;
      g.p.forEach(a => { path.moveTo(a[0], a[1]); for (let j = 2; j < a.length; j += 2) path.lineTo(a[j], a[j + 1]); segs += a.length / 2 - 1; });
      return { l: g.l, c: g.c, path, raw: g.p, texts: g.t, segs };
    }),
  };
}
const cadLoading = new Map();
async function ensureCadGeom(rec) {
  if (cadGeom.has(rec.id)) return cadGeom.get(rec.id);
  if (!cadLoading.has(rec.id)) cadLoading.set(rec.id, (async () => {
    await loadScript(PAKO_URL);
    const url = await ghReadBinaryUrl(token, rec.path);
    const buf = await (await fetch(url)).arrayBuffer();
    URL.revokeObjectURL(url);
    const g = buildCadGeom(JSON.parse(pako.ungzip(new Uint8Array(buf), { to: "string" })));
    cadGeom.set(rec.id, g);
    return g;
  })().finally(() => cadLoading.delete(rec.id)));
  return cadLoading.get(rec.id);
}
/* Skala om en inlagd ritning till en annan enhet (t.ex. om den hamnat fel
   för att filen var i mm). Geometrin räknas om och sparas på nytt. */
async function rescaleCad(rec, newFactor) {
  const k = newFactor / (rec.factor || 1);
  if (!Number.isFinite(k) || Math.abs(k - 1) < 1e-9) return;
  setBusy(`Skalar om ${rec.name} till ${unitName(newFactor)}…`);
  try {
    const g = await ensureCadGeom(rec);
    const o = g.origin, no = [Math.round(o[0] * k), Math.round(o[1] * k)];
    // mm-heltal relativt origo: ny = (origo·1000 + gammal)·k − nytt origo·1000
    const tx = v => Math.round((o[0] * 1000 + v) * k - no[0] * 1000), ty = v => Math.round((o[1] * 1000 + v) * k - no[1] * 1000);
    const data = { v: 1, origin: no, groups: g.groups.map(gr => ({
      l: gr.l, c: gr.c,
      p: gr.raw.map(a => a.map((v, i) => i % 2 ? ty(v) : tx(v))),
      t: gr.texts.map(([x, y, h, rot, str, al]) => [tx(x), ty(y), Math.round(h * k), rot, str, al]),
    })) };
    const m1 = plan && plan.calib ? plan.calib.model[0] : null;
    const dist = m1 ? Math.hypot(no[0] - m1[0], no[1] - m1[1]) : 0;
    if (dist > 20000 && !confirm(`Med ${unitName(newFactor)} hamnar ritningen ${Math.round(dist / 1000)} km från planen. Skala om ändå?`)) { renderCadSettings(); return; }
    await loadScript(PAKO_URL);
    const gz = pako.gzip(JSON.stringify(data));
    await ghUploadBinary(token, rec.path, new Blob([gz], { type: "application/gzip" }), `Lägesplan: CAD ${rec.name} i ${unitName(newFactor)}`);
    cadGeom.set(rec.id, buildCadGeom(data));
    await saveSiteItem({ ...rec, factor: newFactor, origin: no, unitNote: `Omskalad till ${unitName(newFactor)}.`, stats: { ...rec.stats, kb: Math.round(gz.length / 1024) } }, false, { record: false });
    buildCadSnap(); renderCad();
    setSaveStatus(`📐 ${rec.name} är omskalad till ${unitName(newFactor)}.`);
  } catch (e) {
    alert("Kunde inte skala om ritningen: " + e.message);
    renderCadSettings();
  } finally { setBusy(""); }
}
async function deleteCad(rec) {
  if (!confirm(`Ta bort CAD-ritningen "${rec.name}" från lägesplanen?`)) return;
  cadGeom.delete(rec.id);
  await saveSiteItem(rec, true, { record: false });
  ghDeleteBinary(token, rec.path, "Lägesplan: ta bort CAD");
  buildCadSnap(); renderCad();
}

// ---------------------------------------------------------------------
// Rita
// ---------------------------------------------------------------------
const cadLayerOn = (rec, name) => ls(`cadl:${rec.id}:${name}`).visible;
/* Ritar alla tända CAD-ritningar. stageToCanvas = [a,b,c,d,e,f] från stage-px till ctx. */
function drawCad(ctx, stageToCanvas, pxScale = 1) {
  if (!plan || !plan.calib) return;
  const o0 = mToPx([0, 0]), ex = mToPx([1, 0]), ey = mToPx([0, 1]);
  const M = [ex[0] - o0[0], ex[1] - o0[1], ey[0] - o0[0], ey[1] - o0[1], o0[0], o0[1]]; // modell (m) -> stage-px
  cads().filter(r => ls("cad:" + r.id).visible && cadGeom.has(r.id)).forEach(r => {
    const g = cadGeom.get(r.id);
    const G = mulAffine(stageToCanvas, mulAffine(M, [0.001, 0, 0, 0.001, g.origin[0], g.origin[1]]));
    const s = Math.hypot(G[0], G[1]);
    ctx.save();
    ctx.globalAlpha = layerOpacity("cad:" + r.id);
    ctx.setTransform(...G);
    ctx.lineWidth = Math.max(0.6, (Number(r.weight) || 1)) * pxScale / s;
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    const mono = r.colorMode === "mono" ? r.color : null;
    const names = r.layers.map(l => l.name);
    g.groups.forEach(gr => {
      if (!cadLayerOn(r, names[gr.l])) return;
      ctx.strokeStyle = mono || (gr.c === "#000000" || gr.c === "#ffffff" ? "#111827" : gr.c);
      ctx.stroke(gr.path);
    });
    // Texter (hoppar över de som blir oläsligt små)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    g.groups.forEach(gr => {
      if (!gr.texts.length || !cadLayerOn(r, names[gr.l])) return;
      ctx.fillStyle = mono || (gr.c === "#000000" || gr.c === "#ffffff" ? "#111827" : gr.c);
      gr.texts.forEach(([x, y, h, rot, str, al]) => {
        const hp = h * s;
        if (hp < 3 * pxScale) return;
        const [px, py] = applyAffine(G, [x, y]);
        // Rotation: modellens vinkel genom transformen (y-axeln vänds).
        const a = rot * Math.PI / 180;
        const d = [G[0] * Math.cos(a) + G[2] * Math.sin(a), G[1] * Math.cos(a) + G[3] * Math.sin(a)];
        ctx.save();
        ctx.translate(px, py); ctx.rotate(Math.atan2(d[1], d[0]));
        ctx.font = `${hp}px "Segoe UI", Arial, sans-serif`;
        ctx.textAlign = al[0] === "c" ? "center" : al[0] === "r" ? "right" : "left";
        ctx.textBaseline = { t: "top", m: "middle", b: "bottom" }[al[1]] || "alphabetic";
        const lines = String(str).split("\n");
        lines.forEach((ln, k) => ctx.fillText(ln, 0, k * hp * 1.25));
        ctx.restore();
      });
    });
    ctx.restore();
  });
}
/* Vad som ska ritas som vektorer i PDF-utskriften: de tända CAD-ritningarna
   och lagren just nu (anropas medan ritningsytans lagerval är aktivt). */
function cadVectorPlan() {
  if (!plan || !plan.calib) return [];
  return cads().filter(r => ls("cad:" + r.id).visible && cadGeom.has(r.id)).map(r => {
    const g = cadGeom.get(r.id), names = r.layers.map(l => l.name);
    const mono = r.colorMode === "mono" ? r.color : null;
    return { rec: r, g, opacity: layerOpacity("cad:" + r.id), weight: Number(r.weight) || 1,
      groups: g.groups.filter(gr => cadLayerOn(r, names[gr.l])).map(gr => ({ gr, color: mono || (gr.c === "#000000" || gr.c === "#ffffff" ? "#111827" : gr.c) })) };
  });
}
/* Ritar CAD-planen som vektorer i en jsPDF-sida. stageToPage: stage-px -> mm
   på sidan; clip = [x, y, w, h] (ritningsramen); lwPerWeight = linjebredd i
   mm per viktenhet (samma tjocklek som i bilden). */
function drawCadVectorsToPdf(doc, list, stageToPage, clip, lwPerWeight, ptMm) {
  if (!list.length) return;
  const o0 = mToPx([0, 0]), ex = mToPx([1, 0]), ey = mToPx([0, 1]);
  const M = [ex[0] - o0[0], ex[1] - o0[1], ey[0] - o0[0], ey[1] - o0[1], o0[0], o0[1]];
  const [cx, cy, cw, ch] = clip;
  doc.saveGraphicsState();
  doc.rect(cx, cy, cw, ch, null); doc.clip(); doc.discardPath();
  list.forEach(({ g, opacity, weight, groups }) => {
    const G = mulAffine(stageToPage, mulAffine(M, [0.001, 0, 0, 0.001, g.origin[0], g.origin[1]]));
    const s = Math.hypot(G[0], G[1]);
    doc.saveGraphicsState();
    if (opacity < 1 && doc.GState) doc.setGState(new doc.GState({ opacity, "stroke-opacity": opacity }));
    doc.setLineWidth(Math.max(0.6, weight) * lwPerWeight);
    doc.setLineCap("round"); doc.setLineJoin("round");
    groups.forEach(({ gr, color }) => {
      doc.setDrawColor(color);
      (gr.raw || []).forEach(a => {
        if (a.length < 4) return;
        const pts = [];
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (let i = 0; i + 1 < a.length; i += 2) {
          const p = applyAffine(G, [a[i], a[i + 1]]);
          pts.push(p);
          if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
        }
        if (x1 < cx || x0 > cx + cw || y1 < cy || y0 > cy + ch) return; // utanför ramen
        const d = [];
        for (let i = 1; i < pts.length; i++) d.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
        doc.lines(d, pts[0][0], pts[0][1], [1, 1], "S", false);
      });
    });
    // Texter som riktig text (skarp och sökbar)
    groups.forEach(({ gr, color }) => {
      if (!gr.texts || !gr.texts.length) return;
      doc.setTextColor(color);
      gr.texts.forEach(([x, y, h, rot, str, al]) => {
        const hp = h * s;
        if (hp < 0.6) return;
        const [px, py] = applyAffine(G, [x, y]);
        if (px < cx - 50 || px > cx + cw + 50 || py < cy - 50 || py > cy + ch + 50) return;
        const a = rot * Math.PI / 180;
        const dv = [G[0] * Math.cos(a) + G[2] * Math.sin(a), G[1] * Math.cos(a) + G[3] * Math.sin(a)];
        const angle = -Math.atan2(dv[1], dv[0]) * 180 / Math.PI;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(hp / ptMm);
        const align = al[0] === "c" ? "center" : al[0] === "r" ? "right" : "left";
        const baseline = { t: "top", m: "middle", b: "bottom" }[al[1]] || "alphabetic";
        String(str).split("\n").forEach((ln, k) => {
          const off = k * hp * 1.25, ox = -Math.sin(-angle * Math.PI / 180) * off, oy = Math.cos(-angle * Math.PI / 180) * off;
          doc.text(ln, px + ox, py + oy, { angle, align, baseline });
        });
      });
    });
    doc.restoreGraphicsState();
  });
  doc.restoreGraphicsState();
}
let cadTimer = 0, cadSeq = 0;
function scheduleCadRender() { clearTimeout(cadTimer); cadTimer = setTimeout(renderCad, 60); }
async function renderCad() {
  const c = $("cadCanvas");
  if (!c) return;
  const seq = ++cadSeq;
  const list = (plan && plan.calib && viewport) ? cads().filter(r => ls("cad:" + r.id).visible) : [];
  for (const r of list) { try { await ensureCadGeom(r); } catch (e) { console.warn("Kunde inte hämta CAD", r.name, e); } }
  if (seq !== cadSeq) return;
  if (list.some(r => cadGeom.has(r.id)) && !cadSnapIndex) buildCadSnap();
  if (!list.length) { c.width = 0; c.height = 0; c.style.display = "none"; return; }
  const vr = $("viewport").getBoundingClientRect();
  const x0 = -view.tx / view.scale, y0 = -view.ty / view.scale, x1 = (vr.width - view.tx) / view.scale, y1 = (vr.height - view.ty) / view.scale;
  const dpr = window.devicePixelRatio || 1, s = view.scale * dpr;
  c.width = Math.ceil((x1 - x0) * s); c.height = Math.ceil((y1 - y0) * s);
  Object.assign(c.style, { display: "", left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, c.width, c.height);
  drawCad(ctx, [s, 0, 0, s, -x0 * s, -y0 * s], dpr);
}
/* Export (PNG/PDF/video): ox, oy och scale som för ortofotot. */
function drawCadForExport(ctx, ox, oy, scale) {
  const c = $("cadCanvas");
  if (!c || c.style.display === "none") return;
  drawCad(ctx, [scale, 0, 0, scale, ox, oy], Math.max(1, scale));
}

// ---------------------------------------------------------------------
// Fästning mot CAD-linjerna
// ---------------------------------------------------------------------
let cadSnapIndex = null; // { cell, grid } i PDF-punkter
function buildCadSnap() {
  cadSnapIndex = null;
  if (!plan || !plan.calib) return;
  const cell = 25, grid = new Map();
  let n = 0;
  cads().filter(r => ls("cad:" + r.id).visible && cadGeom.has(r.id)).forEach(r => {
    const g = cadGeom.get(r.id), names = r.layers.map(l => l.name);
    const P = (x, y) => modelToPdf(g.origin[0] + x / 1000, g.origin[1] + y / 1000);
    g.groups.forEach(gr => {
      if (!cadLayerOn(r, names[gr.l])) return;
      gr.raw.forEach(a => {
        let prev = P(a[0], a[1]);
        for (let j = 2; j < a.length && n < 400000; j += 2) {
          const cur = P(a[j], a[j + 1]), sg = [prev, cur]; prev = cur; n++;
          const gx0 = Math.floor(Math.min(sg[0][0], sg[1][0]) / cell), gx1 = Math.floor(Math.max(sg[0][0], sg[1][0]) / cell);
          const gy0 = Math.floor(Math.min(sg[0][1], sg[1][1]) / cell), gy1 = Math.floor(Math.max(sg[0][1], sg[1][1]) / cell);
          if ((gx1 - gx0 + 1) * (gy1 - gy0 + 1) > 400) continue;
          for (let ix = gx0; ix <= gx1; ix++) for (let iy = gy0; iy <= gy1; iy++) { const k = ix + "," + iy; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(sg); }
        }
      });
    });
  });
  if (n) cadSnapIndex = { cell, grid };
}

// ---------------------------------------------------------------------
// Lagerpanelen: en rad per DXF och (utfällt) en rad per CAD-lager
// ---------------------------------------------------------------------
function cadRowsHtml(r, opts) {
  const key = "cad:" + r.id;
  const open = layerState["cadopen:" + r.id] === true;
  const parent = layerRow(key, `<button class="cad-toggle" title="Visa CAD-lagren">${open ? "▾" : "▸"}</button><span class="cad-name" title="Dubbelklicka för att byta namn">📐 ${escHtml(r.name)}</span> <small>${r.layers.length} lager</small>`, { del: true, ...opts });
  const kids = r.layers.map(l => {
    const sw = `<span class="cad-sw" style="background:${escHtml(r.colorMode === "mono" ? r.color : l.color === "#000000" || l.color === "#ffffff" ? "#111827" : l.color)}"></span>`;
    return layerRow(`cadl:${r.id}:${l.name}`, `${sw}${escHtml(l.name)} <small>${l.n}</small>`, { noOpacity: true, sub: true, inFolder: opts.inFolder, hidden: opts.hidden || !open, cadSub: true });
  });
  return parent + kids.join("");
}
function bindCadRows(el) {
  el.querySelectorAll('.layer-row[data-layer^="cad:"]').forEach(row => {
    const r = cads().find(x => "cad:" + x.id === row.dataset.layer);
    if (!r) return;
    row.querySelector(".cad-toggle").onclick = e => { e.stopPropagation(); layerState["cadopen:" + r.id] = layerState["cadopen:" + r.id] !== true; saveLayerState(); renderLayerPanel(); };
    row.querySelector(".cad-name").ondblclick = async () => {
      const name = (prompt("Namn på CAD-ritningen:", r.name) || "").trim();
      if (name && name !== r.name) await saveSiteItem({ ...r, name }, false, { record: false });
    };
    row.querySelector(".lr-del").onclick = () => deleteCad(r);
  });
}
/* "Alla DXF-lager" (Victors önskemål 2026-10-01): lager med samma namn i
   flera DXF-filer slås ihop till en rad, så man kan tända/släcka t.ex. "TEXT"
   i alla ritningar på en gång. Namnen jämförs utan skillnad på stora/små
   bokstäver (som i AutoCAD). Visas när det finns minst två DXF-filer. */
function cadMergedLayers() {
  const map = new Map();
  cads().forEach(r => r.layers.forEach(l => {
    const k = String(l.name).trim().toUpperCase();
    if (!map.has(k)) map.set(k, { name: l.name, color: l.color, n: 0, keys: [] });
    const m = map.get(k);
    m.n += l.n || 0;
    m.keys.push(`cadl:${r.id}:${l.name}`);
  }));
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "sv"));
}
function cadAllRowsHtml() {
  if (typeof cads !== "function" || cads().length < 2) return "";
  const merged = cadMergedLayers();
  const open = layerState["cadall-open"] === true;
  const files = cads(), nOn = files.filter(r => ls("cad:" + r.id).visible).length;
  const head = `<div class="layer-row cadall-row" data-cadall="1">
      <input type="checkbox" class="ca-vis"${nOn ? " checked" : ""} data-mixed="${nOn > 0 && nOn < files.length ? 1 : 0}" title="Tänd/släck alla DXF-ritningar" />
      <span class="ln"><button class="cad-toggle ca-toggle" title="Visa lagren">${open ? "▾" : "▸"}</button>📐 Alla DXF-lager <small>${merged.length} lager i ${files.length} ritningar</small></span>
    </div>`;
  const kids = merged.map((m, i) => {
    const on = m.keys.filter(k => ls(k).visible).length;
    const sw = `<span class="cad-sw" style="background:${escHtml(m.color === "#000000" || m.color === "#ffffff" ? "#111827" : m.color || "#111827")}"></span>`;
    return `<div class="layer-row cadall-sub" data-cadall-i="${i}">
      <input type="checkbox" class="ca-l"${on ? " checked" : ""} data-mixed="${on > 0 && on < m.keys.length ? 1 : 0}" title="Tänd/släck lagret i alla DXF-ritningar" />
      <span class="ln" title="${escHtml(m.name)}">${sw}${escHtml(m.name)} <small>${m.keys.length > 1 ? `i ${m.keys.length} ritningar` : "1 ritning"}</small></span>
    </div>`;
  });
  return head + (open ? `<div class="cadall-list">${kids.join("")}</div>` : "");
}
function bindCadAllRows(el) {
  const head = el.querySelector(".cadall-row");
  if (!head) return;
  const merged = cadMergedLayers();
  const redraw = () => { saveLayerState(); buildCadSnap(); renderCad(); renderLayerPanel(); };
  const vis = head.querySelector(".ca-vis");
  vis.indeterminate = vis.dataset.mixed === "1";
  vis.onchange = () => { cads().forEach(r => { ls("cad:" + r.id).visible = vis.checked; }); redraw(); };
  head.querySelector(".ca-toggle").onclick = e => { e.stopPropagation(); layerState["cadall-open"] = layerState["cadall-open"] !== true; saveLayerState(); renderLayerPanel(); };
  el.querySelectorAll(".cadall-sub").forEach(row => {
    const m = merged[Number(row.dataset.cadallI)], c = row.querySelector(".ca-l");
    c.indeterminate = c.dataset.mixed === "1";
    c.onchange = () => { m.keys.forEach(k => { ls(k).visible = c.checked; }); redraw(); };
  });
}
function renderCadSettings() {
  const box = $("cadSettings");
  if (!box) return;
  const list = cads();
  box.classList.toggle("hidden", !list.length);
  if (!list.length) return;
  const sel = $("cadSel"), cur = sel.value;
  sel.innerHTML = list.map(r => `<option value="${escHtml(r.id)}">${escHtml(r.name)}</option>`).join("");
  if (list.some(r => r.id === cur)) sel.value = cur;
  const r = list.find(x => x.id === sel.value) || list[0];
  $("cadColorMode").value = r.colorMode || "orig";
  $("cadColor").value = r.color || "#1d4ed8";
  $("cadColor").disabled = r.colorMode !== "mono";
  $("cadWeight").value = r.weight || 1;
  const us = $("cadUnit");
  us.innerHTML = CAD_UNITS.map(u => `<option value="${u.f}"${Math.abs(u.f - (r.factor || 1)) < 1e-12 ? " selected" : ""}>${u.n}</option>`).join("");
  $("cadInfo").textContent = `${r.stats.lines} linjer · ${r.stats.texts} texter · ${r.layers.length} lager · ${r.stats.kb} kB${r.unitNote ? " · " + r.unitNote : ""}`;
}
async function updateCadSetting(patch) {
  const r = cads().find(x => x.id === $("cadSel").value);
  if (!r) return;
  await saveSiteItem({ ...r, ...patch }, false, { record: false });
  renderCad();
}
function bindCad() {
  $("btnAddDxf").onclick = () => $("dxfInput").click();
  $("dxfInput").onchange = e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) addDxfFiles(f); };
  $("cadSel").onchange = renderCadSettings;
  $("cadColorMode").onchange = e => updateCadSetting({ colorMode: e.target.value });
  $("cadColor").onchange = e => updateCadSetting({ color: e.target.value });
  $("cadWeight").onchange = e => updateCadSetting({ weight: Number(e.target.value) || 1 });
  $("cadUnit").onchange = e => { const r = cads().find(x => x.id === $("cadSel").value); if (r) rescaleCad(r, Number(e.target.value)); };
}
bindCad();
