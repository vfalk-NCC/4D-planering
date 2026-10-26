/* Utskriftslayouten: flytta objekten i ritningen (Victor 2026-10-26: "gör så att jag kan flytta dem i utskriftslayouten också – det är där jag
   jobbar mest med ritningsutseendet").

   ✥ Flytta objekt i en ritnings egenskaper: dra i textrutor, skyltar, upplag, bodar och allt annat etablerat som syns i ritningen. Flytten gäller bara det
   här bladet – den sparas i ritningen (el.moves: objekt-id -> [dx, dy] i meter) i utskriftsmallen. Planen och andra blad rörs inte, så samma plan kan
   få olika utseende på olika blad. ↺ Återställ lägger tillbaka allt; Delete återställer det senast flyttade objektet. Allt (förhandsvisning, PDF,
   bild) ritas med flytten via prWithMoves. */

/* Objektet flyttat dx, dy meter (alla typer: rektanglar har mittpunkt, övriga punkter). */
function prSiteTranslate(x, dx, dy) {
  const w = { ...x };
  if (x.pts) w.pts = x.pts.map(p => [p[0] + dx, p[1] + dy]);
  if (Number.isFinite(x.cx)) { w.cx = x.cx + dx; w.cy = x.cy + dy; }
  return w;
}
function prSiteList(el) {
  const mv = el && el.moves;
  if (!mv || !Object.keys(mv).length) return siteItems;
  return siteItems.map(x => (mv[x.id] ? prSiteTranslate(x, mv[x.id][0], mv[x.id][1]) : x));
}
/* Kör fn (synkront) med etableringsobjekten flyttade som ritningen vill ha dem. */
function prWithMoves(el, fn) {
  const list = prSiteList(el);
  if (list === siteItems) return fn();
  const saved = siteItems; siteItems = list;
  try { return fn(); } finally { siteItems = saved; }
}
/* Musen (layoutenheter) -> modellkoordinat i ritningen. */
function prMapToModel(el, mx, my) {
  const { k } = pageDims(), c0 = mToPx(el.center || [0, 0]), ppm = pxPerMeter(), f = k * el.scale / 1000 * ppm;
  const st = [c0[0] + (mx - (el.x + el.w / 2)) * f, c0[1] + (my - (el.y + el.h / 2)) * f];
  return pdfToModel(toPdf(st));
}
const prMetersPerUnit = el => pageDims().k * el.scale / 1000;
function prSegDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
/* Objektet (översta) under musen: med flytten applicerad och ritningens lagerläge. */
function prObjAt(el, mx, my) {
  const m = prMapToModel(el, mx, my), tol = Math.max(0.3, 2.5 * prMetersPerUnit(el)); // ~2,5 mm på papperet
  return withLayerState(JSON.parse(JSON.stringify(vpLayerState(el))), () => prWithMoves(el, () => {
    const vis = siteItems.filter(x => siteShown(x)).slice().reverse();
    for (const x of vis) {
      if (x.type === "pdfobj" || isRect(x) || x.type === "barrier") { if (pointInPoly(m, sitePoints(x))) return { id: x.id, name: x.name || (SITE_KINDS[x.type] || {}).label || x.type, model: m }; }
      else if (x.type === "fence" || x.type === "route" || x.type === "sketch") { const P = x.pts; for (let i = 1; i < P.length; i++) if (prSegDist(m, P[i - 1], P[i]) < tol) return { id: x.id, name: x.name || (SITE_KINDS[x.type] || {}).label, model: m }; }
      else if (x.type === "note") { const [a, t] = x.pts; if (Math.hypot(m[0] - t[0], m[1] - t[1]) < tol * 4 || prSegDist(m, a, t) < tol) return { id: x.id, name: x.name || "Notering", model: m }; }
      else if (x.pts && x.pts[0]) { const c = x.pts[0]; if (Math.hypot(m[0] - c[0], m[1] - c[1]) < tol * 4) return { id: x.id, name: x.name || (SITE_KINDS[x.type] || {}).label || x.type, model: m }; }
    }
    return null;
  }));
}
/* Musknapp nere i ✥-läget. Returnerar true när ett objekt greps. */
function prObjDown(el, mx, my, e) {
  const hit = prObjAt(el, mx, my);
  if (!hit) { pr.objSel = null; setPrintStatus("Inget objekt där – dra i ett objekt i ritningen."); return true; }
  pushUndo();
  pr.objSel = { el: el.id, id: hit.id };
  const cur = (el.moves && el.moves[hit.id]) || [0, 0];
  pr.drag = { kind: "objmove", el, id: hit.id, start: hit.model, cur: cur.slice(), moved: false };
  setPrintStatus(`${hit.name}: dra för att flytta (bara på det här bladet).`);
  return true;
}
function prObjMove(d, mx, my) {
  const m = prMapToModel(d.el, mx, my), el = d.el;
  d.moved = true;
  const dx = Math.round((d.cur[0] + m[0] - d.start[0]) * 100) / 100, dy = Math.round((d.cur[1] + m[1] - d.start[1]) * 100) / 100;
  if (!el.moves) el.moves = {};
  el.moves[d.id] = [dx, dy];
  if (typeof mapPreviews !== "undefined") { /* nästa mapPreview ser den nya nyckeln och ritar om */ }
  pr.dirty = true;
}
/* Delete: det markerade objektet läggs tillbaka. Anropas från tangenthanteringen. */
function prObjResetSel() {
  const s = pr && pr.objSel, el = s && pr.tpl.elements.find(x => x.id === s.el);
  if (!el || !el.moves || !el.moves[s.id]) return false;
  pushUndo(); delete el.moves[s.id]; if (!Object.keys(el.moves).length) delete el.moves; pr.objSel = null;
  renderPrintProps(); drawPrintPage(); setPrintStatus("Objektet är tillbaka på sin plats."); return true;
}
