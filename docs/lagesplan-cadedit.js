/* Redigera DXF-linjer direkt i lägesplanen (2D) (Victor 2026-11-05: "markera linjer, ändra längd på dom och justera lite smått i 2D/lägesplan").
   Ritning → Lager → DXF (CAD) → ✎ Redigera linjer…
   • Tryck på en linje för att markera den (Skift/Ctrl lägger till), dra en ruta för att markera flera (vänster → höger: bara det som ligger helt i rutan, höger → vänster: allt rutan nuddar).
     Högerknapp/mushjul drar planen som vanligt.
   • Ändra längd: skriv en ny längd (m) och välj vilken ände som ligger still (Start / Mitt / Slut), eller förläng/korta med ±m. Flera markerade linjer förlängs/kortas lika mycket vardera.
   • Hörnpunkter: en markerad linjes hörn syns som kvadrater – dra i dem (fäster mot andra ändpunkter, Skift = var 5:e grad från grannpunkten).
   • Flytta: dra den markerade linjen, skriv dX/dY, eller piltangenterna (0,1 m; Skift 1 m; Ctrl 0,01 m). Vrid runt markeringens mitt. Ta bort (Delete). Ctrl+Z / Ctrl+Y ångrar och gör om.
   • Spara som ny DXF: en ny fil (namn med datum och klockslag) i Trimble Connect och ett nytt CAD-lager i planen; originalet ändras aldrig – det släcks bara. */
const cde = { rec: null, ents: [], texts: [], sel: new Set(), ver: 0, paths: null, pathVer: -1, undo: [], redo: [], dirty: false, drag: null, box: null, next: 1, anchor: "start", tool: null, trimPrev: null, bar: null, keyH: null, ox: 0, oy: 0 };
const cdeActive = () => (cde.rec ? cde.rec.id : null);
const cdeLen = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };
const cdeFmt = v => (Math.round(v * 1000) / 1000).toString().replace(".", ",");
const cdeEnts = () => cde.ents.filter(e => !e.del && cde.layerOn(e.layer));
cde.layerOn = name => !cde.rec || (typeof cadLayerOn === "function" ? cadLayerOn(cde.rec, name) : true);

