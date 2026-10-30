/* Lastbil (tippbil) och hjullastare i detalj för gå-läget (Victor 2026-10-30: "lastbilen och hjullastaren ska utvecklas grafikmässigt och användarmässigt med
   jobbanimationer minst lika mycket som mobilkranen").

   Lastbilen: chassi med ramar, tredelad hytt med glas, galler, strålkastare, speglar, avgasrör och varningsljus; styrande framhjul och dubbelmonterade bakhjul med slitbana;
   tippflak på led med hydraulcylinder, baklucka som svänger upp och en last (grus, sand, jord …) som glider ut och bildar en hög på marken bakom lastbilen.
   Hjullastaren: ledad (knäckstyrd) med motvikt, hytt, lyftarmar, tiltcylinder med länk, skopa med skär och tänder och en last som fylls ur högar och tippas.
   Högarna (l3pile) ligger kvar i scenen: tippar lastbilen en hög kan lastaren ta av den, och tvärtom. "Lasta och tippa automatiskt" kör hela arbetsvarvet.
   Båda returnerar { g, update(st), ranges } som övriga fordon (lagesplan-3dveh.js); st.ctl = reglagens värden, st.ctlT = målvärden, st.dt = bildtid. */

const L3V_MATS = [["Grus", 0x9a8f7d, 1.6], ["Sand", 0xcdb67f, 1.5], ["Jord", 0x5d4636, 1.7], ["Krossberg", 0x7d828a, 1.7], ["Betongkross", 0xa8a7a2, 1.5]];
const L3V_TRUCK_CAP = 14, L3V_BUCKET_CAP = 3.2; // m³
const l3vCylX = (r, len, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat); m.rotation.z = Math.PI / 2; m.position.set(x, y, z); return m; };
const l3vCylZ = (r, len, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); return m; };
const l3vCylYat = (r, len, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat); m.position.set(x, y, z); return m; };

/* ---- Högar på marken (delas av lastbil och hjullastare) ---------------------------------------------------------------------------------- */
const l3pile = { list: [], grp: null };
function l3pileGroup() {
  if (!l3pile.grp || !l3pile.grp.parent) { l3pile.grp = new THREE.Group(); l3pile.grp.name = "gaa-hogar"; l3pile.grp.userData.noIfc = true; l3pile.grp.userData.noHit = true; l3.scene.add(l3pile.grp); }
  return l3pile.grp;
}
const l3pileR = v => Math.cbrt(Math.max(v, 0.01) / 1.257); // halvellipsoid med höjd 0,62 · radie
function l3pileGeo() {
  if (l3pileGeo.g) return l3pileGeo.g;
  const geo = new THREE.SphereGeometry(1, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2); geo.rotateX(Math.PI / 2);
  const pos = geo.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), n = 0.5 + 0.5 * Math.sin(x * 9.3 + y * 5.1) * Math.cos(y * 7.7 - x * 3.1 + z * 4), k = 1 + 0.1 * (n - 0.5) * (1 - z * 0.6);
    pos.setXYZ(i, x * k, y * k, z * (0.92 + 0.16 * n)); const s = 0.8 + 0.28 * n + 0.1 * z; col.push(s, s, s);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals(); l3pileGeo.g = geo; return geo;
}
function l3pileUpdate(p) { const r = l3pileR(p.vol); p.mesh.scale.set(r, r, r * 0.62); p.mesh.position.set(p.x, p.y, p.z); p.mesh.material.color.setHex(L3V_MATS[p.mat % L3V_MATS.length][1]); p.r = r; }
function l3pileNear(x, y, rad) {
  let best = null, bd = 1e9; for (const p of l3pile.list) { const d = Math.hypot(p.x - x, p.y - y); if (d < rad + p.r * 0.8 && d < bd) { bd = d; best = p; } } return best;
}
function l3pileAdd(x, y, z, vol, mat) {
  if (!(vol > 0)) return null; let p = l3pileNear(x, y, 0.9);
  if (p && p.mat !== mat && p.vol > 0.3) p = null; // olika material blandas inte
  if (!p) {
    const mesh = new THREE.Mesh(l3pileGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true })); mesh.userData.noHit = true; mesh.userData.noIfc = false; mesh.userData.pile = true; mesh.renderOrder = 4;
    p = { x, y, z, vol: 0, mat, mesh, r: 0.1 }; l3pile.list.push(p); l3pileGroup().add(mesh);
  } else { p.x += (x - p.x) * Math.min(0.3, vol / (p.vol + vol + 1e-6)); p.y += (y - p.y) * Math.min(0.3, vol / (p.vol + vol + 1e-6)); }
  p.vol += vol; p.mat = mat; l3pileUpdate(p); return p;
}
function l3pileTake(p, vol) {
  const got = Math.min(vol, p.vol); p.vol -= got;
  if (p.vol < 0.04) { if (p.mesh.parent) p.mesh.parent.remove(p.mesh); p.mesh.material.dispose(); const i = l3pile.list.indexOf(p); if (i >= 0) l3pile.list.splice(i, 1); } else l3pileUpdate(p);
  return got;
}
function l3pileClear() { l3pile.list.slice().forEach(p => { if (p.mesh.parent) p.mesh.parent.remove(p.mesh); p.mesh.material.dispose(); }); l3pile.list = []; if (l3pile.grp && l3pile.grp.parent) l3pile.grp.parent.remove(l3pile.grp); l3pile.grp = null; if (typeof l3Render === "function") l3Render(); }

