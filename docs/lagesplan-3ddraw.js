/* Rita och modellera i 3D (Victor 2026-10-30) – verktygen, arbetsplanet och fästningen.

   Två verktyg i verktygsraden: Rita (D) – linje, rektangel, cirkel, båge, polygon, polylinje, 3D-polylinje, frihand – och Modellera (X) –
   Push/Pull, Offset m.fl. Båda följer samma sätt att arbeta som övriga verktyg: tryck, flytta, tryck – skriv ett mått och Enter – Esc avbryter.
   – Arbetsplanet (Auto / XY / XZ / YZ / En yta / Höjd) bestämmer var man ritar. Auto: ytan under första punkten (marken, en vägg, ett tak).
   – Fästning: allt som redan fanns (hörn, mittpunkter, kanter, axlar, rutnät, punktmoln) plus axlar i planet, vinkelrätt, parallellt, centrum och ytcentrum.
   – Siffror: skriv direkt (t.ex. 4000;3000 för en rektangel, 1200 för en längd). Utan enhet gäller valt enhetsval (mm eller m); mm/cm/m efter siffran går alltid före.
   – Resultatet blir vanliga objekt (lagesplan-3dmod.js): yta, kropp eller linje – som kan flyttas, vridas, kopieras, ångras och exporteras till IFC och DXF. */

const l3dw = { pl: null, pts: [], cur: null, lock: null, vcb: "", op: null, guide: null, hov: null, region: null, cacheR: new Map(), lastTap: 0, hint: null, free: null };
const L3DW_DEF = { draw: "line", model: "pushpull", plane: "auto", unit: "mm", sides: 6 };
const L3DW_MODES = {
  draw: [["line", "Linje", "L"], ["rect", "Rektangel", "R"], ["circle", "Cirkel", "C"], ["arc", "Båge", "A"], ["polygon", "Polygon", "G"], ["poly", "Polylinje", "P"], ["poly3d", "3D-polylinje", "3"], ["free", "Frihand", "H"]],
  model: [["pushpull", "Push/Pull", "P"], ["offset", "Offset", "F"], ["move", "Flytta", "M"], ["rotate", "Vrid", "Q"], ["scale", "Skala", "S"], ["mirror", "Spegla", "X"], ["erase", "Radera", "E"], ["paint", "Måla", "B"], ["follow", "Följ banan", "O"], ["intersect", "Skär ytor", "I"]],
};
const L3DW_PLANES = [["auto", "Auto", "Ytan under första punkten (marken om det inte finns någon)"], ["xy", "XY", "Vågrätt plan (lås mot X och Y)"], ["xz", "XZ", "Lodrätt plan längs X"], ["yz", "YZ", "Lodrätt plan längs Y"], ["face", "Yta…", "Tryck på en yta – ritar i dess plan"], ["height", "Höjd…", "Lås ritningen vågrätt på höjden av en punkt du trycker på"]];
const L3DW_AX = { x: { v: [1, 0, 0], col: "#dc2626", name: "röd axel (X)" }, y: { v: [0, 1, 0], col: "#16a34a", name: "grön axel (Y)" }, z: { v: [0, 0, 1], col: "#2563eb", name: "blå axel (Z)" } };
const l3dwPref = (k, d) => { const v = (l3Prefs().dw || {})[k]; return v == null ? (d !== undefined ? d : L3DW_DEF[k]) : v; };
const l3dwSet = (k, v) => { l3SetPref("dw", { ...(l3Prefs().dw || {}), [k]: v }); };
const l3dwOn = () => !!l3 && (l3.tool === "draw" || l3.tool === "model");
const l3dwMode = () => { const t = l3.tool, m = l3dwPref(t); return (L3DW_MODES[t] || []).some(x => x[0] === m) ? m : L3DW_DEF[t]; };
const L3DW_IMPL = new Set(["line", "rect", "circle", "arc", "polygon", "poly", "poly3d", "free", "pushpull", "offset", "erase", "paint", "scale", "mirror", "follow", "intersect"]);
const l3dwS = p => new THREE.Vector3(p[0] - l3.O[0], p[1] - l3.O[1], p[2] - l3.O[2]);       // absolut → scen
const l3dwA = v => [v.x + l3.O[0], v.y + l3.O[1], v.z + l3.O[2]];                          // scen → absolut
const l3dwFmt = v => { const a = Math.abs(v); return (v < 0 ? "−" : "") + (a < 1 ? Math.round(a * 1000) + " mm" : (Math.round(a * 1000) / 1000).toString().replace(".", ",") + " m"); };

