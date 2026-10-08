/* Lägesplanen i 3D – en 3D-editor för etableringen (Victors önskemål 2026-10-08: "riktigt
   användarvänlig, alla grundverktyg extremt robusta, snygga och lätta att använda").
   Visar arbetsytans PDF som mark (via kalibreringen), de planerade objekten i statusfärg vid valt
   datum (lådor, genomskinliga, konturer eller dolda), den riktiga byggnaden från TC (lagesplan-3dbuild.js)
   och etableringen från Placera i 3D med riktig geometri.
   Redigering: välj (även flera med Skift), handtag, Flytta/Vrid/Rikta/Mät med fästpunkter
   (lagesplan-3dtools.js), piltangenter, kopiera/klistra in/duplicera, ta bort med ångra, ångra/gör om,
   högerklick- och långtrycksmeny, egenskapspanel med mått och 4D-koppling, standardvyer och fokus,
   namnetiketter, statusförklaring och hjälp. Allt sparas automatiskt i plan_placements.json (via
   place3d.js, samma fil som i 4D-planering); "Spara som IFC" körs av 4D-planering.
   three.js r147 ligger i vendor/three och laddas först när 3D-vyn öppnas. Koordinaterna räknas
   relativt kalibreringens första punkt (stora SWEREF-tal tål inte 32-bitarsgrafik). */

const L3_SCRIPTS = ["vendor/three/three.min.js", "vendor/three/OrbitControls.js", "vendor/three/TransformControls.js"];
let l3 = null;
let l3Loading = null;

