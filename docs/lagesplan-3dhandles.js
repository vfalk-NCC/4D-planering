/* 3D-vyn: direktmodifiering som i Tekla – handtag på det markerade objektet (Victor 2026-10-08).
   - Låda (bod, container, upplag …): dra en sida för att ändra längd/bredd (motsatt sida står kvar),
     dra toppen för höjden, dra räckviddsringen för kranens räckvidd.
   - Staket: dra en punkt för att flytta den, dra ett plus mitt på en sträcka för att lägga till en
     punkt, dubbelklicka (eller högerklicka) en punkt för att ta bort den.
   Handtagen fäster mot hörn/mittpunkter/kanter på andra objekt (samma fästlägen som verktygen),
   annars mot steget i Steg-listan. Måttet visas medan man drar; Esc avbryter och återställer. */

let l3H = null; // pågående drag: { p, h, start, snap, moved }

function l3HandleDefs(p) {
  const lib = placeLib(p.type) || {};
  const O = l3.O, z0 = (Number(p.z) || 0) + (Number(p.dz) || 0) - O[2];
  if (lib.fence) {
    const P = p.pts || [], out = [];
    P.forEach((q, i) => out.push({ key: "pt", i, pos: new THREE.Vector3(q[0] - O[0], q[1] - O[1], (q[2] || 0) + (Number(p.dz) || 0) - O[2]), title: "Dra för att flytta punkten. Dubbelklicka för att ta bort den." }));
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.3) continue;
      out.push({ key: "ins", i, pos: new THREE.Vector3((a[0] + b[0]) / 2 - O[0], (a[1] + b[1]) / 2 - O[1], ((a[2] || 0) + (b[2] || 0)) / 2 + (Number(p.dz) || 0) - O[2]), title: "Dra för att lägga till en punkt här." });
    }
    return out;
  }
  if (lib.isModel) return [];
  const t = (Number(p.rot) || 0) * Math.PI / 180, u = new THREE.Vector3(Math.cos(t), Math.sin(t), 0), v = new THREE.Vector3(-Math.sin(t), Math.cos(t), 0);
  const L = Number(p.L) || 0, B = Number(p.B) || 0, H = Number(p.H) || 0;
  const c = new THREE.Vector3(p.x - O[0], p.y - O[1], z0), mid = c.clone().add(new THREE.Vector3(0, 0, H / 2));
  const out = [
    { key: "L", sign: 1, dir: u.clone(), pos: mid.clone().addScaledVector(u, L / 2), title: "Dra för att ändra längden" },
    { key: "L", sign: -1, dir: u.clone().negate(), pos: mid.clone().addScaledVector(u, -L / 2), title: "Dra för att ändra längden" },
    { key: "B", sign: 1, dir: v.clone(), pos: mid.clone().addScaledVector(v, B / 2), title: "Dra för att ändra bredden" },
    { key: "B", sign: -1, dir: v.clone().negate(), pos: mid.clone().addScaledVector(v, -B / 2), title: "Dra för att ändra bredden" },
    { key: "H", sign: 1, dir: new THREE.Vector3(0, 0, 1), pos: c.clone().add(new THREE.Vector3(0, 0, H)), title: "Dra för att ändra höjden" },
  ];
  const R = Number(p.R) || 0;
  if (lib.R != null && R > 0) out.push({ key: "R", sign: 1, dir: v.clone(), pos: c.clone().addScaledVector(v, R).add(new THREE.Vector3(0, 0, 0.05)), title: "Dra för att ändra räckvidden" });
  return out;
}
const l3HandleLabel = { L: "Längd", B: "Bredd", H: "Höjd", R: "Räckvidd" };

