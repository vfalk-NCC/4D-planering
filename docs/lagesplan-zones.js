/* Lägesplan – rita och forma zoner (Victors önskemål 2026-10-02).
   - ⬠ Polygon: klicka hörnen, Shift = raka linjer (5°-steg), fäster mot
     ritningens linjer (Alt släpper), dubbelklick/Enter avslutar, ⌫ tar bort
     senaste punkten, Esc avbryter. Samma kod som en befintlig zon = en del till.
   - Markerad zon: dra i hörnen eller i en sida (flyttas parallellt), dubbelklicka ett hörn för att ta bort det,
     📍 flytta etiketten, Delete tar bort zonen.
   - Utseende per zon (zone.style, se drawZoneShapes): fyllning, opacitet,
     mönster, kantlinje, etikett och dölj.
   - Ctrl+Z / ↶ ångrar ändringar av zonerna (senaste 50 stegen). */

let zonePoly = null;      // { pts: [pdf], cursor: pdf|null } medan en polygon ritas
let zoneLabelPlace = null; // zon-id som väntar på ett klick för etikettens nya läge
let zoneVDrag = null;     // { zone, pi, vi, orig, moved }
const zoneUndoStack = [];

// ---------------------------------------------------------------------
// Ångra
// ---------------------------------------------------------------------
function zoneSnapshot(label) {
  zoneUndoStack.push({ label, zones: JSON.stringify((plan && plan.zones) || []), planId: plan && plan.id });
  if (zoneUndoStack.length > 50) zoneUndoStack.shift();
  if (typeof lastUndoTarget !== "undefined") lastUndoTarget = "zone";
  if (typeof updateFieldUndo === "function") updateFieldUndo();
}
function zoneUndo() {
  const e = zoneUndoStack.pop();
  if (!e || !plan || e.planId !== plan.id) return false;
  plan.zones = JSON.parse(e.zones);
  if (selectedZoneId && !plan.zones.some(z => z.id === selectedZoneId)) selectZone(null);
  else if (selectedZoneId) openEditor(selectedZoneId);
  if (!zoneUndoStack.length && typeof lastUndoTarget !== "undefined") lastUndoTarget = "";
  renderZones(); schedulePlanSave();
  setSaveStatus(`↶ Ångrade: ${e.label}`);
  if (typeof updateFieldUndo === "function") updateFieldUndo();
  return true;
}

// ---------------------------------------------------------------------
// Polygon
// ---------------------------------------------------------------------
function startZonePoly() {
  if (!plan || !viewport) return;
  if (zonePoly) { cancelZonePoly(); return; }
  if (drawMode) setDrawMode(false);
  if (typeof siteTool !== "undefined" && siteTool) stopSiteTool();
  zonePoly = { pts: [], cursor: null };
  updateZonePolyUi();
}
function cancelZonePoly() { zonePoly = null; if (typeof snapMark !== "undefined") snapMark = null; updateZonePolyUi(); renderZones(); }
function updateZonePolyUi() {
  const b = $("btnZonePoly");
  if (b) b.classList.toggle("active", !!zonePoly);
  $("viewport").classList.toggle("drawing", !!zonePoly || drawMode || !!zoneLabelPlace);
  const h = $("zoneDrawHint");
  if (h) {
    h.classList.toggle("hidden", !zonePoly && !zoneLabelPlace);
    h.textContent = zoneLabelPlace ? "📍 Klicka där zonens etikett ska stå (Esc avbryter)."
      : zonePoly ? (zonePoly.pts.length < 3 ? `Klicka zonens hörn (${zonePoly.pts.length} st). Shift = raka linjer, Alt släpper fästningen.` : `${zonePoly.pts.length} hörn – dubbelklicka eller Enter för att avsluta, ⌫ tar bort senaste, Esc avbryter.`) : "";
  }
}
/* Punkt med fästning (ritningens linjer, andra zoner) och Shift = 5°-steg. */
/* Zoner fäster mot varandra (Victors önskemål 2026-10-02): hörn och kanter
   på de andra zonerna (och första punkten på den som ritas) inom ~12 skärm-px.
   Alt släpper. Returnerar null om inget finns i närheten. */
let zoneSnapMark = null;
function zoneSnapPt(raw, e, excludeId, extraPts = []) {
  zoneSnapMark = null;
  if (e && e.altKey) return null;
  const p = toPx(raw), tol = 12 / view.scale;
  let best = null, bd = tol;
  const polys = (plan.zones || []).filter(z => z.id !== excludeId).flatMap(z => z.polys || []);
  polys.concat(extraPts.length ? [extraPts] : []).forEach(poly => poly.forEach(v => { const q = toPx(v), d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = v; } }));
  if (best) { zoneSnapMark = { pt: best, kind: "hörn" }; return best.slice(); }
  polys.forEach(poly => poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length], A = toPx(a), B = toPx(b), dx = B[0] - A[0], dy = B[1] - A[1], l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((p[0] - A[0]) * dx + (p[1] - A[1]) * dy) / l)) : 0;
    const d = Math.hypot(A[0] + t * dx - p[0], A[1] + t * dy - p[1]);
    if (d < bd) { bd = d; best = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; }
  }));
  if (best) zoneSnapMark = { pt: best, kind: "kant" };
  return best;
}
function zonePolyPoint(e) {
  const raw = toPdf(stagePoint(e)), prev = zonePoly.pts[zonePoly.pts.length - 1] || null;
  if (!e.shiftKey) { const z = zoneSnapPt(raw, e, null, zonePoly.pts.slice(0, 1)); if (z) return z; }
  if (plan.calib && typeof constrainPdf === "function") { try { return constrainPdf(raw, e, prev); } catch (err) { /* utan etablering att fästa mot */ } }
  if (!e.shiftKey || !prev) return raw;
  const dx = raw[0] - prev[0], dy = raw[1] - prev[1];
  const a = Math.round(Math.atan2(-dy, dx) * 180 / Math.PI / 5) * 5 * Math.PI / 180, len = dx * Math.cos(a) - dy * Math.sin(a);
  return [prev[0] + Math.cos(a) * len, prev[1] - Math.sin(a) * len];
}
function finishZonePoly() {
  if (!zonePoly) return;
  const pts = zonePoly.pts.filter((p, i, a) => !i || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-6);
  if (pts.length < 3) { alert("En zon behöver minst tre hörn."); return; }
  zonePoly = null; updateZonePolyUi();
  const sel = selectedZoneId && plan.zones.find(z => z.id === selectedZoneId);
  const code = (prompt(`Kod för zonen (t.ex. PM06).${sel ? `\nSkriv ${sel.code} för att lägga till ytan på den zonen.` : ""}`, "") || "").trim();
  if (!code) { renderZones(); return; }
  zoneSnapshot("Ny zon");
  const existing = (plan.zones || []).find(z => normCode(z.code) === normCode(code));
  let target;
  if (existing) { existing.polys.push(pts); existing.source = "manual"; selectedZoneId = existing.id; target = existing; }
  else {
    target = { id: ghNewId(), code: code.toUpperCase(), polys: [pts], labels: [], rule: { field: "auto" }, source: "manual" };
    plan.zones = [...(plan.zones || []), target];
    selectedZoneId = target.id;
  }
  if (!clipZoneAgainstOthers(target)) { zoneUndo(); return; }
  renderZones(); openEditor(selectedZoneId); schedulePlanSave();
}

