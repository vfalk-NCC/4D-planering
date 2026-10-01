/* Lägesplan – pekstöd och fältläge (Victors önskemål 2026-10-01, iPad).

   1) Pekstöd i planen (gäller alltid, även i den fullständiga vyn):
      - ett finger: samma som musen – dra = panorera (eller flytta det man tagit
        tag i), tryck = klick (välj zon, verktygsklick, kalibrering …)
      - två fingrar: nyp = zooma, dra = panorera
      - långt tryck: samma som högerklick (släck objekt, dölj namn …)
      - tryck på ett objekt/en zon visar informationen (som hovring med mus)
      Ett finger skickas vidare som mushändelser, så all befintlig logik
      (verktyg, flytta etablering, fästpunkter) fungerar likadant.

   2) Fältläge: en förenklad vy med stora knappar för det man gör ute –
      plan, sparad vy, datum, lager, ortofoto, zoom. Menyn döljs; allt styr
      de vanliga kontrollerna, så fältläge och fullständig vy visar alltid
      samma sak. Slås på automatiskt på pekskärmar (iPad), kan alltid växlas. */

/* ---------------------------------------------------------------------
   Pekstöd
   ------------------------------------------------------------------- */
(function bindTouch() {
  const vp = () => $("viewport");
  let one = null;     // { id, x, y, sx, sy, moved, timer, long }
  let pinch = null;   // { d, cx, cy }
  const LONG_MS = 550, SLOP = 8;
  const fire = (type, x, y, target, extra = {}) => {
    const t = target || document.elementFromPoint(x, y) || vp();
    t.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: type === "contextmenu" ? 2 : 0, buttons: type === "mouseup" ? 0 : 1, view: window, ...extra }));
  };
  // Avsluta en pågående musemulering utan att den räknas som ett klick.
  const endOneAsDrag = () => {
    if (!one || one.ended) return;
    one.ended = true;
    clearTimeout(one.timer);
    // Frihand: ett andra finger (zoom) avbryter strecket i stället för att spara en skvätt.
    if (typeof sketchStroke !== "undefined" && sketchStroke) { sketchStroke = null; renderZones(); return; }
    if (!one.moved) {
      // >3 px rörelse gör att mouseup inte räknas som klick; flytta tillbaka direkt.
      const tx = view.tx, ty = view.ty;
      fire("mousemove", one.x + 5, one.y, null);
      fire("mouseup", one.x + 5, one.y, null);
      view.tx = tx; view.ty = ty; applyView();
    } else fire("mouseup", one.x, one.y, null);
  };
  const hideTip = () => { const t = $("tip"); if (t) t.classList.add("hidden"); };
  function onStart(e) {
    if (!e.target.closest || !e.target.closest("#viewport")) return;
    e.preventDefault();
    hideTip();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      one = { id: t.identifier, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, moved: false, ended: false };
      fire("mousedown", t.clientX, t.clientY, t.target);
      // Långt tryck = högerklick, men inte medan man ritar på frihand.
      if (!(typeof sketchActive === "function" && sketchActive())) one.timer = setTimeout(() => {
        if (!one || one.moved || one.ended) return;
        const { x, y } = one;
        endOneAsDrag();
        one.long = true;
        fire("contextmenu", x, y, null);
      }, LONG_MS);
    } else if (e.touches.length === 2) {
      endOneAsDrag();
      const [a, b] = e.touches;
      pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2 };
    }
  }
  function onMove(e) {
    if (!one && !pinch) return;
    e.preventDefault();
    if (pinch && e.touches.length >= 2) {
      const [a, b] = e.touches;
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const cx = (a.clientX + b.clientX) / 2, cy = (a.clientY + b.clientY) / 2;
      const r = vp().getBoundingClientRect();
      // Panorera med mittpunkten, zooma kring den.
      view.tx += cx - pinch.cx; view.ty += cy - pinch.cy;
      if (pinch.d > 0 && d > 0) zoomAt(d / pinch.d, cx - r.left, cy - r.top); else applyView();
      pinch = { d, cx, cy };
      return;
    }
    if (one && !one.ended) {
      const t = [...e.touches].find(x => x.identifier === one.id);
      if (!t) return;
      if (Math.hypot(t.clientX - one.sx, t.clientY - one.sy) > SLOP) { one.moved = true; clearTimeout(one.timer); }
      one.x = t.clientX; one.y = t.clientY;
      fire("mousemove", t.clientX, t.clientY, null);
    }
  }
  function onEnd(e) {
    if (!one && !pinch) return;
    e.preventDefault();
    if (pinch) {
      if (e.touches.length < 2) pinch = null;
      if (!e.touches.length) one = null;
      return;
    }
    if (one && !one.ended) {
      clearTimeout(one.timer);
      const { x, y, moved } = one;
      one.ended = true;
      fire("mouseup", x, y, null);
      // Ett tryck visar informationen om det man tryckte på (som hovring med mus).
      if (!moved && typeof showTip === "function") showTip({ clientX: x, clientY: y, target: document.elementFromPoint(x, y) || vp() });
    }
    if (!e.touches.length) one = null;
  }
  document.addEventListener("DOMContentLoaded", () => {
    const el = vp();
    if (!el) return;
    el.addEventListener("touchstart", onStart, { passive: false });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: false });
    window.addEventListener("touchcancel", onEnd, { passive: false });
    // Safari: hindra att hela sidan zoomas när man nyper i planen.
    ["gesturestart", "gesturechange"].forEach(t => el.addEventListener(t, ev => ev.preventDefault()));
  });
})();

