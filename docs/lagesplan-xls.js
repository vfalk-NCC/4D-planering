/* Excel-planeringen som lager i Powerproject-lägesplanen (Victor 2026-10-12: "Kan jag på något sätt visa
   excel-objekten samtidigt när jag har PP-lägesplanen igång? För där har jag kopplat varje fundament" –
   "färga efter Excels datum").

   – Bara när Powerproject är vald: lagret "Excel-planeringen" under Lager (tänd/släck, genomskinlighet, ritordning).
   – Läser Excel-tidplanens objekt och positioner (projects/<id>/plan_items.json och plan_item_positions.json) –
     bara läsning, inget sparas och inget kopplas om. De två tidplanerna blandas aldrig ihop.
   – Varje Excel-objekt som en ring i Excels statusfärg på valt datum (PP-objekten är fyllda prickar).
   – Hovra över en ring: aktiviteten, datumen och att den kommer från Excel-planeringen. */

const xls = { items: null, positions: null, loading: null, err: "", posPdf: null, posKey: "" };
const xlsActive = () => typeof planSource !== "undefined" && planSource === "pp";
const xlsPath = f => `projects/${encodeURIComponent(projectId)}/${f}`;

function xlsLoad() {
  if (!xlsActive() || xls.items || xls.loading) return xls.loading;
  xls.loading = Promise.all([ghReadJSON(token, xlsPath("plan_items.json")), ghReadJSON(token, xlsPath("plan_item_positions.json")).catch(() => [])])
    .then(([its, pos]) => { xls.items = Array.isArray(its) ? its : []; xls.positions = Array.isArray(pos) ? pos : []; xls.err = ""; xls.posPdf = null; })
    .catch(e => { xls.err = e.message; xls.items = []; xls.positions = []; })
    .finally(() => { xls.loading = null; if (typeof renderZones === "function") renderZones(); if (typeof renderLayerPanel === "function") renderLayerPanel(); });
  return xls.loading;
}
/* Excel-objekten med position på arbetsytan (och vald nivå): [{ it, pt }]. */
function xlsObjects() {
  if (!xlsActive() || !plan || !plan.calib || !xls.items || !xls.positions) return [];
  const [z0, z1] = typeof levelRange === "function" ? levelRange() : [null, null];
  const key = `${plan.id}|${JSON.stringify(plan.calib)}|${z0}|${z1}|${xls.positions.length}`;
  if (xls.posPdf && xls.posKey === key) return xls.posPdf;
  const byId = new Map(xls.positions.map(p => [p.id, p]));
  xls.posPdf = xls.items.filter(it => byId.has(it.id)).map(it => {
    const p = byId.get(it.id), zc = (p.z0 + p.z1) / 2;
    if ((z0 !== null && zc < z0) || (z1 !== null && zc > z1)) return null;
    return { it, pt: modelToPdf(p.x, p.y), zc };
  }).filter(Boolean).sort((a, b) => a.zc - b.zc);
  xls.posKey = key;
  return xls.posPdf;
}
const xlsCount = () => xlsObjects().length;

/* Släcka Excel-objekt (Victor 2026-10-12: "möjlighet att släcka ner objekt från lager 'Excel lägesplanering' fast
   jag är inne i PP-planeringen"): lagret fälls ut med ett område per rad och dess aktiviteter under; 👁 släcker
   och tänder. Sparas i webbläsaren per projekt – bara visningen, inget i planeringen ändras. */