/* Last i flak/skopa: ett flackt berg som skalas med fyllnaden. */
function l3vHeapGeo(nx, ny, seed) {
  const geo = new THREE.PlaneGeometry(1, 1, nx, ny), pos = geo.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) * 2, v = pos.getY(i) * 2, n = 0.5 + 0.5 * Math.sin(u * 6 + seed) * Math.cos(v * 5 + seed * 1.7);
    let h = Math.max(0, 1 - Math.pow(Math.abs(u), 3.4)) * Math.max(0, 1 - Math.pow(Math.abs(v), 2.2)); h *= 0.84 + 0.16 * n; pos.setZ(i, h);
    const s = 0.78 + 0.3 * n + 0.12 * h; col.push(s, s, s);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals(); return geo;
}
const l3vHeapMesh = (nx, ny, seed) => { const m = new THREE.Mesh(l3vHeapGeo(nx, ny, seed), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true, side: THREE.DoubleSide })); m.userData.heap = true; return m; };

/* Däck med slitbana (axel Y). side = +1/−1: vilken sida som är utsidan (hjulmuttrarna). */
function l3vTyre(r, wd, tire, rim, hubM, side) {
  const w = new THREE.Group();
  w.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, wd, 32), tire), new THREE.Mesh(new THREE.CylinderGeometry(r * 0.975, r * 0.975, wd * 1.04, 32), tire));
  const N = Math.max(14, Math.round(r * 24));
  for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, lug = l3cBox(r * 0.075, wd * 0.88, r * 0.13, tire, Math.cos(a) * r * 0.99, 0, Math.sin(a) * r * 0.99); lug.rotation.y = Math.PI / 2 - a; w.add(lug); }
  w.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, wd * 1.02, 26), rim));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.3, wd * 1.1, 16), hubM); w.add(hub);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, nut = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.04, r * 0.04, wd * 0.12, 6), hubM); nut.position.set(Math.cos(a) * r * 0.45, side * wd * 0.55, Math.sin(a) * r * 0.45); w.add(nut); }
  return w;
}

