/* Lägesplan – docka dialogrutor och egenskaper till höger (Victor 2026-11-13: "den skulle docka på höger sida … samt att dom här dialogrutorna också ska docka i samma frame").
   Dockan (#rdock) sitter till höger om kartan; kartan krymper och går att panorera/zooma medan dockan visas. Flera paneler kan ligga i den samtidigt (staplade).
   Används av exportpanelen (lagesplan-exportadj.js) och av egenskapsrutan för noteringar, zoner m.m. (#sitePop) – den får en 📌-knapp i rubriken som dockar/lösgör den.
   Dockningen minns hur du lämnade den (webbläsaren). På telefon (smal skärm) används inte dockan. Prefix rdock. */
const RDOCK_W_KEY = "lagesplan-rdock-w", RDOCK_SITE_KEY = "lagesplan-rdock-site";
const rdock = { el: null, panels: new Map(), w: 480 };
function rdockAllowed() { return window.innerWidth >= 900 && !document.body.classList.contains("phone"); }
function rdockEnsure() {
  if (rdock.el) return rdock.el;
  try { const w = Number(localStorage.getItem(RDOCK_W_KEY)); if (w >= 320) rdock.w = w; } catch (e) { /* standard */ }
  const lay = document.getElementById("layout"), el = document.createElement("div"); el.id = "rdock"; el.hidden = true; el.innerHTML = `<div class="rd-rs" title="Dra för att ändra bredd (dubbelklick = standard)"></div><div class="rd-body"></div>`;
  lay.appendChild(el); rdock.el = el; rdockWidth(rdock.w, false);
  const rs = el.querySelector(".rd-rs");
  rs.onpointerdown = e => { e.preventDefault(); rs.setPointerCapture(e.pointerId); const x0 = e.clientX, w0 = el.getBoundingClientRect().width; document.body.classList.add("resizing");
    const mv = ev => rdockWidth(w0 + x0 - ev.clientX, false), up = () => { rs.removeEventListener("pointermove", mv); rs.removeEventListener("pointerup", up); document.body.classList.remove("resizing"); rdockWidth(el.getBoundingClientRect().width, true); rdockResizeView(); }; rs.addEventListener("pointermove", mv); rs.addEventListener("pointerup", up); };
  rs.ondblclick = () => { rdockWidth(480, true); rdockResizeView(); };
  new MutationObserver(() => rdockRefresh()).observe(el.querySelector(".rd-body"), { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
  return el;
}
function rdockWidth(w, save) {
  const lay = document.getElementById("layout"), asideW = (lay.querySelector("aside") || { offsetWidth: 0 }).offsetWidth;
  rdock.w = Math.max(320, Math.min(Math.round(w), window.innerWidth - asideW - 340)); rdock.el.style.width = rdock.w + "px"; rdock.el.style.flexBasis = rdock.w + "px";
  if (save) try { localStorage.setItem(RDOCK_W_KEY, String(rdock.w)); } catch (e) { /* privat läge */ }
}
function rdockResizeView() { window.__keepViewOnResize = true; try { window.dispatchEvent(new Event("resize")); } finally { window.__keepViewOnResize = false; } if (typeof scheduleOrthoRender === "function") scheduleOrthoRender(); if (typeof renderZones === "function") setTimeout(() => renderZones(), 30); }
/* Lägger panelen i dockan (order: lägre först). home = där den bor när den inte är dockad. */
function rdockAdd(el, order = 5) {
  if (!rdockAllowed()) return false; rdockEnsure();
  if (!rdock.panels.has(el)) rdock.panels.set(el, { home: el.parentNode, next: el.nextSibling });
  const body = rdock.el.querySelector(".rd-body"); el.dataset.rdOrder = order; el.classList.add("rd-docked"); body.appendChild(el);
  [...body.children].sort((a, b) => Number(a.dataset.rdOrder || 5) - Number(b.dataset.rdOrder || 5)).forEach(c => body.appendChild(c));
  rdockRefresh(); rdockResizeView(); return true;
}
function rdockRemove(el, toParent) {
  const info = rdock.panels.get(el); el.classList.remove("rd-docked"); rdock.panels.delete(el);
  const home = toParent || (info && info.home) || document.body; if (el.parentNode !== home) home.appendChild(el);
  rdockRefresh(); rdockResizeView();
}
function rdockRefresh() {
  if (!rdock.el) return; const body = rdock.el.querySelector(".rd-body"), vis = [...body.children].some(c => !c.classList.contains("hidden") && !c.hidden);
  if (rdock.el.hidden === vis) { rdock.el.hidden = !vis; rdockResizeView(); }
}
/* ---- Egenskapsrutan (#sitePop): 📌 i rubriken dockar/lösgör ---- */
function rdockSiteDocked() { try { return localStorage.getItem(RDOCK_SITE_KEY) === "1"; } catch (e) { return false; } }
function rdockSiteSync() {
  const pop = document.getElementById("sitePop"); if (!pop) return;
  const head = pop.querySelector(":scope > b:first-child, :scope > .dp-head:first-child, :scope > .sp-hd:first-child");
  if (rdockAllowed() && head && !head.querySelector(".rd-pin")) {
    const b = document.createElement("button"); b.type = "button"; b.className = "rd-pin"; b.innerHTML = "📌"; b.title = "Docka till höger (samma ram som exportpanelen)"; b.onpointerdown = e => e.stopPropagation();
    b.onclick = e => { e.stopPropagation(); e.preventDefault(); const on = !rdockSiteDocked(); try { localStorage.setItem(RDOCK_SITE_KEY, on ? "1" : "0"); } catch (err) { /* privat läge */ } rdockSiteSync(); };
    head.appendChild(b);
  }
  const want = rdockAllowed() && rdockSiteDocked(), is = pop.classList.contains("rd-docked");
  if (want && !is) { const main = document.querySelector("main"); rdockEnsure(); rdock.panels.set(pop, { home: main }); rdockAdd(pop, 1); }
  else if (!want && is) rdockRemove(pop, document.querySelector("main"));
  const pin = pop.querySelector(".rd-pin"); if (pin) { pin.classList.toggle("on", pop.classList.contains("rd-docked")); pin.title = pop.classList.contains("rd-docked") ? "Lösgör från dockan" : "Docka till höger (samma ram som exportpanelen)"; }
}
document.addEventListener("DOMContentLoaded", () => {
  const pop = document.getElementById("sitePop"); if (!pop) return;
  new MutationObserver(() => rdockSiteSync()).observe(pop, { childList: true });
  window.addEventListener("resize", () => { if (rdock.el && !rdockAllowed()) { [...rdock.panels.keys()].forEach(p => { if (p.id === "sitePop") rdockRemove(p, document.querySelector("main")); }); } });
});
