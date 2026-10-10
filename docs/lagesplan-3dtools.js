/* 3D-vyn: verktyg som i SketchUp (Victors önskemål 2026-10-08). Allt sker punkt till punkt med
   fästpunkter:
   - Fästpunkter: Ändpunkt (grön), Mittpunkt (turkos), På kant (röd), På yta (blå), På marken; och
     axlar från baspunkten (röd X, grön Y, blå höjd) när markören ligger längs dem.
   - Flytta (M): tryck en punkt (t.ex. ett hörn) och sedan dit den ska. Gäller alla markerade objekt.
     Piltangenter låser axel (→ röd, ← grön, ↑ blå, ↓ släpp). Skriv ett avstånd + Enter.
   - Vrid (Q): vridpunkt, utgångsriktning, ny riktning. Fäster var 15:e grad; skriv en vinkel + Enter.
   - Rikta (A): två punkter på objektets kant och två på kanten det ska ligga mot.
   - Mät (T): två punkter; mätlinjen med avståndet ligger kvar tills man mäter igen eller trycker Esc.
   Ändringarna går via place3d.js (placeShift/placeRotateAbout, ångra, sparning). */

const L3_AX = { x: { v: [1, 0, 0], col: "#dc2626", name: "på röd axel" }, y: { v: [0, 1, 0], col: "#16a34a", name: "på grön axel" }, z: { v: [0, 0, 1], col: "#2563eb", name: "på blå axel" } };
const L3_SNAP = { deg5: ["5°", "#7c3aed"], end: ["Ändpunkt", "#16a34a"], mid: ["Mittpunkt", "#06b6d4"], edge: ["På kant", "#dc2626"], face: ["På yta", "#2563eb"], ground: ["På marken", "#64748b"], grid: ["Rutnät", "#a855f7"] };
/* Fästlägen (som Teklas fästverktygsrad): hörn, mittpunkter, kanter, axlar, orto, rutnät. */
const L3_SNAP_DEF = { end: true, mid: true, edge: true, axis: true, ortho: false, grid: false, gstep: 1 };
function l3Snaps() { return { ...L3_SNAP_DEF, ...(l3Prefs().snaps || {}) }; }
function l3ToggleSnap(k) {
  const s = l3Snaps(); s[k] = !s[k]; l3SetPref("snaps", s); l3RenderSnapBar();
  const names = { end: "Fäst mot hörn", mid: "Fäst mot mittpunkter", edge: "Fäst mot kanter", axis: "Fäst mot axlar", ortho: "Orto", grid: `Rutnät (${String(s.gstep).replace(".", ",")} m)` };
  l3Status(`${names[k]} ${s[k] ? "på" : "av"}.`);
}
function l3RenderSnapBar() {
  const host = document.getElementById("v3Canvas");
  if (!host || !l3) return;
  let bar = document.getElementById("v3SnapBar");
  if (!bar) { bar = document.createElement("div"); bar.id = "v3SnapBar"; bar.className = "v3-snapbar"; host.appendChild(bar); bar.onclick = e => e.stopPropagation(); }
  const s = l3Snaps(), m = l3Prefs().measure || "dist";
  const b = (k, label, title) => `<button type="button" data-snapk="${k}" class="${s[k] ? "on" : ""}" title="${title}">${label}</button>`;
  bar.innerHTML = `<span class="v3-snapbar-l">Fäst</span>${b("end", "Hörn", "Fäst mot hörn (ändpunkter)")}${b("mid", "Mitt", "Fäst mot mittpunkter på kanter")}${b("edge", "Kant", "Fäst mot närmaste punkt på en kant")}${b("axis", "Axlar", "Fäst mot röd/grön/blå axel från baspunkten")}${b("ortho", "Orto", "Orto (O): bara i X-, Y- eller Z-led")}${b("grid", "Rutnät", "Rutnät (G): fäst mot rutnätet på marken och ytor")}
    <select id="v3GridStep" title="Rutnätets steg">${[0.1, 0.5, 1, 2, 5, 10].map(v => `<option value="${v}" ${Number(s.gstep) === v ? "selected" : ""}>${String(v).replace(".", ",")} m</option>`).join("")}</select>
    ${l3.tool === "move" ? `<span class="v3-snapbar-sep"></span><label class="v3-chk" title="Kopiera i stället för att flytta (tryck Ctrl)"><input type="checkbox" id="v3CopyMode" ${l3t.copyMode ? "checked" : ""} /> Kopia</label>` : ""}
    ${l3.tool === "measure" ? `<span class="v3-snapbar-sep"></span><div class="v3-segs">${[["dist", "Avstånd"], ["angle", "Vinkel"], ["area", "Yta"]].map(([k, l]) => `<button type="button" data-mmode="${k}" class="${m === k ? "on" : ""}">${l}</button>`).join("")}</div>${typeof l3mBarHtml === "function" ? l3mBarHtml() : ""}` : ""}`;
  if (typeof l3mBindBar === "function") l3mBindBar(bar);
  bar.querySelectorAll("[data-snapk]").forEach(x => { x.onclick = () => l3ToggleSnap(x.dataset.snapk); });
  bar.querySelector("#v3GridStep").onchange = e => { const v = { ...l3Snaps(), gstep: Number(e.target.value) }; l3SetPref("snaps", v); };
  const cm = bar.querySelector("#v3CopyMode"); if (cm) cm.onchange = () => { l3t.copyMode = cm.checked; l3Status(cm.checked ? "Kopierar: punkten du trycker härnäst får en kopia." : "Flyttar."); };
  bar.querySelectorAll("[data-mmode]").forEach(x => { x.onclick = () => { l3SetPref("measure", x.dataset.mmode); l3ToolCancel(); l3RenderSnapBar(); l3Status(L3_MEAS_START[x.dataset.mmode]); }; });
}
const L3_MEAS_START = { dist: "Mät avstånd: tryck på första punkten.", angle: "Mät vinkel: tryck på första punkten, sedan hörnet (vinkelns spets) och sist den andra punkten.", area: "Mät yta: tryck hörnen i tur och ordning. Avsluta med Enter eller tryck på första punkten igen." };
let l3t = { step: 0, lock: null, vcb: "", last: null };
let l3HoverRaf = 0;

