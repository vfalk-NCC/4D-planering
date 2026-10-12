/* 3D-vyn – filmens grafik (Victor 2026-10-12: "en liten ruta i snygg tydlig grafik nere i högra hörnet som
   bläddrar igenom aktiva aktiviteter … det ska vara alternativ som jag kan välja att ha eller inte").

   Var och en kan väljas under 4D-planering → Film:
   – Pågår nu (nere till höger): de aktiviteter som pågår, med förlopp; nya glider in, klara får en bock och
     tonas bort, fler än fyra bläddras igenom.
   – Lys upp det som pågår: objekten i 3D som hör till pågående aktiviteter pulserar svagt i statusfärgen.
   – Datumskylt: vecka (rullar som en mätartavla när veckan byts) och datum uppe till vänster.
   – Milstolpar: en rubrik mitt i bilden när filmen passerar en milstolpe (dashboardens milstolpar).
   – Förloppsmätare: hur stor del av projektet som är klar (efter aktiviteternas längd) och läget mot baslinjen.
   Grafiken ritas i filmbilden när man spelar in och i ett lager över 3D-vyn när man spelar upp. */

const l3fxOpts = () => { const f = l3plPrefs().film || {}; return { now: f.fxNow !== false, glow: f.fxGlow !== false, date: f.title !== false, miles: f.fxMiles !== false, meter: f.fxMeter !== false }; };
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
  const o = l3fxOpts(), acts = l3plActs().map(a => ({ ...a, t0: l3plDate(a.start).getTime(), t1: l3plDate(a.end).getTime() + L3FX_DAY, b0: a.bl ? l3plDate(a.bl[0]).getTime() : null, b1: a.bl ? l3plDate(a.bl[1]).getTime() + L3FX_DAY : null }));
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
  if (fx.hasBl) { fx.blMin = Math.min(...withBl.map(a => a.b0)); fx.blMax = Math.max(...withBl.map(a => a.b1)); }
  fx.cache = new Map();
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
function l3fxFrame(fx, iso, ft) {
  if (!fx) return;
  const t = l3plDate(iso).getTime() + L3FX_DAY / 2;
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
}
function l3fxGlowClear(fx) { (fx.glow || []).forEach(m => { if (m.parent) m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); }); fx.glow = []; fx.glowKey = ""; }
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
function l3fxEnd(fx) { if (!fx) return; l3fxGlowClear(fx); const h = document.getElementById("v3FilmHud"); if (h) { h.getContext("2d").clearRect(0, 0, h.width, h.height); h.classList.add("hidden"); } }

