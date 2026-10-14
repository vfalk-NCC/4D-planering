/* 3D-vyn – filmens grafik (Victor 2026-10-12: "en liten ruta i snygg tydlig grafik nere i högra hörnet som
   bläddrar igenom aktiva aktiviteter … det ska vara alternativ som jag kan välja att ha eller inte").

   Var och en kan väljas under 4D-planering → Film:
   – Pågår nu (nere till höger): de aktiviteter som pågår, med förlopp; nya glider in, klara får en bock och
     tonas bort, fler än fyra bläddras igenom.
   – Lys upp det som pågår: objekten i 3D som hör till pågående aktiviteter pulserar svagt i statusfärgen.
   – Datumskylt: vecka (rullar som en mätartavla när veckan byts) och datum uppe till vänster.
   – Milstolpar: en rubrik mitt i bilden när filmen passerar en milstolpe (dashboardens milstolpar).
   – Förloppsmätare: hur stor del av projektet som är klar (efter aktiviteternas längd); valbart läget mot baslinjen.
   Grafiken ritas i filmbilden när man spelar in och i ett lager över 3D-vyn när man spelar upp. */

const l3fxOpts = () => { const f = l3plPrefs().film || {}; return { now: f.fxNow !== false, glow: f.fxGlow !== false, date: f.title !== false, miles: f.fxMiles !== false, meter: f.fxMeter !== false, bl: f.fxBl === true, legend: f.fxLegend === true, etab: f.fxEtab !== false, crane: f.fxCrane !== false, signs: f.fxSigns !== false }; };
/* Animeringen för en aktivitet: eget val (aktivitetens namn) eller standarden – från början "color" (bara färgen). */
const l3fxAnimType = a => { const A = (l3plPrefs().film || {}).anim || {}, by = A.by || {}; return by["k:" + a.key] || by[a.name] || A.def || "color"; }; // enskild aktivitet (k:<nyckel>) går före namnet/området
const L3FX_DAY = 86400000;
const l3fxEase = u => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

/* Milstolparna (samma lista som dashboarden). */
let l3fxMiles = null;
function l3fxLoadMiles() {
  if (l3fxMiles) return Promise.resolve(l3fxMiles);
  return ghReadJSON(token, `projects/${encodeURIComponent(projectId)}/plan_milestones.json`).then(a => { l3fxMiles = (Array.isArray(a) ? a : []).filter(m => m && m.name && m.target_date).map(m => ({ name: String(m.name), date: String(m.target_date).slice(0, 10), done: !!m.done })); return l3fxMiles; }).catch(() => (l3fxMiles = []));
}

/* Förberedelse när filmen startar: aktiviteterna, förloppet per dag (nu och baslinjen) och milstolparna. */
async function l3fxStart(from, to) {
  if (l3plFilmSrc() !== "pp") await l3plLoadX(); // Excel-planeringen (eller båda)
  const o = l3fxOpts(), acts = l3plFilmActs().map(a => ({ ...a, t0: l3plDate(a.start).getTime(), t1: l3plDate(a.end).getTime() + L3FX_DAY, b0: a.bl ? l3plDate(a.bl[0]).getTime() : null, b1: a.bl ? l3plDate(a.bl[1]).getTime() + L3FX_DAY : null }));
  const fx = { o, acts, seen: new Map(), gone: [], prev: new Set(), week: null, banner: null, passed: new Set(), glowKey: "", glow: [], miles: [] };
  if (o.miles) { try { fx.miles = (await l3fxLoadMiles()).filter(m => m.date >= from && m.date <= to); } catch (e) { fx.miles = []; } }
  // Förloppet: varje aktivitet väger efter sin längd. Baslinjen jämförs med samma aktiviteter (de som har en).
  const withBl = acts.filter(a => a.b0 != null);
  const W = acts.reduce((s, a) => s + (a.t1 - a.t0), 0) || 1, Wb = withBl.reduce((s, a) => s + (a.b1 - a.b0), 0) || 1;
  const part = (t, s, e) => (t <= s ? 0 : t >= e ? 1 : (t - s) / (e - s));
  fx.prog = t => acts.reduce((s, a) => s + part(t, a.t0, a.t1) * (a.t1 - a.t0), 0) / W;
  fx.progCurBl = t => withBl.reduce((s, a) => s + part(t, a.t0, a.t1) * (a.t1 - a.t0), 0) / (withBl.reduce((s, a) => s + (a.t1 - a.t0), 0) || 1);
  fx.progBl = t => withBl.reduce((s, a) => s + part(t, a.b0, a.b1) * (a.b1 - a.b0), 0) / Wb;
  fx.hasBl = withBl.length > 0;
  // Områdena: hur stor del av områdets alla aktiviteter (efter längd) som är klar.
  fx.areas = new Map();
  acts.forEach(a => { const e = fx.areas.get(a.area) || { acts: [], W: 0 }; e.acts.push(a); e.W += a.t1 - a.t0; fx.areas.set(a.area, e); });
  fx.areaProg = (area, t) => { const e = fx.areas.get(area); return e ? e.acts.reduce((sm, a) => sm + part(t, a.t0, a.t1) * (a.t1 - a.t0), 0) / (e.W || 1) : 0; };
  if (fx.hasBl) { fx.blMin = Math.min(...withBl.map(a => a.b0)); fx.blMax = Math.max(...withBl.map(a => a.b1)); }
  fx.cache = new Map();
  fx.span = Math.max(L3FX_DAY, l3plDate(to).getTime() - l3plDate(from).getTime());
  fx.toasts = []; fx.etabT = null; fx.cranes = new Map();
  fx.anim = acts.map(a => ({ a, type: l3fxAnimType(a), parts: null, ov: [] })).filter(x => x.type !== "color");
  fx.animMeshes = new Set();
  return fx;
}
/* Dagar före (+) eller efter (−) baslinjen: när nådde baslinjen samma förlopp som planen har nu? */
function l3fxAhead(fx, t) {
  if (!fx.hasBl) return null;
  const day = Math.round(t / L3FX_DAY);
  if (fx.cache.has(day)) return fx.cache.get(day);
  const p = fx.progCurBl(t);
  let lo = fx.blMin - 400 * L3FX_DAY, hi = fx.blMax + 400 * L3FX_DAY;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (fx.progBl(m) < p) lo = m; else hi = m; }
  const d = p <= 0 || p >= 1 ? 0 : Math.round((hi - t) / L3FX_DAY);
  fx.cache.set(day, d);
  return d;
}

