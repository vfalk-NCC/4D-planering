/* Punktmoln → mesh (Victor 2026-11-13: "triangulera punktmolnet och skapa en mesh i dxf & ifc – val om jag vill ha tin eller ej och alla olika färger jag har som val på punktmolnet").
   Lager → ⋯ på molnet → "▲ Skapa mesh…". Så görs en mesh av ett punktmoln: punkterna sammanfattas först ruta för ruta (ett moln med miljoner punkter går inte att trianglera rakt av),
   därefter bildas trianglar. Två sätt:
   • TIN: ett hörn per ruta (medelläge) som triangleras med Delaunay – oregelbundna trianglar som följer punkterna.
   • Rutnät (ej TIN): regelbundna rutor med en höjd per ruta, två trianglar per ruta.
   Höjd per ruta: medel, lägst (mark – tar bort fordon/vegetation) eller högst (tak). Trianglar med för långa kanter (hål, kanter) tas bort.
   Färg: samma val som på punktmolnet (skanningens färger, intensitet, höjd, enfärgad, skillnad) – varje triangel får medelfärgen av sina hörn.
   Resultat: DXF (3DFACE med äkta färg, kod 420), IFC (IfcTriangulatedFaceSet + IfcIndexedColourMap) eller ett ritat objekt i modellen. Prefix l3pm. */
