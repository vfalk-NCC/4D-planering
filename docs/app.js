/* =========================================================================
   4D-planering – Trimble Connect Extension
   ---------------------------------------------------------------------
   Bygger på trimble-connect-workspace-api. Se:
   https://developer.trimble.com/docs/connect/workspace-api/
   ========================================================================= */

let API = null;              // Workspace API-instans
let projectId = null;        // Aktuellt Trimble Connect-projekt
let items = [];              // Cache av planeringsposter (från backend)
let settings = {
  colorNotStarted: "#c9ccd1", // grå
  colorInProgress: "#f5a623", // orange
  colorDone: "#3fb950",       // grön
  opacityNotStarted: 1,       // 0-1, genomskinlighet per färg
  opacityInProgress: 1,
  opacityDone: 1,
  playSecondsPerDay: 0.4,     // sekunder realtid per simulerad dag vid "spela upp"
  supabaseUrl: "",
  supabaseKey: ""
};
let lastSelection = [];      // [{modelId, objectId (externalId), objectRuntimeId, name}]
let playTimer = null;
let searchTerm = "";
let labelMarkupIds = [];     // aktiva 3D-textetiketter skapade av "Visa namn i 3D"
let collapsedGroups = new Set(); // vilka grupper (nyckel: "<fält>::<värde>") som är minimerade i listan
let collapsedPanels = new Set(); // vilka paneler (data-panel-id) som är minimerade
let itemsTotalCount = null;  // totalt antal rader enligt Supabase (Content-Range), eller null om okänt

// Tidslinjen ska alltid gå att dra minst fram till/bakåt till de här
// datumen, oavsett vilka start-/slutdatum som faktiskt är inplanerade
// på objekten.
const TIMELINE_MIN_START = "2025-01-01";
const TIMELINE_MIN_END = "2030-12-31";

// Max antal rader att hämta från Supabase per anrop. OBS: Supabase-projektets
// egen inställning "Max Rows" (Project Settings -> API, standard 1000)
// sätter också ett tak – höj den där också om du planerar in fler än 1000
// objekt, annars klipps listan ändå av på 1000 oavsett den här konstanten.
const ITEMS_FETCH_LIMIT = 50000;

/* ---------------------------------------------------------------------
   Init
   ------------------------------------------------------------------- */
window.addEventListener("DOMContentLoaded", init);

async function init() {
  loadLocalSettings();
  bindUI();
  initCollapsiblePanels();

  API = await TrimbleConnectWorkspace.connect(window.parent, onWorkspaceEvent, 30000);

  const project = await API.project.getProject();
  projectId = project.id;

  await refreshItems();
  buildFilterOptions();
  renderItemList();
  initTimelineRange();
}

function onWorkspaceEvent(event, data) {
  // Uppdatera markeringsräknaren när användaren markerar objekt i modellen.
  if (event === "viewer.onSelectionChanged" || event === "extension.onSelectionChanged") {
    refreshSelectionCount();
  }
}

/* ---------------------------------------------------------------------
   UI-koppling
   ------------------------------------------------------------------- */
function bindUI() {
  document.getElementById("btnLinkSelection").onclick = onOpenLinkForm;
  document.getElementById("btnCancelLink").onclick = () => toggle("linkForm", false);
  document.getElementById("btnSaveLink").onclick = onSaveLink;

  document.getElementById("timelineSlider").oninput = onSliderMove;
  document.getElementById("timelineDate").onchange = onDateInputChange;
  document.getElementById("btnPlay").onclick = onTogglePlay;

  document.getElementById("btnApplyFilter").onclick = applyFilterToModel;
  document.getElementById("btnClearFilter").onclick = clearFilter;

  document.getElementById("btnImportExcel").onclick = onImportExcel;

  document.getElementById("itemSearch").oninput = () => renderItemList();
  document.getElementById("groupBy").onchange = () => renderItemList();
  document.getElementById("sortAlpha").onchange = () => renderItemList();

  document.getElementById("btnFindNearest").onclick = onFindNearest;

  document.getElementById("btnShowLabels").onclick = onShowLabels;
  document.getElementById("btnClearLabels").onclick = onClearLabels;

  document.getElementById("btnSettings").onclick = () => toggle("settingsDialog", true);
  document.getElementById("btnCloseSettings").onclick = () => toggle("settingsDialog", false);
  document.getElementById("btnSaveSettings").onclick = onSaveSettings;

  document.getElementById("colorNotStarted").value = settings.colorNotStarted;
  document.getElementById("colorInProgress").value = settings.colorInProgress;
  document.getElementById("colorDone").value = settings.colorDone;
  document.getElementById("opacityNotStarted").value = Math.round(settings.opacityNotStarted * 100);
  document.getElementById("opacityInProgress").value = Math.round(settings.opacityInProgress * 100);
  document.getElementById("opacityDone").value = Math.round(settings.opacityDone * 100);
  document.getElementById("opacityNotStarted").oninput = updateOpacityLabels;
  document.getElementById("opacityInProgress").oninput = updateOpacityLabels;
  document.getElementById("opacityDone").oninput = updateOpacityLabels;
  document.getElementById("playSecondsPerDay").value = settings.playSecondsPerDay;
  document.getElementById("supabaseUrl").value = settings.supabaseUrl;
  document.getElementById("supabaseKey").value = settings.supabaseKey;
  updateOpacityLabels();
  paintLegendDots();
  updateConnectionWarning();
}

