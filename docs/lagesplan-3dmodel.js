/* Modellera (Victor 2026-10-30) – ytor under markören, Push/Pull, Offset och frihand, samt verktygsfältet för Rita/Modellera.

   Yta under markören:
   – ritat objekt (lagesplan-3dmod.js): ytan, kroppens över-/undersida och väggar träffas exakt (analytiskt), också hålen;
   – annat (IFC-objekt, DXF-ytor, etableringsobjekt): den sammanhängande plana ytan runt träffen (alla trianglar i samma plan som hänger ihop med träffen),
     med sin yttre kontur och eventuella hål. Det ursprungliga objektet ändras aldrig – resultatet blir ett nytt ritat objekt (GUID och egenskaper bevaras). */

/* Stråle i världskoordinater → lokalt system för ett ritat objekt (ankare + vridning kring z). */
function l3dwToLocal(p, v, isDir) {
  const rot = -(Number(p.rot) || 0) * Math.PI / 180, c = Math.cos(rot), s = Math.sin(rot), a = isDir ? [0, 0, 0] : [Number(p.x) || 0, Number(p.y) || 0, (Number(p.z) || 0) + (Number(p.dz) || 0)];
  const d = [v[0] - a[0], v[1] - a[1], v[2] - a[2]]; return [d[0] * c - d[1] * s, d[0] * s + d[1] * c, d[2]];
}
function l3dwFromLocal(p, v, isDir) {
  const rot = (Number(p.rot) || 0) * Math.PI / 180, c = Math.cos(rot), s = Math.sin(rot), a = isDir ? [0, 0, 0] : [Number(p.x) || 0, Number(p.y) || 0, (Number(p.z) || 0) + (Number(p.dz) || 0)];
  return [v[0] * c - v[1] * s + a[0], v[0] * s + v[1] * c + a[1], v[2] + a[2]];
}
const l3dwPlaneFromLocal = (p, pl) => ({ o: l3dwFromLocal(p, pl.o), u: l3dwFromLocal(p, pl.u, true), v: l3dwFromLocal(p, pl.v, true) });

