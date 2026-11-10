/* 3D-vyn – Byggväg (Victor 2026-11-10: "ett verktyg i 3D-editorn som skapar en väg utefter punktmoln och modeller så att jag snabbt kan simulera byggvägar … och också få med slänter").

   Så här fungerar det:
   1. Mät → Byggväg: tryck ut vägens mittlinje på marken (punktmoln, modell eller DXF – punkterna fäster som övriga mått). Enter eller sista punkten igen avslutar.
   2. Panelen: välj vilka ytor vägen ska följa (flera går att kombinera – den högsta ytan gäller), vägbredd, högsta lutning, mjukhet och släntlutningar.
      Vägens höjd följer marken men jämnas ut och begränsas så att lutningen aldrig blir högre än inställt. Alternativt rak lutning från start till slut.
   3. Slänter: från vägkanten dras en släntyta (schakt där marken är högre, fyllning där den är lägre) ut till den möter marken. Blått = schaktslänt, rött = fyllningsslänt.
   4. Resultat: längd, höjdskillnad, medel- och största lutning, trånga kurvor (under minsta radie), schakt- och fyllningsvolym (inkl. slänterna) och släntytor.
      Vägen färgas efter lutning (grön → gul → röd).
   5. Skapa objekt: väg, schaktslänt och fyllningsslänt blir vanliga ritade ytor som kan flyttas, ändras, ångras och exporteras till IFC och DXF.

   Räknesättet: en höjdkarta (rutnät) per yta som i Volym mot yta (lagesplan-3dpcdiff.js). Volymen är summan av tvärsnittsareorna (marken mot vägen och slänterna) × stationsavståndet. */

