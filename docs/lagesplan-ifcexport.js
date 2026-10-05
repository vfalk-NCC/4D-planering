/* 3D-objekten som IFC (Victors önskemål 2026-10-05): samma som DXF-exporten, fast i 3D. Varje
   markering (samma som syns i Lägesplan) blir en cylinder ovanpå objektets högsta punkt (max
   plushöjd) i statusfärgen och en liggande 3D-text med objektets namn ("L12") bredvid, 0,5 m tjock,
   som läses uppifrån i planvyn från samma håll som vyn i Lägesplan. Modellens koordinater i meter. IFC4.
   Cylindern bär egenskaperna (aktivitet, status, framdrift, datum, zon) i "4D-planering".
   Texten är byggd av streck (eget enkelt typsnitt) som tunna ytor, så att den syns i alla
   IFC-visare utan typsnitt. */

const IFC_CYL_R = 0.4, IFC_CYL_H = 0.6, IFC_GAP = 0.1; // meter
const IFC_TEXT_H = 0.8, IFC_TEXT_T = 0.5, IFC_STROKE = 0.14; // texthöjd (i plan), tjocklek (uppåt), streckbredd (del av höjden)

/* Streckfont (Victors önskemål 2026-10-05: snygg och läsbar): versaler, siffror och vanliga tecken
   på ett rutnät 4 brett × 6 högt, med mjuka bågar (ellipsbågar som korta streck). */
