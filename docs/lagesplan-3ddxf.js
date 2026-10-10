/* 3D-vyn – redigera DXF (Victor 2026-10-10: "DXF-redigeringen där man ska kunna redigera och välja
   linjer, också rita in egna linjer").

   Lager → 2D-lägesplanen → pennan vid en DXF startar redigeringen:
   – Tryck på en linje markerar den (Skift/Ctrl/Flera lägger till), markeringsfönster som för objekt
     (vänster -> höger: hela linjer i rutan, höger -> vänster: allt som rutan nuddar).
   – Flytta (dX/dY eller piltangenterna), kopiera, byt lager, ta bort (Delete).
   – Rita linje: tryck punkt för punkt (fäster mot linjernas ändpunkter, Skift = var 5:e grad),
     Enter eller dubbelklick avslutar, Esc avbryter.
   – Ctrl+Z / Ctrl+Y ångrar och gör om.
   – Spara som ny DXF: en ny fil (namn med datum och klockslag) i Trimble Connect och ett nytt CAD-lager
     i lägesplanen; originalet ändras aldrig – det släcks bara. Texterna följer med oförändrade. */

const l3d = { rec: null, ents: [], texts: [], sel: new Set(), draw: null, dirty: false, mesh: null, selMesh: null, selPts: null, prev: null, layer: "", newLayers: new Map(), next: 1, dx: "", dy: "" };
const L3D_NEW_COLOR = "#e11d48";

function l3dLayerColor(name, orig) {
  if (l3d.newLayers.has(name)) return l3d.newLayers.get(name);
  return cadLayerColor(l3d.rec, name, orig);
}
const l3dLayerOn = name => l3d.newLayers.has(name) || cadLayerOn(l3d.rec, name);
const l3dZ = () => (typeof l3sZ === "function" ? l3sZ() : 0) + 0.035;

async function l3dStart(id) {
  if (l3d.rec) { if (l3d.rec.id === id) return; if (!(await l3dEnd())) return; }
  const rec = cads().find(r => r.id === id);
  if (!rec) return;
  if (!ls("cad:" + id).visible) setLayersVisible(["cad:" + id], true);
  const g = await ensureCadGeom(rec);
  const names = rec.layers.map(l => l.name);
  l3d.ents = []; l3d.texts = []; l3d.sel = new Set(); l3d.newLayers = new Map(); l3d.next = 1; l3d.dirty = false; l3d.draw = null;
  g.groups.forEach(gr => {
    const layer = names[gr.l];
    (gr.raw || []).forEach(a => {
      const pts = [];
      for (let j = 0; j + 1 < a.length; j += 2) pts.push([g.origin[0] + a[j] / 1000, g.origin[1] + a[j + 1] / 1000]);
      if (pts.length > 1) l3d.ents.push({ id: l3d.next++, layer, color: gr.c, pts });
    });
    (gr.texts || []).forEach(t => l3d.texts.push({ layer, color: gr.c, x: g.origin[0] + t[0] / 1000, y: g.origin[1] + t[1] / 1000, h: t[2] / 1000, rot: t[3], s: t[4] }));
  });
  l3d.rec = rec; l3d.layer = names[0] || "0";
  if (typeof l3bsClear === "function") l3bsClear();
  l3SelectIds([]);
  l3sBuildCad(); // döljer originalets linjer medan redigeringen pågår
  l3dRebuild();
  l3RenderSide();
  l3Status(`Redigerar ${rec.name}: tryck på en linje för att markera den, dra en ruta för flera, Rita linje för nya.`);
}
/* Avsluta (frågar om osparade ändringar). Returnerar false om man ångrade sig. */
async function l3dEnd(force) {
  if (!l3d.rec) return true;
  if (!force && l3d.dirty && !(await uiConfirm(`Avsluta redigeringen av ${l3d.rec.name} utan att spara? Ändringarna försvinner (originalet är orört).`, { ok: "Avsluta utan att spara" }))) return false;
  l3dStopDraw();
  [l3d.mesh, l3d.selMesh, l3d.selPts, l3d.prev].forEach(o => { if (o) { if (o.parent) o.parent.remove(o); o.geometry.dispose(); o.material.dispose(); } });
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
  list.forEach(e => { n += e.pts.length - 1; });
  const pos = new Float32Array(n * 6), col = withColor ? new Float32Array(n * 6) : null, c = new THREE.Color();
  let k = 0;
  list.forEach(e => {
    if (withColor) c.set(e.color && l3d.newLayers.has(e.layer) ? e.color : l3dLayerColor(e.layer, e.color));
    for (let j = 1; j < e.pts.length; j++) {
      const a = e.pts[j - 1], b = e.pts[j];
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
function l3dRebuild() {
  if (!l3d.rec) return;
  const grp = l3sGroup("cad"), z = l3dZ();
  const vis = l3d.ents.filter(e => !e.del && l3dLayerOn(e.layer));
  if (!l3d.mesh) {
    l3d.mesh = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
    l3d.mesh.userData.noHit = true; l3d.mesh.raycast = () => {}; l3d.mesh.renderOrder = 2; grp.add(l3d.mesh);
  }
  l3d.mesh.geometry.dispose(); l3d.mesh.geometry = l3dSegs(vis, true); l3d.mesh.position.z = z;
  // Markerade: lila linjer ovanpå allt och punkter i hörnen (syns även på långt håll).
  const sel = vis.filter(e => l3d.sel.has(e.id));
  if (!l3d.selMesh) {
    l3d.selMesh = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x6d5efc, depthTest: false, transparent: true }));
    l3d.selPts = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: 0x6d5efc, size: 7, sizeAttenuation: false, depthTest: false }));
    [l3d.selMesh, l3d.selPts].forEach(o => { o.userData.noHit = true; o.raycast = () => {}; o.renderOrder = 9; grp.add(o); });
  }
  l3d.selMesh.geometry.dispose(); l3d.selMesh.geometry = l3dSegs(sel, false); l3d.selMesh.position.z = z;
  const pp = []; sel.forEach(e => e.pts.forEach(p => pp.push(p[0] - l3.O[0], p[1] - l3.O[1], 0)));
  const pg = new THREE.BufferGeometry(); pg.setAttribute("position", new THREE.Float32BufferAttribute(pp, 3));
  l3d.selPts.geometry.dispose(); l3d.selPts.geometry = pg; l3d.selPts.position.z = z;
  l3Render();
}

