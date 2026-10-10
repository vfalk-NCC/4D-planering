/* 3D-vyn – redigera DXF (Victor 2026-10-10: "DXF-redigeringen där man ska kunna redigera och välja
   linjer, också rita in egna linjer" och "utveckla": hörnpunkter, vrida, texter).

   Lager → 2D-lager och DXF → pennan vid en DXF startar redigeringen:
   – Tryck på en linje eller text markerar den (Skift/Ctrl/Flera lägger till), markeringsfönster som för
     objekt (vänster -> höger: hela i rutan, höger -> vänster: allt som rutan nuddar).
   – Hörnpunkter: en markerad linjes hörn visas som lila punkter – dra i dem (fäster mot andra
     ändpunkter, Skift = var 5:e grad). Alt + tryck på en markerad linje lägger till en punkt, Alt + tryck
     på en hörnpunkt tar bort den.
   – Flytta (dX/dY eller piltangenterna), vrid (grader, eller , och . ett steg) runt markeringens mitt,
     kopiera, byt lager, ta bort (Delete).
   – Texter: ändra innehåll, höjd och vinkel i panelen; Ny text sätter en text där man trycker.
   – Rita linje: tryck punkt för punkt (fäster mot ändpunkter, Skift = var 5:e grad), Enter eller
     dubbelklick avslutar, Esc avbryter.
   – Ctrl+Z / Ctrl+Y ångrar och gör om.
   – Spara som ny DXF: en ny fil (namn med datum och klockslag) i Trimble Connect och ett nytt CAD-lager
     i lägesplanen; originalet ändras aldrig – det släcks bara. */

const l3d = { rec: null, ents: [], texts: [], sel: new Set(), draw: null, dirty: false, mesh: null, selMesh: null, selPts: null, prev: null, tmeshes: [], tver: 0, tbuilt: -1, layer: "", newLayers: new Map(), next: 1, dx: "", dy: "", rot: "", grip: null };
const L3D_NEW_COLOR = "#e11d48";

function l3dLayerColor(name, orig) {
  if (l3d.newLayers.has(name)) return l3d.newLayers.get(name);
  return cadLayerColor(l3d.rec, name, orig);
}
const l3dLayerOn = name => l3d.newLayers.has(name) || cadLayerOn(l3d.rec, name);
const l3dZ = () => (typeof l3sZ === "function" ? l3sZ() : 0) + 0.035;
const l3dIsText = x => x && x.isText;

async function l3dStart(id) {
  if (l3d.rec) { if (l3d.rec.id === id) return; if (!(await l3dEnd())) return; }
  const rec = cads().find(r => r.id === id);
  if (!rec) return;
  if (!ls("cad:" + id).visible) setLayersVisible(["cad:" + id], true);
  const g = await ensureCadGeom(rec);
  const names = rec.layers.map(l => l.name);
  l3d.ents = []; l3d.texts = []; l3d.sel = new Set(); l3d.newLayers = new Map(); l3d.next = 1; l3d.dirty = false; l3d.draw = null; l3d.tver++;
  g.groups.forEach(gr => {
    const layer = names[gr.l];
    (gr.raw || []).forEach(a => {
      const pts = [];
      for (let j = 0; j + 1 < a.length; j += 2) pts.push([g.origin[0] + a[j] / 1000, g.origin[1] + a[j + 1] / 1000]);
      if (pts.length > 1) l3d.ents.push({ id: l3d.next++, layer, color: gr.c, pts });
    });
    (gr.texts || []).forEach(t => l3d.texts.push({ id: "t" + l3d.next++, isText: true, layer, color: gr.c, x: g.origin[0] + t[0] / 1000, y: g.origin[1] + t[1] / 1000, h: t[2] / 1000, rot: t[3] || 0, s: String(t[4] || ""), al: t[5] || "lb" }));
  });
  l3d.rec = rec; l3d.layer = names[0] || "0";
  if (typeof l3bsClear === "function") l3bsClear();
  l3SelectIds([]);
  l3sBuildCad(); // döljer originalets linjer och texter medan redigeringen pågår
  l3dRebuild();
  l3RenderSide();
  l3Status(`Redigerar ${rec.name}: tryck på en linje eller text för att markera, dra i hörnpunkterna, Rita linje eller Ny text för nytt.`);
}
/* Avsluta (frågar om osparade ändringar). Returnerar false om man ångrade sig. */
async function l3dEnd(force) {
  if (!l3d.rec) return true;
  if (!force && l3d.dirty && !(await uiConfirm(`Avsluta redigeringen av ${l3d.rec.name} utan att spara? Ändringarna försvinner (originalet är orört).`, { ok: "Avsluta utan att spara" }))) return false;
  l3dStopDraw();
  [l3d.mesh, l3d.selMesh, l3d.selPts, l3d.prev].forEach(o => { if (o) { if (o.parent) o.parent.remove(o); o.geometry.dispose(); o.material.dispose(); } });
  l3sDisposeMeshes(l3d.tmeshes); l3d.tmeshes = []; l3d.tbuilt = -1;
  l3d.mesh = l3d.selMesh = l3d.selPts = l3d.prev = null;
  l3d.rec = null; l3d.ents = []; l3d.texts = []; l3d.sel = new Set(); l3d.dirty = false;
  l3sRefresh(0);
  l3RenderSide();
  l3Render();
  return true;
}

