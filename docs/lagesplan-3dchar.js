/* 3D-vyns gå-läge i tredje person – figurer (Victor 2026-10-22: "gör gubben mycket mer realistisk … NCC-logga … jag vill kunna vara en stor mobilkran, grävmaskin eller andra objekt").
   Allt byggs av enkla former (inga filer): byggare med hjälm, varselväst och NCC-logga, mobilkran, grävmaskin, lastbil med tipp, hjullastare, samt "Markerat objekt"
   (en kopia av det markerade placerade objektet). Origo = markens mitt under figuren, +X = framåt, +Z = upp, enheter meter.
   l3cBuild(kind) → { g, cfg, update(st) }; st = { moving, phase, speed, crouch, jz, work (0–1), t, travel }. */

const L3C_KINDS = [["human", "Byggare"], ["crane", "Mobilkran"], ["excavator", "Grävmaskin"], ["truck", "Lastbil"], ["loader", "Hjullastare"], ["own", "Markerat objekt"]];
const L3C_CFG = {
  human: { steer: 3.0, eye: 1.7, camD: 3.2, camUp: 0.25, speedMul: 1, turn: 14, radius: 0.3, step: 0.6 },
  crane: { steer: 0.9, eye: 3.6, camD: 20, camUp: 3.6, speedMul: 3.6, turn: 1.0, radius: 1.7, step: 0.35, vehicle: true },
  excavator: { steer: 1.3, eye: 2.6, camD: 11, camUp: 2.2, speedMul: 1.6, turn: 1.3, radius: 1.8, step: 0.35, vehicle: true },
  truck: { steer: 1.0, eye: 2.8, camD: 13, camUp: 2.4, speedMul: 4, turn: 1.2, radius: 1.6, step: 0.35, vehicle: true },
  loader: { steer: 1.3, eye: 2.7, camD: 11, camUp: 2.2, speedMul: 3, turn: 1.5, radius: 1.6, step: 0.4, vehicle: true },
  own: { steer: 2.0, eye: 2, camD: 9, camUp: 1.5, speedMul: 2, turn: 3, radius: 1, step: 0.4, vehicle: true },
};
const l3cTex = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; };
/* NCC-loggan som text i bolagets blå: på västens rygg och bröst och som klistermärke på hjälmen. */
function l3cLogoTex(onWhite) {
  return l3cTex(256, 96, (g, w, h) => {
    if (onWhite) { g.fillStyle = "#ffffff"; g.beginPath(); if (g.roundRect) g.roundRect(0, 0, w, h, 14); else g.rect(0, 0, w, h); g.fill(); }
    g.fillStyle = "#0b3d91"; g.font = "900 82px Arial Black, Arial, Helvetica, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("NCC", w / 2, h / 2 + 4);
  });
}
const l3cPh = (c, shin) => new THREE.MeshPhongMaterial({ color: c, shininess: shin == null ? 25 : shin, specular: 0x222222 });
/* Vänder en plan (som standard +Z-normal) så att den vetter åt "normal" med texten rättvänd (upp = +Z). */
function l3cFace(m, nx, ny, nz) { const n = new THREE.Vector3(nx, ny, nz), up = new THREE.Vector3(0, 0, 1), r = new THREE.Vector3().crossVectors(up, n).normalize(); m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, new THREE.Vector3().crossVectors(n, r), n)); return m; }
function l3cMark(g) { g.traverse(o => { o.userData.noHit = true; o.renderOrder = 5; }); return g; }
function l3cCyl(rt, rb, h, mat, axis) { const geo = new THREE.CylinderGeometry(rt, rb, h, 14); if (axis !== "y") { geo.rotateX(Math.PI / 2); geo.translate(0, 0, -h / 2); } return new THREE.Mesh(geo, mat); } // hänger nedåt från origo (axel Z) eller axel Y
const l3cBox = (w, d, h, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), mat); m.position.set(x, y, z); return m; };
const l3cSph = (sx, sy, sz, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); return m; };
const l3cGrp = (x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); return g; };