// ---------------------------------------------------------------------
// Hörn på den markerade zonen
// ---------------------------------------------------------------------
function zoneVertexAt(e) {
  const z = selectedZoneId && plan && (plan.zones || []).find(x => x.id === selectedZoneId);
  if (!z) return null;
  const p = stagePoint(e), tol = 9 / view.scale;
  let best = null, bd = tol;
  (z.polys || []).forEach((poly, pi) => poly.forEach((v, vi) => { const q = toPx(v), d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = { zone: z, pi, vi }; } }));
  return best;
}
/* Sida på den markerade zonen (Victors önskemål 2026-10-02): dra i en sida
   för att flytta den parallellt, båda hörnen följer med. */
function zoneEdgeAt(e) {
  const z = selectedZoneId && plan && (plan.zones || []).find(x => x.id === selectedZoneId);
  if (!z) return null;
  const p = stagePoint(e), tol = 7 / view.scale;
  let best = null, bd = tol;
  (z.polys || []).forEach((poly, pi) => poly.forEach((v, vi) => {
    const a = toPx(v), b = toPx(poly[(vi + 1) % poly.length]), dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    if (!L2) return;
    const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2;
    if (t < 0.08 || t > 0.92) return; // nära hörnen: hörnet vinner
    const d = Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
    if (d < bd) { bd = d; best = { zone: z, pi, vi }; }
  }));
  return best;
}
/* Muspekare som visar åt vilket håll sidan kan dras. */
function zoneEdgeCursor(h) {
  const poly = h.zone.polys[h.pi], a = toPx(poly[h.vi]), b = toPx(poly[(h.vi + 1) % poly.length]);
  let ang = (Math.atan2(b[0] - a[0], -(b[1] - a[1])) + (view.rot || 0)) * 180 / Math.PI; // normalens riktning på skärmen
  ang = ((ang % 180) + 180) % 180;
  return ang < 22.5 || ang >= 157.5 ? "ns-resize" : ang < 67.5 ? "nesw-resize" : ang < 112.5 ? "ew-resize" : "nwse-resize";
}
/* Anropas från lagesplan.js vid mousedown. true = händelsen är hanterad. */
function zonesPointerDown(e) {
  if (!plan || !viewport || e.button !== 0) return false;
  if (zonePoly || zoneLabelPlace) return false; // klick hanteras i zonesClick (drag panorerar)
  // Zonens etikett: dra för att flytta, klicka för att redigera (som en notering).
  const lb = zoneLabelAt(stagePoint(e));
  // Låst etikett (Victors önskemål 2026-10-02): flyttas inte – drag panorerar, klick redigerar.
  if (lb && zoneLabelLocked(lb.zid)) return false;
  if (lb) {
    e.preventDefault();
    zoneLDrag = { ...lb, orig: JSON.stringify(plan.zones), moved: false, sx: e.clientX, sy: e.clientY, start: stagePoint(e) };
    return true;
  }
  const h = zoneVertexAt(e);
  if (h) {
    e.preventDefault();
    zoneVDrag = { ...h, orig: JSON.stringify(plan.zones), moved: false, sx: e.clientX, sy: e.clientY };
    return true;
  }
  const s = zoneEdgeAt(e);
  if (!s) return false;
  e.preventDefault();
  const poly = s.zone.polys[s.pi];
  zoneEDrag = { ...s, orig: JSON.stringify(plan.zones), moved: false, sx: e.clientX, sy: e.clientY, start: toPdf(stagePoint(e)),
    a: poly[s.vi].slice(), b: poly[(s.vi + 1) % poly.length].slice() };
  return true;
}
let zoneEDrag = null;
window.addEventListener("mousemove", e => {
  if (zoneLDrag) {
    if (!zoneLDrag.moved && Math.hypot(e.clientX - zoneLDrag.sx, e.clientY - zoneLDrag.sy) < 4) return;
    zoneLDrag.moved = true;
    const z = plan.zones.find(x => x.id === zoneLDrag.zid), p = stagePoint(e);
    if (!z) return;
    const pt = toPdf([zoneLDrag.bx + p[0] - zoneLDrag.start[0], zoneLDrag.by + p[1] - zoneLDrag.start[1]]);
    if (zoneLDrag.li >= 0 && z.labels && z.labels[zoneLDrag.li]) z.labels[zoneLDrag.li] = pt; else z.labels = [pt];
    renderZonesSoon();
    return;
  }
  if (zoneVDrag) {
    if (!zoneVDrag.moved && Math.hypot(e.clientX - zoneVDrag.sx, e.clientY - zoneVDrag.sy) < 3) return;
    zoneVDrag.moved = true;
    const poly = zoneVDrag.zone.polys[zoneVDrag.pi], n = poly.length;
    const raw = toPdf(stagePoint(e));
    let pt = raw;
    if (e.shiftKey) { // raka linjer mot föregående hörn
      const prev = poly[(zoneVDrag.vi - 1 + n) % n], dx = raw[0] - prev[0], dy = raw[1] - prev[1];
      const a = Math.round(Math.atan2(-dy, dx) * 180 / Math.PI / 5) * 5 * Math.PI / 180, len = dx * Math.cos(a) - dy * Math.sin(a);
      pt = [prev[0] + Math.cos(a) * len, prev[1] - Math.sin(a) * len];
    } else { const zs = zoneSnapPt(raw, e, zoneVDrag.zone.id); if (zs) pt = zs; else if (plan.calib && typeof snapPdf === "function") { try { pt = snapPdf(raw, e); } catch (err) {} } }
    poly[zoneVDrag.vi] = pt;
    zoneVDrag.zone._status = null;
    renderZonesSoon();
    return;
  }
  if (zoneEDrag) {
    const d = zoneEDrag;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 3) return;
    d.moved = true;
    const nx = -(d.b[1] - d.a[1]), ny = d.b[0] - d.a[0], nl = Math.hypot(nx, ny) || 1; // sidans normal (pdf)
    const raw = toPdf(stagePoint(e));
    let pt = raw;
    if (!e.shiftKey) { // fäst mot grannzoner (Shift = fri förflyttning längs normalen)
      const zs = zoneSnapPt(raw, e, d.zone.id); if (zs) pt = zs;
    }
    const off = ((pt[0] - d.start[0]) * nx + (pt[1] - d.start[1]) * ny) / nl;
    const poly = d.zone.polys[d.pi], n = poly.length;
    poly[d.vi] = [d.a[0] + nx / nl * off, d.a[1] + ny / nl * off];
    poly[(d.vi + 1) % n] = [d.b[0] + nx / nl * off, d.b[1] + ny / nl * off];
    d.zone._status = null;
    renderZonesSoon();
    return;
  }
  if (zonePoly && e.target.closest && e.target.closest("#viewport")) {
    zonePoly.cursor = zonePolyPoint(e);
    renderZonesSoon();
    return;
  }
  // Pekaren över en sida/ett hörn på den markerade zonen.
  const vp = $("viewport");
  if (vp && plan && selectedZoneId && !zoneVDrag && !zoneLDrag && e.target.closest && e.target.closest("#viewport")) {
    const edge = !zoneVertexAt(e) && zoneEdgeAt(e), c = zoneVertexAt(e) ? "move" : edge ? zoneEdgeCursor(edge) : "";
    if (c) { vp.style.cursor = c; vp._zoneCur = true; }
    else if (vp._zoneCur) { vp.style.cursor = ""; vp._zoneCur = false; }
  }
});
window.addEventListener("mouseup", () => {
  if (zoneLDrag) {
    const d = zoneLDrag; zoneLDrag = null;
    if (d.moved) { zoneUndoStack.push({ label: "Flytta etikett", zones: d.orig, planId: plan.id }); if (typeof lastUndoTarget !== "undefined") lastUndoTarget = "zone"; renderZones(); schedulePlanSave(); }
    else openZoneLabelPop(d.zid);
    return;
  }
  if (zoneEDrag) {
    const d = zoneEDrag; zoneEDrag = null;
    if (!d.moved) return;
    zoneUndoStack.push({ label: "Flytta zonsida", zones: d.orig, planId: plan.id });
    if (typeof lastUndoTarget !== "undefined") lastUndoTarget = "zone";
    zoneSnapMark = null;
    if (!clipZoneAgainstOthers(d.zone)) { zoneUndo(); return; }
    renderZones(); schedulePlanSave();
    return;
  }
  if (!zoneVDrag) return;
  const d = zoneVDrag; zoneVDrag = null;
  if (d.moved) {
    zoneUndoStack.push({ label: "Flytta zonhörn", zones: d.orig, planId: plan.id });
    if (typeof lastUndoTarget !== "undefined") lastUndoTarget = "zone";
    if (typeof snapMark !== "undefined") snapMark = null;
    zoneSnapMark = null;
    // Inte in i grannzonen: zonen klipps mot de andra.
    if (!clipZoneAgainstOthers(d.zone)) { zoneUndo(); return; }
    renderZones(); schedulePlanSave();
  }
});
/* Anropas från lagesplan.js vid ett klick (inte drag) på planen. */
function zonesClick(e) {
  if (zoneLabelPlace) {
    const z = plan.zones.find(x => x.id === zoneLabelPlace);
    zoneLabelPlace = null; updateZonePolyUi();
    if (z) { zoneSnapshot("Flytta etikett"); z.labels = [toPdf(stagePoint(e))]; renderZones(); schedulePlanSave(); }
    return true;
  }
  // Klick på en låst etikett öppnar den (där den kan låsas upp).
  if (!zonePoly) { const lb = zoneLabelAt(stagePoint(e)); if (lb && zoneLabelLocked(lb.zid)) { openZoneLabelPop(lb.zid); return true; } }
  if (!zonePoly) return false;
  zonePoly.pts.push(zonePolyPoint(e));
  updateZonePolyUi(); renderZones();
  return true;
}
function drawZoneOverlay(ctx, fontPx) {
  const lw = Math.max(1.5, fontPx / 8);
  // Fästpunkt mot en annan zon.
  if (zoneSnapMark && (zonePoly || zoneVDrag || zoneEDrag)) {
    const [x, y] = toPx(zoneSnapMark.pt), r = 7 / view.scale;
    ctx.save(); ctx.strokeStyle = "#db2777"; ctx.lineWidth = 2 / view.scale;
    ctx.beginPath(); if (zoneSnapMark.kind === "hörn") ctx.rect(x - r, y - r, r * 2, r * 2); else ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  // Hörnen på den markerade zonen.
  const z = selectedZoneId && !zonePoly && plan && (plan.zones || []).find(x => x.id === selectedZoneId);
  if (z) {
    const hs = Math.max(4, 6 / view.scale);
    ctx.save(); ctx.fillStyle = "#fff"; ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = Math.max(1.5, 2 / view.scale);
    (z.polys || []).forEach(poly => poly.forEach(v => { const [x, y] = toPx(v); ctx.fillRect(x - hs, y - hs, hs * 2, hs * 2); ctx.strokeRect(x - hs, y - hs, hs * 2, hs * 2); }));
    // Mitten på varje sida: ett runt handtag som visar att sidan kan dras.
    (z.polys || []).forEach(poly => poly.forEach((v, i) => {
      const a = toPx(v), b = toPx(poly[(i + 1) % poly.length]);
      ctx.beginPath(); ctx.arc((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, hs * 0.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }));
    ctx.restore();
  }
  if (!zonePoly) return;
  const P = zonePoly.pts.map(toPx), C = zonePoly.cursor ? toPx(zonePoly.cursor) : null;
  ctx.save();
  if (P.length) {
    ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    if (C) ctx.lineTo(C[0], C[1]);
    if (P.length > 1) { ctx.closePath(); ctx.fillStyle = "rgba(11,95,255,.12)"; ctx.fill(); }
    ctx.setLineDash([lw * 4, lw * 3]); ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = lw * 1.5; ctx.stroke(); ctx.setLineDash([]);
    P.forEach((p, i) => { ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(3, 5 / view.scale), 0, Math.PI * 2); ctx.fillStyle = i ? "#fff" : "#0b5fff"; ctx.fill(); ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = Math.max(1, 1.5 / view.scale); ctx.stroke(); });
  }
  ctx.restore();
}

// ---------------------------------------------------------------------
// Utseende i zonredigeringen
// ---------------------------------------------------------------------
const zoneOpt = (v, cur, l) => `<option value="${v}"${String(cur) === String(v) ? " selected" : ""}>${l}</option>`;
function renderZoneStyleUi(sel) {
  const box = $("zeStyle");
  if (!box) return;
  const list = (Array.isArray(sel) ? sel : [sel]).filter(Boolean), z = list[0], multi = list.length > 1;
  if (!z) { box.innerHTML = ""; return; }
  const s = zoneStyle(z), op = Math.round((s.fillOpacity != null ? s.fillOpacity : ZONE_ALPHA) * 100);
  box.innerHTML = `
    ${multi ? `<div class="muted">Ändringarna gäller alla ${list.length} markerade zoner.</div>` : `<label>Namn <span class="muted">(valfritt, t.ex. Hus A plan 2)</span></label><input type="text" class="zs-name" value="${escHtml(z.name || "")}" />`}
    <div class="zs-h">Fyllning</div>
    <div class="zs-row"><select class="zs-fill">${zoneOpt("phase", s.fill, "Statusfärg (fas)")}${zoneOpt("custom", s.fill, "Egen färg")}${zoneOpt("none", s.fill, "Ingen")}</select><input type="color" class="zs-fillc" value="${escHtml(s.fillColor)}"${s.fill === "custom" ? "" : " disabled"} /></div>
    <div class="zs-row"><span class="zs-l">Opacitet</span><input type="range" class="zs-op" min="0" max="100" step="5" value="${op}" /><span class="zs-v">${op} %</span></div>
    <div class="zs-row"><span class="zs-l">Mönster</span><select class="zs-pat">${zoneOpt("none", s.pattern, "Heltäckande")}${zoneOpt("hatch", s.pattern, "Snedstreck")}${zoneOpt("cross", s.pattern, "Rutnät")}${zoneOpt("dots", s.pattern, "Prickar")}</select></div>
    <div class="zs-h">Kantlinje</div>
    <div class="zs-row"><select class="zs-stroke">${zoneOpt("auto", s.stroke, "Som fyllningen")}${zoneOpt("custom", s.stroke, "Egen färg")}${zoneOpt("none", s.stroke, "Ingen")}</select><input type="color" class="zs-strokec" value="${escHtml(s.strokeColor)}"${s.stroke === "custom" ? "" : " disabled"} /></div>
    <div class="zs-row"><span class="zs-l">Tjocklek</span><input type="range" class="zs-w" min="0.25" max="5" step="0.25" value="${s.strokeWidth}" /><span class="zs-v">${s.strokeWidth}×</span></div>
    <div class="zs-row"><span class="zs-l">Linje</span><select class="zs-dash">${zoneOpt("auto", s.dash, "Automatisk")}${zoneOpt("solid", s.dash, "Heldragen")}${zoneOpt("dashed", s.dash, "Streckad")}${zoneOpt("dotted", s.dash, "Prickad")}</select></div>
    <div class="zs-h">Etikett</div>
    <div class="zs-row"><select class="zs-label">${zoneOpt("pill", s.label, "Färgad bubbla")}${zoneOpt("white", s.label, "Vit bubbla")}${zoneOpt("text", s.label, "Bara text")}${zoneOpt("none", s.label, "Ingen etikett")}</select>${multi ? "" : `<button type="button" class="zs-edlabel" title="Text, radbrytning, rotation och storlek – eller klicka på etiketten på planen">✏️ Redigera</button>`}</div>
    <div class="zs-row"><span class="zs-l">Storlek</span><input type="range" class="zs-ls" min="40" max="400" step="10" value="${Math.round(s.labelSize * 100)}" /><span class="zs-v">${Math.round(s.labelSize * 100)} %</span></div>
    <div class="zs-row zs-checks"><label class="check"><input type="checkbox" class="zs-pct"${s.labelPct ? " checked" : ""} /> Framdrift %</label><label class="check"><input type="checkbox" class="zs-showname"${s.labelName ? " checked" : ""} /> Namnet</label>${zoneOpt$("area") ? `<label class="check"><input type="checkbox" class="zs-area"${s.labelArea ? " checked" : ""} /> Ytan m²</label>` : ""}</div>
    <label class="check"><input type="checkbox" class="zs-hidden"${s.hidden ? " checked" : ""} /> Dölj zonen på planen <span class="muted">(räknas ändå)</span></label>
    <div class="row split" style="margin-top:6px;"><button type="button" class="zs-all" title="Ge alla zoner på planen samma utseende">⧉ Samma utseende på alla</button><button type="button" class="zs-reset">↺ Standard</button></div>`;
  const q = c => box.querySelector(c);
  let snapTaken = false;
  const change = (patch, label = "Ändra utseende") => {
    if (!snapTaken) { zoneSnapshot(label); snapTaken = true; }
    list.forEach(o => { o.style = { ...(o.style || {}), ...patch }; });
    renderZones(); schedulePlanSave();
  };
  if (q(".zs-name")) q(".zs-name").onchange = () => { zoneSnapshot("Byt namn"); z.name = q(".zs-name").value.trim(); renderZones(); renderZoneList(); schedulePlanSave(); };
  q(".zs-fill").onchange = () => { change({ fill: q(".zs-fill").value }); renderZoneStyleUi(list); };
  q(".zs-fillc").oninput = () => change({ fillColor: q(".zs-fillc").value, fill: "custom" });
  q(".zs-op").oninput = () => { q(".zs-op").nextElementSibling.textContent = q(".zs-op").value + " %"; change({ fillOpacity: Number(q(".zs-op").value) / 100 }); };
  q(".zs-pat").onchange = () => change({ pattern: q(".zs-pat").value });
  q(".zs-stroke").onchange = () => { change({ stroke: q(".zs-stroke").value }); renderZoneStyleUi(list); };
  q(".zs-strokec").oninput = () => change({ strokeColor: q(".zs-strokec").value });
  q(".zs-w").oninput = () => { q(".zs-w").nextElementSibling.textContent = q(".zs-w").value + "×"; change({ strokeWidth: Number(q(".zs-w").value) }); };
  q(".zs-dash").onchange = () => change({ dash: q(".zs-dash").value });
  q(".zs-label").onchange = () => change({ label: q(".zs-label").value });
  q(".zs-ls").oninput = () => { q(".zs-ls").nextElementSibling.textContent = q(".zs-ls").value + " %"; change({ labelSize: Number(q(".zs-ls").value) / 100 }); };
  q(".zs-pct").onchange = () => change({ labelPct: q(".zs-pct").checked });
  q(".zs-showname").onchange = () => change({ labelName: q(".zs-showname").checked });
  q(".zs-hidden").onchange = () => change({ hidden: q(".zs-hidden").checked });
  if (q(".zs-area")) q(".zs-area").onchange = () => change({ labelArea: q(".zs-area").checked });
  if (q(".zs-edlabel")) q(".zs-edlabel").onclick = () => openZoneLabelPop(z.id);
  q(".zs-reset").onclick = () => { zoneSnapshot("Standardutseende"); list.forEach(o => delete o.style); renderZones(); schedulePlanSave(); renderZoneStyleUi(list); };
  q(".zs-all").onclick = () => {
    const n = plan.zones.length - 1;
    if (!n || !confirm(`Ge alla ${n} andra zoner samma utseende som ${z.code}${multi ? " (den första markerade)" : ""}? (Namn och etikettens läge ändras inte.)`)) return;
    zoneSnapshot("Utseende på alla zoner");
    plan.zones.forEach(o => { if (o !== z) o.style = z.style ? { ...z.style } : undefined; if (o !== z && !o.style) delete o.style; });
    renderZones(); schedulePlanSave();
    setSaveStatus(`✓ Alla zoner har nu samma utseende som ${z.code}`);
  };
}

// ---------------------------------------------------------------------
// Koppling till resten
// ---------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  if ($("btnZonePoly")) $("btnZonePoly").onclick = startZonePoly;
  const origOpen = openEditor;
  openEditor = function (id) {
    $("zoneEditor").classList.remove("multi"); $("zeMultiInfo").classList.add("hidden");
    const r = origOpen.apply(this, arguments);
    const z = plan && plan.zones.find(x => x.id === id);
    renderZoneStyleUi(z); renderZoneArea(z);
    return r;
  };
  // Vanligt val (klick på planen eller i listan): flervalet släpps.
  const origSelect = selectZone;
  selectZone = function () { if (!zoneMultiBusy) zoneSel.clear(); return origSelect.apply(this, arguments); };
  // Valen sparas i webbläsaren.
  const opts = zoneOpts();
  [["zoActs", "acts"], ["zoArea", "area"], ["zoMulti", "multi"]].forEach(([id, k]) => {
    const c = $(id); if (!c) return;
    c.checked = !!opts[k];
    c.onchange = () => {
      const o = zoneOpts(); o[k] = c.checked;
      try { localStorage.setItem(ZONE_OPTS_KEY, JSON.stringify(o)); } catch (e) {}
      if (k === "multi" && !c.checked && zoneSel.size > 1) { const id0 = selectedZoneId; zoneSel.clear(); selectZone(id0); }
      renderZones();
      if (selectedZoneId) openEditor(selectedZoneId);
    };
  });
  if (Object.values(opts).some(v => v === true)) $("zoneOptsBox").open = true;
  // Rektangel och borttagning går också att ångra.
  const origFinish = finishDraw;
  finishDraw = function (a, b) {
    // Rektangelns hörn fäster mot andra zoner.
    const sa = zoneSnapPt(toPdf(a), null, null), sb = zoneSnapPt(toPdf(b), null, null); zoneSnapMark = null;
    if (sa) a = toPx(sa); if (sb) b = toPx(sb);
    const before = JSON.stringify(plan.zones || []); const n = (plan.zones || []).length, np = (plan.zones || []).reduce((s, z) => s + (z.polys || []).length, 0); const r = origFinish.call(this, a, b);
    if ((plan.zones || []).reduce((s, z) => s + (z.polys || []).length, 0) !== np || plan.zones.length !== n) {
      zoneUndoStack.push({ label: "Ny zon", zones: before, planId: plan.id }); if (typeof lastUndoTarget !== "undefined") lastUndoTarget = "zone";
      const z = plan.zones.find(x => x.id === selectedZoneId);
      if (z && !clipZoneAgainstOthers(z)) { zoneUndo(); return r; }
      renderZones(); schedulePlanSave();
    }
    return r; };
  $("zeDelete").onclick = () => deleteSelectedZone(true);
  const origSave = $("zeSave").onclick;
  $("zeSave").onclick = function () { zoneSnapshot("Ändra zon"); return origSave.apply(this, arguments); };
  // Byt plan: avbryt ritning.
  const origOpenPlan = openPlan;
  openPlan = async function () { zonePoly = null; zoneLabelPlace = null; updateZonePolyUi(); return origOpenPlan.apply(this, arguments); };
  // Dubbelklick: avsluta polygonen / ta bort ett hörn på den markerade zonen.
  $("viewport").addEventListener("dblclick", e => {
    if (zonePoly) {
      // Dubbelklicket har lagt till samma punkt två gånger.
      const p = zonePoly.pts, same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-3;
      while (p.length > 1 && same(p[p.length - 1], p[p.length - 2])) p.pop();
      finishZonePoly(); return;
    }
    const h = zoneVertexAt(e);
    if (!h) return;
    const poly = h.zone.polys[h.pi];
    if (poly.length <= 3) { setSaveStatus("En zon behöver minst tre hörn."); return; }
    zoneSnapshot("Ta bort zonhörn");
    poly.splice(h.vi, 1); renderZones(); schedulePlanSave();
  });
});
function deleteSelectedZone(ask) {
  if (zoneSel.size > 1) {
    const ids = new Set(zoneSel), n = ids.size;
    if (ask && !confirm(`Ta bort ${n} zoner? (Ctrl+Z ångrar)`)) return;
    zoneSnapshot(`Ta bort ${n} zoner`);
    plan.zones = plan.zones.filter(x => !ids.has(x.id));
    zoneSel.clear(); selectZone(null); schedulePlanSave();
    setSaveStatus(`🗑 ${n} zoner borttagna – Ctrl+Z ångrar`);
    return;
  }
  const z = plan && plan.zones.find(x => x.id === selectedZoneId);
  if (!z || (ask && !confirm(`Ta bort zon ${z.code}? (Ctrl+Z ångrar)`))) return;
  zoneSnapshot(`Ta bort zon ${z.code}`);
  plan.zones = plan.zones.filter(x => x.id !== z.id);
  selectZone(null); schedulePlanSave();
  setSaveStatus(`🗑 Zon ${z.code} borttagen – Ctrl+Z ångrar`);
}
window.addEventListener("keydown", e => {
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== "checkbox" && e.target.type !== "range") return;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && typeof lastUndoTarget !== "undefined" && lastUndoTarget === "zone") {
    if (zoneUndo()) { e.preventDefault(); e.stopImmediatePropagation(); }
    return;
  }
  if (zonePoly || zoneLabelPlace) {
    if (e.key === "Escape") { e.stopImmediatePropagation(); zoneLabelPlace = null; cancelZonePoly(); }
    else if (e.key === "Enter" && zonePoly) { e.preventDefault(); e.stopImmediatePropagation(); finishZonePoly(); }
    else if ((e.key === "Backspace" || e.key === "Delete") && zonePoly) { e.preventDefault(); e.stopImmediatePropagation(); zonePoly.pts.pop(); updateZonePolyUi(); renderZones(); }
    return;
  }
  // Delete på en markerad zon (när inget etableringsobjekt är markerat).
  if ((e.key === "Delete" || e.key === "Backspace") && selectedZoneId && !(typeof selectedSiteId !== "undefined" && selectedSiteId) && !(typeof siteTool !== "undefined" && siteTool)) {
    e.preventDefault(); e.stopImmediatePropagation(); deleteSelectedZone(false);
  }
}, true);