/* ---- Ritning ------------------------------------------------------------------------------------ */
function l3dSegs(list, withColor) {
  let n = 0;
  list.forEach(e => { n += e.closed ? e.pts.length : e.pts.length - 1; });
  const pos = new Float32Array(n * 6), col = withColor ? new Float32Array(n * 6) : null, c = new THREE.Color();
  let k = 0;
  list.forEach(e => {
    if (withColor) c.set(e.color && l3d.newLayers.has(e.layer) ? e.color : l3dLayerColor(e.layer, e.color));
    const P = e.closed ? [...e.pts, e.pts[0]] : e.pts;
    for (let j = 1; j < P.length; j++) {
      const a = P[j - 1], b = P[j];
      if (col) { col.set([c.r, c.g, c.b, c.r, c.g, c.b], k); }
      pos[k++] = a[0] - l3.O[0]; pos[k++] = a[1] - l3.O[1]; pos[k++] = 0;
      pos[k++] = b[0] - l3.O[0]; pos[k++] = b[1] - l3.O[1]; pos[k++] = 0;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  if (col) g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
const l3dLiveTexts = () => l3d.texts.filter(t => !t.del && l3dLayerOn(t.layer));
function l3dRebuild() {
  if (!l3d.rec) return;
  const grp = l3sGroup("cad"), z = l3dZ();
  const vis = l3d.ents.filter(e => !e.del && l3dLayerOn(e.layer));
  if (!l3d.mesh) {
    l3d.mesh = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
    l3d.mesh.userData.noHit = true; l3d.mesh.raycast = () => {}; l3d.mesh.renderOrder = 2; grp.add(l3d.mesh);
  }
  l3d.mesh.geometry.dispose(); l3d.mesh.geometry = l3dSegs(vis, true); l3d.mesh.position.z = z;
  // Texterna byggs om bara när de ändrats (atlasen tar en stund för många texter).
  if (l3d.tbuilt !== l3d.tver) {
    l3sDisposeMeshes(l3d.tmeshes);
    const list = [];
    l3dLiveTexts().forEach(t => list.push(...l3sTextLines(t, new THREE.Color(l3dLayerColor(t.layer, t.color)))));
    l3d.tmeshes = l3sTextMeshes(list, z + 0.003);
    l3d.tmeshes.forEach(m => grp.add(m));
    l3d.tbuilt = l3d.tver;
  }
  // Markerade: lila linjer ovanpå allt, punkter i linjernas hörn och en ram runt markerade texter.
  const sel = vis.filter(e => l3d.sel.has(e.id));
  if (!l3d.selMesh) {
    l3d.selMesh = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x6d5efc, depthTest: false, transparent: true }));
    l3d.selPts = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0x6d5efc, size: 9, sizeAttenuation: false, depthTest: false }));
    [l3d.selMesh, l3d.selPts].forEach(o => { o.userData.noHit = true; o.raycast = () => {}; o.renderOrder = 9; grp.add(o); });
  }
  const quads = [];
  l3dLiveTexts().filter(t => l3d.sel.has(t.id)).forEach(t => l3dTextQuads(t).forEach(q => quads.push({ pts: q, closed: true })));
  l3d.selMesh.geometry.dispose(); l3d.selMesh.geometry = l3dSegs([...sel, ...quads], false); l3d.selMesh.position.z = z;
  const pp = []; sel.forEach(e => e.pts.forEach(p => pp.push(p[0] - l3.O[0], p[1] - l3.O[1], 0)));
  const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.Float32BufferAttribute(pp, 3));
  l3d.selPts.geometry.dispose(); l3d.selPts.geometry = pg; l3d.selPts.position.z = z;
  l3Render();
}
/* En texts rutor (en per rad) i modellens meter. */
function l3dTextQuads(t) { return l3sTextLines(t, null).map(l => l3sTextQuad(l)); }

