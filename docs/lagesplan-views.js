/* Lägesplan – sparade vyer (Victors önskemål 2026-10-01).
   En vy sparar vilka lager som är tända (ritning, zoner, objekt, egna lager,
   ortofoton, DXF-ritningar och deras lager) med genomskinlighet, vilka
   3D-objekt som är släckta och valfritt datumet och utsnittet (zoom/läge,
   med planen det gällde). Vyerna sparas i projektet (site_layers.json,
   { type: "lsview" }) så alla ser samma vyer. Samma namn skriver över. */

const lsViews = () => (typeof siteItems !== "undefined" ? siteItems : []).filter(x => x.type === "lsview").sort((a, b) => (a.name || "").localeCompare(b.name || "", "sv", { numeric: true }));
let lsViewCurrent = null; // id för senast valda/sparade vyn

/* Lagerstatus som hör till en vy (inte fällda mappar o.d.). */
const LS_VIEW_KEY_RE = /^(ortho:|cad:|cadl:|ul:|pdfp:)|^(pdf|zones|objects|photos)$/;
function lsViewSnapshot() {
  const layers = {};
  Object.keys(layerState).forEach(k => {
    if (LS_VIEW_KEY_RE.test(k) && layerState[k] && typeof layerState[k] === "object") layers[k] = { visible: !!layerState[k].visible, opacity: layerState[k].opacity ?? 100 };
  });
  // Lager som syns i listan men aldrig rörts har standardläget (tänt).
  layerRowKeys().forEach(k => { if (!layers[k]) { const s = ls(k); layers[k] = { visible: !!s.visible, opacity: s.opacity ?? 100 }; } });
  return { layers: typeof pruneLayerState === "function" ? pruneLayerState(layers) : layers, pdfMultiply: layerState.pdfMultiply !== false, orthoFollowDate: !!layerState.orthoFollowDate, photoZone: layerState.phzone || "" };
}
function lsViewCamera() {
  const vp = $("viewport").getBoundingClientRect(), pc = $("pdfCanvas");
  if (!pc.width || !plan) return null;
  // Mitten (andel av ritningen) och synlig bredd i PDF-enheter: oberoende av skärm och upplösning.
  const cx = (vp.width / 2 - view.tx) / view.scale, cy = (vp.height / 2 - view.ty) / view.scale;
  return { plan: plan.id, fx: cx / pc.width, fy: cy / pc.height, span: vp.width / (view.scale * renderScale), rot: view.rot || 0 };
}
function lsApplyCamera(c) {
  const vp = $("viewport").getBoundingClientRect(), pc = $("pdfCanvas");
  if (!pc.width) return;
  if (c.rot != null) { view.rot = c.rot; try { if (c.rot) localStorage.setItem(northKey(), String(c.rot)); else localStorage.removeItem(northKey()); } catch (e) {} }
  view.scale = Math.max(0.02, Math.min(8, vp.width / (c.span * renderScale)));
  view.tx = vp.width / 2 - c.fx * pc.width * view.scale;
  view.ty = vp.height / 2 - c.fy * pc.height * view.scale;
  applyView();
  if (typeof renderNorthUi === "function") renderNorthUi();
}

async function applyLsView(v) {
  if (!v) return;
  // Utsnittet hör till en viss plan: byt plan först.
  if (v.camera && v.camera.plan && plan && v.camera.plan !== plan.id && plans.some(p => p.id === v.camera.plan)) await openPlan(v.camera.plan);
  const snap = v.state || {};
  const saved = snap.layers || {};
  // Lager som inte fanns när vyn sparades (nya ortofoton/DXF:er) släcks.
  layerRowKeys().forEach(k => { if (!saved[k] && /^(ortho:|cad:|pdfp:)/.test(k)) ls(k).visible = false; });
  Object.keys(saved).forEach(k => { const s = ls(k); s.visible = !!saved[k].visible; s.opacity = saved[k].opacity ?? 100; });
  layerState.pdfMultiply = snap.pdfMultiply !== false;
  layerState.orthoFollowDate = !!snap.orthoFollowDate;
  if ("photoZone" in snap) layerState.phzone = snap.photoZone || "";
  if ($("orthoFollowDate")) $("orthoFollowDate").checked = !!snap.orthoFollowDate;
  saveLayerState();
  if ($("showObjects")) $("showObjects").checked = ls("objects").visible;
  if ($("showPhotos")) $("showPhotos").checked = ls("photos").visible;
  if (v.objHidden && typeof setObjHidden === "function") setObjHidden({ ids: [...(v.objHidden.ids || [])], fams: [...(v.objHidden.fams || [])], acts: [...(v.objHidden.acts || [])], view: v.objHidden.view || "" }, { undo: false });
  if (v.date) { $("dateInput").value = v.date; if (typeof syncSliderFromDate === "function") syncSliderFromDate(); }
  lsViewCurrent = v.id;
  applyLayerCss();
  orthoChanged();
  if (typeof buildCadSnap === "function") { buildCadSnap(); renderCad(); }
  if (v.date && typeof onDateChanged === "function") onDateChanged(); else renderZones();
  if (v.camera) lsApplyCamera(v.camera);
  renderLsViewUi();
  setSaveStatus(`Vyn "${v.name}" visas.`);
}

