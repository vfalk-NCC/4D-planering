/* 3D-vyns gå-läge i tredje person – figurer (Victor 2026-10-22: "gör gubben mycket mer realistisk … NCC-logga … jag vill kunna vara en stor mobilkran, grävmaskin eller andra objekt").
   Allt byggs av enkla former (inga filer): byggare med hjälm, varselväst och NCC-logga, mobilkran, grävmaskin, lastbil med tipp, hjullastare, samt "Markerat objekt"
   (en kopia av det markerade placerade objektet). Origo = markens mitt under figuren, +X = framåt, +Z = upp, enheter meter.
   l3cBuild(kind) → { g, cfg, update(st) }; st = { moving, phase, speed, crouch, jz, work (0–1), t, travel }. */

const L3C_KINDS = [["human", "Byggare"], ["crane", "Mobilkran"], ["excavator", "Grävmaskin"], ["truck", "Lastbil"], ["loader", "Hjullastare"], ["own", "Markerat objekt"], ["glb", "Egen figur (GLB)"]];
const L3C_CFG = {
  human: { steer: 3.0, eye: 1.7, camD: 3.2, camUp: 0.25, speedMul: 1, turn: 14, radius: 0.3, step: 0.6 },
  crane: { steer: 0.9, eye: 3.6, camD: 20, camUp: 3.6, speedMul: 3.6, turn: 1.0, radius: 1.7, step: 0.35, vehicle: true },
  excavator: { steer: 1.3, eye: 2.6, camD: 11, camUp: 2.2, speedMul: 1.6, turn: 1.3, radius: 1.8, step: 0.35, vehicle: true },
  truck: { steer: 1.0, eye: 2.8, camD: 13, camUp: 2.4, speedMul: 4, turn: 1.2, radius: 1.6, step: 0.35, vehicle: true },
  loader: { steer: 1.3, eye: 2.7, camD: 11, camUp: 2.2, speedMul: 3, turn: 1.5, radius: 1.6, step: 0.4, vehicle: true },
  glb: { steer: 3.0, eye: 1.7, camD: 3.2, camUp: 0.25, speedMul: 1, turn: 14, radius: 0.3, step: 0.6 },
  own: { steer: 2.0, eye: 2, camD: 9, camUp: 1.5, speedMul: 2, turn: 3, radius: 1, step: 0.4, vehicle: true },
};
const l3cTex = (w, h, draw) => { const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; };
/* NCC-loggan: svart, kraftig kursiv "NCC" med den blå stjärnan uppe till höger (ungefär som bolagets logotyp). onWhite = vit platta bakom (västen, hjälmen). */
function l3cLogoTex(onWhite) {
  return l3cTex(512, 192, (g, w, h) => {
    if (onWhite) { g.fillStyle = "#ffffff"; g.beginPath(); if (g.roundRect) g.roundRect(0, 0, w, h, 22); else g.rect(0, 0, w, h); g.fill(); }
    g.save(); g.transform(1, 0, -0.24, 1, 0.24 * 150, 0); g.fillStyle = "#0b0b0c"; g.font = "900 128px 'Arial Black', Impact, Arial, Helvetica, sans-serif"; g.textAlign = "left"; g.textBaseline = "alphabetic";
    g.lineWidth = 6; g.strokeStyle = "#0b0b0c"; g.lineJoin = "round"; g.strokeText("NCC", 40, 152); g.fillText("NCC", 40, 152); g.restore();
    // blå stjärna med lång svans åt vänster
    const cx = w * 0.82, cy = h * 0.34, R = 66, r = 27; g.fillStyle = "#0069b4"; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5 + 0.18, rad = i % 2 ? r : R; const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad; if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); g.fill();
    g.beginPath(); g.moveTo(cx - 10, cy + 8); g.lineTo(cx - 150, cy + 34); g.lineTo(cx - 6, cy + 30); g.closePath(); g.fill();
  });
}
/* WoW-lik look: fysikaliskt baserade material (MeshStandardMaterial) med en mjuk himmels-/solreflex (egen miljökarta) och en kall kantbelysning (rim light), delade mellan alla figurer. */
let l3cEnvMap = null, l3cEnvR = null;
function l3cEnv() {
  const r = (typeof l3 !== "undefined" && l3 && l3.renderer) || window.__l3cRenderer; if (!r || !THREE.PMREMGenerator) return null;
  if (l3cEnvMap && l3cEnvR === r) return l3cEnvMap;
  try {
    const sc = new THREE.Scene(), geo = new THREE.SphereGeometry(50, 32, 20); geo.rotateX(Math.PI / 2); const pos = geo.attributes.position, col = [];
    const sky = new THREE.Color(0x9cc4ee), hor = new THREE.Color(0xf2efe8), gnd = new THREE.Color(0x6d6a63), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) { const z = pos.getZ(i) / 50; if (z > 0) c.copy(hor).lerp(sky, Math.pow(z, 0.6)); else c.copy(hor).lerp(gnd, Math.min(1, -z * 2.2)); col.push(c.r, c.g, c.b); }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); sc.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const lamp = (x, y, z, sz, k) => { const m = new THREE.Mesh(new THREE.SphereGeometry(sz, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k * 0.96, k * 0.88) })); m.position.set(x, y, z); sc.add(m); };
    lamp(-20, -28, 34, 7, 9); lamp(30, 14, 18, 6, 3.2); lamp(-6, 36, 10, 5, 2.2);
    const pm = new THREE.PMREMGenerator(r); l3cEnvMap = pm.fromScene(sc, 0.02).texture; pm.dispose(); l3cEnvR = r;
    geo.dispose(); return l3cEnvMap;
  } catch (e) { return null; }
}
const l3cMats = new Map();
function l3cRim(m) {
  m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n float rimF = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 2.6); totalEmissiveRadiance += vec3(0.50, 0.68, 1.0) * rimF * 0.5;"); };
  m.customProgramCacheKey = () => "l3crim";
}
function l3cPh(c, shin, o) {
  o = o || {}; const env = l3cEnv(), key = c + "|" + shin + "|" + (o.metal == null ? "" : o.metal) + "|" + (env ? 1 : 0); let m = l3cMats.get(key); if (m) return m;
  const sh = shin == null ? 25 : shin, metal = o.metal != null ? o.metal : sh >= 80 ? 0.7 : 0.04, rough = o.rough != null ? o.rough : Math.max(0.2, 1 - Math.min(0.85, sh / 120));
  m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, envMap: env, envMapIntensity: metal > 0.3 ? 1.1 : 0.55 }); m.userData.shared = true; l3cRim(m); l3cMats.set(key, m); return m;
}
const l3cGlass = c => { const env = l3cEnv(), key = "g|" + c + "|" + (env ? 1 : 0); let m = l3cMats.get(key); if (m) return m; m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.06, metalness: 0.85, envMap: env, envMapIntensity: 1.6, transparent: true, opacity: 0.9 }); m.userData.shared = true; l3cMats.set(key, m); return m; };
/* Mjuk kontaktskugga under figuren (en nedtonad ellips) – ger "stående på marken"-känslan. */
function l3cShadow(rx, ry) {
  if (!l3cShadow.tex) l3cShadow.tex = l3cTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); gr.addColorStop(0, "rgba(0,0,0,0.55)"); gr.addColorStop(0.55, "rgba(0,0,0,0.28)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, ry * 2), new THREE.MeshBasicMaterial({ map: l3cShadow.tex, transparent: true, depthWrite: false })); m.position.z = 0.02; m.renderOrder = 1; m.userData.noIfc = true; m.userData.shadow = true; return m;
}
/* Vänder en plan (som standard +Z-normal) så att den vetter åt "normal" med texten rättvänd (upp = +Z). */
function l3cFace(m, nx, ny, nz) { const n = new THREE.Vector3(nx, ny, nz), up = new THREE.Vector3(0, 0, 1), r = new THREE.Vector3().crossVectors(up, n).normalize(); m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, new THREE.Vector3().crossVectors(n, r), n)); return m; }
function l3cMark(g) { g.traverse(o => { o.userData.noHit = true; o.renderOrder = 5; }); return g; }
function l3cCyl(rt, rb, h, mat, axis) { const geo = new THREE.CylinderGeometry(rt, rb, h, 14); if (axis !== "y") { geo.rotateX(Math.PI / 2); geo.translate(0, 0, -h / 2); } return new THREE.Mesh(geo, mat); } // hänger nedåt från origo (axel Z) eller axel Y
const l3cRb = new Map(), l3cPlain = new Map();
function l3cRoundGeo(w, d, h) { // avrundad låda (Extrude med fas) – mjukare ljus än en vass låda; tunna paneler förblir plana
  const mn = Math.min(w, d, h); if (mn < 0.03) return null;
  const key = [w, d, h].map(v => v.toFixed(3)).join(","); let geo = l3cRb.get(key); if (geo) return geo;
  const b = Math.min(0.03, mn * 0.16), iw = w - 2 * b, id = d - 2 * b, cr = Math.max(0.001, Math.min(iw, id) * 0.25), x = -iw / 2, y = -id / 2, sh = new THREE.Shape();
  sh.moveTo(x + cr, y); sh.lineTo(x + iw - cr, y); sh.quadraticCurveTo(x + iw, y, x + iw, y + cr); sh.lineTo(x + iw, y + id - cr); sh.quadraticCurveTo(x + iw, y + id, x + iw - cr, y + id); sh.lineTo(x + cr, y + id); sh.quadraticCurveTo(x, y + id, x, y + id - cr); sh.lineTo(x, y + cr); sh.quadraticCurveTo(x, y, x + cr, y);
  geo = new THREE.ExtrudeGeometry(sh, { depth: Math.max(0.001, h - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 2 }); geo.translate(0, 0, -(h - 2 * b) / 2); l3cRb.set(key, geo); return geo;
}
const l3cBox = (w, d, h, mat, x, y, z) => {
  const rg = l3cRoundGeo(w, d, h), m = new THREE.Mesh(rg || new THREE.BoxGeometry(w, d, h), mat); m.position.set(x, y, z);
  if (rg) { const k = [w, d, h].join(","); m.userData.ifcGeo = l3cPlain.get(k) || l3cPlain.set(k, new THREE.BoxGeometry(w, d, h)).get(k); } // IFC-exporten tar den enkla lådan (färre trianglar)
  return m;
};
const l3cSph = (sx, sy, sz, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); return m; };
const l3cGrp = (x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); return g; };

