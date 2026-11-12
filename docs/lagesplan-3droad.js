/* 3D-vyn – Byggväg (Victor 2026-11-10: "ett verktyg i 3D-editorn som skapar en väg utefter punktmoln och modeller så att jag snabbt kan simulera byggvägar … och också få med slänter").

   Så här fungerar det:
   1. Mät → Byggväg: tryck ut vägens mittlinje på marken (punktmoln, modell eller DXF – punkterna fäster som övriga mått). Enter eller sista punkten igen avslutar.
   2. Panelen: välj vilka ytor vägen ska följa (flera går att kombinera – den högsta ytan gäller), vägbredd, högsta lutning, mjukhet och släntlutningar.
      Vägens höjd följer marken men jämnas ut och begränsas så att lutningen aldrig blir högre än inställt. Alternativt rak lutning från start till slut.
   3. Slänter: från vägkanten dras en släntyta (schakt där marken är högre, fyllning där den är lägre) ut till den möter marken. Blått = schaktslänt, rött = fyllningsslänt.
   4. Resultat: längd, höjdskillnad, medel- och största lutning, trånga kurvor (under minsta radie), schakt- och fyllningsvolym (inkl. slänterna) och släntytor.
      Vägen färgas efter lutning (grön → gul → röd).
   5. Skapa objekt: väg, schaktslänt och fyllningsslänt blir vanliga ritade ytor som kan flyttas, ändras, ångras och exporteras till IFC och DXF.

   Räknesättet: en höjdkarta (rutnät) per yta som i Volym mot yta (lagesplan-3dpcdiff.js). Volymen är summan av tvärsnittsareorna (marken mot vägen och slänterna) × stationsavståndet. */

const l3road = { cur: null, seq: 0, timer: 0, kbd: null };
const L3R_DEF = { width: 5, grade: 10, smooth: 20, step: 2, cutR: 1, fillR: 1.5, reach: 25, minR: 15, filletR: 30, mode: "anchor", anchor: -1, cap: true, crown: 0, speed: 20, fall: 2.5, fallMode: "crown", edgeK: 1.5, ditch: true, inK: 3, ditchBw: 0.5, ditchD: 0.3, bodies: true };
const l3rFmt = (v, d = 1) => (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toString().replace(".", ",");
const l3rOk = z => z === z && z !== null && Math.abs(z) < 1e9;
const l3rM3 = v => Math.round(v).toLocaleString("sv-SE").replace(/[  ]/g, " ") + " m³";
/* Lokal breddning (Victor 2026-11-10: "lokal breddning för ett stort fundament"): zoner { s0, s1, add, side, taper } längs vägen – vägen blir "add" m bredare mellan s0 och s1
   (på båda sidor eller bara vänster/höger) och avtonas mjukt över "taper" m före och efter. Returnerar halva bredden åt vänster (l) och höger (r) vid sträckan s. */
function l3rHW(spec, s, pts) {
  const W = Math.max(1, Number(spec.width) || 5); let l = W / 2, r = W / 2;
  (spec.widen || []).forEach(z => {
    if (z.kind === "obj") return;
    const a = Number(z.add) || 0, s0 = Number(z.s0), s1 = Number(z.s1), tp = Math.max(0.5, Number(z.taper) || 0); if (!a || !(s1 >= s0)) return;
    let f = s >= s0 && s <= s1 ? 1 : s < s0 ? Math.max(0, 1 - (s0 - s) / tp) : Math.max(0, 1 - (s - s1) / tp); f = f * f * (3 - 2 * f);   // mjuk avtoning
    if (z.side !== "R") l += a * f; if (z.side !== "L") r += a * f;
  });
  // Avancerat: breddning runt ett objekt – vägkanten följer objektets kontur + offset (rundad), på den sida objektet ligger.
  if (pts && pts.length > 1) (spec.widen || []).forEach(z => {
    if (z.kind !== "obj") return; const smp = l3rObjSamples(z, pts), off = Math.max(0, Number(z.offset) || 0);
    for (const q of smp) { const ds = s - q[0]; if (Math.abs(ds) > off) continue; const w = Math.abs(q[1]) + Math.sqrt(Math.max(0, off * off - ds * ds)); if (q[1] > 0) l = Math.max(l, w); else r = Math.max(r, w); }
  });
  return { l, r };
}
/* Närmaste punkt på linjen: { s: sträcka längs linjen, lat: avstånd åt vänster (negativt = höger) }. */
function l3rProj(P, x, y) {
  let best = null, acc = 0;
  for (let i = 1; i < P.length; i++) {
    const ax = P[i - 1][0], ay = P[i - 1][1], dx = P[i][0] - ax, dy = P[i][1] - ay, L = Math.hypot(dx, dy); if (L < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (L * L))), px = ax + dx * t, py = ay + dy * t, d = Math.hypot(x - px, y - py);
    if (!best || d < best.d) best = { d, s: acc + t * L, lat: ((x - px) * -dy + (y - py) * dx) / L }; acc += L;
  }
  return best || { d: 0, s: 0, lat: 0 };
}
/* Objektets kontur som punkter (var 0,5 m) → [[sträcka, sida]]; sparas på zonen tills konturen eller linjen ändras. */
function l3rObjSamples(z, pts) {
  const sig = JSON.stringify(z.pts) + "|" + JSON.stringify(pts.map(p => [p[0], p[1]])); if (z._c && z._c.sig === sig) return z._c.v;
  const out = [], P = z.pts || [];
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.5)); for (let k = 0; k < n; k++) { const q = l3rProj(pts, a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n); if (Math.abs(q.lat) <= 40) out.push([q.s, q.lat]); } }
  z._c = { sig, v: out }; return out;
}
/* Vägöverbyggnad (lager): spec.layersOn + spec.layers [{ name, t (m), color }] uppifrån och ner; summan är överbyggnadens tjocklek och terrassytan ligger så långt under vägens
   färdiga yta. Schakt och fyllning räknas då till terrassytan (spec.layersEarth !== false) och lagren har egna mängder, ytor och objekt. */
const L3R_PRESETS = {
  bygg: ["Byggväg (makadam)", [{ name: "Bärlager makadam 0–32", t: 0.15, color: "#cbd5e1" }, { name: "Förstärkningslager krossberg 0–90", t: 0.35, color: "#a8a29e" }, { name: "Skyddslager", t: 0.2, color: "#a16207" }], 4],
  gata: ["Gata, huvudgata (typiskt kommunalt)", [{ name: "Slitlager asfalt", t: 0.04, color: "#1f2937" }, { name: "Bindlager asfalt", t: 0.05, color: "#374151" }, { name: "Bärlager obundet 0–32", t: 0.08, color: "#cbd5e1" }, { name: "Förstärkningslager krossat berg 0–90", t: 0.42, color: "#a8a29e" }], 2.5],
  grus: ["Grusväg / skogsbilväg (typiskt)", [{ name: "Slitlager grus 0–16", t: 0.05, color: "#d6c9a8" }, { name: "Bärlager 0–32", t: 0.15, color: "#cbd5e1" }, { name: "Förstärkningslager 0–90", t: 0.3, color: "#a8a29e" }], 4],
  allman: ["Allmän väg (asfalt)", [{ name: "Slitlager asfalt", t: 0.04, color: "#1f2937" }, { name: "Bindlager asfalt", t: 0.05, color: "#374151" }, { name: "Bärlager obundet", t: 0.08, color: "#cbd5e1" }, { name: "Förstärkningslager", t: 0.4, color: "#a8a29e" }, { name: "Skyddslager", t: 0.3, color: "#a16207" }], 2.5],
};
function l3rApplyPreset(spec, key) { const P = L3R_PRESETS[key]; if (!P) return; spec.layers = JSON.parse(JSON.stringify(P[1])); spec.layersOn = true; if (P[2] != null) spec.fall = P[2]; spec.preset = key; }
const l3rLayerD = spec => spec.layersOn ? (spec.layers || []).reduce((a, l) => a + (Number(l.t) || 0), 0) : 0;
/* Tvärsektionens form (Victor 2026-11-11: "tvärsektionerna ska se ut som en riktig vägsektion i Sverige"):
   – Vägytan har tvärfall (spec.fall %, 2,5 % på asfalt – 3–4 % på grus): takprofil (högst i mitten), ensidigt åt vänster/höger eller plant (spec.fallMode).
   – Överbyggnadens lager ligger parallellt med vägytan, och deras kanter lutar utåt nedåt (spec.edgeK = 1 lodrätt : k vågrätt, 1,5 är vanligt) – därför är nedersta lagret och terrassytan bredare än vägbanan.
   – Terrassytan är underkanten av överbyggnaden. I schakt går INNERSLÄNTEN (1:inK, 1:3) från terrasskanten ner i diket (djup ditchD under terrassytan, botten ditchBw bred) och YTTERSLÄNTEN (1:cutR) upp till marken.
     I fyllning går fyllningsslänten (1:fillR) från terrasskanten ned till marken. */
function l3rFall(spec, t) {   // hur långt vägytan ligger under mittlinjens höjd vid sidoavståndet t (+ = vänster)
  const q = Math.max(0, Number(spec.fall) || 0) / 100, m = spec.fallMode || "crown"; if (!q || m === "flat") return 0;
  return m === "L" ? q * t : m === "R" ? -q * t : q * Math.abs(t);
}
const l3rK = spec => Math.max(0, spec.edgeK != null && spec.edgeK !== "" ? Number(spec.edgeK) || 0 : 1.5);
function l3rProfZ(prof, d) { for (let i = 1; i < prof.length; i++) { const a = prof[i - 1], b = prof[i]; if (d <= b[0] + 1e-9) { const w = b[0] - a[0]; return w > 1e-9 ? a[1] + (b[1] - a[1]) * (d - a[0]) / w : b[1]; } } return prof[prof.length - 1][1]; }
/* Konstruktionsnivån (terrassytan under vägen, släntens profil utanför) vid sidoavståndet tabs (≥ 0) på sidan sg (+1 vänster, −1 höger). */
function l3rDesignZ(p, spec, sg, S, tabs) {
  const hw = sg > 0 ? p.wl : p.wr, tE = hw + p.dE * l3rK(spec); if (tabs <= tE) return p.z - l3rFall(spec, sg * tabs) - p.dE;
  const d = tabs - tE; if (!S || S.kind === "none" || d > (S.d || 0) + 1e-6) return null; return l3rProfZ(S.prof || [[0, S.ze], [S.d, S.qz]], d);
}
const l3rTick = () => new Promise(r => setTimeout(r, 16));

/* Ytor att följa: de som finns i vyn (punktmoln, modeller, DXF) – samma lista som Volym mot yta. */
function l3rSources() { return typeof l3dfSources === "function" ? l3dfSources() : []; }
function l3rDefaultSrc() {
  const all = l3rSources(), pc = all.filter(s => /^pc:/.test(s.k) && (l3pc.clouds.find(c => "pc:" + c.id === s.k) || {}).visible);
  if (pc.length) return [pc[0].k];
  const md = all.filter(s => /^md:/.test(s.k) && (typeof l3b !== "undefined" ? l3b.models : []).some(m => "md:" + m.id === s.k && m.visible));
  return md.length ? [md[0].k] : all.length ? [all[0].k] : [];
}

/* ---- Beräkning ---- */
/* Mittlinjen delas upp med stationsavståndet; returnerar [{x, y, s}] (s = sträcka från start i plan). */
/* Rundar hörnen i planen med riktiga cirkelbågar (Victor 2026-11-10: "snygga radier, inte massa trianglar"). R = önskad kurvradie (m);
   den begränsas så att bågarna inte tar mer än halva sträckan till nästa punkt. Returnerar tätt punktlista [x,y,z] och s-läget för varje klickad punkt. */
