/* 3D-vyn – markera DXF:er och arbetsytans PDF i bilden (Victor 2026-10-10: "markera pdfer och dxfer i
   3d-vyn och få upp en meny likt när jag trycker på 3D-objekt där jag kan se info och justera dess
   position").

   – Tryck på en DXF-linje: hela DXF:en markeras (orange) och panelen till höger visar uppgifter, synlighet,
     genomskinlighet, Redigera och läget. Läget är en förskjutning i plan (gäller både 2D och 3D – sparas i
     lagret som rec.shift, meter) och en höjd över marken som bara gäller 3D (rec.z3).
   – Tryck på marken (ritningen) när inget annat är markerat: arbetsytans PDF markeras (orange ram). Läget
     ändras genom att kalibreringen mot 3D-modellen förskjuts/vrids – det som ritats på PDF:en (zoner m.m.)
     följer med; etablering, byggnad, DXF och mått ligger kvar i sina koordinater. Ctrl+Z ångrar.
   – Esc eller ✕ avmarkerar. */

const l3ss = { sel: null, ring: null };

/* ---- DXF:ernas förskjutning (gäller överallt: 2D, utskrift, fästning, 3D) ---------------------------- */
function cadShiftOf(rec) { return Array.isArray(rec && rec.shift) ? rec.shift : [0, 0]; }
/* Läggs på geometrins origo när DXF:en läses in, och flyttas när förskjutningen ändras. */
function cadApplyShift(rec, g) {
  if (!rec || !g) return;
  const want = cadShiftOf(rec), had = g.shiftApplied || [0, 0];
  if (want[0] === had[0] && want[1] === had[1]) return;
  g.origin = [g.origin[0] + want[0] - had[0], g.origin[1] + want[1] - had[1]];
  g.shiftApplied = want.slice();
  rec._snap = null; // fästindexet i 3D byggs om
}

