/* Mobilkran och grävmaskin i detalj (Victor 2026-10-22: "gör grävmaskinen och mobilkranen mer detaljerade och realistiska och lägg till animationer så att jag kan fälla ut mobilkranen och se radien").
   Byggs av enkla former men med riktiga delar: stödben som skjuts ut och fälls ned, teleskopbom i fyra sektioner, lutcylinder, vinsch, krok med lina, kranhytt som lutar,
   motvikt, hjulupphängning, larver med skor som rullar, sväng, bom/skaft/skopa med hydraulcylindrar som följer med. Reglagen kommer från gå-lägets kranpanel (l3w.ctl).
   Mobilkranen visar arbetsradien på marken (ringar var 5:e meter, aktuell radie och största möjliga) och radie, höjd och bomlängd som siffror.
   Båda fordonen returnerar { g, update(st), info(st) }; st.ctl = reglagens värden. */

const L3V_V0 = () => new THREE.Vector3();
function l3vSeg(m, a, b) { const d = b.clone().sub(a), len = d.length() || 1e-3; m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(1, len, 1); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); }
const l3vCylY = (r, mat) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 12), mat);
/* Hydraulcylinder: pipa + kolvstång mellan två fästpunkter (Object3D) – följer med när delarna rör sig. */
function l3vRam(parent, oa, ob, mats, rb, rr) {
  const barrel = l3vCylY(rb, mats[0]), rod = l3vCylY(rr, mats[1]); parent.add(barrel, rod); const va = L3V_V0(), vb = L3V_V0();
  return () => { oa.getWorldPosition(va); ob.getWorldPosition(vb); const a = parent.worldToLocal(va.clone()), b = parent.worldToLocal(vb.clone()), mid = a.clone().lerp(b, 0.58); l3vSeg(barrel, a, mid); l3vSeg(rod, mid, b); };
}
const l3vAnchor = (parent, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; };
function l3vLabel(w, h) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128; const t = new THREE.CanvasTexture(c), sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false })); sp.scale.set(w, h, 1); sp.renderOrder = 9; sp.userData.noHit = true;
  sp.userData.set = (txt, col) => { if (sp.userData.txt === txt + col) return; sp.userData.txt = txt + col; const g = c.getContext("2d"); g.clearRect(0, 0, 256, 128); g.fillStyle = "rgba(15,23,42,.72)"; if (g.roundRect) { g.beginPath(); g.roundRect(8, 24, 240, 80, 18); g.fill(); } else g.fillRect(8, 24, 240, 80); g.fillStyle = col || "#fff"; g.font = "700 54px system-ui, Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(txt, 128, 66); t.needsUpdate = true; };
  return sp;
}
const l3vFmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace(".", ",");
function l3vMark(g) { g.traverse(o => { o.userData.noHit = true; if (!o.isSprite) o.renderOrder = 5; }); return g; }

