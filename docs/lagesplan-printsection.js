/* Utskriftslayout – sektioner (Victor 2026-10-19: "vrida in sektioner på rätt ställe i IFC så att jag kan få in den i
   utskriftslayout och tända upp bubblor på samma sätt där jag ser framdriften").

   Ett sektionselement skär byggnadens IFC-modeller lodrätt längs en linje (p1 → p2, modellens koordinater i meter) och ritar
   snittet som linjer på bladet: längs linjen åt höger, höjd uppåt. Aktiviteternas objekt bakom snittplanet (inom "djup") får
   bubblor med namn, datum och framdrift – samma kort som i 3D-vyn – med ledlinje till objektet, och snittlinjerna får
   statusfärg. Allt ritas med vanliga canvasanrop, så PDF:en blir vektorer (lagesplan-pdfvec.js).

   el: { type: "section", src: "ifc" | "pdf", p1: [x, y], p2: [x, y], side: 1 | -1, depth (m), scale (0 = passa),
         zlo, zhi (m, null = hela), q, nq (namnfilter), title, color, lw (mm), status (färga efter status),
         bub: { on, mode: "active" | "all" | "sel", prog: "entered" | "plan", size (mm), max, fields: {name,date,progress} },
         pdf: { path, page, a: [u, z], b: [u, z], pa: [px, py], pb: [px, py] } (variant 2: egen sektionsritning) }
   Det beräknade snittet ligger bara i minnet (secData) – sparas inte i mallen. "Uppdatera sektion" räknar om det. */

const SEC_DEF = { src: "ifc", p1: null, p2: null, side: 1, depth: 4, scale: 0, zlo: null, zhi: null, q: "", nq: "", title: "SEKTION A–A", color: "#334155", lw: 0.18, status: true,
  bub: { on: true, off: {}, pos: {}, anc: {}, mode: "running", prog: "entered", size: 36, max: 12, fields: { name: true, date: true, progress: true } } };
const secView = new Map();               // elementets id -> senaste ritvyn (för att klicka ut beskärningen)
const secSel = { el: null, key: null };  // vald bubbla (klick) – alternativen visas i panelen
const secCards = new Map();               // elementets id -> [{ key, x, y, w, h }] bubblornas rutor (bladets mm) – för att kunna flytta dem
const secData = new Map();               // elementets id -> { sig, groups: Map(nyckel -> polylinjer [u,z mm]), anchors, L, zlo, zhi }
const secPick = { el: null, pts: [], cal: null, wiz: false, crop: false, cropEdit: null };
const sec3d = { el: null, pts: [], opened: false, mode: null, msg: "" };   // steg 2: punkterna A och B klickas i 3D-modellen    // "Välj i ritning": väntar på två klick på en ritning
const SEC_MAX_SEGS = 400000;
const secKey = r => (r.group_id ? `g:${r.group_id}` : r.source_key ? `s:${r.source_key}` : `i:${r.id}`);
const secBub = el => ({ ...SEC_DEF.bub, off: {}, pos: {}, anc: {}, cfg: {}, ...(el.bub || {}), fields: { ...SEC_DEF.bub.fields, ...((el.bub || {}).fields || {}) } });
const secLen = el => (el.p1 && el.p2 ? Math.hypot(el.p2[0] - el.p1[0], el.p2[1] - el.p1[1]) : 0);
const secAt = () => ($("dateInput") && $("dateInput").value) || (typeof todayIso === "function" ? todayIso() : "");

/* Aktivitetens framdrift vid datumet: inskriven (som i tidplanen) eller uträknad linjärt över aktivitetens längd. */
function secProg(r, mode, at) {
  const p = Math.max(0, Math.min(100, Math.round(Number(r.progress) || 0)));
  if (mode !== "plan") return p;
  const d = x => (x ? Date.parse(String(x).slice(0, 10) + "T00:00:00Z") / 864e5 : NaN), s = d(r.start_date), e = d(r.end_date), t = d(at);
  if (![s, e, t].every(Number.isFinite)) return p;
  if (t >= e) return 100; if (t <= s) return 0;
  return Math.round(100 * (t - s) / Math.max(1, e - s));
}
function secPhase(r) {
  const warn = typeof settings !== "undefined" && Number.isFinite(settings.warningDaysBeforeEnd) ? settings.warningDaysBeforeEnd : 7;
  return r && typeof computeItemPhase === "function" ? computeItemPhase(r, secAt(), warn) || "planerad" : "ingen";
}

/* Skär modellerna längs sektionslinjen. Returnerar { groups, anchors, L, zlo, zhi } eller null om inga modeller är inlästa. */
function secCompute(el) {
  if (typeof l3b === "undefined" || typeof l3 === "undefined" || !l3 || !l3.O || !el.p1 || !el.p2) return null;
  const L = secLen(el); if (L < 0.05) return null;
  const dx = (el.p2[0] - el.p1[0]) / L, dy = (el.p2[1] - el.p1[1]) / L, side = el.side === -1 ? -1 : 1, nx = -dy * side, ny = dx * side;
  const ox = l3.O[0] - el.p1[0], oy = l3.O[1] - el.p1[1], oz = l3.O[2];
  const depth = Math.max(0, Number(el.depth) || 0), front = Math.max(0, Number(el.front) || 0), q = (el.q || "").trim().toLowerCase(), nq = (el.nq || "").trim().toLowerCase();
  const zlo = el.zlo === null || el.zlo === undefined || el.zlo === "" ? -Infinity : Number(el.zlo), zhi = el.zhi === null || el.zhi === undefined || el.zhi === "" ? Infinity : Number(el.zhi);
  const byId = new Map((typeof items !== "undefined" ? items : []).map(r => [r.id, r]));
  const segsBy = new Map(), anchorBy = new Map();
  let total = 0, capped = false, zMin = Infinity, zMax = -Infinity;
  l3b.models.filter(m => m.visible).forEach(m => m.meshes.forEach(mesh => {
    if (capped || !(typeof l3VisibleChain !== "function" || l3VisibleChain(mesh))) return;
    const ud = mesh.userData.l3b, P = mesh.geometry.getAttribute("position"), idx = ud && ud.origIdx; if (!P || !idx) return;
    mesh.updateMatrixWorld(true);
    const e = mesh.matrixWorld.elements, n = P.count, U = new Float32Array(n), V = new Float32Array(n), Z = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12] + ox, wy = e[1] * x + e[5] * y + e[9] * z + e[13] + oy;
      U[i] = wx * dx + wy * dy; V[i] = wx * nx + wy * ny; Z[i] = e[2] * x + e[6] * y + e[10] * z + e[14] + oz;
    }
    const vr = new Int32Array(n).fill(-1);
    ud.ranges.forEach((r, i) => { const end = Math.min(n, r.start + r.count); for (let v = r.start; v < end; v++) vr[v] = i; });
    const skip = new Uint8Array(ud.ranges.length), keyOf = new Array(ud.ranges.length);
    ud.ranges.forEach((r, i) => {
      const nm = String(r.name || "").toLowerCase();
      if (ud.hidden && ud.hidden.has(i)) skip[i] = 1; else if (q && !nm.includes(q)) skip[i] = 1; else if (nq && nm.includes(nq)) skip[i] = 1;
      const row = r.itemId ? byId.get(r.itemId) : null; keyOf[i] = row ? secKey(row) : "";
      if (row && !skip[i]) {
        // Objektets utsträckning i (u, v, z) – bubblan fäster där det syns bakom snittet.
        let u0 = 1e18, u1 = -1e18, v0 = 1e18, v1 = -1e18, z1 = -1e18, z0 = 1e18;
        const end = Math.min(n, r.start + r.count);
        for (let v = r.start; v < end; v++) { if (U[v] < u0) u0 = U[v]; if (U[v] > u1) u1 = U[v]; if (V[v] < v0) v0 = V[v]; if (V[v] > v1) v1 = V[v]; if (Z[v] > z1) z1 = Z[v]; if (Z[v] < z0) z0 = Z[v]; }
        if (end > r.start && u1 >= 0 && u0 <= L && v1 >= -front && v0 <= depth && z1 >= zlo && z0 <= zhi) {
          const a = anchorBy.get(keyOf[i]) || anchorBy.set(keyOf[i], { row, us: [], zTop: -1e18, n: 0, box: [1e18, -1e18, 1e18, -1e18] }).get(keyOf[i]);
          a.us.push(Math.max(0, Math.min(L, (u0 + u1) / 2))); a.zTop = Math.max(a.zTop, Math.min(z1, zhi)); a.n++;
          a.box = [Math.min(a.box[0], Math.max(0, u0)), Math.max(a.box[1], Math.min(L, u1)), Math.min(a.box[2], Math.max(z0, zlo)), Math.max(a.box[3], Math.min(z1, zhi))]; // objektets utsträckning (u, z) – bubblans punkt hålls inom den
        }
      }
    });
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2], ri = vr[a];
      if (ri >= 0 && skip[ri]) continue;
      const va = V[a], vb = V[b], vc = V[c];
      if ((va > 0 && vb > 0 && vc > 0) || (va < 0 && vb < 0 && vc < 0)) continue;
      const pts = [], edge = (i, j, vi, vj) => { if ((vi > 0) !== (vj > 0)) { const f = vi / (vi - vj); pts.push(U[i] + (U[j] - U[i]) * f, Z[i] + (Z[j] - Z[i]) * f); } };
      edge(a, b, va, vb); edge(b, c, vb, vc); edge(c, a, vc, va);
      if (pts.length !== 4) continue;
      let [u0, z0, u1, z1] = pts;
      if ((u0 < 0 && u1 < 0) || (u0 > L && u1 > L)) continue;
      if (u0 !== u1) { // klipp till sektionens längd
        const cut = (ua, za, ub, zb, lim) => { const f = (lim - ua) / (ub - ua); return [lim, za + (zb - za) * f]; };
        if (u0 < 0) [u0, z0] = cut(u0, z0, u1, z1, 0); else if (u0 > L) [u0, z0] = cut(u0, z0, u1, z1, L);
        if (u1 < 0) [u1, z1] = cut(u1, z1, u0, z0, 0); else if (u1 > L) [u1, z1] = cut(u1, z1, u0, z0, L);
      }
      if ((z0 < zlo && z1 < zlo) || (z0 > zhi && z1 > zhi)) continue;
      z0 = Math.max(zlo, Math.min(zhi, z0)); z1 = Math.max(zlo, Math.min(zhi, z1));
      zMin = Math.min(zMin, z0, z1); zMax = Math.max(zMax, z0, z1);
      const key = ri >= 0 ? keyOf[ri] : "", arr = segsBy.get(key) || segsBy.set(key, []).get(key);
      arr.push([u0 * 1000, z0 * 1000, u1 * 1000, z1 * 1000]);
      if (++total >= SEC_MAX_SEGS) { capped = true; break; }
    }
  }));
  const groups = new Map();
  segsBy.forEach((segs, key) => groups.set(key, ifc2dChain(segs)));
  const anchors = [...anchorBy.entries()].map(([key, a]) => ({ key, row: a.row, u: a.us.reduce((s, v) => s + v, 0) / a.us.length, z: a.zTop, n: a.n, box: a.box })).filter(a => isFinite(a.z));
  if (!isFinite(zMin)) { zMin = 0; zMax = 3; }
  return { groups, anchors, L, zlo: zMin, zhi: zMax, segs: total, capped, sig: secSig(el) };
}