function l3ToolsInit() {
  const host = document.getElementById("v3Canvas");
  const mk = (cls) => { const d = document.createElement("div"); d.className = cls; d.style.display = "none"; host.appendChild(d); return d; };
  l3t.marker = mk("v3-snap");
  l3t.vcbEl = mk("v3-vcb");
  l3t.measEl = mk("v3-meas");
  l3.tool = "select";
  l3.renderer.domElement.addEventListener("pointermove", e => {
    if (!l3.tool || (l3.tool === "select" && !l3.addType && !l3.dlgPick && !l3.vPick && !l3.clipPick)) { l3.lastSnap = null; if (l3t.marker) l3t.marker.style.display = "none"; return; }
    l3t.ev = e;
    if (!l3HoverRaf) l3HoverRaf = requestAnimationFrame(() => { l3HoverRaf = 0; if (l3t.ev) l3ToolHover(l3t.ev); });
  });
  l3.orbit.addEventListener("change", l3PlaceMeasLabel);
  // Ctrl (tryckt och släppt utan annan tangent) växlar Kopia i Flytta – som i SketchUp.
  window.addEventListener("keydown", e => { l3t.ctrlClean = e.key === "Control"; }, true);
  // Ctrl användes till något annat (Ctrl + mitten = rotera, Ctrl + tryck/ruta, Ctrl + hjul) -> ingen växling.
  ["pointerdown", "wheel"].forEach(t => window.addEventListener(t, () => { l3t.ctrlClean = false; }, { capture: true, passive: true }));
  window.addEventListener("keyup", e => {
    if (e.key !== "Control" || !l3t.ctrlClean || !l3 || l3.tool !== "move") return;
    const b = document.getElementById("view3d"); if (!b || b.classList.contains("hidden")) return;
    l3t.copyMode = !l3t.copyMode; l3RenderSnapBar();
    l3Status(l3t.copyMode ? "Kopierar (Ctrl): punkten du trycker härnäst får en kopia. Efteråt: skriv *5 + Enter för 5 kopior i rad, /5 för 5 jämnt fördelade." : "Flyttar (Ctrl för att kopiera).");
  }, true);
  l3RenderSnapBar();
}

const L3_TOOL_START = {
  move: "Flytta: tryck på en punkt på objektet (t.ex. ett hörn) – den punkten flyttas dit du trycker härnäst.",
  rotate: "Vrid: tryck på vridpunkten (markera objektet först, eller tryck på det).",
  align: "Rikta: tryck på första punkten på objektets kant.",
  measure: "Mät: tryck på första punkten (fäster mot hörn och kanter).",
  select: "",
};
function l3SetTool(t) {
  l3ToolCancel();
  // Ett påbörjat snitt (saxen) avbryts när man byter verktyg (Victor 2026-10-10: "låg kvar fast jag bytte till flytta").
  if (l3.clipPick) { l3.clipPick = false; l3.renderer.domElement.style.cursor = ""; }
  if (t !== "measure") l3ClearMeasure();
  if (t !== "move") l3t.copyMode = false;
  l3.tool = t; l3.addType = null; l3.fenceId = null;
  document.querySelectorAll("[data-v3tool]").forEach(b => b.classList.toggle("on", b.dataset.v3tool === t));
  if (typeof l3RenderLib === "function") l3RenderLib();
  l3RefreshSel();
  if (t !== "select") l3SetHover(null);
  l3Status(t === "measure" ? L3_MEAS_START[l3Prefs().measure || "dist"] : (L3_TOOL_START[t] || ""));
  l3RenderSnapBar();
  l3Render();
}
function l3ClearMeasure() { if (!l3) return; l3Clear(l3.groups.meas); l3.measLabel = null; if (l3t.measEl) l3t.measEl.style.display = "none"; l3Render(); }

