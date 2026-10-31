/* Profil / snitt mellan punktmolnen – fullvärdig profilvy (Victor 2026-10-31: "exportera som DXF, visa i fullskärm, zooma osv … gör den superbra").
   • Alla tända moln i samma snitt: yta som linje (median, medel, övre eller nedre) och/eller punkter, med egna färger och av/på per moln.
   • Jämför A mot B: skuggad skillnad (blå = A lägre = schakt, röd = A högre = fyllning) och tvärsnittsarea i m².
   • Fullskärm (F), zoom med hjulet (Skift = bara längd, Ctrl = bara höjd), dra för att panorera, dubbelklick = hela, höjdöverdrift eller 1:1.
   • Musen i diagrammet visar höjderna och skillnaden, och en markör följer med längs linjen i 3D.
   • Export: DXF (profilen i längd/höjd, med rutnät, text och skillnadsytor), DXF (3D-linjer i modellens koordinater), CSV, PNG. */
const l3pf = { A: null, B: null, w: 0.5, data: null, el: null, cv: null, mode: "median", show: "line", bw: 0, hide: new Set(), cmp: null, diffOn: true, view: null, ex: 0, fs: false, hover: null, drag: null, grp: null, mark: null, lines: null, diff: null, raf: 0 };
const L3PF_COL = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2"], L3PF_ACI = [5, 1, 3, 30, 6, 4];
const L3PF_CSS = `#v3PcProf{position:absolute;right:64px;bottom:12px;z-index:22;width:min(760px,calc(100% - 80px));height:min(420px,70%);display:flex;flex-direction:column;background:var(--v3-panel,#fff);border:1px solid rgba(0,0,0,.12);border-radius:14px;box-shadow:0 10px 32px rgba(0,0,0,.22);padding:8px 10px;font:12px system-ui,sans-serif;color:#0f172a}
#v3PcProf.fs{position:absolute;inset:0;right:0;bottom:0;width:auto;height:auto;z-index:45;border-radius:0}#v3PcProf label{display:inline-flex;gap:4px;align-items:center}#v3PcProf .r{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:3px 0}#v3PcProf canvas{flex:1;min-height:120px;width:100%;display:block;background:#f8fafc;border-radius:8px;cursor:crosshair;touch-action:none}
#v3PcProf button,#v3PcProf select,#v3PcProf input[type=text]{border:1px solid rgba(0,0,0,.16);background:#fff;border-radius:8px;padding:3px 8px;font:inherit;cursor:pointer;color:inherit}#v3PcProf button.on{background:#2563eb;color:#fff;border-color:#2563eb}#v3PcProf input[type=text]{width:54px;cursor:text}
#v3PcProf .lg{display:inline-flex;gap:4px;align-items:center;cursor:pointer;user-select:none}#v3PcProf .lg i{width:11px;height:11px;border-radius:50%;display:inline-block}#v3PcProf .lg.off{opacity:.4;text-decoration:line-through}#v3PcProf .dd{position:relative}
#v3PcProf .dd>div{display:none;position:absolute;right:0;bottom:30px;background:#fff;border:1px solid rgba(0,0,0,.14);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.2);padding:4px;z-index:3;min-width:190px}#v3PcProf .dd.open>div{display:block}#v3PcProf .dd button{display:block;width:100%;text-align:left;border:0}`;
const l3pfF = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace(".", ",");
/* ---- Beräkning --------------------------------------------------------------------------------------------------------- */
/* Yta per ruta längs linjen: [t, z] per ruta (median/medel/övre/nedre); hål ≤ 4 rutor fylls, större hål bryter linjen (null). */
function l3pfLine(s, mode, bw, L) {
  const nb = Math.max(1, Math.ceil(L / bw)), cnt = new Uint32Array(nb + 1); const n = s.t.length, bin = new Int32Array(n);
  for (let i = 0; i < n; i++) { const b = Math.min(nb - 1, Math.max(0, Math.floor(s.t[i] / bw))); bin[i] = b; cnt[b + 1]++; }
  for (let b = 0; b < nb; b++) cnt[b + 1] += cnt[b];
  const at = cnt.slice(0, nb), zs = new Float32Array(n); for (let i = 0; i < n; i++) zs[at[bin[i]]++] = s.z[i];
  const out = new Array(nb).fill(null);
  for (let b = 0; b < nb; b++) {
    const a = cnt[b], e = cnt[b + 1]; if (e === a) continue; const part = zs.subarray(a, e); let v;
    if (mode === "max") { v = -Infinity; for (let i = 0; i < part.length; i++) if (part[i] > v) v = part[i]; }
    else if (mode === "min") { v = Infinity; for (let i = 0; i < part.length; i++) if (part[i] < v) v = part[i]; }
    else if (mode === "mean") { let q = 0; for (let i = 0; i < part.length; i++) q += part[i]; v = q / part.length; }
    else { const c = Float32Array.from(part).sort(); v = c[c.length >> 1]; }
    out[b] = v;
  }
  // fyll små hål
  let last = -1; for (let b = 0; b < nb; b++) { if (out[b] == null) continue; if (last >= 0 && b - last > 1 && b - last <= 5) { for (let k = last + 1; k < b; k++) out[k] = out[last] + (out[b] - out[last]) * (k - last) / (b - last); } last = b; }
  return { bw, v: out, t: b => (b + 0.5) * bw };
}
const l3pfAt = (ln, t) => { const b = Math.min(ln.v.length - 1, Math.max(0, Math.floor(t / ln.bw))); return ln.v[b]; };
function l3pfCompute() {
  const D = l3pf.data; if (!D) return; const bw = l3pf.bw || Math.max(0.05, Math.round(D.L / 600 * 100) / 100);
  l3pf.lines = D.series.map(s => l3pfLine(s, l3pf.mode, bw, D.L)); l3pf.diff = null;
  const ids = D.series.map(s => s.id); if (!l3pf.cmp || !ids.includes(l3pf.cmp[0]) || !ids.includes(l3pf.cmp[1])) l3pf.cmp = ids.length >= 2 ? [ids[0], ids[1]] : null;
  if (l3pf.cmp) {
    const A = l3pf.lines[ids.indexOf(l3pf.cmp[0])], B = l3pf.lines[ids.indexOf(l3pf.cmp[1])], dz = A.v.map((v, i) => v == null || B.v[i] == null ? null : v - B.v[i]); let cut = 0, fill = 0, n = 0, mx = 0, mn = 0;
    dz.forEach(d => { if (d == null) return; n++; if (d < 0) { cut += -d * A.bw; if (d < mn) mn = d; } else { fill += d * A.bw; if (d > mx) mx = d; } });
    l3pf.diff = { dz, bw: A.bw, cut, fill, n, mx, mn, cover: n * A.bw };
  }
}
/* ---- Panel ------------------------------------------------------------------------------------------------------------ */
function l3pfShow(A, B, w) {
  l3pfClear(true); l3pf.A = A; l3pf.B = B; l3pf.w = w; l3pf.data = l3ptProfile(A, B, w); l3pf.hide = new Set(); l3pf.ex = 0; l3pf.hover = null; if (typeof l3pt !== "undefined") l3pt.prof = true;
  const D = l3pf.data; D.series.forEach((s, i) => { s.color = L3PF_COL[i % L3PF_COL.length]; s.aci = L3PF_ACI[i % L3PF_ACI.length]; }); l3pfCompute();
  if (!document.getElementById("v3PcProfCss")) { const st = document.createElement("style"); st.id = "v3PcProfCss"; st.textContent = L3PF_CSS; document.head.appendChild(st); }
  const host = document.getElementById("v3Canvas"); let el = document.getElementById("v3PcProf"); if (el) el.remove(); el = document.createElement("div"); el.id = "v3PcProf"; host.appendChild(el); l3pf.el = el;
  ["pointerdown", "click", "dblclick", "wheel", "contextmenu", "keydown"].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
  l3pf3d(); l3pfUI(); l3pfFit(); l3pfDraw();
  if (!D.series.some(s => s.n)) l3Status("Inga punkter inom profilens bredd – öka bredden eller dra linjen över molnet.", true);
  if (typeof l3ptRender === "function") l3ptRender();
}
function l3pfUI() {
  const el = l3pf.el, D = l3pf.data, esc = typeof escHtml === "function" ? escHtml : String, opt = (v, l, cur) => `<option value="${v}" ${String(cur) === String(v) ? "selected" : ""}>${l}</option>`;
  el.innerHTML = `<div class="r"><b>Profil</b><span>Längd ${l3pfF(D.L, 1)} m · bredd ±${l3pfF(l3pf.w, 2)} m</span><span style="flex:1"></span>
    <button type="button" data-pf="fit" title="Zooma till hela profilen (dubbelklick)">Hela</button><button type="button" data-pf="one" class="${l3pf.ex === 1 ? "on" : ""}" title="Sant 1:1-förhållande mellan längd och höjd">1:1</button>
    <label title="Höjdöverdrift">Höjd ×<select data-pf="ex">${[0, 1, 2, 5, 10, 20].map(v => opt(v, v ? v + "×" : "Auto", l3pf.ex)).join("")}</select></label>
    <button type="button" data-pf="fs" title="Fullskärm (F)">⛶</button><button type="button" data-pf="x" title="Stäng">✕</button></div>
  <div class="r"><label>Yta <select data-pf="mode">${opt("median", "Median", l3pf.mode)}${opt("mean", "Medel", l3pf.mode)}${opt("max", "Övre (topp)", l3pf.mode)}${opt("min", "Nedre (mark)", l3pf.mode)}</select></label>
    <label>Visa <select data-pf="show">${opt("line", "Linje", l3pf.show)}${opt("pts", "Punkter", l3pf.show)}${opt("both", "Båda", l3pf.show)}</select></label>
    <label title="Rutbredd längs profilen för ytlinjen (m)">Ruta <input type="text" data-pf="bw" value="${l3pf.bw ? l3pfF(l3pf.bw, 2) : ""}" placeholder="auto"></label>
    <label title="Tvärsnittets bredd åt varje sida (m) – räknas om"><span>Bredd ±</span> <input type="text" data-pf="w" value="${l3pfF(l3pf.w, 2)}"></label>
    <span class="dd"><button type="button" data-pf="dd">Exportera ▾</button><div><button type="button" data-pf="dxf">DXF – profil (längd/höjd)</button><button type="button" data-pf="dxf3">DXF – 3D-linjer i modellen</button><button type="button" data-pf="csv">CSV – punkter och ytlinje</button><button type="button" data-pf="png">PNG – bild</button></div></span></div>
  <div class="r" data-pf-leg>${D.series.map((s, i) => `<span class="lg ${l3pf.hide.has(s.id) ? "off" : ""}" data-pf-lg="${esc(s.id)}" title="Tryck för att visa/dölja"><i style="background:${s.color}"></i>${esc(s.name)} (${s.n.toLocaleString("sv-SE")} p)</span>`).join("")}
    ${D.series.length >= 2 ? `<span style="flex:1"></span><label>Jämför <select data-pf="ca">${D.series.map(s => opt(s.id, esc(s.name), l3pf.cmp && l3pf.cmp[0])).join("")}</select> mot <select data-pf="cb">${D.series.map(s => opt(s.id, esc(s.name), l3pf.cmp && l3pf.cmp[1])).join("")}</select></label><label class="lg"><input type="checkbox" data-pf="dif" ${l3pf.diffOn ? "checked" : ""}> Skillnad</label>` : ""}</div>
  <canvas></canvas><div class="r" data-pf-info></div>`;
  l3pf.cv = el.querySelector("canvas"); l3pfInfo(); l3pfBind();
}
function l3pfInfo() {
  const e = l3pf.el && l3pf.el.querySelector("[data-pf-info]"); if (!e) return; const d = l3pf.diff, D = l3pf.data;
  e.innerHTML = d && d.n ? `<span title="Tvärsnittsarea mellan de två ytorna (m²) – gånger sträckan mellan profilerna blir volymen"><b style="color:#2563eb">Schakt ${l3pfF(d.cut, 2)} m²</b> (A lägre än B)</span><span><b style="color:#dc2626">Fyllning ${l3pfF(d.fill, 2)} m²</b> (A högre)</span><span>Netto ${l3pfF(d.fill - d.cut, 2)} m²</span><span>Störst ${l3pfF(-d.mn, 2)} m under · ${l3pfF(d.mx, 2)} m över</span><span class="t">jämförd längd ${l3pfF(d.cover, 1)} av ${l3pfF(D.L, 1)} m</span>`
    : `<span class="t">${D.series.length < 2 ? "Tänd ett andra moln (eller en modell) för att jämföra ytorna." : "Ytorna överlappar inte längs profilen."} Hjul = zooma, Skift+hjul = längd, Ctrl+hjul = höjd, dra = panorera, dubbelklick = hela.</span>`;
}
function l3pfBind() {
  const el = l3pf.el, on = (sel, fn) => el.querySelectorAll(sel).forEach(fn);
  el.onclick = e => {
    const b = e.target.closest("[data-pf]"), lg = e.target.closest("[data-pf-lg]");
    if (lg) { const id = lg.dataset.pfLg; l3pf.hide.has(id) ? l3pf.hide.delete(id) : l3pf.hide.add(id); lg.classList.toggle("off", l3pf.hide.has(id)); l3pfDraw(); return; }
    if (!b || b.tagName === "SELECT" || b.tagName === "INPUT") return; const a = b.dataset.pf;
    if (a === "dd") { b.parentNode.classList.toggle("open"); return; } el.querySelectorAll(".dd.open").forEach(d => d.classList.remove("open"));
    if (a === "fit") { l3pfFit(); l3pfDraw(); } else if (a === "one") { l3pf.ex = l3pf.ex === 1 ? 0 : 1; l3pfUI(); l3pfFit(); l3pfDraw(); } else if (a === "fs") l3pfFs(); else if (a === "x") l3pfClear();
    else if (a === "dxf") l3pfDxf(false); else if (a === "dxf3") l3pfDxf(true); else if (a === "csv") l3pfCsv(); else if (a === "png") l3pfPng();
  };
  el.onchange = e => {
    const t = e.target, a = t.dataset.pf; if (!a) return;
    if (a === "mode") { l3pf.mode = t.value; l3pfCompute(); l3pfInfo(); l3pfDraw(); } else if (a === "show") { l3pf.show = t.value; l3pfDraw(); }
    else if (a === "ex") { l3pf.ex = Number(t.value) || 0; l3pfFit(); l3pfDraw(); } else if (a === "bw") { const v = Number(String(t.value).replace(",", ".")); l3pf.bw = v > 0.005 ? v : 0; l3pfCompute(); l3pfInfo(); l3pfDraw(); }
    else if (a === "w") { const v = Number(String(t.value).replace(",", ".")); if (v > 0.01) l3pfShow(l3pf.A, l3pf.B, v); } else if (a === "ca" || a === "cb") { const x = el.querySelector('[data-pf="ca"]').value, y = el.querySelector('[data-pf="cb"]').value; l3pf.cmp = [x, y]; l3pfCompute(); l3pfInfo(); l3pfDraw(); }
    else if (a === "dif") { l3pf.diffOn = t.checked; l3pfDraw(); }
  };
  const cv = l3pf.cv; let moved = 0;
  cv.addEventListener("wheel", e => {
    e.preventDefault(); e.stopPropagation(); const V = l3pf.view, r = cv.getBoundingClientRect(), g = l3pfGeom(), px = e.clientX - r.left, py = e.clientY - r.top, f = Math.exp(e.deltaY * 0.0016);
    const t = V.x0 + (px - g.l) / g.w * (V.x1 - V.x0), z = V.z0 + (g.t + g.h - py) / g.h * (V.z1 - V.z0), zx = !e.ctrlKey, zz = !e.shiftKey;
    if (zx) { V.x0 = t - (t - V.x0) * f; V.x1 = t + (V.x1 - t) * f; }
    if (zz && !(zx && l3pf.ex > 0)) { V.z0 = z - (z - V.z0) * f; V.z1 = z + (V.z1 - z) * f; }
    if (zx && zz && l3pf.ex > 0) l3pfKeepRatio(V);
    l3pfDraw();
  }, { passive: false });
  cv.addEventListener("pointerdown", e => { if (e.button !== 0 && e.button !== 1) return; cv.setPointerCapture(e.pointerId); l3pf.drag = { x: e.clientX, y: e.clientY, v: { ...l3pf.view } }; moved = 0; });
  cv.addEventListener("pointermove", e => {
    const r = cv.getBoundingClientRect(), g = l3pfGeom(), d = l3pf.drag;
    if (d) { const dx = e.clientX - d.x, dy = e.clientY - d.y; moved = Math.max(moved, Math.hypot(dx, dy)); if (moved > 3) { const V = l3pf.view, sx = (d.v.x1 - d.v.x0) / g.w, sz = (d.v.z1 - d.v.z0) / g.h; V.x0 = d.v.x0 - dx * sx; V.x1 = d.v.x1 - dx * sx; V.z0 = d.v.z0 + dy * sz; V.z1 = d.v.z1 + dy * sz; } }
    const V = l3pf.view; const t = V.x0 + (e.clientX - r.left - g.l) / g.w * (V.x1 - V.x0); l3pf.hover = t >= 0 && t <= l3pf.data.L && e.clientX - r.left >= g.l ? t : null; l3pfMark(); l3pfDraw();
  });
  cv.addEventListener("pointerleave", () => { l3pf.hover = null; l3pfMark(); l3pfDraw(); });
  cv.addEventListener("pointerup", () => { l3pf.drag = null; }); cv.addEventListener("dblclick", () => { l3pfFit(); l3pfDraw(); });
  if (window.ResizeObserver) { l3pf.ro = new ResizeObserver(() => l3pfDraw()); l3pf.ro.observe(cv); }
}
/* Visningsområdet: hela profilen med lite luft; med höjdöverdrift (eller 1:1) styr förhållandet höjdspannet. */
function l3pfFit() {
  const D = l3pf.data, vis = D.series.filter(s => !l3pf.hide.has(s.id) && s.n); let lo = Infinity, hi = -Infinity;
  vis.forEach(s => { for (let i = 0; i < s.z.length; i += 3) { if (s.z[i] < lo) lo = s.z[i]; if (s.z[i] > hi) hi = s.z[i]; } });
  if (!isFinite(lo)) { lo = 0; hi = 1; } const pad = Math.max(0.2, (hi - lo) * 0.08); l3pf.view = { x0: 0, x1: D.L, z0: lo - pad, z1: hi + pad };
  if (l3pf.ex > 0) l3pfKeepRatio(l3pf.view, "fit");
}
function l3pfKeepRatio(V, from) {
  const g = l3pfGeom(); if (!g.w || !g.h) return; const need = (V.x1 - V.x0) * g.h / g.w / l3pf.ex, mid = (V.z0 + V.z1) / 2; V.z0 = mid - need / 2; V.z1 = mid + need / 2;
}
function l3pfGeom() { const cv = l3pf.cv, r = cv ? cv.getBoundingClientRect() : { width: 600, height: 240 }; return { l: 64, t: 12, w: Math.max(50, r.width - 64 - 14), h: Math.max(50, r.height - 12 - 32), W: r.width, H: r.height }; }
const l3pfNice = (span, n) => { const raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p; return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p; };
/* ---- Ritning ---------------------------------------------------------------------------------------------------------- */
function l3pfDraw(ctxOverride, size) {
  const cv = l3pf.cv; if (!cv || !l3pf.data || !l3pf.view) return; const cx = ctxOverride, dpr = Math.min(2, window.devicePixelRatio || 1), gm = size ? { ...l3pfGeom(), W: size[0], H: size[1], w: size[0] - 78, h: size[1] - 44 } : l3pfGeom(), V = l3pf.view;
  let g = cx; if (!g) { const bw = Math.round(gm.W * dpr), bh = Math.round(gm.H * dpr); if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; } g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); }
  g.fillStyle = "#f8fafc"; g.fillRect(0, 0, gm.W, gm.H);
  const X = t => gm.l + (t - V.x0) / (V.x1 - V.x0) * gm.w, Y = z => gm.t + gm.h - (z - V.z0) / (V.z1 - V.z0) * gm.h;
  g.save(); g.beginPath(); g.rect(gm.l, gm.t, gm.w, gm.h); g.clip(); g.fillStyle = "#fff"; g.fillRect(gm.l, gm.t, gm.w, gm.h);
  // rutnät
  const sx = l3pfNice(V.x1 - V.x0, 8), sz = l3pfNice(V.z1 - V.z0, 6); g.lineWidth = 1; g.strokeStyle = "#e2e8f0";
  for (let t = Math.ceil(V.x0 / sx) * sx; t <= V.x1; t += sx) { g.beginPath(); g.moveTo(X(t), gm.t); g.lineTo(X(t), gm.t + gm.h); g.stroke(); }
  for (let z = Math.ceil(V.z0 / sz) * sz; z <= V.z1; z += sz) { g.beginPath(); g.moveTo(gm.l, Y(z)); g.lineTo(gm.l + gm.w, Y(z)); g.stroke(); }
  const D = l3pf.data, vis = i => !l3pf.hide.has(D.series[i].id);
  // skillnadsyta
  const df = l3pf.diff; if (df && l3pf.diffOn && l3pf.cmp) { const ids = D.series.map(s => s.id), A = l3pf.lines[ids.indexOf(l3pf.cmp[0])], B = l3pf.lines[ids.indexOf(l3pf.cmp[1])]; if (vis(ids.indexOf(l3pf.cmp[0])) && vis(ids.indexOf(l3pf.cmp[1]))) for (let b = 0; b < A.v.length; b++) { if (df.dz[b] == null) continue; const x0 = X(b * A.bw), x1 = X((b + 1) * A.bw); g.fillStyle = df.dz[b] < 0 ? "rgba(37,99,235,.28)" : "rgba(220,38,38,.28)"; g.fillRect(x0, Math.min(Y(A.v[b]), Y(B.v[b])), Math.max(1, x1 - x0 + 0.5), Math.abs(Y(A.v[b]) - Y(B.v[b])) || 1); } }
  // punkter och linjer
  D.series.forEach((s, i) => {
    if (!vis(i)) return; g.fillStyle = s.color;
    if (l3pf.show !== "line") { const step = Math.max(1, Math.floor(s.pts.length / 9000)), a = l3pf.show === "both" ? 0.35 : 1; g.globalAlpha = a; for (let k = 0; k < s.pts.length; k += step) { const q = s.pts[k]; g.fillRect(X(q[0]) - 1, Y(q[2]) - 1, 2.4, 2.4); } g.globalAlpha = 1; }
    if (l3pf.show !== "pts") { const ln = l3pf.lines[i]; g.strokeStyle = s.color; g.lineWidth = 2.2; g.lineJoin = "round"; g.beginPath(); let pen = false; ln.v.forEach((v, b) => { if (v == null) { pen = false; return; } const x = X(ln.t(b)), y = Y(v); if (!pen) { g.moveTo(x, y); pen = true; } else g.lineTo(x, y); }); g.stroke(); }
  });
  // markör
  if (l3pf.hover != null) { const x = X(l3pf.hover); g.strokeStyle = "#0f172a"; g.lineWidth = 1; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(x, gm.t); g.lineTo(x, gm.t + gm.h); g.stroke(); g.setLineDash([]); D.series.forEach((s, i) => { if (!vis(i)) return; const z = l3pfAt(l3pf.lines[i], l3pf.hover); if (z != null) { g.fillStyle = s.color; g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.arc(x, Y(z), 5, 0, 6.2832); g.fill(); g.stroke(); } }); }
  g.restore();
  // axlar
  g.fillStyle = "#475569"; g.font = "11px system-ui"; g.textAlign = "right";
  for (let z = Math.ceil(V.z0 / sz) * sz; z <= V.z1; z += sz) g.fillText(l3pfF(z, sz < 0.1 ? 2 : sz < 1 ? 1 : 0), gm.l - 6, Y(z) + 4);
  g.textAlign = "center"; for (let t = Math.ceil(V.x0 / sx) * sx; t <= V.x1; t += sx) g.fillText(l3pfF(t, sx < 1 ? 1 : 0) + " m", X(t), gm.t + gm.h + 16);
  g.strokeStyle = "#94a3b8"; g.strokeRect(gm.l, gm.t, gm.w, gm.h);
  // avläsning
  if (l3pf.hover != null) {
    const rows = [`Avstånd ${l3pfF(l3pf.hover, 2)} m`]; D.series.forEach((s, i) => { if (!vis(i)) return; const z = l3pfAt(l3pf.lines[i], l3pf.hover); rows.push([s.color, `${s.name}: ${z == null ? "–" : l3pfF(z, 2) + " m"}`]); });
    if (df && l3pf.cmp) { const ids = D.series.map(s => s.id), a = l3pfAt(l3pf.lines[ids.indexOf(l3pf.cmp[0])], l3pf.hover), b = l3pfAt(l3pf.lines[ids.indexOf(l3pf.cmp[1])], l3pf.hover); if (a != null && b != null) rows.push([a < b ? "#2563eb" : "#dc2626", `Δ ${l3pfF(a - b, 2)} m (${a < b ? "schakt" : "fyllning"})`]); }
    g.font = "12px system-ui"; const wd = Math.max(...rows.map(r => g.measureText(typeof r === "string" ? r : r[1]).width)) + 22, hx = X(l3pf.hover) + 14 + wd > gm.l + gm.w ? X(l3pf.hover) - wd - 10 : X(l3pf.hover) + 12;
    g.fillStyle = "rgba(255,255,255,.94)"; g.strokeStyle = "#cbd5e1"; g.lineWidth = 1; g.beginPath(); g.rect(hx, gm.t + 6, wd, rows.length * 17 + 8); g.fill(); g.stroke(); g.textAlign = "left";
    rows.forEach((r, k) => { g.fillStyle = typeof r === "string" ? "#0f172a" : r[0]; g.fillText(typeof r === "string" ? r : r[1], hx + 8, gm.t + 22 + k * 17); });
  }
}
/* ---- 3D: linje, band och en markör som följer musen ------------------------------------------------------------------- */
function l3pf3d() {
  const A = l3pf.A, B = l3pf.B, z = (A[2] + B[2]) / 2, w = l3pf.w, dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * w, ny = dx / L * w, V = (x, y, zz) => new THREE.Vector3(x, y, zz);
  const grp = new THREE.Group(), lm = new THREE.LineBasicMaterial({ color: 0xdc2626, depthTest: false }), ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(A[0], A[1], A[2]), V(B[0], B[1], B[2])]), lm); ln.renderOrder = 30;
  const band = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([V(A[0] + nx, A[1] + ny, z), V(B[0] + nx, B[1] + ny, z), V(B[0] - nx, B[1] - ny, z), V(A[0] - nx, A[1] - ny, z)]), new THREE.LineBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.45, depthTest: false })); band.renderOrder = 29;
  const mk = new THREE.Points(new THREE.BufferGeometry().setFromPoints([V(0, 0, 0)]), new THREE.PointsMaterial({ color: 0x0f172a, size: 11, sizeAttenuation: false, depthTest: false })); mk.renderOrder = 31; mk.visible = false;
  [ln, band, mk].forEach(o => { o.userData.noHit = true; o.raycast = () => {}; grp.add(o); }); l3.scene.add(grp); l3pf.grp = grp; l3pf.mark = mk; l3Render();
}
function l3pfMark() {
  const mk = l3pf.mark; if (!mk) return; if (l3pf.hover == null) { if (mk.visible) { mk.visible = false; l3Render(); } return; }
  const A = l3pf.A, B = l3pf.B, L = l3pf.data.L, t = l3pf.hover / L, i = l3pf.lines.findIndex((l, k) => !l3pf.hide.has(l3pf.data.series[k].id) && l3pfAt(l, l3pf.hover) != null), z = i >= 0 ? l3pfAt(l3pf.lines[i], l3pf.hover) - l3.O[2] : (A[2] + B[2]) / 2;
  mk.position.set(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, z); mk.visible = true; l3Render();
}
function l3pfClear(keepData) {
  if (l3pf.ro) { l3pf.ro.disconnect(); l3pf.ro = null; } if (document.fullscreenElement && l3pf.el && document.fullscreenElement === l3pf.el) document.exitFullscreen().catch(() => {});
  const e = document.getElementById("v3PcProf"); if (e) e.remove(); l3pf.el = l3pf.cv = null; l3pf.fs = false;
  if (l3pf.grp) { l3.scene.remove(l3pf.grp); l3pf.grp.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); l3pf.grp = l3pf.mark = null; l3Render(); }
  if (!keepData) { l3pf.data = null; if (typeof l3pt !== "undefined") l3pt.prof = null; }
}
function l3pfFs() {
  const el = l3pf.el; if (!el) return; l3pf.fs = !l3pf.fs; el.classList.toggle("fs", l3pf.fs); const b = el.querySelector('[data-pf="fs"]'); if (b) b.classList.toggle("on", l3pf.fs);
  if (l3pf.fs) { try { const p = el.requestFullscreen && el.requestFullscreen(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* bara överlägget */ } } else if (document.fullscreenElement === el) document.exitFullscreen().catch(() => {});
  setTimeout(() => { l3pfFit(); l3pfDraw(); }, 60);
}
document.addEventListener("fullscreenchange", () => { if (l3pf.el && l3pf.fs && !document.fullscreenElement) { /* webbläsaren lämnade fullskärm – överlägget blir kvar */ } });
/* Tangenter från l3Key: F = fullskärm, Esc = lämna fullskärm / stäng, 0 = hela. */
function l3pfKey(e) {
  if (!l3pf.el) return false; const k = e.key.toLowerCase(); if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (k === "escape") { e.preventDefault(); e.stopPropagation(); if (l3pf.fs) l3pfFs(); else l3pfClear(); return true; }
  if (k === "f" && l3pf.fs) { e.preventDefault(); l3pfFs(); return true; } if (k === "0" && l3pf.fs) { e.preventDefault(); l3pfFit(); l3pfDraw(); return true; }
  return false;
}
/* ---- Export ------------------------------------------------------------------------------------------------------------- */
const l3pfAsc = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "?");
const l3pfLayer = s => l3pfAsc(s).replace(/[^A-Za-z0-9_\-]/g, "_").slice(0, 28) || "LAGER";
/* DXF R12 (AC1009): fungerar i alla CAD-program. kind3d = 3D-polylinjer i modellens koordinater, annars profilen i längd (X) och höjd (Y). */
function l3pfDxfText(kind3d) {
  const D = l3pf.data, ids = D.series.map(s => s.id), o = [], num = v => (Math.round(v * 1000) / 1000).toFixed(3), layers = new Map([["PROFIL_LINJE", 7]]), body = [];
  const lay = (n, aci) => { if (!layers.has(n)) layers.set(n, aci); return n; };
  const pl = (layer, pts, closed, three) => { body.push("0", "POLYLINE", "8", layer, "66", "1", "70", String((closed ? 1 : 0) + (three ? 8 : 0))); pts.forEach(q => body.push("0", "VERTEX", "8", layer, "10", num(q[0]), "20", num(q[1]), "30", num(q[2] || 0), ...(three ? ["70", "32"] : []))); body.push("0", "SEQEND", "8", layer); };
  const line = (layer, a, b) => body.push("0", "LINE", "8", layer, "10", num(a[0]), "20", num(a[1]), "30", num(a[2] || 0), "11", num(b[0]), "21", num(b[1]), "31", num(b[2] || 0));
  const text = (layer, p, h, s) => body.push("0", "TEXT", "8", layer, "10", num(p[0]), "20", num(p[1]), "30", "0.000", "40", num(h), "1", l3pfAsc(s));
  const A = l3pf.A, B = l3pf.B, ox = A[0] + l3.O[0], oy = A[1] + l3.O[1], L = D.L, ux = (B[0] - A[0]) / L, uy = (B[1] - A[1]) / L, M = (t, z) => [ox + ux * t, oy + uy * t, z];
  if (kind3d) {
    line("PROFILLINJE", M(0, 0), M(L, 0));
    D.series.forEach((s, i) => { if (l3pf.hide.has(s.id)) return; const ln = l3pf.lines[i], lay_ = lay("PROFIL_" + l3pfLayer(s.name), s.aci); let seg = []; const flush = () => { if (seg.length > 1) pl(lay_, seg, false, true); seg = []; }; ln.v.forEach((v, b) => { if (v == null) flush(); else seg.push(M(ln.t(b), v)); }); flush(); });
  } else {
    const all = []; D.series.forEach((s, i) => { if (!l3pf.hide.has(s.id)) l3pf.lines[i].v.forEach(v => { if (v != null) all.push(v); }); }); const zlo = Math.floor(Math.min(...all, 0) / 1) * 1, zhi = Math.ceil(Math.max(...all, 1)), zs = l3pfNice(zhi - zlo, 8), th = Math.max(0.15, (zhi - zlo) / 60);
    // rutnät, axlar och text
    for (let z = Math.ceil(zlo / zs) * zs; z <= zhi + 1e-9; z += zs) { line("PROFIL_RUTNAT", [0, z], [L, z]); text("PROFIL_TEXT", [-th * 1.2 * String(l3pfF(z, 1)).length - 0.5, z - th / 2], th, l3pfF(z, 2)); }
    const xs = l3pfNice(L, 10); for (let t = 0; t <= L + 1e-9; t += xs) { line("PROFIL_RUTNAT", [t, zlo], [t, zhi]); text("PROFIL_TEXT", [t - th * 1.5, zlo - th * 2.4], th, l3pfF(t, xs < 1 ? 1 : 0) + " m"); }
    pl("PROFIL_RAM", [[0, zlo], [L, zlo], [L, zhi], [0, zhi]], true, false); lay("PROFIL_RAM", 8); lay("PROFIL_RUTNAT", 9); lay("PROFIL_TEXT", 7);
    D.series.forEach((s, i) => { if (l3pf.hide.has(s.id)) return; const ln = l3pf.lines[i], name = lay("PROFIL_" + l3pfLayer(s.name), s.aci); let seg = []; const flush = () => { if (seg.length > 1) pl(name, seg, false, false); seg = []; }; ln.v.forEach((v, b) => { if (v == null) flush(); else seg.push([ln.t(b), v]); }); flush(); text("PROFIL_TEXT", [L * 0.01, zhi - th * (2.2 + i * 1.6)], th, s.name); });
    // skillnadsytor som slutna polygoner per sammanhängande område + areatext
    const df = l3pf.diff; if (df && l3pf.diffOn && l3pf.cmp) {
      const a = l3pf.lines[ids.indexOf(l3pf.cmp[0])], b = l3pf.lines[ids.indexOf(l3pf.cmp[1])]; let run = null; const close = () => { if (run && run.top.length > 1) pl(run.neg ? lay("PROFIL_SCHAKT", 5) : lay("PROFIL_FYLLNING", 1), [...run.top, ...run.bot.slice().reverse()], true, false); run = null; };
      for (let k = 0; k < a.v.length; k++) { const d = df.dz[k]; if (d == null) { close(); continue; } const neg = d < 0; if (run && run.neg !== neg) close(); if (!run) run = { neg, top: [], bot: [] }; const t = a.t(k); run.top.push([t, a.v[k]]); run.bot.push([t, b.v[k]]); } close();
      text("PROFIL_TEXT", [L * 0.01, zhi - th * (2.2 + D.series.length * 1.6)], th, `Schakt ${l3pfF(df.cut, 2)} m2  Fyllning ${l3pfF(df.fill, 2)} m2  (${D.series[ids.indexOf(l3pf.cmp[0])].name} mot ${D.series[ids.indexOf(l3pf.cmp[1])].name})`);
    }
    text("PROFIL_TEXT", [0, zhi + th * 1.2], th * 1.2, `Profil ${l3pfF(L, 1)} m, start ${l3pfF(ox, 2)} / ${l3pfF(oy, 2)}`); lay("PROFIL_SCHAKT", 5); lay("PROFIL_FYLLNING", 1);
  }
  o.push("0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "9", "$INSUNITS", "70", "6", "0", "ENDSEC", "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER", "70", String(layers.size));
  layers.forEach((aci, name) => o.push("0", "LAYER", "2", name, "70", "0", "62", String(aci), "6", "CONTINUOUS")); o.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES", ...body, "0", "ENDSEC", "0", "EOF");
  return o.join("\n");
}
function l3pfDownload(name, blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800); }
const l3pfStamp = () => { const d = new Date(), p = x => String(x).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} kl ${p(d.getHours())}.${p(d.getMinutes())}`; };
function l3pfDxf(three) { if (!l3pf.data) return; l3pfDownload(`Profil${three ? " 3D" : ""} ${l3pfStamp()}.dxf`, new Blob([l3pfDxfText(three)], { type: "application/dxf" })); l3Toast(three ? "Profilen som 3D-linjer i modellens koordinater (DXF) nedladdad." : "Profilen som DXF (längd/höjd) nedladdad."); }
function l3pfCsv() {
  const D = l3pf.data, rows = []; D.series.forEach((s, i) => { const ln = l3pf.lines[i]; ln.v.forEach((v, b) => { if (v != null) rows.push([s.name, "Ytlinje", ln.t(b), 0, v]); }); s.pts.forEach(q => rows.push([s.name, "Punkt", q[0], q[1], q[2]])); });
  l3pfDownload(`Profil ${l3pfStamp()}.csv`, new Blob([l3ptCsvText(rows, ["Moln", "Typ", "Avstånd (m)", "Sida (m)", "Höjd (m ö.h.)"])], { type: "text/csv;charset=utf-8" }));
}
function l3pfPng() { const el = document.createElement("canvas"), W = 1800, H = 900; el.width = W; el.height = H; const g = el.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, W, H); const keep = l3pf.hover; l3pf.hover = null; l3pfDraw(g, [W, H]); l3pf.hover = keep; el.toBlob(b => b && l3pfDownload(`Profil ${l3pfStamp()}.png`, b)); }
