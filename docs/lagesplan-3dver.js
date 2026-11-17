/* 3D-editorn – Versioner och jämförelse (Victor 2026-11-17: "välj de olika versionerna som finns lagrade i Trimble Connect i min 3d-editor
   och jämför de modeller jag väljer"). Prefix l3vr.
   1) Välj en IFC-fil i projektets mappar (eller en redan inläst) och se alla dess versioner (tcVersions via 4D-planering, bara läsning).
   2) Välj en äldre (A) och en nyare (B) version; båda läses in som egna modeller ("Namn · v3") utan att ersätta den visade modellen.
   3) Jämförelsen: objekten paras ihop på GUID (annars på klass, namn, läge och volym om GUID bytts vid ny export) och sorteras i
      tillkommit / borttaget / flyttat / formändrat / bytt namn eller klass / oförändrat, med flyttavstånd, volym- och måttförändring.
   4) Visning: färgad skillnad (gammalt läge som spöke), före/efter, blinka eller svep (delad bild med reglage).
   5) Per klass: antal och volymskillnad. Per objekt: egenskapsändringar (läses ur IFC-filerna när man öppnar objektet). CSV-export.
   Jämförelsen sparas inte och ändrar inget i Trimble Connect. De inlästa versionerna glöms när jämförelsen stängs. */

const L3VR_COL = { added: "#16a34a", removed: "#dc2626", moved: "#2563eb", reshaped: "#f59e0b", renamed: "#9333ea", same: "#94a3b8" };
const L3VR_NAME = { added: "Tillkommit", removed: "Borttaget", moved: "Flyttat", reshaped: "Ändrad form", renamed: "Nytt namn/klass", same: "Oförändrat" };
const L3VR_ORDER = ["added", "removed", "moved", "reshaped", "renamed", "same"];
const l3vr = { src: "tc", ldA: "", ldB: "", own: { A: false, B: false }, meta: null, noPlan: true, setOrig: false, hid: [], colA: "#ef4444", colB: "#2563eb", modelCol: new Map(), open: false, file: null, versions: null, A: "", B: "", ids: { A: null, B: null }, busy: "", res: null, view: "diff", same: "ghost", old: true, show: { added: 1, removed: 1, moved: 1, reshaped: 1, renamed: 1, same: 1 },
  tol: 5, filter: { cls: new Set(), q: "", st: "" }, sel: null, props: null, swipe: 0.5, swipeAxis: [1, 0], blink: null, active: false, col: new Map(), tc: { stack: [], items: null, busy: false, err: "" }, pick: false };

const l3vrEsc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const l3vrTick = () => new Promise(r => setTimeout(r, 8));
const l3vrDate = s => { if (!s) return ""; const d = new Date(s); return isNaN(d) ? String(s).slice(0, 16) : d.toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }); };
const l3vrMb = n => n ? (n / 1048576 < 10 ? (n / 1048576).toFixed(1).replace(".", ",") : Math.round(n / 1048576)) + " MB" : "";
const l3vrClsName = c => (typeof l3anClsName === "function" ? l3anClsName(c) : String(c || "").replace(/^IFC/i, "")) || "Okänd klass";
function l3vrModel(k) { return l3b.models.find(m => m.id === l3vr.ids[k]) || null; }

/* ---- Mått per objekt: begränsningsvolym, volym, yta, tyngdpunkt och en formsignatur som inte ändras när objektet bara flyttas ---- */
function l3vrStats(m, onTick) {
  const out = new Map();
  m.meshes.forEach(mesh => {
    const u = mesh.userData.l3b; if (!u || !u.origIdx) return;
    const pos = mesh.geometry.getAttribute("position").array, idx = u.origIdx; mesh.updateMatrixWorld(true); const M = mesh.matrixWorld.elements;
    u.ranges.forEach((r, ri) => {
      if (!r.guid) return;
      const [s, c] = l3bsIdx(mesh, ri); if (!c) return;
      const P = new Map(); let nx = 1e30, ny = 1e30, nz = 1e30, xx = -1e30, xy = -1e30, xz = -1e30;
      for (let i = s; i < s + c; i++) { const v = idx[i]; if (P.has(v)) continue; const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], X = M[0] * x + M[4] * y + M[8] * z + M[12], Y = M[1] * x + M[5] * y + M[9] * z + M[13], Z = M[2] * x + M[6] * y + M[10] * z + M[14]; P.set(v, [X, Y, Z]); if (X < nx) nx = X; if (Y < ny) ny = Y; if (Z < nz) nz = Z; if (X > xx) xx = X; if (Y > xy) xy = Y; if (Z > xz) xz = Z; }
      let vol = 0, area = 0, cx = 0, cy = 0, cz = 0, h = 0, h2 = 0; const q = 0.002;
      P.forEach(p => { const a = Math.round((p[0] - nx) / q), b = Math.round((p[1] - ny) / q), d = Math.round((p[2] - nz) / q); let k = Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(d, 83492791); k = Math.imul(k ^ (k >>> 15), 2246822507); k ^= k >>> 13; h = (h + (k >>> 0)) >>> 0; h2 = (h2 + Math.imul(k, 3266489917)) >>> 0; });
      for (let i = s; i + 2 < s + c; i += 3) {
        const a0 = P.get(idx[i]), b0 = P.get(idx[i + 1]), d0 = P.get(idx[i + 2]); if (!a0 || !b0 || !d0) continue;
        const a = [a0[0] - nx, a0[1] - ny, a0[2] - nz], b = [b0[0] - nx, b0[1] - ny, b0[2] - nz], d = [d0[0] - nx, d0[1] - ny, d0[2] - nz];   // relativt hörnet: stora koordinater (miljoner) förstör annars volym och tyngdpunkt
        const v = (a[0] * (b[1] * d[2] - b[2] * d[1]) - a[1] * (b[0] * d[2] - b[2] * d[0]) + a[2] * (b[0] * d[1] - b[1] * d[0])) / 6; vol += v; cx += v * (a[0] + b[0] + d[0]) / 4; cy += v * (a[1] + b[1] + d[1]) / 4; cz += v * (a[2] + b[2] + d[2]) / 4;
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2]; area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
      }
      const ctr = Math.abs(vol) > 1e-9 ? [nx + cx / vol, ny + cy / vol, nz + cz / vol] : [(nx + xx) / 2, (ny + xy) / 2, (nz + xz) / 2];
      const prev = out.get(r.guid), ent = { mesh, ri, guid: r.guid, name: r.name || "", cls: String(r.cls || "").toUpperCase(), b: [nx, ny, nz, xx, xy, xz], vol: Math.abs(vol), area, c: ctr, n: P.size, sig: h + ":" + h2 };
      if (prev) { prev.vol += ent.vol; prev.area += ent.area; prev.n += ent.n; prev.sig += "|" + ent.sig; prev.b = [Math.min(prev.b[0], nx), Math.min(prev.b[1], ny), Math.min(prev.b[2], nz), Math.max(prev.b[3], xx), Math.max(prev.b[4], xy), Math.max(prev.b[5], xz)]; prev.parts = (prev.parts || [prev]).concat([ent]); }
      else out.set(r.guid, ent);
    });
  });
  return out;
}

