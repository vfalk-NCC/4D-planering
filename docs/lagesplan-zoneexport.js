/* Zonerna till Excel (Victors önskemål 2026-10-05). Lägesplan räknar fram vilka zoner (och
   överzoner) varje aktivitet ligger i – för alla arbetsytor – och sparar det i
   zone_export.json. Den avancerade Excel-modulen (Koppling4DAvancerat.bas) läser filen och skriver
   kolumnerna "Zon (4D)" och "Överzon (4D)" på raderna samt fliken "Zoner (4D)".
   Filen skrivs bara när innehållet ändrats (zoner, kopplingar, positioner eller dagens status). */

const ZONE_EXPORT_FILE = "zone_export.json";

/* Modell (m) -> PDF för en viss arbetsytas kalibrering. */
function modelToPdfFor(calib, x, y) {
  const [m1, m2] = calib.model, [p1, p2] = calib.pdf;
  const mx = m2[0] - m1[0], my = m2[1] - m1[1], px = p2[0] - p1[0], py = p2[1] - p1[1];
  const d = mx * mx + my * my;
  const ar = (px * mx + py * my) / d, ai = (py * mx - px * my) / d;
  const dx = x - m1[0], dy = y - m1[1];
  return [p1[0] + ar * dx - ai * dy, p1[1] + ai * dx + ar * dy];
}
/* PDF-enheter per meter i kvadrat (för ytan i m²). */
function pdfUnitsPerM2(calib) {
  const [m1, m2] = calib.model, [p1, p2] = calib.pdf;
  const dm = Math.hypot(m2[0] - m1[0], m2[1] - m1[1]), dp = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  return dm > 0 ? (dp / dm) ** 2 : 0;
}

/* Aktiviteterna i en zon på en viss arbetsyta – som itemsForZone, men för alla aktiviteter
   (inga filter) och med arbetsytans egen kalibrering och höjd. */
function zoneExportItems(p, zone, posPdf) {
  const rule = zone.rule || { field: "auto" };
  if (rule.field && rule.field !== "auto") {
    const v = String(rule.value || "").trim().toLowerCase();
    return v ? items.filter(it => String(it[rule.field] || "").toLowerCase().includes(v)) : [];
  }
  const code = normCode(zone.code), polys = (zone.polys || []).filter(q => q.length > 2);
  return items.filter(it => (code && itemCodes(it).has(code)) ||
    (posPdf && polys.length && posPdf.has(it.id) && polys.some(poly => pointInPoly(posPdf.get(it.id), poly))));
}
function zoneExportPositions(p) {
  if (!p.calib || !positions.length) return null;
  const n = v => (v === "" || v == null || !Number.isFinite(Number(v))) ? null : Number(v);
  const l = p.level || {}, z0 = n(l.z0), z1 = n(l.z1), out = new Map();
  positions.forEach(q => {
    const zc = (q.z0 + q.z1) / 2;
    if ((z0 !== null && zc < z0) || (z1 !== null && zc > z1)) return;
    out.set(q.id, modelToPdfFor(p.calib, q.x, q.y));
  });
  return out;
}

