/* Zonerna som DXF och IFC (Victors önskemål 2026-10-05), som objektexporten:
   - DXF (planritning, meter, modellens koordinater): zonens kontur på lager per status
     (ZON-KLAR …, statusfärg), överzonernas kontur (OVERZON) och "kod namn" mitt i zonen
     (ZON-NAMN), vriden så att den läses vågrätt i Lägesplans vy.
   - IFC4: en 0,5 m tjock platta per zon i statusfärg, med undersidan på arbetsytans kalibrerade
     maxhöjd, och "kod namn" som liggande 3D-text (0,5 m tjock) ovanpå, läsbar uppifrån.
     Egenskaperna (kod, namn, överzon, status, framdrift, yta, aktiviteter, datum) på plattan.
   Det som syns följer med: den öppna arbetsytan, valt datum (status) och tända zoner. */

const ZONE_PLATE_T = 0.5;                       // plattans tjocklek (m)
const ZONE_TC_KEY = "lagesplan-zonecad-tc";
const ZONE_DXF_LAYER = { planerad: "ZON-PLANERAD", pagaende: "ZON-PAGAENDE", forsenad: "ZON-FORSENAD", klar: "ZON-KLAR", pausad: "ZON-PAUSAD", ingen: "ZON-INGEN" };

/* Zonerna som exporteras, i modellens koordinater. */
function zoneCadList() {
  if (!plan || !plan.calib) return [];
  const at = $("dateInput").value || todayIso();
  return (plan.zones || []).filter(z => !(z.style && z.style.hidden)).map(z => {
    const polys = (z.polys || []).filter(p => p.length > 2).map(p => p.map(pdfToModel));
    if (!polys.length) return null;
    const st = z._status || zoneStatus(z);
    const areaOf = p => { let a = 0; p.forEach((q, i) => { const r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; }); return a / 2; };
    const area = polys.reduce((s, p) => s + Math.abs(areaOf(p)), 0);
    // Textens plats: zonens etikett, annars tyngdpunkten i den största ytan.
    let lp;
    if (z.labels && z.labels.length) lp = pdfToModel(z.labels[0]);
    else {
      const big = polys.reduce((m, p) => (Math.abs(areaOf(p)) > Math.abs(areaOf(m)) ? p : m), polys[0]);
      const A = areaOf(big);
      if (Math.abs(A) > 1e-9) {
        let cx = 0, cy = 0;
        big.forEach((q, i) => { const r = big[(i + 1) % big.length], f = q[0] * r[1] - r[0] * q[1]; cx += (q[0] + r[0]) * f; cy += (q[1] + r[1]) * f; });
        lp = [cx / (6 * A), cy / (6 * A)];
      } else lp = [big.reduce((s, q) => s + q[0], 0) / big.length, big.reduce((s, q) => s + q[1], 0) / big.length];
    }
    const items = st.items || [];
    const starts = items.map(it => it.start_date).filter(Boolean).sort(), ends = items.map(it => it.end_date).filter(Boolean).sort();
    const name = [z.code, z.name].filter(Boolean).join(" ").trim();
    // Texthöjd efter zonens storlek: ryms ungefär i zonen, 0,5–2 m.
    const h = Math.max(0.5, Math.min(2, Math.sqrt(area) * 0.8 / Math.max(4, name.length)));
    return { z, polys, area, lp, ph: st.phase, progress: st.progress, items, start: starts[0] || "", end: ends[ends.length - 1] || "", name, h, at,
      parent: String(z.parent || "").trim() };
  }).filter(Boolean);
}
/* Arbetsytans kalibrerade maxhöjd (plattans undersida). */
function zoneCadTopZ() {
  const n = v => (v === "" || v == null || !Number.isFinite(Number(v))) ? null : Number(v);
  const l = (plan && plan.level) || {};
  return n(l.z1) ?? n(l.z0);
}

function buildZonesDxf() {
  const zs = zoneCadList();
  if (!zs.length) return null;
  const rot = dxfTextRotation();
  const ents = [], used = new Set(["ZON-NAMN"]), layerAci = { "ZON-NAMN": 7, "OVERZON": 8 };
  Object.entries(ZONE_DXF_LAYER).forEach(([ph, l]) => { layerAci[l] = dxfAci(phaseColor(ph)); });
  zs.forEach(e => {
    const layer = ZONE_DXF_LAYER[e.ph] || "ZON-INGEN";
    used.add(layer);
    e.polys.forEach(p => ents.push({ t: "POLY", layer, pts: p }));
    if (e.name) ents.push({ t: "TEXT", layer: "ZON-NAMN", x: e.lp[0], y: e.lp[1], h: e.h, rot, s: e.name, mid: true });
  });
  // Överzonerna (WBS): konturen runt sina zoner.
  if (typeof wbsOn === "function" && wbsOn() && typeof wbsGroups === "function") {
    wbsGroups().forEach(g => (g.polys || []).forEach(rings => rings.forEach(r => { if (r.length > 2) { used.add("OVERZON"); ents.push({ t: "POLY", layer: "OVERZON", pts: r.map(pdfToModel) }); } })));
  }
  return { text: dxfWrite(ents, [...used], layerAci), n: zs.length };
}