/* ---- Byggare ------------------------------------------------------------------------------------------------------------------------------- */
const l3cCap = (r, len, mat) => { const geo = new THREE.CapsuleGeometry(r, Math.max(0.001, len - 2 * r), 6, 14); geo.rotateX(Math.PI / 2); geo.translate(0, 0, -len / 2); return new THREE.Mesh(geo, mat); }; // kapsel som hänger nedåt från origo
function l3cHuman() {
  const g = new THREE.Group(), skin = l3cPh(0xd9a982, 10), skinD = l3cPh(0xc79670, 8), pants = l3cPh(0x4a4338, 6), pantsD = l3cPh(0x2f2a24, 6), boot = l3cPh(0x2b2723, 40), sole = l3cPh(0x8d6b3b, 4), shirt = l3cPh(0x20252b, 6), vest = l3cPh(0xff6a10, 55), refl = l3cPh(0xdfe3e8, 100, { metal: 0.9, rough: 0.28 }), helm = l3cPh(0xffd21a, 100), glove = l3cPh(0x2f3439, 12), gloveY = l3cPh(0xf1c40f, 10), dark = l3cPh(0x16181b, 5), belt = l3cPh(0x2a2118, 10), hair = l3cPh(0x3a2d22, 4), white = l3cPh(0xf4f4f4, 10), glasses = l3cGlass(0xbfdcf0);
  const HZ = 0.945, hips = l3cGrp(0, 0, HZ); g.add(hips);
  const leg = side => {
    const hip = l3cGrp(0, side * 0.098, 0); hip.add(l3cCap(0.103, 0.46, pants), l3cSph(0.106, 0.106, 0.106, pants, 0, 0, 0), l3cBox(0.14, 0.05, 0.16, pantsD, 0.0, side * 0.075, -0.2), l3cBox(0.04, 0.12, 0.012, pantsD, 0.06, 0, -0.22));
    const knee = l3cGrp(0, 0, -0.44); hip.add(knee); knee.add(l3cSph(0.078, 0.078, 0.078, pants, 0, 0, 0), l3cCap(0.076, 0.42, pants), l3cBox(0.035, 0.1, 0.12, pantsD, 0.066, 0, -0.01), l3cBox(0.12, 0.12, 0.02, pantsD, 0.0, 0, -0.38));
    const foot = l3cGrp(0, 0, -0.4); knee.add(foot); foot.add(l3cBox(0.26, 0.1, 0.11, boot, 0.06, 0, -0.04), l3cSph(0.075, 0.052, 0.055, boot, 0.175, 0, -0.045), l3cBox(0.29, 0.112, 0.032, sole, 0.067, 0, -0.098), l3cBox(0.04, 0.09, 0.13, boot, -0.04, 0, 0.0), l3cBox(0.12, 0.06, 0.012, l3cPh(0x1b1816, 10), 0.095, 0, 0.018));
    hips.add(hip); return { hip, knee, foot };
  }, L = leg(1), R = leg(-1);
  hips.add(l3cBox(0.2, 0.34, 0.15, pants, 0, 0, 0.05), l3cBox(0.215, 0.35, 0.034, belt, 0, 0, 0.115), l3cBox(0.07, 0.12, 0.14, belt, 0, -0.18, 0.03), l3cBox(0.04, 0.05, 0.03, l3cPh(0xb8bcc2, 90), 0.108, 0, 0.115));
  const spine = l3cGrp(0, 0, 0.06); hips.add(spine);
  spine.add(l3cSph(0.13, 0.225, 0.305, shirt, 0, 0, 0.3), l3cSph(0.142, 0.238, 0.285, vest, 0, 0, 0.315), l3cSph(0.1, 0.27, 0.1, shirt, -0.005, 0, 0.5));
  const ring = z => { const t = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.0115, 8, 30), refl); t.scale.set(0.64, 1, 1); t.position.set(0, 0, z); return t; };
  spine.add(ring(0.155), ring(0.305));
  [-1, 1].forEach(s => [1, -1].forEach(f => { const b = l3cBox(0.01, 0.046, 0.21, refl, f * 0.108, s * 0.092, 0.31); spine.add(b); }));
  spine.add(l3cBox(0.008, 0.012, 0.5, dark, 0.121, 0, 0.3), l3cBox(0.01, 0.07, 0.05, vest, 0.115, 0.1, 0.22), l3cBox(0.01, 0.07, 0.05, vest, 0.115, -0.1, 0.22)); // blixtlås och fickor
  const logoMat = () => new THREE.MeshBasicMaterial({ map: l3cLogoTex(true), transparent: true });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.0638), logoMat()); back.position.set(-0.1345, 0, 0.37); l3cFace(back, -1, 0, 0); spine.add(back);
  const chest = new THREE.Mesh(new THREE.PlaneGeometry(0.068, 0.0255), logoMat()); chest.position.set(0.1255, 0.08, 0.42); l3cFace(chest, 1, 0, 0); spine.add(chest);
  spine.add(l3cCap(0.052, 0.1, skin).translateZ(0.64), l3cBox(0.1, 0.13, 0.04, shirt, 0.0, 0, 0.585));
  const head = l3cGrp(0.012, 0, 0.725); head.scale.setScalar(1.25); spine.add(head);
  head.add(l3cSph(0.098, 0.082, 0.114, skin, 0, 0, 0), l3cSph(0.07, 0.066, 0.05, skinD, 0.035, 0, -0.07));
  [-1, 1].forEach(s => {
    head.add(l3cSph(0.02, 0.013, 0.032, skin, -0.005, s * 0.082, -0.005), l3cSph(0.013, 0.014, 0.014, white, 0.086, s * 0.035, 0.016), l3cSph(0.0075, 0.0085, 0.0085, dark, 0.094, s * 0.035, 0.016), l3cBox(0.008, 0.036, 0.008, hair, 0.09, s * 0.036, 0.04), l3cBox(0.06, 0.012, 0.05, hair, -0.01, s * 0.085, 0.02));
    head.add(l3cBox(0.012, 0.004, 0.004, glasses, 0.0, s * 0.092, 0.018), l3cBox(0.09, 0.004, 0.004, dark, 0.05, s * 0.09, 0.018));
  });
  head.add(l3cSph(0.018, 0.015, 0.024, skin, 0.098, 0, -0.012), l3cBox(0.008, 0.044, 0.007, l3cPh(0x7d4d3a, 5), 0.092, 0, -0.058), l3cBox(0.012, 0.15, 0.04, glasses, 0.097, 0, 0.014));
  head.add(l3cSph(0.1, 0.085, 0.07, hair, -0.014, 0, 0.0));
  const hemi = (r, mat) => { const geo = new THREE.SphereGeometry(r, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2); geo.rotateX(Math.PI / 2); return new THREE.Mesh(geo, mat); };
  const hat = hemi(1, helm); hat.scale.set(0.125, 0.111, 0.103); hat.position.set(0, 0, 0.04); head.add(hat);
  const brim = hemi(1, helm); brim.scale.set(0.155, 0.12, 0.014); brim.position.set(0.048, 0, 0.042); head.add(brim);
  const peak = l3cBox(0.07, 0.12, 0.012, helm, 0.15, 0, 0.034); peak.rotation.y = 0.18; head.add(peak);
  head.add(l3cBox(0.2, 0.026, 0.015, helm, 0, 0, 0.14), l3cBox(0.2, 0.012, 0.01, l3cPh(0xe3b400, 60), 0, 0.045, 0.125), l3cBox(0.2, 0.012, 0.01, l3cPh(0xe3b400, 60), 0, -0.045, 0.125));
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.008, 8, 28), l3cPh(0x202428, 30)); band.scale.set(1.05, 0.93, 1); band.position.set(-0.002, 0, 0.032); head.add(band); head.add(l3cBox(0.03, 0.07, 0.04, dark, -0.12, 0, 0.03));
  [-1, 1].forEach(s => { const st = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.0281), new THREE.MeshBasicMaterial({ map: l3cLogoTex(true), transparent: true })); st.position.set(0.0, s * 0.1127, 0.083); l3cFace(st, 0, s, 0); head.add(st); const strap = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.0035, 6, 14, Math.PI * 0.8), dark); strap.rotation.x = Math.PI / 2; strap.rotation.z = Math.PI * 0.1; strap.position.set(0.0, s * 0.082, -0.01); head.add(strap); });
  const arm = side => {
    const sh = l3cGrp(0, side * 0.235, 0.52); spine.add(sh); sh.add(l3cSph(0.078, 0.07, 0.078, vest, 0, 0, 0.005), l3cCap(0.06, 0.29, shirt));
    const el = l3cGrp(0, 0, -0.28); sh.add(el); el.add(l3cSph(0.052, 0.052, 0.052, shirt, 0, 0, 0), l3cCap(0.048, 0.27, shirt), l3cBox(0.09, 0.09, 0.025, refl, 0, 0, -0.2), l3cBox(0.088, 0.088, 0.02, shirt, 0, 0, -0.255));
    const hand = l3cGrp(0, 0, -0.275); el.add(hand); hand.add(l3cBox(0.05, 0.085, 0.07, glove, 0.005, 0, -0.04), l3cBox(0.052, 0.088, 0.03, gloveY, 0.005, 0, -0.005), l3cSph(0.022, 0.016, 0.03, glove, 0.035, side * -0.018, -0.045));
    [-0.03, -0.01, 0.01, 0.03].forEach(y => hand.add(l3cBox(0.02, 0.018, 0.06, glove, 0.012, y, -0.1)));
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
  const g = new THREE.Group(), cab = l3cPh(0xe8e8ea, 60), chassis = l3cPh(0x2b2f35, 15), bed = l3cPh(0xff8a1e, 35), tire = l3cPh(0x1b1b1b, 5), hub = l3cPh(0xa4a9b0, 60), glass = l3cGlass(0x3b5b7a);
  g.add(l3cBox(8.4, 1.0, 0.45, chassis, 0, 0, 0.95)); g.add(l3cBox(2.3, 2.5, 2.3, cab, 3.6, 0, 2.15)); g.add(l3cBox(0.08, 2.2, 1.0, glass, 4.77, 0, 2.55)); g.add(l3cBox(1.2, 0.06, 0.8, glass, 3.8, 1.27, 2.55), l3cBox(1.2, 0.06, 0.8, glass, 3.8, -1.27, 2.55)); g.add(l3cBox(0.4, 2.55, 0.5, chassis, 4.9, 0, 1.2));
  const wheels = []; [3.2, -2.1, -3.5].forEach(x => [-1, 1].forEach(s => { const w = l3cWheel(0.55, 0.42, tire, hub, x, s * 1.15, 0.55); g.add(w.g); wheels.push(w); }));
  const bp = l3cGrp(-4.0, 0, 1.2); g.add(bp); bp.add(l3cBox(6.0, 2.5, 0.2, bed, 3.0, 0, 0)); bp.add(l3cBox(6.0, 0.18, 1.3, bed, 3.0, 1.16, 0.65), l3cBox(6.0, 0.18, 1.3, bed, 3.0, -1.16, 0.65)); bp.add(l3cBox(0.18, 2.5, 1.3, bed, 0.05, 0, 0.65), l3cBox(0.18, 2.5, 1.5, bed, 5.9, 0, 0.75));
  l3cMark(g);
  return { g, update: st => { const wk = st.work || 0; bp.rotation.y = -wk * 0.75; wheels.forEach(w => { w.g.rotation.y = -(st.travel || 0) / w.r; }); } };
}
function l3cLoader() {
  const g = new THREE.Group(), body = l3cPh(0xf5b400, 40), dark = l3cPh(0x2b2f35, 15), tire = l3cPh(0x1b1b1b, 5), hub = l3cPh(0xa4a9b0, 60), glass = l3cGlass(0x3b5b7a), steel = l3cPh(0x5a5f66, 30);
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
  let r;
  if (kind === "own") { const o = l3cOwn(rotQ); if (o) r = { ...o, kind }; else { kind = "human"; r = { ...l3cHuman(), cfg: L3C_CFG.human, kind }; } }
  else if (kind === "glb") { const o = typeof l3glbBuild === "function" ? l3glbBuild(rotQ) : null; if (o) r = { ...o, cfg: L3C_CFG.glb, kind }; else { kind = "human"; r = { ...l3cHuman(), cfg: L3C_CFG.human, kind }; } }
  else r = { ...(f ? f() : l3cHuman()), cfg: L3C_CFG[kind] || L3C_CFG.human, kind };
  if (kind !== "own" && kind !== "glb") { const bb = new THREE.Box3().setFromObject(r.g), sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3()), rx = Math.max(0.5, sz.x * ((kind === "human" || kind === "glb") ? 0.9 : 0.62)), ry = Math.max(0.5, sz.y * ((kind === "human" || kind === "glb") ? 0.9 : 0.62)); const sd = l3cShadow(rx, ry); sd.position.x = (kind === "human" || kind === "glb") ? 0 : c.x; sd.position.y = (kind === "human" || kind === "glb") ? 0 : c.y; r.g.add(sd); }
  return r;
}
