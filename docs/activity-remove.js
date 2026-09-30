/* 4D-planering – radera aktivitet / ta bort objekt ur aktivitet (Victors
   önskemål 2026-09-30).
   - En aktivitet raderas aldrig utan två bekräftelser, och en säkerhetskopia
     tas först (återställs via Historik).
   - Objekt kan tas bort ur en aktivitet utan att aktiviteten försvinner: tas
     det sista objektet bort blir aktiviteten kvar som "◇ Ej kopplad" med sina
     datum, delaktiviteter och manuella markeringar. */

function activityFamily(item) {
  const seen = new Set(), out = [];
  [item, ...siblingsOf(item)].forEach(m => { if (m && !seen.has(m.id)) { seen.add(m.id); out.push(m); } });
  return out;
}
function activityLabel(item) { return `"${item.objectName || item.activity || "aktiviteten"}"`; }

/* Två frågor innan en hel aktivitet raderas. */
function confirmDeleteActivity(label, nObjects) {
  if (!confirm(`Radera aktiviteten ${label}${nObjects > 1 ? ` med alla ${nObjects} objektkopplingar` : ""}?`)) return false;
  return confirm(`Är du helt säker?\n\nAktiviteten ${label} försvinner ur planeringen med datum, delaktiviteter, kommentarer och kopplingar. En säkerhetskopia tas först, så det går att återställa via Historik.\n\nVill du bara ta bort objekt ur aktiviteten? Välj Avbryt och använd på aktiviteten i stället.`);
}
async function backupBefore(reason) {
  try { await createBackup(reason); return true; }
  catch (e) { return confirm(`Säkerhetskopian kunde inte tas (${e.message}). Radera ändå?`); }
}

/* Radera hela aktiviteten (alla dess objekt). */
async function deleteActivityConfirmed(anchor) {
  if (!isBackendConfigured()) { alert("Ingen databas ansluten."); return; }
  const family = activityFamily(anchor);
  const label = activityLabel(anchor);
  if (!confirmDeleteActivity(label, family.filter(m => m.modelId).length)) return;
  if (!(await backupBefore(`Före radering av aktiviteten ${label}`))) return;
  try { await deleteItems(family); }
  catch (e) { alert("Kunde inte radera: " + e.message); return; }
  // Markeringar som hörde till aktiviteten tas också bort.
  const ids = new Set(family.map(m => m.id));
  if (typeof manualMarks !== "undefined" && manualMarks.some(m => ids.has(m.itemId))) {
    manualMarks = manualMarks.filter(m => !ids.has(m.itemId));
    ghWriteJSON(settings.githubToken, marksPath(), arr => arr.filter(m => !ids.has(m.itemId)), `Radera markeringar för ${label}`).catch(() => {});
    renderManualMarks();
  }
  family.forEach(m => selectedItemKeys.delete(m.objectId));
  await afterRemoval();
}
async function afterRemoval() {
  await refreshItems();
  await refreshActivities();
  buildFilterOptions();
  renderItemList();
  initTimelineRange();
}

/* Ta bort objekt ur en aktivitet. Aktiviteten finns kvar. */
async function removeObjectsFromActivity(anchor, toRemove, opts = {}) {
  if (!isBackendConfigured()) { alert("Ingen databas ansluten."); return false; }
  const family = activityFamily(anchor);
  const removeIds = new Set(toRemove.map(m => m.id));
  const removed = family.filter(m => removeIds.has(m.id));
  if (!removed.length) return false;
  if (!opts.noConfirm && !confirm(removed.length === 1
    ? `Ta bort objektet ur aktiviteten ${activityLabel(anchor)}? Aktiviteten finns kvar.`
    : `Ta bort ${removed.length} objekt ur aktiviteten ${activityLabel(anchor)}? Aktiviteten finns kvar.`)) return false;
  const remaining = family.filter(m => !removeIds.has(m.id));
  let keeper = remaining.find(m => !m.modelId) || remaining[0] || null;
  let toDelete = removed;
  try {
    if (!keeper) {
      // Det sista objektet: posten blir en okopplad aktivitet i stället för att raderas.
      const k = removed[0];
      const allSubs = groupSubActivityRows(family).map(({ members, ...r }) => r);
      const dates = family.flatMap(m => [m.startDate, m.endDate]).filter(Boolean).sort();
      const row = { ...toRow(k), model_id: null, object_id: `excel-${k.id}`,
        start_date: dates[0] || k.startDate || null, end_date: dates[dates.length - 1] || k.endDate || null };
      await ghWriteJSON(settings.githubToken, itemsPath(), arr => arr.map(r => r.id === k.id ? row : r), `Koppla loss sista objektet från ${activityLabel(anchor)}`);
      if (allSubs.length) await saveActivitiesForItemsBulk([{ planItemId: k.id, rows: allSubs }], `Delaktiviteter för ${activityLabel(anchor)}`);
      keeper = { ...k, id: k.id };
      toDelete = removed.filter(m => m.id !== k.id);
    }
    if (toDelete.length) await deleteItems(toDelete);
    // Manuella markeringar på borttagna poster flyttas till aktiviteten som finns kvar.
    const gone = new Set(toDelete.map(m => m.id));
    if (typeof manualMarks !== "undefined" && manualMarks.some(m => gone.has(m.itemId))) {
      manualMarks = manualMarks.map(m => gone.has(m.itemId) ? { ...m, itemId: keeper.id } : m);
      await ghWriteJSON(settings.githubToken, marksPath(), arr => arr.map(m => gone.has(m.itemId) ? { ...m, itemId: keeper.id } : m), "Flytta markeringar efter borttagna objekt");
    }
  } catch (e) {
    alert("Kunde inte ta bort objekten: " + e.message);
    await afterRemoval();
    return false;
  }
  removed.forEach(m => selectedItemKeys.delete(m.objectId));
  await afterRemoval();
  showLagesplanBanner(`${removed.length} objekt borttagna ur ${activityLabel(anchor)}${!remaining.length ? " – aktiviteten finns kvar som ej kopplad" : ""}.`, 6000);
  return true;
}

