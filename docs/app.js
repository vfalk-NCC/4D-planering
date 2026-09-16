/* =========================================================================
   4D-planering – Trimble Connect Extension
   ---------------------------------------------------------------------
   Bygger på trimble-connect-workspace-api. Se:
   https://developer.trimble.com/docs/connect/workspace-api/
   ========================================================================= */

// Visas som en liten "Version ..."-etikett i headern, bredvid "4D-planering".
// Uppdateras för hand till aktuellt klockslag/datum (Europa/Stockholm) varje
// gång en ny version pushas till GitHub, så man kan se i appen när den
// senast uppdaterades.
const APP_VERSION = "2026-09-16 11:30";

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
  githubToken: "",             // fine-grained PAT scopead till vfalk-NCC/4D-data, se GITHUB_TOKEN_SETUP.md
  userName: "",                // namn som förifylls vid nya kommentarer
  statusColors: null           // sätts till DEFAULT_STATUS_COLORS av loadLocalSettings() - badge-färger per "Status" i objektlistan
};
let lastSelection = [];      // [{modelId, objectId (externalId), objectRuntimeId, name}]
let playTimer = null;
let searchTerm = "";
let labelMarkupIds = [];     // aktiva 3D-textetiketter skapade av "Visa namn i 3D"
let collapsedGroups = new Set(); // vilka grupper (nyckel: "<fält>::<värde>") som är minimerade i listan
let collapsedPanels = new Set(); // vilka paneler (data-panel-id) som är minimerade
let itemsTotalCount = null;  // totalt antal rader i plan_items.json, eller null om okänt
let selectedItemKeys = new Set(); // markerade rader i "Planerade objekt" (Ctrl/Cmd- och Shift-klick), nyckel = objectId
let selectionAnchorKey = null; // ankarraden för Shift-klick (intervallmarkering) i objektlistan
let currentCommentsItem = null; // vilket objekt kommentarsdialogen just nu visar
let currentComments = [];       // kommentarer (platt lista, inkl. svar) för currentCommentsItem
let commentCounts = new Map();  // plan_item_id -> antal kommentarer (för 💬-badgen i listan)

// Tidslinjen ska alltid gå att dra minst fram till/bakåt till de här
// datumen, oavsett vilka start-/slutdatum som faktiskt är inplanerade
// på objekten.
const TIMELINE_MIN_START = "2025-01-01";
const TIMELINE_MIN_END = "2030-12-31";

// Svenska visningsnamn per statusvärde - används i objektlistan,
// filterrutan och Excel-exporten så de alltid visar samma text.
const STATUS_LABELS = {
  ej_planerad: "Ej planerad",
  planerad: "Planerad",
  pagaende: "Pågående",
  forsenad: "Försenad",
  klar: "Klar",
  pausad: "Pausad"
};

// Hur en post grupperas i "Planerade objekt" (samma nycklar som #groupBy).
// Delad mellan renderItemList() och syncSelectionFromModel() (för att slå
// upp/expandera rätt grupp när ett objekt markeras i 3D-vyn) så de aldrig
// kan komma ur synk med varandra.
const GROUP_KEY_FNS = {
  area: it => it.area || "Utan område",
  activity: it => it.activity || "Utan aktivitet",
  contractor: it => it.contractor || "Utan entreprenör",
  status: it => STATUS_LABELS[it.status] || it.status || "Okänd status"
};

// Standardfärger för statusmärkena i "Planerade objekt" - används tills
// Victor eventuellt justerar dem själv via kugghjulet (settings.statusColors).
const DEFAULT_STATUS_COLORS = {
  ej_planerad: "#cbd5e1",
  planerad: "#94a3b8",
  pagaende: "#f5a623",
  forsenad: "#e5484d",
  klar: "#3fb950",
  pausad: "#a1a1aa"
};

/**
 * Väljer svart eller vit text baserat på bakgrundsfärgens ljushet, så att
 * statusmärket alltid går att läsa oavsett vilken färg Victor väljer i
 * inställningarna (annars kan t.ex. en ljus, självvald färg med vit text bli
 * i princip oläslig).
 */
function contrastTextColor(hex) {
  if (typeof hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(hex)) return "#ffffff";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1f2328" : "#ffffff";
}

// Historisk kvarleva från Supabase-tiden (PostgRESTs radgräns per anrop).
// plan_items.json läses numera in i sin helhet i ett svep, så den här
// konstanten styr inget längre - lämnas kvar oanvänd för att undvika att
// röra kod som inte behöver ändras.
const ITEMS_FETCH_LIMIT = 50000;

// Tröskel för att visa "Raderar X/Y..."-förlopp i knappen vid massradering
// ("Radera markerade") - hela raderingen sker numera i ett enda GitHub-
// anrop istället för i omgångar, men vi vill ändå bara visa förloppstexten
// vid riktigt stora markeringar.
const DELETE_CHUNK_SIZE = 100;

// Max antal kommentarsrader (över alla objekt) att hämta när vi bara vill
// räkna antal kommentarer per objekt (för 💬-badgen i "Planerade objekt").
const COMMENTS_FETCH_LIMIT = 50000;

/* ---------------------------------------------------------------------
   Lösenordsgrind - enbart en klientsidesspärr (koden och all data är
   fortsatt fullt synlig för den som öppnar utvecklarverktygen), inte
   riktig säkerhet. Rätt lösenord låser upp och kommer ihåg valet i
   localStorage så man inte behöver skriva om det varje gång.
   ------------------------------------------------------------------- */
const ACCESS_PASSWORD = "ändra-mig";
const ACCESS_STORAGE_KEY = "4dplan-unlocked";

function isUnlocked() {
  try {
    return window.localStorage.getItem(ACCESS_STORAGE_KEY) === "1";
  } catch (e) {
    return false;
  }
}

function bindAccessGate() {
  const input = document.getElementById("accessPassword");
  const errorEl = document.getElementById("accessError");
  const submit = () => {
    if (input.value === ACCESS_PASSWORD) {
      try { window.localStorage.setItem(ACCESS_STORAGE_KEY, "1"); } catch (e) {}
      document.getElementById("accessGate").classList.add("hidden");
      initApp();
    } else {
      errorEl.classList.remove("hidden");
      input.value = "";
      input.focus();
    }
  };
  document.getElementById("btnAccessSubmit").onclick = submit;
  input.onkeydown = (e) => { if (e.key === "Enter") submit(); };
  input.focus();
}

/* ---------------------------------------------------------------------
   Init
   ------------------------------------------------------------------- */
window.addEventListener("DOMContentLoaded", boot);

function boot() {
  if (isUnlocked()) {
    document.getElementById("accessGate").classList.add("hidden");
    initApp();
  } else {
    bindAccessGate();
  }
}

async function initApp() {
  loadLocalSettings();
  bindUI();
  initCollapsiblePanels();

  API = await TrimbleConnectWorkspace.connect(window.parent, onWorkspaceEvent, 30000);

  const project = await API.project.getProject();
  projectId = project.id;

  await refreshItems();
  await refreshCommentCounts();
  buildFilterOptions();
  renderItemList();
  initTimelineRange();
}

/**
 * Hämtar senaste data från GitHub-lagret på begäran (↻-knappen i headern)
 * och ritar om listan - samma steg som körs vid första inläsningen, men
 * utan att koppla om mot Trimble Connect. Snurrar ikonen och inaktiverar
 * knappen medan hämtningen pågår, så man ser att något händer.
 */
async function refreshAllData() {
  const btn = document.getElementById("btnRefresh");
  if (btn.disabled) return;
  btn.disabled = true;
  btn.classList.add("spinning");
  try {
    await refreshItems();
    await refreshCommentCounts();
    buildFilterOptions();
    renderItemList();
    initTimelineRange();
  } catch (e) {
    console.error("Kunde inte hämta senaste data:", e);
    alert("Kunde inte hämta senaste data: " + e.message);
  } finally {
    btn.disabled = false;
    btn.classList.remove("spinning");
  }
}

function onWorkspaceEvent(event, data) {
  // Uppdatera markeringsräknaren och synka markeringen mot "Planerade
  // objekt"-listan när användaren markerar objekt i modellen.
  if (event === "viewer.onSelectionChanged" || event === "extension.onSelectionChanged") {
    // Hoppa över reaktioner på markeringar SOM APPEN SJÄLV precis gjorde
    // (t.ex. "Markera alla"/"Välj alla") - se ignoreModelSelectionEvents i
    // selectItemsInModel(). De hanterar redan sin egen listmarkering och
    // markeringsräknare, och en extra synk här skulle bara riskera att t.ex.
    // fälla ut en grupp man aktivt valde att hålla hopfälld.
    if (ignoreModelSelectionEvents > 0) return;
    syncSelectionFromModel();
  }
}

/* ---------------------------------------------------------------------
   UI-koppling
   ------------------------------------------------------------------- */