const l3road = { cur: null, seq: 0, timer: 0, kbd: null };
const L3R_DEF = { width: 5, grade: 10, smooth: 20, step: 2, cutR: 1, fillR: 1.5, reach: 25, minR: 15, mode: "anchor", anchor: -1, cap: true, crown: 0, speed: 20 };
const l3rFmt = (v, d = 1) => (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toString().replace(".", ",");
const l3rOk = z => z === z && z !== null && Math.abs(z) < 1e9;
const l3rM3 = v => Math.round(v).toLocaleString("sv-SE").replace(/[  ]/g, " ") + " m³";
const l3rTick = () => new Promise(r => setTimeout(r, 16));

/* Ytor att följa: de som finns i vyn (punktmoln, modeller, DXF) – samma lista som Volym mot yta. */
function l3rSources() { return typeof l3dfSources === "function" ? l3dfSources() : []; }
function l3rDefaultSrc() {
  const all = l3rSources(), pc = all.filter(s => /^pc:/.test(s.k) && (l3pc.clouds.find(c => "pc:" + c.id === s.k) || {}).visible);
  if (pc.length) return [pc[0].k];
  const md = all.filter(s => /^md:/.test(s.k) && (typeof l3b !== "undefined" ? l3b.models : []).some(m => "md:" + m.id === s.k && m.visible));
  return md.length ? [md[0].k] : all.length ? [all[0].k] : [];
}

/* ---- Beräkning ---- */
/* Mittlinjen delas upp med stationsavståndet; returnerar [{x, y, s}] (s = sträcka från start i plan). */
function l3rStations(P, step) {
  const seg = [0]; for (let i = 1; i < P.length; i++) seg.push(seg[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const L = seg[seg.length - 1]; if (L < 0.5) return [];
  const n = Math.max(2, Math.round(L / step)), out = []; let k = 0;
  for (let i = 0; i <= n; i++) {
    const s = L * i / n; while (k < seg.length - 2 && seg[k + 1] < s) k++;
    const t = seg[k + 1] > seg[k] ? (s - seg[k]) / (seg[k + 1] - seg[k]) : 0;
    out.push({ x: P[k][0] + (P[k + 1][0] - P[k][0]) * t, y: P[k][1] + (P[k + 1][1] - P[k][1]) * t, s, z0: P[k][2] + (P[k + 1][2] - P[k][2]) * t });
  }
  out.seg = seg; return out;
}
/* Jämnar ut höjderna (glidande medel över "smooth" meter) och begränsar sedan lutningen framåt och bakåt. */
function l3rProfile(st, spec) {
  const n = st.length, g = Math.max(0.5, Number(spec.grade) || 10) / 100, ds = i => st[i].s - st[i - 1].s;
  let z = st.map(p => p.g);
  if (spec.mode === "pins" && st.seg && st.pts) {   // genom punkterna jag klickat ut: rak lutning mellan dem (högsta punkten blir vägens högsta)
    const sg = st.seg, pz = st.pts.map(p => p[2]);
    z = st.map(p => { let k = 0; while (k < sg.length - 2 && sg[k + 1] < p.s) k++; const t = sg[k + 1] > sg[k] ? Math.max(0, Math.min(1, (p.s - sg[k]) / (sg[k + 1] - sg[k]))) : 0; return pz[k] + (pz[k + 1] - pz[k]) * t; });
    return z;
  }
  if (spec.mode === "straight") { const a = z[0], b = z[n - 1], L = st[n - 1].s || 1; z = st.map(p => a + (b - a) * p.s / L); }
  else {
    const half = Math.max(0, Number(spec.smooth) || 0) / 2, sm = z.slice();
    if (half > 0) for (let i = 0; i < n; i++) { let a = 0, c = 0; for (let j = 0; j < n; j++) if (Math.abs(st[j].s - st[i].s) <= half) { const w = 1 - Math.abs(st[j].s - st[i].s) / (half + 1e-9) * 0.5; a += z[j] * w; c += w; } sm[i] = a / c; }
    z = sm;
  }
  if (spec.mode === "anchor" && st.seg && st.pts) {   // höjdpunkt (Victor 2026-11-10): en punkt på vägen har given höjd, resten räknas därifrån med högsta lutning
    const pz = st.pts.map(p => p[2]); let ai = Number(spec.anchor); if (!(ai >= 0 && ai < pz.length)) ai = pz.indexOf(Math.max(...pz));
    const zA = pz[ai], sA = st.seg[ai]; let a = 0; for (let i = 1; i < n; i++) if (Math.abs(st[i].s - sA) < Math.abs(st[a].s - sA)) a = i;
    const o = z.slice(); o[a] = zA;
    for (let i = a + 1; i < n; i++) o[i] = Math.max(o[i - 1] - g * ds(i), Math.min(o[i - 1] + g * ds(i), z[i]));
    for (let i = a - 1; i >= 0; i--) o[i] = Math.max(o[i + 1] - g * ds(i + 1), Math.min(o[i + 1] + g * ds(i + 1), z[i]));
    if (spec.cap !== false) for (let i = 0; i < n; i++) o[i] = Math.min(o[i], zA);
    return o;
  }
  const lim = spec.mode === "straight" ? z : (() => { const o = z.slice(); for (let it = 0; it < 3; it++) { for (let i = 1; i < n; i++) o[i] = Math.max(o[i - 1] - g * ds(i), Math.min(o[i - 1] + g * ds(i), o[i])); for (let i = n - 2; i >= 0; i--) o[i] = Math.max(o[i + 1] - g * ds(i + 1), Math.min(o[i + 1] + g * ds(i + 1), o[i])); } return o; })();
  return lim;
}
async function l3rCompute(cur, alive) {
  const spec = cur.spec, srcs = (spec.src || []).filter(k => l3rSources().some(s => s.k === k));
  const W = Math.max(1, Number(spec.width) || 5), reach = Math.max(2, Number(spec.reach) || 25), step = Math.max(0.5, Number(spec.step) || 2);
  const st = l3rStations(cur.pts, step); if (st.length < 2) return { err: "Vägen är för kort." }; st.pts = cur.pts;
  if (!srcs.length) return { err: "Tänd ett punktmoln, en 3D-modell eller en DXF och välj den under \"Följer\"." };
  const m = W / 2 + reach + 3, xs = st.map(p => p.x), ys = st.map(p => p.y);
  const bd = { x0: Math.min(...xs) - m, x1: Math.max(...xs) + m, y0: Math.min(...ys) - m, y1: Math.max(...ys) + m };
  const area = (bd.x1 - bd.x0) * (bd.y1 - bd.y0), cell = Math.max(0.25, Math.sqrt(area / 160000)), grids = [];
  for (const k of srcs) {
    const g = l3dfGrid(bd, cell), ok = l3dfBuild(k, g); await l3rTick(); if (!alive()) return null;
    if (ok) grids.push(g);
  }
  if (!grids.length) return { err: "Kunde inte läsa ytorna – är punktmolnet eller modellen tänd och inläst?" };
  const gz = (x, y) => { let best = null; for (const g of grids) { const z = l3volGridZ(g, x, y); if (z !== null && l3rOk(z) && (best === null || z > best)) best = z; } return best; };
  // Markhöjd längs mittlinjen (saknas den används klickpunkternas höjd).
  let miss = 0; st.forEach(p => { const z = gz(p.x, p.y); if (z === null) { p.g = null; miss++; } else p.g = z; });
  if (miss === st.length) st.forEach(p => { p.g = p.z0; });
  else for (let i = 0; i < st.length; i++) if (st[i].g === null) { let a = i - 1, b = i + 1; while (a >= 0 && st[a].g === null) a--; while (b < st.length && st[b].g === null) b++; st[i].g = a >= 0 && b < st.length ? st[a].g + (st[b].g - st[a].g) * (st[i].s - st[a].s) / (st[b].s - st[a].s) : a >= 0 ? st[a].g : st[b].g; }
  const zd = l3rProfile(st, spec), n = st.length;
  // Riktning och normal per station.
  st.forEach((p, i) => { const a = st[Math.max(0, i - 1)], b = st[Math.min(n - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; p.tx = dx / L; p.ty = dy / L; p.nx = -p.ty; p.ny = p.tx; p.z = zd[i]; });
  // Släntkant: marsch utåt från vägkanten tills släntytan möter marken.
  const slope = (p, sg) => {
    const ex = p.x + sg * p.nx * W / 2, ey = p.y + sg * p.ny * W / 2, ze = p.z - (spec.crown > 0 ? 0 : 0), g0 = gz(ex, ey);
    if (g0 === null) return { ex, ey, ze, kind: "none", d: 0, qx: ex, qy: ey, qz: ze, hit: false };
    const kind = g0 > ze + 0.01 ? "cut" : "fill", k = kind === "cut" ? 1 / Math.max(0.2, spec.cutR) : 1 / Math.max(0.2, spec.fillR), dd = 0.25;
    if (Math.abs(g0 - ze) <= 0.01) return { ex, ey, ze, kind: "fill", d: 0, qx: ex, qy: ey, qz: ze, hit: true };
    let prevD = 0, prevDiff = g0 - ze;   // diff = mark − släntyta (cut: >0 till dess släntytan nått marken)
    for (let d = dd; d <= reach; d += dd) {
      const qx = ex + sg * p.nx * d, qy = ey + sg * p.ny * d, zs = kind === "cut" ? ze + d * k : ze - d * k, g = gz(qx, qy);
      if (g === null) return { ex, ey, ze, kind, d: prevD, qx: ex + sg * p.nx * prevD, qy: ey + sg * p.ny * prevD, qz: kind === "cut" ? ze + prevD * k : ze - prevD * k, hit: false };
      const diff = g - zs;
      if (kind === "cut" ? diff <= 0 : diff >= 0) { const t = prevDiff / (prevDiff - diff || 1), dh = prevD + (d - prevD) * Math.max(0, Math.min(1, t)); return { ex, ey, ze, kind, d: dh, qx: ex + sg * p.nx * dh, qy: ey + sg * p.ny * dh, qz: kind === "cut" ? ze + dh * k : ze - dh * k, hit: true }; }
      prevD = d; prevDiff = diff;
    }
    return { ex, ey, ze, kind, d: reach, qx: ex + sg * p.nx * reach, qy: ey + sg * p.ny * reach, qz: kind === "cut" ? ze + reach * k : ze - reach * k, hit: false };
  };
  st.forEach(p => { p.L = slope(p, 1); p.R = slope(p, -1); });
  await l3rTick(); if (!alive()) return null;
  // Tvärsnittsareor → volymer (medelareametoden).
  const dt = 0.5, area2 = p => { let cut = 0, fill = 0;
    for (const sg of [1, -1]) {
      const S = sg > 0 ? p.L : p.R, k = S.kind === "cut" ? 1 / Math.max(0.2, spec.cutR) : 1 / Math.max(0.2, spec.fillR), tot = W / 2 + (S.d || 0);
      for (let t = dt / 2; t < tot; t += dt) {
        const x = p.x + sg * p.nx * t, y = p.y + sg * p.ny * t, g = gz(x, y); if (g === null) continue;
        const des = t <= W / 2 ? p.z : (S.kind === "cut" ? p.z + (t - W / 2) * k : p.z - (t - W / 2) * k), dz = g - des;
        if (dz > 0) cut += dz * dt; else fill += -dz * dt;
      }
    } return { cut, fill }; };
  st.forEach(p => { Object.assign(p, area2(p)); });
  let cutV = 0, fillV = 0, len3 = 0, maxG = 0, sumG = 0, nG = 0, slopeCut = 0, slopeFill = 0, maxCutDepth = 0, maxFillDepth = 0, unreached = 0;
  const segs = [];
  for (let i = 1; i < n; i++) {
    const ds = st[i].s - st[i - 1].s, dz = st[i].z - st[i - 1].z, g = Math.abs(dz) / (ds || 1);
    cutV += (st[i].cut + st[i - 1].cut) / 2 * ds; fillV += (st[i].fill + st[i - 1].fill) / 2 * ds; len3 += Math.hypot(ds, dz); maxG = Math.max(maxG, g); sumG += g; nG++; segs.push(g);
    ["L", "R"].forEach(sd => { const a = st[i - 1][sd], b = st[i][sd], w = (a.d + b.d) / 2, sl = Math.hypot(1, a.kind === "cut" ? 1 / Math.max(0.2, spec.cutR) : 1 / Math.max(0.2, spec.fillR)); if (a.kind === "cut") slopeCut += w * sl * ds; else if (a.kind === "fill") slopeFill += w * sl * ds; });
  }
  st.forEach(p => { const dz = p.g - p.z; if (dz > 0) maxCutDepth = Math.max(maxCutDepth, dz); else maxFillDepth = Math.max(maxFillDepth, -dz); if (!p.L.hit || !p.R.hit) unreached++; });
  // Kurvradie (tre punkter i följd).
  const tight = [];
  for (let i = 1; i < n - 1; i++) { const a = st[i - 1], b = st[i], c = st[i + 1], ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y), ca = Math.hypot(a.x - c.x, a.y - c.y), ar = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2; const R = ar > 1e-6 ? ab * bc * ca / (4 * ar) : Infinity; b.R = R; if (R < (Number(spec.minR) || 15)) tight.push({ i, R, x: b.x, y: b.y, z: b.z }); }
  const L2 = st[n - 1].s;
  const res = { len: L2, len3, dz: st[n - 1].z - st[0].z, z0: st[0].z, z1: st[n - 1].z, maxG, avgG: nG ? sumG / nG : 0, cut: cutV, fill: fillV, net: cutV - fillV, slopeCut, slopeFill, roadArea: L2 * W, tight, maxCutDepth, maxFillDepth, unreached, cell, stations: n, miss };
  return { res, st, W };
}

/* ---- Geometri (relativt origo org) ---- */
function l3rBuild(c) {
  const st = c.st, W = c.W, spec = c.spec, org = [st[0].x, st[0].y, st[0].z], n = st.length;
  const g = Math.max(0.5, Number(spec.grade) || 10) / 100, col = gr => { const t = gr / g; return t < 0.5 ? [0.13, 0.77, 0.37] : t < 0.8 ? [0.96, 0.62, 0.04] : [0.94, 0.27, 0.27]; };
  const road = { pos: [], col: [], idx: [] }, cut = { pos: [], idx: [] }, fill = { pos: [], idx: [] };
  const crown = Number(spec.crown) || 0;
  for (let i = 0; i < n; i++) {
    const p = st[i], l = [p.x + p.nx * W / 2 - org[0], p.y + p.ny * W / 2 - org[1], p.z - org[2]], r = [p.x - p.nx * W / 2 - org[0], p.y - p.ny * W / 2 - org[1], p.z - org[2]];
    const gr = i === 0 ? Math.abs(st[1].z - st[0].z) / (st[1].s - st[0].s || 1) : Math.abs(p.z - st[i - 1].z) / (p.s - st[i - 1].s || 1), cc = col(gr);
    road.pos.push(...l, ...r); road.col.push(...cc, ...cc);
    if (i) { const a = (i - 1) * 2; road.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  [["L", 1], ["R", -1]].forEach(([sd, sg]) => {
    for (let i = 1; i < n; i++) {
      const a = st[i - 1][sd], b = st[i][sd]; if (a.kind === "none" || b.kind === "none" || (a.d < 0.01 && b.d < 0.01)) continue;
      const T = a.kind === "cut" ? cut : fill, base = T.pos.length / 3, P = q => [q.ex - org[0], q.ey - org[1], q.ze - org[2]], Q = q => [q.qx - org[0], q.qy - org[1], q.qz - org[2]];
      T.pos.push(...P(a), ...Q(a), ...P(b), ...Q(b));
      // Vägkanten vänster (sg > 0) ligger till vänster om färdriktningen: uppifrån moturs = (kant i, kant i+1, släntfot i+1 ...)
      if (sg > 0) T.idx.push(base, base + 1, base + 3, base, base + 3, base + 2); else T.idx.push(base, base + 3, base + 1, base, base + 2, base + 3);
    }
  });
  void crown;
  return { org, road: { pos: new Float32Array(road.pos), col: new Float32Array(road.col), idx: new Uint32Array(road.idx) }, cut: cut.idx.length ? { pos: new Float32Array(cut.pos), idx: new Uint32Array(cut.idx) } : null, fill: fill.idx.length ? { pos: new Float32Array(fill.pos), idx: new Uint32Array(fill.idx) } : null };
}
function l3rDraw() {
  if (!l3.groups.road) { l3.groups.road = new THREE.Group(); l3.groups.road.name = "road"; l3.scene.add(l3.groups.road); }
  const grp = l3.groups.road; l3Clear(grp);
  const c = l3road.cur; if (!c) { l3Render(); return; }
  const O = l3.O, mk = (S, col, vc, op) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(S.pos, 3)); if (vc) geo.setAttribute("color", new THREE.BufferAttribute(S.col, 3)); geo.setIndex(new THREE.BufferAttribute(S.idx, 1)); geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: !!vc, color: vc ? 0xffffff : col, transparent: op < 1, opacity: op, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(c.geom.org[0] - O[0], c.geom.org[1] - O[1], c.geom.org[2] - O[2]); mesh.renderOrder = 8; mesh.userData.noHit = true; mesh.raycast = () => {}; grp.add(mesh); return mesh; };
  if (c.geom) { mk(c.geom.road, 0, true, 1); if (c.geom.cut) mk(c.geom.cut, 0x3b82f6, false, 0.85); if (c.geom.fill) mk(c.geom.fill, 0xef4444, false, 0.85); }
  // Mittlinjen och trånga kurvor.
  const line = (pts, color) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 })); l.renderOrder = 12; l.userData.noHit = true; l.raycast = () => {}; grp.add(l); };
  if (c.st) line(c.st.map(p => new THREE.Vector3(p.x - O[0], p.y - O[1], p.z - O[2] + 0.12)), 0xffffff);
  else line(c.pts.map(p => new THREE.Vector3(p[0] - O[0], p[1] - O[1], p[2] - O[2] + 0.12)), 0xffffff);
  if (c.res) c.res.tight.forEach(t => { const sp = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.5, (Number(c.spec.width) || 5) * 0.15), 12, 8), new THREE.MeshBasicMaterial({ color: 0xd946ef, depthTest: false })); sp.position.set(t.x - O[0], t.y - O[1], t.z - O[2] + 0.5); sp.renderOrder = 13; sp.userData.noHit = true; sp.raycast = () => {}; grp.add(sp); });
  l3Render(); if (typeof l3mHandlesPlace === "function") l3mHandlesPlace();
}
function l3rSchedule(ms) {
  clearTimeout(l3road.timer);
  l3road.timer = setTimeout(async () => {
    const c = l3road.cur; if (!c) return; const seq = ++l3road.seq; c.busy = "Räknar…"; c.err = ""; l3rPanel();
    try {
      const r = await l3rCompute(c, () => seq === l3road.seq && l3road.cur === c); if (seq !== l3road.seq || l3road.cur !== c) return;
      c.busy = ""; if (!r) return;
      if (r.err) { c.err = r.err; c.res = null; c.geom = null; c.st = null; } else { c.res = r.res; c.st = r.st; c.W = r.W; c.geom = l3rBuild(c); c.saved = false; }
    } catch (err) { c.busy = ""; c.err = "Kunde inte räkna: " + (err && err.message ? err.message : err); console.warn("Byggväg", err); }
    l3rPanel(); l3rDraw();
  }, ms == null ? 200 : ms);
}

