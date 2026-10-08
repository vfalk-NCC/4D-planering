/* Pratbubbla i utskriftslayouten (Victors önskemål 2026-10-08): en textruta med
   rundade hörn och en spets som pekar ut något på ritningen. Rutan är (x, y, w, h)
   i mm, spetsen (tx, ty) i mm räknat från rutans övre vänstra hörn – så att den
   följer med när bubblan flyttas, kopieras eller klistras in.
   Konturen tas fram som en punktlista (mm) och används av skärmen, PDF:en och DXF:en. */
function calloutOutline(el) {
  const X = el.x, Y = el.y, W = Math.max(1, el.w), H = Math.max(1, el.h);
  const r = Math.min(Math.max(0, Number(el.radius) || 0), W / 2, H / 2);
  const tx = X + (Number(el.tx) || 0), ty = Y + (Number(el.ty) || 0);
  const inside = tx > X && tx < X + W && ty > Y && ty < Y + H;
  // Vilken sida spetsen går ut från: den som ligger mest i spetsens riktning.
  const cx = X + W / 2, cy = Y + H / 2, dx = (tx - cx) / W, dy = (ty - cy) / H;
  const side = inside ? null : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "bottom" : "top");
  const pts = [];
  const corner = (ax, ay, bx, by, qx, qy) => { // kvartscirkel som bezier, 6 steg
    for (let i = 1; i <= 6; i++) { const t = i / 6, u = 1 - t; pts.push([u * u * ax + 2 * u * t * qx + t * t * bx, u * u * ay + 2 * u * t * qy + t * t * by]); }
  };
  // Spetsens bas på en sida: centrerad mot spetsen, men inte i hörnens rundning.
  const tail = (len, pos0, along) => {
    const b = Math.min(len * 0.18, 6, Math.max(1.2, len / 2 - r - 0.1));
    const c = Math.max(r + b, Math.min(len - r - b, along - pos0));
    return [c - b, c + b];
  };
  pts.push([X + r, Y]);
  if (side === "top") { const [a, b] = tail(W, X, tx); pts.push([X + a, Y], [tx, ty], [X + b, Y]); }
  pts.push([X + W - r, Y]); if (r) corner(X + W - r, Y, X + W, Y + r, X + W, Y);
  if (side === "right") { const [a, b] = tail(H, Y, ty); pts.push([X + W, Y + a], [tx, ty], [X + W, Y + b]); }
  pts.push([X + W, Y + H - r]); if (r) corner(X + W, Y + H - r, X + W - r, Y + H, X + W, Y + H);
  if (side === "bottom") { const [a, b] = tail(W, X, tx); pts.push([X + b, Y + H], [tx, ty], [X + a, Y + H]); }
  pts.push([X + r, Y + H]); if (r) corner(X + r, Y + H, X, Y + H - r, X, Y + H);
  if (side === "left") { const [a, b] = tail(H, Y, ty); pts.push([X, Y + b], [tx, ty], [X, Y + a]); }
  pts.push([X, Y + r]); if (r) corner(X, Y + r, X + r, Y, X, Y);
  return pts;
}
/* Rutan som bubblan tar (mm), inklusive spetsen. */
function calloutBounds(el) {
  const tx = el.x + (Number(el.tx) || 0), ty = el.y + (Number(el.ty) || 0);
  const x0 = Math.min(el.x, tx), y0 = Math.min(el.y, ty), x1 = Math.max(el.x + el.w, tx), y1 = Math.max(el.y + el.h, ty);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
/* Ritar bubblans kontur (fyllning + linje); s = px per mm, (ox, oy) = sidans origo i px. */
function drawCalloutShape(ctx, el, s, ox = 0, oy = 0) {
  const pts = calloutOutline(el);
  ctx.save();
  ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(ox + x * s, oy + y * s) : ctx.moveTo(ox + x * s, oy + y * s)); ctx.closePath();
  if (el.fill) { ctx.fillStyle = el.fill; ctx.fill(); }
  if (el.stroke) { ctx.strokeStyle = el.stroke; ctx.lineWidth = Math.max(0.5, (Number(el.lw) || 0.35) * s); ctx.lineJoin = "round"; ctx.stroke(); }
  ctx.restore();
}
/* PDF: konturen som en sluten polygon (vektor). k = mallens skalfaktor (A3 -> A1). */
function pdfCalloutShape(doc, el, k) {
  const pts = calloutOutline(el).map(([x, y]) => [x * k, y * k]);
  if (!el.fill && !el.stroke) return;
  const d = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
  if (el.fill) doc.setFillColor(...hexRgb(el.fill));
  if (el.stroke) { doc.setDrawColor(...hexRgb(el.stroke)); doc.setLineWidth((Number(el.lw) || 0.35) * k); doc.setLineJoin("round"); }
  doc.lines(d, pts[0][0], pts[0][1], [1, 1], el.fill && el.stroke ? "FD" : el.fill ? "F" : "S", true);
}
