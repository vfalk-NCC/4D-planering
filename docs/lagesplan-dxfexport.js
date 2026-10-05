/* 3D-objekten som DXF (Victors önskemål 2026-10-05): prickarna och aktivitetsnamnen i Lägesplan
   exporteras i modellens koordinater (samma som i Trimble Connect, i meter) så att de hamnar rätt
   mot andra ritningar. Det som syns följer med: valt datum (status), filter, släckta objekt och
   en markering per aktivitet. DXF R12 (läses av alla CAD-program), Windows-1252 för å/ä/ö.
   Lager: 4D-<STATUS> (punkt + cirkel i objektets mitt) och 4D-NAMN (objektets och aktivitetens namn, t.ex. "K10 - Pelare").
   Planritning (z = 0) med textstil och utbredning, så att filen öppnas på objekten. Texterna
   vrids så att de läses vågrätt i den vy man har i Lägesplan när man exporterar. */

const DXF_PHASE_LAYER = { planerad: "4D-PLANERAD", pagaende: "4D-PAGAENDE", forsenad: "4D-FORSENAD", klar: "4D-KLAR", pausad: "4D-PAUSAD", ingen: "4D-INGEN" };
/* Statusfärgen som AutoCAD-färg (ACI): efter färgton – gråaktiga färger blir grå. */
function dxfAci(hex) {
  const n = parseInt(String(hex || "#808080").slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (sat < 0.25 || d < 0.12) return l > 0.7 ? 9 : 8;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const hues = [[0, 1], [30, 30], [45, 40], [60, 2], [120, 3], [180, 4], [240, 5], [300, 6], [360, 1]];
  return hues.reduce((best, x) => (Math.abs(x[0] - h) < Math.abs(best[0] - h) ? x : best))[1];
}
/* Text till Windows-1252 (DXF R12 med $DWGCODEPAGE ANSI_1252). */
function dxfCp1252(str) {
  const map = { 0x20ac: 0x80, 0x201a: 0x82, 0x2026: 0x85, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97 };
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    out[i] = c < 0x80 || (c >= 0xa0 && c < 0x100) ? c : (map[c] || 0x3f);
  }
  return out;
}
const dxfNum = v => (Math.round(v * 1000) / 1000).toFixed(3);
const dxfText = s => String(s || "").replace(/[\r\n]+/g, " ").trim();
const DXF_TEXT_H = 1.0; // texthöjd i meter
/* Namnet som skrivs ut: bara objektets namn/kod, t.ex. "L12" (Victors val 2026-10-05) –
   aktiviteten om objektet saknar namn. */
function dxfItemName(it) {
  return dxfText(it.object_name) || dxfText(it.activity);
}

/* Texternas vridning (grader, moturs i modellen) så att de läses vågrätt i den vy man har i
   Lägesplan just nu – med ritningens och vyns vridning (Victors önskemål 2026-10-05). */
function dxfTextRotation() {
  try {
    const r = $("viewport").getBoundingClientRect(), cx = r.width / 2, cy = r.height / 2;
    const m = p => pdfToModel(toPdf(screenToStage(p)));
    const a = m([cx, cy]), b = m([cx + 100, cy]);
    const deg = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI;
    return Number.isFinite(deg) ? (Math.round(deg * 100) / 100 + 360) % 360 : 0;
  } catch (e) { return 0; }
}

/* Markeringarna som exporteras (DXF och IFC): det som syns i Lägesplan – en per objekt, eller
   en per aktivitet när objekten slås ihop. x/y = mitten (eller den flyttade markeringen), zTop =
   objektens högsta punkt, ph = status för valt datum, name = "L12" (+ antal). */
function objExportMarkers() {
  const objs = typeof objectShapesInPdf === "function" ? objectShapesInPdf() : null;
  if (!objs || !objs.length) return [];
  const at = $("dateInput").value || todayIso();
  const warn = Number.isFinite(settings.warningDaysBeforeEnd) ? settings.warningDaysBeforeEnd : 7;
  const byId = new Map(positions.map(p => [p.id, p]));
  const out = [];
  objs.forEach(o => {
    const members = o.members && o.members.length ? o.members : [o.it];
    const ps = members.map(m => byId.get(m.id)).filter(Boolean);
    if (!ps.length) return;
    const ph = members.length > 1 ? zonePhase(members, at) : (computeItemPhase(o.it, at, warn) || fallbackPhase(o.it));
    let x = ps.reduce((a, p) => a + p.x, 0) / ps.length, y = ps.reduce((a, p) => a + p.y, 0) / ps.length;
    if (o.moved && typeof objMarkPos === "function") { const m = objMarkPos(o.fam); if (m) [x, y] = m; } // flyttad markering
    const zTop = Math.max(...ps.map(p => Number.isFinite(p.z1) ? p.z1 : p.z0 || 0));
    const nm = dxfItemName(o.it);
    out.push({ x, y, zTop, ph, members, it: o.it, name: nm && members.length > 1 ? `${nm} (${members.length})` : nm });
  });
  return out;
}

