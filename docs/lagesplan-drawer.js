/* Sidomeny på iPhone (Victors önskemål 2026-10-03, test): som i Claude-appen.
   Avatarknappen i sökkortet (eller ett drag från vänsterkanten) skjuter hela
   vyn åt höger med rundade hörn och tonar ner den; under ligger en mörk meny
   med funktionerna, sparade vyer och planerna, och nertill avatar och
   "Ny notering". Ett tryck på den nedtonade vyn eller ett drag åt vänster
   stänger. Bara i fältläget på telefon – iPad och dator påverkas inte. */
const DR_SVG = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const DR_ITEMS = [
  ["btnFieldDay", "Dag", '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5c.6-3.4 2.8-5.2 5.5-5.2s4.9 1.8 5.5 5.2"/><circle cx="17" cy="9" r="2.4"/><path d="M15.8 14.4c2.6.2 4.2 1.9 4.7 5.1"/>'],
  ["btnFieldLayers", "Lager", '<path d="M12 3 3 7.5l9 4.5 9-4.5L12 3z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>'],
  ["btnFieldPhoto", "Foto", '<path d="M4 8.5A2 2 0 0 1 6 6.5h1.8l1.4-2h5.6l1.4 2H18a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.5"/>'],
  ["btnFieldSketch", "Rita", '<path d="M15.5 4.5 19.5 8.5 8.5 19.5H4.5v-4z"/><path d="m13 7 4 4"/>'],
  ["btnFieldView", "Spara vy", '<path d="M7 3.5h10a1 1 0 0 1 1 1V21l-6-4-6 4V4.5a1 1 0 0 1 1-1z"/>'],
  ["btnFieldHide", "Bara kartan", '<path d="M3 3l18 18"/><path d="M10.6 5.2A9.8 9.8 0 0 1 12 5c5 0 8.5 4.5 9.5 7a13 13 0 0 1-2.7 3.9M6.4 6.4C4.3 7.8 3 9.9 2.5 12c1 2.5 4.5 7 9.5 7 1.7 0 3.2-.5 4.5-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'],
  ["btnFieldFull", "Fullständig vy", '<rect x="3" y="4.5" width="18" height="13" rx="2"/><path d="M8 20.5h8M12 17.5v3"/>'],
];
let drOpen = false;
const drW = () => Math.min(320, Math.round(window.innerWidth * 0.82));
let drTimer = 0;
function drSetShift(px, anim) {
  const b = document.body;
  clearTimeout(drTimer);
  b.classList.toggle("dr-anim", !!anim);
  if (px > 0 || anim) b.classList.add("dr-on"); // vid stängning: kvar tills animeringen är klar
  b.style.setProperty("--dr-shift", Math.round(px) + "px");
  b.style.setProperty("--dr-p", Math.max(0, Math.min(1, px / drW())).toFixed(3));
  if (anim || px <= 0) drTimer = setTimeout(() => { b.classList.remove("dr-anim"); if (!drOpen && px <= 0) b.classList.remove("dr-on"); }, anim ? 440 : 0);
}
function drRender() {
  const box = $("apDrawer");
  if (!box) return;
  const views = [...(($("fieldView") || {}).options || [])].filter(o => o.value);
  const plans = [...(($("fieldPlan") || {}).options || [])].filter(o => o.value);
  const curPlan = ($("fieldPlan") || {}).value;
  const name = (typeof settings !== "undefined" && settings.userName) || "";
  const ini = name.split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const row = (attr, icon, label, extra = "") => `<button type="button" class="dr-item${extra}" ${attr}>${DR_SVG(icon)}<span>${fesc(label)}</span></button>`;
  box.querySelector(".dr-scroll").innerHTML = `
    ${DR_ITEMS.map(([id, lb, ic]) => row(`data-dr-btn="${id}"`, ic, lb)).join("")}
    ${row('data-dr-href="index.html"', '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9h17M9 9v11"/>', "4D-planering")}
    ${row('data-dr-href="guide.html"', '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>', "Guide")}
    ${views.length ? `<div class="dr-h">Sparade vyer</div>${views.map(o => row(`data-dr-view="${fesc(o.value)}"`, '<path d="M7 3.5h10a1 1 0 0 1 1 1V21l-6-4-6 4V4.5a1 1 0 0 1 1-1z"/>', o.textContent.replace(/^📑\s*/, "").trim())).join("")}` : ""}
    ${plans.length ? `<div class="dr-h">Planer</div>${plans.map(o => row(`data-dr-plan="${fesc(o.value)}"`, '<path d="M6 3.5h8l4 4V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z"/><path d="M14 3.5v4h4"/>', o.textContent.trim(), o.value === curPlan ? " on" : "")).join("")}` : ""}`;
  const av = box.querySelector(".dr-avatar");
  if (ini) av.textContent = ini; else av.innerHTML = DR_SVG('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>');
  av.title = name || "Ange ditt namn under Inställningar i fullständig vy";
  box.querySelectorAll("[data-dr-btn]").forEach(b => b.onclick = () => { const id = b.dataset.drBtn; drClose(); setTimeout(() => $(id) && $(id).click(), 220); });
  box.querySelectorAll("[data-dr-href]").forEach(b => b.onclick = () => { location.href = b.dataset.drHref + location.search; });
  box.querySelectorAll("[data-dr-view]").forEach(b => b.onclick = () => { const s = $("fieldView"); s.value = b.dataset.drView; s.dispatchEvent(new Event("change")); drClose(); });
  box.querySelectorAll("[data-dr-plan]").forEach(b => b.onclick = () => { const s = $("fieldPlan"); s.value = b.dataset.drPlan; s.dispatchEvent(new Event("change")); drClose(); });
}
function drOpenFn() {
  if (!document.body.classList.contains("phone") || !document.body.classList.contains("field")) return;
  if (typeof closeFieldSheet === "function") closeFieldSheet();
  if (typeof closeFieldDay === "function") closeFieldDay();
  if (typeof apSetDetent === "function") apSetDetent(0);
  if (typeof closeSitePop === "function" && $("sitePop") && !$("sitePop").classList.contains("hidden")) closeSitePop();
  drRender(); drOpen = true; drSetShift(drW(), true);
}
function drClose() { drOpen = false; drSetShift(0, true); }

