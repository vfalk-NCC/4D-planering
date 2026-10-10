/* Delad IFC-skrivare (Victors önskemål 2026-10-05): används av Lägesplans IFC-exporter (3D-objekt,
   zoner) och av 4D-planeringens export av ritade volymer. IFC4 som STEP-text, meter. Innehåller
   streckfonten för liggande 3D-text, hjälp för GUID/text/tal, ifcDoc (filens grund: projekt,
   enheter, plats, ytstilar, egenskaper) och ifcTextSolid (3D-text som slutna kroppar). */

const IFC_STROKE = 0.14; // streckbredd för 3D-texten (del av texthöjden)

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
    6: [[...arc(1.85, 4.0, 1.75, 2.0, 50, 180, 7), [0.1, 1.9]], arc(2, 1.9, 1.9, 1.9, 0, 360, 18)],
    7: [[[0, 6], [4, 6], [1.4, 0]]],
    8: [arc(2, 4.6, 1.7, 1.4, 270, 630, 14), arc(2, 1.6, 2, 1.6, 90, 450, 16)],
    9: [arc(2, 4.1, 1.9, 1.9, 0, 360, 18), [[3.9, 4.1], ...arc(2.15, 2.0, 1.75, 2.0, 0, -130, 7)]],
    "-": [[[0.8, 3], [3.2, 3]]], "–": [[[0.4, 3], [3.6, 3]]], "×": [[[0.8, 1.4], [3.2, 4.2]], [[0.8, 4.2], [3.2, 1.4]]], "·": [[[2, 2.8], [2, 3.25]]],
    "=": [[[0.6, 2.2], [3.4, 2.2]], [[0.6, 3.8], [3.4, 3.8]]], "!": [[[2, 1.7], [2, 6]], [[2, 0], [2, 0.45]]], "%": [[[0, 0], [4, 6]], arc(0.8, 5, 0.8, 1, 0, 360, 8), arc(3.2, 1, 0.8, 1, 0, 360, 8)],
    '"': [[[1.3, 6], [1.3, 4.9]], [[2.7, 6], [2.7, 4.9]]], "+": [[[0.6, 3], [3.4, 3]], [[2, 1.6], [2, 4.4]]], ".": [[[2, 0], [2, 0.45]]], ",": [[[2.1, 0.5], [1.6, -0.7]]],
    "(": [arc(3.6, 3, 1.6, 3.4, 118, 242, 8)], ")": [arc(0.4, 3, 1.6, 3.4, 62, -62, 8)], "/": [[[0, 0], [4, 6]]], "_": [[[0, -0.2], [4, -0.2]]],
    ":": [[[2, 0.6], [2, 1.05]], [[2, 3.6], [2, 4.05]]], "&": [[[4, 0], [1.1, 3.9], ...arc(2, 4.9, 1, 1.1, 180, 0, 6).slice(1), [0.4, 1.9], ...arc(1.6, 1.4, 1.4, 1.4, 160, 290, 5).slice(1), [4, 2.2]]],
    "'": [[[2, 6], [2, 4.9]]], "#": [[[1.2, 0], [1.6, 6]], [[2.6, 0], [3, 6]], [[0, 2], [4, 2]], [[0, 4], [4, 4]]],
    "?": [[...arc(2, 4.4, 1.9, 1.6, 160, -60, 8), [2, 2.4], [2, 1.7]], [[2, 0], [2, 0.45]]],
    "°": [arc(2, 5.2, 0.8, 0.8, 0, 360, 10)],
    // Upphöjd 2 och 3 (m², m³) – Victor 2026-10-10: "upphöjt till 2 i M2 ett frågetecken".
    "²": [[...arc(1.6, 5.15, 1.1, 0.85, 160, -20, 8), [0.5, 3.4], [2.7, 3.4]]],
    "³": [[...arc(1.6, 5.5, 1.0, 0.65, 150, -90, 7), ...arc(1.6, 4.15, 1.1, 0.75, 90, -150, 7).slice(1)]],
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
   entitet och ger dess #id. appName = programmet som skrev filen (FILE_NAME). */