function bindUI() {
  document.getElementById("versionBadge").innerText = `Version ${APP_VERSION}`;

  document.getElementById("btnLinkSelection").onclick = onOpenLinkForm;
  document.getElementById("btnCancelLink").onclick = () => toggle("linkForm", false);
  document.getElementById("btnSaveLink").onclick = onSaveLink;
  document.getElementById("fProgress").oninput = () => {
    document.getElementById("fProgressLabel").innerText = document.getElementById("fProgress").value;
  };

  document.getElementById("timelineSlider").oninput = onSliderMove;
  document.getElementById("timelineDate").onchange = onDateInputChange;
  document.getElementById("btnPlay").onclick = onTogglePlay;

  document.getElementById("btnApplyFilter").onclick = applyFilterToModel;
  document.getElementById("btnClearFilter").onclick = clearFilter;
  document.getElementById("btnShowAllCoupled").onclick = showAllModelObjects;
  // Markera (utan att isolera/dölja) matchande objekt direkt när ett
  // filteralternativ ändras, så man ser dem i 3D-vyn innan man ev. klickar
  // "Visa filtrerat" eller isolerar/döljer manuellt i Trimble Connect.
  ["filterArea", "filterActivity", "filterContractor", "filterStatus"].forEach(id => {
    document.getElementById(id).onchange = selectFilteredInModelOnChange;
  });

  document.getElementById("btnImportExcel").onclick = onImportExcel;
  document.getElementById("btnExportExcel").onclick = onExportExcel;

  document.getElementById("itemSearch").oninput = () => renderItemList();
  document.getElementById("groupBy").onchange = () => renderItemList();
  document.getElementById("sortAlpha").onchange = () => renderItemList();
  // "Dölj klarmarkerade" och "Visa endast klarmarkerade" är motsatser - håll
  // dem ömsesidigt uteslutande så man inte kan kryssa i båda och få en
  // tom/motsägelsefull lista.
  document.getElementById("hideCompleted").onchange = (ev) => {
    if (ev.target.checked) document.getElementById("showOnlyCompleted").checked = false;
    renderItemList();
  };
  document.getElementById("showOnlyCompleted").onchange = (ev) => {
    if (ev.target.checked) document.getElementById("hideCompleted").checked = false;
    renderItemList();
  };

  document.getElementById("btnDeleteSelected").onclick = onDeleteSelectedItems;
  document.getElementById("btnCollapseAllGroups").onclick = collapseAllGroups;
  document.getElementById("btnSelectAllCoupled").onclick = selectAllCoupledObjects;
  document.getElementById("btnRenameValue").onclick = onOpenRenameDialog;
  document.getElementById("renameField").onchange = populateRenameOldValues;
  document.getElementById("renameOldValue").onchange = updateRenameCount;
  document.getElementById("btnDoRename").onclick = onDoRename;
  document.getElementById("btnCloseRename").onclick = () => toggle("renameDialog", false);

  document.getElementById("btnFindNearest").onclick = onFindNearest;

  document.getElementById("btnShowLabels").onclick = onShowLabels;
  document.getElementById("btnClearLabels").onclick = onClearLabels;

  setupAutocomplete("fArea", "fAreaList", () => formOptions.area);
  setupAutocomplete("fActivity", "fActivityList", () => formOptions.activity);
  setupAutocomplete("fContractor", "fContractorList", () => formOptions.contractor);
  // "Nytt/befintligt namn" i Byt namn-dialogen - föreslår befintliga värden
  // för det FÄLT som just nu är valt (Område/Aktivitet/Entreprenör), så man
  // t.ex. kan slå ihop "Sikthall" in i ett redan befintligt "741 - Sikthall"
  // istället för att bara skriva helt fritt.
  setupAutocomplete("renameNewValue", "renameNewValueList", () => formOptions[document.getElementById("renameField").value] || []);

  document.getElementById("saveStatus").onclick = onSaveStatusClick;

  document.getElementById("btnRefresh").onclick = refreshAllData;
  document.getElementById("btnSettings").onclick = () => toggle("settingsDialog", true);
  document.getElementById("btnCloseSettings").onclick = () => toggle("settingsDialog", false);
  document.getElementById("btnSaveSettings").onclick = onSaveSettings;

  document.getElementById("btnCloseComments").onclick = () => toggle("commentsDialog", false);
  document.getElementById("btnAddComment").onclick = () => {
    const text = document.getElementById("commentText").value.trim();
    if (!text) return;
    onSubmitComment(text, null);
  };
  document.getElementById("commentsList").onclick = onCommentsListClick;

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
  document.getElementById("githubToken").value = settings.githubToken;
  updateOpacityLabels();
  paintLegendDots();
  renderStatusColorInputs();
  updateConnectionWarning();
}

/**
 * Bygger en färgväljare per statusvärde (ej_planerad, planerad, ...) i
 * inställningsdialogen, utifrån STATUS_LABELS - så listan alltid matchar
 * statusarna som faktiskt finns i appen (fStatus-selecten, badges m.m.)
 * utan att behöva underhållas på två ställen.
 */
function renderStatusColorInputs() {
  const wrap = document.getElementById("statusColorInputs");
  if (!wrap) return;
  wrap.innerHTML = Object.entries(STATUS_LABELS).map(([key, label]) => `
    <label>${escapeHtml(label)}
      <div class="row">
        <input type="color" id="statusColor_${key}" style="flex:0 0 40px" />
      </div>
    </label>`).join("");
  Object.keys(STATUS_LABELS).forEach(key => {
    const el = document.getElementById(`statusColor_${key}`);
    if (el) el.value = (settings.statusColors && settings.statusColors[key]) || DEFAULT_STATUS_COLORS[key] || "#999999";
  });
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
  // statusColors är ett nästlat objekt, så den vanliga ytliga
  // {...settings, ...sparat}-sammanslagningen ovan räcker inte - annars
  // skulle en sparning gjord innan en ny statusfärg fanns (eller en
  // ofullständig uppsättning) tysta bort standardfärgen för de statusar som
  // saknas i det sparade objektet.
  settings.statusColors = { ...DEFAULT_STATUS_COLORS, ...(settings.statusColors || {}) };
}

function onSaveSettings() {
  settings.colorNotStarted = document.getElementById("colorNotStarted").value;
  settings.colorInProgress = document.getElementById("colorInProgress").value;
  settings.colorDone = document.getElementById("colorDone").value;
  settings.opacityNotStarted = Number(document.getElementById("opacityNotStarted").value) / 100;
  settings.opacityInProgress = Number(document.getElementById("opacityInProgress").value) / 100;
  settings.opacityDone = Number(document.getElementById("opacityDone").value) / 100;
  settings.playSecondsPerDay = Number(document.getElementById("playSecondsPerDay").value) || 0.4;
  settings.githubToken = document.getElementById("githubToken").value.trim();
  const newStatusColors = {};
  Object.keys(STATUS_LABELS).forEach(key => {
    const el = document.getElementById(`statusColor_${key}`);
    newStatusColors[key] = el ? el.value : (settings.statusColors && settings.statusColors[key]) || DEFAULT_STATUS_COLORS[key];
  });
  settings.statusColors = newStatusColors;
  window.localStorage.setItem("4dplan-settings", JSON.stringify(settings));
  paintLegendDots();
  updateConnectionWarning();
  toggle("settingsDialog", false);
  renderItemList();
  refreshItems().then(async () => {
    await refreshCommentCounts();
    buildFilterOptions();
    renderItemList();
    initTimelineRange();
  });
}

/* ---------------------------------------------------------------------
   Koppla markerade objekt till planeringsdata
   ------------------------------------------------------------------- */
/**
 * Synkar 3D-markering -> "Planerade objekt"-listan. Körs varje gång
 * användaren markerar/avmarkerar objekt i modellen (se onWorkspaceEvent).
 *
 * Uppdaterar alltid markeringsräknaren (motsvarande selCount-uppdateringen
 * som tidigare gjordes i en separat refreshSelectionCount), men markerar
 * dessutom motsvarande rader i listan om något av de
 * markerade 3D-objekten är kopplat till en planeringspost. Om inget av de
 * markerade objekten är kopplat lämnas en ev. befintlig manuell
 * listmarkering orörd - annars skulle t.ex. ett klick på ett helt
 * okopplat objekt i modellen tyst rensa vad man just markerat i listan.
 */
async function syncSelectionFromModel() {
  const sel = await API.viewer.getSelection();
  const count = (sel || []).reduce((n, m) => n + (m.objectRuntimeIds ? m.objectRuntimeIds.length : 0), 0);
  document.getElementById("selCount").innerText = count;

  const matchedKeys = new Set();
  for (const modelSel of sel || []) {
    if (!modelSel.objectRuntimeIds || modelSel.objectRuntimeIds.length === 0) continue;
    const externalIds = await API.viewer.convertToObjectIds(modelSel.modelId, modelSel.objectRuntimeIds);
    externalIds.forEach(extId => {
      const match = items.find(it => it.modelId === modelSel.modelId && it.objectId === extId);
      if (match) matchedKeys.add(match.objectId);
    });
  }

  if (matchedKeys.size > 0) {
    selectedItemKeys = matchedKeys;
    selectionAnchorKey = null;
    expandGroupsForKeys(matchedKeys);
    renderItemList();
    scrollSelectedRowIntoView();
  }
}

/** Expanderar (fäller ut) de grupper i "Planerade objekt" som innehåller
 * någon av de angivna objectId-nycklarna, så att en rad som just markerats
 * via 3D-synken faktiskt syns i listan istället för att döljas i en
 * hopfälld grupp. Ingen effekt om gruppering är avstängd. */
function expandGroupsForKeys(keys) {
  const groupBy = document.getElementById("groupBy").value;
  const keyFn = groupBy && GROUP_KEY_FNS[groupBy];
  if (!keyFn) return;
  items.forEach(it => {
    if (!keys.has(it.objectId)) return;
    collapsedGroups.delete(`${groupBy}::${keyFn(it)}`);
  });
}

/** Scrollar första markerade raden i listan in i vy (om den inte redan syns). */
function scrollSelectedRowIntoView() {
  const row = document.querySelector("#itemList .item-row.selected");
  if (row) row.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
  const progress = existing && Number.isFinite(existing.progress) ? existing.progress : 0;
  document.getElementById("fProgress").value = progress;
  document.getElementById("fProgressLabel").innerText = progress;
}