/* ---------------------------------------------------------------------
   Fältläge
   ------------------------------------------------------------------- */
const FIELD_KEY = "lagesplan-field";
function fieldWanted() {
  try {
    const v = localStorage.getItem(FIELD_KEY);
    if (v === "1" || v === "0") return v === "1";
  } catch (e) {}
  if (/[?&]falt=1/.test(location.search)) return true;
  // Pekskärm utan mus (iPad/telefon): fältläge från början.
  return !!(window.matchMedia && matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches);
}
/* Knapparna som "försvann" på iPad: Safari zoomar in hela sidan när man
   trycker i ett litet textfält (t.ex. en noterings text) eller nyper utanför
   planen, och då hamnar knapparna utanför skärmen – och nypa tillbaka gick
   inte, eftersom planen tar hand om nypen. I fältläge: ingen sidzoom, inga
   små textfält (16 px), och sidan rullas tillbaka när tangentbordet stängs. */
const VIEWPORT_META = "width=device-width, initial-scale=1";
function setViewportLock(on) {
  const m = document.querySelector('meta[name="viewport"]');
  if (m) m.setAttribute("content", on ? VIEWPORT_META + ", maximum-scale=1, viewport-fit=cover" : VIEWPORT_META);
}
["gesturestart", "gesturechange", "gestureend"].forEach(t => document.addEventListener(t, e => { if (document.body.classList.contains("field")) e.preventDefault(); }, { passive: false }));
const fieldResetScroll = () => { if (document.body.classList.contains("field") && (window.scrollX || window.scrollY)) window.scrollTo(0, 0); };
document.addEventListener("focusout", () => setTimeout(fieldResetScroll, 60));
window.addEventListener("orientationchange", () => setTimeout(fieldResetScroll, 300));
if (window.visualViewport) window.visualViewport.addEventListener("resize", () => setTimeout(fieldResetScroll, 60));

function setFieldMode(on, save = true) {
  setViewportLock(on);
  document.body.classList.toggle("field", on);
  if (!on) document.body.classList.remove("field-clean");
  if (save) { try { localStorage.setItem(FIELD_KEY, on ? "1" : "0"); } catch (e) {} }
  if (on) renderField(); else closeFieldSheet();
  // Planen ska fylla den nya ytan.
  setTimeout(() => { window.dispatchEvent(new Event("resize")); }, 50);
}
const fieldIsOn = () => document.body.classList.contains("field");
const fesc = t => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const setVal = (id, v) => { const el = $(id); if (!el) return; el.value = v; el.dispatchEvent(new Event("change")); };

