/* 3D-vyn – Tvärsektion och längdprofil för byggvägen (Victor 2026-11-10: "en sådan snygg tvärsektion som vägprojektören brukar ta fram … färdas längs linje och se hur vägen
   och slänterna beter sig mot punktmolnet … exportera som DXF").

   • Tvärsektionen: marken (ur ytorna vägen följer) som linje, med punktmolnets punkter i en tunn skiva runt snittet, vägen, slänterna med lutning (1:n), schakt (blått)
     och fyllning (rött) mellan mark och väg, mått (bredd, släntlutning, nivåer) och areor. Vänster sida är till vänster i färdriktningen.
   • Längdprofilen (remsan ovanför): mark och vägens höjd längs hela linjen med en markör – dra i den, använd reglaget eller ▶ för att färdas längs linjen.
     Snittlinjen visas samtidigt i 3D-vyn, och med "Följ lastbilen" åker snittet med lastbilen.
   • DXF: tvärsektioner med valt avstånd (och längdprofilen) som ritblad – mark, väg, slänter, mått och text i egna lager. Koordinater i bladets eget system (meter): vågrätt
     = avstånd från mittlinjen, lodrätt = höjd relativt vägens höjd i mitten (vägens nivå står i texten). */

const l3rs = { open: false, s: 0, el: null, cv: null, lp: null, play: false, raf: 0, last: 0, speed: 8, follow: true, scat: null, scatKey: "", dirtyTimer: 0, sec: null, ro: null };
const L3RS_COL = { ground: "#111827", road: "#374151", cut: "#2563eb", fill: "#dc2626", dim: "#92400e", grid: "#e2e8f0", scat: "#94a3b8" };
const l3rsStation = s => { const km = Math.floor(s / 1000), r = s - km * 1000; return `${km}+${r.toFixed(1).padStart(5, "0").replace(".", ",")}`; };
const l3rsLen = () => { const c = l3road.cur; return c && c.st && c.st.length ? c.st[c.st.length - 1].s : 0; };
const l3rsNice = v => { const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };

/* ---- Snittets geometri vid sträckan s ---- */
function l3rsSection(c, s) {
  if (!c || !c.st || !c.ctx) return null;
  const hw = l3rHW(c.spec, s, c.pts), wl = hw.l, wr = hw.r, W = wl + wr, a = l3rAt(c.st, s), nx = -Math.sin(a.yaw), ny = Math.cos(a.yaw), gz = c.ctx.gz, spec = c.spec;
  const D = l3rLayerD(spec), dE = spec.layersEarth !== false ? D : 0, kE = l3rK(spec), g0 = gz(a.x, a.y), p = { x: a.x, y: a.y, z: a.z, nx, ny, wl, wr, dE, g: g0 === null || g0 === undefined ? a.z : g0 };
  const SL = c.ctx.slope(p, 1), SR = c.ctx.slope(p, -1);   // vänster (+n) och höger (−n)
  const tEl = wl + dE * kE, tEr = wr + dE * kE, zEl = a.z - l3rFall(spec, tEl) - dE, zEr = a.z - l3rFall(spec, -tEr) - dE;   // terrasskanterna
  const ext = Math.min(Math.max(tEl, tEr) + (Number(spec.reach) || 25) + 3, Math.max(tEl + (SL.d || 0), tEr + (SR.d || 0)) + 3), step = 0.25, ground = [];
  for (let t = -ext; t <= ext + 1e-9; t += step) { const z = gz(a.x + nx * t, a.y + ny * t); ground.push([t, z === null || z === undefined ? null : z]); }
  const des = t => l3rDesignZ(p, spec, t >= 0 ? 1 : -1, t >= 0 ? SL : SR, Math.abs(t));
  let cut = 0, fill = 0;
  for (let i = 0; i < ground.length - 1; i++) { const t = (ground[i][0] + ground[i + 1][0]) / 2, gm = ground[i][1] !== null && ground[i + 1][1] !== null ? (ground[i][1] + ground[i + 1][1]) / 2 : null, d = des(t); if (gm === null || d === null) continue; const dz = gm - d; if (dz > 0) cut += dz * step; else fill += -dz * step; }
  const outL = (SL.prof || []).map(q => [tEl + q[0], q[1]]), outR = (SR.prof || []).map(q => [-(tEr + q[0]), q[1]]);   // slänten utåt från terrasskanten (sida, nivå)
  const line = [...outL.slice().reverse(), [0, a.z - dE], ...outR].filter(q => q[1] === q[1]);
  let h0 = 0; const lay = spec.layersOn ? (spec.layers || []).map(l => { const t = Number(l.t) || 0, poly = l3rLayerPoly(p, spec, h0, h0 + t), o = { name: l.name, t, h0, poly, color: l.color }; h0 += t; return o; }) : [];
  const top = l3rLayerPoly(p, spec, 0, 0).slice(0, 3);   // vägytan: vänster kant, mitt, höger kant
  return { s, x: a.x, y: a.y, nx, ny, z: a.z, zE: a.z - dE, D, layers: lay.map(l => ({ name: l.name, t: l.t, color: l.color })), lay, top, gc: g0, W, wl, wr, SL, SR, tEl, tEr, zEl, zEr, outL, outR, ext, ground, des, line, cut, fill, spec, p };
}
/* Punktmolnets punkter i en tunn skiva (±0,35 m) runt snittet: [[tl, z], …] – tl = avstånd åt vänster (som i snittet). */
function l3rsScatter(sec) {
  const c = l3road.cur, out = []; if (!c || !sec) return out; const tx = sec.ny, ty = -sec.nx, LIM = 7000;   // tangent = (ny, −nx)
  (c.spec.src || []).filter(k => /^pc:/.test(k)).forEach(k => {
    const cl = l3pc.clouds.find(x => "pc:" + x.id === k); if (!cl || !cl.chunks) return; const cx = cl.info.center[0], cy = cl.info.center[1], cz = cl.info.center[2] + (cl.dz || 0);
    for (const ch of cl.chunks) {
      const pos = ch.pos, n = pos.length / 3, st = n > 1.5e6 ? 2 : 1;
      for (let i = 0; i < n && out.length < LIM; i += st) {
        const dx = pos[i * 3] + cx - sec.x, dy = pos[i * 3 + 1] + cy - sec.y, al = dx * tx + dy * ty; if (al > 0.35 || al < -0.35) continue;
        const lat = dx * sec.nx + dy * sec.ny; if (lat > sec.ext || lat < -sec.ext) continue; out.push([lat, pos[i * 3 + 2] + cz]);
      }
    }
  });
  return out;
}

