/* 3D-vyn – markera objekt i inlästa IFC-modeller (Victor 2026-10-10: "jag ska kunna välja objekt i
   IFC-filerna och då ska de highlightas").

   – Tryck på ett objekt i byggnaden: det markeras (lila ton och lila konturer som syns även bakom annat).
     Skift/Ctrl lägger till eller tar bort. En ruta (Tekla: dra med vänster) markerar flera. Esc avmarkerar.
   – Panelen till höger visar det markerade: namn, modell, IFC-id och koppling till planeringen, med
     Zooma, Dölj, Visa bara dessa och Markera i 4D-planering.
   Markeringen ritas som ett överlägg som delar punkterna med byggnadsbiten (inget kopieras) och följer
   med om biten flyttas. */

/* Ett dolt objekt är dött: det går aldrig att markera (klick, ruta, lager, Markera alla) – dolt, utanför sin tid, släckt lager, släckt i montageordningen eller i filmens animering. */
const l3bsDead = (mesh, ri) => { const u = mesh && mesh.userData.l3b; return !u || mesh.visible === false || !!((u.hidden && u.hidden.has(ri)) || (u.tempOff && u.tempOff.has(ri)) || (u.animOff && u.animOff.has(ri)) || (u.mtHide && u.mtHide.has(ri)) || (u.lyHide && u.lyHide.has(ri))); };
const l3bs = { sel: [], ov: [] }; // sel: [{ mesh, ri, key }], ov: överläggen
const L3BS_COL = 0xffc61a;

/* Objektets triangelintervall i bitens ursprungliga indexlista (workern sparar det; äldre cache: sök). */
function l3bsIdx(mesh, ri) {
  const u = mesh.userData.l3b, r = u.ranges[ri];
  if (r.idxStart != null && r.idxCount != null) return [r.idxStart, r.idxCount];
  // Saknas indexpositionerna (äldre kopior) räknas alla objekt i biten ut i ett enda svep – förut en genomsökning per objekt (tiotusentals objekt = minuter).
  const src = u.origIdx, R = u.ranges, order = R.map((_, k) => k).sort((a, b) => R[a].start - R[b].start), starts = order.map(k => R[k].start);
  const first = new Int32Array(R.length).fill(-1), last = new Int32Array(R.length).fill(-1);
  for (let i = 0; i + 2 < src.length; i += 3) {
    const v = src[i]; let lo = 0, hi = starts.length - 1, at = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= v) { at = mid; lo = mid + 1; } else hi = mid - 1; }
    const k = at >= 0 ? order[at] : -1;
    if (k < 0 || v >= R[k].start + R[k].count) continue;
    if (first[k] < 0) first[k] = i;
    last[k] = i + 3;
  }
  R.forEach((q, k) => { q.idxStart = first[k] < 0 ? 0 : first[k]; q.idxCount = first[k] < 0 ? 0 : last[k] - first[k]; });
  return [r.idxStart, r.idxCount];
}
function l3bsKey(mesh, ri) { const r = mesh.userData.l3b.ranges[ri]; return (mesh.userData.l3b.model && mesh.userData.l3b.model.id || "") + "|" + (r.guid || `${mesh.uuid}:${ri}`); }

/* Överlägget: ett per modellbit med alla markerade objekt i biten (tusentals markerade objekt – t.ex.
   alla med ett visst egenskapsvärde – blir då några få ritanrop). Konturer bara upp till en gräns.
   Victor 2026-10-12: "När jag markerar t.ex 'Räcke' i egenskaper så tar det ganska många sekunder 20-30".
   Fyllnaden visas direkt; konturerna räknas sedan i små portioner i bakgrunden (vyn går att använda under
   tiden) och sparas per objekt, så att samma objekt markeras direkt nästa gång. */
const L3BS_EDGE_MAX = 400000;
const L3BS_EDGE_DOT = Math.cos(30 * Math.PI / 180);
function l3bsDropOverlays() {
  l3bs.gen = (l3bs.gen || 0) + 1; // avbryter pågående konturberäkning
  (l3bs.ov || []).forEach(o => {
    if (o.parent) o.parent.remove(o);
    if (o.userData.bselFill) o.geometry.deleteAttribute("position"); // punkterna tillhör biten – släpp bara indexet
    o.geometry.dispose(); o.material.dispose();
  });
  l3bs.ov = [];
}
/* Ett objekts konturer som par av punkt-index i biten (samma regel som three.js EdgesGeometry: kant mellan
   ytor som möts i mer än 30°, eller kant som bara en yta har). Räknas en gång per objekt. */