const IFC_GLYPHS = (() => {
  // Ellipsbåge: mitt (cx, cy), radier (rx, ry), från a0 till a1 grader (moturs om a1 > a0).
  const arc = (cx, cy, rx, ry, a0, a1, n) => {
    n = n || Math.max(3, Math.round(Math.abs(a1 - a0) / 22.5));
    const out = [];
    for (let k = 0; k <= n; k++) { const a = (a0 + (a1 - a0) * k / n) * Math.PI / 180; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
    return out;
  };
  const O = arc(2, 3, 2, 3, 90, 450, 20);
  const A = [[[0, 0], [2, 6], [4, 0]], [[0.7, 2], [3.3, 2]]];
  const dots = [[[1.2, 7.0], [1.2, 7.45]], [[2.8, 7.0], [2.8, 7.45]]];
  const P = [[0, 0], [0, 6], [2.4, 6], ...arc(2.4, 4.4, 1.6, 1.6, 90, -90).slice(1), [0, 2.8]];
  return {
    A,
    B: [[[0, 0], [0, 6], [2.3, 6], ...arc(2.3, 4.55, 1.45, 1.45, 90, -90).slice(1), [0, 3.1]], [[2.3, 3.1], [2.5, 3.1], ...arc(2.5, 1.55, 1.5, 1.55, 90, -90).slice(1), [0, 0]]],
    C: [arc(2, 3, 2, 3, 40, 320, 14)],
    D: [[[0, 0], [0, 6], [1.6, 6], ...arc(1.6, 3, 2.4, 3, 90, -90, 10).slice(1), [0, 0]]],
    E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3.2, 3]]],
    F: [[[0, 0], [0, 6], [4, 6]], [[0, 3], [3.2, 3]]],
    G: [[...arc(2, 3, 2, 3, 40, 360, 16), [4, 2.6]], [[4, 2.6], [2.3, 2.6]]],
    H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
    I: [[[0, 0], [0, 6]]],
    J: [[[4, 6], [4, 1.8], ...arc(2, 1.8, 2, 1.8, 0, -180, 8).slice(1), [0, 2.2]]],
    K: [[[0, 0], [0, 6]], [[4, 6], [0, 2]], [[1.4, 3.4], [4, 0]]],
    L: [[[0, 6], [0, 0], [4, 0]]],
    M: [[[0, 0], [0, 6], [2, 2.4], [4, 6], [4, 0]]],
    N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
    O: [O], P: [P], Q: [O, [[2.6, 1.3], [4.2, -0.4]]], R: [P, [[2.1, 2.8], [4, 0]]],
    S: [[...arc(2, 4.5, 1.9, 1.5, 20, 270, 10), ...arc(2, 1.5, 2, 1.5, 90, -160, 10).slice(1)]],
    T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
    U: [[[0, 6], [0, 2], ...arc(2, 2, 2, 2, 180, 360, 8).slice(1), [4, 6]]],
    V: [[[0, 6], [2, 0], [4, 6]]],
    W: [[[0, 6], [1, 0], [2, 4], [3, 0], [4, 6]]],
    X: [[[0, 0], [4, 6]], [[0, 6], [4, 0]]],
    Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
    Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]],
    "Å": [...A, arc(2, 7.1, 0.65, 0.65, 0, 360, 10)],
    "Ä": [...A, ...dots], "Ö": [O, ...dots],
    0: [O, [[0.9, 1.0], [3.1, 5.0]]],
    1: [[[0.9, 4.7], [2.4, 6], [2.4, 0]], [[1, 0], [3.8, 0]]],
    2: [[...arc(2, 4.2, 2, 1.8, 160, -20, 9), [0, 0], [4, 0]]],
    3: [[...arc(2, 4.55, 1.9, 1.45, 150, -90, 9), ...arc(2, 1.55, 2, 1.55, 90, -150, 9).slice(1)]],
    4: [[[3, 0], [3, 6], [0, 1.9], [4.2, 1.9]]],
    5: [[[3.8, 6], [0.4, 6], [0.1, 3.3], ...arc(2, 1.9, 2, 1.9, 135, -150, 12).slice(1)]],
    6: [arc(2, 3, 2, 3, 60, 200, 7), arc(2, 1.9, 2, 1.9, 0, 360, 16)],
    7: [[[0, 6], [4, 6], [1.4, 0]]],
    8: [arc(2, 4.6, 1.7, 1.4, 270, 630, 14), arc(2, 1.6, 2, 1.6, 90, 450, 16)],
    9: [arc(2, 4.1, 2, 1.9, 0, 360, 16), arc(2, 3, 2, 3, 240, 380, 7)],
    "-": [[[0.8, 3], [3.2, 3]]], "+": [[[0.6, 3], [3.4, 3]], [[2, 1.6], [2, 4.4]]], ".": [[[2, 0], [2, 0.45]]], ",": [[[2.1, 0.5], [1.6, -0.7]]],
    "(": [arc(3.6, 3, 1.6, 3.4, 118, 242, 8)], ")": [arc(0.4, 3, 1.6, 3.4, 62, -62, 8)], "/": [[[0, 0], [4, 6]]], "_": [[[0, -0.2], [4, -0.2]]],
    ":": [[[2, 0.6], [2, 1.05]], [[2, 3.6], [2, 4.05]]], "&": [[[4, 0], [1.1, 3.9], ...arc(2, 4.9, 1, 1.1, 180, 0, 6).slice(1), [0.4, 1.9], ...arc(1.6, 1.4, 1.4, 1.4, 160, 290, 5).slice(1), [4, 2.2]]],
    "'": [[[2, 6], [2, 4.9]]], "#": [[[1.2, 0], [1.6, 6]], [[2.6, 0], [3, 6]], [[0, 2], [4, 2]], [[0, 4], [4, 4]]],
    "?": [[...arc(2, 4.4, 1.9, 1.6, 160, -60, 8), [2, 2.4], [2, 1.7]], [[2, 0], [2, 0.45]]],
    "°": [arc(2, 5.2, 0.8, 0.8, 0, 360, 10)],
  };
})();
/* Texten som streck (glyfenheter, baslinje y = 0), proportionellt: varje tecken tar sin egen
   bredd + mellanrum. Andra bokstäver (é, ü …) utan accent. */
const IFC_GAP_U = 1.7, IFC_SPACE_U = 3.4;
function ifcTextStrokes(text) {
  const strokes = [];
  let x = 0, last = 0;
  String(text).toUpperCase().split("").forEach(ch => {
    if (ch === " ") { x += IFC_SPACE_U; return; }
    let g = IFC_GLYPHS[ch];
    if (!g) { const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); g = IFC_GLYPHS[base] || IFC_GLYPHS["?"]; }
    const xs = g.flatMap(pl => pl.map(p => p[0])), x0 = Math.min(...xs), w = Math.max(...xs) - x0;
    g.forEach(pl => strokes.push(pl.map(([u, v]) => [u - x0 + x, v])));
    last = x + w;
    x = last + IFC_GAP_U;
  });
  return { strokes, width: last };
}

