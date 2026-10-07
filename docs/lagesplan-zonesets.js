/* Lägesplan – två uppsättningar zoner (Victor 2026-10-07: "lägga in ytterligare WBS-zoner som kallas
   WBS - Prefab med samma valmöjligheter").

   Växeln överst i Zoner väljer vilken uppsättning man arbetar med: WBS (de vanliga zonerna) eller
   WBS - Prefab. Den valda ligger i plan.zones / plan.wbs, så allt som finns för zonerna (rita, överzoner,
   utseende, lås, ångra, DXF/IFC-export …) fungerar likadant för båda. I filen sparas de alltid på
   samma ställen: de vanliga i zones/wbs (som förut – Excel-kopplingen och zonexporten läser bara dem)
   och prefab-zonerna i zones_prefab/wbs_prefab. */

const ZONE_SETS = { main: "WBS", prefab: "WBS - Prefab" };
const ZONE_SET_KEY = "lagesplan-zoneset";
const zoneSetOf = p => (p && p._zoneSet) || "main";
const zoneSetName = (p = typeof plan !== "undefined" ? plan : null) => ZONE_SETS[zoneSetOf(p)];
/* De vanliga zonerna (WBS) oavsett vilken uppsättning som är vald – för Excel-kopplingen m.m. */
const zonesMainOf = p => (!p ? [] : p._zoneSet === "prefab" ? (p._zonesMain || []) : (p.zones || []));

/* Byter vilken uppsättning som ligger i p.zones / p.wbs. */
function planSwitchZoneSet(p, id) {
  if (!p || !ZONE_SETS[id] || zoneSetOf(p) === id) return;
  if (id === "prefab") {
    p._zonesMain = p.zones || []; p._wbsMain = p.wbs;
    p.zones = p.zones_prefab || []; p.wbs = p.wbs_prefab;
    delete p.zones_prefab; delete p.wbs_prefab;
    p._zoneSet = "prefab";
  } else {
    p.zones_prefab = p.zones || []; p.wbs_prefab = p.wbs;
    p.zones = p._zonesMain || []; p.wbs = p._wbsMain;
    delete p._zonesMain; delete p._wbsMain; delete p._zoneSet;
  }
  ["wbs", "wbs_prefab"].forEach(k => { if (p[k] === undefined || p[k] === null) delete p[k]; });
}
/* Posten som sparas: alltid vanliga zoner i zones/wbs och prefab i zones_prefab/wbs_prefab. */
function planRecordForSave(p) {
  const rec = { ...p };
  if (p._zoneSet === "prefab") {
    rec.zones_prefab = p.zones || []; rec.wbs_prefab = p.wbs;
    rec.zones = p._zonesMain || []; rec.wbs = p._wbsMain;
  }
  delete rec._zonesMain; delete rec._wbsMain; delete rec._zoneSet;
  ["wbs", "wbs_prefab"].forEach(k => { if (rec[k] === undefined || rec[k] === null) delete rec[k]; });
  if (Array.isArray(rec.zones_prefab) && !rec.zones_prefab.length && !rec.wbs_prefab) delete rec.zones_prefab;
  return rec;
}
function zoneSetStored() { try { const v = localStorage.getItem(ZONE_SET_KEY); return ZONE_SETS[v] ? v : "main"; } catch (e) { return "main"; } }
/* När en plan öppnas: samma uppsättning som senast. */
function zoneSetRestore(p) { planSwitchZoneSet(p, zoneSetStored()); zoneSetRenderSeg(); }

function zoneSetRenderSeg() {
  const seg = document.getElementById("zoneSetSeg");
  if (!seg) return;
  const cur = zoneSetOf(typeof plan !== "undefined" ? plan : null);
  const p = typeof plan !== "undefined" ? plan : null;
  const count = id => !p ? 0 : id === "main" ? zonesMainOf(p).length : (p._zoneSet === "prefab" ? (p.zones || []) : (p.zones_prefab || [])).length;
  seg.querySelectorAll("[data-zset]").forEach(b => {
    const on = b.dataset.zset === cur;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    const n = count(b.dataset.zset);
    b.innerHTML = `${ZONE_SETS[b.dataset.zset]}${n ? ` <small>${n}</small>` : ""}`;
  });
}
function setZoneSet(id) {
  if (!ZONE_SETS[id]) return;
  try { localStorage.setItem(ZONE_SET_KEY, id); } catch (e) { /* bara den här gången */ }
  if (typeof plan === "undefined" || !plan) { zoneSetRenderSeg(); return; }
  if (zoneSetOf(plan) === id) { zoneSetRenderSeg(); return; }
  if (typeof zonePoly !== "undefined" && zonePoly && typeof cancelZonePoly === "function") cancelZonePoly();
  if (typeof selectZone === "function") selectZone(null);
  if (typeof closeEditor === "function") closeEditor();
  if (typeof selectedWbsKey !== "undefined") { try { selectedWbsKey = null; } catch (e) { /* const */ } }
  planSwitchZoneSet(plan, id);
  zoneSetRenderSeg();
  if (typeof renderZones === "function") renderZones();
  if (typeof renderLayerPanel === "function") renderLayerPanel();
  if (typeof setSaveStatus === "function") setSaveStatus(`🟧 Zoner: ${ZONE_SETS[id]}`);
}

document.addEventListener("DOMContentLoaded", () => {
  const seg = document.getElementById("zoneSetSeg");
  if (seg) seg.addEventListener("click", e => { const b = e.target.closest("[data-zset]"); if (b) setZoneSet(b.dataset.zset); });
  zoneSetRenderSeg();
});
// Antalet zoner i växeln följer med när zoner ritas eller tas bort.
if (typeof renderZones === "function") {
  const zsOrigRender = renderZones;
  renderZones = function () { const r = zsOrigRender.apply(this, arguments); zoneSetRenderSeg(); return r; };
}