document.addEventListener("DOMContentLoaded", () => {
  if (!$("fieldTop")) return;
  const d = document.createElement("nav");
  d.id = "apDrawer"; d.className = "ap-ui"; d.setAttribute("aria-label", "Meny");
  d.innerHTML = `<div class="dr-top"><b>Lägesplan</b></div><div class="dr-scroll"></div>
    <div class="dr-bot"><button type="button" class="dr-avatar"></button><button type="button" class="dr-new">${DR_SVG('<path d="M12 5v14M5 12h14"/>')}<span>Ny notering</span></button></div>`;
  document.body.appendChild(d);
  const shade = document.createElement("div"); shade.id = "apShade"; shade.className = "ap-ui"; document.body.appendChild(shade);
  d.querySelector(".dr-new").onclick = () => { drClose(); setTimeout(() => $("btnFieldNote").click(), 220); };
  d.querySelector(".dr-avatar").onclick = () => { drClose(); setTimeout(() => $("btnFieldFull").click(), 220); };
  const av = $("apAvatar"); if (av) { av.onclick = drOpenFn; av.title = "Meny"; }
  // Dra: från vänsterkanten för att öppna, på den nedtonade vyn eller menyn för att stänga.
  let drag = null;
  const start = (e, from) => { drag = { x0: e.clientX, y0: e.clientY, base: drOpen ? drW() : 0, from, moved: false, t: e.timeStamp, x: e.clientX, v: 0 }; };
  window.addEventListener("pointerdown", e => {
    if (!document.body.classList.contains("phone") || !document.body.classList.contains("field")) return;
    if (!drOpen && e.clientX < 16 && !e.target.closest("#apSheet, .ap-float, #fieldDay, #fieldSheet, #sitePop")) { e.stopPropagation(); e.preventDefault(); start(e, "edge"); }
    else if (drOpen && e.target.closest("#apShade")) { e.stopPropagation(); start(e, "shade"); }
  }, true);
  d.addEventListener("pointerdown", e => { if (drOpen) start(e, "drawer"); });
  window.addEventListener("pointermove", e => {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    if (!drag.moved && Math.abs(dx) < 8) return;
    if (!drag.moved && drag.from === "drawer" && Math.abs(e.clientY - drag.y0) > Math.abs(dx)) { drag = null; return; } // rulla listan
    if (!drag.moved) drRender();
    drag.moved = true;
    drag.v = (e.clientX - drag.x) / Math.max(1, e.timeStamp - drag.t); drag.x = e.clientX; drag.t = e.timeStamp;
    drSetShift(Math.max(0, Math.min(drW(), drag.base + dx)), false);
  }, true);
  const end = e => {
    if (!drag) return;
    const g = drag; drag = null;
    if (!g.moved) { if (g.from === "shade") drClose(); return; }
    e.stopPropagation();
    const cur = parseFloat(getComputedStyle(document.body).getPropertyValue("--dr-shift")) || 0;
    const fast = performance.now() - g.t < 90 ? g.v : 0;
    if (fast > 0.4 || (fast > -0.4 && cur > drW() / 2)) { drOpen = true; drSetShift(drW(), true); } else drClose();
  };
  window.addEventListener("pointerup", end, true);
  window.addEventListener("pointercancel", end, true);
  window.addEventListener("resize", () => { if (drOpen && !document.body.classList.contains("phone")) drClose(); else if (drOpen) drSetShift(drW(), false); });
});