const L3_ICO = (() => {
  const s = d => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  return {
    back: s('<path d="M15 18l-6-6 6-6"/>'),
    select: s('<path d="M5 3l14 8-6 2-3 6z"/>'),
    move: s('<path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/>'),
    rotate: s('<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>'),
    align: s('<path d="M4 20h16"/><path d="M6 16l10-10"/><path d="M14 6h2v2"/>'),
    measure: s('<path d="M3 17l14-14 4 4-14 14z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>'),
    undo: s('<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'),
    redo: s('<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>'),
    fit: s('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    cube: s('<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>'),
    eye: s('<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>'),
    upload: s('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/>'),
    help: s('<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4"/><path d="M12 17h.01"/>'),
    trash: s('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
    copy: s('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
    down: s('<path d="M12 4v14M6 12l6 6 6-6"/><path d="M4 21h16"/>'),
    focus: s('<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
    building: s('<path d="M4 21V5l8-3 8 3v16"/><path d="M9 21v-5h6v5M8 8h2M14 8h2M8 12h2M14 12h2"/>'),
  };
})();

function l3LoadScripts() {
  if (window.THREE && THREE.TransformControls) return Promise.resolve();
  if (l3Loading) return l3Loading;
  l3Loading = L3_SCRIPTS.reduce((p, src) => p.then(() => new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Kunde inte ladda " + src));
    document.head.appendChild(s);
  })), Promise.resolve());
  l3Loading.catch(() => { l3Loading = null; });
  return l3Loading;
}

/* PDF-punkt -> modellens XY (inversen av modelToPdf). */
function l3PdfToModel(px, py) {
  const [m1, m2] = plan.calib.model, [p1, p2] = plan.calib.pdf;
  const mx = m2[0] - m1[0], my = m2[1] - m1[1], qx = p2[0] - p1[0], qy = p2[1] - p1[1];
  const d = mx * mx + my * my, ar = (qx * mx + qy * my) / d, ai = (qy * mx - qx * my) / d, n = ar * ar + ai * ai;
  const dx = px - p1[0], dy = py - p1[1];
  return [m1[0] + (ar * dx + ai * dy) / n, m1[1] + (ar * dy - ai * dx) / n];
}

// ---------------------------------------------------------------------
// Inställningar (per webbläsare)
// ---------------------------------------------------------------------
const L3_PREFS_KEY = "lagesplan-3d-prefs";
const L3_PREFS_DEFAULT = { plan: true, objs: "solid", labels: true, legend: true, snap: true, step: "0.5", pal: true };
function l3Prefs() {
  if (l3 && l3.prefs) return l3.prefs;
  try { return { ...L3_PREFS_DEFAULT, ...JSON.parse(localStorage.getItem(L3_PREFS_KEY) || "{}") }; } catch (e) { return { ...L3_PREFS_DEFAULT }; }
}
function l3SetPref(k, v) {
  const p = l3Prefs(); p[k] = v; if (l3) l3.prefs = p;
  try { localStorage.setItem(L3_PREFS_KEY, JSON.stringify(p)); } catch (e) { /* privat läge */ }
}

// ---------------------------------------------------------------------
// Öppna / stänga
// ---------------------------------------------------------------------
async function open3d() {
  if (!plan) { alert("Välj en arbetsyta först."); return; }
  if (!plan.calib) { alert("Arbetsytan behöver kalibreras mot 3D-modellen först (Zoner & 3D → Kalibrera). Annars vet 3D-vyn inte var planen ligger."); return; }
  if (!settings.githubToken && token) settings.githubToken = token;
  const box = l3Dom();
  box.classList.remove("hidden");
  // Smal skärm (iPad): lägesplanens meny göms medan 3D är öppen – datumet finns i 3D-vyns nederkant.
  if (window.innerWidth < 1400 && typeof setSideHidden === "function" && !$("layout").classList.contains("side-hidden")) { setSideHidden(true); box.dataset.hidSide = "1"; }
  l3SyncDate();
  l3Status("Laddar 3D…");
  try {
    await l3LoadScripts();
    if (!l3) l3Init(box);
    else if (l3.planId !== plan.id) { const [m1] = plan.calib.model; l3.O = [m1[0], m1[1], m1[2] || 0]; }
    l3.planId = plan.id;
    l3SaveState("ok");
    if (typeof place3dLoad === "function") await place3dLoad({ fresh: true });
    if (typeof placeModelsPrepare === "function") await placeModelsPrepare();
    await l3BuildPlan();
    l3BuildObjects();
    if (typeof l3bRebuild === "function") l3bRebuild();
    l3BuildPlacements();
    l3Frame(false);
    l3RenderLib();
    l3SelectIds([]);
    if (typeof l3SetTool === "function") l3SetTool("select");
    l3RenderLegend(); l3UndoBtns();
    l3Status(`${positions.length ? positions.length + " planerade objekt" : "Inga objektpositioner – hämta dem i Zoner & 3D, eller visa byggnaden (Visa → Byggnad)"} · ${placements.length} etableringsobjekt. Tryck på ett objekt för att välja det – högerklicka eller håll inne för fler val.`);
  } catch (e) { l3Status("3D-vyn kunde inte öppnas: " + e.message, true); console.error(e); }
  l3Resize(); l3Render();
}
function close3d() {
  const box = document.getElementById("view3d");
  if (box) box.classList.add("hidden");
  if (box && box.dataset.hidSide === "1" && typeof setSideHidden === "function") { setSideHidden(false); box.dataset.hidSide = ""; }
  if (l3) { l3.gizmo.detach(); l3.addType = null; l3HideMenus(); if (typeof l3ToolCancel === "function") l3ToolCancel(); }
  if (typeof placeSaveNow === "function") placeSaveNow().then(l3NotifyOpener).catch(() => {});
}

// ---------------------------------------------------------------------
// Gränssnittet
// ---------------------------------------------------------------------
function l3Dom() {
  let box = document.getElementById("view3d");
  if (box) return box;
  const P = l3Prefs(), I = L3_ICO;
  const tool = (t, ico, label, key, title) => `<button type="button" data-v3tool="${t}" ${t === "measure" ? 'id="v3Measure"' : ""} title="${title} (${key})">${ico}<span>${label}</span></button>`;
  box = document.createElement("div");
  box.id = "view3d"; box.className = "hidden";
  box.innerHTML = `<div class="v3-bar">
      <button type="button" id="v3Close" class="v3-ghost" title="Tillbaka till lägesplanen">${I.back}<span>2D</span></button>
      <div class="v3-seg">
        ${tool("select", I.select, "Välj", "V", "Välj objekt (Skift = flera) och dra i handtagen")}
        ${tool("move", I.move, "Flytta", "M", "Flytta punkt till punkt: tryck en punkt på objektet och sedan dit den ska. Fäster mot hörn, kantmitter och axlar – skriv ett avstånd och Enter")}
        ${tool("rotate", I.rotate, "Vrid", "Q", "Vrid: vridpunkt, utgångsriktning, ny riktning. Fäster var 15:e grad – skriv en vinkel och Enter")}
        ${tool("align", I.align, "Rikta", "A", "Rikta kant mot kant: två punkter på objektets kant, sedan två på kanten det ska ligga mot")}
        ${tool("measure", I.measure, "Mät", "T", "Mät avstånd mellan två punkter (fäster mot hörn och kanter)")}
      </div>
      <div class="v3-seg">
        <button type="button" id="v3Undo" title="Ångra (Ctrl+Z)">${I.undo}</button>
        <button type="button" id="v3Redo" title="Gör om (Ctrl+Y)">${I.redo}</button>
      </div>
      <span class="v3-grow"></span>
      <button type="button" id="v3Fit" class="v3-ghost" title="Visa allt (Home)">${I.fit}<span>Översikt</span></button>
      <div class="v3-dd">
        <button type="button" id="v3ViewsBtn" class="v3-ghost" title="Standardvyer">${I.cube}<span>Vyer</span></button>
        <div class="v3-pop hidden" id="v3Views">
          <button type="button" data-v3view="iso">3D-översikt</button>
          <button type="button" data-v3view="top">Uppifrån (plan)</button>
          <button type="button" data-v3view="n">Från norr</button>
          <button type="button" data-v3view="s">Från söder</button>
          <button type="button" data-v3view="e">Från öster</button>
          <button type="button" data-v3view="w">Från väster</button>
          <button type="button" data-v3view="sel">Zooma till markerat (F)</button>
        </div>
      </div>
      <div class="v3-dd">
        <button type="button" id="v3ShowBtn" class="v3-ghost" title="Vad som visas">${I.eye}<span>Visa</span></button>
        <div class="v3-pop v3-show hidden" id="v3Show">
          <label class="v3-chk"><input type="checkbox" id="v3ShowPlan" ${P.plan ? "checked" : ""} /> Planen (PDF) som mark</label>
          <div class="v3-pop-l">Planerade objekt (lådor)</div>
          <div class="v3-segs" id="v3ObjMode">${[["solid", "Lådor"], ["ghost", "Genomskinliga"], ["edges", "Konturer"], ["hidden", "Dolda"]].map(([k, l]) => `<button type="button" data-v3objs="${k}" class="${P.objs === k ? "on" : ""}">${l}</button>`).join("")}</div>
          <div class="v3-pop-l">Byggnad</div>
          <div id="v3BldgBox"><button type="button" id="v3BldgBtn" class="v3-wide">${I.building} Visa byggnaden från Trimble Connect…</button></div>
          <div class="v3-pop-l">Övrigt</div>
          <label class="v3-chk"><input type="checkbox" id="v3LabelsChk" ${P.labels ? "checked" : ""} /> Namn på etableringen</label>
          <label class="v3-chk"><input type="checkbox" id="v3LegendChk" ${P.legend ? "checked" : ""} /> Statusförklaring</label>
          <label class="v3-chk"><input type="checkbox" id="v3PalChk" ${P.pal ? "checked" : ""} /> Biblioteket till vänster</label>
        </div>
      </div>
      <button type="button" id="v3HelpBtn" class="v3-ghost" title="Hjälp och kortkommandon (?)">${I.help}<span>Hjälp</span></button>
      <button type="button" id="v3SaveIfc" class="v3-primary" title="Etableringen som IFC i Trimble Connect (görs av 4D-planering)">${I.upload}<span>Spara som IFC i TC</span></button>
    </div>
    <div class="v3-main">
      <div class="v3-pal ${P.pal ? "" : "hidden"}" id="v3Pal">
        <div class="v3-pal-head"><b>Lägg till</b><button type="button" id="v3PalClose" title="Dölj biblioteket">‹</button></div>
        <input type="search" id="v3PalSearch" placeholder="Sök…" />
        <div id="v3Lib"></div>
        <div class="v3-pal-hint">Tryck på ett objekt här och sedan där det ska stå. Staket: tryck punkt för punkt och avsluta med Enter.</div>
      </div>
      <div class="v3-canvas" id="v3Canvas">
        <button type="button" class="v3-palopen ${P.pal ? "hidden" : ""}" id="v3PalOpen" title="Visa biblioteket">＋ Lägg till</button>
        <div class="v3-side hidden" id="v3Side"></div>
        <div class="v3-info hidden" id="v3Info"></div>
        <div class="v3-legend ${P.legend ? "" : "hidden"}" id="v3Legend"></div>
        <div class="v3-labels" id="v3Labels"></div>
        <div class="v3-help hidden" id="v3Help"></div>
        <div class="v3-ctx hidden" id="v3Ctx"></div>
        <div class="v3-toast hidden" id="v3Toast"></div>
      </div>
    </div>
    <div class="v3-foot">
      <span class="v3-status" id="v3Status"></span>
      <label class="v3-chk" title="Objektet ställer sig på ytan under sig när du släpper handtagen"><input type="checkbox" id="v3Snap" ${P.snap ? "checked" : ""} /> Fäst mot ytor</label>
      <select id="v3Step" title="Steg för handtag och piltangenter">${[["0", "fritt"], ["0.1", "0,1 m · 5°"], ["0.5", "0,5 m · 15°"], ["1", "1 m · 45°"]].map(([v, l]) => `<option value="${v}" ${P.step === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <label class="v3-date" title="Datum för statusfärgerna (samma som i lägesplanen)">Datum <input type="date" id="v3Date" /></label>
      <span class="v3-coord" id="v3Coord"></span>
      <span class="v3-save" id="v3Save"></span>
    </div>`;
  (document.querySelector("main") || document.body).appendChild(box);
  const $3 = id => box.querySelector("#" + id);
  $3("v3Close").onclick = close3d;
  box.querySelectorAll("[data-v3tool]").forEach(b => { b.onclick = () => { if (typeof l3SetTool === "function") l3SetTool(b.dataset.v3tool); }; });
  $3("v3Step").onchange = () => { l3SetPref("step", $3("v3Step").value); l3ApplyStep(); };
  $3("v3Snap").onchange = () => l3SetPref("snap", $3("v3Snap").checked);
  $3("v3Date").onchange = () => { const v = $3("v3Date").value; if (!v) return; $("dateInput").value = v; $("dateInput").dispatchEvent(new Event("change")); };
  $3("v3Undo").onclick = l3Undo;
  $3("v3Redo").onclick = l3Redo;
  $3("v3Fit").onclick = () => l3Frame(true);
  const dd = (btn, pop) => { $3(btn).onclick = e => { e.stopPropagation(); const open = $3(pop).classList.contains("hidden"); l3HideMenus(); $3(pop).classList.toggle("hidden", !open); }; $3(pop).onclick = e => e.stopPropagation(); };
  dd("v3ViewsBtn", "v3Views"); dd("v3ShowBtn", "v3Show");
  box.querySelectorAll("[data-v3view]").forEach(b => { b.onclick = () => { l3HideMenus(); l3View(b.dataset.v3view); }; });
  $3("v3ShowPlan").onchange = e => { l3SetPref("plan", e.target.checked); if (l3.planMesh) l3.planMesh.visible = e.target.checked; l3Render(); };
  box.querySelectorAll("[data-v3objs]").forEach(b => { b.onclick = () => { l3SetPref("objs", b.dataset.v3objs); box.querySelectorAll("[data-v3objs]").forEach(x => x.classList.toggle("on", x === b)); l3BuildObjects(); l3Render(); }; });
  $3("v3LabelsChk").onchange = e => { l3SetPref("labels", e.target.checked); l3Render(); };
  $3("v3LegendChk").onchange = e => { l3SetPref("legend", e.target.checked); $3("v3Legend").classList.toggle("hidden", !e.target.checked); };
  const pal = on => { l3SetPref("pal", on); $3("v3Pal").classList.toggle("hidden", !on); $3("v3PalOpen").classList.toggle("hidden", on); $3("v3PalChk").checked = on; setTimeout(() => { l3Resize(); l3Render(); }, 0); };
  $3("v3PalChk").onchange = e => pal(e.target.checked);
  $3("v3PalClose").onclick = () => pal(false);
  $3("v3PalOpen").onclick = () => pal(true);
  $3("v3PalSearch").oninput = l3RenderLib;
  $3("v3BldgBtn").onclick = () => { if (typeof l3bOpenDialog === "function") l3bOpenDialog(); };
  $3("v3SaveIfc").onclick = l3SaveIfc;
  $3("v3HelpBtn").onclick = e => { e.stopPropagation(); const h = $3("v3Help"); const open = h.classList.contains("hidden"); l3HideMenus(); if (open) { h.innerHTML = l3HelpHtml(); h.classList.remove("hidden"); } };
  box.addEventListener("click", () => l3HideMenus());
  return box;
}
function l3HideMenus() {
  ["v3Views", "v3Show", "v3Ctx", "v3Help"].forEach(id => { const el = document.getElementById(id); if (el) el.classList.add("hidden"); });
}
function l3Status(t, bad) { const el = document.getElementById("v3Status"); if (el) { el.textContent = t || ""; el.classList.toggle("bad", !!bad); el.title = t || ""; } }
let l3ToastTimer = 0;
function l3Toast(text, action, fn, ms = 6000) {
  const el = document.getElementById("v3Toast");
  if (!el) return;
  el.innerHTML = `<span>${escHtml(text)}</span>${action ? `<button type="button">${escHtml(action)}</button>` : ""}`;
  el.classList.remove("hidden");
  if (action) el.querySelector("button").onclick = e => { e.stopPropagation(); el.classList.add("hidden"); fn(); };
  clearTimeout(l3ToastTimer); l3ToastTimer = setTimeout(() => el.classList.add("hidden"), ms);
}
function l3SaveState(s, msg) {
  const el = document.getElementById("v3Save");
  if (!el) return;
  el.className = "v3-save " + s;
  el.textContent = { saving: "Sparar…", ok: "✓ Sparat", err: "Kunde inte spara – försöker igen" }[s] || "";
  el.title = msg || (s === "ok" ? "Alla ändringar är sparade (samma fil som Placera i 3D i 4D-planering)" : "");
}
function l3HelpHtml() {
  const r = (k, t) => `<tr><td><kbd>${k}</kbd></td><td>${t}</td></tr>`;
  return `<div class="v3-help-h"><b>Hjälp</b><button type="button" onclick="this.closest('.v3-help').classList.add('hidden')">✕</button></div>
    <div class="v3-help-c"><div><b>Navigera</b><table>
      ${r("Vänster dra", "Snurra runt")}${r("Höger dra / Skift + dra", "Panorera")}${r("Hjul", "Zooma")}${r("1 finger", "Snurra (iPad)")}${r("2 fingrar", "Zooma och panorera (iPad)")}${r("Dubbelklick", "Zooma till objektet")}${r("Home", "Visa allt")}${r("F", "Zooma till markerat")}</table></div>
    <div><b>Verktyg</b><table>${r("V", "Välj (Skift = flera)")}${r("M", "Flytta punkt till punkt")}${r("Q", "Vrid")}${r("A", "Rikta kant mot kant")}${r("T", "Mät")}${r("Esc", "Avbryt / avmarkera")}</table></div>
    <div><b>Under Flytta/Vrid</b><table>${r("→ ← ↑", "Lås röd / grön / blå axel")}${r("↓", "Släpp axellåset")}${r("5,5 Enter", "Exakt avstånd eller vinkel")}</table></div>
    <div><b>Markerat</b><table>${r("Pilar", "Flytta ett steg (Skift = 10)")}${r("PgUp / PgDn", "Upp / ned")}${r(", .", "Vrid ett steg")}${r("Ctrl+C / Ctrl+V", "Kopiera / klistra in vid markören")}${r("Ctrl+D", "Duplicera")}${r("Delete", "Ta bort")}${r("Ctrl+Z / Ctrl+Y", "Ångra / gör om")}${r("Högerklick / håll inne", "Meny")}</table></div></div>`;
}

// ---------------------------------------------------------------------
// Scenen
// ---------------------------------------------------------------------
function l3Init(box) {
  const host = box.querySelector("#v3Canvas");
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  host.insertBefore(renderer.domElement, host.firstChild);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9eef4);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 20000);
  camera.up.set(0, 0, 1);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.8));
  const sun = new THREE.DirectionalLight(0xffffff, 0.65); sun.position.set(-0.5, -0.8, 1.2); scene.add(sun);
  const orbit = new THREE.OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = false; orbit.screenSpacePanning = true; orbit.maxPolarAngle = Math.PI * 0.495;
  const gizmo = new THREE.TransformControls(camera, renderer.domElement);
  gizmo.setSpace("world"); gizmo.size = 0.9;
  scene.add(gizmo);
  const groups = { plan: new THREE.Group(), objs: new THREE.Group(), bldg: new THREE.Group(), places: new THREE.Group(), sel: new THREE.Group(), meas: new THREE.Group(), tmp: new THREE.Group() };
  Object.values(groups).forEach(g => scene.add(g));
  const [m1] = plan.calib.model;
  l3 = { renderer, scene, camera, orbit, gizmo, groups, O: [m1[0], m1[1], m1[2] || 0], placeMeshes: new Map(), sel: new Set(), hoverId: null, date: null, addType: null, tool: "select", prefs: l3Prefs(), clip: null, lastPoint: null, flyId: 0 };
  orbit.addEventListener("change", l3Render);
  orbit.addEventListener("start", l3StopFly); // egen kamerarörelse avbryter en pågående övergång
  gizmo.addEventListener("change", l3Render);
  gizmo.addEventListener("dragging-changed", e => { orbit.enabled = !e.value; });
  gizmo.addEventListener("mouseDown", () => { if (typeof placeSnapshot === "function") placeSnapshot(); l3.dragStart = l3GroupState(); });
  gizmo.addEventListener("objectChange", l3FromGizmo);
  gizmo.addEventListener("mouseUp", l3DragEnd);
  l3ApplyStep();
  if (typeof l3ToolsInit === "function") l3ToolsInit();
  const el = renderer.domElement;
  // Tryck (inte dra) = välja / lägga till / verktyg. Håll inne (touch) = meny.
  let down = null, press = 0;
  el.addEventListener("pointerdown", e => {
    down = { x: e.clientX, y: e.clientY, t: Date.now(), longed: false };
    clearTimeout(press);
    if (e.pointerType === "touch") press = setTimeout(() => { if (down && !gizmo.dragging) { down.longed = true; l3OpenCtx(e.clientX, e.clientY, e); } }, 550);
  });
  el.addEventListener("pointermove", e => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) clearTimeout(press);
    l3Hover(e);
  });
  el.addEventListener("pointerup", e => {
    clearTimeout(press);
    if (!down || gizmo.dragging || down.longed) { down = null; return; }
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    if (moved < 6 && e.button !== 2) l3Tap(e);
  });
  el.addEventListener("pointerleave", () => { l3SetHover(null); const c = document.getElementById("v3Coord"); if (c) c.textContent = ""; });
  el.addEventListener("contextmenu", e => { e.preventDefault(); l3OpenCtx(e.clientX, e.clientY, e); });
  el.addEventListener("dblclick", e => {
    if (l3.tool !== "select") return;
    const id = l3PlaceAt(e);
    if (id) { l3SelectIds([id]); l3View("sel"); }
    else { const h = l3Ray(e, l3Surfaces())[0]; if (h) l3FlyTo(h.point, Math.max(8, l3.camera.position.distanceTo(h.point) * 0.45)); }
  });
  window.addEventListener("resize", () => { if (l3 && !document.getElementById("view3d").classList.contains("hidden")) { l3Resize(); l3Render(); } });
  window.addEventListener("keydown", l3Key, true); // före lägesplanens kortkommandon (de stängs av i 3D)
  // Datum (uppspelning m.m.) -> statusfärgerna följer med.
  setInterval(() => {
    const b = document.getElementById("view3d");
    if (!l3 || !b || b.classList.contains("hidden")) return;
    const d = $("dateInput").value;
    l3SyncDate();
    if (d !== l3.date) { l3BuildObjects(); if (typeof l3bRecolor === "function") l3bRecolor(); l3RenderLegend(); l3Render(); }
  }, 700);
}
function l3SyncDate() { const el = document.getElementById("v3Date"); if (el && document.activeElement !== el && el.value !== $("dateInput").value) el.value = $("dateInput").value; }
function l3Resize() {
  if (!l3) return;
  const host = document.getElementById("v3Canvas"), w = host.clientWidth || 800, h = host.clientHeight || 600;
  l3.renderer.setSize(w, h); l3.camera.aspect = w / h; l3.camera.updateProjectionMatrix();
}
let l3Raf = 0;
function l3Render() {
  if (!l3 || l3Raf) return;
  l3Raf = requestAnimationFrame(() => {
    l3Raf = 0;
    l3.groups.sel.children.forEach(h => h.update && h.update());
    l3.renderer.render(l3.scene, l3.camera);
    l3RenderLabels();
  });
}
const l3Clear = g => { while (g.children.length) { const c = g.children.pop(); c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); }); } };

/* Arbetsytans PDF som mark, på kalibreringens höjd. */
async function l3BuildPlan() {
  l3Clear(l3.groups.plan); l3.planMesh = null;
  const z = (plan.calib.model[0][2] || 0) - l3.O[2];
  if (!page) { const g = new THREE.GridHelper(200, 40, 0x94a3b8, 0xcbd5e1); g.rotateX(Math.PI / 2); g.position.z = z; l3.groups.plan.add(g); return; }
  const v1 = page.getViewport({ scale: 1 });
  const s = Math.min(4096 / Math.max(v1.width, v1.height), 4);
  const vp = page.getViewport({ scale: s });
  const cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const corners = [[0, cv.height], [cv.width, cv.height], [cv.width, 0], [0, 0]];
  const pos = [], uv = [];
  corners.forEach(([cx, cy]) => {
    const [px, py] = vp.convertToPdfPoint(cx, cy), [mx, my] = l3PdfToModel(px, py);
    pos.push(mx - l3.O[0], my - l3.O[1], z); uv.push(cx / cv.width, 1 - cy / cv.height);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 8;
  if ("encoding" in tex) tex.encoding = THREE.sRGBEncoding;
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
  m.userData.surface = true; m.userData.kind = "plan";
  l3.planMesh = m; l3.groups.plan.add(m);
  m.visible = l3Prefs().plan;
}

/* Status (fas) för en planeringsrad vid datumet i lägesplanen. */
function l3Phase(r) {
  const at = $("dateInput").value || todayIso();
  const warn = Number.isFinite(settings.warningDaysBeforeEnd) ? settings.warningDaysBeforeEnd : 7;
  return r ? computeItemPhase(r, at, warn) || "planerad" : "ingen";
}
/* De planerade objekten som lådor i statusfärg (en enda geometri – tål tusentals objekt). */
function l3BuildObjects() {
  l3Clear(l3.groups.objs); l3.objMesh = null;
  l3.date = $("dateInput").value;
  const mode = l3Prefs().objs;
  if (mode === "hidden" || !positions.length) return;
  const byId = new Map(items.map(r => [r.id, r]));
  const pos = [], col = [], ids = [];
  const F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  positions.forEach(p => {
    const c = new THREE.Color(phaseColor(l3Phase(byId.get(p.id))));
    const h = 0.25;
    const x0 = (p.x0 ?? p.x - h) - l3.O[0], x1 = (p.x1 ?? p.x + h) - l3.O[0], y0 = (p.y0 ?? p.y - h) - l3.O[1], y1 = (p.y1 ?? p.y + h) - l3.O[1];
    const z0 = (p.z0 ?? 0) - l3.O[2], z1 = Math.max(p.z1 ?? 0, (p.z0 ?? 0) + 0.05) - l3.O[2];
    const V = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    (mode === "edges" ? E : F).forEach(f => f.forEach(i => { pos.push(...V[i]); col.push(c.r, c.g, c.b); ids.push(p.id); }));
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  let m;
  if (mode === "edges") m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true }));
  else {
    g.computeVertexNormals();
    const ghost = mode === "ghost";
    m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: ghost, opacity: ghost ? 0.3 : 1, depthWrite: !ghost }));
    m.userData.surface = true;
  }
  m.userData.ids = ids; m.userData.kind = "objs";
  l3.objMesh = m; l3.groups.objs.add(m);
}
/* Statusförklaring: bara de statusar som syns. */
function l3RenderLegend() {
  const el = document.getElementById("v3Legend");
  if (!el || !l3) return;
  const byId = new Map(items.map(r => [r.id, r])), n = {};
  const ids = new Set(positions.map(p => p.id));
  if (typeof l3bCoupledIds === "function") l3bCoupledIds().forEach(id => ids.add(id));
  ids.forEach(id => { const ph = l3Phase(byId.get(id)); n[ph] = (n[ph] || 0) + 1; });
  const order = [...PHASE_ORDER, "ingen"].filter(k => n[k]);
  el.innerHTML = order.length ? `<div class="v3-legend-h">Status ${escHtml($("dateInput").value || "")}</div>` + order.map(k => `<div><i style="background:${phaseColor(k)}"></i>${escHtml(PHASE_LABELS[k] || k)} <span>${n[k]}</span></div>`).join("") : "";
}

/* Ett etableringsobjekt som en grupp i sitt eget lokala system (origo = insättningspunkten, ovridet),
   så att handtagens flytt/vridning blir x/y/z/rot direkt. */
function l3PlacementGroup(p) {
  const grp = new THREE.Group();
  grp.userData.placeId = p.id;
  const lib = placeLib(p.type) || {};
  const z = (Number(p.z) || 0) + (Number(p.dz) || 0);
  const add = (geo, color, transp) => {
    const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color), transparent: transp > 0, opacity: 1 - (transp || 0), depthWrite: !(transp > 0.5), side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, mat); m.userData.placeId = p.id; grp.add(m); return m;
  };
  const prism = (poly, z0, z1) => {
    const n = poly.length, pos = [];
    const P = (q, zz) => [q[0], q[1], zz];
    for (let k = 1; k + 1 < n; k++) pos.push(...P(poly[0], z0), ...P(poly[k + 1], z0), ...P(poly[k], z0), ...P(poly[0], z1), ...P(poly[k], z1), ...P(poly[k + 1], z1));
    for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; pos.push(...P(a, z0), ...P(b, z0), ...P(b, z1), ...P(a, z0), ...P(b, z1), ...P(a, z1)); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
  };
  if (lib.isModel) {
    const a = lib.model, mesh = a && typeof placeMeshCache !== "undefined" ? placeMeshCache.get(a.id) : null;
    const k = placeScale(p);
    if (mesh) {
      mesh.parts.forEach(pt => {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.Float32BufferAttribute(pt.p.map(v => v / 1000 * k), 3));
        g.setIndex(pt.i); g.computeVertexNormals();
        add(g, pt.c, pt.t || 0);
      });
    } else if (a && a.bbox) {
      const b = a.bbox;
      const m = add(prism([[b.min[0] * k, b.min[1] * k], [b.max[0] * k, b.min[1] * k], [b.max[0] * k, b.max[1] * k], [b.min[0] * k, b.max[1] * k]], b.min[2] * k, b.max[2] * k), "#0e7490", 0.55);
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0x0e7490 })));
    }
  } else {
    // Biblioteksobjekt: delarna räknade för en kopia i origo (ovriden), staket relativt första punkten.
    const local = { ...p, x: 0, y: 0, z: 0, dz: 0, rot: 0 };
    if (p.pts) local.pts = p.pts.map(q => [q[0] - p.x, q[1] - p.y, (q[2] || 0) - (Number(p.z) || 0)]);
    placeParts(local, 48).forEach(pt => add(prism(pt.poly, pt.z0, pt.z1), p.color || lib.color || "#888888", pt.transp || 0));
    if (lib.fence && (p.pts || []).length === 1) add(prism([[-0.05, -0.05], [0.05, -0.05], [0.05, 0.05], [-0.05, 0.05]], 0, Number(p.H) || 2), p.color || lib.color, 0);
  }
  grp.position.set(p.x - l3.O[0], p.y - l3.O[1], z - l3.O[2]);
  if (!lib.fence) grp.rotation.z = (Number(p.rot) || 0) * Math.PI / 180;
  return grp;
}
function l3BuildPlacements() {
  l3.gizmo.detach();
  l3Clear(l3.groups.places); l3.placeMeshes.clear();
  placements.forEach(p => { const g = l3PlacementGroup(p); l3.groups.places.add(g); l3.placeMeshes.set(p.id, g); });
  l3SelectIds([...l3.sel].filter(id => l3.placeMeshes.has(id)));
  // Modeller utan inläst geometri (t.ex. IFC hämtad innan web-ifc fanns): läs in i bakgrunden.
  const seen = new Set();
  placements.forEach(p => { const a = (placeLib(p.type) || {}).model; if (a && !seen.has(a.id) && !placeMeshCache.has(a.id)) { seen.add(a.id); placeEnsureOutline(a); } });
}
/* Geometrin för en modell blev klar: rita om dess placeringar. */
function l3RebuildAsset(assetId) {
  if (!l3) return;
  placements.filter(p => p.type === `model:${assetId}`).forEach(l3RebuildOne);
}
function l3RebuildOne(p) {
  const old = l3.placeMeshes.get(p.id);
  if (old) { if (l3.gizmo.object === old) l3.gizmo.detach(); l3.groups.places.remove(old); old.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  const g = l3PlacementGroup(p); l3.groups.places.add(g); l3.placeMeshes.set(p.id, g);
  l3RefreshSel();
  l3Render();
}
function l3AddPlacementMesh(p) { const g = l3PlacementGroup(p); l3.groups.places.add(g); l3.placeMeshes.set(p.id, g); return g; }

// ---------------------------------------------------------------------
// Kamera: översikt, vyer, fokus (mjuka övergångar)
// ---------------------------------------------------------------------
function l3SceneBox(onlySel) {
  const b = new THREE.Box3();
  if (onlySel) { l3.sel.forEach(id => { const g = l3.placeMeshes.get(id); if (g) b.expandByObject(g); }); return b; }
  [l3.groups.objs, l3.groups.places, l3.groups.bldg].forEach(g => { if (g.children.length) b.expandByObject(g); });
  if (b.isEmpty() && l3.planMesh) b.expandByObject(l3.planMesh);
  if (b.isEmpty()) b.set(new THREE.Vector3(-50, -50, 0), new THREE.Vector3(50, 50, 10));
  return b;
}
function l3FlyTo(target, dist, dir, ms = 450) {
  const cam = l3.camera, orbit = l3.orbit;
  const d = dir ? dir.clone().normalize() : cam.position.clone().sub(orbit.target).normalize();
  const toPos = target.clone().add(d.multiplyScalar(dist));
  cam.near = Math.max(0.05, dist / 2000); cam.far = Math.max(cam.far, dist * 40); cam.updateProjectionMatrix();
  const p0 = cam.position.clone(), t0 = orbit.target.clone(), start = performance.now(), id = ++l3.flyId;
  if (!ms) { cam.position.copy(toPos); orbit.target.copy(target); orbit.update(); l3Render(); return; }
  const step = now => {
    if (id !== l3.flyId) return; // användaren tog över kameran
    const k = Math.min(1, (now - start) / ms), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    cam.position.lerpVectors(p0, toPos, e); orbit.target.lerpVectors(t0, target, e); orbit.update();
    l3.renderer.render(l3.scene, l3.camera); l3RenderLabels();
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function l3StopFly() { if (l3) l3.flyId = (l3.flyId || 0) + 1; }
function l3Frame(animate = true) {
  const b = l3SceneBox(), c = b.getCenter(new THREE.Vector3()), size = Math.max(10, b.getSize(new THREE.Vector3()).length());
  l3.camera.far = size * 20; l3.camera.updateProjectionMatrix();
  l3FlyTo(c, size * 0.95, new THREE.Vector3(-0.45, -0.75, 0.55), animate ? 450 : 0);
}
function l3View(v) {
  if (v === "sel") {
    if (!l3.sel.size) { l3Status("Markera ett objekt först (tryck på det)."); return; }
    const b = l3SceneBox(true), c = b.getCenter(new THREE.Vector3()), size = Math.max(4, b.getSize(new THREE.Vector3()).length());
    l3FlyTo(c, size * 1.6); return;
  }
  if (v === "iso") return l3Frame(true);
  const b = l3SceneBox(), c = b.getCenter(new THREE.Vector3()), size = Math.max(10, b.getSize(new THREE.Vector3()).length());
  const dirs = { top: [0, -0.0001, 1], n: [0, 1, 0.35], s: [0, -1, 0.35], e: [1, 0, 0.35], w: [-1, 0, 0.35] };
  l3FlyTo(c, size * (v === "top" ? 1.1 : 0.9), new THREE.Vector3(...dirs[v]));
}

// ---------------------------------------------------------------------
// Träffar, markering och hovring
// ---------------------------------------------------------------------
function l3Ray(e, targets) {
  const r = l3.renderer.domElement.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), l3.camera);
  return ray.intersectObjects(targets, true).filter(h => h.object.visible && h.object.type !== "LineSegments" && h.object.type !== "Line" && l3VisibleChain(h.object));
}
const l3VisibleChain = o => { while (o) { if (!o.visible) return false; o = o.parent; } return true; };
const l3Surfaces = (exceptId) => [l3.planMesh, l3.objMesh, ...l3.groups.bldg.children, ...[...l3.placeMeshes.entries()].filter(([id]) => !(exceptId instanceof Set ? exceptId.has(id) : id === exceptId)).map(([, g]) => g)].filter(o => o && o.visible !== false);
function l3PlaceAt(e) {
  const hit = l3Ray(e, [...l3.placeMeshes.values()])[0];
  let o = hit && hit.object;
  while (o && !o.userData.placeId) o = o.parent;
  return o ? o.userData.placeId : null;
}
/* Markerar ids (etableringsobjekt). Handtagen visas när ett objekt är markerat i Välj. */
function l3SelectIds(ids) {
  l3.sel = new Set(ids.filter(id => placements.some(p => p.id === id)));
  placeActiveId = l3.sel.size ? [...l3.sel][l3.sel.size - 1] : null;
  l3RefreshSel();
  l3RenderSide();
  if (l3.sel.size) l3HideInfo();
  l3Render();
}
function l3Select(id) { l3SelectIds(id ? [id] : []); }
function l3RefreshSel() {
  if (!l3) return;
  l3Clear(l3.groups.sel);
  l3.sel.forEach(id => { const g = l3.placeMeshes.get(id); if (g) { const h = new THREE.BoxHelper(g, 0xf59e0b); h.material.depthTest = false; h.renderOrder = 5; l3.groups.sel.add(h); } });
  const one = l3.sel.size === 1 && (l3.tool || "select") === "select" ? l3.placeMeshes.get([...l3.sel][0]) : null;
  if (one) { if (l3.gizmo.object !== one) l3.gizmo.attach(one); } else l3.gizmo.detach();
  if (one) l3Mode(l3.gizmo.mode || "translate");
}
function l3SetHover(id) {
  if (!l3 || l3.hoverId === id) return;
  const set = (pid, on) => { const g = pid && l3.placeMeshes.get(pid); if (g) g.traverse(o => { if (o.isMesh && o.material && o.material.emissive) o.material.emissive.setHex(on ? 0x3b3b1a : 0x000000); }); };
  set(l3.hoverId, false); l3.hoverId = id; set(id, true);
  l3.renderer.domElement.style.cursor = id ? "pointer" : "";
  l3Render();
}
let l3HoverRaf2 = 0, l3HoverEv = null;
function l3Hover(e) {
  l3HoverEv = e;
  if (l3HoverRaf2) return;
  l3HoverRaf2 = requestAnimationFrame(() => {
    l3HoverRaf2 = 0;
    const ev = l3HoverEv; if (!ev || !l3) return;
    if (l3.tool === "select" && !l3.gizmo.dragging && !l3.addType) l3SetHover(l3PlaceAt(ev)); else l3SetHover(null);
    // Koordinaten under markören (verktygen visar fästpunkten själva).
    const h = l3.lastSnap && l3.tool !== "select" ? { point: l3.lastSnap } : l3Ray(ev, l3Surfaces())[0];
    const c = document.getElementById("v3Coord");
    if (h && c) {
      l3.lastPoint = h.point.clone();
      const f = v => v.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      c.textContent = `X ${f(h.point.x + l3.O[0])}  Y ${f(h.point.y + l3.O[1])}  Z ${f(h.point.z + l3.O[2])}`;
    }
  });
}
function l3Tap(e) {
  l3HideMenus();
  if (l3.tool && l3.tool !== "select" && typeof l3ToolTap === "function" && l3ToolTap(e)) return;
  if (l3.addType) return l3AddAt(e);
  const id = l3PlaceAt(e);
  if (id) {
    if (e.shiftKey || e.ctrlKey || e.metaKey) { const s = new Set(l3.sel); if (s.has(id)) s.delete(id); else s.add(id); l3SelectIds([...s]); }
    else l3SelectIds([id]);
    return;
  }
  if (!(e.shiftKey || e.ctrlKey || e.metaKey)) l3SelectIds([]);
  // Planerat objekt eller byggnaden: visa uppgifterna.
  const h = l3Ray(e, [l3.objMesh, ...l3.groups.bldg.children].filter(Boolean))[0];
  if (h) l3ShowHitInfo(h); else l3HideInfo();
}

// ---------------------------------------------------------------------
// Lägga till från biblioteket (staket punkt för punkt)
// ---------------------------------------------------------------------
function l3AddAt(e) {
  const s = typeof l3Snap === "function" ? l3Snap(e) : null;
  const h = s ? { point: s.point } : l3Ray(e, l3Surfaces())[0];
  if (!h) { l3Status("Tryck på marken eller ett objekt."); return; }
  const pt = [h.point.x + l3.O[0], h.point.y + l3.O[1], h.point.z + l3.O[2]];
  const fence = (placeLib(l3.addType) || {}).fence;
  if (fence && l3.fenceId) {
    const p = placements.find(x => x.id === l3.fenceId);
    if (p) { placeSnapshot(); p.pts.push(pt.map(placeR3)); placeTouch(p); l3RebuildOne(p); l3Changed(); l3Status(`Staket: ${p.pts.length} punkter. Tryck nästa punkt – Enter eller Esc när du är klar.`); return; }
  }
  placeSnapshot();
  const p = placeNew(l3.addType, pt);
  placements.push(p); placeTouch(p);
  l3AddPlacementMesh(p);
  if (fence) { l3.fenceId = p.id; l3Status("Staket: tryck nästa punkt – Enter eller Esc när du är klar."); }
  else { l3.addType = null; l3Status(`${p.name} tillagd. Dra i handtagen eller använd Flytta/Vrid för att justera.`); }
  l3RenderLib(); l3SelectIds([p.id]); l3Changed();
}
function l3EndAdd() { l3.addType = null; l3.fenceId = null; l3RenderLib(); }

// ---------------------------------------------------------------------
// Handtag
// ---------------------------------------------------------------------
function l3Mode(mode) {
  const p = placeActive(), fence = p && (placeLib(p.type) || {}).fence;
  if (fence) mode = "translate";
  l3.gizmo.setMode(mode);
  const rot = mode === "rotate";
  l3.gizmo.showX = !rot; l3.gizmo.showY = !rot; l3.gizmo.showZ = true;
  document.querySelectorAll("[data-v3mode]").forEach(b => b.classList.toggle("on", b.dataset.v3mode === mode));
  l3Render();
}
function l3ApplyStep() {
  const v = Number((document.getElementById("v3Step") || {}).value) || 0;
  l3.gizmo.setTranslationSnap(v || null);
  l3.gizmo.setRotationSnap(v ? ({ 0.1: 5, 0.5: 15, 1: 45 }[v] || 15) * Math.PI / 180 : null);
}
const l3GroupState = () => { const g = l3.gizmo.object; return g ? { x: g.position.x, y: g.position.y, z: g.position.z } : null; };
/* Handtagen -> placeringen (meter i modellens system). */
function l3FromGizmo() {
  const g = l3.gizmo.object, p = g && placements.find(x => x.id === g.userData.placeId);
  if (!p) return;
  const nx = placeR3(g.position.x + l3.O[0]), ny = placeR3(g.position.y + l3.O[1]), nz = g.position.z + l3.O[2];
  if (p.pts) { const dx = nx - p.x, dy = ny - p.y; p.pts = p.pts.map(q => [placeR3(q[0] + dx), placeR3(q[1] + dy), q[2] || 0]); }
  p.x = nx; p.y = ny;
  p.dz = placeR3(nz - (Number(p.z) || 0));
  if (!(placeLib(p.type) || {}).fence) p.rot = Math.round((((g.rotation.z * 180 / Math.PI) % 360) + 360) % 360 * 10) / 10;
  l3RenderSide(true);
}
function l3DragEnd() {
  const g = l3.gizmo.object, p = g && placements.find(x => x.id === g.userData.placeId);
  if (!p) return;
  const s = l3.dragStart, moved = s && (Math.abs(s.x - g.position.x) > 1e-4 || Math.abs(s.y - g.position.y) > 1e-4);
  // Fäst mot ytan: efter en flytt i plan ställer sig objektet på det som ligger under det.
  if (moved && l3.gizmo.mode === "translate" && document.getElementById("v3Snap").checked && Math.abs(s.z - g.position.z) < 1e-4) l3DropToSurface(p, g);
  placeTouch(p); l3Changed(); l3RenderSide();
}
/* Ställer objektet på ytan rakt under dess mitt (plan, planerade objekt, byggnaden eller annan etablering). */
function l3DropToSurface(p, g) {
  const ray = new THREE.Raycaster(new THREE.Vector3(g.position.x, g.position.y, g.position.z + 500), new THREE.Vector3(0, 0, -1));
  const hits = ray.intersectObjects(l3Surfaces(p.id), true).filter(h => h.object.visible && h.object.type !== "LineSegments" && l3VisibleChain(h.object));
  if (!hits.length) return false;
  const zTop = hits[0].point.z + l3.O[2];
  p.z = placeR3(zTop); p.dz = 0;
  if (p.pts) p.pts = p.pts.map(q => [q[0], q[1], placeR3(zTop)]);
  g.position.z = zTop - l3.O[2];
  l3Render();
  return true;
}

// ---------------------------------------------------------------------
// Åtgärder på markeringen
// ---------------------------------------------------------------------
const l3SelList = () => placements.filter(p => l3.sel.has(p.id));
function l3DeleteSel() {
  const list = l3SelList();
  if (!list.length) return;
  placeSnapshot();
  const ids = new Set(list.map(p => p.id));
  placements = placements.filter(p => !ids.has(p.id));
  ids.forEach(id => { placeDeleted.add(id); placeDirty.delete(id); const g = l3.placeMeshes.get(id); if (g) { if (l3.gizmo.object === g) l3.gizmo.detach(); l3.groups.places.remove(g); } l3.placeMeshes.delete(id); });
  placeScheduleSave();
  l3SelectIds([]); l3Changed();
  l3Toast(list.length === 1 ? `"${list[0].name}" borttagen.` : `${list.length} objekt borttagna.`, "Ångra", l3Undo);
}
function l3DuplicateSel() {
  const list = l3SelList();
  if (!list.length) return;
  placeSnapshot();
  const out = [];
  list.forEach(p => { const [c] = placeCopies(p, 1, placeExtent(p)[0] + 0.5, true); placements.push(c); placeTouch(c); l3AddPlacementMesh(c); out.push(c.id); });
  l3SelectIds(out); l3Changed();
  l3Status(out.length === 1 ? "Kopia skapad bredvid. Flytta den med handtagen eller Flytta (M)." : `${out.length} kopior skapade.`);
}
function l3CopySel() {
  const list = l3SelList();
  if (!list.length) return;
  l3.clip = list.map(p => JSON.parse(JSON.stringify(p)));
  l3Toast(`${list.length === 1 ? `"${list[0].name}"` : list.length + " objekt"} kopierat – Ctrl+V klistrar in vid markören.`);
}
function l3Paste(at) {
  if (!l3.clip || !l3.clip.length) { l3Status("Inget att klistra in – kopiera först (Ctrl+C)."); return; }
  const P = at || l3.lastPoint;
  const ref = l3.clip[0];
  const dx = P ? P.x + l3.O[0] - ref.x : 1, dy = P ? P.y + l3.O[1] - ref.y : 1, dz0 = P ? P.z + l3.O[2] - ref.z : 0;
  placeSnapshot();
  const out = [];
  l3.clip.forEach(src => {
    const c = JSON.parse(JSON.stringify(src));
    Object.assign(c, { id: ghNewId(), created_at: new Date().toISOString(), by: settings.userName || null });
    delete c.ifc_at;
    c.name = `${String(src.name || "").replace(/\s+\d+$/, "")} ${placements.filter(x => x.type === src.type).length + 1}`;
    placeShift(c, dx, dy, 0);
    c.z = placeR3((Number(c.z) || 0) + dz0);
    if (c.pts) c.pts = c.pts.map(q => [q[0], q[1], placeR3((q[2] || 0) + dz0)]);
    placements.push(c); placeTouch(c); l3AddPlacementMesh(c); out.push(c.id);
  });
  l3SelectIds(out); l3Changed();
  l3Status(`${out.length} objekt inklistrade.`);
}
function l3DropSel() {
  const list = l3SelList();
  if (!list.length) return;
  placeSnapshot();
  let n = 0;
  list.forEach(p => { const g = l3.placeMeshes.get(p.id); if (g && l3DropToSurface(p, g)) { placeTouch(p); n++; } });
  if (n) { l3RefreshSel(); l3RenderSide(); l3Changed(); l3Status(n === 1 ? "Ställd på ytan." : `${n} objekt ställda på ytan.`); }
  else { placeUndoStack.pop(); l3Status("Ingen yta under objektet."); }
}
let l3NudgeAt = 0;
function l3NudgeSel(dx, dy, dz, drot) {
  const list = l3SelList();
  if (!list.length) return;
  if (Date.now() - l3NudgeAt > 1200) placeSnapshot();
  l3NudgeAt = Date.now();
  // Vridning: kring markeringens mitt (ett objekt: kring sin egen insättningspunkt).
  const cx = list.reduce((s, p) => s + p.x, 0) / list.length, cy = list.reduce((s, p) => s + p.y, 0) / list.length;
  list.forEach(p => {
    placeShift(p, dx, dy, dz);
    if (drot) placeRotateAbout(p, list.length === 1 ? p.x : cx, list.length === 1 ? p.y : cy, drot);
    placeTouch(p); l3RebuildOne(p);
  });
  l3RenderSide(true); l3Changed();
}
const l3StepVal = () => Number((document.getElementById("v3Step") || {}).value) || 0.1;

// ---------------------------------------------------------------------
// Meny (högerklick / håll inne)
// ---------------------------------------------------------------------
function l3OpenCtx(x, y, e) {
  const ctx = document.getElementById("v3Ctx");
  if (!ctx || !l3) return;
  l3HideMenus();
  const id = l3PlaceAt(e);
  if (id && !l3.sel.has(id)) l3SelectIds([id]);
  const hit = l3Ray(e, l3Surfaces())[0], at = hit ? hit.point.clone() : null;
  const has = l3.sel.size > 0, n = l3.sel.size;
  const items = has ? [
    ["move", "Flytta punkt till punkt", "M"], ["rotate", "Vrid", "Q"], n === 1 ? ["align", "Rikta kant mot kant", "A"] : null, null,
    ["dup", "Duplicera", "Ctrl+D"], ["copy", "Kopiera", "Ctrl+C"], ["drop", "Ställ på ytan", ""], ["focus", "Zooma hit", "F"], null,
    ["del", n === 1 ? "Ta bort" : `Ta bort ${n} objekt`, "Del"],
  ] : [["paste", "Klistra in här", "Ctrl+V"], ["fit", "Visa allt", "Home"], ["top", "Uppifrån", ""]];
  ctx.innerHTML = items.map(it => it ? `<button type="button" data-ctx="${it[0]}" ${it[0] === "paste" && !(l3.clip && l3.clip.length) ? "disabled" : ""} class="${it[0] === "del" ? "v3-danger" : ""}"><span>${it[1]}</span><kbd>${it[2]}</kbd></button>` : "<hr/>").join("");
  const r = document.getElementById("v3Canvas").getBoundingClientRect();
  ctx.classList.remove("hidden");
  const w = ctx.offsetWidth, h = ctx.offsetHeight;
  ctx.style.left = Math.min(x - r.left, r.width - w - 6) + "px"; ctx.style.top = Math.min(y - r.top, r.height - h - 6) + "px";
  ctx.querySelectorAll("[data-ctx]").forEach(b => { b.onclick = ev => {
    ev.stopPropagation(); l3HideMenus();
    const k = b.dataset.ctx;
    if (k === "move" || k === "rotate" || k === "align") l3SetTool(k);
    else if (k === "dup") l3DuplicateSel(); else if (k === "copy") l3CopySel(); else if (k === "drop") l3DropSel();
    else if (k === "focus") l3View("sel"); else if (k === "del") l3DeleteSel();
    else if (k === "paste") l3Paste(at); else if (k === "fit") l3Frame(true); else if (k === "top") l3View("top");
  }; });
}

// ---------------------------------------------------------------------
// Egenskapspanelen (markerat etableringsobjekt) och infokortet (planerat objekt / byggnaden)
// ---------------------------------------------------------------------
function l3RenderSide(liveOnly) {
  const side = document.getElementById("v3Side");
  if (!side || !l3) return;
  const list = l3SelList();
  side.classList.toggle("hidden", !list.length);
  if (!list.length) { side.dataset.id = ""; return; }
  if (list.length > 1) {
    side.dataset.id = "multi";
    side.innerHTML = `<div class="v3-side-h"><b>${list.length} objekt markerade</b><button type="button" class="v3-x" id="v3Deselect" title="Avmarkera (Esc)">✕</button></div>
      <div class="v3-sub">${escHtml(list.map(p => p.name).join(", "))}</div>
      <div class="v3-btns"><button type="button" id="v3Drop">${L3_ICO.down}Ställ på ytan</button><button type="button" id="v3Copy">${L3_ICO.copy}Duplicera</button><button type="button" id="v3Del" class="v3-danger">${L3_ICO.trash}Ta bort</button></div>
      <div class="v3-hint">Flytta (M) och Vrid (Q) flyttar alla markerade tillsammans. Piltangenterna finjusterar.</div>`;
    side.querySelector("#v3Drop").onclick = l3DropSel; side.querySelector("#v3Copy").onclick = l3DuplicateSel;
    side.querySelector("#v3Del").onclick = l3DeleteSel; side.querySelector("#v3Deselect").onclick = () => l3SelectIds([]);
    return;
  }
  const p = list[0], lib = placeLib(p.type) || {}, A = lib.isModel ? lib.model : null;
  if (liveOnly && side.dataset.id === p.id) {
    const set = (k, v) => { const el = side.querySelector(`[data-v3f="${k}"]`); if (el && document.activeElement !== el) el.value = v; };
    set("x", p.x); set("y", p.y); set("dz", p.dz); set("rot", p.rot);
    return;
  }
  side.dataset.id = p.id;
  const f = (k, label, step = "0.1", val = p[k], unit = "m") => `<label><span>${label}</span><div class="v3-in"><input type="number" step="${step}" data-v3f="${k}" value="${val ?? ""}" /><em>${unit}</em></div></label>`;
  const mH = A && A.bbox ? Math.round((A.bbox.max[2] - A.bbox.min[2]) * placeScale(p) * 100) / 100 : "";
  const itemOpts = (typeof items !== "undefined" ? items : []).filter(r => r.start_date || r.object_name).slice(0, 3000);
  const col = p.color || lib.color || "#888888";
  side.innerHTML = `<div class="v3-side-h"><i class="v3-chip" style="background:${col}"></i><input type="text" class="v3-name" data-v3f="name" value="${escHtml(p.name || "")}" title="Namn" /><button type="button" class="v3-x" id="v3Deselect" title="Avmarkera (Esc)">✕</button></div>
    <div class="v3-sub">${escHtml(lib.label || p.type)}${A && A.author ? ` · ${escHtml(A.author)}` : ""}${A && A.kind === "ifc" && !placeMeshCache.has(A.id) ? " · IFC (läses in…)" : ""}</div>
    <div class="v3-sec">Läge</div>
    <div class="v3-grid">${f("x", "X")}${f("y", "Y")}${f("dz", "Över ytan")}${lib.fence ? "" : f("rot", "Vridning", "1", p.rot, "°")}</div>
    ${lib.fence ? "" : `<div class="v3-handles"><span>Handtag</span><button type="button" data-v3mode="translate" title="Pilar för att flytta (W)">↔ Flytta</button><button type="button" data-v3mode="rotate" title="Ring för att vrida (E)">⟳ Vrid</button></div>`}
    <div class="v3-sec">Mått</div>
    <div class="v3-grid">${lib.isModel ? (A && A.kind === "mesh" ? f("mH", "Höjd", "0.1", mH) : `<div class="v3-sub">${typeof placeModelDims === "function" ? escHtml(placeModelDims(p)) : ""}</div>`) : lib.fence ? f("H", "Höjd") : f("L", "Längd") + f("B", "Bredd") + f("H", "Höjd")}
      ${lib.R ? f("R", "Räckvidd", "1") : ""}${!lib.isModel ? `<label><span>Färg</span><input type="color" data-v3f="color" value="${col}" /></label>` : ""}</div>
    <div class="v3-sec">4D</div>
    <label class="v3-field"><span>Aktivitet</span><select data-v3f="itemId"><option value="">– ingen –</option>${itemOpts.map(r => `<option value="${escHtml(r.id)}" ${r.id === p.itemId ? "selected" : ""}>${escHtml(r.object_name || r.activity || r.id)}${r.start_date ? ` (${r.start_date} – ${r.end_date || ""})` : ""}</option>`).join("")}</select></label>
    <div class="v3-grid">${["start", "end"].map(k => `<label><span>${k === "start" ? "Start" : "Slut"}</span><input type="date" data-v3f="${k}" value="${p[k] || ""}" /></label>`).join("")}</div>
    <div class="v3-btns"><button type="button" id="v3Drop" title="Ställ objektet på ytan under det">${L3_ICO.down}Ställ på ytan</button>
      <button type="button" id="v3Copy" title="En kopia bredvid (Ctrl+D)">${L3_ICO.copy}Duplicera</button>
      <button type="button" id="v3Focus" title="Zooma hit (F)">${L3_ICO.focus}Zooma</button>
      <button type="button" id="v3Del" class="v3-danger" title="Ta bort (Delete) – kan ångras">${L3_ICO.trash}Ta bort</button></div>`;
  side.querySelectorAll("[data-v3f]").forEach(inp => {
    const k = inp.dataset.v3f;
    inp.onfocus = () => placeSnapshot();
    inp.onchange = () => {
      if (k === "name" || k === "color" || k === "start" || k === "end") p[k] = inp.value;
      else if (k === "itemId") {
        p.itemId = inp.value || null;
        const r = (items || []).find(x => x.id === p.itemId);
        if (r) { p.start = r.start_date || p.start || ""; p.end = r.end_date || p.end || ""; }
      } else {
        const v = placeNum(inp.value, p[k]);
        if (k === "x" || k === "y") { const d = v - p[k]; if (p.pts) p.pts = p.pts.map(q => k === "x" ? [placeR3(q[0] + d), q[1], q[2]] : [q[0], placeR3(q[1] + d), q[2]]); p[k] = placeR3(v); }
        else if (k === "mH") { const h = A.bbox.max[2] - A.bbox.min[2]; if (h > 0 && v > 0) p.scale = Math.round(v / h * 10000) / 10000; }
        else if (k === "rot") p.rot = ((v % 360) + 360) % 360;
        else if (k === "dz") p.dz = v;
        else p[k] = Math.max(k === "R" ? 0 : 0.01, v);
      }
      placeTouch(p); l3RebuildOne(p); l3Changed();
      if (k === "itemId" || k === "color") { side.dataset.id = ""; l3RenderSide(); }
    };
  });
  side.querySelectorAll("[data-v3mode]").forEach(b => { b.classList.toggle("on", b.dataset.v3mode === l3.gizmo.mode); b.onclick = () => l3Mode(b.dataset.v3mode); });
  side.querySelector("#v3Drop").onclick = l3DropSel;
  side.querySelector("#v3Copy").onclick = l3DuplicateSel;
  side.querySelector("#v3Focus").onclick = () => l3View("sel");
  side.querySelector("#v3Del").onclick = l3DeleteSel;
  side.querySelector("#v3Deselect").onclick = () => l3SelectIds([]);
}
/* Infokort för ett planerat objekt (låda) eller ett objekt i byggnaden. */
function l3ShowHitInfo(h) {
  let itemId = null, title = "", extra = [];
  if (h.object === l3.objMesh) {
    const ids = h.object.userData.ids, i = h.face ? h.face.a : h.index;
    itemId = ids && ids[i];
  } else if (typeof l3bHitInfo === "function") {
    const b = l3bHitInfo(h);
    if (b) { itemId = b.itemId; title = b.name; extra = b.extra || []; }
  }
  const r = itemId ? (items || []).find(x => x.id === itemId) : null;
  const ph = l3Phase(r);
  const row = (k, v) => v ? `<tr><td>${k}</td><td>${escHtml(v)}</td></tr>` : "";
  const el = document.getElementById("v3Info");
  el.innerHTML = `<div class="v3-side-h"><i class="v3-chip" style="background:${phaseColor(r ? ph : "ingen")}"></i><b>${escHtml((r && (r.object_name || r.activity)) || title || "Objekt")}</b><button type="button" class="v3-x" title="Stäng">✕</button></div>
    <table class="v3-info-t">${r ? row("Aktivitet", r.activity) + row("Område", r.area) + row("Entreprenör", r.contractor) + row("Status", PHASE_LABELS[ph] || ph) + row("Period", r.start_date ? `${r.start_date} – ${r.end_date || ""}` : "") + row("Framdrift", r.progress != null ? r.progress + " %" : "") : row("Status", "Inte kopplat till planeringen")}${extra.map(([k, v]) => row(k, v)).join("")}</table>
    ${r ? `<button type="button" class="v3-wide" id="v3InfoJump">Visa i 4D-planering</button>` : ""}`;
  el.classList.remove("hidden");
  el.querySelector(".v3-x").onclick = l3HideInfo;
  const j = el.querySelector("#v3InfoJump");
  if (j) j.onclick = () => askOpener("select", { ids: [r.id], jump: true }, 15000).then(() => l3Toast("Markerat i 4D-planering och i Trimble Connect.")).catch(e => l3Toast(e.message));
}
function l3HideInfo() { const el = document.getElementById("v3Info"); if (el) el.classList.add("hidden"); }

/* Biblioteket: sök, grupper med färg. Tryck på ett objekt och sedan i scenen. */
function l3RenderLib() {
  const el = document.getElementById("v3Lib");
  if (!el) return;
  const q = ((document.getElementById("v3PalSearch") || {}).value || "").trim().toLowerCase();
  const assets = typeof placeAssets !== "undefined" ? placeAssets : [];
  const groups = {};
  Object.entries(PLACE_LIB).forEach(([k, l]) => { (groups[l.group] = groups[l.group] || []).push([k, l.label, l.color]); });
  if (assets.length) groups["Egna modeller"] = assets.map(a => [`model:${a.id}`, a.name, a.kind === "ifc" ? "#0e7490" : "#64748b"]);
  const html = Object.entries(groups).map(([g, list]) => {
    const f = list.filter(([, l]) => !q || l.toLowerCase().includes(q));
    if (!f.length) return "";
    return `<div class="v3-pal-g">${escHtml(g)}</div>` + f.map(([k, l, c]) => `<button type="button" data-v3add="${escHtml(k)}" class="${l3 && l3.addType === k ? "on" : ""}" title="${escHtml(l)}"><i style="background:${c}"></i><span>${escHtml(l)}</span></button>`).join("");
  }).join("");
  el.innerHTML = html || `<div class="v3-pal-hint">Inget matchar "${escHtml(q)}".</div>`;
  el.querySelectorAll("[data-v3add]").forEach(b => { b.onclick = () => {
    if (typeof l3SetTool === "function" && l3.tool !== "select") l3SetTool("select");
    const k = b.dataset.v3add;
    l3.fenceId = null;
    l3.addType = l3.addType === k ? null : k;
    l3Status(l3.addType ? ((placeLib(k) || {}).fence ? "Staket: tryck första punkten." : "Tryck där objektet ska stå (marken eller ett objekt). Esc avbryter.") : "");
    l3RenderLib();
  }; });
}

/* Namn ovanför etableringen (högst 80, de närmaste). */
function l3RenderLabels() {
  const host = document.getElementById("v3Labels");
  if (!host || !l3) return;
  if (!l3Prefs().labels || !l3.placeMeshes.size) { host.innerHTML = ""; return; }
  const r = l3.renderer.domElement.getBoundingClientRect(), cam = l3.camera.position;
  const list = placements.map(p => {
    const g = l3.placeMeshes.get(p.id); if (!g) return null;
    const v = new THREE.Vector3(g.position.x, g.position.y, g.position.z + l3PlaceHeight(p) + 0.6);
    return { p, v, d: v.distanceTo(cam) };
  }).filter(Boolean).sort((a, b) => a.d - b.d).slice(0, 80);
  let html = "";
  list.forEach(({ p, v }) => {
    const q = v.clone().project(l3.camera);
    if (q.z > 1 || q.x < -1.1 || q.x > 1.1 || q.y < -1.1 || q.y > 1.1) return;
    const x = (q.x + 1) / 2 * r.width, y = (1 - q.y) / 2 * r.height;
    html += `<div class="v3-label ${l3.sel.has(p.id) ? "on" : ""}" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px">${escHtml(p.name || "")}</div>`;
  });
  host.innerHTML = html;
}
function l3PlaceHeight(p) {
  const lib = placeLib(p.type) || {};
  if (lib.isModel) { const b = lib.model && lib.model.bbox; return b ? b.max[2] * placeScale(p) : 2; }
  if (p.type === "tornkran") return (Number(p.H) || 0) + 1.8;
  return Number(p.H) || 1;
}

// ---------------------------------------------------------------------
// Ångra / gör om, tangenter, sparning
// ---------------------------------------------------------------------
function l3Undo() {
  if (typeof placeUndo !== "function" || !placeUndoStack.length) { l3Status("Inget att ångra."); return; }
  placeUndo();
  l3BuildPlacements(); l3RenderSide(); l3Changed();
  l3Status("Ångrat.");
}
function l3Redo() {
  if (typeof placeRedo !== "function" || !placeRedoStack.length) { l3Status("Inget att göra om."); return; }
  placeRedo();
  l3BuildPlacements(); l3RenderSide(); l3Changed();
  l3Status("Gjort om.");
}
function l3Key(e) {
  const box = document.getElementById("view3d");
  if (!l3 || !box || box.classList.contains("hidden")) return;
  const tag = e.target && e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  // I 3D gäller bara 3D-vyns tangenter (lägesplanens genvägar och 2D-ångra ska inte reagera).
  e.stopImmediatePropagation();
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod && k === "z" && !e.shiftKey) { e.preventDefault(); l3Undo(); return; }
  if (mod && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); l3Redo(); return; }
  if (mod && k === "c") { e.preventDefault(); l3CopySel(); return; }
  if (mod && k === "v") { e.preventDefault(); l3Paste(); return; }
  if (mod && k === "d") { e.preventDefault(); l3DuplicateSel(); return; }
  if (mod && k === "a") { e.preventDefault(); l3SelectIds(placements.map(p => p.id)); return; }
  if (typeof l3ToolKey === "function" && l3ToolKey(e)) return;
  if (e.key === "Enter" && l3.fenceId) { l3EndAdd(); l3Status("Staketet är klart."); return; }
  if (e.key === "Escape") { l3HideMenus(); l3HideInfo(); if (l3.addType) { l3EndAdd(); l3Status(""); } else l3SelectIds([]); return; }
  if (e.key === "Home") { e.preventDefault(); l3Frame(true); return; }
  if (e.key === "?") { document.getElementById("v3HelpBtn").click(); return; }
  if (k === "f") { l3View(l3.sel.size ? "sel" : "iso"); return; }
  if (k === "w") return l3Mode("translate");
  if (k === "e") return l3Mode("rotate");
  if ((e.key === "Delete" || e.key === "Backspace") && l3.sel.size) { e.preventDefault(); l3DeleteSel(); return; }
  if (l3.sel.size && l3.tool === "select") {
    const st = l3StepVal() * (e.shiftKey ? 10 : 1), rs = (({ 0.1: 5, 0.5: 15, 1: 45 })[l3StepVal()] || 1) * (e.shiftKey ? 2 : 1);
    const m = { ArrowLeft: [-st, 0, 0, 0], ArrowRight: [st, 0, 0, 0], ArrowUp: [0, st, 0, 0], ArrowDown: [0, -st, 0, 0], PageUp: [0, 0, st, 0], PageDown: [0, 0, -st, 0], ",": [0, 0, 0, rs], ".": [0, 0, 0, -rs] }[e.key];
    if (m) { e.preventDefault(); l3NudgeSel(...m); }
  }
}