/* ---- Aktivering ---- */
function l3dwSwitch(t) {
  const was = l3dwOn(); l3dwReset(true);
  const on = t === "draw" || t === "model"; if (!l3 || !l3.renderer) return;
  l3.renderer.domElement.style.cursor = on ? "crosshair" : (was ? "" : l3.renderer.domElement.style.cursor);
  if (!on) { const h = document.getElementById("v3DwHint"); if (h) h.remove(); }
}
function l3dwReset(keepPlane) {
  l3dw.pts = []; l3dw.cur = null; l3dw.lock = null; l3dw.vcb = ""; l3dw.op = null; l3dw.guide = null; l3dw.hov = null; l3dw.free = null; l3dw.arc = null;
  if (!keepPlane || l3dwPref("plane") === "auto") l3dw.pl = null;
  if (l3 && l3.groups && l3.groups.tmp) { l3Clear(l3.groups.tmp); }
  if (typeof l3ShowVcb === "function" && l3t) { l3t.vcb = ""; l3ShowVcb(null); }
  if (l3) { l3.measLabel = null; if (l3t && l3t.measEl) l3t.measEl.style.display = "none"; }
  l3dwHint();
}
function l3dwHint(extra) {
  if (!l3dwOn()) return;
  const host = document.getElementById("v3Canvas"); if (!host) return;
  let h = document.getElementById("v3DwHint"); if (!h) { h = document.createElement("div"); h.id = "v3DwHint"; h.className = "v3-dwhint"; host.appendChild(h); }
  const m = l3dwMode(), n = l3dw.pts.length, u = l3dwPref("unit");
  const T = {
    line: n ? "Tryck nästa punkt – skriv längden och Enter. Dubbeltryck eller Enter avslutar, Esc avbryter." : "Linje: tryck första punkten. Pilar låser riktning (→ röd, ← grön, ↑ blå).",
    poly: n ? "Tryck nästa punkt. Tryck på första punkten för att sluta konturen (blir en yta)." : "Polylinje: tryck första punkten.",
    poly3d: n ? "Tryck nästa punkt i rummet. Pilar låser axel, skriv längd." : "3D-polylinje: tryck första punkten (fäster mot hörn och ytor).",
    rect: n ? `Tryck motstående hörn – eller skriv bredd;höjd (${u}) och Enter.` : "Rektangel: tryck första hörnet.",
    circle: n ? `Tryck för radien – eller skriv radien (${u}) och Enter.` : "Cirkel: tryck mittpunkten.",
    polygon: n ? `Tryck för radien – skriv radien, eller antal sidor med s (t.ex. 8s).` : `Polygon (${l3dwPref("sides")} sidor): tryck mittpunkten.`,
    arc: n === 0 ? "Båge: tryck startpunkten." : n === 1 ? "Tryck slutpunkten." : "Flytta för bågens bukt och tryck – eller skriv radien och Enter.",
    free: "Frihand: håll nere musknappen och rita. Släpp för att avsluta.",
    pushpull: l3dw.op ? "Dra och tryck, eller skriv avståndet (t.ex. 1200) och Enter. Esc avbryter." : "Push/Pull: tryck på en yta och dra ut den.",
    erase: "Radera: tryck på ett objekt – det tas bort (IFC-objekt rörs inte).",
    paint: "Måla: välj färg i verktygsfältet och tryck på objekt.",
    scale: l3dw.op ? "Dra för faktorn och tryck – eller skriv den (1,5 eller 150 för 150 %) och Enter." : "Skala: tryck på ett ritat objekt (skalas kring ankarpunkten).",
    mirror: l3dw.op ? "Flytta spegelplanet och tryck. Välj axel i verktygsfältet." : "Spegla: tryck på ett ritat objekt, välj axel (X/Y/Z) i verktygsfältet.",
    follow: l3dw.op ? "Tryck nu på banan: en linje eller en ytas kant." : "Följ banan: tryck på profilen (en yta).",
    intersect: l3dw.op ? "Tryck på det andra objektet." : "Skär ytor: tryck på två ritade ytor eller kroppar – skärningslinjerna blir linjer.",
    offset: l3dw.op ? "Flytta för avståndet och tryck – eller skriv det och Enter." : "Offset: tryck på en yta.",
  };
  h.textContent = extra || T[m] || ""; h.style.display = h.textContent ? "" : "none";
}

/* ---- Arbetsplan ---- */
function l3dwSurfaceHit(e) {
  const hits = l3Ray(e, l3Surfaces()), h = hits[0]; if (!h) return null;
  const o = h.object; let n = null;
  if (h.face && o.geometry && o.geometry.getAttribute("position")) {
    const pos = o.geometry.getAttribute("position"), W = i => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
    const a = W(h.face.a), b = W(h.face.b), c = W(h.face.c); n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  }
  if (!n || !isFinite(n.x)) n = new THREE.Vector3(0, 0, 1);
  const ray = l3MouseRay(e); if (n.dot(ray.direction) > 0) n.negate();   // vänd mot kameran
  return { hit: h, n, p: h.point.clone(), ground: o === l3.planMesh };
}
/* Normalen avrundas till en axel om den ligger inom 1,5° (annars blir vågräta golv och lodräta väggar aldrig exakta). */
function l3dwSnapN(n) {
  const a = [n.x, n.y, n.z], k = a.map(Math.abs).indexOf(Math.max(...a.map(Math.abs)));
  if (Math.abs(a[k]) > Math.cos(1.5 * Math.PI / 180)) { const r = [0, 0, 0]; r[k] = Math.sign(a[k]); return r; }
  return MG.norm(a);
}
function l3dwPlaneAt(sh, mode) {
  const O = l3.O, P = l3dwA(sh.p);
  if (mode === "xy") return MG.planeFrom([0, 0, 1], P);
  if (mode === "xz") return MG.planeFrom([0, -1, 0], P);
  if (mode === "yz") return MG.planeFrom([1, 0, 0], P);
  return MG.planeFrom(l3dwSnapN(sh.n), sh.ground ? [P[0], P[1], l3GroundZ() + O[2]] : P);
}

