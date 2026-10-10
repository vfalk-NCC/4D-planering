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
const APP_VERSION = "2026-10-10 21:44";

let API = null;              // Workspace API-instans
let projectId = null;        // Aktuellt Trimble Connect-projekt
/* Planeringskälla (Victors önskemål 2026-10-06): "excel" = 4-veckorsplaneringen från Excel (som
   alltid, filerna i projects/<id>/), "pp" = tidplanen från Powerproject (egna filer i
   projects/<id>/pp/). Byts med växeln överst – de två blandas aldrig. */
let planSource = "excel";
const planDir = () => `projects/${encodeURIComponent(projectId)}${planSource === "pp" ? "/pp" : ""}`;
const PLAN_SOURCE_KEY = () => "4dplan-source-" + projectId;
let items = [];              // Cache av planeringsposter (från backend)
let settings = {
  playSecondsPerDay: 0.4,     // sekunder realtid per simulerad dag vid "spela upp"
  githubToken: "",             // fine-grained PAT scopead till vfalk-NCC/4D-data, se GITHUB_TOKEN_SETUP.md
  userName: "",                // namn som förifylls vid nya kommentarer
  statusColors: null,          // sätts till DEFAULT_STATUS_COLORS av loadLocalSettings() - färger per status/fas, används både för badgen i listan OCH för objektens färg i 3D-vyn (se computeItemPhase/applyTimelineColors)
  statusOpacities: null,       // sätts till DEFAULT_PHASE_OPACITIES av loadLocalSettings() - opacitet i 3D-vyn per beräknad fas (påverkar INTE badgen i listan, precis som tidigare "Tidslinje-färger"-reglagen)
  warningDaysBeforeEnd: 7,     // används inte längre ("Snart aktuell" borttagen 2026-10-02)
  timelineRangeStart: null,    // valfritt eget start-/slutdatum för tidslinjens slider (annars auto, se getTimelineStart/getTimelineEnd)
  timelineRangeEnd: null
};
let lastSelection = [];      // [{modelId, objectId (externalId), objectRuntimeId, name}]
let playTimer = null;
let searchTerm = "";
let labelMarkupIds = [];     // aktiva 3D-textetiketter skapade av "Visa namn i 3D"
let collapsedGroups = new Set(); // vilka grupper (nyckel: "<fält>::<värde>") som är minimerade i listan
let collapsedPanels = new Set(); // vilka paneler (data-panel-id) som är minimerade
let itemsTotalCount = null;  // totalt antal rader i plan_items.json, eller null om okänt
let selectedItemKeys = new Set(); // markerade rader i "Planerade objekt" (Ctrl/Cmd- och Shift-klick), nyckel = objectId
let subActivityRows = []; // { name, start, end, hours, members } - se onAddSubActivity/recomputeAggregatesFromSubActivities
// Vid redigering av en aktivitet med flera 3D-objekt: alla objekt (rader) i
// aktiviteten. Varje delaktivitet kan då gälla alla (members = null) eller
// bara vissa av objekten (members = [id, ...]), se renderSubActivities.
let linkFormGroupMembers = [];
const modelObjectNameCache = new Map(); // "modelId::objectId" -> namn i 3D-modellen (för att skilja objekten åt)
let linkFormDependsOn = []; // [planItemId, ...] - objekt som måste vara klara innan detta kan starta, se onAddDependency
let activitiesByItemId = new Map(); // plan_item_id -> [{ name, start, end }] - sparade delaktiviteter, se refreshActivities/saveActivitiesForItem
let selectionAnchorKey = null; // ankarraden för Shift-klick (intervallmarkering) i objektlistan
let currentCommentsItem = null; // vilket objekt kommentarsdialogen just nu visar
let currentComments = [];       // kommentarer (platt lista, inkl. svar) för currentCommentsItem
/* Enkla linjeikoner (SVG i textfärgen) i stället för emojis – UI-översynen 2026-09-30. */
const ICON_PATHS = {
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  edit: '<path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
  comment: '<path d="M4 5h16v11H9l-5 4V5z"/>',
  cut: '<circle cx="6" cy="18" r="2.5"/><circle cx="6" cy="6" r="2.5"/><path d="M8 7.5L20 18"/><path d="M8 16.5L20 6"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6z"/><path d="M9 4v14"/><path d="M15 6v14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  pause: '<path d="M8 5v14M16 5v14"/>'
};
function icon(name) {
  return `<svg class="ico" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ""}</svg>`;
}
let commentCounts = new Map();  // plan_item_id -> antal kommentarer (för -badgen i listan)

// "Koppla till markering" (omvänd koppling) för objekt importerade från
// 4-veckorsplaneringen utan 3D-koppling ännu - se armCoupleMode/
// onWorkspaceEvent/coupleItemToModelObjects. Objektet (inte bara dess id) hålls
// kvar direkt här så att skrivningen inte kan hamna fel om items hunnit laddas
// om (t.ex. via en bakgrundssparning) medan man väntar på 3D-markeringen.
let pendingCoupleItem = null;

// Senaste inlästa (men ännu inte skarpt sparade) 4-veckorsplanering-importen
// - se onImportPlanExcel/buildPlanImportDiff/onConfirmPlanImport.
let planImportDiff = null;

// Tidslinjen ska alltid gå att dra minst fram till/bakåt till de här
// datumen, oavsett vilka start-/slutdatum som faktiskt är inplanerade
// på objekten.
const TIMELINE_MIN_START = "2025-01-01";
const TIMELINE_MIN_END = "2030-12-31";

// Svenska visningsnamn per statusvärde - används i objektlistan,
// filterrutan och Excel-exporten så de alltid visar samma text.
// Victor 2026-10-02: "Ej planerad", "Snart aktuell" och "Klar, men försenad"
// är borttagna – för många val. Kvar: planerad, pågående, försenad, klar, pausad.
const STATUS_LABELS = {
  planerad: "Planerad men ej startad",
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
  elementType: it => it.elementType || "Utan typ",
  activity: it => it.activity || "Utan aktivitet",
  contractor: it => it.contractor || "Utan entreprenör",
  status: it => STATUS_LABELS[it.status] || it.status || "Okänd status"
};

// Standardfärger för statusmärkena i "Planerade objekt" - används tills
// Victor eventuellt justerar dem själv via kugghjulet (settings.statusColors).
// Samma fem värden är både status och beräknad fas (computeItemPhase), och
// lägesplanen visar exakt samma (Victor 2026-10-02).
const DEFAULT_STATUS_COLORS = {
  planerad: "#94a3b8",
  pagaende: "#f5a623",
  forsenad: "#e5484d",
  klar: "#3fb950",
  pausad: "#a1a1aa"
};
const COLOR_PANEL_LABELS = { ...STATUS_LABELS };

// Alla fem faserna färgsätter 3D-vyn och har ett opacitetsreglage.
const PHASE_OPACITY_KEYS = ["planerad", "pagaende", "forsenad", "klar", "pausad"];
const DEFAULT_PHASE_OPACITIES = {
  planerad: 1, pagaende: 1, forsenad: 1, klar: 1, pausad: 1
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
// räkna antal kommentarer per objekt (för -badgen i "Planerade objekt").
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
  initPanelVisibility();

  API = await TrimbleConnectWorkspace.connect(window.parent, onWorkspaceEvent, 30000);

  const project = await API.project.getProject();
  projectId = project.id;
  try { planSource = localStorage.getItem(PLAN_SOURCE_KEY()) === "pp" ? "pp" : "excel"; } catch (e) { planSource = "excel"; }
  renderPlanSourceUi();

  await refreshItems();
  await refreshCommentCounts();
  await refreshActivities();
  if (typeof loadManualMarks === "function") await loadManualMarks();
  if (typeof place3dLoad === "function") place3dLoad();
  buildFilterOptions();
  renderItemList();
  initTimelineRange();
  if (typeof renderManualMarks === "function") renderManualMarks();
}

/* Växeln Excel / Powerproject överst: visar den valda planeringen (egna filer, se planDir). */
function renderPlanSourceUi() {
  document.body.classList.toggle("src-pp", planSource === "pp");
  document.body.classList.toggle("src-excel", planSource !== "pp");
  document.querySelectorAll("#planSourceBar [data-src]").forEach(b => {
    const on = b.dataset.src === planSource;
    b.classList.toggle("active", on); b.setAttribute("aria-pressed", on ? "true" : "false");
  });
}
async function setPlanSource(src) {
  src = src === "pp" ? "pp" : "excel";
  if (src === planSource) return;
  if ([...saveJobs.values()].some(j => j.status === "pending")) { alert("Vänta tills ändringarna är sparade innan du byter planering."); return; }
  planSource = src;
  try { localStorage.setItem(PLAN_SOURCE_KEY(), src); } catch (e) {}
  renderPlanSourceUi();
  // Det som hör till den förra planeringen nollställs.
  items = []; itemsTotalCount = null; lastPlanImport = null; planImportDiff = null;
  selectedItemKeys = new Set(); selectionAnchorKey = null;
  if (typeof undoStack !== "undefined") { undoStack.length = 0; redoStack.length = 0; if (typeof renderUndoButtons === "function") renderUndoButtons(); }
  renderItemList();
  try { if (API && API.viewer) await API.viewer.setObjectState(undefined, { color: "reset" }); } catch (e) { /* inga modeller */ }
  await refreshAllData();
  try { await applyTimelineColors(); } catch (e) { /* inga modeller */ }
  if (typeof showLagesplanBanner === "function") showLagesplanBanner(src === "pp" ? "📅 Visar Powerproject-tidplanen" : "📊 Visar Excel-planeringen", 3000);
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
    await refreshItems({ fresh: true }); // ↻: alltid från GitHub (kollegors ändringar)
    await refreshCommentCounts();
    await refreshActivities();
    if (typeof loadManualMarks === "function") await loadManualMarks();
    if (typeof place3dLoad === "function") place3dLoad();
    buildFilterOptions();
    renderItemList();
    initTimelineRange();
    if (typeof renderManualMarks === "function") renderManualMarks();
  } catch (e) {
    console.error("Kunde inte hämta senaste data:", e);
    alert("Kunde inte hämta senaste data: " + e.message);
  } finally {
    btn.disabled = false;
    btn.classList.remove("spinning");
  }
}

function onWorkspaceEvent(event, data) {
  // Trimble Connect-token (för uppladdning till projektets mappar), se tcAccessToken.
  if (event === "extension.accessToken") {
    const t = data && data.data !== undefined ? data.data : data;
    if (typeof t === "string" && t.split(".").length === 3) { tcToken = t; tcTokenAt = Date.now(); tcTokenWaiters.splice(0).forEach(fn => fn(t)); }
    return;
  }
  // Lägesplanen (egen flik) väntar på en klickpunkt i 3D för kalibrering.
  if (event === "viewer.onPicked" && lagesplanPick) {
    const d = data && data.data ? data.data : data;
    const p = d && (d.position || d.point || d.hitPoint);
    if (p && p.x !== undefined) {
      const reply = lagesplanPick;
      const n = lagesplanPickN;
      lagesplanPick = null;
      reply({ point: { x: p.x, y: p.y, z: p.z } });
      showLagesplanBanner(n >= 2
        ? "✓ Punkt 2 registrerad – kalibreringen är klar. Gå tillbaka till lägesplanen."
        : `✓ Punkt ${n} registrerad.`, n >= 2 ? 8000 : 0);
    }
    return;
  }
  // Placera i 3D: medan man placerar ett objekt tas klicken om hand där.
  // Flytta modell live: medan man väljer vridpunkt/punkter tas klicken om hand där.
  if (typeof lmEvent === "function" && lmEvent(event, data)) return;
  if (typeof place3dEvent === "function" && place3dEvent(event, data)) return;
  // Manuella markeringar: medan man ritar tas klick/frihand om hand där.
  if (typeof manualMarksEvent === "function" && manualMarksEvent(event, data)) return;
  // Uppdatera markeringsräknaren och synka markeringen mot "Planerade
  // objekt"-listan när användaren markerar objekt i modellen.
  if (event === "viewer.onSelectionChanged" || event === "extension.onSelectionChanged") {
    // Hoppa över reaktioner på markeringar SOM APPEN SJÄLV precis gjorde
    // (t.ex. "Markera alla"/"Välj alla") - se ignoreModelSelectionEvents i
    // selectItemsInModel(). De hanterar redan sin egen listmarkering och
    // markeringsräknare, och en extra synk här skulle bara riskera att t.ex.
    // fälla ut en grupp man aktivt valde att hålla hopfälld.
    if (ignoreModelSelectionEvents > 0) return;
    // "Koppla till markering" väntar på NÄSTA 3D-markering för att koppla
    // ihop den med ett specifikt, redan valt objekt (se armCoupleMode) -
    // hanteras helt separat från den vanliga list-synken nedan, som annars
    // bara skulle försöka matcha markeringen mot BEFINTLIGA kopplingar.
    if (pendingCoupleItem) {
      handleCoupleModeSelection();
      return;
    }
    syncSelectionFromModel();
  }
}


/* ---------------------------------------------------------------------
   Brygga till Lägesplanen (lagesplan.html, öppnas i egen flik via )
   ---------------------------------------------------------------------
   Fliken är ett toppfönster och får därför INTE samma localStorage som
   extensionen (webbläsarna delar upp lagringen för inbäddade iframes), så
   token/inställningar skickas hit via postMessage. Lägesplanen kan också
   be om en klickpunkt i 3D (kalibrering), objektens positioner (bounding
   boxes, meter) och att markera objekt i modellen.
   ------------------------------------------------------------------- */
let lagesplanPick = null; // svarsfunktion medan lägesplanen väntar på ett klick i 3D
let lagesplanPickN = 1;    // vilken kalibreringspunkt (1 eller 2) som väntas
let lagesplanBannerTimer = null;

/** Tydlig banderoll överst i panelen medan lägesplanen väntar på klick i 3D. */
function showLagesplanBanner(text, hideAfterMs) {
  let el = document.getElementById("lagesplanBanner");
  if (!el) {
    el = document.createElement("div");
    el.id = "lagesplanBanner";
    el.style.cssText = "position:sticky;top:0;z-index:50;background:#0b5fff;color:#fff;padding:10px 12px;font-weight:600;border-radius:6px;margin:6px 0;box-shadow:0 2px 8px rgba(0,0,0,.25);";
    const host = document.getElementById("app") || document.body;
    host.insertBefore(el, host.firstChild);
  }
  clearTimeout(lagesplanBannerTimer);
  el.textContent = text || "";
  el.style.display = text ? "block" : "none";
  if (text && hideAfterMs) lagesplanBannerTimer = setTimeout(() => { el.style.display = "none"; }, hideAfterMs);
}

window.addEventListener("message", async e => {
  if (e.origin !== location.origin || !e.data || !e.data.lagesplan || !e.source) return;
  const msg = e.data;
  // Stora filer (IFC) flyttas till lägesplanen utan att kopieras (transfer); progress = hämtningens procent.
  const reply = (payload, transfer) => e.source.postMessage({ lagesplanReply: true, reqId: msg.reqId, ...payload }, location.origin, transfer || []);
  const progress = (f, got, total) => { try { e.source.postMessage({ lagesplanProgress: true, reqId: msg.reqId, f, got: got || 0, total: total || 0 }, location.origin); } catch (er) { /* fönstret stängt */ } };
  try {
    if (msg.type === "hello") {
      reply({ settings, projectId, planSource });
    } else if (msg.type === "pick") {
      if (lagesplanPick) lagesplanPick({ error: "Avbruten" });
      lagesplanPick = reply;
      lagesplanPickN = msg.n || 1;
      showLagesplanBanner(`Lägesplan: klicka på punkt ${lagesplanPickN} av 2 i 3D-modellen (samma ställe som krysset ${lagesplanPickN} i PDF:en).`);
    } else if (msg.type === "cancelPick") {
      if (lagesplanPick) lagesplanPick({ error: "Avbruten" });
      lagesplanPick = null;
      showLagesplanBanner("");
      reply({});
    } else if (msg.type === "tcUpload") {
      reply(await tcUploadFiles(msg.files || [], msg.folder || "Lägesplan", msg.folderId || null));
    } else if (msg.type === "ifcModelsList") {
      // 3D-vyn i lägesplanen: de IFC-modeller som är tända i TC (för den riktiga byggnaden).
      let ms = [];
      try { ms = await API.viewer.getModels("loaded"); } catch (e) { ms = await API.viewer.getModels(); }
      const list = (ms || []).filter(m => (!m.state || m.state === "loaded") && /\.ifc(zip)?$/i.test(m.name || ""))
        .map(m => ({ id: m.id, name: m.name, etab: /^Etablering /.test(m.name || ""), version: m.versionId || m.version || "" }));
      reply({ models: list });
    } else if (msg.type === "ifcModelData") {
      const ms = await API.viewer.getModels();
      const spec = (ms || []).find(m => m.id === msg.modelId);
      if (!spec) throw new Error("Modellen är inte tänd i Trimble Connect längre.");
      showLagesplanBanner(`Hämtar ${spec.name} till lägesplanens 3D-vy…`);
      const bytes = await ifcSubsetUnzip(await ifcSubsetDownload(spec, progress));
      showLagesplanBanner("", 0);
      const buf = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      reply({ name: spec.name, placement: spec.placement || null, bytes: buf }, [buf]);
    } else if (msg.type === "tcFolder") {
      // Hämta modell i lägesplanens 3D-vy: bläddra i projektets mappar i TC.
      reply(await tcFolderItems(msg.folderId || null));
    } else if (msg.type === "tcFile") {
      const bytes = await tcFileBytes(msg.fileId, msg.name, progress);
      const buf = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      reply({ bytes: buf }, [buf]);
    } else if (msg.type === "placementsChanged") {
      // 3D-vyn i lägesplanen har sparat etableringen: läs om (egna osparade ändringar sparas först).
      if (typeof place3dLoad === "function") {
        if (placeDirty.size || placeDeleted.size) await placeSaveNow();
        await place3dLoad({ fresh: true });
      }
      reply({});
    } else if (msg.type === "placeSaveIfc") {
      if (typeof placeSaveIfc !== "function") throw new Error("Placera i 3D finns inte i den här versionen av 4D-planering.");
      if (placeDirty.size || placeDeleted.size) await placeSaveNow();
      await place3dLoad({ fresh: true });
      const r = await placeSaveIfc();
      reply(r || { n: 0 });
    } else if (msg.type === "positions") {
      reply(await lagesplanPositions());
    } else if (msg.type === "select") {
      const ids = new Set(msg.ids || []);
      const sel = items.filter(it => ids.has(it.id));
      await selectItemsInModel(sel);
      // Klick på ett objekt i lägesplanen: hoppa också till raden i listan.
      if (msg.jump && sel.length) {
        selectedItemKeys = new Set(sel.map(it => it.objectId));
        selectionAnchorKey = null;
        jumpToItemsInList(selectedItemKeys);
      }
      reply({ count: sel.length });
    }
  } catch (err) {
    reply({ error: err.message || String(err) });
  }
});

/* ---------------------------------------------------------------------
   Uppladdning till Trimble Connect (Lägesplanens ortofoto-original).
   Kräver att användaren godkänner att tillägget får en access-token
   (API.extension.requestPermission). Använder Trimble Connects REST-API
   (Core API 2.0) i projektets region: hittar/skapar mappen under
   projektets rotmapp och laddar upp filerna dit.
   ------------------------------------------------------------------- */
let tcToken = null, tcTokenAt = 0;
const tcTokenWaiters = [];
async function tcAccessToken() {
  if (tcToken && Date.now() - tcTokenAt < 50 * 60 * 1000) return tcToken;
  const r = await API.extension.requestPermission("accesstoken");
  if (typeof r === "string" && r.split(".").length === 3) { tcToken = r; tcTokenAt = Date.now(); return r; }
  if (r === "denied") throw new Error("Tillägget fick inte behörighet till Trimble Connect (nekad).");
  // Väntar på att användaren godkänner i Trimble Connect ("extension.accessToken").
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Inget godkännande från Trimble Connect inom 2 minuter.")), 120000);
    tcTokenWaiters.push(t => { clearTimeout(timer); resolve(t); });
  });
}
async function tcApiBase(tokenVal, project) {
  const byLocation = { europe: "https://app21.connect.trimble.com/tc/api/2.0", asia: "https://app31.connect.trimble.com/tc/api/2.0", australia: "https://app32.connect.trimble.com/tc/api/2.0" };
  try {
    const res = await fetch("https://app.connect.trimble.com/tc/api/2.0/regions", { headers: { Authorization: `Bearer ${tokenVal}` } });
    if (res.ok) {
      const regions = await res.json();
      const loc = String(project.location || "").toLowerCase();
      const hit = (regions || []).find(r => String(r.location || r.region || "").toLowerCase() === loc);
      const uri = hit && (hit["tc-api"] || hit.tcApi || hit.serviceUri || (hit.origin ? `https://${hit.origin}/tc/api/2.0` : ""));
      if (uri) return uri.replace(/\/$/, "");
    }
  } catch (e) { /* faller tillbaka på kända adresser */ }
  return byLocation[String(project.location || "").toLowerCase()] || "https://app.connect.trimble.com/tc/api/2.0";
}
/* Mappen i Trimble Connect på webben (samma adress i alla regioner). */
function tcWebFolderUrl(projectId, folderId) {
  return projectId && folderId ? `https://web.connect.trimble.com/projects/${encodeURIComponent(projectId)}/data/folder/${encodeURIComponent(folderId)}` : null;
}
async function tcUploadFiles(files, folderName, folderId = null) {
  try { return await tcUploadFilesInner(files, folderName, folderId); }
  catch (e) { showLagesplanBanner(`Kunde inte spara i Trimble Connect: ${e.message}`, 10000); throw e; }
}
/* folderId: en bestämd mapp (t.ex. samma mapp som originalet), annars mappen folderName under roten. */
async function tcUploadFilesInner(files, folderName, folderId = null) {
  if (!files.length) return { uploaded: 0 };
  const tokenVal = await tcAccessToken();
  const project = await API.project.getProject();
  const base = await tcApiBase(tokenVal, project);
  const H = { Authorization: `Bearer ${tokenVal}` };
  const j = async (res, what) => { if (!res.ok) throw new Error(`${what} misslyckades (${res.status}) ${await res.text().catch(() => "")}`.trim()); return res.json(); };
  let folder = null;
  if (folderId) {
    const info = await fetch(`${base}/folders/${encodeURIComponent(folderId)}`, { headers: H }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    folder = { id: folderId, name: (info && info.name) || "samma mapp" };
    folderName = folder.name;
  }
  const proj = folder ? null : await j(await fetch(`${base}/projects/${encodeURIComponent(project.id)}`, { headers: H }), "Läsa projektet");
  const rootId = proj && (proj.rootId || proj.rootFolderId);
  const children = folder ? [] : await j(await fetch(`${base}/folders/${encodeURIComponent(rootId)}/items`, { headers: H }), "Läsa rotmappen");
  if (!folder) folder = (children || []).find(x => (x.type || "").toUpperCase() === "FOLDER" && x.name === folderName);
  if (!folder) {
    folder = await j(await fetch(`${base}/folders`, { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: JSON.stringify({ name: folderName, parentId: rootId }) }), "Skapa mappen");
  }
  const done = [];
  for (const f of files) {
    showLagesplanBanner(`Laddar upp ${f.name} (${f.size < 1048576 ? Math.max(1, Math.round(f.size / 1024)) + " kB" : (f.size / 1048576).toFixed(0) + " MB"}) till Trimble Connect…`);
    done.push({ name: f.name, res: await tcUploadOne(base, H, j, folder.id, f) });
  }
  showLagesplanBanner(`✓ ${files.length} filer sparade i Trimble Connect (${folderName}).`, 6000);
  // files: svaret från commit per fil (id m.m.), t.ex. för att tända filen i 3D-vyn.
  // link: mappen i Trimble Connect på webben (Victor 2026-10-10: "en länk … varje gång du sparar något i TC-mappen").
  return { uploaded: files.length, folder: folderName, folderId: folder.id, projectId: project.id, link: tcWebFolderUrl(project.id, folder.id), files: done };
}

/* En fil till en mapp i Trimble Connect (Victors rapport 2026-10-06: exporterna hamnade inte i
   TC). Core API 2.0 laddar upp i tre steg, som Trimbles eget SDK (trimble-connect-sdk,
   uploadFileContent): 1) POST files/fs/initiate { parentId, parentType, name } ger uploadURL +
   uploadId, 2) PUT filen till uploadURL (lagringen, utan vår token), 3) POST files/fs/commit
   { uploadId } skapar filen i mappen. Finns en fil med samma namn blir den en ny version. */
async function tcUploadOne(base, H, j, folderId, f) {
  const JH = { ...H, "Content-Type": "application/json" };
  const init = await j(await fetch(`${base}/files/fs/initiate`, { method: "POST", headers: JH, body: JSON.stringify({ parentId: folderId, parentType: "FOLDER", name: f.name }) }), `Starta uppladdningen av ${f.name}`);
  const url = init && (init.uploadURL || init.uploadUrl);
  if (!url || !init.uploadId) throw new Error(`Trimble Connect gav ingen uppladdningsadress för ${f.name}`);
  const put = await fetch(url, { method: "PUT", body: f });
  if (!put.ok) throw new Error(`Uppladdningen av ${f.name} misslyckades (${put.status})`);
  return j(await fetch(`${base}/files/fs/commit`, { method: "POST", headers: JH, body: JSON.stringify({ uploadId: init.uploadId }) }), `Spara ${f.name} i mappen`);
}

/* Bläddra i projektets mappar i Trimble Connect (Victors önskemål 2026-10-09: "importera IFC:er
   från Trimble Connect" till Placera i 3D och lägesplanens 3D-editor). folderId null = rotmappen.
   Bara läsning – inget i TC ändras. */
async function tcFolderItems(folderId) {
  const tokenVal = await tcAccessToken();
  const project = await API.project.getProject();
  const base = await tcApiBase(tokenVal, project);
  const H = { Authorization: `Bearer ${tokenVal}` };
  const j = async (res, what) => { if (!res.ok) throw new Error(`${what} misslyckades (${res.status}).`); return res.json(); };
  let id = folderId;
  if (!id) { const proj = await j(await fetch(`${base}/projects/${encodeURIComponent(project.id)}`, { headers: H }), "Läsa projektet"); id = proj.rootId || proj.rootFolderId; }
  const list = await j(await fetch(`${base}/folders/${encodeURIComponent(id)}/items`, { headers: H }), "Läsa mappen");
  const items = (list || []).map(x => ({ id: x.id, name: x.name || "", type: String(x.type || "").toUpperCase() === "FOLDER" ? "folder" : "file",
    size: Number(x.size || x.filesize || 0) || 0, modified: x.modifiedOn || x.modified || x.createdOn || null, versionId: x.versionId || null }));
  items.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, "sv", { numeric: true }) : a.type === "folder" ? -1 : 1));
  return { folderId: id, projectName: project.name || "", items };
}
/* En fil från TC som bytes (.ifczip packas upp till IFC). */
async function tcFileBytes(fileId, name = "", onProgress = null) {
  if (!fileId) throw new Error("Ingen fil vald.");
  const bytes = await ifcSubsetDownload({ fileId }, onProgress);
  return /\.ifczip$/i.test(name) ? ifcSubsetUnzip(bytes) : bytes;
}

/** Mittpunkt och höjdintervall (meter) för alla planerade objekt i inlästa modeller. */
async function lagesplanPositions() {
  const byModel = {};
  items.filter(it => it.modelId && it.objectId).forEach(it => { (byModel[it.modelId] = byModel[it.modelId] || []).push(it); });
  const positions = [];
  let missing = 0;
  for (const modelId of Object.keys(byModel)) {
    const group = byModel[modelId];
    let pairs;
    try {
      const res = await convertToRuntimeIdsSafe(modelId, group.map(it => it.objectId));
      pairs = group.map((it, i) => ({ it, runtimeId: res[i] && res[i].runtimeId })).filter(p => p.runtimeId !== undefined && p.runtimeId !== null);
    } catch (e) {
      missing += group.length;
      continue;
    }
    missing += group.length - pairs.length;
    for (let i = 0; i < pairs.length; i += 1000) {
      const chunk = pairs.slice(i, i + 1000);
      let boxes = [];
      try { boxes = await API.viewer.getObjectBoundingBoxes(modelId, chunk.map(p => p.runtimeId)); } catch (e) { missing += chunk.length; continue; }
      const boxById = new Map(boxes.map(b => [b.id, b.boundingBox]));
      chunk.forEach(({ it, runtimeId }) => {
        const b = boxById.get(runtimeId);
        if (!b) { missing++; return; }
        positions.push({ id: it.id, x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2, z0: b.min.z, z1: b.max.z,
          x0: b.min.x, x1: b.max.x, y0: b.min.y, y1: b.max.y });
      });
    }
  }
  return { positions, missing };
}

/* ---------------------------------------------------------------------
   UI-koppling
   ------------------------------------------------------------------- */
