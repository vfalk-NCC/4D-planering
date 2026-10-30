/* Ritverktygen – geometrikärnan (Victor 2026-10-30: "komplett rit- och modelleringsverktyg inspirerat av SketchUp").

   Ren matematik med små, testbara funktioner. Allt som ritas lagras som en profil i ett plan (ytor och kroppar) eller som en punktlista (kurvor):
     plan   pl = { o: [x,y,z], u: [..], v: [..] }   (u × v = ytans framsida/normal n), lokala koordinater runt objektets ankarpunkt
     kontur loops = [ [[a,b],…], … ]               första = yttre, övriga = hål, i planets (a,b)-koordinater
     kropp  = en profil som dragits ut längs n med avståndet d (positivt eller negativt)
   Nät (pts + faces, 1-baserade trianglar, moturs sett utifrån) skapas därifrån för visning och IFC (samma form som övriga smarta objekt).
   Toleranser: MG.TOL (1 mm) för sammanfallande punkter, MG.EPS för noll. */

const MG = { TOL: 1e-3, EPS: 1e-9 };
MG.add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
MG.sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
MG.mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
MG.dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
MG.cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
MG.len = a => Math.hypot(a[0], a[1], a[2]);
MG.norm = a => { const l = MG.len(a); return l < MG.EPS ? [0, 0, 1] : [a[0] / l, a[1] / l, a[2] / l]; };
MG.dist = (a, b) => MG.len(MG.sub(a, b));
MG.lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
MG.near = (a, b, tol = MG.TOL) => MG.dist(a, b) <= tol;
MG.r3 = v => Math.round(v * 1000) / 1000;
MG.round3 = p => [MG.r3(p[0]), MG.r3(p[1]), MG.r3(p[2])];

/* ---- Plan ---- */
/* Plan med normal n genom o. u väljs så att ytor på marken får u = X och lodräta ytor får u vågrätt. */
MG.planeFrom = (n, o = [0, 0, 0], hint) => {
  n = MG.norm(n);
  let u;
  if (hint && MG.len(MG.sub(hint, MG.mul(n, MG.dot(hint, n)))) > 1e-6) u = MG.norm(MG.sub(hint, MG.mul(n, MG.dot(hint, n))));
  else if (Math.abs(n[2]) > 0.9) u = MG.norm(MG.sub([1, 0, 0], MG.mul(n, n[0])));   // vågräta ytor: u längs X
  else u = MG.norm(MG.cross([0, 0, 1], n));                                           // lodräta ytor: u vågrätt, v uppåt
  const v = MG.norm(MG.cross(n, u));
  return { o: o.slice(), u, v };
};
MG.normal = pl => MG.norm(MG.cross(pl.u, pl.v));
MG.to3 = (pl, p2) => [pl.o[0] + pl.u[0] * p2[0] + pl.v[0] * p2[1], pl.o[1] + pl.u[1] * p2[0] + pl.v[1] * p2[1], pl.o[2] + pl.u[2] * p2[0] + pl.v[2] * p2[1]];
MG.to2 = (pl, p3) => { const d = MG.sub(p3, pl.o); return [MG.dot(d, pl.u), MG.dot(d, pl.v)]; };
MG.planeDist = (pl, p3) => MG.dot(MG.sub(p3, pl.o), MG.normal(pl));
MG.project = (pl, p3) => MG.to3(pl, MG.to2(pl, p3));
/* Stråle (o, d) mot planet: punkten eller null. */
MG.rayPlane = (ro, rd, pl) => { const n = MG.normal(pl), dn = MG.dot(rd, n); if (Math.abs(dn) < 1e-9) return null; const t = MG.dot(MG.sub(pl.o, ro), n) / dn; return t < 0 ? null : { t, p: MG.add(ro, MG.mul(rd, t)) }; };
MG.samePlane = (a, b, tol = 1e-3) => { const na = MG.normal(a), nb = MG.normal(b); return Math.abs(Math.abs(MG.dot(na, nb)) - 1) < 1e-4 && Math.abs(MG.planeDist(a, b.o)) < tol; };