function updateOpacityLabels() {
  ["NotStarted", "InProgress", "Done"].forEach(key => {
    const val = document.getElementById(`opacity${key}`).value;
    document.getElementById(`opacity${key}Label`).innerText = `${val}%`;
  });
}

function toggle(id, show) {
  document.getElementById(id).classList.toggle("hidden", !show);
}

/* ---------------------------------------------------------------------
   Ihopfällbara paneler ("Koppla markering", "Tidslinje", "Filter" m.fl.)
   ------------------------------------------------------------------- */
function loadCollapsedPanels() {
  try {
    const raw = window.localStorage.getItem("4dplan-collapsed-panels");
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) { return new Set(); }
}

function saveCollapsedPanels() {
  try {
    window.localStorage.setItem("4dplan-collapsed-panels", JSON.stringify(Array.from(collapsedPanels)));
  } catch (e) { /* ignorera */ }
}

function initCollapsiblePanels() {
  collapsedPanels = loadCollapsedPanels();
  document.querySelectorAll("section.panel[data-panel-id]").forEach(panel => {
    const id = panel.dataset.panelId;
    const h2 = panel.querySelector(":scope > h2");
    if (!h2) return;
    panel.classList.toggle("collapsed", collapsedPanels.has(id));
    h2.onclick = () => {
      panel.classList.toggle("collapsed");
      if (panel.classList.contains("collapsed")) collapsedPanels.add(id);
      else collapsedPanels.delete(id);
      saveCollapsedPanels();
    };
  });
}

function paintLegendDots() {
  document.getElementById("dotNotStarted").style.background = settings.colorNotStarted;
  document.getElementById("dotInProgress").style.background = settings.colorInProgress;
  document.getElementById("dotDone").style.background = settings.colorDone;
}

/* ---------------------------------------------------------------------
   Inställningar (lagras lokalt i webbläsaren för denna extension)
   ------------------------------------------------------------------- */
function loadLocalSettings() {
  try {
    const raw = window.localStorage.getItem("4dplan-settings");
    if (raw) settings = { ...settings, ...JSON.parse(raw) };
  } catch (e) { /* ignorera */ }
}

function onSaveSettings() {
  settings.colorNotStarted = document.getElementById("colorNotStarted").value;
  settings.colorInProgress = document.getElementById("colorInProgress").value;
  settings.colorDone = document.getElementById("colorDone").value;
  settings.opacityNotStarted = Number(document.getElementById("opacityNotStarted").value) / 100;
  settings.opacityInProgress = Number(document.getElementById("opacityInProgress").value) / 100;
  settings.opacityDone = Number(document.getElementById("opacityDone").value) / 100;
  settings.playSecondsPerDay = Number(document.getElementById("playSecondsPerDay").value) || 0.4;
  settings.supabaseUrl = document.getElementById("supabaseUrl").value.trim().replace(/\/$/, "");
  settings.supabaseKey = document.getElementById("supabaseKey").value.trim();
  window.localStorage.setItem("4dplan-settings", JSON.stringify(settings));
  paintLegendDots();
  updateConnectionWarning();
  toggle("settingsDialog", false);
  refreshItems().then(() => {
    buildFilterOptions();
    renderItemList();
    initTimelineRange();
  });
}

/* ---------------------------------------------------------------------
   Koppla markerade objekt till planeringsdata
   ------------------------------------------------------------------- */
async function refreshSelectionCount() {
  const sel = await API.viewer.getSelection();
  const count = (sel || []).reduce((n, m) => n + (m.objectRuntimeIds ? m.objectRuntimeIds.length : 0), 0);
  document.getElementById("selCount").innerText = count;
}

async function onOpenLinkForm() {
  const selection = await API.viewer.getSelection(); // [{modelId, objectRuntimeIds}]
  lastSelection = [];

  for (const modelSel of selection || []) {
    const externalIds = await API.viewer.convertToObjectIds(modelSel.modelId, modelSel.objectRuntimeIds);
    modelSel.objectRuntimeIds.forEach((runtimeId, i) => {
      lastSelection.push({
        modelId: modelSel.modelId,
        objectId: externalIds[i],
        objectRuntimeId: runtimeId
      });
    });
  }

  document.getElementById("selCount").innerText = lastSelection.length;

  if (lastSelection.length === 0) {
    alert("Markera minst ett objekt i modellen först.");
    return;
  }

  // Om exakt ett av de markerade objekten redan har data, förifyll formuläret.
  const existing = items.find(it => lastSelection.some(s => s.objectId === it.objectId && s.modelId === it.modelId));
  fillLinkForm(existing);
  toggle("linkForm", true);
}

/**
 * Öppnas via "Redigera"-knappen i objektlistan. Kräver ingen ny markering
 * i modellen eftersom vi redan vet vilket objekt (modelId + objectId)
 * posten gäller.
 */
function editItemFromList(item) {
  lastSelection = [{ modelId: item.modelId, objectId: item.objectId }];
  document.getElementById("selCount").innerText = 1;
  fillLinkForm(item);
  toggle("linkForm", true);
}