/* Se till att byggnaden är inläst (öppnar 3D om det behövs) och räkna om snittet för elementet. */
async function secBuild(el, o = {}) {
  const was3d = !!(document.getElementById("view3d") && !document.getElementById("view3d").classList.contains("hidden") && typeof l3 !== "undefined" && l3 && l3.scene);
  const say = t => { if (o.say) o.say(t); };
  try {
    if (!el.p1 || !el.p2 || secLen(el) < 0.05) { say("Ange sektionslinjen (start och slut) först."); return false; }
    if (!was3d && o.open !== false && typeof open3d === "function") {
      say("Öppnar 3D för att läsa byggnaden …");
      await open3d();
      for (let i = 0; i < 120 && typeof l3b !== "undefined" && (l3b.busy || (!l3b.models.length && typeof l3bRemembered === "function" && l3bRemembered().length && i < 10)); i++) await new Promise(r => setTimeout(r, 500));
    }
    if (typeof l3b === "undefined" || !l3b.models.some(m => m.visible)) { say("Inga IFC-modeller är inlästa. Öppna 3D, välj Lager → Byggnad och Visa valda – kom sedan tillbaka hit."); return false; }
    say("Skär modellerna …");
    await new Promise(r => setTimeout(r, 20));
    const res = secCompute(el);
    if (!res) { say("Kunde inte skära – kontrollera sektionslinjen."); return false; }
    secData.set(el.id, res); secPersist(el, res);
    say(`${res.segs.toLocaleString("sv-SE")} linjesegment, ${res.anchors.length} aktiviteter bakom snittet${res.capped ? " – avkortat, filtrera för att få med allt" : ""}.`);
    return true;
  } catch (e) { say("Kunde inte skapa sektionen: " + e.message); console.warn("Sektion", e); return false; }
  finally { if (!was3d && o.open !== false && typeof close3d === "function" && document.getElementById("view3d") && !document.getElementById("view3d").classList.contains("hidden")) close3d(); }
}

/* Det beräknade snittet ligger kvar (Victor 2026-10-19: "man måste läsa in det på nytt varje gång man öppnar utskriftslayouten"): sparas i webbläsarens
   lokala databas (IndexedDB) per projekt, mall och element, tillsammans med de inställningar det räknades med. Passar inställningarna inte längre
   (linje, höjder, djup, sida, filter) används det inte. Ligger lokalt i den här webbläsaren – inte i 4D-data. */
const secTried = new Set();
const secSig = el => JSON.stringify([el.p1, el.p2, el.side === -1 ? -1 : 1, Number(el.depth) || 0, Number(el.front) || 0, el.zlo ?? null, el.zhi ?? null, (el.q || "").trim(), (el.nq || "").trim()]);
const secKeyOf = el => `${typeof projectId !== "undefined" ? projectId : ""}|${pr && pr.tpl ? pr.tpl.id || "" : ""}|${el.id}`;
function secIdb() {
  if (secIdb.p) return secIdb.p;
  secIdb.p = new Promise((res, rej) => {
    try { const r = indexedDB.open("lagesplan-sections", 1); r.onupgradeneeded = () => r.result.createObjectStore("sec"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); }
  }).catch(() => null);
  return secIdb.p;
}
async function secPersist(el, res) {
  try {
    const db = await secIdb(); if (!db) return;
    const r1 = v => Math.round(v * 10) / 10;
    const rec = { sig: secSig(el), L: res.L, zlo: res.zlo, zhi: res.zhi, segs: res.segs, capped: res.capped, at: Date.now(),
      groups: [...res.groups.entries()].map(([k, lines]) => [k, lines.map(p => p.map(r1))]), anchors: res.anchors.map(a => ({ key: a.key, u: a.u, z: a.z, n: a.n, box: a.box })), v: 2 };
    await new Promise((ok, no) => { const t = db.transaction("sec", "readwrite"); t.objectStore("sec").put(rec, secKeyOf(el)); t.oncomplete = ok; t.onerror = () => no(t.error); });
  } catch (e) { /* utan lagring: räknas om nästa gång */ }
}
async function secRestore(el) {
  secTried.add(el.id);
  try {
    if (secData.has(el.id) || !el.p1 || !el.p2) return false;
    const db = await secIdb(); if (!db) return false;
    const rec = await new Promise((ok, no) => { const q = db.transaction("sec").objectStore("sec").get(secKeyOf(el)); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); });
    if (!rec || rec.v !== 2 || rec.sig !== secSig(el) || secData.has(el.id)) return false;
    const anchors = rec.anchors.map(a => ({ ...a, row: secRow(a.key) })).filter(a => a.row);
    secData.set(el.id, { groups: new Map(rec.groups), anchors, L: rec.L, zlo: rec.zlo, zhi: rec.zhi, segs: rec.segs, capped: rec.capped, restored: rec.at, sig: rec.sig });
    if (pr && pr.tpl.elements.includes(el)) { drawPrintPage(); const info = document.getElementById("secInfo"); if (info) info.textContent = `Sparad sektion återställd (${new Date(rec.at).toLocaleString("sv-SE")}). Läs in igen om byggnaden har ändrats.`; }
    return true;
  } catch (e) { return false; }
}
/* För export m.m.: det som finns sparat, annars (om byggnaden är inläst) en ny beräkning. */
async function secEnsureData(el) { if (secData.has(el.id)) return true; if (await secRestore(el)) return true; return secModelsReady() ? secBuild(el, { open: false }) : false; }

/* Realtid: ändras linjen, höjderna, djupet, sidan eller filtren räknas sektionen om av sig själv (efter en kort paus) – utan att öppna 3D.
   Den gamla bilden ligger kvar tills den nya är klar. Är byggnaden inte inläst tas den gamla bort (den stämmer inte längre). */
const secAutoT = new Map();
function secModelsReady() { return typeof l3b !== "undefined" && typeof l3 !== "undefined" && !!l3 && !!l3.O && l3b.models.some(m => m.visible); }
function secAuto(el, delay = 250) {
  clearTimeout(secAutoT.get(el.id));
  { const d0 = secData.get(el.id); if (d0 && d0.sig === secSig(el)) return; } // inget som påverkar snittet har ändrats (t.ex. bara skalan)
  if (!el.p1 || !el.p2 || secLen(el) < 0.05) { secData.delete(el.id); return; }
  if (!secModelsReady()) { secData.delete(el.id); return; }
  secAutoT.set(el.id, setTimeout(async () => {
    const tok = JSON.stringify([el.p1, el.p2, el.side, el.depth, el.front, el.zlo, el.zhi, el.q, el.nq]);
    const res = secCompute(el);
    if (!res || !pr || !pr.tpl.elements.includes(el)) return;
    if (tok !== JSON.stringify([el.p1, el.p2, el.side, el.depth, el.front, el.zlo, el.zhi, el.q, el.nq])) return;
    secData.set(el.id, res); secRow.n = -1; secPersist(el, res);
    const info = document.getElementById("secInfo"); if (info) info.textContent = `${res.segs.toLocaleString("sv-SE")} segment, ${res.anchors.length} aktiviteter bakom snittet.`;
    drawPrintPage();
  }, delay));
}

/* Aktiviteterna som får bubbla: aktiva (pågående/försenade), alla eller de som är markerade i 3D. */
function secBubbles(el, data) {
  const cfg = secBub(el); if (!cfg.on) return [];
  let marked = null;
  if (cfg.mode === "sel") {
    marked = new Set();
    const byId = new Map((typeof items !== "undefined" ? items : []).map(r => [r.id, r]));
    ((typeof l3bs !== "undefined" && l3bs.sel) || []).forEach(s => { const r0 = s.mesh && s.mesh.userData.l3b.ranges[s.ri], r = r0 && r0.itemId && byId.get(r0.itemId); if (r) marked.add(secKey(r)); });
  }
  let list = data.anchors.filter(a => a.row && a.row.start_date && !(cfg.off || {})[a.key]);
  if (cfg.mode === "running") list = list.filter(a => secPhase(a.row) === "pagaende");
  else if (cfg.mode === "active") list = list.filter(a => ["pagaende", "forsenad"].includes(secPhase(a.row)));
  else if (cfg.mode === "sel") list = list.filter(a => marked.has(a.key));
  return list.sort((a, b) => a.u - b.u).slice(0, Math.max(1, Number(cfg.max) || 12));
}

/* Insättningspunkten ska alltid ligga på objektet: hålls inom dess utsträckning i sektionen. */
const secClampAnc = (a, u, z) => { const b = a && a.box; return b && b[0] <= b[1] ? [Math.max(b[0], Math.min(b[1], u)), Math.max(b[2], Math.min(b[3], z))] : [u, z]; };
const secFmt = d => (d ? (typeof shortDate === "function" ? shortDate(d) : d) : "");
function secCardLines(a, cfg) {
  const r = a.row, end = r.actual_end_date && r.actual_end_date > (r.end_date || "") ? r.actual_end_date : r.end_date || r.start_date;
  return { name: cfg.fields.name ? (r.object_name || r.activity || "Aktivitet") : "", date: cfg.fields.date ? `${secFmt(r.start_date)} – ${secFmt(end)}` : "", prog: cfg.fields.progress ? secProg(r, cfg.prog, secAt()) : null };
}

