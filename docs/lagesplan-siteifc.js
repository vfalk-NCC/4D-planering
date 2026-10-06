/* Lägesplan – UE-lag och noteringar som IFC (Victors önskemål 2026-10-06: "en exportknapp för
   noteringar och UE-lagen till IFC, med samma upplägg som övriga IFC-exporter").

   Det som syns på planen för det valda datumet, i modellens koordinater (meter), på arbetsytans
   kalibrerade maxhöjd (som zonplattorna):
   – UE-lag: en skylt i UE:ns färg (som lagrutan på planen) med förkortning × personer, uppgift och
     datum som liggande 3D-text ovanpå, läsbar uppifrån i samma riktning som Lägesplans vy.
   – Noteringar: en ljus skylt med texten, en pil ner till punkten och en markering vid punkten.
   Egenskaperna (UE, personer, uppgift, aktivitet, datum, text …) ligger i "4D-planering". */

const SITE_IFC_PLATE_T = 0.3;   // skyltens tjocklek (m)
const SITE_IFC_TEXT_T = 0.15;   // textens tjocklek ovanpå skylten (m)
const SITE_IFC_PAD = 0.45;      // marginal i skylten (m)

/* Lagen och noteringarna som syns nu (lager tänt, datum). */
function siteIfcItems() {
  return (typeof siteItems !== "undefined" ? siteItems : [])
    .filter(x => (x.type === "crew" || x.type === "note") && x.pts && x.pts[0] && siteShown(x));
}
/* Textens bredd i meter vid höjden h. */
const siteIfcTextW = (t, h) => ifcTextStrokes(t).width * h / 6;
const siteIfcLum = hex => { const n = parseInt(String(hex).slice(1), 16); return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; };