/* ---- Varje bild ------------------------------------------------------------------------------------- */
/* Före 3D-bilden: pågående aktiviteter (in/ut) och glöden. */
function l3fxFrame(fx, iso, ft, tms) {
  if (!fx) return;
  // Löpande tid (inte avrundad till dagen) – procenten stegar fram jämnt bild för bild.
  const t = fx.t = Number.isFinite(tms) ? tms : l3plDate(iso).getTime() + L3FX_DAY / 2;
  const act = fx.acts.filter(a => a.t0 <= t && a.t1 > t);
  const keys = new Set(act.map(a => a.key));
  act.forEach(a => { if (!fx.seen.has(a.key)) fx.seen.set(a.key, ft); });
  fx.prev.forEach(k => { if (!keys.has(k)) { const a = fx.acts.find(x => x.key === k); if (a && a.t1 <= t) fx.gone.push({ a, at: ft }); fx.seen.delete(k); } });
  fx.gone = fx.gone.filter(g => ft - g.at < 1.4);
  fx.prev = keys; fx.active = act;
  // Veckan rullar fram.
  const wk = l3plWeekNo(l3plDate(iso));
  if (!fx.week) fx.week = { cur: wk, prev: wk, at: -9 };
  else if (fx.week.cur !== wk) fx.week = { cur: wk, prev: fx.week.cur, at: ft };
  // Milstolpe passerad: rubriken visas ~2,6 s.
  fx.miles.forEach(m => { if (m.date <= iso && !fx.passed.has(m.name + m.date)) { fx.passed.add(m.name + m.date); if (ft > 0.05) fx.banner = { m, at: ft }; } });
  if (fx.banner && ft - fx.banner.at > 2.8) fx.banner = null;
  if (fx.o.glow) l3fxGlow(fx, act, iso, ft);
  if (fx.anim.length) l3fxAnimate(fx, t);
  if (fx.o.etab) l3fxEtab(fx, t, ft);
}
/* ---- Etableringen i takt med tidplanen (Victor 2026-10-12) -----------------------------------------------
   – Tonas in och glider ner på plats när den etableras, tonas ut när den avvecklas (i stället för att poppa).
   – Tornkranar: bommen svänger lugnt medan aktiviteter pågår inom kranens räckvidd (eller i projektet om
     aktiviteterna inte är kopplade till modellen).
   – Skylt till vänster när något etableras eller avvecklas: "Tornkran 1 etableras". */
