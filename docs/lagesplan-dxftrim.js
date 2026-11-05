/* Trimma DXF-linjer (Victor 2026-11-05: "jag behöver också trim-verktyg") – gemensam geometri för 2D-redigeringen (lagesplan-cadedit.js) och 3D-redigeringen (lagesplan-3ddxf.js).
   Som i AutoCAD: tryck på den del av en linje som ska bort. Delen mellan de två närmaste skärningarna med andra linjer (eller linjens egna andra delar) tas bort; finns bara en skärning
   på ena sidan tas delen ut till linjens ände bort. Ingen skärning alls = ingenting trimmas. Linjer som består av flera punkter delas där skärningen ligger.
   dxfTrimCompute(ents, target, m, opts) → { ok, pieces: [pts, …], cut: [pts], reason } där pieces är det som blir kvar (0–2 delar) och cut det som tas bort. Rena funktioner utan beroenden. */
function dxfSegX(p, p2, q, q2) {   // skärning mellan två sträckor: { t, u, x, y } eller null (parallella och ändpunktsberöring räknas inte som korsning)
  const rx = p2[0] - p[0], ry = p2[1] - p[1], sx = q2[0] - q[0], sy = q2[1] - q[1], d = rx * sy - ry * sx;
  if (Math.abs(d) < 1e-12) return null;
  const t = ((q[0] - p[0]) * sy - (q[1] - p[1]) * sx) / d, u = ((q[0] - p[0]) * ry - (q[1] - p[1]) * rx) / d, E = 1e-9;
  if (t < -E || t > 1 + E || u < -E || u > 1 + E) return null;
  return { t: Math.max(0, Math.min(1, t)), u, x: p[0] + rx * t, y: p[1] + ry * t };
}
/* Läget längs linjen (segmentnummer + andel) närmast m. */
function dxfAlong(pts, m) {
  let best = { d: Infinity, s: 0 };
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-12, t = Math.max(0, Math.min(1, ((m[0] - a[0]) * dx + (m[1] - a[1]) * dy) / L2)), d = Math.hypot(a[0] + dx * t - m[0], a[1] + dy * t - m[1]); if (d < best.d) best = { d, s: i - 1 + t }; }
  return best;
}
function dxfTrimCompute(ents, target, m) {
  const P = target.pts; if (!P || P.length < 2) return { ok: false, reason: "Linjen har för få punkter." };
  const click = dxfAlong(P, m).s, X = [];   // X: lägen längs målet (segment + andel) där något korsar
  const addHit = (s, x, y) => { if (!X.some(h => Math.abs(h.s - s) < 1e-7)) X.push({ s, x, y }); };
  ents.forEach(e => {
    if (e.del || !e.pts || e.pts.length < 2) return;
    const same = e === target;
    for (let i = 1; i < P.length; i++) for (let j = 1; j < e.pts.length; j++) {
      if (same && j <= i + 1 && j >= i - 1) continue;   // en linjes egna grannsegment räknas inte
      const h = dxfSegX(P[i - 1], P[i], e.pts[j - 1], e.pts[j]); if (!h) continue; addHit(i - 1 + h.t, h.x, h.y);
    }
  });
  if (!X.length) return { ok: false, reason: "Ingen annan linje korsar den här – inget att trimma mot." };
  X.sort((a, b) => a.s - b.s);
  const eps = 1e-7, lo = [...X].reverse().find(h => h.s <= click - eps) || null, hi = X.find(h => h.s >= click + eps) || null;
  if (!lo && !hi) return { ok: false, reason: "Skärningen ligger precis där du tryckte – tryck en bit bort på linjen." };
  const upTo = h => { const k = Math.floor(h.s + 1e-12), i = Math.min(k, P.length - 2); return [...P.slice(0, i + 1), [h.x, h.y]]; };          // från början till skärningen
  const from = h => { const k = Math.min(Math.floor(h.s + 1e-12), P.length - 2); return [[h.x, h.y], ...P.slice(k + 1)]; };               // från skärningen till slutet
  const clean = pts => { const out = []; pts.forEach(p => { const l = out[out.length - 1]; if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > 1e-7) out.push(p); }); return out.length > 1 ? out : null; };
  const pieces = [], cut = [];
  if (lo) { const a = clean(upTo(lo)); if (a) pieces.push(a); }
  if (hi) { const b = clean(from(hi)); if (b) pieces.push(b); }
  // den bortklippta delen (för förhandsvisning)
  const s0 = lo ? lo.s : 0, s1 = hi ? hi.s : P.length - 1, mid = [];
  if (lo) mid.push([lo.x, lo.y]); else mid.push(P[0].slice());
  for (let i = 1; i < P.length - 1; i++) if (i > s0 + 1e-9 && i < s1 - 1e-9) mid.push(P[i].slice());
  if (hi) mid.push([hi.x, hi.y]); else mid.push(P[P.length - 1].slice());
  cut.push(...mid);
  return { ok: true, pieces, cut, removedLen: (function () { let L = 0; for (let i = 1; i < mid.length; i++) L += Math.hypot(mid[i][0] - mid[i - 1][0], mid[i][1] - mid[i - 1][1]); return L; })() };
}

/* Extend (Victor 2026-11-05: "lägg till extend också"): som i AutoCAD – tryck på en linje nära den ände som ska förlängas; änden dras ut i sin egen riktning tills den når
   närmaste andra linje (inom 1 000 m). dxfExtendCompute(ents, target, m) → { ok, end: "start"|"end", from, to, newPts, added } eller { ok:false, reason }. */
function dxfExtendCompute(ents, target, m) {
  const P = target.pts; if (!P || P.length < 2) return { ok: false, reason: "Linjen har för få punkter." };
  const dS = Math.hypot(P[0][0] - m[0], P[0][1] - m[1]), dE = Math.hypot(P[P.length - 1][0] - m[0], P[P.length - 1][1] - m[1]), atEnd = dE <= dS;
  const a = atEnd ? P[P.length - 1] : P[0], b = atEnd ? P[P.length - 2] : P[1], L = Math.hypot(a[0] - b[0], a[1] - b[1]);
  if (!(L > 1e-9)) return { ok: false, reason: "Änden har ingen riktning." };
  const ux = (a[0] - b[0]) / L, uy = (a[1] - b[1]) / L, far = [a[0] + ux * 1000, a[1] + uy * 1000];
  let best = null;
  ents.forEach(e => {
    if (e.del || !e.pts || e.pts.length < 2) return;
    for (let j = 1; j < e.pts.length; j++) {
      if (e === target) { const own = atEnd ? j >= P.length - 1 : j <= 1; if (own) continue; }   // linjens egen ände räknas inte
      const h = dxfSegX(a, far, e.pts[j - 1], e.pts[j]); if (!h || h.t * 1000 < 1e-6) continue;
      const d = h.t * 1000; if (!best || d < best.d) best = { d, x: h.x, y: h.y };
    }
  });
  if (!best) return { ok: false, reason: "Ingen linje ligger i förlängningen av änden." };
  const to = [best.x, best.y], newPts = P.map(p => p.slice()); if (atEnd) newPts[newPts.length - 1] = to; else newPts[0] = to;
  return { ok: true, end: atEnd ? "end" : "start", from: a.slice(), to, newPts, added: best.d };
}