/* ---- Start, stängning, objekt ---- */
function l3roadStart() {
  const mp = l3t.mp || [];
  if (mp.length < 2) { l3Status("Vägen behöver minst två punkter.", true); return; }
  const pts = mp.map(p => [p.x + l3.O[0], p.y + l3.O[1], p.z + l3.O[2]].map(v => Math.round(v * 1000) / 1000));
  l3t.mp = null; l3Busy(false); l3ShowVcb(null); l3Clear(l3.groups.tmp); if (typeof l3ClearMeasure === "function") l3ClearMeasure();
  const prev = l3road.last || {};
  l3roadOpen({ pts, spec: { ...L3R_DEF, ...(prev.spec || {}), src: (prev.spec && prev.spec.src && prev.spec.src.length ? prev.spec.src : l3rDefaultSrc()) }, res: null, geom: null, st: null, busy: "", err: "" });
}
function l3roadOpen(cur) {
  l3roadClose(true); l3road.cur = cur; l3road.seq++;
  if (!l3road.kbd) { l3road.kbd = e => { if (e.key === "Escape" && l3road.cur && !/INPUT|SELECT|TEXTAREA/.test((e.target || {}).tagName || "")) { e.stopPropagation(); l3roadClose(); } }; window.addEventListener("keydown", l3road.kbd, true); }
  l3rPanel(); l3rDraw(); l3rSchedule(0);
}
function l3roadClose(keep) {
  const el = document.getElementById("v3RoadPanel"); if (el) el.remove();
  const c = l3road.cur; if (c) l3road.last = { spec: JSON.parse(JSON.stringify(c.spec)) };
  clearTimeout(l3road.timer); l3road.seq++; l3road.cur = null; if (!keep) l3rDriveStop(true); else l3rDriveStop(false);
  if (l3.groups.road) l3Clear(l3.groups.road);
  if (!keep) { if (l3road.kbd) { window.removeEventListener("keydown", l3road.kbd, true); l3road.kbd = null; } l3Render(); if (typeof l3mHandlesPlace === "function") l3mHandlesPlace(); }
}
/* Tryck i 3D medan panelen är öppen: ignoreras (panelen avslutas med Esc). */
function l3roadTap() {
  if (!l3road.cur || l3.tool !== "measure" || l3Prefs().measure !== "road") return false;
  l3Status("Byggvägen är öppen – skapa objekten eller stäng den (Esc) för att rita en ny väg.", true); return true;
}
/* Väg, schaktslänt och fyllningsslänt blir ritade ytor (ett steg i Ångra). */
function l3roadMake() {
  const c = l3road.cur; if (!c || !c.geom) return;
  const G = c.geom, r3 = v => Math.round(v * 1000) / 1000, conv = S => { const pts = []; for (let i = 0; i < S.pos.length; i += 3) pts.push([r3(S.pos[i]), r3(S.pos[i + 1]), r3(S.pos[i + 2])]); const faces = []; for (let i = 0; i < S.idx.length; i += 3) faces.push([S.idx[i] + 1, S.idx[i + 1] + 1, S.idx[i + 2] + 1]); return { k: "mesh", pts, faces, closed: false }; };
  placeSnapshot(); const ids = [];
  const add = (S, name, color) => { if (!S) return; const p = modCreate(conv(S), [G.org[0], G.org[1], G.org[2]], { name, color, snapshot: false }); ids.push(p.id); };
  add(G.road, `Byggväg ${l3rFmt(c.res.len, 0)} m`, "#9ca3af"); add(G.cut, "Släntyta schakt", "#60a5fa"); add(G.fill, "Släntyta fyllning", "#f87171");
  c.saved = true; l3roadClose(); l3SelectIds(ids); l3Changed();
  l3Toast(`Byggväg skapad: ${l3rFmt(c.res.len, 0)} m, schakt ${l3rM3(c.res.cut)}, fyllning ${l3rM3(c.res.fill)}. Ctrl+Z ångrar.`);
}