/* ---- Skärm <-> modell -------------------------------------------------------------------------- */
function l3dScreen() {
  const r = l3.renderer.domElement.getBoundingClientRect();
  l3.camera.updateMatrixWorld();
  const PM = new THREE.Matrix4().multiplyMatrices(l3.camera.projectionMatrix, l3.camera.matrixWorldInverse), v = new THREE.Vector3(), z = l3dZ();
  return { r, proj: p => { v.set(p[0] - l3.O[0], p[1] - l3.O[1], z).applyMatrix4(PM); return v.z > 1 || v.z < -1 ? null : [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height]; } };
}
function l3dInPoly(q, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if (a && b && ((a[1] > q[1]) !== (b[1] > q[1])) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins; }
  return ins;
}
/* Linjen (inom 8 px) eller texten under markören. Linjer går före (de är smala). */
function l3dHit(e) {
  const { r, proj } = l3dScreen(), mx = e.clientX - r.left, my = e.clientY - r.top;
  let best = null, bd = 8;
  l3d.ents.forEach(en => {
    if (en.del || !l3dLayerOn(en.layer)) return;
    let a = proj(en.pts[0]);
    for (let j = 1; j < en.pts.length; j++) {
      const b = proj(en.pts[j]);
      if (a && b) {
        const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((mx - a[0]) * dx + (my - a[1]) * dy) / L)) : 0;
        const d = Math.hypot(a[0] + t * dx - mx, a[1] + t * dy - my);
        if (d < bd) { bd = d; best = en; }
      }
      a = b;
    }
  });
  if (best && bd < 4) return best;
  const txt = l3dLiveTexts().find(t => l3dTextQuads(t).some(q => l3dInPoly([mx, my], q.map(proj))));
  return txt || best;
}
/* Hörnpunkt på en markerad linje under markören (inom 9 px): { en, i }. */
function l3dVertexAt(e) {
  const { r, proj } = l3dScreen(), mx = e.clientX - r.left, my = e.clientY - r.top;
  let best = null, bd = 9;
  l3dSelEnts().slice(0, 500).forEach(en => en.pts.forEach((p, i) => { const q = proj(p); if (q) { const d = Math.hypot(q[0] - mx, q[1] - my); if (d < bd) { bd = d; best = { en, i }; } } }));
  return best;
}
/* Punkt på marken under markören; fäster mot ändpunkter (10 px) och Skift = var 5:e grad från förra punkten. */
function l3dGround(e, from, skip) {
  const { r, proj } = l3dScreen(), mx = e.clientX - r.left, my = e.clientY - r.top;
  let best = null, bd = 10;
  l3d.ents.forEach(en => { if (en.del || !l3dLayerOn(en.layer)) return; en.pts.forEach((p, i) => { if ((i !== 0 && i !== en.pts.length - 1 && !(skip && skip.en === en)) || (skip && skip.en === en && skip.i === i)) return; const q = proj(p); if (q) { const d = Math.hypot(q[0] - mx, q[1] - my); if (d < bd) { bd = d; best = p; } } }); });
  if (l3d.draw && l3d.draw.pts) l3d.draw.pts.forEach(p => { const q = proj(p); if (q) { const d = Math.hypot(q[0] - mx, q[1] - my); if (d < bd) { bd = d; best = p; } } });
  if (best && !e.shiftKey) return { p: [best[0], best[1]], snap: "end" };
  const rc = new THREE.Raycaster();
  rc.setFromCamera(new THREE.Vector2(mx / r.width * 2 - 1, -(my / r.height) * 2 + 1), l3.camera);
  const hit = rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -l3dZ()), new THREE.Vector3());
  if (!hit) return null;
  let p = [hit.x + l3.O[0], hit.y + l3.O[1]];
  if (from && e.shiftKey) {
    const d = Math.hypot(p[0] - from[0], p[1] - from[1]), a = Math.round(Math.atan2(p[1] - from[1], p[0] - from[0]) / (Math.PI / 36)) * (Math.PI / 36);
    p = [from[0] + d * Math.cos(a), from[1] + d * Math.sin(a)];
  }
  return { p };
}

/* ---- Dra i en hörnpunkt (anropas först när musknappen trycks ned i 3D-vyn) ------------------------- */
function l3dGripDown(e) {
  if (!l3d.rec || l3d.draw || e.button !== 0 || l3.tool !== "select" || !l3d.sel.size) return false;
  const v = l3dVertexAt(e);
  if (!v) return false;
  e.preventDefault(); e.stopPropagation();
  if (e.altKey) { l3dRemoveVertex(v.en, v.i); return true; }
  const old = v.en.pts.map(p => p.slice()), orbitWas = l3.orbit.enabled;
  l3.orbit.enabled = false;
  l3d.grip = { v, moved: false };
  let raf = 0;
  const neighbour = () => v.en.pts[v.i > 0 ? v.i - 1 : 1];
  const mv = ev => {
    const g = l3dGround(ev, neighbour(), v);
    if (!g) return;
    v.en.pts[v.i] = g.p; l3d.grip.moved = true;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; l3dRebuild(); });
    l3StatusLive(`Hörnpunkt: ${l3dLen(v.en.pts).toFixed(2).replace(".", ",")} m linje${g.snap ? " – fäst mot ändpunkt" : ""}${ev.shiftKey ? " (Skift: var 5:e grad)" : ""}`);
  };
  const up = () => {
    window.removeEventListener("pointermove", mv, true); window.removeEventListener("pointerup", up, true);
    l3.orbit.enabled = orbitWas;
    const moved = l3d.grip && l3d.grip.moved; l3d.grip = null;
    if (!moved) return;
    const now = v.en.pts.map(p => p.slice());
    l3dOp("flytta hörnpunkt", () => { v.en.pts = now.map(p => p.slice()); }, () => { v.en.pts = old.map(p => p.slice()); });
    l3d.suppressTap = Date.now();
    l3Status("Hörnpunkten flyttad (Ctrl+Z ångrar).");
  };
  window.addEventListener("pointermove", mv, true); window.addEventListener("pointerup", up, true);
  return true;
}
function l3dRemoveVertex(en, i) {
  if (en.pts.length <= 2) { l3Status("En linje behöver minst två punkter – ta bort hela linjen med Delete.", true); return; }
  const old = en.pts.map(p => p.slice());
  l3dOp("ta bort hörnpunkt", () => { en.pts = old.filter((_, j) => j !== i).map(p => p.slice()); }, () => { en.pts = old.map(p => p.slice()); });
  l3d.suppressTap = Date.now();
  l3Status("Hörnpunkten borttagen.");
}
function l3dInsertVertex(en, e) {
  const { r, proj } = l3dScreen(), mx = e.clientX - r.left, my = e.clientY - r.top;
  let best = null;
  for (let j = 1; j < en.pts.length; j++) {
    const a = proj(en.pts[j - 1]), b = proj(en.pts[j]); if (!a || !b) continue;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((mx - a[0]) * dx + (my - a[1]) * dy) / L)) : 0;
    const d = Math.hypot(a[0] + t * dx - mx, a[1] + t * dy - my);
    if (!best || d < best.d) best = { d, j, t };
  }
  if (!best) return;
  const A = en.pts[best.j - 1], B = en.pts[best.j], P = [A[0] + (B[0] - A[0]) * best.t, A[1] + (B[1] - A[1]) * best.t];
  const old = en.pts.map(p => p.slice());
  l3dOp("ny hörnpunkt", () => { en.pts = [...old.slice(0, best.j), P, ...old.slice(best.j)].map(p => p.slice()); }, () => { en.pts = old.map(p => p.slice()); });
  l3Status("Hörnpunkt tillagd – dra i den.");
}

