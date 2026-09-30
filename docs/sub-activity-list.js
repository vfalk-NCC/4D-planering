/* 4D-planering – delaktiviteter direkt i listan (Victors önskemål 2026-09-30).
   En aktivitet med delaktiviteter kan fällas ut till en rad per delaktivitet,
   och 3D-objekt (eller manuella markeringar) kan kopplas direkt till en
   delaktivitet. Datamodellen är densamma som formulärets "Gäller"-val: ett
   objekt i aktiviteten som bara har vissa delaktiviteter (plan_item_activities
   per objekt) och vars datum följer just dem. */

const expandedSubs = new Set((() => { try { return JSON.parse(localStorage.getItem("4dplan-expanded-subs") || "[]"); } catch (e) { return []; } })());
function saveExpandedSubs() { try { localStorage.setItem("4dplan-expanded-subs", JSON.stringify([...expandedSubs])); } catch (e) {} }
let pendingCoupleSub = null; // { key, name, start, end, hours } medan man kopplar till en delaktivitet

const subOwnerKey = entry => activityKeyOf(entry.it) || `i:${entry.it.id}`;
const entryMembers = entry => entry.rep ? entry.members : [entry.it, ...siblingsOf(entry.it)];
/* Delaktiviteterna för en rad i listan, med vilka objekt de gäller. */
function subsForEntry(entry) {
  const members = entryMembers(entry);
  const rows = groupSubActivityRows(members);
  return rows.map(r => {
    const who = r.members ? members.filter(m => r.members.includes(m.id)) : members;
    return { ...r, key: subActivityKey(r), who, coupled: who.filter(m => m.modelId) };
  });
}
function subToggleHtml(entry) {
  const subs = subsForEntry(entry);
  if (!subs.length) return "";
  const open = expandedSubs.has(subOwnerKey(entry));
  return `<br/><button type="button" class="group-tag sub-toggle-btn" data-action="toggle-subs" title="${open ? "Dölj delaktiviteterna" : "Visa delaktiviteterna och koppla objekt direkt till dem"}">${subs.length} delaktivitet${subs.length === 1 ? "" : "er"} ${open ? "▾" : "▸"}</button>`;
}
function subMarks(entry, sub) {
  if (typeof manualMarks === "undefined") return [];
  const ids = new Set(entryMembers(entry).map(m => m.id));
  return manualMarks.filter(m => ids.has(m.itemId) && m.subName && m.subName === sub.name);
}
function subRowsHtml(entry, idx) {
  if (entry.member || !expandedSubs.has(subOwnerKey(entry))) return "";
  const subs = subsForEntry(entry);
  if (!subs.length) return "";
  return `<div class="sub-rows" data-parent-index="${idx}">${subs.map((s, i) => {
    const nm = subMarks(entry, s).length;
    const dates = s.start || s.end ? `${s.start || "?"} → ${s.end || "?"}` : "Inga datum";
    return `<div class="sub-row" data-sub="${i}">
        <span class="sub-main" data-action="sub-select" title="Klicka för att markera delaktivitetens objekt i 3D">
          <span class="sub-name">↳ ${escapeHtml(s.name || "(namnlös)")}</span><br/>
          <span class="item-dates">${escapeHtml(dates)}</span>
          ${s.coupled.length ? `<span class="sub-count" title="${s.coupled.length} objekt kopplade till delaktiviteten">${s.coupled.length} objekt</span>` : '<span class="uncoupled-tag">◇ Ej kopplad</span>'}
          ${nm ? `<span class="manual-tag" data-action="sub-marks" title="Visa i 3D – högerklick tar bort">Manuell markering${nm > 1 ? ` (${nm})` : ""}</span>` : ""}
        </span>
        <button class="couple-btn" data-action="sub-couple" title="Koppla 3D-objekt (eller rita en markering) till &quot;${escapeHtml(s.name || "")}&quot; – klicka objekten i 3D och tryck Spara">${icon("link")}</button>
      </div>`;
  }).join("")}</div>`;
}
function bindSubRows(el, row, entry) {
  const tgl = row.querySelector('[data-action="toggle-subs"]');
  if (tgl) tgl.onclick = ev => {
    ev.stopPropagation();
    const k = subOwnerKey(entry);
    if (expandedSubs.has(k)) expandedSubs.delete(k); else expandedSubs.add(k);
    saveExpandedSubs(); renderItemList();
  };
  const box = el.querySelector(`.sub-rows[data-parent-index="${row.dataset.index}"]`);
  if (!box) return;
  const subs = subsForEntry(entry);
  box.querySelectorAll(".sub-row").forEach(sr => {
    const s = subs[Number(sr.dataset.sub)];
    if (!s) return;
    sr.querySelector('[data-action="sub-couple"]').onclick = ev => { ev.stopPropagation(); armSubCouple(entry, s); };
    sr.querySelector('[data-action="sub-select"]').onclick = ev => {
      const ms = subMarks(entry, s);
      if (ms.length && typeof jumpToMarkList === "function" && !ev.ctrlKey && !ev.metaKey) jumpToMarkList(ms);
      if (s.coupled.length) onActivityRowClicked(s.coupled, ev);
    };
    const mt = sr.querySelector('[data-action="sub-marks"]');
    if (mt) {
      mt.onclick = ev => { ev.stopPropagation(); jumpToMarkList(subMarks(entry, s)); };
      mt.oncontextmenu = ev => { ev.preventDefault(); ev.stopPropagation(); deleteMarkList(subMarks(entry, s), `"${s.name}"`); };
    }
  });
}