function l3bsObjEdges(mesh, ri) {
  const u = mesh.userData.l3b;
  if (!u.edges) u.edges = [];
  if (u.edges[ri]) return u.edges[ri];
  const [st, c] = l3bsIdx(mesh, ri), src = u.origIdx, p = mesh.geometry.getAttribute("position").array;
  const canon = new Map(), ids = [0, 0, 0], real = [0, 0, 0], edges = new Map(), out = [];
  for (let t = st; t + 2 < st + c; t += 3) {
    for (let j = 0; j < 3; j++) {
      const v = src[t + j]; real[j] = v;
      const key = Math.round(p[v * 3] * 1e4) + "," + Math.round(p[v * 3 + 1] * 1e4) + "," + Math.round(p[v * 3 + 2] * 1e4);
      let id = canon.get(key); if (id === undefined) { id = canon.size; canon.set(key, id); }
      ids[j] = id;
    }
    if (ids[0] === ids[1] || ids[1] === ids[2] || ids[2] === ids[0]) continue; // utdragen triangel
    const a = real[0] * 3, b = real[1] * 3, d = real[2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[d] - p[a], vy = p[d + 1] - p[a + 1], vz = p[d + 2] - p[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    for (let j = 0; j < 3; j++) {
      const i0 = ids[j], i1 = ids[(j + 1) % 3], k = i0 < i1 ? i0 * 4294967296 + i1 : i1 * 4294967296 + i0;
      const e = edges.get(k);
      if (e) { if (nx * e[2] + ny * e[3] + nz * e[4] <= L3BS_EDGE_DOT) out.push(e[0], e[1]); edges.delete(k); }
      else edges.set(k, [real[j], real[(j + 1) % 3], nx, ny, nz]);
    }
  }
  edges.forEach(e => out.push(e[0], e[1]));
  return (u.edges[ri] = new Uint32Array(out));
}
function l3bsEdgeOverlay(mesh, list) {
  let n = 0; list.forEach(a => { n += a.length; });
  if (!n) return;
  const idx = new Uint32Array(n); let o = 0; list.forEach(a => { idx.set(a, o); o += a.length; });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", mesh.geometry.getAttribute("position")); // delas med biten
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  const line = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: L3BS_COL, transparent: true, opacity: 0.95 }));
  line.userData.bselFill = true; line.userData.bselEdge = true;
  line.userData.noHit = true; line.userData.bsel = true; line.raycast = () => {}; line.renderOrder = 6;
  mesh.add(line); l3bs.ov.push(line);
}
/* Konturerna i bakgrunden: ~12 ms åt gången, avbryts om markeringen ändras. */
function l3bsEdgesLater(work) {
  const gen = l3bs.gen;
  let wi = 0, k = 0, acc = [];
  const step = () => {
    if (gen !== l3bs.gen) return;
    const t0 = performance.now();
    while (wi < work.length && performance.now() - t0 < 12) {
      const [mesh, ris] = work[wi];
      for (let n = 0; k < ris.length && n < 64; n++, k++) acc.push(l3bsObjEdges(mesh, ris[k]));
      if (k >= ris.length) { l3bsEdgeOverlay(mesh, acc); acc = []; k = 0; wi++; l3Render(); }
    }
    if (wi < work.length) setTimeout(step, 0);
  };
  step();
}
/* Yttre glöd runt de markerade IFC-objekten: samma stencil-mask + inverterade skal som för placerade objekt (l3SelDeco). */
function l3bsHalo(mesh, g) {
  const pos = g.getAttribute("position"), idx = g.index; if (!pos || !idx || typeof L3_HALO_MAT !== "function") return;
  const key = i => Math.round(pos.getX(i) * 500) + "," + Math.round(pos.getY(i) * 500) + "," + Math.round(pos.getZ(i) * 500), acc = new Map(), ia = idx.array, kk = new Array(ia.length);
  for (let t = 0; t + 2 < ia.length; t += 3) {
    const a = ia[t], b = ia[t + 1], c = ia[t + 2], ux = pos.getX(b) - pos.getX(a), uy = pos.getY(b) - pos.getY(a), uz = pos.getZ(b) - pos.getZ(a), vx = pos.getX(c) - pos.getX(a), vy = pos.getY(c) - pos.getY(a), vz = pos.getZ(c) - pos.getZ(a), nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (let k = 0; k < 3; k++) { const q = key(ia[t + k]); kk[t + k] = q; const v = acc.get(q); if (v) { v[0] += nx; v[1] += ny; v[2] += nz; } else acc.set(q, [nx, ny, nz]); }
  }
  const nor = new Float32Array(pos.count * 3);
  for (let i = 0; i < ia.length; i++) { const v = acc.get(kk[i]), l = Math.hypot(v[0], v[1], v[2]) || 1, o = ia[i] * 3; nor[o] = v[0] / l; nor[o + 1] = v[1] / l; nor[o + 2] = v[2] / l; }
  const hg = new THREE.BufferGeometry(); hg.setAttribute("position", pos); hg.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); hg.setIndex(idx); hg.computeBoundingSphere();
  const h = new THREE.Mesh(hg, L3_HALO_MAT(0.0042 * l3HaloK(l3bs.sel.length), 0.95)), h2 = new THREE.Mesh(hg, L3_HALO_MAT(0.012 * l3HaloK(l3bs.sel.length), 0.2)), m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }));
  [h, h2, m].forEach(x => { x.userData.noHit = true; x.userData.bsel = true; x.userData.selHalo = true; x.userData.bselFill = true; x.raycast = () => {}; x.frustumCulled = false; mesh.add(x); l3bs.ov.push(x); }); h.renderOrder = 7; h2.renderOrder = 7; m.renderOrder = 6;
}
function l3bsRebuild() {
  l3bsDropOverlays();
  const byMesh = new Map();
  l3bs.sel.forEach(e => { const a = byMesh.get(e.mesh); if (a) a.push(e.ri); else byMesh.set(e.mesh, [e.ri]); });
  let total = 0;
  const parts = [];
  byMesh.forEach((ris, mesh) => {
    const src = mesh.userData.l3b.origIdx;
    let n = 0; const rs = ris.map(ri => { const sc = l3bsIdx(mesh, ri); n += sc[1]; return sc; });
    if (!n) return;
    const idx = new Uint32Array(n); let o = 0;
    rs.forEach(([st, c]) => { idx.set(src.subarray(st, st + c), o); o += c; });
    total += n / 3; parts.push([mesh, idx, ris]);
  });
  const work = [];
  parts.forEach(([mesh, idx, ris]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", mesh.geometry.getAttribute("position")); // delas med biten
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    const fill = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: L3BS_COL, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    if (total <= 250000) { fill.material.opacity = 0.34; l3bsHalo(mesh, g); } else fill.material.opacity = 0.55;   // lätt ton + yttre glöd; mycket stora urval (hela lager) får bara en tydligare ton
    fill.userData.bselFill = true;
    fill.userData.noHit = true; fill.userData.bsel = true; fill.raycast = () => {}; fill.renderOrder = 6; mesh.add(fill); l3bs.ov.push(fill);
    if (false && total <= L3BS_EDGE_MAX) work.push([mesh, ris]);   // alla kanter ritas inte längre: bara en yttre kontur (som för övriga objekt)
  });
  if (!work.length) return;
  // Redan uträknade (eller få) objekt: konturerna direkt. Annars i bakgrunden.
  const ready = work.every(([mesh, ris]) => { const E = mesh.userData.l3b.edges; return ris.length <= 50 || (E && ris.every(ri => E[ri])); });
  if (ready) work.forEach(([mesh, ris]) => l3bsEdgeOverlay(mesh, ris.map(ri => l3bsObjEdges(mesh, ri))));
  else l3bsEdgesLater(work);
}