function bindUI() {
  document.getElementById("versionBadge").innerText = `Version ${APP_VERSION}`;

  document.getElementById("btnLinkSelection").onclick = onOpenLinkForm;
  document.getElementById("btnCancelLink").onclick = () => { newActivityMode = false; toggle("linkForm", false); scrollBackToEditedItem(); };
  document.getElementById("btnNewActivity").onclick = () => openNewActivityForm();
  document.getElementById("btnDuplicateActivity").onclick = () => {
    const it = items.find(x => x.id === lastEditedItemId);
    if (it) { toggle("linkForm", false); openNewActivityForm(it); }
  };
  document.getElementById("btnAddSubActivity").onclick = onAddSubActivity;
  document.getElementById("btnSaveLink").onclick = onSaveLink;
  document.getElementById("fProgress").oninput = () => {
    document.getElementById("fProgressLabel").innerText = document.getElementById("fProgress").value;
  };
  // Fyll i "Verkligt avslut" automatiskt med dagens datum när status sätts
  // till Klar (bara om fältet är tomt - skriver aldrig över ett datum
  // Victor redan justerat manuellt). Går att ändra i efterhand precis som
  // vilket annat fält som helst.
  document.getElementById("fStatus").onchange = () => {
    const statusEl = document.getElementById("fStatus");
    const actualEndEl = document.getElementById("fActualEnd");
    if (statusEl.value === "klar" && !actualEndEl.value) {
      actualEndEl.value = new Date().toISOString().slice(0, 10);
    }
  };
  // Omvänt håll: fyller man i ett verkligt avslut manuellt (utan att också
  // klicka om Status) sätts statusen automatiskt till Klar - annars skulle
  // objektet visa ett verkligt avslutsdatum men ändå räknas som t.ex.
  // "Pågående" i status-fältet, vilket är motsägelsefullt. Se Victors
  // förfrågan 2026-09-17. Rör bara statusen framåt (till "klar") - att
  // rensa fältet igen ändrar inte status tillbaka automatiskt, det görs
  // manuellt precis som idag.
  document.getElementById("fActualEnd").onchange = () => {
    const actualEndEl = document.getElementById("fActualEnd");
    const statusEl = document.getElementById("fStatus");
    if (actualEndEl.value && statusEl.value !== "klar") {
      statusEl.value = "klar";
    }
  };
  // Nollställ-knappar bredvid Verklig start/Verkligt avslut - sätter bara
  // .value = "" programmatiskt (triggar inte onchange ovan, så det rensar
  // inte av misstag om statusen till "klar"). Se Victors förfrågan
  // 2026-09-17.
  document.getElementById("btnClearActualStart").onclick = () => {
    document.getElementById("fActualStart").value = "";
  };
  document.getElementById("btnClearActualEnd").onclick = () => {
    document.getElementById("fActualEnd").value = "";
  };
  // Verklig start/avslut är en valfri, hopfälld "extra"-sektion i
  // formuläret - klick på rubrikknappen fäller ut/in den manuellt.
  document.getElementById("btnToggleActualDates").onclick = () => {
    const fields = document.getElementById("actualDatesFields");
    setActualDatesSectionExpanded(fields.classList.contains("hidden"));
  };

  document.getElementById("timelineSlider").oninput = onSliderMove;
  document.getElementById("timelineDate").onchange = onDateInputChange;
  document.getElementById("btnPlay").onclick = onTogglePlay;
  document.getElementById("btnApplyTimelineRange").onclick = onApplyTimelineRange;
  document.getElementById("btnResetTimelineRange").onclick = onResetTimelineRange;

  document.getElementById("btnApplyFilter").onclick = applyFilterToModel;
  document.getElementById("btnClearFilter").onclick = clearFilter;
  document.getElementById("btnShowAllCoupled").onclick = showAllModelObjects;

  // "Snart aktuell"-tröskeln (dagar innan planerat slutdatum) - en slider
  // direkt i Filter-panelen istället för i Inställningar, så den går att
  // justera snabbt medan man tittar på listan/3D-vyn. Sparas direkt vid
  // varje ändring (inte bara vid "Spara inställningar").
  const warningDaysSlider = document.getElementById("warningDaysSlider");
  const warningDaysLabel = document.getElementById("warningDaysLabel");
  if (warningDaysSlider && warningDaysLabel) {
  warningDaysSlider.value = settings.warningDaysBeforeEnd;
  warningDaysLabel.innerText = `${settings.warningDaysBeforeEnd} dagar`;
  warningDaysSlider.oninput = () => {
    const days = Number(warningDaysSlider.value);
    settings.warningDaysBeforeEnd = days;
    warningDaysLabel.innerText = `${days} dagar`;
    try { window.localStorage.setItem("4dplan-settings", JSON.stringify(settings)); } catch (e) { /* ignorera */ }
    applyTimelineColors();
    renderItemList();
  };
  }
  // Markera (utan att isolera/dölja) matchande objekt direkt när ett
  // filteralternativ ändras, så man ser dem i 3D-vyn innan man ev. klickar
  // "Visa filtrerat" eller isolerar/döljer manuellt i Trimble Connect.
  ["filterArea", "filterActivity", "filterType", "filterContractor", "filterStatus", "filterSource"].forEach(id => {
    document.getElementById(id).onchange = () => { renderItemList(); selectFilteredInModelOnChange(); };
  });
  document.getElementById("filterWeeks").onchange = () => renderItemList();

  document.getElementById("btnImportExcel").onclick = onImportExcel;
  document.getElementById("btnExportExcel").onclick = onExportExcel;
  document.getElementById("btnImportPlanExcel").onclick = onImportPlanExcel;
  document.getElementById("btnConfirmPlanImport").onclick = onConfirmPlanImport;
  document.getElementById("btnCancelPlanImport").onclick = () => { planImportDiff = null; toggle("planImportPreviewDialog", false); };
  document.getElementById("btnPlanImportReport").onclick = () => { if (planImportDiff) exportPlanImportReport(planImportDiff); };
  document.getElementById("btnCancelCoupleMode").onclick = cancelCoupleMode;
  document.getElementById("btnSaveCoupleMode").onclick = onSaveCoupleMode;

  document.getElementById("itemSearch").oninput = () => renderItemList();
  document.getElementById("groupBy").onchange = () => renderItemList();
  const sortBySel = document.getElementById("sortBy");
  try { const v = localStorage.getItem("4dplan-sort-by"); if (v !== null && [...sortBySel.options].some(o => o.value === v)) sortBySel.value = v; } catch (e) {}
  sortBySel.onchange = () => { try { localStorage.setItem("4dplan-sort-by", sortBySel.value); } catch (e) {} renderItemList(); };
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
  document.getElementById("todayOnly").onchange = () => renderItemList();
  document.getElementById("uncoupledOnly").onchange = () => renderItemList();

  document.getElementById("btnDeleteSelected").onclick = onDeleteSelectedItems;
  document.getElementById("btnCollapseAllGroups").onclick = collapseAllGroups;
  document.getElementById("btnSelectAllCoupled").onclick = selectAllCoupledObjects;
  document.getElementById("btnRenameValue").onclick = onOpenRenameDialog;
  document.getElementById("renameField").onchange = populateRenameOldValues;
  document.getElementById("renameOldValue").onchange = updateRenameCount;
  document.getElementById("btnDoRename").onclick = onDoRename;
  document.getElementById("btnCloseRename").onclick = () => toggle("renameDialog", false);

  document.getElementById("btnSuggestDeps").onclick = onOpenSuggestDepsDialog;
  document.getElementById("btnAcceptAllSuggestedDeps").onclick = onAcceptAllSuggestedDeps;
  document.getElementById("btnCloseSuggestDeps").onclick = () => toggle("suggestDepsDialog", false);

  document.getElementById("btnEditSelected").onclick = onOpenBulkEditDialog;
  document.getElementById("btnDoBulkEdit").onclick = onDoBulkEdit;
  document.getElementById("btnCloseBulkEdit").onclick = () => toggle("bulkEditDialog", false);

  document.getElementById("btnFindNearest").onclick = onFindNearest;

  document.getElementById("btnShowLabels").onclick = onShowLabels;
  document.getElementById("btnClearLabels").onclick = onClearLabels;

  setupAutocomplete("fArea", "fAreaList", () => formOptions.area);
  setupAutocomplete("fType", "fTypeList", () => formOptions.elementType);
  setupAutocomplete("fActivity", "fActivityList", () => formOptions.activity);
  setupAutocomplete("fContractor", "fContractorList", () => formOptions.contractor);
  // "Nytt/befintligt namn" i Byt namn-dialogen - föreslår befintliga värden
  // för det FÄLT som just nu är valt (Område/Aktivitet/Entreprenör), så man
  // t.ex. kan slå ihop "Sikthall" in i ett redan befintligt "741 - Sikthall"
  // istället för att bara skriva helt fritt.
  setupAutocomplete("renameNewValue", "renameNewValueList", () => formOptions[document.getElementById("renameField").value] || []);

  document.getElementById("saveStatus").onclick = onSaveStatusClick;

  document.getElementById("btnRefresh").onclick = refreshAllData;
  // Lägesplan öppnas som egen sida (samma origin -> delar token/inställningar).
  document.getElementById("btnStatusPlan").onclick = () => openLagesplanWindow("");
  const b3d = document.getElementById("btnOpen3d");
  if (b3d) b3d.onclick = () => openLagesplanWindow("&view=3d");
  /* Lägesplanen (view=3d: direkt i 3D-vyn). */
  function openLagesplanWindow(extra) {
    if (!projectId) { alert("Projektet är inte laddat än."); return; }
    // Eget fönster (inte flik) på högra halvan av skärmen, så det kan ligga
    // bredvid Trimble Connect - kalibreringen kräver klick i båda.
    const w = Math.round(screen.availWidth / 2), h = screen.availHeight;
    const left = (screen.availLeft || 0) + screen.availWidth - w, top = screen.availTop || 0;
    const win = window.open("lagesplan.html?project=" + encodeURIComponent(projectId) + (planSource === "pp" ? "&source=pp" : "") + (extra || ""), "lagesplan-" + projectId,
      `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
    if (win) win.focus();
  }
  document.getElementById("btnSettings").onclick = () => { toggle("settingsDialog", true); renderBackupList(); };
  document.getElementById("btnBackupNow").onclick = async () => {
    const btn = document.getElementById("btnBackupNow");
    btn.disabled = true;
    try { await createBackup("Manuell säkerhetskopia"); await renderBackupList(); }
    catch (e) { alert("Kunde inte skapa säkerhetskopian: " + e.message); }
    finally { btn.disabled = false; }
  };
  document.getElementById("btnResetPlanning").onclick = onResetPlanning;
  document.getElementById("btnLoadCoupledModels").onclick = loadCoupledModels;
  document.getElementById("btnCloseSettings").onclick = () => toggle("settingsDialog", false);
  if (document.getElementById("btnCloseSettingsX")) document.getElementById("btnCloseSettingsX").onclick = () => toggle("settingsDialog", false);
  // Inställningarnas sektioner minns om de är utfällda (per webbläsare).
  document.querySelectorAll("#settingsDialog .set-sec").forEach(d => {
    try { const v = JSON.parse(localStorage.getItem("4dplan-setsecs") || "{}")[d.dataset.sec]; if (typeof v === "boolean") d.open = v; } catch (e) { /* ignorera */ }
    d.addEventListener("toggle", () => {
      try { const o = JSON.parse(localStorage.getItem("4dplan-setsecs") || "{}"); o[d.dataset.sec] = d.open; localStorage.setItem("4dplan-setsecs", JSON.stringify(o)); } catch (e) { /* ignorera */ }
    });
  });
  document.getElementById("btnSaveSettings").onclick = onSaveSettings;

  document.getElementById("btnCloseComments").onclick = () => toggle("commentsDialog", false);
  document.getElementById("btnAddComment").onclick = () => {
    const text = document.getElementById("commentText").value.trim();
    if (!text) return;
    onSubmitComment(text, null);
  };
  document.getElementById("commentsList").onclick = onCommentsListClick;

  document.getElementById("playSecondsPerDay").value = settings.playSecondsPerDay;
  document.getElementById("githubToken").value = settings.githubToken;
  paintLegendDots();
  renderStatusColorInputs();
  updateConnectionWarning();
}

/**
 * Bygger en färgväljare per statusvärde/fas (planerad, pågående, försenad,
 * klar, pausad) i inställningsdialogen,
 * utifrån COLOR_PANEL_LABELS - så listan alltid matchar det som faktiskt
 * finns i appen (fStatus-selecten, badges, 3D-färgsättningen m.m.) utan att
 * behöva underhållas på två ställen.
 */
function renderStatusColorInputs() {
  const wrap = document.getElementById("statusColorInputs");
  if (!wrap) return;
  const tempOffEl = document.getElementById("setTempOff");
  if (tempOffEl) { const v = String(tempOffOpacity()); tempOffEl.value = [...tempOffEl.options].some(o => o.value === v) ? v : "0"; }
  wrap.innerHTML = Object.entries(COLOR_PANEL_LABELS).map(([key, label]) => {
    const hasOpacity = PHASE_OPACITY_KEYS.includes(key);
    // En rad per status: färg, namn, opacitet i 3D (Victor 2026-10-02: städad meny).
    return `
    <div class="sc-row">
      <input type="color" id="statusColor_${key}" title="Färg för ${escapeHtml(label)}" />
      <span class="sc-name">${escapeHtml(label)}</span>
      ${hasOpacity ? `<input type="range" id="statusOpacity_${key}" min="0" max="100" step="1" title="Opacitet i 3D-vyn" />
      <span class="sc-pct" id="statusOpacityLabel_${key}"></span>` : ""}
    </div>`;
  }).join("");
  Object.keys(COLOR_PANEL_LABELS).forEach(key => {
    const el = document.getElementById(`statusColor_${key}`);
    if (el) el.value = (settings.statusColors && settings.statusColors[key]) || DEFAULT_STATUS_COLORS[key] || "#999999";
    if (PHASE_OPACITY_KEYS.includes(key)) {
      const opacityFraction = (settings.statusOpacities && settings.statusOpacities[key] !== undefined)
        ? settings.statusOpacities[key] : DEFAULT_PHASE_OPACITIES[key];
      const pct = Math.round(Math.max(0, Math.min(1, opacityFraction)) * 100);
      const rangeEl = document.getElementById(`statusOpacity_${key}`);
      const labelEl = document.getElementById(`statusOpacityLabel_${key}`);
      if (rangeEl) {
        rangeEl.value = String(pct);
        rangeEl.oninput = () => { if (labelEl) labelEl.textContent = `${rangeEl.value}%`; };
      }
      if (labelEl) labelEl.textContent = `${pct}%`;
    }
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
  const panels = document.querySelectorAll("section.panel[data-panel-id]");

  const updateCollapseAllButton = () => {
    const btnAll = document.getElementById("btnCollapseAll");
    if (!btnAll) return;
    const panelIds = [...panels].map(p => p.dataset.panelId);
    const allCollapsed = panelIds.length > 0 && panelIds.every(id => collapsedPanels.has(id));
    btnAll.title = allCollapsed ? "Expandera alla block" : "Minimera alla block";
    btnAll.textContent = allCollapsed ? "⊞" : "⊟";
  };

  panels.forEach(panel => {
    const id = panel.dataset.panelId;
    const h2 = panel.querySelector(":scope > h2");
    if (!h2) return;
    panel.classList.toggle("collapsed", collapsedPanels.has(id));
    h2.onclick = () => {
      panel.classList.toggle("collapsed");
      if (panel.classList.contains("collapsed")) collapsedPanels.add(id);
      else collapsedPanels.delete(id);
      saveCollapsedPanels();
      updateCollapseAllButton();
    };
  });

  // "Collapsa alla" i headern (⊟/⊞) - samma mönster som 4D-dashboard: minimerar
  // ALLA paneler om någon är expanderad, annars expanderar den alla igen. Se
  // Victors förfrågan 2026-09-17.
  const btnCollapseAll = document.getElementById("btnCollapseAll");
  if (btnCollapseAll) {
    btnCollapseAll.onclick = () => {
      const panelIds = [...panels].map(p => p.dataset.panelId);
      const allCollapsed = panelIds.every(id => collapsedPanels.has(id));
      panelIds.forEach(id => {
        if (allCollapsed) collapsedPanels.delete(id); else collapsedPanels.add(id);
      });
      saveCollapsedPanels();
      panels.forEach(panel => panel.classList.toggle("collapsed", collapsedPanels.has(panel.dataset.panelId)));
      updateCollapseAllButton();
    };
  }
  updateCollapseAllButton();
}

/* ---------------------------------------------------------------------
   Synliga block – till skillnad från minimering (ovan) döljer detta ett
   block helt (inklusive rubriken). Kryssrutorna byggs dynamiskt utifrån
   samtliga [data-panel-id] och läget sparas direkt i localStorage - se
   motsvarande i 4D-dashboard (Victors förfrågan 2026-09-17: "Man ska
   kunna välja från en lista vilka block man vill ha synliga").
   ------------------------------------------------------------------- */
const PANEL_VISIBILITY_KEY = "4dplan-hidden-panels";
let hiddenPanels = new Set();

function loadHiddenPanels() {
  try {
    const raw = window.localStorage.getItem(PANEL_VISIBILITY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (e) {
    return new Set();
  }
}

function saveHiddenPanels() {
  try {
    window.localStorage.setItem(PANEL_VISIBILITY_KEY, JSON.stringify([...hiddenPanels]));
  } catch (e) { /* ignorera */ }
}

function initPanelVisibility() {
  hiddenPanels = loadHiddenPanels();
  const panels = document.querySelectorAll("section.panel[data-panel-id]");
  const listEl = document.getElementById("panelVisibilityList");

  const applyPanel = (panel) => {
    panel.classList.toggle("panel-hidden", hiddenPanels.has(panel.dataset.panelId));
  };
  panels.forEach(applyPanel);

  if (listEl) {
    listEl.innerHTML = [...panels].map(panel => {
      const id = panel.dataset.panelId;
      const h2 = panel.querySelector(":scope > h2");
      // Rubrikens text utan knappar och räknare ("Planerade objekt (0)" -> "Planerade objekt").
      let title = id;
      if (h2) { const c = h2.cloneNode(true); c.querySelectorAll("button, select, input, .count, .hint").forEach(x => x.remove()); title = c.textContent.replace(/\s*\(\d+(\/\d+)?\)\s*$/, "").replace(/\s+/g, " ").trim() || id; }
      const checked = hiddenPanels.has(id) ? "" : "checked";
      return `<label><input type="checkbox" class="panel-visibility-check" data-panel-id="${escapeHtml(id)}" ${checked} /> ${escapeHtml(title)}</label>`;
    }).join("");

    listEl.querySelectorAll(".panel-visibility-check").forEach(cb => {
      cb.onchange = () => {
        const id = cb.dataset.panelId;
        if (cb.checked) hiddenPanels.delete(id); else hiddenPanels.add(id);
        saveHiddenPanels();
        const panel = document.querySelector(`section.panel[data-panel-id="${id}"]`);
        if (panel) applyPanel(panel);
      };
    });
  }
}

// Vilken legend-prick (i Tidslinje-panelen) som hör till vilken beräknad
// fas - se computeItemPhase().
const PHASE_DOT_IDS = {
  planerad: "dotPlanerad",
  pagaende: "dotPagaende",
  forsenad: "dotForsenad",
  klar: "dotKlar",
  pausad: "dotPausad"
};

function paintLegendDots() {
  const colors = { ...DEFAULT_STATUS_COLORS, ...(settings.statusColors || {}) };
  Object.entries(PHASE_DOT_IDS).forEach(([phase, id]) => {
    const el = document.getElementById(id);
    if (el) el.style.background = colors[phase];
  });
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
  // Samma resonemang för statusOpacities (opacitet i 3D-vyn per beräknad
  // fas) - saknade/nya nycklar ska falla tillbaka till 100% opacitet
  // (DEFAULT_PHASE_OPACITIES), inte försvinna helt.
  settings.statusOpacities = { ...DEFAULT_PHASE_OPACITIES, ...(settings.statusOpacities || {}) };
  // "Snart aktuell"-tröskeln sparas i samma settings-objekt (så den följer
  // med i 4dplan-settings i localStorage), men styrs live via slidern i
  // Filter-panelen (se bindUI()) - inte via den här dialogen. Faller
  // tillbaka till 7 dagar om värdet saknas eller är ogiltigt (t.ex. äldre
  // sparade inställningar från innan fältet fanns).
  if (!Number.isFinite(settings.warningDaysBeforeEnd) || settings.warningDaysBeforeEnd < 0) {
    settings.warningDaysBeforeEnd = 7;
  }
}

function onSaveSettings() {
  settings.playSecondsPerDay = Number(document.getElementById("playSecondsPerDay").value) || 0.4;
  settings.githubToken = document.getElementById("githubToken").value.trim();
  const newStatusColors = {};
  Object.keys(COLOR_PANEL_LABELS).forEach(key => {
    const el = document.getElementById(`statusColor_${key}`);
    newStatusColors[key] = el ? el.value : (settings.statusColors && settings.statusColors[key]) || DEFAULT_STATUS_COLORS[key];
  });
  settings.statusColors = newStatusColors;
  const newStatusOpacities = {};
  PHASE_OPACITY_KEYS.forEach(key => {
    const el = document.getElementById(`statusOpacity_${key}`);
    newStatusOpacities[key] = el ? Number(el.value) / 100 : (settings.statusOpacities && settings.statusOpacities[key]) ?? DEFAULT_PHASE_OPACITIES[key];
  });
  settings.statusOpacities = newStatusOpacities;
  const tempOffEl = document.getElementById("setTempOff");
  if (tempOffEl) settings.tempOffOpacity = Number(tempOffEl.value) || 0;
  window.localStorage.setItem("4dplan-settings", JSON.stringify(settings));
  paintLegendDots();
  updateConnectionWarning();
  toggle("settingsDialog", false);
  renderItemList();
  refreshItems().then(async () => {
    await refreshCommentCounts();
    await refreshActivities();
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
      const match = items.find(it => it.modelId === modelSel.modelId && String(it.objectId) === String(extId));
      if (match) matchedKeys.add(match.objectId);
    });
  }

  // Samma markering som listan redan visar (t.ex. ett eko av appens egen
  // markering i 3D): gör ingenting – annars ritas listan om och hoppar.
  if (matchedKeys.size > 0 && matchedKeys.size === selectedItemKeys.size && [...matchedKeys].every(k => selectedItemKeys.has(k))) return;
  if (matchedKeys.size > 0) {
    selectedItemKeys = matchedKeys;
    selectionAnchorKey = null;
    jumpToItemsInList(matchedKeys);
  } else {
    showHiddenMatchNotice(null);
  }
}

/* Scrolla inte listan åt användaren om raden redan syns, eller om man själv
   precis har scrollat (då hoppade listan tillbaka mitt i scrollningen). */
let lastUserScrollAt = 0;
["wheel", "touchmove"].forEach(ev => window.addEventListener(ev, () => { lastUserScrollAt = Date.now(); }, { passive: true, capture: true }));
window.addEventListener("keydown", e => { if (/^(Arrow|Page|Home|End| )/.test(e.key)) lastUserScrollAt = Date.now(); }, true);
function userScrolledRecently() { return Date.now() - lastUserScrollAt < 2500; }
function rowOutOfView(row) {
  const r = row.getBoundingClientRect();
  const bottom = window.innerHeight - 60; // tidslinjen längst ner
  return r.top < 90 || r.bottom > bottom;
}

/**
 * Hoppar till raderna i "Planerade objekt" (Victors önskemål 2026-09-28:
 * klick på ett kopplat objekt i 3D ska visa det i listan): fäller ut
 * panelen och gruppen, scrollar raden till mitten och blinkar till den.
 * Döljs raden av sökning/filter visas en rad med en knapp som tar bort
 * filtren, istället för att tyst inte hända något.
 */
function jumpToItemsInList(keys) {
  const panel = document.querySelector('section.panel[data-panel-id="items"]');
  if (panel && panel.classList.contains("collapsed")) {
    panel.classList.remove("collapsed");
    collapsedPanels.delete("items");
    saveCollapsedPanels();
  }
  expandGroupsForKeys(keys);
  renderItemList();
  const visibleKeys = new Set(getVisibleItems().map(it => it.objectId));
  const hidden = items.filter(it => keys.has(it.objectId) && !visibleKeys.has(it.objectId));
  showHiddenMatchNotice(hidden.length && hidden.length === keys.size ? hidden : null);
  const row = document.querySelector("#itemList .item-row.selected");
  if (!row) return;
  if (!rowOutOfView(row) || userScrolledRecently()) { row.classList.remove("flash"); void row.offsetWidth; row.classList.add("flash"); return; }
  row.scrollIntoView({ block: "center", behavior: "smooth" });
  row.classList.remove("flash");
  void row.offsetWidth; // starta om animationen
  row.classList.add("flash");
}

function showHiddenMatchNotice(hiddenItems) {
  const el = document.getElementById("hiddenMatchNotice");
  if (!el) return;
  if (!hiddenItems) { el.classList.add("hidden"); el.innerHTML = ""; return; }
  const names = hiddenItems.slice(0, 3).map(it => it.objectName || it.objectId).join(", ");
  el.innerHTML = `Det markerade objektet (${escapeHtml(names)}${hiddenItems.length > 3 ? " m.fl." : ""}) döljs av sökningen/filtret. <button type="button" id="btnShowHiddenMatch">Visa det</button>`;
  el.classList.remove("hidden");
  document.getElementById("btnShowHiddenMatch").onclick = () => {
    document.getElementById("itemSearch").value = "";
    document.getElementById("hideCompleted").checked = false;
    document.getElementById("showOnlyCompleted").checked = false;
    document.getElementById("todayOnly").checked = false;
    document.getElementById("uncoupledOnly").checked = false;
    ["filterArea", "filterActivity", "filterType", "filterContractor", "filterStatus", "filterSource"].forEach(id => [...document.getElementById(id).options].forEach(o => { o.selected = false; }));
    document.getElementById("filterWeeks").value = "";
    if (typeof renderChipSelects === "function") renderChipSelects();
    jumpToItemsInList(new Set(selectedItemKeys));
  };
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


/* ---------------------------------------------------------------------
   "Koppla till markering" - omvänd koppling för objekt importerade från
   4-veckorsplaneringen (se plan-excel-parser.js/onImportPlanExcel) som
   ännu inte har någon 3D-koppling (modelId null, "◇ Ej kopplad"-taggen i
   listan). Till skillnad från "Koppla markering" (som utgår från en 3D-
   markering och skapar/uppdaterar en post) utgår den HÄR från en redan
   vald post i listan och väntar på NÄSTA 3D-markering - Victors egen
   beskrivning: "få in aktiviteterna som de är upplagda i Excel för att
   sedan koppla dem manuellt i Trimble Connect".
   ------------------------------------------------------------------- */

/* Kopplingsläget samlar ihop objekt (Victors önskemål 2026-09-28): varje
   objekt man klickar i 3D (med eller utan Ctrl) läggs till i en lista i
   bannern, ✕ tar bort ett objekt, och inget sparas förrän man trycker
   "Spara". Hela urvalet hålls markerat i 3D så man ser vad som är valt.
   Första objektet kopplas till själva posten (om den inte redan har en
   koppling); övriga blir kopior av posten (samma namn, område, aktivitet,
   datum, framdrift, beroenden, delaktiviteter och source_key) med var sitt
   3D-objekt - samma datamodell som när man kopplar flera markerade objekt
   via "Koppla markering". Allt skrivs i EN skrivning av plan_items.json. */
let coupleCollected = [];      // [{ modelId, objectId, runtimeId, name }]
let coupleSyncingSelection = false;

/** Klick på -knappen på en rad. */
function armCoupleMode(item) {
  pendingCoupleItem = item;
  coupleCollected = [];
  renderCoupleMode();
  // Börja med en tom markering: det som var markerat innan (t.ex. objektet
  // man nyss sparade på en annan aktivitet) ska inte följa med in i listan
  // (Victors rapport 2026-10-01: "kopplar man raskt vidare hoppar och
  // buggar det" – samma redan kopplade objekt hamnade många gånger i listan).
  // Ingen spärr behövs: en tom markering ändrar ingenting i listan, och ett
  // snabbt klick direkt efteråt ska räknas.
  if (API && API.viewer) API.viewer.setSelection({ modelObjectIds: [] }, "set").catch(() => {});
}

function cancelCoupleMode() {
  if (typeof markDraw !== "undefined" && markDraw) stopMarkDraw();
  pendingCoupleItem = null;
  coupleCollected = [];
  if (typeof pendingCoupleSub !== "undefined") pendingCoupleSub = null;
  setCoupleModeBanner(null);
  if (typeof renderDrawBar === "function") renderDrawBar();
}

function setCoupleModeBanner(text) {
  const el = document.getElementById("coupleModeBanner");
  if (!el) return;
  if (!text) {
    el.classList.add("hidden");
    return;
  }
  document.getElementById("coupleModeText").innerText = text;
  el.classList.remove("hidden");
}

/** Vilken annan post ett 3D-objekt redan är kopplat till (null om inget). */
function coupledElsewhere(obj) {
  return items.find(it => it.modelId === obj.modelId && String(it.objectId) === String(obj.objectId)) || null;
}
/** Hoppas objektet över? Vid koppling till en delaktivitet får objekt som
 * redan hör till samma aktivitet vara med (delaktiviteten läggs till på dem). */
function coupleBlocked(obj) {
  const other = coupledElsewhere(obj);
  if (!other) return false;
  if (typeof pendingCoupleSub !== "undefined" && pendingCoupleSub && pendingCoupleItem && inSameActivity(pendingCoupleItem, other)) return false;
  return true;
}

function renderCoupleMode() {
  const item = pendingCoupleItem;
  if (!item) { setCoupleModeBanner(null); return; }
  const sub = typeof pendingCoupleSub !== "undefined" ? pendingCoupleSub : null;
  const name = sub ? `${sub.name}" i "${item.objectName || item.id}` : (item.objectName || item.id);
  setCoupleModeBanner(coupleCollected.length === 0
    ? `Klicka objekten i 3D-modellen som ska kopplas till ${sub ? "delaktiviteten " : ""}"${name}" (ett eller flera, Ctrl går också bra). Tryck Spara när du är klar.`
    : `Objekt som kopplas till ${sub ? "delaktiviteten " : ""}"${name}":`);
  const listEl = document.getElementById("coupleModeList");
  const usable = coupleCollected.filter(o => !coupleBlocked(o));
  listEl.innerHTML = coupleCollected.map((o, i) => {
    const other = coupledElsewhere(o);
    const blocked = coupleBlocked(o);
    const note = other
      ? (!blocked ? "hör redan till aktiviteten – delaktiviteten läggs till"
        : other.id === item.id || (other.objectName === item.objectName && other.activity === item.activity && other.area === item.area)
          ? "redan kopplad till den här aktiviteten" : `redan kopplad till "${other.objectName || other.id}" – hoppas över`)
      : "";
    return `<li class="${blocked ? "skipped" : ""}">
      <span class="couple-obj-name">${escapeHtml(o.name || o.objectId)}</span>${note ? ` <span class="hint">${escapeHtml(note)}</span>` : ""}
      <button type="button" data-couple-remove="${i}" title="Ta bort från listan">✕</button>
    </li>`;
  }).join("");
  listEl.querySelectorAll("[data-couple-remove]").forEach(btn => {
    btn.onclick = () => removeCoupleObject(Number(btn.dataset.coupleRemove));
  });
  const saveBtn = document.getElementById("btnSaveCoupleMode");
  saveBtn.disabled = usable.length === 0;
  saveBtn.innerText = `Spara (${usable.length})`;
  if (typeof renderDrawBar === "function") renderDrawBar();
}

async function removeCoupleObject(index) {
  const [o] = coupleCollected.splice(index, 1);
  renderCoupleMode();
  if (!o || o.runtimeId === undefined) return;
  try {
    coupleSyncingSelection = true;
    await API.viewer.setSelection({ modelObjectIds: [{ modelId: o.modelId, objectRuntimeIds: [o.runtimeId] }] }, "remove");
  } catch (e) {
    console.warn("Kunde inte avmarkera objektet i 3D:", e);
  } finally {
    coupleSyncingSelection = false;
  }
}

/**
 * Körs istället för syncSelectionFromModel() medan kopplingsläget är aktivt.
 * Lägger till alla nyss markerade 3D-objekt i listan (dubbletter hoppas
 * över). En tom markering (klick i tomma luften) ändrar ingenting. Om
 * markeringen i 3D inte längre omfattar hela listan (vanligt klick utan
 * Ctrl ersätter ju markeringen) markeras hela listan igen, så att allt
 * valt syns i modellen.
 */
/* Markeringshändelser hanteras EN i taget: kom flera tätt (klick, appens
   egen ommarkering) hann alla konstatera "inte i listan" innan någon lagt
   till objektet, och samma objekt hamnade i listan många gånger. Kommer en
   händelse medan en annan hanteras görs EN omkörning efteråt (den läser
   ändå den senaste markeringen). */
let coupleSelBusy = false, coupleSelAgain = false;
async function handleCoupleModeSelection() {
  if (!pendingCoupleItem || coupleSyncingSelection) return;
  if (coupleSelBusy) { coupleSelAgain = true; return; }
  coupleSelBusy = true;
  try {
    do { coupleSelAgain = false; await handleCoupleModeSelectionNow(); } while (coupleSelAgain && pendingCoupleItem);
  } finally { coupleSelBusy = false; }
}
async function handleCoupleModeSelectionNow() {
  if (!pendingCoupleItem) return;
  try {
    const sel = await API.viewer.getSelection();
    const selectedKeys = new Set();
    for (const modelSel of sel || []) {
      const rids = modelSel.objectRuntimeIds || [];
      if (rids.length === 0) continue;
      const externalIds = await API.viewer.convertToObjectIds(modelSel.modelId, rids);
      const fresh = [];
      rids.forEach((rid, i) => {
        const objectId = externalIds[i];
        if (!objectId) return;
        const key = `${modelSel.modelId}::${objectId}`;
        selectedKeys.add(key);
        if (!coupleCollected.some(o => `${o.modelId}::${o.objectId}` === key)) {
          fresh.push({ modelId: modelSel.modelId, objectId: String(objectId), runtimeId: rid, name: null });
        }
      });
      if (fresh.length === 0) continue;
      try {
        const props = await API.viewer.getObjectProperties(modelSel.modelId, fresh.map(o => o.runtimeId));
        const byRid = new Map((props || []).map(p => [p.id, p]));
        fresh.forEach(o => {
          const p = byRid.get(o.runtimeId);
          o.name = p && ((p.product && p.product.name) || p.class) || null;
        });
      } catch (e) { /* namnen är bara för visning */ }
      if (!pendingCoupleItem) return;
      // Kontrollera dubbletter igen precis innan (listan kan ha ändrats under väntan).
      coupleCollected.push(...fresh.filter(o => !coupleCollected.some(c => c.modelId === o.modelId && String(c.objectId) === String(o.objectId))));
    }
    renderCoupleMode();

    // Objekt som ändå hoppas över (kopplade till en annan aktivitet) markeras inte om.
    const keep = coupleCollected.filter(o => !coupleBlocked(o) && o.runtimeId !== undefined);
    const missing = keep.filter(o => !selectedKeys.has(`${o.modelId}::${o.objectId}`));
    if (missing.length > 0 && selectedKeys.size > 0) {
      const byModel = {};
      keep.forEach(o => { (byModel[o.modelId] = byModel[o.modelId] || []).push(o.runtimeId); });
      coupleSyncingSelection = true;
      try {
        await API.viewer.setSelection({ modelObjectIds: Object.keys(byModel).map(modelId => ({ modelId, objectRuntimeIds: byModel[modelId] })) }, "set");
      } finally {
        // Händelsen från vår egen setSelection ska inte räknas som ett nytt klick.
        setTimeout(() => { coupleSyncingSelection = false; }, 300);
      }
    }
  } catch (e) {
    console.error("Kunde inte läsa markeringen i 3D:", e);
    alert("Kunde inte läsa markeringen i 3D-modellen: " + e.message);
  }
}

/** "Spara" i kopplingsbannern. */
async function onSaveCoupleMode() {
  const item = pendingCoupleItem;
  if (!item) return;
  const objs = coupleCollected.filter(o => !coupleBlocked(o));
  if (objs.length === 0) return;
  const sub = typeof pendingCoupleSub !== "undefined" ? pendingCoupleSub : null;
  pendingCoupleItem = null;
  coupleCollected = [];
  if (sub) pendingCoupleSub = null;
  setCoupleModeBanner(null);
  if (typeof renderDrawBar === "function") renderDrawBar();
  document.getElementById("selCount").innerText = objs.length;
  if (sub) await coupleObjectsToSub(item, sub, objs);
  else await coupleItemToModelObjects(item, objs);
}

/**
 * Skriver 3D-kopplingen (model_id/object_id) för en befintlig post - och
 * skapar kopior av posten för ytterligare objekt - i en enda skrivning.
 * Matchar uttryckligen på id, INTE via saveItems()/project_id+object_id som
 * resten av appen annars använder, eftersom object_id här medvetet ÄNDRAS
 * (från den syntetiska platshållare som sattes vid import till det riktiga
 * externa 3D-objekt-ID:t). saveItems() skulle med sin project_id+object_id-
 * matchning inte hitta den befintliga raden under det NYA object_id:t och av
 * misstag skapa en dubblett med samma id.
 */
async function coupleItemToModelObjects(item, objs) {
  if (!isBackendConfigured()) {
    alert("Ingen databas ansluten. Ange GitHub-token i inställningarna.");
    return;
  }
  const base = { ...toRow(item), group_id: item.groupId || ghNewId() };
  const rows = objs.map((o, i) => (i === 0 && !item.modelId)
    ? { ...base, model_id: o.modelId, object_id: String(o.objectId) }
    : { ...base, id: ghNewId(), model_id: o.modelId, object_id: String(o.objectId) });
  // Posten själv hamnar i samma grupp som sina nya kopior.
  if (!rows.some(r => r.id === item.id)) rows.push(base);
  const ids = new Set(rows.map(r => r.id));

  rows.forEach(row => {
    const optimisticItem = { ...fromRow(row), _pending: true, _saveError: null };
    const idx = items.findIndex(it => it.id === row.id);
    if (idx >= 0) items[idx] = optimisticItem; else items.push(optimisticItem);
  });
  itemsTotalCount = items.length;
  renderItemList();

  // Kopiorna får samma delaktiviteter som posten (egen fil, egen skrivning).
  // Nya objekt får de delaktiviteter som gäller ALLA objekt i aktiviteten.
  // (Räknas på de objekt som fanns före den här kopplingen.)
  const before = [item, ...siblingsOf(item).filter(x => !ids.has(x.id))];
  const subs = groupSubActivityRows(before).filter(r => !r.members).map(({ members, ...r }) => r);
  const copies = rows.filter(r => r.id !== item.id);
  if (subs.length > 0 && copies.length > 0) {
    saveActivitiesForItemsBulk(copies.map(r => ({ planItemId: r.id, rows: subs.map(x => ({ ...x })) })))
      .catch(e => console.error("Kunde inte kopiera delaktiviteterna:", e));
  }

  try {
    await ghWriteJSON(settings.githubToken, itemsPath(), arr => {
      const byId = new Map(rows.map(r => [r.id, r]));
      const next = arr.map(r => byId.has(r.id) ? byId.get(r.id) : r);
      const existing = new Set(arr.map(r => r.id));
      rows.forEach(r => { if (!existing.has(r.id)) next.push(r); });
      return next;
    }, rows.length === 1 ? "Koppla planeringspost till 3D-objekt" : `Koppla planeringspost till ${rows.length} 3D-objekt`);
    items.forEach(it => { if (ids.has(it.id)) { it._pending = false; it._saveError = null; } });
    buildFilterOptions();
    renderItemList();
    initTimelineRange();
  } catch (e) {
    console.error("Kunde inte spara 3D-kopplingen:", e);
    items.forEach(it => { if (ids.has(it.id)) { it._pending = false; it._saveError = e.message; } });
    renderItemList();
    alert(`Kunde inte koppla "${item.objectName || item.id}" till 3D-objekten: ${e.message}`);
  }
}

async function onOpenLinkForm() {
  lastEditedItemId = null;
  newActivityMode = false;
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
let lastEditedItemId = null; // raden man redigerar - listan hoppar tillbaka dit efter Spara/Avbryt
let flashEditId = null, flashEditUntil = 0; // raden blinkar till även om listan hinner ritas om

function editItemFromList(item, opts = {}) {
  lastEditedItemId = item.id;
  newActivityMode = false;
  lastSelection = [{ modelId: item.modelId, objectId: item.objectId }];
  document.getElementById("selCount").innerText = 1;
  fillLinkForm(item);
  if (opts.single && !document.getElementById("fApplyGroupRow").classList.contains("hidden")) {
    // Redigera bara det här objektet i aktiviteten (från den utfällda listan).
    document.getElementById("fApplyGroup").checked = false;
    linkFormGroupMembers = [];
    subActivityRows = (activitiesByItemId.get(item.id) || []).map(r => ({ ...r, members: null }));
    renderSubActivities();
    recomputeAggregatesFromSubActivities();
  }
  toggle("linkForm", true);
}

/* ---------------------------------------------------------------------
   Ny aktivitet utan koppling / Duplicera (Victors önskemål 2026-09-30):
   bygg tidplanen först och koppla senare (på aktiviteten eller en
   delaktivitet, eller en manuell markering) – eller låt den vara okopplad.
   Sparas som en okopplad post (model_id null, object_id "manuell-<id>",
   origin "manuell") via samma formulär och sparflöde som "Koppla markering".
   ------------------------------------------------------------------- */
let newActivityMode = false;
function openNewActivityForm(template) {
  newActivityMode = true;
  lastEditedItemId = null;
  lastSelection = [{ modelId: null, objectId: `manuell-${ghNewId()}` }];
  document.getElementById("selCount").innerText = 0;
  fillLinkForm(null);
  if (template) {
    // Duplicera: samma uppgifter och delaktiviteter, nytt namn, nollställd framdrift.
    const family = [template, ...siblingsOf(template)];
    const span = groupSpan(family);
    const set = (id, v) => { document.getElementById(id).value = v ?? ""; };
    set("fName", `${template.objectName || template.activity || "Aktivitet"} (kopia)`);
    set("fType", template.elementType); set("fArea", template.area); set("fActivity", template.activity); set("fContractor", template.contractor);
    set("fStart", span.startDate); set("fEnd", span.endDate);
    set("fEstimatedHours", Number.isFinite(template.estimatedHours) ? template.estimatedHours : "");
    subActivityRows = groupSubActivityRows(family).map(r => ({ ...r, members: null }));
    renderSubActivities();
    recomputeAggregatesFromSubActivities();
    const note = document.getElementById("newActivityNote");
    if (note) note.innerHTML = `<b>⧉ Kopia av ${escapeHtml(template.objectName || template.activity || "aktiviteten")}</b> – ändra namn och datum och tryck Spara. Kopian är okopplad; koppla den med när du vill.`;
  }
  toggle("linkForm", true);
  const name = document.getElementById("fName");
  name.focus(); if (template) name.select();
}

/** Efter Spara/Avbryt i formuläret: tillbaka till raden man redigerade. */
function scrollBackToEditedItem() {
  const id = lastEditedItemId;
  lastEditedItemId = null;
  if (!id) return;
  const it = items.find(x => x.id === id);
  if (it) expandGroupsForKeys(new Set([it.objectId]));
  renderItemList();
  requestAnimationFrame(() => {
    const key = it && activityKeyOf(it);
    const row = document.querySelector(`#itemList .item-row[data-item-id="${CSS.escape(id)}"]`) ||
      (key && document.querySelector(`#itemList .item-row[data-activity-key="${CSS.escape(key)}"]`));
    if (!row) return;
    if (rowOutOfView(row) && !userScrolledRecently()) row.scrollIntoView({ behavior: "smooth", block: "center" });
    flashEditId = row.dataset.itemId; flashEditUntil = Date.now() + 1600;
    row.classList.remove("flash-edit"); void row.offsetWidth; row.classList.add("flash-edit");
  });
}