// ---------------------------------------------------------------------
// Fästpunkter
// ---------------------------------------------------------------------
function l3Rect() { return l3.renderer.domElement.getBoundingClientRect(); }
function l3ToScreen(v) { const r = l3Rect(), p = v.clone().project(l3.camera); return { x: (p.x + 1) / 2 * r.width, y: (1 - p.y) / 2 * r.height, behind: p.z > 1 }; }
function l3MouseRay(e) {
  const r = l3Rect(), rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), l3.camera);
  return rc.ray;
}
function l3PlaceIdOf(o) { while (o && !(o.userData && o.userData.placeId)) o = o.parent; return o ? o.userData.placeId : null; }
const l3GroundZ = () => (plan.calib.model[0][2] || 0) - l3.O[2];
/* Fästpunkt under markören: hörn/kantmitt/kant på den träffade triangeln, annars ytan eller marken. */
function l3Snap(e, exclude) {
  const s = l3SnapRaw(e, exclude), S = l3Snaps();
  if (s && S.grid && (s.kind === "face" || s.kind === "ground")) {
    const g = Number(S.gstep) || 1, R = (v, o) => Math.round((v + o) / g) * g - o;
    return { ...s, point: new THREE.Vector3(R(s.point.x, l3.O[0]), R(s.point.y, l3.O[1]), s.point.z), kind: "grid" };
  }
  return s;
}
function l3SnapRaw(e, exclude) {
  const r = l3Rect(), mx = e.clientX - r.left, my = e.clientY - r.top, S = l3Snaps();
  const hits = l3Ray(e, l3Surfaces(exclude));
  if (hits.length) {
    const h = hits[0], o = h.object, pos = o.geometry.getAttribute("position");
    const placeId = l3PlaceIdOf(o);
    if (h.face && pos) {
      const W = i => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const vs = [W(h.face.a), W(h.face.b), W(h.face.c)], sc = vs.map(l3ToScreen);
      let best = null;
      if (S.end) vs.forEach((v, i) => { const d = Math.hypot(sc[i].x - mx, sc[i].y - my); if (d < 14 && (!best || d < best.d)) best = { d, p: v, kind: "end" }; });
      if (!best && (S.mid || S.edge)) {
        // Kanter – utom triangelns längsta (oftast diagonalen i en rektangel, ingen riktig kant).
        const E = [[0, 1], [1, 2], [2, 0]];
        const len = E.map(([a, b]) => vs[a].distanceTo(vs[b])), skip = len.indexOf(Math.max(...len));
        E.forEach(([a, b], k) => {
          if (k === skip && o !== l3.planMesh) return;
          const m = vs[a].clone().add(vs[b]).multiplyScalar(0.5), ms = l3ToScreen(m), dm = Math.hypot(ms.x - mx, ms.y - my);
          if (S.mid && dm < 12 && (!best || best.kind !== "mid" || dm < best.d)) best = { d: dm, p: m, kind: "mid" };
          if ((best && best.kind === "mid") || !S.edge) return;
          const ax = sc[b].x - sc[a].x, ay = sc[b].y - sc[a].y, l2 = ax * ax + ay * ay;
          if (!l2) return;
          const t = Math.max(0, Math.min(1, ((mx - sc[a].x) * ax + (my - sc[a].y) * ay) / l2));
          const d = Math.hypot(sc[a].x + ax * t - mx, sc[a].y + ay * t - my);
          if (d < 8 && (!best || d < best.d)) best = { d, p: vs[a].clone().lerp(vs[b], t), kind: "edge" };
        });
      }
      if (best) return { point: best.p, kind: best.kind, placeId };
    }
    // Ingen fästpunkt i 3D: DXF-linjerna i andra hand (Victor 2026-10-10: "snappa mot dxferna också men 3d i förstahand").
    const dx = typeof l3sDxfSnap === "function" ? l3sDxfSnap(e, S) : null;
    if (dx) return dx;
    return { point: h.point.clone(), kind: o === l3.planMesh ? "ground" : "face", placeId };
  }
  const dx = typeof l3sDxfSnap === "function" ? l3sDxfSnap(e, S) : null;
  if (dx) return dx;
  const ray = l3MouseRay(e), pl = new THREE.Plane(new THREE.Vector3(0, 0, 1), -l3GroundZ()), p = new THREE.Vector3();
  return ray.intersectPlane(pl, p) ? { point: p, kind: "ground", placeId: null } : null;
}
/* Närmaste punkt på axeln genom base (riktning v) till markörens stråle. */
function l3AxisPoint(e, base, key) {
  const ray = l3MouseRay(e), v = new THREE.Vector3(...L3_AX[key].v), d = ray.direction;
  const w0 = base.clone().sub(ray.origin), b = v.dot(d), dd = v.dot(w0), ee = d.dot(w0), den = 1 - b * b;
  if (Math.abs(den) < 1e-9) return null;
  return base.clone().add(v.multiplyScalar((b * ee - dd) / den));
}
/* Målpunkt från base: låst axel, fästpunkt eller axel som markören ligger längs. */
function l3Target(e, base, exclude) {
  const s = l3Snap(e, exclude), r = l3Rect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  if (l3t.lock) {
    const v = new THREE.Vector3(...L3_AX[l3t.lock].v);
    const p = s && (s.kind === "end" || s.kind === "mid") ? base.clone().add(v.multiplyScalar(s.point.clone().sub(base).dot(v))) : l3AxisPoint(e, base, l3t.lock);
    return p ? { point: p, kind: "axis", axis: l3t.lock, locked: true } : s;
  }
  // Mät med Skift: riktningen hoppar 5° åt gången (Victor 2026-10-10).
  if (e.shiftKey && l3.tool === "measure" && typeof l3mShiftSnap === "function") return l3mShiftSnap(base, s);
  const S = l3Snaps();
  if (S.ortho && s) {
    // Orto: bara längs X, Y eller Z från baspunkten (den riktning som ligger närmast).
    const d = s.point.clone().sub(base), k = ["x", "y", "z"].reduce((a, b) => Math.abs(d[b]) > Math.abs(d[a]) ? b : a, "x");
    if (d.length() < 1e-6) return s;
    const v = new THREE.Vector3(...L3_AX[k].v);
    return { point: base.clone().add(v.multiplyScalar(d[k])), kind: "axis", axis: k, ortho: true };
  }
  if (!s || s.kind === "end" || s.kind === "mid" || !S.axis) return s;
  let best = null;
  Object.keys(L3_AX).forEach(k => {
    const p = l3AxisPoint(e, base, k); if (!p) return;
    const q = l3ToScreen(p), d = Math.hypot(q.x - mx, q.y - my);
    if (d < 10 && p.distanceTo(base) > 0.01 && (!best || d < best.d)) best = { d, point: p, kind: "axis", axis: k };
  });
  return best || s;
}