/* Ritar sektionen i rutan (X, Y, W, H i px). mm = px per mm på bladet. */
function drawPrSection(ctx, el, X, Y, W, H, pt, mm) {
  const fs = pt(7), col = el.color || SEC_DEF.color;
  let data = secData.get(el.id);
  ctx.save(); ctx.textBaseline = "middle";
  let top = Y;
  if (el.title) { ctx.fillStyle = "#000"; ctx.font = `bold ${fs * 1.2}px Helvetica, Arial`; ctx.textAlign = "left"; ctx.fillText(el.title, X, top + fs * 0.8); top += fs * 2; }
  const pdfIm = el.src === "pdf" && el.img && el.img.path ? printImage(el.img.path) : null, cal = secCal(el);
  if (el.src === "pdf" && pdfIm && !cal) { // ritningen väntar på sina två passpunkter – visa den inpassad
    const ar = (pdfIm.naturalWidth || pdfIm.width) / (pdfIm.naturalHeight || pdfIm.height) || 1, bw = W, bh = Y + H - top; let iw = bw, ih = bw / ar; if (ih > bh) { ih = bh; iw = bh * ar; }
    const ix = X + (bw - iw) / 2, iy = top + (bh - ih) / 2;
    ctx.drawImage(pdfIm, ix, iy, iw, ih);
    ["a", "b"].forEach(k => { const p = el.cal && el.cal[k]; if (!p || p.fx === undefined) return; const r = Math.max(3, mm * 1.3);
      ctx.strokeStyle = "#dc2626"; ctx.fillStyle = "#dc2626"; ctx.lineWidth = Math.max(1, mm * 0.3); ctx.beginPath(); ctx.arc(ix + p.fx * iw, iy + p.fy * ih, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ix + p.fx * iw - r * 1.6, iy + p.fy * ih); ctx.lineTo(ix + p.fx * iw + r * 1.6, iy + p.fy * ih); ctx.moveTo(ix + p.fx * iw, iy + p.fy * ih - r * 1.6); ctx.lineTo(ix + p.fx * iw, iy + p.fy * ih + r * 1.6); ctx.stroke();
      ctx.font = `bold ${fs * 1.3}px Helvetica, Arial`; ctx.textAlign = "left"; ctx.fillText(k.toUpperCase(), ix + p.fx * iw + r * 1.2, iy + p.fy * ih - r * 1.2); });
    ctx.fillStyle = "#b45309"; ctx.font = `bold ${fs}px Helvetica, Arial`; ctx.textAlign = "left"; ctx.fillText("Passa in ritningen: sätt punkt A och B i panelen", X + mm, Y + H - fs);
    ctx.restore(); return;
  }
  if (!data && !secTried.has(el.id) && el.p1 && el.p2) secRestore(el);
  if (!data && pdfIm && cal) { const r0 = secImgRect(cal); data = { groups: new Map(), anchors: [], L: secLen(el) || r0.u1, zlo: r0.z0, zhi: r0.z1, segs: 0 }; } // ritningen visas även innan IFC-snittet är beräknat
  if (!data) {
    ctx.fillStyle = "#f8fafc"; ctx.fillRect(X, top, W, Y + H - top); ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = Math.max(1, mm * 0.2); ctx.setLineDash([mm * 2, mm * 1.5]); ctx.strokeRect(X, top, W, Y + H - top); ctx.setLineDash([]);
    ctx.fillStyle = "#64748b"; ctx.textAlign = "center"; ctx.font = `${fs * 1.1}px Helvetica, Arial`;
    ctx.fillText(el.p1 && el.p2 ? "Tryck Uppdatera sektion i panelen" : "Ange sektionslinjen i panelen", X + W / 2, top + (Y + H - top) / 2);
    ctx.restore(); return;
  }
  const cfg = secBub(el), cards = secBubbles(el, data);
  const cw = Math.max(12, Number(cfg.size) || 36) * mm, ch = fs * (cfg.fields.name ? 3.1 : 1.2) + (cfg.fields.date ? fs * 1.3 : 0) + (cfg.fields.progress ? fs * 1.6 : 0) + fs * 0.8;
  // Kortbandet överst (så att korten inte täcker snittet): så många rader som behövs.
  const perRow = Math.max(1, Math.floor((W + mm) / (cw + mm))), rows = cards.length ? Math.min(Math.ceil(cards.length / perRow), Math.max(1, Math.floor((H - fs * 4) / 3 / (ch + mm)))) : 0;
  const band = rows ? rows * (ch + mm * 1.5) + mm : 0;
  const axisW = fs * 3.2, dTop = top + band, dH = Y + H - dTop - fs * 1.8, dW = W - axisW;
  // Synfältet: snittet (0…L, lägsta…högsta); med en egen sektionsritning även hela dess utsträckning.
  let uLo = 0, uHi = data.L, zlo = data.zlo, zTop = data.zhi, imRect = null;
  let crop = null, full = null;
  if (pdfIm && cal) {
    full = secImgRect(cal); crop = secPick.cropEdit === el.id ? null : secCrop(el);   // under beskärningen visas hela ritningen
    const w = full.u1 - full.u0, h = full.z1 - full.z0;
    imRect = crop ? { u0: full.u0 + crop.l * w, u1: full.u1 - crop.r * w, z1: full.z1 - crop.t * h, z0: full.z0 + crop.b * h } : full;
    if (crop) { uLo = imRect.u0; uHi = imRect.u1; zlo = imRect.z0; zTop = imRect.z1; }   // beskuren: bara den delen visas (även IFC-snittet klipps till den)
    else { uLo = Math.min(uLo, imRect.u0); uHi = Math.max(uHi, imRect.u1); zlo = Math.min(zlo, imRect.z0); zTop = Math.max(zTop, imRect.z1); }
  }
  const span = Math.max(0.1, zTop - zlo), uSpan = Math.max(0.1, uHi - uLo);
  let s = Math.min(dW / uSpan, dH / span);                  // px per meter
  if (Number(el.scale) > 0) s = (1000 / Number(el.scale)) * mm;
  const x0 = X + axisW, yBase = dTop + dH;                  // u = uLo och z = zlo
  secView.set(el.id, { mm, x0, uLo, s, yBase, zlo, full });
  const px = u => x0 + (u - uLo) * s, py = z => yBase - (z - zlo) * s;
  // Höjdskala till vänster.
  if (imRect) { ctx.save(); ctx.beginPath(); ctx.rect(x0 - 1, dTop - 1, dW + 2, dH + 2); ctx.clip(); ctx.globalAlpha = Math.max(0.1, Math.min(1, Number(el.imgAlpha) || 1)); { const nw = pdfIm.naturalWidth || pdfIm.width, nh = pdfIm.naturalHeight || pdfIm.height, c0 = crop || { l: 0, r: 0, t: 0, b: 0 };
      ctx.drawImage(pdfIm, nw * c0.l, nh * c0.t, Math.max(1, nw * (1 - c0.l - c0.r)), Math.max(1, nh * (1 - c0.t - c0.b)), px(imRect.u0), py(imRect.z1), (imRect.u1 - imRect.u0) * s, (imRect.z1 - imRect.z0) * s); } ctx.restore(); }
  const step = Number(el.zstep) > 0 ? Number(el.zstep) : [0.5, 1, 2, 3, 5, 10, 20].find(v => v * s >= fs * 2.4) || 20;
  const zOn = el.zshow !== false;
  ctx.strokeStyle = el.zgrid || "#e2e8f0"; ctx.fillStyle = el.zcolor || "#64748b"; ctx.lineWidth = Math.max(0.5, mm * 0.08); ctx.font = `${fs * 0.9}px Helvetica, Arial`; ctx.textAlign = "right";
  for (let z = Math.ceil(zlo / step - 1e-9) * step; zOn && z <= zTop + 1e-6 && z < zlo + 400 * step; z += step) { const y = py(z); if (y < dTop - 1 || y > yBase + 1) continue; ctx.beginPath(); ctx.moveTo(x0 - mm, y); ctx.lineTo(x0 + Math.min(uSpan * s, dW), y); ctx.stroke(); ctx.fillText((z >= 0 ? "+" : "") + z.toFixed(1), X + axisW - mm * 1.2, y); }
  // Snittlinjerna, samlade per färg (statusfärg om det är på).
  const byCol = new Map();
  data.groups.forEach((lines, key) => {
    let c = col;
    if (key && el.status !== false) { const r = secRow(key); if (r) c = phaseColor(secPhase(r)); }
    (byCol.get(c) || byCol.set(c, []).get(c)).push(lines);
  });
  ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.lineWidth = Math.max(0.6, (el.lw || SEC_DEF.lw) * mm);
  ctx.save(); ctx.beginPath(); ctx.rect(x0 - 1, dTop - 1, dW + 2, dH + 2); ctx.clip(); ctx.globalAlpha = Math.max(0.05, Math.min(1, Number(el.ifcAlpha) || 1));
  if (!(pdfIm && cal && el.lines === false)) byCol.forEach((sets, c) => {
    ctx.strokeStyle = c; ctx.beginPath();
    sets.forEach(lines => lines.forEach(p => { ctx.moveTo(px(p[0] / 1000), py(p[1] / 1000)); for (let i = 2; i < p.length; i += 2) ctx.lineTo(px(p[i] / 1000), py(p[i + 1] / 1000)); }));
    ctx.stroke();
  });
  ctx.restore();
  // Bubblorna: kort i bandet, ledlinje till objektets överkant.
  const placed = [], boxes = [];
  const cw0 = cw, fs0 = fs;
  cards.forEach((a, i) => {
    // Per bubbla (klicka på den): egen bredd, textstorlek och vilka rader som visas.
    const bc = (cfg.cfg || {})[a.key] || {}, f2 = { ...cfg.fields, ...(bc.fields || {}) }, sc = Math.max(0.5, Math.min(3, Number(bc.sc) || 1));
    const fs = fs0 * sc, cw = Math.max(12, Number(bc.w) || 0) * (bc.w ? mm : 0) || cw0, ch = fs * (f2.name ? 3.1 : 1.2) + (f2.date ? fs * 1.3 : 0) + (f2.progress ? fs * 1.6 : 0) + fs * 0.8;
    const anc0 = (cfg.anc || {})[a.key], anc = anc0 && secClampAnc(a, anc0[0], anc0[1]), ax = anc ? px(anc[0]) : px(a.u), ay = anc ? py(anc[1]) : py(Math.min(a.z, zTop)), L = secCardLines(a, { ...cfg, fields: f2 }), c = bc.color || cfg.color || phaseColor(secPhase(a.row));
    let cx = Math.max(X, Math.min(X + W - cw, ax - cw / 2)), cy = top + mm * 0.5;
    for (let r = 0; r < Math.max(1, rows); r++) { cy = top + mm * 0.5 + r * (ch + mm * 1.5); if (!placed.some(p => p.y === cy && cx < p.x + cw + mm * 0.5 && cx + cw + mm * 0.5 > p.x)) break; }
    // Hamnar kortet över ett annat i alla rader: skjut det åt sidan tills det får plats.
    for (let g = 0; g < 40 && placed.some(p => p.y === cy && cx < p.x + cw + mm * 0.5 && cx + cw + mm * 0.5 > p.x); g++) { cx += cw + mm; if (cx + cw > X + W) { cx = X; cy += ch + mm * 1.5; } }
    const man = (cfg.pos || {})[a.key];
    if (man && man.length === 2) { cx = X + man[0] * mm; cy = Y + man[1] * mm; } else placed.push({ x: cx, y: cy });
    boxes.push({ key: a.key, x: cx / mm, y: cy / mm, w: cw / mm, h: ch / mm, ax: ax / mm, ay: ay / mm });
    const tipX = Math.max(cx + cw * 0.08, Math.min(cx + cw * 0.92, ax));
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1, mm * 0.5); ctx.beginPath(); ctx.moveTo(tipX, cy + ch); ctx.lineTo(ax, ay); ctx.stroke();
    ctx.strokeStyle = c; ctx.lineWidth = Math.max(0.6, mm * 0.2); ctx.beginPath(); ctx.moveTo(tipX, cy + ch); ctx.lineTo(ax, ay); ctx.stroke();
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(ax, ay, Math.max(1.2, mm * 0.7), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.fillRect(cx, cy, cw, ch); ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = Math.max(0.5, mm * 0.1); ctx.strokeRect(cx, cy, cw, ch);
    ctx.fillStyle = c; ctx.fillRect(cx, cy, mm * 1.2, ch);
    if (secSel.el === el.id && secSel.key === a.key) { ctx.strokeStyle = "#2563eb"; ctx.lineWidth = Math.max(1, mm * 0.35); ctx.setLineDash([mm * 1.2, mm * 0.8]); ctx.strokeRect(cx - mm * 0.4, cy - mm * 0.4, cw + mm * 0.8, ch + mm * 0.8); ctx.setLineDash([]); ctx.fillStyle = "#fff"; const hr = Math.max(2, mm * 1); ctx.fillRect(cx + cw - hr, cy + ch - hr, hr * 2, hr * 2); ctx.strokeRect(cx + cw - hr, cy + ch - hr, hr * 2, hr * 2); }
    let ty = cy + fs * 0.9; const tx = cx + mm * 2.2, tw = cw - mm * 3;
    ctx.textAlign = "left"; ctx.fillStyle = "#111827";
    if (L.name) { ctx.font = `bold ${fs}px Helvetica, Arial`; secWrap(ctx, L.name, tw, 2).forEach(t => { ctx.fillText(t, tx, ty); ty += fs * 1.05; }); ty += fs * 0.15; }
    if (L.date) { ctx.font = `${fs * 0.92}px Helvetica, Arial`; ctx.fillStyle = "#475569"; ctx.fillText(L.date, tx, ty); ty += fs * 1.3; }
    if (L.prog !== null) {
      const bw = tw - fs * 3.2, bh = fs * 0.7;
      ctx.fillStyle = "#e2e8f0"; ctx.fillRect(tx, ty - bh / 2, bw, bh); ctx.fillStyle = c; ctx.fillRect(tx, ty - bh / 2, bw * L.prog / 100, bh);
      ctx.fillStyle = "#111827"; ctx.font = `bold ${fs * 0.95}px Helvetica, Arial`; ctx.textAlign = "left"; ctx.fillText(L.prog + " %", tx + bw + fs * 0.4, ty);
    }
  });
  secCards.set(el.id, boxes);
  if (secPick.cropEdit === el.id && full) { // beskärningsläge: det som faller utanför tonas ned, ramen har handtag
    const cr = secCrop(el) || { l: 0, r: 0, t: 0, b: 0 }, w = full.u1 - full.u0, h = full.z1 - full.z0;
    const X0 = px(full.u0 + cr.l * w), X1 = px(full.u1 - cr.r * w), Y0 = py(full.z1 - cr.t * h), Y1 = py(full.z0 + cr.b * h), FX0 = px(full.u0), FX1 = px(full.u1), FY0 = py(full.z1), FY1 = py(full.z0);
    ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.fillRect(FX0, FY0, FX1 - FX0, Y0 - FY0); ctx.fillRect(FX0, Y1, FX1 - FX0, FY1 - Y1); ctx.fillRect(FX0, Y0, X0 - FX0, Y1 - Y0); ctx.fillRect(X1, Y0, FX1 - X1, Y1 - Y0);
    ctx.strokeStyle = "#2563eb"; ctx.lineWidth = Math.max(1, mm * 0.35); ctx.setLineDash([mm * 1.5, mm]); ctx.strokeRect(X0, Y0, X1 - X0, Y1 - Y0); ctx.setLineDash([]);
    const hs = [["tl", X0, Y0], ["t", (X0 + X1) / 2, Y0], ["tr", X1, Y0], ["r", X1, (Y0 + Y1) / 2], ["br", X1, Y1], ["b", (X0 + X1) / 2, Y1], ["bl", X0, Y1], ["l", X0, (Y0 + Y1) / 2]];
    const r = Math.max(2.5, mm * 1.2); ctx.fillStyle = "#fff"; ctx.lineWidth = Math.max(1, mm * 0.3);
    hs.forEach(([, hx, hy]) => { ctx.beginPath(); ctx.rect(hx - r, hy - r, r * 2, r * 2); ctx.fill(); ctx.stroke(); });
    const v0 = secView.get(el.id); if (v0) v0.handles = hs.map(([id, hx, hy]) => ({ id, x: hx / mm, y: hy / mm }));
  } else { const v0 = secView.get(el.id); if (v0) v0.handles = null; }
  // Skala och sektionslinjens ändar.
  ctx.fillStyle = "#475569"; ctx.font = `${fs * 0.9}px Helvetica, Arial`; ctx.textAlign = "left";
  const N = Math.round(1000 / (s / mm));
  ctx.fillText(`Skala 1:${N.toLocaleString("sv-SE")}  ·  längd ${data.L.toFixed(1)} m  ·  ${secAt()}`, x0, Y + H - fs * 0.7);
  ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = Math.max(0.5, mm * 0.1); ctx.beginPath(); ctx.moveTo(x0, yBase); ctx.lineTo(x0 + uSpan * s, yBase); ctx.stroke();
  ctx.restore();
}
/* Beskärning av sektionsritningen: andelar (0–0,95) av bildens vänster/höger/överkant/underkant. null = ingen. */
function secCrop(el) {
  const c = el.crop; if (!c) return null;
  const f = v => Math.max(0, Math.min(0.95, Number(v) || 0)), o = { l: f(c.l), r: f(c.r), t: f(c.t), b: f(c.b) };
  if (!(o.l || o.r || o.t || o.b) || o.l + o.r > 0.97 || o.t + o.b > 0.97) return null;
  return o;
}
/* Egen sektionsritning (bild): två passpunkter A och B – bildens andel (fx, fy; fy nedåt) <-> sektionens u (m längs linjen) och z (m). */
function secCal(el) {
  const c = el.cal; if (!c || !c.a || !c.b) return null;
  const f = v => Number(v), uni = Number(c.ar) > 0;   // uni: lika skala i sida och höjd (ritningens bildförhållande ar) – B behöver bara skilja sig i sida
  if (![c.a.fx, c.a.fy, c.a.u, c.a.z, c.b.fx, c.b.u].every(v => Number.isFinite(f(v)))) return null;
  if (Math.abs(c.b.fx - c.a.fx) < 1e-4 || c.b.u === c.a.u) return null;
  if (!uni && (![c.b.fy, c.b.z].every(v => Number.isFinite(f(v))) || Math.abs(c.b.fy - c.a.fy) < 1e-4 || c.b.z === c.a.z)) return null;
  return c;
}
function secImgRect(c) {
  const mu = (c.b.u - c.a.u) / (c.b.fx - c.a.fx), mz = Number(c.ar) > 0 ? mu / c.ar : (c.b.z - c.a.z) / (c.a.fy - c.b.fy);   // meter per bildbredd / bildhöjd
  const u0 = c.a.u - c.a.fx * mu, u1 = u0 + mu, z1 = c.a.z + c.a.fy * mz, z0 = z1 - mz;
  return { u0: Math.min(u0, u1), u1: Math.max(u0, u1), z0: Math.min(z0, z1), z1: Math.max(z0, z1) };
}
function secRow(key) {
  const list = typeof items !== "undefined" ? items : [];
  if (!secRow.idx || secRow.n !== list.length) { secRow.idx = new Map(); list.forEach(r => { const k = secKey(r); if (!secRow.idx.has(k)) secRow.idx.set(k, r); }); secRow.n = list.length; }
  return secRow.idx.get(key);
}
function secWrap(ctx, text, w, maxLines) {
  const words = String(text).split(/\s+/), out = []; let cur = "";
  words.forEach(wd => { const t = cur ? cur + " " + wd : wd; if (ctx.measureText(t).width <= w || !cur) cur = t; else { out.push(cur); cur = wd; } });
  if (cur) out.push(cur);
  if (out.length > maxLines) { out.length = maxLines; let l = out[maxLines - 1]; while (l.length > 1 && ctx.measureText(l + "…").width > w) l = l.slice(0, -1); out[maxLines - 1] = l + "…"; }
  return out;
}

