/* Utskriftslayout – tabeller på bladet (Victor 2026-10-11, efter Bonsais "schedules on sheets" och ifc-lite lists):
   förteckning över etableringsobjekt med datum, mängder per zon eller leveranser. Tabellen hämtar sina rader från
   lägesplanen när bladet ritas, så den följer alltid planen. På papperet: vektor i PDF:en (skarp text).

   el: { type: "table", src: "etab" | "place" | "zones" | "deliv", title, size (pt), when ("date" | "all"),
         maxRows, head (färg), hide: { kolumn: true } } */

const PT_SRC = {
  etab: { label: "Etablering på planen (2D)", cols: [["type", "Typ"], ["name", "Namn"], ["size", "Mått"], ["area", "Yta m²", 1], ["from", "Från"], ["to", "Till"]] },
  place: { label: "Etablering i 3D", cols: [["type", "Typ"], ["name", "Namn"], ["size", "L × B × H m"], ["from", "Från"], ["to", "Till"]] },
  zones: { label: "Zoner – mängder och status", cols: [["zone", "Zon"], ["n", "Objekt", 1], ["phase", "Status"], ["pct", "Klart", 1], ["hours", "Timmar", 1], ["area", "Yta m²", 1]] },
  deliv: { label: "Leveranser", cols: [["date", "Datum"], ["time", "Tid"], ["veh", "Fordon"], ["what", "Vad"], ["ue", "UE"], ["zone", "Plats"]] },
};
const ptNum = (v, d = 0) => (v == null || !isFinite(v) ? "" : Number(v).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d }));
const ptDate = d => (d && typeof shortDate === "function" ? shortDate(d) : d || "");
function ptPrintDate() { return ($("dateInput") && $("dateInput").value) || (typeof todayIso === "function" ? todayIso() : ""); }