/* ---------------------------------------------------------------------
   En rad per aktivitet i listan (Victors rapport 2026-09-28: en aktivitet
   med fem objekt syntes som fem likadana rader). Raderna för samma
   aktivitet (siblingsOf) slås ihop till en rad med "N objekt ▸", som
   fälls ut till en rad per objekt med dess delaktiviteter och datum.
   ------------------------------------------------------------------- */
const expandedActivities = new Set(); // activityKeyOf() för utfällda aktiviteter

function activityKeyOf(it) {
  return it.groupId ? `g:${it.groupId}` : (it.sourceKey ? `s:${it.sourceKey}` : null);
}

/** Radordningen i listan: en sammanfattningsrad per aktivitet, plus objekten om den är utfälld. */
function activityListSequence(list) {
  const byKey = new Map();
  list.forEach(it => {
    const k = activityKeyOf(it);
    if (!k) return;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(it);
  });
  const seen = new Set();
  const seq = [];
  list.forEach(it => {
    const k = activityKeyOf(it);
    const members = k ? byKey.get(k) : null;
    if (!members || members.length < 2) { seq.push({ it }); return; }
    if (seen.has(k)) return;
    seen.add(k);
    const expanded = expandedActivities.has(k);
    seq.push({ it: members[0], rep: true, members, expanded });
    if (expanded) members.forEach(m => seq.push({ it: m, member: true, members }));
  });
  return seq;
}

/** Tidigaste start och senaste slut bland objekten i en aktivitet. */
function groupSpan(members) {
  const starts = members.map(m => m.startDate).filter(Boolean).sort();
  const ends = members.map(m => m.endDate).filter(Boolean).sort();
  return { ...members[0], startDate: starts[0] || null, endDate: ends[ends.length - 1] || null };
}

/** Kort besked (i stället för en felruta) när en okopplad aktivitet klickas. */
function notCoupledHint() {
  if (typeof showUndoToast === "function") showUndoToast("Aktiviteten är inte kopplad till något i 3D ännu.", false);
}

/** Klick på en hopfälld aktivitetsrad: markera alla dess objekt. */
function onActivityRowClicked(members, ev) {
  const additive = Boolean(ev && (ev.ctrlKey || ev.metaKey));
  if (!additive) selectedItemKeys = new Set();
  members.forEach(m => selectedItemKeys.add(m.objectId));
  selectionAnchorKey = members[members.length - 1].objectId;
  renderItemList();
  if (!members.some(m => m.modelId && m.objectId)) {
    if (!(typeof marksForItem === "function" && marksForItem(members[0]).length)) notCoupledHint();
    return;
  }
  selectItemsInModel(members, additive ? { mode: "add", moveCamera: false } : {})
    .then(({ missing }) => { markMissingInModel(missing); renderItemList(); })
    .catch(e => alert("Kunde inte markera aktiviteten i 3D-vyn: " + e.message));
}

/** Radera en hel aktivitet (alla dess objekt). */
async function deleteActivityFromList(members) {
  if (!isBackendConfigured()) { alert("Ingen databas ansluten."); return; }
  if (!confirm(`Radera aktiviteten "${members[0].objectName || members[0].activity || ""}" med alla ${members.length} objektkopplingar?`)) return;
  try {
    for (const m of members) await deleteItem(m);
  } catch (e) {
    alert("Kunde inte radera: " + e.message);
  }
  members.forEach(m => selectedItemKeys.delete(m.objectId));
  await refreshItems();
  buildFilterOptions();
  renderItemList();
  initTimelineRange();
}

function fillLinkForm(existing) {
  const title = document.getElementById("linkFormTitle");
  if (title) title.innerText = newActivityMode ? "Ny aktivitet"
    : existing ? `Redigera ${existing.objectName || existing.activity || "aktivitet"}`
    : `Koppla ${lastSelection.length} objekt`;
  const more = document.getElementById("formMore");
  if (more) more.open = !!(existing && (existing.contractor || (existing.dependsOn || []).length || existing.actualStartDate || existing.actualEndDate || Number.isFinite(existing.estimatedHours)));
  const dup = document.getElementById("btnDuplicateActivity");
  if (dup) dup.classList.toggle("hidden", !(existing && lastEditedItemId === existing.id));
  const note = document.getElementById("newActivityNote");
  if (note) {
    note.classList.toggle("hidden", !newActivityMode && !(existing && !existing.modelId && existing.origin === "manuell"));
    note.innerHTML = newActivityMode
      ? "<b>＋ Ny aktivitet</b> – kopplas inte till något nu. Koppla senare med på aktiviteten eller en delaktivitet, eller låt den vara okopplad."
      : "<b>Egen aktivitet</b> (skapad i appen) – påverkas inte av Excel-importen.";
  }
  document.getElementById("fName").value = existing ? existing.objectName || "" : "";
  document.getElementById("fType").value = existing ? existing.elementType || "" : "";
  document.getElementById("fArea").value = existing ? existing.area || "" : "";
  document.getElementById("fActivity").value = existing ? existing.activity || "" : "";
  document.getElementById("fContractor").value = existing ? existing.contractor || "" : "";
  document.getElementById("fStatus").value = existing ? existing.status || "planerad" : "planerad";
  document.getElementById("fStart").value = existing ? existing.startDate || "" : "";
  document.getElementById("fEnd").value = existing ? existing.endDate || "" : "";
  document.getElementById("fActualStart").value = existing ? existing.actualStartDate || "" : "";
  document.getElementById("fActualEnd").value = existing ? existing.actualEndDate || "" : "";
  document.getElementById("fTemporary").checked = !!(existing && existing.temporary === true);
  // Fäll ut "Verklig start/avslut"-sektionen automatiskt om det redan finns
  // data där (annars skulle man tro fälten var tomma när de bara är dolda),
  // annars börjar den hopfälld så formuläret känns kompakt i vanliga fallet.
  setActualDatesSectionExpanded(!!(existing && (existing.actualStartDate || existing.actualEndDate)));
  const progress = existing ? activityProgressOf(existing) : 0;
  document.getElementById("fProgress").value = progress;
  document.getElementById("fProgressLabel").innerText = progress;
  document.getElementById("fEstimatedHours").value = (existing && Number.isFinite(existing.estimatedHours)) ? existing.estimatedHours : "";
  // Delaktiviteterna sparas numera på riktigt (plan_item_activities, se
  // saveActivitiesForItem) - ladda in tidigare sparade rader för objektet om
  // det finns några, annars börja tomt precis som vid en ny koppling.
  const groupSibs = (existing && lastSelection.length === 1) ? siblingsOf(existing) : [];
  linkFormGroupMembers = groupSibs.length ? [existing, ...groupSibs] : [];
  subActivityRows = linkFormGroupMembers.length
    ? groupSubActivityRows(linkFormGroupMembers)
    : (existing && activitiesByItemId.has(existing.id))
      ? activitiesByItemId.get(existing.id).map(r => ({ ...r, members: null }))
      : [];
  if (linkFormGroupMembers.length) fetchModelObjectNames(linkFormGroupMembers).then(renderSubActivities);
  renderSubActivities();
  recomputeAggregatesFromSubActivities();

  linkFormDependsOn = (existing && Array.isArray(existing.dependsOn)) ? [...existing.dependsOn] : [];
  renderDependencyPicker(existing ? existing.id : null);

  const sibs = (existing && lastSelection.length === 1) ? siblingsOf(existing) : [];
  document.getElementById("fApplyGroupRow").classList.toggle("hidden", sibs.length === 0);
  document.getElementById("fApplyGroupCount").innerText = sibs.length + 1;
  document.getElementById("fApplyGroup").checked = true;
  document.getElementById("fApplyGroup").onchange = renderSubActivities;
  renderSubActivities();
}

/** Fäller ut/in den valfria "Verklig start/avslut"-sektionen i formuläret. */
function setActualDatesSectionExpanded(expand) {
  const fields = document.getElementById("actualDatesFields");
  const btn = document.getElementById("btnToggleActualDates");
  fields.classList.toggle("hidden", !expand);
  btn.textContent = expand ? "− Verklig start/avslut (valfritt)" : "+ Verklig start/avslut (valfritt)";
}

/* ---------------------------------------------------------------------
   Delaktiviteter i "Koppla markering": så länge minst en rad finns räknas
   Aktivitet/Startdatum/Slutdatum/Uppskattade timmar i huvudformuläret
   automatiskt fram från raderna (ihopslagna namn, tidigaste start, senaste
   slut, summerade timmar) istället för att skrivas för hand. Sparas som
   egna poster i plan_item_activities.json (se saveActivitiesForItem) OCH
   det sammanslagna resultatet hamnar i plan_items, precis som om man
   skrivit det för hand. Se Victors förfrågan 2026-09-17.
   ------------------------------------------------------------------- */
/* ---------------------------------------------------------------------
   Delaktiviteter per objekt (Victors förfrågan 2026-09-28): när en
   aktivitet är kopplad till flera 3D-objekt kan varje delaktivitet gälla
   alla objekten eller bara några av dem. Lagringen är oförändrad - varje
   objekt (rad) har sina egna delaktiviteter i plan_item_activities.json,
   och sina egna datum (tidigaste start/senaste slut bland SINA
   delaktiviteter), så 3D-färgningen, Lägesplanen och dashboarden följer
   rätt delaktivitet per objekt utan att behöva ändras. I formuläret slås
   medlemmarnas delaktiviteter ihop till en lista (samma namn + datum = samma
   delaktivitet) med vilka objekt var och en gäller.
   ------------------------------------------------------------------- */
function groupEditActive() {
  return linkFormGroupMembers.length > 1 &&
    document.getElementById("fApplyGroup").checked &&
    !document.getElementById("fApplyGroupRow").classList.contains("hidden");
}

function subActivityKey(r) {
  return `${(r.name || "").trim().toLowerCase()}|${r.start || ""}|${r.end || ""}`;
}

/** Sammanslagen lista över gruppens delaktiviteter, med vilka objekt de gäller. */
function groupSubActivityRows(members) {
  const byKey = new Map();
  members.forEach(m => (activitiesByItemId.get(m.id) || []).forEach(r => {
    const k = subActivityKey(r);
    if (!byKey.has(k)) byKey.set(k, { ...r, members: [] });
    byKey.get(k).members.push(m.id);
  }));
  const rows = [...byKey.values()].sort((a, b) => (a.start || "").localeCompare(b.start || ""));
  rows.forEach(r => { if (r.members.length === members.length) r.members = null; });
  return rows;
}

/** Namn att visa för ett objekt i en aktivitet med flera objekt. */
function memberLabel(m, members) {
  const n = members ? members.findIndex(x => x.id === m.id) + 1 : 0;
  const name = modelObjectNameCache.get(`${m.modelId}::${m.objectId}`);
  if (!m.modelId) return `${n ? `Objekt ${n}` : "Objekt"} (ej kopplat i 3D)`;
  return `${n ? `Objekt ${n}` : "Objekt"}${name ? `: ${name}` : ""}`;
}

/** Hämtar objektens namn i 3D-modellen (för att kunna skilja dem åt), cachat. */
async function fetchModelObjectNames(members) {
  const missing = members.filter(m => m.modelId && m.objectId && !modelObjectNameCache.has(`${m.modelId}::${m.objectId}`));
  if (!missing.length || !API || !API.viewer || typeof API.viewer.getObjectProperties !== "function") return;
  const byModel = {};
  missing.forEach(m => { (byModel[m.modelId] = byModel[m.modelId] || []).push(m); });
  for (const modelId of Object.keys(byModel)) {
    try {
      const group = byModel[modelId];
      const res = await convertToRuntimeIdsSafe(modelId, group.map(m => m.objectId));
      const pairs = group.map((m, i) => ({ m, rid: res[i] && res[i].runtimeId })).filter(p => p.rid !== undefined && p.rid !== null);
      if (!pairs.length) continue;
      const props = await API.viewer.getObjectProperties(modelId, pairs.map(p => p.rid));
      const byRid = new Map((props || []).map(p => [p.id, p]));
      pairs.forEach(({ m, rid }) => {
        const p = byRid.get(rid);
        const name = p && ((p.product && p.product.name) || p.class);
        modelObjectNameCache.set(`${m.modelId}::${m.objectId}`, name || "");
      });
    } catch (e) { /* namnen är bara för visning */ }
  }
}

function subActivityMembersHtml(row, i) {
  const members = linkFormGroupMembers;
  const chosen = row.members ? new Set(row.members) : null;
  const summary = chosen ? `${chosen.size} av ${members.length} objekt` : `Alla ${members.length} objekt`;
  const open = row._open;
  return `<div class="sub-activity-members" data-index="${i}">
      <button type="button" class="sub-members-toggle${chosen ? " partial" : ""}" data-action="toggle-sub-members">Gäller: ${escapeHtml(summary)} ${open ? "▾" : "▸"}</button>
      ${open ? `<div class="sub-members-panel">
        <div class="sub-members-actions">
          <button type="button" data-action="sub-members-all">Alla</button>
          <button type="button" data-action="sub-members-from-3d" title="Markera objekten i 3D-modellen (Ctrl-klick för flera) och tryck här">Använd markering i 3D</button>
          <button type="button" data-action="sub-members-show-3d" title="Markera delaktivitetens objekt i 3D-modellen">Visa i 3D</button>
        </div>
        ${members.map(m => `<label class="sub-member"><input type="checkbox" data-member-id="${escapeHtml(m.id)}"${!chosen || chosen.has(m.id) ? " checked" : ""} /> ${escapeHtml(memberLabel(m, members))}</label>`).join("")}
      </div>` : ""}
    </div>`;
}

function setSubActivityMembers(i, ids) {
  const all = linkFormGroupMembers.map(m => m.id);
  const uniq = [...new Set(ids)].filter(id => all.includes(id));
  subActivityRows[i].members = (uniq.length === 0 || uniq.length === all.length) ? null : uniq;
  if (uniq.length === 0) alert("En delaktivitet måste gälla minst ett objekt - den gäller nu alla objekt igen.");
  renderSubActivities();
  recomputeAggregatesFromSubActivities();
}

function bindSubActivityMembers(el) {
  el.querySelectorAll(".sub-activity-members").forEach(box => {
    const i = Number(box.dataset.index);
    const row = subActivityRows[i];
    box.querySelector('[data-action="toggle-sub-members"]').onclick = () => { row._open = !row._open; renderSubActivities(); };
    if (!row._open) return;
    box.querySelector('[data-action="sub-members-all"]').onclick = () => setSubActivityMembers(i, linkFormGroupMembers.map(m => m.id));
    box.querySelector('[data-action="sub-members-from-3d"]').onclick = async () => {
      try {
        const sel = await API.viewer.getSelection();
        const keys = new Set();
        for (const ms of sel || []) {
          if (!ms.objectRuntimeIds || !ms.objectRuntimeIds.length) continue;
          const ext = await API.viewer.convertToObjectIds(ms.modelId, ms.objectRuntimeIds);
          ext.forEach(x => keys.add(`${ms.modelId}::${x}`));
        }
        const ids = linkFormGroupMembers.filter(m => keys.has(`${m.modelId}::${m.objectId}`)).map(m => m.id);
        if (!ids.length) { alert("Inget av de markerade objekten i 3D hör till den här aktiviteten. Markera objekten (Ctrl-klick för flera) och försök igen."); return; }
        setSubActivityMembers(i, ids);
      } catch (e) { alert("Kunde inte läsa markeringen i 3D: " + e.message); }
    };
    box.querySelector('[data-action="sub-members-show-3d"]').onclick = () => {
      const ids = new Set(row.members || linkFormGroupMembers.map(m => m.id));
      selectItemsInModel(linkFormGroupMembers.filter(m => ids.has(m.id))).catch(e => alert("Kunde inte markera i 3D: " + e.message));
    };
    box.querySelectorAll("input[data-member-id]").forEach(cb => {
      cb.onchange = () => setSubActivityMembers(i, [...box.querySelectorAll("input[data-member-id]:checked")].map(x => x.dataset.memberId));
    });
  });
}

/** Delaktiviteterna som gäller ett visst objekt i gruppen. */
function subActivitiesForMember(rows, memberId) {
  return rows.filter(r => !r.members || r.members.includes(memberId));
}

function onAddSubActivity() {
  subActivityRows.push({ name: "", start: "", end: "", hours: "", members: null });
  renderSubActivities();
  recomputeAggregatesFromSubActivities();
}

function renderSubActivities() {
  const el = document.getElementById("subActivitiesList");
  const grouped = groupEditActive();
  el.innerHTML = subActivityRows.map((row, i) => `
    <div class="row sub-activity-row" data-index="${i}">
      <input type="text" class="sub-activity-name" style="flex:2" placeholder="Namn, t.ex. Formning" value="${escapeHtml(row.name)}" />
      <input type="date" class="sub-activity-start" style="flex:1" value="${row.start || ""}" />
      <input type="date" class="sub-activity-end" style="flex:1" value="${row.end || ""}" />
      <input type="number" class="sub-activity-hours" style="flex:0 0 4.5em" min="0" step="0.5" placeholder="tim" value="${row.hours || ""}" />
      <button type="button" class="delete-btn sub-activity-remove" title="Ta bort delaktiviteten">${icon("trash")}</button>
    </div>${grouped ? subActivityMembersHtml(row, i) : ""}`).join("");
  if (grouped) bindSubActivityMembers(el);

  el.querySelectorAll(".sub-activity-row").forEach(rowEl => {
    const i = Number(rowEl.dataset.index);
    rowEl.querySelector(".sub-activity-name").oninput = (ev) => { subActivityRows[i].name = ev.target.value; recomputeAggregatesFromSubActivities(); };
    rowEl.querySelector(".sub-activity-start").onchange = (ev) => { subActivityRows[i].start = ev.target.value; recomputeAggregatesFromSubActivities(); };
    rowEl.querySelector(".sub-activity-end").onchange = (ev) => { subActivityRows[i].end = ev.target.value; recomputeAggregatesFromSubActivities(); };
    rowEl.querySelector(".sub-activity-hours").oninput = (ev) => { subActivityRows[i].hours = ev.target.value; recomputeAggregatesFromSubActivities(); };
    rowEl.querySelector(".sub-activity-remove").onclick = () => {
      subActivityRows.splice(i, 1);
      renderSubActivities();
      recomputeAggregatesFromSubActivities();
    };
  });
}

/**
 * Räknar om Aktivitet/Startdatum/Slutdatum/Uppskattade timmar i
 * huvudformuläret utifrån delaktiviteterna, och låser (readonly) fälten så
 * länge minst en delaktivitet finns - annars skulle en efterföljande
 * manuell ändring i huvudfälten tyst skrivas över nästa gång en
 * delaktivitetsrad ändras, utan att det syns varför.
 */