/* Flytta bubblorna med musen i layouten (och dubbelklick släcker en bubbla). Returnerar true när klicket tillhör en bubbla. */
function secCropDown(mx, my, e) {
  if (!pr || !secPick.cropEdit) return false;
  const el = pr.tpl.elements.find(x => x.id === secPick.cropEdit), v = el && secView.get(el.id);
  if (!el || !v || !v.handles || !v.full) return false;
  const hit = v.handles.find(h => Math.abs(h.x - mx) < 2.6 && Math.abs(h.y - my) < 2.6);
  if (!hit) return false;
  pushUndo(); const F = v.full, w = F.u1 - F.u0, hh = F.z1 - F.z0, c0 = { l: 0, r: 0, t: 0, b: 0, ...(el.crop || {}) };
  const toUZ = (x, y) => [v.uLo + (x * v.mm - v.x0) / v.s, v.zlo + (v.yBase - y * v.mm) / v.s];
  const cl = x => Math.max(0, Math.min(0.95, x));
  const move = ev => {
    const [px2, py2] = prPoint(ev), [u, z] = toUZ(px2, py2), c = { ...c0 };
    if (hit.id.includes("l")) c.l = cl((u - F.u0) / w);
    if (hit.id.includes("r")) c.r = cl((F.u1 - u) / w);
    if (hit.id.includes("t")) c.t = cl((F.z1 - z) / hh);
    if (hit.id.includes("b")) c.b = cl((z - F.z0) / hh);
    if (c.l + c.r > 0.95) { if (hit.id.includes("l")) c.l = 0.95 - c.r; else c.r = 0.95 - c.l; }
    if (c.t + c.b > 0.95) { if (hit.id.includes("t")) c.t = 0.95 - c.b; else c.b = 0.95 - c.t; }
    el.crop = Object.fromEntries(Object.entries(c).map(([k, x]) => [k, Math.round(x * 1e4) / 1e4])); drawPrintPage();
  };
  const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); renderPrintProps(); };
  window.addEventListener("mousemove", move); window.addEventListener("mouseup", up); e.preventDefault(); return true;
}
function secBubDown(mx, my, e) {
  if (!pr) return false;
  if (secCropDown(mx, my, e)) return true;
  // Bubblans insättningspunkt (pricken vid objektet) kan dras.
  for (const el of pr.tpl.elements.slice().reverse()) {
    if (el.type !== "section" || el.locked) continue;
    const v = secView.get(el.id), hit = v && (secCards.get(el.id) || []).find(b => b.ax !== undefined && Math.hypot(b.ax - mx, b.ay - my) < 2.2);
    if (!hit) continue;
    if (!pr.sels.includes(el.id) || pr.sels.length !== 1) { setSel([el.id]); renderPrintProps(); }
    pushUndo(); el.bub = secBub(el); let moved = false;
    const an = (secData.get(el.id) || { anchors: [] }).anchors.find(x => x.key === hit.key);
    const move = ev => { const [px2, py2] = prPoint(ev); moved = true; const [cu, cz] = secClampAnc(an, v.uLo + (px2 * v.mm - v.x0) / v.s, v.zlo + (v.yBase - py2 * v.mm) / v.s); el.bub.anc = { ...el.bub.anc, [hit.key]: [Math.round(cu * 100) / 100, Math.round(cz * 100) / 100] }; drawPrintPage(); };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); if (!moved) pr.undo.pop(); else prCmdLog("Flyttade bubblans insättningspunkt."); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up); e.preventDefault(); return true;
  }
  for (const el of pr.tpl.elements.slice().reverse()) {
    if (el.type !== "section" || el.locked) continue;
    const hit = (secCards.get(el.id) || []).find(b => mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h);
    if (!hit) continue;
    const was = secSel.el === el.id && secSel.key === hit.key;
    secSel.el = el.id; secSel.key = hit.key;
    if (!pr.sels.includes(el.id) || pr.sels.length !== 1) setSel([el.id]);
    renderPrintProps(); drawPrintPage();
    pushUndo(); el.bub = secBub(el); el.bub.cfg = { ...el.bub.cfg };
    const v = secView.get(el.id), resize = was && Math.hypot(hit.x + hit.w - mx, hit.y + hit.h - my) < 2.6;
    const start = [mx, my], orig = [hit.x - el.x, hit.y - el.y], w0 = hit.w; let moved = false;
    const move = ev => {
      const [px2, py2] = prPoint(ev); if (!moved && Math.abs(px2 - start[0]) + Math.abs(py2 - start[1]) < 0.4) return; moved = true;
      if (resize) { el.bub.cfg[hit.key] = { ...(el.bub.cfg[hit.key] || {}), w: Math.max(12, Math.round((w0 + px2 - start[0]) * 10) / 10) }; }
      else el.bub.pos = { ...el.bub.pos, [hit.key]: [Math.round((orig[0] + px2 - start[0]) * 100) / 100, Math.round((orig[1] + py2 - start[1]) * 100) / 100] };
      drawPrintPage();
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); if (!moved) pr.undo.pop(); else { prCmdLog(resize ? "Ändrade bubblans bredd." : "Flyttade bubblan."); renderPrintProps(); } };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    e.preventDefault(); return true;
  }
  return false;
}
/* Klick på ritningen i layouten under "Välj i ritning": sidans mm -> modellens koordinater (m). */
function secPageToModel(map, x, y) {
  const tplK = typeof pageDims === "function" ? pageDims().k : 1;
  const c = mToPx(map.center), spanW = map.w * tplK * map.scale / 1000 * pxPerMeter(), spanH = map.h * tplK * map.scale / 1000 * pxPerMeter();
  const sx = c[0] + ((x - map.x) / map.w - 0.5) * spanW, sy = c[1] + ((y - map.y) / map.h - 0.5) * spanH;
  return pdfToModel(toPdf([sx, sy]));
}
function secPickClick(mx, my) {
  if (!secPick.el || !pr) return false;
  if (secPick.crop) { // beskär: två hörn i sektionsritningen (klicken i bladets mm -> u, z via senaste ritvyn)
    const el = secPick.el, v = secView.get(el.id);
    if (!v || !v.full || mx < el.x || mx > el.x + el.w || my < el.y || my > el.y + el.h) { prCmdLog("Klicka på sektionsritningen."); return true; }
    const u = v.uLo + (mx * v.mm - v.x0) / v.s, z = v.zlo + (v.yBase - my * v.mm) / v.s;
    secPick.pts.push([u, z]);
    if (secPick.pts.length < 2) { prCmdLog("Första hörnet satt – klicka det motsatta hörnet."); return true; }
    const [a, b] = secPick.pts, F = v.full, w = F.u1 - F.u0, h = F.z1 - F.z0, cl = x => Math.max(0, Math.min(1, x));
    pushUndo(); el.crop = { l: Math.round(cl((Math.min(a[0], b[0]) - F.u0) / w) * 1e4) / 1e4, r: Math.round(cl((F.u1 - Math.max(a[0], b[0])) / w) * 1e4) / 1e4, t: Math.round(cl((F.z1 - Math.max(a[1], b[1])) / h) * 1e4) / 1e4, b: Math.round(cl((Math.min(a[1], b[1]) - F.z0) / h) * 1e4) / 1e4 };
    secPick.el = null; secPick.crop = false; secPick.pts = []; prCmdLog("Ritningen beskuren."); renderPrintProps(); drawPrintPage(); return true;
  }
  if (secPick.cal) { // punkt A/B i sektionsritningen: klicket inom elementet -> andel av bilden (bilden ligger inpassad tills båda är satta)
    const el = secPick.el, im = el.img && el.img.path && printImage(el.img.path);
    if (!im || mx < el.x || mx > el.x + el.w || my < el.y || my > el.y + el.h) { prCmdLog("Klicka på sektionsritningen."); return true; }
    const top = el.y + (el.title ? (7 * pageDims().k * PT_MM) * 2 : 0), bw = el.w, bh = el.y + el.h - top, ar = (im.naturalWidth || im.width) / (im.naturalHeight || im.height) || 1;
    let iw = bw, ih = bw / ar; if (ih > bh) { ih = bh; iw = bh * ar; }
    const fx = (mx - (el.x + (bw - iw) / 2)) / iw, fy = (my - (top + (bh - ih) / 2)) / ih;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) { prCmdLog("Klicka på själva ritningen."); return true; }
    pushUndo(); el.cal = { ...(el.cal || {}) }; el.cal[secPick.cal] = { ...(el.cal[secPick.cal] || { u: 0, z: 0 }), fx: Math.round(fx * 1e4) / 1e4, fy: Math.round(fy * 1e4) / 1e4 };
    if (secPick.wiz && secPick.cal === "a") { secPick.cal = "b"; prCmdLog("Punkt A satt – klicka nu punkt B (en annan punkt, helst längre bort både i sida och höjd)."); drawPrintPage(); return true; }
    if (secPick.wiz) { secPick.el = null; secPick.cal = null; secPick.wiz = false; drawPrintPage(); secStart3d(el); return true; }
    secPick.el = null; secPick.cal = null; prCmdLog("Punkten satt – skriv in dess läge (u, z) i panelen."); renderPrintProps(); drawPrintPage(); return true;
  }
  const maps = pr.tpl.elements.filter(e => e.type === "map");
  const map = maps.find(m => mx >= m.x && mx <= m.x + m.w && my >= m.y && my <= m.y + m.h);
  if (!map) { prCmdLog("Klicka på en ritning för att sätta sektionslinjen."); return true; }
  const p = secPageToModel(map, mx, my).map(v => Math.round(v * 100) / 100);
  secPick.pts.push(p);
  if (secPick.pts.length === 1) { prCmdLog("Sektionens start satt – klicka där den slutar."); return true; }
  pushUndo(); const el = secPick.el; el.p1 = secPick.pts[0]; el.p2 = secPick.pts[1]; secPick.el = null; secPick.pts = [];
  secData.delete(el.id); prCmdLog("Sektionslinjen satt. Tryck Uppdatera sektion."); renderPrintProps(); drawPrintPage();
  return true;
}

