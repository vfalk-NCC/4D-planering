/* Gräv-simulator (Victor 2026-11-24: "simulerar jord/morän som en solid i meshen från punktmolnet som man kan gräva i med grävmaskinen i WASD-läget … försvinner volym som på riktigt").
   Underlaget är meshen från "Skapa mesh" (Lager → ⋯ på molnet): den läggs över ett höjdraster (en höjd per ruta) som blir en tät jordkropp med sidor ner till en botten.
   Skopspetsen (grävmaskinens "tip") sveper genom marken och sänker rutorna den passerar – volymen som försvinner räknas i m³ (fast mått) och blir last i skopan
   (uppluckrad med en faktor). Lasten töms i en hög där skopan hålls öppen över marken, eller med knappen. Prefix l3dig. */
const l3dig = { on: false, group: null, mesh: null, skirt: null, hf: null, removed: 0, piled: 0, load: 0, cap: 1.2, swell: 1.3, prev: new WeakMap(), repose: true, angle: 38, fx: true, snd: false, ac: null, sndT: 0, spill: 0, dirty: null, pts: null, t0: 0 };
const L3DIG_REL = 0.04;

/* ---- Höjdraster av meshen ---- */
function l3digBuild(r, cell) {
  const O = l3.O, V = r.V, F = r.F, nT = F.length / 3;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < V.length; i++) { const v = V[i]; if (v[0] < x0) x0 = v[0]; if (v[0] > x1) x1 = v[0]; if (v[1] < y0) y0 = v[1]; if (v[1] > y1) y1 = v[1]; }
  cell = Math.max(0.05, cell || 0.25); while (((x1 - x0) / cell + 1) * ((y1 - y0) / cell + 1) > 420000) cell *= 1.25;
  const nx = Math.floor((x1 - x0) / cell) + 1, ny = Math.floor((y1 - y0) / cell) + 1, H = new Float32Array(nx * ny).fill(NaN), C = new Uint8Array(nx * ny * 3);
  const FC = r.FC;
  for (let t = 0; t < nT; t++) {
    const a = V[F[t * 3]], b = V[F[t * 3 + 1]], c = V[F[t * 3 + 2]];
    const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) - x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((Math.max(a[0], b[0], c[0]) - x0) / cell)), j0 = Math.max(0, Math.floor((Math.min(a[1], b[1], c[1]) - y0) / cell)), j1 = Math.min(ny - 1, Math.ceil((Math.max(a[1], b[1], c[1]) - y0) / cell));
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]); if (Math.abs(d) < 1e-12) continue;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = x0 + i * cell, py = y0 + j * cell, l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / d, l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / d, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const z = l1 * a[2] + l2 * b[2] + l3 * c[2], k = j * nx + i; if (!(H[k] >= z)) { H[k] = z; const col = FC ? FC[t] : [150, 130, 105]; C[k * 3] = col[0]; C[k * 3 + 1] = col[1]; C[k * 3 + 2] = col[2]; }
    }
  }
  let zmin = Infinity, n = 0; for (let k = 0; k < H.length; k++) if (H[k] === H[k]) { n++; if (H[k] < zmin) zmin = H[k]; }
  if (!n) throw new Error("Meshen har inga trianglar att gräva i.");
  // fyll enstaka hål (rutor utan träff) med grannarnas medel så att jorden blir tät
  for (let pass = 0; pass < 2; pass++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) { const k = j * nx + i; if (H[k] === H[k]) continue; let s = 0, m = 0, cc = [0, 0, 0]; [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([di, dj]) => { const q = k + dj * nx + di; if (H[q] === H[q]) { s += H[q]; m++; cc[0] += C[q * 3]; cc[1] += C[q * 3 + 1]; cc[2] += C[q * 3 + 2]; } }); if (m >= 3) { H[k] = s / m; C[k * 3] = cc[0] / m; C[k * 3 + 1] = cc[1] / m; C[k * 3 + 2] = cc[2] / m; } }
  return { nx, ny, cell, x0: x0 - O[0], y0: y0 - O[1], H, H0: Float32Array.from(H), C, base: zmin - O[2] - 2, dz: O[2], valid: n };
}
function l3digMake(r, cell) {
  l3digClear();
  const hf = l3digBuild(r, cell), { nx, ny } = hf, O = l3.O;
  for (let k = 0; k < hf.H.length; k++) if (hf.H[k] === hf.H[k]) { hf.H[k] -= O[2]; hf.H0[k] = hf.H[k]; }
  const pos = new Float32Array(nx * ny * 3), nor = new Float32Array(nx * ny * 3), col = new Float32Array(nx * ny * 3), idx = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; pos[k * 3] = hf.x0 + i * hf.cell; pos[k * 3 + 1] = hf.y0 + j * hf.cell; pos[k * 3 + 2] = hf.H[k] === hf.H[k] ? hf.H[k] : hf.base; nor[k * 3 + 2] = 1; col[k * 3] = hf.C[k * 3] / 255; col[k * 3 + 1] = hf.C[k * 3 + 1] / 255; col[k * 3 + 2] = hf.C[k * 3 + 2] / 255; }
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; if ([a, b, c, d].every(q => hf.H[q] === hf.H[q])) idx.push(a, b, d, a, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.setIndex(idx.length > 65535 * 3 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); mesh.userData.dig = true; mesh.frustumCulled = false;
  const grp = new THREE.Group(); grp.name = "digSoil"; grp.add(mesh); l3.scene.add(grp);
  l3dig.group = grp; l3dig.mesh = mesh; l3dig.hf = hf; l3dig.removed = 0; l3dig.piled = 0; l3dig.load = 0; l3dig.on = true;
  l3digNormals(0, 0, nx - 1, ny - 1); l3digSkirt(true);
  l3Render(); return hf;
}
function l3digClear() {
  if (l3dig.group) { l3.scene.remove(l3dig.group); l3dig.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  l3dig.group = l3dig.mesh = l3dig.skirt = l3dig.hf = l3dig.pts = null; l3dig.dirty = null; l3dig.on = false; l3dig.load = 0; l3dig.removed = 0; l3dig.piled = 0;
}
/* Färg: orörd mark behåller meshens färger; uppgrävd jord blir mörk, fuktig brun (ju djupare desto mörkare), utlagd jord ljusare och torrare. */
function l3digColors(i0, j0, i1, j1) {
  const hf = l3dig.hf, col = l3dig.mesh.geometry.getAttribute("color"), { nx, ny, H, H0, C } = hf; if (!col) return;
  for (let j = Math.max(0, j0 - 1); j <= Math.min(ny - 1, j1 + 1); j++) for (let i = Math.max(0, i0 - 1); i <= Math.min(nx - 1, i1 + 1); i++) {
    const k = j * nx + i; if (!(H[k] === H[k])) continue; const d = H[k] - H0[k]; let r = C[k * 3] / 255, g = C[k * 3 + 1] / 255, b = C[k * 3 + 2] / 255;
    if (d < -0.03) { const t = Math.min(1, -d / 1.5), dr = 0.36 - 0.14 * t, dg = 0.26 - 0.1 * t, db = 0.17 - 0.07 * t, m = Math.min(1, -d / 0.15); r += (dr - r) * m; g += (dg - g) * m; b += (db - b) * m; }
    else if (d > 0.03) { const m = Math.min(1, d / 0.2); r += (0.55 - r) * m; g += (0.42 - g) * m; b += (0.28 - b) * m; }
    col.array[k * 3] = r; col.array[k * 3 + 1] = g; col.array[k * 3 + 2] = b;
  }
  col.needsUpdate = true;
}
/* Normaler ur höjderna (centraldifferens) för de rutor som ändrats. */
function l3digNormals(i0, j0, i1, j1) {
  const hf = l3dig.hf, nor = l3dig.mesh.geometry.getAttribute("normal"), { nx, ny, H, cell } = hf, h = (i, j) => { const v = H[Math.max(0, Math.min(ny - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))]; return v === v ? v : hf.base; };
  for (let j = Math.max(0, j0 - 1); j <= Math.min(ny - 1, j1 + 1); j++) for (let i = Math.max(0, i0 - 1); i <= Math.min(nx - 1, i1 + 1); i++) {
    const dx = (h(i + 1, j) - h(i - 1, j)) / (2 * cell), dy = (h(i, j + 1) - h(i, j - 1)) / (2 * cell), l = Math.hypot(dx, dy, 1), k = j * nx + i; nor.array[k * 3] = -dx / l; nor.array[k * 3 + 1] = -dy / l; nor.array[k * 3 + 2] = 1 / l;
  }
  nor.needsUpdate = true;
}
/* Sidor ner till botten runt jordkroppen (en lång remsa runt kanten) – gör jorden till en solid. */
function l3digSkirt(build) {
  const hf = l3dig.hf, { nx, ny } = hf;
  if (build || !l3dig.skirt) {
    if (l3dig.skirt) { l3dig.group.remove(l3dig.skirt); l3dig.skirt.geometry.dispose(); }
    const ring = []; for (let i = 0; i < nx; i++) ring.push([i, 0]); for (let j = 1; j < ny; j++) ring.push([nx - 1, j]); for (let i = nx - 2; i >= 0; i--) ring.push([i, ny - 1]); for (let j = ny - 2; j > 0; j--) ring.push([0, j]);
    const n = ring.length, pos = new Float32Array(n * 2 * 3), idx = []; for (let q = 0; q < n; q++) { const nq = (q + 1) % n; idx.push(q * 2, nq * 2, nq * 2 + 1, q * 2, nq * 2 + 1, q * 2 + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setIndex(idx.length > 65535 * 3 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    const cl = new Float32Array(n * 2 * 3); for (let q = 0; q < n; q++) { cl.set([0.55, 0.42, 0.28], q * 6); cl.set([0.28, 0.2, 0.14], q * 6 + 3); } g.setAttribute("color", new THREE.BufferAttribute(cl, 3)); const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })); m.userData.noHit = true; m.raycast = () => {}; m.frustumCulled = false; m.userData.ring = ring; l3dig.group.add(m); l3dig.skirt = m;
  }
  const ring = l3dig.skirt.userData.ring, P = l3dig.skirt.geometry.getAttribute("position");
  ring.forEach(([i, j], q) => { const k = j * nx + i, z = hf.H[k] === hf.H[k] ? hf.H[k] : hf.base, x = hf.x0 + i * hf.cell, y = hf.y0 + j * hf.cell; P.array.set([x, y, z, x, y, hf.base], q * 6); });
  P.needsUpdate = true;
}
const l3digZ = (x, y) => { const hf = l3dig.hf; if (!hf) return null; const fi = (x - hf.x0) / hf.cell, fj = (y - hf.y0) / hf.cell, i = Math.floor(fi), j = Math.floor(fj); if (i < 0 || j < 0 || i >= hf.nx - 1 || j >= hf.ny - 1) return null; const a = hf.H[j * hf.nx + i], b = hf.H[j * hf.nx + i + 1], c = hf.H[(j + 1) * hf.nx + i], d = hf.H[(j + 1) * hf.nx + i + 1]; if (!(a === a && b === b && c === c && d === d)) return null; const u = fi - i, v = fj - j; return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v; };

/* ---- Gräva och tömma ---- */
/* Sänker rutorna kring (x, y) till en skålform med botten på zt. Returnerar uppgrävd volym (fast mått, m³). Fylld skopa tar inte mer. */
function l3digCarve(x, y, zt, rad) {
  const hf = l3dig.hf; if (!hf) return 0; const { nx, ny, cell, H } = hf, room = Math.max(0, l3dig.cap / l3dig.swell - (l3dig.load / l3dig.swell)); if (room <= 1e-6) return 0;
  const i0 = Math.max(0, Math.floor((x - rad - hf.x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((x + rad - hf.x0) / cell)), j0 = Math.max(0, Math.floor((y - rad - hf.y0) / cell)), j1 = Math.min(ny - 1, Math.ceil((y + rad - hf.y0) / cell));
  let vol = 0; const todo = [];
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * nx + i, h = H[k]; if (!(h === h)) continue; const d = Math.hypot(hf.x0 + i * cell - x, hf.y0 + j * cell - y); if (d > rad) continue; const cut = zt + 0.25 * (d / rad) * (d / rad); if (h > cut) { const dv = (h - cut) * cell * cell; vol += dv; todo.push([k, cut, dv]); } }
  if (!vol) return 0; const f = Math.min(1, room / vol); let got = 0;
  todo.forEach(([k, cut, dv]) => { H[k] -= (H[k] - cut) * f; got += dv * f; });
  l3digApply(i0, j0, i1, j1);
  return got;
}
function l3digApply(i0, j0, i1, j1) {
  const hf = l3dig.hf, pos = l3dig.mesh.geometry.getAttribute("position");
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * hf.nx + i; if (hf.H[k] === hf.H[k]) pos.array[k * 3 + 2] = hf.H[k]; }
  pos.needsUpdate = true; l3digColors(i0, j0, i1, j1); l3digNormals(i0, j0, i1, j1); l3digDirty(i0, j0, i1, j1); if (i0 === 0 || j0 === 0 || i1 >= hf.nx - 1 || j1 >= hf.ny - 1) l3digSkirt(false);
}
/* Häller ut vol (löst mått, m³) som en hög kring (x, y). */
function l3digPile(x, y, vol) {
  const hf = l3dig.hf; if (!hf || vol <= 0) return; const { nx, ny, cell, H } = hf, rad = Math.max(0.6, Math.cbrt(vol) * 1.2 + 0.4);
  const i0 = Math.max(0, Math.floor((x - rad - hf.x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((x + rad - hf.x0) / cell)), j0 = Math.max(0, Math.floor((y - rad - hf.y0) / cell)), j1 = Math.min(ny - 1, Math.ceil((y + rad - hf.y0) / cell)), W = [];
  let sw = 0; for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * nx + i; if (!(H[k] === H[k])) continue; const d = Math.hypot(hf.x0 + i * cell - x, hf.y0 + j * cell - y), w = Math.max(0, 1 - (d / rad) * (d / rad)); if (w > 0) { W.push([k, w]); sw += w * cell * cell; } }
  if (!sw) return; W.forEach(([k, w]) => { H[k] += vol * w / sw; }); l3digApply(i0, j0, i1, j1);
}
/* Anropas varje bildruta för en grävmaskin: tip = skopspetsen, c = reglagen (c.bucket = skopans vinkel; liten = öppen). */
function l3digTick(g, tip, c) {
  if (!l3dig.on || !l3dig.hf || !tip) return;
  const p = tip.getWorldPosition(new THREE.Vector3()), prev = l3dig.prev.get(g); l3dig.prev.set(g, p.clone());
  const zs = l3digZ(p.x, p.y); if (zs == null) return;
  const open = c && c.bucket != null && c.bucket < 0.35;
  if (open && l3dig.load > 0 && p.z > zs + 0.25) { const rate = Math.max(0.05, l3dig.load * 0.06); const q = Math.min(l3dig.load, rate); l3dig.load -= q; l3dig.piled += q; l3digPile(p.x, p.y, q); l3digFxEmit(p, 3, 1.2, 1.5, false); l3digFxEmit(p, 1, 0.8, 1.0, true); l3digSound("dump", q); l3digUi(); return; }
  if (!prev || p.z > zs + 0.05) return;   // bara när spetsen är i marken och rör sig
  const L = p.distanceTo(prev); if (L < 1e-3 || L > 3) return;
  const n = Math.max(1, Math.ceil(L / (l3dig.hf.cell * 0.5))); let got = 0;
  for (let s = 1; s <= n; s++) { const q = prev.clone().lerp(p, s / n); got += l3digCarve(q.x, q.y, q.z, 0.55); }
  if (got > 0) { l3dig.removed += got; l3dig.load += got * l3dig.swell; l3digFxEmit(p, Math.min(8, 1 + Math.round(got * 40)), 1.3, 1.8, false); l3digFxEmit(p, 1, 0.5, 0.6, true); l3digSound("dig", got); l3digUi(); }
}
/* Töm skopan nu (knapp/mellanslag): hög framför spetsen. */
function l3digDumpNow() { const g = l3dig.lastG, t = l3dig.lastTip; if (!g || !t || !l3dig.load) return; const p = t.getWorldPosition(new THREE.Vector3()); l3digPile(p.x, p.y, l3dig.load); l3dig.piled += l3dig.load; l3dig.load = 0; l3digUi(); l3Render(); }
function l3digReset() { const hf = l3dig.hf; if (!hf) return; hf.H.set(hf.H0); const pos = l3dig.mesh.geometry.getAttribute("position"); for (let k = 0; k < hf.H.length; k++) pos.array[k * 3 + 2] = hf.H[k] === hf.H[k] ? hf.H[k] : hf.base; pos.needsUpdate = true; l3digColors(0, 0, hf.nx - 1, hf.ny - 1); l3digNormals(0, 0, hf.nx - 1, hf.ny - 1); l3digSkirt(false); l3dig.removed = l3dig.piled = l3dig.load = 0; l3digUi(); l3Render(); }
/* Verklig volym kvar mot ursprungsytan: netto-schakt (positivt = bortgrävt). */
function l3digNet() { const hf = l3dig.hf; if (!hf) return 0; let s = 0; for (let k = 0; k < hf.H.length; k++) if (hf.H[k] === hf.H[k]) s += hf.H0[k] - hf.H[k]; return s * hf.cell * hf.cell; }


/* ---- Ras: material glider ner där lutningen är brantare än rasvinkeln (volymen bevaras). Bara i området som rörts, och det växer några rutor per bildruta. ---- */
function l3digDirty(i0, j0, i1, j1) { l3digFxRun(); const d = l3dig.dirty; l3dig.dirty = d ? { i0: Math.min(d.i0, i0), j0: Math.min(d.j0, j0), i1: Math.max(d.i1, i1), j1: Math.max(d.j1, j1), age: 0 } : { i0, j0, i1, j1, age: 0 }; }
function l3digSettle() {
  const D = l3dig.dirty, hf = l3dig.hf; if (!D || !hf || !l3dig.repose) { l3dig.dirty = null; return; }
  const { nx, ny, cell, H } = hf, md = Math.tan(Math.max(10, Math.min(70, l3dig.angle)) * Math.PI / 180) * cell, pad = 2 + Math.min(6, D.age);
  const i0 = Math.max(0, D.i0 - pad), i1 = Math.min(nx - 1, D.i1 + pad), j0 = Math.max(0, D.j0 - pad), j1 = Math.min(ny - 1, D.j1 + pad); let moved = 0, ci0 = i1, ci1 = i0, cj0 = j1, cj1 = j0;
  const passes = (i1 - i0 + 1) * (j1 - j0 + 1) > 30000 ? 1 : 3; for (let pass = 0; pass < passes; pass++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const k = j * nx + i, h = H[k]; if (!(h === h)) continue;
    for (let q = 0; q < 4; q++) { const ni = i + (q === 0 ? 1 : q === 1 ? -1 : 0), nj = j + (q === 2 ? 1 : q === 3 ? -1 : 0); if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue; const kn = nj * nx + ni, hn = H[kn]; if (!(hn === hn)) continue; const ex = h - hn - md; if (ex > 0.003) { const t = ex * 0.25; H[k] -= t; H[kn] += t; moved += t; if (i < ci0) ci0 = i; if (i > ci1) ci1 = i; if (j < cj0) cj0 = j; if (j > cj1) cj1 = j; if (ni < ci0) ci0 = ni; if (ni > ci1) ci1 = ni; if (nj < cj0) cj0 = nj; if (nj > cj1) cj1 = nj; } }
  }
  D.age++;
  if (moved > 0) { const pos = l3dig.mesh.geometry.getAttribute("position"); for (let j = cj0; j <= cj1; j++) for (let i = ci0; i <= ci1; i++) { const k = j * nx + i; if (H[k] === H[k]) pos.array[k * 3 + 2] = H[k]; } pos.needsUpdate = true; l3digNormals(ci0, cj0, ci1, cj1); if (ci0 === 0 || cj0 === 0 || ci1 >= nx - 1 || cj1 >= ny - 1) l3digSkirt(false); D.i0 = Math.min(D.i0, ci0); D.j0 = Math.min(D.j0, cj0); D.i1 = Math.max(D.i1, ci1); D.j1 = Math.max(D.j1, cj1); l3dig.settled = (l3dig.settled || 0) + moved; }
  else if (D.age > 4) l3dig.dirty = null;
}

/* ---- Ljud: syntetiserat (filtrerat brus), skrap vid grävning och duns vid tömning. Slås på i panelen (kräver ett tryck i webbläsaren). ---- */
function l3digSound(kind, amt) {
  if (!l3dig.snd) return; const now = performance.now(); if (now - l3dig.sndT < 110) return; l3dig.sndT = now;
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; const ac = l3dig.ac || (l3dig.ac = new AC()); if (ac.state === "suspended") ac.resume();
    const len = Math.floor(ac.sampleRate * (kind === "dump" ? 0.35 : 0.2)), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, kind === "dump" ? 1.6 : 2.2);
    const src = ac.createBufferSource(); src.buffer = buf; const f = ac.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = kind === "dump" ? 500 : 900; const gn = ac.createGain(); gn.gain.value = Math.min(0.5, 0.08 + (amt || 0.2) * 0.5);
    src.connect(f); f.connect(gn); gn.connect(ac.destination); src.start();
  } catch (e) { /* inget ljud */ }
}
/* ---- Damm och jordklumpar ---- */
const L3DIG_VS = "attribute float alpha; attribute float size; varying float vA; varying vec3 vC; attribute vec3 color; void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * 300.0 / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }";
const L3DIG_FS = "varying float vA; varying vec3 vC; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; float soft = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(vC, vA * soft); }";
function l3digFxEmit(p, n, spread, up, dust) {
  if (!l3dig.fx || !l3dig.group) return; const N = 320;
  if (!l3dig.pts) {
    const g = new THREE.BufferGeometry(); ["position", "color"].forEach(k => g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(N * 3), 3))); g.setAttribute("alpha", new THREE.BufferAttribute(new Float32Array(N), 1)); g.setAttribute("size", new THREE.BufferAttribute(new Float32Array(N), 1));
    const m = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: L3DIG_VS, fragmentShader: L3DIG_FS, transparent: true, depthWrite: false })); m.frustumCulled = false; m.userData.noHit = true; m.raycast = () => {}; l3dig.group.add(m);
    const pos = g.getAttribute("position"); for (let i = 0; i < N; i++) pos.array[i * 3 + 2] = -1e5; l3dig.pts = { m, v: new Float32Array(N * 3), life: new Float32Array(N), life0: new Float32Array(N), kind: new Uint8Array(N), next: 0, N };
  }
  const P = l3dig.pts, g = P.m.geometry, pos = g.getAttribute("position"), col = g.getAttribute("color"), al = g.getAttribute("alpha"), sz = g.getAttribute("size");
  for (let q = 0; q < n; q++) {
    const i = P.next++ % P.N, a = Math.random() * Math.PI * 2, sp = Math.random() * spread; pos.array.set([p.x + (Math.random() - 0.5) * 0.4, p.y + (Math.random() - 0.5) * 0.4, p.z + Math.random() * 0.1], i * 3);
    P.v.set([Math.cos(a) * sp, Math.sin(a) * sp, up * (0.4 + Math.random() * 0.8)], i * 3); P.life[i] = P.life0[i] = dust ? 1.4 + Math.random() * 1.2 : 0.7 + Math.random() * 0.8; P.kind[i] = dust ? 1 : 0;
    const tone = 0.85 + Math.random() * 0.15; col.array.set(dust ? [0.72 * tone, 0.67 * tone, 0.6 * tone] : [0.4 * tone, 0.29 * tone, 0.19 * tone], i * 3); sz.array[i] = dust ? 0.5 : 0.1 + Math.random() * 0.08; al.array[i] = dust ? 0.4 : 1;
  }
  pos.needsUpdate = col.needsUpdate = al.needsUpdate = sz.needsUpdate = true; l3digFxRun();
}
function l3digFxStep(dt) {
  const P = l3dig.pts; if (!P) return false; const g = P.m.geometry, pos = g.getAttribute("position"), al = g.getAttribute("alpha"), sz = g.getAttribute("size"); let alive = false;
  for (let i = 0; i < P.N; i++) {
    if (P.life[i] <= 0) { if (pos.array[i * 3 + 2] > -1e4) pos.array[i * 3 + 2] = -1e5; continue; } alive = true; P.life[i] -= dt; const dust = P.kind[i] === 1, f = P.life[i] / P.life0[i];
    P.v[i * 3 + 2] += (dust ? 0.5 : -9.8) * dt; if (dust) { P.v[i * 3] *= 0.96; P.v[i * 3 + 1] *= 0.96; P.v[i * 3 + 2] *= 0.98; sz.array[i] += dt * 0.9; al.array[i] = 0.4 * Math.min(1, f * 2); }
    pos.array[i * 3] += P.v[i * 3] * dt; pos.array[i * 3 + 1] += P.v[i * 3 + 1] * dt; pos.array[i * 3 + 2] += P.v[i * 3 + 2] * dt;
    if (!dust) { const zs = l3digZ(pos.array[i * 3], pos.array[i * 3 + 1]); if (zs != null && pos.array[i * 3 + 2] < zs) { pos.array[i * 3 + 2] = zs + 0.01; P.v[i * 3] *= 0.2; P.v[i * 3 + 1] *= 0.2; P.v[i * 3 + 2] = 0; if (P.life[i] > 0.15) P.life[i] = 0.15; } }
  }
  pos.needsUpdate = al.needsUpdate = sz.needsUpdate = true; return alive;
}
function l3digFxRun() { if (l3dig.fxRaf) return; let t = performance.now(); const loop = () => { l3dig.fxRaf = 0; const n = performance.now(), dt = Math.min(0.05, (n - t) / 1000); t = n; if (!l3dig.on) return; const al = l3digFxStep(dt); if (l3dig.dirty) l3digSettle(); if (al || l3dig.dirty) { l3Render(); l3dig.fxRaf = requestAnimationFrame(loop); } }; l3dig.fxRaf = requestAnimationFrame(loop); }

