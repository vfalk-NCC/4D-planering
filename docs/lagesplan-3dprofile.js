/* Profil / snitt mellan punktmolnen – fullvärdig profilvy (Victor 2026-10-31: "exportera som DXF, visa i fullskärm, zooma osv … gör den superbra").
   • Alla tända moln i samma snitt: yta som linje (median, medel, övre eller nedre) och/eller punkter, med egna färger och av/på per moln.
   • Jämför A mot B: skuggad skillnad (blå = A lägre = schakt, röd = A högre = fyllning) och tvärsnittsarea i m².
   • Fullskärm (F), zoom med hjulet (Skift = bara längd, Ctrl = bara höjd), dra för att panorera, dubbelklick = hela, höjdöverdrift eller 1:1.
   • Musen i diagrammet visar höjderna och skillnaden, och en markör följer med längs linjen i 3D.
   • Export: DXF (profilen i längd/höjd, med rutnät, text och skillnadsytor), DXF (3D-linjer i modellens koordinater), CSV, PNG. */
const l3pf = { A: null, B: null, w: 0.5, data: null, el: null, cv: null, mode: "median", show: "line", bw: 0, hide: new Set(), cmp: null, diffOn: true, view: null, ex: 0, fs: false, hover: null, drag: null, grp: null, mark: null, lines: null, diff: null, raf: 0, clipSide: 0, clipSlab: false };
l3pf.hc = false; l3pf.cint = 0; l3pf.ifc = []; l3pf.ifcOn = true; l3pf.ifcFill = true; l3pf.ann = []; l3pf.tool = null; l3pf.ref = null; l3pf.level = null; l3pf.hz = null;
const L3PF_COL = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2"], L3PF_ACI = [5, 1, 3, 30, 6, 4];
const L3PF_CSS = `#v3PcProf .sw{display:inline-flex;align-items:center;gap:5px;cursor:pointer}#v3PcProf .sw input{position:absolute;opacity:0;pointer-events:none}#v3PcProf .sw i{width:30px;height:16px;border-radius:9px;background:#94a3b8;position:relative;transition:background .15s;flex:none}#v3PcProf .sw i:after{content:"";position:absolute;left:2px;top:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:left .15s}#v3PcProf .sw input:checked+i{background:#16a34a}#v3PcProf .sw input:checked+i:after{left:16px}#v3PcProf .sw input:focus-visible+i{outline:2px solid #2563eb}#v3PcProf{position:absolute;right:64px;bottom:12px;z-index:22;width:min(760px,calc(100% - 80px));height:min(420px,70%);display:flex;flex-direction:column;background:var(--v3-panel,#fff);border:1px solid rgba(0,0,0,.12);border-radius:14px;box-shadow:0 10px 32px rgba(0,0,0,.22);padding:8px 10px;font:12px system-ui,sans-serif;color:#0f172a}
#v3PcProf.fs{position:absolute;inset:0;right:0;bottom:0;width:auto;height:auto;z-index:45;border-radius:0}#v3PcProf label{display:inline-flex;gap:4px;align-items:center}#v3PcProf .r{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:3px 0}#v3PcProf canvas{flex:1;min-height:120px;width:100%;display:block;background:#f8fafc;border-radius:8px;cursor:crosshair;touch-action:none}
#v3PcProf button,#v3PcProf select,#v3PcProf input[type=text]{border:1px solid rgba(0,0,0,.16);background:#fff;border-radius:8px;padding:3px 8px;font:inherit;cursor:pointer;color:inherit}#v3PcProf button.on{background:#2563eb;color:#fff;border-color:#2563eb}#v3PcProf input[type=text]{width:54px;cursor:text}
#v3PcProf .lg{display:inline-flex;gap:4px;align-items:center;cursor:pointer;user-select:none}#v3PcProf .lg i{width:11px;height:11px;border-radius:50%;display:inline-block}#v3PcProf .lg.off{opacity:.4;text-decoration:line-through}#v3PcProf{padding:6px 8px;font-size:11.5px}#v3PcProf .r{gap:5px;margin:2px 0}#v3PcProf label,#v3PcProf .r>span{white-space:nowrap}#v3PcProf button,#v3PcProf select,#v3PcProf input[type=text]{height:24px;padding:0 7px;font-size:11.5px;border-radius:7px}#v3PcProf input[type=text]{width:46px}#v3PcProf select{padding:0 4px}#v3PcProf .r label>select{max-width:96px}
#v3PcProf input[type=color]{width:16px!important;height:16px!important;padding:0;border-radius:4px}#v3PcProf .pfask{position:absolute;z-index:60;width:270px;background:#fff;border:1px solid #cbd5e1;border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.28);padding:9px;font:12px system-ui}#v3PcProf .pfask .q{font-weight:700;margin-bottom:6px}#v3PcProf .pfask input[type=text]{width:100%!important;height:28px;box-sizing:border-box}#v3PcProf .pfask .bt{display:flex;gap:6px;margin-top:8px}#v3PcProf .pfask .bt .p{background:#2563eb;color:#fff;border-color:#2563eb}
#v3PcProf .lgw{display:inline-flex;gap:3px;align-items:center}#v3PcProf input[type=color]{width:20px;height:20px;padding:0;border:1px solid rgba(0,0,0,.2);border-radius:6px;background:none;cursor:pointer}#v3PcProf .dd{position:relative}
#v3PcProf .dd>div{display:none;position:absolute;right:0;bottom:30px;background:#fff;border:1px solid rgba(0,0,0,.14);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.2);padding:4px;z-index:3;min-width:190px}#v3PcProf .dd.open>div{display:block}#v3PcProf .dd button{display:block;width:100%;text-align:left;border:0}`;
/* Höjdfärg: blå (lågt) → turkos → grön → gul → röd (högt). f = 0..1 */
function l3pfRamp(f) { f = Math.max(0, Math.min(1, f)); const st = [[0, 49, 99, 200], [0.25, 40, 170, 200], [0.5, 70, 180, 90], [0.75, 240, 210, 60], [1, 215, 50, 40]]; for (let i = 1; i < st.length; i++) if (f <= st[i][0]) { const a = st[i - 1], b = st[i], k = (f - a[0]) / (b[0] - a[0]); return `rgb(${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)},${Math.round(a[3] + (b[3] - a[3]) * k)})`; } return "rgb(215,50,40)"; }
/* Höjdintervall för kurvor/band: valt värde, annars lagom av synligt höjdspann. */
const l3pfCint = V => l3pf.cint > 0 ? l3pf.cint : l3pfNice(V.z1 - V.z0, 8);
function l3pfZRange() { const D = l3pf.data; let lo = Infinity, hi = -Infinity; D.series.forEach((s, i) => { if (l3pf.hide.has(s.id)) return; const ln = l3pf.lines[i]; ln.v.forEach(v => { if (v != null) { if (v < lo) lo = v; if (v > hi) hi = v; } }); }); return isFinite(lo) ? [lo, hi] : [0, 1]; }
const L3PF_IFC = ["#334155", "#7c2d12", "#14532d", "#581c87", "#164e63", "#713f12"];
/* Närmaste AutoCAD-färgnummer (ACI) till en hex-färg – DXF R12 har inga RGB-färger. */
const L3PF_ACITAB = [[1, 255, 0, 0], [2, 255, 255, 0], [3, 0, 255, 0], [4, 0, 255, 255], [5, 0, 0, 255], [6, 255, 0, 255], [7, 0, 0, 0], [8, 128, 128, 128], [9, 192, 192, 192], [30, 255, 127, 0], [40, 255, 191, 0], [92, 0, 127, 0], [140, 0, 127, 255], [200, 127, 0, 255], [250, 51, 51, 51]];
function l3pfAci(hex) { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ""); if (!m) return 7; const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16); let best = 7, bd = Infinity; L3PF_ACITAB.forEach(([a, R_, G, B_]) => { const d = (r - R_) ** 2 + (g - G) ** 2 + (b - B_) ** 2; if (d < bd) { bd = d; best = a; } }); return best; }
/* IFC-genomskärning (Victor 2026-11-02): de tända IFC-modellerna skärs av det lodräta planet genom A–B. Resultat per modell: linjesegment [t0, z0, t1, z1, …] (avstånd längs, höjd m ö.h.) och per objekt sammanlänkade konturer
   (slutna = fyllbara i objektets egen färg, "Fyllda IFC-snitt i modellens färg"). */