/* ---- Jämförelsen ---- */
async function l3vrCompare(MA, MB, tolMm) {
  const tol = (tolMm || 5) / 1000, SA = l3vrStats(MA), SB = l3vrStats(MB), rows = [];
  await l3vrTick();
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const classify = (a, b, reguid) => {
    const dc = dist(a.c, b.c), dmin = Math.max(Math.abs(a.b[0] - b.b[0]), Math.abs(a.b[1] - b.b[1]), Math.abs(a.b[2] - b.b[2]));
    const sa = [a.b[3] - a.b[0], a.b[4] - a.b[1], a.b[5] - a.b[2]], sb = [b.b[3] - b.b[0], b.b[4] - b.b[1], b.b[5] - b.b[2]], dsz = Math.max(Math.abs(sa[0] - sb[0]), Math.abs(sa[1] - sb[1]), Math.abs(sa[2] - sb[2]));
    const dv = b.vol - a.vol, relv = a.vol > 1e-9 ? Math.abs(dv) / a.vol : (Math.abs(dv) > 1e-9 ? 1 : 0);
    const sameShape = a.sig === b.sig || (a.n === b.n && dsz <= tol && relv < 1e-3);
    const e = { guid: b.guid, name: b.name || a.name, cls: b.cls || a.cls, a, b, dvol: dv, dpos: dc, dsize: dsz, reguid: !!reguid, why: "" };
    if (!sameShape) { e.st = "reshaped"; e.why = [dsz > tol ? `mått ändrat ${Math.round(dsz * 1000)} mm` : "", Math.abs(dv) > 1e-6 ? `volym ${dv > 0 ? "+" : "−"}${Math.abs(dv).toFixed(3).replace(".", ",")} m³` : "", dc > tol ? `flyttat ${Math.round(dc * 1000)} mm` : ""].filter(Boolean).join(", ") || "ändrad form"; }
    else if (dc > tol || dmin > tol) { e.st = "moved"; e.why = `flyttat ${dc >= 1 ? dc.toFixed(2).replace(".", ",") + " m" : Math.round(dc * 1000) + " mm"}`; }
    else if (a.name !== b.name || a.cls !== b.cls) { e.st = "renamed"; e.why = a.cls !== b.cls ? `klass ${l3vrClsName(a.cls)} → ${l3vrClsName(b.cls)}` : `namn "${a.name}" → "${b.name}"`; }
    else e.st = "same";
    return e;
  };
  const onlyA = [], onlyB = []; let n = 0;
  SB.forEach((b, g) => { const a = SA.get(g); if (a) rows.push(classify(a, b, false)); else onlyB.push(b); if (++n % 3000 === 0) return l3vrTick(); });
  SA.forEach((a, g) => { if (!SB.has(g)) onlyA.push(a); });
  await l3vrTick();
  // Nytt GUID vid ny export: para ihop på klass + namn + läge (rutnät 1 m) + volym inom 10 %.
  const grid = new Map(), key = (cls, c) => cls + "|" + Math.round(c[0]) + "|" + Math.round(c[1]) + "|" + Math.round(c[2]);
  onlyA.forEach(a => { const k = key(a.cls, a.c); (grid.get(k) || grid.set(k, []).get(k)).push(a); });
  const usedA = new Set(), added = [];
  onlyB.forEach(b => {
    let best = null, bd = 0.6;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const cand = grid.get(b.cls + "|" + (Math.round(b.c[0]) + dx) + "|" + (Math.round(b.c[1]) + dy) + "|" + (Math.round(b.c[2]) + dz)); if (!cand) continue;
      cand.forEach(a => { if (usedA.has(a)) return; if (a.name !== b.name) return; const d = dist(a.c, b.c); const rv = Math.max(a.vol, b.vol) > 1e-9 ? Math.abs(a.vol - b.vol) / Math.max(a.vol, b.vol) : 0; if (d < bd && rv < 0.1) { bd = d; best = a; } });
    }
    if (best) { usedA.add(best); rows.push(classify(best, b, true)); } else added.push(b);
  });
  added.forEach(b => rows.push({ st: "added", guid: b.guid, name: b.name, cls: b.cls, a: null, b, dvol: b.vol, dpos: 0, dsize: 0, why: `${b.vol.toFixed(3).replace(".", ",")} m³`, reguid: false }));
  onlyA.forEach(a => { if (!usedA.has(a)) rows.push({ st: "removed", guid: a.guid, name: a.name, cls: a.cls, a, b: null, dvol: -a.vol, dpos: 0, dsize: 0, why: `${a.vol.toFixed(3).replace(".", ",")} m³`, reguid: false }); });
  const count = {}; L3VR_ORDER.forEach(k => { count[k] = 0; }); rows.forEach(r => { count[r.st]++; });
  const cls = new Map(); rows.forEach(r => { const c = cls.get(r.cls) || { cls: r.cls, added: 0, removed: 0, moved: 0, reshaped: 0, renamed: 0, same: 0, dvol: 0 }; c[r.st]++; c.dvol += r.dvol; cls.set(r.cls, c); });
  const noGuidA = MA.meshes.reduce((s, x) => s + (x.userData.l3b ? x.userData.l3b.ranges.filter(r => !r.guid).length : 0), 0), noGuidB = MB.meshes.reduce((s, x) => s + (x.userData.l3b ? x.userData.l3b.ranges.filter(r => !r.guid).length : 0), 0);
  rows.sort((x, y) => L3VR_ORDER.indexOf(x.st) - L3VR_ORDER.indexOf(y.st) || x.cls.localeCompare(y.cls) || x.name.localeCompare(y.name, "sv", { numeric: true }));
  return { rows, count, cls: [...cls.values()].sort((a, b) => Math.abs(b.dvol) - Math.abs(a.dvol)), volA: [...SA.values()].reduce((s, x) => s + x.vol, 0), volB: [...SB.values()].reduce((s, x) => s + x.vol, 0), reguid: rows.filter(r => r.reguid).length, noGuid: noGuidA + noGuidB, tol: tolMm || 5 };
}

/* ---- Egenskapsändringar för ett objekt (läses ur IFC-filerna vid behov) ---- */
function l3vrFlat(d) {
  const m = new Map(); if (!d) return m;
  (d.attrs || []).forEach(([l, v]) => m.set("Objekt › " + l, v)); (d.loc || []).forEach(([l, v]) => m.set("Plats › " + l, v)); (d.material || []).forEach((x, i) => m.set("Material › " + (i + 1), x));
  if (d.type) m.set("Typ › Namn", d.type.name || d.type.cls);
  (d.psets || []).forEach(ps => (ps.p || []).forEach(([pn, v]) => m.set(ps.n + " › " + pn, v)));
  return m;
}
async function l3vrPropDiff(e) {
  const A = l3vrModel("A"), B = l3vrModel("B"); if (!A || !B || typeof l3pProps !== "function") return null;
  const [da, db] = await Promise.all([e.a ? l3pProps(A, e.guid, { needDownload: true }) : null, e.b ? l3pProps(B, e.guid, { needDownload: true }) : null]);
  const fa = l3vrFlat(da), fb = l3vrFlat(db), out = [];
  new Set([...fa.keys(), ...fb.keys()]).forEach(k => { const x = fa.get(k), y = fb.get(k); if (x === y) return; out.push({ k, a: x == null ? "" : String(x), b: y == null ? "" : String(y), t: x == null ? "ny" : y == null ? "borta" : "ändrad" }); });
  return out;
}