/* Bygger handtagen för markeringen (anropas när markeringen eller objektet ändras). */
function l3HandlesBuild() {
  if (!l3) return;
  let box = l3.handlesEl;
  if (!box) { box = document.createElement("div"); box.className = "v3-hds"; l3.renderer.domElement.parentElement.appendChild(box); l3.handlesEl = box; }
  if (l3H) return; // under drag: behåll elementen (de flyttas i l3HandlesPos)
  const p = l3HandleTarget();
  box.innerHTML = "";
  box.dataset.id = p ? p.id : "";
  if (!p) return;
  l3HandleDefs(p).forEach((h, k) => {
    const el = document.createElement("div");
    el.className = `v3-hd v3-hd-${h.key}`;
    el.title = h.title; el.dataset.k = k;
    if (h.key === "ins") el.textContent = "+";
    el.onpointerdown = e => l3HandleDown(e, p.id, k);
    if (h.key === "pt") {
      el.ondblclick = e => e.stopPropagation(); // hanteras i l3HandleDown
      el.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); l3FenceRemovePt(p.id, h.i); };
    } else el.oncontextmenu = e => { e.preventDefault(); e.stopPropagation(); };
    box.appendChild(el);
  });
  l3HandlesPos();
}
function l3HandleTarget() {
  if (!l3 || l3.sel.size !== 1 || (l3.tool || "select") !== "select" || l3.addType) return null;
  const id = [...l3.sel][0], g = l3.placeMeshes.get(id);
  if (!g || !g.visible) return null;
  return placements.find(x => x.id === id) || null;
}
/* Flyttar handtagen till rätt plats på skärmen (varje bildruta). */
function l3HandlesPos() {
  const box = l3 && l3.handlesEl;
  if (!box) return;
  const p = l3H ? l3H.p : l3HandleTarget();
  const hide = !p || box.dataset.id !== p.id || l3.gizmo.dragging || l3.dlgPick || l3.clipPick || l3.vPick;
  box.classList.toggle("hidden", !!hide);
  if (hide) return;
  const defs = l3HandleDefs(p), r = l3.renderer.domElement;
  [...box.children].forEach(el => {
    const h = defs[+el.dataset.k];
    if (!h) { el.style.display = "none"; return; }
    const q = h.pos.clone().project(l3.camera);
    if (q.z > 1 || !l3NotClipped(h.pos)) { el.style.display = "none"; return; }
    el.style.display = "";
    el.style.left = ((q.x + 1) / 2 * r.clientWidth) + "px"; el.style.top = ((1 - q.y) / 2 * r.clientHeight) + "px";
    el.classList.toggle("on", !!(l3H && l3H.k === +el.dataset.k));
  });
}