/* ---- Mobilkran ------------------------------------------------------------------------------------------------------------------------------ */
function l3vCrane() {
  const g = new THREE.Group(), Y = l3cPh(0xf4b400, 45), Y2 = l3cPh(0xd49a00, 35), K = l3cPh(0x2a2e34, 20), K2 = l3cPh(0x474c54, 25), Gy = l3cPh(0x8a9099, 40), Rd = l3cPh(0xc4281c, 35), tire = l3cPh(0x161616, 4), hub = l3cPh(0xb4b9c0, 70), steel = l3cPh(0xcfd4da, 90);
  const glass = new THREE.MeshPhongMaterial({ color: 0x2f4a66, shininess: 120, specular: 0xffffff, transparent: true, opacity: 0.88 }), lamp = new THREE.MeshBasicMaterial({ color: 0xfff2b0 }), amber = new THREE.MeshBasicMaterial({ color: 0xff9a1a });
  const B = l3cBox;
  // ---- bärare (chassi, hytt, hjul, stödbenshus)
  g.add(B(10.8, 1.1, 0.5, K, 0.2, 0, 1.0), B(8.8, 0.1, 0.55, Y, 0, 1.12, 1.02), B(8.8, 0.1, 0.55, Y, 0, -1.12, 1.02), B(1.5, 0.35, 0.5, Gy, 0.6, 1.3, 0.95), B(1.5, 0.35, 0.5, Gy, 0.6, -1.3, 0.95), B(1.1, 0.5, 0.45, K2, -0.8, 1.3, 0.95));
  g.add(B(2.2, 2.5, 1.9, Y, 4.75, 0, 2.2), B(0.08, 2.2, 1.05, glass, 5.87, 0, 2.62), B(0.12, 2.3, 0.5, K, 5.88, 0, 1.75), B(0.3, 2.6, 0.32, K, 6.05, 0, 1.1), B(1.3, 0.06, 0.9, glass, 4.85, 1.26, 2.62), B(1.3, 0.06, 0.9, glass, 4.85, -1.26, 2.62), B(2.1, 2.3, 0.14, K, 4.7, 0, 3.2), B(0.2, 0.55, 0.08, lamp, 5.95, 0.85, 1.75), B(0.2, 0.55, 0.08, lamp, 5.95, -0.85, 1.75));
  g.add(B(0.1, 0.5, 0.35, K, 5.7, 1.58, 2.75), B(0.1, 0.5, 0.35, K, 5.7, -1.58, 2.75), B(0.4, 0.08, 0.5, K2, 4.0, 1.32, 1.15), B(0.4, 0.08, 0.5, K2, 4.0, -1.32, 1.15), B(0.25, 0.25, 0.12, amber, 4.7, 0, 3.32));
  const wheels = []; [4.4, 3.1, -0.6, -1.9, -3.2].forEach((x, i) => [-1, 1].forEach(s => { const w = l3cWheel(0.62, 0.48, tire, hub, x, s * 1.18, 0.62); g.add(w.g); wheels.push(w); g.add(B(1.45, 0.12, 0.1, Y2, x, s * 1.12, 1.38), B(1.45, 0.06, 0.5, Y2, x, s * 1.45, 1.08)); }));
  // ---- stödben: balkar skjuts ut, sedan fälls pelarna ned mot marken
  const outs = []; [[3.6, 1], [3.6, -1], [-4.4, 1], [-4.4, -1]].forEach(([x, s]) => {
    g.add(B(0.55, 2.3, 0.5, K, x, 0, 0.95));
    const o = new THREE.Group(); o.position.set(x, s * 1.1, 0.95); g.add(o); const beam = B(0.42, 1, 0.4, steel, 0, 0, 0), jackG = new THREE.Group(), jack = B(0.22, 0.22, 1, Y2, 0, 0, 0), pad = B(0.85, 0.85, 0.1, K, 0, 0, 0), cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1, 10), steel); cyl.rotation.x = Math.PI / 2;
    o.add(beam, jackG); jackG.add(jack, pad); outs.push({ o, beam, jackG, jack, pad, s });
  });
  // ---- överdel (sväng): motvikt, motorhuv, kranhytt, vinsch
  const sup = new THREE.Group(); sup.position.set(-1.3, 0, 1.3); g.add(sup);
  const ring = l3cCyl(1.45, 1.45, 0.2, K).translateZ(0.2); sup.add(ring, B(4.6, 2.5, 0.5, Y, 0.1, 0, 0.45), B(2.8, 2.2, 0.9, Y2, -0.7, 0, 1.15), B(1.0, 2.0, 0.3, Y2, -0.25, 0, 1.7), B(0.5, 0.2, 0.9, K, -0.8, 0.55, 1.6), B(0.5, 0.2, 0.9, K, -0.8, -0.55, 1.6));
  [0.45, 0.9, 1.35].forEach((z, i) => sup.add(B(0.95, 2.35, 0.43, i === 2 ? K : K2, -2.7, 0, z), B(0.2, 0.5, 0.1, Gy, -2.7, 0, z + 0.26)));
  const wd = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 1.5, 16), K); wd.position.set(-1.35, 0, 1.95); sup.add(wd); [-0.78, 0.78].forEach(y => { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.08, 16), Gy); f.position.set(-1.35, y, 1.95); sup.add(f); });
  const cab = new THREE.Group(); cab.position.set(1.3, 0.95, 0.7); sup.add(cab); cab.add(B(1.3, 1.1, 1.35, Y, 0, 0, 0.68), B(0.05, 0.95, 0.85, glass, 0.67, 0, 0.8), B(1.0, 0.05, 0.8, glass, 0, 0.56, 0.8), B(1.0, 0.05, 0.8, glass, 0, -0.56, 0.8), B(1.4, 1.2, 0.1, K, 0, 0, 1.4), B(0.3, 1.0, 0.06, K, 0.8, 0, 1.38));
  // ---- bom: fyra sektioner som glider ur varandra
  const bp = new THREE.Group(); bp.position.set(-0.8, 0, 1.9); sup.add(bp);
  const sect = (len, w, h, mat) => { const gr = new THREE.Group(); gr.add(B(len, w, h, mat, len / 2, 0, 0), B(len * 0.96, w * 0.55, 0.05, K2, len / 2, 0, h / 2 + 0.02), B(len * 0.96, w * 0.55, 0.05, K2, len / 2, 0, -h / 2 - 0.02), B(0.3, w * 1.07, h * 1.07, K, 0.15, 0, 0), B(0.18, w * 1.04, h * 1.04, K2, len - 0.09, 0, 0)); return gr; };
  const SC = [{ len: 9.4, w: 0.95, h: 1.05 }, { len: 8.6, w: 0.8, h: 0.9 }, { len: 8.0, w: 0.68, h: 0.76 }, { len: 7.4, w: 0.56, h: 0.62 }], secs = SC.map(c => { const s = sect(c.len, c.w, c.h, Y); bp.add(s); return s; });
  const head = new THREE.Group(); secs[3].add(head); head.position.set(7.4, 0, 0); head.add(B(0.5, 0.75, 0.75, K, 0.1, 0, 0)); [-0.34, 0.34].forEach(y => { const sh = l3vCylY(0.3, Gy); sh.rotation.x = 0; sh.scale.set(1, 0.08, 1); sh.position.set(0.3, y, 0.05); head.add(sh); });
  // ---- lutcylinder
  const oa = l3vAnchor(sup, 0.55, 0, 0.75), ob = l3vAnchor(bp, 3.7, 0, -0.7), ramUpd = l3vRam(sup, oa, ob, [K2, steel], 0.18, 0.1);
  // ---- krok och lina (hänger lodrätt i världen: barn till överdelen, inte till bommen)
  const hk = new THREE.Group(); sup.add(hk); const cable = B(0.05, 0.05, 1, K, 0, 0, -0.5), blk = new THREE.Group(); hk.add(cable, blk);
  blk.add(B(0.5, 0.4, 0.5, Rd, 0, 0, 0.2), B(0.56, 0.1, 0.56, K, 0, 0, 0.5), B(0.12, 0.12, 0.3, steel, 0, 0, -0.1)); const hook = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 18, Math.PI * 1.45), steel); hook.rotation.x = Math.PI / 2; hook.rotation.y = Math.PI * 0.78; hook.position.set(0, 0, -0.35); blk.add(hook);
  // ---- radie på marken
  const rg = new THREE.Group(); rg.position.set(-1.3, 0, 0.05); g.add(rg); const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }), labs = [];
  for (let r = 5; r <= 40; r += 5) { const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.04, r + 0.04, 120), ringMat); rg.add(m); const lb = l3vLabel(2.6, 1.3); lb.userData.set(r + " m", "#cbd5e1"); lb.position.set(r * Math.cos(0.9), r * Math.sin(0.9), 0.4); rg.add(lb); labs.push(lb); }
  const rcur = new THREE.Mesh(new THREE.RingGeometry(0.975, 1, 160), new THREE.MeshBasicMaterial({ color: 0xff7a00, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })), rdisc = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.MeshBasicMaterial({ color: 0xff7a00, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false })), rmax = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 160), new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
  rg.add(rcur, rdisc, rmax); const rlab = l3vLabel(3.4, 1.7), mlab = l3vLabel(3.4, 1.7); rg.add(rlab, mlab);
  l3vMark(g);
  const geo = c => { const ext = Math.max(0, Math.min(1, c.ext)), ang = c.ang, s2 = 1 + 7.6 * ext, s3 = s2 + 1 + 7.0 * ext, s4 = s3 + 1 + 6.4 * ext, L = s4 + 7.4, tx = -0.8 + L * Math.cos(ang), tz = 1.9 + L * Math.sin(ang), R = -0.8 + L * Math.cos(ang) + 1.3 - 1.3; const Lmax = 24 + 7.4 + 1, Rmax = -0.8 + 31.4 * Math.cos(ang); return { s: [0, s2, s3, s4], L, tx, tz, R: Math.max(0, R), Rmax: Math.max(0, Rmax), H: 1.3 + tz }; };
  const update = st => {
    const c = st.ctl || { out: 0, ang: 0.05, ext: 0, slew: 0, hook: 4 }, o = c.out, e1 = Math.min(1, o * 2), j = Math.max(0, o * 2 - 1), q = geo(c);
    outs.forEach(u => { const lb = 0.9 + e1 * 1.7; u.beam.scale.y = lb; u.beam.position.y = u.s * lb / 2; u.jackG.position.y = u.s * lb; const h = 0.2 + j * 0.75; u.jack.scale.z = h; u.jack.position.z = -h / 2; u.pad.position.z = -h; });
    sup.rotation.z = c.slew; bp.rotation.y = -c.ang; secs.forEach((s, i) => { s.position.x = q.s[i]; });
    cab.rotation.y = -c.ang * 0.35; wheels.forEach(w => { w.g.rotation.y = -(st.travel || 0) / w.r; });
    const drop = Math.max(0.6, Math.min(c.hook, q.tz + 1.3 - 0.35)); hk.position.set(q.tx, 0, q.tz); cable.scale.z = drop; cable.position.z = -drop / 2; blk.position.z = -drop - 0.1; blk.rotation.z = Math.sin((st.t || 0) * 1.3) * 0.03 * Math.min(1, Math.abs(c.slewV || 0) * 3);
    g.updateMatrixWorld(true); ramUpd();
    const show = !!st.showRadius && o > 0.02; rg.visible = show; if (show) { rg.rotation.z = 0; rcur.scale.set(q.R, q.R, 1); rdisc.scale.set(q.R, q.R, 1); rmax.scale.set(q.Rmax, q.Rmax, 1); rcur.visible = rdisc.visible = q.R > 0.3; rlab.position.set((q.R + 1.4) * Math.cos(c.slew), (q.R + 1.4) * Math.sin(c.slew), 0.6); rlab.userData.set("Radie " + l3vFmt(q.R) + " m", "#ffb45a"); mlab.position.set((q.Rmax + 1.4) * Math.cos(c.slew + 0.5), (q.Rmax + 1.4) * Math.sin(c.slew + 0.5), 0.6); mlab.userData.set("Max " + l3vFmt(q.Rmax) + " m", "#7dd3fc"); mlab.visible = q.Rmax > q.R + 2; rmax.visible = q.Rmax > q.R + 0.5; }
    st.info = [["Radie", l3vFmt(q.R) + " m"], ["Lyfthöjd (bomspets)", l3vFmt(q.H) + " m"], ["Krokhöjd", l3vFmt(Math.max(0, q.H - drop)) + " m"], ["Bomlängd", l3vFmt(q.L) + " m"], ["Bomvinkel", Math.round(c.ang * 180 / Math.PI) + "°"], ["Största radie vid vinkeln", l3vFmt(q.Rmax) + " m"], ["Stödben", o > 0.98 ? "utfällda" : o < 0.02 ? "inne" : Math.round(o * 100) + " %"]];
  };
  return { g, update, geo, ranges: { ang: [0.03, 1.4], ext: [0, 1], hook: [0.8, 40] } };
}