/* Innehållet i zone_export.json (utan tidsstämpel). */
function zoneExportData() {
  const day = todayIso();
  const zoneLabel = z => [z.code, z.name].filter(Boolean).join(" ");
  const summary = list => {
    const starts = list.map(it => it.start_date).filter(Boolean).sort(), ends = list.map(it => it.end_date).filter(Boolean).sort();
    const ph = zonePhase(list, day);
    return { items: list.length, progress: zoneProgress(list), status: list.length ? PHASE_LABELS[ph] || ph : "", start: starts[0] || null, end: ends[ends.length - 1] || null };
  };
  const zonesOut = [], parentsOut = [], byItem = new Map();
  const multi = plans.filter(p => (p.zones || []).length).length > 1;
  const note = (id, kind, label) => {
    if (!byItem.has(id)) byItem.set(id, { zones: new Set(), parents: new Set() });
    byItem.get(id)[kind].add(label);
  };
  plans.forEach(p => {
    const zones = p.zones || [];
    if (!zones.length) return;
    const posPdf = zoneExportPositions(p), k = p.calib ? pdfUnitsPerM2(p.calib) : 0;
    const groups = new Map();
    zones.forEach(z => {
      const list = zoneExportItems(p, z, posPdf);
      const area = k ? (z.polys || []).filter(q => q.length > 2).reduce((a, q) => a + Math.abs(polyArea(q)), 0) / k : null;
      const parent = String(z.parent || "").trim().replace(/\s+/g, " ");
      const label = zoneLabel(z);
      zonesOut.push({ plan: p.name || "", code: z.code || "", name: z.name || "", parent, area_m2: area != null ? Math.round(area * 10) / 10 : null, ...summary(list) });
      list.forEach(it => { note(it.id, "zones", multi ? `${label} (${p.name})` : label); if (parent) note(it.id, "parents", parent); });
      if (parent) {
        const key = parent.toUpperCase();
        if (!groups.has(key)) groups.set(key, { name: parent, zones: 0, area: 0, items: new Map() });
        const g = groups.get(key);
        g.zones++; if (area != null) g.area += area;
        list.forEach(it => g.items.set(it.id, it));
      }
    });
    groups.forEach(g => parentsOut.push({ plan: p.name || "", name: g.name, zones: g.zones, area_m2: Math.round(g.area * 10) / 10 || null, ...summary([...g.items.values()]) }));
  });
  const cmp = (a, b) => String(a).localeCompare(String(b), "sv", { numeric: true });
  zonesOut.sort((a, b) => cmp(a.plan, b.plan) || cmp(a.parent, b.parent) || cmp(a.code, b.code));
  parentsOut.sort((a, b) => cmp(a.plan, b.plan) || cmp(a.name, b.name));
  const itemsOut = [...byItem.entries()].map(([id, v]) => ({ id, zones: [...v.zones].sort(cmp).join("; "), parents: [...v.parents].sort(cmp).join("; ") }));
  return { date: day, zones: zonesOut, parents: parentsOut, items: itemsOut };
}

let zoneExportTimer = 0, zoneExportSig = null, zoneExportBusy = false;
function scheduleZoneExport(delay = 5000) {
  clearTimeout(zoneExportTimer);
  zoneExportTimer = setTimeout(runZoneExport, delay);
}
async function runZoneExport() {
  if (typeof token === "undefined" || !token || !Array.isArray(plans) || !Array.isArray(items) || !items.length) return;
  if (zoneExportBusy) { scheduleZoneExport(); return; }
  if (!plans.some(p => (p.zones || []).length)) return;
  zoneExportBusy = true;
  try {
    const data = zoneExportData(), sig = JSON.stringify(data);
    if (zoneExportSig === null) { // första gången: jämför med filen som redan finns
      const cur = await ghGetFile(token, dataPath(ZONE_EXPORT_FILE)).then(r => r && r.data).catch(() => null);
      if (cur && typeof cur === "object" && !Array.isArray(cur)) { const { updated_at, by, ...rest } = cur; zoneExportSig = JSON.stringify(rest); }
      else zoneExportSig = "";
    }
    if (sig === zoneExportSig) return;
    const rec = { ...data, updated_at: new Date().toISOString(), by: (typeof settings !== "undefined" && settings.userName) || null };
    await ghWriteJSON(token, dataPath(ZONE_EXPORT_FILE), () => rec, "Lägesplan: zoner till Excel");
    zoneExportSig = sig;
  } catch (e) { console.warn("Kunde inte spara zonerna till Excel", e); }
  finally { zoneExportBusy = false; }
}

document.addEventListener("DOMContentLoaded", () => {
  // Zonlistan ritas om när zoner, kopplingar, datum eller data ändras – då kan exporten ha ändrats.
  const origList = renderZoneList;
  renderZoneList = function () { const r = origList.apply(this, arguments); scheduleZoneExport(); return r; };
});
