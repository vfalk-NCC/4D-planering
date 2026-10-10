/* 3D-vyn – mappar för kommentarer och mått (Victor 2026-10-10: "lägga både mått och kommentarer i mappar
   som jag kan släcka eller tända. T.ex om jag mätt eller kommenterat på ett visst område och vill bara
   visa dom").

   – Mapparna (namn) delas i projektet: projects/<id>/plan_annotfolders.json, per arbetsyta.
   – Tänt/släckt är per person (webbläsaren) – att släcka en mapp påverkar inte vad andra ser.
   – Kommentarer och mått i en släckt mapp syns inte i 3D och tas inte med i "Exportera alla".
   – "Nya hamnar i": nya kommentarer och mått läggs i den mappen. Markerade (Ctrl/Skift-klick) kan flyttas.
   – Tar man bort en mapp hamnar innehållet i "Utan mapp" – inget försvinner. */

const l3a = { folders: [], loaded: false, plan: null, cur: null };
const l3aPath = () => `projects/${encodeURIComponent(projectId)}/plan_annotfolders.json`;
const l3aKey = id => id || "_";
const l3aHiddenMap = () => (typeof l3Prefs === "function" && l3Prefs().annotHidden) || {};
/* Syns kommentaren/måttet (dess mapp är tänd)? */
function l3aOn(x) { return !l3aHiddenMap()[l3aKey(x && x.folder)]; }
function l3aFolderName(id) { const f = id && l3a.folders.find(x => x.id === id); return f ? f.name : ""; }

async function l3aLoad() {
  if (l3a.plan !== (plan && plan.id)) { l3a.plan = plan && plan.id; l3a.folders = []; l3a.loaded = false; l3a.cur = null; }
  if (l3a.loaded) return;
  l3a.loaded = true;
  try { const a = await ghReadJSON(token, l3aPath()); l3a.folders = (Array.isArray(a) ? a : []).filter(x => x && x.plan === (plan && plan.id)); }
  catch (e) { console.warn("Kunde inte läsa plan_annotfolders.json", e); }
  if (typeof l3kRenderTab === "function") l3kRenderTab();
}
async function l3aWrite(f, remove) {
  try { await ghWriteJSON(token, l3aPath(), arr => { const a = (Array.isArray(arr) ? arr : []).filter(x => x.id !== f.id); return remove ? a : [...a, f]; }, remove ? "3D: mapp borttagen" : `3D: mapp – ${f.name}`); }
  catch (e) { l3Status("Kunde inte spara mappen: " + e.message, true); }
}
/* Allt ritas om när en mapp tänds/släcks eller innehållet flyttas. */
function l3aRefresh() {
  if (typeof l3kDraw === "function") l3kDraw(); // ritar också om fliken
  if (typeof l3mDraw === "function") l3mDraw();
  if (typeof l3kRenderTab === "function") l3kRenderTab();
}
function l3aSetHidden(map) { l3SetPref("annotHidden", map); l3aRefresh(); }
function l3aToggle(id) { const h = { ...l3aHiddenMap() }, k = l3aKey(id); if (h[k]) delete h[k]; else h[k] = true; l3aSetHidden(h); }
/* Visa bara den här mappen (alla andra släcks). */
function l3aSolo(id) { const h = {}; ["_", ...l3a.folders.map(f => f.id)].forEach(k => { if (k !== l3aKey(id)) h[k] = true; }); l3aSetHidden(h); }
function l3aAll(on) { const h = {}; if (!on) ["_", ...l3a.folders.map(f => f.id)].forEach(k => { h[k] = true; }); l3aSetHidden(h); }

async function l3aNew() {
  const name = (await uiPrompt("Namn på mappen (t.ex. ett område):", "")) || "";
  if (!name.trim()) return null;
  const f = { id: ghNewId(), plan: plan && plan.id, name: name.trim().slice(0, 60), by: (settings && settings.userName) || null, at: new Date().toISOString() };
  l3a.folders.push(f); l3a.cur = f.id;
  l3aRefresh();
  await l3aWrite(f);
  l3Status(`Mappen "${f.name}" är skapad – nya kommentarer och mått hamnar i den.`);
  return f;
}
async function l3aRename(id) {
  const f = l3a.folders.find(x => x.id === id); if (!f) return;
  const name = await uiPrompt("Nytt namn på mappen:", f.name);
  if (!name || !name.trim() || name.trim() === f.name) return;
  f.name = name.trim().slice(0, 60);
  l3aRefresh(); await l3aWrite(f);
}
async function l3aDelete(id) {
  const f = l3a.folders.find(x => x.id === id); if (!f) return;
  const nk = l3k.list.filter(c => c.folder === id), nm = l3m.list.filter(m => m.folder === id);
  if (!(await uiConfirm(`Ta bort mappen "${f.name}"?${nk.length + nm.length ? ` Det som ligger i den (${nk.length} kommentarer, ${nm.length} mått) flyttas till Utan mapp.` : ""}`))) return;
  l3a.folders = l3a.folders.filter(x => x !== f);
  if (l3a.cur === id) l3a.cur = null;
  await l3aMove([...nk, ...nm], null, true);
  await l3aWrite(f, true);
}
/* Flytta kommentarer och mått till en mapp (null = Utan mapp). Sparas i en skrivning per fil. */
async function l3aMove(items, folderId, quiet) {
  const ks = items.filter(x => l3k.list.includes(x)), ms = items.filter(x => l3m.list.includes(x));
  ks.forEach(c => { c.folder = folderId || null; });
  ms.forEach(m => { m.folder = folderId || null; });
  l3aRefresh();
  try {
    if (ks.length) await ghWriteJSON(token, l3kPath(), arr => { const ids = new Set(ks.map(c => c.id)); return [...(Array.isArray(arr) ? arr : []).filter(x => !ids.has(x.id)), ...ks]; }, `3D: ${ks.length} kommentarer till mapp`);
    const msv = ms.filter(m => m.saved).map(({ saved, ...x }) => x);
    if (msv.length) await ghWriteJSON(token, l3mPath(), arr => { const ids = new Set(msv.map(m => m.id)); return [...(Array.isArray(arr) ? arr : []).filter(x => !ids.has(x.id)), ...msv]; }, `3D: ${msv.length} mått till mapp`);
  } catch (e) { l3Status("Kunde inte spara flytten: " + e.message, true); return; }
  if (!quiet) l3Status(`${ks.length ? `${ks.length} kommentarer` : ""}${ks.length && ms.length ? " och " : ""}${ms.length ? `${ms.length} mått` : ""} flyttade till ${folderId ? `"${l3aFolderName(folderId)}"` : "Utan mapp"}.`);
}
/* De markerade i listorna (kommentarer och mått). */
function l3aSelected() {
  const ks = typeof l3kUi !== "undefined" ? l3k.list.filter(c => l3kUi.sel.has(c.id)) : [];
  const ms = l3m.sel ? l3m.list.filter(m => l3m.sel.has(m.id)) : [];
  return [...ks, ...ms];
}

