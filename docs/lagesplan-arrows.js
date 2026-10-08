/* Pilar i utskriftslayouten (Victors önskemål 2026-10-08).
   Elementet "arrow" går från (x, y) till (x + w, y + h) i mm – start och spets
   dras med handtagen precis som en linje. Form (rak, böjd, S-kurva, vinklad)
   och stil (klassiska och moderna) väljs fritt och kombineras.
   Allt ritas från samma funktion: skärmen, PDF:en (rastrerad i 300 dpi) och
   DXF-exporten (spelas in som linjer och ytor). */
const ARROW_STYLES = {
  classic: { label: "Klassisk", group: "Klassiska", lw: 0.35 },
  open: { label: "Öppen spets", group: "Klassiska", lw: 0.5 },
  block: { label: "Blockpil", group: "Klassiska", lw: 3 },
  modern: { label: "Avsmalnande", group: "Moderna", lw: 2.2 },
  round: { label: "Rundad", group: "Moderna", lw: 0.9 },
  gradient: { label: "Toning", group: "Moderna", lw: 2.6 },
};
const ARROW_SHAPES = { straight: "Rak", arc: "Böjd", s: "S-kurva", elbow: "Vinklad" };
const ARROW_RIBBON = new Set(["block", "modern", "gradient"]); // ritas som en yta