/* ---- Tryck, ruta, tangenter (anropas från 3D-vyn) --------------------------------------------- */
function l3dTap(e) {
  if (!l3d.rec || l3.tool !== "select") return false;
  if (l3d.suppressTap && Date.now() - l3d.suppressTap < 400) { l3d.suppressTap = 0; return true; }
  if (l3d.draw && l3d.draw.text) { l3dPlaceText(e); return true; }
  if (l3d.draw) {
    const pts = l3d.draw.pts, g = l3dGround(e, pts[pts.length - 1]);
    if (!g) return true;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(g.p[0] - last[0], g.p[1] - last[1]) < 1e-6) { l3dFinishLine(); return true; } // samma punkt två gånger = klar
    pts.push(g.p);
    l3dPreview(null);
    l3Status(`Rita linje: ${pts.length} punkter${pts.length > 1 ? `, ${l3dLen(pts).toFixed(2).replace(".", ",")} m` : ""}. Enter eller dubbelklick avslutar, Esc avbryter.`);
    return true;
  }
  const en = l3dHit(e);
  // Alt + tryck på en markerad linje: ny hörnpunkt där.
  if (e.altKey && en && !l3dIsText(en) && l3d.sel.has(en.id)) { l3dInsertVertex(en, e); return true; }
  const add = e.shiftKey || e.ctrlKey || e.metaKey || !!l3.multi;
  if (!add) l3d.sel = new Set();
  if (en) { if (add && l3d.sel.has(en.id)) l3d.sel.delete(en.id); else l3d.sel.add(en.id); }
  l3dRebuild(); l3RenderSide();
  return true;
}
function l3dRect(a) {
  if (!l3d.rec) return false;
  if (l3d.draw) return true; // ritar: ingen ruta
  const { r, proj } = l3dScreen();
  const L = Math.min(a.x0, a.x1) - r.left, R = Math.max(a.x0, a.x1) - r.left, T = Math.min(a.y0, a.y1) - r.top, B = Math.max(a.y0, a.y1) - r.top, cross = a.x1 < a.x0;
  const inR = q => q && q[0] >= L && q[0] <= R && q[1] >= T && q[1] <= B;
  const segHit = (p, q) => { if (!p || !q) return false; let t0 = 0, t1 = 1; const dx = q[0] - p[0], dy = q[1] - p[1];
    const clip = (pp, qq) => { if (pp === 0) return qq >= 0; const t = qq / pp; if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } return true; };
    return clip(-dx, p[0] - L) && clip(dx, R - p[0]) && clip(-dy, p[1] - T) && clip(dy, B - p[1]); };
  if (!a.add && !a.toggle) l3d.sel = new Set();
  const take = id => { if (a.toggle && l3d.sel.has(id)) l3d.sel.delete(id); else l3d.sel.add(id); };
  l3d.ents.forEach(en => {
    if (en.del || !l3dLayerOn(en.layer)) return;
    const qs = en.pts.map(proj);
    if (cross ? qs.some((q, i) => inR(q) || (i && segHit(qs[i - 1], q))) : qs.every(inR)) take(en.id);
  });
  l3dLiveTexts().forEach(t => {
    const qs = l3dTextQuads(t).flat().map(proj);
    const hit = cross ? qs.some((q, i) => inR(q) || (i % 4 && segHit(qs[i - 1], q))) || l3dTextQuads(t).some(q => l3dInPoly([L, T], q.map(proj))) : qs.every(inR);
    if (hit) take(t.id);
  });
  l3dRebuild(); l3RenderSide();
  const nl = l3dSelEnts().length, nt = l3dSelTexts().length;
  l3Status(`${nl} linjer${nt ? ` och ${nt} texter` : ""} markerade (${cross ? "allt som rutan nuddar" : "hela i rutan"}).`);
  return true;
}
function l3dKey(e) {
  if (!l3d.rec) return false;
  if (e.key === "Escape") { if (l3d.draw && l3d.draw.pts && l3d.draw.pts.length) { l3d.draw.pts = []; l3dPreview(null); l3Status("Linjen avbröts."); } else if (l3d.draw) l3dStopDraw(); else if (l3d.sel.size) { l3d.sel = new Set(); l3dRebuild(); l3RenderSide(); } else l3dEnd(); return true; }
  if (e.key === "Enter" && l3d.draw && l3d.draw.pts) { l3dFinishLine(); return true; }
  if ((e.key === "Delete" || e.key === "Backspace") && l3d.sel.size) { e.preventDefault(); l3dDelete(); return true; }
  const st = (typeof l3StepVal === "function" ? l3StepVal() : 0.1) || 0.1, m = e.shiftKey ? 10 : 1;
  const d = { ArrowLeft: [-st * m, 0], ArrowRight: [st * m, 0], ArrowUp: [0, st * m], ArrowDown: [0, -st * m] }[e.key];
  if (d && l3d.sel.size) { e.preventDefault(); l3dMove(d[0], d[1]); return true; }
  // , och . vrider ett steg (15°, Skift 1°) – som för etableringsobjekten.
  if ((e.key === "," || e.key === ".") && l3d.sel.size && !e.ctrlKey && !e.metaKey) { e.preventDefault(); l3dRotate((e.key === "," ? 1 : -1) * (e.shiftKey ? 1 : 15)); return true; }
  return false;
}

