/* 3D-vyn – egna grupper av IFC-objekt (Victor 2026-10-10: "spara in utvalda objekt i grupper tex
   Bandgång 1 och den består av 100 stålobjekt … få in den gruppen som ett UDA på 3d-objekten så när jag
   exporterar tillbaka till TC så kan jag sortera på dom grupperna i TC också via UDAn").

   – Grupperna sparas per projekt i projects/<id>/ifc_groups.json (egen fil; rör inget annat) som
     { id, name, color, guids, updated_by, updated_at }. GUID:erna är objektens IFC-id, så gruppen
     gäller även i nya versioner och i urval som sparats som egna filer.
   – När en IFC sparas eller exporteras till TC skrivs grupperna in som egenskapen
     "4D-planering" › "Grupp" (en egenskapsgrupp per objekt, flera grupper kommaseparerade).
     En tidigare inskriven 4D-planering-grupp i filen ersätts – den dubbleras aldrig. */

const l3g = { list: [], loaded: false, byGuid: null };
const L3G_COLORS = ["#0ea5e9", "#f97316", "#22c55e", "#e11d48", "#a855f7", "#eab308", "#14b8a6", "#f43f5e", "#6366f1", "#84cc16"];
const l3gPath = () => `projects/${encodeURIComponent(projectId)}/ifc_groups.json`;

async function l3gLoad(force) {
  if (l3g.loaded && !force) return l3g.list;
  try { const a = await ghReadJSON(token, l3gPath(), force ? { fresh: true } : undefined); l3g.list = Array.isArray(a) ? a : []; }
  catch (e) { console.warn("Kunde inte läsa ifc_groups.json", e); }
  l3g.loaded = true; l3g.byGuid = null;
  return l3g.list;
}
/* Ändring: direkt i vyn och sedan sparad (sammanslagen med andras ändringar i filen). */
async function l3gWrite(mut, msg) {
  l3g.list = mut(l3g.list.slice()); l3g.byGuid = null;
  l3gChanged();
  try {
    const next = await ghWriteJSON(token, l3gPath(), arr => mut(Array.isArray(arr) ? arr : []), msg);
    if (Array.isArray(next)) { l3g.list = next; l3g.byGuid = null; }
    if (typeof l3SaveState === "function") l3SaveState("ok", "Grupperna sparade");
  } catch (e) { l3Status("Kunde inte spara grupperna: " + e.message, true); }
  l3gChanged();
}
function l3gChanged() {
  if (typeof l3RenderSide === "function") l3RenderSide();
  if (typeof l3pRenderTab === "function") l3pRenderTab();
  l3gRenderTab();
}
const l3gStamp = g => ({ ...g, updated_by: (typeof settings !== "undefined" && settings.userName) || "", updated_at: new Date().toISOString() });
function l3gIndex() {
  if (l3g.byGuid) return l3g.byGuid;
  const m = new Map();
  l3g.list.forEach(g => (g.guids || []).forEach(x => { const a = m.get(x); if (a) a.push(g); else m.set(x, [g]); }));
  l3g.byGuid = m;
  return m;
}
const l3gOf = guid => l3gIndex().get(guid) || [];
function l3gSelGuids() { const s = new Set(); l3bs.sel.forEach(e => { const r = e.mesh.userData.l3b.ranges[e.ri]; if (r.guid) s.add(r.guid); }); return [...s]; }

