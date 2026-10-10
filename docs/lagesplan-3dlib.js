/* 3D-vyn – fliken 3D-bibliotek (Victor 2026-10-10: "Jag måste kunna radera objekt ur 3d-biblioteket också
   från mina egna modeller" och "dra egna modeller till dom kategorierna, gör om dom andra kategorierna till
   mappar som jag kan dra objekten mellan och en tänd och släck på varje mapp som i övriga appen").

   – Kategorierna (Etablering, Maskiner, Säkerhet, Egna modeller) är mappar med fasta id:n ("g:<namn>").
     Egna mappar kan läggas till, döpas om och tas bort; objekten dras mellan mapparna.
   – Mapparna och vilken mapp ett objekt ligger i sparas per projekt i projects/<id>/plan_libfolders.json
     (lista med { id, name } per mapp och { t: typ, f: mapp-id } per flyttat objekt) – egen fil, sammanslagen vid sparning.
   – Bocken på en mapp tänder/släcker de placerade objekten av mappens typer i 3D-vyn (Ctrl+Z ångrar).
   – En egen modell tas bort ur biblioteket (plan_models.json). Filerna rörs inte, och inget i Trimble
     Connect tas bort eller skrivs över. Används modellen av placerade objekt tas den inte bort. */

const l3lib = { folders: [], map: {}, loaded: false, loading: null, pid: null };
const l3libPath = () => `projects/${encodeURIComponent(projectId)}/plan_libfolders.json`;
const L3LIB_BUILTIN = ["Etablering", "Maskiner", "Säkerhet", "Egna modeller"];

