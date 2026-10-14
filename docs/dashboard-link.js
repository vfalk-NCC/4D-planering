/* Koppling till 4D-dashboardens Gantt (Victor 2026-10-14): dashboardens Gantt har högsta prioritet i Trimble Connects 3D-vy.
   4D-planering och dashboarden är två tillägg i samma TC-vy som båda färgar och släcker samma objekt – utan samordning
   skrev de över varandra (färger som hoppar, objekt som tänds igen, pulsen som flimrar).

   – Så länge dashboardens Gantt styr 3D-vyn (läget Kopplade, Okopplade eller Tid) skriver 4D-planering INGENTING automatiskt
     till modellen (tidslinjens färger, temporära objekts synlighet, återställningar, rensning av markeringen).
   – Tidslinjen här blir ett reglage för dashboardens: när dashboarden står i Tid-läget flyttar reglaget/datumet/uppspelningen här
     dashboardens datum, och dashboardens datum visas här. Dashboarden bestämmer – den ändras aldrig av något annat än det datumet.
   – Lämnar dashboarden sitt läge tar 4D-planering över igen (färgerna ritas om).
   Kanalen är BroadcastChannel (samma adress, vfalk-ncc.github.io); utan den (äldre webbläsare) gör 4D-planering som förut. */

const dashLink = { mode: "off", date: "", at: 0, ch: null, wasOwned: false };
/* True när dashboardens Gantt styr 3D-vyn (och har hörts av de senaste sekunderna). */
function dashboardOwns() { return dashLink.mode !== "off" && Date.now() - dashLink.at < 60000; }
function dashLinkBanner() {
  const own = dashboardOwns();
  let el = document.getElementById("dashLinkBanner");
  const host = document.getElementById("timelineDate") && document.getElementById("timelineDate").closest(".panel, section, div");
  if (!own) { if (el) el.remove(); return; }
  if (!el && host) { el = document.createElement("div"); el.id = "dashLinkBanner"; el.className = "hint"; el.style.cssText = "margin:6px 0;padding:6px 8px;border-radius:8px;background:#eff6ff;color:#1e40af;font-size:12px"; host.insertBefore(el, host.firstChild); }
  if (el) el.textContent = dashLink.mode === "time" ? "Dashboardens Gantt styr 3D-vyn – reglaget här flyttar dashboardens tidslinje." : "Dashboardens Gantt styr 3D-vyn (Kopplade/Okopplade) – 4D-planering ändrar inget i modellen just nu.";
}
function dashLinkOnState(m) {
  const before = dashboardOwns();
  dashLink.mode = m.mode || "off"; dashLink.at = Date.now();
  if (m.mode === "time" && m.date) {
    dashLink.date = m.date;
    const di = document.getElementById("timelineDate"), sl = document.getElementById("timelineSlider");
    if (di && di.value !== m.date && typeof getEarliestDate === "function") {
      di.value = m.date; const st = getEarliestDate();
      if (sl && st) sl.value = Math.max(0, daysBetween(st, m.date));
      if (typeof renderItemList === "function") { /* listan visar läget nu, inte tidslinjens datum */ }
    }
  }
  dashLinkBanner();
  if (before && !dashboardOwns() && typeof applyTimelineColors === "function") setTimeout(() => { try { applyTimelineColors(); } catch (e) { /* inga modeller */ } }, 700); // dashboarden släppte: rita om
}
/* Från 4D-planeringens reglage: flytta dashboardens datum (bara om dashboarden står i Tid-läget). */
function dashLinkSend(date) { if (dashLink.ch && dashboardOwns() && dashLink.mode === "time" && date) { try { dashLink.ch.postMessage({ t: "setDate", date }); } catch (e) { /* ingen kanal */ } } }
try {
  if (typeof BroadcastChannel !== "undefined") {
    dashLink.ch = new BroadcastChannel("4d-gantt-link");
    dashLink.ch.onmessage = e => { const m = e.data || {}; if (m.t === "state") dashLinkOnState(m); };
    dashLink.ch.postMessage({ t: "hello" }); // dashboarden svarar med sitt läge
  }
} catch (e) { /* utan kanal: som förut */ }
setInterval(() => { if (dashLink.mode !== "off" && !dashboardOwns()) { dashLink.mode = "off"; dashLinkBanner(); setTimeout(() => { try { applyTimelineColors(); } catch (e) { /* */ } }, 300); } }, 3000); // dashboarden försvann