/* Raderna för tabellen: [{ kolumn: text }] i källans ordning. */
function ptRows(el) {
  const src = el.src || "etab", d = ptPrintDate(), all = el.when === "all";
  const items = typeof siteItems !== "undefined" ? siteItems : [];
  if (src === "etab") {
    const skip = new Set(["note", "sketch", "crew", "delivery", "lift", "wxday", "wxweek", "ue"]);
    return items.filter(x => typeof isSiteObj === "function" && isSiteObj(x) && !skip.has(x.type) && (all || (typeof siteShown === "function" ? siteShown(x) : true)))
      .map(x => {
        const k = (typeof SITE_KINDS !== "undefined" && SITE_KINDS[x.type]) || { label: x.type }, sym = x.type === "symbol" && typeof SYMBOLS !== "undefined" ? SYMBOLS[x.sym] : null;
        let size = "", area = null;
        try {
          if (typeof isRect === "function" && isRect(x)) { const g = rectGeom(x); size = `${ptNum(g.w, 1)} × ${ptNum(g.h, 1)} m`; area = g.w * g.h; }
          else if (x.type === "crane") size = `R ${ptNum(typeof craneRadius === "function" ? craneRadius(x) : x.radius, 0)} m`;
          else if ((x.type === "fence" || x.type === "route") && x.pts) size = `${ptNum(polyLength(x.pts), 0)} m`;
          else if (x.type === "barrier" && x.pts) { area = polyAreaM(x.pts); size = `${ptNum(polyLength([...x.pts, x.pts[0]]), 0)} m omkrets`; }
          else if (x.type === "gate") size = `${ptNum(Number(x.w) || 5, 1)} m`;
        } catch (e) { /* utan mått */ }
        return { type: sym ? sym.label : k.label, name: x.name || "", size, area: area != null ? ptNum(area, 0) : "", from: ptDate(x.from), to: ptDate(x.to), _s: (sym ? sym.label : k.label) + (x.name || "") };
      }).sort((a, b) => a._s.localeCompare(b._s, "sv", { numeric: true }));
  }
  if (src === "place") {
    const list = typeof placements !== "undefined" ? placements : [];
    return list.filter(p => all || ((!p.start || p.start <= d) && (!p.end || p.end >= d))).map(p => {
      const lib = typeof placeLib === "function" ? placeLib(p.type) || {} : {};
      const f = v => ptNum(Number(v) || 0, 1);
      return { type: lib.label || p.type, name: p.name || "", size: lib.fence ? "" : `${f(p.L)} × ${f(p.B)} × ${f(p.H)}`, from: ptDate(p.start), to: ptDate(p.end), _s: (lib.label || "") + (p.name || "") };
    }).sort((a, b) => a._s.localeCompare(b._s, "sv", { numeric: true }));
  }
  if (src === "zones") {
    const zs = (typeof plan !== "undefined" && plan && plan.zones) || [];
    return zs.map(z => {
      const st = z._status || (typeof zoneStatus === "function" ? zoneStatus(z) : { items: [] }), zi = st.items || [];
      const hours = zi.reduce((a, it) => a + (Array.isArray(it.resources) ? it.resources.reduce((s, r) => s + (Number(r.hours) || 0), 0) : 0), 0);
      const area = typeof zoneAreaM2 === "function" ? zoneAreaM2(z) : null;
      return { zone: [z.code, z.name].filter(Boolean).join(" "), n: ptNum(zi.length), phase: (typeof PHASE_LABELS !== "undefined" && PHASE_LABELS[st.phase]) || "", pct: st.progress != null ? `${st.progress} %` : "",
        hours: hours ? ptNum(hours, 0) : "", area: area != null ? ptNum(area, 0) : "", _s: String(z.code || z.name || "") };
    }).filter(r => all || r.n !== "0").sort((a, b) => a._s.localeCompare(b._s, "sv", { numeric: true }));
  }
  if (src === "deliv") {
    const wk = iso => { const t = new Date(iso + "T12:00:00"); const day = (t.getDay() + 6) % 7; t.setDate(t.getDate() - day); return t.toISOString().slice(0, 10); };
    return items.filter(x => x.type === "delivery" && (all || (el.when === "week" ? x.from && wk(x.from) === wk(d) : x.from === d)))
      .map(x => {
        const V = (typeof VEHICLES !== "undefined" && VEHICLES[x.veh]) || {}, ue = typeof ueById === "function" ? ueById(x.ue) : null;
        let zone = ""; try { zone = typeof placeOf === "function" ? placeOf(x) : ""; } catch (e) { zone = ""; }
        return { date: ptDate(x.from), time: x.time || "", veh: V.label || "", what: x.what || "", ue: ue ? (typeof ueShort === "function" ? ueShort(ue) : ue.name || "") : "", zone, _s: (x.from || "") + " " + (x.time || "") };
      }).sort((a, b) => a._s.localeCompare(b._s));
  }
  return [];
}
function ptCols(el) { const def = PT_SRC[el.src || "etab"] || PT_SRC.etab, hide = el.hide || {}; return def.cols.filter(([k]) => !hide[k]); }
/* Kolumnbredder efter innehållet (rubrik + rader), utjämnade till tabellens bredd. */
function ptLayout(measure, cols, rows, W) {
  const want = cols.map(([k, lab]) => Math.max(measure(lab, true), ...rows.map(r => measure(String(r[k] || ""), false))) + measure("M", false) * 0.9);
  const sum = want.reduce((a, b) => a + b, 0) || 1;
  return want.map(w => w / sum * W);
}
function ptFit(measure, s, w) {
  if (measure(s) <= w) return s;
  let t = s; while (t.length > 1 && measure(t + "…") > w) t = t.slice(0, -1);
  return t + "…";
}
const PT_DEF = { title: "", src: "etab", size: 7, when: "date", maxRows: 40, head: "#1f3b73" };

