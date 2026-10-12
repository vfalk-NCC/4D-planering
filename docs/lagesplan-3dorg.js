/* 3D-vyn – Organizer-indelningen från Trimble Connect i fliken Grupper (Victor 2026-10-12: "I min 3d-editor vill
   jag ha in indelningen som jag har gjort i organizern i TC, lägg in det på 'Grupper'").

   – Hämtas via 4D-planering (tc-organizer.js) med ↻ i avsnittet; bara läsning, inget i Organizer ändras.
   – Samma träd som i Organizer: varje träd med sina grupper och undergrupper (fäll ut/ihop). En grupp omfattar
     också sina undergruppers objekt.
   – Tryck på en grupp: markera dess objekt i de inlästa modellerna (Skift lägger till). ⋯: Visa bara, Dölj, Zooma,
     Kopiera till en egen grupp (då går den att färga och skriva in som UDA).
   – Senaste hämtningen sparas i webbläsaren, så indelningen finns även utan kontakt med Trimble Connect
     (t.ex. på iPhone/iPad). */

const l3org = { data: null, loading: false, err: "", log: [], shut: new Set(), open: null, loaded: false };

/* Egna objekt i Organizer-grupperna (Victor 2026-10-12: "Jag ska kunna sortera in mina grejor i WBS -
   byggindelning mapparna också"). Sparas per projekt i projects/<id>/ifc_orgadds.json som
   { node, tree, name, guids, updated_by, updated_at } – projektgemensamt som de egna grupperna. Organizer i
   Trimble Connect ändras inte; tilläggen visas i samma träd och räknas med när gruppen markeras, släcks m.m. */
const l3oa = { list: [], loaded: false, loading: null };
const l3oaPath = () => `projects/${encodeURIComponent(projectId)}/ifc_orgadds.json`;
function l3oaLoad() {
  if (l3oa.loaded) return Promise.resolve(l3oa.list);
  if (!l3oa.loading) l3oa.loading = ghReadJSON(token, l3oaPath()).then(a => { l3oa.list = Array.isArray(a) ? a : []; }).catch(e => { console.warn("Kunde inte läsa ifc_orgadds.json", e); })
    .then(() => { l3oa.loaded = true; l3oa.loading = null; return l3oa.list; });
  return l3oa.loading;
}
async function l3oaWrite(mut, msg) {
  l3oa.list = mut(l3oa.list.slice());
  l3oaChanged();
  try {
    const next = await ghWriteJSON(token, l3oaPath(), arr => mut(Array.isArray(arr) ? arr : []), msg);
    if (Array.isArray(next)) l3oa.list = next;
    if (typeof l3SaveState === "function") l3SaveState("ok", "Organizer-tilläggen sparade");
  } catch (e) { l3Status("Kunde inte spara: " + e.message, true); }
  l3oaChanged();
}
function l3oaChanged() { if (typeof l3RenderSide === "function") l3RenderSide(); l3orgRender(); }
const l3oaOf = node => (l3oa.list.find(x => x.node === node) || {}).guids || [];
/* Alla Organizer-grupper som platt lista (för Lägg i grupp): [{ id, tree, name, path, depth }]. */
function l3orgFlat() {
  l3orgRestore();
  const out = [];
  if (!l3org.data) return out;
  l3org.data.trees.forEach(t => {
    const walk = (n, depth, path) => { const p = path ? `${path} / ${n.name}` : n.name; out.push({ id: n.id, tree: t, name: n.name, path: p, depth }); n.kids.forEach(k => walk(k, depth + 1, p)); };
    l3orgTree(t).forEach(n => walk(n, 0, ""));
  });
  return out;
}
async function l3oaAddSel(node) {
  const guids = typeof l3gSelGuids === "function" ? l3gSelGuids() : [];
  const f = l3orgFlat().find(x => x.id === node);
  if (!f || !guids.length) return;
  await l3oaLoad();
  const stamp = x => (typeof l3gStamp === "function" ? l3gStamp(x) : x);
  await l3oaWrite(arr => {
    const i = arr.findIndex(x => x.node === node);
    if (i < 0) return [...arr, stamp({ node, tree: f.tree.id, name: f.path, guids })];
    const c = arr.slice(); c[i] = stamp({ ...c[i], name: f.path, guids: [...new Set([...(c[i].guids || []), ...guids])] }); return c;
  }, `3D: ${guids.length} objekt till ${f.path} (Organizer)`);
  l3Status(`${guids.length} objekt lades i ${f.path}.`);
}
async function l3oaRemoveSel(node) {
  const rm = new Set(typeof l3gSelGuids === "function" ? l3gSelGuids() : []), a = l3oa.list.find(x => x.node === node);
  if (!a || !rm.size) return;
  await l3oaWrite(arr => arr.map(x => x.node === node ? (typeof l3gStamp === "function" ? l3gStamp({ ...x, guids: (x.guids || []).filter(v => !rm.has(v)) }) : x) : x).filter(x => (x.guids || []).length), `3D: objekt ur ${a.name} (Organizer)`);
  l3Status(`De markerade togs ur ${a.name}. (Objekt som ligger där i Organizer i Trimble Connect ändras inte härifrån.)`);
}
const l3orgKey = () => `lagesplan-org-${projectId}`;