function fillLinkForm(existing) {
  document.getElementById("fName").value = existing ? existing.objectName || "" : "";
  document.getElementById("fArea").value = existing ? existing.area || "" : "";
  document.getElementById("fActivity").value = existing ? existing.activity || "" : "";
  document.getElementById("fContractor").value = existing ? existing.contractor || "" : "";
  document.getElementById("fStatus").value = existing ? existing.status || "planerad" : "planerad";
  document.getElementById("fStart").value = existing ? existing.startDate || "" : "";
  document.getElementById("fEnd").value = existing ? existing.endDate || "" : "";
}

async function onSaveLink() {
  const payload = {
    objectName: document.getElementById("fName").value.trim(),
    area: document.getElementById("fArea").value.trim(),
    activity: document.getElementById("fActivity").value.trim(),
    contractor: document.getElementById("fContractor").value.trim(),
    status: document.getElementById("fStatus").value,
    startDate: document.getElementById("fStart").value || null,
    endDate: document.getElementById("fEnd").value || null
  };

  const records = lastSelection.map(s => ({
    projectId, modelId: s.modelId, objectId: s.objectId, ...payload
  }));

  try {
    await saveItems(records);
  } catch (e) {
    alert("Kunde inte spara: " + e.message);
    return;
  }

  toggle("linkForm", false);
  await refreshItems();
  buildFilterOptions();
  renderItemList();
  initTimelineRange();
}

/* ---------------------------------------------------------------------
   Tidslinje – räkna ut och sätta färg per objekt
   ------------------------------------------------------------------- */
/**
 * Tidigaste datum tidslinjen ska gå att dra till: det tidigaste av
 * TIMELINE_MIN_START och eventuellt ännu tidigare inplanerat startdatum
 * (så att riktigt gamla projekt inte kapas).
 */
function getTimelineStart() {
  const startDates = items.map(it => it.startDate).filter(Boolean).sort();
  const earliestPlanned = startDates.length ? startDates[0] : null;
  return earliestPlanned && earliestPlanned < TIMELINE_MIN_START ? earliestPlanned : TIMELINE_MIN_START;
}

/**
 * Senaste datum tidslinjen ska gå att dra till: det senaste av
 * TIMELINE_MIN_END och eventuellt ännu senare inplanerat slutdatum.
 */
function getTimelineEnd() {
  const endDates = items.map(it => it.endDate).filter(Boolean).sort();
  const latestPlanned = endDates.length ? endDates[endDates.length - 1] : null;
  return latestPlanned && latestPlanned > TIMELINE_MIN_END ? latestPlanned : TIMELINE_MIN_END;
}

function initTimelineRange() {
  const dateInput = document.getElementById("timelineDate");
  const today = new Date().toISOString().slice(0, 10);
  const startDates = items.map(it => it.startDate).filter(Boolean).sort();
  const defaultDate = startDates.length ? startDates[0] : today;

  // Intervallet (start/end) går alltid minst TIMELINE_MIN_START–TIMELINE_MIN_END,
  // oavsett vad som faktiskt är inplanerat – men kapas aldrig om projektet
  // sträcker sig längre åt något håll än så.
  const start = getTimelineStart();
  const end = getTimelineEnd();

  if (!dateInput.value) dateInput.value = defaultDate;
  dateInput.min = start;
  dateInput.max = end;

  const slider = document.getElementById("timelineSlider");
  slider.min = 0;
  slider.max = daysBetween(start, end);
  slider.value = Math.max(0, daysBetween(start, dateInput.value));

  applyTimelineColors();
}

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function onSliderMove() {
  const start = getEarliestDate();
  if (!start) return;
  const slider = document.getElementById("timelineSlider");
  const newDate = new Date(start);
  newDate.setDate(newDate.getDate() + Number(slider.value));
  document.getElementById("timelineDate").value = newDate.toISOString().slice(0, 10);
  applyTimelineColors();
}

function onDateInputChange() {
  const start = getEarliestDate();
  const cur = document.getElementById("timelineDate").value;
  if (start && cur) {
    document.getElementById("timelineSlider").value = daysBetween(start, cur);
  }
  applyTimelineColors();
}

function getEarliestDate() {
  // Referenspunkt för sliderns position 0 – måste vara samma datum som
  // initTimelineRange räknar fram som intervallets start.
  return getTimelineStart();
}

function onTogglePlay() {
  const btn = document.getElementById("btnPlay");
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
    btn.innerText = "▶";
    return;
  }
  btn.innerText = "⏸";
  const delayMs = Math.max(50, (settings.playSecondsPerDay || 0.4) * 1000);
  playTimer = setInterval(() => {
    const slider = document.getElementById("timelineSlider");
    const next = Number(slider.value) + 1;
    if (next > Number(slider.max)) { onTogglePlay(); return; }
    slider.value = next;
    onSliderMove();
  }, delayMs);
}

/**
 * Går igenom alla planerade objekt, jämför med valt datum och sätter
 * respektive färg i 3D-modellen via viewer.setObjectState.
 */
