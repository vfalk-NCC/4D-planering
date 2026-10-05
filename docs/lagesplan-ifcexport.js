/* 3D-objekten som IFC (Victors önskemål 2026-10-05): samma som DXF-exporten, fast i 3D. Varje
   markering (samma som syns i Lägesplan) blir en cylinder ovanpå objektets högsta punkt (max
   plushöjd) i statusfärgen och en liggande 3D-text med objektets namn ("L12") bredvid, 0,5 m tjock,
   som läses uppifrån i planvyn från samma håll som vyn i Lägesplan. Modellens koordinater i meter. IFC4.
   Cylindern bär egenskaperna (aktivitet, status, framdrift, datum, zon) i "4D-planering".
   Texten är byggd av streck (eget enkelt typsnitt) som tunna ytor, så att den syns i alla
   IFC-visare utan typsnitt. */

const IFC_CYL_R = 0.4, IFC_CYL_H = 0.6, IFC_GAP = 0.1; // meter
const IFC_TEXT_H = 0.8, IFC_TEXT_T = 0.5; // texthöjd (i plan), tjocklek (uppåt); typsnitt och skrivare i ifc-writer.js

/* Läsriktningen (samma som DXF:en: vågrätt i Lägesplans vy). */
function ifcReadDir() { const rr = dxfTextRotation() * Math.PI / 180; return { rx: Math.cos(rr), ry: Math.sin(rr) }; }

/* Bygger IFC-filen för 3D-objekten. Returnerar { text, n } eller null om inga objekt syns. */
function buildObjectsIfc() {
  const marks = objExportMarkers();
  if (!marks.length) return null;
  const at = $("dateInput").value || todayIso();
  const doc = ifcDoc("4D-planering – " + (plan ? plan.name : ""), "3D-objekt från Lägesplan " + at), E = doc.E;
  // Gemensam geometri: cylindern (samma för alla).
  const prof = E(`IFCCIRCLEPROFILEDEF(.AREA.,$,$,${ifcNum(IFC_CYL_R)})`);
  const zDir = E("IFCDIRECTION((0.,0.,1.))");
  const { rx, ry } = ifcReadDir();
  const elems = [];
  const zoneOf = typeof zoneExportItems === "function" && typeof zoneExportPositions === "function"
    ? (() => { const pos = zoneExportPositions(plan); const zs = (plan.zones || []).map(z => [z, new Set(zoneExportItems(plan, z, pos).map(x => x.id))]); return it => zs.filter(([, st]) => st.has(it.id)).map(([z]) => [z.code, z.name].filter(Boolean).join(" ")).join(", "); })()
    : () => "";
  // Namnen placeras fritt från varandra (samma regel som DXF:en), med textens verkliga bredd.
  const lay = objLabelLayout(marks, { h: IFC_TEXT_H, r: IFC_CYL_R, gap: 0.25, widthOf: n => ifcTextStrokes(n).width * IFC_TEXT_H / 6 });
  marks.forEach((mk, i) => {
    const pl = doc.place([mk.x, mk.y, mk.zTop + IFC_GAP]);
    // Cylindern i statusfärg.
    const cyl = E(`IFCEXTRUDEDAREASOLID(${prof},$,${zDir},${ifcNum(IFC_CYL_H)})`);
    E(`IFCSTYLEDITEM(${cyl},(${doc.style(mk.ph, phaseColor(mk.ph), PHASE_LABELS[mk.ph] || mk.ph)}),$)`);
    const it = mk.it, prog = it.status === "klar" ? 100 : (Number(it.progress) || 0);
    const marker = doc.proxy(mk.name || it.object_name || "Objekt", PHASE_LABELS[mk.ph] || mk.ph, "4D-markering", pl, doc.shape(cyl, "SweptSolid"), it.id);
    elems.push(marker);
    // Egenskaperna (syns när man klickar på cylindern).
    doc.props(marker, [["Objekt", it.object_name || ""], ["Aktivitet", it.activity || ""], ["Status", PHASE_LABELS[mk.ph] || mk.ph],
      ["Framdrift %", prog], ["Start", it.start_date || ""], ["Slut", it.end_date || ""], ["Område", it.area || ""],
      ["Entreprenör", it.contractor || ""], ["Zon", zoneOf(it)], ["Antal objekt", mk.members.length], ["Status per", at], ["4D-ID", it.id]]);
    // 3D-texten (Victors önskemål 2026-10-05): liggande så att den läses uppifrån i planvyn, vänd som
    // Lägesplans vy, bredvid cylindern (täcker den inte uppifrån), 0,5 m tjocka bokstäver uppåt
    // från samma nivå som cylinderns fot.
    if (!mk.name) return;
    const mesh = ifcTextSolid(doc, mk.name, { h: IFC_TEXT_H, t: IFC_TEXT_T, rx, ry, start: lay[i].da, across: lay[i].dc + IFC_TEXT_H / 2 });
    if (mesh) elems.push(doc.proxy(`${mk.name} – text`, "Namn", "4D-text", pl, doc.shape(mesh, "Tessellation"), it.id));
  });
  return { text: doc.finish(elems, `3D-objekt ${plan ? plan.name : ""} ${at}.ifc`), n: marks.length };
}

async function exportObjectsIfc() {
  if (!plan) return;
  if (!$("showObjects").checked) { alert("Tänd 3D-objekten (Visa objekten på ritningen) först – exporten tar med det som syns."); return; }
  const r = buildObjectsIfc();
  if (!r) { alert("Inga 3D-objekt syns på planen (kalibrera och hämta positioner, eller ändra filtret)."); return; }
  const name = `3D-objekt ${plan.name} ${$("dateInput").value}.ifc`;
  const bytes = new TextEncoder().encode(r.text); // ren ASCII (å/ä/ö som \X2\)
  downloadBlob(new Blob([bytes], { type: "application/x-step" }), name); // alltid en lokal kopia
  setSaveStatus(`🧊 ${r.n} objekt exporterade som IFC (3D, meter, modellens koordinater).`);
  const tc = $("cadExportToTc");
  if (!tc || !tc.checked) return;
  if (!window.opener || window.opener.closed) {
    setSaveStatus(`🧊 ${r.n} objekt nedladdade som IFC. ⚠ Inte sparad i Trimble Connect – öppna lägesplanen via 🗺️ i 4D-planering för det.`);
    return;
  }
  const file = new File([bytes], name, { type: "application/x-step" });
  setSaveStatus(`🧊 ${r.n} objekt nedladdade som IFC – sparar i Trimble Connect…`);
  return askOpener("tcUpload", { folder: DXF_TC_FOLDER, files: [file] }, 5 * 60 * 1000)
    .then(res => setSaveStatus(`🧊 ${r.n} objekt nedladdade och sparade i Trimble Connect (${res.folder || DXF_TC_FOLDER}).`))
    .catch(e => setSaveStatus(`🧊 ${r.n} objekt nedladdade. ⚠ Kunde inte spara i Trimble Connect: ${e.message}`));
}

document.addEventListener("DOMContentLoaded", () => {
  const b = $("btnObjIfc");
  if (b) b.onclick = exportObjectsIfc;
});