function buildZonesIfc() {
  const zs = zoneCadList();
  if (!zs.length) return null;
  const z0 = zoneCadTopZ() ?? 0;
  const at = $("dateInput").value || todayIso();
  const doc = ifcDoc("4D-planering – " + plan.name, "Zoner från Lägesplan " + at), E = doc.E;
  const zDir = E("IFCDIRECTION((0.,0.,1.))");
  const { rx, ry } = ifcReadDir();
  const elems = [];
  zs.forEach(e => {
    const [ox, oy] = e.lp;
    const pl = doc.place([ox, oy, z0]);
    // Plattan: en extruderad yta per polygon (lokala koordinater kring textpunkten).
    const solids = e.polys.map(p => {
      const pts = [...p, p[0]].map(([x, y]) => E(`IFCCARTESIANPOINT(${ifcPt([x - ox, y - oy])})`));
      const prof = E(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${E(`IFCPOLYLINE((${pts.join(",")}))`)})`);
      const sol = E(`IFCEXTRUDEDAREASOLID(${prof},$,${zDir},${ifcNum(ZONE_PLATE_T)})`);
      E(`IFCSTYLEDITEM(${sol},(${doc.style("zon-" + e.ph, phaseColor(e.ph), PHASE_LABELS[e.ph] || e.ph, 0.25)}),$)`);
      return sol;
    });
    const plate = doc.proxy(e.name || "Zon", PHASE_LABELS[e.ph] || e.ph, "4D-zon", pl, doc.shape(solids.join(","), "SweptSolid"), e.z.id);
    elems.push(plate);
    doc.props(plate, [["Kod", e.z.code || ""], ["Namn", e.z.name || ""], ["Överzon", e.parent], ["Status", PHASE_LABELS[e.ph] || e.ph],
      ["Framdrift %", e.progress == null ? 0 : e.progress], ["Yta m²", Math.round(e.area * 10) / 10], ["Aktiviteter", e.items.length],
      ["Start", e.start], ["Slut", e.end], ["Arbetsyta", plan.name || ""], ["Status per", at]]);
    // Texten ovanpå plattan (läses uppifrån), 0,5 m tjock.
    if (!e.name) return;
    const tpl = doc.place([ox, oy, z0 + ZONE_PLATE_T]);
    const mesh = ifcTextSolid(doc, e.name, { h: e.h, t: IFC_TEXT_T, rx, ry, start: null });
    if (mesh) elems.push(doc.proxy(e.name, "Namn", "4D-zontext", tpl, doc.shape(mesh, "Tessellation"), e.z.id));
  });
  return { text: doc.finish(elems, `Zoner ${plan.name} ${at}.ifc`), n: zs.length, z0, levelSet: zoneCadTopZ() != null };
}

/* Lokal kopia alltid, och till Trimble Connect (Lägesplan export) om rutan är ikryssad. */
function zoneCadSave(bytes, name, type, what) {
  downloadBlob(new Blob([bytes], { type }), name);
  setSaveStatus(`🟧 ${what}.`);
  const tc = $("zoneCadToTc");
  if (!tc || !tc.checked) return Promise.resolve();
  if (!window.opener || window.opener.closed) { setSaveStatus(`🟧 ${what}. ⚠ Inte sparad i Trimble Connect – öppna lägesplanen via 🗺️ i 4D-planering för det.`); return Promise.resolve(); }
  setSaveStatus(`🟧 ${what} – sparar i Trimble Connect…`);
  return askOpener("tcUpload", { folder: DXF_TC_FOLDER, files: [new File([bytes], name, { type })] }, 5 * 60 * 1000)
    .then(res => setSaveStatus(`🟧 ${what} och sparad i Trimble Connect (${res.folder || DXF_TC_FOLDER}).`))
    .catch(e => setSaveStatus(`🟧 ${what}. ⚠ Kunde inte spara i Trimble Connect: ${e.message}`));
}
function zoneCadCheck() {
  if (!plan) return false;
  if (!plan.calib) { alert("Kalibrera arbetsytan mot 3D först – zonerna exporteras i modellens koordinater."); return false; }
  if (typeof layerVisible === "function" && !layerVisible("zones")) { alert("Tänd lagret Zoner först – exporten tar med det som syns."); return false; }
  return true;
}
function exportZonesDxf() {
  if (!zoneCadCheck()) return;
  const r = buildZonesDxf();
  if (!r) { alert("Inga zoner att exportera på den här arbetsytan."); return; }
  return zoneCadSave(dxfCp1252(r.text), `Zoner ${plan.name} ${$("dateInput").value}.dxf`, "application/dxf", `${r.n} zoner exporterade som DXF (meter, modellens koordinater)`);
}
function exportZonesIfc() {
  if (!zoneCadCheck()) return;
  const r = buildZonesIfc();
  if (!r) { alert("Inga zoner att exportera på den här arbetsytan."); return; }
  const lvl = r.levelSet ? `på +${(Math.round(r.z0 * 100) / 100).toFixed(2)}` : "på +0 (ingen maxhöjd kalibrerad)";
  return zoneCadSave(new TextEncoder().encode(r.text), `Zoner ${plan.name} ${$("dateInput").value}.ifc`, "application/x-step", `${r.n} zoner exporterade som IFC-plattor ${lvl}`);
}

document.addEventListener("DOMContentLoaded", () => {
  if ($("btnZoneDxf")) $("btnZoneDxf").onclick = exportZonesDxf;
  if ($("btnZoneIfc")) $("btnZoneIfc").onclick = exportZonesIfc;
  const tc = $("zoneCadToTc");
  if (tc) {
    try { tc.checked = localStorage.getItem(ZONE_TC_KEY) !== "0"; } catch (e) {}
    tc.onchange = () => { try { localStorage.setItem(ZONE_TC_KEY, tc.checked ? "1" : "0"); } catch (e) {} };
  }
});