/* Sammanhängande plan yta runt en träff i en mesh: { pl (normal mot kameran), loops (planets koordinater) } eller null. */
function l3dwRegionOf(h, camDir) {
  let o = h.object; if (o.userData.l3bMain) o = o.userData.l3bMain;
  const geo = o.geometry, pos = geo && geo.getAttribute("position"); if (!pos || !h.face) return null;
  const u = o.userData.l3b; let idx = geo.index ? geo.index.array : null, ri = null;
  if (u) { const x = typeof l3bsFromHit === "function" ? l3bsFromHit(h) : null; if (!x) return null; ri = x.ri; const r = u.ranges[ri]; idx = u.origIdx.subarray ? u.origIdx.subarray(r.idxStart, r.idxStart + r.idxCount) : u.origIdx.slice(r.idxStart, r.idxStart + r.idxCount); }
  const nT = idx ? idx.length / 3 : pos.count / 3; if (nT > 60000) { l3Status("Objektet är för stort för att dra ut en yta (över 60 000 trianglar).", true); return null; }
  o.updateMatrixWorld(); const M = o.matrixWorld, O = l3.O, V = new THREE.Vector3();
  const P = i => { V.fromBufferAttribute(pos, i).applyMatrix4(M); return [V.x + O[0], V.y + O[1], V.z + O[2]]; };
  const key = o.uuid + ":" + ri + ":" + h.faceIndex; if (l3dw.cacheR.has(key)) { const c = l3dw.cacheR.get(key); return { ...c, pl: MG.dot(MG.normal(c.pl), camDir) > 0 ? { o: c.pl.o, u: c.pl.v, v: c.pl.u } : c.pl }; }
  // träffens triangel (i listans index)
  const tri = t => idx ? [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]] : [t * 3, t * 3 + 1, t * 3 + 2];
  // h.faceIndex är i hela meshens triangellista – leta triangeln via dess hörn
  let t0 = -1; const fa = h.face.a, fb = h.face.b, fc = h.face.c;
  for (let t = 0; t < nT; t++) { const v = tri(t); if (v.includes(fa) && v.includes(fb) && v.includes(fc)) { t0 = t; break; } }
  if (t0 < 0) return null;
  const T = []; for (let t = 0; t < nT; t++) { const v = tri(t); T.push(v.map(P)); }
  const nrm = tr => { const a = tr[0], b = tr[1], c = tr[2], n = MG.cross(MG.sub(b, a), MG.sub(c, a)); return MG.norm(n); };
  const n0 = nrm(T[t0]), a0 = T[t0][0], q = x => Math.round(x * 1e3);
  const vk = p => q(p[0]) + "," + q(p[1]) + "," + q(p[2]), ek = (a, b) => { const x = vk(a), y = vk(b); return x < y ? x + "|" + y : y + "|" + x; };
  const coplanar = tr => tr.every(p => Math.abs(MG.dot(MG.sub(p, a0), n0)) < 2e-3) && Math.abs(Math.abs(MG.dot(nrm(tr), n0)) - 1) < 1e-4;
  const edgeTris = new Map(); T.forEach((tr, t) => { for (let i = 0; i < 3; i++) { const k = ek(tr[i], tr[(i + 1) % 3]); (edgeTris.get(k) || edgeTris.set(k, []).get(k)).push(t); } });
  const seen = new Set([t0]), Q = [t0], reg = [];
  while (Q.length) { const t = Q.pop(); reg.push(t); const tr = T[t]; for (let i = 0; i < 3; i++) (edgeTris.get(ek(tr[i], tr[(i + 1) % 3])) || []).forEach(n => { if (!seen.has(n) && coplanar(T[n])) { seen.add(n); Q.push(n); } }); }
  // randkanter (används av en triangel i ytan) → konturer
  const cnt = new Map(); reg.forEach(t => { const tr = T[t]; for (let i = 0; i < 3; i++) { const a = tr[i], b = tr[(i + 1) % 3], k = ek(a, b), e = cnt.get(k); if (e) e.n++; else cnt.set(k, { n: 1, a, b }); } });
  const bd = [...cnt.values()].filter(e => e.n === 1), next = new Map(); bd.forEach(e => { const k = vk(e.a); (next.get(k) || next.set(k, []).get(k)).push(e); });
  const used = new Set(), loops3 = [];
  bd.forEach(e0 => { if (used.has(e0)) return; const ring = [e0.a]; let e = e0; used.add(e); for (let g = 0; g < 100000; g++) { ring.push(e.b); const cand = (next.get(vk(e.b)) || []).filter(x => !used.has(x)); if (!cand.length) break; e = cand[0]; used.add(e); if (vk(e.b) === vk(ring[0])) { ring.push(e.b); break; } } if (ring.length > 3 && vk(ring[ring.length - 1]) === vk(ring[0])) { ring.pop(); loops3.push(ring); } });
  if (!loops3.length) return null;
  const pl0 = MG.planeFrom(n0, a0), L2 = loops3.map(r => MG.clean(r.map(c => MG.to2(pl0, c)))).filter(l => l.length >= 3).sort((x, y) => Math.abs(MG.area2(y)) - Math.abs(MG.area2(x)));
  const outer = L2[0], holes = L2.slice(1).filter(l => MG.pip(outer, l[0]));
  const res = { pl: pl0, loops: [MG.ccw(outer), ...holes.map(MG.cw)], tris: reg.length };
  if (l3dw.cacheR.size > 200) l3dw.cacheR.clear(); l3dw.cacheR.set(key, res);
  return { ...res, pl: MG.dot(MG.normal(pl0), camDir) > 0 ? { o: pl0.o, u: pl0.v, v: pl0.u } : pl0 };
}