/* ---- Rita linje och ny text -------------------------------------------------------------------- */
function l3dLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }
function l3dStartDraw(text) {
  if (!l3d.rec) return;
  l3dStopDraw();
  l3d.draw = text ? { text: true } : { pts: [] };
  l3d.sel = new Set();
  const el = l3.renderer.domElement;
  l3d.onMove = ev => { if (l3d.draw && l3d.draw.pts && l3d.draw.pts.length) { const g = l3dGround(ev, l3d.draw.pts[l3d.draw.pts.length - 1]); l3dPreview(g && g.p); } };
  l3d.onDbl = ev => { if (l3d.draw && l3d.draw.pts) { ev.preventDefault(); l3dFinishLine(); } };
  el.addEventListener("pointermove", l3d.onMove); el.addEventListener("dblclick", l3d.onDbl);
  el.style.cursor = text ? "text" : "crosshair";
  l3dRebuild(); l3RenderSide();
  l3Status(text ? "Ny text: tryck där texten ska stå (vänster underkant). Esc avbryter." : "Rita linje: tryck punkt för punkt (fäster mot ändpunkter, Skift = var 5:e grad). Enter eller dubbelklick avslutar, Esc avbryter.");
}
function l3dStopDraw() {
  if (!l3d.draw) return;
  const el = l3.renderer && l3.renderer.domElement;
  if (el) { el.removeEventListener("pointermove", l3d.onMove); el.removeEventListener("dblclick", l3d.onDbl); el.style.cursor = ""; }
  l3d.draw = null; l3dPreview(null);
  l3RenderSide();
}
function l3dPreview(cursor) {
  const pts = l3d.draw && l3d.draw.pts ? l3d.draw.pts.concat(cursor ? [cursor] : []) : [];
  if (!l3d.prev) {
    l3d.prev = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xe11d48, depthTest: false, transparent: true }));
    l3d.prev.userData.noHit = true; l3d.prev.raycast = () => {}; l3d.prev.renderOrder = 10; l3sGroup("cad").add(l3d.prev);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts.flatMap(p => [p[0] - l3.O[0], p[1] - l3.O[1], 0]), 3));
  l3d.prev.geometry.dispose(); l3d.prev.geometry = g; l3d.prev.position.z = l3dZ();
  l3Render();
}
function l3dFinishLine() {
  const pts = l3d.draw && l3d.draw.pts ? l3d.draw.pts.slice() : [];
  if (l3d.draw && l3d.draw.pts) l3d.draw.pts = [];
  l3dPreview(null);
  if (pts.length < 2) { l3Status("En linje behöver minst två punkter."); return; }
  const en = { id: l3d.next++, layer: l3d.layer, color: l3dLayerColor(l3d.layer), pts, added: true };
  l3dOp("ny linje", () => { l3d.ents.push(en); }, () => { const i = l3d.ents.indexOf(en); if (i >= 0) l3d.ents.splice(i, 1); l3d.sel.delete(en.id); });
  l3Status(`Linje ritad (${l3dLen(pts).toFixed(2).replace(".", ",")} m) på lagret ${l3d.layer}. Fortsätt rita eller Esc.`);
}
async function l3dPlaceText(e) {
  const g = l3dGround(e); if (!g) return;
  const s = ((await uiPrompt("Text:", "")) || "").trim();
  if (!s) return;
  const last = l3d.texts.filter(t => !t.del).slice(-1)[0];
  const t = { id: "t" + l3d.next++, isText: true, layer: l3d.layer, color: l3dLayerColor(l3d.layer), x: g.p[0], y: g.p[1], h: last ? last.h : 0.5, rot: 0, s, al: "lb", added: true };
  l3dOp("ny text", () => { l3d.texts.push(t); l3d.sel = new Set([t.id]); }, () => { l3d.texts = l3d.texts.filter(x => x !== t); l3d.sel.delete(t.id); }, true);
  l3Status(`Text "${s}" tillagd på lagret ${l3d.layer} – ändra höjd och vinkel i panelen.`);
}