/* ---- Markera ------------------------------------------------------------------------------------ */
/* DXF:en under markören (inom 8 px från en linje), eller null. */
function l3ssCadAt(e) {
  if (!l3 || typeof cads !== "function" || !plan || !plan.calib || typeof l3sDxfIndex !== "function") return null;
  const recs = cads().filter(r => ls("cad:" + r.id).visible && cadGeom.has(r.id) && !(typeof l3d !== "undefined" && l3d.rec && l3d.rec.id === r.id));
  if (!recs.length) return null;
  const R = l3.renderer.domElement.getBoundingClientRect(), mx = e.clientX - R.left, my = e.clientY - R.top;
  let best = null;
  recs.forEach(r => {
    const z = l3sZ() + 0.03 + (Number(r.z3) || 0);
    const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(mx / R.width * 2 - 1, -(my / R.height) * 2 + 1), l3.camera);
    const gp = rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), new THREE.Vector3());
    if (!gp) return;
    const q0 = l3ToScreen(gp), q1 = l3ToScreen(gp.clone().add(new THREE.Vector3(1, 0, 0))), q2 = l3ToScreen(gp.clone().add(new THREE.Vector3(0, 1, 0)));
    const ppm = Math.max(1e-6, Math.max(Math.hypot(q1.x - q0.x, q1.y - q0.y), Math.hypot(q2.x - q0.x, q2.y - q0.y))), rad = 8 / ppm;
    const P = [gp.x + l3.O[0], gp.y + l3.O[1]], ix = l3sDxfIndex(r); if (!ix) return;
    const c0x = Math.floor((P[0] - rad) / ix.C), c1x = Math.floor((P[0] + rad) / ix.C), c0y = Math.floor((P[1] - rad) / ix.C), c1y = Math.floor((P[1] + rad) / ix.C);
    for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) (ix.cells.get(cx + "," + cy) || []).forEach(([x0, y0, x1, y1]) => {
      const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((P[0] - x0) * dx + (P[1] - y0) * dy) / l2)) : 0;
      const d = Math.hypot(x0 + t * dx - P[0], y0 + t * dy - P[1]);
      if (d < rad && (!best || d / rad < best.d)) best = { d: d / rad, r };
    });
  });
  return best ? best.r : null;
}
/* Anropas från 3D-vyns tryck när inget objekt träffades. hadSel: något var markerat före trycket. */
function l3ssTap(e, hadSel) {
  const r = l3ssCadAt(e);
  if (r) { l3ssSelect({ kind: "cad", id: r.id }); return true; }
  if (!hadSel && !l3ss.sel && l3.planMesh && l3.planMesh.visible && l3Ray(e, [l3.planMesh])[0]) { l3ssSelect({ kind: "pdf" }); return true; }
  if (l3ss.sel) l3ssSelect(null);
  return false;
}
function l3ssSelect(sel, quiet) {
  l3ss.sel = sel;
  if (sel) { if (typeof l3SelectIds === "function" && l3.sel.size) l3SelectIds([]); if (typeof l3bsClear === "function" && l3bs.sel.length) l3bsClear(); }
  l3ssHighlight();
  if (!quiet && typeof l3RenderSide === "function") l3RenderSide();
  if (sel) l3Status(sel.kind === "cad" ? `DXF markerad: ${(l3ssRec() || {}).name || ""}. Esc avmarkerar.` : "Arbetsytans ritning (PDF) markerad. Esc avmarkerar.");
}
const l3ssRec = () => (l3ss.sel && l3ss.sel.kind === "cad" && typeof cads === "function" ? cads().find(r => r.id === l3ss.sel.id) || null : null);
/* Markeringen syns: DXF:ens linjer orange, PDF:en med en orange ram. Anropas också när linjerna byggts om. */
function l3ssHighlight() {
  if (!l3) return;
  if (l3ss.ring) { l3ss.ring.parent && l3ss.ring.parent.remove(l3ss.ring); l3ss.ring.geometry.dispose(); l3ss.ring.material.dispose(); l3ss.ring = null; }
  if (typeof l3s !== "undefined" && l3s.cad) l3s.cad.forEach(obj => {
    const on = l3ss.sel && l3ss.sel.kind === "cad" && obj.userData.cadId === l3ss.sel.id;
    if (on) { if (!obj.userData.l3ssCol) obj.userData.l3ssCol = obj.material.color.getHex(); obj.material.color.set(0xf59e0b); }
    else if (obj.userData.l3ssCol != null) { obj.material.color.setHex(obj.userData.l3ssCol); obj.userData.l3ssCol = null; }
  });
  if (l3ss.sel && l3ss.sel.kind === "pdf" && l3.planMesh) {
    const p = l3.planMesh.geometry.getAttribute("position"), pts = [0, 1, 2, 3, 0].map(i => new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i) + 0.05));
    l3ss.ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false }));
    l3ss.ring.renderOrder = 12; l3ss.ring.userData.noHit = true; l3ss.ring.raycast = () => {};
    l3.scene.add(l3ss.ring);
  }
  l3Render();
}

