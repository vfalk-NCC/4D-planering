/* Lägesplan – IFC i 2D (Victor 2026-10-19: "kunna se IFCen i 2d i lägesplanen där jag kan släcka undan och filtrera objekt, samt
   plotta via utskriftslayout").

   Byggnadens IFC-modeller (de som är inlästa i 3D-vyn, Lager → Byggnad) skärs vågrätt på en vald höjd: planritningen
   (väggar, pelare, bjälklag som linjer) i modellens koordinater. Resultatet läggs som ett CAD-lager (ett lager per modell) i
   lagerlistan – samma som en DXF – så det går att tända/släcka, färga, byta linjetjocklek, fästa mot, ha med i utskriftslayouten
   (vektorer i PDF:en) och i DXF-exporten.
   Filter: det som är dolt i 3D (Dölj / Visa bara / Grupper) är dolt här; dessutom "visa bara objekt vars namn innehåller …" och
   "dölj objekt vars namn innehåller …". Lagret är bara i minnet (sparas inte i 4D-data) – "Uppdatera" räknar om det. */

const ifc2dRecs = [];                    // virtuella CAD-poster (type "cad", virtual) – ingår i cads()
let ifc2dWant = false;                   // snittet är tänt (även om filtret just nu inte ger några linjer)
const ifc2dCfg = { z: null, q: "", nq: "", weight: 1 };
const IFC2D_COLORS = ["#334155", "#b45309", "#1d4ed8", "#047857", "#7c3aed", "#be123c", "#0e7490", "#a16207"];
const IFC2D_MAX_SEGS = 600000;           // tak så att ritning och fästning förblir snabba
const ifc2dKey = () => `lagesplan-ifc2d-${typeof projectId !== "undefined" ? projectId : ""}`;
function ifc2dLoadCfg() { try { Object.assign(ifc2dCfg, JSON.parse(localStorage.getItem(ifc2dKey()) || "{}")); } catch (e) { /* standard */ } }
function ifc2dSaveCfg() { try { localStorage.setItem(ifc2dKey(), JSON.stringify(ifc2dCfg)); } catch (e) { /* privat läge */ } }

/* Modellernas höjdspann (modellens Z, meter) – för förslaget till snitthöjd. */
function ifc2dZRange() {
  let lo = Infinity, hi = -Infinity;
  if (typeof l3b === "undefined" || typeof l3 === "undefined" || !l3 || !l3.O) return null;
  l3b.models.filter(m => m.visible).forEach(m => m.meshes.forEach(mesh => {
    const g = mesh.geometry; if (!g.boundingBox) g.computeBoundingBox();
    if (g.boundingBox) { lo = Math.min(lo, g.boundingBox.min.z + mesh.position.z); hi = Math.max(hi, g.boundingBox.max.z + mesh.position.z); }
  }));
  return isFinite(lo) ? { lo: lo + l3.O[2], hi: hi + l3.O[2] } : null;
}

/* Skär alla tända modeller vid zModel (m): { models: [{ name, polylines: [[x0,y0,x1,y1,…] (mm rel. origo)], segs }] , capped } */
function ifc2dCut(zModel) {
  const zs = zModel - l3.O[2], q = (ifc2dCfg.q || "").trim().toLowerCase(), nq = (ifc2dCfg.nq || "").trim().toLowerCase();
  const out = []; let total = 0, capped = false;
  l3b.models.filter(m => m.visible).forEach(m => {
    const segs = [];
    m.meshes.forEach(mesh => {
      if (capped || !(typeof l3VisibleChain !== "function" || l3VisibleChain(mesh))) return;
      const u = mesh.userData.l3b, P = mesh.geometry.getAttribute("position"), idx = u && u.origIdx; if (!P || !idx) return;
      mesh.updateMatrixWorld(true);
      const e = mesh.matrixWorld.elements, n = P.count, X = new Float32Array(n), Y = new Float32Array(n), Z = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); X[i] = e[0] * x + e[4] * y + e[8] * z + e[12]; Y[i] = e[1] * x + e[5] * y + e[9] * z + e[13]; Z[i] = e[2] * x + e[6] * y + e[10] * z + e[14] - zs; }
      const vr = new Int32Array(n).fill(-1);
      u.ranges.forEach((r, i) => { const end = Math.min(n, r.start + r.count); for (let v = r.start; v < end; v++) vr[v] = i; });
      const skip = new Uint8Array(u.ranges.length);
      u.ranges.forEach((r, i) => { const nm = String(r.name || "").toLowerCase(); if (u.hidden && u.hidden.has(i)) skip[i] = 1; else if (q && !nm.includes(q)) skip[i] = 1; else if (nq && nm.includes(nq)) skip[i] = 1; });
      for (let t = 0; t + 2 < idx.length; t += 3) {
        const a = idx[t], b = idx[t + 1], c = idx[t + 2], ri = vr[a];
        if (ri >= 0 && skip[ri]) continue;
        const za = Z[a], zb = Z[b], zc = Z[c];
        if ((za > 0 && zb > 0 && zc > 0) || (za < 0 && zb < 0 && zc < 0)) continue;
        const pts = [];
        const edge = (i, j, zi, zj) => { if ((zi > 0) !== (zj > 0)) { const f = zi / (zi - zj); pts.push((X[i] + (X[j] - X[i]) * f) * 1000, (Y[i] + (Y[j] - Y[i]) * f) * 1000); } };
        edge(a, b, za, zb); edge(b, c, zb, zc); edge(c, a, zc, za);
        if (pts.length === 4) { segs.push(pts); if (++total >= IFC2D_MAX_SEGS) { capped = true; break; } }
      }
    });
    out.push({ name: m.name || "Modell", polylines: ifc2dChain(segs), segs: segs.length });
  });
  return { models: out, capped, total };
}

