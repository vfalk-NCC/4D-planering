/* Flytt- och vridhandtaget, förfinat (Victor 2026-10-24: "förfina det … mycket snyggare och mer subtilt … en smart dropdown … låsa i ett visst gradantal"):
   handtaget är mindre och tunnare, och bredvid det sitter en liten pill (visar aktuellt läge) som öppnar en rullgardin med
   – läge (flytta/vrid), lås till en axel (X, Y eller höjd) och rymd (värld eller objektets egna axlar),
   – steg för förflyttning och vridning (fast, utan att hålla Skift),
   – riktningslås: rörelsen låses längs en vinkel (0° = öster, 90° = norr) – med en tunn hjälplinje i vyn,
   – exakt förflyttning: skriv ett avstånd och flytta objektet så långt längs den låsta riktningen. */
const l3gz = { open: false, axis: "free", space: "world", dist: 0, ang: 0, lock: null, el: null, guide: null };
const L3GZ_DIST = [0, 0.05, 0.1, 0.25, 0.5, 1], L3GZ_ANG = [0, 1, 5, 15, 45, 90];
const l3gzF = v => v === 0 ? "Fritt" : v < 2 && v !== 1 ? String(v).replace(".", ",") + " m" : v === 1 ? "1 m" : v + "°";

function l3GzLoad() {
  const P = l3Prefs(); l3gz.dist = Number(P.gzDist) || 0; l3gz.ang = Number(P.gzAng) || 0; l3gz.space = P.gzSpace === "local" ? "local" : "world";
}
/* Handtagets utseende och beteende efter inställningarna (anropas när läget, axeln eller rymden ändras). */
function l3GzApply() {
  if (!l3 || !l3.gizmo) return;
  const g = l3.gizmo, rot = g.mode === "rotate", a = l3gz.axis, lock = l3gz.lock != null;
  if (!rot) { g.showX = lock || a === "free" || a === "x"; g.showY = lock || a === "free" || a === "y"; g.showZ = !lock && (a === "free" || a === "z"); }
  g.setSpace(l3gz.space === "local" && !rot && !lock ? "local" : "world");
  l3ApplyStep(); l3GzGuide(); l3GzLabel(); l3Render();
}
/* Stegen gäller alltid (inte bara med Skift hållet). */
function l3GzStep() {
  const held = l3.stepHeld ? Number((document.getElementById("v3Step") || {}).value) || 0.1 : 0;
  const dist = l3gz.dist || held, ang = l3gz.ang ? l3gz.ang * Math.PI / 180 : (held ? ({ 0.1: 5, 0.5: 15, 1: 45 }[held] || 15) * Math.PI / 180 : 0);
  l3.gizmo.setTranslationSnap(dist || null); l3.gizmo.setRotationSnap(ang || null); if (l3.gizmoR) l3.gizmoR.setRotationSnap(ang || null);
}
/* Riktningslåset: rörelsen projiceras på den låsta riktningen (från där draget började). */
function l3GzConstrain() {
  if (l3gz.lock == null || !l3 || l3.gizmo.mode !== "translate") return;
  const g = l3.gizmo.object, s = l3.dragStart; if (!g || !s) return;
  const t = l3gz.lock * Math.PI / 180, ux = Math.cos(t), uy = Math.sin(t), k = (g.position.x - s.x) * ux + (g.position.y - s.y) * uy;
  g.position.x = s.x + k * ux; g.position.y = s.y + k * uy;
}
/* Tunn streckad hjälplinje längs den låsta riktningen eller axeln. */
function l3GzGuide() {
  if (!l3) return;
  if (l3gz.guide) { l3.scene.remove(l3gz.guide); l3gz.guide.geometry.dispose(); l3gz.guide.material.dispose(); l3gz.guide = null; }
  const o = l3.gizmo.object, dir = l3GzDir(); if (!o || !dir || l3.gizmo.mode !== "translate" || (l3gz.axis === "free" && l3gz.lock == null && l3gz.space !== "local")) { return; }
  const len = 80, p0 = new THREE.Vector3(o.position.x - dir[0] * len, o.position.y - dir[1] * len, o.position.z + (dir[2] ? -dir[2] * len : 0.02)), p1 = new THREE.Vector3(o.position.x + dir[0] * len, o.position.y + dir[1] * len, o.position.z + (dir[2] ? dir[2] * len : 0.02));
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p0, p1]), new THREE.LineDashedMaterial({ color: l3gz.lock != null ? 0xf59e0b : 0x6d5efc, dashSize: 0.6, gapSize: 0.5, transparent: true, opacity: 0.55, depthTest: false }));
  line.computeLineDistances(); line.renderOrder = 8; line.userData.noHit = true; line.raycast = () => {}; l3.scene.add(line); l3gz.guide = line;
}
/* Aktiv riktning [x, y, z] för hjälplinje och exakt förflyttning: låst vinkel, vald axel eller objektets egen riktning. */
function l3GzDir() {
  if (l3gz.lock != null) { const t = l3gz.lock * Math.PI / 180; return [Math.cos(t), Math.sin(t), 0]; }
  if (l3gz.axis === "x" || l3gz.axis === "y" || l3gz.axis === "z") {
    const o = l3.gizmo.object, rot = l3gz.space === "local" && o ? o.rotation.z : 0, c = Math.cos(rot), s = Math.sin(rot);
    return l3gz.axis === "x" ? [c, s, 0] : l3gz.axis === "y" ? [-s, c, 0] : [0, 0, 1];
  }
  if (l3gz.space === "local" && l3.gizmo.object) { const r = l3.gizmo.object.rotation.z; return [Math.cos(r), Math.sin(r), 0]; }
  return null;
}
function l3GzLabel() {
  const t = document.getElementById("v3GzT"); if (!t) return; const rot = l3.gizmo.mode === "rotate", bits = [rot ? "Vrid" : "Flytta"];
  if (rot) bits.push(l3gz.ang ? l3gz.ang + "°-steg" : "fritt");
  else if (l3gz.lock != null) bits.push("låst " + Math.round(l3gz.lock * 10) / 10 + "°"); else if (l3gz.axis !== "free") bits.push((l3gz.axis === "z" ? "höjd" : l3gz.axis.toUpperCase()) + "-låst"); else bits.push(l3gz.space === "local" ? "objektets axlar" : "fritt");
  if (!rot && l3gz.dist) bits.push(l3gzF(l3gz.dist));
  t.textContent = bits.join(" · "); const b = document.getElementById("v3GzB"); if (b) b.dataset.mode = rot ? "rot" : "mv";
}
/* Liten avläsning vid markören medan man drar: hur långt/vilken vinkel man är från startläget. */
function l3GzReadout() {
  if (!l3 || !l3.gizmo || !l3.dragStart) return; const o = l3.gizmo.object; if (!o) return;
  const host = l3.renderer.domElement.parentElement; let el = document.getElementById("v3GzRd"); if (!el) { el = document.createElement("div"); el.id = "v3GzRd"; el.className = "v3-gz-rd"; host.appendChild(el); }
  const s = l3.dragStart, f = v => (Math.round(v * 100) / 100).toLocaleString("sv-SE"), sg = v => (v >= 0 ? "+" : "−") + f(Math.abs(v));
  let txt;
  if (l3.gizmo.mode === "rotate") { let d = (o.rotation.z - s.r) * 180 / Math.PI; d = ((d + 540) % 360) - 180; txt = `<b>${sg(Math.round(d * 10) / 10)}°</b><span>${Math.round((((o.rotation.z * 180 / Math.PI) % 360) + 360) % 360)}° totalt</span>`; }
  else { const dx = o.position.x - s.x, dy = o.position.y - s.y, dz = o.position.z - s.z, d = Math.hypot(dx, dy, dz); txt = `<b>${f(d)} m</b><span>X ${sg(dx)} · Y ${sg(dy)}${Math.abs(dz) > 1e-3 ? " · H " + sg(dz) : ""}</span>`; }
  el.innerHTML = txt; const q = o.position.clone().project(l3.camera), r = l3.renderer.domElement;
  el.style.left = Math.min(r.clientWidth - 150, Math.max(8, (q.x + 1) / 2 * r.clientWidth + 40)) + "px"; el.style.top = Math.max(8, (1 - q.y) / 2 * r.clientHeight - 64) + "px"; el.style.display = "block";
}
function l3GzReadoutHide() { const el = document.getElementById("v3GzRd"); if (el) el.style.display = "none"; }