function l3pfChain(segs) {
  const n = segs.length / 4, key = (t, z) => Math.round(t * 400) + "," + Math.round(z * 400), map = new Map(), used = new Uint8Array(n), polys = [];
  const add = (k, i) => { let l = map.get(k); if (!l) map.set(k, l = []); l.push(i); };
  for (let i = 0; i < n; i++) { add(key(segs[i * 4], segs[i * 4 + 1]), i); add(key(segs[i * 4 + 2], segs[i * 4 + 3]), i); }
  const walk = (pts, atEnd) => { for (;;) { const e = atEnd ? pts[pts.length - 1] : pts[0], k = key(e[0], e[1]), l = map.get(k); let c = -1; if (l) for (const j of l) if (!used[j]) { c = j; break; } if (c < 0) return; used[c] = 1; const sk = key(segs[c * 4], segs[c * 4 + 1]), o = sk === k ? [segs[c * 4 + 2], segs[c * 4 + 3]] : [segs[c * 4], segs[c * 4 + 1]]; if (atEnd) pts.push(o); else pts.unshift(o); if (pts.length > 20000) return; } };
  for (let i = 0; i < n; i++) { if (used[i]) continue; used[i] = 1; const pts = [[segs[i * 4], segs[i * 4 + 1]], [segs[i * 4 + 2], segs[i * 4 + 3]]]; walk(pts, true); walk(pts, false); const f = pts[0], l = pts[pts.length - 1]; polys.push({ pts, closed: pts.length > 3 && key(f[0], f[1]) === key(l[0], l[1]) }); }
  return polys;
}
function l3pfIfcSection(A, B) {
  if (typeof l3b === "undefined") return []; const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1e-9, ux = dx / L, uy = dy / L, nx = -uy, ny = ux, O2 = l3.O[2], out = [], CAP = 400000;
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), hex = (r, g, b) => "#" + [r, g, b].map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");
  l3b.models.forEach(m => { if (m.visible === false) return; const all = [], objs = []; let total = 0;
    m.meshes.forEach(x => { if (x.visible === false || !x.geometry) return; const pos = x.geometry.getAttribute("position"), col = x.geometry.getAttribute("color"), u = x.userData.l3b; if (!pos || !u) return; x.updateMatrixWorld(true); const M = x.matrixWorld, P = pos.array, C = col ? col.array : null, byteCol = C && (C instanceof Uint8Array || C instanceof Uint8ClampedArray);
      for (let ri = 0; ri < u.ranges.length; ri++) { if (typeof l3bsDead === "function" && l3bsDead(x, ri)) continue; const r = u.ranges[ri], segs = []; let color = null;
        for (let i = r.start; i + 2 < r.start + r.count; i += 3) {
          v0.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(M); v1.set(P[i * 3 + 3], P[i * 3 + 4], P[i * 3 + 5]).applyMatrix4(M); v2.set(P[i * 3 + 6], P[i * 3 + 7], P[i * 3 + 8]).applyMatrix4(M);
          const d0 = (v0.x - A[0]) * nx + (v0.y - A[1]) * ny, d1 = (v1.x - A[0]) * nx + (v1.y - A[1]) * ny, d2 = (v2.x - A[0]) * nx + (v2.y - A[1]) * ny;
          if ((d0 > 0 && d1 > 0 && d2 > 0) || (d0 < 0 && d1 < 0 && d2 < 0)) continue; const pts = [];
          const edge = (a, da, b, db) => { if ((da > 0) === (db > 0) || da === db) return; const k = da / (da - db), px = a.x + (b.x - a.x) * k, py = a.y + (b.y - a.y) * k, pz = a.z + (b.z - a.z) * k; pts.push((px - A[0]) * ux + (py - A[1]) * uy, pz + O2); };
          edge(v0, d0, v1, d1); edge(v1, d1, v2, d2); edge(v2, d2, v0, d0); if (pts.length < 4) continue;
          const t0 = pts[0], t1 = pts[2]; if ((t0 < 0 && t1 < 0) || (t0 > L && t1 > L)) continue; segs.push(t0, pts[1], t1, pts[3]);
          if (!color && C) { const k = byteCol ? 1 : 255; color = hex(C[i * 3] * k, C[i * 3 + 1] * k, C[i * 3 + 2] * k); }
        }
        if (segs.length) { objs.push({ color: color || "#94a3b8", polys: segs.length / 4 <= 6000 ? l3pfChain(Float32Array.from(segs)) : null, segs: Float32Array.from(segs), name: r.name || "" }); for (let q = 0; q < segs.length; q++) all.push(segs[q]); total += segs.length / 4; if (total > CAP) return; }
      } });
    if (all.length) out.push({ id: m.id, name: m.name || String(m.id), segs: Float32Array.from(all), objs }); });
  return out;
}
const l3pfF = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toFixed(d).replace(".", ",");
/* ---- Beräkning --------------------------------------------------------------------------------------------------------- */
/* Yta per ruta längs linjen: [t, z] per ruta (median/medel/övre/nedre); hål ≤ 4 rutor fylls, större hål bryter linjen (null). */
function l3pfLine(s, mode, bw, L) {
  const nb = Math.max(1, Math.ceil(L / bw)), cnt = new Uint32Array(nb + 1); const n = s.t.length, bin = new Int32Array(n);
  for (let i = 0; i < n; i++) { const b = Math.min(nb - 1, Math.max(0, Math.floor(s.t[i] / bw))); bin[i] = b; cnt[b + 1]++; }
  for (let b = 0; b < nb; b++) cnt[b + 1] += cnt[b];
  const at = cnt.slice(0, nb), zs = new Float32Array(n); for (let i = 0; i < n; i++) zs[at[bin[i]]++] = s.z[i];
  const out = new Array(nb).fill(null), bmn = new Float32Array(nb).fill(NaN), bmx = new Float32Array(nb).fill(NaN), bn = new Uint32Array(nb);
  for (let b = 0; b < nb; b++) {
    const a = cnt[b], e = cnt[b + 1]; if (e === a) continue; const part = zs.subarray(a, e); let v; { let lo = Infinity, hi = -Infinity; for (let i = 0; i < part.length; i++) { if (part[i] < lo) lo = part[i]; if (part[i] > hi) hi = part[i]; } bmn[b] = lo; bmx[b] = hi; bn[b] = part.length; }
    if (mode === "max") { v = -Infinity; for (let i = 0; i < part.length; i++) if (part[i] > v) v = part[i]; }
    else if (mode === "min") { v = Infinity; for (let i = 0; i < part.length; i++) if (part[i] < v) v = part[i]; }
    else if (mode === "mean") { let q = 0; for (let i = 0; i < part.length; i++) q += part[i]; v = q / part.length; }
    else { const c = Float32Array.from(part).sort(); v = c[c.length >> 1]; }
    out[b] = v;
  }
  // fyll små hål
  let last = -1; for (let b = 0; b < nb; b++) { if (out[b] == null) continue; if (last >= 0 && b - last > 1 && b - last <= 5) { for (let k = last + 1; k < b; k++) out[k] = out[last] + (out[b] - out[last]) * (k - last) / (b - last); } last = b; }
  return { bw, v: out, mn: bmn, mx: bmx, n: bn, t: b => (b + 0.5) * bw };
}
/* Höjd på första synliga ytlinjen vid avståndet t (eller null). */
function l3pfSurfZ(t) { const D = l3pf.data; if (!D || !l3pf.lines) return null; for (let i = 0; i < D.series.length; i++) { if (l3pf.hide.has(D.series[i].id)) continue; const z = l3pfAt(l3pf.lines[i], t); if (z != null) return z; } return null; }
const l3pfBin = (ln, t) => Math.min(ln.v.length - 1, Math.max(0, Math.floor(t / ln.bw)));
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
  const D = l3pf.data; const sc = (typeof l3Prefs === "function" && l3Prefs().pfCol) || {}; D.series.forEach((s, i) => { s.color = sc[s.id] || L3PF_COL[i % L3PF_COL.length]; s.aci = sc[s.id] ? l3pfAci(s.color) : L3PF_ACI[i % L3PF_ACI.length]; }); l3pf.ifc = []; try { l3pf.ifc = l3pfIfcSection(A, B); } catch (e) { console.warn("IFC-genomskärning", e); } l3pf.ifc.forEach((m, i) => { m.color = sc["ifc:" + m.id] || L3PF_IFC[i % L3PF_IFC.length]; }); l3pf.ref = null; l3pfCompute();
  if (!document.getElementById("v3PcProfCss")) { const st = document.createElement("style"); st.id = "v3PcProfCss"; st.textContent = L3PF_CSS; document.head.appendChild(st); }
  const host = document.getElementById("v3Canvas"); let el = document.getElementById("v3PcProf"); if (el) el.remove(); el = document.createElement("div"); el.id = "v3PcProf"; host.appendChild(el); l3pf.el = el;
  ["pointerdown", "click", "dblclick", "wheel", "contextmenu", "keydown"].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
  l3pf3d(); l3pfAnnLoad(); l3pfAnn3d(); l3pfClipFollow(); l3pfUI(); l3pfFit(); l3pfDraw();
  if (!D.series.some(s => s.n)) l3Status("Inga punkter inom profilens bredd – öka bredden eller dra linjen över molnet.", true);
  if (typeof l3ptRender === "function") l3ptRender();
}
function l3pfUI() {
  const el = l3pf.el, D = l3pf.data, esc = typeof escHtml === "function" ? escHtml : String, opt = (v, l, cur) => `<option value="${v}" ${String(cur) === String(v) ? "selected" : ""}>${l}</option>`;
  el.innerHTML = `<div class="r"><b>Profil</b><span>Längd ${l3pfF(D.L, 1)} m · bredd ±${l3pfF(l3pf.w, 2)} m</span><span style="flex:1"></span>
    <button type="button" data-pf="fit" title="Zooma till hela profilen (dubbelklick)">Hela</button><button type="button" data-pf="one" class="${l3pf.ex === 1 ? "on" : ""}" title="Sant 1:1-förhållande mellan längd och höjd">1:1</button>
    <label title="Höjdöverdrift">Höjd ×<select data-pf="ex">${[0, 1, 2, 5, 10, 20].map(v => opt(v, v ? v + "×" : "Auto", l3pf.ex)).join("")}</select></label>
    <button type="button" data-pf="tspot" class="${l3pf.tool === "spot" ? "on" : ""}" title="Klicka ut plushöjder i profilen (Alt = fri höjd)">▽ Plushöjd</button><button type="button" data-pf="tnote" class="${l3pf.tool === "note" ? "on" : ""}" title="Lägg en kommentar: klicka för en punkt eller dra över ett område – t.ex. fundament">💬 Kommentar</button><button type="button" data-pf="tclr" title="Ta bort alla plushöjder och kommentarer">Rensa</button><button type="button" data-pf="fs" title="Fullskärm (F)">⛶</button><button type="button" data-pf="x" title="Stäng">✕</button></div>
  <div class="r"><label>Yta <select data-pf="mode">${opt("median", "Median", l3pf.mode)}${opt("mean", "Medel", l3pf.mode)}${opt("max", "Övre (topp)", l3pf.mode)}${opt("min", "Nedre (mark)", l3pf.mode)}</select></label>
    <label>Visa <select data-pf="show">${opt("line", "Linje", l3pf.show)}${opt("pts", "Punkter", l3pf.show)}${opt("both", "Båda", l3pf.show)}</select></label>
    <label title="Rutbredd längs profilen för ytlinjen (m)">Ruta <input type="text" data-pf="bw" value="${l3pf.bw ? l3pfF(l3pf.bw, 2) : ""}" placeholder="auto"></label>
    <label title="Tvärsnittets bredd åt varje sida (m) – räknas om"><span>Bredd ±</span> <input type="text" data-pf="w" value="${l3pfF(l3pf.w, 2)}"></label>
    <label class="sw" title="Klipp 3D-vyn exakt längs profillinjen (som saxverktyget). Följer med när du drar profillinjen."><input type="checkbox" data-pf="clip" ${l3pfClipOn() ? "checked" : ""}><i></i><span>Klipp längs profilen</span></label>${l3pfClipOn() ? `<button type="button" data-pf="clipflip" title="Vänd – behåll andra sidan">⇄</button><label class="lg" title="Behåll bara en skiva ±bredd runt profillinjen"><input type="checkbox" data-pf="clipslab" ${l3pf.clipSlab ? "checked" : ""}> Skiva</label>` : ""}
    <span class="dd"><button type="button" data-pf="dd">Exportera ▾</button><div><button type="button" data-pf="dxf">DXF – profil (längd/höjd)</button><button type="button" data-pf="dxf3">DXF – 3D-linjer i modellen</button><button type="button" data-pf="csv">CSV – punkter och ytlinje</button><button type="button" data-pf="png">PNG – bild</button></div></span></div>
  <div class="r" data-pf-leg>${D.series.map((s, i) => `<span class="lgw"><input type="color" data-pf-col="${esc(s.id)}" value="${s.color}" title="Välj färg för molnet"><span class="lg ${l3pf.hide.has(s.id) ? "off" : ""}" data-pf-lg="${esc(s.id)}" title="Tryck för att visa/dölja">${esc(s.name)} (${s.n.toLocaleString("sv-SE")} p)</span></span>`).join("")}
    ${l3pf.ifc.map(m => `<span class="lgw"><input type="color" data-pf-col="ifc:${esc(m.id)}" value="${m.color}" title="Färg på IFC-genomskärningen"><span class="lg ${l3pf.hide.has("ifc:" + m.id) ? "off" : ""}" data-pf-lg="ifc:${esc(m.id)}" title="IFC-modellens genomskärning – tryck för att visa/dölja">▭ ${esc(m.name)}</span></span>`).join("")}
    ${D.series.length >= 2 ? `<span style="flex:1"></span><label>Jämför <select data-pf="ca">${D.series.map(s => opt(s.id, esc(s.name), l3pf.cmp && l3pf.cmp[0])).join("")}</select> mot <select data-pf="cb">${D.series.map(s => opt(s.id, esc(s.name), l3pf.cmp && l3pf.cmp[1])).join("")}</select></label><label class="lg"><input type="checkbox" data-pf="dif" ${l3pf.diffOn ? "checked" : ""}> Skillnad</label>` : ""}
    ${l3pf.ifc.length ? `<label class="lg" title="Fyll de slutna IFC-snitten i objektens egen färg"><input type="checkbox" data-pf="fill" ${l3pf.ifcFill ? "checked" : ""}> Fyll IFC</label>` : ""}
    <label class="lg" title="Färga ytlinjen, punkterna och bakgrunden efter höjd"><input type="checkbox" data-pf="hc" ${l3pf.hc ? "checked" : ""}> Höjdfärg</label><label title="Höjdkurvor: vågräta linjer med jämna intervall"><span>Kurvor</span> <select data-pf="cint">${[[0, "Av"], [0.1, "0,1 m"], [0.25, "0,25 m"], [0.5, "0,5 m"], [1, "1 m"], [2, "2 m"], [5, "5 m"], [10, "10 m"]].map(([v, l]) => opt(v, l, l3pf.cint)).join("")}</select></label>
    <label title="Rita en vågrät nivålinje (m ö.h.) – t.ex. schaktbotten. Schakt och fyllning mot nivån visas nedan."><span>Nivå</span> <input type="text" data-pf="lvl" value="${l3pf.level == null ? "" : l3pfF(l3pf.level, 2)}" placeholder="m ö.h."></label></div>
  <canvas></canvas><div class="r" data-pf-info></div>`;
  l3pf.cv = el.querySelector("canvas"); l3pfInfo(); l3pfBind();
}
function l3pfInfo() {
  const e = l3pf.el && l3pf.el.querySelector("[data-pf-info]"); if (!e) return; const d = l3pf.diff, D = l3pf.data;
  e.innerHTML = d && d.n ? `<span title="Tvärsnittsarea mellan de två ytorna (m²) – gånger sträckan mellan profilerna blir volymen"><b style="color:#2563eb">Schakt ${l3pfF(d.cut, 2)} m²</b> (A lägre än B)</span><span><b style="color:#dc2626">Fyllning ${l3pfF(d.fill, 2)} m²</b> (A högre)</span><span>Netto ${l3pfF(d.fill - d.cut, 2)} m²</span><span>Störst ${l3pfF(-d.mn, 2)} m under · ${l3pfF(d.mx, 2)} m över</span><span class="t">jämförd längd ${l3pfF(d.cover, 1)} av ${l3pfF(D.L, 1)} m</span>`
    : `<span class="t">${D.series.length < 2 ? "Tänd ett andra moln (eller en modell) för att jämföra ytorna." : "Ytorna överlappar inte längs profilen."} Hjul = zooma, Skift+hjul = längd, Ctrl+hjul = höjd, dra = panorera, dubbelklick = hela.</span>`;
  e.innerHTML += l3pfLevelHtml();
}
/* Schakt/fyllning mot en vald nivå (första synliga ytlinjen): area över nivån = schakt, under = fyllning. */
function l3pfLevelHtml() { if (l3pf.level == null || !l3pf.lines) return ""; const D = l3pf.data, i = D.series.findIndex(s => !l3pf.hide.has(s.id)); if (i < 0) return ""; const ln = l3pf.lines[i]; let cut = 0, fill = 0; ln.v.forEach(v => { if (v == null) return; if (v > l3pf.level) cut += (v - l3pf.level) * ln.bw; else fill += (l3pf.level - v) * ln.bw; }); return `<span title="Tvärsnittsarea mellan ${D.series[i].name} och nivån"><b style="color:#ea580c">Mot nivå ${l3pfF(l3pf.level, 2)} m:</b> schakt ${l3pfF(cut, 2)} m² · fyllning ${l3pfF(fill, 2)} m²</span>`; }
function l3pfBind() {
  const el = l3pf.el, on = (sel, fn) => el.querySelectorAll(sel).forEach(fn);
  el.onclick = e => {
    { const er = el.getBoundingClientRect(); l3pf.lastPt = { x: e.clientX - er.left, y: e.clientY - er.top - 20 }; }
    const b = e.target.closest("[data-pf]"), lg = e.target.closest("[data-pf-lg]");
    if (lg) { const id = lg.dataset.pfLg; l3pf.hide.has(id) ? l3pf.hide.delete(id) : l3pf.hide.add(id); lg.classList.toggle("off", l3pf.hide.has(id)); l3pfDraw(); return; }
    if (!b || b.tagName === "SELECT" || b.tagName === "INPUT") return; const a = b.dataset.pf; if (a === "clipflip") { l3pf.clipSide = -(l3pf.clipSide || 1); l3pfClipSet(true, true); return; }
    if (a === "dd") { b.parentNode.classList.toggle("open"); return; } el.querySelectorAll(".dd.open").forEach(d => d.classList.remove("open"));
    if (a === "fit") { l3pfFit(); l3pfDraw(); } else if (a === "one") { l3pf.ex = l3pf.ex === 1 ? 0 : 1; l3pfUI(); l3pfFit(); l3pfDraw(); } else if (a === "tspot" || a === "tnote") l3pfTool(a.slice(1)); else if (a === "tclr") { if (!l3pf.ann.length) l3Status("Inga plushöjder eller kommentarer att ta bort."); else if (true) l3pfAsk(`Ta bort alla ${l3pf.ann.length} markeringar i profilen?`, "", { confirm: true }).then(ok => { if (ok) { l3pf.ann = []; l3pfAnnSave(); l3pfDraw(); } }); } else if (a === "fs") l3pfFs(); else if (a === "x") l3pfClear();
    else if (a === "dxf") l3pfDxf(false); else if (a === "dxf3") l3pfDxf(true); else if (a === "csv") l3pfCsv(); else if (a === "png") l3pfPng();
  };
  el.onchange = e => {
    const t = e.target, a = t.dataset.pf; if (!a) return;
    if (a === "clip") { l3pfClipSet(t.checked); } else if (a === "clipslab") { l3pf.clipSlab = t.checked; l3pfClipSet(true, true); } else if (a === "mode") { l3pf.mode = t.value; l3pfCompute(); l3pfInfo(); l3pfDraw(); } else if (a === "show") { l3pf.show = t.value; l3pfDraw(); }
    else if (a === "ex") { l3pf.ex = Number(t.value) || 0; l3pfFit(); l3pfDraw(); } else if (a === "bw") { const v = Number(String(t.value).replace(",", ".")); l3pf.bw = v > 0.005 ? v : 0; l3pfCompute(); l3pfInfo(); l3pfDraw(); }
    else if (a === "w") { const v = Number(String(t.value).replace(",", ".")); if (v > 0.01) l3pfShow(l3pf.A, l3pf.B, v); } else if (a === "ca" || a === "cb") { const x = el.querySelector('[data-pf="ca"]').value, y = el.querySelector('[data-pf="cb"]').value; l3pf.cmp = [x, y]; l3pfCompute(); l3pfInfo(); l3pfDraw(); }
    else if (a === "dif") { l3pf.diffOn = t.checked; l3pfDraw(); } else if (a === "fill") { l3pf.ifcFill = t.checked; l3pfDraw(); } else if (a === "hc") { l3pf.hc = t.checked; l3pfDraw(); } else if (a === "cint") { l3pf.cint = Number(t.value) || 0; l3pfDraw(); } else if (a === "lvl") { const v = Number(String(t.value).replace(",", ".")); l3pf.level = t.value.trim() === "" || !isFinite(v) ? null : v; l3pfInfo(); l3pfDraw(); }
  };
  el.addEventListener("input", e => { const c = e.target.closest && e.target.closest("[data-pf-col]"); if (!c) return; const id = c.dataset.pfCol, hex = c.value, st = (l3Prefs().pfCol) || {}; st[id] = hex; l3SetPref("pfCol", { ...st });
    if (id.startsWith("ifc:")) { const m = l3pf.ifc.find(x => "ifc:" + x.id === id); if (m) m.color = hex; } else { const s2 = l3pf.data.series.find(x => x.id === id); if (s2) { s2.color = hex; s2.aci = l3pfAci(hex); } } l3pfDraw(); });
  const cv = l3pf.cv; let moved = 0;
  cv.addEventListener("wheel", e => {
    e.preventDefault(); e.stopPropagation(); const V = l3pf.view, r = cv.getBoundingClientRect(), g = l3pfGeom(), px = e.clientX - r.left, py = e.clientY - r.top, f = Math.exp(e.deltaY * 0.0016);
    const t = V.x0 + (px - g.l) / g.w * (V.x1 - V.x0), z = V.z0 + (g.t + g.h - py) / g.h * (V.z1 - V.z0), zx = !e.ctrlKey, zz = !e.shiftKey;
    if (zx) { V.x0 = t - (t - V.x0) * f; V.x1 = t + (V.x1 - t) * f; }
    if (zz && !(zx && l3pf.ex > 0)) { V.z0 = z - (z - V.z0) * f; V.z1 = z + (V.z1 - z) * f; }
    if (zx && zz && l3pf.ex > 0) l3pfKeepRatio(V);
    l3pfDraw();
  }, { passive: false });
  cv.addEventListener("pointerdown", e => { if (e.button !== 0 && e.button !== 1) return; cv.setPointerCapture(e.pointerId); if (l3pf.tool === "note" && e.button === 0 && l3pf.hover != null) { l3pf.noteDrag = { t0: l3pf.hover, x: e.clientX }; moved = 0; return; } l3pf.drag = { x: e.clientX, y: e.clientY, v: { ...l3pf.view } }; moved = 0; });
  cv.addEventListener("pointermove", e => {
    const r = cv.getBoundingClientRect(), g = l3pfGeom(), d = l3pf.drag;
    if (d) { const dx = e.clientX - d.x, dy = e.clientY - d.y; moved = Math.max(moved, Math.hypot(dx, dy)); if (moved > 3) { const V = l3pf.view, sx = (d.v.x1 - d.v.x0) / g.w, sz = (d.v.z1 - d.v.z0) / g.h; V.x0 = d.v.x0 - dx * sx; V.x1 = d.v.x1 - dx * sx; V.z0 = d.v.z0 + dy * sz; V.z1 = d.v.z1 + dy * sz; } }
    const V = l3pf.view; const t = V.x0 + (e.clientX - r.left - g.l) / g.w * (V.x1 - V.x0); l3pf.hover = t >= 0 && t <= l3pf.data.L && e.clientX - r.left >= g.l ? t : null; l3pf.hz = V.z0 + (g.t + g.h - (e.clientY - r.top)) / g.h * (V.z1 - V.z0); if (l3pf.noteDrag) { moved = Math.max(moved, Math.abs(e.clientX - l3pf.noteDrag.x)); l3pf.noteDrag.t1 = l3pf.hover; } l3pfMark(); l3pfDraw();
  });
  cv.addEventListener("pointerleave", () => { l3pf.hover = null; l3pfMark(); l3pfDraw(); });
  cv.addEventListener("pointerup", e => { l3pf.drag = null; { const er = l3pf.el.getBoundingClientRect(); l3pf.lastPt = { x: e.clientX - er.left, y: e.clientY - er.top }; }
    if (l3pf.noteDrag) { const d = l3pf.noteDrag; l3pf.noteDrag = null; l3pfAnnNote(d.t0, moved > 6 && d.t1 != null && Math.abs(d.t1 - d.t0) > 0.05 ? d.t1 : null); return; }
    if (moved <= 3 && e.button === 0) { const r0 = cv.getBoundingClientRect(), px = e.clientX - r0.left, py = e.clientY - r0.top;
      if (l3pf.tool === "spot" && l3pf.hover != null) { const z = e.altKey ? l3pf.hz : (l3pfSnapZ(l3pf.hover, l3pf.hz) ?? l3pf.hz); l3pfAnnAdd({ k: "spot", t: l3pf.hover, z }); return; }
      if (!l3pf.tool) { const h = l3pfAnnHit(px, py); if (h) { l3pfAnnEdit(h); return; } } }
    if (!l3pf.tool && moved <= 3 && l3pf.hover != null && e.button === 0) { const near = l3pf.ref && Math.abs(l3pf.ref.t - l3pf.hover) < (l3pf.view.x1 - l3pf.view.x0) * 0.01; l3pf.ref = near ? null : { t: l3pf.hover, z: l3pfSurfZ(l3pf.hover) ?? l3pf.hz }; l3pfDraw(); } }); cv.addEventListener("dblclick", () => { l3pfFit(); l3pfDraw(); });
  if (window.ResizeObserver) { l3pf.ro = new ResizeObserver(() => l3pfDraw()); l3pf.ro.observe(cv); }
}
/* Visningsområdet: hela profilen med lite luft; med höjdöverdrift (eller 1:1) styr förhållandet höjdspannet. */
function l3pfFit() {
  const D = l3pf.data, vis = D.series.filter(s => !l3pf.hide.has(s.id) && s.n); let lo = Infinity, hi = -Infinity;
  vis.forEach(s => { for (let i = 0; i < s.z.length; i += 3) { if (s.z[i] < lo) lo = s.z[i]; if (s.z[i] > hi) hi = s.z[i]; } });
  if (l3pf.ifcOn) l3pf.ifc.forEach(m => { if (l3pf.hide.has("ifc:" + m.id)) return; for (let k = 1; k < m.segs.length; k += 2) { if (m.segs[k] < lo) lo = m.segs[k]; if (m.segs[k] > hi) hi = m.segs[k]; } });
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
  // höjdband och höjdlinjer (färg efter höjd)
  if (l3pf.hc || l3pf.cint > 0) { const ci = l3pfCint(V), [zl, zh] = l3pfZRange(); for (let z = Math.floor(V.z0 / ci) * ci; z < V.z1; z += ci) { if (l3pf.hc) { const f = (z + ci / 2 - zl) / Math.max(0.01, zh - zl); g.fillStyle = l3pfRamp(f); g.globalAlpha = 0.2; const y0 = Math.max(gm.t, Y(z + ci)), y1 = Math.min(gm.t + gm.h, Y(z)); if (y1 > y0) g.fillRect(gm.l, y0, gm.w, y1 - y0); g.globalAlpha = 1; } g.strokeStyle = "rgba(71,85,105,.55)"; g.lineWidth = 1; g.beginPath(); g.moveTo(gm.l, Y(z)); g.lineTo(gm.l + gm.w, Y(z)); g.stroke(); g.fillStyle = "#334155"; g.font = "10.5px system-ui"; g.textAlign = "right"; g.fillText(l3pfF(z, ci < 0.1 ? 2 : ci < 1 ? 1 : 0), gm.l + gm.w - 4, Y(z) - 2); } }
  // skillnadsyta
  const df = l3pf.diff; if (df && l3pf.diffOn && l3pf.cmp) { const ids = D.series.map(s => s.id), A = l3pf.lines[ids.indexOf(l3pf.cmp[0])], B = l3pf.lines[ids.indexOf(l3pf.cmp[1])]; if (vis(ids.indexOf(l3pf.cmp[0])) && vis(ids.indexOf(l3pf.cmp[1]))) for (let b = 0; b < A.v.length; b++) { if (df.dz[b] == null) continue; const x0 = X(b * A.bw), x1 = X((b + 1) * A.bw); g.fillStyle = df.dz[b] < 0 ? "rgba(37,99,235,.28)" : "rgba(220,38,38,.28)"; g.fillRect(x0, Math.min(Y(A.v[b]), Y(B.v[b])), Math.max(1, x1 - x0 + 0.5), Math.abs(Y(A.v[b]) - Y(B.v[b])) || 1); } }
  // IFC-genomskärning: slutna konturer fylls i objektets egen färg (eller den färg du valt för modellen), konturen ritas ovanpå
  if (l3pf.ifcOn) l3pf.ifc.forEach(m => { if (l3pf.hide.has("ifc:" + m.id)) return; const uc = ((typeof l3Prefs === "function" && l3Prefs().pfCol) || {})["ifc:" + m.id];
    if (l3pf.ifcFill) m.objs.forEach(o => { if (!o.polys) return; const cl = o.polys.filter(p => p.closed); if (!cl.length) return; g.beginPath(); cl.forEach(p => { p.pts.forEach((q, k) => { if (k) g.lineTo(X(q[0]), Y(q[1])); else g.moveTo(X(q[0]), Y(q[1])); }); g.closePath(); }); g.globalAlpha = 0.85; g.fillStyle = uc || o.color; g.fill("evenodd"); g.globalAlpha = 1; });
    g.strokeStyle = l3pf.ifcFill ? "rgba(15,23,42,.8)" : m.color; g.lineWidth = l3pf.ifcFill ? 1.1 : 1.3; g.beginPath(); const S = m.segs; for (let k = 0; k < S.length; k += 4) { g.moveTo(X(S[k]), Y(S[k + 1])); g.lineTo(X(S[k + 2]), Y(S[k + 3])); } g.stroke(); });
  // nivålinje
  if (l3pf.level != null) { const y = Y(l3pf.level); g.save(); g.strokeStyle = "#ea580c"; g.lineWidth = 1.6; g.setLineDash([8, 5]); g.beginPath(); g.moveTo(gm.l, y); g.lineTo(gm.l + gm.w, y); g.stroke(); g.restore(); g.fillStyle = "#ea580c"; g.font = "700 11px system-ui"; g.textAlign = "left"; g.fillText("Nivå " + l3pfF(l3pf.level, 2) + " m", gm.l + 6, y - 5); }
  // punkter och linjer
  D.series.forEach((s, i) => {
    if (!vis(i)) return; g.fillStyle = s.color;
    const hcol = l3pf.hc ? (() => { const [zl, zh] = l3pfZRange(); return z => l3pfRamp((z - zl) / Math.max(0.01, zh - zl)); })() : null;
    if (l3pf.show !== "line") { const step = Math.max(1, Math.floor(s.pts.length / 9000)), a = l3pf.show === "both" ? 0.35 : 1; g.globalAlpha = a; for (let k = 0; k < s.pts.length; k += step) { const q = s.pts[k]; if (hcol) g.fillStyle = hcol(q[2]); g.fillRect(X(q[0]) - 1, Y(q[2]) - 1, 2.4, 2.4); } g.globalAlpha = 1; }
    if (l3pf.show !== "pts") { const ln = l3pf.lines[i]; g.strokeStyle = s.color; g.lineWidth = 2.2; g.lineJoin = "round"; g.lineCap = "round"; if (hcol) { let px = null, py = null, pv = null; ln.v.forEach((v, b) => { if (v == null) { px = null; return; } const x = X(ln.t(b)), y = Y(v); if (px != null) { g.strokeStyle = hcol((v + pv) / 2); g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke(); } px = x; py = y; pv = v; }); } else { g.beginPath(); let pen = false; ln.v.forEach((v, b) => { if (v == null) { pen = false; return; } const x = X(ln.t(b)), y = Y(v); if (!pen) { g.moveTo(x, y); pen = true; } else g.lineTo(x, y); }); g.stroke(); } }
  });
  // markör: lodlinje + vågrät linje i pekarens höjd, prickar på ytlinjerna, referenspunkt
  const refPt = l3pf.ref;
  if (refPt) { const rx = X(refPt.t), ry = Y(refPt.z); g.strokeStyle = "#7c3aed"; g.fillStyle = "#7c3aed"; g.lineWidth = 1.5; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(rx, gm.t); g.lineTo(rx, gm.t + gm.h); g.moveTo(gm.l, ry); g.lineTo(gm.l + gm.w, ry); g.stroke(); g.setLineDash([]); g.beginPath(); g.arc(rx, ry, 5, 0, 6.2832); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke(); }
  if (l3pf.hover != null) {
    const x = X(l3pf.hover); g.lineWidth = 1.2; g.strokeStyle = "rgba(15,23,42,.75)"; g.setLineDash([5, 3]); g.beginPath(); g.moveTo(x, gm.t); g.lineTo(x, gm.t + gm.h); if (l3pf.hz != null) { g.moveTo(gm.l, Y(l3pf.hz)); g.lineTo(gm.l + gm.w, Y(l3pf.hz)); } g.stroke(); g.setLineDash([]);
    D.series.forEach((s, i) => { if (!vis(i)) return; const z = l3pfAt(l3pf.lines[i], l3pf.hover); if (z != null) { g.fillStyle = "#fff"; g.beginPath(); g.arc(x, Y(z), 6, 0, 6.2832); g.fill(); g.fillStyle = s.color; g.beginPath(); g.arc(x, Y(z), 4.2, 0, 6.2832); g.fill(); } });
  }
  l3pfAnnDraw(g, gm, X, Y, !!ctxOverride);
  g.restore();
  // axlar
  g.fillStyle = "#475569"; g.font = "11px system-ui"; g.textAlign = "right";
  for (let z = Math.ceil(V.z0 / sz) * sz; z <= V.z1; z += sz) g.fillText(l3pfF(z, sz < 0.1 ? 2 : sz < 1 ? 1 : 0), gm.l - 6, Y(z) + 4);
  g.textAlign = "center"; for (let t = Math.ceil(V.x0 / sx) * sx; t <= V.x1; t += sx) g.fillText(l3pfF(t, sx < 1 ? 1 : 0) + " m", X(t), gm.t + gm.h + 16);
  g.strokeStyle = "#94a3b8"; g.strokeRect(gm.l, gm.t, gm.w, gm.h);
  // axelmärken vid pekaren (höjd till vänster, avstånd nedtill)
  if (l3pf.hover != null) {
    const chip = (tx, cx, cy, col) => { g.font = "700 11.5px system-ui"; const w = g.measureText(tx).width + 10; g.fillStyle = col; g.fillRect(cx - (cx < gm.l + 5 ? 0 : w / 2), cy - 9, w, 18); g.fillStyle = "#fff"; g.textAlign = "left"; g.fillText(tx, cx - (cx < gm.l + 5 ? 0 : w / 2) + 5, cy + 4); };
    if (l3pf.hz != null && l3pf.hz >= V.z0 && l3pf.hz <= V.z1) { const tx = l3pfF(l3pf.hz, 2), w = (() => { g.font = "700 11.5px system-ui"; return g.measureText(tx).width + 10; })(); g.fillStyle = "#0f172a"; g.fillRect(gm.l - w - 2, Y(l3pf.hz) - 9, w, 18); g.fillStyle = "#fff"; g.textAlign = "left"; g.fillText(tx, gm.l - w + 3, Y(l3pf.hz) + 4); }
    { const tx = l3pfF(l3pf.hover, 1) + " m", x = X(l3pf.hover); g.font = "700 11.5px system-ui"; const w = g.measureText(tx).width + 10; g.fillStyle = "#0f172a"; g.fillRect(x - w / 2, gm.t + gm.h + 3, w, 18); g.fillStyle = "#fff"; g.textAlign = "center"; g.fillText(tx, x, gm.t + gm.h + 16); }
  }
  // avläsning (större, med bredd, spridning och mätning mot referenspunkten)
  if (l3pf.hover != null) {
    const rows = [["#0f172a", `Avstånd ${l3pfF(l3pf.hover, 2)} m`, 1]]; if (l3pf.hz != null) rows.push(["#0f172a", `Pekarhöjd ${l3pfF(l3pf.hz, 2)} m ö.h.`, 1]);
    rows.push(["#475569", `Bredd ±${l3pfF(l3pf.w, 2)} m (totalt ${l3pfF(l3pf.w * 2, 2)} m)`]);
    D.series.forEach((s, i) => { if (!vis(i)) return; const ln = l3pf.lines[i], b = l3pfBin(ln, l3pf.hover), z = ln.v[b]; rows.push([s.color, `${s.name}: ${z == null ? "–" : l3pfF(z, 2) + " m ö.h."}`, 1]); if (z != null) rows.push([s.color, `   spridning ${l3pfF(ln.mn[b], 2)}–${l3pfF(ln.mx[b], 2)} m · ${ln.n[b]} punkter`]); });
    if (df && l3pf.cmp) { const ids = D.series.map(s => s.id), a = l3pfAt(l3pf.lines[ids.indexOf(l3pf.cmp[0])], l3pf.hover), b = l3pfAt(l3pf.lines[ids.indexOf(l3pf.cmp[1])], l3pf.hover); if (a != null && b != null) rows.push([a < b ? "#2563eb" : "#dc2626", `Δ ${l3pfF(a - b, 2)} m (${a < b ? "schakt" : "fyllning"})`, 1]); }
    if (l3pf.level != null) { const z = l3pfSurfZ(l3pf.hover); if (z != null) rows.push(["#ea580c", `Mot nivå: ${l3pfF(z - l3pf.level, 2)} m (${z >= l3pf.level ? "över" : "under"})`, 1]); }
    if (refPt) { const z = l3pfSurfZ(l3pf.hover) ?? l3pf.hz, dL = l3pf.hover - refPt.t, dH = z - refPt.z, sl = Math.abs(dL) > 1e-6 ? dH / Math.abs(dL) * 100 : 0; rows.push(["#7c3aed", `Från referens: ΔL ${l3pfF(dL, 2)} m · ΔH ${l3pfF(dH, 2)} m`, 1], ["#7c3aed", `Lutning ${l3pfF(sl, 1)} % (${l3pfF(Math.atan2(dH, Math.abs(dL)) * 180 / Math.PI, 1)}°)`, 1]); } else rows.push(["#94a3b8", "Klicka för att sätta en referenspunkt"]);
    g.font = "12.5px system-ui"; const wd = Math.max(...rows.map(r => g.measureText(r[1]).width)) + 22, hx = X(l3pf.hover) + 14 + wd > gm.l + gm.w ? X(l3pf.hover) - wd - 12 : X(l3pf.hover) + 14, hh = rows.length * 18 + 10;
    g.fillStyle = "rgba(255,255,255,.96)"; g.strokeStyle = "#94a3b8"; g.lineWidth = 1; g.beginPath(); g.rect(hx, gm.t + 6, wd, hh); g.fill(); g.stroke(); g.textAlign = "left";
    rows.forEach((r, k) => { g.fillStyle = r[0]; g.font = (r[2] ? "700 " : "400 ") + "12.5px system-ui"; g.fillText(r[1], hx + 9, gm.t + 24 + k * 18); });
  }
}
/* ---- 3D: linje, band och en markör som följer musen ------------------------------------------------------------------- */
/* Profillinjen i 3D: kraftig röd linje med glöd som behåller samma tjocklek på skärmen, tydliga ändpunkter A/B och en stor, lysande markör som följer musen i diagrammet.
   Linjen går att dra i sidled i 3D (se l3pfDragDown) – profilen räknas om medan du drar. */
