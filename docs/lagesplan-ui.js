/* Lägesplan – gemensamt för menyerna (Victor 2026-10-09: helhet och premiumkänsla).
   Sidhuvudets "Fler val" (⋯): fältläge, kortkommandon, fäll ihop alla kort, guide och anslutning
   ligger i en meny i stället för en rad små knappar. Stängs med ett klick utanför, Esc eller ett val. */
(function lpUiStart() {
  const start = () => {
    const btn = document.getElementById("btnHdrMore"), menu = document.getElementById("hdrMenu");
    if (!btn || !menu) return;
    const close = () => { menu.classList.add("hidden"); btn.setAttribute("aria-expanded", "false"); };
    btn.onclick = e => { e.stopPropagation(); const open = menu.classList.contains("hidden"); menu.classList.toggle("hidden", !open); btn.setAttribute("aria-expanded", String(open)); };
    menu.addEventListener("click", e => { if (e.target.closest("button, a")) setTimeout(close, 0); });
    document.addEventListener("click", e => { if (!e.target.closest(".hdr-more")) close(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !menu.classList.contains("hidden")) close(); }, true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
/* Visa ett element som ligger på en annan flik, i ett hopfällt kort eller i "Fler val"-menyn
   (byter flik / fäller ut / öppnar menyn). Används av testerna och kan användas av sökfunktioner. */
window.revealElement = function revealElement(el) {
  if (!el || !el.closest) return;
  const tab = el.closest(".tab-body .tab");
  if (tab && !tab.classList.contains("on") && typeof showTab === "function") showTab(tab.dataset.tab);
  let d = el.closest("details");
  while (d) { d.open = true; d = d.parentElement && d.parentElement.closest("details"); }
  const menu = el.closest("#hdrMenu");
  if (menu) menu.classList.remove("hidden");
  if (document.getElementById("layout") && document.getElementById("layout").classList.contains("side-hidden") && el.closest("aside") && typeof setSideHidden === "function") setSideHidden(false);
};