/* På skärmen och i bilder (canvas). */
function drawPrTable(ctx, el, X, Y, W, H, pt) {
  const fs = pt(el.size || 7), rh = fs * 1.7, cols = ptCols(el), rowsAll = ptRows(el);
  ctx.save(); ctx.textBaseline = "middle";
  let top = Y;
  if (el.title) { ctx.fillStyle = "#000"; ctx.font = `bold ${fs * 1.15}px Helvetica, Arial`; ctx.textAlign = "left"; ctx.fillText(el.title, X, top + fs * 0.75); top += fs * 1.9; }
  if (!cols.length) { ctx.restore(); return; }
  const room = Math.max(0, Math.floor((Y + H - top) / rh) - 1), max = Math.min(room, Math.max(1, Number(el.maxRows) || 40));
  const more = rowsAll.length > max ? rowsAll.length - (max - 1) : 0, rows = more ? rowsAll.slice(0, max - 1) : rowsAll;
  const measure = (s, b) => { ctx.font = `${b ? "bold " : ""}${fs}px Helvetica, Arial`; return ctx.measureText(s).width; };
  const cw = ptLayout(measure, cols, rows, W), pad = fs * 0.4;
  // Rubrikraden.
  ctx.fillStyle = el.head || PT_DEF.head; ctx.fillRect(X, top, W, rh);
  ctx.fillStyle = "#fff"; ctx.font = `bold ${fs}px Helvetica, Arial`;
  let x = X; cols.forEach(([k, lab, num], i) => { ctx.textAlign = num ? "right" : "left"; ctx.fillText(ptFit(s => measure(s, true), lab, cw[i] - pad * 2), num ? x + cw[i] - pad : x + pad, top + rh / 2); x += cw[i]; });
  ctx.font = `${fs}px Helvetica, Arial`;
  rows.forEach((r, ri) => {
    const y = top + rh * (ri + 1);
    if (ri % 2) { ctx.fillStyle = "#f1f5f9"; ctx.fillRect(X, y, W, rh); }
    ctx.fillStyle = "#111827"; x = X;
    cols.forEach(([k, , num], i) => { ctx.textAlign = num ? "right" : "left"; ctx.fillText(ptFit(s => measure(s, false), String(r[k] || ""), cw[i] - pad * 2), num ? x + cw[i] - pad : x + pad, y + rh / 2); x += cw[i]; });
  });
  const n = rows.length + (more ? 1 : 0);
  if (more) { ctx.fillStyle = "#64748b"; ctx.textAlign = "left"; ctx.font = `italic ${fs}px Helvetica, Arial`; ctx.fillText(`… och ${more} till`, X + pad, top + rh * (rows.length + 1) + rh / 2); }
  if (!rows.length && !more) { ctx.fillStyle = "#64748b"; ctx.textAlign = "left"; ctx.fillText("Inga rader för valt datum.", X + pad, top + rh * 1.5); }
  ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = Math.max(0.5, fs * 0.05);
  ctx.strokeRect(X, top, W, rh * (Math.max(1, n) + 1));
  ctx.restore();
}

/* I PDF:en: samma tabell som vektorer (text som text). x, y, w, h i mm; k = formatets skala. */
function pdfPrTable(doc, el, x, y, w, h, k) {
  const PTM = typeof PT_MM !== "undefined" ? PT_MM : 0.3528, fsPt = (el.size || 7) * k, fs = fsPt * PTM, rh = fs * 1.7, cols = ptCols(el), rowsAll = ptRows(el);
  const rgb = hex => (typeof hexRgb === "function" ? hexRgb(hex) : [31, 59, 115]);
  let top = y;
  doc.setTextColor(0);
  if (el.title) { doc.setFont("helvetica", "bold"); doc.setFontSize(fsPt * 1.15); doc.text(el.title, x, top + fs * 0.75, { baseline: "middle" }); top += fs * 1.9; }
  if (!cols.length) return;
  const room = Math.max(0, Math.floor((y + h - top) / rh) - 1), max = Math.min(room, Math.max(1, Number(el.maxRows) || 40));
  const more = rowsAll.length > max ? rowsAll.length - (max - 1) : 0, rows = more ? rowsAll.slice(0, max - 1) : rowsAll;
  const measure = (s, b) => { doc.setFont("helvetica", b ? "bold" : "normal"); doc.setFontSize(fsPt); return doc.getTextWidth(s); };
  const cw = ptLayout(measure, cols, rows, w), pad = fs * 0.4;
  doc.setFillColor(...rgb(el.head || PT_DEF.head)); doc.rect(x, top, w, rh, "F");
  doc.setTextColor(255, 255, 255);
  let cx = x;
  cols.forEach(([k2, lab, num], i) => { const t = ptFit(s => measure(s, true), lab, cw[i] - pad * 2); measure(t, true); doc.text(t, num ? cx + cw[i] - pad : cx + pad, top + rh / 2, { baseline: "middle", align: num ? "right" : "left" }); cx += cw[i]; });
  rows.forEach((r, ri) => {
    const ry = top + rh * (ri + 1);
    if (ri % 2) { doc.setFillColor(241, 245, 249); doc.rect(x, ry, w, rh, "F"); }
    doc.setTextColor(17, 24, 39); cx = x;
    cols.forEach(([k2, , num], i) => { const t = ptFit(s => measure(s, false), String(r[k2] || ""), cw[i] - pad * 2); measure(t, false); doc.text(t, num ? cx + cw[i] - pad : cx + pad, ry + rh / 2, { baseline: "middle", align: num ? "right" : "left" }); cx += cw[i]; });
  });
  if (more) { doc.setTextColor(100, 116, 139); doc.setFont("helvetica", "italic"); doc.setFontSize(fsPt); doc.text(`… och ${more} till`, x + pad, top + rh * (rows.length + 1) + rh / 2, { baseline: "middle" }); }
  doc.setDrawColor(148, 163, 184); doc.setLineWidth(0.15 * k);
  doc.rect(x, top, w, rh * (Math.max(1, rows.length + (more ? 1 : 0)) + 1));
  doc.setTextColor(0);
}

