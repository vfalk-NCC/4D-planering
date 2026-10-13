/* Markering av pågående objekt i 3D (Victor 2026-10-13): de objekt vars aktivitet pågår (eller är försenad) det valda
   datumet får en tydlig gul kontur – som markeringen av ett valt objekt, men utan att något behöver väljas.
   Ett val under 4D-planering (Pågående: kontur). Konturerna räknas i bakgrunden i små portioner och sparas per objekt. */
const L3ACT_COL = 0xffc400, L3ACT_MAX = 6000;
const l3act = { ov: [], gen: 0, timer: null };
const l3actOn = () => !!(typeof l3Prefs === "function" && l3Prefs().actOutline);
function l3actClear() {
  l3act.gen++; // avbryter pågående beräkning
  l3act.ov.forEach(o => {
    if (o.parent) o.parent.remove(o);
    if (o.userData.actShared) o.geometry.deleteAttribute("position"); // punkterna tillhör biten
    o.geometry.dispose(); o.material.dispose();
  });
  l3act.ov = [];
}
function l3actSchedule() { clearTimeout(l3act.timer); l3act.timer = setTimeout(l3actRebuild, 250); }
function l3actActive(r, at) {
  if (!r) return false;
  if (typeof rowTempOffAt === "function" && rowTempOffAt(r, at)) return false;
  const ph = l3Phase(r);
  return ph === "pagaende" || ph === "forsenad";
}
function l3actLine(geom, shared) {
  const line = new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ color: L3ACT_COL, transparent: true, opacity: 1 }));
  line.renderOrder = 7; line.raycast = () => {}; line.userData.noHit = true; line.userData.actEdge = true; line.userData.actShared = !!shared;
  return line;
}
function l3actRebuild() {
  l3actClear();
  if (!l3 || !l3.scene) return;
  if (!l3actOn()) { l3Render(); return; }
  const at = (document.getElementById("dateInput") && document.getElementById("dateInput").value) || todayIso();
  const byId = new Map((items || []).map(r => [r.id, r]));
  // Placerade objekt (kranar, bodar …).
  if (l3.placeMeshes) l3.placeMeshes.forEach((grp, id) => {
    const p = (typeof placements !== "undefined" ? placements : []).find(x => x.id === id);
    if (!p || !p.itemId || !l3actActive(byId.get(p.itemId), at)) return;
    grp.traverse(o => {
      if (!o.isMesh || o.userData.selEdge || o.userData.noHit || o.userData.actEdge || !o.geometry) return;
      const e = l3actLine(new THREE.EdgesGeometry(o.geometry, 30), false); o.add(e); l3act.ov.push(e);
    });
  });
  // IFC-objekt i byggnaden: en kontur per objekt i biten, räknad i bakgrunden.
  const work = []; let total = 0;
  if (typeof l3b !== "undefined" && typeof l3bsObjEdges === "function") l3b.models.filter(m => m.visible).forEach(m => m.meshes.forEach(mesh => {
    const u = mesh.userData.l3b; if (!u || !u.ranges || !mesh.visible) return;
    const ris = [];
    u.ranges.forEach((r, ri) => { if (total < L3ACT_MAX && r.itemId && l3actActive(byId.get(r.itemId), at)) { ris.push(ri); total++; } });
    if (ris.length) work.push([mesh, ris]);
  }));
  l3act.count = total;
  const gen = l3act.gen;
  let wi = 0, k = 0, acc = [];
  const flush = mesh => {
    let n = 0; acc.forEach(a => { n += a.length; });
    if (n) {
      const idx = new Uint32Array(n); let o = 0; acc.forEach(a => { idx.set(a, o); o += a.length; });
      const g = new THREE.BufferGeometry(); g.setAttribute("position", mesh.geometry.getAttribute("position")); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere();
      const line = l3actLine(g, true); mesh.add(line); l3act.ov.push(line);
    }
    acc = [];
  };
  const step = () => {
    if (gen !== l3act.gen) return;
    const t0 = performance.now();
    while (wi < work.length && performance.now() - t0 < 12) {
      const [mesh, ris] = work[wi];
      for (let n = 0; k < ris.length && n < 64; n++, k++) acc.push(l3bsObjEdges(mesh, ris[k]));
      if (k >= ris.length) { flush(mesh); k = 0; wi++; l3Render(); }
    }
    if (wi < work.length) setTimeout(step, 0);
  };
  step();
  l3Render();
}