/* ---- Ritning ---- */
function l3rsFit(cv) { const dpr = window.devicePixelRatio || 1, w = Math.max(10, cv.clientWidth), h = Math.max(10, cv.clientHeight); if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); } const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h); return { ctx, w, h }; }
/* Tvärsektionen ritas som en svensk typ-/normalsektion: vägytan med tvärfall (%-symbol och pil), överbyggnadens lager med tjocklek i mm och sluttande kanter, terrassyta,
   innerslänt – dike – ytterslänt (eller fyllningsslänt) med lutning 1:n, mått för vägbana och terrassbredd, nivåer (▽ +höjd) och mittlinje (C/L). */
const L3RS_HATCH = n => /asfalt|slit|bind|abt|ag |bitumen/i.test(n || "");
function l3rsDrawSection() {
  const c = l3road.cur, cv = l3rs.cv; if (!cv || !c) return;
  const { ctx, w, h } = l3rsFit(cv), sec = l3rsSection(c, l3rs.s); l3rs.sec = sec;
  if (!sec) { ctx.fillStyle = "#64748b"; ctx.font = "13px system-ui"; ctx.fillText("Räknar vägen …", 16, 28); return; }
  const key = sec.s.toFixed(1) + "|" + (c.spec.src || []).join(","); if (l3rs.scatKey !== key) { l3rs.scat = l3rsScatter(sec); l3rs.scatKey = key; }
  // Nära vägen (standard) visar vägen, överbyggnaden, innerslänten och diket med god skala; "Hela" visar hela släntbredden ut till marken.
  const nearT = Math.max(sec.tEl, sec.tEr, ...[sec.outL, sec.outR].map(O => (O.length ? Math.abs(O[Math.min(2, O.length - 1)][0]) : 0))) + 2, EXT = l3rs.near !== false ? Math.min(sec.ext, nearT) : sec.ext;
  const zs = [sec.z]; sec.ground.forEach(q => { if (q[1] !== null && Math.abs(q[0]) <= EXT) zs.push(q[1]); }); sec.line.forEach(q => { if (Math.abs(q[0]) <= EXT) zs.push(q[1]); }); sec.lay.forEach(l => l.poly.forEach(q => zs.push(q[1])));
  let zmin = Math.min(...zs), zmax = Math.max(...zs); const padz = Math.max(1, (zmax - zmin) * 0.18); zmin -= padz; zmax += padz;
  const L = 56, R = 235, T = 34, B = 44, sx = (w - L - R) / (2 * EXT), sy = (h - T - B) / (zmax - zmin), sc = Math.min(sx, sy);   // lika skala i båda led
  const cxm = L + (w - L - R) / 2, cym = T + (h - T - B) / 2, zm = (zmax + zmin) / 2;
  const X = t => cxm - t * sc, Y = z => cym - (z - zm) * sc;   // vänster (+t) hamnar till vänster
  const fm = (v, d = 2) => (v >= 0 ? "+" : "−") + l3rFmt(Math.abs(v), d), mm = v => v < 1 ? `${Math.round(v * 1000)} mm` : `${l3rFmt(v, 2)} m`;
  const txt = (t, x, y, col, font, al = "left", bl = "middle") => { ctx.fillStyle = col; ctx.font = font; ctx.textAlign = al; ctx.textBaseline = bl; ctx.fillText(t, x, y); };
  const ln = (x0, y0, x1, y1, col, lw, dash) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]); };
  const arrow = (x0, y0, x1, y1, col) => { ln(x0, y0, x1, y1, col, 1.2); const an = Math.atan2(y1 - y0, x1 - x0), L2 = 6; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - L2 * Math.cos(an - 0.4), y1 - L2 * Math.sin(an - 0.4)); ctx.lineTo(x1 - L2 * Math.cos(an + 0.4), y1 - L2 * Math.sin(an + 0.4)); ctx.closePath(); ctx.fill(); };
  const dim = (x0, x1, y, label, col) => { ln(x0, y, x1, y, col, 1); ln(x0, y - 4, x0, y + 4, col, 1); ln(x1, y - 4, x1, y + 4, col, 1); ln(x0 + 3, y + 3, x0 - 3, y - 3, col, 1.2); ln(x1 + 3, y + 3, x1 - 3, y - 3, col, 1.2); txt(label, (x0 + x1) / 2, y - 9, col, "12px system-ui", "center"); };
  const level = (x, y, label, col) => { ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 5, y - 8); ctx.lineTo(x + 5, y - 8); ctx.lineTo(x, y); ctx.closePath(); ctx.stroke(); txt(label, x + 8, y - 9, col, "11px system-ui"); };
  // rutnät och nivåer
  const gs = l3rsNice(30 / sc); ctx.font = "11px system-ui"; ctx.textBaseline = "middle"; ctx.lineWidth = 1;
  for (let z = Math.ceil((zm - (h - T - B) / 2 / sc) / gs) * gs; z <= zm + (h - T - B) / 2 / sc + 1e-6; z += gs) { const y = Y(z); ln(L, y, w - R, y, L3RS_COL.grid, 1); txt(l3rFmt(z, gs < 1 ? 1 : 0), L - 6, y, "#64748b", "11px system-ui", "right"); }
  // mittlinje (streck-punkt) med C/L
  ln(X(0), T - 4, X(0), h - B + 4, "#64748b", 1, [10, 3, 2, 3]); txt("C/L", X(0), T - 10, "#64748b", "600 11px system-ui", "center");
  ctx.save(); ctx.beginPath(); ctx.rect(L, T - 2, w - L - R, h - T - B + 4); ctx.clip();
  // schakt/fyllning mellan mark och konstruktionsyta
  for (let i = 0; i < sec.ground.length - 1; i++) {
    const a = sec.ground[i], b = sec.ground[i + 1]; if (a[1] === null || b[1] === null) continue; const da = sec.des(a[0]), db = sec.des(b[0]); if (da === null || db === null) continue;
    const mid = (a[1] + b[1] - da - db) / 2; ctx.fillStyle = mid > 0 ? "rgba(37,99,235,.28)" : "rgba(220,38,38,.28)";
    ctx.beginPath(); ctx.moveTo(X(a[0]), Y(a[1])); ctx.lineTo(X(b[0]), Y(b[1])); ctx.lineTo(X(b[0]), Y(db)); ctx.lineTo(X(a[0]), Y(da)); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = L3RS_COL.scat; (l3rs.scat || []).forEach(q => { ctx.fillRect(X(q[0]) - 1, Y(q[1]) - 1, 2, 2); });
  // befintlig mark
  ctx.strokeStyle = L3RS_COL.ground; ctx.lineWidth = 2; ctx.beginPath(); let pen = false; sec.ground.forEach(q => { if (q[1] === null) { pen = false; return; } if (!pen) { ctx.moveTo(X(q[0]), Y(q[1])); pen = true; } else ctx.lineTo(X(q[0]), Y(q[1])); }); ctx.stroke();
  // överbyggnadens lager (solider: tvärfall + sluttande kanter), asfaltlager heldragna, obundna med snedstreck
  sec.lay.forEach(l => {
    const P = l.poly; ctx.beginPath(); P.forEach((q, i) => (i ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1])))); ctx.closePath(); ctx.fillStyle = (l.color || "#a8a29e") + (L3RS_HATCH(l.name) ? "ff" : "dd"); ctx.fill();
    if (!L3RS_HATCH(l.name)) { ctx.save(); ctx.clip(); ctx.strokeStyle = "rgba(15,23,42,.28)"; ctx.lineWidth = 0.8; const x0 = Math.min(...P.map(q => X(q[0]))), x1 = Math.max(...P.map(q => X(q[0]))), y0 = Math.min(...P.map(q => Y(q[1]))), y1 = Math.max(...P.map(q => Y(q[1]))); for (let xx = x0 - (y1 - y0); xx < x1; xx += 7) { ctx.beginPath(); ctx.moveTo(xx, y1); ctx.lineTo(xx + (y1 - y0), y0); ctx.stroke(); } ctx.restore(); }
    ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 1; ctx.stroke();
  });
  // terrassyta (underkant överbyggnad) – streckad, och slänten utåt från terrasskanten
  if (sec.lay.length) { ctx.setLineDash([6, 3]); ctx.strokeStyle = "#92400e"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(X(sec.tEl), Y(sec.zEl)); ctx.lineTo(X(0), Y(sec.z - sec.D)); ctx.lineTo(X(-sec.tEr), Y(sec.zEr)); ctx.stroke(); ctx.setLineDash([]); }
  [[sec.outL, sec.SL], [sec.outR, sec.SR]].forEach(([O, S]) => { if (O.length < 2) return; ctx.strokeStyle = S.kind === "cut" ? L3RS_COL.cut : L3RS_COL.fill; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.beginPath(); O.forEach((q, i) => (i ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1])))); ctx.stroke(); });
  // vägytan (fet) = lagrets/vägens övre yta
  ctx.strokeStyle = L3RS_COL.road; ctx.lineWidth = 3.5; ctx.beginPath(); sec.top.forEach((q, i) => (i ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1])))); ctx.stroke();
  ctx.restore();
  // ---- påskrifter ----
  const spec = sec.spec, topL = sec.top[0], topR = sec.top[2];
  // tvärfall: pil längs vägytan i fallriktningen + procent (takprofil: en pil per halva, ensidigt: en pil över hela vägen)
  if (Number(spec.fall) > 0 && spec.fallMode !== "flat") {
    const pil = (A, Bp) => { const mx = (X(A[0]) + X(Bp[0])) / 2, my = (Y(A[1]) + Y(Bp[1])) / 2 - 16, dx = (X(Bp[0]) - X(A[0])) / 3, dy = (Y(Bp[1]) - Y(A[1])) / 3; arrow(mx - dx / 2, my - dy / 2, mx + dx / 2, my + dy / 2, "#b45309"); txt(`${l3rFmt(Number(spec.fall), 1)} %`, mx, my - 9, "#b45309", "600 11px system-ui", "center"); };
    if (spec.fallMode === "L") pil(sec.top[2], sec.top[0]); else if (spec.fallMode === "R") pil(sec.top[0], sec.top[2]); else { pil(sec.top[1], sec.top[0]); pil(sec.top[1], sec.top[2]); }
  }
  // vägbana (mått)
  dim(X(sec.wl), X(-sec.wr), Math.min(Y(sec.top[0][1]), Y(sec.top[2][1]), Y(sec.z)) - 50, `Vägbana ${l3rFmt(sec.W, 2)} m`, L3RS_COL.dim);
  // terrassbredd (mått under överbyggnaden)
  if (sec.lay.length) dim(X(sec.tEl), X(-sec.tEr), Math.max(Y(sec.zEl), Y(sec.zEr)) + 26, `Terrassyta ${l3rFmt(sec.tEl + sec.tEr, 2)} m bred · ${fm(sec.z - sec.D)}`, "#92400e");
  // lager: namn + tjocklek i mm till höger, ledlinje från lagrets högra kant
  const rx = w - R + 10; let lastY = -1e9;
  sec.lay.forEach(l => { const P = l.poly, my = (Y(P[1][1]) + Y(P[4][1])) / 2 - 0, mid = [(X(P[2][0]) + X(P[3][0])) / 2, (Y(P[2][1]) + Y(P[3][1])) / 2]; let ty = Math.max(my, lastY + 13); lastY = ty; ln(mid[0], mid[1], rx - 4, ty, "#64748b", 0.8); txt(`${l.name} ${mm(l.t)}`, rx, ty, "#0f172a", "11px system-ui", "left"); });
  // kantlutning på överbyggnaden
  if (sec.lay.length && l3rK(sec.spec) > 0) { const P = sec.lay[sec.lay.length - 1].poly; txt(`kant 1:${l3rFmt(l3rK(sec.spec), 2)}`, X(P[3][0]) - 4, Y(P[3][1]) + 12, "#475569", "10px system-ui", "left"); }
  // slänter: lutning 1:n per del, dike
  [[sec.outL, sec.SL], [sec.outR, sec.SR]].forEach(([O, S]) => {
    if (O.length < 2) return; const prof = S.prof || [];
    for (let k = 1; k < O.length; k++) { const dx = Math.abs(O[k][0] - O[k - 1][0]), dz = Math.abs(O[k][1] - O[k - 1][1]); if (dx < 0.15 && dz < 0.15) continue; const mx = (X(O[k][0]) + X(O[k - 1][0])) / 2, my = (Y(O[k][1]) + Y(O[k - 1][1])) / 2, flat = dz < 0.02, side = O[k][0] > 0 ? 1 : -1;
      const label = flat ? (S.kind === "cut" ? `dike ${l3rFmt(dx, 2)} m` : "") : `1:${l3rFmt(dx / Math.max(1e-6, dz), 2)}`; if (!label) continue; txt(label, mx + (flat ? 0 : side * 20), my + (flat ? 16 : (S.kind === "cut" ? -12 : 12)), S.kind === "cut" ? L3RS_COL.cut : L3RS_COL.fill, "11px system-ui", "center"); }
    txt(`${S.hit ? "" : "≥ "}${l3rFmt(S.d, 1)} m`, X(O[O.length - 1][0]), Y(O[O.length - 1][1]) - 10, "#475569", "11px system-ui", "center");
    if (S.kind === "cut" && prof.length === 4 && S.d1 > 0) { const dd = S.ze - S.zb; if (dd > 0.01) txt(`dikesdjup ${l3rFmt(dd, 2)} m`, X(O[1][0] + (O[2][0] - O[1][0]) / 2), Y(S.zb) + 30, L3RS_COL.cut, "10px system-ui", "center"); }
  });
  // nivåer: profilhöjd (mitt), terrassyta, befintlig mark
  level(X(0), Y(sec.z), `Profil ${fm(sec.z)}`, L3RS_COL.road);
  if (sec.gc !== null && sec.gc !== undefined) level(X(sec.wl + 0.01 > 0 ? -sec.wr - Math.max(2, sec.tEr * 0.3) : 0), Y(sec.gc), `Mark ${fm(sec.gc)}`, L3RS_COL.ground);
  // rubrik
  txt(`Tvärsektion  Km ${l3rsStation(sec.s)}`, L, 15, "#0f172a", "600 13px system-ui", "left", "alphabetic");
  txt(`Schakt ${l3rFmt(sec.cut, 1)} m²`, w - R - 130, 15, L3RS_COL.cut, "12px system-ui", "right", "alphabetic"); txt(`Fyllning ${l3rFmt(sec.fill, 1)} m²`, w - 6, 15, L3RS_COL.fill, "12px system-ui", "right", "alphabetic");
  txt("◄ vänster", L, h - 8, "#64748b", "12px system-ui", "left", "alphabetic"); txt("höger ►", w - R, h - 8, "#64748b", "12px system-ui", "right", "alphabetic"); txt("Lika skala i höjd- och sidled · mått i m", cxm, h - 8, "#94a3b8", "11px system-ui", "center", "alphabetic");
}
function l3rsDrawProfile() {
  const c = l3road.cur, cv = l3rs.lp; if (!cv || !c || !c.st) return; const { ctx, w, h } = l3rsFit(cv), st = c.st, Ls = st[st.length - 1].s;
  const zs = []; st.forEach(p => { zs.push(p.g, p.z); }); let zmin = Math.min(...zs), zmax = Math.max(...zs); const pz = Math.max(1, (zmax - zmin) * 0.15); zmin -= pz; zmax += pz;
  const L = 52, R = 14, T = 8, B = 16, X = s => L + s / Ls * (w - L - R), Y = z => T + (zmax - z) / (zmax - zmin) * (h - T - B);
  ctx.font = "11px system-ui"; ctx.textBaseline = "middle"; ctx.textAlign = "right"; ctx.fillStyle = "#64748b"; ctx.strokeStyle = L3RS_COL.grid;
  const gs = l3rsNice((zmax - zmin) / 3); for (let z = Math.ceil(zmin / gs) * gs; z <= zmax; z += gs) { ctx.beginPath(); ctx.moveTo(L, Y(z)); ctx.lineTo(w - R, Y(z)); ctx.stroke(); ctx.fillText(l3rFmt(z, gs < 1 ? 1 : 0), L - 6, Y(z)); }
  const line = (key, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); st.forEach((p, i) => { i ? ctx.lineTo(X(p.s), Y(p[key])) : ctx.moveTo(X(p.s), Y(p[key])); }); ctx.stroke(); };
  ctx.beginPath(); st.forEach((p, i) => { i ? ctx.lineTo(X(p.s), Y(p.g)) : ctx.moveTo(X(p.s), Y(p.g)); }); for (let i = st.length - 1; i >= 0; i--) ctx.lineTo(X(st[i].s), Y(st[i].z)); ctx.closePath(); ctx.fillStyle = "rgba(100,116,139,.12)"; ctx.fill();
  (c.spec.widen || []).forEach(z => { if (z.kind === "obj") return; ctx.fillStyle = "rgba(245,158,11,.22)"; ctx.fillRect(X(Math.max(0, z.s0)), T, Math.max(2, X(Math.min(Ls, z.s1)) - X(Math.max(0, z.s0))), h - T - B); });   // breddningar
  line("g", L3RS_COL.ground, 1.6); line("z", "#16a34a", 2.4);
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#64748b"; ctx.fillText("0", X(0), h - 3); ctx.fillText(`${l3rFmt(Ls, 0)} m`, X(Ls), h - 3);
  const x = X(Math.max(0, Math.min(Ls, l3rs.s))); ctx.strokeStyle = "#ef4444"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, T - 2); ctx.lineTo(x, h - B + 2); ctx.stroke(); ctx.fillStyle = "#ef4444"; ctx.beginPath(); ctx.arc(x, T + 3, 4, 0, 7); ctx.fill();
  cv._X = X; cv._Ls = Ls; cv._L = L; cv._R = R;
}
function l3rsRedraw() {
  if (!l3rs.open) return; l3rsDrawProfile(); l3rsDrawSection();
  const el = l3rs.el; if (el) { const sl = el.querySelector("[data-rss]"), tx = el.querySelector("[data-rst]"); if (sl) { sl.max = l3rsLen(); sl.value = l3rs.s; } if (tx) tx.textContent = `Station ${l3rsStation(l3rs.s)}`; }
  if (l3road.cur && typeof l3rDraw === "function" && !l3rs.fast) l3rDraw();
}
function l3rsDirty() { if (!l3rs.open) return; clearTimeout(l3rs.dirtyTimer); l3rs.scatKey = ""; l3rs.s = Math.min(l3rs.s, l3rsLen()); l3rs.dirtyTimer = setTimeout(l3rsRedraw, 30); }
/* Snittlinjen i 3D-vyn. */
function l3rsLine(grp, mk) {
  if (!l3rs.open || !l3rs.sec) return; const sec = l3rs.sec, O = l3.O, e = Math.max(sec.wl, sec.wr) + Math.max(sec.SL.d || 0, sec.SR.d || 0) + 2, z = sec.z + 0.3;
  const P = [-e, e].map(t => new THREE.Vector3(sec.x + sec.nx * t - O[0], sec.y + sec.ny * t - O[1], z - O[2]));
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(P), new THREE.LineBasicMaterial({ color: 0xef4444, depthTest: false })); l.renderOrder = 14; l.userData.noHit = true; l.raycast = () => {}; grp.add(l);
  void mk;
}

