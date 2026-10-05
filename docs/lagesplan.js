// ---------------------------------------------------------------------
// Lägesplan – en PDF-plan (t.ex. planritning med PM-zoner) färgad efter
// framdriften i 4D-planering.
// ---------------------------------------------------------------------
// Öppnas från 4D-planering ("🗺️ Lägesplan") som egen sida:
//   lagesplan.html?project=<Trimble-projekt-id>
// Samma adress (vfalk-ncc.github.io) som 4D-planering, så GitHub-token,
// statusfärger och lösenordsgrinden i localStorage delas automatiskt.
//
// Data (privata repot vfalk-NCC/4D-data, via github-storage.js):
//   projects/<id>/plan_items.json            planeringen (läses)
//   projects/<id>/status_plans.json          planerna och deras zoner
//   projects/<id>/status_plans/<planId>.pdf  PDF:en för varje plan
//
// Zoner: polygoner i PDF-koordinater (punkter), med en kod (t.ex. "PM06")
// och en koppling till planeringen - automatiskt (koden förekommer i
// område/aktivitet/namn/entreprenör) eller ett valt fält + värde. Zonens
// färg räknas med SAMMA fasberäkning som 3D-modellen (computeItemPhase i
// app.js) vid valt datum, i samma statusfärger (settings.statusColors).
// Zoner kan hittas automatiskt i PDF:en - färgade rutor/markeringar
// (PDF-annotations, t.ex. Bluebeam) eller färgade ytor i själva ritningen,
// ihop med kodtexten i eller vid rutan - eller ritas för hand.
// ---------------------------------------------------------------------

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const DEFAULT_STATUS_COLORS = {
  planerad: "#94a3b8", pagaende: "#f5a623", forsenad: "#e5484d",
  klar: "#3fb950", pausad: "#a1a1aa"
};
const PHASE_LABELS = {
  planerad: "Planerad men ej startad", pagaende: "Pågående",
  forsenad: "Försenad", klar: "Klar", pausad: "Pausad", ingen: "Ingen koppling"
};
// Exakt samma fem som i 4D-planeringen (Victor 2026-10-02). "ingen" (zon utan
// kopplade aktiviteter) ritas men står inte i förklaringen.
const PHASE_ORDER = ["planerad", "pagaende", "forsenad", "klar", "pausad"];
const DEFAULT_CODE_PATTERN = "PM\\s*\\d+\\s*[A-Z]?";
const ZONE_ALPHA = 0.5;

const $ = id => document.getElementById(id);

// ---- Tillstånd ----
let projectId = new URLSearchParams(location.search).get("project");
let settings = {};
let token = null;
// Manuell token (anges under nyckelknappen) – sparas separat och går före
// den som 4D-planering skickar, så en gammal token där inte skriver över den.
const LS_TOKEN_KEY = "lagesplan-github-token";
let tokenSource = "";  // "manuell" | "4D-planering" | "sparad" | ""
const manualToken = () => { try { return localStorage.getItem(LS_TOKEN_KEY) || ""; } catch (e) { return ""; } };
let items = [];            // planerade objekt (radformat från plan_items.json)
let plans = [];            // status_plans.json
let plan = null;           // aktiv plan
let pdfDoc = null, page = null, viewport = null;
let renderScale = 1;
let selectedZoneId = null;
const view = { scale: 1, tx: 0, ty: 0 };
let drawMode = false;
let subActs = [];          // plan_item_activities.json (för "objekt kopplade till delaktiviteter")
let positions = [];        // plan_item_positions.json: [{id, x, y, z0, z1, x0, x1, y0, y1}] (meter, modellens koordinater)
let calib = null;          // pågående kalibrering {pdf: [[x,y]...], model: [[x,y,z]...], waitPdf}
let posPdfCache = null;    // item-id -> [x, y] i PDF-koordinater (för aktiv plan, kalibrering och nivå)

// ---------------------------------------------------------------------
// Brygga till 4D-planering (fönstret som öppnade lägesplanen)
// ---------------------------------------------------------------------
let bridgeSeq = 0;
const bridgeWait = new Map();
window.addEventListener("message", e => {
  if (e.origin !== location.origin || !e.data || !e.data.lagesplanReply) return;
  const done = bridgeWait.get(e.data.reqId);
  if (done) { bridgeWait.delete(e.data.reqId); done(e.data); }
});
function askOpener(type, extra = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const op = window.opener;
    if (!op || op.closed) return reject(new Error("4D-planering är inte öppen. Öppna lägesplanen via 🗺️-knappen i 4D-planering (i Trimble Connect) och låt den vara öppen."));
    const reqId = ++bridgeSeq;
    const timer = timeoutMs ? setTimeout(() => { bridgeWait.delete(reqId); reject(new Error("Inget svar från 4D-planering. Är den fortfarande öppen i Trimble Connect?")); }, timeoutMs) : null;
    bridgeWait.set(reqId, d => { clearTimeout(timer); d.error ? reject(new Error(d.error)) : resolve(d); });
    try { op.postMessage({ lagesplan: true, type, reqId, ...extra }, location.origin); }
    catch (err) { clearTimeout(timer); bridgeWait.delete(reqId); reject(err); }
  });
}

// ---------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------
window.addEventListener("DOMContentLoaded", init);

async function init() {
  try { settings = JSON.parse(localStorage.getItem("4dplan-settings") || "{}") || {}; } catch (e) { settings = {}; }
  token = settings.githubToken || null;
  if (token) tokenSource = "sparad";
  let unlocked = false;
  try { unlocked = localStorage.getItem("4dplan-unlocked") === "1"; } catch (e) {}

  bindUI();

  // Öppnad från extensionen: fliken har inte extensionens localStorage
  // (webbläsaren delar upp lagringen för inbäddade iframes), så token och
  // inställningar hämtas från 4D-planering via postMessage.
  if (window.opener) {
    try {
      const r = await askOpener("hello", {}, 4000);
      if (r.settings) {
        settings = { ...settings, ...r.settings };
        if (settings.githubToken) { token = settings.githubToken; tokenSource = "4D-planering"; }
        unlocked = true;
      }
      if (!projectId && r.projectId) projectId = r.projectId;
    } catch (e) { /* ingen extension - använd lokal lagring */ }
  }
  if (manualToken()) { token = manualToken(); tokenSource = "manuell"; unlocked = true; }
  renderLegend();

  if (!projectId) return fatal("Saknar projekt. Öppna lägesplanen via knappen 🗺️ Lägesplan i 4D-planering.");
  if (!token || !unlocked) {
    $("btnTokenOpen").classList.remove("hidden");
    openTokenModal();
    return fatal("Öppna lägesplanen via kartknappen i 4D-planering (inne i Trimble Connect), eller ange GitHub-token (nyckelknappen).");
  }

  $("projectInfo").textContent = `Projekt ${projectId}`;
  $("dateInput").value = todayIso();
  setBusy("Hämtar planering…");
  try {
    [items, plans, positions, subActs] = await Promise.all([ghReadJSON(token, dataPath("plan_items.json")), ghReadJSON(token, dataPath("status_plans.json")),
      ghReadJSON(token, dataPath("plan_item_positions.json")).catch(() => []), ghReadJSON(token, dataPath("plan_item_activities.json")).catch(() => [])]);
    subCoupledCache = null;
  } catch (e) {
    setBusy("");
    if (/\b401\b/.test(e.message)) {
      $("btnTokenOpen").classList.remove("hidden");
      openTokenModal("GitHub godkänner inte token:en (401) – den har troligen gått ut. Ange en ny här.");
      return fatal(`GitHub godkänner inte token:en från ${tokenSource || "inställningarna"} (401) – den har troligen gått ut. Ange en ny med nyckelknappen.`);
    }
    return fatal("Kunde inte hämta data: " + e.message);
  }
  setBusy("");
  loadSiteLayers();
  $("projectInfo").textContent = `Projekt ${projectId} · ${items.length} planerade objekt`;
  setupDateRange();
  renderPlanSelect();
  const last = (() => { try { return localStorage.getItem("lagesplan-last-" + projectId); } catch (e) { return null; } })();
  const first = plans.find(p => p.id === last) || plans[0];
  if (first) await openPlan(first.id);
}

function fatal(msg) {
  const w = $("warnBox");
  w.textContent = msg;
  w.classList.remove("hidden");
}

const dataPath = f => `projects/${encodeURIComponent(projectId)}/${f}`;
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function setBusy(t) { $("busy").textContent = t; $("busy").classList.toggle("hidden", !t); }
function setSaveStatus(t) { $("saveStatus").textContent = t; }

// ---------------------------------------------------------------------
// Faser (samma logik som computeItemPhase i app.js)
// ---------------------------------------------------------------------
function computeItemPhase(row, atDateStr, warningDays) {
  if (!row.start_date) return null;
  const at = new Date(atDateStr);
  const start = new Date(row.start_date);
  const plannedEnd = row.end_date ? new Date(row.end_date) : null;
  let actualEnd = row.actual_end_date ? new Date(row.actual_end_date) : null;
  if (!actualEnd && row.status === "klar") actualEnd = plannedEnd || start;
  // Klar kan inte ha avslutats i framtiden: avslut efter i dag räknas som i dag (samma som 4D-planering).
  if (actualEnd && (row.status === "klar" || (Number(row.progress) || 0) >= 100)) {
    const today = new Date(new Date().toISOString().slice(0, 10));
    if (actualEnd > today) actualEnd = today;
  }
  if (actualEnd && actualEnd <= at) return "klar";
  if (row.status === "pausad") return "pausad";
  // Framdrift över 0 % = påbörjad (senast i dag), även före planerad start – samma som 4D-planering.
  // Bara framdrift (minst 1 %) gör en aktivitet pågående; startdatum passerat
  // utan framdrift = försenad (Victor 2026-10-02, samma som 4D-planering).
  const hasProgress = (Number(row.progress) || 0) >= 1;
  let actualStart = hasProgress && row.actual_start_date ? new Date(row.actual_start_date) : null;
  if (hasProgress) {
    const today = new Date(new Date().toISOString().slice(0, 10));
    if (!actualStart || actualStart > today) actualStart = actualStart && actualStart < today ? actualStart : (start < today ? start : today);
  }
  const started = actualStart && actualStart <= at;
  if (at < start && !started) return "planerad";
  if (plannedEnd && at > plannedEnd) return "forsenad";
  if (!started) return "forsenad";
  return "pagaende";
}

/* Zonens fas: försenad om något är försenat, klar om allt är klart,
   pågående om något har kommit igång, annars ej påbörjad. */
function zonePhase(zoneItems, atDate) {
  if (!zoneItems.length) return "ingen";
  const warn = Number.isFinite(settings.warningDaysBeforeEnd) ? settings.warningDaysBeforeEnd : 7;
  const phases = zoneItems.map(it => computeItemPhase(it, atDate, warn) || fallbackPhase(it));
  if (phases.includes("forsenad")) return "forsenad";
  const done = p => p === "klar";
  if (phases.every(done)) return "klar";
  if (phases.some(p => p === "pagaende" || done(p))) return "pagaende";
  if (phases.includes("pausad")) return "pausad";
  return "planerad";
}
function fallbackPhase(it) {
  return { klar: "klar", pagaende: "pagaende", forsenad: "forsenad", pausad: "pausad" }[it.status] || "planerad";
}
function zoneProgress(zoneItems) {
  if (!zoneItems.length) return null;
  let w = 0, sum = 0;
  zoneItems.forEach(it => {
    const weight = Number(it.estimated_hours) > 0 ? Number(it.estimated_hours) : 1;
    const p = it.status === "klar" ? 100 : (Number.isFinite(Number(it.progress)) ? Number(it.progress) : 0);
    w += weight; sum += weight * p;
  });
  return Math.round(sum / w);
}
const phaseColor = ph => ph === "ingen" ? "#9ca3af" : ((settings.statusColors || {})[ph] || DEFAULT_STATUS_COLORS[ph]);

// ---------------------------------------------------------------------
// Koder och koppling zon -> planerade objekt
// ---------------------------------------------------------------------
/* "PM010" -> "PM10", "pm 9a" -> "PM9A" (inledande nollor bort, versaler). */
function normCode(s) {
  const m = String(s || "").toUpperCase().replace(/\s+/g, "").match(/^([A-ZÅÄÖ]+)0*(\d+)([A-Z]?)$/);
  return m ? `${m[1]}${parseInt(m[2], 10)}${m[3]}` : String(s || "").toUpperCase().replace(/\s+/g, "");
}
function codeRegex() {
  let src = (plan && plan.code_pattern) || DEFAULT_CODE_PATTERN;
  try { return new RegExp(`(?:^|[^A-Za-z0-9])(${src})(?![A-Za-z0-9])`, "gi"); }
  catch (e) { return new RegExp(`(?:^|[^A-Za-z0-9])(${DEFAULT_CODE_PATTERN})(?![A-Za-z0-9])`, "gi"); }
}
function codesIn(text) {
  const out = new Set();
  const re = codeRegex();
  let m;
  const s = String(text || "");
  while ((m = re.exec(s))) out.add(normCode(m[1]));
  return out;
}
/* Koderna som de står i PDF:en (t.ex. "PM06", "PM09B"), för visning. */
function rawCodesIn(text) {
  const out = [];
  const re = codeRegex();
  let m;
  const s = String(text || "");
  while ((m = re.exec(s))) out.push(m[1].replace(/\s+/g, "").toUpperCase());
  return out;
}
const itemCodeCache = new Map();
function itemCodes(it) {
  if (!itemCodeCache.has(it.id)) {
    itemCodeCache.set(it.id, codesIn([it.area, it.activity, it.object_name, it.contractor, it.source_key].filter(Boolean).join(" | ")));
  }
  return itemCodeCache.get(it.id);
}
function itemsForZone(zone) {
  const rule = zone.rule || { field: "auto" };
  if (rule.field && rule.field !== "auto") {
    const v = String(rule.value || "").trim().toLowerCase();
    if (!v) return [];
    return visibleItems().filter(it => String(it[rule.field] || "").toLowerCase().includes(v));
  }
  const code = normCode(zone.code);
  const pos = positionsInPdf();
  const polys = zone.polys || [];
  return visibleItems().filter(it => (code && itemCodes(it).has(code)) ||
    (pos && polys.length && pos.has(it.id) && polys.some(poly => pointInPoly(pos.get(it.id), poly))));
}

// ---------------------------------------------------------------------
// Position i 3D -> PDF (kalibrering med två punktpar)
// ---------------------------------------------------------------------
/* Likformighetstransform (skala + rotation + förflyttning) från modellens
   XY (meter) till PDF-punkter, bestämd av två punktpar. */
function modelToPdf(x, y) {
  const [m1, m2] = plan.calib.model, [p1, p2] = plan.calib.pdf;
  const mx = m2[0] - m1[0], my = m2[1] - m1[1], px = p2[0] - p1[0], py = p2[1] - p1[1];
  const d = mx * mx + my * my;
  const ar = (px * mx + py * my) / d, ai = (py * mx - px * my) / d;
  const dx = x - m1[0], dy = y - m1[1];
  return [p1[0] + ar * dx - ai * dy, p1[1] + ai * dx + ar * dy];
}
function levelRange() {
  const n = v => (v === "" || v == null || !Number.isFinite(Number(v))) ? null : Number(v);
  const l = (plan && plan.level) || {};
  return [n(l.z0), n(l.z1)];
}
/* item-id -> PDF-punkt för objekt inom vald nivå, eller null om planen inte är kalibrerad. */
function positionsInPdf() {
  if (!plan || !plan.calib || !positions.length) return null;
  if (posPdfCache) return posPdfCache;
  const [z0, z1] = levelRange();
  posPdfCache = new Map();
  positions.forEach(p => {
    const zc = (p.z0 + p.z1) / 2;
    if (z0 !== null && zc < z0) return;
    if (z1 !== null && zc > z1) return;
    posPdfCache.set(p.id, modelToPdf(p.x, p.y));
  });
  return posPdfCache;
}
/* Objektens fotavtryck i PDF:en (bounding boxens hörn, eller bara mittpunkten
   för positioner hämtade innan hörnen sparades) för objekt inom vald nivå. */
let shapeCache = null;
function objectShapesInPdf() {
  const pos = positionsInPdf();
  if (!pos) return null;
  if (shapeCache) return shapeCache;
  const byId = new Map(positions.map(p => [p.id, p]));
  const hideSubs = !showSubObjects() ? subCoupledIds() : null;
  let list = visibleItems().filter(it => pos.has(it.id) && !(hideSubs && hideSubs.has(it.id)) && !isObjHidden(it)).map(it => {
    const p = byId.get(it.id);
    const poly = Number.isFinite(p.x0)
      ? [[p.x0, p.y0], [p.x1, p.y0], [p.x1, p.y1], [p.x0, p.y1]].map(([x, y]) => modelToPdf(x, y))
      : null;
    return { it, members: [it], center: pos.get(it.id), origin: pos.get(it.id), poly, zc: (p.z0 + p.z1) / 2, fam: objFamKey(it) };
  });
  // En markering per aktivitet (Victors önskemål 2026-10-02): flera objekt
  // kopplade till samma aktivitet blir en prick i deras mitt (med antalet).
  if (objGroupOn() && objStyle() !== "footprint") {
    const fams = new Map();
    list.forEach(o => { if (!fams.has(o.fam)) fams.set(o.fam, []); fams.get(o.fam).push(o); });
    list = [...fams.values()].map(g => g.length === 1 ? g[0] : {
      it: g[0].it, members: g.map(o => o.it), poly: null, fam: g[0].fam, zc: Math.max(...g.map(o => o.zc)),
      center: [g.reduce((a, o) => a + o.center[0], 0) / g.length, g.reduce((a, o) => a + o.center[1], 0) / g.length],
    });
    list.forEach(o => { o.origin = o.center; });
  }
  // Flyttade markeringar (sparade i projektet, lagesplan-objmarks.js).
  if (typeof objMarkPos === "function") list.forEach(o => { const m = objMarkPos(o.fam); if (m) { o.center = modelToPdf(m[0], m[1]); o.moved = true; } });
  shapeCache = list.sort((a, b) => a.zc - b.zc); // lägre objekt först, högre ritas ovanpå
  return shapeCache;
}
function invalidatePositions() { posPdfCache = null; shapeCache = null; }