// ---------------------------------------------------------------------
// Visning: fästmarkör, gummiband, gradskiva, VCB
// ---------------------------------------------------------------------
function l3ShowMarker(s) {
  const m = l3t.marker;
  l3.lastSnap = s ? s.point.clone() : null;
  if (!s) { m.style.display = "none"; return; }
  const q = l3ToScreen(s.point);
  const [txt0, col] = s.kind === "axis" ? [L3_AX[s.axis].name + (s.locked ? " (låst)" : s.ortho ? " (orto)" : ""), L3_AX[s.axis].col] : s.kind === "deg5" ? [`${s.deg}° (Skift)`, "#7c3aed"] : (L3_SNAP[s.kind] || ["", "#111"]);
  const txt = s.dxf ? `${txt0} (DXF)` : txt0;
  m.style.display = "block"; m.style.left = q.x + "px"; m.style.top = q.y + "px";
  m.style.setProperty("--c", col);
  m.innerHTML = `<i class="${s.kind}"></i><span>${txt}</span>`;
}
function l3TmpLine(a, b, color, dashed, group) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const mat = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.4, gapSize: 0.25, depthTest: false }) : new THREE.LineBasicMaterial({ color, depthTest: false });
  const l = new THREE.Line(g, mat); if (dashed) l.computeLineDistances(); l.renderOrder = 10;
  (group || l3.groups.tmp).add(l); return l;
}
function l3Dot(p, color, group) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.03, l3PxSize(p) * 4), 12, 8), new THREE.MeshBasicMaterial({ color, depthTest: false }));
  s.position.copy(p); s.renderOrder = 11; (group || l3.groups.tmp).add(s); return s;
}
function l3Protractor(c, r) {
  const pts = [];
  for (let i = 0; i <= 64; i++) { const t = i / 64 * Math.PI * 2; pts.push(new THREE.Vector3(c.x + r * Math.cos(t), c.y + r * Math.sin(t), c.z)); }
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x2563eb, depthTest: false }));
  l.renderOrder = 10; l3.groups.tmp.add(l);
}
function l3ShowVcb(label, value) {
  const el = l3t.vcbEl;
  if (!label) { el.style.display = "none"; return; }
  el.style.display = "block";
  el.innerHTML = `<span>${label}</span><b>${l3t.vcb ? escHtml(l3t.vcb) + "<u>|</u>" : value}</b>`;
}
const l3Fmt = (v, d = 2) => Number(v).toLocaleString("sv-SE", { maximumFractionDigits: d, minimumFractionDigits: 0 });
function l3PlaceMeasLabel() {
  const el = l3t.measEl;
  if (!el || !l3 || !l3.measLabel) { if (el) el.style.display = "none"; return; }
  const q = l3ToScreen(l3.measLabel.at);
  el.style.display = q.behind ? "none" : "block"; el.style.left = q.x + "px"; el.style.top = q.y + "px";
  el.textContent = l3.measLabel.text;
}

// ---------------------------------------------------------------------
// Förhandsvisning (utan att ändra placeringarna förrän man trycker)
// ---------------------------------------------------------------------
function l3GrabAll(ids) {
  return ids.map(id => { const g = l3.placeMeshes.get(id); return g ? { id, g, pos: g.position.clone(), rot: g.rotation.z } : null; }).filter(Boolean);
}
function l3Preview(objs, { C = null, deg = 0, delta = null } = {}) {
  (objs || []).forEach(o => {
    const p = o.pos.clone();
    if (C && deg) { const t = deg * Math.PI / 180, dx = p.x - C.x, dy = p.y - C.y; p.x = C.x + dx * Math.cos(t) - dy * Math.sin(t); p.y = C.y + dx * Math.sin(t) + dy * Math.cos(t); }
    if (delta) p.add(delta);
    o.g.position.copy(p); o.g.rotation.z = o.rot + deg * Math.PI / 180;
  });
  l3.groups.sel.children.forEach(h => h.update && h.update());
}
function l3Restore(objs) { (objs || []).forEach(o => { if (o.g) { o.g.position.copy(o.pos); o.g.rotation.z = o.rot; } }); }
/* Under ett pågående verktygssteg tonas panelerna ned och släpper igenom tryck. */
function l3Busy(on) { ["v3Side", "v3Info"].forEach(id => { const el = document.getElementById(id); if (el) el.classList.toggle("v3-busy", !!on); }); }
function l3ToolCancel() {
  l3Busy(false);
  if (l3t.objs) l3Restore(l3t.objs);
  l3t = { ...l3t, step: 0, lock: null, vcb: "", last: null, objs: null, base: null, C: null, R: null, A1: null, A2: null, B1: null, M1: null, mp: null };
  if (l3 && l3.groups) { l3Clear(l3.groups.tmp); l3.groups.sel.children.forEach(h => h.update && h.update()); }
  if (l3t.marker) l3ShowMarker(null);
  if (l3t.vcbEl) l3ShowVcb(null);
  if (l3) l3Render();
}
/* Ändringen genomförs på placeringarna (meter i modellens system) och ritas om – ett steg i ångra. */
function l3Commit(fn) {
  const objs = l3t.objs || [];
  const list = objs.map(o => placements.find(x => x.id === o.id)).filter(Boolean);
  if (!list.length) return;
  l3Restore(objs);
  placeSnapshot();
  list.forEach(p => { fn(p); placeTouch(p); l3RebuildOne(p); });
  l3Changed();
  if (typeof l3RenderSide === "function") { const s = document.getElementById("v3Side"); if (s) s.dataset.id = ""; l3RenderSide(); }
}
const l3Ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
const l3Norm = d => { d = ((d + 180) % 360 + 360) % 360 - 180; return Math.abs(d + 180) < 1e-9 ? 180 : d; };
/* Vilka objekt verktyget gäller: tryckt objekt (markeras om det inte redan är markerat) eller markeringen. */
function l3ToolTargets(s, e) {
  if (s && s.placeId && !l3.sel.has(s.placeId)) l3SelectIds(e && e.shiftKey ? [...l3.sel, s.placeId] : [s.placeId]);
  return [...l3.sel];
}