function l3pfGlowTex(inner, outer, ring) {
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"), grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, outer); grd.addColorStop(0.28, outer); grd.addColorStop(0.5, outer.replace(/[\d.]+\)$/, "0.35)")); grd.addColorStop(1, outer.replace(/[\d.]+\)$/, "0)")); g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  g.beginPath(); g.arc(64, 64, 26, 0, 6.2832); g.fillStyle = inner; g.fill(); g.lineWidth = 7; g.strokeStyle = ring; g.stroke(); const t = new THREE.CanvasTexture(c); if ("encoding" in t) t.encoding = THREE.sRGBEncoding; return t;
}
function l3pf3d() {
  const A = l3pf.A, B = l3pf.B, z = (A[2] + B[2]) / 2, w = l3pf.w, dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * w, ny = dx / L * w, V = (x, y, zz) => new THREE.Vector3(x, y, zz);
  const grp = new THREE.Group(), unit = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true); unit.rotateZ(Math.PI / 2);
  const core = new THREE.Mesh(unit, new THREE.MeshBasicMaterial({ color: 0xff1f4b, depthTest: false })), glow = new THREE.Mesh(unit.clone(), new THREE.MeshBasicMaterial({ color: 0xff5c7c, transparent: true, opacity: 0.3, depthTest: false })), glow2 = new THREE.Mesh(unit.clone(), new THREE.MeshBasicMaterial({ color: 0xff9db0, transparent: true, opacity: 0.16, depthTest: false }));
  core.renderOrder = 32; glow.renderOrder = 30; glow2.renderOrder = 29;
  const band = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([V(A[0] + nx, A[1] + ny, z), V(B[0] + nx, B[1] + ny, z), V(B[0] - nx, B[1] - ny, z), V(A[0] - nx, A[1] - ny, z)]), new THREE.LineBasicMaterial({ color: 0xff3d63, transparent: true, opacity: 0.7, depthTest: false })); band.renderOrder = 28;
  const dots = new THREE.Points(new THREE.BufferGeometry().setFromPoints([V(A[0], A[1], A[2]), V(B[0], B[1], B[2])]), new THREE.PointsMaterial({ map: l3pfGlowTex("#ffffff", "rgba(255,31,75,0.9)", "#ff1f4b"), size: 30, sizeAttenuation: false, transparent: true, depthTest: false })); dots.renderOrder = 33;
  const mk = new THREE.Points(new THREE.BufferGeometry().setFromPoints([V(0, 0, 0)]), new THREE.PointsMaterial({ map: l3pfGlowTex("#ffe14d", "rgba(255,200,0,0.95)", "#111827"), size: 56, sizeAttenuation: false, transparent: true, depthTest: false })); mk.renderOrder = 34; mk.visible = false;
  [core, glow, glow2, band, dots, mk].forEach(o => { o.userData.noHit = true; o.raycast = () => {}; grp.add(o); });
  l3pf.lineParts = [core, glow, glow2]; l3pf.dots = dots; l3pf.band = band; l3.scene.add(grp); l3pf.grp = grp; l3pf.mark = mk; l3pfLinePlace(); l3pfOrbitHook(); l3Render();
}
/* Placerar och skalar linjens rör efter avståndet till kameran (samma tjocklek på skärmen). */
function l3pfLinePlace() {
  if (!l3pf.lineParts || !l3pf.A) return; const A = l3pf.A, B = l3pf.B, a = new THREE.Vector3(A[0], A[1], A[2]), b = new THREE.Vector3(B[0], B[1], B[2]), mid = a.clone().add(b).multiplyScalar(0.5), dir = b.clone().sub(a), len = dir.length() || 1, q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize());
  const cam = l3.camera, d = cam.isOrthographicCamera ? (cam.top - cam.bottom) / (cam.zoom || 1) * 0.8 : cam.position.distanceTo(mid), hot = l3pf.lineHot ? 1.6 : 1;
  [[0, 0.0032], [1, 0.0075], [2, 0.014]].forEach(([k, f]) => { const m = l3pf.lineParts[k]; m.position.copy(mid); m.quaternion.copy(q); m.scale.set(len, d * f * hot, d * f * hot); });
}
let l3pfOrbitOn = false;
function l3pfOrbitHook() { if (l3pfOrbitOn || !l3.orbit) return; l3pfOrbitOn = true; l3.orbit.addEventListener("change", () => { if (l3pf.lineParts) l3pfLinePlace(); });
  const hoverFn = e => { if (!l3pf.A || l3pf.dragLine) return; const m = l3pfBusyTool() ? null : l3pfHitMode(e), hot = !!m; if (m !== (l3pf.hitMode || null)) { l3pf.hitMode = m; l3pf.lineHot = hot; l3.renderer.domElement.style.cursor = m === "A" || m === "B" ? "move" : hot ? "grab" : ""; l3pfLinePlace(); l3Render(); } }; ["pointermove", "mousemove"].forEach(t => window.addEventListener(t, e => { if (e.target === l3.renderer.domElement) hoverFn(e); }, true)); }