/* ---- Skärm <-> modell -------------------------------------------------------------------------- */
function l3dScreen() {
  const r = l3.renderer.domElement.getBoundingClientRect();
  l3.camera.updateMatrixWorld();
  const PM = new THREE.Matrix4().multiplyMatrices(l3.camera.projectionMatrix, l3.camera.matrixWorldInverse), v = new THREE.Vector3(), z = l3dZ();
  return { r, proj: p => { v.set(p[0] - l3.O[0], p[1] - l3.O[1], z).applyMatrix4(PM); return v.z > 1 || v.z < -1 ? null : [(v.x + 1) / 2 * r.width, (1 - v.y) / 2 * r.height]; } };
}
/* Linjen närmast markören (inom 8 px). */
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
  return best;
}
/* Punkt på marken under markören; fäster mot ändpunkter (10 px) och Skift = var 5:e grad från förra punkten. */
function l3dGround(e, from) {
  const { r, proj } = l3dScreen(), mx = e.clientX - r.left, my = e.clientY - r.top;
  let best = null, bd = 10;
  l3d.ents.forEach(en => { if (en.del || !l3dLayerOn(en.layer)) return; [en.pts[0], en.pts[en.pts.length - 1]].forEach(p => { const q = proj(p); if (q) { const d = Math.hypot(q[0] - mx, q[1] - my); if (d < bd) { bd = d; best = p; } } }); });
  if (l3d.draw) l3d.draw.pts.forEach(p => { const q = proj(p); if (q) { const d = Math.hypot(q[0] - mx, q[1] - my); if (d < bd) { bd = d; best = p; } } });
  if (best) return { p: [best[0], best[1]], snap: "end" };
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

/* ---- Tryck, ruta, tangenter (anropas från 3D-vyn) --------------------------------------------- */
function l3dTap(e) {
  if (!l3d.rec || l3.tool !== "select") return false;
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
  const en = l3dHit(e), add = e.shiftKey || e.ctrlKey || e.metaKey || !!l3.multi;
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
  let n = 0;
  l3d.ents.forEach(en => {
    if (en.del || !l3dLayerOn(en.layer)) return;
    const qs = en.pts.map(proj);
    const hit = cross ? qs.some((q, i) => inR(q) || (i && segHit(qs[i - 1], q))) : qs.every(inR);
    if (hit) { n++; if (a.toggle && l3d.sel.has(en.id)) l3d.sel.delete(en.id); else l3d.sel.add(en.id); }
  });
  l3dRebuild(); l3RenderSide();
  l3Status(`${l3d.sel.size} linjer markerade (${cross ? "allt som rutan nuddar" : "hela linjer i rutan"}).`);
  return true;
}
function l3dKey(e) {
  if (!l3d.rec) return false;
  if (e.key === "Escape") { if (l3d.draw && l3d.draw.pts.length) { l3d.draw.pts = []; l3dPreview(null); l3Status("Linjen avbröts."); } else if (l3d.draw) l3dStopDraw(); else if (l3d.sel.size) { l3d.sel = new Set(); l3dRebuild(); l3RenderSide(); } else l3dEnd(); return true; }
  if (e.key === "Enter" && l3d.draw) { l3dFinishLine(); return true; }
  if ((e.key === "Delete" || e.key === "Backspace") && l3d.sel.size) { e.preventDefault(); l3dDelete(); return true; }
  const st = (typeof l3StepVal === "function" ? l3StepVal() : 0.1) || 0.1, m = e.shiftKey ? 10 : 1;
  const d = { ArrowLeft: [-st * m, 0], ArrowRight: [st * m, 0], ArrowUp: [0, st * m], ArrowDown: [0, -st * m] }[e.key];
  if (d && l3d.sel.size) { e.preventDefault(); l3dMove(d[0], d[1]); return true; }
  return false;
}

/* ---- Rita linje -------------------------------------------------------------------------------- */
function l3dLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }
function l3dStartDraw() {
  if (!l3d.rec) return;
  l3d.draw = { pts: [] };
  l3d.sel = new Set();
  const el = l3.renderer.domElement;
  l3d.onMove = ev => { if (l3d.draw && l3d.draw.pts.length) { const g = l3dGround(ev, l3d.draw.pts[l3d.draw.pts.length - 1]); l3dPreview(g && g.p); } };
  l3d.onDbl = ev => { if (l3d.draw) { ev.preventDefault(); l3dFinishLine(); } };
  el.addEventListener("pointermove", l3d.onMove); el.addEventListener("dblclick", l3d.onDbl);
  el.style.cursor = "crosshair";
  l3dRebuild(); l3RenderSide();
  l3Status("Rita linje: tryck punkt för punkt (fäster mot ändpunkter, Skift = var 5:e grad). Enter eller dubbelklick avslutar, Esc avbryter.");
}
function l3dStopDraw() {
  if (!l3d.draw) return;
  const el = l3.renderer && l3.renderer.domElement;
  if (el) { el.removeEventListener("pointermove", l3d.onMove); el.removeEventListener("dblclick", l3d.onDbl); el.style.cursor = ""; }
  l3d.draw = null; l3dPreview(null);
  l3RenderSide();
}
function l3dPreview(cursor) {
  const pts = l3d.draw ? l3d.draw.pts.concat(cursor ? [cursor] : []) : [];
  if (!l3d.prev) {
    l3d.prev = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xe11d48, depthTest: false, transparent: true }));
    l3d.prev.userData.noHit = true; l3d.prev.raycast = () => {}; l3d.prev.renderOrder = 10; l3sGroup("cad").add(l3d.prev);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts.flatMap(p => [p[0] - l3.O[0], p[1] - l3.O[1], 0]), 3));
  l3d.prev.geometry.dispose(); l3d.prev.geometry = g; l3d.prev.position.z = l3dZ();
  l3Render();
}
function l3dFinishLine() {
  const pts = l3d.draw ? l3d.draw.pts.slice() : [];
  l3d.draw.pts = [];
  l3dPreview(null);
  if (pts.length < 2) { l3Status("En linje behöver minst två punkter."); return; }
  const en = { id: l3d.next++, layer: l3d.layer, color: l3dLayerColor(l3d.layer), pts, added: true };
  l3dOp("ny linje", () => { l3d.ents.push(en); }, () => { const i = l3d.ents.indexOf(en); if (i >= 0) l3d.ents.splice(i, 1); l3d.sel.delete(en.id); });
  l3Status(`Linje ritad (${l3dLen(pts).toFixed(2).replace(".", ",")} m) på lagret ${l3d.layer}. Fortsätt rita eller Esc.`);
}