const xlsHideKey = () => `lagesplan-xlshide-${projectId}`;
let xlsHid = null;
function xlsHidden() {
  if (xlsHid) return xlsHid;
  try { const a = JSON.parse(localStorage.getItem(xlsHideKey()) || "[]"); xlsHid = new Set(Array.isArray(a) ? a : []); } catch (e) { xlsHid = new Set(); }
  return xlsHid;
}
function xlsSetHidden(keys, hide) {
  const h = xlsHidden();
  keys.forEach(k => { if (hide) h.add(k); else h.delete(k); });
  try { localStorage.setItem(xlsHideKey(), JSON.stringify([...h])); } catch (e) { /* bara minnet */ }
  if (typeof renderZones === "function") renderZones();
  if (typeof renderLayerPanel === "function") renderLayerPanel();
}
const xlsArea = it => String(it.area || "").trim() || "(utan område)";
const xlsFamKey = it => it.group_id ? "g:" + it.group_id : "f:" + xlsArea(it) + "||" + String(it.activity || it.object_name || "").trim();
const xlsFamName = it => String(it.activity || it.object_name || "Aktivitet").trim();
/* Detaljerat namn (Victor 2026-10-12: "Jag måste ha mer detaljerad namn"): objektets namn + aktiviteten, och för en
   grupp med flera objekt de första objektnamnen. */
