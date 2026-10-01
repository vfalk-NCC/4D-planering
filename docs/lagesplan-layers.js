// ---------------------------------------------------------------------
// Lägesplan – lager (laddas efter lagesplan.js och lagesplan-tools.js)
// ---------------------------------------------------------------------
//   • Ortofoto i bakgrunden, georefererat automatiskt via världsfilen
//     (.pgw/.jgw) och modellens koordinater (samma koordinatsystem), med
//     tänd/släck och genomskinlighet. Originalen kan sparas i Trimble
//     Connect; i 4D-data sparas en översiktsbild och originalet i rutor
//     (full upplösning, hämtas bara när man zoomar in).
//   • Ritobjekten kan flyttas, ändras (handtag) och roteras efter att de
//     placerats, har egen färg/linjetyp/tjocklek och visar sina datum.
//   • Lagerpanel: ortofoto, ritningen (PDF), zoner, objekt, noteringar
//     (egna lager per namn), etablering, foton - tänd/släck och opacitet.
//   • Noteringar (callout med pil) och etablering (kran med räckvidd, bod,
//     upplag, grind, stängsel, avspärrning) placeras i modellens
//     koordinater, så de hamnar rätt på alla kalibrerade planer, och kan
//     ha en giltighetstid som följer datumreglaget.
//
// Data: projects/<id>/site_layers.json - en post per ortofoto/notering/
// etableringsobjekt ({ id, type, ... }). Bilderna ligger i
// projects/<id>/site_layers/<id>.webp. Vilka lager som visas och deras
// opacitet sparas per webbläsare (localStorage).
// ---------------------------------------------------------------------

const PAKO_URL = "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js";
const ORTHO_MAX_PX = 6144;   // längsta sida på den nedskalade bilden som sparas i 4D-data
const SITE_KINDS = {
  note:    { label: "Notering",    icon: "💬", clicks: 2 },
  crane:   { label: "Kran",        icon: "🏗", clicks: 1 },
  shed:    { label: "Bod",         icon: "🏠", clicks: 2 },
  storage: { label: "Upplag",      icon: "📦", clicks: 2 },
  gate:    { label: "Grind",       icon: "🚪", clicks: 1 },
  fence:   { label: "Stängsel",    icon: "〰", clicks: 0 },  // 0 = valfritt antal, dubbelklick avslutar
  barrier: { label: "Avspärrning", icon: "⛔", clicks: 0 },
  route:   { label: "Transportväg", icon: "➡", clicks: 0 },
  symbol:  { label: "Symbol",      icon: "🧩", clicks: 1 },
  sketch:  { label: "Frihand",     icon: "✏️", clicks: -1 }  // ritas med drag (fingret/musen), sparas per drag
};
/* Symbolbibliotek - färdiga mått (meter, bredd × längd). */
const SYMBOLS = {
  bodvagn:      { label: "Bodvagn",         icon: "🏠", w: 3, h: 8.5, color: "#1d4ed8" },
  cont20:       { label: "Container 20'",   icon: "📦", w: 2.44, h: 6.06, color: "#0f766e" },
  cont40:       { label: "Container 40'",   icon: "📦", w: 2.44, h: 12.19, color: "#0f766e" },
  toalett:      { label: "Toalett",         icon: "🚻", w: 1.2, h: 1.2, color: "#7c3aed" },
  miljostation: { label: "Miljöstation",    icon: "♻", w: 2.5, h: 6, color: "#15803d" },
  betongbil:    { label: "Betongbil",       icon: "🚚", w: 2.55, h: 10, color: "#b45309" },
  pumpbil:      { label: "Betongpump",      icon: "🚚", w: 2.55, h: 12, color: "#b45309", outrigger: 9 },
  mobilkran:    { label: "Mobilkran",       icon: "🏗", w: 2.75, h: 13, color: "#d97706", outrigger: 7.5 }
};

let siteItems = [];          // site_layers.json
let siteLoaded = false;
let layerState = {};         // per webbläsare: { key: { visible, opacity } , pdfMultiply }
let siteTool = null;         // { kind, pts: [[x,y] modell], cursor }
let selectedSiteId = null;
let siteUndo = [], siteRedo = [];   // [{ label, before: rec|null, after: rec|null }]
let siteDateOverride = null;        // [start, end] vid export per månad
let snapMark = null;                // senaste fästpunkten (PDF-koordinater) för markering
const orthoImages = new Map(); // ortho-id -> HTMLImageElement (laddad)

const sitePath = () => dataPath("site_layers.json");
const LAYER_KEY = () => "lagesplan-layers-" + projectId;

// ---------------------------------------------------------------------
// Koordinater: modell (meter) <-> PDF
// ---------------------------------------------------------------------
function pdfToModel([px, py]) {
  const [m1, m2] = plan.calib.model, [p1, p2] = plan.calib.pdf;
  const mx = m2[0] - m1[0], my = m2[1] - m1[1], qx = p2[0] - p1[0], qy = p2[1] - p1[1];
  const d = mx * mx + my * my;
  const ar = (qx * mx + qy * my) / d, ai = (qy * mx - qx * my) / d;
  const n = ar * ar + ai * ai;
  const dx = px - p1[0], dy = py - p1[1];
  return [m1[0] + (ar * dx + ai * dy) / n, m1[1] + (-ai * dx + ar * dy) / n];
}
const mToPx = pt => toPx(modelToPdf(pt[0], pt[1]));
/* Canvas-pixlar per meter. */
function pxPerMeter() {
  const a = mToPx([0, 0]), b = mToPx([1, 0]);
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

// ---------------------------------------------------------------------
// Lagerstatus (per webbläsare)
// ---------------------------------------------------------------------
function loadLayerState() {
  try { layerState = JSON.parse(localStorage.getItem(LAYER_KEY()) || "{}") || {}; } catch (e) { layerState = {}; }
}
function saveLayerState() { try { localStorage.setItem(LAYER_KEY(), JSON.stringify(layerState)); } catch (e) {} }
function ls(key, def = {}) {
  if (!layerState[key]) layerState[key] = { visible: def.visible !== false, opacity: def.opacity ?? 100 };
  return layerState[key];
}
function layerVisible(key) { return ls(key).visible; }
function layerOpacity(key) { return ls(key).opacity / 100; }
function applyLayerCss() {
  const cmp = typeof compareActive === "function" && compareActive();
  const hasOrtho = cmp || orthos().some(o => ls("ortho:" + o.id).visible);
  const set = (id, key) => { const c = $(id); c.style.display = layerVisible(key) ? "" : "none"; c.style.opacity = layerOpacity(key); };
  set("pdfCanvas", "pdf");
  set("zoneCanvas", "zones");
  set("objCanvas", "objects");
  if ($("labelCanvas")) set("labelCanvas", "objects");
  if (typeof renderObjHint === "function" && typeof plan !== "undefined" && plan) renderObjHint(layerVisible("objects") ? objectShapesInPdf() : null);
  $("orthoCanvas").style.display = hasOrtho ? "" : "none";
  if ($("orthoCanvasB")) $("orthoCanvasB").style.display = cmp ? "" : "none";
  // Över ett ortofoto blir ritningens vita bakgrund genomskinlig (multiplicera).
  const multiply = hasOrtho && layerState.pdfMultiply !== false;
  $("pdfCanvas").style.mixBlendMode = multiply ? "multiply" : "";
  const hi = $("pdfHiCanvas");
  if (hi) Object.assign(hi.style, { mixBlendMode: $("pdfCanvas").style.mixBlendMode, opacity: $("pdfCanvas").style.opacity, display: $("pdfCanvas").style.display });
  $("stage").style.background = hasOrtho ? "#e5e7eb" : "#fff";
}

// ---------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------
const orthos = () => siteItems.filter(x => x.type === "ortho");
/* Ortofoton i versioner (Victors önskemål 2026-09-28): varje uppladdning blir
   ett eget lager med fotodatum, även om filnamnet är detsamma. Äldst först,
   så att det nyaste ritas överst om flera är tända. */
const orthoDate = o => o.date || (o.created_at || "").slice(0, 10);
const orthosByDate = () => orthos().slice().sort((a, b) => orthoDate(a).localeCompare(orthoDate(b)) || (a.created_at || "").localeCompare(b.created_at || ""));
const orthoExclusive = () => layerState.orthoExclusive !== false;
const orthoFollowDate = () => layerState.orthoFollowDate === true;
const orthoOutside = () => layerState.orthoOutside === true;
/* Ortofotonas yta i stage-px (för film/utsnitt utanför ritningen). */
function orthoBounds(list = orthos()) {
  let b = null;
  list.forEach(o => {
    const m = imageToStage(o.world);
    [[0, 0], [o.width, 0], [0, o.height], [o.width, o.height]].forEach(p => {
      const [x, y] = applyAffine(m, p);
      b = b ? [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)] : [x, y, x, y];
    });
  });
  return b;
}
function showOnlyOrtho(id) {
  orthos().forEach(o => { ls("ortho:" + o.id).visible = o.id === id; });
  saveLayerState();
}
function orthoChanged() { renderLayerPanel(); applyLayerCss(); renderOrtho(); renderOrthoNav(); }
/* "Följ datumet": visa det senaste fotot som är taget på eller före valt datum. */
function syncOrthoToDate() {
  if (!orthoFollowDate() || !orthos().length) return;
  const at = $("dateInput").value || todayIso();
  const list = orthosByDate();
  const pick = list.filter(o => orthoDate(o) <= at).pop() || list[0];
  if (orthos().some(o => ls("ortho:" + o.id).visible !== (o.id === pick.id))) { showOnlyOrtho(pick.id); orthoChanged(); }
  else renderOrthoNav();
}
/* Bläddra till föregående/nästa ortofoto (dir = -1/+1). */
function stepOrtho(dir) {
  const list = orthosByDate();
  if (!list.length) return;
  const cur = list.map(o => ls("ortho:" + o.id).visible).lastIndexOf(true);
  const i = cur < 0 ? (dir > 0 ? 0 : list.length - 1) : Math.max(0, Math.min(list.length - 1, cur + dir));
  setOrthoFollowDate(false);
  showOnlyOrtho(list[i].id); orthoChanged();
}
function setOrthoFollowDate(on) {
  layerState.orthoFollowDate = on; saveLayerState();
  if ($("orthoFollowDate")) $("orthoFollowDate").checked = on;
  if (on) syncOrthoToDate();
}
function renderOrthoNav() {
  const el = $("orthoNav");
  if (!el) return;
  const list = orthosByDate();
  el.classList.toggle("hidden", list.length < 2);
  const vis = list.filter(o => ls("ortho:" + o.id).visible);
  const cur = vis[vis.length - 1];
  const i = cur ? list.indexOf(cur) : -1;
  $("orthoNavLabel").textContent = !vis.length ? "Inget ortofoto visas" : vis.length > 1 ? `${vis.length} ortofoton tända` : `${cur.name} · ${orthoDate(cur)} (${i + 1}/${list.length})`;
  $("orthoNavLabel").title = cur && cur.caption ? cur.caption : "";
  $("btnOrthoPrev").disabled = i === 0; $("btnOrthoNext").disabled = i === list.length - 1;
  if (typeof renderDateMarks === "function") renderDateMarks();
  if (typeof renderCompareUi === "function") renderCompareUi();
}
async function editOrtho(o) {
  const name = prompt("Namn på ortofotot:", o.name);
  if (name === null) return;
  const date = askOrthoDate(orthoDate(o));
  if (date === null) return;
  const caption = prompt("Bildtext (visas i framdriftsfilmen), t.ex. \"Stomme hus A klar\" – lämna tomt för ingen:", o.caption || "");
  if (caption === null) return;
  await saveSiteItem({ ...o, name: name.trim() || o.name, date, caption: caption.trim() || null });
  syncOrthoToDate(); renderOrthoNav();
}
/* Frågar efter fotodatum (ÅÅÅÅ-MM-DD). null = avbrutet. */
function askOrthoDate(def) {
  for (;;) {
    const v = prompt("Fotodatum – när togs bilden (flygningen)? ÅÅÅÅ-MM-DD", def);
    if (v === null) return null;
    const t = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(t) && !isNaN(Date.parse(t))) return t;
    alert("Skriv datumet som ÅÅÅÅ-MM-DD, t.ex. 2026-09-28.");
    def = t;
  }
}
/* Egna lager (Victors önskemål 2026-09-28): varje notering/etableringsobjekt
   ligger på ett namngivet lager. "Allmänt" och "Etablering" finns alltid;
   egna lager sparas som { type: "layer", name } i site_layers.json. */
const isSiteObj = x => x.type !== "ortho" && x.type !== "layer" && x.type !== "layermeta" && x.type !== "cad" && x.type !== "printtpl" && x.type !== "objview" && x.type !== "lsview";
const defaultLayerOf = x => x.type === "note" ? "Allmänt" : "Etablering";
const layerOf = x => x.layer || defaultLayerOf(x);
function userLayers() {
  const names = new Set(["Allmänt", "Etablering"]);
  siteItems.filter(x => x.type === "layer").sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(x => names.add(x.name));
  siteItems.filter(x => isSiteObj(x)).forEach(x => names.add(layerOf(x)));
  return [...names];
}
const noteLayers = userLayers;
async function createLayer(name) {
  name = String(name || "").trim();
  if (!name) return null;
  if (userLayers().includes(name)) return name;
  await saveSiteItem({ id: ghNewId(), type: "layer", name, order: Date.now() }, false, { record: false });
  ls("ul:" + name).visible = true; saveLayerState();
  return name;
}
/* Mappar och visningsnamn i lagerlistan (Victors önskemål 2026-09-29).
   Sparas för hela projektet som en post { type: "layermeta" } i
   site_layers.json: names = nytt visningsnamn per lager (även de fasta
   lagren), folders = [{ id, name }], folderOf = lager -> mapp. */
const META_ID = "layermeta";
function layerMeta() {
  const m = siteItems.find(x => x.id === META_ID) || {};
  return { id: META_ID, type: "layermeta", names: { ...(m.names || {}) }, folders: (m.folders || []).map(f => ({ ...f })), folderOf: { ...(m.folderOf || {}) }, sortAz: !!m.sortAz, cadColors: { ...(m.cadColors || {}) } };
}
function saveLayerMeta(m) { return saveSiteItem(m, false, { record: false }); }
const LAYER_DEFAULT_NAMES = { pdf: "Ritningen (PDF)", zones: "Zoner", objects: "Objekt", photos: "Foton" };
/* Namnet som syns i listan, för sortering A–Ö. */
function layerSortName(key) {
  if (key.startsWith("ortho:")) { const o = siteItems.find(x => "ortho:" + x.id === key); return o ? o.name || "" : key; }
  if (key.startsWith("cad:")) { const r = siteItems.find(x => "cad:" + x.id === key); return r ? r.name || "" : key; }
  return layerDisplayName(key);
}
function layerDisplayName(key) {
  const n = (siteItems.find(x => x.id === META_ID) || {}).names || {};
  return n[key] || LAYER_DEFAULT_NAMES[key] || (key.startsWith("ul:") ? key.slice(3) : key);
}
const ulName = l => layerDisplayName("ul:" + l);
async function renameFixedLayer(key) {
  const def = LAYER_DEFAULT_NAMES[key] || key.slice(3);
  const v = prompt(`Nytt namn på lagret (tomt = "${def}"):`, layerDisplayName(key));
  if (v === null) return;
  const m = layerMeta();
  if (v.trim() && v.trim() !== def) m.names[key] = v.trim(); else delete m.names[key];
  await saveLayerMeta(m);
  renderActiveLayerSelect();
}
async function createFolder() {
  const name = (prompt("Namn på mappen:", "Ny mapp") || "").trim();
  if (!name) return;
  const m = layerMeta();
  m.folders.push({ id: ghNewId(), name });
  await saveLayerMeta(m);
  setSaveStatus(`📁 Mappen "${name}" skapad – dra lager till den.`);
}
async function renameFolder(id) {
  const m = layerMeta(), f = m.folders.find(x => x.id === id);
  if (!f) return;
  const name = (prompt("Nytt namn på mappen:", f.name) || "").trim();
  if (!name || name === f.name) return;
  f.name = name;
  await saveLayerMeta(m);
}
async function deleteFolder(id) {
  const m = layerMeta(), f = m.folders.find(x => x.id === id);
  if (!f || !confirm(`Ta bort mappen "${f.name}"? Lagren i den ligger kvar utanför mappen.`)) return;
  m.folders = m.folders.filter(x => x.id !== id);
  Object.keys(m.folderOf).forEach(k => { if (m.folderOf[k] === id) delete m.folderOf[k]; });
  await saveLayerMeta(m);
}
async function moveLayerToFolder(key, folderId) {
  const m = layerMeta();
  if ((m.folderOf[key] || null) === (folderId || null)) return;
  if (folderId) m.folderOf[key] = folderId; else delete m.folderOf[key];
  await saveLayerMeta(m);
}
/* Tänd/släck alla lager i en mapp. */
function setFolderVisible(id, on) {
  const keys = layerRowKeys().filter(k => layerMeta().folderOf[k] === id);
  const ortho = keys.filter(k => k.startsWith("ortho:"));
  keys.filter(k => !k.startsWith("ortho:")).forEach(k => { ls(k).visible = on; });
  if (ortho.length) {
    if (orthoFollowDate()) setOrthoFollowDate(false);
    // "Ett i taget": en tänd mapp visar dess nyaste foto.
    if (on && orthoExclusive()) showOnlyOrtho(orthosByDate().filter(o => ortho.includes("ortho:" + o.id)).pop().id);
    else ortho.forEach(k => { ls(k).visible = on; });
  }
  saveLayerState();
  if (keys.includes("objects")) $("showObjects").checked = ls("objects").visible;
  if (keys.includes("photos")) $("showPhotos").checked = ls("photos").visible;
  orthoChanged(); renderZones();
  if (typeof renderCad === "function") { buildCadSnap(); renderCad(); }
}
function layerRowKeys() {
  const cadKeys = typeof cads === "function" ? cads().map(r => "cad:" + r.id) : [];
  return [...orthosByDate().reverse().map(o => "ortho:" + o.id), ...cadKeys, "pdf", "zones", "objects", ...userLayers().map(l => "ul:" + l), "photos"];
}

function renderActiveLayerSelect() {
  const sel = $("activeLayer");
  if (!sel) return;
  const cur = sel.value || (() => { try { return localStorage.getItem("lagesplan-activelayer-" + projectId); } catch (e) { return null; } })() || "Etablering";
  sel.innerHTML = userLayers().map(l => `<option value="${escHtml(l)}"${l === cur ? " selected" : ""}>${escHtml(ulName(l))}</option>`).join("");
  if (!userLayers().includes(cur)) sel.value = "Etablering";
}

