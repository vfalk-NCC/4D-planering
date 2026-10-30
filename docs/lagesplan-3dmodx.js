/* Modellera – fler verktyg (Victor 2026-10-30: "kör resten av ritverktygen").

   Radera (E): tryck på ett ritat objekt (eller etableringsobjekt) så tas det bort. IFC-objekt i byggnaden rörs aldrig.
   Måla (B): tryck på ett objekt med vald färg. Skala (S): tryck på ett ritat objekt, dra eller skriv faktorn (1,5 eller 150 = 150 %).
   Spegla (X): välj axel, tryck på objektet, tryck var spegelplanet ska ligga (Behåll original = kopia). Följ banan (O): tryck på en yta
   (profilen) och sedan på en linje eller en ytas kant (banan) – profilen dras längs banan till ett nät. Skär ytor (I): tryck på två
   ritade objekt – skärningslinjerna blir linjeobjekt. Slå ihop / Dela upp: flera ritade objekt blir ett nät (kan delas upp igen); en kropp
   delas upp i sina ytor. Kontrollera: söker ogiltig geometri (korsande konturer, dubbletter, öppna nät) och kan reparera det enkla.
   Upprepa: nästa Push/Pull, Offset eller Skala använder senaste måttet direkt. Allt är ett steg i Ångra. */

const L3DX_MODES = new Set(["erase", "paint", "scale", "mirror", "follow", "intersect"]);
const l3dx = { last: {}, rep: false };
const l3dxPref = (k, d) => l3dwPref(k, d);
const l3dxNum = s => { const v = Number(String(s || "").replace(",", ".")); return Number.isFinite(v) ? v : null; };

/* ---- Hjälpare ---- */
function l3dxObjAt(e) {
  const hits = l3Ray(e, l3Surfaces());
  for (const h of hits) { if (h.object === l3.planMesh) continue; const id = l3PlaceIdOf(h.object); if (!id) continue; const p = placements.find(x => x.id === id); if (p) return { p, hit: h }; }
  return null;
}
function l3dxOutline(p, col) {
  const g = l3.placeMeshes.get(p.id); if (!g) return; const b = new THREE.Box3().setFromObject(g); if (b.isEmpty()) return;
  const c = [[b.min.x, b.min.y, b.min.z], [b.max.x, b.min.y, b.min.z], [b.max.x, b.max.y, b.min.z], [b.min.x, b.max.y, b.min.z], [b.min.x, b.min.y, b.max.z], [b.max.x, b.min.y, b.max.z], [b.max.x, b.max.y, b.max.z], [b.min.x, b.max.y, b.max.z]].map(a => new THREE.Vector3(...a));
  [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([i, j]) => l3TmpLine(c[i], c[j], col, false));
}
function l3dxRemove(ids) {
  const set = new Set(ids); placements = placements.filter(p => !set.has(p.id));
  if (typeof l3MkRefresh === "function") l3MkRefresh({});
  set.forEach(id => { placeDeleted.add(id); placeDirty.delete(id); const g = l3.placeMeshes.get(id); if (g) { if (l3.gizmo.object === g) l3.gizmo.detach(); l3.groups.places.remove(g); } l3.placeMeshes.delete(id); });
  placeScheduleSave();
}
const l3dxClone = o => JSON.parse(JSON.stringify(o));
/* Lokala kanter (för förhandsvisning): [[a,b], …] */
function l3dxEdges(m) {
  const out = [];
  if (m.k === "curve") { const P = m.pts || []; for (let i = 1; i < P.length; i++) out.push([P[i - 1], P[i]]); if (m.closed && P.length > 2) out.push([P[P.length - 1], P[0]]); }
  else if (m.k === "mesh") return modMeshEdges(m);
  else { const n = MG.normal(m.pl), off = m.k === "solid" ? MG.mul(n, m.d) : null; m.loops.forEach(L => L.forEach((q, i) => { const a = MG.to3(m.pl, q), b = MG.to3(m.pl, L[(i + 1) % L.length]); out.push([a, b]); if (off) { out.push([MG.add(a, off), MG.add(b, off)], [a, MG.add(a, off)]); } })); }
  return out;
}
function l3dxPreview(p, tl, col) {
  l3dxEdges(p.m).forEach(([a, b]) => l3dwLine(l3dwFromLocal(p, tl(a)), l3dwFromLocal(p, tl(b)), col));
}
/* Skala / spegla modellen på plats. */
function l3dxScaleM(m, f) {
  const sc = v => MG.round3(MG.mul(v, f));
  if (m.k === "curve") { m.pts = m.pts.map(sc); if (m.w) m.w = MG.r3(m.w * f); }
  else if (m.k === "mesh") m.pts = m.pts.map(sc);
  else { m.pl = { o: sc(m.pl.o), u: m.pl.u, v: m.pl.v }; m.loops = m.loops.map(L => L.map(q => [MG.r3(q[0] * f), MG.r3(q[1] * f)])); if (m.k === "solid") m.d = MG.r3(m.d * f); }
}
function l3dxMirrorM(m, lin) {
  const rd = v => MG.round3(lin(v));
  if (m.k === "curve") m.pts = m.pts.map(rd);
  else if (m.k === "mesh") { m.pts = m.pts.map(rd); m.faces = m.faces.map(f => [f[0], f[2], f[1]]); }
  else { m.pl = { o: rd(m.pl.o), u: MG.norm(lin(m.pl.u)), v: MG.norm(lin(m.pl.v)) }; if (m.k === "solid") m.d = -m.d; }
}
const l3dxModOnly = p => p && p.m;