function l3bsSet(list, opts = {}) {
  list = list.filter(e => !l3bsDead(e.mesh, e.ri));
  const want = new Map(list.map(e => [l3bsKey(e.mesh, e.ri), e]));
  l3bs.sel = [...want.entries()].map(([key, e]) => ({ mesh: e.mesh, ri: e.ri, key }));
  l3bs.ver = (l3bs.ver || 0) + 1;
  l3bsRebuild();
  if (l3bs.sel.length && l3.sel && l3.sel.size && !opts.keepPlaces) l3SelectIds([]); // en sorts markering i taget
  if (typeof l3RenderSide === "function") l3RenderSide();
  if (typeof l3gRenderTab === "function") l3gRenderTab(); // Grupper: knapparna för de markerade
  l3Render();
}
function l3bsClear() { if (l3bs.sel.length) l3bsSet([]); }
/* Träff i byggnaden -> markera (additive: lägg till/ta bort). */
function l3bsFromHit(h) {
  if (h && h.object && h.object.userData.l3bMain) h = { ...h, object: h.object.userData.l3bMain }; // genomskinlig bit -> huvudbiten
  const u = h && h.object && h.object.userData.l3b;
  if (!u || !h.face) return null;
  const v = h.face.a, R = u.ranges;
  let lo = 0, hi = R.length - 1, ri = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (R[mid].start <= v) { ri = mid; lo = mid + 1; } else hi = mid - 1; }
  if (ri < 0 || v >= R[ri].start + R[ri].count) return null;
  if (l3bsDead(h.object, ri)) return null;
  return { mesh: h.object, ri };
}
function l3bsTap(h, additive) {
  const e = l3bsFromHit(h);
  if (!e) { if (!additive) l3bsClear(); return false; }
  const key = l3bsKey(e.mesh, e.ri);
  if (additive) {
    const cur = l3bs.sel.map(x => ({ mesh: x.mesh, ri: x.ri }));
    const i = l3bs.sel.findIndex(x => x.key === key);
    if (i >= 0) cur.splice(i, 1); else cur.push(e);
    l3bsSet(cur, { keepPlaces: true }); // Ctrl/Skift: etableringsobjekt som redan är markerade finns kvar (blandad markering)
  } else l3bsSet([e]);
  return true;
}

