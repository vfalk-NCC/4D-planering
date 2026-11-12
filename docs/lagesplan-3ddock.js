/* Docka högermenyer och ändra storlek (Victor 2026-11-12: "alla högermenyer ska kunna dockas så att bilden hamnar mellan vänstermenyn och högermenyn, som i Tekla" + "gå att ändra storlek på fönstret").
   – Knappen "Docka" i övre raden flyttar alla högerpaneler (objektets egenskaper, info och verktygspaneler som Byggväg och Stödmur) till en kolumn till höger om bilden.
     Bilden krymper då så att inget döljs bakom menyerna. Kolumnens bredd ändras genom att dra i dess vänstra kant. Valet sparas.
   – Flytande paneler (när de inte är dockade) får ett grepp på vänsterkanten (bredd) och på underkanten (höjd). Storleken sparas per panel.
   Prefix l3dk. */
const l3dk = { ready: false, body: null, dock: null, grips: new Map(), on: false };
const L3DK_SEL = "#v3Side, #v3Info, .v3-vp";
const l3dkPanKey = el => el.id || ("." + ([...el.classList].find(c => /^v3-vp/.test(c)) || "panel"));
function l3dkInit() {
  const main = document.querySelector("#view3d .v3-main"), cv = document.getElementById("v3Canvas"); if (l3dk.ready || !main || !cv) return; l3dk.ready = true;
  const dock = document.createElement("div"); dock.id = "v3Dock"; dock.className = "v3-dock hidden"; dock.innerHTML = '<div class="v3-dock-grip" title="Dra för att ändra bredd"></div><div class="v3-dock-body"></div>'; main.appendChild(dock); l3dk.dock = dock; l3dk.body = dock.querySelector(".v3-dock-body");
  const P = l3Prefs(); dock.style.setProperty("--dockw", Math.max(260, Math.min(900, Number(P.dockW) || 380)) + "px"); l3dk.on = P.dockR === true;
  const g = dock.querySelector(".v3-dock-grip"); g.onpointerdown = e => { e.preventDefault(); g.setPointerCapture(e.pointerId); const x0 = e.clientX, w0 = dock.getBoundingClientRect().width, mx = Math.min(900, main.getBoundingClientRect().width * 0.7);
    const mv = ev => { dock.style.setProperty("--dockw", Math.max(260, Math.min(mx, w0 + (x0 - ev.clientX))) + "px"); g.classList.add("drag"); l3dkResize(); }, up = () => { g.classList.remove("drag"); g.removeEventListener("pointermove", mv); g.removeEventListener("pointerup", up); l3SetPref("dockW", Math.round(dock.getBoundingClientRect().width)); l3dkResize(); };
    g.addEventListener("pointermove", mv); g.addEventListener("pointerup", up); };
  const mo = new MutationObserver(() => l3dkSchedule()); mo.observe(cv, { childList: true }); mo.observe(l3dk.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
  // (ingen ResizeObserver: fönsterstorlek hanteras av editorn, dockningen anropar l3dkResize själv)
  const btn = document.getElementById("v3DockBtn"); if (btn) btn.onclick = () => l3dkToggle();
  setInterval(l3dkGrips, 300); l3dkPlace();
  document.addEventListener("pointermove", e => { if (!l3dk.grips.size) return; l3dk.grips.forEach(G => { if (!G.el || !G.el.isConnected) return; const r = G.el.getBoundingClientRect(), inY = e.clientY >= r.top && e.clientY <= r.bottom, nearL = inY && Math.abs(e.clientX - r.left) <= 8, nearB = e.clientX >= r.left && e.clientX <= r.right && Math.abs(e.clientY - r.bottom) <= 8;
    const hw = G.w.setPointerCapture && G.w.dataset.drag === "1" ? true : nearL, hh = G.h.dataset.drag === "1" ? true : nearB; G.w.dataset.hot = hw ? "1" : "0"; G.h.dataset.hot = hh ? "1" : "0"; G.w.style.pointerEvents = hw ? "auto" : "none"; G.h.style.pointerEvents = hh ? "auto" : "none"; }); }, true);
}
let l3dkRaf = 0; const l3dkSchedule = () => { if (!l3dkRaf) l3dkRaf = requestAnimationFrame(() => { l3dkRaf = 0; l3dkPlace(); }); };
let l3dkRz = 0; function l3dkResize() { cancelAnimationFrame(l3dkRz); l3dkRz = requestAnimationFrame(() => { if (typeof l3Resize === "function" && typeof l3 !== "undefined" && l3 && l3.renderer) { l3Resize(); if (typeof l3Render === "function") l3Render(); } }); }
function l3dkToggle(v) { l3dk.on = v === undefined ? !l3dk.on : !!v; l3SetPref("dockR", l3dk.on); l3dkPlace(); const b = document.getElementById("v3DockBtn"); if (b) b.classList.toggle("on", l3dk.on); }
function l3dkPlace() {
  if (!l3dk.ready) return; const cv = document.getElementById("v3Canvas"), narrow = window.innerWidth < 700, on = l3dk.on && !narrow;
  if (on) { [...cv.children].forEach(el => { if (el.matches(L3DK_SEL)) { el.classList.add("v3-docked"); l3dk.body.appendChild(el); } }); }
  else [...l3dk.body.children].forEach(el => { el.classList.remove("v3-docked"); cv.appendChild(el); });
  const vis = on && [...l3dk.body.children].some(e => !e.classList.contains("hidden") && e.style.display !== "none"); const was = !l3dk.dock.classList.contains("hidden");
  l3dk.dock.classList.toggle("hidden", !vis); const b = document.getElementById("v3DockBtn"); if (b) b.classList.toggle("on", l3dk.on);
  if (was !== vis) l3dkResize();
}
/* Grepp för storlek på flytande paneler */
function l3dkGrips() {
  if (!l3dk.ready) return; const cv = document.getElementById("v3Canvas"); if (!cv) return; const cr = cv.getBoundingClientRect(), seen = new Set(), sizes = (l3Prefs().panSize || {});
  [...cv.children].forEach(el => {
    if (!el.matches(L3DK_SEL) || el.classList.contains("hidden") || el.classList.contains("v3-docked")) return; const r = el.getBoundingClientRect(); if (r.width < 60 || r.height < 40) return; const key = l3dkPanKey(el); seen.add(key);
    if (!el.dataset.dkApplied) { el.dataset.dkApplied = "1"; const sz = sizes[key]; if (sz) { if (sz.w) el.style.width = sz.w + "px"; if (sz.h) el.style.maxHeight = sz.h + "px"; } }
    let G = l3dk.grips.get(key); if (!G) { G = { w: document.createElement("div"), h: document.createElement("div") }; G.w.className = "v3-dk-gw"; G.h.className = "v3-dk-gh"; G.w.title = "Dra för att ändra bredd"; G.h.title = "Dra för att ändra höjd"; cv.appendChild(G.w); cv.appendChild(G.h); l3dk.grips.set(key, G);
      const drag = (g, axis) => { g.onpointerdown = e => { const t = l3dk.grips.get(key).el; if (!t) return; e.preventDefault(); e.stopPropagation(); g.setPointerCapture(e.pointerId); g.dataset.drag = "1"; const x0 = e.clientX, y0 = e.clientY, b0 = t.getBoundingClientRect(), maxW = cv.getBoundingClientRect().width - 24, maxH = cv.getBoundingClientRect().height - 24;
        const mv = ev => { if (axis === "w") t.style.width = Math.max(260, Math.min(maxW, b0.width + (x0 - ev.clientX))) + "px"; else t.style.maxHeight = Math.max(160, Math.min(maxH, b0.height + (ev.clientY - y0))) + "px"; };
        const up = () => { g.dataset.drag = "0"; g.removeEventListener("pointermove", mv); g.removeEventListener("pointerup", up); const s = { ...(l3Prefs().panSize || {}) }, b = t.getBoundingClientRect(); s[key] = { ...(s[key] || {}), [axis]: Math.round(axis === "w" ? b.width : b.height) }; l3SetPref("panSize", s); };
        g.addEventListener("pointermove", mv); g.addEventListener("pointerup", up); }; }; drag(G.w, "w"); drag(G.h, "h"); }
    G.el = el; const pe = G.w.dataset.hot === "1" ? "auto" : "none", pe2 = G.h.dataset.hot === "1" ? "auto" : "none";   // greppen tar bara emot mus när pekaren är vid panelens kant – de ligger annars inte i vägen för bilden
    G.w.style.cssText = `left:${r.left - cr.left - 4}px;top:${r.top - cr.top + 14}px;height:${Math.max(10, r.height - 28)}px;display:block;pointer-events:${pe}`; G.h.style.cssText = `left:${r.left - cr.left + 24}px;top:${r.bottom - cr.top - 4}px;width:${Math.max(10, r.width - 48)}px;display:block;pointer-events:${pe2}`;
  });
  l3dk.grips.forEach((G, key) => { if (!seen.has(key) || !G.el || !G.el.isConnected) { G.w.style.display = "none"; G.h.style.display = "none"; if (G.el && !G.el.isConnected) { G.w.remove(); G.h.remove(); l3dk.grips.delete(key); } } });
}
(() => { const t = setInterval(() => { if (document.getElementById("v3Canvas") && document.querySelector("#view3d .v3-main")) { clearInterval(t); l3dkInit(); } }, 400); setTimeout(() => clearInterval(t), 180000); })();