function renderLsViewUi() {
  const sel = $("lsViewSel");
  if (!sel) return;
  const views = lsViews();
  if (lsViewCurrent && !views.some(v => v.id === lsViewCurrent)) lsViewCurrent = null;
  const info = v => [v.date ? `📅 ${v.date}` : "", v.camera ? "🔍" : ""].filter(Boolean).join(" ");
  sel.innerHTML = `<option value="">${views.length ? "Välj en sparad vy…" : "Inga sparade vyer"}</option>` +
    views.map(v => `<option value="${escHtml(v.id)}">${escHtml(v.name)}${info(v) ? "  " + info(v) : ""}</option>`).join("");
  sel.value = lsViewCurrent || "";
  sel.disabled = !views.length;
  $("btnLsViewDelete").disabled = !lsViewCurrent;
}

function openLsViewForm() {
  const box = $("lsViewForm"), cur = lsViews().find(v => v.id === lsViewCurrent);
  const date = $("dateInput").value || todayIso();
  box.innerHTML = `
    <input type="text" id="lsViewName" placeholder="Namn, t.ex. Grundskruvsplaner" value="${escHtml(cur ? cur.name : "")}" />
    <label class="check"><input type="checkbox" id="lsViewDate"${cur && cur.date ? " checked" : ""} /> Spara datumet (${escHtml(date)})</label>
    <label class="check"><input type="checkbox" id="lsViewCam"${!cur || cur.camera ? " checked" : ""} /> Spara utsnittet (zoom och läge)</label>
    <div class="hint" style="margin:0;">Tända lager, ortofoton, DXF-lager och släckta 3D-objekt sparas alltid. Samma namn skriver över.</div>
    <div class="row split"><button type="button" id="lsViewOk" class="primary">💾 Spara vy</button><button type="button" id="lsViewCancel">Avbryt</button></div>`;
  box.classList.remove("hidden");
  const name = $("lsViewName");
  name.focus(); name.select();
  $("lsViewCancel").onclick = () => box.classList.add("hidden");
  name.onkeydown = e => { if (e.key === "Enter") $("lsViewOk").click(); if (e.key === "Escape") box.classList.add("hidden"); };
  $("lsViewOk").onclick = async () => {
    const n = name.value.trim();
    if (!n) { name.focus(); return; }
    const existing = lsViews().find(v => (v.name || "").toLowerCase() === n.toLowerCase());
    if (existing && existing.id !== lsViewCurrent && !confirm(`Det finns redan en vy som heter "${existing.name}". Skriva över den?`)) return;
    box.classList.add("hidden");
    await saveLsView(n, { date: $("lsViewDate").checked, camera: $("lsViewCam").checked });
  };
}
/* Sparar det som visas nu som vyn `name` (samma namn skriver över). Används
   av formuläret i Lager och av fältläget (💾 Vy). */
async function saveLsView(name, opts = {}) {
  const existing = lsViews().find(v => (v.name || "").toLowerCase() === name.toLowerCase());
  const h = typeof objHidden === "function" ? objHidden() : null;
  const rec = {
    id: existing ? existing.id : ghNewId(), type: "lsview", name,
    state: lsViewSnapshot(),
    objHidden: h ? { ids: h.ids, fams: h.fams, acts: h.acts, view: h.view } : null,
    date: opts.date ? ($("dateInput").value || todayIso()) : null,
    camera: opts.camera ? lsViewCamera() : null,
    updated_by: settings.userName || null, updated_at: new Date().toISOString(),
  };
  lsViewCurrent = rec.id;
  await saveSiteItem(rec, false, { record: false });
  renderLsViewUi();
  setSaveStatus(`Vyn "${name}" är sparad i projektet.`);
  return rec;
}

function bindLsViews() {
  if (!$("lsViewSel")) return;
  // Vyerna ligger bland lägesplanens sparade poster – uppdatera listan när de laddas/ändras.
  const orig = renderLayerPanel;
  renderLayerPanel = function () { const r = orig.apply(this, arguments); renderLsViewUi(); return r; };
  $("lsViewSel").onchange = () => { const v = lsViews().find(x => x.id === $("lsViewSel").value); if (v) applyLsView(v); else { lsViewCurrent = null; renderLsViewUi(); } };
  $("btnLsViewSave").onclick = openLsViewForm;
  $("btnLsViewDelete").onclick = async () => {
    const v = lsViews().find(x => x.id === lsViewCurrent);
    if (!v || !confirm(`Ta bort vyn "${v.name}"? Det som visas just nu ändras inte.`)) return;
    lsViewCurrent = null;
    await saveSiteItem(v, true, { record: false });
    renderLsViewUi();
  };
  renderLsViewUi();
}
document.addEventListener("DOMContentLoaded", bindLsViews);

