/* 3D-vyn – animera placerade objekt (Sketchfab-modeller, etablering m.m.) på filmens tidslinje
   (Victor 2026-10-12: "styra animeringen själv av hämtade objekt från Sketchfab, nästan på samma sätt som jag
   lägger in vyer på tidslinjen").

   – Markera ett objekt, flytta/vrid det med handtaget, dra tidslinjens huvud till ett datum och tryck ◆ Nyckel:
     objektets läge (plats, höjd, vridning) sparas på datumet. Flera nycklar = rörelsen mellan dem (mjuk övergång).
   – Före första nyckeln står objektet som den första nyckeln, efter den sista som den sista.
   – Nycklarna sparas på objektet i plan_placements.json (p.anim) – samma sparning som övriga placeringar.
   – Synlig (Victor 2026-10-12): varje nyckel säger om objektet syns från den nyckeln och framåt (tills nästa nyckel) –
     ett objekt kan alltså dyka upp och försvinna. Före första nyckeln gäller första nyckelns val.
   – Bana: en streckad linje i 3D genom nycklarnas lägen (visas medan tidslinjen är öppen, aldrig i uppspelning/film).
   – Följ banan: objektet vrids efter färdriktningen (mjuk sväng vid nycklarna). Första nyckelns vridning är
     utgångsläget, så modellens "fram" spelar ingen roll.
   – Bara visning: objektets grundläge (p.x, p.y …) ändras inte. ◆ på tidslinjen: tryck = gå dit och markera objektet,
     dra = nytt datum, högerklick = ta bort. */

const L3ANIM_DAY = 86400000;
const l3animDate = iso => { const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number); return Date.UTC(y, (m || 1) - 1, d || 1); };
const l3animFence = p => !!((typeof placeLib === "function" ? placeLib(p.type) : null) || {}).fence;
const l3animKeys = p => (Array.isArray(p && p.anim) ? p.anim : []).filter(k => k && k.date && Number.isFinite(k.x) && Number.isFinite(k.y)).sort((a, b) => a.date.localeCompare(b.date));
const l3animAll = () => (typeof placements === "undefined" ? [] : placements).filter(p => !l3animFence(p) && l3animKeys(p).length);