let objMinPx = 4; // prickradie (canvas-px) vid senaste ritningen, för hovring
/* Hur objekten ritas: "dots" = en rund prick i objektets mitt i statusfärgen
   (standard – tydligast på ortofoto), "footprint" = objektets fotavtryck
   (bounding box, blir snett och för stort för roterade/stora objekt). */
const OBJ_STYLE_KEY = "lagesplan-objstyle";
const OBJ_SIZE_KEY = "lagesplan-objsize";     // prickstorlek i procent (100 = standard)
const OBJ_SUBS_KEY = "lagesplan-objsubs";     // "0" = dölj objekt kopplade till delaktiviteter
function objSize() { try { const v = parseInt(localStorage.getItem(OBJ_SIZE_KEY), 10); return Number.isFinite(v) && v >= 25 && v <= 400 ? v : 100; } catch (e) { return 100; } }
function showSubObjects() { try { return localStorage.getItem(OBJ_SUBS_KEY) !== "0"; } catch (e) { return true; } }
/* Objekt som bara hör till en del av aktivitetens delaktiviteter (kopplade
   till en delaktivitet i 4D-planering): aktiviteten har fler delaktiviteter
   än just det här objektet. */
let subCoupledCache = null;
function subCoupledIds() {
  if (subCoupledCache) return subCoupledCache;
  const namesById = new Map();
  (subActs || []).forEach(a => { if (!namesById.has(a.plan_item_id)) namesById.set(a.plan_item_id, new Set()); namesById.get(a.plan_item_id).add((a.name || "").trim().toLowerCase()); });
  const famKey = it => it.group_id ? "g:" + it.group_id : it.source_key ? "s:" + it.source_key : null;
  const famNames = new Map();
  items.forEach(it => { const k = famKey(it); if (!k) return; if (!famNames.has(k)) famNames.set(k, new Set()); (namesById.get(it.id) || []).forEach(n => famNames.get(k).add(n)); });
  subCoupledCache = new Set(items.filter(it => {
    const own = namesById.get(it.id), k = famKey(it);
    return own && own.size && k && famNames.get(k).size > own.size;
  }).map(it => it.id));
  return subCoupledCache;
}
const OBJ_GROUP_KEY = "lagesplan-objgroup"; // "0" = en prick per objekt
function objGroupOn() { try { return localStorage.getItem(OBJ_GROUP_KEY) !== "0"; } catch (e) { return true; } }
function objStyle() { try { return localStorage.getItem(OBJ_STYLE_KEY) || "dots"; } catch (e) { return "dots"; } }

/* Objekten under muspekaren (PDF-punkt): fotavtryck som innehåller punkten,
   eller en prick inom sin radie. Minsta träffen (en prick, ett litet objekt)
   först - det är oftast den man siktar på. */
function objectsAt(pdfPt) {
  if (!$("showObjects").checked) return [];
  const objects = objectShapesInPdf();
  if (!objects || !objects.length) return [];
  // Minst ~6 skärmpixlar att träffa, även utzoomat.
  const tol = Math.max(objMinPx, 6 / view.scale) / renderScale;
  const hits = [];
  for (const o of objects) {
    const area = o.poly ? Math.abs(polyArea(o.poly)) : 0;
    const big = objStyle() === "footprint" && o.poly && Math.sqrt(area) >= tol;
    if (big ? pointInPoly(pdfPt, o.poly) : Math.hypot(o.center[0] - pdfPt[0], o.center[1] - pdfPt[1]) <= tol) hits.push({ o, area: big ? area : 0 });
  }
  return hits.sort((a, b) => a.area - b.area).map(h => h.o);
}
function polyArea(poly) {
  let a = 0;
  poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; });
  return a / 2;
}
const escHtml = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function objectTipHtml(o) {
  const it = o.it;
  const at = $("dateInput").value || todayIso();
  const warn = Number.isFinite(settings.warningDaysBeforeEnd) ? settings.warningDaysBeforeEnd : 7;
  const ph = computeItemPhase(it, at, warn) || fallbackPhase(it);
  const zone = ((plan && plan.zones) || []).find(z => (z.polys || []).some(poly => pointInPoly(o.center, poly)));
  const progress = it.status === "klar" ? 100 : (Number(it.progress) || 0);
  const rows = [
    `<b>${escHtml(it.object_name || it.activity || it.object_id)}</b>`,
    [it.area, it.activity].filter(Boolean).map(escHtml).join(" · "),
    `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${phaseColor(ph)};margin-right:5px;"></span>${escHtml(PHASE_LABELS[ph] || ph)} · ${progress} % klart`,
    it.start_date ? `Plan: ${escHtml(it.start_date)} → ${escHtml(it.end_date || "?")}` : "Inga planerade datum",
    (it.actual_start_date || it.actual_end_date) ? (() => { const t = todayIso(), cap = d => (d && d > t ? t : d); return `Verkligt: ${escHtml(cap(it.actual_start_date) || "?")} → ${escHtml(cap(it.actual_end_date) || "pågår")}`; })() : "",
    it.contractor ? `Entreprenör: ${escHtml(it.contractor)}` : "",
    zone ? `Zon: ${escHtml(zone.code)}` : "",
    o.members && o.members.length > 1 ? `${o.members.length} objekt: ${escHtml(o.members.slice(0, 6).map(m => m.object_name || m.object_id).join(", "))}${o.members.length > 6 ? " …" : ""}` : "",
    o.moved ? "📍 Flyttad markering (klicka för att låsa upp eller återställa)" : ""
  ];
  return rows.filter(Boolean).join("<br>");
}

/* Canvas-px per skärm-px för objektlagret på skärmen (1 i film/utskrift). */
function canvasPerScreenPx(ctx) {
  const oc = ctx.canvas, ow = oc && oc.getBoundingClientRect ? oc.getBoundingClientRect().width : 0;
  // Stage-px per skärm-px (ritningen sker i stage-px, även när lagret är i högre upplösning).
  return oc && ow > 0 && oc.id === "objCanvas" ? 1 / view.scale : 0;
}
function objDotRadius(ctx, fontPx) {
  const k = canvasPerScreenPx(ctx);
  return Math.max(4, fontPx / 3, k ? 7 * k : 4) * objSize() / 100;
}

/* ---------------------------------------------------------------------
   Namn på objekten som små etiketter (Victors önskemål 2026-10-01).
   Av från början. Bara det korta namnet, vit etikett med kant i status-
   färgen. Etiketter som skulle krocka hoppas över (fler får plats ju mer
   man zoomar in); är det trångt flyttas etiketten ut med en tunn linje.
   ------------------------------------------------------------------- */
const OBJ_LABELS_KEY = "lagesplan-objlabels";     // "1" = visa namn
const OBJ_LABELS_WHICH_KEY = "lagesplan-objlabels-which";
function objLabelsOn() { try { return localStorage.getItem(OBJ_LABELS_KEY) === "1"; } catch (e) { return false; } }
const OBJ_LABEL_SIZE_KEY = "lagesplan-objlabel-size";  // namnens storlek i procent
function objLabelSize() { try { const v = parseInt(localStorage.getItem(OBJ_LABEL_SIZE_KEY), 10); return Number.isFinite(v) && v >= 40 && v <= 400 ? v : 100; } catch (e) { return 100; } }
function objLabelsWhich() { try { return localStorage.getItem(OBJ_LABELS_WHICH_KEY) || "all"; } catch (e) { return "all"; } }
/* Namn man själv tryckt bort (högerklick på namnet): per projekt i webbläsaren. */
const hiddenLabelsKey = () => "lagesplan-hidden-labels-" + projectId;
function hiddenLabels() {
  try { const v = JSON.parse(localStorage.getItem(hiddenLabelsKey()) || "{}") || {}; return { ids: v.ids || [], acts: v.acts || [], names: v.names || [] }; }
  catch (e) { return { ids: [], acts: [], names: [] }; }
}
function saveHiddenLabels(h, opts = {}) {
  if (opts.undo !== false) { objHideUndo.push({ kind: "labels", state: hiddenLabels() }); if (objHideUndo.length > 30) objHideUndo.shift(); lastUndoTarget = "obj"; }
  try { localStorage.setItem(hiddenLabelsKey(), JSON.stringify(h)); } catch (e) {} updateHiddenLabelsBtn(); renderZones(); }
function updateHiddenLabelsBtn() {
  const b = $("btnShowHiddenLabels");
  if (!b) return;
  const h = hiddenLabels(), n = (h.names.length || (h.ids.length ? 1 : 0)) + h.acts.length;
  b.classList.toggle("hidden", !n);
  b.textContent = `Visa dolda namn (${n})`;
}
let objLabelBoxes = []; // senast ritade namnetiketter på skärmen: { box, ids, text, act }
function objLabelText(it) {
  const t = String(it.object_name || it.activity || "").trim();
  return t.length > 18 ? t.slice(0, 17) + "…" : t;
}
/* scr (skärmen): { map: pdf-punkt -> skärm-px, fs, r } – namnen ritas då på
   #labelCanvas i skärmens koordinater, så textstorleken är konstant vid zoom
   och styrs bara av reglaget (Victors önskemål 2026-10-01). */
function drawObjectLabels(ctx, objects, fontPx, scr) {
  if (!objLabelsOn() || !objects || !objects.length) return;
  const toXY = scr ? scr.map : toPx;
  const at = $("dateInput").value || todayIso();
  const warn = Number.isFinite(settings.warningDaysBeforeEnd) ? settings.warningDaysBeforeEnd : 7;
  const which = objLabelsWhich();
  const fs = scr ? scr.fs : Math.max(8, fontPx * 0.55) * objLabelSize() / 100;
  const r = scr ? scr.r : objDotRadius(ctx, fontPx);
  const pad = fs * 0.3, gap = r + fs * 0.25;
  // Viktigast först: fokus, försenade, pågående, resten.
  const rank = ph => ({ forsenad: 0, pagaende: 1 }[ph] ?? 3);
  const hid = hiddenLabels(), hidIds = new Set(hid.ids), hidActs = new Set(hid.acts);
  const onScreen = !!scr;
  if (onScreen) objLabelBoxes = [];
  const list = objects.map(o => ({ o, ph: computeItemPhase(o.it, at, warn) || fallbackPhase(o.it), f: focusState(o.it) }))
    .filter(x => objLabelText(x.o.it) && !hidIds.has(x.o.it.id) && !hidActs.has(String(x.o.it.activity || "").trim()))
    .filter(x => which === "all" || (which === "active" && ["pagaende", "forsenad"].includes(x.ph)) || (which === "late" && x.ph === "forsenad") || (which === "focus" && x.f === true))
    .sort((a, b) => (b.f === true) - (a.f === true) || rank(a.ph) - rank(b.ph));
  // Prickar som ligger (nästan) på samma ställe – t.ex. form, armering och
  // betong i samma fundament – blir EN etikett, annars blockerar de varandra.
  const clusters = [];
  const cell = Math.max(1, r * 1.5), grid = new Map();
  objects.forEach(o => {
    const [x, y] = toXY(o.center);
    if (scr && (x < -200 || y < -200 || x > scr.w + 200 || y > scr.h + 200)) return;
    const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
    let c = null;
    for (let dx = -1; dx <= 1 && !c; dx++) for (let dy = -1; dy <= 1 && !c; dy++) {
      (grid.get(`${gx + dx},${gy + dy}`) || []).some(q => { if (Math.hypot(q.x - x, q.y - y) <= r * 1.5) { c = q; return true; } return false; });
    }
    if (!c) { c = { x, y, objs: [] }; clusters.push(c); const k = `${gx},${gy}`; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c); }
    c.objs.push(o);
  });
  const clusterOf = new Map();
  clusters.forEach((c, i) => c.objs.forEach(o => clusterOf.set(o.it.id, i)));
  const placed = [];
  const dotsBox = clusters.map((c, i) => ({ x: c.x - r, y: c.y - r, w: 2 * r, h: 2 * r, id: i }));
  const over = (b, q) => b.x < q.x + q.w && b.x + b.w > q.x && b.y < q.y + q.h && b.y + b.h > q.y;
  let ownId = null;
  const hit = b => placed.some(q => over(b, q)) || dotsBox.some(q => q.id !== ownId && over(b, q));
  const done = new Set();
  ctx.save();
  ctx.font = `600 ${fs}px "Segoe UI", Arial, sans-serif`;
  ctx.textBaseline = "middle";
  for (const { o, ph } of list) {
    const ci = clusterOf.get(o.it.id);
    if (ci === undefined || done.has(ci)) continue;
    done.add(ci);
    const cl = clusters[ci];
    const shown = cl.objs.filter(x => !hidIds.has(x.it.id) && !hidActs.has(String(x.it.activity || "").trim()));
    const names = [...new Set(shown.map(x => objLabelText(x.it)).filter(Boolean))];
    const text = names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
    ownId = ci;
    const [cx, cy] = [cl.x, cl.y];
    const w = ctx.measureText(text).width + pad * 2, h = fs + pad * 1.4;
    // Kandidater: höger, vänster, ovan, under – nära pricken, sedan längre ut med linje.
    const near = [[cx + gap, cy - h / 2], [cx - gap - w, cy - h / 2], [cx - w / 2, cy - gap - h], [cx - w / 2, cy + gap]];
    const far = [[cx + gap * 3, cy - h * 1.6], [cx - gap * 3 - w, cy - h * 1.6], [cx + gap * 3, cy + h * 0.6], [cx - gap * 3 - w, cy + h * 0.6]];
    let box = null, leader = false;
    for (const [x, y] of near) { const b = { x, y, w, h }; if (!hit(b)) { box = b; break; } }
    if (!box) for (const [x, y] of far) { const b = { x, y, w, h }; if (!hit(b)) { box = b; leader = true; break; } }
    if (!box) continue;
    placed.push(box);
    if (onScreen) objLabelBoxes.push({ box, ids: shown.map(x => x.it.id), text, act: String(o.it.activity || "").trim() });
    const color = phaseColor(ph);
    if (leader) {
      const tx = Math.max(box.x, Math.min(cx, box.x + box.w)), ty = Math.max(box.y, Math.min(cy, box.y + box.h));
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, fs / 12);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(tx, ty); ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.93)";
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, fs / 10);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(box.x, box.y, box.w, box.h, h / 3); else ctx.rect(box.x, box.y, box.w, box.h);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#111827";
    ctx.fillText(text, box.x + pad, box.y + box.h / 2);
  }
  ctx.restore();
}