function l3orgRestore() {
  if (l3org.loaded) return;
  l3org.loaded = true;
  try { const d = JSON.parse(localStorage.getItem(l3orgKey()) || "null"); if (d && Array.isArray(d.trees)) l3org.data = d; } catch (e) { /* ingen sparad */ }
}
async function l3orgFetch() {
  if (l3org.loading) return;
  if (typeof bridgeOk === "function" && !bridgeOk()) { l3org.err = "Organizer hämtas via 4D-planering i Trimble Connect – öppna 3D-vyn med 🗺️ där (på datorn). Senast hämtade indelning visas här ändå."; l3orgRender(); return; }
  l3org.loading = true; l3org.err = ""; l3org.log = []; l3orgRender();
  try {
    const r = await askOpener("tcOrganizer", {}, 180000);
    if (!r || r.failed) { l3org.err = (r && r.failed) || "Inget svar från Organizer."; l3org.log = (r && r.log) || []; }
    else {
      l3org.data = { trees: r.trees || [], at: r.at || new Date().toISOString() }; l3org.log = r.log || [];
      try { localStorage.setItem(l3orgKey(), JSON.stringify(l3org.data)); } catch (e) { /* för stor för webbläsarens minne – visas ändå nu */ }
      const n = l3org.data.trees.reduce((s, t) => s + t.groups.length, 0);
      l3Status(`Organizer: ${l3org.data.trees.length} ${l3org.data.trees.length === 1 ? "träd" : "träd"} med ${n} grupper hämtade från Trimble Connect.`);
    }
  } catch (e) { l3org.err = e.message; }
  l3org.loading = false;
  l3orgRender();
}

/* Organizer skickar namnen URL-kodade ("742%20-%20Bj%C3%A4lklag", Victor 2026-10-12: "Det blev lite tokigt med
   vissa tecken och bokstäver") – avkodas per nivå (ett kodat "/" i ett namn delar då inte upp det). */
