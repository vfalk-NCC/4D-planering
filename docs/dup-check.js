/* 4D-planering – dubblettkontroll (Victors önskemål 2026-10-01).
   Ett fel i kopplingsläget (rättat samma dag) kunde spara samma 3D-objekt
   flera gånger på samma aktivitet. Här hittas sådana dubbletter: samma
   modell + objekt-ID kopplat mer än en gång till SAMMA aktivitet. En rad
   ovanför listan visar antalet; "Granska" öppnar en lista där varje objekt
   kan visas i 3D och i listan, och där man själv väljer vilken koppling som
   behålls innan något tas bort. En säkerhetskopia tas först. */

/* Grupper: [{ key, rows: [item…], keepId }] – bara de med fler än en rad. */
function findDuplicateCouplings() {
  const map = new Map();
  items.forEach(it => {
    if (!it.modelId || !it.objectId || it._pending) return;
    const act = activityKeyOf(it);
    if (!act) return; // utan aktivitet (grupp/källa) kan två rader inte vara "samma aktivitet"
    const k = `${it.modelId}::${it.objectId}::${act}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(it);
  });
  return [...map.entries()].filter(([, rows]) => rows.length > 1).map(([key, rows]) => ({ key, rows, keepId: dupDefaultKeep(rows).id }));
}
/* Den som behålls som standard: den med mest kopplat till sig (kommentarer,
   delaktiviteter), annars den äldst sparade. */
function dupInfo(it) {
  return { comments: commentCounts.get(it.id) || 0, subs: (activitiesByItemId.get(it.id) || []).length };
}
function dupDefaultKeep(rows) {
  return rows.slice().sort((a, b) => {
    const ia = dupInfo(a), ib = dupInfo(b);
    return (ib.comments - ia.comments) || (ib.subs - ia.subs) || String(a.updatedAt || "").localeCompare(String(b.updatedAt || ""));
  })[0];
}

let dupGroups = [];
const dupChoice = new Map(); // grupp-key -> { keepId, include }
function renderDupBanner() {
  const el = document.getElementById("dupBanner");
  if (!el) return;
  dupGroups = findDuplicateCouplings();
  const extra = dupGroups.reduce((n, g) => n + g.rows.length - 1, 0);
  if (!extra) { el.classList.add("hidden"); el.innerHTML = ""; return; }
  el.innerHTML = `<span>⚠ <b>${extra} dubblett${extra > 1 ? "er" : ""}</b>: samma 3D-objekt kopplat flera gånger till samma aktivitet (${dupGroups.length} objekt).</span><button type="button" id="btnDupReview">Granska…</button>`;
  el.classList.remove("hidden");
  document.getElementById("btnDupReview").onclick = openDupDialog;
}

function dupLabel(it) {
  return `${it.objectName || it.activity || "Aktivitet"}${it.elementType ? " · " + it.elementType : ""}`;
}
function renderDupDialog() {
  const box = document.getElementById("dupList");
  dupGroups = findDuplicateCouplings();
  dupGroups.forEach(g => { if (!dupChoice.has(g.key)) dupChoice.set(g.key, { keepId: g.keepId, include: true }); });
  if (!dupGroups.length) {
    box.innerHTML = '<div class="hint">Inga dubbletter kvar.</div>';
  } else {
    box.innerHTML = dupGroups.map((g, gi) => {
      const ch = dupChoice.get(g.key), first = g.rows[0];
      return `<div class="dup-group${ch.include ? "" : " off"}" data-g="${gi}">
        <div class="dup-head">
          <label class="dup-inc" title="Ta med i rensningen"><input type="checkbox" data-inc="${gi}"${ch.include ? " checked" : ""} /></label>
          <button type="button" class="dup-show" data-show="${gi}" title="Markera objektet i 3D och visa raderna i listan">
            <b>${escapeHtml(dupLabel(first))}</b> <span class="hint">${escapeHtml(first.area || "")}</span><br/>
            <span class="hint">3D-objekt ${escapeHtml(String(first.objectId))} · ${g.rows.length} kopplingar</span>
          </button>
          <button type="button" class="dup-eye" data-show="${gi}" title="Visa i 3D">👁 Visa</button>
        </div>
        ${g.rows.map(r => {
          const inf = dupInfo(r), keep = ch.keepId === r.id;
          const facts = [r.startDate ? `${r.startDate} → ${r.endDate || "?"}` : "inga datum", inf.subs ? `${inf.subs} delakt.` : "", inf.comments ? `${inf.comments} kommentar${inf.comments > 1 ? "er" : ""}` : "", r.updatedAt ? `sparad ${String(r.updatedAt).slice(0, 16).replace("T", " ")}` : ""].filter(Boolean).join(" · ");
          return `<label class="dup-row${keep ? " keep" : ""}"><input type="radio" name="dupkeep${gi}" data-keep="${gi}" value="${escapeHtml(r.id)}"${keep ? " checked" : ""} />
            <span><b>${keep ? "Behålls" : "Tas bort"}</b> <span class="hint">${escapeHtml(facts)}</span></span></label>`;
        }).join("")}
      </div>`;
    }).join("");
  }
  const n = dupGroups.reduce((s, g) => s + (dupChoice.get(g.key).include ? g.rows.length - 1 : 0), 0);
  const btn = document.getElementById("btnDupClean");
  btn.disabled = !n;
  btn.textContent = n ? `Rensa (${n} koppling${n > 1 ? "ar" : ""} tas bort)` : "Rensa";
  box.querySelectorAll("[data-inc]").forEach(c => { c.onchange = () => { dupChoice.get(dupGroups[+c.dataset.inc].key).include = c.checked; renderDupDialog(); }; });
  box.querySelectorAll("[data-keep]").forEach(r => { r.onchange = () => { dupChoice.get(dupGroups[+r.dataset.keep].key).keepId = r.value; renderDupDialog(); }; });
  box.querySelectorAll("[data-show]").forEach(b => { b.onclick = () => showDupGroup(dupGroups[+b.dataset.show]); });
}
async function showDupGroup(g) {
  const msg = document.getElementById("dupMsg");
  const it = g.rows[0];
  // Raderna i listan (fälls ut/markeras) – dialogen ligger kvar.
  selectedItemKeys.clear(); selectedItemKeys.add(it.objectId);
  if (typeof jumpToItemsInList === "function") jumpToItemsInList(new Set([it.objectId]));
  try {
    await selectItemsInModel([it], { moveCamera: true });
    msg.textContent = `Objektet för ${dupLabel(it)} är markerat i 3D.`;
  } catch (e) { msg.textContent = e.message; }
}
function openDupDialog() {
  dupChoice.clear();
  document.getElementById("dupMsg").textContent = "";
  renderDupDialog();
  document.getElementById("dupDialog").classList.remove("hidden");
}
function closeDupDialog() { document.getElementById("dupDialog").classList.add("hidden"); }

async function cleanDuplicates() {
  const remove = [];
  dupGroups.forEach(g => { const ch = dupChoice.get(g.key); if (ch && ch.include) g.rows.forEach(r => { if (r.id !== ch.keepId) remove.push(r); }); });
  if (!remove.length) return;
  if (!confirm(`Ta bort ${remove.length} dubblettkoppling${remove.length > 1 ? "ar" : ""}? Den valda kopplingen för varje objekt behålls. En säkerhetskopia tas först.`)) return;
  const msg = document.getElementById("dupMsg"), btn = document.getElementById("btnDupClean");
  btn.disabled = true;
  try {
    msg.textContent = "Tar säkerhetskopia…";
    await createBackup(`Före rensning av ${remove.length} dubblettkopplingar`);
    msg.textContent = "Tar bort dubbletterna…";
    const ids = new Set(remove.map(r => r.id));
    await ghWriteJSON(settings.githubToken, itemsPath(), arr => arr.filter(r => !ids.has(r.id)), `Rensa ${ids.size} dubblettkopplingar`);
    await deleteCommentsForItems([...ids]);
    await deleteActivitiesForItems([...ids]);
    items = items.filter(it => !ids.has(it.id));
    itemsTotalCount = items.length;
    selectedItemKeys.clear();
    buildFilterOptions(); renderItemList(); initTimelineRange();
    dupChoice.clear();
    renderDupDialog();
    msg.textContent = `✓ ${ids.size} dubblettkoppling${ids.size > 1 ? "ar" : ""} borttagna. Säkerhetskopian finns under ⚙ Inställningar → Säkerhetskopior.`;
  } catch (e) {
    msg.textContent = "Kunde inte rensa: " + e.message;
    btn.disabled = false;
  }
}

(function wrapRender() {
  const orig = renderItemList;
  renderItemList = function () { const r = orig.apply(this, arguments); renderDupBanner(); return r; };
})();
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnDupClose").onclick = closeDupDialog;
  document.getElementById("btnDupClean").onclick = cleanDuplicates;
});