/* Fogar ihop sammanhängande segment till linjer och tar bort raka mellanpunkter (färre punkter att rita och skriva ut). */
function ifc2dChain(segs) {
  const key = (x, y) => Math.round(x * 2) + "," + Math.round(y * 2), ends = new Map(), used = new Uint8Array(segs.length);
  segs.forEach((s, i) => { [key(s[0], s[1]), key(s[2], s[3])].forEach(k => { const a = ends.get(k); if (a) a.push(i); else ends.set(k, [i]); }); });
  const take = k => { const a = ends.get(k); if (!a) return -1; while (a.length) { const i = a.pop(); if (!used[i]) return i; } return -1; };
  const out = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue; used[i] = 1;
    const line = [segs[i][0], segs[i][1], segs[i][2], segs[i][3]];
    for (let dir = 0; dir < 2; dir++) {
      for (;;) {
        const n = line.length, k = key(line[n - 2], line[n - 1]), j = take(k); if (j < 0) break;
        used[j] = 1; const s = segs[j];
        if (key(s[0], s[1]) === k) line.push(s[2], s[3]); else line.push(s[0], s[1]);
      }
      if (dir === 0) { const r = []; for (let p = line.length - 2; p >= 0; p -= 2) r.push(line[p], line[p + 1]); line.length = 0; line.push(...r); }
    }
    // raka mellanpunkter (< 0,5 mm avvikelse)
    const pts = [line[0], line[1]];
    for (let p = 2; p < line.length - 2; p += 2) {
      const ax = pts[pts.length - 2], ay = pts[pts.length - 1], bx = line[p], by = line[p + 1], cx = line[p + 2], cy = line[p + 3];
      const d = Math.abs((cx - ax) * (ay - by) - (ax - bx) * (cy - ay)) / (Math.hypot(cx - ax, cy - ay) || 1);
      if (d > 0.5) pts.push(bx, by);
    }
    pts.push(line[line.length - 2], line[line.length - 1]);
    out.push(pts);
  }
  return out;
}

function ifc2dClear(keepWant = false) {
  if (!keepWant) ifc2dWant = false;
  ifc2dRecs.splice(0).forEach(r => cadGeom.delete(r.id));
  if (typeof buildCadSnap === "function") buildCadSnap();
  if (typeof renderLayerPanel === "function") renderLayerPanel();
  if (typeof renderCad === "function") renderCad();
  ifc2dPaint();
}