/* Bygger DXF-texten. Returnerar { text, n } eller null om inga objekt syns. */
function buildObjectsDxf() {
  const marks = objExportMarkers();
  if (!marks.length) return null;
  const ents = [], used = new Set(["4D-NAMN"]);
  const rot = dxfTextRotation(), rr = rot * Math.PI / 180;
  // Texten börjar en bit åt höger om punkten och står centrerad i höjd – i läsriktningen.
  const along = (dx, dy) => [dx * Math.cos(rr) - dy * Math.sin(rr), dx * Math.sin(rr) + dy * Math.cos(rr)];
  marks.forEach(mk => {
    const layer = DXF_PHASE_LAYER[mk.ph] || "4D-INGEN", x = mk.x, y = mk.y;
    used.add(layer);
    const z = 0; // planritning (höjden skulle göra ritningen rörig i plan)
    ents.push({ t: "POINT", layer, x, y, z });
    ents.push({ t: "CIRCLE", layer, x, y, z, r: 0.25 });
    // Inga fotavtryck (Victors val 2026-10-05): Trimble Connect ger bara en rak låda i modellens
    // axelriktning, så vridna fundament blev fel vridna och för stora. Mittpunkten stämmer.
    const [ox, oy] = along(0.5, -DXF_TEXT_H / 2);
    if (mk.name) ents.push({ t: "TEXT", layer: "4D-NAMN", x: x + ox, y: y + oy, z, h: DXF_TEXT_H, rot, s: mk.name });
  });
  if (!ents.length) return null;
  const layerAci = { "4D-NAMN": 7 };
  Object.entries(DXF_PHASE_LAYER).forEach(([ph, l]) => { layerAci[l] = dxfAci(phaseColor(ph)); });
  return { text: dxfWrite(ents, [...used], layerAci), n: marks.length };
}

/* En DXF R12-fil (meter) av entiteterna: POINT, CIRCLE, TEXT (rot, mid = centrerad),
   POLY (sluten polylinje, pts [[x, y]], aci = egen färg). Lagren med färg (ACI). Utbredning,
   textstil och vy så att filen öppnas på innehållet. Används av objekt- och zonexporten. */
function dxfWrite(ents, layers, layerAci) {
  const out = [];
  const g = (code, v) => out.push(String(code), String(v));
  // Utbredning (så att filen öppnas på innehållet, inte vid nollpunkten).
  const xs = [], ys = [];
  ents.forEach(e => { if (e.pts) e.pts.forEach(([x, y]) => { xs.push(x); ys.push(y); }); else { xs.push(e.x); ys.push(e.y); } });
  const x0 = Math.min(...xs) - 25, y0 = Math.min(...ys) - 25, x1 = Math.max(...xs) + 25, y1 = Math.max(...ys) + 25;
  // HEADER
  g(0, "SECTION"); g(2, "HEADER");
  g(9, "$ACADVER"); g(1, "AC1009");
  g(9, "$DWGCODEPAGE"); g(3, "ANSI_1252");
  g(9, "$INSUNITS"); g(70, 6); // meter
  g(9, "$MEASUREMENT"); g(70, 1);
  g(9, "$EXTMIN"); g(10, dxfNum(x0)); g(20, dxfNum(y0)); g(30, "0.0");
  g(9, "$EXTMAX"); g(10, dxfNum(x1)); g(20, dxfNum(y1)); g(30, "0.0");
  g(9, "$LIMMIN"); g(10, dxfNum(x0)); g(20, dxfNum(y0));
  g(9, "$LIMMAX"); g(10, dxfNum(x1)); g(20, dxfNum(y1));
  g(9, "$TEXTSTYLE"); g(7, "STANDARD");
  g(9, "$TEXTSIZE"); g(40, dxfNum(DXF_TEXT_H));
  g(0, "ENDSEC");
  // TABLES: vy (öppnas på objekten), linjetyp, textstil och lagren med färg
  g(0, "SECTION"); g(2, "TABLES");
  g(0, "TABLE"); g(2, "VPORT"); g(70, 1);
  g(0, "VPORT"); g(2, "*ACTIVE"); g(70, 0); g(10, "0.0"); g(20, "0.0"); g(11, "1.0"); g(21, "1.0");
  g(12, dxfNum((x0 + x1) / 2)); g(22, dxfNum((y0 + y1) / 2)); g(13, "0.0"); g(23, "0.0"); g(14, "1.0"); g(24, "1.0"); g(15, "0.0"); g(25, "0.0");
  g(16, "0.0"); g(26, "0.0"); g(36, "1.0"); g(17, "0.0"); g(27, "0.0"); g(37, "0.0");
  g(40, dxfNum(Math.max(y1 - y0, (x1 - x0) / 1.6) * 1.1)); g(41, "1.6"); g(42, "50.0"); g(43, "0.0"); g(44, "0.0"); g(50, "0.0"); g(51, "0.0");
  g(71, 0); g(72, 100); g(73, 1); g(74, 3); g(75, 0); g(76, 0); g(77, 0); g(78, 0);
  g(0, "ENDTAB");
  g(0, "TABLE"); g(2, "LTYPE"); g(70, 1);
  g(0, "LTYPE"); g(2, "CONTINUOUS"); g(70, 0); g(3, "Solid line"); g(72, 65); g(73, 0); g(40, "0.0");
  g(0, "ENDTAB");
  g(0, "TABLE"); g(2, "STYLE"); g(70, 1);
  g(0, "STYLE"); g(2, "STANDARD"); g(70, 0); g(40, "0.0"); g(41, "1.0"); g(50, "0.0"); g(71, 0); g(42, dxfNum(DXF_TEXT_H)); g(3, "txt"); g(4, "");
  g(0, "ENDTAB");
  g(0, "TABLE"); g(2, "LAYER"); g(70, layers.length);
  layers.forEach(l => { g(0, "LAYER"); g(2, l); g(70, 0); g(62, layerAci[l] || 7); g(6, "CONTINUOUS"); });
  g(0, "ENDTAB");
  g(0, "ENDSEC");
  // ENTITIES
  g(0, "SECTION"); g(2, "ENTITIES");
  ents.forEach(e => {
    if (e.t === "POINT") { g(0, "POINT"); g(8, e.layer); g(10, dxfNum(e.x)); g(20, dxfNum(e.y)); g(30, dxfNum(e.z)); }
    else if (e.t === "CIRCLE") { g(0, "CIRCLE"); g(8, e.layer); g(10, dxfNum(e.x)); g(20, dxfNum(e.y)); g(30, dxfNum(e.z)); g(40, dxfNum(e.r)); }
    else if (e.t === "TEXT") {
      g(0, "TEXT"); g(8, e.layer); g(10, dxfNum(e.x)); g(20, dxfNum(e.y)); g(30, dxfNum(e.z || 0)); g(40, dxfNum(e.h)); g(1, e.s);
      if (e.rot) g(50, dxfNum(e.rot));
      g(7, "STANDARD");
      if (e.mid) { g(72, 4); g(11, dxfNum(e.x)); g(21, dxfNum(e.y)); g(31, dxfNum(e.z || 0)); } // centrerad (Middle)
    }
    else if (e.t === "POLY") {
      g(0, "POLYLINE"); g(8, e.layer); if (e.aci) g(62, e.aci); g(66, 1); g(10, "0.0"); g(20, "0.0"); g(30, "0.0"); g(70, 1);
      e.pts.forEach(([x, y]) => { g(0, "VERTEX"); g(8, e.layer); g(10, dxfNum(x)); g(20, dxfNum(y)); g(30, "0.0"); });
      g(0, "SEQEND"); g(8, e.layer);
    }
  });
  g(0, "ENDSEC");
  g(0, "EOF");
  return out.join("\r\n") + "\r\n";
}