/* ---------------------------------------------------------------------
   -dialogen: välj objekt att ta bort (lista eller markering i 3D)
   ------------------------------------------------------------------- */
let removeDialogAnchor = null;
async function openRemoveObjectsDialog(anchor) {
  removeDialogAnchor = anchor;
  const members = activityFamily(anchor).filter(m => m.modelId);
  if (!members.length) { alert("Aktiviteten har inga kopplade objekt att ta bort."); return; }
  document.getElementById("removeObjTitle").innerText = `Ta bort objekt ur ${activityLabel(anchor)}`;
  await fetchModelObjectNames(members).catch(() => {});
  renderRemoveList(members, new Set());
  document.getElementById("removeObjDialog").classList.remove("hidden");
}
function renderRemoveList(members, checked) {
  const el = document.getElementById("removeObjList");
  el.innerHTML = members.map((m, i) => {
    const subs = (activitiesByItemId.get(m.id) || []).map(r => r.name).filter(Boolean);
    return `<label class="remove-obj-row"><input type="checkbox" data-id="${escapeHtml(m.id)}"${checked.has(m.id) ? " checked" : ""} />
      <span class="grow">${escapeHtml(memberLabel(m, members))}<br/><span class="hint">${escapeHtml(subs.length ? subs.join(", ") : "Hela aktiviteten")} · ${escapeHtml(formatDateRange(m))}</span></span>
      <button type="button" data-show="${escapeHtml(m.id)}" title="Visa i 3D">${icon("target")}</button></label>`;
  }).join("");
  el.querySelectorAll("[data-show]").forEach(b => { b.onclick = ev => { ev.preventDefault(); const m = members.find(x => x.id === b.dataset.show); if (m) selectItemsInModel([m]); }; });
  el.querySelectorAll("input[type=checkbox]").forEach(c => { c.onchange = updateRemoveCount; });
  updateRemoveCount();
}
function removeChecked() { return [...document.querySelectorAll("#removeObjList input:checked")].map(c => c.dataset.id); }
function updateRemoveCount() {
  const n = removeChecked().length;
  const b = document.getElementById("btnRemoveObjOk");
  b.disabled = !n; b.innerText = `Ta bort (${n})`;
}
/* Kryssa i de objekt som är markerade i 3D. */
async function checkFromModelSelection() {
  const members = activityFamily(removeDialogAnchor).filter(m => m.modelId);
  const keys = new Set();
  try {
    const sel = await API.viewer.getSelection();
    for (const s of sel || []) {
      const ids = await API.viewer.convertToObjectIds(s.modelId, s.objectRuntimeIds || []);
      (ids || []).forEach(id => keys.add(`${s.modelId}::${id}`));
    }
  } catch (e) { alert("Kunde inte läsa markeringen i 3D: " + e.message); return; }
  const checked = new Set(removeChecked());
  members.forEach(m => { if (keys.has(`${m.modelId}::${m.objectId}`)) checked.add(m.id); });
  renderRemoveList(members, checked);
  if (!keys.size) alert("Inga objekt är markerade i 3D. Markera objekten i modellen och försök igen.");
}
function closeRemoveDialog() { document.getElementById("removeObjDialog").classList.add("hidden"); removeDialogAnchor = null; }
async function confirmRemoveDialog() {
  const anchor = removeDialogAnchor;
  const ids = new Set(removeChecked());
  if (!anchor || !ids.size) return;
  const list = activityFamily(anchor).filter(m => ids.has(m.id));
  closeRemoveDialog();
  await removeObjectsFromActivity(anchor, list, { noConfirm: true });
}
function bindRemoveDialog() {
  const d = document.getElementById("removeObjDialog");
  if (!d) return;
  document.getElementById("btnRemoveObjCancel").onclick = closeRemoveDialog;
  document.getElementById("btnRemoveObjOk").onclick = confirmRemoveDialog;
  document.getElementById("btnRemoveObjFromSel").onclick = checkFromModelSelection;
  document.getElementById("btnRemoveObjAll").onclick = () => { document.querySelectorAll("#removeObjList input").forEach(c => { c.checked = true; }); updateRemoveCount(); };
}
document.addEventListener("DOMContentLoaded", bindRemoveDialog);
