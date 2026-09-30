/* 4D-planering – UI-skal (UI-översynen 2026-09-30).
   - Flikar: Planera / Tidslinje / Import & verktyg (panelernas data-tab).
   - Tidslinjen (▶, datum, reglage) ligger alltid synlig längst ner.
   - Listans verktygsrad: sök + "Filter ▾" (gruppera, sortera, visa, område/
     aktivitet/entreprenör/status som klickbara etiketter) + "⋯"-meny.
   - Aktiva filter visas som etiketter med ✕ under verktygsraden.
   - Åtgärdsrad när rader är markerade (Redigera, Namn i 3D, Radera, ✕).
   - Radernas "⋯"-meny (kommentarer, ta bort objekt, radera).
   - Formuläret öppnas som en panel ovanpå listan (Esc stänger).
   - revealElement(el): gör ett element synligt (byter flik, öppnar meny/
     filter/"Mer"/radmeny, fäller ut panel) – används t.ex. för att hoppa
     till något som ligger dolt. */

const TAB_KEY = "4dplan-tab";
function currentTab() {
  try { return localStorage.getItem(TAB_KEY) || "plan"; } catch (e) { return "plan"; }
}
function showTab(tab) {
  document.querySelectorAll("#mainTabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll("section.panel[data-tab]").forEach(p => p.classList.toggle("tab-hidden", p.dataset.tab !== tab));
  try { localStorage.setItem(TAB_KEY, tab); } catch (e) {}
}

/* ---------- menyer och filterrutan ---------- */
function closeMenus(except) {
  ["listMenu", "listFilterBox"].forEach(id => { if (id !== except) document.getElementById(id)?.classList.add("hidden"); });
  document.getElementById("btnListFilter")?.classList.toggle("active", !document.getElementById("listFilterBox").classList.contains("hidden"));
}
function closeRowMenus(except) {
  document.querySelectorAll("#itemList .row-menu:not(.hidden)").forEach(m => { if (m !== except) m.classList.add("hidden"); });
}
function toggleRowMenu(row) {
  const m = row.querySelector(".row-menu");
  if (!m) return;
  closeRowMenus(m);
  m.classList.toggle("hidden");
}

/* ---------- filteretiketter (område/aktivitet/entreprenör/status) ---------- */
function renderChipSelects() {
  document.querySelectorAll(".chip-select").forEach(box => {
    const sel = document.getElementById(box.dataset.for);
    if (!sel) return;
    const opts = [...sel.options];
    box.innerHTML = opts.length
      ? opts.map((o, i) => `<button type="button" class="chip${o.selected ? " on" : ""}" data-i="${i}" data-value="${escapeHtml(o.value)}">${escapeHtml(o.text)}</button>`).join("")
      : '<span class="hint">–</span>';
    box.querySelectorAll(".chip").forEach(c => {
      c.onclick = () => {
        const o = sel.options[Number(c.dataset.i)];
        o.selected = !o.selected;
        sel.dispatchEvent(new Event("change"));
        renderChipSelects();
      };
    });
  });
}

/* ---------- aktiva filter som etiketter + räknare på "Filter ▾" ---------- */
function activeFilterList() {
  const out = [];
  const chk = (id, label) => { const el = document.getElementById(id); if (el && el.checked) out.push({ label, clear: () => { el.checked = false; } }); };
  chk("hideCompleted", "Dölj klara"); chk("showOnlyCompleted", "Endast klara");
  chk("todayOnly", "Endast idag"); chk("uncoupledOnly", "Endast ej kopplade");
  ["filterArea", "filterActivity", "filterContractor", "filterStatus"].forEach(id => {
    const sel = document.getElementById(id);
    [...sel.selectedOptions].forEach(o => out.push({ label: o.text, clear: () => { o.selected = false; renderChipSelects(); } }));
  });
  const w = document.getElementById("filterWeeks");
  if (w.value) out.push({ label: w.options[w.selectedIndex].text, clear: () => { w.value = ""; } });
  return out;
}
function renderActiveFilterChips() {
  const box = document.getElementById("activeFilterChips");
  if (!box) return;
  const list = activeFilterList();
  const badge = document.getElementById("filterCountBadge");
  badge.textContent = list.length || "";
  badge.classList.toggle("hidden", !list.length);
  box.innerHTML = list.map((f, i) => `<span class="active-chip">${escapeHtml(f.label)}<button type="button" data-i="${i}" title="Ta bort filtret">✕</button></span>`).join("")
    + (list.length > 1 ? '<button type="button" class="active-chip-clear">Rensa alla</button>' : "");
  box.querySelectorAll(".active-chip button").forEach(b => { b.onclick = () => { list[Number(b.dataset.i)].clear(); renderItemList(); }; });
  const all = box.querySelector(".active-chip-clear");
  if (all) all.onclick = () => document.getElementById("btnClearFilter").click();
}

/* ---------- åtgärdsrad för markerade rader ---------- */
function updateSelectionBar() {
  const bar = document.getElementById("selectionBar");
  if (bar) bar.classList.toggle("hidden", selectedItemKeys.size === 0);
}

/* ---------- gör ett dolt element synligt ---------- */
function revealElement(el) {
  if (!el) return;
  const panel = el.closest("section.panel[data-tab]");
  if (panel && panel.classList.contains("tab-hidden")) showTab(panel.dataset.tab);
  if (panel && panel.classList.contains("collapsed")) {
    panel.classList.remove("collapsed");
    if (typeof collapsedPanels !== "undefined") { collapsedPanels.delete(panel.dataset.panelId); saveCollapsedPanels(); }
  }
  const menu = el.closest("#listMenu, #listFilterBox");
  if (menu && menu.classList.contains("hidden")) { closeMenus(menu.id); menu.classList.remove("hidden"); closeMenus(menu.id); }
  const rowMenu = el.closest(".row-menu");
  if (rowMenu && rowMenu.classList.contains("hidden")) { closeRowMenus(rowMenu); rowMenu.classList.remove("hidden"); }
  let d = el.closest("details");
  while (d) { d.open = true; d = d.parentElement && d.parentElement.closest("details"); }
}

/* ---------- koppla ihop ---------- */
(function wrapAppFunctions() {
  const origRender = renderItemList;
  renderItemList = function () {
    const r = origRender.apply(this, arguments);
    renderActiveFilterChips();
    updateSelectionBar();
    return r;
  };
  const origFilters = buildFilterOptions;
  buildFilterOptions = function () {
    const r = origFilters.apply(this, arguments);
    renderChipSelects();
    return r;
  };
})();

function initUiShell() {
  // Flikar
  document.querySelectorAll("#mainTabs button").forEach(b => { b.onclick = () => showTab(b.dataset.tab); });
  showTab(currentTab());

  // Filter ▾ och ⋯
  const filterBox = document.getElementById("listFilterBox");
  document.getElementById("btnListFilter").onclick = (ev) => {
    ev.stopPropagation();
    const open = filterBox.classList.contains("hidden");
    closeMenus("listFilterBox");
    filterBox.classList.toggle("hidden", !open);
    closeMenus("listFilterBox");
  };
  const menu = document.getElementById("listMenu");
  document.getElementById("btnListMenu").onclick = (ev) => {
    ev.stopPropagation();
    const open = menu.classList.contains("hidden");
    closeMenus("listMenu");
    menu.classList.toggle("hidden", !open);
  };
  // Ett val i menyn stänger den (även kryssrutan – annars täcker menyn listan).
  menu.addEventListener("click", ev => { if (ev.target.closest("button")) menu.classList.add("hidden"); });
  menu.addEventListener("change", () => menu.classList.add("hidden"));
  // Klick utanför stänger ⋯-menyerna (filterrutan stängs bara med knappen).
  document.addEventListener("click", ev => {
    if (!ev.target.closest(".menu-wrap")) menu.classList.add("hidden");
    if (!ev.target.closest(".row-menu-wrap")) closeRowMenus();
  });

  // Kryssrutorna i filterrutan uppdaterar etiketterna direkt.
  ["hideCompleted", "showOnlyCompleted", "todayOnly", "uncoupledOnly", "groupBy", "sortBy"].forEach(id => {
    document.getElementById(id).addEventListener("change", () => renderActiveFilterChips());
  });

  // Åtgärdsraden
  document.getElementById("btnClearSelection").onclick = () => {
    selectedItemKeys.clear();
    renderItemList();
    if (typeof API !== "undefined" && API && API.viewer) API.viewer.setSelection({ modelObjectIds: [] }, "set").catch(() => {});
  };

  // Formuläret som panel: ✕ och Esc = Avbryt
  document.getElementById("btnCloseLinkForm").onclick = () => document.getElementById("btnCancelLink").click();
  document.addEventListener("keydown", ev => {
    if (ev.key !== "Escape") return;
    if (!document.getElementById("linkForm").classList.contains("hidden")) document.getElementById("btnCancelLink").click();
    else { closeMenus(); closeRowMenus(); }
  });

  renderChipSelects();
  renderActiveFilterChips();
  updateSelectionBar();
}
document.addEventListener("DOMContentLoaded", initUiShell);
