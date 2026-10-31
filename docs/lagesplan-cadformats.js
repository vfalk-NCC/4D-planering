/* Fler ritnings- och kartformat till CAD-underlag (Victor 2026-10-31: "lägg till stöd för importer av fler filformat").
   Allt görs om till en enkel ASCII-DXF (som DWG i lagesplan-cad.js) och går sedan samma väg som en vanlig DXF: lager, färger, enheter, sparning.
   Koordinaterna hamnar i modellens system (x = öst, y = norr) i den SWEREF-zon som ritningen/kartan passar.
   – GeoJSON, KML, GPX (WGS84 → SWEREF), Shapefile (.shp + .dbf + .prj, eller en .zip med dem), SVG, CSV/TXT/XYZ (punkter), LandXML (linjer och punkter).
   – Koordinatsystem: .prj/EPSG när det finns (SWEREF 99 TM/lokala zoner, WGS84, Web Mercator), annars gissas det ur talen. */

const CADV_EXT = /\.(geojson|json|kml|gpx|shp|svg|csv|txt|xyz|pts|xml|landxml)$/i;
const CADV_ZIP = /\.zip$/i;
const cadvIsVector = n => CADV_EXT.test(n) || CADV_ZIP.test(n);
const cadvNum = v => { const n = Number(String(v).replace(",", ".")); return Number.isFinite(n) ? n : NaN; };

/* ---- Koordinatsystem ----------------------------------------------------------------------------------------------------------------------- */
const CADV_EPSG_ZONE = { 3006: "SWEREF 99 TM", 3007: "SWEREF 99 12 00", 3008: "SWEREF 99 13 30", 3009: "SWEREF 99 15 00", 3010: "SWEREF 99 16 30", 3011: "SWEREF 99 18 00", 3012: "SWEREF 99 14 15",
  3013: "SWEREF 99 15 45", 3014: "SWEREF 99 17 15", 3015: "SWEREF 99 18 45", 3016: "SWEREF 99 20 15", 3017: "SWEREF 99 21 45", 3018: "SWEREF 99 23 15" };
