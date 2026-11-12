/* Fäst högermenyn (Victor 2026-11-12: "en pin-ikon som gör att jag kan fästa menyn så att den syns hela tiden även när jag inte har något markerat objekt").
   En liten nålknapp sitter på kanten av objektpanelen (#v3Side). Fäst = panelen står kvar med en tom text när inget är markerat, så den inte hoppar fram och tillbaka. Valet sparas (sidePin). Prefix l3pn. */
const L3PN_ICO = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z"/><path d="M12 14v7"/></svg>';
function l3pnEnsure() {
  const side = document.getElementById("v3Side"); if (!side) return;
  const head = side.querySelector(".v3-side-h"); if (!head) return;
  let b = head.querySelector(":scope > .v3-pin");
  if (!b) { b = document.createElement("button"); b.type = "button"; b.className = "v3-pin"; b.innerHTML = L3PN_ICO; b.onclick = e => { e.stopPropagation(); l3SetPref("sidePin", !l3Prefs().sidePin); if (typeof l3RenderSide === "function") l3RenderSide(); l3pnEnsure(); }; }
  const on = !!l3Prefs().sidePin; b.classList.toggle("on", on); b.title = on ? "Lossa menyn (döljs när inget är markerat)" : "Fäst menyn (visas även utan markering)"; b.setAttribute("aria-pressed", on);
  if (b.parentElement !== head || head.lastElementChild !== b) head.appendChild(b);
}
function l3pnInit() {
  const side = document.getElementById("v3Side"); if (!side || side.dataset.pn) return; side.dataset.pn = "1";
  new MutationObserver(() => { const h = side.querySelector(".v3-side-h"); if (h && (!h.querySelector(":scope > .v3-pin") || h.lastElementChild.className !== "v3-pin" && !h.lastElementChild.classList.contains("v3-pin"))) l3pnEnsure(); }).observe(side, { childList: true, subtree: true });
  l3pnEnsure(); if (l3Prefs().sidePin && typeof l3RenderSide === "function") l3RenderSide();
}
(() => { const t = setInterval(() => { if (document.getElementById("v3Side") && typeof l3Prefs === "function") { clearInterval(t); l3pnInit(); } }, 500); setTimeout(() => clearInterval(t), 180000); })();