/* Ytan under markören: { kind: "mod"|"mesh", p, face, pl (absolut, normal = utåt/mot kameran), loops, pt } */
function l3dwFaceAt(e) {
  const hits = l3Ray(e, l3Surfaces()); if (!hits.length) return null;
  const h = hits.find(x => x.object !== l3.planMesh && x.distance < hits[0].distance + 0.03); // ritade ytor på marken ligger i samma plan som ritningen
  if (!h) return null;
  const O = l3.O, ray = l3MouseRay(e), ro = [ray.origin.x + O[0], ray.origin.y + O[1], ray.origin.z + O[2]], rd = [ray.direction.x, ray.direction.y, ray.direction.z];
  const pid = l3PlaceIdOf(h.object), p = pid ? placements.find(x => x.id === pid) : null;
  if (p && p.m && p.m.k !== "curve") {
    const pk = modPick(p, l3dwToLocal(p, ro), l3dwToLocal(p, rd, true)); if (!pk) return null;
    const f = pk.face; let pl = l3dwPlaneFromLocal(p, pk.pl), loops = f.kind === "wall" ? [f.poly3.map(q => MG.to2(pl, l3dwFromLocal(p, q)))] : f.loops;
    // normalen: kroppens sidor pekar utåt, ytor mot kameran
    const nAbs = MG.normal(pl), n = f.out ? MG.norm(l3dwFromLocal(p, f.out, true)) : (MG.dot(nAbs, rd) > 0 ? MG.mul(nAbs, -1) : nAbs);
    if (MG.dot(nAbs, n) < 0) { pl = { o: pl.o, u: pl.v, v: pl.u }; loops = loops.map(L => L.map(q => [q[1], q[0]])); }
    return { kind: "mod", p, face: f, pl, loops, n, pt: l3dwFromLocal(p, pk.p) };
  }
  const reg = l3dwRegionOf(h, rd); if (!reg) return null;
  return { kind: "mesh", p: p || null, pl: reg.pl, loops: reg.loops, n: MG.normal(reg.pl), pt: l3dwA(h.point), mesh: h.object };
}
/* Närmsta punktens parameter längs linjen (o, n) för markörens stråle. */
function l3dwLineParam(e, o, n) {
  const O = l3.O, ray = l3MouseRay(e), ro = [ray.origin.x + O[0], ray.origin.y + O[1], ray.origin.z + O[2]], rd = [ray.direction.x, ray.direction.y, ray.direction.z];
  const w0 = MG.sub(o, ro), b = MG.dot(n, rd), d = MG.dot(n, w0), ee = MG.dot(rd, w0), den = 1 - b * b;
  if (Math.abs(den) < 1e-6) return 0; return (b * ee - d) / den;
}

/* ---- Hover och tryck för Modellera ---- */
function l3dwModelHover(e, m) {
  if (m === "pushpull") return l3dwPPHover(e);
  if (m === "offset") return l3dwOffHover(e);
  return true;
}
function l3dwModelTap(e, m) {
  if (m === "pushpull") return l3dwPPTap(e);
  if (m === "offset") return l3dwOffTap(e);
  return true;
}
function l3dwModelEnter(typed) {
  const op = l3dw.op; if (!op) return;
  if (!typed.length || !Number.isFinite(typed[0])) { l3dw.vcb = ""; return; }
  if (op.type === "pp") l3dwPPCommit(typed[0]); else if (op.type === "off") l3dwOffCommit(typed[0] * (op.side || 1));
}
function l3dwModelRefresh() { if (l3dw.ev) l3dwModelHover(l3dw.ev, l3dwMode()); }
function l3dwHighlight(F, col = "#f59e0b") {
  const loops3 = F.loops.map(L => L.map(q => MG.to3(F.pl, q)));
  l3dwFill(F.pl, F.loops, col, 0.28); loops3.forEach(L => l3dwLoop(L, col));
}

