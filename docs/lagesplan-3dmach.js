/* Animerade maskiner på filmens tidslinje (Victor: "animera kranar och fordon snyggt").
   Mobilkran, grävmaskin, lastbil, hjullastare och byggare från gå-läget (lagesplan-3dchar.js) kan placeras som vanliga objekt
   (Etablering → Maskiner) och nyckelsättas som övriga objekt (◆ Nyckel i tidslinjen, lagesplan-3danim.js).
   – Körning: hjulen rullar och figuren går medan maskinen faktiskt flyttas mellan två nycklar (sträckan längs banan, ingen glidning).
   – Arbetar: bocka "Arbetar" när du sätter nyckeln – bom, grävarm, flak osv. rör sig från den nyckeln, mjuk övergång mellan nycklar.
   – Samma läge ritas i 3D-vyn, i filmen och i renderingsfilmen (l3animApply anropar l3machApply för varje bild). */

const L3MACH = {
  crane: ["Mobilkran (animerad)", 12, 3, 3.6, "#dc2626"], excavator: ["Grävmaskin (animerad)", 8.5, 2.8, 3.2, "#f59e0b"],
  truck: ["Lastbil (animerad)", 9, 2.6, 3.4, "#2563eb"], loader: ["Hjullastare (animerad)", 8, 2.6, 3.4, "#eab308"], human: ["Byggare (animerad)", 0.8, 0.8, 1.8, "#f97316"],
};
if (typeof PLACE_LIB !== "undefined") Object.entries(L3MACH).forEach(([k, v]) => { PLACE_LIB["mach:" + k] = { group: "Maskiner", label: v[0], L: v[1], B: v[2], H: v[3], color: v[4], mach: k }; });

const l3machStep = { moving: false, phase: 0, speed: 0, crouch: 0, jz: 0, work: 0, t: 0, travel: 0, dt: 0.016, steer: 0, rev: false, brake: false };
/* Bygger maskinen i objektets grupp (anropas av l3PlacementGroup). */
function l3machBuild(p, grp) {
  const lib = placeLib(p.type) || {}, kind = lib.mach; if (!kind || typeof l3cBuild !== "function") return;
  const av = l3cBuild(kind, 0); av.update({ ...l3machStep }); grp.add(av.g);
  av.g.traverse(o => { if (o.isMesh) { o.userData.placeId = p.id; o.userData.mat0 = { t: o.material.transparent, o: o.material.opacity, d: o.material.depthWrite }; } });
  grp.userData.mach = { av, kind };
}
/* Sträckan (m) längs nycklarna till tiden t – samma mjuka rörelse som l3animAt. */
function l3machTravel(keys, t) {
  let d = 0; const n = keys.length;
  for (let i = 0; i < n - 1; i++) {
    const t0 = l3animDate(keys[i].date), t1 = l3animDate(keys[i + 1].date), len = Math.hypot(keys[i + 1].x - keys[i].x, keys[i + 1].y - keys[i].y);
    if (t >= t1) d += len; else { if (t > t0 && t1 > t0) d += len * l3animSmooth((t - t0) / (t1 - t0)); break; }
  }
  return d;
}
/* Reglagen (samma som i gå-läget) för arbetet w (0–1) vid film-tiden tt (dagar). Vilande = gå-lägets utgångsvärden. */
function l3machCtl(kind, w, tt) {
  const S = Math.sin;
  if (kind === "crane") return { out: w, ang: 0.05 + 0.85 * w, ext: 0.5 * w, slew: w * 0.9 * S(tt * 0.8), hook: 3 + 17 * w };
  if (kind === "excavator") return { slew: w * 0.9 * S(tt * 0.8), boom: 0.45 + 0.3 * w * (0.5 + 0.5 * S(tt * 2.4)), stick: 1.2 + 0.5 * w * S(tt * 2.4 + 1), bucket: 0.8 + 0.6 * w * S(tt * 2.4 + 2) };
  if (kind === "truck") return { tip: w * 0.6, gate: w, load: 0.7 * (1 - w), mat: 0 };
  if (kind === "loader") return { arm: w * 0.8 * (0.5 + 0.5 * S(tt * 1.6)), bucket: 0.15 + 0.5 * w * S(tt * 1.6 + 1), fill: w * 0.8, mat: 0 };
  return null;
}
/* Ställer in maskinens delar för tiden t; pose kommer från l3animAt. */
function l3machApply(p, g, pose, keys, t) {
  const m = g.userData.mach; if (!m) return;
  const e = 6 * 3600000, d0 = l3machTravel(keys, t - e), d1 = l3machTravel(keys, t + e), tr = l3machTravel(keys, t), mv = Math.abs(d1 - d0) > 1e-4;
  const sp = m.kind === "human" ? 1.4 : 3, w = Math.max(0, Math.min(1, pose.w || 0)), days = (t - l3animDate(keys[0].date)) / 86400000, ctl = l3machCtl(m.kind, w, days * 1.2);
  m.av.update({ ...l3machStep, moving: mv, phase: tr * 2.6, speed: mv ? sp : 0, travel: tr, work: w, t: days * 3, ctl, ctlT: ctl });
}
/* Tillbaka till vilande utseende. */
function l3machRest(g) { const m = g.userData.mach; if (m) m.av.update({ ...l3machStep }); }
