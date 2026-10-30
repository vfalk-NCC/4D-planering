/* Verktygshjul i 3D-editorn (Victor 2026-10-22: "ett sånt hjul som i PDF-hubben där jag kommer åt verktygen snabbt").
   Håll Tab: hjulet dyker upp vid musen – dra åt ett håll och släpp Tab. Esc stänger.
   Varje val klickar på den vanliga knappen (samma funktion som i verktygsraden). */
const L3WH = [
  ["select", "↖", "Välj", '[data-v3tool="select"]'], ["move", "✥", "Flytta", '[data-v3tool="move"]'], ["rotate", "⟳", "Vrid", '[data-v3tool="rotate"]'], ["align", "⇥", "Rikta", '[data-v3tool="align"]'],
  ["measure", "📏", "Mät", '[data-v3tool="measure"]'], ["draw", "✎", "Rita", '[data-v3tool="draw"]'], ["model", "⬡", "Modellera", '[data-v3tool="model"]'], ["multi", "▣", "Flera", "#v3Multi"], ["clip", "✂", "Snitt", "#v3ClipBtn"], ["photo", "📷", "Foto", "#v3PhotoBtn"],
  ["walk", "🚶", "Gå runt", '[data-v3view="walk"]'], ["mont", "🏗", "Montage", '[data-v3view="mont"]'], ["top", "⬒", "Uppifrån", '[data-v3view="top"]'], ["undo", "↶", "Ångra", "#v3Undo"],
];
/* Under Rita och Modellera visar hjulet det verktygets lägen (radialmeny) i stället för verktygen. */
const L3WH_ICON = { line: "╱", rect: "▭", circle: "◯", arc: "◜", polygon: "⬡", poly: "⌇", poly3d: "⌁", free: "✎", pushpull: "⇧", offset: "◫", scale: "⤢", mirror: "⇋", erase: "⌫", paint: "🖌", follow: "↬", intersect: "✕" };
function l3whItems() {
  if (typeof l3dwOn === "function" && l3dwOn() && typeof L3DW_MODES !== "undefined") {
    const t = l3.tool, modes = (L3DW_MODES[t] || []).filter(x => L3DW_IMPL.has(x[0])).map(([k, l]) => ["m:" + k, L3WH_ICON[k] || "•", l, null]);
    return [...modes, [t === "draw" ? "t:model" : "t:draw", t === "draw" ? "⬡" : "✎", t === "draw" ? "Modellera" : "Rita", null], ["t:select", "↖", "Välj", '[data-v3tool="select"]']];
  }
  return L3WH;
}
const l3wh = { el: null, x: 0, y: 0, pick: null, mx: 0, my: 0, click: false };
function l3whOpen3D() { const b = document.getElementById("view3d"); return !!(b && !b.classList.contains("hidden") && typeof l3 !== "undefined" && l3); }
function l3whOpen(x, y, click) {
  l3whClose(); if (!l3whOpen3D()) return; const IT = l3whItems(), R = 150, n = IT.length, h = document.createElement("div"); h.className = "l3wh"; h.style.left = x + "px"; h.style.top = y + "px";
  h.innerHTML = `<div class="l3wh-ring"></div>${IT.map(([k, ic, t], i) => { const a = i / n * 2 * Math.PI; return `<div class="l3wh-it${l3whCur(k) ? " cur" : ""}" data-k="${k}" style="left:${(Math.sin(a) * R).toFixed(1)}px;top:${(-Math.cos(a) * R).toFixed(1)}px"><b>${ic}</b>${t}</div>`; }).join("")}<div class="l3wh-core">${click ? "Välj<br>verktyg" : "Släpp<br>Tab för<br>att välja"}</div>`;
  document.getElementById("view3d").appendChild(h); Object.assign(l3wh, { el: h, x, y, pick: null, click: !!click });
  if (click) h.style.pointerEvents = "auto";
}
function l3whCur(k) { if (typeof l3 === "undefined" || !l3) return false; if (String(k).startsWith("m:")) return typeof l3dwMode === "function" && l3dwMode() === k.slice(2); return l3.tool === k; }
function l3whMove(cx, cy) {
  const w = l3wh; if (!w.el) return; const dx = cx - w.x, dy = cy - w.y, d = Math.hypot(dx, dy); let pick = null;
  if (d > 55) { const a = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI); const IT = l3whItems(); pick = IT[Math.round(a / (2 * Math.PI) * IT.length) % IT.length][0]; }
  if (pick !== w.pick) { w.pick = pick; w.el.querySelectorAll(".l3wh-it").forEach(x => x.classList.toggle("on", x.dataset.k === pick)); }
  w.el.style.setProperty("--dx", Math.max(-40, Math.min(40, dx / 4)) + "px"); w.el.style.setProperty("--dy", Math.max(-40, Math.min(40, dy / 4)) + "px");
}
function l3whClose(apply, key) {
  const w = l3wh; if (!w.el) return; const pick = key || w.pick; w.el.remove(); w.el = null; w.pick = null;
  if (apply && pick) { if (String(pick).startsWith("m:")) { if (typeof l3dwSetMode === "function") l3dwSetMode(pick.slice(2)); return; } if (pick === "t:model" || pick === "t:draw") { l3SetTool(pick.slice(2)); return; } const it = l3whItems().find(x => x[0] === pick) || L3WH.find(x => x[0] === pick), b = it && it[3] && document.querySelector("#view3d " + it[3]); if (b) b.click(); }
}
window.addEventListener("pointermove", e => { l3wh.mx = e.clientX; l3wh.my = e.clientY; if (l3wh.el && !l3wh.click) l3whMove(e.clientX, e.clientY); }, true);
window.addEventListener("keydown", e => {
  if (e.key === "Escape" && l3wh.el) { l3whClose(); e.preventDefault(); e.stopPropagation(); return; }
  if (e.key !== "Tab" || e.ctrlKey || e.altKey || e.metaKey || !l3whOpen3D() || /^(INPUT|SELECT|TEXTAREA)$/.test((e.target || {}).tagName) || (e.target && e.target.isContentEditable)) return;
  e.preventDefault(); e.stopPropagation(); if (!l3wh.el) { const b = document.getElementById("view3d").getBoundingClientRect(); l3whOpen(l3wh.mx || b.left + b.width / 2, l3wh.my || b.top + b.height / 2, false); }
}, true);
window.addEventListener("keyup", e => { if (e.key === "Tab" && l3wh.el && !l3wh.click) { e.preventDefault(); l3whClose(true); } }, true);
window.addEventListener("blur", () => { if (l3wh.el && !l3wh.click) l3whClose(); });
document.addEventListener("click", e => {
  const bt = e.target.closest && e.target.closest("#v3WheelBtn");
  if (bt) { const r = bt.getBoundingClientRect(); l3whOpen(Math.min(innerWidth - 190, Math.max(190, r.left - 120)), Math.min(innerHeight - 190, Math.max(190, r.top - 120)), true); e.stopPropagation(); return; }
  if (l3wh.el && l3wh.click) { const it = e.target.closest && e.target.closest(".l3wh-it"); l3whClose(!!it, it && it.dataset.k); e.stopPropagation(); }
}, true);
(function l3whBtn() {
  const add = () => { const b = document.getElementById("view3d"); if (!b) return false; { const old = document.getElementById("v3WheelBtn"); if (old) old.remove(); } return true; };   // ◎-knappen är borttagen (Victor 2026-10-24: finns på mushjulet) – hjulet nås med Tab
  if (!add()) { const iv = setInterval(() => { if (add()) clearInterval(iv); }, 800); setTimeout(() => clearInterval(iv), 120000); }
})();
