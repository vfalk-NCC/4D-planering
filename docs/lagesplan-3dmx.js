/* Mått – inställningar, 3-axlig laser och profil (Victor 2026-11-21, efter videon med mätverktygen i ett annat program):
   1) "Mått som visas": för varje verktyg väljs vilka mått som skrivs ut, så att det inte alltid kommer alla (Smart mått, Avstånd, Punkt, Yta, Polylinje, Laser, Profil).
   2) 3-axlig laser: över ytan visas live avståndet till närmaste ytor i tre riktningar (ytans normal och de två axlarna i ytan); tryck lägger ut dem som vanliga mått.
   3) Profil: två punkter ger ett snitt genom ALLT som är tänt i modellen (IFC-modeller, etablering, terräng m.m.) som diagram i högermenyn, med mätning i diagrammet.
   Utseendet: gula linjer och gul text med mörk kant, grön streckad höjd, röda delmått, och en grå hjälptext överst – som i förebilden. */

const l3mx = { plain: false, prof: null, grp: null, hint: null, lastLaser: null };
const L3MX_DEF = {
  smart: { w: 1, h: 1, d: 1, vol: 1, up: 1, down: 1, left: 1, right: 1, out: 1 },
  dist: { xyz: 1, xy: 0, z: 0, ang: 0, comp: 0 },
  point: { x: 1, y: 1, z: 1 },
  area: { area: 1, perim: 0 },
  poly: { seg: 1 },
  laser: { n: 1, u: 1, v: 1, back: 0, max: 60 },
  prof: { grid: 1, coord: 1, slope: 1, snap: 1 },
};
function l3mxCfg() {
  const s = (typeof l3Prefs === "function" && l3Prefs().mxCfg) || {}, out = {};
  Object.keys(L3MX_DEF).forEach(g => { out[g] = { ...L3MX_DEF[g], ...(s[g] || {}) }; });
  return out;
}
function l3mxSet(g, k, v) { const s = { ...(l3Prefs().mxCfg || {}) }; s[g] = { ...(s[g] || {}), [k]: v }; l3SetPref("mxCfg", s); }

/* ---- Text efter valen ---- */
const l3mxF = (v, n) => l3Fmt(v, n);
function l3mxDistText(a, b) {
  const C = l3mxCfg().dist, d = a.distanceTo(b), dz = Math.abs(b.z - a.z), dh = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(dz, dh) * 180 / Math.PI, p = [];
  if (C.xyz) p.push(`${l3mxF(d)} m`); if (C.xy) p.push(`↔ ${l3mxF(dh)} m`); if (C.z) p.push(`↕ ${l3mxF(dz)} m`); if (C.ang) p.push(`∠ ${l3mxF(ang, 1)}°`);
  return p.length ? p.join(" · ") : `${l3mxF(d)} m`;
}
function l3mxPointText(x, y, z) {
  const C = l3mxCfg().point, p = []; if (C.x) p.push(`X ${l3mxF(x, 2)} m`); if (C.y) p.push(`Y ${l3mxF(y, 2)} m`); if (C.z) p.push(`Z ${l3mxF(z, 2)} m`);
  return p.length ? p.join(" | ") : `Z ${l3mxF(z, 2)} m`;
}
function l3mxAreaText(P) {
  const C = l3mxCfg().area, a = typeof l3PolyArea === "function" ? l3PolyArea(P).area : 0; let per = 0; for (let i = 0; i < P.length; i++) per += P[i].distanceTo(P[(i + 1) % P.length]);
  const p = []; if (C.area || !C.perim) p.push(`${l3mxF(a)} m²`); if (C.perim) p.push(C.area || !C.perim ? `(${l3mxF(per)} m)` : `omkr. ${l3mxF(per)} m`);
  return p.join(" ");
}
/* Text för ett mått ur dess kind och punkter (scenens koordinater); null = oförändrad. */
function l3mxText(kind, P, abs) {
  if (kind === "dist" && P.length === 2) return l3mxDistText(P[0], P[1]);
  if (kind === "point" && P.length === 1) return l3mxPointText(abs[0].x, abs[0].y, abs[0].z);
  if (kind === "area" && P.length > 2) return l3mxAreaText(P);
  return null;
}
(function wrap() {
  if (typeof l3mAdd !== "function" || typeof l3mRecalc !== "function") { setTimeout(wrap, 200); return; }
  if (l3mAdd.__mx) return;
  const add0 = l3mAdd;
  l3mAdd = function (kind, pts, text, objs) {
    let t = text;
    if (!l3mx.plain) { try { const O = l3.O, abs = pts.map(p => new THREE.Vector3(p.x + O[0], p.y + O[1], p.z + O[2])), x = l3mxText(kind, pts, abs); if (x != null) t = x; } catch (e) { /* oförändrad text */ } }
    return add0.call(this, kind, pts, t, objs);
  };
  l3mAdd.__mx = true;
  const rec0 = l3mRecalc;
  l3mRecalc = function (m) {
    rec0.apply(this, arguments);
    try { const P = m.pts.map(p => new THREE.Vector3(p[0], p[1], p[2])), x = l3mxText(m.kind, P, P); if (x != null) m.text = x; } catch (e) { /* */ }
  };
  if (typeof l3ToolCancel === "function" && !l3ToolCancel.__mx) { const c0 = l3ToolCancel; l3ToolCancel = function () { try { l3mxCancel(); } catch (e) { /* */ } return c0.apply(this, arguments); }; l3ToolCancel.__mx = true; }
  const bar0 = typeof l3RenderSnapBar === "function" ? l3RenderSnapBar : null;
  if (bar0) { l3RenderSnapBar = function () { const r = bar0.apply(this, arguments); try { l3mxHintSync(); } catch (e) { /* */ } return r; }; }
})();
/* Komponentlinjer: vågrätt streckat och lodrätt grönt streckat från måttets ena punkt (som Z-linjen i förebilden). */
function l3mxDraw(m, P, grp) {
  if (m.kind !== "dist" || P.length !== 2 || !l3mxCfg().dist.comp) return;
  const a = P[0], b = P[1], C = new THREE.Vector3(b.x, b.y, a.z); if (a.distanceTo(C) < 0.02 && C.distanceTo(b) < 0.02) return;
  const mk = (p, q, col) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p, q]), new THREE.LineDashedMaterial({ color: col, dashSize: 0.25, gapSize: 0.15, depthTest: false })); l.computeLineDistances(); l.renderOrder = 10; l.userData.noHit = true; l.raycast = () => {}; grp.add(l); };
  if (a.distanceTo(C) > 0.02) mk(a, C, 0xfde047); if (C.distanceTo(b) > 0.02) mk(C, b, 0x22c55e);
}
/* Räknar om texten på alla mått som redan ligger i vyn efter de nya valen. */
function l3mxReapply() { let n = 0; l3m.list.forEach(m => { if (["dist", "point", "area"].includes(m.kind) && !m.locked && !m.note) { try { l3mRecalc(m); n++; } catch (e) { /* */ } } }); l3mDraw(); if (typeof l3mRenderBar === "function") l3mRenderBar(); l3Status(`${n} mått fick ny text efter dina val.`); }