function l3rFillet(P, R) {
  const n = P.length, out = [P[0].slice()], vs = [0]; R = Number(R) || 0;
  const len = i => Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]), acc = (to = out.length - 1) => { let a = 0; for (let i = 1; i <= to; i++) a += Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]); return a; };
  for (let i = 1; i < n - 1; i++) {
    const ux = P[i - 1][0] - P[i][0], uy = P[i - 1][1] - P[i][1], vx = P[i + 1][0] - P[i][0], vy = P[i + 1][1] - P[i][1], lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
    if (R <= 0 || lu < 1e-6 || lv < 1e-6) { out.push(P[i].slice()); vs.push(acc()); continue; }
    const cu = [ux / lu, uy / lu], cv = [vx / lv, vy / lv], th = Math.acos(Math.max(-1, Math.min(1, cu[0] * cv[0] + cu[1] * cv[1]))), phi = Math.PI - th;
    if (phi < 0.01 || th < 0.02) { out.push(P[i].slice()); vs.push(acc()); continue; }
    const capU = (i - 1 === 0 ? 0.98 : 0.5) * lu, capV = (i + 1 === n - 1 ? 0.98 : 0.5) * lv;
    let t = R * Math.tan(phi / 2); t = Math.min(t, capU, capV); const Re = t / Math.tan(phi / 2);
    const A = [P[i][0] + cu[0] * t, P[i][1] + cu[1] * t, P[i][2] + (P[i - 1][2] - P[i][2]) * t / lu], B = [P[i][0] + cv[0] * t, P[i][1] + cv[1] * t, P[i][2] + (P[i + 1][2] - P[i][2]) * t / lv];
    let bx = cu[0] + cv[0], by = cu[1] + cv[1]; const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl; const d = Re / Math.sin(th / 2), C = [P[i][0] + bx * d, P[i][1] + by * d];
    let a0 = Math.atan2(A[1] - C[1], A[0] - C[0]), a1 = Math.atan2(B[1] - C[1], B[0] - C[0]), da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const m = Math.max(6, Math.ceil(Math.abs(da) * Re / 0.75)); const iA = out.length; out.push(A);
    for (let k = 1; k < m; k++) { const f = k / m, a = a0 + da * f; out.push([C[0] + Re * Math.cos(a), C[1] + Re * Math.sin(a), A[2] + (B[2] - A[2]) * f]); }
    out.push(B); vs.push(acc(iA) + Math.abs(da) * Re / 2);
  }
  out.push(P[n - 1].slice()); vs.push(acc());
  return { pts: out, vs };
}
function l3rStations(P, step, R) {
  const F = l3rFillet(P, R), Q = F.pts, seg = [0]; for (let i = 1; i < Q.length; i++) seg.push(seg[i - 1] + Math.hypot(Q[i][0] - Q[i - 1][0], Q[i][1] - Q[i - 1][1]));
  const L = seg[seg.length - 1]; if (L < 0.5) return [];
  const n = Math.max(2, Math.round(L / step)), out = []; let k = 0;
  for (let i = 0; i <= n; i++) {
    const s = L * i / n; while (k < seg.length - 2 && seg[k + 1] < s) k++;
    const t = seg[k + 1] > seg[k] ? (s - seg[k]) / (seg[k + 1] - seg[k]) : 0;
    out.push({ x: Q[k][0] + (Q[k + 1][0] - Q[k][0]) * t, y: Q[k][1] + (Q[k + 1][1] - Q[k][1]) * t, s, z0: Q[k][2] + (Q[k + 1][2] - Q[k][2]) * t });
  }
  out.seg = F.vs; return out;
}
/* Jämnar ut höjderna (glidande medel över "smooth" meter) och begränsar sedan lutningen framåt och bakåt. */
function l3rProfile(st, spec) {
  const n = st.length, g = Math.max(0.5, Number(spec.grade) || 10) / 100, ds = i => st[i].s - st[i - 1].s;
  let z = st.map(p => p.g);
  if (spec.mode === "pins" && st.seg && st.pts) {   // genom punkterna jag klickat ut: rak lutning mellan dem (högsta punkten blir vägens högsta)
    const sg = st.seg, pz = st.pts.map(p => p[2]);
    z = st.map(p => { let k = 0; while (k < sg.length - 2 && sg[k + 1] < p.s) k++; const t = sg[k + 1] > sg[k] ? Math.max(0, Math.min(1, (p.s - sg[k]) / (sg[k + 1] - sg[k]))) : 0; return pz[k] + (pz[k + 1] - pz[k]) * t; });
    return z;
  }
  if (spec.mode === "straight") { const a = z[0], b = z[n - 1], L = st[n - 1].s || 1; z = st.map(p => a + (b - a) * p.s / L); }
  else {
    const half = Math.max(0, Number(spec.smooth) || 0) / 2, sm = z.slice();
    if (half > 0) for (let i = 0; i < n; i++) { let a = 0, c = 0; for (let j = 0; j < n; j++) if (Math.abs(st[j].s - st[i].s) <= half) { const w = 1 - Math.abs(st[j].s - st[i].s) / (half + 1e-9) * 0.5; a += z[j] * w; c += w; } sm[i] = a / c; }
    z = sm;
  }
  if (spec.mode === "anchor" && st.seg && st.pts) {   // höjdpunkt (Victor 2026-11-10): en punkt på vägen har given höjd, resten räknas därifrån med högsta lutning
    const pz = st.pts.map(p => p[2]); let ai = Number(spec.anchor); if (!(ai >= 0 && ai < pz.length)) ai = pz.indexOf(Math.max(...pz));
    const zA = pz[ai], sA = st.seg[ai]; let a = 0; for (let i = 1; i < n; i++) if (Math.abs(st[i].s - sA) < Math.abs(st[a].s - sA)) a = i;
    const o = z.slice(); o[a] = zA;
    for (let i = a + 1; i < n; i++) o[i] = Math.max(o[i - 1] - g * ds(i), Math.min(o[i - 1] + g * ds(i), z[i]));
    for (let i = a - 1; i >= 0; i--) o[i] = Math.max(o[i + 1] - g * ds(i + 1), Math.min(o[i + 1] + g * ds(i + 1), z[i]));
    if (spec.cap !== false) for (let i = 0; i < n; i++) o[i] = Math.min(o[i], zA);
    return o;
  }
  const lim = spec.mode === "straight" ? z : (() => { const o = z.slice(); for (let it = 0; it < 3; it++) { for (let i = 1; i < n; i++) o[i] = Math.max(o[i - 1] - g * ds(i), Math.min(o[i - 1] + g * ds(i), o[i])); for (let i = n - 2; i >= 0; i--) o[i] = Math.max(o[i + 1] - g * ds(i + 1), Math.min(o[i + 1] + g * ds(i + 1), o[i])); } return o; })();
  return lim;
}
async function l3rCompute(cur, alive) {
  const spec = cur.spec, srcs = (spec.src || []).filter(k => l3rSources().some(s => s.k === k));
  const W = Math.max(1, Number(spec.width) || 5), reach = Math.max(2, Number(spec.reach) || 25), step = Math.max(0.5, Number(spec.step) || 2);
  const st = l3rStations(cur.pts, step, spec.filletR); if (st.length < 2) return { err: "Vägen är för kort." }; st.pts = cur.pts;
  if (!srcs.length) return { err: "Tänd ett punktmoln, en 3D-modell eller en DXF och välj den under \"Följer\"." };
  const maxAdd = Math.max(0, ...(spec.widen || []).map(z => z.kind === "obj" ? Math.max(0, ...l3rObjSamples(z, cur.pts).map(q => Math.abs(q[1]))) + (Number(z.offset) || 0) - W / 2 : Number(z.add) || 0)), m = W / 2 + maxAdd + reach + 3, xs = st.map(p => p.x), ys = st.map(p => p.y);
  const bd = { x0: Math.min(...xs) - m, x1: Math.max(...xs) + m, y0: Math.min(...ys) - m, y1: Math.max(...ys) + m };
  const area = (bd.x1 - bd.x0) * (bd.y1 - bd.y0), cell = Math.max(0.25, Math.sqrt(area / 160000)), grids = [];
  for (const k of srcs) {
    const g = l3dfGrid(bd, cell), ok = l3dfBuild(k, g); await l3rTick(); if (!alive()) return null;
    if (ok) { if (typeof l3dfFill === "function") l3dfFill(g, 6); grids.push(g); }   // glesa punktmoln: fyll hål i marken så att slänten har något att möta
  }
  if (!grids.length) return { err: "Kunde inte läsa ytorna – är punktmolnet eller modellen tänd och inläst?" };
  const gz = (x, y) => { let best = null; for (const g of grids) { const z = l3volGridZ(g, x, y); if (z !== null && l3rOk(z) && (best === null || z > best)) best = z; } return best; };
  // Markhöjd längs mittlinjen (saknas den används klickpunkternas höjd).
  let miss = 0; st.forEach(p => { const z = gz(p.x, p.y); if (z === null) { p.g = null; miss++; } else p.g = z; });
  if (miss === st.length) st.forEach(p => { p.g = p.z0; });
  else for (let i = 0; i < st.length; i++) if (st[i].g === null) { let a = i - 1, b = i + 1; while (a >= 0 && st[a].g === null) a--; while (b < st.length && st[b].g === null) b++; st[i].g = a >= 0 && b < st.length ? st[a].g + (st[b].g - st[a].g) * (st[i].s - st[a].s) / (st[b].s - st[a].s) : a >= 0 ? st[a].g : st[b].g; }
  const zd = l3rProfile(st, spec), n = st.length;
  // Riktning och normal per station.
  st.forEach((p, i) => { const a = st[Math.max(0, i - 1)], b = st[Math.min(n - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1; p.tx = dx / L; p.ty = dy / L; p.nx = -p.ty; p.ny = p.tx; p.z = zd[i]; const h = l3rHW(spec, p.s, cur.pts); p.wl = h.l; p.wr = h.r; p.dE = spec.layersEarth !== false ? l3rLayerD(spec) : 0; });
  // Släntkant: marsch utåt från terrasskanten tills släntytan (innerslänt, dike, ytterslänt) möter marken.
  const kE = l3rK(spec), ditchOn = spec.ditch !== false, inK = Math.max(0.5, Number(spec.inK) || 3), dD = ditchOn ? Math.max(0.05, Number(spec.ditchD != null ? spec.ditchD : 0.3)) : 0, dBw = ditchOn ? Math.max(0, Number(spec.ditchBw != null ? spec.ditchBw : 0.5)) : 0;
  const slope = (p, sg) => {
    const hw = sg > 0 ? p.wl : p.wr, tE = hw + p.dE * kE, ex = p.x + sg * p.nx * tE, ey = p.y + sg * p.ny * tE, ze = p.z - l3rFall(spec, sg * tE) - p.dE, g0 = gz(ex, ey) ?? p.g;   // saknas marken vid kanten används mittlinjens markhöjd
    const kind = g0 > ze + 0.01 ? "cut" : "fill", kc = 1 / Math.max(0.2, spec.cutR), kf = 1 / Math.max(0.2, spec.fillR), dd = 0.25;
    const d1 = kind === "cut" ? dD * inK : 0, d2 = d1 + (kind === "cut" ? dBw : 0), zb = ze - (kind === "cut" ? dD : 0);
    const zs = d => kind === "fill" ? ze - d * kf : d <= d1 ? ze - (d1 > 0 ? d * dD / d1 : 0) : d <= d2 ? zb : zb + (d - d2) * kc;
    const mk = (dh, hit) => { const prof = kind === "cut" ? [[0, ze], [Math.min(d1, dh), zs(Math.min(d1, dh))], [Math.min(d2, dh), zs(Math.min(d2, dh))], [dh, zs(dh)]] : [0, 1 / 3, 2 / 3, 1].map(f => [dh * f, f === 0 ? ze : zs(dh * f)]) /* alltid fyra punkter så att grannstationer med olika slag (schakt/fyllning) hänger ihop utan glapp */ ; return { ex, ey, ze, kind, d: dh, qx: ex + sg * p.nx * dh, qy: ey + sg * p.ny * dh, qz: zs(dh), hit, prof, d1, d2, zb }; };
    if (Math.abs(g0 - ze) <= 0.01) return { ...mk(0, true), kind: "fill" };
    let prevD = 0, prevDiff = g0 - ze, lastG = g0;   // diff = mark − släntyta (cut: >0 till dess släntytan nått marken)
    for (let d = dd; d <= reach; d += dd) {
      const qx = ex + sg * p.nx * d, qy = ey + sg * p.ny * d, zsd = zs(d), gRaw = gz(qx, qy), g = gRaw === null ? lastG : gRaw; if (gRaw !== null) lastG = gRaw;   // hål i ytan: fortsätt mot senast kända markhöjd
      const diff = g - zsd;
      if (kind === "cut" ? diff <= 0 : diff >= 0) { const t = prevDiff / (prevDiff - diff || 1), dh = prevD + (d - prevD) * Math.max(0, Math.min(1, t)); return mk(dh, true); }
      prevD = d; prevDiff = diff;
    }
    return mk(reach, false);
  };
  st.forEach(p => { p.L = slope(p, 1); p.R = slope(p, -1); });
  await l3rTick(); if (!alive()) return null;
  // Tvärsnittsareor → volymer (medelareametoden) mot konstruktionsytan (terrassyta + innerslänt + dike + ytterslänt).
  const dt = 0.5, area2 = p => { let cut = 0, fill = 0;
    for (const sg of [1, -1]) {
      const S = sg > 0 ? p.L : p.R, hw = sg > 0 ? p.wl : p.wr, tot = hw + p.dE * kE + (S.d || 0);
      for (let t = dt / 2; t < tot; t += dt) {
        const x = p.x + sg * p.nx * t, y = p.y + sg * p.ny * t, g = gz(x, y); if (g === null) continue;
        const des = l3rDesignZ(p, spec, sg, S, t); if (des === null) continue; const dz = g - des;
        if (dz > 0) cut += dz * dt; else fill += -dz * dt;
      }
    } return { cut, fill }; };
  st.forEach(p => { Object.assign(p, area2(p)); });
  let cutV = 0, fillV = 0, len3 = 0, maxG = 0, sumG = 0, nG = 0, slopeCut = 0, slopeFill = 0, maxCutDepth = 0, maxFillDepth = 0, unreached = 0;
  const segs = [];
  for (let i = 1; i < n; i++) {
    const ds = st[i].s - st[i - 1].s, dz = st[i].z - st[i - 1].z, g = Math.abs(dz) / (ds || 1);
    cutV += (st[i].cut + st[i - 1].cut) / 2 * ds; fillV += (st[i].fill + st[i - 1].fill) / 2 * ds; len3 += Math.hypot(ds, dz); maxG = Math.max(maxG, g); sumG += g; nG++; segs.push(g);
    const pl = S => (S.prof || []).reduce((q, v, k, A) => (k ? q + Math.hypot(v[0] - A[k - 1][0], v[1] - A[k - 1][1]) : 0), 0); ["L", "R"].forEach(sd => { const a = st[i - 1][sd], b = st[i][sd], w = (pl(a) + pl(b)) / 2; if (a.kind === "cut") slopeCut += w * ds; else if (a.kind === "fill") slopeFill += w * ds; });
  }
  st.forEach(p => { const dz = p.g - p.z; if (dz > 0) maxCutDepth = Math.max(maxCutDepth, dz); else maxFillDepth = Math.max(maxFillDepth, -dz); if (!p.L.hit || !p.R.hit) unreached++; });
  // Kurvradie (tre punkter i följd).
  const tight = [];
  for (let i = 1; i < n - 1; i++) { const a = st[i - 1], b = st[i], c = st[i + 1], ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y), ca = Math.hypot(a.x - c.x, a.y - c.y), ar = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2; const R = ar > 1e-6 ? ab * bc * ca / (4 * ar) : Infinity; b.rad = R; if (R < (Number(spec.minR) || 15)) tight.push({ i, R, x: b.x, y: b.y, z: b.z }); }
  const L2 = st[n - 1].s;
  const layers = spec.layersOn ? (() => { let h0 = 0; return (spec.layers || []).map(l => { const t = Number(l.t) || 0, h1 = h0 + t, kk = l3rK(spec); let vol = 0, area = 0; for (let i = 1; i < n; i++) { const ds = st[i].s - st[i - 1].s, w = (st[i].wl + st[i].wr + st[i - 1].wl + st[i - 1].wr) / 2; area += (w + 2 * kk * h0) * ds; vol += (w + kk * (h0 + h1)) * ds * t; } const o = { name: l.name, t, h0, vol, area, color: l.color }; h0 = h1; return o; }); })() : [];
  const res = { layers, D: l3rLayerD(spec), len: L2, len3, dz: st[n - 1].z - st[0].z, z0: st[0].z, z1: st[n - 1].z, maxG, avgG: nG ? sumG / nG : 0, cut: cutV, fill: fillV, net: cutV - fillV, slopeCut, slopeFill, roadArea: st.reduce((a, p, i) => i ? a + (p.wl + p.wr + st[i - 1].wl + st[i - 1].wr) / 2 * (p.s - st[i - 1].s) : 0, 0), tight, maxCutDepth, maxFillDepth, unreached, cell, stations: n, miss };
  return { res, st, W, ctx: { gz, slope } };
}

/* ---- Geometri (relativt origo org) ---- */
function l3rBuild(c) {
  const st = c.st, spec = c.spec, org = [st[0].x, st[0].y, st[0].z], n = st.length;
  const g = Math.max(0.5, Number(spec.grade) || 10) / 100, col = gr => { const t = gr / g; return t < 0.5 ? [0.13, 0.77, 0.37] : t < 0.8 ? [0.96, 0.62, 0.04] : [0.94, 0.27, 0.27]; };
  const road = { pos: [], col: [], idx: [] }, cut = { pos: [], idx: [] }, fill = { pos: [], idx: [] };
  const E = (p, sg, t, z) => [p.x + sg * p.nx * t - org[0], p.y + sg * p.ny * t - org[1], z - org[2]];
  for (let i = 0; i < n; i++) {   // vägytan: vänster kant, mitt, höger kant (tvärfallet syns som en knäckt yta)
    const p = st[i], gr = i === 0 ? Math.abs(st[1].z - st[0].z) / (st[1].s - st[0].s || 1) : Math.abs(p.z - st[i - 1].z) / (p.s - st[i - 1].s || 1), cc = col(gr);
    road.pos.push(...E(p, 1, p.wl, p.z - l3rFall(spec, p.wl)), ...E(p, 1, 0, p.z), ...E(p, -1, p.wr, p.z - l3rFall(spec, -p.wr))); road.col.push(...cc, ...cc, ...cc);
    if (i) { const a = (i - 1) * 3, b = i * 3; road.idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2); }
  }
  [["L", 1], ["R", -1]].forEach(([sd, sg]) => {   // slänterna: innerslänt, dikesbotten och ytterslänt (eller fyllningsslänt) som band längs profilens delar
    for (let i = 1; i < n; i++) {
      const a = st[i - 1][sd], b = st[i][sd]; if (a.kind === "none" || b.kind === "none" || (a.d < 0.01 && b.d < 0.01)) continue;
      const T = (a.d >= 0.01 ? a.kind : b.kind) === "cut" ? cut : fill, pa = a.prof, pb = b.prof, m = Math.min(pa.length, pb.length);
      for (let k = 0; k + 1 < m; k++) {
        if (Math.abs(pa[k + 1][0] - pa[k][0]) < 1e-4 && Math.abs(pb[k + 1][0] - pb[k][0]) < 1e-4 && Math.abs(pa[k + 1][1] - pa[k][1]) < 1e-4) continue;
        const A0 = [a.ex + sg * st[i - 1].nx * pa[k][0] - org[0], a.ey + sg * st[i - 1].ny * pa[k][0] - org[1], pa[k][1] - org[2]], A1 = [a.ex + sg * st[i - 1].nx * pa[k + 1][0] - org[0], a.ey + sg * st[i - 1].ny * pa[k + 1][0] - org[1], pa[k + 1][1] - org[2]];
        const B0 = [b.ex + sg * st[i].nx * pb[k][0] - org[0], b.ey + sg * st[i].ny * pb[k][0] - org[1], pb[k][1] - org[2]], B1 = [b.ex + sg * st[i].nx * pb[k + 1][0] - org[0], b.ey + sg * st[i].ny * pb[k + 1][0] - org[1], pb[k + 1][1] - org[2]];
        const base = T.pos.length / 3; T.pos.push(...A0, ...A1, ...B0, ...B1);
        if (sg > 0) T.idx.push(base, base + 1, base + 3, base, base + 3, base + 2); else T.idx.push(base, base + 3, base + 1, base, base + 2, base + 3);
      }
    }
  });
  return { wall: null, org, road: { pos: new Float32Array(road.pos), col: new Float32Array(road.col), idx: new Uint32Array(road.idx) }, cut: cut.idx.length ? { pos: new Float32Array(cut.pos), idx: new Uint32Array(cut.idx) } : null, fill: fill.idx.length ? { pos: new Float32Array(fill.pos), idx: new Uint32Array(fill.idx) } : null };
}
function l3rDraw() {
  if (!l3.groups.road) { l3.groups.road = new THREE.Group(); l3.groups.road.name = "road"; l3.scene.add(l3.groups.road); }
  const grp = l3.groups.road; l3Clear(grp);
  const c = l3road.cur; if (!c) { l3Render(); return; }
  const O = l3.O, mk = (S, col, vc, op) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(S.pos, 3)); if (vc) geo.setAttribute("color", new THREE.BufferAttribute(S.col, 3)); geo.setIndex(new THREE.BufferAttribute(S.idx, 1)); geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: !!vc, color: vc ? 0xffffff : col, transparent: op < 1, opacity: op, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(c.geom.org[0] - O[0], c.geom.org[1] - O[1], c.geom.org[2] - O[2]); mesh.renderOrder = 8; mesh.userData.noHit = true; mesh.raycast = () => {}; grp.add(mesh); return mesh; };
  if (c.geom) { mk(c.geom.road, 0, true, 1); if (c.geom.cut) mk(c.geom.cut, 0x3b82f6, false, 0.85); if (c.geom.fill) mk(c.geom.fill, 0xef4444, false, 0.85); 
    if (c.spec.bodies !== false && c.st && c.ctx) { c.geom._bodies = c.geom._bodies || {}; [["fill", 0xb59a70], ["cut", 0x6b8fb5]].forEach(([kd, colr]) => { if (!(kd in c.geom._bodies)) { try { c.geom._bodies[kd] = l3rBodyMesh(c, kd); } catch (e) { console.warn("Kropp", e); c.geom._bodies[kd] = null; } } const M = c.geom._bodies[kd]; if (!M) return;
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(M.pts.flat(), 3)); geo.setIndex(M.faces.flatMap(f => [f[0] - 1, f[1] - 1, f[2] - 1])); geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: colr, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })); mesh.position.set(c.geom.org[0] - O[0], c.geom.org[1] - O[1], c.geom.org[2] - O[2]); mesh.renderOrder = 6; mesh.userData.noHit = true; mesh.raycast = () => {}; grp.add(mesh); }); }
    // Överbyggnadens lager som riktiga solider (tvärfall, sluttande kanter) i lagrens egna färger
    if (c.spec.layersOn && (c.spec.layers || []).length && c.st) (c.spec.layers).forEach((l, i) => { const M = l3rLayerMesh(c, c.geom, i); if (!M) return;
      const geo = new THREE.BufferGeometry(), pos = []; M.pts.forEach(q => pos.push(q[0], q[1], q[2])); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(M.faces.flatMap(f => [f[0] - 1, f[1] - 1, f[2] - 1])); geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: l.color || "#a8a29e", side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); mesh.position.set(c.geom.org[0] - O[0], c.geom.org[1] - O[1], c.geom.org[2] - O[2]); mesh.renderOrder = 7; mesh.userData.noHit = true; mesh.raycast = () => {}; grp.add(mesh);
      const ed = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 35), new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: 0.55 })); ed.position.copy(mesh.position); ed.renderOrder = 9; ed.userData.noHit = true; ed.raycast = () => {}; grp.add(ed); }); }
  // Mittlinjen och trånga kurvor.
  const line = (pts, color) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 })); l.renderOrder = 12; l.userData.noHit = true; l.raycast = () => {}; grp.add(l); };
  if (c.st) line(c.st.map(p => new THREE.Vector3(p.x - O[0], p.y - O[1], p.z - O[2] + 0.12)), 0xffffff);
  else line(c.pts.map(p => new THREE.Vector3(p[0] - O[0], p[1] - O[1], p[2] - O[2] + 0.12)), 0xffffff);
  if (typeof l3rsLine === "function") l3rsLine(grp, line);
  l3rMeters(grp, line); l3rwPlace();
  if (c.res) c.res.tight.forEach(t => { const sp = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.5, (Number(c.spec.width) || 5) * 0.15), 12, 8), new THREE.MeshBasicMaterial({ color: 0xd946ef, depthTest: false })); sp.position.set(t.x - O[0], t.y - O[1], t.z - O[2] + 0.5); sp.renderOrder = 13; sp.userData.noHit = true; sp.raycast = () => {}; grp.add(sp); });
  l3PreviewMark(grp); l3Render(); if (typeof l3mHandlesPlace === "function") l3mHandlesPlace();
}
/* Metertal längs linjen (Victor 2026-11-10: "skriv ut på linjen vilka metertal jag är på, så jag ser var jag ska bredda"): ett streck och "20 m" var 5/10/20/50 m,
   start och slut, samt breddningarna som orange stycken med "Bredd. 20–35 m". Samma sträckor som Från/Till och snittets station. */