function ifcDoc(projName, desc, appName = "4D-planering Lägesplan") {
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
        `FILE_NAME(${ifcStr(fileName)},'${now}',(${ifcStr((typeof settings !== "undefined" && settings.userName) || "")}),('NCC'),'4D-planering',${ifcStr(appName)},'');`,
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
  // Varje streck som en sammanhängande kropp (Victor 2026-10-10: "lite hackiga"): skarvarna i en båge
  // görs med gering, skarpa hörn och ändarna får runda "pennspetsar" (en tolvhörning). Trianglarna
  // vänds utåt genom att jämföras med en riktning de ska peka åt.
  const pts = [], tris = [];
  const add = (u, v, z) => { pts.push(P(u, v, z)); return pts.length; };
  const tri = (a, b, c, hint) => {
    const A = pts[a - 1], B = pts[b - 1], C = pts[c - 1];
    const n = [(B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]), (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]), (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])];
    tris.push(n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] >= 0 ? [a, b, c] : [a, c, b]);
  };
  // Riktning i glyfplanet -> lokalt (samma vridning som P, utan förskjutning).
  const dirL = (du, dv) => [du * rx - dv * ry, du * ry + dv * rx, 0];
  const r = w / s; // halva streckbredden i glyfenheter
  const disc = (cu, cv) => {
    const K = 12, c0 = add(cu, cv, 0), c1 = add(cu, cv, t), ring = [];
    for (let k = 0; k < K; k++) { const a = 2 * Math.PI * k / K; ring.push([add(cu + r * Math.cos(a), cv + r * Math.sin(a), 0), add(cu + r * Math.cos(a), cv + r * Math.sin(a), t), Math.cos(a), Math.sin(a)]); }
    for (let k = 0; k < K; k++) {
      const [b0, t0, ca, sa] = ring[k], [b1, t1, cb, sb] = ring[(k + 1) % K], out = dirL((ca + cb) / 2, (sa + sb) / 2);
      tri(c0, b0, b1, [0, 0, -1]); tri(c1, t0, t1, [0, 0, 1]); tri(b0, b1, t1, out); tri(b0, t1, t0, out);
    }
  };
  const ribbon = q => {
    if (q.length < 2) return;
    const L = [], R = [];
    for (let i = 0; i < q.length; i++) {
      const seg = (a, b) => { const du = b[0] - a[0], dv = b[1] - a[1], l = Math.hypot(du, dv) || 1; return [du / l, dv / l]; };
      const d0 = i > 0 ? seg(q[i - 1], q[i]) : seg(q[0], q[1]), d1 = i < q.length - 1 ? seg(q[i], q[i + 1]) : d0;
      let nu = -(d0[1] + d1[1]), nv = d0[0] + d1[0];
      const nl = Math.hypot(nu, nv) || 1; nu /= nl; nv /= nl;
      const cosH = Math.max(0.5, nu * -d1[1] + nv * d1[0]); // gering, högst dubbel bredd
      const ou = nu * r / cosH, ov = nv * r / cosH, [u, v] = q[i];
      L.push([add(u + ou, v + ov, 0), add(u + ou, v + ov, t), [ou, ov]]);
      R.push([add(u - ou, v - ov, 0), add(u - ou, v - ov, t), [-ou, -ov]]);
    }
    for (let i = 0; i + 1 < q.length; i++) {
      const [lb0, lt0, lo] = L[i], [lb1, lt1] = L[i + 1], [rb0, rt0, ro] = R[i], [rb1, rt1] = R[i + 1];
      tri(lb0, lb1, rb1, [0, 0, -1]); tri(lb0, rb1, rb0, [0, 0, -1]);
      tri(lt0, lt1, rt1, [0, 0, 1]); tri(lt0, rt1, rt0, [0, 0, 1]);
      tri(lb0, lb1, lt1, dirL(lo[0], lo[1])); tri(lb0, lt1, lt0, dirL(lo[0], lo[1]));
      tri(rb0, rb1, rt1, dirL(ro[0], ro[1])); tri(rb0, rt1, rt0, dirL(ro[0], ro[1]));
    }
    // Ändarna stängs (rundningen täcker dem).
    const end = (i, sgn) => { const d = q[i + sgn] ? [q[i][0] - q[i + sgn][0], q[i][1] - q[i + sgn][1]] : [1, 0], o = dirL(d[0], d[1]); tri(L[i][0], R[i][0], R[i][1], o); tri(L[i][0], R[i][1], L[i][1], o); };
    end(0, 1); end(q.length - 1, -1);
  };
  strokes.forEach(pl0 => {
    const pl = pl0.filter((p, i) => !i || Math.hypot(p[0] - pl0[i - 1][0], p[1] - pl0[i - 1][1]) > 1e-6);
    if (pl.length === 1) { disc(pl[0][0], pl[0][1]); return; }
    // Dela vid skarpa hörn (mer än ~50°) – där blir det en rund skarv i stället för en spetsig gering.
    let piece = [pl[0]];
    for (let i = 1; i < pl.length; i++) {
      piece.push(pl[i]);
      if (i < pl.length - 1) {
        const a = [pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]], b = [pl[i + 1][0] - pl[i][0], pl[i + 1][1] - pl[i][1]];
        const c = (a[0] * b[0] + a[1] * b[1]) / ((Math.hypot(...a) * Math.hypot(...b)) || 1);
        if (c < 0.64) { ribbon(piece); disc(pl[i][0], pl[i][1]); piece = [pl[i]]; }
      }
    }
    ribbon(piece);
    disc(pl[0][0], pl[0][1]); disc(pl[pl.length - 1][0], pl[pl.length - 1][1]);
  });
  const pl3 = doc.E(`IFCCARTESIANPOINTLIST3D((${pts.map(ifcPt).join(",")}))`);
  const mesh = doc.E(`IFCTRIANGULATEDFACESET(${pl3},$,.T.,(${tris.map(tr => `(${tr.join(",")})`).join(",")}),$)`);
  doc.E(`IFCSTYLEDITEM(${mesh},(${style || doc.textStyle}),$)`);
  return mesh;
}