/* Push/Pull */
function l3dwPPHover(e) {
  const op = l3dw.op;
  if (!op) { const F = l3dwFaceAt(e); l3dw.hov = F; if (F) { l3dwHighlight(F); l3ShowMarker({ point: l3dwS(F.pt), kind: "face" }); } else l3ShowMarker(null); return true; }
  let dist = 0; const typed = l3dwParse(l3dw.vcb);
  if (typed.length && Number.isFinite(typed[0])) dist = typed[0];
  else {
    dist = l3dwLineParam(e, op.o, op.n);
    const S = l3Snap(e); if (S && ["end", "mid", "edge"].includes(S.kind)) { const sp = l3dwA(S.point), t = MG.dot(MG.sub(sp, op.o), op.n), perp = MG.len(MG.sub(MG.sub(sp, op.o), MG.mul(op.n, t))); if (perp < 0.25 * Math.max(1, Math.abs(t))) { dist = t; l3dwMarker({ p: sp, kind: S.kind }); } }
    dist = Math.round(dist * 100) / 100;
  }
  op.d = dist; l3dwPPDraw(op); l3dwVcb("Avstånd"); return true;
}
function l3dwPPDraw(op) {
  const F = op.F, d = op.d; l3dwHighlight(F, "#2563eb");
  if (Math.abs(d) < 1e-3) { l3dwLabel(op.o, "0"); return; }
  const pl = MG.planeFrom(op.n, F.pl.o); // ytans plan med normalen = dragriktningen
  const loops = F.loops.map(L => L.map(q => MG.to2(pl, MG.to3(F.pl, q))));
  try { const sm = MG.solidMesh(pl, loops, d), g = new THREE.BufferGeometry(), pos = []; sm.faces.forEach(f => f.forEach(i => { const v = l3dwS(sm.pts[i - 1]); pos.push(v.x, v.y, v.z); })); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: "#2563eb", transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, depthTest: false })); mesh.renderOrder = 8; mesh.userData.noHit = true; mesh.raycast = () => {}; l3.groups.tmp.add(mesh);
    const off = MG.mul(op.n, d); F.loops.forEach(L => L.forEach((q, i) => { const a = MG.to3(F.pl, q), b = MG.to3(F.pl, L[(i + 1) % L.length]); l3dwLine(MG.add(a, off), MG.add(b, off), "#2563eb"); l3dwLine(a, MG.add(a, off), "#2563eb", true); }));
  } catch (err) { /* ogiltig kontur */ }
  l3dwLabel(MG.add(op.o, MG.mul(op.n, d / 2)), l3dwFmt(d));
}
function l3dwPPTap(e) {
  if (!l3dw.op) {
    const F = l3dwFaceAt(e); if (!F) { l3Status("Tryck på en yta att dra ut.", true); return true; }
    l3dw.op = { type: "pp", F, o: F.pt, n: F.n, d: 0 }; l3dwHint(); l3dwHover(e); l3Status("Dra och tryck, eller skriv avståndet och Enter. Minus trycker in."); return true;
  }
  l3dwPPCommit(l3dw.op.d); return true;
}
function l3dwPPCommit(dist) {
  const op = l3dw.op; if (!op) return; const F = op.F;
  l3dwTmp(); l3dw.op = null; l3dw.vcb = ""; l3ShowVcb(null); l3.measLabel = null; if (l3t.measEl) l3t.measEl.style.display = "none"; l3dwHint();
  if (Math.abs(dist) < 1e-3) { l3Status("Avståndet blev 0 – inget ändrades."); return; }
  const n = op.n;
  if (F.kind === "mod" && F.p.m.k === "face") {
    const sg = MG.dot(MG.normal(l3dwPlaneFromLocal(F.p, F.p.m.pl)), n) >= 0 ? 1 : -1;
    modEdit(F.p, m => { m.k = "solid"; m.d = MG.r3(dist * sg); });
    l3SelectIds([F.p.id]); l3Status(`Yta utdragen ${l3dwFmt(dist)} – kropp (Ctrl+Z ångrar).`); return;
  }
  if (F.kind === "mod" && F.p.m.k === "solid" && (F.face.kind === "cap0" || F.face.kind === "capd")) {
    const sgn = F.p.m.d >= 0 ? 1 : -1, nl = MG.normal(F.p.m.pl);
    modEdit(F.p, m => {
      if (F.face.kind === "capd") m.d = MG.r3(m.d + sgn * dist);
      else { m.pl = { o: MG.round3(MG.add(m.pl.o, MG.mul(nl, -sgn * dist))), u: m.pl.u, v: m.pl.v }; m.d = MG.r3(m.d + sgn * dist); }
      if (Math.abs(m.d) < 1e-3) { m.k = "face"; m.d = 0; }
    });
    l3SelectIds([F.p.id]); l3Status(`Kroppens ${F.face.kind === "capd" ? "överdel" : "underdel"} flyttad ${l3dwFmt(dist)}.`); return;
  }
  // Vägg på en kropp, eller yta på IFC/annat objekt: en ny kropp av ytan (ursprunget orört)
  const pl = MG.planeFrom(n, F.pl.o), loops = F.loops.map(L => L.map(q => MG.to2(pl, MG.to3(F.pl, q)))), anchor = MG.to3(pl, loops[0][0]), o2 = MG.to2(pl, anchor);
  const lp = loops.map(L => L.map(q => [MG.r3(q[0] - o2[0]), MG.r3(q[1] - o2[1])]));
  placeSnapshot();
  const made = modCreate({ k: "solid", pl: { o: MG.round3(MG.sub(pl.o, anchor)), u: pl.u, v: pl.v }, loops: lp, d: MG.r3(dist) }, anchor, { name: "Kropp", snapshot: false, color: F.kind === "mod" ? F.p.color : undefined });
  l3SelectIds([made.id]); l3Changed(); l3Status(`Ny kropp ${l3dwFmt(dist)} av ytan (${F.kind === "mod" ? "kroppens vägg" : "objektet är orört"}). Ctrl+Z ångrar.`);
}