/* ======================================================================================================================================== */
/* Lastbil (tippbil)                                                                                                                         */
/* ======================================================================================================================================== */
function l3vTruck() {
  const g = new THREE.Group(), B = l3cBox, P = l3cPh;
  const cabM = P(0xeceff1, 60), dark = P(0x1b1e22, 8), chas = P(0x2a2e34, 14), steel = P(0xb9bfc7, 90), tire = P(0x141517, 3, { rough: 0.95 }), rim = P(0xd0d4da, 85), hubM = P(0x7c828a, 70), bedM = P(0xf26b1d, 40), liner = P(0x7e848c, 25), glass = l3cGlass(0x35536f);
  const lampW = new THREE.MeshBasicMaterial({ color: 0xfff3cc }), lampA = new THREE.MeshBasicMaterial({ color: 0xff9a1a }), tailM = new THREE.MeshBasicMaterial({ color: 0x6a1212 }), revM = new THREE.MeshBasicMaterial({ color: 0x555a60 }), beaconM = new THREE.MeshBasicMaterial({ color: 0x6b4210 });
  // ---- chassi
  [-1, 1].forEach(s => g.add(B(9.9, 0.15, 0.32, chas, -0.25, s * 0.56, 1.0)));
  [-4.9, -3.6, -2.2, -0.6, 1.0, 2.4, 3.6].forEach(x => g.add(B(0.14, 1.3, 0.2, chas, x, 0, 1.0)));
  g.add(l3vCylX(0.34, 1.9, P(0x8f959c, 60), 0.4, -1.0, 0.82)); g.add(B(0.9, 0.5, 0.45, dark, 1.9, 0.95, 0.85)); // bränsletank, batterilåda
  [[3.9, 0], [-1.4, 0], [-2.85, 0]].forEach(([x]) => g.add(l3vCylYat(0.09, 2.5, steel, x, 0, 0.52)));        // axlar
  g.add(B(0.15, 2.5, 0.35, dark, -5.25, 0, 0.9), B(0.1, 0.5, 0.3, P(0xf4f4f4, 30), -5.32, 0.0, 0.85));      // bakre stötfångare med skylt
  // ---- hytt
  const cab = l3cGrp(3.75, 0, 0); g.add(cab);
  cab.add(B(2.25, 2.5, 1.45, cabM, 0, 0, 1.95), B(1.85, 2.45, 0.95, cabM, -0.12, 0, 3.05), B(1.45, 2.3, 0.1, cabM, -0.1, 0, 3.58), B(0.95, 2.35, 0.4, cabM, -0.85, 0, 3.4));
  const ws = B(0.06, 2.25, 0.85, glass, 0.84, 0, 3.0); ws.rotation.y = -0.2; cab.add(ws);
  [-1, 1].forEach(s => {
    cab.add(B(1.15, 0.05, 0.7, glass, -0.02, s * 1.24, 3.05), B(0.9, 0.05, 0.62, glass, 0.0, s * 1.26, 2.3), B(1.4, 0.04, 0.05, dark, 0.0, s * 1.26, 1.62), B(0.04, 0.04, 1.15, dark, -0.6, s * 1.26, 2.1), B(0.04, 0.04, 1.15, dark, 0.7, s * 1.26, 2.1), B(0.18, 0.04, 0.05, steel, 0.55, s * 1.27, 2.2));
    cab.add(B(0.5, 0.45, 0.06, steel, 0.5, s * 1.1, 1.18), B(0.5, 0.45, 0.06, steel, 0.5, s * 1.1, 0.84));                                                                                  // trappsteg
    cab.add(B(0.05, 0.5, 0.05, dark, 0.95, s * 1.45, 3.02), B(0.1, 0.32, 0.5, dark, 0.95, s * 1.72, 3.02), B(0.1, 0.22, 0.2, dark, 0.95, s * 1.62, 2.4)); // speglar
    cab.add(B(0.06, 0.4, 0.22, lampW, 1.14, s * 0.92, 1.4), B(0.06, 0.2, 0.14, lampA, 1.14, s * 1.12, 1.4), B(0.06, 0.18, 0.18, lampW, 1.18, s * 0.85, 0.95)); // strålkastare, blinkers, dimljus
  });
  cab.add(B(0.07, 1.65, 0.75, dark, 1.14, 0, 1.55)); for (let i = 0; i < 5; i++) cab.add(B(0.05, 1.6, 0.04, steel, 1.19, 0, 1.28 + i * 0.12));
  cab.add(B(0.05, 0.62, 0.14, steel, 1.2, 0, 1.78), B(0.45, 2.6, 0.4, dark, 1.3, 0, 0.78), B(0.4, 2.3, 0.05, cabM, 1.0, 0, 2.72));
  [-0.7, -0.25, 0.25, 0.7].forEach(y => cab.add(B(0.1, 0.18, 0.1, lampA, 0.45, y, 3.66)));
  cab.add(l3vCylZ(0.09, 2.0, steel, -1.35, 1.2, 2.55), l3vCylZ(0.09, 1.5, dark, -1.35, -1.2, 2.3));                  // avgasrör och luftintag bakom hytten
  const beacon = l3cGrp(-0.5, 0, 3.64); beacon.add(l3vCylZ(0.14, 0.1, dark, 0, 0, 0.05), new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), beaconM)); beacon.children[1].rotation.x = Math.PI / 2; cab.add(beacon);
  // ---- hjul: styrande fram, dubbelmonterade bak
  const wheels = [], steer = [];
  const addW = (x, y, r, wd, dual) => {
    const side = y > 0 ? 1 : -1, st = l3cGrp(x, y, r); g.add(st); const w = l3vTyre(r, wd, tire, rim, hubM, side); st.add(w); wheels.push({ g: w, r }); if (!dual) steer.push(st);
    if (dual) { const st2 = l3cGrp(x, y - side * (wd + 0.06), r); g.add(st2); const w2 = l3vTyre(r, wd, tire, rim, hubM, -side); st2.add(w2); wheels.push({ g: w2, r }); }
    g.add(B(1.25, 0.14, 0.06, dark, x, y - side * (dual ? 0.1 : 0), r * 2 + 0.17)); g.add(B(0.1, 0.6, 0.25, dark, x - r - 0.12, y, 0.52));                  // skärm och stänkskydd
  };
  [-1, 1].forEach(s => { addW(3.9, s * 1.15, 0.55, 0.38, false); addW(-1.4, s * 1.1, 0.54, 0.3, true); addW(-2.85, s * 1.1, 0.54, 0.3, true); });
  // ---- flak på led
  const BL = 6.7, BW = 2.5, bedG = l3cGrp(-5.1, 0, 1.28); g.add(bedG);
  bedG.add(B(BL, BW, 0.16, bedM, BL / 2, 0, 0.08), B(BL - 0.25, BW - 0.3, 0.03, liner, BL / 2, 0, 0.17));
  for (let i = 0; i < 9; i++) bedG.add(B(0.12, BW - 0.2, 0.14, dark, 0.35 + i * 0.78, 0, -0.05));
  bedG.add(B(BL, 0.12, 0.1, dark, BL / 2, 0.55, -0.05), B(BL, 0.12, 0.1, dark, BL / 2, -0.55, -0.05));
  [-1, 1].forEach(s => {
    bedG.add(B(BL, 0.1, 1.2, bedM, BL / 2, s * (BW / 2 - 0.05), 0.72), B(BL + 0.05, 0.2, 0.14, P(0xd9dde2, 70), BL / 2, s * (BW / 2 - 0.05), 1.34));
    for (let j = 0; j < 7; j++) bedG.add(B(0.1, 0.14, 1.24, bedM, 0.45 + j * 1.0, s * (BW / 2 + 0.03), 0.72));
    bedG.add(B(0.45, 0.04, 0.12, P(0xf6d02f, 30), 0.5 + 0.0, s * (BW / 2 + 0.1), 0.35), B(0.45, 0.04, 0.12, P(0xf6d02f, 30), BL - 0.6, s * (BW / 2 + 0.1), 0.35));
  });
  bedG.add(B(0.14, BW, 1.55, bedM, BL - 0.07, 0, 0.92), B(1.05, BW + 0.1, 0.1, bedM, BL + 0.35, 0, 1.78)); bedG.children[bedG.children.length - 1].rotation.y = -0.1;
  bedG.add(l3vCylYat(0.1, BW + 0.2, steel, 0, 0, 0.12));                                                                                          // ledtapp
  const gate = l3cGrp(0, 0, 1.38); bedG.add(gate); gate.add(B(0.1, BW - 0.14, 1.22, bedM, 0, 0, -0.62)); [-0.9, -0.45].forEach(z => gate.add(B(0.14, BW - 0.16, 0.08, dark, 0, 0, z))); [-1, 1].forEach(s => gate.add(B(0.14, 0.12, 0.24, steel, -0.04, s * 0.7, -1.18)));
  // ---- bakljus
  [-1, 1].forEach(s => { g.add(B(0.06, 0.28, 0.2, tailM, -5.3, s * 1.0, 1.1), B(0.06, 0.2, 0.14, revM, -5.3, s * 0.72, 1.1), B(0.06, 0.18, 0.1, lampA, -5.3, s * 1.2, 1.28)); });
  // ---- tippcylinder (teleskop) mellan chassit och flakets underrede
  const ram = l3vRam(g, l3vAnchor(g, -1.0, 0, 1.0), l3vAnchor(bedG, 3.6, 0, -0.12), [dark, steel], 0.17, 0.12);
  // ---- last i flaket
  const heapM = l3vHeapMesh(30, 12, 3.1); bedG.add(heapM);
  // ---- tippzon (visas med "Visa tippzon")
  const zone = new THREE.Group(); const zm = new THREE.Mesh(new THREE.PlaneGeometry(6, 3.2), new THREE.MeshBasicMaterial({ color: 0xff7a00, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })); zm.position.set(-8.6, 0, 0.06); zone.add(zm);
  const zl = l3vLabel(1.8, 0.9); zl.userData.set("Tippzon", "#ffb45a"); zl.position.set(-8.6, 0, 0.9); zone.add(zl); zone.userData.noIfc = true; g.add(zone);
  l3cMark(g); g.traverse(o => { if (o.userData && o.userData.heap) o.userData.noHit = true; });
  let steerV = 0, lastMat = -1, lastT = 0, bt = 0;
  const update = st => {
    const c = st.ctl || { tip: 0, gate: 0, load: 0.7, mat: 0 }, T = st.ctlT, dt = Math.min(0.1, st.dt || 0.016);
    bedG.rotation.y = -c.tip; gate.rotation.y = c.gate * 1.3;
    steerV += ((st.steer || 0) - steerV) * Math.min(1, dt * 6); steer.forEach(s => { s.rotation.z = steerV * 0.5; });
    wheels.forEach(w => { w.g.rotation.y = (st.travel || 0) / w.r; });
    g.updateMatrixWorld(true); ram();
    // last: höjd och längd följer fyllnaden, och glider mot bakluckan när flaket tippas
    const f = Math.max(0, Math.min(1, c.load)); heapM.visible = f > 0.015;
    if (lastMat !== c.mat) { lastMat = c.mat; heapM.material.color.setHex(L3V_MATS[c.mat % L3V_MATS.length][1]); }
    const sx = (BL - 0.5) * (0.5 + 0.5 * f) * (1 - 0.0 * c.tip), sy = BW - 0.3; heapM.scale.set(sx, sy, 1.35 * f); heapM.position.set(0.25 + sx / 2, 0, 0.18);
    // tömning: flaket tippat och bakluckan öppen → lasten rinner ut och bildar en hög bakom
    if (c.tip > 0.42 && c.gate > 0.5 && c.load > 0) {
      const d = Math.min(c.load, dt * 0.2 * Math.min(1, (c.tip - 0.3) / 0.5) * Math.min(1, (c.gate - 0.3) / 0.5)); c.load -= d; if (T) T.load = c.load;
      const rear = g.localToWorld(new THREE.Vector3(-6.2 - c.tip * 0.4, 0, 0)); l3pileAdd(rear.x, rear.y, g.position.z, d * L3V_TRUCK_CAP, c.mat);
    }
    // lampor: bromsljus när man backar/stannar, backljus, varningsljus som blinkar när arbetsläget är på
    tailM.color.setHex(st.brake ? 0xff2a1a : 0x6a1212); revM.color.setHex(st.rev ? 0xffffff : 0x555a60);
    beaconM.color.setHex(st.work > 0.5 && Math.sin(st.t * 9) > 0 ? 0xffa21a : 0x6b4210);
    zone.visible = !!st.showRadius;
    const m = L3V_MATS[c.mat % L3V_MATS.length], ton = c.load * L3V_TRUCK_CAP * m[2];
    st.info = [["Flakvinkel", Math.round(c.tip * 180 / Math.PI) + "°"], ["Baklucka", c.gate > 0.5 ? "öppen" : c.gate > 0.05 ? "på glänt" : "stängd"], ["Last", `${l3vFmt(c.load * L3V_TRUCK_CAP)} m³ · ${l3vFmt(ton)} ton`], ["Material", m[0]], ["Högar på marken", String(l3pile.list.length)]];
  };
  void lastT; void bt;
  return { g, update, ranges: { tip: [0, 0.98], gate: [0, 1], load: [0, 1] } };
}