// ---------------------------------------------------------------------
// Fler zonfunktioner (Victors önskemål 2026-10-02) – var och en slås på
// under Zoner → Fler zonfunktioner (sparas i webbläsaren):
//   acts  – zonrutan listar aktiviteterna som kopplas, live medan man ändrar
//   area  – ytan i m² i listan och rutan, och som val i etiketten
//   multi – Ctrl-/Shift-klick i zonlistan markerar flera; utseendet ändras på alla
// ---------------------------------------------------------------------
const ZONE_OPTS_KEY = "lagesplan-zoneopts";
function zoneOpts() { try { return JSON.parse(localStorage.getItem(ZONE_OPTS_KEY) || "{}") || {}; } catch (e) { return {}; } }
const zoneOpt$ = k => !!zoneOpts()[k];

/* Zonens yta i m² (alla delar), eller null utan kalibrering. */
function zoneAreaM2(z) {
  if (!plan || !plan.calib || !(z.polys || []).length) return null;
  return z.polys.filter(p => p.length > 2).reduce((a, p) => a + polyAreaM(p.map(pdfToModel)), 0);
}
const fmtArea = v => v.toLocaleString("sv-SE", { maximumFractionDigits: v < 100 ? 1 : 0 });
function renderZoneArea(z) {
  const el = $("zeArea");
  if (!el) return;
  const on = zoneOpt$("area") && z;
  el.classList.toggle("hidden", !on);
  if (!on) return;
  const a = zoneAreaM2(z);
  el.textContent = a == null ? "Yta: kalibrera planen mot 3D (📐) för att få ytan i m²." : `Yta: ${fmtArea(a)} m²${(z.polys || []).length > 1 ? ` (${z.polys.length} delar)` : ""}`;
}