/* Offset */
function l3dwOffHover(e) {
  const op = l3dw.op;
  if (!op) { const F = l3dwFaceAt(e); l3dw.hov = F; if (F) { l3dwHighlight(F); l3ShowMarker({ point: l3dwS(F.pt), kind: "face" }); } else l3ShowMarker(null); return true; }
  const O = l3.O, ray = l3MouseRay(e), hit = MG.rayPlane([ray.origin.x + O[0], ray.origin.y + O[1], ray.origin.z + O[2]], [ray.direction.x, ray.direction.y, ray.direction.z], op.F.pl);
  if (!hit) return true;
  const q = MG.to2(op.F.pl, hit.p), L = op.F.loops[0]; let best = Infinity;
  for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length], dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / (dx * dx + dy * dy || 1))); best = Math.min(best, Math.hypot(a[0] + dx * t - q[0], a[1] + dy * t - q[1])); }
  const inside = MG.pip(L, q); op.side = inside ? 1 : -1;
  const typed = l3dwParse(l3dw.vcb); let d = Math.round(best * 100) / 100; if (typed.length && Number.isFinite(typed[0])) d = Math.abs(typed[0]);
  op.d = d * op.side; l3dwOffDraw(op); l3dwVcb("Avstånd"); return true;
}
function l3dwOffDraw(op) {
  const F = op.F; l3dwHighlight(F, "#94a3b8");
  const off = MG.offsetLoop(F.loops[0], op.d);
  if (!off) { l3dwLabel(F.pt, "för stort"); return; }
  l3dwLoop(off.map(q => MG.to3(F.pl, q)), "#dc2626"); l3dwFill(F.pl, [off], "#dc2626", 0.18);
  l3dwLabel(MG.to3(F.pl, MG.centroid2(off)), `${op.d >= 0 ? "inåt" : "utåt"} ${l3dwFmt(Math.abs(op.d))}`);
}
function l3dwOffTap(e) {
  if (!l3dw.op) { const F = l3dwFaceAt(e); if (!F) { l3Status("Tryck på en yta att förskjuta.", true); return true; } l3dw.op = { type: "off", F, d: 0, side: 1 }; l3dwHint(); l3dwHover(e); l3Status("Flytta för avståndet och tryck – eller skriv det och Enter."); return true; }
  l3dwOffCommit(l3dw.op.d); return true;
}
function l3dwOffCommit(d) {
  const op = l3dw.op; if (!op) return; const F = op.F;
  l3dwTmp(); l3dw.op = null; l3dw.vcb = ""; l3ShowVcb(null); l3.measLabel = null; if (l3t.measEl) l3t.measEl.style.display = "none"; l3dwHint();
  if (Math.abs(d) < 1e-3) { l3Status("Avståndet blev 0 – inget skapades."); return; }
  const off = MG.offsetLoop(F.loops[0], d); if (!off) { l3Status("Förskjutningen blev för stor – ytan försvinner.", true); return; }
  placeSnapshot();
  let made;
  if (d > 0 && F.kind === "mod" && F.p.m.k === "face") { // ytan blir en ring och mitten en egen yta (som i SketchUp)
    const lp = off.map(q => [MG.r3(q[0]), MG.r3(q[1])]), host = F.p;
    const plAbs = l3dwPlaneFromLocal(host, host.m.pl), loop3 = lp.map(q => MG.to3(plAbs, q)); // F.pl är samma plan (eller vänd)
    const same = MG.dot(MG.normal(plAbs), MG.normal(F.pl)) > 0, loopHost = same ? lp : lp.map(q => [q[1], q[0]]);
    void loop3; modEdit(host, m => { m.loops.push(MG.cw(loopHost)); }, { snapshot: false, changed: false });
    made = l3dwFaceFrom(F.pl, off, "Yta");
  } else if (d > 0) made = l3dwFaceFrom(F.pl, off, "Yta");
  else { // utåt: en ny yta med den ursprungliga konturen som hål
    made = l3dwFaceFrom(F.pl, off, "Yta"); const pl = F.pl, anchor = MG.to3(pl, off[0]), o2 = MG.to2(pl, anchor);
    modEdit(made, m => { m.loops.push(MG.cw(F.loops[0].map(q => [MG.r3(q[0] - o2[0]), MG.r3(q[1] - o2[1])]))); }, { snapshot: false, changed: false });
  }
  l3SelectIds([made.id]); l3Changed(); l3Status(`Offset ${d > 0 ? "inåt" : "utåt"} ${l3dwFmt(Math.abs(d))} – ny yta. Ctrl+Z ångrar.`);
}