/* ---------------------------------------------------------------------
   Optimistisk sparning - "Spara" ska kännas momentant istället för att
   användaren ska behöva vänta in en GitHub-rondtripp.
   ---------------------------------------------------------------------
   Listan uppdateras och formuläret stängs DIREKT när man trycker Spara,
   medan själva skrivningen till GitHub sker i bakgrunden (kö:ad per fil,
   se ghWriteQueues i github-storage.js, så flera snabba sparningar i rad
   inte racear mot varandra i onödan). Det här är alltså rent en UX-fix
   för hur sparningen KÄNNS - den faktiska nätverkstiden är oförändrad.
   Två saker garanterar att en sparning aldrig "bara försvinner" tyst om
   den faktiska skrivningen skulle misslyckas trots omförsöken i
   ghWriteJSON:
     1) Raden i listan märks "Sparar..." tills bakgrundsskrivningen
        bekräftats, och "⚠ Kunde inte spara" om den till slut misslyckas
        (se _pending/_saveError i renderItemList()).
     2) En liten statusrad (#saveStatus, överst i appen) samlar alla
        pågående/misslyckade bakgrundssparningar, med en "Försök igen"-
        och "Överge ändringen"-knapp per misslyckad sparning - den
        försvinner aldrig av sig själv vid ett fel, till skillnad från en
        alert() som klickas bort och glöms.
   ------------------------------------------------------------------- */
let saveJobs = new Map(); // jobId -> { id, records, label, status: "pending"|"error", error }
let saveJobCounter = 0;

function buildLinkPayloadFromForm() {
  return {
    objectName: document.getElementById("fName").value.trim(),
    area: document.getElementById("fArea").value.trim(),
    activity: document.getElementById("fActivity").value.trim(),
    contractor: document.getElementById("fContractor").value.trim(),
    status: document.getElementById("fStatus").value,
    startDate: document.getElementById("fStart").value || null,
    endDate: document.getElementById("fEnd").value || null,
    progress: Number(document.getElementById("fProgress").value) || 0
  };
}

function onSaveLink() {
  if (lastSelection.length === 0) return;
  const payload = buildLinkPayloadFromForm();

  // Samma id som en redan sparad rad (om vi redigerar en befintlig
  // koppling) återanvänds så att den optimistiska raden och den faktiska
  // bakgrundsskrivningen syftar på exakt samma post - annars skulle
  // toRow() annars generera TVÅ olika nya id:n (ett här, ett till inne i
  // saveItems()) för samma nya objekt.
  const records = lastSelection.map(s => {
    const existing = items.find(it => it.modelId === s.modelId && it.objectId === s.objectId);
    return { id: existing ? existing.id : ghNewId(), projectId, modelId: s.modelId, objectId: s.objectId, ...payload };
  });

  applyOptimisticRecords(records);
  toggle("linkForm", false);
  buildFilterOptions();
  renderItemList();
  initTimelineRange();

  const jobId = ++saveJobCounter;
  const label = records.length === 1 ? (records[0].objectName || records[0].objectId) : `${records.length} objekt`;
  saveJobs.set(jobId, { id: jobId, records, label, status: "pending", error: null });
  runSaveJob(jobId);
}

/** Lägger till/uppdaterar de sparade raderna lokalt direkt (innan bakgrundsskrivningen ens startat), märkta som "Sparar...". */
function applyOptimisticRecords(records) {
  records.forEach(rec => {
    const row = toRow(rec);
    const optimisticItem = { ...fromRow(row), _pending: true, _saveError: null };
    const idx = items.findIndex(it => it.id === row.id);
    if (idx >= 0) items[idx] = optimisticItem; else items.push(optimisticItem);
  });
  itemsTotalCount = items.length;
}

/** Skriver in det bekräftat sparade resultatet för just DE HÄR raderna (inte hela listan - andra rader kan ha egna, fortfarande pågående bakgrundssparningar). */
function reconcileSavedRecords(records, after) {
  const afterById = new Map(after.map(r => [r.id, r]));
  records.forEach(rec => {
    const freshRow = afterById.get(rec.id);
    if (!freshRow) return;
    const freshItem = { ...fromRow(freshRow), _pending: false, _saveError: null };
    const idx = items.findIndex(it => it.id === rec.id);
    if (idx >= 0) items[idx] = freshItem; else items.push(freshItem);
  });
  itemsTotalCount = items.length;
}

/** Märker raderna i en misslyckad sparning med ett felmeddelande, så de syns tydligt i listan (inte bara i statusraden överst). */
function markSaveJobError(records, message) {
  const ids = new Set(records.map(r => r.id));
  items.forEach(it => { if (ids.has(it.id)) { it._pending = false; it._saveError = message; } });
}

function runSaveJob(jobId) {
  const job = saveJobs.get(jobId);
  if (!job) return;
  job.status = "pending";
  job.error = null;
  renderSaveStatus();

  saveItems(job.records).then(after => {
    saveJobs.delete(jobId);
    reconcileSavedRecords(job.records, after);
    buildFilterOptions();
    renderItemList();
    initTimelineRange();
    renderSaveStatus();
  }).catch(e => {
    console.error("Bakgrundssparning misslyckades:", e);
    job.status = "error";
    job.error = e.message;
    markSaveJobError(job.records, e.message);
    renderSaveStatus();
    renderItemList();
  });
}

/** Klick på "Försök igen"/"Överge ändringen" i statusraden (#saveStatus), se renderSaveStatus(). */
function onSaveStatusClick(ev) {
  const btn = ev.target.closest("[data-action]");
  if (!btn) return;
  const jobId = Number(btn.dataset.jobId);
  const job = saveJobs.get(jobId);
  if (!job) return;

  if (btn.dataset.action === "retry-save") {
    job.records.forEach(rec => {
      const it = items.find(i => i.id === rec.id);
      if (it) { it._pending = true; it._saveError = null; }
    });
    renderItemList();
    runSaveJob(jobId);
  } else if (btn.dataset.action === "discard-save") {
    // Enklaste säkra sätt att "ångra" en misslyckad optimistisk ändring:
    // hämta om hela listan från GitHub så allt återgår till det senast
    // faktiskt bekräftat sparade tillståndet, istället för att försöka
    // räkna ut och återställa exakt vad raden såg ut som innan för hand.
    saveJobs.delete(jobId);
    renderSaveStatus();
    refreshAllData();
  }
}

function renderSaveStatus() {
  const el = document.getElementById("saveStatus");
  if (!el) return;
  const jobs = Array.from(saveJobs.values());
  const pending = jobs.filter(j => j.status === "pending");
  const failed = jobs.filter(j => j.status === "error");

  if (pending.length === 0 && failed.length === 0) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }

  let html = "";
  if (pending.length > 0) {
    const text = pending.length === 1 ? `Sparar ${escapeHtml(pending[0].label)}...` : `Sparar ${pending.length} ändringar...`;
    html += `<div class="save-status-pending">${text}</div>`;
  }
  failed.forEach(job => {
    html += `
      <div class="save-status-error">
        ⚠️ Kunde inte spara <strong>${escapeHtml(job.label)}</strong>: ${escapeHtml(job.error || "")}
        <button data-action="retry-save" data-job-id="${job.id}">Försök igen</button>
        <button data-action="discard-save" data-job-id="${job.id}">Överge ändringen</button>
      </div>`;
  });
  el.innerHTML = html;
  el.classList.remove("hidden");
}

/* ---------------------------------------------------------------------
   Byt namn – ändra Område/Aktivitet/Entreprenör på alla kopplade objekt
   som just nu har ett visst värde, i ett svep (t.ex. "Sikthall" ->
   "741 - Sikthall" på samtliga objekt). Återanvänder samma optimistiska
   sparflöde (applyOptimisticRecords/saveJobs/runSaveJob) som
   "Koppla markering", så det känns momentant och läker/kö:as på samma
   sätt om skrivningen krockar eller misslyckas.
   ------------------------------------------------------------------- */
const RENAME_FIELD_LABELS = { area: "Område", activity: "Aktivitet", contractor: "Entreprenör" };

function onOpenRenameDialog() {
  const fieldSel = document.getElementById("renameField");
  if (fieldSel.options.length === 0) {
    fieldSel.innerHTML = Object.entries(RENAME_FIELD_LABELS)
      .map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
  }
  populateRenameOldValues();
  document.getElementById("renameNewValue").value = "";
  document.getElementById("renameStatus").innerText = "";
  toggle("renameDialog", true);
}

function populateRenameOldValues() {
  const field = document.getElementById("renameField").value;
  const sel = document.getElementById("renameOldValue");
  const opts = formOptions[field] || [];
  sel.innerHTML = opts.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  updateRenameCount();
}

function updateRenameCount() {
  const field = document.getElementById("renameField").value;
  const oldValue = document.getElementById("renameOldValue").value;
  const count = items.filter(it => (it[field] || "") === oldValue).length;
  document.getElementById("renameCount").innerText = count;
}

function onDoRename() {
  const field = document.getElementById("renameField").value;
  const oldValue = document.getElementById("renameOldValue").value;
  const newValue = document.getElementById("renameNewValue").value.trim();
  const statusEl = document.getElementById("renameStatus");

  if (!oldValue) { statusEl.innerText = "Inget namn valt."; return; }
  if (!newValue) { statusEl.innerText = "Ange ett nytt namn."; return; }
  if (newValue === oldValue) { statusEl.innerText = "Nya namnet är samma som det gamla."; return; }

  const matching = items.filter(it => (it[field] || "") === oldValue);
  if (matching.length === 0) { statusEl.innerText = "Inga objekt matchar det valda namnet längre."; return; }

  // Bygg fullständiga poster (samma mönster som onSaveLink) med bara det
  // valda fältet ändrat - saveItems() upsertar hela raden per id, så övriga
  // fält måste skickas med oförändrade, annars skulle de nollställas.
  const records = matching.map(it => ({
    id: it.id,
    projectId: it.projectId,
    modelId: it.modelId,
    objectId: it.objectId,
    objectName: it.objectName,
    area: it.area,
    activity: it.activity,
    contractor: it.contractor,
    status: it.status,
    startDate: it.startDate,
    endDate: it.endDate,
    progress: it.progress,
    [field]: newValue
  }));

  applyOptimisticRecords(records);
  toggle("renameDialog", false);
  buildFilterOptions();
  renderItemList();
  initTimelineRange();

  const jobId = ++saveJobCounter;
  const label = `Byt namn "${oldValue}" → "${newValue}" (${records.length} objekt)`;
  saveJobs.set(jobId, { id: jobId, records, label, status: "pending", error: null });
  runSaveJob(jobId);
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
// Cache av vilka område/aktivitet/entreprenör-värden som faktiskt
// förekommer bland de sparade planeringsposterna - källan för den egna
// "Sparade data"-dropdownen på Koppla markering-formuläret (se
// setupAutocomplete()), så den bara föreslår sådant Victor verkligen skrivit
// in i planeringen någon gång, inte webbläsarens egen ifyllnadshistorik.
let formOptions = { area: [], activity: [], contractor: [] };

function buildFilterOptions() {
  formOptions.area = unique(items.map(i => i.area));
  formOptions.activity = unique(items.map(i => i.activity));
  formOptions.contractor = unique(items.map(i => i.contractor));

  fillMultiSelect("filterArea", formOptions.area);
  fillMultiSelect("filterActivity", formOptions.activity);
  fillMultiSelect("filterContractor", formOptions.contractor);

  // Status är en fast lista i appen, så den fylls alltid i - oavsett
  // vilka statusar som redan finns bland sparade objekt.
  const statusEl = document.getElementById("filterStatus");
  statusEl.innerHTML = Object.entries(STATUS_LABELS)
    .map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, "sv"));
}