/* ---- Konturer i planet ---- */
MG.area2 = L => { let a = 0; for (let i = 0; i < L.length; i++) { const p = L[i], q = L[(i + 1) % L.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
MG.ccw = L => (MG.area2(L) < 0 ? L.slice().reverse() : L.slice());
MG.cw = L => (MG.area2(L) > 0 ? L.slice().reverse() : L.slice());
MG.pip = (L, p) => { let r = false; for (let i = 0, j = L.length - 1; i < L.length; j = i++) { const a = L[i], b = L[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) r = !r; } return r; };
MG.centroid2 = L => { let x = 0, y = 0, a = 0; for (let i = 0; i < L.length; i++) { const p = L[i], q = L[(i + 1) % L.length], c = p[0] * q[1] - q[0] * p[1]; a += c; x += (p[0] + q[0]) * c; y += (p[1] + q[1]) * c; } if (Math.abs(a) < 1e-12) { const n = L.length; return [L.reduce((s, p) => s + p[0], 0) / n, L.reduce((s, p) => s + p[1], 0) / n]; } return [x / (3 * a), y / (3 * a)]; };
/* Tar bort dubbletter (inom TOL) och punkter på rak linje. */
MG.clean = (L, closed = true) => {
  const out = [];
  L.forEach(p => { const l = out[out.length - 1]; if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > MG.TOL) out.push(p); });
  if (closed && out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= MG.TOL) out.pop();
  return out;
};
MG.rect2 = (a, b) => [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
MG.circle2 = (c, r, n = 48) => Array.from({ length: n }, (_, i) => { const t = 2 * Math.PI * i / n; return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]; });
MG.polygon2 = (c, r, n, rot = 0) => Array.from({ length: Math.max(3, n) }, (_, i) => { const t = rot + 2 * Math.PI * i / Math.max(3, n); return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]; });
/* Båge genom tre punkter (a, b och en punkt p på bågen) i planet: { c, r, a0, a1, ccw } eller null (på rät linje). */
MG.arc3 = (a, b, p) => {
  const ax = a[0], ay = a[1], bx = b[0], by = b[1], cx = p[0], cy = p[1], d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) return null;
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d, uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy), a0 = Math.atan2(ay - uy, ax - ux), a1 = Math.atan2(by - uy, bx - ux), ap = Math.atan2(cy - uy, cx - ux);
  const norm = x => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const ccw = norm(ap - a0) < norm(a1 - a0);   // p ligger på vägen moturs från a till b
  return { c: [ux, uy], r, a0, a1, ccw };
};
/* Båge från a till b med radien r; side = +1/−1 anger åt vilket håll (vänster/höger om a→b) bågen buktar. Mindre än halvcirkel. */
MG.arcRadius = (a, b, r, side = 1) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], c = Math.hypot(dx, dy); if (c < MG.EPS) return null;
  const rr = Math.max(r, c / 2), h = Math.sqrt(Math.max(0, rr * rr - c * c / 4)), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, nx = -dy / c, ny = dx / c;
  // centrum på motsatt sida om bukten: bågen buktar åt side, centrum ligger åt −side
  const cc = [mx - nx * h * side, my - ny * h * side];
  const a0 = Math.atan2(a[1] - cc[1], a[0] - cc[0]), a1 = Math.atan2(b[1] - cc[1], b[0] - cc[0]);
  return { c: cc, r: rr, a0, a1, ccw: side < 0 };
};
/* Punkter längs bågen (inklusive ändpunkterna), högst ~5° per steg. */
MG.arcPts = (A, n) => {
  const norm = x => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  let sweep = A.ccw ? norm(A.a1 - A.a0) : -norm(A.a0 - A.a1);
  if (Math.abs(sweep) < 1e-9) sweep = A.ccw ? 2 * Math.PI : -2 * Math.PI;
  const k = n || Math.max(4, Math.ceil(Math.abs(sweep) / (5 * Math.PI / 180)));
  return Array.from({ length: k + 1 }, (_, i) => { const t = A.a0 + sweep * i / k; return [A.c[0] + A.r * Math.cos(t), A.c[1] + A.r * Math.sin(t)]; });
};