// ---------------------------------------------------------------------
// Hovring och tryck per verktyg
// ---------------------------------------------------------------------
function l3ToolHover(e) {
  l3Clear(l3.groups.tmp);
  const t = l3.tool, st = l3t.step;
  if (l3.addType || l3.vPick || l3.clipPick) { l3ShowMarker(l3Snap(e)); l3Render(); return; }
  if (l3.dlgPick) {
    const s = l3Snap(e); l3ShowMarker(s);
    const pts = l3.dlgPick.pts;
    if (s && pts.length) l3TmpLine(pts[pts.length - 1], s.point, "#7c3aed", true);
    l3Render(); return;
  }
  const ex = l3t.objs ? new Set(l3t.objs.map(o => o.id)) : undefined;
  if (t === "move") {
    if (st === 0) { l3ShowMarker(l3Snap(e)); l3ShowVcb("Avstånd", ""); }
    else {
      const s = l3Target(e, l3t.base, ex);
      l3ShowMarker(s);
      if (!s) return;
      l3t.last = s.point.clone();
      const delta = s.point.clone().sub(l3t.base);
      l3Preview(l3t.objs, { delta });
      l3TmpLine(l3t.base, s.point, s.kind === "axis" ? L3_AX[s.axis].col : "#111827", s.kind !== "axis");
      l3ShowVcb("Avstånd", l3Fmt(delta.length()) + " m");
    }
  } else if (t === "measure" && (l3Prefs().measure || "dist") !== "dist") {
    const mp = l3t.mp || [], s = mp.length ? l3Target(e, mp[mp.length - 1]) : l3Snap(e);
    l3ShowMarker(s);
    if (s) {
      const all = [...mp, s.point];
      for (let i = 1; i < all.length; i++) l3TmpLine(all[i - 1], all[i], "#dc2626", false);
      if ((l3Prefs().measure === "area") && all.length >= 3) l3TmpLine(all[all.length - 1], all[0], "#dc2626", true);
      if (l3Prefs().measure === "angle" && mp.length === 2) l3ShowVcb("Vinkel", l3Fmt(l3Angle3(mp[0], mp[1], s.point), 1) + "°");
      if (l3Prefs().measure === "area" && all.length >= 3) l3ShowVcb("Yta", l3Fmt(l3PolyArea(all).area) + " m²");
    }
  } else if (t === "measure") {
    const s = st === 1 ? l3Target(e, l3t.M1) : l3Snap(e);
    l3ShowMarker(s);
    if (st === 1 && s) {
      l3t.last = s.point.clone();
      l3TmpLine(l3t.M1, s.point, s.kind === "axis" ? L3_AX[s.axis].col : "#dc2626", false);
      l3ShowVcb("Avstånd", l3Fmt(l3t.M1.distanceTo(s.point)) + " m");
    } else l3ShowVcb("Avstånd", "");
  } else if (t === "rotate") {
    if (st === 0) { const s = l3Snap(e); l3ShowMarker(s); if (s) l3Protractor(s.point, l3ProtR(s.point)); l3ShowVcb("Vinkel", ""); }
    else {
      const s = l3Snap(e, ex); l3ShowMarker(s);
      const P = l3OnPlane(e, s, l3t.C);
      l3Protractor(l3t.C, l3ProtR(l3t.C));
      if (!P) return;
      if (st === 1) { l3TmpLine(l3t.C, P, "#111827", true); return; }
      const deg = l3SnapAngle(l3Norm(l3Ang(l3t.C, P) - l3Ang(l3t.C, l3t.R)), s);
      l3t.last = deg;
      l3TmpLine(l3t.C, l3t.R, "#111827", true); l3TmpLine(l3t.C, P, "#2563eb", false);
      l3Preview(l3t.objs, { C: l3t.C, deg });
      l3ShowVcb("Vinkel", l3Fmt(deg, 1) + "°");
    }
  } else if (t === "align") {
    const s = l3Snap(e, st >= 2 ? ex : undefined); l3ShowMarker(s);
    if (!s) return;
    if (st === 1) l3TmpLine(l3t.A1, s.point, "#dc2626", false);
    if (st === 2) l3Preview(l3t.objs, { delta: s.point.clone().sub(l3t.A1) });
    if (st === 3) {
      const deg = l3Norm(l3Ang(l3t.B1, s.point) - l3Ang(l3t.A1, l3t.A2));
      l3t.last = deg;
      l3Preview(l3t.objs, { C: l3t.A1, deg, delta: l3t.B1.clone().sub(l3t.A1) });
      l3TmpLine(l3t.B1, s.point, "#dc2626", false);
    }
  }
  l3Render();
}
const l3ProtR = c => Math.max(0.5, l3PxSize(c) * 70);
/* Punkten i vridplanet (horisontellt genom vridpunkten). */
function l3OnPlane(e, s, C) {
  if (s && (s.kind === "end" || s.kind === "mid")) return new THREE.Vector3(s.point.x, s.point.y, C.z);
  const p = new THREE.Vector3();
  return l3MouseRay(e).intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -C.z), p) ? p : (s ? new THREE.Vector3(s.point.x, s.point.y, C.z) : null);
}
/* Fäster var 15:e grad när man är nära (inte när man siktar på en fästpunkt). */
function l3SnapAngle(deg, s) {
  if (s && (s.kind === "end" || s.kind === "mid")) return Math.round(deg * 10) / 10;
  const r = Math.round(deg / 15) * 15;
  return Math.abs(deg - r) < 3 ? r : Math.round(deg * 10) / 10;
}