// ---------------------------------------------------------------------
// Dra
// ---------------------------------------------------------------------
function l3HandleDown(e, id, k) {
  if (e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const p = placements.find(x => x.id === id);
  if (!p) return;
  let h = l3HandleDefs(p)[k];
  if (!h) return;
  // Dubbeltryck på en punkt = ta bort den (egen räkning: handtagen kan ha byggts om mellan trycken).
  const now = Date.now(), last = l3HandleDown.last;
  l3HandleDown.last = { id, k, t: now };
  if (h.key === "pt" && last && last.id === id && last.k === k && now - last.t < 450) { l3HandleDown.last = null; l3FenceRemovePt(id, h.i); return; }
  const start = JSON.parse(JSON.stringify(p));
  if (h.key === "ins") {
    // Ny punkt mitt på sträckan – sedan dras den som en vanlig punkt.
    placeSnapshot();
    const a = p.pts[h.i - 1], b = p.pts[h.i];
    p.pts.splice(h.i, 0, [placeR3((a[0] + b[0]) / 2), placeR3((a[1] + b[1]) / 2), placeR3(((a[2] || 0) + (b[2] || 0)) / 2)]);
    l3RebuildOne(p);
    const k2 = l3HandleDefs(p).findIndex(d => d.key === "pt" && d.i === h.i);
    l3H = { p, k: k2, h: l3HandleDefs(p)[k2], start, moved: true, snapped: true };
    l3HandlesRebuildDuringDrag();
  } else l3H = { p, k, h, start, moved: false, snapped: false };
  l3H.base = l3H.h.pos.clone();
  l3H.dim0 = h.key === "pt" || h.key === "ins" ? 0 : Number(p[h.key]) || 0;
  // Lyssna på fönstret (handtagen kan byggas om under draget, t.ex. när en punkt läggs till).
  const pid = e.pointerId;
  const off = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); window.removeEventListener("blur", lost); };
  const mv = ev => { if (ev.pointerId === pid) l3HandleMove(ev); };
  const up = ev => { if (ev.pointerId !== pid) return; off(); l3HandleUp(ev.type === "pointercancel"); };
  const lost = () => { off(); l3HandleUp(false); };
  window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  window.addEventListener("blur", lost);
  l3H.off = off;
  l3.orbit.enabled = false;
  l3Status(h.key === "pt" || h.key === "ins" ? "Dra punkten – fäster mot hörn och kanter. Esc avbryter." : `${l3HandleLabel[h.key]}: dra – fäster mot hörn och steget. Esc avbryter.`);
}
/* När en punkt lagts till ändras antalet handtag – bygg om dem men behåll draget. */
function l3HandlesRebuildDuringDrag() {
  const keep = l3H; l3H = null; l3HandlesBuild(); l3H = keep;
  const box = l3.handlesEl, el = box && box.querySelector(`[data-k="${keep.k}"]`);
  if (el) el.classList.add("on");
}
let l3HandleRaf = 0, l3HandleEv = null;
function l3HandleMove(e) {
  l3HandleEv = e;
  if (l3HandleRaf) return;
  l3HandleRaf = requestAnimationFrame(() => { l3HandleRaf = 0; if (l3H && l3HandleEv) l3HandleApply(l3HandleEv); });
}
function l3HandleApply(e) {
  const H = l3H, p = H.p, h = H.h, O = l3.O;
  if (!H.moved) { placeSnapshot(); H.moved = true; }
  const step = Number((document.getElementById("v3Step") || {}).value) || 0;
  let label = "";
  if (h.key === "pt") {
    const s = typeof l3Snap === "function" ? l3Snap(e, p.id) : null;
    let pt;
    if (s && s.kind !== "ground" && s.kind !== "face" && s.kind !== "grid") pt = s.point.clone();
    else {
      const ray = l3MouseRay(e), pl = new THREE.Plane(new THREE.Vector3(0, 0, 1), -H.base.z), q = new THREE.Vector3();
      if (!ray.intersectPlane(pl, q)) return;
      pt = s && s.kind === "grid" ? new THREE.Vector3(s.point.x, s.point.y, H.base.z) : q;
      if (!s || s.kind !== "grid") { pt.z = H.base.z; if (step) { pt.x = Math.round((pt.x + O[0]) / step) * step - O[0]; pt.y = Math.round((pt.y + O[1]) / step) * step - O[1]; } }
    }
    const dz = Number(p.dz) || 0;
    p.pts[h.i] = [placeR3(pt.x + O[0]), placeR3(pt.y + O[1]), placeR3(pt.z + O[2] - dz)];
    if (h.i === 0) { p.x = p.pts[0][0]; p.y = p.pts[0][1]; p.z = p.pts[0][2]; }
    const prev = p.pts[h.i - 1], next = p.pts[h.i + 1], f = v => v.toLocaleString("sv-SE", { maximumFractionDigits: 2 });
    label = [prev, next].filter(Boolean).map(q => f(Math.hypot(q[0] - p.pts[h.i][0], q[1] - p.pts[h.i][1])) + " m").join(" · ") || "Punkt";
  } else {
    // Närmaste punkt på handtagets axel till markörens stråle; fäst mot riktiga punkter på andra objekt.
    let t = l3AxisParam(e, H.base, h.dir);
    if (t == null) return;
    const s = typeof l3Snap === "function" ? l3Snap(e, p.id) : null;
    let snapped = false;
    if (s && (s.kind === "end" || s.kind === "mid" || s.kind === "edge")) { t = s.point.clone().sub(H.base).dot(h.dir); snapped = true; }
    const min = h.key === "R" ? 0 : 0.05;
    let dim = H.dim0 + t;
    if (!snapped && step) dim = Math.round(dim / step) * step;
    dim = placeR3(Math.max(min, dim));
    const d = dim - H.dim0, s0 = H.start;
    p[h.key] = dim;
    if (h.key === "L" || h.key === "B") {
      // Motsatt sida står kvar: mitten flyttas halva ändringen åt handtagets håll.
      p.x = placeR3(s0.x + h.dir.x * d / 2); p.y = placeR3(s0.y + h.dir.y * d / 2);
    }
    label = `${l3HandleLabel[h.key]} ${dim.toLocaleString("sv-SE", { maximumFractionDigits: 3 })} m${snapped ? " ◆" : ""}`;
  }
  l3RebuildOne(p);
  l3HandleTip(e, label);
  l3RenderSide(true);
}
/* Parameter t längs axeln (base + t·dir) för punkten närmast markörens stråle. */
function l3AxisParam(e, base, dir) {
  const ray = l3MouseRay(e), v = dir.clone().normalize(), d = ray.direction;
  const w0 = base.clone().sub(ray.origin), b = v.dot(d), dd = v.dot(w0), ee = d.dot(w0), den = 1 - b * b;
  if (Math.abs(den) < 1e-6) return null; // axeln pekar rakt mot kameran
  return (b * ee - dd) / den;
}
function l3HandleTip(e, text) {
  let tip = l3.handleTip;
  if (!tip) { tip = document.createElement("div"); tip.className = "v3-hd-tip"; l3.renderer.domElement.parentElement.appendChild(tip); l3.handleTip = tip; }
  if (!text) { tip.classList.add("hidden"); return; }
  const r = l3.renderer.domElement.getBoundingClientRect();
  tip.textContent = text; tip.classList.remove("hidden");
  tip.style.left = (e.clientX - r.left + 16) + "px"; tip.style.top = (e.clientY - r.top + 14) + "px";
}
/* Tangenter under ett drag (anropas från l3Key): Esc avbryter, allt annat ignoreras. */
function l3HandleKey(e) {
  if (!l3H) return false;
  e.preventDefault();
  if (e.key === "Escape") { const off = l3H.off; if (off) off(); l3HandleUp(true); }
  return true;
}
function l3HandleUp(cancel) {
  if (l3HandleRaf) { cancelAnimationFrame(l3HandleRaf); l3HandleRaf = 0; if (!cancel && l3H && l3HandleEv) l3HandleApply(l3HandleEv); } // sista rörelsen
  l3HandleEv = null;
  const H = l3H; l3H = null;
  l3.orbit.enabled = true;
  l3HandleTip(null, "");
  if (!H) return;
  const p = H.p;
  if (cancel) {
    if (H.moved) { Object.keys(p).forEach(k => delete p[k]); Object.assign(p, H.start); placeUndoStack.pop(); }
    l3RebuildOne(p); l3HandlesBuild(); l3RenderSide(); l3Status("Avbrutet.");
    return;
  }
  if (!H.moved) { l3Status(""); return; } // bara ett tryck
  {
    placeTouch(p); l3Changed();
    l3Status(H.h.key === "pt" ? `Staket: ${p.pts.length} punkter.` : `${l3HandleLabel[H.h.key]} ${String(p[H.h.key]).replace(".", ",")} m.`);
  }
  l3RebuildOne(p); l3HandlesBuild(); l3RenderSide();
}
function l3FenceRemovePt(id, i) {
  const p = placements.find(x => x.id === id);
  if (!p || !p.pts) return;
  if (p.pts.length <= 2) { l3Status("Ett staket behöver minst två punkter – ta bort hela staketet med Delete.", true); return; }
  placeSnapshot();
  p.pts.splice(i, 1);
  p.x = p.pts[0][0]; p.y = p.pts[0][1]; p.z = p.pts[0][2] || 0;
  placeTouch(p); l3RebuildOne(p); l3HandlesBuild(); l3Changed(); l3RenderSide();
  l3Status(`Punkten borttagen – staketet har ${p.pts.length} punkter.`);
}
