/* Lägesplan – utskriftslayouten som DXF (Victor 2026-10-08: "Bygg A med B som ett val per ritning").

   A: hela bladet i papperets millimeter (1 enhet = 1 mm, samma som PDF:en): ram, titelruta,
      förklaring, norrpil, skalstock, QR, texter, linjer och rutor – och ritningarna i sin skala
      innanför sina ramar (klippta mot ramen): DXF-underlagen (med sina egna lagernamn och färger),
      zonerna, 3D-objekten och etableringen.
   B: (val per ritning) ritningens innehåll i modellens koordinater (meter), som egen fil – för att
      läggas in i en annan CAD-ritning på rätt plats.

   Ingen egen ritlogik: utskriftens vanliga ritfunktioner (drawElement, zoner, objekt, etablering …)
   ritar mot en "inspelare" (dxfRecorder) som fångar linjer, cirklar, ifyllda ytor och texter och
   gör om dem till DXF-entiteter. Så blir DXF:en samma som PDF:en. Ortofoton, PDF-underlag och
   bilder (t.ex. logotyper) kan inte bli linjer och följer inte med. DXF R12, Windows-1252. */

/* ---- Inspelaren: ett låtsas-canvas-2D som spelar in vektorer (i "enhetens" koordinater, y nedåt) ---- */
function dxfRecorder(base = [1, 0, 0, 1, 0, 0]) {
  const ents = [];
  const meas = document.createElement("canvas").getContext("2d");
  const S = { m: [1, 0, 0, 1, 0, 0], fillStyle: "#000", strokeStyle: "#000", globalAlpha: 1, font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic", dash: [], lineWidth: 1, clip: null };
  const stack = [];
  let path = [], cur = null, pathState = null; // path: [{ pts: [[x,y]], closed }] i enhetens koordinater
  const T = p => applyAffine(mulAffine(base, S.m), p);
  const linScale = () => { const M = mulAffine(base, S.m); return Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])); };
  const startSub = p => { cur = { pts: [p], closed: false }; path.push(cur); };
  const addPt = p => { if (!cur) startSub(p); else cur.pts.push(p); };
  const color = c => (typeof c === "string" ? c : "#000000");
  const hexOf = c => { c = color(c).trim(); if (/^#[0-9a-f]{6}$/i.test(c)) return c; if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c.slice(1).split("").map(x => x + x).join(""); const m = c.match(/rgba?\(([^)]+)\)/i); if (m) { const v = m[1].split(",").map(x => parseFloat(x)); return "#" + v.slice(0, 3).map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join(""); } return "#000000"; };
  const alphaOf = c => { const m = color(c).match(/rgba\([^)]*,\s*([\d.]+)\s*\)/i); return (m ? parseFloat(m[1]) : 1) * S.globalAlpha; };
  const isWhite = h => { const n = parseInt(h.slice(1), 16); return (n >> 16 & 255) > 238 && (n >> 8 & 255) > 238 && (n & 255) > 238; };
  const aci = c => (typeof dxfAci === "function" ? dxfAci(hexOf(c)) : 7);
  const push = e => { e.layer = rec.layer; ents.push(e); };
  const arcPts = (cx, cy, r, a0, a1, ccw) => {
    let sweep = a1 - a0;
    if (!ccw && sweep < 0) sweep += Math.PI * 2; if (ccw && sweep > 0) sweep -= Math.PI * 2;
    if (Math.abs(a1 - a0) >= Math.PI * 2 - 1e-6) sweep = ccw ? -Math.PI * 2 : Math.PI * 2;
    const n = Math.max(6, Math.ceil(Math.abs(sweep) / (Math.PI / 18)));
    const out = [];
    for (let i = 0; i <= n; i++) { const a = a0 + sweep * i / n; out.push(T([cx + r * Math.cos(a), cy + r * Math.sin(a)])); }
    return out;
  };
  // Klippning (t.ex. zonmönster klipps mot zonen): linjer delas vid klippytans kant, bara delarna inuti behålls.
  const inside = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi || 1e-12) + xi) c = !c; } return c; };
  function clipLine(pts) {
    if (!S.clip) return [pts];
    const out = [];
    let run = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], ts = [0, 1];
      S.clip.forEach(poly => { for (let k = 0, j = poly.length - 1; k < poly.length; j = k++) { const t = segX(a, b, poly[j], poly[k]); if (t != null) ts.push(t); } });
      ts.sort((x, y) => x - y);
      for (let k = 0; k + 1 < ts.length; k++) {
        const t0 = ts[k], t1 = ts[k + 1]; if (t1 - t0 < 1e-9) continue;
        const mid = [a[0] + (b[0] - a[0]) * (t0 + t1) / 2, a[1] + (b[1] - a[1]) * (t0 + t1) / 2];
        const p0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], p1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
        if (S.clip.some(poly => inside(mid, poly))) { if (!run.length) run.push(p0); run.push(p1); }
        else if (run.length) { out.push(run); run = []; }
      }
    }
    if (run.length > 1) out.push(run);
    return out;
  }
  function segX(a, b, c, d) {
    const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-12) return null;
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    return t > 0 && t < 1 && u >= 0 && u <= 1 ? t : null;
  }
  const isCircle = sp => sp.circle;
  function flushFillOutline() {
    if (pathState && pathState.fill && !pathState.stroked) path.forEach(sp => { if (!sp.used && sp.pts.length > 1) push({ t: "PL", pts: sp.pts, closed: true, aci: aci(pathState.fill), dash: null }); });
    pathState = null;
  }
  const rec = {
    layer: "0", ents,
    canvas: { width: 1e6, height: 1e6, id: "dxf", getBoundingClientRect: () => ({ width: 0, height: 0 }) },
    get fillStyle() { return S.fillStyle; }, set fillStyle(v) { S.fillStyle = v; },
    get strokeStyle() { return S.strokeStyle; }, set strokeStyle(v) { S.strokeStyle = v; },
    get globalAlpha() { return S.globalAlpha; }, set globalAlpha(v) { S.globalAlpha = v; },
    get font() { return S.font; }, set font(v) { S.font = v; },
    get textAlign() { return S.textAlign; }, set textAlign(v) { S.textAlign = v; },
    get textBaseline() { return S.textBaseline; }, set textBaseline(v) { S.textBaseline = v; },
    get lineWidth() { return S.lineWidth; }, set lineWidth(v) { S.lineWidth = v; },
    save() { stack.push({ ...S, dash: S.dash.slice(), m: S.m.slice() }); },
    restore() { const s = stack.pop(); if (s) Object.assign(S, s); },
    setTransform(a, b, c, d, e, f) { S.m = typeof a === "object" ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, f]; },
    resetTransform() { S.m = [1, 0, 0, 1, 0, 0]; },
    transform(a, b, c, d, e, f) { S.m = mulAffine(S.m, [a, b, c, d, e, f]); },
    translate(x, y) { S.m = mulAffine(S.m, [1, 0, 0, 1, x, y]); },
    scale(x, y) { S.m = mulAffine(S.m, [x, 0, 0, y, 0, 0]); },
    rotate(a) { const c = Math.cos(a), s = Math.sin(a); S.m = mulAffine(S.m, [c, s, -s, c, 0, 0]); },
    getTransform() { const [a, b, c, d, e, f] = S.m; return new DOMMatrix([a, b, c, d, e, f]); },
    setLineDash(d) { S.dash = Array.isArray(d) ? d.slice() : []; }, getLineDash() { return S.dash.slice(); },
    beginPath() { flushFillOutline(); path = []; cur = null; },
    moveTo(x, y) { startSub(T([x, y])); },
    lineTo(x, y) { addPt(T([x, y])); },
    closePath() { if (cur) { cur.closed = true; const p = cur.pts[0]; cur = { pts: [p], closed: false }; path.push(cur); } },
    rect(x, y, w, h) { startSub(T([x, y])); addPt(T([x + w, y])); addPt(T([x + w, y + h])); addPt(T([x, y + h])); cur.closed = true; cur = null; },
    roundRect(x, y, w, h) { this.rect(x, y, w, h); },
    arc(cx, cy, r, a0, a1, ccw) {
      const pts = arcPts(cx, cy, r, a0, a1, ccw);
      const full = Math.abs(a1 - a0) >= Math.PI * 2 - 1e-6;
      if (full && (!cur || cur.pts.length <= 1)) { path = path.filter(sp => sp !== cur); cur = { pts, closed: true, circle: { c: T([cx, cy]), r: r * linScale() } }; path.push(cur); cur = null; return; }
      pts.forEach(addPt);
    },
    ellipse(cx, cy, rx, ry, rot, a0, a1, ccw) { this.save(); this.translate(cx, cy); this.rotate(rot || 0); this.scale(rx, ry); this.arc(0, 0, 1, a0, a1, ccw); this.restore(); },
    arcTo(x1, y1) { addPt(T([x1, y1])); },
    quadraticCurveTo(cx, cy, x, y) { const p0 = cur ? cur.pts[cur.pts.length - 1] : T([cx, cy]); const c = T([cx, cy]), e = T([x, y]); for (let i = 1; i <= 6; i++) { const t = i / 6; addPt([(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * c[0] + t * t * e[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * c[1] + t * t * e[1]]); } },
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) { const p0 = cur ? cur.pts[cur.pts.length - 1] : T([c1x, c1y]); const a = T([c1x, c1y]), b = T([c2x, c2y]), e = T([x, y]); for (let i = 1; i <= 8; i++) { const t = i / 8, u = 1 - t; addPt([u * u * u * p0[0] + 3 * u * u * t * a[0] + 3 * u * t * t * b[0] + t * t * t * e[0], u * u * u * p0[1] + 3 * u * u * t * a[1] + 3 * u * t * t * b[1] + t * t * t * e[1]]); } },
    stroke() {
      if (alphaOf(S.strokeStyle) < 0.08) return;
      pathState = pathState || {}; pathState.stroked = true;
      const a = aci(S.strokeStyle), dash = S.dash.length ? "DASHED" : null;
      path.forEach(sp => {
        if (sp.circle && !S.clip) { push({ t: "CIRCLE", x: sp.circle.c[0], y: sp.circle.c[1], r: sp.circle.r, aci: a }); return; }
        if (sp.pts.length < 2) return;
        const pts = sp.closed ? [...sp.pts, sp.pts[0]] : sp.pts;
        clipLine(pts).forEach(run => push({ t: "PL", pts: run, closed: false, aci: a, dash }));
      });
    },
    fill() {
      const h = hexOf(S.fillStyle), al = alphaOf(S.fillStyle);
      if (al < 0.08 || isWhite(h)) return;
      pathState = pathState || {}; pathState.fill = S.fillStyle;
      path.forEach(sp => {
        if (sp.circle) { if (sp.circle.r < 4) { push({ t: "DOT", x: sp.circle.c[0], y: sp.circle.c[1], r: sp.circle.r, aci: aci(S.fillStyle) }); sp.used = true; } return; }
        const pts = sp.pts.filter((p, i, a) => !i || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-9);
        if (pts.length >= 3 && pts.length <= 4 && al >= 0.5) { push({ t: "SOLID", pts, aci: aci(S.fillStyle) }); sp.used = true; }
      });
    },
    clip() { const polys = path.filter(sp => sp.pts.length > 2).map(sp => sp.pts); if (polys.length) S.clip = polys; },
    fillRect(x, y, w, h) {
      const hx = hexOf(S.fillStyle);
      if (alphaOf(S.fillStyle) < 0.5 || isWhite(hx)) return;
      push({ t: "SOLID", pts: [T([x, y]), T([x + w, y]), T([x + w, y + h]), T([x, y + h])], aci: aci(S.fillStyle) });
    },
    strokeRect(x, y, w, h) { const sv = [path, cur, pathState]; path = []; cur = null; pathState = null; this.rect(x, y, w, h); this.stroke(); [path, cur, pathState] = sv; },
    clearRect() {},
    fillText(s, x, y) {
      s = String(s ?? ""); if (!s.trim() || alphaOf(S.fillStyle) < 0.15) return;
      const px = parseFloat((S.font.match(/([\d.]+)px/) || [0, 10])[1]);
      const M = mulAffine(base, S.m), o = applyAffine(M, [x, y]), d = [M[0], M[1]];
      push({ t: "TEXT", x: o[0], y: o[1], h: px * 0.72 * linScale(), rot: Math.atan2(d[1], d[0]), s,
        ha: /center/.test(S.textAlign) ? 1 : /right|end/.test(S.textAlign) ? 2 : 0,
        va: /top|hanging/.test(S.textBaseline) ? 3 : /middle/.test(S.textBaseline) ? 2 : /bottom|ideographic/.test(S.textBaseline) ? 1 : 0, aci: aci(S.fillStyle) });
    },
    strokeText() {}, // textens kontur (gloria) – texten själv kommer med fillText
    measureText(s) { meas.font = S.font; return meas.measureText(s); },
    drawImage() {}, putImageData() {}, getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }),
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), createPattern: () => null,
    isPointInPath: () => false,
  };
  ["lineCap", "lineJoin", "miterLimit", "shadowColor", "shadowBlur", "shadowOffsetX", "shadowOffsetY", "globalCompositeOperation", "filter", "imageSmoothingEnabled", "imageSmoothingQuality", "direction", "letterSpacing", "lineDashOffset"].forEach(k => { let v; Object.defineProperty(rec, k, { get: () => v, set: x => { v = x; }, enumerable: true }); });
  rec.finish = () => { flushFillOutline(); return ents; };
  return rec;
}