function recomputeAggregatesFromSubActivities() {
  const fActivity = document.getElementById("fActivity");
  const fStart = document.getElementById("fStart");
  const fEnd = document.getElementById("fEnd");
  const fEstimatedHours = document.getElementById("fEstimatedHours");

  if (subActivityRows.length === 0) {
    fActivity.readOnly = false;
    fStart.readOnly = false;
    fEnd.readOnly = false;
    fEstimatedHours.readOnly = false;
    return;
  }

  fActivity.readOnly = true;
  fStart.readOnly = true;
  fEnd.readOnly = true;
  fEstimatedHours.readOnly = true;

  const names = subActivityRows.map(r => r.name.trim()).filter(Boolean);
  fActivity.value = names.join(" + ");

  const dates = subActivityRows.flatMap(r => [r.start, r.end]).filter(Boolean).sort();
  fStart.value = dates.length ? dates[0] : "";
  fEnd.value = dates.length ? dates[dates.length - 1] : "";

  const hoursSum = subActivityRows.reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
  fEstimatedHours.value = hoursSum > 0 ? hoursSum : "";
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
        bekräftats, och "Kunde inte spara" om den till slut misslyckas
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
    elementType: document.getElementById("fType").value.trim(),
    area: document.getElementById("fArea").value.trim(),
    activity: document.getElementById("fActivity").value.trim(),
    contractor: document.getElementById("fContractor").value.trim(),
    status: document.getElementById("fStatus").value,
    startDate: document.getElementById("fStart").value || null,
    endDate: document.getElementById("fEnd").value || null,
    actualStartDate: document.getElementById("fActualStart").value || null,
    actualEndDate: document.getElementById("fActualEnd").value || null,
    progress: Number(document.getElementById("fProgress").value) || 0,
    estimatedHours: document.getElementById("fEstimatedHours").value !== "" ? Number(document.getElementById("fEstimatedHours").value) : null,
    dependsOn: [...linkFormDependsOn],
    temporary: document.getElementById("fTemporary").checked
  };
}

/* ---------------------------------------------------------------------
   Beroenden i "Koppla markering" - Victors förfrågan 2026-09-21: "det går
   inte att säga 'gjutning av Pelare B kan inte börja förrän formning av
   Pelare A är klar'". linkFormDependsOn håller de valda plan_item-id:na;
   sökrutan filtrerar bland BEFINTLIGA sparade objekt (namn/område/
   aktivitet), och en vald post visas som ett borttagningsbart "chip" under
   sökrutan - samma UX-idé som delaktiviteterna (onAddSubActivity) fast för
   en lista av redan existerande poster istället för fritextrader.
   Cykelskydd: ett objekt kan aldrig (direkt eller indirekt) bero på sig
   själv - se dependencyWouldCreateCycle, körs både i sökresultatets filter
   (kan inte ens väljas) och en sista gång i onSaveLink som skyddsnät.
   ------------------------------------------------------------------- */

/**
 * Övriga rader för samma aktivitet (samma aktivitet kopplad till flera
 * 3D-objekt = en rad per objekt): samma group_id, eller samma source_key
 * från 4-veckorsplaneringen.
 */
function siblingsOf(it) {
  if (!it) return [];
  return items.filter(x => x.id !== it.id &&
    ((it.groupId && x.groupId === it.groupId) || (it.sourceKey && x.sourceKey === it.sourceKey)));
}

/** Bygger en Map<id, item> över samtliga inlästa objekt, för snabb uppslagning. */
function itemsById() {
  return new Map(items.map(it => [it.id, it]));
}

/**
 * Liten "väntar på: ..."-tagg i objektlistan när minst ett av objektets
 * beroenden ännu inte är klarmarkerat - gör det synligt direkt i listan
 * (inte bara i formuläret) vad som blockerar ett objekt från att starta.
 * Returnerar tom sträng om objektet inte har några ofärdiga beroenden.
 */
function dependencyStatusHtml(it) {
  if (!Array.isArray(it.dependsOn) || it.dependsOn.length === 0) return "";
  const byId = itemsById();
  const unfinished = it.dependsOn
    .map(id => byId.get(id))
    .filter(dep => dep && dep.status !== "klar");
  if (unfinished.length === 0) {
    return `<br/><span class="dependency-tag ok" title="Alla beroenden är klarmarkerade">${it.dependsOn.length} beroende${it.dependsOn.length === 1 ? "" : "n"}, alla klara</span>`;
  }
  // En rad (Victor 2026-10-06: långa texter): första namnet kortat + "+N", hela listan i tipsrutan.
  // Rött bara när en ofärdig föregångare slutar på/efter att den här ska starta – annars gult.
  const late = unfinished.some(d => it.startDate && (d.actualEndDate || d.endDate) && (d.actualEndDate || d.endDate) >= it.startDate);
  const short = t => { t = String(t || ""); return t.length > 48 ? t.slice(0, 47).trimEnd() + "…" : t; };
  const first = unfinished[0].objectName || unfinished[0].objectId;
  const all = unfinished.map(d => `• ${d.objectName || d.objectId} (${STATUS_LABELS[d.status] || d.status || ""}, slut ${d.endDate || "?"})`).join("\n");
  return `<br/><span class="dependency-tag ${late ? "blocked" : "waiting"}" title="${late ? "Risk – en föregångare slutar först när den här ska starta" : "Väntar på"}:\n${escapeHtml(all)}"><span class="dep-name">⏳ Väntar på ${escapeHtml(short(first))}</span>${unfinished.length > 1 ? `<b class="dep-more">+${unfinished.length - 1}</b>` : ""}</span>`;
}

/**
 * Sant om `candidateId` (direkt eller indirekt via kedjan av beroenden)
 * redan beror på `forItemId` - att då LÅTA forItemId bero på candidateId
 * skulle skapa en cykel (t.ex. A beror på B, B beror på A). `forItemId` kan
 * vara null för ett ännu osparat objekt (då kan ingen cykel uppstå från dess
 * sida, men vi validerar ändå att candidateId inte beror på sig själv).
 */
function dependencyWouldCreateCycle(forItemId, candidateId, byId) {
  if (!candidateId) return false;
  if (forItemId && candidateId === forItemId) return true;
  const seen = new Set();
  const stack = [candidateId];
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (!node || !Array.isArray(node.dependsOn)) continue;
    for (const depId of node.dependsOn) {
      if (forItemId && depId === forItemId) return true;
      if (!seen.has(depId)) stack.push(depId);
    }
  }
  return false;
}

function renderDependencyPicker(forItemId) {
  const chipsEl = document.getElementById("dependsOnChips");
  const searchEl = document.getElementById("fDependsOnSearch");
  const listEl = document.getElementById("fDependsOnList");
  if (!chipsEl || !searchEl || !listEl) return;

  const byId = itemsById();
  chipsEl.innerHTML = linkFormDependsOn.length === 0
    ? `<span class="hint">Inga beroenden valda.</span>`
    : linkFormDependsOn.map(id => {
        const dep = byId.get(id);
        const label = dep ? (dep.objectName || dep.objectId) : "(borttaget objekt)";
        const blocked = dep && dep.status !== "klar";
        return `<span class="dependency-chip${blocked ? " blocked" : ""}" title="${blocked ? "Inte klarmarkerad ännu" : "Klar"}">
          ${escapeHtml(label)}
          <button type="button" data-action="remove-dependency" data-dep-id="${escapeHtml(id)}" title="Ta bort beroendet">✕</button>
        </span>`;
      }).join("");

  chipsEl.querySelectorAll('[data-action="remove-dependency"]').forEach(btn => {
    btn.onclick = () => {
      linkFormDependsOn = linkFormDependsOn.filter(id => id !== btn.dataset.depId);
      renderDependencyPicker(forItemId);
    };
  });

  searchEl.oninput = () => {
    const term = searchEl.value.toLowerCase().trim();
    listEl.classList.toggle("hidden", term.length === 0);
    if (term.length === 0) { listEl.innerHTML = ""; return; }
    const matches = items.filter(it => {
      if (it.id === forItemId) return false;
      if (linkFormDependsOn.includes(it.id)) return false;
      if (dependencyWouldCreateCycle(forItemId, it.id, byId)) return false;
      const hay = `${it.objectName || ""} ${it.area || ""} ${it.activity || ""}`.toLowerCase();
      return hay.includes(term);
    }).slice(0, 20);
    listEl.innerHTML = matches.length === 0
      ? `<div class="autocomplete-item hint">Inga matchande objekt.</div>`
      : matches.map(it => `
          <div class="autocomplete-item" data-action="add-dependency" data-dep-id="${escapeHtml(it.id)}">
            ${escapeHtml(it.objectName || it.objectId)} <span class="hint">${escapeHtml([it.area, it.activity].filter(Boolean).join(" · "))}</span>
          </div>`).join("");
    listEl.querySelectorAll('[data-action="add-dependency"]').forEach(row => {
      row.onclick = () => {
        linkFormDependsOn.push(row.dataset.depId);
        searchEl.value = "";
        listEl.classList.add("hidden");
        listEl.innerHTML = "";
        renderDependencyPicker(forItemId);
      };
    });
  };
  searchEl.onblur = () => { setTimeout(() => listEl.classList.add("hidden"), 150); };
}

/* ---------------------------------------------------------------------
   Föreslå beroenden - Victors förfrågan 2026-09-21 (uppföljning till
   beroende-funktionen ovan): "kan vi göra något av AI-alternativen gratis,
   utan att behöva skapa konto någonstans?". Ingen riktig AI/språkmodell
   behövs för det här - en ren regelmotor räcker: leta upp objekt i samma
   OMRÅDE med samma NAMN (dvs. sannolikt samma fysiska plats/element,
   bara planerat i flera separata rader/aktiviteter) och föreslå ett
   beroende mellan dem om båda aktiviteterna känns igen i en vanlig
   byggordning (ACTIVITY_SEQUENCE_KEYWORDS nedan). Helt lokalt, gratis,
   inget nytt konto eller extern tjänst - bara mönstermatchning mot
   redan inskriven data.

   Medvetet konservativt: föreslår BARA par där båda aktiviteterna känns
   igen i listan (annars för många falska/oklara förslag) och där det
   ännu inte finns någon beroenderelation mellan dem. Victor granskar och
   godkänner varje förslag för hand (eller "Lägg till alla") - inget
   sparas automatiskt utan ett klick.
   ------------------------------------------------------------------- */

// Ordnad efter typisk byggordning - lägg gärna till fler synonymer vid
// behov. Ju tidigare i listan, desto lägre `rank` (= sker tidigare).
const ACTIVITY_SEQUENCE_KEYWORDS = [
  { rank: 1, keywords: ["formsättning", "formsattning", "formning", "form"] },
  { rank: 2, keywords: ["armering", "armer"] },
  { rank: 3, keywords: ["gjutning", "gjut"] },
  { rank: 4, keywords: ["formrivning", "rivning av form", "riv"] },
  { rank: 5, keywords: ["efterbehandling", "efterarbete", "justering", "lagning"] },
  { rank: 6, keywords: ["montage", "montering", "resning"] },
  { rank: 7, keywords: ["isolering"] },
  { rank: 8, keywords: ["tätskikt", "tatskikt", "ytskikt", "beläggning", "belaggning", "målning", "malning"] },
  { rank: 9, keywords: ["besiktning", "kontroll", "provning", "injustering"] }
];

/** Returnerar den kända byggordnings-"rank" för en aktivitetstext, eller null om inget kändes igen. */
function activityRank(activityText) {
  const text = (activityText || "").toLowerCase();
  if (!text) return null;
  for (const group of ACTIVITY_SEQUENCE_KEYWORDS) {
    if (group.keywords.some(kw => text.includes(kw))) return group.rank;
  }
  return null;
}

function normalizeGroupKey(str) {
  return (str || "").trim().toLowerCase();
}

/**
 * Många objekt namnges enligt mönstret "<Aktivitet> <Namn>" (t.ex.
 * "Formning Pelare A", "Gjutning Pelare A" - se test_dependencies.js) -
 * dvs. namnet på den FYSISKA platsen/elementet är detsamma, bara med
 * aktiviteten som prefix/suffix. Grupperingen nedan ska känna igen dessa
 * som SAMMA plats, annars matchar den bara identiska namn (och missar
 * praktiskt taget alla verkliga fall). Strippar bort ett exakt
 * förekommande aktivitetsnamn (om det finns i kanten av namnet) innan
 * gruppering - rör inte namnet om aktiviteten inte hittas där.
 */
function baseNameForGrouping(it) {
  let name = (it.objectName || "").trim();
  const act = (it.activity || "").trim();
  if (act) {
    const lowerName = name.toLowerCase();
    const lowerAct = act.toLowerCase();
    if (lowerName.startsWith(lowerAct)) name = name.slice(act.length);
    else if (lowerName.endsWith(lowerAct)) name = name.slice(0, name.length - act.length);
  }
  return name.replace(/^[\s\-:–—]+|[\s\-:–—]+$/g, "");
}

/**
 * Scannar `itemsList` (samma form som globala `items`) och returnerar en
 * lista med föreslagna beroenden: [{ fromId, toId, fromLabel, toLabel,
 * groupLabel }, ...]. `toId` (efterföljaren) skulle enligt förslaget bero
 * på `fromId` (föregångaren). Rena objekt utan område/namn ingår aldrig -
 * grupperingen bygger just på att flera rader delar (område, namn).
 */
