/* TC-vyer → SketchUp (Victor 2026-11-23: "Går det att hämta in data från mina sparade vyer i TC? Jag har färgat
   och filtrerat fram på ett sätt där jag skulle vilja efterlikna i sketchup").

   En sparad vy i Trimble Connect lämnar bara ut kamera, snittplan och modeller via API:t – inte färger eller
   dolda objekt. Därför aktiveras varje vald vy i visaren (view.selectView) och det den visar läses av:
     – färgade objekt: viewer.getColoredObjects() (objektets färg som hex),
     – dolda objekt:   viewer.getObjects(undefined, { visible: false }),
     – kameran:        viewer.getCamera() (position och lookAt i meter).
   Objekten översätts till IFC-id (GUID) med convertToObjectIds så att SketchUp kan hitta dem i sina IFC-modeller.
   Resultatet laddas ner som JSON och sparas i projektets data (projects/<id>/tc_vyer.json). Den vy som var
   aktiv innan återställs efteråt. Bara läsning – inga vyer ändras. */

const tcvy = { views: [], busy: false, valda: new Set() };
const tcvySleep = ms => new Promise(r => setTimeout(r, ms));
const tcvyEl = id => document.getElementById(id);
function tcvyStatus(t, bad) { const s = tcvyEl("tcvyStatus"); if (s) { s.textContent = t || ""; s.classList.toggle("bad", !!bad); } }

async function tcvyLoad() {
  if (!API || !API.view) { tcvyStatus("Trimble Connect är inte anslutet.", true); return; }
  tcvyStatus("Hämtar vyer…");
  try {
    const v = await API.view.getViews();
    tcvy.views = (v || []).filter(x => x && x.id).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "sv", { numeric: true }));
    tcvyRender();
    tcvyStatus(`${tcvy.views.length} sparade vyer. Välj de du vill ha i SketchUp.`);
  } catch (e) { tcvyStatus("Kunde inte hämta vyerna: " + e.message, true); }
}

function tcvyRender() {
  const box = tcvyEl("tcvyList");
  if (!box) return;
  if (!tcvy.views.length) { box.innerHTML = ""; return; }
  box.innerHTML = tcvy.views.map(v => `<label class="tcvy-row"><input type="checkbox" data-tcvy="${escapeHtml(v.id)}" ${tcvy.valda.has(v.id) ? "checked" : ""}> ${escapeHtml(v.name || v.id)}</label>`).join("");
  box.querySelectorAll("[data-tcvy]").forEach(c => c.onchange = () => { c.checked ? tcvy.valda.add(c.dataset.tcvy) : tcvy.valda.delete(c.dataset.tcvy); });
}

/* Runtime-id → IFC-id, i omgångar. */
async function tcvyGuids(modelId, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 5000) {
    const ext = await API.viewer.convertToObjectIds(modelId, ids.slice(i, i + 5000));
    (ext || []).forEach(x => { if (x) out.push(String(x)); });
  }
  return out;
}

/* Vänta tills visaren har lagt på vyn: antalet färgade objekt slutar ändras (högst ~10 s). */
async function tcvyVanta() {
  await tcvySleep(1500);
  let forra = -1;
  for (let i = 0; i < 12; i++) {
    let n = 0;
    try { (await API.viewer.getColoredObjects() || []).forEach(m => { n += (m.objects || []).length; }); } catch (e) { return; }
    if (n === forra) return;
    forra = n;
    await tcvySleep(700);
  }
}

async function tcvyLasVy(v) {
  await API.view.selectView(v.id);
  await tcvyVanta();
  // Färger: grupperas per färg och modell
  const perFarg = new Map();
  try {
    (await API.viewer.getColoredObjects() || []).forEach(m => (m.objects || []).forEach(o => {
      if (!o || !o.color) return;
      const c = String(o.color).toLowerCase();
      if (!perFarg.has(c)) perFarg.set(c, new Map());
      const mm = perFarg.get(c);
      if (!mm.has(m.modelId)) mm.set(m.modelId, []);
      mm.get(m.modelId).push(o.id);
    }));
  } catch (e) { /* inga färger */ }
  const farger = [];
  for (const [color, mm] of perFarg) {
    let guids = [];
    for (const [mid, ids] of mm) guids = guids.concat(await tcvyGuids(mid, ids));
    if (guids.length) farger.push({ color, guids });
  }
  // Dolda objekt
  let dolda = [];
  try {
    for (const m of (await API.viewer.getObjects(undefined, { visible: false }) || [])) {
      const ids = (m.objects || []).map(o => o.id);
      if (ids.length) dolda = dolda.concat(await tcvyGuids(m.modelId, ids));
    }
  } catch (e) { /* inget filter för synlighet */ }
  let camera = null;
  try { camera = await API.viewer.getCamera(); } catch (e) { camera = v.camera || null; }
  return { id: v.id, name: v.name || "", camera, models: v.models || [], farger, dolda };
}

