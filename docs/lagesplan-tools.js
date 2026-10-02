// ---------------------------------------------------------------------
// Lägesplan – verktyg (laddas efter lagesplan.js och delar dess globaler)
// ---------------------------------------------------------------------
//   • Filter på entreprenör och aktivitet/namn/område
//   • Veckans fokus: det som startar inom N dagar framhävs, resten tonas ned
//   • Klick på ett objekt: markera det i 3D och hoppa till det i 4D-planering
//   • Uppspelning av datumet, och export som video eller bildserie (ZIP)
//   • Mätverktyg för avstånd och yta (meter via kalibreringen)
//   • Foton fästa på en punkt i planen (bilden i 4D-data, metadata i planen)
//   • Utskrift som PDF i A3 med rubrik, datum och teckenförklaring
// ---------------------------------------------------------------------

const JSZIP_URL = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
const JSPDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";

const scriptLoads = new Map();
function loadScript(url) {
  if (!scriptLoads.has(url)) {
    scriptLoads.set(url, new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url; s.onload = resolve;
      s.onerror = () => { scriptLoads.delete(url); reject(new Error("Kunde inte ladda " + url)); };
      document.head.appendChild(s);
    }));
  }
  return scriptLoads.get(url);
}
const fmtNum = (v, d = 1) => v.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return isoOf(d); };
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ---------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------
let visibleCache = null;
let filterOptionsFor = -1;
function filterState() {
  return { contractor: $("fltContractor").value, text: $("fltText").value.trim().toLowerCase() };
}
function filterActive() { const f = filterState(); return !!(f.contractor || f.text); }
/* Planerade objekt som klarar filtret - används av zoner, objekt och fokus. */
function visibleItems() {
  if (visibleCache) return visibleCache;
  const f = filterState();
  visibleCache = (!f.contractor && !f.text) ? items : items.filter(it =>
    (!f.contractor || (it.contractor || "") === f.contractor) &&
    (!f.text || [it.activity, it.object_name, it.area].filter(Boolean).join(" ").toLowerCase().includes(f.text)));
  return visibleCache;
}
function invalidateVisible() { visibleCache = null; invalidatePositions(); }
function onFilterChanged() {
  invalidateVisible();
  try { localStorage.setItem("lagesplan-filter-" + projectId, JSON.stringify(filterState())); } catch (e) {}
  renderZones();
}
function populateFilterOptions() {
  if (filterOptionsFor === items.length) return;
  filterOptionsFor = items.length;
  const sel = $("fltContractor"), cur = sel.value;
  const contractors = [...new Set(items.map(it => it.contractor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "sv"));
  sel.innerHTML = '<option value="">Alla</option>' + contractors.map(c => `<option>${escHtml(c)}</option>`).join("");
  sel.value = contractors.includes(cur) ? cur : "";
  const texts = [...new Set(items.flatMap(it => [it.activity, it.object_name]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "sv")).slice(0, 400);
  $("fltTextList").innerHTML = texts.map(t => `<option value="${escHtml(t)}">`).join("");
  try {
    const saved = JSON.parse(localStorage.getItem("lagesplan-filter-" + projectId) || "null");
    if (saved && !cur && !$("fltText").value) {
      if (contractors.includes(saved.contractor)) sel.value = saved.contractor;
      $("fltText").value = saved.text || "";
      if (filterActive()) { invalidateVisible(); requestAnimationFrame(renderZones); }
    }
  } catch (e) {}
}
function viewDescription() {
  const f = filterState(), parts = [];
  if (f.contractor) parts.push(`Entreprenör: ${f.contractor}`);
  if (f.text) parts.push(`Filter: "${$("fltText").value.trim()}"`);
  if (focusActive()) parts.push(`Fokus: startar inom ${focusDays()} dagar`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------
// Veckans fokus
// ---------------------------------------------------------------------
function focusActive() { return $("focusOn").checked; }
function focusDays() { const n = parseInt($("focusDays").value, 10); return Number.isFinite(n) && n > 0 ? n : 14; }
/* true = startar inom fokusfönstret, false = tonas ned, null = fokus av. */
function focusState(it) {
  if (!focusActive()) return null;
  const at = $("dateInput").value || todayIso();
  return !!(it.start_date && it.start_date >= at && it.start_date <= addDays(at, focusDays()));
}
let focusListKey = "";
function renderFocusList() {
  const el = $("focusList");
  if (!focusActive()) { el.classList.add("hidden"); focusListKey = ""; return; }
  const at = $("dateInput").value || todayIso();
  const key = [at, focusDays(), items.length, JSON.stringify(filterState())].join("|");
  if (key === focusListKey) return;
  focusListKey = key;
  const list = visibleItems().filter(it => focusState(it) === true).sort((a, b) => a.start_date.localeCompare(b.start_date));
  el.classList.remove("hidden");
  if (!list.length) { el.innerHTML = `<div class="fi muted">Inget startar ${escHtml(at)} – ${escHtml(addDays(at, focusDays()))}.</div>`; return; }
  el.innerHTML = list.map(it => `<div class="fi" data-id="${escHtml(it.id)}" title="Visa på planen och markera i 3D">
      <span class="fd">${escHtml(it.start_date.slice(5))}</span>
      <span>${escHtml(it.object_name || it.activity || "")}${it.activity && it.object_name && it.activity !== it.object_name ? ` – ${escHtml(it.activity)}` : ""}${it.contractor ? ` <span class="muted">(${escHtml(it.contractor)})</span>` : ""}</span>
    </div>`).join("");
  el.querySelectorAll(".fi[data-id]").forEach(row => {
    row.onclick = () => {
      const it = items.find(x => x.id === row.dataset.id);
      if (!it) return;
      const pos = positionsInPdf();
      if (pos && pos.has(it.id)) centerOnPdf(pos.get(it.id));
      selectObject(it);
    };
  });
}
function centerOnPdf(pt) {
  const [x, y] = toPx(pt);
  const r = $("viewport").getBoundingClientRect();
  view.tx = r.width / 2 - x * view.scale; view.ty = r.height / 2 - y * view.scale; applyView();
}

// ---------------------------------------------------------------------
// Klick på objekt -> markera i 3D och hoppa till raden i 4D-planering
// ---------------------------------------------------------------------
let selectedObjId = null;
async function selectObject(it) {
  selectedObjId = it.id;
  renderZones();
  const name = it.object_name || it.activity || "objektet";
  if (!window.opener || window.opener.closed) {
    setSaveStatus(`Öppna lägesplanen via 🗺️ i 4D-planering för att markera "${name}" i 3D.`);
    return;
  }
  setSaveStatus(`🎯 Markerar "${name}" i 3D…`);
  try {
    await askOpener("select", { ids: [it.id], jump: true }, 30000);
    setSaveStatus(`🎯 "${name}" markerat i 3D och i Planerade objekt.`);
  } catch (e) {
    setSaveStatus(`⚠ Kunde inte markera "${name}" i 3D: ${e.message}`);
  }
}

// ---------------------------------------------------------------------
// Mätverktyg
// ---------------------------------------------------------------------
let measure = null; // { mode: "len"|"area", pts: [[x,y]...] (PDF), cursor, done }
/* Meter per PDF-punkt: från kalibreringen, annars från en angiven skala. */
function metersPerPdfUnit(ask) {
  if (plan && plan.calib) {
    const [m1, m2] = plan.calib.model, [p1, p2] = plan.calib.pdf;
    return Math.hypot(m2[0] - m1[0], m2[1] - m1[1]) / Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  }
  if (plan && plan.scale) return plan.scale * 25.4 / 72 / 1000;
  if (!ask) return null;
  const v = prompt("Planen är inte kalibrerad mot 3D. Ange ritningens skala för att mäta, 1:", "100");
  const n = Number(String(v || "").replace(",", "."));
  if (!n || n <= 0) return null;
  plan.scale = n; schedulePlanSave();
  return metersPerPdfUnit(false);
}
function startMeasure(mode) {
  if (!plan || !viewport) return;
  if (measure && measure.mode === mode && !measure.done) { stopMeasure(); return; }
  if (!metersPerPdfUnit(true)) return;
  if (drawMode) setDrawMode(false);
  cancelPhotoPlacing();
  measure = { mode, pts: [], cursor: null, done: false };
  updateToolUi();
  renderZones();
}
function stopMeasure() { measure = null; updateToolUi(); renderZones(); }
function measureResult(pts) {
  const k = metersPerPdfUnit(false) || 0;
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (measure.mode === "len") return { text: `${fmtNum(len * k, len * k < 10 ? 2 : 1)} m`, len: len * k };
  if (pts.length < 3) return { text: pts.length ? `${fmtNum(len * k)} m` : "" };
  const perim = len + Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  const area = Math.abs(polyArea(pts)) * k * k;
  return { text: `${fmtNum(area)} m² (omkrets ${fmtNum(perim * k)} m)`, area };
}
function drawMeasure(ctx, fontPx) {
  if (!measure || !measure.pts.length) return;
  const pts = measure.pts.concat(!measure.done && measure.cursor ? [measure.cursor] : []);
  const px = pts.map(toPx);
  ctx.save();
  ctx.lineJoin = "round";
  const path = () => {
    ctx.beginPath();
    px.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    if (measure.mode === "area" && px.length > 2) ctx.closePath();
  };
  if (measure.mode === "area" && px.length > 2) { path(); ctx.globalAlpha = 0.18; ctx.fillStyle = "#0b5fff"; ctx.fill(); ctx.globalAlpha = 1; }
  // Tunnare linjer och mindre etikett än övriga objekt - mätningen ska inte skymma ritningen.
  path(); ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = Math.max(2.5, fontPx / 7); ctx.stroke();
  path(); ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = Math.max(1, fontPx / 16); ctx.stroke();
  px.forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, Math.max(2, fontPx / 7), 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = Math.max(1, fontPx / 16); ctx.stroke(); });
  const res = measureResult(pts);
  if (res.text) {
    const [lx, ly] = px[px.length - 1];
    const fs = fontPx * 0.7;
    ctx.font = `600 ${fs}px "Segoe UI", Arial, sans-serif`;
    drawBadge(ctx, [lx + ctx.measureText(res.text).width / 2 + fs, ly - fs * 1.3], res.text, "#0b5fff", fs, false);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------
// Foton
// ---------------------------------------------------------------------
let photoPlacing = false, pendingPhotoPt = null, pendingPhotoFile = null, openPhotoId = null;
const photoUrlCache = new Map();
function photos() { return (plan && plan.photos) || []; }
function cancelPhotoPlacing(skip) { photoPlacing = false; pendingPhotoPt = null; pendingPhotoFile = null; if (typeof gpsSuggest !== "undefined") gpsSuggest = null; updateToolUi(); if (skip) setTimeout(nextQueuedPhoto, 0); }
function photoMarkerPx() { return planFontPx() * 1.5; }
/* Foton visas som kartnålar (Victors önskemål 2026-10-01): spetsen där
   fotot är taget. Nålen har samma storlek på skärmen oavsett zoom (som på
   en karta i telefonen) och ritas på ett eget lager (#pinCanvas) i skärmens
   koordinater, som ritas om vid varje zoom/panorering. Blå = GPS, röd =
   utklickad på planen. */
const PIN_H = 30, PIN_R = 8.5;
function photoScreenPt(ph) {
  return stageToScreen(toPx([ph.x, ph.y]));
}
function photoAt(pdfPt) {
  if (!$("showPhotos").checked || !viewport) return null;
  const [px, py] = stageToScreen(toPx(pdfPt));
  let best = null, bd = Infinity;
  photos().forEach(ph => {
    const [tx, ty] = photoScreenPt(ph), hx = tx, hy = ty - (PIN_H - PIN_R);
    // Träffyta: huvudet (lite generöst för fingrar) och spetsen.
    const d = Math.min(Math.hypot(px - hx, py - hy) - PIN_R - 6, Math.hypot(px - tx, py - (ty - PIN_H / 3)) - 8);
    if (d <= 0 && d < bd) { best = ph; bd = d; }
  });
  return best;
}
function drawPhotoPin(ctx, x, y, color, faded) {
  const r = PIN_R, cy = y - (PIN_H - r);
  ctx.save();
  ctx.globalAlpha = faded ? 0.45 : 1;
  // Skugga på marken under spetsen.
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath(); ctx.ellipse(x, y, 4.5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
  // Droppform: cirkel som smalnar av till en spets i (x, y).
  ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1;
  const a = Math.asin(r / (PIN_H - r));
  ctx.beginPath();
  ctx.arc(x, cy, r, Math.PI / 2 + a, Math.PI / 2 - a + Math.PI * 2);
  ctx.lineTo(x, y - 1); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, cy, r * 0.36, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
  ctx.restore();
}
function renderScreenPins() {
  const c = $("pinCanvas");
  if (!c) return;
  const vp = $("viewport"), w = vp.clientWidth, h = vp.clientHeight, dpr = window.devicePixelRatio || 1;
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    c.style.width = w + "px"; c.style.height = h + "px";
  }
  const ctx = c.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
  if (!plan || !viewport || !$("showPhotos").checked) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const at = $("dateInput").value || todayIso();
  // Söderut sist, så nålar som ligger nära varandra överlappar snyggt.
  photos().map(ph => ({ ph, p: photoScreenPt(ph) })).filter(o => o.p[0] > -40 && o.p[1] > -10 && o.p[0] < w + 40 && o.p[1] < h + 40)
    .sort((a, b) => a.p[1] - b.p[1])
    .forEach(({ ph, p }) => drawPhotoPin(ctx, p[0], p[1], ph.gps ? "#2563eb" : "#e11d48", ph.date && ph.date > at)); // tagna efter valt datum: nedtonade
}
/* Nålarna ritas på #pinCanvas (renderScreenPins); här bara en uppdatering. */
function drawPhotos() { renderScreenPins(); }
function startPhotoPlacing() {
  if (!plan || !viewport) return;
  if (photoPlacing) { cancelPhotoPlacing(); return; }
  if (measure) stopMeasure();
  if (drawMode) setDrawMode(false);
  // Först bilden (fildialogen måste öppnas direkt från knappklicket, annars
  // kan webbläsaren blockera den), sedan klick där fotot är taget.
  $("photoInput").click();
}
/* Skalar ned bilden (max 1600 px, JPEG) så repot inte växer i onödan. */
async function shrinkImage(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(res, "image/jpeg", 0.85));
}
async function addPhotoFile(file, opts = {}) {
  const pt = opts.pt || pendingPhotoPt;
  // GPS-positionen (om den fanns) sparas med fotot, även om det flyttats på planen.
  const gps = opts.gps !== undefined ? opts.gps : (typeof gpsSuggest !== "undefined" && gpsSuggest ? { ...gpsSuggest.gps, moved: pt !== gpsSuggest.pt } : null);
  pendingPhotoFile = null;
  cancelPhotoPlacing();
  if (!pt || !file) return;
  const defDate = file.__exifDate || (file.lastModified ? isoOf(new Date(file.lastModified)) : todayIso());
  let caption, date;
  if (opts.quiet) {
    // Flera foton på en gång: filnamnet som beskrivning, datumet från fotot (ändras i listan/fotot vid behov).
    caption = file.name.replace(/\.[^.]+$/, ""); date = defDate;
  } else {
    caption = prompt("Beskrivning av fotot (valfritt):", "");
    if (caption === null) return;
    date = (prompt("Datum då fotot togs (ÅÅÅÅ-MM-DD):", defDate) || defDate).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = defDate;
  }
  setBusy(opts.progress || "Laddar upp fotot…");
  try {
    const blob = await shrinkImage(file);
    const id = ghNewId();
    const path = dataPath(`status_plans/photos/${id}.jpg`);
    await ghUploadBinary(token, path, blob, `Lägesplan: foto ${caption || date}`);
    plan.photos = [...photos(), { id, x: pt[0], y: pt[1], path, date, caption: caption.trim(), ...(gps ? { gps } : {}), by: settings.userName || null, created_at: new Date().toISOString() }];
    renderZones(); schedulePlanSave();
    if (typeof renderLayerPanel === "function") renderLayerPanel();
  } catch (e) {
    alert("Kunde inte ladda upp fotot: " + e.message);
  } finally {
    setBusy("");
  }
  nextQueuedPhoto();
}
/* Flera foton på en gång (t.ex. från datorn): de med GPS placeras direkt,
   de utan placeras ett i taget genom att klicka på planen (Esc hoppar över). */
let photoQueue = [];
async function importPhotoBatch(files) {
  const manual = [];
  let placed = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    setBusy(`Läser foto ${i + 1} av ${files.length}…`);
    const sug = typeof suggestPhotoPosition === "function" ? await suggestPhotoPosition(f) : null;
    setBusy("");
    if (sug && sug.pt) { await addPhotoFile(f, { pt: sug.pt, gps: sug.gps, quiet: true, progress: `Laddar upp foto ${i + 1} av ${files.length}…` }); placed++; }
    else manual.push(f);
  }
  photoQueue = manual.map((f, i) => ({ f, n: i + 1, of: manual.length }));
  setSaveStatus(`📷 ${placed} foto${placed === 1 ? "" : "n"} placerade enligt GPS.${manual.length ? ` ${manual.length} saknar GPS – klicka på planen där de är tagna.` : ""}`);
  nextQueuedPhoto();
}
function nextQueuedPhoto() {
  if (!photoQueue.length || photoPlacing) return;
  const q = photoQueue.shift();
  pendingPhotoFile = q.f; pendingPhotoFile.__quiet = true; photoPlacing = true; updateToolUi();
  setSaveStatus(`📷 Klicka på planen där "${q.f.name}" är taget (${q.n} av ${q.of}) – Esc hoppar över.`);
}
async function openPhoto(ph) {
  openPhotoId = ph.id;
  $("pmImg").removeAttribute("src");
  showPhotoMeta(ph);
  $("photoModal").classList.remove("hidden");
  try {
    if (!photoUrlCache.has(ph.id)) photoUrlCache.set(ph.id, await ghReadBinaryUrl(token, ph.path));
    if (openPhotoId === ph.id) $("pmImg").src = photoUrlCache.get(ph.id);
  } catch (e) {
    $("pmMeta").innerHTML += `<br>⚠ Kunde inte hämta bilden: ${escHtml(e.message)}`;
  }
}
/* Byt namn (beskrivning) och datum på ett foto i efterhand. */
function updatePhoto(id, patch) {
  const i = photos().findIndex(p => p.id === id);
  if (i < 0) return null;
  const next = { ...photos()[i], ...patch, updated_at: new Date().toISOString() };
  plan.photos = photos().map(p => (p.id === id ? next : p));
  renderZones(); schedulePlanSave();
  if (typeof renderLayerPanel === "function") renderLayerPanel();
  return next;
}
function editOpenPhoto() {
  const ph = photos().find(p => p.id === openPhotoId);
  if (!ph) return;
  $("pmMeta").innerHTML = `<div class="pm-edit">
    <input type="text" id="pmCaption" value="${escHtml(ph.caption || "")}" placeholder="Beskrivning, t.ex. J15 byggställning" />
    <input type="date" id="pmDate" value="${escHtml(ph.date || "")}" />
    <button id="pmEditSave" class="primary">Spara</button><button id="pmEditCancel">Avbryt</button></div>`;
  const cap = $("pmCaption"); cap.focus(); cap.select();
  const save = () => {
    const date = $("pmDate").value;
    const next = updatePhoto(ph.id, { caption: cap.value.trim(), date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : ph.date });
    if (next) showPhotoMeta(next);
    setSaveStatus(`📷 Fotot heter nu "${next.caption || "Foto"}".`);
  };
  $("pmEditSave").onclick = save;
  $("pmEditCancel").onclick = () => showPhotoMeta(ph);
  cap.onkeydown = $("pmDate").onkeydown = e => { if (e.key === "Enter") save(); if (e.key === "Escape") { e.stopPropagation(); showPhotoMeta(ph); } };
}
function showPhotoMeta(ph) {
  $("pmMeta").innerHTML = `<b>${escHtml(ph.caption || "Foto")}</b> · ${escHtml(ph.date || "")}${ph.by ? ` · ${escHtml(ph.by)}` : ""}${ph.gps ? ` · 📍 GPS${ph.gps.acc ? ` ±${ph.gps.acc} m` : ""}` : ""}`;
}
function closePhoto() { openPhotoId = null; $("photoModal").classList.add("hidden"); }
async function deleteOpenPhoto() {
  const ph = photos().find(p => p.id === openPhotoId);
  if (!ph || !confirm("Ta bort fotot från planen?")) return;
  closePhoto();
  plan.photos = photos().filter(p => p.id !== ph.id);
  renderZones(); schedulePlanSave();
  ghDeleteBinary(token, ph.path, "Lägesplan: ta bort foto");
}

// ---------------------------------------------------------------------
// Uppspelning, video och bildserie
// ---------------------------------------------------------------------
let playTimer = null, recording = false;
function setDate(iso) { $("dateInput").value = iso; syncSliderFromDate(); onDateChanged(); }
function stepDays() { return Number($("playStep").value) || 7; }
function stopPlay() { clearInterval(playTimer); playTimer = null; $("btnPlay").textContent = "▶ Spela upp"; }
function togglePlay() {
  if (playTimer) { stopPlay(); return; }
  if (!plan) return;
  const end = isoOf(new Date(dateMax));
  if (($("dateInput").value || todayIso()) >= end) setDate(isoOf(new Date(dateMin)));
  $("btnPlay").textContent = "⏸ Pausa";
  playTimer = setInterval(() => {
    const next = addDays($("dateInput").value || todayIso(), stepDays());
    if (next > end) { setDate(end); stopPlay(); return; }
    setDate(next);
  }, 700);
}
/* Går igenom hela tidslinjen och anropar onFrame(datum) för varje steg. */
async function runSequence(onFrame) {
  const orig = $("dateInput").value;
  const end = isoOf(new Date(dateMax));
  const dates = [];
  for (let d = isoOf(new Date(dateMin)); d < end; d = addDays(d, stepDays())) dates.push(d);
  dates.push(end);
  recording = true;
  try {
    for (let i = 0; i < dates.length; i++) {
      setBusy(`Steg ${i + 1} av ${dates.length} (${dates[i]})…`);
      $("dateInput").value = dates[i]; syncSliderFromDate(); renderZones();
      await onFrame(dates[i], i);
    }
  } finally {
    recording = false;
    setBusy("");
    setDate(orig);
  }
  return dates.length;
}
/* Jämna mått (krävs av H.264). */
function evenCanvas(src, maxW) {
  const k = Math.min(1, maxW / src.width);
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * k / 2) * 2; c.height = Math.round(src.height * k / 2) * 2;
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return c;
}
async function recordVideo() {
  if (!viewport || recording) return;
  stopPlay();
  const types = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  const type = window.MediaRecorder && types.find(t => MediaRecorder.isTypeSupported(t));
  if (!type) { alert("Webbläsaren kan inte spela in video. Använd Bildserie (ZIP) i stället."); return; }
  const first = evenCanvas(composeImage(1920), 1920);
  const rec = document.createElement("canvas");
  rec.width = first.width; rec.height = first.height;
  const rctx = rec.getContext("2d");
  const stream = rec.captureStream(30);
  const mr = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6000000 });
  const chunks = [];
  mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise(res => { mr.onstop = res; });
  rctx.drawImage(first, 0, 0);
  mr.start(500);
  try {
    await runSequence(async () => {
      rctx.drawImage(composeImage(1920), 0, 0, rec.width, rec.height);
      await new Promise(r => setTimeout(r, 600));
    });
    await new Promise(r => setTimeout(r, 900)); // håll sista bilden en stund
  } finally {
    mr.stop();
  }
  await stopped;
  const ext = type.startsWith("video/mp4") ? "mp4" : "webm";
  downloadBlob(new Blob(chunks, { type: type.split(";")[0] }), `Lägesplan ${plan.name} tidslinje.${ext}`);
}
async function recordZip() {
  if (!viewport || recording) return;
  stopPlay();
  try { await loadScript(JSZIP_URL); } catch (e) { alert(e.message); return; }
  const zip = new JSZip();
  await runSequence(async (date, i) => {
    const blob = await new Promise(res => composeImage(2400).toBlob(res, "image/jpeg", 0.88));
    zip.file(`${String(i + 1).padStart(3, "0")} ${date}.jpg`, blob);
  });
  setBusy("Packar ZIP…");
  try {
    downloadBlob(await zip.generateAsync({ type: "blob" }), `Lägesplan ${plan.name} bildserie.zip`);
  } finally { setBusy(""); }
}