/* Flera poster i en skrivning (byt namn på/ta bort lager). */
async function saveSiteItemsBatch(recs, removeIds = []) {
  const ids = new Set(recs.map(r => r.id));
  const rm = new Set(removeIds);
  siteItems = [...siteItems.filter(x => !ids.has(x.id) && !rm.has(x.id)), ...recs];
  renderLayerPanel(); renderZones();
  await ghWriteJSON(token, sitePath(), arr => [...arr.filter(x => !ids.has(x.id) && !rm.has(x.id)), ...recs], "Lägesplan: lager");
}
function updateUndoButtons() {
  const u = $("siteUndo"), r = $("siteRedo");
  if (u) { u.disabled = !siteUndo.length; u.title = siteUndo.length ? `Ångra: ${siteUndo[siteUndo.length - 1].label} (Ctrl+Z)` : "Inget att ångra"; }
  if (r) { r.disabled = !siteRedo.length; r.title = siteRedo.length ? `Gör om: ${siteRedo[siteRedo.length - 1].label} (Ctrl+Y)` : "Inget att göra om"; }
}
async function undoSite() {
  const e = siteUndo.pop(); if (!e) return;
  siteRedo.push(e);
  if (e.before) await saveSiteItem(e.before, false, { record: false });
  else await saveSiteItem({ id: e.id, type: (e.after || {}).type }, true, { record: false });
  selectedSiteId = null; closeSitePop(); updateUndoButtons(); setSaveStatus(`↶ Ångrade: ${e.label}`);
}
async function redoSite() {
  const e = siteRedo.pop(); if (!e) return;
  siteUndo.push(e);
  if (e.after) await saveSiteItem(e.after, false, { record: false });
  else await saveSiteItem({ id: e.id, type: (e.before || {}).type }, true, { record: false });
  selectedSiteId = null; closeSitePop(); updateUndoButtons(); setSaveStatus(`↷ Gjorde om: ${e.label}`);
}

async function loadSiteLayers() {
  try { siteItems = await ghReadJSON(token, sitePath()); } catch (e) { siteItems = []; console.warn("Kunde inte läsa site_layers.json", e); }
  siteLoaded = true;
  renderActiveLayerSelect();
  if (typeof setupDateRange === "function" && dateMin != null) setupDateRange();
  syncOrthoToDate();
  renderLayerPanel();
  applyLayerCss();
  renderOrtho();
  renderOrthoNav();
  if (typeof renderCad === "function") renderCad();
  renderZones();
}
async function saveSiteItem(rec, remove = false, opts = {}) {
  const prev = "prev" in opts ? opts.prev : (siteItems.find(x => x.id === rec.id) || null);
  if (opts.record !== false && rec.type !== "ortho" && rec.type !== "layer") {
    if (typeof lastUndoTarget !== "undefined") lastUndoTarget = "site";
    siteUndo.push({ label: `${remove ? "Ta bort" : prev ? "Ändra" : "Lägg till"} ${(SITE_KINDS[rec.type] || {}).label || ""}`.trim(), before: prev ? JSON.parse(JSON.stringify(prev)) : null, after: remove ? null : JSON.parse(JSON.stringify(rec)), id: rec.id });
    if (siteUndo.length > 100) siteUndo.shift();
    siteRedo = [];
  }
  if (remove) siteItems = siteItems.filter(x => x.id !== rec.id);
  else { const i = siteItems.findIndex(x => x.id === rec.id); if (i >= 0) siteItems[i] = rec; else siteItems.push(rec); }
  renderLayerPanel(); renderZones(); updateUndoButtons();
  setSaveStatus("Sparar…");
  try {
    await ghWriteJSON(token, sitePath(), arr => {
      const rest = arr.filter(x => x.id !== rec.id);
      return remove ? rest : [...rest, rec];
    }, `Lägesplan: ${remove ? "ta bort" : "spara"} ${SITE_KINDS[rec.type] ? SITE_KINDS[rec.type].label.toLowerCase() : rec.type}`);
    setSaveStatus(`✓ Sparad ${new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}`);
  } catch (e) {
    setSaveStatus("⚠ Kunde inte spara: " + e.message);
  }
}

// ---------------------------------------------------------------------
// Ortofoto: läs världsfil + PNG (strömmande avkodning, nedskalning)
// ---------------------------------------------------------------------
function parseWorldFile(text) {
  const v = text.split(/\s+/).map(t => t.trim()).filter(Boolean).map(t => Number(t.replace(",", ".")));
  if (v.length < 6 || v.slice(0, 6).some(n => !Number.isFinite(n))) throw new Error("Världsfilen (.pgw) har inte sex tal.");
  const [A, D, B, E, C, F] = v;
  return { A, B, C, D, E, F };
}
/* Världsfil för en nedskalad bild (faktor k): pixel (i,j) i den nya bilden täcker
   originalpixlarna [i*k, (i+1)*k) - världsfilen avser pixelns mitt. */
function scaleWorld(w, k) {
  const o = (k - 1) / 2;
  return { A: w.A * k, B: w.B * k, D: w.D * k, E: w.E * k, C: w.C + (w.A + w.B) * o, F: w.F + (w.D + w.E) * o };
}

/**
 * Avkodar en (stor) PNG strömmande och skalar ned den till högst maxPx på
 * längsta sidan, utan att hela originalet behöver ligga i minnet (en 122 MB
 * PNG kan vara flera GB okomprimerad). Stöder 8/16 bitar, gråskala,
 * RGB, palett och alfa, ej interlace (då används webbläsarens avkodning).
 */
