/* 3D-vyn: verktyg som i SketchUp (Victors önskemål 2026-10-08: "flytta importerade IFC-modeller
   smidigare, mer likt SketchUp"). Allt sker punkt till punkt med fästpunkter:
   - Fästpunkter: Ändpunkt (grön), Mittpunkt (turkos), På kant (röd), På yta (blå), På marken; och
     axlar från baspunkten (röd X, grön Y, blå höjd) när markören ligger längs dem.
   - Flytta (M): tryck en punkt på objektet (t.ex. ett hörn) och sedan dit den ska. Piltangenter
     låser axel (→ röd, ← grön, ↑ blå, ↓ släpp). Skriv ett avstånd + Enter för exakt längd.
   - Vrid (Q): vridpunkt, utgångsriktning, ny riktning. Fäster var 15:e grad; skriv en vinkel + Enter.
   - Rikta (A): två punkter på objektets kant och två på kanten det ska ligga mot – objektet vrids
     och flyttas så att kanterna sammanfaller (t.ex. kranfundament mot en vägg).
   Ändringarna går via place3d.js (placeShift/placeRotateAbout, ångra, sparning) precis som handtagen. */

const L3_AX = { x: { v: [1, 0, 0], col: "#dc2626", name: "på röd axel" }, y: { v: [0, 1, 0], col: "#16a34a", name: "på grön axel" }, z: { v: [0, 0, 1], col: "#2563eb", name: "på blå axel" } };
const L3_SNAP = { end: ["Ändpunkt", "#16a34a"], mid: ["Mittpunkt", "#06b6d4"], edge: ["På kant", "#dc2626"], face: ["På yta", "#2563eb"], ground: ["På marken", "#64748b"] };
let l3t = { step: 0, lock: null, vcb: "", last: null };
let l3HoverRaf = 0;

function l3ToolsInit() {
  const host = document.getElementById("v3Canvas");
  const mk = (cls) => { const d = document.createElement("div"); d.className = cls; d.style.display = "none"; host.appendChild(d); return d; };
  l3t.marker = mk("v3-snap");
  l3t.vcbEl = mk("v3-vcb");
  l3.tool = "select";
  l3.renderer.domElement.addEventListener("pointermove", e => {
    if (!l3.tool || l3.tool === "select") return;
    l3t.ev = e;
    if (!l3HoverRaf) l3HoverRaf = requestAnimationFrame(() => { l3HoverRaf = 0; if (l3t.ev) l3ToolHover(l3t.ev); });
  });
}