/* ---- Panelen ------------------------------------------------------------------------------------ */
const l3ssFmt = v => String(Math.round(v * 1000) / 1000).replace(".", ",");
const l3ssNum = s => { const v = Number(String(s == null ? "" : s).replace(/\s/g, "").replace(",", ".")); return Number.isFinite(v) ? v : null; };
function l3ssCadBox(r) {
  const g = cadGeom.get(r.id); if (!g) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  g.groups.forEach(gr => (gr.raw || []).forEach(a => { for (let j = 0; j < a.length; j += 2) { const x = a[j], y = a[j + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }));
  if (!Number.isFinite(x0)) return null;
  return { x0: g.origin[0] + x0 / 1000, y0: g.origin[1] + y0 / 1000, x1: g.origin[0] + x1 / 1000, y1: g.origin[1] + y1 / 1000 };
}
function l3ssRenderSide(side) {
  const esc = escHtml, I = L3_ICO;
  const f = (k, label, val, unit = "m", title = "") => `<label title="${esc(title)}"><span>${label}</span><div class="v3-in"><input type="text" inputmode="decimal" data-ssf="${k}" value="${val}" /><em>${unit}</em></div></label>`;
  const row = (k, v) => v || v === 0 ? `<tr><td>${k}</td><td>${esc(String(v))}</td></tr>` : "";
  if (l3ss.sel.kind === "cad") {
    const r = l3ssRec(); if (!r) { l3ssSelect(null); return; }
    const key = "cad:" + r.id, b = l3ssCadBox(r), sh = cadShiftOf(r), on = r.layers.filter(l => cadLayerOn(r, l.name)).length;
    side.dataset.id = "site:cad:" + r.id;
    side.innerHTML = `<div class="v3-side-h"><i class="v3-chip" style="background:#f59e0b"></i><b title="${esc(r.name)}">${esc(r.name)}</b><button type="button" class="v3-x" id="v3SsClose" title="Avmarkera (Esc)">✕</button></div>
      <div class="v3-sub">DXF-ritning</div>
      <div class="v3-acts">
        <button type="button" class="v3-act" id="v3SsZoom">${I.focus}<span>Zooma</span></button>
        <button type="button" class="v3-act" id="v3SsHide">${I.eyeOff}<span>Dölj</span></button>
        ${typeof l3dStart === "function" ? `<button type="button" class="v3-act" id="v3SsEdit" title="Redigera linjerna och texterna – sparas som en ny DXF i TC">${I.edit}<span>Redigera</span></button>` : ""}
      </div>
      <table class="v3-info-t">${row("Fil", r.name + ".dxf")}${row("Lager", `${on} av ${r.layers.length} tända`)}${r.stats ? row("Innehåll", `${(r.stats.lines || 0).toLocaleString("sv-SE")} linjer${r.stats.texts ? `, ${r.stats.texts.toLocaleString("sv-SE")} texter` : ""}`) : ""}${typeof unitName === "function" && r.factor ? row("Enhet", unitName(r.factor)) : ""}${b ? row("Storlek", `${l3ssFmt(b.x1 - b.x0)} × ${l3ssFmt(b.y1 - b.y0)} m`) + row("Mitt (X / Y)", `${l3ssFmt((b.x0 + b.x1) / 2)} / ${l3ssFmt((b.y0 + b.y1) / 2)}`) : ""}${r.added_by || r.by ? row("Tillagd av", r.added_by || r.by) : ""}</table>
      <div class="v3-ss-op"><span>Synlighet</span><input type="range" id="v3SsOp" min="10" max="100" step="5" value="${Math.round(layerOpacity(key) * 100)}" /><b>${Math.round(layerOpacity(key) * 100)} %</b></div>
      <div class="v3-ss-h">Läge <em>förskjutning i plan gäller både 2D och 3D</em></div>
      <div class="v3-grid">${f("dx", "Flytta X", l3ssFmt(sh[0]), "m", "Förskjutning österut/västerut från DXF:ens egna koordinater")}${f("dy", "Flytta Y", l3ssFmt(sh[1]), "m", "Förskjutning norrut/söderut")}${f("z3", "Höjd i 3D", l3ssFmt(Number(r.z3) || 0), "m", "Lyft linjerna över marken – bara i 3D")}</div>
      <div class="v3-grp-acts"><button type="button" id="v3SsApply">Verkställ läget</button><button type="button" id="v3SsReset" ${sh[0] || sh[1] || r.z3 ? "" : "disabled"}>Tillbaka till DXF:ens läge</button></div>`;
    const on2 = (id, fn) => { const x = side.querySelector("#" + id); if (x) x.onclick = fn; };
    on2("v3SsClose", () => l3ssSelect(null));
    on2("v3SsZoom", () => { if (b) { const c = new THREE.Vector3((b.x0 + b.x1) / 2 - l3.O[0], (b.y0 + b.y1) / 2 - l3.O[1], l3sZ()); l3FlyTo(c, Math.max(10, Math.hypot(b.x1 - b.x0, b.y1 - b.y0) * 0.9)); } });
    on2("v3SsHide", () => { setLayersVisible([key], false); l3ssSelect(null); l3sRefresh(0); if (typeof l3LayersRender === "function") l3LayersRender(); });
    on2("v3SsEdit", () => { const id = r.id; l3ssSelect(null, true); l3dStart(id); });
    const op = side.querySelector("#v3SsOp");
    op.oninput = () => { ls(key).opacity = Number(op.value); op.nextElementSibling.textContent = op.value + " %"; l3sRefresh(0); };
    op.onchange = () => { if (typeof saveLayerState === "function") saveLayerState(); if (typeof scheduleCadRender === "function") scheduleCadRender(); };
    const apply = () => { const v = k => l3ssNum(side.querySelector(`[data-ssf="${k}"]`).value); const dx = v("dx"), dy = v("dy"), z3 = v("z3"); if (dx == null || dy == null || z3 == null) { l3Status("Skriv tal i fälten (t.ex. 1,5).", true); return; } l3ssCadMove(r, [dx, dy], z3); };
    on2("v3SsApply", apply);
    side.querySelectorAll("[data-ssf]").forEach(inp => { inp.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") apply(); }; });
    on2("v3SsReset", () => l3ssCadMove(r, [0, 0], 0));
    return;
  }
  // Arbetsytans PDF.
  const c = plan.calib, m = c.model, pdf = c.pdf;
  const scale = Math.hypot(m[1][0] - m[0][0], m[1][1] - m[0][1]) / (Math.hypot(pdf[1][0] - pdf[0][0], pdf[1][1] - pdf[0][1]) || 1);
  let bw = 0, bh = 0;
  if (l3.planMesh) { const bb = new THREE.Box3().setFromBufferAttribute(l3.planMesh.geometry.getAttribute("position")); bw = bb.max.x - bb.min.x; bh = bb.max.y - bb.min.y; }
  side.dataset.id = "site:pdf";
  side.innerHTML = `<div class="v3-side-h"><i class="v3-chip" style="background:#f59e0b"></i><b title="${esc(plan.name || "")}">${esc(plan.name || "Arbetsytan")}</b><button type="button" class="v3-x" id="v3SsClose" title="Avmarkera (Esc)">✕</button></div>
    <div class="v3-sub">Arbetsytans ritning (PDF) som mark</div>
    <div class="v3-acts">
      <button type="button" class="v3-act" id="v3SsZoom">${I.focus}<span>Zooma</span></button>
      <button type="button" class="v3-act" id="v3SsHide">${I.eyeOff}<span>Dölj</span></button>
    </div>
    <table class="v3-info-t">${row("Fil", String(plan.file_path || "").split("/").pop())}${row("Sida", plan.page || 1)}${row("Skala", `1 PDF-punkt = ${l3ssFmt(scale * 1000)} mm`)}${bw ? row("Storlek", `${l3ssFmt(bw)} × ${l3ssFmt(bh)} m`) : ""}${row("Höjd (mark)", l3ssFmt(m[0][2] || 0) + " m")}${row("Kalibrering", `${l3ssFmt(m[0][0])} / ${l3ssFmt(m[0][1])} → ${l3ssFmt(m[1][0])} / ${l3ssFmt(m[1][1])}`)}</table>
    <div class="v3-ss-op"><span>Synlighet</span><input type="range" id="v3SsOp" min="10" max="100" step="5" value="${l3Prefs().planOp || 100}" /><b>${l3Prefs().planOp || 100} %</b></div>
    <div class="v3-ss-h">Justera läget <em>flyttar ritningen mot 3D-modellen – det som ritats på den följer med</em></div>
    <div class="v3-grid">${f("dx", "Flytta X", "0")}${f("dy", "Flytta Y", "0")}${f("dz", "Höjd", "0")}${f("rot", "Vrid", "0", "°", "Moturs runt ritningens mitt")}</div>
    <div class="v3-grp-acts"><button type="button" id="v3SsApply">Flytta ritningen</button></div>`;
  const on2 = (id, fn) => { const x = side.querySelector("#" + id); if (x) x.onclick = fn; };
  on2("v3SsClose", () => l3ssSelect(null));
  on2("v3SsZoom", () => { if (typeof l3Frame === "function") l3Frame(true); });
  on2("v3SsHide", () => { if (typeof l3lToggle === "function" && l3Prefs().plan) l3lToggle("plan"); l3ssSelect(null); });
  const op = side.querySelector("#v3SsOp");
  op.oninput = () => { l3SetPref("planOp", Number(op.value)); op.nextElementSibling.textContent = op.value + " %"; if (typeof l3lApplyPlanOp === "function") l3lApplyPlanOp(); l3Render(); };
  const apply = () => { const v = k => l3ssNum(side.querySelector(`[data-ssf="${k}"]`).value); const d = ["dx", "dy", "dz", "rot"].map(v); if (d.some(x => x == null)) { l3Status("Skriv tal i fälten (t.ex. 1,5).", true); return; } if (d.every(x => !x)) return; l3ssPdfMove(...d); };
  on2("v3SsApply", apply);
  side.querySelectorAll("[data-ssf]").forEach(inp => { inp.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") apply(); }; });
}

/* ---- Flytta en DXF (förskjutning i plan + höjd i 3D), sparas i lagret; Ctrl+Z ångrar ------------------ */
function l3ssCadMove(r, shift, z3, noUndo) {
  const was = { shift: cadShiftOf(r).slice(), z3: Number(r.z3) || 0 };
  const now = { shift: shift.map(v => Math.round(v * 1000) / 1000), z3: Math.round(z3 * 1000) / 1000 };
  if (was.shift[0] === now.shift[0] && was.shift[1] === now.shift[1] && was.z3 === now.z3) return;
  const set = st => {
    const rec = cads().find(x => x.id === r.id) || r;
    if (st.shift[0] || st.shift[1]) rec.shift = st.shift.slice(); else delete rec.shift;
    if (st.z3) rec.z3 = st.z3; else delete rec.z3;
    cadApplyShift(rec, cadGeom.get(rec.id));
    // 3D: linjerna och texterna byggs om; 2D: ritas om.
    if (typeof l3s !== "undefined") { l3s.cad.forEach((obj, k) => { if (obj.userData.cadId === rec.id) { obj.parent && obj.parent.remove(obj); obj.geometry.dispose(); obj.material.dispose(); l3s.cad.delete(k); } }); const t = l3s.text.get(rec.id); if (t) { l3sDisposeMeshes(t.meshes); l3s.text.delete(rec.id); } }
    if (typeof scheduleCadRender === "function") scheduleCadRender();
    if (typeof buildCadSnap === "function") try { buildCadSnap(); } catch (e) { /* fästning i 2D byggs om senare */ }
    l3sRefresh(0);
    if (typeof saveSiteItem === "function") saveSiteItem(rec, false, { record: false }).catch(e => l3Status("Kunde inte spara DXF:ens läge: " + e.message, true));
    if (l3ss.sel && l3ss.sel.kind === "cad" && l3ss.sel.id === rec.id) l3RenderSide();
  };
  if (!noUndo && typeof l3VPush === "function") l3VPush(() => set(was), () => set(now), "flytta DXF");
  set(now);
  l3Status(`${r.name}: ${now.shift[0] || now.shift[1] ? `flyttad ${l3ssFmt(now.shift[0])} / ${l3ssFmt(now.shift[1])} m` : "i sitt eget läge"}${now.z3 ? `, ${l3ssFmt(now.z3)} m upp i 3D` : ""} (Ctrl+Z ångrar).`);
}

/* ---- Flytta arbetsytans PDF: kalibreringen förskjuts/vrids (runt ritningens mitt) ------------------- */
function l3ssPdfMove(dx, dy, dz, rot) {
  const was = JSON.parse(JSON.stringify(plan.calib.model));
  let cx = (was[0][0] + was[1][0]) / 2, cy = (was[0][1] + was[1][1]) / 2;
  if (l3.planMesh) { const bb = new THREE.Box3().setFromBufferAttribute(l3.planMesh.geometry.getAttribute("position")); cx = (bb.min.x + bb.max.x) / 2 + l3.O[0]; cy = (bb.min.y + bb.max.y) / 2 + l3.O[1]; }
  const a = rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const now = was.map(p => { const x = p[0] - cx, y = p[1] - cy; return [Math.round((cx + x * ca - y * sa + dx) * 1000) / 1000, Math.round((cy + x * sa + y * ca + dy) * 1000) / 1000, Math.round(((p[2] || 0) + dz) * 1000) / 1000]; });
  const set = model => {
    plan.calib = { ...plan.calib, model: model.map(p => p.slice()) };
    plan._calibSet = true;
    if (typeof invalidatePositions === "function") invalidatePositions();
    if (typeof renderOrtho === "function") renderOrtho();
    if (typeof renderZones === "function") renderZones();
    if (typeof schedulePlanSave === "function") schedulePlanSave();
    l3BuildPlan().then(() => { l3sRefresh(0); l3ssHighlight(); if (l3ss.sel && l3ss.sel.kind === "pdf") l3RenderSide(); });
  };
  if (typeof l3VPush === "function") l3VPush(() => set(was), () => set(now), "flytta ritningen");
  set(now);
  l3Status(`Ritningen flyttad ${l3ssFmt(dx)} / ${l3ssFmt(dy)} m${dz ? `, ${l3ssFmt(dz)} m i höjd` : ""}${rot ? `, vriden ${l3ssFmt(rot)}°` : ""} – kalibreringen är ändrad (Ctrl+Z ångrar).`);
}