/* Varje planerat objekt i sin egen fasfärg (samma som i 3D-modellen) vid valt datum. */
function drawObjects(ctx, objects, fontPx) {
  const at = $("dateInput").value || todayIso();
  const warn = Number.isFinite(settings.warningDaysBeforeEnd) ? settings.warningDaysBeforeEnd : 7;
  const dots = objStyle() !== "footprint";
  // Prickar: minst ~7 skärmpixlar i radie oavsett zoom (canvas-px = skärm-px · renderScale / view.scale).
  const minPx = dots ? objDotRadius(ctx, fontPx) : Math.max(3, fontPx / 4);
  objMinPx = minPx;
  ctx.save();
  ctx.lineWidth = 1;
  for (const o of objects) {
    const grouped = o.members && o.members.length > 1;
    const color = phaseColor(grouped ? zonePhase(o.members, at) : computeItemPhase(o.it, at, warn) || fallbackPhase(o.it));
    // Flyttad markering: tunn streckad linje tillbaka till objektens läge.
    if (o.moved && o.origin) {
      const [ax, ay] = toPx(o.origin), [bx, by] = toPx(o.center);
      ctx.save(); ctx.globalAlpha = 0.8; ctx.strokeStyle = shade(color, -0.45); ctx.lineWidth = Math.max(1, minPx / 4); ctx.setLineDash([minPx * 0.8, minPx * 0.6]);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(ax, ay, Math.max(1.5, minPx / 3), 0, Math.PI * 2); ctx.fillStyle = shade(color, -0.45); ctx.fill(); ctx.restore();
    }
    // Veckans fokus: objekten som startar snart framhävs, resten tonas ned.
    const focus = focusState(o.it);
    ctx.fillStyle = color;
    ctx.strokeStyle = focus === true ? "#111827" : shade(color, -0.45);
    ctx.lineWidth = focus === true ? Math.max(2, minPx / 2) : 1;
    ctx.globalAlpha = focus === false ? 0.15 : dots ? 1 : 0.85;
    if (dots && focus !== true) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1, minPx / 4); }
    const pts = o.poly ? o.poly.map(toPx) : null;
    const big = !dots && pts && Math.max(...pts.map(q => Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]))) >= minPx;
    ctx.beginPath();
    if (big) {
      pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.closePath();
    } else {
      const [x, y] = toPx(o.center);
      ctx.arc(x, y, focus === true ? minPx * 2.2 : minPx, 0, Math.PI * 2);
    }
    if (focus === true) {
      // Gul gloria runt det som startar snart, så det syns även på avstånd.
      ctx.save();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = "#facc15"; ctx.lineWidth = minPx * 1.6;
      ctx.stroke();
      ctx.restore();
    }
    ctx.fill();
    ctx.globalAlpha = focus === false ? 0.25 : 1;
    ctx.stroke();
    if (!big) {
      const [x, y] = toPx(o.center), rr = focus === true ? minPx * 2.2 : minPx;
      // Antalet objekt i en samlad markering.
      if (grouped && rr >= 5) { ctx.save(); ctx.fillStyle = contrastText(color); ctx.font = `800 ${Math.max(6, rr * 0.95)}px "Segoe UI", Arial, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(o.members.length), x, y + 0.5); ctx.restore(); }
      // Upplåst för flytt: streckad blå ring.
      if (typeof objMarkUnlocked !== "undefined" && objMarkUnlocked.has(o.fam)) { ctx.save(); ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = Math.max(1.5, rr / 4); ctx.setLineDash([rr * 0.5, rr * 0.35]); ctx.beginPath(); ctx.arc(x, y, rr * 1.55, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    }
  }
  ctx.restore();
}

function updateCalibInfo() {
  const el = $("calibInfo");
  if (!plan) { el.textContent = ""; return; }
  const [z0, z1] = levelRange();
  $("levelZ0").value = z0 ?? ""; $("levelZ1").value = z1 ?? "";
  if (!plan.calib) { el.textContent = "Inte kalibrerad ännu."; return; }
  const [m1, m2] = plan.calib.model, [p1, p2] = plan.calib.pdf;
  const scale = Math.hypot(m2[0] - m1[0], m2[1] - m1[1]) * 1000 / (Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) * 25.4 / 72);
  const pos = positionsInPdf();
  const inZone = pos ? [...pos.values()].filter(pt => (plan.zones || []).some(z => (z.polys || []).some(poly => pointInPoly(pt, poly)))).length : 0;
  el.textContent = `✓ Kalibrerad (skala ≈ 1:${Math.round(scale)}). ` + (positions.length
    ? `${positions.length} objekt har position, ${pos ? pos.size : 0} på vald nivå, ${inZone} ligger i en zon.`
    : "Hämta positioner (📍) för att koppla objekten.");
}

function setCalibMsg(t) { const m = $("calibMsg"); m.textContent = t || ""; m.classList.toggle("hidden", !t); if (t) openSec("calib"); }
function startCalib() {
  if (!plan || !viewport) return;
  if (!window.opener) { alert("Kalibreringen behöver 4D-planering öppen i Trimble Connect. Öppna lägesplanen via 🗺️-knappen där."); return; }
  if (drawMode) setDrawMode(false);
  calib = { pdf: [], model: [] };
  $("btnCalib").textContent = "✕ Avbryt kalibrering";
  calibNext();
}
function cancelCalib() {
  if (calib && calib.pdf.length === 2 && calib.model.length < 2) askOpener("cancelPick", {}, 3000).catch(() => {});
  calib = null;
  $("btnCalib").textContent = "📐 Kalibrera mot 3D";
  $("viewport").classList.remove("drawing");
  setCalibMsg("");
  renderZones();
}
/* Ordning: båda punkterna i PDF:en först, sedan båda i 3D i ett svep - så
   man bara behöver byta till Trimble Connect en gång. */
async function calibNext() {
  if (!calib) return;
  if (calib.pdf.length < 2) {
    const n = calib.pdf.length + 1;
    calib.waitPdf = true;
    $("viewport").classList.add("drawing");
    setCalibMsg(`Steg ${n} av 4: klicka på punkt ${n} i PDF:en, t.ex. ett rutnätskryss eller ett byggnadshörn.${n === 2 ? " Välj en punkt långt från den första." : ""}`);
    return;
  }
  if (calib.model.length < 2) {
    const n = calib.model.length + 1;
    $("viewport").classList.remove("drawing");
    setCalibMsg(`Steg ${n + 2} av 4: gå till Trimble Connect och klicka på punkt ${n} (samma ställe som krysset ${n} i PDF:en) i 3D-modellen.${n === 1 ? " Klicka sedan direkt punkt 2 – 4D-planering visar vilken punkt som väntas." : ""}`);
    try {
      const r = await askOpener("pick", { n }, 0);
      if (!calib) return;
      calib.model.push([r.point.x, r.point.y, r.point.z]);
      calibNext();
    } catch (e) {
      if (calib) { alert("Kalibreringen avbröts: " + e.message); cancelCalib(); }
    }
    return;
  }
  finishCalib();
}
function finishCalib() {
  const { pdf, model } = calib;
  cancelCalib();
  const dm = Math.hypot(model[1][0] - model[0][0], model[1][1] - model[0][1]);
  const dp = Math.hypot(pdf[1][0] - pdf[0][0], pdf[1][1] - pdf[0][1]);
  if (dm < 0.5 || dp < 5) { alert("Punkterna ligger för nära varandra. Välj två punkter långt ifrån varandra och försök igen."); return; }
  plan.calib = { pdf, model };
  plan._calibSet = true; // kalibrerad här: får ersätta projektets kalibrering när den sparas
  renderOrtho();
  const z = (model[0][2] + model[1][2]) / 2;
  if (!plan.level) plan.level = { z0: Math.round((z - 0.5) * 10) / 10, z1: Math.round((z + 3.5) * 10) / 10 };
  invalidatePositions();
  renderZones();
  schedulePlanSave();
  if (!positions.length) fetchPositions();
}
/* Uppdatera-knappen (bredvid nyckeln): läser om planeringen och, när
   4D-planering är öppen, objektens positioner från 3D – så nya kopplingar syns. */
async function refreshCoupled() {
  const btn = $("btnRefreshData");
  if (btn) btn.classList.add("spinning");
  try {
    setBusy("Hämtar planeringen…");
    const [its, pos, acts] = await Promise.all([ghReadJSON(token, dataPath("plan_items.json")), ghReadJSON(token, dataPath("plan_item_positions.json")).catch(() => positions), ghReadJSON(token, dataPath("plan_item_activities.json")).catch(() => subActs)]);
    items = its; positions = pos; subActs = acts; subCoupledCache = null;
    if (typeof invalidateVisible === "function") invalidateVisible(); else invalidatePositions();
    if (typeof populateFilterOptions === "function") populateFilterOptions();
    $("projectInfo").textContent = `Projekt ${projectId} · ${items.length} planerade objekt`;
    renderZones();
    setBusy("");
    if (window.opener && !window.opener.closed && plan && plan.calib) await fetchPositions();
    else setSaveStatus(`Planeringen uppdaterad (${items.length} objekt). Nya positioner kan bara hämtas när 4D-planering är öppen i Trimble Connect.`);
  } catch (e) {
    setBusy("");
    alert("Kunde inte uppdatera: " + e.message);
  } finally { if (btn) btn.classList.remove("spinning"); }
}

async function fetchPositions() {
  setBusy("Hämtar objektens positioner från 3D…");
  try {
    const r = await askOpener("positions", {}, 120000);
    const fresh = new Map((r.positions || []).map(p => [p.id, p]));
    const round = v => Math.round(v * 1000) / 1000;
    const rows = [...fresh.values()].map(p => {
      const r = { id: p.id, x: round(p.x), y: round(p.y), z0: round(p.z0), z1: round(p.z1) };
      if (Number.isFinite(p.x0)) Object.assign(r, { x0: round(p.x0), x1: round(p.x1), y0: round(p.y0), y1: round(p.y1) });
      return r;
    });
    positions = [...positions.filter(p => !fresh.has(p.id)), ...rows];
    invalidatePositions();
    renderZones();
    setSaveStatus(`📍 ${rows.length} objekts positioner hämtade${r.missing ? ` (${r.missing} finns inte i de öppna modellerna)` : ""}.`);
    ghWriteJSON(token, dataPath("plan_item_positions.json"),
      arr => [...arr.filter(p => !fresh.has(p.id)), ...rows], "Lägesplan: objektpositioner")
      .catch(e => setSaveStatus("⚠ Kunde inte spara positionerna: " + e.message));
  } catch (e) {
    alert("Kunde inte hämta positioner: " + e.message);
  } finally {
    setBusy("");
  }
}
function drawCalibMarks(ctx, fontPx) {
  if (!calib) return;
  ctx.save();
  calib.pdf.forEach((p, i) => {
    const [x, y] = toPx(p);
    ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = Math.max(2, fontPx / 6);
    ctx.beginPath(); ctx.moveTo(x - fontPx, y); ctx.lineTo(x + fontPx, y); ctx.moveTo(x, y - fontPx); ctx.lineTo(x, y + fontPx); ctx.stroke();
    ctx.fillStyle = "#0b5fff"; ctx.font = `700 ${fontPx}px Arial`; ctx.fillText(String(i + 1), x + fontPx * 0.4, y - fontPx * 0.4);
  });
  ctx.restore();
}

// ---------------------------------------------------------------------
// Planer: välja, skapa, spara
// ---------------------------------------------------------------------
function renderPlanSelect() {
  const sel = $("planSelect");
  sel.innerHTML = plans.length ? "" : '<option value="">Inga planer ännu</option>';
  plans.forEach(p => {
    const o = document.createElement("option");
    o.value = p.id; o.textContent = p.name;
    sel.appendChild(o);
  });
  if (plan) sel.value = plan.id;
  $("btnRenamePlan").disabled = $("btnDeletePlan").disabled = !plan;
}

/* Sparning (skydd mot överskrivning, Victors önskemål 2026-10-05):
   – den fördröjda sparningen kommer ihåg VILKEN plan som ändrades, och sparas klart innan man byter
     plan, tar in en ny eller tar bort en (förr kunde den förra planens senaste ändring försvinna);
   – en plans kalibrering skrivs bara över när den kalibrerats på den här enheten, och planens PDF-fil
     (file_path) byts aldrig – en annan enhet/flik med äldre data kan inte skriva över en inrefererad plan. */
let saveTimer = null, savePending = null;
function schedulePlanSave() {
  clearTimeout(saveTimer);
  if (plan) savePending = plan;
  setSaveStatus("Osparade ändringar…");
  saveTimer = setTimeout(() => { const p = savePending; savePending = null; savePlan(p); }, 800);
}
async function flushPlanSave() {
  if (!savePending) return;
  clearTimeout(saveTimer);
  const p = savePending; savePending = null;
  await savePlan(p);
}
async function savePlan(p = plan) {
  if (!p) return;
  const rec = { ...p, updated_at: new Date().toISOString(), updated_by: settings.userName || null };
  delete rec._calibSet; delete rec._isNew;
  p.updated_at = rec.updated_at;
  const calibSet = !!p._calibSet, isNew = !!p._isNew;
  let kept = null, gone = false;
  setSaveStatus("Sparar…");
  try {
    plans = await ghWriteJSON(token, dataPath("status_plans.json"),
      arr => {
        const i = arr.findIndex(x => x.id === rec.id), cur = i >= 0 ? arr[i] : null;
        if (cur) {
          if (cur.file_path) { rec.file_path = cur.file_path; rec.file_name = cur.file_name || rec.file_name; }
          if (cur.calib && !calibSet && JSON.stringify(cur.calib) !== JSON.stringify(rec.calib)) { rec.calib = cur.calib; kept = cur.calib; }
          arr[i] = rec;
        } else if (isNew) arr.push(rec);
        else gone = true; // borttagen (t.ex. på en annan enhet): återskapa den inte
        return arr;
      },
      `Lägesplan: ${rec.name}`);
    if (gone) { setSaveStatus(`⚠ Planen "${rec.name}" finns inte längre i projektet – ändringen sparades inte.`); return; }
    if (calibSet) delete p._calibSet;
    delete p._isNew;
    if (kept) { // kalibreringen i projektet var nyare än den här enhetens – använd den
      p.calib = kept;
      if (p === plan) { invalidatePositions(); renderOrtho(); renderZones(); }
    }
    setSaveStatus(`✓ Sparad ${new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}`);
  } catch (e) {
    setSaveStatus("⚠ Kunde inte spara: " + e.message);
  }
}

async function createPlanFromFile(file) {
  await flushPlanSave(); // den öppna planens senaste ändringar sparas först
  const id = ghNewId();
  const name = file.name.replace(/\.pdf$/i, "");
  setBusy("Laddar upp PDF…");
  try {
    const path = dataPath(`status_plans/${id}.pdf`);
    await ghUploadBinary(token, path, file, `Lägesplan: ny plan ${name}`);
    plan = { id, name, file_path: path, file_name: file.name, page: 1, code_pattern: DEFAULT_CODE_PATTERN, zones: [],
      created_at: new Date().toISOString(), created_by: settings.userName || null, _isNew: true };
    plans.push(plan);
    await savePlan();
    renderPlanSelect();
    pdfCache.set(id, await file.arrayBuffer());
    await openPlan(id);
    await detectZones();
  } catch (e) {
    alert("Kunde inte skapa planen: " + e.message);
  } finally {
    setBusy("");
  }
}

const pdfCache = new Map();
async function openPlan(id) {
  await flushPlanSave(); // spara den förra planens ändringar innan vi byter
  plan = plans.find(p => p.id === id) || null;
  renderPlanSelect();
  selectedZoneId = null;
  closeEditor();
  if (!plan) { $("empty").classList.remove("hidden"); return; }
  try { localStorage.setItem("lagesplan-last-" + projectId, id); } catch (e) {}
  $("codePattern").value = plan.code_pattern || DEFAULT_CODE_PATTERN;
  itemCodeCache.clear();
  invalidatePositions();
  if (calib) cancelCalib();
  setBusy("Hämtar PDF…");
  try {
    if (!pdfCache.has(id)) {
      const url = await ghReadBinaryUrl(token, plan.file_path);
      pdfCache.set(id, await (await fetch(url)).arrayBuffer());
      URL.revokeObjectURL(url);
    }
    pdfDoc = await pdfjsLib.getDocument({ data: pdfCache.get(id).slice(0) }).promise;
    page = await pdfDoc.getPage(Math.min(plan.page || 1, pdfDoc.numPages));
    $("pdfHiCanvas").width = 0;
    await renderPdf();
    renderOrtho();
    if (typeof applyPdfOverlays === "function") applyPdfOverlays(); // andra planers PDF:er läggs om mot den nya planen
    buildSnapIndex();
    $("empty").classList.add("hidden");
    fitView();
  } catch (e) {
    alert("Kunde inte öppna PDF:en: " + e.message);
  } finally {
    setBusy("");
  }
  renderZones();
}

// ---------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------
async function renderPdf() {
  const base = page.getViewport({ scale: 1 });
  // Stor nog för att zooma in, men under webbläsarnas canvas-gränser.
  renderScale = Math.min(4, 5000 / Math.max(base.width, base.height));
  viewport = page.getViewport({ scale: renderScale });
  const pc = $("pdfCanvas"), zc = $("zoneCanvas"), stage = $("stage");
  // Alla lager (ortofoto, ritning, zoner, objekt, översta) har samma storlek.
  STAGE_CANVASES.forEach(id => { if (id === "orthoCanvas") return; $(id).width = Math.round(viewport.width); $(id).height = Math.round(viewport.height); });
  stage.style.width = pc.width + "px";
  stage.style.height = pc.height + "px";
  await page.render({
    canvasContext: pc.getContext("2d"), viewport,
    // Originalmarkeringarna (t.ex. röda rutor) döljs som standard - zonerna ersätter dem.
    annotationMode: $("showOriginal").checked ? pdfjsLib.AnnotationMode.ENABLE : pdfjsLib.AnnotationMode.DISABLE
  }).promise;
}

/* Skarp ritning vid inzoomning (Victors önskemål 2026-09-28): pdfCanvas är
   låst till ~5000 px. När man zoomar in ritas den synliga delen om i
   skärmens upplösning på pdfHiCanvas (ligger ovanpå, samma stil). Under
   panorering syns den vanliga ritningen där den skarpa inte räcker till. */
let hiTask = null, hiSeq = 0, hiTimer = 0;
function scheduleHiRender() {
  clearTimeout(hiTimer);
  $("pdfCanvas").style.visibility = "";
  hiTimer = setTimeout(renderPdfHi, 140);
  if (typeof scheduleOverlayHi === "function") scheduleOverlayHi(); // andra planers PDF-lager
}
async function renderPdfHi() {
  const hc = $("pdfHiCanvas"), pc = $("pdfCanvas");
  const seq = ++hiSeq;
  if (!page || !viewport || !pc.width) { hc.width = 0; return; }
  let s = view.scale * (window.devicePixelRatio || 1);
  if (s <= 1.05) { hc.width = 0; pc.style.visibility = ""; return; }
  const vr = $("viewport").getBoundingClientRect();
  const vb = visibleStageBox();
  const x0 = Math.max(0, vb[0]), y0 = Math.max(0, vb[1]);
  const x1 = Math.min(pc.width, vb[2]), y1 = Math.min(pc.height, vb[3]);
  if (x1 <= x0 || y1 <= y0) { hc.width = 0; return; }
  const maxPx = 30e6;
  if ((x1 - x0) * (y1 - y0) * s * s > maxPx) s = Math.sqrt(maxPx / ((x1 - x0) * (y1 - y0)));
  const cw = Math.ceil((x1 - x0) * s), ch = Math.ceil((y1 - y0) * s);
  const tmp = document.createElement("canvas");
  tmp.width = cw; tmp.height = ch;
  const tctx = tmp.getContext("2d");
  tctx.fillStyle = "#fff"; tctx.fillRect(0, 0, cw, ch);
  if (hiTask) { try { hiTask.cancel(); } catch (e) {} }
  const vp = page.getViewport({ scale: renderScale * s, offsetX: -x0 * s, offsetY: -y0 * s });
  hiTask = page.render({ canvasContext: tctx, viewport: vp,
    annotationMode: $("showOriginal").checked ? pdfjsLib.AnnotationMode.ENABLE : pdfjsLib.AnnotationMode.DISABLE });
  try { await hiTask.promise; } catch (e) { return; } // avbruten av en nyare
  if (seq !== hiSeq) return;
  hc.width = cw; hc.height = ch;
  hc.getContext("2d").drawImage(tmp, 0, 0);
  Object.assign(hc.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px`,
    filter: pc.style.filter, opacity: pc.style.opacity, mixBlendMode: pc.style.mixBlendMode, display: pc.style.display });
  // Täcker hela det synliga området - dölj den grövre ritningen under.
  pc.style.visibility = "hidden";
}

