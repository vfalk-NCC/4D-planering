/* Rätt roterade fotavtryck (Victor 2026-11-05: "fotavtrycken ligger snett – de ska rotera rätt").
   Trimble Connect ger bara axelparallella rutor (bounding box). Här räknas objektens riktiga fotavtryck ut ur 3D-modellens geometri:
   konvex kontur i planet → minsta omslutande rektangel (roterad). Sparas som p.fp = [x1,y1,…,x4,y4] (modellmeter) i plan_item_positions.json
   och används av objectShapesInPdf. Kräver att modellerna är laddade i 3D-editorn. */
function fpHull(pts) {   // konvext hölje (monotone chain), pts = [[x,y]…]
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (P.length < 3) return P;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  lo.pop(); up.pop(); return lo.concat(up);
}
function fpMinRect(pts) {   // minsta roterade rektangel → { corners:[[x,y]×4], area, ang }
  const H = fpHull(pts); if (H.length < 3) return null; let best = null;
  for (let i = 0; i < H.length; i++) {
    const a = H[i], b = H[(i + 1) % H.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (L < 1e-9) continue;
    const ux = dx / L, uy = dy / L; let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of H) { const u = (p[0] - a[0]) * ux + (p[1] - a[1]) * uy, v = -(p[0] - a[0]) * uy + (p[1] - a[1]) * ux; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; }
    const area = (u1 - u0) * (v1 - v0); if (best && area >= best.area) continue;
    const at = (u, v) => [a[0] + u * ux - v * uy, a[1] + u * uy + v * ux];
    best = { area, ang: Math.atan2(uy, ux), corners: [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)] };
  }
  return best;
}
/* Fotavtryck per punkt-id ur de laddade 3D-modellerna: Map(itemId → { fp:[8 tal], ang }) – bara för objekt där rektangeln skiljer sig från axelrutan. */
function fpFromModels() {
  const out = new Map(); if (typeof l3b === "undefined" || !l3b.models || !l3b.models.length || typeof l3 === "undefined" || !l3) return out;
  const O = l3.O || [0, 0, 0], by = new Map();
  l3b.models.forEach(m => m.meshes.forEach(mesh => {
    const u = mesh.userData.l3b; if (!u || !u.ranges) return; const pos = mesh.geometry.getAttribute("position").array; mesh.updateMatrixWorld(true); const M = mesh.matrixWorld.elements;
    u.ranges.forEach(r => { if (!r.itemId) return; let a = by.get(r.itemId); if (!a) by.set(r.itemId, a = []);
      const step = Math.max(1, Math.floor(r.count / 4000));   // stora objekt: glesa ut punkterna (hållet ändras knappt)
      for (let i = r.start; i < r.start + r.count; i += step) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; a.push([M[0] * x + M[4] * y + M[8] * z + M[12] + O[0], M[1] * x + M[5] * y + M[9] * z + M[13] + O[1]]); }
    });
  }));
  by.forEach((pts, id) => {
    const R = fpMinRect(pts); if (!R) return; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach(p => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; });
    if (R.area > (x1 - x0) * (y1 - y0) * 0.97) return;   // redan rakt – ingen roterad ruta behövs
    out.set(id, { fp: R.corners.flatMap(c => [Math.round(c[0] * 1000) / 1000, Math.round(c[1] * 1000) / 1000]), ang: Math.round(R.ang * 1e5) / 1e5 });
  });
  return out;
}
async function fpRun() {
  if (typeof l3b === "undefined" || !l3b.models || !l3b.models.length) { setSaveStatus("📐 Öppna 3D-editorn och ladda modellerna först – fotavtrycken räknas ut ur modellens geometri."); return 0; }
  setSaveStatus("📐 Räknar ut fotavtrycken…"); await new Promise(r => setTimeout(r, 30));
  const res = fpFromModels(); if (!res.size) { setSaveStatus("📐 Inga roterade fotavtryck hittades (objekten ligger redan rakt, eller är inte kopplade till 3D-modellen)."); return 0; }
  const rows = []; res.forEach((v, id) => { const p = positions.find(q => q.id === id); if (p) { p.fp = v.fp; p.ang = v.ang; rows.push({ id, fp: v.fp, ang: v.ang }); } });
  invalidatePositions(); renderZones();
  try { await objWritePositions(rows, "Lägesplan: roterade fotavtryck"); setSaveStatus(`📐 ${rows.length} fotavtryck roterade rätt och sparade.`); }
  catch (e) { setSaveStatus(`📐 ${rows.length} fotavtryck roterade (kunde inte sparas: ${e.message}).`); }
  return rows.length;
}
function fpBind() { const b = document.getElementById("btnFpRotate"); if (b) b.onclick = () => { fpRun(); }; }
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fpBind); else fpBind();
