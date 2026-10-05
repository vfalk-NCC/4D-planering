/* Zonerna som DXF och IFC (Victors önskemål 2026-10-05), som objektexporten:
   - DXF (planritning, meter, modellens koordinater): zonens kontur på lager per status
     (ZON-KLAR …, statusfärg), överzonernas kontur (OVERZON) och "kod namn" mitt i zonen
     (ZON-NAMN), vriden så att den läses vågrätt i Lägesplans vy.
   - IFC4: en 0,5 m tjock platta per zon i statusfärg, med undersidan på arbetsytans kalibrerade
     maxhöjd, och "kod namn" som liggande 3D-text (0,5 m tjock) ovanpå, läsbar uppifrån.
     Egenskaperna (kod, namn, överzon, status, framdrift, yta, aktiviteter, datum) på plattan.
   Det som syns följer med: den öppna arbetsytan, valt datum (status) och tända zoner. */

const ZONE_PLATE_T = 0.5;                       // plattans tjocklek (m)
const ZONE_RIM_W = 0.25, ZONE_RIM_UP = 0.06;     // kanten: bredd (m) och hur mycket den sticker upp över plattan
/* Mörkare/ljusare nyans (#rrggbb), f < 0 mörkare. */
function zoneShade(hex, f) {
  const n = parseInt(String(hex).slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f));
  return "#" + c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
}
const zoneIsDark = hex => { const n = parseInt(String(hex).slice(1), 16); return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255 < 0.5; };
const ZONE_DXF_LAYER = { planerad: "ZON-PLANERAD", pagaende: "ZON-PAGAENDE", forsenad: "ZON-FORSENAD", klar: "ZON-KLAR", pausad: "ZON-PAUSAD", ingen: "ZON-INGEN" };

/* Polygon förskjuten d meter utåt (gering med begränsad spets), så att en kontur kan ligga runt
   andra utan att täcka dem. */
function zoneOffsetPoly(p, d) {
  const n = p.length;
  let sa = 0; p.forEach((q, i) => { const r = p[(i + 1) % n]; sa += q[0] * r[1] - r[0] * q[1]; });
  const sgn = sa >= 0 ? 1 : -1; // moturs: utåt är till höger om kanten (dy, -dx), medurs till vänster
  const off = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [sgn * dy / L, -sgn * dx / L]; };
  return p.map((q, i) => {
    const a = p[(i - 1 + n) % n], b = p[(i + 1) % n];
    const n1 = off(a, q), n2 = off(q, b);
    let mx = n1[0] + n2[0], my = n1[1] + n2[1];
    const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
    const cos = mx * n1[0] + my * n1[1], k = d / Math.max(0.35, cos); // spetsen högst ~3 d
    return [q[0] + mx * k, q[1] + my * k];
  });
}