const toPx = ([x, y]) => viewport.convertToViewportPoint(x, y);
const toPdf = ([px, py]) => viewport.convertToPdfPoint(px, py);

function zoneStatus(zone) {
  const zi = itemsForZone(zone);
  return { items: zi, phase: zonePhase(zi, $("dateInput").value || todayIso()), progress: zoneProgress(zi) };
}

/* Textstorlek på planen (Victors önskemål 2026-09-29): ett reglage för
   storleken och ett val att hålla samma storlek på skärmen oavsett zoom
   (då ritas etiketterna om när man zoomar). Sparas per webbläsare. */
function textScale() { try { return (Number(localStorage.getItem("lagesplan-textscale")) || 100) / 100; } catch (e) { return 1; } }
function textFixed() { try { return localStorage.getItem("lagesplan-textfixed") === "1"; } catch (e) { return false; } }
function planFontPx() {
  const zc = $("zoneCanvas");
  if (textFixed()) return Math.max(2, 13 * textScale() / Math.max(0.01, view.scale));
  return Math.max(14, Math.round(zc.width / 110)) * textScale();
}
/* Namnen på skärmen: eget canvas ovanpå ritningen i skärmens koordinater,
   ritas om vid varje zoom/panorering. */
let labelObjects = null, labelRaf = 0;
function renderScreenLabels() {
  if (typeof renderScreenPins === "function") renderScreenPins();
  const c = $("labelCanvas");
  if (!c) return;
  const vp = $("viewport"), w = vp.clientWidth, h = vp.clientHeight, dpr = window.devicePixelRatio || 1;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    c.style.width = w + "px"; c.style.height = h + "px";
  }
  const ctx = c.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  objLabelBoxes = [];
  if (!plan || !viewport || !labelObjects || !labelObjects.length || !objLabelsOn()) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const map = p => stageToScreen(toPx(p));
  // Prickens radie på skärmen just nu (prickarna ritas om först när zoomen stannat).
  const r = Math.max(3, objMinPx * view.scale);
  drawObjectLabels(ctx, labelObjects, planFontPx(), { map, fs: 11 * objLabelSize() / 100, r, w, h });
}
function renderScreenLabelsSoon() { if (!labelRaf) labelRaf = requestAnimationFrame(() => { labelRaf = 0; renderScreenLabels(); }); }
let textRaf = 0;
function rerenderTextIfFixed() {
  if (!textFixed() || textRaf) return;
  textRaf = requestAnimationFrame(() => { textRaf = 0; renderZones(); });
}

/* Canvaslagren i #stage, nedifrån och upp - se lagesplan-layers.js. */
const STAGE_CANVASES = ["orthoCanvas", "pdfCanvas", "zoneCanvas", "objCanvas", "topCanvas"];

/* Skarpa zoner, prickar och etablering vid inzoomning (Victors önskemål
   2026-10-02). Lagren ritades i ritningens upplösning (~5000 px) och blev
   suddiga när de förstorades. Inzoomat täcker de nu bara det synliga området
   (plus en marginal för panorering) i skärmens upplösning; allt ritas
   fortfarande i stage-px via en transform. Utzoomat och vid export (PNG,
   PDF, film) ritas hela bladet som förut – utskrifternas storlek påverkas inte. */
let ovFull = false, ovLast = null, ovTimer = 0;
const OV_BUDGET = 20e6; // max pixlar per lager
function overlayRegion() {
  const pc = $("pdfCanvas"), W = pc.width, H = pc.height, full = { x0: 0, y0: 0, w: W, h: H, s: 1, full: true };
  const s0 = view.scale * (window.devicePixelRatio || 1);
  if (ovFull || !W || s0 <= 1.05) return full;
  const vb = visibleStageBox(), mw = (vb[2] - vb[0]) * 0.5, mh = (vb[3] - vb[1]) * 0.5;
  const x0 = Math.max(0, vb[0] - mw), y0 = Math.max(0, vb[1] - mh), x1 = Math.min(W, vb[2] + mw), y1 = Math.min(H, vb[3] + mh);
  if (x1 <= x0 || y1 <= y0) return full;
  let s = s0;
  if ((x1 - x0) * (y1 - y0) * s * s > OV_BUDGET) s = Math.sqrt(OV_BUDGET / ((x1 - x0) * (y1 - y0)));
  if (s <= 1) return full;
  return { x0, y0, w: x1 - x0, h: y1 - y0, s, s0 };
}
/* Efter zoom/panorering: rita om när upplösningen inte räcker eller det synliga
   området går utanför det som är ritat. */
function scheduleOverlayRerender() {
  if (!ovLast || !viewport) return;
  const s0 = view.scale * (window.devicePixelRatio || 1);
  const wantFull = s0 <= 1.05;
  if (ovLast.full && wantFull) return;
  let outside = false;
  if (!ovLast.full) { const vb = visibleStageBox(); outside = vb[0] < ovLast.x0 - 1 || vb[1] < ovLast.y0 - 1 || vb[2] > ovLast.x0 + ovLast.w + 1 || vb[3] > ovLast.y0 + ovLast.h + 1; }
  const res = ovLast.full ? !wantFull : (wantFull || Math.abs(s0 / ovLast.s0 - 1) > 0.15);
  if (!outside && !res) return;
  clearTimeout(ovTimer);
  ovTimer = setTimeout(renderZones, outside ? 30 : 160);
}
function renderZones() {
  const zc = $("zoneCanvas");
  const ctx = zc.getContext("2d");
  const ov = overlayRegion(); ovLast = ov;
  const cw = Math.max(1, Math.ceil(ov.w * ov.s)), ch = Math.max(1, Math.ceil(ov.h * ov.s));
  ["zoneCanvas", "objCanvas", "topCanvas"].forEach(id => {
    const c = $(id);
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    Object.assign(c.style, { left: `${ov.x0}px`, top: `${ov.y0}px`, width: `${ov.w}px`, height: `${ov.h}px` });
    const cx = c.getContext("2d");
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.clearRect(0, 0, cw, ch);
    cx.setTransform(ov.s, 0, 0, ov.s, -ov.x0 * ov.s, -ov.y0 * ov.s);
  });
  const octx = $("objCanvas").getContext("2d");
  const tctx = $("topCanvas").getContext("2d");
  if (!plan || !viewport) { renderZoneList(); return; }
  const fontPx = planFontPx();
  const objects = $("showObjects").checked ? objectShapesInPdf() : null;
  const badges = drawZoneShapes(ctx, fontPx, objects);
  if (objects) drawObjects(octx, objects, fontPx);
  labelObjects = objects;
  renderScreenLabels();
  objRenderedScale = view.scale;
  renderObjHint(objects);
  drawSiteLayers(tctx, fontPx);
  zoneLabelBoxes = [];
  if (layerVisible("zones")) badges.forEach(([pt, text, color, hollow, zs, zid, li]) => {
    const r = drawBadge(tctx, pt, text, color, fontPx, hollow, zs);
    if (zid) zoneLabelBoxes.push({ x: pt[0], y: pt[1], ...r, zid, li });
  });
  drawToolOverlays(tctx, fontPx);
  if (typeof drawZoneOverlay === "function") drawZoneOverlay(tctx, fontPx);
  drawCalibMarks(tctx, fontPx);
  afterRenderTools();
  renderZoneList();
  updateCalibInfo();
}

/* Zonernas ytor på ctx (stage-px). Returnerar etiketterna (ritas ovanpå
   allt annat). cached = använd statusen från senaste renderZones (filmen). */
let zoneLabelBoxes = []; // zonetiketter på skärmen (stage-px): { x, y, w, h, rot, zid, li }
/* Zonens utseende (Victors önskemål 2026-10-02): zone.style kan sätta
   fyllning (statusfärg/egen/ingen), opacitet, mönster, kantlinje (färg,
   tjocklek, streckning), etikettens stil, storlek och innehåll samt dölja
   zonen. Utan style ser zonen ut som förut. */
