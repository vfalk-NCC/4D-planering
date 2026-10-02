/* Lägesplan – 3D-objekten i lagerlistan (Victors önskemål 2026-10-02).
   Lagret "3D-Objekt" kan fällas ut: en rad per aktivitet (samma "familj"
   som släckningen: grupp, källa från 4-veckorsplaneringen eller enskild
   rad) bland objekten som ligger på planen. Klick markerar aktiviteten på
   planen och i 3D, Ctrl-/Shift-klick markerar flera. 👁 släcker/tänder,
   Delete släcker de markerade (Ctrl+Z ångrar). */

const objFamSel = new Set(); // item-id:n som är markerade via listan (ringar på planen)

/* Aktiviteterna med objekt på planen: [{ key, rows, it, hidden (antal släckta) }]. */
function objListFamilies() {
  if (typeof positionsInPdf !== "function" || !plan) return [];
  const pos = positionsInPdf();
  if (!pos || !pos.size) return [];
  const map = new Map();
  items.forEach(it => {
    if (!pos.has(it.id)) return;
    const k = objFamKey(it);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(it);
  });
  return [...map.entries()].map(([key, rows]) => ({ key, rows, it: rows[0], hidden: rows.filter(isObjHidden).length }))
    .sort((a, b) => famName(a.it).localeCompare(famName(b.it), "sv", { numeric: true }) || String(a.it.area || "").localeCompare(String(b.it.area || ""), "sv"));
}
function objRowsHtml(fams, opts = {}) {
  const day = $("dateInput").value || todayIso();
  return fams.map(f => {
    const off = f.hidden === f.rows.length, part = f.hidden && !off;
    const ph = zonePhase(f.rows, day);
    const key = "o:" + f.key;
    const title = [famName(f.it), f.it.area, f.it.contractor, `${f.rows.length} objekt`].filter(Boolean).join(" · ");
    return `<div class="layer-row sub obj-item-row${opts.inFolder ? " in-folder" : ""}${opts.hidden ? " hidden" : ""}${off ? " off" : ""}${itemSel.has(key) ? " sel" : ""}" data-item="${escHtml(key)}">
      <span class="oi-dot" style="background:${ph === "ingen" ? "#fff" : phaseColor(ph)}" title="${escHtml(PHASE_LABELS[ph] || "")}"></span>
      <span class="ln" title="${escHtml(title)} – klicka för att markera på planen och i 3D">${escHtml(famName(f.it))}${f.it.area ? ` <small>${escHtml(f.it.area)}</small>` : ""}${f.rows.length > 1 ? ` <small>${f.rows.length} obj.</small>` : ""}${part ? ` <small>(${f.hidden} släckta)</small>` : ""}</span>
      <button type="button" class="oi-3d" title="Markera i 3D">🎯</button>
      <button type="button" class="oi-eye" title="${off ? "Tänd" : "Släck"} på planen">${off ? "🙈" : "👁"}</button>
    </div>`;
  }).join("");
}
const famsByKeys = keys => { const set = new Set(keys); return objListFamilies().filter(f => set.has(f.key)); };