/* ---- Punkt under markören ---- */
function l3dwAxisGuess(a, p, pl) {
  // Axelriktningar (X, Y, Z och planets egna) – i planet och inom 3°: punkten läggs på axeln.
  const d = MG.sub(p, a), L = MG.len(d); if (L < 0.02) return null;
  const cand = [["x", [1, 0, 0]], ["y", [0, 1, 0]], ["z", [0, 0, 1]]];
  let best = null;
  cand.forEach(([k, v]) => {
    if (pl && Math.abs(MG.dot(v, MG.normal(pl))) > 0.1) return;           // axeln ligger inte i planet
    const c = Math.abs(MG.dot(MG.norm(d), v)); if (c < Math.cos(3 * Math.PI / 180)) return;
    const t = MG.dot(d, v); if (!best || c > best.c) best = { k, c, p: MG.add(a, MG.mul(v, t)) };
  });
  return best;
}
function l3dwPick(e, o = {}) {
  const O = l3.O, S = l3Snap(e), ray = l3MouseRay(e), ro = [ray.origin.x + O[0], ray.origin.y + O[1], ray.origin.z + O[2]], rd = [ray.direction.x, ray.direction.y, ray.direction.z];
  const last = l3dw.pts.length ? l3dw.pts[l3dw.pts.length - 1] : null, pl = o.free3d ? null : l3dw.pl;
  let p = null, kind = null, snapped = false;
  const geom = S && ["end", "mid", "edge", "perp", "pc", "center", "faceC"].includes(S.kind);
  if (S) { p = l3dwA(S.point); kind = S.kind; }
  if (pl) {
    const hit = MG.rayPlane(ro, rd, pl);
    if (geom && p && Math.abs(MG.planeDist(pl, p)) < (o.tol || 0.4)) { p = MG.project(pl, p); snapped = true; }
    else if (hit) { p = hit.p; kind = "plane"; if (l3Snaps().grid) { const g = Number(l3Snaps().gstep) || 1, q = MG.to2(pl, p); p = MG.to3(pl, [Math.round(q[0] / g) * g, Math.round(q[1] / g) * g]); kind = "grid"; } }
    else p = null;
  } else if (!p) { const g = MG.rayPlane(ro, rd, { o: [0, 0, l3GroundZ() + O[2]], u: [1, 0, 0], v: [0, 1, 0] }); if (g) { p = g.p; kind = "ground"; } }
  if (!p) return null;
  // Smart fästning: centrum, ytcentrum, tangent, skärning, vinkelrätt och parallellt (utöver hörn, mittpunkter och kanter som l3Snap redan ger)
  if (!snapped || !geom) { const inf = l3dwInfer(e, last, pl, S); if (inf) { p = inf.p; kind = inf.kind; snapped = true; if (inf.dir) { /* parallellt: hjälplinje visas */ } } }
  // Axellås (pilarna) och axelförslag från senaste punkten
  let axis = null;
  if (last && !snapped) {
    if (l3dw.lock) { const v = L3DW_AX[l3dw.lock].v, t = MG.dot(MG.sub(p, last), v); p = MG.add(last, MG.mul(v, t)); axis = { k: l3dw.lock, locked: true }; kind = "axis"; }
    else if (l3Snaps().axis !== false) { const g = l3dwAxisGuess(last, p, pl); if (g) { p = g.p; axis = { k: g.k }; kind = "axis"; } }
  } else if (last && snapped && l3dw.lock) { const v = L3DW_AX[l3dw.lock].v; p = MG.add(last, MG.mul(v, MG.dot(MG.sub(p, last), v))); axis = { k: l3dw.lock, locked: true }; kind = "axis"; }
  return { p, kind, axis, snap: S };
}
function l3dwMarker(r) {
  if (!r) { l3ShowMarker(null); return; }
  const s = { point: l3dwS(r.p), kind: r.kind === "plane" ? "face" : r.kind };
  if (r.axis) { s.kind = "axis"; s.axis = r.axis.k; s.locked = !!r.axis.locked; }
  if (typeof l3ShowMarker === "function") l3ShowMarker(r.kind === "plane" ? null : s);
}

/* ---- Smart fästning ----
   Kandidater nära markören (inom 12 bildpunkter): centrum av cirklar och bågar, ytcentrum, tangentpunkter från senaste punkten mot en cirkel/båge,
   skärning mellan två ritade linjer, vinkelrätt fot mot kanten under markören och parallellt med den kanten (inom 3°). */
function l3dwCircles() {
  const out = [];
  placements.forEach(p => { const m = p.m; if (!m || m.k === "curve" || !m.loops) return; const base = l3dwFromLocal(p, MG.to3(m.pl, [0, 0])); void base;
    const key = p.id + m.rev; let cc = l3dw.circC && l3dw.circC.get(key);
    if (cc === undefined) { cc = null; const L = m.loops[0]; if (L && L.length >= 8) { const c = MG.centroid2(L), rs = L.map(q => Math.hypot(q[0] - c[0], q[1] - c[1])), r = rs.reduce((a, b) => a + b, 0) / rs.length; if (Math.max(...rs) - Math.min(...rs) < 0.01 * r + 1e-4) cc = { c, r }; } (l3dw.circC || (l3dw.circC = new Map())).set(key, cc); }
    if (cc) out.push({ p, c3: l3dwFromLocal(p, MG.to3(m.pl, cc.c)), r: cc.r, n: MG.norm(l3dwFromLocal(p, MG.normal(m.pl), true)) });
  });
  return out;
}
function l3dwInfer(e, last, pl, S) {
  const r = l3Rect(), mx = e.clientX - r.left, my = e.clientY - r.top, cand = [], scr = p => { const q = l3ToScreen(l3dwS(p)); return q.behind ? 1e9 : Math.hypot(q.x - mx, q.y - my); };
  const near = (p, kind, dir) => { const d = scr(p); if (d < 12) cand.push({ p, kind, d, dir }); };
  l3dwCircles().forEach(ci => {
    near(ci.c3, "center");
    if (last) { // tangentpunkter från senaste punkten mot cirkeln (i cirkelns plan)
      const pq = MG.sub(last, ci.c3), dd = MG.len(pq); if (dd > ci.r * 1.001 && Math.abs(MG.dot(pq, ci.n)) < 0.01) {
        const a = Math.acos(ci.r / dd), u = MG.norm(pq), w = MG.norm(MG.cross(ci.n, u));
        [1, -1].forEach(s => near(MG.add(ci.c3, MG.mul(MG.add(MG.mul(u, Math.cos(a)), MG.mul(w, s * Math.sin(a))), ci.r)), "tang"));
      }
    }
  });
  placements.forEach(p => { const m = p.m; if (!m || m.k !== "face" || !m.loops) return; const c2 = MG.centroid2(m.loops[0]); if (MG.pip(m.loops[0], c2)) near(l3dwFromLocal(p, MG.to3(m.pl, c2)), "faceC"); });
  if (S && S.seg && last) { // vinkelrätt och parallellt mot kanten under markören
    const a = l3dwA(S.seg[0]), b = l3dwA(S.seg[1]), e0 = MG.sub(b, a), L2 = MG.dot(e0, e0);
    if (L2 > 1e-9) { const t = MG.dot(MG.sub(last, a), e0) / L2; if (t > 0 && t < 1) near(MG.add(a, MG.mul(e0, t)), "perp");
      const ray = l3MouseRay(e); void ray; }
  }
  cand.sort((x, y) => x.d - y.d);
  if (cand[0]) return cand[0];
  if (S && S.seg && last && l3dw.cur) { // parallellt: markören riktad längs kanten från senaste punkten
    const a = l3dwA(S.seg[0]), b = l3dwA(S.seg[1]), dir = MG.norm(MG.sub(b, a)), cur = S.point ? l3dwA(S.point) : null;
    if (cur) { const d = MG.sub(cur, last), L = MG.len(d); if (L > 0.05 && Math.abs(MG.dot(MG.norm(d), dir)) > Math.cos(3 * Math.PI / 180)) return { p: MG.add(last, MG.mul(dir, MG.dot(d, dir))), kind: "par", dir }; }
  }
  return null;
}