/* Tryck med ett verktyg. true = hanterat. */
function l3ToolTap(e) {
  const t = l3.tool, st = l3t.step;
  if (t === "measure" && (l3Prefs().measure || "dist") !== "dist") {
    const mode = l3Prefs().measure, mp = l3t.mp || (l3t.mp = []);
    const s = mp.length ? l3Target(e, mp[mp.length - 1]) : l3Snap(e);
    if (!s) return true;
    if (!mp.length) { l3ClearMeasure(); l3Busy(true); l3t.mpObjs = []; }
    // Yta: tryck på första punkten igen = klar.
    if (mode === "area" && mp.length >= 3) { const a = l3ToScreen(mp[0]), b = l3ToScreen(s.point); if (Math.hypot(a.x - b.x, a.y - b.y) < 12) { l3FinishArea(); return true; } }
    mp.push(s.point.clone()); l3Dot(s.point, 0xdc2626, l3.groups.meas);
    if (typeof l3mObjAt === "function") (l3t.mpObjs || (l3t.mpObjs = [])).push(l3mObjAt(e));
    if (mp.length > 1) l3TmpLine(mp[mp.length - 2], mp[mp.length - 1], "#dc2626", false, l3.groups.meas);
    if (mode === "angle" && mp.length === 3) {
      const ang = l3Angle3(mp[0], mp[1], mp[2]);
      l3.measLabel = { at: mp[1].clone(), text: `${l3Fmt(ang, 1)}°` }; l3PlaceMeasLabel();
      l3Status(`Vinkel ${l3Fmt(ang, 2)}° (vågrätt ${l3Fmt(l3Angle3(...mp.map(p => new THREE.Vector3(p.x, p.y, 0))), 2)}°). Tryck en ny punkt för att mäta igen.`);
      l3t.mp = null; l3Busy(false); l3ShowVcb(null); l3Clear(l3.groups.tmp);
      if (typeof l3mAdd === "function") { l3mAdd("angle", mp, `${l3Fmt(ang, 1)}°`, l3t.mpObjs); l3ClearMeasure(); } // ligger kvar
    } else l3Status(mode === "angle" ? (mp.length === 1 ? "Tryck på vinkelns spets (hörnet)." : "Tryck på den andra punkten.") : `${mp.length} hörn. Fortsätt – avsluta med Enter eller tryck på första punkten.`);
    l3Render();
    return true;
  }
  if (t === "measure") {
    const s = st === 1 ? l3Target(e, l3t.M1) : l3Snap(e);
    if (!s) return true;
    if (st === 0) { l3ClearMeasure(); l3t.mObjs = typeof l3mObjAt === "function" ? [l3mObjAt(e)] : []; l3t.M1 = s.point.clone(); l3t.step = 1; l3Busy(true); l3Dot(l3t.M1, 0xdc2626, l3.groups.meas); l3Status("Mät: tryck på andra punkten. Piltangenter låser axel."); l3Render(); return true; }
    if (typeof l3mObjAt === "function") l3t.mObjs = [...(l3t.mObjs || []).slice(0, 1), l3mObjAt(e)];
    l3MeasureTo(s.point.clone());
    return true;
  }
  if (t === "move") {
    if (st === 0) {
      const s = l3Snap(e);
      if (!s) return true;
      const ids = l3ToolTargets(s, e);
      if (!ids.length) { l3Status("Tryck på ett etableringsobjekt (eller markera först) – den punkten är det som flyttas."); return true; }
      l3t.objs = l3GrabAll(ids); l3t.base = s.point.clone(); l3t.step = 1; l3t.vcb = ""; l3t.lock = null; l3Busy(true);
      l3Status(`Tryck dit punkten ska${ids.length > 1 ? ` (${ids.length} objekt flyttas)` : ""}. Piltangenter låser axel (→ röd, ← grön, ↑ blå, ↓ släpp). Skriv ett avstånd + Enter. Esc avbryter.`);
      return true;
    }
    const s = l3Target(e, l3t.base, new Set(l3t.objs.map(o => o.id)));
    if (s) l3MoveTo(s.point);
    return true;
  }
  if (t === "rotate") {
    if (st === 0) {
      const s = l3Snap(e);
      if (!s) return true;
      const ids = l3.sel.size ? [...l3.sel] : l3ToolTargets(s, e);
      if (!ids.length) { l3Status("Tryck på objektet som ska vridas, eller markera det först."); return true; }
      l3t.objs = l3GrabAll(ids); l3t.C = s.point.clone(); l3t.step = 1; l3Busy(true);
      l3Status("Tryck en punkt som visar utgångsriktningen (t.ex. längs objektets kant).");
      return true;
    }
    const s = l3Snap(e, new Set(l3t.objs.map(o => o.id))), P = l3OnPlane(e, s, l3t.C);
    if (!P) return true;
    if (st === 1) {
      if (Math.hypot(P.x - l3t.C.x, P.y - l3t.C.y) < 0.01) return true;
      l3t.R = P; l3t.step = 2; l3t.vcb = "";
      l3Status("Tryck den nya riktningen. Fäster var 15:e grad – eller skriv en vinkel (minus = medurs) och tryck Enter.");
      return true;
    }
    l3RotateBy(l3SnapAngle(l3Norm(l3Ang(l3t.C, P) - l3Ang(l3t.C, l3t.R)), s));
    return true;
  }
  if (t === "align") {
    const s = l3Snap(e, st >= 2 && l3t.objs ? new Set(l3t.objs.map(o => o.id)) : undefined);
    if (!s) return true;
    if (st === 0) {
      const id = s.placeId || (l3.sel.size === 1 ? [...l3.sel][0] : null);
      if (!id) { l3Status("Tryck på en punkt på etableringsobjektets kant."); return true; }
      l3SelectIds([id]); l3t.objs = l3GrabAll([id]); l3t.A1 = s.point.clone(); l3t.step = 1; l3Busy(true);
      l3Status("Tryck en andra punkt längs samma kant på objektet.");
    } else if (st === 1) {
      if (Math.hypot(s.point.x - l3t.A1.x, s.point.y - l3t.A1.y) < 0.01) return true;
      l3t.A2 = s.point.clone(); l3t.step = 2;
      l3Status("Tryck första punkten på kanten objektet ska ligga mot (dit första punkten hamnar).");
    } else if (st === 2) {
      l3t.B1 = s.point.clone(); l3t.step = 3;
      l3Status("Tryck en andra punkt längs den kanten – objektet vrids så att kanterna blir parallella.");
    } else {
      if (Math.hypot(s.point.x - l3t.B1.x, s.point.y - l3t.B1.y) < 0.01) return true;
      const deg = l3Norm(l3Ang(l3t.B1, s.point) - l3Ang(l3t.A1, l3t.A2)), A1 = l3t.A1, d = l3t.B1.clone().sub(A1);
      l3Commit(p => { placeRotateAbout(p, A1.x + l3.O[0], A1.y + l3.O[1], Math.round(deg * 10) / 10); placeShift(p, d.x, d.y, d.z); });
      l3Status(`Riktat: vridet ${l3Fmt(deg, 1)}° och flyttat ${l3Fmt(d.length())} m. Tryck för att rikta igen.`);
      l3ToolCancel();
    }
    return true;
  }
  return false;
}
function l3Angle3(a, v, b) {
  const p = a.clone().sub(v), q = b.clone().sub(v), d = p.length() * q.length();
  return d ? Math.acos(Math.max(-1, Math.min(1, p.dot(q) / d))) * 180 / Math.PI : 0;
}
/* Yta i plan (vågrätt) och omkrets för en polygon. */
function l3PolyArea(pts) {
  let a = 0, per = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; per += Math.hypot(q.x - p.x, q.y - p.y); }
  return { area: Math.abs(a) / 2, per };
}
function l3FinishArea() {
  const mp = l3t.mp || [];
  if (mp.length < 3) { l3Status("Ytan behöver minst tre hörn."); return; }
  l3TmpLine(mp[mp.length - 1], mp[0], "#dc2626", false, l3.groups.meas);
  const { area, per } = l3PolyArea(mp);
  const shape = new THREE.Shape(mp.map(p => new THREE.Vector2(p.x, p.y)));
  const zAvg = mp.reduce((s, p) => s + p.z, 0) / mp.length;
  const fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  fill.position.z = zAvg + 0.02; l3.groups.meas.add(fill);
  const c = mp.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / mp.length);
  l3.measLabel = { at: c, text: `${l3Fmt(area)} m²` }; l3PlaceMeasLabel();
  l3Status(`Yta ${l3Fmt(area)} m² (i plan) · omkrets ${l3Fmt(per)} m · ${mp.length} hörn. Tryck en ny punkt för att mäta igen.`);
  l3t.mp = null; l3Busy(false); l3ShowVcb(null); l3Clear(l3.groups.tmp); l3Render();
  if (typeof l3mAdd === "function") { l3mAdd("area", mp, `${l3Fmt(area)} m²`, l3t.mpObjs); l3ClearMeasure(); } // ligger kvar
}
function l3MeasureTo(b) {
  const objs = l3t.mObjs || []; l3t.mObjs = null;
  const a = l3t.M1, d = a.distanceTo(b), hz = Math.hypot(b.x - a.x, b.y - a.y), dz = b.z - a.z;
  l3TmpLine(a, b, "#dc2626", false, l3.groups.meas); l3Dot(b, 0xdc2626, l3.groups.meas);
  l3.measLabel = { at: a.clone().add(b).multiplyScalar(0.5), text: `${l3Fmt(d)} m` };
  l3PlaceMeasLabel();
  l3Status(`Avstånd ${l3Fmt(d)} m · vågrätt ${l3Fmt(hz)} m · höjdskillnad ${l3Fmt(dz)} m. Tryck en ny punkt för att mäta igen.`);
  l3t = { ...l3t, step: 0, M1: null, lock: null, vcb: "", last: null }; l3Busy(false); l3ShowVcb(null); l3Clear(l3.groups.tmp); l3Render();
  if (typeof l3mAdd === "function") { l3mAdd("dist", [a, b], `${l3Fmt(d)} m`, objs); l3ClearMeasure(); } // ligger kvar
}
function l3MoveTo(T) {
  const d = T.clone().sub(l3t.base), n = (l3t.objs || []).length;
  if (l3t.copyMode) {
    const src = (l3t.objs || []).map(o => o.id);
    l3Restore(l3t.objs);
    placeSnapshot();
    const made = l3MakeCopies(src, [d]);
    l3.lastArray = { src, d: d.clone(), made };
    l3SelectIds(made); l3Changed();
    l3Status(`${made.length} ${made.length === 1 ? "kopia" : "kopior"} ${l3Fmt(d.length())} m bort. Skriv *5 + Enter för 5 kopior i rad, eller /5 för 5 jämnt fördelade fram till punkten.`);
    l3ToolCancel(); return;
  }
  l3Commit(p => placeShift(p, d.x, d.y, d.z));
  l3Status(`Flyttat ${n > 1 ? n + " objekt " : ""}${l3Fmt(d.length())} m (X ${l3Fmt(d.x)}, Y ${l3Fmt(d.y)}, höjd ${l3Fmt(d.z)}). Tryck en ny punkt för att flytta igen.`);
  l3ToolCancel();
}
/* Kopior av src förskjutna med varje vektor i offs (meter, scenens system). Returnerar de nya id:na. */
function l3MakeCopies(src, offs) {
  const made = [];
  offs.forEach(o => src.forEach(id => {
    const p = placements.find(x => x.id === id); if (!p) return;
    const c = JSON.parse(JSON.stringify(p));
    Object.assign(c, { id: ghNewId(), created_at: new Date().toISOString(), by: settings.userName || null });
    delete c.ifc_at;
    c.name = placeNextName(p.name);
    placeShift(c, o.x, o.y, o.z); placements.push(c); placeTouch(c); l3AddPlacementMesh(c); made.push(c.id);
  }));
  return made;
}
/* *N = N kopior i rad med samma avstånd, /N = N kopior jämnt fördelade fram till punkten (som i SketchUp). */
function l3ArrayRepeat(op, n) {
  const A = l3.lastArray;
  if (!A || !(n >= 1) || n > 200) { l3Status("Skriv t.ex. *5 eller /5 (högst 200)."); return; }
  placeSnapshot();
  const del = new Set(A.made);
  placements = placements.filter(p => !del.has(p.id));
  del.forEach(id => { placeDeleted.add(id); placeDirty.delete(id); const g = l3.placeMeshes.get(id); if (g) l3.groups.places.remove(g); l3.placeMeshes.delete(id); });
  const offs = Array.from({ length: n }, (_, i) => A.d.clone().multiplyScalar(op === "/" ? (i + 1) / n : i + 1));
  A.made = l3MakeCopies(A.src, offs);
  placeScheduleSave(); l3SelectIds(A.made); l3Changed();
  l3Status(op === "/" ? `${n} kopior jämnt fördelade (${l3Fmt(A.d.length() / n)} m isär).` : `${n} kopior i rad (${l3Fmt(A.d.length())} m isär).`);
}
function l3RotateBy(deg) {
  const C = l3t.C;
  l3Commit(p => placeRotateAbout(p, C.x + l3.O[0], C.y + l3.O[1], deg));
  l3Status(`Vridet ${l3Fmt(deg, 1)}°. Tryck en ny vridpunkt för att vrida igen.`);
  l3ToolCancel();
}

