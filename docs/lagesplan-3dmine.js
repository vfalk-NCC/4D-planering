/* Objekt i projektet – ett eget avsnitt överst i 3D-biblioteket (Victor 2026-11-11: "ett avsnitt för det jag modellerar i 3d-editorn … sortera, tända och släcka, dela in i områden").
   Allt man ritar eller modellerar (ytor, kroppar, linjer, stödmurar, delade bitar, gjutformar …) är placeringar av typen "mod:*" och listas här.
   – Områden: p.area (text) sparas på objektet och delas därmed i projektet. Tomma områden sparas i inställningarna (l3Prefs().moAreas).
   – Tänd/släck: hela avsnittet, ett område eller ett objekt (samma dolda-mängd som övriga editorn, ångras med Ctrl+Z).
   – Sortera (namn, typ, nyast, 4D-aktivitet, storlek) och gruppera (område, typ, ingen). Sök. Ctrl/Skift-klick väljer flera.
   – Dra rader till ett område, eller högerklicka / "Flytta till område". Dubbelklick på namnet byter namn. Klick markerar i 3D, ⌖ flyger dit.
   Prefix l3mn. Ritas om efter l3RenderLib, l3Changed och l3SelectIds (omslagna). */
const l3mn = { q: "", anchor: null, raf: 0, reg: { paths: [], cfg: {}, loaded: false, loading: null, pid: null } };
/* Alla placerade objekt: ritade (ytor, kroppar, stödmurar, spont …) och sådana från objektbiblioteket (staket, bodar, kranar, bemanning …).
   Mappar: p.area är en sökväg med "/" mellan nivåerna ("Pålning/Etapp 1") och sparas på objektet (delas via plan_placements.json). Tomma mappar och sorteringen sparas delat i plan_objfolders.json. */