function l3aHtml() {
  const esc = escHtml, I = L3_ICO, hid = l3aHiddenMap();
  const count = id => ({ k: l3k.list.filter(c => (c.folder || null) === id).length, m: l3m.list.filter(m => (m.folder || null) === id).length });
  const row = (id, name, own) => {
    const k = l3aKey(id), on = !hid[k], n = count(id), cur = (l3a.cur || null) === id;
    return `<div class="v3-af ${on ? "" : "off"} ${cur ? "cur" : ""}">
      <button type="button" class="v3-ic" data-afeye="${k}" title="${on ? "Släck mappen" : "Tänd mappen"}" aria-pressed="${on}">${on ? I.eye : I.eyeOff}</button>
      <button type="button" class="v3-af-n" data-afcur="${k}" title="${cur ? "Nya kommentarer och mått hamnar här" : "Klicka: nya kommentarer och mått hamnar här"}"><b>${esc(name)}</b><em>${n.k} kommentarer · ${n.m} mått${cur ? " · nya hamnar här" : ""}</em></button>
      <button type="button" class="v3-ic" data-afsolo="${k}" title="Visa bara den här mappen">◎</button>
      ${own ? `<button type="button" class="v3-ic" data-afren="${k}" title="Byt namn">${I.edit}</button><button type="button" class="v3-ic" data-afdel="${k}" title="Ta bort mappen (innehållet flyttas till Utan mapp)">${I.trash}</button>` : ""}
    </div>`;
  };
  const sel = l3aSelected();
  return `<section class="v3-afold"><div class="v3-afold-h"><b>Mappar</b><button type="button" id="v3AfNew" title="Ny mapp – t.ex. för ett område">＋ Ny mapp</button><button type="button" id="v3AfAll" title="Tänd alla mappar">Tänd alla</button></div>
    <div class="v3-kc-list">${l3a.folders.map(f => row(f.id, f.name, true)).join("")}${row(null, "Utan mapp", false)}</div>
    ${sel.length && l3a.folders.length ? `<label class="v3-af-mv">Flytta markerade (${sel.length}) till <select id="v3AfMove"><option value="">välj mapp…</option>${l3a.folders.map(f => `<option value="${esc(f.id)}">${esc(f.name)}</option>`).join("")}<option value="_">Utan mapp</option></select></label>` : ""}</section>`;
}
function l3aBind(host) {
  const id = k => (k === "_" ? null : k);
  host.querySelectorAll("[data-afeye]").forEach(b => { b.onclick = () => l3aToggle(id(b.dataset.afeye)); });
  host.querySelectorAll("[data-afsolo]").forEach(b => { b.onclick = () => l3aSolo(id(b.dataset.afsolo)); });
  host.querySelectorAll("[data-afcur]").forEach(b => { b.onclick = () => { l3a.cur = id(b.dataset.afcur); const h = { ...l3aHiddenMap() }; if (h[l3aKey(l3a.cur)]) { delete h[l3aKey(l3a.cur)]; l3aSetHidden(h); } else l3kRenderTab(); }; });
  host.querySelectorAll("[data-afren]").forEach(b => { b.onclick = () => l3aRename(id(b.dataset.afren)); });
  host.querySelectorAll("[data-afdel]").forEach(b => { b.onclick = () => l3aDelete(id(b.dataset.afdel)); });
  const nw = host.querySelector("#v3AfNew"); if (nw) nw.onclick = () => l3aNew();
  const al = host.querySelector("#v3AfAll"); if (al) al.onclick = () => l3aAll(true);
  const mv = host.querySelector("#v3AfMove"); if (mv) mv.onchange = () => { if (!mv.value) return; l3aMove(l3aSelected(), id(mv.value)); };
}