/* IFC-hjälp: GUID (22 tecken), text (STEP, \X2\ för å/ä/ö), tal. */
const IFC_GUID_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
function ifcGuid() {
  let s = IFC_GUID_CHARS[Math.floor(Math.random() * 4)];
  for (let i = 1; i < 22; i++) s += IFC_GUID_CHARS[Math.floor(Math.random() * 64)];
  return s;
}
function ifcStr(s) {
  let out = "";
  for (const ch of String(s == null ? "" : s)) {
    const c = ch.codePointAt(0);
    if (ch === "'") out += "''";
    else if (ch === "\\") out += "\\\\";
    else if (c >= 32 && c < 127) out += ch;
    else if (c < 0x10000) out += "\\X2\\" + c.toString(16).toUpperCase().padStart(4, "0") + "\\X0\\";
  }
  return `'${out}'`;
}
const ifcNum = v => { const r = Math.round(v * 1000) / 1000; const s = String(r); return /[.eE]/.test(s) ? s : s + "."; };
const ifcPt = p => `(${p.map(ifcNum).join(",")})`;

/* En IFC4-fil (meter) under uppbyggnad: projekt, enheter, plats och ytstilar. E(def) lägger till en
   entitet och ger dess #id. Används av objekt- och zonexporten. */
function ifcDoc(projName, desc) {
  const lines = [];
  let id = 0;
  const E = def => { id++; lines.push(`#${id}=${def};`); return `#${id}`; };
  const origin = E("IFCCARTESIANPOINT((0.,0.,0.))");
  const ax = E(`IFCAXIS2PLACEMENT3D(${origin},$,$)`);
  const ctx = E(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${ax},$)`);
  const body = E(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
  const uL = E("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)"), uA = E("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)");
  const units = E(`IFCUNITASSIGNMENT((${uL},${uA}))`);
  const project = E(`IFCPROJECT('${ifcGuid()}',$,${ifcStr(projName)},${ifcStr(desc)},$,$,$,(${ctx}),${units})`);
  const sitePl = E(`IFCLOCALPLACEMENT($,${ax})`);
  const site = E(`IFCSITE('${ifcGuid()}',$,'4D-planering',$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  E(`IFCRELAGGREGATES('${ifcGuid()}',$,$,$,${project},(${site}))`);
  const styles = {};
  const doc = {
    E, body, sitePl,
    // Ytstil (färg #rrggbb, genomskinlighet 0–1), en per nyckel.
    style(key, hex, label, transp = 0) {
      if (styles[key]) return styles[key];
      const n = parseInt(String(hex).slice(1), 16);
      const rgb = E(`IFCCOLOURRGB($,${ifcNum((n >> 16 & 255) / 255)},${ifcNum((n >> 8 & 255) / 255)},${ifcNum((n & 255) / 255)})`);
      const sh = E(`IFCSURFACESTYLESHADING(${rgb},${ifcNum(transp)})`);
      return (styles[key] = E(`IFCSURFACESTYLE(${ifcStr(label)},.BOTH.,(${sh}))`));
    },
    place: p => E(`IFCLOCALPLACEMENT(${sitePl},${E(`IFCAXIS2PLACEMENT3D(${E(`IFCCARTESIANPOINT(${ifcPt(p)})`)},$,$)`)})`),
    shape: (item, type) => E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${E(`IFCSHAPEREPRESENTATION(${body},'Body','${type}',(${item}))`)}))`),
    proxy: (name, desc, objType, pl, shape, tag) => E(`IFCBUILDINGELEMENTPROXY('${ifcGuid()}',$,${ifcStr(name)},${ifcStr(desc)},${ifcStr(objType)},${pl},${shape},${ifcStr(tag || "")},.NOTDEFINED.)`),
    // Egenskaper i "4D-planering" (tal som IFCREAL, annars text).
    props(el, list) {
      const ps = list.map(([n, v]) => E(`IFCPROPERTYSINGLEVALUE(${ifcStr(n)},$,${typeof v === "number" ? `IFCREAL(${ifcNum(v)})` : `IFCLABEL(${ifcStr(v)})`},$)`));
      const pset = E(`IFCPROPERTYSET('${ifcGuid()}',$,'4D-planering',$,(${ps.join(",")}))`);
      E(`IFCRELDEFINESBYPROPERTIES('${ifcGuid()}',$,$,$,(${el}),${pset})`);
    },
    finish(elems, fileName) {
      E(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid()}',$,$,$,(${elems.join(",")}),${site})`);
      const now = new Date().toISOString().slice(0, 19);
      const head = ["ISO-10303-21;", "HEADER;", "FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');",
        `FILE_NAME(${ifcStr(fileName)},'${now}',(${ifcStr((typeof settings !== "undefined" && settings.userName) || "")}),('NCC'),'4D-planering',${ifcStr("4D-planering Lägesplan")},'');`,
        "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;"];
      return [...head, ...lines, "ENDSEC;", "END-ISO-10303-21;"].join("\r\n") + "\r\n";
    },
  };
  doc.textStyle = doc.style("__text", "#111827", "Text");
  doc.textStyleLight = doc.style("__textl", "#ffffff", "Text (ljus)");
  return doc;
}