async function decodePngScaled(file, maxPx, onProgress, hooks = {}) {
  await loadScript(PAKO_URL);
  const BLOCK = 8 * 1024 * 1024;
  let pos = 0, buf = new Uint8Array(0);
  const need = async n => {
    while (buf.length < n && pos < file.size) {
      const chunk = new Uint8Array(await file.slice(pos, pos + BLOCK).arrayBuffer());
      pos += chunk.length;
      const nb = new Uint8Array(buf.length + chunk.length); nb.set(buf); nb.set(chunk, buf.length); buf = nb;
    }
    return buf.length >= n;
  };
  const take = n => { const out = buf.subarray(0, n); buf = buf.subarray(n); return out; };
  await need(8);
  const sig = take(8);
  if (sig[0] !== 0x89 || sig[1] !== 0x50) throw new Error("Filen är ingen PNG.");
  let W = 0, H = 0, depth = 8, ctype = 2, interlace = 0, palette = null, trns = null;
  let k = 1, outW = 0, outH = 0, out = null, acc = null, cnt = null, channels = 3, bpp = 3, rowBytes = 0;
  let prev = null, cur = null, rowFill = 0, rowIndex = 0, accRows = 0, filterType = -1, fullRow = null;
  const pix = [0, 0, 0, 255];
  const readPixel = (row, x) => {
    if (ctype === 3) {
      const idx = depth === 8 ? row[x] : (row[(x * depth) >> 3] >> (8 - depth - ((x * depth) & 7))) & ((1 << depth) - 1);
      pix[0] = palette[idx * 3]; pix[1] = palette[idx * 3 + 1]; pix[2] = palette[idx * 3 + 2];
      pix[3] = trns && idx < trns.length ? trns[idx] : 255;
      return;
    }
    const s = depth === 16 ? 2 : 1;
    const o = x * channels * s;
    if (ctype === 0) { const g = depth < 8 ? ((row[(x * depth) >> 3] >> (8 - depth - ((x * depth) & 7))) & ((1 << depth) - 1)) * (255 / ((1 << depth) - 1)) : row[o]; pix[0] = pix[1] = pix[2] = g; pix[3] = 255; }
    else if (ctype === 4) { pix[0] = pix[1] = pix[2] = row[o]; pix[3] = row[o + s]; }
    else if (ctype === 2) { pix[0] = row[o]; pix[1] = row[o + s]; pix[2] = row[o + 2 * s]; pix[3] = 255; }
    else { pix[0] = row[o]; pix[1] = row[o + s]; pix[2] = row[o + 2 * s]; pix[3] = row[o + 3 * s]; }
  };
  const flushAcc = () => {
    const oy = Math.floor((rowIndex - 1) / k);
    for (let ox = 0; ox < outW; ox++) {
      const c = cnt[ox] || 1, o = (oy * outW + ox) * 4;
      out[o] = acc[ox * 4] / c; out[o + 1] = acc[ox * 4 + 1] / c; out[o + 2] = acc[ox * 4 + 2] / c; out[o + 3] = acc[ox * 4 + 3] / c;
    }
    acc.fill(0); cnt.fill(0); accRows = 0;
  };
  const processRow = () => {
    // Avfiltrera (PNG-filter 0-4) mot föregående rad.
    const f = filterType;
    for (let i = 0; i < rowBytes; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = cur[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[i] = v & 255;
    }
    for (let x = 0; x < W; x++) {
      readPixel(cur, x);
      const ox = (x / k) | 0, o = ox * 4;
      acc[o] += pix[0]; acc[o + 1] += pix[1]; acc[o + 2] += pix[2]; acc[o + 3] += pix[3]; cnt[ox]++;
      if (fullRow) { const q = x * 4; fullRow[q] = pix[0]; fullRow[q + 1] = pix[1]; fullRow[q + 2] = pix[2]; fullRow[q + 3] = pix[3]; }
    }
    if (fullRow) hooks.onRow(rowIndex, fullRow);
    rowIndex++; accRows++;
    if (accRows === k || rowIndex === H) flushAcc();
    const t = prev; prev = cur; cur = t;
    if (onProgress && (rowIndex & 127) === 0) onProgress(rowIndex / H);
  };
  const inflator = new pako.Inflate();
  inflator.onData = data => {
    let i = 0;
    while (i < data.length) {
      if (filterType < 0) { filterType = data[i++]; rowFill = 0; continue; }
      const n = Math.min(rowBytes - rowFill, data.length - i);
      cur.set(data.subarray(i, i + n), rowFill);
      rowFill += n; i += n;
      if (rowFill === rowBytes) { processRow(); filterType = -1; }
    }
  };
  let yieldAt = Date.now();
  while (await need(8)) {
    const head = take(8);
    const len = (head[0] << 24 >>> 0) + (head[1] << 16) + (head[2] << 8) + head[3];
    const type = String.fromCharCode(head[4], head[5], head[6], head[7]);
    await need(len + 4);
    const data = take(len).slice(); take(4); // crc
    if (type === "IHDR") {
      const dv = new DataView(data.buffer);
      W = dv.getUint32(0); H = dv.getUint32(4); depth = data[8]; ctype = data[9]; interlace = data[12];
      if (interlace) throw Object.assign(new Error("interlace"), { interlaced: true });
      channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
      bpp = Math.max(1, Math.ceil(channels * depth / 8));
      rowBytes = Math.ceil(W * channels * depth / 8);
      k = Math.max(1, Math.ceil(Math.max(W, H) / maxPx));
      outW = Math.ceil(W / k); outH = Math.ceil(H / k);
      out = new Uint8ClampedArray(outW * outH * 4);
      acc = new Float64Array(outW * 4); cnt = new Uint32Array(outW);
      prev = new Uint8Array(rowBytes); cur = new Uint8Array(rowBytes);
      if (hooks.onRow) fullRow = new Uint8ClampedArray(W * 4);
      if (hooks.onHeader) hooks.onHeader(W, H, k);
    } else if (type === "PLTE") palette = data;
    else if (type === "tRNS") trns = data;
    else if (type === "IDAT") {
      inflator.push(data, false);
      if (inflator.err) throw new Error("PNG-avkodning: " + inflator.msg);
      if (hooks.drain) await hooks.drain();
      if (Date.now() - yieldAt > 150) { await new Promise(r => setTimeout(r)); yieldAt = Date.now(); }
    } else if (type === "IEND") break;
  }
  inflator.push(new Uint8Array(0), true);
  if (!out) throw new Error("PNG saknar bilddata.");
  if (hooks.drain) await hooks.drain();
  return { width: outW, height: outH, k, data: out, origW: W, origH: H };
}

async function imageToScaledCanvas(file, onProgress, sink) {
  let res;
  if (/\.png$/i.test(file.name)) {
    try { res = await decodePngScaled(file, ORTHO_MAX_PX, onProgress, sink ? sink.hooks : {}); }
    catch (e) { if (!e.interlaced) throw e; }
  }
  const c = document.createElement("canvas");
  if (res) {
    c.width = res.width; c.height = res.height;
    c.getContext("2d").putImageData(new ImageData(res.data, res.width, res.height), 0, 0);
    return { canvas: c, k: res.k, origW: res.origW, origH: res.origH };
  }
  // JPG (eller interlacad PNG): webbläsarens egen avkodning.
  const bmp = await createImageBitmap(file);
  if (sink) await sink.fromBitmap(bmp);
  const k = Math.max(1, Math.ceil(Math.max(bmp.width, bmp.height) / ORTHO_MAX_PX));
  c.width = Math.ceil(bmp.width / k); c.height = Math.ceil(bmp.height / k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return { canvas: c, k, origW: bmp.width, origH: bmp.height };
}

/* Full upplösning i rutor (Victors önskemål 2026-09-28: "crisp quality"):
   förutom översiktsbilden (max ORTHO_MAX_PX) sparas originalet i rutor om
   ORTHO_TILE px (WebP) i site_layers/<id>/t_<kol>_<rad>.webp. Lägesplanen
   hämtar bara de rutor som syns när man zoomar in (se renderOrtho). Rutorna
   byggs medan PNG:en avkodas, ett band (ORTHO_TILE rader) i taget, så
   originalet aldrig behöver ligga helt i minnet. */
const ORTHO_TILE = 2048;
function createTileSink(id, report) {
  let W = 0, H = 0, cols = 0, rowsN = 0, band = null, bandRows = 0, done = 0;
  // Banden laddas upp EN i taget (samtidiga skrivningar till repot ger skrivkrockar).
  let chain = Promise.resolve(), queued = 0;
  const pending = { push(fn) { queued++; chain = chain.then(fn).finally(() => { queued--; }); } };
  const upload = async (canvas, tx, ty) => {
    const blob = await new Promise(res => canvas.toBlob(res, "image/webp", 0.9));
    await ghUploadBinary(token, dataPath(`site_layers/${id}/t_${tx}_${ty}.webp`), blob, `Lägesplan: ortofoto ruta ${tx},${ty}`);
    done++; report(done, cols * rowsN);
  };
  const flushBand = async (data, ty, h) => {
    for (let tx = 0; tx < cols; tx++) {
      const x0 = tx * ORTHO_TILE, tw = Math.min(ORTHO_TILE, W - x0);
      const tile = new Uint8ClampedArray(tw * h * 4);
      for (let r = 0; r < h; r++) tile.set(data.subarray((r * W + x0) * 4, (r * W + x0 + tw) * 4), r * tw * 4);
      const c = document.createElement("canvas"); c.width = tw; c.height = h;
      c.getContext("2d").putImageData(new ImageData(tile, tw, h), 0, 0);
      await upload(c, tx, ty);
    }
  };
  const header = (w, h) => { W = w; H = h; cols = Math.ceil(W / ORTHO_TILE); rowsN = Math.ceil(H / ORTHO_TILE); };
  return {
    hooks: {
      onHeader(w, h) { header(w, h); band = new Uint8ClampedArray(W * ORTHO_TILE * 4); },
      onRow(y, row) {
        band.set(row, bandRows * W * 4);
        bandRows++;
        if (bandRows === ORTHO_TILE || y === H - 1) {
          const data = band, ty = Math.floor(y / ORTHO_TILE), h = bandRows;
          pending.push(() => flushBand(data, ty, h));
          band = y === H - 1 ? null : new Uint8ClampedArray(W * ORTHO_TILE * 4);
          bandRows = 0;
        }
      },
      // Högst ett färdigt band väntar på uppladdning medan nästa avkodas.
      async drain() { while (queued > 1) await new Promise(r => setTimeout(r, 100)); }
    },
    async fromBitmap(bmp) {
      header(bmp.width, bmp.height);
      for (let ty = 0; ty < rowsN; ty++) for (let tx = 0; tx < cols; tx++) {
        const x0 = tx * ORTHO_TILE, y0 = ty * ORTHO_TILE, tw = Math.min(ORTHO_TILE, W - x0), th = Math.min(ORTHO_TILE, H - y0);
        const c = document.createElement("canvas"); c.width = tw; c.height = th;
        c.getContext("2d").drawImage(bmp, x0, y0, tw, th, 0, 0, tw, th);
        await upload(c, tx, ty);
      }
    },
    async finish() {
      await chain;
      return { size: ORTHO_TILE, cols, rows: rowsN, width: W, height: H, prefix: dataPath(`site_layers/${id}/`) };
    }
  };
}

async function addOrthoFiles(files) {
  const img = files.find(f => /\.(png|jpe?g)$/i.test(f.name));
  const wf = files.find(f => /\.(pgw|jgw|pngw|jpgw|wld)$/i.test(f.name));
  if (!img || !wf) { alert("Välj både bildfilen (PNG/JPG) och dess världsfil (.pgw/.jgw) – markera båda i fildialogen."); return; }
  if (!plan || !plan.calib) { alert("Kalibrera planen mot 3D (📐) först – ortofotot placeras via modellens koordinater."); return; }
  let world;
  try { world = parseWorldFile(await wf.text()); } catch (e) { alert(e.message); return; }
  const date = askOrthoDate(img.lastModified ? isoOf(new Date(img.lastModified)) : todayIso());
  if (date === null) return;
  const toTc = $("orthoToTc").checked;
  const id = ghNewId();
  const name = img.name.replace(/\.[^.]+$/, "");
  // Originalen till Trimble Connect (via 4D-planering) parallellt med avkodningen.
  let tcPromise = null;
  if (toTc) {
    if (!window.opener || window.opener.closed) setSaveStatus("⚠ Originalen kunde inte sparas i Trimble Connect – öppna lägesplanen via 🗺️ i 4D-planering.");
    else tcPromise = askOpener("tcUpload", { folder: "Lägesplan", files: [img, wf] }, 30 * 60 * 1000)
      .then(r => setSaveStatus(`☁ Originalen sparade i Trimble Connect (${r.folder || "Lägesplan"}).`))
      .catch(e => setSaveStatus("⚠ Kunde inte spara i Trimble Connect: " + e.message));
  }
  setBusy("Läser ortofotot… 0 %");
  try {
    const t0 = Date.now();
    let tileInfo = "";
    const sink = createTileSink(id, (d, t) => { tileInfo = ` · full upplösning: ruta ${d} av ${t} uppladdad`; });
    const { canvas, k, origW, origH } = await imageToScaledCanvas(img, p => setBusy(`Läser ortofotot… ${Math.round(p * 100)} %${tileInfo}`), sink);
    setBusy(`Laddar upp full upplösning…${tileInfo}`);
    const tiles = k > 1 ? { ...(await sink.finish()), world } : null;
    setBusy("Komprimerar…");
    const blob = await new Promise(res => canvas.toBlob(res, "image/webp", 0.85));
    const path = dataPath(`site_layers/${id}.webp`);
    const sw = scaleWorld(world, k);
    // Rimlighetskontroll: ligger fotot i närheten av planen?
    const cx = sw.C + sw.A * canvas.width / 2 + sw.B * canvas.height / 2, cy = sw.F + sw.D * canvas.width / 2 + sw.E * canvas.height / 2;
    const m1 = plan.calib.model[0];
    const dist = Math.hypot(cx - m1[0], cy - m1[1]);
    const ext = Math.hypot(sw.A * canvas.width, sw.E * canvas.height);
    if (dist > ext * 3 && !confirm(`Ortofotot ligger ${Math.round(dist / 1000)} km från planens kalibreringspunkter. Ligger modellen verkligen i samma koordinatsystem som fotot? Spara ändå?`)) return;
    setBusy(`Laddar upp (${(blob.size / 1048576).toFixed(1)} MB)…`);
    await ghUploadBinary(token, path, blob, `Lägesplan: ortofoto ${name}`);
    const rec = { id, type: "ortho", name, date, path, width: canvas.width, height: canvas.height, world: sw, tiles,
      orig: { name: img.name, width: origW, height: origH, pixel_m: Math.abs(world.A) }, created_at: new Date().toISOString(), by: settings.userName || null };
    orthoImages.set(id, await blobToImage(blob));
    // Tidigare ortofoton ligger kvar som egna lager men släcks, så att det
    // nya syns direkt (med "ett i taget").
    if (orthoExclusive()) orthos().forEach(o => { ls("ortho:" + o.id).visible = false; });
    ls("ortho:" + id).visible = true; saveLayerState();
    await saveSiteItem(rec);
    if (orthoFollowDate()) setDate(date);
    orthoChanged();
    const older = orthos().length - 1;
    if (older) setSaveStatus(`🛰 ${name} (${date}) tillagt. ${older} tidigare ortofoto${older > 1 ? "n" : ""} ligger kvar i lagerlistan.`);
    console.log(`Ortofoto: ${origW}×${origH} → ${canvas.width}×${canvas.height} (k=${k}) på ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  } catch (e) {
    alert("Kunde inte läsa ortofotot: " + e.message);
  } finally {
    setBusy("");
  }
  if (tcPromise) await tcPromise;
}
function blobToImage(blob) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("Kunde inte visa bilden")); im.src = URL.createObjectURL(blob); });
}
async function ensureOrthoImage(o) {
  if (orthoImages.has(o.id)) return orthoImages.get(o.id);
  const url = await ghReadBinaryUrl(token, o.path);
  const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  orthoImages.set(o.id, im);
  return im;
}

/* Affin avbildning bildpixel -> stage-pixel (canvas) för en världsfil:
   bildpixel -> SWEREF (världsfil) -> modell (samma system) -> PDF
   (kalibreringen) -> canvas. Returnerar [a, b, c, d, e, f] för setTransform. */
function imageToStage(w) {
  const f = (u, v) => mToPx([w.A * (u - 0.5) + w.B * (v - 0.5) + w.C, w.D * (u - 0.5) + w.E * (v - 0.5) + w.F]);
  const p0 = f(0, 0), p1 = f(1, 0), p2 = f(0, 1);
  return [p1[0] - p0[0], p1[1] - p0[1], p2[0] - p0[0], p2[1] - p0[1], p0[0], p0[1]];
}
const mulAffine = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
function invAffine(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}
const applyAffine = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

const tileCache = new Map(); // path -> { img, used }
async function loadTile(path) {
  const hit = tileCache.get(path);
  if (hit) { hit.used = Date.now(); return hit.img; }
  const entry = { img: null, used: Date.now(), promise: null };
  tileCache.set(path, entry);
  entry.promise = ghReadBinaryUrl(token, path).then(url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }))
    .then(img => { entry.img = img; if (tileCache.size > 30) { const old = [...tileCache.entries()].filter(([, v]) => v.img).sort((x, y) => x[1].used - y[1].used)[0]; if (old) { URL.revokeObjectURL(old[1].img.src); tileCache.delete(old[0]); } } scheduleOrthoRender(); return img; })
    .catch(e => { tileCache.delete(path); console.warn("Kunde inte hämta ortofotoruta", path, e); });
  return null;
}

/* Ortofotot ritas bara för den synliga delen av planen, i skärmens
   upplösning: utzoomat från översiktsbilden, inzoomat från rutorna i full
   upplösning (Victors önskemål om skärpa). orthoCanvas ligger i #stage så
   att ritningens "multiplicera" blandas mot fotot, men täcker bara det
   synliga området. */
let orthoRenderSeq = 0, orthoTimer = 0;
function scheduleOrthoRender() { clearTimeout(orthoTimer); orthoTimer = setTimeout(renderOrtho, 90); if (typeof scheduleCadRender === "function") scheduleCadRender(); }
async function renderOrtho() {
  const seq = ++orthoRenderSeq;
  const ok = plan && plan.calib && viewport;
  // Före/efter-läget: vänster foto i orthoCanvas, höger i orthoCanvasB (klipps vid snittet).
  const cmp = ok && typeof compareActive === "function" && compareActive() ? comparePair() : null;
  const list = !ok ? [] : cmp ? [cmp[0]] : orthosByDate().filter(o => ls("ortho:" + o.id).visible);
  if (!(await paintOrtho($("orthoCanvas"), list, seq, !!cmp))) return;
  const cb = $("orthoCanvasB");
  if (cb) {
    if (cmp) { if (!(await paintOrtho(cb, [cmp[1]], seq, true))) return; }
    else { cb.width = 0; cb.height = 0; }
  }
  if (typeof updateCompareClip === "function") updateCompareClip();
  applyLayerCss();
}
/* Ritar ortofotona i listan på canvasen c för den synliga delen av planen.
   false = en nyare rendering har tagit över. */
async function paintOrtho(c, list, seq, full) {
  const pc = $("pdfCanvas");
  if (!list.length || !pc.width) { c.width = 0; c.height = 0; return seq === orthoRenderSeq; }
  const imgs = [];
  for (const o of list) {
    try { imgs.push([o, await ensureOrthoImage(o)]); } catch (e) { console.warn("Kunde inte hämta ortofoto", o.name, e); }
  }
  if (seq !== orthoRenderSeq) return false;
  const vr = $("viewport").getBoundingClientRect();
  // "Visa fotot utanför ritningen": hela det synliga området, annars bara ritningens blad.
  const out = orthoOutside();
  const x0 = out ? -view.tx / view.scale : Math.max(0, -view.tx / view.scale), y0 = out ? -view.ty / view.scale : Math.max(0, -view.ty / view.scale);
  const x1 = out ? (vr.width - view.tx) / view.scale : Math.min(pc.width, (vr.width - view.tx) / view.scale);
  const y1 = out ? (vr.height - view.ty) / view.scale : Math.min(pc.height, (vr.height - view.ty) / view.scale);
  if (x1 <= x0 || y1 <= y0) { c.width = 0; return true; }
  let s = view.scale * (window.devicePixelRatio || 1);
  const maxPx = 36e6;
  if ((x1 - x0) * (y1 - y0) * s * s > maxPx) s = Math.sqrt(maxPx / ((x1 - x0) * (y1 - y0)));
  c.width = Math.ceil((x1 - x0) * s); c.height = Math.ceil((y1 - y0) * s);
  Object.assign(c.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px` });
  const ctx = c.getContext("2d");
  const stageToCanvas = [s, 0, 0, s, -x0 * s, -y0 * s];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = "high";
  for (const [o, im] of imgs) {
    ctx.save();
    ctx.globalAlpha = full ? 1 : layerOpacity("ortho:" + o.id);
    const m = mulAffine(stageToCanvas, imageToStage(o.world));
    ctx.setTransform(...m);
    ctx.drawImage(im, 0, 0);
    // Inzoomat mer än översiktsbilden räcker till: rita rutorna i full upplösning ovanpå.
    const screenPerPx = Math.hypot(m[0], m[1]);
    if (o.tiles && screenPerPx > 1.25) {
      const t = o.tiles;
      const mf = mulAffine(stageToCanvas, imageToStage(t.world));
      const inv = invAffine(mf);
      const corners = [[0, 0], [c.width, 0], [0, c.height], [c.width, c.height]].map(p => applyAffine(inv, p));
      const u0 = Math.max(0, Math.min(...corners.map(p => p[0]))), u1 = Math.min(t.width, Math.max(...corners.map(p => p[0])));
      const v0 = Math.max(0, Math.min(...corners.map(p => p[1]))), v1 = Math.min(t.height, Math.max(...corners.map(p => p[1])));
      for (let ty = Math.floor(v0 / t.size); ty <= Math.min(t.rows - 1, Math.floor(v1 / t.size)); ty++) {
        for (let tx = Math.floor(u0 / t.size); tx <= Math.min(t.cols - 1, Math.floor(u1 / t.size)); tx++) {
          const img = await loadTile(`${t.prefix}t_${tx}_${ty}.webp`);
          if (seq !== orthoRenderSeq) { ctx.restore(); return false; }
          if (!img) continue; // laddas - ritas när den kommer (scheduleOrthoRender)
          ctx.setTransform(...mulAffine(mf, [1, 0, 0, 1, tx * t.size, ty * t.size]));
          ctx.drawImage(img, 0, 0);
        }
      }
    }
    ctx.restore();
  }
  return true;
}

/* För export (PNG/PDF/video): hela fotot från översiktsbilden. */
function drawOrthoForExport(ctx, ox, oy, scale, blend) {
  if (!plan || !plan.calib) return;
  // blend = [{ o, a }] (framdriftsfilmen) – annars de tända lagren.
  const list = blend || orthosByDate().filter(o => ls("ortho:" + o.id).visible).map(o => ({ o, a: layerOpacity("ortho:" + o.id) }));
  list.filter(({ o, a }) => a > 0 && orthoImages.has(o.id)).forEach(({ o, a }) => {
    ctx.save();
    ctx.globalAlpha = a;
    ctx.setTransform(...mulAffine([scale, 0, 0, scale, ox, oy], imageToStage(o.world)));
    ctx.drawImage(orthoImages.get(o.id), 0, 0);
    ctx.restore();
  });
}

// ---------------------------------------------------------------------
// Noteringar och etablering: geometri, stil, rita
// ---------------------------------------------------------------------
// Geometri i modellens koordinater (meter, y uppåt):
//   note:    pts [pilspets, textens mitt]
//   crane:   pts [mitt], radius
//   shed/storage: cx, cy, w, h, rot (radianer) - roterbar rektangel
//   gate:    pts [mitt], w (öppningens bredd), rot
//   fence:   pts [...] (linje), barrier: pts [...] (yta)
// Stil (valfri, per objekt): color (#rrggbb), dash ("solid"|"dashed"|"dotted"),
// weight (0.6 tunn | 1 normal | 1.8 tjock), textSize (0.8 | 1 | 1.35).
const SITE_DEFAULT_COLOR = { sketch: "#e11d48", note: "#b45309", crane: "#d97706", shed: "#1d4ed8", storage: "#57534e", gate: "#16a34a", fence: "#374151", barrier: "#dc2626", route: "#2563eb", symbol: "#1d4ed8" };
const SITE_DEFAULT_DASH = { sketch: "solid", note: "solid", crane: "dashed", shed: "solid", storage: "solid", gate: "solid", fence: "dashed", barrier: "dashed", route: "solid", symbol: "solid" };
const defaultColorOf = x => (x.type === "symbol" && SYMBOLS[x.sym] && SYMBOLS[x.sym].color) || SITE_DEFAULT_COLOR[x.type];
const MONTHS_SV = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function siteVisibleAtDate(x) {
  if (siteDateOverride) { const [a, b] = siteDateOverride; return (!x.from || x.from <= b) && (!x.to || x.to >= a); }
  if (!$("layersFollowDate").checked) return true;
  const d = $("dateInput").value || todayIso();
  return (!x.from || x.from <= d) && (!x.to || x.to >= d);
}
function siteShown(x) {
  if (!isSiteObj(x)) return false;
  return ls("ul:" + layerOf(x)).visible && siteVisibleAtDate(x);
}
const isRect = x => x.type === "shed" || x.type === "storage" || x.type === "symbol";
/* Rektangelns mitt/mått/vinkel (äldre poster sparades som två hörn). */
function rectGeom(x) {
  if (Number.isFinite(x.w)) return { cx: x.cx, cy: x.cy, w: x.w, h: x.h, rot: x.rot || 0 };
  const [a, b] = x.pts;
  return { cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]), rot: 0 };
}
function rectCorners(g) {
  const c = Math.cos(g.rot), s = Math.sin(g.rot);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const lx = sx * g.w / 2, ly = sy * g.h / 2;
    return [g.cx + lx * c - ly * s, g.cy + lx * s + ly * c];
  });
}
function gateEnds(x) {
  const w = Number(x.w) || 5, r = x.rot || 0, [cx, cy] = x.pts[0];
  return [[cx - Math.cos(r) * w / 2, cy - Math.sin(r) * w / 2], [cx + Math.cos(r) * w / 2, cy + Math.sin(r) * w / 2]];
}
/* Alla modellpunkter som beskriver objektet (för träff, mitt m.m.). */
function sitePoints(x) {
  if (isRect(x)) return rectCorners(rectGeom(x));
  if (x.type === "gate") return gateEnds(x);
  return x.pts;
}
const centroidOf = pts => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
function polyLength(pts, closed) {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (closed && pts.length > 2) l += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  return l;
}
/* Lyftkurva: "20:5, 40:2" -> [{ r: 20, t: 5 }, { r: 40, t: 2 }] (sorterad på radie). */
function parseChart(txt) {
  return String(txt || "").split(/[,;\n]+/).map(p => p.trim().replace(",", ".")).filter(Boolean).map(p => {
    const m = /^([\d.]+)\s*(?:m)?\s*[:=\/]\s*([\d.]+)/.exec(p.replace(/\s+/g, " "));
    return m ? { r: Number(m[1]), t: Number(m[2]) } : null;
  }).filter(x => x && x.r > 0).sort((a, b) => a.r - b.r);
}
const craneRadius = x => { const ch = parseChart(x.chart); return ch.length ? ch[ch.length - 1].r : (Number(x.radius) || 40); };
/* Skärningspunkter mellan två sträckor (modellkoordinater), eller null. */
function segIntersect(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * q[1] - r[1] * q[0];
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * r[0], a[1] + t * r[1]] : null;
}
/* Var korsar en transportväg en avspärrning? */
function routeConflicts(route, barriers) {
  const hits = [];
  barriers.forEach(b => {
    const P = b.pts;
    for (let i = 1; i < route.pts.length; i++) for (let j = 0; j < P.length; j++) {
      const h = segIntersect(route.pts[i - 1], route.pts[i], P[j], P[(j + 1) % P.length]);
      if (h) hits.push({ pt: h, barrier: b });
    }
    route.pts.forEach(v => { if (pointInPoly(v, P)) hits.push({ pt: v, barrier: b }); });
  });
  return hits;
}
function polyAreaM(pts) { let a = 0; pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }); return Math.abs(a / 2); }
const fmtM = v => v.toLocaleString("sv-SE", { maximumFractionDigits: v < 10 ? 1 : 0 });
const fmtIn = v => String(Math.round(v * 100) / 100).replace(".", ","); // redigeringsfält: två decimaler
function shortDate(iso) { const [y, m, d] = String(iso).split("-").map(Number); return m ? `${d} ${MONTHS_SV[m - 1]}` : iso; }
function datesText(x) {
  if (x.from && x.to) return `${shortDate(x.from)} – ${shortDate(x.to)}`;
  if (x.from) return `från ${shortDate(x.from)}`;
  if (x.to) return `till ${shortDate(x.to)}`;
  return "";
}
function hexToRgba(hex, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return `rgba(0,0,0,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
function siteStyle(x, fontPx) {
  const color = x.color || defaultColorOf(x) || "#111827";
  const weight = Number(x.weight) || 1;
  const lw = Math.max(1.5, fontPx / 7) * weight;
  const dashKind = x.dash || SITE_DEFAULT_DASH[x.type] || "solid";
  const dash = dashKind === "dashed" ? [fontPx * 0.8, fontPx * 0.5] : dashKind === "dotted" ? [lw * 0.2, lw * 2.2] : [];
  return { color, lw, dash, cap: dashKind === "dotted" ? "round" : "butt", fs: fontPx * (Number(x.textSize) || 1) };
}

function drawSiteLayers(ctx, fontPx) {
  if (ctx.canvas && ctx.canvas.id === "topCanvas") labelBoxes = new Map();
  if (!plan || !plan.calib) return;
  const ppm = pxPerMeter();
  ctx.save();
  const shown = siteItems.filter(siteShown);
  const barriers = shown.filter(x => x.type === "barrier");
  shown.forEach(x => {
    ctx.globalAlpha = layerOpacity("ul:" + layerOf(x));
    drawSiteItem(ctx, x, fontPx, ppm, x.id === selectedSiteId, barriers);
  });
  ctx.restore();
  const sel = selectedSiteId && siteItems.find(x => x.id === selectedSiteId && siteShown(x));
  if (sel && !sel.locked) drawHandles(ctx, sel, fontPx, ppm);
  if (siteTool && siteTool.pts.length) drawSitePreview(ctx, fontPx, ppm);
  if (sketchStroke && sketchStroke.pts.length > 1) drawSiteItem(ctx, { type: "sketch", pts: sketchStroke.pts, color: sketchColor, weight: sketchWeight }, fontPx, ppm, false);
  if (snapMark && (siteTool || siteDrag || (typeof measure !== "undefined" && measure))) {
    const [sx, sy] = toPx(snapMark.pt), r = fontPx * 0.45;
    ctx.save(); ctx.strokeStyle = "#db2777"; ctx.lineWidth = 2;
    if (snapMark.angle) {
      // Vinkellås: streckad hjälplinje och vinkeln i grader.
      const [fx, fy] = toPx(snapMark.from);
      ctx.setLineDash([6, 4]); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(sx, sy); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(sx, sy, r * 0.6, 0, Math.PI * 2); ctx.stroke();
      ctx.font = `600 ${fontPx * 0.6}px "Segoe UI", Arial, sans-serif`; ctx.fillStyle = "#db2777";
      ctx.fillText(snapMark.kind, sx + r, sy - r);
    } else {
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.moveTo(sx - r * 1.6, sy); ctx.lineTo(sx + r * 1.6, sy); ctx.moveTo(sx, sy - r * 1.6); ctx.lineTo(sx, sy + r * 1.6); ctx.stroke();
    }
    ctx.restore();
  }
}

/* Etikett (vit ruta) med valfri grå datumrad under. */
function labelBox(ctx, x, y, text, fs, bg, fg, border, dates) {
  ctx.font = `600 ${fs * 0.85}px "Segoe UI", Arial, sans-serif`;
  const lines = String(text).split("\n");
  let w = Math.max(...lines.map(l => ctx.measureText(l).width));
  if (dates) { ctx.font = `400 ${fs * 0.68}px "Segoe UI", Arial, sans-serif`; w = Math.max(w, ctx.measureText(dates).width); }
  w += fs * 0.8;
  const h = lines.length * fs * 1.1 + fs * 0.5 + (dates ? fs * 0.85 : 0);
  ctx.fillStyle = bg; roundRect(ctx, x - w / 2, y - h / 2, w, h, fs * 0.25); ctx.fill();
  if (border) { ctx.setLineDash([]); ctx.strokeStyle = border; ctx.lineWidth = Math.max(1.5, fs / 10); ctx.stroke(); }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `600 ${fs * 0.85}px "Segoe UI", Arial, sans-serif`;
  ctx.fillStyle = fg;
  lines.forEach((l, i) => ctx.fillText(l, x, y - h / 2 + fs * 0.25 + fs * 0.55 + i * fs * 1.1));
  if (dates) {
    ctx.font = `400 ${fs * 0.68}px "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = "#6b7280";
    ctx.fillText(dates, x, y + h / 2 - fs * 0.55);
  }
  return { w, h };
}