/* ---- Panelen "Mått som visas" (dockad i högermenyn) ---- */
const L3MX_GROUPS = [
  ["smart", "Smart mått", [["w", "Bredd"], ["h", "Höjd"], ["d", "Djup"], ["vol", "Volym"], ["up", "↑ Upp"], ["down", "↓ Ner"], ["left", "← Vänster"], ["right", "→ Höger"], ["out", "⇥ Ut"]]],
  ["dist", "Avstånd", [["xyz", "⟷ Total"], ["xy", "↔ Vågrätt"], ["z", "↕ Lodrätt"], ["ang", "∠ Lutning"], ["comp", "┘ Linjer"]]],
  ["point", "Punkt", [["x", "X"], ["y", "Y"], ["z", "Z"]]],
  ["area", "Yta", [["area", "m²"], ["perim", "Omkrets"]]],
  ["poly", "Polylinje", [["seg", "Delsträckor"]]],
  ["laser", "3-axlig laser", [["n", "Normal"], ["u", "Axel 1"], ["v", "Axel 2"], ["back", "Inåt"]]],
  ["prof", "Profil", [["grid", "Rutnät"], ["coord", "Koordinater"], ["slope", "Lutning"], ["snap", "Fäst mot linje"]]],
];
function l3mxPanel() {
  if (typeof l3bfPanel !== "function") return;
  const C = l3mxCfg(), esc = s => String(s).replace(/"/g, "&quot;");
  const d = l3bfPanel("v3MxCfg", "📐 Mått som visas", `<div class="v3-mxc">${L3MX_GROUPS.map(([g, t, items]) => `<div class="v3-mxg"><b>${t}</b><div class="v3-bp-chips">${items.map(([k, l]) => `<button type="button" data-mxg="${g}" data-mxk="${k}" class="${C[g][k] ? "on" : ""}">${l}</button>`).join("")}${g === "laser" ? `<label class="v3-mxn" title="Längsta avstånd som lasern söker (m)"><input type="number" id="v3MxMax" min="2" max="500" step="5" value="${C.laser.max}"> m</label>` : ""}</div></div>`).join("")}
    <div class="v3-bp-tools"><button type="button" id="v3MxRe" title="Räkna om texten på de mått som redan ligger i vyn (de med kommentar eller lås rörs inte)">↻ Använd på befintliga mått</button><button type="button" id="v3MxReset" title="Standardval">⟲</button></div></div>`, null, "12px");
  if (!d) return;
  d.querySelectorAll("[data-mxg]").forEach(b => { b.onclick = () => { const g = b.dataset.mxg, k = b.dataset.mxk, on = !l3mxCfg()[g][k]; l3mxSet(g, k, on ? 1 : 0); b.classList.toggle("on", on); }; });
  const mx = d.querySelector("#v3MxMax"); if (mx) mx.onchange = () => l3mxSet("laser", "max", Math.max(2, Math.min(500, Number(mx.value) || 60)));
  d.querySelector("#v3MxRe").onclick = () => l3mxReapply();
  d.querySelector("#v3MxReset").onclick = () => { l3SetPref("mxCfg", {}); l3mxPanel(); };
}

/* ---- Hjälptext överst (som i förebilden) ---- */
const L3MX_HINT = { laser: "Mät avstånd till närmaste ytor i tre riktningar från en punkt (ytans normal och de två axlarna i ytan). Håll över ytan för förhandsvisning, tryck för att lägga ut, högerklicka för att avsluta.", profile: "Rita en linje i vyn: tryck första och andra punkten. Profilen visar ett snitt genom allt som är tänt i modellen. Högerklicka för att avsluta." };
function l3mxHintSync() {
  if (typeof L3_MEAS_START !== "undefined" && !L3_MEAS_START.laser) { L3_MEAS_START.laser = "3-axlig laser: håll över en yta så visas avståndet till närmaste ytor i tre riktningar. Tryck för att lägga ut."; L3_MEAS_START.profile = "Profil: tryck första punkten på linjen."; }
  const host = document.getElementById("v3Canvas"); if (!host) return;
  const mode = l3.tool === "measure" ? (l3Prefs().measure || "dist") : "", txt = L3MX_HINT[mode];
  if (!txt) { if (l3mx.hint) l3mx.hint.style.display = "none"; return; }
  if (!l3mx.hint) { l3mx.hint = document.createElement("div"); l3mx.hint.className = "v3-mxhint"; host.appendChild(l3mx.hint); }
  l3mx.hint.textContent = txt; l3mx.hint.style.display = "block";
}

/* ---- 3-axlig laser ---- */
const l3mxHit = e => { const hs = typeof l3Ray === "function" ? l3Ray(e, l3Surfaces()) : []; return hs.find(x => x.face && x.object.isMesh) || null; };
function l3mxRay(from, dir, max) {
  const rc = new THREE.Raycaster(from, dir, 0, max), cl = l3.renderer.clippingPlanes; rc.firstHitOnly = !(cl && cl.length);
  return rc.intersectObjects(l3Surfaces(), true).find(h => h.object.visible && !h.object.userData.noHit && h.object.type !== "LineSegments" && h.object.type !== "Line" && (typeof l3VisibleChain !== "function" || l3VisibleChain(h.object)) && (typeof l3NotClipped !== "function" || l3NotClipped(h.point))) || null;
}
function l3mxLaserAt(e) {
  const h = l3mxHit(e); if (!h) return null;
  const mesh = h.object.userData && h.object.userData.l3bMain ? h.object.userData.l3bMain : h.object;
  const P = h.point.clone(), n = h.face.normal.clone().transformDirection(mesh.matrixWorld).normalize();
  if (n.dot(l3.camera.position.clone().sub(P)) < 0) n.negate();
  const Z = new THREE.Vector3(0, 0, 1), horiz = Math.abs(n.z) > 0.95;
  let u, v; if (!horiz) { u = Z.clone(); v = new THREE.Vector3().crossVectors(n, u).normalize(); } else { u = new THREE.Vector3(1, 0, 0); v = new THREE.Vector3(0, 1, 0); }
  const C = l3mxCfg().laser, out = [], max = C.max, o = n.clone().multiplyScalar(0.008);
  const add = (lbl, dir, from, grp) => { const r = l3mxRay(from, dir, max); if (r && r.distance > 0.01) out.push({ lbl, pt: r.point.clone(), d: r.distance, obj: r.object }); };
  if (C.n) add("Ut", n, P.clone().add(o));
  if (C.back) add("In", n.clone().negate(), P.clone().sub(o));
  if (C.u) { add(horiz ? "X+" : "Upp", u, P.clone().add(o)); add(horiz ? "X−" : "Ner", u.clone().negate(), P.clone().add(o)); }
  if (C.v) { add(horiz ? "Y+" : "Sida 1", v, P.clone().add(o)); add(horiz ? "Y−" : "Sida 2", v.clone().negate(), P.clone().add(o)); }
  return { P, n, hits: out, obj: h.object };
}
function l3mxLaserHover(e) {
  if (typeof l3mSegLabelsClear === "function") l3mSegLabelsClear("mx:live");
  const L = l3mxLaserAt(e); l3mx.lastLaser = L; if (!L) { l3ShowMarker(null); return; }
  const host = l3.renderer.domElement.parentElement; l3Dot(L.P, 0xfde047);
  L.hits.forEach((h, i) => { l3TmpLine(L.P, h.pt, 0xfde047, false); l3Dot(h.pt, 0xfde047); const el = document.createElement("div"); el.className = "v3-meas v3-mx-lab"; el.textContent = `${l3mxF(h.d)} m`; host.appendChild(el); el._at = L.P.clone().lerp(h.pt, 0.5); l3m.labels.set(`mx:live:${i}`, el); });
  if (typeof l3mPlaceLabels === "function") l3mPlaceLabels();
}
function l3mxLaserClick(e) {
  const L = l3mxLaserAt(e) || l3mx.lastLaser; if (!L || !L.hits.length) { l3Status("3-axlig laser: håll över en yta i modellen.", true); return; }
  if (typeof l3mSegLabelsClear === "function") l3mSegLabelsClear("mx:live");
  const obj = typeof l3mObjAt === "function" ? l3mObjAt(e) : null; l3mx.plain = true;
  try { L.hits.forEach(h => { const m = l3mAdd("dist", [L.P.clone(), h.pt.clone()], `${l3mxF(h.d)} m`, [obj, null]); m.note = h.lbl; m.showNote = false; }); } finally { l3mx.plain = false; }
  l3Clear(l3.groups.tmp); l3mDraw(); if (typeof l3mRenderBar === "function") l3mRenderBar();
  l3Status(`3-axlig laser: ${L.hits.length} mått utlagda. Tryck på nästa punkt, högerklicka för att avsluta.`); l3Render();
}

/* ---- Profil ---- */
const L3MX_COLS = ["#38bdf8", "#f97316", "#22c55e", "#a855f7", "#ef4444", "#eab308", "#14b8a6", "#ec4899", "#84cc16", "#6366f1"];
/* Alla trianglar som är tända: lista med { name, mesh, ranges? }. */
function l3mxSources() {
  const src = []; const skip = new Set([l3.groups.tmp, l3.groups.meas, l3.groups.measKeep, l3.groups.sel, l3.planMesh].filter(Boolean));
  if (typeof l3b !== "undefined") l3b.models.filter(m => m.visible !== false).forEach(m => m.meshes.forEach(mesh => { if (mesh.visible !== false && mesh.userData.l3b && (typeof l3VisibleChain !== "function" || l3VisibleChain(mesh))) src.push({ name: m.name || "Modell", mesh, ifc: true }); }));
  const isIfc = new Set(src.map(s => s.mesh));
  l3.scene.traverse(o => {
    if (!o.isMesh || isIfc.has(o) || !o.geometry || !o.geometry.getAttribute("position")) return;
    for (let p = o; p; p = p.parent) { if (skip.has(p) || p.visible === false) return; if (p.userData && (p.userData.reach || p.userData.noIfc === true && p.userData.noHit === true && !p.userData.placeId)) return; }
    if (o.userData && (o.userData.shadow || o.userData.isSign || o.userData.label)) return;
    let name = "Övrigt", top = o; while (top.parent && top.parent !== l3.scene) top = top.parent;
    if (o.userData.placeId || (typeof l3PlaceIdOf === "function" && l3PlaceIdOf(o))) name = "Etablering"; else if (top.name) name = top.name; else if (top === l3.objMesh) name = "Planerade objekt";
    src.push({ name, mesh: o, ifc: false });
  });
  return src;
}
/* Snittet längs A→B (lodrätt plan). Returnerar { L, series: [{ name, col, n, seg: Float32Array [s0,z0,s1,z1,…] }], zmin, zmax }. */
function l3mxSection(A, B) {
  const dh = new THREE.Vector3(B.x - A.x, B.y - A.y, 0), L = dh.length(); if (L < 0.05) return null; dh.multiplyScalar(1 / L);
  const nrm = new THREE.Vector3(-dh.y, dh.x, 0), series = new Map(); let zmin = 1e18, zmax = -1e18;
  const ser = name => series.get(name) || series.set(name, { name, col: L3MX_COLS[series.size % L3MX_COLS.length], seg: [] }).get(name);
  const src = l3mxSources(), inv = new THREE.Matrix4(), nl = new THREE.Vector3(), V = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], D = [0, 0, 0];
  const tri = (S, M, pos, a, b, c, dl, nlx, nly, nlz) => {
    const ia = a * 3, ib = b * 3, ic = c * 3;
    const da = nlx * pos[ia] + nly * pos[ia + 1] + nlz * pos[ia + 2] - dl, db = nlx * pos[ib] + nly * pos[ib + 1] + nlz * pos[ib + 2] - dl, dc = nlx * pos[ic] + nly * pos[ic + 1] + nlz * pos[ic + 2] - dl;
    if ((da > 0 && db > 0 && dc > 0) || (da < 0 && db < 0 && dc < 0) || (da === 0 && db === 0 && dc === 0)) return;
    const ix = []; const edge = (i0, d0, i1, d1) => { if ((d0 < 0 && d1 > 0) || (d0 > 0 && d1 < 0) || d0 === 0) { const t = d0 === d1 ? 0 : d0 / (d0 - d1); ix.push([pos[i0] + (pos[i1] - pos[i0]) * t, pos[i0 + 1] + (pos[i1 + 1] - pos[i0 + 1]) * t, pos[i0 + 2] + (pos[i1 + 2] - pos[i0 + 2]) * t]); } };
    edge(ia, da, ib, db); edge(ib, db, ic, dc); edge(ic, dc, ia, da); if (ix.length < 2) return;
    const w = ix.slice(0, 2).map(q => V[0].set(q[0], q[1], q[2]).applyMatrix4(M).clone());
    const s0 = (w[0].x - A.x) * dh.x + (w[0].y - A.y) * dh.y, s1 = (w[1].x - A.x) * dh.x + (w[1].y - A.y) * dh.y;
    if ((s0 < 0 && s1 < 0) || (s0 > L && s1 > L)) return;
    S.seg.push(s0, w[0].z, s1, w[1].z); if (w[0].z < zmin) zmin = w[0].z; if (w[0].z > zmax) zmax = w[0].z; if (w[1].z < zmin) zmin = w[1].z; if (w[1].z > zmax) zmax = w[1].z;
  };
  src.forEach(({ name, mesh, ifc }) => {
    mesh.updateWorldMatrix(true, false); const M = mesh.matrixWorld; inv.copy(M).invert();
    // Planet i meshens lokala system: n·(M3·v + t − A) = (M3ᵀ·n)·v + n·(t − A)
    const M3 = new THREE.Matrix3().setFromMatrix4(M), M3t = M3.clone().transpose(), nlv = nrm.clone().applyMatrix3(M3t), tr = new THREE.Vector3().setFromMatrixPosition(M), off = nrm.dot(tr.clone().sub(A)); // n·(M v + t − A) = nlv·v + off
    const pos = mesh.geometry.getAttribute("position").array, S = ser(name), dl = -off;
    if (ifc) {
      const u = mesh.userData.l3b; if (!u || !u.origIdx) return;
      u.ranges.forEach((r, ri) => { if (typeof l3bsDead === "function" && l3bsDead(mesh, ri)) return; const [s, n] = l3bsIdx(mesh, ri); for (let i = 0; i + 2 < n; i += 3) tri(S, M, pos, u.origIdx[s + i], u.origIdx[s + i + 1], u.origIdx[s + i + 2], dl, nlv.x, nlv.y, nlv.z); });
    } else {
      const ix = mesh.geometry.index ? mesh.geometry.index.array : null, cnt = ix ? ix.length : mesh.geometry.getAttribute("position").count;
      for (let i = 0; i + 2 < cnt; i += 3) tri(S, M, pos, ix ? ix[i] : i, ix ? ix[i + 1] : i + 1, ix ? ix[i + 2] : i + 2, dl, nlv.x, nlv.y, nlv.z);
    }
  });
  const list = [...series.values()].filter(s => s.seg.length).map(s => ({ name: s.name, col: s.col, n: s.seg.length / 4, seg: Float32Array.from(s.seg) }));
  return { L, A: A.clone(), B: B.clone(), dh, series: list, zmin: zmin > zmax ? 0 : zmin, zmax: zmin > zmax ? 1 : zmax };
}
const l3mxNice = r => { const e = Math.pow(10, Math.floor(Math.log10(r))), f = r / e; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e; };
/* Diagrammet: x = avstånd längs linjen, y = höjd (absolut Z). */
function l3mxChartDraw(cv, P) {
  const ctx = cv.getContext("2d"), W = cv.width, H = cv.height, k = W / 360, ml = 46 * k, mb = 22 * k, mt = 10 * k, mr = 10 * k, pw = W - ml - mr, ph = H - mb - mt, C = l3mxCfg().prof;
  const dark = matchMedia("(prefers-color-scheme: dark)").matches, fg = dark ? "#cbd5e1" : "#334155", gr = dark ? "rgba(148,163,184,.25)" : "rgba(100,116,139,.22)";
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = dark ? "#0f172a" : "#f8fafc"; ctx.fillRect(0, 0, W, H);
  const S = P.sec, vis = S.series.filter(s => P.on.has(s.name)), O2 = l3.O[2];
  let zmin = Infinity, zmax = -Infinity; vis.forEach(s => { for (let i = 1; i < s.seg.length; i += 2) { const z = s.seg[i] + O2; if (z < zmin) zmin = z; if (z > zmax) zmax = z; } });
  if (!isFinite(zmin)) { ctx.fillStyle = fg; ctx.font = `${12 * k}px system-ui`; ctx.fillText("Inget i snittet – välj lager nedan eller en annan linje.", ml, H / 2); P.map = null; return; }
  const zpad = Math.max(0.5, (zmax - zmin) * 0.08); zmin -= zpad; zmax += zpad;
  const kx = pw / S.L, kzFit = ph / (zmax - zmin), ve = P.ve === "auto" ? kzFit / kx : Number(P.ve), kz = P.ve === "auto" ? kzFit : kx * ve;
  const zc = (zmin + zmax) / 2, X = s => ml + s * kx, Y = z => mt + ph / 2 - (z - zc) * kz;
  P.map = { ml, mt, pw, ph, kx, kz, zc, k, ve: kz / kx, X, Y };
  ctx.save(); ctx.beginPath(); ctx.rect(ml, mt, pw, ph); ctx.clip();
  if (C.grid) { ctx.strokeStyle = gr; ctx.lineWidth = k; const sx = l3mxNice(S.L / 6), sz = l3mxNice((zmax - zmin) / 5); for (let s = 0; s <= S.L; s += sx) { ctx.beginPath(); ctx.moveTo(X(s), mt); ctx.lineTo(X(s), mt + ph); ctx.stroke(); } for (let z = Math.ceil(zmin / sz) * sz; z <= zmax; z += sz) { ctx.beginPath(); ctx.moveTo(ml, Y(z)); ctx.lineTo(ml + pw, Y(z)); ctx.stroke(); } }
  vis.forEach(s => { ctx.strokeStyle = s.col; ctx.lineWidth = 1.4 * k; ctx.beginPath(); for (let i = 0; i + 3 < s.seg.length; i += 4) { ctx.moveTo(X(s.seg[i]), Y(s.seg[i + 1] + O2)); ctx.lineTo(X(s.seg[i + 2]), Y(s.seg[i + 3] + O2)); } ctx.stroke(); });
  ctx.restore();
  ctx.strokeStyle = fg; ctx.lineWidth = k; ctx.strokeRect(ml, mt, pw, ph); ctx.fillStyle = fg; ctx.font = `${10 * k}px system-ui`; ctx.textAlign = "right";
  { const sz = l3mxNice((zmax - zmin) / 5); for (let z = Math.ceil(zmin / sz) * sz; z <= zmax; z += sz) ctx.fillText(l3Fmt(Math.abs(z) < 1e-9 ? 0 : z, sz < 1 ? 1 : 0), ml - 4 * k, Y(z) + 3 * k); }
  ctx.textAlign = "center"; { const sx = l3mxNice(S.L / 6); for (let s = 0; s <= S.L; s += sx) ctx.fillText(l3Fmt(s, sx < 1 ? 1 : 0), X(s), H - 7 * k); }
  ctx.textAlign = "left"; ctx.fillText("m", 3 * k, mt + 8 * k);
  // Valda punkter, förbindelse och hovring
  const pt = (q, col) => { ctx.fillStyle = col; ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5 * k; ctx.beginPath(); ctx.arc(X(q.s), Y(q.z), 4 * k, 0, 7); ctx.fill(); ctx.stroke(); };
  if (P.p1 && P.p2) { ctx.strokeStyle = "#fde047"; ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.moveTo(X(P.p1.s), Y(P.p1.z)); ctx.lineTo(X(P.p2.s), Y(P.p2.z)); ctx.stroke(); ctx.setLineDash([4 * k, 3 * k]); ctx.strokeStyle = "#22c55e"; ctx.beginPath(); ctx.moveTo(X(P.p2.s), Y(P.p1.z)); ctx.lineTo(X(P.p2.s), Y(P.p2.z)); ctx.moveTo(X(P.p1.s), Y(P.p1.z)); ctx.lineTo(X(P.p2.s), Y(P.p1.z)); ctx.stroke(); ctx.setLineDash([]); }
  if (P.p1) pt(P.p1, "#fde047"); if (P.p2) pt(P.p2, "#fde047");
  if (P.hover && !P.p2) { ctx.strokeStyle = "rgba(250,204,21,.9)"; ctx.lineWidth = k; ctx.beginPath(); ctx.moveTo(X(P.hover.s), mt); ctx.lineTo(X(P.hover.s), mt + ph); ctx.stroke(); pt(P.hover, "#facc15"); if (C.coord) { const t = `${l3Fmt(P.hover.s, 2)} m · z ${l3Fmt(P.hover.z, 2)}`; ctx.font = `bold ${10 * k}px system-ui`; const w = ctx.measureText(t).width + 8 * k, x = Math.min(ml + pw - w, X(P.hover.s) + 6 * k), y = Math.max(mt + 14 * k, Y(P.hover.z) - 8 * k); ctx.fillStyle = "rgba(15,23,42,.85)"; ctx.fillRect(x, y - 11 * k, w, 14 * k); ctx.fillStyle = "#fde047"; ctx.textAlign = "left"; ctx.fillText(t, x + 4 * k, y); } }
}
function l3mxChartPick(P, ev, cv) {
  const r = cv.getBoundingClientRect(), k = cv.width / r.width, px = (ev.clientX - r.left) * k, py = (ev.clientY - r.top) * k, M = P.map; if (!M) return null;
  let s = (px - M.ml) / M.kx, z = M.zc - (py - M.mt - M.ph / 2) / M.kz;
  if (l3mxCfg().prof.snap) { // närmaste punkt på en synlig linje (inom 12 px)
    let best = null, bd = (12 * M.k) ** 2; const O2 = l3.O[2];
    P.sec.series.filter(q => P.on.has(q.name)).forEach(q => { for (let i = 0; i + 3 < q.seg.length; i += 4) { const x0 = M.X(q.seg[i]), y0 = M.Y(q.seg[i + 1] + O2), x1 = M.X(q.seg[i + 2]), y1 = M.Y(q.seg[i + 3] + O2), dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2)), qx = x0 + t * dx, qy = y0 + t * dy, d = (px - qx) ** 2 + (py - qy) ** 2; if (d < bd) { bd = d; best = { s: (qx - M.ml) / M.kx, z: M.zc - (qy - M.mt - M.ph / 2) / M.kz }; } } });
    if (best) return best;
  }
  return { s: Math.max(0, Math.min(P.sec.L, s)), z };
}
function l3mxProfileReadout(P) {
  const el = document.getElementById("v3MxRead"); if (!el) return; const C = l3mxCfg().prof, S = P.sec, A = S.A, O = l3.O;
  const xyz = q => ({ X: A.x + S.dh.x * q.s + O[0], Y: A.y + S.dh.y * q.s + O[1], Z: q.z });
  const row = (n, q) => { const c = xyz(q); return `<div class="v3-mxr"><i>${n}</i>${C.coord ? `X ${l3Fmt(c.X, 2)} · Y ${l3Fmt(c.Y, 2)} · ` : ""}<b>Z ${l3Fmt(c.Z, 2)}</b></div>`; };
  let h = ""; if (P.p1) h += row("1", P.p1); if (P.p2) h += row("2", P.p2);
  if (P.p1 && P.p2) { const dx = Math.abs(P.p2.s - P.p1.s), dz = P.p2.z - P.p1.z, d = Math.hypot(dx, dz); h += `<div class="v3-mxr tot">↔ ${l3Fmt(dx, 2)} m · ↕ ${l3Fmt(Math.abs(dz), 2)} m · ⟷ ${l3Fmt(d, 2)} m${C.slope && dx > 1e-6 ? ` · ${l3Fmt(dz / dx * 100, 1)} %` : ""}</div>`; }
  el.innerHTML = h || `<span class="hint">Tryck i diagrammet: första och andra punkten. Fäster mot närmaste linje.</span>`;
}
function l3mxProfileOpen(A, B) {
  l3Status("Räknar snittet genom allt som är tänt…"); const t0 = performance.now();
  const sec = l3mxSection(A, B); if (!sec) { l3Status("Profil: punkterna ligger för nära varandra i plan.", true); return; }
  const P = l3mx.prof = { sec, on: new Set(sec.series.map(s => s.name)), ve: "auto", p1: null, p2: null, hover: null, map: null };
  const total = sec.series.reduce((a, s) => a + s.n, 0);
  const d = l3bfPanel("v3MxProf", "📈 Profil", `<div class="v3-mxp">
    <canvas id="v3MxCv" width="720" height="440" class="v3-mxcv"></canvas>
    <div class="v3-mxbar"><select id="v3MxVe" title="Höjdförstoring"><option value="auto">Höjd: auto</option><option value="1">1 : 1</option><option value="2">2 : 1</option><option value="5">5 : 1</option><option value="10">10 : 1</option></select><button type="button" id="v3MxClr" title="Rensa punkterna">⟲</button><button type="button" id="v3MxAdd" title="Lägg profillinjen som mått i vyn">＋ Mått</button><button type="button" id="v3MxCsv" title="Spara snittet som CSV (avstånd, höjd per lager)">CSV</button><span class="hint">${l3Fmt(sec.L, 1)} m · ${total.toLocaleString("sv-SE")} linjer</span></div>
    <div class="v3-mxlay">${sec.series.map(s => `<label class="v3-mxl"><input type="checkbox" data-mxs="${String(s.name).replace(/"/g, "&quot;")}" checked><i style="background:${s.col}"></i><span>${String(s.name).replace(/</g, "&lt;")}</span><em>${s.n.toLocaleString("sv-SE")}</em></label>`).join("") || `<div class="hint">Inget är tänt längs linjen.</div>`}</div>
    <div id="v3MxRead" class="v3-mxread"></div></div>`, () => { l3mx.prof = null; if (l3mx.grp) { l3.scene.remove(l3mx.grp); l3mx.grp = null; l3Render(); } }, "12px");
  if (!d) return;
  const cv = d.querySelector("#v3MxCv"), redraw = () => { l3mxChartDraw(cv, P); l3mxProfileReadout(P); };
  // linjen i 3D
  if (l3mx.grp) l3.scene.remove(l3mx.grp); l3mx.grp = new THREE.Group(); l3.scene.add(l3mx.grp);
  const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([A, B]), new THREE.LineBasicMaterial({ color: 0xfde047, depthTest: false })); ln.renderOrder = 12; ln.raycast = () => {}; ln.userData.noHit = true; l3mx.grp.add(ln);
  [A, B].forEach(q => l3Dot(q, 0xfde047, l3mx.grp)); l3Render();
  cv.onpointermove = e => { P.hover = l3mxChartPick(P, e, cv); redraw(); };
  cv.onpointerleave = () => { P.hover = null; redraw(); };
  cv.onclick = e => { const q = l3mxChartPick(P, e, cv); if (!q) return; if (!P.p1 || P.p2) { P.p1 = q; P.p2 = null; } else P.p2 = q; redraw(); };
  d.querySelectorAll("[data-mxs]").forEach(c => { c.onchange = () => { c.checked ? P.on.add(c.dataset.mxs) : P.on.delete(c.dataset.mxs); redraw(); }; });
  d.querySelector("#v3MxVe").onchange = e => { P.ve = e.target.value; redraw(); };
  d.querySelector("#v3MxClr").onclick = () => { P.p1 = P.p2 = null; redraw(); };
  d.querySelector("#v3MxAdd").onclick = () => { l3mx.plain = true; try { const m = l3mAdd("dist", [A.clone(), B.clone()], `${l3Fmt(sec.L, 2)} m`, [null, null]); m.note = "Profillinje"; m.showNote = true; } finally { l3mx.plain = false; } l3mDraw(); l3Status("Profillinjen lades som mått."); };
  d.querySelector("#v3MxCsv").onclick = () => {
    const rows = ["lager;s_start;z_start;s_slut;z_slut"]; sec.series.filter(s => P.on.has(s.name)).forEach(s => { for (let i = 0; i + 3 < s.seg.length; i += 4) rows.push([s.name, s.seg[i], s.seg[i + 1] + l3.O[2], s.seg[i + 2], s.seg[i + 3] + l3.O[2]].map(v => typeof v === "number" ? v.toFixed(3).replace(".", ",") : v).join(";")); });
    const blob = new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" }); if (typeof downloadBlob === "function") downloadBlob(blob, "profil.csv"); else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "profil.csv"; a.click(); }
  };
  redraw(); l3Status(`Profil klar på ${Math.round(performance.now() - t0)} ms: ${sec.series.length} lager, ${total.toLocaleString("sv-SE")} linjer.`);
}
function l3mxProfileHover(e) {
  const s = l3Snap(e); l3ShowMarker(s); if (!s) return;
  if (l3mx.profA) { l3TmpLine(l3mx.profA, s.point, 0xfde047, true); l3Dot(l3mx.profA, 0xfde047); const el = l3.measLabel; l3ShowVcb("Längd", `${l3Fmt(Math.hypot(s.point.x - l3mx.profA.x, s.point.y - l3mx.profA.y), 2)} m (plan)`); }
}
function l3mxProfileClick(e) {
  const s = l3Snap(e); if (!s) return;
  if (!l3mx.profA) { l3mx.profA = s.point.clone(); l3Status("Profil: tryck andra punkten."); return; }
  const A = l3mx.profA, B = s.point.clone(); l3mx.profA = null; l3Clear(l3.groups.tmp); l3mxProfileOpen(A, B);
}
/* Anropas av verktygen (lagesplan-3dtools.js): true = hanterat. */
function l3mxHover(e) {
  if (l3.tool !== "measure") return false; const mode = l3Prefs().measure;
  if (mode === "laser") { l3mxLaserHover(e); return true; }
  if (mode === "profile") { l3mxProfileHover(e); return true; }
  return false;
}
function l3mxClick(e) {
  if (l3.tool !== "measure") return false; const mode = l3Prefs().measure;
  if (mode === "laser") { l3mxLaserClick(e); return true; }
  if (mode === "profile") { l3mxProfileClick(e); return true; }
  return false;
}
function l3mxCancel() { l3mx.profA = null; if (typeof l3mSegLabelsClear === "function") l3mSegLabelsClear("mx:live"); }