async function ifc2dShow() {
  ifc2dWant = true;
  if (!plan || !plan.calib) { alert("Kalibrera planen mot 3D (📐) först – IFC-snittet placeras via modellens koordinater."); return; }
  const was3d = !!(document.getElementById("view3d") && !document.getElementById("view3d").classList.contains("hidden") && typeof l3 !== "undefined" && l3 && l3.scene);
  const info = $("ifc2dInfo");
  try {
    if (!was3d && typeof open3d === "function") {
      if (info) info.textContent = "Öppnar 3D för att läsa byggnaden …";
      await open3d();
      for (let i = 0; i < 120 && typeof l3b !== "undefined" && (l3b.busy || (!l3b.models.length && typeof l3bRemembered === "function" && l3bRemembered().length && i < 10)); i++) await new Promise(r => setTimeout(r, 500));
    }
    if (typeof l3b === "undefined" || !l3b.models.some(m => m.visible)) {
      if (info) info.textContent = "Inga IFC-modeller är inlästa. Öppna 3D, välj Lager → Byggnad och Visa valda – kom sedan tillbaka hit.";
      if (!was3d && typeof close3d === "function") close3d();
      return;
    }
    const zr = ifc2dZRange();
    if (ifc2dCfg.z === null || !isFinite(Number(ifc2dCfg.z))) ifc2dCfg.z = zr ? Math.round((zr.lo + 1.2) * 10) / 10 : 0;
    const z = Number(ifc2dCfg.z);
    if (info) info.textContent = "Skär modellerna …";
    await new Promise(r => setTimeout(r, 20));
    if (!ifc2dWant) return; // Ta bort trycktes medan snittet räknades
    const res = ifc2dCut(z);
    if (!ifc2dWant) return;
    ifc2dRecs.splice(0).forEach(r => cadGeom.delete(r.id));
    const o = [l3.O[0], l3.O[1]], groups = [], layers = [];
    res.models.forEach((m, i) => { if (!m.polylines.length) return; const color = IFC2D_COLORS[i % IFC2D_COLORS.length]; layers.push({ name: m.name, color, n: m.polylines.length }); groups.push({ l: layers.length - 1, c: color, p: m.polylines, t: [] }); });
    if (!groups.length) { if (info) info.textContent = `Inget skärs på höjden ${z} m${zr ? ` (modellen går från ${zr.lo.toFixed(1)} till ${zr.hi.toFixed(1)} m)` : ""} – prova en annan höjd eller ändra filtret.`; if (!was3d && typeof close3d === "function") close3d(); ifc2dClear(true); return; }
    const lines = groups.reduce((a, g) => a + g.p.length, 0);
    const rec = { id: "ifc2d", type: "cad", virtual: true, name: `🏢 IFC – snitt ${z.toLocaleString("sv-SE")} m`, layers, weight: Number(ifc2dCfg.weight) || 1, colorMode: "orig", color: "#1d4ed8", stats: { lines, texts: 0, kb: 0 }, factor: 1 };
    cadGeom.set(rec.id, buildCadGeom({ origin: o, groups }));
    ifc2dRecs.push(rec);
    ls("cad:" + rec.id).visible = true;
    if (typeof buildCadSnap === "function") buildCadSnap();
    if (typeof renderLayerPanel === "function") renderLayerPanel();
    if (typeof renderCad === "function") renderCad();
    if (info) info.textContent = `${lines.toLocaleString("sv-SE")} linjer i ${layers.length} modell${layers.length > 1 ? "er" : ""} på höjden ${z} m${res.capped ? ` – avkortat vid ${IFC2D_MAX_SEGS.toLocaleString("sv-SE")} segment, filtrera för att få med allt` : ""}.`;
    if (!was3d && typeof close3d === "function") close3d();
  } catch (e) {
    if (info) info.textContent = "Kunde inte skapa IFC-snittet: " + e.message;
    console.warn("IFC i planen", e);
  }
  ifc2dPaint();
}

function ifc2dPaint() {
  const b = $("btnIfc2d"), c = $("btnIfc2dClear"); if (!b) return;
  const on = ifc2dRecs.length > 0 || ifc2dWant;
  b.textContent = on ? "🔄 Uppdatera snittet" : "🏢 Visa IFC i planen";
  if (c) c.classList.toggle("hidden", !on);
  const z = $("ifc2dZ"); if (z && document.activeElement !== z) z.value = ifc2dCfg.z === null ? "" : ifc2dCfg.z;
  const q = $("ifc2dQ"); if (q && document.activeElement !== q) q.value = ifc2dCfg.q || "";
  const nq = $("ifc2dNQ"); if (nq && document.activeElement !== nq) nq.value = ifc2dCfg.nq || "";
}
function ifc2dBind() {
  if (!$("btnIfc2d")) return;
  ifc2dLoadCfg(); ifc2dPaint();
  $("btnIfc2d").onclick = () => ifc2dShow();
  $("btnIfc2dClear").onclick = () => ifc2dClear();
  const apply = () => { ifc2dSaveCfg(); if (ifc2dWant) ifc2dShow(); };
  $("ifc2dZ").onchange = e => { const v = Number(String(e.target.value).replace(",", ".")); ifc2dCfg.z = isFinite(v) && e.target.value !== "" ? v : null; apply(); };
  $("ifc2dUp").onclick = () => { ifc2dCfg.z = Math.round(((Number(ifc2dCfg.z) || 0) + 3) * 10) / 10; ifc2dPaint(); apply(); };
  $("ifc2dDown").onclick = () => { ifc2dCfg.z = Math.round(((Number(ifc2dCfg.z) || 0) - 3) * 10) / 10; ifc2dPaint(); apply(); };
  $("ifc2dQ").onchange = e => { ifc2dCfg.q = e.target.value; apply(); };
  $("ifc2dNQ").onchange = e => { ifc2dCfg.nq = e.target.value; apply(); };
}
ifc2dBind();