function l3pfMark() {
  const mk = l3pf.mark; if (!mk || !l3pf.data || !l3pf.lines) return; if (l3pf.hover == null) { if (mk.visible) { mk.visible = false; l3Render(); } return; }
  const A = l3pf.A, B = l3pf.B, L = l3pf.data.L, t = l3pf.hover / L, i = l3pf.lines.findIndex((l, k) => !l3pf.hide.has(l3pf.data.series[k].id) && l3pfAt(l, l3pf.hover) != null), z = i >= 0 ? l3pfAt(l3pf.lines[i], l3pf.hover) - l3.O[2] : (A[2] + B[2]) / 2;
  mk.position.set(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, z); mk.visible = true; l3Render();
}
/* ---- Dra profillinjen i sidled i 3D (Victor 2026-11-02) ------------------------------------------------------------------------ */
function l3pfLineDist(e) {
  if (!l3pf.A || !l3.renderer) return Infinity; const r = l3Rect(), mx = e.clientX - r.left, my = e.clientY - r.top, A = l3pf.A, B = l3pf.B, sa = l3ToScreen(new THREE.Vector3(A[0], A[1], A[2])), sb = l3ToScreen(new THREE.Vector3(B[0], B[1], B[2]));
  if (sa.behind && sb.behind) return Infinity; const ax = sb.x - sa.x, ay = sb.y - sa.y, l2 = ax * ax + ay * ay || 1, t = Math.max(0, Math.min(1, ((mx - sa.x) * ax + (my - sa.y) * ay) / l2)); return Math.hypot(sa.x + ax * t - mx, sa.y + ay * t - my);
}
/* Vad ligger under pekaren: en ändpunkt (A/B, 14 px), själva linjen (11 px) eller inget. */
function l3pfHitMode(e) {
  if (!l3pf.A || !l3.renderer) return null; const r = l3Rect(), mx = e.clientX - r.left, my = e.clientY - r.top, sa = l3ToScreen(new THREE.Vector3(...l3pf.A)), sb = l3ToScreen(new THREE.Vector3(...l3pf.B));
  const da = sa.behind ? Infinity : Math.hypot(sa.x - mx, sa.y - my), db = sb.behind ? Infinity : Math.hypot(sb.x - mx, sb.y - my);
  if (Math.min(da, db) <= 14) return da <= db ? "A" : "B"; return l3pfLineDist(e) <= 11 ? "line" : null;
}
const l3pfBusyTool = () => (l3.tool && l3.tool !== "select") || (typeof l3cl !== "undefined" && l3cl.mode) || (typeof l3rb !== "undefined" && (l3rb.draw || l3rb.hd)) || (typeof l3sp !== "undefined" && l3sp.profPick) || (typeof l3pt !== "undefined" && l3pt.picking);
function l3pfDragDown(e) {
  if (!l3pf.A || !l3pf.data || e.button !== 0 || e.target !== l3.renderer.domElement || l3pfBusyTool()) return; const hm = l3pfHitMode(e); if (!hm) return;
  e.stopImmediatePropagation(); e.preventDefault(); const A0 = l3pf.A.slice(), B0 = l3pf.B.slice(), L = l3pf.data.L, nx = -(B0[1] - A0[1]) / L, ny = (B0[0] - A0[0]) / L, zz = (A0[2] + B0[2]) / 2, pl = new THREE.Plane(new THREE.Vector3(0, 0, 1), -zz), p = new THREE.Vector3();
  if (hm === "A" || hm === "B") { l3pf.dragLine = { end: hm, A0, B0, key0: l3pfAnnKey(), last: 0, dur: 0, busy: false }; l3pf.lineHot = true; l3.orbit.enabled = false; l3.renderer.domElement.style.cursor = "move"; l3pfLinePlace(); l3Render(); window.addEventListener("pointermove", l3pfDragMove, true); window.addEventListener("pointerup", l3pfDragUp, true); window.addEventListener("pointercancel", l3pfDragUp, true); return; }
  const sOf = ev => { const ray = l3MouseRay(ev); return ray.intersectPlane(pl, p) ? (p.x - A0[0]) * nx + (p.y - A0[1]) * ny : null; }; const s0 = sOf(e); if (s0 == null) return;
  l3pf.dragLine = { A0, B0, nx, ny, s0, key0: l3pfAnnKey(), last: 0, dur: 0, busy: false }; l3pf.lineHot = true; l3.orbit.enabled = false; l3.renderer.domElement.style.cursor = "grabbing"; l3pfLinePlace(); l3Render();
  window.addEventListener("pointermove", l3pfDragMove, true); window.addEventListener("pointerup", l3pfDragUp, true); window.addEventListener("pointercancel", l3pfDragUp, true);
}
function l3pfDragMove(e) {
  const d = l3pf.dragLine; if (!d) return; e.stopImmediatePropagation(); const end = d.end, zz = end ? (end === "A" ? d.A0[2] : d.B0[2]) : (d.A0[2] + d.B0[2]) / 2, pl = new THREE.Plane(new THREE.Vector3(0, 0, 1), -zz), p = new THREE.Vector3(), ray = l3MouseRay(e); if (!ray.intersectPlane(pl, p)) return; let sh = 0;
  if (end) {   // en ändpunkt åt gången: 10 cm-steg (Alt = fritt), Skift = ortho i 5°-steg från den andra änden
    const O = end === "A" ? d.B0 : d.A0; let x = p.x, y = p.y;
    if (e.shiftKey) { const dx = x - O[0], dy = y - O[1], r = Math.hypot(dx, dy), ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 36)) * (Math.PI / 36); x = O[0] + Math.cos(ang) * r; y = O[1] + Math.sin(ang) * r; }
    if (!e.altKey) { x = Math.round(x * 10) / 10; y = Math.round(y * 10) / 10; } if (Math.hypot(x - O[0], y - O[1]) < 0.5) return;
    if (end === "A") { l3pf.A = [x, y, d.A0[2]]; l3pf.B = d.B0.slice(); } else { l3pf.B = [x, y, d.B0[2]]; l3pf.A = d.A0.slice(); }
  } else {
  sh = (p.x - d.A0[0]) * d.nx + (p.y - d.A0[1]) * d.ny - d.s0; if (!e.altKey) sh = Math.round(sh * 10) / 10;   // hela 10 cm; Alt = fritt
  l3pf.A = [d.A0[0] + d.nx * sh, d.A0[1] + d.ny * sh, d.A0[2]]; l3pf.B = [d.B0[0] + d.nx * sh, d.B0[1] + d.ny * sh, d.B0[2]]; d.sh = sh; }
  const pa = new THREE.Vector3(...l3pf.A), pb = new THREE.Vector3(...l3pf.B), z = (pa.z + pb.z) / 2, w = l3pf.w, L = Math.hypot(pb.x - pa.x, pb.y - pa.y), nx = -(pb.y - pa.y) / L * w, ny = (pb.x - pa.x) / L * w, pos = l3pf.band.geometry.getAttribute("position");
  [[pa.x + nx, pa.y + ny], [pb.x + nx, pb.y + ny], [pb.x - nx, pb.y - ny], [pa.x - nx, pa.y - ny]].forEach(([x, y], k) => pos.setXYZ(k, x, y, z)); pos.needsUpdate = true;
  const dp = l3pf.dots.geometry.getAttribute("position"); dp.setXYZ(0, pa.x, pa.y, pa.z); dp.setXYZ(1, pb.x, pb.y, pb.z); dp.needsUpdate = true; l3pfClipFollow(); l3pfLinePlace(); l3Render();
  const now = performance.now(); if (!d.busy && now - d.last > Math.max(160, d.dur * 2.5)) { d.busy = true; d.last = now; setTimeout(() => { const t0 = performance.now(); try { l3pfRecomputeLive(false); } finally { d.dur = performance.now() - t0; d.busy = false; } }, 0); }
  l3Status(end ? `Punkt ${end} flyttad – längd ${l3pfF(L, 1)} m (Skift = ortho 5°, Alt = fritt, släpp för att räkna klart).` : `Profilen flyttad ${l3pfF(sh, 1)} m i sidled (Alt = fritt, släpp för att räkna klart).`);
}
function l3pfDragUp() {
  window.removeEventListener("pointermove", l3pfDragMove, true); window.removeEventListener("pointerup", l3pfDragUp, true); window.removeEventListener("pointercancel", l3pfDragUp, true);
  const d = l3pf.dragLine; l3pf.dragLine = null; l3pf.lineHot = false; l3pf.hitMode = null; l3.orbit.enabled = true; l3.renderer.domElement.style.cursor = ""; if (!d) return;
  l3pfRecomputeLive(true);
  // markeringarna hör till profilens läge: gammal nyckel tas bort, ny sparas
  { const all = { ...((l3Prefs().pfAnn) || {}) }; delete all[d.key0]; l3SetPref("pfAnn", all); } l3pfAnnSave();
  l3pfClipFollow(); l3pfLinePlace(); l3Render(); l3Status(d.end ? `Punkt ${d.end} flyttad – profilen är uträknad på nytt (längd ${l3pfF(l3pf.data.L, 1)} m).` : "Profilen flyttad – den är uträknad på nytt längs den nya linjen.");
}
/* Räknar om profilen längs den nya linjen. full = även IFC-genomskärningen, legend och vyn. */
function l3pfRecomputeLive(full) {
  const old = l3pf.data, A = l3pf.A, B = l3pf.B; if (!old) return; const nd = l3ptProfile(A, B, l3pf.w), col = new Map(old.series.map(s => [s.id, [s.color, s.aci]]));
  nd.series.forEach((s, i) => { const c = col.get(s.id); s.color = c ? c[0] : L3PF_COL[i % L3PF_COL.length]; s.aci = c ? c[1] : L3PF_ACI[i % L3PF_ACI.length]; }); l3pf.data = nd; l3pfCompute();
  if (full) { const oc = new Map(l3pf.ifc.map(m => [m.id, m.color])); try { l3pf.ifc = l3pfIfcSection(A, B); } catch (e) { l3pf.ifc = []; } l3pf.ifc.forEach((m, i) => { m.color = oc.get(m.id) || L3PF_IFC[i % L3PF_IFC.length]; }); l3pf.ref = null; l3pfUI(); l3pfFit(); l3pfAnn3d(); }
  l3pfInfo(); l3pfDraw();
}
window.addEventListener("pointerdown", l3pfDragDown, true);