/* Norr uppåt (Victors önskemål 2026-10-02): vrider hela planen på skärmen så
   att modellens norr (+Y i SWEREF 99) pekar rakt uppåt. Ligger med flit
   undangömt under Zoner & 3D (och frågar först) så att man inte råkar vrida
   planen. Vinkeln sparas per plan i den här webbläsaren och följer med i
   sparade vyer med utsnitt. Utskrifterna ritas som förut i ritningens riktning. */
const northKey = () => `lagesplan-rot-${projectId}-${plan ? plan.id : ""}`;
/* Vinkeln (radianer) som gör att norr pekar uppåt på skärmen, eller null utan kalibrering. */
function northUpAngle() {
  if (!plan || !plan.calib || !viewport) return null;
  const a = mToPx([0, 0]), b = mToPx([0, 1]);
  const ang = -Math.PI / 2 - Math.atan2(b[1] - a[1], b[0] - a[0]);
  return Math.atan2(Math.sin(ang), Math.cos(ang)); // -π..π
}
function setViewRotation(rot, save = true) {
  const vp = $("viewport").getBoundingClientRect();
  // Behåll det som syns i mitten.
  const mid = screenToStage([vp.width / 2, vp.height / 2]);
  view.rot = Math.abs(rot) < 1e-4 ? 0 : rot;
  view.tx = vp.width / 2 - mid[0] * view.scale; view.ty = vp.height / 2 - mid[1] * view.scale;
  if (save) { try { if (view.rot) localStorage.setItem(northKey(), String(view.rot)); else localStorage.removeItem(northKey()); } catch (e) {} }
  applyView(); renderZones();
  renderNorthUi();
}
function renderNorthBadge() {
  const b = $("northBadge");
  if (!b) return;
  const n = plan && plan.calib && viewport ? northUpAngle() : null;
  b.classList.toggle("hidden", n == null);
  if (n == null) return;
  // Nålen pekar dit norr ligger på skärmen just nu.
  b.querySelector(".nb-needle").style.transform = `rotate(${(view.rot - n) * 180 / Math.PI}deg)`;
  b.title = view.rot ? `Norr – planen är vriden ${Math.round(view.rot * 180 / Math.PI)}°` : "Norr";
}
function renderNorthUi() {
  const up = $("btnNorthUp"), rs = $("btnNorthReset"), info = $("northInfo");
  if (!up) return;
  const n = northUpAngle();
  up.disabled = n == null || Math.abs((view.rot || 0) - n) < 1e-3;
  rs.disabled = !view.rot;
  info.textContent = n == null ? "Kalibrera planen mot 3D först – då vet Lägesplan var norr är."
    : view.rot ? `Planen visas vriden ${Math.round(view.rot * 180 / Math.PI)}° (norr uppåt). Utskrifter ritas i ritningens riktning.`
    : `Ritningens riktning. Norr ligger ${Math.round(Math.abs(n) * 180 / Math.PI)}° ${n > 0 ? "moturs" : "medurs"} från uppåt.`;
  renderNorthBadge();
}
document.addEventListener("DOMContentLoaded", () => {
  if (!$("btnNorthUp")) return;
  $("btnNorthUp").onclick = () => {
    const n = northUpAngle();
    if (n == null) return;
    if (!confirm(`Vrida hela planen ${Math.round(Math.abs(n) * 180 / Math.PI)}° så att norr pekar rakt uppåt?\n\nDet gäller bara visningen i den här webbläsaren – ritningen och allt du ritat ändras inte. "Ritningens riktning" vrider tillbaka.`)) return;
    setViewRotation(n);
  };
  $("btnNorthReset").onclick = () => setViewRotation(0);
  // Byt plan: vinkeln som sparats för den planen.
  const orig = openPlan;
  openPlan = async function () {
    view.rot = 0;
    const r = await orig.apply(this, arguments);
    let saved = 0;
    try { saved = Number(localStorage.getItem(northKey())) || 0; } catch (e) {}
    if (saved) setViewRotation(saved, false); else renderNorthUi();
    return r;
  };
  // Kalibrering ändrad: uppdatera texten och nålen.
  const origCal = updateCalibInfo;
  updateCalibInfo = function () { const r = origCal.apply(this, arguments); renderNorthUi(); return r; };
});