/* Förenkling (Douglas–Peucker) av en polylinje: punkter som avviker mindre än tol tas bort. DXF-underlagen
   har ofta mängder av små segment som inte syns i utskriftens skala – utan förenkling blev filerna
   hundratals MB. */
function dxfSimplify(pts, tol) {
  if (pts.length <= 2) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]], t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop(), [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      let d2;
      if (L2 < 1e-18) d2 = (px - ax) ** 2 + (py - ay) ** 2;
      else { const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)); d2 = (px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2; }
      if (d2 > best) { best = d2; bi = i; }
    }
    if (best > t2) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const DXF_SIMPLIFY_MM = 0.03; // på papperet

/* ---- Klippning mot en ritnings ram (enhetens koordinater) ---- */
function dxfClipToRect(ents, [x0, y0, x1, y1]) {
  const inR = p => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
  const clipSeg = (a, b) => { // Liang–Barsky
    let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
    for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
      if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue; }
      const r = q / p; if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [[a[0] + dx * t0, a[1] + dy * t0], [a[0] + dx * t1, a[1] + dy * t1], t0 > 0, t1 < 1];
  };
  const out = [];
  ents.forEach(e => {
    if (e.t === "PL") {
      const pts = e.closed ? [...e.pts, e.pts[0]] : e.pts;
      let run = [];
      for (let i = 0; i + 1 < pts.length; i++) {
        const c = clipSeg(pts[i], pts[i + 1]);
        if (!c) { if (run.length > 1) out.push({ ...e, pts: run, closed: false }); run = []; continue; }
        if (!run.length || c[2]) { if (run.length > 1) out.push({ ...e, pts: run, closed: false }); run = [c[0]]; }
        run.push(c[1]);
        if (c[3]) { out.push({ ...e, pts: run, closed: false }); run = []; }
      }
      if (run.length > 1) {
        // Hela den slutna polylinjen inuti: behåll den sluten.
        if (e.closed && run.length === pts.length) out.push({ ...e }); else out.push({ ...e, pts: run, closed: false });
      }
    } else if (e.t === "SOLID") { if (e.pts.every(inR)) out.push(e); }
    else if (e.t === "CIRCLE" || e.t === "DOT") { if (inR([e.x, e.y])) out.push(e); }
    else if (e.t === "TEXT") { if (inR([e.x, e.y])) out.push(e); }
  });
  return out;
}

