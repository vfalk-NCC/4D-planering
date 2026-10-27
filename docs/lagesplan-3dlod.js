/* 3D-vyn – förenklad bild medan kameran rör sig (Victor 2026-10-27: "när jag har prefab, stål och byggmodell tända blir
   3D-editorn segmanövrerad … optimera alla parametrar utan att ta bort några funktioner").

   I en stor byggmodell är de flesta objekten små (skruvar, plåtar, armering, beslag) men står för det mesta av trianglarna.
   Medan man snurrar, panorerar eller zoomar ritas därför bara de objekt som är större än några bildpunkter i den aktuella
   zoomnivån (tre fasta nivåer av storlek). Så fort kameran stannat (ca 0,2 s) ritas allt igen – inget tas bort ur modellen,
   inget ändras i urval, dolda objekt, färger eller träffar.

   – Indexlistan per modellbit byts mot en kortare (delmängd av originalet) och tillbaka. Listorna räknas en gång per nivå
     och bit och kastas när biten ändras (dölj/visa, tid, opacitet).
   – Det rumsliga indexet för träffar (BVH) bygger på den fulla listan: träffar och indexbygge återställer biten först.
   – Av/på: Lager → modellernas inställningar → Prestanda. Bara för stora scener (över ca 0,8 miljoner synliga trianglar). */

const l3lod = { level: -1, ema: 16, last: 0, f: 1, tris: 0, trisAt: 0 };
const L3LOD_THR = [0.35, 1.5, 6];            // minsta objektdiagonal (m) per nivå
const L3LOD_MIN_TRIS = 8e5;                  // under det här ritas alltid allt
const l3lodOn = () => !(typeof l3Prefs === "function" && l3Prefs().lod === false);

