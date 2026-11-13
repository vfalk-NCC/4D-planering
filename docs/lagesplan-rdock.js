/* Lägesplan – docka dialogrutor och egenskaper till höger (Victor 2026-11-13: "den skulle docka på höger sida … samt att dom här dialogrutorna också ska docka i samma frame").
   Dockan (#rdock) sitter till höger om kartan; kartan krymper och går att panorera/zooma medan dockan visas. Flera paneler kan ligga i den samtidigt (staplade).
   Används av exportpanelen (lagesplan-exportadj.js) och av egenskapsrutan för noteringar, zoner m.m. (#sitePop) – den får en 📌-knapp i rubriken som dockar/lösgör den.
   Dockningen minns hur du lämnade den (webbläsaren). På telefon (smal skärm) används inte dockan. Prefix rdock. */
const RDOCK_W_KEY = "lagesplan-rdock-w", RDOCK_SITE_KEY = "lagesplan-rdock-site";
const rdock = { el: null, panels: new Map(), w: 480 };
/* Dockan visas alltid (även tom) så att kartan inte hoppar när något markeras; "⇥ Dölj" i dockans rubrik och fliken ◀ på högerkanten döljer/visar den (sparas i webbläsaren). */
const RDOCK_HIDE_KEY = "lagesplan-rdock-hidden";
function rdockCanShow() { return window.innerWidth >= 900 && !document.body.classList.contains("phone"); }
function rdockHiddenPref() { try { const v = localStorage.getItem(RDOCK_HIDE_KEY); return v === null ? !!navigator.webdriver : v === "1"; } catch (e) { return false; } }   // automatiserad webbläsare (test): dold tills något annat valts
function rdockAllowed() { return rdockCanShow() && !rdockHiddenPref(); }
function rdockResync() { if (typeof rdockSiteSync === "function") rdockSiteSync(); if (typeof adj !== "undefined" && adj.el && typeof adjPlace === "function" && adj.open) adjPlace(); if (typeof rdockLmSync === "function") rdockLmSync(); }
function rdockSetHidden(h) {
  try { localStorage.setItem(RDOCK_HIDE_KEY, h ? "1" : "0"); } catch (e) { /* privat läge */ }
  rdockResync(); rdockRefresh(); rdockResizeView();
}
function rdockEnsure() {
  if (rdock.el) return rdock.el;
  try { const w = Number(localStorage.getItem(RDOCK_W_KEY)); if (w >= 320) rdock.w = w; } catch (e) { /* standard */ }
  const lay = document.getElementById("layout"), el = document.createElement("div"); el.id = "rdock"; el.hidden = true; el.innerHTML = `<div class="rd-rs" title="Dra för att ändra bredd (dubbelklick = standard)"></div><div class="rd-hd"><span>Panel</span><button type="button" class="rd-hide" title="Dölj högermenyn (visa den igen med fliken ◀ på högerkanten)">Dölj ⇥</button></div><div class="rd-body"></div><div class="rd-empty"><b>Högermenyn</b>Här visas status, egenskaper och exportpunkter för det du markerar eller högerklickar på. Klicka på ett objekt eller en prick på kartan – 📌 i en ruta dockar den hit.</div>`;
  lay.appendChild(el); rdock.el = el; rdockWidth(rdock.w, false);
  el.querySelector(".rd-hide").onclick = () => rdockSetHidden(true);
  const rs = el.querySelector(".rd-rs");
  rs.onpointerdown = e => { e.preventDefault(); rs.setPointerCapture(e.pointerId); const x0 = e.clientX, w0 = el.getBoundingClientRect().width; document.body.classList.add("resizing");
    const mv = ev => rdockWidth(w0 + x0 - ev.clientX, false), up = () => { rs.removeEventListener("pointermove", mv); rs.removeEventListener("pointerup", up); document.body.classList.remove("resizing"); rdockWidth(el.getBoundingClientRect().width, true); rdockResizeView(); }; rs.addEventListener("pointermove", mv); rs.addEventListener("pointerup", up); };
  rs.ondblclick = () => { rdockWidth(480, true); rdockResizeView(); };
  new MutationObserver(() => rdockRefresh()).observe(el.querySelector(".rd-body"), { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
  return el;
}
function rdockTab() {
  let t = document.getElementById("rdockTab"); if (t) return t;
  t = document.createElement("button"); t.type = "button"; t.id = "rdockTab"; t.hidden = true; t.textContent = "◀"; t.title = "Visa högermenyn"; t.onclick = () => rdockSetHidden(false);
  document.body.appendChild(t); return t;
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
  rdock.el.classList.toggle("rd-has", vis);
  const show = rdockCanShow() && !rdockHiddenPref(), tab = rdockTab(); tab.hidden = !(rdockCanShow() && rdockHiddenPref());
  if (rdock.el.hidden === show) { rdock.el.hidden = !show; rdockResizeView(); }
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


/* ---- Prickens/etikettens meny (#labelMenu: status, framdrift, datum, färg, kommentarer, släck …) – 📌 i rubrikraden öppnar den i dockan (Victor 2026-11-13: "alla dialogrutor ska gå att öppna där") ----
   Dockad ligger den kvar när du klickar på kartan (stängs med ✕ eller 📌) och byts ut när du högerklickar på nästa prick. */
const RDOCK_LM_KEY = "lagesplan-rdock-labelmenu";
const rdockLm = { outside: false, closing: false, busy: false };
function rdockLmDocked() { try { return localStorage.getItem(RDOCK_LM_KEY) === "1"; } catch (e) { return false; } }
function rdockLmSync() {
  const m = document.getElementById("labelMenu"); if (!m || rdockLm.busy) return; rdockLm.busy = true;
  try {
    const open = !m.classList.contains("hidden"), want = rdockAllowed() && rdockLmDocked(), is = m.classList.contains("rd-docked");
    if (open && !m.querySelector(":scope > .rd-lmbar")) {
      const bar = document.createElement("div"); bar.className = "rd-lmbar";
      bar.innerHTML = `<span>Prick / etikett</span><button type="button" class="rd-lmpin" title="Docka till höger (samma ram som egenskapsrutan)">📌</button><button type="button" class="rd-lmx" title="Stäng">✕</button>`;
      bar.querySelector(".rd-lmpin").onclick = e => { e.stopPropagation(); const on = !rdockLmDocked(); try { localStorage.setItem(RDOCK_LM_KEY, on ? "1" : "0"); } catch (err) { /* privat läge */ } rdockLm.busy = false; rdockLmSync(); };
      bar.querySelector(".rd-lmx").onclick = e => { e.stopPropagation(); rdockLm.closing = true; m.classList.add("hidden"); };
      m.prepend(bar);
    }
    if (open && want && !is) { rdockEnsure(); rdock.panels.set(m, { home: document.body }); rdockAdd(m, 3); }
    else if (is && (!want || !rdockAllowed())) rdockRemove(m, document.body);
    const pin = m.querySelector(".rd-lmpin"); if (pin) { const d = m.classList.contains("rd-docked"); pin.classList.toggle("on", d); pin.title = d ? "Lösgör från dockan" : "Docka till höger (samma ram som egenskapsrutan)"; }
  } finally { rdockLm.busy = false; }
}
function rdockLmInit() {
  const m = document.getElementById("labelMenu"); if (!m || m.__rdLm) return; m.__rdLm = true;
  new MutationObserver(() => {
    if (m.classList.contains("hidden") && m.classList.contains("rd-docked") && rdockLm.outside && !rdockLm.closing) { m.classList.remove("hidden"); return; }   // klick på kartan stänger inte den dockade menyn
    if (m.classList.contains("hidden")) rdockLm.closing = false;
    rdockLmSync();
  }).observe(m, { childList: true, attributes: true, attributeFilter: ["class"] });
  rdockLmSync();
}
document.addEventListener("mousedown", e => { rdockLm.outside = !(e.target.closest && e.target.closest("#labelMenu")); setTimeout(() => { rdockLm.outside = false; }, 0); }, true);
document.addEventListener("DOMContentLoaded", () => {
  rdockLmInit();
  new MutationObserver(() => rdockLmInit()).observe(document.body, { childList: true });   // menyn skapas första gången den öppnas
});

/* Dockan finns från start (tom tills något markeras). */
function rdockBoot() { if (rdockCanShow()) { rdockEnsure(); } if (rdock.el) rdockRefresh(); else rdockTab().hidden = true; }
document.addEventListener("DOMContentLoaded", () => { setTimeout(rdockBoot, 0); window.addEventListener("resize", () => { if (window.__keepViewOnResize) return; rdockBoot(); }); });