function l3fxActCenter(fx, a) {
  if (a._c !== undefined) return a._c;
  const guids = new Set(a.rows.map(r => String(r.object_id || "")).filter(Boolean)), box = new THREE.Box3(), v = new THREE.Vector3();
  if (guids.size && typeof l3pEnts === "function") l3b.models.forEach(m => { const map = l3pEnts(m); guids.forEach(g => (map.get(g) || []).forEach(e => {
    const r = e.mesh.userData.l3b.ranges[e.ri], pos = e.mesh.geometry.getAttribute("position"); e.mesh.updateMatrixWorld();
    const step = Math.max(1, Math.floor(r.count / 24)); for (let i = r.start; i < r.start + r.count; i += step) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(e.mesh.matrixWorld));
  })); });
  a._c = box.isEmpty() ? null : box.getCenter(new THREE.Vector3());
  return a._c;
}
function l3fxEtab(fx, t, ft) {
  if (typeof placements === "undefined" || !l3 || !l3.placeMeshes) return;
  const fade = Math.max(L3FX_DAY * 0.6, fx.span / 40), ghost = (l3Prefs().etab4d || "ghost") === "ghost", prevT = fx.etabT;
  // Ny dag: 3D-vyn har satt etableringens material på nytt (l3Etab4dAll) – toningen läggs på igen.
  const dayKey = Math.floor(t / L3FX_DAY); if (dayKey !== fx.etabDay) { fx.etabDay = dayKey; placements.forEach(p => { const g = l3.placeMeshes.get(p.id); if (g) delete g.userData.fxF; }); }
  placements.forEach(p => {
    const g = l3.placeMeshes.get(p.id); if (!g) return;
    const s0 = p.start ? l3plDate(p.start).getTime() : null, e0 = p.end ? l3plDate(p.end).getTime() + L3FX_DAY : null;
    if (s0 == null && e0 == null && p.type !== "tornkran") return;
    if (g.userData.fxZ == null) g.userData.fxZ = g.position.z;
    fx.etabTouched = true;
    // Hur mycket objektet "finns" (0–1) med mjuka övergångar vid start och slut.
    const fin = s0 == null ? 1 : Math.max(0, Math.min(1, (t - s0) / fade)), fout = e0 == null ? 1 : Math.max(0, Math.min(1, (e0 - t) / fade)), f = Math.min(fin, fout);
    if (ghost && (s0 != null || e0 != null) && g.userData.fxF !== f) {
      g.userData.fxF = f;
      g.traverse(o => { const m0 = o.userData && o.userData.mat0; if (!o.isMesh || !m0) return; const op = m0.o * (0.18 + 0.82 * l3fxEase(f)); o.material.transparent = op < 0.999 || m0.t; o.material.opacity = op; o.material.depthWrite = f > 0.98 ? m0.d : false; });
      g.position.z = g.userData.fxZ + (1 - l3fxEase(fin)) * 3; // glider ner på plats
    }
    // Skyltar när det etableras / avvecklas.
    if (fx.o.signs && prevT != null) {
      const nm = p.name || (placeLib(p.type) || {}).label || "Etablering";
      if (s0 != null && prevT < s0 && t >= s0) fx.toasts.push({ txt: `${nm} etableras`, col: "#22c55e", at: ft });
      if (e0 != null && prevT < e0 && t >= e0) fx.toasts.push({ txt: `${nm} avvecklas`, col: "#f97316", at: ft });
    }
    // Tornkranens bom svänger när det pågår något inom räckvidden.
    if (fx.o.crane && p.type === "tornkran" && g.children[1]) {
      const R = Number(p.R) || 40, cx = p.x - l3.O[0], cy = p.y - l3.O[1];
      const busy = (fx.active || []).some(a => { const c = l3fxActCenter(fx, a); return !c || Math.hypot(c.x - cx, c.y - cy) <= R + 5; }) && f > 0.98;
      const st = fx.cranes.get(p.id) || { amp: 0, ph: (p.id.length * 1.37) % 6.28, j: g.children[1], j0: g.children[1].rotation.z };
      st.amp += ((busy ? 0.65 : 0) - st.amp) * 0.04; fx.cranes.set(p.id, st);
      st.j.rotation.z = st.j0 + st.amp * Math.sin(ft * 0.45 + st.ph);
    }
  });
  fx.toasts = fx.toasts.filter(x => ft - x.at < 3);
  fx.etabT = t;
}
function l3fxEtabEnd(fx) {
  if (typeof placements === "undefined" || !l3 || !fx.etabTouched) return;
  placements.forEach(p => { const g = l3.placeMeshes.get(p.id); if (!g) return; if (g.userData.fxZ != null) { g.position.z = g.userData.fxZ; delete g.userData.fxZ; } delete g.userData.fxF; });
  (fx.cranes || new Map()).forEach(st => { st.j.rotation.z = st.j0; });
  if (typeof l3Etab4dAll === "function") l3Etab4dAll();
}
/* Skyltarna till vänster (under datumskylten). */
function l3fxToasts(ctx, s, ft, fx, top) {
  let y = top;
  fx.toasts.slice(-4).forEach(x => {
    const u = ft - x.at, a = l3fxEase(u / 0.35) * (1 - l3fxEase((u - 2.4) / 0.6));
    ctx.save(); ctx.globalAlpha = a; ctx.translate((1 - l3fxEase(u / 0.35)) * -30 * s, 0);
    ctx.font = `700 ${Math.round(19 * s)}px system-ui, sans-serif`;
    const w = ctx.measureText(x.txt).width + 62 * s, h = 46 * s;
    ctx.fillStyle = "rgba(15,23,42,.82)"; l3fxRR(ctx, 32 * s, y, w, h, 14 * s); ctx.fill();
    ctx.fillStyle = x.col; ctx.beginPath(); ctx.arc(32 * s + 24 * s, y + h / 2, 7 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillText(x.txt, 32 * s + 42 * s, y + h / 2 + 1 * s);
    ctx.restore();
    y += h + 8 * s;
  });
}
/* ---- Animering av IFC-objekten (växer upp, tonas in, lyfts på plats) ----------------------------------
   Före aktiviteten syns objekten inte; under den ritas en kopia (samma hörn och färger) som animeras medan
   originalet är dolt; efteråt syns originalet som vanligt. */
function l3fxAnimParts(an) {
  const byMesh = new Map(), guids = new Set(an.a.rows.map(r => String(r.object_id || "")).filter(Boolean));
  if (typeof l3pEnts === "function") l3b.models.forEach(m => { if (!m.visible) return; const map = l3pEnts(m); guids.forEach(g => (map.get(g) || []).forEach(e => { if (!byMesh.has(e.mesh)) byMesh.set(e.mesh, []); byMesh.get(e.mesh).push(e.ri); })); });
  an.parts = [...byMesh].map(([mesh, ris]) => {
    const u = mesh.userData.l3b, pos = mesh.geometry.getAttribute("position");
    let z0 = Infinity, z1 = -Infinity;
    ris.forEach(ri => { const r = u.ranges[ri]; for (let i = r.start; i < r.start + r.count; i++) { const z = pos.getZ(i); if (z < z0) z0 = z; if (z > z1) z1 = z; } });
    return { mesh, ris, z0, z1 };
  });
}
function l3fxAnimOverlay(an, pt) {
  const mesh = pt.mesh, src = mesh.userData.l3b.origIdx;
  const rs = pt.ris.map(ri => l3bsIdx(mesh, ri)), n = rs.reduce((sm, r) => sm + r[1], 0); if (!n) return null;
  const idx = new Uint32Array(n); let o = 0; rs.forEach(([st, c]) => { idx.set(src.subarray(st, st + c), o); o += c; });
  const g = new THREE.BufferGeometry(); ["position", "normal", "color"].forEach(k => { const at = mesh.geometry.getAttribute(k); if (at) g.setAttribute(k, at); });
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere();
  const ov = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: an.type === "fade", opacity: 1 }));
  ov.userData.noHit = true; ov.raycast = () => {}; ov.userData.pt = pt; mesh.add(ov);
  return ov;
}
function l3fxAnimate(fx, t) {
  const off = new Map();
  fx.anim.forEach(an => {
    const a = an.a, st = t < a.t0 ? 0 : t < a.t1 ? 1 : 2;
    if (st < 2) { if (!an.parts) l3fxAnimParts(an); an.parts.forEach(pt => { fx.animMeshes.add(pt.mesh); if (!off.has(pt.mesh)) off.set(pt.mesh, new Set()); pt.ris.forEach(ri => off.get(pt.mesh).add(ri)); }); }
    if (st === 1) {
      if (!an.ov.length) an.ov = an.parts.map(pt => l3fxAnimOverlay(an, pt)).filter(Boolean);
      const p = Math.max(0, Math.min(1, (t - a.t0) / (a.t1 - a.t0)));
      an.ov.forEach(ov => {
        const pt = ov.userData.pt;
        if (an.type === "grow") { const k = Math.max(0.02, l3fxEase(p)); ov.scale.z = k; ov.position.z = pt.z0 * (1 - k); }
        else if (an.type === "fade") { ov.material.opacity = 0.08 + 0.92 * l3fxEase(p); ov.material.depthWrite = p > 0.95; }
        else if (an.type === "drop") { const q = l3fxEase(Math.min(1, p / 0.35)), lift = Math.max(4, (pt.z1 - pt.z0) * 2); ov.position.z = (1 - q) * lift; }
      });
    } else if (an.ov.length) { l3fxAnimDrop(an); }
  });
  fx.animMeshes.forEach(mesh => {
    const u = mesh.userData.l3b, want = off.get(mesh) || new Set(), was = u.animOff || new Set();
    if (want.size !== was.size || [...want].some(ri => !was.has(ri))) { u.animOff = want; l3bApplyHidden(mesh); }
  });
}
function l3fxAnimDrop(an) { an.ov.forEach(ov => { if (ov.parent) ov.parent.remove(ov); ov.geometry.attributes = {}; ov.geometry.dispose(); ov.material.dispose(); }); an.ov = []; }
function l3fxGlowClear(fx) { (fx.glow || []).forEach(m => { if (m.parent) m.parent.remove(m); m.geometry.attributes = {}; m.geometry.dispose(); m.material.dispose(); }); fx.glow = []; fx.glowKey = ""; } // de delade hörnen lämnas orörda
/* Pågående aktiviteters objekt (IFC, kopplade via objektens GUID) får ett pulserande lager i statusfärgen. */
function l3fxGlow(fx, act, iso, ft) {
  const key = iso + "|" + act.map(a => a.key).join(",");
  if (key !== fx.glowKey) {
    l3fxGlowClear(fx); fx.glowKey = key;
    if (typeof l3pEnts !== "function" || typeof l3bsIdx !== "function" || !l3b.models.length) return;
    const byMesh = new Map();
    act.forEach(a => {
      const col = phaseColor(zonePhase(a.rows, iso));
      const guids = new Set(a.rows.map(r => String(r.object_id || "")).filter(Boolean));
      l3b.models.forEach(m => { if (!m.visible) return; const map = l3pEnts(m); guids.forEach(g => (map.get(g) || []).forEach(e => { const k = e.mesh.uuid + col; if (!byMesh.has(k)) byMesh.set(k, { mesh: e.mesh, col, ris: [] }); byMesh.get(k).ris.push(e.ri); })); });
    });
    byMesh.forEach(({ mesh, col, ris }) => {
      const src = mesh.userData.l3b && mesh.userData.l3b.origIdx; if (!src) return;
      const rs = ris.map(ri => l3bsIdx(mesh, ri)), n = rs.reduce((s, r) => s + r[1], 0); if (!n) return;
      const idx = new Uint32Array(n); let o = 0; rs.forEach(([st, c]) => { idx.set(src.subarray(st, st + c), o); o += c; });
      const g = new THREE.BufferGeometry(); g.setAttribute("position", mesh.geometry.getAttribute("position")); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere();
      const ov = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      ov.userData.noHit = true; ov.raycast = () => {}; ov.renderOrder = 5; mesh.add(ov); fx.glow.push(ov);
    });
  }
  const k = 0.18 + 0.32 * (0.5 + 0.5 * Math.sin(ft * Math.PI * 2 * 0.7));
  fx.glow.forEach(m => { m.material.opacity = k; });
}
function l3fxEnd(fx) {
  if (!fx) return;
  if (fx.o && fx.o.etab) l3fxEtabEnd(fx);
  (fx.anim || []).forEach(l3fxAnimDrop);
  (fx.animMeshes || new Set()).forEach(mesh => { const u = mesh.userData.l3b; if (u.animOff && u.animOff.size) { u.animOff = new Set(); l3bApplyHidden(mesh); } });
  l3fxGlowClear(fx); const h = document.getElementById("v3FilmHud"); if (h) { h.getContext("2d").clearRect(0, 0, h.width, h.height); h.classList.add("hidden"); } }

