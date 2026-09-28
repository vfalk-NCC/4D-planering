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
  renderLegend();

  if (!unlocked) return fatal("Öppna lägesplanen via 4D-planering (knappen 🗺️ Lägesplan) – den delar inloggning och inställningar med den.");
  if (!projectId) return fatal("Saknar projekt. Öppna lägesplanen via knappen 🗺️ Lägesplan i 4D-planering.");
  if (!token) return fatal("Ingen GitHub-token. Ange den i 4D-planeringens inställningar (⚙) och öppna lägesplanen igen.");

  $("projectInfo").textContent = `Projekt ${projectId}`;
  $("dateInput").value = todayIso();
  setBusy("Hämtar planering…");
  try {
    [items, plans] = await Promise.all([ghReadJSON(token, dataPath("plan_items.json")), ghReadJSON(token, dataPath("status_plans.json"))]);
  } catch (e) {
    setBusy("");
    return fatal("Kunde inte hämta data: " + e.message);
  }
  setBusy("");
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
    return items.filter(it => String(it[rule.field] || "").toLowerCase().includes(v));
  }
  const code = normCode(zone.code);
  if (!code) return [];
  return items.filter(it => itemCodes(it).has(code));
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
  setBusy("Hämtar PDF…");
  try {
    if (!pdfCache.has(id)) {
      const url = await ghReadBinaryUrl(token, plan.file_path);
      pdfCache.set(id, await (await fetch(url)).arrayBuffer());
      URL.revokeObjectURL(url);
    }
    pdfDoc = await pdfjsLib.getDocument({ data: pdfCache.get(id).slice(0) }).promise;
    page = await pdfDoc.getPage(Math.min(plan.page || 1, pdfDoc.numPages));
    await renderPdf();
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
  pc.width = zc.width = Math.round(viewport.width);
  pc.height = zc.height = Math.round(viewport.height);
  stage.style.width = pc.width + "px";
  stage.style.height = pc.height + "px";
  await page.render({
    canvasContext: pc.getContext("2d"), viewport,
    // Originalmarkeringarna (t.ex. röda rutor) döljs som standard - zonerna ersätter dem.
    annotationMode: $("showOriginal").checked ? pdfjsLib.AnnotationMode.ENABLE : pdfjsLib.AnnotationMode.DISABLE
  }).promise;
}

const toPx = ([x, y]) => viewport.convertToViewportPoint(x, y);
const toPdf = ([px, py]) => viewport.convertToPdfPoint(px, py);

function zoneStatus(zone) {
  const zi = itemsForZone(zone);
  return { items: zi, phase: zonePhase(zi, $("dateInput").value || todayIso()), progress: zoneProgress(zi) };
}

function renderZones() {
  const zc = $("zoneCanvas");
  const ctx = zc.getContext("2d");
  ctx.clearRect(0, 0, zc.width, zc.height);
  if (!plan || !viewport) { renderZoneList(); return; }
  const fontPx = Math.max(14, Math.round(zc.width / 110));
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
      if (st.phase !== "ingen") { ctx.globalAlpha = ZONE_ALPHA; ctx.fillStyle = color; ctx.fill(); }
      ctx.globalAlpha = 1;
      ctx.lineWidth = selected ? Math.max(4, fontPx / 3) : Math.max(1.5, fontPx / 8);
      ctx.strokeStyle = selected ? "#0b5fff" : shade(color, -0.35);
      if (st.phase === "ingen") ctx.setLineDash([fontPx / 2, fontPx / 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Etikett: kod + framdrift, vid kodtexten (eller mitt i zonen)
    const anchors = (zone.labels && zone.labels.length) ? zone.labels : [centroid(zone)];
    anchors.filter(Boolean).forEach(a => drawBadge(ctx, toPx(a), `${zone.code}${st.progress != null ? " · " + st.progress + " %" : ""}`, color, fontPx, st.phase === "ingen"));
    ctx.restore();
  }
  renderZoneList();
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
function applyView() { $("stage").style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`; }
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
    showTip(e);
  });
  window.addEventListener("mouseup", e => {
    if (!drag) return;
    const d = drag; drag = null;
    if (d.draw) { finishDraw(d.start, stagePoint(e)); return; }
    if (!d.moved && e.target.closest && e.target.closest("#viewport")) {
      const z = zoneAt(toPdf(stagePoint(e)));
      selectZone(z ? z.id : null, false);
    }
  });
  vpEl.addEventListener("mouseleave", () => $("tip").classList.add("hidden"));
}

function showTip(e) {
  const tip = $("tip");
  if (!viewport || !e.target.closest || !e.target.closest("#viewport")) { tip.classList.add("hidden"); return; }
  const z = zoneAt(toPdf(stagePoint(e)));
  if (!z) { tip.classList.add("hidden"); return; }
  const st = z._status || zoneStatus(z);
  const lines = [`${z.code} – ${PHASE_LABELS[st.phase]}${st.progress != null ? ` · ${st.progress} % klart` : ""}`];
  if (!st.items.length) lines.push("Inga planerade objekt kopplade (klicka för att koppla).");
  st.items.slice(0, 8).forEach(it => lines.push(`• ${it.object_name || it.activity || it.object_id} – ${it.status || ""}${it.start_date ? ` (${it.start_date} → ${it.end_date || "?"})` : ""}`));
  if (st.items.length > 8) lines.push(`… och ${st.items.length - 8} till`);
  tip.textContent = lines.join("\n");
  const r = $("viewport").getBoundingClientRect();
  tip.style.left = (e.clientX - r.left + 14) + "px";
  tip.style.top = (e.clientY - r.top + 14) + "px";
  tip.classList.remove("hidden");
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
    ? "Inga planerade objekt har koden i område/aktivitet/namn – välj ett fält och värde i stället."
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
function exportPng() {
  if (!viewport) return;
  const pc = $("pdfCanvas"), zc = $("zoneCanvas");
  const head = Math.round(pc.width / 25);
  const out = document.createElement("canvas");
  out.width = pc.width; out.height = pc.height + head;
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, out.width, out.height);
  if ($("grayPdf").checked) ctx.filter = "grayscale(1)";
  ctx.drawImage(pc, 0, head);
  ctx.filter = "none";
  ctx.drawImage(zc, 0, head);
  // Rubrik + förklaring
  const f = Math.round(head * 0.38);
  ctx.fillStyle = "#111827"; ctx.font = `700 ${f}px "Segoe UI", Arial, sans-serif`; ctx.textBaseline = "middle";
  ctx.fillText(`Lägesplan ${plan.name} – ${$("dateInput").value}`, f * 0.6, head / 2);
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
  out.toBlob(blob => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `Lägesplan ${plan.name} ${$("dateInput").value}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, "image/png");
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
      const pc = $("pdfCanvas"); pc.width = pc.height = 0; $("zoneCanvas").width = 0;
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
  const applyGray = () => { $("pdfCanvas").style.filter = $("grayPdf").checked ? "grayscale(1)" : ""; };
  applyGray();
  $("grayPdf").onchange = () => { applyGray(); try { localStorage.setItem("lagesplan-gray", $("grayPdf").checked ? "1" : "0"); } catch (e) {} };
  $("showOriginal").onchange = async () => { if (page) { await renderPdf(); renderZones(); } };
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
  window.addEventListener("resize", () => { if (viewport) fitView(); });
  window.addEventListener("keydown", e => { if (e.key === "Escape" && drawMode) { setDrawMode(false); renderZones(); } });
}