/* Sidopanelen – grupperad och uppstädad: Ritning, Snitt, Utseende, Bubblor och Avancerat (koordinater m.m. göms tills de behövs). */
/* Passa in ritningen i två steg (Victor 2026-10-19): två punkter i ritningen, sedan samma två punkter i 3D-modellen.
   Punkternas 3D-lägen ger allt: sektionslinjen går genom A och B i planen (och förlängs till ritningens bredd), och höjderna
   kommer från modellens Z. B behöver bara ligga en bit bort i sidled från A; skiljer de sig tydligt i höjd används den för höjdskalan, annars samma skala som i sidled. */
function secWizard(el) {
  if (!(el.img && el.img.path)) { alert("Välj en PDF eller bild först."); return; }
  pushUndo(); el.cal = null; secPick.crop = false; secPick.el = el; secPick.cal = "a"; secPick.wiz = true; secPick.pts = [];
  prCmdLog("Steg 1 av 2: klicka punkt A i sektionsritningen (en tydlig punkt du också kan peka ut i 3D-modellen).");
  renderPrintProps(); drawPrintPage();
}
async function secStart3d(el) {
  const was3d = !!(document.getElementById("view3d") && !document.getElementById("view3d").classList.contains("hidden") && typeof l3 !== "undefined" && l3 && l3.scene);
  prCmdLog("Steg 2 av 2: öppnar 3D – klicka samma punkter A och B i modellen.");
  try { if (!was3d) await open3d(); } catch (e) { alert("Kunde inte öppna 3D: " + e.message); return; }
  if (typeof l3 === "undefined" || !l3 || !l3.scene) return;
  sec3d.el = el; sec3d.pts = []; sec3d.opened = !was3d;
  secHint3d();
}
async function secPickZ(el, f) {
  const was3d = !!(document.getElementById("view3d") && !document.getElementById("view3d").classList.contains("hidden") && typeof l3 !== "undefined" && l3 && l3.scene);
  try { if (!was3d) await open3d(); } catch (e) { alert("Kunde inte öppna 3D: " + e.message); return; }
  if (typeof l3 === "undefined" || !l3 || !l3.scene) return;
  sec3d.el = el; sec3d.pts = []; sec3d.opened = !was3d; sec3d.mode = f; secHint3d();
}
function secHint3d(keepMsg) {
  if (!keepMsg) sec3d.msg = "";
  const box = document.getElementById("view3d"); if (!box || !sec3d.el) return;
  if (sec3d.mode) {
    let h = document.getElementById("secHint3d");
    if (!h) { h = document.createElement("div"); h.id = "secHint3d"; h.style.cssText = "position:absolute;left:10px;top:54px;z-index:50;width:280px;background:#fff;border:2px solid #f97316;border-radius:12px;box-shadow:0 10px 30px rgba(15,23,42,.3);padding:8px 10px;font:13px/1.35 Helvetica,Arial,sans-serif;color:#0f172a;"; box.appendChild(h); }
    h.innerHTML = `<b>Klicka ${sec3d.mode === "zlo" ? "nedre" : "övre"} gränsen i modellen</b><div style="margin:4px 0;">Höjden (Z) där du klickar används för sektionen. Snäpper mot hörn och kanter.</div><button type="button" id="secHintCancel" style="padding:4px 10px;">Avbryt</button>`;
    h.querySelector("#secHintCancel").onclick = () => { sec3d.mode = null; secEnd3d(false); };
    if (typeof l3Status === "function") l3Status("Klicka där sektionen ska " + (sec3d.mode === "zlo" ? "börja nertill" : "sluta upptill") + ".");
    const cv0 = l3.renderer && l3.renderer.domElement; if (cv0) cv0.style.cursor = "crosshair";
    return;
  }
  let h = document.getElementById("secHint3d");
  if (!h) { h = document.createElement("div"); h.id = "secHint3d"; h.style.cssText = "position:absolute;left:10px;top:54px;z-index:50;width:280px;background:#fff;border:2px solid #f97316;border-radius:12px;box-shadow:0 10px 30px rgba(15,23,42,.3);padding:8px 10px;font:13px/1.35 Helvetica,Arial,sans-serif;color:#0f172a;"; box.appendChild(h); }
  const el = sec3d.el, im = el.img && printImage(el.img.path), n = sec3d.pts.length, nm = n ? "B" : "A";
  const dot = (k, p) => (p ? `<span style="position:absolute;left:${p.fx * 100}%;top:${p.fy * 100}%;transform:translate(-50%,-50%);width:14px;height:14px;border:2px solid #dc2626;border-radius:50%;background:${k === nm ? "#dc2626" : "transparent"};"></span><b style="position:absolute;left:${p.fx * 100}%;top:${p.fy * 100}%;margin:-22px 0 0 8px;color:#dc2626;">${k.toUpperCase()}</b>` : "");
  h.innerHTML = `<b>Passa in sektionsritningen – klicka punkt ${nm} i 3D</b><div style="margin:4px 0;">Samma punkt som ${nm} i ritningen${n ? ` (A: höjd ${sec3d.pts[0].z.toFixed(2)} m)` : ""}. Snäpper mot hörn och kanter.</div>
    ${sec3d.msg ? `<div style="margin:4px 0;padding:5px 7px;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;color:#991b1b;">${sec3d.msg}</div>` : ""}
    ${im ? `<div style="position:relative;line-height:0;"><img src="${im.src}" style="width:100%;border:1px solid #cbd5e1;" alt="">${dot("a", el.cal && el.cal.a)}${dot("b", el.cal && el.cal.b)}</div>` : ""}
    <div style="margin-top:6px;"><button type="button" id="secHintCancel" style="padding:4px 10px;">Avbryt</button></div>`;
  h.querySelector("#secHintCancel").onclick = () => secEnd3d(false);
  if (typeof l3Status === "function" && !sec3d.msg) l3Status(`Klicka punkt ${nm} i modellen (samma som ${nm} i ritningen).`);
  const cv = l3.renderer && l3.renderer.domElement; if (cv) cv.style.cursor = "crosshair";
}
function secEnd3d(done) {
  const h = document.getElementById("secHint3d"); if (h) h.remove();
  const el = sec3d.el, opened = sec3d.opened; sec3d.el = null; sec3d.pts = [];
  if (typeof l3 !== "undefined" && l3 && l3.renderer) l3.renderer.domElement.style.cursor = "";
  if (opened && typeof close3d === "function") close3d();
  if (!done && el) prCmdLog("Avbröt inpassningen.");
  if (pr) { renderPrintProps(); drawPrintPage(); }
}
/* Kopplat till 3D-vyns klickhantering (lagesplan-3d.js): true = klicket är hanterat. */
function secPick3dTap(e) {
  if (!sec3d.el || typeof l3Snap !== "function") return false;
  const s = l3Snap(e); if (!s) return true;
  const P = s.point, pt = { x: P.x + l3.O[0], y: P.y + l3.O[1], z: P.z + l3.O[2] };
  if (sec3d.mode) { // höjd (Från/Till) = Z där man klickar
    const el = sec3d.el, f = sec3d.mode; pushUndo(); el[f] = Math.round(pt.z * 100) / 100; sec3d.mode = null; secData.delete(el.id); secEnd3d(true);
    secBuild(el, { open: false, say: t => prCmdLog(t) }).then(() => { if (pr) { renderPrintProps(); drawPrintPage(); } });
    return true;
  }
  sec3d.pts.push(pt);
  if (sec3d.pts.length < 2) { secHint3d(); return true; }
  const el = sec3d.el;
  if (!secFit(el, sec3d.pts[0], sec3d.pts[1], msg => { sec3d.msg = msg; if (typeof l3Status === "function") l3Status(msg); })) { sec3d.pts.pop(); secHint3d(true); return true; }
  sec3d.msg = "";
  secEnd3d(true);
  secBuild(el, { open: false, say: t => prCmdLog(t) }).then(() => { if (pr) { renderPrintProps(); drawPrintPage(); } });
  return true;
}
/* Ritningens passpunkter (cal.a/b har bildandelar) + de två 3D-punkterna -> sektionslinje och cal. Returnerar false med ett meddelande om punkterna inte duger. */
function secFit(el, A, B, say) {
  const c = el.cal; if (!c || !c.a || !c.b) { say && say("Passpunkterna i ritningen saknas."); return false; }
  const dx = B.x - A.x, dy = B.y - A.y, D = Math.hypot(dx, dy), dz = B.z - A.z;
  if (D < 0.1) { say && say("A och B ligger på samma ställe i sidled (modellens X/Y). Klicka B längre längs sektionen – inte på samma lodlinje som A."); return false; }
  if (Math.abs(c.b.fx - c.a.fx) < 0.01) { say && say("Punkterna i ritningen ligger för nära varandra i sidled – gör om dem."); return false; }
  // Höjdskalan: från A och B:s höjder om de skiljer sig tydligt (både i ritningen och i modellen), annars samma skala som i sidled (en ritning är i skala).
  const dfy = Math.abs(c.b.fy - c.a.fy), im = el.img && el.img.path && printImage(el.img.path);
  const ar = Number(el.img && el.img.ar) || (im ? (im.naturalWidth || im.width) / (im.naturalHeight || im.height) : 0);
  const uni = !(Math.abs(dz) >= 0.5 && dfy >= 0.05) && ar > 0;
  if (!uni && (Math.abs(dz) < 0.1 || dfy < 0.01)) { say && say("Kan inte avgöra höjdskalan – välj en B som ligger högre eller lägre än A."); return false; }
  // Riktning: u ska växa åt höger i bilden (annars speglas den), så linjen går mot B om B ligger till höger om A i bilden, annars från B mot A.
  const sg = c.b.fx > c.a.fx ? 1 : -1, ux = dx / D * sg, uy = dy / D * sg;
  const cal = { a: { fx: c.a.fx, fy: c.a.fy, u: 0, z: A.z }, b: { fx: c.b.fx, fy: c.b.fy, u: sg * D, z: B.z } };
  if (uni) cal.ar = ar;
  const r = secImgRect(cal);
  el.p1 = [Math.round((A.x + ux * r.u0) * 100) / 100, Math.round((A.y + uy * r.u0) * 100) / 100];
  el.p2 = [Math.round((A.x + ux * r.u1) * 100) / 100, Math.round((A.y + uy * r.u1) * 100) / 100];
  cal.a.u -= r.u0; cal.b.u -= r.u0;   // u räknas från sektionslinjens start
  el.cal = cal; el.src = "pdf"; secData.delete(el.id);
  return true;
}
const SEC_CSS = `#prProps .sec-seg { display: flex; gap: 2px; padding: 2px; background: #f1f5f9; border-radius: 10px; margin: 4px 0 8px; }
  #prProps .sec-seg button { flex: 1; height: auto; min-height: 0; padding: 6px 8px; border: 0; border-radius: 8px; background: transparent; box-shadow: none; font-size: 12.5px; color: #475569; cursor: pointer; }
  #prProps .sec-seg button.on { background: #fff; color: #0f172a; font-weight: 600; box-shadow: 0 1px 3px rgba(15,23,42,.18); }
  #prProps details.sec-g { border-top: 1px solid #e5e7eb; padding: 6px 0 2px; margin-top: 6px; }
  #prProps details.sec-g > summary { cursor: pointer; list-style: none; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #64748b; padding: 4px 0; }
  #prProps details.sec-g > summary::-webkit-details-marker { display: none; }
  #prProps details.sec-g > summary::before { content: "▸"; display: inline-block; width: 14px; transition: transform .12s; }
  #prProps details.sec-g[open] > summary::before { transform: rotate(90deg); }
  #prProps .sec-row { display: flex; gap: 6px; align-items: center; margin: 6px 0; flex-wrap: wrap; }
  #prProps .sec-row > .grow { flex: 1; min-width: 0; }
  #prProps .sec-row button { height: 30px; padding: 0 10px; font-size: 12.5px; }
  #prProps .sec-note { font-size: 11.5px; color: #64748b; margin: 4px 0; line-height: 1.4; }
  #prProps .sec-ok { color: #15803d; } #prProps .sec-warn { color: #b45309; }
  #prProps .sec-sl { display: flex; align-items: center; gap: 8px; margin: 4px 0; font-size: 12px; } #prProps .sec-sl > span:first-child { flex: 0 0 96px; color: #475569; } #prProps .sec-sl input[type=range] { flex: 1; min-width: 0; } #prProps .sec-sl b { width: 36px; text-align: right; font-weight: 600; }
  #prProps .sec-g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 8px; } #prProps .sec-g2 label { font-size: 11.5px; margin: 0 0 2px; }
  #prProps .sec-chips { display: flex; gap: 10px; flex-wrap: wrap; margin: 4px 0; }
  #prProps .sec-act { display: flex; gap: 6px; margin-top: 10px; padding-top: 8px; border-top: 1px solid #e5e7eb; } #prProps .sec-act button { flex: 1; height: 32px; }`;
