/* Verktygshjul i 3D-editorn (Victor 2026-10-22: "ett sånt hjul som i PDF-hubben där jag kommer åt verktygen snabbt").
   Håll Tab: hjulet dyker upp vid musen – dra åt ett håll och släpp Tab. Eller tryck på ◎ nere till höger och klicka på ett verktyg. Esc stänger.
   Varje val klickar på den vanliga knappen (samma funktion som i verktygsraden). */
const L3WH = [
  ["select", "↖", "Välj", '[data-v3tool="select"]'], ["move", "✥", "Flytta", '[data-v3tool="move"]'], ["rotate", "⟳", "Vrid", '[data-v3tool="rotate"]'], ["align", "⇥", "Rikta", '[data-v3tool="align"]'],
  ["measure", "📏", "Mät", '[data-v3tool="measure"]'], ["multi", "▣", "Flera", "#v3Multi"], ["clip", "✂", "Snitt", "#v3ClipBtn"], ["photo", "📷", "Foto", "#v3PhotoBtn"],
  ["walk", "🚶", "Gå runt", '[data-v3view="walk"]'], ["mont", "🏗", "Montage", '[data-v3view="mont"]'], ["top", "⬒", "Uppifrån", '[data-v3view="top"]'], ["undo", "↶", "Ångra", "#v3Undo"],
];
const l3wh = { el: null, x: 0, y: 0, pick: null, mx: 0, my: 0, click: false };
function l3whOpen3D() { const b = document.getElementById("view3d"); return !!(b && !b.classList.contains("hidden") && typeof l3 !== "undefined" && l3); }
function l3whOpen(x, y, click) {
  l3whClose(); if (!l3whOpen3D()) return; const R = 150, n = L3WH.length, h = document.createElement("div"); h.className = "l3wh"; h.style.left = x + "px"; h.style.top = y + "px";
  h.innerHTML = `<div class="l3wh-ring"></div>${L3WH.map(([k, ic, t], i) => { const a = i / n * 2 * Math.PI; return `<div class="l3wh-it${l3whCur(k) ? " cur" : ""}" data-k="${k}" style="left:${(Math.sin(a) * R).toFixed(1)}px;top:${(-Math.cos(a) * R).toFixed(1)}px"><b>${ic}</b>${t}</div>`; }).join("")}<div class="l3wh-core">${click ? "Välj<br>verktyg" : "Släpp<br>Tab för<br>att välja"}</div>`;
  document.getElementById("view3d").appendChild(h); Object.assign(l3wh, { el: h, x, y, pick: null, click: !!click });
  if (click) h.style.pointerEvents = "auto";
}
function l3whCur(k) { return typeof l3 !== "undefined" && l3 && (l3.tool === k); }
function l3whMove(cx, cy) {
  const w = l3wh; if (!w.el) return; const dx = cx - w.x, dy = cy - w.y, d = Math.hypot(dx, dy); let pick = null;
  if (d > 55) { const a = (Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI); pick = L3WH[Math.round(a / (2 * Math.PI) * L3WH.length) % L3WH.length][0]; }
  if (pick !== w.pick) { w.pick = pick; w.el.querySelectorAll(".l3wh-it").forEach(x => x.classList.toggle("on", x.dataset.k === pick)); }
  w.el.style.setProperty("--dx", Math.max(-40, Math.min(40, dx / 4)) + "px"); w.el.style.setProperty("--dy", Math.max(-40, Math.min(40, dy / 4)) + "px");
}
function l3whClose(apply, key) {
  const w = l3wh; if (!w.el) return; const pick = key || w.pick; w.el.remove(); w.el = null; w.pick = null;
  if (apply && pick) { const it = L3WH.find(x => x[0] === pick), b = it && document.querySelector("#view3d " + it[3]); if (b) b.click(); }
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
  const add = () => { const b = document.getElementById("view3d"); if (!b) return false; if (!document.getElementById("v3WheelBtn")) { const x = document.createElement("button"); x.type = "button"; x.id = "v3WheelBtn"; x.title = "Verktygshjul (håll Tab)"; x.textContent = "◎"; b.appendChild(x); } return true; };
  if (!add()) { const iv = setInterval(() => { if (add()) clearInterval(iv); }, 800); setTimeout(() => clearInterval(iv), 120000); }
})();