const cadvZoneByName = n => (typeof SWEREF_ZONES !== "undefined" ? SWEREF_ZONES.find(z => z.name === n) : null);
function cadvCrsFromEpsg(code) {
  code = Number(code);
  if ([4326, 4258, 4619, 4979, 4937, 7886].includes(code)) return { kind: "geo" };
  if (CADV_EPSG_ZONE[code]) return { kind: "zone", zone: cadvZoneByName(CADV_EPSG_ZONE[code]) };
  if (code === 3857 || code === 900913) return { kind: "merc" };
  if (code === 3021 || code === 4124) return { kind: "unsupported", name: "RT90" };
  return null;
}
function cadvCrsFromText(t) {
  t = String(t || ""); if (!t.trim()) return null;
  const m = t.match(/EPSG["',:\s]*(\d{4,5})/i) || t.match(/AUTHORITY\["EPSG","(\d{4,5})"\]\s*\]\s*$/i); if (m) { const c = cadvCrsFromEpsg(m[1]); if (c) return c; }
  const z = t.match(/SWEREF\s*99\s*(TM|\d{2}\s*\d{2})/i); if (z) { const nm = "SWEREF 99 " + (/TM/i.test(z[1]) ? "TM" : z[1].replace(/\s+/, " ")), zone = cadvZoneByName(nm); if (zone) return { kind: "zone", zone }; }
  if (/RT\s*90|RT90/i.test(t)) return { kind: "unsupported", name: "RT90" };
  if (/PROJCS/i.test(t)) { if (/Mercator_Auxiliary_Sphere|Pseudo.?Mercator|WGS_1984_Web_Mercator/i.test(t)) return { kind: "merc" }; return null; }
  if (/GEOGCS/i.test(t) && /WGS|ETRS|GRS/i.test(t)) return { kind: "geo" };
  return null;
}
/* Zonen som ritningen/modellen ligger i: den som lägger en känd punkt närmast planens första kalibreringspunkt, annars kartans zon (SWEREF 99 20 15). */
function cadvProjectZone(lat, lon) {
  const zones = typeof SWEREF_ZONES !== "undefined" ? SWEREF_ZONES : []; if (!zones.length) return null;
  let ref = null; try { if (typeof plan !== "undefined" && plan && plan.calib) ref = plan.calib.model[0]; } catch (e) { /* */ }
  if (ref && lat != null) { let best = null; zones.forEach(z => { const [N, E] = geodeticToGrid(lat, lon, z), d = Math.hypot(E - ref[0], N - ref[1]); if (!best || d < best.d) best = { d, z }; }); if (best) return best.z; }
  try { if (typeof l3mapZone === "function") { const z = l3mapZone(); if (z) return z; } } catch (e) { /* */ }
  return cadvZoneByName("SWEREF 99 20 15") || zones[0];
}
/* Gör en funktion (x, y) → [E, N] i projektets zon. sample = [x, y] ur filen (för gissning av koordinatsystemet). */
function cadvXform(crs, sample) {
  const [sx, sy] = sample || [0, 0];
  if (!crs) {
    if (Math.abs(sx) <= 180 && Math.abs(sy) <= 90 && (Math.abs(sx) > 1 || Math.abs(sy) > 1)) crs = { kind: "geo" };
    else if (sx > 270000 && sx < 900000 && sy > 6e6 && sy < 7.8e6) crs = { kind: "zone", zone: cadvZoneByName("SWEREF 99 TM"), guessed: true };
    else crs = { kind: "local" };
  }
  if (crs.kind === "unsupported") throw new Error(`Koordinatsystemet ${crs.name} stöds inte – exportera i SWEREF 99 eller WGS84.`);
  if (crs.kind === "local") return { f: (x, y) => [x, y], crs };
  if (crs.kind === "geo" || crs.kind === "merc") {
    const toGeo = crs.kind === "geo" ? (x, y) => [y, x] : (x, y) => [(2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI, x / 6378137 * 180 / Math.PI];
    const [lat0, lon0] = toGeo(sx, sy), pz = cadvProjectZone(lat0, lon0);
    return { f: (x, y) => { const [la, lo] = toGeo(x, y), [N, E] = geodeticToGrid(la, lo, pz); return [E, N]; }, crs, zone: pz };
  }
  // projicerat (SWEREF-zon): samma zon som projektet ⇒ oförändrat, annars via lat/lon
  const src = crs.zone, [la0, lo0] = l3mapGridToGeo(sy, sx, src), pz = cadvProjectZone(la0, lo0);
  if (!pz || pz.name === src.name) return { f: (x, y) => [x, y], crs, zone: src };
  return { f: (x, y) => { const [la, lo] = l3mapGridToGeo(y, x, src), [N, E] = geodeticToGrid(la, lo, pz); return [E, N]; }, crs, zone: pz };
}

/* ---- Det som läses (gemensamt) -------------------------------------------------------------------------------------------------------------- */
/* doc = { layers: Map(namn -> { lines: [{ pts: [[x,y,z]], closed }], points: [{ x, y, z, label }] }), crs, local }  – koordinater i filens system tills toDxf omvandlar. */
function cadvDoc() { return { layers: new Map(), crs: null, local: false, notes: [] }; }
function cadvLayer(doc, name) { name = String(name || "Import").replace(/[^\wåäöÅÄÖ .\-]+/g, "_").slice(0, 60) || "Import"; if (!doc.layers.has(name)) doc.layers.set(name, { lines: [], points: [] }); return doc.layers.get(name); }

/* ---- GeoJSON -------------------------------------------------------------------------------------------------------------------------------- */
function cadvGeoJson(text) {
  const j = JSON.parse(text), doc = cadvDoc();
  const crsName = j.crs && j.crs.properties && j.crs.properties.name; if (crsName) doc.crs = cadvCrsFromText(crsName);
  const lbl = p => { p = p || {}; const k = Object.keys(p).find(x => /^(name|namn|label|id|beteckning|benämning)$/i.test(x)); return k && p[k] != null ? String(p[k]) : ""; };
  const lay = p => { p = p || {}; const k = Object.keys(p).find(x => /^(layer|lager|type|typ|kategori|class)$/i.test(x)); return k && p[k] != null ? String(p[k]) : ""; };
  const put = (g, props, def) => {
    if (!g) return; const L = cadvLayer(doc, lay(props) || def), c = g.coordinates, t = g.type;
    if (t === "GeometryCollection") { (g.geometries || []).forEach(x => put(x, props, def)); return; }
    const P = a => [Number(a[0]), Number(a[1]), a.length > 2 && Number.isFinite(Number(a[2])) ? Number(a[2]) : 0];
    if (t === "Point") L.points.push({ ...(([x, y, z]) => ({ x, y, z }))(P(c)), label: lbl(props) });
    else if (t === "MultiPoint") c.forEach(a => L.points.push({ ...(([x, y, z]) => ({ x, y, z }))(P(a)), label: lbl(props) }));
    else if (t === "LineString") L.lines.push({ pts: c.map(P), closed: false });
    else if (t === "MultiLineString") c.forEach(l => L.lines.push({ pts: l.map(P), closed: false }));
    else if (t === "Polygon") c.forEach(r => L.lines.push({ pts: r.slice(0, -1).map(P), closed: true }));
    else if (t === "MultiPolygon") c.forEach(poly => poly.forEach(r => L.lines.push({ pts: r.slice(0, -1).map(P), closed: true })));
  };
  const feats = j.type === "FeatureCollection" ? j.features || [] : j.type === "Feature" ? [j] : [{ geometry: j, properties: {} }];
  feats.forEach(f => put(f.geometry, f.properties, (f.geometry && /Point/.test(f.geometry.type) ? "GeoJSON punkter" : f.geometry && /Polygon/.test(f.geometry.type) ? "GeoJSON ytor" : "GeoJSON linjer")));
  if (!doc.crs) doc.crs = { kind: "geo", assumed: true };
  return doc;
}

/* ---- KML ------------------------------------------------------------------------------------------------------------------------------------- */
function cadvKml(text) {
  const x = new DOMParser().parseFromString(text, "application/xml"); if (x.querySelector("parsererror")) throw new Error("KML-filen kunde inte tolkas.");
  const doc = cadvDoc(); doc.crs = { kind: "geo" };
  const coords = s => String(s || "").trim().split(/\s+/).map(t => t.split(",").map(Number)).filter(a => a.length >= 2 && Number.isFinite(a[0]) && Number.isFinite(a[1])).map(a => [a[0], a[1], Number.isFinite(a[2]) ? a[2] : 0]);
  const txt = (el, tag) => { const c = [...el.children].find(k => k.localName === tag); return c ? c.textContent.trim() : ""; };
  const folderOf = el => { for (let p = el.parentElement; p; p = p.parentElement) if (p.localName === "Folder" || p.localName === "Document") { const n = txt(p, "name"); if (n) return n; } return ""; };
  [...x.getElementsByTagName("*")].filter(e => e.localName === "Placemark").forEach(pm => {
    const name = txt(pm, "name"), L = cadvLayer(doc, folderOf(pm) || "KML");
    [...pm.getElementsByTagName("*")].forEach(g => {
      if (g.localName === "Point") { const c = coords(txt(g, "coordinates"))[0]; if (c) L.points.push({ x: c[0], y: c[1], z: c[2], label: name }); }
      else if (g.localName === "LineString") { const c = coords(txt(g, "coordinates")); if (c.length > 1) L.lines.push({ pts: c, closed: false }); }
      else if (g.localName === "LinearRing") { const c = coords(txt(g, "coordinates")); if (c.length > 2) { if (c.length > 3 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1]) c.pop(); L.lines.push({ pts: c, closed: true }); } }
    });
  });
  return doc;
}

/* ---- GPX ------------------------------------------------------------------------------------------------------------------------------------- */
function cadvGpx(text) {
  const x = new DOMParser().parseFromString(text, "application/xml"); if (x.querySelector("parsererror")) throw new Error("GPX-filen kunde inte tolkas.");
  const doc = cadvDoc(); doc.crs = { kind: "geo" };
  const pt = e => [Number(e.getAttribute("lon")), Number(e.getAttribute("lat")), Number((e.getElementsByTagName("ele")[0] || {}).textContent) || 0];
  [...x.getElementsByTagName("trk")].forEach(t => { const L = cadvLayer(doc, "GPX spår"); [...t.getElementsByTagName("trkseg")].forEach(s => { const p = [...s.getElementsByTagName("trkpt")].map(pt); if (p.length > 1) L.lines.push({ pts: p, closed: false }); }); });
  [...x.getElementsByTagName("rte")].forEach(r => { const p = [...r.getElementsByTagName("rtept")].map(pt); if (p.length > 1) cadvLayer(doc, "GPX rutter").lines.push({ pts: p, closed: false }); });
  [...x.getElementsByTagName("wpt")].forEach(w => { const p = pt(w); cadvLayer(doc, "GPX punkter").points.push({ x: p[0], y: p[1], z: p[2], label: ((w.getElementsByTagName("name")[0] || {}).textContent || "").trim() }); });
  return doc;
}

/* ---- Shapefile ------------------------------------------------------------------------------------------------------------------------------- */
function cadvDbf(buf) {
  if (!buf || buf.byteLength < 33) return null;
  const dv = new DataView(buf), n = dv.getUint32(4, true), hl = dv.getUint16(8, true), rl = dv.getUint16(10, true), fields = [];
  for (let o = 32; o + 32 <= hl && dv.getUint8(o) !== 0x0d; o += 32) { let name = ""; for (let i = 0; i < 11; i++) { const c = dv.getUint8(o + i); if (!c) break; name += String.fromCharCode(c); } fields.push({ name, len: dv.getUint8(o + 16) }); }
  const dec = new TextDecoder("windows-1252"), rows = []; let base = hl;
  for (let r = 0; r < n && base + rl <= buf.byteLength; r++, base += rl) {
    if (dv.getUint8(base) === 0x2a) { rows.push(null); continue; }
    let o = base + 1; const row = {}; fields.forEach(f => { row[f.name] = dec.decode(new Uint8Array(buf, o, f.len)).trim(); o += f.len; }); rows.push(row);
  }
  return rows;
}
function cadvShp(shp, dbf, prj, name) {
  const dv = new DataView(shp), doc = cadvDoc(); doc.crs = cadvCrsFromText(prj);
  if (dv.getInt32(0, false) !== 9994) throw new Error("Filen är ingen Shapefile (.shp).");
  const rows = dbf ? cadvDbf(dbf) : null, labelKey = rows && rows.find(Boolean) ? Object.keys(rows.find(Boolean)).find(k => /^(name|namn|label|beteckn|benamn|id|objektid|fid)/i.test(k)) : null;
  const L = cadvLayer(doc, name || "Shapefile"), end = Math.min(shp.byteLength, dv.getInt32(24, false) * 2);
  let o = 100, rec = 0;
  while (o + 12 <= end) {
    const len = dv.getInt32(o + 4, false) * 2, b = o + 8, type = dv.getInt32(b, true), label = rows && rows[rec] && labelKey ? rows[rec][labelKey] : ""; rec++; o = b + len;
    if (type === 0) continue;
    const base = type % 10 === type ? type : type; // 1,3,5,8 | 11,13,15,18 | 21,23,25,28
    const kind = { 1: "P", 11: "P", 21: "P", 3: "L", 13: "L", 23: "L", 5: "G", 15: "G", 25: "G", 8: "M", 18: "M", 28: "M" }[base];
    if (kind === "P") { const x = dv.getFloat64(b + 4, true), y = dv.getFloat64(b + 12, true), z = type === 11 ? dv.getFloat64(b + 20, true) : 0; if (Number.isFinite(x)) L.points.push({ x, y, z: Number.isFinite(z) ? z : 0, label }); continue; }
    if (kind === "M") { const n = dv.getInt32(b + 36, true), z0 = b + 40 + n * 16 + 16; for (let i = 0; i < n; i++) L.points.push({ x: dv.getFloat64(b + 40 + i * 16, true), y: dv.getFloat64(b + 48 + i * 16, true), z: type === 18 ? dv.getFloat64(z0 + i * 8, true) : 0, label }); continue; }
    if (!kind) continue;
    const np = dv.getInt32(b + 36, true), pn = dv.getInt32(b + 40, true), parts = []; for (let i = 0; i < np; i++) parts.push(dv.getInt32(b + 44 + i * 4, true));
    const p0 = b + 44 + np * 4, z0 = p0 + pn * 16 + 16, hasZ = type === 13 || type === 15 && true;
    for (let k = 0; k < np; k++) {
      const s = parts[k], e = k + 1 < np ? parts[k + 1] : pn, pts = [];
      for (let i = s; i < e; i++) pts.push([dv.getFloat64(p0 + i * 16, true), dv.getFloat64(p0 + i * 16 + 8, true), hasZ && z0 + pn * 8 <= b + len ? dv.getFloat64(z0 + i * 8, true) : 0]);
      if (pts.length < 2) continue; let closed = kind === "G"; if (closed && pts.length > 2) pts.pop();
      L.lines.push({ pts, closed });
      if (label && k === 0) L.points.push({ x: pts[0][0], y: pts[0][1], z: pts[0][2], label, textOnly: true });
    }
  }
  return doc;
}

/* ---- SVG ------------------------------------------------------------------------------------------------------------------------------------- */
function cadvSvgPath(d) {
  const tok = String(d).match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [], subs = []; let i = 0, cmd = "", cx = 0, cy = 0, sx = 0, sy = 0, cur = null, lcx = 0, lcy = 0, lq = null, lc = null;
  const num = () => Number(tok[i++]), move = (x, y) => { cur = { pts: [[x, y]], closed: false }; subs.push(cur); sx = x; sy = y; };
  const line = (x, y) => { if (!cur) move(cx, cy); cur.pts.push([x, y]); };
  const bez = (p0, p1, p2, p3) => { for (let t = 1; t <= 12; t++) { const u = t / 12, a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, c = 3 * u * u * (1 - u), e = u ** 3; line(a * p0[0] + b * p1[0] + c * p2[0] + e * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + e * p3[1]); } };
  const arc = (x1, y1, rx, ry, phi, fa, fs, x2, y2) => {
    if (!rx || !ry) { line(x2, y2); return; } rx = Math.abs(rx); ry = Math.abs(ry); const p = phi * Math.PI / 180, cp = Math.cos(p), sp = Math.sin(p), dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
    const lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry); if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const sg = fa === fs ? -1 : 1, co = sg * Math.sqrt(Math.max(0, (rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p) / (rx * rx * y1p * y1p + ry * ry * x1p * x1p))), cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    const ccx = cp * cxp - sp * cyp + (x1 + x2) / 2, ccy = sp * cxp + cp * cyp + (y1 + y2) / 2, ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry); let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry); if (!fs && dth > 0) dth -= 2 * Math.PI; else if (fs && dth < 0) dth += 2 * Math.PI;
    for (let t = 1; t <= 16; t++) { const a = th1 + dth * t / 16; line(cp * rx * Math.cos(a) - sp * ry * Math.sin(a) + ccx, sp * rx * Math.cos(a) + cp * ry * Math.sin(a) + ccy); }
  };
  while (i < tok.length) {
    if (/[a-zA-Z]/.test(tok[i])) cmd = tok[i++]; const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (C === "Z") { if (cur) cur.closed = true; cx = sx; cy = sy; cur = null; lq = lc = null; continue; }
    if (C === "M") { const x = num() + ox, y = num() + oy; move(x, y); cx = x; cy = y; cmd = rel ? "l" : "L"; lq = lc = null; }
    else if (C === "L") { const x = num() + ox, y = num() + oy; line(x, y); cx = x; cy = y; lq = lc = null; }
    else if (C === "H") { const x = num() + ox; line(x, cy); cx = x; lq = lc = null; }
    else if (C === "V") { const y = num() + oy; line(cx, y); cy = y; lq = lc = null; }
    else if (C === "C") { const x1 = num() + ox, y1 = num() + oy, x2 = num() + ox, y2 = num() + oy, x = num() + ox, y = num() + oy; bez([cx, cy], [x1, y1], [x2, y2], [x, y]); lc = [x2, y2]; lq = null; cx = x; cy = y; }
    else if (C === "S") { const x2 = num() + ox, y2 = num() + oy, x = num() + ox, y = num() + oy, x1 = lc ? 2 * cx - lc[0] : cx, y1 = lc ? 2 * cy - lc[1] : cy; bez([cx, cy], [x1, y1], [x2, y2], [x, y]); lc = [x2, y2]; lq = null; cx = x; cy = y; }
    else if (C === "Q") { const x1 = num() + ox, y1 = num() + oy, x = num() + ox, y = num() + oy; bez([cx, cy], [cx + 2 / 3 * (x1 - cx), cy + 2 / 3 * (y1 - cy)], [x + 2 / 3 * (x1 - x), y + 2 / 3 * (y1 - y)], [x, y]); lq = [x1, y1]; lc = null; cx = x; cy = y; }
    else if (C === "T") { const x = num() + ox, y = num() + oy, x1 = lq ? 2 * cx - lq[0] : cx, y1 = lq ? 2 * cy - lq[1] : cy; bez([cx, cy], [cx + 2 / 3 * (x1 - cx), cy + 2 / 3 * (y1 - cy)], [x + 2 / 3 * (x1 - x), y + 2 / 3 * (y1 - y)], [x, y]); lq = [x1, y1]; lc = null; cx = x; cy = y; }
    else if (C === "A") { const rx = num(), ry = num(), phi = num(), fa = num(), fs = num(), x = num() + ox, y = num() + oy; arc(cx, cy, rx, ry, phi, fa, fs, x, y); cx = x; cy = y; lq = lc = null; }
    else i++;
    void lcx; void lcy;
  }
  return subs.filter(s => s.pts.length > 1);
}
function cadvSvg(text, ctx) {
  const x = new DOMParser().parseFromString(text, "image/svg+xml"); if (x.querySelector("parsererror")) throw new Error("SVG-filen kunde inte tolkas.");
  const doc = cadvDoc(); doc.local = true; doc.crs = { kind: "local" };
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const parseT = s => { let M = [1, 0, 0, 1, 0, 0]; String(s || "").replace(/(matrix|translate|scale|rotate)\(([^)]*)\)/g, (_, f, a) => { const v = a.split(/[\s,]+/).filter(Boolean).map(Number); let T = [1, 0, 0, 1, 0, 0];
    if (f === "matrix") T = v; else if (f === "translate") T = [1, 0, 0, 1, v[0] || 0, v[1] || 0]; else if (f === "scale") T = [v[0], 0, 0, v[1] == null ? v[0] : v[1], 0, 0]; else { const r = (v[0] || 0) * Math.PI / 180, c = Math.cos(r), s2 = Math.sin(r); T = [c, s2, -s2, c, 0, 0]; if (v.length > 2) T = mul(mul([1, 0, 0, 1, v[1], v[2]], T), [1, 0, 0, 1, -v[1], -v[2]]); } M = mul(M, T); return ""; }); return M; };
  const walk = (el, M, layer) => {
    const m2 = el.getAttribute && el.getAttribute("transform") ? mul(M, parseT(el.getAttribute("transform"))) : M, tag = el.localName, L = () => cadvLayer(doc, layer || "SVG"), tp = (px, py) => [m2[0] * px + m2[2] * py + m2[4], m2[1] * px + m2[3] * py + m2[5], 0];
    const nm = el.getAttribute && (el.getAttribute("id") || el.getAttribute("inkscape:label"));
    const add = (pts, closed) => { if (pts.length > 1) L().lines.push({ pts: pts.map(p => tp(p[0], p[1])), closed }); };
    if (tag === "g") { const lab = (el.getAttribute("inkscape:label") || el.getAttribute("id") || layer || "SVG"); [...el.children].forEach(c => walk(c, m2, lab)); return; }
    if (tag === "svg" || tag === "defs" && false) { [...el.children].forEach(c => walk(c, m2, layer)); return; }
    const a = n => Number(el.getAttribute(n)) || 0;
    if (tag === "path") cadvSvgPath(el.getAttribute("d") || "").forEach(s => add(s.pts, s.closed));
    else if (tag === "line") add([[a("x1"), a("y1")], [a("x2"), a("y2")]], false);
    else if (tag === "polyline" || tag === "polygon") { const v = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number), p = []; for (let i = 0; i + 1 < v.length; i += 2) p.push([v[i], v[i + 1]]); add(p, tag === "polygon"); }
    else if (tag === "rect") { const x0 = a("x"), y0 = a("y"), w = a("width"), h = a("height"); add([[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]], true); }
    else if (tag === "circle" || tag === "ellipse") { const rx = tag === "circle" ? a("r") : a("rx"), ry = tag === "circle" ? a("r") : a("ry"), p = []; for (let i = 0; i < 48; i++) { const t = i / 48 * Math.PI * 2; p.push([a("cx") + rx * Math.cos(t), a("cy") + ry * Math.sin(t)]); } add(p, true); }
    else if (tag === "text") { const t = el.textContent.trim(); if (t) { const p = tp(a("x"), a("y")); L().points.push({ x: p[0], y: p[1], z: 0, label: t, textOnly: true }); } }
    else [...(el.children || [])].forEach(c => walk(c, m2, layer));
    void nm;
  };
  walk(x.documentElement, [1, 0, 0, 1, 0, 0], "");
  // SVG saknar koordinater: y vänds (SVG ritar nedåt), 1 enhet = 1 m, mitten läggs på planens första kalibreringspunkt (eller origo).
  let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
  doc.layers.forEach(L => { L.lines.forEach(l => l.pts.forEach(p => { mnx = Math.min(mnx, p[0]); mxx = Math.max(mxx, p[0]); mny = Math.min(mny, p[1]); mxy = Math.max(mxy, p[1]); })); L.points.forEach(p => { mnx = Math.min(mnx, p.x); mxx = Math.max(mxx, p.x); mny = Math.min(mny, p.y); mxy = Math.max(mxy, p.y); }); });
  if (!Number.isFinite(mnx)) throw new Error("Hittade inga linjer eller former i SVG-filen.");
  const anchor = (ctx && ctx.anchor) || [0, 0], cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2, sc = ctx && ctx.svgScale || 1;
  const T = (px, py) => [anchor[0] + (px - cx) * sc, anchor[1] - (py - cy) * sc];
  doc.layers.forEach(L => { L.lines.forEach(l => { l.pts = l.pts.map(p => { const q = T(p[0], p[1]); return [q[0], q[1], 0]; }); }); L.points.forEach(p => { const q = T(p.x, p.y); p.x = q[0]; p.y = q[1]; }); });
  doc.notes.push(`SVG saknar koordinater – 1 enhet = ${sc} m, placerad vid planens kalibreringspunkt.`);
  return doc;
}

