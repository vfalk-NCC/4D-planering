/* 3D-vyn – byggdelar: gör IFC-objekt redigerbara och dela dem i bitar (Victor 2026-11-11: "jag har kopierat upp delarna från ifcen 5 meter upp i luften som
   jag vill dela upp – kan vi göra så att dessa blir byggdelar i min 3d-editor så att jag kan redigera dom? Med alla verktyg däribland dela upp").

   1. Redigera (knappen i panelen när IFC-objekt är markerade): varje markerat IFC-objekt blir ett vanligt ritat objekt (nät) med samma form, färg och namn.
      Är det en kopia (Kopiera) tas kopian bort ur IFC-modellen – den ersätts av det redigerbara objektet, så att den inte sparas två gånger. Originalen i
      IFC-filen står kvar. Det ritade objektet går att flytta, vrida, skala, måla, skära (Skär ytor), slå ihop och dela med alla verktyg.
   2. Dela i bitar (objektets egenskaper, för ritade nät/kroppar): lika långa bitar (t.ex. var 6:e meter) eller ett antal lika långa bitar, längs objektets
      längdriktning (huvudriktningen i planen). Snitten läggs lodrätt tvärs riktningen och varje bit får lock i snittet, så bitarna blir slutna kroppar med
      rätt volym. Ersätter originalet (Ctrl+Z ångrar) och bitarna ärver färg och kopplingar. */

const L3BQ_K = 1e4, l3bqKey = p => Math.round(p[0] * L3BQ_K) + "," + Math.round(p[1] * L3BQ_K) + "," + Math.round(p[2] * L3BQ_K);

/* ---- 1. IFC-objekt → ritade objekt ---- */
function l3bqEntGeom(e) {
  const u = e.mesh.userData.l3b, r = u.ranges[e.ri], [s, n] = l3bsIdx(e.mesh, e.ri), P = e.mesh.geometry.getAttribute("position"), C = e.mesh.geometry.getAttribute("color");
  e.mesh.updateWorldMatrix(true, false); const W = e.mesh.matrixWorld, O = l3.O, v = new THREE.Vector3(), pts = [];
  for (let i = 0; i < r.count; i++) { v.fromBufferAttribute(P, r.start + i).applyMatrix4(W); pts.push([v.x + O[0], v.y + O[1], v.z + O[2]]); }
  const faces = []; for (let i = 0; i + 2 < n; i += 3) faces.push([u.origIdx[s + i] - r.start, u.origIdx[s + i + 1] - r.start, u.origIdx[s + i + 2] - r.start]);
  let cr = 0, cg = 0, cb = 0; const m = Math.min(r.count, 60), k8 = C && C.array instanceof Uint8Array;
  for (let i = 0; i < m; i++) { const k = (r.start + i) * 3; cr += C.array[k]; cg += C.array[k + 1]; cb += C.array[k + 2]; }
  const f = k8 ? 1 : 255, hx = x => Math.max(0, Math.min(255, Math.round(x / m * f))).toString(16).padStart(2, "0");
  return { pts, faces, color: m ? "#" + hx(cr) + hx(cg) + hx(cb) : "#9ca3af", name: r.name || "Byggdel" };
}
const l3bqClosed = faces => { const E = new Map(); faces.forEach(f => { for (let i = 0; i < 3; i++) { const a = f[i], b = f[(i + 1) % 3], k = a < b ? a + "_" + b : b + "_" + a; E.set(k, (E.get(k) || 0) + 1); } }); for (const c of E.values()) if (c !== 2) return false; return true; };
function l3bqMake() {
  const sel = (typeof l3bs !== "undefined" ? l3bs.sel : []).filter(e => e && e.mesh && e.mesh.userData.l3b); if (!sel.length) { l3Status("Markera IFC-objekten som ska bli redigerbara först.", true); return []; }
  if (sel.length > 300) { l3Status(`${sel.length} objekt är för många på en gång – markera färre (högst 300).`, true); return []; }
  placeSnapshot(); const ids = [];
  sel.forEach(e => {
    const g = l3bqEntGeom(e); if (!g.pts.length || !g.faces.length) return;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity; g.pts.forEach(p => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); z0 = Math.min(z0, p[2]); });
    const r3 = v => Math.round(v * 1000) / 1000, m = { k: "mesh", pts: g.pts.map(p => [r3(p[0] - x0), r3(p[1] - y0), r3(p[2] - z0)]), faces: g.faces.map(f => [f[0] + 1, f[1] + 1, f[2] + 1]), closed: l3bqClosed(g.faces) };
    ids.push(modCreate(m, [x0, y0, z0], { name: g.name, color: g.color, snapshot: false }).id);
  });
  const copies = sel.filter(e => typeof l3bmIsCopy === "function" && l3bmIsCopy(e));
  if (copies.length && typeof l3bmCopyDelete === "function") l3bmCopyDelete(copies);
  if (ids.length) { l3SelectIds(ids); l3Changed(); l3Toast(`${ids.length} ${ids.length === 1 ? "objekt är" : "objekt är"} nu redigerbara${copies.length ? ` (${copies.length} IFC-kopior ersatta)` : " (originalen i IFC-filen står kvar)"}. Dela i bitar: objektets egenskaper.`); }
  return ids;
}

