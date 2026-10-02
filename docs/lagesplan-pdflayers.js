/* Lägesplan – PDF-lager i utskriften (avancerat, Victors önskemål 2026-10-02).
   Avslaget från början; påslaget kan
   - lager från lägesplanen (zoner/WBS, 3D-objekt, etableringslager, DXF-filer)
     läggas i namngivna PDF-lager (Avancerat i utskriftspanelen), och
   - varje element i layouten (förklaring, QR, ritningshuvud …) få ett PDF-lager.
   Samma namn = samma lager, t.ex. "1.1 - WBS-områden" för både zonerna och
   förklaringen. Lagren tänds/släcks i PDF-läsaren (Acrobat, Bluebeam, Foxit …).
   Bara det som läggs i lager blir egna bilder i PDF:en – resten som förut. */

const pdfLayersCfg = tpl => ({ on: false, map: {}, off: [], ...(tpl.pdfLayers || {}) });
/* Lägesplanens lager som kan läggas i PDF-lager (ortofoto och ritningen ligger alltid i botten). */
function pdfLayerSources() {
  return printLayerList().filter(l => !l.sub && l.key !== "pdf" && !l.key.startsWith("ortho:"));
}
function pdfLayerNames(tpl) {
  const c = pdfLayersCfg(tpl);
  const names = [...Object.values(c.map), ...tpl.elements.map(e => e.pdfLayer)].map(s => String(s || "").trim()).filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, "sv", { numeric: true }));
}
/* Plan för exporten: id per namn, och vilka lägesplanslager som hör till vilket namn. */
function pdfLayerPlan(tpl) {
  const c = pdfLayersCfg(tpl);
  if (!c.on) return null;
  const names = pdfLayerNames(tpl);
  if (!names.length) return null;
  const ids = new Map(names.map((n, i) => [n, "L" + (i + 1)]));
  const byName = new Map();
  Object.entries(c.map).forEach(([k, n]) => { n = String(n || "").trim(); if (!n) return; if (!byName.has(n)) byName.set(n, new Set()); byName.get(n).add(k); });
  return { ids, names, off: new Set(c.off || []), groups: [...byName.entries()].map(([name, keys]) => ({ name, keys })), nameOfKey: k => String(c.map[k] || "").trim() || null };
}

/* Efterbehandling: lagren (OCG) i PDF:en och namnen på dem i sidornas och
   formulärens resurser. Innehållet är redan märkt med /OC /Ln BDC … EMC. */
async function addPdfLayers(bytes, PL) {
  if (!PL || !PL.names.length) return bytes;
  if (!(await loadPdfLib())) throw new Error("PDF-verktyget för lager kunde inte laddas");
  const { PDFDocument, PDFName, PDFHexString, PDFDict, PDFArray, PDFRef, PDFStream } = window.PDFLib;
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const ctx = doc.context;
  const refs = PL.names.map(n => ctx.register(ctx.obj({ Type: "OCG", Name: PDFHexString.fromText(n) })));
  const props = ctx.obj({});
  PL.names.forEach((n, i) => props.set(PDFName.of(PL.ids.get(n)), refs[i]));
  const on = refs.filter((r, i) => !PL.off.has(PL.names[i])), off = refs.filter((r, i) => PL.off.has(PL.names[i]));
  doc.catalog.set(PDFName.of("OCProperties"), ctx.obj({ OCGs: refs, D: { Order: refs, ON: on, OFF: off, Name: PDFHexString.fromText("Lägesplan") } }));
  // Namnen behövs i resurserna där innehållet ligger: sidor och (vektor-PDF) inbäddade formulär.
  const seen = new Set();
  const addTo = res => {
    res = res instanceof PDFRef ? ctx.lookup(res) : res;
    if (!(res instanceof PDFDict)) return;
    const key = res; if (seen.has(key)) return; seen.add(key);
    const cur = res.lookup(PDFName.of("Properties"));
    if (cur instanceof PDFDict) props.entries().forEach(([k, v]) => cur.set(k, v)); else res.set(PDFName.of("Properties"), props);
    const xo = res.lookup(PDFName.of("XObject"));
    if (xo instanceof PDFDict) xo.entries().forEach(([, v]) => {
      const s = v instanceof PDFRef ? ctx.lookup(v) : v;
      if (s instanceof PDFStream && String(s.dict.get(PDFName.of("Subtype"))) === "/Form") {
        let r = s.dict.get(PDFName.of("Resources"));
        if (!r) { r = ctx.obj({}); s.dict.set(PDFName.of("Resources"), r); }
        addTo(r);
      }
    });
  };
  doc.getPages().forEach(p => { let r = p.node.get(PDFName.of("Resources")); if (!r) { r = ctx.obj({}); p.node.set(PDFName.of("Resources"), r); } addTo(r); });
  return await doc.save();
}