/* ---- Pillen och rullgardinen ---- */
function l3GzDom() {
  if (l3gz.el && l3gz.el.isConnected) return l3gz.el;
  const host = l3.renderer.domElement.parentElement, el = document.createElement("div"); el.className = "v3-gz hidden"; el.id = "v3Gz";
  el.innerHTML = `<button type="button" class="v3-gz-b" id="v3GzB" title="Inställningar för flytt och vridning: lås axel eller vinkel, steg, exakt förflyttning"><svg class="v3-gz-i1" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg><svg class="v3-gz-i2" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></svg><span id="v3GzT">Fri</span><i class="v3-gz-c"></i></button><div class="v3-gz-p hidden" id="v3GzP"></div>`;
  host.appendChild(el); ["pointerdown", "wheel", "contextmenu", "dblclick", "click", "keydown"].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
  el.querySelector("#v3GzB").onclick = () => { l3gz.open = !l3gz.open; l3GzPopHtml(); };
  l3gz.el = el; return el;
}
function l3GzPopHtml() {
  const pop = document.getElementById("v3GzP"); if (!pop) return; pop.classList.toggle("hidden", !l3gz.open); document.getElementById("v3GzB").classList.toggle("on", l3gz.open);
  if (!l3gz.open) return;
  const rot = l3.gizmo.mode === "rotate", seg = (id, items, cur, fmt) => `<div class="v3-gz-seg" data-gz="${id}">${items.map(v => `<button type="button" data-v="${v}" class="${String(cur) === String(v) ? "on" : ""}">${fmt ? fmt(v) : v}</button>`).join("")}</div>`;
  const has = l3gz.lock != null, dirDeg = has ? l3gz.lock : "", dir = l3GzDir();
  pop.innerHTML = `
    <div class="v3-gz-r"><span>Läge</span>${seg("mode", ["translate", "rotate"], l3.gizmo.mode, v => v === "translate" ? "Flytta" : "Vrid")}</div>
    ${rot ? "" : `<div class="v3-gz-r"><span>Lås axel</span>${seg("axis", ["free", "x", "y", "z"], l3gz.axis, v => ({ free: "Fri", x: "X", y: "Y", z: "Höjd" }[v]))}</div>
    <div class="v3-gz-r"><span>Rymd</span>${seg("space", ["world", "local"], l3gz.space, v => v === "world" ? "Värld" : "Objekt")}</div>`}
    <div class="v3-gz-r"><span>${rot ? "Vinkelsteg" : "Steg"}</span>${rot ? seg("ang", L3GZ_ANG, l3gz.ang, v => v ? v + "°" : "Fritt") : seg("dist", L3GZ_DIST, l3gz.dist, v => v ? String(v).replace(".", ",") : "Fritt")}</div>
    ${rot ? "" : `<div class="v3-gz-r v3-gz-dir"><span>Lås riktning</span><div class="v3-gz-in"><input type="number" step="1" id="v3GzDeg" placeholder="av" value="${dirDeg}" /><em>°</em><button type="button" data-gz="d0" title="Öster">0°</button><button type="button" data-gz="d45">45°</button><button type="button" data-gz="d90" title="Norr">90°</button><button type="button" data-gz="dobj" title="Objektets egen riktning">Objekt</button><button type="button" data-gz="doff" title="Ta bort låset">✕</button></div></div>
    <div class="v3-gz-r v3-gz-ex"><span>Flytta exakt</span><div class="v3-gz-in"><button type="button" data-gz="mv-" title="Flytta bakåt">−</button><input type="number" step="0.01" id="v3GzDist" value="1" /><em>m</em><button type="button" data-gz="mv+" title="Flytta framåt">+</button></div></div>
    <div class="v3-gz-h">${dir ? "Rörelsen följer " + (l3gz.lock != null ? "den låsta riktningen" : l3gz.axis !== "free" ? "vald axel" : "objektets axlar") + "." : "Fri rörelse. Håll Skift för att flytta i steg."}</div>`}
    <button type="button" class="v3-gz-reset" data-gz="reset">Återställ</button>`;
  { const cb = document.getElementById("v3GzB").getBoundingClientRect(), host = l3.renderer.domElement.getBoundingClientRect(), room = host.bottom - cb.bottom; if (room < pop.offsetHeight + 40) { pop.style.top = "auto"; pop.style.bottom = "32px"; } else { pop.style.top = "32px"; pop.style.bottom = "auto"; } if (cb.left + 300 > host.right) pop.style.left = (host.right - cb.left - 304) + "px"; else pop.style.left = "0"; }
  pop.querySelectorAll("[data-gz]").forEach(el => {
    const k = el.dataset.gz;
    if (el.classList.contains("v3-gz-seg")) el.querySelectorAll("button").forEach(b => { b.onclick = () => l3GzSet(k, b.dataset.v); });
    else if (el.tagName === "BUTTON") el.onclick = () => l3GzAct(k);
  });
  const deg = pop.querySelector("#v3GzDeg"); if (deg) deg.onchange = () => { const v = deg.value === "" ? null : Number(deg.value); l3GzLock(v); };
}
function l3GzLock(deg) { l3gz.lock = deg == null || !isFinite(deg) ? null : ((Math.round(deg * 10) / 10 % 360) + 360) % 360; if (l3gz.lock != null) l3gz.axis = "free"; l3GzApply(); l3GzPopHtml(); }
function l3GzSet(k, v) {
  if (k === "mode") { l3Mode(v); } else if (k === "axis") { l3gz.axis = v; if (v !== "free") l3gz.lock = null; }
  else if (k === "space") { l3gz.space = v; l3SetPref("gzSpace", v); }
  else if (k === "dist") { l3gz.dist = Number(v) || 0; l3SetPref("gzDist", l3gz.dist || null); }
  else if (k === "ang") { l3gz.ang = Number(v) || 0; l3SetPref("gzAng", l3gz.ang || null); }
  l3GzApply(); l3GzPopHtml();
}
function l3GzAct(k) {
  const o = l3.gizmo.object;
  if (k === "d0") l3GzLock(0); else if (k === "d45") l3GzLock(45); else if (k === "d90") l3GzLock(90); else if (k === "doff") l3GzLock(null);
  else if (k === "dobj") l3GzLock(o ? Math.round(((o.rotation.z * 180 / Math.PI) % 360 + 360) % 360 * 10) / 10 : 0);
  else if (k === "reset") { l3gz.axis = "free"; l3gz.lock = null; l3gz.space = "world"; l3gz.dist = 0; l3gz.ang = 0; ["gzDist", "gzAng", "gzSpace"].forEach(x => l3SetPref(x, null)); l3GzApply(); l3GzPopHtml(); }
  else if (k === "mv+" || k === "mv-") {
    const d = Number(String((document.getElementById("v3GzDist") || {}).value).replace(",", ".")) || 0, dir = l3GzDir() || (o ? [Math.cos(o.rotation.z), Math.sin(o.rotation.z), 0] : [1, 0, 0]), s = k === "mv+" ? 1 : -1;
    if (d) l3NudgeSel(dir[0] * d * s, dir[1] * d * s, dir[2] * d * s, 0);
    l3GzGuide();
  }
}
/* Pillen följer handtaget på skärmen (anropas efter varje bild). */
function l3GzPlace() {
  if (!l3 || !l3.gizmo) return; const el = l3GzDom(), o = l3.gizmo.object;
  if (!l3.gizmo.dragging && !(l3.gizmoR && l3.gizmoR.dragging)) l3GzReadoutHide();
  const show = !!o && !o.userData.bmove && !l3.gizmo.dragging && !(l3.gizmoR && l3.gizmoR.dragging) && !l3.dlgPick && !l3.clipPick && !l3.vPick;
  el.classList.toggle("hidden", !show); if (!show) { if (l3gz.guide) l3gz.guide.visible = !!o && !l3.gizmo.dragging; return; }
  const q = o.position.clone().project(l3.camera), r = l3.renderer.domElement; if (q.z > 1) { el.classList.add("hidden"); return; }
  const x = Math.min(r.clientWidth - 150, Math.max(8, (q.x + 1) / 2 * r.clientWidth + 62)), y = Math.min(r.clientHeight - 40, Math.max(8, (1 - q.y) / 2 * r.clientHeight - 74));
  el.style.left = x + "px"; el.style.top = y + "px"; if (l3gz.guide) { l3gz.guide.visible = true; }
  l3GzLabel();
}

/* Kopplingar in i editorn: steg, läge, urval och rendering. */
(function () {
  if (typeof l3ApplyStep === "function") { l3ApplyStep = function () { if (!l3) return; l3GzStep(); }; }
  if (typeof l3FromGizmo === "function") { const f = l3FromGizmo; l3FromGizmo = function () { l3GzConstrain(); try { l3GzReadout(); } catch (e) { /* bara visning */ } return f(); }; }
  if (typeof l3Mode === "function") { const f = l3Mode; l3Mode = function (m) { f(m); l3GzApply(); }; }
  if (typeof l3Render === "function") { const f = l3Render; l3Render = function () { f.apply(this, arguments); try { l3GzPlace(); } catch (e) { /* bara visning */ } }; }
  if (typeof l3RefreshSel === "function") { const f = l3RefreshSel; l3RefreshSel = function () { const r = f.apply(this, arguments); if (l3 && l3.gizmo && !l3.gizmo.object && l3gz.open) { l3gz.open = false; l3GzPopHtml(); } l3GzGuide(); l3GzLoad(); l3GzApply(); return r; }; }
})();
