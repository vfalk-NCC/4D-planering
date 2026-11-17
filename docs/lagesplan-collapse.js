/* Fäll ihop alla – en knapp i varje huvudmeny med avsnitt som går att fälla ihop (Victor 2026-11-16: "det ska finnas en collapse all på alla huvudmenyer").
   Menyerna är byggda på olika sätt, så knappen klickar på avsnittsrubrikerna (aria-expanded="true") och <details open> – en i taget, och läser om menyn
   efter varje klick eftersom många menyer ritas om. De som fälldes ihop kommer ihåg och "Fäll ut alla" öppnar precis dem igen (inget annat öppnas).
   Knappen läggs till automatiskt i nya menyer (även de som skapas senare). Objektbiblioteket har en egen knapp bredvid ＋ Ny mapp. Prefix lcl. */
const LCL_HOSTS = ["#v3Pal", "#v3Side", "#v3Info", "#v3FilmEdit", "#v3Pts", "#v3Ver", "#v3Render .rn-body", "#view3d .v3-vp", "#v3Dock .v3-vp", "#sitePop", "#rdock .rd-body", "body > #layout > aside", "aside .side-scroll", "#v3PlanDock"];
const lcl = { mem: new WeakMap() };
const lclKey = el => ((el.textContent || "").replace(/[▸▾▴▿▼▶◀⌄˅˄›‹»«+−–]/g, "").trim().replace(/\s+/g, " ").slice(0, 48) || el.id || el.className);   // pilen byter riktning när avsnittet öppnas/stängs – inte en del av namnet
function lclToggles(host, open) {
  const sel = open ? '[aria-expanded="true"], details[open] > summary' : '[aria-expanded="false"], details:not([open]) > summary';
  return [...host.querySelectorAll(sel)].filter(el => !el.closest(".cl-all") && !el.matches("select,input,textarea,[role=combobox],[aria-haspopup],[role=tab],[role=switch]") && el.offsetParent !== null);
}
const lclCount = host => host.querySelectorAll('[aria-expanded], details > summary').length;
const lclIsOpen = el => (el.tagName === "SUMMARY" ? el.parentElement.open : el.getAttribute("aria-expanded") === "true");
function lclClick(el) { if (el.tagName === "SUMMARY") el.parentElement.open = !el.parentElement.open; else el.click(); }
/* Fäller ihop allt som är öppet; returnerar nycklarna. */
function lclCollapse(host) {
  const done = []; const tries = new Map();
  for (let i = 0; i < 80; i++) {
    const t = lclToggles(host, true).find(el => (tries.get(lclKey(el)) || 0) < 2); if (!t) break;
    const k = lclKey(t); tries.set(k, (tries.get(k) || 0) + 1); lclClick(t); if (!lclIsOpen(t) || !t.isConnected) done.push(k);
  }
  return done;
}
function lclExpand(host, keys) {
  const want = new Set(keys), tries = new Map();
  for (let i = 0; i < 80; i++) {
    const t = lclToggles(host, false).find(el => want.has(lclKey(el)) && (tries.get(lclKey(el)) || 0) < 2); if (!t) break;
    tries.set(lclKey(t), (tries.get(lclKey(t)) || 0) + 1); lclClick(t);
  }
}
function lclUpdate(host) { const b = host.querySelector(":scope > .cl-all"); if (!b) return; const closed = (lcl.mem.get(host) || []).length > 0 && !lclToggles(host, true).length; b.textContent = closed ? "⊞ Fäll ut alla" : "⊟ Fäll ihop alla"; b.title = closed ? "Öppna de avsnitt som fälldes ihop" : "Fäll ihop alla avsnitt i menyn"; }
function lclScan() {
  const seen = new Set();
  LCL_HOSTS.forEach(sel => document.querySelectorAll(sel).forEach(host => {
    if (seen.has(host) || host.closest(".hidden") || !host.offsetParent) return; seen.add(host);
    if (host.querySelector("#v3LibCol") && host.matches("#v3Pal")) { /* biblioteket har egen knapp */ }
    let b = host.querySelector(":scope > .cl-all");
    if (lclCount(host) < 3) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement("button"); b.type = "button"; b.className = "cl-all"; host.prepend(b);
      b.onclick = e => { e.stopPropagation(); const mem = lcl.mem.get(host) || [], anyOpen = lclToggles(host, true).length > 0; if (anyOpen) { lcl.mem.set(host, lclCollapse(host)); } else { lclExpand(host, mem); lcl.mem.set(host, []); } setTimeout(() => lclUpdate(host), 30); };
      ["pointerdown", "dblclick"].forEach(t => b.addEventListener(t, e => e.stopPropagation()));
    }
    lclUpdate(host);
  }));
}
let lclT = 0; const lclSoon = () => { clearTimeout(lclT); lclT = setTimeout(lclScan, 350); };
new MutationObserver(lclSoon).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-expanded", "open", "class"] });
document.addEventListener("click", lclSoon, true); setTimeout(lclScan, 1200);