/* Objektens mittpunkter per bit (för rutmarkering), räknas en gång. */
function l3bsCenters(mesh) {
  const u = mesh.userData.l3b;
  if (u.centers) return u.centers;
  const p = mesh.geometry.getAttribute("position").array, c = new Float32Array(u.ranges.length * 3);
  u.ranges.forEach((r, i) => {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let v = r.start; v < r.start + r.count; v++) { const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    c[i * 3] = (x0 + x1) / 2; c[i * 3 + 1] = (y0 + y1) / 2; c[i * 3 + 2] = (z0 + z1) / 2;
  });
  return (u.centers = c);
}
/* Rutmarkering: byggnadens objekt vars mitt ligger i rutan (dolda och släckta modeller räknas inte). */
/* Objektens lådor (lokala koordinater, 6 tal per objekt). */
function l3bsBoxes(mesh) {
  const u = mesh.userData.l3b;
  if (u.boxes) return u.boxes;
  const p = mesh.geometry.getAttribute("position").array, c = new Float32Array(u.ranges.length * 6);
  u.ranges.forEach((r, i) => {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let v = r.start; v < r.start + r.count; v++) { const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    c.set([x0, y0, z0, x1, y1, z1], i * 6);
  });
  return (u.boxes = c);
}
/* Markeringsfönster (Victor 2026-10-10, som i AutoCAD/Tekla): window = bara objekt som ligger helt inne
   i rutan (dra vänster -> höger), cross = allt som rutan nuddar (dra höger -> vänster). Lådan sållar
   först; bara objekt som ligger delvis i rutan provas triangel för triangel på skärmen. */
function l3bsInRect(L, R, T, B, rect, cross = false) {
  const out = [], v = new THREE.Vector3(), W = rect.width, H = rect.height, MAX = 200000;
  const PM = new THREE.Matrix4();
  const inR = (x, y) => x >= L && x <= R && y >= T && y <= B;
  // Sträcka mot rutan (Liang–Barsky).
  const segHit = (ax, ay, bx, by) => {
    let t0 = 0, t1 = 1; const dx = bx - ax, dy = by - ay;
    const clip = (p, q) => { if (p === 0) return q >= 0; const t = q / p; if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } return true; };
    return clip(-dx, ax - L) && clip(dx, R - ax) && clip(-dy, ay - T) && clip(dy, B - ay);
  };
  const triHas = (ax, ay, bx, by, cx, cy, px, py) => { const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by), d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy), d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay); return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); };
  l3.camera.updateMatrixWorld();
  l3b.models.forEach(m => {
    if (!m.visible) return;
    m.meshes.forEach(mesh => {
      if (!mesh.visible || out.length >= MAX) return;
      const u = mesh.userData.l3b, bx = l3bsBoxes(mesh), off = u.tempOff || new Set();
      mesh.updateMatrixWorld(true);
      PM.multiplyMatrices(l3.camera.projectionMatrix, l3.camera.matrixWorldInverse).multiply(mesh.matrixWorld);
      const pos = mesh.geometry.getAttribute("position").array, src = u.origIdx;
      let sx = null, sy = null, ok = null; // skärmpunkter för bitens hörn, räknas vid behov
      const proj = i => { v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]).applyMatrix4(PM); sx[i] = (v.x + 1) / 2 * W; sy[i] = (1 - v.y) / 2 * H; ok[i] = v.z < 1 && v.z > -1 ? 1 : 2; };
      for (let i = 0; i < u.ranges.length && out.length < MAX; i++) {
        if (u.hidden.has(i) || off.has(i) || l3bsDead(mesh, i)) continue;
        // Lådans hörn på skärmen.
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, behind = false;
        for (let k = 0; k < 8; k++) {
          v.set(bx[i * 6 + (k & 1 ? 3 : 0)], bx[i * 6 + 1 + (k & 2 ? 3 : 0)], bx[i * 6 + 2 + (k & 4 ? 3 : 0)]).applyMatrix4(PM);
          if (v.z > 1 || v.z < -1) { behind = true; continue; }
          const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        if (x1 < L || x0 > R || y1 < T || y0 > B) continue;              // helt utanför
        if (!behind && x0 >= L && x1 <= R && y0 >= T && y1 <= B) { out.push({ mesh, ri: i }); continue; } // helt inne
        if (!cross && behind) continue;
        // Delvis: objektets trianglar.
        if (!sx) { const n = pos.length / 3; sx = new Float32Array(n); sy = new Float32Array(n); ok = new Uint8Array(n); }
        const [s, c] = l3bsIdx(mesh, i);
        let hit = false, all = true;
        for (let t = s; t < s + c; t += 3) {
          const a = src[t], b = src[t + 1], d = src[t + 2];
          if (!ok[a]) proj(a); if (!ok[b]) proj(b); if (!ok[d]) proj(d);
          if (ok[a] === 2 || ok[b] === 2 || ok[d] === 2) { all = false; continue; }
          if (cross) {
            if (inR(sx[a], sy[a]) || inR(sx[b], sy[b]) || inR(sx[d], sy[d]) || segHit(sx[a], sy[a], sx[b], sy[b]) || segHit(sx[b], sy[b], sx[d], sy[d]) || segHit(sx[d], sy[d], sx[a], sy[a]) || triHas(sx[a], sy[a], sx[b], sy[b], sx[d], sy[d], L, T)) { hit = true; break; }
          } else if (!(inR(sx[a], sy[a]) && inR(sx[b], sy[b]) && inR(sx[d], sy[d]))) { all = false; break; }
        }
        if (cross ? hit : all && c > 0) out.push({ mesh, ri: i });
      }
    });
  });
  return out;
}