/* Objektens etiketter kan dras fritt (Victors önskemål 2026-09-28). Läget
   sparas som förskjutning i meter (x.lbl = [dx, dy]) från standardläget, så
   att etiketten följer med när objektet flyttas. En streckad stödlinje visar
   vilket objekt etiketten hör till. Rutorna sparas för träffytan vid klick. */
let labelBoxes = new Map(); // id -> { x, y, w, h } i canvas-px (bara skärmen)
function siteLabel(ctx, x, def, text, fs, bg, fg, border, dates) {
  let p = def;
  if (x.lbl && (x.lbl[0] || x.lbl[1])) {
    const o = mToPx([0, 0]), q = mToPx(x.lbl);
    p = [def[0] + q[0] - o[0], def[1] + q[1] - o[1]];
    if (Math.hypot(p[0] - def[0], p[1] - def[1]) > fs * 1.2) {
      ctx.save();
      ctx.strokeStyle = border || "#6b7280"; ctx.fillStyle = border || "#6b7280";
      ctx.lineWidth = Math.max(1, fs / 14); ctx.setLineDash([fs * 0.3, fs * 0.2]);
      ctx.beginPath(); ctx.moveTo(def[0], def[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(def[0], def[1], Math.max(2, fs * 0.15), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  const r = labelBox(ctx, p[0], p[1], text, fs, bg, fg, border, dates);
  if (x.id && ctx.canvas && ctx.canvas.id === "topCanvas") labelBoxes.set(x.id, { x: p[0], y: p[1], w: r.w, h: r.h });
  return r;
}
function labelAt(px) {
  const vis = siteItems.filter(siteShown).slice().reverse();
  for (const x of vis) {
    const b = labelBoxes.get(x.id);
    if (b && Math.abs(px[0] - b.x) <= b.w / 2 && Math.abs(px[1] - b.y) <= b.h / 2) return x;
  }
  return null;
}

function strokePath(ctx, P, closed, st) {
  ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); if (closed) ctx.closePath();
  ctx.strokeStyle = st.color; ctx.lineWidth = st.lw; ctx.lineCap = st.cap; ctx.setLineDash(st.dash); ctx.stroke(); ctx.setLineDash([]);
}

function drawSiteItem(ctx, x, fontPx, ppm, selected, barriers = []) {
  const st = siteStyle(x, fontPx);
  const dates = datesText(x);
  const k = SITE_KINDS[x.type];
  const lock = x.locked ? " 🔒" : "";
  ctx.setLineDash([]);
  if (x.type === "note") {
    const [a, t] = x.pts.map(mToPx);
    ctx.strokeStyle = st.color; ctx.fillStyle = st.color; ctx.lineWidth = st.lw; ctx.setLineDash(st.dash);
    ctx.beginPath(); ctx.moveTo(t[0], t[1]); ctx.lineTo(a[0], a[1]); ctx.stroke(); ctx.setLineDash([]);
    const ang = Math.atan2(a[1] - t[1], a[0] - t[0]), hs = st.fs * 0.7;
    ctx.beginPath(); ctx.moveTo(a[0], a[1]);
    ctx.lineTo(a[0] - hs * Math.cos(ang - 0.4), a[1] - hs * Math.sin(ang - 0.4));
    ctx.lineTo(a[0] - hs * Math.cos(ang + 0.4), a[1] - hs * Math.sin(ang + 0.4)); ctx.closePath(); ctx.fill();
    siteLabel(ctx, { ...x, lbl: null }, [t[0], t[1]], wrapText(x.text || "", 32) + lock, st.fs, "#fffbe6", "#111827", st.color, dates);
  } else if (x.type === "sketch") {
    // Frihand: mjuk linje, lite tjockare än vanliga linjer så den syns ute på bygget.
    const P = x.pts.map(mToPx);
    ctx.save();
    ctx.strokeStyle = st.color; ctx.lineWidth = st.lw * 1.6; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.setLineDash(st.dash);
    ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke();
    if (selected) { ctx.strokeStyle = "rgba(11,95,255,.35)"; ctx.lineWidth = st.lw * 4; ctx.setLineDash([]); ctx.stroke(); }
    ctx.restore();
    if (x.name) siteLabel(ctx, x, P[P.length - 1], x.name + lock, st.fs, "#fff", "#111827", st.color, dates);
  } else if (x.type === "crane") {
    const [c] = x.pts.map(mToPx), r = craneRadius(x) * ppm;
    const chart = parseChart(x.chart);
    if (chart.length) {
      // Lyftkurva: zoner från yttersta (lägst kapacitet) till innersta.
      const zc = ["#16a34a", "#65a30d", "#ca8a04", "#ea580c", "#dc2626"];
      for (let i = chart.length - 1; i >= 0; i--) {
        const col = zc[Math.round((chart.length - 1 - i) * (zc.length - 1) / Math.max(1, chart.length - 1))] || st.color;
        ctx.beginPath(); ctx.arc(c[0], c[1], chart[i].r * ppm, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(col, 0.13); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, st.lw * 0.7); ctx.setLineDash(st.dash); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = `700 ${st.fs * 0.75}px "Segoe UI", Arial`; ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.lineWidth = 3; ctx.strokeStyle = "#fff"; ctx.strokeText(`${chart[i].t} t · ${fmtM(chart[i].r)} m`, c[0], c[1] - chart[i].r * ppm - 2);
        ctx.fillStyle = col; ctx.fillText(`${chart[i].t} t · ${fmtM(chart[i].r)} m`, c[0], c[1] - chart[i].r * ppm - 2);
      }
    } else {
      ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(st.color, 0.1); ctx.fill();
      ctx.strokeStyle = st.color; ctx.lineWidth = st.lw; ctx.setLineDash(st.dash); ctx.stroke(); ctx.setLineDash([]);
    }
    const s = st.fs * 0.9;
    ctx.fillStyle = st.color; ctx.fillRect(c[0] - s / 2, c[1] - s / 2, s, s);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(c[0] - s / 2, c[1] - s / 2); ctx.lineTo(c[0] + s / 2, c[1] + s / 2); ctx.moveTo(c[0] + s / 2, c[1] - s / 2); ctx.lineTo(c[0] - s / 2, c[1] + s / 2); ctx.stroke();
    siteLabel(ctx, x, [c[0], c[1] + s * 1.6], `${x.name || "Kran"} · ${fmtM(craneRadius(x))} m${x.capacity ? ` · ${x.capacity} t` : ""}${lock}`, st.fs, "#fff", "#111827", st.color, dates);
  } else if (isRect(x)) {
    const g = rectGeom(x), P = rectCorners(g).map(mToPx);
    ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
    ctx.fillStyle = hexToRgba(st.color, 0.2); ctx.fill();
    if (x.type === "storage") { // skraffering
      ctx.save(); ctx.clip(); ctx.strokeStyle = hexToRgba(st.color, 0.35); ctx.lineWidth = 1;
      const xs = P.map(p => p[0]), ys = P.map(p => p[1]), minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      for (let d = minX - (maxY - minY); d < maxX; d += st.fs * 0.6) { ctx.beginPath(); ctx.moveTo(d, maxY); ctx.lineTo(d + (maxY - minY), minY); ctx.stroke(); }
      ctx.restore();
    }
    strokePath(ctx, P, true, st);
    const sym = x.type === "symbol" ? SYMBOLS[x.sym] || {} : null;
    if (sym && sym.outrigger) { // stödben: fotavtryck runt fordonet
      const og = { cx: g.cx, cy: g.cy, w: sym.outrigger, h: Math.min(g.h, sym.outrigger), rot: g.rot };
      const O = rectCorners(og).map(mToPx);
      strokePath(ctx, O, true, { ...st, dash: [st.fs * 0.5, st.fs * 0.35], lw: Math.max(1, st.lw * 0.7) });
      O.forEach(p => { ctx.fillStyle = st.color; ctx.fillRect(p[0] - st.lw * 1.6, p[1] - st.lw * 1.6, st.lw * 3.2, st.lw * 3.2); });
    }
    const c = mToPx([g.cx, g.cy]);
    const icon = sym ? sym.icon || "🧩" : k.icon;
    siteLabel(ctx, x, [c[0], c[1]], `${icon} ${x.name || (sym ? sym.label : k.label)}${lock}\n${fmtM(g.w)} × ${fmtM(g.h)} m`, st.fs, "rgba(255,255,255,.9)", "#111827", null, dates);
  } else if (x.type === "gate") {
    const [e1, e2] = gateEnds(x).map(mToPx), c = mToPx(x.pts[0]);
    strokePath(ctx, [e1, e2], false, { ...st, lw: st.lw * 2 });
    [e1, e2].forEach(p => { ctx.fillStyle = st.color; ctx.fillRect(p[0] - st.lw * 1.5, p[1] - st.lw * 1.5, st.lw * 3, st.lw * 3); });
    // öppningsbåge
    const ang = Math.atan2(e2[1] - e1[1], e2[0] - e1[0]), len = Math.hypot(e2[0] - e1[0], e2[1] - e1[1]);
    ctx.beginPath(); ctx.arc(e1[0], e1[1], len, ang - Math.PI / 2, ang); ctx.strokeStyle = hexToRgba(st.color, 0.5); ctx.lineWidth = Math.max(1, st.lw / 2); ctx.setLineDash([st.fs * 0.3, st.fs * 0.3]); ctx.stroke(); ctx.setLineDash([]);
    siteLabel(ctx, x, [c[0], c[1] + st.fs * 1.4], `${k.icon} ${x.name || "Grind"} · ${fmtM(Number(x.w) || 5)} m${lock}`, st.fs, "#fff", "#111827", st.color, dates);
  } else if (x.type === "fence") {
    const P = x.pts.map(mToPx);
    strokePath(ctx, P, false, st);
    P.forEach(p => { ctx.fillStyle = st.color; ctx.fillRect(p[0] - st.lw, p[1] - st.lw, st.lw * 2, st.lw * 2); });
    const m = P[Math.floor((P.length - 1) / 2)], n = P[Math.floor((P.length - 1) / 2) + 1] || m;
    siteLabel(ctx, x, [(m[0] + n[0]) / 2, (m[1] + n[1]) / 2 - st.fs], `${x.name || "Stängsel"} · ${fmtM(polyLength(x.pts))} m${lock}`, st.fs, "#fff", "#111827", st.color, dates);
  } else if (x.type === "route") {
    const P = x.pts.map(mToPx);
    const bw = Math.max(st.lw * 2, (Number(x.w) || 4) * ppm);
    ctx.save();
    ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.strokeStyle = hexToRgba(st.color, 0.22); ctx.lineWidth = bw; ctx.stroke();
    ctx.restore();
    strokePath(ctx, P, false, { ...st, dash: st.dash.length ? st.dash : [st.fs * 0.6, st.fs * 0.4] });
    // Pilar i körriktningen (båda hållen om dubbelriktad).
    const step = Math.max(st.fs * 5, 60);
    const arrow = (p, ang) => { const a = st.fs * 0.55; ctx.beginPath(); ctx.moveTo(p[0] + Math.cos(ang) * a, p[1] + Math.sin(ang) * a); ctx.lineTo(p[0] + Math.cos(ang + 2.5) * a, p[1] + Math.sin(ang + 2.5) * a); ctx.lineTo(p[0] + Math.cos(ang - 2.5) * a, p[1] + Math.sin(ang - 2.5) * a); ctx.closePath(); ctx.fillStyle = st.color; ctx.fill(); };
    let carry = step / 2;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      for (let d = carry; d < len; d += step) {
        const q = [a[0] + (b[0] - a[0]) * d / len, a[1] + (b[1] - a[1]) * d / len];
        arrow(q, ang);
        if (x.twoWay) arrow([q[0] - Math.cos(ang) * st.fs * 1.4, q[1] - Math.sin(ang) * st.fs * 1.4], ang + Math.PI);
      }
      carry = ((carry - len) % step + step) % step;
    }
    const conflicts = routeConflicts(x, barriers.filter(b => b.id !== x.id));
    conflicts.forEach(h => {
      const q = mToPx(h.pt), r = st.fs * 0.8;
      ctx.beginPath(); ctx.moveTo(q[0], q[1] - r); ctx.lineTo(q[0] + r, q[1] + r * 0.8); ctx.lineTo(q[0] - r, q[1] + r * 0.8); ctx.closePath();
      ctx.fillStyle = "#dc2626"; ctx.fill(); ctx.fillStyle = "#fff"; ctx.font = `800 ${r}px Arial`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("!", q[0], q[1] + r * 0.15);
    });
    const mi = Math.floor((P.length - 1) / 2), m = P[mi], n = P[mi + 1] || m;
    siteLabel(ctx, x, [(m[0] + n[0]) / 2, (m[1] + n[1]) / 2 - st.fs * 1.4], `➡ ${x.name || "Transportväg"} · ${fmtM(polyLength(x.pts))} m${x.twoWay ? " · dubbelriktad" : ""}${lock}${conflicts.length ? "\n⚠ korsar avspärrning" : ""}`, st.fs, conflicts.length ? "#fef2f2" : "#fff", conflicts.length ? "#b91c1c" : "#111827", conflicts.length ? "#dc2626" : st.color, dates);
  } else if (x.type === "barrier") {
    const P = x.pts.map(mToPx);
    ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
    ctx.fillStyle = hexToRgba(st.color, 0.16); ctx.fill();
    strokePath(ctx, P, true, st);
    const c = centroidOf(P);
    siteLabel(ctx, x, [c[0], c[1]], `${k.icon} ${x.name || "Avspärrning"}${lock}\n${fmtM(polyAreaM(x.pts))} m²`, st.fs, "rgba(255,255,255,.9)", "#111827", st.color, dates);
  }
  if (selected && x.type !== "note") {
    const P = sitePoints(x).map(mToPx);
    if (x.type === "crane") { const c = P[0], r = craneRadius(x) * ppm; ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, Math.PI * 2); }
    else { ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); if (x.type !== "fence" && x.type !== "gate" && x.type !== "route") ctx.closePath(); }
    ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = Math.max(1.5, fontPx / 10); ctx.setLineDash([fontPx / 2, fontPx / 3]); ctx.stroke(); ctx.setLineDash([]);
  }
}
function wrapText(t, n) {
  return String(t).split("\n").map(line => {
    const words = line.split(" "), out = []; let cur = "";
    words.forEach(w => { if ((cur + " " + w).trim().length > n && cur) { out.push(cur); cur = w; } else cur = (cur + " " + w).trim(); });
    if (cur) out.push(cur);
    return out.join("\n");
  }).join("\n");
}
function drawSitePreview(ctx, fontPx, ppm) {
  const pts = siteTool.pts.concat(siteTool.cursor ? [siteTool.cursor] : []);
  let tmp = { id: "_preview", type: siteTool.kind, pts, name: "", text: "…", radius: 40, sym: siteTool.sym, w: 4 };
  if (tmp.type === "symbol") {
    const sy = SYMBOLS[siteTool.sym] || { w: 3, h: 6 };
    tmp = { ...tmp, cx: pts[pts.length - 1][0], cy: pts[pts.length - 1][1], w: sy.w, h: sy.h, rot: 0 };
    ctx.save(); ctx.globalAlpha = 0.7; drawSiteItem(ctx, tmp, fontPx, ppm, false); ctx.restore();
    return;
  }
  if (isRect(tmp)) {
    if (pts.length < 2) return;
    const [a, b] = pts; tmp = { ...tmp, cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]), rot: 0 };
  }
  if (tmp.type === "note" && pts.length < 2) { const p = mToPx(pts[0]); ctx.beginPath(); ctx.arc(p[0], p[1], fontPx / 3, 0, Math.PI * 2); ctx.fillStyle = "#111827"; ctx.fill(); return; }
  ctx.save(); ctx.globalAlpha = 0.7; drawSiteItem(ctx, tmp, fontPx, ppm, false); ctx.restore();
}

