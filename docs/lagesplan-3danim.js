/* 3D-vyn – animera placerade objekt (Sketchfab-modeller, etablering m.m.) på filmens tidslinje
   (Victor 2026-10-12: "styra animeringen själv av hämtade objekt från Sketchfab, nästan på samma sätt som jag
   lägger in vyer på tidslinjen").

   – Markera ett objekt, flytta/vrid det med handtaget, dra tidslinjens huvud till ett datum och tryck ◆ Nyckel:
     objektets läge (plats, höjd, vridning) sparas på datumet. Flera nycklar = rörelsen mellan dem (mjuk övergång).
   – Före första nyckeln står objektet som den första nyckeln, efter den sista som den sista.
   – Nycklarna sparas på objektet i plan_placements.json (p.anim) – samma sparning som övriga placeringar.
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
    keys.push({ date: iso, ...pose });
    p.anim = keys.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 60);
    if (typeof placeTouch === "function") placeTouch(p);
  });
  l3Status(`Nyckel på ${iso}: ${list.map(p => p.name || p.type).join(", ")}.`);
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
/* Läget vid tiden t (ms, UTC): mjuk övergång mellan nycklarna. */
function l3animAt(keys, t) {
  if (!keys.length) return null;
  const T = keys.map(k => l3animDate(k.date));
  if (t <= T[0]) return keys[0];
  if (t >= T[T.length - 1]) return keys[keys.length - 1];
  let i = 0; while (i < T.length - 1 && t > T[i + 1]) i++;
  const u = T[i + 1] > T[i] ? (t - T[i]) / (T[i + 1] - T[i]) : 1, s = u * u * (3 - 2 * u), a = keys[i], b = keys[i + 1];
  return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s, dz: (a.dz || 0) + ((b.dz || 0) - (a.dz || 0)) * s, rot: (a.rot || 0) + ((b.rot || 0) - (a.rot || 0)) * s };
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
    const g = l3.placeMeshes.get(p.id), pose = g && l3animAt(l3animKeys(p), t);
    if (g && pose && !(l3.dragging && l3.sel && l3.sel.has(p.id))) { l3animPlace(p, g, pose); g.userData.animOn = true; }
  });
}
/* Tillbaka till grundläget (tidslinjen stängs). */
function l3animReset() {
  if (!l3 || !l3.placeMeshes) return;
  (typeof placements === "undefined" ? [] : placements).forEach(p => {
    const g = l3.placeMeshes.get(p.id); if (!g || !g.userData.animOn) return;
    delete g.userData.animOn;
    g.position.set(p.x - l3.O[0], p.y - l3.O[1], (Number(p.z) || 0) + (Number(p.dz) || 0) - l3.O[2]);
    g.rotation.z = (Number(p.rot) || 0) * Math.PI / 180;
  });
  if (typeof l3Render === "function") l3Render();
}