const ZONE_STYLE_DEFAULT = { fill: "phase", fillColor: "#2563eb", fillOpacity: null, pattern: "none", stroke: "auto", strokeColor: "#1f2937", strokeWidth: 1, dash: "auto", label: "pill", labelSize: 1, labelPct: true, labelName: false, hidden: false };
const zoneStyle = z => ({ ...ZONE_STYLE_DEFAULT, ...(z.style || {}) });
function zonePatternFill(ctx, pattern, color, fontPx) {
  const step = Math.max(6, fontPx * 0.7);
  ctx.save(); ctx.clip();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(1, fontPx / 12); ctx.globalAlpha = Math.min(1, ctx.globalAlpha * 2.2);
  const c = ctx.canvas, W = c.width * 2, H = c.height * 2; // ritas över hela den klippta ytan
  const t = ctx.getTransform(), inv = t.inverse();
  const P = [[0, 0], [c.width, 0], [0, c.height], [c.width, c.height]].map(([x, y]) => [inv.a * x + inv.c * y + inv.e, inv.b * x + inv.d * y + inv.f]);
  const x0 = Math.min(...P.map(p => p[0])), x1 = Math.max(...P.map(p => p[0])), y0 = Math.min(...P.map(p => p[1])), y1 = Math.max(...P.map(p => p[1]));
  ctx.beginPath();
  if (pattern === "dots") {
    const r = Math.max(1, fontPx / 10);
    for (let x = Math.floor(x0 / step) * step; x < x1; x += step) for (let y = Math.floor(y0 / step) * step; y < y1; y += step) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
    ctx.fill();
  } else {
    const h = y1 - y0;
    for (let d = Math.floor((x0 - h) / step) * step; d < x1 + h; d += step) {
      ctx.moveTo(d, y1); ctx.lineTo(d + h, y0);
      if (pattern === "cross") { ctx.moveTo(d, y0); ctx.lineTo(d + h, y1); }
    }
    ctx.stroke();
  }
  ctx.restore();
}
function drawZoneShapes(ctx, fontPx, objects, cached) {
  const badges = [];
  for (const zone of plan.zones || []) {
    const st = cached && zone._status ? zone._status : zoneStatus(zone);
    zone._status = st;
    const zs = zoneStyle(zone);
    const selected = zone.id === selectedZoneId || (typeof zoneSel !== "undefined" && zoneSel.size > 1 && zoneSel.has(zone.id));
    if (zs.hidden && !selected) continue;
    const phaseCol = phaseColor(st.phase);
    const color = zs.fill === "custom" ? zs.fillColor : phaseCol;
    const noStatus = st.phase === "ingen" && zs.fill === "phase";
    ctx.save();
    for (const poly of zone.polys || []) {
      if (poly.length < 2) continue;
      const path = () => { ctx.beginPath(); poly.forEach((p, i) => { const [x, y] = toPx(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); };
      path();
      // Med objekten utritade blir zonfärgen svagare så objekten syns.
      const baseA = zs.fillOpacity != null ? zs.fillOpacity : (objects && objects.length ? ZONE_ALPHA / 3 : ZONE_ALPHA);
      if (zs.fill !== "none" && !noStatus) {
        ctx.globalAlpha = baseA * (focusActive() ? 0.4 : 1) * (zs.hidden ? 0.3 : 1);
        if (zs.pattern === "none") { ctx.fillStyle = color; ctx.fill(); }
        else { ctx.globalAlpha *= 0.35; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha /= 0.35; zonePatternFill(ctx, zs.pattern, color, fontPx); path(); }
      }
      ctx.globalAlpha = zs.hidden ? 0.4 : 1;
      const lw = Math.max(1.5, fontPx / 8) * (Number(zs.strokeWidth) || 1);
      ctx.lineWidth = selected ? Math.max(4, fontPx / 3, lw) : lw;
      const dash = zs.dash === "auto" ? (noStatus ? "dashed" : "solid") : zs.dash;
      if (dash === "dashed") ctx.setLineDash([fontPx / 2, fontPx / 3]);
      else if (dash === "dotted") { ctx.setLineDash([lw * 0.2, lw * 2.2]); ctx.lineCap = "round"; }
      if (selected) { ctx.strokeStyle = "#0b5fff"; ctx.stroke(); }
      else if (zs.stroke !== "none") { ctx.strokeStyle = zs.stroke === "custom" ? zs.strokeColor : shade(color, -0.35); ctx.stroke(); }
      ctx.setLineDash([]); ctx.lineCap = "butt";
    }
    // Etikett: kod (+ namn) + framdrift, vid kodtexten (eller mitt i zonen)
    if (zs.label !== "none") {
      const area = (zs.labelArea || /\{m2\}|\{m²\}/.test(zs.labelText || "")) && typeof zoneAreaM2 === "function" ? zoneAreaM2(zone) : null;
      const text = zs.labelText
        // Egen text (redigeras som en notering): {kod} {namn} {%} {m2} byts mot värdena.
        ? String(zs.labelText).replace(/\{kod\}/gi, zone.code || "").replace(/\{namn\}/gi, zone.name || "").replace(/\{%\}/g, st.progress != null ? `${st.progress} %` : "").replace(/\{m2\}|\{m²\}/gi, area != null ? `${fmtArea(area)} m²` : "")
        : [zs.labelName && zone.name ? `${zone.code} ${zone.name}` : zone.code, zs.labelPct && st.progress != null ? `${st.progress} %` : "", zs.labelArea && area != null ? `${fmtArea(area)} m²` : ""].filter(Boolean).join(" · ");
      const anchors = (zone.labels && zone.labels.length) ? zone.labels : [centroid(zone)];
      anchors.forEach((a, i) => { if (a) badges.push([toPx(a), text, color, noStatus, zs, zone.id, zone.labels && zone.labels.length ? i : -1]); });
    }
    ctx.restore();
  }
  return badges;
}

/* Etikett (zonkod m.m.). Med zonens stil: storlek, rotation (labelRot, grader),
   radbrytning (labelWrap = max tecken per rad, och egna radbrytningar i texten).
   Returnerar rutan { w, h, rot } (canvas-px) för träffytan. */
function wrapLabelLines(text, n) {
  return String(text).split("\n").flatMap(line => {
    if (!n || line.length <= n) return [line];
    const out = []; let cur = "";
    line.split(" ").forEach(w => { if (cur && (cur + " " + w).length > n) { out.push(cur); cur = w; } else cur = cur ? cur + " " + w : w; });
    if (cur) out.push(cur);
    return out;
  });
}
function drawBadge(ctx, [x, y], text, color, fontPx, hollow, zs) {
  const kind = zs ? zs.label : "pill";
  fontPx *= zs ? Number(zs.labelSize) || 1 : 1;
  const rot = zs ? (Number(zs.labelRot) || 0) * Math.PI / 180 : 0;
  const lines = wrapLabelLines(text, zs ? Number(zs.labelWrap) || 0 : 0);
  ctx.save();
  ctx.translate(x, y); if (rot) ctx.rotate(rot);
  ctx.font = `600 ${fontPx}px "Segoe UI", Arial, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const lh = fontPx * 1.2, tw = Math.max(...lines.map(l => ctx.measureText(l).width));
  const ty = i => (i - (lines.length - 1) / 2) * lh + 1;
  let w = tw + fontPx * 0.9, h = fontPx * 0.3 + lines.length * lh;
  if (kind === "text") {
    ctx.lineJoin = "round"; ctx.lineWidth = Math.max(2, fontPx / 4); ctx.strokeStyle = "rgba(255,255,255,.95)";
    lines.forEach((l, i) => ctx.strokeText(l, 0, ty(i)));
    ctx.fillStyle = shade(color, -0.45); lines.forEach((l, i) => ctx.fillText(l, 0, ty(i)));
  } else {
    if (kind === "white") hollow = true;
    ctx.globalAlpha *= 0.95;
    ctx.fillStyle = hollow ? "#ffffff" : color;
    roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(h / 2, fontPx * 0.75));
    ctx.fill();
    ctx.globalAlpha /= 0.95;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = shade(color, -0.4);
    ctx.stroke();
    ctx.fillStyle = hollow ? "#374151" : contrastText(color);
    lines.forEach((l, i) => ctx.fillText(l, 0, ty(i)));
  }
  ctx.restore();
  return { w, h, rot };
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c * amt : (255 - c) * amt))));
  return "#" + [f(n >> 16 & 255), f(n >> 8 & 255), f(n & 255)].map(v => v.toString(16).padStart(2, "0")).join("");
}
function contrastText(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255 > 0.6 ? "#111827" : "#ffffff";
}
function centroid(zone) {
  const pts = (zone.polys || []).flat();
  if (!pts.length) return null;
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
}

function renderLegend() {
  const lg = $("legend");
  lg.innerHTML = "";
  const counts = {};
  (plan && plan.zones || []).forEach(z => { const ph = z._status && z._status.phase; if (ph) counts[ph] = (counts[ph] || 0) + 1; });
  PHASE_ORDER.forEach(ph => {
    const sw = document.createElement("span");
    sw.className = "sw";
    sw.style.background = ph === "ingen" ? "#fff" : phaseColor(ph);
    if (ph === "ingen") sw.style.border = "1.5px dashed #6b7280";
    const t = document.createElement("span"); t.textContent = PHASE_LABELS[ph];
    const c = document.createElement("span"); c.className = "muted"; c.textContent = counts[ph] ? counts[ph] : "";
    lg.append(sw, t, c);
  });
}

async function selectZoneIn3d(z) {
  const ids = itemsForZone(z).map(it => it.id);
  if (!ids.length) { alert("Zonen har inga kopplade objekt."); return; }
  try { await askOpener("select", { ids }, 30000); setSaveStatus(`🎯 ${ids.length} objekt i ${z.code} markerade i 3D`); } catch (e) { alert("Kunde inte markera i 3D: " + e.message); }
}
function renderZoneList() {
  const list = $("zoneList");
  list.innerHTML = "";
  const zones = (plan && plan.zones || []).slice().sort((a, b) => String(a.code).localeCompare(String(b.code), "sv", { numeric: true }));
  $("zoneCount").textContent = zones.length ? `(${zones.length})` : "";
  zones.forEach(z => {
    const st = z._status || zoneStatus(z);
    const row = document.createElement("div");
    row.className = "zone-item" + (z.id === selectedZoneId ? " sel" : "");
    const sw = document.createElement("span"); sw.className = "sw";
    sw.style.background = st.phase === "ingen" ? "#fff" : phaseColor(st.phase);
    if (st.phase === "ingen") sw.style.border = "1.5px dashed #6b7280";
    const code = document.createElement("span"); code.className = "code"; code.textContent = (z.code || "?") + (z.name ? " " + z.name : "") + (z.style && z.style.hidden ? " (dold)" : "");
    if (z.style && z.style.hidden) row.classList.add("is-hidden");
    const ph = document.createElement("span"); ph.textContent = PHASE_LABELS[st.phase];
    const pct = document.createElement("span"); pct.className = "pct";
    pct.textContent = st.items.length ? `${st.progress} % · ${st.items.length} obj` : "";
    // 🎯 Markera i 3D direkt på raden (Victors önskemål 2026-10-02).
    const sel3d = document.createElement("button");
    sel3d.type = "button"; sel3d.className = "z3d"; sel3d.textContent = "🎯"; sel3d.title = "Markera zonens objekt i 3D-modellen";
    sel3d.disabled = !st.items.length;
    sel3d.onclick = e => { e.stopPropagation(); selectZoneIn3d(z); };
    row.append(sw, code, ph, pct, sel3d);
    if (typeof zoneOpt$ === "function" && zoneOpt$("area")) { const a = zoneAreaM2(z); if (a != null) { const ar = document.createElement("span"); ar.className = "zarea"; ar.textContent = `${fmtArea(a)} m²`; pct.append(" · ", ar); } }
    if (typeof zoneSel !== "undefined" && zoneSel.size > 1 && zoneSel.has(z.id)) row.classList.add("msel");
    row.onclick = e => (typeof zoneRowClick === "function" ? zoneRowClick(e, z.id, zones) : selectZone(z.id, true));
    list.appendChild(row);
  });
  if (!zones.length) list.innerHTML = '<div class="muted" style="padding:6px;">Inga zoner än – klicka 🔍 Hitta zoner i PDF:en, eller rita en med ▭ Rektangel eller ⬠ Polygon.</div>';
  renderLegend();
}

// ---------------------------------------------------------------------
// Hitta zoner i PDF:en
// ---------------------------------------------------------------------
/* Färgad = tydligt mättad färg (inte vit/svart/grå, som vanliga ritningslinjer). */
function isColorful(rgb) {
  if (!rgb) return false;
  const [r, g, b] = rgb.map(v => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return max > 0.3 && (max - min) / max > 0.2;
}
function rgbOf(v) {
  if (!v) return null;
  if (typeof v === "string") { const n = parseInt(v.replace("#", ""), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  const a = Array.from(v).slice(0, 3).map(Number);
  if (a.length < 3 || a.some(x => !Number.isFinite(x))) return null;
  return a.every(x => x <= 1) ? a.map(x => x * 255) : a;
}
function polyArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a / 2);
}
function bbox(poly) {
  const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
function pointInPoly([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi)) inside = !inside;
  }
  return inside;
}
const rectPoly = r => { const [x0, y0, x1, y1] = [Math.min(r[0], r[2]), Math.min(r[1], r[3]), Math.max(r[0], r[2]), Math.max(r[1], r[3])]; return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; };

/* 1) Markeringar (annotations): rutor/polygoner/överstrykningar + textrutor. */
async function regionsFromAnnotations() {
  const regions = [], labels = [];
  const annots = await page.getAnnotations({ intent: "display" });
  for (const a of annots) {
    const text = (a.contentsObj && a.contentsObj.str) || a.contents || (a.textContent && a.textContent.join(" ")) || "";
    if (["Square", "Circle", "Polygon", "PolyLine"].includes(a.subtype)) {
      const poly = a.vertices && a.vertices.length > 2 ? a.vertices.map(v => [v.x, v.y]) : rectPoly(a.rect);
      regions.push({ poly, source: "annotation", text });
    } else if (a.subtype === "Highlight" && a.quadPoints) {
      a.quadPoints.forEach(q => regions.push({ poly: rectPoly([Math.min(...q.map(p => p.x)), Math.min(...q.map(p => p.y)), Math.max(...q.map(p => p.x)), Math.max(...q.map(p => p.y))]), source: "annotation", text }));
    }
    if (["FreeText", "Text", "Callout"].includes(a.subtype) && text && a.rect) {
      const r = a.rect;
      codesIn(text).size && labels.push({ text, pos: [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2] });
    }
  }
  return { regions, labels };
}

/* 2) Färgade ytor i själva ritningen (fyllda vägar med tydlig färg). pdf.js 3.x:
   constructPath = [ [OPS-koder], [koordinater], minMax ]; färgen kommer som RGB 0-255. */
async function regionsFromFills() {
  const OPS = pdfjsLib.OPS;
  // Bara själva ritningen - annotations (t.ex. Bluebeam-rutor) läses separat ovan.
  const opList = await page.getOperatorList({ annotationMode: pdfjsLib.AnnotationMode.DISABLE });
  const mul = (m1, m2) => [m1[0] * m2[0] + m1[1] * m2[2], m1[0] * m2[1] + m1[1] * m2[3], m1[2] * m2[0] + m1[3] * m2[2], m1[2] * m2[1] + m1[3] * m2[3], m1[4] * m2[0] + m1[5] * m2[2] + m2[4], m1[4] * m2[1] + m1[5] * m2[3] + m2[5]];
  const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const FILL = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].filter(v => v !== undefined));
  // Konturer (vanliga ritningslinjer) och klippvägar målas inte som ytor.
  const STROKE_ONLY = new Set([OPS.endPath, OPS.stroke, OPS.closeStroke].filter(v => v !== undefined));
  const base = page.getViewport({ scale: 1 });
  const minArea = base.width * base.height * 2e-5;
  let ctm = [1, 0, 0, 1, 0, 0], fill = null, pending = [];
  const stack = [];
  const regions = [];
  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i], args = opList.argsArray[i];
    if (fn === OPS.save) stack.push({ ctm, fill });
    else if (fn === OPS.restore) { const s = stack.pop(); if (s) { ctm = s.ctm; fill = s.fill; } }
    else if (fn === OPS.transform) ctm = mul(Array.from(args), ctm);
    else if (fn === OPS.setFillRGBColor) fill = rgbOf(args && args.length === 1 ? args[0] : args);
    else if (STROKE_ONLY.has(fn)) pending = [];
    else if (FILL.has(fn)) {
      if (isColorful(fill)) pending.forEach(poly => { if (poly.length > 2 && polyArea(poly) > minArea) regions.push({ poly, source: "fill", color: fill }); });
      pending = [];
    }
    else if (fn === OPS.constructPath && args && Array.isArray(args[0]) && args[1]) {
      const ops = args[0], c = args[1];
      let j = 0, cur = null;
      const add = (x, y) => { if (!cur) { cur = []; pending.push(cur); } cur.push(ap(ctm, x, y)); };
      for (const op of ops) {
        if (op === OPS.moveTo) { cur = null; add(c[j++], c[j++]); }
        else if (op === OPS.lineTo) add(c[j++], c[j++]);
        else if (op === OPS.curveTo) { j += 4; add(c[j++], c[j++]); }
        else if (op === OPS.curveTo2 || op === OPS.curveTo3) { j += 2; add(c[j++], c[j++]); }
        else if (op === OPS.closePath) cur = null;
        else if (op === OPS.rectangle) { const x = c[j++], y = c[j++], w = c[j++], h = c[j++]; cur = null; pending.push([[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(p => ap(ctm, p[0], p[1]))); }
        else break;
      }
    }
  }
  return regions;
}

/* Kodtexter (t.ex. "PM06") i ritningens text, med position i PDF-koordinater. */
async function codeLabels() {
  const tc = await page.getTextContent();
  const labels = [];
  tc.items.forEach(it => {
    if (!it.str) return;
    const codes = codesIn(it.str);
    if (!codes.size) return;
    const t = it.transform;
    labels.push({ text: it.str, pos: [t[4] + (it.width || 0) / 2, t[5] + (it.height || Math.abs(t[3]) || 0) / 3] });
  });
  return labels;
}

async function detectZones() {
  if (!page) return;
  setBusy("Söker zoner i PDF:en…");
  try {
    const ann = await regionsFromAnnotations();
    const fills = await regionsFromFills();
    const labels = [...ann.labels, ...(await codeLabels())];
    const regions = [...ann.regions, ...fills];

    // Koppla varje färgad yta till kodtext i ytan (eller nära den).
    const zonesByCode = new Map();
    const usedLabels = new Set();
    const zoneFor = code => {
      const key = normCode(code);
      if (!zonesByCode.has(key)) zonesByCode.set(key, { code: code.replace(/\s+/g, "").toUpperCase(), polys: [], labels: [], source: "auto" });
      return zonesByCode.get(key);
    };
    let unlabeled = 0;
    regions.forEach(r => {
      const own = rawCodesIn(r.text || "")[0];
      const bb = bbox(r.poly);
      const diag = Math.hypot(bb.x1 - bb.x0, bb.y1 - bb.y0);
      let best = null, bestD = Infinity;
      labels.forEach((l, i) => {
        const inside = pointInPoly(l.pos, r.poly);
        const cx = Math.max(bb.x0, Math.min(l.pos[0], bb.x1)), cy = Math.max(bb.y0, Math.min(l.pos[1], bb.y1));
        const d = inside ? -1 : Math.hypot(l.pos[0] - cx, l.pos[1] - cy);
        if (d < bestD) { bestD = d; best = i; }
      });
      const maxDist = Math.min(60, Math.max(12, diag * 0.25));
      let code = own || null;
      if (!code && best !== null && bestD <= maxDist) code = rawCodesIn(labels[best].text)[0];
      if (!code) { unlabeled++; return; }
      const z = zoneFor(code);
      z.polys.push(r.poly);
      if (best !== null && bestD <= maxDist) { usedLabels.add(best); if (!z.labels.some(p => Math.hypot(p[0] - labels[best].pos[0], p[1] - labels[best].pos[1]) < 1)) z.labels.push(labels[best].pos); }
    });
    // Kodtexter utan yta (t.ex. i en sektion): visas som färgad etikett.
    labels.forEach((l, i) => {
      if (usedLabels.has(i)) return;
      rawCodesIn(l.text).forEach(c => { const z = zoneFor(c); z.labels.push(l.pos); });
    });

    // Behåll manuella zoner och tidigare kopplingar (per kod).
    const oldByCode = new Map((plan.zones || []).map(z => [normCode(z.code), z]));
    const manual = (plan.zones || []).filter(z => z.source === "manual");
    const detected = [...zonesByCode.values()].map(z => {
      const old = oldByCode.get(normCode(z.code));
      return { id: (old && old.source !== "manual" && old.id) || ghNewId(), ...z, rule: (old && old.rule) || { field: "auto" } };
    });
    plan.zones = [...detected.filter(z => !manual.some(m => normCode(m.code) === normCode(z.code))), ...manual];
    renderZones();
    schedulePlanSave();
    const nPoly = detected.reduce((n, z) => n + z.polys.length, 0);
    setSaveStatus(`🔍 ${detected.length} zoner hittade (${nPoly} ytor${unlabeled ? `, ${unlabeled} färgade ytor utan kod ignorerades` : ""}).`);
    if (!detected.length) alert("Hittade inga zoner. Kontrollera kodmönstret, eller rita zonerna med ▭ Rita zon.");
  } catch (e) {
    alert("Kunde inte söka i PDF:en: " + e.message);
  } finally {
    setBusy("");
  }
}

// ---------------------------------------------------------------------
// Zoom, panorering, val, ritning
// ---------------------------------------------------------------------
/* Prickar och namnetiketter har en storlek i skärmpixlar – rita om objekt-
   lagret när zoomen har stannat (annars växer/krymper de med planen). */
let objRerenderTimer = 0, objRenderedScale = null;
function scheduleObjRerender() {
  clearTimeout(objRerenderTimer);
  objRerenderTimer = setTimeout(() => {
    if (objRenderedScale === view.scale) return;
    if (typeof objStyle === "function" && objStyle() !== "footprint") renderZones();
  }, 180);
}
/* Rita om högst en gång per bildruta (reglage som skickar många händelser). */
let zonesRaf = 0;
function renderZonesSoon() { if (!zonesRaf) zonesRaf = requestAnimationFrame(() => { zonesRaf = 0; renderZones(); }); }
/* Vriden vy (Victors önskemål 2026-10-02: "norr rakt uppåt"). Planen vrids
   view.rot radianer kring skärmens mitt; ritning, objekt och etablering ligger
   kvar i ritningens koordinater. Alla omräkningar skärm <-> plan går via
   stageToScreen/screenToStage. Sparas per plan i den här webbläsaren. */
view.rot = 0;
let vpW = 0, vpH = 0;
function vpSizeNow() { const r = $("viewport").getBoundingClientRect(); vpW = r.width; vpH = r.height; }
window.addEventListener("resize", () => { vpSizeNow(); if (view.rot) applyView(); });
function rotAbout(p, a) {
  if (!a) return p;
  if (!vpW) vpSizeNow();
  const cx = vpW / 2, cy = vpH / 2, c = Math.cos(a), s = Math.sin(a), dx = p[0] - cx, dy = p[1] - cy;
  return [cx + dx * c - dy * s, cy + dx * s + dy * c];
}
/* Stage-px -> skärm-px i #viewport (och tillbaka). */
function stageToScreen([x, y]) { return rotAbout([view.tx + x * view.scale, view.ty + y * view.scale], view.rot); }
function screenToStage(p) { const q = rotAbout(p, -view.rot); return [(q[0] - view.tx) / view.scale, (q[1] - view.ty) / view.scale]; }
/* En förflyttning på skärmen uttryckt i den ovridna vyn (panorering). */
function unrotVec([dx, dy]) { if (!view.rot) return [dx, dy]; const c = Math.cos(-view.rot), s = Math.sin(-view.rot); return [dx * c - dy * s, dx * s + dy * c]; }
/* Den del av planen (stage-px) som syns: [x0, y0, x1, y1]. */
function visibleStageBox() {
  vpSizeNow();
  const P = [[0, 0], [vpW, 0], [vpW, vpH], [0, vpH]].map(screenToStage), xs = P.map(p => p[0]), ys = P.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
function applyView() {
  if (view.rot) {
    vpSizeNow();
    const cx = vpW / 2, cy = vpH / 2;
    $("stage").style.transform = `translate(${cx}px, ${cy}px) rotate(${view.rot}rad) translate(${-cx}px, ${-cy}px) translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;
  } else $("stage").style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;
  if (typeof renderNorthBadge === "function") renderNorthBadge();
  scheduleObjRerender();
  scheduleOverlayRerender();
  renderScreenLabelsSoon();
  if (typeof updateCompareClip === "function") updateCompareClip();
  if (typeof scheduleOrthoRender === "function") scheduleOrthoRender();
  scheduleHiRender();
  rerenderTextIfFixed();
}
function fitView() {
  const vp = $("viewport").getBoundingClientRect(), pc = $("pdfCanvas");
  if (!pc.width) return;
  // Fri yta: på telefon bort med det som ligger ovanpå planen (datumbricka, kortet nertill).
  const ins = (typeof fitInsets === "function" && fitInsets(vp)) || {}, t = ins.top || 0, b = ins.bottom || 0, l = ins.left || 0;
  const w = Math.max(50, vp.width - l), h = Math.max(50, vp.height - t - b);
  view.scale = Math.min(w / pc.width, h / pc.height) * 0.96;
  view.tx = l + (w - pc.width * view.scale) / 2;
  view.ty = t + (h - pc.height * view.scale) / 2;
  applyView();
}
function zoomAt(factor, cx, cy) {
  [cx, cy] = rotAbout([cx, cy], -view.rot);
  const ns = Math.max(0.02, Math.min(8, view.scale * factor));
  view.tx = cx - (cx - view.tx) * (ns / view.scale);
  view.ty = cy - (cy - view.ty) * (ns / view.scale);
  view.scale = ns;
  applyView();
}
function stagePoint(e) {
  const r = $("viewport").getBoundingClientRect();
  return screenToStage([e.clientX - r.left, e.clientY - r.top]);
}
function zoneAt(pdfPt) {
  // Släckt zonlager: zonerna reagerar inte på hovring eller klick.
  if (typeof layerVisible === "function" && !layerVisible("zones")) return null;
  const zones = (plan && plan.zones) || [];
  for (let i = zones.length - 1; i >= 0; i--) if (!(zones[i].style && zones[i].style.hidden) && (zones[i].polys || []).some(p => pointInPoly(pdfPt, p))) return zones[i];
  // Etikett-zoner utan yta: nära etiketten
  const tol = 14 / (renderScale * view.scale);
  return zones.find(z => !(z.polys || []).length && (z.labels || []).some(l => Math.hypot(l[0] - pdfPt[0], l[1] - pdfPt[1]) < tol * 3)) || null;
}

function bindViewport() {
  const vpEl = $("viewport");
  let drag = null;
  vpEl.addEventListener("wheel", e => {
    e.preventDefault();
    const r = vpEl.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  vpEl.addEventListener("mousedown", e => {
    if (!viewport) return;
    if (drawMode) { drag = { draw: true, start: stagePoint(e) }; return; }
    // Hörn på den markerade zonen (lagesplan-zones.js).
    if (typeof zonesPointerDown === "function" && zonesPointerDown(e)) return;
    // Upplåsta objektmarkeringar dras (lagesplan-objmarks.js).
    if (typeof objMarkPointerDown === "function" && objMarkPointerDown(e)) return;
    // Alt + dra: släck alla objekt inom rutan.
    if (e.altKey && e.button === 0 && plan && plan.calib) { e.preventDefault(); drag = { hideBox: true, start: stagePoint(e) }; return; }
    // Noteringar/etablering: flytta, ändra form och rotera (lagesplan-layers.js).
    const zoneDrawing = typeof zonePoly !== "undefined" && (zonePoly || zoneLabelPlace); // zonen ritas: klick = hörn, drag = panorera
    if (!zoneDrawing && e.target.closest && e.target.closest("#viewport") && !e.target.closest("#sitePop") && layersPointerDown(e)) return;
    drag = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
  });
  window.addEventListener("mousemove", e => {
    if (drag && (drag.draw || drag.hideBox)) { drawRubber(drag.start, stagePoint(e)); return; }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      const [ux, uy] = unrotVec([dx, dy]);
      view.tx = drag.tx + ux; view.ty = drag.ty + uy; applyView();
      return;
    }
    toolMouseMove(e);
    showTip(e);
  });
  window.addEventListener("mouseup", e => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.draw) { finishDraw(d.start, stagePoint(e)); return; }
    if (d.hideBox) { hideObjectsInBox(d.start, stagePoint(e)); return; }
    if (!d.moved && calib && calib.waitPdf && e.target.closest && e.target.closest("#viewport")) {
      calib.waitPdf = false;
      calib.pdf.push(toPdf(stagePoint(e)));
      renderZones();
      calibNext();
      return;
    }
    if (!d.moved && e.target.closest && e.target.closest("#viewport")) {
      if (typeof zonesClick === "function" && zonesClick(e)) return;
      if (toolClick(toPdf(stagePoint(e)), e)) return;
      const z = zoneAt(toPdf(stagePoint(e)));
      selectZone(z ? z.id : null, false, true);
    }
  });
  vpEl.addEventListener("mouseleave", () => $("tip").classList.add("hidden"));
  // Högerklick på ett namn: dölj det (eller alla namn för samma aktivitet).
  vpEl.addEventListener("contextmenu", e => {
    if (!viewport) return;
    // Högerklick på en prick: släck objektet/aktiviteten.
    const ptObjs = objectsAt(toPdf(stagePoint(e)));
    if (ptObjs.length) { e.preventDefault(); openObjMenu(ptObjs.flatMap(o => o.members || [o.it]), e); return; }
    if (!objLabelBoxes.length) return;
    const vr = vpEl.getBoundingClientRect(), x = e.clientX - vr.left, y = e.clientY - vr.top;
    const hit = objLabelBoxes.find(l => x >= l.box.x && x <= l.box.x + l.box.w && y >= l.box.y && y <= l.box.y + l.box.h);
    if (!hit) return;
    e.preventDefault();
    openLabelMenu(hit, e);
  });
}