/* Sparat i plan_placements.json (place3d.js sparar efter en kort paus) -> berätta för 4D-planering. */
let l3NotifyTimer = 0;
function l3Changed() {
  clearTimeout(l3NotifyTimer);
  l3SaveState("saving");
  l3NotifyTimer = setTimeout(async () => {
    try {
      await placeSaveNow();
      if (placeDirty.size || placeDeleted.size) { l3SaveState("err"); return; }
      l3SaveState("ok");
      await l3NotifyOpener();
    } catch (e) { l3SaveState("err", e.message); }
  }, 1200);
  l3UndoBtns();
  l3Render();
}
function l3UndoBtns() {
  const u = document.getElementById("v3Undo"), r = document.getElementById("v3Redo");
  if (u) u.disabled = !(typeof placeUndoStack !== "undefined" && placeUndoStack.length);
  if (r) r.disabled = !(typeof placeRedoStack !== "undefined" && placeRedoStack.length);
}
async function l3NotifyOpener() { try { await askOpener("placementsChanged", {}, 15000); } catch (e) { /* 4D-planering är inte öppen – filen är ändå sparad */ } }
async function l3SaveIfc() {
  const b = document.getElementById("v3SaveIfc");
  b.disabled = true;
  l3Status("Sparar etableringen och skapar IFC i Trimble Connect…");
  try {
    await placeSaveNow();
    const r = await askOpener("placeSaveIfc", {}, 0);
    const msg = r && r.n ? `✓ ${r.n} objekt sparade som IFC i Trimble Connect${r.files ? ` (${r.files.join(", ")})` : ""}.` : "Inget att spara.";
    l3Status(msg); l3Toast(msg);
  } catch (e) { l3Status("Kunde inte spara som IFC: " + e.message, true); }
  b.disabled = false;
}

document.addEventListener("DOMContentLoaded", () => {
  const b = document.getElementById("btn3d"); if (b) b.onclick = () => open3d();
  // Öppnad via "Öppna 3D-vy" i 4D-planering (?view=3d): vänta tills arbetsytan är inläst.
  if (new URLSearchParams(location.search).get("view") === "3d") {
    let n = 0;
    const t = setInterval(() => {
      if (++n > 120) return clearInterval(t);
      if (typeof plan !== "undefined" && plan && page) { clearInterval(t); open3d(); }
    }, 500);
  }
});