const l3mnAll = () => (typeof placements !== "undefined" ? placements : []);
const l3mnPath = () => `projects/${encodeURIComponent(projectId)}/plan_objfolders.json`;
const l3mnSeg = p => String(p).split("/").pop();
const l3mnParent = p => { const i = String(p).lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i); };
const l3mnUnder = (p, root) => p === root || String(p).startsWith(root + "/");
const l3mnClean = n => String(n || "").replace(/[\/\\]/g, " ").trim().slice(0, 60);
function l3mnRegParse(arr) { const a = Array.isArray(arr) ? arr : []; return { paths: a.filter(x => x && x.p).map(x => String(x.p)), cfg: a.find(x => x && x.cfg) || {} }; }
const l3mnRegArr = r => [...r.paths.map(p => ({ p })), { cfg: true, sort: r.cfg.sort, group: r.cfg.group }];
function l3mnRegLoad() {
  const R = l3mn.reg, pid = typeof projectId !== "undefined" ? projectId : null; if (R.pid !== pid) { R.pid = pid; R.loaded = false; R.loading = null; R.paths = []; R.cfg = {}; }
  if (R.loaded || !pid || typeof ghReadJSON !== "function" || typeof token === "undefined" || !token) return;
  if (!R.loading) R.loading = (async () => { try { const d = l3mnRegParse(await ghReadJSON(token, l3mnPath())); R.paths = d.paths; R.cfg = d.cfg; } catch (e) { console.warn("Kunde inte läsa plan_objfolders.json", e); } R.loaded = true; R.loading = null; l3mnRender(); })();
}
async function l3mnRegWrite(mut, msg) {
  const R = l3mn.reg, apply = arr => { const n = l3mnRegParse(arr); mut(n); return l3mnRegArr(n); };
  const cur = apply(l3mnRegArr(R)), d = l3mnRegParse(cur); R.paths = d.paths; R.cfg = d.cfg; l3mnRender();   // direkt lokalt, sedan delat i projektet
  if (typeof projectId === "undefined" || !projectId || typeof ghWriteJSON !== "function" || typeof token === "undefined" || !token) return;
  try { const next = await ghWriteJSON(token, l3mnPath(), apply, msg); if (next) { const n = l3mnRegParse(next); R.paths = n.paths; R.cfg = n.cfg; l3mnRender(); } } catch (e) { l3Status("Kunde inte spara mappstrukturen i projektet: " + e.message, true); }
}
/* Alla mappsökvägar (inklusive överliggande nivåer) från projektets fil, objekten och äldre lokala mappar. */
function l3mnAreas() {
  const s = new Set(); const add = p => { p = String(p || "").trim(); if (!p) return; let acc = ""; p.split("/").forEach(seg => { acc = acc ? acc + "/" + seg : seg; s.add(acc); }); };
  l3mn.reg.paths.forEach(add); (l3Prefs().moAreas || []).forEach(add); l3mnAll().forEach(p => add(p.area));
  return [...s].sort((a, b) => a.localeCompare(b, "sv", { numeric: true }));
}
const l3mnHid = id => !!(l3.hidden && l3.hidden.has(id));
const l3mnShut = () => new Set(l3Prefs().moShut || []);
const l3mnTypeLabel = p => (typeof MOD_LABEL !== "undefined" && MOD_LABEL[p.type]) || ((typeof placeLib === "function" && (placeLib(p.type) || {}).label) || "Objekt");
const l3mnSortKey = () => l3mn.reg.cfg.sort || l3Prefs().moSort || "name", l3mnGroupKey = () => l3mn.reg.cfg.group || l3Prefs().moGroup || "area";
function l3mnSize(p) { try { if (!(typeof modIsType === "function" && modIsType(p.type))) return 0; const d = modDims(p); return Array.isArray(d) ? (Number(d[0] && d[0][1]) || 0) : (Number(d && (d.vol || d.area || d.len)) || 0); } catch (e) { return 0; } }
function l3mnActName(p) { if (!p.itemId || typeof items === "undefined") return ""; const it = items.find(i => i.id === p.itemId); return it ? String(it.objectName || it.activity || "") : ""; }
function l3mnSorted(list) {
  const s = l3mnSortKey(), idx = p => placements.indexOf(p), dt = (a, b) => (String(a.created_at || "") < String(b.created_at || "") ? -1 : String(a.created_at || "") > String(b.created_at || "") ? 1 : idx(a) - idx(b)), cmp = (a, b) => String(a || "").localeCompare(String(b || ""), "sv", { numeric: true });
  const f = { name: (a, b) => cmp(a.name, b.name), type: (a, b) => cmp(l3mnTypeLabel(a), l3mnTypeLabel(b)) || cmp(a.name, b.name), new: (a, b) => dt(b, a), old: (a, b) => dt(a, b), act: (a, b) => cmp(l3mnActName(a) || "ÿ", l3mnActName(b) || "ÿ") || cmp(a.name, b.name), size: (a, b) => l3mnSize(b) - l3mnSize(a) }[s] || ((a, b) => cmp(a.name, b.name));
  return list.slice().sort(f);
}
/* Mapp-trädet: noder { path, name, depth, own (direkt i mappen), all (inklusive undermappar), kids }. */
function l3mnTree(list, q) {
  const nodes = new Map(), mk = path => { let n = nodes.get(path); if (!n) { n = { path, name: path ? l3mnSeg(path) : "Utan mapp", depth: path ? path.split("/").length - 1 : 0, own: [], all: [], kids: [] }; nodes.set(path, n); } return n; };
  l3mnAreas().forEach(mk); list.forEach(p => mk(p.area || "").own.push(p));
  const roots = []; [...nodes.values()].forEach(n => { if (!n.path) return; const par = l3mnParent(n.path); if (par) mk(par).kids.push(n); else roots.push(n); });
  const sortKids = n => { n.kids.sort((a, b) => a.name.localeCompare(b.name, "sv", { numeric: true })); n.kids.forEach(sortKids); }; roots.sort((a, b) => a.name.localeCompare(b.name, "sv", { numeric: true })); roots.forEach(sortKids);
  const fill = n => { n.all = [...n.own]; n.kids.forEach(k => { fill(k); n.all.push(...k.all); }); }; roots.forEach(fill); const none = mk(""); none.all = none.own;
  const keep = n => !q || n.all.length > 0; const prune = n => { n.kids = n.kids.filter(keep); n.kids.forEach(prune); }; roots.forEach(prune);
  return { roots: roots.filter(keep), none, all: nodes };
}
function l3mnGroups() {
  const q = l3mn.q.trim().toLowerCase(), g = l3mnGroupKey(), all = l3mnAll();
  const list = l3mnSorted(all.filter(p => !q || `${p.name} ${l3mnTypeLabel(p)} ${p.area || ""} ${l3mnActName(p)}`.toLowerCase().includes(q)));
  let groups = [], tree = null;
  if (g === "none") groups = [{ key: "", name: "", items: list, flat: true }];
  else if (g === "type") { const m = new Map(); list.forEach(p => { const k = l3mnTypeLabel(p); (m.get(k) || m.set(k, []).get(k)).push(p); }); groups = [...m].sort((a, b) => a[0].localeCompare(b[0], "sv")).map(([k, v]) => ({ key: "t:" + k, name: k, items: v, type: true })); }
  else { tree = l3mnTree(list, q); const flat = []; const walk = n => { flat.push({ key: "a:" + n.path, name: n.name, items: n.all, area: n.path, node: n }); n.kids.forEach(walk); }; tree.roots.forEach(walk); if (tree.none.own.length) flat.push({ key: "a:", name: "Utan mapp", items: tree.none.own, area: "", none: true, node: tree.none }); groups = flat; }
  return { groups, tree, total: all.length, shown: list.length };
}
function l3mnVis(ids, show, label) {
  ids = ids.filter(id => l3mnHid(id) === show); if (!ids.length) return;
  l3VisRecord(label, () => {
    if (!l3.hidden) l3.hidden = new Set();
    ids.forEach(id => { if (show) l3.hidden.delete(id); else l3.hidden.add(id); const g = l3.placeMeshes.get(id); if (g) g.visible = show; });
    if (!show) l3SelectIds([...l3.sel].filter(id => !l3.hidden.has(id)));
    if (typeof l3UpdateHidden === "function") l3UpdateHidden();
  });
  if (typeof l3LayersRender === "function") l3LayersRender();
  l3Render(); l3mnRender();
}
/* Flytta objekt till en mapp (sökväg). Sparas på objekten (delas) och mappen läggs i projektets mappfil. */
function l3mnSetArea(ids, area) {
  const list = placements.filter(p => ids.includes(p.id)); if (!list.length) return; area = String(area || "").trim().replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
  placeSnapshot(); list.forEach(p => { if (area) p.area = area; else delete p.area; placeTouch(p); });
  if (area) l3mnRegAdd(area);
  l3Changed(); l3mnFlush(); l3mnRender(); l3Status(`${list.length} objekt ${area ? "flyttade till mappen " + area : "har tagits ur sina mappar"}.`);
}
function l3mnRegAdd(path) { if (!path || l3mn.reg.paths.includes(path)) return Promise.resolve(); return l3mnRegWrite(r => { if (!r.paths.includes(path)) r.paths.push(path); }, `Objektmappar: ${path}`); }
async function l3mnNewArea(ids, parent) {
  const n = l3mnClean(await uiPrompt(parent ? `Namn på undermappen i "${parent}":` : "Namn på mappen:", "")); if (!n) return null; const path = parent ? parent + "/" + n : n;
  if (ids && ids.length) l3mnSetArea(ids, path); else await l3mnRegAdd(path); return path;
}
/* Byt namn på / flytta en mapp: alla sökvägar som börjar med den gamla ändras (objekt och projektets mappfil). */
/* Sparar objektens mappval direkt (annars väntar det en stund) och säger till om det inte gick – så mappstrukturen och objekten inte kommer ur takt. */
async function l3mnFlush() { try { if (typeof placeSaveNow === "function") await placeSaveNow(); } catch (e) { /* hanteras nedan */ } if (typeof placeDirty !== "undefined" && placeDirty.size && typeof l3Status === "function") l3Status("Objektens mappar kunde inte sparas i projektet än – försöker igen vid nästa ändring.", true); }
async function l3mnRenamePrefix(oldP, newP) {
  if (!oldP || !newP || oldP === newP || l3mnUnder(newP, oldP)) return;
  const sw = x => (l3mnUnder(x, oldP) ? newP + x.slice(oldP.length) : x), hit = placements.filter(p => p.area && l3mnUnder(p.area, oldP));
  if (hit.length) { placeSnapshot(); hit.forEach(p => { p.area = sw(p.area); placeTouch(p); }); l3Changed(); await l3mnFlush(); }
  l3SetPref("moAreas", (l3Prefs().moAreas || []).map(sw)); l3SetPref("moShut", (l3Prefs().moShut || []).map(k => (k.startsWith("a:") && l3mnUnder(k.slice(2), oldP) ? "a:" + sw(k.slice(2)) : k)));
  await l3mnRegWrite(r => { r.paths = [...new Set([...r.paths.map(sw), newP])]; }, `Objektmappar: ${oldP} → ${newP}`); l3mnRender();
}
async function l3mnRenameArea(a) { const n = l3mnClean(await uiPrompt("Nytt namn på mappen:", l3mnSeg(a))); if (!n || n === l3mnSeg(a)) return; const par = l3mnParent(a); await l3mnRenamePrefix(a, par ? par + "/" + n : n); }
async function l3mnMoveArea(src, dst) { const np = (dst ? dst + "/" : "") + l3mnSeg(src); if (np === src || (dst && l3mnUnder(dst, src))) { l3Status("Mappen kan inte flyttas dit.", true); return; } await l3mnRenamePrefix(src, np); }
async function l3mnDeleteArea(a) {
  const hit = l3mnAll().filter(p => p.area && l3mnUnder(p.area, a)), subs = l3mnAreas().filter(x => x !== a && l3mnUnder(x, a)).length, par = l3mnParent(a);
  if ((hit.length || subs) && !(await uiConfirm(`Ta bort mappen "${a}"${subs ? ` och dess ${subs} undermappar` : ""}? ${hit.length ? `Objekten (${hit.length}) behålls och flyttas upp till ${par ? `"${par}"` : "Utan mapp"}.` : ""}`, { ok: "Ta bort mappen" }))) return;
  if (hit.length) { placeSnapshot(); hit.forEach(p => { if (par) p.area = par; else delete p.area; placeTouch(p); }); l3Changed(); }
  l3SetPref("moAreas", (l3Prefs().moAreas || []).filter(x => !l3mnUnder(x, a)));
  await l3mnRegWrite(r => { r.paths = r.paths.filter(x => !l3mnUnder(x, a)); }, `Objektmappar: ${a} borttagen`); l3mnRender();
}
async function l3mnRenameObj(id) { const p = placements.find(x => x.id === id); if (!p) return; const n = (await uiPrompt("Namn på objektet:", p.name || "") || "").trim(); if (!n || n === p.name) return; placeSnapshot(); p.name = n; placeTouch(p); l3Changed(); l3mnRender(); }
function l3mnMoveMenu(ids, x, y) {
  const areas = l3mnAreas(), cur = new Set(placements.filter(p => ids.includes(p.id)).map(p => p.area || ""));
  const it = areas.map(a => ({ label: " ".repeat(a.split("/").length - 1) + l3mnSeg(a), on: cur.size === 1 && cur.has(a), fn: () => l3mnSetArea(ids, a) }));
  if (it.length) it.push({ sep: true });
  it.push({ label: "Ny mapp…", fn: () => l3mnNewArea(ids) });
  if ([...cur].some(Boolean)) it.push({ label: "Ta ur mappen", fn: () => l3mnSetArea(ids, "") });
  l3lfMenu(x, y, it);
}
function l3mnRowMenu(id, x, y) {
  const p = placements.find(q => q.id === id); if (!p) return; const ids = l3.sel.has(id) && l3.sel.size > 1 ? [...l3.sel].filter(i => l3mnAll().some(q => q.id === i)) : [id];
  l3lfMenu(x, y, [
    { label: ids.length > 1 ? `${ids.length} valda – flytta till mapp…` : "Flytta till mapp…", fn: () => l3mnMoveMenu(ids, x, y) },
    { label: "Byt namn…", fn: () => l3mnRenameObj(id) }, { sep: true },
    { label: "Visa bara denna", fn: () => { const all = l3mnAll().map(q => q.id); l3mnVis(all.filter(i => !ids.includes(i)), false, "visa bara valda objekt"); l3mnVis(ids, true, "visa"); } },
    { label: "Släck", fn: () => l3mnVis(ids, false, "släck objekt") }, { label: "Flyg dit", fn: () => { l3SelectIds(ids); l3ZoomSelected(); } },
  ]);
}
function l3mnRow(p, vis) {
  const esc = escHtml, hid = l3mnHid(p.id), on = l3.sel.has(p.id), act = l3mnActName(p), I = L3_ICO;
  return `<div class="v3-mo-r ${on ? "on" : ""} ${hid ? "off" : ""}" data-moid="${esc(p.id)}" title="Klick = markera · Ctrl/Skift = flera · dubbelklick = byt namn · dra till en mapp · högerklick = meny">
    <button type="button" class="v3-mo-eye ${hid ? "" : "on"}" data-moeye="${esc(p.id)}" title="${hid ? "Tänd" : "Släck"}" aria-label="${hid ? "Tänd" : "Släck"} ${esc(p.name || "")}">${I.eye}</button>
    <i style="background:${esc(p.color || "#a8b3c4")}"></i><span class="v3-mo-n"><b>${esc(p.name || l3mnTypeLabel(p))}</b><em>${esc(l3mnTypeLabel(p))}${p.area && l3mnGroupKey() === "type" ? " · " + esc(p.area) : ""}${act ? " · " + esc(act) : ""}</em></span>
    <button type="button" class="v3-mo-go" data-mogo="${esc(p.id)}" title="Flyg till objektet">${I.search || "⌖"}</button></div>`;
}
function l3mnRender() {
  const host = document.getElementById("v3Lib"); if (!host || typeof l3 === "undefined" || !l3 || !l3.renderer) return; l3mnRegLoad();
  let el = host.querySelector(":scope > #v3Mine");   // ligger överst i #v3Lib så att rubrikerna får exakt samma utseende som övriga mappar
  if (!el) { el = document.createElement("div"); el.id = "v3Mine"; host.prepend(el); }
  const { groups, tree, total, shown } = l3mnGroups(), esc = escHtml, I = L3_ICO, shut = l3mnShut(), q = l3mn.q, sortK = l3mnSortKey(), groupK = l3mnGroupKey();
  if (!total && !l3mnAreas().length) { el.innerHTML = ""; el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  const all = l3mnAll(), anyOn = all.some(p => !l3mnHid(p.id)), secShut = shut.has("__sec");
  const selMine = [...l3.sel].filter(id => all.some(p => p.id === id)), order = [];
  const head = (g, open, vis, depth) => `<div class="v3-lf v3-pill v3-mo-g ${g.area !== undefined ? "v3-mo-drop" : ""}" data-mog="${esc(g.key)}" ${g.area !== undefined ? `data-moarea="${esc(g.area)}"` : ""} style="${depth ? `margin-left:${Math.min(depth, 5) * 10}px` : ""}">
      <button type="button" class="v3-pal-g" data-moshut="${esc(g.key)}" aria-expanded="${open}" ${g.area ? `data-mofold="${esc(g.area)}"` : ""}><span>${esc(g.name)}</span><em>${g.items.length}</em></button>
      ${g.items.length ? `<button type="button" class="v3-lf-ic" data-mosel="${esc(g.key)}" title="Markera och flyg till alla i mappen">${I.cursor || "▣"}</button>` : ""}
      ${g.area ? `<button type="button" class="v3-lf-ic" data-monew="${esc(g.area)}" title="Ny undermapp">＋</button><button type="button" class="v3-lf-ic" data-moren="${esc(g.area)}" title="Byt namn på mappen">${I.edit}</button><button type="button" class="v3-lf-ic" data-model="${esc(g.area)}" title="Ta bort mappen (objekten behålls)">${I.trash}</button>` : ""}
      <label class="v3-lay-sw v3-lf-sw" title="${vis ? "Släck" : "Tänd"} ${g.items.length} objekt"><input type="checkbox" role="switch" data-movis="${esc(g.key)}" ${vis || !g.items.length ? "checked" : ""} ${g.items.length ? "" : "disabled"} /><i></i></label></div>`;
  const nodeHtml = (n, g) => { const open = !!q || !shut.has(g.key), vis = g.items.some(p => !l3mnHid(p.id)); let h = head(g, open, vis, n.depth); if (!open) return h;
    const own = n.own.map(p => { order.push(p.id); return l3mnRow(p); }).join(""), kids = n.kids.map(k => nodeHtml(k, groups.find(x => x.key === "a:" + k.path))).join("");
    return h + `<div class="v3-mo-items" style="${n.depth ? `margin-left:${Math.min(n.depth + 1, 6) * 10}px` : ""}">${own}${kids}${!own && !kids ? `<div class="v3-pal-hint">Tom – dra objekt hit.</div>` : ""}</div>`; };
  let gHtml;
  if (groupK === "none") gHtml = (groups[0] ? groups[0].items : []).map(p => { order.push(p.id); return l3mnRow(p); }).join("");
  else if (groupK === "type") gHtml = groups.map(g => { const open = !!q || !shut.has(g.key), vis = g.items.some(p => !l3mnHid(p.id)); return head(g, open, vis, 0).replace(/ v3-mo-drop/, "") + (open ? `<div class="v3-mo-items">${g.items.map(p => { order.push(p.id); return l3mnRow(p); }).join("")}</div>` : ""); }).join("");
  else gHtml = tree.roots.map(r => nodeHtml(r, groups.find(x => x.key === "a:" + r.path))).join("") + (tree.none.own.length ? (() => { const g = groups.find(x => x.key === "a:"); return nodeHtml(tree.none, g); })() : "");
  const opt = (v, cur, t) => `<option value="${v}" ${cur === v ? "selected" : ""}>${t}</option>`;
  el.innerHTML = `<div class="v3-mo-sec"><div class="v3-lf v3-pill"><button type="button" class="v3-pal-g" id="v3MoHead" aria-expanded="${!secShut}"><span>Objekt</span><em>${total}</em></button>
      <button type="button" class="v3-lf-ic v3-mo-plus" id="v3MoNew" title="Ny mapp (dra objekt hit för en ny mapp med dem i)">＋</button>
      <label class="v3-lay-sw v3-lf-sw" title="${anyOn ? "Släck" : "Tänd"} alla objekt"><input type="checkbox" role="switch" id="v3MoAllVis" ${anyOn || !total ? "checked" : ""} ${total ? "" : "disabled"} /><i></i></label></div>
    ${secShut ? "" : `<div class="v3-mo-tools"><input type="search" id="v3MoQ" placeholder="Sök objekt…" value="${esc(q)}" />
      <select id="v3MoSort" title="Sortera (delas med alla i projektet)">${opt("name", sortK, "Namn")}${opt("type", sortK, "Typ")}${opt("new", sortK, "Nyast först")}${opt("old", sortK, "Äldst först")}${opt("act", sortK, "4D-aktivitet")}${opt("size", sortK, "Störst")}</select>
      <select id="v3MoGroup" title="Gruppera (delas med alla i projektet)">${opt("area", groupK, "Mappar")}${opt("type", groupK, "Typ")}${opt("none", groupK, "Ingen")}</select></div>
    ${selMine.length ? `<div class="v3-mo-bar"><b>${selMine.length} valda</b><button type="button" id="v3MoMove">Flytta till mapp ▾</button><button type="button" id="v3MoHide">Släck</button><button type="button" id="v3MoShow">Tänd</button></div>` : ""}
    <div class="v3-mo-list">${gHtml || `<div class="v3-pal-hint">${shown ? "" : "Inget matchar."}</div>`}</div>`}</div>`;
  l3mnBind(el, groups, selMine, order);
}
function l3mnBind(el, groups, selMine, order) {
  const $ = s => el.querySelector(s);
  const setShut = (k, open) => { const s = l3mnShut(); if (open) s.delete(k); else s.add(k); l3SetPref("moShut", [...s]); l3mnRender(); };
  $("#v3MoHead").onclick = e => setShut("__sec", e.currentTarget.getAttribute("aria-expanded") !== "true");
  $("#v3MoNew").onclick = () => l3mnNewArea(selMine.length ? selMine : null);
  $("#v3MoAllVis").onchange = e => { const ids = l3mnAll().map(p => p.id); l3mnVis(ids, e.target.checked, `${e.target.checked ? "visa" : "dölj"} objekt`); };
  const q = $("#v3MoQ"); if (!q) return;
  q.oninput = () => { l3mn.q = q.value; const pos = q.selectionStart; l3mnRender(); const n = document.getElementById("v3MoQ"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* ok */ } } };
  $("#v3MoSort").onchange = e => { l3SetPref("moSort", e.target.value); l3mnRegWrite(r => { r.cfg = { ...r.cfg, sort: e.target.value }; }, "Objektlistan: sortering"); };
  $("#v3MoGroup").onchange = e => { l3SetPref("moGroup", e.target.value); l3mnRegWrite(r => { r.cfg = { ...r.cfg, group: e.target.value }; }, "Objektlistan: gruppering"); };
  const mv = $("#v3MoMove"); if (mv) { mv.onclick = e => { const r = mv.getBoundingClientRect(); l3mnMoveMenu(selMine, r.left, r.bottom + 4); }; $("#v3MoHide").onclick = () => l3mnVis(selMine, false, "släck valda"); $("#v3MoShow").onclick = () => l3mnVis(selMine, true, "tänd valda"); }
  // Klick på mappens namn markerar dess objekt (Ctrl/Cmd/Skift = lägg till eller ta bort fler mappar); pilen längst till vänster fäller ihop/ut.
  el.querySelectorAll("[data-moshut]").forEach(b => { b.onclick = e => {
    const g = groups.find(x => x.key === b.dataset.moshut), onArrow = e.clientX - b.getBoundingClientRect().left < 22;
    if (onArrow || !g || !g.items.length) { setShut(b.dataset.moshut, b.getAttribute("aria-expanded") !== "true"); return; }
    const ids = g.items.map(p => p.id).filter(id => !l3mnHid(id));
    if (e.ctrlKey || e.metaKey || e.shiftKey) { const cur = new Set(l3.sel), all = ids.length && ids.every(id => cur.has(id)); ids.forEach(id => (all ? cur.delete(id) : cur.add(id))); l3SelectIds([...cur]); }
    else l3SelectIds(ids);
    if (typeof l3Status === "function") l3Status(`${l3.sel.size} objekt markerade${e.ctrlKey || e.metaKey ? " (Ctrl: håll in och klicka fler mappar)" : " – håll Ctrl för att välja flera mappar"}.`);
  }; b.title = "Klick = markera objekten i mappen · Ctrl = flera mappar · pilen fäller ihop"; });
  el.querySelectorAll("[data-movis]").forEach(c => { c.onchange = () => { const g = groups.find(x => x.key === c.dataset.movis); if (g) l3mnVis(g.items.map(p => p.id), c.checked, `${c.checked ? "visa" : "dölj"} ${g.name || "objekt"}`); }; });
  el.querySelectorAll("[data-mosel]").forEach(b => { b.onclick = () => { const g = groups.find(x => x.key === b.dataset.mosel); if (g) { l3SelectIds(g.items.map(p => p.id)); l3ZoomSelected(); } }; });
  el.querySelectorAll("[data-monew]").forEach(b => { b.onclick = () => l3mnNewArea(null, b.dataset.monew); });
  el.querySelectorAll("[data-moren]").forEach(b => { b.onclick = () => l3mnRenameArea(b.dataset.moren); });
  el.querySelectorAll("[data-model]").forEach(b => { b.onclick = () => l3mnDeleteArea(b.dataset.model); });
  el.querySelectorAll("[data-moeye]").forEach(b => { b.onclick = e => { e.stopPropagation(); const id = b.dataset.moeye, sel = l3.sel.has(id) && l3.sel.size > 1 ? [...l3.sel].filter(i => l3mnAll().some(p => p.id === i)) : [id]; l3mnVis(sel, l3mnHid(id), "tänd/släck objekt"); }; });
  el.querySelectorAll("[data-mogo]").forEach(b => { b.onclick = e => { e.stopPropagation(); l3SelectIds([b.dataset.mogo]); l3ZoomSelected(); }; });
  // dra en mapp till en annan mapp (eller till "Utan mapp" för översta nivån)
  if (typeof l3DndBind === "function") el.querySelectorAll("[data-mofold]").forEach(b => l3DndBind(b, () => {
    const src = b.dataset.mofold, tg = [...el.querySelectorAll(".v3-mo-drop")].filter(t => { const a = t.dataset.moarea; return a !== src && !(a && l3mnUnder(a, src)) && !(a === "" ? false : false); });
    return { items: [{ folder: src }], pal: el, color: "#2f7bff", title: l3mnSeg(src), sub: "Släpp i en annan mapp", src: [b.closest(".v3-mo-g")], targets: tg, name: t => t.dataset.moarea || "Översta nivån", drop: async t => { await l3mnMoveArea(src, t.dataset.moarea || ""); } };
  }));
  el.querySelectorAll(".v3-mo-r").forEach(r => {
    const id = r.dataset.moid;
    r.onclick = e => {
      if (e.target.closest("button")) return;
      if (l3mnHid(id)) return;
      if (e.shiftKey && l3mn.anchor && order.includes(l3mn.anchor)) { const a = order.indexOf(l3mn.anchor), b = order.indexOf(id); l3SelectIds(order.slice(Math.min(a, b), Math.max(a, b) + 1)); }
      else if (e.ctrlKey || e.metaKey) { const s = new Set(l3.sel); if (s.has(id)) s.delete(id); else s.add(id); l3mn.anchor = id; l3SelectIds([...s]); }
      else { l3mn.anchor = id; l3SelectIds([id]); }
    };
    r.ondblclick = e => { if (!e.target.closest("button")) l3mnRenameObj(id); };
    r.oncontextmenu = e => { e.preventDefault(); l3mnRowMenu(id, e.clientX, e.clientY); };
    if (typeof l3DndBind === "function") l3DndBind(r, () => {
      const ids = l3.sel.has(id) && l3.sel.size > 1 ? [...l3.sel].filter(i => l3mnAll().some(p => p.id === i)) : [id], p = placements.find(x => x.id === id); if (!p) return null;
      const tg = [...el.querySelectorAll(".v3-mo-drop")];
      return { items: ids, pal: el, color: p.color, title: p.name || l3mnTypeLabel(p), sub: "Släpp på en mapp", src: ids.map(i => el.querySelector(`[data-moid="${CSS.escape(i)}"]`)), targets: [...tg, $("#v3MoNew")],
        name: t => (t.id === "v3MoNew" ? "Ny mapp…" : t.dataset.moarea || "Utan mapp"),
        drop: async t => { if (t.id === "v3MoNew") { await l3mnNewArea(ids); return; } l3mnSetArea(ids, t.dataset.moarea || ""); } };
    });
  });
}
/* Menyn står stilla när man markerar: rullningen sparas och läggs tillbaka efter varje ommålning (både Objekt-sektionen och hela biblioteket ritas om vid markering). */
function l3mnScroller() { let e = document.getElementById("v3Lib"); while (e && e !== document.body) { const o = getComputedStyle(e).overflowY; if ((o === "auto" || o === "scroll") && e.scrollHeight > e.clientHeight + 1) return e; e = e.parentElement; } return document.getElementById("v3Pal"); }
{ const f0 = l3mnRender; l3mnRender = function () { const s = l3mnScroller(), t = s ? s.scrollTop : 0, r = f0.apply(this, arguments); if (s && s.scrollTop !== t) s.scrollTop = t; return r; }; }
(() => {
  const now = () => { try { l3mnRender(); } catch (e) { console.warn("Objekt", e); } };
  const later = () => { if (l3mn.raf) return; l3mn.raf = requestAnimationFrame(() => { l3mn.raf = 0; try { l3mnRender(); } catch (e) { console.warn("Objekt", e); } }); };
  const wrap = n => { const f = window[n]; if (typeof f !== "function" || f.__mo) return; const w = function () { const sc = l3mnScroller(), top = sc ? sc.scrollTop : 0, r = f.apply(this, arguments); if (n === "l3RenderLib") now(); else later(); if (sc) { sc.scrollTop = top; requestAnimationFrame(() => { sc.scrollTop = top; }); } return r; }; w.__mo = true; window[n] = w; };
  const go = () => { ["l3RenderLib", "l3Changed", "l3SelectIds", "l3UpdateHidden", "l3ShowAll"].forEach(wrap); };   // senare skript definierar funktionerna – vänta tills allt är inläst
  if (document.readyState === "complete") go(); else window.addEventListener("load", go);
})();