/* ---- Panel ---- */
function l3rPanel() {
  const c = l3road.cur; if (!c) return;
  const host = document.getElementById("v3Canvas"); if (!host) return;
  let el = document.getElementById("v3RoadPanel");
  if (!el) { el = document.createElement("div"); el.id = "v3RoadPanel"; el.className = "v3-vp"; host.appendChild(el); ["pointerdown", "wheel", "contextmenu", "dblclick", "click", "keydown", "keyup"].forEach(t => el.addEventListener(t, e => e.stopPropagation())); }
  const esc = typeof escHtml === "function" ? escHtml : s => String(s), r = c.res, spec = c.spec, srcs = l3rSources();
  const num = (k, label, tip, unit, min, max, st) => `<label class="v3-rd-n" title="${esc(tip)}"><span>${label}</span><input type="number" data-rk="${k}" value="${spec[k]}" min="${min}" max="${max}" step="${st}"><em>${unit}</em></label>`;
  const sum = r ? `<div class="v3-vp-hero ${r.net > 0 ? "neg" : r.net < 0 ? "pos" : ""}"><div class="net"><span>Väg</span><b>${l3rFmt(r.len, 0)} m</b><em>${r.dz >= 0 ? "stiger" : "sjunker"} ${l3rFmt(Math.abs(r.dz), 1)} m · ${l3rFmt(r.z0, 1)} → ${l3rFmt(r.z1, 1)} m</em></div>
      <div class="chips"><span title="Medellutning längs vägen"><i>∠</i>${l3rFmt(r.avgG * 100, 1)} % medel</span><span title="Största lutning – högst ${spec.grade} % är inställt"><i>⛰</i>${l3rFmt(r.maxG * 100, 1)} % störst</span><span title="Vägens yta i plan"><i>▭</i>${l3rFmt(r.roadArea, 0)} m²</span></div>
      <div class="cf"><button type="button" class="cut" style="cursor:default"><span>Schakt (inkl. slänter)</span><b>${l3rM3(r.cut)}</b></button><button type="button" class="fill" style="cursor:default"><span>Fyllning (inkl. slänter)</span><b>${l3rM3(r.fill)}</b></button></div>
      <div class="chips"><span title="Släntyta i schakt"><i style="color:#3b82f6">▲</i>${l3rFmt(r.slopeCut, 0)} m² schaktslänt</span><span title="Släntyta i fyllning"><i style="color:#ef4444">▼</i>${l3rFmt(r.slopeFill, 0)} m² fyllningsslänt</span><span title="Djupaste schakt / högsta fyllning i vägens mitt"><i>↕</i>−${l3rFmt(r.maxCutDepth, 1)} / +${l3rFmt(r.maxFillDepth, 1)} m</span></div></div>
      ${spec.mode === "pins" && r.maxG > (Number(spec.grade) || 10) / 100 + 0.0005 ? `<div class="v3-vq-note">⚠ Lutningen mellan punkterna blir ${l3rFmt(r.maxG * 100, 1)} % – mer än ${spec.grade} %. Flytta punkterna eller lägg till fler med +.</div>` : ""}
      ${r.tight.length ? `<div class="v3-vq-note">⚠ ${r.tight.length} ${r.tight.length === 1 ? "plats" : "ställen"} med kurvradie under ${spec.minR} m (lila prickar) – minsta radie ${l3rFmt(Math.min(...r.tight.map(t => t.R)), 1)} m. Rita mjukare kurva eller sänk minsta radie.</div>` : ""}
      ${r.unreached ? `<div class="v3-vq-note">⚠ Slänten når inte marken inom ${spec.reach} m vid ${r.unreached} stationer – höj \"Största släntbredd\" eller kontrollera ytan.</div>` : ""}
      ${r.miss ? `<div class="v3-vq-note">⚠ ${r.miss} stationer låg utanför ytan – höjden är interpolerad från grannarna.</div>` : ""}`
    : c.err ? `<div class="v3-vp-e">${esc(c.err)}</div>` : `<div class="v3-vp-t"><span class="v3-vp-spin"></span> ${c.busy || "Räknar…"}</div>`;
  const ae = document.activeElement;
  if (el.innerHTML && ae && ae.dataset && ae.dataset.rk !== undefined && el.contains(ae)) { const box = el.querySelector("[data-rres]"); if (box) box.innerHTML = sum; return; }
  el.innerHTML = `<div class="v3-vp-h"><b>Byggväg</b><span>${l3rFmt(c.pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - c.pts[i - 1][0], p[1] - c.pts[i - 1][1]) : 0, 0), 0)} m · ${c.pts.length} punkter</span><button type="button" data-rb="x" title="Stäng (Esc)">✕</button></div>
    <div class="v3-vp-tip"><b>Dra</b> en ring för att flytta en punkt · <b>+</b> mellan ringarna lägger till en punkt · högerklicka en ring tar bort den · Ctrl+Z ångrar</div>
    <div class="v3-rd-src" title="Vilka ytor vägen ska följa. Flera kan kombineras – den högsta gäller.">${srcs.length ? srcs.map(s => `<label><input type="checkbox" data-rs="${esc(s.k)}" ${spec.src.includes(s.k) ? "checked" : ""}> ${esc(s.label)}</label>`).join("") : `<div class="v3-vp-t warn">Tänd ett punktmoln, en 3D-modell eller en DXF (Lager) som vägen ska följa.</div>`}</div>
    <div data-rres>${sum}</div>
    <div class="v3-rd-g">
      ${num("width", "Vägbredd", "Körbanans bredd mellan släntfötterna", "m", 2, 30, 0.5)}${num("grade", "Högsta lutning", "Vägens lutning får aldrig bli högre än så (tung trafik: 8–10 %)", "%", 1, 30, 0.5)}
      ${num("smooth", "Jämna ut över", "Längd som markens höjd jämnas ut över – större värde ger en mjukare väg som skär mer", "m", 0, 200, 5)}${num("minR", "Minsta radie", "Kurvor med mindre radie markeras (lastbil/dumper ca 12–20 m)", "m", 3, 100, 1)}
      <label class="v3-rd-n" title="Schaktslänt: 1 lodrätt på så här många meter i sidled (1 = 45°, 0,5 = brant bergschakt)"><span>Schaktslänt 1:</span><input type="number" data-rk="cutR" value="${spec.cutR}" min="0.25" max="5" step="0.25"><em></em></label>
      <label class="v3-rd-n" title="Fyllningsslänt: 1 lodrätt på så här många meter i sidled (1,5 = vanlig fyllning)"><span>Fyllningsslänt 1:</span><input type="number" data-rk="fillR" value="${spec.fillR}" min="0.5" max="6" step="0.25"><em></em></label>
      ${num("reach", "Största släntbredd", "Så långt ut från vägkanten letar slänten efter marken", "m", 3, 100, 1)}${num("step", "Stationsavstånd", "Avstånd mellan tvärsnitten (mindre = mer detaljerat)", "m", 0.5, 10, 0.5)}
      ${spec.mode === "anchor" ? `<label class="v3-rd-n" style="grid-column:1/3" title="Punkten vars höjd är given. Dra i ringen för att ändra höjden."><span>Höjdpunkt</span><select data-ra style="flex:2;padding:3px;border:1px solid #cbd5e1;border-radius:6px;font:inherit"><option value="-1" ${!(spec.anchor >= 0) ? "selected" : ""}>Högsta punkten du klickat</option>${c.pts.map((p, i) => `<option value="${i}" ${Number(spec.anchor) === i ? "selected" : ""}>Punkt ${i + 1} (${l3rFmt(p[2], 2)} m)</option>`).join("")}</select></label><label class="v3-rd-n" style="grid-column:1/3" title="Vägen går aldrig högre än höjdpunkten"><input type="checkbox" data-rc ${spec.cap !== false ? "checked" : ""} style="width:auto"><span>Aldrig över höjdpunkten</span></label>` : ""}
      <div class="v3-rd-seg" title="Höjdprofil"><button type="button" data-rm="anchor" class="${spec.mode === "anchor" ? "on" : ""}" title="En punkt på vägen har given höjd (som standard den högsta du klickat) – resten räknas därifrån med högsta lutning">Från höjdpunkt</button><button type="button" data-rm="terrain" class="${spec.mode === "terrain" ? "on" : ""}">Följ marken</button><button type="button" data-rm="straight" class="${spec.mode === "straight" ? "on" : ""}">Rak start → slut</button><button type="button" data-rm="pins" class="${spec.mode === "pins" ? "on" : ""}" title="Vägen går genom höjden i varje punkt du klickat ut (dra en ring för att ändra) – den högsta punkten blir vägens högsta">Genom mina punkter</button></div>
    </div>
    <div class="v3-rd-drv" title="Lastbilen från Gå-läget kör vägen: nosen följer lutningen, den styr i kurvorna och går långsammare uppför"><button type="button" data-rb="drive" ${r ? "" : "disabled"}>${l3rDrv.on ? "⏸ Pausa" : l3rDrv.s > 0.5 ? "▶ Fortsätt" : "▶ Kör vägen"}</button><button type="button" data-rb="drvreset" title="Tillbaka till start">⏮</button><label title="Fart i km/h på plan väg"><input type="number" data-rk="speed" value="${spec.speed}" min="3" max="60" step="1"> km/h</label><label title="Kameran åker med lastbilen"><input type="checkbox" data-rf ${l3rDrv.follow ? "checked" : ""}> Följ</label><label title="Börja om när lastbilen kommit fram"><input type="checkbox" data-rl ${l3rDrv.loop ? "checked" : ""}> Loop</label><div data-rinfo class="v3-rd-info"></div></div>
    <div class="v3-vq-foot"><button type="button" class="primary" data-rb="make" ${r ? "" : "disabled"} title="Väg, schaktslänt och fyllningsslänt blir vanliga ytor (flytta, ändra, IFC, DXF)">Skapa objekt</button><button type="button" data-rb="undo" title="Ta bort sista punkten" ${c.pts.length > 2 ? "" : "disabled"}>↶</button><button type="button" data-rb="redraw" title="Rita om mittlinjen">Rita om</button><button type="button" data-rb="x">Stäng</button></div>`;
  const q = s => el.querySelector(s), qa = s => el.querySelectorAll(s), on = (k, fn) => qa(`[data-rb="${k}"]`).forEach(b => { b.onclick = fn; });
  qa("input[data-rk]").forEach(i => { i.oninput = () => { const v = Number(String(i.value).replace(",", ".")); if (Number.isFinite(v) && v >= Number(i.min) && v <= Number(i.max)) { spec[i.dataset.rk] = v; c.saved = false; l3rSchedule(350); } }; i.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") i.blur(); }; });
  qa("input[data-rs]").forEach(i => { i.onchange = () => { const k = i.dataset.rs; spec.src = i.checked ? [...new Set([...spec.src, k])] : spec.src.filter(x => x !== k); l3rSchedule(0); }; });
  { const a = q("select[data-ra]"); if (a) a.onchange = () => { spec.anchor = Number(a.value); l3rSchedule(0); }; const cc = q("input[data-rc]"); if (cc) cc.onchange = () => { spec.cap = cc.checked; l3rSchedule(0); }; }
  qa("[data-rm]").forEach(b => { b.onclick = () => { spec.mode = b.dataset.rm; l3rPanel(); l3rSchedule(0); }; });
  on("x", () => l3roadClose()); on("make", l3roadMake); on("drive", l3rDriveToggle); on("drvreset", l3rDriveReset);
  { const f = q("input[data-rf]"); if (f) f.onchange = () => { l3rDrv.follow = f.checked; l3rDrv.prev = null; }; const l = q("input[data-rl]"); if (l) l.onchange = () => { l3rDrv.loop = l.checked; }; }
  on("undo", () => l3roadRemovePt(c.pts.length - 1));
  on("redraw", () => { l3roadClose(true); l3t.mp = null; l3Busy(true); l3t.mpObjs = []; l3Status("Tryck ut vägens mittlinje igen (Enter avslutar)."); });
  void q;
}

/* Liten CSS för panelen (övrigt återanvänder Volym-panelens klasser). */
(function l3rCss() {
  if (document.getElementById("v3RoadCss")) return; const s = document.createElement("style"); s.id = "v3RoadCss";
  s.textContent = `#view3d #v3RoadPanel .v3-rd-g{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;margin:8px 0}#view3d #v3RoadPanel .v3-rd-n{display:flex;align-items:center;gap:4px;font-size:12px}#view3d #v3RoadPanel .v3-rd-n span{flex:1;color:#475569;font-weight:600}#view3d #v3RoadPanel .v3-rd-n input{width:58px;padding:3px 4px;border:1px solid #cbd5e1;border-radius:6px;font:inherit}#view3d #v3RoadPanel .v3-rd-n em{width:16px;font-style:normal;color:#64748b}#view3d #v3RoadPanel .v3-rd-seg{grid-column:1/3;display:flex;gap:4px}#view3d #v3RoadPanel .v3-rd-seg button{flex:1;padding:5px 6px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;cursor:pointer;font:inherit;font-size:12px}#view3d #v3RoadPanel .v3-rd-seg button.on{background:#2563eb;border-color:#2563eb;color:#fff}#view3d #v3RoadPanel .v3-rd-drv{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;margin:8px 0;font-size:12px}#view3d #v3RoadPanel .v3-rd-drv button{padding:5px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;cursor:pointer;font:inherit}#view3d #v3RoadPanel .v3-rd-drv input[type=number]{width:46px;padding:3px;border:1px solid #cbd5e1;border-radius:6px;font:inherit}#view3d #v3RoadPanel .v3-rd-info{flex-basis:100%;color:#475569}#view3d #v3RoadPanel .v3-rd-src{display:flex;flex-direction:column;gap:2px;margin:6px 0;font-size:12px;max-height:84px;overflow:auto}`;
  document.head.appendChild(s);
})();