/* ---- CSV / TXT / XYZ / PTS (punkter) ------------------------------------------------------------------------------------------------------ */
function cadvCsv(text, name) {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(s => s && !/^[#/]/.test(s)), doc = cadvDoc(); if (!lines.length) throw new Error("Filen är tom.");
  const del = ["\t", ";", ",", " "].find(d => lines.slice(0, 5).every(l => l.split(d === " " ? /\s+/ : d).length >= 2)) || ";", split = l => (del === " " ? l.split(/\s+/) : l.split(del)).map(s => s.trim().replace(/^"|"$/g, ""));
  let first = split(lines[0]), header = null; if (first.filter(v => !Number.isFinite(cadvNum(v))).length >= Math.min(2, first.length - 1) || first.every(v => !Number.isFinite(cadvNum(v)))) { header = first; lines.shift(); }
  const rows = lines.map(split).filter(r => r.length >= 2), pts = [];
  if (!rows.length) throw new Error("Hittade inga rader med koordinater.");
  const find = re => header ? header.findIndex(h => re.test(h)) : -1;
  let ix = find(/^(x|e|east|öst|easting|ost|lon|long|longitude)$/i), iy = find(/^(y|n|north|norr|northing|lat|latitude)$/i), iz = find(/^(z|h|höjd|hojd|elev|elevation|ele|alt)$/i), il = find(/^(name|namn|id|punkt|pt|point|nr|benämning|beteckning|kod)$/i);
  if (ix < 0 || iy < 0) { const numeric = rows[0].map((v, i) => (Number.isFinite(cadvNum(v)) ? i : -1)).filter(i => i >= 0); if (numeric.length < 2) throw new Error("Hittade inga koordinatkolumner."); ix = numeric[0]; iy = numeric[1]; iz = numeric[2] != null ? numeric[2] : -1; if (il < 0) il = rows[0].findIndex((v, i) => !numeric.includes(i)); }
  // Svenska punktlistor skrivs ofta "N E H" (norr först) – byt om första kolumnen är norr (≈6 milj.) och andra öst.
  const a0 = cadvNum(rows[0][ix]), b0 = cadvNum(rows[0][iy]); let swap = false; if (a0 > 6e6 && a0 < 7.8e6 && b0 > 0 && b0 < 1e6) swap = true; else if (/^(n|north|norr|northing|lat|latitude)$/i.test((header || [])[ix] || "")) swap = true;
  rows.forEach(r => { const a = cadvNum(r[ix]), b = cadvNum(r[iy]), z = iz >= 0 ? cadvNum(r[iz]) : 0; if (Number.isFinite(a) && Number.isFinite(b)) pts.push({ x: swap ? b : a, y: swap ? a : b, z: Number.isFinite(z) ? z : 0, label: il >= 0 ? r[il] || "" : "" }); });
  if (!pts.length) throw new Error("Inga giltiga punkter i filen.");
  const L = cadvLayer(doc, String(name || "Punkter").replace(/\.[^.]+$/, "")); L.points = pts; doc.crs = null; doc.sample = [pts[0].x, pts[0].y]; doc.notes.push(`${pts.length} punkter${swap ? " (norr/öst bytt till öst/norr)" : ""}.`);
  return doc;
}

/* ---- LandXML (linjer, kurvor, punkter) ------------------------------------------------------------------------------------------------------ */
function cadvLandXml(text) {
  const x = new DOMParser().parseFromString(text, "application/xml"); if (x.querySelector("parsererror")) throw new Error("LandXML-filen kunde inte tolkas.");
  const doc = cadvDoc(), ft = /foot/i.test((x.getElementsByTagName("Imperial")[0] || {}).getAttribute ? (x.getElementsByTagName("Imperial")[0].getAttribute("linearUnit") || "") : "") ? 0.3048 : 1;
  const ne = s => { const v = String(s || "").trim().split(/\s+/).map(Number); return [v[1] * ft, v[0] * ft, (v[2] || 0) * ft]; }; // LandXML: N E (Z) → x = öst, y = norr
  const kids = (el, tag) => [...el.children].filter(c => c.localName === tag);
  const coordGeom = (cg, L) => {
    let cur = [];
    const flush = () => { if (cur.length > 1) L.lines.push({ pts: cur, closed: false }); cur = []; };
    [...cg.children].forEach(e => {
      const s = kids(e, "Start")[0], en = kids(e, "End")[0]; if (!s || !en) return; const a = ne(s.textContent), b = ne(en.textContent);
      if (cur.length && Math.hypot(cur[cur.length - 1][0] - a[0], cur[cur.length - 1][1] - a[1]) > 0.05) flush(); if (!cur.length) cur.push(a);
      if (e.localName === "Curve") { const c = kids(e, "Center")[0]; if (c) { const m = ne(c.textContent), r = Math.hypot(a[0] - m[0], a[1] - m[1]), a0 = Math.atan2(a[1] - m[1], a[0] - m[0]), a1 = Math.atan2(b[1] - m[1], b[0] - m[0]), ccw = String(e.getAttribute("rot") || "ccw") !== "cw"; let d = a1 - a0; if (ccw && d < 0) d += 2 * Math.PI; if (!ccw && d > 0) d -= 2 * Math.PI; const n = Math.max(4, Math.ceil(Math.abs(d) / 0.1)); for (let i = 1; i < n; i++) { const t = a0 + d * i / n; cur.push([m[0] + r * Math.cos(t), m[1] + r * Math.sin(t), a[2] + (b[2] - a[2]) * i / n]); } } }
      else if (e.localName === "Spiral") { const pi = kids(e, "PI")[0]; if (pi) { const p = ne(pi.textContent); for (let i = 1; i < 8; i++) { const t = i / 8, u = 1 - t; cur.push([u * u * a[0] + 2 * u * t * p[0] + t * t * b[0], u * u * a[1] + 2 * u * t * p[1] + t * t * b[1], a[2] + (b[2] - a[2]) * t]); } } }
      cur.push(b);
    }); flush();
  };
  [...x.getElementsByTagName("Alignment")].forEach(al => { const L = cadvLayer(doc, "Linjeföring " + (al.getAttribute("name") || "")); kids(al, "CoordGeom").forEach(cg => coordGeom(cg, L)); });
  [...x.getElementsByTagName("PlanFeature")].forEach(pf => { const L = cadvLayer(doc, "Plandetalj " + (pf.getAttribute("name") || "")); kids(pf, "CoordGeom").forEach(cg => coordGeom(cg, L)); });
  [...x.getElementsByTagName("CgPoint")].forEach(p => { const c = ne(p.textContent); if (Number.isFinite(c[0])) cadvLayer(doc, "Punkter").points.push({ x: c[0], y: c[1], z: c[2], label: p.getAttribute("name") || p.getAttribute("code") || "" }); });
  [...x.getElementsByTagName("Parcel")].forEach(pc => { const L = cadvLayer(doc, "Fastighet " + (pc.getAttribute("name") || "")); kids(pc, "CoordGeom").forEach(cg => coordGeom(cg, L)); });
  let n = 0; doc.layers.forEach(L => { n += L.lines.length + L.points.length; });
  if (!n) throw new Error("LandXML-filen innehåller inga linjer eller punkter (en ren terrängyta läses in som modell i Hämta modell).");
  const f = [...doc.layers.values()].map(L => L.lines[0] ? L.lines[0].pts[0] : L.points[0] ? [L.points[0].x, L.points[0].y] : null).find(Boolean); doc.sample = f ? [f[0], f[1]] : null; doc.crs = null;
  return doc;
}

/* ---- Ut: ASCII-DXF ------------------------------------------------------------------------------------------------------------------------- */
function cadvToDxf(doc, xf) {
  const o = [], g = (c, v) => o.push(String(c), String(v)), n = v => (Number.isFinite(v) ? v : 0), PAL = [1, 3, 5, 2, 6, 4, 30, 140, 200, 40, 90, 150];
  const names = [...doc.layers.keys()], T = (x, y) => xf.f(x, y);
  g(0, "SECTION"); g(2, "HEADER"); g(9, "$INSUNITS"); g(70, 6); g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "TABLES"); g(0, "TABLE"); g(2, "LAYER"); g(70, names.length);
  names.forEach((nm, i) => { g(0, "LAYER"); g(2, nm); g(70, 0); g(62, PAL[i % PAL.length]); g(6, "CONTINUOUS"); }); g(0, "ENDTAB"); g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "ENTITIES");
  let ents = 0;
  doc.layers.forEach((L, nm) => {
    L.lines.forEach(l => {
      const p = l.pts.map(q => { const [x, y] = T(q[0], q[1]); return [x, y, n(q[2])]; }).filter(q => Number.isFinite(q[0]) && Number.isFinite(q[1])); if (p.length < 2) return;
      g(0, "POLYLINE"); g(8, nm); g(66, 1); g(70, 8 | (l.closed ? 1 : 0)); p.forEach(q => { g(0, "VERTEX"); g(8, nm); g(10, q[0].toFixed(3)); g(20, q[1].toFixed(3)); g(30, q[2].toFixed(3)); g(70, 32); }); g(0, "SEQEND"); g(8, nm); ents++;
    });
    L.points.forEach(pt => {
      const [x, y] = T(pt.x, pt.y); if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (!pt.textOnly) { g(0, "CIRCLE"); g(8, nm); g(10, x.toFixed(3)); g(20, y.toFixed(3)); g(30, n(pt.z).toFixed(3)); g(40, 0.3); ents++; }
      const lab = [pt.label, !pt.textOnly && Number.isFinite(pt.z) && pt.z ? pt.z.toFixed(2).replace(".", ",") : ""].filter(Boolean).join("  ");
      if (lab) { g(0, "TEXT"); g(8, nm); g(10, (x + 0.5).toFixed(3)); g(20, y.toFixed(3)); g(30, n(pt.z).toFixed(3)); g(40, 0.8); g(1, lab.replace(/[\r\n]+/g, " ")); ents++; }
    });
  });
  g(0, "ENDSEC"); g(0, "EOF");
  if (!ents) throw new Error("Hittade inget att rita i filen.");
  return o.join("\n") + "\n";
}