/* Markera aktiviteterna: ringar på planen, centrera och markera i 3D. */
async function showObjFams(keys, center) {
  const fams = famsByKeys(keys), rows = fams.flatMap(f => f.rows);
  objFamSel.clear(); rows.forEach(it => objFamSel.add(it.id));
  if (typeof selectedObjId !== "undefined") selectedObjId = null;
  const pos = positionsInPdf();
  const pts = rows.map(it => pos && pos.get(it.id)).filter(Boolean);
  if (center && pts.length && typeof centerOnPdf === "function") centerOnPdf([pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length]);
  renderZones();
  const hiddenN = rows.filter(isObjHidden).length;
  const name = fams.length === 1 ? `"${famName(fams[0].it)}"` : `${fams.length} aktiviteter`;
  if (!window.opener || window.opener.closed) { setSaveStatus(`${name} markerad på planen${hiddenN ? ` (${hiddenN} objekt är släckta)` : ""}. Öppna lägesplanen via 🗺️ i 4D-planering för att markera i 3D.`); return; }
  setSaveStatus(`🎯 Markerar ${name} i 3D…`);
  try { await askOpener("select", { ids: rows.map(it => it.id), jump: fams.length === 1 }, 30000); setSaveStatus(`🎯 ${name} markerad i 3D och på planen.`); }
  catch (e) { setSaveStatus(`⚠ Kunde inte markera i 3D: ${e.message}`); }
}
/* Släck (hide = true) eller tänd aktiviteterna på planen. */
function hideObjFams(keys, hide) {
  const fams = famsByKeys(keys);
  if (!fams.length) return;
  const h = objHidden(), fset = new Set(h.fams);
  if (hide) fams.forEach(f => fset.add(f.key));
  else {
    const ids = new Set(fams.flatMap(f => f.rows.map(it => it.id))), acts = new Set(fams.flatMap(f => f.rows.map(it => String(it.activity || "").trim())));
    fams.forEach(f => fset.delete(f.key));
    h.ids = h.ids.filter(id => !ids.has(id));
    h.acts = h.acts.filter(a => !acts.has(a));
  }
  h.fams = [...fset];
  setObjHidden(h);
  const name = fams.length === 1 ? famName(fams[0].it) : `${fams.length} aktiviteter`;
  statusWithUndo(`${hide ? "Släckte" : "Tände"} ${name}.`);
  if (typeof renderLayerPanel === "function") renderLayerPanel();
}
/* Markeringsraden ovanför listan när bara 3D-objekt är markerade. */
function objSelBar(bar, keys) {
  const famKeys = keys.map(k => k.slice(2));
  bar.innerHTML = `<b>${keys.length} aktivitet${keys.length > 1 ? "er" : ""}</b>
    <button type="button" data-a="sel3d" title="Markera alla i 3D">🎯 Markera i 3D</button>
    <button type="button" data-a="hide" title="Släck på planen (Delete)">🙈 Släck</button>
    <button type="button" data-a="show" title="Tänd på planen">👁 Tänd</button>
    <button type="button" data-a="clear" class="ghost" title="Avmarkera (Esc)">✕</button>`;
  bar.classList.remove("hidden");
  bar.querySelector('[data-a="sel3d"]').onclick = () => showObjFams(famKeys, false);
  bar.querySelector('[data-a="hide"]').onclick = () => hideObjFams(famKeys, true);
  bar.querySelector('[data-a="show"]').onclick = () => hideObjFams(famKeys, false);
  bar.querySelector('[data-a="clear"]').onclick = () => { itemSel.clear(); objFamSel.clear(); updateItemSelection(); renderZones(); };
  // Flera markerade i listan: visa dem på planen också.
  if (keys.length > 1) { objFamSel.clear(); famsByKeys(famKeys).forEach(f => f.rows.forEach(it => objFamSel.add(it.id))); renderZonesSoon(); }
}
function drawObjFamHighlight(ctx, fontPx) {
  if (!objFamSel.size || !$("showObjects").checked) return;
  const shapes = objectShapesInPdf() || [];
  ctx.save(); ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = Math.max(2.5, fontPx / 6);
  shapes.forEach(o => {
    if (!objFamSel.has(o.it.id)) return;
    const [x, y] = toPx(o.center);
    ctx.beginPath(); ctx.arc(x, y, Math.max(10, fontPx * 0.85), 0, Math.PI * 2); ctx.stroke();
  });
  ctx.restore();
}
/* Knapparna på raderna (klick på raden sköts av bindSiteItemRows). */
function bindObjRows(el) {
  el.querySelectorAll(".obj-item-row").forEach(row => {
    const key = row.dataset.item.slice(2);
    row.querySelector(".oi-3d").onclick = e => { e.stopPropagation(); showObjFams([key], true); };
    row.querySelector(".oi-eye").onclick = e => { e.stopPropagation(); hideObjFams([key], !row.classList.contains("off")); };
  });
}
document.addEventListener("DOMContentLoaded", () => {
  const orig = renderLayerPanel;
  renderLayerPanel = function () { const r = orig.apply(this, arguments); const el = $("layerList"); if (el) bindObjRows(el); return r; };
  // Ny plan eller nya positioner: listan med aktiviteter ändras.
  const op = openPlan; openPlan = async function () { const r = await op.apply(this, arguments); renderLayerPanel(); return r; };
  if (typeof fetchPositions === "function") { const fp = fetchPositions; fetchPositions = async function () { const r = await fp.apply(this, arguments); renderLayerPanel(); return r; }; }
});
