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
      const [ux, uy] = typeof unrotVec === "function" ? unrotVec([cx - pinch.cx, cy - pinch.cy]) : [cx - pinch.cx, cy - pinch.cy];
      view.tx += ux; view.ty += uy;
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
/* iPhone (Victors önskemål 2026-10-03): som Apple Kartor (iOS 26).
   Ett flytande glaskort nertill med tre lägen – bara sökfältet (planen),
   mellan och stort – som följer fingret och fjädrar till närmaste läge.
   Uppdraget visar Verktyg som stora färgade runda ikoner, Sparade vyer som
   en lista och sist Datum (med tidsreglaget). Lager och min position sitter i en
   kapsel till höger, Anpassa och Ångra till vänster, datumet som en bricka
   uppe till vänster. Glaset blir mörkt över ortofoto och ljust annars.
   Knapparna flyttas hit på liten skärm och tillbaka på större. */
const AP_SVG = (p, w) => `<svg viewBox="0 0 24 24"${w ? ` width="${w}" height="${w}"` : ""} fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const AP_ICONS = {
  btnFieldDay: ["Dag", "Lag och leveranser", "linear-gradient(160deg,#5be37a,#1fa344)", '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c2.4-.3 4.4 1.2 5 4.8"/>'],
  btnFieldLayers: ["Lager", "Visa och dölj", "linear-gradient(160deg,#6ac4ff,#0a6cff)", '<path d="M12 3 3 7.5l9 4.5 9-4.5L12 3z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>'],
  btnFieldNote: ["Notering", "Pil och text", "linear-gradient(160deg,#ffd84d,#ff9f0a)", '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5v-8z"/><path d="M8 8h8M8 11.5h5"/>'],
  btnFieldPhoto: ["Foto", "Placeras med GPS", "linear-gradient(160deg,#9aa0a8,#5a6069)", '<path d="M4 8.5A2 2 0 0 1 6 6.5h2l1.4-2h5.2l1.4 2h2a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8.5z"/><circle cx="12" cy="12.6" r="3.4"/>'],
  btnFieldPins: ["Fotonålar", "Visa och dölj", "linear-gradient(160deg,#ff6f91,#e11d48)", '<path d="M12 21.5s-6.5-5.7-6.5-11.2a6.5 6.5 0 0 1 13 0c0 5.5-6.5 11.2-6.5 11.2z"/><circle cx="12" cy="10.2" r="2.5"/>'],
  btnFieldSketch: ["Rita", "På frihand", "linear-gradient(160deg,#ff8a5c,#ff3b30)", '<path d="M15.5 4.5 19.5 8.5 9 19H5v-4L15.5 4.5z"/><path d="m13.5 6.5 4 4"/>'],
  btnFieldView: ["Spara vy", "Det som visas", "linear-gradient(160deg,#d68bff,#8e44d6)", '<path d="M7 3.5h10a1 1 0 0 1 1 1V21l-6-4-6 4V4.5a1 1 0 0 1 1-1z"/>'],
  btnFieldHide: ["Dölj", "Bara kartan", "linear-gradient(160deg,#b8bcc4,#7d828b)", '<path d="M3 3l18 18"/><path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 8.5 4.3 9.5 6-.5.9-1.6 2.4-3.1 3.7M6.6 7.6C4.6 9 3.2 10.9 2.5 12c1 1.7 4.5 6 9.5 6 1.6 0 3-.4 4.3-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'],
  btnFieldPrevW: ["", "", "", '<path d="m15 5-7 7 7 7"/>'],
  btnFieldNextW: ["", "", "", '<path d="m9 5 7 7-7 7"/>'],
  btnFit: ["", "", "", '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'],
  btnFieldUndo: ["", "", "", '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'],
  btnFieldRedo: ["", "", "", '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'],
};
const AP_TILES = ["btnFieldDay", "btnFieldLayers", "btnFieldNote", "btnFieldPhoto", "btnFieldPins", "btnFieldSketch", "btnFieldView", "btnFieldHide"];
const gmHome = new Map(); // element -> platshållare där det låg
function gmMove(el, parent) {
  if (!el || !parent || el.parentNode === parent) return;
  if (!gmHome.has(el)) { const ph = document.createComment("ap:" + (el.id || "")); el.parentNode.insertBefore(ph, el); gmHome.set(el, ph); }
  parent.appendChild(el);
}
function apDecorate(el, on) {
  if (!el) return;
  el.querySelectorAll(":scope > .ap-ic, :scope > .ap-lb, :scope > .ap-sub").forEach(x => x.remove());
  el.classList.remove("ap-tile"); el.style.removeProperty("--c");
  if (el.dataset.apAria !== undefined) { if (el.dataset.apAria) el.setAttribute("aria-label", el.dataset.apAria); else el.removeAttribute("aria-label"); delete el.dataset.apAria; }
  if (!on) return;
  const [lb, sub, c, path] = AP_ICONS[el.id] || ["", "", "", ""];
  const ic = document.createElement("span"); ic.className = "ap-ic"; ic.innerHTML = AP_SVG(path); el.appendChild(ic);
  if (AP_TILES.includes(el.id)) {
    el.classList.add("ap-tile"); if (c) el.style.setProperty("--c", c);
    el.dataset.apAria = el.getAttribute("aria-label") || ""; el.setAttribute("aria-label", lb);
    const l = document.createElement("span"); l.className = "ap-lb"; l.textContent = lb; el.appendChild(l);
    const t = document.createElement("span"); t.className = "ap-sub"; t.textContent = sub; el.appendChild(t);
  }
}
/* Kortets lägen: 0 = bara sökfältet, 1 = mellan, 2 = stort. */
let apDetent = 0;
const apHeights = () => {
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  // Mellanläget visar datum och hela verktygsraden (som Kartors "Platser"), men aldrig mer än skärmen tillåter.
  let want = vh * .5;
  const sh = $("apSheet"), tools = sh && sh.querySelector(".ap-tools"), body = sh && sh.querySelector(".ap-body");
  if (tools && body && tools.offsetHeight) want = tools.getBoundingClientRect().bottom - sh.getBoundingClientRect().top + body.scrollTop + 6;
  return [60, Math.round(Math.min(Math.max(want, 160), vh - 140)), Math.round(vh - 70)];
};
function apSetHeight(h) { document.body.style.setProperty("--ap-sheet-h", Math.round(h) + "px"); }
function apSetDetent(n, anim = true) {
  apDetent = Math.max(0, Math.min(2, n));
  const sh = $("apSheet");
  if (sh) sh.classList.toggle("dragging", !anim);
  document.body.classList.remove("ap-d0", "ap-d1", "ap-d2"); document.body.classList.add("ap-d" + apDetent);
  apSetHeight(apHeights()[apDetent]);
  if (apDetent === 0 && sh) sh.querySelector(".ap-body").scrollTop = 0;
  if (apDetent > 0) apRenderViews();
}
function apSheetOpen(on) { apSetDetent(on ? 1 : 0); }
/* Anpassa på telefon: planen centreras mellan datumbrickan och det ihopfällda kortet. */
function fitInsets(vp) {
  if (!document.body.classList.contains("phone") || !document.body.classList.contains("field")) return null;
  const chip = $("apDateChip"), sh = $("apSheet");
  // Liggande: kortet ligger till vänster – planen centreras i ytan till höger om det.
  if (sh && window.innerWidth > window.innerHeight && !document.body.classList.contains("ap-wide")) return { top: 0, bottom: 0, left: Math.max(0, sh.getBoundingClientRect().right + 8 - vp.left) };
  const top = chip && getComputedStyle(chip).display !== "none" ? Math.max(0, chip.getBoundingClientRect().bottom + 8 - vp.top) : 0;
  const sheetTop = sh ? vp.bottom - (parseFloat(getComputedStyle(sh).bottom) || 0) - apHeights()[0] : vp.bottom;
  return { top, bottom: Math.max(0, vp.bottom - sheetTop + 8) };
}
/* Sparade vyer som lista (från fältlägets vyval). */
function apRenderViews() {
  const box = document.querySelector("#apSheet .ap-list"), vs = $("fieldView");
  if (!box || !vs) return;
  const opts = [...vs.options].filter(o => o.value);
  box.parentNode.querySelector(".ap-empty").classList.toggle("hidden", opts.length > 0);
  box.classList.toggle("hidden", !opts.length);
  box.innerHTML = opts.map(o => `<button type="button" class="ap-item${o.value === vs.value ? " on" : ""}" data-v="${fesc(o.value)}"><span class="ap-iic">${AP_SVG(AP_ICONS.btnFieldView[3])}</span><span class="ap-it"><b>${fesc(o.textContent.replace(/^📑\s*/, ""))}</b><span>${o.value === vs.value ? "Visas nu" : "Sparad vy"}</span></span>${AP_SVG('<path d="m9 5 7 7-7 7"/>', 16)}</button>`).join("");
  box.querySelectorAll("[data-v]").forEach(b => b.onclick = () => { vs.value = b.dataset.v; vs.dispatchEvent(new Event("change")); setTimeout(() => apSetDetent(0), 120); });
}
function apSliderFill() {
  const sl = $("fieldSlider");
  if (!sl) return;
  const pct = ((Number(sl.value) - Number(sl.min || 0)) / ((Number(sl.max || 100) - Number(sl.min || 0)) || 1)) * 100;
  sl.style.setProperty("--ap-pct", pct + "%");
}
/* Mörkt glas över ortofoto (som satellitläget), annars ljust. */
function apTheme() {
  let dark = false;
  try { dark = typeof orthos === "function" && orthos().some(o => ls("ortho:" + o.id).visible); } catch (e) {}
  document.body.classList.toggle("ap-dark", dark);
}
/* iPad (Victors önskemål 2026-10-03): samma Apple Kartor-design som på iPhone på alla pekskärmar
   utan mus. På större skärm ("ap-wide") ligger kortet som ett flytande kort till vänster, som i
   Kartor på iPad, och Dag, Lager och noteringar öppnas på samma plats. */
const touchOnly = () => !!(window.matchMedia && matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches);
function updatePhoneLayout() {
  const small = Math.min(window.innerWidth, window.innerHeight) < 600, phone = small || touchOnly();
  document.body.classList.toggle("phone", phone);
  document.body.classList.toggle("ap-wide", phone && !small);
  const sheet = $("apSheet");
  if (!sheet) return;
  const q = c => sheet.querySelector(c);
  if (phone) {
    gmMove($("fieldPlan"), q(".ap-search"));
    ["btnFieldPrevW", "fieldDateLabel", "btnFieldNextW", "btnFieldToday"].forEach(id => gmMove($(id), q(".ap-date")));
    gmMove($("fieldSlider"), q(".ap-datecard"));
    AP_TILES.forEach(id => gmMove($(id), q(".ap-tools")));
    gmMove($("btnFieldGps"), $("apCtl"));
    gmMove($("btnFit"), $("apFitWrap"));
    gmMove($("btnFieldUndo"), $("apUndo")); gmMove($("btnFieldRedo"), $("apUndo"));
    Object.keys(AP_ICONS).forEach(id => apDecorate($(id), true));
    const av = $("apAvatar"), name = (typeof settings !== "undefined" && settings.userName) || "";
    const ini = name.split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
    if (av) { if (ini) av.textContent = ini; else av.innerHTML = AP_SVG('<path d="M4 7h16M4 12h16M4 17h16"/>'); }
    apSetDetent(apDetent, false);
    apTheme();
  } else {
    gmHome.forEach((ph, el) => { if (ph.parentNode) ph.parentNode.insertBefore(el, ph); });
    Object.keys(AP_ICONS).forEach(id => apDecorate($(id), false));
    document.body.classList.remove("ap-d0", "ap-d1", "ap-d2");
  }
  apSliderFill();
  if (typeof updateGpsBtn === "function") updateGpsBtn();
}
window.addEventListener("resize", () => updatePhoneLayout());
if (window.visualViewport) window.visualViewport.addEventListener("resize", () => { if (document.body.classList.contains("phone")) apSetDetent(apDetent, false); });
window.addEventListener("orientationchange", () => setTimeout(updatePhoneLayout, 250));
window.addEventListener("pageshow", () => updatePhoneLayout());
document.addEventListener("DOMContentLoaded", () => {
  if (!$("apSheet")) {
    const mk = (id, cls, html) => { const el = document.createElement("div"); el.id = id; el.className = "ap-ui " + cls; el.innerHTML = html; document.body.appendChild(el); return el; };
    // Kontroller först (hamnar bakom kortet), sedan kortet.
    mk("apCtl", "ap-glass ap-float", `<button type="button" id="apLayers" title="Lager, ortofoto och DXF">${AP_SVG(AP_ICONS.btnFieldLayers[3])}</button>`);
    mk("apLeft", "ap-float", `<div id="apUndo" class="ap-glass"></div><div id="apFitWrap" class="ap-glass ap-round"></div>`);
    $("apLeft").style.display = ""; // flex via .ap-ui
    const chip = document.createElement("button"); chip.type = "button"; chip.id = "apDateChip"; chip.className = "ap-ui ap-glass";
    chip.innerHTML = `${AP_SVG('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>')}<span></span>`;
    document.body.appendChild(chip);
    const sheet = mk("apSheet", "ap-glass", `
      <div class="ap-head"><div class="ap-searchrow">
        <label class="ap-search">${AP_SVG('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>', 20)}</label>
        <button type="button" class="ap-avatar" id="apAvatar" title="Fullständig vy med alla verktyg">☰</button>
      </div></div>
      <div class="ap-body">
        <div class="ap-sec">Verktyg ${AP_SVG('<path d="m9 5 7 7-7 7"/>')}</div>
        <div class="ap-tools"></div>
        <div class="ap-sec">Sparade vyer</div>
        <div class="ap-list"></div><div class="ap-empty hidden">Inga sparade vyer än. Tryck på Spara vy för att spara det som visas.</div>
        <div class="ap-sec">Datum</div>
        <div class="ap-datecard"><div class="ap-date"></div></div>
      </div>`);
    $("apAvatar").onclick = () => $("btnFieldFull").click();
    $("apLayers").onclick = () => $("btnFieldLayers").click();
    chip.onclick = () => { apSetDetent(Math.max(1, apDetent)); };
    // Datumbrickan följer datumet.
    const dl = $("fieldDateLabel");
    const syncChip = () => { chip.querySelector("span").textContent = (dl.textContent || "").replace(/\s*\d{4}$/, "").replace(/\.$/, ""); };
    new MutationObserver(syncChip).observe(dl, { childList: true, characterData: true, subtree: true }); syncChip();
    new MutationObserver(() => { if (apDetent > 0) apRenderViews(); }).observe($("fieldView"), { childList: true });
    // Dra i kortets topp: följer fingret, fjädrar till närmaste läge (med fart).
    const head = sheet.querySelector(".ap-head"), body = sheet.querySelector(".ap-body");
    let drag = null;
    const start = (y, t) => { drag = { y0: y, h0: apHeights()[apDetent], t0: t, y: y, t: t, v: 0, moved: false }; sheet.classList.add("dragging"); };
    const move = (y, t) => {
      if (!drag) return;
      const dt = Math.max(1, t - drag.t); drag.v = (y - drag.y) / dt; drag.y = y; drag.t = t;
      const H = apHeights(), dy = y - drag.y0; if (Math.abs(dy) > 4) drag.moved = true;
      let h = drag.h0 - dy;
      if (h > H[2]) h = H[2] + (h - H[2]) * .25; if (h < H[0]) h = H[0] - (H[0] - h) * .25;
      apSetHeight(h);
      document.body.classList.toggle("ap-d1", h > H[0] + 30); document.body.classList.toggle("ap-d0", h <= H[0] + 30);
    };
    const end = () => {
      if (!drag) return;
      const d = drag; drag = null; sheet.classList.remove("dragging");
      if (!d.moved) { apSetDetent(apDetent === 0 ? 1 : 0); return; }
      const H = apHeights(), cur = parseFloat(getComputedStyle(document.body).getPropertyValue("--ap-sheet-h")) || H[apDetent];
      const v = performance.now() - d.t > 90 ? 0 : d.v; // fingret vilade före släpp: ingen kastfart
      const proj = cur - v * 180; // fart: kasta upp/ner
      let best = 0; H.forEach((h, i) => { if (Math.abs(h - proj) < Math.abs(H[best] - proj)) best = i; });
      apSetDetent(best);
    };
    head.addEventListener("pointerdown", e => { if (e.target.closest("select, button, input")) return; e.preventDefault(); head.setPointerCapture && head.setPointerCapture(e.pointerId); start(e.clientY, e.timeStamp); });
    head.addEventListener("pointermove", e => { if (drag) { e.preventDefault(); move(e.clientY, e.timeStamp); } });
    head.addEventListener("pointerup", end); head.addEventListener("pointercancel", end);
    // Innehållet: dra nedåt när det är scrollat högst upp fäller ihop kortet (som i iOS).
    let tb = null;
    body.addEventListener("touchstart", e => { tb = { y: e.touches[0].clientY, top: body.scrollTop <= 0, on: false }; }, { passive: true });
    body.addEventListener("touchmove", e => {
      if (!tb) return;
      const y = e.touches[0].clientY;
      if (!tb.on && tb.top && y - tb.y > 6 && body.scrollTop <= 0) { tb.on = true; start(tb.y, e.timeStamp); }
      if (tb.on) { e.preventDefault(); move(y, e.timeStamp); }
    }, { passive: false });
    body.addEventListener("touchend", () => { if (tb && tb.on) end(); tb = null; });
    // Ett verktyg fäller ihop kortet så att kartan syns.
    sheet.querySelector(".ap-tools").addEventListener("click", () => setTimeout(() => apSetDetent(0), 120));
    $("fieldSlider").addEventListener("input", apSliderFill);
    setInterval(() => { if (document.body.classList.contains("phone")) { apSliderFill(); apTheme(); } }, 700);
  }
  updatePhoneLayout();
});
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
function updatePinsBtn() {
  const b = $("btnFieldPins"), on = !!($("showPhotos") && $("showPhotos").checked);
  if (!b) return;
  b.classList.toggle("on", on); b.classList.toggle("pins-off", !on);
  b.title = on ? "Dölj fotonålarna på planen" : "Visa fotonålarna på planen";
  b.setAttribute("aria-pressed", String(on));
}
function renderField() {
  if (!fieldIsOn()) return;
  updatePinsBtn();
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
  updateFieldUndo();
}

/* ↶ / ↷ i fältläget (Victors önskemål 2026-10-01): samma som Ctrl+Z / Ctrl+Y –
   ångrar det senaste (en släckning av 3D-objekt eller en ändring i
   etablering, noteringar, frihand, lag m.m.). */
function fieldCanUndo() { return (typeof lastUndoTarget !== "undefined" && lastUndoTarget === "obj" && objHideUndo.length) || (typeof lastUndoTarget !== "undefined" && lastUndoTarget === "zone" && typeof zoneUndoStack !== "undefined" && zoneUndoStack.length) || siteUndo.length; }
function fieldUndo() {
  if (typeof lastUndoTarget !== "undefined" && lastUndoTarget === "zone" && typeof zoneUndo === "function" && zoneUndo()) { updateFieldUndo(); return; }
  if (typeof lastUndoTarget !== "undefined" && lastUndoTarget === "obj" && typeof undoObjHide === "function" && undoObjHide()) { updateFieldUndo(); return; }
  if (siteUndo.length) undoSite().then(updateFieldUndo);
}
function fieldRedo() { if (siteRedo.length) redoSite().then(updateFieldUndo); }
function updateFieldUndo() {
  const u = $("btnFieldUndo"), r = $("btnFieldRedo");
  if (!u) return;
  u.disabled = !fieldCanUndo();
  const obj = typeof lastUndoTarget !== "undefined" && lastUndoTarget === "obj" && objHideUndo.length;
  u.title = obj ? "Ångra: släckning av 3D-objekt" : siteUndo.length ? `Ångra: ${siteUndo[siteUndo.length - 1].label}` : "Inget att ångra";
  r.disabled = !siteRedo.length;
  r.title = siteRedo.length ? `Gör om: ${siteRedo[siteRedo.length - 1].label}` : "Inget att göra om";
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
  // iPhone: en kompakt glaskapsel – färgprickar och ikoner, ingen lång hjälptext.
  if (document.body.classList.contains("phone")) {
    const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
    bar.innerHTML = kind === "sketch"
      ? `<span class="ft-colors">${SKETCH_COLORS.map(c => `<button type="button" class="ft-color${c === sketchColor ? " on" : ""}" data-c="${c}" style="background:${c}" aria-label="Färg"></button>`).join("")}</span>
        <button type="button" class="fl-btn ft-w ft-ico" data-w="${sketchWeight >= 1.8 ? 1 : 1.8}" title="${sketchWeight >= 1.8 ? "Tjock – tryck för tunn" : "Tunn – tryck för tjock"}">${svg(`<path d="M5 12h14" stroke-width="${sketchWeight >= 1.8 ? 5 : 2}"/>`)}</button>
        <button type="button" class="fl-btn ft-ico" id="btnFieldSketchView" title="Spara det som visas som en vy">${svg('<path d="M7 3.5h10a1 1 0 0 1 1 1V21l-6-4-6 4V4.5a1 1 0 0 1 1-1z" stroke-width="1.9"/>')}</button>
        <button type="button" class="fl-btn fl-primary" id="btnFieldToolDone">Klar</button>`
      : `<span class="ft-hint">${fesc(hint.split(/(?<=\.)\s/)[0])}</span><button type="button" class="fl-btn fl-primary" id="btnFieldToolDone">Avbryt</button>`;
  } else bar.innerHTML = `<span class="ft-hint">${fesc(hint)}</span>
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
/* Lager på iPhone (Victors önskemål 2026-10-03): sparade vyer som rullgardin med ＋ för ny vy och
   samma träd som lagerpanelen – mappar, lager och DXF-filer med egen strömbrytare, och ▸ fäller ut
   så att varje zon, aktivitet och DXF-lager kan tändas och släckas för sig. Allt styr de vanliga
   kontrollerna i lagerpanelen (klick på dem), så beteendet är detsamma som på datorn. */
