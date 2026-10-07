/* Länk till en aktivitet (Victors önskemål 2026-10-05): lagesplan.html?project=…&item=<id>
   öppnar Lägesplan på aktiviteten – rätt arbetsyta, inzoomad, objektet markerat och blinkande –
   med en ruta som visar namn, status, framdrift och zon. Länken skrivs på varje rad i Excel av
   den avancerade modulen ("Visa på kartan"). */

const itemLinkId = () => new URLSearchParams(location.search).get("item");

/* Var aktiviteten finns: arbetsytan där dess position ligger (inom arbetsytans höjd) och/eller
   där den hör till en zon. Den öppna arbetsytan vinner vid lika. */
function itemLinkTarget(it) {
  const best = [];
  plans.forEach(p => {
    if (p.underlay) return; // PDF-underlag är bara lager
    const pos = typeof zoneExportPositions === "function" ? zoneExportPositions(p) : null;
    const pt = pos ? pos.get(it.id) || null : null;
    const zones = (typeof zonesMainOf === "function" ? zonesMainOf(p) : (p.zones || [])).filter(z => zoneExportItems(p, z, pos).some(x => x.id === it.id));
    if (!pt && !zones.length) return;
    best.push({ p, pt, zones, score: (pt ? 2 : 0) + (zones.length ? 1 : 0) + (plan && p.id === plan.id ? 0.5 : 0) });
  });
  best.sort((a, b) => b.score - a.score);
  return best[0] || null;
}

function itemLinkBanner(html) {
  let b = $("itemLinkBanner");
  if (!b) {
    b = document.createElement("div"); b.id = "itemLinkBanner"; b.className = "ap-ui";
    $("viewport").parentNode.appendChild(b);
  }
  b.innerHTML = `<button type="button" class="ilb-x" title="Stäng" aria-label="Stäng"></button>${html}`;
  b.classList.remove("hidden");
  b.querySelector(".ilb-x").onclick = () => b.classList.add("hidden");
}

async function focusItemFromUrl() {
  const id = itemLinkId();
  if (!id || !plan) return;
  const it = items.find(x => x.id === id);
  if (!it) { itemLinkBanner(`<b>Aktiviteten finns inte längre</b><span>Den har tagits bort i 4D-planering.</span>`); return; }
  const name = [it.object_name, it.activity].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" – ") || "Aktiviteten";
  const warn = Number.isFinite(settings.warningDaysBeforeEnd) ? settings.warningDaysBeforeEnd : 7;
  const ph = computeItemPhase(it, todayIso(), warn) || fallbackPhase(it);
  const prog = it.status === "klar" ? 100 : (Number(it.progress) || 0);
  const t = itemLinkTarget(it);
  const info = [`<span class="ilb-ph" style="background:${phaseColor(ph)}"></span>${escHtml(PHASE_LABELS[ph] || ph)} · ${prog} %`];
  if (t && t.zones.length) info.push("Zon " + t.zones.map(z => escHtml([z.code, z.name].filter(Boolean).join(" "))).join(", "));
  if (t && plans.length > 1) info.push(escHtml(t.p.name || ""));
  itemLinkBanner(`<b>${escHtml(name)}</b><span>${info.join(" · ")}</span>${t ? "" : `<span class="muted">Ingen position på kartan – aktiviteten är inte kopplad till 3D eller någon zon.</span>`}`);
  if (!t) return;
  if (t.p.id !== plan.id) await openPlan(t.p.id);
  // Det som ska visas (PDF-punkter): objektets fotavtryck, annars zonen/zonerna.
  let polys = [], center = null;
  if (t.pt) {
    const q = positions.find(x => x.id === it.id);
    const poly = q && Number.isFinite(q.x0) ? [[q.x0, q.y0], [q.x1, q.y0], [q.x1, q.y1], [q.x0, q.y1]].map(([x, y]) => modelToPdf(x, y)) : null;
    center = t.pt;
    if (poly) polys = [[poly]];
    if (typeof selectedObjId !== "undefined") selectedObjId = it.id;
  }
  if (!polys.length && t.zones.length) polys = wbsUnion(t.zones);
  if (!center && polys.length) center = wbsCentroid(polys);
  // Zooma så att ytan (minst ca 40 m runt) syns, och centrera.
  const vp = $("viewport").getBoundingClientRect();
  const pts = polys.flatMap(rs => rs.flatMap(r => r)).map(toPx);
  const c = toPx(center);
  const m40 = Math.abs(toPx(modelToPdf(40, 0))[0] - toPx(modelToPdf(0, 0))[0]) + Math.abs(toPx(modelToPdf(40, 0))[1] - toPx(modelToPdf(0, 0))[1]);
  const span = Math.max(m40, ...pts.map(p => Math.max(Math.abs(p[0] - c[0]), Math.abs(p[1] - c[1])) * 3), 1);
  view.scale = Math.max(0.02, Math.min(8, Math.min(vp.width, vp.height) / span));
  centerOnPdf(center);
  renderZones();
  if (polys.length) setTimeout(() => flashOutline(polys), 250);
}
