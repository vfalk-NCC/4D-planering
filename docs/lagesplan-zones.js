/* Lägesplan – rita och forma zoner (Victors önskemål 2026-10-02).
   - ⬠ Polygon: klicka hörnen, Shift = raka linjer (5°-steg), fäster mot
     ritningens linjer (Alt släpper), dubbelklick/Enter avslutar, ⌫ tar bort
     senaste punkten, Esc avbryter. Samma kod som en befintlig zon = en del till.
   - Markerad zon: dra i hörnen, dubbelklicka ett hörn för att ta bort det,
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
function zonePolyPoint(e) {
  const raw = toPdf(stagePoint(e)), prev = zonePoly.pts[zonePoly.pts.length - 1] || null;
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
  if (existing) { existing.polys.push(pts); existing.source = "manual"; selectedZoneId = existing.id; }
  else {
    const z = { id: ghNewId(), code: code.toUpperCase(), polys: [pts], labels: [], rule: { field: "auto" }, source: "manual" };
    plan.zones = [...(plan.zones || []), z];
    selectedZoneId = z.id;
  }
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
/* Anropas från lagesplan.js vid mousedown. true = händelsen är hanterad. */
function zonesPointerDown(e) {
  if (!plan || !viewport || e.button !== 0) return false;
  if (zonePoly || zoneLabelPlace) return false; // klick hanteras i zonesClick (drag panorerar)
  const h = zoneVertexAt(e);
  if (!h) return false;
  e.preventDefault();
  zoneVDrag = { ...h, orig: JSON.stringify(plan.zones), moved: false, sx: e.clientX, sy: e.clientY };
  return true;
}
window.addEventListener("mousemove", e => {
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
    } else if (plan.calib && typeof snapPdf === "function") { try { pt = snapPdf(raw, e); } catch (err) {} }
    poly[zoneVDrag.vi] = pt;
    zoneVDrag.zone._status = null;
    renderZonesSoon();
    return;
  }
  if (zonePoly && e.target.closest && e.target.closest("#viewport")) {
    zonePoly.cursor = zonePolyPoint(e);
    renderZonesSoon();
  }
});
window.addEventListener("mouseup", () => {
  if (!zoneVDrag) return;
  const d = zoneVDrag; zoneVDrag = null;
  if (d.moved) {
    zoneUndoStack.push({ label: "Flytta zonhörn", zones: d.orig, planId: plan.id });
    if (typeof lastUndoTarget !== "undefined") lastUndoTarget = "zone";
    if (typeof snapMark !== "undefined") snapMark = null;
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
  if (!zonePoly) return false;
  zonePoly.pts.push(zonePolyPoint(e));
  updateZonePolyUi(); renderZones();
  return true;
}
function drawZoneOverlay(ctx, fontPx) {
  const lw = Math.max(1.5, fontPx / 8);
  // Hörnen på den markerade zonen.
  const z = selectedZoneId && !zonePoly && plan && (plan.zones || []).find(x => x.id === selectedZoneId);
  if (z) {
    const hs = Math.max(4, 6 / view.scale);
    ctx.save(); ctx.fillStyle = "#fff"; ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = Math.max(1.5, 2 / view.scale);
    (z.polys || []).forEach(poly => poly.forEach(v => { const [x, y] = toPx(v); ctx.fillRect(x - hs, y - hs, hs * 2, hs * 2); ctx.strokeRect(x - hs, y - hs, hs * 2, hs * 2); }));
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
function renderZoneStyleUi(z) {
  const box = $("zeStyle");
  if (!box) return;
  if (!z) { box.innerHTML = ""; return; }
  const s = zoneStyle(z), op = Math.round((s.fillOpacity != null ? s.fillOpacity : ZONE_ALPHA) * 100);
  box.innerHTML = `
    <label>Namn <span class="muted">(valfritt, t.ex. Hus A plan 2)</span></label><input type="text" class="zs-name" value="${escHtml(z.name || "")}" />
    <div class="zs-h">Fyllning</div>
    <div class="zs-row"><select class="zs-fill">${zoneOpt("phase", s.fill, "Statusfärg (fas)")}${zoneOpt("custom", s.fill, "Egen färg")}${zoneOpt("none", s.fill, "Ingen")}</select><input type="color" class="zs-fillc" value="${escHtml(s.fillColor)}"${s.fill === "custom" ? "" : " disabled"} /></div>
    <div class="zs-row"><span class="zs-l">Opacitet</span><input type="range" class="zs-op" min="0" max="100" step="5" value="${op}" /><span class="zs-v">${op} %</span></div>
    <div class="zs-row"><span class="zs-l">Mönster</span><select class="zs-pat">${zoneOpt("none", s.pattern, "Heltäckande")}${zoneOpt("hatch", s.pattern, "Snedstreck")}${zoneOpt("cross", s.pattern, "Rutnät")}${zoneOpt("dots", s.pattern, "Prickar")}</select></div>
    <div class="zs-h">Kantlinje</div>
    <div class="zs-row"><select class="zs-stroke">${zoneOpt("auto", s.stroke, "Som fyllningen")}${zoneOpt("custom", s.stroke, "Egen färg")}${zoneOpt("none", s.stroke, "Ingen")}</select><input type="color" class="zs-strokec" value="${escHtml(s.strokeColor)}"${s.stroke === "custom" ? "" : " disabled"} /></div>
    <div class="zs-row"><span class="zs-l">Tjocklek</span><input type="range" class="zs-w" min="0.25" max="5" step="0.25" value="${s.strokeWidth}" /><span class="zs-v">${s.strokeWidth}×</span></div>
    <div class="zs-row"><span class="zs-l">Linje</span><select class="zs-dash">${zoneOpt("auto", s.dash, "Automatisk")}${zoneOpt("solid", s.dash, "Heldragen")}${zoneOpt("dashed", s.dash, "Streckad")}${zoneOpt("dotted", s.dash, "Prickad")}</select></div>
    <div class="zs-h">Etikett</div>
    <div class="zs-row"><select class="zs-label">${zoneOpt("pill", s.label, "Färgad bubbla")}${zoneOpt("white", s.label, "Vit bubbla")}${zoneOpt("text", s.label, "Bara text")}${zoneOpt("none", s.label, "Ingen etikett")}</select><button type="button" class="zs-move" title="Klicka sedan på planen där etiketten ska stå">📍 Flytta</button></div>
    <div class="zs-row"><span class="zs-l">Storlek</span><input type="range" class="zs-ls" min="40" max="400" step="10" value="${Math.round(s.labelSize * 100)}" /><span class="zs-v">${Math.round(s.labelSize * 100)} %</span></div>
    <div class="zs-row zs-checks"><label class="check"><input type="checkbox" class="zs-pct"${s.labelPct ? " checked" : ""} /> Framdrift %</label><label class="check"><input type="checkbox" class="zs-showname"${s.labelName ? " checked" : ""} /> Namnet</label></div>
    <label class="check"><input type="checkbox" class="zs-hidden"${s.hidden ? " checked" : ""} /> Dölj zonen på planen <span class="muted">(räknas ändå)</span></label>
    <div class="row split" style="margin-top:6px;"><button type="button" class="zs-all" title="Ge alla zoner på planen samma utseende som den här">⧉ Samma utseende på alla</button><button type="button" class="zs-reset">↺ Standard</button></div>`;
  const q = c => box.querySelector(c);
  let snapTaken = false;
  const change = (patch, label = "Ändra utseende") => {
    if (!snapTaken) { zoneSnapshot(label); snapTaken = true; }
    z.style = { ...(z.style || {}), ...patch };
    renderZones(); schedulePlanSave();
  };
  q(".zs-name").onchange = () => { zoneSnapshot("Byt namn"); z.name = q(".zs-name").value.trim(); renderZones(); renderZoneList(); schedulePlanSave(); };
  q(".zs-fill").onchange = () => { change({ fill: q(".zs-fill").value }); renderZoneStyleUi(z); };
  q(".zs-fillc").oninput = () => change({ fillColor: q(".zs-fillc").value, fill: "custom" });
  q(".zs-op").oninput = () => { q(".zs-op").nextElementSibling.textContent = q(".zs-op").value + " %"; change({ fillOpacity: Number(q(".zs-op").value) / 100 }); };
  q(".zs-pat").onchange = () => change({ pattern: q(".zs-pat").value });
  q(".zs-stroke").onchange = () => { change({ stroke: q(".zs-stroke").value }); renderZoneStyleUi(z); };
  q(".zs-strokec").oninput = () => change({ strokeColor: q(".zs-strokec").value });
  q(".zs-w").oninput = () => { q(".zs-w").nextElementSibling.textContent = q(".zs-w").value + "×"; change({ strokeWidth: Number(q(".zs-w").value) }); };
  q(".zs-dash").onchange = () => change({ dash: q(".zs-dash").value });
  q(".zs-label").onchange = () => change({ label: q(".zs-label").value });
  q(".zs-ls").oninput = () => { q(".zs-ls").nextElementSibling.textContent = q(".zs-ls").value + " %"; change({ labelSize: Number(q(".zs-ls").value) / 100 }); };
  q(".zs-pct").onchange = () => change({ labelPct: q(".zs-pct").checked });
  q(".zs-showname").onchange = () => change({ labelName: q(".zs-showname").checked });
  q(".zs-hidden").onchange = () => change({ hidden: q(".zs-hidden").checked });
  q(".zs-move").onclick = () => { if (zonePoly) cancelZonePoly(); zoneLabelPlace = z.id; updateZonePolyUi(); };
  q(".zs-reset").onclick = () => { zoneSnapshot("Standardutseende"); delete z.style; renderZones(); schedulePlanSave(); renderZoneStyleUi(z); };
  q(".zs-all").onclick = () => {
    const n = plan.zones.length - 1;
    if (!n || !confirm(`Ge alla ${n} andra zoner samma utseende som ${z.code}? (Namn och etikettens läge ändras inte.)`)) return;
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
  openEditor = function (id) { const r = origOpen.apply(this, arguments); renderZoneStyleUi(plan && plan.zones.find(x => x.id === id)); return r; };
  // Rektangel och borttagning går också att ångra.
  const origFinish = finishDraw;
  finishDraw = function () { const before = JSON.stringify(plan.zones || []); const n = (plan.zones || []).length, np = (plan.zones || []).reduce((a, z) => a + (z.polys || []).length, 0); const r = origFinish.apply(this, arguments);
    if ((plan.zones || []).reduce((a, z) => a + (z.polys || []).length, 0) !== np || plan.zones.length !== n) { zoneUndoStack.push({ label: "Ny zon", zones: before, planId: plan.id }); if (typeof lastUndoTarget !== "undefined") lastUndoTarget = "zone"; }
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