const xlsObjName = it => String(it.object_name || "").trim();
function xlsFamLabel(rows) {
  const act = xlsFamName(rows[0]), names = [...new Set(rows.map(xlsObjName).filter(n => n && n !== act))];
  if (!names.length) return act;
  const short = names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", ");
  return `${short} – ${act}`;
}
const xlsIsHidden = it => { const h = xlsHidden(); return h.size > 0 && (h.has("a:" + xlsArea(it)) || h.has(xlsFamKey(it)) || h.has("i:" + it.id)); };
/* De som syns (släckta borträknade). */
const xlsShown = () => { const all = xlsObjects(); return xlsHidden().size ? all.filter(o => !xlsIsHidden(o.it)) : all; };
/* Områdena med sina aktiviteter, för lagerlistan. */
function xlsTree() {
  const areas = new Map();
  xlsObjects().forEach(o => {
    const a = xlsArea(o.it), k = xlsFamKey(o.it);
    if (!areas.has(a)) areas.set(a, new Map());
    const fams = areas.get(a);
    if (!fams.has(k)) fams.set(k, { key: k, it: o.it, rows: [] });
    fams.get(k).rows.push(o.it);
  });
  const cmp = (x, y) => x.localeCompare(y, "sv", { numeric: true });
  return [...areas].sort((x, y) => cmp(x[0], y[0])).map(([area, fams]) => ({ area, fams: [...fams.values()].sort((x, y) => cmp(xlsFamName(x.it), xlsFamName(y.it))) }));
}
function xlsRowsHtml(opts = {}) {
  const h = xlsHidden(), day = $("dateInput").value || todayIso();
  return xlsTree().map(a => {
    const aOff = h.has("a:" + a.area), open = layerState["ulopen:__xls:" + a.area] === true, n = a.fams.reduce((s, f) => s + f.rows.length, 0);
    const famRows = open ? a.fams.map(f => {
      const off = aOff || h.has(f.key), ph = zonePhase(f.rows, day), nOff = off ? 0 : f.rows.filter(it => h.has("i:" + it.id)).length, lbl = xlsFamLabel(f.rows);
      return `<div class="layer-row sub xls-row xls-fam${opts.inFolder ? " in-folder" : ""}${opts.hidden ? " hidden" : ""}${off ? " off" : ""}" data-xls="${escHtml(f.key)}" style="padding-left:34px">
        <span class="oi-dot" style="background:${ph === "ingen" ? "#fff" : phaseColor(ph)}"></span>
        <span class="ln" title="${escHtml([xlsFamName(f.it), a.area, [...new Set(f.rows.map(xlsObjName).filter(Boolean))].join(", "), `${f.rows.length} objekt`].filter(Boolean).join(" · "))}">${escHtml(lbl)}${f.rows.length > 1 ? ` <small>${f.rows.length} obj.</small>` : ""}${nOff ? ` <small>(${nOff} släckta)</small>` : ""}</span>
        <button type="button" class="oi-eye xls-eye" ${aOff ? "disabled" : ""} title="${aOff ? "Området är släckt" : off ? "Tänd" : "Släck"}">${off ? "🙈" : "👁"}</button></div>`;
    }).join("") : "";
    return `<div class="layer-row sub xls-row xls-area${opts.inFolder ? " in-folder" : ""}${opts.hidden ? " hidden" : ""}${aOff ? " off" : ""}" data-xls="${escHtml("a:" + a.area)}">
      <button class="cad-toggle ul-toggle" data-ul="${escHtml("__xls:" + a.area)}" title="Visa aktiviteterna">${open ? "▾" : "▸"}</button>
      <span class="ln" title="${escHtml(a.area)}">${escHtml(a.area)} <small>${n}</small></span>
      <button type="button" class="oi-eye xls-eye" title="${aOff ? "Tänd området" : "Släck området"}">${aOff ? "🙈" : "👁"}</button></div>` + famRows;
  }).join("");
}
function bindXlsRows(el) {
  el.querySelectorAll(".xls-row .xls-eye").forEach(b => { b.onclick = e => {
    e.stopPropagation(); const row = b.closest(".xls-row"), k = row.dataset.xls, hide = !row.classList.contains("off");
    // Tända en aktivitet tänder också dess enskilt släckta objekt.
    const extra = !hide && k[0] !== "a" ? xlsObjects().filter(o => xlsFamKey(o.it) === k).map(o => "i:" + o.it.id) : [];
    xlsSetHidden([k, ...extra], hide);
  }; });
}
document.addEventListener("DOMContentLoaded", () => {
  const orig = renderLayerPanel;
  renderLayerPanel = function () { const r = orig.apply(this, arguments); const el = $("layerList"); if (el) bindXlsRows(el); return r; };
});
function xlsPhase(it) {
  const at = $("dateInput").value || todayIso(), warn = Number.isFinite(settings.warningDaysBeforeEnd) ? settings.warningDaysBeforeEnd : 7;
  return computeItemPhase(it, at, warn) || fallbackPhase(it);
}
let xlsRingPx = 5;
/* Fyllda markeringar i stället för ringar (Victor 2026-10-12: "det syns inte så bra just nu"). Per webbläsare. */
const XLS_FILL_KEY = "lagesplan-xlsfill";
function xlsFilled() { try { return localStorage.getItem(XLS_FILL_KEY) === "1"; } catch (e) { return false; } }
function setXlsFilled(on) { try { localStorage.setItem(XLS_FILL_KEY, on ? "1" : "0"); } catch (e) { /* privat läge */ } if (typeof renderZones === "function") renderZones(); }
document.addEventListener("change", e => { if (e.target && e.target.classList && e.target.classList.contains("xls-fill")) setXlsFilled(e.target.checked); });
/* Ringarna (anropas från renderZones med xlsCanvas). */
function drawXls(ctx, fontPx) {
  if (!xlsActive() || !layerVisible("xls")) return;
  if (!xls.items) { xlsLoad(); return; }
  const list = xlsShown();
  if (!list.length) return;
  const r = Math.max(2.5, (typeof objDotRadius === "function" ? objDotRadius(ctx, fontPx) : fontPx / 4) * 0.85);
  xlsRingPx = r;
  ctx.save();
  const fill = xlsFilled();
  for (const o of list) {
    const color = phaseColor(xlsPhase(o.it)), [x, y] = toPx(o.pt);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) {
      // Fylld prick i statusfärgen med vit kant och en tunn mörk ytterkant (syns på både ljust och mörkt underlag).
      ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.28); ctx.strokeStyle = "#ffffff"; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r + Math.max(1, r * 0.28) * 0.75, 0, Math.PI * 2);
      ctx.lineWidth = Math.max(0.8, r * 0.12); ctx.strokeStyle = shade(color, -0.5); ctx.stroke();
      continue;
    }
    ctx.lineWidth = Math.max(1.2, r * 0.45); ctx.strokeStyle = "#ffffff"; ctx.stroke(); // vit kant under – syns på mörkt underlag
    ctx.lineWidth = Math.max(1, r * 0.3); ctx.strokeStyle = color; ctx.stroke();
  }
  ctx.restore();
}
/* Excel-objekten under pekaren (PDF-punkt). */
function xlsAt(pdfPt) {
  if (!xlsActive() || !layerVisible("xls")) return [];
  const tol = Math.max(xlsRingPx * 1.3, 6 / view.scale) / renderScale;
  return xlsShown().filter(o => Math.hypot(o.pt[0] - pdfPt[0], o.pt[1] - pdfPt[1]) <= tol);
}
function xlsTipHtml(list) {
  const o = list[0], it = o.it, ph = xlsPhase(it);
  const d = s => (s ? String(s).slice(0, 10) : "–");
  return `<div style="font-size:11px;opacity:.75;margin-bottom:2px;">📊 Excel-planeringen</div><b>${escHtml(it.object_name || it.name || "Objekt")}</b>`
    + `<div>${escHtml(it.activity || "")}</div>`
    + `<div><span style="display:inline-block;width:9px;height:9px;border-radius:50%;border:2px solid ${phaseColor(ph)};margin-right:4px;vertical-align:-1px;"></span>${escHtml(PHASE_LABELS[ph] || ph)} · ${d(it.start_date)} – ${d(it.end_date)}${Number.isFinite(Number(it.progress)) && it.progress !== "" && it.progress != null ? ` · ${Math.round(Number(it.progress))} %` : ""}</div>`
    + (list.length > 1 ? `<div style="margin-top:6px;opacity:.75;">+ ${list.length - 1} till här</div>` : "");
}
/* Namnen (samma etiketter som objekten, "Visa namn"): Excel-objekten som { it, center, xls }. */
function xlsLabelObjects() {
  if (!xlsActive() || !layerVisible("xls") || !xls.items) return [];
  return xlsShown().map(o => ({ it: o.it, center: o.pt, members: [o.it], xls: true }));
}