/* ---- Panel ---- */
function l3rsSet(s, fast) { const L = l3rsLen(); l3rs.s = Math.max(0, Math.min(L, s)); l3rs.fast = !!fast; l3rsRedraw(); l3rs.fast = false; if (fast) { clearTimeout(l3rs.fastT); l3rs.fastT = setTimeout(() => { l3rs.fast = false; if (l3road.cur) l3rDraw(); }, 120); } }
function l3rsOpen() {
  const c = l3road.cur; if (!c || !c.st) { l3Status("Vänta tills vägen är räknad.", true); return; }
  l3rs.open = true; const host = document.getElementById("v3Canvas"); if (!host) return;
  let el = document.getElementById("v3RoadSec");
  if (!el) {
    el = document.createElement("div"); el.id = "v3RoadSec"; el.className = "v3-rsec"; host.appendChild(el); l3rs.el = el;
    ["pointerdown", "wheel", "contextmenu", "dblclick", "click", "keydown", "keyup"].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
    el.innerHTML = `<div class="v3-rsec-h"><b>Tvärsektion &amp; längdprofil</b><span data-rst></span><div class="v3-rsec-sp"></div>
      <label title="Åk med lastbilen när den kör"><input type="checkbox" data-rsf checked> Följ lastbilen</label>
      <label title="Meter per sekund när du spelar upp"><input type="number" data-rsv value="${l3rs.speed}" min="1" max="60" step="1"> m/s</label>
      <button type="button" data-rsb="zoom" title="Växla mellan att visa vägen nära (med dike och innerslänt) och hela släntbredden ut till marken">Hela</button><button type="button" data-rsb="play" title="Färdas längs linjen">▶</button><button type="button" data-rsb="x" title="Stäng">✕</button></div>
      <canvas class="v3-rsec-lp"></canvas><input type="range" data-rss min="0" max="${l3rsLen()}" step="0.5" value="0" title="Dra för att färdas längs linjen (pil vänster/höger flyttar 1 m)">
      <canvas class="v3-rsec-cv"></canvas>
      <div class="v3-rsec-f"><span>Avstånd</span><input type="number" data-rsi value="10" min="1" max="200" step="1"> m<label><input type="checkbox" data-rsp checked> med längdprofil</label><button type="button" class="primary" data-rsb="dxf" title="Tvärsektioner med valt avstånd (och längdprofilen) som ritblad i DXF – i bladets eget system, meter">Exportera DXF</button><button type="button" data-rsb="png" title="Sparar snittet du ser som bild">Bild</button></div>`;
    l3rs.cv = el.querySelector(".v3-rsec-cv"); l3rs.lp = el.querySelector(".v3-rsec-lp");
    const sl = el.querySelector("[data-rss]"); sl.oninput = () => { l3rs.play = false; l3rsUi(); l3rsSet(Number(sl.value), true); };
    const lp = l3rs.lp, at = e => { const r = lp.getBoundingClientRect(), X0 = (lp._L || 52), Wd = r.width - (lp._L || 52) - (lp._R || 14); return Math.max(0, Math.min(1, (e.clientX - r.left - X0) / Wd)) * (lp._Ls || l3rsLen()); };
    lp.onpointerdown = e => { l3rs.play = false; l3rsUi(); lp.setPointerCapture(e.pointerId); l3rsSet(at(e), true); lp.onpointermove = ev => l3rsSet(at(ev), true); lp.onpointerup = () => { lp.onpointermove = null; lp.onpointerup = null; }; };
    el.querySelector("[data-rsf]").onchange = e => { l3rs.follow = e.target.checked; };
    el.querySelector("[data-rsv]").onchange = e => { l3rs.speed = Math.max(1, Number(e.target.value) || 8); };
    const zb = el.querySelector('[data-rsb="zoom"]'), zl = () => { zb.textContent = l3rs.near !== false ? "Hela sektionen" : "Nära vägen"; }; zl(); zb.onclick = () => { l3rs.near = l3rs.near === false; zl(); l3rsRedraw(); };
    el.querySelector('[data-rsb="x"]').onclick = l3rsClose; el.querySelector('[data-rsb="play"]').onclick = () => { l3rs.play = !l3rs.play; if (l3rs.play && l3rs.s >= l3rsLen() - 0.5) l3rs.s = 0; l3rs.last = 0; l3rsUi(); if (l3rs.play) l3rs.raf = requestAnimationFrame(l3rsLoop); };
    el.querySelector('[data-rsb="dxf"]').onclick = () => l3rsExportDxf(Math.max(1, Number(el.querySelector("[data-rsi]").value) || 10), el.querySelector("[data-rsp]").checked);
    el.querySelector('[data-rsb="png"]').onclick = () => { const cv = l3rs.cv, a = document.createElement("a"); a.href = cv.toDataURL("image/png"); a.download = `Tvärsektion ${l3rsStation(l3rs.s)}.png`; document.body.appendChild(a); a.click(); a.remove(); };
    if (!l3rs.ro && typeof ResizeObserver !== "undefined") { l3rs.ro = new ResizeObserver(() => l3rsRedraw()); l3rs.ro.observe(el); }
    l3rs.keys = e => { if (!l3rs.open || /INPUT|SELECT|TEXTAREA/.test((e.target || {}).tagName || "")) return; if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); e.stopPropagation(); l3rs.play = false; l3rsUi(); l3rsSet(l3rs.s + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 10 : 1), false); } };
    window.addEventListener("keydown", l3rs.keys, true);
  }
  el.style.display = ""; l3rsRedraw(); requestAnimationFrame(l3rsRedraw);
}
function l3rsUi() { const b = document.querySelector('#v3RoadSec [data-rsb="play"]'); if (b) b.textContent = l3rs.play ? "⏸" : "▶"; }
function l3rsLoop(now) {
  if (!l3rs.open || !l3road.cur) { l3rs.play = false; return; }
  const dt = Math.min(0.1, l3rs.last ? (now - l3rs.last) / 1000 : 0.016); l3rs.last = now;
  if (l3rs.follow && typeof l3rDrv !== "undefined" && l3rDrv.on) { l3rs.s = Math.max(0, Math.min(l3rsLen(), l3rDrv.s + (L3R_FRONT + L3R_REAR) / 2)); }
  else if (l3rs.play) { l3rs.s += l3rs.speed * dt; if (l3rs.s >= l3rsLen()) { l3rs.s = l3rsLen(); l3rs.play = false; l3rsUi(); } }
  l3rs.fast = true; l3rsRedraw(); l3rs.fast = false; if (typeof l3Render === "function") l3Render();
  if (l3rs.play || (l3rs.follow && typeof l3rDrv !== "undefined" && l3rDrv.on)) l3rs.raf = requestAnimationFrame(l3rsLoop); else l3rs.raf = 0;
}
/* Lastbilen startad medan snittet är öppet: låt snittet följa med. */
setInterval(() => { if (l3rs.open && l3rs.follow && typeof l3rDrv !== "undefined" && l3rDrv.on && !l3rs.raf) l3rs.raf = requestAnimationFrame(l3rsLoop); }, 400);
function l3rsClose() {
  l3rs.open = false; l3rs.play = false; cancelAnimationFrame(l3rs.raf); l3rs.raf = 0; if (l3rs.ro) { l3rs.ro.disconnect(); l3rs.ro = null; }
  if (l3rs.keys) { window.removeEventListener("keydown", l3rs.keys, true); l3rs.keys = null; }
  const el = document.getElementById("v3RoadSec"); if (el) el.remove(); l3rs.el = null; l3rs.cv = null; l3rs.lp = null; l3rs.sec = null; l3rs.scat = null;
  if (l3road.cur && typeof l3rDraw === "function") l3rDraw();
}