/* Tidplanen av/på under jämförelsen: på = som en vanlig viewer (Original-läget: modellens egna färger, inget dolt eller färgat efter status). */
function l3vrPlanMode() {
  if (typeof l3Original !== "function" || typeof l3b === "undefined") return;
  if (l3vr.noPlan && !l3b.orig) { l3Original(true); l3vr.setOrig = true; }
  else if (!l3vr.noPlan && l3b.orig && l3vr.setOrig) { l3Original(false); l3vr.setOrig = false; }
  l3vrHideCopies();   // Original-läget tänder alla modeller: den vanliga kopian släcks igen
}
/* ---- Visningen i 3D ---- */
function l3vrHex(h) { const c = new THREE.Color(h); return [c.r, c.g, c.b]; }
const l3vrColorFor0 = typeof l3pColorFor === "function" ? l3pColorFor : null;
l3pColorFor = function (m, r, orig) { if (l3vr.active && l3vr.modelCol.size) { const mc = l3vr.modelCol.get(m.id); if (mc) return mc; } if (l3vr.active && l3vr.col.size) { const c = l3vr.col.get(m.id + "|" + r.guid); if (c) return c; } return l3vrColorFor0 ? l3vrColorFor0(m, r, orig) : null; };
function l3vrClear(keepCol) {
  [l3vrModel("A"), l3vrModel("B")].forEach(m => { if (!m) return; m.meshes.forEach(x => { const u = x.userData.l3b; if (!u) return; if (u.cmpHide || u.cmpAlpha) { u.cmpHide = null; u.cmpAlpha = null; l3bApplyHidden(x); } }); });
  l3vrSwipeOff(); if (l3vr.blink) { clearInterval(l3vr.blink); l3vr.blink = null; }
  l3vr.modelCol.clear(); l3vrOffsetB(false);
  l3vr.active = false; if (!keepCol) l3vr.col.clear();
}
/* Överlägg: nyare versionen ritas lite framför den äldre där ytorna ligger exakt på varandra, så att den äldres färg bara syns där den sticker ut eller saknar motsvarighet. */
function l3vrOffsetB(on) { const B = l3vrModel("B"); if (!B) return; B.meshes.forEach(x => x.traverse(o => { if (o.material && !o.isLine && !o.isLineSegments) (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => { if (mt.polygonOffset !== on || on) { mt.polygonOffset = on; mt.polygonOffsetFactor = on ? -2 : 0; mt.polygonOffsetUnits = on ? -2 : 0; mt.needsUpdate = true; } }); })); }
function l3vrApply() {
  const A = l3vrModel("A"), B = l3vrModel("B"), R = l3vr.res; if (!A || !B || !R) return;
  l3vrClear(true); l3vr.col.clear(); l3vr.active = true;
  const view = l3vr.view, want = new Map(); // modell → { hide:Set, alpha:Map }
  const slot = m => { let w = want.get(m); if (!w) { w = new Map(); want.set(m, w); } return w; };
  const mark = (e, hide, alpha) => { if (!e) return; let w = slot(e.mesh); if (!w.has(e.ri)) w.set(e.ri, {}); const o = w.get(e.ri); if (hide) o.hide = true; if (alpha != null) o.alpha = alpha; };
  R.rows.forEach(r => { if (!l3vrInF(r)) { mark(r.a, true); mark(r.b, true); } });
  if (view === "diff") {
    R.rows.filter(l3vrInF).forEach(r => {
      const shown = r.st === "same" || l3vr.show[r.st];
      if (r.b) {
        if (r.st === "same") { if (!l3vr.show.same || l3vr.same === "hide") mark(r.b, true); else if (l3vr.same === "ghost") mark(r.b, false, 0.15); else l3vr.col.set(B.id + "|" + r.b.guid, l3vrHex(L3VR_COL.same)); }
        else if (!shown) mark(r.b, true); else l3vr.col.set(B.id + "|" + r.b.guid, l3vrHex(L3VR_COL[r.st]));
      }
      if (r.a) {
        if (r.st === "removed" && shown) l3vr.col.set(A.id + "|" + r.a.guid, l3vrHex(L3VR_COL.removed));
        else if ((r.st === "moved" || r.st === "reshaped") && shown && l3vr.old) { l3vr.col.set(A.id + "|" + r.a.guid, l3vrHex(L3VR_COL.removed)); mark(r.a, false, 0.3); }
        else mark(r.a, true);
      }
    });
  }
  want.forEach((w, mesh) => { const u = mesh.userData.l3b; u.cmpHide = new Set(); u.cmpAlpha = new Map(); w.forEach((o, ri) => { if (o.hide) u.cmpHide.add(ri); else if (o.alpha != null) u.cmpAlpha.set(ri, o.alpha); }); });
  // objekt som inte finns i resultatet (utan GUID) i A döljs i färgläget så att inget gammalt ligger kvar
  if (view === "diff") A.meshes.forEach(x => { const u = x.userData.l3b; if (!u) return; u.ranges.forEach((r, ri) => { if (!r.guid) { if (!u.cmpHide) u.cmpHide = new Set(); u.cmpHide.add(ri); } }); });
  [A, B].forEach(m => m.meshes.forEach(x => { if (x.userData.l3b) l3bApplyHidden(x); }));
  if (view === "overlay") { l3vr.modelCol.set(A.id, l3vrHex(l3vr.colA)); l3vr.modelCol.set(B.id, l3vrHex(l3vr.colB)); l3vrOffsetB(true); }
  l3bShow(A.id, view !== "after"); l3bShow(B.id, view !== "before");
  l3bRecolor(); if (view === "blink") l3vrBlink(); if (view === "swipe") l3vrSwipeOn();
  l3Render();
}
function l3vrBlink() {
  const A = l3vrModel("A"), B = l3vrModel("B"); let k = 0; l3bShow(A.id, true); l3bShow(B.id, false);
  l3vr.blink = setInterval(() => { k ^= 1; l3bShow(A.id, !k); l3bShow(B.id, !!k); l3Render(); const t = document.querySelector("#v3Ver .vr-blinkl"); if (t) t.textContent = k ? "Nyare (B)" : "Äldre (A)"; }, 900);
}
/* Svep: en plan delar bilden; äldre till vänster, nyare till höger (efter kamerans riktning vid start). */
function l3vrSwipeOn() {
  const A = l3vrModel("A"), B = l3vrModel("B"); if (!A || !B) return;
  const cam = l3.camera, r = new THREE.Vector3(); cam.getWorldDirection(r); r.set(-r.y, r.x, 0); if (r.lengthSq() < 1e-6) r.set(1, 0, 0); r.normalize(); l3vr.swipeAxis = [r.x, r.y];
  l3.renderer.localClippingEnabled = true; l3bShow(A.id, true); l3bShow(B.id, true); l3vrSwipeMove();
}
function l3vrSwipeRange() {
  const A = l3vrModel("A"), B = l3vrModel("B"), bb = new THREE.Box3(); [A, B].forEach(m => m && m.meshes.forEach(x => { x.updateMatrixWorld(true); bb.expandByObject(x); }));
  const n = l3vr.swipeAxis, pts = [[bb.min.x, bb.min.y], [bb.max.x, bb.min.y], [bb.min.x, bb.max.y], [bb.max.x, bb.max.y]].map(p => p[0] * n[0] + p[1] * n[1]);
  return [Math.min(...pts), Math.max(...pts)];
}
function l3vrSwipeMove() {
  const A = l3vrModel("A"), B = l3vrModel("B"); if (!A || !B) return;
  const [lo, hi] = l3vrSwipeRange(), c = lo + (hi - lo) * l3vr.swipe, n = new THREE.Vector3(l3vr.swipeAxis[0], l3vr.swipeAxis[1], 0);
  const set = (m, pl) => m.meshes.forEach(x => x.traverse(o => { if (o.material && !o.isLineSegments && !o.isLine) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => { mt.clippingPlanes = [pl]; mt.needsUpdate = true; }); } }));
  set(A, new THREE.Plane(n.clone().negate(), c)); set(B, new THREE.Plane(n.clone(), -c)); l3Render();
}
function l3vrSwipeOff() { [l3vrModel("A"), l3vrModel("B")].forEach(m => m && m.meshes.forEach(x => x.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => { if (mt.clippingPlanes && mt.clippingPlanes.length) { mt.clippingPlanes = null; mt.needsUpdate = true; } }); }))); }