/* ======================================================================================================================================== */
/* Hjullastare                                                                                                                              */
/* ======================================================================================================================================== */
function l3vLoader() {
  const g = new THREE.Group(), B = l3cBox, P = l3cPh;
  const body = P(0xf5b400, 45), bodyD = P(0xd49a00, 35), dark = P(0x1f2328, 8), grey = P(0x474c54, 25), steel = P(0xb9bfc7, 90), tire = P(0x141517, 3, { rough: 0.95 }), rim = P(0xe4b100, 50), hubM = P(0x7c828a, 70), glass = l3cGlass(0x2f4a66), bucketM = P(0x6f7680, 35), edgeM = P(0xc9ced4, 85);
  const lampW = new THREE.MeshBasicMaterial({ color: 0xfff3cc }), tailM = new THREE.MeshBasicMaterial({ color: 0x6a1212 }), beaconM = new THREE.MeshBasicMaterial({ color: 0x6b4210 }), amber = new THREE.MeshBasicMaterial({ color: 0xff9a1a });
  // ---- bakre ram
  g.add(B(1.9, 2.1, 0.7, grey, -1.7, 0, 1.15), B(2.7, 2.15, 1.05, body, -1.95, 0, 1.95), B(1.35, 2.7, 1.2, bodyD, -3.3, 0, 1.8), B(0.1, 2.5, 0.75, dark, -3.98, 0, 1.85));
  for (let i = 0; i < 6; i++) g.add(B(0.05, 2.1, 0.05, dark, -4.03, 0, 1.55 + i * 0.12));   // kylargaller
  [-1, 1].forEach(s => { g.add(B(1.2, 0.5, 0.12, grey, -1.7, s * 1.12, 1.62)); g.add(B(0.06, 0.3, 0.2, tailM, -4.02, s * 1.05, 2.2)); });
  g.add(l3vCylZ(0.1, 1.3, steel, -1.0, 0.85, 3.1), l3vCylZ(0.14, 1.0, dark, -2.4, -0.75, 3.0));                 // avgasrör, luftintag
  g.add(l3vCylZ(0.2, 1.5, grey, 0.0, 0, 1.4));                                                                // ledtapp
  g.add(l3vCylYat(0.12, 2.4, steel, -1.65, 0, 0.95));
  // ---- hytt
  const cab = l3cGrp(-0.55, 0, 0); g.add(cab);
  cab.add(B(1.9, 1.9, 0.12, dark, 0, 0, 1.62), B(2.1, 2.0, 0.1, body, 0, 0, 3.6));
  [[-0.9, -0.9], [-0.9, 0.9], [0.9, -0.9], [0.9, 0.9]].forEach(([x, y]) => cab.add(B(0.1, 0.1, 1.95, body, x, y, 2.6)));
  cab.add(B(0.04, 1.8, 1.8, glass, 0.95, 0, 2.6), B(0.04, 1.75, 1.7, glass, -0.95, 0, 2.6), B(1.8, 0.04, 1.8, glass, 0, 0.95, 2.6), B(1.8, 0.04, 1.8, glass, 0, -0.95, 2.6));
  cab.add(B(0.5, 0.55, 0.5, dark, -0.3, 0, 1.95), B(0.5, 0.55, 0.9, dark, -0.55, 0, 2.3), l3vCylZ(0.2, 0.04, dark, 0.45, 0, 2.35)); cab.children[cab.children.length - 1].rotation.y = 0.9; // sits och ratt
  [-1, 1].forEach(s => { cab.add(B(0.45, 0.4, 0.06, steel, 0.0, s * 1.05, 1.35), B(0.45, 0.4, 0.06, steel, 0.0, s * 1.05, 0.95)); cab.add(B(0.1, 0.3, 0.1, lampW, 0.8, s * 0.6, 3.7), B(0.1, 0.3, 0.1, lampW, -0.8, s * 0.6, 3.7)); cab.add(B(0.05, 0.4, 0.05, dark, 1.0, s * 1.15, 3.1), B(0.1, 0.1, 0.35, dark, 1.0, s * 1.4, 3.1)); });
  const beacon = l3cGrp(-0.8, 0, 3.66); beacon.add(l3vCylZ(0.14, 0.1, dark, 0, 0, 0.05), new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), beaconM)); beacon.children[1].rotation.x = Math.PI / 2; cab.add(beacon);
  // ---- bakhjul
  const wheels = [];
  [-1, 1].forEach(s => { const st = l3cGrp(-1.65, s * 1.15, 0.95); g.add(st); const w = l3vTyre(0.95, 0.75, tire, rim, hubM, s); st.add(w); wheels.push({ g: w, r: 0.95 }); g.add(B(1.7, 0.95, 0.07, body, -1.65, s * 1.15, 2.0), B(0.1, 0.8, 0.5, dark, -2.7, s * 1.15, 0.7)); });
  // ---- främre ram (knäckstyrd)
  const F = l3cGrp(0, 0, 0); g.add(F);
  F.add(B(2.5, 1.7, 0.95, grey, 1.05, 0, 1.15), B(0.7, 2.3, 0.6, bodyD, 2.1, 0, 1.0), l3vCylYat(0.12, 2.4, steel, 1.7, 0, 0.95), B(0.4, 1.6, 0.4, dark, 0.35, 0, 1.45));
  [-1, 1].forEach(s => {
    const st = l3cGrp(1.7, s * 1.15, 0.95); F.add(st); const w = l3vTyre(0.95, 0.75, tire, rim, hubM, s); st.add(w); wheels.push({ g: w, r: 0.95 });
    F.add(B(1.7, 0.95, 0.07, body, 1.7, s * 1.15, 2.0), B(0.1, 0.8, 0.5, dark, 0.7, s * 1.15, 0.7));
    F.add(B(0.8, 0.22, 2.0, bodyD, 0.95, s * 0.98, 1.95), B(0.5, 0.26, 0.3, dark, 0.95, s * 0.98, 3.0));       // lyftstativ
    F.add(B(0.06, 0.34, 0.2, lampW, 2.5, s * 0.8, 1.15), B(0.05, 0.2, 0.12, amber, 2.5, s * 1.05, 1.15));
  });
  F.add(B(0.45, 2.1, 0.3, bodyD, 0.95, 0, 3.0));
  // ---- lyftarmar
  const A = l3cGrp(0.95, 0, 2.95); F.add(A);
  [-1, 1].forEach(s => {
    const y = s * 1.22; A.add(B(2.3, 0.3, 0.62, body, 1.15, y, 0), B(1.6, 0.3, 0.5, body, 2.75, y, -0.1), B(0.4, 0.34, 0.5, dark, 3.55, y, -0.18), B(0.34, 0.34, 0.34, steel, 0, y, 0));
  });
  A.add(B(0.4, 2.45, 0.42, bodyD, 1.45, 0, 0.05), B(0.3, 2.45, 0.3, bodyD, 3.3, 0, 0.0));
  const lev = B(0.22, 0.22, 1.0, dark, 1.7, 0, 0.5); A.add(lev);                                              // tiltlänkens vinkelarm
  // ---- skopa
  const BK = l3cGrp(3.55, 0, -0.18); A.add(BK);
  BK.add(B(1.75, 3.0, 0.1, bucketM, 0.9, 0, -0.82), B(0.1, 3.0, 1.15, bucketM, 0.05, 0, -0.3), B(0.55, 3.0, 0.08, bucketM, 0.22, 0, 0.3), B(0.25, 3.05, 0.07, edgeM, 1.83, 0, -0.83));
  [-1, 1].forEach(s => { BK.add(B(1.75, 0.1, 0.95, bucketM, 0.9, s * 1.48, -0.38), B(0.25, 0.26, 0.5, steel, 0.0, s * 1.22, -0.12)); });
  for (let i = -3; i <= 3; i++) { const th = B(0.3, 0.14, 0.09, edgeM, 1.98, i * 0.42, -0.83); th.rotation.y = 0.12; BK.add(th); }
  BK.add(B(0.2, 0.22, 0.65, dark, 0.2, 0, 0.55));
  const edge = l3vAnchor(BK, 1.98, 0, -0.85), heapM = l3vHeapMesh(18, 8, 1.7); BK.add(heapM);
  // ---- cylindrar
  const rams = [];
  [-1, 1].forEach(s => rams.push(l3vRam(F, l3vAnchor(F, 1.35, s * 1.1, 1.0), l3vAnchor(A, 1.5, s * 1.22, -0.4), [grey, steel], 0.14, 0.09)));
  rams.push(l3vRam(F, l3vAnchor(F, 0.85, 0, 3.15), l3vAnchor(A, 1.7, 0, 0.95), [grey, steel], 0.13, 0.085));
  rams.push(l3vRam(A, l3vAnchor(A, 1.7, 0, 0.95), l3vAnchor(BK, 0.2, 0, 0.7), [dark, steel], 0.06, 0.06));
  // ---- lyfthöjdsstolpe (visas med "Visa lyfthöjd")
  const pole = new THREE.Group(); const pl = l3vLabel(1.6, 0.8); pole.add(pl); pole.userData.noIfc = true; const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 6), new THREE.MeshBasicMaterial({ color: 0xffb45a, transparent: true, opacity: 0.8 })); pm.rotation.x = Math.PI / 2; pole.add(pm); g.add(pole);
  l3cMark(g); g.traverse(o => { if (o.userData && o.userData.heap) o.userData.noHit = true; });
  let steerV = 0, lastMat = -1, pb = 0;
  const wv = new THREE.Vector3(), lv = new THREE.Vector3();
  const update = st => {
    const c = st.ctl || { arm: 0, bucket: 0.15, fill: 0, mat: 0 }, T = st.ctlT, dt = Math.min(0.1, st.dt || 0.016);
    steerV += ((st.steer || 0) - steerV) * Math.min(1, dt * 5); F.rotation.z = steerV * 0.6;
    A.rotation.y = 0.58 - c.arm; BK.rotation.y = -c.bucket - 0.58 + c.arm;   // armen hänger 33° nedåt i grundläget så att skopkanten når marken
    wheels.forEach(w => { w.g.rotation.y = (st.travel || 0) / w.r; });
    g.updateMatrixWorld(true); rams.forEach(r => r());
    edge.getWorldPosition(wv); const ez = wv.z - g.position.z, head = g.rotation.z + F.rotation.z;
    // skopan fylls ur en hög när kanten går ner i den och skopan kröks in (eller automatiskt vid "Lasta och tippa"), och tippas ut över marken
    const curlRate = (c.bucket - pb) / Math.max(dt, 1e-3); pb = c.bucket;
    const nearG = ez < 1.5 && c.arm < 0.35, pile = nearG ? l3pileNear(wv.x, wv.y, 0.7) : null, autoDig = !!st.autoDig;
    if (nearG && c.fill < 1 && ((pile && (st.speed > 0.25 || curlRate > 0.12)) || autoDig)) {
      const want = dt * (autoDig ? 0.42 : 0.5), vol = want * L3V_BUCKET_CAP; let got = vol;
      if (pile) { got = l3pileTake(pile, vol); c.mat = pile.mat; } else if (!autoDig) got = 0;
      c.fill = Math.min(1, c.fill + got / L3V_BUCKET_CAP); if (T) T.fill = c.fill;
    }
    if (ez > 0.15 && c.bucket < -0.12 && c.fill > 0.002) {
      const d = Math.min(c.fill, dt * 0.7 * Math.min(1, 0.25 + (-0.12 - c.bucket) / 0.5)); c.fill -= d; if (T) T.fill = c.fill;
      l3pileAdd(wv.x + Math.cos(head) * 0.35, wv.y + Math.sin(head) * 0.35, g.position.z, d * L3V_BUCKET_CAP, c.mat);
    }
    const f = Math.max(0, Math.min(1, c.fill)); heapM.visible = f > 0.02; if (lastMat !== c.mat) { lastMat = c.mat; heapM.material.color.setHex(L3V_MATS[c.mat % L3V_MATS.length][1]); }
    heapM.scale.set(1.5, 2.8, 0.22 + 0.95 * f); heapM.position.set(0.85, 0, -0.76);
    tailM.color.setHex(st.brake || st.rev ? 0xff2a1a : 0x6a1212); beaconM.color.setHex(st.work > 0.5 && Math.sin(st.t * 9) > 0 ? 0xffa21a : 0x6b4210);
    // mått: lyfthöjd (skopkant och ledpunkt) och räckvidd framåt
    lv.copy(wv); g.worldToLocal(lv); const reach = Math.hypot(lv.x, lv.y), tipH = Math.max(0, ez);
    pole.visible = !!st.showRadius; if (pole.visible) { pole.position.set(lv.x + 0.25, lv.y, 0); pm.scale.set(1, 1, 1); pm.scale.y = Math.max(0.05, ez); pm.position.set(0, 0, Math.max(0.05, ez) / 2); pl.position.set(0, 0, Math.max(0.05, ez) + 0.6); pl.userData.set("Kant " + l3vFmt(ez) + " m", "#ffb45a"); }
    void tipH;
    const m = L3V_MATS[c.mat % L3V_MATS.length];
    st.info = [["Skopkant över marken", l3vFmt(Math.max(0, ez)) + " m"], ["Räckvidd från hjulbas", l3vFmt(reach) + " m"], ["Skopa", `${Math.round(f * 100)} % · ${l3vFmt(f * L3V_BUCKET_CAP)} m³ ${m[0].toLowerCase()}`], ["Knäckvinkel", Math.round(F.rotation.z * 180 / Math.PI) + "°"], ["Högar på marken", String(l3pile.list.length)]];
  };
  return { g, update, ranges: { arm: [0, 1.2], bucket: [-0.85, 0.6], fill: [0, 1] } };
}