async function applyTimelineColors() {
  const selectedDate = document.getElementById("timelineDate").value;
  if (!selectedDate || items.length === 0) return;

  const byModel = {}; // modelId -> {notStarted:[], inProgress:[], done:[]}

  for (const it of items) {
    if (!it.startDate) continue;
    const phase = getPhase(it, selectedDate);
    byModel[it.modelId] = byModel[it.modelId] || { notStarted: [], inProgress: [], done: [] };
    byModel[it.modelId][phase].push(it.objectId);
  }

  for (const modelId of Object.keys(byModel)) {
    const group = byModel[modelId];
    await colorGroup(modelId, group.notStarted, settings.colorNotStarted, settings.opacityNotStarted);
    await colorGroup(modelId, group.inProgress, settings.colorInProgress, settings.opacityInProgress);
    await colorGroup(modelId, group.done, settings.colorDone, settings.opacityDone);
  }
}

function getPhase(item, selectedDateStr) {
  const d = new Date(selectedDateStr);
  const start = new Date(item.startDate);
  const end = item.endDate ? new Date(item.endDate) : start;
  if (d < start) return "notStarted";
  if (d >= start && d <= end) return "inProgress";
  return "done";
}

async function colorGroup(modelId, externalIds, colorHex, opacity) {
  if (externalIds.length === 0) return;
  const runtimeIds = await API.viewer.convertToObjectRuntimeIds(modelId, externalIds);
  const valid = runtimeIds.filter(id => id !== undefined && id !== null);
  if (valid.length === 0) return;
  await API.viewer.setObjectState(
    { modelObjectIds: [{ modelId, objectRuntimeIds: valid }] },
    { color: hexToRgba(colorHex, opacity) }
  );
}

function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = opacity === undefined ? 255 : Math.round(Math.max(0, Math.min(1, opacity)) * 255);
  return { r, g, b, a };
}

/* ---------------------------------------------------------------------
   Filter
   ------------------------------------------------------------------- */
function buildFilterOptions() {
  fillDatalist("areaList", unique(items.map(i => i.area)));
  fillDatalist("activityList", unique(items.map(i => i.activity)));
  fillDatalist("contractorList", unique(items.map(i => i.contractor)));

  fillMultiSelect("filterArea", unique(items.map(i => i.area)));
  fillMultiSelect("filterActivity", unique(items.map(i => i.activity)));
  fillMultiSelect("filterContractor", unique(items.map(i => i.contractor)));

  // Status är en fast lista i appen, så den fylls alltid i - oavsett
  // vilka statusar som redan finns bland sparade objekt.
  const statusEl = document.getElementById("filterStatus");
  const statusLabels = { planerad: "Planerad", pagaende: "Pågående", forsenad: "Försenad", klar: "Klar", pausad: "Pausad" };
  statusEl.innerHTML = Object.entries(statusLabels)
    .map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))].sort();
}

function fillDatalist(id, values) {
  const el = document.getElementById(id);
  el.innerHTML = values.map(v => `<option value="${escapeHtml(v)}">`).join("");
}

function fillMultiSelect(id, values) {
  const el = document.getElementById(id);
  el.innerHTML = values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
}

function getSelectedValues(id) {
  return Array.from(document.getElementById(id).selectedOptions).map(o => o.value);
}

async function applyFilterToModel() {
  const statusEl = document.getElementById("filterMsg");
  statusEl.innerText = "Filtrerar...";

  const areas = getSelectedValues("filterArea");
  const activities = getSelectedValues("filterActivity");
  const contractors = getSelectedValues("filterContractor");
  const statuses = getSelectedValues("filterStatus");
  const weeks = document.getElementById("filterWeeks").value;

  let matched = items.filter(it => {
    if (areas.length && !areas.includes(it.area)) return false;
    if (activities.length && !activities.includes(it.activity)) return false;
    if (contractors.length && !contractors.includes(it.contractor)) return false;
    if (statuses.length && !statuses.includes(it.status)) return false;
    if (weeks && it.startDate) {
      const limit = new Date();
      limit.setDate(limit.getDate() + Number(weeks) * 7);
      if (new Date(it.startDate) > limit) return false;
    }
    return true;
  });

  if (matched.length === 0) {
    statusEl.innerText = "Inga sparade objekt matchar filtret.";
    return;
  }

  const byModel = {};
  matched.forEach(it => {
    if (!it.modelId) return; // objekt utan känd modell (t.ex. felaktig Excel-rad) kan inte isoleras
    byModel[it.modelId] = byModel[it.modelId] || [];
    byModel[it.modelId].push(it.objectId);
  });

  try {
    // Dölj samtliga objekt i alla inlästa modeller (selector = undefined
    // gäller alla objekt enligt Workspace API:t).
    await API.viewer.setObjectState(undefined, { visible: false });

    let firstGroup = true;
    for (const modelId of Object.keys(byModel)) {
      const runtimeIds = await API.viewer.convertToObjectRuntimeIds(modelId, byModel[modelId]);
      const valid = runtimeIds.filter(id => id !== undefined && id !== null);
      if (valid.length === 0) continue;

      const selector = { modelObjectIds: [{ modelId, objectRuntimeIds: valid }] };
      await API.viewer.setObjectState(selector, { visible: true });
      await API.viewer.setSelection(selector, firstGroup ? "set" : "add");
      firstGroup = false;
    }
    statusEl.innerText = `Visar ${matched.length} matchande objekt.`;
  } catch (e) {
    console.error(e);
    statusEl.innerText = "Kunde inte filtrera modellen: " + e.message;
  }
}