/* ---- Klipp längs profilen (Victor 2026-11-02): lodrätt plan genom A–B, som saxverktyget. Av/på-reglage i panelen. ---- */
const l3pfClipOn = () => !!(l3.clips && l3.clips.some(c => c.pf));
function l3pfClipDefs() {
  const A = l3pf.A, B = l3pf.B; if (!A || !B) return null; const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, n = new THREE.Vector3(-dy / L, dx / L, 0), a = new THREE.Vector3(A[0], A[1], A[2]), s = l3pf.clipSide || 1;
  if (l3pf.clipSlab) return [{ n: n.clone(), p: a.clone().addScaledVector(n, -l3pf.w), label: "Profil – skiva" }, { n: n.clone().negate(), p: a.clone().addScaledVector(n, l3pf.w), label: "Profil – skiva" }];
  return [{ n: n.multiplyScalar(s), p: a, label: "Profil" }];
}
function l3pfClipSet(on, keep) {
  const old = (l3.clips || []).filter(c => c.pf), offs = old.map(c => c.off || 0); l3.clips = (l3.clips || []).filter(c => !c.pf);
  if (on && l3pf.A) {
    if (!l3pf.clipSide) { const n = new THREE.Vector3(-(l3pf.B[1] - l3pf.A[1]), l3pf.B[0] - l3pf.A[0], 0).normalize(); l3pf.clipSide = n.dot(l3.camera.position.clone().sub(new THREE.Vector3(...l3pf.A))) > 0 ? -1 : 1; }   // kameran ligger på den borttagna sidan
    const defs = l3pfClipDefs(); if (l3.clips.length + defs.length > 6) { l3Status("Högst 6 snitt – ta bort ett först.", true); if (l3pf.el) l3pfUI(); l3ApplyClips(); return; }
    defs.forEach((d, i) => { const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(d.n, d.p), off = keep && old.length === defs.length ? offs[i] : 0; l3.clips.push({ plane, base: plane.constant, off, anchor: d.p.clone(), label: d.label, pf: true }); if (off) plane.constant = plane.constant - off; });
    l3Status(l3pf.clipSlab ? "Skiva längs profilen (±bredd). Reglaget stänger av." : "3D-vyn klipps längs profilen. Vänd sida med ⇄, stäng av med reglaget.");
  } else if (old.length) l3Status("Klippningen längs profilen är avstängd.");
  l3ApplyClips(); if (l3.clips.length) l3RenderClipDlg(); else l3DlgClose("v3Clip"); if (l3pf.el) l3pfUI();
}
/* Profillinjen har flyttats: planen följer med (behåller ev. förskjutning från snittfönstret). */
function l3pfClipFollow() {
  const cs = (l3.clips || []).filter(c => c.pf); if (!cs.length || !l3pf.A) return; const defs = l3pfClipDefs(); if (defs.length !== cs.length) return;
  cs.forEach((c, i) => { c.plane.setFromNormalAndCoplanarPoint(defs[i].n, defs[i].p); c.base = c.plane.constant; c.anchor = defs[i].p.clone(); if (c.off) c.plane.constant = c.base - c.off; });
  l3.renderer.clippingPlanes = l3.clips.map(c => c.plane);
}
function l3pfClear(keepData) {
  if (l3pf.ro) { l3pf.ro.disconnect(); l3pf.ro = null; } if (document.fullscreenElement && l3pf.el && document.fullscreenElement === l3pf.el) document.exitFullscreen().catch(() => {});
  const e = document.getElementById("v3PcProf"); if (e) e.remove(); l3pf.el = l3pf.cv = null; l3pf.fs = false;
  if (l3pf.grp) { l3.scene.remove(l3pf.grp); l3pf.grp.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); l3pf.grp = l3pf.mark = null; l3pf.lineParts = l3pf.dots = l3pf.band = null; l3Render(); }
  if (l3pf.annGrp) { l3.scene.remove(l3pf.annGrp); l3pf.annGrp.traverse(o => { if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } if (o.geometry) o.geometry.dispose(); }); l3pf.annGrp = null; l3Render(); }
  if (!keepData) { if (l3pfClipOn()) { l3.clips = l3.clips.filter(c => !c.pf); l3ApplyClips(); if (l3.clips.length) l3RenderClipDlg(); else l3DlgClose("v3Clip"); } l3pf.clipSide = 0; l3pf.data = null; l3pf.A = l3pf.B = null; if (typeof l3pt !== "undefined") l3pt.prof = null; }
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
/* ---- Plushöjder och kommentarer (Victor 2026-11-02): klicka ut höjder och lägg kommentarer/områden direkt i profilen -------------------------------- */
const l3pfAnnKey = () => { const O = l3.O, A = l3pf.A, B = l3pf.B; return [A[0] + O[0], A[1] + O[1], B[0] + O[0], B[1] + O[1]].map(v => Math.round(v * 10) / 10).join("_"); };
function l3pfAnnLoad() { const all = (typeof l3Prefs === "function" && l3Prefs().pfAnn) || {}; l3pf.ann = JSON.parse(JSON.stringify(all[l3pfAnnKey()] || [])); }
function l3pfAnnSave() { const all = { ...((l3Prefs().pfAnn) || {}) }; if (l3pf.ann.length) all[l3pfAnnKey()] = l3pf.ann; else delete all[l3pfAnnKey()]; const ks = Object.keys(all); if (ks.length > 40) delete all[ks[0]]; l3SetPref("pfAnn", all); l3pfAnn3d(); }
const l3pfPlus = z => (z >= 0 ? "+" : "−") + l3pfF(Math.abs(z), 2);
function l3pfAnnAdd(a) { a.id = "an" + Math.random().toString(36).slice(2, 8); l3pf.ann.push(a); l3pfAnnSave(); l3pfDraw(); return a; }
/* Ritar markeringarna i diagrammet. Sparar träffytor för klick när det inte är en export. */
function l3pfAnnDraw(g, gm, X, Y, exporting) {
  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  if (!exporting) l3pf.annBoxes = []; let row = 0; g.font = "700 12px system-ui"; g.textAlign = "left";
  l3pf.ann.forEach(a => {
    const x = X(a.t), zs = a.z != null ? a.z : l3pfSurfZ(a.t), y = zs != null ? Y(zs) : gm.t + gm.h / 2;
    if (a.k === "spot") {
      const tx = l3pfPlus(a.z), w = g.measureText(tx).width + 14, ly = Math.max(gm.t + 22, y - 36), lx = Math.min(Math.max(x - w / 2, gm.l + 2), gm.l + gm.w - w - 2);
      g.strokeStyle = "#0f172a"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x, ly + 8); g.stroke();
      rr(lx, ly - 10, w, 20, 6); g.fillStyle = "#0f172a"; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 1.5; g.stroke(); g.fillStyle = "#fff"; g.fillText(tx, lx + 7, ly + 4.5);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 6.5, y - 11); g.lineTo(x + 6.5, y - 11); g.closePath(); g.fillStyle = "#dc2626"; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 1.8; g.stroke();
      if (!exporting) l3pf.annBoxes.push({ id: a.id, x0: Math.min(lx, x - 8), y0: ly - 10, x1: Math.max(lx + w, x + 8), y1: y + 2 });
    } else {
      const col = "#d97706", txt = a.text || "Kommentar", w = g.measureText(txt).width + 16, ly = gm.t + 18 + (row++ % 3) * 25;
      if (a.t1 != null) {
        const x1 = X(a.t1), xa = Math.min(x, x1), xb = Math.max(x, x1); g.fillStyle = "rgba(245,158,11,.14)"; g.fillRect(xa, gm.t, xb - xa, gm.h); g.strokeStyle = col; g.lineWidth = 1.4; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(xa, gm.t); g.lineTo(xa, gm.t + gm.h); g.moveTo(xb, gm.t); g.lineTo(xb, gm.t + gm.h); g.stroke(); g.setLineDash([]);
        const lx = Math.min(Math.max((xa + xb) / 2 - w / 2, gm.l + 2), gm.l + gm.w - w - 2); rr(lx, ly - 11, w, 22, 7); g.fillStyle = "#fef3c7"; g.fill(); g.strokeStyle = col; g.lineWidth = 1.5; g.stroke(); g.fillStyle = "#7c2d12"; g.fillText(txt, lx + 8, ly + 4.5);
        if (!exporting) l3pf.annBoxes.push({ id: a.id, x0: lx, y0: ly - 11, x1: lx + w, y1: ly + 11 });
      } else {
        const lx = Math.min(Math.max(x - 10, gm.l + 2), gm.l + gm.w - w - 2); g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x, ly + 11); g.stroke();
        rr(lx, ly - 11, w, 22, 7); g.fillStyle = "#fef3c7"; g.fill(); g.strokeStyle = col; g.lineWidth = 1.5; g.stroke(); g.fillStyle = "#7c2d12"; g.fillText(txt, lx + 8, ly + 4.5);
        g.beginPath(); g.arc(x, y, 6, 0, 6.2832); g.fillStyle = col; g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke();
        if (!exporting) l3pf.annBoxes.push({ id: a.id, x0: Math.min(lx, x - 8), y0: ly - 11, x1: Math.max(lx + w, x + 8), y1: y + 8 });
      }
    }
  });
}
function l3pfAnnHit(px, py) { const b = (l3pf.annBoxes || []).slice().reverse().find(q => px >= q.x0 - 3 && px <= q.x1 + 3 && py >= q.y0 - 3 && py <= q.y1 + 3); return b ? l3pf.ann.find(a => a.id === b.id) : null; }
/* Egen liten inmatningsruta inne i profilen (webbläsarens dialoger syns inte i fullskärm) */
function l3pfAsk(label, def, o = {}) {
  return new Promise(res => {
    const el = l3pf.el; if (!el) return res(null); const old = el.querySelector(".pfask"); if (old) old.remove();
    const b = document.createElement("div"); b.className = "pfask", p = l3pf.lastPt || { x: 120, y: 90 };
    b.style.left = Math.max(8, Math.min(p.x - 20, el.clientWidth - 290)) + "px"; b.style.top = Math.max(8, Math.min(p.y + 14, el.clientHeight - 140)) + "px";
    b.innerHTML = `<div class="q">${label}</div>${o.confirm ? "" : `<input type="text" maxlength="80" value="${String(def || "").replace(/"/g, "&quot;")}" placeholder="Skriv här…">`}<div class="bt"><button type="button" class="p" data-ok>${o.confirm ? "Ta bort" : "OK"}</button>${o.del ? '<button type="button" data-del>Ta bort</button>' : ""}<button type="button" data-no>Avbryt</button></div>`;
    ["pointerdown", "pointerup", "click", "wheel", "keydown", "keyup", "dblclick"].forEach(t => b.addEventListener(t, e => e.stopPropagation()));
    const done = v => { b.remove(); res(v); }, inp = b.querySelector("input");
    b.querySelector("[data-ok]").onclick = () => done(o.confirm ? { ok: true } : { v: inp.value.trim() }); b.querySelector("[data-no]").onclick = () => done(null); const d = b.querySelector("[data-del]"); if (d) d.onclick = () => done({ del: true });
    b.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); b.querySelector("[data-ok]").click(); } else if (e.key === "Escape") { e.preventDefault(); done(null); } });
    el.appendChild(b); if (inp) { inp.focus(); inp.select(); }
  });
}
async function l3pfAnnEdit(a) {
  if (a.k === "note") { const r = await l3pfAsk("Kommentar", a.text || "", { del: true }); if (!r) return; if (r.del || !r.v) l3pf.ann = l3pf.ann.filter(x => x !== a); else a.text = r.v; }
  else { const r = await l3pfAsk(`Ta bort plushöjden ${l3pfPlus(a.z)}?`, "", { confirm: true }); if (!r) return; l3pf.ann = l3pf.ann.filter(x => x !== a); }
  l3pfAnnSave(); l3pfDraw();
}
/* Höjden en markering snappar till: ytlinjerna (punktmoln) eller IFC-konturen vid avståndet t – den som ligger närmast höjden du pekar på. */
function l3pfSnapZ(t, hz) {
  const c = [], sz = l3pfSurfZ(t); if (sz != null) c.push(sz);
  l3pf.ifc.forEach(m => { if (l3pf.hide.has("ifc:" + m.id)) return; const S = m.segs; for (let k = 0; k < S.length; k += 4) { const a = S[k], b = S[k + 2]; if ((t >= a && t <= b) || (t >= b && t <= a)) { const f = Math.abs(b - a) < 1e-9 ? 0 : (t - a) / (b - a); c.push(S[k + 1] + (S[k + 3] - S[k + 1]) * f); } } });
  l3pf.data.series.forEach((s, i) => { if (l3pf.hide.has(s.id)) return; const ln = l3pf.lines[i], b = l3pfBin(ln, t); if (ln.v[b] != null) { if (!isNaN(ln.mx[b])) c.push(ln.mx[b]); } });
  if (!c.length) return hz; if (hz == null) return c[0]; return c.reduce((best, z) => Math.abs(z - hz) < Math.abs(best - hz) ? z : best, c[0]);
}
async function l3pfAnnNote(t0, t1) { const r = await l3pfAsk(t1 != null ? "Kommentar för området (t.ex. Väg, Fundament F12)" : "Kommentar (t.ex. Fundament F12)", ""); if (!r || !r.v) return; const a = { k: "note", t: t0, text: r.v }; if (t1 != null) { a.t = Math.min(t0, t1); a.t1 = Math.max(t0, t1); } else a.z = l3pfSnapZ(t0, l3pf.hz); l3pfAnnAdd(a); }
function l3pfTool(t) { l3pf.tool = l3pf.tool === t ? null : t; const el = l3pf.el; if (el) el.querySelectorAll("[data-pf=tspot],[data-pf=tnote]").forEach(b => b.classList.toggle("on", l3pf.tool === b.dataset.pf.slice(1))); if (l3pf.cv) l3pf.cv.style.cursor = l3pf.tool ? "copy" : "crosshair"; l3Status(l3pf.tool === "spot" ? "Plushöjd: klicka i profilen (Alt = fri höjd i stället för ytan)." : l3pf.tool === "note" ? "Kommentar: klicka för en punkt eller dra över ett område." : "Verktyg av."); }
/* Etiketter i 3D längs linjen (plushöjder och kommentarer) */
function l3pfAnn3d() {
  if (l3pf.annGrp) { l3.scene.remove(l3pf.annGrp); l3pf.annGrp.traverse(o => { if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } if (o.geometry) o.geometry.dispose(); }); l3pf.annGrp = null; }
  if (!l3pf.A || !l3pf.data || !l3pf.ann || !l3pf.ann.length) { l3Render(); return; } const A = l3pf.A, B = l3pf.B, L = l3pf.data.L, grp = new THREE.Group();
  l3pf.ann.forEach(a => { const tm = a.t1 != null ? (a.t + a.t1) / 2 : a.t, z = a.z != null ? a.z : l3pfSurfZ(tm); if (z == null) return; const txt = a.k === "spot" ? l3pfPlus(z) : (a.text || "Kommentar"), cv = document.createElement("canvas"), c = cv.getContext("2d"); c.font = "700 34px system-ui"; const w = Math.ceil(c.measureText(txt).width) + 30; cv.width = w; cv.height = 56; c.font = "700 34px system-ui"; c.fillStyle = a.k === "spot" ? "#0f172a" : "#fef3c7"; c.strokeStyle = a.k === "spot" ? "#fff" : "#d97706"; c.lineWidth = 4; c.beginPath(); if (c.roundRect) c.roundRect(3, 3, w - 6, 50, 14); else c.rect(3, 3, w - 6, 50); c.fill(); c.stroke(); c.fillStyle = a.k === "spot" ? "#fff" : "#7c2d12"; c.fillText(txt, 15, 40);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthTest: false, sizeAttenuation: false })); sp.scale.set(0.026 * w / 56, 0.026, 1); sp.position.set(A[0] + (B[0] - A[0]) * tm / L, A[1] + (B[1] - A[1]) * tm / L, z - l3.O[2] + 0.6); sp.renderOrder = 33; sp.userData.noHit = true; sp.raycast = () => {}; grp.add(sp);
    const pt = new THREE.Points(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(sp.position.x, sp.position.y, z - l3.O[2])]), new THREE.PointsMaterial({ color: a.k === "spot" ? 0xdc2626 : 0xd97706, size: 7, sizeAttenuation: false, depthTest: false })); pt.renderOrder = 33; pt.raycast = () => {}; grp.add(pt); });
  l3.scene.add(grp); l3pf.annGrp = grp; l3Render();
}
/* ---- Export ------------------------------------------------------------------------------------------------------------- */
/* Vad profilen bygger på: moln, modeller, jämförelse – och var den är tagen (situationskarta). Används i PNG, DXF och CSV (Victor 2026-11-02). */
function l3pfMeta() {
  const D = l3pf.data, ids = D.series.map(s => s.id), O = l3.O, A = l3pf.A, B = l3pf.B, lines = [], pn = typeof projectName !== "undefined" && projectName ? projectName : "";
  const modeN = { median: "median", mean: "medel", max: "övre (topp)", min: "nedre (mark)" }[l3pf.mode] || l3pf.mode;
  lines.push(`Profil ${l3pfF(D.L, 1)} m · bredd ±${l3pfF(l3pf.w, 2)} m · yta: ${modeN}${pn ? " · " + pn : ""}`);
  lines.push(`Start ${l3pfF(A[0] + O[0], 1)} / ${l3pfF(A[1] + O[1], 1)} → slut ${l3pfF(B[0] + O[0], 1)} / ${l3pfF(B[1] + O[1], 1)} (E / N)`);
  D.series.forEach(s => lines.push(`Punktmoln: ${s.name} – ${s.n.toLocaleString("sv-SE")} punkter${l3pf.hide.has(s.id) ? " (dolt)" : ""}`));
  if (l3pf.cmp && l3pf.diff) lines.push(`Jämförelse: ${D.series[ids.indexOf(l3pf.cmp[0])].name} mot ${D.series[ids.indexOf(l3pf.cmp[1])].name} – schakt ${l3pfF(l3pf.diff.cut, 2)} m², fyllning ${l3pfF(l3pf.diff.fill, 2)} m²`);
  if (l3pf.ifcOn && l3pf.ifc.length) lines.push(`IFC-modeller i genomskärningen: ${l3pf.ifc.filter(m => !l3pf.hide.has("ifc:" + m.id)).map(m => m.name).join(", ") || "–"}`);
  if (l3pf.level != null) lines.push(`Nivålinje ${l3pfF(l3pf.level, 2)} m ö.h.`);
  { const sp = l3pf.ann.filter(a => a.k === "spot"), nt = l3pf.ann.filter(a => a.k === "note"); if (sp.length) lines.push(`Plushöjder: ${sp.slice(0, 12).map(a => l3pfPlus(a.z) + " (" + l3pfF(a.t, 1) + " m)").join(", ")}${sp.length > 12 ? " …" : ""}`); nt.slice(0, 8).forEach(a => lines.push(`Kommentar: ${a.text} (${l3pfF(a.t, 1)}${a.t1 != null ? "–" + l3pfF(a.t1, 1) : ""} m)`)); }
  const d = new Date(); lines.push(`Skapad ${d.toLocaleDateString("sv-SE")} ${d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}`);
  return lines;
}
/* Rutor (världskoordinater) för molnens och modellernas utbredning, till situationskartan. */
function l3pfBoxes() {
  const O = l3.O, out = [];
  if (typeof l3pc !== "undefined") l3pc.clouds.filter(c => c.visible).forEach(c => { const g = c.group.position; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; c.chunks.forEach(ch => { const P = ch.pos, n = P.length / 3; for (let i = 0; i < n; i += 11) { const x = P[i * 3] + g.x, y = P[i * 3 + 1] + g.y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }); if (isFinite(x0)) out.push({ kind: "moln", name: c.name, x0: x0 + O[0], y0: y0 + O[1], x1: x1 + O[0], y1: y1 + O[1] }); });
  if (typeof l3b !== "undefined") l3b.models.filter(m => m.visible !== false).forEach(m => { const b = new THREE.Box3(); m.meshes.forEach(x => { if (x.visible !== false) b.expandByObject(x); }); if (!b.isEmpty()) out.push({ kind: "ifc", name: m.name || String(m.id), x0: b.min.x + O[0], y0: b.min.y + O[1], x1: b.max.x + O[0], y1: b.max.y + O[1] }); });
  return out;
}
/* Situationskarta: ritningen/ortofotot från minimapen om den är inläst, annars molnens och modellernas rutor, med profillinjen A–B (lila). (x, y, S) = hörn och sidlängd i bildpunkter. */
function l3pfSituation(g, x, y, S) {
  const O = l3.O, A = [l3pf.A[0] + O[0], l3pf.A[1] + O[1]], B = [l3pf.B[0] + O[0], l3pf.B[1] + O[1]], boxes = l3pfBoxes();
  g.save(); g.beginPath(); g.rect(x, y, S, S); g.clip(); g.fillStyle = "#f1f5f9"; g.fillRect(x, y, S, S);
  const hasPlan = typeof l3sp !== "undefined" && l3sp.img && l3sp.aff && l3sp.vp && typeof l3spToImg === "function";
  let M; // värld → bildpunkt
  if (hasPlan) {
    const iA = l3spToImg(A[0], A[1]), iB = l3spToImg(B[0], B[1]), cx = (iA[0] + iB[0]) / 2, cy = (iA[1] + iB[1]) / 2, span = Math.hypot(iB[0] - iA[0], iB[1] - iA[1]), half = Math.max(span * 0.9, l3sp.img.width * 0.06), k = S / (2 * half), tx = x + S / 2 - cx * k, ty = y + S / 2 - cy * k;
    g.fillStyle = "#fff"; g.fillRect(x, y, S, S); g.imageSmoothingEnabled = true; g.drawImage(l3sp.img, tx, ty, l3sp.img.width * k, l3sp.img.height * k); M = (wx, wy) => { const q = l3spToImg(wx, wy); return [tx + q[0] * k, ty + q[1] * k]; };
  } else {
    let x0 = Math.min(A[0], B[0]), x1 = Math.max(A[0], B[0]), y0 = Math.min(A[1], B[1]), y1 = Math.max(A[1], B[1]); boxes.forEach(b => { x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); y0 = Math.min(y0, b.y0); y1 = Math.max(y1, b.y1); });
    const sp = Math.max(x1 - x0, y1 - y0, 1) * 1.12, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, k = S / sp; M = (wx, wy) => [x + S / 2 + (wx - cx) * k, y + S / 2 - (wy - cy) * k];
    boxes.forEach(b => { const p0 = M(b.x0, b.y1), p1 = M(b.x1, b.y0); g.fillStyle = b.kind === "moln" ? "rgba(37,99,235,.16)" : "rgba(100,116,139,.22)"; g.strokeStyle = b.kind === "moln" ? "#2563eb" : "#475569"; g.lineWidth = 1.2; g.fillRect(p0[0], p0[1], p1[0] - p0[0], p1[1] - p0[1]); g.strokeRect(p0[0], p0[1], p1[0] - p0[0], p1[1] - p0[1]); });
  }
  const a = M(A[0], A[1]), b = M(B[0], B[1]), r = Math.max(4, S / 55); g.strokeStyle = "#fff"; g.lineWidth = Math.max(4, S / 40); g.lineCap = "round"; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.strokeStyle = "#7c3aed"; g.lineWidth = Math.max(2.4, S / 80); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  [[a, "A"], [b, "B"]].forEach(([q, t]) => { g.fillStyle = "#7c3aed"; g.beginPath(); g.arc(q[0], q[1], r, 0, 6.2832); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 2; g.stroke(); g.fillStyle = "#0f172a"; g.font = `700 ${Math.round(S / 15)}px system-ui`; const lw = S / 12; g.textAlign = q[0] + r + 3 + lw > x + S ? "right" : "left"; g.fillText(t, q[0] + (g.textAlign === "right" ? -r - 3 : r + 3), q[1] - r - 1); });
  g.restore(); g.strokeStyle = "#64748b"; g.lineWidth = 1.5; g.strokeRect(x, y, S, S); g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(x + 1, y + S - Math.round(S / 11) - 2, S - 2, Math.round(S / 11) + 1); g.fillStyle = "#334155"; g.font = `${Math.round(S / 17)}px system-ui`; g.textAlign = "left"; g.fillText(hasPlan ? "Var profilen är tagen (ritningen)" : "Var profilen är tagen", x + 6, y + S - Math.round(S / 40) - 3);
}
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
    if (l3pf.ifcOn) l3pf.ifc.forEach(m => { if (l3pf.hide.has("ifc:" + m.id)) return; const nm = lay("PROFIL_IFC_" + l3pfLayer(m.name), l3pfAci(m.color)); m.objs.forEach(o => { if (o.polys) o.polys.forEach(q => { if (q.pts.length > 1) pl(nm, q.pts.map(c => M(c[0], c[1])), q.closed, true); }); else { const S = o.segs; for (let k = 0; k < S.length; k += 4) line(nm, M(S[k], S[k + 1]), M(S[k + 2], S[k + 3])); } }); });
    if (l3pf.level != null) line(lay("PROFIL_NIVA", 30), M(0, l3pf.level), M(L, l3pf.level));
    l3pf.ann.forEach(a => { const tm = a.t1 != null ? (a.t + a.t1) / 2 : a.t, z = a.z != null ? a.z : (l3pfSurfZ(tm) ?? 0), lyr = a.k === "spot" ? lay("PROFIL_PLUSHOJD", 1) : lay("PROFIL_KOMMENTAR", 30), P0 = M(tm, z), P1 = M(tm, z + 1.5); line(lyr, P0, P1); body.push("0", "TEXT", "8", lyr, "10", num(P1[0]), "20", num(P1[1]), "30", num(P1[2]), "40", "0.4", "1", l3pfAsc(a.k === "spot" ? (z >= 0 ? "+" : "-") + l3pfF(Math.abs(z), 2) : a.text)); if (a.t1 != null) { line(lyr, M(a.t, z), M(a.t, z + 1.5)); line(lyr, M(a.t1, z), M(a.t1, z + 1.5)); } });
    D.series.forEach((s, i) => { if (l3pf.hide.has(s.id)) return; const ln = l3pf.lines[i], lay_ = lay("PROFIL_" + l3pfLayer(s.name), s.aci); let seg = []; const flush = () => { if (seg.length > 1) pl(lay_, seg, false, true); seg = []; }; ln.v.forEach((v, b) => { if (v == null) flush(); else seg.push(M(ln.t(b), v)); }); flush(); });
  } else {
    const all = []; D.series.forEach((s, i) => { if (!l3pf.hide.has(s.id)) l3pf.lines[i].v.forEach(v => { if (v != null) all.push(v); }); }); const zlo = Math.floor(Math.min(...all, 0) / 1) * 1, zhi = Math.ceil(Math.max(...all, 1)), zs = l3pfNice(zhi - zlo, 8), th = Math.max(0.15, (zhi - zlo) / 60);
    // rutnät, axlar och text
    for (let z = Math.ceil(zlo / zs) * zs; z <= zhi + 1e-9; z += zs) { line("PROFIL_RUTNAT", [0, z], [L, z]); text("PROFIL_TEXT", [-th * 1.2 * String(l3pfF(z, 1)).length - 0.5, z - th / 2], th, l3pfF(z, 2)); }
    const xs = l3pfNice(L, 10); for (let t = 0; t <= L + 1e-9; t += xs) { line("PROFIL_RUTNAT", [t, zlo], [t, zhi]); text("PROFIL_TEXT", [t - th * 1.5, zlo - th * 2.4], th, l3pfF(t, xs < 1 ? 1 : 0) + " m"); }
    // höjdskala (streck + siffror) på båda sidor, ifylld IFC-genomskärning och nivålinje
    for (let z = Math.ceil(zlo / zs) * zs; z <= zhi + 1e-9; z += zs) { line("PROFIL_SKALA", [-th * 0.9, z], [0, z]); line("PROFIL_SKALA", [L, z], [L + th * 0.9, z]); text("PROFIL_TEXT", [L + th * 1.2, z - th / 2], th, l3pfF(z, 2)); for (let k = 1; k < 5; k++) { const zz = z + zs * k / 5; if (zz < zhi) { line("PROFIL_SKALA", [-th * 0.45, zz], [0, zz]); line("PROFIL_SKALA", [L, zz], [L + th * 0.45, zz]); } } }
    for (let t = 0; t <= L + 1e-9; t += xs) line("PROFIL_SKALA", [t, zlo - th * 0.9], [t, zlo]); lay("PROFIL_SKALA", 7);
    if (l3pf.ifcOn) l3pf.ifc.forEach(m => { if (l3pf.hide.has("ifc:" + m.id)) return; const nm = lay("PROFIL_IFC_" + l3pfLayer(m.name), l3pfAci(m.color)); m.objs.forEach(o => { if (o.polys) o.polys.forEach(q => { if (q.pts.length > 1) pl(nm, q.pts, q.closed, false); }); else { const S = o.segs; for (let k = 0; k < S.length; k += 4) line(nm, [S[k], S[k + 1]], [S[k + 2], S[k + 3]]); } }); });
    if (l3pf.cint > 0) { const ci = l3pf.cint; for (let z = Math.ceil(zlo / ci) * ci; z <= zhi + 1e-9; z += ci) { line(lay("PROFIL_HOJDKURVOR", 8), [0, z], [L, z]); } }
    if (l3pf.level != null) { line(lay("PROFIL_NIVA", 30), [0, l3pf.level], [L, l3pf.level]); text("PROFIL_TEXT", [L * 0.01, l3pf.level + th * 0.3], th, "Niva " + l3pfF(l3pf.level, 2)); }
    // underlag (moln, modeller, jämförelse) under profilen och en situationskarta nere till höger: var profilen är tagen
    { const meta = l3pfMeta(), boxes = l3pfBoxes(), S = Math.max(L * 0.22, 20), sx0 = L - S, sy1 = zlo - th * 5, sy0 = sy1 - S, wa = [ox, oy], wb = [ox + ux * L, oy + uy * L];
      meta.forEach((t, k) => text("PROFIL_INFO", [0, sy1 - th * 1.9 * (k + 1)], th * 0.9, t)); lay("PROFIL_INFO", 7);
      let bx0 = Math.min(wa[0], wb[0]), bx1 = Math.max(wa[0], wb[0]), by0 = Math.min(wa[1], wb[1]), by1 = Math.max(wa[1], wb[1]); boxes.forEach(b => { bx0 = Math.min(bx0, b.x0); bx1 = Math.max(bx1, b.x1); by0 = Math.min(by0, b.y0); by1 = Math.max(by1, b.y1); });
      const sp = Math.max(bx1 - bx0, by1 - by0, 1) * 1.12, cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2, k = S / sp, Q = (wx, wy) => [sx0 + S / 2 + (wx - cx) * k, sy0 + S / 2 + (wy - cy) * k];
      pl(lay("PROFIL_KARTA", 8), [[sx0, sy0], [L, sy0], [L, sy1], [sx0, sy1]], true, false);
      boxes.forEach(b => { const p0 = Q(b.x0, b.y0), p1 = Q(b.x1, b.y1); pl(lay(b.kind === "moln" ? "PROFIL_KARTA_MOLN" : "PROFIL_KARTA_IFC", b.kind === "moln" ? 5 : 8), [p0, [p1[0], p0[1]], p1, [p0[0], p1[1]]], true, false); });
      const qa = Q(wa[0], wa[1]), qb = Q(wb[0], wb[1]); line(lay("PROFIL_KARTA_PROFIL", 6), qa, qb); text("PROFIL_KARTA_PROFIL", [qa[0] + th * 0.3, qa[1] + th * 0.3], th, "A"); text("PROFIL_KARTA_PROFIL", [qb[0] + th * 0.3, qb[1] + th * 0.3], th, "B"); text("PROFIL_INFO", [sx0, sy1 + th * 0.4], th * 0.8, "Var profilen ar tagen"); }
    l3pf.ann.forEach((a, k) => { if (a.k === "spot") { pl(lay("PROFIL_PLUSHOJD", 1), [[a.t, a.z], [a.t - th * 0.5, a.z + th], [a.t + th * 0.5, a.z + th]], true, false); line("PROFIL_PLUSHOJD", [a.t, a.z + th], [a.t, a.z + th * 3]); text("PROFIL_PLUSHOJD", [a.t + th * 0.4, a.z + th * 3], th, (a.z >= 0 ? "+" : "-") + l3pfF(Math.abs(a.z), 2)); }
      else { const top = zhi - th * (2 + (k % 3) * 2); lay("PROFIL_KOMMENTAR", 30); if (a.t1 != null) { pl("PROFIL_KOMMENTAR", [[a.t, zlo], [a.t1, zlo], [a.t1, zhi], [a.t, zhi]], true, false); text("PROFIL_KOMMENTAR", [a.t + th * 0.4, top], th, a.text); } else { const zz = a.z != null ? a.z : zlo; line("PROFIL_KOMMENTAR", [a.t, zz], [a.t, top]); text("PROFIL_KOMMENTAR", [a.t + th * 0.4, top], th, a.text); } } });
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
  l3pf.ann.forEach(a => rows.push([a.k === "spot" ? "Plushöjd" : "Kommentar: " + a.text, a.k === "spot" ? "Plushöjd" : "Kommentar", a.t, a.t1 != null ? a.t1 : 0, a.z != null ? a.z : (l3pfSurfZ(a.t) ?? "")]));
  const meta = l3pfMeta().map(t => '"' + t.replace(/"/g, '""') + '"').join("\r\n"), body = l3ptCsvText(rows, ["Moln", "Typ", "Avstånd (m)", "Sida (m)", "Höjd (m ö.h.)"]); l3pfDownload(`Profil ${l3pfStamp()}.csv`, new Blob(["\uFEFF" + meta + "\r\n\r\n" + body.replace(/^\uFEFF/, "")], { type: "text/csv;charset=utf-8" }));
}
function l3pfPng() {
  const meta0 = l3pfMeta(), el = document.createElement("canvas"), W = 1800, H = 900, FH = Math.max(380, 70 + meta0.length * 31 + 20), S = 340; el.width = W; el.height = H + FH; const g = el.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, W, H + FH);
  const keep = l3pf.hover; l3pf.hover = null; l3pfDraw(g, [W, H]); l3pf.hover = keep;
  // underkant: vad profilen bygger på (vänster) och situationskarta (höger)
  g.fillStyle = "#e2e8f0"; g.fillRect(0, H, W, 2); g.textAlign = "left"; let yy = H + 38; g.fillStyle = "#0f172a"; g.font = "700 24px system-ui"; g.fillText("Profil – underlag", 30, yy); yy += 12;
  const ids = l3pf.data.series.map(s => s.id), sw = (col, y) => { g.fillStyle = col; g.fillRect(30, y - 15, 14, 14); };
  meta0.forEach(t => { yy += 31; g.font = "20px system-ui"; g.fillStyle = "#334155"; const sr = l3pf.data.series.find(q => t.startsWith("Punktmoln: " + q.name)); if (sr) { sw(sr.color, yy); g.fillText(t, 54, yy); } else g.fillText(t, 30, yy); });
  l3pfSituation(g, W - S - 30, H + 20, S); el.toBlob(b => b && l3pfDownload(`Profil ${l3pfStamp()}.png`, b));
}
