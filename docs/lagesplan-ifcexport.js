/* 3D-objekten som IFC (Victors önskemål 2026-10-05): samma som DXF-exporten, fast i 3D. Varje
   markering (samma som syns i Lägesplan) blir en cylinder ovanpå objektets högsta punkt (max
   plushöjd) i statusfärgen och en liggande 3D-text med objektets namn ("L12") bredvid, 0,5 m tjock,
   som läses uppifrån i planvyn från samma håll som vyn i Lägesplan. Modellens koordinater i meter. IFC4.
   Cylindern bär egenskaperna (aktivitet, status, framdrift, datum, zon) i "4D-planering".
   Texten är byggd av streck (eget enkelt typsnitt) som tunna ytor, så att den syns i alla
   IFC-visare utan typsnitt. */

const IFC_CYL_R = 0.25, IFC_CYL_H = 0.6, IFC_GAP = 0.1; // meter
const IFC_TEXT_H = 0.8, IFC_TEXT_T = 0.5, IFC_STROKE = 0.14; // texthöjd (i plan), tjocklek (uppåt), streckbredd (del av höjden)

/* Streckfont: versaler, siffror och några tecken på ett rutnät 4 brett × 6 högt. */
const IFC_GLYPHS = (() => {
  const O = [[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]];
  const A = [[[0, 0], [0, 4], [2, 6], [4, 4], [4, 0]], [[0, 3], [4, 3]]];
  const P = [[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]];
  const dots = [[[1, 6.8], [1, 7.3]], [[3, 6.8], [3, 7.3]]];
  return {
    A, B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
    C: [[[4, 1], [3, 0], [1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5]]],
    D: [[[0, 0], [0, 6], [2, 6], [4, 4], [4, 2], [2, 0], [0, 0]]],
    E: [[[4, 0], [0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
    F: [[[0, 0], [0, 6], [4, 6]], [[0, 3], [3, 3]]],
    G: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [2, 3]]],
    H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
    I: [[[1, 0], [3, 0]], [[2, 0], [2, 6]], [[1, 6], [3, 6]]],
    J: [[[0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
    K: [[[0, 0], [0, 6]], [[4, 6], [0, 2]], [[1, 3], [4, 0]]],
    L: [[[0, 6], [0, 0], [4, 0]]],
    M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]],
    N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
    O: [O], P: [P], Q: [O, [[2, 2], [4, 0]]], R: [P, [[2, 3], [4, 0]]],
    S: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
    T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
    U: [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
    V: [[[0, 6], [2, 0], [4, 6]]],
    W: [[[0, 6], [1, 0], [2, 3], [3, 0], [4, 6]]],
    X: [[[0, 0], [4, 6]], [[0, 6], [4, 0]]],
    Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
    Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]],
    "Å": [...A, [[1.4, 6.6], [2.6, 6.6], [2.6, 7.6], [1.4, 7.6], [1.4, 6.6]]],
    "Ä": [...A, ...dots], "Ö": [O, ...dots],
    0: [O, [[1, 1], [3, 5]]],
    1: [[[1, 5], [2, 6], [2, 0]], [[1, 0], [3, 0]]],
    2: [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [0, 0], [4, 0]]],
    3: [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
    4: [[[3, 0], [3, 6], [0, 2], [4, 2]]],
    5: [[[4, 6], [0, 6], [0, 3], [3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
    6: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3], [0, 3]]],
    7: [[[0, 6], [4, 6], [1, 0]]],
    8: [[[1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [3, 3], [1, 3], [0, 2], [0, 1], [1, 0], [3, 0], [4, 1], [4, 2], [3, 3]]],
    9: [[[4, 3], [1, 3], [0, 4], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0], [0, 1]]],
    "-": [[[1, 3], [3, 3]]], "+": [[[1, 3], [3, 3]], [[2, 2], [2, 4]]], ".": [[[2, 0], [2, 0.5]]], ",": [[[2, 0.6], [1.5, -0.6]]],
    "(": [[[3, 6], [2, 5], [2, 1], [3, 0]]], ")": [[[1, 6], [2, 5], [2, 1], [1, 0]]], "/": [[[0, 0], [4, 6]]], "_": [[[0, 0], [4, 0]]],
    ":": [[[2, 1], [2, 1.5]], [[2, 4], [2, 4.5]]], "&": [[[4, 0], [1, 4], [1, 5], [2, 6], [3, 5], [3, 4], [0, 2], [0, 1], [1, 0], [2, 0], [4, 2]]],
    "'": [[[2, 6], [2, 5]]], "#": [[[1, 0], [1, 6]], [[3, 0], [3, 6]], [[0, 2], [4, 2]], [[0, 4], [4, 4]]], "?": [[[0, 5], [1, 6], [3, 6], [4, 5], [4, 4], [2, 3], [2, 2]], [[2, 0], [2, 0.5]]],
  };
})();
/* Texten som streck (glyfenheter, baslinje y = 0). Andra bokstäver (é, ü …) utan accent. */
function ifcTextStrokes(text) {
  const strokes = [];
  let x = 0;
  String(text).toUpperCase().split("").forEach(ch => {
    let g = IFC_GLYPHS[ch];
    if (!g && ch !== " ") { const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, ""); g = IFC_GLYPHS[base] || IFC_GLYPHS["?"]; }
    if (g) g.forEach(pl => strokes.push(pl.map(([u, v]) => [u + x, v])));
    x += 6;
  });
  return { strokes, width: Math.max(0, x - 2) };
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

/* Bygger IFC-filen. Returnerar { text, n } eller null om inga objekt syns. */
function buildObjectsIfc() {
  const marks = objExportMarkers();
  if (!marks.length) return null;
  const at = $("dateInput").value || todayIso();
  const lines = [];
  let id = 0;
  const E = def => { id++; lines.push(`#${id}=${def};`); return `#${id}`; };
  // Projekt, enheter, sammanhang, plats.
  const origin = E("IFCCARTESIANPOINT((0.,0.,0.))");
  const ax = E(`IFCAXIS2PLACEMENT3D(${origin},$,$)`);
  const ctx = E(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${ax},$)`);
  const body = E(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
  const uL = E("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)"), uA = E("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)");
  const units = E(`IFCUNITASSIGNMENT((${uL},${uA}))`);
  const project = E(`IFCPROJECT('${ifcGuid()}',$,${ifcStr("4D-planering – " + (plan ? plan.name : ""))},${ifcStr("3D-objekt från Lägesplan " + at)},$,$,$,(${ctx}),${units})`);
  const sitePl = E(`IFCLOCALPLACEMENT($,${ax})`);
  const site = E(`IFCSITE('${ifcGuid()}',$,'4D-planering',$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
  E(`IFCRELAGGREGATES('${ifcGuid()}',$,$,$,${project},(${site}))`);
  // En ytstil per status.
  const styles = {};
  const styleFor = ph => {
    if (styles[ph]) return styles[ph];
    const n = parseInt(String(phaseColor(ph)).slice(1), 16);
    const rgb = E(`IFCCOLOURRGB($,${ifcNum((n >> 16 & 255) / 255)},${ifcNum((n >> 8 & 255) / 255)},${ifcNum((n & 255) / 255)})`);
    const sh = E(`IFCSURFACESTYLESHADING(${rgb},0.)`);
    return (styles[ph] = E(`IFCSURFACESTYLE(${ifcStr(PHASE_LABELS[ph] || ph)},.BOTH.,(${sh}))`));
  };
  const textStyle = (() => {
    const rgb = E("IFCCOLOURRGB($,0.07,0.09,0.15)"), sh = E(`IFCSURFACESTYLESHADING(${rgb},0.)`);
    return E(`IFCSURFACESTYLE('Text',.BOTH.,(${sh}))`);
  })();
  // Gemensam geometri: cylindern (samma för alla).
  const prof = E(`IFCCIRCLEPROFILEDEF(.AREA.,$,$,${ifcNum(IFC_CYL_R)})`);
  const zDir = E("IFCDIRECTION((0.,0.,1.))");
  // Textens läsriktning (samma som DXF:en: vågrätt i Lägesplans vy).
  const rr = dxfTextRotation() * Math.PI / 180, rx = Math.cos(rr), ry = Math.sin(rr);
  const elems = [];
  const warn = Number.isFinite(settings.warningDaysBeforeEnd) ? settings.warningDaysBeforeEnd : 7;
  const zoneOf = typeof zoneExportItems === "function" && typeof zoneExportPositions === "function"
    ? (() => { const pos = zoneExportPositions(plan); const zs = (plan.zones || []).map(z => [z, new Set(zoneExportItems(plan, z, pos).map(x => x.id))]); return it => zs.filter(([, s]) => s.has(it.id)).map(([z]) => [z.code, z.name].filter(Boolean).join(" ")).join(", "); })()
    : () => "";
  marks.forEach(mk => {
    const base = [mk.x, mk.y, mk.zTop + IFC_GAP];
    const pl = E(`IFCLOCALPLACEMENT(${sitePl},${E(`IFCAXIS2PLACEMENT3D(${E(`IFCCARTESIANPOINT(${ifcPt(base)})`)},$,$)`)})`);
    // Cylindern i statusfärg.
    const cyl = E(`IFCEXTRUDEDAREASOLID(${prof},$,${zDir},${ifcNum(IFC_CYL_H)})`);
    E(`IFCSTYLEDITEM(${cyl},(${styleFor(mk.ph)}),$)`);
    const cylShape = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${E(`IFCSHAPEREPRESENTATION(${body},'Body','SweptSolid',(${cyl}))`)}))`);
    const it = mk.it, prog = it.status === "klar" ? 100 : (Number(it.progress) || 0);
    const marker = E(`IFCBUILDINGELEMENTPROXY('${ifcGuid()}',$,${ifcStr(mk.name || it.object_name || "Objekt")},${ifcStr(PHASE_LABELS[mk.ph] || mk.ph)},'4D-markering',${pl},${cylShape},${ifcStr(it.id)},.NOTDEFINED.)`);
    elems.push(marker);
    // Egenskaperna (syns när man klickar på cylindern).
    const prop = (n, v) => E(`IFCPROPERTYSINGLEVALUE(${ifcStr(n)},$,${typeof v === "number" ? `IFCREAL(${ifcNum(v)})` : `IFCLABEL(${ifcStr(v)})`},$)`);
    const props = [prop("Objekt", it.object_name || ""), prop("Aktivitet", it.activity || ""), prop("Status", PHASE_LABELS[mk.ph] || mk.ph),
      prop("Framdrift %", prog), prop("Start", it.start_date || ""), prop("Slut", it.end_date || ""), prop("Område", it.area || ""),
      prop("Entreprenör", it.contractor || ""), prop("Zon", zoneOf(it)), prop("Antal objekt", mk.members.length), prop("Status per", at), prop("4D-ID", it.id)];
    const pset = E(`IFCPROPERTYSET('${ifcGuid()}',$,'4D-planering',$,(${props.join(",")}))`);
    E(`IFCRELDEFINESBYPROPERTIES('${ifcGuid()}',$,$,$,(${marker}),${pset})`);
    // 3D-texten (Victors önskemål 2026-10-05): liggande så att den läses uppifrån i planvyn, vänd som
    // Lägesplans vy, bredvid cylindern (täcker den inte uppifrån), 0,5 m tjocka bokstäver uppåt
    // från samma nivå som cylinderns fot.
    if (!mk.name) return;
    const { strokes } = ifcTextStrokes(mk.name);
    if (!strokes.length) return;
    const s = IFC_TEXT_H / 6, w = IFC_STROKE * IFC_TEXT_H / 2, u0 = (IFC_CYL_R + 0.3) / s, v0 = -3;
    // Glyf (u åt höger, v uppåt i läsriktningen) -> lokalt (meter): läsriktning (rx, ry), "uppåt" i planen (-ry, rx).
    const P = (u, v, z) => { const a = (u + u0) * s, b = (v + v0) * s; return [a * rx - b * ry, a * ry + b * rx, z]; };
    const pts = [], tris = [];
    strokes.forEach(pl => {
      for (let i = 0; i + 1 < pl.length; i++) {
        const [u1, v1] = pl[i], [u2, v2] = pl[i + 1], du = u2 - u1, dv = v2 - v1, L = Math.hypot(du, dv) || 1;
        const nu = -dv / L * w / s, nv = du / L * w / s, eu = du / L * w / s / 2, ev = dv / L * w / s / 2; // bredd + lite förlängning
        const q = [[u1 - eu + nu, v1 - ev + nv], [u2 + eu + nu, v2 + ev + nv], [u2 + eu - nu, v2 + ev - nv], [u1 - eu - nu, v1 - ev - nv]];
        // Strecket som ett rätblock: botten (z = 0) och topp (z = tjocklek).
        const k = pts.length + 1;
        q.forEach(([u, v]) => pts.push(P(u, v, 0)));
        q.forEach(([u, v]) => pts.push(P(u, v, IFC_TEXT_T)));
        const b = [k, k + 1, k + 2, k + 3], t = [k + 4, k + 5, k + 6, k + 7];
        // q går medurs i planen (sett uppifrån) – sidorna och locken vända utåt.
        tris.push([b[0], b[1], b[2]], [b[0], b[2], b[3]], [t[0], t[2], t[1]], [t[0], t[3], t[2]]);
        for (let j = 0; j < 4; j++) { const j2 = (j + 1) % 4; tris.push([b[j], t[j], t[j2]], [b[j], t[j2], b[j2]]); }
      }
    });
    const pl3 = E(`IFCCARTESIANPOINTLIST3D((${pts.map(ifcPt).join(",")}))`);
    const mesh = E(`IFCTRIANGULATEDFACESET(${pl3},$,.T.,(${tris.map(t => `(${t.join(",")})`).join(",")}),$)`);
    E(`IFCSTYLEDITEM(${mesh},(${textStyle}),$)`);
    const txtShape = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${E(`IFCSHAPEREPRESENTATION(${body},'Body','Tessellation',(${mesh}))`)}))`);
    elems.push(E(`IFCBUILDINGELEMENTPROXY('${ifcGuid()}',$,${ifcStr(mk.name)},'Namn','4D-text',${pl},${txtShape},${ifcStr(it.id)},.NOTDEFINED.)`));
  });
  E(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid()}',$,$,$,(${elems.join(",")}),${site})`);
  const now = new Date().toISOString().slice(0, 19);
  const head = ["ISO-10303-21;", "HEADER;", "FILE_DESCRIPTION(('ViewDefinition [ReferenceView]'),'2;1');",
    `FILE_NAME(${ifcStr(`3D-objekt ${plan ? plan.name : ""} ${at}.ifc`)},'${now}',(${ifcStr((settings && settings.userName) || "")}),('NCC'),'4D-planering',${ifcStr("4D-planering Lägesplan")},'');`,
    "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;"];
  return { text: [...head, ...lines, "ENDSEC;", "END-ISO-10303-21;"].join("\r\n") + "\r\n", n: marks.length };
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