/* ---- Förskjutning (Offset) av en kontur: d > 0 inåt, d < 0 utåt (för moturs kontur). Hörn med skarv (miter). null om konturen försvinner. ---- */
MG.offsetLoop = (loop, d) => {
  const L = MG.clean(MG.ccw(loop)); if (L.length < 3 || Math.abs(d) < MG.EPS) return L;
  const n = L.length, lines = [];
  for (let i = 0; i < n; i++) {
    const a = L[i], b = L[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey); if (l < MG.EPS) continue;
    const nx = -ey / l, ny = ex / l; // vänster normal (inåt för moturs)
    lines.push({ p: [a[0] + nx * d, a[1] + ny * d], d: [ex / l, ey / l] });
  }
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const A = lines[(i + lines.length - 1) % lines.length], B = lines[i], den = A.d[0] * B.d[1] - A.d[1] * B.d[0];
    if (Math.abs(den) < 1e-9) { out.push(B.p.slice()); continue; }
    const t = ((B.p[0] - A.p[0]) * B.d[1] - (B.p[1] - A.p[1]) * B.d[0]) / den;
    let p = [A.p[0] + A.d[0] * t, A.p[1] + A.d[1] * t];
    // vassa hörn (nästan vändning) kapas så att skarven inte skjuter iväg
    const lim = Math.abs(d) * 6, o = L[i]; if (Math.hypot(p[0] - o[0], p[1] - o[1]) > lim) p = [o[0] + (p[0] - o[0]) / Math.hypot(p[0] - o[0], p[1] - o[1]) * lim, o[1] + (p[1] - o[1]) / Math.hypot(p[0] - o[0], p[1] - o[1]) * lim];
    out.push(p);
  }
  let res = out;
  // Självskärningar (smala delar som försvinner): polygon-clipping ger den giltiga ytan.
  if (typeof polygonClipping !== "undefined") {
    try { const U = polygonClipping.union([[[...out, out[0]]]]); const best = U.map(pg => pg[0].slice(0, -1)).sort((x, y) => Math.abs(MG.area2(y)) - Math.abs(MG.area2(x)))[0]; res = best || []; } catch (e) { res = out; }
  }
  if (res.length < 3) return null;
  const a = MG.area2(res), a0 = MG.area2(L);
  if (d > 0 && Math.abs(a) >= Math.abs(a0)) return null; // inåt ska bli mindre
  if (d < 0 && Math.abs(a) <= Math.abs(a0)) return null;
  return MG.ccw(MG.clean(res));
};

