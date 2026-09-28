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
  ej_planerad: "#cbd5e1", planerad: "#94a3b8", pagaende: "#f5a623", forsenad: "#e5484d",
  klar: "#3fb950", pausad: "#a1a1aa", snart: "#eab308", klar_forsenad: "#3b82f6"
};
const PHASE_LABELS = {
  planerad: "Ej påbörjad", pagaende: "Pågående", snart: "Snart klar (deadline nära)",
  forsenad: "Försenad", klar: "Klar", klar_forsenad: "Klar, försenad", ingen: "Ingen koppling"
};
const PHASE_ORDER = ["planerad", "pagaende", "snart", "forsenad", "klar", "klar_forsenad", "ingen"];
const DEFAULT_CODE_PATTERN = "PM\\s*\\d+\\s*[A-Z]?";
const ZONE_ALPHA = 0.5;

const $ = id => document.getElementById(id);

// ---- Tillstånd ----
let projectId = new URLSearchParams(location.search).get("project");
let settings = {};
let token = null;
let items = [];            // planerade objekt (radformat från plan_items.json)
let plans = [];            // status_plans.json
let plan = null;           // aktiv plan
let pdfDoc = null, page = null, viewport = null;
let renderScale = 1;
let selectedZoneId = null;
const view = { scale: 1, tx: 0, ty: 0 };
let drawMode = false;
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
        token = settings.githubToken || token;
        unlocked = true;
      }
      if (!projectId && r.projectId) projectId = r.projectId;
    } catch (e) { /* ingen extension - använd lokal lagring */ }
  }
  renderLegend();

  if (!projectId) return fatal("Saknar projekt. Öppna lägesplanen via knappen 🗺️ Lägesplan i 4D-planering.");
  if (!token || !unlocked) {
    $("tokenBox").classList.remove("hidden");
    return fatal("Öppna lägesplanen via knappen 🗺️ i 4D-planering (inne i Trimble Connect), eller ange GitHub-token här.");
  }

  $("projectInfo").textContent = `Projekt ${projectId}`;
  $("dateInput").value = todayIso();
  setBusy("Hämtar planering…");
  try {
    [items, plans, positions] = await Promise.all([ghReadJSON(token, dataPath("plan_items.json")), ghReadJSON(token, dataPath("status_plans.json")),
      ghReadJSON(token, dataPath("plan_item_positions.json")).catch(() => [])]);
  } catch (e) {
    setBusy("");
    if (/\b401\b/.test(e.message)) {
      $("tokenBox").classList.remove("hidden");
      return fatal("GitHub godkänner inte token:en (401) – den har troligen gått ut. Ange en ny token under ⚙ i 4D-planering (eller här nedan).");
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
  if (at < start) return "planerad";
  if (actualEnd && actualEnd <= at) return (plannedEnd && actualEnd > plannedEnd) ? "klar_forsenad" : "klar";
  if (plannedEnd) {
    if (at > plannedEnd) return "forsenad";
    const daysLeft = Math.round((plannedEnd - at) / 86400000);
    if (warningDays > 0 && daysLeft <= warningDays) return "snart";
  }
  return "pagaende";
}

/* Zonens fas: försenad om något är försenat, klar om allt är klart,
   pågående om något har kommit igång, annars ej påbörjad. */
function zonePhase(zoneItems, atDate) {
  if (!zoneItems.length) return "ingen";
  const warn = Number.isFinite(settings.warningDaysBeforeEnd) ? settings.warningDaysBeforeEnd : 7;
  const phases = zoneItems.map(it => computeItemPhase(it, atDate, warn) || fallbackPhase(it));
  if (phases.includes("forsenad")) return "forsenad";
  const done = p => p === "klar" || p === "klar_forsenad";
  if (phases.every(done)) return phases.includes("klar_forsenad") ? "klar_forsenad" : "klar";
  if (phases.some(p => p === "pagaende" || p === "snart" || done(p))) {
    return phases.includes("snart") && !phases.includes("pagaende") ? "snart" : "pagaende";
  }
  return "planerad";
}
function fallbackPhase(it) {
  return { klar: "klar", pagaende: "pagaende", forsenad: "forsenad" }[it.status] || "planerad";
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
  shapeCache = visibleItems().filter(it => pos.has(it.id)).map(it => {
    const p = byId.get(it.id);
    const poly = Number.isFinite(p.x0)
      ? [[p.x0, p.y0], [p.x1, p.y0], [p.x1, p.y1], [p.x0, p.y1]].map(([x, y]) => modelToPdf(x, y))
      : null;
    return { it, center: pos.get(it.id), poly, zc: (p.z0 + p.z1) / 2 };
  }).sort((a, b) => a.zc - b.zc); // lägre objekt först, högre ritas ovanpå
  return shapeCache;
}
function invalidatePositions() { posPdfCache = null; shapeCache = null; }

let objMinPx = 4; // prickradie (canvas-px) vid senaste ritningen, för hovring

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
    const big = o.poly && Math.sqrt(area) >= tol;
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
    (it.actual_start_date || it.actual_end_date) ? `Verkligt: ${escHtml(it.actual_start_date || "?")} → ${escHtml(it.actual_end_date || "pågår")}` : "",
    it.contractor ? `Entreprenör: ${escHtml(it.contractor)}` : "",
    zone ? `Zon: ${escHtml(zone.code)}` : ""
  ];
  return rows.filter(Boolean).join("<br>");
}