/* ---------------------------------------------------------------------
   Koppla till en delaktivitet
   ------------------------------------------------------------------- */
function armSubCouple(entry, sub) {
  // Aktivitetens "mall": en okopplad post om det finns en, annars första objektet.
  const members = entryMembers(entry);
  const base = members.find(m => !m.modelId) || entry.it;
  pendingCoupleSub = { key: sub.key, name: sub.name, start: sub.start, end: sub.end, hours: sub.hours };
  armCoupleMode(base);
}
/* Samma aktivitet som posten som kopplas (då läggs delaktiviteten till på objektet). */
function inSameActivity(item, other) {
  return other && (other.id === item.id || siblingsOf(item).some(s => s.id === other.id));
}
async function coupleObjectsToSub(item, sub, objs) {
  if (!isBackendConfigured()) { alert("Ingen databas ansluten. Ange GitHub-token i inställningarna."); return; }
  const family = [item, ...siblingsOf(item)];
  const groupId = (family.find(m => m.groupId) || {}).groupId || ghNewId();
  const subRow = { name: sub.name, start: sub.start || "", end: sub.end || "", hours: sub.hours ?? "" };
  const rows = [];        // plan_items att skriva
  const actBatches = [];  // delaktiviteter per objekt
  const withSub = (list, r) => list.some(x => subActivityKey(x) === subActivityKey(r)) ? list : [...list, r];
  const spanOf = list => { const d = list.flatMap(r => [r.start, r.end]).filter(Boolean).sort(); return [d[0] || null, d[d.length - 1] || null]; };
  objs.forEach(o => {
    const existing = items.find(it => it.modelId === o.modelId && String(it.objectId) === String(o.objectId));
    if (existing) {
      // Redan med i aktiviteten: lägg till delaktiviteten på objektet.
      const cur = activitiesByItemId.get(existing.id) || [];
      const next = withSub(cur, subRow);
      if (next.length === cur.length) return;
      const [s, e] = spanOf(next);
      rows.push({ ...toRow(existing), start_date: s || existing.startDate || null, end_date: e || existing.endDate || null });
      actBatches.push({ planItemId: existing.id, rows: next.map(x => ({ ...x })) });
      return;
    }
    const id = ghNewId();
    rows.push({ ...toRow(item), id, group_id: groupId, model_id: o.modelId, object_id: String(o.objectId),
      start_date: sub.start || item.startDate || null, end_date: sub.end || item.endDate || null });
    actBatches.push({ planItemId: id, rows: [{ ...subRow }] });
  });
  // Alla i aktiviteten (mallen och befintliga objekt) i samma grupp som de nya,
  // så att listan visar dem som en aktivitet.
  family.forEach(m => {
    if (m.groupId === groupId) return;
    const r = rows.find(x => x.id === m.id);
    if (r) r.group_id = groupId; else rows.push({ ...toRow(m), group_id: groupId });
  });
  if (!rows.some(r => !family.some(m => m.id === r.id) || actBatches.some(b => b.planItemId === r.id))) { showLagesplanBanner(`Objekten har redan delaktiviteten "${sub.name}".`, 5000); return; }
  const ids = new Set(rows.map(r => r.id));
  rows.forEach(row => {
    const opt = { ...fromRow(row), _pending: true, _saveError: null };
    const i = items.findIndex(it => it.id === row.id);
    if (i >= 0) items[i] = opt; else items.push(opt);
  });
  itemsTotalCount = items.length;
  actBatches.forEach(b => activitiesByItemId.set(b.planItemId, b.rows));
  const k = activityKeyOf({ ...item, groupId });
  if (k) { expandedSubs.add(k); saveExpandedSubs(); }
  renderItemList();
  try {
    await Promise.all([
      ghWriteJSON(settings.githubToken, itemsPath(), arr => {
        const byId = new Map(rows.map(r => [r.id, r]));
        const next = arr.map(r => byId.has(r.id) ? byId.get(r.id) : r);
        const have = new Set(arr.map(r => r.id));
        rows.forEach(r => { if (!have.has(r.id)) next.push(r); });
        return next;
      }, `Koppla ${objs.length} objekt till delaktiviteten ${sub.name}`),
      saveActivitiesForItemsBulk(actBatches, `Delaktiviteten ${sub.name}`),
    ]);
    items.forEach(it => { if (ids.has(it.id)) { it._pending = false; it._saveError = null; } });
    buildFilterOptions(); renderItemList(); initTimelineRange();
  } catch (e) {
    console.error("Kunde inte koppla till delaktiviteten:", e);
    items.forEach(it => { if (ids.has(it.id)) { it._pending = false; it._saveError = e.message; } });
    renderItemList();
    alert(`Kunde inte koppla till "${sub.name}": ${e.message}`);
  }
}
