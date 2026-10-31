/* Ritningspanel: 2D-ritningen bredvid 3D-vyn, synkad åt båda håll (Victor 2026-10-31: "2D-ritningar synkade med 3D").
   • Kameran syns på ritningen som en punkt med synfält som vrider sig när du flyger i 3D.
   • Markören i 3D (musen över ytor/modell) följer med som ett kors på ritningen, och markerade etableringsobjekt syns.
   • Tryck på ritningen: en nål sätts ut i 3D (stolpe + ring) och kameran flyger dit med samma vinkel.
   • Valfri kalibrerad ritning (arbetsytorna) – zooma med hjulet, dra för att panorera. Följ kameran håller den i mitten.
   Ritningen läggs på modellens XY via ritningens kalibrering, precis som lagret i 3D (calibAffine). */
/* Storlek och plats: dra i något av de fyra hörnen eller i rubrikraden (Victor 2026-10-31: "dra i hörnen så jag kan ställa storlek själv"). Sparas i webbläsaren. */
const l3spRect = () => { const r = l3Prefs().spRect; return r && r.w > 100 && r.h > 100 ? r : null; };
const l3sp = { open: false, planId: null, img: null, vp: null, aff: null, view: { k: 1, tx: 0, ty: 0 }, pin: null, hover: null, follow: true, size: 1, el: null, cv: null, raf: 0, key: "", pinObj: null, drag: null, busy: false, hoverT: 0 };
const L3SP_CSS = `#v3SpBtn{font-size:17px}#v3SpBtn.on{background:#2563eb!important;color:#fff!important}
#v3Sp{position:absolute;right:64px;bottom:12px;z-index:22;display:flex;flex-direction:column;background:var(--v3-panel,#fff);border:1px solid rgba(0,0,0,.14);border-radius:14px;box-shadow:0 10px 32px rgba(0,0,0,.24);overflow:hidden;font:12px system-ui,sans-serif;color:inherit}
#v3Sp .h{display:flex;gap:6px;align-items:center;padding:6px 8px;border-bottom:1px solid rgba(0,0,0,.08);flex-wrap:wrap}#v3Sp select{max-width:190px;padding:3px 6px;border:1px solid rgba(0,0,0,.18);border-radius:7px;font:inherit}
#v3Sp button{border:1px solid rgba(0,0,0,.15);background:#fff;border-radius:8px;padding:3px 8px;font:inherit;cursor:pointer}#v3Sp button.on{background:#2563eb;color:#fff;border-color:#2563eb}#v3Sp .cw{position:relative;flex:1;min-height:0;background:#e5e7eb}#v3Sp .cw canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none}#v3Sp #spCv{cursor:crosshair}#v3Sp .f{padding:4px 8px;opacity:.7}#v3Sp .z{display:flex;gap:5px;align-items:center;flex-wrap:wrap;padding:5px 8px;border-bottom:1px solid rgba(0,0,0,.08)}#v3Sp .z input[type=text]{width:74px;padding:3px 6px;border:1px solid rgba(0,0,0,.18);border-radius:7px;font:inherit;text-align:right}#v3Sp .z label{display:inline-flex;gap:4px;align-items:center;cursor:pointer}#v3Sp .z .t{opacity:.65}#v3Sp .h{cursor:move}#v3Sp .h button,#v3Sp .h select{cursor:pointer}#v3Sp .rz{position:absolute;width:18px;height:18px;z-index:5;touch-action:none}#v3Sp .rz::after{content:"";position:absolute;width:9px;height:9px;border:2px solid rgba(37,99,235,.65);opacity:0;transition:opacity .15s}#v3Sp:hover .rz::after{opacity:1}#v3Sp .rz[data-c=nw]{left:0;top:0;cursor:nwse-resize}#v3Sp .rz[data-c=nw]::after{left:3px;top:3px;border-right:0;border-bottom:0}#v3Sp .rz[data-c=ne]{right:0;top:0;cursor:nesw-resize}#v3Sp .rz[data-c=ne]::after{right:3px;top:3px;border-left:0;border-bottom:0}#v3Sp .rz[data-c=sw]{left:0;bottom:0;cursor:nesw-resize}#v3Sp .rz[data-c=sw]::after{left:3px;bottom:3px;border-right:0;border-top:0}#v3Sp .rz[data-c=se]{right:0;bottom:0;cursor:nwse-resize}#v3Sp .rz[data-c=se]::after{right:3px;bottom:3px;border-left:0;border-top:0}`;
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
  el.innerHTML = `<i class="rz" data-c="nw"></i><i class="rz" data-c="ne"></i><i class="rz" data-c="sw"></i><i class="rz" data-c="se"></i><div class="h"><select id="spPlan">${list.map(p => `<option value="${p.id}" ${p.id === l3sp.planId ? "selected" : ""}>${typeof escHtml === "function" ? escHtml(p.name || "Ritning") : p.name}</option>`).join("")}</select><button type="button" id="spFollow" class="${l3sp.follow ? "on" : ""}" title="Håll kameran i mitten av ritningen">Följ</button><button type="button" id="spFit" title="Hela ritningen">Hela</button><button type="button" id="spSize" title="Panelens storlek">⤢</button><button type="button" id="spPin" title="Ta bort nålen i 3D">Nål ✕</button><span style="flex:1"></span><button type="button" id="spX">✕</button></div><div class="z" id="spZrow"><span title="Höjden ritningen ligger på i modellen (m ö.h.)"><b>Höjd</b></span><button type="button" id="spZm" title="Sänk 0,1 m (Skift: 1 m)">−</button><input type="text" id="spZ" inputmode="decimal" title="Skriv höjd och tryck Enter"><button type="button" id="spZp" title="Höj 0,1 m (Skift: 1 m)">+</button><span class="t">m ö.h.</span><button type="button" id="spZpick" title="Tryck på en yta i 3D – ritningen får ytans höjd">Hämta från 3D</button><button type="button" id="spZpin" title="Använd nålens höjd">Nål</button><button type="button" id="spZundo" title="Ångra höjdändringen" disabled>↶</button><label title="Visa ritningen som en genomskinlig yta i 3D på den höjd den har – justera tills den ligger rätt mot modellen"><input type="checkbox" id="spZshow"> Visa i 3D</label></div><div class="cw"><canvas id="spBc"></canvas><canvas id="spCv"></canvas></div><div class="f" id="spF">Tryck på ritningen för att flyga dit i 3D. Hjul zoomar, dra panorerar.</div>`;
  l3sp.cv = el.querySelector("#spCv"); l3sp.bc = el.querySelector("#spBc"); l3sp.baseKey = "";
  el.querySelector("#spPlan").onchange = e => { l3sp.planId = e.target.value; l3spLoad(); }; el.querySelector("#spFollow").onclick = e => { l3sp.follow = !l3sp.follow; e.target.classList.toggle("on", l3sp.follow); l3sp.key = ""; };
  el.querySelector("#spFit").onclick = () => { l3spFit(); l3sp.key = ""; }; el.querySelector("#spSize").onclick = () => { l3SetPref("spRect", null); Object.assign(el.style, { left: "", top: "", right: "64px", bottom: "12px" }); l3sp.size = (l3sp.size % 3) + 1; l3spSize(); l3spFit(); l3sp.key = ""; };
  el.querySelector("#spPin").onclick = () => l3spPinClear(); el.querySelector("#spX").onclick = () => l3spToggle(false);
  l3spBind(); l3spDragBind(); l3spZBind(); window.addEventListener("pointermove", l3spHover, true); await l3spLoad(); l3spLoop();
}
function l3spClose() { l3sp.open = false; l3spZClearMesh(); l3spZPickStop(); clearTimeout(l3sp.hoverW); if (l3sp.onWin) window.removeEventListener("resize", l3sp.onWin); cancelAnimationFrame(l3sp.raf); window.removeEventListener("pointermove", l3spHover, true); const e = document.getElementById("v3Sp"); if (e) e.remove(); l3sp.el = l3sp.cv = null; l3spPinClear(); }
function l3spApplyRect(r) { const el = l3sp.el, host = document.getElementById("v3Canvas"); if (!el || !host) return; const H = host.getBoundingClientRect(), w = Math.min(Math.max(240, r.w), H.width - 8), h = Math.min(Math.max(190, r.h), H.height - 8), x = Math.min(Math.max(4, r.x), H.width - w - 4), y = Math.min(Math.max(4, r.y), H.height - h - 4); Object.assign(el.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px", right: "auto", bottom: "auto" }); return { x, y, w, h }; }
function l3spDragBind() {
  const el = l3sp.el, host = document.getElementById("v3Canvas"); let st = null;
  const begin = (e, mode) => { const R = el.getBoundingClientRect(), H = host.getBoundingClientRect(); st = { mode, sx: e.clientX, sy: e.clientY, r: { x: R.left - H.left, y: R.top - H.top, w: R.width, h: R.height }, H }; e.preventDefault(); e.stopPropagation(); };
  el.addEventListener("pointerdown", e => {
    const rz = e.target.closest(".rz"); if (rz) { begin(e, rz.dataset.c); rz.setPointerCapture(e.pointerId); return; }
    const h = e.target.closest(".h"); if (h && !e.target.closest("button,select,input,label")) { begin(e, "move"); h.setPointerCapture(e.pointerId); }
  });
  el.addEventListener("pointermove", e => {
    if (!st) return; const dx = e.clientX - st.sx, dy = e.clientY - st.sy, r = { ...st.r }, m = st.mode, MINW = 240, MINH = 190;
    if (m === "move") { r.x += dx; r.y += dy; }
    else { if (m.includes("e")) r.w = Math.max(MINW, st.r.w + dx); if (m.includes("s")) r.h = Math.max(MINH, st.r.h + dy); if (m.includes("w")) { r.w = Math.max(MINW, st.r.w - dx); r.x = st.r.x + st.r.w - r.w; } if (m.includes("n")) { r.h = Math.max(MINH, st.r.h - dy); r.y = st.r.y + st.r.h - r.h; } }
    st.cur = l3spApplyRect(r); l3sp.key = ""; if (m !== "move") { if (!l3sp.fitDone) l3sp.fitDone = true; }
  });
  const end = () => { if (!st) return; const c = st.cur; st = null; if (c) { l3SetPref("spRect", c); l3sp.key = ""; } };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  window.addEventListener("resize", l3sp.onWin = () => { const r = l3spRect(); if (l3sp.el && r) l3spApplyRect(r); });
}
function l3spSize() { if (!l3sp.el) return; const sr = l3spRect(); if (sr) { l3spApplyRect(sr); return; } const s = [[34, 46], [46, 62], [62, 82]][l3sp.size - 1] || [46, 62]; l3sp.el.style.width = `min(${s[0]}%, calc(100% - 24px))`; l3sp.el.style.height = `${s[1]}%`; }
/* Bildpyramid: halverade kopior – vid utzoomning ritas en lagom stor kopia i stället för den stora bilden (annars skalas miljontals pixlar varje bild). */
function l3spPyramid(img) { const lv = [{ cv: img, f: 1 }]; let cur = img, f = 1; while (Math.max(cur.width, cur.height) > 600) { const c = document.createElement("canvas"); c.width = Math.max(1, cur.width >> 1); c.height = Math.max(1, cur.height >> 1); const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(cur, 0, 0, c.width, c.height); f *= 2; lv.push({ cv: c, f }); cur = c; } return lv; }
async function l3spLoad() {
  const p = l3spPlans().find(x => x.id === l3sp.planId); if (!p || l3sp.busy) return; const f = document.getElementById("spF");
  l3sp.cache = l3sp.cache || new Map(); const hit = l3sp.cache.get(p.id), calSig = JSON.stringify(l3spCalib(p));
  if (hit && hit.sig === calSig && hit.file === (p.file_path || "") && (plan && p.id === plan.id ? hit.page === page : true)) { Object.assign(l3sp, { img: hit.img, vp: hit.vp, pyr: hit.pyr, aff: hit.aff, baseKey: "" }); l3spFit(); l3spZSync(); l3sp.key = ""; if (f) f.textContent = "Tryck på ritningen för att flyga dit i 3D. Hjul zoomar, dra panorerar."; return; }
  l3sp.busy = true; if (f) f.textContent = "Hämtar ritningen…";
  try {
    const pg = plan && p.id === plan.id ? page : await pdfOverlayPage(p); if (!pg) throw new Error("Ritningen kunde inte läsas.");
    const v1 = pg.getViewport({ scale: 1 }), s = Math.min((typeof lowMemDevice !== "undefined" && lowMemDevice ? 1500 : 2800) / Math.max(v1.width, v1.height), 4), vp = pg.getViewport({ scale: s });
    const cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height); const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    const aff = calibAffine(l3spCalib(p)), pyr = l3spPyramid(cv); l3sp.cache.set(p.id, { img: cv, vp, pyr, aff, sig: calSig, file: p.file_path || "", page: plan && p.id === plan.id ? page : null });
    if (l3sp.cache.size > 3) l3sp.cache.delete(l3sp.cache.keys().next().value);
    Object.assign(l3sp, { img: cv, vp, pyr, aff, baseKey: "" }); l3spFit(); l3spZSync(); l3sp.key = ""; if (f) f.textContent = "Tryck på ritningen för att flyga dit i 3D. Hjul zoomar, dra panorerar.";
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
  if (!l3sp.open || e.target !== l3.renderer.domElement || l3sp.drag || e.buttons) return; const now = performance.now(); if (now - l3sp.hoverT < 160) return; l3sp.hoverT = now;
  // Träffen söks bara när musen stått stilla en stund (annars blir dra/orbit segt): en kort väntan, och en enda sökning per stillastående.
  clearTimeout(l3sp.hoverW); const ev = { clientX: e.clientX, clientY: e.clientY };
  l3sp.hoverW = setTimeout(() => {
    if (!l3sp.open) return; let h = null; try { h = l3Ray(ev, l3Surfaces())[0]; } catch (err) { /* */ }
    const pc = !h && typeof l3pcPick === "function" ? l3pcPick(ev) : null, hit = pc ? pc.point : h && h.point, n = hit ? [hit.x + l3.O[0], hit.y + l3.O[1], hit.z + l3.O[2]] : null;
    if (!n && !l3sp.hover) return; if (n && l3sp.hover && Math.hypot(n[0] - l3sp.hover[0], n[1] - l3sp.hover[1]) < 0.02) return; l3sp.hover = n; l3sp.ovDirty = true;
  }, 90);
}
/* Två lager: ritningen (base) ritas bara när vyn/storleken ändras, markeringarna (kamera, kors, nål) ritas över den när kameran rört sig. Högst 30 bilder/s, och inget alls när fliken är dold. */
function l3spLoop() {
  if (!l3sp.open) return; l3sp.raf = requestAnimationFrame(l3spLoop); if (document.hidden) return;
  const now = performance.now(); if (now - (l3sp.lastDraw || 0) < 33) return;
  const cam = l3.camera; cam.updateMatrixWorld(); const E = cam.matrixWorld.elements, P = l3sp.camE || (l3sp.camE = new Float32Array(16)); let moved = l3sp.key === "" || l3sp.ovDirty;
  if (!moved) for (let i = 0; i < 16; i++) if (Math.abs(E[i] - P[i]) > 1e-5) { moved = true; break; }
  const selN = l3.sel ? l3.sel.size : 0; if (selN !== l3sp.selN) { moved = true; l3sp.selN = selN; }
  if (!moved) return; for (let i = 0; i < 16; i++) P[i] = E[i]; l3sp.key = "ok"; l3sp.ovDirty = false; l3sp.lastDraw = now; l3spDraw();
}
function l3spDraw() {
  const cv = l3sp.cv, bc = l3sp.bc, im = l3sp.img; if (!cv || !bc || !im || !l3sp.aff) return; const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), bw = Math.round(r.width * dpr), bh = Math.round(r.height * dpr);
  let sized = false; if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; bc.width = bw; bc.height = bh; sized = true; if (!l3sp.fitted) { l3sp.fitted = true; l3spFit(); } }
  const O = l3.O, cam = l3.camera;
  if (l3sp.follow && !l3sp.drag) { const [cx, cy] = l3spToScr(cam.position.x + O[0], cam.position.y + O[1]), v = l3sp.view; v.tx += r.width / 2 - cx; v.ty += r.height / 2 - cy; }
  const v = l3sp.view, bk = [v.k.toFixed(5), v.tx.toFixed(1), v.ty.toFixed(1), bw, bh, l3sp.planId, im.width].join("|");
  if (sized || bk !== l3sp.baseKey) {            // ritningen
    l3sp.baseKey = bk; const b = bc.getContext("2d"); b.setTransform(dpr, 0, 0, dpr, 0, 0); b.clearRect(0, 0, r.width, r.height);
    const lv = (l3sp.pyr || [{ cv: im, f: 1 }]).reduce((best, L) => (L.f <= 1 / Math.max(v.k, 1e-6) * 1.0001 ? L : best), l3sp.pyr ? l3sp.pyr[0] : { cv: im, f: 1 });   // största f som ändå inte skalar ner mer än 1:1
    b.imageSmoothingEnabled = true; b.imageSmoothingQuality = lv.f > 1 || v.k < 1 ? "medium" : "low"; b.drawImage(lv.cv, v.tx, v.ty, im.width * v.k, im.height * v.k);
  }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
  // markerade etableringsobjekt
  if (l3.sel && l3.sel.size) placements.forEach(p => { if (!l3.sel.has(p.id)) return; const [x, y] = l3spToScr(p.x, p.y); g.fillStyle = "rgba(245,158,11,.35)"; g.strokeStyle = "#f59e0b"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 9, 0, 6.2832); g.fill(); g.stroke(); if (p.name) { g.fillStyle = "#92400e"; g.font = "600 11px system-ui"; g.fillText(p.name, x + 12, y + 4); } });
  const mark = (pt, col, kind) => { if (!pt) return; const [x, y] = l3spToScr(pt[0], pt[1]); g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); if (kind === "cross") { g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.moveTo(x, y - 8); g.lineTo(x, y + 8); } else if (kind === "pin") { g.arc(x, y, 7, 0, 6.2832); g.moveTo(x, y - 7); g.lineTo(x, y - 22); } g.stroke(); };
  mark([l3.orbit.target.x + O[0], l3.orbit.target.y + O[1]], "#64748b", "cross"); mark(l3sp.hover, "#16a34a", "cross"); mark(l3sp.pin, "#dc2626", "pin");
  const [cx, cy] = l3spToScr(cam.position.x + O[0], cam.position.y + O[1]), d = new THREE.Vector3(); cam.getWorldDirection(d);
  const [tx, ty] = l3spToScr(cam.position.x + O[0] + d.x, cam.position.y + O[1] + d.y), ang = Math.atan2(ty - cy, tx - cx), horiz = Math.hypot(d.x, d.y) > 0.12;
  if (horiz && !cam.isOrthographicCamera) { const fov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * (cam.aspect || 1)), R = 70; g.fillStyle = "rgba(37,99,235,.22)"; g.strokeStyle = "#2563eb"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, ang - fov / 2, ang + fov / 2); g.closePath(); g.fill(); g.stroke(); }
  g.fillStyle = "#2563eb"; g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 6, 0, 6.2832); g.fill(); g.stroke();
}

