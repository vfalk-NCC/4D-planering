/* Lägesplan – objekt ur en PDF (Victors önskemål 2026-10-26: "importera NSV-DP2-001 och komma åt alla objekt i
   utskriftslayouten och lager och flytta runt dom").

   En PDF med egna lager (optional content) – t.ex. en APD-plan som exporterats ur lägesplanen – läses av pdf.js som
   en lista operatorer. Här följs operatorerna (ritmatris, färger, linjer, texter, bilder) och sorteras per PDF-lager
   (OCG). Det som hör ihop (en textruta med sin ram och text, en skylt) blir ETT objekt; löst liggande linjer blir
   egna objekt. Varje objekt läggs som ett vanligt etableringsobjekt av typen "pdfobj" i ett användarlager med PDF-lagrets
   namn – det går att markera, flytta, låsa och ta bort, tänds/släcks i lagerpanelen och ritas i utskriftslayouten
   (och i PDF-exporten) som allt annat.

   Tunga lager (rutnät, grundläggning – tusentals småformer) görs inte om till objekt: de ligger kvar som PDF-lager
   (lagesplan-pdfoverlay.js) som går att tända och släcka.

   Geometrin lagras relativt objektets ruta (bbox) i PDF:ens egna enheter. Rutans fyra hörn i modellkoordinater (pts) är
   det som flyttas, vrids och träffas – ritningen följer med.

   Operatorerna pdf.js ger (3.11): constructPath [ops, coords], paint-operatorer, setFillRGBColor … Allt är i sidans
   användarrymd (y uppåt) – samma rymd som kalibreringen (plan.calib.pdf) använder. */

const PDFOBJ_MAX_HEAVY = 700;    // lager med fler målade former än så blir kvar som PDF-lager
const PDFOBJ_MAX_SEGS = 5000;    // … eller fler ritkommandon (en enda jättesökväg med tusentals linjer)
const PDFOBJ_MAX_ITEMS = 1500;   // tak för antal objekt per import
const PDFOBJ_FURNITURE = /^\s*5\s*[-–]/; // "5 - Ritningsram …" (ram, stämpel, skalstock, norrpil): importeras men släcks från början
const f2 = v => Math.round(v * 100) / 100;