function l3libLoad() {
  if (l3lib.pid !== projectId) { l3lib.pid = projectId; l3lib.loaded = false; l3lib.loading = null; l3lib.folders = []; l3lib.map = {}; }
  if (l3lib.loaded || typeof projectId === "undefined" || !projectId) return Promise.resolve();
  if (!l3lib.loading) l3lib.loading = (async () => {
    try { l3libSet(await ghReadJSON(token, l3libPath())); }
    catch (e) { console.warn("Kunde inte läsa plan_libfolders.json", e); }
    l3lib.loaded = true; l3lib.loading = null;
    l3RenderLib();
  })();
  return l3lib.loading;
}
/* Filen är en lista (ghWriteJSON slår samman listor): mappar { id, name } och val { t: typ, f: mapp-id }. */
function l3libParse(arr) {
  const a = Array.isArray(arr) ? arr : [], map = {};
  a.forEach(x => { if (x && x.t && x.f) map[x.t] = x.f; });
  return { folders: a.filter(x => x && x.id && x.name), map };
}
function l3libSet(arr) { const d = l3libParse(arr); l3lib.folders = d.folders; l3lib.map = d.map; }
const l3libArr = d => [...d.folders, ...Object.entries(d.map).map(([t, f]) => ({ t, f }))];
/* Alla mappar i ordning: de fasta först (namn kan bytas), sedan egna i bokstavsordning. */
function l3libFolders() {
  const named = new Map(l3lib.folders.map(f => [f.id, f]));
  const fixed = L3LIB_BUILTIN.map(g => ({ id: "g:" + g, name: (named.get("g:" + g) || {}).name || g, fixed: true }));
  const own = l3lib.folders.filter(f => !String(f.id).startsWith("g:")).sort((a, b) => a.name.localeCompare(b.name, "sv", { numeric: true }));
  return [...fixed, ...own];
}
const l3libDefault = type => "g:" + (String(type).startsWith("model:") ? "Egna modeller" : ((PLACE_LIB[type] || {}).group || "Etablering"));
function l3libFolderOf(type) {
  const f = l3lib.map[type];
  return f && (String(f).startsWith("g:") || l3lib.folders.some(x => x.id === f)) ? f : l3libDefault(type);
}
/* Alla objekt i biblioteket: [typ, namn, färg, egen modell?] */
function l3libItems() {
  const assets = typeof placeAssets !== "undefined" ? placeAssets : [];
  return [
    ...Object.entries(PLACE_LIB).map(([k, l]) => ({ k, label: l.label, color: l.color, own: false })),
    ...assets.map(a => ({ k: `model:${a.id}`, label: a.name, color: a.kind === "ifc" ? "#0e7490" : "#64748b", own: true, a })),
  ];
}
async function l3libWrite(mut, msg) {
  const apply = arr => { const n = l3libParse(arr); mut(n); return l3libArr(n); };
  l3libSet(apply(l3libArr(l3lib)));
  l3RenderLib();
  try {
    const next = await ghWriteJSON(token, l3libPath(), apply, msg);
    if (next) { l3libSet(next); l3RenderLib(); }
    if (typeof l3SaveState === "function") l3SaveState("ok", "Biblioteket sparat");
  } catch (e) { l3Status("Kunde inte spara biblioteket: " + e.message, true); }
}
async function l3libNewFolder() {
  const name = ((await uiPrompt("Namn på mappen:", "")) || "").trim();
  if (!name) return null;
  const f = { id: "lf" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name.slice(0, 60) };
  await l3libWrite(d => { d.folders = [...d.folders.filter(x => x.id !== f.id), f]; }, `3D-bibliotek: mapp – ${f.name}`);
  return f;
}
async function l3libRename(id) {
  const f = l3libFolders().find(x => x.id === id); if (!f) return;
  const name = ((await uiPrompt("Nytt namn på mappen:", f.name)) || "").trim();
  if (!name || name === f.name) return;
  await l3libWrite(d => { d.folders = [...d.folders.filter(x => x.id !== id), { id, name: name.slice(0, 60) }]; }, `3D-bibliotek: mapp – ${name}`);
}
async function l3libDeleteFolder(id) {
  const f = l3libFolders().find(x => x.id === id); if (!f || f.fixed) return;
  const inside = l3libItems().filter(it => l3libFolderOf(it.k) === id);
  if (!(await uiConfirm(`Ta bort mappen ${f.name}?${inside.length ? ` Objekten i den (${inside.length}) flyttas tillbaka till sina vanliga mappar – inget tas bort.` : ""}`, { ok: "Ta bort" }))) return;
  await l3libWrite(d => { d.folders = d.folders.filter(x => x.id !== id); Object.keys(d.map).forEach(k => { if (d.map[k] === id) delete d.map[k]; }); }, "3D-bibliotek: mapp borttagen");
}
async function l3libMove(type, fid) {
  const f = l3libFolders().find(x => x.id === fid); if (!f) return;
  if (l3libFolderOf(type) === fid) { l3Status("Objektet ligger redan där."); return; }
  await l3libWrite(d => { if (fid === l3libDefault(type)) delete d.map[type]; else d.map[type] = fid; }, `3D-bibliotek: flyttat till ${f.name}`);
  l3Status(`${(placeLib(type) || {}).label || "Objektet"} flyttat till ${f.name}.`);
}

/* Bocken: de placerade objekten av mappens typer. */
const l3libPlaced = fid => placements.filter(p => l3libFolderOf(p.type) === fid);
function l3libVis(fid, show) {
  const list = l3libPlaced(fid); if (!list.length) return;
  const name = (l3libFolders().find(f => f.id === fid) || {}).name || "";
  l3VisRecord(`${show ? "visa" : "dölj"} ${name}`, () => {
    if (!l3.hidden) l3.hidden = new Set();
    list.forEach(p => { if (show) l3.hidden.delete(p.id); else l3.hidden.add(p.id); const g = l3.placeMeshes.get(p.id); if (g) g.visible = show; });
    if (!show) l3SelectIds([...l3.sel].filter(id => !l3.hidden.has(id)));
    l3UpdateHidden();
  });
  if (typeof l3LayersRender === "function") l3LayersRender();
  l3Status(`${name}: ${show ? "visas" : "släckt (Ctrl+Z ångrar)"}.`);
  l3Render(); l3RenderLib();
}