/* ---- Siffror ---- */
function l3dwParse(txt) {
  const t = String(txt).trim().toLowerCase(); if (!t) return [];
  const U = { mm: 0.001, cm: 0.01, m: 1 }, toks = t.split(/[;\s]+|(?<=\d)x(?=\d)|×/).filter(Boolean);
  let unit = null; toks.forEach(k => { const m = /(mm|cm|m)$/.exec(k); if (m) unit = m[1]; });
  const def = unit || l3dwPref("unit");
  return toks.map(k => { const m = /^(-?\d+(?:[.,]\d+)?)(mm|cm|m|s)?$/.exec(k); if (!m) return NaN; const v = Number(m[1].replace(",", ".")); return m[2] === "s" ? { sides: v } : v * (U[m[2] || def] || 1); });
}
function l3dwVcb(label, live) { if (typeof l3ShowVcb !== "function" || !label) { if (typeof l3ShowVcb === "function") l3ShowVcb(null); return; } l3t.vcb = l3dw.vcb || ""; l3ShowVcb(label, live || ""); }

/* ---- Förhandsvisning ---- */
function l3dwTmp() { l3Clear(l3.groups.tmp); return l3.groups.tmp; }
function l3dwLine(a, b, col, dashed) { return l3TmpLine(l3dwS(a), l3dwS(b), col, dashed); }
function l3dwLoop(P, col, closed = true) { for (let i = 1; i < P.length; i++) l3dwLine(P[i - 1], P[i], col); if (closed && P.length > 2) l3dwLine(P[P.length - 1], P[0], col); }
function l3dwFill(pl, loops2, col, op = 0.22) {
  const m = MG.faceMesh(pl, loops2); if (!m.faces.length) return;
  const g = new THREE.BufferGeometry(), pos = []; m.faces.forEach(f => f.forEach(i => { const v = l3dwS(m.pts[i - 1]); pos.push(v.x, v.y, v.z); }));
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false, depthTest: false })); mesh.renderOrder = 8; mesh.userData.noHit = true; mesh.raycast = () => {}; l3.groups.tmp.add(mesh);
}
function l3dwLabel(at, text) { l3.measLabel = { at: l3dwS(at), text }; if (typeof l3PlaceMeasLabel === "function") l3PlaceMeasLabel(); }
function l3dwGuide(r) {
  if (!r || !r.axis || !l3dw.pts.length) return;
  const a = l3dw.pts[l3dw.pts.length - 1], v = L3DW_AX[r.axis.k].v, ext = 4;
  l3dwLine(MG.sub(a, MG.mul(v, ext)), MG.add(a, MG.mul(v, ext)), L3DW_AX[r.axis.k].col, true);
}
/* Planindikator: ett svagt rutnät runt senaste punkten (färg efter planets riktning). */
function l3dwPlaneMark(c) {
  const pl = l3dw.pl; if (!pl || !c) return;
  const n = MG.normal(pl), col = Math.abs(n[2]) > 0.9 ? "#2563eb" : Math.abs(n[0]) > 0.9 ? "#dc2626" : Math.abs(n[1]) > 0.9 ? "#16a34a" : "#7c3aed", R = 2.5, q = MG.to2(pl, c);
  for (let i = -2; i <= 2; i++) { const a = [q[0] + i * R / 2, q[1] - R], b = [q[0] + i * R / 2, q[1] + R]; l3dwLine(MG.to3(pl, a), MG.to3(pl, b), col, true).material.opacity = 0.25; const c1 = [q[0] - R, q[1] + i * R / 2], c2 = [q[0] + R, q[1] + i * R / 2]; l3dwLine(MG.to3(pl, c1), MG.to3(pl, c2), col, true); }
}