/* ---- DXF-skrivare: entiteterna genom affin A (enhet -> fil), enhet "mm" eller "m" ---- */
function dxfLayerName(s) { return String(s || "0").replace(/[<>\/\\":;?*|=',]/g, "_").replace(/\s+/g, " ").trim().slice(0, 31) || "0"; }
function printDxfWrite(ents, A, { units = "mm", layerAci = {} } = {}) {
  const out = [], g = (c, v) => out.push(String(c), String(v));
  const P = p => applyAffine(A, p);
  const sc = Math.sqrt(Math.abs(A[0] * A[3] - A[1] * A[2]));
  const dec = units === "mm" ? 3 : 4, f10 = 10 ** dec, n = v => (Math.round(v * f10) / f10).toFixed(dec);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const ext = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  const E = ents.map(e => {
    const o = { ...e, layer: dxfLayerName(e.layer) };
    if (o.pts) { o.pts = o.pts.map(P); o.pts.forEach(([x, y]) => ext(x, y)); }
    else { [o.x, o.y] = P([e.x, e.y]); ext(o.x, o.y); }
    if (e.r != null) o.r = e.r * sc;
    if (e.t === "TEXT") { o.h = e.h * sc; const d = [A[0] * Math.cos(e.rot) + A[2] * Math.sin(e.rot), A[1] * Math.cos(e.rot) + A[3] * Math.sin(e.rot)]; o.rot = Math.atan2(d[1], d[0]) * 180 / Math.PI; }
    return o;
  });
  if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = 1; y1 = 1; }
  const layers = [...new Set(E.map(e => e.layer))].sort();
  const dashLen = units === "mm" ? [3, 2, -1] : [3, 2, -1]; // 2 enheter streck, 1 mellanrum
  g(0, "SECTION"); g(2, "HEADER");
  g(9, "$ACADVER"); g(1, "AC1009"); g(9, "$DWGCODEPAGE"); g(3, "ANSI_1252");
  g(9, "$INSUNITS"); g(70, units === "mm" ? 4 : 6); g(9, "$MEASUREMENT"); g(70, 1);
  g(9, "$EXTMIN"); g(10, n(x0)); g(20, n(y0)); g(30, "0.0"); g(9, "$EXTMAX"); g(10, n(x1)); g(20, n(y1)); g(30, "0.0");
  g(9, "$LIMMIN"); g(10, n(x0)); g(20, n(y0)); g(9, "$LIMMAX"); g(10, n(x1)); g(20, n(y1));
  g(9, "$LTSCALE"); g(40, units === "mm" ? "1.0" : "1.0");
  g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "TABLES");
  g(0, "TABLE"); g(2, "VPORT"); g(70, 1);
  g(0, "VPORT"); g(2, "*ACTIVE"); g(70, 0); g(10, "0.0"); g(20, "0.0"); g(11, "1.0"); g(21, "1.0");
  g(12, n((x0 + x1) / 2)); g(22, n((y0 + y1) / 2)); g(13, "0.0"); g(23, "0.0"); g(14, "1.0"); g(24, "1.0"); g(15, "0.0"); g(25, "0.0");
  g(16, "0.0"); g(26, "0.0"); g(36, "1.0"); g(17, "0.0"); g(27, "0.0"); g(37, "0.0");
  g(40, n(Math.max(y1 - y0, (x1 - x0) / 1.5) * 1.05 || 1)); g(41, "1.5"); g(42, "50.0"); g(43, "0.0"); g(44, "0.0"); g(50, "0.0"); g(51, "0.0");
  g(71, 0); g(72, 100); g(73, 1); g(74, 3); g(75, 0); g(76, 0); g(77, 0); g(78, 0);
  g(0, "ENDTAB");
  g(0, "TABLE"); g(2, "LTYPE"); g(70, 2);
  g(0, "LTYPE"); g(2, "CONTINUOUS"); g(70, 0); g(3, "Solid line"); g(72, 65); g(73, 0); g(40, "0.0");
  g(0, "LTYPE"); g(2, "DASHED"); g(70, 0); g(3, "__ __ __"); g(72, 65); g(73, 2); g(40, n(dashLen[0])); g(49, n(dashLen[1])); g(49, n(dashLen[2]));
  g(0, "ENDTAB");
  g(0, "TABLE"); g(2, "STYLE"); g(70, 1);
  g(0, "STYLE"); g(2, "STANDARD"); g(70, 0); g(40, "0.0"); g(41, "1.0"); g(50, "0.0"); g(71, 0); g(42, "2.5"); g(3, "txt"); g(4, "");
  g(0, "ENDTAB");
  g(0, "TABLE"); g(2, "LAYER"); g(70, layers.length);
  layers.forEach(l => { g(0, "LAYER"); g(2, l); g(70, 0); g(62, layerAci[l] || 7); g(6, "CONTINUOUS"); });
  g(0, "ENDTAB");
  g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "ENTITIES");
  E.forEach(e => {
    const common = () => { g(8, e.layer); if (e.aci) g(62, e.aci); if (e.dash) g(6, e.dash); };
    if (e.t === "PL") {
      g(0, "POLYLINE"); common(); g(66, 1); g(10, "0.0"); g(20, "0.0"); g(30, "0.0"); g(70, e.closed ? 1 : 0);
      e.pts.forEach(([x, y]) => { g(0, "VERTEX"); g(8, e.layer); g(10, n(x)); g(20, n(y)); g(30, "0.0"); });
      g(0, "SEQEND"); g(8, e.layer);
    } else if (e.t === "SOLID") {
      const p = e.pts, q = p.length === 4 ? [p[0], p[1], p[3], p[2]] : [p[0], p[1], p[2], p[2]];
      g(0, "SOLID"); common(); q.forEach(([x, y], i) => { g(10 + i, n(x)); g(20 + i, n(y)); g(30 + i, "0.0"); });
    } else if (e.t === "CIRCLE") {
      g(0, "CIRCLE"); common(); g(10, n(e.x)); g(20, n(e.y)); g(30, "0.0"); g(40, n(e.r));
    } else if (e.t === "DOT") {
      g(0, "POLYLINE"); common(); g(66, 1); g(10, "0.0"); g(20, "0.0"); g(30, "0.0"); g(70, 1); g(40, n(e.r)); g(41, n(e.r));
      [[e.x - e.r / 2, e.y], [e.x + e.r / 2, e.y]].forEach(([x, y]) => { g(0, "VERTEX"); g(8, e.layer); g(10, n(x)); g(20, n(y)); g(30, "0.0"); g(42, "1.0"); });
      g(0, "SEQEND"); g(8, e.layer);
    } else if (e.t === "TEXT") {
      String(e.s).split("\n").forEach((ln, i) => {
        if (!ln.trim()) return;
        const off = i * e.h * 1.5, r = e.rot * Math.PI / 180, x = e.x + Math.sin(r) * off, y = e.y - Math.cos(r) * off;
        g(0, "TEXT"); common(); g(10, n(x)); g(20, n(y)); g(30, "0.0"); g(40, n(Math.max(e.h, 0.01))); g(1, ln.replace(/[\r\n]/g, " "));
        if (Math.abs(e.rot) > 0.01) g(50, n(e.rot));
        g(7, "STANDARD");
        if (e.ha || e.va) { g(72, e.ha || 0); g(11, n(x)); g(21, n(y)); g(31, "0.0"); g(73, e.va || 0); }
      });
    }
  });
  g(0, "ENDSEC"); g(0, "EOF");
  return out.join("\r\n") + "\r\n";
}