function computeDependencySuggestions(itemsList) {
  const byId = buildIdIndex(itemsList);
  const groups = new Map(); // "område::basnamn" -> [items]
  itemsList.forEach(it => {
    const baseName = normalizeGroupKey(baseNameForGrouping(it));
    if (!baseName) return; // inget namn - inget att gruppera på
    const key = `${normalizeGroupKey(it.area)}::${baseName}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  });

  const suggestions = [];
  groups.forEach(groupItems => {
    if (groupItems.length < 2) return;
    const ranked = groupItems
      .map(it => ({ it, rank: activityRank(it.activity) }))
      .filter(x => x.rank !== null)
      .sort((a, b) => a.rank - b.rank);
    for (let i = 0; i < ranked.length - 1; i++) {
      const from = ranked[i].it;
      // Hoppa över andra objekt med SAMMA rank som `from` (oklar ordning
      // sinsemellan) - leta upp nästa objekt med en HÖGRE rank istället.
      let j = i + 1;
      while (j < ranked.length && ranked[j].rank === ranked[i].rank) j++;
      if (j >= ranked.length) continue;
      const to = ranked[j].it;
      if (Array.isArray(to.dependsOn) && to.dependsOn.includes(from.id)) continue; // redan kopplat
      if (dependencyWouldCreateCycle(to.id, from.id, byId)) continue;
      suggestions.push({
        fromId: from.id,
        toId: to.id,
        fromLabel: `${from.objectName || from.objectId}${from.activity ? " (" + from.activity + ")" : ""}`,
        toLabel: `${to.objectName || to.objectId}${to.activity ? " (" + to.activity + ")" : ""}`,
        groupLabel: from.area || "(inget område)"
      });
    }
  });
  return suggestions;
}

function buildIdIndex(itemsList) {
  return new Map(itemsList.map(it => [it.id, it]));
}

let dependencySuggestions = [];

function onOpenSuggestDepsDialog() {
  dependencySuggestions = computeDependencySuggestions(items);
  renderDependencySuggestions();
  toggle("suggestDepsDialog", true);
}

function renderDependencySuggestions() {
  const el = document.getElementById("suggestDepsList");
  const btnAll = document.getElementById("btnAcceptAllSuggestedDeps");
  if (!el) return;
  if (dependencySuggestions.length === 0) {
    el.innerHTML = `<p class="hint">Inga nya förslag hittades just nu - antingen är alla igenkända objekt redan kopplade, eller så saknas objekt i samma område med samma namn och igenkända aktiviteter (${ACTIVITY_SEQUENCE_KEYWORDS.map(g => g.keywords[0]).join(", ")}).</p>`;
    if (btnAll) btnAll.disabled = true;
    return;
  }
  if (btnAll) btnAll.disabled = false;
  el.innerHTML = dependencySuggestions.map((s, i) => `
    <div class="suggest-dep-row" data-index="${i}">
      <span class="suggest-dep-text">
        <span class="hint">${escapeHtml(s.groupLabel)}</span><br/>
        ${escapeHtml(s.fromLabel)} <span class="arrow">→ måste vara klar innan →</span> ${escapeHtml(s.toLabel)}
      </span>
      <span class="suggest-dep-actions">
        <button type="button" data-action="accept-suggestion" title="Lägg till beroendet">✓ Lägg till</button>
        <button type="button" data-action="dismiss-suggestion" title="Ignorera det här förslaget">✕ Ignorera</button>
      </span>
    </div>`).join("");

  el.querySelectorAll('[data-action="accept-suggestion"]').forEach(btn => {
    btn.onclick = () => {
      const i = Number(btn.closest(".suggest-dep-row").dataset.index);
      acceptDependencySuggestion(dependencySuggestions[i]);
      dependencySuggestions.splice(i, 1);
      renderDependencySuggestions();
    };
  });
  el.querySelectorAll('[data-action="dismiss-suggestion"]').forEach(btn => {
    btn.onclick = () => {
      const i = Number(btn.closest(".suggest-dep-row").dataset.index);
      dependencySuggestions.splice(i, 1);
      renderDependencySuggestions();
    };
  });
}

/** Sparar ETT föreslaget beroende, via samma optimistiska sparflöde som "Koppla markering"/"Byt namn". */
function acceptDependencySuggestion(s) {
  const toItem = items.find(it => it.id === s.toId);
  if (!toItem) return;
  const dependsOn = Array.from(new Set([...(toItem.dependsOn || []), s.fromId]));
  const record = { ...toItem, dependsOn };
  applyOptimisticRecords([record]);
  renderItemList();

  const jobId = ++saveJobCounter;
  saveJobs.set(jobId, { id: jobId, records: [record], label: toItem.objectName || toItem.objectId, status: "pending", error: null });
  runSaveJob(jobId);
}

function onAcceptAllSuggestedDeps() {
  const toSave = dependencySuggestions.slice();
  dependencySuggestions = [];
  renderDependencySuggestions();
  toSave.forEach(s => acceptDependencySuggestion(s));
}

function onSaveLink() {
  if (lastSelection.length === 0) return;
  const payload = buildLinkPayloadFromForm();
  if (newActivityMode && !payload.objectName && !payload.activity) { alert("Ge aktiviteten ett namn (eller en aktivitet) först."); return; }
  const creatingNew = newActivityMode;
  newActivityMode = false;

  // Ögonblicksbild av delaktivitetsraderna TAS HÄR (inte längre fram i en
  // bakgrundsfunktion) eftersom subActivityRows nollställs/laddas om nästa
  // gång fillLinkForm() körs - t.ex. om man hinner öppna "Koppla markering"
  // för ett annat objekt innan den här bakgrundssparningen är klar.
  const subActivitySnapshot = subActivityRows.map(r => ({ ...r, members: r.members ? [...r.members] : null }));
  const perMemberSubs = groupEditActive();

  // Samma id som en redan sparad rad (om vi redigerar en befintlig
  // koppling) återanvänds så att den optimistiska raden och den faktiska
  // bakgrundsskrivningen syftar på exakt samma post - annars skulle
  // toRow() annars generera TVÅ olika nya id:n (ett här, ett till inne i
  // saveItems()) för samma nya objekt.
  const targets = lastSelection.map(s => ({ ...s, existing: items.find(it => it.modelId === s.modelId && it.objectId === s.objectId) || null }));
  // Redigering av en rad vars aktivitet har fler objekt: uppdatera alla.
  if (targets.length === 1 && targets[0].existing && document.getElementById("fApplyGroup").checked &&
      !document.getElementById("fApplyGroupRow").classList.contains("hidden")) {
    siblingsOf(targets[0].existing).forEach(sib => targets.push({ modelId: sib.modelId, objectId: sib.objectId, existing: sib }));
  }
  // Flera objekt i samma sparning = en aktivitet: gemensamt group_id.
  const groupId = targets.length > 1
    ? ((targets.find(t => t.existing && t.existing.groupId) || {}).existing || {}).groupId || ghNewId()
    : (targets[0].existing ? targets[0].existing.groupId : null);
  const records = targets.map(t => ({
    id: t.existing ? t.existing.id : ghNewId(), projectId, modelId: t.modelId, objectId: t.objectId,
    ...payload,
    // Behåll kopplingen till 4-veckorsplaneringen vid redigering.
    sourceKey: t.existing ? t.existing.sourceKey : null,
    origin: t.existing ? t.existing.origin || null : (creatingNew ? "manuell" : null),
    groupId: groupId || null
  }));
  if (creatingNew) lastEditedItemId = records[0].id;

  // Skyddsnät (utöver filtreringen i renderDependencyPicker): om flera
  // objekt kopplas samtidigt och samma beroendelista appliceras på alla,
  // kan ett av dem råka få sig SJÄLV som beroende (dess eget nya id fanns
  // förstås inte i listan när man valde beroenden). Plockas bort per post
  // istället för att blockera hela sparningen.
  const recordIds = new Set(records.map(r => r.id));
  records.forEach(rec => {
    if (Array.isArray(rec.dependsOn) && rec.dependsOn.includes(rec.id)) {
      rec.dependsOn = rec.dependsOn.filter(id => id !== rec.id);
    }
  });
  // Delaktiviteter per objekt: varje objekt får datum (och timmar) från SINA
  // delaktiviteter. Objekt utan egna delaktiviteter följer hela aktiviteten.
  const subsByRecord = new Map(records.map(rec => [rec.id,
    (perMemberSubs ? subActivitiesForMember(subActivitySnapshot, rec.id) : subActivitySnapshot).map(({ members, _open, ...r }) => r)]));
  if (perMemberSubs) {
    records.forEach(rec => {
      const own = subsByRecord.get(rec.id);
      const dates = own.flatMap(r => [r.start, r.end]).filter(Boolean).sort();
      if (!own.length || !dates.length) return;
      rec.startDate = dates[0];
      rec.endDate = dates[dates.length - 1];
      const hours = own.reduce((sum, r) => sum + (Number(r.hours) || 0), 0);
      rec.estimatedHours = hours > 0 ? hours : rec.estimatedHours;
    });
  }

  applyOptimisticRecords(records);
  toggle("linkForm", false);
  buildFilterOptions();
  renderItemList();
  initTimelineRange();
  scrollBackToEditedItem();

  const jobId = ++saveJobCounter;
  const label = records.length === 1 ? (records[0].objectName || records[0].objectId) : `${records.length} objekt`;
  saveJobs.set(jobId, { id: jobId, records, label, status: "pending", error: null });
  runSaveJob(jobId);

  // Delaktiviteterna sparas i en egen fil (plan_item_activities.json) och
  // körs parallellt med huvudsparningen ovan istället för att blockera den -
  // de är en valfri "extra", så ett fel här ska inte hindra själva
  // objektkopplingen från att sparas. Varje markerat objekt (vid koppling av
  // flera samtidigt) får samma uppsättning delaktiviteter, precis som de
  // redan delar Aktivitet/Start/Slut i formuläret. Skrivs bara om det finns
  // något att spara ELLER om objektet hade delaktiviteter sedan tidigare som
  // nu ska rensas bort (alla rader borttagna i formuläret och sparat).
  // EN skrivning för alla objektens delaktiviteter (inte en per objekt).
  const batches = records
    .filter(rec => subsByRecord.get(rec.id).length > 0 || (activitiesByItemId.get(rec.id) || []).length > 0)
    .map(rec => ({ planItemId: rec.id, rows: subsByRecord.get(rec.id) }));
  if (batches.length) {
    saveActivitiesForItemsBulk(batches, "Spara delaktiviteter").catch(e => {
      console.error("Kunde inte spara delaktiviteter:", e);
      alert(`Kunde inte spara delaktiviteterna: ${e.message}`);
    });
  }
}

/* Framdrift hör till huvudaktiviteten (Victors önskemål 2026-09-30): oavsett
   vilka delaktiviteter ett objekt är kopplat till har alla objekt i samma
   aktivitet samma framdrift, status och verkliga start/avslut. Ändras något
   av dem på ett objekt följer resten av aktiviteten med. Datumen (start/slut)
   är däremot fortfarande per objekt, så 3D-färgerna följer delaktiviteterna. */
const ACTIVITY_WIDE_FIELDS = ["progress", "status", "actualStartDate", "actualEndDate", "temporary"];
function spreadActivityWideFields(records) {
  const inBatch = new Map(records.map(r => [r.id, r]));
  const extra = new Map();
  records.slice().forEach(rec => {
    const old = items.find(it => it.id === rec.id);
    if (!old) return;
    const changed = ACTIVITY_WIDE_FIELDS.filter(f => f in rec && (rec[f] ?? null) !== (old[f] ?? null));
    if (!changed.length) return;
    siblingsOf({ ...old, groupId: rec.groupId ?? old.groupId, sourceKey: rec.sourceKey ?? old.sourceKey }).forEach(sib => {
      if (inBatch.has(sib.id)) return;
      const cur = extra.get(sib.id) || { ...sib };
      changed.forEach(f => { cur[f] = rec[f]; });
      if (ACTIVITY_WIDE_FIELDS.some(f => (cur[f] ?? null) !== (sib[f] ?? null))) extra.set(sib.id, cur);
    });
  });
  extra.forEach(r => { delete r._pending; delete r._saveError; delete r._notInModel; records.push(r); });
  return records;
}
/** Huvudaktivitetens framdrift: den okopplade huvudposten om den finns, annars högsta värdet i aktiviteten (för äldre data där objekten skiljer sig åt). */
function activityProgressOf(it) {
  const fam = [it, ...siblingsOf(it)];
  const head = fam.find(m => !m.modelId);
  const val = m => Number.isFinite(m.progress) ? m.progress : 0;
  return head ? val(head) : Math.max(...fam.map(val));
}

/* Raden under aktivitetsnamnet: område · aktivitet. Har aktiviteten
   delaktiviteter (t.ex. importerad "Grovbetong + Bergförankring + …") syns
   de redan under "N delaktiviteter", så då visas bara området – hela
   texten finns kvar som tooltip och i sökningen. */
function activitySubLineHtml(entry) {
  const it = entry.it;
  const hasSubs = typeof subsForEntry === "function" && subsForEntry(entry).length > 0;
  // Aktiviteten står ofta redan sist i området (Powerproject: "PRODUKTION / 742A Krönlinje J" ·
  // "742A Krönlinje J") – då visas den inte två gånger.
  const dup = it.activity && it.area && String(it.area).trim().toLowerCase().endsWith(String(it.activity).trim().toLowerCase());
  const full = dup ? (it.area || "–") : `${it.area || "–"} · ${it.activity || "–"}`;
  // Blockelement (klippt till två rader) – ingen extra <br/> efter, annars blir det en tomrad.
  if (hasSubs) return `<span class="item-sub" title="${escapeHtml(full)}">${escapeHtml(it.area || "–")}</span><br/>`;
  return `<span class="item-sub item-sub-clamp" title="${escapeHtml(full)}">${escapeHtml(full)}</span>`;
}

/** Lägger till/uppdaterar de sparade raderna lokalt direkt (innan bakgrundsskrivningen ens startat), märkta som "Sparar...". Framdrift/status sprids till hela aktiviteten (records utökas på plats). */
function applyOptimisticRecords(records) {
  spreadActivityWideFields(records);
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
        Kunde inte spara <strong>${escapeHtml(job.label)}</strong>: ${escapeHtml(job.error || "")}
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

/* på en grupprubrik: Byt namn-dialogen med fältet och det gamla värdet ifyllda. */
function openRenameFor(field, oldValue) {
  onOpenRenameDialog();
  document.getElementById("renameField").value = field;
  populateRenameOldValues();
  document.getElementById("renameOldValue").value = oldValue;
  updateRenameCount();
  const nv = document.getElementById("renameNewValue");
  nv.value = oldValue;
  nv.focus(); nv.select();
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
    actualStartDate: it.actualStartDate,
    actualEndDate: it.actualEndDate,
    progress: it.progress,
    estimatedHours: it.estimatedHours,
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
   Redigera markerade – ändra status/område/aktivitet/entreprenör och/eller
   förskjut start-/slutdatum med N dagar på alla just nu markerade rader
   (selectedItemKeys) i "Planerade objekt", i ett svep. Kompletterar
   "Radera markerade" (som bara kan ta bort) - se Victors förfrågan
   2026-09-17 om att kunna redigera flera markerade rader samtidigt, t.ex.
   flytta nästa veckas objekt en vecka framåt. Återanvänder samma
   optimistiska sparflöde (applyOptimisticRecords/saveJobs/runSaveJob) som
   "Byt namn" ovan.
   ------------------------------------------------------------------- */
function onOpenBulkEditDialog() {
  if (selectedItemKeys.size === 0) {
    alert("Inga rader är markerade. Håll in Ctrl (Cmd på Mac) eller Shift och klicka på flera rader i listan för att markera dem.");
    return;
  }
  document.getElementById("bulkEditStatus").value = "";
  document.getElementById("bulkEditArea").value = "";
  document.getElementById("bulkEditActivity").value = "";
  document.getElementById("bulkEditContractor").value = "";
  document.getElementById("bulkEditShiftDays").value = "";
  document.getElementById("bulkEditMsg").innerText = "";
  document.getElementById("bulkEditCount").innerText = selectedItemKeys.size;
  toggle("bulkEditDialog", true);
}

/** Lägger till/drar ifrån ett antal dagar från ett ÅÅÅÅ-MM-DD-datum. Rör inte tomma datum. */
function shiftDateBy(dateStr, days) {
  if (!dateStr || !days) return dateStr;
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function onDoBulkEdit() {
  const selectedItems = items.filter(it => selectedItemKeys.has(it.objectId));
  const statusEl = document.getElementById("bulkEditMsg");
  if (selectedItems.length === 0) {
    statusEl.innerText = "Inga markerade rader kvar - stäng och markera på nytt.";
    return;
  }

  const newStatus = document.getElementById("bulkEditStatus").value;
  const newArea = document.getElementById("bulkEditArea").value.trim();
  const newActivity = document.getElementById("bulkEditActivity").value.trim();
  const newContractor = document.getElementById("bulkEditContractor").value.trim();
  const shiftDaysRaw = document.getElementById("bulkEditShiftDays").value.trim();
  const shiftDays = shiftDaysRaw ? Number(shiftDaysRaw) : 0;

  if (shiftDaysRaw && !Number.isFinite(shiftDays)) {
    statusEl.innerText = "Ogiltigt antal dagar.";
    return;
  }
  if (!newStatus && !newArea && !newActivity && !newContractor && !shiftDays) {
    statusEl.innerText = "Inget att ändra - fyll i minst ett fält.";
    return;
  }

  const summary = [];
  if (newStatus) summary.push(`status → "${STATUS_LABELS[newStatus] || newStatus}"`);
  if (newArea) summary.push(`område → "${newArea}"`);
  if (newActivity) summary.push(`aktivitet → "${newActivity}"`);
  if (newContractor) summary.push(`entreprenör → "${newContractor}"`);
  if (shiftDays) summary.push(`datum flyttas ${shiftDays > 0 ? "+" : ""}${shiftDays} dagar`);

  if (!confirm(`Ändra ${summary.join(", ")} på ${selectedItems.length} markerade objekt?`)) return;

  // Samma mönster som "Byt namn" (onDoRename): bygg fullständiga poster med
  // bara de ifyllda fälten ändrade - saveItems() upsertar hela raden per
  // id, så ofyllda fält måste skickas med oförändrade, annars skulle de
  // nollställas.
  const records = selectedItems.map(it => ({
    ...it, // beroenden, grupp, källnyckel m.m. följer med oförändrade
    id: it.id,
    projectId: it.projectId,
    modelId: it.modelId,
    objectId: it.objectId,
    objectName: it.objectName,
    area: newArea || it.area,
    activity: newActivity || it.activity,
    contractor: newContractor || it.contractor,
    status: newStatus || it.status,
    startDate: shiftDateBy(it.startDate, shiftDays),
    endDate: shiftDateBy(it.endDate, shiftDays),
    actualStartDate: it.actualStartDate,
    actualEndDate: it.actualEndDate,
    progress: it.progress,
    estimatedHours: it.estimatedHours
  }));

  applyOptimisticRecords(records);
  toggle("bulkEditDialog", false);
  buildFilterOptions();
  renderItemList();
  initTimelineRange();

  const jobId = ++saveJobCounter;
  const label = `Redigera markerade (${records.length} objekt)`;
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

/**
 * Tidslinjens FAKTISKA intervall: Victors eget Från/Till
 * (settings.timelineRangeStart/End, satt via "Anpassat intervall på
 * slidern") om han satt något, annars det automatiskt uträknade
 * (getTimelineStart/getTimelineEnd). Se Victors förfrågan 2026-09-17 (kunna
 * ställa in egna intervallet på tidslinjen, "ställa start och slutdatum på
 * slidern").
 */
function getEffectiveTimelineStart() {
  return settings.timelineRangeStart || getTimelineStart();
}
function getEffectiveTimelineEnd() {
  return settings.timelineRangeEnd || getTimelineEnd();
}

function initTimelineRange() {
  const dateInput = document.getElementById("timelineDate");
  const today = new Date().toISOString().slice(0, 10);
  const startDates = items.map(it => it.startDate).filter(Boolean).sort();
  const defaultDate = startDates.length ? startDates[0] : today;

  // Intervallet (start/end) går alltid minst TIMELINE_MIN_START–TIMELINE_MIN_END,
  // oavsett vad som faktiskt är inplanerat – men kapas aldrig om projektet
  // sträcker sig längre åt något håll än så. Om Victor satt ett eget
  // intervall används det istället (getEffectiveTimelineStart/End).
  const start = getEffectiveTimelineStart();
  const end = getEffectiveTimelineEnd();

  if (!dateInput.value) dateInput.value = defaultDate;
  // Klipp in aktuellt valt datum i intervallet - annars kan sliderns värde
  // hamna utanför min/max, t.ex. om Victor precis snävat in ett eget
  // intervall som inte täcker det datum som var valt sedan innan.
  if (dateInput.value < start) dateInput.value = start;
  if (dateInput.value > end) dateInput.value = end;
  dateInput.min = start;
  dateInput.max = end;

  const slider = document.getElementById("timelineSlider");
  slider.min = 0;
  slider.max = daysBetween(start, end);
  slider.value = Math.max(0, daysBetween(start, dateInput.value));

  // Speglar Victors eget intervall (om satt) i "Anpassat intervall"-fälten,
  // annars visas det automatiskt uträknade intervallet som platshållartext.
  const rangeStartInput = document.getElementById("timelineRangeStart");
  const rangeEndInput = document.getElementById("timelineRangeEnd");
  if (rangeStartInput && rangeEndInput) {
    rangeStartInput.value = settings.timelineRangeStart || "";
    rangeEndInput.value = settings.timelineRangeEnd || "";
    rangeStartInput.placeholder = getTimelineStart();
    rangeEndInput.placeholder = getTimelineEnd();
  }

  applyTimelineColors();
}

/** Sparar Victors eget Från/Till för tidslinjens slider och bygger om den utifrån det. */
function onApplyTimelineRange() {
  const statusEl = document.getElementById("timelineRangeStatus");
  const startVal = document.getElementById("timelineRangeStart").value;
  const endVal = document.getElementById("timelineRangeEnd").value;

  if (!startVal || !endVal) {
    statusEl.innerText = "Ange både Från och Till.";
    return;
  }
  if (startVal >= endVal) {
    statusEl.innerText = "Från måste vara tidigare än Till.";
    return;
  }

  settings.timelineRangeStart = startVal;
  settings.timelineRangeEnd = endVal;
  try { window.localStorage.setItem("4dplan-settings", JSON.stringify(settings)); } catch (e) { /* ignorera */ }
  statusEl.innerText = `Slidern täcker nu ${startVal} – ${endVal}.`;
  initTimelineRange();
}

/** Återställer tidslinjens slider till det automatiskt uträknade intervallet. */
function onResetTimelineRange() {
  settings.timelineRangeStart = null;
  settings.timelineRangeEnd = null;
  try { window.localStorage.setItem("4dplan-settings", JSON.stringify(settings)); } catch (e) { /* ignorera */ }
  document.getElementById("timelineRangeStatus").innerText = "Återställt till automatiskt intervall.";
  initTimelineRange();
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
  // initTimelineRange räknar fram som intervallets start (auto ELLER
  // Victors eget "Anpassat intervall").
  return getEffectiveTimelineStart();
}

function onTogglePlay() {
  const btn = document.getElementById("btnPlay");
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
    btn.innerText = "▶";
    return;
  }
  btn.innerHTML = icon("pause");
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
 * Räknar ut vilken "fas" (och därmed färg) ett objekt ska visas med vid ett
 * givet datum - antingen tidslinjens valda datum (för 3D-färgsättningen,
 * se applyTimelineColors) eller dagens datum (för listans avvikelseetikett,
 * se renderItemList). Väger in både planerat slutdatum OCH verkligt avslut,
 * istället för att som tidigare bara jämföra dagens/valt datum mot planerat
 * slutdatum - annars visades avklarade objekt som "försenade" bara för att
 * kalendern hunnit förbi slutdatumet (se konversationen med Victor
 * 2026-09-16 om hur framdriften borde visualiseras).
 *
 * Möjliga returvärden (nycklar i DEFAULT_STATUS_COLORS/settings.statusColors):
 *   "planerad"      - planerad men ej startad (datumet är före startdatum)
 *   "pagaende"      - påbörjat, inte klart
 *   "forsenad"      - inte klart och planerat slutdatum har redan passerat
 *   "klar"          - klart
 *   "pausad"        - satt till pausad (och inte klar)
 * Returnerar null om objektet saknar startdatum (kan då inte fasberäknas -
 * hoppas över, precis som innan).
 */
function computeItemPhase(item, atDateStr, warningDays) {
  if (!item.startDate) return null;
  const at = new Date(atDateStr);
  const start = new Date(item.startDate);
  const plannedEnd = item.endDate ? new Date(item.endDate) : null;

  // Verkligt avslut: det Victor faktiskt matat in om det finns, annars (för
  // objekt som klarmarkerats innan det här fältet infördes) planerat
  // slutdatum eller startdatum som en rimlig uppskattning - så gammal data
  // inte plötsligt ser "inte klar" ut bara för att fältet är tomt.
  let actualEnd = item.actualEndDate ? new Date(item.actualEndDate) : null;
  if (!actualEnd && (item.status === "klar" || (Number(item.progress) || 0) >= 100)) {
    actualEnd = plannedEnd || start;
  }
  // Klar kan inte ha avslutats i framtiden (Victors rapport 2026-10-01, F28:
  // klar 100 % men slutdatum 17/10 i Excel blev gul i 3D till dess). Ligger
  // avslutet efter i dag räknas det som i dag.
  if (actualEnd && (item.status === "klar" || (Number(item.progress) || 0) >= 100)) {
    const today = new Date(new Date().toISOString().slice(0, 10));
    if (actualEnd > today) actualEnd = today;
  }

  // Klar går före "ej påbörjad" (kan bli klar före planerad start).
  const isDoneAtDate = actualEnd && actualEnd <= at;
  if (isDoneAtDate) {
    return "klar"; // "Klar, men försenad" borttagen (Victor 2026-10-02)
  }
  if (item.status === "pausad") return "pausad";

  // Påbörjad före planerad start (Victors rapport 2026-10-01, H30: 17 % men
  // grå "ej påbörjad" eftersom planerad start var 11/10): framdrift över 0 %
  // betyder att arbetet är igång – senast i dag, även om verklig start saknas
  // eller ligger i framtiden.
  // Victor 2026-10-02: bara framdrift (minst 1 %) gör en aktivitet pågående.
  // Har startdatumet passerat utan framdrift är den försenad.
  const hasProgress = (Number(item.progress) || 0) >= 1;
  let actualStart = hasProgress && item.actualStartDate ? new Date(item.actualStartDate) : null;
  if (hasProgress) {
    const today = new Date(new Date().toISOString().slice(0, 10));
    if (!actualStart || actualStart > today) actualStart = actualStart && actualStart < today ? actualStart : (start < today ? start : today);
  }
  const startedAtDate = actualStart && actualStart <= at;
  if (at < start && !startedAtDate) return "planerad";

  if (plannedEnd && at > plannedEnd) return "forsenad";
  if (!startedAtDate) return "forsenad";
  return "pagaende";
}

/**
 * Går igenom alla planerade objekt, räknar ut varje objekts fas vid det
 * valda tidslinjedatumet och sätter respektive färg i 3D-modellen via
 * viewer.setObjectState. Färgerna hämtas från settings.statusColors -
 * samma färger som badgen i listan använder, se computeItemPhase().
 */
async function applyTimelineColors() {
  const selectedDate = document.getElementById("timelineDate").value;
  if (!selectedDate || items.length === 0) return;

  const warningDays = settings.warningDaysBeforeEnd || 0;
  const byModel = {}; // modelId -> { planerad:[], pagaende:[], forsenad:[], klar:[], pausad:[] }

  // Temporära objekt (t.ex. en mobilkran) utanför sin tid får en egen grupp: dolda eller svaga.
  const empty = () => ({ planerad: [], pagaende: [], forsenad: [], klar: [], pausad: [], tempoff: [] });
  for (const it of items) {
    const phase = computeItemPhase(it, selectedDate, warningDays);
    if (!phase) continue;
    byModel[it.modelId] = byModel[it.modelId] || empty();
    byModel[it.modelId][isTempOffAt(it, selectedDate) ? "tempoff" : phase].push(it.objectId);
  }

  const colors = { ...DEFAULT_STATUS_COLORS, ...(settings.statusColors || {}) };
  const opacities = { ...DEFAULT_PHASE_OPACITIES, ...(settings.statusOpacities || {}) };
  colors.tempoff = colors.planerad; opacities.tempoff = tempOffOpacity();
  for (const modelId of Object.keys(byModel)) {
    if (modelId === "null" || modelId === "undefined") continue; // ej kopplade (t.ex. bara manuell markering)
    const group = byModel[modelId];
    for (const phase of Object.keys(group)) {
      await colorGroup(modelId, group[phase], colors[phase], opacities[phase]);
    }
  }
  if (typeof renderManualMarks === "function") renderManualMarks();
}

/* Temporär (t.ex. mobilkran, stämp): finns bara från startdatum till och med slutdatum. Slutet är det
   verkliga avslutet om det finns (kranen åkte tidigare/senare), annars planerat slut. */
function isTempOffAt(it, dateStr) {
  if (!it || it.temporary !== true || !dateStr) return false;
  const end = it.actualEndDate || it.endDate;
  return !!((it.startDate && dateStr < it.startDate) || (end && dateStr > end));
}
/* Opaciteten för temporära objekt utanför sin tid (Inställningar): 0 = dolda. */
function tempOffOpacity() { const v = Number(settings.tempOffOpacity); return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; }

/**
 * Färgsätter en grupp objekt i en modell. Använder convertToRuntimeIdsSafe
 * (istället för att anropa convertToObjectRuntimeIds direkt) så att ett
 * enda objekt som saknas i den just nu inlästa modellversionen inte gör att
 * HELA gruppens färgsättning hoppas över - samma bugg som tidigare löstes
 * för markering i 3D-vyn (se selectItemsInModel).
 */
async function colorGroup(modelId, externalIds, colorHex, opacity) {
  if (externalIds.length === 0 || !colorHex) return;
  const results = await convertToRuntimeIdsSafe(modelId, externalIds);
  const valid = results.map(r => r.runtimeId).filter(id => id !== undefined && id !== null);
  if (valid.length === 0) return;
  await API.viewer.setObjectState(
    { modelObjectIds: [{ modelId, objectRuntimeIds: valid }] },
    { color: hexToRgba(colorHex, opacity === undefined ? 1 : opacity) }
  );
}

/**
 * Kort etikett för avvikelsen mellan planerat och verkligt/aktuellt datum,
 * visad i "Planerade objekt"-listan bredvid statusbadgen. Beräknas mot
 * DAGENS datum (inte tidslinjens valda datum) - listan ska alltid visa
 * "läget nu", oavsett var man råkar ha dragit tidslinjeslidern.
 */
function computeDeviationLabel(item, phase, todayStr) {
  const today = new Date(todayStr);
  const plannedEnd = item.endDate ? new Date(item.endDate) : null;

  if (phase === "klar") {
    if (item.actualEndDate && plannedEnd) {
      const diff = Math.round((new Date(item.actualEndDate) - plannedEnd) / 86400000);
      if (diff < 0) return `Klar, ${Math.abs(diff)} dagar tidigt`;
      if (diff > 0) return `Klar, ${diff} dagar sent`;
    }
    return "Klar i tid";
  }
  if (phase === "forsenad" && plannedEnd) {
    const diff = Math.round((today - plannedEnd) / 86400000);
    return `${diff} dagar försenad`;
  }
  return null;
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
let formOptions = { area: [], activity: [], contractor: [], elementType: [] };

function buildFilterOptions() {
  formOptions.area = unique(items.map(i => i.area));
  formOptions.elementType = unique(items.map(i => i.elementType));
  formOptions.activity = unique(items.map(i => i.activity));
  formOptions.contractor = unique(items.map(i => i.contractor));

  fillMultiSelect("filterArea", formOptions.area);
  fillMultiSelect("filterActivity", formOptions.activity);
  fillMultiSelect("filterType", formOptions.elementType);
  fillMultiSelect("filterContractor", formOptions.contractor);
  fillSourceFilter();

  // Status är en fast lista i appen, så den fylls alltid i - oavsett
  // vilka statusar som redan finns bland sparade objekt.
  const statusEl = document.getElementById("filterStatus");
  const keepStatus = new Set(getSelectedValues("filterStatus"));
  statusEl.innerHTML = Object.entries(STATUS_LABELS)
    .map(([value, label]) => `<option value="${value}"${keepStatus.has(value) ? " selected" : ""}>${label}</option>`).join("");
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

/* Källa (Victors önskemål 2026-10-02): var aktiviteten kommer ifrån.
   - "plan": importerad från 4-veckorsplaneringen (har importnyckel)
   - "excel": importerad med den enkla Excel-importen (märks från och med nu)
   - "tc": skapad i Trimble Connect – "＋ Ny aktivitet", "Duplicera" eller
     "Koppla markering". (Rader från den enkla Excel-importen före 2026-10-02
     är inte märkta och räknas hit.) */
const SOURCE_LABELS = { tc: "Skapade i TC", plan: "Från 4-veckorsplaneringen", excel: "Från Excel-import" };
function itemSourceOf(it) { return it.sourceKey ? "plan" : it.origin === "excel" ? "excel" : "tc"; }
function fillSourceFilter() {
  const el = document.getElementById("filterSource");
  if (!el) return;
  const keep = new Set(getSelectedValues("filterSource"));
  const n = {}; items.forEach(it => { const k = itemSourceOf(it); n[k] = (n[k] || 0) + 1; });
  const gone = lastPlanImport ? items.filter(isGoneFromLastImport).length : 0;
  el.innerHTML = Object.entries(SOURCE_LABELS).map(([k, l]) => `<option value="${k}"${keep.has(k) ? " selected" : ""}>${escapeHtml(l)}${n[k] ? ` (${n[k]})` : ""}</option>`).join("")
    // Bara när det finns en importlogg (från och med nästa 4-veckorsimport).
    + (lastPlanImport ? `<option value="gone"${keep.has("gone") ? " selected" : ""}>Inte kvar i senaste importen (${gone})</option>` : "");
}
function fillMultiSelect(id, values) {
  const el = document.getElementById(id);
  // Behåll valda filter när listan byggs om (t.ex. efter en sparning).
  const keep = new Set(getSelectedValues(id));
  el.innerHTML = values.map(v => `<option value="${escapeHtml(v)}"${keep.has(v) ? " selected" : ""}>${escapeHtml(v)}</option>`).join("");
}

function getSelectedValues(id) {
  return Array.from(document.getElementById(id).selectedOptions).map(o => o.value);
}

async function applyFilterToModel() {
  const statusEl = document.getElementById("filterMsg");
  statusEl.innerText = "Filtrerar...";

  // Samma urval som listan visar (sökning och alla filter).
  let matched = getVisibleItems();

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
  const types = getSelectedValues("filterType");
  const sources = getSelectedValues("filterSource");

  if (!areas.length && !activities.length && !contractors.length && !statuses.length && !types.length && !sources.length) return;

  const matched = items.filter(it => {
    if (areas.length && !areas.includes(it.area)) return false;
    if (activities.length && !activities.includes(it.activity)) return false;
    if (contractors.length && !contractors.includes(it.contractor)) return false;
    if (statuses.length && !statuses.includes(it.status)) return false;
    if (sources.length && !sources.some(s => matchesSource(it, s))) return false;
    if (types.length && !types.includes(it.elementType)) return false;
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
  ["filterArea", "filterActivity", "filterType", "filterContractor", "filterStatus", "filterSource"].forEach(id => {
    Array.from(document.getElementById(id).options).forEach(o => o.selected = false);
  });
  document.getElementById("filterWeeks").value = "";
  ["hideCompleted", "showOnlyCompleted", "todayOnly", "uncoupledOnly"].forEach(id => { document.getElementById(id).checked = false; });
  document.getElementById("filterMsg").innerText = "";
  renderItemList();
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
    endDate: excelDateToIso(r["Slutdatum"] || r["EndDate"]),
    actualStartDate: excelDateToIso(r["Verklig start"] || r["ActualStartDate"]),
    actualEndDate: excelDateToIso(r["Verkligt avslut"] || r["ActualEndDate"]),
    origin: "excel", // källfiltret: importerad, inte skapad i TC
    estimatedHours: (() => {
      const v = r["Uppskattade timmar"] ?? r["EstimatedHours"];
      const n = Number(v);
      return v !== undefined && v !== "" && Number.isFinite(n) ? n : null;
    })()
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
    "Slutdatum": it.endDate || "",
    "Verklig start": it.actualStartDate || "",
    "Verkligt avslut": it.actualEndDate || "",
    "Uppskattade timmar": Number.isFinite(it.estimatedHours) ? it.estimatedHours : ""
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
    "ej planerad": "planerad", "ej_planerad": "planerad", "planerad men ej startad": "planerad",
    "planerad": "planerad", "pågående": "pagaende", "försenad": "forsenad", "klar": "klar", "pausad": "pausad"
  };
  return map[String(value || "").toLowerCase()] || "planerad";
}

/* ---------------------------------------------------------------------
   Import av 4-veckorsplaneringen (Victors befintliga, detaljerade Excel-
   planering - se plan-excel-parser.js för själva tolkningen av flikarnas
   struktur). Skild från den generiska Excel-importen ovan (onImportExcel),
   som förväntar sig en enkel tabell med en ObjektID-kolumn - den här filen
   har ingen sådan kolumn alls, utan en helt annan, hierarkisk struktur
   (en flik per WBS-område, rubriker, elementkoder med faser).

   Elementkoder (t.ex. "M30") blir ETT plan_item Victor kopplar en gång i
   3D-vyn, med faserna som delaktiviteter under det (plan_item_activities) -
   se Victors beslut 2026-09-22 ("Elementet, faser som delaktiviteter").
   Nya, okopplade objekt får en SYNTETISK object_id (t.ex. "excel-<uuid>")
   och model_id=null tills de kopplas manuellt via "Koppla till markering"
   (se armCoupleMode ovan) - det håller dem kompatibla med resten av appens
   objectId-baserade nycklar (markering, gruppering, sökning m.m.) utan att
   kräva någon större omskrivning där.

   Reimport: varje objekt får en radnummer-oberoende source_key (flik +
   rubrik + elementkod/aktivitetstext, se buildSourceKey i
   plan-excel-parser.js) som sparas på posten (toRow/fromRow). En ny import
   matchar Excel-raderna mot BEFINTLIGA poster via den nyckeln istället för
   via object_id - så datum/framdrift/faser uppdateras från Excel, men
   3D-kopplingen och kommentarerna (som hänger på id, inte source_key) rörs
   inte. Se buildPlanImportDiff/commitPlanImport.
   ------------------------------------------------------------------- */

/**
 * Victors beslut 2026-09-22 ("Räkna ut automatiskt"): Excel-filen har ingen
 * egen statuskolumn (bara en färglegend på arbetsbladet), så status räknas
 * fram ur framdrift/datum istället för att läsas från en kolumn. Skild från
 * computeItemPhase() (som räknar ut listans avvikelsetagg/3D-färg och kan
 * returnera "pausad") - den här
 * sätter bara det faktiska it.status-värdet en importerad rad ska få.
 */
function computeImportStatus(parsed, todayStr) {
  if (Number.isFinite(parsed.progress) && parsed.progress >= 100) return "klar";
  const today = new Date(todayStr);
  if (parsed.endDate && today > new Date(parsed.endDate)) return "forsenad";
  // Bara framdrift gör den pågående; startad utan framdrift = försenad (Victor 2026-10-02).
  if ((Number(parsed.progress) || 0) >= 1) return "pagaende";
  if (parsed.startDate && today >= new Date(parsed.startDate)) return "forsenad";
  return "planerad";
}

/** Klick på "Läs in och förhandsgranska" - tolkar filen lokalt (skriver ingenting) och öppnar förhandsgranskningsdialogen. */
async function onImportPlanExcel() {
  const fileInput = document.getElementById("planExcelFile");
  const status = document.getElementById("planImportStatus");
  if (!fileInput.files.length) {
    status.innerText = "Välj en Excel-fil först.";
    return;
  }
  await importPlanFromBuffer(await fileInput.files[0].arrayBuffer(), fileInput.files[0].name);
}
/* Läser och förhandsgranskar en planeringsfil – vald fil eller skickad från Excel (inbox). */
async function importPlanFromBuffer(buf, fileName, inbox) {
  const status = document.getElementById("planImportStatus");
  status.innerText = "Läser och tolkar filen...";
  try {
    // cellStyles behövs för att få med Excels radgruppering (underaktiviteter).
    const wb = XLSX.read(buf, { type: "array", cellDates: true, cellStyles: true });
    const sheetsData = buildPlanSheetsData(wb);
    if (Object.keys(sheetsData).length === 0) {
      status.innerText = `Hittade inga kända WBS-områdesflikar i filen (förväntade t.ex. "742 - SIKTHALL"). Har du valt rätt fil?`;
      return;
    }
    const parsedItems = parsePlanWorkbookRows(sheetsData);
    if (parsedItems.length === 0) {
      status.innerText = "Hittade inga aktivitetsrader att importera i filen.";
      return;
    }
    planImportDiff = buildPlanImportDiff(parsedItems);
    planImportDiff.fileName = fileName;
    planImportDiff.inbox = inbox || null;
    // Kommentarerna i Excel-filen (lösta trådar hoppas över).
    planImportDiff.excelComments = typeof readExcelComments === "function" ? matchExcelComments(readExcelComments(buf), parsedItems) : null;
    renderPlanImportPreview(planImportDiff);
    toggle("planImportPreviewDialog", true);
    status.innerText = "";
  } catch (e) {
    console.error("Kunde inte läsa/tolka planeringsfilen:", e);
    status.innerText = "Kunde inte läsa filen: " + e.message;
  }
}

/**
 * Jämför de nytolkade raderna mot BEFINTLIGA importerade objekt (via
 * source_key, se toRow/fromRow) - inte mot hela `items`, bara de som redan
 * har en source_key (dvs. kommer från ett tidigare planimport). Objekt som
 * kopplats via vanliga "Koppla markering" har ingen source_key och berörs
 * aldrig av den här importen.
 */
function buildPlanImportDiff(parsedItems) {
  // En aktivitet kan vara kopplad till flera 3D-objekt (en rad per objekt
  // med samma source_key, se coupleItemToModelObjects) - alla uppdateras.
  const bySourceKey = new Map(); // source_key -> [item, ...]
  items.forEach(it => {
    // Egna aktiviteter (origin "manuell") matchas aldrig mot importen.
    if (!it.sourceKey || it.origin === "manuell") return;
    if (!bySourceKey.has(it.sourceKey)) bySourceKey.set(it.sourceKey, []);
    bySourceKey.get(it.sourceKey).push(it);
  });

  const todayStr = new Date().toISOString().slice(0, 10);
  const seenKeys = new Set();
  // 1) 4D-ID (Victors önskemål 2026-10-05): raden bär aktivitetens id i Excels dolda kolumn
  //    "4D-ID" (skrivs av makrot "Hämta från 4D"). Den matchar oavsett namn, flik och rad.
  //    Ett id som förekommer två gånger (t.ex. en kopierad rad) gäller bara den första.
  const byId = new Map();
  bySourceKey.forEach(list => list.forEach(it => byId.set(it.id, it)));
  const claimed = new Set(); // source_key som tagits av ett id
  const viaId = new Map(); // parsed -> befintlig aktivitet
  parsedItems.forEach(p => {
    const it = p.id4d ? byId.get(p.id4d) : null;
    if (!it || claimed.has(it.sourceKey)) return;
    claimed.add(it.sourceKey);
    viaId.set(p, it);
  });
  const renames = [];
  const matched = parsedItems.map(p => {
    const st = computeImportStatus(p, todayStr);
    const idIt = viaId.get(p);
    if (idIt) {
      const all = bySourceKey.get(idIt.sourceKey) || [idIt];
      const first = all.includes(idIt) ? idIt : all[0];
      seenKeys.add(idIt.sourceKey);
      const m = { parsed: p, existing: first, extras: all.filter(x => x !== first), status: st, viaId: true };
      if (idIt.sourceKey !== p.sourceKey) {
        m.renamedFrom = idIt.sourceKey;
        renames.push({ code: p.code || p.objectName || "", from: idIt.activity || idIt.objectName || "", to: p.activity || p.objectName || "", area: p.area, coupled: all.filter(it => it.modelId).length, viaId: true });
      }
      return m;
    }
    // 2) Som förut: samma nyckel (flik + rubrik + kod/aktivitetstext) – om ingen rad med id tagit den.
    if (claimed.has(p.sourceKey)) return { parsed: p, existing: null, extras: [], status: st };
    seenKeys.add(p.sourceKey);
    const all = bySourceKey.get(p.sourceKey) || [];
    return { parsed: p, existing: all[0] || null, extras: all.slice(1), status: st };
  });

  // Namnbyte (Victors önskemål 2026-10-01): "M30 - Fundament DP2 - Betongarbeten"
  // omdöpt till "M30 - Fundament" ger en ny nyckel för en rad med underrader.
  // Finns det under samma flik och rubrik EXAKT EN ny, omatchad aktivitet med
  // koden och EXAKT EN tidigare aktivitet med koden som inte längre finns i
  // filen, är det samma aktivitet: den behåller sina 3D-kopplingar,
  // kommentarer och markeringar och får det nya namnet. Fler kandidater (t.ex.
  // J14 Fundament + J14 Kontrefor) matchas inte gissningsvis.
  const codeKeyOf = key => String(key || "").split("||").slice(0, 3).join("||");
  const orphanKeys = [...bySourceKey.keys()].filter(k => !seenKeys.has(k) && !claimed.has(k));
  const unmatchedByCode = new Map();
  matched.forEach(m => {
    if (m.existing || !m.parsed.code) return;
    const ck = `${String(m.parsed.sourceKey).split("||").slice(0, 2).join("||")}||${m.parsed.code}`;
    if (!unmatchedByCode.has(ck)) unmatchedByCode.set(ck, []);
    unmatchedByCode.get(ck).push(m);
  });
  unmatchedByCode.forEach((list, ck) => {
    const olds = orphanKeys.filter(k => codeKeyOf(k) === ck);
    if (list.length !== 1 || olds.length !== 1) return;
    const m = list[0], all = bySourceKey.get(olds[0]);
    m.existing = all[0]; m.extras = all.slice(1); m.renamedFrom = olds[0];
    seenKeys.add(olds[0]);
    renames.push({ code: m.parsed.code, from: all[0].activity || all[0].objectName || "", to: m.parsed.activity || m.parsed.objectName || "", area: m.parsed.area, coupled: all.filter(it => it.modelId).length });
  });

  // Namn ändrade i 4D (Victors önskemål 2026-10-05): är Excel-raden oförändrad sedan förra
  // importen behålls namnet från 4D (aktivitet och faser) i stället för Excels.
  matched.forEach(m => { if (m.existing) m.keep = planImportKeep4dNames(m.parsed, m.existing); });
  const kept4d = matched.filter(m => m.keep).map(m => ({ code: m.parsed.code || m.parsed.objectName || "", name: (m.keep.names && (m.keep.names.activity || m.keep.names.objectName)) || m.existing.activity || m.existing.objectName || "", excel: m.parsed.activity || m.parsed.objectName || "", phases: m.keep.phaseMap.size }));

  const toCreate = matched.filter(m => !m.existing);
  const toUpdate = matched.filter(m => m.existing);
  // Fanns i en TIDIGARE import (har source_key) men inte i den nya filen -
  // t.ex. en borttagen eller omdöpt rubrik/elementkod. Rörs INTE av importen
  // (varken uppdateras eller tas bort) - bara ett observandum i förhands-
  // granskningen, se renderPlanImportPreview.
  // Bara flikar som finns i filen räknas – importeras en fil med färre flikar
  // rörs aktiviteterna från de andra flikarna inte (Victors önskemål 2026-10-02).
  const sheetsInFile = new Set(parsedItems.map(p => sheetOfSourceKey(p.sourceKey)).filter(Boolean));
  const removedExisting = Array.from(bySourceKey.values()).flat().filter(it => !seenKeys.has(it.sourceKey) && sheetsInFile.has(sheetOfSourceKey(it.sourceKey)));
  // Det som inte finns kvar i Excel tas bort vid importen (förvalt: allt, kan väljas bort per aktivitet).
  const removeKeys = new Set(removedExisting.map(it => it.sourceKey));

  return { parsedItems, matched, toCreate, toUpdate, removedExisting, removeKeys, renames, kept4d, todayStr };
}

/* Ändringarna i detalj (Victor 2026-10-06: "mer info … om framdriften justerats, om datum ändrats
   osv"): hopfällbara grupper med före → efter för de största ändringarna; allt finns i Excel-rapporten. */
function planImportChangesHtml(diff) {
  if (!diff.toUpdate.length) return "";
  const e = escapeHtml, f = d => (d ? String(d).replace(/^(\d{4})-(\d{2})-(\d{2}).*$/, "$3/$2") : "–");
  const today = new Date().toISOString().slice(0, 10);
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
  const name = (p, ex) => `<b>${e(p.objectName || ex.objectName || "")}</b>${p.area ? ` <span class="hint">${e(p.area)}</span>` : ""}`;
  const moved = [], prog = [], renamed = [], status = [], stale = [];
  diff.toUpdate.forEach(m => {
    const ex = m.existing, p = m.keep ? planImportApplyKeep(m.parsed, m.keep) : m.parsed;
    const dChanged = ex.startDate !== p.startDate || ex.endDate !== p.endDate;
    const pBefore = Number(ex.progress) || 0, pAfter = Number(p.progress) || 0;
    if (dChanged) moved.push({ ex, p, shift: days(ex.endDate || ex.startDate, p.endDate || p.startDate) || days(ex.startDate, p.startDate) });
    if (pBefore !== pAfter) prog.push({ ex, p, a: pBefore, b: pAfter });
    // Flyttad men framdriften står still på en påbörjad, ej klar aktivitet – värt att kolla.
    else if (dChanged && pAfter > 0 && pAfter < 100) stale.push({ ex, p, shift: days(ex.endDate || ex.startDate, p.endDate || p.startDate) });
    if ((ex.objectName || "") !== (p.objectName || "") || (ex.area || "") !== (p.area || "")) renamed.push({ ex, p });
    const before = ex.status, after = computeItemPhase({ ...ex, startDate: p.startDate, endDate: p.endDate, progress: pAfter, actualStartDate: p.actualStartDate, actualEndDate: p.actualEndDate, status: m.status }, today) || m.status;
    if (before !== after) status.push({ ex, p, a: before, b: after });
  });
  const lbl = st => e(STATUS_LABELS[st] || st || "");
  const sh = n => `<b class="${n > 0 ? "bl-later" : n < 0 ? "bl-earlier" : ""}">${n > 0 ? "+" : ""}${n} d</b>`;
  const group = (title, list, row, sort) => {
    if (!list.length) return "";
    const shown = (sort ? list.slice().sort(sort) : list).slice(0, 10);
    return `<details class="plan-import-changes"><summary>${title}</summary><ul>${shown.map(row).join("")}${list.length > shown.length ? `<li class="hint">… och ${list.length - shown.length} till – se Exportera till Excel</li>` : ""}</ul></details>`;
  };
  const cnt = (list, fn) => list.filter(fn).length;
  const byStatus = {};
  status.forEach(x => { byStatus[x.b] = (byStatus[x.b] || 0) + 1; });
  return `<div class="plan-import-changes-box">
    ${group(`📅 <b>${moved.length}</b> nya datum <span class="hint">(${cnt(moved, x => x.shift > 0)} senare, ${cnt(moved, x => x.shift < 0)} tidigare – största först)</span>`, moved,
      x => `<li>${sh(x.shift)} ${name(x.p, x.ex)} <span class="hint">${f(x.ex.startDate)}–${f(x.ex.endDate)} → ${f(x.p.startDate)}–${f(x.p.endDate)}</span></li>`, (a, b) => Math.abs(b.shift) - Math.abs(a.shift))}
    ${group(`📈 <b>${prog.length}</b> ändrad framdrift <span class="hint">(${cnt(prog, x => x.b > x.a)} upp, ${cnt(prog, x => x.b < x.a)} ned${cnt(prog, x => x.b >= 100 && x.a < 100) ? `, ${cnt(prog, x => x.b >= 100 && x.a < 100)} blir klara` : ""}${cnt(prog, x => x.a === 0 && x.b > 0) ? `, ${cnt(prog, x => x.a === 0 && x.b > 0)} påbörjade` : ""})</span>`, prog,
      x => `<li><b class="${x.b < x.a ? "bl-later" : "bl-earlier"}">${x.a} % → ${x.b} %</b> ${name(x.p, x.ex)}${(x.ex.startDate !== x.p.startDate || x.ex.endDate !== x.p.endDate) ? ` <span class="hint">· nya datum också</span>` : ""}</li>`, (a, b) => Math.abs(b.b - b.a) - Math.abs(a.b - a.a))}
    ${group(`⚠ <b>${stale.length}</b> flyttade utan uppdaterad framdrift <span class="hint">(påbörjade, framdriften står still – värt att kolla)</span>`, stale,
      x => `<li>${sh(x.shift)} ${name(x.p, x.ex)} <span class="hint">framdrift ${Number(x.p.progress) || 0} %</span></li>`, (a, b) => Math.abs(b.shift) - Math.abs(a.shift))}
    ${group(`🚦 <b>${status.length}</b> får ny status <span class="hint">(${Object.entries(byStatus).map(([k, v]) => `${v} ${lbl(k).toLowerCase()}`).join(", ")})</span>`, status,
      x => `<li>${lbl(x.a)} → <b>${lbl(x.b)}</b> ${name(x.p, x.ex)}</li>`, (a, b) => (b.b === "forsenad") - (a.b === "forsenad"))}
    ${group(`✏️ <b>${renamed.length}</b> nytt namn eller område`, renamed,
      x => `<li>${e(x.ex.objectName || "")} <span class="hint">${e(x.ex.area || "")}</span> → ${name(x.p, x.ex)}</li>`)}
  </div>`;
}

/* Vad som faktiskt ändras bland de som uppdateras (Victor 2026-10-06: "mer info"). */
function planImportUpdateBreakdownHtml(diff) {
  if (!diff.toUpdate.length) return "";
  let dates = 0, later = 0, earlier = 0, prog = 0, names = 0, same = 0;
  diff.toUpdate.forEach(m => {
    const ex = m.existing, p = m.keep ? planImportApplyKeep(m.parsed, m.keep) : m.parsed;
    const d = ex.startDate !== p.startDate || ex.endDate !== p.endDate;
    const pr = (Number(ex.progress) || 0) !== (Number(p.progress) || 0);
    const n = (ex.objectName || "") !== (p.objectName || "") || (ex.activity || "") !== (p.activity || "") || (ex.area || "") !== (p.area || "");
    if (d) { dates++; const sh = Math.round((Date.parse(p.endDate || p.startDate) - Date.parse(ex.endDate || ex.startDate)) / 86400000); if (sh > 0) later++; else if (sh < 0) earlier++; }
    if (pr) prog++;
    if (n) names++;
    if (!d && !pr && !n) same++;
  });
  const parts = [dates ? `<b>${dates}</b> nya datum${later || earlier ? ` (${later} senare, ${earlier} tidigare)` : ""}` : "", prog ? `<b>${prog}</b> ändrad framdrift` : "",
    names ? `<b>${names}</b> nytt namn/område` : "", same ? `<b>${same}</b> oförändrade` : ""].filter(Boolean);
  return parts.length ? `<div class="hint plan-import-breakdown">varav ${parts.join(" · ")}</div>` : "";
}

/* Excels rad med namnen från 4D inlagda (aktivitet, faser och fasnamnen i excel_map, så att
   "Hämta från 4D" hittar faserna). */
function planImportApplyKeep(p, keep) {
  const out = { ...p };
  if (keep.names) { out.objectName = keep.names.objectName; out.activity = keep.names.activity; }
  if (keep.phaseMap.size) {
    const ph = (p.excelMap || []).filter(e => e.phase);
    const rename = e => e && keep.phaseMap.get(String(e.text || "").trim());
    out.subActivities = p.subActivities.map((s, i) => { const n = rename(ph[i]); return n ? { ...s, name: n } : s; });
    out.excelMap = p.excelMap.map(e => { const n = e.phase && keep.phaseMap.get(String(e.text || "").trim()); return n ? { ...e, phase: n } : e; });
  }
  return out;
}
/* Namn som ändrats i 4D sedan förra importen: Excel-raderna har samma text som då (excel_map)
   men aktiviteten heter något annat i 4D. Faserna jämförs rad för rad (samma ordning som vid
   importen). Returnerar null om inget ska behållas. */
function planImportKeep4dNames(p, ex) {
  const base = Array.isArray(ex.excelMap) ? ex.excelMap : null;
  if (!base || !base.length || !Array.isArray(p.excelMap) || !p.excelMap.length) return null;
  const txt = e => String((e && e.text) || "").trim();
  const sameRows = base.length === p.excelMap.length && base.every((b, i) => txt(b) === txt(p.excelMap[i]));
  const differs = (a, b) => String(a || "").trim() !== String(b || "").trim();
  const names = sameRows && (differs(ex.objectName, p.objectName) || differs(ex.activity, p.activity)) ? { objectName: ex.objectName, activity: ex.activity } : null;
  // Faserna: förra importens fasnamn (i ordning) mot delaktiviteterna i 4D nu.
  const phaseMap = new Map(); // Excel-radens text -> namnet i 4D
  const basePh = base.filter(b => b.phase), acts = activitiesByItemId.get(ex.id) || [];
  if (basePh.length && acts.length === basePh.length) {
    const now = new Set(p.excelMap.filter(e => e.phase).map(txt));
    basePh.forEach((b, i) => { const n = String(acts[i].name || "").trim(); if (n && differs(n, b.phase) && now.has(txt(b))) phaseMap.set(txt(b), n); });
  }
  return names || phaseMap.size ? { names, phaseMap } : null;
}

function renderPlanImportPreview(diff) {
  const summaryEl = document.getElementById("planImportSummary");
  const removedEl = document.getElementById("planImportRemovedWarning");
  const samplesEl = document.getElementById("planImportSamples");
  const confirmMsgEl = document.getElementById("planImportConfirmMsg");

  const withPhases = diff.parsedItems.filter(p => p.subActivities.length > 0).length;
  summaryEl.innerHTML = `
    <div><strong>${diff.toCreate.length}</strong> nya objekt</div>
    <div><strong>${diff.toUpdate.length}</strong> uppdateras (datum/framdrift/faser - 3D-koppling &amp; kommentarer rörs inte)${planImportUpdateBreakdownHtml(diff)}</div>
    <div>${diff.parsedItems.length} objekt totalt i filen (${withPhases} med faser/delaktiviteter)</div>
  `;

  if (diff.renames && diff.renames.length) {
    summaryEl.innerHTML += `<div class="plan-import-renames"><strong>${diff.renames.length}</strong> namnbyte${diff.renames.length > 1 ? "n" : ""} – samma aktivitet, kopplingen behålls:<ul>${diff.renames.slice(0, 12).map(r => `<li><b>${escapeHtml(r.code)}</b>: ${escapeHtml(r.from || "–")} → ${escapeHtml(r.to || "–")}${r.coupled ? ` <span class="hint">(${r.coupled} kopplade objekt)</span>` : ""}</li>`).join("")}${diff.renames.length > 12 ? `<li>… och ${diff.renames.length - 12} till</li>` : ""}</ul></div>`;
  }
  if (diff.kept4d && diff.kept4d.length) {
    summaryEl.innerHTML += `<div class="plan-import-renames"><strong>${diff.kept4d.length}</strong> namn ändrade i 4D behålls (raden i Excel är oförändrad):<ul>${diff.kept4d.slice(0, 12).map(r => `<li><b>${escapeHtml(r.code)}</b>: ${escapeHtml(r.name || "–")}${r.excel && r.excel !== r.name ? ` <span class="hint">(Excel: ${escapeHtml(r.excel)})</span>` : ""}${r.phases ? ` <span class="hint">· ${r.phases} fas${r.phases > 1 ? "er" : ""} med namn från 4D</span>` : ""}</li>`).join("")}${diff.kept4d.length > 12 ? `<li>… och ${diff.kept4d.length - 12} till</li>` : ""}</ul></div>`;
  }
  if (diff.removedExisting.length > 0) {
    renderPlanImportRemoved(diff, removedEl);
  } else {
    removedEl.classList.add("hidden");
    removedEl.innerHTML = "";
  }

  summaryEl.innerHTML += planImportChangesHtml(diff);
  if (diff.baseline && diff.baseline.html) summaryEl.innerHTML += diff.baseline.html;
  else if (diff.baseline && diff.baseline.text) summaryEl.innerHTML += `<div class="plan-import-baseline">▭ ${escapeHtml(diff.baseline.text)}</div>`;
  const xc = diff.excelComments;
  if (xc && (xc.list.length || xc.resolved || xc.unmatched)) {
    const replies = xc.list.filter(x => x.c.parentId).length;
    summaryEl.innerHTML += `<label class="check plan-import-comments"><input type="checkbox" id="planImportComments"${xc.list.length ? " checked" : " disabled"} />
      💬 <span><strong>${xc.list.length}</strong> kommentar${xc.list.length === 1 ? "" : "er"} från Excel${replies ? ` (varav ${replies} svar)` : ""} läggs in på aktiviteterna
      <span class="hint">${[xc.resolved ? `${xc.resolved} i lösta trådar hoppas över` : "", xc.unmatched ? `${xc.unmatched} saknar aktivitet på raden` : "", "redan inlagda läggs inte in igen"].filter(Boolean).join(" · ")}</span></span></label>`;
  }

  const samples = diff.toCreate.slice(0, 3).map(m => m.parsed);
  samplesEl.innerHTML = samples.length === 0 ? "" : `<p class="hint">Exempel på nya objekt:</p>` + samples.map(p => `
    <div class="plan-import-sample">
      <strong>${escapeHtml(p.objectName)}</strong> <span class="hint">${escapeHtml(p.area)}</span><br/>
      ${escapeHtml(p.activity || "–")}<br/>
      <span class="hint">${escapeHtml(formatDateRange(p))} · Framdrift ${p.progress}%${p.subActivities.length ? ` · ${p.subActivities.length} ${p.subActivities.length === 1 ? "fas" : "faser"}` : ""}</span>
    </div>`).join("");

  confirmMsgEl.innerText = "";
}

/* Borttagna ur Excel (Victors önskemål 2026-10-02): aktiviteter som fanns i
   en tidigare import men inte längre finns i filen (på de flikar filen har)
   tas bort vid importen – en kryssruta per aktivitet, alla ikryssade från
   början. En säkerhetskopia tas före importen. */
function renderPlanImportRemoved(diff, el) {
  if (!diff.removeKeys) diff.removeKeys = new Set(diff.removedExisting.map(it => it.sourceKey));
  const groups = new Map();
  diff.removedExisting.forEach(it => { if (!groups.has(it.sourceKey)) groups.set(it.sourceKey, []); groups.get(it.sourceKey).push(it); });
  const list = [...groups.entries()];
  const nSel = list.filter(([k]) => diff.removeKeys.has(k)).reduce((a, [, rows]) => a + rows.length, 0);
  el.classList.remove("hidden");
  el.innerHTML = `<div><b>${list.length} aktivitet${list.length === 1 ? "" : "er"} finns inte längre i Excel</b> (borttagen rubrik eller elementkod). Ikryssade tas bort vid importen – en säkerhetskopia tas först. Aktiviteter skapade i TC och flikar som inte finns i filen rörs inte.</div>
    <div class="pir-actions"><button type="button" data-pir="all">Kryssa alla</button><button type="button" data-pir="none">Kryssa ingen</button><span class="hint">${nSel} objekt tas bort</span></div>
    <div class="pir-list">${list.map(([k, rows], i) => {
      const it = rows[0], coupled = rows.filter(r => r.modelId).length;
      const comments = rows.reduce((a, r) => a + (commentCounts.get(r.id) || 0), 0), subs = rows.reduce((a, r) => a + (activitiesByItemId.get(r.id) || []).length, 0);
      const facts = [it.area, coupled ? `${coupled} 3D-kopplade` : "", comments ? `${comments} kommentar${comments > 1 ? "er" : ""}` : "", subs ? `${subs} delakt.` : ""].filter(Boolean).join(" · ");
      return `<label class="pir-row"><input type="checkbox" data-pir-i="${i}"${diff.removeKeys.has(k) ? " checked" : ""} /><span><b>${escapeHtml(it.objectName || "")}</b> ${escapeHtml(it.activity || "")}<br/><span class="hint">${escapeHtml(facts)}</span></span></label>`;
    }).join("")}</div>`;
  el.querySelectorAll("[data-pir-i]").forEach(c => c.onchange = () => { const k = list[Number(c.dataset.pirI)][0]; if (c.checked) diff.removeKeys.add(k); else diff.removeKeys.delete(k); renderPlanImportRemoved(diff, el); });
  el.querySelector('[data-pir="all"]').onclick = () => { list.forEach(([k]) => diff.removeKeys.add(k)); renderPlanImportRemoved(diff, el); };
  el.querySelector('[data-pir="none"]').onclick = () => { diff.removeKeys.clear(); renderPlanImportRemoved(diff, el); };
}
const planImportRemoveIds = diff => new Set(diff.removedExisting.filter(it => diff.removeKeys && diff.removeKeys.has(it.sourceKey)).map(it => it.id));

/* Hela förhandsgranskningen som Excel-fil (Victors önskemål 2026-10-01):
   en flik per kategori, och för det som uppdateras exakt vad som ändras
   (före → efter), så man kan filtrera/sortera och gå igenom allt innan man
   importerar skarpt. Påverkar inget – det är bara en rapport. */
function exportPlanImportReport(diff) {
  const fileName = diff.fileName || (document.getElementById("planExcelFile").files[0] || {}).name || "Excel";
  const subNames = it => (activitiesByItemId.get(it.id) || []).map(r => r.name).filter(Boolean).join(", ");
  const coupledCount = list => list.filter(it => it && it.modelId).length;
  const yes = b => (b ? "Ja" : "");
  // Uppdateras: jämför den befintliga posten med det som kommer från Excel.
  const fields = [
    ["Namn", ex => ex.objectName, p => p.objectName],
    ["Aktivitet", ex => ex.activity, p => p.activity],
    ["Typ", ex => ex.elementType, p => p.elementType || ex_keepType],
    ["Område", ex => ex.area, p => p.area],
    ["Start", ex => ex.startDate, p => p.startDate],
    ["Slut", ex => ex.endDate, p => p.endDate],
    ["Plan. start", ex => ex.baselineStartDate, p => p.baselineStartDate],
    ["Plan. slut", ex => ex.baselineEndDate, p => p.baselineEndDate],
    ["Framdrift %", ex => ex.progress, p => p.progress],
  ];
  let ex_keepType = null;
  const norm = v => (v === undefined || v === null || v === "" ? "" : v);
  const updRows = diff.toUpdate.map(m => {
    const ex = m.existing, p = m.keep ? planImportApplyKeep(m.parsed, m.keep) : m.parsed;
    ex_keepType = ex.elementType || null;
    const row = { "Kod/namn": p.objectName, "Område": p.area };
    const changed = [];
    fields.forEach(([label, a, b]) => {
      const before = norm(a(ex)), after = norm(b(p));
      if (String(before) !== String(after)) changed.push(label);
      row[`${label} före`] = before; row[`${label} efter`] = after;
    });
    const subsBefore = subNames(ex), subsAfter = (p.subActivities || []).map(sa => sa.name).join(", ");
    if (subsBefore !== subsAfter) changed.push("Delaktiviteter");
    row["Delaktiviteter före"] = subsBefore; row["Delaktiviteter efter"] = subsAfter;
    const statusAfter = m.status || "";
    if ((ex.status || "") !== statusAfter) changed.push("Status");
    row["Status före"] = STATUS_LABELS[ex.status] || ex.status || ""; row["Status efter"] = STATUS_LABELS[statusAfter] || statusAfter;
    row["Kopplade 3D-objekt"] = coupledCount([ex, ...(m.extras || [])]);
    row["Namnbyte"] = yes(m.renamedFrom);
    row["Namn från 4D behålls"] = yes(m.keep);
    row["Känd via 4D-ID"] = yes(m.viaId);
    return { "Ändrat": changed.length ? changed.join(", ") : "Ingen ändring", ...row };
  });
  const sheets = [
    ["Sammanfattning", [
      { "Vad": "Fil", "Antal": fileName },
      { "Vad": "Förhandsgranskad", "Antal": new Date().toLocaleString("sv-SE") },
      { "Vad": "Nya objekt", "Antal": diff.toCreate.length },
      { "Vad": "Uppdateras", "Antal": diff.toUpdate.length },
      { "Vad": "– varav med ändringar", "Antal": updRows.filter(r => r["Ändrat"] !== "Ingen ändring").length },
      { "Vad": "– varav oförändrade", "Antal": updRows.filter(r => r["Ändrat"] === "Ingen ändring").length },
      { "Vad": "Namnbyten (kopplingen behålls)", "Antal": (diff.renames || []).length },
      { "Vad": "Namn ändrade i 4D (behålls)", "Antal": (diff.kept4d || []).length },
      { "Vad": "Kända via 4D-ID", "Antal": diff.matched.filter(m => m.viaId).length },
      { "Vad": "Finns inte kvar i filen", "Antal": diff.removedExisting.length },
      { "Vad": "– varav tas bort", "Antal": planImportRemoveIds(diff).size },
      { "Vad": "– varav med 3D-koppling", "Antal": coupledCount(diff.removedExisting) },
      { "Vad": "Objekt totalt i filen", "Antal": diff.parsedItems.length },
    ]],
    ["Namnbyten", (diff.renames || []).map(r => ({ "Kod": r.code, "Område": r.area, "Gammalt namn": r.from, "Nytt namn": r.to, "Kopplade 3D-objekt": r.coupled }))],
    ["Uppdateras", updRows.sort((a, b) => (a["Ändrat"] === "Ingen ändring") - (b["Ändrat"] === "Ingen ändring") || String(a["Område"]).localeCompare(String(b["Område"]), "sv") || String(a["Kod/namn"]).localeCompare(String(b["Kod/namn"]), "sv", { numeric: true }))],
    ["Nya", diff.toCreate.map(m => { const p = m.parsed; return { "Kod/namn": p.objectName, "Område": p.area, "Aktivitet": p.activity || "", "Typ": p.elementType || "", "Start": p.startDate || "", "Slut": p.endDate || "", "Framdrift %": p.progress, "Delaktiviteter": (p.subActivities || []).map(sa => sa.name).join(", ") }; })],
    ["Finns inte kvar", diff.removedExisting.map(it => ({ "Tas bort": diff.removeKeys && diff.removeKeys.has(it.sourceKey) ? "Ja" : "Nej", "Namn": it.objectName || "", "Område": it.area || "", "Aktivitet": it.activity || "", "Typ": it.elementType || "", "3D-kopplad": yes(it.modelId), "Kommentarer": commentCounts.get(it.id) || 0, "Källnyckel": it.sourceKey || "" }))],
  ];
  const wb = XLSX.utils.book_new();
  sheets.forEach(([name, rows]) => {
    const ws = rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.aoa_to_sheet([["(inga)"]]);
    if (rows.length) {
      const keys = Object.keys(rows[0]);
      ws["!cols"] = keys.map(k => ({ wch: Math.min(48, Math.max(k.length, ...rows.slice(0, 300).map(r => String(r[k] ?? "").length)) + 2) }));
      ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: keys.length - 1 } }) };
    }
    XLSX.utils.book_append_sheet(wb, ws, name);
  });
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Importgranskning ${fileName.replace(/\.[^.]+$/, "")} ${stamp}.xlsx`);
}

/** Klick på "Importera skarpt" i förhandsgranskningen. */
async function onConfirmPlanImport() {
  if (!planImportDiff) return;
  if (!isBackendConfigured()) {
    alert("Ingen databas ansluten. Ange GitHub-token i inställningarna.");
    return;
  }
  const btn = document.getElementById("btnConfirmPlanImport");
  const confirmMsgEl = document.getElementById("planImportConfirmMsg");
  btn.disabled = true;
  confirmMsgEl.innerText = "Importerar...";
  try {
    await commitPlanImport(planImportDiff);
    const count = planImportDiff.parsedItems.length, removed = planImportRemoveIds(planImportDiff).size, nc = planImportDiff.commentsAdded || 0;
    planImportDiff = null;
    toggle("planImportPreviewDialog", false);
    document.getElementById(planSource === "pp" && document.getElementById("ppStatus") ? "ppStatus" : "planImportStatus").innerText = `Import klar – ${count} objekt${removed ? `, ${removed} borttagna (finns i säkerhetskopian)` : ""}${nc ? `, ${nc} kommentarer från Excel` : ""}.`;
    if (typeof refreshCommentCounts === "function") { try { await refreshCommentCounts(); } catch (e) { /* ignorera */ } }
    document.getElementById("planExcelFile").value = "";
    await refreshItems();
    if (typeof checkExcelInbox === "function") checkExcelInbox(true);
    await refreshActivities();
    buildFilterOptions();
    renderItemList();
    initTimelineRange();
  } catch (e) {
    console.error("Import misslyckades:", e);
    confirmMsgEl.innerText = "Kunde inte importera: " + e.message;
  } finally {
    btn.disabled = false;
  }
}

/**
 * Skriver den skarpa importen: EN läsning + EN skrivning av plan_items.json
 * (samma "läs, bygg hela nästa array, skriv" -mönster som saveItems(), se
 * dess kommentar om varför - filen växer med tiden och skrivs om i sin
 * helhet varje gång) plus EN skrivning av plan_item_activities.json för
 * samtliga berörda objekts faser, parallellt. Matchar uppdaterade rader på
 * id (via diff.matched[].existing.id) - INTE via source_key eller
 * project_id+object_id - eftersom det är id:t som är den stabila nyckeln
 * genom hela appen (kommentarer, delaktiviteter, beroenden hänger alla på
 * id). Nya rader får en syntetisk object_id (se filhuvudkommentaren ovan)
 * tills de kopplas via "Koppla till markering".
 */
async function commitPlanImport(diff) {
  const fileName = diff.fileName || (document.getElementById("planExcelFile").files[0] || {}).name || "Excel";
  const removeIds = planImportRemoveIds(diff);
  await createBackup(`Före import av ${fileName} (${diff.toCreate.length} nya, ${diff.toUpdate.length} uppdateras${removeIds.size ? `, ${removeIds.size} tas bort` : ""})`);
  const path = itemsPath();
  const { data, sha } = await ghGetFile(settings.githubToken, path);
  const before = Array.isArray(data) ? data : [];

  const activityBatches = [];
  const depKeysById = new Map(); // rad-id -> föregångarnas source_key (Powerproject-länkarna)
  const incomingRows = diff.matched.flatMap(({ parsed: p0, existing, extras, status, keep }) => {
    const p = keep ? planImportApplyKeep(p0, keep) : p0;
    const members = [existing, ...(extras || [])];
    // Aktivitet med flera objekt där vissa objekt bara hör till vissa
    // delaktiviteter: behåll den kopplingen (matchat på delaktivitetens
    // namn) - varje objekt får bara sina faser, och datum från dem.
    const nameSet = m => new Set((m ? activitiesByItemId.get(m.id) || [] : []).map(r => (r.name || "").trim().toLowerCase()).filter(Boolean));
    const allNames = new Set(members.flatMap(m => [...nameSet(m)]));
    return members.map(ex => {
      const own = nameSet(ex);
      const partial = members.length > 1 && own.size > 0 && own.size < allNames.size;
      return importRow(p, ex, status, partial ? own : null);
    });
  });

  function importRow(p, existing, status, onlyPhases) {
    let phases = p.subActivities;
    let dates = { startDate: p.startDate, endDate: p.endDate };
    if (onlyPhases) {
      const mine = p.subActivities.filter(sa => onlyPhases.has((sa.name || "").trim().toLowerCase()));
      if (mine.length) {
        phases = mine;
        const ds = mine.flatMap(sa => [sa.start, sa.end]).filter(Boolean).sort();
        if (ds.length) dates = { startDate: ds[0], endDate: ds[ds.length - 1] };
      }
    }
    const id = existing ? existing.id : ghNewId();
    const modelId = existing ? existing.modelId : null;
    const objectId = existing ? existing.objectId : `excel-${id}`;
    const row = toRow({
      id, projectId, modelId, objectId,
      objectName: p.objectName,
      // Typ från Excel; saknas den där behålls en egen ifylld typ.
      elementType: p.elementType || (existing ? existing.elementType : null) || null,
      area: p.area,
      activity: p.activity,
      // Powerproject ger entreprenören (kodbiblioteket "Utförs av"); Excel behåller den ifyllda.
      contractor: p.contractor !== undefined ? p.contractor : (existing ? existing.contractor : null),
      status,
      startDate: dates.startDate,
      endDate: dates.endDate,
      actualStartDate: p.actualStartDate,
      actualEndDate: p.actualEndDate,
      progress: p.progress,
      estimatedHours: existing ? existing.estimatedHours : null,
      // Resurser (antal och timmar per resurs) från Powerproject; har aktiviteten inga där behålls de som finns.
      resources: p.resources !== undefined ? p.resources : (existing ? existing.resources : null),
      dependsOn: existing ? existing.dependsOn : [],
      depLags: existing ? existing.depLags : null,
      sourceKey: p.sourceKey,
      ppGuid: p.ppGuid || (existing ? existing.ppGuid : null) || null,
      groupId: existing ? existing.groupId : null,
      baselineStartDate: p.baselineStartDate || null,
      baselineEndDate: p.baselineEndDate || null,
      // Namngivna baselines: från Powerproject-importen, annars (Excel) behålls de som finns.
      baselines: p.baselines !== undefined ? p.baselines : (existing ? existing.baselines : null),
      excelSheet: p.sheet || null,
      excelMap: p.excelMap || null,
    });
    if (Array.isArray(p.dependsOnKeys)) depKeysById.set(id, p.dependsOnKeys);
    if (phases.length > 0) {
      activityBatches.push({
        planItemId: id,
        rows: phases.map(s => ({ name: s.name, start: s.start, end: s.end, hours: "", progress: Number.isFinite(s.progress) ? s.progress : null })),
      });
    }
    return row;
  }

  // Beroenden från Powerproject: föregångarnas source_key -> id (alla objekt med nyckeln).
  if (depKeysById.size) {
    const idsByKey = new Map();
    const addKey = (k, id) => { if (!k) return; if (!idsByKey.has(k)) idsByKey.set(k, []); if (!idsByKey.get(k).includes(id)) idsByKey.get(k).push(id); };
    before.forEach(r => addKey(r.source_key, r.id));
    incomingRows.forEach(r => addKey(r.source_key, r.id));
    incomingRows.forEach(r => {
      const keys = depKeysById.get(r.id);
      if (!keys) return;
      const own = new Set(idsByKey.get(r.source_key) || [r.id]);
      r.depends_on = [...new Set(keys.flatMap(k => idsByKey.get(k) || []))].filter(id => !own.has(id));
      // Glappen följer med så länge kopplingen finns kvar i Powerproject.
      if (r.dep_lags) { const l = depLagsFor(r.dep_lags, r.depends_on); if (l) r.dep_lags = l; else delete r.dep_lags; }
    });
  }

  const [after] = await Promise.all([
    ghWriteJSON(
      settings.githubToken,
      path,
      (arr) => {
        const byId = new Map(incomingRows.map(r => [r.id, r]));
        const next = arr.map(r => (byId.has(r.id) ? byId.get(r.id) : r));
        const existingIds = new Set(arr.map(r => r.id));
        incomingRows.forEach(r => { if (!existingIds.has(r.id)) next.push(r); });
        // Borttagna ur Excel (de som var ikryssade i förhandsgranskningen).
        return removeIds.size ? next.filter(r => !removeIds.has(r.id)) : next;
      },
      `Importera 4-veckorsplanering (${incomingRows.length} objekt)`,
      6,
      { data: before, sha }
    ),
    saveActivitiesForItemsBulk(activityBatches),
    // Baseline (Powerproject-importen): varifrån baseline-datumen kommer.
    diff.baseline && diff.baseline.registry ? ghWriteJSON(settings.githubToken, baselineRegistryPath(), () => diff.baseline.registry, `Baselines: ${diff.baseline.name || ""}`)
      .catch(e => console.warn("Kunde inte spara baseline-registret", e)) : null,
    diff.baseline && diff.baseline.meta !== undefined ? ghWriteJSON(settings.githubToken, baselineMetaPath(),
      arr => [...(Array.isArray(arr) ? arr : []).slice(-19), diff.baseline.meta], `Baseline: ${diff.baseline.meta.label || "ingen"}`).catch(e => console.warn("Kunde inte spara baseline-uppgiften", e)) : null,
    // Importloggen: flikarna och aktiviteterna i den här filen (se isGoneFromLastImport).
    (async () => {
      const rec = { id: ghNewId(), at: new Date().toISOString(), file: fileName, by: settings.userName || null,
        ...(diff.inbox ? { inbox_sent_at: diff.inbox.sent_at, inbox_by: diff.inbox.by || null } : {}),
        sheets: [...new Set(diff.parsedItems.map(p => sheetOfSourceKey(p.sourceKey)).filter(Boolean))],
        keys: [...new Set(diff.parsedItems.map(p => p.sourceKey).filter(Boolean))] };
      try {
        await ghWriteJSON(settings.githubToken, importsPath(), arr => [...(Array.isArray(arr) ? arr : []).slice(-19), rec], `Importlogg: ${fileName}`);
        lastPlanImport = rec;
      } catch (e) { console.warn("Kunde inte spara importloggen", e); }
    })(),
  ]);
  // Kommentarer och delaktiviteter till borttagna aktiviteter (finns kvar i säkerhetskopian).
  if (removeIds.size) {
    try { await deleteCommentsForItems([...removeIds]); await deleteActivitiesForItems([...removeIds]); }
    catch (e) { console.warn("Kunde inte städa kommentarer/delaktiviteter", e); }
  }
  // Kommentarerna från Excel (om rutan är ikryssad).
  const cb = document.getElementById("planImportComments");
  if (diff.excelComments && diff.excelComments.list.length && (!cb || cb.checked)) {
    const idByKey = new Map();
    incomingRows.forEach(r => { if (r.source_key && !idByKey.has(r.source_key)) idByKey.set(r.source_key, r.id); });
    try { diff.commentsAdded = await importExcelComments(diff.excelComments.list, idByKey); }
    catch (e) { console.warn("Kunde inte lägga in kommentarerna från Excel", e); diff.commentsError = e.message; }
  }

  return after;
}

/* Lägger in Excel-kommentarerna (EN skrivning). Varje kommentar får sitt
   Excel-id (excel_id), så en ny import av samma fil inte lägger in den igen. */
async function importExcelComments(list, idByKey) {
  let added = 0;
  await ghWriteJSON(settings.githubToken, commentsPath(), arr => {
    const cur = Array.isArray(arr) ? arr : [];
    const byExcel = new Map(cur.filter(c => c.excel_id).map(c => [c.excel_id, c.id]));
    const next = [...cur];
    list.forEach(({ c, sourceKey }) => {
      const itemId = idByKey.get(sourceKey);
      if (!itemId || byExcel.has(c.id)) return;
      const parent = c.parentId ? byExcel.get(c.parentId) : null;
      if (c.parentId && !parent) return;
      const at = c.at && !isNaN(new Date(c.at)) ? new Date(c.at).toISOString() : new Date().toISOString();
      const row = { id: ghNewId(), created_at: at, plan_item_id: itemId, parent_comment_id: parent || null, author: c.author || "Excel", body: c.text.trim(), excel_id: c.id, source: "excel" };
      byExcel.set(c.id, row.id);
      next.push(row); added++;
    });
    return next;
  }, `Kommentarer från Excel`);
  return added;
}

/**
 * Som saveActivitiesForItem, men skriver ALLA angivna objekts delaktiviteter
 * i EN enda GitHub-skrivning istället för en skrivning per objekt - annars
 * skulle en import med många objekt med faser (79 st i Victors verkliga fil)
 * göra lika många separata skrivningar mot samma fil i rad och lätt träffa
 * GitHubs gräns för skrivande anrop (se ghPutFile).
 */
async function saveActivitiesForItemsBulk(batches, message) {
  if (!batches || batches.length === 0) return;
  const touchedIds = new Set(batches.map(b => b.planItemId));
  const newRowsByItem = new Map();
  batches.forEach(b => {
    const rows = b.rows
      .filter(r => (r.name && r.name.trim()) || r.start || r.end || r.hours)
      .map(r => ({
        id: ghNewId(),
        plan_item_id: b.planItemId,
        project_id: projectId,
        name: (r.name || "").trim(),
        start_date: r.start || null,
        end_date: r.end || null,
        estimated_hours: Number.isFinite(Number(r.hours)) && r.hours !== "" ? Number(r.hours) : null,
        progress: r.progress !== "" && r.progress != null && Number.isFinite(Number(r.progress)) ? Math.max(0, Math.min(100, Math.round(Number(r.progress)))) : null,
      }));
    newRowsByItem.set(b.planItemId, rows);
  });

  await ghWriteJSON(
    settings.githubToken,
    activitiesPath(),
    (arr) => {
      const kept = arr.filter(a => !touchedIds.has(a.plan_item_id));
      const added = [];
      newRowsByItem.forEach(rows => added.push(...rows));
      return [...kept, ...added];
    },
    message || "Importera delaktiviteter (4-veckorsplanering)"
  );

  newRowsByItem.forEach((rows, planItemId) => {
    activitiesByItemId.set(planItemId, rows.map(r => ({
      name: r.name, start: r.start_date || "", end: r.end_date || "",
      hours: Number.isFinite(r.estimated_hours) ? r.estimated_hours : "",
      progress: Number.isFinite(r.progress) ? r.progress : null
    })));
  });
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
    alert("Inga rader är markerade. Håll in Ctrl (Cmd på Mac) eller Shift och klicka på flera rader i listan för att markera dem.");
    return;
  }
  if (!confirm(`Är du säker på att du vill radera kopplingen för ${selectedItems.length} markerade objekt?`)) return;
  // Omfattar markeringen hela aktiviteter? Då en extra fråga och en säkerhetskopia.
  const selIds = new Set(selectedItems.map(it => it.id));
  const whole = new Map();
  selectedItems.forEach(it => {
    const fam = typeof activityFamily === "function" ? activityFamily(it) : [it];
    if (fam.every(m => selIds.has(m.id))) whole.set(fam.map(m => m.id).sort().join(","), it);
  });
  if (whole.size) {
    const names = [...whole.values()].slice(0, 5).map(it => `• ${it.objectName || it.activity || it.id}`).join("\n");
    if (!confirm(`Markeringen omfattar ${whole.size} hel${whole.size === 1 ? "" : "a"} aktivitet${whole.size === 1 ? "" : "er"} som då försvinner helt:\n${names}${whole.size > 5 ? "\n…" : ""}\n\nEn säkerhetskopia tas först. Radera ändå?`)) return;
    try { await createBackup(`Före radering av ${selectedItems.length} markerade objekt`); }
    catch (e) { if (!confirm(`Säkerhetskopian kunde inte tas (${e.message}). Radera ändå?`)) return; }
  }

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
    el.innerText = `Visar bara de första ${items.length} av totalt ${itemsTotalCount} objekt i databasen.`;
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
/**
 * Sant om objektet "pågår idag" - dagens datum ligger mellan start- och
 * slutdatum (inklusive), eller startdatum har passerat och inget slutdatum
 * är satt (då räknas objektet som fortsatt pågående, samma synsätt som
 * computeItemPhase() använder för fasen "pagaende" utan slutdatum). Objekt
 * utan startdatum kan inte avgöras och räknas inte som "idag".
 */
function isActiveToday(it, todayStr) {
  if (!it.startDate) return false;
  if (it.startDate > todayStr) return false;
  if (it.endDate) return it.endDate >= todayStr;
  return true;
}

/* Aktiviteter som har minst ett 3D-objekt eller en manuell markering kopplad
   ("Visa endast ej kopplade" visar resten – samma som "◇ Ej kopplad" i listan). */
function coupledActivityKeys() {
  const keyOf = it => activityKeyOf(it) || `i:${it.id}`;
  const out = new Set();
  const byId = new Map(items.map(it => [it.id, it]));
  items.forEach(it => { if (it.modelId) out.add(keyOf(it)); });
  if (typeof manualMarks !== "undefined") manualMarks.forEach(m => { const it = byId.get(m.itemId); if (it) out.add(keyOf(it)); });
  return out;
}

function currentListFilters() {
  const weeks = document.getElementById("filterWeeks").value;
  return {
    areas: getSelectedValues("filterArea"), activities: getSelectedValues("filterActivity"), types: getSelectedValues("filterType"),
    contractors: getSelectedValues("filterContractor"), statuses: getSelectedValues("filterStatus"), sources: getSelectedValues("filterSource"),
    weekLimit: weeks ? new Date(Date.now() + Number(weeks) * 7 * 86400000) : null
  };
}
function matchesListFilters(it, f) {
  if (f.areas.length && !f.areas.includes(it.area)) return false;
  if (f.activities.length && !f.activities.includes(it.activity)) return false;
  if (f.types && f.types.length && !f.types.includes(it.elementType)) return false;
  if (f.contractors.length && !f.contractors.includes(it.contractor)) return false;
  if (f.statuses.length && !f.statuses.includes(it.status)) return false;
  if (f.sources && f.sources.length && !f.sources.some(s => matchesSource(it, s))) return false;
  if (f.weekLimit && it.startDate && new Date(it.startDate) > f.weekLimit) return false;
  return true;
}

function getVisibleItems() {
  const term = (document.getElementById("itemSearch").value || "").toLowerCase().trim();
  const hideCompleted = document.getElementById("hideCompleted").checked;
  const showOnlyCompleted = document.getElementById("showOnlyCompleted").checked;
  const todayOnly = document.getElementById("todayOnly").checked;
  const uncoupledOnly = document.getElementById("uncoupledOnly").checked;
  const todayStr = new Date().toISOString().slice(0, 10);
  const coupled = uncoupledOnly ? coupledActivityKeys() : null;
  // Samma filter (Område/Aktivitet/Entreprenör/Status/Startar inom) styr
  // både listan och "Visa filtrerat i 3D" (UI-översynen 2026-09-30).
  const f = currentListFilters();
  return items.filter(it => {
    if (!matchesListFilters(it, f)) return false;
    if (hideCompleted && it.status === "klar") return false;
    if (showOnlyCompleted && it.status !== "klar") return false;
    if (todayOnly && !isActiveToday(it, todayStr)) return false;
    if (coupled && coupled.has(activityKeyOf(it) || `i:${it.id}`)) return false;
    if (!term) return true;
    const haystack = [it.objectName, it.elementType, it.area, it.activity, it.contractor, it.objectId]
      .filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(term);
  });
}

function renderItemList() {
  searchTerm = (document.getElementById("itemSearch").value || "").toLowerCase().trim();
  const groupBy = document.getElementById("groupBy").value;
  const sortBy = document.getElementById("sortBy").value;

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
  const editSelectedCountEl = document.getElementById("editSelectedCount");
  if (editSelectedCountEl) editSelectedCountEl.innerText = selectedItemKeys.size;
  const btnEditSelected = document.getElementById("btnEditSelected");
  if (btnEditSelected) btnEditSelected.disabled = selectedItemKeys.size === 0;
  const btnShowLabels = document.getElementById("btnShowLabels");
  if (btnShowLabels) btnShowLabels.disabled = selectedItemKeys.size === 0;

  const el = document.getElementById("itemList");
  const statusColor = { ...DEFAULT_STATUS_COLORS, ...(settings.statusColors || {}) };
  const statusLabel = STATUS_LABELS;
  const todayStr = new Date().toISOString().slice(0, 10);
  const warningDays = settings.warningDaysBeforeEnd || 0;

  if (visible.length === 0) {
    el.innerHTML = `<div class="hint">Inga objekt ${searchTerm ? "matchar sökningen" : "sparade ännu"}.</div>`;
    return;
  }

  const byName = (a, b) =>
    (a.objectName || a.objectId || "").localeCompare(b.objectName || b.objectId || "", "sv");
  // Startdatum: tidigast först, poster utan startdatum sist, lika datum i A-Ö-ordning.
  // En aktivitet med flera objekt hamnar där dess tidigaste objekt ligger
  // (activityListSequence placerar aktiviteten vid första förekomsten).
  const byStart = (a, b) => {
    const sa = a.startDate || "", sb = b.startDate || "";
    if (sa !== sb) return !sa ? 1 : !sb ? -1 : sa < sb ? -1 : 1;
    return byName(a, b);
  };
  // Typ: t.ex. alla Fundament, sedan Kontrefor … – inom samma typ A-Ö. Utan typ sist.
  const byType = (a, b) => {
    const ta = a.elementType || "", tb = b.elementType || "";
    if (ta !== tb) return !ta ? 1 : !tb ? -1 : ta.localeCompare(tb, "sv");
    return byName(a, b);
  };
  const sortFn = sortBy === "start" ? byStart : sortBy === "alpha" ? byName : sortBy === "type" ? byType : null;

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
      if (sortFn) groupItems.sort(sortFn);
      return { key: `${groupBy}::${title}`, title, items: groupItems };
    });
  } else {
    groups = [{ key: null, title: null, items: sortFn ? [...visible].sort(sortFn) : visible }];
  }

  let html = "";
  const indexToItem = [];
  const rowMeta = []; // per rad: { rep, member, members, expanded } - se activityListSequence

  groups.forEach(group => {
    if (group.key) {
      const collapsed = collapsedGroups.has(group.key);
      html += `
        <div class="group-header" data-group-key="${escapeHtml(group.key)}">
          <span class="group-toggle" data-action="toggle-group" title="${collapsed ? "Expandera gruppen" : "Minimera gruppen"}">${collapsed ? "▶" : "▼"}</span>
          <span class="group-title" data-action="toggle-group">${escapeHtml(group.title)} (${activityListSequence(group.items).filter(e => !e.member).length})</span>
          ${RENAME_FIELD_LABELS[groupBy] && group.items.some(it => (it[groupBy] || "") === group.title) ? `<button class="group-rename" data-action="rename-group" title="Byt namn på ${RENAME_FIELD_LABELS[groupBy].toLowerCase()}t &quot;${escapeHtml(group.title)}&quot; – alla aktiviteter i gruppen får det nya namnet">${icon("edit")}</button>` : ""}
          <button class="group-select-all" data-action="select-group" title="Markera alla objekt i gruppen i 3D-vyn. Ctrl/Cmd-klick = lägg till flera grupper i samma markering.">Markera gruppen</button>
        </div>`;
      if (collapsed) return;
    }
    activityListSequence(group.items).forEach(entry => {
      const it = entry.it;
      const idx = indexToItem.length;
      indexToItem.push(it);
      rowMeta.push(entry);
      const isSelected = entry.rep && !entry.expanded
        ? entry.members.some(m => selectedItemKeys.has(m.objectId))
        : selectedItemKeys.has(it.objectId);
      const progress = activityProgressOf(it);
      const commentCount = commentCounts.get(it.id) || 0;
      const commentBadge = commentCount > 0 ? `<span class="comment-count">${commentCount}</span>` : "";
      const commentTitle = commentCount > 0 ? `Kommentarer (${commentCount})` : "Kommentarer";
      // Beräknad fas/avvikelse (skiljer sig från den manuella statusbadgen
      // till höger) - visar t.ex. "3 dagar kvar" eller "2 dagar försenad",
      // baserat på dagens datum, inte tidslinjeslidern. Se computeItemPhase().
      const phase = computeItemPhase(it, todayStr, warningDays);
      const deviationLabel = phase ? computeDeviationLabel(it, phase, todayStr) : null;
      const phaseTagHtml = deviationLabel
        ? `<br/><span class="phase-tag" style="color:${statusColor[phase] || "#999"}"><i class="dot" style="background:${statusColor[phase] || "#999"}"></i>${escapeHtml(deviationLabel)}</span>`
        : "";
      const sibCount = siblingsOf(it).length;
      let dependencyTagHtml = entry.member ? "" : dependencyStatusHtml(it);
      if (entry.rep) {
        dependencyTagHtml += `<br/><button type="button" class="group-tag group-toggle-btn" data-action="toggle-members" title="${entry.expanded ? "Dölj objekten" : "Visa objekten och deras delaktiviteter"}">${entry.members.length} objekt ${entry.expanded ? "▾" : "▸"}</button>`;
      } else if (sibCount && !entry.member) {
        dependencyTagHtml += `<br/><span class="group-tag" title="Aktiviteten är kopplad till ${sibCount + 1} objekt i 3D">${sibCount + 1} objekt i aktiviteten</span>`;
      }
      if (!entry.member && typeof subToggleHtml === "function") dependencyTagHtml += subToggleHtml(entry);
      if (entry.member) {
        const subs = activitiesByItemId.get(it.id) || [];
        html += `
        <div class="item-row group-member${isSelected ? " selected" : ""}${it._saveError ? " save-error" : ""}" data-index="${idx}" data-item-id="${escapeHtml(it.id)}">
          <div class="item-row-top">
            <span class="item-main" data-action="select" title="Klicka för att markera objektet i 3D">
              <span class="item-name">↳ ${escapeHtml(memberLabel(it, entry.members))}</span>${it._pending ? '<span class="save-pending-tag">Sparar...</span>' : ""}${it._saveError ? `<span class="save-error-tag" title="${escapeHtml(it._saveError)}">Kunde inte spara</span>` : ""}<br/>
              <span class="item-sub">${subs.length ? escapeHtml(subs.map(r => r.name).filter(Boolean).join(", ")) : "Hela aktiviteten"}</span><br/>
              <span class="item-dates">${escapeHtml(formatDateRange(it))}</span>
            </span>
            <button class="comment-btn" data-action="comments" title="${commentTitle}">${icon("comment")}${commentBadge}</button>
            <button class="edit-btn" data-action="edit" title="Redigera bara det här objektet">${icon("edit")}</button>
            <button class="delete-btn" data-action="delete" title="Ta bort det här objektet ur aktiviteten (aktiviteten finns kvar)">${icon("cut")}</button>
          </div>
        </div>`;
        return;
      }
      const shownDates = entry.rep ? formatDateRange(groupSpan(entry.members)) : formatDateRange(it);
      html += `
        <div class="item-row${entry.rep ? " group-rep" : ""}${isSelected ? " selected" : ""}${it._saveError ? " save-error" : ""}${it.id === flashEditId && Date.now() < flashEditUntil ? " flash-edit" : ""}" data-index="${idx}" data-item-id="${escapeHtml(it.id)}"${activityKeyOf(it) ? ` data-activity-key="${escapeHtml(activityKeyOf(it))}"` : ""}>
          <div class="item-row-top">
            <span class="item-main" data-action="select" title="Klicka för att markera. Ctrl/Cmd = lägg till, Shift = markera intervall.">
              <span class="item-name">${escapeHtml(it.objectName || it.objectId)}</span>${it.elementType ? `<span class="type-tag" title="Typ">${escapeHtml(it.elementType)}</span>` : ""}${it.temporary === true ? `<span class="temp-tag" title="Temporär: syns i 3D bara ${escapeHtml(formatDateRange(it))}">⏱ Temporär</span>` : ""}${it._pending ? '<span class="save-pending-tag">Sparar...</span>' : ""}${it._saveError ? `<span class="save-error-tag" title="${escapeHtml(it._saveError)}">Kunde inte spara</span>` : ""}${it._notInModel ? '<span class="not-in-model-tag" title="Hittades inte i den just nu inlästa 3D-modellen - kan vara en äldre modellversion">Ej i modellen</span>' : ""}${typeof manualMarkTagHtml === "function" && manualMarkTagHtml(it) ? manualMarkTagHtml(it) : (entry.rep ? !entry.members.some(m => m.modelId) : !it.modelId) ? (it.origin === "manuell" ? '<span class="uncoupled-tag" title="Egen aktivitet (skapad i appen), ännu inte kopplad – koppla med eller låt den vara okopplad">◇ Ej kopplad</span>' : '<span class="uncoupled-tag" title="Importerad från Excel men ännu inte kopplad till ett 3D-objekt - använd \'Koppla till markering\'">◇ Ej kopplad</span>') : ""}<br/>
              ${activitySubLineHtml(entry)}
              <span class="item-dates">${escapeHtml(shownDates)} · Framdrift ${progress}%</span>${phaseTagHtml}${dependencyTagHtml}
            </span>
            <span class="badge badge-clickable" data-action="status" title="Klicka för att ändra status" style="background:${statusColor[it.status] || "#999"};color:${contrastTextColor(statusColor[it.status] || "#999999")}">${statusLabel[it.status] || it.status} ▾</span>
            ${commentCount > 0 ? `<button class="comment-btn" data-action="comments-badge" title="${commentTitle}">${icon("comment")}${commentBadge}</button>` : ""}
            <button class="couple-btn" data-action="couple" title="${it.modelId ? "Koppla fler 3D-objekt till samma aktivitet" : "Koppla ett eller flera 3D-objekt till den här posten"} - klicka objekten i 3D och tryck Spara">${icon("link")}</button>
            <button class="edit-btn" data-action="edit" title="Redigera">${icon("edit")}</button>
            <span class="row-menu-wrap">
              <button class="row-menu-btn" data-action="row-menu" title="Fler åtgärder">⋯</button>
              <span class="row-menu hidden">
                <button class="comment-btn" data-action="comments">Kommentarer${commentCount ? ` (${commentCount})` : ""}</button>
                ${(entry.rep ? entry.members : [it, ...siblingsOf(it)]).some(m => m.modelId) ? `<button class="remove-btn" data-action="remove-objs" title="Aktiviteten finns kvar">Ta bort objekt ur aktiviteten…</button>` : ""}
                <button class="delete-btn" data-action="delete" title="Frågar två gånger, säkerhetskopia tas först">Radera aktiviteten…</button>
              </span>
            </span>
          </div>
          ${typeof progressSliderHtml === "function" ? progressSliderHtml(progress) : `<div class="progress-track" title="Framdrift: ${progress}%"><div class="progress-fill" style="width:${progress}%"></div></div>`}
        </div>`;
      if (typeof subRowsHtml === "function") html += subRowsHtml(entry, idx);
    });
  });

  el.innerHTML = html;

  Array.from(el.querySelectorAll(".item-row")).forEach(row => {
    const it = indexToItem[Number(row.dataset.index)];
    const meta = rowMeta[Number(row.dataset.index)] || {};

    row.querySelector('[data-action="select"]').onclick = (ev) => {
      // Manuella markeringar: kameran till markeringen (även för ej kopplade aktiviteter).
      // Manuella markeringar: zooma dit som till ett kopplat objekt. Har
      // aktiviteten även 3D-objekt zoomas det som vanligt till objekten (två
      // kameraflyttar samtidigt gav ryckig kamera) och markeringen blinkar.
      if (typeof marksForItem === "function" && marksForItem(it).length && !ev.ctrlKey && !ev.metaKey && !ev.shiftKey) {
        const fam = meta.rep ? meta.members : [it, ...siblingsOf(it)];
        if (fam.some(m => m.modelId && m.objectId)) { if (typeof flashMarks === "function") { if (!marksShown()) setMarksShown(true); flashMarks(marksForItem(it)); } }
        else jumpToMarks(it);
      }
      return (meta.rep && !meta.expanded)
        ? onActivityRowClicked(meta.members, ev)
        : onItemRowClicked(it, ev, indexToItem);
    };
    row.querySelector('[data-action="comments"]').onclick = () => { closeRowMenus(); openCommentsDialog(it); };
    const cBadge = row.querySelector('[data-action="comments-badge"]');
    if (cBadge) cBadge.onclick = (ev) => { ev.stopPropagation(); openCommentsDialog(it); };
    const menuBtn = row.querySelector('[data-action="row-menu"]');
    if (menuBtn) menuBtn.onclick = (ev) => { ev.stopPropagation(); toggleRowMenu(row); };
    row.querySelector('[data-action="edit"]').onclick = () => editItemFromList(it, { single: Boolean(meta.member) });
    row.querySelector('[data-action="delete"]').onclick = () => (closeRowMenus(), meta.member)
      ? removeObjectsFromActivity(it, [it])
      : deleteActivityConfirmed(it);
    const removeBtn = row.querySelector('[data-action="remove-objs"]');
    if (removeBtn) removeBtn.onclick = (ev) => { ev.stopPropagation(); closeRowMenus(); openRemoveObjectsDialog(it); };

    const statusBadge = row.querySelector('[data-action="status"]');
    if (statusBadge) statusBadge.onclick = (ev) => { ev.stopPropagation(); openStatusMenu(statusBadge, meta.rep ? meta.members : [it]); };
    const membersBtn = row.querySelector('[data-action="toggle-members"]');
    if (membersBtn) membersBtn.onclick = (ev) => {
      ev.stopPropagation();
      const k = activityKeyOf(it);
      if (expandedActivities.has(k)) expandedActivities.delete(k);
      else { expandedActivities.add(k); fetchModelObjectNames(meta.members).then(renderItemList); }
      renderItemList();
    };
    const coupleBtn = row.querySelector('[data-action="couple"]');
    if (coupleBtn) coupleBtn.onclick = (ev) => { ev.stopPropagation(); if (typeof pendingCoupleSub !== "undefined") pendingCoupleSub = null; armCoupleMode(it); };
    if (typeof bindSubRows === "function" && !meta.member) bindSubRows(el, row, meta);
    const marksTag = row.querySelector('[data-action="marks"]');
    if (marksTag) {
      marksTag.onclick = (ev) => { ev.stopPropagation(); jumpToMarks(it); };
      marksTag.oncontextmenu = (ev) => { ev.preventDefault(); ev.stopPropagation(); deleteMarksFor(it); };
    }
    if (typeof bindProgressSlider === "function" && !meta.member) bindProgressSlider(row, meta.rep ? meta.members : [it], activityProgressOf(it));
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
    const renameBtn = headerEl.querySelector('[data-action="rename-group"]');
    if (renameBtn) renameBtn.onclick = (ev) => { ev.stopPropagation(); openRenameFor(document.getElementById("groupBy").value, group.title); };
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
  // Aktiviteter utan 3D-objekt (t.ex. bara en manuell markering): radens
  // klick zoomar redan till markeringen – försök inte markera objekt som
  // inte finns (det gav en felruta som avbröt zoomen).
  if (selectedItems.length > 0 && !selectedItems.some(x => x.modelId && x.objectId)) {
    if (!(typeof marksForItem === "function" && selectedItems.some(x => marksForItem(x).length))) notCoupledHint();
    return;
  }
  if (selectedItems.length > 0) {
    selectItemsInModel(selectedItems)
      .then(({ missing }) => { markMissingInModel(missing); renderItemList(); })
      .catch(e => alert("Kunde inte markera objektet/objekten i 3D-vyn: " + e.message));
  }
}

/* ---------------------------------------------------------------------
   Kommentarer på ett planerat objekt (med svar, ungefär som i Excel)
   ------------------------------------------------------------------- */

/** Öppnas via -knappen på en rad i "Planerade objekt". */
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
        <button class="comment-delete-btn" data-action="delete" data-id="${c.id}" title="Ta bort kommentaren">Ta bort</button>
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
  const labelsStatusEl = document.getElementById("labelsStatus");
  if (labelsStatusEl) labelsStatusEl.textContent = "";
  if (linked.length === 0) {
    alert("Inga rader är markerade. Håll in Ctrl (Cmd på Mac) eller Shift och klicka på flera rader i \"Planerade objekt\" för att välja vilka som ska få etiketter i 3D-vyn.");
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
    // Varje modell hanteras för sig, med convertToRuntimeIdsSafe (samma
    // hjälpfunktion som markering/3D-färgsättning använder) istället för
    // ett direkt anrop till convertToObjectRuntimeIds - annars kastar
    // Trimble Connect ett fel för HELA anropet så fort en enda modell i
    // markeringen inte är inläst just nu, och inga etiketter alls skapas
    // (även för objekt i modeller som faktiskt ÄR öppna). Se Victors
    // rapport 2026-09-16: markerar man objekt i flera modeller där bara
    // en är aktiv i TC ska den aktiva ändå få sina etiketter.
    for (const modelId of Object.keys(byModel)) {
      const groupItems = byModel[modelId];
      const externalIds = groupItems.map(it => it.objectId);
      let results;
      try {
        results = await convertToRuntimeIdsSafe(modelId, externalIds);
      } catch (e) {
        console.error(`Kunde inte konvertera objekt-ID:n för modell ${modelId} (troligen inte inläst just nu):`, e);
        continue;
      }

      const validPairs = groupItems
        .map((it, i) => ({ it, runtimeId: results[i] && results[i].runtimeId }))
        .filter(p => p.runtimeId !== undefined && p.runtimeId !== null);

      if (validPairs.length === 0) continue;

      let boxes;
      try {
        boxes = await API.viewer.getObjectBoundingBoxes(modelId, validPairs.map(p => p.runtimeId));
      } catch (e) {
        console.error(`Kunde inte hämta bounding boxes för modell ${modelId}:`, e);
        continue;
      }
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

    // Icke-blockerande statusrad istället för en avbrytande alert när bara
    // en DEL av markeringen fick etiketter (t.ex. för att vissa objekt hör
    // till en modell som inte är öppen i TC just nu) - resten skapades ju
    // ändå.
    if (labelsStatusEl) {
      labelsStatusEl.textContent = newMarkups.length < linked.length
        ? `${newMarkups.length} av ${linked.length} etiketter skapade – resten hörde till en modell som inte är inläst i Trimble Connect just nu.`
        : "";
    }
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
    el.innerText = "Ingen databas ansluten – öppna inställningarna (kugghjulet) och ange GitHub-token. Se GITHUB_TOKEN_SETUP.md.";
  }
}

/* ---------------------------------------------------------------------
   Säkerhetskopior, revisionshistorik och nollställning (Victors förfrågan
   2026-09-28). En säkerhetskopia är EN fil med innehållet i alla
   projektets datafiler vid ett visst tillfälle:
     projects/<id>/backups/<tidsstämpel>-<id>.json
   och en förteckning i projects/<id>/backups/index.json. Tas automatiskt
   före varje import av 4-veckorsplaneringen och före nollställning/
   återställning, och manuellt via Inställningar.
   ------------------------------------------------------------------- */
const BACKUP_FILES = [
  "plan_items", "plan_item_activities", "plan_item_comments", "plan_item_progress_history",
  "plan_item_baseline_history", "plan_item_positions", "status_plans", "site_layers",
  "plan_blockers", "plan_blocker_comments", "plan_milestones", "plan_deliveries",
  "plan_document_deliveries", "plan_inspections", "plan_safety_events", "plan_staffing", "plan_baseline", "plan_baselines"
];
// Det som nollställs (planeringen och allt som hänger på planeringsposternas id).
const RESET_FILES = ["plan_items", "plan_item_activities", "plan_item_comments", "plan_item_progress_history", "plan_item_baseline_history", "plan_item_positions", "plan_baseline", "plan_baselines", "plan_baseline_undo"];
const projectFilePath = name => RESET_FILES.includes(name) ? `${planDir()}/${name}.json` : `projects/${encodeURIComponent(projectId)}/${name}.json`;
const backupIndexPath = () => `${planDir()}/backups/index.json`;

async function createBackup(reason) {
  if (!isBackendConfigured()) throw new Error("Ingen databas ansluten.");
  const files = {};
  for (const name of BACKUP_FILES) {
    const { data } = await ghGetFile(settings.githubToken, projectFilePath(name));
    if (data !== null) files[name] = data;
  }
  const now = new Date();
  const id = ghNewId();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const path = `${planDir()}/backups/${stamp}-${id.slice(0, 8)}.json`;
  const counts = {
    items: Array.isArray(files.plan_items) ? files.plan_items.length : 0,
    coupled: Array.isArray(files.plan_items) ? files.plan_items.filter(r => r.model_id).length : 0,
    activities: Array.isArray(files.plan_item_activities) ? files.plan_item_activities.length : 0,
    comments: Array.isArray(files.plan_item_comments) ? files.plan_item_comments.length : 0
  };
  const record = { id, created_at: now.toISOString(), reason, by: settings.userName || null, counts, files };
  await ghPutFile(settings.githubToken, path, ghUtf8ToB64(JSON.stringify(record)), null, `Säkerhetskopia: ${reason}`);
  await ghWriteJSON(settings.githubToken, backupIndexPath(),
    arr => [...arr, { id, path, created_at: record.created_at, reason, by: record.by, counts }],
    `Säkerhetskopia: ${reason}`);
  return record;
}

async function renderBackupList() {
  const el = document.getElementById("backupList");
  if (!el) return;
  if (!isBackendConfigured()) { el.innerHTML = `<div class="hint" style="padding:6px">Ingen databas ansluten.</div>`; return; }
  let list = [];
  try { list = await ghReadJSON(settings.githubToken, backupIndexPath()); }
  catch (e) { el.innerHTML = `<div class="hint" style="padding:6px">Kunde inte läsa historiken: ${escapeHtml(e.message)}</div>`; return; }
  if (!list.length) { el.innerHTML = `<div class="hint" style="padding:6px">Inga säkerhetskopior ännu – en tas automatiskt vid nästa import.</div>`; return; }
  list = list.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  el.innerHTML = list.map(b => {
    const d = new Date(b.created_at);
    const when = `${d.toLocaleDateString("sv-SE")} ${d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}`;
    const c = b.counts || {};
    return `<div class="backup-row">
      <div class="b-main"><b title="${escapeHtml(b.reason || "")}">${escapeHtml(b.reason || "Säkerhetskopia")}</b>
        <span class="b-meta">${escapeHtml(when)}${b.by ? " · " + escapeHtml(b.by) : ""} · ${c.items || 0} objekt (${c.coupled || 0} kopplade), ${c.activities || 0} delakt.</span></div>
      <button data-action="download-backup" data-path="${escapeHtml(b.path)}" title="Ladda ner som JSON">⤓</button>
      <button data-action="restore-backup" data-path="${escapeHtml(b.path)}" data-when="${escapeHtml(when)}" title="Återställ till det här läget">↩ Återställ</button>
    </div>`;
  }).join("");
  el.querySelectorAll('[data-action="download-backup"]').forEach(btn => {
    btn.onclick = async () => {
      try {
        const { data } = await ghGetFile(settings.githubToken, btn.dataset.path);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
        a.download = btn.dataset.path.split("/").pop();
        document.body.appendChild(a); a.click(); a.remove();
      } catch (e) { alert("Kunde inte hämta säkerhetskopian: " + e.message); }
    };
  });
  el.querySelectorAll('[data-action="restore-backup"]').forEach(btn => {
    btn.onclick = () => restoreBackup(btn.dataset.path, btn.dataset.when);
  });
}

async function restoreBackup(path, when) {
  if (!confirm(`Återställa projektets data till läget ${when}?\n\nAllt som gjorts efter det (kopplingar, ändringar, kommentarer) ersätts. En säkerhetskopia av nuvarande läge tas först, så det går att ångra.`)) return;
  if (!confirm("Är du helt säker? Klicka OK för att återställa.")) return;
  try {
    const { data } = await ghGetFile(settings.githubToken, path);
    if (!data || !data.files) throw new Error("Säkerhetskopian saknar data.");
    await createBackup(`Före återställning till ${when}`);
    for (const [name, content] of Object.entries(data.files)) {
      await ghWriteJSON(settings.githubToken, projectFilePath(name), () => content, `Återställ ${name} till ${when}`);
    }
    alert(`Återställt till ${when}.`);
    await refreshAllData();
    renderBackupList();
  } catch (e) {
    alert("Kunde inte återställa: " + e.message);
  }
}

async function onResetPlanning() {
  if (!isBackendConfigured()) { alert("Ingen databas ansluten."); return; }
  if (!confirm(`Nollställa HELA planeringen i det här projektet?\n\n${items.length} planerade objekt med alla 3D-kopplingar, delaktiviteter, kommentarer, beroenden och historik tas bort. Lägesplanens planer och lager rörs inte.\n\nEn säkerhetskopia tas först.`)) return;
  const typed = prompt('Bekräfta genom att skriva NOLLSTÄLL (versaler):');
  if ((typed || "").trim() !== "NOLLSTÄLL") { alert("Inget nollställdes."); return; }
  const btn = document.getElementById("btnResetPlanning");
  btn.disabled = true;
  try {
    await createBackup("Före nollställning av planeringen");
    for (const name of RESET_FILES) {
      await ghWriteJSON(settings.githubToken, projectFilePath(name), () => [], `Nollställ ${name}`);
    }
    selectedItemKeys = new Set();
    await refreshAllData();
    renderBackupList();
    alert("Planeringen är nollställd. Säkerhetskopian finns under Säkerhetskopior och historik.");
  } catch (e) {
    alert("Kunde inte nollställa: " + e.message);
  } finally {
    btn.disabled = false;
  }
}

/* ---------------------------------------------------------------------
   Statusgenväg: klick på statusbadgen i listan -> välj ny status.
   ------------------------------------------------------------------- */
function openStatusMenu(anchor, targets) {
  document.querySelectorAll(".status-menu").forEach(m => m.remove());
  const statusColor = { ...DEFAULT_STATUS_COLORS, ...(settings.statusColors || {}) };
  const cur = targets[0].status;
  const menu = document.createElement("div");
  menu.className = "status-menu";
  menu.innerHTML = Object.entries(STATUS_LABELS).map(([k, label]) =>
    `<button type="button" data-status="${k}" class="${k === cur ? "current" : ""}"><i style="background:${statusColor[k] || "#999"}"></i>${escapeHtml(label)}${k === cur ? " ✓" : ""}</button>`).join("") +
    (targets.length > 1 ? `<div class="hint" style="padding:3px 8px">Gäller alla ${targets.length} objekt</div>` : "");
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  menu.style.left = `${Math.min(window.innerWidth - menu.offsetWidth - 6, Math.max(6, r.right - menu.offsetWidth))}px`;
  menu.style.top = `${r.bottom + 4 + menu.offsetHeight > window.innerHeight ? Math.max(6, r.top - menu.offsetHeight - 4) : r.bottom + 4}px`;
  const close = () => { menu.remove(); document.removeEventListener("mousedown", outside, true); };
  const outside = e => { if (!menu.contains(e.target)) close(); };
  setTimeout(() => document.addEventListener("mousedown", outside, true));
  menu.querySelectorAll("[data-status]").forEach(btn => {
    btn.onclick = () => { close(); setStatusQuick(targets, btn.dataset.status); };
  });
}

function setStatusQuick(targets, status) {
  if (targets.every(t => t.status === status)) return;
  const records = targets.map(t => ({ ...t, status }));
  applyOptimisticRecords(records);
  renderItemList();
  const jobId = ++saveJobCounter;
  const label = `Status → ${STATUS_LABELS[status] || status} (${records.length === 1 ? (records[0].objectName || records[0].objectId) : records.length + " objekt"})`;
  saveJobs.set(jobId, { id: jobId, records, label, status: "pending", error: null });
  runSaveJob(jobId);
  if (typeof applyStatusColors === "function") applyStatusColors();
}

/* ---------------------------------------------------------------------
   Tänd (läs in) alla modeller som har objekt kopplade i planeringen.
   ------------------------------------------------------------------- */
async function loadCoupledModels() {
  const btn = document.getElementById("btnLoadCoupledModels");
  const modelIds = [...new Set(items.map(it => it.modelId).filter(Boolean))];
  if (!modelIds.length && !(typeof manualMarks !== "undefined" && manualMarks.length)) { alert("Inga objekt är kopplade till någon modell ännu."); return; }
  btn.disabled = true;
  const old = btn.innerText;
  btn.innerText = "Tänder…";
  try {
    let specs = [];
    try { specs = await API.viewer.getModels(); } catch (e) { /* okänd lista - försök ändå */ }
    const byId = new Map();
    (specs || []).forEach(m => { byId.set(m.id, m); if (m.versionId) byId.set(m.versionId, m); });
    let loaded = 0, already = 0;
    const failed = [];
    for (const id of modelIds) {
      const spec = byId.get(id);
      if (spec && spec.state === "loaded") { already++; continue; }
      try { await API.viewer.toggleModel(spec ? spec.id : id, true, false); loaded++; }
      catch (e) { failed.push(spec ? spec.name : id); }
    }
    const nMarks = typeof manualMarks !== "undefined" ? manualMarks.length : 0;
    if (nMarks && typeof setMarksShown === "function") setMarksShown(true);
    showLagesplanBanner(`${loaded} modeller tända${already ? `, ${already} var redan tända` : ""}${nMarks ? `, ${nMarks} manuella markeringar visas` : ""}${failed.length ? ` – ${failed.length} hittades inte (öppna mappen i Trimble Connect och försök igen)` : ""}.`, 7000);
  } finally {
    btn.disabled = false;
    btn.innerText = old;
  }
}

function itemsPath() {
  return `${planDir()}/plan_items.json`;
}
/* Importloggen (Victors önskemål 2026-10-02): vilka flikar och aktiviteter
   (source_key) som fanns i varje 4-veckorsimport – så att filtret "Inte
   kvar i senaste importen" vet vad som har försvunnit ur Excel. */
function importsPath() {
  return `${planDir()}/plan_imports.json`;
}
/* Vad baseline-datumen (baseline_start_date/baseline_end_date) kommer från – en rad per gång den
   sattes, den sista gäller: { mode, label, file, set_at, by }. Visas i 4D-dashboarden. */
function baselineMetaPath() {
  return `${planDir()}/plan_baseline.json`;
}
/* Namngivna baselines (huvudbaselinen "main" + t.ex. revisioner): [{ id, name, source, mode, set_at, … }].
   Datumen ligger på raderna: main i baseline_start_date/baseline_end_date, övriga i baselines[id]. */
function baselineRegistryPath() {
  return `${planDir()}/plan_baselines.json`;
}
let lastPlanImport = null; // { id, at, file, sheets: [...], keys: [...] }
const sheetOfSourceKey = k => String(k || "").split("||")[0];
/* Importerad aktivitet från en flik som fanns i senaste importen, men som
   inte längre fanns med i filen. Aktiviteter skapade i TC räknas inte. */
function isGoneFromLastImport(it) {
  if (!it.sourceKey || !lastPlanImport) return false;
  if (!lastPlanImport._keys) { lastPlanImport._keys = new Set(lastPlanImport.keys || []); lastPlanImport._sheets = new Set(lastPlanImport.sheets || []); }
  return lastPlanImport._sheets.has(sheetOfSourceKey(it.sourceKey)) && !lastPlanImport._keys.has(it.sourceKey);
}
const matchesSource = (it, s) => s === "gone" ? isGoneFromLastImport(it) : itemSourceOf(it) === s;
async function loadLastPlanImport(opts = {}) {
  try { const log = await ghReadJSON(settings.githubToken, importsPath(), opts); lastPlanImport = Array.isArray(log) && log.length ? log[log.length - 1] : null; }
  catch (e) { lastPlanImport = null; }
}
function commentsPath() {
  return `${planDir()}/plan_item_comments.json`;
}
function progressHistoryPath() {
  return `${planDir()}/plan_item_progress_history.json`;
}
function baselineHistoryPath() {
  return `${planDir()}/plan_item_baseline_history.json`;
}
function activitiesPath() {
  return `${planDir()}/plan_item_activities.json`;
}

function toRow(it) {
  return {
    id: it.id || ghNewId(),
    project_id: it.projectId,
    model_id: it.modelId || null,
    object_id: String(it.objectId),
    object_name: it.objectName || null,
    // Typ (t.ex. "Fundament", "Kontrefor") – från 4-veckorsplaneringens huvudrad
    // ("E14 - Fundament") eller ifylld i formuläret. Går att sortera/gruppera på.
    element_type: it.elementType || null,
    area: it.area || null,
    activity: it.activity || null,
    contractor: it.contractor || null,
    status: it.status || "planerad",
    start_date: it.startDate || null,
    end_date: it.endDate || null,
    actual_start_date: it.actualStartDate || null,
    actual_end_date: it.actualEndDate || null,
    progress: Number.isFinite(it.progress) ? Math.max(0, Math.min(100, Math.round(it.progress))) : 0,
    estimated_hours: Number.isFinite(it.estimatedHours) ? it.estimatedHours : null,
    // Beroenden: id:n för andra plan_items-poster som måste vara klara
    // innan detta objekt kan starta (Victors förfrågan 2026-09-21). Rena
    // strängar (ghNewId()-UUID:er), aldrig objekt - se dependencyPickerRows
    // /buildLinkPayloadFromForm.
    depends_on: Array.isArray(it.dependsOn) ? [...new Set(it.dependsOn.filter(Boolean).map(String))] : [],
    // Glapp per koppling (sätts i 4D-dashboardens Gantt, Victor 2026-10-07): { föregångarens id: dagar }.
    // Bara de som hör till en koppling som finns kvar; undefined tar bort fältet. Saknas depLags (posten
    // är inte inläst från filen) skrivs inget – då behålls filens glapp vid sparningen.
    ...(it.depLags ? { dep_lags: depLagsFor(it.depLags, it.dependsOn) } : {}),
    // Sätts bara på objekt som kommer från "4-veckorsplanering"-importen
    // (se plan-excel-parser.js/commitPlanImport) - en radnummer-oberoende
    // nyckel (flik+rubrik+elementkod/aktivitetstext) som gör att en ny
    // import av samma Excel-fil känner igen samma objekt igen (och därmed
    // kan uppdatera datum/framdrift utan att röra 3D-kopplingen), även om
    // rader lagts till/tagits bort på andra ställen i filen. null för objekt
    // som kopplats på vanligt sätt (via "Koppla markering") eller importerats
    // via den äldre, generiska Excel-importen.
    source_key: it.sourceKey || null,
    // "manuell" = skapad i appen med "＋ Ny aktivitet"/"⧉ Duplicera" (inte
    // importerad). Sådana poster rörs aldrig av 4-veckorsimporten.
    origin: it.origin || null,
    ...(it.ppGuid ? { pp_guid: it.ppGuid } : {}),
    // Samma group_id = samma aktivitet kopplad till flera 3D-objekt (en rad
    // per objekt). Rader i samma grupp redigeras tillsammans, se siblingsOf.
    group_id: it.groupId || null,
    // Ursprungsplanen ("Plan. start/slut" i 4-veckorsplaneringen) - start_date/
    // end_date är de aktuella datumen man planerar efter.
    baseline_start_date: it.baselineStartDate || null,
    baseline_end_date: it.baselineEndDate || null,
    ...(it.baselines && Object.keys(it.baselines).length ? { baselines: it.baselines } : {}),
    // Resurser per aktivitet (PP-importen / dashboardens "Avancerat (resurser)"): [{ name, qty, hours, start, end }].
    ...(Array.isArray(it.resources) && it.resources.length ? { resources: it.resources } : {}),
    // Raderna i 4-veckorsplaneringen (för "Hämta framdrift från 4D" i Excel).
    excel_sheet: it.excelSheet || null,
    excel_map: Array.isArray(it.excelMap) && it.excelMap.length ? it.excelMap : null,
    // Temporär (Victor 2026-10-09, t.ex. mobilkran): syns i 3D bara mellan start och slut. Skrivs bara när
    // det är satt (true/false) – saknas fältet behålls filens värde vid sparningen.
    ...(typeof it.temporary === "boolean" ? { temporary: it.temporary } : {}),
    updated_at: new Date().toISOString()
  };
}

function depLagsFor(lags, deps) {
  const keep = new Set((deps || []).map(String));
  const out = Object.fromEntries(Object.entries(lags || {}).filter(([k, v]) => keep.has(k) && Number.isFinite(Number(v)) && v !== null && v !== ""));
  return Object.keys(out).length ? out : undefined;
}

/* Status mot dagens datum (Victor 2026-10-06: "det vi måste utgå ifrån är väl dagens datum"):
   den sparade statusen sattes vid importen eller för hand och blir inaktuell när dagarna går.
   Den visade statusen räknas därför alltid fram som fasen i dag (samma regler som 3D-färgerna,
   computeItemPhase): Klar (100 %/verkligt avslut/klarmarkerad) och Pausad står kvar; i övrigt
   slutdatum passerat = försenad, framdrift = pågående, startdatum passerat utan framdrift =
   försenad, annars planerad. storedStatus = det som står i filen. */
function liveItemStatus(item) {
  return (item.startDate && computeItemPhase(item, new Date().toISOString().slice(0, 10))) || item.status;
}
function fromRow(row) {
  const it = fromRowStored(row);
  it.storedStatus = it.status;
  it.status = liveItemStatus(it);
  return it;
}
function fromRowStored(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    modelId: row.model_id,
    objectId: row.object_id,
    objectName: row.object_name,
    elementType: row.element_type || null,
    area: row.area,
    activity: row.activity,
    contractor: row.contractor,
    status: row.status === "ej_planerad" ? "planerad" : row.status, // "Ej planerad" borttagen 2026-10-02
    startDate: row.start_date,
    endDate: row.end_date,
    actualStartDate: row.actual_start_date || null,
    actualEndDate: row.actual_end_date || null,
    progress: Number.isFinite(row.progress) ? row.progress : 0,
    estimatedHours: Number.isFinite(row.estimated_hours) ? row.estimated_hours : null,
    dependsOn: Array.isArray(row.depends_on) ? row.depends_on.map(String) : [],
    depLags: row.dep_lags && typeof row.dep_lags === "object" && !Array.isArray(row.dep_lags) ? row.dep_lags : null,
    sourceKey: row.source_key || null,
    origin: row.origin || null,
    ppGuid: row.pp_guid || null,
    groupId: row.group_id || null,
    baselineStartDate: row.baseline_start_date || null,
    baselineEndDate: row.baseline_end_date || null,
    baselines: row.baselines && typeof row.baselines === "object" && !Array.isArray(row.baselines) ? row.baselines : null,
    resources: Array.isArray(row.resources) ? row.resources : null,
    excelSheet: row.excel_sheet || null,
    excelMap: Array.isArray(row.excel_map) ? row.excel_map : null,
    temporary: typeof row.temporary === "boolean" ? row.temporary : undefined,
    updatedAt: row.updated_at
  };
}