/* ---------- Panelen ---------- */
function renderPdfLayersUi() {
  const box = $("prPdfLayersBody");
  if (!box || !pr) return;
  const c = pdfLayersCfg(pr.tpl), names = pdfLayerNames(pr.tpl);
  const dl = `<datalist id="prPdfNames">${names.map(n => `<option value="${escHtml(n)}"></option>`).join("")}</datalist>`;
  box.innerHTML = `<label class="check"><input type="checkbox" id="prPdfOn"${c.on ? " checked" : ""} /> <b>PDF med lager</b></label>
    <div class="hint">Lagren kan tändas och släckas i Acrobat, Bluebeam, Foxit m.fl. (inte i webbläsarens PDF-visare). Bara det du lägger i ett lager blir en egen bild i PDF:en – resten blir som vanligt.</div>
    ${c.on ? `${dl}<label style="margin-top:6px;">Från lägesplanen <span class="muted">– tomt = inget eget lager</span></label>
      <div class="pr-pl-list">${pdfLayerSources().map(l => `<div class="pr-pl-row"><span title="${escHtml(l.label)}">${escHtml(l.label)}</span><input type="text" list="prPdfNames" data-plk="${escHtml(l.key)}" value="${escHtml(c.map[l.key] || "")}" placeholder="t.ex. 1.1 - WBS-områden" /></div>`).join("")}</div>
      <div class="hint">Ritningen och ortofotona ligger alltid i botten. Element i layouten får sitt lager i sin egen meny.</div>
      ${names.length ? `<label style="margin-top:6px;">Lagren i PDF:en <span class="muted">– bock = tänt när PDF:en öppnas</span></label>
      <div class="pr-pl-names">${names.map(n => `<label class="check"><input type="checkbox" data-pln="${escHtml(n)}"${(c.off || []).includes(n) ? "" : " checked"} /> ${escHtml(n)}</label>`).join("")}</div>` : ""}` : ""}`;
  const save = (patch, rerender) => {
    pushUndo();
    pr.tpl.pdfLayers = { ...pdfLayersCfg(pr.tpl), ...patch };
    pr.dirty = true; $("prSave").classList.add("primary"); $("prSave").textContent = "💾 Spara mall *";
    if (rerender) { renderPdfLayersUi(); renderPrintProps(); }
  };
  $("prPdfOn").onchange = e => save({ on: e.target.checked }, true);
  box.querySelectorAll("[data-plk]").forEach(i => { i.onchange = () => { const m = { ...pdfLayersCfg(pr.tpl).map }; const v = i.value.trim(); if (v) m[i.dataset.plk] = v; else delete m[i.dataset.plk]; save({ map: m }, true); }; });
  box.querySelectorAll("[data-pln]").forEach(i => { i.onchange = () => { const off = new Set(pdfLayersCfg(pr.tpl).off || []); if (i.checked) off.delete(i.dataset.pln); else off.add(i.dataset.pln); save({ off: [...off] }); }; });
}
document.addEventListener("DOMContentLoaded", () => {
  const d = $("prPdfLayers");
  if (!d) return;
  d.addEventListener("toggle", () => { if (d.open) renderPdfLayersUi(); });
  // Elementets eget PDF-lager (bara när PDF-lager är påslaget).
  const origProps = renderPrintProps;
  renderPrintProps = function (onlyPos) {
    const r = origProps.apply(this, arguments);
    if (onlyPos || !pr) return r;
    const el = primary();
    if (!el || !pdfLayersCfg(pr.tpl).on) return r;
    const box = $("prProps"), names = pdfLayerNames(pr.tpl);
    const wrap = document.createElement("div");
    wrap.className = "pr-pl-el";
    wrap.innerHTML = `<label>📑 PDF-lager <span class="muted">– tomt = alltid synligt</span></label><input type="text" id="prElPdfLayer" list="prPdfNamesEl" value="${escHtml(el.pdfLayer || "")}" placeholder="t.ex. 1.1 - WBS-områden" /><datalist id="prPdfNamesEl">${names.map(n => `<option value="${escHtml(n)}"></option>`).join("")}</datalist>`;
    box.appendChild(wrap);
    $("prElPdfLayer").onchange = e => { pushUndo(); const v = e.target.value.trim(); if (v) el.pdfLayer = v; else delete el.pdfLayer; pr.dirty = true; $("prSave").classList.add("primary"); $("prSave").textContent = "💾 Spara mall *"; if (d.open) renderPdfLayersUi(); };
    return r;
  };
  const origPanel = renderPrintPanel;
  renderPrintPanel = function () { const r = origPanel.apply(this, arguments); if (d.open) renderPdfLayersUi(); return r; };
});