function showTip(e) {
  const tip = $("tip");
  if (!viewport || !e.target.closest || !e.target.closest("#viewport")) { tip.classList.add("hidden"); return; }
  const pdfPt = toPdf(stagePoint(e));
  const r = $("viewport").getBoundingClientRect();
  const place = () => {
    tip.style.left = (e.clientX - r.left + 14) + "px";
    tip.style.top = (e.clientY - r.top + 14) + "px";
    tip.classList.remove("hidden");
  };
  const toolTip = toolTipHtml(pdfPt);
  if (toolTip) { tip.innerHTML = toolTip; place(); return; }
  // Ett enskilt objekt under pekaren går före zonen det ligger i.
  const objs = objectsAt(pdfPt);
  if (objs.length) {
    tip.innerHTML = objectTipHtml(objs[0]) + (objs.length > 1
      ? `<div style="margin-top:6px;opacity:.75;">+ ${objs.length - 1} till här: ${objs.slice(1, 4).map(o => escHtml(o.it.object_name || o.it.activity || "")).join(", ")}${objs.length > 4 ? " …" : ""}</div>`
      : "");
    place();
    return;
  }
  const z = zoneAt(pdfPt);
  if (!z) { tip.classList.add("hidden"); return; }
  // Kort sammanfattning (Victors önskemål 2026-10-02): status, antal per fas
  // och bara det som är försenat – inte hela listan.
  const st = z._status || zoneStatus(z);
  const dot = ph => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${phaseColor(ph)};margin-right:4px;"></span>`;
  let html = `<b>${escHtml(z.code)}${z.name ? " " + escHtml(z.name) : ""}</b>`;
  if (!st.items.length) html += `<div style="opacity:.8;">Inga aktiviteter kopplade.</div>`;
  else {
    const day = $("dateInput").value || todayIso(), warn = Number.isFinite(settings.warningDaysBeforeEnd) ? settings.warningDaysBeforeEnd : 7;
    const ph = new Map(st.items.map(it => [it, computeItemPhase(it, day, warn) || fallbackPhase(it)]));
    const counts = PHASE_ORDER.filter(p => p !== "ingen").map(p => [p, [...ph.values()].filter(x => x === p).length]).filter(([, n]) => n);
    html += `<div>${dot(st.phase)}${escHtml(PHASE_LABELS[st.phase])}${st.progress != null ? ` · ${st.progress} % klart` : ""}</div>`;
    html += `<div style="opacity:.8;font-size:.92em;">${counts.map(([p, n]) => `${n} ${escHtml(PHASE_LABELS[p].toLowerCase())}`).join(" · ")}</div>`;
    const late = [...new Set(st.items.filter(it => ph.get(it) === "forsenad").map(it => it.object_name || it.activity || ""))].filter(Boolean);
    if (late.length) html += `<div style="margin-top:3px;">${dot("forsenad")}Försenat: ${escHtml(late.slice(0, 5).join(", "))}${late.length > 5 ? ` +${late.length - 5}` : ""}</div>`;
  }
  tip.innerHTML = html;
  place();
}

function drawRubber(a, b) {
  renderZones();
  // Översta lagret – zonlagret kan vara släckt (då syntes inte rutan).
  const ctx = $("topCanvas").getContext("2d");
  ctx.save();
  ctx.setLineDash([8, 6]); ctx.lineWidth = 3; ctx.strokeStyle = "#0b5fff";
  ctx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  ctx.restore();
}
function finishDraw(a, b) {
  setDrawMode(false);
  if (Math.abs(b[0] - a[0]) < 5 || Math.abs(b[1] - a[1]) < 5) { renderZones(); return; }
  const code = (prompt("Kod för zonen (t.ex. PM06):") || "").trim();
  if (!code) { renderZones(); return; }
  const corners = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]].map(toPdf);
  const existing = (plan.zones || []).find(z => normCode(z.code) === normCode(code));
  if (existing) { existing.polys.push(corners); existing.source = "manual"; selectedZoneId = existing.id; }
  else {
    const z = { id: ghNewId(), code: code.toUpperCase(), polys: [corners], labels: [], rule: { field: "auto" }, source: "manual" };
    plan.zones = [...(plan.zones || []), z];
    selectedZoneId = z.id;
  }
  renderZones();
  openEditor(selectedZoneId);
  schedulePlanSave();
}
function setDrawMode(on) {
  drawMode = on;
  $("btnDraw").classList.toggle("active", on);
  $("viewport").classList.toggle("drawing", on);
}

// ---------------------------------------------------------------------
// Zonredigering
// ---------------------------------------------------------------------
function selectZone(id, center, soft = false) {
  selectedZoneId = id;
  renderZones();
  if (id) openEditor(id, soft); else closeEditor();
  if (id && center) {
    const z = plan.zones.find(x => x.id === id);
    const pts = (z.polys || []).flat().concat(z.labels || []);
    if (pts.length) {
      const px = pts.map(toPx);
      const cx = px.reduce((s, p) => s + p[0], 0) / px.length, cy = px.reduce((s, p) => s + p[1], 0) / px.length;
      const r = $("viewport").getBoundingClientRect();
      view.tx = r.width / 2 - cx * view.scale; view.ty = r.height / 2 - cy * view.scale; applyView();
    }
  }
}
function openEditor(id, soft = false) {
  const z = plan.zones.find(x => x.id === id);
  if (!z) return closeEditor();
  $("zoneEditor").classList.remove("hidden");
  openSec("zones", soft);
  $("zeTitle").textContent = `Zon ${z.code}`;
  $("zeCode").value = z.code;
  $("zeField").value = (z.rule && z.rule.field) || "auto";
  $("zeValue").value = (z.rule && z.rule.value) || "";
  updateEditorHints();
}
function closeEditor() { $("zoneEditor").classList.add("hidden"); }
function updateEditorHints() {
  const field = $("zeField").value;
  $("zeValue").classList.toggle("hidden", field === "auto");
  const dl = $("zeValues");
  dl.innerHTML = "";
  if (field !== "auto") {
    [...new Set(items.map(it => it[field]).filter(Boolean))].sort().slice(0, 400).forEach(v => { const o = document.createElement("option"); o.value = v; dl.appendChild(o); });
  }
  const zsel = plan && (plan.zones || []).find(z => z.id === selectedZoneId);
  const tmp = { ...(zsel || {}), code: $("zeCode").value, rule: { field, value: $("zeValue").value } };
  const n = itemsForZone(tmp).length;
  $("zeMatchInfo").textContent = n ? `Kopplar ${n} planerade objekt.` : (field === "auto"
    ? (plan && plan.calib ? "Inga planerade objekt ligger i zonen på vald nivå, eller har koden i område/aktivitet/namn." : "Inga planerade objekt har koden i område/aktivitet/namn – kalibrera mot 3D (📐) eller välj ett fält och värde.")
    : "Inga planerade objekt matchar.");
  if (typeof renderZoneActs === "function") renderZoneActs(tmp);
}

// ---------------------------------------------------------------------
// Datum
// ---------------------------------------------------------------------
let dateMin = null, dateMax = null;
function setupDateRange() {
  const photoDates = typeof orthos === "function" ? orthos().map(orthoDate) : [];
  const ds = items.flatMap(it => [it.start_date, it.end_date, it.actual_end_date]).concat(photoDates).filter(Boolean).map(d => Date.parse(d)).filter(Number.isFinite);
  const today = Date.parse(todayIso());
  dateMin = ds.length ? Math.min(...ds, today) : today - 180 * 86400000;
  dateMax = ds.length ? Math.max(...ds, today) : today + 180 * 86400000;
  syncSliderFromDate();
  if (typeof renderDateMarks === "function") renderDateMarks();
}
function syncSliderFromDate() {
  const t = Date.parse($("dateInput").value || todayIso());
  $("dateSlider").value = dateMax > dateMin ? Math.round((t - dateMin) / (dateMax - dateMin) * 100) : 100;
}
function onDateChanged() { if (typeof syncOrthoToDate === "function") syncOrthoToDate(); renderZones(); }

// ---------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------
/* Ritningen + zoner/objekt/foton med rubrik och förklaring, i en canvas.
   maxW skalar ned (video, bildserie). Används av PNG, PDF och uppspelning. */
/* PDF-export: underlag (ortofoto + PDF) som bild, tända DXF:er som vektorer
   och zoner/objekt/etablering som genomskinlig bild ovanpå. Ritar planen i
   rutan [bx, by, bw, bh] (mm) på sidan och returnerar var den hamnade. */
function addPlanToPdf(doc, bx, by, bw, bh, quality = 0.9, vec = null) {
  const pc = $("pdfCanvas");
  const base = composeImage(null, true, vec ? "ortho" : "base"), over = composeImage(null, true, "over");
  const k = Math.min(bw / base.width, bh / base.height);
  const iw = base.width * k, ih = base.height * k, x = bx + (bw - iw) / 2, y = by + (bh - ih) / 2;
  if (vec) vecUnder(vec);
  doc.addImage(base.toDataURL("image/jpeg", quality), "JPEG", x, y, iw, ih);
  if (vec) {
    vecOver(vec);
    // Ritnings-PDF:en som vektorer mellan ortofotot och resten.
    const sc0 = base.width / pc.width;
    const multiply = getComputedStyle(pc).mixBlendMode === "multiply";
    if (layerVisible("pdf")) vecAddPlan(vec, [x, y, iw, ih], [sc0 * k, 0, 0, sc0 * k, x, y], layerOpacity("pdf"), multiply);
  }
  const list = typeof cadVectorPlan === "function" && cads().some(r => ls("cad:" + r.id).visible) ? cadVectorPlan() : [];
  if (list.length && typeof drawCadVectorsToPdf === "function") {
    const sc = base.width / pc.width; // bild-px per stage-px
    drawCadVectorsToPdf(doc, list, [sc * k, 0, 0, sc * k, x, y], [x, y, iw, ih], Math.max(1, sc) * k, 0.3528);
  }
  doc.addImage(over.toDataURL("image/png"), "PNG", x, y, iw, ih, undefined, "FAST");
  return { x, y, w: iw, h: ih };
}
/* part: undefined = allt, "base" = bara ortofoto + PDF, "over" = bara zoner/objekt/etablering (genomskinlig). */
/* Export (PNG, PDF, film) behöver lagren för hela bladet i grundupplösning. */
function composeImage(maxW, noHeader, part) {
  if (ovLast && !ovLast.full && !ovFull) {
    ovFull = true; renderZones();
    try { return composeImageNow(maxW, noHeader, part); } finally { ovFull = false; renderZones(); }
  }
  return composeImageNow(maxW, noHeader, part);
}
function composeImageNow(maxW, noHeader, part) {
  const pc = $("pdfCanvas"), zc = $("zoneCanvas");
  const k = maxW ? Math.min(1, maxW / pc.width) : 1;
  const W = Math.round(pc.width * k), H = Math.round(pc.height * k);
  const head = noHeader ? 0 : Math.round(Math.max(W / 25, 28));
  const out = document.createElement("canvas");
  out.width = W; out.height = H + head;
  const ctx = out.getContext("2d");
  if (part !== "over") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, out.width, out.height); }
  const inPart = id => !part || (part === "base" ? (id === "orthoCanvas" || id === "pdfCanvas") : part === "ortho" ? id === "orthoCanvas" : (id !== "orthoCanvas" && id !== "pdfCanvas"));
  // Samma lager, synlighet, genomskinlighet och blandning som på skärmen.
  STAGE_CANVASES.forEach(id => {
    const c = $(id);
    if (!inPart(id)) return;
    if (id === "orthoCanvas") { if (getComputedStyle(c).display !== "none") drawOrthoForExport(ctx, 0, head, W / pc.width); return; }
    if (id === "zoneCanvas" && !part && typeof drawCadForExport === "function") drawCadForExport(ctx, 0, head, W / pc.width);
    if (!c.width || getComputedStyle(c).display === "none") return;
    ctx.save();
    ctx.globalAlpha = Number(getComputedStyle(c).opacity) || 0;
    if (id === "pdfCanvas") {
      if ($("grayPdf").checked) ctx.filter = "grayscale(1)";
      if (getComputedStyle(c).mixBlendMode === "multiply") ctx.globalCompositeOperation = "multiply";
    }
    ctx.drawImage(c, 0, head, W, H);
    ctx.restore();
    // Andra planers PDF:er (lager under ritningen) direkt efter ritningen, som på skärmen.
    if (id === "pdfCanvas") document.querySelectorAll("#stage canvas.pdfov").forEach(o => {
      if (!o.width || getComputedStyle(o).display === "none") return;
      ctx.save(); ctx.globalAlpha = Number(getComputedStyle(o).opacity) || 0; ctx.globalCompositeOperation = "multiply";
      if (o.style.filter) ctx.filter = o.style.filter;
      ctx.drawImage(o, 0, head, W, H); ctx.restore();
    });
  });
  if (noHeader) return out;
  const f = Math.round(head * 0.38);
  ctx.fillStyle = "#111827"; ctx.font = `700 ${f}px "Segoe UI", Arial, sans-serif`; ctx.textBaseline = "middle";
  const extra = viewDescription();
  ctx.fillText(`Lägesplan ${plan.name} – ${$("dateInput").value}${extra ? "  ·  " + extra : ""}`, f * 0.6, head / 2);
  let x = out.width - f * 0.6;
  ctx.font = `500 ${Math.round(f * 0.75)}px "Segoe UI", Arial, sans-serif`;
  PHASE_ORDER.slice().reverse().forEach(ph => {
    const label = PHASE_LABELS[ph];
    const w = ctx.measureText(label).width;
    x -= w; ctx.fillStyle = "#111827"; ctx.fillText(label, x, head / 2);
    x -= f * 1.2;
    ctx.fillStyle = ph === "ingen" ? "#fff" : phaseColor(ph); ctx.fillRect(x, head / 2 - f * 0.4, f * 0.8, f * 0.8);
    ctx.strokeStyle = "#6b7280"; ctx.strokeRect(x, head / 2 - f * 0.4, f * 0.8, f * 0.8);
    x -= f * 0.9;
  });
  return out;
}
function downloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function exportPng() {
  if (!viewport) return;
  composeImage().toBlob(blob => downloadBlob(blob, `Lägesplan ${plan.name} ${$("dateInput").value}.png`), "image/png");
}