/* Det markerade: namn, modell, IFC-id, koppling. */
function l3bsInfo() {
  const byId = new Map((typeof items !== "undefined" ? items : []).map(r => [r.id, r]));
  return l3bs.sel.map(e => {
    const u = e.mesh.userData.l3b, r = u.ranges[e.ri];
    return { name: r.name || "Objekt", guid: r.guid || "", model: (u.model && u.model.name) || "", item: r.itemId ? byId.get(r.itemId) : null };
  });
}
function l3bsBox() {
  const b = new THREE.Box3(), v = new THREE.Vector3();
  l3bs.sel.forEach(e => {
    const p = e.mesh.geometry.getAttribute("position").array, r = e.mesh.userData.l3b.ranges[e.ri];
    e.mesh.updateMatrixWorld(true);
    for (let i = r.start; i < r.start + r.count; i++) b.expandByPoint(v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]).applyMatrix4(e.mesh.matrixWorld));
  });
  return b;
}
function l3bsZoom() {
  const b = l3bsBox();
  if (b.isEmpty()) return;
  l3FlyTo(b.getCenter(new THREE.Vector3()), Math.max(4, b.getSize(new THREE.Vector3()).length() * 1.4));
}
function l3bsHide() { return l3VisRecord("dölj", l3bsHide0); }
function l3bsHide0() {
  const n = l3bs.sel.length, meshes = new Set();
  l3bs.sel.forEach(e => { e.mesh.userData.l3b.hidden.add(e.ri); meshes.add(e.mesh); });
  l3bsSet([]);
  meshes.forEach(m => l3bApplyHidden(m));
  l3Status(`${n} objekt dolda – Visa alla (U) visar dem igen.`);
  l3Render();
}
/* Visa bara de markerade: alla andra objekt i byggnaden döljs. */
function l3bsIsolate() { return l3VisRecord("visa bara markerade", l3bsIsolate0); }
function l3bsIsolate0() {
  const keep = new Map();
  l3bs.sel.forEach(e => { if (!keep.has(e.mesh)) keep.set(e.mesh, new Set()); keep.get(e.mesh).add(e.ri); });
  l3b.models.forEach(m => m.meshes.forEach(mesh => {
    const u = mesh.userData.l3b, k = keep.get(mesh) || new Set();
    u.hidden = new Set(u.ranges.map((_, i) => i).filter(i => !k.has(i)));
    l3bApplyHidden(mesh);
  }));
  l3Status(`Visar bara ${l3bs.sel.length} objekt – Visa alla (U) visar resten igen.`);
  l3Render();
}