const l3pm = { busy: false, res: null };
/* Inkrementell Delaunay (Bowyer–Watson med grannpekare och promenad). X/Y som Float64Array, returnerar trianglar [a,b,c,…] (moturs) utan stödtriangelns hörn. */
function l3pmDelaunay(X, Y) {
  const n = X.length; if (n < 3) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (let i = 0; i < n; i++) { if (X[i] < x0) x0 = X[i]; if (X[i] > x1) x1 = X[i]; if (Y[i] < y0) y0 = Y[i]; if (Y[i] > y1) y1 = Y[i]; }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, S = Math.max(x1 - x0, y1 - y0, 1e-9), px = new Float64Array(n + 3), py = new Float64Array(n + 3);
  for (let i = 0; i < n; i++) { px[i] = (X[i] - cx) / S; py[i] = (Y[i] - cy) / S; }
  const B = 60; px[n] = -B; py[n] = -B; px[n + 1] = B; py[n + 1] = -B; px[n + 2] = 0; py[n + 2] = B;
  let tv = [n, n + 1, n + 2], tn = [-1, -1, -1], alive = [1], free = [], last = 0;
  const orient = (a, b, x, y) => (px[b] - px[a]) * (y - py[a]) - (py[b] - py[a]) * (x - px[a]);
  const inC = (t, x, y) => { const a = tv[t * 3], b = tv[t * 3 + 1], c = tv[t * 3 + 2], ax = px[a] - x, ay = py[a] - y, bx = px[b] - x, by = py[b] - y, cx2 = px[c] - x, cy2 = py[c] - y;
    return (ax * ax + ay * ay) * (bx * cy2 - cx2 * by) - (bx * bx + by * by) * (ax * cy2 - cx2 * ay) + (cx2 * cx2 + cy2 * cy2) * (ax * by - bx * ay) > 1e-14; };
  const newTri = (a, b, c) => { let t; if (free.length) { t = free.pop(); tv[t * 3] = a; tv[t * 3 + 1] = b; tv[t * 3 + 2] = c; alive[t] = 1; } else { t = alive.length; alive.push(1); tv.push(a, b, c); tn.push(-1, -1, -1); } tn[t * 3] = tn[t * 3 + 1] = tn[t * 3 + 2] = -1; return t; };
  for (let p = 0; p < n; p++) {
    const x = px[p], y = py[p]; let t = alive[last] ? last : alive.indexOf(1), steps = 0, moved = true;
    while (moved && steps++ < 4000) { moved = false; for (let i = 0; i < 3; i++) { const a = tv[t * 3 + (i + 1) % 3], b = tv[t * 3 + (i + 2) % 3]; if (orient(a, b, x, y) < 0) { const nb = tn[t * 3 + i]; if (nb >= 0) { t = nb; moved = true; break; } } } }
    if (steps >= 4000) { t = -1; for (let q = 0; q < alive.length; q++) if (alive[q] && !(inC(q, x, y) === false)) { t = q; break; } if (t < 0) continue; }
    const cav = [t], inCav = new Set([t]); for (let k = 0; k < cav.length; k++) { const c = cav[k]; for (let i = 0; i < 3; i++) { const nb = tn[c * 3 + i]; if (nb >= 0 && !inCav.has(nb) && inC(nb, x, y)) { inCav.add(nb); cav.push(nb); } } }
    const bd = []; cav.forEach(c => { for (let i = 0; i < 3; i++) { const nb = tn[c * 3 + i]; if (nb < 0 || !inCav.has(nb)) bd.push([tv[c * 3 + (i + 1) % 3], tv[c * 3 + (i + 2) % 3], nb, c]); } });
    cav.forEach(c => { alive[c] = 0; free.push(c); });
    const start = new Map(), made = []; bd.forEach(([a, b, nb, old]) => { const T = newTri(a, b, p); made.push([T, b]); start.set(a, T); tn[T * 3 + 2] = nb; if (nb >= 0) for (let j = 0; j < 3; j++) if (tn[nb * 3 + j] === old) { tn[nb * 3 + j] = T; break; } });
    made.forEach(([T, b]) => { const U = start.get(b); tn[T * 3] = U === undefined ? -1 : U; if (U !== undefined) tn[U * 3 + 1] = T; });
    last = made.length ? made[0][0] : last;
  }
  const out = []; for (let t = 0; t < alive.length; t++) { if (!alive[t]) continue; const a = tv[t * 3], b = tv[t * 3 + 1], c = tv[t * 3 + 2]; if (a >= n || b >= n || c >= n) continue; out.push(a, b, c); }
  return out;
}
/* Steg 1: ruta för ruta. Returnerar { n, V: [[x,y,z]…] (absoluta), C: [[r,g,b]…], nx, ny, cell (index→hörn eller -1), o: {x0,y0,h} } */
async function l3pmGrid(c, o, onP) {
  const ctr = c.info.center, h = o.cell, bb = c.lod ? { min: c.info.min, max: c.info.max } : l3pcsBounds(c), nx = Math.max(1, Math.ceil((bb.max[0] - bb.min[0]) / h) + 1), ny = Math.max(1, Math.ceil((bb.max[1] - bb.min[1]) / h) + 1);
  if (nx * ny > 6e6) throw new Error("Rutorna blir för många (" + (nx * ny).toLocaleString("sv-SE") + ") – välj större ruta.");
  const N = nx * ny, cnt = new Uint32Array(N), sx = new Float64Array(N), sy = new Float64Array(N), sz = new Float64Array(N), sr = new Float32Array(N), sg = new Float32Array(N), sb = new Float32Array(N), mode = o.zmode;
  const pr = typeof l3Prefs === "function" ? l3Prefs() : null, old = pr ? pr.pcMode : undefined; let t0 = performance.now();
  try {
    if (pr && o.color !== "none") pr.pcMode = o.color;
    for await (const { o: pc, mask, f } of l3pcsPieces(c)) {
      const n = pc.pos.length / 3, P = pc.pos, col = o.color === "none" ? null : l3pcColorsBase(c, pc);
      for (let i = 0; i < n; i++) {
        if (mask && !mask[i]) continue; const x = P[i * 3] + ctr[0], y = P[i * 3 + 1] + ctr[1], z = P[i * 3 + 2] + ctr[2], ix = Math.floor((x - bb.min[0]) / h), iy = Math.floor((y - bb.min[1]) / h); if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) continue;
        const k = iy * nx + ix, first = cnt[k] === 0, r = col ? col[i * 3] : 160, g = col ? col[i * 3 + 1] : 165, b = col ? col[i * 3 + 2] : 175;
        if (mode === "mean" || first) { cnt[k]++; sx[k] += x; sy[k] += y; sz[k] += z; sr[k] += r; sg[k] += g; sb[k] += b; if (mode !== "mean") { sx[k] = x; sy[k] = y; sz[k] = z; sr[k] = r; sg[k] = g; sb[k] = b; } }
        else { cnt[k]++; if (mode === "min" ? z < sz[k] : z > sz[k]) { sx[k] = x; sy[k] = y; sz[k] = z; sr[k] = r; sg[k] = g; sb[k] = b; } }
      }
      if (onP && performance.now() - t0 > 200) { onP("läser punkter", f * 0.7); t0 = performance.now(); await l3pcsYield(); }
    }
  } finally { if (pr) { if (old === undefined) delete pr.pcMode; else pr.pcMode = old; } }
  /* Spikfilter: en ruta vars höjd avviker mer än o.spike meter från medianen av grannrutorna (8 st) tas bort, liksom enstaka rutor som saknar grannar (flygande brus). */
  let spikes = 0;
  if (o.spike > 0) {
    const zc = new Float32Array(N), drop = new Uint8Array(N), nb = [];
    for (let k = 0; k < N; k++) if (cnt[k]) zc[k] = sz[k] / (mode === "mean" ? cnt[k] : 1);
    for (let k = 0; k < N; k++) { if (!cnt[k]) continue; const ix = k % nx, iy = (k / nx) | 0; nb.length = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; const x = ix + dx, y = iy + dy; if (x < 0 || y < 0 || x >= nx || y >= ny) continue; const q = y * nx + x; if (cnt[q]) nb.push(zc[q]); }
      if (nb.length < 2) { drop[k] = 1; continue; } nb.sort((a, b) => a - b); const med = nb.length % 2 ? nb[nb.length >> 1] : (nb[nb.length / 2 - 1] + nb[nb.length / 2]) / 2; if (Math.abs(zc[k] - med) > o.spike) drop[k] = 1; }
    for (let k = 0; k < N; k++) if (drop[k]) { cnt[k] = 0; spikes++; }
  }
  const V = [], C = [], cell = new Int32Array(N).fill(-1);
  for (let k = 0; k < N; k++) { if (!cnt[k]) continue; const d = mode === "mean" ? cnt[k] : 1, ix = k % nx, iy = (k / nx) | 0; cell[k] = V.length;
    V.push(o.type === "grid" ? [bb.min[0] + (ix + 0.5) * h, bb.min[1] + (iy + 0.5) * h, sz[k] / d] : [sx[k] / d, sy[k] / d, sz[k] / d]); C.push([sr[k] / d, sg[k] / d, sb[k] / d].map(v => Math.max(0, Math.min(255, Math.round(v))))); }
  return { V, C, nx, ny, cell, bb, spikes };
}
/* Steg 2: trianglar. Returnerar { V, C, F (0-baserade hörnindex), FC (färg per triangel) } */
async function l3pmBuild(c, o, onP) {
  const g = await l3pmGrid(c, o, onP); if (g.V.length < 3) throw new Error("För få punkter för en mesh – välj mindre ruta eller kontrollera att molnet är inläst.");
  let F = [];
  if (o.type === "grid") { const { nx, ny, cell } = g; for (let iy = 0; iy < ny - 1; iy++) for (let ix = 0; ix < nx - 1; ix++) { const a = cell[iy * nx + ix], b = cell[iy * nx + ix + 1], d = cell[(iy + 1) * nx + ix], e = cell[(iy + 1) * nx + ix + 1]; if (a < 0 || b < 0 || d < 0 || e < 0) continue; F.push(a, b, e, a, e, d); } }
  else { if (onP) onP("trianglerar (Delaunay)", 0.75); await l3pcsYield(); F = l3pmDelaunay(Float64Array.from(g.V, v => v[0]), Float64Array.from(g.V, v => v[1])); }
  const maxE = o.maxEdge > 0 ? o.maxEdge * o.maxEdge : Infinity, keep = [], FC = [], V = g.V; let area = 0;
  for (let i = 0; i < F.length; i += 3) {
    const a = V[F[i]], b = V[F[i + 1]], d = V[F[i + 2]], e = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2; if (e(a, b) > maxE || e(b, d) > maxE || e(d, a) > maxE) continue;
    keep.push(F[i], F[i + 1], F[i + 2]); const ca = g.C[F[i]], cb = g.C[F[i + 1]], cc = g.C[F[i + 2]]; FC.push([0, 1, 2].map(k => Math.round((ca[k] + cb[k] + cc[k]) / 3)));
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]; area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  if (!keep.length) throw new Error("Alla trianglar föll bort – öka största kantlängd eller välj större ruta.");
  return { V: g.V, C: g.C, F: keep, FC, area, bb: g.bb, spikes: g.spikes };
}
const l3pmHex = c => "#" + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
function l3pmDxf(r, layer) {
  const out = ["0", "SECTION", "2", "ENTITIES"], num = v => (Math.round(v * 1000) / 1000).toFixed(3);
  for (let i = 0; i < r.F.length; i += 3) { const a = r.V[r.F[i]], b = r.V[r.F[i + 1]], c = r.V[r.F[i + 2]], k = r.FC[i / 3];
    out.push("0", "3DFACE", "8", layer, "420", String(k[0] << 16 | k[1] << 8 | k[2]), "10", num(a[0]), "20", num(a[1]), "30", num(a[2]), "11", num(b[0]), "21", num(b[1]), "31", num(b[2]), "12", num(c[0]), "22", num(c[1]), "32", num(c[2]), "13", num(c[0]), "23", num(c[1]), "33", num(c[2])); }
  out.push("0", "ENDSEC", "0", "EOF"); return out.join("\n");
}
function l3pmIfc(r, name, colored) {
  const doc = ifcDoc("4D-planering – " + name, "Mesh från punktmoln"), E = doc.E, org = [Math.floor(r.bb.min[0]), Math.floor(r.bb.min[1]), Math.floor(Math.min(...r.V.map(v => v[2])))];
  const pl = E(`IFCCARTESIANPOINTLIST3D((${r.V.map(v => ifcPt([v[0] - org[0], v[1] - org[1], v[2] - org[2]])).join(",")}))`), fs = E(`IFCTRIANGULATEDFACESET(${pl},$,.F.,(${Array.from({ length: r.F.length / 3 }, (_, i) => `(${r.F[i * 3] + 1},${r.F[i * 3 + 1] + 1},${r.F[i * 3 + 2] + 1})`).join(",")}),$)`);
  E(`IFCSTYLEDITEM(${fs},(${doc.style("mesh", "#a3a8b4", "Mesh")}),$)`);
  if (colored) {   // färg per triangel: IfcIndexedColourMap mot en färgtabell (5 bitar per kanal)
    const pal = new Map(), list = [], idx = r.FC.map(k => { const q = k.map(v => Math.min(255, (v >> 3 << 3) + 4)), key = q.join(","); if (!pal.has(key)) { pal.set(key, list.length + 1); list.push(q); } return pal.get(key); });
    const cl = E(`IFCCOLOURRGBLIST((${list.map(q => `(${q.map(v => (v / 255).toFixed(3)).join(",")})`).join(",")}))`); E(`IFCINDEXEDCOLOURMAP(${fs},$,${cl},(${idx.join(",")}))`);
  }
  const el = doc.proxy(name, "Mesh från punktmoln", "Punktmolnsmesh", doc.place(org), doc.shape(fs, "Tessellation"), "pcmesh");
  doc.props(el, [["Källa", "Punktmoln"], ["Trianglar", r.F.length / 3], ["Hörn", r.V.length], ["Yta m²", Math.round(r.area * 10) / 10]], "Punktmolnsmesh");
  return doc.finish([el], name + ".ifc");
}
function l3pmSave(text, name, type) { const u = URL.createObjectURL(new Blob([text], { type })), a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000); }
function l3pmToModel(r, name) {
  if (typeof modCreate !== "function") throw new Error("Ritverktyget är inte inläst.");
  const org = [Math.floor(r.bb.min[0]), Math.floor(r.bb.min[1]), Math.floor(Math.min(...r.V.map(v => v[2])))], q = v => Math.round(v * 1000) / 1000;
  const avg = [0, 1, 2].map(k => r.FC.reduce((a, c) => a + c[k], 0) / r.FC.length);
  const m = { k: "mesh", pts: r.V.map(v => [q(v[0] - org[0]), q(v[1] - org[1]), q(v[2] - org[2])]), faces: Array.from({ length: r.F.length / 3 }, (_, i) => [r.F[i * 3] + 1, r.F[i * 3 + 1] + 1, r.F[i * 3 + 2] + 1]), closed: false };
  const p = modCreate(m, org, { name, color: l3pmHex(avg) }); if (typeof l3Changed === "function") l3Changed(); return p;
}
function l3pmDialog(id) {
  const c = l3pc.clouds.find(x => x.id === id); if (!c || l3pm.busy) return; l3pm.res = null;
  const bb = c.lod ? { min: c.info.min, max: c.info.max } : l3pcsBounds(c), w = bb.max[0] - bb.min[0], h = bb.max[1] - bb.min[1], cell0 = Math.max(0.1, Math.round(Math.sqrt(w * h / 100000) * 20) / 20);
  const modes = [["auto", "Automatiskt"], ["rgb", "Skanningens färger"], ["int", "Intensitet (grå)"], ["z", "Höjd – färgskala"], ["solid", "Enfärgad (molnets färg)"], ["diff", "Skillnad (differentialanalys)"], ["none", "Ingen färg (grå mesh)"]], cur = typeof l3pcMode === "function" ? l3pcMode() : "auto";
  const ov = document.createElement("div"); ov.id = "l3pmDlg"; ov.style.cssText = "position:fixed;inset:0;z-index:9500;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:20px";
  const row = (l, ctl) => `<label style="display:flex;gap:8px;align-items:center;justify-content:space-between"><span>${l}</span>${ctl}</label>`;
  ov.innerHTML = `<div style="background:#fff;color:#0f172a;border-radius:14px;max-width:480px;width:100%;padding:16px 18px;box-shadow:0 20px 60px rgba(0,0,0,.4);font:13px system-ui,sans-serif;display:flex;flex-direction:column;gap:9px">
    <b style="font-size:16px">Skapa mesh av punktmolnet</b><div style="color:#475569">${escHtml(c.name)} · ${w.toFixed(0)} × ${h.toFixed(0)} m</div>
    ${row("Typ", `<select id="pmType"><option value="tin">TIN (triangulerat nät, Delaunay)</option><option value="grid">Rutnät (regelbundna rutor, ej TIN)</option></select>`)}
    ${row("Rutstorlek (m)", `<span><input type="number" id="pmCell" min="0.05" step="0.05" value="${cell0}" style="width:80px"> <span id="pmEst" style="color:#64748b"></span></span>`)}
    ${row("Höjd per ruta", `<select id="pmZ"><option value="mean">Medel</option><option value="min">Lägst (mark)</option><option value="max">Högst (tak)</option></select>`)}
    ${row("Största kantlängd (m, 0 = ingen)", `<input type="number" id="pmEdge" min="0" step="0.5" value="${Math.round(cell0 * 3 * 10) / 10}" style="width:80px">`)}
    ${row("Ta bort spikar (m, 0 = av)", `<input type="number" id="pmSpike" min="0" step="0.1" value="1" title="Rutor vars höjd avviker mer än så från grannrutorna tas bort (punkter som sticker iväg, flygande brus)" style="width:80px">`)}
    ${row("Färg", `<select id="pmCol">${modes.map(([k, l]) => `<option value="${k}" ${cur === k ? "selected" : ""}>${l}</option>`).join("")}</select>`)}
    <div style="color:#64748b;font-size:12px">Punkterna sammanfattas per ruta innan trianglarna bildas (miljoner punkter går inte att trianglera rakt av) – minska rutstorleken för mer detalj. Varje triangel får medelfärgen av sina hörn. Spikfilter tar bort rutor som sticker iväg från grannarna så att inga taggar uppstår.</div>
    <div id="pmOut" style="color:#334155"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button type="button" id="pmX">Stäng</button><button type="button" id="pmGo" style="background:#2563eb;color:#fff;border:0;border-radius:8px;padding:6px 14px">Skapa mesh</button>
    <button type="button" id="pmDxf" disabled>⤓ DXF</button><button type="button" id="pmIfc" disabled>⤓ IFC</button><button type="button" id="pmMod" disabled>＋ Lägg i modellen</button></div></div>`;
  document.body.appendChild(ov); const q = s => ov.querySelector(s), out = q("#pmOut");
  const est = () => { const v = Number(q("#pmCell").value); q("#pmEst").textContent = v > 0 ? `≈ ${Math.round(w * h / (v * v)).toLocaleString("sv-SE")} rutor` : ""; }; let edgeTouched = false; q("#pmEdge").oninput = () => { edgeTouched = true; }; q("#pmCell").oninput = () => { est(); const v = Number(q("#pmCell").value); if (!edgeTouched && v > 0) q("#pmEdge").value = Math.round(v * 3 * 10) / 10; }; est();
  q("#pmX").onclick = () => { if (!l3pm.busy) ov.remove(); };
  const base = () => `${l3pcsFile(String(c.name).replace(/\.[^.]+$/, ""))} – mesh`;
  q("#pmGo").onclick = async () => {
    if (l3pm.busy) return; l3pm.busy = true; q("#pmGo").disabled = true; ["#pmDxf", "#pmIfc", "#pmMod"].forEach(s => { q(s).disabled = true; });
    try {
      const o = { type: q("#pmType").value, cell: Math.max(0.05, Number(q("#pmCell").value) || cell0), zmode: q("#pmZ").value, maxEdge: Math.max(0, Number(q("#pmEdge").value) || 0), color: q("#pmCol").value, spike: Math.max(0, Number(q("#pmSpike").value) || 0) };
      const r = await l3pmBuild(c, o, (t, f) => { out.textContent = `${t} ${Math.round(f * 100)} %`; }); r.opts = o; l3pm.res = r;
      out.innerHTML = `<b>${(r.F.length / 3).toLocaleString("sv-SE")} trianglar</b>, ${r.V.length.toLocaleString("sv-SE")} hörn, ${Math.round(r.area).toLocaleString("sv-SE")} m² yta.${r.spikes ? ` ${r.spikes.toLocaleString("sv-SE")} spikar/brus-rutor togs bort.` : ""}`; ["#pmDxf", "#pmIfc", "#pmMod"].forEach(s => { q(s).disabled = false; });
    } catch (e) { out.textContent = "⚠ " + e.message; }
    l3pm.busy = false; q("#pmGo").disabled = false;
  };
  q("#pmDxf").onclick = () => { const r = l3pm.res; if (r) { l3pmSave(l3pmDxf(r, "Mesh"), base() + ".dxf", "application/dxf"); out.textContent = "DXF hämtad: " + base() + ".dxf"; } };
  q("#pmIfc").onclick = () => { const r = l3pm.res; if (r) { l3pmSave(l3pmIfc(r, base(), r.opts.color !== "none"), base() + ".ifc", "application/x-step"); out.textContent = "IFC hämtad: " + base() + ".ifc"; } };
  q("#pmMod").onclick = () => { const r = l3pm.res; if (r) try { l3pmToModel(r, base()); out.textContent = "Meshen ligger nu i modellen som ett ritat objekt (en medelfärg – färg per triangel finns i DXF och IFC)."; } catch (e) { out.textContent = "⚠ " + e.message; } };
}