/* ---- Hover / tryck / Enter (anropas från lagesplan-3dmodel.js) ---- */
function l3dxHover(e, m) {
  const op = l3dw.op;
  if (m === "erase" || m === "paint") { const o = l3dxObjAt(e); l3dw.hov = o; if (o) { l3dxOutline(o.p, m === "erase" ? "#dc2626" : l3dxPref("paint", "#ef4444")); l3ShowMarker({ point: o.hit.point, kind: "face" }); } else l3ShowMarker(null); return true; }
  if (m === "scale") {
    if (!op) { const o = l3dxObjAt(e); l3dw.hov = o; if (o && l3dxModOnly(o.p)) l3dxOutline(o.p, "#2563eb"); else if (o) l3dxOutline(o.p, "#94a3b8"); return true; }
    const f = l3dxScaleFactor(e, op); op.f = f; l3dxPreview(op.p, v => MG.mul(v, f), "#2563eb"); l3dwLabel(op.a, `× ${String(Math.round(f * 1000) / 1000).replace(".", ",")}`); l3dwVcb("Faktor"); return true;
  }
  if (m === "mirror") {
    if (!op) { const o = l3dxObjAt(e); l3dw.hov = o; if (o && l3dxModOnly(o.p)) l3dxOutline(o.p, "#2563eb"); return true; }
    const S = l3Snap(e), ax = l3dxPref("mirAxis", "x"), i = { x: 0, y: 1, z: 2 }[ax]; let c = op.a[i];
    if (S) c = l3dwA(S.point)[i]; c = Math.round(c * 100) / 100; op.c = c;
    l3dxPreview(op.p, l3dxMirTl(op.p, ax, c).tl, "#dc2626");
    const half = 6, mk = k => { const q = [op.a[0], op.a[1], op.a[2]]; q[i] = c; return q; };
    const base = mk(), u = ax === "x" ? [0, 1, 0] : [1, 0, 0], v = ax === "z" ? [0, 1, 0] : [0, 0, 1], pt = (s, t) => MG.add(MG.add(base, MG.mul(u, s)), MG.mul(v, t));
    l3dwLoop([pt(-half, -half), pt(half, -half), pt(half, half), pt(-half, half)], "#dc2626", true); l3dwLabel(base, `${ax.toUpperCase()} = ${l3Fmt(c, 2)} m`); return true;
  }
  if (m === "follow") {
    if (!op) { const F = l3dwFaceAt(e); l3dw.hov = F; if (F) { l3dwHighlight(F, "#2563eb"); l3ShowMarker({ point: l3dwS(F.pt), kind: "face" }); } else l3ShowMarker(null); return true; }
    const o = l3dxObjAt(e); op.path = o && o.p.m && (o.p.m.k === "curve" || o.p.m.k === "face") && o.p !== op.F.p ? o.p : null; l3dwHighlight(op.F, "#2563eb"); if (op.path) l3dxOutline(op.path, "#16a34a"); return true;
  }
  if (m === "intersect") { const o = l3dxObjAt(e); l3dw.hov = o; if (op && op.a) l3dxOutline(op.a, "#2563eb"); if (o && l3dxModOnly(o.p) && o.p.m.k !== "curve") l3dxOutline(o.p, "#f59e0b"); return true; }
  return true;
}
function l3dxScaleFactor(e, op) {
  const typed = l3dxNum(l3dw.vcb);
  if (typed != null && typed > 0) return typed >= 10 ? typed / 100 : typed;
  const O = l3.O, ray = l3MouseRay(e), g = MG.rayPlane([ray.origin.x + O[0], ray.origin.y + O[1], ray.origin.z + O[2]], [ray.direction.x, ray.direction.y, ray.direction.z], { o: op.a, u: [1, 0, 0], v: [0, 1, 0] });
  if (!g) return op.f || 1; const r = Math.hypot(g.p[0] - op.a[0], g.p[1] - op.a[1]); return Math.max(0.01, Math.round(r / op.r0 * 100) / 100);
}
function l3dxMirTl(p, ax, c) { // lokal avbildning av spegling över planet ax = c (världen)
  const rot = (Number(p.rot) || 0) * Math.PI / 180, cr = Math.cos(rot), sr = Math.sin(rot), i = { x: 0, y: 1, z: 2 }[ax];
  const R = v => [v[0] * cr - v[1] * sr, v[0] * sr + v[1] * cr, v[2]], Ri = v => [v[0] * cr + v[1] * sr, -v[0] * sr + v[1] * cr, v[2]];
  const lin = v => { const w = R(v); w[i] = -w[i]; return Ri(w); };
  return { tl: lin, lin };
}
function l3dxTap(e, m) {
  const op = l3dw.op;
  if (m === "erase") {
    const o = l3dxObjAt(e); if (!o) { l3Status("Tryck på ett objekt att radera.", true); return true; }
    if (o.p.locked) { l3Status("Objektet är låst.", true); return true; }
    placeSnapshot(); l3dxRemove([o.p.id]); l3SelectIds([]); l3Changed(); l3Toast(`"${o.p.name}" raderat.`, "Ångra", l3Undo); l3dwTmp(); return true;
  }
  if (m === "paint") {
    const o = l3dxObjAt(e); if (!o) { l3Status("Tryck på ett objekt att måla.", true); return true; }
    if (o.p.locked) { l3Status("Objektet är låst.", true); return true; }
    placeSnapshot(); o.p.color = l3dxPref("paint", "#ef4444"); placeTouch(o.p); l3RebuildOne(o.p); l3Changed(); l3Status(`"${o.p.name}" målat.`); return true;
  }
  if (m === "scale") {
    if (!op) {
      const o = l3dxObjAt(e); if (!o) { l3Status("Tryck på ett objekt att skala.", true); return true; }
      if (!l3dxModOnly(o.p) && !(typeof l3rpSimple === "function" && l3rpSimple(placeLib(o.p.type)))) { l3Status("Skala gäller ritade objekt och enkla etableringslådor.", true); return true; }
      const a = [o.p.x, o.p.y, (Number(o.p.z) || 0) + (Number(o.p.dz) || 0)], pt = l3dwA(o.hit.point), r0 = Math.hypot(pt[0] - a[0], pt[1] - a[1]);
      l3dw.op = { type: "xscale", p: o.p, a, r0: r0 < 0.05 ? 1 : r0, f: 1 };
      if (l3dx.rep && l3dx.last.scale) return l3dxScaleCommit(l3dx.last.scale);
      l3dwHint("Dra för faktorn och tryck – eller skriv den (1,5 eller 150 för 150 %) och Enter."); l3dwHover(e); return true;
    }
    return l3dxScaleCommit(op.f);
  }
  if (m === "mirror") {
    if (!op) { const o = l3dxObjAt(e); if (!o || !l3dxModOnly(o.p)) { l3Status("Tryck på ett ritat objekt att spegla.", true); return true; } l3dw.op = { type: "xmirror", p: o.p, a: [o.p.x, o.p.y, (Number(o.p.z) || 0) + (Number(o.p.dz) || 0)], c: 0 }; l3dwHint("Flytta spegelplanet (fäster mot punkter) och tryck."); l3dwHover(e); return true; }
    return l3dxMirrorCommit(); }
  if (m === "follow") {
    if (!op) { const F = l3dwFaceAt(e); if (!F) { l3Status("Tryck på profilen (en yta).", true); return true; } l3dw.op = { type: "xfollow", F, path: null }; l3dwHint("Tryck nu på banan: en linje eller en ytas kant."); l3dwHover(e); return true; }
    if (!op.path) { l3Status("Tryck på en linje eller en yta som ska vara banan.", true); return true; }
    return l3dxFollowCommit(op); }
  if (m === "intersect") {
    const o = l3dxObjAt(e); if (!o || !l3dxModOnly(o.p) || o.p.m.k === "curve" || o.p.m.k === "mesh") { l3Status("Tryck på ritade ytor eller kroppar.", true); return true; }
    if (!op) { l3dw.op = { type: "xint", a: o.p }; l3dwHint("Tryck på det andra objektet."); l3dwHover(e); return true; }
    if (o.p === op.a) return true; return l3dxIntersectCommit(op.a, o.p); }
  return true;
}
function l3dxEnter() {
  const op = l3dw.op; if (!op) return;
  if (op.type === "xscale") { const f = l3dxNum(l3dw.vcb); if (f && f > 0) l3dxScaleCommit(f >= 10 ? f / 100 : f); else l3dw.vcb = ""; }
  else if (op.type === "xmirror") l3dxMirrorCommit();
}
function l3dxDone() { l3dwTmp(); l3dw.op = null; l3dw.vcb = ""; l3ShowVcb(null); l3.measLabel = null; if (l3t.measEl) l3t.measEl.style.display = "none"; l3dwHint(); }