/* ---- Frihand ---- */
function l3dwFreeInit() {
  if (l3dw.freeInit) return; l3dw.freeInit = true;
  const dom = () => l3.renderer.domElement;
  const ptAt = e => { const r = l3dwPick(e, { tol: 0.2 }); return r ? r.p : null; };
  window.addEventListener("pointerdown", e => {
    if (!l3dwOn() || l3dwMode() !== "free" || l3.tool !== "draw" || e.button !== 0 || e.target !== dom()) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const r = l3dwPlaneFirst(e); if (!r) return; l3dw.free = { pts: [r.p] }; l3dw.pts = [r.p]; l3.orbit.enabled = false;
  }, true);
  window.addEventListener("pointermove", e => {
    const f = l3dw.free; if (!f) return; const p = ptAt(e); if (!p) return;
    if (MG.dist(f.pts[f.pts.length - 1], p) > 0.03) { f.pts.push(p); l3dwTmp(); l3dwLoop(f.pts, "#dc2626", false); l3dwLabel(p, l3dwFmt(f.pts.reduce((s, q, i) => s + (i ? MG.dist(f.pts[i - 1], q) : 0), 0))); l3Render(); }
  }, true);
  window.addEventListener("pointerup", e => {
    const f = l3dw.free; if (!f) return; l3dw.free = null; l3.orbit.enabled = true; l3dw.pts = [];
    l3dwTmp(); if (l3t.measEl) l3t.measEl.style.display = "none"; l3.measLabel = null;
    // förenkla (Douglas–Peucker, 2 cm) och skapa kurvan
    const simp = (P, tol) => { if (P.length < 3) return P; let dmax = 0, ix = 0; const a = P[0], b = P[P.length - 1], ab = MG.sub(b, a), L = MG.len(ab) || 1e-9; for (let i = 1; i < P.length - 1; i++) { const d = MG.len(MG.cross(MG.sub(P[i], a), ab)) / L; if (d > dmax) { dmax = d; ix = i; } } if (dmax <= tol) return [a, b]; return [...simp(P.slice(0, ix + 1), tol).slice(0, -1), ...simp(P.slice(ix), tol)]; };
    const P = simp(f.pts, 0.02); if (P.length < 2) { l3dwReset(true); return; }
    placeSnapshot(); const anchor = P[0], made = modCreate({ k: "curve", pts: P.map(q => MG.round3(MG.sub(q, anchor))), closed: false }, anchor, { name: "Frihand", snapshot: false });
    if (l3dw.pl && MG.near(P[0], P[P.length - 1], 0.05) && P.length >= 4) { l3dwFaceFrom(l3dw.pl, P.slice(0, -1).map(q => MG.to2(l3dw.pl, q)), "Yta"); }
    if (l3dwPref("plane") === "auto") l3dw.pl = null;
    l3SelectIds([made.id]); l3Changed(); l3Status(`Frihand: ${P.length} punkter efter förenkling. Ctrl+Z ångrar.`);
  }, true);
}