async function clearFilter() {
  ["filterArea", "filterActivity", "filterContractor", "filterStatus"].forEach(id => {
    Array.from(document.getElementById(id).options).forEach(o => o.selected = false);
  });
  document.getElementById("filterWeeks").value = "";
  document.getElementById("filterMsg").innerText = "";
  await API.viewer.setObjectState(undefined, { visible: "reset" });
  applyTimelineColors();
}

/* ---------------------------------------------------------------------
   Excel-import
   ------------------------------------------------------------------- */
async function onImportExcel() {
  const fileInput = document.getElementById("excelFile");
  const status = document.getElementById("importStatus");
  if (!fileInput.files.length) {
    status.innerText = "Välj en Excel-fil först.";
    return;
  }
  status.innerText = "Läser fil...";
  const rows = await parseExcelFile(fileInput.files[0]);
  const records = rows.map(r => ({
    projectId,
    modelId: r["ModellID"] || items[0]?.modelId || null, // se README om flera modeller
    objectId: String(r["ObjektID"] || r["ObjectId"] || "").trim(),
    objectName: r["Namn"] || r["Name"] || "",
    area: r["Område"] || r["Area"] || "",
    activity: r["Aktivitet"] || r["Activity"] || "",
    contractor: r["Entreprenör"] || r["Contractor"] || "",
    status: normalizeStatus(r["Status"]),
    startDate: excelDateToIso(r["Startdatum"] || r["StartDate"]),
    endDate: excelDateToIso(r["Slutdatum"] || r["EndDate"])
  })).filter(r => r.objectId);

  status.innerText = `Importerar ${records.length} rader...`;
  try {
    await saveItems(records);
  } catch (e) {
    status.innerText = "Kunde inte importera: " + e.message;
    return;
  }

  await refreshItems();
  buildFilterOptions();
  renderItemList();
  initTimelineRange();
  status.innerText = `Klart – ${records.length} objekt uppdaterade.`;
}

function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: true });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(sheet, { defval: "" }));
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function excelDateToIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d)) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeStatus(value) {
  const map = { "planerad": "planerad", "pågående": "pagaende", "försenad": "forsenad", "klar": "klar", "pausad": "pausad" };
  return map[String(value || "").toLowerCase()] || "planerad";
}

/* ---------------------------------------------------------------------
   Objektlista
   ------------------------------------------------------------------- */

/**
 * Markerar (och zoomar till) en eller flera planeringsposter i 3D-vyn.
 * Poster utan modell-koppling (t.ex. felaktiga Excel-rader) hoppas över.
 * Används både för enskild radklick och för "Välj alla" per grupp.
 */
async function selectItemsInModel(itemsToSelect) {
  const withModel = itemsToSelect.filter(it => it.modelId && it.objectId);
  if (withModel.length === 0) {
    alert("Inga av objekten har en känd modell-koppling (troligen från Excel utan ModellID).");
    return;
  }

  const byModel = {};
  withModel.forEach(it => {
    byModel[it.modelId] = byModel[it.modelId] || [];
    byModel[it.modelId].push(it.objectId);
  });

  const modelObjectIds = [];
  for (const modelId of Object.keys(byModel)) {
    const runtimeIds = await API.viewer.convertToObjectRuntimeIds(modelId, byModel[modelId]);
    const valid = runtimeIds.filter(id => id !== undefined && id !== null);
    if (valid.length > 0) modelObjectIds.push({ modelId, objectRuntimeIds: valid });
  }

  if (modelObjectIds.length === 0) {
    alert("Hittade inga av objekten i den just nu inlästa modellen.");
    return;
  }

  const selector = { modelObjectIds };
  await API.viewer.setSelection(selector, "set");
  await API.viewer.setCamera(selector);
}

/**
 * Raderar en enskild kopplad planeringspost, efter bekräftelse från
 * användaren. Tar bara bort kopplingen/planeringsdatan i Supabase –
 * själva 3D-objektet i modellen påverkas inte.
 */
async function deleteItemFromList(item) {
  if (!isSupabaseConfigured()) {
    alert("Ingen databas ansluten.");
    return;
  }
  if (!confirm("Är du säker på att du vill radera kopplingen?")) return;

  try {
    await deleteItem(item);
  } catch (e) {
    alert("Kunde inte radera: " + e.message);
    return;
  }

  await refreshItems();
  buildFilterOptions();
  renderItemList();
  initTimelineRange();
}

function updateItemsTruncatedWarning() {
  const el = document.getElementById("itemsTruncatedWarning");
  if (!el) return;
  if (itemsTotalCount !== null && itemsTotalCount > items.length) {
    el.classList.remove("hidden");
    el.innerText = `⚠️ Visar bara de första ${items.length} av totalt ${itemsTotalCount} objekt i databasen. Höj Supabase-projektets "Max Rows"-inställning (Project Settings → API) om du behöver se fler.`;
  } else {
    el.classList.add("hidden");
    el.innerText = "";
  }
}

