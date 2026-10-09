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
  const help = el.closest(".sec-help");
  if (help && help.closest("details.sec")) help.closest("details.sec").classList.add("show-help");
  const menu = el.closest("#hdrMenu");
  if (menu) menu.classList.remove("hidden");
  if (document.getElementById("layout") && document.getElementById("layout").classList.contains("side-hidden") && el.closest("aside") && typeof setSideHidden === "function") setSideHidden(false);
};
/* Hjälptexterna (Victor 2026-10-09: "för mycket text"): de långa förklaringarna i korten
   döljs bakom ett litet ⓘ i kortets rubrik. Ett klick visar/döljer dem; valet sparas per kort.
   Bara fasta texter (utan id) – statusrader och varningar som appen skriver syns alltid. */
(function lpHelpStart() {
  const KEY = "lagesplan-help-";
  const start = () => {
    document.querySelectorAll("details.sec").forEach(sec => {
      const helps = [...sec.querySelectorAll(".hint:not([id]), div.muted:not([id]), [data-help]")]
        .filter(h => h.hasAttribute("data-help") || (!h.querySelector("input, select, button, textarea") && h.textContent.trim().length >= 50 && h.closest("details.sec") === sec));
      const sum = sec.querySelector(":scope > summary");
      if (!helps.length || !sum) return;
      helps.forEach(h => { if (!h.hasAttribute("data-help")) h.classList.add("sec-help"); });
      const name = sec.dataset.sec || "";
      let on = false;
      try { on = localStorage.getItem(KEY + name) === "1"; } catch (e) {}
      sec.classList.toggle("show-help", on);
      const b = document.createElement("button");
      b.type = "button"; b.className = "sec-help-btn"; b.title = "Visa/dölj förklaringar";
      b.setAttribute("aria-label", "Visa/dölj förklaringar");
      b.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6"/><circle cx="12" cy="7.6" r=".6" fill="currentColor"/></svg>';
      b.setAttribute("aria-pressed", String(on));
      b.onclick = e => {
        e.preventDefault(); e.stopPropagation();
        const v = !sec.classList.contains("show-help");
        sec.classList.toggle("show-help", v);
        b.setAttribute("aria-pressed", String(v));
        if (v) sec.open = true;
        try { localStorage.setItem(KEY + name, v ? "1" : "0"); } catch (e2) {}
      };
      sum.appendChild(b);
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