/* ---- Grafiken i bilden ---------------------------------------------------------------------------------- */
const l3fxRR = (ctx, x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };
function l3fxDraw(ctx, W, H, iso, ft, fx, caption, pearls) {
  if (!fx) return;
  const s = H / 1080, o = fx.o, t = Number.isFinite(fx.t) ? fx.t : l3plDate(iso).getTime() + L3FX_DAY / 2;
  ctx.save(); ctx.textBaseline = "middle";
  if (o.date) l3fxDate(ctx, s, iso, ft, fx, caption);
  if (o.meter) l3fxMeter(ctx, W, s, t, fx);
  if (o.now) l3fxNow(ctx, W, H, s, iso, ft, fx, pearls, t);
  if (o.legend) l3fxLegend(ctx, H, s, pearls);
  if (o.etab && o.signs && fx.toasts && fx.toasts.length) l3fxToasts(ctx, s, ft, fx, (o.date ? (caption ? 196 : 160) : 32) * s);
  if (o.miles && fx.banner) l3fxBanner(ctx, W, s, ft, fx.banner);
  ctx.restore();
}
/* Datumskylten: VECKA + numret (rullar vid veckobyte) och datumet. */
function l3fxDate(ctx, s, iso, ft, fx, caption) {
  const d = l3plDate(iso), x = 32 * s, y = 32 * s, h = 112 * s, dateTxt = `${d.getUTCDate()} ${L3PL_MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  ctx.font = `600 ${Math.round(30 * s)}px system-ui, -apple-system, Segoe UI, sans-serif`;
  const w = Math.max(250 * s, 150 * s + ctx.measureText(dateTxt).width + 40 * s);
  ctx.fillStyle = "rgba(15,23,42,.78)"; l3fxRR(ctx, x, y, w, h, 18 * s); ctx.fill();
  ctx.fillStyle = "#a5b4fc"; ctx.font = `700 ${Math.round(15 * s)}px system-ui, sans-serif`; ctx.fillText("VECKA", x + 24 * s, y + 26 * s);
  // Numret: det gamla glider upp och ut, det nya in underifrån (0,45 s).
  const u = l3fxEase((ft - fx.week.at) / 0.45), bx = x + 20 * s, by = y + 38 * s, bw = 110 * s, bh = 66 * s;
  ctx.save(); ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
  ctx.font = `800 ${Math.round(62 * s)}px system-ui, sans-serif`; ctx.fillStyle = "#fff";
  if (u < 1) { ctx.globalAlpha = 1 - u; ctx.fillText(String(fx.week.prev), bx + 4 * s, by + bh / 2 - u * bh); }
  ctx.globalAlpha = u; ctx.fillText(String(fx.week.cur), bx + 4 * s, by + bh / 2 + (1 - u) * bh);
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(x + 140 * s, y + 22 * s, 2 * s, h - 44 * s);
  ctx.fillStyle = "#e2e8f0"; ctx.font = `600 ${Math.round(30 * s)}px system-ui, sans-serif`; ctx.fillText(dateTxt, x + 160 * s, y + h / 2 + 2 * s);
  if (caption) { ctx.font = `700 ${Math.round(28 * s)}px system-ui, sans-serif`; ctx.lineWidth = 6 * s; ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.lineJoin = "round"; ctx.strokeText(caption, x + 4 * s, y + h + 34 * s); ctx.fillStyle = "#0f172a"; ctx.fillText(caption, x + 4 * s, y + h + 34 * s); }
}
/* Förloppsmätaren uppe till höger: ring, andel klart och hur många aktiviteter som är klara
   (valbart: dagar före/efter baslinjen). */
function l3fxMeter(ctx, W, s, t, fx) {
  const p = fx.prog(t), ahead = fx.o.bl ? l3fxAhead(fx, t) : null, nDone = fx.acts.filter(a => a.t1 <= t).length;
  const bl = ahead == null ? "" : ahead > 0 ? `${ahead} ${ahead === 1 ? "dag" : "dagar"} före baslinjen` : ahead < 0 ? `${-ahead} ${ahead === -1 ? "dag" : "dagar"} efter baslinjen` : "Enligt baslinjen";
  const sub = `${nDone} av ${fx.acts.length} aktiviteter klara`;
  ctx.font = `600 ${Math.round(16 * s)}px system-ui, sans-serif`; const tw = Math.max(ctx.measureText(sub).width, bl ? ctx.measureText(bl).width : 0);
  const h = (bl ? 134 : 112) * s, w = Math.max(300 * s, 128 * s + tw + 28 * s), x = W - 32 * s - w, y = 32 * s, cx = x + 62 * s, cy = y + h / 2, r = 36 * s;
  ctx.fillStyle = "rgba(15,23,42,.8)"; l3fxRR(ctx, x, y, w, h, 20 * s); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1.5 * s; l3fxRR(ctx, x + 0.75 * s, y + 0.75 * s, w - 1.5 * s, h - 1.5 * s, 20 * s); ctx.stroke();
  // Ringen: spår, fyllning med övertoning och en lysande prick i änden; i mitten en bock när allt är klart.
  ctx.lineCap = "round"; ctx.lineWidth = 9 * s;
  ctx.strokeStyle = "rgba(255,255,255,.1)"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  const a1 = -Math.PI / 2 + Math.PI * 2 * Math.max(0.002, p), g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r); g.addColorStop(0, "#6ee7b7"); g.addColorStop(1, "#16a34a");
  ctx.strokeStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, a1); ctx.stroke();
  ctx.save(); ctx.shadowColor = "rgba(52,211,153,.9)"; ctx.shadowBlur = 14 * s; ctx.fillStyle = "#ecfdf5"; ctx.beginPath(); ctx.arc(cx + r * Math.cos(a1), cy + r * Math.sin(a1), 5.5 * s, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.strokeStyle = p >= 0.999 ? "#4ade80" : "rgba(255,255,255,.55)"; ctx.lineWidth = 4 * s;
  if (p >= 0.999) { ctx.beginPath(); ctx.moveTo(cx - 12 * s, cy); ctx.lineTo(cx - 3 * s, cy + 9 * s); ctx.lineTo(cx + 13 * s, cy - 9 * s); ctx.stroke(); }
  else { ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.beginPath(); ctx.arc(cx, cy, 6 * s, 0, Math.PI * 2); ctx.fill(); }
  const tx = x + 124 * s, top = y + (bl ? 30 : 30) * s;
  ctx.font = `700 ${Math.round(13 * s)}px system-ui, sans-serif`; ctx.fillStyle = "#a5b4fc"; ctx.fillText("PROJEKTET KLART", tx, top);
  ctx.font = `800 ${Math.round(34 * s)}px system-ui, sans-serif`; ctx.fillStyle = "#fff"; ctx.fillText(`${(p * 100).toFixed(1).replace(".", ",")} %`, tx, top + 30 * s);
  ctx.font = `600 ${Math.round(16 * s)}px system-ui, sans-serif`; ctx.fillStyle = "#cbd5e1"; ctx.fillText(sub, tx, top + 60 * s);
  if (bl) { ctx.fillStyle = ahead > 0 ? "#86efac" : ahead < 0 ? "#fca5a5" : "#cbd5e1"; ctx.fillText(bl, tx, top + 84 * s); }
}
/* Pågår nu (Victor 2026-10-12: "743 Krosshall som rubrik, sedan pågående akt. under respektive rubrik … aktens
   text på två rader, så små att alla aktiva får plats"): områdena som rubriker med sitt förlopp och under varje
   rubrik alla pågående aktiviteter – texten utan områdets namn, högst två rader, med en liten stapel. Texten
   krymps tills allt får plats; först om det ändå inte räcker bläddras områdena. */
/* Områdets rubrik: bara sista ledet (Victor 2026-10-12: "ta bort Produktion ur rubrik") – "Produktion / 741 Sektionsfickor"
   → "741 Sektionsfickor". "Excel · " behålls när båda planeringarna visas. */
function l3fxAreaHead(area) {
  const x = String(area || ""), pre = x.startsWith("Excel · ") ? "Excel · " : "", parts = x.slice(pre.length).split(/\s+\/\s+/).map(p => p.trim()).filter(Boolean);
  return pre + (parts.length ? parts[parts.length - 1] : x.slice(pre.length).trim());
}
function l3fxActText(a) {
  let n = String(a.name || "").trim();
  const full = String(a.area || "").replace(/^Excel · /, "").trim(), ar = l3fxAreaHead(full).replace(/^Excel · /, "");
  // Områdesnamnet först på raden tas bort ("743 Krosshall – Bergstag" → "Bergstag"): det står redan i rubriken.
  const esc = x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), code = (ar.match(/^\d+[A-Za-z]?/) || [""])[0];
  const strip = t => {
    let v = String(t || "").trim();
    [full, ar].filter(Boolean).forEach(z => { v = v.replace(new RegExp("^\\s*" + esc(z) + "\\s*[-–—:·,/]?\\s*", "i"), ""); });
    if (code) v = v.replace(new RegExp("^\\s*" + esc(code) + "\\b\\s*[-–—:·,/]?\\s*"), "");
    return v.trim();
  };
  n = strip(n);
  // Det som faktiskt pågår: från Powerproject är aktiviteten ofta bara sammanfattningsraden (= området) och
  // uppgifterna ligger i objektnamnen – de visas, med aktivitetens eget namn först om det säger något mer.
  const same = !n || n.toLowerCase() === ar.toLowerCase() || n.toLowerCase() === full.toLowerCase();
  const objs = (a.objs || []).map(o => strip(o) || o).filter(Boolean);
  const parts = [same ? "" : n, objs.length ? objs.join(", ") : ""].filter(Boolean);
  return parts.length ? parts.join(" – ") : (a.rows && a.rows[0] && a.rows[0].object_name) || a.name;
}
function l3fxWrap(ctx, txt, maxW, lines = 2) {
  const words = String(txt).split(/\s+/).filter(Boolean), out = [];
  let cur = "";
  for (let i = 0; i < words.length; i++) {
    const tryL = cur ? cur + " " + words[i] : words[i];
    if (ctx.measureText(tryL).width <= maxW || !cur) { cur = tryL; continue; }
    out.push(cur); cur = words[i];
    if (out.length === lines - 1) { cur = words.slice(i).join(" "); break; }
  }
  if (cur) out.push(cur);
  const last = out.length - 1;
  if (last >= 0 && ctx.measureText(out[last]).width > maxW) { let t = out[last]; while (t.length > 2 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1); out[last] = t.trim() + "…"; }
  return out.slice(0, lines);
}
function l3fxNow(ctx, W, H, s, iso, ft, fx, pearls, t) {
  // Alla pågående aktiviteter syns hela tiden (Victor 2026-10-12): likadana uppgifter i ett område slås ihop
  // (×3), texten krymps, sedan en rad per uppgift och till sist två eller tre kolumner – ingen bläddring.
  const act = fx.active || [];
  const byArea = new Map();
  act.slice().sort((a, b) => a.t0 - b.t0 || a.name.localeCompare(b.name, "sv")).forEach(a => { if (!byArea.has(a.area)) byArea.set(a.area, { area: a.area, acts: [], done: [] }); byArea.get(a.area).acts.push(a); });
  fx.gone.forEach(g => { if (!byArea.has(g.a.area)) byArea.set(g.a.area, { area: g.a.area, acts: [], done: [], fading: g }); byArea.get(g.a.area).done.push(g); });
  const groups = [...byArea.values()].sort((a, b) => a.area.localeCompare(b.area, "sv", { numeric: true })).map(g => {
    const rows = new Map();
    g.acts.forEach(a => { const tx = l3fxActText(a); if (!rows.has(tx)) rows.set(tx, { tx, acts: [], done: null }); rows.get(tx).acts.push(a); });
    g.done.forEach(d => { const tx = l3fxActText(d.a); if (!rows.has(tx)) rows.set(tx, { tx, acts: [], done: d }); else if (!rows.get(tx).acts.length) rows.get(tx).done = d; });
    return { ...g, rows: [...rows.values()] };
  });
  const bottom = H - (pearls ? 104 : 28) * s, maxH = bottom - 190 * s, gapC = 10 * s, pad = 14 * s;
  const M = k => ({ head: 50 * s, gHead: 46 * s * Math.max(0.7, k), fs: 15 * s * k, lh: 17.5 * s * k, rowPad: 6 * s * k, gap: 7 * s });
  const colW = cols => (cols === 1 ? 520 : cols === 2 ? 420 : 360) * s;
  const lay = (k, lines, cols) => {
    const m = M(k), cw = colW(cols), textW = cw - 2 * pad - 150 * s;
    ctx.font = `600 ${Math.round(m.fs)}px system-ui, sans-serif`;
    const gh = groups.map(g => m.gHead + g.rows.reduce((h, r) => h + Math.max(1, l3fxWrap(ctx, r.tx + (r.acts.length > 1 ? ` ×${r.acts.length}` : ""), textW, lines).length) * m.lh + m.rowPad, 0) + 4 * s);
    // Områdena fördelas på kolumnerna i ordning, så jämnt som möjligt.
    const total = gh.reduce((a, b) => a + b + m.gap, 0), target = total / cols, colsOut = [[]]; let acc = 0;
    gh.forEach((h, gi) => { if (acc > 0 && acc + h / 2 > target && colsOut.length < cols) { colsOut.push([]); acc = 0; } colsOut[colsOut.length - 1].push(gi); acc += h + m.gap; });
    const colH = colsOut.map(c => c.reduce((a, gi) => a + gh[gi] + m.gap, 0));
    return { m, k, lines, cols: colsOut, gh, cw, textW, h: m.head + Math.max(0, ...colH) + 6 * s };
  };
  let L = null;
  for (const [lines, cols] of [[2, 1], [1, 1], [1, 2], [1, 3]]) {
    for (let k = 1; k >= 0.5; k -= 0.05) { const l = lay(k, lines, cols); if (l.h <= maxH) { L = l; break; } }
    if (L) break;
  }
  if (!L) L = lay(0.5, 1, 3);
  const m = L.m, w = L.cols.length * L.cw + (L.cols.length - 1) * gapC, h = groups.length ? L.h : m.head + 40 * s, x = W - 28 * s - w, y = bottom - h;
  ctx.fillStyle = "rgba(15,23,42,.84)"; l3fxRR(ctx, x - 6 * s, y, w + 12 * s, h, 20 * s); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1.5 * s; l3fxRR(ctx, x - 5.25 * s, y + 0.75 * s, w + 10.5 * s, h - 1.5 * s, 20 * s); ctx.stroke();
  ctx.fillStyle = "#22c55e"; ctx.beginPath(); ctx.arc(x + 22 * s, y + 26 * s, 5 * s * (0.8 + 0.2 * Math.sin(ft * 5)), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#a5b4fc"; ctx.font = `700 ${Math.round(15 * s)}px system-ui, sans-serif`; ctx.fillText("PÅGÅR NU", x + 36 * s, y + 27 * s);
  ctx.textAlign = "right"; ctx.fillStyle = "#cbd5e1"; ctx.font = `600 ${Math.round(14 * s)}px system-ui, sans-serif`;
  ctx.fillText(act.length ? `${act.length} ${act.length === 1 ? "aktivitet" : "aktiviteter"} · ${groups.filter(g => g.acts.length).length} områden` : "", x + w - 16 * s, y + 27 * s); ctx.textAlign = "left";
  if (!groups.length) { ctx.fillStyle = "#94a3b8"; ctx.font = `500 ${Math.round(16 * s)}px system-ui, sans-serif`; ctx.fillText("Inga aktiviteter just nu", x + 20 * s, y + m.head + 14 * s); return; }
  L.cols.forEach((col, ci) => {
    let cy = y + m.head;
    const cx0 = x + ci * (L.cw + gapC) - pad + 6 * s;
    col.forEach(gi => {
      const g = groups[gi], gh = L.gh[gi];
      const seen = Math.min(...(g.acts.length ? g.acts.map(a => fx.seen.get(a.key) ?? -9) : [-9]));
      const inA = l3fxEase((ft - seen) / 0.5), outA = g.fading ? 1 - l3fxEase(((ft - g.fading.at) / 1.4 - 0.4) / 0.6) : 1;
      ctx.save(); ctx.globalAlpha *= Math.min(inA, outA); ctx.translate((1 - inA) * 30 * s, 0);
      ctx.fillStyle = "rgba(255,255,255,.05)"; l3fxRR(ctx, cx0 + pad, cy, L.cw - 2 * pad + 4 * s, gh, 12 * s); ctx.fill();
      const ap = fx.areaProg(g.area, t), col = g.acts.length ? phaseColor(zonePhase(g.acts[0].rows, iso)) : "#22c55e";
      ctx.fillStyle = col; l3fxRR(ctx, cx0 + pad, cy, 5 * s, gh, 2.5 * s); ctx.fill();
      const hx = cx0 + pad + 16 * s, hw = L.cw - 2 * pad - 26 * s, hfs = Math.round(19 * s * Math.max(0.75, L.k));
      ctx.font = `800 ${hfs}px system-ui, sans-serif`; ctx.fillStyle = "#fff";
      const ah = l3fxAreaHead(g.area); let an = ah; while (an.length > 3 && ctx.measureText(an).width > hw - 70 * s) an = an.slice(0, -2); if (an !== ah) an = an.trim() + "…";
      ctx.fillText(an, hx, cy + m.gHead * 0.4);
      ctx.textAlign = "right"; ctx.fillText(`${Math.floor(ap * 100)} %`, hx + hw, cy + m.gHead * 0.4); ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,.12)"; l3fxRR(ctx, hx, cy + m.gHead * 0.74, hw, 5 * s, 2.5 * s); ctx.fill();
      ctx.fillStyle = col; l3fxRR(ctx, hx, cy + m.gHead * 0.74, Math.max(5 * s, hw * ap), 5 * s, 2.5 * s); ctx.fill();
      let ry = cy + m.gHead + 2 * s;
      g.rows.forEach(r => {
        const done = !r.acts.length && r.done, list = r.acts.length ? r.acts : [r.done.a];
        const p = done ? 1 : list.reduce((sm, a) => sm + Math.max(0, Math.min(1, (t - a.t0) / (a.t1 - a.t0))), 0) / list.length;
        const rc = done ? "#22c55e" : phaseColor(zonePhase(list[0].rows, iso));
        ctx.font = `600 ${Math.round(m.fs)}px system-ui, sans-serif`;
        const lines = l3fxWrap(ctx, r.tx + (r.acts.length > 1 ? ` ×${r.acts.length}` : ""), L.textW, L.lines), rh = lines.length * m.lh;
        ctx.save(); if (done) ctx.globalAlpha *= 1 - l3fxEase(((ft - r.done.at) / 1.4 - 0.4) / 0.6);
        ctx.fillStyle = rc; ctx.beginPath(); ctx.arc(hx + 4 * s, ry + m.lh / 2, Math.max(2.5 * s, 4.5 * s * L.k), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#e2e8f0"; lines.forEach((ln, li) => ctx.fillText(ln, hx + 14 * s, ry + m.lh / 2 + li * m.lh));
        const sbw = 64 * s, sbx = hx + hw - sbw - 48 * s, by = ry + rh / 2 - 2.5 * s;
        ctx.fillStyle = "rgba(255,255,255,.12)"; l3fxRR(ctx, sbx, by, sbw, 5 * s, 2.5 * s); ctx.fill();
        ctx.fillStyle = rc; l3fxRR(ctx, sbx, by, Math.max(5 * s, sbw * p), 5 * s, 2.5 * s); ctx.fill();
        ctx.textAlign = "right"; ctx.fillStyle = done ? "#86efac" : "#cbd5e1"; ctx.font = `700 ${Math.round(Math.max(11 * s, m.fs))}px system-ui, sans-serif`;
        ctx.fillText(done ? "Klar" : `${Math.floor(p * 100)} %`, hx + hw, ry + rh / 2 + 1 * s); ctx.textAlign = "left";
        ctx.restore();
        ry += rh + m.rowPad;
      });
      ctx.restore();
      cy += gh + m.gap;
    });
  });
}
/* Milstolpen: ett kort högt upp mitt i bilden – glider ner och tonas in, ljusskimmer över, tonas ut. */
function l3fxBanner(ctx, W, s, ft, b) {
  const u = ft - b.at, inn = l3fxEase(u / 0.45), a = inn * (1 - l3fxEase((u - 2.3) / 0.5));
  const d = l3plDate(b.m.date), sub = `MILSTOLPE · ${d.getUTCDate()} ${L3PL_MON[d.getUTCMonth()].toUpperCase()} ${d.getUTCFullYear()}`;
  ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, 150 * s - (1 - inn) * 24 * s);
  ctx.font = `800 ${Math.round(46 * s)}px system-ui, sans-serif`;
  const tw = ctx.measureText(b.m.name).width, w = Math.max(tw + 190 * s, 460 * s), h = 118 * s;
  ctx.shadowColor = "rgba(15,23,42,.35)"; ctx.shadowBlur = 30 * s; ctx.shadowOffsetY = 10 * s;
  ctx.fillStyle = "rgba(15,23,42,.9)"; l3fxRR(ctx, -w / 2, -h / 2, w, h, 22 * s); ctx.fill();
  ctx.shadowColor = "transparent";
  // Kant och skimmer i lila.
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0); g.addColorStop(0, "#6d5efc"); g.addColorStop(1, "#c084fc");
  ctx.strokeStyle = g; ctx.lineWidth = 2.5 * s; l3fxRR(ctx, -w / 2, -h / 2, w, h, 22 * s); ctx.stroke();
  ctx.save(); l3fxRR(ctx, -w / 2, -h / 2, w, h, 22 * s); ctx.clip();
  const sx = -w / 2 + (w + 300 * s) * l3fxEase((u - 0.2) / 1.1) - 150 * s, sh = ctx.createLinearGradient(sx - 90 * s, 0, sx + 90 * s, 0);
  sh.addColorStop(0, "rgba(255,255,255,0)"); sh.addColorStop(0.5, "rgba(255,255,255,.12)"); sh.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sh; ctx.fillRect(-w / 2, -h / 2, w, h); ctx.restore();
  // Ikonen: en ruter i en lysande cirkel.
  const ix = -w / 2 + 62 * s; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ix, 0, 32 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.save(); ctx.translate(ix, 0); ctx.rotate(Math.PI / 4); const k = 12 * s * (0.9 + 0.1 * Math.sin(u * 6)); ctx.fillRect(-k, -k, 2 * k, 2 * k); ctx.restore();
  ctx.textAlign = "left"; ctx.fillStyle = "#c4b5fd"; ctx.font = `700 ${Math.round(15 * s)}px system-ui, sans-serif`; ctx.fillText(sub, ix + 52 * s, -24 * s);
  ctx.fillStyle = "#fff"; ctx.font = `800 ${Math.round(46 * s)}px system-ui, sans-serif`; ctx.fillText(b.m.name, ix + 50 * s, 16 * s);
  ctx.restore();
}
/* Statusförklaringen nere till vänster: vad färgerna betyder. */
function l3fxLegend(ctx, H, s, pearls) {
  const rows = [["klar", "Klar"], ["pagaende", "Pågår"], ["forsenad", "Försenad"], ["planerad", "Ej startad"]];
  const w = 210 * s, rh = 32 * s, h = 46 * s + rows.length * rh, x = 32 * s, y = H - (pearls ? 104 : 28) * s - h;
  ctx.save(); ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(15,23,42,.8)"; l3fxRR(ctx, x, y, w, h, 18 * s); ctx.fill();
  ctx.fillStyle = "#a5b4fc"; ctx.font = `700 ${Math.round(14 * s)}px system-ui, sans-serif`; ctx.fillText("STATUS", x + 22 * s, y + 25 * s);
  rows.forEach(([k, t], i) => {
    const ry = y + 46 * s + i * rh + rh / 2 - 4 * s;
    ctx.fillStyle = phaseColor(k); l3fxRR(ctx, x + 22 * s, ry - 9 * s, 18 * s, 18 * s, 5 * s); ctx.fill();
    ctx.fillStyle = "#e2e8f0"; ctx.font = `600 ${Math.round(18 * s)}px system-ui, sans-serif`; ctx.fillText(t, x + 52 * s, ry + 1 * s);
  });
  ctx.restore();
}
/* Uppspelning i 3D-vyn: grafiken i ett lager ovanpå (samma ritning som i filmen). */
function l3fxHud(fx, iso, ft, caption) {
  const host = document.getElementById("v3Canvas"); if (!host || !fx) return;
  let c = document.getElementById("v3FilmHud");
  if (!c) { c = document.createElement("canvas"); c.id = "v3FilmHud"; c.className = "v3-filmhud"; host.appendChild(c); }
  c.classList.remove("hidden");
  const r = l3.renderer.domElement.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; c.style.width = r.width + "px"; c.style.height = r.height + "px"; }
  const ctx = c.getContext("2d"); ctx.clearRect(0, 0, W, H);
  l3fxDraw(ctx, W, H, iso, ft, fx, caption, typeof l3fsOn === "function" && l3fsOn()); // filmens tidslinje under: rutan står ovanför
}