/* Ta bort en punkt (högerklick på ringen, eller ↶ för den sista). Minst två punkter ska finnas kvar. */
function l3roadRemovePt(i) {
  const c = l3road.cur; if (!c || c.pts.length <= 2 || i < 0 || i >= c.pts.length) return;
  const was = c.pts.map(p => p.slice());
  c.pts.splice(i, 1); c.geom = null; c.st = null; c.saved = false;
  const set = st => { if (l3road.cur !== c) return; c.pts = st.map(p => p.slice()); c.geom = null; c.st = null; l3rDraw(); l3rSchedule(0); };
  const now = c.pts.map(p => p.slice());
  if (typeof l3VPush === "function") l3VPush(() => set(was), () => set(now), "ta bort vägpunkt");
  l3rDraw(); l3rSchedule(0); l3Status("Punkten borttagen – vägen räknas om (Ctrl+Z ångrar).");
}
document.addEventListener("contextmenu", e => {
  if (!l3road.cur) return; const b = e.target.closest && e.target.closest(".v3-mhandle"); if (!b) return;
  const i = typeof l3mH !== "undefined" ? l3mH.els.indexOf(b) : -1; if (i < 0) return;
  e.preventDefault(); e.stopPropagation(); l3roadRemovePt(i);
}, true);