/* Liggande 3D-text (läses uppifrån i planvyn) som slutna kroppar: höjd h i plan, tjocklek t uppåt
   från z = 0 (lokalt), läsriktning (rx, ry). start = var texten börjar längs läsriktningen (meter),
   eller null = centrerad; across = förskjutning tvärs (meter, mitten av texten). Returnerar
   IfcTriangulatedFaceSet-id, eller null. */
function ifcTextSolid(doc, text, { h, t, rx, ry, start = null, style = null, across = 0 }) {
  const { strokes, width } = ifcTextStrokes(text);
  if (!strokes.length) return null;
  const s = h / 6, w = IFC_STROKE * h / 2, u0 = start == null ? -width / 2 : start / s, v0 = -3 + across / s;
  // Glyf (u åt höger, v uppåt i läsriktningen) -> lokalt (meter): läsriktning (rx, ry), "uppåt" i planen (-ry, rx).
  const P = (u, v, z) => { const a = (u + u0) * s, b = (v + v0) * s; return [a * rx - b * ry, a * ry + b * rx, z]; };
  const pts = [], tris = [];
  strokes.forEach(pl => {
    for (let i = 0; i + 1 < pl.length; i++) {
      const [u1, v1] = pl[i], [u2, v2] = pl[i + 1], du = u2 - u1, dv = v2 - v1, L = Math.hypot(du, dv) || 1;
      const nu = -dv / L * w / s, nv = du / L * w / s, eu = du / L * w / s / 2, ev = dv / L * w / s / 2; // bredd + lite förlängning
      const q = [[u1 - eu + nu, v1 - ev + nv], [u2 + eu + nu, v2 + ev + nv], [u2 + eu - nu, v2 + ev - nv], [u1 - eu - nu, v1 - ev - nv]];
      // Strecket som ett rätblock: botten (z = 0) och topp (z = t).
      const k = pts.length + 1;
      q.forEach(([u, v]) => pts.push(P(u, v, 0)));
      q.forEach(([u, v]) => pts.push(P(u, v, t)));
      const b = [k, k + 1, k + 2, k + 3], tp = [k + 4, k + 5, k + 6, k + 7];
      // q går medurs i planen (sett uppifrån) – sidorna och locken vända utåt.
      tris.push([b[0], b[1], b[2]], [b[0], b[2], b[3]], [tp[0], tp[2], tp[1]], [tp[0], tp[3], tp[2]]);
      for (let j = 0; j < 4; j++) { const j2 = (j + 1) % 4; tris.push([b[j], tp[j], tp[j2]], [b[j], tp[j2], b[j2]]); }
    }
  });
  const pl3 = doc.E(`IFCCARTESIANPOINTLIST3D((${pts.map(ifcPt).join(",")}))`);
  const mesh = doc.E(`IFCTRIANGULATEDFACESET(${pl3},$,.T.,(${tris.map(tr => `(${tr.join(",")})`).join(",")}),$)`);
  doc.E(`IFCSTYLEDITEM(${mesh},(${style || doc.textStyle}),$)`);
  return mesh;
}
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
    if (mesh) elems.push(doc.proxy(mk.name, "Namn", "4D-text", pl, doc.shape(mesh, "Tessellation"), it.id));
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
  const tc = $("objIfcToTc");
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
  const tc = $("objIfcToTc");
  if (tc) {
    try { tc.checked = localStorage.getItem("lagesplan-objifc-tc") !== "0"; } catch (e) {}
    tc.onchange = () => { try { localStorage.setItem("lagesplan-objifc-tc", tc.checked ? "1" : "0"); } catch (e) {} };
  }
});