/* ---- Hover ---- */
function l3dwHover(e) {
  if (!l3dwOn()) return false;
  l3dw.ev = e;
  l3dwTmp(); const m = l3dwMode();
  if (l3.tool === "model") return l3dwModelHover(e, m);
  if (m === "free") { l3dwMarker(l3dwPlaneFirst(e)); return true; }
  const first = !l3dw.pts.length;
  if (first) { // innan första punkten: planet föreslås av ytan under markören
    const r = l3dwPlaneFirst(e); l3dw.cur = r ? r.p : null; l3dwMarker(r);
    if (r && l3dw.pl) l3dwPlaneMark(r.p);
    return true;
  }
  const r = l3dwPick(e, { free3d: m === "poly3d" }); if (!r) return true;
  l3dw.cur = r.p; l3dwMarker(r); l3dwGuide(r); l3dwPlaneMark(r.p);
  l3dwDrawOp(r.p);
  return true;
}
/* Första punkten: fästning i 3D, och (i Auto) ytans plan för förhandsvisningen. */
function l3dwPlaneFirst(e) {
  const mode = l3dwPref("plane"), O = l3.O, S = l3Snap(e), sh = l3dwSurfaceHit(e);
  if (mode === "face" && !l3dw.pl) { return S ? { p: l3dwA(S.point), kind: S.kind } : null; }
  if (l3dw.pl && mode !== "auto") { const r = l3dwPick(e); return r; }
  let p = S ? l3dwA(S.point) : null, kind = S ? S.kind : null;
  if (!p) { const ray = l3MouseRay(e), g = MG.rayPlane([ray.origin.x + O[0], ray.origin.y + O[1], ray.origin.z + O[2]], [ray.direction.x, ray.direction.y, ray.direction.z], { o: [0, 0, l3GroundZ() + O[2]], u: [1, 0, 0], v: [0, 1, 0] }); if (!g) return null; p = g.p; kind = "ground"; if (l3Snaps().grid) { const gs = Number(l3Snaps().gstep) || 1; p = [Math.round(p[0] / gs) * gs, Math.round(p[1] / gs) * gs, p[2]]; kind = "grid"; } }
  if (mode === "auto") l3dw.pl = sh ? MG.planeFrom(l3dwSnapN(sh.n), p) : MG.planeFrom([0, 0, 1], p);
  else if (mode === "height") { if (!l3dw.pl) l3dw.pl = MG.planeFrom([0, 0, 1], p); else p = MG.project(l3dw.pl, p); }
  else l3dw.pl = l3dwPlaneAt(sh || { p: l3dwS(p), n: new THREE.Vector3(0, 0, 1), ground: true }, mode);
  if (l3dw.pl) p = MG.project(l3dw.pl, p);
  return { p, kind };
}

/* ---- Tryck ---- */
function l3dwTap(e) {
  if (!l3dwOn()) return false;
  const m = l3dwMode(), t = performance.now(), dbl = t - l3dw.lastTap < 320; l3dw.lastTap = t;
  if (l3.tool === "model") return l3dwModelTap(e, m);
  if (m === "free") return true;
  // Plan väljs genom att trycka på en yta: ritningen startar sedan nästa tryck
  if (l3dwPref("plane") === "face" && !l3dw.pl && !l3dw.pts.length) { const sh = l3dwSurfaceHit(e); if (sh) { l3dw.pl = MG.planeFrom(l3dwSnapN(sh.n), l3dwA(sh.p)); l3Status("Arbetsplanet satt – tryck första punkten."); l3dwHover(e); } return true; }
  if (l3dwPref("plane") === "height" && !l3dw.pl && !l3dw.pts.length) { const S = l3Snap(e); if (S) { l3dw.pl = MG.planeFrom([0, 0, 1], l3dwA(S.point)); l3Status(`Höjden låst (Z ${l3Fmt(l3dwA(S.point)[2], 3)} m) – tryck första punkten.`); l3dwHover(e); } return true; }
  let r;
  if (!l3dw.pts.length) { r = l3dwPlaneFirst(e); if (!r) return true; }
  else r = l3dwPick(e, { free3d: m === "poly3d" });
  if (!r) return true;
  l3dwAdd(r.p, dbl);
  l3dwHover(e);
  return true;
}
function l3dwAdd(p, dbl) {
  const m = l3dwMode(), P = l3dw.pts;
  if (m === "line" || m === "poly" || m === "poly3d") {
    if (P.length && MG.near(p, P[P.length - 1], 0.002)) { if (dbl || P.length >= 2) return l3dwFinish(); return; }
    // Tryck på första punkten = sluten kontur
    if (P.length >= 3 && MG.near(p, P[0], 0.02)) return l3dwFinish(true);
    P.push(p); l3dw.vcb = ""; l3dwHint(); l3dwVcb("Längd"); return;
  }
  if (m === "rect" || m === "circle" || m === "polygon") { if (!P.length) { P.push(p); l3dwHint(); return; } if (MG.near(p, P[0], 0.002)) return; P.push(p); return l3dwFinish(); }
  if (m === "arc") { if (P.length < 2) { if (P.length && MG.near(p, P[0], 0.002)) return; P.push(p); l3dwHint(); return; } P.push(p); return l3dwFinish(); }
}
function l3dwFinish(closed) { l3dwCommit(l3dwMode(), l3dw.pts.slice(), !!closed); }

