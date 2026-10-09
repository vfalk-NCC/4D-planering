/* Lägesplan – raderingsskydd för zonerna (Victor 2026-10-07: "Gör ett lås på WBS-zoner, dom ska vara
   svåra att radera").

   - Skyddet är PÅ från början, i båda zonlagren (WBS och WBS - Prefab). Då går det inte att ta bort
     zoner eller överzoner alls – varken med 🗑 eller Delete-tangenten.
   - Stänger man av det (🛡-knappen under Zoner) gäller det bara den öppna planen och det valda
     lagret, och det slås på igen av sig självt när man byter plan eller lager eller laddar om sidan.
   - Även med skyddet av måste man skriva RADERA för att ta bort zoner; Ctrl+Z ångrar efteråt.
   - En lägesplan med zoner tas bara bort om man skriver planens namn.
   Släckta zoner (som kan se borttagna ut) visas under listan med en knapp för att tända alla. */

const zoneGuardOpen = new Set(); // "planId|lager" där skyddet är avstängt just nu
const zoneGuardKey = () => (typeof plan !== "undefined" && plan ? `${plan.id}|${typeof zoneSetOf === "function" ? zoneSetOf(plan) : "main"}` : "");
const zoneDeleteGuarded = () => !zoneGuardOpen.has(zoneGuardKey());
const zoneGuardLayer = () => (typeof zoneSetName === "function" ? zoneSetName() : "WBS");
function zoneGuardReset() { zoneGuardOpen.clear(); zoneGuardUi(); }
function zoneGuardUi() {
  const b = document.getElementById("btnZoneGuard");
  if (!b) return;
  const on = zoneDeleteGuarded();
  b.textContent = on ? "🛡 Raderingsskydd på" : "⚠ Raderingsskydd av";
  b.classList.toggle("active", on);
  b.classList.toggle("zg-off", !on);
  b.title = on ? `Zonerna i ${zoneGuardLayer()} kan inte tas bort. Klicka för att stänga av skyddet tillfälligt (slås på igen när du byter plan eller lager).`
    : "Zonerna kan tas bort (du måste ändå skriva RADERA). Klicka för att slå på skyddet igen.";
}
async function toggleZoneGuard() {
  const k = zoneGuardKey();
  if (!k) return;
  if (zoneGuardOpen.has(k)) { zoneGuardOpen.delete(k); setSaveStatus(`🛡 Raderingsskyddet är på igen (${zoneGuardLayer()}).`); }
  else {
    if (!await uiConfirm(`Stänga av raderingsskyddet för zonerna i ${zoneGuardLayer()}?\n\nDet gäller bara den här planen och slås på igen när du byter plan eller lager eller laddar om sidan. Du måste ändå skriva RADERA för att ta bort en zon.`)) return;
    zoneGuardOpen.add(k);
    setSaveStatus(`⚠ Raderingsskyddet är av för ${zoneGuardLayer()} – slå på det igen när du är klar.`);
  }
  zoneGuardUi();
}
/* true = stoppat (skyddet är på). */
function zoneGuardBlock(what) {
  if (!zoneDeleteGuarded()) return false;
  setSaveStatus(`🛡 ${what} går inte – zonerna i ${zoneGuardLayer()} är skyddade mot radering. Stäng av raderingsskyddet under Zoner först.`);
  const b = document.getElementById("btnZoneGuard");
  if (b) { b.classList.remove("zg-flash"); void b.offsetWidth; b.classList.add("zg-flash"); }
  return true;
}
/* Skriv RADERA för att ta bort zonerna zs. */
async function zoneGuardConfirm(zs) {
  const codes = zs.map(z => z.code || z.name || "zon");
  const label = zs.length === 1 ? `zon ${codes[0]}` : `${zs.length} zoner (${codes.slice(0, 8).join(", ")}${codes.length > 8 ? " …" : ""})`;
  const t = await uiPrompt(`Ta bort ${label} i ${zoneGuardLayer()}?\n\nSkriv RADERA för att bekräfta. (Ctrl+Z ångrar direkt efteråt.)`, "");
  if (t === null) return false;
  if (t.trim().toUpperCase() !== "RADERA") { setSaveStatus("Inget togs bort – skriv RADERA för att bekräfta."); return false; }
  return true;
}

/* Släckta zoner under listan: "N av M zoner är släckta · Tänd alla". */
function zoneHiddenInfo() {
  const el = document.getElementById("zoneHiddenInfo");
  if (!el) return;
  const zs = (typeof plan !== "undefined" && plan && plan.zones) || [];
  const hid = zs.filter(z => z.style && z.style.hidden);
  if (!hid.length) { el.classList.add("hidden"); el.innerHTML = ""; return; }
  el.classList.remove("hidden");
  el.innerHTML = `👁 ${hid.length} av ${zs.length} zoner är släckta (finns kvar, syns inte) <button type="button" class="zh-all">Tänd alla</button>`;
  el.querySelector(".zh-all").onclick = () => { if (typeof setZoneHidden === "function") setZoneHidden(hid.map(z => z.id), false); };
}

if (typeof renderZones === "function") {
  const zgOrigRender = renderZones;
  renderZones = function () { const r = zgOrigRender.apply(this, arguments); zoneHiddenInfo(); zoneGuardUi(); return r; };
}
document.addEventListener("DOMContentLoaded", () => {
  const b = document.getElementById("btnZoneGuard");
  if (b) b.onclick = toggleZoneGuard;
  zoneGuardUi();
});