/* Verktygsraden och lagerpanelen hamnar under den översta raden (som kan
   bli två rader på en smal/stående skärm). */
function layoutField() {
  const top = $("fieldTop"); if (!top || !fieldIsOn()) return;
  const y = top.offsetTop + top.offsetHeight + 8;
  $("fieldTools").style.top = y + "px";
  $("fieldSheet").style.top = y + "px";
}
window.addEventListener("resize", () => setTimeout(layoutField, 60));
function renderField() {
  if (!fieldIsOn()) return;
  layoutField();
  // Plan
  const ps = $("fieldPlan"), src = $("planSelect");
  ps.innerHTML = src.innerHTML; ps.value = src.value;
  // Vyer
  const vs = $("fieldView"), vsrc = $("lsViewSel");
  if (vsrc) { vs.innerHTML = vsrc.innerHTML; vs.value = vsrc.value; vs.disabled = vsrc.disabled; vs.closest(".fv-wrap").classList.toggle("hidden", vsrc.disabled); }
  // Datum
  const d = $("dateInput").value;
  $("fieldDate").value = d;
  const dt = d ? new Date(d + "T12:00:00") : null;
  $("fieldDateLabel").textContent = dt ? dt.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "–";
  const sl = $("dateSlider"), fsl = $("fieldSlider");
  fsl.min = sl.min; fsl.max = sl.max; fsl.value = sl.value;
  if (!$("fieldSheet").classList.contains("hidden")) renderFieldSheet();
}

function fieldShiftDays(n) {
  const d = new Date(($("dateInput").value || todayIso()) + "T12:00:00");
  d.setDate(d.getDate() + n);
  setVal("dateInput", d.toISOString().slice(0, 10));
  renderField();
}

/* Snabbknappar i fältläge: 💬 notering och ✏️ rita på frihand (Victors
   önskemål 2026-10-01). Använder Lägesplanens vanliga verktyg, så det sparas
   i projektet och syns på datorn (och i utskrifter). */
const SKETCH_COLORS = ["#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#111827"];
function renderFieldTools() {
  if (!$("fieldTools")) return;
  const kind = typeof siteTool !== "undefined" && siteTool ? siteTool.kind : (typeof photoPlacing !== "undefined" && photoPlacing ? "photo" : null);
  $("btnFieldNote").classList.toggle("on", kind === "note");
  $("btnFieldSketch").classList.toggle("on", kind === "sketch");
  $("btnFieldPhoto").classList.toggle("on", kind === "photo");
  const bar = $("fieldTools");
  if (!kind || !fieldIsOn()) { bar.classList.add("hidden"); return; }
  if (kind === "photo") {
    const g = typeof gpsSuggest !== "undefined" ? gpsSuggest : null;
    bar.innerHTML = g
      ? `<span class="ft-hint">📍 Enligt GPS (${fesc(g.src)}, ±${Math.round(g.acc || 0)} m). Tryck på planen för att flytta.</span><button type="button" class="fl-btn fl-primary" id="btnFieldPhotoHere">Spara här</button><button type="button" class="fl-btn" id="btnFieldToolDone">Avbryt</button>`
      : `<span class="ft-hint">📷 Tryck på planen där fotot är taget.</span><button type="button" class="fl-btn" id="btnFieldToolDone">Avbryt</button>`;
    bar.classList.remove("hidden"); layoutField();
    const here = $("btnFieldPhotoHere"); if (here) here.onclick = () => savePhotoAtGps();
    $("btnFieldToolDone").onclick = () => { if (typeof photoQueue !== "undefined") photoQueue = []; cancelPhotoPlacing(); };
    return;
  }
  const hint = ($("siteHint") && $("siteHint").textContent || "").replace(/ Håll Shift.*$/, "").replace(/ Esc avbryter\.?/, "");
  bar.innerHTML = `<span class="ft-hint">${fesc(hint)}</span>
    ${kind === "sketch" ? `<span class="ft-colors">${SKETCH_COLORS.map(c => `<button type="button" class="ft-color${c === sketchColor ? " on" : ""}" data-c="${c}" style="background:${c}" title="Färg"></button>`).join("")}</span>
      <button type="button" class="fl-btn ft-w" data-w="${sketchWeight >= 1.8 ? 1 : 1.8}" title="Tjocklek">${sketchWeight >= 1.8 ? "Tunn" : "Tjock"}</button>` : ""}
    ${kind === "sketch" ? `<button type="button" class="fl-btn" id="btnFieldSketchView" title="Spara det som visas nu (med det du ritat) som en vy">💾 Spara vy</button>` : ""}
    <button type="button" class="fl-btn fl-primary" id="btnFieldToolDone">${kind === "sketch" ? "Klar" : "Avbryt"}</button>`;
  bar.classList.remove("hidden");
  layoutField();
  bar.querySelectorAll(".ft-color").forEach(b => b.onclick = () => { sketchColor = b.dataset.c; renderFieldTools(); });
  const w = bar.querySelector(".ft-w"); if (w) w.onclick = () => { sketchWeight = Number(w.dataset.w); renderFieldTools(); };
  $("btnFieldToolDone").onclick = () => stopSiteTool();
  const sv = $("btnFieldSketchView"); if (sv) sv.onclick = () => openFieldSaveView();
}