/* ---- Reglage i gå-lägets panel (lagesplan-3dwalk.js anropar de här) -------------------------------------------------------------------------- */
const L3V2_AUTO = { truck: ["Tippa lasten automatiskt", "Avbryt tippningen"], loader: ["Lasta och tippa automatiskt", "Stoppa arbetsvarvet"] };
/* Arbetsvarvet i steg. Lastbil: tippa flaket → öppna luckan → töm → sänk → stäng. Hjullastare: skopa ner → fyll → lyft → tippa → tillbaka. */
function l3v2CtlStep(kind, dt, K, mv, k) {
  const c = l3w.ctl, T = l3w.ctlT, R = (l3w.av && l3w.av.ranges) || {}, cl = (v, r) => Math.max(r[0], Math.min(r[1], v));
  if (kind === "truck") {
    if (l3w.auto) {
      const s = l3w.autoS || 0;
      if (s === 0) { if (c.load < 0.04) { l3Status("Flaket är tomt – fyll det först (Fyll flaket).", true); l3w.auto = false; } else { T.tip = 0.98; if (c.tip > 0.3) T.gate = 1; if (c.tip > 0.95 && c.gate > 0.95) l3w.autoS = 1; } }
      else if (s === 1) { T.tip = 0.98; T.gate = 1; if (c.load < 0.012) { c.load = 0; T.load = 0; l3w.autoS = 2; } }
      else if (s === 2) { T.tip = 0; if (c.tip < 0.35) T.gate = 0; if (c.tip < 0.02 && c.gate < 0.03) { l3w.auto = false; l3w.autoS = 0; l3Status("Lasten är tippad. Fyll flaket för ett nytt varv."); } }
    } else if (l3w.workOn && (k.kx || k.ky || k.kp)) { T.tip += k.ky * 0.5 * dt; T.gate += k.kx * 0.9 * dt; T.load += k.kp * 0.3 * dt; }
    T.tip = cl(T.tip, R.tip || [0, 0.98]); T.gate = cl(T.gate, [0, 1]); T.load = cl(T.load, [0, 1]);
    c.tip = mv(c.tip, T.tip, 0.28); c.gate = mv(c.gate, T.gate, 0.9); if (T.load > c.load + 1e-4 || (T.load < c.load - 1e-4 && !(c.tip > 0.42 && c.gate > 0.5))) c.load = mv(c.load, T.load, 0.25);
  } else if (kind === "loader") {
    if (l3w.auto) {
      const s = l3w.autoS || 0; l3w.autoT += dt;
      if (s === 0) { T.arm = 0; T.bucket = -0.02; if (c.arm < 0.04 && Math.abs(c.bucket - T.bucket) < 0.05) { l3w.autoS = 1; l3w.autoT = 0; } }
      else if (s === 1) { T.arm = 0; T.bucket = 0.55; if ((c.fill > 0.97 && c.bucket > 0.5) || l3w.autoT > 6) { l3w.autoS = 2; l3w.autoT = 0; } }
      else if (s === 2) { T.arm = 1.0; T.bucket = 0.5; if (c.arm > 0.96) { l3w.autoS = 3; l3w.autoT = 0; } }
      else if (s === 3) { T.bucket = -0.8; if (c.fill < 0.01 && c.bucket < -0.75) { c.fill = 0; T.fill = 0; l3w.autoS = 4; } }
      else if (s === 4) { T.bucket = 0.12; T.arm = 0; if (c.arm < 0.04) { l3w.autoS = 0; l3w.autoN = (l3w.autoN || 0) + 1; } }
    } else if (l3w.workOn && (k.kx || k.ky)) { T.arm += k.ky * 0.5 * dt; T.bucket += k.kx * 0.9 * dt; }
    T.arm = cl(T.arm, R.arm || [0, 1.2]); T.bucket = cl(T.bucket, R.bucket || [-0.85, 0.6]); T.fill = cl(T.fill, [0, 1]);
    c.arm = mv(c.arm, T.arm, 0.55); c.bucket = mv(c.bucket, T.bucket, 0.9); if (Math.abs(T.fill - c.fill) > 1e-4) c.fill = mv(c.fill, T.fill, 0.8);
  }
}
function l3v2Info(kind) { return kind === "truck" ? "Pilar: ↑↓ flakets tippvinkel · ←→ baklucka · + / −: last" : "Pilar: ↑↓ lyftarmar · ←→ skopa. Kör in i en hög och kröks in för att fylla"; }
function l3v2PanelHtml(kind, sliders, T) {
  const lab = L3V2_AUTO[kind], m = L3V_MATS[(T.mat || 0) % L3V_MATS.length][0], title = kind === "truck" ? "Reglage · Lastbil (tippbil)" : "Reglage · Hjullastare";
  const act = kind === "truck" ? `<button type="button" data-cb="fillnow" title="Fyller flaket (till 100 %)">Fyll flaket</button><button type="button" data-cb="emptynow" title="Tömmer flaket utan att tippa">Töm</button>` : `<button type="button" data-cb="fillnow" title="Fyller skopan direkt">Fyll skopan</button><button type="button" data-cb="emptynow" title="Tömmer skopan på plats">Töm</button>`;
  return `<b>${title}</b><button type="button" data-cb="auto" class="${l3w.auto ? "on" : ""}">${l3w.auto ? lab[1] : lab[0]}</button>${sliders}<div class="v3-ctl-r"><button type="button" data-cb="mat" title="Byt material för lasten">Material: ${m}</button>${act}</div><div class="v3-ctl-r" id="v3CtlInfo"></div><label class="v3-chk"><input type="checkbox" data-cb="rad" ${l3w.showRadius ? "checked" : ""}> ${kind === "truck" ? "Visa tippzon bakom" : "Visa höjdmått vid skopan"}</label><button type="button" data-cb="clearpiles" title="Tar bort alla högar som lastbilen och lastaren lämnat på marken">Ta bort högar</button><button type="button" data-cb="lock" title="Låser maskinen i det här läget och lämnar körningen – sedan kan du flyga runt och exportera den som IFC">📌 Lås här och flyg runt</button><small>${l3v2Info(kind)}</small>`;
}
/* Klick på de extra knapparna; returnerar true om klicket hanterades. */
function l3v2Click(k) {
  if (!l3w.ctl || (l3w.kind !== "truck" && l3w.kind !== "loader")) return false;
  const c = l3w.ctl, T = l3w.ctlT;
  if (k === "mat") { c.mat = ((c.mat || 0) + 1) % L3V_MATS.length; T.mat = c.mat; l3wCtlPanel(); return true; }
  if (k === "fillnow") { if (l3w.kind === "truck") T.load = 1; else { T.fill = 1; } return true; }
  if (k === "emptynow") { if (l3w.kind === "truck") { T.load = 0; c.load = 0; } else { T.fill = 0; c.fill = 0; } return true; }
  if (k === "clearpiles") { l3pileClear(); return true; }
  return false;
}
