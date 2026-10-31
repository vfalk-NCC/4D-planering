/* Ritningspanel: 2D-ritningen bredvid 3D-vyn, synkad åt båda håll (Victor 2026-10-31: "2D-ritningar synkade med 3D").
   • Kameran syns på ritningen som en punkt med synfält som vrider sig när du flyger i 3D.
   • Markören i 3D (musen över ytor/modell) följer med som ett kors på ritningen, och markerade etableringsobjekt syns.
   • Tryck på ritningen: en nål sätts ut i 3D (stolpe + ring) och kameran flyger dit med samma vinkel.
   • Valfri kalibrerad ritning (arbetsytorna) – zooma med hjulet, dra för att panorera. Följ kameran håller den i mitten.
   Ritningen läggs på modellens XY via ritningens kalibrering, precis som lagret i 3D (calibAffine). */
const l3sp = { open: false, planId: null, img: null, vp: null, aff: null, view: { k: 1, tx: 0, ty: 0 }, pin: null, hover: null, follow: true, size: 1, el: null, cv: null, raf: 0, key: "", pinObj: null, drag: null, busy: false, hoverT: 0 };
const L3SP_CSS = `#v3SpBtn{font-size:17px}#v3SpBtn.on{background:#2563eb!important;color:#fff!important}
#v3Sp{position:absolute;right:64px;bottom:12px;z-index:22;display:flex;flex-direction:column;background:var(--v3-panel,#fff);border:1px solid rgba(0,0,0,.14);border-radius:14px;box-shadow:0 10px 32px rgba(0,0,0,.24);overflow:hidden;font:12px system-ui,sans-serif;color:inherit}
#v3Sp .h{display:flex;gap:6px;align-items:center;padding:6px 8px;border-bottom:1px solid rgba(0,0,0,.08);flex-wrap:wrap}#v3Sp select{max-width:190px;padding:3px 6px;border:1px solid rgba(0,0,0,.18);border-radius:7px;font:inherit}
#v3Sp button{border:1px solid rgba(0,0,0,.15);background:#fff;border-radius:8px;padding:3px 8px;font:inherit;cursor:pointer}#v3Sp button.on{background:#2563eb;color:#fff;border-color:#2563eb}#v3Sp canvas{flex:1;width:100%;min-height:0;display:block;background:#e5e7eb;touch-action:none;cursor:crosshair}#v3Sp .f{padding:4px 8px;opacity:.7}`;
const l3spPlans = () => (typeof plans !== "undefined" ? plans : []).filter(p => p && (p.id === (plan && plan.id) ? plan.calib : p.calib));
const l3spCalib = p => (plan && p.id === plan.id ? plan.calib : p.calib);
const l3spAff = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function l3spSync() {
  const host = document.getElementById("v3Canvas"); if (!host || document.getElementById("v3SpBtn")) return;
  if (!document.getElementById("v3SpCss")) { const st = document.createElement("style"); st.id = "v3SpCss"; st.textContent = L3SP_CSS; document.head.appendChild(st); }
  const b = document.createElement("button"); b.id = "v3SpBtn"; b.type = "button"; b.className = "v3-qv-b"; b.title = "Ritningspanel: 2D-ritningen bredvid 3D, synkade åt båda håll"; b.textContent = "▦"; const qv = host.querySelector(".v3-qv"); if (qv) qv.insertBefore(b, qv.firstChild); else { b.style.cssText = "position:absolute;right:12px;bottom:60px;z-index:21"; host.appendChild(b); }
  ["pointerdown", "click", "dblclick", "wheel"].forEach(t => b.addEventListener(t, e => e.stopPropagation())); b.onclick = () => l3spToggle();
}
function l3spToggle(on) { const want = on == null ? !l3sp.open : on; if (want) l3spOpen(); else l3spClose(); const b = document.getElementById("v3SpBtn"); if (b) b.classList.toggle("on", l3sp.open); }
async function l3spOpen() {
  const host = document.getElementById("v3Canvas"); if (!host) return; l3spSync();
  const list = l3spPlans(); if (!list.length) { l3Status("Ritningspanelen behöver en kalibrerad ritning (Zoner → Kalibrera mot 3D).", true); return; }
  if (!l3sp.planId || !list.some(p => p.id === l3sp.planId)) l3sp.planId = (plan && list.some(p => p.id === plan.id)) ? plan.id : list[0].id;
  l3sp.open = true; let el = document.getElementById("v3Sp"); if (el) el.remove();
  el = document.createElement("div"); el.id = "v3Sp"; host.appendChild(el); l3sp.el = el; l3spSize();
  ["pointerdown", "wheel", "dblclick", "contextmenu", "keydown"].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
  el.innerHTML = `<div class="h"><select id="spPlan">${list.map(p => `<option value="${p.id}" ${p.id === l3sp.planId ? "selected" : ""}>${typeof escHtml === "function" ? escHtml(p.name || "Ritning") : p.name}</option>`).join("")}</select><button type="button" id="spFollow" class="${l3sp.follow ? "on" : ""}" title="Håll kameran i mitten av ritningen">Följ</button><button type="button" id="spFit" title="Hela ritningen">Hela</button><button type="button" id="spSize" title="Panelens storlek">⤢</button><button type="button" id="spPin" title="Ta bort nålen i 3D">Nål ✕</button><span style="flex:1"></span><button type="button" id="spX">✕</button></div><canvas id="spCv"></canvas><div class="f" id="spF">Tryck på ritningen för att flyga dit i 3D. Hjul zoomar, dra panorerar.</div>`;
  l3sp.cv = el.querySelector("#spCv");
  el.querySelector("#spPlan").onchange = e => { l3sp.planId = e.target.value; l3spLoad(); }; el.querySelector("#spFollow").onclick = e => { l3sp.follow = !l3sp.follow; e.target.classList.toggle("on", l3sp.follow); l3sp.key = ""; };
  el.querySelector("#spFit").onclick = () => { l3spFit(); l3sp.key = ""; }; el.querySelector("#spSize").onclick = () => { l3sp.size = (l3sp.size % 3) + 1; l3spSize(); l3spFit(); l3sp.key = ""; };
  el.querySelector("#spPin").onclick = () => l3spPinClear(); el.querySelector("#spX").onclick = () => l3spToggle(false);
  l3spBind(); window.addEventListener("pointermove", l3spHover, true); await l3spLoad(); l3spLoop();
}
function l3spClose() { l3sp.open = false; cancelAnimationFrame(l3sp.raf); window.removeEventListener("pointermove", l3spHover, true); const e = document.getElementById("v3Sp"); if (e) e.remove(); l3sp.el = l3sp.cv = null; l3spPinClear(); }
function l3spSize() { if (!l3sp.el) return; const s = [[34, 46], [46, 62], [62, 82]][l3sp.size - 1] || [46, 62]; l3sp.el.style.width = `min(${s[0]}%, calc(100% - 24px))`; l3sp.el.style.height = `${s[1]}%`; }
async function l3spLoad() {
  const p = l3spPlans().find(x => x.id === l3sp.planId); if (!p || l3sp.busy) return; l3sp.busy = true; const f = document.getElementById("spF"); if (f) f.textContent = "Hämtar ritningen…";
  try {
    const pg = plan && p.id === plan.id ? page : await pdfOverlayPage(p); if (!pg) throw new Error("Ritningen kunde inte läsas.");
    const v1 = pg.getViewport({ scale: 1 }), s = Math.min((typeof lowMemDevice !== "undefined" && lowMemDevice ? 1500 : 2800) / Math.max(v1.width, v1.height), 4), vp = pg.getViewport({ scale: s });
    const cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height); const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    l3sp.img = cv; l3sp.vp = vp; l3sp.aff = calibAffine(l3spCalib(p)); l3spFit(); l3sp.key = ""; if (f) f.textContent = "Tryck på ritningen för att flyga dit i 3D. Hjul zoomar, dra panorerar.";
  } catch (e) { if (f) f.textContent = "Kunde inte visa ritningen: " + (e && e.message || e); } finally { l3sp.busy = false; }
}
function l3spFit() { const cv = l3sp.cv, im = l3sp.img; if (!cv || !im) return; const r = cv.getBoundingClientRect(), k = Math.min(r.width / im.width, r.height / im.height) || 1; l3sp.view = { k, tx: (r.width - im.width * k) / 2, ty: (r.height - im.height * k) / 2 }; }
/* Modell (m) ↔ bildpunkt i den renderade ritningen ↔ skärmpunkt i panelen. */
function l3spToImg(x, y) { const [px, py] = l3spAff(l3sp.aff, x, y), q = l3sp.vp.convertToViewportPoint(px, py); return q; }
function l3spFromImg(ix, iy) { const [px, py] = l3sp.vp.convertToPdfPoint(ix, iy), m = affInv(l3sp.aff); return l3spAff(m, px, py); }
const l3spToScr = (x, y) => { const q = l3spToImg(x, y), v = l3sp.view; return [v.tx + q[0] * v.k, v.ty + q[1] * v.k]; };
const l3spFromScr = (sx, sy) => { const v = l3sp.view; return l3spFromImg((sx - v.tx) / v.k, (sy - v.ty) / v.k); };
function l3spBind() {
  const cv = l3sp.cv; let moved = 0;
  cv.addEventListener("wheel", e => { e.preventDefault(); e.stopPropagation(); const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, v = l3sp.view, f = Math.exp(-e.deltaY * 0.0015), nk = Math.min(60, Math.max(0.02, v.k * f)); v.tx = x - (x - v.tx) * nk / v.k; v.ty = y - (y - v.ty) * nk / v.k; v.k = nk; l3sp.key = ""; }, { passive: false });
  cv.addEventListener("pointerdown", e => { e.stopPropagation(); cv.setPointerCapture(e.pointerId); l3sp.drag = { x: e.clientX, y: e.clientY, tx: l3sp.view.tx, ty: l3sp.view.ty }; moved = 0; });
  cv.addEventListener("pointermove", e => { const d = l3sp.drag; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; moved = Math.max(moved, Math.hypot(dx, dy)); if (moved > 4) { l3sp.view.tx = d.tx + dx; l3sp.view.ty = d.ty + dy; l3sp.key = ""; } });
  cv.addEventListener("pointerup", e => { const d = l3sp.drag; l3sp.drag = null; if (!d || moved > 4) return; const r = cv.getBoundingClientRect(), [x, y] = l3spFromScr(e.clientX - r.left, e.clientY - r.top); l3spGoTo(x, y); });
}
/* Markhöjden under (x,y): rakt nedifrån ovan mot ytorna, annars ritningens nivå. */
function l3spGround(x, y) {
  const O = l3.O, rc = new THREE.Raycaster(new THREE.Vector3(x - O[0], y - O[1], 5000), new THREE.Vector3(0, 0, -1)); let z = null;
  try { const hit = rc.intersectObjects(l3Surfaces(), true).filter(h => h.object.visible && !h.object.userData.noHit && h.object.type !== "Line" && h.object.type !== "LineSegments")[0]; if (hit) z = hit.point.z + O[2]; } catch (e) { /* ingen träff */ }
  if (z == null) { const p = l3spPlans().find(q => q.id === l3sp.planId), c = p && l3spCalib(p); z = c && c.model && c.model[0] ? Number(c.model[0][2]) || 0 : 0; }
  return z;
}
function l3spGoTo(x, y) {
  const z = l3spGround(x, y); l3sp.pin = [x, y, z]; l3spPinDraw();
  const T = new THREE.Vector3(x - l3.O[0], y - l3.O[1], z - l3.O[2]), dist = Math.max(3, l3.camera.position.distanceTo(l3.orbit.target));
  if (typeof l3FlyTo === "function") l3FlyTo(T, dist, null, 450); else { l3.orbit.target.copy(T); l3.orbit.update(); }
  l3Status(`Ritningen → 3D: ${x.toFixed(1).replace(".", ",")} / ${y.toFixed(1).replace(".", ",")}, höjd ${z.toFixed(2).replace(".", ",")} m. Nålen tas bort med Nål ✕.`); l3sp.key = "";
}
function l3spPinDraw() {
  l3spPinClear(true); const p = l3sp.pin; if (!p) return; const O = l3.O, g = new THREE.Group(), mat = new THREE.LineBasicMaterial({ color: 0xdc2626, depthTest: false });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 25)]), mat), ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 48 }, (_, i) => new THREE.Vector3(Math.cos(i / 48 * 6.2832) * 1.2, Math.sin(i / 48 * 6.2832) * 1.2, 0))), mat);
  [line, ring].forEach(o => { o.renderOrder = 40; o.userData.noHit = true; o.raycast = () => {}; g.add(o); }); g.position.set(p[0] - O[0], p[1] - O[1], p[2] - O[2]); l3.scene.add(g); l3sp.pinObj = g; l3Render();
}
function l3spPinClear(keepPin) {
  if (l3sp.pinObj) { l3.scene.remove(l3sp.pinObj); l3sp.pinObj.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); l3sp.pinObj = null; if (typeof l3Render === "function") l3Render(); }
  if (!keepPin) { l3sp.pin = null; l3sp.key = ""; }
}
/* Musen i 3D → kors på ritningen (högst 10 gånger per sekund). */
function l3spHover(e) {
  if (!l3sp.open || e.target !== l3.renderer.domElement || l3sp.drag) return; const now = performance.now(); if (now - l3sp.hoverT < 100) return; l3sp.hoverT = now;
  let h = null; try { h = l3Ray(e, l3Surfaces())[0]; } catch (err) { /* */ } const pc = typeof l3pcPick === "function" ? l3pcPick(e) : null, hit = pc && (!h || pc.distance < h.distance) ? pc.point : h && h.point;
  l3sp.hover = hit ? [hit.x + l3.O[0], hit.y + l3.O[1], hit.z + l3.O[2]] : null; l3sp.key = "";
}
function l3spLoop() {
  if (!l3sp.open) return; l3sp.raf = requestAnimationFrame(l3spLoop); const cam = l3.camera; cam.updateMatrixWorld();
  const key = cam.matrixWorld.elements.map(v => v.toFixed(3)).join() + "|" + (l3sp.hover ? l3sp.hover.map(v => v.toFixed(2)).join() : "") + "|" + (l3.sel ? l3.sel.size : 0) + "|" + l3sp.view.k.toFixed(4) + l3sp.view.tx.toFixed(1) + l3sp.view.ty.toFixed(1);
  if (key === l3sp.key) return; l3sp.key = key; l3spDraw();
}
function l3spDraw() {
  const cv = l3sp.cv, im = l3sp.img; if (!cv || !im || !l3sp.aff) return; const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); if (!l3sp.fitted) { l3sp.fitted = true; l3spFit(); } }
  const O = l3.O, cam = l3.camera, g = cv.getContext("2d");
  if (l3sp.follow && !l3sp.drag) { const [cx, cy] = l3spToScr(cam.position.x + O[0], cam.position.y + O[1]), v = l3sp.view; v.tx += r.width / 2 - cx; v.ty += r.height / 2 - cy; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height); const v = l3sp.view; g.imageSmoothingQuality = "high"; g.drawImage(im, v.tx, v.ty, im.width * v.k, im.height * v.k);
  // markerade etableringsobjekt
  if (l3.sel && l3.sel.size) placements.forEach(p => { if (!l3.sel.has(p.id)) return; const [x, y] = l3spToScr(p.x, p.y); g.fillStyle = "rgba(245,158,11,.35)"; g.strokeStyle = "#f59e0b"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 9, 0, 6.2832); g.fill(); g.stroke(); if (p.name) { g.fillStyle = "#92400e"; g.font = "600 11px system-ui"; g.fillText(p.name, x + 12, y + 4); } });
  // orbitens mål, nål, markör
  const mark = (pt, col, kind) => { if (!pt) return; const [x, y] = l3spToScr(pt[0], pt[1]); g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); if (kind === "cross") { g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.moveTo(x, y - 8); g.lineTo(x, y + 8); } else if (kind === "pin") { g.arc(x, y, 7, 0, 6.2832); g.moveTo(x, y - 7); g.lineTo(x, y - 22); } g.stroke(); };
  mark([l3.orbit.target.x + O[0], l3.orbit.target.y + O[1]], "#64748b", "cross"); mark(l3sp.hover, "#16a34a", "cross"); mark(l3sp.pin, "#dc2626", "pin");
  // kameran: punkt + synfält
  const [cx, cy] = l3spToScr(cam.position.x + O[0], cam.position.y + O[1]), d = new THREE.Vector3(); cam.getWorldDirection(d);
  const [tx, ty] = l3spToScr(cam.position.x + O[0] + d.x, cam.position.y + O[1] + d.y), ang = Math.atan2(ty - cy, tx - cx), horiz = Math.hypot(d.x, d.y) > 0.12;
  if (horiz && !cam.isOrthographicCamera) { const fov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * (cam.aspect || 1)), R = 70; g.fillStyle = "rgba(37,99,235,.22)"; g.strokeStyle = "#2563eb"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, ang - fov / 2, ang + fov / 2); g.closePath(); g.fill(); g.stroke(); }
  g.fillStyle = "#2563eb"; g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 6, 0, 6.2832); g.fill(); g.stroke();
}