/* Sidopanelen. */
function prTableHtml(el) {
  const esc = escHtml, src = el.src || "etab", hide = el.hide || {};
  const whens = src === "deliv" ? [["date", "Utskriftens datum"], ["week", "Utskriftens vecka"], ["all", "Alla"]] : src === "zones" ? [["date", "Zoner med objekt"], ["all", "Alla zoner"]] : [["date", "Det som gäller vid utskriftens datum"], ["all", "Alla"]];
  return `<label>Innehåll</label><select data-f="src">${Object.entries(PT_SRC).map(([k, v]) => `<option value="${k}"${src === k ? " selected" : ""}>${esc(v.label)}</option>`).join("")}</select>
    <label>Rader</label><select data-f="when">${whens.map(([v, l]) => `<option value="${v}"${(el.when || "date") === v ? " selected" : ""}>${l}</option>`).join("")}</select>
    <label>Rubrik</label><input type="text" data-f="title" value="${esc(el.title || "")}" placeholder="t.ex. ETABLERING" />
    <div class="pr-grid4"><div><label>Storlek pt</label><input type="number" step="0.5" data-f="size" data-num="1" value="${el.size || 7}" /></div><div><label>Högst rader</label><input type="number" step="1" data-f="maxRows" data-num="1" value="${el.maxRows || 40}" /></div><div><label>Rubrikrad</label><input type="color" data-f="head" value="${esc(el.head || PT_DEF.head)}" /></div></div>
    <label>Kolumner</label><div class="pr-tcols">${PT_SRC[src].cols.map(([k, l]) => `<label class="check"><input type="checkbox" data-ptcol="${k}"${hide[k] ? "" : " checked"} /> ${esc(l)}</label>`).join("")}</div>
    <div class="hint">${ptRows(el).length} rader just nu. Tabellen hämtar raderna från lägesplanen när bladet ritas och skrivs ut.</div>`;
}
function prTableBind(box, el) {
  box.querySelectorAll("[data-ptcol]").forEach(c => { c.onchange = () => { pushUndo(); el.hide = { ...(el.hide || {}) }; if (c.checked) delete el.hide[c.dataset.ptcol]; else el.hide[c.dataset.ptcol] = true; drawPrintPage(); }; });
  const s = box.querySelector('[data-f="src"]');
  if (s) s.addEventListener("change", () => {
    el.hide = {}; el.title = el.title || PT_SRC[el.src].label.toUpperCase();
    // Etableringen i 3D hämtas först när den behövs.
    if (el.src === "place" && typeof place3dLoad === "function" && typeof placements !== "undefined" && !placements.length) place3dLoad({ editor: true }).then(() => { drawPrintPage(); renderPrintProps(); }).catch(() => {});
    setTimeout(renderPrintProps, 0);
  });
}