function renderItemList() {
  searchTerm = (document.getElementById("itemSearch").value || "").toLowerCase().trim();
  const groupBy = document.getElementById("groupBy").value;
  const sortAlpha = document.getElementById("sortAlpha").checked;

  const visible = items.filter(it => {
    if (!searchTerm) return true;
    const haystack = [it.objectName, it.area, it.activity, it.contractor, it.objectId]
      .filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(searchTerm);
  });

  document.getElementById("itemCount").innerText = `${visible.length}/${items.length}`;
  updateItemsTruncatedWarning();
  const el = document.getElementById("itemList");
  const statusColor = { planerad: "#94a3b8", pagaende: "#f5a623", forsenad: "#e5484d", klar: "#3fb950", pausad: "#a1a1aa" };
  const statusLabel = { planerad: "Planerad", pagaende: "Pågående", forsenad: "Försenad", klar: "Klar", pausad: "Pausad" };

  if (visible.length === 0) {
    el.innerHTML = `<div class="hint">Inga objekt ${searchTerm ? "matchar sökningen" : "sparade ännu"}.</div>`;
    return;
  }

  const sortFn = (a, b) =>
    (a.objectName || a.objectId || "").localeCompare(b.objectName || b.objectId || "", "sv");

  const groupKeyFns = {
    area: it => it.area || "Utan område",
    activity: it => it.activity || "Utan aktivitet",
    contractor: it => it.contractor || "Utan entreprenör",
    status: it => statusLabel[it.status] || it.status || "Okänd status"
  };

  // groups: [{ key: <unikt, t.ex. "area::Hus A"> | null, title, items }]
  let groups;
  if (groupBy && groupKeyFns[groupBy]) {
    const keyFn = groupKeyFns[groupBy];
    const map = new Map();
    visible.forEach(it => {
      const title = keyFn(it);
      if (!map.has(title)) map.set(title, []);
      map.get(title).push(it);
    });
    const titles = Array.from(map.keys()).sort((a, b) => a.localeCompare(b, "sv"));
    groups = titles.map(title => {
      const groupItems = map.get(title);
      if (sortAlpha) groupItems.sort(sortFn);
      return { key: `${groupBy}::${title}`, title, items: groupItems };
    });
  } else {
    groups = [{ key: null, title: null, items: sortAlpha ? [...visible].sort(sortFn) : visible }];
  }

  let html = "";
  const indexToItem = [];

  groups.forEach(group => {
    if (group.key) {
      const collapsed = collapsedGroups.has(group.key);
      html += `
        <div class="group-header" data-group-key="${escapeHtml(group.key)}">
          <span class="group-toggle" data-action="toggle-group" title="${collapsed ? "Expandera gruppen" : "Minimera gruppen"}">${collapsed ? "▶" : "▼"}</span>
          <span class="group-title" data-action="toggle-group">${escapeHtml(group.title)} (${group.items.length})</span>
          <button class="group-select-all" data-action="select-group" title="Markera alla objekt i gruppen i 3D-vyn">Välj alla</button>
        </div>`;
      if (collapsed) return;
    }
    group.items.forEach(it => {
      const idx = indexToItem.length;
      indexToItem.push(it);
      html += `
        <div class="item-row" data-index="${idx}">
          <span class="item-main" data-action="select">
            <span class="item-name">${escapeHtml(it.objectName || it.objectId)}</span><br/>
            <span>${escapeHtml(it.area || "–")} · ${escapeHtml(it.activity || "–")}</span>
          </span>
          <span class="badge" style="background:${statusColor[it.status] || "#999"}">${statusLabel[it.status] || it.status}</span>
          <button class="edit-btn" data-action="edit" title="Redigera">✏️</button>
          <button class="delete-btn" data-action="delete" title="Radera kopplingen">🗑️</button>
        </div>`;
    });
  });

  el.innerHTML = html;

  Array.from(el.querySelectorAll(".item-row")).forEach(row => {
    const it = indexToItem[Number(row.dataset.index)];

    row.querySelector('[data-action="select"]').onclick = () => selectItemsInModel([it]);
    row.querySelector('[data-action="edit"]').onclick = () => editItemFromList(it);
    row.querySelector('[data-action="delete"]').onclick = () => deleteItemFromList(it);
  });

  Array.from(el.querySelectorAll(".group-header")).forEach(headerEl => {
    const key = headerEl.dataset.groupKey;
    const group = groups.find(g => g.key === key);
    if (!group) return;

    const toggleFn = () => {
      if (collapsedGroups.has(key)) collapsedGroups.delete(key);
      else collapsedGroups.add(key);
      renderItemList();
    };
    headerEl.querySelectorAll('[data-action="toggle-group"]').forEach(elToggle => {
      elToggle.onclick = toggleFn;
    });
    headerEl.querySelector('[data-action="select-group"]').onclick = () => selectItemsInModel(group.items);
  });
}

/* ---------------------------------------------------------------------
   Hitta objekt via koordinat
   ---------------------------------------------------------------------
   Sökningen sker bland de objekt som redan är markerade i 3D-vyn (t.ex.
   alla fundament på en yta), inte i hela modellen – det finns inget
   verifierat API-anrop för "hämta alla objekt", och att skrapa
   Organizer-tabellen har tidigare orsakat att webbläsarfliken frusit.
   ------------------------------------------------------------------- */