/* ---- Höjdkalibrering (Victor 2026-10-31): ritningens höjd hämtas från kalibreringen och kan ställas in efter modellens höjder ------------- */
const l3spZRound = v => Math.round(v * 1000) / 1000;
const l3spZOf = p => { const c = p && l3spCalib(p); return c && c.model ? (Number(c.model[0][2]) || 0) / 1 * 0.5 + (Number(c.model[1][2]) || 0) * 0.5 : 0; };
function l3spZSync() {
  const el = l3sp.el; if (!el) return; const p = l3spPlans().find(x => x.id === l3sp.planId), inp = el.querySelector("#spZ"); if (!p || !inp) return;
  inp.value = l3spZOf(p).toFixed(3).replace(/0+$/, "").replace(/[.]$/, "").replace(".", ",") || "0"; l3sp.zPrev = null; const u = el.querySelector("#spZundo"); if (u) u.disabled = true; l3spZMesh();
}
/* Sätter höjden på båda kalibreringspunkterna (XY är orört) och sparar ritningen. */
function l3spZSet(z, silent) {
  const p = l3spPlans().find(x => x.id === l3sp.planId); if (!p || !Number.isFinite(z)) return; z = l3spZRound(z); const c = l3spCalib(p), was = l3spZOf(p);
  if (Math.abs(z - was) < 0.0005) return; l3sp.zPrev = { id: p.id, z: was, m: c.model.map(q => q.slice()) };
  const model = c.model.map(q => [q[0], q[1], z]);
  if (plan && p.id === plan.id) {
    plan.calib = { ...plan.calib, model }; plan._calibSet = true; if (typeof invalidatePositions === "function") invalidatePositions(); if (typeof renderOrtho === "function") renderOrtho(); if (typeof renderZones === "function") renderZones();
    if (typeof schedulePlanSave === "function") schedulePlanSave(); if (typeof l3BuildPlan === "function") l3BuildPlan().then(() => { if (typeof l3sRefresh === "function") l3sRefresh(0); l3Render(); });
  } else {
    p.calib = { ...p.calib, model }; p._calibSet = true; clearTimeout(l3sp.zSave); l3sp.zSave = setTimeout(() => { if (typeof savePlan === "function") savePlan(p); }, 600);
  }
  l3sp.aff = calibAffine(l3spCalib(p)); const hit = l3sp.cache && l3sp.cache.get(p.id); if (hit) { hit.sig = JSON.stringify(l3spCalib(p)); hit.aff = l3sp.aff; }
  l3spZSync(); l3sp.zPrev = { id: p.id, z: was, m: c.model.map(q => q.slice()) }; const u = l3sp.el && l3sp.el.querySelector("#spZundo"); if (u) u.disabled = false;
  l3sp.key = ""; if (!silent) l3Status(`Ritningens höjd: ${String(z).replace(".", ",")} m ö.h.`);
}
function l3spZBind() {
  const el = l3sp.el, q = id => el.querySelector(id), inp = q("#spZ"), parse = () => Number(String(inp.value).replace(",", ".").replace(/\s/g, ""));
  const cur = () => l3spZOf(l3spPlans().find(x => x.id === l3sp.planId));
  q("#spZm").onclick = e => l3spZSet(cur() - (e.shiftKey ? 1 : 0.1)); q("#spZp").onclick = e => l3spZSet(cur() + (e.shiftKey ? 1 : 0.1));
  inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); l3spZSet(parse()); inp.blur(); } e.stopPropagation(); }); inp.addEventListener("change", () => l3spZSet(parse()));
  q("#spZpick").onclick = () => l3spZPickStart(); q("#spZpin").onclick = () => { if (l3sp.pin) l3spZSet(l3sp.pin[2]); else l3Status("Sätt en nål först: tryck på ritningen.", true); };
  q("#spZundo").onclick = () => { const u = l3sp.zPrev; if (!u) return; const z = u.z; l3sp.zPrev = null; l3spZSet(z); l3sp.zPrev = null; q("#spZundo").disabled = true; };
  q("#spZshow").onchange = e => { l3sp.zShow = e.target.checked; l3spZMesh(); }; q("#spZshow").checked = !!l3sp.zShow; l3spZSync();
}
/* Hämta höjd från 3D: nästa tryck i 3D-vyn (yta, modell eller punktmoln) ger höjden. */
function l3spZPickStart() { l3spZPickStop(); l3sp.zPick = e => { if (e.button !== 0 || e.target !== l3.renderer.domElement) return; e.stopImmediatePropagation(); e.preventDefault(); let h = null; try { h = l3Ray(e, l3Surfaces().filter(o => o !== l3sp.zMesh))[0]; } catch (err) { /* */ } const pc = typeof l3pcPick === "function" ? l3pcPick(e) : null, pt = pc && (!h || pc.distance < h.distance) ? pc.point : h && h.point; l3spZPickStop(); if (pt) l3spZSet(pt.z + l3.O[2]); else l3Status("Ingen yta där – tryck på modellen, marken eller punktmolnet.", true); }; window.addEventListener("pointerdown", l3sp.zPick, true); l3.renderer.domElement.style.cursor = "crosshair"; l3Status("Tryck på en yta i 3D – ritningen får ytans höjd (Esc avbryter)."); }
function l3spZPickStop() { if (l3sp.zPick) { window.removeEventListener("pointerdown", l3sp.zPick, true); l3sp.zPick = null; if (l3 && l3.renderer) l3.renderer.domElement.style.cursor = ""; } }
/* Ritningen som genomskinlig yta i 3D på sin höjd (för ritningar som inte är arbetsytan; arbetsytan ritas redan som mark). */
function l3spZClearMesh() { if (l3sp.zMesh) { l3.scene.remove(l3sp.zMesh); l3sp.zMesh.geometry.dispose(); l3sp.zMesh.material.map && l3sp.zMesh.material.map.dispose(); l3sp.zMesh.material.dispose(); l3sp.zMesh = null; if (typeof l3Render === "function") l3Render(); } }
function l3spZMesh() {
  l3spZClearMesh(); if (!l3sp.zShow || !l3sp.open || !l3sp.img || !l3sp.aff) return; const p = l3spPlans().find(x => x.id === l3sp.planId); if (!p) return;
  if (plan && p.id === plan.id) { if (l3.planMesh) l3.planMesh.visible = true; return; }
  const z = l3spZOf(p), im = l3sp.img, O = l3.O, pos = [], uv = [];
  [[0, im.height], [im.width, im.height], [im.width, 0], [0, 0]].forEach(([cx, cy]) => { const [px, py] = l3sp.vp.convertToPdfPoint(cx, cy), [mx, my] = l3spAff(affInv(l3sp.aff), px, py); pos.push(mx - O[0], my - O[1], z - O[2]); uv.push(cx / im.width, 1 - cy / im.height); });
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
  const tex = new THREE.CanvasTexture(l3sp.pyr && l3sp.pyr[1] ? l3sp.pyr[1].cv : im); if ("encoding" in tex) tex.encoding = THREE.sRGBEncoding;
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false })); m.userData.noHit = true; m.raycast = () => {}; m.renderOrder = 5; l3.scene.add(m); l3sp.zMesh = m; l3Render();
}
/* Tangenter från l3Key: Esc avbryter "Hämta från 3D". */
function l3spKey(e) { if (l3sp.zPick && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); l3spZPickStop(); l3Status("Avbrutet."); return true; } return false; }