/* ---- Grafiken i bilden ---------------------------------------------------------------------------------- */
const l3fxRR = (ctx, x, y, w, h, r) => { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); };
function l3fxDraw(ctx, W, H, iso, ft, fx, caption, pearls) {
  if (!fx) return;
  const s = H / 1080, o = fx.o, t = l3plDate(iso).getTime() + L3FX_DAY / 2;
  ctx.save(); ctx.textBaseline = "middle";
  if (o.date) l3fxDate(ctx, s, iso, ft, fx, caption);
  if (o.meter) l3fxMeter(ctx, W, s, t, fx);
  if (o.now) l3fxNow(ctx, W, H, s, iso, ft, fx, pearls);
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
/* Förloppsmätaren uppe till höger: ring med procent och läget mot baslinjen. */
function l3fxMeter(ctx, W, s, t, fx) {
  const p = fx.prog(t), ahead = l3fxAhead(fx, t);
  const txt = ahead == null ? "" : ahead > 0 ? `${ahead} ${ahead === 1 ? "dag" : "dagar"} före baslinjen` : ahead < 0 ? `${-ahead} ${ahead === -1 ? "dag" : "dagar"} efter baslinjen` : "Enligt baslinjen";
  ctx.font = `600 ${Math.round(19 * s)}px system-ui, sans-serif`; const tw = ctx.measureText(txt).width;
  ctx.font = `700 ${Math.round(24 * s)}px system-ui, sans-serif`; const hw = ctx.measureText("Projektet klart").width;
  const w = Math.max(300 * s, 112 * s + Math.max(tw, hw) + 28 * s), h = 112 * s, x = W - 32 * s - w, y = 32 * s, cx = x + 58 * s, cy = y + h / 2, r = 38 * s;
  ctx.fillStyle = "rgba(15,23,42,.78)"; l3fxRR(ctx, x, y, w, h, 18 * s); ctx.fill();
  ctx.lineWidth = 9 * s; ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "#22c55e"; ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, p)); ctx.stroke();
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = `800 ${Math.round(24 * s)}px system-ui, sans-serif`; ctx.fillText(`${Math.round(p * 100)}%`, cx, cy + 1 * s);
  ctx.textAlign = "left";
  ctx.font = `700 ${Math.round(24 * s)}px system-ui, sans-serif`; ctx.fillStyle = "#fff"; ctx.fillText("Projektet klart", x + 112 * s, y + (ahead == null ? h / 2 : 40 * s));
  if (ahead != null) {
    ctx.font = `600 ${Math.round(19 * s)}px system-ui, sans-serif`; ctx.fillStyle = ahead > 0 ? "#86efac" : ahead < 0 ? "#fca5a5" : "#cbd5e1"; ctx.fillText(txt, x + 112 * s, y + 76 * s);
  }
}
/* Pågår nu: kort nere till höger. */
function l3fxNow(ctx, W, H, s, iso, ft, fx, pearls) {
  const t = l3plDate(iso).getTime() + L3FX_DAY / 2, act = (fx.active || []).slice().sort((a, b) => b.t0 - a.t0 || a.name.localeCompare(b.name, "sv"));
  const per = 4, pages = Math.max(1, Math.ceil(act.length / per)), page = pages > 1 ? Math.floor(ft / 3.2) % pages : 0;
  const show = act.slice(page * per, page * per + per), gone = fx.gone.slice(-2);
  const rowH = 64 * s, w = 540 * s, head = 58 * s, rows = Math.max(1, show.length + gone.length), h = head + rows * rowH + 14 * s;
  const x = W - 32 * s - w, y = H - (pearls ? 172 : 32) * s - h;
  ctx.fillStyle = "rgba(15,23,42,.8)"; l3fxRR(ctx, x, y, w, h, 18 * s); ctx.fill();
  ctx.fillStyle = "#a5b4fc"; ctx.font = `700 ${Math.round(16 * s)}px system-ui, sans-serif`; ctx.fillText("PÅGÅR NU", x + 24 * s, y + 31 * s);
  ctx.fillStyle = "#e2e8f0"; ctx.font = `600 ${Math.round(16 * s)}px system-ui, sans-serif`; ctx.textAlign = "right";
  ctx.fillText(act.length ? `${act.length} ${act.length === 1 ? "aktivitet" : "aktiviteter"}${pages > 1 ? ` · ${page + 1}/${pages}` : ""}` : "Inget pågår", x + w - 24 * s, y + 31 * s); ctx.textAlign = "left";
  const row = (a, i, alpha, dx, done) => {
    const ry = y + head + i * rowH, col = done ? "#22c55e" : phaseColor(zonePhase(a.rows, iso)), p = done ? 1 : Math.max(0, Math.min(1, (t - a.t0) / (a.t1 - a.t0)));
    ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(dx, 0);
    ctx.fillStyle = "rgba(255,255,255,.06)"; l3fxRR(ctx, x + 14 * s, ry, w - 28 * s, rowH - 8 * s, 12 * s); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x + 36 * s, ry + 22 * s, 8 * s, 0, Math.PI * 2); ctx.fill();
    if (done) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.6 * s; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(x + 32 * s, ry + 22 * s); ctx.lineTo(x + 35 * s, ry + 25.5 * s); ctx.lineTo(x + 40.5 * s, ry + 18.5 * s); ctx.stroke(); }
    ctx.fillStyle = "#fff"; ctx.font = `700 ${Math.round(20 * s)}px system-ui, sans-serif`;
    const name = a.name, maxW = w - 170 * s; let nm = name; while (nm.length > 3 && ctx.measureText(nm).width > maxW) nm = nm.slice(0, -2); if (nm !== name) nm = nm.trim() + "…";
    ctx.fillText(nm, x + 54 * s, ry + 21 * s);
    ctx.textAlign = "right"; ctx.fillStyle = done ? "#86efac" : "#cbd5e1"; ctx.font = `700 ${Math.round(18 * s)}px system-ui, sans-serif`; ctx.fillText(done ? "Klar" : `${Math.round(p * 100)} %`, x + w - 30 * s, ry + 21 * s); ctx.textAlign = "left";
    const bx = x + 54 * s, bw = w - 84 * s, byy = ry + 38 * s;
    ctx.fillStyle = "rgba(255,255,255,.12)"; l3fxRR(ctx, bx, byy, bw, 7 * s, 3.5 * s); ctx.fill();
    ctx.fillStyle = col; l3fxRR(ctx, bx, byy, Math.max(7 * s, bw * p), 7 * s, 3.5 * s); ctx.fill();
    ctx.restore();
  };
  show.forEach((a, i) => { const e = l3fxEase((ft - (fx.seen.get(a.key) ?? -9)) / 0.5); row(a, i, e, (1 - e) * 40 * s, false); });
  gone.forEach((g, j) => { const u = (ft - g.at) / 1.4; row(g.a, show.length + j, 1 - l3fxEase((u - 0.4) / 0.6), 0, true); });
  if (!show.length && !gone.length) { ctx.fillStyle = "#94a3b8"; ctx.font = `500 ${Math.round(18 * s)}px system-ui, sans-serif`; ctx.fillText("Inga aktiviteter just den här dagen", x + 28 * s, y + head + 22 * s); }
}
/* Milstolpen: en rubrik mitt i bilden som tonas in och ut. */
function l3fxBanner(ctx, W, s, ft, b) {
  const u = ft - b.at, a = l3fxEase(u / 0.35) * (1 - l3fxEase((u - 2.3) / 0.5)), sc = 0.92 + 0.08 * l3fxEase(u / 0.35);
  const d = l3plDate(b.m.date), sub = `Milstolpe · ${d.getUTCDate()} ${L3PL_MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, 220 * s); ctx.scale(sc, sc);
  ctx.font = `800 ${Math.round(52 * s)}px system-ui, sans-serif`;
  const tw = ctx.measureText(b.m.name).width, w = Math.max(tw + 150 * s, 420 * s), h = 130 * s;
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0); g.addColorStop(0, "#6d5efc"); g.addColorStop(1, "#9b7bff");
  ctx.fillStyle = g; l3fxRR(ctx, -w / 2, -h / 2, w, h, 24 * s); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.textAlign = "center";
  ctx.font = `700 ${Math.round(18 * s)}px system-ui, sans-serif`; ctx.globalAlpha = a * 0.85; ctx.fillText(`◆  ${sub.toUpperCase()}`, 0, -30 * s);
  ctx.globalAlpha = a; ctx.font = `800 ${Math.round(52 * s)}px system-ui, sans-serif`; ctx.fillText(b.m.name, 0, 18 * s);
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