/* 💾 Spara vy i fältläget: namn + (förvalt) datum och utsnitt. Samma vyer
   som i Lager på datorn – och det man ritat/noterat är redan sparat i
   projektet, så vyn tar en tillbaka till exakt det läget. */
function openFieldSaveView() {
  openFieldSheet();
  const box = $("fieldSheetBody");
  const cur = (typeof lsViews === "function" ? lsViews() : []).find(v => typeof lsViewCurrent !== "undefined" && v.id === lsViewCurrent);
  const def = cur ? cur.name : `Fält ${new Date().toLocaleDateString("sv-SE")}`;
  const form = document.createElement("div");
  form.className = "fs-save";
  form.innerHTML = `<div class="fs-h">Spara vy</div>
    <input type="text" id="fsViewName" value="${fesc(def)}" />
    <label class="fs-chk"><input type="checkbox" id="fsViewDate" checked /> Med datumet (${fesc($("dateInput").value || "")})</label>
    <label class="fs-chk"><input type="checkbox" id="fsViewCam" checked /> Med utsnittet (zoom och läge)</label>
    <button type="button" class="fl-btn fl-primary" id="fsViewSave">💾 Spara vy</button>
    <div class="fs-msg" id="fsViewMsg">Samma namn skriver över. Vyn syns också i Lager på datorn.</div>`;
  box.prepend(form);
  $("fsViewSave").onclick = async () => {
    const n = $("fsViewName").value.trim();
    if (!n) { $("fsViewName").focus(); return; }
    $("fsViewSave").disabled = true;
    try {
      await saveLsView(n, { date: $("fsViewDate").checked, camera: $("fsViewCam").checked });
      renderField(); renderFieldSheet();
      const m = document.createElement("div"); m.className = "fs-msg fs-ok"; m.textContent = `✓ Vyn "${n}" är sparad.`;
      $("fieldSheetBody").prepend(m);
    } catch (e) { $("fsViewMsg").textContent = "Kunde inte spara: " + e.message; $("fsViewSave").disabled = false; }
  };
}