/* ---- Skala ---- */
function l3dxScaleCommit(f) {
  const op = l3dw.op; if (!op) return true; const p = op.p; l3dxDone();
  if (!(f > 0) || Math.abs(f - 1) < 1e-4) { l3Status("Faktorn blev 1 – inget ändrades."); return true; }
  if (p.m) modEdit(p, m => l3dxScaleM(m, f)); else { placeSnapshot(); ["L", "B", "H"].forEach(k => { p[k] = placeR3((Number(p[k]) || 0) * f); }); placeTouch(p); l3RebuildOne(p); l3Changed(); }
  l3dx.last.scale = f; l3SelectIds([p.id]); l3Status(`Skalat × ${String(Math.round(f * 1000) / 1000).replace(".", ",")} kring objektets ankarpunkt. Ctrl+Z ångrar.`); return true;
}
/* ---- Spegla ---- */
function l3dxMirrorCommit() {
  const op = l3dw.op; if (!op) return true; const p = op.p, ax = l3dxPref("mirAxis", "x"), i = { x: 0, y: 1, z: 2 }[ax], c = op.c, keep = l3dxPref("mirKeep", true); l3dxDone();
  const { lin } = l3dxMirTl(p, ax, c), A = [p.x, p.y, Number(p.z) || 0], An = A.slice(); const az = i === 2 ? (A[2] + (Number(p.dz) || 0)) : null;
  if (i < 2) An[i] = MG.r3(2 * c - A[i]); else An[2] = MG.r3(2 * c - (A[2] + (Number(p.dz) || 0)) - (Number(p.dz) || 0)); void az;
  placeSnapshot();
  let target = p;
  if (keep) { const m2 = l3dxClone(p.m); target = modCreate(m2, An, { name: p.name + " (spegel)", color: p.color, snapshot: false }); target.rot = p.rot; target.dz = p.dz; target.z = An[2]; }
  else { p.x = An[0]; p.y = An[1]; p.z = An[2]; }
  modEdit(target, m => l3dxMirrorM(m, lin), { snapshot: false, changed: false }); placeTouch(target); l3RebuildOne(target); l3SelectIds([target.id]); l3Changed();
  l3Status(`Speglad över ${ax.toUpperCase()} = ${l3Fmt(c, 2)} m${keep ? " – ny kopia" : ""}. Ctrl+Z ångrar.`); return true;
}
/* ---- Följ banan ---- */
function l3dxPathPts(p) {
  const m = p.m; if (m.k === "curve") return { pts: m.pts.map(q => l3dwFromLocal(p, q)), closed: !!m.closed };
  const pl = l3dwPlaneFromLocal(p, m.pl); return { pts: m.loops[0].map(q => MG.to3(pl, q)), closed: true };
}
function l3dxSweep(prof, path, closed) {
  const cen = prof.reduce((s, q) => MG.add(s, q), [0, 0, 0]).map(v => v / prof.length);
  // start vid banans närmaste ände (öppen) eller närmaste hörn (sluten)
  let P = path.map(q => q.slice()); let bi = 0, bd = Infinity; P.forEach((q, i) => { if (closed || i === 0 || i === P.length - 1) { const d = MG.dist(q, cen); if (d < bd) { bd = d; bi = i; } } });
  if (closed) P = P.slice(bi).concat(P.slice(0, bi)); else if (bi > 0) P = P.slice().reverse();
  const N = P.length, dirs = []; for (let i = 0; i < (closed ? N : N - 1); i++) dirs.push(MG.norm(MG.sub(P[(i + 1) % N], P[i])));
  const tan = i => closed ? MG.norm(MG.add(dirs[(i - 1 + N) % N], dirs[i])) : i === 0 ? dirs[0] : i === N - 1 ? dirs[N - 2] : MG.norm(MG.add(dirs[i - 1], dirs[i]));
  const t0 = dirs[0], off = prof.map(q => MG.sub(q, P[0])), n0 = MG.norm(MG.cross(MG.sub(prof[1], prof[0]), MG.sub(prof[2] || prof[1], prof[0])));
  const rings = [];
  for (let i = 0; i < N; i++) {
    const ti = tan(i), d = i === 0 && !closed ? dirs[0] : dirs[(i - 1 + dirs.length) % dirs.length], qt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...t0), new THREE.Vector3(...d));
    rings.push(off.map(o => { const w = new THREE.Vector3(...o).applyQuaternion(qt), q = MG.add(P[i], [w.x, w.y, w.z]), den = MG.dot(d, ti); return Math.abs(den) > 0.2 ? MG.sub(q, MG.mul(d, MG.dot(MG.sub(q, P[i]), ti) / den)) : q; }));
  }
  const n = prof.length, pts = [], faces = [], id = (i, j) => i * n + (j % n) + 1; rings.forEach(r => r.forEach(q => pts.push(q)));
  const sg = (() => { let s = 0; for (let j = 0; j < n; j++) s += MG.dot(MG.cross(MG.sub(prof[j], cen), MG.sub(prof[(j + 1) % n], cen)), t0); return s; })() > 0;
  const segs = closed ? N : N - 1;
  for (let i = 0; i < segs; i++) { const i2 = (i + 1) % N; for (let j = 0; j < n; j++) { const a = id(i, j), b = id(i, j + 1), c = id(i2, j + 1), d2 = id(i2, j); if (sg) faces.push([a, b, c], [a, c, d2]); else faces.push([a, c, b], [a, d2, c]); } }
  if (!closed) { // lock
    const pl = MG.planeFrom(n0, prof[0]), outer = prof.map(q => new THREE.Vector2(...MG.to2(pl, q)));
    THREE.ShapeUtils.triangulateShape(outer, []).forEach(f => { const a = id(0, f[0]), b = id(0, f[1]), c = id(0, f[2]), z = id(N - 1, f[0]), y = id(N - 1, f[1]), x = id(N - 1, f[2]);
      const nm = MG.cross(MG.sub(pts[b - 1], pts[a - 1]), MG.sub(pts[c - 1], pts[a - 1])); if (MG.dot(nm, t0) > 0) faces.push([a, c, b]); else faces.push([a, b, c]);
      const nm2 = MG.cross(MG.sub(pts[y - 1], pts[z - 1]), MG.sub(pts[x - 1], pts[z - 1])); if (MG.dot(nm2, tan(N - 1)) > 0) faces.push([z, y, x]); else faces.push([z, x, y]); });
  }
  if (modMeshStats(pts, faces).volume < 0 && closed) faces.forEach(f => { const t = f[1]; f[1] = f[2]; f[2] = t; });
  return { pts, faces };
}
function l3dxFollowCommit(op) {
  const F = op.F, path = op.path; l3dxDone();
  try {
    const prof = F.loops[0].map(q => MG.to3(F.pl, q)), pp = l3dxPathPts(path); if (pp.pts.length < 2) { l3Status("Banan är för kort.", true); return true; }
    const S = l3dxSweep(prof, pp.pts, pp.closed), anchor = S.pts[0], pts = S.pts.map(q => MG.round3(MG.sub(q, anchor)));
    placeSnapshot(); const made = modCreate({ k: "mesh", pts, faces: S.faces, closed: true }, anchor, { name: "Följ banan", snapshot: false, color: F.kind === "mod" ? F.p.color : undefined });
    l3SelectIds([made.id]); l3Changed(); l3Status(`Profilen dragen längs banan – nät med ${S.faces.length} trianglar. Ctrl+Z ångrar.`);
  } catch (err) { console.warn("Följ banan", err); l3Status("Kunde inte dra profilen längs banan.", true); }
  return true;
}
/* ---- Skär ytor ---- */
function l3dxPolys(p) {
  return modFaces(p).map(f => { const pl = l3dwPlaneFromLocal(p, f.kind === "wall" ? f.pl : f.pl); return { pl, loops: f.loops }; });
}
function l3dxClipLine(P, p0, dir) { // intervall [t0,t1] där linjen p0 + t·dir ligger inne i polygonen
  const pl = P.pl, q0 = MG.to2(pl, p0), d2 = [MG.dot(dir, pl.u), MG.dot(dir, pl.v)], ts = [];
  P.loops.forEach(L => L.forEach((a, i) => { const b = L[(i + 1) % L.length], ex = b[0] - a[0], ey = b[1] - a[1], den = d2[0] * ey - d2[1] * ex; if (Math.abs(den) < 1e-12) return;
    const t = ((a[0] - q0[0]) * ey - (a[1] - q0[1]) * ex) / den, s = ((a[0] - q0[0]) * d2[1] - (a[1] - q0[1]) * d2[0]) / den; if (s >= -1e-9 && s <= 1 + 1e-9) ts.push(t); }));
  ts.sort((x, y) => x - y); const out = [];
  for (let i = 0; i + 1 < ts.length; i++) { if (ts[i + 1] - ts[i] < 1e-6) continue; const tm = (ts[i] + ts[i + 1]) / 2, q = [q0[0] + d2[0] * tm, q0[1] + d2[1] * tm]; if (MG.pip(P.loops[0], q) && !P.loops.slice(1).some(L => MG.pip(L, q))) out.push([ts[i], ts[i + 1]]); }
  return out;
}
function l3dxIntersect(A, B) {
  const PA = l3dxPolys(A), PB = l3dxPolys(B), segs = [];
  PA.forEach(fa => PB.forEach(fb => {
    const n1 = MG.normal(fa.pl), n2 = MG.normal(fb.pl), dir = MG.cross(n1, n2), L2 = MG.dot(dir, dir); if (L2 < 1e-10) return;
    const d1 = MG.dot(n1, fa.pl.o), d2 = MG.dot(n2, fb.pl.o), p0 = MG.mul(MG.add(MG.mul(MG.cross(n2, dir), d1), MG.mul(MG.cross(dir, n1), d2)), 1 / L2), u = MG.norm(dir);
    const IA = l3dxClipLine(fa, p0, u), IB = l3dxClipLine(fb, p0, u);
    IA.forEach(a => IB.forEach(b => { const t0 = Math.max(a[0], b[0]), t1 = Math.min(a[1], b[1]); if (t1 - t0 > 1e-3) segs.push([MG.add(p0, MG.mul(u, t0)), MG.add(p0, MG.mul(u, t1))]); }));
  }));
  return segs;
}
function l3dxIntersectCommit(a, b) {
  l3dxDone(); const segs = l3dxIntersect(a, b);
  if (!segs.length) { l3Status("Objekten skär inte varandra.", true); return true; }
  const use = segs.slice(0, 300); placeSnapshot(); const ids = [];
  use.forEach(s => { const c = modCreate({ k: "curve", pts: [[0, 0, 0], MG.round3(MG.sub(s[1], s[0]))], closed: false }, s[0].map(MG.r3), { name: "Skärning", color: "#dc2626", snapshot: false }); ids.push(c.id); });
  l3SelectIds(ids); l3Changed(); l3Status(`${use.length} skärningslinjer skapade${segs.length > use.length ? ` (av ${segs.length})` : ""}. Ctrl+Z ångrar.`); return true;
}