/* Den vanliga (inlästa) modellen av samma fil ligger annars kvar och täcker versionerna – spöken och skillnadsfärger syns då inte. Den släcks under jämförelsen och tänds igen när den stängs. */
function l3vrHideCopies() {
  const f = l3vr.file; if (!f) return; l3vrShowCopies();
  if (!l3vr.own.A && !l3vr.own.B) { l3b.models.forEach(m => { if (m.id !== l3vr.ids.A && m.id !== l3vr.ids.B && m.visible !== false) { l3vr.hid.push(m.id); l3bShow(m.id, false); } }); if (l3vr.hid.length) l3Status(`${l3vr.hid.length} andra modeller är släckta under jämförelsen (tänds igen när du stänger).`); return; }
  l3b.models.forEach(m => { if (m.id === l3vr.ids.A || m.id === l3vr.ids.B || m.visible === false) return; const same = (m.src && m.src.fileId === f.fileId) || String(m.name || "").toLowerCase() === String(f.name || "").toLowerCase(); if (same) { l3vr.hid.push(m.id); l3bShow(m.id, false); } });
  if (l3vr.hid.length) l3Status(`${l3vr.hid.length} vanlig modell av samma fil är släckt under jämförelsen (tänds igen när du stänger).`);
}
function l3vrShowCopies() { l3vr.hid.forEach(id => { if (l3b.models.some(m => m.id === id)) l3bShow(id, true); }); l3vr.hid = []; }
/* ---- Läsa in versionerna ---- */
async function l3vrLoadOne(file, v) {
  const id = `v:${file.fileId}:${v.versionId}`;
  if (!l3b.models.some(m => m.id === id)) {
    const base = String(file.name || "modell").replace(/\.ifc(zip)?$/i, "");
    const w = { id, fileId: file.fileId, versionId: v.versionId, name: `${base} · v${v.no}`, plName: file.name, on: true, parentId: file.parentId || null, version: "v2:" + v.versionId, expectBytes: v.size || 0 };
    await l3bLoad([w]);
    if (!l3b.models.some(m => m.id === id)) throw new Error(`Version ${v.no} gick inte att läsa in.`);
    try { localStorage.setItem(l3bRememberKey(), JSON.stringify(l3bRememberedAll().filter(x => x.id !== id))); } catch (e) { /* privat läge */ }   // versionerna ska inte läsas in igen vid nästa start
  }
  return id;
}
async function l3vrRun() {
  const f = l3vr.file, vs = l3vr.versions || [], vA = vs.find(v => v.versionId === l3vr.A), vB = vs.find(v => v.versionId === l3vr.B);
  if (!f || !vA || !vB) { l3Status("Välj två versioner.", true); return; }
  if (vA.versionId === vB.versionId) { l3Status("Välj två olika versioner.", true); return; }
  if (l3b.busy) { l3Status("Vänta tills den andra modellen är inläst.", true); return; }
  l3vrClear(); l3vr.res = null; l3vr.sel = null; l3vr.props = null; l3vr.busy = "Läser in äldre version…"; l3vrRender();
  try {
    l3vr.ids.A = await l3vrLoadOne(f, vA); l3vr.busy = "Läser in nyare version…"; l3vrRender();
    l3vr.ids.B = await l3vrLoadOne(f, vB); l3vr.busy = "Jämför objekten…"; l3vrRender(); await l3vrTick();
    l3vr.res = await l3vrCompare(l3vrModel("A"), l3vrModel("B"), l3vr.tol);
    const sz = k => { const mm = typeof l3p !== "undefined" && l3p.mem ? l3p.mem.get(l3vr.ids[k]) : null; return mm && mm.blob ? mm.blob.size : 0; }; l3vr.own = { A: true, B: true }; l3vr.meta = { A: { label: `v${vA.no}`, date: l3vrDate(vA.modified), by: vA.by || "" }, B: { label: `v${vB.no}`, date: l3vrDate(vB.modified), by: vB.by || "" } }; l3vr.res.info = { A: { label: `v${vA.no}`, id: vA.versionId, no: vA.no, bytes: sz("A"), tris: l3vrModel("A").tris }, B: { label: `v${vB.no}`, id: vB.versionId, no: vB.no, bytes: sz("B"), tris: l3vrModel("B").tris } };
    l3vr.busy = ""; l3vrPlanMode(); l3vrApply(); l3vrFit();
    l3Status(`Jämförelse klar: ${l3vr.res.count.added} tillkomna, ${l3vr.res.count.removed} borttagna, ${l3vr.res.count.moved} flyttade, ${l3vr.res.count.reshaped} med ändrad form.`);
  } catch (e) { l3vr.busy = ""; console.warn("Versionsjämförelse", e); l3Status(String(e.message || e), true); }
  l3vrRender();
}
/* Jämför två modeller som redan är inlästa under 3D-modeller (valfria två, t.ex. två exporter från olika datum). De läses inte in igen och tas inte bort när jämförelsen stängs. */
async function l3vrRunLoaded() {
  const A = l3b.models.find(m => m.id === l3vr.ldA), B = l3b.models.find(m => m.id === l3vr.ldB);
  if (!A || !B) { l3Status("Välj två inlästa modeller.", true); return; }
  if (A.id === B.id) { l3Status("Välj två olika modeller.", true); return; }
  l3vrClose(); l3vr.ids = { A: A.id, B: B.id }; l3vr.own = { A: false, B: false }; l3vr.file = { fileId: null, name: A.name === B.name ? A.name : `${A.name} ↔ ${B.name}`, parentId: null };
  l3vr.sel = null; l3vr.props = null; l3vr.busy = "Jämför objekten…"; l3vrRender(); await l3vrTick();
  try {
    l3vr.res = await l3vrCompare(A, B, l3vr.tol);
    l3vr.meta = { A: { label: A.name, date: "", by: "" }, B: { label: B.name, date: "", by: "" } };
    l3vr.res.info = { local: true, A: { label: A.name, tris: A.tris, bytes: 0, local: true }, B: { label: B.name, tris: B.tris, bytes: 0, local: true } };
    l3vr.busy = ""; l3vrPlanMode(); l3vrApply(); l3vrFit();
    l3Status(`Jämförelse klar: ${l3vr.res.count.added} tillkomna, ${l3vr.res.count.removed} borttagna, ${l3vr.res.count.moved} flyttade, ${l3vr.res.count.reshaped} med ändrad form.`);
  } catch (e) { l3vr.busy = ""; console.warn("Jämförelse", e); l3Status(String(e.message || e), true); }
  l3vrRender();
}
function l3vrFit() { try { const bb = new THREE.Box3(); [l3vrModel("A"), l3vrModel("B")].forEach(m => m && m.meshes.forEach(x => { x.updateMatrixWorld(true); bb.expandByObject(x); })); if (!bb.isEmpty()) l3FlyTo(bb.getCenter(new THREE.Vector3()), Math.max(10, bb.getSize(new THREE.Vector3()).length()) * 0.95); } catch (e) { /* behåll vyn */ } }
async function l3vrClose(keepModels) {
  l3vrClear(); l3vrShowCopies(); if (l3vr.setOrig && typeof l3Original === "function" && l3b.orig) l3Original(false); l3vr.setOrig = false; const ids = [l3vr.own.A && l3vr.ids.A, l3vr.own.B && l3vr.ids.B].filter(Boolean);
  [l3vr.own.A ? null : l3vr.ids.A, l3vr.own.B ? null : l3vr.ids.B].filter(Boolean).forEach(id => { if (l3b.models.some(m => m.id === id)) l3bShow(id, true); });   // inlästa modeller som jämfördes tänds igen
  if (!keepModels) ids.forEach(id => { try { l3bForget(id); } catch (e) { /* redan borta */ } });
  l3vr.ids = { A: null, B: null }; l3vr.own = { A: false, B: false }; l3vr.res = null; l3vr.sel = null; l3vr.props = null; if (ids.length && !keepModels) { l3RenderLegend(); l3Render(); if (typeof l3LayersRender === "function") l3LayersRender(); }
}

/* ---- Trimble Connect: mappar och versioner ---- */
async function l3vrTcOpen(folderId, name) {
  const t = l3vr.tc; t.busy = true; t.err = ""; l3vrRender();
  try {
    const r = await askOpener("tcFolder", { folderId: folderId || null }, 30000); if (!r || !r.folderId) throw new Error("inget svar med mappar");
    if (!folderId) t.stack = [{ id: r.folderId, name: r.projectName || "Projektet" }]; else { const i = t.stack.findIndex(f => f.id === folderId); t.stack = i >= 0 ? t.stack.slice(0, i + 1) : [...t.stack, { id: folderId, name: name || "" }]; }
    t.items = r.items || [];
  } catch (e) { t.err = `Kunde inte läsa mapparna i Trimble Connect: ${e.message}`; }
  t.busy = false; l3vrRender();
}
async function l3vrPickFile(fileId, name, parentId) {
  l3vrClose(); l3vr.file = { fileId, name, parentId: parentId || null }; l3vr.versions = null; l3vr.pick = false; l3vr.busy = "Hämtar versionerna…"; l3vrRender();
  try {
    const r = await askOpener("tcVersions", { fileId }, 30000); l3vr.versions = (r && r.versions) || []; l3vr.keys = (r && r.keys) || [];
    const n = l3vr.versions.length; l3vr.B = n ? l3vr.versions[n - 1].versionId : ""; l3vr.A = n > 1 ? l3vr.versions[n - 2].versionId : "";
    if (!n) l3Status("Trimble Connect gav inga versioner för filen.", true);
  } catch (e) { l3vr.versions = []; l3Status(`Kunde inte läsa versionerna: ${e.message}`, true); }
  l3vr.busy = ""; l3vrRender();
}