/* ---- Grävmaskin ----------------------------------------------------------------------------------------------------------------------------- */
function l3vExcavator() {
  const g = new THREE.Group(), Y = l3cPh(0xf5b400, 45), Y2 = l3cPh(0xd49a00, 35), K = l3cPh(0x2a2e34, 20), K2 = l3cPh(0x474c54, 25), steel = l3cPh(0xb9bfc7, 90), shoeM = l3cPh(0x1d1f22, 6), roll = l3cPh(0x3a3e45, 25);
  const glass = new THREE.MeshPhongMaterial({ color: 0x2f4a66, shininess: 120, specular: 0xffffff, transparent: true, opacity: 0.88 }), amber = new THREE.MeshBasicMaterial({ color: 0xff9a1a }), B = l3cBox;
  // ---- larver: ram, hjul, rullar och skor som rullar runt
  const shoeGeo = new THREE.BoxGeometry(0.22, 0.78, 0.07), trackSides = [];
  const Ls = 3.45, Rr = 0.46, loop = 2 * Ls + 2 * Math.PI * Rr, NS = Math.round(loop / 0.25), pitch = loop / NS;
  [-1, 1].forEach(s => {
    const t = new THREE.Group(); t.position.set(0, s * 1.15, 0); g.add(t);
    t.add(B(3.7, 0.5, 0.42, K2, 0, 0, 0.62), B(3.5, 0.62, 0.1, K, 0, 0, 0.92));
    [-1.7, 1.75].forEach((x, i) => { const w = l3vCylY(i ? 0.4 : 0.44, K); w.scale.y = 0.62; w.position.set(x, 0, Rr); t.add(w); const h = l3vCylY(0.2, steel); h.scale.y = 0.66; h.position.set(x, 0, Rr); t.add(h); });
    for (let i = 0; i < 5; i++) { const r = l3vCylY(0.14, roll); r.scale.y = 0.6; r.position.set(-1.1 + i * 0.6, 0, 0.2); t.add(r); }
    [-0.5, 0.7].forEach(x => { const r = l3vCylY(0.1, roll); r.scale.y = 0.55; r.position.set(x, 0, 0.88); t.add(r); });
    const inst = new THREE.InstancedMesh(shoeGeo, shoeM, NS); t.add(inst); trackSides.push(inst);
  });
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), p4 = new THREE.Vector3(), sc4 = new THREE.Vector3(1, 1, 1), ax = new THREE.Vector3(0, 1, 0);
  const placeShoes = travel => trackSides.forEach(inst => { for (let i = 0; i < NS; i++) { let u = ((i * pitch + travel) % loop + loop) % loop, x, z, a; if (u < Ls) { x = -Ls / 2 + u; z = Rr * 2; a = 0; } else if (u < Ls + Math.PI * Rr) { const th = (u - Ls) / Rr; x = Ls / 2 + Math.sin(th) * Rr; z = Rr + Math.cos(th) * Rr; a = -th; } else if (u < 2 * Ls + Math.PI * Rr) { x = Ls / 2 - (u - Ls - Math.PI * Rr); z = 0; a = Math.PI; } else { const th = (u - 2 * Ls - Math.PI * Rr) / Rr; x = -Ls / 2 - Math.sin(th) * Rr; z = Rr - Math.cos(th) * Rr; a = Math.PI - th; } p4.set(x - 0.0, 0, z + 0.03); q4.setFromAxisAngle(ax, a); m4.compose(p4, q4, sc4); inst.setMatrixAt(i, m4); } inst.instanceMatrix.needsUpdate = true; });
  placeShoes(0);
  g.add(B(2.4, 1.8, 0.5, K, 0, 0, 0.78), B(1.4, 2.4, 0.2, K2, 0, 0, 1.05));
  // ---- överdel
  const tur = new THREE.Group(); tur.position.set(0, 0, 1.08); g.add(tur);
  tur.add(l3cCyl(1.15, 1.15, 0.16, K).translateZ(0.16), B(3.4, 2.5, 0.22, K2, -0.35, 0, 0.27), B(1.9, 2.4, 1.05, Y, -1.0, 0, 0.9), B(0.95, 2.5, 1.0, Y2, -2.3, 0, 0.85), B(0.12, 2.3, 0.75, K, -2.82, 0, 0.9), B(1.0, 0.6, 0.72, Y, 0.55, -0.95, 0.72), B(0.9, 0.5, 0.5, K2, 0.1, -1.05, 0.5));
  [-0.4, -0.9, -1.4].forEach(x => tur.add(B(0.4, 1.9, 0.03, K, x, 0, 1.44)));
  tur.add(B(1.9, 0.04, 0.04, K, -1.0, 1.22, 1.5), B(1.9, 0.04, 0.04, K, -1.0, -1.22, 1.5), B(0.04, 2.4, 0.04, K, -1.95, 0, 1.5)); const ex = l3vCylY(0.07, K); ex.scale.y = 0.7; ex.position.set(-1.5, -0.8, 1.7); tur.add(ex);
  const cab = new THREE.Group(); cab.position.set(0.7, 0.9, 0.38); tur.add(cab); cab.add(B(1.5, 1.2, 1.6, Y, 0, 0, 0.8), B(0.04, 1.05, 1.2, glass, 0.76, 0, 0.9), B(1.25, 0.04, 1.15, glass, 0, 0.62, 0.9), B(1.25, 0.04, 1.15, glass, 0, -0.62, 0.9), B(0.04, 1.0, 1.0, glass, -0.76, 0, 0.9), B(1.75, 1.45, 0.1, K, 0.05, 0, 1.64), B(0.4, 1.4, 0.06, K, 0.98, 0, 1.6), B(0.06, 0.08, 1.2, K, 0.77, 0.52, 0.9), B(0.06, 0.08, 1.2, K, 0.77, -0.52, 0.9), B(0.3, 0.05, 0.04, K, 0.78, 0.2, 0.55), B(0.5, 0.5, 0.45, K2, 0, 0, 0.3), B(0.2, 0.2, 0.08, amber, 0, 0, 1.76));
  // ---- bom (böjd), skaft och skopa
  const bm = new THREE.Group(); bm.position.set(1.25, 0, 0.62); tur.add(bm);
  const a1 = 0.38, l1 = 3.1, a2 = -0.26, l2 = 2.9, A = new THREE.Vector3(l1 * Math.cos(a1), 0, l1 * Math.sin(a1)), E = new THREE.Vector3(A.x + l2 * Math.cos(a2), 0, A.z + l2 * Math.sin(a2));
  const pA = B(l1, 0.62, 0.72, Y, 0, 0, 0); pA.position.set(A.x / 2, 0, A.z / 2); pA.rotation.y = -a1; const pB = B(l2, 0.56, 0.56, Y, 0, 0, 0); pB.position.set((A.x + E.x) / 2, 0, (A.z + E.z) / 2); pB.rotation.y = -a2; bm.add(pA, pB);
  const jt = l3vCylY(0.36, K2); jt.scale.y = 0.7; jt.position.copy(A); bm.add(jt); const fp = l3vCylY(0.34, K2); fp.scale.y = 0.7; bm.add(fp);
  const sk = new THREE.Group(); sk.position.copy(E); bm.add(sk); const stick = B(2.9, 0.42, 0.52, Y, 1.35, 0, 0); sk.add(stick, B(0.5, 0.5, 0.6, K2, 0, 0, 0), B(0.4, 0.46, 0.3, K2, 2.85, 0, 0));
  const bk = new THREE.Group(); bk.position.set(2.9, 0, 0); sk.add(bk);
  bk.add(B(1.1, 1.25, 0.07, K2, 0.55, 0, -0.6), B(0.07, 1.25, 0.95, K2, 0.06, 0, -0.14), B(1.1, 0.07, 0.95, K2, 0.52, 0.6, -0.14), B(1.1, 0.07, 0.95, K2, 0.52, -0.6, -0.14), B(0.4, 1.2, 0.1, K, 0.1, 0, 0.35));
  [-0.5, -0.25, 0, 0.25, 0.5].forEach(y => { const th = B(0.32, 0.11, 0.1, steel, 1.2, y, -0.6); th.rotation.y = 0.25; bk.add(th); });
  const tip = l3vAnchor(bk, 1.3, 0, -0.64);
  // ---- hydraulcylindrar (två för bommen)
  const rams = [];
  [-0.3, 0.3].forEach(y => rams.push(l3vRam(tur, l3vAnchor(tur, 0.55, y, 0.38), l3vAnchor(bm, 1.57, y, 0.1), [K2, steel], 0.14, 0.085)));
  rams.push(l3vRam(bm, l3vAnchor(bm, 2.04, 0, 1.35), l3vAnchor(sk, 0.6, 0, 0.45), [K2, steel], 0.13, 0.08));
  rams.push(l3vRam(sk, l3vAnchor(sk, 2.2, 0, 0.3), l3vAnchor(bk, 0.1, 0, 0.45), [K2, steel], 0.12, 0.075));
  // ---- radie
  const rg = new THREE.Group(); rg.position.set(0, 0, 0.05); g.add(rg); const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  for (let r = 2; r <= 12; r += 2) { const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.03, r + 0.03, 96), ringMat); rg.add(m); const lb = l3vLabel(1.2, 0.6); lb.userData.set(r + " m", "#cbd5e1"); lb.position.set(r * Math.cos(2.3), r * Math.sin(2.3), 0.3); rg.add(lb); }
  const rcur = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 120), new THREE.MeshBasicMaterial({ color: 0xff7a00, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })); rg.add(rcur); const rlab = l3vLabel(2.4, 1.2); rg.add(rlab);
  l3vMark(g);
  const tv = L3V_V0(), tv2 = L3V_V0();
  const update = st => {
    const c = st.ctl || { slew: 0, boom: 0.4, stick: 1.1, bucket: 0.7 }; tur.rotation.z = c.slew; bm.rotation.y = -c.boom; sk.rotation.y = c.stick; bk.rotation.y = c.bucket;
    fp.position.copy(E); placeShoes(st.travel || 0); g.updateMatrixWorld(true); rams.forEach(r => r());
    tip.getWorldPosition(tv); g.worldToLocal(tv); const reach = Math.hypot(tv.x, tv.y), depth = -tv.z;
    const show = !!st.showRadius; rg.visible = show; if (show) { rcur.scale.set(Math.max(0.2, reach), Math.max(0.2, reach), 1); rlab.position.set((reach + 1) * Math.cos(c.slew), (reach + 1) * Math.sin(c.slew), 0.5); rlab.userData.set("Räckvidd " + l3vFmt(reach) + " m", "#ffb45a"); }
    st.info = [["Räckvidd (skopspets)", l3vFmt(reach) + " m"], [depth >= 0 ? "Skopspets under marken" : "Skopspets över marken", l3vFmt(Math.abs(depth)) + " m"], ["Svängvinkel", Math.round(c.slew * 180 / Math.PI) + "°"]];
  };
  return { g, update, ranges: { boom: [-0.15, 1.0], stick: [0.35, 2.3], bucket: [-0.35, 1.8] } };
}