// ---------------------------------------------------------------------
// Handtag: flytta, ändra form/storlek, rotera (efter att objektet placerats)
// ---------------------------------------------------------------------
/* Handtag i modellkoordinater: { kind, i?, m: [x, y] }. */
function siteHandles(x, fontPx, ppm) {
  const off = (fontPx * 2.2) / ppm; // rotationshandtagets avstånd i meter
  if (x.type === "note") return [{ kind: "vertex", i: 0, m: x.pts[0] }, { kind: "vertex", i: 1, m: x.pts[1] }];
  if (x.type === "sketch") return []; // frihand: dra i strecket för att flytta det
  if (x.type === "crane") { const [c] = x.pts; return [{ kind: "radius", m: [c[0] + craneRadius(x), c[1]] }]; }
  if (isRect(x)) {
    const g = rectGeom(x), C = rectCorners(g);
    const top = [g.cx - Math.sin(g.rot) * (g.h / 2 + off), g.cy + Math.cos(g.rot) * (g.h / 2 + off)];
    return [...C.map((m, i) => ({ kind: "corner", i, m })), { kind: "rotate", m: top }];
  }
  if (x.type === "gate") return gateEnds(x).map((m, i) => ({ kind: "gateEnd", i, m }));
  // Linjer och ytor: punkter, "+" mitt på varje sträcka (dra för att lägga
  // till en punkt) och rotation. Rotationen ligger under objektet eftersom
  // texten sitter ovanför linjen.
  const closed = x.type === "barrier";
  const mids = [];
  for (let i = 0; i < x.pts.length - (closed ? 0 : 1); i++) {
    const a = x.pts[i], b = x.pts[(i + 1) % x.pts.length];
    mids.push({ kind: "insert", i, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
  }
  const ys = x.pts.map(p => p[1]), c = centroidOf(x.pts);
  return [...x.pts.map((m, i) => ({ kind: "vertex", i, m })), ...mids, { kind: "rotate", m: [c[0], Math.min(...ys) - off] }];
}
function drawHandles(ctx, x, fontPx, ppm) {
  const hs = Math.max(5, fontPx * 0.32);
  ctx.save();
  ctx.setLineDash([]);
  siteHandles(x, fontPx, ppm).forEach(h => {
    const [px, py] = mToPx(h.m);
    if (h.kind === "rotate") {
      const c = mToPx(isRect(x) ? [rectGeom(x).cx, rectGeom(x).cy] : centroidOf(x.pts));
      ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(px, py); ctx.stroke();
      ctx.beginPath(); ctx.arc(px, py, hs * 1.1, 0, Math.PI * 2); ctx.fillStyle = "#0b5fff"; ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = `700 ${hs * 1.6}px Arial`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("↻", px, py + 1);
    } else if (h.kind === "insert") {
      const r = hs * 0.8;
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fill();
      ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px - r * 0.55, py); ctx.lineTo(px + r * 0.55, py); ctx.moveTo(px, py - r * 0.55); ctx.lineTo(px, py + r * 0.55); ctx.stroke();
    } else {
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = 2;
      ctx.fillRect(px - hs, py - hs, hs * 2, hs * 2); ctx.strokeRect(px - hs, py - hs, hs * 2, hs * 2);
    }
  });
  ctx.restore();
}

let siteClickedId = null; // senast klickade objekt: i ytor kan texten dras först efter ett klick
let siteDrag = null; // { orig, work, handle, startM, startPx, moved }
function currentFontPx() { return planFontPx(); }
function handleAt(x, pdfPt) {
  const p = toPx(pdfPt), tol = Math.max(10, 9 / view.scale) + currentFontPx() * 0.2;
  const hs = siteHandles(x, currentFontPx(), pxPerMeter());
  let best = null, bd = Infinity;
  hs.forEach(h => { const q = mToPx(h.m), d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < tol && d < bd) { best = h; bd = d; } });
  return best;
}
// ---------------------------------------------------------------------
// Fäst mot linjer och hörn (Victors önskemål 2026-09-28): ritningens egna
// linjer (vektorer ur PDF:en), zonernas kanter och andra objekts hörn/kanter.
// ---------------------------------------------------------------------
let snapIndex = null, snapIndexFor = null; // { cell, grid: Map("ix,iy" -> [seg]) } i PDF-punkter
async function buildSnapIndex() {
  if (!page || snapIndexFor === page) return;
  snapIndexFor = page;
  snapIndex = null;
  try {
    const ops = await page.getOperatorList();
    const O = pdfjsLib.OPS;
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [], segs = [];
    const T = (x, y) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
    for (let i = 0; i < ops.fnArray.length && segs.length < 400000; i++) {
      const fn = ops.fnArray[i], a = ops.argsArray[i];
      if (fn === O.save) stack.push(ctm.slice());
      else if (fn === O.restore) ctm = stack.pop() || ctm;
      else if (fn === O.transform) ctm = mulAffine(ctm, a);
      else if (fn === O.constructPath) {
        const [pops, coords] = a;
        let j = 0, cur = null, start = null;
        for (const op of pops) {
          if (op === O.moveTo) { cur = T(coords[j], coords[j + 1]); start = cur; j += 2; }
          else if (op === O.lineTo) { const n = T(coords[j], coords[j + 1]); j += 2; if (cur) segs.push([cur, n]); cur = n; }
          else if (op === O.curveTo) { const n = T(coords[j + 4], coords[j + 5]); j += 6; cur = n; }
          else if (op === O.curveTo2 || op === O.curveTo3) { const n = T(coords[j + 2], coords[j + 3]); j += 4; cur = n; }
          else if (op === O.closePath) { if (cur && start) segs.push([cur, start]); cur = start; }
          else if (op === O.rectangle) {
            const [x, y, w, h] = coords.slice(j, j + 4); j += 4;
            const p = [T(x, y), T(x + w, y), T(x + w, y + h), T(x, y + h)];
            for (let q = 0; q < 4; q++) segs.push([p[q], p[(q + 1) % 4]]);
            cur = p[0]; start = p[0];
          }
        }
      }
    }
    const cell = 25, grid = new Map();
    segs.forEach(sg => {
      const [a, b] = sg;
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 2) return;
      const x0 = Math.floor(Math.min(a[0], b[0]) / cell), x1 = Math.floor(Math.max(a[0], b[0]) / cell);
      const y0 = Math.floor(Math.min(a[1], b[1]) / cell), y1 = Math.floor(Math.max(a[1], b[1]) / cell);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) return; // mycket långa linjer: bara ändpunkterna räknas via cellerna nedan
      for (let ix = x0; ix <= x1; ix++) for (let iy = y0; iy <= y1; iy++) {
        const k = ix + "," + iy; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(sg);
      }
    });
    snapIndex = { cell, grid };
  } catch (e) { console.warn("Kunde inte läsa ritningens linjer för fästning", e); }
}
function snapActive(e) { return $("snapOn") && $("snapOn").checked && !(e && e.altKey); }
/* Fäster en PDF-punkt: hörn/ändpunkter först, annars närmaste linje. */
function snapPdf(pdfPt, e, excludeId) {
  snapMark = null;
  if (!snapActive(e) || !viewport) return pdfPt;
  const tol = 12 / (renderScale * view.scale);
  const pts = [], segs = [];
  siteItems.filter(x => x.id !== excludeId && siteShown(x)).forEach(x => {
    const P = sitePoints(x).map(p => modelToPdf(p[0], p[1]));
    P.forEach(p => pts.push(p));
    for (let i = 1; i < P.length; i++) segs.push([P[i - 1], P[i]]);
    if (x.type !== "fence" && x.type !== "route" && x.type !== "note" && P.length > 2) segs.push([P[P.length - 1], P[0]]);
  });
  ((plan && plan.zones) || []).forEach(z => (z.polys || []).forEach(poly => poly.forEach((p, i) => { pts.push(p); segs.push([p, poly[(i + 1) % poly.length]]); })));
  for (const idx of [snapIndex, typeof cadSnapIndex !== "undefined" ? cadSnapIndex : null]) {
    if (!idx) continue;
    const c = idx.cell, ix = Math.floor(pdfPt[0] / c), iy = Math.floor(pdfPt[1] / c);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) (idx.grid.get((ix + dx) + "," + (iy + dy)) || []).forEach(sg => { segs.push(sg); pts.push(sg[0], sg[1]); });
  }
  let best = null, bd = tol;
  pts.forEach(p => { const d = Math.hypot(p[0] - pdfPt[0], p[1] - pdfPt[1]); if (d < bd) { bd = d; best = p; } });
  if (best) { snapMark = { pt: best, kind: "punkt" }; return best; }
  // Skärningspunkt mellan två närliggande linjer (t.ex. rutnätskryss).
  const near = segs.filter(([a, b]) => distToSeg(pdfPt, a, b) < tol).slice(0, 40);
  for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
    const h = segIntersect(near[i][0], near[i][1], near[j][0], near[j][1]);
    if (h) { const d = Math.hypot(h[0] - pdfPt[0], h[1] - pdfPt[1]); if (d < bd) { bd = d; best = h; } }
  }
  if (best) { snapMark = { pt: best, kind: "kryss" }; return best; }
  near.forEach(([a, b]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((pdfPt[0] - a[0]) * dx + (pdfPt[1] - a[1]) * dy) / l)) : 0;
    const q = [a[0] + t * dx, a[1] + t * dy], d = Math.hypot(q[0] - pdfPt[0], q[1] - pdfPt[1]);
    if (d < bd) { bd = d; best = q; }
  });
  if (best) snapMark = { pt: best, kind: "linje" };
  return best || pdfPt;
}
/* Shift nedtryckt: låser riktningen från föregående punkt till jämna 5°-steg
   (0°, 5°, 10° … räknat mot ritningens horisontella linjer). Längden tas från
   musen – eller från en fästpunkt, projicerad på den låsta riktningen. */
const ANGLE_STEP = 5;
function constrainPdf(pdfPt, e, prev, excludeId) {
  const snapped = snapPdf(pdfPt, e, excludeId);
  if (!e || !e.shiftKey || !prev) return snapped;
  const src = snapMark ? snapped : pdfPt;
  const dx = src[0] - prev[0], dy = src[1] - prev[1];
  if (!dx && !dy) return prev;
  const deg = Math.round(Math.atan2(-dy, dx) * 180 / Math.PI / ANGLE_STEP) * ANGLE_STEP;
  const a = deg * Math.PI / 180, ux = Math.cos(a), uy = -Math.sin(a);
  const len = dx * ux + dy * uy;
  const pt = [prev[0] + ux * len, prev[1] + uy * len];
  snapMark = { pt, kind: `${((deg % 360) + 360) % 360}°`, angle: true, from: prev };
  return pt;
}

/* Anropas från lagesplan.js vid mousedown: börjar dra ett objekt/handtag. */
function layersPointerDown(e) {
  if (!plan || !plan.calib || !viewport || siteTool || (typeof measure !== "undefined" && measure) || photoPlacing || (calib && calib.waitPdf)) return false;
  const pdfPt = toPdf(stagePoint(e));
  const sel = selectedSiteId && siteItems.find(x => x.id === selectedSiteId && siteShown(x));
  let target = sel, handle = sel ? handleAt(sel, pdfPt) : null;
  if (!handle) {
    // Etiketten ligger överst: dra den fritt (för noteringar = textens läge).
    let lt = labelAt(toPx(pdfPt));
    // Bodar, upplag och avspärrningar har texten mitt i ytan: där flyttar ett
    // drag hela objektet tills det är markerat (klicka först, dra sedan texten).
    if (lt && lt.id !== siteClickedId && (isRect(lt) || lt.type === "barrier") && pointInPoly(pdfToModel(pdfPt), sitePoints(lt))) lt = null;
    if (lt) { target = lt; handle = lt.type === "note" ? { kind: "vertex", i: 1 } : { kind: "label" }; }
    else {
      target = siteAt(pdfPt);
      if (!target) return false;
      handle = { kind: "move" };
    }
  }
  siteDrag = { orig: JSON.parse(JSON.stringify(target)), work: null, handle, startM: pdfToModel(pdfPt), startPx: [e.clientX, e.clientY], moved: false, locked: !!target.locked };
  closeSitePop();
  return true;
}
function rotatePt(p, c, a) { const s = Math.sin(a), co = Math.cos(a), dx = p[0] - c[0], dy = p[1] - c[1]; return [c[0] + dx * co - dy * s, c[1] + dx * s + dy * co]; }
function applySiteDrag(d, m) {
  const o = d.orig, h = d.handle;
  const w = JSON.parse(JSON.stringify(o));
  const dx = m[0] - d.startM[0], dy = m[1] - d.startM[1];
  if (h.kind === "move") {
    if (isRect(o)) { const g = rectGeom(o); Object.assign(w, { cx: g.cx + dx, cy: g.cy + dy, w: g.w, h: g.h, rot: g.rot }); delete w.pts; }
    else w.pts = o.pts.map(p => [p[0] + dx, p[1] + dy]);
  } else if (h.kind === "label") {
    const l = o.lbl || [0, 0];
    w.lbl = [Math.round((l[0] + dx) * 100) / 100, Math.round((l[1] + dy) * 100) / 100];
  } else if (h.kind === "vertex") {
    w.pts[h.i] = m;
  } else if (h.kind === "insert") {
    w.pts.splice(h.i + 1, 0, m);
  } else if (h.kind === "radius") {
    const nr = Math.max(1, Math.round(Math.hypot(m[0] - o.pts[0][0], m[1] - o.pts[0][1]) * 2) / 2);
    const ch = parseChart(o.chart);
    if (ch.length) { ch[ch.length - 1].r = Math.max(nr, ch.length > 1 ? ch[ch.length - 2].r + 0.5 : 1); w.chart = ch.map(c => `${c.r}:${c.t}`).join(", "); }
    else w.radius = nr;
  } else if (h.kind === "corner") {
    // Motstående hörn står still; rektangeln behåller sin vinkel.
    const g = rectGeom(o), C = rectCorners(g), opp = C[(h.i + 2) % 4];
    const ca = Math.cos(-g.rot), sa = Math.sin(-g.rot), vx = m[0] - opp[0], vy = m[1] - opp[1];
    const lx = vx * ca - vy * sa, ly = vx * sa + vy * ca;
    Object.assign(w, { cx: (m[0] + opp[0]) / 2, cy: (m[1] + opp[1]) / 2, w: Math.max(0.5, Math.abs(lx)), h: Math.max(0.5, Math.abs(ly)), rot: g.rot });
    delete w.pts;
  } else if (h.kind === "rotate") {
    const c = isRect(o) ? [rectGeom(o).cx, rectGeom(o).cy] : centroidOf(o.pts);
    let a = Math.atan2(m[1] - c[1], m[0] - c[0]) - Math.atan2(d.startM[1] - c[1], d.startM[0] - c[0]);
    const deg = a * 180 / Math.PI;
    if (!d.free) a = Math.round(deg / 5) * 5 * Math.PI / 180; // snäpp till 5°, Shift = fritt
    if (isRect(o)) { const g = rectGeom(o); Object.assign(w, { cx: g.cx, cy: g.cy, w: g.w, h: g.h, rot: g.rot + a }); delete w.pts; }
    else w.pts = o.pts.map(p => rotatePt(p, c, a));
  } else if (h.kind === "gateEnd") {
    const other = gateEnds(o)[1 - h.i];
    const c = [(m[0] + other[0]) / 2, (m[1] + other[1]) / 2];
    w.pts = [c];
    w.w = Math.max(0.5, Math.round(Math.hypot(m[0] - other[0], m[1] - other[1]) * 10) / 10);
    w.rot = h.i === 1 ? Math.atan2(m[1] - other[1], m[0] - other[0]) : Math.atan2(other[1] - m[1], other[0] - m[0]);
  }
  return w;
}
const MIN_PTS = { route: 2, fence: 2, barrier: 3 };
/* Dubbelklick på en punkt i en markerad väg/stängsel/avspärrning tar bort den. */
function removeVertexAt(pdfPt) {
  const sel = selectedSiteId && siteItems.find(x => x.id === selectedSiteId && siteShown(x));
  if (!sel || sel.locked || !MIN_PTS[sel.type]) return false;
  const h = handleAt(sel, pdfPt);
  if (!h || h.kind !== "vertex") return false;
  if (sel.pts.length <= MIN_PTS[sel.type]) { setSaveStatus(`Minst ${MIN_PTS[sel.type]} punkter behövs.`); return true; }
  const next = { ...sel, pts: sel.pts.filter((_, i) => i !== h.i), updated_at: new Date().toISOString() };
  closeSitePop();
  saveSiteItem(next, false, { prev: sel });
  return true;
}
function onSiteDragMove(e) {
  const d = siteDrag;
  if (!d) return;
  if (!d.moved && Math.hypot(e.clientX - d.startPx[0], e.clientY - d.startPx[1]) < 4) return;
  d.moved = true;
  if (d.locked) { setSaveStatus("🔒 Objektet är låst – lås upp det i redigeringsrutan för att flytta det."); return; }
  d.free = e.shiftKey;
  // Fäst handtag (inte hela objektet) mot linjer och hörn.
  const raw = toPdf(stagePoint(e));
  const m = pdfToModel(d.handle.kind === "move" || d.handle.kind === "rotate" || d.handle.kind === "label" ? raw : snapPdf(raw, e, d.orig.id));
  d.work = applySiteDrag(d, m);
  const i = siteItems.findIndex(x => x.id === d.orig.id);
  if (i >= 0) siteItems[i] = d.work;
  selectedSiteId = d.orig.id;
  if (!onSiteDragMove.raf) onSiteDragMove.raf = requestAnimationFrame(() => { onSiteDragMove.raf = 0; renderZones(); });
}
function onSiteDragUp() {
  const d = siteDrag;
  if (!d) return;
  siteDrag = null;
  if (!d.moved) { // ett klick: välj och visa redigering
    selectedSiteId = d.orig.id; siteClickedId = d.orig.id; renderZones(); openSitePop(d.orig, false);
    return;
  }
  snapMark = null;
  if (d.locked) { renderZones(); return; }
  if (d.work) saveSiteItem({ ...d.work, updated_at: new Date().toISOString() }, false, { prev: d.orig });
}

