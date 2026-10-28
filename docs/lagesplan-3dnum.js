/* Skriv in exakt värde för flytt och vridning (Victor 2026-10-28: "när jag vrider eller flyttar objekt med verktyget … skriva in rotation,
   t.ex. 32,3 och sedan Enter … eller om jag flyttar i en axel skriva in 6,43 och trycka Enter").

   – Tryck på vridringen eller en flyttpil (utan att dra), eller börja skriva en siffra medan musen är över handtaget: en liten ruta
     öppnas vid objektet. Skriv värdet (komma eller punkt) och tryck Enter.
   – Vridning: grader runt lodaxeln (plus = moturs, som handtaget). Flytt längs X/Y/Höjd: meter längs axeln (Objekt-rymden följer objektets
     riktning). I planet (XY): skriv "x;y". Gäller alla markerade objekt. Esc eller klick utanför stänger.
   – Ctrl+Z ångrar som vanligt (samma steg som piltangenternas förflyttning). */

const l3num = { el: null, target: null, down: null };
function l3numTarget() {
  if (!l3 || !l3.gizmo || !l3.gizmo.object || l3.gizmo.object.userData.bmove || (l3.tool || "select") !== "select") return null;
  const g = l3.gizmo, r = l3.gizmoR;
  if (r && r.object && r.axis) return { kind: "rot" };
  if (!g.axis) return null;
  if (g.mode === "rotate") return { kind: "rot" };
  const a = String(g.axis);
  if (a === "X" || a === "Y" || a === "Z") return { kind: "mv", axis: a };
  if (a === "XY" || a === "XYZ") return { kind: "mv", axis: "XY" };
  return null;
}
function l3numDir(axis) {
  const o = l3.gizmo.object, r = l3gz.space === "local" && o ? o.rotation.z : 0, c = Math.cos(r), s = Math.sin(r);
  return axis === "X" ? [c, s, 0] : axis === "Y" ? [-s, c, 0] : [0, 0, 1];
}
const l3numParse = t => { const n = Number(String(t).trim().replace(",", ".").replace(/[−–]/g, "-")); return Number.isFinite(n) ? n : null; };
function l3numClose() { if (l3num.el) { l3num.el.remove(); l3num.el = null; } l3num.target = null; }
function l3numApply(txt) {
  const t = l3num.target; if (!t) return false;
  if (t.kind === "rot") {
    const d = l3numParse(txt); if (d == null) return false;
    l3NudgeSel(0, 0, 0, d); l3Status(`Vred ${String(d).replace(".", ",")}°.`); return true;
  }
  if (t.axis === "XY") {
    const [a, b] = String(txt).split(/[;:]/).map(l3numParse); if (a == null) return false;
    l3NudgeSel(a, b == null ? 0 : b, 0, 0); l3Status(`Flyttade ${String(a).replace(".", ",")} ; ${String(b == null ? 0 : b).replace(".", ",")} m i planet (X ; Y).`); return true;
  }
  const d = l3numParse(txt); if (d == null) return false;
  const u = l3numDir(t.axis); l3NudgeSel(u[0] * d, u[1] * d, u[2] * d, 0);
  l3Status(`Flyttade ${String(d).replace(".", ",")} m ${t.axis === "Z" ? "i höjd" : "längs " + t.axis}.`); return true;
}
function l3numOpen(target, first) {
  l3numClose();
  const host = document.getElementById("v3Canvas"), o = l3.gizmo.object; if (!host || !o) return;
  l3num.target = target;
  const lab = target.kind === "rot" ? "Vrid" : target.axis === "XY" ? "Flytta i planet (X ; Y)" : target.axis === "Z" ? "Flytta i höjd" : "Flytta längs " + target.axis;
  const unit = target.kind === "rot" ? "°" : "m", ph = target.axis === "XY" ? "x ; y" : target.kind === "rot" ? "32,3" : "6,43";
  const el = document.createElement("div"); el.id = "v3Num"; el.className = "v3-num";
  el.innerHTML = `<span>${lab}</span><input type="text" inputmode="decimal" autocomplete="off" placeholder="${ph}" /><em>${unit}</em><small>Enter</small>`;
  host.appendChild(el); l3num.el = el;
  const q = o.position.clone().project(l3.camera), r = l3.renderer.domElement;
  el.style.left = Math.min(r.clientWidth - 260, Math.max(8, (q.x + 1) / 2 * r.clientWidth + 28)) + "px"; el.style.top = Math.max(8, (1 - q.y) / 2 * r.clientHeight - 70) + "px";
  ["pointerdown", "wheel", "contextmenu", "dblclick", "click"].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
  const inp = el.querySelector("input"); if (first) inp.value = first;
  inp.addEventListener("keydown", e => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); l3numClose(); }
    else if (e.key === "Enter") { e.preventDefault(); if (l3numApply(inp.value)) l3numClose(); else { inp.classList.add("bad"); setTimeout(() => inp.classList.remove("bad"), 500); } }
  });
  inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
}
(function () {
  // Tryck på ett handtag utan att dra -> rutan öppnas. Handtaget under markören läses innan dragläget startar.
  window.addEventListener("pointerdown", e => {
    if (!l3 || !l3.renderer || e.target !== l3.renderer.domElement) { if (l3num.el && !l3num.el.contains(e.target)) l3numClose(); return; }
    l3num.down = { x: e.clientX, y: e.clientY, t: l3numTarget() };
    if (l3num.el) l3numClose();
  }, true);
  window.addEventListener("pointerup", e => {
    const d = l3num.down; l3num.down = null;
    if (!d || !d.t || !l3 || e.target !== l3.renderer.domElement || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || e.button) return;
    setTimeout(() => { if (l3.gizmo.object) l3numOpen(d.t); }, 30);   // efter handtagets egen släpp-hantering
  }, true);
  // Börja skriva en siffra medan musen är över handtaget.
  window.addEventListener("keydown", e => {
    if (!l3 || l3num.el || e.ctrlKey || e.metaKey || e.altKey || !/^[0-9+\-,.]$/.test(e.key)) return;
    const a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || (a && a.isContentEditable)) return;
    const box = document.getElementById("view3d"); if (!box || box.classList.contains("hidden")) return;
    const t = l3numTarget(); if (!t || l3.gizmo.dragging || (l3.gizmoR && l3.gizmoR.dragging)) return;
    e.preventDefault(); e.stopPropagation(); l3numOpen(t, e.key);
  }, true);
})();