// ---------------------------------------------------------------------
// PDF i A3
// ---------------------------------------------------------------------
async function exportPdfA3() {
  if (!viewport) return;
  setBusy("Skapar PDF…");
  try {
    await loadScript(JSPDF_URL);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
    const W = 420, H = 297, M = 12;
    let vec = null;
    if (typeof vecBegin === "function" && pdfVectorWanted()) { try { vec = await vecBegin(doc); } catch (e) { vec = null; } }
    doc.setFont("helvetica", "bold"); doc.setFontSize(20);
    doc.text(`Lägesplan – ${plan.name}`, M, M + 6);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
    const sub = [`Status per ${$("dateInput").value || todayIso()}`, viewDescription()].filter(Boolean).join("   ·   ");
    doc.text(sub, M, M + 13);
    doc.setFontSize(9); doc.setTextColor(110);
    const printed = new Date();
    doc.text(`Utskriven ${isoOf(printed)} ${String(printed.getHours()).padStart(2, "0")}:${String(printed.getMinutes()).padStart(2, "0")}${settings.userName ? " av " + settings.userName : ""}`, W - M, M + 6, { align: "right" });
    doc.setTextColor(0);

    // Planen (utan rubrikrad - rubriken står i PDF:en)
    const top = M + 18, bottom = H - M - 12;
    const boxW = W - 2 * M, boxH = bottom - top;
    // Underlaget som bild, DXF som vektorer (skarpa linjer), zoner/objekt ovanpå.
    const r = addPlanToPdf(doc, M, top, boxW, boxH, 0.9, vec);
    doc.setDrawColor(200); doc.rect(r.x, r.y, r.w, r.h);

    // Teckenförklaring
    let x = M; const y = H - M - 3;
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold"); doc.text("Förklaring:", x, y); x += 22;
    doc.setFont("helvetica", "normal");
    PHASE_ORDER.forEach(ph => {
      const hex = ph === "ingen" ? "#ffffff" : phaseColor(ph);
      const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
      doc.setFillColor(r, g, b); doc.setDrawColor(120);
      doc.rect(x, y - 3.5, 5, 4.5, "FD");
      x += 7; doc.text(PHASE_LABELS[ph], x, y); x += doc.getTextWidth(PHASE_LABELS[ph]) + 8;
    });
    if ($("showObjects").checked) { doc.setTextColor(110); doc.text("Zoner och objekt färgas efter fasen vid valt datum.", x + 4, y); doc.setTextColor(0); }
    const a3name = `Lägesplan ${plan.name} ${$("dateInput").value} A3.pdf`;
    if (vec) { setBusy("Sätter ihop PDF:en med ritningen som vektorer…"); savePdfBytes(await vecFinish(vec), a3name); }
    else doc.save(a3name);
  } catch (e) {
    alert("Kunde inte skapa PDF: " + e.message);
  } finally {
    setBusy("");
  }
}