/* ---- Panel ---- */
function l3digUi() {
  const el = document.getElementById("v3Dig"); if (!el) return; const f = x => (Math.round(x * 100) / 100).toLocaleString("sv-SE");
  const set = (k, v) => { const e = el.querySelector(`[data-dg="${k}"]`); if (e) e.textContent = v; };
  set("removed", f(l3dig.removed) + " m³"); set("load", f(l3dig.load) + " / " + f(l3dig.cap) + " m³"); set("piled", f(l3dig.piled) + " m³"); set("net", f(l3digNet()) + " m³");
  const bar = el.querySelector("[data-dg=bar]"); if (bar) bar.style.width = Math.min(100, l3dig.load / l3dig.cap * 100) + "%";
}
function l3digPanel() {
  const d = l3bfPanel("v3Dig", "⛏ Gräv-simulator", `
    <div style="font-size:12px;color:#475569">Gå-läget → Grävmaskin: kör ner skopan i marken och dra. Håll skopan öppen över marken för att tömma, eller tryck Töm.</div>
    <div class="v3-mxg"><b>Uppgrävt (fast mått)</b> <span data-dg="removed">0 m³</span></div>
    <div class="v3-mxg"><b>Skopa (löst)</b> <span data-dg="load">0 m³</span><div style="height:6px;background:#e5e7eb;border-radius:3px"><div data-dg="bar" style="height:6px;background:#b45309;border-radius:3px;width:0"></div></div></div>
    <div class="v3-mxg"><b>Utlagt i högar</b> <span data-dg="piled">0 m³</span></div>
    <div class="v3-mxg"><b>Netto mot ursprungsytan</b> <span data-dg="net">0 m³</span></div>
    <div class="v3-bp-chips"><button type="button" data-dga="dump">Töm skopan</button><button type="button" data-dga="reset">Återställ marken</button><button type="button" data-dga="off">Ta bort</button></div>
    <label class="v3-chk" title="Jorden rasar där lutningen är brantare än rasvinkeln"><input type="checkbox" id="v3DigRep" ${l3dig.repose ? "checked" : ""}> Ras, vinkel <input type="number" id="v3DigAng" min="15" max="60" step="1" value="${l3dig.angle}" style="width:52px">°</label>
    <label class="v3-chk"><input type="checkbox" id="v3DigFx" ${l3dig.fx ? "checked" : ""}> Damm och jordklumpar</label>
    <label class="v3-chk"><input type="checkbox" id="v3DigSnd" ${l3dig.snd ? "checked" : ""}> Ljud</label>
    <label class="v3-chk"><input type="checkbox" id="v3DigPc"> Dölj punktmolnet</label>
    <label class="v3-chk" title="Skopans storlek (löst mått)">Skopa <input type="number" id="v3DigCap" min="0.2" max="6" step="0.1" value="${l3dig.cap}" style="width:60px"> m³</label>
    <label class="v3-chk" title="Hur mycket jorden växer när den grävs upp">Uppluckring <input type="number" id="v3DigSw" min="1" max="2" step="0.05" value="${l3dig.swell}" style="width:60px"></label>`, () => {});
  if (!d) return;
  d.querySelector("[data-dga=dump]").onclick = l3digDumpNow; d.querySelector("[data-dga=reset]").onclick = l3digReset; d.querySelector("[data-dga=off]").onclick = () => { l3digClear(); l3bfPanelClose("v3Dig"); l3Render(); };
  d.querySelector("#v3DigCap").onchange = e => { l3dig.cap = Math.max(0.2, Number(e.target.value) || 1.2); l3digUi(); }; d.querySelector("#v3DigSw").onchange = e => { l3dig.swell = Math.max(1, Number(e.target.value) || 1.3); l3digUi(); };
  d.querySelector('#v3DigRep').onchange = e => { l3dig.repose = e.target.checked; }; d.querySelector('#v3DigAng').onchange = e => { l3dig.angle = Math.max(15, Math.min(60, Number(e.target.value) || 38)); }; d.querySelector('#v3DigFx').onchange = e => { l3dig.fx = e.target.checked; };
  d.querySelector('#v3DigSnd').onchange = e => { l3dig.snd = e.target.checked; if (l3dig.snd) l3digSound('dig', 0.3); };
  d.querySelector('#v3DigPc').onchange = e => { (typeof l3pc !== 'undefined' && l3pc.clouds || []).forEach(c => { if (c.group) c.group.visible = !e.target.checked; }); l3Render(); };
  l3digUi();
}
function l3digStart(r, cell) {
  if (!r || !r.V || !r.F) { l3Status("Skapa en mesh av punktmolnet först (Lager → ⋯ → Skapa mesh).", true); return false; }
  l3digMake(r, cell); l3digPanel(); l3Status(`Grävbar jord: ${l3dig.hf.nx} × ${l3dig.hf.ny} rutor (${l3dig.hf.cell} m). Växla till Gå-läget och välj Grävmaskin.`); return true;
}