/* ---- Bladet ---- */
const PRINT_DXF_LAYER = { text: "TEXT", legend: "FORKLARING", scalebar: "SKALSTOCK", north: "NORRPIL", title: "TITELRUTA", qr: "QR", rect: "RUTOR", line: "LINJER", image: "BILDER" };
/* Ritningens innehåll i bladets mm (y nedåt), klippt mot ramen. Returnerar { ents, toModel }. */
async function printDxfMapEnts(el, tpl, k, progress, tolMm = DXF_SIMPLIFY_MM) {
  const x = el.x * k, y = el.y * k, w = el.w * k, h = el.h * k;
  if (!plan || !plan.calib || !viewport) return { ents: [], toModel: null };
  const st = JSON.parse(JSON.stringify(vpLayerState(el)));
  const visCads = withLayerState(st, () => (typeof cads === "function" ? cads().filter(r => ls("cad:" + r.id).visible) : []));
  if (typeof ensureCadGeoms === "function") await ensureCadGeoms(visCads, 6, () => progress && progress());
  const P = mapPlate(el, w, h, w, h); // 1 canvas-px = 1 mm
  const T = [P.S, 0, 0, P.S, x - P.x0 * P.S, y - P.y0 * P.S]; // stage-px -> bladets mm
  const o0 = mToPx([0, 0]), ex = mToPx([1, 0]), ey = mToPx([0, 1]);
  const M = [ex[0] - o0[0], ex[1] - o0[1], ey[0] - o0[0], ey[1] - o0[1], o0[0], o0[1]]; // modell (m) -> stage-px
  const ents = [];
  const tm = el.cadTextMin == null ? 1 : Number(el.cadTextMin);
  cadPrintOpts = { lw: Number(el.cadLw) || 1, minTextMm: tm > 0 ? tm : null, hideText: tm < 0, pxPerMm: 1 };
  try {
    withLayerState(JSON.parse(JSON.stringify(st)), () => {
      // DXF-underlagen: deras egna lager och färger.
      (typeof cadVectorPlan === "function" ? cadVectorPlan() : []).forEach(({ rec, g, groups, minTextMm, hideText }) => {
        const names = rec.layers.map(l => l.name);
        const G = mulAffine(T, mulAffine(M, [0.001, 0, 0, 0.001, g.origin[0], g.origin[1]])), s = Math.hypot(G[0], G[1]);
        groups.forEach(({ gr, color }) => {
          const layer = names[gr.l] || "0", a = typeof dxfAci === "function" ? dxfAci(color) : 7;
          (gr.raw || []).forEach(arr => {
            if (arr.length < 4) return;
            let pts = [], bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
            for (let i = 0; i + 1 < arr.length; i += 2) { const p = applyAffine(G, [arr[i], arr[i + 1]]); pts.push(p); if (p[0] < bx0) bx0 = p[0]; if (p[0] > bx1) bx1 = p[0]; if (p[1] < by0) by0 = p[1]; if (p[1] > by1) by1 = p[1]; }
            if (bx1 < x || bx0 > x + w || by1 < y || by0 > y + h) return; // helt utanför ramen
            if (bx1 - bx0 < tolMm && by1 - by0 < tolMm) return; // osynligt litet
            pts = dxfSimplify(pts, tolMm);
            ents.push({ t: "PL", layer, pts, closed: false, aci: a, cad: true });
          });
          if (hideText) return;
          (gr.texts || []).forEach(([tx, ty, th, rot, str, al]) => {
            let hp = th * s; if (minTextMm) hp = Math.max(hp, minTextMm);
            const p = applyAffine(G, [tx, ty]), ang = rot * Math.PI / 180, d = [G[0] * Math.cos(ang) + G[2] * Math.sin(ang), G[1] * Math.cos(ang) + G[3] * Math.sin(ang)];
            ents.push({ t: "TEXT", layer, x: p[0], y: p[1], h: hp, rot: Math.atan2(d[1], d[0]), s: String(str), ha: al && al[0] === "c" ? 1 : al && al[0] === "r" ? 2 : 0, va: { t: 3, m: 2, b: 1 }[al && al[1]] || 0, aci: a, cad: true });
          });
        });
      });
      // Zoner, 3D-objekt och etablering: samma ritfunktioner som PDF:en, mot inspelaren.
      const rec = dxfRecorder([1, 0, 0, 1, x, y]);
      rec.setTransform(P.S, 0, 0, P.S, -P.x0 * P.S, -P.y0 * P.S);
      const fontPx = planFontPx();
      const objects = layerVisible("objects") ? objectShapesInPdf() : null;
      let badges = [];
      if (layerVisible("zones")) { rec.layer = "ZONER"; rec.save(); badges = drawZoneShapes(rec, fontPx, objects, true) || []; rec.restore(); }
      if (objects) { rec.layer = "4D-OBJEKT"; rec.save(); drawObjects(rec, objects, fontPx); rec.layer = "4D-OBJEKT-NAMN"; drawObjectLabels(rec, objects, fontPx); rec.restore(); }
      rec.layer = "ETABLERING"; drawSiteLayers(rec, fontPx);
      rec.layer = "ZONER-TEXT"; badges.forEach(([pt, text, color, hollow, zs]) => drawBadge(rec, pt, text, color, fontPx, hollow, zs));
      ents.push(...rec.finish());
    });
  } finally { cadPrintOpts = null; }
  return { ents: dxfClipToRect(ents, [x, y, x + w, y + h]), toModel: invAffine(mulAffine(T, M)) };
}