// ---------------------------------------------------------------------
// UI-koppling
// ---------------------------------------------------------------------
function bindUI() {
  bindViewport();
  $("planSelect").onchange = () => openPlan($("planSelect").value);
  $("btnNewPlan").onclick = () => $("pdfInput").click();
  $("pdfInput").onchange = e => { const f = e.target.files[0]; e.target.value = ""; if (f) createPlanFromFile(f); };
  $("btnRenamePlan").onclick = () => {
    if (!plan) return;
    const n = (prompt("Nytt namn på planen:", plan.name) || "").trim();
    if (n) { plan.name = n; renderPlanSelect(); schedulePlanSave(); }
  };
  $("btnDeletePlan").onclick = async () => {
    if (!plan || !confirm(`Ta bort lägesplanen "${plan.name}"? (PDF:en och zonerna tas bort.)`)) return;
    const gone = plan;
    if (savePending === gone) { clearTimeout(saveTimer); savePending = null; } else await flushPlanSave();
    try {
      plans = await ghWriteJSON(token, dataPath("status_plans.json"), arr => arr.filter(p => p.id !== gone.id), `Lägesplan: ta bort ${gone.name}`);
      ghDeleteBinary(token, gone.file_path, `Lägesplan: ta bort ${gone.name}`);
      plan = null; viewport = null;
      renderPlanSelect();
      STAGE_CANVASES.forEach(id => { $(id).width = $(id).height = 0; });
      $("empty").classList.remove("hidden");
      if (plans[0]) openPlan(plans[0].id); else renderZoneList();
    } catch (e) { alert("Kunde inte ta bort: " + e.message); }
  };
  $("dateInput").onchange = () => { syncSliderFromDate(); onDateChanged(); };
  $("dateSlider").oninput = () => {
    const t = dateMin + (dateMax - dateMin) * Number($("dateSlider").value) / 100;
    const d = new Date(t);
    $("dateInput").value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    onDateChanged();
  };
  $("btnToday").onclick = () => { $("dateInput").value = todayIso(); syncSliderFromDate(); onDateChanged(); };
  $("btnDetect").onclick = () => {
    if (!plan) return;
    if ((plan.zones || []).some(z => z.source !== "manual") && !confirm("Söka igen? Automatiskt hittade zoner ersätts (kopplingar per kod och handritade zoner behålls).")) return;
    detectZones();
  };
  $("btnDraw").onclick = () => { if (plan) setDrawMode(!drawMode); };
  $("codePattern").onchange = () => {
    if (!plan) return;
    try { new RegExp($("codePattern").value); } catch (e) { alert("Ogiltigt mönster: " + e.message); return; }
    plan.code_pattern = $("codePattern").value || DEFAULT_CODE_PATTERN;
    itemCodeCache.clear();
    renderZones(); schedulePlanSave();
  };
  try { $("grayPdf").checked = localStorage.getItem("lagesplan-gray") !== "0"; } catch (e) {}
  const applyGray = () => { $("pdfCanvas").style.filter = $("pdfHiCanvas").style.filter = $("grayPdf").checked ? "grayscale(1)" : ""; };
  applyGray();
  $("grayPdf").onchange = () => { applyGray(); try { localStorage.setItem("lagesplan-gray", $("grayPdf").checked ? "1" : "0"); } catch (e) {} };
  $("showOriginal").onchange = async () => { if (page) { await renderPdf(); renderOrtho(); renderZones(); scheduleHiRender(); } };
  $("zeClose").onclick = () => selectZone(null);
  $("zeField").onchange = updateEditorHints;
  $("zeValue").oninput = updateEditorHints;
  $("zeCode").oninput = updateEditorHints;
  $("zeSave").onclick = () => {
    const z = plan.zones.find(x => x.id === selectedZoneId);
    if (!z) return;
    z.code = $("zeCode").value.trim() || z.code;
    z.rule = { field: $("zeField").value, value: $("zeValue").value.trim() };
    renderZones(); openEditor(z.id); schedulePlanSave();
  };
  $("btnCalib").onclick = () => (calib ? cancelCalib() : startCalib());
  if ($("btnRefreshData")) $("btnRefreshData").onclick = refreshCoupled;
  if ($("objStyle")) {
    $("objStyle").value = objStyle();
    $("objStyle").onchange = () => { try { localStorage.setItem(OBJ_STYLE_KEY, $("objStyle").value); } catch (e) {} $("objSizeRow").classList.toggle("hidden", $("objStyle").value === "footprint"); renderZones(); };
    $("objSizeRow").classList.toggle("hidden", objStyle() === "footprint");
  }
  if ($("objSize")) {
    const upd = () => { $("objSizeVal").textContent = $("objSize").value + " %"; };
    $("objSize").value = objSize(); upd();
    $("objSize").oninput = () => { upd(); try { localStorage.setItem(OBJ_SIZE_KEY, $("objSize").value); } catch (e) {} renderZonesSoon(); };
  }
  bindObjViewUi();
  if ($("btnShowHiddenLabels")) {
    $("btnShowHiddenLabels").onclick = () => saveHiddenLabels({ ids: [], acts: [], names: [] });
    updateHiddenLabelsBtn();
  }
  if ($("objLabels")) {
    const sync = () => { $("objLabelsWhich").disabled = !$("objLabels").checked; $("objLabelSizeRow").classList.toggle("hidden", !$("objLabels").checked); };
    const updL = () => { $("objLabelSizeVal").textContent = $("objLabelSize").value + " %"; };
    $("objLabelSize").value = objLabelSize(); updL();
    $("objLabelSize").oninput = () => { updL(); try { localStorage.setItem(OBJ_LABEL_SIZE_KEY, $("objLabelSize").value); } catch (e) {} renderScreenLabelsSoon(); };
    $("objLabels").checked = objLabelsOn(); $("objLabelsWhich").value = objLabelsWhich(); sync();
    $("objLabels").onchange = () => { try { localStorage.setItem(OBJ_LABELS_KEY, $("objLabels").checked ? "1" : "0"); } catch (e) {} sync(); renderZones(); };
    $("objLabelsWhich").onchange = () => { try { localStorage.setItem(OBJ_LABELS_WHICH_KEY, $("objLabelsWhich").value); } catch (e) {} renderZones(); };
  }
  if ($("objSubs")) {
    $("objSubs").checked = showSubObjects();
    $("objSubs").onchange = () => { try { localStorage.setItem(OBJ_SUBS_KEY, $("objSubs").checked ? "1" : "0"); } catch (e) {} invalidatePositions(); renderZones(); };
  }
  $("btnPositions").onclick = () => { if (!window.opener) { alert("Positionerna läses från 3D-modellen, så 4D-planering måste vara öppen i Trimble Connect. Öppna lägesplanen via 🗺️-knappen där."); return; } fetchPositions(); };
  const onLevel = () => {
    if (!plan) return;
    plan.level = { z0: $("levelZ0").value.trim().replace(",", "."), z1: $("levelZ1").value.trim().replace(",", ".") };
    invalidatePositions(); renderZones(); schedulePlanSave();
  };
  $("levelZ0").onchange = onLevel;
  try { $("showObjects").checked = localStorage.getItem("lagesplan-objects") !== "0"; } catch (e) {}
  $("showObjects").onchange = () => {
    try { localStorage.setItem("lagesplan-objects", $("showObjects").checked ? "1" : "0"); } catch (e) {}
    renderZones();
  };
  $("levelZ1").onchange = onLevel;

  bindTokenModal();
  $("zeDelete").onclick = () => {
    const z = plan.zones.find(x => x.id === selectedZoneId);
    if (!z || !confirm(`Ta bort zon ${z.code}?`)) return;
    plan.zones = plan.zones.filter(x => x.id !== z.id);
    selectZone(null); schedulePlanSave();
  };
  $("btnZoomIn").onclick = () => { const r = $("viewport").getBoundingClientRect(); zoomAt(1.3, r.width / 2, r.height / 2); };
  $("btnZoomOut").onclick = () => { const r = $("viewport").getBoundingClientRect(); zoomAt(1 / 1.3, r.width / 2, r.height / 2); };
  $("btnFit").onclick = fitView;
  $("btnExport").onclick = exportPng;
  bindTools();
  const ts = $("textScale"), tf = $("textFixed");
  ts.value = Math.round(textScale() * 100); tf.checked = textFixed();
  $("textScaleLabel").textContent = ts.value + " %";
  ts.oninput = () => { try { localStorage.setItem("lagesplan-textscale", ts.value); } catch (e) {} $("textScaleLabel").textContent = ts.value + " %"; renderZones(); };
  tf.onchange = () => { try { localStorage.setItem("lagesplan-textfixed", tf.checked ? "1" : "0"); } catch (e) {} renderZones(); };
  bindLayers();
  window.addEventListener("resize", () => { if (viewport) fitView(); });
  bindSections();
  window.addEventListener("keydown", e => { if (e.key === "Escape" && drawMode) { setDrawMode(false); renderZones(); } });
}

// ---------------------------------------------------------------------
// Sidomenyn: flikar (Planering, Tid & filter, Zoner & 3D, Export) med
// infällbara kort (<details class="sec">), och hela menyn kan döljas.
// Läget sparas per webbläsare.
// ---------------------------------------------------------------------
const SEC_KEY = "lagesplan-sections";
function loadSecState() { try { return JSON.parse(localStorage.getItem(SEC_KEY) || "{}") || {}; } catch (e) { return {}; } }
function saveSecState() {
  const st = { hidden: $("layout").classList.contains("side-hidden"), tab: activeTab() };
  document.querySelectorAll("details.sec").forEach(d => { st[d.dataset.sec] = d.open; });
  try { localStorage.setItem(SEC_KEY, JSON.stringify(st)); } catch (e) {}
}
function activeTab() {
  const t = document.querySelector(".tabs button.on");
  return t ? t.dataset.tab : "work";
}
function showTab(tab, save = true) {
  if (!document.querySelector(`.tab[data-tab="${tab}"]`)) tab = "work";
  document.querySelectorAll(".tabs button").forEach(b => { b.classList.toggle("on", b.dataset.tab === tab); b.setAttribute("aria-selected", b.dataset.tab === tab); });
  document.querySelectorAll(".tab-body .tab").forEach(s => s.classList.toggle("on", s.dataset.tab === tab));
  if (save) saveSecState();
}
// Öppnar kortet och byter till dess flik. Med soft=true byts fliken bara om
// kortet redan ligger på den aktiva fliken (t.ex. klick på en zon i planen).
function openSec(key, soft = false) {
  const d = document.querySelector(`details.sec[data-sec="${key}"]`);
  if (!d) return;
  const tab = d.closest(".tab");
  if (soft && tab && tab.dataset.tab !== activeTab()) return;
  if (tab && tab.dataset.tab !== activeTab()) showTab(tab.dataset.tab);
  if (!d.open) d.open = true;
  if ($("layout").classList.contains("side-hidden")) setSideHidden(false);
}
function setSideHidden(hidden) {
  $("layout").classList.toggle("side-hidden", hidden);
  $("btnShowSide").classList.toggle("hidden", !hidden);
  saveSecState();
}
/* Menyns bredd går att dra (Victors önskemål 2026-09-29); sparas per webbläsare. */
const SIDE_W_KEY = "lagesplan-sidewidth", SIDE_W_DEF = 344;
function setSideWidth(w, save) {
  w = Math.max(280, Math.min(Math.round(window.innerWidth * 0.6), Math.round(w)));
  const a = document.querySelector("aside");
  a.style.width = w + "px"; a.style.flexBasis = w + "px";
  if (save) try { localStorage.setItem(SIDE_W_KEY, String(w)); } catch (e) {}
}
function bindSideResizer() {
  const r = $("sideResizer");
  try { const w = Number(localStorage.getItem(SIDE_W_KEY)); if (w) setSideWidth(w, false); } catch (e) {}
  let drag = null;
  r.addEventListener("pointerdown", e => {
    e.preventDefault(); r.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, w: document.querySelector("aside").getBoundingClientRect().width };
    r.classList.add("drag"); document.body.classList.add("resizing");
  });
  r.addEventListener("pointermove", e => { if (drag) setSideWidth(drag.w + e.clientX - drag.x, false); });
  const end = () => {
    if (!drag) return;
    drag = null; r.classList.remove("drag"); document.body.classList.remove("resizing");
    setSideWidth(document.querySelector("aside").getBoundingClientRect().width, true);
    window.dispatchEvent(new Event("resize"));
    if (typeof scheduleOrthoRender === "function") scheduleOrthoRender();
  };
  r.addEventListener("pointerup", end); r.addEventListener("pointercancel", end);
  r.addEventListener("dblclick", () => { setSideWidth(SIDE_W_DEF, true); window.dispatchEvent(new Event("resize")); if (typeof scheduleOrthoRender === "function") scheduleOrthoRender(); });
}
function bindSections() {
  const st = loadSecState();
  const secs = [...document.querySelectorAll("details.sec")];
  secs.forEach(d => {
    if (typeof st[d.dataset.sec] === "boolean") d.open = st[d.dataset.sec];
    d.addEventListener("toggle", saveSecState);
  });
  document.querySelectorAll(".tabs button").forEach(b => { b.onclick = () => showTab(b.dataset.tab); });
  showTab(st.tab || "work", false);
  if (st.hidden) setSideHidden(true);
  $("btnSecAll").onclick = () => {
    const own = secs.filter(d => d.closest(".tab").dataset.tab === activeTab());
    const open = !own.some(d => d.open);
    own.forEach(d => { d.open = open; });
    saveSecState();
  };
  $("btnHideSide").onclick = () => setSideHidden(true);
  bindSideResizer();
  $("btnShowSide").onclick = () => setSideHidden(false);
}