// ---------------------------------------------------------------------
// Hookar från lagesplan.js
// ---------------------------------------------------------------------
function drawToolOverlays(ctx, fontPx) {
  if (typeof drawObjFamHighlight === "function") drawObjFamHighlight(ctx, fontPx);
  if (selectedObjId && $("showObjects").checked) {
    const o = (objectShapesInPdf() || []).find(x => x.it.id === selectedObjId);
    if (o) {
      const [x, y] = toPx(o.center);
      ctx.save(); ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = Math.max(3, fontPx / 5);
      ctx.beginPath(); ctx.arc(x, y, Math.max(12, fontPx), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  }
  drawPhotos(ctx);
  if (typeof drawGpsSuggest === "function") drawGpsSuggest(ctx);
  drawMeasure(ctx, fontPx);
}
function afterRenderTools() {
  if (items.length) populateFilterOptions();
  const n = visibleItems().length;
  $("fltInfo").textContent = filterActive() ? `Visar ${n} av ${items.length} planerade objekt.` : "";
  renderFocusList();
  $("photoInfo").textContent = photos().length ? `${photos().length} foton på planen. Klicka på 📷 för att visa.` : "";
}
/* Klick på planen: true om ett verktyg tog hand om klicket. */
function toolClick(pdfPt) {
  if (!photoPlacing && !measure && layersClick(pdfPt)) return true;
  if (photoPlacing) { pendingPhotoPt = pdfPt; const f = pendingPhotoFile; photoPlacing = false; addPhotoFile(f, { quiet: !!(f && f.__quiet) }); return true; }
  if (measure) {
    if (measure.done) measure = { mode: measure.mode, pts: [], cursor: null, done: false };
    measure.pts.push(typeof constrainPdf === "function" ? constrainPdf(pdfPt, window.event, measure.pts[measure.pts.length - 1]) : pdfPt);
    updateToolUi(); renderZones();
    return true;
  }
  const ph = photoAt(pdfPt);
  if (ph) { openPhoto(ph); return true; }
  const objs = objectsAt(pdfPt);
  if (objs.length) { selectObject(objs[0].it); return true; }
  selectedObjId = null;
  if (typeof objFamSel !== "undefined" && objFamSel.size) { objFamSel.clear(); renderZones(); }
  return false;
}
let moveRaf = 0;
function toolMouseMove(e) {
  if (!measure || measure.done || !viewport) return;
  if (!e.target.closest || !e.target.closest("#viewport")) return;
  // Fästmarkeringen syns redan innan första klicket.
  measure.cursor = typeof constrainPdf === "function" ? constrainPdf(toPdf(stagePoint(e)), e, measure.pts[measure.pts.length - 1]) : toPdf(stagePoint(e));
  if (!moveRaf) moveRaf = requestAnimationFrame(() => { moveRaf = 0; renderZones(); });
}
function toolTipHtml(pdfPt) {
  if (measure && !measure.done && measure.pts.length) {
    const r = measureResult(measure.pts.concat([pdfPt]));
    return r.text ? `${escHtml(r.text)}<br><span style="opacity:.7">Dubbelklicka för att avsluta, Shift = rak linje (5°-steg), Esc för att rensa</span>` : null;
  }
  if (photoPlacing) return typeof gpsSuggest !== "undefined" && gpsSuggest ? "📍 GPS-förslag – klicka för att placera fotot här i stället" : "Klicka där fotot är taget";
  const lt = layersTipHtml(pdfPt);
  if (lt) return lt;
  const ph = photoAt(pdfPt);
  if (ph) return `📷 <b>${escHtml(ph.caption || "Foto")}</b><br>${escHtml(ph.date || "")}${ph.by ? " · " + escHtml(ph.by) : ""}<br><span style="opacity:.7">Klicka för att visa</span>`;
  return null;
}
function finishMeasure() {
  if (!measure || measure.done) return;
  measure.done = true; measure.cursor = null;
  updateToolUi(); renderZones();
}
function savePhotoAtGps() {
  if (!photoPlacing || typeof gpsSuggest === "undefined" || !gpsSuggest || !pendingPhotoFile) return;
  pendingPhotoPt = gpsSuggest.pt; const f = pendingPhotoFile; photoPlacing = false; addPhotoFile(f);
}
function updateToolUi() {
  $("btnMeasureLen").classList.toggle("active", !!measure && measure.mode === "len");
  $("btnMeasureArea").classList.toggle("active", !!measure && measure.mode === "area");
  $("btnAddPhoto").classList.toggle("active", photoPlacing);
  $("viewport").classList.toggle("drawing", !!measure || photoPlacing || drawMode || !!(calib && calib.waitPdf) || !!siteTool);
  let info = "";
  if (measure) {
    const r = measure.pts.length ? measureResult(measure.pts) : null;
    info = (r && r.text ? `${measure.done ? "Resultat" : "Hittills"}: ${r.text}. ` : "") +
      (measure.done ? "Klicka på planen för en ny mätning, Esc för att avsluta." : "Klicka punkter på planen, dubbelklicka (eller Enter) för att avsluta, Esc rensar.") +
      (plan && !plan.calib && plan.scale ? ` (Skala 1:${plan.scale}.)` : "");
  }
  $("measureInfo").textContent = info;
}

function bindTools() {
  $("fltContractor").onchange = onFilterChanged;
  $("fltText").oninput = onFilterChanged;
  try { $("focusOn").checked = localStorage.getItem("lagesplan-focus") === "1"; } catch (e) {}
  $("focusOn").onchange = () => { try { localStorage.setItem("lagesplan-focus", $("focusOn").checked ? "1" : "0"); } catch (e) {} renderZones(); };
  $("focusDays").onchange = () => renderZones();
  $("btnPlay").onclick = togglePlay;
  $("btnRecVideo").onclick = recordVideo;
  $("btnRecZip").onclick = recordZip;
  $("btnPdfA3").onclick = exportPdfA3;
  $("btnMeasureLen").onclick = () => startMeasure("len");
  $("btnMeasureArea").onclick = () => startMeasure("area");
  $("btnAddPhoto").onclick = startPhotoPlacing;
  $("photoInput").onchange = async e => {
    const files = [...e.target.files]; e.target.value = "";
    if (files.length > 1) { cancelPhotoPlacing(); photoQueue = []; importPhotoBatch(files); return; }
    const f = files[0];
    if (!f) { cancelPhotoPlacing(); return; }
    pendingPhotoFile = f; photoPlacing = true; if (typeof gpsSuggest !== "undefined") gpsSuggest = null; updateToolUi();
    setSaveStatus(`📷 Klicka på planen där "${f.name}" är taget (Esc avbryter).`);
    // GPS (fotots EXIF, eller iPadens position för en nytagen bild): förslag på planen.
    if (typeof suggestPhotoPosition !== "function") return;
    const sug = await suggestPhotoPosition(f);
    if (!photoPlacing || pendingPhotoFile !== f) return;
    if (sug && sug.pt) {
      gpsSuggest = sug;
      const [x, y] = toPx(sug.pt), r = $("viewport").getBoundingClientRect();
      view.tx = r.width / 2 - x * view.scale; view.ty = r.height / 2 - y * view.scale; applyView();
      setSaveStatus(`📍 Fotot placeras enligt GPS (${sug.src}, ±${Math.round(sug.acc || 0)} m, ${sug.zone}). Spara här, eller klicka på planen för att flytta.`);
    } else if (sug && sug.far) setSaveStatus("📍 GPS-positionen ligger inte på den här planen (eller modellen är inte i SWEREF 99) – klicka på planen där fotot är taget.");
    else setSaveStatus(`📷 Fotot saknar GPS – klicka på planen där "${f.name}" är taget.`);
    updateToolUi(); renderZones();
  };
  $("showPhotos").onchange = () => renderZones();
  $("pmClose").onclick = closePhoto;
  $("pmDelete").onclick = deleteOpenPhoto;
  $("pmEdit").onclick = editOpenPhoto;
  $("photoModal").onclick = e => { if (e.target.id === "photoModal") closePhoto(); };
  $("viewport").addEventListener("dblclick", () => {
    if (!measure || measure.done) return;
    // Dubbelklicket har redan lagt till samma punkt två gånger.
    const p = measure.pts;
    while (p.length > 1 && Math.hypot(p[p.length - 1][0] - p[p.length - 2][0], p[p.length - 1][1] - p[p.length - 2][1]) < 1e-6) p.pop();
    finishMeasure();
  });
  window.addEventListener("keydown", e => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === "Escape") {
      if (!$("photoModal").classList.contains("hidden")) closePhoto();
      else if (photoPlacing) cancelPhotoPlacing(true); // Esc: hoppa över (nästa foto i kön)
      else if (measure) stopMeasure();
      else if (playTimer) stopPlay();
    } else if (e.key === "Enter" && measure) finishMeasure();
  });
}