function l3lodMeshes() {
  const out = [];
  if (typeof l3b === "undefined") return out;
  l3b.models.forEach(m => { if (m.visible) m.meshes.forEach(x => { if (x.visible && x.userData.l3b && !x.userData.bcopy && x.geometry && x.geometry.index) out.push(x); }); });
  return out;
}
function l3lodTris() {
  const now = performance.now();
  if (now - l3lod.trisAt < 400) return l3lod.tris;
  let n = 0; l3b.models.forEach(m => { if (m.visible) n += m.tris || 0; });
  l3lod.tris = n; l3lod.trisAt = now; return n;
}
/* Objektens diagonal (m), en gång per bit. */
function l3lodDiag(mesh) {
  const u = mesh.userData.l3b; if (u.diag) return u.diag;
  const P = mesh.geometry.getAttribute("position").array, R = u.ranges, d = new Float32Array(R.length);
  for (let k = 0; k < R.length; k++) {
    const r = R[k]; let x0 = 1e30, y0 = 1e30, z0 = 1e30, x1 = -1e30, y1 = -1e30, z1 = -1e30;
    for (let i = r.start * 3, e = (r.start + r.count) * 3; i < e; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    d[k] = r.count ? Math.hypot(x1 - x0, y1 - y0, z1 - z0) : 0;
  }
  return (u.diag = d);
}
/* Indexlistan för en nivå (null = ingen vinst eller går inte att räkna). */
function l3lodAttr(mesh, lv) {
  const u = mesh.userData.l3b; if (!u.lod) u.lod = [];
  if (u.lod[lv] !== undefined) return u.lod[lv];
  const sl = l3bSlices(mesh), src = u.origIdx;
  if (!sl || !src) return (u.lod[lv] = null);
  const diag = l3lodDiag(mesh), thr = L3LOD_THR[lv];
  const gone = new Set([...u.hidden, ...(u.tempOff || []), ...(u.animOff || []), ...(u.mtHide || []), ...(u.lyHide || []), ...(u.gAlpha ? u.gAlpha.keys() : []), ...(u.alpha ? u.alpha.keys() : [])]);
  const idx = l3bSliceIdx(mesh, ri => !gone.has(ri) && diag[ri] >= thr);
  const cur = u.lodFull ? u.lodFull.count : mesh.geometry.index.count;
  if (!idx || !idx.length || idx.length > cur * 0.8) return (u.lod[lv] = null);   // för lite att tjäna / allt skulle försvinna
  return (u.lod[lv] = new THREE.BufferAttribute(idx, 1));
}
function l3lodRestoreMesh(mesh) {
  const u = mesh && mesh.userData.l3b; if (!u || !u.lodOn) return;
  u.lodOn = false; if (u.lodFull) mesh.geometry.index = u.lodFull; u.lodFull = null;
}
/* Biten ändras (dölj/visa, tid, opacitet): listorna är inte längre riktiga. Anropas av l3bApplyHidden. */
function l3lodInvalidate(mesh) {
  const u = mesh.userData.l3b; if (!u) return;
  u.lodOn = false; u.lodFull = null; u.lod = null;
}
/* Nivån läggs på bit för bit; räknar en bit för länge läggs resten på i nästa bild (inget hack när man börjar snurra). */
function l3lodApply(level) {
  if (level === l3lod.level && !l3lod.partial) return;
  l3lod.level = level; l3lod.partial = false;
  const t0 = performance.now();
  l3lodMeshes().forEach(mesh => {
    const u = mesh.userData.l3b;
    if (level < 0) { l3lodRestoreMesh(mesh); return; }
    let a;
    if (u.lod && u.lod[level] !== undefined) a = u.lod[level];
    else if (performance.now() - t0 < 6) a = l3lodAttr(mesh, level);
    else { l3lod.partial = true; return; }
    if (!a) { l3lodRestoreMesh(mesh); return; }
    if (!u.lodOn) u.lodFull = mesh.geometry.index;
    mesh.geometry.index = a; u.lodOn = true;
  });
}
/* Förberäknar listorna när sidan är ledig (efter inläsning och när kameran stannat). */
let l3lodWarmBusy = false;
function l3lodWarm() {
  if (l3lodWarmBusy || !l3lodOn() || l3lodTris() < L3LOD_MIN_TRIS) return;
  const todo = [];
  l3lodMeshes().forEach(m => { const u = m.userData.l3b; for (let lv = 0; lv < L3LOD_THR.length; lv++) if (!u.lod || u.lod[lv] === undefined) todo.push([m, lv]); });
  if (!todo.length) return;
  l3lodWarmBusy = true;
  const idle = window.requestIdleCallback || (f => setTimeout(() => f({ timeRemaining: () => 8 }), 30));
  const step = dl => {
    if (l3CamLast.moving) { setTimeout(() => idle(step), 400); return; }
    while (todo.length && (!dl || dl.timeRemaining() > 3)) { const [m, lv] = todo.shift(); if (m.parent && !m.userData.l3b.lodOn) l3lodAttr(m, lv); }
    if (todo.length) idle(step); else l3lodWarmBusy = false;
  };
  idle(step);
}
function l3lodRestoreAll() { l3lodApply(-1); }
/* Vilken nivå som passar zoomen: objekt under ca 3 bildpunkter ritas inte medan kameran rör sig. */
function l3lodPick() {
  if (!l3lodOn() || l3lodTris() < L3LOD_MIN_TRIS) return -1;
  if (typeof l3pl !== "undefined" && l3pl.rec) return -1;   // filminspelning: alla bilder ritas fullt
  const r = l3.renderer, cam = l3.camera, H = r.getDrawingBufferSize(new THREE.Vector2()).y || 800;
  let ppm;
  if (cam.isOrthographicCamera) ppm = H / Math.max(1e-6, (cam.top - cam.bottom) / (cam.zoom || 1));
  else ppm = H / (2 * Math.max(0.5, cam.position.distanceTo(l3.orbit.target)) * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
  // Går bildtiden dåligt tas fler små objekt bort; går den bra släpps fler in igen (som punktmolnens budget).
  const px = 3 * Math.min(3, Math.max(0.7, l3lod.ema / 22)), thrM = px / Math.max(1e-6, ppm);
  let lv = -1; for (let i = 0; i < L3LOD_THR.length; i++) if (L3LOD_THR[i] <= thrM) lv = i;
  return lv;
}