/* ---- DXF ---- */
function l3rsDxf(interval, withProfile) {
  const c = l3road.cur; if (!c || !c.st || !c.ctx) return null;
  const L = l3rsLen(), ss = []; for (let s = 0; s < L; s += interval) ss.push(s); if (!ss.length || L - ss[ss.length - 1] > 0.01) ss.push(L);
  const secs = ss.map(s => l3rsSection(c, s)).filter(Boolean); if (!secs.length) return null;
  let halfW = 4, dzMax = 2; secs.forEach(sec => { halfW = Math.max(halfW, sec.ext); sec.ground.forEach(q => { if (q[1] !== null) dzMax = Math.max(dzMax, Math.abs(q[1] - sec.z)); }); sec.line.forEach(q => { dzMax = Math.max(dzMax, Math.abs(q[1] - sec.z)); }); dzMax = Math.max(dzMax, sec.layers.length ? sec.D + 1 : 0); });
  dzMax = Math.ceil(dzMax + 1); halfW = Math.ceil(halfW);
  const cw = 2 * halfW + 6, ch = 2 * dzMax + 9, cols = Math.max(1, Math.min(3, Math.round(1600 / cw))), ents = [], used = new Set(), aci = { "SEK-MARK": 7, "SEK-VAG": 3, "SEK-SLANT-SCHAKT": 5, "SEK-SLANT-FYLLNING": 1, "SEK-MATT": 2, "SEK-TEXT": 7, "SEK-RAM": 8, "PROFIL-MARK": 7, "PROFIL-VAG": 3, "PROFIL-TEXT": 7, "PROFIL-RAM": 8 };
  const pl = (layer, pts, closed, a) => { used.add(layer); ents.push({ t: "PLINE", layer, pts, closed: !!closed, aci: a }); };
  const tx = (layer, x, y, h, s, o = {}) => { used.add(layer); ents.push({ t: "TEXT", layer, x, y, z: 0, h, s, ...o }); };
  const top = withProfile ? 0 : 0, rows = Math.ceil(secs.length / cols), baseY = -ch;   // sektionsbladen ligger under längdprofilen (som börjar vid y = 0 uppåt)
  void top; void rows;
  secs.forEach((sec, i) => {
    const col = i % cols, row = Math.floor(i / cols), ox = col * cw, oy = baseY - row * ch - 0 + 0;   // origo (vägens mitt) i cellen
    const cx = ox + cw / 2, cy = oy + ch / 2 - 1.5;   // bladets mitt (vägens nivå)
    const X = t => cx - t, Y = z => cy + (z - sec.z);   // vänster (+t) till vänster
    pl("SEK-RAM", [[ox, oy], [ox + cw, oy], [ox + cw, oy + ch], [ox, oy + ch]], true);
    tx("SEK-TEXT", ox + 1, oy + ch - 1.6, 1.0, `Tvärsektion  Km ${l3rsStation(sec.s)}`, { ha: 0 });
    tx("SEK-TEXT", ox + 1, oy + ch - 3.0, 0.7, `Vägens nivå ${l3rFmt(sec.z, 2)} m (±0 i bladet)  ·  Schakt ${l3rFmt(sec.cut, 1)} m2  ·  Fyllning ${l3rFmt(sec.fill, 1)} m2`);
    // mark (brutna där höjd saknas)
    let run = []; const flush = () => { if (run.length > 1) pl("SEK-MARK", run, false); run = []; };
    sec.ground.forEach(q => { if (q[1] === null) flush(); else run.push([X(q[0]), Y(q[1])]); }); flush();
    // vägytan (med tvärfall), lager (solider med sluttande kanter) och terrassyta
    pl("SEK-VAG", sec.top.map(q => [X(q[0]), Y(q[1])]), false);
    sec.lay.forEach((l, k) => { const L = "SEK-LAGER-" + (k + 1); aci[L] = aci[L] || [30, 40, 50, 8, 9][k % 5]; pl(L, l.poly.map(q => [X(q[0]), Y(q[1])]), true);
      tx("SEK-TEXT", X(-sec.tEr) - 0.4, Y(l.poly[1][1] - l.t / 2) - 0.2, 0.4, `${l.name} ${l.t < 1 ? Math.round(l.t * 1000) + " mm" : l3rFmt(l.t, 2) + " m"}`, { ha: 2 }); });
    if (sec.lay.length) { pl("SEK-MATT", [[X(sec.tEl), Y(sec.zEl)], [X(0), Y(sec.z - sec.D)], [X(-sec.tEr), Y(sec.zEr)]], false); tx("SEK-TEXT", X(0) + 0.5, Y(sec.z - sec.D) - 0.7, 0.45, `Terrassyta ${l3rFmt(sec.z - sec.D, 2)}`); }
    // slänter: innerslänt, dike och ytterslänt/fyllningsslänt som en linje, lutning per del
    [[sec.outL, sec.SL], [sec.outR, sec.SR]].forEach(([O, S]) => { if (O.length < 2) return; pl(S.kind === "cut" ? "SEK-SLANT-SCHAKT" : "SEK-SLANT-FYLLNING", O.map(q => [X(q[0]), Y(q[1])]), false);
      for (let k2 = 1; k2 < O.length; k2++) { const dx = Math.abs(O[k2][0] - O[k2 - 1][0]), dz = Math.abs(O[k2][1] - O[k2 - 1][1]); if (dx < 0.15 && dz < 0.15) continue; const flat = dz < 0.02; tx("SEK-MATT", X((O[k2][0] + O[k2 - 1][0]) / 2), Y((O[k2][1] + O[k2 - 1][1]) / 2) + (flat ? -0.9 : 0.5), 0.4, flat ? `dike ${l3rFmt(dx, 2)} m` : `1:${l3rFmt(dx / Math.max(1e-6, dz), 2)}`, { mid: true }); } });
    // mått: vägbana och terrassbredd, tvärfall, nivåer
    const yd = Math.min(Y(sec.top[0][1]), Y(sec.top[2][1])) + 1.8; pl("SEK-MATT", [[X(sec.wl), yd], [X(-sec.wr), yd]], false); pl("SEK-MATT", [[X(sec.wl), yd - 0.3], [X(sec.wl), yd + 0.3]], false); pl("SEK-MATT", [[X(-sec.wr), yd - 0.3], [X(-sec.wr), yd + 0.3]], false);
    tx("SEK-MATT", X((sec.wl - sec.wr) / 2), yd + 0.5, 0.6, `Vägbana ${l3rFmt(sec.W, 2)} m   tvärfall ${l3rFmt(Number(sec.spec.fall) || 0, 1)} %`, { mid: true });
    if (sec.lay.length) { const y2 = Math.max(Y(sec.zEl), Y(sec.zEr)) - 1.8; pl("SEK-MATT", [[X(sec.tEl), y2], [X(-sec.tEr), y2]], false); pl("SEK-MATT", [[X(sec.tEl), y2 - 0.3], [X(sec.tEl), y2 + 0.3]], false); pl("SEK-MATT", [[X(-sec.tEr), y2 - 0.3], [X(-sec.tEr), y2 + 0.3]], false); tx("SEK-MATT", X((sec.tEl - sec.tEr) / 2), y2 - 1.0, 0.6, `Terrassyta ${l3rFmt(sec.tEl + sec.tEr, 2)} m`, { mid: true }); }
    if (sec.gc !== null && sec.gc !== undefined) tx("SEK-TEXT", X(0), Y(sec.gc) + (sec.gc >= sec.z ? 0.6 : -1.2), 0.5, `Mark ${l3rFmt(sec.gc, 2)}`, { mid: true });
    tx("SEK-TEXT", X(0), Y(sec.z) + 0.55, 0.5, `Profil ${l3rFmt(sec.z, 2)}`, { mid: true });
    pl("SEK-MATT", [[X(0), oy + 1], [X(0), oy + ch - 4]], false); tx("SEK-TEXT", X(0), oy + ch - 3.6, 0.5, "C/L", { mid: true });
  });
  if (withProfile) {   // längdprofil: x = sträcka (1:1), y = höjd med 5 × förhöjning
    const st = c.st, EX = 5, zs = []; st.forEach(p => zs.push(p.g, p.z)); const z0 = Math.floor(Math.min(...zs)), z1 = Math.ceil(Math.max(...zs)), H = (z1 - z0) * EX + 8, Wp = L + 16, X = s => 8 + s, Y = z => 3 + (z - z0) * EX;
    const ox = 0, oy = 4;   // blad över sektionerna
    pl("PROFIL-RAM", [[ox, oy], [ox + Wp, oy], [ox + Wp, oy + H], [ox, oy + H]], true);
    pl("PROFIL-MARK", st.map(p => [X(p.s), oy + Y(p.g)]), false); pl("PROFIL-VAG", st.map(p => [X(p.s), oy + Y(p.z)]), false);
    tx("PROFIL-TEXT", ox + 2, oy + H - 2, 1.2, `Längdprofil  0–${l3rFmt(L, 0)} m  ·  höjdskala ${EX}x`);
    for (let z = z0; z <= z1; z += Math.max(1, Math.round((z1 - z0) / 6))) { pl("PROFIL-RAM", [[X(0), oy + Y(z)], [X(L), oy + Y(z)]], false, 8); tx("PROFIL-TEXT", ox + 0.5, oy + Y(z) + 0.2, 0.9, `${z}`); }
    for (let s = 0; s <= L + 1e-6; s += Math.max(10, Math.round(L / 10 / 10) * 10)) { tx("PROFIL-TEXT", X(s), oy + 0.2, 0.9, `${l3rFmt(s, 0)}`, { mid: true }); }
  }
  const layers = [...used]; return { text: dxfWrite(ents, layers, aci), n: secs.length };
}
function l3rsExportDxf(interval, withProfile) {
  const r = l3rsDxf(interval, withProfile); if (!r) { l3Status("Inget att exportera ännu – vänta tills vägen är räknad.", true); return; }
  const at = new Date().toISOString().slice(0, 10), name = `Tvärsektioner byggväg ${at}.dxf`, bytes = dxfCp1252(r.text);
  downloadBlob(new Blob([bytes], { type: "application/dxf" }), name);
  l3Status(`📐 ${r.n} tvärsektioner${withProfile ? " och längdprofil" : ""} exporterade som DXF (${name}).`); l3Toast(`DXF: ${r.n} tvärsektioner nedladdade.`);
  const tc = document.getElementById("cadExportToTc"); if (!tc || !tc.checked || !window.opener || window.opener.closed || typeof askOpener !== "function") return;
  askOpener("tcUpload", { folder: DXF_TC_FOLDER, files: [new File([bytes], name, { type: "application/dxf" })] }, 5 * 60 * 1000).then(res => l3Toast(`Sparad i Trimble Connect (${res.folder || DXF_TC_FOLDER}).`)).catch(e => l3Status("DXF nedladdad. ⚠ Kunde inte spara i Trimble Connect: " + e.message, true));
}