/* Aktiviteterna som zonen kopplar (med den koppling som står i rutan just nu). */
function renderZoneActs(tmp) {
  const box = $("zeActs");
  if (!box) return;
  const on = zoneOpt$("acts");
  box.classList.toggle("hidden", !on);
  if (!on) return;
  const fams = new Map();
  itemsForZone(tmp).forEach(it => { const k = objFamKey(it); if (!fams.has(k)) fams.set(k, []); fams.get(k).push(it); });
  const day = $("dateInput").value || todayIso();
  const rows = [...fams.values()].map(rs => ({ rs, it: rs[0], ph: zonePhase(rs, day), pr: zoneProgress(rs) }))
    .sort((a, b) => String(a.it.start_date || "9").localeCompare(String(b.it.start_date || "9")) || String(a.it.activity || "").localeCompare(String(b.it.activity || ""), "sv"));
  box.innerHTML = rows.length ? rows.slice(0, 60).map(r => `<div class="ze-act" title="${escHtml([r.it.activity, r.it.object_name, r.it.area, r.it.contractor].filter(Boolean).join(" · "))}">
      <span class="dp-phase" style="background:${phaseColor(r.ph)}"></span>
      <span class="grow">${escHtml(r.it.activity || r.it.object_name || "Aktivitet")}${r.rs.length > 1 ? ` <span class="muted">(${r.rs.length} obj.)</span>` : r.it.activity && r.it.object_name ? ` <span class="muted">${escHtml(r.it.object_name)}</span>` : ""}</span>
      <span class="muted">${r.pr != null ? r.pr + " %" : ""}</span></div>`).join("") + (rows.length > 60 ? `<div class="ze-act muted">+ ${rows.length - 60} till</div>` : "")
    : `<div class="ze-act muted">Inga aktiviteter kopplas med den här kopplingen.</div>`;
}

