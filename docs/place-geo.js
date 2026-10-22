/* Geometriverktyg för bemanningen och de smarta objekten (Victor 2026-10-23: "jobba igenom grafiken … samma detaljnivå och snygghet som mobilkranen").
   Ren matematik – inget THREE – så att samma former kan ritas i 3D-editorn OCH skrivas till IFC (även i Trimble Connect-fönstret).
   En form är { pts: [[x,y,z]…], faces: [[i,j,k]…] } (1-baserade index, moturs sett utifrån). Former sätts ihop i en TK-samling (tkNew) per färg/material
   och placeras med mitt + rotation (yaw runt Z, pitch runt Y, roll runt X). */
const TK = {};
TK.rot = (yaw = 0, pitch = 0, roll = 0) => {
  const cz = Math.cos(yaw), sz = Math.sin(yaw), cy = Math.cos(pitch), sy = Math.sin(pitch), cx = Math.cos(roll), sx = Math.sin(roll);
  // R = Rz(yaw) · Ry(pitch) · Rx(roll)
  return [[cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx], [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx], [-sy, cy * sx, cy * cx]];
};
TK.new = (o) => ({ loc: [], faces: [], ...(o || {}) });
/* Lägger in en form i samlingen T: mitt (cx,cy,cz) och rotation r = [yaw,pitch,roll] (valfri). */
TK._sg = 0;
TK.add = (T, g, cx, cy, cz, r) => {
  const R = r ? TK.rot(r[0] || 0, r[1] || 0, r[2] || 0) : null, base = T.loc.length, sgid = g.smooth ? ++TK._sg : 0; T.sg = T.sg || [];
  g.pts.forEach(([x, y, z]) => { if (R) { const X = R[0][0] * x + R[0][1] * y + R[0][2] * z, Y = R[1][0] * x + R[1][1] * y + R[1][2] * z, Z = R[2][0] * x + R[2][1] * y + R[2][2] * z; T.loc.push([X + cx, Y + cy, Z + cz]); } else T.loc.push([x + cx, y + cy, z + cz]); });
  g.faces.forEach((f, i) => { T.faces.push([f[0] + base, f[1] + base, f[2] + base]); T.sg.push(g.flatFrom != null && i >= g.flatFrom ? 0 : sgid); });
  return T;
};
/* Låda sx × sy × sz med valfri avfasning/rundning b (m). seg: 2 = fas, 3 = rundare. */
TK.box = (sx, sy, sz, b = 0, seg = 2) => {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2; b = Math.min(b, hx, hy, hz);
  if (b <= 1e-6) return { pts: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], faces: [[1, 3, 2], [1, 4, 3], [5, 6, 7], [5, 7, 8], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 4, 8], [3, 8, 7], [4, 1, 5], [4, 5, 8]] };
  const bp = h => (seg >= 3 ? [-h, -h + b * 0.29, -h + b, h - b, h - b * 0.29, h] : [-h, -h + b, h - b, h]), pts = [], faces = [];
  const clamp = (v, h) => Math.max(-(h - b), Math.min(h - b, v));
  const map = (x, y, z) => { const ix = clamp(x, hx), iy = clamp(y, hy), iz = clamp(z, hz), dx = x - ix, dy = y - iy, dz = z - iz, l = Math.hypot(dx, dy, dz); return l > 1e-9 ? [ix + dx / l * b, iy + dy / l * b, iz + dz / l * b] : [x, y, z]; };
  const BX = bp(hx), BY = bp(hy), BZ = bp(hz);
  // sex sidor: (axel, tecken); u,v = övriga axlar så att u × v = utåt
  [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]].forEach(([ax, sg]) => {
    const U = ax === 0 ? BY : ax === 1 ? BZ : BX, V = ax === 0 ? BZ : ax === 1 ? BX : BY, H = [hx, hy, hz][ax], base = pts.length;
    U.forEach(u => V.forEach(v => { const q = ax === 0 ? [sg * H, u, v] : ax === 1 ? [v, sg * H, u] : [u, v, sg * H]; pts.push(map(q[0], q[1], q[2])); }));
    const nu = U.length, nv = V.length;
    for (let i = 0; i + 1 < nu; i++) for (let j = 0; j + 1 < nv; j++) { const a = base + i * nv + j + 1, c = base + (i + 1) * nv + j + 1, d = base + (i + 1) * nv + j + 2, e = base + i * nv + j + 2; if (sg > 0) faces.push([a, c, d], [a, d, e]); else faces.push([a, d, c], [a, e, d]); }
  });
  return { pts, faces, smooth: true };
};
/* Stympad kon/cylinder längs axeln ('x'|'y'|'z') med radie r0 i början och r1 i slutet, längd len, centrerad. */
TK.cyl = (axis, r0, r1, len, seg = 12, caps = true) => {
  const pts = [], faces = [], h = len / 2;
  for (let i = 0; i < seg; i++) { const t = i * 2 * Math.PI / seg; pts.push([r0 * Math.cos(t), r0 * Math.sin(t), -h]); }
  for (let i = 0; i < seg; i++) { const t = i * 2 * Math.PI / seg; pts.push([r1 * Math.cos(t), r1 * Math.sin(t), h]); }
  for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; faces.push([i + 1, j + 1, j + seg + 1], [i + 1, j + seg + 1, i + seg + 1]); }
  const flat = [];
  if (caps && r0 > 1e-6) { const o = pts.length; for (let i = 0; i < seg; i++) { const t = i * 2 * Math.PI / seg; pts.push([r0 * Math.cos(t), r0 * Math.sin(t), -h]); } pts.push([0, 0, -h]); const c0 = pts.length; for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; flat.push([c0, o + j + 1, o + i + 1]); } }
  if (caps && r1 > 1e-6) { const o = pts.length; for (let i = 0; i < seg; i++) { const t = i * 2 * Math.PI / seg; pts.push([r1 * Math.cos(t), r1 * Math.sin(t), h]); } pts.push([0, 0, h]); const c1 = pts.length; for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; flat.push([c1, o + i + 1, o + j + 1]); } }
  const P = axis === "z" ? q => q : axis === "x" ? ([x, y, z]) => [z, x, y] : ([x, y, z]) => [x, z, -y];
  return { pts: pts.map(P), faces: [...faces, ...flat], smooth: true, flatFrom: faces.length };
};
/* Elliptisk stympad kon längs Z: radier (rx0,ry0) nedtill och (rx1,ry1) upptill – bålar, tunnor, kjolar. */
TK.ecyl = (rx0, ry0, rx1, ry1, len, seg = 12, caps = true) => {
  const g = TK.cyl("z", 1, 1, len, seg, caps), h = len / 2;
  g.pts = g.pts.map(([x, y, z]) => { const t = (z + h) / len, rx = rx0 + (rx1 - rx0) * t, ry = ry0 + (ry1 - ry0) * t; return [x * rx, y * ry, z]; });
  return g;
};
/* Ellipsoid (klot): radier rx,ry,rz, seg runt, rings över. */
TK.sphere = (rx, ry = rx, rz = rx, seg = 12, rings = 7) => {
  const pts = [], faces = []; pts.push([0, 0, -rz]);
  for (let k = 1; k < rings; k++) { const ph = -Math.PI / 2 + k * Math.PI / rings, cz = Math.sin(ph), cr = Math.cos(ph); for (let i = 0; i < seg; i++) { const t = i * 2 * Math.PI / seg; pts.push([rx * cr * Math.cos(t), ry * cr * Math.sin(t), rz * cz]); } }
  pts.push([0, 0, rz]); const top = pts.length;
  for (let i = 0; i < seg; i++) faces.push([1, 2 + (i + 1) % seg, 2 + i]);
  for (let k = 0; k + 1 < rings - 1; k++) for (let i = 0; i < seg; i++) { const a = 2 + k * seg + i, b = 2 + k * seg + (i + 1) % seg, c = 2 + (k + 1) * seg + (i + 1) % seg, d = 2 + (k + 1) * seg + i; faces.push([a, b, c], [a, c, d]); }
  const last = 2 + (rings - 2) * seg; for (let i = 0; i < seg; i++) faces.push([top, last + i, last + (i + 1) % seg]);
  return { pts, faces };
};
/* Svarvad form: profil [[radie, z]…] från botten till toppen roteras runt Z (kupol, kopp, tunna …); stängd i ändarna om radie > 0. */
TK.lathe = (profile, seg = 14) => {
  const pts = [], faces = [], n = profile.length;
  profile.forEach(([r, z]) => { for (let i = 0; i < seg; i++) { const t = i * 2 * Math.PI / seg; pts.push([r * Math.cos(t), r * Math.sin(t), z]); } });
  for (let k = 0; k + 1 < n; k++) for (let i = 0; i < seg; i++) { const j = (i + 1) % seg, a = k * seg + i + 1, b = k * seg + j + 1, c = (k + 1) * seg + j + 1, d = (k + 1) * seg + i + 1; faces.push([a, b, c], [a, c, d]); }
  if (profile[0][0] > 1e-6) { pts.push([0, 0, profile[0][1]]); const c0 = pts.length; for (let i = 0; i < seg; i++) faces.push([c0, (i + 1) % seg + 1, i + 1]); }
  if (profile[n - 1][0] > 1e-6) { pts.push([0, 0, profile[n - 1][1]]); const c1 = pts.length, o = (n - 1) * seg; for (let i = 0; i < seg; i++) faces.push([c1, o + i + 1, o + (i + 1) % seg + 1]); }
  return { pts, faces, smooth: true };
};
/* Ring (rör med rektangulärt tvärsnitt) mellan radie r0 och r1, z0..z1 – utan lock mot axeln. */
TK.ring = (r0, r1, z0, z1, seg = 48) => {
  const pts = [], faces = [];
  for (let i = 0; i < seg; i++) { const t = i * 2 * Math.PI / seg, c = Math.cos(t), s = Math.sin(t); pts.push([r1 * c, r1 * s, z0], [r1 * c, r1 * s, z1], [r0 * c, r0 * s, z1], [r0 * c, r0 * s, z0]); }
  for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4, a = i * 4 + k + 1, b = i * 4 + k2 + 1, c = j * 4 + k2 + 1, d = j * 4 + k + 1; faces.push([a, d, c], [a, c, b]); } }
  return { pts, faces };
};
/* Plan polygon [[x,y]…] (moturs) utdragen mellan z0 och z1. */
TK.prism = (poly, z0, z1) => {
  const n = poly.length, pts = [...poly.map(q => [q[0], q[1], z0]), ...poly.map(q => [q[0], q[1], z1])], faces = [];
  for (let k = 1; k + 1 < n; k++) faces.push([1, k + 2, k + 1], [n + 1, n + k + 1, n + k + 2]);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; faces.push([i + 1, j + 1, j + n + 1], [i + 1, j + n + 1, i + n + 1]); }
  return { pts, faces };
};
/* Polygon i planet (a, z) [[x,z]…] utdragen i b-led mellan b0 och b1 – för symboler och skyltar som står upp (kors, pilar, bokstäver). */
TK.prismB = (poly, b0, b1) => { const g = TK.prism(poly, b0, b1); return { pts: g.pts.map(([x, y, z]) => [x, z, y]), faces: g.faces.map(([a, b, c]) => [a, c, b]) }; };
/* Rund/rak list (stav) mellan två punkter med runt tvärsnitt (r) – för rör, stolpar, bommar. */
TK.rod = (a, b, r0, r1 = r0, seg = 8) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.hypot(dx, dy, dz) || 1e-6, g = TK.cyl("z", r0, r1, L, seg), yaw = Math.atan2(dy, dx), pitch = Math.acos(Math.max(-1, Math.min(1, dz / L)));
  const R = TK.rot(yaw, pitch, 0), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return { pts: g.pts.map(([x, y, z]) => [R[0][0] * x + R[0][1] * y + R[0][2] * z + c[0], R[1][0] * x + R[1][1] * y + R[1][2] * z + c[1], R[2][0] * x + R[2][1] * y + R[2][2] * z + c[2]]), faces: g.faces, smooth: true, flatFrom: g.flatFrom };
};
/* Signerad volym (m³) för en sluten form – används i tester för att kontrollera att ytorna vetter utåt. */
TK.volume = g => { let v = 0; g.faces.forEach(([a, b, c]) => { const A = g.pts[a - 1], B = g.pts[b - 1], C = g.pts[c - 1]; v += (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6; }); return v; };