/* Pilens mittlinje som täta punkter (samma enhet som p0/p1). */
function arrowPath(shape, p0, p1, bend) {
  const [x0, y0] = p0, [x1, y1] = p1, dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1e-9;
  const pts = [];
  const quad = (a, c, b, n) => { for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; pts.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); } };
  pts.push([x0, y0]);
  if (shape === "arc") {
    const b = (Number(bend) || 0) / 100 * len / 2;
    quad(p0, [(x0 + x1) / 2 - dy / len * b, (y0 + y1) / 2 + dx / len * b], p1, 48);
  } else if (shape === "s") {
    // Mjuk S-kurva: vågrät ut och in (lodrät om pilen mest går upp/ned).
    const hor = Math.abs(dx) >= Math.abs(dy);
    const c1 = hor ? [x0 + dx / 2, y0] : [x0, y0 + dy / 2], c2 = hor ? [x1 - dx / 2, y1] : [x1, y1 - dy / 2];
    for (let i = 1; i <= 64; i++) { const t = i / 64, u = 1 - t; pts.push([u * u * u * x0 + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * x1, u * u * u * y0 + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * y1]); }
  } else if (shape === "elbow") {
    // Vinklad med rundade hörn: vågrät – lodrät – vågrät (eller tvärtom).
    const hor = Math.abs(dx) >= Math.abs(dy);
    const a = hor ? [x0 + dx / 2, y0] : [x0, y0 + dy / 2], b = hor ? [x0 + dx / 2, y1] : [x1, y0 + dy / 2];
    const r = Math.min(len * 0.12, Math.abs(hor ? dx : dy) / 2, Math.abs(hor ? dy : dx) / 2);
    const toward = (p, q, d) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [p[0] + (q[0] - p[0]) / l * d, p[1] + (q[1] - p[1]) / l * d]; };
    if (r > 1e-6) {
      pts.push(toward(a, p0, r)); quad(toward(a, p0, r), a, toward(a, b, r), 10);
      pts.push(toward(b, a, r)); quad(toward(b, a, r), b, toward(b, p1, r), 10);
    } else pts.push(a, b);
    pts.push([x1, y1]);
  } else pts.push([x1, y1]);
  return pts;
}
/* Kapar d från slutet av en punktlista (så att linjen inte sticker ut genom spetsen). */
function arrowTrimEnd(pts, d) {
  const out = pts.slice();
  while (out.length > 1 && d > 0) {
    const a = out[out.length - 2], b = out[out.length - 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > d) { out[out.length - 1] = [b[0] - (b[0] - a[0]) / l * d, b[1] - (b[1] - a[1]) / l * d]; return out; }
    d -= l; out.pop();
  }
  return out;
}
function arrowLength(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
/* Riktningen in i spetsen: från en punkt en bit bakåt längs linjen. */
function arrowDir(pts, back) {
  const tip = pts[pts.length - 1], q = arrowTrimEnd(pts, Math.max(1e-6, back)).pop();
  const dx = tip[0] - q[0], dy = tip[1] - q[1], l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}
/* Mått i mm för en pil (tjocklek, spetsens längd och halva bredd). */
function arrowDims(el) {
  const st = el.style in ARROW_STYLES ? el.style : "modern", lw = Math.max(0.05, Number(el.lw) || ARROW_STYLES[st].lw), hs = Math.max(0.2, (Number(el.head) || 100) / 100);
  if (ARROW_RIBBON.has(st)) { const hw = lw * (st === "block" ? 1.05 : 1.35) * hs; return { st, lw, hw, L: hw * (st === "block" ? 1.4 : 1.9) }; }
  const L = Math.max(2.2, lw * 6) * hs;
  return { st, lw, hw: L * (st === "classic" ? 0.38 : 0.45), L };
}
/* Ritar pilen. s = px per mm. Punkterna p0/p1 i px. */
function drawArrow(ctx, p0, p1, el, s) {
  const D = arrowDims(el), lw = D.lw * s, L = D.L * s, hw = D.hw * s, color = el.stroke || "#dc2626";
  let pts = arrowPath(el.shape || "straight", p0, p1, el.bend);
  const total = arrowLength(pts);
  if (total < 0.5) return;
  const both = !!el.double, lim = both ? total / 2.2 : total / 1.1, Lc = Math.min(L, lim), hwc = hw * Lc / L;
  ctx.save();
  if (el.shadow) { ctx.shadowColor = "rgba(15,23,42,.35)"; ctx.shadowBlur = 1.2 * s; ctx.shadowOffsetX = 0.35 * s; ctx.shadowOffsetY = 0.5 * s; }
  const rev = p => p.slice().reverse();
  if (ARROW_RIBBON.has(D.st)) drawArrowRibbon(ctx, pts, D, lw, Lc, hwc, both, color, el, s);
  else {
    // Linjestilar: linjen (ev. streckad) och spetsar.
    const round = D.st === "round";
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = lw;
    ctx.lineCap = round || el.dash === "dotted" ? "round" : "butt"; ctx.lineJoin = round ? "round" : "miter";
    const cut = D.st === "classic" ? Lc * 0.85 : lw * 0.6;
    let shaft = arrowTrimEnd(pts, cut); if (both) shaft = rev(arrowTrimEnd(rev(shaft), cut));
    ctx.setLineDash(el.dash === "dashed" ? [lw * 4, lw * 2.5] : el.dash === "dotted" ? [0.001, lw * 2.4] : []);
    ctx.beginPath(); shaft.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
    ctx.setLineDash([]);
    const head = path => {
      const tip = path[path.length - 1], [ux, uy] = arrowDir(path, Lc), nx = -uy, ny = ux;
      const bx = tip[0] - ux * Lc, by = tip[1] - uy * Lc;
      ctx.beginPath(); ctx.moveTo(bx + nx * hwc, by + ny * hwc); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(bx - nx * hwc, by - ny * hwc);
      if (D.st === "classic") { ctx.closePath(); ctx.fill(); } else { ctx.lineCap = round ? "round" : "butt"; ctx.stroke(); }
    };
    head(pts); if (both) head(rev(pts));
  }
  ctx.restore();
}
/* Ytstilar: kroppen som en yta längs linjen (avsmalnande för "modern"), spetsen i samma yta. */
function drawArrowRibbon(ctx, pts, D, lw, L, hw, both, color, el, s) {
  const st = D.st;
  let body = arrowTrimEnd(pts, L * (st === "block" ? 1 : 0.62));
  if (both) body = arrowTrimEnd(body.slice().reverse(), L * (st === "block" ? 1 : 0.62)).reverse();
  if (body.length < 2) body = [pts[0], pts[pts.length - 1]];
  const n = body.length, cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(body[i][0] - body[i - 1][0], body[i][1] - body[i - 1][1]));
  const tot = cum[n - 1] || 1;
  const half = t => { // halva bredden längs kroppen (t 0–1)
    if (st === "block") return lw / 2;
    if (both) return lw / 2 * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, Math.max(0, t)))) ;
    return lw / 2 * (0.22 + 0.78 * Math.pow(t, 0.8));
  };
  const L1 = [], R1 = [];
  for (let i = 0; i < n; i++) {
    const a = body[Math.max(0, i - 1)], b = body[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = -dy / l, ny = dx / l, h = half(cum[i] / tot);
    L1.push([body[i][0] + nx * h, body[i][1] + ny * h]); R1.push([body[i][0] - nx * h, body[i][1] - ny * h]);
  }
  const headPts = (path, endBody) => { // spetsen: bas vid kroppens ände, bakåtsvepta hullingar för moderna stilar
    const tip = path[path.length - 1], [ux, uy] = arrowDir(path, L), nx = -uy, ny = ux;
    const bx = tip[0] - ux * L, by = tip[1] - uy * L;
    if (st === "block") return [[bx + nx * hw, by + ny * hw], tip, [bx - nx * hw, by - ny * hw]];
    const sweep = L * 0.18, notch = L * 0.62;
    return [[bx + nx * hw - ux * sweep, by + ny * hw - uy * sweep], tip, [bx - nx * hw - ux * sweep, by - ny * hw - uy * sweep], [tip[0] - ux * notch, tip[1] - uy * notch]];
  };
  ctx.beginPath();
  const poly = [];
  // Ena sidan fram till spetsen, spetsen, andra sidan tillbaka (och ev. bakre spetsen).
  const endHead = headPts(pts, body[n - 1]);
  const startHead = both ? headPts(pts.slice().reverse(), body[0]) : null;
  if (st === "block" || !startHead) poly.push(...L1);
  else poly.push(...L1.slice(1));
  if (st === "block") { poly.push(endHead[0], endHead[1], endHead[2]); }
  else poly.push(endHead[0], endHead[1], endHead[2]);
  poly.push(...R1.slice().reverse());
  if (startHead) poly.push(startHead[0], startHead[1], startHead[2]);
  poly.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
  ctx.closePath();
  if (st === "gradient" && typeof ctx.createLinearGradient === "function") {
    const a = pts[0], b = pts[pts.length - 1], g = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
    if (g && typeof g.addColorStop === "function" && typeof CanvasGradient !== "undefined" && g instanceof CanvasGradient) {
      g.addColorStop(0, arrowRgba(color, both ? 1 : 0.08)); g.addColorStop(both ? 0.5 : 0.55, arrowRgba(color, both ? 0.35 : 0.7)); g.addColorStop(1, arrowRgba(color, 1));
      ctx.fillStyle = g;
    } else ctx.fillStyle = color; // DXF-inspelaren: helfärg
  } else ctx.fillStyle = color;
  ctx.fill();
  if (st === "block" && el.outline) { ctx.shadowColor = "transparent"; ctx.strokeStyle = el.outline; ctx.lineWidth = Math.max(0.5, 0.25 * s); ctx.lineJoin = "miter"; ctx.stroke(); }
}
function arrowRgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  const v = m ? parseInt(m[1], 16) : 0xdc2626;
  return `rgba(${v >> 16 & 255},${v >> 8 & 255},${v & 255},${a})`;
}
/* Rutan som pilen tar på sidan (mm), med plats för spets, tjocklek och skugga. */
function arrowBounds(el) {
  const pts = arrowPath(el.shape || "straight", [el.x, el.y], [el.x + el.w, el.y + el.h], el.bend), D = arrowDims(el);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const pad = Math.max(D.hw, D.lw) + (el.shadow ? 1.6 : 0.3);
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
}
/* Liten förhandsbild till stilväljaren. */
const arrowThumbCache = new Map();
function arrowThumb(style, shape, color) {
  const key = `${style}|${shape}|${color}`;
  if (arrowThumbCache.has(key)) return arrowThumbCache.get(key);
  const c = document.createElement("canvas"); c.width = 120; c.height = 64;
  const s = 4, el = { style, shape, stroke: color || "#dc2626", lw: ARROW_STYLES[style] ? ARROW_STYLES[style].lw : 1, head: 100, bend: 45 };
  drawArrow(c.getContext("2d"), [12, shape === "straight" ? 32 : 50], [108, shape === "straight" ? 32 : 14], el, s);
  const url = c.toDataURL();
  arrowThumbCache.set(key, url);
  return url;
}