function l3orgDec(s) {
  s = String(s == null ? "" : s);
  if (!/%[0-9A-Fa-f]{2}/.test(s)) return s;
  try { return decodeURIComponent(s); } catch (e) { return s.replace(/%20/g, " "); }
}
/* Trädet: noder med parentId, annars namnet som sökväg ("Etapp 1/Fundament"). */
function l3orgTree(t) {
  const byId = new Map(), roots = [];
  const mk = (id, name, own) => ({ id, name: l3orgDec(name), own: own || [], kids: [] });
  const usePid = t.groups.some(g => g.parentId);
  if (usePid) {
    t.groups.forEach(g => byId.set(g.id, mk(g.id, g.name.split("/").pop() || g.name, g.guids)));
    t.groups.forEach(g => { const n = byId.get(g.id), p = g.parentId && byId.get(g.parentId); (p ? p.kids : roots).push(n); });
  } else {
    const byPath = new Map();
    const at = path => {
      if (byPath.has(path)) return byPath.get(path);
      const parts = path.split("/"), name = parts.pop(), n = mk(`${t.id}:${path}`, name);
      byPath.set(path, n);
      (parts.length ? at(parts.join("/")).kids : roots).push(n);
      return n;
    };
    t.groups.forEach(g => { const path = String(g.name || "").split("/").map(s => s.trim()).filter(Boolean).join("/") || g.id; const n = at(path); n.id = g.id; n.own = n.own.concat(g.guids || []); });
  }
  // Egna tillägg (l3oa) räknas in i sina grupper.
  const addTo = n => { const a = l3oaOf(n.id); if (a.length) { n.added = a; n.own = n.own.concat(a); } n.kids.forEach(addTo); };
  roots.forEach(addTo);
  const sortRec = list => { list.sort((a, b) => a.name.localeCompare(b.name, "sv", { numeric: true })); list.forEach(n => sortRec(n.kids)); };
  sortRec(roots);
  return roots;
}
const l3orgAll = n => { const s = new Set(n.own); n.kids.forEach(k => l3orgAll(k).forEach(g => s.add(g))); return s; };
function l3orgFind(id) {
  if (!l3org.data) return null;
  for (const t of l3org.data.trees) { const st = [...l3orgTree(t)]; while (st.length) { const n = st.pop(); if (n.id === id) return n; st.push(...n.kids); } }
  return null;
}
function l3orgEnts(guids) {
  const ents = [];
  l3b.models.forEach(m => { const map = l3pEnts(m); guids.forEach(x => (map.get(x) || []).forEach(e => ents.push(e))); });
  return ents;
}
function l3orgSelect(id, additive) {
  const n = l3orgFind(id); if (!n) return;
  const g = l3orgAll(n), ents = l3orgEnts(g);
  l3bsSet(additive ? [...l3bs.sel.map(e => ({ mesh: e.mesh, ri: e.ri })), ...ents] : ents);
  l3Status(!g.size ? `${n.name}: gruppen har inga objekt (eller så kunde länkarna inte tolkas).` : ents.length >= g.size ? `${n.name}: ${ents.length} objekt markerade.` : `${n.name}: ${ents.length} av ${g.size} objekt markerade (resten finns i modeller som inte är inlästa).`);
}
function l3orgHide(id) {
  const n = l3orgFind(id); if (!n) return;
  l3VisRecord(`dölj ${n.name}`, () => {
    const meshes = new Set();
    l3orgEnts(l3orgAll(n)).forEach(e => { e.mesh.userData.l3b.hidden.add(e.ri); meshes.add(e.mesh); });
    meshes.forEach(m => l3bApplyHidden(m));
    l3bsSet(l3bs.sel.filter(e => !e.mesh.userData.l3b.hidden.has(e.ri)).map(e => ({ mesh: e.mesh, ri: e.ri })));
    l3UpdateHidden();
  });
  l3Status(`${n.name} är dold – Ctrl+Z eller Visa alla (U) visar den igen.`);
}
/* Kopiera till en egen 4D-grupp (färg, UDA-export, mappar). */
async function l3orgCopy(id) {
  const n = l3orgFind(id); if (!n) return;
  const guids = [...l3orgAll(n)];
  if (!guids.length) { l3Status(`${n.name} har inga objekt att kopiera.`, true); return; }
  await l3gLoad();
  const g = { id: ghNewId(), name: n.name, color: L3G_COLORS[l3g.list.length % L3G_COLORS.length], guids, from: "organizer" };
  await l3gWrite(arr => [...arr, typeof l3gStamp === "function" ? l3gStamp(g) : g], `3D: grupp ${n.name} från Organizer`);
  l3Status(`${n.name} kopierad till en egen grupp (${guids.length} objekt) – den går att färga och skriva in som UDA.`);
}