/* Flerval i zonlistan. */
const zoneSel = new Set();
let zoneSelAnchor = null, zoneMultiBusy = false;
function zoneRowClick(e, id, sorted) {
  const multi = zoneOpt$("multi") && (e.ctrlKey || e.metaKey || e.shiftKey);
  if (!multi) { zoneSel.clear(); zoneSelAnchor = id; selectZone(id, true); return; }
  if (!zoneSel.size && selectedZoneId) zoneSel.add(selectedZoneId);
  if (e.shiftKey && zoneSelAnchor) {
    const a = sorted.findIndex(z => z.id === zoneSelAnchor), b = sorted.findIndex(z => z.id === id);
    if (a >= 0 && b >= 0) sorted.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(z => zoneSel.add(z.id));
  } else {
    if (zoneSel.has(id)) zoneSel.delete(id); else zoneSel.add(id);
    zoneSelAnchor = id;
  }
  if (zoneSel.size <= 1) { const one = [...zoneSel][0] || id; zoneSel.clear(); selectZone(one, false); return; }
  openMultiEditor();
}
function openMultiEditor() {
  const list = plan.zones.filter(z => zoneSel.has(z.id));
  zoneMultiBusy = true;
  try { selectedZoneId = list[0] ? list[0].id : null; } finally { zoneMultiBusy = false; }
  const ed = $("zoneEditor");
  ed.classList.remove("hidden"); ed.classList.add("multi");
  $("zeTitle").textContent = `${list.length} zoner markerade`;
  const info = $("zeMultiInfo");
  info.classList.remove("hidden");
  const tot = zoneOpt$("area") ? list.reduce((a, z) => a + (zoneAreaM2(z) || 0), 0) : 0;
  info.textContent = `${list.map(z => z.code).join(", ")}${tot ? ` · totalt ${fmtArea(tot)} m²` : ""}. Ctrl-klicka för att lägga till eller ta bort, Shift-klicka för ett intervall.`;
  renderZoneStyleUi(list);
  renderZones();
}