/* Lagerpanelen i fältläge: stora av/på-knappar som styr de vanliga raderna. */
function fieldRowToggle(key) { return document.querySelector(`#layerList .layer-row[data-layer="${CSS.escape(key)}"] .lr-vis`); }
function renderFieldSheet() {
  const box = $("fieldSheetBody");
  const rows = [...document.querySelectorAll("#layerList .layer-row[data-layer]")]
    .map(r => ({ key: r.dataset.layer, label: (r.querySelector(".ln").textContent || "").replace(/\s+/g, " ").trim(), on: r.querySelector(".lr-vis").checked }));
  const base = rows.filter(r => ["pdf", "zones", "objects", "photos"].includes(r.key) || r.key.startsWith("ul:"));
  const cad = rows.filter(r => r.key.startsWith("cad:"));
  const ortho = rows.filter(r => r.key.startsWith("ortho:"));
  const btn = (r, extra = "") => `<button type="button" class="fs-tog${r.on ? " on" : ""}" data-key="${fesc(r.key)}"${extra}><span class="fs-dot"></span><span class="fs-lbl">${fesc(r.label)}</span></button>`;
  const labelsOn = $("objLabels") && $("objLabels").checked;
  const orthoOn = ortho.some(r => r.on);
  const views = typeof lsViews === "function" ? lsViews() : [];
  const cur = typeof lsViewCurrent !== "undefined" ? lsViewCurrent : null;
  const cadOpen = box.dataset.cadOpen === "1";
  box.innerHTML = `
    ${views.length ? `<div class="fs-h">Sparade vyer</div><div class="fs-grid">${views.map(v => `<button type="button" class="fs-view${v.id === cur ? " on" : ""}" data-view="${fesc(v.id)}">📑 ${fesc(v.name)}</button>`).join("")}</div>` : ""}
    <div class="fs-h">Visa</div>
    <div class="fs-grid">${base.map(r => btn(r)).join("")}
      <button type="button" class="fs-tog${labelsOn ? " on" : ""}" data-labels="1"><span class="fs-dot"></span><span class="fs-lbl">🏷 Namn på objekten</span></button>
    </div>
    ${ortho.length ? `<div class="fs-h">Ortofoto</div>
      <div class="fs-ortho">
        <button type="button" class="fs-tog${orthoOn ? " on" : ""}" data-ortho="toggle"><span class="fs-dot"></span><span class="fs-lbl">🛰 Visa</span></button>
        <button type="button" class="fs-big" data-ortho="prev" title="Äldre">◀</button>
        <span class="fs-oname">${fesc(($("orthoNavLabel") && $("orthoNavLabel").textContent) || (ortho.find(r => r.on) || {}).label || "")}</span>
        <button type="button" class="fs-big" data-ortho="next" title="Nyare">▶</button>
      </div>` : ""}
    ${cad.length ? `<div class="fs-h fs-h-row"><span>DXF-ritningar (${cad.length})</span><span><button type="button" class="fs-mini" data-cadall="1">Alla på</button><button type="button" class="fs-mini" data-cadall="0">Alla av</button><button type="button" class="fs-mini" data-cadopen="1">${cadOpen ? "Dölj ▴" : "Visa ▾"}</button></span></div>
      ${cadOpen ? `<div class="fs-grid">${cad.map(r => btn(r)).join("")}</div>` : ""}` : ""}`;
  box.querySelectorAll("[data-key]").forEach(b => b.onclick = () => {
    const c = fieldRowToggle(b.dataset.key);
    if (!c) return;
    c.checked = !c.checked; c.dispatchEvent(new Event("change"));
    setTimeout(renderFieldSheet, 30);
  });
  const lb = box.querySelector("[data-labels]");
  if (lb) lb.onclick = () => { const c = $("objLabels"); c.checked = !c.checked; c.dispatchEvent(new Event("change")); setTimeout(renderFieldSheet, 30); };
  box.querySelectorAll("[data-view]").forEach(b => b.onclick = () => { setVal("lsViewSel", b.dataset.view); setTimeout(() => { renderField(); renderFieldSheet(); }, 60); });
  box.querySelectorAll("[data-ortho]").forEach(b => b.onclick = () => {
    const a = b.dataset.ortho;
    if (a === "prev") $("btnOrthoPrev").click();
    else if (a === "next") $("btnOrthoNext").click();
    else if (orthoOn) ortho.filter(r => r.on).forEach(r => { const c = fieldRowToggle(r.key); c.checked = false; c.dispatchEvent(new Event("change")); });
    else { const c = fieldRowToggle(ortho[0].key); c.checked = true; c.dispatchEvent(new Event("change")); }
    setTimeout(renderFieldSheet, 60);
  });
  box.querySelectorAll("[data-cadall]").forEach(b => b.onclick = () => {
    const on = b.dataset.cadall === "1";
    cad.forEach(r => { if (r.on !== on) { const c = fieldRowToggle(r.key); c.checked = on; c.dispatchEvent(new Event("change")); } });
    setTimeout(renderFieldSheet, 60);
  });
  const co = box.querySelector("[data-cadopen]");
  if (co) co.onclick = () => { box.dataset.cadOpen = cadOpen ? "0" : "1"; renderFieldSheet(); };
}
function openFieldSheet() { $("fieldSheet").classList.remove("hidden"); $("btnFieldLayers").classList.add("on"); renderFieldSheet(); }
function closeFieldSheet() { const s = $("fieldSheet"); if (s) s.classList.add("hidden"); const b = $("btnFieldLayers"); if (b) b.classList.remove("on"); }