function findPropertyValue(obj, psetName, propName) {
  const pset = (obj.properties || []).find(p => (p.name || "Övrigt") === psetName);
  if (!pset || !pset.properties) return undefined;
  const prop = pset.properties.find(p => p.name === propName);
  return prop === undefined ? undefined : prop.value;
}

async function onFindNearest() {
  const resultEl = document.getElementById("findResult");
  const targetX = Number(document.getElementById("findX").value);
  const targetY = Number(document.getElementById("findY").value);

  if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
    resultEl.innerText = "Ange både X och Y (i meter) innan du söker.";
    return;
  }

  resultEl.innerText = "Söker i markeringen...";

  try {
    const selection = await API.viewer.getSelection();
    const groups = (selection || []).filter(s => s.objectRuntimeIds && s.objectRuntimeIds.length > 0);

    if (groups.length === 0) {
      resultEl.innerText = "Markera minst ett kandidatobjekt i 3D-vyn först.";
      return;
    }

    let best = null; // {modelId, objectRuntimeId, name, distance}

    for (const group of groups) {
      const [objectProps, boxes] = await Promise.all([
        API.viewer.getObjectProperties(group.modelId, group.objectRuntimeIds),
        API.viewer.getObjectBoundingBoxes(group.modelId, group.objectRuntimeIds)
      ]);
      const boxById = new Map(boxes.map(b => [b.id, b]));

      objectProps.forEach(obj => {
        let x = findPropertyValue(obj, "CalculatedGeometryValues", "CenterOfGravityX");
        let y = findPropertyValue(obj, "CalculatedGeometryValues", "CenterOfGravityY");

        if (x !== undefined && y !== undefined) {
          // Rådata från getObjectProperties är i millimeter, medan
          // koordinaterna användaren anger (och Organizer-tabellen visar) är i meter.
          x = Number(x) / 1000;
          y = Number(y) / 1000;
        } else {
          const box = boxById.get(obj.id);
          if (!box) return;
          x = (box.boundingBox.min.x + box.boundingBox.max.x) / 2;
          y = (box.boundingBox.min.y + box.boundingBox.max.y) / 2;
        }

        const distance = Math.hypot(x - targetX, y - targetY);
        const name = findPropertyValue(obj, "Item", "Name");

        if (!best || distance < best.distance) {
          best = { modelId: group.modelId, objectRuntimeId: obj.id, name, distance };
        }
      });
    }

    if (!best) {
      resultEl.innerText = "Hittade inga jämförbara koordinater i markeringen.";
      return;
    }

    const selector = { modelObjectIds: [{ modelId: best.modelId, objectRuntimeIds: [best.objectRuntimeId] }] };
    await API.viewer.setSelection(selector, "set");
    await API.viewer.setCamera(selector);

    resultEl.innerText = `Närmast: ${best.name || "(namnlöst objekt)"} – avstånd ${best.distance.toFixed(2)} m. Objektet är nu markerat i 3D-vyn.`;
  } catch (err) {
    console.error(err);
    resultEl.innerText = "Kunde inte söka i markeringen: " + err.message;
  }
}

/* ---------------------------------------------------------------------
   3D-etiketter med kopplade objekts namn (rutnätsbeteckning m.m.)
   ------------------------------------------------------------------- */
async function onShowLabels() {
  const linked = items.filter(it => it.modelId && it.objectId);
  if (linked.length === 0) {
    alert("Inga kopplade objekt att visa etiketter för ännu.");
    return;
  }

  if (labelMarkupIds.length > 0) {
    await API.markup.removeMarkups(labelMarkupIds);
    labelMarkupIds = [];
  }

  const byModel = {};
  linked.forEach(it => {
    byModel[it.modelId] = byModel[it.modelId] || [];
    byModel[it.modelId].push(it);
  });

  const newMarkups = [];

  try {
    for (const modelId of Object.keys(byModel)) {
      const groupItems = byModel[modelId];
      const externalIds = groupItems.map(it => it.objectId);
      const runtimeIds = await API.viewer.convertToObjectRuntimeIds(modelId, externalIds);

      const validPairs = groupItems
        .map((it, i) => ({ it, runtimeId: runtimeIds[i] }))
        .filter(p => p.runtimeId !== undefined && p.runtimeId !== null);

      if (validPairs.length === 0) continue;

      const boxes = await API.viewer.getObjectBoundingBoxes(modelId, validPairs.map(p => p.runtimeId));
      const boxById = new Map(boxes.map(b => [b.id, b]));

      validPairs.forEach(({ it, runtimeId }) => {
        const box = boxById.get(runtimeId);
        if (!box) return;
        const mid = {
          x: (box.boundingBox.min.x + box.boundingBox.max.x) / 2,
          y: (box.boundingBox.min.y + box.boundingBox.max.y) / 2,
          z: (box.boundingBox.min.z + box.boundingBox.max.z) / 2
        };
        const point = {
          positionX: mid.x * 1000,
          positionY: mid.y * 1000,
          positionZ: mid.z * 1000,
          modelId,
          objectId: runtimeId
        };
        newMarkups.push({ text: it.objectName || it.objectId, start: point, end: point });
      });
    }

    if (newMarkups.length === 0) {
      alert("Hittade inga av de kopplade objekten i de just nu inlästa modellerna.");
      return;
    }

    const created = await API.markup.addTextMarkup(newMarkups);
    labelMarkupIds = created.map(m => m.id).filter(id => id !== undefined);
  } catch (err) {
    console.error(err);
    alert("Kunde inte skapa etiketter: " + err.message);
  }
}