/* En skylt (rätblock i läsriktningen) med textrader ovanpå. lines: [{ t, h }]. Returnerar [skyltens id, text-id]. */
function siteIfcSign(doc, { center, z, w, hgt, rx, ry, color, label, lines, textStyle }) {
  const E = doc.E, zDir = E("IFCDIRECTION((0.,0.,1.))");
  const pos = E(`IFCAXIS2PLACEMENT2D(${E("IFCCARTESIANPOINT((0.,0.))")},${E(`IFCDIRECTION(${ifcPt([rx, ry])})`)})`);
  const prof = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${pos},${ifcNum(w)},${ifcNum(hgt)})`);
  const plate = E(`IFCEXTRUDEDAREASOLID(${prof},$,${zDir},${ifcNum(SITE_IFC_PLATE_T)})`);
  E(`IFCSTYLEDITEM(${plate},(${doc.style("sign-" + color, color, label)}),$)`);
  // Raderna uppifrån och ned, vänsterställda (start = −w/2 + marginal), "uppåt" i planen = (−ry, rx).
  let y = hgt / 2 - SITE_IFC_PAD * 0.8;
  const meshes = [];
  lines.forEach(({ t, h }) => {
    if (!t) return;
    const m = ifcTextSolid(doc, t, { h, t: SITE_IFC_TEXT_T, rx, ry, start: -w / 2 + SITE_IFC_PAD, across: y - h / 2, style: textStyle });
    if (m) meshes.push(m);
    y -= h * 1.35;
  });
  return { plate, meshes };
}

/* Bygger IFC-filen. Returnerar { text, crews, notes, z0, levelSet } eller null. */
function buildSiteIfc() {
  const list = siteIfcItems();
  if (!list.length) return null;
  const z0 = (typeof zoneCadTopZ === "function" ? zoneCadTopZ() : null) ?? 0;
  const at = $("dateInput").value || todayIso();
  const doc = ifcDoc("4D-planering – " + (plan ? plan.name : ""), "UE-lag och noteringar från Lägesplan " + at), E = doc.E;
  const zDir = E("IFCDIRECTION((0.,0.,1.))");
  const { rx, ry } = ifcReadDir();
  const elems = [];
  let crews = 0, notes = 0;
  list.forEach(x => {
    if (x.type === "crew") {
      const ue = typeof ueById === "function" ? ueById(x.ue) : null, color = typeof ueColor === "function" ? ueColor(ue) : "#0f766e";
      const act = x.act && typeof famInfo === "function" ? famInfo(x.act, at) : null;
      const title = typeof crewTitle === "function" ? crewTitle(x) : (ue ? ue.short : "Lag");
      let task = x.task || (act ? act.title : "") || (ue && ue.short ? ue.name || "" : "");
      if (task.length > 32) task = task.slice(0, 31) + "…";
      const when = x.from && x.from === x.to ? shortDate(x.from) : datesText(x);
      const lines = [{ t: title, h: 1.0 }, { t: task, h: 0.6 }, { t: when, h: 0.45 }].filter(l => l.t);
      const w = Math.max(...lines.map(l => siteIfcTextW(l.t, l.h))) + SITE_IFC_PAD * 2;
      const hgt = lines.reduce((a, l) => a + l.h * 1.35, 0) - lines[lines.length - 1].h * 0.35 + SITE_IFC_PAD * 1.6;
      const textStyle = siteIfcLum(color) < 0.6 ? doc.textStyleLight : doc.textStyle;
      const s = siteIfcSign(doc, { z: z0, w, hgt, rx, ry, color, label: "UE " + (ue ? ue.short || ue.name : ""), lines, textStyle });
      const pl = doc.place([x.pts[0][0], x.pts[0][1], z0]);
      const el = doc.proxy(title, ue ? ue.name || ue.short || "" : "Lag", "4D-lag", pl, doc.shape(s.plate, "SweptSolid"), x.id);
      elems.push(el);
      doc.props(el, [["UE", ue ? ue.name || "" : ""], ["Förkortning", ue ? ue.short || "" : ""], ["Personer", Number(x.persons) || 0],
        ["Uppgift", x.task || ""], ["Aktivitet", act ? act.title : ""], ["Från", x.from || ""], ["Till", x.to || ""], ["Anteckning", x.note || ""],
        ["Arbetsyta", plan ? plan.name || "" : ""], ["Status per", at]]);
      if (s.meshes.length) {
        const tpl = doc.place([x.pts[0][0], x.pts[0][1], z0 + SITE_IFC_PLATE_T]);
        elems.push(doc.proxy(`${title} – text`, "Text", "4D-lagtext", tpl, doc.shape(s.meshes.join(","), "Tessellation"), x.id));
      }
      crews++;
    } else {
      const [a, t] = [x.pts[0], x.pts[1] || x.pts[0]];
      const color = x.color || "#111827";
      const raw = typeof wrapText === "function" ? wrapText(x.text || "", 32) : String(x.text || "");
      const lines = [x.name ? { t: x.name, h: 0.7 } : null, ...raw.split("\n").filter(Boolean).map(l => ({ t: l, h: 0.55 })), datesText(x) ? { t: datesText(x), h: 0.42 } : null].filter(Boolean);
      if (!lines.length) lines.push({ t: x.layer || "Notering", h: 0.6 });
      const w = Math.max(...lines.map(l => siteIfcTextW(l.t, l.h))) + SITE_IFC_PAD * 2;
      const hgt = lines.reduce((s2, l) => s2 + l.h * 1.35, 0) - lines[lines.length - 1].h * 0.35 + SITE_IFC_PAD * 1.6;
      const s = siteIfcSign(doc, { z: z0, w, hgt, rx, ry, color: "#fff4bf", label: "Notering", lines, textStyle: doc.textStyle });
      const name = x.name || (raw.split("\n")[0] || "Notering");
      const pl = doc.place([t[0], t[1], z0]);
      // Pilen: en smal list från skylten till punkten, och en markering vid punkten.
      const parts = [s.plate];
      const dx = a[0] - t[0], dy = a[1] - t[1], L = Math.hypot(dx, dy);
      if (L > 0.3) {
        const ux = dx / L, uy = dy / L;
        const pos = E(`IFCAXIS2PLACEMENT2D(${E(`IFCCARTESIANPOINT(${ifcPt([dx / 2, dy / 2])})`)},${E(`IFCDIRECTION(${ifcPt([ux, uy])})`)})`);
        const bar = E(`IFCEXTRUDEDAREASOLID(${E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${pos},${ifcNum(L)},0.15)`)},$,${zDir},${ifcNum(SITE_IFC_PLATE_T / 2)})`);
        E(`IFCSTYLEDITEM(${bar},(${doc.style("note-" + color, color, "Notering pil")}),$)`);
        parts.push(bar);
      }
      const dotPos = E(`IFCAXIS2PLACEMENT3D(${E(`IFCCARTESIANPOINT(${ifcPt([dx, dy, 0])})`)},$,$)`);
      const dot = E(`IFCEXTRUDEDAREASOLID(${E("IFCCIRCLEPROFILEDEF(.AREA.,$,$,0.35)")},${dotPos},${zDir},${ifcNum(SITE_IFC_PLATE_T)})`);
      E(`IFCSTYLEDITEM(${dot},(${doc.style("note-" + color, color, "Notering pil")}),$)`);
      parts.push(dot);
      const el = doc.proxy(name, x.layer || "Notering", "4D-notering", pl, doc.shape(parts.join(","), "SweptSolid"), x.id);
      elems.push(el);
      doc.props(el, [["Text", x.text || ""], ["Rubrik", x.name || ""], ["Lager", x.layer || ""], ["Från", x.from || ""], ["Till", x.to || ""],
        ["Skapad av", x.by || ""], ["Arbetsyta", plan ? plan.name || "" : ""], ["Status per", at]]);
      if (s.meshes.length) {
        const tpl = doc.place([t[0], t[1], z0 + SITE_IFC_PLATE_T]);
        elems.push(doc.proxy(`${name} – text`, "Text", "4D-noteringstext", tpl, doc.shape(s.meshes.join(","), "Tessellation"), x.id));
      }
      notes++;
    }
  });
  return { text: doc.finish(elems, `Lag och noteringar ${plan ? plan.name : ""} ${at}.ifc`), crews, notes, z0, levelSet: typeof zoneCadTopZ === "function" && zoneCadTopZ() != null };
}

function exportSiteIfc() {
  if (!plan) return;
  if (!plan.calib) { alert("Kalibrera arbetsytan mot 3D först – lagen och noteringarna exporteras i modellens koordinater."); return; }
  const r = buildSiteIfc();
  if (!r) { alert("Inga UE-lag eller noteringar syns på planen för det här datumet (tänd lagren Dagsplanering/Allmänt eller byt datum)."); return; }
  const lvl = r.levelSet ? `på +${(Math.round(r.z0 * 100) / 100).toFixed(2)}` : "på +0 (ingen maxhöjd kalibrerad)";
  const what = [r.crews ? `${r.crews} lag` : "", r.notes ? `${r.notes} noteringar` : ""].filter(Boolean).join(" och ");
  return zoneCadSave(new TextEncoder().encode(r.text), `Lag och noteringar ${plan.name} ${$("dateInput").value}.ifc`, "application/x-step", `${what} exporterade som IFC ${lvl}`);
}

document.addEventListener("DOMContentLoaded", () => {
  const b = $("btnSiteIfc");
  if (b) b.onclick = exportSiteIfc;
});