/* ---- I fliken Grupper -------------------------------------------------------------------------------- */
function l3orgHtml() {
  l3orgRestore();
  if (!l3oa.loaded) l3oaLoad().then(() => { if (l3oa.list.length) l3orgRender(); });
  const esc = escHtml, I = L3_ICO, d = l3org.data;
  // Antal i scenen och om alla deras objekt är dolda (ögat).
  const here = guids => { let k = 0, hid = true; l3b.models.forEach(m => { const map = l3pEnts(m); guids.forEach(x => { const es = map.get(x); if (es) { k++; if (hid && !es.every(e => e.mesh.userData.l3b.hidden.has(e.ri))) hid = false; } }); }); return [k, k > 0 && hid]; };
  const rowOf = (n, depth) => {
    const all = l3orgAll(n), [hk, hid] = here(all), shut = !l3org.shut.has("o:" + n.id) && n.kids.length ? true : false, open = l3org.open === n.id;
    const fold = n.kids.length ? `<button type="button" class="v3-org-f" data-orgfold="${esc(n.id)}" aria-expanded="${!shut}"><i>›</i></button>` : `<span class="v3-org-f"></span>`;
    return `<div class="v3-gr v3-org ${open ? "open" : ""}" style="margin-left:${depth * 12}px"><div class="v3-gr-h">${fold}
        <button type="button" class="v3-gr-n" data-orgsel="${esc(n.id)}" title="Markera gruppens objekt (Skift lägger till)">${esc(n.name)}</button>
        ${n.added ? `<span class="v3-gr-mine" title="${n.added.length} objekt som du har lagt i gruppen här (finns inte i Organizer i Trimble Connect)">+${n.added.length}</span>` : ""}
        <em title="${hk} av ${all.size} finns i de inlästa modellerna">${!all.size ? "0" : hk === all.size ? all.size : `${hk}/${all.size}`}</em>
        <button type="button" class="v3-ic v3-gr-eye ${hid ? "off" : ""}" data-orgeye="${esc(n.id)}" ${hk ? "" : "disabled"} title="${!hk ? "Inga objekt i de inlästa modellerna" : hid ? "Tänd gruppen" : "Släck gruppen"}">${hid ? I.eyeOff : I.eye}</button>
        <button type="button" class="v3-ic" data-orgmore="${esc(n.id)}" title="Fler val" aria-expanded="${open}">⋯</button></div>
        ${open ? `<div class="v3-gr-acts"><button type="button" data-orgiso="${esc(n.id)}">${I.isolate} Visa bara</button><button type="button" data-orghide="${esc(n.id)}">${I.eyeOff} Dölj</button><button type="button" data-orgzoom="${esc(n.id)}">${I.focus} Zooma</button><button type="button" data-orgcopy="${esc(n.id)}" title="Som egen grupp: kan färgas och skrivas in som UDA i IFC">＋ Kopiera till egen grupp</button></div>` : ""}
      </div>` + (shut ? "" : n.kids.map(k => rowOf(k, depth + 1)).join(""));
  };
  let body = "";
  if (d && d.trees.length) body = d.trees.map(t => {
    const k = "t:" + t.id, shut = l3org.shut.has(k), roots = l3orgTree(t);
    return `<div class="v3-gf ${shut ? "shut" : ""}"><button type="button" class="v3-gf-t" data-orgtree="${esc(t.id)}" aria-expanded="${!shut}"><i>›</i><b>${esc(l3orgDec(t.name))}</b><em>${t.groups.length} grupper</em></button></div>${shut ? "" : `<div class="v3-gf-b">${roots.map(n => rowOf(n, 0)).join("") || `<div class="v3-pal-hint">Inga grupper i trädet.</div>`}</div>`}`;
  }).join("");
  else if (d) body = `<div class="v3-pal-hint">Organizer har inga träd i det här projektet.</div>`;
  else if (!l3org.loading && !l3org.err) body = `<div class="v3-pal-hint">Tryck ↻ för att hämta indelningen du gjort i Organizer i Trimble Connect.</div>`;
  const err = l3org.err ? `<div class="v3-pal-hint bad">${esc(l3org.err)}</div>${l3org.log.length ? `<details class="v3-org-log"><summary>Vad som provades</summary><ul>${l3org.log.map(x => `<li>${esc(x)}</li>`).join("")}</ul></details>` : ""}` : "";
  const warn = !l3org.err && l3org.log.some(x => /kunde inte tolkas/.test(x)) ? `<details class="v3-org-log"><summary>Alla länkar kunde inte kopplas till objekt</summary><ul>${l3org.log.map(x => `<li>${esc(x)}</li>`).join("")}</ul></details>` : "";
  return `<section class="v3-org-sec"><div class="v3-org-h"><b>Organizer i Trimble Connect</b>${d ? `<em title="Senast hämtad">${esc(String(d.at || "").slice(0, 16).replace("T", " "))}</em>` : ""}<button type="button" class="v3-ic" id="v3OrgGet" title="Hämta Organizer från Trimble Connect">${l3org.loading ? '<span class="pm-spin"></span>' : "↻"}</button></div>${err}${warn}${body}</section>`;
}
function l3orgBind(host) {
  const gb = host.querySelector("#v3OrgGet"); if (gb) gb.onclick = () => l3orgFetch();
  host.querySelectorAll("[data-orgtree]").forEach(b => { b.onclick = () => { const k = "t:" + b.dataset.orgtree; l3org.shut.has(k) ? l3org.shut.delete(k) : l3org.shut.add(k); l3orgRender(); }; });
  host.querySelectorAll("[data-orgfold]").forEach(b => { b.onclick = () => { const k = "o:" + b.dataset.orgfold; l3org.shut.has(k) ? l3org.shut.delete(k) : l3org.shut.add(k); l3orgRender(); }; });
  host.querySelectorAll("[data-orgsel]").forEach(b => { b.onclick = e => l3orgSelect(b.dataset.orgsel, e.shiftKey || e.ctrlKey || e.metaKey); });
  host.querySelectorAll("[data-orgmore]").forEach(b => { b.onclick = () => { l3org.open = l3org.open === b.dataset.orgmore ? null : b.dataset.orgmore; l3orgRender(); }; });
  host.querySelectorAll("[data-orgiso]").forEach(b => { b.onclick = () => { l3orgSelect(b.dataset.orgiso); if (l3bs.sel.length) l3bsIsolate(); }; });
  host.querySelectorAll("[data-orghide]").forEach(b => { b.onclick = () => l3orgHide(b.dataset.orghide); });
  host.querySelectorAll("[data-orgeye]").forEach(b => { b.onclick = () => { const n = l3orgFind(b.dataset.orgeye); if (!n) return; const ents = l3orgEnts(l3orgAll(n)); if (!ents.length) { l3Status(`${n.name} har inga objekt i de inlästa modellerna.`); return; } l3gVisEnts(ents, n.name, l3gEntsHidden(ents)); }; });
  host.querySelectorAll("[data-orgzoom]").forEach(b => { b.onclick = () => { l3orgSelect(b.dataset.orgzoom); if (l3bs.sel.length) l3bsZoom(); }; });
  host.querySelectorAll("[data-orgcopy]").forEach(b => { b.onclick = () => l3orgCopy(b.dataset.orgcopy); });
}
function l3orgRender() { if (typeof l3gRenderTab === "function") l3gRenderTab(); }