/* ---- Verktygsfältet (visas när Rita eller Modellera är valt) ---- */
function l3dwBarHtml() {
  const t = l3.tool, m = l3dwMode(), esc = escHtml;
  const segs = (L3DW_MODES[t] || []).filter(x => L3DW_IMPL.has(x[0])).map(([k, l, key]) => `<button type="button" data-dwm="${k}" class="${m === k ? "on" : ""}" title="${esc(l)} (${key})">${esc(l)}</button>`).join("");
  const planes = t === "draw" ? `<div class="v3-segs v3-dwplanes" title="Arbetsplan – var man ritar">${L3DW_PLANES.map(([k, l, tt]) => `<button type="button" data-dwp="${k}" class="${l3dwPref("plane") === k ? "on" : ""}" title="${esc(tt)}">${esc(l)}</button>`).join("")}</div>` : "";
  const unit = `<button type="button" class="v3-dwunit" data-dwunit title="Enhet för siffror utan enhet (skriv mm, cm eller m efter siffran för att välja själv)">${l3dwPref("unit")}</button>`;
  const sides = m === "polygon" ? `<label class="v3-dwsides" title="Antal sidor"><input type="number" min="3" max="64" value="${l3dwPref("sides")}" data-dwsides /> sidor</label>` : "";
  const exp = `<button type="button" data-dwexp title="Exportera alla ritade objekt som DXF">DXF</button>`;
  return `<div class="v3-segs v3-dwmodes">${segs}</div>${planes}${sides}${unit}${exp}`;
}
function l3dwBarBind(bar) {
  if (!l3dwOn()) return;
  bar.querySelectorAll("[data-dwm]").forEach(b => { b.onclick = () => l3dwSetMode(b.dataset.dwm); });
  bar.querySelectorAll("[data-dwp]").forEach(b => { b.onclick = () => { const k = b.dataset.dwp; l3dwSet("plane", k); l3dw.pl = null; l3dw.pts = []; l3dwTmp(); l3RenderSnapBar(); l3dwHint(); l3Status(k === "face" ? "Tryck på den yta du vill rita i." : k === "height" ? "Tryck på en punkt – ritningen låses vågrätt på dess höjd." : `Arbetsplan: ${L3DW_PLANES.find(x => x[0] === k)[1]}.`); }; });
  const u = bar.querySelector("[data-dwunit]"); if (u) u.onclick = () => { l3dwSet("unit", l3dwPref("unit") === "mm" ? "m" : "mm"); l3RenderSnapBar(); };
  const s = bar.querySelector("[data-dwsides]"); if (s) { s.onchange = () => { l3dwSet("sides", Math.max(3, Math.min(64, Number(s.value) || 6))); l3dwHint(); }; s.onkeydown = ev => ev.stopPropagation(); }
  const x = bar.querySelector("[data-dwexp]"); if (x) x.onclick = () => modExportDxf(null);
  if (l3dwMode() === "free") l3dwFreeInit();
}
