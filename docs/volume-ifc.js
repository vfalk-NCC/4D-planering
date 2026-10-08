/* 4D-planering – ritade volymer som IFC (Victors önskemål 2026-10-05). Volymerna som ritas som
   manuella markeringar (bottenyta + höjd, se manual-markings.js) blir slutna kroppar i IFC4, i
   modellens koordinater (meter), i aktivitetens statusfärg vid tidslinjens datum och med namnet
   som liggande 3D-text ovanpå (läses uppifrån i planvyn). Egenskaperna (aktivitet, status,
   datum, höjd, yta, volym …) ligger i "4D-planering". Filen laddas ned och sparas i Trimble
   Connect-mappen "Lägesplan export". Skrivaren (ifcDoc, ifcTextSolid) finns i ifc-writer.js. */

const VOL_TC_FOLDER = "Lägesplan export";
const VOL_TRANSP = 0.3, VOL_TEXT_T = 0.5;

/* Bottenytan utan dubbla punkter (närmare än 1 cm) och utan upprepad slutpunkt. */
function volCleanPts(pts) {
  const out = [];
  (pts || []).forEach(p => {
    const q = [Number(p[0]), Number(p[1]), Number(p[2]) || 0];
    if (!Number.isFinite(q[0]) || !Number.isFinite(q[1])) return;
    const l = out[out.length - 1];
    if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) >= 0.01) out.push(q);
  });
  while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 0.01) out.pop();
  return out;
}
const volArea2 = P => P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);

/* Trianglar (index) för en moturs polygon – öronklippning, så att även konkava ytor (L-form)
   blir rätt. Självkorsande ytor faller tillbaka på en solfjäder. */
function volTriangulate(P) {
  const idx = P.map((_, i) => i), tris = [];
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => cross(a, b, p) > 1e-12 && cross(b, c, p) > 1e-12 && cross(c, a, p) > 1e-12;
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      const a = P[i0], b = P[i1], c = P[i2];
      if (cross(a, b, c) <= 1e-12) continue; // inte konvext hörn
      if (idx.some(j => j !== i0 && j !== i1 && j !== i2 && inside(P[j], a, b, c))) continue;
      tris.push([i0, i1, i2]); idx.splice(k, 1); cut = true; break;
    }
    if (!cut) { for (let k = 1; k + 1 < idx.length; k++) tris.push([idx[0], idx[k], idx[k + 1]]); return tris; }
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

/* Var namnet får plats bäst: den punkt inne i ytan (rutnät) där texten, längs läsriktningen
   (rx, ry), kan bli störst – begränsad av ytans bredd längs och tvärs genom punkten (så att
   texten hamnar i den stora delen av en L-formad yta, inte i hörnet utanför). */