async function tcvyExport() {
  if (tcvy.busy) return;
  const valda = tcvy.views.filter(v => tcvy.valda.has(v.id));
  if (!valda.length) { tcvyStatus("Välj minst en vy.", true); return; }
  tcvy.busy = true;
  const knapp = tcvyEl("btnTcvyExport"); if (knapp) knapp.disabled = true;
  let forra = null;
  try { forra = await API.view.getCurrentView(); } catch (e) { forra = null; }
  const ut = [];
  try {
    for (let i = 0; i < valda.length; i++) {
      tcvyStatus(`Läser vy ${i + 1} av ${valda.length}: ${valda[i].name || ""}…`);
      try { ut.push(await tcvyLasVy(valda[i])); }
      catch (e) { tcvyStatus(`Vyn ${valda[i].name} kunde inte läsas: ${e.message}`, true); }
    }
  } finally {
    if (forra && forra.id) { try { await API.view.selectView(forra.id); } catch (e) { /* lämnas */ } }
    tcvy.busy = false; if (knapp) knapp.disabled = false;
  }
  if (!ut.length) return;
  const data = { typ: "tc-vyer", projectId, at: new Date().toISOString(), vyer: ut };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `TC-vyer_${String(projectId).replace(/[^\w-]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  const nF = ut.reduce((s, v) => s + v.farger.reduce((t, f) => t + f.guids.length, 0), 0), nD = ut.reduce((s, v) => s + v.dolda.length, 0);
  tcvyStatus(`Klart: ${ut.length} vyer (${nF} färgade och ${nD} dolda objekt) sparade som JSON – för NSV Koppling i SketchUp.`);
  if (typeof ghWriteJSON === "function" && typeof settings !== "undefined" && settings.githubToken) {
    ghWriteJSON(settings.githubToken, `projects/${encodeURIComponent(projectId)}/tc_vyer.json`, () => [data], `TC-vyer för SketchUp (${ut.length})`)
      .catch(e => console.warn("Kunde inte spara TC-vyerna i projektets data", e));
  }
}

function tcvyBind() {
  const l = tcvyEl("btnTcvyLoad"); if (l) l.onclick = () => tcvyLoad();
  const x = tcvyEl("btnTcvyExport"); if (x) x.onclick = () => tcvyExport();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tcvyBind); else tcvyBind();

/* SketchUp → TC (Victor 2026-11-26: "Kan vi få ut en organizer-fil på vyn i SketchUp som TC kan fatta så att den
   visar samma?"). Läser JSON från NSV Koppling › TC-vyer › Exportera vy till TC (samma format som exporten ovan):
   färger per IFC-GUID, dolda GUID:er och kamera. IFC-id → runtime-id i varje laddad modell, sedan setObjectState.
   Kan sparas som en vanlig TC-vy så att den finns kvar för alla. */
function tcvyFarg(hex) {
  const h = String(hex || "").replace("#", "");
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a };
}

async function tcvyRuntime(models, guids) {
  const ut = [];
  for (const m of models) {
    const ids = [];
    for (let i = 0; i < guids.length; i += 5000) {
      const r = await API.viewer.convertToObjectRuntimeIds(m.id, guids.slice(i, i + 5000));
      (r || []).forEach(x => { if (typeof x === "number" && x >= 0) ids.push(x); });
    }
    if (ids.length) ut.push({ modelId: m.id, objectRuntimeIds: ids });
  }
  return ut;
}

async function tcvyImport(fil) {
  if (!API || !API.viewer) { tcvyStatus("Trimble Connect är inte anslutet.", true); return; }
  if (tcvy.busy) return;
  tcvy.busy = true;
  try {
    const d = JSON.parse(await fil.text());
    const v = (d.vyer || [])[0];
    if (!v) throw new Error("Filen innehåller ingen vy från SketchUp.");
    const models = (await API.viewer.getModels("loaded")) || [];
    if (!models.length) throw new Error("Ladda modellerna i 3D-vyn först.");
    tcvyStatus(`Lägger på ”${v.name}”…`);
    await API.viewer.setObjectState(undefined, { color: "reset", visible: "reset" });
    let nF = 0, nD = 0;
    for (const f of v.farger || []) {
      const mo = await tcvyRuntime(models, f.guids || []);
      if (!mo.length) continue;
      await API.viewer.setObjectState({ modelObjectIds: mo }, { color: tcvyFarg(f.color) });
      nF += mo.reduce((s, m) => s + m.objectRuntimeIds.length, 0);
    }
    if ((v.dolda || []).length) {
      const mo = await tcvyRuntime(models, v.dolda);
      if (mo.length) await API.viewer.setObjectState({ modelObjectIds: mo }, { visible: false });
      nD = mo.reduce((s, m) => s + m.objectRuntimeIds.length, 0);
    }
    if (v.camera && v.camera.position) { try { await API.viewer.setCamera(v.camera, { animationTime: 400 }); } catch (e) { /* kameran lämnas */ } }
    let sparad = "";
    if (tcvyEl("tcvySpara") && tcvyEl("tcvySpara").checked && API.view && API.view.createView) {
      try { await API.view.createView({ name: v.name, description: "Från NSV Koppling (SketchUp) " + (d.skapad || "") }); sparad = " Sparad som vy i TC."; }
      catch (e) { sparad = " Kunde inte spara som vy: " + e.message; }
    }
    const alla = (v.farger || []).reduce((s, f) => s + (f.guids || []).length, 0);
    tcvyStatus(`”${v.name}”: ${nF} objekt färgade (av ${alla} i filen), ${nD} dolda.${sparad}`);
  } catch (e) { tcvyStatus("Kunde inte läsa vyn: " + e.message, true); }
  finally { tcvy.busy = false; }
}

function tcvyImportBind() {
  const k = tcvyEl("btnTcvyImport"), f = tcvyEl("tcvyFil");
  if (k && f) { k.onclick = () => f.click(); f.onchange = () => { if (f.files[0]) tcvyImport(f.files[0]); f.value = ""; }; }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tcvyImportBind); else tcvyImportBind();
