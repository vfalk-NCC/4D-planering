/* Flytthandtaget (pilarna) på en vald punkt i ställning/staket (Victor 2026-11-24: "när jag markerar en punkt ska flyttverktyget komma fram").
   Tryck på en punkt (utan att dra) → pilarna visas på punkten. Dra i pilarna: rakt ner/upp (Z), längs X/Y eller – med "Objektets axlar" – längs sträckan.
   Axel- och steglåset i flyttinställningen gäller. Att dra i själva punkten fungerar som förut. */
const l3pg = { G: null, id: null, i: -1, raf: 0 };
function l3pgPlace() { return l3pg.id ? placements.find(x => x.id === l3pg.id) : null; }
function l3pgClear() {
  l3pg.id = null; l3pg.i = -1;
  if (l3pg.G && l3.gizmo && l3.gizmo.object === l3pg.G) l3.gizmo.detach();
}
function l3pgSelect(p, i) {
  const h = l3HandleDefs(p).find(d => d.key === "pt" && d.i === i); if (!h) return;
  if (!l3pg.G) { l3pg.G = new THREE.Object3D(); l3pg.G.userData.bmove = true; l3pg.G.userData.ptgz = true; l3.scene.add(l3pg.G); }
  l3pg.id = p.id; l3pg.i = i;
  const A = p.pts[i], B = p.pts[i + 1] || p.pts[i - 1], sg = p.pts[i + 1] ? 1 : -1;
  l3pg.G.position.copy(h.pos); l3pg.G.rotation.set(0, 0, B ? Math.atan2((B[1] - A[1]) * sg, (B[0] - A[0]) * sg) : 0); l3pg.G.updateMatrixWorld(true);
  if (l3.gizmo.object !== l3pg.G) l3.gizmo.attach(l3pg.G);
  l3.gizmo.setMode("translate"); if (typeof l3GzApply === "function") l3GzApply();
  l3Status(`Punkt ${i + 1}: dra i pilarna – Z drar rakt ner eller upp. Tryck bredvid för att avmarkera.`);
  l3Render();
}
function l3pgChange() {
  const p = l3pgPlace(); if (!p || !p.pts || !p.pts[l3pg.i]) return;
  const G = l3pg.G, O = l3.O, dz = Number(p.dz) || 0, i = l3pg.i;
  p.pts[i] = [placeR3(G.position.x + O[0]), placeR3(G.position.y + O[1]), placeR3(G.position.z + O[2] - dz)];
  if (i === 0) { p.x = p.pts[0][0]; p.y = p.pts[0][1]; p.z = p.pts[0][2]; }
  if (l3pg.raf) return;
  l3pg.raf = requestAnimationFrame(() => { l3pg.raf = 0; const q = l3pgPlace(); if (q) { l3RebuildOne(q); if (typeof l3HandlesBuild === "function") l3HandlesBuild(); } l3Render(); });
}
function l3pgEnd() {
  const p = l3pgPlace(); if (!p) return;
  if (l3pg.raf) { cancelAnimationFrame(l3pg.raf); l3pg.raf = 0; }
  placeTouch(p); l3RebuildOne(p); if (typeof l3HandlesBuild === "function") l3HandlesBuild(); l3Changed(); if (typeof l3RenderSide === "function") l3RenderSide(); l3Render();
}
(function () {
  const wrap = (name, fn) => { const f0 = window[name]; if (typeof f0 !== "function" || f0._pg) return false; const f1 = function () { return fn(f0, this, arguments); }; f1._pg = true; window[name] = f1; return true; };
  const bind = () => {
    if (typeof l3 === "undefined" || !l3 || !l3.gizmo || typeof l3bmGizmoChange !== "function" || typeof l3RefreshSel !== "function" || typeof l3HandleUp !== "function") return setTimeout(bind, 400);
    if (l3pg.bound) return; l3pg.bound = true;
    // Gizmots ändringar för punkten (bmove-flaggan hindrar den vanliga objekt-flytten).
    wrap("l3bmGizmoChange", (f, t, a) => (l3pg.G && l3.gizmo.object === l3pg.G ? l3pgChange() : f.apply(t, a)));
    l3.gizmo.addEventListener("mouseDown", () => { if (l3pg.G && l3.gizmo.object === l3pg.G && typeof placeSnapshot === "function") placeSnapshot(); });
    l3.gizmo.addEventListener("mouseUp", () => { if (l3pg.G && l3.gizmo.object === l3pg.G) l3pgEnd(); });
    // Ett tryck på en punkt (utan drag) markerar den.
    wrap("l3HandleUp", (f, t, a) => { const H = typeof l3H !== "undefined" ? l3H : null, wasMoved = H && H.moved, r = f.apply(t, a); if (H && !a[0] && !wasMoved && H.h && H.h.key === "pt") l3pgSelect(H.p, H.h.i); return r; });
    // Markeringen byts/avmarkeras → pilarna försvinner; annars behålls de (gizmot får inte stjäla tillbaka objektet).
    wrap("l3RefreshSel", (f, t, a) => { const r = f.apply(t, a); try { const p = l3pgPlace(); if (!p || !l3.sel.has(p.id) || l3.sel.size !== 1 || (l3.tool || "select") !== "select") l3pgClear(); else if (l3pg.G && l3.gizmo.object !== l3pg.G && !l3.gizmo.dragging) l3.gizmo.attach(l3pg.G); } catch (e) { console.warn(e); } return r; });
    window.addEventListener("keydown", e => { if (e.key === "Escape" && l3pg.id) l3pgClear(); }, true);
  };
  bind();
})();