// ---------------------------------------------------------------------
// Zonens etikett på planen – redigeras som en notering (Victors önskemål
// 2026-10-02): dra i etiketten för att flytta den, klicka för en ruta med
// text (radbrytningar och {kod} {namn} {%} {m2}), radbrytning efter antal
// tecken, rotation, storlek och stil. Ändringarna syns direkt; Avbryt
// återställer.
// ---------------------------------------------------------------------
let zoneLDrag = null; // { zid, li, bx, by, ... }
const zoneLabelLocked = zid => { const z = plan && (plan.zones || []).find(x => x.id === zid); return !!(z && z.style && z.style.labelLocked); };
function zoneLabelAt(p) {
  if (typeof layerVisible === "function" && !layerVisible("zones")) return null;
  for (let i = zoneLabelBoxes.length - 1; i >= 0; i--) {
    const b = zoneLabelBoxes[i], c = Math.cos(-b.rot || 0), s = Math.sin(-b.rot || 0);
    const dx = p[0] - b.x, dy = p[1] - b.y, lx = dx * c - dy * s, ly = dx * s + dy * c;
    if (Math.abs(lx) <= b.w / 2 + 2 && Math.abs(ly) <= b.h / 2 + 2) return { zid: b.zid, li: b.li, bx: b.x, by: b.y };
  }
  return null;
}
/* Vinkeln (grader, -90..90) längs zonens längsta sida. */
function zoneLongSideDeg(z) {
  let best = null, bl = 0;
  (z.polys || []).forEach(poly => poly.forEach((p, i) => {
    const a = toPx(p), b = toPx(poly[(i + 1) % poly.length]), l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (l > bl) { bl = l; best = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; }
  }));
  if (best == null) return 0;
  while (best > 90) best -= 180;
  while (best < -90) best += 180;
  return Math.round(best);
}
function openZoneLabelPop(zid) {
  const z = plan && plan.zones.find(x => x.id === zid);
  if (!z) return;
  if (selectedZoneId !== zid) selectZone(zid, false, true);
  const pop = $("sitePop"), before = JSON.stringify({ style: z.style || null, labels: z.labels || [] });
  const s = zoneStyle(z), rot = Math.round(Number(s.labelRot) || 0), size = Math.round((Number(s.labelSize) || 1) * 100);
  const autoText = [s.labelName && z.name ? "{kod} {namn}" : "{kod}", s.labelPct ? "{%}" : ""].filter(Boolean).join(" · ");
  pop.innerHTML = `
    <b class="dp-head">🏷 Etikett för zon ${escHtml(z.code)}</b>
    <label>Text <span class="muted">(Enter = ny rad)</span></label>
    <textarea class="zl-text" placeholder="Automatiskt: ${escHtml(autoText)}">${escHtml(s.labelText || "")}</textarea>
    <div class="zl-chips"><span class="muted">Infoga:</span>${["{kod}", "{namn}", "{%}", "{m2}"].map(t => `<button type="button" data-ins="${t}">${t}</button>`).join("")}</div>
    <div class="muted" style="font-size:11px;">Tom = automatiskt. {%} = framdrift, {m2} = ytan (kräver kalibrering).</div>
    <div class="row2"><div><label>Radbryt efter</label><select class="zl-wrap">${[0, 8, 12, 16, 20, 30].map(n => `<option value="${n}"${(Number(s.labelWrap) || 0) === n ? " selected" : ""}>${n ? n + " tecken" : "Ingen"}</option>`).join("")}</select></div>
      <div><label>Stil</label><select class="zl-kind">${[["pill", "Färgad bubbla"], ["white", "Vit bubbla"], ["text", "Bara text"], ["none", "Dold"]].map(([v, l]) => `<option value="${v}"${s.label === v ? " selected" : ""}>${l}</option>`).join("")}</select></div></div>
    <label>Rotation</label>
    <div class="zs-row"><input type="range" class="zl-rot" min="-180" max="180" step="1" value="${rot}" /><input type="text" class="zl-rotv" inputmode="numeric" value="${rot}" style="width:48px;text-align:right;" /><span class="muted">°</span></div>
    <div class="zl-chips"><button type="button" data-rot="0">0°</button><button type="button" data-rot="90">90°</button><button type="button" data-rot="-90">−90°</button><button type="button" data-rot="long" title="Längs zonens längsta sida">↗ Längs zonen</button></div>
    <label>Storlek</label>
    <div class="zs-row"><input type="range" class="zl-size" min="40" max="400" step="10" value="${size}" /><span class="zs-v zl-sizev">${size} %</span></div>
    ${z.labels && z.labels.length ? `<button type="button" class="zl-center" style="margin-top:6px;" title="Etiketten tillbaka mitt i zonen">↺ Tillbaka till mitten</button>` : ""}
    <label class="check" style="margin-top:8px;color:var(--text);"><input type="checkbox" class="zl-lock"${s.labelLocked ? " checked" : ""} style="width:auto;" /> 🔒 Lås texten (kan inte flyttas av misstag)</label>
    <div class="zl-chips"><button type="button" class="zl-lockall" title="Lås texterna i alla zoner på planen">🔒 Lås alla zoners texter</button><button type="button" class="zl-unlockall" title="Lås upp texterna i alla zoner">🔓 Lås upp alla</button></div>
    <div class="muted zl-hint" style="margin-top:4px;font-size:11px;">${s.labelLocked ? "Låst – klicka på texten för att ändra den." : "Dra i etiketten på planen för att flytta den."}</div>
    <div class="acts"><span></span><span><button class="zl-cancel">Avbryt</button> <button class="zl-save primary">Spara</button></span></div>`;
  pop.classList.remove("hidden");
  const b = zoneLabelBoxes.find(x => x.zid === zid);
  const r = $("viewport").getBoundingClientRect(), sp = b ? stageToScreen([b.x, b.y]) : [r.width / 2, r.height / 2];
  placeSitePop(pop, sp[0] + 24, sp[1] - 40);
  const q = c => pop.querySelector(c);
  const set = patch => { z.style = { ...(z.style || {}), ...patch }; renderZones(); };
  q(".zl-text").oninput = () => set({ labelText: q(".zl-text").value.replace(/\s+$/, "") || null });
  pop.querySelectorAll("[data-ins]").forEach(btn => btn.onclick = () => {
    const t = q(".zl-text"), i = t.selectionStart ?? t.value.length;
    t.value = t.value.slice(0, i) + btn.dataset.ins + t.value.slice(t.selectionEnd ?? i);
    t.focus(); t.selectionStart = t.selectionEnd = i + btn.dataset.ins.length; t.oninput();
  });
  q(".zl-wrap").onchange = () => set({ labelWrap: Number(q(".zl-wrap").value) || 0 });
  q(".zl-kind").onchange = () => set({ label: q(".zl-kind").value });
  const setRot = v => { v = Math.max(-180, Math.min(180, Math.round(Number(v) || 0))); q(".zl-rot").value = v; q(".zl-rotv").value = v; set({ labelRot: v }); };
  q(".zl-rot").oninput = () => setRot(q(".zl-rot").value);
  q(".zl-rotv").onchange = () => setRot(String(q(".zl-rotv").value).replace(",", "."));
  pop.querySelectorAll("[data-rot]").forEach(btn => btn.onclick = () => setRot(btn.dataset.rot === "long" ? zoneLongSideDeg(z) : btn.dataset.rot));
  q(".zl-size").oninput = () => { q(".zl-sizev").textContent = q(".zl-size").value + " %"; set({ labelSize: Number(q(".zl-size").value) / 100 }); };
  q(".zl-lock").onchange = () => { set({ labelLocked: q(".zl-lock").checked }); q(".zl-hint").textContent = q(".zl-lock").checked ? "Låst – klicka på texten för att ändra den." : "Dra i etiketten på planen för att flytta den."; };
  const lockAll = on => {
    zoneSnapshot(on ? "Lås alla zoners texter" : "Lås upp alla zoners texter");
    (plan.zones || []).forEach(x => { if (x !== z) x.style = { ...(x.style || {}), labelLocked: on }; });
    q(".zl-lock").checked = on; q(".zl-lock").onchange();
    schedulePlanSave(); setSaveStatus(on ? "🔒 Alla zoners texter är låsta." : "🔓 Alla zoners texter är upplåsta.");
  };
  q(".zl-lockall").onclick = () => lockAll(true);
  q(".zl-unlockall").onclick = () => lockAll(false);
  const ctr = q(".zl-center"); if (ctr) ctr.onclick = () => { z.labels = []; renderZones(); ctr.disabled = true; };
  const restore = () => { const o = JSON.parse(before); if (o.style) z.style = o.style; else delete z.style; z.labels = o.labels; };
  q(".zl-cancel").onclick = () => { restore(); pop.classList.add("hidden"); pop.innerHTML = ""; renderZones(); };
  q(".zl-save").onclick = () => {
    const now = { style: z.style, labels: z.labels };
    restore(); zoneSnapshot("Ändra etikett"); z.style = now.style; z.labels = now.labels;
    pop.classList.add("hidden"); pop.innerHTML = "";
    renderZones(); schedulePlanSave();
    if (selectedZoneId === z.id) renderZoneStyleUi(z);
  };
  pop.onkeydown = e => { if (e.key === "Escape") { e.stopPropagation(); q(".zl-cancel").click(); } };
}

