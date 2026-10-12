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

const l3fxOpts = () => { const f = l3plPrefs().film || {}; return { now: f.fxNow !== false, glow: f.fxGlow !== false, date: f.title !== false, miles: f.fxMiles !== false, meter: f.fxMeter !== false, bl: f.fxBl === true }; };
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
  const s = H / 1080, o = fx.o, t = Number.isFinite(fx.t) ? fx.t : l3plDate(iso).getTime() + L3FX_DAY / 2;
  ctx.save(); ctx.textBaseline = "middle";
  if (o.date) l3fxDate(ctx, s, iso, ft, fx, caption);
  if (o.meter) l3fxMeter(ctx, W, s, t, fx);
  if (o.now) l3fxNow(ctx, W, H, s, iso, ft, fx, pearls, t);
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
/* Pågår nu: kort nere till höger, per område – rubrik med områdets förlopp och under den aktiviteterna som
   betas av, var och en med en liten förloppsstapel. Procenten följer tiden bild för bild. */
function l3fxNow(ctx, W, H, s, iso, ft, fx, pearls, t) {
  const act = fx.active || [], fit = (txt, maxW) => { let n = txt; while (n.length > 3 && ctx.measureText(n).width > maxW) n = n.slice(0, -2); return n === txt ? n : n.trim() + "…"; };
  // Områden: de som har något pågående, plus de där något just blev klart.
  const byArea = new Map();
  act.slice().sort((a, b) => b.t0 - a.t0).forEach(a => { if (!byArea.has(a.area)) byArea.set(a.area, { area: a.area, acts: [], done: [] }); byArea.get(a.area).acts.push(a); });
  fx.gone.forEach(g => { if (!byArea.has(g.a.area)) byArea.set(g.a.area, { area: g.a.area, acts: [], done: [], fading: g }); byArea.get(g.a.area).done.push(g); });
  const groups = [...byArea.values()].sort((a, b) => b.acts.length - a.acts.length || a.area.localeCompare(b.area, "sv"));
  const per = 3, pages = Math.max(1, Math.ceil(groups.length / per)), page = pages > 1 ? Math.floor(ft / 3.5) % pages : 0;
  const show = groups.slice(page * per, page * per + per).map(g => ({ ...g, rows: [...g.acts.slice(0, 2).map(a => ({ a })), ...g.done.slice(-1).map(d => ({ a: d.a, done: d }))], more: Math.max(0, g.acts.length - 2) }));
  const w = 560 * s, head = 54 * s, gH = 62 * s, rH = 40 * s, pad = 14 * s;
  const h = head + show.reduce((sm, g) => sm + gH + g.rows.length * rH + (g.more ? 24 * s : 0) + 10 * s, 0) + (show.length ? 4 * s : 46 * s);
  const x = W - 28 * s - w, y = H - (pearls ? 132 : 28) * s - h;
  ctx.fillStyle = "rgba(15,23,42,.84)"; l3fxRR(ctx, x, y, w, h, 20 * s); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.08)"; ctx.lineWidth = 1.5 * s; l3fxRR(ctx, x + 0.75 * s, y + 0.75 * s, w - 1.5 * s, h - 1.5 * s, 20 * s); ctx.stroke();
  // Huvud: PÅGÅR NU · antal, sida.
  ctx.fillStyle = "#22c55e"; ctx.beginPath(); ctx.arc(x + 28 * s, y + 28 * s, 5 * s * (0.8 + 0.2 * Math.sin(ft * 5)), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#a5b4fc"; ctx.font = `700 ${Math.round(15 * s)}px system-ui, sans-serif`; ctx.fillText("PÅGÅR NU", x + 42 * s, y + 29 * s);
  ctx.textAlign = "right"; ctx.fillStyle = "#cbd5e1"; ctx.font = `600 ${Math.round(15 * s)}px system-ui, sans-serif`;
  ctx.fillText(act.length ? `${act.length} ${act.length === 1 ? "aktivitet" : "aktiviteter"} · ${groups.length} ${groups.length === 1 ? "område" : "områden"}${pages > 1 ? `  ${page + 1}/${pages}` : ""}` : "", x + w - 24 * s, y + 29 * s); ctx.textAlign = "left";
  if (!show.length) { ctx.fillStyle = "#94a3b8"; ctx.font = `500 ${Math.round(17 * s)}px system-ui, sans-serif`; ctx.fillText("Inga aktiviteter just nu", x + 26 * s, y + head + 18 * s); return; }
  let cy = y + head;
  show.forEach(g => {
    const seen = Math.min(...(g.acts.length ? g.acts.map(a => fx.seen.get(a.key) ?? -9) : [-9]));
    const inA = l3fxEase((ft - seen) / 0.5), outA = g.fading ? 1 - l3fxEase(((ft - g.fading.at) / 1.4 - 0.4) / 0.6) : 1, al = Math.min(inA, outA);
    const gh = gH + g.rows.length * rH + (g.more ? 24 * s : 0);
    ctx.save(); ctx.globalAlpha *= al; ctx.translate((1 - inA) * 40 * s, 0);
    ctx.fillStyle = "rgba(255,255,255,.05)"; l3fxRR(ctx, x + pad, cy, w - 2 * pad, gh, 14 * s); ctx.fill();
    // Rubrik: området och dess förlopp.
    const ap = fx.areaProg(g.area, t), col = g.acts.length ? phaseColor(zonePhase(g.acts[0].rows, iso)) : "#22c55e";
    ctx.fillStyle = col; l3fxRR(ctx, x + pad, cy, 5 * s, gh, 2.5 * s); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = `800 ${Math.round(22 * s)}px system-ui, sans-serif`; ctx.fillText(fit(g.area, w - 190 * s), x + pad + 20 * s, cy + 22 * s);
    ctx.textAlign = "right"; ctx.font = `800 ${Math.round(22 * s)}px system-ui, sans-serif`; ctx.fillText(`${Math.floor(ap * 100)} %`, x + w - pad - 18 * s, cy + 22 * s); ctx.textAlign = "left";
    const bx = x + pad + 20 * s, bw = w - 2 * pad - 38 * s;
    ctx.fillStyle = "rgba(255,255,255,.12)"; l3fxRR(ctx, bx, cy + 40 * s, bw, 8 * s, 4 * s); ctx.fill();
    ctx.fillStyle = col; l3fxRR(ctx, bx, cy + 40 * s, Math.max(8 * s, bw * ap), 8 * s, 4 * s); ctx.fill();
    // Aktiviteterna som betas av (liten text, liten stapel).
    let ry = cy + gH;
    g.rows.forEach(({ a, done }) => {
      const p = done ? 1 : Math.max(0, Math.min(1, (t - a.t0) / (a.t1 - a.t0))), rc = done ? "#22c55e" : phaseColor(zonePhase(a.rows, iso));
      ctx.save(); if (done) ctx.globalAlpha *= 1 - l3fxEase(((ft - done.at) / 1.4 - 0.4) / 0.6);
      ctx.fillStyle = rc; ctx.beginPath(); ctx.arc(bx + 6 * s, ry + 11 * s, 5 * s, 0, Math.PI * 2); ctx.fill();
      if (done) { ctx.strokeStyle = "#0f172a"; ctx.lineWidth = 2 * s; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(bx + 3.5 * s, ry + 11 * s); ctx.lineTo(bx + 5.5 * s, ry + 13.5 * s); ctx.lineTo(bx + 9 * s, ry + 8.5 * s); ctx.stroke(); }
      ctx.font = `600 ${Math.round(16 * s)}px system-ui, sans-serif`; ctx.fillStyle = "#e2e8f0";
      const nm = a.objs && a.objs.length ? `${a.name} · ${a.objs.slice(0, 2).join(", ")}${a.objs.length > 2 ? " +" + (a.objs.length - 2) : ""}` : a.name;
      ctx.fillText(fit(nm, bw - 150 * s), bx + 18 * s, ry + 11 * s);
      const sbx = bx + bw - 120 * s, sbw = 72 * s;
      ctx.fillStyle = "rgba(255,255,255,.12)"; l3fxRR(ctx, sbx, ry + 8 * s, sbw, 6 * s, 3 * s); ctx.fill();
      ctx.fillStyle = rc; l3fxRR(ctx, sbx, ry + 8 * s, Math.max(6 * s, sbw * p), 6 * s, 3 * s); ctx.fill();
      ctx.textAlign = "right"; ctx.font = `700 ${Math.round(15 * s)}px system-ui, sans-serif`; ctx.fillStyle = done ? "#86efac" : "#cbd5e1"; ctx.fillText(done ? "Klar" : `${Math.floor(p * 100)} %`, bx + bw, ry + 11 * s); ctx.textAlign = "left";
      ctx.restore();
      ry += rH;
    });
    if (g.more) { ctx.font = `500 ${Math.round(13 * s)}px system-ui, sans-serif`; ctx.fillStyle = "#94a3b8"; ctx.fillText(`+ ${g.more} till i området`, bx + 18 * s, ry + 4 * s); }
    ctx.restore();
    cy += gh + 10 * s;
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
