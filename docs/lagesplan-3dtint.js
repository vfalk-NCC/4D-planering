/* 3D-vyn – tillfällig färg och genomskinlighet på objekt i byggnaden (Victor 2026-10-10: "trycka för att
   tillfälligt byta färg på objekt i just den sessionen, jag ska också kunna ställa opacitet … när jag
   väljer flera objekt och då ändrar jag färg samtidigt på alla").

   – Färgrutan överst i högerpanelen (de markerade) öppnar en liten ruta: färger, egen färg, opacitet.
   – Gäller alla markerade på en gång. Sparas inte – borta när sidan laddas om. Ctrl+Z ångrar.
   – Färgen ligger per objekt i biten (u.tint) och går före status- och egenskapsfärger; opaciteten
     (u.alpha) ritas med en genomskinlig bit per opacitet (l3bApplyAlpha) som delar hörnen. */

const L3T_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#0ea5e9", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#64748b", "#111827", "#ffffff"];
const l3tHex = rgb => "#" + new THREE.Color(rgb[0], rgb[1], rgb[2]).getHexString();
/* De markerades gemensamma tillfälliga färg (för rutan), eller null. */
function l3tintOf(sel) {
  if (!sel || !sel.length) return null;
  const t0 = sel[0].mesh.userData.l3b.tint && sel[0].mesh.userData.l3b.tint.get(sel[0].ri);
  if (!t0) return null;
  const same = sel.every(e => { const t = e.mesh.userData.l3b.tint && e.mesh.userData.l3b.tint.get(e.ri); return t && t[0] === t0[0] && t[1] === t0[1] && t[2] === t0[2]; });
  return same ? { rgb: t0, css: l3tHex(t0) } : null;
}
function l3tAlphaOf(sel) {
  const a = sel.map(e => (e.mesh.userData.l3b.alpha && e.mesh.userData.l3b.alpha.get(e.ri)) || 1);
  return a.every(x => x === a[0]) ? a[0] : null;
}
/* Ögonblicksbild av de markerades färg/opacitet (för ångra). */
function l3tSnap(sel) { return sel.map(e => { const u = e.mesh.userData.l3b; return { mesh: e.mesh, ri: e.ri, t: u.tint ? u.tint.get(e.ri) || null : null, a: u.alpha ? u.alpha.get(e.ri) || null : null }; }); }
function l3tRestore(snap) {
  const meshes = new Set();
  snap.forEach(s => {
    const u = s.mesh.userData.l3b;
    if (!u.tint) u.tint = new Map(); if (!u.alpha) u.alpha = new Map();
    if (s.t) u.tint.set(s.ri, s.t); else u.tint.delete(s.ri);
    if (s.a && s.a < 1) u.alpha.set(s.ri, s.a); else u.alpha.delete(s.ri);
    meshes.add(s.mesh);
  });
  l3tRefresh(meshes);
}
function l3tRefresh(meshes, alphaChanged = true) {
  if (typeof l3bRecolor === "function") l3bRecolor();
  if (alphaChanged) meshes.forEach(m => l3bApplyHidden(m));
  if (typeof l3RenderSide === "function") l3RenderSide();
  l3Render();
}
/* Ändra de markerade: patch = { color: "#rrggbb" | null (= ingen tillfällig färg), alpha: 0–1 }. */
function l3tApply(patch, undoLabel, snapBefore) {
  const sel = l3bs.sel; if (!sel.length) return;
  const before = snapBefore || l3tSnap(sel), meshes = new Set();
  const rgb = patch.color ? (c => [c.r, c.g, c.b])(new THREE.Color(patch.color)) : null;
  sel.forEach(e => {
    const u = e.mesh.userData.l3b;
    if (!u.tint) u.tint = new Map(); if (!u.alpha) u.alpha = new Map();
    if ("color" in patch) { if (rgb) u.tint.set(e.ri, rgb); else u.tint.delete(e.ri); }
    if ("alpha" in patch) { if (patch.alpha < 0.999) u.alpha.set(e.ri, Math.round(patch.alpha * 100) / 100); else u.alpha.delete(e.ri); }
    meshes.add(e.mesh);
  });
  l3tRefresh(meshes, "alpha" in patch);
  if (undoLabel && typeof l3VPush === "function") { const after = l3tSnap(sel); l3VPush(() => l3tRestore(before), () => l3tRestore(after), undoLabel); }
}
/* Alla tillfälliga färger och opaciteter borta (alla modeller). */
function l3tResetAll() {
  const snap = [], meshes = new Set();
  l3b.models.forEach(m => m.meshes.forEach(x => { const u = x.userData.l3b; const keys = new Set([...(u.tint ? u.tint.keys() : []), ...(u.alpha ? u.alpha.keys() : [])]); keys.forEach(ri => snap.push({ mesh: x, ri, t: u.tint && u.tint.get(ri) || null, a: u.alpha && u.alpha.get(ri) || null })); if (keys.size) { u.tint = new Map(); u.alpha = new Map(); meshes.add(x); } }));
  if (!snap.length) return;
  l3tRefresh(meshes);
  if (typeof l3VPush === "function") l3VPush(() => l3tRestore(snap), () => { snap.forEach(s => { const u = s.mesh.userData.l3b; u.tint.delete(s.ri); u.alpha.delete(s.ri); }); l3tRefresh(new Set(snap.map(s => s.mesh))); }, "återställ färger");
  l3Status(`${snap.length} objekt har sina vanliga färger igen.`);
}
function l3tCount() { let n = 0; l3b.models.forEach(m => m.meshes.forEach(x => { const u = x.userData.l3b; n += new Set([...(u.tint ? u.tint.keys() : []), ...(u.alpha ? u.alpha.keys() : [])]).size; })); return n; }