/* ---- 2. Dela i bitar ---- */
const l3bqSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
/* Delar trianglar med ett lodrätt plan (normal n i planet, avstånd c). Ger trianglar på varje sida och snittets kantsegment. */
function l3bqPlane(tris, n, c) {
  const lo = [], hi = [], seg = [], d = p => p[0] * n[0] + p[1] * n[1] - c, lerp = (a, b, da, db) => { const t = da / (da - db); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
  const EPS = 1e-7;
  tris.forEach(t => {
    const dd = t.map(d); if (dd.every(x => x >= -EPS)) { if (dd.every(x => Math.abs(x) <= EPS)) return; hi.push(t); return; } if (dd.every(x => x <= EPS)) { lo.push(t); return; }
    // Triangeln skärs: dela polygonen i två sidor och samla snittkanten.
    const sides = [[], []], cut = []; // sides[0] = lo (d<0), sides[1] = hi
    for (let i = 0; i < 3; i++) {
      const a = t[i], b = t[(i + 1) % 3], da = dd[i], db = dd[(i + 1) % 3];
      sides[da < 0 ? 0 : 1].push(a); if (Math.abs(da) <= EPS) sides[0].push(a);
      if ((da < -EPS && db > EPS) || (da > EPS && db < -EPS)) { const q = lerp(a, b, da, db); sides[0].push(q); sides[1].push(q); cut.push(q); }
      else if (Math.abs(da) <= EPS) cut.push(a);
    }
    sides.forEach((poly, si) => { for (let i = 1; i + 1 < poly.length; i++) (si ? hi : lo).push([poly[0], poly[i], poly[i + 1]]); });
    if (cut.length >= 2) seg.push([cut[0], cut[1]]);
  });
  return { lo, hi, seg };
}
/* Kantsegment → slutna konturer → trianglar (med hål). outward = riktning locket ska vända åt. */
function l3bqCap(seg, n, outward) {
  if (!seg.length) return [];
  const map = new Map(); seg.forEach(([a, b], i) => { const ka = l3bqKey(a), kb = l3bqKey(b); if (ka === kb) return; (map.get(ka) || map.set(ka, []).get(ka)).push([i, b, kb]); (map.get(kb) || map.set(kb, []).get(kb)).push([i, a, ka]); });
  const used = new Set(), loops = [];
  for (let s = 0; s < seg.length; s++) {
    if (used.has(s)) continue; used.add(s); const loop = [seg[s][0]]; let cur = seg[s][1], ck = l3bqKey(cur), start = l3bqKey(seg[s][0]), guard = 0;
    while (ck !== start && guard++ < seg.length + 5) { loop.push(cur); const nx = (map.get(ck) || []).find(x => !used.has(x[0])); if (!nx) break; used.add(nx[0]); cur = nx[1]; ck = nx[2]; }
    if (ck === start && loop.length >= 3) loops.push(loop);
  }
  if (!loops.length) return [];
  const vx = -n[1], vy = n[0], to2 = p => new THREE.Vector2(p[0] * vx + p[1] * vy, p[2]);   // i planet: bredd (v) och höjd (z)
  const L = loops.map(pts => { const p2 = pts.map(to2); let a = 0; for (let i = 0; i < p2.length; i++) { const q = p2[(i + 1) % p2.length]; a += p2[i].x * q.y - q.x * p2[i].y; } return { pts, p2, area: a / 2 }; }).sort((x, y) => Math.abs(y.area) - Math.abs(x.area));
  const inside = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i].y > pt.y) !== (poly[j].y > pt.y) && pt.x < (poly[j].x - poly[i].x) * (pt.y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x) c = !c; return c; };
  L.forEach((l, i) => { l.depth = 0; l.parent = -1; for (let j = 0; j < i; j++) if (inside(l.p2[0], L[j].p2)) { l.depth++; if (L[j].depth % 2 === 0) l.parent = j; } });
  const out = [];
  L.forEach((o, oi) => {
    if (o.depth % 2 !== 0) return; const holes = L.filter(h => h.depth % 2 === 1 && h.parent === oi), all = [...o.pts, ...holes.flatMap(h => h.pts)], c2 = o.p2.slice(), h2 = holes.map(h => h.p2.slice());
    const cl = THREE.ShapeUtils.isClockWise(c2) ? c2.slice().reverse() : c2; const idxMap = THREE.ShapeUtils.isClockWise(c2); // behåll punktordningen mot all[]
    let tri; try { tri = THREE.ShapeUtils.triangulateShape(c2, h2); } catch (e) { tri = []; }
    tri.forEach(f => { let a = all[f[0]], b = all[f[1]], c = all[f[2]]; const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]); if (nx * outward[0] + ny * outward[1] < 0) { out.push([a, c, b]); } else out.push([a, b, c]); });
    void cl; void idxMap;
  });
  return out;
}
/* Trianglar → nät med delade punkter (1-baserade ytor). */
function l3bqMesh(tris) {
  const idx = new Map(), pts = [], faces = [], r3 = v => Math.round(v * 1000) / 1000;
  const id = p => { const k = l3bqKey(p); let i = idx.get(k); if (!i) { pts.push([r3(p[0]), r3(p[1]), r3(p[2])]); i = pts.length; idx.set(k, i); } return i; };
  tris.forEach(t => { const a = id(t[0]), b = id(t[1]), c = id(t[2]); if (a !== b && b !== c && a !== c) faces.push([a, b, c]); });
  return { k: "mesh", pts, faces, closed: l3bqClosed(faces.map(f => [f[0], f[1], f[2]])) };
}
/* Delar ett nät/en kropp i bitar. opts: { mode: "length" | "count", value }. Returnerar { pieces: [mesh…], axis, len } eller { err }. */
function l3bqCut(p, opts) {
  const lm = typeof modLocalMesh === "function" ? modLocalMesh(p) : null; if (!lm || !lm.faces || !lm.faces.length) return { err: "Objektet har ingen yta att dela." };
  const P = lm.pts, tris = lm.faces.map(f => [P[f[0] - 1], P[f[1] - 1], P[f[2] - 1]]);
  let mx = 0, my = 0; P.forEach(q => { mx += q[0]; my += q[1]; }); mx /= P.length; my /= P.length;
  let sxx = 0, sxy = 0, syy = 0; P.forEach(q => { const a = q[0] - mx, b = q[1] - my; sxx += a * a; sxy += a * b; syy += b * b; });
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), n = [Math.cos(th), Math.sin(th)];
  let t0 = Infinity, t1 = -Infinity; P.forEach(q => { const t = q[0] * n[0] + q[1] * n[1]; t0 = Math.min(t0, t); t1 = Math.max(t1, t); });
  const len = t1 - t0; if (len < 0.05) return { err: "Objektet är för kort för att delas." };
  const val = Number(opts.value) || 0; let N = opts.mode === "count" ? Math.round(val) : Math.ceil(len / Math.max(0.05, val) - 1e-6);
  if (!(N >= 2)) return { err: opts.mode === "count" ? "Ange minst 2 bitar." : `Objektet är ${len.toFixed(1).replace(".", ",")} m långt – bitlängden måste vara kortare.` };
  if (N > 200) return { err: "Det blir över 200 bitar – ange en längre bitlängd." };
  const step = opts.mode === "count" ? len / N : val, pieces = []; let rest = tris;
  for (let k = 1; k < N; k++) {
    const c = t0 + step * k, r = l3bqPlane(rest, n, c), capLo = l3bqCap(r.seg, n, n), capHi = l3bqCap(r.seg, n, [-n[0], -n[1]]);
    pieces.push(l3bqMesh([...r.lo, ...capLo])); rest = [...r.hi, ...capHi];
  }
  pieces.push(l3bqMesh(rest));
  return { pieces: pieces.filter(m => m.faces.length), axis: n, len };
}
function l3bqRun(p, opts) {
  const r = l3bqCut(p, opts); if (r.err) { l3Status(r.err, true); return null; }
  placeSnapshot(); const made = [], core = new Set(["id", "m", "name", "created_at", "type"]);
  r.pieces.forEach((m, i) => {
    const q = modCreate(m, [p.x, p.y, p.z], { name: `${p.name || "Objekt"} ${i + 1}/${r.pieces.length}`, color: p.color, snapshot: false });
    Object.keys(p).forEach(k => { if (!core.has(k)) q[k] = p[k]; }); made.push(q);
  });
  l3SelectIds([p.id]); l3DeleteSel(); l3SelectIds(made.map(q => q.id)); l3Changed();
  l3Status(`${p.name || "Objektet"} (${r.len.toFixed(1).replace(".", ",")} m) delat i ${made.length} bitar. Ctrl+Z ångrar.`);
  return made;
}
const l3bqPref = { mode: "length", value: 6 };
function l3bqHtml(list) {
  if (!list || list.length !== 1 || !list[0].m || (list[0].m.k !== "mesh" && list[0].m.k !== "solid")) return "";
  return `<details class="v3-field v3-bqsplit" title="Dela objektet i bitar längs dess längdriktning – t.ex. en lång mur i gjutetapper"><summary><span>Dela i bitar…</span></summary>
    <label class="v3-field"><span>Dela efter</span><select data-bqmode><option value="length" ${l3bqPref.mode === "length" ? "selected" : ""}>Bitlängd (m)</option><option value="count" ${l3bqPref.mode === "count" ? "selected" : ""}>Antal bitar</option></select></label>
    <label class="v3-field"><span>Värde</span><input type="number" data-bqval min="0.1" step="0.5" value="${l3bqPref.value}"></label>
    <button type="button" class="btn" data-bqgo>Dela</button></details>`;
}
function l3bqBind(side, list) {
  const go = side.querySelector("[data-bqgo]"); if (!go) return; const m = side.querySelector("[data-bqmode]"), v = side.querySelector("[data-bqval]");
  m.onchange = () => { l3bqPref.mode = m.value; if (m.value === "count" && l3bqPref.value < 2) { l3bqPref.value = 4; v.value = 4; } };
  v.onchange = () => { l3bqPref.value = Number(v.value) || l3bqPref.value; };
  go.onclick = () => { l3bqPref.mode = m.value; l3bqPref.value = Number(v.value) || 0; setTimeout(() => l3bqRun(list[0], l3bqPref), 20); };
}