function l3rLabelsClear() { [...l3m.labels.keys()].filter(k => k.startsWith("road:")).forEach(k => { l3m.labels.get(k).remove(); l3m.labels.delete(k); }); }
function l3rPosAt(c, s) {
  if (c.st && c.st.length > 1) { const a = l3rAt(c.st, s); return { x: a.x, y: a.y, z: a.z, yaw: a.yaw }; }
  const P = c.pts; let acc = 0;
  for (let i = 1; i < P.length; i++) { const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (acc + d >= s || i === P.length - 1) { const t = d > 0 ? Math.max(0, Math.min(1, (s - acc) / d)) : 0; return { x: P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t, y: P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t, z: P[i - 1][2] + (P[i][2] - P[i - 1][2]) * t, yaw: Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0]) }; } acc += d; }
  return { x: P[0][0], y: P[0][1], z: P[0][2], yaw: 0 };
}
function l3rMeters(grp, lineFn) {
  l3rLabelsClear(); const c = l3road.cur; if (!c || !c.pts || c.pts.length < 2 || !l3m || !l3m.labels) return;
  const L = c.pts.reduce((a, p, i) => i ? a + Math.hypot(p[0] - c.pts[i - 1][0], p[1] - c.pts[i - 1][1]) : 0, 0), O = l3.O, host = l3.renderer.domElement.parentElement;
  const dist = L <= 60 ? 5 : L <= 250 ? 10 : L <= 600 ? 20 : 50, hw = (Number(c.spec.width) || 5) / 2 + 0.6;
  const mk = (id, txt, a, cls, dz) => { const el = document.createElement("div"); el.className = "v3-meas v3-meas-keep v3-rlab " + cls; el.textContent = txt; host.appendChild(el); el._at = new THREE.Vector3(a.x - O[0], a.y - O[1], a.z - O[2] + (dz || 0.6)); l3m.labels.set("road:" + id, el); };
  const tick = a => { const nx = -Math.sin(a.yaw), ny = Math.cos(a.yaw), P = [new THREE.Vector3(a.x + nx * hw - O[0], a.y + ny * hw - O[1], a.z + 0.2 - O[2]), new THREE.Vector3(a.x - nx * hw - O[0], a.y - ny * hw - O[1], a.z + 0.2 - O[2])];
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(P), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 })); l.renderOrder = 13; l.userData.noHit = true; l.raycast = () => {}; grp.add(l); };
  for (let s = 0; s <= L + 1e-6; s += dist) { const a = l3rPosAt(c, s); tick(a); mk("m" + s, `${Math.round(s)} m`, a, ""); }
  if (L - Math.floor(L / dist) * dist > dist * 0.25) { const a = l3rPosAt(c, L); tick(a); mk("end", `${l3rFmt(L, 0)} m`, a, "end"); }
  (c.spec.widen || []).forEach((z, i) => {
    if (z.kind === "obj") { const P = (z.pts || []).map(q => new THREE.Vector3(q[0] - O[0], q[1] - O[1], (l3rPosAt(c, l3rProj(c.pts, q[0], q[1]).s).z) + 0.4 - O[2])); if (P.length > 2) { P.push(P[0].clone()); const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(P), new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false })); l.renderOrder = 14; l.userData.noHit = true; l.raycast = () => {}; grp.add(l); const m0 = z.pts.reduce((a, q) => [a[0] + q[0] / z.pts.length, a[1] + q[1] / z.pts.length], [0, 0]); mk("o" + i, `Runt objekt +${l3rFmt(Number(z.offset) || 0, 1)} m`, { x: m0[0], y: m0[1], z: l3rPosAt(c, l3rProj(c.pts, m0[0], m0[1]).s).z }, "w", 2.2); } return; }
    const s0 = Math.max(0, Number(z.s0)), s1 = Math.min(L, Number(z.s1)); if (!(s1 > s0)) return;
    const pts = []; for (let s = s0; s <= s1 + 1e-6; s += Math.max(0.5, (s1 - s0) / 40)) { const a = l3rPosAt(c, s); pts.push(new THREE.Vector3(a.x - O[0], a.y - O[1], a.z + 0.35 - O[2])); }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false })); l.renderOrder = 14; l.userData.noHit = true; l.raycast = () => {}; grp.add(l);
    mk("w" + i, `Bredd. ${l3rFmt(s0, 0)}–${l3rFmt(s1, 0)} m${z.side === "L" ? " (vänster)" : z.side === "R" ? " (höger)" : ""} +${l3rFmt(Number(z.add) || 0, 1)} m`, l3rPosAt(c, (s0 + s1) / 2), "w", 2.2);
  });
  void lineFn; if (typeof l3mPlaceLabels === "function") l3mPlaceLabels();
}
function l3rSchedule(ms) {
  clearTimeout(l3road.timer);
  l3road.timer = setTimeout(async () => {
    const c = l3road.cur; if (!c) return; const seq = ++l3road.seq; c.busy = "Räknar…"; c.err = ""; l3rPanel();
    try {
      const r = await l3rCompute(c, () => seq === l3road.seq && l3road.cur === c); if (seq !== l3road.seq || l3road.cur !== c) return;
      c.busy = ""; if (!r) return;
      if (r.err) { c.err = r.err; c.res = null; c.geom = null; c.st = null; } else { c.res = r.res; c.st = r.st; c.W = r.W; c.ctx = r.ctx; c.geom = l3rBuild(c); c.saved = false; }
    } catch (err) { c.busy = ""; c.err = "Kunde inte räkna: " + (err && err.message ? err.message : err); console.warn("Byggväg", err); }
    l3rPanel(); l3rDraw(); if (typeof l3rsDirty === "function") l3rsDirty();
  }, ms == null ? 200 : ms);
}

/* ---- Start, stängning, objekt ---- */
function l3roadStart() {
  if (l3road.capture) { l3rCaptureDone(); return; }
  const mp = l3t.mp || [];
  if (mp.length < 2) { l3Status("Vägen behöver minst två punkter.", true); return; }
  const pts = mp.map(p => [p.x + l3.O[0], p.y + l3.O[1], p.z + l3.O[2]].map(v => Math.round(v * 1000) / 1000));
  l3t.mp = null; l3Busy(false); l3ShowVcb(null); l3Clear(l3.groups.tmp); if (typeof l3ClearMeasure === "function") l3ClearMeasure();
  const prev = l3road.last || {};
  const base = { ...L3R_DEF, ...(prev.spec || {}) }; if (base.layersOn === undefined) l3rApplyPreset(base, "bygg");   // vägen får en överbyggnad från början (byt under "Vägens uppbyggnad")
  l3roadOpen({ pts, spec: { ...base, src: (prev.spec && prev.spec.src && prev.spec.src.length ? prev.spec.src : l3rDefaultSrc()), widen: [], vehicle: (prev.spec && prev.spec.vehicle) || "truck" }, res: null, geom: null, st: null, busy: "", err: "" });
}
function l3roadOpen(cur) {
  l3roadClose(true); l3road.cur = cur; l3road.seq++;
  if (!l3road.kbd) { l3road.kbd = e => { if (e.key === "Escape" && l3road.capture) { e.stopPropagation(); l3rCaptureCancel(); } else if (e.key === "Escape" && l3road.cur && !/INPUT|SELECT|TEXTAREA/.test((e.target || {}).tagName || "")) { e.stopPropagation(); l3roadClose(); } }; window.addEventListener("keydown", l3road.kbd, true); }
  l3rPanel(); l3rDraw(); l3rSchedule(0);
}
function l3roadClose(keep) {
  l3road.capture = null; if (typeof l3rwClear === "function") l3rwClear();
  const el = document.getElementById("v3RoadPanel"); if (el) el.remove(); if (!keep && typeof l3rsClose === "function") l3rsClose();
  const c = l3road.cur; if (c && c.hidden && !c.saved) { c.hidden.forEach(id => { const g = l3.placeMeshes.get(id); if (g && !(l3.hidden && l3.hidden.has(id))) g.visible = true; }); const ex = c.hidden.filter(id => placements.some(q => q.id === id)); if (ex.length) l3SelectIds(ex); c.hidden = null; }
  if (c) l3road.last = { spec: JSON.parse(JSON.stringify(c.spec, (k, v) => k === "_c" ? undefined : v)) };
  clearTimeout(l3road.timer); l3road.seq++; l3road.cur = null; if (!keep) l3rDriveStop(true); else l3rDriveStop(false);
  if (l3.groups.road) l3Clear(l3.groups.road); if (typeof l3rLabelsClear === "function" && l3m) l3rLabelsClear();
  if (!keep) { if (l3road.kbd) { window.removeEventListener("keydown", l3road.kbd, true); l3road.kbd = null; } l3Render(); if (typeof l3mHandlesPlace === "function") l3mHandlesPlace(); }
}
/* Tryck i 3D medan panelen är öppen: ignoreras (panelen avslutas med Esc). */
function l3roadTap() {
  if (!l3road.cur || l3.tool !== "measure" || l3Prefs().measure !== "road") return false;
  if (l3road.capture) return false;   // objektets hörn samlas av vanliga mätverktyget
  l3Status("Byggvägen är öppen – skapa objekten eller stäng den (Esc) för att rita en ny väg.", true); return true;
}
/* Metertalen som 3D-text (tillval, bockas i/ur vid export): "20 m" bredvid vägen (läsriktning längs vägen, 0,8 m hög, 0,3 m tjock) och ett smalt streck tvärs över vägen vid varje meterpunkt. Ett enda nät. */
function l3rMetersMesh(c, G) {
  const L = c.st[c.st.length - 1].s, dist = L <= 60 ? 5 : L <= 250 ? 10 : L <= 600 ? 20 : 50, org = G.org, pts = [], faces = [], r3 = v => Math.round(v * 1000) / 1000, H = 0.8, T = 0.3, Z0 = 0.15;
  const add = (x, y, z) => { pts.push([r3(x - org[0]), r3(y - org[1]), r3(z - org[2])]); return pts.length; };
  const list = []; for (let s = 0; s <= L + 1e-6; s += dist) list.push(s); if (L - list[list.length - 1] > dist * 0.25) list.push(L);
  list.forEach((s, k) => {
    const a = l3rAt(c.st, s), rx = Math.cos(a.yaw), ry = Math.sin(a.yaw), nx = -ry, ny = rx, hw = l3rHW(c.spec, s, c.pts), txt = k === list.length - 1 && s !== Math.round(s) ? `${l3rFmt(s, 0)} M` : `${Math.round(s)} M`;
    const g = ifcTextGeom(txt, { h: H, t: T, rx, ry, start: 0, across: hw.l + 0.7 });   // vänster om vägen, början vid snittet
    if (g) { const b = pts.length; g.pts.forEach(q => add(a.x + q[0], a.y + q[1], a.z + Z0 + q[2])); g.tris.forEach(t => faces.push([t[0] + b, t[1] + b, t[2] + b])); }
    // Streck tvärs över vägen (0,12 m brett, 0,06 m högt)
    const w = 0.06, q = [[-hw.r, -w], [hw.l, -w], [hw.l, w], [-hw.r, w]], b = pts.length;   // (lateral, längs)
    [Z0, Z0 + 0.06].forEach(z => q.forEach(([lt, ln]) => add(a.x + nx * lt + rx * ln, a.y + ny * lt + ry * ln, a.z + z)));
    [[1, 3, 2], [1, 4, 3], [5, 6, 7], [5, 7, 8], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 4, 8], [3, 8, 7], [4, 1, 5], [4, 5, 8]].forEach(t => faces.push([t[0] + b, t[1] + b, t[2] + b]));
  });
  return pts.length ? { k: "mesh", pts, faces, closed: true } : null;
}
/* Ett lager i vägöverbyggnaden som sluten solid: parallellt med vägytan (tvärfall), tjocklek t, och med sluttande kanter (1 lodrätt : edgeK vågrätt) – lagrets tvärsnitt är en sexhörning
   (vänster kant, mitt, höger kant uppe och nere) som dras längs vägen. */
