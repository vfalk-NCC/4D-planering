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
  bub: { on: true, mode: "active", prog: "entered", size: 36, max: 12, fields: { name: true, date: true, progress: true } } };
const secData = new Map();               // elementets id -> { sig, groups: Map(nyckel -> polylinjer [u,z mm]), anchors, L, zlo, zhi }
const secPick = { el: null, pts: [], cal: null };    // "Välj i ritning": väntar på två klick på en ritning
const SEC_MAX_SEGS = 400000;
const secKey = r => (r.group_id ? `g:${r.group_id}` : r.source_key ? `s:${r.source_key}` : `i:${r.id}`);
const secBub = el => ({ ...SEC_DEF.bub, ...(el.bub || {}), fields: { ...SEC_DEF.bub.fields, ...((el.bub || {}).fields || {}) } });
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
  const depth = Math.max(0, Number(el.depth) || 0), q = (el.q || "").trim().toLowerCase(), nq = (el.nq || "").trim().toLowerCase();
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
        let u0 = 1e18, u1 = -1e18, v0 = 1e18, v1 = -1e18, z1 = -1e18;
        const end = Math.min(n, r.start + r.count);
        for (let v = r.start; v < end; v++) { if (U[v] < u0) u0 = U[v]; if (U[v] > u1) u1 = U[v]; if (V[v] < v0) v0 = V[v]; if (V[v] > v1) v1 = V[v]; if (Z[v] > z1) z1 = Z[v]; }
        if (end > r.start && u1 >= 0 && u0 <= L && v1 >= 0 && v0 <= depth && z1 >= zlo) {
          const a = anchorBy.get(keyOf[i]) || anchorBy.set(keyOf[i], { row, us: [], zTop: -1e18, n: 0 }).get(keyOf[i]);
          a.us.push(Math.max(0, Math.min(L, (u0 + u1) / 2))); a.zTop = Math.max(a.zTop, Math.min(z1, zhi)); a.n++;
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
  const anchors = [...anchorBy.entries()].map(([key, a]) => ({ key, row: a.row, u: a.us.reduce((s, v) => s + v, 0) / a.us.length, z: a.zTop, n: a.n })).filter(a => isFinite(a.z));
  if (!isFinite(zMin)) { zMin = 0; zMax = 3; }
  return { groups, anchors, L, zlo: zMin, zhi: zMax, segs: total, capped };
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
    secData.set(el.id, res);
    say(`${res.segs.toLocaleString("sv-SE")} linjesegment, ${res.anchors.length} aktiviteter bakom snittet${res.capped ? " – avkortat, filtrera för att få med allt" : ""}.`);
    return true;
  } catch (e) { say("Kunde inte skapa sektionen: " + e.message); console.warn("Sektion", e); return false; }
  finally { if (!was3d && o.open !== false && typeof close3d === "function" && document.getElementById("view3d") && !document.getElementById("view3d").classList.contains("hidden")) close3d(); }
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
  let list = data.anchors.filter(a => a.row && a.row.start_date);
  if (cfg.mode === "active") list = list.filter(a => ["pagaende", "forsenad"].includes(secPhase(a.row)));
  else if (cfg.mode === "sel") list = list.filter(a => marked.has(a.key));
  return list.sort((a, b) => a.u - b.u).slice(0, Math.max(1, Number(cfg.max) || 12));
}

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
    ctx.drawImage(pdfIm, X + (bw - iw) / 2, top + (bh - ih) / 2, iw, ih);
    ctx.fillStyle = "#b45309"; ctx.font = `bold ${fs}px Helvetica, Arial`; ctx.textAlign = "left"; ctx.fillText("Passa in ritningen: sätt punkt A och B i panelen", X + mm, Y + H - fs);
    ctx.restore(); return;
  }
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
  if (pdfIm && cal) { imRect = secImgRect(cal); uLo = Math.min(uLo, imRect.u0); uHi = Math.max(uHi, imRect.u1); zlo = Math.min(zlo, imRect.z0); zTop = Math.max(zTop, imRect.z1); }
  const span = Math.max(0.1, zTop - zlo), uSpan = Math.max(0.1, uHi - uLo);
  let s = Math.min(dW / uSpan, dH / span);                  // px per meter
  if (Number(el.scale) > 0) s = (1000 / Number(el.scale)) * mm;
  const x0 = X + axisW, yBase = dTop + dH;                  // u = uLo och z = zlo
  const px = u => x0 + (u - uLo) * s, py = z => yBase - (z - zlo) * s;
  // Höjdskala till vänster.
  if (imRect) { ctx.save(); ctx.beginPath(); ctx.rect(x0 - 1, dTop - 1, dW + 2, dH + 2); ctx.clip(); ctx.globalAlpha = Math.max(0.1, Math.min(1, Number(el.imgAlpha) || 1)); ctx.drawImage(pdfIm, px(imRect.u0), py(imRect.z1), (imRect.u1 - imRect.u0) * s, (imRect.z1 - imRect.z0) * s); ctx.restore(); }
  const step = [0.5, 1, 2, 3, 5, 10, 20].find(v => v * s >= fs * 2.4) || 20;
  ctx.strokeStyle = "#e2e8f0"; ctx.fillStyle = "#64748b"; ctx.lineWidth = Math.max(0.5, mm * 0.08); ctx.font = `${fs * 0.9}px Helvetica, Arial`; ctx.textAlign = "right";
  for (let z = Math.ceil(zlo / step) * step; z <= zTop + 1e-6; z += step) { const y = py(z); if (y < dTop - 1 || y > yBase + 1) continue; ctx.beginPath(); ctx.moveTo(x0 - mm, y); ctx.lineTo(x0 + Math.min(uSpan * s, dW), y); ctx.stroke(); ctx.fillText((z >= 0 ? "+" : "") + z.toFixed(1), X + axisW - mm * 1.2, y); }
  // Snittlinjerna, samlade per färg (statusfärg om det är på).
  const byCol = new Map();
  data.groups.forEach((lines, key) => {
    let c = col;
    if (key && el.status !== false) { const r = secRow(key); if (r) c = phaseColor(secPhase(r)); }
    (byCol.get(c) || byCol.set(c, []).get(c)).push(lines);
  });
  ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.lineWidth = Math.max(0.6, (el.lw || SEC_DEF.lw) * mm);
  ctx.save(); ctx.beginPath(); ctx.rect(x0 - 1, dTop - 1, dW + 2, dH + 2); ctx.clip();
  if (!(pdfIm && cal && el.lines === false)) byCol.forEach((sets, c) => {
    ctx.strokeStyle = c; ctx.beginPath();
    sets.forEach(lines => lines.forEach(p => { ctx.moveTo(px(p[0] / 1000), py(p[1] / 1000)); for (let i = 2; i < p.length; i += 2) ctx.lineTo(px(p[i] / 1000), py(p[i + 1] / 1000)); }));
    ctx.stroke();
  });
  ctx.restore();
  // Bubblorna: kort i bandet, ledlinje till objektets överkant.
  const placed = [];
  cards.forEach((a, i) => {
    const ax = px(a.u), ay = py(Math.min(a.z, zTop)), L = secCardLines(a, cfg), c = phaseColor(secPhase(a.row));
    let cx = Math.max(X, Math.min(X + W - cw, ax - cw / 2)), cy = top + mm * 0.5;
    for (let r = 0; r < Math.max(1, rows); r++) { cy = top + mm * 0.5 + r * (ch + mm * 1.5); if (!placed.some(p => p.y === cy && cx < p.x + cw + mm * 0.5 && cx + cw + mm * 0.5 > p.x)) break; }
    // Hamnar kortet över ett annat i alla rader: skjut det åt sidan tills det får plats.
    for (let g = 0; g < 40 && placed.some(p => p.y === cy && cx < p.x + cw + mm * 0.5 && cx + cw + mm * 0.5 > p.x); g++) { cx += cw + mm; if (cx + cw > X + W) { cx = X; cy += ch + mm * 1.5; } }
    placed.push({ x: cx, y: cy });
    const tipX = Math.max(cx + cw * 0.08, Math.min(cx + cw * 0.92, ax));
    ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(1, mm * 0.5); ctx.beginPath(); ctx.moveTo(tipX, cy + ch); ctx.lineTo(ax, ay); ctx.stroke();
    ctx.strokeStyle = c; ctx.lineWidth = Math.max(0.6, mm * 0.2); ctx.beginPath(); ctx.moveTo(tipX, cy + ch); ctx.lineTo(ax, ay); ctx.stroke();
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(ax, ay, Math.max(1.2, mm * 0.7), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.fillRect(cx, cy, cw, ch); ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = Math.max(0.5, mm * 0.1); ctx.strokeRect(cx, cy, cw, ch);
    ctx.fillStyle = c; ctx.fillRect(cx, cy, mm * 1.2, ch);
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
  // Skala och sektionslinjens ändar.
  ctx.fillStyle = "#475569"; ctx.font = `${fs * 0.9}px Helvetica, Arial`; ctx.textAlign = "left";
  const N = Math.round(1000 / (s / mm));
  ctx.fillText(`Skala 1:${N.toLocaleString("sv-SE")}  ·  längd ${data.L.toFixed(1)} m  ·  ${secAt()}`, x0, Y + H - fs * 0.7);
  ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = Math.max(0.5, mm * 0.1); ctx.beginPath(); ctx.moveTo(x0, yBase); ctx.lineTo(x0 + uSpan * s, yBase); ctx.stroke();
  ctx.restore();
}
/* Egen sektionsritning (bild): två passpunkter A och B – bildens andel (fx, fy; fy nedåt) <-> sektionens u (m längs linjen) och z (m). */
function secCal(el) {
  const c = el.cal; if (!c || !c.a || !c.b) return null;
  const f = v => Number(v); if (![c.a.fx, c.a.fy, c.a.u, c.a.z, c.b.fx, c.b.fy, c.b.u, c.b.z].every(v => Number.isFinite(f(v)))) return null;
  if (Math.abs(c.b.fx - c.a.fx) < 1e-4 || Math.abs(c.b.fy - c.a.fy) < 1e-4 || c.b.u === c.a.u || c.b.z === c.a.z) return null;
  return c;
}
function secImgRect(c) {
  const mu = (c.b.u - c.a.u) / (c.b.fx - c.a.fx), mz = (c.b.z - c.a.z) / (c.a.fy - c.b.fy);   // meter per bildbredd / bildhöjd
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

/* Klick på ritningen i layouten under "Välj i ritning": sidans mm -> modellens koordinater (m). */
function secPageToModel(map, x, y) {
  const tplK = typeof pageDims === "function" ? pageDims().k : 1;
  const c = mToPx(map.center), spanW = map.w * tplK * map.scale / 1000 * pxPerMeter(), spanH = map.h * tplK * map.scale / 1000 * pxPerMeter();
  const sx = c[0] + ((x - map.x) / map.w - 0.5) * spanW, sy = c[1] + ((y - map.y) / map.h - 0.5) * spanH;
  return pdfToModel(toPdf([sx, sy]));
}
function secPickClick(mx, my) {
  if (!secPick.el || !pr) return false;
  if (secPick.cal) { // punkt A/B i sektionsritningen: klicket inom elementet -> andel av bilden (bilden ligger inpassad tills båda är satta)
    const el = secPick.el, im = el.img && el.img.path && printImage(el.img.path);
    if (!im || mx < el.x || mx > el.x + el.w || my < el.y || my > el.y + el.h) { prCmdLog("Klicka på sektionsritningen."); return true; }
    const top = el.y + (el.title ? (7 * pageDims().k * PT_MM) * 2 : 0), bw = el.w, bh = el.y + el.h - top, ar = (im.naturalWidth || im.width) / (im.naturalHeight || im.height) || 1;
    let iw = bw, ih = bw / ar; if (ih > bh) { ih = bh; iw = bh * ar; }
    const fx = (mx - (el.x + (bw - iw) / 2)) / iw, fy = (my - (top + (bh - ih) / 2)) / ih;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) { prCmdLog("Klicka på själva ritningen."); return true; }
    pushUndo(); el.cal = { ...(el.cal || {}) }; el.cal[secPick.cal] = { ...(el.cal[secPick.cal] || { u: 0, z: 0 }), fx: Math.round(fx * 1e4) / 1e4, fy: Math.round(fy * 1e4) / 1e4 };
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

function secPdfHtml(el) {
  const c = el.cal || {}, pt = (k, lab) => { const p = c[k] || {}, set = p.fx !== undefined;
    return `<div class="pr-grid4"><div style="grid-column:span 2;"><button type="button" class="btn small" data-calpick="${k}">${secPick.cal === k ? "Klicka på ritningen …" : (set ? "✔ " : "") + "📍 Punkt " + lab + " i bilden"}</button></div>
      <div><label>${lab}: längs m</label><input type="number" step="0.1" data-cal="${k}.u" value="${p.u ?? ""}" /></div><div><label>${lab}: höjd m</label><input type="number" step="0.1" data-cal="${k}.z" value="${p.z ?? ""}" /></div></div>`; };
  return `<div class="hint">Din egen sektionsritning (bild/PDF-utsnitt som PNG/JPG) läggs i sektionens koordinater: markera två kända punkter i bilden (t.ex. två bjälklagskanter) och skriv in var de ligger – längs sektionslinjen och i höjd. Bubblorna fästs sedan vid IFC-objekten.</div>
    <div class="pr-row"><button type="button" class="btn small" id="secImg">${el.img && el.img.path ? "🖼 Byt bild" : "🖼 Välj bild"}</button></div>${pt("a", "A")}${pt("b", "B")}
    <div class="pr-grid4"><div><label>Ritningens täckning %</label><input type="number" step="10" min="10" max="100" data-sf="imgAlphaPct" value="${Math.round((Number(el.imgAlpha) || 1) * 100)}" /></div></div>
    <label class="check"><input type="checkbox" data-f="lines" ${el.lines === false ? "" : "checked"} /> Visa även IFC-snittet ovanpå</label>`;
}
/* Sidopanelen. */
function prSectionHtml(el) {
  const esc = escHtml, b = secBub(el), data = secData.get(el.id), p1 = el.p1 || ["", ""], p2 = el.p2 || ["", ""];
  const num = (f, lab, step, v) => `<div><label>${lab}</label><input type="number" step="${step}" data-sf="${f}" value="${v === null || v === undefined ? "" : v}" /></div>`;
  const opt = (v, cur, lab) => `<option value="${v}"${cur === v ? " selected" : ""}>${lab}</option>`;
  return `<div class="hint">Sektionen skär de inlästa IFC-modellerna lodrätt längs en linje i planen. Bubblorna visar aktiviteterna bakom snittet.</div>
    <label>Rubrik</label><input type="text" data-f="title" value="${esc(el.title || "")}" />
    <div class="pr-row"><label class="check"><input type="radio" name="secsrc" data-sf="src" value="ifc" ${el.src === "pdf" ? "" : "checked"} /> Snitt ur IFC</label> <label class="check"><input type="radio" name="secsrc" data-sf="src" value="pdf" ${el.src === "pdf" ? "checked" : ""} /> Egen sektionsritning (bild) + bubblor</label></div>
    ${el.src === "pdf" ? secPdfHtml(el) : ""}
    <label>Sektionslinje (modellens koordinater, m)</label>
    <div class="pr-grid4">${num("p1x", "Start X", "0.01", p1[0])}${num("p1y", "Start Y", "0.01", p1[1])}${num("p2x", "Slut X", "0.01", p2[0])}${num("p2y", "Slut Y", "0.01", p2[1])}</div>
    <div class="pr-row"><button type="button" class="btn small" id="secPick">${secPick.el === el ? "Klicka två punkter på ritningen …" : "📍 Välj i ritning"}</button> <button type="button" class="btn small" id="secFlip" title="Byt riktning – vilken sida av linjen man tittar mot">↔ Vänd</button></div>
    <div class="pr-grid4">${num("depth", "Djup bakom m", "0.5", el.depth ?? SEC_DEF.depth)}${num("scale", "Skala 1:", "10", el.scale || "")}${num("zlo", "Från höjd m", "0.5", el.zlo ?? "")}${num("zhi", "Till höjd m", "0.5", el.zhi ?? "")}</div>
    <div class="hint">Skala tom = passa i rutan. Höjder tomma = hela byggnaden.</div>
    <div class="pr-grid4"><div style="grid-column:span 2;"><label>Visa bara objekt med namn</label><input type="text" data-sf="q" value="${esc(el.q || "")}" /></div><div style="grid-column:span 2;"><label>Dölj objekt med namn</label><input type="text" data-sf="nq" value="${esc(el.nq || "")}" /></div></div>
    <div class="pr-grid4"><div><label>Linjefärg</label><input type="color" data-f="color" value="${esc(el.color || SEC_DEF.color)}" /></div><div><label>Linjetjocklek mm</label><input type="number" step="0.05" data-f="lw" data-num="1" value="${el.lw || SEC_DEF.lw}" /></div></div>
    <label class="check"><input type="checkbox" data-f="status" ${el.status === false ? "" : "checked"} /> Färga snittet efter status</label>
    <label>Bubblor (framdrift)</label>
    <label class="check"><input type="checkbox" data-sb="on" ${b.on ? "checked" : ""} /> Visa bubblor</label>
    <div class="pr-grid4"><div style="grid-column:span 2;"><label>Vilka</label><select data-sb="mode">${opt("active", b.mode, "Pågående och försenade")}${opt("all", b.mode, "Alla bakom snittet")}${opt("sel", b.mode, "Markerade i 3D")}</select></div>
      <div style="grid-column:span 2;"><label>Framdrift</label><select data-sb="prog">${opt("entered", b.prog, "Inskriven (tidplanen)")}${opt("plan", b.prog, "Uträknad efter datum")}</select></div></div>
    <div class="pr-grid4"><div><label>Kortbredd mm</label><input type="number" step="2" data-sb="size" value="${b.size}" /></div><div><label>Högst</label><input type="number" step="1" data-sb="max" value="${b.max}" /></div></div>
    <div class="pr-tcols"><label class="check"><input type="checkbox" data-sbf="name" ${b.fields.name ? "checked" : ""} /> Namn</label><label class="check"><input type="checkbox" data-sbf="date" ${b.fields.date ? "checked" : ""} /> Datum</label><label class="check"><input type="checkbox" data-sbf="progress" ${b.fields.progress ? "checked" : ""} /> Framdrift</label></div>
    <div class="pr-row"><button type="button" class="btn small primary" id="secUpdate">🔄 Uppdatera sektion</button></div>
    <div class="hint" id="secInfo">${data ? `${data.segs.toLocaleString("sv-SE")} segment, ${data.anchors.length} aktiviteter bakom snittet.` : "Sektionen är inte beräknad än."} Datum för statusen: utskriftens datum.</div>`;
}
function prSectionBind(box, el) {
  const redraw = () => { drawPrintPage(); };
  const lineChanged = () => { secData.delete(el.id); redraw(); };
  box.querySelectorAll("[data-sf]").forEach(i => i.addEventListener("change", () => {
    if (i.type === "radio" && !i.checked) return;
    pushUndo(); const f = i.dataset.sf, v = i.value;
    if (f === "src") { el.src = v; renderPrintProps(); drawPrintPage(); return; }
    if (f === "imgAlphaPct") { el.imgAlpha = Math.max(0.1, Math.min(1, (Number(v) || 100) / 100)); drawPrintPage(); return; }
    if (f === "q" || f === "nq") el[f] = v;
    else if (/^p[12][xy]$/.test(f)) { const p = f[1] === "1" ? "p1" : "p2", ix = f[2] === "x" ? 0 : 1; el[p] = el[p] ? el[p].slice() : [0, 0]; el[p][ix] = Number(String(v).replace(",", ".")) || 0; }
    else el[f] = v === "" ? (f === "scale" ? 0 : null) : Number(String(v).replace(",", "."));
    lineChanged();
  }));
  box.querySelectorAll("[data-sb]").forEach(i => i.addEventListener("change", () => { pushUndo(); el.bub = secBub(el); const f = i.dataset.sb; el.bub[f] = i.type === "checkbox" ? i.checked : (f === "size" || f === "max") ? Number(i.value) || SEC_DEF.bub[f] : i.value; redraw(); }));
  box.querySelectorAll("[data-sbf]").forEach(i => i.addEventListener("change", () => { pushUndo(); el.bub = secBub(el); el.bub.fields[i.dataset.sbf] = i.checked; redraw(); }));
  const pick = box.querySelector("#secPick"); if (pick) pick.onclick = () => { secPick.el = secPick.el === el ? null : el; secPick.pts = []; prCmdLog(secPick.el ? "Klicka på ritningen där sektionen börjar." : "Avbröt."); renderPrintProps(); };
  box.querySelectorAll("[data-calpick]").forEach(b => { b.onclick = () => { if (!(el.img && el.img.path)) { alert("Välj en bild först."); return; } secPick.el = secPick.cal === b.dataset.calpick ? null : el; secPick.cal = secPick.el ? b.dataset.calpick : null; secPick.pts = []; prCmdLog(secPick.el ? "Klicka på punkten i sektionsritningen." : "Avbröt."); renderPrintProps(); }; });
  box.querySelectorAll("[data-cal]").forEach(i => i.addEventListener("change", () => { pushUndo(); const [k, f] = i.dataset.cal.split("."); el.cal = { ...(el.cal || {}) }; el.cal[k] = { ...(el.cal[k] || {}) }; el.cal[k][f] = i.value === "" ? undefined : Number(String(i.value).replace(",", ".")); drawPrintPage(); }));
  const simg = box.querySelector("#secImg"); if (simg) simg.onclick = () => $("prImgInput").click();
  const flip = box.querySelector("#secFlip"); if (flip) flip.onclick = () => { pushUndo(); el.side = el.side === -1 ? 1 : -1; lineChanged(); };
  const upd = box.querySelector("#secUpdate");
  if (upd) upd.onclick = async () => {
    const info = box.querySelector("#secInfo"); upd.disabled = true;
    await secBuild(el, { say: t => { if (info) info.textContent = t; } });
    upd.disabled = false; drawPrintPage();
  };
}