// ---------------------------------------------------------------------
// Placera, välj och redigera
// ---------------------------------------------------------------------
function startSiteTool(kind, sym) {
  if (!plan || !plan.calib) { alert("Kalibrera planen mot 3D (📐) först – noteringar och etablering placeras i modellens koordinater."); return; }
  if (siteTool && siteTool.kind === kind) { stopSiteTool(); return; }
  if (typeof stopMeasure === "function" && measure) stopMeasure();
  if (typeof cancelPhotoPlacing === "function") cancelPhotoPlacing();
  selectedSiteId = null; closeSitePop();
  siteTool = { kind, sym, pts: [], cursor: null };
  updateSiteUi();
}
function stopSiteTool() { siteTool = null; updateSiteUi(); renderZones(); }
function updateSiteUi() {
  document.querySelectorAll("[data-site]").forEach(b => b.classList.toggle("active", !!siteTool && b.dataset.site === siteTool.kind));
  const k = siteTool && SITE_KINDS[siteTool.kind];
  const hints = {
    note: ["Klicka där pilen ska peka.", "Klicka där texten ska stå."],
    crane: ["Klicka kranens placering."], gate: ["Klicka grindens mitt."],
    shed: ["Klicka första hörnet.", "Klicka motstående hörn."], storage: ["Klicka första hörnet.", "Klicka motstående hörn."],
    fence: ["Klicka punkter längs stängslet, dubbelklicka (eller Enter) för att avsluta."],
    route: ["Klicka punkter längs vägen i körriktningen, dubbelklicka (eller Enter) för att avsluta."],
    symbol: ["Klicka var symbolen ska stå (rotera den sedan med ↻)."],
    barrier: ["Klicka hörnen, dubbelklicka (eller Enter) för att avsluta."],
    sketch: ["Rita med fingret (eller musen). Varje drag sparas direkt – två fingrar zoomar/panorerar. Tryck på ✏️ igen när du är klar."]
  };
  $("siteHint").textContent = k ? `${k.icon} ${(hints[siteTool.kind][Math.min(siteTool.pts.length, hints[siteTool.kind].length - 1)])}${siteTool.pts.length ? " Håll Shift för rak linje (5°-steg)." : ""} Esc avbryter.`
    : "Klicka på ett objekt för att ändra det. Dra i det för att flytta, i de vita handtagen för att ändra form, i ⊕ för att lägga till en punkt (dubbelklicka på en punkt för att ta bort den) och i ↻ för att rotera (Shift = fritt). Texten kan dras fritt.";
  $("viewport").classList.toggle("drawing", !!siteTool || !!measure || photoPlacing || drawMode);
}
function finishSiteTool() {
  if (!siteTool) return;
  const { kind, pts } = siteTool;
  finishSiteTool.sym = siteTool.sym;
  const min = { fence: 2, barrier: 3, route: 2 }[kind];
  if (min && pts.length < min) { alert(`${SITE_KINDS[kind].label} behöver minst ${min} punkter.`); return; }
  stopSiteTool();
  const r3 = v => Math.round(v * 1000) / 1000;
  const rec = { id: ghNewId(), type: kind, name: "", layer: $("activeLayer").value || undefined, created_at: new Date().toISOString(), by: settings.userName || null };
  if (kind === "symbol") {
    const sy = SYMBOLS[siteTool && siteTool.sym || pts.sym] || SYMBOLS[finishSiteTool.sym] || { w: 3, h: 6, label: "Symbol" };
    const c = pts[0];
    Object.assign(rec, { sym: finishSiteTool.sym, cx: r3(c[0]), cy: r3(c[1]), w: sy.w, h: sy.h, rot: 0, name: sy.label });
  } else if (isRect(rec)) {
    const [a, b] = pts;
    Object.assign(rec, { cx: r3((a[0] + b[0]) / 2), cy: r3((a[1] + b[1]) / 2), w: r3(Math.abs(b[0] - a[0])), h: r3(Math.abs(b[1] - a[1])), rot: 0 });
  } else rec.pts = pts.map(p => [r3(p[0]), r3(p[1])]);
  if (kind === "note") rec.text = "";
  if (kind === "crane") { rec.radius = 40; rec.capacity = ""; rec.name = `Kran ${siteItems.filter(x => x.type === "crane").length + 1}`; }
  if (kind === "gate") { rec.w = 5; rec.rot = 0; }
  if (kind === "route") { rec.w = 4; rec.twoWay = false; }
  openSitePop(rec, true);
}
/* Frihand (Victors önskemål 2026-10-01, fältläge på iPad): med verktyget
   aktivt ritar ett drag (ett finger eller musen) ett streck i stället för att
   panorera. Varje drag sparas direkt som en egen post (kan ångras med Ctrl+Z,
   ändras/tas bort genom att klicka på det). Lyssnar i fångstfasen så att
   planens vanliga panorering inte får händelserna. */
let sketchStroke = null, sketchColor = "#e11d48", sketchWeight = 1;
function sketchActive() { return !!(siteTool && siteTool.kind === "sketch"); }
window.addEventListener("mousedown", e => {
  if (!sketchActive() || e.button !== 0 || !e.target.closest || !e.target.closest("#viewport") || !plan || !plan.calib) return;
  e.preventDefault(); e.stopImmediatePropagation();
  sketchStroke = { pts: [pdfToModel(toPdf(stagePoint(e)))], last: [e.clientX, e.clientY] };
}, true);
window.addEventListener("mousemove", e => {
  if (!sketchStroke) return;
  e.stopImmediatePropagation();
  if (Math.hypot(e.clientX - sketchStroke.last[0], e.clientY - sketchStroke.last[1]) < 3) return;
  sketchStroke.last = [e.clientX, e.clientY];
  sketchStroke.pts.push(pdfToModel(toPdf(stagePoint(e))));
  if (!sketchStroke.raf) sketchStroke.raf = requestAnimationFrame(() => { if (sketchStroke) sketchStroke.raf = 0; renderZones(); });
}, true);
window.addEventListener("mouseup", e => {
  if (!sketchStroke) return;
  e.stopImmediatePropagation();
  const pts = sketchStroke.pts; sketchStroke = null;
  if (pts.length < 2) { renderZones(); return; }
  const r3 = v => Math.round(v * 1000) / 1000;
  saveSiteItem({ id: ghNewId(), type: "sketch", name: "", color: sketchColor, weight: sketchWeight, pts: pts.map(p => [r3(p[0]), r3(p[1])]),
    layer: ($("activeLayer") && $("activeLayer").value) || undefined, created_at: new Date().toISOString(), by: settings.userName || null });
}, true);

/* Klick på planen när ett verktyg är aktivt: placera. (Val/drag av befintliga
   objekt sköts av layersPointerDown.) */
function siteToolPrevPdf() {
  const p = siteTool && siteTool.pts[siteTool.pts.length - 1];
  return p ? modelToPdf(p[0], p[1]) : null;
}
function layersClick(pdfPt) {
  if (!plan || !plan.calib) return false;
  if (siteTool && siteTool.kind === "sketch") return true; // frihand ritas med drag, inte klick
  if (siteTool) {
    siteTool.pts.push(pdfToModel(constrainPdf(pdfPt, window.event, siteToolPrevPdf())));
    const need = SITE_KINDS[siteTool.kind].clicks;
    if (need && siteTool.pts.length >= need) finishSiteTool();
    else { updateSiteUi(); renderZones(); }
    return true;
  }
  if (selectedSiteId) { selectedSiteId = null; closeSitePop(); renderZones(); }
  return false;
}
function distToSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function siteAt(pdfPt) {
  if (!plan || !plan.calib) return null;
  const p = toPx(pdfPt), tol = Math.max(10, 8 / view.scale);
  const fontPx = currentFontPx();
  const m = pdfToModel(pdfPt);
  const lt = labelAt(p);
  if (lt) return lt;
  const vis = siteItems.filter(siteShown).slice().reverse();
  for (const x of vis) {
    if (x.type === "note") {
      const [a, t] = x.pts.map(mToPx);
      if (Math.hypot(p[0] - t[0], p[1] - t[1]) < fontPx * 3 || distToSeg(p, a, t) < tol) return x;
    } else if (x.type === "crane") {
      const c = mToPx(x.pts[0]);
      if (Math.hypot(p[0] - c[0], p[1] - c[1]) < fontPx * 1.5) return x;
    } else if (x.type === "gate") {
      const [e1, e2] = gateEnds(x).map(mToPx);
      if (distToSeg(p, e1, e2) < tol + fontPx * 0.5) return x;
    } else if (isRect(x) || x.type === "barrier") {
      if (pointInPoly(m, sitePoints(x))) return x;
    } else if (x.type === "fence" || x.type === "route" || x.type === "sketch") {
      const P = x.pts.map(mToPx);
      for (let i = 1; i < P.length; i++) if (distToSeg(p, P[i - 1], P[i]) < tol) return x;
    }
  }
  return null;
}
function layersTipHtml(pdfPt) {
  if (siteTool || siteDrag) return null;
  const x = siteAt(pdfPt);
  if (!x) return null;
  const k = SITE_KINDS[x.type];
  const when = datesText(x);
  const body = x.type === "note" ? escHtml(x.text || "") : x.type === "crane" ? `Räckvidd ${x.radius} m${x.capacity ? `, ${escHtml(x.capacity)} t` : ""}` : "";
  return `${k.icon} <b>${escHtml(x.name || (x.type === "note" ? (x.layer || "Notering") : k.label))}</b>${body ? "<br>" + body : ""}${when ? `<br>${escHtml(when)}` : ""}<br><span style="opacity:.7">Klicka för att ändra · dra för att flytta · dra i texten för att flytta bara texten (i en yta: klicka först)</span>`;
}

function openSitePop(rec, isNew) {
  const pop = $("sitePop");
  const k = SITE_KINDS[rec.type];
  const layers = noteLayers();
  const g = isRect(rec) ? rectGeom(rec) : null;
  const color = rec.color || defaultColorOf(rec);
  const symDef = rec.type === "symbol" ? SYMBOLS[rec.sym] || { label: "Symbol", icon: "🧩" } : null;
  const dash = rec.dash || SITE_DEFAULT_DASH[rec.type];
  const opt = (v, cur, label) => `<option value="${v}"${String(cur) === String(v) ? " selected" : ""}>${label}</option>`;
  const tsPct = Math.round((Number(rec.textSize) || 1) * 100);
  pop.innerHTML = `
    <b>${symDef ? symDef.icon + " " + escHtml(symDef.label) : `${k.icon} ${isNew ? "Ny" : ""} ${k.label.toLowerCase()}`}</b>
    ${rec.type === "note" ? `
      <label>Text</label><textarea class="sp-text">${escHtml(rec.text || "")}</textarea>`
    : `<label>Namn</label><input type="text" class="sp-name" value="${escHtml(rec.name || "")}" placeholder="${escHtml(symDef ? symDef.label : k.label)}" />`}
    <label>Lager</label>
    <select class="sp-layer">${layers.map(l => `<option value="${escHtml(l)}"${l === layerOf(rec) ? " selected" : ""}>${escHtml(ulName(l))}</option>`).join("")}<option value="__new">＋ Nytt lager…</option></select>
    ${rec.type === "crane" ? `<div class="row2"><div><label>Räckvidd (m)</label><input type="text" class="sp-radius" value="${escHtml(String(rec.radius ?? 40))}" /></div><div><label>Kapacitet (t)</label><input type="text" class="sp-cap" value="${escHtml(String(rec.capacity ?? ""))}" /></div></div>
      <label>Lyftkurva <span class="muted">(radie:ton, t.ex. 20:5, 30:3.5, 40:2)</span></label><input type="text" class="sp-chart" value="${escHtml(rec.chart || "")}" placeholder="20:5, 40:2" />` : ""}
    ${rec.type === "route" ? `<div class="row2"><div><label>Bredd (m)</label><input type="text" class="sp-rw" value="${fmtIn(Number(rec.w) || 4)}" /></div><div><label>&nbsp;</label><label style="display:flex;gap:4px;align-items:center;margin:0;"><input type="checkbox" class="sp-two"${rec.twoWay ? " checked" : ""} style="width:auto;" /> Dubbelriktad</label></div></div>
      <button type="button" class="sp-reverse" style="margin-top:4px;">⇄ Vänd körriktning</button>` : ""}
    ${g ? `<div class="row2"><div><label>Bredd (m)</label><input type="text" class="sp-w" value="${fmtIn(g.w)}" /></div><div><label>Längd (m)</label><input type="text" class="sp-h" value="${fmtIn(g.h)}" /></div><div><label>Vinkel (°)</label><input type="text" class="sp-rot" value="${Math.round(g.rot * 180 / Math.PI)}" /></div></div>` : ""}
    ${rec.type === "gate" ? `<div class="row2"><div><label>Bredd (m)</label><input type="text" class="sp-gw" value="${fmtIn(Number(rec.w) || 5)}" /></div><div><label>Vinkel (°)</label><input type="text" class="sp-grot" value="${Math.round((rec.rot || 0) * 180 / Math.PI)}" /></div></div>` : ""}
    <div class="row2">
      <div><label>Färg</label><input type="color" class="sp-color" value="${escHtml(color)}" /></div>
      <div><label>Linje</label><select class="sp-dash">${opt("solid", dash, "Heldragen")}${opt("dashed", dash, "Streckad")}${opt("dotted", dash, "Prickad")}</select></div>
      <div><label>Tjocklek</label><select class="sp-weight">${opt(0.6, rec.weight || 1, "Tunn")}${opt(1, rec.weight || 1, "Normal")}${opt(1.8, rec.weight || 1, "Tjock")}</select></div>
    </div>
    <label>Textstorlek</label>
    <div style="display:flex;gap:6px;align-items:center;">
      <input type="range" class="sp-tsr" min="40" max="400" step="5" value="${tsPct}" style="flex:1;min-width:0;" />
      <input type="text" class="sp-ts" value="${tsPct}" inputmode="numeric" style="width:52px;text-align:right;" /><span class="muted">%</span>
    </div>
    ${rec.lbl && rec.type !== "note" ? `<button type="button" class="sp-lblreset" style="margin-top:6px;" title="Flytta tillbaka texten till objektet">↺ Återställ textens läge</button>` : ""}
    <div class="row2"><div><label>Från</label><input type="date" class="sp-from" value="${escHtml(rec.from || "")}" /></div><div><label>Till</label><input type="date" class="sp-to" value="${escHtml(rec.to || "")}" /></div></div>
    <div class="muted" style="margin-top:2px;">Tomt = alltid synlig. Datumen visas i grått vid objektet.</div>
    <label style="display:flex;gap:6px;align-items:center;margin-top:6px;color:var(--text);"><input type="checkbox" class="sp-lock"${rec.locked ? " checked" : ""} style="width:auto;" /> 🔒 Lås (kan inte flyttas av misstag)</label>
    <div class="acts">${isNew ? "<span></span>" : `<span><button class="sp-del" title="Ta bort">🗑️</button> <button class="sp-dup" title="Kopiera objektet">⧉ Kopiera</button></span>`}<span><button class="sp-cancel">Avbryt</button> <button class="sp-save primary">Spara</button></span></div>`;
  pop.classList.remove("hidden");
  const anchor = mToPx(isRect(rec) ? [rectGeom(rec).cx, rectGeom(rec).cy] : rec.pts[rec.pts.length - 1]);
  const r = $("viewport").getBoundingClientRect();
  const sx = view.tx + anchor[0] * view.scale, sy = view.ty + anchor[1] * view.scale;
  pop.style.left = `${Math.max(8, Math.min(r.width - pop.offsetWidth - 8, sx + 16))}px`;
  pop.style.top = `${Math.max(8, Math.min(r.height - pop.offsetHeight - 8, sy + 16))}px`;
  const first = pop.querySelector(".sp-text, .sp-name"); if (first) first.focus();
  pop.querySelector(".sp-cancel").onclick = () => { closeSitePop(); if (isNew) renderZones(); };
  const num = (c, def) => { const el = pop.querySelector(c); const v = el ? Number(String(el.value).replace(",", ".")) : NaN; return Number.isFinite(v) ? v : def; };
  // Textstorlek: reglage och siffror hänger ihop, och planen visar ändringen direkt.
  const tsR = pop.querySelector(".sp-tsr"), tsT = pop.querySelector(".sp-ts");
  const tsValue = () => { const v = num(".sp-ts", tsPct); return Math.max(0.2, Math.min(6, Math.round(v) / 100)); };
  const live = siteItems.findIndex(x => x.id === rec.id);
  popPreview = live >= 0 ? { id: rec.id, orig: siteItems[live] } : null;
  const preview = patch => {
    if (!popPreview) return;
    const i = siteItems.findIndex(x => x.id === rec.id);
    if (i >= 0) { siteItems[i] = { ...siteItems[i], ...patch }; renderZones(); }
  };
  tsR.oninput = () => { tsT.value = tsR.value; preview({ textSize: tsValue() }); };
  tsT.oninput = () => { const v = num(".sp-ts", NaN); if (Number.isFinite(v)) { tsR.value = Math.max(40, Math.min(400, v)); preview({ textSize: tsValue() }); } };
  const lblReset = pop.querySelector(".sp-lblreset");
  if (lblReset) lblReset.onclick = () => { if (popPreview) popPreview.lblReset = true; preview({ lbl: null }); lblReset.disabled = true; lblReset.textContent = "↺ Texten återställd"; };
  pop.querySelector(".sp-save").onclick = () => {
    const v = c => { const el = pop.querySelector(c); return el ? el.value.trim() : undefined; };
    const next = { ...rec, from: v(".sp-from") || null, to: v(".sp-to") || null, updated_at: new Date().toISOString() };
    if (next.from && next.to && next.from > next.to) { alert("Från-datumet måste vara före till-datumet."); return; }
    next.color = v(".sp-color") === defaultColorOf(rec) ? null : v(".sp-color");
    next.dash = v(".sp-dash"); next.weight = Number(v(".sp-weight")); next.textSize = tsValue();
    if (popPreview && popPreview.lblReset) next.lbl = null;
    let layer = v(".sp-layer");
    if (layer === "__new") { layer = (prompt("Namn på det nya lagret:", "") || "").trim(); if (!layer) return; createLayer(layer); }
    next.layer = layer || defaultLayerOf(rec);
    ls("ul:" + next.layer).visible = true; saveLayerState();
    next.locked = pop.querySelector(".sp-lock").checked;
    if (rec.type === "note") {
      next.text = pop.querySelector(".sp-text").value.trim();
      if (!next.text) { alert("Skriv en text för noteringen."); return; }
    } else next.name = v(".sp-name") || "";
    if (rec.type === "crane") {
      const rad = num(".sp-radius", 40); next.radius = rad > 0 ? rad : 40; next.capacity = v(".sp-cap") || "";
      const ch = parseChart(v(".sp-chart"));
      if (v(".sp-chart") && !ch.length) { alert("Lyftkurvan förstås inte. Skriv t.ex. 20:5, 40:2 (radie i meter : ton)."); return; }
      next.chart = ch.length ? ch.map(c => `${c.r}:${c.t}`).join(", ") : "";
    }
    if (rec.type === "route") { next.w = Math.max(0.5, num(".sp-rw", 4)); next.twoWay = pop.querySelector(".sp-two").checked; }
    if (g) { Object.assign(next, { cx: g.cx, cy: g.cy, w: Math.max(0.1, num(".sp-w", g.w)), h: Math.max(0.1, num(".sp-h", g.h)), rot: num(".sp-rot", 0) * Math.PI / 180 }); delete next.pts; }
    if (rec.type === "gate") { next.w = Math.max(0.1, num(".sp-gw", 5)); next.rot = num(".sp-grot", 0) * Math.PI / 180; }
    if (popPreview) siteItems[siteItems.findIndex(x => x.id === rec.id)] = popPreview.orig; // prev för ångra = originalet
    popPreview = null;
    closeSitePop();
    selectedSiteId = next.id;
    saveSiteItem(next, false, { prev: isNew ? null : rec });
  };
  const rev = pop.querySelector(".sp-reverse");
  if (rev) rev.onclick = () => { rec.pts = rec.pts.slice().reverse(); renderZones(); rev.textContent = "⇄ Vänd körriktning ✓"; };
  const del = pop.querySelector(".sp-del");
  if (del) del.onclick = () => { if (!confirm(`Ta bort ${k.label.toLowerCase()}?`)) return; closeSitePop(); selectedSiteId = null; saveSiteItem(rec, true); };
  const dup = pop.querySelector(".sp-dup");
  if (dup) dup.onclick = () => {
    const copy = JSON.parse(JSON.stringify(rec));
    copy.id = ghNewId(); copy.created_at = new Date().toISOString();
    const off = 3; // meter snett nedåt höger
    if (isRect(copy)) { const gg = rectGeom(copy); Object.assign(copy, { cx: gg.cx + off, cy: gg.cy - off, w: gg.w, h: gg.h, rot: gg.rot }); delete copy.pts; }
    else copy.pts = copy.pts.map(p => [p[0] + off, p[1] - off]);
    closeSitePop();
    selectedSiteId = copy.id;
    saveSiteItem(copy);
  };
}
let popPreview = null; // { id, orig } – förhandsvisning i redigeringsrutan som ångras om den stängs utan att sparas
function closeSitePop() {
  if (popPreview) {
    const i = siteItems.findIndex(x => x.id === popPreview.id);
    if (i >= 0) siteItems[i] = popPreview.orig;
    popPreview = null;
    renderZones();
  }
  $("sitePop").classList.add("hidden"); $("sitePop").innerHTML = "";
}