function l3rLayerPoly(p, spec, h0, h1) {
  const k = l3rK(spec), P = (sg, h) => { const t = (sg > 0 ? p.wl : p.wr) + h * k; return [sg * t, p.z - l3rFall(spec, sg * t) - h]; };
  return [P(1, h0), [0, p.z - h0], P(-1, h0), P(-1, h1), [0, p.z - h1], P(1, h1)];   // [sida (+ vänster), nivå]
}
function l3rLayerMesh(c, G, idx) {
  const st = c.st, spec = c.spec, org = G.org, L = spec.layers, pts = [], faces = [], r3 = v => Math.round(v * 1000) / 1000; let h0 = 0; for (let i = 0; i < idx; i++) h0 += Number(L[i].t) || 0; const t = Number(L[idx].t) || 0; if (t <= 0) return null;
  st.forEach(p => { l3rLayerPoly(p, spec, h0, h0 + t).forEach(([lt, z]) => pts.push([r3(p.x + p.nx * lt - org[0]), r3(p.y + p.ny * lt - org[1]), r3(z - org[2])])); });
  const m = 6;
  for (let i = 0; i + 1 < st.length; i++) for (let j = 0; j < m; j++) { const j2 = (j + 1) % m, a = i * m + j + 1, b = i * m + j2 + 1, c2 = (i + 1) * m + j2 + 1, d = (i + 1) * m + j + 1; faces.push([a, b, c2], [a, c2, d]); }
  const poly = l3rLayerPoly(st[0], spec, h0, h0 + t).map(q => new THREE.Vector2(q[0], q[1])); let tri = []; try { tri = THREE.ShapeUtils.triangulateShape(poly, []); } catch (e) { tri = [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 5]]; }
  const e0 = 0, e1 = (st.length - 1) * m; tri.forEach(f => { faces.push([e0 + f[0] + 1, e0 + f[2] + 1, e0 + f[1] + 1]); faces.push([e1 + f[0] + 1, e1 + f[1] + 1, e1 + f[2] + 1]); });
  // Rätt riktning (utåt): varje yta vänds så att dess normal pekar bort från lagrets lokala mitt (tvärsnittets tyngdpunkt, för ändytorna grannstationens).
  const nr = st.length, ringC = i => { const r = Math.max(0, Math.min(nr - 1, i)); return [0, 1, 2].map(k => { let a = 0; for (let j = 0; j < m; j++) a += pts[r * m + j][k]; return a / m; }); };
  faces.forEach(f => { const a = pts[f[0] - 1], b = pts[f[1] - 1], c2 = pts[f[2] - 1], ri = f.map(v => Math.floor((v - 1) / m)), lo = Math.min(...ri), hi = Math.max(...ri);
    const ref = lo === hi ? ringC(lo === 0 ? 1 : nr - 2) : (() => { const A = ringC(lo), B = ringC(hi); return [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2]; })();
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c2[0] - a[0], c2[1] - a[1], c2[2] - a[2]], nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], cen = [(a[0] + b[0] + c2[0]) / 3 - ref[0], (a[1] + b[1] + c2[1]) / 3 - ref[1], (a[2] + b[2] + c2[2]) / 3 - ref[2]];
    if (nrm[0] * cen[0] + nrm[1] * cen[1] + nrm[2] * cen[2] < 0) { const q = f[1]; f[1] = f[2]; f[2] = q; } });
  return { k: "mesh", pts, faces, closed: true };
}
/* Fyllning och schakt som slutna kroppar (Victor 2026-11-12: "solider av lagren under/över terrassytan"): mellan markytan och konstruktionsytan (terrassyta + innerslänt + dike + ytterslänt) över hela tvärsnittet.
   Fyllning (underbyggnad av fyllnadsmaterial) = från marken upp till konstruktionsytan där den ligger högre; schakt = från konstruktionsytan upp till marken där marken ligger högre. Tjockleken går mjukt mot noll i kanterna. */
function l3rBodyMesh(c, kind) {
  const st = c.st, spec = c.spec, gz = c.ctx && c.ctx.gz, org = c.geom.org, n = st.length, N = 56, r3 = v => Math.round(v * 1000) / 1000, kE = l3rK(spec); if (!gz || n < 2) return null;
  const pts = [], faces = [], idx = new Map(), id = q => { const k = Math.round(q[0] * 1e4) + "," + Math.round(q[1] * 1e4) + "," + Math.round(q[2] * 1e4); let i = idx.get(k); if (!i) { pts.push([r3(q[0] - org[0]), r3(q[1] - org[1]), r3(q[2] - org[2])]); i = pts.length; idx.set(k, i); } return i; };
  const T = [], B = []; let anyThick = false;
  for (let i = 0; i < n; i++) {
    const p = st[i], Tl = p.wl + p.dE * kE + (p.L.d || 0), Tr = p.wr + p.dE * kE + (p.R.d || 0), rowT = [], rowB = [];
    for (let j = 0; j <= N; j++) {
      const t = -Tr + (Tl + Tr) * j / N, x = p.x + p.nx * t, y = p.y + p.ny * t, sg = t >= 0 ? 1 : -1; let des = l3rDesignZ(p, spec, sg, sg > 0 ? p.L : p.R, Math.abs(t)), g = gz(x, y);
      if (des === null) des = g === null || g === undefined ? p.z - p.dE : g; if (g === null || g === undefined) g = des;
      const top = kind === "fill" ? des : Math.max(g, des), bot = kind === "fill" ? Math.min(g, des) : des; if (top - bot > 1e-3) anyThick = true;
      rowT.push([x, y, top]); rowB.push([x, y, bot]);
    }
    T.push(rowT); B.push(rowB);
  }
  if (!anyThick) return null;
  const add = (a, b, c2, want) => { const A = pts[a - 1], Bq = pts[b - 1], C = pts[c2 - 1]; if (!A || !Bq || !C || a === b || b === c2 || a === c2) return; const u = [Bq[0] - A[0], Bq[1] - A[1], Bq[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]], nm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (Math.hypot(nm[0], nm[1], nm[2]) < 1e-9) return; if (nm[0] * want[0] + nm[1] * want[1] + nm[2] * want[2] < 0) faces.push([a, c2, b]); else faces.push([a, b, c2]); };
  const quad = (a, b, c2, d, want) => { add(a, b, c2, want); add(a, c2, d, want); };
  for (let i = 0; i + 1 < n; i++) for (let j = 0; j < N; j++) {
    const t00 = T[i][j], t10 = T[i + 1][j], t01 = T[i][j + 1], t11 = T[i + 1][j + 1], b00 = B[i][j], b10 = B[i + 1][j], b01 = B[i][j + 1], b11 = B[i + 1][j + 1];
    if ([[t00, b00], [t10, b10], [t01, b01], [t11, b11]].every(([a, b]) => a[2] - b[2] < 1e-4)) continue;   // ingen tjocklek här
    quad(id(t00), id(t10), id(t11), id(t01), [0, 0, 1]); quad(id(b00), id(b10), id(b11), id(b01), [0, 0, -1]);
  }
  for (let i = 0; i + 1 < n; i++) { const p = st[i]; for (const [j, sd] of [[0, -1], [N, 1]]) {   // sidoväggarna (tjocklek noll i kanten, men om den ändå finns stängs den)
      const a = T[i][j], b = T[i + 1][j], a2 = B[i][j], b2 = B[i + 1][j]; if (a[2] - a2[2] < 1e-4 && b[2] - b2[2] < 1e-4) continue; quad(id(a), id(b), id(b2), id(a2), [sd * p.nx, sd * p.ny, 0]); } }
  for (const [i, sg] of [[0, -1], [n - 1, 1]]) { const p = st[i]; for (let j = 0; j < N; j++) { const a = T[i][j], b = T[i][j + 1], a2 = B[i][j], b2 = B[i][j + 1]; if (a[2] - a2[2] < 1e-4 && b[2] - b2[2] < 1e-4) continue; quad(id(a), id(b), id(b2), id(a2), [sg * p.tx, sg * p.ty, 0]); } }
  return faces.length ? { k: "mesh", pts, faces, closed: true } : null;
}

/* Väg, schaktslänt och fyllningsslänt blir ritade ytor (ett steg i Ångra). */
function l3roadMake() {
  const c = l3road.cur; if (!c || !c.geom) return;
  const G = c.geom, r3 = v => Math.round(v * 1000) / 1000, conv = S => { const pts = []; for (let i = 0; i < S.pos.length; i += 3) pts.push([r3(S.pos[i]), r3(S.pos[i + 1]), r3(S.pos[i + 2])]); const faces = []; for (let i = 0; i < S.idx.length; i += 3) faces.push([S.idx[i] + 1, S.idx[i + 1] + 1, S.idx[i + 2] + 1]); return { k: "mesh", pts, faces, closed: false }; };
  placeSnapshot(); const ids = [];
  const setId = c.editSet || ghNewId().slice(0, 8);   // delarna hör ihop: kan väljas som en helhet i Volym
  if (c.editSet) { const old = new Set(placements.filter(q => (q.rset || q.set) === c.editSet && q.rsrc).map(q => q.id)); placements = placements.filter(q => !old.has(q.id)); old.forEach(id => { placeDeleted.add(id); placeDirty.delete(id); const g = l3.placeMeshes.get(id); if (g) { if (l3.gizmo.object === g) l3.gizmo.detach(); l3.groups.places.remove(g); } l3.placeMeshes.delete(id); }); c.hidden = null; }   // redigering: de gamla delarna ersätts
  const rsrc0 = { spec: JSON.parse(JSON.stringify(c.spec, (k, v) => k === "_c" ? undefined : v)), pts: JSON.parse(JSON.stringify(c.pts)), org: [G.org[0], G.org[1], G.org[2]] };
  const add = (S, name, color) => { if (!S) return; const p = modCreate(conv(S), [G.org[0], G.org[1], G.org[2]], { name, color, snapshot: false }); p.set = setId; ids.push(p.id); };
  if (c.spec.layersOn && (c.spec.layers || []).length) (c.spec.layers).forEach((l, i) => { const M = l3rLayerMesh(c, G, i); if (!M) return; const p = modCreate(M, [G.org[0], G.org[1], G.org[2]], { name: `Skikt ${l.name} ${l3rFmt(Number(l.t) || 0, 2)} m`, color: l.color || "#a8a29e", snapshot: false }); p.layerObj = true; ids.push(p.id); });
  if (l3Prefs().rdIfcMeters !== false && typeof ifcTextGeom === "function") { const M = l3rMetersMesh(c, G); if (M) { const p = modCreate(M, [G.org[0], G.org[1], G.org[2]], { name: `Metertal byggväg ${l3rFmt(c.res.len, 0)} m`, color: "#facc15", snapshot: false }); p.set = setId; p.text = true; ids.push(p.id); } }
  if (c.spec.bodies !== false) [["fill", "Underbyggnad – fyllning (kropp)", "#b59a70", c.res.fill], ["cut", "Schakt – utgrävd volym (kropp)", "#6b8fb5", c.res.cut]].forEach(([kd, nm, colr, vl]) => { const M = l3rBodyMesh(c, kd); if (!M) return; const p = modCreate(M, [G.org[0], G.org[1], G.org[2]], { name: `${nm} ${l3rM3(vl)}`, color: colr, snapshot: false }); p.set = setId; p.bodyObj = kd; ids.push(p.id); });
  add(G.road, `Byggväg ${l3rFmt(c.res.len, 0)} m`, "#9ca3af"); add(G.cut, "Släntyta schakt", "#60a5fa"); add(G.fill, "Släntyta fyllning", "#f87171");
  ids.forEach(id => { const q = placements.find(x => x.id === id); if (q) { q.rset = setId; q.rsrc = rsrc0; } });   // sparar inställningarna så att vägen går att öppna igen
  c.saved = true; l3roadClose(); l3SelectIds(ids); l3Changed();
  l3Toast(`Byggväg skapad: ${l3rFmt(c.res.len, 0)} m, schakt ${l3rM3(c.res.cut)}, fyllning ${l3rM3(c.res.fill)}. Ctrl+Z ångrar.`);
}