/* Högerklick på ett Excel-objekt på planen (Victor 2026-10-12: "kunna högerklicka och släcka i planen"). */
function xlsOpenMenu(list, e) {
  let m = $("labelMenu");
  if (!m) { m = document.createElement("div"); m.id = "labelMenu"; m.className = "label-menu"; document.body.appendChild(m); document.addEventListener("mousedown", ev => { if (!ev.target.closest("#labelMenu")) m.classList.add("hidden"); }); }
  const its = list.map(o => o.it), it = its[0], fk = xlsFamKey(it), area = xlsArea(it);
  const famRows = xlsObjects().filter(o => xlsFamKey(o.it) === fk).map(o => o.it);
  const one = its.length === 1 ? `${xlsObjName(it) || "objektet"}${xlsObjName(it) !== xlsFamName(it) ? " – " + xlsFamName(it) : ""}` : `${its.length} objekt här`;
  const cut = s => (s.length > 34 ? s.slice(0, 33) + "…" : s);
  m.innerHTML = `<div style="font-size:11px;opacity:.7;padding:4px 10px 2px;">📊 Excel-planeringen</div>`
    + `<button type="button" data-x="obj">Släck ${escHtml(cut(one))}</button>`
    + (famRows.length > its.length ? `<button type="button" data-x="fam">Släck hela aktiviteten ${escHtml(cut(xlsFamLabel(famRows)))} (${famRows.length} objekt)</button>` : "")
    + `<button type="button" data-x="area">Släck området ${escHtml(cut(area))}</button>`;
  m.style.left = Math.min(e.clientX, window.innerWidth - 300) + "px";
  m.style.top = Math.min(e.clientY, window.innerHeight - 120) + "px";
  m.classList.remove("hidden");
  const on = (k, keys, msg) => { const b = m.querySelector(`[data-x="${k}"]`); if (b) b.onclick = () => { m.classList.add("hidden"); xlsSetHidden(keys, true); if (typeof setSaveStatus === "function") setSaveStatus(`📊 Släckt: ${msg}. Tänd igen under Lager → Excel-planeringen.`); }; };
  on("obj", its.map(x => "i:" + x.id), one);
  on("fam", [fk], xlsFamLabel(famRows));
  on("area", ["a:" + area], area);
}