/* Tangenter: verktyg (V M Q A T), axellås (pilar), mått (siffror + Enter), Esc. true = hanterat. */
function l3ToolKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = e.key, typing = l3.tool !== "select" && l3t.step > 0;
  const label = l3.tool === "rotate" ? "Vinkel" : "Avstånd (eller dx;dy;dz)";
  // Efter en kopia med Flytta: *N eller /N + Enter.
  if (l3.tool === "move" && l3t.step === 0 && l3.lastArray && ((!l3t.vcb && /^[*x/]$/.test(k)) || (l3t.vcb && /^[0-9]$/.test(k)))) { l3t.vcb += k; l3ShowVcb("Kopior", ""); e.preventDefault(); return true; }
  if (l3.tool === "move" && l3t.step === 0 && l3t.vcb && k === "Enter") {
    const m = /^([*x/])(\d+)$/.exec(l3t.vcb); l3t.vcb = ""; l3ShowVcb(null); e.preventDefault();
    if (m) l3ArrayRepeat(m[1] === "x" ? "*" : m[1], Number(m[2])); return true;
  }
  if (l3.tool === "move" && l3t.step === 0 && l3t.vcb && k === "Backspace") { l3t.vcb = l3t.vcb.slice(0, -1); l3ShowVcb("Kopior", ""); e.preventDefault(); return true; }
  if (l3.tool === "measure" && l3Prefs().measure === "area" && k === "Enter" && (l3t.mp || []).length) { e.preventDefault(); l3FinishArea(); return true; }
  if (typing && /^[0-9]$|^[.,;\- ]$/.test(k)) { l3t.vcb += k; l3ShowVcb(label, ""); e.preventDefault(); return true; }
  if (typing && k === "Backspace" && l3t.vcb) { l3t.vcb = l3t.vcb.slice(0, -1); l3ShowVcb(label, ""); e.preventDefault(); return true; }
  if (typing && k === "Enter") {
    const v = Number(l3t.vcb.trim().replace(",", "."));
    e.preventDefault();
    const parts = l3t.vcb.trim().split(/[;\s]+/).filter(Boolean);
    if (!l3t.vcb.trim() || (parts.length < 2 && !Number.isFinite(v))) { l3t.vcb = ""; l3ShowVcb(l3.tool === "rotate" ? "Vinkel" : "Avstånd", ""); return true; }
    if ((l3.tool === "move" || l3.tool === "measure") && parts.length >= 2) {
      // Relativa koordinater från baspunkten: dx;dy;dz (som Teklas numeriska läge).
      const base = l3.tool === "move" ? l3t.base : l3t.M1, d = parts.map(x => placeNum(x, 0));
      const T = base.clone().add(new THREE.Vector3(d[0] || 0, d[1] || 0, d[2] || 0));
      l3t.vcb = "";
      if (l3.tool === "move") l3MoveTo(T); else l3MeasureTo(T);
      return true;
    }
    if (l3.tool === "move" || l3.tool === "measure") {
      const base = l3.tool === "move" ? l3t.base : l3t.M1;
      const dir = l3t.lock ? new THREE.Vector3(...L3_AX[l3t.lock].v) : l3t.last ? l3t.last.clone().sub(base) : l3.lastSnap ? l3.lastSnap.clone().sub(base) : null;
      if (!dir || dir.length() < 1e-9) { l3Status("Peka först åt det håll det ska (eller lås en axel med piltangenterna), skriv sedan avståndet."); l3t.vcb = ""; return true; }
      const ref = l3t.last || l3.lastSnap;
      if (l3t.lock && ref && ref.clone().sub(base).dot(dir) < 0) dir.negate();
      const T = base.clone().add(dir.normalize().multiplyScalar(v));
      if (l3.tool === "move") l3MoveTo(T);
      else l3MeasureTo(T);
    } else if (l3.tool === "rotate" && l3t.step === 2) l3RotateBy(v);
    return true;
  }
  if ((l3.tool === "move" || l3.tool === "measure") && l3t.step === 1 && k.startsWith("Arrow")) {
    const ax = { ArrowRight: "x", ArrowLeft: "y", ArrowUp: "z", ArrowDown: null }[k];
    l3t.lock = ax && l3t.lock !== ax ? ax : null;
    l3Status(l3t.lock ? `Låst ${L3_AX[l3t.lock].name}. Tryck dit eller skriv ett avstånd och Enter.` : "Axellåset släppt.");
    if (l3t.ev) l3ToolHover(l3t.ev);
    e.preventDefault(); return true;
  }
  if (k === "Escape") {
    if (l3.tool === "measure" && (l3t.mp || []).length) { l3t.mp = null; l3ToolCancel(); l3ClearMeasure(); l3Status(L3_MEAS_START[l3Prefs().measure || "dist"]); return true; }
    if (l3.tool === "move" && l3t.vcb) { l3t.vcb = ""; l3ShowVcb(null); return true; }
    if (l3.tool !== "select" && l3t.step > 0) { l3ToolCancel(); l3Status(L3_TOOL_START[l3.tool]); return true; }
    if (l3.tool === "measure" && l3.measLabel) { l3ClearMeasure(); return true; }
    if (l3.tool !== "select") { l3SetTool("select"); return true; }
    return false;
  }
  const map = { m: "move", q: "rotate", a: "align", t: "measure", " ": "select" };
  if (map[k.toLowerCase()] && !typing) { l3SetTool(map[k.toLowerCase()]); e.preventDefault(); return true; }
  return false;
}
