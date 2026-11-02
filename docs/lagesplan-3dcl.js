/* Hjälplinjer (construction lines, som i Tekla) – Victor 2026-11-02: "tillfälliga linjer jag kan rita ut för att ha som linjer jag kan förhålla mig till".
   • Ritas bara i 3D-vyn: sparas inte i projektet och exporteras aldrig (ingen risk att något hamnar i Trimble Connect/IFC).
   • Skapa: två punkter, längs en kant, axel (X/Y/Z) genom en punkt, parallell (med valfritt avstånd) eller vinkelrät mot en annan hjälplinje.
   • Fäster: på linjen, på hjälppunkter och i skärningar mellan hjälplinjer – i alla verktyg som använder fästpunkterna (mät, rita, flytta …).
   • Ta bort en i taget (klicka på den) eller alla. Esc avbryter pågående skapande. */
const l3cl = { lines: [], pts: [], mode: null, stage: 0, tmp: null, group: null, el: null, seq: 0, show: true, ext: 600 };
const L3CL_COL = 0xd946ef;
if (typeof L3_SNAP !== "undefined") Object.assign(L3_SNAP, { cl: ["Hjälplinje", "#d946ef"], clp: ["Hjälppunkt", "#d946ef"], cli: ["Skärning hjälplinjer", "#0ea5e9"] });
const l3clV = a => new THREE.Vector3(a[0] - l3.O[0], a[1] - l3.O[1], a[2] - l3.O[2]);
const l3clW = v => [v.x + l3.O[0], v.y + l3.O[1], v.z + l3.O[2]].map(x => Math.round(x * 1000) / 1000);
const l3clId = () => "cl" + (++l3cl.seq);
const l3clNorm = d => { const l = Math.hypot(d[0], d[1], d[2]) || 1; return [d[0] / l, d[1] / l, d[2] / l]; };
function l3clAddLine(p, d, name) { const ln = { id: l3clId(), p: p.map(x => Math.round(x * 1000) / 1000), d: l3clNorm(d), name: name || "Hjälplinje " + (l3cl.lines.length + 1) }; l3cl.lines.push(ln); l3clRedraw(); return ln; }
function l3clAddPt(p) { if (l3cl.pts.some(q => Math.hypot(q.p[0] - p[0], q.p[1] - p[1], q.p[2] - p[2]) < 0.01)) return; l3cl.pts.push({ id: l3clId(), p: p.map(x => Math.round(x * 1000) / 1000) }); }
/* Skärningar mellan hjälplinjer (närmaste punkt mellan två linjer inom 2 cm) */
function l3clInter() {
  const out = [], L = l3cl.lines;
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j], r = a.d, s = b.d, w = [a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]], A = r[0] * r[0] + r[1] * r[1] + r[2] * r[2], B = r[0] * s[0] + r[1] * s[1] + r[2] * s[2], C = s[0] * s[0] + s[1] * s[1] + s[2] * s[2], D = r[0] * w[0] + r[1] * w[1] + r[2] * w[2], E = s[0] * w[0] + s[1] * w[1] + s[2] * w[2], den = A * C - B * B;
    if (Math.abs(den) < 1e-9) continue; const t = (B * E - C * D) / den, u = (A * E - B * D) / den, p1 = [a.p[0] + r[0] * t, a.p[1] + r[1] * t, a.p[2] + r[2] * t], p2 = [b.p[0] + s[0] * u, b.p[1] + s[1] * u, b.p[2] + s[2] * u];
    if (Math.hypot(p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]) < 0.02 && Math.abs(t) < 5000) out.push([(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2]);
  }
  return out;
}
/* ---- 3D ---------------------------------------------------------------------------------------------------------------- */
function l3clRedraw() {
  if (l3cl.group) { l3.scene.remove(l3cl.group); l3cl.group.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); l3cl.group = null; }
  const grp = new THREE.Group(); grp.name = "hjalplinjer"; grp.userData.noHit = true;
  if (l3cl.show) {
    l3cl.lines.forEach(ln => { const p = l3clV(ln.p), d = new THREE.Vector3(...ln.d), a = p.clone().addScaledVector(d, -l3cl.ext), b = p.clone().addScaledVector(d, l3cl.ext), g = new THREE.BufferGeometry().setFromPoints([a, b]);
      const l = new THREE.Line(g, new THREE.LineDashedMaterial({ color: L3CL_COL, dashSize: 2.2, gapSize: 1.1, depthTest: false, transparent: true, opacity: 0.95 })); l.computeLineDistances(); l.renderOrder = 28; l.userData.noHit = true; l.raycast = () => {}; grp.add(l); });
    const pts = [...l3cl.pts.map(q => q.p)], inter = l3clInter(); const mkPts = (arr, col, size) => { if (!arr.length) return; const g = new THREE.BufferGeometry().setFromPoints(arr.map(l3clV)); const P = new THREE.Points(g, new THREE.PointsMaterial({ color: col, size, sizeAttenuation: false, depthTest: false })); P.renderOrder = 29; P.userData.noHit = true; P.raycast = () => {}; grp.add(P); };
    mkPts(pts, L3CL_COL, 8); mkPts(inter, 0x0ea5e9, 10);
    if (l3cl.tmp && l3cl.tmp.a) mkPts([l3cl.tmp.a], L3CL_COL, 10);
  }
  l3.scene.add(grp); l3cl.group = grp; l3Render(); l3clPanelUpdate();
}
/* ---- Fäst (anropas från l3Snap) ------------------------------------------------------------------------------------------- */
function l3clSnap(e, s0) {
  if (!l3cl.show || !l3cl.lines.length && !l3cl.pts.length) return null; const r = l3Rect(), mx = e.clientX - r.left, my = e.clientY - r.top, ray = l3MouseRay(e), scr = p => l3ToScreen(l3clV(p));
  const near = (arr, thr, kind) => { let best = null; arr.forEach(p => { const q = scr(p); if (q.behind) return; const dd = Math.hypot(q.x - mx, q.y - my); if (dd < thr && (!best || dd < best.d)) best = { d: dd, p, kind }; }); return best; };
  const bi = near(l3clInter(), 15, "cli"); if (bi) return { point: l3clV(bi.p), kind: "cli", placeId: null };
  const bp = near(l3cl.pts.map(q => q.p), 13, "clp"); if (bp) return { point: l3clV(bp.p), kind: "clp", placeId: null };
  if (s0 && (s0.kind === "end" || s0.kind === "mid" || s0.kind === "edge" || s0.kind === "pc")) return null;   // objektets egna fästpunkter går före "på linjen"
  let best = null; l3cl.lines.forEach(ln => {
    const o = ray.origin, rd = ray.direction, p = l3clV(ln.p), d = new THREE.Vector3(...ln.d), w0 = p.clone().sub(o), b = d.dot(rd), dd = d.dot(w0), ee = rd.dot(w0), den = 1 - b * b; if (Math.abs(den) < 1e-9) return;
    const t = (b * ee - dd) / den, pt = p.clone().addScaledVector(d, t), q = l3ToScreen(pt); if (q.behind) return; const dist = Math.hypot(q.x - mx, q.y - my);
    if (dist < 10 && (!best || dist < best.d)) best = { d: dist, pt, ln };
  });
  return best ? { point: best.pt, kind: "cl", placeId: null, clId: best.ln.id, seg: null } : null;
}
/* Närmaste hjälplinje under pekaren (för parallell/vinkelrät/ta bort) */
function l3clPick(e) {
  const r = l3Rect(), mx = e.clientX - r.left, my = e.clientY - r.top, ray = l3MouseRay(e); let best = null;
  l3cl.lines.forEach(ln => { const o = ray.origin, rd = ray.direction, p = l3clV(ln.p), d = new THREE.Vector3(...ln.d), w0 = p.clone().sub(o), b = d.dot(rd), dd = d.dot(w0), ee = rd.dot(w0), den = 1 - b * b; if (Math.abs(den) < 1e-9) return; const pt = p.clone().addScaledVector(d, (b * ee - dd) / den), q = l3ToScreen(pt); if (q.behind) return; const dist = Math.hypot(q.x - mx, q.y - my); if (dist < 14 && (!best || dist < best.d)) best = { d: dist, ln, pt }; });
  return best;
}
/* ---- Skapa ------------------------------------------------------------------------------------------------------------- */
const l3clHelp = { two: ["Tryck punkt 1, sedan punkt 2 – en linje genom dem.", "Tryck punkt 2."], edge: ["Tryck på en kant (fäster mot kanten) – en linje längs den."], ax: ["Tryck en punkt – linjen går genom den längs axeln."], par: ["Tryck på en hjälplinje.", "Tryck på sidan där den nya linjen ska ligga (avståndet i rutan används om det är ifyllt)."], perp: ["Tryck på en hjälplinje.", "Tryck punkten som den vinkelräta linjen ska gå genom."], del: ["Tryck på en hjälplinje för att ta bort den."] };
function l3clStart(mode) {
  l3clStop(true); l3cl.mode = mode; l3cl.stage = 0; l3cl.tmp = null; const key = mode.startsWith("ax") ? "ax" : mode; l3Status("Hjälplinje: " + l3clHelp[key][0] + " Esc avbryter."); window.addEventListener("pointerdown", l3clDown, true); window.addEventListener("pointermove", l3clMove, true);
  const cv = l3.renderer.domElement; cv.style.cursor = "crosshair"; l3clPanelUpdate();
}
function l3clStop(quiet) { if (!l3cl.mode && quiet) return; l3cl.mode = null; l3cl.stage = 0; l3cl.tmp = null; window.removeEventListener("pointerdown", l3clDown, true); window.removeEventListener("pointermove", l3clMove, true); if (l3 && l3.renderer) l3.renderer.domElement.style.cursor = ""; if (typeof l3ShowMarker === "function") l3ShowMarker(null); l3clRedraw(); }
function l3clMove(e) { if (!l3cl.mode || e.target !== l3.renderer.domElement) return; if (l3cl.mode === "par" || l3cl.mode === "perp" || l3cl.mode === "del") { const h = l3clPick(e); l3ShowMarker(h ? { point: h.pt, kind: "cl" } : (l3cl.stage === 1 ? l3Snap(e) : null)); return; } l3ShowMarker(l3Snap(e)); }
function l3clNormal(d) { const dv = new THREE.Vector3(...d), n = new THREE.Vector3().crossVectors(dv, new THREE.Vector3(0, 0, 1)); if (n.lengthSq() < 1e-6) n.crossVectors(dv, new THREE.Vector3(1, 0, 0)); return n.normalize(); }
function l3clDown(e) {
  if (!l3cl.mode || e.button !== 0 || e.target !== l3.renderer.domElement) return; e.stopImmediatePropagation(); e.preventDefault(); const m = l3cl.mode;
  if (m === "del") { const h = l3clPick(e); if (h) { l3cl.lines = l3cl.lines.filter(x => x !== h.ln); l3clRedraw(); l3Status("Hjälplinjen borttagen."); } return; }
  if (m === "par" || m === "perp") {
    if (l3cl.stage === 0) { const h = l3clPick(e); if (!h) { l3Status("Tryck på en hjälplinje först.", true); return; } l3cl.tmp = { ln: h.ln }; l3cl.stage = 1; l3Status("Hjälplinje: " + l3clHelp[m][1]); return; }
    const s = l3Snap(e); if (!s) return; const ln = l3cl.tmp.ln, q = s.point;
    if (m === "perp") { const n = l3clNormal(ln.d); l3clAddLine(l3clW(q), [n.x, n.y, n.z], "Vinkelrät"); l3clAddPt(l3clW(q)); }
    else { const dist = Number(String((document.getElementById("v3ClOff") || {}).value || "").replace(",", ".")), n = l3clNormal(ln.d), p0 = l3clV(ln.p); let np;
      if (dist > 0) { const side = Math.sign(q.clone().sub(p0).dot(n)) || 1; np = p0.clone().addScaledVector(n, side * dist); } else { const off = q.clone().sub(p0), along = new THREE.Vector3(...ln.d).multiplyScalar(off.dot(new THREE.Vector3(...ln.d))); np = p0.clone().add(off.sub(along)); }
      l3clAddLine(l3clW(np), ln.d, dist > 0 ? `Parallell ${String(dist).replace(".", ",")} m` : "Parallell"); }
    l3cl.stage = 0; l3cl.tmp = null; l3Status("Hjälplinje tillagd. Tryck på nästa hjälplinje, eller Esc för att avsluta."); return;
  }
  const s = l3Snap(e); if (!s) return; const q = s.point;
  if (m === "two") { if (l3cl.stage === 0) { l3cl.tmp = { a: l3clW(q) }; l3cl.stage = 1; l3clAddPt(l3cl.tmp.a); l3Status("Hjälplinje: " + l3clHelp.two[1]); l3clRedraw(); return; } const a = l3cl.tmp.a, b = l3clW(q); if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) < 0.01) return; l3clAddLine(a, [b[0] - a[0], b[1] - a[1], b[2] - a[2]], "Två punkter"); l3clAddPt(b); l3cl.stage = 0; l3cl.tmp = null; l3Status("Hjälplinje tillagd. Tryck två nya punkter för nästa, eller Esc."); return; }
  if (m === "edge") { if (s.seg) { const [a, b] = s.seg; l3clAddLine(l3clW(a), [b.x - a.x, b.y - a.y, b.z - a.z], "Längs kant"); l3clAddPt(l3clW(a)); l3clAddPt(l3clW(b)); l3Status("Hjälplinje längs kanten tillagd."); } else l3Status("Tryck på en kant (fäster mot en kant på ett objekt).", true); return; }
  if (m.startsWith("ax")) { const k = m.slice(2), d = k === "x" ? [1, 0, 0] : k === "y" ? [0, 1, 0] : [0, 0, 1]; l3clAddLine(l3clW(q), d, "Axel " + k.toUpperCase()); l3clAddPt(l3clW(q)); l3Status("Hjälplinje tillagd. Tryck en ny punkt, eller Esc."); }
}
function l3clKey(e) { if (!l3cl.mode) return false; if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (l3cl.stage) { l3cl.stage = 0; l3cl.tmp = null; l3clRedraw(); l3Status("Avbrutet – tryck igen eller Esc för att avsluta."); } else { l3clStop(); l3Status("Hjälplinjer: avslutat."); } return true; } return false; }
/* ---- Panel ------------------------------------------------------------------------------------------------------------- */
const L3CL_CSS = `#v3Cl{position:absolute;left:12px;top:12px;z-index:23;width:min(280px,calc(100% - 24px));box-sizing:border-box;background:var(--v3-panel,#fff);color:#0f172a;border:1px solid rgba(0,0,0,.12);border-radius:14px;box-shadow:0 10px 32px rgba(0,0,0,.22);font:12.5px system-ui,sans-serif;padding:10px 12px}
#v3Cl h4{margin:0 0 6px;display:flex;align-items:center;gap:6px;font-size:13.5px}#v3Cl h4 span{flex:1}#v3Cl h4 button{border:0;background:none;cursor:pointer;font-size:14px;color:#64748b}
#v3Cl .g{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:6px 0}#v3Cl .g button,#v3Cl .r button{padding:6px 7px;border:1px solid rgba(0,0,0,.16);border-radius:9px;background:#fff;cursor:pointer;font:inherit;text-align:left}#v3Cl .g button.on{background:#d946ef;color:#fff;border-color:#d946ef}
#v3Cl .r{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:5px 0}#v3Cl .t{color:#64748b;font-size:11.5px;line-height:1.35}#v3Cl input[type=text]{width:58px;padding:4px 6px;border:1px solid rgba(0,0,0,.18);border-radius:7px;font:inherit}
#v3Cl .li{display:flex;align-items:center;gap:6px;padding:3px 0;border-top:1px solid #eef2f6}#v3Cl .li i{width:12px;height:0;border-top:2px dashed #d946ef}#v3Cl .li b{font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#v3Cl .li button{border:0;background:none;color:#b91c1c;cursor:pointer}
.v3-snap i.cl{border-radius:2px;transform:rotate(45deg);width:8px;height:8px}.v3-snap i.clp{border-radius:50%;background:var(--c)}.v3-snap i.cli{transform:rotate(45deg);background:var(--c)}`;
function l3clOpen() {
  const host = document.getElementById("v3Canvas"); if (!host) return; if (!document.getElementById("v3ClCss")) { const st = document.createElement("style"); st.id = "v3ClCss"; st.textContent = L3CL_CSS; document.head.appendChild(st); }
  let el = document.getElementById("v3Cl"); if (!el) { el = document.createElement("div"); el.id = "v3Cl"; host.appendChild(el); ["pointerdown", "wheel", "dblclick", "contextmenu", "keydown", "keyup", "click"].forEach(t => el.addEventListener(t, e => e.stopPropagation())); l3cl.el = el;
    el.addEventListener("click", e => { const b = e.target.closest("[data-clm],[data-clb],[data-cld]"); if (!b) return; if (b.dataset.clm) { l3cl.mode === b.dataset.clm ? l3clStop() : l3clStart(b.dataset.clm); } else if (b.dataset.cld) { l3cl.lines = l3cl.lines.filter(x => x.id !== b.dataset.cld); l3clRedraw(); } else { const a = b.dataset.clb; if (a === "close") l3clClose(); else if (a === "clear") { l3cl.lines = []; l3cl.pts = []; l3clRedraw(); l3Status("Alla hjälplinjer borttagna."); } else if (a === "vis") { l3cl.show = !l3cl.show; l3clRedraw(); } } }); }
  l3clRedraw();
}
function l3clClose() { l3clStop(true); l3cl.mode = null; const el = document.getElementById("v3Cl"); if (el) el.remove(); l3cl.el = null; }
function l3clToggle() { if (document.getElementById("v3Cl")) l3clClose(); else l3clOpen(); }
function l3clPanelUpdate() {
  const el = document.getElementById("v3Cl"); if (!el) return; const keep = (document.getElementById("v3ClOff") || {}).value || "", M = (k, t, tip) => `<button type="button" data-clm="${k}" class="${l3cl.mode === k ? "on" : ""}" title="${tip}">${t}</button>`;
  el.innerHTML = `<h4><span>📐 Hjälplinjer</span><button type="button" data-clb="close" title="Stäng (linjerna ligger kvar tills du laddar om)">✕</button></h4>
  <div class="t">Tillfälliga linjer att förhålla sig till. De sparas inte och exporteras aldrig.</div>
  <div class="g">${M("two", "Två punkter", "En linje genom två punkter")}${M("edge", "Längs kant", "En linje längs en kant på ett objekt")}${M("axx", "Axel X", "Linje längs X genom en punkt")}${M("axy", "Axel Y", "Linje längs Y genom en punkt")}${M("axz", "Axel Z (lod)", "Lodrät linje genom en punkt")}${M("par", "Parallell", "Parallell med en hjälplinje – med avstånd eller genom en punkt")}${M("perp", "Vinkelrät", "Vinkelrät mot en hjälplinje genom en punkt")}${M("del", "Ta bort…", "Tryck på en hjälplinje för att ta bort den")}</div>
  <div class="r"><label title="Avstånd för Parallell (m). Tomt = genom punkten du trycker på.">Avstånd <input id="v3ClOff" type="text" inputmode="decimal" value="${keep}" placeholder="m"> m</label></div>
  <div class="r"><button type="button" data-clb="vis">${l3cl.show ? "Dölj" : "Visa"}</button><button type="button" data-clb="clear" ${l3cl.lines.length || l3cl.pts.length ? "" : "disabled"}>Rensa alla</button></div>
  ${l3cl.lines.map(l => `<div class="li"><i></i><b title="${l.name}">${l.name}</b><button type="button" data-cld="${l.id}" title="Ta bort">✕</button></div>`).join("") || `<div class="t">Inga hjälplinjer än.</div>`}
  <div class="t">Fäster: på linjen, på hjälppunkter och i skärningar – i alla verktyg som fäster.</div>`;
}