/* ---- Skapa objekt ---- */
/* En kontur (punkter i planet) → yta. Ligger ytan helt inne i en annan yta i samma plan blir den ett hål där och en egen yta (Push/Pull ger fickor och utbyggnader). */
function l3dwFaceFrom(pl, loop2, name) {
  const anchor = MG.to3(pl, loop2[0]), lpl = { o: MG.sub(pl.o, anchor), u: pl.u, v: pl.v };
  // konturen i planets koordinater relativt anchor-punkten
  const o2 = MG.to2(pl, anchor), L = loop2.map(q => [q[0] - o2[0], q[1] - o2[1]]);
  const p = modCreate({ k: "face", pl: { o: lpl.o.map(MG.r3), u: lpl.u, v: lpl.v }, loops: [MG.ccw(L).map(q => [MG.r3(q[0]), MG.r3(q[1])])] }, anchor, { name });
  return p;
}
function l3dwSplitHost(newP) {
  // Hittar ett yta i samma plan som den nya ytan ligger helt inom och gör den nya konturen till ett hål där.
  const m = newP.m; if (!m || m.k !== "face") return;
  const pa = MG.to3(m.pl, [0, 0]), plAbs = { o: [newP.x + m.pl.o[0], newP.y + m.pl.o[1], newP.z + m.pl.o[2]], u: m.pl.u, v: m.pl.v };
  void pa;
  for (const q of placements) {
    if (q === newP || !q.m || q.m.k !== "face" || (Number(q.rot) || 0) !== 0 || (Number(newP.rot) || 0) !== 0) continue;
    const qpl = { o: [q.x + q.m.pl.o[0], q.y + q.m.pl.o[1], q.z + q.m.pl.o[2]], u: q.m.pl.u, v: q.m.pl.v };
    if (!MG.samePlane(plAbs, qpl)) continue;
    const loopAbs = m.loops[0].map(c => MG.to3(plAbs, c)), inQ = loopAbs.map(P => MG.to2(qpl, P));
    const outer = q.m.loops[0], holes = q.m.loops.slice(1);
    if (inQ.every(c => MG.pip(outer, c) && !holes.some(h => MG.pip(h, c)))) {
      const lp = inQ.map(c => [MG.r3(c[0]), MG.r3(c[1])]);
      modEdit(q, mm => { mm.loops.push(MG.cw(lp)); }, { snapshot: false, changed: false });
      return q;
    }
  }
}
function l3dwCommit(m, P, closed) {
  const pl = l3dw.pl;
  l3dwTmp(); l3dw.pts = []; l3dw.vcb = ""; l3dw.lock = null; if (l3dwPref("plane") === "auto") l3dw.pl = null;
  if (typeof l3ShowVcb === "function") l3ShowVcb(null); l3.measLabel = null; if (l3t.measEl) l3t.measEl.style.display = "none";
  placeSnapshot();
  let made = null;
  if (m === "line" || m === "poly" || m === "poly3d") {
    if (P.length < 2) { l3dwHint(); return; }
    if (closed && P.length >= 3 && pl) { const L = P.map(q => MG.to2(pl, q)); made = l3dwFaceFrom(pl, L, "Yta"); l3dwSplitHost(made); }
    else { const anchor = P[0]; made = modCreate({ k: "curve", pts: P.map(q => MG.round3(MG.sub(q, anchor))), closed: false }, anchor, { name: "Linje", snapshot: false }); if (pl) l3dwTryFace(made, pl); }
  } else if (m === "rect") { const a = MG.to2(pl, P[0]), b = MG.to2(pl, P[1]); if (Math.abs(b[0] - a[0]) < 1e-3 || Math.abs(b[1] - a[1]) < 1e-3) { l3dwHint(); return; } made = l3dwFaceFrom(pl, MG.rect2(a, b), "Yta"); l3dwSplitHost(made); }
  else if (m === "circle") { const c = MG.to2(pl, P[0]), r = MG.dist(P[0], P[1]); if (r < 1e-3) return; made = l3dwFaceFrom(pl, MG.circle2(c, r, 48), "Cirkel"); l3dwSplitHost(made); }
  else if (m === "polygon") { const c = MG.to2(pl, P[0]), d = MG.to2(pl, P[1]), r = Math.hypot(d[0] - c[0], d[1] - c[1]); if (r < 1e-3) return; made = l3dwFaceFrom(pl, MG.polygon2(c, r, l3dwPref("sides"), Math.atan2(d[1] - c[1], d[0] - c[0])), "Polygon"); l3dwSplitHost(made); }
  else if (m === "arc") {
    const a = MG.to2(pl, P[0]), b = MG.to2(pl, P[1]), q = MG.to2(pl, P[2]), A = l3dw.arcSpec || MG.arc3(a, b, q); if (!A) return;
    const pts2 = MG.arcPts(A), anchor = P[0]; made = modCreate({ k: "curve", pts: pts2.map(c => MG.round3(MG.sub(MG.to3(pl, c), anchor))), closed: false }, anchor, { name: "Båge", snapshot: false }); l3dw.arcSpec = null;
  }
  l3dwHint();
  if (made) { l3SelectIds([made.id]); l3Changed(); l3Status(`${made.name} skapad${made.m.k === "face" ? " – Push/Pull (X → P) gör den till en kropp" : ""}. Ctrl+Z ångrar.`); }
}
/* Linjer som sluter sig (tillsammans med tidigare linjer i samma plan) blir en yta. Linjer som helt ingår i konturen ersätts av ytan. */
function l3dwTryFace(newP, pl) {
  const curves = placements.filter(q => q.m && q.m.k === "curve" && (Number(q.rot) || 0) === 0), segs = [], owner = [];
  curves.forEach(c => { const P = c.m.pts.map(q => [c.x + q[0], c.y + q[1], c.z + (Number(c.dz) || 0) + q[2]]); if (!P.every(q => Math.abs(MG.planeDist(pl, q)) < 2e-3)) return; for (let i = 1; i < P.length; i++) { segs.push([P[i - 1], P[i]]); owner.push([c, i - 1]); } });
  const mine = []; segs.forEach((s, i) => { if (owner[i][0] === newP) mine.push(i); });
  for (const i of mine) {
    const ring = MG.findLoop(segs, i); if (!ring) continue;
    const L = ring.map(q => MG.to2(pl, q)); if (Math.abs(MG.area2(L)) < 1e-4) continue;
    const f = l3dwFaceFrom(pl, L, "Yta"); l3dwSplitHost(f);
    // ta bort kurvor vars alla segment ligger i ringen
    const used = new Set(); for (let k = 0; k < ring.length; k++) { const a = ring[k], b = ring[(k + 1) % ring.length]; segs.forEach((s, si) => { if ((MG.near(s[0], a) && MG.near(s[1], b)) || (MG.near(s[0], b) && MG.near(s[1], a))) used.add(si); }); }
    const byObj = new Map(); owner.forEach(([c], si) => { const a = byObj.get(c) || { all: 0, used: 0 }; a.all++; if (used.has(si)) a.used++; byObj.set(c, a); });
    byObj.forEach((v, c) => { if (v.all === v.used) { const pi = placements.indexOf(c); if (pi >= 0) { placements.splice(pi, 1); placeDeleted.add(c.id); placeDirty.delete(c.id); const g = l3.placeMeshes.get(c.id); if (g) { l3.groups.places.remove(g); l3.placeMeshes.delete(c.id); } } } });
    l3SelectIds([f.id]); l3Status("Sluten kontur – ytan skapades."); return f;
  }
}