// ---------------------------------------------------------------------
// Lagerpanelen
// ---------------------------------------------------------------------
function layerRow(key, label, opts = {}) {
  const st = ls(key, opts);
  return `<div class="layer-row${layerSel.has(key) ? " sel" : ""}${opts.sub ? " sub" : ""}${opts.cadSub ? " cad-sub" : ""}${opts.inFolder ? " in-folder" : ""}${opts.hidden ? " hidden" : ""}" data-layer="${escHtml(key)}">
      <input type="checkbox" class="lr-vis"${st.visible ? " checked" : ""} title="Visa/dölj" />
      <span class="ln" title="${escHtml(label)}">${label}</span>
      ${opts.noOpacity ? "<span></span>" : `<input type="range" class="lr-op" min="0" max="100" value="${st.opacity}" title="Genomskinlighet ${st.opacity} %" />`}
      ${opts.del ? `<button class="lr-del" title="Ta bort">🗑️</button>` : "<span></span>"}
      ${opts.extra || ""}
    </div>`;
}
function renderLayerPanel() {
  const el = $("layerList");
  if (!el) return;
  const meta = layerMeta();
  const folderIds = new Set(meta.folders.map(f => f.id));
  const inFolder = k => folderIds.has(meta.folderOf[k]) ? meta.folderOf[k] : null;
  const rowHtml = {};
  const name = (key, cls, icon) => `<span class="${cls}" title="Dubbelklicka för att byta namn">${icon} ${escHtml(layerDisplayName(key))}</span>`;
  orthosByDate().forEach(o => { rowHtml["ortho:" + o.id] = opts => layerRow("ortho:" + o.id, `<span class="or-name" title="${escHtml(o.caption ? o.caption + " – " : "")}Dubbelklicka för att ändra namn, fotodatum och bildtext">🛰 ${escHtml(o.name)}</span> <small>${escHtml(orthoDate(o))}${o.caption ? " · 💬" : ""}${o.orig && o.orig.pixel_m ? ` · ${Math.round(o.orig.pixel_m * 100)} cm/px` : ""}</small>`, { del: true, ...opts }); });
  rowHtml.pdf = opts => layerRow("pdf", name("pdf", "fx-name", "📄"), {
    extra: orthos().length ? `<label class="blend"><input type="checkbox" class="lr-mult"${layerState.pdfMultiply !== false ? " checked" : ""} /> Genomskinlig vit bakgrund över fotot</label>` : "", ...opts
  });
  rowHtml.zones = opts => layerRow("zones", name("zones", "fx-name", "🟧"), opts);
  rowHtml.objects = opts => layerRow("objects", name("objects", "fx-name", "🔷"), opts);
  userLayers().forEach(l => {
    const n = siteItems.filter(x => isSiteObj(x) && layerOf(x) === l).length;
    const fixed = l === "Allmänt" || l === "Etablering";
    rowHtml["ul:" + l] = opts => layerRow("ul:" + l, `${name("ul:" + l, fixed ? "fx-name" : "ul-name", "🗂")} <small>${n}</small>`, { del: !fixed, ul: l, ...opts });
  });
  rowHtml.photos = opts => layerRow("photos", name("photos", "fx-name", "📷"), { noOpacity: true, ...opts });
  if (typeof cads === "function") cads().forEach(r => { rowHtml["cad:" + r.id] = opts => cadRowsHtml(r, opts); });
  const keys = layerRowKeys();
  const rows = [];
  // Mappar först (i den ordning de skapades), med sina lager; sedan resten.
  const sortBtn = $("btnLayerSort");
  if (sortBtn) { sortBtn.classList.toggle("active", !!meta.sortAz); sortBtn.title = meta.sortAz ? "Lagren i mapparna är sorterade A–Ö. Klicka för vanlig ordning." : "Sortera mapparna och lagren i dem A–Ö"; }
  const folders = meta.sortAz ? meta.folders.slice().sort((a, b) => a.name.localeCompare(b.name, "sv", { numeric: true, sensitivity: "base" })) : meta.folders;
  folders.forEach(f => {
    const kids = keys.filter(k => inFolder(k) === f.id);
    // Sortera A–Ö (knappen ovanför listan, gäller alla mappar).
    if (meta.sortAz) kids.sort((a, b) => layerSortName(a).localeCompare(layerSortName(b), "sv", { numeric: true, sensitivity: "base" }));
    const open = layerState["folder:" + f.id] ? layerState["folder:" + f.id].open !== false : true;
    const nOn = kids.filter(k => ls(k).visible).length;
    rows.push(`<div class="layer-row folder-row" data-folder="${escHtml(f.id)}">
        <input type="checkbox" class="fr-vis"${nOn ? " checked" : ""} data-mixed="${nOn > 0 && nOn < kids.length ? 1 : 0}" title="Visa/dölj allt i mappen"${kids.length ? "" : " disabled"} />
        <span class="ln"><button class="fr-toggle" title="Fäll ut/ihop">${open ? "▾" : "▸"}</button><span class="fr-name" title="Dubbelklicka för att byta namn">📁 ${escHtml(f.name)}</span> <small>${kids.length}</small></span>
        <span></span>
        <button class="fr-del" title="Ta bort mappen (lagren ligger kvar)">🗑️</button>
      </div>`);
    kids.forEach(k => rows.push(rowHtml[k]({ inFolder: true, hidden: !open })));
  });
  keys.filter(k => !inFolder(k)).forEach(k => rows.push(rowHtml[k]({})));
  el.innerHTML = rows.join("");
  // "Alla DXF-lager" i en egen ruta under sökfältet.
  const allBox = $("cadAllBox");
  if (allBox) {
    const allCad = typeof cadAllRowsHtml === "function" ? cadAllRowsHtml() : "";
    const prevList = allBox.querySelector(".cadall-list"), keep = prevList ? prevList.scrollTop : 0;
    allBox.innerHTML = allCad;
    const list = allBox.querySelector(".cadall-list");
    if (list) list.scrollTop = keep;
    allBox.classList.toggle("hidden", !allCad);
  }
  el.querySelectorAll(".folder-row").forEach(row => {
    const id = row.dataset.folder;
    const vis = row.querySelector(".fr-vis");
    vis.indeterminate = vis.dataset.mixed === "1";
    vis.onchange = e => setFolderVisible(id, e.target.checked);
    row.querySelector(".fr-toggle").onclick = () => {
      const st = layerState["folder:" + id] || (layerState["folder:" + id] = {});
      st.open = st.open === false; saveLayerState(); renderLayerPanel();
    };
    row.querySelector(".fr-name").ondblclick = () => renameFolder(id);
    row.querySelector(".fr-del").onclick = () => deleteFolder(id);

  });
  // Dra ett lager till en mapp – eller ut ur mappen (släpp på ett lager utanför mappar).
  el.querySelectorAll(".layer-row[data-layer]").forEach(row => {
    // Bara namnet startar ett drag (annars skulle reglagen dras med).
    const ln = row.querySelector(".ln");
    if (row.classList.contains("cad-sub")) return; // CAD-lager följer sin ritning
    ln.title = ln.title || "Dra till en mapp";
    ln.addEventListener("mousedown", () => { row.draggable = true; });
    row.addEventListener("mouseup", () => { row.draggable = false; });
    row.addEventListener("dragstart", e => { e.dataTransfer.setData("text/x-layer", row.dataset.layer); e.dataTransfer.effectAllowed = "move"; row.classList.add("dragging"); });
    row.addEventListener("dragend", () => { row.classList.remove("dragging"); row.draggable = false; });
  });
  el.querySelectorAll(".layer-row").forEach(row => {
    const target = () => row.dataset.folder || (row.classList.contains("in-folder") ? layerMeta().folderOf[row.dataset.layer] : null);
    row.addEventListener("dragover", e => { if (![...e.dataTransfer.types].includes("text/x-layer")) return; e.preventDefault(); row.classList.add("drop"); });
    row.addEventListener("dragleave", () => row.classList.remove("drop"));
    row.addEventListener("drop", e => {
      row.classList.remove("drop");
      const key = e.dataTransfer.getData("text/x-layer");
      if (!key) return;
      e.preventDefault();
      // Drar man ett markerat lager följer alla markerade med.
      if (layerSel.has(key) && layerSel.size > 1) moveLayersToFolder([...layerSel], target());
      else moveLayerToFolder(key, target());
    });
  });
  el.querySelectorAll(".layer-row[data-layer]").forEach(row => {
    const key = row.dataset.layer;
    row.querySelector(".lr-vis").onchange = e => {
      if (key.startsWith("cad")) { ls(key).visible = e.target.checked; saveLayerState(); buildCadSnap(); renderCad(); if (key.startsWith("cad:") || document.querySelector(".cadall-row")) renderLayerPanel(); return; }
      if (key.startsWith("ortho:")) {
        // Manuellt val av foto: sluta följa datumet; "ett i taget" släcker de andra.
        if (orthoFollowDate()) setOrthoFollowDate(false);
        if (e.target.checked && orthoExclusive()) showOnlyOrtho(key.slice(6));
        else { ls(key).visible = e.target.checked; saveLayerState(); }
        orthoChanged();
        return;
      }
      ls(key).visible = e.target.checked; saveLayerState();
      if (key === "objects") $("showObjects").checked = e.target.checked;
      if (key === "photos") $("showPhotos").checked = e.target.checked;
      applyLayerCss();
      if (key.startsWith("ortho:")) renderOrtho(); else renderZones();
    };
    const op = row.querySelector(".lr-op");
    if (op) op.oninput = e => {
      ls(key).opacity = Number(e.target.value); op.title = `Genomskinlighet ${e.target.value} %`; saveLayerState();
      applyLayerCss();
      if (key.startsWith("ortho:")) renderOrtho(); else if (key.startsWith("cad:")) renderCad(); else if (key.startsWith("ul:")) renderZones();
    };
    const mult = row.querySelector(".lr-mult");
    if (mult) mult.onchange = e => { layerState.pdfMultiply = e.target.checked; saveLayerState(); applyLayerCss(); };
    const orName = row.querySelector(".or-name");
    if (orName) orName.ondblclick = () => { const o = siteItems.find(x => "ortho:" + x.id === key); if (o) editOrtho(o); };
    const nameEl = row.querySelector(".ul-name");
    if (nameEl) nameEl.ondblclick = () => renameLayer(key.slice(3));
    const fxName = row.querySelector(".fx-name");
    if (fxName) fxName.ondblclick = () => renameFixedLayer(key);
    const del = row.querySelector(".lr-del");
    if (key.startsWith("cad:")) return; // knapparna kopplas i bindCadRows
    if (del && key.startsWith("ul:")) { del.onclick = () => deleteLayer(key.slice(3)); return; }
    if (del) del.onclick = () => {
      const o = siteItems.find(x => "ortho:" + x.id === key);
      if (!o || !confirm(`Ta bort ortofotot "${o.name}" från lägesplanen? (Originalet i Trimble Connect ligger kvar.)`)) return;
      orthoImages.delete(o.id);
      saveSiteItem(o, true).then(() => { syncOrthoToDate(); orthoChanged(); });
      ghDeleteBinary(token, o.path, "Lägesplan: ta bort ortofoto");
    };
  });
  if (typeof bindCadRows === "function") { bindCadRows(el); renderCadSettings(); }
  if (typeof bindCadAllRows === "function" && $("cadAllBox")) bindCadAllRows($("cadAllBox"));
  bindLayerSelection(el, keys);
  applyLayerSearch();
}

/* ---------------------------------------------------------------------
   Flerval i lagerlistan (Victors önskemål 2026-10-01): klick markerar ett
   lager, Ctrl-klick lägger till/tar bort, Shift-klick markerar ett intervall.
   Åtgärdsraden: tänd, släck, flytta till mapp och ta bort alla markerade.
   Delete tar bort, Esc avmarkerar (när man senast klickade i listan).
   ------------------------------------------------------------------- */
const layerSel = new Set();
let layerSelAnchor = null, layerListActive = false;
const layerDeletable = key => key.startsWith("ortho:") || key.startsWith("cad:") ||
  (key.startsWith("ul:") && key !== "ul:Allmänt" && key !== "ul:Etablering");
function bindLayerSelection(el, keys) {
  // Lager som inte finns längre (t.ex. borttagna) avmarkeras.
  const all = new Set([...el.querySelectorAll(".layer-row[data-layer]")].map(r => r.dataset.layer));
  [...layerSel].forEach(k => { if (!all.has(k)) layerSel.delete(k); });
  el.querySelectorAll(".layer-row[data-layer]").forEach(row => {
    row.addEventListener("click", e => {
      // Kryssrutor, reglage och knappar sköter sig själva.
      if (e.target.closest("input, button, select, label")) return;
      layerListActive = true;
      const key = row.dataset.layer;
      if (e.shiftKey && layerSelAnchor) {
        const order = [...el.querySelectorAll(".layer-row[data-layer]")]
          .filter(r => !r.classList.contains("filtered") && !r.classList.contains("hidden")).map(r => r.dataset.layer);
        let a = order.indexOf(layerSelAnchor), b = order.indexOf(key);
        if (a < 0) a = b;
        if (!(e.ctrlKey || e.metaKey)) layerSel.clear();
        order.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(k => layerSel.add(k));
      } else if (e.ctrlKey || e.metaKey) {
        if (layerSel.has(key)) layerSel.delete(key); else layerSel.add(key);
        layerSelAnchor = key;
      } else {
        layerSel.clear();
        layerSel.add(key);
        layerSelAnchor = key;
      }
      e.preventDefault();
      updateLayerSelection();
    });
    // Shift-klick ska inte markera text i listan.
    row.addEventListener("mousedown", e => { if (e.shiftKey && !e.target.closest("input, button")) e.preventDefault(); });
  });
  updateLayerSelection();
}
function updateLayerSelection() {
  const el = $("layerList");
  if (!el) return;
  el.querySelectorAll(".layer-row[data-layer]").forEach(r => r.classList.toggle("sel", layerSel.has(r.dataset.layer)));
  const bar = $("layerSelBar");
  if (!bar) return;
  if (!layerSel.size) { bar.classList.add("hidden"); bar.innerHTML = ""; return; }
  const sel = [...layerSel], nDel = sel.filter(layerDeletable).length;
  const folders = layerMeta().folders;
  bar.innerHTML = `<b>${sel.length} markerade</b>
    <button type="button" data-a="on" title="Tänd alla markerade">Tänd</button>
    <button type="button" data-a="off" title="Släck alla markerade">Släck</button>
    ${folders.length ? `<select data-a="folder" title="Flytta markerade till mapp"><option value="">Till mapp…</option>${folders.map(f => `<option value="${escHtml(f.id)}">📁 ${escHtml(f.name)}</option>`).join("")}<option value="-">Utanför mappar</option></select>` : ""}
    <button type="button" data-a="del" class="danger"${nDel ? "" : " disabled"} title="${nDel ? "Ta bort markerade (Delete)" : "Inget av de markerade lagren kan tas bort"}">🗑️ Ta bort${nDel && nDel !== sel.length ? ` (${nDel})` : ""}</button>
    <button type="button" data-a="clear" class="ghost" title="Avmarkera (Esc)">✕</button>`;
  bar.classList.remove("hidden");
  bar.querySelector('[data-a="on"]').onclick = () => setLayersVisible(sel, true);
  bar.querySelector('[data-a="off"]').onclick = () => setLayersVisible(sel, false);
  bar.querySelector('[data-a="del"]').onclick = () => deleteSelectedLayers();
  bar.querySelector('[data-a="clear"]').onclick = () => { layerSel.clear(); updateLayerSelection(); };
  const fsel = bar.querySelector('[data-a="folder"]');
  if (fsel) fsel.onchange = () => { if (fsel.value) moveLayersToFolder(sel, fsel.value === "-" ? null : fsel.value); };
}
function setLayersVisible(keys, on) {
  let ortho = false, cad = false;
  keys.forEach(k => {
    ls(k).visible = on;
    if (k.startsWith("ortho:")) ortho = true;
    if (k.startsWith("cad")) cad = true;
    if (k === "objects") $("showObjects").checked = on;
    if (k === "photos") $("showPhotos").checked = on;
  });
  if (ortho && orthoFollowDate()) setOrthoFollowDate(false);
  saveLayerState();
  applyLayerCss();
  if (ortho) orthoChanged();
  if (cad && typeof renderCad === "function") { buildCadSnap(); renderCad(); }
  renderZones(); renderLayerPanel();
}
async function moveLayersToFolder(keys, folderId) {
  const m = layerMeta();
  keys.filter(k => !k.startsWith("cadl:")).forEach(k => { if (folderId) m.folderOf[k] = folderId; else delete m.folderOf[k]; });
  await saveLayerMeta(m);
}
async function deleteSelectedLayers() {
  const keys = [...layerSel].filter(layerDeletable);
  if (!keys.length) return;
  const orthoRecs = keys.filter(k => k.startsWith("ortho:")).map(k => siteItems.find(x => "ortho:" + x.id === k)).filter(Boolean);
  const cadRecs = keys.filter(k => k.startsWith("cad:")).map(k => (typeof cads === "function" ? cads() : []).find(x => "cad:" + x.id === k)).filter(Boolean);
  const layerNames = keys.filter(k => k.startsWith("ul:")).map(k => k.slice(3));
  const moved = siteItems.filter(x => isSiteObj(x) && layerNames.includes(layerOf(x)));
  const parts = [];
  if (orthoRecs.length) parts.push(`${orthoRecs.length} ortofoto`);
  if (cadRecs.length) parts.push(`${cadRecs.length} CAD-ritning${cadRecs.length > 1 ? "ar" : ""}`);
  if (layerNames.length) parts.push(`${layerNames.length} lager${moved.length ? ` (deras ${moved.length} objekt flyttas till "Allmänt")` : ""}`);
  const names = [...orthoRecs.map(o => o.name), ...cadRecs.map(r => r.name), ...layerNames];
  const list = names.slice(0, 12).map(n => "• " + n).join("\n") + (names.length > 12 ? `\n… och ${names.length - 12} till` : "");
  if (!confirm(`Ta bort ${parts.join(", ")} från lägesplanen?\n\n${list}${orthoRecs.length || cadRecs.length ? "\n\nOriginalen i Trimble Connect ligger kvar." : ""}`)) return;
  // Allt i en sparning, sedan filerna.
  const removeIds = [...orthoRecs.map(o => o.id), ...cadRecs.map(r => r.id), ...siteItems.filter(x => x.type === "layer" && layerNames.includes(x.name)).map(x => x.id)];
  const m = layerMeta();
  keys.forEach(k => { delete m.folderOf[k]; });
  orthoRecs.forEach(o => orthoImages.delete(o.id));
  if (typeof cadGeom !== "undefined") cadRecs.forEach(r => cadGeom.delete(r.id));
  layerSel.clear();
  setSaveStatus("Tar bort…");
  try {
    const recs = moved.map(x => ({ ...x, layer: "Allmänt" }));
    await saveSiteItemsBatch(siteItems.some(x => x.id === META_ID) ? [...recs, m] : recs, removeIds);
    setSaveStatus(`✓ Tog bort ${names.length} st`);
  } catch (e) { setSaveStatus("⚠ Kunde inte ta bort: " + e.message); return; }
  [...orthoRecs, ...cadRecs].forEach(r => { if (r.path) ghDeleteBinary(token, r.path, `Lägesplan: ta bort ${r.type === "cad" ? "CAD" : "ortofoto"}`); });
  if (orthoRecs.length) { syncOrthoToDate(); orthoChanged(); }
  if (cadRecs.length && typeof renderCad === "function") { buildCadSnap(); renderCad(); }
  renderActiveLayerSelect();
}
/* Sök i lagren: visar lager (även CAD-lager och lager i mappar) vars namn
   innehåller texten, med sina mappar/ritningar som sammanhang. */
