/* Stöden följer berget (Victor 2026-11-12: "stöttornas placering anpassas mot berget … mot punktmolnet, eller valfri modell").
   gjutBuild (place-smart-objs.js) frågar efter en markfunktion när fältet "Stöden följer berget" har ett underlag valt (punktmoln, 3D-modell, DXF, ritat objekt – samma lista som Volym och Byggväg).
   Underlaget görs om till en höjdkarta (en gång per underlag och område, sparas en kort stund) och ger markhöjden vid reglarnas och snedstagens fötter.
   Gäller både etappen runt fundament och den fria formen. Prefix l3gg. */
const l3gg = { cache: new Map() };
function gjutGround(p, key, zb, poly) {
  const S = p.__src; if (!S || !key || typeof l3dfBuild !== "function" || typeof l3dfSources !== "function" || !l3dfSources().some(q => q.k === key)) return null;
  const rot = (Number(S.rot) || 0) * Math.PI / 180, cs = Math.cos(rot), sn = Math.sin(rot), abs = (lx, ly) => [(Number(S.x) || 0) + lx * cs - ly * sn, (Number(S.y) || 0) + lx * sn + ly * cs];
  const m = 10, xs = poly.map(q => q[0]), ys = poly.map(q => q[1]), cor = [[Math.min(...xs) - m, Math.min(...ys) - m], [Math.max(...xs) + m, Math.min(...ys) - m], [Math.max(...xs) + m, Math.max(...ys) + m], [Math.min(...xs) - m, Math.max(...ys) + m]].map(q => abs(q[0], q[1]));
  const bd = { x0: Math.min(...cor.map(q => q[0])), x1: Math.max(...cor.map(q => q[0])), y0: Math.min(...cor.map(q => q[1])), y1: Math.max(...cor.map(q => q[1])) }, ck = `${S.id}|${key}|${bd.x0.toFixed(1)},${bd.y0.toFixed(1)},${bd.x1.toFixed(1)},${bd.y1.toFixed(1)}`;
  let hit = l3gg.cache.get(ck);
  if (!hit || Date.now() - hit.t > 30000) {
    const g = l3dfGrid(bd, Math.max(0.25, Math.sqrt(((bd.x1 - bd.x0) * (bd.y1 - bd.y0)) / 60000)));
    let ok = false; try { ok = !!l3dfBuild(key, g); } catch (e) { console.warn("Stöd mot berget", e); }
    hit = { g, ok, t: Date.now() }; l3gg.cache.set(ck, hit); if (l3gg.cache.size > 20) l3gg.cache.delete(l3gg.cache.keys().next().value);
  }
  if (!hit.ok) return null;
  const base0 = (Number(S.z) || 0) + (Number(S.dz) || 0);   // gruppens höjd; lokala höjder räknas från den
  return (lx, ly) => { const [X, Y] = abs(lx, ly), z = l3volGridZ(hit.g, X, Y); return z === null || z === undefined ? null : z - base0 - zb; };
}