/* ---- Panelen ---- */
function l3vrCss() {
  if (document.getElementById("v3VerCss")) return; const s = document.createElement("style"); s.id = "v3VerCss";
  s.textContent = `#view3d .v3-ver{bottom:auto;top:70px;max-height:calc(100% - 150px);width:380px}
#view3d .v3-ver .vr-tbl{width:100%;border-collapse:collapse;font-size:11px}#view3d .v3-ver .vr-tbl th,#view3d .v3-ver .vr-tbl td{padding:2px 4px;border-bottom:1px solid #e2e8f0;text-align:left;white-space:nowrap}
#view3d .v3-ver .vr-tbl td.n{text-align:right}#view3d .v3-ver .vr-kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:4px 0}
#view3d .v3-ver .vr-k{border:1px solid #e2e8f0;border-radius:8px;font-size:11px;background:#fff;text-align:left;display:flex;align-items:stretch;overflow:hidden}#view3d .v3-ver .vr-km{flex:1;border:0;background:none;text-align:left;padding:4px 6px;cursor:pointer;font-size:11px}#view3d .v3-ver .vr-km b{display:block;font-size:15px}#view3d .v3-ver .vr-ke{border:0;border-left:1px solid #e2e8f0;background:#f8fafc;cursor:pointer;padding:0 6px;font-size:12px}
#view3d .v3-ver .vr-k.off{opacity:.45}#view3d .v3-ver .vr-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}
#view3d .v3-ver .vr-list{max-height:220px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px}#view3d .v3-ver .vr-row{display:flex;gap:6px;align-items:baseline;padding:3px 6px;border-bottom:1px solid #f1f5f9;cursor:pointer;font-size:11px}
#view3d .v3-ver .vr-row.on{background:#fef9c3}#view3d .v3-ver .vr-row small{color:#64748b}#view3d .v3-ver .vr-tc{max-height:180px;overflow:auto;border:1px solid #e2e8f0;border-radius:8px}
#view3d .v3-ver .vr-tc button{display:block;width:100%;text-align:left;padding:3px 6px;border:0;border-bottom:1px solid #f1f5f9;background:#fff;font-size:11px;cursor:pointer}
#view3d .v3-ver .vr-bar{height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;display:flex;margin:2px 0}#view3d .v3-ver .vr-bar i{display:block;height:100%}`;
  document.head.appendChild(s);
}
const L3VR_PRESETS = [["Grundläggning", ["IFCFOOTING", "IFCPILE", "IFCPILECAP"]], ["Pelare och balkar", ["IFCCOLUMN", "IFCBEAM", "IFCMEMBER"]], ["Väggar", ["IFCWALL", "IFCWALLSTANDARDCASE"]], ["Plattor", ["IFCSLAB", "IFCPLATE"]], ["Armering", ["IFCREINFORCINGBAR", "IFCREINFORCINGMESH"]]];
/* Klass- och namnfiltret (gäller listan, 3D-vyn och HTML-exporten; kategorierna Tillkommit … styrs för sig). */
function l3vrInF(r) { const f = l3vr.filter, q = f.q.trim().toLowerCase(); return (!f.cls.size || f.cls.has(r.cls)) && (!q || (r.name + " " + r.cls + " " + r.why).toLowerCase().includes(q)); }
function l3vrRows() { const R = l3vr.res; if (!R) return []; return R.rows.filter(r => (!l3vr.filter.st || r.st === l3vr.filter.st) && l3vrInF(r)); }
function l3vrInfoHtml(inf) {
  const part = (k, x) => `${k} = ${l3vrEsc(x.label)} (${l3vrMb(x.bytes) || (x.bytes === 0 && x.local ? "" : "okänd storlek")}${x.bytes || !x.local ? ", " : ""}${(x.tris || 0).toLocaleString("sv-SE")} trianglar)`;
  return `<div class="fe-note">${inf.local ? "Jämför" : "Hämtat"}: ${part("A", inf.A)}, ${part("B", inf.B)}.${inf.local ? "" : ` Versions-id A ${l3vrEsc(String(inf.A.id).slice(0, 12))} / B ${l3vrEsc(String(inf.B.id).slice(0, 12))}.`}</div>`;
}
function l3vrRender() {
  const host = document.getElementById("v3Canvas"); let el = document.getElementById("v3Ver");
  if (!l3vr.open || !host) { if (el) el.remove(); return; }
  l3vrCss();
  if (!el) { el = document.createElement("div"); el.id = "v3Ver"; el.className = "v3-fe v3-vp v3-ver"; host.appendChild(el); ["pointerdown", "wheel", "contextmenu", "dblclick", "click", "keydown"].forEach(t => el.addEventListener(t, e => e.stopPropagation())); }
  const was = el.querySelector(".fe-body") ? el.querySelector(".fe-body").scrollTop : 0, clAll = el.querySelector(":scope > .cl-all"), R = l3vr.res, f = l3vr.file, vs = l3vr.versions, tc = l3vr.tc, e = l3vrEsc;
  const loaded = l3b.models.filter(m => m.src && m.src.fileId && !String(m.id).startsWith("v:"));
  let h = `<div class="fe-h"><b>🔀 Versioner och jämförelse</b><span>${f ? e(f.name) : ""}</span><button type="button" data-vr="dock" title="Docka till högermenyn">📌</button><button type="button" data-vr="x" title="Stäng (de inlästa versionerna tas bort)">✕</button></div><div class="fe-body">`;
  if (l3vr.busy) h += `<div class="fe-note"><span class="pm-spin"></span> ${e(l3vr.busy)}</div>`;
  h += `<div class="fe-row" style="margin-bottom:4px"><button type="button" data-vr="src" data-s="tc" class="${l3vr.src === "tc" ? "primary" : ""}">Versioner i Trimble Connect</button><button type="button" data-vr="src" data-s="loaded" class="${l3vr.src === "loaded" ? "primary" : ""}">Inlästa modeller</button></div>`;
  if (l3vr.src === "loaded") {
    const ms = l3b.models.filter(m => !String(m.id).startsWith("v:")), opt = v => ms.map(m => `<option value="${e(m.id)}"${v === m.id ? " selected" : ""}>${e(m.name)}${m.tris ? ` (${(m.tris / 1000).toFixed(0)}k)` : ""}</option>`).join("");
    h += `<div class="fe-sec"><div class="fe-sub">1. Välj två inlästa modeller</div><div class="fe-c">${ms.length < 2 ? `<div class="fe-note">Läs in minst två modeller under Lager → 3D-modeller (t.ex. två exporter av samma modell). Välj sedan äldre och nyare här.</div>` : `<label>Äldre (A)<select id="vrLdA"><option value="">Välj…</option>${opt(l3vr.ldA)}</select></label><label>Nyare (B)<select id="vrLdB"><option value="">Välj…</option>${opt(l3vr.ldB)}</select></label><div class="fe-row"><label>Tolerans (mm)<input id="vrTol" type="number" min="0" max="500" step="1" value="${l3vr.tol}"></label><button type="button" class="primary" data-vr="runl"${l3vr.busy ? " disabled" : ""}>Jämför</button></div><div class="fe-note">Modellerna läses inte in igen och tas inte bort när du stänger. Övriga modeller släcks under jämförelsen och tänds igen efteråt.</div>`}</div></div>`;
  } else {
  h += `<div class="fe-sec"><div class="fe-sub">1. Modell</div><div class="fe-c">`;
  if (loaded.length) h += `<div class="fe-row"><label>Inläst modell<select id="vrLoaded"><option value="">Välj…</option>${loaded.map(m => `<option value="${e(m.id)}"${f && m.src.fileId === f.fileId ? " selected" : ""}>${e(m.name)}</option>`).join("")}</select></label></div>`;
  h += `<div class="fe-row"><button type="button" data-vr="tc">${l3vr.pick ? "Dölj mapparna" : "Välj fil i Trimble Connect…"}</button></div>`;
  if (l3vr.pick) {
    if (tc.err) h += `<div class="fe-note" style="color:#b91c1c">${e(tc.err)}</div>`;
    if (tc.items) {
      h += `<div class="fe-note">${tc.stack.map((s, i) => `<a href="#" data-vr="dir" data-id="${e(s.id)}" data-nm="${e(s.name)}">${e(s.name)}</a>`).join(" › ")}</div><div class="vr-tc">`;
      tc.items.filter(x => x.type === "folder" || /\.ifc(zip)?$/i.test(x.name)).forEach(x => { h += x.type === "folder" ? `<button type="button" data-vr="dir" data-id="${e(x.id)}" data-nm="${e(x.name)}">📁 ${e(x.name)}</button>` : `<button type="button" data-vr="file" data-id="${e(x.id)}" data-nm="${e(x.name)}" data-par="${e(tc.stack.length ? tc.stack[tc.stack.length - 1].id : "")}">${e(x.name)} <small>${l3vrMb(x.size)}</small></button>`; });
      h += `</div>`;
    } else h += `<div class="fe-note">${tc.busy ? "Hämtar projektets mappar…" : "Trimble Connect svarar inte – är 4D-planering öppen?"}</div>`;
  }
  h += `</div></div>`;
  if (vs) {
    h += `<div class="fe-sec"><div class="fe-sub">2. Versioner (A = äldre, B = nyare)</div><div class="fe-c">${vs.length ? `<table class="vr-tbl"><tr><th>A</th><th>B</th><th>Vers.</th><th>Datum</th><th>Av</th><th></th></tr>${vs.slice().reverse().map(v => `<tr><td><input type="radio" name="vrA" value="${e(v.versionId)}"${l3vr.A === v.versionId ? " checked" : ""}></td><td><input type="radio" name="vrB" value="${e(v.versionId)}"${l3vr.B === v.versionId ? " checked" : ""}></td><td>v${v.no}</td><td>${e(l3vrDate(v.modified))}</td><td>${e(v.by)}</td><td class="n">${l3vrMb(v.size)}</td></tr>`).join("")}</table>` : `<div class="fe-note">Inga versioner hittades.</div>`}
      <div class="fe-row"><label>Tolerans (mm)<input id="vrTol" type="number" min="0" max="500" step="1" value="${l3vr.tol}"></label><button type="button" class="primary" data-vr="run"${l3vr.busy || !vs.length ? " disabled" : ""}>Läs in och jämför</button></div><div class="fe-note">Båda versionerna läses in som egna modeller (kan ta en stund). Inget ändras i Trimble Connect.</div></div></div>`;
  }
  }
  if (R) {
    const tot = R.rows.length || 1, dv = R.volB - R.volA;
    const inf = R.info, same = R.count.same === R.rows.length;
    h += `<div class="fe-sec"><div class="fe-sub">3. Resultat</div><div class="fe-c">${inf ? l3vrInfoHtml(inf) : ""}${same ? `<div class="fe-note" style="color:#b45309">Alla objekt är identiska. Antingen är versionerna lika, eller så levererade Trimble Connect samma fil för båda. Är storleken ovan densamma för A och B är det troligen det senare.</div>` : ""}<div class="vr-kpi">${L3VR_ORDER.map(k => `<div class="vr-k${!l3vr.show[k] ? " off" : ""}"><button type="button" class="vr-km" data-vr="selk" data-k="${k}" title="Markera alla ${L3VR_NAME[k].toLowerCase()} i 3D (Ctrl = lägg till i markeringen)"><span class="vr-dot" style="background:${L3VR_COL[k]}"></span>${L3VR_NAME[k]}<b>${R.count[k]}</b></button><button type="button" class="vr-ke" data-vr="show" data-k="${k}" title="Visa/dölj ${L3VR_NAME[k].toLowerCase()} i 3D">${l3vr.show[k] ? "👁" : "⊘"}</button></div>`).join("")}</div>
      <div class="fe-row"><button type="button" data-vr="iso" title="Visa bara de markerade objekten (som Isolera i editorn)">Isolera markerade</button><button type="button" data-vr="showall" title="Tänd alla kategorier och alla dolda objekt igen">Visa alla</button></div>
      <div class="fe-note">Tryck på en ruta för att markera objekten i 3D. Då kan du välja eller isolera dem. 👁 slår av och på kategorin.</div>
      <div class="vr-bar" title="Andel av objekten">${L3VR_ORDER.map(k => `<i style="width:${R.count[k] / tot * 100}%;background:${L3VR_COL[k]}"></i>`).join("")}</div>
      <div class="fe-note">Volym: ${R.volA.toFixed(1).replace(".", ",")} → ${R.volB.toFixed(1).replace(".", ",")} m³ (${dv >= 0 ? "+" : "−"}${Math.abs(dv).toFixed(1).replace(".", ",")} m³). ${R.reguid ? `${R.reguid} objekt hade fått nytt GUID och parades ihop på klass, namn och läge. ` : ""}${R.noGuid ? `${R.noGuid} delar saknar GUID och ingår inte.` : ""}</div>
      <label class="fe-chk" title="På: modellerna visas med sina egna färger, utan tidplanens färger, dolda temporära objekt eller Gantt-filter – som en vanlig viewer. Av: tidplanen färgar som vanligt (skillnadsfärgerna ligger ändå överst)."><input id="vrNoPlan" type="checkbox"${l3vr.noPlan ? " checked" : ""}> Visa som viewer – ignorera tidplanen</label>
      <div class="fe-row"><label>Visa<select id="vrView"><option value="diff"${l3vr.view === "diff" ? " selected" : ""}>Skillnader (färgat)</option><option value="overlay"${l3vr.view === "overlay" ? " selected" : ""}>Överlägg (äldre / nyare i egna färger)</option><option value="before"${l3vr.view === "before" ? " selected" : ""}>Bara äldre (A)</option><option value="after"${l3vr.view === "after" ? " selected" : ""}>Bara nyare (B)</option><option value="blink"${l3vr.view === "blink" ? " selected" : ""}>Blinka A / B</option><option value="swipe"${l3vr.view === "swipe" ? " selected" : ""}>Svep (delad bild)</option></select></label>
        ${l3vr.view === "diff" ? `<label title="Hur oförändrade objekt ritas när de är tända (knappen Oförändrat ovan slår av och på dem)">Oförändrat<select id="vrSame"><option value="ghost"${l3vr.same === "ghost" ? " selected" : ""}>Spöke</option><option value="grey"${l3vr.same === "grey" ? " selected" : ""}>Grått</option></select></label>` : ""}</div>
      ${l3vr.view === "overlay" ? `<div class="fe-row"><label>Äldre (A)<input id="vrColA" type="color" value="${l3vr.colA}"></label><label>Nyare (B)<input id="vrColB" type="color" value="${l3vr.colB}"></label></div><div class="fe-note">Där ytorna ligger på varandra syns nyare färgen. Äldre färgen syns där den äldre versionen har något som den nyare saknar eller har flyttat.</div>` : ""}
      ${l3vr.view === "diff" ? `<label class="fe-chk"><input id="vrOld" type="checkbox"${l3vr.old ? " checked" : ""}> Visa gammalt läge som röd skugga</label>` : ""}
      ${l3vr.view === "swipe" ? `<div class="fe-row"><label>Äldre ◀ ▶ Nyare<input id="vrSwipe" type="range" min="0" max="1" step="0.005" value="${l3vr.swipe}"></label><button type="button" data-vr="swaxis" title="Lägg svepet tvärs kamerans nuvarande riktning">Efter kameran</button></div>` : ""}
      ${l3vr.view === "blink" ? `<div class="fe-note vr-blinkl">Äldre (A)</div>` : ""}</div></div>`;
    h += `<div class="fe-sec"><div class="fe-sub">Per klass</div><div class="fe-c" style="max-height:150px;overflow:auto"><table class="vr-tbl"><tr><th>Klass</th><th class="n">+</th><th class="n">−</th><th class="n">Flytt</th><th class="n">Form</th><th class="n">m³</th></tr>${R.cls.filter(c => c.added || c.removed || c.moved || c.reshaped || c.renamed).map(c => `<tr data-vr="cls" data-c="${e(c.cls)}" style="cursor:pointer"><td>${e(l3vrClsName(c.cls))}</td><td class="n">${c.added || ""}</td><td class="n">${c.removed || ""}</td><td class="n">${c.moved || ""}</td><td class="n">${c.reshaped || ""}</td><td class="n">${c.dvol ? (c.dvol > 0 ? "+" : "−") + Math.abs(c.dvol).toFixed(2).replace(".", ",") : ""}</td></tr>`).join("") || `<tr><td colspan="6">Inga skillnader.</td></tr>`}</table></div></div>`;
    const rows = l3vrRows(), clsList = [...new Set(R.rows.map(r => r.cls))].sort();
    h += `<div class="fe-sec"><div class="fe-sub">Objekt (${rows.length})</div><div class="fe-c"><div class="fe-row"><label>Typ<select id="vrFSt"><option value="">Alla</option>${L3VR_ORDER.map(k => `<option value="${k}"${l3vr.filter.st === k ? " selected" : ""}>${L3VR_NAME[k]}</option>`).join("")}</select></label></div><div class="fe-row">${L3VR_PRESETS.map(([n, cl], i) => `<button type="button" data-vr="preset" data-i="${i}" class="${cl.length && cl.every(c => l3vr.filter.cls.has(c)) && l3vr.filter.cls.size === cl.length ? "primary" : ""}">${n}</button>`).join("")}<button type="button" data-vr="presetx">Alla klasser</button></div>
      <details><summary>Klasser (${l3vr.filter.cls.size ? l3vr.filter.cls.size + " valda" : "alla"})</summary><div style="max-height:130px;overflow:auto">${clsList.map(c => `<label class="fe-chk"><input type="checkbox" data-vr="clsck" data-c="${e(c)}"${l3vr.filter.cls.has(c) ? " checked" : ""}> ${e(l3vrClsName(c))}</label>`).join("")}</div></details>
      <input id="vrFQ" type="search" placeholder="Sök namn…" value="${e(l3vr.filter.q)}" style="width:100%">
      <div class="vr-list">${rows.slice(0, 300).map((r, i) => `<div class="vr-row${l3vr.sel === r.guid ? " on" : ""}" data-vr="row" data-g="${e(r.guid)}"><span class="vr-dot" style="background:${L3VR_COL[r.st]}"></span><span>${e(r.name || l3vrClsName(r.cls))}</span><small>${e(l3vrClsName(r.cls))}${r.why ? " · " + e(r.why) : ""}${r.reguid ? " · nytt GUID" : ""}</small></div>`).join("")}${rows.length > 300 ? `<div class="fe-note">…och ${rows.length - 300} till (filtrera för att se fler).</div>` : ""}</div>
      <div class="fe-row"><button type="button" data-vr="selall" title="Markera de filtrerade objekten i 3D">Markera i 3D</button><button type="button" data-vr="csv">Exportera CSV</button><button type="button" data-vr="html" title="Sparar de filtrerade objekten som en fristående HTML-fil med reglage och kategorifilter (ingen uppkoppling behövs)">Exportera HTML</button></div>`;
    const sel = l3vr.sel && R.rows.find(r => r.guid === l3vr.sel);
    if (sel) {
      h += `<div class="fe-sub">${e(sel.name || l3vrClsName(sel.cls))} – ${L3VR_NAME[sel.st]}</div>`;
      const mm = x => Math.round(x * 1000), dim = b => b ? `${mm(b.b[3] - b.b[0])} × ${mm(b.b[4] - b.b[1])} × ${mm(b.b[5] - b.b[2])} mm` : "–";
      h += `<table class="vr-tbl"><tr><th></th><th>Äldre (A)</th><th>Nyare (B)</th></tr><tr><td>Mått</td><td>${dim(sel.a)}</td><td>${dim(sel.b)}</td></tr><tr><td>Volym</td><td>${sel.a ? sel.a.vol.toFixed(3).replace(".", ",") + " m³" : "–"}</td><td>${sel.b ? sel.b.vol.toFixed(3).replace(".", ",") + " m³" : "–"}</td></tr><tr><td>Läge z</td><td>${sel.a ? sel.a.c[2].toFixed(3).replace(".", ",") : "–"}</td><td>${sel.b ? sel.b.c[2].toFixed(3).replace(".", ",") : "–"}</td></tr></table>`;
      if (l3vr.props && l3vr.props.guid === sel.guid) h += l3vr.props.rows ? (l3vr.props.rows.length ? `<table class="vr-tbl"><tr><th>Egenskap</th><th>Äldre</th><th>Nyare</th></tr>${l3vr.props.rows.map(p => `<tr><td>${e(p.k)}</td><td>${e(p.a)}</td><td>${e(p.b)}</td></tr>`).join("")}</table>` : `<div class="fe-note">Inga ändrade egenskaper.</div>`) : `<div class="fe-note"><span class="pm-spin"></span> Läser egenskaperna…</div>`;
      else h += `<div class="fe-row"><button type="button" data-vr="props">Visa ändrade egenskaper</button></div>`;
    }
    h += `</div></div>`;
  }
  h += `</div>`;
  el.innerHTML = h; if (clAll) el.prepend(clAll);
  const b = el.querySelector(".fe-body"); if (b) b.scrollTop = was; l3vrBind(el);
}
function l3vrSelect(g, zoom) {
  const r = l3vr.res && l3vr.res.rows.find(x => x.guid === g); if (!r) return; l3vr.sel = g; l3vr.props = null;
  const t = r.b && r.st !== "removed" ? r.b : r.a; if (t && typeof l3bsSet === "function") { l3bsSet([{ mesh: t.mesh, ri: t.ri }]); if (zoom && typeof l3bsZoom === "function") l3bsZoom(); }
}
function l3vrCsv(rows) {
  const q = v => { v = String(v == null ? "" : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }, n = x => (x == null ? "" : String(Math.round(x * 1e6) / 1e6).replace(".", ","));
  const L = [["Typ", "Namn", "Klass", "GUID", "Anmärkning", "Flytt (m)", "Volym A (m³)", "Volym B (m³)", "Volymskillnad (m³)", "Nytt GUID"].map(q).join(";")];
  rows.forEach(r => L.push([L3VR_NAME[r.st], r.name, r.cls, r.guid, r.why, n(r.dpos), r.a ? n(r.a.vol) : "", r.b ? n(r.b.vol) : "", n(r.dvol), r.reguid ? "ja" : ""].map(q).join(";")));
  const f = l3vr.file, blob = new Blob(["﻿" + L.join("\r\n")], { type: "text/csv;charset=utf-8" }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `Versionsjamforelse ${f ? f.name.replace(/\.ifc(zip)?$/i, "") : ""}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
/* ---- HTML-export: de filtrerade objekten (alla kategorier) med geometri för båda versionerna i en fristående fil med 3D-visare ---- */
function l3vrB64(buf) { const u = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
function l3vrGeom(t, O) {   // { mesh, ri } → { p, i } (hörn relativt O, trianglar)
  const u = t.mesh.userData.l3b, pos = t.mesh.geometry.getAttribute("position").array, idx = u.origIdx, [s, c] = l3bsIdx(t.mesh, t.ri); t.mesh.updateMatrixWorld(true); const M = t.mesh.matrixWorld.elements;
  const map = new Map(), P = [], I = [];
  for (let i = s; i < s + c; i++) { const v = idx[i]; let k = map.get(v); if (k === undefined) { k = map.size; map.set(v, k); const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2]; P.push(M[0] * x + M[4] * y + M[8] * z + M[12] - O[0], M[1] * x + M[5] * y + M[9] * z + M[13] - O[1], M[2] * x + M[6] * y + M[10] * z + M[14] - O[2]); } I.push(k); }
  return { p: l3vrB64(new Float32Array(P)), i: l3vrB64(new Uint32Array(I)), tris: Math.floor(I.length / 3) };
}
async function l3vrExportHtml() {
  const R = l3vr.res, f = l3vr.file; if (!R || !f) return;
  const rows = R.rows.filter(l3vrInF), tris = rows.reduce((n, r) => n + (r.a ? 1 : 0) + (r.b ? 1 : 0), 0);
  if (!rows.length) { l3Status("Inga objekt matchar filtret – inget att exportera.", true); return; }
  if (rows.length > 40000 && typeof uiConfirm === "function" && !(await uiConfirm(`${rows.length} objekt ger en stor fil (kan bli flera hundra MB). Filtrera på klass först, till exempel Grundläggning. Exportera ändå?`, { ok: "Exportera" }))) return;
  l3Status("Bygger HTML-filen…"); await l3vrTick();
  const first = rows.find(r => r.b || r.a), t0 = first.b || first.a; t0.mesh.updateMatrixWorld(true); const e0 = t0.mesh.matrixWorld.elements, p0 = t0.mesh.geometry.getAttribute("position").array, v0 = t0.mesh.userData.l3b.origIdx[l3bsIdx(t0.mesh, t0.ri)[0]];
  const O = [e0[0] * p0[v0 * 3] + e0[4] * p0[v0 * 3 + 1] + e0[8] * p0[v0 * 3 + 2] + e0[12], e0[1] * p0[v0 * 3] + e0[5] * p0[v0 * 3 + 1] + e0[9] * p0[v0 * 3 + 2] + e0[13], e0[2] * p0[v0 * 3] + e0[6] * p0[v0 * 3 + 1] + e0[10] * p0[v0 * 3 + 2] + e0[14]];
  const objs = []; let tt = 0, n = 0;
  for (const r of rows) {
    const a = r.a ? l3vrGeom(r.a, O) : null, b = r.b ? l3vrGeom(r.b, O) : null; tt += (a ? a.tris : 0) + (b ? b.tris : 0);
    objs.push({ n: r.name, c: r.cls, s: r.st, w: r.why, va: r.a ? Math.round(r.a.vol * 1e4) / 1e4 : null, vb: r.b ? Math.round(r.b.vol * 1e4) / 1e4 : null, re: r.reguid ? 1 : 0, a: a && { p: a.p, i: a.i }, b: b && { p: b.p, i: b.i } });
    if (++n % 400 === 0) await l3vrTick();
  }
  const mt = l3vr.meta || { A: {}, B: {} }, clsNames = {}; rows.forEach(r => { clsNames[r.cls] = l3vrClsName(r.cls); });
  const count = {}; L3VR_ORDER.forEach(k => { count[k] = 0; }); rows.forEach(r => { count[r.st]++; });
  const data = { colors: L3VR_COL, names: L3VR_NAME, order: L3VR_ORDER, clsNames, objs, meta: { file: f.name, A: { label: mt.A.label || "A", date: mt.A.date || "", by: mt.A.by || "" }, B: { label: mt.B.label || "B", date: mt.B.date || "", by: mt.B.by || "" }, exported: new Date().toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }), tol: R.tol, counts: count, tris: tt } };
  const get = async u => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} (${r.status})`); return r.text(); };
  const [tpl, three, orbit] = await Promise.all([get("lagesplan-3dver-viewer.html"), get("vendor/three/three.min.js"), get("vendor/three/OrbitControls.js")]);
  const safe = t => t.replace(/<\/(script)/gi, "<\\/$1");
  const html = tpl.replace("/*__THREE__*/", () => safe(three)).replace("/*__ORBIT__*/", () => safe(orbit)).replace("/*__DATA__*/null", () => safe(JSON.stringify(data)));
  const name = `Versionsjamforelse ${String(f.name).replace(/\.ifc(zip)?$/i, "")} ${String(mt.A.label || "A").slice(0, 30)}-${String(mt.B.label || "B").slice(0, 30)}${l3vr.filter.cls.size ? " " + [...l3vr.filter.cls].map(c => l3vrClsName(c)).join("+").slice(0, 40) : ""}.html`.replace(/[\\/:*?"<>|]/g, "_");
  const blob = new Blob([html], { type: "text/html;charset=utf-8" }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  l3Status(`HTML sparad: ${rows.length} objekt, ${(tt / 1000).toFixed(0)} tusen trianglar, ${(blob.size / 1048576).toFixed(1).replace(".", ",")} MB.`);
  return { name, size: blob.size, html };
}
function l3vrBind(el) {
  const q = s => el.querySelector(s), on = (s, f) => { const x = q(s); if (x) x.onchange = f; };
  on("#vrLoaded", ev => { const m = l3b.models.find(x => x.id === ev.target.value); if (m && m.src) l3vrPickFile(m.src.fileId, String(m.name).replace(/ · v\d+$/, ""), m.src.parentId); });
  el.querySelectorAll('input[name="vrA"]').forEach(i => { i.onchange = () => { l3vr.A = i.value; }; }); el.querySelectorAll('input[name="vrB"]').forEach(i => { i.onchange = () => { l3vr.B = i.value; }; });
  on("#vrLdA", ev => { l3vr.ldA = ev.target.value; }); on("#vrLdB", ev => { l3vr.ldB = ev.target.value; });
  on("#vrTol", ev => { l3vr.tol = Math.max(0, Number(ev.target.value) || 5); });
  on("#vrNoPlan", ev => { l3vr.noPlan = ev.target.checked; l3vrPlanMode(); l3vrApply(); });
  on("#vrView", ev => { l3vr.view = ev.target.value; l3vrApply(); l3vrRender(); });
  on("#vrSame", ev => { l3vr.same = ev.target.value; l3vrApply(); });
  on("#vrColA", ev => { l3vr.colA = ev.target.value; l3vrApply(); }); on("#vrColB", ev => { l3vr.colB = ev.target.value; l3vrApply(); });
  on("#vrOld", ev => { l3vr.old = ev.target.checked; l3vrApply(); });
  on("#vrFSt", ev => { l3vr.filter.st = ev.target.value; l3vrRender(); });
  const fq = q("#vrFQ"); if (fq) { fq.onkeydown = ev => ev.stopPropagation(); fq.onchange = () => { l3vr.filter.q = fq.value; l3vrApply(); l3vrRender(); }; }
  const sw = q("#vrSwipe"); if (sw) sw.oninput = () => { l3vr.swipe = Number(sw.value); l3vrSwipeMove(); };
  el.querySelectorAll('[data-vr="clsck"]').forEach(i => { i.onchange = () => { if (i.checked) l3vr.filter.cls.add(i.dataset.c); else l3vr.filter.cls.delete(i.dataset.c); l3vrApply(); l3vrRender(); }; });
  el.onclick = async ev => {
    const b = ev.target.closest("[data-vr]"); if (b && b.dataset.vr === "clsck") return; if (!b) return; const a = b.dataset.vr, R = l3vr.res; if (b.tagName === "A") ev.preventDefault();
    if (a === "dock") { if (typeof l3dkToggle === "function") l3dkToggle(); }
    else if (a === "x") l3vrToggle(false);
    else if (a === "tc") { l3vr.pick = !l3vr.pick; if (l3vr.pick && !l3vr.tc.items) l3vrTcOpen(null); else l3vrRender(); }
    else if (a === "dir") l3vrTcOpen(b.dataset.id, b.dataset.nm);
    else if (a === "file") l3vrPickFile(b.dataset.id, b.dataset.nm, b.dataset.par);
    else if (a === "run") l3vrRun();
    else if (a === "runl") l3vrRunLoaded();
    else if (a === "src") { l3vr.src = b.dataset.s; if (l3vr.src === "loaded" && !l3vr.ldA) { const ms = l3b.models.filter(m => !String(m.id).startsWith("v:")); l3vr.ldA = ms[0] ? ms[0].id : ""; l3vr.ldB = ms[1] ? ms[1].id : ""; } l3vrRender(); }
    else if (a === "show") { const k = b.dataset.k; l3vr.show[k] = l3vr.show[k] ? 0 : 1; l3vrApply(); l3vrRender(); }
    else if (a === "selk") { const k = b.dataset.k; if (R) { if (!l3vr.show[k]) { l3vr.show[k] = 1; l3vrApply(); } const add = ev.ctrlKey || ev.metaKey || ev.shiftKey, list = R.rows.filter(r => r.st === k).map(r => (r.b && r.st !== "removed" ? r.b : r.a)).filter(Boolean).map(t => ({ mesh: t.mesh, ri: t.ri })); const all = add ? [...l3bs.sel.map(x => ({ mesh: x.mesh, ri: x.ri })), ...list] : list; l3bsSet(all.slice(0, 30000)); if (list.length) l3bsZoom(); l3Status(`${list.length} ${L3VR_NAME[k].toLowerCase()} markerade.`); l3vrRender(); } }
    else if (a === "iso") { if (l3bs.sel.length && typeof l3bsIsolate === "function") l3bsIsolate(); else l3Status("Markera något först (tryck på en kategori eller en rad).", true); }
    else if (a === "showall") { L3VR_ORDER.forEach(k => { l3vr.show[k] = 1; }); if (typeof l3bShowAllRanges === "function") l3bShowAllRanges(); l3vrApply(); l3vrRender(); }
    else if (a === "swaxis") { l3vrSwipeOn(); }
    else if (a === "cls") { const c = b.dataset.c; if (l3vr.filter.cls.has(c)) l3vr.filter.cls.delete(c); else l3vr.filter.cls.add(c); l3vrApply(); l3vrRender(); }
    else if (a === "preset") { const cl = L3VR_PRESETS[Number(b.dataset.i)][1], have = [...new Set(R.rows.map(r => r.cls))].filter(c => cl.includes(c)); l3vr.filter.cls = new Set(have.length ? have : cl); if (!have.length) l3Status("Inga objekt av de klasserna i den här filen.", true); l3vrApply(); l3vrRender(); }
    else if (a === "presetx") { l3vr.filter.cls = new Set(); l3vrApply(); l3vrRender(); }
    else if (a === "row") { l3vrSelect(b.dataset.g, true); l3vrRender(); }
    else if (a === "selall") { const list = l3vrRows().map(r => (r.b && r.st !== "removed" ? r.b : r.a)).filter(Boolean).map(t => ({ mesh: t.mesh, ri: t.ri })); if (list.length) { l3bsSet(list.slice(0, 30000)); l3bsZoom(); } }
    else if (a === "csv") { if (R) l3vrCsv(l3vrRows()); }
    else if (a === "html") { if (R) l3vrExportHtml().catch(er => l3Status(`HTML-exporten misslyckades: ${er.message}`, true)); }
    else if (a === "props") { const r = R && R.rows.find(x => x.guid === l3vr.sel); if (!r) return; l3vr.props = { guid: r.guid, rows: null }; l3vrRender(); try { l3vr.props = { guid: r.guid, rows: await l3vrPropDiff(r) || [] }; } catch (er) { l3vr.props = { guid: r.guid, rows: [] }; l3Status(`Egenskaperna gick inte att läsa: ${er.message}`, true); } l3vrRender(); }
  };
}
function l3vrToggle(on = !l3vr.open) { l3vr.open = on; if (!on) l3vrClose(); l3vrRender(); }
function l3vrBtn() {
  const host = document.getElementById("view3d"); if (!host) return; let b = document.getElementById("v3VerBtn");
  if (!b) { b = document.createElement("button"); b.type = "button"; b.id = "v3VerBtn"; b.className = "v3-bridge v3-rnb"; b.textContent = "🔀 Versioner"; b.title = "Välj versioner av en modell ur Trimble Connect och jämför dem"; b.onclick = () => l3vrToggle(); const ft = host.querySelector(".v3-foot"), st = document.getElementById("v3Status"); if (ft && st && st.parentNode === ft) ft.insertBefore(b, st); else if (ft) ft.appendChild(b); }
}
(function l3vrBoot() { const tick = () => { if (document.getElementById("view3d") && typeof l3 !== "undefined" && l3 && l3.renderer) l3vrBtn(); setTimeout(tick, 2500); }; setTimeout(tick, 2000); })();