/* ---- Nät ---- */
/* Triangulerar konturerna (yttre + hål) i planet: { v: [[a,b]…], t: [[i,j,k]…] } med moturs trianglar. */
MG.triangulate = loops => {
  const outer = MG.ccw(MG.clean(loops[0])), holes = loops.slice(1).map(h => MG.cw(MG.clean(h))).filter(h => h.length >= 3);
  if (outer.length < 3) return { v: [], t: [] };
  const V = [...outer, ...holes.flat()], vec = a => a.map(p => new THREE.Vector2(p[0], p[1]));
  const T = THREE.ShapeUtils.triangulateShape(vec(outer), holes.map(vec)).map(t => {
    const a = V[t[0]], b = V[t[1]], c = V[t[2]], ar = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    return ar < 0 ? [t[0], t[2], t[1]] : t;
  });
  return { v: V, t: T };
};
/* Yta (ett eller flera hål): 3D-punkter och trianglar (1-baserade) med framsidan längs n. */
MG.faceMesh = (pl, loops) => {
  const tr = MG.triangulate(loops); return { pts: tr.v.map(p => MG.to3(pl, p)), faces: tr.t.map(t => [t[0] + 1, t[1] + 1, t[2] + 1]) };
};
/* Kropp: profilen dragen d längs n. Stängt nät, normaler utåt. */
MG.solidMesh = (pl, loops, d) => {
  const n = MG.normal(pl), off = MG.mul(n, d), outer = MG.ccw(MG.clean(loops[0])), holes = loops.slice(1).map(h => MG.cw(MG.clean(h))).filter(h => h.length >= 3);
  const tr = MG.triangulate([outer, ...holes]), V = tr.v, N = V.length, pts = [], faces = [];
  V.forEach(p => pts.push(MG.to3(pl, p))); V.forEach(p => pts.push(MG.add(MG.to3(pl, p), off)));
  const flip = d < 0;
  tr.t.forEach(t => { // undersida (mot −n om d > 0) och översida (mot +n)
    faces.push(flip ? [t[0] + 1, t[1] + 1, t[2] + 1] : [t[0] + 1, t[2] + 1, t[1] + 1]);
    faces.push(flip ? [t[0] + N + 1, t[2] + N + 1, t[1] + N + 1] : [t[0] + N + 1, t[1] + N + 1, t[2] + N + 1]);
  });
  let base = 0; [outer, ...holes].forEach(L => { // väggar: ytterkontur moturs, hål medurs → utåt = bort från materialet
    for (let i = 0; i < L.length; i++) { const j = (i + 1) % L.length, a = base + i + 1, b = base + j + 1, a2 = a + N, b2 = b + N; if (flip) faces.push([a, a2, b2], [a, b2, b]); else faces.push([a, b, b2], [a, b2, a2]); }
    base += L.length;
  });
  return { pts, faces };
};
/* Rör längs en punktlista (kurva). */
MG.tube = (P, r = 0.02, closed = false, seg = 6) => {
  const pts = [], faces = []; if (P.length < 2) return { pts, faces };
  const Q = closed ? [...P, P[0]] : P, rings = [];
  let prevN = null;
  for (let i = 0; i < Q.length; i++) {
    const a = Q[Math.max(0, i - 1)], b = Q[Math.min(Q.length - 1, i + 1)];
    let t = MG.norm(MG.sub(b, a)); if (MG.len(MG.sub(b, a)) < MG.EPS) t = [1, 0, 0];
    let nn = prevN ? MG.sub(prevN, MG.mul(t, MG.dot(prevN, t))) : MG.cross(Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], t);
    if (MG.len(nn) < 1e-6) nn = MG.cross([0, 1, 0], t); nn = MG.norm(nn); prevN = nn;
    const bn = MG.norm(MG.cross(t, nn)), ring = [];
    for (let k = 0; k < seg; k++) { const an = 2 * Math.PI * k / seg; pts.push(MG.add(Q[i], MG.add(MG.mul(nn, Math.cos(an) * r), MG.mul(bn, Math.sin(an) * r)))); ring.push(pts.length); }
    rings.push(ring);
  }
  for (let i = 0; i + 1 < rings.length; i++) for (let k = 0; k < seg; k++) { const a = rings[i][k], b = rings[i][(k + 1) % seg], c = rings[i + 1][(k + 1) % seg], d = rings[i + 1][k]; faces.push([a, b, c], [a, c, d]); }
  if (!closed) [[0, -1], [rings.length - 1, 1]].forEach(([ri, sg]) => { pts.push(Q[ri].slice()); const c = pts.length, R = rings[ri]; for (let k = 0; k < seg; k++) faces.push(sg > 0 ? [c, R[k], R[(k + 1) % seg]] : [c, R[(k + 1) % seg], R[k]]); });
  return { pts, faces };
};

/* ---- Sluten kontur ur linjer (Face Creation) ----
   segs = [[p3, q3], …] i samma plan. Hittar den minsta slutna konturen som innehåller segmentet seg0 (index) – eller null. */
MG.findLoop = (segs, seg0, tol = MG.TOL) => {
  const nodes = [], id = p => { for (let i = 0; i < nodes.length; i++) if (MG.near(nodes[i], p, tol)) return i; nodes.push(p); return nodes.length - 1; };
  const E = segs.map(s => [id(s[0]), id(s[1])]);
  const adj = nodes.map(() => []); E.forEach((e, i) => { if (e[0] === e[1]) return; adj[e[0]].push([e[1], i]); adj[e[1]].push([e[0], i]); });
  const s0 = E[seg0]; if (!s0 || s0[0] === s0[1]) return null;
  // Kortaste väg från s0[1] tillbaka till s0[0] utan att använda s0 (bredden först).
  const prev = new Map(), q = [s0[1]]; prev.set(s0[1], null);
  while (q.length) {
    const u = q.shift(); if (u === s0[0]) break;
    adj[u].forEach(([v, ei]) => { if (ei === seg0 || prev.has(v)) return; prev.set(v, [u, ei]); q.push(v); });
  }
  if (!prev.has(s0[0])) return null;
  const walk = []; let k = s0[0];
  while (k !== null && k !== undefined) { walk.push(k); const pv = prev.get(k); k = pv ? pv[0] : null; } // s0[0] … s0[1]
  const ring = walk.reverse(); // s0[1] … s0[0]: ringen i ordning
  return ring.length >= 3 ? ring.map(i => nodes[i]) : null;
};