async function cdeStart(id) {
  if (cde.rec) { if (cde.rec.id === id) return; if (!(await cdeEnd())) return; }
  const rec = cads().find(r => r.id === id); if (!rec) return;
  if (typeof layerState !== "undefined" && !ls("cad:" + id).visible) { ls("cad:" + id).visible = true; if (typeof saveLayerState === "function") saveLayerState(); }
  const g = await ensureCadGeom(rec), names = rec.layers.map(l => l.name);
  cde.ents = []; cde.texts = []; cde.sel = new Set(); cde.undo = []; cde.redo = []; cde.dirty = false; cde.next = 1; cde.ver++;
  g.groups.forEach(gr => {
    const layer = names[gr.l];
    (gr.raw || []).forEach(a => { const pts = []; for (let j = 0; j + 1 < a.length; j += 2) pts.push([g.origin[0] + a[j] / 1000, g.origin[1] + a[j + 1] / 1000]); if (pts.length > 1) cde.ents.push({ id: cde.next++, layer, color: gr.c, pts }); });
    (gr.texts || []).forEach(t => cde.texts.push({ layer, color: gr.c, x: g.origin[0] + t[0] / 1000, y: g.origin[1] + t[1] / 1000, h: t[2] / 1000, rot: t[3] || 0, s: String(t[4] || ""), al: t[5] || "lb" }));
  });
  cde.rec = rec; cde.ox = g.origin[0]; cde.oy = g.origin[1];
  cdeBar(); cdeBindKeys(); renderCad(); if (typeof renderZones === "function") renderZones();
  setSaveStatus(`✎ Redigerar ${rec.name}: tryck på en linje för att markera, dra en ruta för flera. Originalet ändras inte förrän du sparar som ny DXF.`);
}
async function cdeEnd(force) {
  if (!cde.rec) return true;
  if (!force && cde.dirty && !(await uiConfirm(`Avsluta redigeringen av ${cde.rec.name} utan att spara? Ändringarna försvinner (originalet är orört).`, { ok: "Avsluta utan att spara" }))) return false;
  cde.tool = null; cde.trimPrev = null; { const vp = document.getElementById("viewport"); if (vp) vp.style.cursor = ""; }
  cde.rec = null; cde.ents = []; cde.texts = []; cde.sel = new Set(); cde.paths = null; cde.dirty = false; cde.drag = null; cde.box = null;
  if (cde.bar) { cde.bar.remove(); cde.bar = null; } if (cde.keyH) { window.removeEventListener("keydown", cde.keyH, true); cde.keyH = null; }
  renderCad(); if (typeof renderZones === "function") renderZones();
  return true;
}
/* ---- Geometri och träffar ---------------------------------------------------------------------------------------- */
const cdeToModel = p => pdfToModel(toPdf(p));
const cdeTolM = () => 7 / Math.max(1e-6, pxPerMeter());
function cdeSegDist(px, py, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-12, t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / L2)); return Math.hypot(a[0] + dx * t - px, a[1] + dy * t - py); }
function cdeHit(m) {
  const tol = cdeTolM(); let best = null, bd = tol;
  cdeEnts().forEach(e => { const P = e.pts; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of P) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    if (m[0] < x0 - tol || m[0] > x1 + tol || m[1] < y0 - tol || m[1] > y1 + tol) return;
    for (let i = 1; i < P.length; i++) { const d = cdeSegDist(m[0], m[1], P[i - 1], P[i]); if (d < bd) { bd = d; best = e; } } });
  return best;
}
function cdeBoxSel(a, b, cross) {
  const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]), inR = p => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1;
  const segX = (p, q) => { let t0 = 0, t1 = 1; const dx = q[0] - p[0], dy = q[1] - p[1]; const clip = (pp, qq) => { if (pp === 0) return qq >= 0; const t = qq / pp; if (pp < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } return true; }; return clip(-dx, p[0] - x0) && clip(dx, x1 - p[0]) && clip(-dy, p[1] - y0) && clip(dy, y1 - p[1]); };
  return cdeEnts().filter(e => cross ? (e.pts.some(inR) || e.pts.some((p, i) => i && segX(e.pts[i - 1], p))) : e.pts.every(inR));
}
function cdeSnapPt(m, skip) {
  const tol = cdeTolM(); let best = null, bd = tol;
  cdeEnts().forEach(e => { if (skip && skip.has(e.id)) return; [e.pts[0], e.pts[e.pts.length - 1]].forEach(p => { const d = Math.hypot(p[0] - m[0], p[1] - m[1]); if (d < bd) { bd = d; best = p; } }); });
  return best;
}
/* ---- Ändringar med ångra ----------------------------------------------------------------------------------------- */
function cdeSnap(list) { return list.map(e => ({ id: e.id, pts: e.pts.map(p => p.slice()), del: !!e.del })); }
function cdeApply(snap) { snap.forEach(s => { const e = cde.ents.find(x => x.id === s.id); if (e) { e.pts = s.pts.map(p => p.slice()); e.del = s.del; } }); cde.ver++; }
function cdeOp(label, fn, list = cde.ents.filter(e => cde.sel.has(e.id))) {
  if (!list.length) return false;
  const before = cdeSnap(list); fn(list); const after = cdeSnap(list);
  if (JSON.stringify(before) === JSON.stringify(after)) return false;
  cde.undo.push({ label, before, after }); if (cde.undo.length > 100) cde.undo.shift(); cde.redo = []; cde.dirty = true; cde.ver++; cdeRefresh(); return true;
}
/* Allmän ändring (lägga till/ta bort linjer): redo/undo som funktioner. */
function cdeOp2(label, redo, undo) { redo(); cde.undo.push({ label, fn: { redo, undo } }); if (cde.undo.length > 100) cde.undo.shift(); cde.redo = []; cde.dirty = true; cde.ver++; cdeRefresh(); }
function cdeUndo() { const o = cde.undo.pop(); if (!o) return; cde.redo.push(o); if (o.fn) { o.fn.undo(); cde.ver++; } else cdeApply(o.before); cdeRefresh(); setSaveStatus("Ångrade: " + o.label); }
function cdeRedo() { const o = cde.redo.pop(); if (!o) return; cde.undo.push(o); if (o.fn) { o.fn.redo(); cde.ver++; } else cdeApply(o.after); cdeRefresh(); setSaveStatus("Gjorde om: " + o.label); }
const cdeSelEnts = () => cde.ents.filter(e => cde.sel.has(e.id) && !e.del);
function cdeCenter(list) { const P = list.flatMap(e => e.pts); const xs = P.map(p => p[0]), ys = P.map(p => p[1]); return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; }
/* Sätter längden på en linje: Start/Slut ligger still eller Mitt (linjens mitt ligger still). Polylinjer skalas runt ankaret. */
function cdeSetLen(e, T, anchor) {
  const L = cdeLen(e.pts); if (!(L > 1e-9) || !(T > 0)) return; const k = T / L, P = e.pts;
  let c; if (anchor === "end") c = P[P.length - 1]; else if (anchor === "mid") { let d = L / 2; c = P[0]; for (let i = 1; i < P.length; i++) { const s = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (d <= s || i === P.length - 1) { const t = s ? d / s : 0; c = [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t]; break; } d -= s; } } else c = P[0];
  e.pts = P.map(p => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k]);
}
const cdeR = v => Math.round(v * 1e4) / 1e4;
function cdeRound(e) { e.pts = e.pts.map(p => [cdeR(p[0]), cdeR(p[1])]); }
function cdeDoLen(T) { cdeOp("ändrad längd", L => L.forEach(e => { cdeSetLen(e, T, cde.anchor); cdeRound(e); })); }
function cdeDoGrow(d) { cdeOp(d >= 0 ? "förlängt" : "kortat", L => L.forEach(e => { const l0 = cdeLen(e.pts); cdeSetLen(e, Math.max(0.001, l0 + d), cde.anchor); cdeRound(e); })); }
function cdeDoMove(dx, dy) { cdeOp("flyttat", L => L.forEach(e => { e.pts = e.pts.map(p => [cdeR(p[0] + dx), cdeR(p[1] + dy)]); })); }
function cdeDoRotate(deg) { const L = cdeSelEnts(); if (!L.length) return; const C = cdeCenter(L), a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); cdeOp("vridet", LL => LL.forEach(e => { e.pts = e.pts.map(p => { const x = p[0] - C[0], y = p[1] - C[1]; return [cdeR(C[0] + x * c - y * s), cdeR(C[1] + x * s + y * c)]; }); })); }
function cdeDoDelete() { cdeOp("borttaget", L => L.forEach(e => { e.del = true; })); cde.sel = new Set(); cdeRefresh(); }