/* ---- 3. Gjutform som följer formen (Victor 2026-11-11: "muren är bergsanpassad – kan vi bygga in en funktion i den automatiska formen som anpassar sig efter formen på muren?") ----
   Den vanliga Gjutformen är en rätvinklig ask runt objektet. Här läggs i stället formskivor mot objektets egna lodräta ytor – därför följer formen murens verkliga kontur:
   den bergsanpassade undersidan (trappstegen och lutningarna), toppen, krökar, avtrappningar och ändarna. Undersidan och ovansidan lämnas öppna (där gjuter du mot berget / fyller på).
   Punkternas förskjutning är medelvärdet av ytornas normaler (hörnen får en skarv). Resultatet är ett vanligt ritat objekt (redigera, dela, skär, flytta) med formvirkets färg. */
function l3bqFormFromGeom(g, margin, thick) {
  const P = g.pts, F = g.faces; if (!P.length || !F.length) return null;
  // inåtvänd/utåtvänd: positiv volym = ytterna vänder utåt
  let vol = 0; F.forEach(f => { const a = P[f[0]], b = P[f[1]], c = P[f[2]]; vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; });
  const flip = vol < 0 ? -1 : 1, side = [], tn = new Map(), keyOf = p => l3bqKey(p);
  F.forEach(f => {
    const a = P[f[0]], b = P[f[1]], c = P[f[2]], u = l3bqSub(b, a), v = l3bqSub(c, a), n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], len = Math.hypot(n[0], n[1], n[2]);
    if (len < 1e-9) return; const nn = [n[0] / len * flip, n[1] / len * flip, n[2] / len * flip];
    if (Math.abs(nn[2]) > 0.5) return;   // golv/tak: ingen form
    side.push([a, b, c, nn, len]); [a, b, c].forEach(p => { const k = keyOf(p), t = tn.get(k) || [0, 0, 0]; t[0] += nn[0] * len; t[1] += nn[1] * len; t[2] += nn[2] * len; tn.set(k, t); });
  });
  if (!side.length) return null;
  const off = (p, d) => { const t = tn.get(keyOf(p)), l = Math.hypot(t[0], t[1], t[2]) || 1; return [p[0] + t[0] / l * d, p[1] + t[1] / l * d, p[2] + t[2] / l * d]; };
  const tris = [], E = new Map();
  side.forEach(([a, b, c]) => {
    const A = off(a, margin), B = off(b, margin), C = off(c, margin), A2 = off(a, margin + thick), B2 = off(b, margin + thick), C2 = off(c, margin + thick);
    tris.push([A, B, C], [A2, C2, B2]);   // innerskiva (mot betongen) och ytterskiva
    [[a, b, A, B, A2, B2], [b, c, B, C, B2, C2], [c, a, C, A, C2, A2]].forEach(([p, q, p1, q1, p2, q2]) => { const k1 = keyOf(p), k2 = keyOf(q), k = k1 < k2 ? k1 + "|" + k2 : k2 + "|" + k1; const e = E.get(k); if (e) e.n++; else E.set(k, { n: 1, p1, q1, p2, q2 }); });
  });
  E.forEach(e => { if (e.n === 1) tris.push([e.p1, e.q1, e.q2], [e.p1, e.q2, e.p2]); });   // kantskivor runt formens ytterkant (underkant, överkant och ändar)
  return { mesh: l3bqMesh(tris), area: side.reduce((s, t) => s + t[4] / 2, 0) };
}
function l3bqFormMake(margin = 0, thick = 0.03) {
  const sel = (typeof l3bs !== "undefined" ? l3bs.sel : []).filter(e => e && e.mesh && e.mesh.userData.l3b); if (!sel.length) { l3Status("Markera muren (IFC-objekt) först.", true); return []; }
  placeSnapshot(); const ids = []; let area = 0;
  sel.forEach(e => {
    const g = l3bqEntGeom(e), r = l3bqFormFromGeom(g, margin, thick); if (!r) return;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity; r.mesh.pts.forEach(p => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); z0 = Math.min(z0, p[2]); });
    r.mesh.pts = r.mesh.pts.map(p => [Math.round((p[0] - x0) * 1000) / 1000, Math.round((p[1] - y0) * 1000) / 1000, Math.round((p[2] - z0) * 1000) / 1000]);
    const q = modCreate(r.mesh, [x0, y0, z0], { name: `Gjutform ${String(g.name).slice(0, 40)} (följer formen)`, color: "#c9a063", snapshot: false }); q.note = `Formyta ${Math.round(r.area * 10) / 10} m² – formskivor mot objektets egna ytor`; q.formArea = Math.round(r.area * 100) / 100; ids.push(q.id); area += r.area;
  });
  if (!ids.length) { l3Status("Hittade inga lodräta ytor att bygga formen mot.", true); return []; }
  l3SelectIds(ids); l3Changed(); l3Toast(`Gjutform som följer formen: ${ids.length} ${ids.length === 1 ? "objekt" : "objekt"}, ${area.toFixed(1).replace(".", ",")} m² formyta. Underkanten följer berget. Ctrl+Z ångrar.`);
  return ids;
}