/* Varje planerat objekt i sin egen fasfärg (samma som i 3D-modellen) vid valt datum. */
function drawObjects(ctx, objects, fontPx) {
  const at = $("dateInput").value || todayIso();
  const warn = Number.isFinite(settings.warningDaysBeforeEnd) ? settings.warningDaysBeforeEnd : 7;
  const minPx = Math.max(3, fontPx / 4);
  objMinPx = minPx;
  ctx.save();
  ctx.lineWidth = 1;
  for (const o of objects) {
    const color = phaseColor(computeItemPhase(o.it, at, warn) || fallbackPhase(o.it));
    // Veckans fokus: objekten som startar snart framhävs, resten tonas ned.
    const focus = focusState(o.it);
    ctx.fillStyle = color;
    ctx.strokeStyle = focus === true ? "#111827" : shade(color, -0.45);
    ctx.lineWidth = focus === true ? Math.max(2, minPx / 2) : 1;
    ctx.globalAlpha = focus === false ? 0.15 : 0.85;
    const pts = o.poly ? o.poly.map(toPx) : null;
    const big = pts && Math.max(...pts.map(q => Math.hypot(q[0] - pts[0][0], q[1] - pts[0][1]))) >= minPx;
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
  renderOrtho();
  const z = (model[0][2] + model[1][2]) / 2;
  if (!plan.level) plan.level = { z0: Math.round((z - 0.5) * 10) / 10, z1: Math.round((z + 3.5) * 10) / 10 };
  invalidatePositions();
  renderZones();
  schedulePlanSave();
  if (!positions.length) fetchPositions();
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

let saveTimer = null;
function schedulePlanSave() {
  clearTimeout(saveTimer);
  setSaveStatus("Osparade ändringar…");
  saveTimer = setTimeout(savePlan, 800);
}
async function savePlan() {
  if (!plan) return;
  const rec = { ...plan, updated_at: new Date().toISOString(), updated_by: settings.userName || null };
  plan.updated_at = rec.updated_at;
  setSaveStatus("Sparar…");
  try {
    plans = await ghWriteJSON(token, dataPath("status_plans.json"),
      arr => { const i = arr.findIndex(p => p.id === rec.id); if (i >= 0) arr[i] = rec; else arr.push(rec); return arr; },
      `Lägesplan: ${rec.name}`);
    setSaveStatus(`✓ Sparad ${new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}`);
  } catch (e) {
    setSaveStatus("⚠ Kunde inte spara: " + e.message);
  }
}

async function createPlanFromFile(file) {
  const id = ghNewId();
  const name = file.name.replace(/\.pdf$/i, "");
  setBusy("Laddar upp PDF…");
  try {
    const path = dataPath(`status_plans/${id}.pdf`);
    await ghUploadBinary(token, path, file, `Lägesplan: ny plan ${name}`);
    plan = { id, name, file_path: path, file_name: file.name, page: 1, code_pattern: DEFAULT_CODE_PATTERN, zones: [],
      created_at: new Date().toISOString(), created_by: settings.userName || null };
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
}
async function renderPdfHi() {
  const hc = $("pdfHiCanvas"), pc = $("pdfCanvas");
  const seq = ++hiSeq;
  if (!page || !viewport || !pc.width) { hc.width = 0; return; }
  let s = view.scale * (window.devicePixelRatio || 1);
  if (s <= 1.05) { hc.width = 0; pc.style.visibility = ""; return; }
  const vr = $("viewport").getBoundingClientRect();
  const x0 = Math.max(0, -view.tx / view.scale), y0 = Math.max(0, -view.ty / view.scale);
  const x1 = Math.min(pc.width, (vr.width - view.tx) / view.scale), y1 = Math.min(pc.height, (vr.height - view.ty) / view.scale);
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
let textRaf = 0;
function rerenderTextIfFixed() {
  if (!textFixed() || textRaf) return;
  textRaf = requestAnimationFrame(() => { textRaf = 0; renderZones(); });
}

/* Canvaslagren i #stage, nedifrån och upp - se lagesplan-layers.js. */
const STAGE_CANVASES = ["orthoCanvas", "pdfCanvas", "zoneCanvas", "objCanvas", "topCanvas"];

function renderZones() {
  const zc = $("zoneCanvas");
  const ctx = zc.getContext("2d");
  ["zoneCanvas", "objCanvas", "topCanvas"].forEach(id => { const c = $(id); c.getContext("2d").clearRect(0, 0, c.width, c.height); });
  const octx = $("objCanvas").getContext("2d");
  const tctx = $("topCanvas").getContext("2d");
  if (!plan || !viewport) { renderZoneList(); return; }
  const fontPx = planFontPx();
  const objects = $("showObjects").checked ? objectShapesInPdf() : null;
  const badges = [];
  for (const zone of plan.zones || []) {
    const st = zoneStatus(zone);
    zone._status = st;
    const color = phaseColor(st.phase);
    const selected = zone.id === selectedZoneId;
    ctx.save();
    for (const poly of zone.polys || []) {
      if (poly.length < 2) continue;
      ctx.beginPath();
      poly.forEach((p, i) => { const [x, y] = toPx(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
      // Med objekten utritade blir zonfärgen svagare så objekten syns.
      if (st.phase !== "ingen") { ctx.globalAlpha = (objects && objects.length ? ZONE_ALPHA / 3 : ZONE_ALPHA) * (focusActive() ? 0.4 : 1); ctx.fillStyle = color; ctx.fill(); }
      ctx.globalAlpha = 1;
      ctx.lineWidth = selected ? Math.max(4, fontPx / 3) : Math.max(1.5, fontPx / 8);
      ctx.strokeStyle = selected ? "#0b5fff" : shade(color, -0.35);
      if (st.phase === "ingen") ctx.setLineDash([fontPx / 2, fontPx / 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Etikett: kod + framdrift, vid kodtexten (eller mitt i zonen)
    const anchors = (zone.labels && zone.labels.length) ? zone.labels : [centroid(zone)];
    anchors.filter(Boolean).forEach(a => badges.push([toPx(a), `${zone.code}${st.progress != null ? " · " + st.progress + " %" : ""}`, color, st.phase === "ingen"]));
    ctx.restore();
  }
  if (objects) drawObjects(octx, objects, fontPx);
  drawSiteLayers(tctx, fontPx);
  if (layerVisible("zones")) badges.forEach(([pt, text, color, hollow]) => drawBadge(tctx, pt, text, color, fontPx, hollow));
  drawToolOverlays(tctx, fontPx);
  drawCalibMarks(tctx, fontPx);
  afterRenderTools();
  renderZoneList();
  updateCalibInfo();
}

function drawBadge(ctx, [x, y], text, color, fontPx, hollow) {
  ctx.font = `600 ${fontPx}px "Segoe UI", Arial, sans-serif`;
  const w = ctx.measureText(text).width + fontPx * 0.9, h = fontPx * 1.5;
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = hollow ? "#ffffff" : color;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = shade(color, -0.4);
  ctx.stroke();
  ctx.fillStyle = hollow ? "#374151" : contrastText(color);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, x, y + 1);
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
    const code = document.createElement("span"); code.className = "code"; code.textContent = z.code || "?";
    const ph = document.createElement("span"); ph.textContent = PHASE_LABELS[st.phase];
    const pct = document.createElement("span"); pct.className = "pct";
    pct.textContent = st.items.length ? `${st.progress} % · ${st.items.length} obj` : "";
    row.append(sw, code, ph, pct);
    row.onclick = () => selectZone(z.id, true);
    list.appendChild(row);
  });
  if (!zones.length) list.innerHTML = '<div class="muted" style="padding:6px;">Inga zoner än – klicka 🔍 Hitta zoner i PDF:en, eller ▭ Rita zon.</div>';
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
function applyView() {
  $("stage").style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;
  if (typeof scheduleOrthoRender === "function") scheduleOrthoRender();
  scheduleHiRender();
  rerenderTextIfFixed();
}
function fitView() {
  const vp = $("viewport").getBoundingClientRect(), pc = $("pdfCanvas");
  if (!pc.width) return;
  view.scale = Math.min(vp.width / pc.width, vp.height / pc.height) * 0.96;
  view.tx = (vp.width - pc.width * view.scale) / 2;
  view.ty = (vp.height - pc.height * view.scale) / 2;
  applyView();
}
function zoomAt(factor, cx, cy) {
  const ns = Math.max(0.02, Math.min(8, view.scale * factor));
  view.tx = cx - (cx - view.tx) * (ns / view.scale);
  view.ty = cy - (cy - view.ty) * (ns / view.scale);
  view.scale = ns;
  applyView();
}
function stagePoint(e) {
  const r = $("viewport").getBoundingClientRect();
  return [(e.clientX - r.left - view.tx) / view.scale, (e.clientY - r.top - view.ty) / view.scale];
}
function zoneAt(pdfPt) {
  const zones = (plan && plan.zones) || [];
  for (let i = zones.length - 1; i >= 0; i--) if ((zones[i].polys || []).some(p => pointInPoly(pdfPt, p))) return zones[i];
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
    // Noteringar/etablering: flytta, ändra form och rotera (lagesplan-layers.js).
    if (e.target.closest && e.target.closest("#viewport") && !e.target.closest("#sitePop") && layersPointerDown(e)) return;
    drag = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
  });
  window.addEventListener("mousemove", e => {
    if (drag && drag.draw) { drawRubber(drag.start, stagePoint(e)); return; }
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      view.tx = drag.tx + dx; view.ty = drag.ty + dy; applyView();
      return;
    }
    toolMouseMove(e);
    showTip(e);
  });
  window.addEventListener("mouseup", e => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.draw) { finishDraw(d.start, stagePoint(e)); return; }
    if (!d.moved && calib && calib.waitPdf && e.target.closest && e.target.closest("#viewport")) {
      calib.waitPdf = false;
      calib.pdf.push(toPdf(stagePoint(e)));
      renderZones();
      calibNext();
      return;
    }
    if (!d.moved && e.target.closest && e.target.closest("#viewport")) {
      if (toolClick(toPdf(stagePoint(e)), e)) return;
      const z = zoneAt(toPdf(stagePoint(e)));
      selectZone(z ? z.id : null, false);
    }
  });
  vpEl.addEventListener("mouseleave", () => $("tip").classList.add("hidden"));
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
  const st = z._status || zoneStatus(z);
  const lines = [`${z.code} – ${PHASE_LABELS[st.phase]}${st.progress != null ? ` · ${st.progress} % klart` : ""}`];
  if (!st.items.length) lines.push("Inga planerade objekt kopplade (klicka för att koppla).");
  st.items.slice(0, 8).forEach(it => lines.push(`• ${it.object_name || it.activity || it.object_id} – ${it.status || ""}${it.start_date ? ` (${it.start_date} → ${it.end_date || "?"})` : ""}`));
  if (st.items.length > 8) lines.push(`… och ${st.items.length - 8} till`);
  tip.textContent = lines.join("\n");
  place();
}

function drawRubber(a, b) {
  renderZones();
  const ctx = $("zoneCanvas").getContext("2d");
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
function selectZone(id, center) {
  selectedZoneId = id;
  renderZones();
  if (id) openEditor(id); else closeEditor();
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
function openEditor(id) {
  const z = plan.zones.find(x => x.id === id);
  if (!z) return closeEditor();
  $("zoneEditor").classList.remove("hidden");
  openSec("zones");
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
  const tmp = { code: $("zeCode").value, rule: { field, value: $("zeValue").value } };
  const n = itemsForZone(tmp).length;
  $("zeMatchInfo").textContent = n ? `Kopplar ${n} planerade objekt.` : (field === "auto"
    ? (plan && plan.calib ? "Inga planerade objekt ligger i zonen på vald nivå, eller har koden i område/aktivitet/namn." : "Inga planerade objekt har koden i område/aktivitet/namn – kalibrera mot 3D (📐) eller välj ett fält och värde.")
    : "Inga planerade objekt matchar.");
}

// ---------------------------------------------------------------------
// Datum
// ---------------------------------------------------------------------
let dateMin = null, dateMax = null;
function setupDateRange() {
  const ds = items.flatMap(it => [it.start_date, it.end_date, it.actual_end_date]).filter(Boolean).map(d => Date.parse(d)).filter(Number.isFinite);
  const today = Date.parse(todayIso());
  dateMin = ds.length ? Math.min(...ds, today) : today - 180 * 86400000;
  dateMax = ds.length ? Math.max(...ds, today) : today + 180 * 86400000;
  syncSliderFromDate();
}
function syncSliderFromDate() {
  const t = Date.parse($("dateInput").value || todayIso());
  $("dateSlider").value = dateMax > dateMin ? Math.round((t - dateMin) / (dateMax - dateMin) * 100) : 100;
}
function onDateChanged() { renderZones(); }

// ---------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------
/* Ritningen + zoner/objekt/foton med rubrik och förklaring, i en canvas.
   maxW skalar ned (video, bildserie). Används av PNG, PDF och uppspelning. */
function composeImage(maxW, noHeader) {
  const pc = $("pdfCanvas"), zc = $("zoneCanvas");
  const k = maxW ? Math.min(1, maxW / pc.width) : 1;
  const W = Math.round(pc.width * k), H = Math.round(pc.height * k);
  const head = noHeader ? 0 : Math.round(Math.max(W / 25, 28));
  const out = document.createElement("canvas");
  out.width = W; out.height = H + head;
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, out.width, out.height);
  // Samma lager, synlighet, genomskinlighet och blandning som på skärmen.
  STAGE_CANVASES.forEach(id => {
    const c = $(id);
    if (id === "orthoCanvas") { if (getComputedStyle(c).display !== "none") drawOrthoForExport(ctx, 0, head, W / pc.width); return; }
    if (!c.width || getComputedStyle(c).display === "none") return;
    ctx.save();
    ctx.globalAlpha = Number(getComputedStyle(c).opacity) || 0;
    if (id === "pdfCanvas") {
      if ($("grayPdf").checked) ctx.filter = "grayscale(1)";
      if (getComputedStyle(c).mixBlendMode === "multiply") ctx.globalCompositeOperation = "multiply";
    }
    ctx.drawImage(c, 0, head, W, H);
    ctx.restore();
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
  $("zeSelect3d").onclick = async () => {
    const z = plan && plan.zones.find(x => x.id === selectedZoneId);
    if (!z) return;
    const ids = itemsForZone(z).map(it => it.id);
    if (!ids.length) { alert("Zonen har inga kopplade objekt."); return; }
    try { await askOpener("select", { ids }, 30000); } catch (e) { alert("Kunde inte markera i 3D: " + e.message); }
  };
  $("btnTokenSave").onclick = () => {
    const t = $("tokenInput").value.trim();
    if (!t) return;
    try {
      const cur = JSON.parse(localStorage.getItem("4dplan-settings") || "{}") || {};
      localStorage.setItem("4dplan-settings", JSON.stringify({ ...cur, githubToken: t }));
      localStorage.setItem("4dplan-unlocked", "1");
    } catch (e) {}
    location.reload();
  };
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
// Infällbar meny: avsnitten (<details class="sec">) och hela sidomenyn.
// Läget sparas per webbläsare.
// ---------------------------------------------------------------------
const SEC_KEY = "lagesplan-sections";
function loadSecState() { try { return JSON.parse(localStorage.getItem(SEC_KEY) || "{}") || {}; } catch (e) { return {}; } }
function saveSecState() {
  const st = { hidden: $("layout").classList.contains("side-hidden") };
  document.querySelectorAll("details.sec").forEach(d => { st[d.dataset.sec] = d.open; });
  try { localStorage.setItem(SEC_KEY, JSON.stringify(st)); } catch (e) {}
}
function openSec(key) {
  const d = document.querySelector(`details.sec[data-sec="${key}"]`);
  if (d && !d.open) d.open = true;
  if ($("layout").classList.contains("side-hidden")) setSideHidden(false);
}
function setSideHidden(hidden) {
  $("layout").classList.toggle("side-hidden", hidden);
  $("btnShowSide").classList.toggle("hidden", !hidden);
  saveSecState();
}
function bindSections() {
  const st = loadSecState();
  const secs = [...document.querySelectorAll("details.sec")];
  secs.forEach(d => {
    if (typeof st[d.dataset.sec] === "boolean") d.open = st[d.dataset.sec];
    d.addEventListener("toggle", saveSecState);
  });
  if (st.hidden) setSideHidden(true);
  $("btnSecAll").onclick = () => {
    const open = !secs.some(d => d.open);
    secs.forEach(d => { d.open = open; });
    saveSecState();
  };
  $("btnHideSide").onclick = () => setSideHidden(true);
  $("btnShowSide").onclick = () => setSideHidden(false);
}