/* ---- Huvudfunktion: filer → DXF-text. files = alla markerade filer (för .shp hör .dbf/.prj ihop via namnet). ------------------------------------------ */
async function cadvConvert(file, siblings, ctx) {
  const name = file.name, ext = (name.match(/\.([^.]+)$/) || [])[1].toLowerCase(), base = name.replace(/\.[^.]+$/, "");
  const sib = e => (siblings || []).find(f => f !== file && f.name.toLowerCase() === (base + "." + e).toLowerCase());
  let doc;
  if (ext === "zip") {
    if (typeof pmUnzip !== "function") throw new Error("Zip kan inte läsas här.");
    const files = await pmUnzip(await file.arrayBuffer()), keys = [...files.keys()].filter(k => !/(^|\/)__MACOSX\//.test(k)), get = async k => (k ? await files.get(k)() : null);
    const shp = keys.find(k => /\.shp$/i.test(k));
    if (shp) { const b = shp.replace(/\.shp$/i, ""), pick = e => keys.find(k => k.toLowerCase() === (b + "." + e).toLowerCase()); const sb = await get(shp), db = await get(pick("dbf")), pr = await get(pick("prj")); doc = cadvShp(sb.buffer.slice(sb.byteOffset, sb.byteOffset + sb.byteLength), db ? db.buffer.slice(db.byteOffset, db.byteOffset + db.byteLength) : null, pr ? new TextDecoder().decode(pr) : "", shp.split("/").pop().replace(/\.shp$/i, "")); }
    else { const k = keys.find(x => /\.(geojson|json|kml|gpx|svg|csv|txt|xyz|pts|xml|landxml)$/i.test(x)); if (!k) throw new Error("Zip-filen innehåller ingen Shapefile, GeoJSON, KML, GPX, SVG, CSV eller LandXML."); const b = await get(k); return cadvConvert(new File([b], k.split("/").pop()), [], ctx); }
  } else if (ext === "shp") {
    const dbf = sib("dbf"), prj = sib("prj");
    doc = cadvShp(await file.arrayBuffer(), dbf ? await dbf.arrayBuffer() : null, prj ? await prj.text() : "", base);
  } else {
    const text = new TextDecoder().decode(await file.arrayBuffer()).replace(/^﻿/, "");
    if (ext === "geojson" || (ext === "json" && /"(type|features|coordinates)"/.test(text.slice(0, 2000)))) doc = cadvGeoJson(text);
    else if (ext === "kml") doc = cadvKml(text);
    else if (ext === "gpx") doc = cadvGpx(text);
    else if (ext === "svg") doc = cadvSvg(text, ctx);
    else if (ext === "csv" || ext === "txt" || ext === "xyz" || ext === "pts") doc = cadvCsv(text, base);
    else if (ext === "xml" || ext === "landxml") { if (!/<LandXML/i.test(text.slice(0, 3000))) throw new Error("XML-filen är inte LandXML."); doc = cadvLandXml(text); }
    else throw new Error("Okänt format: ." + ext);
  }
  // koordinatsystem: filens egna (prj/EPSG/crs), annars gissat ur första punkten
  let sample = doc.sample; if (!sample) { for (const L of doc.layers.values()) { if (L.lines[0]) { sample = [L.lines[0].pts[0][0], L.lines[0].pts[0][1]]; break; } if (L.points[0]) { sample = [L.points[0].x, L.points[0].y]; break; } } }
  const xf = doc.local ? { f: (x, y) => [x, y], crs: { kind: "local" } } : cadvXform(doc.crs && !doc.crs.assumed ? doc.crs : doc.crs && doc.crs.assumed ? (sample && Math.abs(sample[0]) <= 180 && Math.abs(sample[1]) <= 90 ? doc.crs : null) : null, sample);
  const dxf = cadvToDxf(doc, xf);
  return { dxf, notes: doc.notes, crs: xf.crs, zone: xf.zone || null, layers: [...doc.layers.keys()] };
}