/**
 * Egen, snyggare "Sparade data"-dropdown för Område/Aktivitet/Entreprenör i
 * Koppla markering-formuläret - ersätter det inbyggda <input list="..."> +
 * <datalist>, som förutom datalistans värden även blandar in webbläsarens
 * egen (ostädade, appen-ovetande) ifyllnadshistorik för fältet. Visar bara
 * värden som faktiskt finns bland sparade planeringsposter (getOptionsFn),
 * filtrerat live mot vad som skrivits, med enkel tangentbordsnavigering.
 */
function setupAutocomplete(inputId, listId, getOptionsFn) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  if (!input || !list) return;

  // Chrome respekterar i praktiken inte autocomplete="off" för sin egen
  // "Sparade data"-ruta (webbläsarens ifyllnadshistorik) - den nycklas på
  // fältets name (id som reserv), och vårt fält hade inget name alls, så
  // Chrome byggde tyst upp en egen historik nyckla på id:t över tid. Genom
  // att ge fältet ett SLUMPAT name vid varje sidladdning hittar Chrome
  // aldrig en tidigare sparad post som matchar, och kan därför inte visa
  // sin egen ruta ovanpå vår - autocomplete="off" i HTML:en får stå kvar
  // som ett andra lager.
  input.name = `${inputId}-${Math.random().toString(36).slice(2, 10)}`;

  let activeIndex = -1;

  function currentItems() {
    return Array.from(list.querySelectorAll(".autocomplete-item"));
  }

  function highlight(idx) {
    const els = currentItems();
    els.forEach(el => el.classList.remove("active"));
    if (idx >= 0 && idx < els.length) {
      els[idx].classList.add("active");
      els[idx].scrollIntoView({ block: "nearest" });
    }
    activeIndex = idx;
  }

  function render() {
    const q = input.value.trim().toLowerCase();
    const opts = getOptionsFn().filter(v => !q || v.toLowerCase().includes(q));
    activeIndex = -1;
    if (opts.length === 0) {
      list.classList.add("hidden");
      list.innerHTML = "";
      return;
    }
    list.innerHTML = opts.slice(0, 30).map(v => `<div class="autocomplete-item" data-value="${escapeHtml(v)}">${escapeHtml(v)}</div>`).join("");
    list.classList.remove("hidden");
  }

  function choose(value) {
    input.value = value;
    list.classList.add("hidden");
  }

  input.addEventListener("focus", render);
  input.addEventListener("input", render);
  input.addEventListener("blur", () => {
    // Liten fördröjning så ett klick på ett förslag (mousedown -> blur ->
    // click) hinner registreras innan listan hinner döljas.
    setTimeout(() => list.classList.add("hidden"), 150);
  });
  input.addEventListener("keydown", (ev) => {
    if (list.classList.contains("hidden")) return;
    const els = currentItems();
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      highlight(Math.min(activeIndex + 1, els.length - 1));
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      highlight(Math.max(activeIndex - 1, 0));
    } else if (ev.key === "Enter") {
      if (activeIndex >= 0 && els[activeIndex]) {
        ev.preventDefault();
        choose(els[activeIndex].dataset.value);
      }
    } else if (ev.key === "Escape") {
      list.classList.add("hidden");
    }
  });
  list.addEventListener("mousedown", (ev) => {
    const item = ev.target.closest(".autocomplete-item");
    if (!item) return;
    ev.preventDefault(); // förhindra att input tappar fokus innan klicket hinner räknas
    choose(item.dataset.value);
  });
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
    const modelEntities = [];
    const modelObjectIds = [];
    for (const modelId of Object.keys(byModel)) {
      const runtimeIds = await API.viewer.convertToObjectRuntimeIds(modelId, byModel[modelId]);
      const valid = runtimeIds.filter(id => id !== undefined && id !== null);
      if (valid.length === 0) continue;
      modelEntities.push({ modelId, entityIds: valid });
      modelObjectIds.push({ modelId, objectRuntimeIds: valid });
    }

    if (modelEntities.length === 0) {
      statusEl.innerText = "Inget av de matchande objekten hittades i den just nu inlästa modellen.";
      return;
    }

    // "Visa endast valda objekt" - Trimble Connects egen inbyggda
    // isolerings-funktion (isolateEntities), istället för att vi själva
    // döljer/visar objekt via setObjectState. Beter sig precis som när man
    // väljer samma funktion i Trimble Connects egen meny.
    await API.viewer.isolateEntities(modelEntities);
    await API.viewer.setSelection({ modelObjectIds }, "set");
    statusEl.innerText = `Visar ${matched.length} matchande objekt.`;
  } catch (e) {
    console.error(e);
    statusEl.innerText = "Kunde inte filtrera modellen: " + e.message;
  }
}

/**
 * "Visa alla kopplade objekt" (knappen i Filter-panelens header) - isolerar
 * 3D-vyn till ALLA objekt som har en planeringskoppling i appen (dvs.
 * samtliga rader i "Planerade objekt", oavsett vilket filter som råkar vara
 * valt just nu) - INTE bokstavligen allt i hela 3D-modellen. Ångrar på så
 * vis en snävare isolering gjord av "Visa filtrerat" genom att vidga den
 * till samtliga kopplade objekt, istället för att visa/dölja allt
 * urskillningslöst.
 */
async function showAllModelObjects(ev) {
  if (ev) ev.stopPropagation(); // knappen sitter i panelens <h2> - stoppa så klicket inte även fäller ihop panelen
  const statusEl = document.getElementById("filterMsg");

  if (items.length === 0) {
    statusEl.innerText = "Inga kopplade objekt att visa.";
    return;
  }

  const byModel = {};
  items.forEach(it => {
    if (!it.modelId || !it.objectId) return;
    byModel[it.modelId] = byModel[it.modelId] || [];
    byModel[it.modelId].push(it.objectId);
  });

  try {
    const modelEntities = [];
    for (const modelId of Object.keys(byModel)) {
      const results = await convertToRuntimeIdsSafe(modelId, byModel[modelId]);
      const valid = results.map(r => r.runtimeId).filter(id => id !== undefined && id !== null);
      if (valid.length > 0) modelEntities.push({ modelId, entityIds: valid });
    }
    if (modelEntities.length === 0) {
      statusEl.innerText = "Inget av de kopplade objekten hittades i den just nu inlästa modellen.";
      return;
    }
    await API.viewer.isolateEntities(modelEntities);
    statusEl.innerText = `Visar alla ${items.length} kopplade objekt.`;
  } catch (e) {
    console.error("Kunde inte visa alla kopplade objekt:", e);
    statusEl.innerText = "Kunde inte visa alla kopplade objekt: " + e.message;
  }
}

/**
 * Markerar (men isolerar/döljer inte) alla sparade objekt som matchar de
 * just nu valda filteralternativen i rullistorna Område/Aktivitet/
 * Entreprenör/Status. Körs direkt vid varje ändring av ett filteralternativ,
 * så man ser markeringen i 3D-vyn innan man ev. klickar "Visa filtrerat"
 * eller själv väljer att isolera/dölja resten manuellt i Trimble Connect.
 * Rör inte kameran (till skillnad från selectItemsInModel) eftersom det
 * annars hoppar i vyn vid varje enskilt filterval.
 */