/* ---- Operatorerna -> former per PDF-lager ------------------------------------------------------------------------------------------ */
async function pdfObjParse(page, doc, onProgress) {
  const O = pdfjsLib.OPS, ol = await page.getOperatorList();
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const rgb = a => {
    if (typeof a[0] === "string") { const m = /^#?([0-9a-f]{6})$/i.exec(a[0]); return m ? "#" + m[1].toLowerCase() : "#000000"; }
    const h = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
    return "#" + h(a[0]) + h(a[1]) + h(a[2]);
  };
  let st = { ctm: [1, 0, 0, 1, 0, 0], fill: "#000000", stroke: "#000000", lw: 1, dash: [], fa: 1, sa: 1, cap: 0, join: 0, font: null, fs: 1, hs: 1 };
  const stack = [], mc = [];                                  // marked content: [ocgId | null]
  const shapes = [];                                          // { layer, kind, ... }
  let path = [], curLayer = null, tm = [1, 0, 0, 1, 0, 0], tlm = tm, leading = 0, n = ol.fnArray.length;
  const layerNow = () => { for (let i = mc.length - 1; i >= 0; i--) if (mc[i]) return mc[i]; return null; };
  const T = (x, y) => [st.ctm[0] * x + st.ctm[2] * y + st.ctm[4], st.ctm[1] * x + st.ctm[3] * y + st.ctm[5]];
  const addPath = (coords, ops) => {
    let j = 0, cur = null;
    for (const op of ops) {
      if (op === O.moveTo) { cur = T(coords[j], coords[j + 1]); j += 2; path.push(["M", cur[0], cur[1]]); }
      else if (op === O.lineTo) { cur = T(coords[j], coords[j + 1]); j += 2; path.push(["L", cur[0], cur[1]]); }
      else if (op === O.curveTo) { const a = T(coords[j], coords[j + 1]), b = T(coords[j + 2], coords[j + 3]), c = T(coords[j + 4], coords[j + 5]); j += 6; cur = c; path.push(["C", a[0], a[1], b[0], b[1], c[0], c[1]]); }
      else if (op === O.curveTo2) { const b = T(coords[j], coords[j + 1]), c = T(coords[j + 2], coords[j + 3]); j += 4; path.push(["C", (cur || b)[0], (cur || b)[1], b[0], b[1], c[0], c[1]]); cur = c; }
      else if (op === O.curveTo3) { const a = T(coords[j], coords[j + 1]), c = T(coords[j + 2], coords[j + 3]); j += 4; path.push(["C", a[0], a[1], c[0], c[1], c[0], c[1]]); cur = c; }
      else if (op === O.closePath) path.push(["Z"]);
      else if (op === O.rectangle) {
        const x = coords[j], y = coords[j + 1], w = coords[j + 2], h = coords[j + 3]; j += 4;
        const a = T(x, y), b = T(x + w, y), c = T(x + w, y + h), d = T(x, y + h);
        path.push(["M", a[0], a[1]], ["L", b[0], b[1]], ["L", c[0], c[1]], ["L", d[0], d[1]], ["Z"]); cur = a;
      }
    }
  };
  const paint = (fill, stroke, close) => {
    if (!path.length) return;
    if (close) path.push(["Z"]);
    shapes.push({ layer: layerNow(), kind: "path", d: path, fill: fill ? st.fill : null, stroke: stroke ? st.stroke : null, lw: st.lw * Math.hypot(st.ctm[0], st.ctm[1]), dash: st.dash.map(v => v * Math.hypot(st.ctm[0], st.ctm[1])), fa: st.fa, sa: st.sa, cap: st.cap, join: st.join });
    path = [];
  };
  for (let i = 0; i < n; i++) {
    const fn = ol.fnArray[i], a = ol.argsArray[i];
    if (onProgress && i % 8000 === 0) { onProgress(i / n); if (i && i % 40000 === 0) await new Promise(r => setTimeout(r, 0)); }
    switch (fn) {
      case O.save: stack.push({ ...st, dash: st.dash }); break;
      case O.restore: st = stack.pop() || st; break;
      case O.transform: st.ctm = mul(st.ctm, a); break;
      case O.beginMarkedContentProps: mc.push(a && a[0] === "OC" && a[1] && a[1].id ? a[1].id : null); break;
      case O.beginMarkedContent: mc.push(null); break;
      case O.endMarkedContent: mc.pop(); break;
      case O.setLineWidth: st.lw = a[0]; break;
      case O.setLineCap: st.cap = a[0]; break;
      case O.setLineJoin: st.join = a[0]; break;
      case O.setDash: st.dash = (a[0] || []).slice(); break;
      case O.setFillRGBColor: st.fill = rgb(a); break;
      case O.setStrokeRGBColor: st.stroke = rgb(a); break;
      case O.setFillGray: { const v = Math.round(a[0] * 255); st.fill = rgb([v, v, v]); break; }
      case O.setStrokeGray: { const v = Math.round(a[0] * 255); st.stroke = rgb([v, v, v]); break; }
      case O.setFillColorN: st.fill = "#9ca3af"; break;
      case O.setStrokeColorN: st.stroke = "#9ca3af"; break;
      case O.setGState: (a[0] || []).forEach(([k, v]) => { if (k === "CA") st.sa = v; else if (k === "ca") st.fa = v; else if (k === "LW") st.lw = v; }); break;
      case O.constructPath: addPath(a[1], a[0]); break;
      case O.fill: case O.eoFill: paint(true, false, false); break;
      case O.stroke: paint(false, true, false); break;
      case O.closeStroke: paint(false, true, true); break;
      case O.fillStroke: case O.eoFillStroke: paint(true, true, false); break;
      case O.closeFillStroke: case O.closeEOFillStroke: paint(true, true, true); break;
      case O.endPath: path = []; break;
      case O.beginText: tm = [1, 0, 0, 1, 0, 0]; tlm = tm; break;
      case O.setFont: st.font = a[0]; st.fs = a[1]; break;
      case O.setHScale: st.hs = a[0] / 100; break;
      case O.setLeading: leading = a[0]; break;
      case O.setTextMatrix: tm = a.slice(); tlm = tm; break;
      case O.moveText: tlm = mul(tlm, [1, 0, 0, 1, a[0], a[1]]); tm = tlm; break;
      case O.setLeadingMoveText: leading = -a[1]; tlm = mul(tlm, [1, 0, 0, 1, a[0], a[1]]); tm = tlm; break;
      case O.nextLine: tlm = mul(tlm, [1, 0, 0, 1, 0, -leading]); tm = tlm; break;
      case O.showText: case O.showSpacedText: case O.nextLineShowText: case O.nextLineSetSpacingShowText: {
        if (fn === O.nextLineShowText || fn === O.nextLineSetSpacingShowText) { tlm = mul(tlm, [1, 0, 0, 1, 0, -leading]); tm = tlm; }
        const items = fn === O.showSpacedText ? a[0] : a[fn === O.nextLineSetSpacingShowText ? 2 : 0];
        let s = "", w = 0;
        (items || []).forEach(g => { if (g && typeof g === "object") { s += g.unicode != null ? g.unicode : ""; w += (g.width || 500) / 1000 * st.fs * st.hs; } else if (typeof g === "number") w -= g / 1000 * st.fs * st.hs; });
        if (!/\S/.test(s)) { tm = mul(tm, [1, 0, 0, 1, w, 0]); break; }
        const M = mul(st.ctm, tm), sc = Math.hypot(M[0], M[1]), fsEff = Math.abs(st.fs) * (Math.hypot(M[2], M[3]) || sc);
        shapes.push({ layer: layerNow(), kind: "text", s: s.replace(/\s+/g, " ").trim(), x: M[4], y: M[5], fs: fsEff, rot: Math.atan2(M[1], M[0]), color: st.fill, a: st.fa, w: w * sc });
        tm = mul(tm, [1, 0, 0, 1, w, 0]);
        break;
      }
      case O.paintImageXObject: case O.paintImageMaskXObject: {
        const M = st.ctm.slice();
        shapes.push({ layer: layerNow(), kind: "image", id: a[0], m: M, mask: fn === O.paintImageMaskXObject, color: st.fill, a: st.fa, w: a[1], h: a[2] });
        break;
      }
    }
  }
  return shapes;
}

/* ---- Rutor och gruppering ----------------------------------------------------------------------------------------------------------- */
function pdfObjBox(s) {
  if (s.kind === "path") {
    let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18; const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    s.d.forEach(c => { for (let i = 1; i < c.length; i += 2) add(c[i], c[i + 1]); });
    const pad = (s.stroke ? s.lw / 2 : 0);
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  }
  if (s.kind === "text") {
    const c = Math.cos(s.rot), sn = Math.sin(s.rot), w = s.w || s.fs * 0.5 * s.s.length, h = s.fs;
    const P = [[0, -h * 0.25], [w, -h * 0.25], [w, h * 0.85], [0, h * 0.85]].map(([x, y]) => [s.x + x * c - y * sn, s.y + x * sn + y * c]);
    return [Math.min(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[0])), Math.max(...P.map(p => p[1]))];
  }
  const m = s.m, P = [[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  return [Math.min(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[0])), Math.max(...P.map(p => p[1]))];
}
const pdfObjTouch = (a, b, tol) => a[0] <= b[2] + tol && b[0] <= a[2] + tol && a[1] <= b[3] + tol && b[1] <= a[3] + tol;

/* Former -> objekt per PDF-lager. Öppna linjer är egna objekt; fyllda former, slutna ramar, texter och bilder som ligger i/mot varandra
   hålls ihop (en textruta med sin ram och sina rader, en skylt). */
function pdfObjGroup(shapes) {
  const byLayer = new Map();
  shapes.forEach(s => { const k = s.layer || ""; if (!byLayer.has(k)) byLayer.set(k, []); byLayer.get(k).push(s); });
  const out = [];
  byLayer.forEach((list, layer) => {
    const heavy = list.length > PDFOBJ_MAX_HEAVY || list.reduce((a, s) => a + (s.kind === "path" ? s.d.length : 1), 0) > PDFOBJ_MAX_SEGS;
    if (heavy) { out.push({ layer, heavy: true, n: list.length, items: [], box: null }); return; }
    const closed = s => s.kind !== "path" || s.fill || s.d.some(c => c[0] === "Z") || s.d.length <= 1;
    const glue = [], solo = [];
    list.forEach(s => { s.box = pdfObjBox(s); (closed(s) ? glue : solo).push(s); });
    const par = glue.map((_, i) => i), find = i => (par[i] === i ? i : (par[i] = find(par[i])));
    for (let i = 0; i < glue.length; i++) for (let j = i + 1; j < glue.length; j++) if (pdfObjTouch(glue[i].box, glue[j].box, 0.5)) par[find(i)] = find(j);
    const groups = new Map(); glue.forEach((s, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(s); });
    const mk = items => { const b = items.reduce((a, s) => [Math.min(a[0], s.box[0]), Math.min(a[1], s.box[1]), Math.max(a[2], s.box[2]), Math.max(a[3], s.box[3])], [1e18, 1e18, -1e18, -1e18]); return { layer, items, box: b }; };
    groups.forEach(g => out.push(mk(g)));
    solo.forEach(s => out.push(mk([s])));
  });
  return out;
}

/* ---- Objekt -> etableringsobjekt (modellkoordinater) --------------------------------------------------------------------------------- */
function pdfObjToSite(obj, p, toModel, layerName, ids) {
  const b = obj.box, w0 = Math.max(b[2] - b[0], 0.05), h0 = Math.max(b[3] - b[1], 0.05);
  const c = [[b[0], b[1]], [b[0] + w0, b[1]], [b[0] + w0, b[1] + h0], [b[0], b[1] + h0]].map(q => toModel(q[0], q[1]).map(v => Math.round(v * 1000) / 1000));
  const rel = (x, y) => [f2(x - b[0]), f2(y - b[1])];
  const parts = obj.items.map(s => {
    if (s.kind === "path") {
      const d = []; s.d.forEach(c2 => { const r = c2.slice(); for (let i = 1; i < r.length; i += 2) { const q = rel(r[i], r[i + 1]); r[i] = q[0]; r[i + 1] = q[1]; } d.push(r.join(" ").replace(/^([MLCZ])/, "$1")); });
      return { t: "p", d: d.join("|"), f: s.fill, s: s.stroke, lw: f2(s.lw), da: s.dash.length ? s.dash.map(f2) : undefined, fa: s.fa !== 1 ? s.fa : undefined, sa: s.sa !== 1 ? s.sa : undefined, cap: s.cap || undefined, jn: s.join || undefined };
    }
    if (s.kind === "text") { const q = rel(s.x, s.y); return { t: "t", s: s.s, x: q[0], y: q[1], fs: f2(s.fs), w: f2(s.w || 0), r: Math.round(s.rot * 1000) / 1000, c: s.color, a: s.a !== 1 ? s.a : undefined }; }
    const q = rel(s.m[4], s.m[5]);
    return { t: "i", m: [f2(s.m[0]), f2(s.m[1]), f2(s.m[2]), f2(s.m[3]), q[0], q[1]], img: ids.get(s.id) || null, mask: s.mask || undefined, c: s.mask ? s.color : undefined };
  });
  return { type: "pdfobj", pts: c, w0: f2(w0), h0: f2(h0), parts, layer: layerName, src: p.id };
}

/* ---- Rita ett pdfobj (anropas från drawSiteItem) -------------------------------------------------------------------------------------- */
const pdfObjImgs = new Map(); // sökväg -> HTMLImageElement | "laddar" | "fel"
function pdfObjImage(path) {
  const c = pdfObjImgs.get(path);
  if (c instanceof Image) return c.complete && c.naturalWidth ? c : null;
  if (c) return null;
  pdfObjImgs.set(path, "laddar");
  (async () => {
    try {
      const url = await ghReadBinaryUrl(token, path), im = new Image();
      im.onload = () => { pdfObjImgs.set(path, im); if (typeof renderZones === "function") renderZones(); };
      im.onerror = () => pdfObjImgs.set(path, "fel");
      im.src = url;
    } catch (e) { pdfObjImgs.set(path, "fel"); }
  })();
  return null;
}
function pdfObjDraw(ctx, x, fontPx, ppm, selected) {
  const P = x.pts.map(mToPx); if (P.length < 4) return;
  const w0 = x.w0 || 1, h0 = x.h0 || 1;
  // lokala PDF-enheter (y uppåt) -> canvas
  const ex = [(P[1][0] - P[0][0]) / w0, (P[1][1] - P[0][1]) / w0], ey = [(P[3][0] - P[0][0]) / h0, (P[3][1] - P[0][1]) / h0];
  const sc = Math.hypot(ex[0], ex[1]), L = (lx, ly) => [P[0][0] + ex[0] * lx + ey[0] * ly, P[0][1] + ex[1] * lx + ey[1] * ly];
  ctx.save();
  const baseA = ctx.globalAlpha;
  const mirror = ex[0] * ey[1] - ex[1] * ey[0] > 0; // y vänds mellan PDF och skärm: bilder och text ritas rättvända
  for (const t of x.parts || []) {
    if (t.t === "p") {
      ctx.save(); ctx.transform(ex[0], ex[1], ey[0], ey[1], P[0][0], P[0][1]);
      ctx.beginPath();
      for (const seg of t.d.split("|")) { const v = seg.split(" "), op = v[0], n = v.slice(1).map(Number); if (op === "M") ctx.moveTo(n[0], n[1]); else if (op === "L") ctx.lineTo(n[0], n[1]); else if (op === "C") ctx.bezierCurveTo(n[0], n[1], n[2], n[3], n[4], n[5]); else if (op === "Z") ctx.closePath(); }
      if (t.f) { ctx.globalAlpha = baseA * (t.fa ?? 1); ctx.fillStyle = t.f; ctx.fill(); }
      if (t.s) { ctx.globalAlpha = baseA * (t.sa ?? 1); ctx.strokeStyle = t.s; ctx.lineWidth = Math.max(t.lw, 0.2 / sc); ctx.lineCap = ["butt", "round", "square"][t.cap || 0]; ctx.lineJoin = ["miter", "round", "bevel"][t.jn || 0]; ctx.setLineDash(t.da || []); ctx.stroke(); }
      ctx.restore();
    } else if (t.t === "t") {
      const [px, py] = L(t.x, t.y), fs = t.fs * sc;
      if (fs < 1.2) continue;
      const dir = [Math.cos(t.r), Math.sin(t.r)], ang = Math.atan2(ex[1] * dir[0] + ey[1] * dir[1], ex[0] * dir[0] + ey[0] * dir[1]);
      ctx.save(); ctx.globalAlpha = baseA * (t.a ?? 1); ctx.translate(px, py); ctx.rotate(ang); ctx.fillStyle = t.c || "#000"; ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
      ctx.font = `${fs}px "Segoe UI", Arial, sans-serif`;
      // Samma bredd som i originalet (typsnittet i PDF:en är oftast smalare): pressa/sträck texten till den uppmätta bredden.
      const mw = t.w ? ctx.measureText(t.s).width : 0, want = t.w * sc;
      if (mw > 0 && want > 0 && Math.abs(mw - want) / want > 0.04) ctx.scale(Math.max(0.55, Math.min(1.5, want / mw)), 1);
      ctx.fillText(t.s, 0, 0); ctx.restore();
    } else if (t.t === "i") {
      const im = t.img ? pdfObjImage(t.img) : null, m = t.m;
      ctx.save(); ctx.globalAlpha = baseA;
      ctx.transform(ex[0], ex[1], ey[0], ey[1], P[0][0], P[0][1]); ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
      if (im) { ctx.scale(1 / im.naturalWidth, -1 / im.naturalHeight); ctx.drawImage(im, 0, -im.naturalHeight, im.naturalWidth, im.naturalHeight); }
      else { ctx.fillStyle = "rgba(100,116,139,.18)"; ctx.fillRect(0, 0, 1, 1); }
      ctx.restore();
    }
  }
  ctx.restore();
  if (selected) {
    ctx.save(); ctx.beginPath(); P.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath();
    ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = Math.max(1.5, fontPx / 10); ctx.setLineDash([fontPx / 2, fontPx / 3]); ctx.stroke(); ctx.restore();
  }
}

/* ---- Bilder (skyltar m.m.) och importen --------------------------------------------------------------------------------------------- */
async function pdfObjImageBlob(page, id, maxSide = 512) {
  const get = k => new Promise(res => { try { if (page.objs.has(k)) res(page.objs.get(k)); else page.objs.get(k, res); } catch (e) { res(null); } });
  const o = await get(id); if (!o || !o.width) return null;
  const src = o.bitmap || null, w = o.width, h = o.height, k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const cx = c.getContext("2d");
  if (src) cx.drawImage(src, 0, 0, c.width, c.height);
  else if (o.data) { // RGBA / RGB / gråskala som pdf.js ger dem
    const t = document.createElement("canvas"); t.width = w; t.height = h; const img = t.getContext("2d").createImageData(w, h);
    const d = o.data, n = w * h;
    if (d.length === n * 4) img.data.set(d); else if (d.length === n * 3) for (let i = 0, j = 0; i < n; i++, j += 3) { img.data[i * 4] = d[j]; img.data[i * 4 + 1] = d[j + 1]; img.data[i * 4 + 2] = d[j + 2]; img.data[i * 4 + 3] = 255; }
    else if (d.length === n) for (let i = 0; i < n; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = d[i]; img.data[i * 4 + 3] = 255; }
    else return null;
    t.getContext("2d").putImageData(img, 0, 0); cx.drawImage(t, 0, 0, c.width, c.height);
  } else return null;
  return await new Promise(res => c.toBlob(res, "image/png"));
}
/* Visningsnamnet på ett PDF-lager: utan ": ritningsnamn - skala - språk" som Lägesplanens exporter lägger efter lagernamnet. */
const pdfObjLayerName = n => String(n || "").replace(/\s*:\s*[A-Za-z0-9-]+\s*-\s*\d+:\d+.*$/, "").trim() || String(n || "PDF-lager");

async function pdfObjImport(p) {
  try {
    if (!pdfOverlayReady(p)) { await uiAlert("Den här PDF:en måste vara kalibrerad (och den öppna planen också) för att objekten ska hamna på rätt ställe."); return; }
    const key = "pdfobj:" + p.id;
    busyProgress(key, "Läser PDF:ens objekt…", 0.02);
    const page = await pdfOverlayPage(p), ent = pdfOvPages.get(p.id), doc = ent && ent.doc;
    const cfg = doc ? await doc.getOptionalContentConfig() : null;
    const names = {}; pdfOcgList(p).forEach(g => { names[g.id] = pdfObjLayerName(g.name); });
    const shapes = await pdfObjParse(page, doc, f => busyProgress(key, "Läser PDF:ens objekt…", 0.02 + 0.5 * f));
    const groups = pdfObjGroup(shapes);
    // Lager med en jättebild (ortofoto, bakgrundskarta) görs inte om – de ligger kvar som PDF-lager.
    const bigImg = new Set(shapes.filter(s => s.kind === "image" && Math.max(Math.hypot(s.m[0], s.m[1]), Math.hypot(s.m[2], s.m[3])) > 800 && s.w * s.h > 4e6).map(s => s.layer || ""));
    const convert = groups.filter(g => !g.heavy && g.layer && !bigImg.has(g.layer));
    const kept = [...new Set(groups.filter(g => g.heavy || !g.layer || bigImg.has(g.layer)).map(g => g.layer))].map(l => names[l] || "Utan lager");
    const layerIds = [...new Set(convert.map(g => g.layer))];
    if (!convert.length) { busyProgress(key, "", null); await uiAlert("Hittade inga objekt att göra redigerbara i den här PDF:en (den saknar egna lager, eller lagren är för stora). PDF:en ligger kvar som lager."); return; }
    if (convert.length > PDFOBJ_MAX_ITEMS) { busyProgress(key, "", null); await uiAlert(`PDF:en har ${convert.length} objekt – för många för att göras om på en gång (max ${PDFOBJ_MAX_ITEMS}). Släck de tunga lagren eller dela upp PDF:en.`); return; }
    busyProgress(key, "", null);
    const prev = siteItems.filter(x => x.type === "pdfobj" && x.src === p.id);
    const ok = await uiConfirm(`Gör ${convert.length} objekt i ${layerIds.length} PDF-lager redigerbara?\n\nDe läggs som egna objekt i användarlager med PDF-lagrets namn – du kan markera, flytta, låsa och ta bort dem, och de följer med i utskriftslayouten.\n${kept.length ? `\nKvar som PDF-lager (för tunga/stora för att göras om): ${kept.join(", ")}.\n` : ""}${prev.length ? `\nDe ${prev.length} objekt som tidigare gjorts redigerbara ur den här PDF:en ersätts.` : ""}`, { ok: "Gör redigerbara" });
    if (!ok) return;
    busyProgress(key, "Sparar objekten…", 0.55);
    // Bilder: en fil per unik bild (nedskalad), sparad i projektet.
    const ids = new Map(), need = [...new Set(convert.flatMap(g => g.items.filter(s => s.kind === "image").map(s => s.id)))];
    let done = 0;
    for (const id of need) {
      try {
        const blob = await pdfObjImageBlob(page, id);
        if (blob) { const path = `projects/${encodeURIComponent(projectId)}/pdfobj/${p.id}-${id}.png`; await ghUploadBinary(token, path, new File([blob], `${id}.png`, { type: "image/png" }), `Lägesplan: PDF-objekt (bild) ${p.name || ""}`); ids.set(id, path); }
      } catch (e) { console.warn("PDF-objekt: bild", id, e); }
      busyProgress(key, "Sparar bilderna…", 0.55 + 0.3 * (++done / need.length));
    }
    const inv = affInv(calibAffine(p.calib)), toModel = (x, y) => [inv[0] * x + inv[2] * y + inv[4], inv[1] * x + inv[3] * y + inv[5]];
    const now = new Date().toISOString(), recs = [];
    convert.sort((a, b) => (b.box[2] - b.box[0]) * (b.box[3] - b.box[1]) - (a.box[2] - a.box[0]) * (a.box[3] - a.box[1])); // stora först: de små ligger överst och går att klicka
    convert.forEach(g => {
      const lname = names[g.layer] || "PDF";
      const rec = pdfObjToSite(g, p, toModel, lname, ids);
      const txt = g.items.find(s => s.kind === "text");
      rec.id = ghNewId(); rec.updated_at = now; rec.name = txt ? txt.s.slice(0, 40) : (g.items.some(s => s.kind === "image") ? "Skylt/bild" : "Form");
      recs.push(rec);
    });
    await saveSiteItemsBatch(recs, prev.map(x => x.id), `Lägesplan: ${recs.length} objekt ur PDF ${p.name || ""}`);
    // De lager som blivit objekt släcks i PDF-lagret (annars syns de dubbelt); ram/stämpel/skalstock m.m. ("5 - …") släcks från början.
    layerIds.forEach(id => { const k = pdfOcgKey(p, id); ls(k).visible = false; });
    new Set(recs.map(r => r.layer)).forEach(l => { ls("ul:" + l, { visible: !PDFOBJ_FURNITURE.test(l) }).visible = !PDFOBJ_FURNITURE.test(l); });
    ls(pdfOverlayKey(p)).visible = true;
    saveLayerState(); applyLayerCss(); renderLayerPanel(); renderZones();
    setSaveStatus(`✓ ${recs.length} objekt ur PDF:en är nu redigerbara (användarlager) – ram, stämpel och skalstock är släckta`);
  } catch (e) {
    console.error(e); await uiAlert("Kunde inte göra objekten redigerbara: " + (e && e.message ? e.message : e));
  } finally { busyProgress("pdfobj:" + p.id, "", null); }
}
