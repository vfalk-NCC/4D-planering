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
  const W = c.W, a = l3rAt(c.st, s), nx = -Math.sin(a.yaw), ny = Math.cos(a.yaw), gz = c.ctx.gz, spec = c.spec;
  const g0 = gz(a.x, a.y), p = { x: a.x, y: a.y, z: a.z, nx, ny, g: g0 === null || g0 === undefined ? a.z : g0 };
  const SL = c.ctx.slope(p, 1), SR = c.ctx.slope(p, -1);   // vänster (+n) och höger (−n)
  const ext = Math.min(W / 2 + (Number(spec.reach) || 25) + 3, W / 2 + Math.max(SL.d || 0, SR.d || 0) + 3), step = 0.25, ground = [];
  for (let t = -ext; t <= ext + 1e-9; t += step) { const z = gz(a.x + nx * t, a.y + ny * t); ground.push([t, z === null || z === undefined ? null : z]); }
  const kc = 1 / Math.max(0.2, spec.cutR), kf = 1 / Math.max(0.2, spec.fillR);
  const des = t => { const at = Math.abs(t), S = t >= 0 ? SL : SR; if (at <= W / 2) return a.z; const d = at - W / 2; if (d > (S.d || 0) + 1e-6 || S.kind === "none") return null; return S.kind === "cut" ? a.z + d * kc : a.z - d * kf; };
  let cut = 0, fill = 0;
  for (let i = 0; i < ground.length - 1; i++) { const t = (ground[i][0] + ground[i + 1][0]) / 2, gm = ground[i][1] !== null && ground[i + 1][1] !== null ? (ground[i][1] + ground[i + 1][1]) / 2 : null, d = des(t); if (gm === null || d === null) continue; const dz = gm - d; if (dz > 0) cut += dz * step; else fill += -dz * step; }
  const line = [[W / 2 + (SL.d || 0), SL.qz], [W / 2, a.z], [-W / 2, a.z], [-(W / 2 + (SR.d || 0)), SR.qz]].filter((q, i) => !(i === 0 && SL.kind === "none") && !(i === 3 && SR.kind === "none"));
  return { s, x: a.x, y: a.y, nx, ny, z: a.z, gc: g0, W, SL, SR, ext, ground, des, line, cut, fill, kc, kf, spec };
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
function l3rsDrawSection() {
  const c = l3road.cur, cv = l3rs.cv; if (!cv || !c) return;
  const { ctx, w, h } = l3rsFit(cv), sec = l3rsSection(c, l3rs.s); l3rs.sec = sec;
  if (!sec) { ctx.fillStyle = "#64748b"; ctx.font = "13px system-ui"; ctx.fillText("Räknar vägen …", 16, 28); return; }
  const key = sec.s.toFixed(1) + "|" + (c.spec.src || []).join(","); if (l3rs.scatKey !== key) { l3rs.scat = l3rsScatter(sec); l3rs.scatKey = key; }
  const zs = [sec.z]; sec.ground.forEach(q => { if (q[1] !== null) zs.push(q[1]); }); sec.line.forEach(q => zs.push(q[1]));
  let zmin = Math.min(...zs), zmax = Math.max(...zs); const padz = Math.max(1, (zmax - zmin) * 0.18); zmin -= padz; zmax += padz;
  const L = 52, R = 14, T = 30, B = 40, sx = (w - L - R) / (2 * sec.ext), sy = (h - T - B) / (zmax - zmin), sc = Math.min(sx, sy);   // lika skala i båda led
  const cxm = L + (w - L - R) / 2, cym = T + (h - T - B) / 2, zm = (zmax + zmin) / 2;
  const X = t => cxm - t * sc, Y = z => cym - (z - zm) * sc;   // vänster (+t) hamnar till vänster
  // rutnät och nivåer
  const gs = l3rsNice(30 / sc); ctx.font = "11px system-ui"; ctx.textBaseline = "middle"; ctx.lineWidth = 1;
  for (let z = Math.ceil((zm - (h - T - B) / 2 / sc) / gs) * gs; z <= zm + (h - T - B) / 2 / sc + 1e-6; z += gs) { const y = Y(z); ctx.strokeStyle = L3RS_COL.grid; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(w - R, y); ctx.stroke(); ctx.fillStyle = "#64748b"; ctx.textAlign = "right"; ctx.fillText(l3rFmt(z, gs < 1 ? 1 : 0), L - 6, y); }
  ctx.strokeStyle = "#cbd5e1"; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(X(0), T - 6); ctx.lineTo(X(0), h - B + 6); ctx.stroke(); ctx.setLineDash([]);
  // schakt/fyllning mellan mark och väg
  for (let i = 0; i < sec.ground.length - 1; i++) {
    const a = sec.ground[i], b = sec.ground[i + 1]; if (a[1] === null || b[1] === null) continue; const da = sec.des(a[0]), db = sec.des(b[0]); if (da === null || db === null) continue;
    const mid = (a[1] + b[1] - da - db) / 2; ctx.fillStyle = mid > 0 ? "rgba(37,99,235,.28)" : "rgba(220,38,38,.28)";
    ctx.beginPath(); ctx.moveTo(X(a[0]), Y(a[1])); ctx.lineTo(X(b[0]), Y(b[1])); ctx.lineTo(X(b[0]), Y(db)); ctx.lineTo(X(a[0]), Y(da)); ctx.closePath(); ctx.fill();
  }
  // punktmolnets punkter
  ctx.fillStyle = L3RS_COL.scat; (l3rs.scat || []).forEach(q => { ctx.fillRect(X(q[0]) - 1, Y(q[1]) - 1, 2, 2); });
  // marken
  ctx.strokeStyle = L3RS_COL.ground; ctx.lineWidth = 2; ctx.beginPath(); let pen = false; sec.ground.forEach(q => { if (q[1] === null) { pen = false; return; } if (!pen) { ctx.moveTo(X(q[0]), Y(q[1])); pen = true; } else ctx.lineTo(X(q[0]), Y(q[1])); }); ctx.stroke();
  // vägen och slänterna
  const seg = (a, b, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(X(a[0]), Y(a[1])); ctx.lineTo(X(b[0]), Y(b[1])); ctx.stroke(); };
  const Wh = sec.W / 2; ctx.fillStyle = "rgba(55,65,81,.18)"; ctx.fillRect(X(Wh), Y(sec.z), 2 * Wh * sc, 5);
  if (sec.SL.kind !== "none") seg([Wh, sec.z], [Wh + sec.SL.d, sec.SL.qz], sec.SL.kind === "cut" ? L3RS_COL.cut : L3RS_COL.fill, 3);
  if (sec.SR.kind !== "none") seg([-Wh, sec.z], [-Wh - sec.SR.d, sec.SR.qz], sec.SR.kind === "cut" ? L3RS_COL.cut : L3RS_COL.fill, 3);
  seg([Wh, sec.z], [-Wh, sec.z], L3RS_COL.road, 4);
  // mått
  ctx.fillStyle = L3RS_COL.dim; ctx.strokeStyle = L3RS_COL.dim; ctx.lineWidth = 1; ctx.font = "12px system-ui"; ctx.textAlign = "center";
  const yd = Y(sec.z) + 22; ctx.beginPath(); ctx.moveTo(X(Wh), yd); ctx.lineTo(X(-Wh), yd); ctx.moveTo(X(Wh), yd - 4); ctx.lineTo(X(Wh), yd + 4); ctx.moveTo(X(-Wh), yd - 4); ctx.lineTo(X(-Wh), yd + 4); ctx.stroke();
  ctx.textBaseline = "top"; ctx.fillText(`${l3rFmt(sec.W, 2)} m`, X(0), yd + 4); ctx.textBaseline = "middle";
  [[sec.SL, 1], [sec.SR, -1]].forEach(([S, sg]) => { if (S.kind === "none") return; const k = S.kind === "cut" ? sec.spec.cutR : sec.spec.fillR, mx = sg * (Wh + S.d / 2), my = sec.z + (S.qz - sec.z) / 2; ctx.fillStyle = S.kind === "cut" ? L3RS_COL.cut : L3RS_COL.fill; ctx.textAlign = "center"; ctx.fillText(`1:${l3rFmt(k, 2)}`, X(mx) + (sg > 0 ? -26 : 26), Y(my) + (S.kind === "cut" ? -12 : 12)); ctx.fillStyle = "#475569"; ctx.fillText(`${S.hit ? "" : "≥ "}${l3rFmt(S.d, 1)} m`, X(sg * (Wh + S.d)), Y(S.qz) - 12); });
  { const above = sec.gc !== null && sec.gc !== undefined && sec.gc >= sec.z; ctx.textAlign = "left"; ctx.fillStyle = L3RS_COL.road; ctx.fillText(`Väg ${l3rFmt(sec.z, 2)}`, X(0) + 8, Y(sec.z) + (above ? 18 : -12));
    if (sec.gc !== null && sec.gc !== undefined) { ctx.fillStyle = L3RS_COL.ground; ctx.fillText(`Mark ${l3rFmt(sec.gc, 2)}`, X(0) + 8, Y(sec.gc) + (above ? -12 : 14)); } }
  // rubrik
  ctx.fillStyle = "#0f172a"; ctx.font = "600 13px system-ui"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText(`Tvärsektion  Station ${l3rsStation(sec.s)}`, L, 18);
  ctx.font = "12px system-ui"; ctx.textAlign = "right"; ctx.fillStyle = L3RS_COL.cut; ctx.fillText(`Schakt ${l3rFmt(sec.cut, 1)} m²`, w - R - 130, 18); ctx.fillStyle = L3RS_COL.fill; ctx.fillText(`Fyllning ${l3rFmt(sec.fill, 1)} m²`, w - R, 18);
  ctx.fillStyle = "#64748b"; ctx.textAlign = "left"; ctx.fillText("◄ vänster", L, h - 8); ctx.textAlign = "right"; ctx.fillText("höger ►", w - R, h - 8);
}
function l3rsDrawProfile() {
  const c = l3road.cur, cv = l3rs.lp; if (!cv || !c || !c.st) return; const { ctx, w, h } = l3rsFit(cv), st = c.st, Ls = st[st.length - 1].s;
  const zs = []; st.forEach(p => { zs.push(p.g, p.z); }); let zmin = Math.min(...zs), zmax = Math.max(...zs); const pz = Math.max(1, (zmax - zmin) * 0.15); zmin -= pz; zmax += pz;
  const L = 52, R = 14, T = 8, B = 16, X = s => L + s / Ls * (w - L - R), Y = z => T + (zmax - z) / (zmax - zmin) * (h - T - B);
  ctx.font = "11px system-ui"; ctx.textBaseline = "middle"; ctx.textAlign = "right"; ctx.fillStyle = "#64748b"; ctx.strokeStyle = L3RS_COL.grid;
  const gs = l3rsNice((zmax - zmin) / 3); for (let z = Math.ceil(zmin / gs) * gs; z <= zmax; z += gs) { ctx.beginPath(); ctx.moveTo(L, Y(z)); ctx.lineTo(w - R, Y(z)); ctx.stroke(); ctx.fillText(l3rFmt(z, gs < 1 ? 1 : 0), L - 6, Y(z)); }
  const line = (key, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); st.forEach((p, i) => { i ? ctx.lineTo(X(p.s), Y(p[key])) : ctx.moveTo(X(p.s), Y(p[key])); }); ctx.stroke(); };
  ctx.beginPath(); st.forEach((p, i) => { i ? ctx.lineTo(X(p.s), Y(p.g)) : ctx.moveTo(X(p.s), Y(p.g)); }); for (let i = st.length - 1; i >= 0; i--) ctx.lineTo(X(st[i].s), Y(st[i].z)); ctx.closePath(); ctx.fillStyle = "rgba(100,116,139,.12)"; ctx.fill();
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
  if (!l3rs.open || !l3rs.sec) return; const sec = l3rs.sec, O = l3.O, e = sec.W / 2 + Math.max(sec.SL.d || 0, sec.SR.d || 0) + 2, z = sec.z + 0.3;
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
      <button type="button" data-rsb="play" title="Färdas längs linjen">▶</button><button type="button" data-rsb="x" title="Stäng">✕</button></div>
      <canvas class="v3-rsec-lp"></canvas><input type="range" data-rss min="0" max="${l3rsLen()}" step="0.5" value="0" title="Dra för att färdas längs linjen (pil vänster/höger flyttar 1 m)">
      <canvas class="v3-rsec-cv"></canvas>
      <div class="v3-rsec-f"><span>Avstånd</span><input type="number" data-rsi value="10" min="1" max="200" step="1"> m<label><input type="checkbox" data-rsp checked> med längdprofil</label><button type="button" class="primary" data-rsb="dxf" title="Tvärsektioner med valt avstånd (och längdprofilen) som ritblad i DXF – i bladets eget system, meter">Exportera DXF</button><button type="button" data-rsb="png" title="Sparar snittet du ser som bild">Bild</button></div>`;
    l3rs.cv = el.querySelector(".v3-rsec-cv"); l3rs.lp = el.querySelector(".v3-rsec-lp");
    const sl = el.querySelector("[data-rss]"); sl.oninput = () => { l3rs.play = false; l3rsUi(); l3rsSet(Number(sl.value), true); };
    const lp = l3rs.lp, at = e => { const r = lp.getBoundingClientRect(), X0 = (lp._L || 52), Wd = r.width - (lp._L || 52) - (lp._R || 14); return Math.max(0, Math.min(1, (e.clientX - r.left - X0) / Wd)) * (lp._Ls || l3rsLen()); };
    lp.onpointerdown = e => { l3rs.play = false; l3rsUi(); lp.setPointerCapture(e.pointerId); l3rsSet(at(e), true); lp.onpointermove = ev => l3rsSet(at(ev), true); lp.onpointerup = () => { lp.onpointermove = null; lp.onpointerup = null; }; };
    el.querySelector("[data-rsf]").onchange = e => { l3rs.follow = e.target.checked; };
    el.querySelector("[data-rsv]").onchange = e => { l3rs.speed = Math.max(1, Number(e.target.value) || 8); };
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
  let halfW = 4, dzMax = 2; secs.forEach(sec => { halfW = Math.max(halfW, sec.ext); sec.ground.forEach(q => { if (q[1] !== null) dzMax = Math.max(dzMax, Math.abs(q[1] - sec.z)); }); sec.line.forEach(q => { dzMax = Math.max(dzMax, Math.abs(q[1] - sec.z)); }); });
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
    tx("SEK-TEXT", ox + 1, oy + ch - 1.6, 1.0, `Tvärsektion  Station ${l3rsStation(sec.s)}`, { ha: 0 });
    tx("SEK-TEXT", ox + 1, oy + ch - 3.0, 0.7, `Vägens nivå ${l3rFmt(sec.z, 2)} m (±0 i bladet)  ·  Schakt ${l3rFmt(sec.cut, 1)} m2  ·  Fyllning ${l3rFmt(sec.fill, 1)} m2`);
    // mark (brutna där höjd saknas)
    let run = []; const flush = () => { if (run.length > 1) pl("SEK-MARK", run, false); run = []; };
    sec.ground.forEach(q => { if (q[1] === null) flush(); else run.push([X(q[0]), Y(q[1])]); }); flush();
    // väg och slänter
    pl("SEK-VAG", [[X(sec.W / 2), Y(sec.z)], [X(-sec.W / 2), Y(sec.z)]], false);
    [[sec.SL, 1], [sec.SR, -1]].forEach(([S, sg]) => { if (S.kind === "none") return; pl(S.kind === "cut" ? "SEK-SLANT-SCHAKT" : "SEK-SLANT-FYLLNING", [[X(sg * sec.W / 2), Y(sec.z)], [X(sg * (sec.W / 2 + S.d)), Y(S.qz)]], false); tx("SEK-MATT", X(sg * (sec.W / 2 + S.d / 2)) + (sg > 0 ? -1.2 : 1.2), Y(sec.z + (S.qz - sec.z) / 2) + (S.kind === "cut" ? 0.7 : -1.1), 0.6, `1:${l3rFmt(S.kind === "cut" ? sec.spec.cutR : sec.spec.fillR, 2)}`, { mid: true }); tx("SEK-MATT", X(sg * (sec.W / 2 + S.d)), Y(S.qz) + 0.8, 0.5, `${l3rFmt(S.qz, 2)}`, { mid: true }); });
    // mått: bredd + nivåer vid vägkanterna och mitten
    const yd = Y(sec.z) - 1.6; pl("SEK-MATT", [[X(sec.W / 2), yd], [X(-sec.W / 2), yd]], false); pl("SEK-MATT", [[X(sec.W / 2), yd - 0.3], [X(sec.W / 2), yd + 0.3]], false); pl("SEK-MATT", [[X(-sec.W / 2), yd - 0.3], [X(-sec.W / 2), yd + 0.3]], false);
    tx("SEK-MATT", X(0), yd - 1.0, 0.7, `${l3rFmt(sec.W, 2)} m`, { mid: true });
    if (sec.gc !== null && sec.gc !== undefined) tx("SEK-TEXT", X(0), Y(sec.gc) + (sec.gc >= sec.z ? 0.6 : -1.2), 0.5, `Mark ${l3rFmt(sec.gc, 2)}`, { mid: true });
    tx("SEK-TEXT", X(0), Y(sec.z) + 0.55, 0.5, `Väg ${l3rFmt(sec.z, 2)}`, { mid: true });
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