document.addEventListener("DOMContentLoaded", () => {
  if (!$("fieldTop")) return;
  $("fieldPlan").onchange = e => setVal("planSelect", e.target.value);
  $("fieldView").onchange = e => { setVal("lsViewSel", e.target.value); setTimeout(renderField, 60); };
  $("btnFieldPrevW").onclick = () => fieldShiftDays(-7);
  $("btnFieldNextW").onclick = () => fieldShiftDays(7);
  $("btnFieldToday").onclick = () => { $("btnToday").click(); renderField(); };
  $("fieldDate").onchange = e => { if (e.target.value) { setVal("dateInput", e.target.value); renderField(); } };
  $("fieldDateLabel").onclick = () => { const i = $("fieldDate"); if (i.showPicker) { try { i.showPicker(); return; } catch (e) {} } i.focus(); i.click(); };
  $("fieldSlider").oninput = e => { const s = $("dateSlider"); s.value = e.target.value; s.dispatchEvent(new Event("input")); renderField(); };
  $("btnFieldLayers").onclick = () => ($("fieldSheet").classList.contains("hidden") ? openFieldSheet() : closeFieldSheet());
  $("btnFieldSheetClose").onclick = closeFieldSheet;
  $("btnFieldFull").onclick = () => setFieldMode(false);
  $("btnFieldNote").onclick = () => { closeFieldSheet(); startSiteTool("note"); };
  $("btnFieldSketch").onclick = () => { closeFieldSheet(); startSiteTool("sketch"); };
  $("btnFieldPhoto").onclick = () => { closeFieldSheet(); if (typeof stopSiteTool === "function" && siteTool) stopSiteTool(); startGpsPhoto(); };
  $("btnFieldView").onclick = () => openFieldSaveView();
  const origToolUi = updateToolUi;
  updateToolUi = function () { const r = origToolUi.apply(this, arguments); renderFieldTools(); return r; };
  const origUi = updateSiteUi;
  updateSiteUi = function () { const r = origUi.apply(this, arguments); renderFieldTools(); return r; };
  // Dölj alla knappar (bara planen syns); 👁 i hörnet tar tillbaka dem.
  $("btnFieldHide").onclick = () => { closeFieldSheet(); document.body.classList.add("field-clean"); };
  $("btnFieldShow").onclick = () => { document.body.classList.remove("field-clean"); renderField(); };
  $("btnFieldMode").onclick = () => setFieldMode(true);
  // Håll fältläget i takt med allt som ändras (data laddas, plan byts, datum …).
  const orig = renderLayerPanel;
  renderLayerPanel = function () { const r = orig.apply(this, arguments); renderField(); return r; };
  ["dateInput", "planSelect"].forEach(id => $(id).addEventListener("change", () => setTimeout(renderField, 0)));
  $("dateSlider").addEventListener("input", () => renderField());
  if (fieldWanted()) setFieldMode(true, false);
});