/* Zonerna som exporteras, i modellens koordinater. */
function zoneCadList() {
  if (!plan || !plan.calib) return [];
  const at = $("dateInput").value || todayIso();
  const rr = dxfTextRotation() * Math.PI / 180, rx = Math.cos(rr), ry = Math.sin(rr);
  // 3D-objektens prickar (om de syns): zonnamnet läggs i ett hörn utan objekt.
  const dots = ($("showObjects") && $("showObjects").checked && typeof objExportMarkers === "function" ? objExportMarkers() : [])
    .map(mk => [mk.x * rx + mk.y * ry, -mk.x * ry + mk.y * rx]);
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
    // Texthöjd efter zonens utbredning i läsriktningen och tvärs: ryms i zonen, 0,5–3 m.
    const pts = polys.flat(), al = pts.map(q => q[0] * rx + q[1] * ry), ac = pts.map(q => -q[0] * ry + q[1] * rx);
    const along = Math.max(...al) - Math.min(...al), across = Math.max(...ac) - Math.min(...ac);
    const h = Math.max(0.5, Math.min(2.5, across * 0.2, along * 0.7 / (0.95 * Math.max(3, name.length))));
    // Textens plats (Victors önskemål 2026-10-05: snyggt): i zonens övre vänstra hörn sett i
    // läsriktningen, en bit in från kanterna – objekten ligger oftast mitt i zonen. Hamnar texten
    // utanför zonen (t.ex. en L-formad zon) står den centrerad i mitten som förut.
    const inset = Math.max(0.45, h * 0.4), tw = zoneTextWidth(name, h);
    const toM = (a, c) => [a * rx - c * ry, a * ry + c * rx];
    const inside = q => polys.some(p => pointInPoly(q, p));
    const minA = Math.min(...al), maxA = Math.max(...al), minC = Math.min(...ac), maxC = Math.max(...ac);
    // Hörnen i tur och ordning (vänsterkant, underkant): uppe till vänster, uppe till höger, nere till vänster, nere till höger.
    const corners = [[minA + inset, maxC - inset - h], [maxA - inset - tw, maxC - inset - h], [minA + inset, minC + inset], [maxA - inset - tw, minC + inset]];
    const fits = ([a, c]) => tw + 2 * inset < along && [[a, c], [a + tw, c], [a, c + h], [a + tw, c + h]].every(([x, y]) => inside(toM(x, y)));
    const free = ([a, c]) => !dots.some(([da, dc]) => da > a - 0.8 && da < a + tw + 0.8 && dc > c - 0.8 && dc < c + h + 0.8);
    const best = corners.find(cd => fits(cd) && free(cd)) || corners.find(fits);
    // tp = textens punkt (vänsterkant, mitt i höjd) och om texten är centrerad där.
    const tp = best ? toM(best[0], best[1] + h / 2) : lp, centered = !best;
    return { z, polys, area, lp, tp, centered, ph: st.phase, progress: st.progress, items, start: starts[0] || "", end: ends[ends.length - 1] || "", name, h, at,
      parent: String(z.parent || "").trim() };
  }).filter(Boolean);
}
/* Ungefärlig textbredd (meter) – CAD:s typsnitt och IFC-typsnittet är ungefär lika breda. */
const zoneTextWidth = (name, h) => 0.95 * h * Math.max(1, String(name).length);
/* Zonnamnens rutor i läsriktningens ram [a0, c0, a1, c1] – så att objektnamnen kan undvika dem. */
function zoneCadLabelBoxes() {
  if (!plan || !plan.calib || (typeof layerVisible === "function" && !layerVisible("zones"))) return [];
  const rr = dxfTextRotation() * Math.PI / 180, rx = Math.cos(rr), ry = Math.sin(rr);
  return zoneCadList().filter(e => e.name).map(e => {
    const a = e.tp[0] * rx + e.tp[1] * ry, c = -e.tp[0] * ry + e.tp[1] * rx, w = zoneTextWidth(e.name, e.h);
    return e.centered ? [a - w / 2, c - e.h / 2, a + w / 2, c + e.h / 2] : [a, c - e.h / 2, a + w, c + e.h / 2];
  });
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
    e.polys.forEach(p => ents.push({ t: "POLY", layer, pts: p, w: 0.15 }));
    if (e.name) {
      if (e.centered) ents.push({ t: "TEXT", layer: "ZON-NAMN", x: e.tp[0], y: e.tp[1], h: e.h, rot, s: e.name, mid: true });
      else { // vänsterställd: baslinjen en halv texthöjd under punkten (tvärs läsriktningen)
        const r = rot * Math.PI / 180;
        ents.push({ t: "TEXT", layer: "ZON-NAMN", x: e.tp[0] + Math.sin(r) * e.h / 2, y: e.tp[1] - Math.cos(r) * e.h / 2, h: e.h, rot, s: e.name });
      }
    }
  });
  // Överzonerna (WBS): konturen runt sina zoner.
  if (typeof wbsOn === "function" && wbsOn() && typeof wbsGroups === "function") {
    const rr = rot * Math.PI / 180, rx = Math.cos(rr), ry = Math.sin(rr), H = 1.2;
    const toM = (a, c) => [a * rx - c * ry, a * ry + c * rx];
    const groups = wbsGroups().map(g => {
      const frames = [];
      (g.polys || []).forEach(rings => rings.forEach(r => { if (r.length > 2) frames.push(zoneOffsetPoly(r.map(pdfToModel), 0.8)); }));
      return { g, frames };
    }).filter(x => x.frames.length);
    const zonePolys = zs.flatMap(e => e.polys);
    groups.forEach(({ g, frames }) => {
      used.add("OVERZON");
      frames.forEach(f => ents.push({ t: "POLY", layer: "OVERZON", pts: f, w: 0.3 }));
      // Överzonens namn utanför sin ram: ovanför/under, vänster/höger – första läget som inte krockar
      // med någon zon eller annan överzons ram (annars utelämnas det hellre än att skriva över något).
      const pts = frames.flat(), al = pts.map(q => q[0] * rx + q[1] * ry), ac = pts.map(q => -q[0] * ry + q[1] * rx);
      const minA = Math.min(...al), maxA = Math.max(...al), minC = Math.min(...ac), maxC = Math.max(...ac), w = zoneTextWidth(g.name, H);
      const others = groups.filter(o => o.g !== g).flatMap(o => o.frames).concat(zonePolys);
      const free = (a, c) => { // textrutan (a, c) = vänster underkant – provpunkter i rutan
        for (let i = 0; i <= 4; i++) for (let j = 0; j <= 2; j++) { const q = toM(a + w * i / 4, c + H * j / 2); if (others.some(pp => pointInPoly(q, pp)) || frames.some(pp => pointInPoly(q, pp))) return false; }
        return true;
      };
      const pick = [[minA, maxC + 0.4], [minA, minC - 0.4 - H], [maxA - w, maxC + 0.4], [maxA - w, minC - 0.4 - H]].find(([a, c]) => free(a, c));
      if (!pick) return;
      const [x, y] = toM(pick[0], pick[1]);
      ents.push({ t: "TEXT", layer: "OVERZON", x, y, h: H, rot, s: g.name });
    });
  }
  return { text: dxfWrite(ents, [...used], layerAci, { OVERZON: "DASHED" }), n: zs.length };
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
    // Plattan: en extruderad yta per polygon (lokala koordinater kring textpunkten), och en mörkare
    // kant längs ytterlinjen (innanför zonen) så att zoner med samma status syns var för sig.
    const col = phaseColor(e.ph), rimStyle = doc.style("zonkant-" + e.ph, zoneShade(col, -0.4), (PHASE_LABELS[e.ph] || e.ph) + " kant");
    const solids = [];
    e.polys.forEach(p => {
      const pts = [...p, p[0]].map(([x, y]) => E(`IFCCARTESIANPOINT(${ifcPt([x - ox, y - oy])})`));
      const prof = E(`IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,$,${E(`IFCPOLYLINE((${pts.join(",")}))`)})`);
      const sol = E(`IFCEXTRUDEDAREASOLID(${prof},$,${zDir},${ifcNum(ZONE_PLATE_T)})`);
      E(`IFCSTYLEDITEM(${sol},(${doc.style("zon-" + e.ph, col, PHASE_LABELS[e.ph] || e.ph, 0.35)}),$)`);
      solids.push(sol);
      let sa = 0; p.forEach((q, i) => { const r2 = p[(i + 1) % p.length]; sa += q[0] * r2[1] - r2[0] * q[1]; });
      const inward = sa >= 0 ? 1 : -1; // moturs: zonen ligger till vänster om kanten
      p.forEach((q, i) => {
        const r2 = p[(i + 1) % p.length], dx = r2[0] - q[0], dy = r2[1] - q[1], L = Math.hypot(dx, dy);
        if (L < 0.05) return;
        const ux = dx / L, uy = dy / L, nx = -uy * inward, ny = ux * inward;
        const mx = (q[0] + r2[0]) / 2 - ox + nx * ZONE_RIM_W / 2, my = (q[1] + r2[1]) / 2 - oy + ny * ZONE_RIM_W / 2;
        const pos = E(`IFCAXIS2PLACEMENT2D(${E(`IFCCARTESIANPOINT(${ifcPt([mx, my])})`)},${E(`IFCDIRECTION(${ifcPt([ux, uy])})`)})`);
        const rp = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${pos},${ifcNum(L)},${ifcNum(ZONE_RIM_W)})`);
        const rim = E(`IFCEXTRUDEDAREASOLID(${rp},$,${zDir},${ifcNum(ZONE_PLATE_T + ZONE_RIM_UP)})`);
        E(`IFCSTYLEDITEM(${rim},(${rimStyle}),$)`);
        solids.push(rim);
      });
    });
    const plate = doc.proxy(e.name || "Zon", PHASE_LABELS[e.ph] || e.ph, "4D-zon", pl, doc.shape(solids.join(","), "SweptSolid"), e.z.id);
    elems.push(plate);
    doc.props(plate, [["Kod", e.z.code || ""], ["Namn", e.z.name || ""], ["Överzon", e.parent], ["Status", PHASE_LABELS[e.ph] || e.ph],
      ["Framdrift %", e.progress == null ? 0 : e.progress], ["Yta m²", Math.round(e.area * 10) / 10], ["Aktiviteter", e.items.length],
      ["Start", e.start], ["Slut", e.end], ["Arbetsyta", plan.name || ""], ["Status per", at]]);
    // Texten ovanpå plattan (läses uppifrån), 0,5 m tjock.
    if (!e.name) return;
    const tpl = doc.place([e.tp[0], e.tp[1], z0 + ZONE_PLATE_T]);
    const mesh = ifcTextSolid(doc, e.name, { h: e.h, t: IFC_TEXT_T, rx, ry, start: e.centered ? null : 0, style: zoneIsDark(col) ? doc.textStyleLight : doc.textStyle });
    if (mesh) elems.push(doc.proxy(`${e.name} – text`, "Namn", "4D-zontext", tpl, doc.shape(mesh, "Tessellation"), e.z.id));
  });
  return { text: doc.finish(elems, `Zoner ${plan.name} ${at}.ifc`), n: zs.length, z0, levelSet: zoneCadTopZ() != null };
}

/* Lokal kopia alltid, och till Trimble Connect (Lägesplan export) om rutan är ikryssad. */
function zoneCadSave(bytes, name, type, what) {
  downloadBlob(new Blob([bytes], { type }), name);
  setSaveStatus(`🟧 ${what}.`);
  const tc = $("cadExportToTc");
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
});