async function onClearLabels() {
  if (labelMarkupIds.length === 0) return;
  try {
    await API.markup.removeMarkups(labelMarkupIds);
  } catch (err) {
    console.error(err);
  }
  labelMarkupIds = [];
}

/* ---------------------------------------------------------------------
   Supabase-kommunikation
   ---------------------------------------------------------------------
   All planeringsdata lagras i en gratis Supabase-databas (Postgres) via
   dess inbyggda REST-API (PostgREST). Ingen egen server behövs längre –
   extensionen pratar direkt med
   https://<ditt-projekt>.supabase.co/rest/v1/plan_items.
   Se supabase/schema.sql för tabellen som skapas en gång, och README.md
   för hela uppsättningsguiden.
   ------------------------------------------------------------------- */
function isSupabaseConfigured() {
  return Boolean(settings.supabaseUrl && settings.supabaseKey);
}

function updateConnectionWarning() {
  const el = document.getElementById("connectionWarning");
  if (!el) return;
  if (isSupabaseConfigured()) {
    el.classList.add("hidden");
    el.innerText = "";
  } else {
    el.classList.remove("hidden");
    el.innerText = "⚠️ Ingen databas ansluten – öppna inställningarna (kugghjulet) och ange Supabase-URL och nyckel. Se README.md.";
  }
}

function supabaseHeaders(isJson) {
  const headers = {
    apikey: settings.supabaseKey,
    Authorization: `Bearer ${settings.supabaseKey}`
  };
  if (isJson) headers["Content-Type"] = "application/json";
  return headers;
}

function toRow(it) {
  return {
    project_id: it.projectId,
    model_id: it.modelId || null,
    object_id: String(it.objectId),
    object_name: it.objectName || null,
    area: it.area || null,
    activity: it.activity || null,
    contractor: it.contractor || null,
    status: it.status || "planerad",
    start_date: it.startDate || null,
    end_date: it.endDate || null
  };
}

function fromRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    modelId: row.model_id,
    objectId: row.object_id,
    objectName: row.object_name,
    area: row.area,
    activity: row.activity,
    contractor: row.contractor,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    updatedAt: row.updated_at
  };
}

async function refreshItems() {
  if (!isSupabaseConfigured()) {
    items = [];
    itemsTotalCount = null;
    return;
  }
  try {
    const url = `${settings.supabaseUrl}/rest/v1/plan_items?project_id=eq.${encodeURIComponent(projectId)}&select=*`;
    // Range + Prefer: count=exact höjer taket förbi PostgRESTs standard på
    // 1000 rader per anrop (upp till ITEMS_FETCH_LIMIT) och låter oss läsa
    // ut totalantalet via Content-Range, så vi kan varna om listan ändå
    // klipps av (t.ex. av Supabase-projektets egen "Max Rows"-inställning).
    const res = await fetch(url, {
      headers: {
        ...supabaseHeaders(false),
        Range: `0-${ITEMS_FETCH_LIMIT - 1}`,
        Prefer: "count=exact"
      }
    });
    if (res.ok) {
      items = (await res.json()).map(fromRow);
      const contentRange = res.headers.get("content-range"); // t.ex. "0-999/1234"
      const total = contentRange ? Number(contentRange.split("/")[1]) : NaN;
      itemsTotalCount = Number.isFinite(total) ? total : null;
    } else {
      items = [];
      itemsTotalCount = null;
    }
  } catch (e) {
    console.error("Kunde inte hämta planeringsdata", e);
    items = [];
    itemsTotalCount = null;
  }
}

/** Skapar/uppdaterar flera poster i Supabase i ett anrop (upsert på project_id+object_id). */
async function saveItems(records) {
  if (!isSupabaseConfigured()) {
    throw new Error("Ingen databas ansluten. Ange Supabase-URL och nyckel i inställningarna.");
  }
  const url = `${settings.supabaseUrl}/rest/v1/plan_items?on_conflict=project_id,object_id`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...supabaseHeaders(true),
      Prefer: "resolution=merge-duplicates,return=minimal"
    },
    body: JSON.stringify(records.map(toRow))
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Databasfel (${res.status}): ${text || res.statusText}`);
  }
}

/** Raderar en enskild post i Supabase (via id om känt, annars project_id+object_id). */
async function deleteItem(item) {
  if (!isSupabaseConfigured()) {
    throw new Error("Ingen databas ansluten. Ange Supabase-URL och nyckel i inställningarna.");
  }
  const url = item.id !== undefined && item.id !== null
    ? `${settings.supabaseUrl}/rest/v1/plan_items?id=eq.${encodeURIComponent(item.id)}`
    : `${settings.supabaseUrl}/rest/v1/plan_items?project_id=eq.${encodeURIComponent(item.projectId)}&object_id=eq.${encodeURIComponent(item.objectId)}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: supabaseHeaders(false)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Databasfel (${res.status}): ${text || res.statusText}`);
  }
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