/* Trimma: tryck på den del av en linje som ska bort (som i AutoCAD) – delen mellan närmaste skärningar tas bort (lagesplan-dxftrim.js). */
function cdeTrim(hit, m) {
  const r = dxfTrimCompute(cdeEnts(), hit, m); if (!r.ok) { setSaveStatus("✂ " + r.reason); return false; }
  const adds = r.pieces.map(pts => ({ id: cde.next++, layer: hit.layer, color: hit.color, pts: pts.map(p => [cdeR(p[0]), cdeR(p[1])]) })), was = cde.sel.has(hit.id);
  cdeOp2("trimmat", () => { hit.del = true; cde.ents.push(...adds); cde.sel.delete(hit.id); }, () => { hit.del = false; const a = new Set(adds); cde.ents = cde.ents.filter(e => !a.has(e)); if (was) cde.sel.add(hit.id); });
  setSaveStatus(`✂ Trimmade bort ${cdeFmt(r.removedLen)} m.`); return true;
}
/* ---- Pekare ---------------------------------------------------------------------------------------------------- */
function cdePointerDown(e) {
  if (!cde.rec || e.button !== 0 || !plan || !plan.calib || !e.target.closest || !e.target.closest("#viewport") || e.target.closest("#cdeBar")) return false;
  const sp = stagePoint(e), m = cdeToModel(sp), tol = cdeTolM(), sel = cdeSelEnts();
  e.preventDefault();
  if (cde.tool === "trim") { const h = cdeHit(m); if (h) cdeTrim(h, m); else setSaveStatus("✂ Tryck på den del av en linje som ska bort."); cde.trimPrev = null; return true; }
  // hörnpunkt på en markerad linje
  if (sel.length && sel.length <= 6) for (const en of sel) for (let i = 0; i < en.pts.length; i++) { if (Math.hypot(en.pts[i][0] - m[0], en.pts[i][1] - m[1]) < tol * 1.2) { cde.drag = { kind: "grip", en, i, before: cdeSnap([en]), moved: false }; return true; } }
  const hit = cdeHit(m);
  if (hit && cde.sel.has(hit.id) && !e.shiftKey && !e.ctrlKey && !e.metaKey) { cde.drag = { kind: "move", m0: m, before: cdeSnap(sel), moved: false, list: sel, sx: e.clientX, sy: e.clientY }; return true; }
  if (hit) { if (e.shiftKey || e.ctrlKey || e.metaKey) { if (cde.sel.has(hit.id)) cde.sel.delete(hit.id); else cde.sel.add(hit.id); } else cde.sel = new Set([hit.id]); cdeRefresh(); return true; }
  cde.drag = { kind: "box", a: sp, m0: m, add: e.shiftKey || e.ctrlKey || e.metaKey, moved: false, sx: e.clientX, sy: e.clientY }; return true;
}
window.addEventListener("mousemove", e => {
  if (cde.rec && cde.tool === "trim" && !cde.drag && e.target && e.target.closest && e.target.closest("#viewport")) { const m = cdeToModel(stagePoint(e)), h = cdeHit(m), r = h ? dxfTrimCompute(cdeEnts(), h, m) : null, np = r && r.ok ? r.cut : null; if ((np ? 1 : 0) !== (cde.trimPrev ? 1 : 0) || np) { cde.trimPrev = np; renderZonesSoon(); } return; }
  const d = cde.drag; if (!d || !cde.rec) return;
  if (!d.moved && Math.hypot(e.clientX - (d.sx != null ? d.sx : 0), e.clientY - (d.sy != null ? d.sy : 0)) < 3 && d.kind !== "grip") return;
  d.moved = true; const sp = stagePoint(e); let m = cdeToModel(sp);
  if (d.kind === "grip") {
    const sn = cdeSnapPt(m, new Set([d.en.id])); if (sn) m = sn.slice(); else if (e.shiftKey) { const nb = d.en.pts[d.i ? d.i - 1 : 1], dx = m[0] - nb[0], dy = m[1] - nb[1], L = Math.hypot(dx, dy), st = Math.PI / 36, a = Math.round(Math.atan2(dy, dx) / st) * st; m = [nb[0] + Math.cos(a) * L, nb[1] + Math.sin(a) * L]; }
    d.en.pts[d.i] = [cdeR(m[0]), cdeR(m[1])]; cde.ver++;
  } else if (d.kind === "move") {
    let dx = m[0] - d.m0[0], dy = m[1] - d.m0[1]; if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    d.list.forEach((en, i) => { en.pts = d.before[i].pts.map(p => [cdeR(p[0] + dx), cdeR(p[1] + dy)]); }); cde.ver++;
  } else if (d.kind === "box") { d.b = sp; cde.box = { a: d.a, b: sp }; }
  renderZonesSoon();
});
window.addEventListener("mouseup", e => {
  const d = cde.drag; if (!d) return; cde.drag = null; cde.box = null;
  if (!cde.rec) return;
  if (d.kind === "box") {
    if (!d.moved) { if (!d.add) cde.sel = new Set(); }
    else { const a = cdeToModel(d.a), b = cdeToModel(stagePoint(e)), cross = stagePoint(e)[0] < d.a[0], hit = cdeBoxSel(a, b, cross); cde.sel = d.add ? new Set([...cde.sel, ...hit.map(x => x.id)]) : new Set(hit.map(x => x.id)); }
    cdeRefresh(); return;
  }
  if (!d.moved) return;
  const list = d.kind === "grip" ? [d.en] : d.list, after = cdeSnap(list), before = d.before;
  if (JSON.stringify(before) === JSON.stringify(after)) { cdeRefresh(); return; }
  cde.undo.push({ label: d.kind === "grip" ? "flyttad hörnpunkt" : "flyttat", before, after }); cde.redo = []; cde.dirty = true; cde.ver++; cdeRefresh();
});
/* ---- Ritning ---------------------------------------------------------------------------------------------------- */
function cdeBuildPaths() {
  if (cde.paths && cde.pathVer === cde.ver) return cde.paths;
  const by = new Map(), names = cde.rec.layers.map(l => l.name);
  cde.ents.forEach(e => { if (e.del || cde.sel.has(e.id) || !cde.layerOn(e.layer)) return; const col = typeof cadLayerColor === "function" ? cadLayerColor(cde.rec, e.layer, e.color) : (e.color || "#1d4ed8"); let p = by.get(col); if (!p) by.set(col, p = new Path2D());
    p.moveTo(e.pts[0][0] - cde.ox, e.pts[0][1] - cde.oy); for (let i = 1; i < e.pts.length; i++) p.lineTo(e.pts[i][0] - cde.ox, e.pts[i][1] - cde.oy); });
  void names; cde.paths = by; cde.pathVer = cde.ver; return by;
}
function cdeDraw(ctx, fontPx) {
  if (!cde.rec || !plan || !plan.calib) return;
  const o0 = mToPx([0, 0]), ex = mToPx([1, 0]), ey = mToPx([0, 1]), M = [ex[0] - o0[0], ex[1] - o0[1], ey[0] - o0[0], ey[1] - o0[1], o0[0], o0[1]], s = Math.hypot(M[0], M[1]) || 1;
  ctx.save(); ctx.transform(...M); ctx.translate(cde.ox, cde.oy); ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.lineWidth = Math.max(0.6, Number(cde.rec.weight) || 1) * 1.4 / s * (view.scale ? 1 / Math.max(view.scale, 0.05) * 0.8 : 1);
  cdeBuildPaths().forEach((p, col) => { ctx.strokeStyle = col; ctx.stroke(p); });
  // markerade: orange
  const sel = cdeSelEnts(); if (sel.length) { ctx.strokeStyle = "#f59e0b"; ctx.lineWidth *= 2.2; ctx.beginPath(); sel.forEach(e => { ctx.moveTo(e.pts[0][0] - cde.ox, e.pts[0][1] - cde.oy); for (let i = 1; i < e.pts.length; i++) ctx.lineTo(e.pts[i][0] - cde.ox, e.pts[i][1] - cde.oy); }); ctx.stroke(); }
  ctx.restore();
  // texter (oförändrade)
  ctx.save(); const names = cde.rec.layers.map(l => l.name); void names; ctx.textBaseline = "alphabetic";
  cde.texts.forEach(t => { if (!cde.layerOn(t.layer)) return; const p = mToPx([t.x, t.y]), h = t.h * s; if (h < 3) return; ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(-(t.rot || 0) * Math.PI / 180); ctx.font = `${Math.max(3, h)}px "Segoe UI", Arial`; ctx.fillStyle = typeof cadLayerColor === "function" ? cadLayerColor(cde.rec, t.layer, t.color) : "#1d4ed8"; ctx.fillText(t.s.split("\n")[0], 0, 0); ctx.restore(); });
  ctx.restore();
  // hörnpunkter och längdetiketter
  if (sel.length && sel.length <= 6) sel.forEach(e => { e.pts.forEach(p => { const q = mToPx(p), r = Math.max(3, fontPx * 0.28); ctx.fillStyle = "#fff"; ctx.strokeStyle = "#7c3aed"; ctx.lineWidth = Math.max(1.5, r / 3); ctx.beginPath(); ctx.rect(q[0] - r, q[1] - r, r * 2, r * 2); ctx.fill(); ctx.stroke(); });
    const a = mToPx(e.pts[0]), b = mToPx(e.pts[e.pts.length - 1]), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, txt = `${cdeFmt(cdeLen(e.pts))} m`; ctx.font = `700 ${fontPx}px "Segoe UI", Arial`; const w = ctx.measureText(txt).width + fontPx * 0.8;
    ctx.fillStyle = "#7c3aed"; ctx.fillRect(mx - w / 2, my - fontPx * 1.9, w, fontPx * 1.3); ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(txt, mx, my - fontPx * 1.25); });
  if (cde.trimPrev) { ctx.save(); ctx.strokeStyle = "#dc2626"; ctx.lineWidth = Math.max(3, fontPx * 0.3); ctx.setLineDash([fontPx * 0.5, fontPx * 0.3]); ctx.beginPath(); cde.trimPrev.forEach((p, i) => { const q = mToPx(p); if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.stroke(); ctx.restore(); }
  if (cde.box) { const a = cde.box.a, b = cde.box.b, cross = b[0] < a[0]; ctx.save(); ctx.setLineDash([8, 6]); ctx.lineWidth = 2; ctx.strokeStyle = cross ? "#16a34a" : "#2563eb"; ctx.fillStyle = cross ? "rgba(22,163,74,.1)" : "rgba(37,99,235,.1)"; ctx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); ctx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); ctx.restore(); }
}
/* ---- Verktygsrad och tangenter ------------------------------------------------------------------------------------- */
function cdeRefresh() { cdeBarSync(); if (typeof renderZones === "function") renderZones(); }
function cdeBar() {
  if (cde.bar) return;
  const b = document.createElement("div"); b.id = "cdeBar"; b.style.cssText = "position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:9000;background:#0f172a;color:#fff;padding:8px 12px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.35);font:600 12px system-ui,sans-serif;display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;max-width:96vw";
  const inp = (id, w, ph, t = "text") => `<input type="${t}" id="${id}" placeholder="${ph}" style="width:${w}px;padding:3px 6px;border-radius:6px;border:0;font:inherit;color:#0f172a">`, btn = (id, t, tip) => `<button type="button" id="${id}" title="${tip}" style="background:#334155;color:#fff;border:0;border-radius:7px;padding:4px 9px;font:inherit;cursor:pointer">${t}</button>`;
  b.innerHTML = `<span>✎ ${escHtml(cde.rec.name)}</span><span id="cdeInfo" style="opacity:.8">inget markerat</span>
    <span>Längd</span>${inp("cdeLen", 66, "m")}<select id="cdeAnc" title="Vilken ände som ligger still" style="border-radius:6px;border:0;padding:3px"><option value="start">Start still</option><option value="mid">Mitten still</option><option value="end">Slut still</option></select>${btn("cdeLenGo", "Sätt", "Ändra längden till det du skrev")}
    <span>±</span>${inp("cdeGrow", 52, "m")}${btn("cdeGrowGo", "Förläng/korta", "Lägg till (eller dra ifrån med minus) så många meter på varje markerad linje")}
    <span>dX</span>${inp("cdeDx", 52, "m")}<span>dY</span>${inp("cdeDy", 52, "m")}${btn("cdeMove", "Flytta", "Flytta de markerade (eller piltangenterna: 0,1 m, Skift 1 m, Ctrl 0,01 m)")}
    <span>Vrid</span>${inp("cdeRot", 46, "°")}${btn("cdeRotGo", "Vrid", "Vrid runt markeringens mitt (grader, moturs)")}
    ${btn("cdeTrim", "✂ Trimma", "Trimma: tryck på den del av en linje som ska bort (mellan närmaste skärningar). Esc eller knappen igen avslutar verktyget.")}${btn("cdeDel", "Ta bort", "Delete")}${btn("cdeUndo", "↶", "Ångra (Ctrl+Z)")}${btn("cdeRedo", "↷", "Gör om (Ctrl+Y)")}
    <button type="button" id="cdeSave" style="background:#2563eb;color:#fff;border:0;border-radius:7px;padding:4px 10px;font:inherit;cursor:pointer" title="Sparar en ny DXF (originalet ändras aldrig) och lägger den som nytt lager">Spara som ny DXF</button>${btn("cdeEnd", "Avsluta", "Avsluta redigeringen")}`;
  document.body.appendChild(b); cde.bar = b;
  const q = s => b.querySelector(s), num = s => { const v = parseFloat(String(q(s).value).replace(",", ".")); return isFinite(v) ? v : null; };
  b.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Enter") { const t = e.target.id; if (t === "cdeLen") q("#cdeLenGo").click(); else if (t === "cdeGrow") q("#cdeGrowGo").click(); else if (t === "cdeRot") q("#cdeRotGo").click(); else q("#cdeMove").click(); } });
  q("#cdeAnc").onchange = e => { cde.anchor = e.target.value; };
  q("#cdeLenGo").onclick = () => { const v = num("#cdeLen"); if (v == null || v <= 0) { setSaveStatus("⚠ Skriv en längd i meter."); return; } cdeDoLen(v); };
  q("#cdeGrowGo").onclick = () => { const v = num("#cdeGrow"); if (v == null || v === 0) { setSaveStatus("⚠ Skriv hur många meter (minus = korta)."); return; } cdeDoGrow(v); };
  q("#cdeMove").onclick = () => { const dx = num("#cdeDx") || 0, dy = num("#cdeDy") || 0; if (dx || dy) cdeDoMove(dx, dy); };
  q("#cdeRotGo").onclick = () => { const v = num("#cdeRot"); if (v) cdeDoRotate(v); };
  q("#cdeTrim").onclick = () => { cde.tool = cde.tool === "trim" ? null : "trim"; cde.trimPrev = null; cdeBarSync(); renderZonesSoon(); };
  q("#cdeDel").onclick = cdeDoDelete; q("#cdeUndo").onclick = cdeUndo; q("#cdeRedo").onclick = cdeRedo;
  q("#cdeSave").onclick = async () => { const bt = q("#cdeSave"); bt.disabled = true; try { await cdeSave(); } catch (e) { alert("Kunde inte spara: " + e.message); } if (bt.isConnected) bt.disabled = false; };
  q("#cdeEnd").onclick = () => cdeEnd();
  cdeBarSync();
}
function cdeBarSync() {
  const b = cde.bar; if (!b) return; const L = cdeSelEnts(), info = b.querySelector("#cdeInfo");
  info.textContent = !L.length ? `${cdeEnts().length} linjer – tryck på en linje eller dra en ruta` : L.length === 1 ? `1 linje · ${cdeFmt(cdeLen(L[0].pts))} m · ${L[0].pts.length} punkter · ${L[0].layer}` : `${L.length} linjer · totalt ${cdeFmt(L.reduce((a, e) => a + cdeLen(e.pts), 0))} m`;
  const len = b.querySelector("#cdeLen"); if (document.activeElement !== len) len.value = L.length === 1 ? cdeFmt(cdeLen(L[0].pts)) : "";
  b.querySelector("#cdeLen").disabled = L.length !== 1; [...b.querySelectorAll("#cdeLenGo,#cdeGrowGo,#cdeMove,#cdeRotGo,#cdeDel")].forEach(x => { x.disabled = !L.length; x.style.opacity = L.length ? 1 : .45; }); b.querySelector("#cdeLenGo").disabled = L.length !== 1;
  { const t = b.querySelector("#cdeTrim"); if (t) { t.style.background = cde.tool === "trim" ? "#dc2626" : "#334155"; } const vp = document.getElementById("viewport"); if (vp) vp.style.cursor = cde.tool === "trim" ? "crosshair" : ""; }
  b.querySelector("#cdeUndo").disabled = !cde.undo.length; b.querySelector("#cdeRedo").disabled = !cde.redo.length;
}
function cdeBindKeys() {
  if (cde.keyH) return;
  cde.keyH = e => {
    if (!cde.rec) return; const t = e.target && e.target.tagName; if (/^(INPUT|TEXTAREA|SELECT)$/.test(t || "")) return;
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") { stop(); cdeUndo(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.shiftKey && e.key.toLowerCase() === "z"))) { stop(); cdeRedo(); return; }
    if (e.key === "Delete" || e.key === "Backspace") { if (cdeSelEnts().length) { stop(); cdeDoDelete(); } return; }
    if (e.key === "Escape") { stop(); if (cde.tool) { cde.tool = null; cde.trimPrev = null; cdeBarSync(); renderZonesSoon(); return; } if (cde.sel.size) { cde.sel = new Set(); cdeRefresh(); } else cdeEnd(); return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (arrows[e.key] && cdeSelEnts().length) { stop(); const st = e.ctrlKey || e.metaKey ? 0.01 : e.shiftKey ? 1 : 0.1; cdeDoMove(arrows[e.key][0] * st, arrows[e.key][1] * st); }
  };
  window.addEventListener("keydown", cde.keyH, true);
}
/* ---- Spara som ny DXF ---------------------------------------------------------------------------------------------- */
function cdeDxfText() {
  const rec = cde.rec, aciOf = {}; rec.layers.forEach(l => { aciOf[l.name] = dxfAci(l.color || "#000000"); });
  const ents = cde.ents.filter(e => !e.del).map(e => { const lc = (rec.layers.find(l => l.name === e.layer) || {}).color; return { t: "PLINE", layer: e.layer, pts: e.pts, aci: lc && e.color && e.color.toLowerCase() !== String(lc).toLowerCase() ? dxfAci(e.color) : 0 }; });
  cde.texts.forEach(t => { const ha = { l: 0, c: 1, r: 2 }[t.al[0]] || 0, va = { b: 0, m: 2, t: 3 }[t.al[1]] || 0, a = (t.rot || 0) * Math.PI / 180;
    String(t.s).split("\n").forEach((ln, k) => { if (!ln.trim()) return; const d = k * t.h * 1.25; ents.push({ t: "TEXT", layer: t.layer, x: t.x + d * Math.sin(a), y: t.y - d * Math.cos(a), z: 0, h: t.h || 0.25, s: ln, rot: t.rot || 0, ha, va }); }); });
  return dxfWrite(ents, rec.layers.map(l => l.name), aciOf);
}
async function cdeSave() {
  const rec = cde.rec; if (!rec) return null;
  if (!cde.dirty && !(await uiConfirm("Inget är ändrat. Spara ändå som en ny DXF?"))) return null;
  const d = new Date(), p2 = x => String(x).padStart(2, "0");
  const name = `${rec.name} redigerad ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} kl ${p2(d.getHours())}.${p2(d.getMinutes())}.${p2(d.getSeconds())}.dxf`.replace(/[\\/:*?"<>|]/g, "-");
  const file = new File([dxfCp1252(cdeDxfText())], name, { type: "application/dxf" }), key = "cdesave"; busyProgress(key, `Sparar ${name}`, 0.1);
  try {
    let tc = ""; if (window.opener && !window.opener.closed) { try { const up = await askOpener("tcUpload", { folder: "Lägesplan", files: [file] }, 10 * 60 * 1000); tc = ` och i Trimble Connect (${(up && up.folder) || "Lägesplan"})`; } catch (e) { tc = ` – men inte i Trimble Connect (${e.message})`; } }
    busyProgress(key, `Sparar ${name}`, 0.6);
    const before = new Set(cads().map(r => r.id)); await addDxfFiles([file], { noTc: true });
    const added = cads().find(r => !before.has(r.id)); busyProgress(key, "", null);
    if (!added) throw new Error("den nya ritningen kunde inte läggas in i planen");
    ls("cad:" + rec.id).visible = false; if (typeof saveLayerState === "function") saveLayerState();
    await cdeEnd(true); if (typeof renderCadSettings === "function") renderCadSettings(); if (typeof renderLayerPanel === "function") try { renderLayerPanel(); } catch (e) { /* */ }
    setSaveStatus(`✎ Sparad som ny DXF: ${name}${tc}. Originalet ${rec.name} är orört (släckt).`);
    return { name, id: added.id };
  } catch (e) { busyProgress(key, "", null); throw e; }
}