/* ---- Slå ihop / dela upp ---- */
function l3dxJoin() {
  const list = l3SelList().filter(p => p.m && p.m.k !== "curve"); if (list.length < 2) { l3Status("Markera minst två ritade ytor eller kroppar att slå ihop.", true); return; }
  const first = list[0], A0 = [first.x, first.y, (Number(first.z) || 0) + (Number(first.dz) || 0)], pts = [], faces = [], parts = [];
  list.forEach(p => { const c = modLocalMesh(p); if (!c || !c.pts.length) return; const base = pts.length; c.pts.forEach(q => pts.push(MG.round3(MG.sub(l3dwFromLocal(p, q), A0)))); c.faces.forEach(f => faces.push([f[0] + base, f[1] + base, f[2] + base]));
    parts.push({ name: p.name, type: p.type, color: p.color, x: p.x, y: p.y, z: p.z, dz: p.dz, rot: p.rot, m: l3dxClone(p.m) }); });
  placeSnapshot(); l3dxRemove(list.map(p => p.id));
  const made = modCreate({ k: "mesh", pts, faces, closed: true, parts }, [A0[0], A0[1], A0[2]], { name: "Sammanslagen", color: first.color, snapshot: false });
  l3SelectIds([made.id]); l3Changed(); l3Status(`${list.length} objekt sammanslagna till ett nät (Dela upp återställer dem).`);
}
function l3dxExplode() {
  const list = l3SelList().filter(p => p.m && p.m.k !== "curve" && p.m.k !== "face"); if (!list.length) { l3Status("Markera en kropp eller ett sammanslaget nät att dela upp.", true); return; }
  placeSnapshot(); const ids = [];
  list.forEach(p => {
    if (p.m.k === "mesh") {
      if (!p.m.parts || !p.m.parts.length) { l3Status("Nätet har inga delar att återställa.", true); return; }
      p.m.parts.forEach(q => { const c = modCreate(l3dxClone(q.m), [q.x, q.y, q.z], { name: q.name, color: q.color, snapshot: false }); c.rot = q.rot || 0; c.dz = q.dz || 0; ids.push(c.id); });
    } else {
      modFaces(p).forEach(f => {
        const pl = l3dwPlaneFromLocal(p, f.pl), loops = f.loops, o2 = loops[0][0], anchor = MG.to3(pl, o2), lp = loops.map(L => L.map(q => [MG.r3(q[0] - o2[0]), MG.r3(q[1] - o2[1])]));
        const c = modCreate({ k: "face", pl: { o: MG.round3(MG.sub(pl.o, anchor)), u: pl.u, v: pl.v }, loops: lp }, anchor, { name: "Yta", color: p.color, snapshot: false }); ids.push(c.id);
      });
    }
    l3dxRemove([p.id]);
  });
  if (!ids.length) return; l3SelectIds(ids); l3Changed(); l3Status(`Uppdelat i ${ids.length} delar. Ctrl+Z ångrar.`);
}