/* ---- Ändringar (med ångra/gör om) ------------------------------------------------------------- */
function l3dOp(label, redo, undo) {
  redo();
  l3d.dirty = true; l3dRebuild(); l3RenderSide();
  if (typeof l3VPush === "function") l3VPush(() => { if (!l3d.rec) return; undo(); l3d.dirty = true; l3dRebuild(); l3RenderSide(); }, () => { if (!l3d.rec) return; redo(); l3d.dirty = true; l3dRebuild(); l3RenderSide(); }, label);
}
const l3dSelEnts = () => l3d.ents.filter(e => l3d.sel.has(e.id) && !e.del);
function l3dDelete() {
  const list = l3dSelEnts(); if (!list.length) return;
  l3dOp(`ta bort ${list.length} linjer`, () => { list.forEach(e => { e.del = true; }); l3d.sel = new Set(); }, () => { list.forEach(e => { e.del = false; }); l3d.sel = new Set(list.map(e => e.id)); });
  l3Status(`${list.length} linjer borttagna (Ctrl+Z ångrar).`);
}
function l3dMove(dx, dy) {
  const list = l3dSelEnts(); if (!list.length || (!dx && !dy)) return;
  const sh = (s) => list.forEach(e => { e.pts = e.pts.map(p => [p[0] + s * dx, p[1] + s * dy]); });
  l3dOp(`flytta ${list.length} linjer`, () => sh(1), () => sh(-1));
  l3Status(`${list.length} linjer flyttade ${String(Math.round(dx * 1000) / 1000).replace(".", ",")} / ${String(Math.round(dy * 1000) / 1000).replace(".", ",")} m.`);
}
function l3dCopy(dx, dy) {
  const list = l3dSelEnts(); if (!list.length) return;
  const copies = list.map(e => ({ id: l3d.next++, layer: e.layer, color: e.color, pts: e.pts.map(p => [p[0] + dx, p[1] + dy]), added: true }));
  l3dOp(`kopiera ${list.length} linjer`, () => { l3d.ents.push(...copies); l3d.sel = new Set(copies.map(e => e.id)); }, () => { const s = new Set(copies); l3d.ents = l3d.ents.filter(e => !s.has(e)); l3d.sel = new Set(list.map(e => e.id)); });
}
function l3dSetLayer(name) {
  const list = l3dSelEnts(); if (!list.length) return;
  const old = list.map(e => [e, e.layer, e.color]), col = l3dLayerColor(name);
  l3dOp(`byt lager till ${name}`, () => list.forEach(e => { e.layer = name; if (l3d.newLayers.has(name)) e.color = col; }), () => old.forEach(([e, l, c]) => { e.layer = l; e.color = c; }));
}
async function l3dNewLayer() {
  const name = ((await uiPrompt("Namn på det nya lagret:", "4D-RITAT")) || "").trim().replace(/[<>/\\":;?*|=,]/g, "_");
  if (!name) return null;
  if (!l3d.rec.layers.some(l => l.name === name)) l3d.newLayers.set(name, L3D_NEW_COLOR);
  return name;
}

/* ---- Panelen ------------------------------------------------------------------------------------ */
function l3dRenderSide(side) {
  const esc = escHtml, I = L3_ICO, rec = l3d.rec, n = l3dSelEnts().length;
  const layers = [...rec.layers.map(l => l.name), ...l3d.newLayers.keys()];
  const opts = cur => layers.map(l => `<option value="${esc(l)}" ${l === cur ? "selected" : ""}>${esc(l)}</option>`).join("") + `<option value="__new">＋ Nytt lager…</option>`;
  const live = l3d.ents.filter(e => !e.del).length;
  side.dataset.id = "dxf";
  side.innerHTML = `<div class="v3-side-h"><i class="v3-chip" style="background:#e11d48"></i><b title="${esc(rec.name)}">Redigerar ${esc(rec.name)}</b><button type="button" class="v3-x" id="v3DxEnd" title="Avsluta redigeringen (Esc)">✕</button></div>
    <div class="v3-sub">${live} linjer · ${l3d.texts.length} texter${l3d.dirty ? " · <b>ändrad</b>" : ""}</div>
    <div class="v3-acts">
      <button type="button" class="v3-act ${l3d.draw ? "" : "on"}" id="v3DxSel" title="Välj linjer: tryck, Skift lägger till, dra en ruta">${I.select}<span>Välj</span></button>
      <button type="button" class="v3-act ${l3d.draw ? "on" : ""}" id="v3DxDraw" title="Rita egna linjer punkt för punkt">${I.edit}<span>Rita linje</span></button>
    </div>
    <label class="v3-dx-row">Nya linjer på lagret <select id="v3DxLayer">${opts(l3d.layer)}</select></label>
    ${n ? `<div class="v3-dx-sel"><b>${n} ${n === 1 ? "linje" : "linjer"} markerade</b>
      <div class="v3-dx-move"><label>dX <input type="text" inputmode="decimal" id="v3DxX" value="${esc(l3d.dx)}" placeholder="0" /></label><label>dY <input type="text" inputmode="decimal" id="v3DxY" value="${esc(l3d.dy)}" placeholder="0" /></label><span>m</span></div>
      <div class="v3-acts">
        <button type="button" class="v3-act" id="v3DxMove" title="Flytta de markerade dX/dY meter (piltangenterna flyttar ett steg)">${I.move}<span>Flytta</span></button>
        <button type="button" class="v3-act" id="v3DxCopy" title="Kopiera de markerade dX/dY meter">${I.copy}<span>Kopiera</span></button>
        <button type="button" class="v3-act bad" id="v3DxDel" title="Ta bort de markerade (Delete)">${I.trash}<span>Ta bort</span></button>
      </div>
      <label class="v3-dx-row">Byt lager <select id="v3DxSetLayer"><option value="">–</option>${opts("")}</select></label></div>`
      : `<div class="v3-pal-hint">${l3d.draw ? "Tryck punkt för punkt på marken. Fäster mot ändpunkter, Skift = var 5:e grad. Enter/dubbelklick avslutar." : "Tryck på en linje för att markera den. Skift lägger till, dra en ruta för flera (vänster → höger: hela linjer, höger → vänster: allt som nuddas)."}</div>`}
    <button type="button" class="v3-save-btn" id="v3DxSave" ${l3d.dirty ? "" : "disabled"} title="Ny DXF-fil i Trimble Connect och ett nytt CAD-lager i lägesplanen – originalet ändras aldrig">${I.upload}<span>Spara som ny DXF <em>${l3d.dirty ? "originalet ändras inte" : "inga ändringar än"}</em></span></button>`;
  const on = (id, ev, fn) => { const el = side.querySelector("#" + id); if (el) el[ev] = fn; };
  const num = id => { const v = Number(String((side.querySelector("#" + id) || {}).value || "0").replace(",", ".").replace(/\s/g, "")); return Number.isFinite(v) ? v : 0; };
  on("v3DxEnd", "onclick", () => l3dEnd());
  on("v3DxSel", "onclick", () => l3dStopDraw());
  on("v3DxDraw", "onclick", () => (l3d.draw ? l3dStopDraw() : l3dStartDraw()));
  on("v3DxLayer", "onchange", async e => { let v = e.target.value; if (v === "__new") v = await l3dNewLayer(); if (v) l3d.layer = v; l3RenderSide(); });
  on("v3DxX", "oninput", e => { l3d.dx = e.target.value; });
  on("v3DxY", "oninput", e => { l3d.dy = e.target.value; });
  on("v3DxMove", "onclick", () => l3dMove(num("v3DxX"), num("v3DxY")));
  on("v3DxCopy", "onclick", () => l3dCopy(num("v3DxX"), num("v3DxY")));
  on("v3DxDel", "onclick", () => l3dDelete());
  on("v3DxSetLayer", "onchange", async e => { let v = e.target.value; if (v === "__new") v = await l3dNewLayer(); if (v) l3dSetLayer(v); });
  on("v3DxSave", "onclick", async () => { const b = side.querySelector("#v3DxSave"); b.disabled = true; try { await l3dSave(); } catch (er) { l3Status("Kunde inte spara: " + er.message, true); if (b.isConnected) b.disabled = false; } });
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
  l3d.texts.forEach(t => ents.push({ t: "TEXT", layer: t.layer, x: t.x, y: t.y, z: 0, h: t.h || 0.25, s: t.s, rot: t.rot || 0 }));
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