function volLabelSpot(L, rx, ry, unitW) {
  const n = L.length;
  const inPoly = (x, y) => { let c = false; for (let i = 0, j = n - 1; i < n; j = i++) { const a = L[i], b = L[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  // Sträckan genom (x, y) i riktning (dx, dy) som ligger inne i ytan: [bakåt, framåt] i meter.
  const chord = (x, y, dx, dy) => {
    let lo = -Infinity, hi = Infinity;
    for (let i = 0; i < n; i++) {
      const a = L[i], b = L[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = ((a[0] - x) * ey - (a[1] - y) * ex) / den, u = ((a[0] - x) * dy - (a[1] - y) * dx) / den;
      if (u < -1e-9 || u > 1 + 1e-9) continue;
      if (t > 1e-9) hi = Math.min(hi, t); else if (t < -1e-9) lo = Math.max(lo, t);
    }
    return [Number.isFinite(lo) ? lo : 0, Number.isFinite(hi) ? hi : 0];
  };
  const xs = L.map(p => p[0]), ys = L.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), G = 24;
  let best = null;
  for (let i = 0; i <= G; i++) for (let j = 0; j <= G; j++) {
    let x = x0 + (x1 - x0) * (i + 0.5) / (G + 1), y = y0 + (y1 - y0) * (j + 0.5) / (G + 1);
    if (!inPoly(x, y)) continue;
    // Centrera i sträckan längs och tvärs.
    const [a0, a1] = chord(x, y, rx, ry); x += (a0 + a1) / 2 * rx; y += (a0 + a1) / 2 * ry;
    const [c0, c1] = chord(x, y, -ry, rx); x += (c0 + c1) / 2 * -ry; y += (c0 + c1) / 2 * rx;
    if (!inPoly(x, y)) continue;
    const [b0, b1] = chord(x, y, rx, ry), [d0, d1] = chord(x, y, -ry, rx);
    const h = Math.min((d1 - d0) * 0.4, (b1 - b0) * 0.85 / Math.max(unitW, 1));
    if (!best || h > best.h + 1e-6) best = { x, y, h };
  }
  if (!best) { const c = L.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n], [0, 0]); best = { x: c[0], y: c[1], h: 1 }; }
  return { x: best.x, y: best.y, h: Math.max(0.3, Math.min(2.5, best.h)) };
}

/* Volymerna som ska med: manuella markeringar av typen volym med minst tre hörn och höjd. */
function volumeMarks() {
  return (typeof manualMarks !== "undefined" ? manualMarks : [])
    .filter(m => m && m.shape === "volume" && Number(m.height) > 0 && volCleanPts(m.pts).length >= 3);
}

/* Bygger IFC-filen. Returnerar { text, n } eller null om det inte finns några volymer. */
function buildVolumesIfc(projName) {
  const marks = volumeMarks();
  if (!marks.length) return null;
  const at = (document.getElementById("timelineDate") || {}).value || new Date().toISOString().slice(0, 10);
  const colors = { ...DEFAULT_STATUS_COLORS, ...(settings.statusColors || {}) };
  const doc = ifcDoc("4D-planering – " + (projName || "volymer"), "Ritade volymer från 4D-planering " + at, "4D-planering"), E = doc.E;
  const elems = [];
  marks.forEach(m => {
    let P = volCleanPts(m.pts);
    if (volArea2(P) < 0) P = P.slice().reverse(); // moturs sett uppifrån
    const h = Number(m.height);
    // Lokala koordinater kring första hörnet (stora koordinater i placeringen, små i geometrin).
    const o = [Math.round(P[0][0]), Math.round(P[0][1]), Math.round(Math.min(...P.map(p => p[2])) * 1000) / 1000];
    const L = P.map(p => [p[0] - o[0], p[1] - o[1], p[2] - o[2]]);
    const n = L.length, tris = volTriangulate(L);
    // Sluten kropp: botten (normal nedåt), topp (uppåt, varje hörn sin egen höjd + höjden) och sidor.
    const pts = [...L, ...L.map(p => [p[0], p[1], p[2] + h])];
    const faces = [];
    tris.forEach(([a, b, c]) => { faces.push([a + 1, c + 1, b + 1], [a + n + 1, b + n + 1, c + n + 1]); });
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; faces.push([i + 1, j + 1, j + n + 1], [i + 1, j + n + 1, i + n + 1]); }
    const pl3 = E(`IFCCARTESIANPOINTLIST3D((${pts.map(ifcPt).join(",")}))`);
    const mesh = E(`IFCTRIANGULATEDFACESET(${pl3},$,.T.,(${faces.map(f => `(${f.join(",")})`).join(",")}),$)`);
    const it = items.find(x => x.id === m.itemId) || null;
    const ph = it ? markPhase(m) : null;
    const label = ph ? STATUS_LABELS[ph] || ph : "Aktiviteten finns inte";
    E(`IFCSTYLEDITEM(${mesh},(${doc.style(ph || "__none", ph ? colors[ph] || "#888888" : "#888888", label, VOL_TRANSP)}),$)`);
    const name = (it && (it.objectName || it.activity)) || "Volym";
    const full = m.subName ? `${name} – ${m.subName}` : name;
    const pl = doc.place(o);
    const el = doc.proxy(full, label, "4D-volym", pl, doc.shape(mesh, "Tessellation"), m.itemId || m.id);
    elems.push(el);
    const area = Math.abs(volArea2(L)) / 2;
    const prog = it ? (it.status === "klar" ? 100 : (Number(it.progress) || 0)) : 0;
    doc.props(el, [["Objekt", (it && it.objectName) || ""], ["Aktivitet", (it && it.activity) || ""], ["Delaktivitet", m.subName || ""],
      ["Status", label], ["Framdrift %", prog], ["Start", (m.subName && m.subStart) || (it && it.startDate) || ""], ["Slut", (m.subName && m.subEnd) || (it && it.endDate) || ""],
      ["Område", (it && it.area) || ""], ["Entreprenör", (it && it.contractor) || ""],
      ["Höjd m", Math.round(h * 1000) / 1000], ["Basyta m²", Math.round(area * 100) / 100], ["Volym m³", Math.round(area * h * 100) / 100],
      ["Ritad av", m.by || ""], ["Ritad", String(m.created_at || "").slice(0, 10)], ["Status per", at], ["4D-ID", m.itemId || ""]]);
    // Namnet som liggande 3D-text ovanpå, längs ytans längsta kant (läsbart, inte upp och ned).
    let best = 0, rx = 0, ry = 0;
    // Lika långa kanter (inom 2 %): den mest vågräta vinner.
    for (let i = 0; i < n; i++) {
      const a = L[i], b = L[(i + 1) % n], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d > best * 1.02 || (d >= best * 0.98 && Math.abs(b[0] - a[0]) / d > Math.abs(rx) + 1e-9)) { best = Math.max(best, d); rx = (b[0] - a[0]) / d; ry = (b[1] - a[1]) / d; }
    }
    if (!best) rx = 1;
    if (rx < -1e-9 || (Math.abs(rx) <= 1e-9 && ry < 0)) { rx = -rx; ry = -ry; }
    const unitW = ifcTextStrokes(name).width / 6; // textens bredd per meter texthöjd
    const spot = volLabelSpot(L, rx, ry, unitW);
    const top = Math.max(...L.map(p => p[2])) + h;
    const tpl = doc.place([o[0] + spot.x, o[1] + spot.y, o[2] + top]);
    const dark = ph === "forsenad" || ph === "klar";
    const txt = ifcTextSolid(doc, name, { h: spot.h, t: VOL_TEXT_T, rx, ry, style: dark ? doc.textStyleLight : doc.textStyle });
    if (txt) elems.push(doc.proxy(`${full} – text`, "Namn", "4D-volymtext", tpl, doc.shape(txt, "Tessellation"), m.itemId || m.id));
  });
  return { text: doc.finish(elems, `Volymer ${projName || ""} ${at}.ifc`), n: marks.length };
}