// ---------------------------------------------------------------------
// Anslutning: GitHub-token (Victors önskemål 2026-10-01)
// ---------------------------------------------------------------------
const maskToken = t => t ? `${t.slice(0, 6)}…${t.slice(-4)}` : "";
function renderTokenStatus() {
  const m = manualToken();
  const src = m ? "manuell (angiven här)" : tokenSource === "4D-planering" ? "från 4D-planering" : tokenSource === "sparad" ? "sparad i webbläsaren" : "";
  $("tokenStatus").innerHTML = token
    ? `Används nu: <b>${escHtml(maskToken(m || token))}</b> – ${escHtml(src)}`
    : "Ingen token angiven.";
  $("btnTokenClear").disabled = !m;
}
function openTokenModal(msg) {
  renderTokenStatus();
  $("tokenInput").value = "";
  $("tokenMsg").textContent = msg || "";
  $("tokenMsg").className = msg ? "bad" : "muted";
  $("tokenModal").classList.remove("hidden");
  setTimeout(() => $("tokenInput").focus(), 30);
}
function closeTokenModal() { $("tokenModal").classList.add("hidden"); }
async function testToken(t) {
  const r = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}`, { headers: { Authorization: `Bearer ${t}`, Accept: "application/vnd.github+json" } });
  if (r.status === 200) return { ok: true, text: "Token:en fungerar – har åtkomst till 4D-data." };
  if (r.status === 401) return { ok: false, text: "GitHub godkänner inte token:en (401) – fel eller utgången." };
  if (r.status === 404 || r.status === 403) return { ok: false, text: `Token:en saknar behörighet till ${GH_OWNER}/${GH_REPO} (${r.status}).` };
  return { ok: false, text: `Oväntat svar från GitHub (${r.status}).` };
}
function bindTokenModal() {
  const msg = (t, ok) => { $("tokenMsg").textContent = t; $("tokenMsg").className = ok ? "ok" : ok === false ? "bad" : "muted"; };
  $("btnToken").onclick = () => openTokenModal();
  $("btnTokenOpen").onclick = () => openTokenModal();
  $("btnTokenClose").onclick = closeTokenModal;
  $("tokenModal").addEventListener("mousedown", e => { if (e.target === $("tokenModal")) closeTokenModal(); });
  $("tokenModal").addEventListener("keydown", e => { if (e.key === "Escape") closeTokenModal(); if (e.key === "Enter") $("btnTokenSave").click(); });
  $("btnTokenShow").onclick = () => { const i = $("tokenInput"); i.type = i.type === "password" ? "text" : "password"; $("btnTokenShow").textContent = i.type === "password" ? "Visa" : "Dölj"; };
  $("btnTokenTest").onclick = async () => {
    const t = $("tokenInput").value.trim() || token;
    if (!t) return msg("Skriv in en token först.", false);
    msg("Testar…");
    try { const r = await testToken(t); msg(r.text, r.ok); } catch (e) { msg("Kunde inte nå GitHub: " + e.message, false); }
  };
  $("btnTokenSave").onclick = async () => {
    const t = $("tokenInput").value.trim();
    if (!t) return msg("Skriv in en token först.", false);
    msg("Testar…");
    let r = null;
    try { r = await testToken(t); } catch (e) { /* nätverksfel – spara ändå */ }
    if (r && !r.ok && !confirm(`${r.text}\n\nSpara ändå?`)) return msg(r.text, false);
    try { localStorage.setItem(LS_TOKEN_KEY, t); localStorage.setItem("4dplan-unlocked", "1"); } catch (e) {}
    location.reload();
  };
  $("btnTokenClear").onclick = () => {
    if (!confirm("Ta bort den manuella token:en? Lägesplan använder då token:en från 4D-planering igen.")) return;
    try { localStorage.removeItem(LS_TOKEN_KEY); } catch (e) {}
    location.reload();
  };
}

// ---------------------------------------------------------------------
// Varför syns inga objekt? (Victors fråga 2026-10-01) – en liten ruta på
// planen som säger orsaken och har en knapp som rättar den.
// ---------------------------------------------------------------------
function objHintReason(objects) {
  if (!plan || !items.length) return null;
  if (!layerVisible("objects")) return { text: "Lagret Objekt är släckt.", btn: "Tänd", fix: () => { ls("objects").visible = true; $("showObjects").checked = true; saveLayerState(); renderLayerPanel(); applyLayerCss(); renderZones(); } };
  if (layerOpacity("objects") < 0.15) return { text: "Lagret Objekt är nästan helt genomskinligt.", btn: "Återställ", fix: () => { ls("objects").opacity = 100; saveLayerState(); renderLayerPanel(); applyLayerCss(); renderZones(); } };
  if (!plan.calib) return { text: "Planen är inte kalibrerad – objekten kan inte placeras.", btn: "Kalibrera", fix: () => { showTab("zones"); openSec("calib"); } };
  if (!positions.length) return { text: "Objekten saknar position – hämta dem med uppdatera-knappen bredvid nyckeln (4D-planering behöver vara öppen).", btn: "Hämta nu", fix: () => refreshCoupled() };
  const pos = positionsInPdf();
  if (!pos || !pos.size) {
    const [z0, z1] = levelRange();
    return { text: `Inget objekt ligger inom vald nivå (Z ${z0 ?? "–"} till ${z1 ?? "–"} m).`, btn: "Ändra nivå", fix: () => { showTab("zones"); openSec("calib"); } };
  }
  if (objects && !objects.length && visibleItems().length < items.length) return { text: "Filtret (entreprenör/sök) döljer alla objekt.", btn: "Rensa filter", fix: () => { $("fltContractor").value = ""; $("fltText").value = ""; onFilterChanged(); } };
  if (objects && objects.length && focusActive() && !objects.some(o => focusState(o.it))) return { text: "Veckans fokus är på och inget startar i fönstret – objekten är nedtonade.", btn: "Stäng av fokus", fix: () => { $("focusOn").checked = false; $("focusOn").dispatchEvent(new Event("change")); } };
  if (objects && !objects.length) return { text: "Inga av objekten med position hör till den här planen.", btn: "", fix: null };
  return null;
}
function renderObjHint(objects) {
  let el = $("objHint");
  if (!el) {
    el = document.createElement("div");
    el.id = "objHint";
    el.className = "obj-hint hidden";
    $("viewport").parentElement.appendChild(el);
  }
  const r = objHintReason(objects);
  if (!r) { el.classList.add("hidden"); return; }
  el.innerHTML = `<span>Inga objekt syns: ${escHtml(r.text)}</span>${r.btn ? `<button type="button">${escHtml(r.btn)}</button>` : ""}<button type="button" class="x" title="Dölj">✕</button>`;
  el.classList.remove("hidden");
  const b = el.querySelector("button:not(.x)");
  if (b) b.onclick = () => r.fix();
  el.querySelector(".x").onclick = () => el.classList.add("hidden");
}

function openLabelMenu(l, e) {
  let m = $("labelMenu");
  if (!m) {
    m = document.createElement("div");
    m.id = "labelMenu"; m.className = "label-menu";
    document.body.appendChild(m);
    document.addEventListener("mousedown", ev => { if (!ev.target.closest("#labelMenu")) m.classList.add("hidden"); });
  }
  m.innerHTML = objMenuHtml(l.ids.map(id => items.find(it => it.id === id)).filter(Boolean)) + `<hr/><button type="button" data-a="one">Dölj namnet ${escHtml(l.text)}</button>` +
    (l.act ? `<button type="button" data-a="act">Dölj alla namn för aktiviteten ${escHtml(l.act.length > 30 ? l.act.slice(0, 29) + "…" : l.act)}</button>` : "");
  m.style.left = Math.min(e.clientX, window.innerWidth - 280) + "px";
  m.style.top = Math.min(e.clientY, window.innerHeight - 90) + "px";
  m.classList.remove("hidden");
  bindObjMenu(m, l.ids.map(id => items.find(it => it.id === id)).filter(Boolean));
  m.querySelector('[data-a="one"]').onclick = () => { const h = hiddenLabels(); h.ids = [...new Set([...h.ids, ...l.ids])]; h.names = [...new Set([...h.names, l.text])]; m.classList.add("hidden"); saveHiddenLabels(h); statusWithUndo(`Namnet ${l.text} är dolt.`); };
  const a = m.querySelector('[data-a="act"]');
  if (a) a.onclick = () => { const h = hiddenLabels(); h.acts = [...new Set([...h.acts, l.act])]; m.classList.add("hidden"); saveHiddenLabels(h); statusWithUndo(`Namnen för ${l.act} är dolda.`); };
}

// ---------------------------------------------------------------------
// Släcka objekt på planen + sparade vyer (Victors önskemål 2026-10-01).
// Högerklick på en prick: släck objektet, hela aktiviteten, alla med samma
// aktivitetsnamn – eller visa bara den aktiviteten. Alt + dra en ruta
// släcker allt inuti. Det släckta kan sparas som en namngiven vy (delas i
// projektet via site_layers.json, { type: "objview" }).
// ---------------------------------------------------------------------
const objHideKey = () => "lagesplan-objhide-" + projectId;
const objFamKey = it => it.group_id ? "g:" + it.group_id : it.source_key ? "s:" + it.source_key : "i:" + it.id;
let objHideUndo = [];      // [{ kind: "obj"|"labels", state }] – Ctrl+Z ångrar släckningar och dolda namn
let lastUndoTarget = "";   // "obj" när senaste ångringsbara steget var en släckning (annars etableringen)
/* Ångra senaste släckning eller dolda namn. */
function undoObjHide() {
  const e = objHideUndo.pop();
  if (!e) return false;
  if (e.kind === "labels") saveHiddenLabels(e.state, { undo: false });
  else setObjHidden(e.state, { undo: false });
  if (!objHideUndo.length) lastUndoTarget = "";
  renderObjViewUi();
  setSaveStatus("Ångrat.");
  return true;
}
/* Statusraden med en Ångra-knapp. */
function statusWithUndo(text) {
  const el = $("saveStatus");
  el.textContent = text + " ";
  const b = document.createElement("button");
  b.type = "button"; b.className = "status-undo"; b.textContent = "Ångra (Ctrl+Z)";
  b.onclick = () => undoObjHide();
  el.appendChild(b);
}
function objHidden() {
  try { const v = JSON.parse(localStorage.getItem(objHideKey()) || "{}") || {}; return { ids: v.ids || [], fams: v.fams || [], acts: v.acts || [], view: v.view || "" }; }
  catch (e) { return { ids: [], fams: [], acts: [], view: "" }; }
}
let objHiddenSets = null;
function isObjHidden(it) {
  if (!objHiddenSets) { const h = objHidden(); objHiddenSets = { ids: new Set(h.ids), fams: new Set(h.fams), acts: new Set(h.acts) }; }
  return objHiddenSets.ids.has(it.id) || objHiddenSets.fams.has(objFamKey(it)) || objHiddenSets.acts.has(String(it.activity || "").trim());
}
function setObjHidden(h, opts = {}) {
  if (opts.undo !== false) { objHideUndo.push({ kind: "obj", state: objHidden() }); if (objHideUndo.length > 30) objHideUndo.shift(); lastUndoTarget = "obj"; }
  try { localStorage.setItem(objHideKey(), JSON.stringify(h)); } catch (e) {}
  objHiddenSets = null;
  if (typeof invalidateVisible === "function") invalidateVisible(); else invalidatePositions();
  renderZones();
  renderObjViewUi();
}
function hiddenObjCount() { return items.filter(isObjHidden).length; }
function famName(it) { return String(it.object_name || it.activity || "aktiviteten").trim(); }
function objMenuHtml(its) {
  if (!its.length) return "";
  const it = its[0];
  const names = [...new Set(its.map(x => objLabelText(x)).filter(Boolean))];
  const fams = new Set(its.map(objFamKey));
  const act = String(it.activity || "").trim();
  const famCount = items.filter(x => fams.has(objFamKey(x))).length;
  return `<button type="button" data-o="obj">Släck ${escHtml(names.slice(0, 2).join(", ") || "objektet")}${its.length > 1 ? ` (${its.length} objekt här)` : ""}</button>` +
    (famCount > its.length ? `<button type="button" data-o="fam">Släck hela aktiviteten ${escHtml(famName(it))} (${famCount} objekt)</button>` : "") +
    (act ? `<button type="button" data-o="act">Släck alla med aktiviteten ${escHtml(act.length > 28 ? act.slice(0, 27) + "…" : act)}</button>` : "") +
    `<button type="button" data-o="only">Visa bara ${escHtml(famName(it))}</button>`;
}
function bindObjMenu(m, its) {
  const close = () => m.classList.add("hidden");
  const h = () => objHidden();
  const on = (k, fn) => { const b = m.querySelector(`[data-o="${k}"]`); if (b) b.onclick = () => { close(); fn(); }; };
  on("obj", () => { const x = h(); x.ids = [...new Set([...x.ids, ...its.map(i => i.id)])]; setObjHidden(x); statusWithUndo(`Släckt: ${[...new Set(its.map(objLabelText))].join(", ")}${its.length > 1 ? ` (${its.length} objekt)` : ""}.`); });
  on("fam", () => { const x = h(); x.fams = [...new Set([...x.fams, ...its.map(objFamKey)])]; setObjHidden(x); statusWithUndo(`Släckt hela aktiviteten ${famName(its[0])}.`); });
  on("act", () => { const x = h(); x.acts = [...new Set([...x.acts, String(its[0].activity || "").trim()])]; setObjHidden(x); statusWithUndo(`Släckt alla med aktiviteten ${its[0].activity}.`); });
  on("only", () => {
    const keep = new Set(its.map(objFamKey));
    const x = h(); x.ids = []; x.acts = []; x.fams = [...new Set(items.map(objFamKey).filter(k => !keep.has(k)))];
    setObjHidden(x); statusWithUndo(`Visar bara ${famName(its[0])}.`);
  });
}
function openObjMenu(its, e) {
  let m = $("labelMenu");
  if (!m) { openLabelMenu({ ids: [], text: "", act: "", box: {} }, e); m = $("labelMenu"); }
  m.innerHTML = objMenuHtml(its);
  m.style.left = Math.min(e.clientX, window.innerWidth - 300) + "px";
  m.style.top = Math.min(e.clientY, window.innerHeight - 160) + "px";
  m.classList.remove("hidden");
  bindObjMenu(m, its);
}
function hideObjectsInBox(a, b) {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
  if (x1 - x0 < 4 || y1 - y0 < 4) { renderZones(); return; }
  const inside = (objectShapesInPdf() || []).filter(o => { const [x, y] = toPx(o.center); return x >= x0 && x <= x1 && y >= y0 && y <= y1; }).flatMap(o => (o.members || [o.it]).map(it => it.id));
  if (!inside.length) { renderZones(); setSaveStatus("Inga objekt i rutan."); return; }
  const x = objHidden(); x.ids = [...new Set([...x.ids, ...inside])];
  setObjHidden(x);
  statusWithUndo(`Släckte ${inside.length} objekt i rutan.`);
}

/* ---------- sparade vyer ---------- */
const objViews = () => (typeof siteItems !== "undefined" ? siteItems : []).filter(x => x.type === "objview").sort((a, b) => (a.name || "").localeCompare(b.name || "", "sv"));
function renderObjViewUi() {
  const cnt = $("objHiddenCount");
  if (!cnt) return;
  const n = hiddenObjCount(), h = objHidden();
  cnt.textContent = n ? `${n} objekt släckta` : "Inga objekt släckta";
  $("btnObjShowAll").disabled = !n;
  $("btnObjHideUndo").disabled = !objHideUndo.length;
  const sel = $("objViewSel"), views = objViews();
  const cur = views.find(v => v.id === h.view);
  const same = cur && JSON.stringify([...(cur.hidden.ids || [])].sort()) === JSON.stringify([...h.ids].sort()) && JSON.stringify([...(cur.hidden.fams || [])].sort()) === JSON.stringify([...h.fams].sort()) && JSON.stringify([...(cur.hidden.acts || [])].sort()) === JSON.stringify([...h.acts].sort());
  sel.innerHTML = `<option value="">${n ? "(osparad filtrering)" : "Alla objekt"}</option>` + views.map(v => `<option value="${escHtml(v.id)}">${escHtml(v.name)}${v.id === h.view && !same ? " (ändrad)" : ""}</option>`).join("");
  sel.value = cur ? cur.id : "";
  $("btnObjViewDelete").disabled = !cur;
}
function bindObjViewUi() {
  if (!$("objViewSel")) return;
  // Vyerna ligger bland lägesplanens sparade poster – uppdatera listan när de laddas/ändras.
  if (typeof renderLayerPanel === "function" && !renderLayerPanel.__objViews) {
    const orig = renderLayerPanel;
    renderLayerPanel = function () { const r = orig.apply(this, arguments); renderObjViewUi(); return r; };
    renderLayerPanel.__objViews = true;
  }
  $("btnObjShowAll").onclick = () => { setObjHidden({ ids: [], fams: [], acts: [], view: "" }); statusWithUndo("Alla objekt tända."); };
  $("btnObjHideUndo").onclick = () => undoObjHide();
  $("objViewSel").onchange = () => {
    const v = objViews().find(x => x.id === $("objViewSel").value);
    setObjHidden(v ? { ids: [...(v.hidden.ids || [])], fams: [...(v.hidden.fams || [])], acts: [...(v.hidden.acts || [])], view: v.id } : { ids: [], fams: [], acts: [], view: "" });
  };
  $("btnObjViewSave").onclick = async () => {
    const h = objHidden(), cur = objViews().find(v => v.id === h.view);
    const name = (prompt("Namn på vyn (t.ex. \"Utan grundsula\"). Samma namn skriver över.", cur ? cur.name : "") || "").trim();
    if (!name) return;
    const existing = objViews().find(v => v.name.toLowerCase() === name.toLowerCase());
    const rec = { id: existing ? existing.id : ghNewId(), type: "objview", name, hidden: { ids: h.ids, fams: h.fams, acts: h.acts }, updated_by: settings.userName || null, updated_at: new Date().toISOString() };
    await saveSiteItem(rec, false, { record: false });
    setObjHidden({ ...h, view: rec.id }, { undo: false });
    setSaveStatus(`Vyn "${name}" är sparad i projektet.`);
  };
  $("btnObjViewDelete").onclick = async () => {
    const v = objViews().find(x => x.id === objHidden().view);
    if (!v || !confirm(`Ta bort vyn "${v.name}"? Det du har släckt just nu ligger kvar.`)) return;
    await saveSiteItem(v, true, { record: false });
    const h = objHidden(); h.view = ""; setObjHidden(h, { undo: false });
  };
  renderObjViewUi();
}
