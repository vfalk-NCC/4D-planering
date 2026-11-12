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
    let ok = false; try { ok = !!l3dfBuild(key, g); if (ok && typeof l3dfFill === "function") l3dfFill(g, 12); } catch (e) { console.warn("Stöd mot berget", e); }   // glesa punktmoln: fyll hålen så att alla stöd får en markhöjd
    hit = { g, ok, t: Date.now() }; l3gg.cache.set(ck, hit); if (l3gg.cache.size > 20) l3gg.cache.delete(l3gg.cache.keys().next().value);
  }
  if (!hit.ok) return null;
  const base0 = (Number(S.z) || 0) + (Number(S.dz) || 0);   // gruppens höjd; lokala höjder räknas från den
  const g = hit.g, near = (X, Y) => {   // närmaste ruta med höjd när interpoleringen saknar granne (hål i punktmolnet, kant på ytan)
    const z0 = l3volGridZ(g, X, Y); if (z0 !== null && z0 !== undefined && Number.isFinite(z0)) return z0;
    const ci = Math.floor((X - g.x0) / g.cell), cj = Math.floor((Y - g.y0) / g.cell);
    for (let r = 1; r <= 16; r++) { let best = null, bd = Infinity; for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const ii = ci + di, jj = cj + dj; if (ii < 0 || jj < 0 || ii >= g.nx || jj >= g.ny) continue; const v = g.z[jj * g.nx + ii]; if (!Number.isFinite(v)) continue; const d = di * di + dj * dj; if (d < bd) { bd = d; best = v; } } if (best !== null) return best; }
    return null;
  };
  return (lx, ly) => { const [X, Y] = abs(lx, ly), z = near(X, Y); return z === null ? null : z - base0 - zb; };
}