async function selectFilteredInModelOnChange() {
  const areas = getSelectedValues("filterArea");
  const activities = getSelectedValues("filterActivity");
  const contractors = getSelectedValues("filterContractor");
  const statuses = getSelectedValues("filterStatus");

  if (!areas.length && !activities.length && !contractors.length && !statuses.length) return;

  const matched = items.filter(it => {
    if (areas.length && !areas.includes(it.area)) return false;
    if (activities.length && !activities.includes(it.activity)) return false;
    if (contractors.length && !contractors.includes(it.contractor)) return false;
    if (statuses.length && !statuses.includes(it.status)) return false;
    return true;
  });

  const withModel = matched.filter(it => it.modelId && it.objectId);
  if (withModel.length === 0) return;

  const byModel = {};
  withModel.forEach(it => {
    byModel[it.modelId] = byModel[it.modelId] || [];
    byModel[it.modelId].push(it.objectId);
  });

  try {
    const modelObjectIds = [];
    for (const modelId of Object.keys(byModel)) {
      const runtimeIds = await API.viewer.convertToObjectRuntimeIds(modelId, byModel[modelId]);
      const valid = runtimeIds.filter(id => id !== undefined && id !== null);
      if (valid.length > 0) modelObjectIds.push({ modelId, objectRuntimeIds: valid });
    }
    if (modelObjectIds.length === 0) return;
    await API.viewer.setSelection({ modelObjectIds }, "set");
  } catch (e) {
    console.error("Kunde inte markera filtrerade objekt:", e);
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

/**
 * Exporterar objekten som just nu visas i "Planerade objekt" (dvs. efter
 * sökning och ev. "Dölj klarmarkerade" - men oavsett gruppering, som bara
 * organiserar listan) till en .xlsx-fil, med samma kolumner som
 * Excel-importen förväntar sig - så filen går att redigera och importera
 * tillbaka rakt av.
 */
function onExportExcel() {
  const status = document.getElementById("importStatus");
  const rows = getVisibleItems();

  if (rows.length === 0) {
    status.innerText = "Inget att exportera - listan är tom eller helt bortfiltrerad.";
    return;
  }

  const data = rows.map(it => ({
    "ObjektID": it.objectId,
    "Namn": it.objectName || "",
    "Område": it.area || "",
    "Aktivitet": it.activity || "",
    "Entreprenör": it.contractor || "",
    "Status": STATUS_LABELS[it.status] || it.status || "",
    "Startdatum": it.startDate || "",
    "Slutdatum": it.endDate || ""
  }));

  const sheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Planering");

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `4D-planering-${today}.xlsx`);

  status.innerText = `Exporterade ${rows.length} objekt till Excel.`;
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
  const map = {
    "ej planerad": "ej_planerad", "ej_planerad": "ej_planerad",
    "planerad": "planerad", "pågående": "pagaende", "försenad": "forsenad", "klar": "klar", "pausad": "pausad"
  };
  return map[String(value || "").toLowerCase()] || "planerad";
}

/* ---------------------------------------------------------------------
   Objektlista
   ------------------------------------------------------------------- */

/** Formaterar planerat start-/slutdatum för en rad i "Planerade objekt". */
function formatDateRange(it) {
  if (it.startDate && it.endDate) return `${it.startDate} → ${it.endDate}`;
  if (it.startDate) return `Start ${it.startDate}`;
  if (it.endDate) return `Slut ${it.endDate}`;
  return "Inga datum satta";
}

/**
 * Markerar (och, om moveCamera inte är false, zoomar till) en eller flera
 * planeringsposter i 3D-vyn. Poster utan modell-koppling (t.ex. felaktiga
 * Excel-rader) hoppas över. Används för enskild radklick, "Välj alla" per
 * grupp, "Markera alla" (alla kopplade objekt) samt filtermarkeringen.
 *
 * `opts.mode`: "set" (default, ersätter ev. tidigare markering i 3D-vyn)
 * eller "add" (lägger till markeringen till det som redan är markerat -
 * används vid Ctrl/Cmd-klick på "Välj alla" för att kunna bygga upp en
 * markering över flera grupper samtidigt).
 * `opts.moveCamera`: default true. Sätts till false vid tillägg (mode
 * "add") så att kameran inte hoppar runt och centrerar om sig för varje
 * grupp man Ctrl-klickar till - man vill bara bygga upp markeringen, inte
 * navigera om i modellen för varje klick.
 *
 * Zoom: bara Trimbles egen inbyggda "zooma till markering"
 * (setCamera(selector)) används - EN enda kamerarörelse som zoomar in och
 * stannar, inget eget efterjusterande steg (det fanns tidigare, men gav
 * en synlig "zoomar in, zoomar ut igen"-känsla och togs bort).
 *
 * Kastar ett fel (istället för att bara larma med alert()) bara om INGET av
 * objekten kunde hittas i den inlästa modellen. Om bara VISSA av objekten
 * saknas i modellen (t.ex. en äldre modellversion) markeras ändå de som
 * faktiskt finns - de saknade rapporteras tillbaka via returvärdets
 * `missing`-lista, så anropande kod kan uppmärksamma dem i listan istället
 * för att hela markeringen misslyckas.
 *
 * Returnerar `{ missing }`, där `missing` är en lista `{modelId, objectId}`
 * för objekt som inte gick att hitta i den just nu inlästa modellen.
 */
async function selectItemsInModel(itemsToSelect, opts = {}) {
  const mode = opts.mode || "set";
  const moveCamera = opts.moveCamera !== false;

  const withModel = itemsToSelect.filter(it => it.modelId && it.objectId);
  if (withModel.length === 0) {
    throw new Error("Inga av objekten har en känd modell-koppling (troligen från Excel utan ModellID, eller så tillhör de en äldre modellversion som inte är inläst just nu).");
  }

  const byModel = {};
  withModel.forEach(it => {
    byModel[it.modelId] = byModel[it.modelId] || [];
    byModel[it.modelId].push(it.objectId);
  });

  const modelObjectIds = [];
  const missing = [];
  for (const modelId of Object.keys(byModel)) {
    const objectIds = byModel[modelId];
    const results = await convertToRuntimeIdsSafe(modelId, objectIds);
    const valid = [];
    results.forEach(({ objectId, runtimeId }) => {
      if (runtimeId !== undefined && runtimeId !== null) valid.push(runtimeId);
      else missing.push({ modelId, objectId });
    });
    if (valid.length > 0) modelObjectIds.push({ modelId, objectRuntimeIds: valid });
  }

  if (modelObjectIds.length === 0) {
    throw new Error(`Hittade inga av de ${withModel.length} objekten i den just nu inlästa modellen (troligen en äldre modellversion - öppna/uppdatera rätt modell i 3D-vyn och försök igen).`);
  }

  const selector = { modelObjectIds };

  // Den här markeringen är gjord av APPEN, inte av ett klick i 3D-vyn - så
  // vi vill INTE att syncSelectionFromModel() (3D -> listmarkering) reagerar
  // på händelsen Trimble skickar ut som en följd av vårt eget setSelection-
  // anrop. Annars kan t.ex. "Välj alla" på en hopfälld grupp oavsiktligt
  // fälla ut den grupp man precis valde (se onWorkspaceEvent).
  ignoreModelSelectionEvents++;
  try {
    await API.viewer.setSelection(selector, mode);
  } finally {
    // Liten fördröjning innan vi slutar ignorera - Trimbles händelse för
    // just den här markeringen kan komma någon millisekund efter att
    // setSelection() löst sig, inte nödvändigtvis i exakt samma tick.
    setTimeout(() => { ignoreModelSelectionEvents = Math.max(0, ignoreModelSelectionEvents - 1); }, 300);
  }

  // Uppdatera markeringsräknaren själva (istället för att förlita oss på
  // syncSelectionFromModel, som vi just valde att ignorera händelsen för).
  const selCountEl = document.getElementById("selCount");
  if (selCountEl) selCountEl.innerText = modelObjectIds.reduce((n, m) => n + m.objectRuntimeIds.length, 0);

  if (moveCamera) {
    await API.viewer.setCamera(selector);
  }

  return { missing };
}

/**
 * Som API.viewer.convertToObjectRuntimeIds(modelId, objectIds), men tål att
 * ETT ENSKILT objekt i batchen saknas i den inlästa modellen - Trimbles API
 * avvisar annars HELA anropet (inte bara det saknade objektet) om något av
 * de efterfrågade external-id:na inte hittas, vilket annars gjorde att
 * ingenting alls gick att markera bara för att ETT objekt råkade tillhöra
 * en äldre modellversion. Faller tillbaka till att pröva ett objekt i taget
 * bara om batch-anropet faktiskt kastar - annars (normalfallet) görs bara
 * det vanliga, snabba batch-anropet.
 */
async function convertToRuntimeIdsSafe(modelId, objectIds) {
  try {
    const runtimeIds = await API.viewer.convertToObjectRuntimeIds(modelId, objectIds);
    return objectIds.map((objectId, i) => ({ objectId, runtimeId: runtimeIds[i] }));
  } catch (e) {
    const results = [];
    for (const objectId of objectIds) {
      try {
        const [runtimeId] = await API.viewer.convertToObjectRuntimeIds(modelId, [objectId]);
        results.push({ objectId, runtimeId });
      } catch (e2) {
        results.push({ objectId, runtimeId: undefined });
      }
    }
    return results;
  }
}

// Räknare (inte bara en boolean) så överlappande markeringsanrop hanteras
// rimligt - se selectItemsInModel() och onWorkspaceEvent().
let ignoreModelSelectionEvents = 0;

/**
 * Märker items med `_notInModel = true` för de som är med i `missing`
 * (från selectItemsInModel), och rensar flaggan på övriga - så listan alltid
 * speglar resultatet av det SENASTE markeringsförsöket, inte ett tidigare.
 * Ansvarar inte för att rendera om - anropande kod gör det.
 */
function markMissingInModel(missing) {
  const missingKeys = new Set((missing || []).map(m => `${m.modelId}::${m.objectId}`));
  items.forEach(it => {
    it._notInModel = missingKeys.has(`${it.modelId}::${it.objectId}`);
  });
}

/**
 * Raderar en enskild kopplad planeringspost, efter bekräftelse från
 * användaren. Tar bara bort kopplingen/planeringsdatan i datalagret –
 * själva 3D-objektet i modellen påverkas inte.
 */
async function deleteItemFromList(item) {
  if (!isBackendConfigured()) {
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

  selectedItemKeys.delete(item.objectId);
  await refreshItems();
  buildFilterOptions();
  renderItemList();
  initTimelineRange();
}

/**
 * Raderar alla rader som är markerade i listan (Ctrl/Cmd-klick), efter en
 * gemensam bekräftelsefråga. Tar bara bort kopplingen/planeringsdatan i
 * datalagret – själva 3D-objekten i modellen påverkas inte.
 */
async function onDeleteSelectedItems() {
  const selectedItems = items.filter(it => selectedItemKeys.has(it.objectId));
  if (selectedItems.length === 0) {
    alert("Inga rader är markerade. Håll in Ctrl (⌘ på Mac) eller Shift och klicka på flera rader i listan för att markera dem.");
    return;
  }
  if (!confirm(`Är du säker på att du vill radera kopplingen för ${selectedItems.length} markerade objekt?`)) return;

  const btn = document.getElementById("btnDeleteSelected");
  const originalHtml = btn.innerHTML;
  btn.disabled = true;

  try {
    await deleteItems(selectedItems, (done, total) => {
      // Radering sker i omgångar (se DELETE_CHUNK_SIZE) vid stora
      // markeringar – visa förlopp så det inte ser ut som att knappen
      // hängt sig vid t.ex. ett par tusen objekt.
      if (total > DELETE_CHUNK_SIZE) btn.innerText = `Raderar ${done}/${total}...`;
    });
  } catch (e) {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
    alert("Kunde inte radera: " + e.message);
    return;
  }

  btn.innerHTML = originalHtml;
  selectedItemKeys.clear();
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
    el.innerText = `⚠️ Visar bara de första ${items.length} av totalt ${itemsTotalCount} objekt i databasen.`;
  } else {
    el.classList.add("hidden");
    el.innerText = "";
  }
}

/**
 * Rader som matchar sökningen och (om ikryssat) "Dölj klarmarkerade" - dvs.
 * exakt det som "Planerade objekt"-listan visar just nu, oavsett ev.
 * gruppering (som bara organiserar, inte filtrerar bort rader). Delas
 * mellan renderItemList() och Excel-exporten så de alltid är i synk.
 */
function getVisibleItems() {
  const term = (document.getElementById("itemSearch").value || "").toLowerCase().trim();
  const hideCompleted = document.getElementById("hideCompleted").checked;
  const showOnlyCompleted = document.getElementById("showOnlyCompleted").checked;
  return items.filter(it => {
    if (hideCompleted && it.status === "klar") return false;
    if (showOnlyCompleted && it.status !== "klar") return false;
    if (!term) return true;
    const haystack = [it.objectName, it.area, it.activity, it.contractor, it.objectId]
      .filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(term);
  });
}

function renderItemList() {
  searchTerm = (document.getElementById("itemSearch").value || "").toLowerCase().trim();
  const groupBy = document.getElementById("groupBy").value;
  const sortAlpha = document.getElementById("sortAlpha").checked;

  const visible = getVisibleItems();

  document.getElementById("itemCount").innerText = `${visible.length}/${items.length}`;
  updateItemsTruncatedWarning();

  // Rader vars objekt inte längre finns i listan (t.ex. efter radering) kan
  // inte längre vara markerade.
  const existingIds = new Set(items.map(it => it.objectId));
  Array.from(selectedItemKeys).forEach(key => { if (!existingIds.has(key)) selectedItemKeys.delete(key); });
  if (selectionAnchorKey && !existingIds.has(selectionAnchorKey)) selectionAnchorKey = null;
  const selectedCountEl = document.getElementById("selectedCount");
  if (selectedCountEl) selectedCountEl.innerText = selectedItemKeys.size;
  const btnDeleteSelected = document.getElementById("btnDeleteSelected");
  if (btnDeleteSelected) btnDeleteSelected.disabled = selectedItemKeys.size === 0;
  const btnShowLabels = document.getElementById("btnShowLabels");
  if (btnShowLabels) btnShowLabels.disabled = selectedItemKeys.size === 0;

  const el = document.getElementById("itemList");
  const statusColor = { ...DEFAULT_STATUS_COLORS, ...(settings.statusColors || {}) };
  const statusLabel = STATUS_LABELS;

  if (visible.length === 0) {
    el.innerHTML = `<div class="hint">Inga objekt ${searchTerm ? "matchar sökningen" : "sparade ännu"}.</div>`;
    return;
  }

  const sortFn = (a, b) =>
    (a.objectName || a.objectId || "").localeCompare(b.objectName || b.objectId || "", "sv");

  const groupKeyFns = GROUP_KEY_FNS;

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
          <button class="group-select-all" data-action="select-group" title="Markera alla objekt i gruppen i 3D-vyn. Ctrl/Cmd-klick = lägg till flera grupper i samma markering.">Välj alla</button>
        </div>`;
      if (collapsed) return;
    }
    group.items.forEach(it => {
      const idx = indexToItem.length;
      indexToItem.push(it);
      const isSelected = selectedItemKeys.has(it.objectId);
      const progress = Number.isFinite(it.progress) ? it.progress : 0;
      const commentCount = commentCounts.get(it.id) || 0;
      const commentBadge = commentCount > 0 ? `<span class="comment-count">${commentCount}</span>` : "";
      const commentTitle = commentCount > 0 ? `Kommentarer (${commentCount})` : "Kommentarer";
      html += `
        <div class="item-row${isSelected ? " selected" : ""}${it._saveError ? " save-error" : ""}" data-index="${idx}">
          <div class="item-row-top">
            <span class="item-main" data-action="select" title="Klicka för att markera. Ctrl/Cmd = lägg till, Shift = markera intervall.">
              <span class="item-name">${escapeHtml(it.objectName || it.objectId)}</span>${it._pending ? '<span class="save-pending-tag">Sparar...</span>' : ""}${it._saveError ? `<span class="save-error-tag" title="${escapeHtml(it._saveError)}">⚠ Kunde inte spara</span>` : ""}${it._notInModel ? '<span class="not-in-model-tag" title="Hittades inte i den just nu inlästa 3D-modellen - kan vara en äldre modellversion">⚠ Ej i modellen</span>' : ""}<br/>
              <span class="item-sub">${escapeHtml(it.area || "–")} · ${escapeHtml(it.activity || "–")}</span><br/>
              <span class="item-dates">${escapeHtml(formatDateRange(it))} · Framdrift ${progress}%</span>
            </span>
            <span class="badge" style="background:${statusColor[it.status] || "#999"};color:${contrastTextColor(statusColor[it.status] || "#999999")}">${statusLabel[it.status] || it.status}</span>
            <button class="comment-btn" data-action="comments" title="${commentTitle}">💬${commentBadge}</button>
            <button class="edit-btn" data-action="edit" title="Redigera">✏️</button>
            <button class="delete-btn" data-action="delete" title="Radera kopplingen">🗑️</button>
          </div>
          <div class="progress-track" title="Framdrift: ${progress}%"><div class="progress-fill" style="width:${progress}%"></div></div>
        </div>`;
    });
  });

  el.innerHTML = html;

  Array.from(el.querySelectorAll(".item-row")).forEach(row => {
    const it = indexToItem[Number(row.dataset.index)];

    row.querySelector('[data-action="select"]').onclick = (ev) => onItemRowClicked(it, ev, indexToItem);
    row.querySelector('[data-action="comments"]').onclick = () => openCommentsDialog(it);
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
    headerEl.querySelector('[data-action="select-group"]').onclick = (ev) => {
      // Ctrl/Cmd-klick lägger till gruppen till den befintliga markeringen
      // (både i listan och i 3D-vyn) istället för att ersätta den - så man
      // kan bygga upp en markering över flera grupper (t.ex. flera områden)
      // genom att Ctrl-klicka "Välj alla" på var och en av dem. Kameran
      // flyttas medvetet inte vid ett sådant tillägg, annars hoppar vyn runt
      // för varje extra grupp man klickar till.
      const additive = Boolean(ev && (ev.ctrlKey || ev.metaKey));
      if (additive) {
        group.items.forEach(it => selectedItemKeys.add(it.objectId));
        if (group.items.length) selectionAnchorKey = group.items[group.items.length - 1].objectId;
      } else {
        selectedItemKeys = new Set(group.items.map(x => x.objectId));
        selectionAnchorKey = group.items.length ? group.items[group.items.length - 1].objectId : null;
      }
      renderItemList();
      selectItemsInModel(group.items, additive ? { mode: "add", moveCamera: false } : {})
        .then(({ missing }) => { markMissingInModel(missing); renderItemList(); })
        .catch(e => alert("Kunde inte markera gruppen i 3D-vyn: " + e.message));
    };
  });
}

/**
 * Minimerar alla grupper i "Planerade objekt"-listan (motsvarande att klicka
 * ▼ på varje gruppheader manuellt). Gör inget om listan inte är grupperad.
 */
function collapseAllGroups() {
  const groupBy = document.getElementById("groupBy").value;
  if (!groupBy) return;
  document.querySelectorAll("#itemList .group-header[data-group-key]").forEach(h => {
    collapsedGroups.add(h.dataset.groupKey);
  });
  renderItemList();
}

/**
 * Markerar (och zoomar till, se selectItemsInModel) samtliga kopplade
 * objekt i listan - dvs. alla objekt som har planeringsdata, oavsett
 * ev. sökning/gruppering/"Dölj klarmarkerade" just nu.
 *
 * Inaktiverar knappen och visar "Markerar..." medan det pågår (det kan ta
 * en stund om listan är stor och spänner över flera modeller), och visar
 * ett tydligt felmeddelande om inget kunde markeras i 3D-vyn - t.ex. om
 * objekten tillhör en äldre modellversion än den som är inläst just nu
 * (vanligt för äldre, migrerad historik) - istället för att bara markera
 * raderna i listan och misslyckas tyst i 3D-vyn.
 */
async function selectAllCoupledObjects() {
  if (items.length === 0) {
    alert("Inga kopplade objekt att markera.");
    return;
  }
  const btn = document.getElementById("btnSelectAllCoupled");
  if (btn.disabled) return;

  selectedItemKeys = new Set(items.map(it => it.objectId));
  selectionAnchorKey = items.length ? items[items.length - 1].objectId : null;
  renderItemList();

  btn.disabled = true;
  const originalText = btn.innerText;
  btn.innerText = "Markerar...";
  try {
    const { missing } = await selectItemsInModel(items);
    markMissingInModel(missing);
    renderItemList();
  } catch (e) {
    console.error("Kunde inte markera alla kopplade objekt i 3D-vyn:", e);
    alert("Kunde inte markera alla kopplade objekt i 3D-vyn: " + e.message);
  } finally {
    btn.disabled = false;
    btn.innerText = originalText;
  }
}

/**
 * Klick på en rad i "Planerade objekt". Vanligt klick markerar bara det
 * objektet (ersätter ev. tidigare markering) och sätter det som ankare;
 * Ctrl/Cmd-klick lägger till eller tar bort objektet ur den aktuella
 * markeringen; Shift-klick markerar hela intervallet mellan ankarraden och
 * den klickade raden (som i Utforskaren/Finder) – i den ordning raderna
 * just nu visas i listan (dvs. efter ev. gruppering/sortering/filtrering).
 * I samtliga fall markeras samma objekt även i 3D-vyn.
 *
 * `renderedItems` är listan (i visningsordning) över de rader som faktisk
 * finns i DOM:en just nu – dvs. `indexToItem` från renderItemList().
 */
function onItemRowClicked(it, ev, renderedItems) {
  const multi = Boolean(ev && (ev.ctrlKey || ev.metaKey));
  const range = Boolean(ev && ev.shiftKey) && selectionAnchorKey && renderedItems;

  if (range) {
    const anchorIdx = renderedItems.findIndex(x => x.objectId === selectionAnchorKey);
    const clickedIdx = renderedItems.findIndex(x => x.objectId === it.objectId);
    if (anchorIdx === -1 || clickedIdx === -1) {
      // Ankarraden syns inte längre (t.ex. dold i en ihopfälld grupp) – falla
      // tillbaka till ett vanligt klick.
      selectedItemKeys = new Set([it.objectId]);
      selectionAnchorKey = it.objectId;
    } else {
      const from = Math.min(anchorIdx, clickedIdx);
      const to = Math.max(anchorIdx, clickedIdx);
      const rangeKeys = renderedItems.slice(from, to + 1).map(x => x.objectId);
      if (multi) {
        rangeKeys.forEach(key => selectedItemKeys.add(key));
      } else {
        selectedItemKeys = new Set(rangeKeys);
      }
      // Ankaret flyttas medvetet inte – ytterligare Shift-klick räknar om
      // intervallet från samma startpunkt, precis som i t.ex. Utforskaren.
    }
  } else if (multi) {
    if (selectedItemKeys.has(it.objectId)) selectedItemKeys.delete(it.objectId);
    else selectedItemKeys.add(it.objectId);
    selectionAnchorKey = it.objectId;
  } else {
    selectedItemKeys = new Set([it.objectId]);
    selectionAnchorKey = it.objectId;
  }

  renderItemList();

  const selectedItems = items.filter(x => selectedItemKeys.has(x.objectId));
  if (selectedItems.length > 0) {
    selectItemsInModel(selectedItems)
      .then(({ missing }) => { markMissingInModel(missing); renderItemList(); })
      .catch(e => alert("Kunde inte markera objektet/objekten i 3D-vyn: " + e.message));
  }
}

/* ---------------------------------------------------------------------
   Kommentarer på ett planerat objekt (med svar, ungefär som i Excel)
   ------------------------------------------------------------------- */

/** Öppnas via 💬-knappen på en rad i "Planerade objekt". */
function openCommentsDialog(item) {
  currentCommentsItem = item;
  document.getElementById("commentsItemName").innerText = item.objectName || item.objectId;
  document.getElementById("commentAuthor").value = settings.userName || "";
  document.getElementById("commentText").value = "";
  document.getElementById("commentsStatus").innerText = "";
  toggle("commentsDialog", true);
  loadComments(item);
}

async function loadComments(item) {
  const listEl = document.getElementById("commentsList");
  listEl.innerHTML = `<div class="hint">Laddar kommentarer...</div>`;
  if (!isBackendConfigured()) {
    listEl.innerHTML = `<div class="hint">Ingen databas ansluten.</div>`;
    return;
  }
  try {
    currentComments = await fetchComments(item.id);
  } catch (e) {
    listEl.innerHTML = `<div class="hint">Kunde inte hämta kommentarer: ${escapeHtml(e.message)}</div>`;
    return;
  }
  renderComments();
}

function renderComments() {
  const listEl = document.getElementById("commentsList");
  if (currentComments.length === 0) {
    listEl.innerHTML = `<div class="hint">Inga kommentarer ännu.</div>`;
    return;
  }

  const childrenByParent = new Map();
  const roots = [];
  currentComments.forEach(c => {
    if (c.parent_comment_id) {
      if (!childrenByParent.has(c.parent_comment_id)) childrenByParent.set(c.parent_comment_id, []);
      childrenByParent.get(c.parent_comment_id).push(c);
    } else {
      roots.push(c);
    }
  });

  listEl.innerHTML = roots.map(c => renderCommentNode(c, childrenByParent)).join("");
}

function renderCommentNode(c, childrenByParent) {
  const replies = childrenByParent.get(c.id) || [];
  return `
    <div class="comment" data-comment-id="${c.id}">
      <div class="comment-meta"><strong>${escapeHtml(c.author || "Anonym")}</strong> <span class="comment-time">${formatDateTime(c.created_at)}</span></div>
      <div class="comment-body">${escapeHtml(c.body)}</div>
      <div class="comment-actions">
        <button class="comment-reply-btn" data-action="reply" data-id="${c.id}">Svara</button>
        <button class="comment-delete-btn" data-action="delete" data-id="${c.id}" title="Ta bort kommentaren">🗑️ Ta bort</button>
      </div>
      <div class="comment-reply-form hidden" data-reply-form="${c.id}">
        <textarea rows="2" placeholder="Skriv ett svar..."></textarea>
        <div class="row">
          <button data-action="send-reply" data-id="${c.id}">Skicka svar</button>
          <button data-action="cancel-reply" data-id="${c.id}">Avbryt</button>
        </div>
      </div>
      <div class="comment-replies">
        ${replies.map(r => renderCommentNode(r, childrenByParent)).join("")}
      </div>
    </div>`;
}

function onCommentsListClick(ev) {
  const btn = ev.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id; // UUID-sträng (github-storage.js), inte längre ett numeriskt Postgres-ID

  if (action === "reply") {
    document.querySelectorAll(".comment-reply-form").forEach(f => f.classList.add("hidden"));
    const form = document.querySelector(`[data-reply-form="${id}"]`);
    if (form) {
      form.classList.remove("hidden");
      form.querySelector("textarea").focus();
    }
  } else if (action === "cancel-reply") {
    const form = document.querySelector(`[data-reply-form="${id}"]`);
    if (form) form.classList.add("hidden");
  } else if (action === "send-reply") {
    const form = document.querySelector(`[data-reply-form="${id}"]`);
    const text = form ? form.querySelector("textarea").value.trim() : "";
    if (!text) return;
    onSubmitComment(text, id);
  } else if (action === "delete") {
    if (!confirm("Är du säker på att du vill ta bort kommentaren? Eventuella svar på den tas bort samtidigt.")) return;
    onDeleteComment(id);
  }
}

/** Tar bort en kommentar (och ev. svar på den) efter bekräftelse, se onCommentsListClick(). */
async function onDeleteComment(commentId) {
  const statusEl = document.getElementById("commentsStatus");
  statusEl.innerText = "Tar bort...";
  try {
    await deleteComment(commentId);
  } catch (e) {
    statusEl.innerText = "Kunde inte ta bort kommentaren: " + e.message;
    return;
  }
  statusEl.innerText = "";
  await loadComments(currentCommentsItem);
  await refreshCommentCounts();
  renderItemList();
}

async function onSubmitComment(body, parentCommentId) {
  if (!currentCommentsItem) return;
  const author = document.getElementById("commentAuthor").value.trim() || "Anonym";
  settings.userName = author;
  try {
    window.localStorage.setItem("4dplan-settings", JSON.stringify(settings));
  } catch (e) { /* ignorera */ }

  const statusEl = document.getElementById("commentsStatus");
  statusEl.innerText = "Skickar...";
  try {
    await postComment({
      plan_item_id: currentCommentsItem.id,
      parent_comment_id: parentCommentId || null,
      author,
      body
    });
  } catch (e) {
    statusEl.innerText = "Kunde inte skicka kommentaren: " + e.message;
    return;
  }
  statusEl.innerText = "";
  document.getElementById("commentText").value = "";
  await loadComments(currentCommentsItem);
  await refreshCommentCounts();
  renderItemList();
}

function formatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
/** Kort datumformat för 3D-etiketter, t.ex. "2026-09-12" -> "260912". */
function formatDateShort(dateStr) {
  if (!dateStr) return "";
  return dateStr.slice(2).replace(/-/g, "");
}

/** "260912 - 260921", eller bara ena datumet om det andra saknas, eller "" om inga finns. */
function formatDateRangeShort(it) {
  const s = formatDateShort(it.startDate);
  const e = formatDateShort(it.endDate);
  if (s && e) return `${s} - ${e}`;
  return s || e || "";
}

/** Etikettext för ett objekt: namn, plus start-/slutdatum på en egen rad om satta. */
function labelTextFor(it) {
  const name = it.objectName || it.objectId;
  const range = formatDateRangeShort(it);
  return range ? `${name}\n${range}` : name;
}

async function onShowLabels() {
  const selectedItems = items.filter(it => selectedItemKeys.has(it.objectId));
  const linked = selectedItems.filter(it => it.modelId && it.objectId);
  if (linked.length === 0) {
    alert("Inga rader är markerade. Håll in Ctrl (⌘ på Mac) eller Shift och klicka på flera rader i \"Planerade objekt\" för att välja vilka som ska få etiketter i 3D-vyn.");
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
        newMarkups.push({ text: labelTextFor(it), start: point, end: point });
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
   GitHub-lagring (ersätter Supabase)
   ---------------------------------------------------------------------
   All planeringsdata lagras som JSON-filer i det privata repot
   vfalk-NCC/4D-data (en mapp per Trimble-projekt), via GitHub Contents
   API. Se docs/github-storage.js för de generella hjälpfunktionerna
   (ghReadJSON/ghWriteJSON/ghUpsertOne/ghNewId) och
   GITHUB_TOKEN_SETUP.md för hur token:en skapas.
   ------------------------------------------------------------------- */
function isBackendConfigured() {
  return Boolean(settings.githubToken);
}

function updateConnectionWarning() {
  const el = document.getElementById("connectionWarning");
  if (!el) return;
  if (isBackendConfigured()) {
    el.classList.add("hidden");
    el.innerText = "";
  } else {
    el.classList.remove("hidden");
    el.innerText = "⚠️ Ingen databas ansluten – öppna inställningarna (kugghjulet) och ange GitHub-token. Se GITHUB_TOKEN_SETUP.md.";
  }
}

function itemsPath() {
  return `projects/${encodeURIComponent(projectId)}/plan_items.json`;
}
function commentsPath() {
  return `projects/${encodeURIComponent(projectId)}/plan_item_comments.json`;
}
function progressHistoryPath() {
  return `projects/${encodeURIComponent(projectId)}/plan_item_progress_history.json`;
}

function toRow(it) {
  return {
    id: it.id || ghNewId(),
    project_id: it.projectId,
    model_id: it.modelId || null,
    object_id: String(it.objectId),
    object_name: it.objectName || null,
    area: it.area || null,
    activity: it.activity || null,
    contractor: it.contractor || null,
    status: it.status || "planerad",
    start_date: it.startDate || null,
    end_date: it.endDate || null,
    progress: Number.isFinite(it.progress) ? Math.max(0, Math.min(100, Math.round(it.progress))) : 0,
    updated_at: new Date().toISOString()
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
    progress: Number.isFinite(row.progress) ? row.progress : 0,
    updatedAt: row.updated_at
  };
}

async function refreshItems() {
  if (!isBackendConfigured()) {
    items = [];
    itemsTotalCount = null;
    return;
  }
  try {
    const rows = await ghReadJSON(settings.githubToken, itemsPath());
    items = rows.map(fromRow);
    itemsTotalCount = items.length;
  } catch (e) {
    console.error("Kunde inte hämta planeringsdata", e);
    items = [];
    itemsTotalCount = null;
  }
}

/**
 * Lägger till en historikrad i plan_item_progress_history om posten är ny
 * eller om progress/status ändrats - ersätter Postgres-triggern
 * log_plan_item_progress() som gjorde detta automatiskt i den gamla
 * gamla lösningen. Körs som en del av saveItems, mot samma
 * "före"-lista som upsert-passet läser.
 */
async function logProgressHistory(beforeRows, afterRows) {
  const beforeById = new Map(beforeRows.map(r => [r.id, r]));
  const toLog = [];
  afterRows.forEach(row => {
    const prev = beforeById.get(row.id);
    if (!prev || prev.progress !== row.progress || prev.status !== row.status) {
      toLog.push({
        id: ghNewId(),
        plan_item_id: row.id,
        project_id: row.project_id,
        progress: row.progress,
        status: row.status,
        recorded_at: new Date().toISOString()
      });
    }
  });
  if (toLog.length === 0) return;
  await ghWriteJSON(
    settings.githubToken,
    progressHistoryPath(),
    (arr) => [...arr, ...toLog],
    "Logga framdriftshistorik"
  );
}

/**
 * Skapar/uppdaterar flera poster i ett svep (upsert på project_id+object_id),
 * och loggar historik.
 *
 * Prestanda: gör bara EN läsning av plan_items.json (inte två - en här och
 * en till inuti ghWriteJSON, som annars dubblerar väntetiden för varje
 * sparning), och skriver plan_items.json och progressHistoryPath() PARALLELLT
 * istället för i tur och ordning, eftersom historikloggningen bara beror på
 * "före"/"efter"-listorna (som redan är kända innan skrivningen till
 * plan_items.json ens börjar) - inte på resultatet av den skrivningen. Det
 * här är den huvudsakliga fixen för den upplevda "långa delayen" vid
 * sparning jämfört med gamla Supabase-lösningen: GitHub Contents API kräver
 * en läs-ändra-skriv-rond per fil (och plan_items.json växer med tiden), så
 * att göra de två filernas rondtrippar samtidigt istället för seriellt
 * halverar ungefär väntetiden.
 */
async function saveItems(records) {
  if (!isBackendConfigured()) {
    throw new Error("Ingen databas ansluten. Ange GitHub-token i inställningarna.");
  }
  const path = itemsPath();
  const { data, sha } = await ghGetFile(settings.githubToken, path);
  const before = Array.isArray(data) ? data : [];
  const beforeByKey = new Map(before.map(r => [`${r.project_id}::${r.object_id}`, r]));
  const incoming = records.map(toRow).map(row => {
    const existing = beforeByKey.get(`${row.project_id}::${row.object_id}`);
    return existing ? { ...existing, ...row, id: existing.id } : row;
  });

  const [after] = await Promise.all([
    ghWriteJSON(
      settings.githubToken,
      path,
      (arr) => {
        let next = arr.slice();
        incoming.forEach(row => {
          const idx = next.findIndex(r => r.project_id === row.project_id && r.object_id === row.object_id);
          if (idx >= 0) next[idx] = row; else next.push(row);
        });
        return next;
      },
      "Spara planeringsposter",
      6,
      { data: before, sha }
    ),
    logProgressHistory(before, incoming)
  ]);

  return after;
}

/** Raderar en enskild post (via id om känt, annars project_id+object_id), samt dess kommentarer. */
async function deleteItem(item) {
  if (!isBackendConfigured()) {
    throw new Error("Ingen databas ansluten. Ange GitHub-token i inställningarna.");
  }
  await ghWriteJSON(
    settings.githubToken,
    itemsPath(),
    (arr) => arr.filter(r => (item.id ? r.id !== item.id : !(r.project_id === item.projectId && r.object_id === String(item.objectId)))),
    "Radera planeringspost"
  );
  if (item.id) await deleteCommentsForItems([item.id]);
}

/**
 * Raderar flera poster (t.ex. "Radera markerade") och deras kommentarer i
 * ett svep. `onProgress` behålls för kompatibilitet med anroparen men
 * anropas bara en gång i slutet, eftersom hela listan nu skrivs i ett enda
 * GitHub-anrop istället för i omgångar (den gamla chunkningen fanns bara
 * för att undvika för långa URL:er mot PostgREST).
 */
async function deleteItems(itemsToDelete, onProgress) {
  if (!isBackendConfigured()) {
    throw new Error("Ingen databas ansluten. Ange GitHub-token i inställningarna.");
  }
  const keysToDelete = new Set(itemsToDelete.map(it => `${it.projectId}::${String(it.objectId)}`));
  if (keysToDelete.size === 0) return;

  const before = await ghReadJSON(settings.githubToken, itemsPath());
  const removedIds = before
    .filter(r => keysToDelete.has(`${r.project_id}::${r.object_id}`))
    .map(r => r.id);

  await ghWriteJSON(
    settings.githubToken,
    itemsPath(),
    (arr) => arr.filter(r => !keysToDelete.has(`${r.project_id}::${r.object_id}`)),
    "Radera flera planeringsposter"
  );
  await deleteCommentsForItems(removedIds);
  if (onProgress) onProgress(itemsToDelete.length, itemsToDelete.length);
}

/** Tar bort alla kommentarer knutna till given lista av plan_item-ID:n (cascade-delete, ersätter FK on delete cascade). */
async function deleteCommentsForItems(planItemIds) {
  if (!planItemIds || planItemIds.length === 0) return;
  const idSet = new Set(planItemIds);
  await ghWriteJSON(
    settings.githubToken,
    commentsPath(),
    (arr) => arr.filter(c => !idSet.has(c.plan_item_id)),
    "Ta bort kommentarer för raderade objekt"
  );
}

/** Hämtar alla kommentarer (inkl. svar) för ett objekt, äldst först. */
async function fetchComments(planItemId) {
  if (!isBackendConfigured()) {
    throw new Error("Ingen databas ansluten. Ange GitHub-token i inställningarna.");
  }
  const all = await ghReadJSON(settings.githubToken, commentsPath());
  return all
    .filter(c => c.plan_item_id === planItemId)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
}

/**
 * Räknar antal kommentarer per objekt (för 💬-badgen i "Planerade objekt").
 */
async function refreshCommentCounts() {
  commentCounts = new Map();
  if (!isBackendConfigured()) return;
  try {
    const rows = await ghReadJSON(settings.githubToken, commentsPath());
    rows.forEach(row => {
      commentCounts.set(row.plan_item_id, (commentCounts.get(row.plan_item_id) || 0) + 1);
    });
  } catch (e) {
    console.error("Kunde inte hämta antal kommentarer", e);
  }
}

/** Skapar en ny kommentar (eller ett svar, om parent_comment_id är satt). */
async function postComment(record) {
  if (!isBackendConfigured()) {
    throw new Error("Ingen databas ansluten. Ange GitHub-token i inställningarna.");
  }
  const row = { id: ghNewId(), created_at: new Date().toISOString(), ...record };
  await ghWriteJSON(
    settings.githubToken,
    commentsPath(),
    (arr) => [...arr, row],
    "Ny kommentar"
  );
}

/**
 * Tar bort en enskild kommentar. Tar även bort ev. svar (och svar-på-svar)
 * till den - annars blir de kvar som föräldralösa poster i datalagret som
 * aldrig visas någonstans i appen.
 */
async function deleteComment(commentId) {
  if (!isBackendConfigured()) {
    throw new Error("Ingen databas ansluten. Ange GitHub-token i inställningarna.");
  }
  await ghWriteJSON(
    settings.githubToken,
    commentsPath(),
    (arr) => {
      const toRemove = new Set([commentId]);
      let changed = true;
      while (changed) {
        changed = false;
        arr.forEach(c => {
          if (c.parent_comment_id && toRemove.has(c.parent_comment_id) && !toRemove.has(c.id)) {
            toRemove.add(c.id);
            changed = true;
          }
        });
      }
      return arr.filter(c => !toRemove.has(c.id));
    },
    "Ta bort kommentar"
  );
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
