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
  const lo = [], hi = [], seg = [], d = p => p[0] * n[0] + p[1] * n[1] + (n[2] ? p[2] * n[2] : 0) - c, lerp = (a, b, da, db) => { const t = da / (da - db); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; };
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
  const horiz = !!n[2], vx = -n[1], vy = n[0], to2 = horiz ? (p => new THREE.Vector2(p[0], p[1])) : (p => new THREE.Vector2(p[0] * vx + p[1] * vy, p[2]));   // i planet: bredd (v) och höjd (z) – eller x, y för vågräta snitt
  const L = loops.map(pts => { const p2 = pts.map(to2); let a = 0; for (let i = 0; i < p2.length; i++) { const q = p2[(i + 1) % p2.length]; a += p2[i].x * q.y - q.x * p2[i].y; } return { pts, p2, area: a / 2 }; }).sort((x, y) => Math.abs(y.area) - Math.abs(x.area));
  const inside = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i].y > pt.y) !== (poly[j].y > pt.y) && pt.x < (poly[j].x - poly[i].x) * (pt.y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x) c = !c; return c; };
  L.forEach((l, i) => { l.depth = 0; l.parent = -1; for (let j = 0; j < i; j++) if (inside(l.p2[0], L[j].p2)) { l.depth++; if (L[j].depth % 2 === 0) l.parent = j; } });
  const out = [];
  L.forEach((o, oi) => {
    if (o.depth % 2 !== 0) return; const holes = L.filter(h => h.depth % 2 === 1 && h.parent === oi), all = [...o.pts, ...holes.flatMap(h => h.pts)], c2 = o.p2.slice(), h2 = holes.map(h => h.p2.slice());
    const cl = THREE.ShapeUtils.isClockWise(c2) ? c2.slice().reverse() : c2; const idxMap = THREE.ShapeUtils.isClockWise(c2); // behåll punktordningen mot all[]
    let tri; try { tri = THREE.ShapeUtils.triangulateShape(c2, h2); } catch (e) { tri = []; }
    tri.forEach(f => { let a = all[f[0]], b = all[f[1]], c = all[f[2]]; const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); if (nx * outward[0] + ny * outward[1] + nz * (outward[2] || 0) < 0) { out.push([a, c, b]); } else out.push([a, b, c]); });
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
/* Delar längs objektets längdriktning (n) och/eller tvärs (v, vinkelrätt i plan). Placerade snitt: opts.cuts (längs) och opts.cutsW (tvärs), avstånd från objektets ena kant.
   Båda riktningarna ger ett rutnät av bitar: först delas objektet i remsor längs, därefter delas varje remsa tvärs. Enkelt läge: opts.dir "l" | "w" med mode/value. */
const l3bqSVol = T => T.reduce((s, [A, B, C]) => s + (A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6, 0);
function l3bqSlice(tris0, nrm, o, positions) {
  // Varje skiva klipps direkt ur det ursprungliga nätet mellan två plan. Låren räknas ur snittkonturen på just det nät som klipptes (nedre ur originalet,
  // övre ur den redan nedklippta biten) – då stämmer kantpunkterna exakt och biten blir sluten även för täta, oregelbundna murar.
  const sg = l3bqSVol(tris0) < 0 ? -1 : 1, N = positions.length, out = [], up = [nrm[0] * sg, nrm[1] * sg, (nrm[2] || 0) * sg], dn = up.map(v => -v);
  for (let k = 0; k <= N; k++) {
    let T = tris0, bottom = [], top = [];
    if (k > 0) { const r = l3bqPlane(T, nrm, o + positions[k - 1]); T = r.hi; bottom = l3bqCap(r.seg, nrm, dn); }
    if (k < N) { const r = l3bqPlane(T, nrm, o + positions[k]); T = r.lo; top = l3bqCap(r.seg, nrm, up); }
    out.push([...T, ...bottom, ...top]);
  }
  return out;
}
function l3bqCut(p, opts) {
  const lm = typeof modLocalMesh === "function" ? modLocalMesh(p) : null; if (!lm || !lm.faces || !lm.faces.length) return { err: "Objektet har ingen yta att dela." };
  const P = lm.pts, tris = lm.faces.map(f => [P[f[0] - 1], P[f[1] - 1], P[f[2] - 1]]);
  let mx = 0, my = 0; P.forEach(q => { mx += q[0]; my += q[1]; }); mx /= P.length; my /= P.length;
  let sxx = 0, sxy = 0, syy = 0; P.forEach(q => { const a = q[0] - mx, b = q[1] - my; sxx += a * a; sxy += a * b; syy += b * b; });
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy) + (Number(opts.rot) || 0) * Math.PI / 180, n = [Math.cos(th), Math.sin(th)], v = [-n[1], n[0]];   // opts.rot = vridning av delningsriktningen (grader)
  let t0 = Infinity, t1 = -Infinity, w0 = Infinity, w1 = -Infinity; P.forEach(q => { const t = q[0] * n[0] + q[1] * n[1], w = q[0] * v[0] + q[1] * v[1]; t0 = Math.min(t0, t); t1 = Math.max(t1, t); w0 = Math.min(w0, w); w1 = Math.max(w1, w); });
  let z0 = Infinity, z1 = -Infinity; P.forEach(q => { z0 = Math.min(z0, q[2]); z1 = Math.max(z1, q[2]); }); const lenZ = z1 - z0;
  const len = t1 - t0, lenW = w1 - w0; if (len < 0.05 && lenW < 0.05 && lenZ < 0.05) return { err: "Objektet är för litet för att delas." };
  const clean = (arr, L) => (Array.isArray(arr) ? arr.map(Number).filter(d => d > 0.01 && d < L - 0.01).sort((a, b) => a - b) : null);
  let posL, posW = [], posZ = [];
  if (Array.isArray(opts.cuts) || Array.isArray(opts.cutsW) || Array.isArray(opts.cutsZ)) {
    posL = clean(opts.cuts, len) || []; posW = clean(opts.cutsW, lenW) || []; posZ = clean(opts.cutsZ, lenZ) || [];
    if (!posL.length && !posW.length && !posZ.length) return { err: "Placera minst ett snitt inne i objektet." };
  } else {
    const wide = opts.dir === "w", high = opts.dir === "z", L = high ? lenZ : wide ? lenW : len; if (L < 0.05) return { err: "Objektet är för smalt för att delas åt det hållet." };
    const val = Number(opts.value) || 0, N = opts.mode === "count" ? Math.round(val) : Math.ceil(L / Math.max(0.05, val) - 1e-6);
    if (!(N >= 2)) return { err: opts.mode === "count" ? "Ange minst 2 bitar." : `Objektet är ${L.toFixed(1).replace(".", ",")} m ${wide ? "brett" : "långt"} – bitlängden måste vara kortare.` };
    if (N > 200) return { err: "Det blir över 200 bitar – ange en längre bitlängd." };
    const step = opts.mode === "count" ? L / N : val, pos = Array.from({ length: N - 1 }, (_, k) => step * (k + 1));
    if (high) { posL = []; posZ = pos; } else if (wide) { posL = []; posW = pos; } else posL = pos;
  }
  if ((posL.length + 1) * (posW.length + 1) * (posZ.length + 1) > 400) return { err: "Det blir över 400 bitar – placera färre snitt." };
  const strips = posL.length ? l3bqSlice(tris, n, t0, posL) : [tris], pieces = [];
  strips.forEach(st => { (posW.length ? l3bqSlice(st, v, w0, posW) : [st]).forEach(q => { (posZ.length ? l3bqSlice(q, [0, 0, 1], z0, posZ) : [q]).forEach(r => pieces.push(l3bqMesh(r))); }); });
  return { pieces: pieces.filter(m => m.faces.length), axis: n, len, lenW, lenZ, nL: posL.length + 1, nW: posW.length + 1, nZ: posZ.length + 1 };
}
function l3bqRun(p, opts) {
  const r = l3bqCut(p, opts); if (r.err) { l3Status(r.err, true); return null; }
  placeSnapshot(); const made = [], core = new Set(["id", "m", "name", "created_at", "type"]);
  r.pieces.forEach((m, i) => {
    const q = modCreate(m, [p.x, p.y, p.z], { name: `${p.name || "Objekt"} ${i + 1}/${r.pieces.length}`, color: p.color, snapshot: false });
    Object.keys(p).forEach(k => { if (!core.has(k)) q[k] = p[k]; }); made.push(q);
  });
  l3SelectIds([p.id]); l3DeleteSel(); l3SelectIds(made.map(q => q.id)); l3Changed();
  l3Status(`${p.name || "Objektet"} (${r.len.toFixed(1).replace(".", ",")} m) delat i ${made.length} bitar${r.nL > 1 && r.nW > 1 ? ` (${r.nL} längs × ${r.nW} tvärs)` : ""}. Ctrl+Z ångrar.`);
  return made;
}
const l3bqPref = { mode: "length", value: 6, dir: "l", rot: 0 };
function l3bqHtml(list) {
  if (!list || list.length !== 1 || !list[0].m || (list[0].m.k !== "mesh" && list[0].m.k !== "solid")) return "";
  return `<details class="v3-field v3-bqsplit" title="Dela objektet i bitar längs dess längdriktning – t.ex. en lång mur i gjutetapper"><summary><span>Dela i bitar…</span></summary>
    <label class="v3-field"><span>Dela efter</span><select data-bqmode><option value="length" ${l3bqPref.mode === "length" ? "selected" : ""}>Bitlängd (m)</option><option value="count" ${l3bqPref.mode === "count" ? "selected" : ""}>Antal bitar</option></select></label>
    <label class="v3-field"><span>Riktning</span><select data-bqdir><option value="l" ${l3bqPref.dir !== "w" ? "selected" : ""}>Längs objektet</option><option value="w" ${l3bqPref.dir === "w" ? "selected" : ""}>Tvärs (andra ledden)</option><option value="z" ${l3bqPref.dir === "z" ? "selected" : ""}>Höjd (vågrätt)</option></select></label>
    <label class="v3-field" title="Vrid riktningen som objektet delas i (grader) – om bitarna blir fel ledd"><span>Vrid riktning (°)</span><input type="number" data-bqrotin min="0" max="179" step="5" value="${l3bqPref.rot || 0}"></label>
    <label class="v3-field"><span>Värde</span><input type="number" data-bqval min="0.1" step="0.5" value="${l3bqPref.value}"></label>
    <button type="button" class="btn" data-bqgo>Dela</button>
    <button type="button" class="btn" data-bqplace title="Placera insättningspunkter där objektet ska delas – tryck på objektet, dra ringarna, ＋ lägger till fler">Placera snitt i 3D…</button></details>`;
}
function l3bqBind(side, list) {
  const go = side.querySelector("[data-bqgo]"); if (!go) return; const m = side.querySelector("[data-bqmode]"), v = side.querySelector("[data-bqval]"), ro = side.querySelector("[data-bqrotin]"), dr = side.querySelector("[data-bqdir]"); if (ro) ro.onchange = () => { l3bqPref.rot = Number(ro.value) || 0; }; if (dr) dr.onchange = () => { l3bqPref.dir = dr.value; };
  m.onchange = () => { l3bqPref.mode = m.value; if (m.value === "count" && l3bqPref.value < 2) { l3bqPref.value = 4; v.value = 4; } };
  v.onchange = () => { l3bqPref.value = Number(v.value) || l3bqPref.value; };
  const pl = side.querySelector("[data-bqplace]"); if (pl) pl.onclick = () => l3bqCutStart(list[0]);
  go.onclick = () => { l3bqPref.mode = m.value; if (dr) l3bqPref.dir = dr.value; if (ro) l3bqPref.rot = Number(ro.value) || 0; l3bqPref.value = Number(v.value) || 0; setTimeout(() => l3bqRun(list[0], l3bqPref), 20); };
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


/* ---- 4. Placera snitt i 3D (Victor 2026-11-11: "placera insättningspunkter där jag ska dela och plustecken om jag vill dela den i flera bitar – samma som för byggvägen") ----
   Dela i bitar → Placera snitt i 3D…: tryck på objektet där det ska delas (ett snitt = ett lodrätt plan som visas som en tonad skiva med en ring överst), dra ringarna längs objektet,
   ＋ mellan snitten lägger till ett till, ✕ tar bort, och i rutan går avstånden att skriva in (m från början). Dela-knappen delar vid exakt de snitten. Esc avbryter. */
const l3bqS = { on: false, id: null, cuts: [], cutsW: [], cutsZ: [], dir: "l", rot: 0, pick: null, pp: [], ax: null, rings: [], plus: [], grp: null, panel: null, down: null, key: null, drag: null };
/* Snitt åt två håll: "l" = längs objektet (cuts), "w" = tvärs (cutsW). Avstånd mäts från objektets ena kant åt respektive håll. */
const l3bqSet = d => (d === "z" ? l3bqS.cutsZ : d === "w" ? l3bqS.cutsW : l3bqS.cuts);
const l3bqLenOf = (a, d) => (d === "z" ? a.z1 - a.z0 : d === "w" ? a.w1 - a.w0 : a.len);
const l3bqOrigin = (a, d) => (d === "z" ? a.z0 : d === "w" ? a.w0 : a.t0);
const l3bqLocal = (a, lp, d) => (d === "z" ? lp.z : d === "w" ? lp.x * a.v[0] + lp.y * a.v[1] : lp.x * a.n[0] + lp.y * a.n[1]) - l3bqOrigin(a, d);
function l3bqAxis(p, rot) {
  const lm = modLocalMesh(p); if (!lm || !lm.pts || !lm.pts.length) return null; const P = lm.pts;
  let mx = 0, my = 0; P.forEach(q => { mx += q[0]; my += q[1]; }); mx /= P.length; my /= P.length;
  let sxx = 0, sxy = 0, syy = 0; P.forEach(q => { const a = q[0] - mx, b = q[1] - my; sxx += a * a; sxy += a * b; syy += b * b; });
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy) + (Number(rot) || 0) * Math.PI / 180, n = [Math.cos(th), Math.sin(th)];
  let t0 = Infinity, t1 = -Infinity, z0 = Infinity, z1 = -Infinity, w0 = Infinity, w1 = -Infinity; const vx = -n[1], vy = n[0];
  P.forEach(q => { const t = q[0] * n[0] + q[1] * n[1], w = q[0] * vx + q[1] * vy; t0 = Math.min(t0, t); t1 = Math.max(t1, t); w0 = Math.min(w0, w); w1 = Math.max(w1, w); z0 = Math.min(z0, q[2]); z1 = Math.max(z1, q[2]); });
  return { n, v: [vx, vy], th, th0: th - (Number(rot) || 0) * Math.PI / 180, t0, t1, len: t1 - t0, z0, z1, w0, w1, tc: mx * n[0] + my * n[1], wc: mx * vx + my * vy };
}
/* lokal punkt (t längs, w tvärs, z) → 3D-vyns koordinater via objektets grupp */
function l3bqWorld(p, a, t, w, z) {
  const g = l3.placeMeshes && l3.placeMeshes.get(p.id); if (!g) return null; g.updateWorldMatrix(true, false);
  return g.localToWorld(new THREE.Vector3(t * a.n[0] + w * a.v[0], t * a.n[1] + w * a.v[1], z));
}
function l3bqCutStart(p) {
  if (!p || !p.m) return; l3bqCutEnd(true); const a = l3bqAxis(p); if (!a || (a.len < 0.1 && a.w1 - a.w0 < 0.1)) { l3Status("Objektet är för litet för att delas.", true); return; }
  Object.assign(l3bqS, { on: true, id: p.id, cuts: [], cutsW: [], cutsZ: [], dir: "l", rot: 0, pick: null, pp: [], ax: a }); const dom = l3.renderer.domElement;
  l3bqPanel(); l3bqDraw();
  l3Status("Snitt: välj riktning (Längs / Tvärs) och tryck på objektet där det ska delas. Dra ringarna för att flytta, ＋ lägger till fler. Esc avbryter.");
  l3bqS.down = e => {
    if (e.button !== 0 || e.target !== dom) return; const q = placements.find(x => x.id === l3bqS.id), g = q && l3.placeMeshes.get(q.id); if (!g) return;
    const ray = l3MouseRay(e), hit = new THREE.Raycaster(ray.origin, ray.direction).intersectObject(g, true)[0]; e.stopPropagation(); e.preventDefault(); if (!hit) { l3Status("Tryck på själva objektet.", true); return; }
    if (l3bqS.pick) { l3bqPickAt(hit, g); return; }
    const lp = g.worldToLocal(hit.point.clone()), d = l3bqS.dir; l3bqAdd(l3bqLocal(a, lp, d), d);
  };
  l3bqS.key = e => { if (!l3bqS.on) return; if (e.key === "Escape") { e.stopPropagation(); if (l3bqS.pick) { l3bqPick(null); l3Status("Riktningsvalet avbröts."); return; } l3bqCutEnd(); l3Status("Delningen avbröts."); } else if (e.key === "Enter") { e.stopPropagation(); l3bqCutGo(); } };
  dom.addEventListener("pointerdown", l3bqS.down, true); window.addEventListener("keydown", l3bqS.key, true);
}
/* Vrider delningsriktningen (grader). Snitten räknas om från objektets kant, så de nollställs. */
function l3bqRotate(deg, absolute) {
  const p = placements.find(x => x.id === l3bqS.id); if (!p) return; let r = absolute ? Number(deg) : l3bqS.rot + Number(deg); if (!Number.isFinite(r)) return; r = ((r % 180) + 180) % 180;
  const a = l3bqAxis(p, r); if (!a) return; const had = l3bqS.cuts.length + l3bqS.cutsW.length;   // vågräta snitt (Höjd) påverkas inte av vridningen
  l3bqS.rot = Math.round(r * 10) / 10; l3bqS.ax = a; l3bqS.cuts = []; l3bqS.cutsW = []; l3bqPanel(); l3bqDraw();
  if (had) l3Status("Riktningen ändrades – snitten är nollställda, placera dem igen.");
}
/* Klicka ut riktningen: "line" = två punkter på objektet, snittet går genom linjen (lodrätt) och alla snitt blir parallella med den.
   "face" = klicka på en lodrät sida, snitten läggs parallellt med sidan. Vinkeln räknas i objektets egna koordinater. */
function l3bqAimAngle(theta) {   // theta = riktningen på snittplanets normal (radianer, objektets lokala xy)
  const p = placements.find(x => x.id === l3bqS.id); if (!p) return; const base = l3bqAxis(p, 0); if (!base) return;
  l3bqRotate(theta * 180 / Math.PI - base.th0 * 180 / Math.PI, true);
}
function l3bqAimLine(a, b) {   // a, b = lokala punkter (x, y, …) på snittlinjen; returnerar false om linjen är för kort
  const dx = b.x - a.x, dy = b.y - a.y; if (Math.hypot(dx, dy) < 0.03) return false;
  l3bqAimAngle(Math.atan2(dy, dx) + Math.PI / 2);
  const n = l3bqS.ax.n; l3bqAdd(a.x * n[0] + a.y * n[1] - l3bqS.ax.t0, "l"); return true;
}
function l3bqPick(mode) { l3bqS.pick = mode || null; l3bqS.pp = []; l3bqPanel(); l3bqDraw(); l3Status(mode === "line" ? "Snittlinje: tryck två punkter på objektet – snittet går genom dem. Esc avbryter." : mode === "face" ? "Tryck på en sida (lodrät) eller toppen/botten (plan) – snitten läggs parallellt med ytan. Esc avbryter." : ""); }
function l3bqPickAt(hit, g) {
  const lp = g.worldToLocal(hit.point.clone());
  if (l3bqS.pick === "face") {
    if (!hit.face) return; const nl = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).transformDirection(g.matrixWorld.clone().invert());
    if (Math.abs(nl.z) > 0.8) {   // plan yta (toppen/botten): vågräta snitt, parallella med ytan
      l3bqS.pick = null; l3bqS.dir = "z"; const lz = l3bqLocal(l3bqS.ax, lp, "z"); l3bqPanel(); l3bqDraw(); l3Status("Höjdsnitt – tryck på objektet, ＋ eller Jämnt för att lägga vågräta snitt (tryck t.ex. på sidan för att sätta höjden)."); void lz; return;
    }
    if (Math.hypot(nl.x, nl.y) < 0.3) { l3Status("Välj en lodrät eller plan yta av objektet.", true); return; }
    l3bqS.pick = null; l3bqAimAngle(Math.atan2(nl.y, nl.x)); l3bqPanel(); l3Status("Riktningen är satt efter sidan – lägg snitten (tryck på objektet, ＋ eller Jämnt)."); return;
  }
  l3bqS.pp.push(lp);
  if (l3bqS.pp.length === 1) { l3bqPanel(); l3bqDraw(); l3Status("Tryck den andra punkten på snittlinjen."); return; }
  const [a, b] = l3bqS.pp; l3bqS.pick = null; l3bqS.pp = [];
  if (!l3bqAimLine(a, b)) { l3Status("Punkterna ligger för nära varandra – försök igen.", true); l3bqPanel(); return; }
  l3bqPanel(); l3bqDraw(); l3Status("Snittet är lagt längs linjen. Fler snitt blir parallella med det – tryck på objektet, ＋ eller Jämnt.");
}
function l3bqAdd(t, d) {
  d = d || l3bqS.dir; const a = l3bqS.ax, L = l3bqLenOf(a, d), set = l3bqSet(d); if (L < 0.05) { l3Status("Objektet är för smalt för att delas åt det hållet.", true); return; }
  t = Math.max(0.02, Math.min(L - 0.02, t)); if (set.some(c => Math.abs(c - t) < 0.02)) return;
  set.push(Math.round(t * 100) / 100); set.sort((x, y) => x - y); l3bqPanel(); l3bqDraw();
}
function l3bqCutEnd(keepUi) {
  const dom = l3.renderer && l3.renderer.domElement; if (dom && l3bqS.down) dom.removeEventListener("pointerdown", l3bqS.down, true); if (l3bqS.key) window.removeEventListener("keydown", l3bqS.key, true);
  l3bqS.rings.forEach(e => e.remove()); l3bqS.plus.forEach(e => e.remove()); l3bqS.rings = []; l3bqS.plus = []; if (l3bqS.panel) { l3bqS.panel.remove(); l3bqS.panel = null; }
  if (l3bqS.grp) { l3.scene.remove(l3bqS.grp); l3bqS.grp.traverse(o => { if (o.geometry) o.geometry.dispose(); }); l3bqS.grp = null; }
  l3bqS.on = false; l3bqS.down = l3bqS.key = null; l3bqS.drag = null; if (!keepUi) l3Render();
}
function l3bqCutGo() {
  const p = placements.find(x => x.id === l3bqS.id); const cuts = l3bqS.cuts.slice(), cutsW = l3bqS.cutsW.slice(), cutsZ = l3bqS.cutsZ.slice(); if (!p) { l3bqCutEnd(); return; }
  if (!cuts.length && !cutsW.length && !cutsZ.length) { l3Status("Placera minst ett snitt först (tryck på objektet eller ＋).", true); return; }
  const rot = l3bqS.rot; l3bqCutEnd(true); l3bqRun(p, { cuts, cutsW, cutsZ, rot });
}
function l3bqPanel() {
  const host = document.getElementById("v3Canvas"); if (!host || !l3bqS.on) return; const p = placements.find(x => x.id === l3bqS.id), a = l3bqS.ax, E = typeof escHtml === "function" ? escHtml : s => s, f = v => (Math.round(v * 100) / 100).toString().replace(".", ",");
  let el = l3bqS.panel; if (!el) { el = document.createElement("div"); el.className = "v3-bqpanel"; el.style.cssText = "position:absolute;left:12px;top:12px;z-index:20;min-width:230px;max-width:300px;padding:10px 12px;border-radius:12px;background:#fff;box-shadow:0 8px 28px rgba(15,23,42,.28);font:12px system-ui,sans-serif;color:#0f172a"; ["pointerdown", "wheel", "click", "dblclick", "contextmenu", "keydown"].forEach(t => el.addEventListener(t, e => e.stopPropagation())); host.appendChild(el); l3bqS.panel = el; }
  const d = l3bqS.dir, L = l3bqLenOf(a, d), set = l3bqSet(d), W = a.w1 - a.w0, btn = "padding:4px 10px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer", seg = on => `${btn};${on ? "background:#2563eb;color:#fff;border-color:#2563eb;font-weight:600" : ""}`;
  const row = (dd, c, i) => `<div style="display:flex;gap:6px;align-items:center;margin:4px 0"><span style="width:64px">${dd === "z" ? "Höjd" : dd === "w" ? "Tvärs" : "Längs"} ${i + 1}</span><input type="text" data-bqc="${dd}:${i}" value="${f(c)}" style="width:70px;padding:3px 6px;border:1px solid #d7dde6;border-radius:6px"> <span>m</span><button type="button" data-bqx="${dd}:${i}" title="Ta bort snittet" style="margin-left:auto;border:0;background:none;cursor:pointer">✕</button></div>`;
  const rows = l3bqS.cuts.map((c, i) => row("l", c, i)).join("") + l3bqS.cutsW.map((c, i) => row("w", c, i)).join("") + l3bqS.cutsZ.map((c, i) => row("z", c, i)).join("");
  const nL = l3bqS.cuts.length + 1, nW = l3bqS.cutsW.length + 1, nZ = l3bqS.cutsZ.length + 1, seg1 = [0, ...set, L].map((v, i, A) => i ? v - A[i - 1] : 0).slice(1);
  el.innerHTML = `<b>Dela ${E(p ? p.name || "objektet" : "objektet")}</b><div style="color:#64748b;margin:2px 0 6px">${f(a.len)} m långt · ${f(W)} m brett · tryck på objektet för att sätta ett snitt</div>
    <div style="display:flex;gap:6px;margin:0 0 6px"><button type="button" data-bqdir="l" style="${seg(d === "l")}" title="Snitt vinkelrätt mot längdriktningen">Längs</button><button type="button" data-bqdir="w" style="${seg(d === "w")}" title="Snitt åt andra hållet – delar objektet på bredden">Tvärs</button><button type="button" data-bqdir="z" style="${seg(d === "z")}" title="Vågräta snitt – delar objektet i höjdled (t.ex. gjutetapper). Tryck på toppen med ▭ Efter sida för att välja det.">Höjd</button></div>
    <div style="display:flex;gap:6px;margin:0 0 6px"><button type="button" data-bqpick="line" style="${seg(l3bqS.pick === "line")}" title="Tryck två punkter på objektet – snittet läggs genom dem">✎ Snittlinje (2 klick)</button><button type="button" data-bqpick="face" style="${seg(l3bqS.pick === "face")}" title="Tryck på en lodrät sida – snitten läggs parallellt med den. Tryck på toppen eller botten för vågräta snitt (Höjd).">▭ Efter yta</button></div>
    <div style="display:flex;gap:4px;align-items:center;margin:0 0 6px" title="Vrid riktningen som objektet delas i – tills snittskivorna ligger åt rätt håll"><span style="color:#64748b">Vrid riktning</span><button type="button" data-bqrot="-15" style="${btn};padding:3px 7px" title="15° åt vänster">⟲</button><input type="text" data-bqrotv value="${f(l3bqS.rot)}" style="width:48px;padding:3px 6px;border:1px solid #d7dde6;border-radius:6px;text-align:right"><span>°</span><button type="button" data-bqrot="15" style="${btn};padding:3px 7px" title="15° åt höger">⟳</button><button type="button" data-bqrot="90" style="${btn};padding:3px 7px" title="Vänd 90° (längs blir tvärs)">90°</button></div>
    ${rows || '<div style="color:#94a3b8;margin:6px 0">Inga snitt än.</div>'}
    <div style="color:#475569;margin:6px 0">${nL * nW * nZ} bitar${(nL > 1) + (nW > 1) + (nZ > 1) > 1 ? ` (${[nL > 1 ? nL + " längs" : "", nW > 1 ? nW + " tvärs" : "", nZ > 1 ? nZ + " i höjd" : ""].filter(Boolean).join(" × ")})` : ""}${set.length ? ` · ${d === "z" ? "höjd" : d === "w" ? "tvärs" : "längs"}: ${seg1.map(f).join(" · ")} m` : ""}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" data-bqa style="${btn}">＋ Snitt</button><button type="button" data-bqeq style="${btn}" title="Fördela snitten jämnt (lika stora bitar) åt valt håll">Jämnt</button><span style="flex:1"></span><button type="button" data-bqno style="${btn}">Avbryt</button><button type="button" data-bqdo style="padding:4px 12px;border-radius:8px;border:0;background:#2563eb;color:#fff;cursor:pointer;font-weight:600">Dela</button></div>`;
  el.querySelectorAll("[data-bqpick]").forEach(b => { b.onclick = () => l3bqPick(l3bqS.pick === b.dataset.bqpick ? null : b.dataset.bqpick); });
  el.querySelectorAll("[data-bqrot]").forEach(b => { b.onclick = () => l3bqRotate(Number(b.dataset.bqrot)); });
  const rv = el.querySelector("[data-bqrotv]"); if (rv) rv.onchange = () => l3bqRotate(Number(String(rv.value).replace(",", ".")), true);
  el.querySelectorAll("[data-bqdir]").forEach(b => { b.onclick = () => { l3bqS.dir = b.dataset.bqdir; l3bqPanel(); l3bqDraw(); }; });
  el.querySelectorAll("[data-bqc]").forEach(i => { i.onchange = () => { const [dd, k] = i.dataset.bqc.split(":"), st = l3bqSet(dd), v = Number(String(i.value).replace(",", ".")); if (v > 0.01 && v < l3bqLenOf(a, dd) - 0.01) { st[Number(k)] = v; st.sort((x, y) => x - y); } l3bqPanel(); l3bqDraw(); }; });
  el.querySelectorAll("[data-bqx]").forEach(b => { b.onclick = () => { const [dd, k] = b.dataset.bqx.split(":"); l3bqSet(dd).splice(Number(k), 1); l3bqPanel(); l3bqDraw(); }; });
  el.querySelector("[data-bqa]").onclick = () => { const A = [0, ...set, L]; let bi = 0; for (let i = 1; i < A.length; i++) if (A[i] - A[i - 1] > A[bi + 1] - A[bi]) bi = i - 1; l3bqAdd((A[bi] + A[bi + 1]) / 2, d); };
  el.querySelector("[data-bqeq]").onclick = () => { const n = Math.max(2, set.length + 1); const v = Array.from({ length: n - 1 }, (_, i) => Math.round(L * (i + 1) / n * 100) / 100); if (d === "z") l3bqS.cutsZ = v; else if (d === "w") l3bqS.cutsW = v; else l3bqS.cuts = v; l3bqPanel(); l3bqDraw(); };
  el.querySelector("[data-bqno]").onclick = () => { l3bqCutEnd(); l3Status("Delningen avbröts."); };
  el.querySelector("[data-bqdo]").onclick = l3bqCutGo;
}
/* Skivorna i 3D + ringar och plus (ringarna följer kameran – l3bqPlace anropas varje bild). Ringarna: först alla "längs", sedan alla "tvärs". Plus gäller valt håll. */
const l3bqEach = () => [...l3bqS.cuts.map((c, i) => ({ d: "l", i, c })), ...l3bqS.cutsW.map((c, i) => ({ d: "w", i, c })), ...l3bqS.cutsZ.map((c, i) => ({ d: "z", i, c }))];
function l3bqDraw() {
  if (!l3bqS.on) return; const p = placements.find(x => x.id === l3bqS.id), a = l3bqS.ax; if (!p || !a) return;
  if (l3bqS.grp) { l3.scene.remove(l3bqS.grp); l3bqS.grp.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  const grp = new THREE.Group(); grp.name = "bqcuts"; l3.scene.add(grp); l3bqS.grp = grp;
  const pad = 0.15, mats = { z: new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }), l: new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }), w: new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }) }, cols = { l: 0xf59e0b, w: 0x06b6d4, z: 0x8b5cf6 };
  l3bqEach().forEach(({ d, c }) => {
    let P;
    if (d === "z") P = [[a.t0 - pad, a.w0 - pad], [a.t1 + pad, a.w0 - pad], [a.t1 + pad, a.w1 + pad], [a.t0 - pad, a.w1 + pad]].map(([t, w]) => l3bqWorld(p, a, t, w, a.z0 + c));
    else { const rect = d === "w" ? [[a.t0 - pad, a.w0 + c], [a.t1 + pad, a.w0 + c]] : [[a.t0 + c, a.w0 - pad], [a.t0 + c, a.w1 + pad]];   // (t,w) för skivans två kanter
      P = [[rect[0], a.z0 - pad], [rect[1], a.z0 - pad], [rect[1], a.z1 + pad], [rect[0], a.z1 + pad]].map(([tw, z]) => l3bqWorld(p, a, tw[0], tw[1], z)); }
    if (P.some(x => !x)) return;
    const g = new THREE.BufferGeometry().setFromPoints([P[0], P[1], P[2], P[0], P[2], P[3]]), m = new THREE.Mesh(g, mats[d]); m.renderOrder = 30; m.raycast = () => {}; m.userData.noHit = true; grp.add(m);
    const ln = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(P), new THREE.LineBasicMaterial({ color: cols[d], depthTest: false })); ln.renderOrder = 31; ln.raycast = () => {}; ln.userData.noHit = true; grp.add(ln);
  });
  l3bqS.pp.forEach(q => { const w = g3 => g3; const wp = l3.placeMeshes.get(p.id); if (!wp) return; wp.updateWorldMatrix(true, false); const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: 0xdc2626, depthTest: false })); m.position.copy(wp.localToWorld(q.clone())); m.renderOrder = 40; m.raycast = () => {}; m.userData.noHit = true; grp.add(m); void w; });
  const host = l3.renderer.domElement.parentElement, all = l3bqEach();
  while (l3bqS.rings.length > all.length) l3bqS.rings.pop().remove();
  while (l3bqS.rings.length < all.length) { const k = l3bqS.rings.length, b = document.createElement("button"); b.type = "button"; b.className = "v3-mhandle"; b.title = "Dra för att flytta snittet"; b.onpointerdown = e => { const it = l3bqEach()[k]; if (it) l3bqDragStart(e, it.i, it.d); }; b.onclick = e => e.stopPropagation(); host.appendChild(b); l3bqS.rings.push(b); }
  all.forEach((it, k) => { l3bqS.rings[k].style.borderColor = it.d === "w" ? "#06b6d4" : it.d === "z" ? "#8b5cf6" : ""; });
  const set = l3bqSet(l3bqS.dir), np = set.length + 1; while (l3bqS.plus.length > np) l3bqS.plus.pop().remove();
  while (l3bqS.plus.length < np) { const i = l3bqS.plus.length, b = document.createElement("button"); b.type = "button"; b.className = "v3-mplus"; b.textContent = "+"; b.title = "Lägg till ett snitt här (delar biten i två)"; b.onpointerdown = e => e.stopPropagation(); b.onclick = e => { e.stopPropagation(); const d = l3bqS.dir, S = l3bqSet(d), A = [0, ...S, l3bqLenOf(l3bqS.ax, d)]; l3bqAdd((A[i] + A[i + 1]) / 2, d); }; host.appendChild(b); l3bqS.plus.push(b); }
  l3bqPlace(); l3Render();
}
function l3bqPlace() {
  if (!l3bqS.on) return; const p = placements.find(x => x.id === l3bqS.id), a = l3bqS.ax; if (!p || !a) return; const zTop = a.z1 + 0.35, wc = (a.w0 + a.w1) / 2, tc = (a.t0 + a.t1) / 2;
  const put = (el, d, c) => { const w = d === "z" ? l3bqWorld(p, a, a.t1 + 0.25, wc, a.z0 + c) : d === "w" ? l3bqWorld(p, a, tc, a.w0 + c, zTop) : l3bqWorld(p, a, a.t0 + c, wc, zTop); if (!w) { el.style.display = "none"; return; } const q = l3ToScreen(w); el.style.display = q.behind ? "none" : "block"; el.style.left = q.x + "px"; el.style.top = q.y + "px"; };
  l3bqEach().forEach((it, k) => { if (l3bqS.rings[k]) put(l3bqS.rings[k], it.d, it.c); });
  const d = l3bqS.dir, A = [0, ...l3bqSet(d), l3bqLenOf(a, d)]; l3bqS.plus.forEach((el, i) => { if (l3bqS.drag) el.style.display = "none"; else put(el, d, (A[i] + A[i + 1]) / 2); });
}
function l3bqDragStart(e, i, d) {
  d = d || "l"; if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); const p = placements.find(x => x.id === l3bqS.id), a = l3bqS.ax, g = p && l3.placeMeshes.get(p.id); if (!g) return;
  l3bqS.drag = { i, d }; const zTop = a.z1 + 0.35, set = l3bqSet(d), L = l3bqLenOf(a, d);
  const mv = ev => {
    if (d === "z") {   // lodrät dragning: närmaste punkt mellan musstrålen och den lodräta linjen genom ringen
      const ray = l3MouseRay(ev), P0 = l3bqWorld(p, a, a.t1 + 0.25, (a.w0 + a.w1) / 2, 0), P1 = l3bqWorld(p, a, a.t1 + 0.25, (a.w0 + a.w1) / 2, 1); if (!P0 || !P1) return;
      const u = P1.clone().sub(P0), w = ray.origin.clone().sub(P0), b = ray.direction.dot(u), c2 = ray.direction.dot(w), e2 = u.dot(w), den = u.dot(u) - b * b; if (Math.abs(den) < 1e-6) return;
      const zl = (e2 - b * c2) / den, t = zl - a.z0, lo = (i ? set[i - 1] : 0) + 0.02, hi = (i < set.length - 1 ? set[i + 1] : L) - 0.02; set[i] = Math.round(Math.max(lo, Math.min(hi, t)) * 100) / 100; l3bqDraw(); return;
    }
    const ray = l3MouseRay(ev), up = g.localToWorld(new THREE.Vector3(0, 0, zTop)), pl = new THREE.Plane(new THREE.Vector3(0, 0, 1), -up.z), hit = new THREE.Vector3(); if (!ray.intersectPlane(pl, hit)) return;
    const lp = g.worldToLocal(hit.clone()), t = l3bqLocal(a, lp, d), lo = (i ? set[i - 1] : 0) + 0.02, hi = (i < set.length - 1 ? set[i + 1] : L) - 0.02;
    set[i] = Math.round(Math.max(lo, Math.min(hi, t)) * 100) / 100; l3bqDraw();
  };
  const end = () => { window.removeEventListener("pointermove", mv, true); window.removeEventListener("pointerup", end, true); l3bqS.drag = null; l3bqPanel(); l3bqDraw(); };
  window.addEventListener("pointermove", mv, true); window.addEventListener("pointerup", end, true);
}