function exportObjectsDxf() {
  if (!plan) return;
  if (!$("showObjects").checked) { alert("Tänd 3D-objekten (Visa objekten på ritningen) först – exporten tar med det som syns."); return; }
  const r = buildObjectsDxf();
  if (!r) { alert("Inga 3D-objekt syns på planen (kalibrera och hämta positioner, eller ändra filtret)."); return; }
  const name = `3D-objekt ${plan.name} ${$("dateInput").value}.dxf`;
  const bytes = dxfCp1252(r.text);
  downloadBlob(new Blob([bytes], { type: "application/dxf" }), name); // alltid en lokal kopia
  setSaveStatus(`📐 ${r.n} objekt exporterade som DXF (meter, modellens koordinater).`);
  // Även till Trimble Connect (via 4D-planering, som har behörigheten) – Victors önskemål 2026-10-05.
  const tc = $("objDxfToTc");
  if (!tc || !tc.checked) return;
  if (!window.opener || window.opener.closed) {
    setSaveStatus(`📐 ${r.n} objekt nedladdade. ⚠ Inte sparad i Trimble Connect – öppna lägesplanen via 🗺️ i 4D-planering för det.`);
    return;
  }
  const file = new File([bytes], name, { type: "application/dxf" });
  setSaveStatus(`📐 ${r.n} objekt nedladdade – sparar i Trimble Connect…`);
  return askOpener("tcUpload", { folder: DXF_TC_FOLDER, files: [file] }, 5 * 60 * 1000)
    .then(res => setSaveStatus(`📐 ${r.n} objekt nedladdade och sparade i Trimble Connect (${res.folder || DXF_TC_FOLDER}).`))
    .catch(e => setSaveStatus(`📐 ${r.n} objekt nedladdade. ⚠ Kunde inte spara i Trimble Connect: ${e.message}`));
}
const DXF_TC_FOLDER = "Lägesplan export";

document.addEventListener("DOMContentLoaded", () => {
  const b = $("btnObjDxf");
  if (b) b.onclick = exportObjectsDxf;
  // Valet "Spara även i Trimble Connect" sparas i webbläsaren (på från början).
  const tc = $("objDxfToTc");
  if (tc) {
    try { tc.checked = localStorage.getItem("lagesplan-objdxf-tc") !== "0"; } catch (e) {}
    tc.onchange = () => { try { localStorage.setItem("lagesplan-objdxf-tc", tc.checked ? "1" : "0"); } catch (e) {} };
  }
});