/* Objektets läge som det står i 3D-vyn just nu. */
function l3animPose(p) {
  const g = l3 && l3.placeMeshes && l3.placeMeshes.get(p.id); if (!g) return null;
  const r = (v, n = 1000) => Math.round(v * n) / n;
  return { x: r(g.position.x + l3.O[0]), y: r(g.position.y + l3.O[1]), dz: r(g.position.z + l3.O[2] - (Number(p.z) || 0)), rot: r(g.rotation.z * 180 / Math.PI, 100) };
}
/* ◆ Nyckel: de markerade objektens läge läggs på datumet (finns en nyckel där uppdateras den). */
function l3animCapture(iso) {
  const ids = [...((l3 && l3.sel) || [])], list = ids.map(id => placements.find(p => p.id === id)).filter(p => p && !l3animFence(p));
  if (!list.length) { l3Status("Markera ett placerat objekt först (t.ex. en hämtad modell), ställ in det och tryck ◆ Nyckel.", true); return 0; }
  if (typeof placeSnapshot === "function") placeSnapshot();
  list.forEach(p => {
    const pose = l3animPose(p); if (!pose) return;
    const keys = l3animKeys(p).filter(k => k.date !== iso);
    keys.push({ date: iso, ...pose, ...(l3fs.vis === false ? { v: false } : {}) });
    p.anim = keys.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 60);
    if (typeof placeTouch === "function") placeTouch(p);
  });
  l3Status(`Nyckel på ${iso}: ${list.map(p => p.name || p.type).join(", ")}.`);
  return list.length;
}
/* Följ banan på/av för de markerade animerade objekten. */
function l3animFaceSet(on) {
  const list = [...((l3 && l3.sel) || [])].map(id => placements.find(p => p.id === id)).filter(p => p && !l3animFence(p));
  if (!list.length) { l3Status("Markera ett animerat objekt först.", true); return 0; }
  if (typeof placeSnapshot === "function") placeSnapshot();
  list.forEach(p => { if (on) p.animFace = true; else delete p.animFace; if (typeof placeTouch === "function") placeTouch(p); });
  l3Status(`${list.map(p => p.name || p.type).join(", ")}: ${on ? "vrids efter färdriktningen" : "vrids som nycklarna säger"}.`);
  return list.length;
}
function l3animRemove(id, date) {
  const p = placements.find(q => q.id === id); if (!p) return;
  if (typeof placeSnapshot === "function") placeSnapshot();
  p.anim = l3animKeys(p).filter(k => k.date !== date); if (!p.anim.length) delete p.anim;
  if (typeof placeTouch === "function") placeTouch(p);
}
function l3animMove(id, from, to) {
  const p = placements.find(q => q.id === id); if (!p) return;
  if (typeof placeSnapshot === "function") placeSnapshot();
  const keys = l3animKeys(p), k = keys.find(x => x.date === from); if (!k) return;
  p.anim = keys.filter(x => x.date !== to || x === k); k.date = to; p.anim.sort((a, b) => a.date.localeCompare(b.date));
  if (typeof placeTouch === "function") placeTouch(p);
}
/* Färdriktningen (grader) för varje sträcka mellan två nycklar; stillastående sträckor ärver föregående riktning. */
function l3animHeads(keys) {
  const h = [];
  for (let i = 0; i < keys.length - 1; i++) { const dx = keys[i + 1].x - keys[i].x, dy = keys[i + 1].y - keys[i].y; h.push(Math.hypot(dx, dy) > 1e-6 ? Math.atan2(dy, dx) * 180 / Math.PI : null); }
  const first = h.find(v => v !== null); if (first === undefined) return null;
  for (let i = 0; i < h.length; i++) if (h[i] === null) h[i] = i ? h[i - 1] : first;
  return h;
}
const l3animLerpAng = (a, b, s) => a + (((b - a + 540) % 360) - 180) * s;
const l3animSmooth = u => u * u * (3 - 2 * u);
/* Läget vid tiden t (ms, UTC): mjuk övergång mellan nycklarna. face = vrid efter färdriktningen. */
function l3animAt(keys, t, face) {
  if (!keys.length) return null;
  const T = keys.map(k => l3animDate(k.date)), n = keys.length;
  let vis = keys[0].v !== false;
  for (let i = 0; i < n; i++) if (T[i] <= t) vis = keys[i].v !== false;
  const H = face && n > 1 ? l3animHeads(keys) : null, off = H ? (keys[0].rot || 0) - H[0] : 0;
  let pose;
  if (t <= T[0] || n === 1) pose = { x: keys[0].x, y: keys[0].y, dz: keys[0].dz || 0, rot: keys[0].rot || 0 };
  else if (t >= T[n - 1]) pose = { x: keys[n - 1].x, y: keys[n - 1].y, dz: keys[n - 1].dz || 0, rot: H ? H[n - 2] + off : keys[n - 1].rot || 0 };
  else {
    let i = 0; while (i < n - 1 && t > T[i + 1]) i++;
    const u = T[i + 1] > T[i] ? (t - T[i]) / (T[i + 1] - T[i]) : 1, s = l3animSmooth(u), a = keys[i], b = keys[i + 1];
    pose = { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s, dz: (a.dz || 0) + ((b.dz || 0) - (a.dz || 0)) * s, rot: (a.rot || 0) + ((b.rot || 0) - (a.rot || 0)) * s };
    if (H) { // sväng över de första/sista 25 % av sträckan så att riktningen är jämn genom nyckeln
      const hc = H[i], hp = i ? H[i - 1] : hc, hn = i < n - 2 ? H[i + 1] : hc;
      pose.rot = (u < 0.25 ? l3animLerpAng(hp, hc, l3animSmooth(0.5 + u * 2)) : u > 0.75 ? l3animLerpAng(hc, hn, l3animSmooth((u - 0.75) * 2)) : hc) + off;
    }
  }
  pose.v = vis;
  return pose;
}
function l3animPlace(p, g, pose) {
  g.position.set(pose.x - l3.O[0], pose.y - l3.O[1], (Number(p.z) || 0) + (pose.dz || 0) - l3.O[2]);
  g.rotation.z = (pose.rot || 0) * Math.PI / 180;
  if (g.userData.fxZ != null) g.userData.fxZ = g.position.z; // filmens etablering-glid utgår från animeringens höjd
}
/* Alla animerade objekt till tiden t. Anropas av spolningen och filmen; ritar inte själv. */
function l3animApply(t) {
  if (!l3 || !l3.placeMeshes) return;
  l3animAll().forEach(p => {
    const g = l3.placeMeshes.get(p.id), pose = g && l3animAt(l3animKeys(p), t, p.animFace === true);
    if (g && pose) { l3animPlace(p, g, pose); g.visible = pose.v !== false && !(l3.hidden && l3.hidden.has(p.id)); g.userData.animOn = true; }
  });
  if (l3.groups.anim) l3.groups.anim.visible = l3animPathOn(); // banan syns inte i uppspelning och film
}
/* Tillbaka till grundläget (tidslinjen stängs). */
function l3animReset() {
  if (!l3 || !l3.placeMeshes) return;
  (typeof placements === "undefined" ? [] : placements).forEach(p => {
    const g = l3.placeMeshes.get(p.id); if (!g || !g.userData.animOn) return;
    delete g.userData.animOn;
    g.position.set(p.x - l3.O[0], p.y - l3.O[1], (Number(p.z) || 0) + (Number(p.dz) || 0) - l3.O[2]);
    g.rotation.z = (Number(p.rot) || 0) * Math.PI / 180;
    g.visible = !(l3.hidden && l3.hidden.has(p.id));
  });
  l3animPaths();
  if (typeof l3Render === "function") l3Render();
}

/* Banan: streckad linje genom nycklarnas lägen + prickar vid nycklarna (visas när tidslinjen är öppen). */
const l3animPathOn = () => !!l3 && typeof l3fsOn === "function" && l3fsOn() && ((l3plPrefs().film || {}).animPath !== false) && !(l3pl && l3pl.rec);
function l3animPaths() {
  if (!l3 || !l3.scene) return;
  let G = l3.groups.anim;
  if (!G) { G = l3.groups.anim = new THREE.Group(); G.userData.noHit = true; l3.scene.add(G); }
  while (G.children.length) { const c = G.children.pop(); if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); }
  G.visible = l3animPathOn();
  if (!l3animPathOn()) return;
  l3animAll().forEach(p => {
    const ks = l3animKeys(p); if (ks.length < 2) return;
    const pts = ks.map(k => new THREE.Vector3(k.x - l3.O[0], k.y - l3.O[1], (Number(p.z) || 0) + (k.dz || 0) + 0.08 - l3.O[2]));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xf59e0b, dashSize: 0.8, gapSize: 0.5, depthTest: false, transparent: true }));
    line.computeLineDistances(); line.renderOrder = 9; line.userData.noHit = true; G.add(line);
    const dots = new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), new THREE.PointsMaterial({ color: 0xf59e0b, size: 9, sizeAttenuation: false, depthTest: false, transparent: true }));
    dots.renderOrder = 10; dots.userData.noHit = true; G.add(dots);
  });
}