async function exportVolumesIfc() {
  if (typeof manualMarksLoaded !== "undefined" && !manualMarksLoaded && typeof loadManualMarks === "function" && projectId) await loadManualMarks();
  let projName = "";
  try { projName = (API && API.project && (await API.project.getProject()) || {}).name || ""; } catch (e) { /* utan projektnamn */ }
  const r = buildVolumesIfc(projName);
  if (!r) { alert("Det finns inga ritade volymer att exportera. Rita en volym via en aktivitets meny (Manuell markering → Volym)."); return null; }
  const at = (document.getElementById("timelineDate") || {}).value || new Date().toISOString().slice(0, 10);
  // Klockslaget i namnet: en ny export samma dag skriver inte över den förra.
  const name = `Volymer ${projName ? projName + " " : ""}${at} ${typeof placeStamp === "function" ? placeStamp().slice(11) : ""}.ifc`.replace(/ \.ifc$/, ".ifc").replace(/[\\/:*?"<>|]/g, "-");
  const bytes = new TextEncoder().encode(r.text); // ren ASCII (å/ä/ö som \X2\)
  // Alltid en lokal kopia.
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/x-step" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  // Och i Trimble Connect (tcUploadFiles visar själv förlopp och fel).
  try {
    const res = await tcUploadFiles([new File([bytes], name, { type: "application/x-step" })], VOL_TC_FOLDER);
    return { n: r.n, name, tc: res };
  } catch (e) {
    console.warn("Volym-IFC: kunde inte spara i Trimble Connect", e);
    alert(`Volymerna är nedladdade, men kunde inte sparas i Trimble Connect:\n${e.message}`);
    return { n: r.n, name, tc: null, error: e.message };
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const b = document.getElementById("btnExportVolumesIfc");
  if (b) b.onclick = () => { exportVolumesIfc().catch(e => alert("Kunde inte exportera volymerna: " + e.message)); };
});
