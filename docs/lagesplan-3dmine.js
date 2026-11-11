/* Ritade objekt – ett eget avsnitt överst i 3D-biblioteket (Victor 2026-11-11: "ett avsnitt för det jag modellerar i 3d-editorn … sortera, tända och släcka, dela in i områden").
   Allt man ritar eller modellerar (ytor, kroppar, linjer, stödmurar, delade bitar, gjutformar …) är placeringar av typen "mod:*" och listas här.
   – Områden: p.area (text) sparas på objektet och delas därmed i projektet. Tomma områden sparas i inställningarna (l3Prefs().moAreas).
   – Tänd/släck: hela avsnittet, ett område eller ett objekt (samma dolda-mängd som övriga editorn, ångras med Ctrl+Z).
   – Sortera (namn, typ, nyast, 4D-aktivitet, storlek) och gruppera (område, typ, ingen). Sök. Ctrl/Skift-klick väljer flera.
   – Dra rader till ett område, eller högerklicka / "Flytta till område". Dubbelklick på namnet byter namn. Klick markerar i 3D, ⌖ flyger dit.
   Prefix l3mn. Ritas om efter l3RenderLib, l3Changed och l3SelectIds (omslagna). */
const l3mn = { q: "", anchor: null, raf: 0 };
const l3mnAll = () => (typeof placements !== "undefined" ? placements : []).filter(p => typeof modIsType === "function" && modIsType(p.type));
const l3mnAreas = () => { const s = new Set((l3Prefs().moAreas || []).filter(Boolean)); l3mnAll().forEach(p => { if (p.area) s.add(p.area); }); return [...s].sort((a, b) => a.localeCompare(b, "sv", { numeric: true })); };
const l3mnHid = id => !!(l3.hidden && l3.hidden.has(id));
const l3mnShut = () => new Set(l3Prefs().moShut || []);
const l3mnTypeLabel = p => (typeof MOD_LABEL !== "undefined" && MOD_LABEL[p.type]) || "Objekt";
function l3mnSize(p) { try { const d = modDims(p); return Array.isArray(d) ? (Number(d[0] && d[0][1]) || 0) : (Number(d && (d.vol || d.area || d.len)) || 0); } catch (e) { return 0; } }
function l3mnActName(p) { if (!p.itemId || typeof items === "undefined") return ""; const it = items.find(i => i.id === p.itemId); return it ? String(it.objectName || it.activity || "") : ""; }
function l3mnSorted(list) {
  const s = l3Prefs().moSort || "name", idx = p => placements.indexOf(p), dt = (a, b) => (String(a.created_at || "") < String(b.created_at || "") ? -1 : String(a.created_at || "") > String(b.created_at || "") ? 1 : idx(a) - idx(b)), cmp = (a, b) => String(a || "").localeCompare(String(b || ""), "sv", { numeric: true });
  const f = { name: (a, b) => cmp(a.name, b.name), type: (a, b) => cmp(l3mnTypeLabel(a), l3mnTypeLabel(b)) || cmp(a.name, b.name), new: (a, b) => dt(b, a), old: (a, b) => dt(a, b), act: (a, b) => cmp(l3mnActName(a) || "ÿ", l3mnActName(b) || "ÿ") || cmp(a.name, b.name), size: (a, b) => l3mnSize(b) - l3mnSize(a) }[s] || ((a, b) => cmp(a.name, b.name));
  return list.slice().sort(f);
}
/* Rader i den ordning de visas (för Skift-klick). */
function l3mnGroups() {
  const q = l3mn.q.trim().toLowerCase(), g = l3Prefs().moGroup || "area", all = l3mnAll();
  const list = l3mnSorted(all.filter(p => !q || `${p.name} ${l3mnTypeLabel(p)} ${p.area || ""} ${l3mnActName(p)}`.toLowerCase().includes(q)));
  let groups = [];
  if (g === "none") groups = [{ key: "", name: "", items: list, flat: true }];
  else if (g === "type") { const m = new Map(); list.forEach(p => { const k = l3mnTypeLabel(p); (m.get(k) || m.set(k, []).get(k)).push(p); }); groups = [...m].sort((a, b) => a[0].localeCompare(b[0], "sv")).map(([k, v]) => ({ key: "t:" + k, name: k, items: v, type: true })); }
  else {
    const m = new Map(); l3mnAreas().forEach(a => m.set(a, [])); list.forEach(p => { const k = p.area || ""; (m.get(k) || m.set(k, []).get(k)).push(p); });
    groups = [...m].filter(([k, v]) => k !== "" && (v.length || !q)).map(([k, v]) => ({ key: "a:" + k, name: k, items: v, area: k }));
    const none = m.get("") || []; if (none.length) groups.push({ key: "a:", name: "Utan område", items: none, area: "", none: true });
  }
  return { groups, total: all.length, shown: list.length };
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
function l3mnSetArea(ids, area) {
  const list = placements.filter(p => ids.includes(p.id) && modIsType(p.type)); if (!list.length) return;
  area = String(area || "").trim();
  placeSnapshot(); list.forEach(p => { if (area) p.area = area; else delete p.area; placeTouch(p); });
  if (area) { const a = new Set(l3Prefs().moAreas || []); a.add(area); l3SetPref("moAreas", [...a]); }
  l3Changed(); l3mnRender(); l3Status(`${list.length} objekt ${area ? "flyttade till området " + area : "har tagits ur sina områden"}.`);
}
async function l3mnNewArea(ids) { const n = (await uiPrompt("Namn på området:", "") || "").trim(); if (!n) return null; if (ids && ids.length) l3mnSetArea(ids, n); else { const a = new Set(l3Prefs().moAreas || []); a.add(n); l3SetPref("moAreas", [...a]); l3mnRender(); } return n; }
async function l3mnRenameArea(a) {
  const n = (await uiPrompt("Nytt namn på området:", a) || "").trim(); if (!n || n === a) return;
  const ids = l3mnAll().filter(p => p.area === a).map(p => p.id); placeSnapshot(); placements.filter(p => ids.includes(p.id)).forEach(p => { p.area = n; placeTouch(p); });
  l3SetPref("moAreas", (l3Prefs().moAreas || []).map(x => x === a ? n : x).filter((x, i, s) => s.indexOf(x) === i)); l3Changed(); l3mnRender();
}
async function l3mnDeleteArea(a) {
  const ids = l3mnAll().filter(p => p.area === a).map(p => p.id);
  if (ids.length && !(await uiConfirm(`Ta bort området "${a}"? Dess ${ids.length} objekt behålls men hamnar under "Utan område".`, { ok: "Ta bort området" }))) return;
  if (ids.length) { placeSnapshot(); placements.filter(p => ids.includes(p.id)).forEach(p => { delete p.area; placeTouch(p); }); l3Changed(); }
  l3SetPref("moAreas", (l3Prefs().moAreas || []).filter(x => x !== a)); l3mnRender();
}
async function l3mnRenameObj(id) { const p = placements.find(x => x.id === id); if (!p) return; const n = (await uiPrompt("Namn på objektet:", p.name || "") || "").trim(); if (!n || n === p.name) return; placeSnapshot(); p.name = n; placeTouch(p); l3Changed(); l3mnRender(); }
function l3mnMoveMenu(ids, x, y) {
  const areas = l3mnAreas(), cur = new Set(placements.filter(p => ids.includes(p.id)).map(p => p.area || ""));
  const it = areas.map(a => ({ label: a, on: cur.size === 1 && cur.has(a), fn: () => l3mnSetArea(ids, a) }));
  if (it.length) it.push({ sep: true });
  it.push({ label: "Nytt område…", fn: () => l3mnNewArea(ids) });
  if ([...cur].some(Boolean)) it.push({ label: "Ta ur området", fn: () => l3mnSetArea(ids, "") });
  l3lfMenu(x, y, it);
}
function l3mnRowMenu(id, x, y) {
  const p = placements.find(q => q.id === id); if (!p) return; const ids = l3.sel.has(id) && l3.sel.size > 1 ? [...l3.sel].filter(i => l3mnAll().some(q => q.id === i)) : [id];
  l3lfMenu(x, y, [
    { label: ids.length > 1 ? `${ids.length} valda – flytta till område…` : "Flytta till område…", fn: () => l3mnMoveMenu(ids, x, y) },
    { label: "Byt namn…", fn: () => l3mnRenameObj(id) }, { sep: true },
    { label: "Visa bara denna", fn: () => { const all = l3mnAll().map(q => q.id); l3mnVis(all.filter(i => !ids.includes(i)), false, "visa bara valda ritade objekt"); l3mnVis(ids, true, "visa"); } },
    { label: "Släck", fn: () => l3mnVis(ids, false, "släck ritade objekt") }, { label: "Flyg dit", fn: () => { l3SelectIds(ids); l3ZoomSelected(); } },
  ]);
}
function l3mnRow(p, vis) {
  const esc = escHtml, hid = l3mnHid(p.id), on = l3.sel.has(p.id), act = l3mnActName(p), I = L3_ICO;
  return `<div class="v3-mo-r ${on ? "on" : ""} ${hid ? "off" : ""}" data-moid="${esc(p.id)}" title="Klick = markera · Ctrl/Skift = flera · dubbelklick = byt namn · dra till ett område · högerklick = meny">
    <button type="button" class="v3-mo-eye ${hid ? "" : "on"}" data-moeye="${esc(p.id)}" title="${hid ? "Tänd" : "Släck"}" aria-label="${hid ? "Tänd" : "Släck"} ${esc(p.name || "")}">${I.eye}</button>
    <i style="background:${esc(p.color || "#a8b3c4")}"></i><span class="v3-mo-n"><b>${esc(p.name || l3mnTypeLabel(p))}</b><em>${esc(l3mnTypeLabel(p))}${p.area && l3Prefs().moGroup === "type" ? " · " + esc(p.area) : ""}${act ? " · " + esc(act) : ""}</em></span>
    <button type="button" class="v3-mo-go" data-mogo="${esc(p.id)}" title="Flyg till objektet">${I.search || "⌖"}</button></div>`;
}
function l3mnRender() {
  const host = document.getElementById("v3Lib"); if (!host || typeof l3 === "undefined" || !l3 || !l3.renderer) return;
  let el = host.querySelector(":scope > #v3Mine");   // ligger överst i #v3Lib så att rubrikerna får exakt samma utseende som övriga mappar
  if (!el) { el = document.createElement("div"); el.id = "v3Mine"; host.prepend(el); }
  const { groups, total, shown } = l3mnGroups(), esc = escHtml, I = L3_ICO, shut = l3mnShut(), P = l3Prefs();
  if (!total && !(P.moAreas || []).length) { el.innerHTML = ""; el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  const all = l3mnAll(), anyOn = all.some(p => !l3mnHid(p.id)), secShut = shut.has("__sec"), q = l3mn.q;
  const selMine = [...l3.sel].filter(id => all.some(p => p.id === id));
  const gHtml = groups.map(g => {
    const open = !!q || !shut.has(g.key), vis = g.items.some(p => !l3mnHid(p.id));
    if (g.flat) return g.items.map(p => l3mnRow(p)).join("");
    return `<div class="v3-lf v3-mo-g ${g.area !== undefined ? "v3-mo-drop" : ""}" data-mog="${esc(g.key)}" ${g.area !== undefined ? `data-moarea="${esc(g.area)}"` : ""}>
      <button type="button" class="v3-pal-g" data-moshut="${esc(g.key)}" aria-expanded="${open}"><span>${esc(g.name)}</span><em>${g.items.length}</em></button>
      ${g.items.length ? `<button type="button" class="v3-lf-ic" data-mosel="${esc(g.key)}" title="Markera och flyg till alla i gruppen">${I.cursor || "▣"}</button>` : ""}
      ${g.area ? `<button type="button" class="v3-lf-ic" data-moren="${esc(g.area)}" title="Byt namn på området">${I.edit}</button><button type="button" class="v3-lf-ic" data-model="${esc(g.area)}" title="Ta bort området (objekten behålls)">${I.trash}</button>` : ""}
      <label class="v3-lay-sw v3-lf-sw" title="${vis ? "Släck" : "Tänd"} ${g.items.length} objekt"><input type="checkbox" role="switch" data-movis="${esc(g.key)}" ${vis || !g.items.length ? "checked" : ""} ${g.items.length ? "" : "disabled"} /><i></i></label></div>`
      + (open ? `<div class="v3-mo-items">${g.items.map(p => l3mnRow(p)).join("") || `<div class="v3-pal-hint">Tomt – dra objekt hit.</div>`}</div>` : "");
  }).join("");
  const opt = (v, cur, t) => `<option value="${v}" ${cur === v ? "selected" : ""}>${t}</option>`;
  el.innerHTML = `<div class="v3-mo-sec"><div class="v3-lf"><button type="button" class="v3-pal-g" id="v3MoHead" aria-expanded="${!secShut}"><span>Ritade objekt</span><em>${total}</em></button>
      <button type="button" class="v3-lf-ic v3-mo-plus" id="v3MoNew" title="Nytt område">＋</button>
      <label class="v3-lay-sw v3-lf-sw" title="${anyOn ? "Släck" : "Tänd"} alla ritade objekt"><input type="checkbox" role="switch" id="v3MoAllVis" ${anyOn || !total ? "checked" : ""} ${total ? "" : "disabled"} /><i></i></label></div>
    ${secShut ? "" : `<div class="v3-mo-tools"><input type="search" id="v3MoQ" placeholder="Sök ritade objekt…" value="${esc(q)}" />
      <select id="v3MoSort" title="Sortera">${opt("name", P.moSort || "name", "Namn")}${opt("type", P.moSort, "Typ")}${opt("new", P.moSort, "Nyast först")}${opt("old", P.moSort, "Äldst först")}${opt("act", P.moSort, "4D-aktivitet")}${opt("size", P.moSort, "Störst")}</select>
      <select id="v3MoGroup" title="Gruppera">${opt("area", P.moGroup || "area", "Områden")}${opt("type", P.moGroup, "Typ")}${opt("none", P.moGroup, "Ingen")}</select></div>
    ${selMine.length ? `<div class="v3-mo-bar"><b>${selMine.length} valda</b><button type="button" id="v3MoMove">Flytta till område ▾</button><button type="button" id="v3MoHide">Släck</button><button type="button" id="v3MoShow">Tänd</button></div>` : ""}
    <div class="v3-mo-list">${gHtml || `<div class="v3-pal-hint">${shown ? "" : "Inget matchar."}</div>`}</div>`}</div>`;
  l3mnBind(el, groups, selMine);
}
function l3mnBind(el, groups, selMine) {
  const $ = s => el.querySelector(s), P = l3Prefs();
  const setShut = (k, open) => { const s = l3mnShut(); if (open) s.delete(k); else s.add(k); l3SetPref("moShut", [...s]); l3mnRender(); };
  $("#v3MoHead").onclick = e => setShut("__sec", e.currentTarget.getAttribute("aria-expanded") !== "true");
  $("#v3MoNew").onclick = () => l3mnNewArea(selMine.length ? selMine : null);
  $("#v3MoAllVis").onchange = e => { const ids = l3mnAll().map(p => p.id); l3mnVis(ids, e.target.checked, `${e.target.checked ? "visa" : "dölj"} ritade objekt`); };
  const q = $("#v3MoQ"); if (!q) return;
  q.oninput = () => { l3mn.q = q.value; const pos = q.selectionStart; l3mnRender(); const n = document.getElementById("v3MoQ"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* ok */ } } };
  $("#v3MoSort").onchange = e => { l3SetPref("moSort", e.target.value); l3mnRender(); };
  $("#v3MoGroup").onchange = e => { l3SetPref("moGroup", e.target.value); l3mnRender(); };
  const mv = $("#v3MoMove"); if (mv) { mv.onclick = e => { const r = mv.getBoundingClientRect(); l3mnMoveMenu(selMine, r.left, r.bottom + 4); }; $("#v3MoHide").onclick = () => l3mnVis(selMine, false, "släck valda"); $("#v3MoShow").onclick = () => l3mnVis(selMine, true, "tänd valda"); }
  el.querySelectorAll("[data-moshut]").forEach(b => { b.onclick = () => setShut(b.dataset.moshut, b.getAttribute("aria-expanded") !== "true"); });
  el.querySelectorAll("[data-movis]").forEach(c => { c.onchange = () => { const g = groups.find(x => x.key === c.dataset.movis); if (g) l3mnVis(g.items.map(p => p.id), c.checked, `${c.checked ? "visa" : "dölj"} ${g.name || "ritade objekt"}`); }; });
  el.querySelectorAll("[data-mosel]").forEach(b => { b.onclick = () => { const g = groups.find(x => x.key === b.dataset.mosel); if (g) { l3SelectIds(g.items.map(p => p.id)); l3ZoomSelected(); } }; });
  el.querySelectorAll("[data-moren]").forEach(b => { b.onclick = () => l3mnRenameArea(b.dataset.moren); });
  el.querySelectorAll("[data-model]").forEach(b => { b.onclick = () => l3mnDeleteArea(b.dataset.model); });
  el.querySelectorAll("[data-moeye]").forEach(b => { b.onclick = e => { e.stopPropagation(); const id = b.dataset.moeye, sel = l3.sel.has(id) && l3.sel.size > 1 ? [...l3.sel].filter(i => l3mnAll().some(p => p.id === i)) : [id]; l3mnVis(sel, l3mnHid(id), "tänd/släck ritat objekt"); }; });
  el.querySelectorAll("[data-mogo]").forEach(b => { b.onclick = e => { e.stopPropagation(); l3SelectIds([b.dataset.mogo]); l3ZoomSelected(); }; });
  const order = groups.flatMap(g => g.items.map(p => p.id));
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
      return { items: ids, pal: el, color: p.color, title: p.name || l3mnTypeLabel(p), sub: "Släpp på ett område", src: ids.map(i => el.querySelector(`[data-moid="${CSS.escape(i)}"]`)), targets: [...tg, $("#v3MoNew")],
        name: t => (t.id === "v3MoNew" ? "Nytt område…" : t.dataset.moarea || "Utan område"),
        drop: async t => { if (t.id === "v3MoNew") { await l3mnNewArea(ids); return; } l3mnSetArea(ids, t.dataset.moarea || ""); } };
    });
  });
}
(() => {
  const now = () => { try { l3mnRender(); } catch (e) { console.warn("Ritade objekt", e); } };
  const later = () => { if (l3mn.raf) return; l3mn.raf = requestAnimationFrame(() => { l3mn.raf = 0; try { l3mnRender(); } catch (e) { console.warn("Ritade objekt", e); } }); };
  const wrap = n => { const f = window[n]; if (typeof f !== "function" || f.__mo) return; const w = function () { const r = f.apply(this, arguments); if (n === "l3RenderLib") now(); else later(); return r; }; w.__mo = true; window[n] = w; };
  const go = () => { ["l3RenderLib", "l3Changed", "l3SelectIds", "l3UpdateHidden", "l3ShowAll"].forEach(wrap); };   // senare skript definierar funktionerna – vänta tills allt är inläst
  if (document.readyState === "complete") go(); else window.addEventListener("load", go);
})();