/* Zoner överlappar aldrig (Victors önskemål 2026-10-02): en ny eller ändrad
   zon klipps mot alla andra zoner (polygon-clipping, MIT). Delar som blir
   kvar blir zonens ytor. false = inget blev kvar (zonen låg helt inuti andra). */
function clipZoneAgainstOthers(z) {
  if (typeof polygonClipping === "undefined" || !z) return true;
  const ring = poly => { const r = poly.map(p => [p[0], p[1]]); r.push(r[0].slice()); return [r]; };
  const others = (plan.zones || []).filter(o => o !== z).flatMap(o => (o.polys || []).filter(p => p.length > 2)).map(ring);
  const own = (z.polys || []).filter(p => p.length > 2);
  if (!others.length || !own.length) return true;
  const before = JSON.stringify(own);
  let parts = [], holes = false;
  try {
    own.forEach(poly => polygonClipping.difference(ring(poly), ...others).forEach(pg => {
      if (pg.length > 1) holes = true;
      const outer = pg[0].slice(0, -1);
      if (outer.length > 2 && Math.abs(polyArea(outer)) > 1) parts.push(outer);
    }));
  } catch (e) { console.warn("Kunde inte klippa zonen", e); return true; }
  if (!parts.length) { alert(`Zonen ${z.code} ligger helt inuti andra zoner och kan inte läggas där.`); return false; }
  if (JSON.stringify(parts) === before) return true;
  z.polys = parts;
  const hit = (plan.zones || []).filter(o => o !== z && (o.polys || []).some(p => own.some(q => q.some(v => pointInPoly(v, p)) || p.some(v => pointInPoly(v, q))))).map(o => o.code);
  const msg = `✂ Zon ${z.code} klipptes${hit.length ? " mot " + hit.join(", ") : ""} så att zonerna inte överlappar.${holes ? " (Den omslöt en annan zon – bara ytterkanten används.)" : ""}`;
  // Visas under zonknapparna en stund (statusraden skrivs över av "Sparad").
  const h = $("zoneDrawHint");
  if (h) { h.textContent = msg; h.classList.remove("hidden"); clearTimeout(clipZoneAgainstOthers.t); clipZoneAgainstOthers.t = setTimeout(() => { if (!zonePoly && !zoneLabelPlace) h.classList.add("hidden"); }, 7000); }
  return true;
}