/* Osparade flyttar i de markerade objektens modeller: knapp för att spara som ny IFC i TC. */
function l3bsPendingHtml() {
  if (typeof l3bmPending !== "function") return "";
  const models = [...new Set(l3bs.sel.map(e => e.mesh.userData.l3b.model))].filter(m => m && l3bmPending(m.id));
  return models.map(m => `<button type="button" class="v3-save-btn" data-bmsave="${escHtml(m.id)}" title="Originalet hämtas från Trimble Connect, flyttar och kopior skrivs in och resultatet sparas som en ny fil i samma mapp – originalet skrivs aldrig över">${L3_ICO.upload}<span>Spara ändringarna som ny IFC i TC <em>${l3bmPending(m.id)} ändrade i ${escHtml(m.name)}</em></span></button>`).join("");
}
/* Panelen till höger när objekt i byggnaden är markerade. */
function l3bsRenderSide(side) {
  const info = l3bsInfo(), n = info.length, esc = escHtml, I = L3_ICO;
  const coupled = info.filter(x => x.item);
  const one = n === 1 ? info[0] : null;
  const row = (k, v) => v ? `<tr><td>${k}</td><td>${esc(v)}</td></tr>` : "";
  // Kompakt verktygsrad (Victor 2026-10-10: "nu är det väldigt stora knappar … mer kompakt och intuitiv").
  const act = (id, ico, label, title, cls = "") => `<button type="button" id="${id}" class="v3-act ${cls}" title="${esc(title)}">${ico}<span>${label}</span></button>`;
  side.dataset.id = "bsel:" + l3bs.sel.map(e => e.key).join(",");
  const tc = typeof l3tintOf === "function" ? l3tintOf(l3bs.sel) : null;
  side.innerHTML = `<div class="v3-side-h"><button type="button" class="v3-chip v3-tintbtn ${tc ? "set" : ""}" id="v3BsTint" style="background:${tc ? tc.css : "#6d5efc"}" title="Tillfällig färg och genomskinlighet för de markerade (bara den här sessionen)"></button><b title="${esc(one ? one.name : "")}">${one ? esc(one.name) : `${n} objekt markerade`}</b><button type="button" class="v3-side-min" title="Fäll ihop/ut panelen">▾</button><button type="button" class="v3-x" id="v3BsClose" title="Avmarkera (Esc)">✕</button></div>
    <div class="v3-sub">${one ? esc(one.model) : esc([...new Set(info.map(x => x.model))].join(", "))}</div>
    <div class="v3-acts">
      ${act("v3BsZoom", I.focus, "Zooma", "Zooma till de markerade")}
      ${act("v3BsHide", I.eyeOff, "Dölj", "Dölj de markerade (H)")}
      ${act("v3BsIso", I.isolate, "Isolera", "Visa bara de markerade (I)")}
      ${typeof l3bmStart === "function" ? act("v3BsMove", I.move, "Flytta", "Flytta de markerade – sparas som en ny IFC-fil i Trimble Connect") : ""}
      ${typeof l3bmStart === "function" ? act("v3BsCopy", I.copy, "Kopiera", "Kopiera de markerade och dra kopian dit den ska – sparas som en ny IFC-fil i Trimble Connect, originalet står kvar") : ""}
      ${typeof l3bmIsCopy === "function" && l3bs.sel.some(l3bmIsCopy) ? act("v3BsDel", I.trash || I.x || "", "Radera", "Radera de markerade kopiorna (Delete) – originalobjekten i IFC-filen raderas inte") : ""}
      ${typeof l3gaCouplePick === "function" ? act("v3BsCouple", L3GA_LINK, "Koppla", "Koppla de markerade till en aktivitet i 4D-planeringen (Powerproject) – du får se vad som sparas innan något ändras") : ""}
      ${typeof ifcSubset === "function" && typeof l3bmFetchIfc === "function" ? act("v3BsExport", I.upload, "IFC", `Exportera de ${n} markerade (med dina flyttar och grupper) som en egen IFC-fil i samma mapp i Trimble Connect – originalet rörs inte`) : ""}
      ${coupled.length ? act("v3BsJump", I.select, "4D", `Markera de ${coupled.length} kopplade aktiviteterna i 4D-planering och objekten i Trimble Connect`) : ""}
    </div>
    ${typeof l3gSelHtml === "function" ? l3gSelHtml() : ""}
    ${l3bsPendingHtml(info)}
    ${coupled.length && typeof l3ProgHtml === "function" ? l3ProgHtml(coupled.map(x => x.item)) : ""}
    ${one ? `<table class="v3-info-t">${one.item ? row("Aktivitet", one.item.activity) + row("Status", PHASE_LABELS[l3Phase(one.item)] || "") + row("Period", one.item.start_date ? `${one.item.start_date} – ${one.item.end_date || ""}` : "") : row("Planering", "Inte kopplad")}${typeof l3pFillSide === "function" ? "" : row("IFC-id", one.guid)}</table>${typeof l3pFillSide === "function" ? `<div id="v3BsProps" class="v3-props"></div>` : ""}`
      : `<div class="v3-bs-list">${info.slice(0, 60).map(x => `<div class="v3-bs-row" title="${esc(x.guid)}"><span>${esc(x.name)}</span>${x.item ? `<em>${esc(x.item.activity || "kopplad")}</em>` : ""}</div>`).join("")}${n > 60 ? `<div class="v3-pal-hint">… och ${n - 60} till</div>` : ""}</div>
      ${typeof l3pGroupBy === "function" ? `<button type="button" id="v3BsGroup" class="v3-link" title="Fliken Egenskaper: välj en egenskap och se alla värden">Gruppera efter egenskap…</button>` : ""}`}`;
  const on = (id, fn) => { const b = side.querySelector("#" + id); if (b) b.onclick = fn; };
  on("v3BsClose", l3bsClear);
  on("v3BsTint", e => { if (typeof l3tintOpen === "function") l3tintOpen(e.currentTarget); });
  on("v3BsZoom", l3bsZoom);
  on("v3BsHide", l3bsHide);
  on("v3BsIso", l3bsIsolate);
  on("v3BsMove", () => l3bmStart());
  on("v3BsCopy", () => l3bmStart({ copy: true }));
  on("v3BsCouple", () => l3gaCouplePick());
  on("v3BsDel", () => l3bmCopyDelete());
  on("v3BsGroup", () => l3PalTab("props"));
  on("v3BsExport", async () => { const b = side.querySelector("#v3BsExport"); b.disabled = true; try { await l3bsExportIfc(); } catch (e) { /* visas i statusraden */ } if (b.isConnected) b.disabled = false; });
  side.querySelectorAll("[data-bmsave]").forEach(b => { b.onclick = async () => { b.disabled = true; try { await l3bmSave(b.dataset.bmsave); } catch (e) { /* visas i statusraden */ } l3RenderSide(); }; });
  on("v3BsJump", () => askOpener("select", { ids: [...new Set(coupled.map(x => x.item.id))], jump: true }, 15000).then(() => l3Toast("Markerat i 4D-planering och i Trimble Connect.")).catch(e => l3Toast(e.message)));
  if (typeof l3gBindSel === "function") l3gBindSel(side);
  if (one && typeof l3pFillSide === "function") l3pFillSide(side, l3bs.sel[0]);
}

