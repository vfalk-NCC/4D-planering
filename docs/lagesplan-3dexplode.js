/* Exploderande 3D-animation av markerade objekt (Victor 2026-10-24): markera etableringsobjekt och/eller IFC-objekt och tryck Spränga i snabbfältet.
   Objekten flyttas isär från gruppens mitt (radiellt), lager för lager (höjd) eller längs en axel – reglage 0–100 %, avstånd och spela ut/in (loop).
   Etableringsobjekten flyttas som hela objekt; IFC-objekten plockas ut som egna delar (originalen göms tillfälligt via animOff) – inget i modellen ändras
   och allt läggs tillbaka när man stänger. */

const l3x = { on: false, t: 0, amount: 1.5, mode: "radial", items: [], tmp: [], hid: [], raf: 0, play: false, dir: 1, loop: true, sel: null, el: null, last: 0 };
const L3X_MAX = 20000;

/* Delar som tillhör markerade IFC-objekt som egna trianglar (icke-indexerade) – en per objekt. */
function l3xExtract(mesh, ris) {
  const u = mesh.userData.l3b, g = mesh.geometry, pos = g.getAttribute("position").array, col = g.getAttribute("color"), src = u.origIdx, mark = new Int32Array(g.getAttribute("position").count).fill(-1);
  ris.forEach((ri, k) => { const r = u.ranges[ri]; mark.fill(k, r.start, r.start + r.count); });
  const bk = ris.map(() => []); for (let i = 0; i + 2 < src.length; i += 3) { const k = mark[src[i]]; if (k >= 0) bk[k].push(src[i], src[i + 1], src[i + 2]); }
  return ris.map((ri, k) => { const idx = bk[k]; if (!idx.length) return null; const P = new Float32Array(idx.length * 3), C = col ? new col.array.constructor(idx.length * 3) : null;
    for (let j = 0; j < idx.length; j++) { const v = idx[j]; P[j * 3] = pos[v * 3]; P[j * 3 + 1] = pos[v * 3 + 1]; P[j * 3 + 2] = pos[v * 3 + 2]; if (C) { C[j * 3] = col.array[v * 3]; C[j * 3 + 1] = col.array[v * 3 + 1]; C[j * 3 + 2] = col.array[v * 3 + 2]; } }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(P, 3)); if (C) geo.setAttribute("color", new THREE.BufferAttribute(C, 3, col.normalized)); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, Array.isArray(mesh.material) ? mesh.material[0].clone() : mesh.material.clone()); m.matrixAutoUpdate = false; m.matrix.copy(mesh.matrix); m.userData.noHit = true; m.userData.noEdges = true; m.frustumCulled = false; return m; });
}
function l3xItems() {
  const items = [], v = new THREE.Vector3();
  l3.sel.forEach(id => { const g = l3.placeMeshes.get(id); if (!g) return; const b = new THREE.Box3().setFromObject(g); if (b.isEmpty()) return; items.push({ kind: "place", id, obj: g, pos0: g.position.clone(), c: b.getCenter(new THREE.Vector3()), off: new THREE.Vector3() }); });
  if (typeof l3bs !== "undefined" && l3bs.sel.length) {
    const byMesh = new Map(); l3bs.sel.forEach(e => { if (!byMesh.has(e.mesh)) byMesh.set(e.mesh, []); byMesh.get(e.mesh).push(e.ri); });
    byMesh.forEach((ris, mesh) => { const bx = l3bsBoxes(mesh), parts = l3xExtract(mesh, ris); mesh.updateMatrixWorld(true);
      ris.forEach((ri, k) => { const m = parts[k]; if (!m) return; const b = new THREE.Box3(new THREE.Vector3(bx[ri * 6], bx[ri * 6 + 1], bx[ri * 6 + 2]), new THREE.Vector3(bx[ri * 6 + 3], bx[ri * 6 + 4], bx[ri * 6 + 5])).applyMatrix4(mesh.matrixWorld);
        items.push({ kind: "ifc", mesh, ri, obj: m, base: m.matrix.clone(), c: b.getCenter(new THREE.Vector3()), off: new THREE.Vector3() }); }); });
  }
  return items;
}
function l3xLayout() {
  const its = l3x.items; if (!its.length) return; const C = new THREE.Vector3(); its.forEach(i => C.add(i.c)); C.divideScalar(its.length);
  const zs = its.map(i => i.c.z), zmin = Math.min(...zs), zmax = Math.max(...zs), A = l3x.amount, mode = l3x.mode, size = Math.max(4, new THREE.Box3().setFromPoints(its.map(i => i.c)).getSize(new THREE.Vector3()).length());
  its.forEach((it, k) => { const d = it.c.clone().sub(C);
    if (mode === "radial") { if (d.length() < 0.05) d.set(Math.cos(k * 2.4), Math.sin(k * 2.4), 0.3); it.off.copy(d).multiplyScalar(A).add(d.clone().normalize().multiplyScalar(size * 0.05 * A)); }
    else if (mode === "lager") it.off.set(0, 0, (it.c.z - C.z) * A * 1.2 + (zmax > zmin ? 0 : (k - its.length / 2) * 0.5 * A));
    else { const ax = mode === "x" ? "x" : mode === "y" ? "y" : "z"; it.off.set(0, 0, 0); it.off[ax] = d[ax] * A * 1.2 + (Math.abs(d[ax]) < 0.05 ? (k - its.length / 2) * 0.3 * A : 0); } });
}
const l3xEase = t => (t <= 1 ? 1 - Math.pow(1 - t, 3) : t); // över 100 % fortsätter de rakt ut (1 + extra)
function l3xApply() {
  const k = l3xEase(l3x.t);
  l3x.items.forEach(it => { if (it.kind === "place") it.obj.position.copy(it.pos0).addScaledVector(it.off, k); else { it.obj.matrix.copy(it.base); const e = it.obj.matrix.elements; e[12] += it.off.x * k; e[13] += it.off.y * k; e[14] += it.off.z * k; it.obj.matrixWorldNeedsUpdate = true; } });
  const s = document.getElementById("v3XSlider"), v = document.getElementById("v3XVal"); if (s && !l3x.drag) s.value = (l3x.t * 100).toFixed(1); if (v) v.textContent = Math.round(l3x.t * 100) + " %";
  l3Render();
}
function l3xStart() {
  if (!l3 || l3x.on) return;
  if (!l3.sel.size && !(typeof l3bs !== "undefined" && l3bs.sel.length)) { l3Status("Markera de objekt som ska sprängas isär – etableringsobjekt eller delar i IFC-modellen."); return; }
  if (typeof l3bs !== "undefined" && l3bs.sel.length > L3X_MAX) { l3Status(`Markera färre än ${L3X_MAX} IFC-objekt för att spränga dem.`, true); return; }
  const items = l3xItems(); if (items.length < 2) { l3Status("Markera minst två objekt att spränga isär.", true); return; }
  l3x.items = items; l3x.on = true; l3x.t = 0; l3x.sel = { ids: [...l3.sel], bs: typeof l3bs !== "undefined" ? l3bs.sel.slice() : [] };
  const meshes = new Set(); items.forEach(it => { if (it.kind !== "ifc") return; const u = it.mesh.userData.l3b; u.animOff = u.animOff || new Set(); if (!u.animOff.has(it.ri)) { u.animOff.add(it.ri); l3x.hid.push([it.mesh, it.ri]); } meshes.add(it.mesh); it.mesh.parent.add(it.obj); l3x.tmp.push(it.obj); });
  meshes.forEach(m => l3bApplyHidden(m));
  l3SelectIds([]); if (typeof l3bsClear === "function") l3bsClear();
  l3xLayout(); l3xPanel(true); l3xApply(); l3xPlay(true);
  l3Status(`Sprängning av ${items.length} objekt – dra reglaget eller spela.`);
}
function l3xStop() {
  if (!l3x.on) return; cancelAnimationFrame(l3x.raf); l3x.play = false;
  l3x.items.forEach(it => { if (it.kind === "place") it.obj.position.copy(it.pos0); });
  const meshes = new Set(); l3x.hid.forEach(([m, ri]) => { m.userData.l3b.animOff.delete(ri); meshes.add(m); }); l3x.tmp.forEach(m => { if (m.parent) m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); });
  meshes.forEach(m => l3bApplyHidden(m));
  const sel = l3x.sel; l3x.on = false; l3x.items = []; l3x.tmp = []; l3x.hid = []; l3xPanel(false);
  if (sel && sel.bs.length && typeof l3bsSet === "function") l3bsSet(sel.bs); if (sel && sel.ids.length) l3SelectIds(sel.ids, { keepIfc: true });
  l3Render(); l3Status("Sprängningen avslutad – allt är på plats.");
}
function l3xPlay(on) {
  l3x.play = !!on; cancelAnimationFrame(l3x.raf); const btn = document.getElementById("v3XPlay"); if (btn) { btn.classList.toggle("on", !!on); btn.setAttribute("aria-pressed", !!on); }
  if (!on) return; l3x.last = performance.now(); if (l3x.t >= 1) l3x.dir = -1; else if (l3x.t <= 0) l3x.dir = 1;
  const step = now => { if (!l3x.on || !l3x.play) return; const dt = Math.min(0.05, (now - l3x.last) / 1000); l3x.last = now; l3x.t += l3x.dir * dt / 2.2;
    if (l3x.t >= 1) { l3x.t = 1; if (l3x.loop) { l3x.dir = -1; l3x.hold = now + 600; } else l3x.play = false; } else if (l3x.t <= 0) { l3x.t = 0; if (l3x.loop) { l3x.dir = 1; l3x.hold = now + 600; } else l3x.play = false; }
    l3xApply(); if (!l3x.play) l3xPlay(false); else l3x.raf = requestAnimationFrame(n2 => { if (l3x.hold && n2 < l3x.hold) { l3x.last = n2; l3x.raf = requestAnimationFrame(step); } else step(n2); }); };
  l3x.raf = requestAnimationFrame(step);
}
function l3xPanel(show) {
  const host = document.getElementById("v3Canvas"); if (!host) return; let el = document.getElementById("v3Explode");
  if (!show) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("div"); el.id = "v3Explode"; el.className = "v3-explode"; host.appendChild(el); ["pointerdown", "wheel", "click", "dblclick", "contextmenu"].forEach(t => el.addEventListener(t, e => e.stopPropagation())); }
  const modes = [["radial", "Radiellt"], ["lager", "Lager"], ["x", "X"], ["y", "Y"], ["z", "Z"]];
  el.innerHTML = `<div class="v3-x-h"><b>Spränga</b><span>${l3x.items.length} objekt</span><button type="button" id="v3XClose" class="v3-x-x" aria-label="Klar" title="Klar – lägg tillbaka allt (Esc)">✕</button></div>
    <div class="v3-segs v3-x-modes">${modes.map(([k, t]) => `<button type="button" data-xm="${k}" class="${l3x.mode === k ? "on" : ""}">${t}</button>`).join("")}</div>
    <div class="v3-x-row"><button type="button" id="v3XPlay" class="v3-x-play ${l3x.play ? "on" : ""}" aria-label="Spela" title="Spela ut och in">▶</button><button type="button" class="v3-x-fine" data-xf="-1" title="Mindre (1 %) – Skift: 0,1 %">−</button><input type="range" id="v3XSlider" min="0" max="500" step="0.1" value="${(l3x.t * 100).toFixed(1)}" aria-label="Sprängning" /><button type="button" class="v3-x-fine" data-xf="1" title="Mer (1 %) – Skift: 0,1 %">+</button><b id="v3XVal">${Math.round(l3x.t * 100)} %</b></div>
    <div class="v3-x-row v3-x-row2"><label>Avstånd <input type="range" id="v3XAmt" min="0.3" max="40" step="0.05" value="${l3x.amount}" /></label><label class="v3-chk"><input type="checkbox" id="v3XLoop" ${l3x.loop ? "checked" : ""} /> Loop</label></div>`;
  el.querySelector("#v3XClose").onclick = l3xStop; el.querySelector("#v3XPlay").onclick = () => l3xPlay(!l3x.play);
  el.querySelectorAll("[data-xm]").forEach(b => b.onclick = () => { l3x.mode = b.dataset.xm; el.querySelectorAll("[data-xm]").forEach(x => x.classList.toggle("on", x === b)); l3xLayout(); l3xApply(); });
  const sl = el.querySelector("#v3XSlider"); sl.oninput = () => { l3x.drag = true; l3xPlay(false); l3x.t = sl.value / 100; l3xApply(); }; sl.onchange = () => { l3x.drag = false; };
  el.querySelectorAll("[data-xf]").forEach(b => b.onclick = e => { l3xPlay(false); l3x.t = Math.max(0, Math.min(5, l3x.t + Number(b.dataset.xf) * (e.shiftKey ? 0.001 : 0.01))); l3xApply(); });
  el.querySelector("#v3XAmt").oninput = e => { l3x.amount = Number(e.target.value); l3xLayout(); l3xApply(); }; el.querySelector("#v3XLoop").onchange = e => { l3x.loop = e.target.checked; };
}
window.addEventListener("keydown", e => { if (l3x.on && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); l3xStop(); } }, true);