/* Ta bort en egen modell ur biblioteket (inte filerna, inget i TC). */
async function l3libDeleteModel(id) {
  const a = typeof placeAssetOf === "function" ? placeAssetOf(id) : null; if (!a) return;
  const used = placements.filter(p => p.type === `model:${id}`);
  if (used.length) {
    l3SelectIds(used.map(p => p.id));
    l3Status(`"${a.name}" används av ${used.length} placerade objekt (nu markerade). Ta bort dem först – sedan kan modellen tas bort ur biblioteket.`, true);
    return;
  }
  if (!(await uiConfirm(`Ta bort "${a.name}" ur 3D-biblioteket? Den försvinner från Egna modeller för alla i projektet. Inget i Trimble Connect tas bort.`, { ok: "Ta bort" }))) return;
  if (l3.addType === `model:${id}`) { l3.addType = null; l3.fenceId = null; }
  placeAssets = placeAssets.filter(x => x.id !== id);
  l3RenderLib();
  try {
    await ghWriteJSON(settings.githubToken, pmAssetsPath(), arr => (arr || []).filter(x => x.id !== id), `3D-bibliotek: ${a.name} borttagen`);
    if (l3lib.map[`model:${id}`]) await l3libWrite(d => { delete d.map[`model:${id}`]; }, "3D-bibliotek: borttagen modell");
    l3Status(`"${a.name}" är borttagen ur biblioteket.`);
  } catch (e) {
    if (!placeAssetOf(id)) placeAssets.push(a);
    l3Status("Kunde inte ta bort modellen: " + e.message, true);
  }
  l3RenderLib();
}