function l3tintOpen(anchor) {
  const host = l3.renderer.domElement.parentElement;
  let pop = document.getElementById("v3TintPop");
  if (pop) { pop.remove(); return; } // andra trycket stänger
  const sel = l3bs.sel; if (!sel.length) return;
  pop = document.createElement("div"); pop.id = "v3TintPop"; pop.className = "v3-pop v3-tintpop";
  const draw = () => {
    const tc = l3tintOf(l3bs.sel), a = l3tAlphaOf(l3bs.sel), n = l3bs.sel.length, all = l3tCount();
    pop.innerHTML = `<div class="v3-tint-h"><b>Färg ${n > 1 ? `för ${n} objekt` : ""}</b><em>bara den här sessionen</em></div>
      <div class="v3-tint-cols">${L3T_COLORS.map(c => `<button type="button" data-tc="${c}" class="${tc && tc.css === c ? "on" : ""}" style="background:${c}" title="${c}"></button>`).join("")}<label class="v3-tint-own" title="Egen färg"><input type="color" id="v3TintOwn" value="${tc ? tc.css : "#6d5efc"}" />＋</label></div>
      <label class="v3-tint-op"><span>Opacitet</span><input type="range" id="v3TintOp" min="0.05" max="1" step="0.05" value="${a == null ? 1 : a}" /><b id="v3TintOpV">${a == null ? "blandat" : Math.round(a * 100) + " %"}</b></label>
      <div class="v3-tint-acts"><button type="button" id="v3TintClr" ${tc || l3bs.sel.some(e => { const u = e.mesh.userData.l3b; return (u.tint && u.tint.has(e.ri)) || (u.alpha && u.alpha.has(e.ri)); }) ? "" : "disabled"}>Återställ markerade</button><button type="button" id="v3TintAll" ${all ? "" : "disabled"}>Återställ alla${all ? ` (${all})` : ""}</button></div>`;
    pop.querySelectorAll("[data-tc]").forEach(b => { b.onclick = () => { l3tApply({ color: b.dataset.tc }, "tillfällig färg"); draw(); }; });
    const own = pop.querySelector("#v3TintOwn");
    own.oninput = () => l3tApply({ color: own.value }); // följer med medan man väljer
    let snapC = null; own.onfocus = own.onclick = () => { snapC = snapC || l3tSnap(l3bs.sel); };
    own.onchange = () => { l3tApply({ color: own.value }, "tillfällig färg", snapC); snapC = null; draw(); };
    const op = pop.querySelector("#v3TintOp"), opv = pop.querySelector("#v3TintOpV");
    let snapA = null, raf = 0;
    op.onpointerdown = () => { snapA = l3tSnap(l3bs.sel); };
    op.oninput = () => { snapA = snapA || l3tSnap(l3bs.sel); opv.textContent = Math.round(op.value * 100) + " %"; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => l3tApply({ alpha: Number(op.value) })); };
    op.onchange = () => { cancelAnimationFrame(raf); l3tApply({ alpha: Number(op.value) }, "opacitet", snapA); snapA = null; draw(); };
    pop.querySelector("#v3TintClr").onclick = () => { l3tApply({ color: null, alpha: 1 }, "återställ färg"); draw(); };
    pop.querySelector("#v3TintAll").onclick = () => { l3tResetAll(); draw(); };
  };
  draw();
  ["pointerdown", "click", "keydown", "wheel"].forEach(t => pop.addEventListener(t, e => e.stopPropagation()));
  host.appendChild(pop);
  const hr = host.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(hr.width - pop.offsetWidth - 8, ar.left - hr.left - pop.offsetWidth + ar.width)) + "px";
  pop.style.top = Math.min(hr.height - pop.offsetHeight - 8, ar.bottom - hr.top + 6) + "px";
  // Stängs vid tryck utanför, Esc eller när markeringen töms.
  const close = ev => { if (ev && (pop.contains(ev.target) || ev.target === anchor || (ev.target.closest && ev.target.closest("#v3BsTint")))) return; pop.remove(); document.removeEventListener("pointerdown", close, true); document.removeEventListener("keydown", esc, true); };
  const esc = ev => { if (ev.key === "Escape") { ev.stopPropagation(); close(); } };
  setTimeout(() => { document.addEventListener("pointerdown", close, true); document.addEventListener("keydown", esc, true); }, 0);
}
