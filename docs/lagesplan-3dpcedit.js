/* Redigera punktmoln (Victor 2026-10-31: "ett redigera-läge för punktmolnen där jag kan ta bort punkter").
   Rita en frihandsring (punkt för punkt) eller en rektangel runt det som ska bort (t.ex. fordon, personer, brus, vegetation) och välj
   Ta bort innanför / Ta bort utanför. Ringen gäller alla punkter längs siktlinjen genom bilden (som i andra punktmolnsprogram).
   Ändringen är icke-destruktiv: filen och det inlästa originalet finns kvar, redigeringarna sparas som en lista (kameramatris + ring)
   i projektets inställningar och läggs på igen när molnet läses in. Ångra tar bort senaste, Återställ alla tar tillbaka allt. */
const l3pe = { c: null, mode: "poly", pts: [], pend: null, nav: false, ov: null, svg: null, panel: null, drag: null, mouse: null };
const L3PE_CSS = `#v3PcEdOv{position:absolute;inset:0;z-index:25;cursor:crosshair;touch-action:none}#v3PcEdOv svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
#v3PcEdOv.nav{pointer-events:none}#v3PcEdPanel{position:absolute;left:50%;transform:translateX(-50%);bottom:14px;z-index:26;max-width:calc(100% - 24px);background:var(--v3-panel,#fff);color:inherit;border:1px solid rgba(0,0,0,.12);border-radius:14px;box-shadow:0 8px 28px rgba(0,0,0,.2);padding:10px 12px;font:13px system-ui,sans-serif;display:flex;flex-direction:column;gap:8px}
#v3PcEdPanel .r{display:flex;flex-wrap:wrap;gap:6px;align-items:center}#v3PcEdPanel button{border:1px solid rgba(0,0,0,.15);background:#fff;border-radius:9px;padding:6px 10px;font:inherit;cursor:pointer}
#v3PcEdPanel button.on{background:#2563eb;color:#fff;border-color:#2563eb}#v3PcEdPanel button.bad{background:#dc2626;color:#fff;border-color:#dc2626}#v3PcEdPanel button:disabled{opacity:.4;cursor:default}#v3PcEdPanel .t{opacity:.7;font-size:12px}`;
function l3peEdits(id) { const E = l3Prefs().pcEdits || {}; return Array.isArray(E[id]) ? E[id] : []; }
function l3peSave(c) { const E = { ...(l3Prefs().pcEdits || {}) }; if (c.edits && c.edits.length) E[c.id] = c.edits; else delete E[c.id]; l3SetPref("pcEdits", E); }
const l3peInPoly = (poly, bb, x, y) => {
  if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) return false;
  let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins; }
  return ins;
};
/* Läggs på molnets original: alla redigeringar i ordning. Returnerar antal punkter kvar. */
function l3peApply(c) {
  if (!c.orig) c.orig = c.chunks.map(ch => ({ pos: ch.pos, rgb: ch.rgb, inten: ch.inten }));
  const ed = c.edits || []; let total = 0;
  c.chunks.forEach((ch, k) => {
    const o = c.orig[k], n = o.pos.length / 3; let keep = null, cnt = n;
    if (ed.length) {
      keep = new Uint8Array(n).fill(1); cnt = n;
      ed.forEach(e => {
        const m = e.pm, cx = c.info.center[0] - e.O[0], cy = c.info.center[1] - e.O[1], cz = c.info.center[2] + (e.dz || 0) - e.O[2], poly = e.poly, rm = e.mode === "out" ? 0 : 1;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; poly.forEach(q => { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }); const bb = [x0, y0, x1, y1], P = o.pos;
        for (let i = 0; i < n; i++) {
          if (!keep[i]) continue;
          const x = P[i * 3] + cx, y = P[i * 3 + 1] + cy, z = P[i * 3 + 2] + cz, w = m[3] * x + m[7] * y + m[11] * z + m[15];
          const inside = w > 1e-9 && l3peInPoly(poly, bb, (m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w);
          if (inside === !!rm) { keep[i] = 0; cnt--; }
        }
      });
    }
    if (!keep || cnt === n) { ch.pos = o.pos; ch.rgb = o.rgb; ch.inten = o.inten; }
    else {
      const P = new Float32Array(cnt * 3), R = o.rgb ? new Uint8Array(cnt * 3) : undefined, I = o.inten ? new Uint8Array(cnt) : undefined; let d = 0;
      for (let i = 0; i < n; i++) { if (!keep[i]) continue; P[d * 3] = o.pos[i * 3]; P[d * 3 + 1] = o.pos[i * 3 + 1]; P[d * 3 + 2] = o.pos[i * 3 + 2]; if (R) { R[d * 3] = o.rgb[i * 3]; R[d * 3 + 1] = o.rgb[i * 3 + 1]; R[d * 3 + 2] = o.rgb[i * 3 + 2]; } if (I) I[d] = o.inten[i]; d++; }
      ch.pos = P; ch.rgb = R; ch.inten = I;
    }
    ch.cells = null; total += ch.pos.length / 3;
    const p = c.chunkPts[k]; if (p) { const g = p.geometry; g.setAttribute("position", new THREE.BufferAttribute(ch.pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(l3pcColors(c, ch), 3, true)); g.setDrawRange(0, ch.pos.length / 3); g.computeBoundingSphere(); p.userData.n = ch.pos.length / 3; }
  });
  c.nTot = total; l3pcIndexIdle(c); if (typeof l3pcLegend === "function") l3pcLegend(); l3Render();
  return total;
}
function l3pcEdApplyOnLoad(c) { const e = l3peEdits(c.id); if (e.length) { c.edits = e.map(x => ({ ...x })); l3peApply(c); } }
/* En redigering: ring i bildens normaliserade koordinater (−1…1) + kameramatrisen som gällde när den ritades. */
function l3peAddEdit(c, poly, mode) {
  l3.camera.updateMatrixWorld(); const pm = new THREE.Matrix4().multiplyMatrices(l3.camera.projectionMatrix, l3.camera.matrixWorldInverse);
  const before = c.nTot; (c.edits = c.edits || []).push({ pm: pm.elements.slice(), O: l3.O.slice(), dz: c.dz || 0, poly: poly.map(q => [Math.round(q[0] * 1e5) / 1e5, Math.round(q[1] * 1e5) / 1e5]), mode });
  const left = l3peApply(c); l3peSave(c); return { before, left, removed: before - left };
}
function l3peUndo(c) { if (!c.edits || !c.edits.length) return null; c.edits.pop(); const left = l3peApply(c); l3peSave(c); return left; }
function l3peReset(c) { c.edits = []; const left = l3peApply(c); l3peSave(c); return left; }

function l3peNdc(e) { const r = l3.renderer.domElement.getBoundingClientRect(); return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)]; }
function l3peDraw() {
  if (!l3pe.svg) return; const r = l3.renderer.domElement.getBoundingClientRect(), px = q => [(q[0] + 1) / 2 * r.width, (1 - q[1]) / 2 * r.height];
  let pts = l3pe.pend ? l3pe.pend.poly : l3pe.pts.slice(); const live = !l3pe.pend && l3pe.mouse && l3pe.mode === "poly" && pts.length ? pts.concat([l3pe.mouse]) : pts;
  if (l3pe.drag && l3pe.mode === "rect") { const a = l3pe.drag.a, b = l3pe.drag.b; pts = [a, [b[0], a[1]], b, [a[0], b[1]]]; }
  const P = (l3pe.drag && l3pe.mode === "rect" ? pts : live).map(px), d = P.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1)).join(" ");
  const closed = l3pe.pend || (l3pe.drag && l3pe.mode === "rect");
  l3pe.svg.innerHTML = P.length ? `<path d="${d}${closed ? " Z" : ""}" fill="${closed ? "rgba(220,38,38,.14)" : "none"}" stroke="#dc2626" stroke-width="2" stroke-dasharray="${closed ? "0" : "6 4"}"/>` + P.map(q => `<circle cx="${q[0]}" cy="${q[1]}" r="3.5" fill="#fff" stroke="#dc2626" stroke-width="2"/>`).join("") : "";
}
function l3pePanel() {
  const c = l3pe.c; if (!c || !l3pe.panel) return; const has = !!l3pe.pend, n = (c.edits || []).length, B = (id, t, extra = "") => `<button type="button" data-pe="${id}" ${extra}>${t}</button>`;
  l3pe.panel.innerHTML = `<div class="r"><b>✎ ${typeof escHtml === "function" ? escHtml(c.name) : c.name}</b><span class="t" data-pe-n>${c.nTot.toLocaleString("sv-SE")} punkter kvar${n ? ` · ${n} redigering${n > 1 ? "ar" : ""}` : ""}</span></div>
    <div class="r">${B("poly", "Ring", l3pe.mode === "poly" && !l3pe.nav ? 'class="on"' : "")}${B("rect", "Rektangel", l3pe.mode === "rect" && !l3pe.nav ? 'class="on"' : "")}${B("nav", "Flytta vyn", l3pe.nav ? 'class="on"' : "")}<span class="t">${l3pe.nav ? "Rör kameran – tryck Ring/Rektangel för att rita igen" : l3pe.pend ? "Välj vad som ska göras med området" : l3pe.mode === "poly" ? "Tryck ut punkter · dubbelklick/Enter sluter" : "Dra en rektangel"}</span></div>
    <div class="r">${B("in", "Ta bort innanför", (has ? "" : "disabled ") + 'class="bad"')}${B("out", "Ta bort utanför", has ? "" : "disabled")}${B("undo", "Ångra", n ? "" : "disabled")}${B("reset", "Återställ alla", n ? "" : "disabled")}${B("done", "Klar")}</div>`;
}
function l3peClose() { const pend = l3pe.pts.length >= 3 ? l3pe.pts.slice() : null; if (!pend) return; l3.camera.updateMatrixWorld(); l3pe.pend = { poly: pend }; l3pe.pts = []; l3pe.mouse = null; l3peDraw(); l3pePanel(); }
function l3peDo(mode) {
  const c = l3pe.c; if (!c || !l3pe.pend) return; const r = l3peAddEdit(c, l3pe.pend.poly, mode); l3pe.pend = null; l3pe.pts = []; l3peDraw(); l3pePanel();
  l3Status(r.removed ? `${r.removed.toLocaleString("sv-SE")} punkter borttagna – ${r.left.toLocaleString("sv-SE")} kvar. Ångra tar tillbaka dem.` : "Ringen innehöll inga punkter.");
}
/* Anropas först i l3Key (3D-vyns tangenthantering): true = tangenten är tagen. */
function l3peKey(e) {
  if (!l3pe.c) return false; const k = e.key, st = () => { e.preventDefault(); e.stopPropagation(); };
  if (k === "Escape") { st(); if (l3pe.pend || l3pe.pts.length) { l3pe.pend = null; l3pe.pts = []; l3peDraw(); l3pePanel(); } else l3peStop(); return true; }
  if (k === "Enter" && !l3pe.pend) { st(); l3peClose(); return true; }
  if (k === "Delete" && l3pe.pend) { st(); l3peDo("in"); return true; }
  if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "z") { st(); l3peUndo(l3pe.c); l3pe.pend = null; l3peDraw(); l3pePanel(); return true; }
  return false;
}
function l3peStart(id) {
  const c = l3pc.clouds.find(x => x.id === id); if (!c) return; if (l3pe.c) l3peStop();
  const host = document.getElementById("v3Canvas"); if (!host) return;
  if (!document.getElementById("v3PcEdCss")) { const st = document.createElement("style"); st.id = "v3PcEdCss"; st.textContent = L3PE_CSS; document.head.appendChild(st); }
  if (!c.visible) l3pcShow(id, true);
  Object.assign(l3pe, { c, mode: "poly", pts: [], pend: null, nav: false, drag: null, mouse: null });
  const ov = document.createElement("div"); ov.id = "v3PcEdOv"; ov.innerHTML = `<svg></svg>`; host.appendChild(ov); l3pe.ov = ov; l3pe.svg = ov.querySelector("svg");
  const pn = document.createElement("div"); pn.id = "v3PcEdPanel"; host.appendChild(pn); l3pe.panel = pn;
  ["pointerdown", "wheel", "click", "dblclick", "contextmenu"].forEach(t => pn.addEventListener(t, e => e.stopPropagation()));
  ov.addEventListener("pointerdown", e => {
    if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); const q = l3peNdc(e);
    if (l3pe.mode === "rect") { l3pe.pend = null; l3pe.drag = { a: q, b: q }; ov.setPointerCapture(e.pointerId); l3peDraw(); return; }
    if (l3pe.pend) { l3pe.pend = null; l3pe.pts = []; }
    const r = l3.renderer.domElement.getBoundingClientRect(), f = l3pe.pts[0];
    if (f && l3pe.pts.length >= 3 && Math.hypot((q[0] - f[0]) * r.width / 2, (q[1] - f[1]) * r.height / 2) < 10) { l3peClose(); return; }
    l3pe.pts.push(q); l3peDraw(); l3pePanel();
  });
  ov.addEventListener("pointermove", e => { const q = l3peNdc(e); if (l3pe.drag) { l3pe.drag.b = q; l3peDraw(); } else if (l3pe.mode === "poly" && l3pe.pts.length) { l3pe.mouse = q; l3peDraw(); } });
  ov.addEventListener("pointerup", e => { if (!l3pe.drag) return; const a = l3pe.drag.a, b = l3pe.drag.b; l3pe.drag = null; if (Math.abs(a[0] - b[0]) < 0.01 || Math.abs(a[1] - b[1]) < 0.01) { l3peDraw(); return; } l3pe.pend = { poly: [a, [b[0], a[1]], b, [a[0], b[1]]] }; l3peDraw(); l3pePanel(); });
  ov.addEventListener("dblclick", e => { e.preventDefault(); e.stopPropagation(); if (l3pe.mode === "poly" && l3pe.pts.length > 3) { l3pe.pts.pop(); l3peClose(); } });
  ov.addEventListener("wheel", e => { /* zoom går igenom via Flytta vyn */ e.stopPropagation(); }, { passive: true });
  pn.addEventListener("click", e => {
    const b = e.target.closest("[data-pe]"); if (!b || b.disabled) return; const a = b.dataset.pe;
    if (a === "poly" || a === "rect") { l3pe.mode = a; l3pe.nav = false; ov.classList.remove("nav"); l3pe.pend = null; l3pe.pts = []; l3peDraw(); }
    else if (a === "nav") { l3pe.nav = !l3pe.nav; ov.classList.toggle("nav", l3pe.nav); if (l3pe.nav) { l3pe.pend = null; l3pe.pts = []; l3peDraw(); } }
    else if (a === "in" || a === "out") { l3peDo(a); return; }
    else if (a === "undo") { l3peUndo(c); l3pe.pend = null; l3peDraw(); }
    else if (a === "reset") { if (!confirm("Ta tillbaka alla borttagna punkter i molnet?")) return; l3peReset(c); l3pe.pend = null; l3peDraw(); }
    else if (a === "done") { l3peStop(); return; }
    l3pePanel();
  });
  l3pePanel(); l3Status("Redigera punktmoln: rita en ring runt punkterna och välj Ta bort innanför. Ctrl+Z ångrar, Esc avslutar.");
}
function l3peStop() {
  [l3pe.ov, l3pe.panel].forEach(n => n && n.remove()); Object.assign(l3pe, { c: null, ov: null, svg: null, panel: null, pend: null, pts: [], drag: null, kb: null }); if (typeof l3pcLegend === "function") l3pcLegend();
}