async function l3gNew() {
  const guids = l3gSelGuids();
  if (!guids.length) { l3Status("Markera objekt i byggnaden först.", true); return null; }
  await l3gLoad();
  const name = ((await uiPrompt(`Namn på gruppen (${guids.length} objekt):`, `Grupp ${l3g.list.length + 1}`)) || "").trim();
  if (!name) return null;
  const g = l3gStamp({ id: "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, color: L3G_COLORS[l3g.list.length % L3G_COLORS.length], guids });
  await l3gWrite(arr => [...arr, g], `3D: ny grupp ${name} (${guids.length} objekt)`);
  l3Toast(`Gruppen ${name} är skapad med ${guids.length} objekt.`);
  return g;
}
async function l3gAdd(id) {
  const guids = l3gSelGuids(), g = l3g.list.find(x => x.id === id);
  if (!g || !guids.length) return;
  await l3gWrite(arr => arr.map(x => x.id === id ? l3gStamp({ ...x, guids: [...new Set([...(x.guids || []), ...guids])] }) : x), `3D: ${guids.length} objekt till gruppen ${g.name}`);
  l3Status(`${guids.length} objekt lades i ${g.name}.`);
}
async function l3gRemoveSel(id) {
  const rm = new Set(l3gSelGuids()), g = l3g.list.find(x => x.id === id);
  if (!g) return;
  await l3gWrite(arr => arr.map(x => x.id === id ? l3gStamp({ ...x, guids: (x.guids || []).filter(v => !rm.has(v)) }) : x), `3D: objekt ur gruppen ${g.name}`);
  l3Status(`De markerade togs ur ${g.name}.`);
}
async function l3gRename(id) {
  const g = l3g.list.find(x => x.id === id); if (!g) return;
  const name = ((await uiPrompt("Nytt namn på gruppen:", g.name)) || "").trim();
  if (!name || name === g.name) return;
  await l3gWrite(arr => arr.map(x => x.id === id ? l3gStamp({ ...x, name }) : x), `3D: gruppen ${g.name} heter nu ${name}`);
}
async function l3gDelete(id) {
  const g = l3g.list.find(x => x.id === id); if (!g) return;
  if (!(await uiConfirm(`Ta bort gruppen ${g.name}? Objekten finns kvar – bara grupperingen tas bort.`, { ok: "Ta bort" }))) return;
  await l3gWrite(arr => arr.filter(x => x.id !== id), `3D: gruppen ${g.name} borttagen`);
}
function l3gEnts(g) {
  const want = new Set(g.guids || []), ents = [];
  l3b.models.forEach(m => { const map = l3pEnts(m); want.forEach(x => (map.get(x) || []).forEach(e => ents.push(e))); });
  return ents;
}
function l3gSelect(id, additive) {
  const g = l3g.list.find(x => x.id === id); if (!g) return;
  const ents = l3gEnts(g);
  l3bsSet(additive ? [...l3bs.sel.map(e => ({ mesh: e.mesh, ri: e.ri })), ...ents] : ents);
  l3Status(ents.length === (g.guids || []).length ? `${g.name}: ${ents.length} objekt markerade.` : `${g.name}: ${ents.length} av ${(g.guids || []).length} objekt markerade (resten finns i modeller som inte är inlästa).`);
}

/* ---- Panelerna --------------------------------------------------------------------------------- */
/* Rad i högerpanelen: de markerades grupper (✕ tar bort dem ur gruppen) och Lägg i grupp. */
function l3gSelHtml() {
  if (!l3g.loaded) { l3gLoad().then(() => { if (l3bs.sel.length) l3RenderSide(); }); return ""; }
  const esc = escHtml, guids = l3gSelGuids();
  if (!guids.length) return "";
  const cnt = new Map();
  guids.forEach(x => l3gOf(x).forEach(g => cnt.set(g, (cnt.get(g) || 0) + 1)));
  const chips = [...cnt].map(([g, n]) => `<span class="v3-gchip" style="--gc:${esc(g.color)}" title="${n} av de markerade ligger i ${esc(g.name)}"><i></i><button type="button" data-gsel="${esc(g.id)}">${esc(g.name)}${guids.length > 1 ? ` <em>${n}</em>` : ""}</button><button type="button" class="x" data-gout="${esc(g.id)}" title="Ta de markerade ur ${esc(g.name)}">✕</button></span>`).join("");
  const opts = l3g.list.filter(g => !(cnt.get(g) === guids.length)).map(g => `<option value="${esc(g.id)}">${esc(g.name)} (${(g.guids || []).length})</option>`).join("");
  return `<div class="v3-grow"><span class="v3-glbl">Grupper</span>${chips}<select class="v3-gadd" id="v3GAdd" title="Lägg de markerade i en grupp"><option value="">＋ Lägg i grupp…</option><option value="__new">Ny grupp…</option>${opts}</select></div>`;
}
function l3gBindSel(side) {
  side.querySelectorAll("[data-gsel]").forEach(b => { b.onclick = e => l3gSelect(b.dataset.gsel, e.shiftKey); });
  side.querySelectorAll("[data-gout]").forEach(b => { b.onclick = () => l3gRemoveSel(b.dataset.gout); });
  const s = side.querySelector("#v3GAdd");
  if (s) s.onchange = () => { const v = s.value; s.value = ""; if (v === "__new") l3gNew(); else if (v) l3gAdd(v); };
}
/* Fliken Grupper (Victor 2026-10-10: "hantera grupperna på ett specifikt ställe som jag skapar"). */
const l3gUi = { q: "", open: null };
function l3gRenderTab() {
  const host = document.getElementById("v3PalGroups");
  if (!host || host.classList.contains("hidden")) return;
  if (!l3g.loaded) { host.innerHTML = `<div class="v3-pal-hint"><span class="pm-spin"></span> Hämtar grupperna…</div>`; l3gLoad().then(() => l3gRenderTab()); return; }
  const esc = escHtml, I = L3_ICO, n = l3gSelGuids().length, sel = new Set(l3gSelGuids()), t = l3gUi.q.toLowerCase();
  const list = l3g.list.filter(g => !t || g.name.toLowerCase().includes(t)).sort((a, b) => a.name.localeCompare(b.name, "sv", { numeric: true }));
  const inScene = g => { let k = 0; l3b.models.forEach(m => { const map = l3pEnts(m); (g.guids || []).forEach(x => { if (map.has(x)) k++; }); }); return k; };
  const rows = list.map(g => {
    const tot = (g.guids || []).length, here = inScene(g), mine = n ? (g.guids || []).filter(x => sel.has(x)).length : 0, open = l3gUi.open === g.id;
    return `<div class="v3-gr ${open ? "open" : ""}" data-gid="${esc(g.id)}">
      <div class="v3-gr-h">
        <label class="v3-gr-col" title="Gruppens färg"><input type="color" data-gcol="${esc(g.id)}" value="${esc(g.color || "#6d5efc")}" /><i style="background:${esc(g.color)}"></i></label>
        <button type="button" class="v3-gr-n" data-gsel="${esc(g.id)}" title="Markera gruppens objekt (Skift lägger till)">${esc(g.name)}</button>
        <em title="${here} av ${tot} finns i de inlästa modellerna">${here === tot ? tot : `${here}/${tot}`}</em>
        ${mine ? `<span class="v3-gr-mine" title="${mine} av de markerade ligger i gruppen">${mine}✓</span>` : ""}
        <button type="button" class="v3-ic" data-gmore="${esc(g.id)}" title="Fler val" aria-expanded="${open}">⋯</button>
      </div>
      ${open ? `<div class="v3-gr-acts">
        <button type="button" data-gadd="${esc(g.id)}" ${n ? "" : "disabled"} title="Lägg de markerade i gruppen">＋ Lägg till${n ? ` (${n})` : ""}</button>
        <button type="button" data-gout="${esc(g.id)}" ${mine ? "" : "disabled"} title="Ta de markerade ur gruppen">－ Ta ur${mine ? ` (${mine})` : ""}</button>
        <button type="button" data-giso="${esc(g.id)}" title="Visa bara gruppen (Ctrl+Z ångrar)">${I.isolate} Visa bara</button>
        <button type="button" data-ghide="${esc(g.id)}" title="Dölj gruppen (Ctrl+Z ångrar)">${I.eyeOff} Dölj</button>
        <button type="button" data-gzoom="${esc(g.id)}">${I.focus} Zooma</button>
        <button type="button" data-gren="${esc(g.id)}">${I.edit} Byt namn</button>
        <button type="button" data-gdel="${esc(g.id)}" class="bad" title="Ta bort gruppen (objekten finns kvar)">${I.trash} Ta bort</button>
        <div class="v3-gr-who">${g.updated_by ? `Ändrad av ${esc(g.updated_by)}` : ""}${g.updated_at ? ` ${esc(String(g.updated_at).slice(0, 10))}` : ""}</div>
      </div>` : ""}
    </div>`;
  }).join("");
  const colorOn = l3p.colorBy && l3p.colorBy.key === "g:4d";
  host.innerHTML = `<button type="button" class="v3-gnew" id="v3GNew" ${n ? "" : "disabled"} title="${n ? "Ny grupp av de markerade objekten" : "Markera objekt i byggnaden först (tryck, Skift, ruta eller Flera)"}">＋ Ny grupp av markerade${n ? ` (${n})` : ""}</button>
    ${l3g.list.length > 6 ? `<input type="search" class="v3-pp-q" id="v3GQ" placeholder="Sök grupp…" value="${esc(l3gUi.q)}" />` : ""}
    <div class="v3-grs">${rows || `<div class="v3-pal-hint">${l3g.list.length ? "Ingen grupp matchar." : "Inga grupper än. Markera objekt och skapa en grupp, t.ex. Bandgång 1 – den sparas i projektet och kan skrivas in som en egenskap (UDA) i IFC:n."}</div>`}</div>
    ${l3g.list.length ? `<div class="v3-grp-acts">
      <button type="button" id="v3GBy" class="${colorOn ? "on" : ""}" title="Färga alla objekt efter sin grupp">${colorOn ? "Sluta färga" : "Färga efter grupp"}</button>
      ${l3b.models.filter(m => m.visible).map(m => `<button type="button" data-gsave="${esc(m.id)}" title="Grupperna skrivs in som egenskapen 4D-planering › Grupp och sparas som en ny IFC-fil i samma mapp i Trimble Connect – originalet skrivs aldrig över">${I.upload} Skriv in i ${esc(m.name.replace(/\.ifc(zip)?$/i, ""))} (ny IFC i TC)</button>`).join("")}
    </div>` : ""}`;
  l3gBindTab(host);
}
function l3gBindTab(host) {
  const q = host.querySelector("#v3GQ");
  if (q) q.oninput = () => { l3gUi.q = q.value; const pos = q.selectionStart; l3gRenderTab(); const q2 = document.getElementById("v3GQ"); if (q2) { q2.focus(); q2.setSelectionRange(pos, pos); } };
  host.querySelectorAll("[data-gsel]").forEach(b => { b.onclick = e => l3gSelect(b.dataset.gsel, e.shiftKey || e.ctrlKey || e.metaKey); });
  host.querySelectorAll("[data-gmore]").forEach(b => { b.onclick = () => { l3gUi.open = l3gUi.open === b.dataset.gmore ? null : b.dataset.gmore; l3gRenderTab(); }; });
  host.querySelectorAll("[data-gadd]").forEach(b => { b.onclick = () => l3gAdd(b.dataset.gadd); });
  host.querySelectorAll("[data-gout]").forEach(b => { b.onclick = () => l3gRemoveSel(b.dataset.gout); });
  host.querySelectorAll("[data-giso]").forEach(b => { b.onclick = () => { l3gSelect(b.dataset.giso); if (l3bs.sel.length) l3bsIsolate(); }; });
  host.querySelectorAll("[data-ghide]").forEach(b => { b.onclick = () => l3gHide(b.dataset.ghide); });
  host.querySelectorAll("[data-gzoom]").forEach(b => { b.onclick = () => { l3gSelect(b.dataset.gzoom); l3bsZoom(); }; });
  host.querySelectorAll("[data-gren]").forEach(b => { b.onclick = () => l3gRename(b.dataset.gren); });
  host.querySelectorAll("[data-gdel]").forEach(b => { b.onclick = () => l3gDelete(b.dataset.gdel); });
  host.querySelectorAll("[data-gcol]").forEach(inp => { inp.onchange = () => l3gSetColor(inp.dataset.gcol, inp.value); });
  host.querySelectorAll("[data-gsave]").forEach(b => { b.onclick = async () => { b.disabled = true; try { await l3gSaveModel(l3b.models.find(m => m.id === b.dataset.gsave)); } catch (e) { /* statusraden */ } if (b.isConnected) b.disabled = false; }; });
  const nw = host.querySelector("#v3GNew"); if (nw) nw.onclick = () => l3gNew();
  const by = host.querySelector("#v3GBy");
  if (by) by.onclick = async () => { if (l3p.colorBy && l3p.colorBy.key === "g:4d") { l3pColorOff(); l3p.group = null; } else { await l3pGroupBy("g:4d", { stay: true }); l3pColorOn(); } l3gRenderTab(); };
}
async function l3gSetColor(id, color) {
  const g = l3g.list.find(x => x.id === id); if (!g || g.color === color) return;
  await l3gWrite(arr => arr.map(x => x.id === id ? l3gStamp({ ...x, color }) : x), `3D: ny färg på gruppen ${g.name}`);
  if (l3p.colorBy && l3p.colorBy.key === "g:4d") { await l3pGroupBy("g:4d", { stay: true }); l3pColorOn(); }
}
function l3gHide(id) {
  const g = l3g.list.find(x => x.id === id); if (!g) return;
  l3VisRecord(`dölj ${g.name}`, () => {
    const meshes = new Set();
    l3gEnts(g).forEach(e => { e.mesh.userData.l3b.hidden.add(e.ri); meshes.add(e.mesh); });
    meshes.forEach(m => l3bApplyHidden(m));
    l3bsSet(l3bs.sel.filter(e => !e.mesh.userData.l3b.hidden.has(e.ri)).map(e => ({ mesh: e.mesh, ri: e.ri })));
    l3UpdateHidden();
  });
  l3Status(`${g.name} är dold – Ctrl+Z eller Visa alla (U) visar den igen.`);
}
/* Gruppera efter grupp (för Färga efter grupp): samma form som egenskapstrådens svar. */
function l3gValues(m) {
  const out = new Map();
  l3pSceneGuids(m).forEach(x => {
    const gs = l3gOf(x).map(g => g.name).sort((a, b) => a.localeCompare(b, "sv"));
    const k = gs.length ? gs.join(", ") : "\u0000";
    const a = out.get(k); if (a) a.push(x); else out.set(k, [x]);
  });
  return [...out];
}

/* ---- In i IFC:n --------------------------------------------------------------------------------- */
function l3gIfcStr(s) {
  let o = "";
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    if (ch === "'") o += "''"; else if (ch === "\\") o += "\\\\";
    else if (c >= 32 && c < 127) o += ch;
    else if (c <= 0xffff) o += "\\X2\\" + c.toString(16).toUpperCase().padStart(4, "0") + "\\X0\\";
    else o += "_";
  }
  return `'${o}'`;
}
function l3gGuid() { const A = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$"; let s = A[Math.floor(Math.random() * 4)]; for (let i = 1; i < 22; i++) s += A[Math.floor(Math.random() * 64)]; return s; }
/* Skriver in grupperna (4D-planering › Grupp) i IFC-texten. Returnerar { text, grouped }. */
function l3gApplyToIfc(text) {
  if (!l3g.list.some(g => (g.guids || []).length)) return { text, grouped: 0 };
  // Tidigare inskriven 4D-planering-grupp: relationerna tas bort (ersätts nedan).
  const old = new Set();
  const rePs = /(?:^|\n)#(\d+)\s*=\s*IFCPROPERTYSET\(\s*'[^']*'\s*,[^,]*,\s*'4D-planering'/g;
  let m;
  while ((m = rePs.exec(text))) old.add(m[1]);
  if (old.size) text = text.replace(/(\n)#\d+\s*=\s*IFCRELDEFINESBYPROPERTIES\([^;]*?,\s*#(\d+)\s*\)\s*;/g, (all, nl, ps) => (old.has(ps) ? nl : all));
  // GUID -> post, största id och projektets ägare (IFC2X3 kräver en).
  const ids = new Map();
  let maxId = 0, owner = "$";
  const re = /(?:^|\n)#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(\s*'([0-9A-Za-z_$]{22})'\s*,\s*([^,]*)/g;
  while ((m = re.exec(text))) {
    if (m[2] === "IFCPROJECT") owner = /^#\d+$/.test(m[4].trim()) ? m[4].trim() : "$";
    else if (!m[2].startsWith("IFCREL") && !m[2].startsWith("IFCPROPERTY")) ids.set(m[3], m[1]);
  }
  const reId = /(?:^|\n)#(\d+)\s*=/g;
  while ((m = reId.exec(text))) { const v = +m[1]; if (v > maxId) maxId = v; }
  // Ett värde per objekt (flera grupper kommaseparerade), en egenskapsgrupp per värde.
  const byVal = new Map();
  ids.forEach((id, guid) => {
    const gs = l3gOf(guid).map(g => g.name).sort((a, b) => a.localeCompare(b, "sv"));
    if (!gs.length) return;
    const v = gs.join(", "), a = byVal.get(v); if (a) a.push(id); else byVal.set(v, [id]);
  });
  if (!byVal.size) return { text, grouped: 0 };
  let next = maxId + 1, grouped = 0;
  const add = [];
  byVal.forEach((objs, v) => {
    const p = next++, s = next++, r = next++;
    add.push(`#${p}=IFCPROPERTYSINGLEVALUE('Grupp',$,IFCLABEL(${l3gIfcStr(v)}),$);`);
    add.push(`#${s}=IFCPROPERTYSET('${l3gGuid()}',${owner},'4D-planering',$,(#${p}));`);
    add.push(`#${r}=IFCRELDEFINESBYPROPERTIES('${l3gGuid()}',${owner},$,$,(${objs.map(x => "#" + x).join(",")}),#${s});`);
    grouped += objs.length;
  });
  const end = text.lastIndexOf("ENDSEC;");
  return { text: text.slice(0, end) + add.join("\n") + "\n" + text.slice(end), grouped };
}
/* Knappen Skriv in i <modell>: originalet med grupperna (och flyttar) som ny IFC-fil i samma mapp. */
async function l3gSaveModel(m) {
  if (!m) return;
  const key = "gsave", lbl = `Skriver in grupperna i ${m.name}`;
  try {
    busyProgress(key, `${lbl}: hämtar originalet`, 0);
    const res = await l3bmFetchIfc(m, f => busyProgress(key, `${lbl}: hämtar originalet`, 0.6 * f));
    if (!res.grouped) { busyProgress(key, "", null); l3Status(`Inga objekt i ${m.name} ligger i någon grupp.`, true); return null; }
    busyProgress(key, `${lbl}: laddar upp`, 0.7);
    const name = l3bmFileName(m, "grupper");
    const up = await l3bmUpload(m, l3bmStrBytes(res.text), name);
    busyProgress(key, "", null);
    const ed = l3bm.edits.get(m.id); if (ed) ed.dirty = false; // flyttarna följde med
    l3Toast(`Sparad som ny fil i Trimble Connect: ${name}${up && up.folder ? ` (${up.folder})` : ""} – ${res.grouped} objekt har egenskapen 4D-planering › Grupp. Originalet är orört.`);
    l3Status(`Sparad: ${name}`);
    return { name, ...res };
  } catch (e) {
    busyProgress(key, "", null);
    l3Status("Kunde inte spara: " + e.message, true);
    throw e;
  }
}