// ---------------------------------------------------------------------
// Zonerna i lagerhanteraren (Victors önskemål 2026-10-02): lagret "Zoner"
// fälls ut med en rad per zon – kryssruta tänder/släcker, klick markerar
// zonen på planen, 🎯 markerar zonens objekt i 3D.
// ---------------------------------------------------------------------
function zoneLayerList() {
  if (!plan) return [];
  return (plan.zones || []).slice().sort((a, b) => String(a.code).localeCompare(String(b.code), "sv", { numeric: true }));
}
function zoneLayerRowsHtml(zones, opts = {}) {
  return zones.map(z => {
    const off = !!(z.style && z.style.hidden), st = z._status || zoneStatus(z);
    const zs = { ...ZONE_STYLE_DEFAULT, ...(z.style || {}) };
    const col = zs.fill === "custom" ? zs.fillColor : st.phase === "ingen" ? "#fff" : phaseColor(st.phase);
    const label = (z.code || "?") + (z.name ? " " + z.name : "");
    return `<div class="layer-row sub zone-layer-row${opts.inFolder ? " in-folder" : ""}${opts.hidden ? " hidden" : ""}${off ? " off" : ""}${z.id === selectedZoneId ? " sel" : ""}" data-zone="${escHtml(z.id)}">
      <input type="checkbox" class="zl-vis"${off ? "" : " checked"} title="${off ? "Tänd" : "Släck"} zonen" />
      <span class="zl-sw" style="background:${escHtml(col)}"></span>
      <span class="ln" title="${escHtml(label)} – ${escHtml(PHASE_LABELS[st.phase] || "")}. Klicka för att markera på planen.">${escHtml(label)}</span>
      <button type="button" class="zl-3d" title="Markera zonens objekt i 3D"${st.items.length ? "" : " disabled"}>🎯</button>
    </div>`;
  }).join("");
}
function setZoneHidden(ids, hide) {
  const zs = (plan.zones || []).filter(z => ids.includes(z.id));
  if (!zs.length) return;
  zoneSnapshot(hide ? "Släck zon" : "Tänd zon");
  zs.forEach(z => { z.style = { ...(z.style || {}), hidden: !!hide }; });
  if (hide && zs.some(z => z.id === selectedZoneId) && typeof selectZone === "function") selectZone(null);
  renderZones(); schedulePlanSave();
  if (typeof renderLayerPanel === "function") renderLayerPanel();
  setSaveStatus(`${hide ? "Släckte" : "Tände"} ${zs.length === 1 ? zs[0].code : zs.length + " zoner"} (Ctrl+Z ångrar).`);
}
function bindZoneLayerRows(el) {
  el.querySelectorAll(".zone-layer-row").forEach(row => {
    const id = row.dataset.zone;
    const z = () => (plan.zones || []).find(x => x.id === id);
    row.querySelector(".zl-vis").onclick = e => e.stopPropagation();
    row.querySelector(".zl-vis").onchange = e => setZoneHidden([id], !e.target.checked);
    row.querySelector(".zl-3d").onclick = e => { e.stopPropagation(); if (z()) selectZoneIn3d(z()); };
    row.querySelector(".ln").onclick = e => {
      e.stopPropagation();
      const zz = z(); if (!zz) return;
      if (zz.style && zz.style.hidden) { setSaveStatus(`${zz.code} är släckt – kryssa i rutan för att tända den.`); return; }
      selectZone(id, true);
      renderLayerPanel();
    };
  });
}
document.addEventListener("DOMContentLoaded", () => {
  const orig = renderLayerPanel;
  renderLayerPanel = function () { const r = orig.apply(this, arguments); const el = $("layerList"); if (el) bindZoneLayerRows(el); return r; };
  // Zonerna ändras (ny, borttagen, nytt namn, dold, ny fas): uppdatera lagerlistan.
  let sig = "";
  const orl = renderZoneList;
  renderZoneList = function () {
    const r = orl.apply(this, arguments);
    const s = zoneLayerList().map(z => [z.id, z.code, z.name, z.style && z.style.hidden, z.style && z.style.fill, z.style && z.style.fillColor, (z._status || {}).phase, (z._status || {}).items ? z._status.items.length : 0].join("|")).join(";") + "#" + selectedZoneId;
    if (s !== sig) { sig = s; renderLayerPanel(); }
    return r;
  };
});