const fpOpen = new Set();
function fpTree() {
  const out = [], orthoKids = [];
  let folder = null, last = null;
  const clean = ln => { const c = ln.cloneNode(true); c.querySelectorAll("button, small, input, label, .cad-date").forEach(x => x.remove()); return c.textContent.replace(/\s+/g, " ").trim().replace(/^[^\p{L}\p{N}]+/u, ""); }; // utan pilar och emojier
  const count = ln => { const sm = ln.querySelector(":scope > small"); return sm && /^\d+/.test(sm.textContent.trim()) ? sm.textContent.trim().match(/^\d+/)[0] : ""; };
  [...(($("layerList") || {}).children || [])].forEach(r => {
    const ln = r.querySelector(".ln"); if (!ln) return;
    if (r.classList.contains("folder-row")) {
      const vis = r.querySelector(".fr-vis");
      folder = { id: "f:" + r.dataset.folder, label: clean(ln), count: count(ln), on: vis.checked, mixed: vis.dataset.mixed === "1", el: vis, kids: [], folder: true };
      out.push(folder); last = null; return;
    }
    if (!r.classList.contains("sub")) {
      const key = r.dataset.layer || "";
      if (!r.classList.contains("in-folder")) folder = null;
      // Ortofoton i en egen mapp visas bara där; övriga samlas under 🛰 Ortofoto.
      if (key.startsWith("ortho:")) { const v = r.querySelector(".lr-vis"), o = { id: key, label: clean(ln), on: !!(v && v.checked), el: v }; (folder ? folder.kids : orthoKids).push(o); last = null; return; }
      const vis = r.querySelector(".lr-vis");
      last = { id: key, label: clean(ln), count: count(ln), on: !!(vis && vis.checked), el: vis, kids: [] };
      (folder ? folder.kids : out).push(last); return;
    }
    if (!last) return;
    // Fotonas datummappar: en egen nivå under Foton med fotona i.
    if (r.classList.contains("photo-day-row")) { const v = r.querySelector(".pd-vis"); last.kids.push({ id: last.id + "|d:" + r.dataset.phday, label: clean(ln), count: count(ln), on: v.checked, el: v, kids: [] }); return; }
    const host = r.classList.contains("photo-in-day") && last.kids.length && last.kids[last.kids.length - 1].kids ? last.kids[last.kids.length - 1] : last;
    const cb = r.querySelector(".zl-vis, .lr-vis"), eye = r.querySelector(".oi-eye");
    host.kids.push({ id: host.id + "|" + (r.dataset.zone || r.dataset.item || r.dataset.layer || host.kids.length), label: clean(ln), on: cb ? cb.checked : eye ? !r.classList.contains("off") : null, el: cb || eye, show: ln });
  });
  // Ortofoton som en egen gren (Victors önskemål 2026-10-04): fäll ut för att tända och släcka varje foto.
  if (orthoKids.length) {
    const nOn = orthoKids.filter(k => k.on).length;
    out.push({ id: "__ortho", label: "Ortofoto", count: String(orthoKids.length), on: nOn > 0, mixed: nOn > 0 && nOn < orthoKids.length, kids: orthoKids,
      act: () => { if (nOn) orthoKids.filter(k => k.on).forEach(k => k.el.click()); else orthoKids[0].el.click(); } });
  }
  return out;
}
function renderFieldSheetPhone(box) {
  const views = typeof lsViews === "function" ? lsViews() : [];
  const cur = typeof lsViewCurrent !== "undefined" ? lsViewCurrent : null;
  const labelsOn = $("objLabels") && $("objLabels").checked;
  const tree = fpTree(), acts = [];
  const sw = (on, mixed) => `<span class="fs-dot${mixed ? " mixed" : ""}"></span>`;
  const node = (n, depth) => {
    const i = acts.push(n) - 1, open = fpOpen.has(n.id), has = n.kids && n.kids.length;
    const chev = has ? `<button type="button" class="fp-chev${open ? " open" : ""}" data-fpopen="${fesc(n.id)}" aria-label="${open ? "Fäll ihop" : "Fäll ut"}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg></button>` : `<span class="fp-chev"></span>`;
    const lbl = `<span class="fs-lbl">${fesc(n.label)}</span>${n.count ? `<span class="fs-cnt">${n.count}</span>` : ""}`;
    const row = n.on === null
      ? `<div class="fp-row d${depth}">${chev}<button type="button" class="fp-item" data-fpshow="${i}">${lbl}</button></div>`
      : `<div class="fp-row d${depth}">${chev}<button type="button" class="fs-tog${n.on ? " on" : ""}" data-fpact="${i}" role="switch" aria-checked="${n.on}">${sw(n.on, n.mixed)}${lbl}</button></div>`;
    return row + (has && open ? n.kids.map(k => node(k, depth + 1)).join("") : "");
  };
  box.innerHTML = `
    <div class="fp-views"><select class="fp-vsel" aria-label="Sparade vyer"><option value="">${views.length ? "Sparade vyer…" : "Inga sparade vyer"}</option>${views.map(v => `<option value="${fesc(v.id)}"${v.id === cur ? " selected" : ""}>${fesc(v.name)}</option>`).join("")}</select><button type="button" class="fp-add" title="Spara det som visas som en ny vy" aria-label="Ny vy"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button></div>
    <div class="fs-grid fp-tree">${tree.map(n => node(n, 0)).join("")}
      <div class="fp-row d0"><span class="fp-chev"></span><button type="button" class="fs-tog${labelsOn ? " on" : ""}" data-labels="1" role="switch" aria-checked="${!!labelsOn}"><span class="fs-dot"></span><span class="fs-lbl">Objektnamn</span></button></div>
    </div>
    ${typeof hiddenObjCount === "function" && hiddenObjCount() ? `<button type="button" class="fp-showall" data-objshow="1">Tänd alla släckta objekt (${hiddenObjCount()})</button>` : ""}`;
  const again = () => setTimeout(renderFieldSheet, 40);
  box.querySelector(".fp-vsel").onchange = e => { if (e.target.value) { setVal("lsViewSel", e.target.value); setTimeout(() => { renderField(); renderFieldSheet(); }, 60); } };
  box.querySelector(".fp-add").onclick = () => openFieldSaveView();
  box.querySelectorAll("[data-fpopen]").forEach(b => b.onclick = () => { const id = b.dataset.fpopen; if (fpOpen.has(id)) fpOpen.delete(id); else fpOpen.add(id); renderFieldSheet(); });
  box.querySelectorAll("[data-fpact]").forEach(b => b.onclick = () => { const n = acts[Number(b.dataset.fpact)]; if (!n) return; if (n.act) n.act(); else if (n.el) n.el.click(); else return; again(); });
  box.querySelectorAll("[data-fpshow]").forEach(b => b.onclick = () => { const n = acts[Number(b.dataset.fpshow)]; if (n && n.show) { closeFieldSheet(); n.show.click(); } });
  const os = box.querySelector("[data-objshow]"); if (os) os.onclick = () => { $("btnObjShowAll").click(); again(); };
  const lb = box.querySelector("[data-labels]"); if (lb) lb.onclick = () => { const c = $("objLabels"); c.checked = !c.checked; c.dispatchEvent(new Event("change")); again(); };
}
function renderFieldSheet() {
  const box = $("fieldSheetBody");
  updatePinsBtn();
  if (document.body.classList.contains("phone")) return renderFieldSheetPhone(box);
  const rows = [...document.querySelectorAll("#layerList .layer-row[data-layer]")]
    .map(r => ({ key: r.dataset.layer, label: (r.querySelector(".ln").textContent || "").replace(/\s+/g, " ").trim().replace(/^[▸▾]\s*/, ""), on: r.querySelector(".lr-vis").checked }));
  const base = rows.filter(r => ["pdf", "zones", "objects", "photos"].includes(r.key) || r.key.startsWith("ul:"));
  const cad = rows.filter(r => r.key.startsWith("cad:"));
  const ortho = rows.filter(r => r.key.startsWith("ortho:"));
  // Antalet sist i namnet ("Foton 9") visas för sig, grått till höger (som i iOS-listor).
  const btn = (r, extra = "") => { const m = r.label.match(/^(.*\S)\s+(\d+)$/), name = m ? m[1] : r.label;
    return `<button type="button" class="fs-tog${r.on ? " on" : ""}" data-key="${fesc(r.key)}" role="switch" aria-checked="${r.on}"${extra}><span class="fs-dot"></span><span class="fs-lbl">${fesc(name)}</span>${m ? `<span class="fs-cnt">${m[2]}</span>` : ""}</button>`; };
  const labelsOn = $("objLabels") && $("objLabels").checked;
  const orthoOn = ortho.some(r => r.on);
  const views = typeof lsViews === "function" ? lsViews() : [];
  const cur = typeof lsViewCurrent !== "undefined" ? lsViewCurrent : null;
  const cadOpen = box.dataset.cadOpen === "1";
  box.innerHTML = `
    ${views.length ? `<div class="fs-h">Sparade vyer</div><div class="fs-grid fs-views">${views.map(v => `<button type="button" class="fs-view${v.id === cur ? " on" : ""}" data-view="${fesc(v.id)}">📑 ${fesc(v.name)}</button>`).join("")}</div>` : ""}
    ${typeof hiddenObjCount === "function" && hiddenObjCount() ? `<button type="button" class="fs-tog fs-showall" data-objshow="1"><span class="fs-lbl">💡 Tänd alla 3D-objekt <small>(${hiddenObjCount()} släckta)</small></span></button>` : ""}
    <div class="fs-h">Visa</div>
    <div class="fs-grid">${base.map(r => btn(r)).join("")}
      <button type="button" class="fs-tog${labelsOn ? " on" : ""}" data-labels="1" role="switch" aria-checked="${!!labelsOn}"><span class="fs-dot"></span><span class="fs-lbl">🏷 Namn på objekten</span></button>
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
  const os = box.querySelector("[data-objshow]");
  if (os) os.onclick = () => { $("btnObjShowAll").click(); setTimeout(renderFieldSheet, 30); };
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
function closeFieldSheet() { const s = $("fieldSheet"); if (s) { s.classList.add("hidden"); s.classList.remove("fs-tall"); } const b = $("btnFieldLayers"); if (b) b.classList.remove("on"); }

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
  // iPhone: dra lagerkortet uppåt för fler rader, neråt för att gå tillbaka eller stänga.
  (() => {
    const sh = $("fieldSheet"), head = sh.querySelector(".fs-head");
    let y0 = null;
    head.addEventListener("pointerdown", e => { if (!document.body.classList.contains("phone") || e.target.closest("button")) return; y0 = e.clientY; head.setPointerCapture && head.setPointerCapture(e.pointerId); });
    head.addEventListener("pointerup", e => {
      if (y0 === null) return;
      const dy = e.clientY - y0; y0 = null;
      if (dy < -30) sh.classList.add("fs-tall");
      else if (dy > 30) { if (sh.classList.contains("fs-tall")) sh.classList.remove("fs-tall"); else closeFieldSheet(); }
      else sh.classList.toggle("fs-tall");
    });
    head.addEventListener("pointercancel", () => { y0 = null; });
  })();
  $("btnFieldFull").onclick = () => setFieldMode(false);
  $("btnFieldNote").onclick = () => { closeFieldSheet(); startSiteTool("note"); };
  $("btnFieldSketch").onclick = () => { closeFieldSheet(); startSiteTool("sketch"); };
  // 📍 Fotonålar: tänder/släcker fotona på planen (samma som Foton i lagren).
  $("showPhotos").addEventListener("change", updatePinsBtn);
  $("btnFieldPins").onclick = () => { const c = fieldRowToggle("photos"); if (c) c.click(); else { const s = $("showPhotos"); s.checked = !s.checked; s.dispatchEvent(new Event("change")); } setTimeout(updatePinsBtn, 30); };
  $("btnFieldPhoto").onclick = () => { closeFieldSheet(); if (typeof stopSiteTool === "function" && siteTool) stopSiteTool(); startGpsPhoto(); };
  $("btnFieldView").onclick = () => openFieldSaveView();
  $("btnFieldUndo").onclick = fieldUndo;
  $("btnFieldRedo").onclick = fieldRedo;
  const origUndoBtns = updateUndoButtons;
  updateUndoButtons = function () { const r = origUndoBtns.apply(this, arguments); updateFieldUndo(); return r; };
  const origObjUndo = undoObjHide;
  undoObjHide = function () { const r = origObjUndo.apply(this, arguments); updateFieldUndo(); return r; };
  const origSetHidden = setObjHidden;
  setObjHidden = function () { const r = origSetHidden.apply(this, arguments); updateFieldUndo(); return r; };
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