/* Exportera markerade (Victor 2026-10-10: "markera objekten i modell och göra en separat IFC på just dom
   jag har markerat"): per modell hämtas originalet, alla flyttar i modellen skrivs in och de markerade
   plockas ut med ifcSubset (geometri, placering, färger, egenskaper, våning). Sparas som en ny fil i
   samma mapp i Trimble Connect – aldrig över en befintlig. */
async function l3bsExportIfc(opts = {}) {
  const byModel = new Map();
  l3bs.sel.forEach(e => {
    const u = e.mesh.userData.l3b, g = u.ranges[e.ri].guid;
    if (!u.model || !g) return;
    if (!byModel.has(u.model)) byModel.set(u.model, new Set());
    byModel.get(u.model).add(g);
  });
  if (!byModel.size) { l3Status("Inget markerat objekt har IFC-id – inget att exportera.", true); return []; }
  const key = "bsexport", out = [], list = [...byModel];
  try {
    for (let i = 0; i < list.length; i++) {
      const [m, guids] = list[i], lbl = `Exporterar ${guids.size} objekt ur ${m.name}`, f0 = i / list.length, fw = 1 / list.length;
      busyProgress(key, `${lbl}: hämtar originalet`, f0);
      const res = await l3bmFetchIfc(m, f => busyProgress(key, `${lbl}: hämtar originalet`, f0 + fw * 0.5 * f));
      busyProgress(key, `${lbl}: plockar ut`, f0 + fw * 0.55);
      await new Promise(r => setTimeout(r, 20));
      let name = l3bmFileName(m, `urval ${guids.size} objekt`);
      const sub = ifcSubset(res.text, [...guids], { fileName: name });
      if (!sub.text) throw new Error(`Hittade inga av de markerade objekten i ${m.name}.`);
      // Etableringsobjekten (opts.graft = deras IFC-text) läggs in i den första filen: allt i en fil.
      if (i === 0 && opts.graft && typeof ifcGraft === "function") {
        const g = ifcGraft(sub.text, opts.graft);
        if (g.text) { sub.text = g.text; out.merged = g.added; name = l3bmFileName(m, `urval ${guids.size} objekt + ${g.added} etablering`); } else out.graftWhy = g.why;
      }
      busyProgress(key, `${lbl}: laddar upp`, f0 + fw * 0.75);
      const up = await l3bmUpload(m, l3bmStrBytes(sub.text), name);
      out.push({ name, folder: up && up.folder, found: sub.found.length, missing: sub.missing.length });
    }
    busyProgress(key, "", null);
    const miss = out.reduce((a, x) => a + x.missing, 0);
    l3Toast(`Sparad som ny fil i Trimble Connect: ${out.map(x => `${x.name}${x.folder ? ` (${x.folder})` : ""}`).join(", ")} – ${out.reduce((a, x) => a + x.found, 0)} objekt${miss ? `, ${miss} hittades inte i filen` : ""}. Originalet är orört.`);
    l3Status(`Exporterad: ${out.map(x => x.name).join(", ")}`);
    return out;
  } catch (e) {
    busyProgress(key, "", null);
    l3Status("Kunde inte exportera: " + e.message, true);
    throw e;
  }
}

/* ---- Blandad markering: IFC-objekt + etableringsobjekt tillsammans (Victor 2026-10-13: "hålla in CTRL och klicka på
   fundament och sedan pelaren och sedan högerklicka och välja exportera markerade som IFC") ----------------------------
   Ctrl/Skift-klick lägger till i markeringen oavsett sort; vanligt klick byter ut den. Exporten skapar nya filer i
   Trimble Connect (aldrig över något befintligt): en IFC per modell med de markerade IFC-objekten (kopior och flyttar med)
   och en IFC med de markerade etableringsobjekten. */