const L3_TOOL_START = {
  move: "Flytta: tryck på en punkt på objektet (t.ex. ett hörn) – den punkten flyttas dit du trycker härnäst.",
  rotate: "Vrid: tryck på vridpunkten (välj objektet först, eller tryck på det).",
  align: "Rikta: tryck på första punkten på objektets kant.",
  select: "",
};
function l3SetTool(t) {
  l3ToolCancel();
  l3.tool = t; l3.addType = null; l3.measure = null;
  document.querySelectorAll("[data-v3tool]").forEach(b => b.classList.toggle("on", b.dataset.v3tool === t));
  if (typeof l3RenderLib === "function") l3RenderLib();
  const g = placeActiveId && l3.placeMeshes.get(placeActiveId);
  if (t === "select" && g) l3.gizmo.attach(g); else l3.gizmo.detach();
  l3Status(L3_TOOL_START[t] || "");
  l3Render();
}

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
function l3Snap(e, excludeId) {
  const r = l3Rect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const hits = l3Ray(e, l3Surfaces(excludeId));
  if (hits.length) {
    const h = hits[0], o = h.object, pos = o.geometry.getAttribute("position");
    const placeId = l3PlaceIdOf(o);
    if (h.face && pos) {
      const W = i => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      const vs = [W(h.face.a), W(h.face.b), W(h.face.c)], sc = vs.map(l3ToScreen);
      let best = null;
      vs.forEach((v, i) => { const d = Math.hypot(sc[i].x - mx, sc[i].y - my); if (d < 14 && (!best || d < best.d)) best = { d, p: v, kind: "end" }; });
      if (!best) {
        // Kanter – utom triangelns längsta (oftast diagonalen i en rektangel, ingen riktig kant).
        const E = [[0, 1], [1, 2], [2, 0]];
        const len = E.map(([a, b]) => vs[a].distanceTo(vs[b])), skip = len.indexOf(Math.max(...len));
        E.forEach(([a, b], k) => {
          if (k === skip && o !== l3.planMesh) return;
          const m = vs[a].clone().add(vs[b]).multiplyScalar(0.5), ms = l3ToScreen(m), dm = Math.hypot(ms.x - mx, ms.y - my);
          if (dm < 12 && (!best || best.kind !== "mid" || dm < best.d)) best = { d: dm, p: m, kind: "mid" };
          if (best && best.kind === "mid") return;
          const ax = sc[b].x - sc[a].x, ay = sc[b].y - sc[a].y, l2 = ax * ax + ay * ay;
          if (!l2) return;
          const t = Math.max(0, Math.min(1, ((mx - sc[a].x) * ax + (my - sc[a].y) * ay) / l2));
          const d = Math.hypot(sc[a].x + ax * t - mx, sc[a].y + ay * t - my);
          if (d < 8 && (!best || d < best.d)) best = { d, p: vs[a].clone().lerp(vs[b], t), kind: "edge" };
        });
      }
      if (best) return { point: best.p, kind: best.kind, placeId };
    }
    return { point: h.point.clone(), kind: o === l3.planMesh ? "ground" : "face", placeId };
  }
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
function l3Target(e, base, excludeId) {
  const s = l3Snap(e, excludeId), r = l3Rect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  if (l3t.lock) {
    const v = new THREE.Vector3(...L3_AX[l3t.lock].v);
    const p = s && (s.kind === "end" || s.kind === "mid") ? base.clone().add(v.multiplyScalar(s.point.clone().sub(base).dot(v))) : l3AxisPoint(e, base, l3t.lock);
    return p ? { point: p, kind: "axis", axis: l3t.lock, locked: true } : s;
  }
  if (!s || s.kind === "end" || s.kind === "mid") return s;
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
  if (!s) { m.style.display = "none"; return; }
  const q = l3ToScreen(s.point);
  const [txt, col] = s.kind === "axis" ? [L3_AX[s.axis].name + (s.locked ? " (låst)" : ""), L3_AX[s.axis].col] : (L3_SNAP[s.kind] || ["", "#111"]);
  m.style.display = "block"; m.style.left = q.x + "px"; m.style.top = q.y + "px";
  m.style.setProperty("--c", col);
  m.innerHTML = `<i class="${s.kind}"></i><span>${txt}</span>`;
}
function l3TmpLine(a, b, color, dashed) {
  const g = new THREE.BufferGeometry().setFromPoints([a, b]);
  const mat = dashed ? new THREE.LineDashedMaterial({ color, dashSize: 0.4, gapSize: 0.25, depthTest: false }) : new THREE.LineBasicMaterial({ color, depthTest: false });
  const l = new THREE.Line(g, mat); if (dashed) l.computeLineDistances(); l.renderOrder = 10;
  l3.groups.tmp.add(l); return l;
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

// ---------------------------------------------------------------------
// Förhandsvisning av ett objekt (utan att ändra placeringen förrän man trycker)
// ---------------------------------------------------------------------
function l3Grab(id) {
  const g = l3.placeMeshes.get(id);
  return g ? { id, g, pos: g.position.clone(), rot: g.rotation.z } : null;
}
function l3Preview(o, { C = null, deg = 0, delta = null } = {}) {
  if (!o) return;
  const p = o.pos.clone();
  if (C && deg) { const t = deg * Math.PI / 180, dx = p.x - C.x, dy = p.y - C.y; p.x = C.x + dx * Math.cos(t) - dy * Math.sin(t); p.y = C.y + dx * Math.sin(t) + dy * Math.cos(t); }
  if (delta) p.add(delta);
  o.g.position.copy(p); o.g.rotation.z = o.rot + deg * Math.PI / 180;
}
function l3Restore(o) { if (o && o.g) { o.g.position.copy(o.pos); o.g.rotation.z = o.rot; } }
function l3ToolCancel() {
  if (l3t.obj) l3Restore(l3t.obj);
  l3t = { ...l3t, step: 0, lock: null, vcb: "", last: null, obj: null, base: null, C: null, R: null, A1: null, A2: null, B1: null };
  if (l3 && l3.groups) l3Clear(l3.groups.tmp);
  if (l3t.marker) l3ShowMarker(null);
  if (l3t.vcbEl) l3ShowVcb(null);
  if (l3) l3Render();
}
/* Ändringen genomförs på placeringen (meter i modellens system) och ritas om. */
function l3Commit(fn) {
  const o = l3t.obj, p = o && placements.find(x => x.id === o.id);
  if (!p) return;
  l3Restore(o);
  placeSnapshot();
  fn(p);
  placeTouch(p);
  l3RebuildOne(p);
  l3Changed();
  if (typeof l3RenderSide === "function") l3RenderSide();
}
const l3Ang = (a, b) => Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
const l3Norm = d => { d = ((d + 180) % 360 + 360) % 360 - 180; return Math.abs(d + 180) < 1e-9 ? 180 : d; };

// ---------------------------------------------------------------------
// Hovring och tryck per verktyg
// ---------------------------------------------------------------------
function l3ToolHover(e) {
  l3Clear(l3.groups.tmp);
  const t = l3.tool, st = l3t.step;
  if (t === "move") {
    if (st === 0) { l3ShowMarker(l3Snap(e)); l3ShowVcb("Avstånd", ""); }
    else {
      const s = l3Target(e, l3t.base, l3t.obj.id);
      l3ShowMarker(s);
      if (!s) return;
      l3t.last = s.point.clone();
      const delta = s.point.clone().sub(l3t.base);
      l3Preview(l3t.obj, { delta });
      l3TmpLine(l3t.base, s.point, s.kind === "axis" ? L3_AX[s.axis].col : "#111827", s.kind !== "axis");
      l3ShowVcb("Avstånd", l3Fmt(delta.length()) + " m");
    }
  } else if (t === "rotate") {
    if (st === 0) { const s = l3Snap(e); l3ShowMarker(s); if (s) l3Protractor(s.point, l3ProtR(s.point)); l3ShowVcb("Vinkel", ""); }
    else {
      const s = l3Snap(e, l3t.obj && l3t.obj.id); l3ShowMarker(s);
      const P = l3OnPlane(e, s, l3t.C);
      l3Protractor(l3t.C, l3ProtR(l3t.C));
      if (!P) return;
      if (st === 1) { l3TmpLine(l3t.C, P, "#111827", true); return; }
      const deg = l3SnapAngle(l3Norm(l3Ang(l3t.C, P) - l3Ang(l3t.C, l3t.R)), s);
      l3t.last = deg;
      l3TmpLine(l3t.C, l3t.R, "#111827", true); l3TmpLine(l3t.C, P, "#2563eb", false);
      l3Preview(l3t.obj, { C: l3t.C, deg });
      l3ShowVcb("Vinkel", l3Fmt(deg, 1) + "°");
    }
  } else if (t === "align") {
    const s = l3Snap(e, st >= 2 && l3t.obj ? l3t.obj.id : undefined); l3ShowMarker(s);
    if (!s) return;
    if (st === 1) l3TmpLine(l3t.A1, s.point, "#dc2626", false);
    if (st === 2) l3Preview(l3t.obj, { delta: s.point.clone().sub(l3t.A1) });
    if (st === 3) {
      const deg = l3Norm(l3Ang(l3t.B1, s.point) - l3Ang(l3t.A1, l3t.A2));
      l3t.last = deg;
      l3Preview(l3t.obj, { C: l3t.A1, deg, delta: l3t.B1.clone().sub(l3t.A1) });
      l3TmpLine(l3t.B1, s.point, "#dc2626", false);
    }
  }
  l3Render();
}
const l3ProtR = c => Math.max(1, c.distanceTo(l3.camera.position) * 0.08);
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
  if (t === "move") {
    if (st === 0) {
      const s = l3Snap(e);
      const id = (s && s.placeId) || placeActiveId;
      if (!s || !id) { l3Status("Tryck på ett etableringsobjekt (eller välj ett först) – den punkten är det som flyttas."); return true; }
      placeActiveId = id; l3t.obj = l3Grab(id); l3t.base = s.point.clone(); l3t.step = 1; l3t.vcb = ""; l3t.lock = null;
      l3Status("Tryck dit punkten ska. Piltangenter låser axel (→ röd, ← grön, ↑ blå, ↓ släpp). Skriv ett avstånd och tryck Enter för exakt längd. Esc avbryter.");
      if (typeof l3RenderSide === "function") l3RenderSide();
      return true;
    }
    const s = l3Target(e, l3t.base, l3t.obj.id);
    if (!s) return true;
    l3MoveTo(s.point);
    return true;
  }
  if (t === "rotate") {
    if (st === 0) {
      const s = l3Snap(e);
      const id = placeActiveId || (s && s.placeId);
      if (!s || !id) { l3Status("Tryck på objektet som ska vridas, eller välj det först med Välj."); return true; }
      placeActiveId = id; l3t.obj = l3Grab(id); l3t.C = s.point.clone(); l3t.step = 1;
      l3Status("Tryck en punkt som visar utgångsriktningen (t.ex. längs objektets kant).");
      if (typeof l3RenderSide === "function") l3RenderSide();
      return true;
    }
    const s = l3Snap(e, l3t.obj.id), P = l3OnPlane(e, s, l3t.C);
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
    const s = l3Snap(e, st >= 2 && l3t.obj ? l3t.obj.id : undefined);
    if (!s) return true;
    if (st === 0) {
      const id = s.placeId || placeActiveId;
      if (!id) { l3Status("Tryck på en punkt på etableringsobjektets kant."); return true; }
      placeActiveId = id; l3t.obj = l3Grab(id); l3t.A1 = s.point.clone(); l3t.step = 1;
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
      l3Status(`Riktat: vridet ${l3Fmt(deg, 1)}° och flyttat ${l3Fmt(d.length())} m.`);
      l3ToolCancel();
    }
    if (typeof l3RenderSide === "function") l3RenderSide();
    return true;
  }
  return false;
}
function l3MoveTo(T) {
  const d = T.clone().sub(l3t.base);
  l3Commit(p => placeShift(p, d.x, d.y, d.z));
  l3Status(`Flyttat ${l3Fmt(d.length())} m (X ${l3Fmt(d.x)}, Y ${l3Fmt(d.y)}, höjd ${l3Fmt(d.z)}). Tryck en ny punkt för att flytta igen.`);
  l3ToolCancel();
}
function l3RotateBy(deg) {
  const C = l3t.C;
  l3Commit(p => placeRotateAbout(p, C.x + l3.O[0], C.y + l3.O[1], deg));
  l3Status(`Vridet ${l3Fmt(deg, 1)}°. Tryck en ny vridpunkt för att vrida igen.`);
  l3ToolCancel();
}

/* Tangenter: verktyg (V M Q A), axellås (pilar), mått (siffror + Enter), Esc. true = hanterat. */
function l3ToolKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const k = e.key, typing = l3.tool !== "select" && l3t.step > 0;
  if (typing && /^[0-9]$|^[.,-]$/.test(k)) { l3t.vcb += k; l3ShowVcb(l3.tool === "rotate" ? "Vinkel" : "Avstånd", ""); e.preventDefault(); return true; }
  if (typing && k === "Backspace" && l3t.vcb) { l3t.vcb = l3t.vcb.slice(0, -1); l3ShowVcb(l3.tool === "rotate" ? "Vinkel" : "Avstånd", ""); e.preventDefault(); return true; }
  if (typing && k === "Enter") {
    const v = Number(l3t.vcb.replace(",", "."));
    e.preventDefault();
    if (!l3t.vcb || !Number.isFinite(v)) return true;
    if (l3.tool === "move") {
      const dir = l3t.lock ? new THREE.Vector3(...L3_AX[l3t.lock].v) : l3t.last ? l3t.last.clone().sub(l3t.base) : null;
      if (!dir || dir.length() < 1e-9) { l3Status("Peka först åt det håll objektet ska flyttas (eller lås en axel med piltangenterna), skriv sedan avståndet."); l3t.vcb = ""; return true; }
      if (l3t.lock && l3t.last && l3t.last.clone().sub(l3t.base).dot(dir) < 0) dir.negate();
      l3MoveTo(l3t.base.clone().add(dir.normalize().multiplyScalar(v)));
    } else if (l3.tool === "rotate" && l3t.step === 2) l3RotateBy(v);
    return true;
  }
  if (l3.tool === "move" && l3t.step === 1 && k.startsWith("Arrow")) {
    const ax = { ArrowRight: "x", ArrowLeft: "y", ArrowUp: "z", ArrowDown: null }[k];
    l3t.lock = ax && l3t.lock !== ax ? ax : null;
    l3Status(l3t.lock ? `Låst ${L3_AX[l3t.lock].name}. Tryck dit eller skriv ett avstånd och Enter.` : "Axellåset släppt.");
    if (l3t.ev) l3ToolHover(l3t.ev);
    e.preventDefault(); return true;
  }
  if (k === "Escape") {
    if (l3.tool !== "select" && l3t.step > 0) { l3ToolCancel(); l3Status(L3_TOOL_START[l3.tool]); return true; }
    if (l3.tool !== "select") { l3SetTool("select"); return true; }
    return false;
  }
  const map = { m: "move", q: "rotate", a: "align", v: "select", " ": "select" };
  if (map[k.toLowerCase()] && !typing) { l3SetTool(map[k.toLowerCase()]); e.preventDefault(); return true; }
  return false;
}