(function l3rsCss() {
  if (document.getElementById("v3RoadSecCss")) return; const s = document.createElement("style"); s.id = "v3RoadSecCss";
  s.textContent = `#view3d .v3-rsec{position:absolute;left:12px;right:384px;bottom:52px;z-index:9;height:min(56%,480px);min-height:300px;display:flex;flex-direction:column;gap:4px;padding:8px 10px;background:rgba(255,255,255,.97);border:1px solid #cbd5e1;border-radius:14px;box-shadow:0 8px 28px rgba(15,23,42,.18);font-size:12px;color:#0f172a}
#view3d .v3-rsec-h{display:flex;align-items:center;gap:10px}#view3d .v3-rsec-h b{font-size:13px}#view3d .v3-rsec-h span{color:#475569}#view3d .v3-rsec-sp{flex:1}#view3d .v3-rsec-h button,#view3d .v3-rsec-f button{padding:4px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc;cursor:pointer;font:inherit}#view3d .v3-rsec-f button.primary{background:#2563eb;border-color:#2563eb;color:#fff}
#view3d .v3-rsec-h input[type=number],#view3d .v3-rsec-f input[type=number]{width:48px;padding:2px 4px;border:1px solid #cbd5e1;border-radius:6px;font:inherit}#view3d .v3-rsec-lp{width:100%;height:64px;flex:none}#view3d .v3-rsec-cv{width:100%;flex:1;min-height:150px}#view3d .v3-rsec input[type=range]{width:100%}#view3d .v3-rsec-f{display:flex;align-items:center;gap:8px}#view3d .v3-rsec-f span{color:#475569}
@media (max-width:900px){#view3d .v3-rsec{right:12px;bottom:60px}}`;
  document.head.appendChild(s);
})();