function applyLayerSearch() {
  const el = $("layerList"), inp = $("layerSearch");
  if (!el || !inp) return;
  const q = inp.value.trim().toLowerCase();
  $("layerSearchClear").classList.toggle("hidden", !q);
  const rows = [...el.querySelectorAll(".layer-row")];
  rows.forEach(r => {
    r.classList.remove("filtered");
    const ln = r.querySelector(".ln");
    ln.querySelectorAll("mark").forEach(m => { const p = m.parentNode; p.replaceChild(document.createTextNode(m.textContent), m); p.normalize(); });
  });
  // Rutan "Alla DXF-lager": filtrera dess lager (fälls inte ut av sökningen).
  const allBox = $("cadAllBox");
  if (allBox) allBox.querySelectorAll(".cadall-sub").forEach(r => r.classList.toggle("filtered", !!q && !(r.querySelector(".ln").textContent || "").toLowerCase().includes(q)));
  if (!q) { $("layerSearchInfo").classList.add("hidden"); return; }
  const text = r => (r.querySelector(".ln").textContent || "").toLowerCase();
  const match = new Set(rows.filter(r => text(r).includes(q)));
  // Sammanhang: en träffad CAD-rad/mapp visar sina barn, ett träffat barn visar sin förälder.
  let parent = null, folder = null;
  const show = new Set(match);
  rows.forEach(r => {
    if (r.classList.contains("folder-row")) { folder = r; parent = null; return; }
    if (!r.classList.contains("in-folder")) folder = null;
    if (r.classList.contains("cad-sub")) {
      // En träffad DXF visas ihopfälld: lagren syns bara om den redan är utfälld.
      if (parent && match.has(parent) && !r.classList.contains("hidden")) show.add(r);
      if (match.has(r)) { show.add(parent); if (folder) show.add(folder); }
      return;
    }
    parent = r.dataset.layer && r.dataset.layer.startsWith("cad:") ? r : null;
    if (folder && match.has(folder)) show.add(r);
    if (folder && match.has(r)) show.add(folder);
  });
  let n = 0;
  rows.forEach(r => {
    if (!show.has(r)) { r.classList.add("filtered"); return; }
    r.classList.remove("hidden");
    if (match.has(r)) {
      n++;
      const ln = r.querySelector(".ln");
      const walker = document.createTreeWalker(ln, NodeFilter.SHOW_TEXT);
      const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(t => {
        const i = t.data.toLowerCase().indexOf(q);
        if (i < 0) return;
        const m = document.createElement("mark"); m.textContent = t.data.slice(i, i + q.length);
        const after = t.splitText(i); after.data = after.data.slice(q.length);
        t.parentNode.insertBefore(m, after);
      });
    }
  });
  $("layerSearchInfo").textContent = n ? `${n} lager matchar "${inp.value.trim()}".` : `Inga lager matchar "${inp.value.trim()}".`;
  $("layerSearchInfo").classList.remove("hidden");
}

async function renameLayer(oldName) {
  if (oldName === "Allmänt" || oldName === "Etablering") return renameFixedLayer("ul:" + oldName);
  const name = (prompt("Nytt namn på lagret:", oldName) || "").trim();
  if (!name || name === oldName) return;
  const meta = layerMeta();
  if (meta.folderOf["ul:" + oldName]) { meta.folderOf["ul:" + name] = meta.folderOf["ul:" + oldName]; delete meta.folderOf["ul:" + oldName]; }
  const recs = siteItems.filter(x => (x.type === "layer" && x.name === oldName) || (isSiteObj(x) && layerOf(x) === oldName))
    .map(x => x.type === "layer" ? { ...x, name } : { ...x, layer: name });
  ls("ul:" + name).visible = ls("ul:" + oldName).visible; ls("ul:" + name).opacity = ls("ul:" + oldName).opacity; saveLayerState();
  await saveSiteItemsBatch(siteItems.some(x => x.id === META_ID) ? [...recs, meta] : recs);
  renderActiveLayerSelect();
}
async function deleteLayer(name) {
  const items = siteItems.filter(x => isSiteObj(x) && layerOf(x) === name);
  if (!confirm(items.length ? `Ta bort lagret "${name}"? Dess ${items.length} objekt flyttas till "Allmänt".` : `Ta bort lagret "${name}"?`)) return;
  const layerRecs = siteItems.filter(x => x.type === "layer" && x.name === name).map(x => x.id);
  await saveSiteItemsBatch(items.map(x => ({ ...x, layer: "Allmänt" })), layerRecs);
  renderActiveLayerSelect();
}

/* Etableringsplan över tid: en A3-sida per månad med det som gäller den månaden. */
async function exportSitePlanPdf() {
  if (!viewport) return;
  const dated = siteItems.filter(x => isSiteObj(x) && (x.from || x.to));
  const all = dated.flatMap(x => [x.from, x.to]).filter(Boolean).sort();
  let start = all[0] || isoOf(new Date(dateMin)), end = all[all.length - 1] || isoOf(new Date(dateMax));
  const months = [];
  for (let d = new Date(start.slice(0, 7) + "-01T12:00:00"); isoOf(d) <= end && months.length < 36; d.setMonth(d.getMonth() + 1)) {
    const a = isoOf(d), e = new Date(d); e.setMonth(e.getMonth() + 1); e.setDate(0);
    months.push([a, isoOf(e)]);
  }
  if (!months.length) { alert("Inga datum att göra en plan över."); return; }
  if (months.length > 12 && !confirm(`Etableringsplanen blir ${months.length} sidor. Fortsätt?`)) return;
  const MON = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];
  const origDate = $("dateInput").value;
  setBusy("Skapar etableringsplan…");
  try {
    await loadScript(JSPDF_URL);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
    const W = 420, H = 297, M = 12;
    let vec = null;
    if (typeof vecBegin === "function" && pdfVectorWanted()) { try { vec = await vecBegin(doc); } catch (e) { vec = null; } }
    for (let i = 0; i < months.length; i++) {
      const [a, b] = months[i];
      setBusy(`Skapar etableringsplan… sida ${i + 1} av ${months.length}`);
      siteDateOverride = [a, b];
      $("dateInput").value = b; syncSliderFromDate(); renderZones();
      await new Promise(r => setTimeout(r, 30));
      if (i) { if (vec) vecNextPage(vec); else doc.addPage("a3", "landscape"); }
      const [y, mo] = a.split("-").map(Number);
      doc.setFont("helvetica", "bold"); doc.setFontSize(20);
      doc.text(`Etableringsplan – ${MON[mo - 1]} ${y}`, M, M + 6);
      doc.setFont("helvetica", "normal"); doc.setFontSize(11);
      doc.text(`${plan.name}   ·   ${a} – ${b}   ·   sida ${i + 1} av ${months.length}`, M, M + 13);
      const listW = 95, top = M + 18, bottom = H - M;
      const boxW = W - 2 * M - listW - 6, boxH = bottom - top;
      // Underlaget som bild, DXF som vektorer, etablering/zoner ovanpå.
      const r = addPlanToPdf(doc, M, top, boxW, boxH, 0.88, vec);
      doc.setDrawColor(200); doc.rect(r.x, r.y, r.w, r.h);
      // Förteckning över det som gäller månaden
      const active = siteItems.filter(x => isSiteObj(x) && siteShown(x))
        .sort((p, q) => layerOf(p).localeCompare(layerOf(q), "sv") || (p.from || "").localeCompare(q.from || ""));
      let ly = top + 4; const lx = W - M - listW;
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Gäller denna månad", lx, ly); ly += 7;
      doc.setFontSize(9);
      let lastLayer = null;
      for (const x of active) {
        if (ly > bottom - 6) { doc.setFont("helvetica", "italic"); doc.text("… fler", lx, ly); break; }
        if (layerOf(x) !== lastLayer) { lastLayer = layerOf(x); doc.setFont("helvetica", "bold"); doc.text(lastLayer, lx, ly); ly += 5; }
        const col = (x.color || defaultColorOf(x) || "#111827");
        const n = parseInt(col.slice(1), 16); doc.setFillColor(n >> 16, (n >> 8) & 255, n & 255); doc.rect(lx, ly - 3, 3, 3, "F");
        doc.setFont("helvetica", "normal");
        const kind = x.type === "symbol" ? (SYMBOLS[x.sym] || {}).label || "Symbol" : (SITE_KINDS[x.type] || {}).label || x.type;
        const title = x.type === "note" ? (x.text || "").split("\n")[0] : (x.name || kind);
        const line = doc.splitTextToSize(`${title}${title !== kind ? ` (${kind})` : ""}`, listW - 6)[0];
        doc.text(line, lx + 5, ly);
        const dt = datesText(x);
        if (dt) { doc.setTextColor(120); doc.text(dt, lx + 5, ly + 4); doc.setTextColor(0); ly += 4; }
        ly += 5.5;
      }
      if (!active.length) { doc.setFont("helvetica", "italic"); doc.text("Inget med datum den här månaden.", lx, ly); }
    }
    const spName = `Etableringsplan ${plan.name} ${months[0][0].slice(0, 7)}–${months[months.length - 1][0].slice(0, 7)}.pdf`;
    if (vec) { setBusy("Sätter ihop PDF:en med ritningen som vektorer…"); savePdfBytes(await vecFinish(vec), spName); }
    else doc.save(spName);
  } catch (e) {
    alert("Kunde inte skapa etableringsplanen: " + e.message);
  } finally {
    siteDateOverride = null;
    $("dateInput").value = origDate; syncSliderFromDate(); renderZones();
    setBusy("");
  }
}

function bindLayers() {
  loadLayerState();
  // Befintliga kryssrutor (objekt/foton) följer lagerpanelen.
  $("showObjects").checked = layerVisible("objects");
  $("showPhotos").checked = layerVisible("photos");
  $("showObjects").addEventListener("change", () => { ls("objects").visible = $("showObjects").checked; saveLayerState(); renderLayerPanel(); applyLayerCss(); });
  $("showPhotos").addEventListener("change", () => { ls("photos").visible = $("showPhotos").checked; saveLayerState(); renderLayerPanel(); });
  $("btnAddOrtho").onclick = () => $("orthoInput").click();
  $("orthoInput").onchange = e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) addOrthoFiles(f); };
  $("layersFollowDate").onchange = () => renderZones();
  $("btnNewFolder").onclick = createFolder;
  $("btnLayerSort").onclick = async () => { const m = layerMeta(); m.sortAz = !m.sortAz; await saveLayerMeta(m); };
  // Tom sökning ritar om listan så att hopfällda mappar/CAD-lager döljs igen.
  const research = () => { if ($("layerSearch").value.trim()) applyLayerSearch(); else renderLayerPanel(); };
  $("layerSearch").addEventListener("input", research);
  $("layerSearch").addEventListener("keydown", e => { if (e.key === "Escape") { e.target.value = ""; research(); e.target.blur(); } });
  $("layerSearchClear").onclick = () => { $("layerSearch").value = ""; research(); $("layerSearch").focus(); };
  $("orthoExclusive").checked = orthoExclusive();
  $("orthoExclusive").onchange = e => {
    layerState.orthoExclusive = e.target.checked; saveLayerState();
    const vis = orthosByDate().filter(o => ls("ortho:" + o.id).visible);
    if (e.target.checked && vis.length > 1) { showOnlyOrtho(vis[vis.length - 1].id); orthoChanged(); }
  };
  $("orthoFollowDate").checked = orthoFollowDate();
  $("orthoOutside").checked = orthoOutside();
  $("orthoOutside").onchange = e => { layerState.orthoOutside = e.target.checked; saveLayerState(); renderOrtho(); };
  $("orthoFollowDate").onchange = e => setOrthoFollowDate(e.target.checked);
  $("btnOrthoPrev").onclick = () => stepOrtho(-1);
  $("btnOrthoNext").onclick = () => stepOrtho(1);
  document.querySelectorAll("[data-site]").forEach(b => { b.onclick = () => startSiteTool(b.dataset.site); });
  const symSel = $("symbolSelect");
  symSel.innerHTML += Object.entries(SYMBOLS).map(([k, v]) => `<option value="${k}">${v.icon} ${escHtml(v.label)} (${fmtM(v.w)} × ${fmtM(v.h)} m)</option>`).join("");
  symSel.onchange = () => { const k = symSel.value; symSel.value = ""; if (k) startSiteTool("symbol", k); };
  $("activeLayer").onchange = () => { try { localStorage.setItem("lagesplan-activelayer-" + projectId, $("activeLayer").value); } catch (e) {} };
  $("btnNewLayer").onclick = async () => {
    const name = (prompt("Namn på det nya lagret (t.ex. Arbetsmiljö, Logistik v.42):", "") || "").trim();
    if (!name) return;
    await createLayer(name);
    renderActiveLayerSelect(); $("activeLayer").value = name; $("activeLayer").onchange();
  };
  $("siteUndo").onclick = undoSite;
  $("siteRedo").onclick = redoSite;
  $("btnSitePlanPdf").onclick = exportSitePlanPdf;
  window.addEventListener("keydown", e => {
    if (!(e.ctrlKey || e.metaKey) || (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))) return;
    const k = e.key.toLowerCase();
    // Senaste steget var en släckning/dolt namn i 3D Objekt: ångra det först.
    if (k === "z" && !e.shiftKey && typeof lastUndoTarget !== "undefined" && lastUndoTarget === "obj" && typeof undoObjHide === "function" && undoObjHide()) { e.preventDefault(); return; }
    if (k === "z" && !e.shiftKey && siteUndo.length) { e.preventDefault(); undoSite(); }
    else if ((k === "y" || (k === "z" && e.shiftKey)) && siteRedo.length) { e.preventDefault(); redoSite(); }
  });
  $("viewport").addEventListener("dblclick", e => {
    if (!siteTool && !(typeof measure !== "undefined" && measure) && plan && plan.calib) { removeVertexAt(toPdf(stagePoint(e))); return; }
    if (!siteTool || SITE_KINDS[siteTool.kind].clicks) return;
    const p = siteTool.pts; // dubbelklicket har lagt till samma punkt två gånger
    const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
    while (p.length > 1 && same(p[p.length - 1], p[p.length - 2])) p.pop();
    finishSiteTool();
  });
  window.addEventListener("mousemove", onSiteDragMove);
  window.addEventListener("mouseup", onSiteDragUp);
  updateSiteUi();
  let raf = 0;
  window.addEventListener("mousemove", e => {
    if (!siteTool || !siteTool.pts.length || !viewport || !e.target.closest || !e.target.closest("#viewport")) return;
    siteTool.cursor = pdfToModel(constrainPdf(toPdf(stagePoint(e)), e, siteToolPrevPdf()));
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderZones(); });
  });
  // Klick utanför lagerlistan: Delete/Esc gäller inte längre lagren.
  document.addEventListener("mousedown", e => { if (!e.target.closest || !e.target.closest("#layerList, #layerSelBar")) layerListActive = false; }, true);
  window.addEventListener("keydown", e => {
    if (!layerListActive || !layerSel.size || (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.target.type !== "checkbox" && e.target.type !== "range")) return;
    if (e.key === "Delete") { e.preventDefault(); e.stopImmediatePropagation(); deleteSelectedLayers(); }
    else if (e.key === "Escape") { e.stopImmediatePropagation(); layerSel.clear(); updateLayerSelection(); }
  }, true);
  window.addEventListener("keydown", e => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === "Escape") { if (siteTool) stopSiteTool(); else if (!$("sitePop").classList.contains("hidden")) { closeSitePop(); selectedSiteId = null; renderZones(); } }
    else if (e.key === "Enter" && siteTool && !SITE_KINDS[siteTool.kind].clicks) finishSiteTool();
  });
  applyLayerCss();
  renderLayerPanel();
}