/* ---- Panel ---- */
/* Förklarande figur: bokstäverna A–I hör ihop med inställningarna i panelen. */
function l3rXsFigure() {
  const ink = "#334155", col = { A: "#b45309", B: "#b45309", C: "#475569", D: "#475569", E: "#2563eb", F: "#2563eb", G: "#2563eb", H: "#dc2626", I: "#64748b" };
  const L = (k, x, y) => `<circle cx="${x}" cy="${y}" r="7.5" fill="#fff" stroke="${col[k]}" stroke-width="1.4"/><text x="${x}" y="${y + 3.6}" text-anchor="middle" font-size="10" font-weight="700" fill="${col[k]}">${k}</text>`;
  return `<svg class="v3-rd-fig" viewBox="0 0 470 178" role="img" aria-label="Tvärsektion med måttbokstäver" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="470" height="178" rx="10" fill="#f8fafc"/>
    <path d="M0 62 L24 60 L77 113 L97 113 L139 99 L361 99 L443 140 L470 140 L470 178 L0 178 Z" fill="#e7e1d6"/>
    <path d="M190 65 L250 60 L310 65 L316 71 L316 71 Z" fill="none"/>
    <polygon points="190,65 250,60 310,65 308.5,71 250,66 191.5,71" fill="#1f2937"/>
    <polygon points="191.5,71 250,66 308.5,71 304,81 250,76 196,81" fill="#cbd5e1" stroke="#64748b" stroke-width=".6"/>
    <polygon points="196,81 250,76 304,81 286,99.5 250,96 214,99.5" fill="#a8a29e" stroke="#64748b" stroke-width=".6"/>
    <polygon points="196,81 304,81 361,99 139,99" fill="none"/>
    <path d="M190 65 L139 99 M310 65 L361 99" stroke="${ink}" stroke-width=".8" fill="none"/>
    <path d="M139 99 L250 94 L361 99" stroke="#92400e" stroke-width="1.3" stroke-dasharray="5 3" fill="none"/>
    <path d="M139 99 L97 113 L77 113 L24 60" stroke="#2563eb" stroke-width="2.4" fill="none" stroke-linejoin="round"/>
    <path d="M361 99 L443 140" stroke="#dc2626" stroke-width="2.4" fill="none"/>
    <path d="M0 62 L24 60 M443 140 L470 140" stroke="#6b7280" stroke-width="1.6"/>
    <path d="M190 65 L250 60 L310 65" stroke="#111827" stroke-width="2.6" fill="none"/>
    <path d="M250 50 L250 168" stroke="#94a3b8" stroke-width="1" stroke-dasharray="8 3 2 3"/><text x="250" y="46" text-anchor="middle" font-size="9" fill="#64748b" font-weight="700">C/L</text>
    <path d="M190 40 L310 40 M190 36 L190 44 M310 36 L310 44" stroke="${col.A}" stroke-width="1.2"/><text x="250" y="31" text-anchor="middle" font-size="9.5" fill="${col.A}">Vägbana</text>
    ${L("A", 250, 40)}
    <path d="M205 56 L222 60" stroke="${col.B}" stroke-width="1.4" marker-end="url(#a)"/>
    <text x="214" y="50" text-anchor="middle" font-size="8.5" fill="${col.B}">2,5 %</text>${L("B", 176, 52)}
    <text x="250" y="90" text-anchor="middle" font-size="8.5" fill="#1f2937">överbyggnad</text>${L("C", 322, 79)}
    ${L("D", 160, 78)}
    <text x="250" y="110" text-anchor="middle" font-size="8.5" fill="#92400e">terrassyta</text>
    ${L("E", 118, 96)}${L("F", 87, 128)}<text x="87" y="142" text-anchor="middle" font-size="8.5" fill="${col.F}">dike</text>${L("G", 38, 96)}
    ${L("H", 418, 112)}<text x="410" y="128" text-anchor="middle" font-size="8.5" fill="${col.H}">fyllning</text>
    <path d="M139 149 L24 149 M139 145 L139 153 M24 145 L24 153" stroke="${col.I}" stroke-width="1.2"/>${L("I", 82, 149)}<text x="82" y="167" text-anchor="middle" font-size="8.5" fill="${col.I}">största släntbredd</text>
    <text x="330" y="160" text-anchor="middle" font-size="9" fill="#78716c">undergrund</text>
    <defs><marker id="a" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L8 4 L0 8 z" fill="${col.B}"/></marker></defs>
  </svg>`;
}
(function l3rXsCss() {
  if (typeof document === "undefined" || document.getElementById("v3RoadXsCss")) return; const st = document.createElement("style"); st.id = "v3RoadXsCss";
  st.textContent = `#view3d .v3-rd-fig{width:100%;height:auto;display:block;margin:2px 0 6px;border:1px solid #e2e8f0;border-radius:10px}
#view3d .v3-rd-gh{margin:8px 0 2px;font:700 11px system-ui,sans-serif;letter-spacing:.05em;text-transform:uppercase;color:#334155}#view3d .v3-rd-gh em{font-style:normal;font-weight:500;letter-spacing:0;text-transform:none;color:#94a3b8;margin-left:6px}
#view3d .v3-rd-up{display:flex;flex-direction:column;gap:4px;margin:4px 0}#view3d .v3-rd-up>b{font:700 11px system-ui;letter-spacing:.05em;text-transform:uppercase;color:#334155}#view3d .v3-rd-up select{padding:5px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;background:#fff}#view3d .v3-rd-upl{display:flex;flex-wrap:wrap;gap:3px 8px;font-size:11px;color:#475569}#view3d .v3-rd-upl i{display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.2)}
#view3d .v3-rd-sec{margin:6px 0}#view3d .v3-rd-sec.shut>.v3-rd-secb{display:none}#view3d .v3-rd-sec>.v3-lsec-h{margin:2px 0 4px;padding:2px 8px 2px 12px;min-height:0}#view3d .v3-rd-sec>.v3-lsec-h .v3-lsec-t{font-size:11px;padding:3px 0}#view3d .v3-rd-sec .v3-rd-up>b{display:none}
#view3d .v3-rd-k{display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;border:1.4px solid #2f7bff;color:#2f7bff;font:700 10px system-ui;flex:0 0 16px;margin-right:4px}`;
  document.head.appendChild(st);
})();
/* Fällbara avsnitt i Väg-fliken (Victor 2026-11-12: "gör menyer collapsable"): varje del får en rubrik med pil – valen sparas. */
function l3rXsFold(el) {
  const tab = el.querySelector('[data-rtab="vag"]'); if (!tab) return; const shut = new Set(l3Prefs().rdShut || []);
  const wrap = (key, title, nodes, note) => { nodes = nodes.filter(Boolean); if (!nodes.length) return; const sec = document.createElement("section"), open = !shut.has(key); sec.className = "v3-rd-sec" + (open ? "" : " shut"); sec.dataset.rsecw = key;
    sec.innerHTML = `<div class="v3-lg v3-lsec-h"><button type="button" class="v3-lsec-t" data-rsec="${key}" aria-expanded="${open}"><i>›</i>${title}${note ? ` <em class="v3-lsec-n">${note}</em>` : ""}</button></div><div class="v3-rd-secb"></div>`;
    nodes[0].parentNode.insertBefore(sec, nodes[0]); const body = sec.querySelector(".v3-rd-secb"); nodes.forEach(n => body.appendChild(n));
    sec.querySelector("[data-rsec]").onclick = e => { const b = e.currentTarget, o = b.getAttribute("aria-expanded") !== "true"; b.setAttribute("aria-expanded", String(o)); sec.classList.toggle("shut", !o); const set = new Set(l3Prefs().rdShut || []); if (o) set.delete(key); else set.add(key); l3SetPref("rdShut", [...set]); }; };
  const q = s => tab.querySelector(s), heads = [...tab.querySelectorAll(":scope > .v3-rd-gh")], grids = [...tab.querySelectorAll(":scope > .v3-rd-g")];
  const up = q(":scope > .v3-rd-up"), bodies = q(":scope > label.v3-rd-n"), fig = q(":scope > .v3-rd-fig");
  wrap("src", "Följer (ytor)", [q(":scope > .v3-rd-src")]);
  wrap("res", "Resultat", [q(":scope > [data-rres]")]);
  wrap("build", "Vägens uppbyggnad", [up, bodies]);
  wrap("fig", "Förklarande figur", [fig]);
  if (grids[0]) wrap("xs", "Tvärsektionen", [grids[0]], "A–I");
  if (heads[1] && grids[1]) wrap("long", "Längs vägen", [grids[1]]);
  heads.forEach(h => h.remove());
}
function l3rPanel() {
  const c = l3road.cur; if (!c) return;
  const host = document.getElementById("v3Canvas"); if (!host) return;
  let el = document.getElementById("v3RoadPanel");
  if (!el) { el = document.createElement("div"); el.id = "v3RoadPanel"; el.className = "v3-vp"; host.appendChild(el); ["pointerdown", "wheel", "contextmenu", "dblclick", "click", "keydown", "keyup"].forEach(t => el.addEventListener(t, e => e.stopPropagation())); }
  const esc = typeof escHtml === "function" ? escHtml : s => String(s), r = c.res, spec = c.spec, srcs = l3rSources();
  const num = (k, label, tip, unit, min, max, st) => `<label class="v3-rd-n" title="${esc(tip)}"><span>${label}</span><input type="number" data-rk="${k}" value="${spec[k]}" min="${min}" max="${max}" step="${st}"><em>${unit}</em></label>`;
  const numK = (L, k, label, tip, unit, min, max, st) => `<label class="v3-rd-n" title="${esc(tip)}"><b class="v3-rd-k">${L}</b><span>${label}</span><input type="number" data-rk="${k}" value="${spec[k] != null ? spec[k] : ""}" min="${min}" max="${max}" step="${st}"><em>${unit}</em></label>`;
  const sum = r ? `<div class="v3-vp-hero ${r.net > 0 ? "neg" : r.net < 0 ? "pos" : ""}"><div class="net"><span>Väg</span><b>${l3rFmt(r.len, 0)} m</b><em>${r.dz >= 0 ? "stiger" : "sjunker"} ${l3rFmt(Math.abs(r.dz), 1)} m · ${l3rFmt(r.z0, 1)} → ${l3rFmt(r.z1, 1)} m</em></div>
      <div class="chips"><span title="Medellutning längs vägen"><i>∠</i>${l3rFmt(r.avgG * 100, 1)} % medel</span><span title="Största lutning – högst ${spec.grade} % är inställt"><i>⛰</i>${l3rFmt(r.maxG * 100, 1)} % störst</span><span title="Vägens yta i plan"><i>▭</i>${l3rFmt(r.roadArea, 0)} m²</span></div>
      <div class="cf"><button type="button" class="cut" style="cursor:default"><span>Schakt (inkl. slänter)</span><b>${l3rM3(r.cut)}</b></button><button type="button" class="fill" style="cursor:default"><span>Fyllning (inkl. slänter)</span><b>${l3rM3(r.fill)}</b></button></div>
      <div class="chips"><span title="Släntyta i schakt"><i style="color:#3b82f6">▲</i>${l3rFmt(r.slopeCut, 0)} m² schaktslänt</span><span title="Släntyta i fyllning"><i style="color:#ef4444">▼</i>${l3rFmt(r.slopeFill, 0)} m² fyllningsslänt</span><span title="Djupaste schakt / högsta fyllning i vägens mitt"><i>↕</i>−${l3rFmt(r.maxCutDepth, 1)} / +${l3rFmt(r.maxFillDepth, 1)} m</span></div></div>
      ${spec.mode === "pins" && r.maxG > (Number(spec.grade) || 10) / 100 + 0.0005 ? `<div class="v3-vq-note">⚠ Lutningen mellan punkterna blir ${l3rFmt(r.maxG * 100, 1)} % – mer än ${spec.grade} %. Flytta punkterna eller lägg till fler med +.</div>` : ""}
      ${r.tight.length ? `<div class="v3-vq-note">⚠ ${r.tight.length} ${r.tight.length === 1 ? "plats" : "ställen"} med kurvradie under ${spec.minR} m (lila prickar) – minsta radie ${l3rFmt(Math.min(...r.tight.map(t => t.R)), 1)} m. Rita mjukare kurva eller sänk minsta radie.</div>` : ""}
      ${r.unreached ? `<div class="v3-vq-note">⚠ Slänten når inte marken inom ${spec.reach} m vid ${r.unreached} stationer – höj \"Största släntbredd\" eller kontrollera ytan.</div>` : ""}
      ${r.miss ? `<div class="v3-vq-note">⚠ ${r.miss} stationer låg utanför ytan – höjden är interpolerad från grannarna.</div>` : ""}`
    : c.err ? `<div class="v3-vp-e">${esc(c.err)}</div>` : `<div class="v3-vp-t"><span class="v3-vp-spin"></span> ${c.busy || "Räknar…"}</div>`;
  const layerSum = r ? (r.layers && r.layers.length ? `<div class="v3-rd-lsum"><b>Överbyggnad ${l3rFmt(r.D, 2)} m</b> · terrassyta ${l3rFmt(r.D, 2)} m under vägens yta${r.layers.map(l => `<div><i style="background:${esc(l.color || "#a8a29e")}"></i>${esc(l.name)} ${l3rFmt(l.t, 2)} m<span>${l3rM3(l.vol)} · ${l3rFmt(l.area, 0)} m²</span></div>`).join("")}</div>` : "") : "";
  const nWarn = r ? (r.tight.length ? 1 : 0) + (r.unreached ? 1 : 0) + (r.miss ? 1 : 0) + (spec.mode === "pins" && r.maxG > (Number(spec.grade) || 10) / 100 + 0.0005 ? 1 : 0) : 0;
  const mini = r ? `<b>${l3rFmt(r.len, 0)} m</b><span>∠ ${l3rFmt(r.avgG * 100, 1)} % · max ${l3rFmt(r.maxG * 100, 1)} %</span><span class="c">Schakt ${l3rM3(r.cut)}</span><span class="f">Fyllning ${l3rM3(r.fill)}</span>${nWarn ? `<span class="w" title="Se fliken Väg">⚠ ${nWarn}</span>` : ""}` : (c.err ? "⚠ " + esc(c.err) : "Räknar …");
  const ae = document.activeElement;
  if (el.innerHTML && ae && ae.dataset && Object.keys(ae.dataset).some(k => /^r[kpwol]/.test(k)) && el.contains(ae)) { const box = el.querySelector("[data-rres]"); if (box) box.innerHTML = sum; const mb = el.querySelector("[data-rmini]"); if (mb) mb.innerHTML = mini; const lb = el.querySelector("[data-rlsum]"); if (lb) lb.innerHTML = layerSum; return; }
  const tab = ["vag", "pkt", "bredd", "over", "kor"].includes(l3Prefs().rdTab) ? l3Prefs().rdTab : "vag", nW = (spec.widen || []).length;
  const tabBtn = (k, l, b) => `<button type="button" data-rt="${k}" class="${tab === k ? "on" : ""}">${l}${b ? ` <em>${b}</em>` : ""}</button>`;
  el.innerHTML = `<div class="v3-vp-h"><b>Byggväg</b><span>${l3rFmt(c.pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - c.pts[i - 1][0], p[1] - c.pts[i - 1][1]) : 0, 0), 0)} m · ${c.pts.length} punkter</span><button type="button" data-rb="x" title="Stäng (Esc)">✕</button></div>
    <div class="v3-rd-mini" data-rmini>${mini}</div>
    <div class="v3-rd-tabs">${tabBtn("vag", "Väg", nWarn ? "⚠" : "")}${tabBtn("pkt", "Punkter", "")}${tabBtn("bredd", "Breddning", nW || "")}${tabBtn("over", "Överbyggnad", spec.layersOn ? "✓" : "")}${tabBtn("kor", "Kör", "")}</div>
    <div class="v3-rd-tab" data-rtab="vag" ${tab === "vag" ? "" : "hidden"}>
    <div class="v3-rd-src" title="Vilka ytor vägen ska följa. Flera kan kombineras – den högsta gäller.">${srcs.length ? srcs.map(s => `<label><input type="checkbox" data-rs="${esc(s.k)}" ${spec.src.includes(s.k) ? "checked" : ""}> ${esc(s.label)}</label>`).join("") : `<div class="v3-vp-t warn">Tänd ett punktmoln, en 3D-modell eller en DXF (Lager) som vägen ska följa.</div>`}</div>
    <div data-rres>${sum}</div>
    <div class="v3-rd-up" title="Välj hur vägen är uppbyggd: lagerföljd och tvärfall. Lagren kan finjusteras under fliken Överbyggnad"><b>Vägens uppbyggnad</b>
      <select data-rlp2><option value="none" ${!spec.layersOn ? "selected" : ""}>Ingen överbyggnad (bara vägytan)</option>${Object.entries(L3R_PRESETS).map(([k, v]) => `<option value="${k}" ${spec.layersOn && spec.preset === k ? "selected" : ""}>${esc(v[0])}</option>`).join("")}<option value="own" ${spec.layersOn && !spec.preset ? "selected" : ""}>Egen uppbyggnad … (fliken Överbyggnad)</option></select>
      ${spec.layersOn && (spec.layers || []).length ? `<div class="v3-rd-upl">${(spec.layers || []).map(l => `<span><i style="background:${esc(l.color || "#a8a29e")}"></i>${esc(l.name)} ${l.t < 1 ? Math.round(l.t * 1000) + " mm" : l3rFmt(l.t, 2) + " m"}</span>`).join("")}</div>` : ""}</div>
    <label class="v3-rd-n" style="margin:2px 0 6px" title="Fyllning (underbyggnad av fyllnadsmaterial under terrassytan) och schakt skapas som egna slutna kroppar tillsammans med lagren"><input type="checkbox" data-rk="bodies" ${spec.bodies !== false ? "checked" : ""} style="width:auto"><span>Fyllning och schakt som kroppar</span></label>
    ${l3rXsFigure()}
    <div class="v3-rd-gh">Tvärsektionen <em>bokstäverna hör ihop med figuren</em></div>
    <div class="v3-rd-g">
      ${numK("A", "width", "Vägbana", "Vägbanans totala bredd: körbana + eventuella vägrenar (mäts mellan vägkanterna, överst på vägen)", "m", 2, 30, 0.5)}
      ${numK("B", "fall", "Tvärfall", "Vägytans lutning i sidled så att vattnet rinner av: 2,5 % på asfalt, 3–4 % på grus/byggväg", "%", 0, 8, 0.5)}
      <label class="v3-rd-n" style="grid-column:1/3" title="Takprofil = högst i mitten och lutar åt båda hållen (vanligast på rak väg). Ensidigt = hela vägen lutar åt ett håll (kurvor, enkelfil)"><b class="v3-rd-k">B</b><span>Fallriktning</span><select data-rk="fallMode" style="flex:1;min-width:0;max-width:170px;padding:3px;border:1px solid #cbd5e1;border-radius:6px;font:inherit">${[["crown", "Takprofil (högst i mitten)"], ["L", "Ensidigt åt vänster"], ["R", "Ensidigt åt höger"], ["flat", "Plant (inget tvärfall)"]].map(([v, t]) => `<option value="${v}" ${(spec.fallMode || "crown") === v ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      ${numK("D", "edgeK", "Kantlutning 1:", "Överbyggnadens kanter lutar utåt nedåt: 1 lodrätt på så här många meter i sidled (1,5 är vanligt). Gör nedersta lagret och terrassytan bredare än vägbanan. Ställ in lagren under fliken Överbyggnad", "", 0, 5, 0.25)}
      ${numK("E", "inK", "Innerslänt 1:", "Slänten från terrassytans kant ned i diket (bara i schakt). 1:3 är vanligt – flackare än 1:3 är trafiksäkrare", "", 0.5, 8, 0.25)}
      <label class="v3-ga-tg" style="grid-column:1/3" title="Dike vid vägkanten i schakt (dräner terrassytan). Av = slänten går direkt från terrassytans kant"><input type="checkbox" data-rk="ditch" ${spec.ditch !== false ? "checked" : ""}><span><b class="v3-rd-k">F</b> Dike i schakt</span></label>
      ${spec.ditch !== false ? numK("F", "ditchD", "Dikesdjup", "Hur långt dikesbotten ligger under terrassytan vid kanten (minst ca 0,3 m för att dränera överbyggnaden)", "m", 0.1, 2, 0.05) + numK("F", "ditchBw", "Dikesbotten", "Dikesbottnens bredd", "m", 0, 3, 0.1) : ""}
      ${numK("G", "cutR", "Ytterslänt 1:", "Slänten från diket (eller kanten) upp till marken i schakt: 1 lodrätt på så här många meter i sidled (1 = 45°, 0,25 = brant bergschakt, 3 = flack jordslänt)", "", 0.25, 5, 0.25)}
      ${numK("H", "fillR", "Fyllningsslänt 1:", "Slänten från terrassytans kant ned till marken i fyllning: 1 lodrätt på så här många meter i sidled (1,5–3 är vanligt)", "", 0.5, 6, 0.25)}
      ${numK("I", "reach", "Största släntbredd", "Så långt ut från vägen letar slänten efter marken innan den ger upp", "m", 3, 100, 1)}
    </div>
    <div class="v3-rd-gh">Längs vägen <em>profil och plan</em></div>
    <div class="v3-rd-g">
      ${num("grade", "Högsta lutning", "Vägens lutning längs vägen får aldrig bli högre än så (tung trafik: 8–10 %)", "%", 1, 30, 0.5)}
      ${num("smooth", "Jämna ut över", "Längd som markens höjd jämnas ut över – större värde ger en mjukare väg som skär mer", "m", 0, 200, 5)}${num("filletR", "Kurvradie", "Hörnen rundas av med cirkelbågar med den här radien (0 = vassa hörn). Radien kan bli mindre där punkterna ligger tätt", "m", 0, 200, 5)}${num("minR", "Minsta radie", "Kurvor med mindre radie markeras (lastbil/dumper ca 12–20 m)", "m", 3, 100, 1)}
      ${num("step", "Stationsavstånd", "Avstånd mellan tvärsnitten som räknas och ritas (mindre = mer detaljerat men långsammare)", "m", 0.5, 10, 0.5)}
      ${spec.mode === "anchor" ? `<label class="v3-rd-n" style="grid-column:1/3" title="Punkten vars höjd är given. Dra i ringen för att ändra höjden."><span>Höjdpunkt</span><select data-ra style="flex:2;padding:3px;border:1px solid #cbd5e1;border-radius:6px;font:inherit"><option value="-1" ${!(spec.anchor >= 0) ? "selected" : ""}>Högsta punkten du klickat</option>${c.pts.map((p, i) => `<option value="${i}" ${Number(spec.anchor) === i ? "selected" : ""}>Punkt ${i + 1} (${l3rFmt(p[2], 2)} m)</option>`).join("")}</select></label><label class="v3-rd-n" style="grid-column:1/3" title="Vägen går aldrig högre än höjdpunkten"><input type="checkbox" data-rc ${spec.cap !== false ? "checked" : ""} style="width:auto"><span>Aldrig över höjdpunkten</span></label>` : ""}
      <div class="v3-rd-seg" title="Höjdprofil"><button type="button" data-rm="anchor" class="${spec.mode === "anchor" ? "on" : ""}" title="En punkt på vägen har given höjd (som standard den högsta du klickat) – resten räknas därifrån med högsta lutning">Från höjdpunkt</button><button type="button" data-rm="terrain" class="${spec.mode === "terrain" ? "on" : ""}">Följ marken</button><button type="button" data-rm="straight" class="${spec.mode === "straight" ? "on" : ""}">Rak start → slut</button><button type="button" data-rm="pins" class="${spec.mode === "pins" ? "on" : ""}" title="Vägen går genom höjden i varje punkt du klickat ut (dra en ring för att ändra) – den högsta punkten blir vägens högsta">Genom mina punkter</button></div>
    </div>
    </div>
    <div class="v3-rd-tab" data-rtab="pkt" ${tab === "pkt" ? "" : "hidden"}>
    <div class="v3-vp-tip"><b>Dra</b> en ring för att flytta en punkt · <b>+</b> mellan ringarna lägger till en punkt · högerklicka en ring tar bort den · Ctrl+Z ångrar</div>
    <div class="v3-rd-pt" title="Flytta en punkt på mittlinjen exakt – i modellens X/Y/Z eller längs/tvärs/höjd längs vägen. Markera punkten genom att trycka på dess ring."><div class="v3-rd-wh"><b>Flytta punkt</b>
      <select data-rps>${c.pts.map((p, i) => `<option value="${i}" ${l3rPtSel(c) === i ? "selected" : ""}>Punkt ${i + 1}</option>`).join("")}</select></div>
      <div class="v3-rd-xyz"><label>X<input type="number" data-rpx step="0.001" value="${l3rPtVal(c, 0)}"></label><label>Y<input type="number" data-rpy step="0.001" value="${l3rPtVal(c, 1)}"></label><label>Z<input type="number" data-rpz step="0.001" value="${l3rPtVal(c, 2)}"></label></div>
      <div class="v3-rd-st"><span>Steg</span><select data-rpst>${[[0.001, "1 mm"], [0.01, "1 cm"], [0.1, "10 cm"], [1, "1 m"], [5, "5 m"]].map(([v, l]) => `<option value="${v}" ${l3rStep() === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        <select data-rpm title="Riktningar: modellens axlar eller vägens riktning"><option value="xyz" ${l3rPtMode() === "xyz" ? "selected" : ""}>Modell X/Y/Z</option><option value="lat" ${l3rPtMode() === "lat" ? "selected" : ""}>Längs / tvärs / höjd</option></select></div>
      <div class="v3-rd-pad">${(l3rPtMode() === "xyz" ? [["x-", "◂ X−"], ["x+", "X+ ▸"], ["z+", "▲ Z+"], ["y-", "▾ Y−"], ["y+", "▴ Y+"], ["z-", "▼ Z−"]] : [["x-", "◂ vänster"], ["x+", "höger ▸"], ["z+", "▲ upp"], ["y-", "▾ bakåt"], ["y+", "▴ framåt"], ["z-", "▼ ner"]]).map(([k, l]) => `<button type="button" data-rpn="${k}">${l}</button>`).join("")}</div>
      <div class="v3-rd-gl">${l3rGround(c)}<button type="button" data-rpg title="Sätt punktens höjd till markens höjd">Z till marken</button></div>
      <div class="v3-pal-hint" style="margin:2px 0 0">Piltangenter flyttar i plan, PageUp/PageDown i höjd (Skift = ×10). Ctrl+Z ångrar.</div></div>
    </div>
    <div class="v3-rd-tab" data-rtab="bredd" ${tab === "bredd" ? "" : "hidden"}>
    <div class="v3-rd-w" title="Lokal breddning, t.ex. vid ett stort fundament: vägen blir bredare mellan två sträckor och avtonas mjukt"><div class="v3-rd-wh"><b>Breddningar</b><button type="button" data-rb="addw" title="Lägg till en breddning (vid snittet om tvärsektionen är öppen, annars mitt på vägen)">＋ Breddning</button></div>${(spec.widen || []).map((z, i) => z.kind === "obj" ? "" : `<div class="v3-rd-wr"><span>från</span><input type="number" data-rw="${i}:s0" value="${l3rFmt(z.s0, 1)}" step="1"><span>till</span><input type="number" data-rw="${i}:s1" value="${l3rFmt(z.s1, 1)}" step="1"><span>m  +</span><input type="number" data-rw="${i}:add" value="${z.add}" step="0.5" min="-10" max="30"><span>m</span><select data-rw="${i}:side"><option value="both" ${z.side !== "L" && z.side !== "R" ? "selected" : ""}>båda</option><option value="L" ${z.side === "L" ? "selected" : ""}>vänster</option><option value="R" ${z.side === "R" ? "selected" : ""}>höger</option></select><span title="Så långt före och efter avtonas breddningen">avtoning</span><input type="number" data-rw="${i}:taper" value="${z.taper}" step="1" min="1" max="100"><span>m</span><button type="button" data-rwx="${i}" title="Ta bort">✕</button></div>`).join("")}</div>
    <details class="v3-rd-adv" ${l3Prefs().rdAdv ? "open" : ""} title="Avancerade breddningar: dra start och slut direkt på linjen, eller bredda runt ett objekt du pekar ut"><summary>Avancerat – breddning på linjen och runt objekt</summary>
      <label class="v3-rd-n" title="Orange handtag på linjen vid varje breddnings start och slut – dra dem dit du vill"><input type="checkbox" data-radh ${l3Prefs().rdHandles ? "checked" : ""} style="width:auto"><span>Dragbara start/slut på linjen</span></label>
      <div class="v3-rd-wh"><b>Runt objekt</b><button type="button" data-rb="addobj" title="Tryck ut objektets hörn i 3D (Enter eller första punkten avslutar). Vägkanten följer konturen + offset.">＋ Runt objekt…</button></div>
      ${(spec.widen || []).map((z, i) => z.kind !== "obj" ? "" : `<div class="v3-rd-wr"><span><b>Objekt</b> (${(z.pts || []).length} punkter)</span><span>offset</span><input type="number" data-ro="${i}" value="${z.offset}" step="0.5" min="0" max="30"><span>m</span><button type="button" data-rore="${i}" title="Peka ut objektet igen" style="margin-left:6px">⟳ rita om</button><button type="button" data-rox="${i}" title="Ta bort">✕</button></div>`).join("")}
    </details>
    </div>
    <div class="v3-rd-tab" data-rtab="over" ${tab === "over" ? "" : "hidden"}>
    <div class="v3-rd-ly2"><div data-rlsum>${layerSum}</div>
      <label class="v3-rd-n"><input type="checkbox" data-rlon ${spec.layersOn ? "checked" : ""} style="width:auto"><span>Ta med lagren</span></label>
      <div class="v3-rd-st"><span>Förval</span><select data-rlp><option value="">Välj …</option>${Object.entries(L3R_PRESETS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("")}</select></div>
      ${(spec.layers || []).map((l, i) => `<div class="v3-rd-lr"><input type="color" data-rlc="${i}" value="${esc(l.color || "#a8a29e")}" title="Färg"><input type="text" data-rln="${i}" value="${esc(l.name)}" title="Lagrets namn"><input type="number" data-rlt="${i}" value="${l.t}" step="0.01" min="0.01" max="3" title="Tjocklek (m)"><span>m</span><button type="button" data-rlx="${i}" title="Ta bort">✕</button></div>`).join("")}
      <div class="v3-rd-wh"><button type="button" data-rb="addly">＋ Lager</button><label class="v3-rd-n" title="Schakt och fyllning räknas till terrassytan (undersidan av överbyggnaden) i stället för vägens färdiga yta" style="flex:1"><input type="checkbox" data-rle ${spec.layersEarth !== false ? "checked" : ""} style="width:auto"><span>Schakt/fyllning till terrassytan</span></label></div>
    </div>
    </div>
    <div class="v3-rd-tab" data-rtab="kor" ${tab === "kor" ? "" : "hidden"}>
    <div class="v3-rd-drv" title="Lastbilen från Gå-läget kör vägen: nosen följer lutningen, den styr i kurvorna och går långsammare uppför"><button type="button" data-rb="drive" ${r ? "" : "disabled"}>${l3rDrv.on ? "⏸ Pausa" : l3rDrv.s > 0.5 ? "▶ Fortsätt" : "▶ Kör vägen"}</button><button type="button" data-rb="drvreset" title="Tillbaka till start">⏮</button><select data-rv title="Fordon">${typeof L3RT_VEH !== "undefined" ? Object.entries(L3RT_VEH).map(([k, v]) => `<option value="${k}" ${(spec.vehicle || "truck") === k ? "selected" : ""}>${v.label}</option>`).join("") : ""}</select><label title="Fart i km/h på plan väg"><input type="number" data-rk="speed" value="${spec.speed}" min="3" max="60" step="1"> km/h</label><label title="Kameran åker med lastbilen"><input type="checkbox" data-rf ${l3rDrv.follow ? "checked" : ""}> Följ</label><label title="Börja om när lastbilen kommit fram"><input type="checkbox" data-rl ${l3rDrv.loop ? "checked" : ""}> Loop</label><div data-rinfo class="v3-rd-info"></div></div>
    </div>
    <div class="v3-vq-foot"><button type="button" class="primary" data-rb="make" ${r ? "" : "disabled"} title="Väg, slänter, lager och metertal blir vanliga ytor (flytta, ändra, IFC, DXF)">${c.editSet ? "Uppdatera" : "Skapa objekt"}</button><button type="button" data-rb="ifc" ${r ? "" : "disabled"} title="Skapar objekten och sparar dem som IFC i Trimble Connect direkt">⤓ IFC till TC</button><button type="button" data-rb="sect" ${r ? "" : "disabled"} title="Tvärsektion och längdprofil: se väg och slänter mot punktmolnet, färdas längs linjen och exportera som DXF">Tvärsektion</button>
      <details class="v3-rd-more"><summary title="Fler val">⋯</summary><div class="v3-rd-moreb"><label class="v3-rd-n" title="Metertalen (0 m, 10 m, 20 m …) bredvid vägen som 3D-text och ett streck över vägen vid varje meterpunkt – följer med när du skapar objekt eller exporterar IFC"><input type="checkbox" data-rim ${l3Prefs().rdIfcMeters !== false ? "checked" : ""} style="width:auto"><span>Metertal som 3D-text i IFC</span></label><button type="button" data-rb="saveroute" ${r ? "" : "disabled"} title="Spara körvägen i projektet (Kommentarer och mått → Körvägar) för att simulera den och koppla den till tidplanen">💾 Spara körväg</button><button type="button" data-rb="undo" title="Ta bort sista punkten" ${c.pts.length > 2 ? "" : "disabled"}>↶ Ta bort sista punkten</button><button type="button" data-rb="redraw" title="Rita om mittlinjen">Rita om linjen</button><button type="button" data-rb="x">Stäng</button></div></details></div>`;
  l3rXsFold(el);
  const q = s => el.querySelector(s), qa = s => el.querySelectorAll(s), on = (k, fn) => qa(`[data-rb="${k}"]`).forEach(b => { b.onclick = fn; });
  qa("[data-rt]").forEach(b => { b.onclick = () => { l3SetPref("rdTab", b.dataset.rt); l3rPanel(); }; });
  qa("input[data-rk]").forEach(i => { i.oninput = () => { const v = Number(String(i.value).replace(",", ".")); if (Number.isFinite(v) && v >= Number(i.min) && v <= Number(i.max)) { spec[i.dataset.rk] = v; c.saved = false; l3rSchedule(350); } }; i.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") i.blur(); }; });
  qa('input[data-rk][type="checkbox"]').forEach(i => { i.onchange = () => { spec[i.dataset.rk] = i.checked; c.saved = false; if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); l3rPanel(); l3rSchedule(0); }; });
  qa("select[data-rk]").forEach(i => { i.onchange = () => { spec[i.dataset.rk] = i.value; c.saved = false; l3rSchedule(0); }; });
  qa("input[data-rs]").forEach(i => { i.onchange = () => { const k = i.dataset.rs; spec.src = i.checked ? [...new Set([...spec.src, k])] : spec.src.filter(x => x !== k); l3rSchedule(0); }; });
  { const a = q("select[data-ra]"); if (a) a.onchange = () => { spec.anchor = Number(a.value); l3rSchedule(0); }; const cc = q("input[data-rc]"); if (cc) cc.onchange = () => { spec.cap = cc.checked; l3rSchedule(0); }; }
  qa("input[data-rw],select[data-rw]").forEach(i => { const [k, key] = i.dataset.rw.split(":"), z = (spec.widen || [])[Number(k)]; const set = () => { if (!z) return; if (key === "side") z.side = i.value; else { const v = Number(String(i.value).replace(",", ".")); if (Number.isFinite(v)) z[key] = v; } c.saved = false; l3rSchedule(350); }; i.oninput = set; i.onchange = set; i.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") i.blur(); }; });
  { const d = q(".v3-rd-adv"); if (d) d.addEventListener("toggle", () => l3SetPref("rdAdv", d.open)); const hh = q("input[data-radh]"); if (hh) hh.onchange = () => { l3SetPref("rdHandles", hh.checked); l3rwPlace(); }; }
  qa("input[data-ro]").forEach(i => { i.oninput = () => { const z = (spec.widen || [])[Number(i.dataset.ro)], v = Number(String(i.value).replace(",", ".")); if (z && Number.isFinite(v) && v >= 0) { z.offset = v; c.saved = false; l3rSchedule(300); } }; i.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") i.blur(); }; });
  qa("[data-rox]").forEach(b => { b.onclick = () => { spec.widen.splice(Number(b.dataset.rox), 1); c.saved = false; l3rPanel(); l3rSchedule(0); }; });
  qa("[data-rore]").forEach(b => { b.onclick = () => l3rCaptureStart(Number(b.dataset.rore)); });
  on("addobj", () => l3rCaptureStart(-1));
  { const c1 = q("select[data-rps]"); if (c1) c1.onchange = () => { l3road.sel = Number(c1.value); l3rPanel(); l3mHandlesPlace(); };
    const st = q("select[data-rpst]"); if (st) st.onchange = () => { l3SetPref("rdStep", Number(st.value)); };
    const md = q("select[data-rpm]"); if (md) md.onchange = () => { l3SetPref("rdPtMode", md.value); l3rPanel(); };
    [["x", 0], ["y", 1], ["z", 2]].forEach(([k, ax]) => { const i = q(`input[data-rp${k}]`); if (i) { i.onchange = () => { const v = Number(String(i.value).replace(",", ".")); if (Number.isFinite(v)) l3rSetPt(ax, v); }; i.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") i.blur(); }; } });
    qa("[data-rpn]").forEach(b => { b.onclick = () => { const [ax, sg] = [b.dataset.rpn[0], b.dataset.rpn[1] === "+" ? 1 : -1]; l3rNudge(ax, sg, false); }; });
    const g = q("button[data-rpg]"); if (g) g.onclick = () => { const z = c.ctx && c.ctx.gz && c.ctx.gz(c.pts[l3rPtSel(c)][0], c.pts[l3rPtSel(c)][1]); if (z !== null && z !== undefined) l3rSetPt(2, l3rtR3(z)); else l3Status("Marken saknar höjd vid punkten.", true); }; }
  { const lon = q("input[data-rlon]"); if (lon) lon.onchange = () => { spec.layersOn = lon.checked; if (lon.checked && !(spec.layers || []).length) spec.layers = JSON.parse(JSON.stringify(L3R_PRESETS.bygg[1])); c.saved = false; l3rPanel(); l3rSchedule(0); };
    const pr = q("select[data-rlp]"); if (pr) pr.onchange = () => { if (!pr.value) return; l3rApplyPreset(spec, pr.value); c.saved = false; l3rPanel(); l3rSchedule(0); };
    const pr2 = q("select[data-rlp2]"); if (pr2) pr2.onchange = () => { if (pr2.value === "none") { spec.layersOn = false; spec.preset = "none"; } else if (pr2.value === "own") { l3SetPref("rdTab", "over"); } else l3rApplyPreset(spec, pr2.value); c.saved = false; l3rPanel(); l3rSchedule(0); };
    const en = q("input[data-rle]"); if (en) en.onchange = () => { spec.layersEarth = en.checked; c.saved = false; l3rSchedule(0); };
    const dt = q(".v3-rd-ly"); if (dt) dt.addEventListener("toggle", () => l3SetPref("rdLy", dt.open));
    qa("[data-rlc],[data-rln],[data-rlt]").forEach(i => { i.oninput = () => { const k = Object.keys(i.dataset)[0], idx = Number(i.dataset[k]), l = (spec.layers || [])[idx]; if (!l) return; if (k === "rlc") l.color = i.value; else if (k === "rln") l.name = i.value; else { const v = Number(String(i.value).replace(",", ".")); if (Number.isFinite(v) && v > 0) l.t = v; else return; } c.saved = false; l3rSchedule(350); }; i.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") i.blur(); }; });
    qa("[data-rlx]").forEach(b => { b.onclick = () => { spec.layers.splice(Number(b.dataset.rlx), 1); c.saved = false; l3rPanel(); l3rSchedule(0); }; });
    on("addly", () => { (spec.layers = spec.layers || []).push({ name: "Nytt lager", t: 0.2, color: "#a8a29e" }); spec.layersOn = true; c.saved = false; l3rPanel(); l3rSchedule(0); }); }
  qa("[data-rwx]").forEach(b => { b.onclick = () => { spec.widen.splice(Number(b.dataset.rwx), 1); c.saved = false; l3rPanel(); l3rSchedule(0); }; });
  on("addw", () => { const L = c.st ? c.st[c.st.length - 1].s : 40, mid = typeof l3rs !== "undefined" && l3rs.open ? l3rs.s : L / 2; (spec.widen = spec.widen || []).push({ s0: Math.max(0, Math.round(mid - 10)), s1: Math.min(Math.round(L), Math.round(mid + 10)), add: 4, side: "both", taper: 8 }); c.saved = false; l3rPanel(); l3rSchedule(0); });
  qa("[data-rm]").forEach(b => { b.onclick = () => { spec.mode = b.dataset.rm; l3rPanel(); l3rSchedule(0); }; });
  on("x", () => l3roadClose()); on("make", l3roadMake); { const im = q("input[data-rim]"); if (im) im.onchange = () => l3SetPref("rdIfcMeters", im.checked); } on("ifc", async () => { l3roadMake(); if (typeof l3SaveIfc === "function") { try { await l3SaveIfc(); } catch (e) { /* statusraden */ } } }); on("drive", l3rDriveToggle); on("saveroute", () => { if (typeof l3rtSaveRoad === "function") l3rtSaveRoad(c); });
  { const v = q("select[data-rv]"); if (v) v.onchange = () => { spec.vehicle = v.value; l3rDriveEnsure(); if (!l3rDrv.raf) { l3rDriveStep(0); l3Render(); } }; } on("sect", () => { if (typeof l3rsOpen === "function") l3rsOpen(); }); on("drvreset", l3rDriveReset);
  { const f = q("input[data-rf]"); if (f) f.onchange = () => { l3rDrv.follow = f.checked; l3rDrv.prev = null; }; const l = q("input[data-rl]"); if (l) l.onchange = () => { l3rDrv.loop = l.checked; }; }
  on("undo", () => l3roadRemovePt(c.pts.length - 1));
  on("redraw", () => { l3roadClose(true); l3t.mp = null; l3Busy(true); l3t.mpObjs = []; l3Status("Tryck ut vägens mittlinje igen (Enter avslutar)."); });
  void q;
}

/* Liten CSS för panelen (övrigt återanvänder Volym-panelens klasser). */
(function l3rCss() {
  if (document.getElementById("v3RoadCss")) return; const s = document.createElement("style"); s.id = "v3RoadCss";
  s.textContent = `#view3d .v3-meas.v3-rlab{font-size:11px;padding:1px 6px;background:#facc15;color:#1f2937;font-weight:600;transform:translate(-50%,-100%);pointer-events:none}#view3d .v3-meas.v3-rlab.end{background:#eab308}#view3d .v3-meas.v3-rlab.w{background:#f59e0b;color:#1f2937;font-weight:600}#view3d .v3-rwh{position:absolute;z-index:8;transform:translate(-50%,-50%);width:22px;height:22px;padding:0;border:2px solid #fff;border-radius:6px;background:#f59e0b;color:#1f2937;font:700 13px system-ui;cursor:ew-resize;box-shadow:0 1px 6px rgba(0,0,0,.4)}#view3d #v3RoadPanel .v3-rd-adv{margin:6px 0;font-size:12px}#view3d #v3RoadPanel .v3-rd-adv summary{cursor:pointer;color:#475569;font-weight:600}#view3d #v3RoadPanel .v3-vq-foot{flex-wrap:wrap}#view3d .v3-mhandle.sel{background:#f59e0b;border-color:#92400e;transform:translate(-50%,-50%) scale(1.3)}#view3d #v3RoadPanel .v3-rd-pt{margin:6px 0;font-size:12px}#view3d #v3RoadPanel .v3-rd-xyz{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:4px}#view3d #v3RoadPanel .v3-rd-xyz label{display:flex;align-items:center;gap:3px;color:#475569;font-weight:600}#view3d #v3RoadPanel .v3-rd-xyz input{width:100%;min-width:0;padding:2px 3px;border:1px solid #cbd5e1;border-radius:6px;font:inherit}#view3d #v3RoadPanel .v3-rd-st{display:flex;gap:6px;align-items:center;margin-top:4px}#view3d #v3RoadPanel .v3-rd-st select,#view3d #v3RoadPanel .v3-rd-pt select{padding:2px;border:1px solid #cbd5e1;border-radius:6px;font:inherit}#view3d #v3RoadPanel .v3-rd-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:4px}#view3d #v3RoadPanel .v3-rd-pad button,#view3d #v3RoadPanel .v3-rd-gl button{padding:4px 2px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;cursor:pointer;font:inherit}#view3d #v3RoadPanel .v3-rd-gl{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-top:4px;color:#475569}#view3d #v3RoadPanel .v3-rd-lr{display:flex;align-items:center;gap:4px;margin-top:4px}#view3d #v3RoadPanel .v3-rd-lr input[type=text]{flex:1;min-width:0;padding:2px 4px;border:1px solid #cbd5e1;border-radius:6px;font:inherit}#view3d #v3RoadPanel .v3-rd-lr input[type=number]{width:52px;padding:2px 3px;border:1px solid #cbd5e1;border-radius:6px;font:inherit}#view3d #v3RoadPanel .v3-rd-lr input[type=color]{width:22px;height:22px;padding:0;border:0;background:none}#view3d #v3RoadPanel .v3-rd-lr button{border:0;background:none;cursor:pointer}#view3d #v3RoadPanel .v3-rd-lsum{margin:6px 0;padding:6px 8px;border-radius:10px;background:#f1f5f9;font-size:12px}#view3d #v3RoadPanel .v3-rd-lsum div{display:flex;align-items:center;gap:6px;margin-top:2px}#view3d #v3RoadPanel .v3-rd-lsum i{width:10px;height:10px;border-radius:2px}#view3d #v3RoadPanel .v3-rd-lsum span{margin-left:auto;color:#475569}#view3d #v3RoadPanel .v3-rd-mini{display:flex;flex-wrap:wrap;gap:2px 10px;align-items:baseline;margin:4px 0 6px;padding:6px 8px;border-radius:10px;background:#f1f5f9;font-size:12px}#view3d #v3RoadPanel .v3-rd-mini b{font-size:15px;color:#2563eb}#view3d #v3RoadPanel .v3-rd-mini .c{color:#2563eb;font-weight:600}#view3d #v3RoadPanel .v3-rd-mini .f{color:#dc2626;font-weight:600}#view3d #v3RoadPanel .v3-rd-mini .w{color:#b45309;font-weight:700;cursor:default}#view3d #v3RoadPanel .v3-rd-tabs{display:flex;gap:2px;margin:2px 0 6px;border-bottom:1px solid #e2e8f0;overflow-x:auto}#view3d #v3RoadPanel .v3-rd-tabs button{flex:none;padding:5px 8px;border:0;border-bottom:2px solid transparent;background:none;cursor:pointer;font:inherit;font-size:12px;color:#64748b;white-space:nowrap}#view3d #v3RoadPanel .v3-rd-tabs button.on{color:#2563eb;border-bottom-color:#2563eb;font-weight:700}#view3d #v3RoadPanel .v3-rd-tabs em{font-style:normal;font-size:10px;background:#e2e8f0;border-radius:8px;padding:0 5px;margin-left:2px}#view3d #v3RoadPanel .v3-rd-tab[hidden]{display:none}#view3d #v3RoadPanel .v3-rd-more{flex-basis:100%}#view3d #v3RoadPanel .v3-rd-more summary{cursor:pointer;color:#475569;font-size:12px;list-style:none;display:inline-block;padding:2px 8px}#view3d #v3RoadPanel .v3-rd-moreb{display:flex;flex-direction:column;gap:6px;align-items:flex-start;margin-top:6px}#view3d #v3RoadPanel .v3-rd-moreb button{padding:4px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;cursor:pointer;font:inherit}#view3d #v3RoadPanel .v3-rd-g{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;margin:8px 0}#view3d #v3RoadPanel .v3-rd-n{display:flex;align-items:center;gap:4px;font-size:12px}#view3d #v3RoadPanel .v3-rd-n span{flex:1;color:#475569;font-weight:600}#view3d #v3RoadPanel .v3-rd-n input{width:58px;padding:3px 4px;border:1px solid #cbd5e1;border-radius:6px;font:inherit}#view3d #v3RoadPanel .v3-rd-n em{width:16px;font-style:normal;color:#64748b}#view3d #v3RoadPanel .v3-rd-seg{grid-column:1/3;display:flex;gap:4px}#view3d #v3RoadPanel .v3-rd-seg button{flex:1;padding:5px 6px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;cursor:pointer;font:inherit;font-size:12px}#view3d #v3RoadPanel .v3-rd-seg button.on{background:#2563eb;border-color:#2563eb;color:#fff}#view3d #v3RoadPanel .v3-rd-drv{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;margin:8px 0;font-size:12px}#view3d #v3RoadPanel .v3-rd-drv button{padding:5px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;cursor:pointer;font:inherit}#view3d #v3RoadPanel .v3-rd-drv input[type=number]{width:46px;padding:3px;border:1px solid #cbd5e1;border-radius:6px;font:inherit}#view3d #v3RoadPanel .v3-rd-info{flex-basis:100%;color:#475569}#view3d #v3RoadPanel .v3-rd-w{margin:6px 0;font-size:12px}#view3d #v3RoadPanel .v3-rd-wh{display:flex;align-items:center;justify-content:space-between}#view3d #v3RoadPanel .v3-rd-wh button{padding:3px 8px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;cursor:pointer;font:inherit}#view3d #v3RoadPanel .v3-rd-wr{display:flex;flex-wrap:wrap;align-items:center;gap:3px 4px;margin-top:4px;padding:4px 6px;background:#fff7ed;border-radius:8px}#view3d #v3RoadPanel .v3-rd-wr input{width:44px;padding:2px 3px;border:1px solid #cbd5e1;border-radius:6px;font:inherit}#view3d #v3RoadPanel .v3-rd-wr select{padding:2px;border:1px solid #cbd5e1;border-radius:6px;font:inherit}#view3d #v3RoadPanel .v3-rd-wr button{margin-left:auto;border:0;background:none;cursor:pointer}#view3d #v3RoadPanel .v3-rd-src{display:flex;flex-direction:column;gap:2px;margin:6px 0;font-size:12px;max-height:84px;overflow:auto}`;
  document.head.appendChild(s);
})();

/* Ta bort en punkt (högerklick på ringen, eller ↶ för den sista). Minst två punkter ska finnas kvar. */
function l3roadRemovePt(i) {
  const c = l3road.cur; if (!c || c.pts.length <= 2 || i < 0 || i >= c.pts.length) return;
  const was = c.pts.map(p => p.slice());
  c.pts.splice(i, 1); c.geom = null; c.st = null; c.saved = false;
  const set = st => { if (l3road.cur !== c) return; c.pts = st.map(p => p.slice()); c.geom = null; c.st = null; l3rDraw(); l3rSchedule(0); };
  const now = c.pts.map(p => p.slice());
  if (typeof l3VPush === "function") l3VPush(() => set(was), () => set(now), "ta bort vägpunkt");
  l3rDraw(); l3rSchedule(0); l3Status("Punkten borttagen – vägen räknas om (Ctrl+Z ångrar).");
}
document.addEventListener("contextmenu", e => {
  if (!l3road.cur) return; const b = e.target.closest && e.target.closest(".v3-mhandle"); if (!b) return;
  const i = typeof l3mH !== "undefined" ? l3mH.els.indexOf(b) : -1; if (i < 0) return;
  e.preventDefault(); e.stopPropagation(); l3roadRemovePt(i);
}, true);

/* ---- Lastbil som kör vägen (Victor 2026-11-10: "bygg en lastbil som kör vägen") -------------------------------------------------------------------------
   Samma lastbil som i Gå-läget. Den följer vägens höjdprofil (nos upp/ner efter lutningen), styr in i kurvorna, hjulen snurrar med färden och farten
   sjunker i uppförsbackar. "Följ" låter kameran åka med. Fungerar medan byggvägspanelen är öppen och följer vägen när den ändras. */
const l3rDrv = { on: false, s: 0, travel: 0, raf: 0, last: 0, truck: null, grp: null, follow: true, loop: true, v: 0, t: 0, prev: null, steerV: 0 };
let L3R_FRONT = 3.9, L3R_REAR = -2.1;   // framaxel och medel av bakaxlarna (m framför/bakom lastbilens origo)
function l3rAt(st, s) {
  const n = st.length; s = Math.max(0, Math.min(st[n - 1].s, s)); let k = 0; while (k < n - 2 && st[k + 1].s < s) k++;
  const a = st[k], b = st[k + 1], t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2(b.y - a.y, b.x - a.x), g: (b.z - a.z) / (b.s - a.s || 1) };
}
const l3rAng = d => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
function l3rDriveEnsure() {
  const c = l3road.cur, kind = (c && c.spec.vehicle) || "truck", V = typeof l3rtVeh === "function" ? l3rtVeh(kind) : { f: 3.9, r: -2.1, make: () => l3vTruck() };
  L3R_FRONT = V.f; L3R_REAR = V.r;
  if (l3rDrv.truck && l3rDrv.kind === kind) return true;
  if (l3rDrv.grp) { l3.scene.remove(l3rDrv.grp); l3rDrv.grp = null; l3rDrv.truck = null; }   // byte av fordon
  let t; try { t = V.make(); } catch (e) { console.warn("Fordon", e); l3Status("Fordonet finns inte i den här versionen.", true); return false; }
  l3rDrv.kind = kind; l3rDrv.truck = t; const g = new THREE.Group(); g.name = "roadtruck"; g.add(t.g); l3.scene.add(g); l3rDrv.grp = g; l3rDrv.ctl = null; return true;
}
/* Ett steg: flytta fordonet dt sekunder längs vägen. Returnerar texten för avläsningen. */
function l3rDriveStep(dt) {
  const c = l3road.cur, D = l3rDrv; if (!c || !c.st || c.st.length < 2 || !l3rDriveEnsure()) return "";
  const st = c.st, L = st[st.length - 1].s, kind = c.spec.vehicle || "truck", r = l3rtPlace(D, st, kind, dt, Number(c.spec.speed) || 20, D.on, D.loop);
  if (r.ended) { D.on = false; l3rDriveUi(); }
  const [px, py, pz] = r.pos, cur = r.cur;
  if (D.follow && D.prev) { const dx = px - D.prev[0], dy = py - D.prev[1], dz = pz - D.prev[2]; l3.camera.position.x += dx; l3.camera.position.y += dy; l3.camera.position.z += dz; l3.orbit.target.x += dx; l3.orbit.target.y += dy; l3.orbit.target.z += dz; l3.orbit.update(); }
  D.prev = [px, py, pz];
  return `Fart ${l3rFmt(D.v * 3.6, 0)} km/h · lutning ${cur.g >= 0 ? "+" : "−"}${l3rFmt(Math.abs(cur.g) * 100, 1)} % · ${l3rFmt(Math.min(D.s, L), 0)} / ${l3rFmt(L, 0)} m`;
}
function l3rDriveLoop(now) {
  const D = l3rDrv; if (!l3road.cur) { l3rDriveStop(true); return; }
  const dt = Math.min(0.1, D.last ? (now - D.last) / 1000 : 0.016); D.last = now;
  const txt = l3rDriveStep(dt), el = document.querySelector("#v3RoadPanel [data-rinfo]"); if (el && txt) el.textContent = txt;
  l3Render(); D.raf = requestAnimationFrame(l3rDriveLoop);
}
function l3rDriveUi() { const b = document.querySelector('#v3RoadPanel [data-rb="drive"]'); if (b) b.textContent = l3rDrv.on ? "⏸ Pausa" : (l3rDrv.s > 0.5 ? "▶ Fortsätt" : "▶ Kör vägen"); }
function l3rDriveToggle() {
  const D = l3rDrv, c = l3road.cur; if (!c || !c.st) { l3Status("Vänta tills vägen är räknad.", true); return; }
  if (!l3rDriveEnsure()) return;
  D.on = !D.on; if (D.on) { D.last = 0; D.prev = null; if (!D.raf) D.raf = requestAnimationFrame(l3rDriveLoop); l3Status("Lastbilen kör vägen – Följ-rutan låter kameran åka med."); } l3rDriveUi();
  if (!D.raf) { l3rDriveStep(0); l3Render(); }
}
function l3rDriveReset() { const D = l3rDrv; D.s = 0; D.travel = 0; D.prev = null; D.v = 0; if (l3road.cur && l3road.cur.st) { l3rDriveStep(0); l3Render(); } l3rDriveUi(); }
function l3rDriveStop(remove) {
  const D = l3rDrv; D.on = false; cancelAnimationFrame(D.raf); D.raf = 0; D.last = 0; D.prev = null;
  if (remove && D.grp) { l3.scene.remove(D.grp); D.grp = null; D.truck = null; D.s = 0; D.travel = 0; D.v = 0; l3Render(); }
}

/* ---- Avancerat: peka ut objektet ---- */
function l3rCaptureStart(idx) {
  const c = l3road.cur; if (!c) return; l3road.capture = { idx }; l3t.mp = null; l3t.mpObjs = []; l3Busy(true);
  l3Status("Tryck ut objektets hörn i 3D (varje punkt fäster mot ytor). Enter eller första punkten avslutar, Esc avbryter.");
}
function l3rCaptureDone() {
  const c = l3road.cur, cap = l3road.capture, mp = l3t.mp || []; if (!c || !cap) return;
  if (mp.length < 3) { l3Status("Objektet behöver minst tre punkter – fortsätt trycka ut hörnen.", true); return; }
  const pts = mp.map(p => [l3rtR3(p.x + l3.O[0]), l3rtR3(p.y + l3.O[1])]);
  const was = JSON.parse(JSON.stringify(c.spec.widen || [])); c.spec.widen = c.spec.widen || [];
  if (cap.idx >= 0 && c.spec.widen[cap.idx]) { c.spec.widen[cap.idx].pts = pts; delete c.spec.widen[cap.idx]._c; } else c.spec.widen.push({ kind: "obj", pts, offset: 2 });
  l3road.capture = null; l3t.mp = null; l3Busy(false); l3ShowVcb(null); l3Clear(l3.groups.tmp); if (typeof l3ClearMeasure === "function") l3ClearMeasure();
  c.saved = false; const now = JSON.parse(JSON.stringify(c.spec.widen));
  if (typeof l3VPush === "function") { const set = w => { if (l3road.cur !== c) return; c.spec.widen = JSON.parse(JSON.stringify(w)); l3rPanel(); l3rSchedule(0); }; l3VPush(() => set(was), () => set(now), "breddning runt objekt"); }
  l3rPanel(); l3rSchedule(0); l3Status(`Vägen breddas runt objektet (offset ${l3rFmt(c.spec.widen[cap.idx >= 0 ? cap.idx : c.spec.widen.length - 1].offset, 1)} m) – ändra offset i panelen. Ctrl+Z ångrar.`);
}
function l3rCaptureCancel() { l3road.capture = null; l3t.mp = null; l3Busy(false); l3ShowVcb(null); if (l3.groups.tmp) l3Clear(l3.groups.tmp); if (typeof l3ClearMeasure === "function") l3ClearMeasure(); l3Status("Avbrutet."); }

/* ---- Avancerat: dra breddningens start och slut på linjen ---- */
const l3rw = { els: [], drag: null };
function l3rwClear() { l3rw.els.forEach(e => e.remove()); l3rw.els = []; }
function l3rwPlace() {
  const c = l3road.cur, on = !!(c && l3Prefs().rdHandles), host = l3.renderer && l3.renderer.domElement.parentElement;
  const zs = on ? (c.spec.widen || []).map((z, i) => [z, i]).filter(([z]) => z.kind !== "obj" && Number.isFinite(Number(z.s0)) && Number.isFinite(Number(z.s1))) : [];
  const need = zs.length * 2; while (l3rw.els.length > need) l3rw.els.pop().remove();
  while (l3rw.els.length < need) { const b = document.createElement("button"); b.type = "button"; b.className = "v3-rwh"; host.appendChild(b); l3rw.els.push(b); }
  zs.forEach(([z, i], k) => [["s0", "start"], ["s1", "slut"]].forEach(([key, name], j) => {
    const b = l3rw.els[k * 2 + j], a = l3rPosAt(c, Math.max(0, Math.min(l3rLen(c), Number(z[key])))), q = l3ToScreen(new THREE.Vector3(a.x - l3.O[0], a.y - l3.O[1], a.z + 0.4 - l3.O[2]));
    b.dataset.rwz = i; b.dataset.rwk = key; b.title = `Dra – breddningens ${name} (${l3rFmt(Number(z[key]), 1)} m)`; b.textContent = key === "s0" ? "◂" : "▸"; b.style.display = q.behind ? "none" : "block"; b.style.left = q.x + "px"; b.style.top = q.y + "px";
    b.onpointerdown = e => l3rwDown(e, i, key);
  }));
}
const l3rLen = c => c.pts.reduce((a, p, i) => i ? a + Math.hypot(p[0] - c.pts[i - 1][0], p[1] - c.pts[i - 1][1]) : 0, 0);
/* Sträckan på linjen närmast en punkt på skärmen (klientkoordinater). */
function l3rwSAt(cx, cy) {
  const c = l3road.cur, host = l3.renderer.domElement.parentElement, r = host.getBoundingClientRect(), mx = cx - r.left, my = cy - r.top, L = l3rLen(c); let best = 0, bd = Infinity;
  for (let s = 0; s <= L + 1e-6; s += 0.5) { const a = l3rPosAt(c, s), q = l3ToScreen(new THREE.Vector3(a.x - l3.O[0], a.y - l3.O[1], a.z - l3.O[2])); if (q.behind) continue; const d = Math.hypot(q.x - mx, q.y - my); if (d < bd) { bd = d; best = s; } }
  return best;
}
function l3rwMove(i, key, s) {
  const c = l3road.cur, z = c && (c.spec.widen || [])[i]; if (!z) return; s = Math.round(Math.max(0, Math.min(l3rLen(c), s)) * 2) / 2;
  if (key === "s0") z.s0 = Math.min(s, Number(z.s1)); else z.s1 = Math.max(s, Number(z.s0)); c.saved = false; l3rDraw(); l3rSchedule(250);
}
function l3rwDown(e, i, key) {
  const c = l3road.cur; if (!c || e.button !== 0) return; e.preventDefault(); e.stopPropagation();
  const was = JSON.parse(JSON.stringify(c.spec.widen || [])), z = c.spec.widen[i]; l3rw.drag = { i, key };
  const mv = ev => { l3rwMove(i, key, l3rwSAt(ev.clientX, ev.clientY)); l3StatusLive(`Breddningens ${key === "s0" ? "start" : "slut"} ${l3rFmt(Number(z[key]), 1)} m`); };
  const up = () => {
    window.removeEventListener("pointermove", mv, true); window.removeEventListener("pointerup", up, true); window.removeEventListener("pointercancel", up, true); l3rw.drag = null;
    const now = JSON.parse(JSON.stringify(c.spec.widen || [])); if (JSON.stringify(now) === JSON.stringify(was)) return;
    const set = w => { if (l3road.cur !== c) return; c.spec.widen = JSON.parse(JSON.stringify(w)); l3rPanel(); l3rDraw(); l3rSchedule(0); };
    if (typeof l3VPush === "function") l3VPush(() => set(was), () => set(now), "flytta breddning"); l3rPanel(); l3rSchedule(0);
  };
  window.addEventListener("pointermove", mv, true); window.addEventListener("pointerup", up, true); window.addEventListener("pointercancel", up, true);
}

/* ---- Flytta punkt exakt (Victor 2026-11-10: "flytta insättningspunkterna med ett move special-verktyg … på detaljnivå i xyz-led för detaljprojektering") ---- */
const l3rStep = () => { const v = Number(l3Prefs().rdStep); return [0.001, 0.01, 0.1, 1, 5].includes(v) ? v : 0.1; };
const l3rPtMode = () => (l3Prefs().rdPtMode === "lat" ? "lat" : "xyz");
const l3rPtSel = c => { const n = c.pts.length; if (!(l3road.sel >= 0 && l3road.sel < n)) l3road.sel = 0; return l3road.sel; };
const l3rPtVal = (c, ax) => c.pts[l3rPtSel(c)][ax].toFixed(3);
function l3rGround(c) { const p = c.pts[l3rPtSel(c)], z = c.ctx && c.ctx.gz ? c.ctx.gz(p[0], p[1]) : null; return z === null || z === undefined ? `<span>Mark: –</span>` : `<span>Mark ${l3rFmt(z, 3)} · Z−mark ${l3rFmt(p[2] - z, 3)} m</span>`; }
function l3rPtUi() { if (l3road.cur) { l3rPanel(); l3mHandlesPlace(); } }
function l3rPtApply(c, i, np, label) {
  const was = c.pts.map(p => p.slice()); c.pts[i] = np.map(v => l3rtR3(v)); c.geom = null; c.st = null; c.saved = false;
  const set = st => { if (l3road.cur !== c) return; c.pts = st.map(p => p.slice()); c.geom = null; c.st = null; l3rDraw(); l3rSchedule(0); l3rPanel(); }, now = c.pts.map(p => p.slice());
  if (typeof l3VPush === "function") l3VPush(() => set(was), () => set(now), label || "flytta vägpunkt");
  l3rDraw(); l3rSchedule(250); l3rPanel(); l3mHandlesPlace();
}
function l3rSetPt(ax, v) { const c = l3road.cur; if (!c) return; const i = l3rPtSel(c), np = c.pts[i].slice(); np[ax] = v; l3rPtApply(c, i, np, "flytta vägpunkt"); }
/* ax: "x"|"y"|"z", sg ±1, big = Skift (×10). I läget Längs/tvärs är x = tvärs (höger +), y = längs (framåt +), z = höjd. */
function l3rNudge(ax, sg, big) {
  const c = l3road.cur; if (!c) return; const i = l3rPtSel(c), p = c.pts[i], st = l3rStep() * (big ? 10 : 1) * sg, np = p.slice();
  if (ax === "z") np[2] += st;
  else if (l3rPtMode() === "xyz") { if (ax === "x") np[0] += st; else np[1] += st; }
  else { const a = c.pts[Math.max(0, i - 1)], b = c.pts[Math.min(c.pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, tx = dx / L, ty = dy / L;   // längs = tangent, höger = (ty, −tx)
    if (ax === "y") { np[0] += tx * st; np[1] += ty * st; } else { np[0] += ty * st; np[1] += -tx * st; } }
  l3rPtApply(c, i, np, "flytta vägpunkt");
}
window.addEventListener("keydown", e => {
  const c = l3road.cur; if (!c || l3road.capture || (typeof l3rs !== "undefined" && l3rs.open) || /INPUT|SELECT|TEXTAREA/.test((e.target || {}).tagName || "") || e.ctrlKey || e.metaKey || e.altKey) return;
  const m = { ArrowLeft: ["x", -1], ArrowRight: ["x", 1], ArrowUp: ["y", 1], ArrowDown: ["y", -1], PageUp: ["z", 1], PageDown: ["z", -1] }[e.key]; if (!m) return;
  e.preventDefault(); e.stopPropagation(); l3rNudge(m[0], m[1], e.shiftKey);
}, true);

/* Redigera en utförd byggväg igen: hela uppsättningen (samma rset) öppnas med samma punkter och inställningar, originalen döljs tills du trycker Uppdatera (Victor 2026-11-12). */
function l3roadEdit(p) {
  const parts = p && p.rset ? placements.filter(q => q.rset === p.rset && q.rsrc) : []; if (!parts.length) { l3Status("Den här vägen saknar sparade inställningar (skapad före uppdateringen).", true); return; }
  const w = parts[0].rsrc, f = parts.find(q => !q.layerObj) || parts[0], dx = f.x - w.org[0], dy = f.y - w.org[1], dz = f.z - w.org[2];
  const pts = JSON.parse(JSON.stringify(w.pts)).map(q => [q[0] + dx, q[1] + dy, q[2] + dz]), spec = JSON.parse(JSON.stringify(w.spec));
  try { l3SetPref("measure", "road"); l3SetTool("measure"); } catch (e) {}
  const ids = parts.map(q => q.id); l3SelectIds([]); ids.forEach(id => { const g = l3.placeMeshes.get(id); if (g) g.visible = false; });
  l3roadOpen({ pts, spec, res: null, geom: null, st: null, busy: "", err: "", editSet: p.rset, hidden: ids }); l3Status("Redigerar byggvägen: ändra i panelen eller flytta punkterna och tryck Uppdatera. Esc avbryter.");
}
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-redit]"); if (!b) return; e.stopPropagation(); const sel = l3SelList(); if (sel.length) l3roadEdit(sel[0]); }, true);