function l3RenderMixedSide(side, list) {
  const n = l3bs.sel.length, key = "mixed:" + l3bs.sel.map(e => e.key).join(",") + "|" + list.map(p => p.id).join(",");
  side.dataset.id = key;
  side.classList.remove("hidden");
  const names = list.slice(0, 4).map(p => escHtml(p.name || (placeLib(p.type) || {}).label || p.type)).join(", ") + (list.length > 4 ? ` +${list.length - 4}` : "");
  side.innerHTML = `<div class="v3-side-h"><b>${n} IFC-objekt + ${list.length} etableringsobjekt markerade</b><button type="button" class="v3-side-min" title="Fäll ihop/ut panelen">▾</button><button type="button" class="v3-x" id="v3MixClear" title="Avmarkera allt (Esc)">✕</button></div>
    <div class="v3-sub">${escHtml(l3bs.sel.slice(0, 3).map(e => (e.mesh.userData.l3b.ranges[e.ri] || {}).name || "Objekt").join(", "))}${n > 3 ? ` +${n - 3}` : ""} · ${names}</div>
    <div class="v3-btns"><button type="button" class="v3-primary" id="v3MixExport" title="De markerade som nya IFC-filer i Trimble Connect – originalen rörs inte">${L3_ICO.upload || ""}Exportera markerade som IFC…</button>
      <button type="button" id="v3MixZoom" title="Zooma till de markerade (F)">${L3_ICO.focus || ""}Zooma</button></div>
    <div class="v3-pal-hint">Ctrl/Skift + klick lägger till eller tar bort objekt (IFC-objekt och etablering i samma markering). Högerklick → Exportera markerade som IFC.</div>`;
  const on = (id, fn) => { const b = side.querySelector("#" + id); if (b) b.onclick = fn; };
  on("v3MixExport", () => l3ExportSelected());
  on("v3MixZoom", () => { if (typeof l3View === "function") l3View("sel"); });
  on("v3MixClear", () => { l3SelectIds([]); if (typeof l3bsClear === "function") l3bsClear(); });
}
async function l3ExportSelected() {
  const nIfc = l3bs.sel.length, pids = [...l3.sel].filter(id => placements.some(p => p.id === id));
  if (!nIfc && !pids.length) { l3Status("Inget är markerat – markera objekten (Ctrl+klick för flera) och försök igen.", true); return; }
  const parts = [];
  if (nIfc && pids.length) parts.push(`${nIfc} IFC-objekt ur modellen och ${pids.length} etableringsobjekt – tillsammans i EN ny IFC-fil (IFC-objekten med dina flyttar och kopior)`);
  else if (nIfc) parts.push(`${nIfc} IFC-objekt ur modellen (en ny IFC-fil per modell, med dina flyttar och kopior)`);
  else parts.push(`${pids.length} etableringsobjekt (en ny IFC-fil)`);
  if (!(await uiConfirm(`Exportera de markerade som IFC i Trimble Connect?\n\n• ${parts.join("\n• ")}\n\nDet blir nya filer med datum och klockslag i namnet – inget befintligt skrivs över.`, { ok: "Exportera" }))) { l3Status("Inget exporterades."); return; }
  const done = [], fail = [];
  let graft = null, pending = pids.slice();
  if (nIfc && pids.length) { // etableringsobjekten som IFC-text, att lägga in i IFC-filen
    try { l3Status("Förbereder etableringsobjekten…"); if (typeof placeSaveNow === "function") await placeSaveNow(); const r = await askOpener("placeIfcText", { ids: pids, placementData: pids.map(id => JSON.parse(JSON.stringify(placements.find(p => p.id === id)))).filter(Boolean) }, 120000); graft = r && r.text ? r.text : null; if (!graft) l3Status("Etableringsobjekten har ingen form att lägga in i filen – de sparas separat.", true); }
    catch (e) { fail.push("Etableringsobjekten kunde inte förberedas för en gemensam fil: " + e.message); }
  }
  if (nIfc) {
    try {
      const r = await l3bsExportIfc(graft ? { graft } : {});
      (r || []).forEach(x => done.push(x.name));
      if (graft && r && r.merged) pending = []; // sitter nu i IFC-filen
      else if (graft) fail.push(`Etableringsobjekten kunde inte läggas in i IFC-filen (${r && r.graftWhy ? r.graftWhy : "okänd orsak"}) – de sparas som en egen fil.`);
    } catch (e) { fail.push("IFC-objekten: " + e.message); pending = pids.slice(); if (!graft) pending = pids.slice(); }
  }
  if (pending.length && !(nIfc && !done.length && fail.length)) {
    try {
      l3Status(`Exporterar ${pending.length} etableringsobjekt som IFC i Trimble Connect…`);
      if (typeof placeSaveNow === "function") await placeSaveNow();
      const fileName = await uiPrompt("Namn på IFC-filen med etableringsobjekten (datum och klockslag läggs till):", "Etablering urval " + pending.length + " objekt", { ok: "Exportera" });
      if (fileName == null) throw new Error("exporten avbröts (inget namn angavs).");
      const r = await askOpener("placeSaveIfc", { ids: pending, fileName: String(fileName).trim(), placementData: pending.map(id => JSON.parse(JSON.stringify(placements.find(p => p.id === id)))).filter(Boolean) }, 0);
      if (r && r.n) (r.files || [r.name]).filter(Boolean).forEach(x => done.push(x)); else fail.push("Etableringsobjekten: ingenting att spara" + (r && r.why ? ` (${r.why})` : " (saknar form)") + ".");
    } catch (e) { fail.push("Etableringsobjekten: " + e.message); }
  }
  const msg = done.length ? `✓ Exporterat som nya IFC-filer i Trimble Connect: ${done.join(", ")}.${fail.length ? ` Men: ${fail.join(" ")}` : ""}` : `Kunde inte exportera. ${fail.join(" ")}`;
  l3Status(msg, !done.length || !!fail.length); if (done.length) l3Toast(msg);
}