/* ---- Lastbil som kör vägen (Victor 2026-11-10: "bygg en lastbil som kör vägen") -------------------------------------------------------------------------
   Samma lastbil som i Gå-läget. Den följer vägens höjdprofil (nos upp/ner efter lutningen), styr in i kurvorna, hjulen snurrar med färden och farten
   sjunker i uppförsbackar. "Följ" låter kameran åka med. Fungerar medan byggvägspanelen är öppen och följer vägen när den ändras. */
const l3rDrv = { on: false, s: 0, travel: 0, raf: 0, last: 0, truck: null, grp: null, follow: true, loop: true, v: 0, t: 0, prev: null, steerV: 0 };
const L3R_FRONT = 3.9, L3R_REAR = -2.1;   // framaxel och medel av bakaxlarna (m framför/bakom lastbilens origo)
function l3rAt(st, s) {
  const n = st.length; s = Math.max(0, Math.min(st[n - 1].s, s)); let k = 0; while (k < n - 2 && st[k + 1].s < s) k++;
  const a = st[k], b = st[k + 1], t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2(b.y - a.y, b.x - a.x), g: (b.z - a.z) / (b.s - a.s || 1) };
}
const l3rAng = d => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
function l3rDriveEnsure() {
  if (l3rDrv.truck) return true; if (typeof l3vTruck !== "function") { l3Status("Lastbilen finns inte i den här versionen.", true); return false; }
  const t = l3vTruck(); l3rDrv.truck = t; const g = new THREE.Group(); g.name = "roadtruck"; g.add(t.g); l3.scene.add(g); l3rDrv.grp = g; return true;
}
/* Ett steg: flytta lastbilen dt sekunder längs vägen. Returnerar texten för avläsningen. */
function l3rDriveStep(dt) {
  const c = l3road.cur, D = l3rDrv; if (!c || !c.st || c.st.length < 2 || !l3rDriveEnsure()) return "";
  const st = c.st, L = st[st.length - 1].s, kmh = Math.max(3, Number(c.spec.speed) || 20);
  const cur = l3rAt(st, D.s + (L3R_FRONT + L3R_REAR) / 2), up = Math.max(0, cur.g), v = kmh / 3.6 * Math.max(0.35, 1 - 3 * up);   // uppför: långsammare
  D.v += (v - D.v) * Math.min(1, dt * 3); if (D.on) { D.s += D.v * dt; D.travel += D.v * dt; }
  if (D.s > L - 0.5) { if (D.loop) { D.s = 0; D.prev = null; } else { D.s = L - 0.5; D.on = false; l3rDriveUi(); } }
  const sF = D.s + L3R_FRONT, sR = D.s + L3R_REAR, F = l3rAt(st, sF), R = l3rAt(st, sR), d2 = Math.hypot(F.x - R.x, F.y - R.y);
  const yaw = d2 > 0.5 ? Math.atan2(F.y - R.y, F.x - R.x) : l3rAt(st, D.s).yaw, pitch = Math.atan2(F.z - R.z, Math.max(0.5, d2));
  const f = (L3R_FRONT - L3R_REAR) > 0 ? -L3R_REAR / (L3R_FRONT - L3R_REAR) : 0.5, O = l3.O;
  const px = R.x + (F.x - R.x) * f - O[0], py = R.y + (F.y - R.y) * f - O[1], pz = R.z + (F.z - R.z) * f - O[2];
  const g = l3rDrv.grp; g.position.set(px, py, pz); g.rotation.set(0, 0, 0); g.rotation.order = "ZYX"; g.rotation.z = yaw; g.rotation.y = -pitch;
  // Styrning: kurvan en bit framför
  const a1 = l3rAt(st, D.s + 1).yaw, a2 = l3rAt(st, D.s + 9).yaw, k = l3rAng(a2 - a1) / 8, steer = Math.max(-1, Math.min(1, Math.atan(6 * k) / 0.5));
  l3rDrv.t += dt; l3rDrv.truck.update({ dt, t: l3rDrv.t, travel: D.travel, steer, brake: !D.on, rev: false, work: 0, ctl: { tip: 0, gate: 0, load: 0.7, mat: 0 } });
  if (D.follow && D.prev) { const dx = px - D.prev[0], dy = py - D.prev[1], dz = pz - D.prev[2]; l3.camera.position.x += dx; l3.camera.position.y += dy; l3.camera.position.z += dz; l3.orbit.target.x += dx; l3.orbit.target.y += dy; l3.orbit.target.z += dz; l3.orbit.update(); }
  D.prev = [px, py, pz];
  return `Fart ${l3rFmt(D.v * 3.6, 0)} km/h · lutning ${cur.g >= 0 ? "+" : "−"}${l3rFmt(Math.abs(cur.g) * 100, 1)} % · ${l3rFmt(Math.min(D.s, L), 0)} / ${l3rFmt(L, 0)} m`;
}
function l3rDriveLoop(now) {
  const D = l3rDrv; if (!l3road.cur) { l3rDriveStop(true); return; }
  const dt = Math.min(0.1, D.last ? (now - D.last) / 1000 : 0.016); D.last = now;
  const txt = l3rDriveStep(dt), el = document.querySelector("#v3RoadPanel [data-rinfo]"); if (el && txt) el.textContent = txt;
  l3Render(); D.raf = requestAnimationFrame(l3rDriveLoop);
}
function l3rDriveUi() { const b = document.querySelector('#v3RoadPanel [data-rb="drive"]'); if (b) b.textContent = l3rDrv.on ? "⏸ Pausa" : (l3rDrv.s > 0.5 ? "▶ Fortsätt" : "▶ Kör vägen"); }
function l3rDriveToggle() {
  const D = l3rDrv, c = l3road.cur; if (!c || !c.st) { l3Status("Vänta tills vägen är räknad.", true); return; }
  if (!l3rDriveEnsure()) return;
  D.on = !D.on; if (D.on) { D.last = 0; D.prev = null; if (!D.raf) D.raf = requestAnimationFrame(l3rDriveLoop); l3Status("Lastbilen kör vägen – Följ-rutan låter kameran åka med."); } l3rDriveUi();
  if (!D.raf) { l3rDriveStep(0); l3Render(); }
}
function l3rDriveReset() { const D = l3rDrv; D.s = 0; D.travel = 0; D.prev = null; D.v = 0; if (l3road.cur && l3road.cur.st) { l3rDriveStep(0); l3Render(); } l3rDriveUi(); }
function l3rDriveStop(remove) {
  const D = l3rDrv; D.on = false; cancelAnimationFrame(D.raf); D.raf = 0; D.last = 0; D.prev = null;
  if (remove && D.grp) { l3.scene.remove(D.grp); D.grp = null; D.truck = null; D.s = 0; D.travel = 0; D.v = 0; l3Render(); }
}