/* ---- Kontrollera geometri ---- */
function l3dxSegX(a, b, c, d) { const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b); return d1 * d2 < -1e-12 && d3 * d4 < -1e-12; }
function l3dxLoopIssues(L) {
  const out = []; if (L.length < 3) return ["konturen har färre än tre punkter"];
  let dup = 0; for (let i = 0; i < L.length; i++) if (MG.dist2 ? false : Math.hypot(L[i][0] - L[(i + 1) % L.length][0], L[i][1] - L[(i + 1) % L.length][1]) < 1e-4) dup++;
  if (dup) out.push(`${dup} dubbla punkter`);
  if (Math.abs(MG.area2(L)) < 1e-6) out.push("ytan är noll (alla punkter på en linje)");
  if (L.length < 300) { let x = false; for (let i = 0; i < L.length && !x; i++) for (let j = i + 2; j < L.length && !x; j++) { if (i === 0 && j === L.length - 1) continue; if (l3dxSegX(L[i], L[(i + 1) % L.length], L[j], L[(j + 1) % L.length])) x = true; } if (x) out.push("konturen korsar sig själv"); }
  return out;
}
function l3dxValidate(fix) {
  const res = []; let fixed = 0;
  placements.filter(p => p.m).forEach(p => {
    const m = p.m, msgs = [];
    if (m.k === "curve") { const P = m.pts || []; if (P.length < 2) msgs.push("linjen har färre än två punkter"); else { let z = 0; for (let i = 1; i < P.length; i++) if (MG.dist(P[i - 1], P[i]) < 1e-4) z++; if (z) { msgs.push(`${z} dubbla punkter`); if (fix) { modEdit(p, mm => { mm.pts = mm.pts.filter((q, i) => i === 0 || MG.dist(mm.pts[i - 1], q) >= 1e-4); }, { snapshot: false, changed: false }); fixed++; } } } }
    else if (m.k === "mesh") {
      const E = new Map(); (m.faces || []).forEach(f => { for (let i = 0; i < 3; i++) { const a = f[i], b = f[(i + 1) % 3], k = a < b ? a + "_" + b : b + "_" + a; E.set(k, (E.get(k) || 0) + 1); } });
      let open = 0, nm = 0; E.forEach(n => { if (n === 1) open++; else if (n > 2) nm++; }); if (open) msgs.push(`nätet är öppet (${open} fria kanter)`); if (nm) msgs.push(`${nm} kanter delas av fler än två trianglar`);
      const degen = (m.faces || []).filter(f => MG.len(MG.cross(MG.sub(m.pts[f[1] - 1], m.pts[f[0] - 1]), MG.sub(m.pts[f[2] - 1], m.pts[f[0] - 1]))) < 1e-9).length;
      if (degen) { msgs.push(`${degen} degenererade trianglar`); if (fix) { modEdit(p, mm => { mm.faces = mm.faces.filter(f => MG.len(MG.cross(MG.sub(mm.pts[f[1] - 1], mm.pts[f[0] - 1]), MG.sub(mm.pts[f[2] - 1], mm.pts[f[0] - 1]))) >= 1e-9); }, { snapshot: false, changed: false }); fixed++; } }
      if (modMeshStats(m.pts || [], m.faces || []).volume < -1e-6 && !open) msgs.push("nätet är vänt in och ut");
    } else {
      m.loops.forEach((L, li) => l3dxLoopIssues(L).forEach(t => msgs.push((li ? `hål ${li}: ` : "") + t)));
      m.loops.slice(1).forEach((L, i) => { if (!MG.pip(m.loops[0], MG.centroid2(L))) msgs.push(`hål ${i + 1} ligger utanför ytan`); });
      if (m.k === "solid" && Math.abs(m.d) < 1e-3) msgs.push("kroppen har ingen höjd");
      if (fix && m.loops.some(L => L.some((q, i) => Math.hypot(q[0] - L[(i + 1) % L.length][0], q[1] - L[(i + 1) % L.length][1]) < 1e-4))) { modEdit(p, mm => { mm.loops = mm.loops.map(L => L.filter((q, i) => Math.hypot(q[0] - L[(i + 1) % L.length][0], q[1] - L[(i + 1) % L.length][1]) >= 1e-4)); }, { snapshot: false, changed: false }); fixed++; }
    }
    if (msgs.length) res.push({ p, msgs });
  });
  return { res, fixed };
}
function l3dxCheck() {
  const n = placements.filter(p => p.m).length; if (!n) { l3Status("Det finns inga ritade objekt att kontrollera."); return; }
  const r = l3dxValidate(false);
  if (!r.res.length) { l3Toast(`Geometrin är i ordning (${n} ritade objekt kontrollerade).`); return; }
  if (typeof l3anPanel === "function") {
    const esc = escHtml, rows = r.res.map(x => `<div class="v3-an-row"><button type="button" data-an-sel="${esc(x.p.id)}">${esc(x.p.name || "Objekt")}</button><span>${x.msgs.map(esc).join("; ")}</span></div>`).join("");
    l3anPanel("Kontrollera geometri", `<div class="v3-vp-t">${r.res.length} av ${n} ritade objekt har problem. Tryck på ett namn för att markera det.</div><div class="v3-an-list">${rows}</div><div class="v3-vp-b"><button type="button" class="primary" data-an-fix>Reparera det enkla</button><button type="button" data-an-all>Markera alla</button></div>`, el => {
      el.querySelectorAll("[data-an-sel]").forEach(b => { b.onclick = () => { l3SelectIds([b.dataset.anSel]); const p = placements.find(x => x.id === b.dataset.anSel); const g = p && l3.placeMeshes.get(p.id); if (g) { const bb = new THREE.Box3().setFromObject(g); l3FlyTo(bb.getCenter(new THREE.Vector3()), Math.max(4, bb.getSize(new THREE.Vector3()).length() * 2)); } }; });
      el.querySelector("[data-an-all]").onclick = () => l3SelectIds(r.res.map(x => x.p.id));
      el.querySelector("[data-an-fix]").onclick = () => { placeSnapshot(); const f = l3dxValidate(true); l3Changed(); l3Toast(f.fixed ? `${f.fixed} objekt reparerade (dubbla punkter och degenererade trianglar borttagna).` : "Inget av det som hittades går att reparera automatiskt."); l3dxCheck(); };
    });
  } else l3Status(`${r.res.length} objekt har problem: ${r.res.slice(0, 3).map(x => x.p.name + " – " + x.msgs[0]).join("; ")}`, true);
  l3SelectIds(r.res.map(x => x.p.id));
}