/* ---- Byggare ------------------------------------------------------------------------------------------------------------------------------- */
function l3cHuman() {
  const g = new THREE.Group(), skin = l3cPh(0xdcae8a, 8), pants = l3cPh(0x474036, 6), pantsD = l3cPh(0x2f2a24, 6), boot = l3cPh(0x25221f, 30), sole = l3cPh(0x8d6b3b, 4), shirt = l3cPh(0x1d2126, 6), vest = l3cPh(0xff6a10, 50), refl = new THREE.MeshPhongMaterial({ color: 0xdfe3e8, shininess: 140, specular: 0xffffff, emissive: 0x333333 }), helm = l3cPh(0xffd21a, 90), glove = l3cPh(0x383d43, 10), dark = l3cPh(0x16181b, 5), belt = l3cPh(0x2a2118, 10);
  const HZ = 0.945, hips = l3cGrp(0, 0, HZ); g.add(hips);
  // ben: höft → knä → fot
  const leg = side => {
    const hip = l3cGrp(0, side * 0.095, 0), thigh = l3cCyl(0.098, 0.07, 0.44, pants); hip.add(thigh); hip.add(l3cSph(0.1, 0.1, 0.1, pants, 0, 0, 0));
    const knee = l3cGrp(0, 0, -0.44); hip.add(knee); knee.add(l3cSph(0.072, 0.072, 0.072, pants, 0, 0, 0)); const shin = l3cCyl(0.068, 0.05, 0.4, pants); knee.add(shin); knee.add(l3cBox(0.03, 0.09, 0.1, pantsD, 0.062, 0, -0.04));
    const foot = l3cGrp(0, 0, -0.4); knee.add(foot); foot.add(l3cBox(0.27, 0.105, 0.1, boot, 0.06, 0, -0.04)); foot.add(l3cSph(0.07, 0.052, 0.05, boot, 0.17, 0, -0.04)); foot.add(l3cBox(0.285, 0.11, 0.03, sole, 0.065, 0, -0.095)); foot.add(l3cBox(0.04, 0.09, 0.14, boot, -0.035, 0, 0.0));
    hips.add(hip); return { hip, knee, foot };
  }, L = leg(1), R = leg(-1);
  // bäcken, bälte och verktygsficka
  hips.add(l3cBox(0.2, 0.34, 0.15, pants, 0, 0, 0.05)); hips.add(l3cBox(0.215, 0.35, 0.035, belt, 0, 0, 0.115)); hips.add(l3cBox(0.06, 0.11, 0.13, belt, 0.0, -0.18, 0.04));
  // överkropp
  const spine = l3cGrp(0, 0, 0.06); hips.add(spine);
  const tor = l3cSph(0.118, 0.19, 0.30, shirt, 0, 0, 0.3); spine.add(tor);
  const ves = l3cSph(0.127, 0.2, 0.275, vest, 0, 0, 0.315); spine.add(ves);
  const ring = z => { const t = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.011, 8, 28), refl); t.scale.set(0.64, 1, 1); t.position.set(0, 0, z); return t; };
  spine.add(ring(0.16), ring(0.31));
  [-1, 1].forEach(s => { [1, -1].forEach(f => { const b = l3cBox(0.01, 0.045, 0.2, refl, f * 0.102, s * 0.09, 0.31); b.rotation.x = -s * 0.0; spine.add(b); }); });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.0562), new THREE.MeshBasicMaterial({ map: l3cLogoTex(true), transparent: true })); back.position.set(-0.128, 0, 0.36); l3cFace(back, -1, 0, 0); spine.add(back);
  const chest = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.0225), new THREE.MeshBasicMaterial({ map: l3cLogoTex(true), transparent: true })); chest.position.set(0.123, 0.075, 0.4); l3cFace(chest, 1, 0, 0); spine.add(chest);
  // hals, huvud, ansikte
  spine.add(l3cCyl(0.045, 0.05, 0.1, skin).translateZ(0.62));
  const head = l3cGrp(0.012, 0, 0.7); spine.add(head);
  head.add(l3cSph(0.096, 0.079, 0.112, skin, 0, 0, 0)); [-1, 1].forEach(s => { head.add(l3cSph(0.018, 0.012, 0.03, skin, 0, s * 0.08, 0)); head.add(l3cSph(0.01, 0.012, 0.012, dark, 0.087, s * 0.034, 0.018)); head.add(l3cBox(0.008, 0.034, 0.008, dark, 0.088, s * 0.034, 0.042)); });
  head.add(l3cSph(0.017, 0.014, 0.022, skin, 0.098, 0, -0.012)); head.add(l3cBox(0.008, 0.044, 0.007, dark, 0.09, 0, -0.056));
  head.add(l3cSph(0.098, 0.082, 0.07, l3cPh(0x2d241d, 4), -0.012, 0, 0.0).translateZ(0.0)); // hår under hjälmen
  const hemi = (r, mat) => { const geo = new THREE.SphereGeometry(r, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2); geo.rotateX(Math.PI / 2); return new THREE.Mesh(geo, mat); }; // halvklot med toppen uppåt (Z)
  const hat = hemi(1, helm); hat.scale.set(0.122, 0.108, 0.1); hat.position.set(0, 0, 0.04); head.add(hat);
  const brim = hemi(1, helm); brim.scale.set(0.15, 0.118, 0.014); brim.position.set(0.045, 0, 0.042); head.add(brim);
  const ridge = l3cBox(0.2, 0.024, 0.014, helm, 0, 0, 0.138); head.add(ridge);
  [-1, 1].forEach(s => { const st = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.0225), new THREE.MeshBasicMaterial({ map: l3cLogoTex(false), transparent: true })); st.position.set(0.0, s * 0.1, 0.085); l3cFace(st, 0, s, 0); head.add(st); });
  // armar
  const arm = side => {
    const sh = l3cGrp(0, side * 0.185, 0.52); spine.add(sh); sh.add(l3cSph(0.056, 0.056, 0.056, shirt, 0, 0, 0)); sh.add(l3cCyl(0.05, 0.042, 0.28, shirt));
    const el = l3cGrp(0, 0, -0.28); sh.add(el); el.add(l3cSph(0.043, 0.043, 0.043, shirt, 0, 0, 0)); el.add(l3cCyl(0.04, 0.034, 0.26, shirt)); el.add(l3cCyl(0.037, 0.037, 0.03, refl).translateZ(-0.22));
    const hand = l3cGrp(0, 0, -0.27); el.add(hand); hand.add(l3cSph(0.036, 0.03, 0.055, glove, 0.01, 0, -0.03));
    return { sh, el };
  }, AL = arm(1), AR = arm(-1);
  l3cMark(g);
  const CR = Math.cos;
  const update = st => {
    const w = st.moving ? 1 : 0, amp = Math.min(1, 0.4 + (st.speed || 1.4) / 6) * w, s = Math.sin(st.phase), c = Math.cos(st.phase), cr = st.crouch || 0, air = st.jz > 0.02 ? 1 : 0;
    L.hip.rotation.y = -s * 0.65 * amp - 0.9 * cr - 0.55 * air; R.hip.rotation.y = s * 0.65 * amp - 0.9 * cr - 0.3 * air;
    L.knee.rotation.y = 0.12 * amp + Math.max(0, Math.sin(st.phase + 1.3)) * 0.95 * amp + 1.7 * cr + 0.95 * air; R.knee.rotation.y = 0.12 * amp + Math.max(0, Math.sin(st.phase + 1.3 + Math.PI)) * 0.95 * amp + 1.7 * cr + 0.6 * air;
    L.foot.rotation.y = -(L.hip.rotation.y + L.knee.rotation.y) * 0.9; R.foot.rotation.y = -(R.hip.rotation.y + R.knee.rotation.y) * 0.9;
    AL.sh.rotation.y = s * 0.55 * amp - 0.9 * air; AR.sh.rotation.y = -s * 0.55 * amp - 0.9 * air; AL.sh.rotation.x = -0.05 - 0.25 * air; AR.sh.rotation.x = 0.05 + 0.25 * air;
    AL.el.rotation.y = -(0.22 + 0.5 * amp * (s > 0 ? 0.6 : 1)) - 0.4 * air; AR.el.rotation.y = -(0.22 + 0.5 * amp * (s < 0 ? 0.6 : 1)) - 0.4 * air;
    const hz = 0.44 * CR(0.9 * cr) + 0.4 * CR(0.8 * cr) + 0.105; hips.position.z = hz + Math.abs(c) * 0.028 * amp; spine.rotation.y = 0.05 + 0.1 * Math.min(1, (st.speed || 0) / 5) * w + 0.38 * cr; head.rotation.y = -0.05 * (1 - cr);
  };
  return { g, update };
}