/* ---- Förhandsvisning av pågående operation ---- */
function l3dwDrawOp(cur) {
  const m = l3dwMode(), P = l3dw.pts, pl = l3dw.pl; if (!P.length) return;
  const typed = l3dw.vcb ? l3dwParse(l3dw.vcb) : [];
  if (m === "line" || m === "poly" || m === "poly3d") {
    let end = cur; const a = P[P.length - 1];
    if (typed.length && Number.isFinite(typed[0]) && typed.length === 1) { const d = MG.norm(MG.sub(cur, a)); end = MG.add(a, MG.mul(d, typed[0])); }
    l3dwLoop([...P, end], "#dc2626", false);
    if (P.length >= 3 && pl) l3dwFill(pl, [[...P, end].map(q => MG.to2(pl, q))], "#2563eb", 0.12);
    l3dwLabel(MG.lerp(a, end, 0.5), l3dwFmt(MG.dist(a, end)) + (P.length > 1 ? `  (Σ ${l3dwFmt(P.reduce((s, q, i) => s + (i ? MG.dist(P[i - 1], q) : 0), MG.dist(a, end)))})` : ""));
    l3dw.end = end; l3dwVcb("Längd", l3dwFmt(MG.dist(a, end))); return;
  }
  if (m === "rect") {
    const a = MG.to2(pl, P[0]); let b = MG.to2(pl, cur);
    if (typed.length >= 1 && typed.every(Number.isFinite)) { const sx = Math.sign(b[0] - a[0]) || 1, sy = Math.sign(b[1] - a[1]) || 1; b = [a[0] + sx * typed[0], a[1] + sy * (typed.length > 1 ? typed[1] : typed[0])]; }
    const L = MG.rect2(a, b), L3 = L.map(q => MG.to3(pl, q)); l3dwLoop(L3, "#dc2626"); l3dwFill(pl, [L], "#2563eb");
    l3dwLabel(MG.to3(pl, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), `${l3dwFmt(Math.abs(b[0] - a[0]))} × ${l3dwFmt(Math.abs(b[1] - a[1]))}`); l3dw.endUV = b; l3dwVcb("Mått (bredd;höjd)", `${l3dwFmt(Math.abs(b[0] - a[0]))} × ${l3dwFmt(Math.abs(b[1] - a[1]))}`); return;
  }
  if (m === "circle" || m === "polygon") {
    const c = MG.to2(pl, P[0]), q = MG.to2(pl, cur); let r = Math.hypot(q[0] - c[0], q[1] - c[1]), rot = Math.atan2(q[1] - c[1], q[0] - c[0]);
    if (typed.length && typed[0] && Number.isFinite(typed[0]) && !typed[0].sides) r = typed[0];
    const L = m === "circle" ? MG.circle2(c, r, 48) : MG.polygon2(c, r, l3dwPref("sides"), rot); l3dwLoop(L.map(x => MG.to3(pl, x)), "#dc2626"); l3dwFill(pl, [L], "#2563eb"); l3dwLine(P[0], MG.to3(pl, [c[0] + r * Math.cos(rot), c[1] + r * Math.sin(rot)]), "#dc2626", true);
    l3dwLabel(MG.lerp(P[0], MG.to3(pl, [c[0] + r * Math.cos(rot), c[1] + r * Math.sin(rot)]), 0.5), `r ${l3dwFmt(r)}`); l3dw.endR = r; l3dwVcb("Radie", l3dwFmt(r)); return;
  }
  if (m === "arc") {
    if (P.length === 1) { l3dwLine(P[0], cur, "#dc2626", true); l3dwLabel(MG.lerp(P[0], cur, 0.5), l3dwFmt(MG.dist(P[0], cur))); return; }
    const a = MG.to2(pl, P[0]), b = MG.to2(pl, P[1]), q = MG.to2(pl, cur); let A = MG.arc3(a, b, q);
    if (typed.length && Number.isFinite(typed[0]) && typed[0] > 0) { const side = ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) >= 0 ? 1 : -1; A = MG.arcRadius(a, b, typed[0], side); }
    l3dwLine(P[0], P[1], "#94a3b8", true);
    if (A) { const pts = MG.arcPts(A).map(c => MG.to3(pl, c)); l3dwLoop(pts, "#dc2626", false); l3dwLabel(pts[Math.floor(pts.length / 2)], `r ${l3dwFmt(A.r)}`); l3dw.arcSpec = A; }
    return;
  }
}