async function refreshItems(opts = {}) {
  if (!isBackendConfigured()) {
    items = [];
    itemsTotalCount = null;
    return;
  }
  try {
    const [rows] = await Promise.all([ghReadJSON(settings.githubToken, itemsPath(), opts), loadLastPlanImport(opts)]);
    items = rows.map(fromRow);
    itemsTotalCount = items.length;
    // Ny planering skickad från Excel? (högst en gång i minuten)
    if (typeof checkExcelInbox === "function" && planSource === "excel") { renderExcelLinkHelp(); checkExcelInbox(); }
    if (typeof ppBlPanelRefresh === "function" && planSource === "pp") ppBlPanelRefresh();
    // Lyckad hämtning: ta bort en ev. kvarliggande varning från ett tidigare
    // (tillfälligt) fel, annars står den kvar fast allt fungerar.
    const warn = document.getElementById("connectionWarning");
    if (warn && /Kunde inte hämta planeringen|godkänner inte token/.test(warn.innerText)) { warn.classList.add("hidden"); warn.innerText = ""; }
  } catch (e) {
    console.error("Kunde inte hämta planeringsdata", e);
    items = [];
    itemsTotalCount = null;
    // Visa felet tydligt - annars ser en tom lista ut som att planeringen
    // försvunnit, fast datan ligger kvar orörd i 4D-data.
    const el = document.getElementById("connectionWarning");
    if (el) {
      el.classList.remove("hidden");
      el.innerText = /\b401\b/.test(e.message)
        ? "GitHub godkänner inte token:en (401) – den har troligen gått ut eller återkallats. Planeringen ligger kvar i databasen men kan inte läsas. Skapa en ny token (se GITHUB_TOKEN_SETUP.md) och ange den under ."
        : "Kunde inte hämta planeringen: " + e.message + " – datan ligger kvar i databasen. Försök igen med ↻.";
    }
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
 * Lägger till en historikrad i plan_item_baseline_history varje gång ett
 * objekts start- eller slutdatum ändras (inklusive första gången det sätts,
 * på en ny post) - Victors förfrågan 2026-09-21: "Ingen baseline - du ser
 * 'planerat vs verkligt' per objekt, men inte hur PLANEN själv har ändrats
 * över tid". Till skillnad från logProgressHistory (som bara loggar
 * NUVARANDE progress/status) loggar den här hela tidsserien av
 * start_date/end_date-par, så dashboarden kan visa "ursprungligen vecka 12,
 * flyttat till vecka 15 i mars" genom att jämföra första och sista raden per
 * plan_item_id. Körs som en del av saveItems, mot samma "före"-lista som
 * upsert-passet och logProgressHistory läser - se samma kommentar där om
 * varför det görs mot `before`/`afterRows` snarare än en egen extra läsning.
 */
async function logBaselineHistory(beforeRows, afterRows) {
  const beforeById = new Map(beforeRows.map(r => [r.id, r]));
  const toLog = [];
  afterRows.forEach(row => {
    const prev = beforeById.get(row.id);
    if (!prev || prev.start_date !== row.start_date || prev.end_date !== row.end_date) {
      toLog.push({
        id: ghNewId(),
        plan_item_id: row.id,
        project_id: row.project_id,
        start_date: row.start_date,
        end_date: row.end_date,
        recorded_at: new Date().toISOString()
      });
    }
  });
  if (toLog.length === 0) return;
  await ghWriteJSON(
    settings.githubToken,
    baselineHistoryPath(),
    (arr) => [...arr, ...toLog],
    "Logga baseline-historik"
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
  // Senast kända version (vår egen senaste sparning) – ingen extra nedladdning
  // av hela filen per sparning. Har någon annan sparat emellan läses filen om
  // vid skrivkrocken (409) och ändringen läggs ovanpå.
  const { data, sha } = await ghGetFileKnown(settings.githubToken, path);
  const before = Array.isArray(data) ? data : [];
  const beforeByKey = new Map(before.map(r => [`${r.project_id}::${r.object_id}`, r]));
  const incoming = records.map(toRow).map(row => {
    const existing = beforeByKey.get(`${row.project_id}::${row.object_id}`);
    // source_key/group_id följer inte med från t.ex. den generiska Excel-
    // importen - behåll radens befintliga istället för att nollställa dem.
    return existing
      ? { ...existing, ...row, id: existing.id, source_key: row.source_key || existing.source_key || null, group_id: row.group_id || existing.group_id || null, origin: existing.origin || row.origin || null }
      : row;
  });

  const [after] = await Promise.all([
    ghWriteJSON(
      settings.githubToken,
      path,
      (arr) => {
        let next = arr.slice();
        incoming.forEach(row => {
          const idx = next.findIndex(r => r.project_id === row.project_id && r.object_id === row.object_id);
          // Mot filens aktuella rad (kan ha ändrats av någon annan sedan "before").
          if (idx >= 0) { const cur = next[idx]; next[idx] = { ...cur, ...row, id: cur.id, source_key: row.source_key || cur.source_key || null, group_id: row.group_id || cur.group_id || null }; }
          else next.push(row);
        });
        return next;
      },
      "Spara planeringsposter",
      6,
      { data: before, sha }
    ),
    logProgressHistory(before, incoming),
    logBaselineHistory(before, incoming)
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
    (arr) => arr
      .filter(r => (item.id ? r.id !== item.id : !(r.project_id === item.projectId && r.object_id === String(item.objectId))))
      .map(r => stripDependencyRef(r, item.id)),
    "Radera planeringspost"
  );
  if (item.id) {
    await deleteCommentsForItems([item.id]);
    await deleteActivitiesForItems([item.id]);
  }
}

/**
 * Städar bort en raderad posts id ur andra posters depends_on - motsvarar
 * FK on delete-hanteringen för kommentarer/delaktiviteter ovan, fast för
 * beroenden (annars skulle en kvarvarande post kunna peka på ett id som
 * inte längre finns, och aldrig gå att markera som "klar att starta").
 * Ingen effekt (returnerar `row` oförändrad) om raden inte har något
 * beroende till `deletedId`.
 */
function stripDependencyRef(row, deletedId) {
  if (!deletedId || !Array.isArray(row.depends_on) || !row.depends_on.includes(deletedId)) return row;
  return { ...row, depends_on: row.depends_on.filter(id => id !== deletedId) };
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

  const removedIdSet = new Set(removedIds);
  await ghWriteJSON(
    settings.githubToken,
    itemsPath(),
    (arr) => arr
      .filter(r => !keysToDelete.has(`${r.project_id}::${r.object_id}`))
      .map(r => (Array.isArray(r.depends_on) && r.depends_on.some(id => removedIdSet.has(id)))
        ? { ...r, depends_on: r.depends_on.filter(id => !removedIdSet.has(id)) }
        : r),
    "Radera flera planeringsposter"
  );
  await deleteCommentsForItems(removedIds);
  await deleteActivitiesForItems(removedIds);
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

/* ---------------------------------------------------------------------
   Delaktiviteter (plan_item_activities) – från och med 2026-09-17 sparas
   raderna man bygger upp i "Koppla markering" (se onAddSubActivity m.fl.)
   på riktigt, inte bara som en tillfällig datumräknehjälp i formuläret.
   Varje sparning ersätter ALLA delaktiviteter för det objektet i ett svep
   (radera-och-lägg-till-alla) istället för att försöka matcha ihop enskilda
   rader mot tidigare sparade poster - enklare och robust nog eftersom
   formuläret alltid visar/redigerar HELA uppsättningen på en gång (det
   finns aldrig en delvis synlig lista att synka mot). Se Victors förfrågan
   2026-09-17: "Testa att göra så att jag har alla delaktiviteterna
   sparade vilket innebär en hel del extrajobb."
   ------------------------------------------------------------------- */

/** Hämtar alla delaktiviteter för projektet och grupperar dem per plan_item_id. */
async function refreshActivities() {
  activitiesByItemId = new Map();
  if (!isBackendConfigured()) return;
  try {
    const rows = await ghReadJSON(settings.githubToken, activitiesPath());
    rows.forEach(row => {
      const list = activitiesByItemId.get(row.plan_item_id) || [];
      list.push({ name: row.name || "", start: row.start_date || "", end: row.end_date || "", hours: Number.isFinite(row.estimated_hours) ? row.estimated_hours : "", progress: Number.isFinite(row.progress) ? row.progress : null });
      activitiesByItemId.set(row.plan_item_id, list);
    });
  } catch (e) {
    console.error("Kunde inte hämta delaktiviteter", e);
  }
}

/**
 * Ersätter ALLA delaktiviteter för ett givet objekt (planItemId) med `rows`
 * ({name, start, end}). Tomma rader (varken namn, start eller slut ifyllt)
 * hoppas över. En tom `rows`-lista rensar alltså bort ev. tidigare sparade
 * delaktiviteter för objektet - det är avsiktligt (motsvarar att man tagit
 * bort alla rader i formuläret och sparat).
 */
async function saveActivitiesForItem(planItemId, projectIdVal, rows) {
  if (!isBackendConfigured()) {
    throw new Error("Ingen databas ansluten. Ange GitHub-token i inställningarna.");
  }
  const newRows = rows
    .filter(r => (r.name && r.name.trim()) || r.start || r.end || r.hours)
    .map(r => ({
      id: ghNewId(),
      plan_item_id: planItemId,
      project_id: projectIdVal,
      name: (r.name || "").trim(),
      start_date: r.start || null,
      end_date: r.end || null,
      estimated_hours: Number.isFinite(Number(r.hours)) && r.hours !== "" ? Number(r.hours) : null,
        progress: r.progress !== "" && r.progress != null && Number.isFinite(Number(r.progress)) ? Math.max(0, Math.min(100, Math.round(Number(r.progress)))) : null
    }));
  await ghWriteJSON(
    settings.githubToken,
    activitiesPath(),
    (arr) => [...arr.filter(a => a.plan_item_id !== planItemId), ...newRows],
    "Spara delaktiviteter"
  );
  activitiesByItemId.set(planItemId, newRows.map(r => ({ name: r.name, start: r.start_date || "", end: r.end_date || "", hours: Number.isFinite(r.estimated_hours) ? r.estimated_hours : "", progress: Number.isFinite(r.progress) ? r.progress : null })));
}

/** Tar bort alla delaktiviteter knutna till given lista av plan_item-ID:n (cascade-delete, precis som deleteCommentsForItems). */
async function deleteActivitiesForItems(planItemIds) {
  if (!planItemIds || planItemIds.length === 0) return;
  const idSet = new Set(planItemIds);
  await ghWriteJSON(
    settings.githubToken,
    activitiesPath(),
    (arr) => arr.filter(a => !idSet.has(a.plan_item_id)),
    "Ta bort delaktiviteter för raderade objekt"
  );
  planItemIds.forEach(id => activitiesByItemId.delete(id));
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
 * Räknar antal kommentarer per objekt (för -badgen i "Planerade objekt").
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
