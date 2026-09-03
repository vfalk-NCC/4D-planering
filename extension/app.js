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
  apiBaseUrl: "https://din-server.se/api"
};
let lastSelection = [];      // [{modelId, objectId (externalId), objectRuntimeId, name}]
let playTimer = null;

/* ---------------------------------------------------------------------
   Init
   ------------------------------------------------------------------- */
window.addEventListener("DOMContentLoaded", init);

async function init() {
  loadLocalSettings();
  bindUI();

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

  document.getElementById("btnSettings").onclick = () => toggle("settingsDialog", true);
  document.getElementById("btnCloseSettings").onclick = () => toggle("settingsDialog", false);
  document.getElementById("btnSaveSettings").onclick = onSaveSettings;

  document.getElementById("colorNotStarted").value = settings.colorNotStarted;
  document.getElementById("colorInProgress").value = settings.colorInProgress;
  document.getElementById("colorDone").value = settings.colorDone;
  document.getElementById("apiBaseUrl").value = settings.apiBaseUrl;
  paintLegendDots();
}

function toggle(id, show) {
  document.getElementById(id).classList.toggle("hidden", !show);
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
  settings.apiBaseUrl = document.getElementById("apiBaseUrl").value.replace(/\/$/, "");
  window.localStorage.setItem("4dplan-settings", JSON.stringify(settings));
  paintLegendDots();
  toggle("settingsDialog", false);
  applyTimelineColors(); // måla om med nya färger
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
  document.getElementById("fArea").value = existing ? existing.area || "" : "";
  document.getElementById("fActivity").value = existing ? existing.activity || "" : "";
  document.getElementById("fContractor").value = existing ? existing.contractor || "" : "";
  document.getElementById("fStatus").value = existing ? existing.status || "planerad" : "planerad";
  document.getElementById("fStart").value = existing ? existing.startDate || "" : "";
  document.getElementById("fEnd").value = existing ? existing.endDate || "" : "";

  toggle("linkForm", true);
}

async function onSaveLink() {
  const payload = {
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

  await postJson(`${settings.apiBaseUrl}/projects/${projectId}/items/bulk`, { items: records });

  toggle("linkForm", false);
  await refreshItems();
  buildFilterOptions();
  renderItemList();
  applyTimelineColors();
}

/* ---------------------------------------------------------------------
   Tidslinje – räkna ut och sätta färg per objekt
   ------------------------------------------------------------------- */
function initTimelineRange() {
  const dates = items.flatMap(it => [it.startDate, it.endDate]).filter(Boolean).sort();
  const dateInput = document.getElementById("timelineDate");
  const today = new Date().toISOString().slice(0, 10);
  dateInput.value = dates.length ? dates[0] : today;

  const slider = document.getElementById("timelineSlider");
  if (dates.length >= 2) {
    slider.min = 0;
    slider.max = daysBetween(dates[0], dates[dates.length - 1]);
    slider.value = 0;
  }
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
  const dates = items.map(it => it.startDate).filter(Boolean).sort();
  return dates[0] || null;
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
  playTimer = setInterval(() => {
    const slider = document.getElementById("timelineSlider");
    const next = Number(slider.value) + 1;
    if (next > Number(slider.max)) { onTogglePlay(); return; }
    slider.value = next;
    onSliderMove();
  }, 400);
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
    await colorGroup(modelId, group.notStarted, settings.colorNotStarted);
    await colorGroup(modelId, group.inProgress, settings.colorInProgress);
    await colorGroup(modelId, group.done, settings.colorDone);
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

async function colorGroup(modelId, externalIds, colorHex) {
  if (externalIds.length === 0) return;
  const runtimeIds = await API.viewer.convertToObjectRuntimeIds(modelId, externalIds);
  const valid = runtimeIds.filter(id => id !== undefined && id !== null);
  if (valid.length === 0) return;
  await API.viewer.setObjectState(
    { modelObjectIds: [{ modelId, objectRuntimeIds: valid }] },
    { color: hexToRgba(colorHex) }
  );
}

function hexToRgba(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b, a: 255 };
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
  fillMultiSelect("filterStatus", unique(items.map(i => i.status)));
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

  const byModel = {};
  matched.forEach(it => {
    byModel[it.modelId] = byModel[it.modelId] || [];
    byModel[it.modelId].push(it.objectId);
  });

  // Visa endast matchande objekt, dölj resten.
  for (const modelId of Object.keys(byModel)) {
    const runtimeIds = await API.viewer.convertToObjectRuntimeIds(modelId, byModel[modelId]);
    const valid = runtimeIds.filter(Boolean);
    await API.viewer.isolateEntities([{ modelId, objectRuntimeIds: valid }]);
  }
}

async function clearFilter() {
  ["filterArea", "filterActivity", "filterContractor", "filterStatus"].forEach(id => {
    Array.from(document.getElementById(id).options).forEach(o => o.selected = false);
  });
  document.getElementById("filterWeeks").value = "";
  await API.viewer.reset();
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
    area: r["Område"] || r["Area"] || "",
    activity: r["Aktivitet"] || r["Activity"] || "",
    contractor: r["Entreprenör"] || r["Contractor"] || "",
    status: normalizeStatus(r["Status"]),
    startDate: excelDateToIso(r["Startdatum"] || r["StartDate"]),
    endDate: excelDateToIso(r["Slutdatum"] || r["EndDate"])
  })).filter(r => r.objectId);

  status.innerText = `Importerar ${records.length} rader...`;
  await postJson(`${settings.apiBaseUrl}/projects/${projectId}/items/bulk`, { items: records });

  await refreshItems();
  buildFilterOptions();
  renderItemList();
  applyTimelineColors();
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
function renderItemList() {
  document.getElementById("itemCount").innerText = items.length;
  const el = document.getElementById("itemList");
  const statusColor = { planerad: "#94a3b8", pagaende: "#f5a623", forsenad: "#e5484d", klar: "#3fb950", pausad: "#a1a1aa" };
  const statusLabel = { planerad: "Planerad", pagaende: "Pågående", forsenad: "Försenad", klar: "Klar", pausad: "Pausad" };

  el.innerHTML = items.map(it => `
    <div class="item-row" data-model="${escapeHtml(it.modelId || "")}" data-object="${escapeHtml(it.objectId)}">
      <span>${escapeHtml(it.area || "–")} · ${escapeHtml(it.activity || "–")}</span>
      <span class="badge" style="background:${statusColor[it.status] || "#999"}">${statusLabel[it.status] || it.status}</span>
    </div>
  `).join("");

  Array.from(el.querySelectorAll(".item-row")).forEach(row => {
    row.onclick = async () => {
      const modelId = row.dataset.model;
      const objectId = row.dataset.object;
      const runtimeIds = await API.viewer.convertToObjectRuntimeIds(modelId, [objectId]);
      await API.viewer.setSelection({ modelObjectIds: [{ modelId, objectRuntimeIds: runtimeIds.filter(Boolean) }] }, "set");
      await API.viewer.setCamera({ modelObjectIds: [{ modelId, objectRuntimeIds: runtimeIds.filter(Boolean) }] });
    };
  });
}

/* ---------------------------------------------------------------------
   Backend-kommunikation
   ------------------------------------------------------------------- */
async function refreshItems() {
  try {
    const res = await fetch(`${settings.apiBaseUrl}/projects/${projectId}/items`);
    items = res.ok ? await res.json() : [];
  } catch (e) {
    console.error("Kunde inte hämta planeringsdata", e);
    items = [];
  }
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Serverfel: ${res.status}`);
  return res.json();
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
