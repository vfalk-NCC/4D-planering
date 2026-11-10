/* 3D-vyn – Klipp form mot yta (Victor 2026-11-10: "alternativ för form att klippa formen mot punktmoln eller modell, där man får välja vad den ska klippa mot").
   I objektets egenskaper: välj yta (punktmoln, 3D-modell, 3D-ritning eller annat ritat objekt) och behåll delen OVANFÖR eller UNDER ytan.
   Formen görs om till en kolumnkropp (rutnät) vars över- eller undersida följer ytan, så t.ex. en platta eller en fyllning får exakt den form marken ger.
   Resultatet blir ett nytt vanligt objekt (originalet behålls om man inte bockar i "ersätt"). Ctrl+Z ångrar. */
const l3fc = { src: "", keep: "above", replace: false };

function l3fcSources(excludeIds) {
  if (typeof l3dfSources !== "function") return [];
  return l3dfSources().filter(s => !/^ob[sm]?:/.test(s.k) || !(excludeIds || []).some(id => s.k === "ob:" + id));
}
/* Bygger kolumnnätet. Returnerar { pts, faces } eller { err }. */
function l3fcBuild(list, key, keep) {
  const meshes = list.flatMap(p => (typeof l3dfObjMeshes === "function" ? l3dfObjMeshes(p) : [])); if (!meshes.length) return { err: "Objektet har ingen yta att klippa." };
  const O = l3.O, v = new THREE.Vector3(); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  meshes.forEach(m => { const pos = m.geometry.getAttribute("position"); m.updateWorldMatrix(true, false); for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); x0 = Math.min(x0, v.x + O[0]); x1 = Math.max(x1, v.x + O[0]); y0 = Math.min(y0, v.y + O[1]); y1 = Math.max(y1, v.y + O[1]); } });
  const w = x1 - x0, h = y1 - y0; if (!(w > 0.01 && h > 0.01)) return { err: "Objektet är för litet." };
  const cell = Math.max(0.25, Math.min(2, Math.max(w, h) / 90)), bd = { x0, y0, x1: x0 + Math.ceil(w / cell) * cell, y1: y0 + Math.ceil(h / cell) * cell };
  const gT = l3dfGrid(bd, cell), gB = l3dfGrid(bd, gT.cell); gB.lowest = true; l3dfMeshes(gT, meshes); l3dfMeshes(gB, meshes);
  const gS = l3dfGrid({ x0: bd.x0 - 2, y0: bd.y0 - 2, x1: bd.x1 + 2, y1: bd.y1 + 2 }, Math.max(0.5, gT.cell)), ok = l3dfBuild(key, gS); if (!ok) return { err: "Kunde inte läsa ytan – är den tänd och inläst?" };
  if (typeof l3dfFill === "function") l3dfFill(gS, 10);
  const nx = gT.nx, ny = gT.ny, cs = gT.cell, N = nx * ny, nt = new Float32Array(N), nb = new Float32Array(N), val = new Uint8Array(N), cl = new Uint8Array(N), sz = new Float32Array(N);
  const gz = (ix, iy) => (ix < 0 || iy < 0 || ix >= gS.nx || iy >= gS.ny) ? NaN : gS.z[iy * gS.nx + ix];
  const surf = (x, y) => {   // bilinjärt mellan rutornas mittpunkter så att snittytan blir mjuk
    const fx = (x - gS.x0) / gS.cell - 0.5, fy = (y - gS.y0) / gS.cell - 0.5, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy, a = gz(ix, iy), b = gz(ix + 1, iy), c = gz(ix, iy + 1), d = gz(ix + 1, iy + 1);
    if (a === a && b === b && c === c && d === d) return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    const v = [a, b, c, d].filter(q => q === q); return v.length ? v.reduce((m, q) => m + q, 0) / v.length : NaN;
  };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, t = gT.z[k], b = gB.z[k]; if (!(t === t && b === b) || t <= b) continue;
    const s = surf(bd.x0 + (i + 0.5) * cs, bd.y0 + (j + 0.5) * cs); sz[k] = s; let T = t, B = b;
    if (s === s) { if (keep === "above") { if (s > B) { B = s; cl[k] = 1; } } else if (s < T) { T = s; cl[k] = 2; } }
    if (T - B > 0.005) { val[k] = 1; nt[k] = T; nb[k] = B; }
  }
  const pts = [], faces = [], X = i => bd.x0 + i * cs, Y = j => bd.y0 + j * cs, P = (x, y, z) => { pts.push([Math.round((x) * 1000) / 1000, Math.round(y * 1000) / 1000, Math.round(z * 1000) / 1000]); return pts.length; };
  const quad = (a, b, c, d) => { faces.push([a, b, c], [a, c, d]); };
  // Hörnhöjd där ytan klipper: medel av omgivande rutor så att snittytan blir sammanhängande.
  const nodeZ = (i, j, kind) => { let a = 0, c = 0; for (let dj = -1; dj <= 0; dj++) for (let di = -1; di <= 0; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue; const k = jj * nx + ii; if (val[k] && cl[k] === kind) { a += sz[k]; c++; } } return c ? a / c : null; };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; if (!val[k]) continue; const T = nt[k], B = nb[k];
    const zt = (di, dj) => { if (cl[k] === 2) { const z = nodeZ(i + di, j + dj, 2); return z === null ? T : Math.max(B + 0.005, Math.min(T, z)); } return T; }, zb = (di, dj) => { if (cl[k] === 1) { const z = nodeZ(i + di, j + dj, 1); return z === null ? B : Math.min(T - 0.005, z); } return B; };
    const a = P(X(i), Y(j), zt(0, 0)), b = P(X(i + 1), Y(j), zt(1, 0)), c = P(X(i + 1), Y(j + 1), zt(1, 1)), d = P(X(i), Y(j + 1), zt(0, 1)); quad(a, b, c, d);
    const a2 = P(X(i), Y(j), zb(0, 0)), b2 = P(X(i + 1), Y(j), zb(1, 0)), c2 = P(X(i + 1), Y(j + 1), zb(1, 1)), d2 = P(X(i), Y(j + 1), zb(0, 1)); quad(a2, d2, c2, b2);
    // väggar mot grannar som saknas eller har annat höjdspann
    [[0, -1, X(i), Y(j), X(i + 1), Y(j)], [1, 0, X(i + 1), Y(j), X(i + 1), Y(j + 1)], [0, 1, X(i + 1), Y(j + 1), X(i), Y(j + 1)], [-1, 0, X(i), Y(j + 1), X(i), Y(j)]].forEach(([di, dj, ax, ay, bx, by]) => {
      const ii = i + di, jj = j + dj, kk = jj * nx + ii, ok2 = ii >= 0 && jj >= 0 && ii < nx && jj < ny && val[kk]; let lo = B, hi = T, parts = [];
      if (!ok2) parts = [[B, T]]; else { const nB = nb[kk], nT = nt[kk]; if (nB > B) parts.push([B, Math.min(T, nB)]); if (nT < T) parts.push([Math.max(B, nT), T]); }
      parts.forEach(([z0, z1]) => { if (z1 - z0 > 0.003) quad(P(ax, ay, z0), P(bx, by, z0), P(bx, by, z1), P(ax, ay, z1)); });
    });
  }
  if (!faces.length) return { err: keep === "above" ? "Hela formen ligger under ytan – inget kvar att behålla." : "Hela formen ligger över ytan – inget kvar att behålla." };
  let zmin = Infinity; pts.forEach(q => { zmin = Math.min(zmin, q[2]); }); const org = [bd.x0, bd.y0, zmin]; pts.forEach(q => { q[0] = Math.round((q[0] - org[0]) * 1000) / 1000; q[1] = Math.round((q[1] - org[1]) * 1000) / 1000; q[2] = Math.round((q[2] - org[2]) * 1000) / 1000; });
  return { pts, faces, org, cells: val.reduce((a, b) => a + b, 0) };
}
function l3fcRun(list, key, keep, replace) {
  const r = l3fcBuild(list, key, keep); if (r.err) { l3Status(r.err, true); return null; }
  placeSnapshot(); const base = list[0], name = `${base.name || "Form"} – klippt ${keep === "above" ? "över" : "under"} ytan`;
  const p = modCreate({ k: "mesh", pts: r.pts, faces: r.faces, closed: false }, r.org, { name, color: base.color || "#9ca3af", snapshot: false });
  if (replace) { l3SelectIds(list.map(q => q.id)); l3DeleteSel(); }
  l3SelectIds([p.id]); l3Changed(); l3Status(`Klippt mot ${(typeof l3dfLabel === "function" ? l3dfLabel(key) : key).replace(/^[^:]+: /, "")}: ${r.cells.toLocaleString("sv-SE")} rutor. Ctrl+Z ångrar.`);
  return p;
}
function l3fcHtml(list) {
  if (!list || !list.length || typeof l3dfSources !== "function") return "";
  const ids = list.map(p => p.id), src = l3fcSources(ids); if (!src.length) return "";
  const esc = typeof escHtml === "function" ? escHtml : s => s;
  return `<details class="v3-field v3-fclip" title="Klipp formen mot ett punktmoln, en modell eller ett ritat objekt"><summary><span>Klipp mot yta…</span></summary>
    <label class="v3-field"><span>Klipp mot</span><select data-fcsrc>${src.map(s => `<option value="${esc(s.k)}" ${s.k === l3fc.src ? "selected" : ""}>${esc(s.label)}</option>`).join("")}</select></label>
    <label class="v3-field"><span>Behåll</span><select data-fckeep><option value="above" ${l3fc.keep === "above" ? "selected" : ""}>Delen ovanför ytan</option><option value="below" ${l3fc.keep === "below" ? "selected" : ""}>Delen under ytan</option></select></label>
    <label class="v3-field" style="flex-direction:row;gap:6px;align-items:center"><input type="checkbox" data-fcrep ${l3fc.replace ? "checked" : ""}> <span>Ersätt originalet</span></label>
    <button type="button" class="btn" data-fcgo>Klipp</button></details>`;
}
function l3fcBind(side, list) {
  const go = side.querySelector("[data-fcgo]"); if (!go) return; const q = s => side.querySelector(s);
  l3fc.src = q("[data-fcsrc]").value; q("[data-fcsrc]").onchange = e => { l3fc.src = e.target.value; }; q("[data-fckeep]").onchange = e => { l3fc.keep = e.target.value; }; q("[data-fcrep]").onchange = e => { l3fc.replace = e.target.checked; };
  go.onclick = () => { l3fc.src = q("[data-fcsrc]").value; l3Status("Klipper…"); setTimeout(() => l3fcRun(list, l3fc.src, l3fc.keep, l3fc.replace), 30); };
}