function secStyle() { if (document.getElementById("secCss")) return; const st = document.createElement("style"); st.id = "secCss"; st.textContent = SEC_CSS; document.head.appendChild(st); }
function secBubListHtml(el, data) {
  if (!data || !data.anchors.length) return "";
  const b = secBub(el), list = data.anchors.filter(a => a.row).sort((x, y) => (x.row.object_name || "").localeCompare(y.row.object_name || "", "sv", { numeric: true })).slice(0, 80);
  const shown = new Set(secBubbles(el, data).map(a => a.key));
  return `<details class="sec-sub"><summary class="sec-note" style="cursor:pointer;">Välj enskilda bubblor (${shown.size} av ${list.length} visas)</summary>
    <div style="max-height:170px;overflow:auto;">${list.map(a => `<label class="check" style="display:block;font-size:12px;"><input type="checkbox" data-secoff="${escHtml(a.key)}" ${b.off[a.key] ? "" : "checked"} /> ${escHtml(a.row.object_name || a.row.activity || "Aktivitet")}${shown.has(a.key) ? "" : " <small>(filtrerad)</small>"}</label>`).join("")}</div>
    <div class="sec-row"><button type="button" id="secBubReset">Återställ placering och släckta</button></div></details>`;
}
/* Vald bubbla (klick på ett kort): egna alternativ – bredd, textstorlek, vilka rader, släck, återställ. */
function secSelHtml(el, b, data) {
  if (secSel.el !== el.id || !secSel.key) return "";
  const a = data && data.anchors.find(x => x.key === secSel.key); if (!a || !a.row) return "";
  const c = b.cfg[secSel.key] || {}, f = { ...b.fields, ...(c.fields || {}) }, wNow = Number(c.w) || b.size, sc = Math.round((Number(c.sc) || 1) * 100);
  return `<div style="border:1.5px solid #2563eb;border-radius:10px;padding:8px;margin:6px 0 10px;background:#eff6ff;">
    <div style="font-size:12.5px;font-weight:700;margin-bottom:4px;">Vald bubbla: ${escHtml(a.row.object_name || a.row.activity || "Aktivitet")}</div>
    <div class="sec-g2"><div><label>Bredd (mm)</label><input type="number" step="2" min="12" data-bc="w" value="${wNow}" /></div><div><label>Textstorlek (%)</label><input type="number" step="10" min="50" max="300" data-bc="sc" value="${sc}" /></div></div>
    <div class="sec-row"><label style="margin:0;">Färg</label><input type="color" data-bccolor value="${escHtml(c.color || b.color || "#2563eb")}" /><button type="button" id="secBcStatusColor"${c.color ? "" : " disabled"}>Efter status</button></div>
    <div class="sec-chips"><label class="check"><input type="checkbox" data-bcf="name" ${f.name ? "checked" : ""} /> Namn</label><label class="check"><input type="checkbox" data-bcf="date" ${f.date ? "checked" : ""} /> Datum</label><label class="check"><input type="checkbox" data-bcf="progress" ${f.progress ? "checked" : ""} /> Framdrift</label></div>
    <div class="sec-row"><button type="button" id="secBcHide">Släck bubblan</button><button type="button" id="secBcReset">Återställ den</button><button type="button" id="secBcDone">Klar</button></div>
    <div class="sec-note" style="margin:0;">Dra kortet för att flytta, dra i hörnet nere till höger för att ändra bredd, dra pricken vid objektet för att flytta insättningspunkten.</div></div>`;
}
function prSectionHtml(el) {
  secStyle();
  const esc = escHtml, b = secBub(el), data = secData.get(el.id), pdf = el.src === "pdf", cal = secCal(el), L = secLen(el), cropOn = !!secCrop(el);
  const num = (f, lab, step, v, ph = "") => `<div><label>${lab}</label><input type="number" step="${step}" data-sf="${f}" value="${v === null || v === undefined ? "" : v}" placeholder="${ph}" /></div>`;
  const opt = (v, cur, lab) => `<option value="${v}"${cur === v ? " selected" : ""}>${lab}</option>`;
  const sl = (f, lab, v) => `<div class="sec-sl"><span>${lab}</span><input type="range" min="5" max="100" step="5" data-sf="${f}" value="${v}" /><b>${v} %</b></div>`;
  const zp = (f, lab, v) => `<div><label>${lab}</label><div style="display:flex;gap:4px;"><input type="number" step="0.1" data-sf="${f}" value="${v ?? ""}" placeholder="hela" style="flex:1;min-width:0;" /><button type="button" data-zpick="${f}" title="Klicka höjden i 3D-modellen" style="width:32px;padding:0;">📍</button></div></div>`;
  const imgBlock = !pdf ? "" : `<div class="sec-row"><span class="grow sec-note" style="margin:0;">${el.img && el.img.path ? "🖼 " + esc(String(el.img.path).split("/").pop()) : "Ingen ritning vald"}</span><button type="button" id="secImg">${el.img && el.img.path ? "Byt PDF/bild" : "Välj PDF/bild"}</button></div>
    ${el.img && el.img.path ? `<div class="sec-row"><button type="button" class="primary grow" id="secWiz">📍 Passa in mot modellen</button></div>
      <div class="sec-note ${cal ? "sec-ok" : "sec-warn"}">${cal ? "✔ Inpassad – linjen och höjderna kommer från de två 3D-punkterna." : "Klicka två punkter i ritningen och samma två i 3D-modellen."}</div>
      ${cal ? `<div class="sec-row"><button type="button" id="secCropEdit" class="${secPick.cropEdit === el.id ? "primary" : ""}">${secPick.cropEdit === el.id ? "✓ Klar med beskärning" : "✂ Beskär med handtag"}</button><button type="button" id="secCropReset"${cropOn ? "" : " disabled"}>Visa hela</button></div>` : ""}
      ${sl("imgAlphaPct", "Ritningens täckning", Math.round((Number(el.imgAlpha) || 1) * 100))}
      <label class="check"><input type="checkbox" data-f="lines" ${el.lines === false ? "" : "checked"} /> Visa IFC-snittet ovanpå</label>` : ""}`;
  return `<div class="sec-seg" role="group"><button type="button" data-secsrc="ifc" class="${pdf ? "" : "on"}">Snitt ur IFC</button><button type="button" data-secsrc="pdf" class="${pdf ? "on" : ""}">Egen ritning + bubblor</button></div>
    <label>Rubrik</label><input type="text" data-f="title" value="${esc(el.title || "")}" />
    ${pdf ? `<details class="sec-g" open><summary>Ritning</summary>${imgBlock}</details>` : ""}
    <details class="sec-g" open><summary>Snitt</summary>
      <div class="sec-row"><button type="button" id="secPick">${secPick.el === el && !secPick.cal && !secPick.crop ? "Klicka två punkter …" : "📍 Linje i planen"}</button><button type="button" id="secFlip" title="Byt sida – vilket håll man tittar mot">↔ Vänd</button><span class="sec-note" style="margin:0;">${L > 0 ? `Längd ${L.toFixed(1)} m` : "Ingen linje än"}</span></div>
      <div class="sec-g2">${zp("zlo", "Från höjd (m)", el.zlo)}${zp("zhi", "Till höjd (m)", el.zhi)}${num("front", "Före snittet (m)", "0.5", el.front ?? 0)}${num("depth", "Bakom snittet (m)", "0.5", el.depth ?? SEC_DEF.depth)}${num("scale", "Skala 1:", "10", el.scale || "", "passa")}</div>
      <div class="sec-note">Höjder tomma = hela byggnaden${data ? ` (${data.zlo.toFixed(1)}–${data.zhi.toFixed(1)} m)` : ""}. Före/bakom styr vilka objekt som får bubblor.</div>
    </details>
    <details class="sec-g"><summary>Utseende</summary>
      ${sl("ifcAlphaPct", "IFC-snittet täckning", Math.round((Number(el.ifcAlpha) || 1) * 100))}
      <div class="sec-g2"><div><label>Linjefärg</label><input type="color" data-f="color" value="${esc(el.color || SEC_DEF.color)}" /></div><div><label>Tjocklek (mm)</label><input type="number" step="0.05" data-f="lw" data-num="1" value="${el.lw || SEC_DEF.lw}" /></div>
        <div><label>Plushöjder var (m)</label><input type="number" step="0.5" min="0" data-f="zstep" data-num="1" value="${el.zstep || ""}" placeholder="auto" /></div><div class="sec-chips" style="align-items:end;"><label class="check"><input type="checkbox" data-f="zshow" ${el.zshow === false ? "" : "checked"} /> Visa skalan</label></div>
        <div><label>Skalans text</label><input type="color" data-f="zcolor" value="${esc(el.zcolor || "#64748b")}" /></div><div><label>Skalans linje</label><input type="color" data-f="zgrid" value="${esc(el.zgrid || "#e2e8f0")}" /></div></div>
      <label class="check"><input type="checkbox" data-f="status" ${el.status === false ? "" : "checked"} /> Färga snittet efter status</label>
    </details>
    <details class="sec-g" open><summary>Bubblor</summary>
      ${secSelHtml(el, b, data)}
      <label class="check"><input type="checkbox" data-sb="on" ${b.on ? "checked" : ""} /> Visa bubblor</label>
      <div class="sec-g2"><div><label>Vilka</label><select data-sb="mode">${opt("running", b.mode, "Bara pågående")}${opt("active", b.mode, "Pågående + försenade")}${opt("all", b.mode, "Alla bakom snittet")}${opt("sel", b.mode, "Markerade i 3D")}</select></div>
        <div><label>Framdrift</label><select data-sb="prog">${opt("entered", b.prog, "Inskriven")}${opt("plan", b.prog, "Uträknad efter datum")}</select></div>
        <div><label>Kortbredd (mm)</label><input type="number" step="2" data-sb="size" value="${b.size}" /></div><div><label>Högst antal</label><input type="number" step="1" data-sb="max" value="${b.max}" /></div></div>
      <div class="sec-row"><label style="margin:0;">Bubblornas färg</label><input type="color" data-sbcolor value="${esc(b.color || "#2563eb")}" /><button type="button" id="secBubStatusColor"${b.color ? "" : " disabled"}>Efter status</button></div>
      <div class="sec-chips"><label class="check"><input type="checkbox" data-sbf="name" ${b.fields.name ? "checked" : ""} /> Namn</label><label class="check"><input type="checkbox" data-sbf="date" ${b.fields.date ? "checked" : ""} /> Datum</label><label class="check"><input type="checkbox" data-sbf="progress" ${b.fields.progress ? "checked" : ""} /> Framdrift</label></div>
      ${secBubListHtml(el, data)}
      <div class="sec-note">Klicka på ett kort för att få alternativ för just den bubblan. "Försenad" = startdatum passerat utan registrerad framdrift. Statusen gäller utskriftens datum.</div>
    </details>
    <details class="sec-g"><summary>Avancerat</summary>
      <label>Sektionslinje (modellens koordinater, m)</label>
      <div class="sec-g2">${num("p1x", "Start X", "0.01", (el.p1 || [])[0])}${num("p1y", "Start Y", "0.01", (el.p1 || [])[1])}${num("p2x", "Slut X", "0.01", (el.p2 || [])[0])}${num("p2y", "Slut Y", "0.01", (el.p2 || [])[1])}</div>
      <div class="sec-g2"><div><label>Visa bara namn</label><input type="text" data-sf="q" value="${esc(el.q || "")}" /></div><div><label>Dölj namn</label><input type="text" data-sf="nq" value="${esc(el.nq || "")}" /></div></div>
      ${pdf ? `<label>Beskärning (%)</label><div class="sec-g2">${["l", "t", "r", "b"].map((k, i) => `<div><label>${["Vänster", "Överkant", "Höger", "Underkant"][i]}</label><input type="number" step="1" min="0" max="95" data-crop="${k}" value="${Math.round((((el.crop || {})[k]) || 0) * 100)}" /></div>`).join("")}</div>
      <label>Passpunkter för hand</label>${["a", "b"].map(k => { const p = (el.cal || {})[k] || {}; return `<div class="sec-g2"><div><label>${k.toUpperCase()}: längs (m)</label><input type="number" step="0.1" data-cal="${k}.u" value="${p.u ?? ""}" /></div><div><label>${k.toUpperCase()}: höjd (m)</label><input type="number" step="0.1" data-cal="${k}.z" value="${p.z ?? ""}" /></div></div>`; }).join("")}` : ""}
    </details>
    <div class="sec-act"><button type="button" id="secUpdate" title="Läs in byggnaden igen och räkna om">🔄 Läs in igen</button></div>
    <div class="sec-note" id="secInfo">${data ? `${data.segs.toLocaleString("sv-SE")} segment, ${data.anchors.length} aktiviteter bakom snittet. ` : "Inte beräknad än. "}Räknas om av sig själv när du ändrar något. Det som ligger utanför bladet skrivs inte ut.</div>`;
}
function prSectionBind(box, el) {
  const redraw = () => { drawPrintPage(); };
  const lineChanged = () => { secAuto(el); redraw(); };
  box.querySelectorAll("[data-secsrc]").forEach(bt => { bt.onclick = () => { if ((el.src || "ifc") === bt.dataset.secsrc) return; pushUndo(); el.src = bt.dataset.secsrc; renderPrintProps(); drawPrintPage(); }; });
  const cre = box.querySelector("#secCropEdit"); if (cre) cre.onclick = () => { secPick.cropEdit = secPick.cropEdit === el.id ? null : el.id; secPick.el = null; secPick.crop = false; prCmdLog(secPick.cropEdit ? "Dra i handtagen runt ritningen för att beskära. Tryck Klar när du är nöjd." : "Beskärningen klar."); renderPrintProps(); drawPrintPage(); };
  box.querySelectorAll('input[type="range"][data-sf]').forEach(r => r.addEventListener("input", () => { const f = r.dataset.sf, v = (Number(r.value) || 100) / 100; if (f === "ifcAlphaPct") el.ifcAlpha = Math.max(0.05, v); else el.imgAlpha = Math.max(0.05, v); const bb = r.parentNode.querySelector("b"); if (bb) bb.textContent = r.value + " %"; drawPrintPage(); }));
  box.querySelectorAll("[data-sf]").forEach(i => i.addEventListener("change", () => {
    if (i.type === "range") return;
    if (i.type === "radio" && !i.checked) return;
    pushUndo(); const f = i.dataset.sf, v = i.value;
    if (f === "src") { el.src = v; renderPrintProps(); drawPrintPage(); return; }
    if (f === "ifcAlphaPct") { el.ifcAlpha = Math.max(0.05, Math.min(1, (Number(v) || 100) / 100)); drawPrintPage(); return; }
    if (f === "imgAlphaPct") { el.imgAlpha = Math.max(0.1, Math.min(1, (Number(v) || 100) / 100)); drawPrintPage(); return; }
    if (f === "q" || f === "nq") el[f] = v;
    else if (/^p[12][xy]$/.test(f)) { const p = f[1] === "1" ? "p1" : "p2", ix = f[2] === "x" ? 0 : 1; el[p] = el[p] ? el[p].slice() : [0, 0]; el[p][ix] = Number(String(v).replace(",", ".")) || 0; }
    else el[f] = v === "" ? (f === "scale" ? 0 : null) : Number(String(v).replace(",", "."));
    lineChanged();
  }));
  box.querySelectorAll("[data-sb]").forEach(i => i.addEventListener("change", () => { pushUndo(); el.bub = secBub(el); const f = i.dataset.sb; el.bub[f] = i.type === "checkbox" ? i.checked : (f === "size" || f === "max") ? Number(i.value) || SEC_DEF.bub[f] : i.value; redraw(); }));
  box.querySelectorAll("[data-sbf]").forEach(i => i.addEventListener("change", () => { pushUndo(); el.bub = secBub(el); el.bub.fields[i.dataset.sbf] = i.checked; redraw(); }));
  const pick = box.querySelector("#secPick"); if (pick) pick.onclick = () => { secPick.crop = false; secPick.el = secPick.el === el ? null : el; secPick.pts = []; prCmdLog(secPick.el ? "Klicka på ritningen där sektionen börjar." : "Avbröt."); renderPrintProps(); };
  box.querySelectorAll("[data-calpick]").forEach(b => { b.onclick = () => { if (!(el.img && el.img.path)) { alert("Välj en PDF eller bild först."); return; } secPick.crop = false; secPick.el = secPick.cal === b.dataset.calpick ? null : el; secPick.cal = secPick.el ? b.dataset.calpick : null; secPick.pts = []; prCmdLog(secPick.el ? "Klicka på punkten i sektionsritningen." : "Avbröt."); renderPrintProps(); }; });
  box.querySelectorAll("[data-cal]").forEach(i => i.addEventListener("change", () => { pushUndo(); const [k, f] = i.dataset.cal.split("."); el.cal = { ...(el.cal || {}) }; el.cal[k] = { ...(el.cal[k] || {}) }; el.cal[k][f] = i.value === "" ? undefined : Number(String(i.value).replace(",", ".")); drawPrintPage(); }));
  box.querySelectorAll("[data-zpick]").forEach(b => { b.onclick = () => secPickZ(el, b.dataset.zpick); });
  const wiz = box.querySelector("#secWiz"); if (wiz) wiz.onclick = () => secWizard(el);
  const simg = box.querySelector("#secImg"); if (simg) simg.onclick = () => $("prImgInput").click();
  box.querySelectorAll("[data-secoff]").forEach(i => i.addEventListener("change", () => { pushUndo(); el.bub = secBub(el); el.bub.off = { ...el.bub.off }; if (i.checked) delete el.bub.off[i.dataset.secoff]; else el.bub.off[i.dataset.secoff] = true; drawPrintPage(); }));
  const brs = box.querySelector("#secBubReset"); if (brs) brs.onclick = () => { pushUndo(); el.bub = secBub(el); el.bub.pos = {}; el.bub.off = {}; el.bub.anc = {}; el.bub.cfg = {}; renderPrintProps(); drawPrintPage(); };
  const cr = box.querySelector("#secCrop"); if (cr) cr.onclick = () => { secPick.crop = !secPick.crop; secPick.el = secPick.crop ? el : null; secPick.cal = null; secPick.wiz = false; secPick.pts = []; prCmdLog(secPick.crop ? "Klicka ett hörn av det du vill visa, sedan motsatta hörnet." : "Avbröt."); renderPrintProps(); };
  const crr = box.querySelector("#secCropReset"); if (crr) crr.onclick = () => { pushUndo(); el.crop = null; renderPrintProps(); drawPrintPage(); };
  box.querySelectorAll("[data-crop]").forEach(i => i.addEventListener("change", () => { pushUndo(); el.crop = { ...(el.crop || {}) }; el.crop[i.dataset.crop] = Math.max(0, Math.min(95, Number(i.value) || 0)) / 100; drawPrintPage(); renderPrintProps(); }));
  const bcSet = (f, v) => { pushUndo(); el.bub = secBub(el); const k = secSel.key; el.bub.cfg = { ...el.bub.cfg, [k]: { ...(el.bub.cfg[k] || {}), [f]: v } }; drawPrintPage(); };
  box.querySelectorAll("[data-bc]").forEach(i => i.addEventListener("change", () => bcSet(i.dataset.bc, i.dataset.bc === "sc" ? Math.max(0.5, Math.min(3, (Number(i.value) || 100) / 100)) : Math.max(12, Number(i.value) || 36))));
  box.querySelectorAll("[data-bcf]").forEach(i => i.addEventListener("change", () => { const k = secSel.key, cur = ((secBub(el).cfg[k] || {}).fields) || {}; bcSet("fields", { ...cur, [i.dataset.bcf]: i.checked }); }));
  const sbc = box.querySelector("[data-sbcolor]"); if (sbc) { sbc.addEventListener("input", () => { el.bub = secBub(el); el.bub.color = sbc.value; drawPrintPage(); }); sbc.addEventListener("change", () => { pushUndo(); renderPrintProps(); }); }
  const sbs = box.querySelector("#secBubStatusColor"); if (sbs) sbs.onclick = () => { pushUndo(); el.bub = secBub(el); delete el.bub.color; renderPrintProps(); drawPrintPage(); };
  const bcc = box.querySelector("[data-bccolor]"); if (bcc) bcc.addEventListener("input", () => { const k = secSel.key; el.bub = secBub(el); el.bub.cfg = { ...el.bub.cfg, [k]: { ...(el.bub.cfg[k] || {}), color: bcc.value } }; drawPrintPage(); });
  if (bcc) bcc.addEventListener("change", () => { pushUndo(); renderPrintProps(); });
  const bcs = box.querySelector("#secBcStatusColor"); if (bcs) bcs.onclick = () => { pushUndo(); const k = secSel.key; el.bub = secBub(el); const n = { ...(el.bub.cfg[k] || {}) }; delete n.color; el.bub.cfg = { ...el.bub.cfg, [k]: n }; renderPrintProps(); drawPrintPage(); };
  const bh = box.querySelector("#secBcHide"); if (bh) bh.onclick = () => { pushUndo(); el.bub = secBub(el); el.bub.off = { ...el.bub.off, [secSel.key]: true }; secSel.key = null; renderPrintProps(); drawPrintPage(); };
  const br = box.querySelector("#secBcReset"); if (br) br.onclick = () => { pushUndo(); el.bub = secBub(el); const k = secSel.key, rm = o => { const n = { ...o }; delete n[k]; return n; }; el.bub.cfg = rm(el.bub.cfg); el.bub.pos = rm(el.bub.pos); el.bub.anc = rm(el.bub.anc); renderPrintProps(); drawPrintPage(); };
  const bd = box.querySelector("#secBcDone"); if (bd) bd.onclick = () => { secSel.key = null; renderPrintProps(); drawPrintPage(); };
  const flip = box.querySelector("#secFlip"); if (flip) flip.onclick = () => { pushUndo(); el.side = el.side === -1 ? 1 : -1; lineChanged(); };
  const upd = box.querySelector("#secUpdate");
  if (upd) upd.onclick = async () => {
    const info = box.querySelector("#secInfo"); upd.disabled = true;
    await secBuild(el, { say: t => { if (info) info.textContent = t; } });
    upd.disabled = false; drawPrintPage();
  };
}