/* ---- Tangentbord ---- */
function l3dwKey(e) {
  if (!l3dwOn() || e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = e.key, m = l3dwMode(), act = l3dw.pts.length > 0 || !!l3dw.op;
  if (k === "Escape") { if (act || l3dw.pl && l3dwPref("plane") !== "auto") { l3dwReset(false); l3Status("Avbrutet."); return true; } l3SetTool("select"); return true; }
  // Läge via bokstav (när inget pågår)
  const lt = (L3DW_MODES[l3.tool] || []).find(x => x[2].toLowerCase() === k.toLowerCase() && L3DW_IMPL.has(x[0]));
  if (lt && !act && !/^\d$/.test(k) || (lt && /^\d$/.test(k) && !act)) { l3dwSetMode(lt[0]); return true; }
  if (act) {
    const ch = k.length === 1 ? k.toLowerCase() : "", v = l3dw.vcb;
    const okNum = /^[0-9.,;]$/.test(ch) || (ch === "-" && (!v || /;$/.test(v))) || (/^[xsmc]$/.test(ch) && /[\d.,mc]$/.test(v) && !(ch === "x" && /[mc]$/.test(v)));
    if (okNum) { l3dw.vcb += ch === "x" ? "x" : ch; l3dwVcb(l3dwVcbLabel()); l3dwRefreshOp(); e.preventDefault(); return true; }
    if (k === "Backspace" && l3dw.vcb) { l3dw.vcb = l3dw.vcb.slice(0, -1); l3dwVcb(l3dwVcbLabel()); l3dwRefreshOp(); e.preventDefault(); return true; }
    if (k === "Backspace" && !l3dw.vcb && l3dw.pts.length > 1 && (m === "line" || m === "poly" || m === "poly3d")) { l3dw.pts.pop(); l3dwRefreshOp(); e.preventDefault(); return true; }
    if (k === "Enter") { e.preventDefault(); l3dwEnter(); return true; }
    const ax = { ArrowRight: "x", ArrowLeft: "y", ArrowUp: "z" }[k];
    if (ax && (m === "line" || m === "poly" || m === "poly3d" || m === "arc" || m === "rect")) { l3dw.lock = l3dw.lock === ax ? null : ax; l3Status(l3dw.lock ? `Låst längs ${L3DW_AX[ax].name}. Tryck pilen igen för att släppa.` : "Riktningen är fri."); l3dwRefreshOp(); e.preventDefault(); return true; }
  }
  if (!act && (k === "Enter") && l3dw.pts.length === 0) return false;
  return false;
}
const l3dwVcbLabel = () => { const m = l3dwMode(); return m === "rect" ? "Mått (bredd;höjd)" : m === "circle" || m === "polygon" ? "Radie" : m === "arc" ? "Radie" : l3.tool === "model" ? "Avstånd" : "Längd"; };
function l3dwRefreshOp() { if (l3dw.ev) { l3dwTmp(); l3dwHover(l3dw.ev); } if (l3dw.op) l3dwModelRefresh(); }
function l3dwSetMode(m) {
  if (!(L3DW_MODES[l3.tool] || []).some(x => x[0] === m)) return;
  l3dwReset(true); l3dwSet(l3.tool, m); l3dwHint(); l3RenderSnapBar(); l3.renderer.domElement.style.cursor = "crosshair";
}
function l3dwStartModel(m) { if (l3.tool !== "model") l3SetTool("model"); l3dwSetMode(m); }
/* Enter: sätter punkten dit måttet pekar. */
function l3dwEnter() {
  const m = l3dwMode(), P = l3dw.pts, pl = l3dw.pl, typed = l3dwParse(l3dw.vcb);
  if (l3.tool === "model") return l3dwModelEnter(typed);
  if (m === "line" || m === "poly" || m === "poly3d") {
    if (!l3dw.vcb) { if (P.length >= 2) l3dwFinish(false); return; }
    if (typed.length === 1 && Number.isFinite(typed[0]) && l3dw.end) { P.push(l3dw.end); l3dw.vcb = ""; l3dwVcb("Längd"); l3dwHint(); l3dwRefreshOp(); return; }
    if (typed.length >= 2 && typed.every(Number.isFinite) && pl) { const a = P[P.length - 1], q = MG.to2(pl, a); P.push(MG.to3(pl, [q[0] + typed[0], q[1] + typed[1]])); l3dw.vcb = ""; l3dwRefreshOp(); return; }
  }
  if ((m === "rect") && typed.length >= 1 && P.length === 1 && typed.every(Number.isFinite) && l3dw.endUV) { const a = MG.to2(pl, P[0]); P.push(MG.to3(pl, l3dw.endUV)); void a; return l3dwFinish(); }
  if ((m === "circle" || m === "polygon") && P.length === 1) {
    const sd = typed.find(t => t && t.sides); if (sd) { l3dwSet("sides", Math.max(3, Math.min(64, Math.round(sd.sides)))); l3dw.vcb = ""; l3dwHint(); l3dwRefreshOp(); return; }
    if (typed.length && Number.isFinite(typed[0]) && typed[0] > 0) { P.push(MG.to3(pl, [MG.to2(pl, P[0])[0] + typed[0], MG.to2(pl, P[0])[1]])); return l3dwFinish(); }
  }
  if (m === "arc" && P.length === 2 && typed.length && Number.isFinite(typed[0]) && l3dw.arcSpec) { P.push(MG.to3(pl, MG.arcPts(l3dw.arcSpec)[Math.floor(MG.arcPts(l3dw.arcSpec).length / 2)])); return l3dwFinish(); }
  l3dw.vcb = ""; l3dwVcb(null);
}
