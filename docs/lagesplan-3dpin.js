/* Fäst högermenyn (Victor 2026-11-12: "en pin-ikon som gör att jag kan fästa menyn så att den syns hela tiden även när jag inte har något markerat objekt").
   En liten nålknapp sitter på kanten av objektpanelen (#v3Side). Fäst = panelen står kvar med en tom text när inget är markerat, så den inte hoppar fram och tillbaka. Valet sparas (sidePin). Prefix l3pn. */
const L3PN_ICO = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/></svg>';
function l3pnEnsure() {
  const side = document.getElementById("v3Side"); if (!side) return;
  const head = side.querySelector(".v3-side-h"); if (!head) return;
  let b = head.querySelector(":scope > .v3-pin");
  if (!b) { b = document.createElement("button"); b.type = "button"; b.className = "v3-pin"; b.innerHTML = L3PN_ICO; b.onclick = e => { e.stopPropagation(); l3SetPref("sidePin", !l3Prefs().sidePin); if (typeof l3RenderSide === "function") l3RenderSide(); l3pnEnsure(); }; }
  const on = !!l3Prefs().sidePin; b.classList.toggle("on", on); b.title = on ? "Lossa menyn (döljs när inget är markerat)" : "Fäst menyn (visas även utan markering)"; b.setAttribute("aria-pressed", on);
  let c = head.querySelector(":scope > .v3-rcol");   // dölj högermenyn (›): samma sak som Meny-knappen till vänster, fast åt höger
  if (!c) { c = document.createElement("button"); c.type = "button"; c.className = "v3-rcol"; c.innerHTML = "›"; c.title = "Dölj menyn till höger"; c.onclick = e => { e.stopPropagation(); l3RightMenu(false); }; }
  if (!(c.parentElement === head && b.parentElement === head && head.lastElementChild === c && c.previousElementSibling === b)) { head.appendChild(b); head.appendChild(c); }
}
/* Högermenyn: dölj med › i rubriken, visa igen med knappen Meny uppe till höger. Gäller objektpanelen, infon och den dockade kolumnen. Valet sparas. */
function l3RightMenu(on) {
  const root = document.getElementById("view3d"); if (!root) return; l3SetPref("rightHide", !on); root.classList.toggle("v3-rhide", !on);
  let b = document.getElementById("v3RightOpen");
  if (!b) { b = document.createElement("button"); b.type = "button"; b.id = "v3RightOpen"; b.className = "v3-rightopen"; b.title = "Visa menyn till höger"; b.innerHTML = "<span>Meny</span>‹"; b.onclick = () => l3RightMenu(true); document.getElementById("v3Canvas").appendChild(b); }
  b.classList.toggle("hidden", !!on);
  setTimeout(() => { if (typeof l3dkResize === "function") l3dkResize(); if (typeof l3Resize === "function") l3Resize(); if (typeof l3Render === "function") l3Render(); }, 0);
}
function l3pnInit() {
  const side = document.getElementById("v3Side"); if (!side || side.dataset.pn) return; side.dataset.pn = "1";
  new MutationObserver(() => { const h = side.querySelector(".v3-side-h"); if (!h) return; const c = h.querySelector(":scope > .v3-rcol"), b = h.querySelector(":scope > .v3-pin"); if (!(c && b && h.lastElementChild === c && c.previousElementSibling === b)) l3pnEnsure(); }).observe(side, { childList: true, subtree: true });
  l3pnEnsure(); if (l3Prefs().rightHide === true) l3RightMenu(false); if (l3Prefs().sidePin && typeof l3RenderSide === "function") l3RenderSide();
}
(() => { const t = setInterval(() => { if (document.getElementById("v3Side") && typeof l3Prefs === "function") { clearInterval(t); l3pnInit(); } }, 500); setTimeout(() => clearInterval(t), 180000); })();