/* ---- Fordon -------------------------------------------------------------------------------------------------------------------------------- */
function l3cWheel(r, wd, tire, hub, x, y, z) {
  const w = l3cGrp(x, y, z), t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, wd, 20), tire), h = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, wd * 1.04, 12), hub); w.add(t, h);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, lug = l3cBox(r * 0.12, wd * 1.02, r * 0.1, tire, Math.cos(a) * r, 0, Math.sin(a) * r); lug.rotation.y = -a; w.add(lug); } // slitbana så att rullningen syns
  return { g: w, spin: 0, r };
}
function l3cTruck() {
  const g = new THREE.Group(), cab = l3cPh(0xe8e8ea, 60), chassis = l3cPh(0x2b2f35, 15), bed = l3cPh(0xff8a1e, 35), tire = l3cPh(0x1b1b1b, 5), hub = l3cPh(0xa4a9b0, 60), glass = new THREE.MeshPhongMaterial({ color: 0x3b5b7a, shininess: 110, specular: 0xffffff });
  g.add(l3cBox(8.4, 1.0, 0.45, chassis, 0, 0, 0.95)); g.add(l3cBox(2.3, 2.5, 2.3, cab, 3.6, 0, 2.15)); g.add(l3cBox(0.08, 2.2, 1.0, glass, 4.77, 0, 2.55)); g.add(l3cBox(1.2, 0.06, 0.8, glass, 3.8, 1.27, 2.55), l3cBox(1.2, 0.06, 0.8, glass, 3.8, -1.27, 2.55)); g.add(l3cBox(0.4, 2.55, 0.5, chassis, 4.9, 0, 1.2));
  const wheels = []; [3.2, -2.1, -3.5].forEach(x => [-1, 1].forEach(s => { const w = l3cWheel(0.55, 0.42, tire, hub, x, s * 1.15, 0.55); g.add(w.g); wheels.push(w); }));
  const bp = l3cGrp(-4.0, 0, 1.2); g.add(bp); bp.add(l3cBox(6.0, 2.5, 0.2, bed, 3.0, 0, 0)); bp.add(l3cBox(6.0, 0.18, 1.3, bed, 3.0, 1.16, 0.65), l3cBox(6.0, 0.18, 1.3, bed, 3.0, -1.16, 0.65)); bp.add(l3cBox(0.18, 2.5, 1.3, bed, 0.05, 0, 0.65), l3cBox(0.18, 2.5, 1.5, bed, 5.9, 0, 0.75));
  l3cMark(g);
  return { g, update: st => { const wk = st.work || 0; bp.rotation.y = -wk * 0.75; wheels.forEach(w => { w.g.rotation.y = -(st.travel || 0) / w.r; }); } };
}
function l3cLoader() {
  const g = new THREE.Group(), body = l3cPh(0xf5b400, 40), dark = l3cPh(0x2b2f35, 15), tire = l3cPh(0x1b1b1b, 5), hub = l3cPh(0xa4a9b0, 60), glass = new THREE.MeshPhongMaterial({ color: 0x3b5b7a, shininess: 110, specular: 0xffffff }), steel = l3cPh(0x5a5f66, 30);
  g.add(l3cBox(2.8, 2.2, 1.5, body, -1.8, 0, 1.45)); g.add(l3cBox(1.4, 1.2, 0.8, body, -3.0, 0, 2.2)); g.add(l3cBox(2.2, 1.8, 1.1, body, 0.3, 0, 1.25));
  g.add(l3cBox(1.7, 1.7, 1.7, body, -0.9, 0, 2.6)); g.add(l3cBox(0.05, 1.6, 1.2, glass, -0.04, 0, 2.7)); g.add(l3cBox(1.5, 0.05, 1.2, glass, -0.9, 0.86, 2.7), l3cBox(1.5, 0.05, 1.2, glass, -0.9, -0.86, 2.7)); g.add(l3cBox(1.9, 1.9, 0.12, dark, -0.9, 0, 3.5));
  const wheels = []; [[1.5, 1], [1.5, -1], [-2.0, 1], [-2.0, -1]].forEach(([x, s]) => { const w = l3cWheel(0.9, 0.7, tire, hub, x, s * 1.2, 0.9); g.add(w.g); wheels.push(w); });
  const bp = l3cGrp(0.6, 0, 1.6); g.add(bp); [-0.9, 0.9].forEach(y => bp.add(l3cBox(3.2, 0.2, 0.3, body, 1.6, y, 0))); const bk = l3cGrp(3.2, 0, 0); bp.add(bk); bk.add(l3cBox(0.3, 2.9, 0.9, steel, 0.0, 0, -0.35)); bk.add(l3cBox(1.2, 2.9, 0.12, steel, 0.55, 0, -0.78)); bk.add(l3cBox(0.12, 2.9, 0.7, steel, 1.1, 0, -0.5)); [-1.2, -0.6, 0, 0.6, 1.2].forEach(y => bk.add(l3cBox(0.3, 0.12, 0.14, dark, 1.2, y, -0.85)));
  l3cMark(g);
  return { g, update: st => { const wk = st.work || 0; bp.rotation.y = 0.15 - wk * (0.7 + 0.15 * Math.sin(st.t * 1.5)); bk.rotation.y = 0.35 * wk * (1 + Math.sin(st.t * 1.5)) * 0.5; wheels.forEach(w => { w.g.rotation.y = -(st.travel || 0) / w.r; }); } };
}
/* Markerat objekt: kopia av det markerade placerade objektet, centrerat med foten mot marken. Framåt = objektets +X (Vrid ändrar). */
function l3cOwn(rotQ) {
  const ids = l3 && l3.sel ? [...l3.sel] : [], src = ids.length ? l3.placeMeshes.get(ids[ids.length - 1]) : null; if (!src) return null;
  const grp = new THREE.Group(), copy = src.clone(true); copy.position.set(0, 0, 0); copy.rotation.set(0, 0, 0); copy.scale.set(1, 1, 1); copy.visible = true; copy.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(copy), c = b.getCenter(new THREE.Vector3()); copy.position.set(-c.x, -c.y, -b.min.z); grp.add(copy); grp.rotation.z = (rotQ || 0) * Math.PI / 2; const wrap = new THREE.Group(); wrap.add(grp); l3cMark(wrap);
  const sz = b.getSize(new THREE.Vector3()), big = Math.max(sz.x, sz.y, sz.z, 0.5);
  return { g: wrap, update: () => {}, cfg: { eye: Math.max(0.8, sz.z * 0.85), camD: Math.max(5, big * 2.6), camUp: Math.max(1, sz.z * 0.5), speedMul: Math.max(1, Math.min(6, big / 3)), turn: 3, radius: Math.max(0.3, Math.max(sz.x, sz.y) * 0.5), step: 0.4, vehicle: true } };
}
function l3cBuild(kind, rotQ) {
  const f = { human: l3cHuman, crane: l3vCrane, excavator: l3vExcavator, truck: l3cTruck, loader: l3cLoader }[kind];
  if (kind === "own") { const o = l3cOwn(rotQ); if (o) return { ...o, kind }; kind = "human"; return { ...l3cHuman(), cfg: L3C_CFG.human, kind }; }
  const r = f ? f() : l3cHuman(); return { ...r, cfg: L3C_CFG[kind] || L3C_CFG.human, kind };
}