/* ---- Upprepa: senaste måttet för Push/Pull och Offset används direkt vid nästa tryck ---- */
(function () {
  if (typeof l3dwPPCommit === "function") { const o = l3dwPPCommit; l3dwPPCommit = function (d) { if (Math.abs(d) >= 1e-3) l3dx.last.pushpull = d; return o(d); }; }
  if (typeof l3dwOffCommit === "function") { const o = l3dwOffCommit; l3dwOffCommit = function (d) { if (Math.abs(d) >= 1e-3) l3dx.last.offset = d; return o(d); }; }
  if (typeof l3dwPPTap === "function") { const o = l3dwPPTap; l3dwPPTap = function (e) { const had = !!l3dw.op, r = o(e); if (!had && l3dx.rep && l3dx.last.pushpull != null && l3dw.op) l3dwPPCommit(l3dx.last.pushpull); return r; }; }
  if (typeof l3dwOffTap === "function") { const o = l3dwOffTap; l3dwOffTap = function (e) { const had = !!l3dw.op, r = o(e); if (!had && l3dx.rep && l3dx.last.offset != null && l3dw.op) l3dwOffCommit(l3dx.last.offset); return r; }; }
})();

/* ---- Verktygsfältets extra knappar ---- */
function l3dxBarHtml() {
  if (l3.tool === "draw") return `<button type="button" data-dxact="undopt" title="Ta bort senaste punkten (Backspace)">↶ Ångra punkt</button><button type="button" data-dxact="restart" title="Börja om med det som ritas">⟲ Börja om</button>`;
  if (l3.tool !== "model") return ""; const m = l3dwMode(), esc = escHtml; let h = "";
  if (m === "paint") h += `<input type="color" data-dxcol value="${esc(l3dxPref("paint", "#ef4444"))}" title="Färg att måla med" class="v3-dxcol">${["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#64748b", "#ffffff"].map(c => `<button type="button" class="v3-dxsw" data-dxsw="${c}" style="background:${c}" title="${c}"></button>`).join("")}`;
  if (m === "mirror") h += `<div class="v3-segs" title="Spegelplanet ligger vinkelrätt mot axeln">${["x", "y", "z"].map(a => `<button type="button" data-dxax="${a}" class="${l3dxPref("mirAxis", "x") === a ? "on" : ""}">${a.toUpperCase()}</button>`).join("")}</div><label class="v3-dwsides" title="Behåll originalet och skapa en spegelkopia"><input type="checkbox" data-dxkeep ${l3dxPref("mirKeep", true) ? "checked" : ""}> Behåll original</label>`;
  h += `<button type="button" data-dxact="join" title="Slå ihop markerade ritade objekt till ett nät">Slå ihop</button><button type="button" data-dxact="explode" title="Dela upp en kropp i ytor, eller ett sammanslaget nät i sina delar">Dela upp</button><button type="button" data-dxact="check" title="Kontrollera ritad geometri: korsande konturer, dubbletter, öppna nät">Kontrollera</button><button type="button" data-dxact="rep" class="${l3dx.rep ? "on" : ""}" title="Upprepa: nästa Push/Pull, Offset eller Skala använder senaste måttet direkt (U)">Upprepa</button>`;
  return h;
}
function l3dxBarBind(bar) {
  const c = bar.querySelector("[data-dxcol]"); if (c) c.oninput = () => l3dwSet("paint", c.value);
  bar.querySelectorAll("[data-dxsw]").forEach(b => { b.onclick = () => { l3dwSet("paint", b.dataset.dxsw); if (c) c.value = b.dataset.dxsw; }; });
  bar.querySelectorAll("[data-dxax]").forEach(b => { b.onclick = () => { l3dwSet("mirAxis", b.dataset.dxax); l3RenderSnapBar(); }; });
  const k = bar.querySelector("[data-dxkeep]"); if (k) k.onchange = () => l3dwSet("mirKeep", k.checked);
  bar.querySelectorAll("[data-dxact]").forEach(b => { b.onclick = () => { const a = b.dataset.dxact; if (a === "join") l3dxJoin(); else if (a === "explode") l3dxExplode(); else if (a === "check") l3dxCheck(); else if (a === "undopt") { if (l3dw.pts.length > 1) { l3dw.pts.pop(); l3dwRefreshOp(); } else l3dwReset(true); l3dwHint(); } else if (a === "restart") { l3dwReset(true); l3Status("Börjar om."); } else if (a === "rep") { l3dx.rep = !l3dx.rep; l3RenderSnapBar(); l3Status(l3dx.rep ? `Upprepa är på – senaste måttet används direkt${l3dx.last.pushpull != null ? ` (Push/Pull ${l3dwFmt(l3dx.last.pushpull)})` : ""}.` : "Upprepa är av."); } }; });
}
window.addEventListener("keydown", e => { if (l3dwOn() && l3.tool === "model" && (e.key === "u" || e.key === "U") && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|SELECT|TEXTAREA/.test((e.target || {}).tagName || "") && !l3dw.op) { l3dx.rep = !l3dx.rep; l3RenderSnapBar(); l3Status(l3dx.rep ? "Upprepa är på." : "Upprepa är av."); e.preventDefault(); } }, true);