function l3RenderLib() {
  const el = document.getElementById("v3Lib");
  if (!el) return;
  l3libLoad();
  const q = ((document.getElementById("v3PalSearch") || {}).value || "").trim().toLowerCase();
  const esc = escHtml, I = L3_ICO, items = l3libItems();
  // Mapparna fälls ihop/ut med ett klick på rubriken; valet sparas. Vid sökning visas alla träffar.
  const closed = new Set(l3Prefs().palClosed || []);
  const html = l3libFolders().map(f => {
    const all = items.filter(it => l3libFolderOf(it.k) === f.id), list = all.filter(it => !q || it.label.toLowerCase().includes(q));
    if (q && !list.length) return "";
    if (!all.length && f.fixed && f.id !== "g:Egna modeller") return "";
    const open = q || !closed.has(f.id) || list.some(it => l3 && l3.addType === it.k);
    const placed = l3libPlaced(f.id), on = placed.some(p => !(l3.hidden && l3.hidden.has(p.id)));
    return `<div class="v3-lf" data-lfid="${esc(f.id)}">
      <label class="v3-af-chk" title="${placed.length ? `${on ? "Släck" : "Tänd"} mappens ${placed.length} placerade objekt i 3D` : "Inga placerade objekt i mappen"}"><input type="checkbox" data-lfvis="${esc(f.id)}" ${on || !placed.length ? "checked" : ""} ${placed.length ? "" : "disabled"} /></label>
      <button type="button" class="v3-pal-g" data-v3grp="${esc(f.id)}" aria-expanded="${!!open}"><span>${esc(f.name)}</span><em>${all.length}</em></button>
      <button type="button" class="v3-lf-ic" data-lfren="${esc(f.id)}" title="Byt namn">${I.edit}</button>
      ${f.fixed ? "" : `<button type="button" class="v3-lf-ic" data-lfdel="${esc(f.id)}" title="Ta bort mappen (objekten flyttas tillbaka)">${I.trash}</button>`}
    </div>` + (open ? `<div class="v3-pal-items">` + (list.map(it => `<div class="v3-li"><button type="button" data-v3add="${esc(it.k)}" class="${l3 && l3.addType === it.k ? "on" : ""}" title="${esc(it.label)} – tryck och sedan i 3D. Dra till en annan mapp för att flytta."><i style="background:${it.color}"></i><span>${esc(it.label)}</span></button>${it.own ? `<button type="button" class="v3-li-x" data-v3libdel="${esc(it.a.id)}" title="Ta bort ur biblioteket (inget i Trimble Connect tas bort)">${I.trash}</button>` : ""}</div>`).join("") || `<div class="v3-pal-hint">Dra objekt hit.</div>`) + `</div>` : "");
  }).join("");
  el.innerHTML = (html || `<div class="v3-pal-hint">Inget matchar "${esc(q)}".</div>`) + `<button type="button" class="v3-lf-new" id="v3LibNew" title="Ny mapp i biblioteket – dra sedan objekt dit">＋ Ny mapp</button>`;
  el.querySelectorAll("[data-v3grp]").forEach(b => { b.onclick = () => {
    const g = b.dataset.v3grp, set = new Set(l3Prefs().palClosed || []);
    if (b.getAttribute("aria-expanded") === "true") set.add(g); else set.delete(g);
    l3SetPref("palClosed", [...set]); l3RenderLib();
  }; });
  el.querySelectorAll("[data-lfvis]").forEach(c => { c.onchange = () => l3libVis(c.dataset.lfvis, c.checked); });
  el.querySelectorAll("[data-lfren]").forEach(b => { b.onclick = () => l3libRename(b.dataset.lfren); });
  el.querySelectorAll("[data-lfdel]").forEach(b => { b.onclick = () => l3libDeleteFolder(b.dataset.lfdel); });
  el.querySelectorAll("[data-v3libdel]").forEach(b => { b.onclick = () => l3libDeleteModel(b.dataset.v3libdel); });
  el.querySelector("#v3LibNew").onclick = () => l3libNewFolder();
  el.querySelectorAll("[data-v3add]").forEach(b => { b.onclick = () => {
    if (typeof l3SetTool === "function" && l3.tool !== "select") l3SetTool("select");
    const k = b.dataset.v3add;
    l3.fenceId = null;
    l3.addType = l3.addType === k ? null : k;
    // Smal skärm: biblioteket ligger över modellen – fäll ihop det så att man kan trycka i 3D.
    if (l3.addType && window.innerWidth < 700) { const pal = document.getElementById("v3Pal"), po = document.getElementById("v3PalOpen"); if (pal && po) { pal.classList.add("hidden"); po.classList.remove("hidden"); } }
    l3Status(l3.addType ? ((placeLib(k) || {}).fence ? "Staket: tryck första punkten." : "Tryck där objektet ska stå (marken eller ett objekt). Esc avbryter.") : "");
    l3RenderLib();
  }; });
  // Dra ett objekt till en annan mapp (samma grafik som för grupper, kommentarer och mått).
  if (typeof l3DndBind === "function") el.querySelectorAll("[data-v3add]").forEach(b => l3DndBind(b, () => {
    const k = b.dataset.v3add, it = items.find(x => x.k === k); if (!it) return null;
    return {
      items: [it], pal: el, color: it.color, title: it.label, sub: "Släpp på en mapp",
      src: [b.closest(".v3-li")],
      targets: [...el.querySelectorAll(".v3-lf"), el.querySelector("#v3LibNew")],
      name: tg => (tg.id === "v3LibNew" ? "Ny mapp…" : (tg.querySelector(".v3-pal-g span") || {}).textContent),
      drop: async tg => {
        if (tg.id === "v3LibNew") { const f = await l3libNewFolder(); if (f) await l3libMove(k, f.id); return; }
        await l3libMove(k, tg.dataset.lfid);
      },
    };
  }));
  if (typeof l3HandlesPos === "function") l3HandlesPos(); // inga handtag medan man lägger till
  if (typeof l3TouchBarUpdate === "function") l3TouchBarUpdate(); // Avbryt på pekskärm
}