/* Tre sätt (Victor 2026-10-08: "en dropdown på DXF-knappen … koordinatriktig eller ritningslayout"):
     "sheet"    – ritningslayouten: hela bladet i mm
     "model4d"  – koordinatriktig: varje ritnings zoner, 3D-objekt och etablering i modellens
                  koordinater (samma som 3D-modellen, SWEREF), en fil per ritning
     "modelAll" – koordinatriktig med DXF-underlagen (förenklade bara där de avviker < 5 mm i verkligheten) */
const DXF_MODEL_TOL_M = 0.005;
const PRINT_DXF_MODES = { sheet: "Ritningslayout (mm)", model4d: "Koordinatriktig – 4D-innehåll", modelAll: "Koordinatriktig – allt inkl. DXF-underlag" };
async function buildPrintDxf(tpl, progress = () => {}, mode = "sheet") {
  const fmt = PRINT_FORMATS[tpl.format], k = fmt.w / PAGE_A3[0], W = fmt.w, H = fmt.h;
  const maps = tpl.elements.filter(e => e.type === "map");
  const base = fillText("Lägesplan {plan} {datum}", tpl);
  if (mode !== "sheet") {
    // Koordinatriktigt: bara ritningarnas innehåll, en fil per ritning, i modellens koordinater (meter).
    const files = [];
    for (const [i, el] of maps.entries()) {
      progress(i / Math.max(1, maps.length), `Ritning ${i + 1} av ${maps.length}`);
      const tol = mode === "modelAll" ? DXF_MODEL_TOL_M * 1000 / (el.scale || 1000) : DXF_SIMPLIFY_MM;
      const { ents, toModel } = await printDxfMapEnts(el, tpl, k, null, tol);
      const use = mode === "modelAll" ? ents : ents.filter(e => !e.cad);
      if (!toModel || !use.length) continue;
      const nm = (el.label && el.label.name) || (maps.length > 1 ? `Ritning ${i + 1}` : "");
      files.push({ name: `${base}${nm ? " - " + nm : ""} (koordinatriktig${mode === "modelAll" ? ", med DXF-underlag" : ""}).dxf`.replace(/[\\/:*?"<>|]/g, "-"), text: printDxfWrite(use, toModel, { units: "m" }), n: use.length });
    }
    progress(1, "Klar");
    return files;
  }
  if (tpl.elements.some(e => e.type === "qr") && typeof loadScript === "function") await loadScript(QR_URL).catch(() => {});
  const sheet = [];
  let done = 0;
  const total = maps.length + 1;
  for (const el of tpl.elements) {
    if (el.type === "map") {
      progress(done / total, `Ritning ${maps.indexOf(el) + 1} av ${maps.length}`);
      const { ents } = await printDxfMapEnts(el, tpl, k);
      sheet.push(...ents);
      // Ramen och namn/skala under ritningen.
      const x = el.x * k, y = el.y * k, w = el.w * k, h = el.h * k;
      if (el.border !== false) sheet.push({ t: "PL", layer: "RITNINGSRAM", pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], closed: true, aci: 7 });
      if (el.label && el.label.show) { const r = dxfRecorder(); r.layer = "RITNINGSNAMN"; drawElement(r, el, tpl, 1, k, { noMap: true }); sheet.push(...r.finish()); }
      done++;
      continue;
    }
    const r = dxfRecorder();
    r.layer = PRINT_DXF_LAYER[el.type] || el.type.toUpperCase();
    try { drawElement(r, el, tpl, 1, k, {}); } catch (e) { console.warn("DXF: elementet", el.type, e); }
    sheet.push(...r.finish());
  }
  // Ramen runt bladet med indelning.
  const f = tpl.frame || {};
  if (f.on) {
    const m = (f.margin || 8) * k;
    sheet.push({ t: "PL", layer: "RAM", pts: [[m, m], [W - m, m], [W - m, H - m], [m, H - m]], closed: true, aci: 7 });
    if (f.ticks) for (let i = 1; i < 8; i++) {
      const tx = m + (W - 2 * m) * i / 8, ty = m + (H - 2 * m) * i / 8, len = m * 0.7;
      sheet.push({ t: "PL", layer: "RAM", pts: [[tx, m], [tx, m - len]], aci: 7 }, { t: "PL", layer: "RAM", pts: [[tx, H - m], [tx, H - m + len]], aci: 7 });
      if (i < 6) sheet.push({ t: "PL", layer: "RAM", pts: [[m, ty], [m - len, ty]], aci: 7 }, { t: "PL", layer: "RAM", pts: [[W - m, ty], [W - m + len, ty]], aci: 7 });
    }
  }
  sheet.push({ t: "PL", layer: "BLAD", pts: [[0, 0], [W, 0], [W, H], [0, H]], closed: true, aci: 8 });
  progress(done / total, "Skriver DXF…");
  return [{ name: `${base} ${tpl.format}.dxf`, text: printDxfWrite(sheet, [1, 0, 0, -1, 0, H], { units: "mm" }), n: sheet.length }];
}

async function exportPrintDxf(mode = "sheet") {
  if (!pr) return;
  const b = $("prExportDxf");
  if (b) b.disabled = true;
  try {
    if (mode !== "sheet" && !pr.tpl.elements.some(e => e.type === "map")) { alert("Mallen har ingen ritning att exportera koordinatriktigt."); return null; }
    const files = await buildPrintDxf(pr.tpl, (f, s) => setPrintStatus(`DXF ${Math.round(f * 100)} % – ${s}`), mode);
    if (!files.length) { alert("Ritningarna visar inget som kan bli DXF (zoner, objekt, etablering eller DXF-underlag)."); setPrintStatus(""); return files; }
    for (const f of files) {
      const bytes = dxfCp1252(f.text);
      downloadBlob(new Blob([bytes], { type: "application/dxf" }), f.name);
      if (typeof window.opener !== "undefined" && window.opener && !window.opener.closed && typeof askOpener === "function") {
        try { await askOpener("tcUpload", { folder: DXF_TC_FOLDER, files: [new File([bytes], f.name, { type: "application/dxf" })] }, 5 * 60 * 1000); }
        catch (e) { setPrintStatus(`⚠ DXF nedladdad men inte sparad i Trimble Connect: ${e.message}`); }
      }
    }
    setPrintStatus(`✓ ${files.length === 1 ? files[0].name : `${files.length} DXF-filer`} – ${PRINT_DXF_MODES[mode]}`);
    return files;
  } catch (e) {
    console.error(e);
    alert("Kunde inte skapa DXF: " + e.message);
    setPrintStatus("");
    return null;
  } finally { if (b) b.disabled = false; }
}
/* Knappen öppnar en liten meny med de tre sätten (uppåt, eftersom knappen sitter längst ned). */
document.addEventListener("DOMContentLoaded", () => {
  const b = $("prExportDxf"), menu = $("prDxfMenu");
  if (!b || !menu) return;
  menu.innerHTML = Object.entries(PRINT_DXF_MODES).map(([m, t]) => `<button type="button" data-dxf="${m}" title="${{ sheet: "Hela bladet som i PDF:en, i millimeter: ram, titelruta, förklaring och ritningarna i skala.", model4d: "Varje ritnings zoner, 3D-objekt och etablering på sin riktiga plats i modellens koordinater (samma som 3D-modellen, SWEREF), en fil per ritning.", modelAll: "Som ovan plus DXF-underlagen. Filerna kan bli stora." }[m]}">${t}</button>`).join("");
  // Fast placering mot fönstret – sidopanelen klipper annars menyn.
  const place = () => {
    const r = b.getBoundingClientRect();
    menu.style.right = Math.max(4, innerWidth - r.right) + "px";
    menu.style.bottom = Math.max(4, innerHeight - r.top + 6) + "px";
    menu.style.maxWidth = Math.max(200, innerWidth - 8) + "px";
  };
  b.onclick = e => { e.stopPropagation(); place(); menu.classList.toggle("hidden"); };
  window.addEventListener("resize", () => menu.classList.add("hidden"));
  menu.addEventListener("click", e => { const x = e.target.closest("[data-dxf]"); if (!x) return; menu.classList.add("hidden"); exportPrintDxf(x.dataset.dxf); });
  document.addEventListener("click", e => { if (!menu.contains(e.target) && e.target !== b) menu.classList.add("hidden"); });
});