/* ---- Ändringar (med ångra/gör om) ------------------------------------------------------------- */
function l3dOp(label, redo, undo, texts) {
  const bump = () => { if (texts) l3d.tver++; };
  redo(); bump();
  l3d.dirty = true; l3dRebuild(); l3RenderSide();
  if (typeof l3VPush === "function") l3VPush(() => { if (!l3d.rec) return; undo(); bump(); l3d.dirty = true; l3dRebuild(); l3RenderSide(); }, () => { if (!l3d.rec) return; redo(); bump(); l3d.dirty = true; l3dRebuild(); l3RenderSide(); }, label);
}
const l3dSelEnts = () => l3d.ents.filter(e => l3d.sel.has(e.id) && !e.del);
const l3dSelTexts = () => l3d.texts.filter(t => l3d.sel.has(t.id) && !t.del);
const l3dSelCount = () => { const a = l3dSelEnts().length, b = l3dSelTexts().length; return [a, b, `${a ? `${a} ${a === 1 ? "linje" : "linjer"}` : ""}${a && b ? " och " : ""}${b ? `${b} ${b === 1 ? "text" : "texter"}` : ""}`]; };
function l3dDelete() {
  const list = l3dSelEnts(), tl = l3dSelTexts(); if (!list.length && !tl.length) return;
  const [, , what] = l3dSelCount();
  l3dOp(`ta bort ${what}`, () => { list.forEach(e => { e.del = true; }); tl.forEach(t => { t.del = true; }); l3d.sel = new Set(); }, () => { list.forEach(e => { e.del = false; }); tl.forEach(t => { t.del = false; }); l3d.sel = new Set([...list, ...tl].map(e => e.id)); }, tl.length > 0);
  l3Status(`${what} borttagna (Ctrl+Z ångrar).`);
}
function l3dMove(dx, dy) {
  const list = l3dSelEnts(), tl = l3dSelTexts(); if ((!list.length && !tl.length) || (!dx && !dy)) return;
  const sh = s => { list.forEach(e => { e.pts = e.pts.map(p => [p[0] + s * dx, p[1] + s * dy]); }); tl.forEach(t => { t.x += s * dx; t.y += s * dy; }); };
  const [, , what] = l3dSelCount();
  l3dOp(`flytta ${what}`, () => sh(1), () => sh(-1), tl.length > 0);
  l3Status(`${what} flyttade ${String(Math.round(dx * 1000) / 1000).replace(".", ",")} / ${String(Math.round(dy * 1000) / 1000).replace(".", ",")} m.`);
}
/* Vrid de markerade deg grader (moturs) runt markeringens mitt. */
function l3dRotate(deg) {
  const list = l3dSelEnts(), tl = l3dSelTexts(); if ((!list.length && !tl.length) || !deg) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const ext = p => { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; };
  list.forEach(e => e.pts.forEach(ext)); tl.forEach(t => ext([t.x, t.y]));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const turn = d => { const a = d * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), R = p => [cx + (p[0] - cx) * c - (p[1] - cy) * s, cy + (p[0] - cx) * s + (p[1] - cy) * c];
    list.forEach(e => { e.pts = e.pts.map(R); }); tl.forEach(t => { const q = R([t.x, t.y]); t.x = q[0]; t.y = q[1]; t.rot = ((t.rot || 0) + d) % 360; }); };
  const [, , what] = l3dSelCount();
  l3dOp(`vrid ${what} ${deg}°`, () => turn(deg), () => turn(-deg), tl.length > 0);
  l3Status(`${what} vridna ${String(deg).replace(".", ",")}° runt markeringens mitt.`);
}
function l3dCopy(dx, dy) {
  const list = l3dSelEnts(), tl = l3dSelTexts(); if (!list.length && !tl.length) return;
  const copies = list.map(e => ({ id: l3d.next++, layer: e.layer, color: e.color, pts: e.pts.map(p => [p[0] + dx, p[1] + dy]), added: true }));
  const tcopies = tl.map(t => ({ ...t, id: "t" + l3d.next++, x: t.x + dx, y: t.y + dy, added: true }));
  l3dOp(`kopiera`, () => { l3d.ents.push(...copies); l3d.texts.push(...tcopies); l3d.sel = new Set([...copies, ...tcopies].map(e => e.id)); }, () => { const s = new Set([...copies, ...tcopies]); l3d.ents = l3d.ents.filter(e => !s.has(e)); l3d.texts = l3d.texts.filter(e => !s.has(e)); l3d.sel = new Set([...list, ...tl].map(e => e.id)); }, tcopies.length > 0);
}
function l3dSetLayer(name) {
  const list = [...l3dSelEnts(), ...l3dSelTexts()]; if (!list.length) return;
  const old = list.map(e => [e, e.layer, e.color]), col = l3dLayerColor(name);
  l3dOp(`byt lager till ${name}`, () => list.forEach(e => { e.layer = name; if (l3d.newLayers.has(name)) e.color = col; }), () => old.forEach(([e, l, c]) => { e.layer = l; e.color = c; }), true);
}
/* Ändra en eller flera texter: innehåll (bara en markerad), höjd, vinkel. */
function l3dEditTexts(patch) {
  const tl = l3dSelTexts(); if (!tl.length) return;
  const old = tl.map(t => [t, t.s, t.h, t.rot]);
  l3dOp("ändra text", () => tl.forEach(t => { if (patch.s != null && tl.length === 1) t.s = patch.s; if (patch.h > 0) t.h = patch.h; if (patch.rot != null && Number.isFinite(patch.rot)) t.rot = patch.rot; }), () => old.forEach(([t, s, h, r]) => { t.s = s; t.h = h; t.rot = r; }), true);
}
async function l3dNewLayer() {
  const name = ((await uiPrompt("Namn på det nya lagret:", "4D-RITAT")) || "").trim().replace(/[<>/\\":;?*|=,]/g, "_");
  if (!name) return null;
  if (!l3d.rec.layers.some(l => l.name === name)) l3d.newLayers.set(name, L3D_NEW_COLOR);
  return name;
}

/* ---- Panelen ------------------------------------------------------------------------------------ */
function l3dRenderSide(side) {
  const esc = escHtml, I = L3_ICO, rec = l3d.rec, [nl, nt, what] = l3dSelCount(), n = nl + nt;
  const layers = [...rec.layers.map(l => l.name), ...l3d.newLayers.keys()];
  const opts = cur => layers.map(l => `<option value="${esc(l)}" ${l === cur ? "selected" : ""}>${esc(l)}</option>`).join("") + `<option value="__new">＋ Nytt lager…</option>`;
  const live = l3d.ents.filter(e => !e.del).length, liveT = l3d.texts.filter(t => !t.del).length;
  const one = nt === 1 ? l3dSelTexts()[0] : null, fmt = v => String(Math.round(v * 1000) / 1000).replace(".", ",");
  side.dataset.id = "dxf";
  side.innerHTML = `<div class="v3-side-h"><i class="v3-chip" style="background:#e11d48"></i><b title="${esc(rec.name)}">Redigerar ${esc(rec.name)}</b><button type="button" class="v3-x" id="v3DxEnd" title="Avsluta redigeringen (Esc)">✕</button></div>
    <div class="v3-sub">${live} linjer · ${liveT} texter${l3d.dirty ? " · <b>ändrad</b>" : ""}</div>
    <div class="v3-acts">
      <button type="button" class="v3-act ${l3d.draw ? "" : "on"}" id="v3DxSel" title="Välj linjer och texter: tryck, Skift lägger till, dra en ruta">${I.select}<span>Välj</span></button>
      <button type="button" class="v3-act ${l3d.draw && l3d.draw.pts ? "on" : ""}" id="v3DxDraw" title="Rita egna linjer punkt för punkt">${I.edit}<span>Rita linje</span></button>
      <button type="button" class="v3-act ${l3d.draw && l3d.draw.text ? "on" : ""}" id="v3DxText" title="Ny text där du trycker">T<span>Ny text</span></button>
    </div>
    <label class="v3-dx-row">Nytt på lagret <select id="v3DxLayer">${opts(l3d.layer)}</select></label>
    ${n ? `<div class="v3-dx-sel"><b>${what} markerade</b>
      <div class="v3-dx-move"><label>dX <input type="text" inputmode="decimal" id="v3DxX" value="${esc(l3d.dx)}" placeholder="0" /></label><label>dY <input type="text" inputmode="decimal" id="v3DxY" value="${esc(l3d.dy)}" placeholder="0" /></label><span>m</span></div>
      <div class="v3-acts">
        <button type="button" class="v3-act" id="v3DxMove" title="Flytta de markerade dX/dY meter (piltangenterna flyttar ett steg)">${I.move}<span>Flytta</span></button>
        <button type="button" class="v3-act" id="v3DxCopy" title="Kopiera de markerade dX/dY meter">${I.copy}<span>Kopiera</span></button>
        <button type="button" class="v3-act bad" id="v3DxDel" title="Ta bort de markerade (Delete)">${I.trash}<span>Ta bort</span></button>
      </div>
      <div class="v3-dx-move"><label>Vrid <input type="text" inputmode="decimal" id="v3DxR" value="${esc(l3d.rot)}" placeholder="90" /></label><span>°</span><button type="button" class="v3-act" id="v3DxRot" title="Vrid de markerade moturs runt markeringens mitt (, och . vrider 15°, med Skift 1°)">${I.rotate}<span>Vrid</span></button></div>
      ${nt ? `<div class="v3-dx-text">${one ? `<label>Text <textarea id="v3DxTs" rows="2">${esc(one.s)}</textarea></label>` : ""}
        <div class="v3-dx-move"><label>Höjd <input type="text" inputmode="decimal" id="v3DxTh" value="${one ? fmt(one.h) : ""}" placeholder="${one ? "" : "oförändrad"}" /></label><span>m</span><label>Vinkel <input type="text" inputmode="decimal" id="v3DxTr" value="${one ? fmt(one.rot || 0) : ""}" placeholder="${one ? "" : "oförändrad"}" /></label><span>°</span></div>
        <button type="button" class="v3-act" id="v3DxTApply" title="Använd texten, höjden och vinkeln">${I.edit}<span>Ändra ${nt === 1 ? "texten" : `${nt} texter`}</span></button></div>` : ""}
      <label class="v3-dx-row">Byt lager <select id="v3DxSetLayer"><option value="">–</option>${opts("")}</select></label></div>`
      : `<div class="v3-pal-hint">${l3d.draw && l3d.draw.text ? "Tryck där texten ska stå." : l3d.draw ? "Tryck punkt för punkt på marken. Fäster mot ändpunkter, Skift = var 5:e grad. Enter/dubbelklick avslutar." : "Tryck på en linje eller text för att markera. Skift lägger till, dra en ruta för flera. Dra i en markerad linjes hörnpunkter; Alt + tryck lägger till/tar bort en punkt."}</div>`}
    <button type="button" class="v3-save-btn" id="v3DxSave" ${l3d.dirty ? "" : "disabled"} title="Ny DXF-fil i Trimble Connect och ett nytt CAD-lager i lägesplanen – originalet ändras aldrig">${I.upload}<span>Spara som ny DXF <em>${l3d.dirty ? "originalet ändras inte" : "inga ändringar än"}</em></span></button>`;
  const on = (id, ev, fn) => { const el = side.querySelector("#" + id); if (el) el[ev] = fn; };
  const num = (id, def = 0) => { const raw = String((side.querySelector("#" + id) || {}).value || "").trim(); if (!raw) return def; const v = Number(raw.replace(",", ".").replace(/\s/g, "")); return Number.isFinite(v) ? v : def; };
  on("v3DxEnd", "onclick", () => l3dEnd());
  on("v3DxSel", "onclick", () => l3dStopDraw());
  on("v3DxDraw", "onclick", () => (l3d.draw && l3d.draw.pts ? l3dStopDraw() : l3dStartDraw()));
  on("v3DxText", "onclick", () => (l3d.draw && l3d.draw.text ? l3dStopDraw() : l3dStartDraw(true)));
  on("v3DxLayer", "onchange", async e => { let v = e.target.value; if (v === "__new") v = await l3dNewLayer(); if (v) l3d.layer = v; l3RenderSide(); });
  on("v3DxX", "oninput", e => { l3d.dx = e.target.value; });
  on("v3DxY", "oninput", e => { l3d.dy = e.target.value; });
  on("v3DxR", "oninput", e => { l3d.rot = e.target.value; });
  on("v3DxMove", "onclick", () => l3dMove(num("v3DxX"), num("v3DxY")));
  on("v3DxCopy", "onclick", () => l3dCopy(num("v3DxX"), num("v3DxY")));
  on("v3DxRot", "onclick", () => l3dRotate(num("v3DxR")));
  on("v3DxDel", "onclick", () => l3dDelete());
  on("v3DxTApply", "onclick", () => { const ts = side.querySelector("#v3DxTs"); l3dEditTexts({ s: ts ? ts.value.replace(/\r/g, "") : null, h: num("v3DxTh", NaN), rot: num("v3DxTr", NaN) }); });
  on("v3DxSetLayer", "onchange", async e => { let v = e.target.value; if (v === "__new") v = await l3dNewLayer(); if (v) l3dSetLayer(v); });
  on("v3DxSave", "onclick", async () => { const b = side.querySelector("#v3DxSave"); b.disabled = true; try { await l3dSave(); } catch (er) { l3Status("Kunde inte spara: " + er.message, true); if (b.isConnected) b.disabled = false; } });
  side.querySelectorAll("input, textarea").forEach(el => { el.onkeydown = ev => ev.stopPropagation(); });
}

/* ---- Spara ------------------------------------------------------------------------------------- */
function l3dDxfText() {
  const rec = l3d.rec, aciOf = {};
  rec.layers.forEach(l => { aciOf[l.name] = dxfAci(l.color || "#000000"); });
  l3d.newLayers.forEach((c, n) => { aciOf[n] = dxfAci(c); });
  const ents = l3d.ents.filter(e => !e.del).map(e => {
    const lc = (rec.layers.find(l => l.name === e.layer) || {}).color;
    return { t: "PLINE", layer: e.layer, pts: e.pts, aci: lc && e.color && e.color.toLowerCase() !== String(lc).toLowerCase() ? dxfAci(e.color) : 0 };
  });
  // Texterna med sin justering (72/73 i DXF); flera rader blir en TEXT per rad.
  l3d.texts.filter(t => !t.del).forEach(t => {
    const ha = { l: 0, c: 1, r: 2 }[t.al[0]] || 0, va = { b: 0, m: 2, t: 3 }[t.al[1]] || 0, a = (t.rot || 0) * Math.PI / 180;
    String(t.s).split("\n").forEach((ln, k) => {
      if (!ln.trim()) return;
      const d = k * t.h * 1.25;
      ents.push({ t: "TEXT", layer: t.layer, x: t.x + d * Math.sin(a), y: t.y - d * Math.cos(a), z: 0, h: t.h || 0.25, s: ln, rot: t.rot || 0, ha, va });
    });
  });
  const layers = [...new Set([...rec.layers.map(l => l.name), ...l3d.newLayers.keys()])];
  return dxfWrite(ents, layers, aciOf);
}
async function l3dSave() {
  const rec = l3d.rec; if (!rec) return;
  const d = new Date(), p2 = x => String(x).padStart(2, "0");
  const name = `${rec.name} redigerad ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} kl ${p2(d.getHours())}.${p2(d.getMinutes())}.${p2(d.getSeconds())}.dxf`.replace(/[\\/:*?"<>|]/g, "-");
  const file = new File([dxfCp1252(l3dDxfText())], name, { type: "application/dxf" });
  const key = "dxfsave";
  busyProgress(key, `Sparar ${name}`, 0.1);
  try {
    // Trimble Connect: alltid en ny fil (namnet har datum och sekunder).
    let tc = "";
    if (window.opener && !window.opener.closed) {
      try { const up = await askOpener("tcUpload", { folder: "Lägesplan", files: [file] }, 10 * 60 * 1000); tc = ` och i Trimble Connect (${(up && up.folder) || "Lägesplan"})`; }
      catch (e) { tc = ` – men inte i Trimble Connect (${e.message})`; }
    }
    busyProgress(key, `Sparar ${name}`, 0.6);
    const before = new Set(cads().map(r => r.id));
    await addDxfFiles([file], { noTc: true });
    const added = cads().find(r => !before.has(r.id));
    busyProgress(key, "", null);
    if (!added) throw new Error("den nya ritningen kunde inte läggas in i lägesplanen");
    setLayersVisible(["cad:" + rec.id], false); // originalet ligger kvar, släckt
    await l3dEnd(true);
    if (typeof l3LayersRender === "function") l3LayersRender();
    l3Toast(`Sparad som ny DXF: ${name} – i lägesplanen${tc}. Originalet ${rec.name} är orört (släckt).`, null, null, 9000);
    l3Status(`Sparad: ${name}`);
    return { name, id: added.id };
  } catch (e) { busyProgress(key, "", null); throw e; }
}
