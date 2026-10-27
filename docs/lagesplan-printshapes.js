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
  const leader = el.bmode === "leader";   // ledlinje (pil) i stället för spets
  const side = inside || leader ? null : Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "bottom" : "top");
  const pts = [];
  const corner = (ax, ay, bx, by, qx, qy) => { // kvartscirkel som bezier, 6 steg
    for (let i = 1; i <= 6; i++) { const t = i / 6, u = 1 - t; pts.push([u * u * ax + 2 * u * t * qx + t * t * bx, u * u * ay + 2 * u * t * qy + t * t * by]); }
  };
  // Spetsens bas på en sida: centrerad mot spetsen, men inte i hörnens rundning.
  const tail = (len, pos0, along) => {
    const ts = el.tail || "classic", wf = ts === "slim" ? 0.07 : ts === "wide" ? 0.34 : 0.18, wm = ts === "slim" ? 2.2 : ts === "wide" ? 12 : 6;
    const b = Math.min(len * wf, wm, Math.max(1.2, len / 2 - r - 0.1));
    const c = Math.max(r + b, Math.min(len - r - b, along - pos0));
    return [c - b, c + b];
  };
  // Spetsens form: rak (klassisk/smal/bred) eller böjd (svängda sidor).
  const tailPts = (A, B) => {
    if ((el.tail || "classic") !== "curved") return [A, [tx, ty], B];
    const m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], out = [A], q = (P, Q, Cc) => { for (let i = 1; i <= 6; i++) { const t = i / 6, u = 1 - t; out.push([u * u * P[0] + 2 * u * t * Cc[0] + t * t * Q[0], u * u * P[1] + 2 * u * t * Cc[1] + t * t * Q[1]]); } };
    const c1 = [(A[0] + tx) / 2 + (m[0] - (A[0] + tx) / 2) * 0.55, (A[1] + ty) / 2 + (m[1] - (A[1] + ty) / 2) * 0.55], c2 = [(B[0] + tx) / 2 + (m[0] - (B[0] + tx) / 2) * 0.55, (B[1] + ty) / 2 + (m[1] - (B[1] + ty) / 2) * 0.55];
    q(A, [tx, ty], c1); q([tx, ty], B, c2); return out;
  };
  pts.push([X + r, Y]);
  if (side === "top") { const [a, b] = tail(W, X, tx); pts.push(...tailPts([X + a, Y], [X + b, Y])); }
  pts.push([X + W - r, Y]); if (r) corner(X + W - r, Y, X + W, Y + r, X + W, Y);
  if (side === "right") { const [a, b] = tail(H, Y, ty); pts.push(...tailPts([X + W, Y + a], [X + W, Y + b])); }
  pts.push([X + W, Y + H - r]); if (r) corner(X + W, Y + H - r, X + W - r, Y + H, X + W, Y + H);
  if (side === "bottom") { const [a, b] = tail(W, X, tx); pts.push(...tailPts([X + b, Y + H], [X + a, Y + H])); }
  pts.push([X + r, Y + H]); if (r) corner(X + r, Y + H, X, Y + H - r, X, Y + H);
  if (side === "left") { const [a, b] = tail(H, Y, ty); pts.push(...tailPts([X, Y + b], [X, Y + a])); }
  pts.push([X, Y + r]); if (r) corner(X, Y + r, X + r, Y, X, Y);
  return pts;
}
/* Rutan som bubblan tar (mm), inklusive spetsen. */
function calloutBounds(el) {
  const tx = el.x + (Number(el.tx) || 0), ty = el.y + (Number(el.ty) || 0);
  const x0 = Math.min(el.x, tx), y0 = Math.min(el.y, ty), x1 = Math.max(el.x + el.w, tx), y1 = Math.max(el.y + el.h, ty);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
/* Ledlinjen (en pil som i Pil-verktyget) från rutans kant till spetsen, som ett pil-element i mm. Null om bubblan har spets. */
function calloutLeader(el) {
  if (el.bmode !== "leader") return null;
  const W = Math.max(1, el.w), H = Math.max(1, el.h), cx = el.x + W / 2, cy = el.y + H / 2, tx = el.x + (Number(el.tx) || 0), ty = el.y + (Number(el.ty) || 0);
  const dx = tx - cx, dy = ty - cy; if (Math.hypot(dx, dy) < 0.5) return null;
  const t = Math.min(dx ? (W / 2) / Math.abs(dx) : Infinity, dy ? (H / 2) / Math.abs(dy) : Infinity);
  if (t >= 1) return null;   // spetsen ligger inne i rutan
  const st = el.astyle || "modern", D = (typeof ARROW_STYLES !== "undefined" && ARROW_STYLES[st]) || { lw: 1 };
  return { id: el.id + "-led", type: "arrow", x: cx + dx * t, y: cy + dy * t, w: tx - (cx + dx * t), h: ty - (cy + dy * t), style: st, shape: el.ashape || "straight", stroke: el.acolor || el.stroke || "#1f2937", lw: el.alw || D.lw, head: el.head, shadow: !!el.shadow, bend: el.bend };
}
/* Ritar bubblans kontur (fyllning + linje); s = px per mm, (ox, oy) = sidans origo i px. */
function drawCalloutShape(ctx, el, s, ox = 0, oy = 0) {
  const pts = calloutOutline(el);
  ctx.save();
  if (el.shadow && el.fill) { ctx.shadowColor = "rgba(15,23,42,.35)"; ctx.shadowBlur = 1.4 * s; ctx.shadowOffsetX = 0.4 * s; ctx.shadowOffsetY = 0.6 * s; }
  ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(ox + x * s, oy + y * s) : ctx.moveTo(ox + x * s, oy + y * s)); ctx.closePath();
  if (el.fill) { ctx.fillStyle = el.fill; ctx.fill(); }
  if (el.stroke) { ctx.strokeStyle = el.stroke; ctx.lineWidth = Math.max(0.5, (Number(el.lw) || 0.35) * s); ctx.lineJoin = "round"; ctx.stroke(); }
  ctx.restore();
  const ld = calloutLeader(el);
  if (ld && typeof drawArrow === "function") drawArrow(ctx, [ox + ld.x * s, oy + ld.y * s], [ox + (ld.x + ld.w) * s, oy + (ld.y + ld.h) * s], ld, s);
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
