/* 3D-vyn – Montageordning direkt i editorn (Victor 2026-10-22: "lägg till montageordningsverktyget direkt i 3d-editorn … så jag slipper vara inne i TC först … och göra en export direkt").
   Samma sekvenser som i 4D-dashboarden: de läses och sparas i 4D-data (plan_assembly_sequences) så att båda ser samma. Ett steg är antingen kopplat till en aktivitet i
   tidplanen eller ett fritt steg (eget namn, start, längd, beroenden, objekt som markerats i 3D). Objekten hittas på IFC-id i de inlästa modellerna.
   Uppspelning färgar klara, aktuella och kommande steg i modellen; Exportera skapar en fristående HTML (samma som dashboardens montageordning, med riktig geometri och
   en bild per steg) direkt härifrån – utan Trimble Connect. */

const L3MT_TABLE = "plan_assembly_sequences";
const L3MT_COL = { done: ["#969eaa", 0.59], cur: ["#f59e0b", 1], fut: ["#93c5fd", 0.16] };
const l3mt = { seqs: [], cur: null, loaded: false, loading: false, dirty: false, dock: false, i: 0, sel: 0, play: false, timer: null, snap: null, msg: "", follow: true, busy: false };
const l3mtPath = () => `projects/${encodeURIComponent(projectId)}/${L3MT_TABLE}.json`;
const l3mtId = () => (typeof ghNewId === "function" ? ghNewId() : "m" + Math.random().toString(36).slice(2, 10));
const l3mtToday = () => new Date().toISOString().slice(0, 10);
const l3mtAdd = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const l3mtDiff = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5);
const l3mtSd = d => (d ? new Date(d + "T00:00:00Z").toLocaleDateString("sv-SE", { timeZone: "UTC", day: "numeric", month: "short" }) : "");
const l3mtE = s => (typeof escHtml === "function" ? escHtml(s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
const l3mtNewStep = (name, o = {}) => ({ id: l3mtId(), kind: "free", name, note: "", start: "", dur: 1, deps: [], objs: [], cam: null, pS: "", pE: "", hours: "", qty: "", unit: "", depLags: {}, ...o });

/* ---- Lagring ----------------------------------------------------------------------------------------------------------------------------- */
async function l3mtLoad(force) {
  if (l3mt.loading || (l3mt.loaded && !force)) return; l3mt.loading = true;
  try { const a = await ghReadJSON(token, l3mtPath()); l3mt.seqs = (Array.isArray(a) ? a : []).filter(x => x && x.id && Array.isArray(x.steps) && x.type !== "compose"); l3mt.msg = ""; }
  catch (e) { console.warn("Montageordning: kunde inte läsa", e); l3mt.seqs = []; l3mt.msg = "Kunde inte läsa sparade sekvenser: " + ((e && e.message) || e); }
  l3mt.loaded = true; l3mt.loading = false; l3mtRender();
}
async function l3mtSave(asNew) {
  const s = l3mt.cur; if (!s) return;
  if (asNew) { const n = await uiPrompt("Namn på den nya sekvensen", s.name + " (kopia)"); if (!n) return; s.id = l3mtId(); s.name = n; s.created_at = new Date().toISOString(); }
  s.updated_at = new Date().toISOString(); const copy = JSON.parse(JSON.stringify(s));
  try {
    await ghWriteJSON(token, l3mtPath(), arr => { const a = (Array.isArray(arr) ? arr : []).filter(x => x.id !== copy.id); a.push(copy); return a; }, `Montageordning: ${copy.name}`);
    l3mt.seqs = l3mt.seqs.filter(x => x.id !== copy.id).concat([copy]); l3mt.dirty = false; l3mt.msg = "Sparad " + new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
  } catch (e) { console.warn(e); l3mt.msg = "Kunde inte spara: " + ((e && e.message) || e); }
  l3mtRender();
}
async function l3mtDelete() {
  const s = l3mt.cur; if (!s || !(await uiConfirm(`Ta bort sekvensen "${s.name}"?\n\nDen försvinner för alla som använder projektet.`))) return;
  try { await ghWriteJSON(token, l3mtPath(), arr => (Array.isArray(arr) ? arr : []).filter(x => x.id !== s.id), `Ta bort montageordning: ${s.name}`); l3mt.seqs = l3mt.seqs.filter(x => x.id !== s.id); await l3mtOpen(null, true); }
  catch (e) { await uiAlert("Kunde inte ta bort: " + ((e && e.message) || e)); }
}
async function l3mtOpen(id, force) {
  if (!force && l3mt.dirty && !(await uiConfirm("Du har osparade ändringar.\n\nLämna sekvensen utan att spara?"))) { l3mtRender(); return; }
  l3mtPlay(false); l3mtRestore(); l3mt.cur = id ? JSON.parse(JSON.stringify(l3mt.seqs.find(x => x.id === id) || null)) : null; l3mt.dirty = false; l3mt.i = 0; l3mt.sel = 0;
  if (l3mt.cur) l3mtApply(); l3mtRender();
}
async function l3mtNew() {
  const n = await uiPrompt("Namn på montageordningen", "Montageordning " + l3mtToday()); if (!n || !String(n).trim()) return;
  const t = new Date().toISOString(); l3mt.cur = { id: l3mtId(), name: String(n).trim(), area: "", desc: "", start: l3mtToday(), steps: [], created_at: t, updated_at: t }; l3mt.dirty = true; l3mt.i = 0; l3mt.sel = 0; l3mtRender();
}

/* ---- Beräkning: effektiva datum per steg (samma regler som dashboarden för fria steg) ------------------------------------------------------- */
function l3mtActLookup() {
  const m = new Map(); try { if (typeof l3plActs === "function" && l3pl && l3pl.rows) l3plActs(false).forEach(a => { m.set(a.key, a); m.set(a.key.replace(/^[gsi]:/, ""), a); a.rows.forEach(r => m.set(String(r.id), a)); }); } catch (e) { /* utan tidplan */ }
  return m;
}
function l3mtViews(seq) {
  const am = l3mtActLookup(), steps = seq.steps;
  const v = steps.map((st, i) => { const a = st.kind === "act" ? am.get(String(st.key)) : null; return { st, i, act: a || null, missing: st.kind === "act" && !a, ppS: a ? a.start : "", ppE: a ? a.end : "", s: "", e: "" }; });
  const view = new Map(v.map(x => [x.st.id, x]));
  const base = x => { const st = x.st; if (x.act) { const d = l3mtDiff(x.ppS, x.ppE), s = st.pS || x.ppS, e = st.pE || (st.pS ? l3mtAdd(st.pS, d) : x.ppE); return [s, e < s ? s : e]; } if (st.kind === "act") { const s = st.pS || seq.start || l3mtToday(), e = st.pE || s; return [s, e < s ? s : e]; } const s = st.start || seq.start || l3mtToday(); return [s, l3mtAdd(s, Math.max(1, Number(st.dur) || 1) - 1)]; };
  v.forEach(x => { [x.s, x.e] = base(x); });
  const lagOf = (st, d) => Number((st.depLags || {})[d]) || 0;
  for (let pass = 0; pass < 60; pass++) {
    let ch = false;
    v.forEach(x => {
      if (!x.st.deps || !x.st.deps.length) return; let need = null;
      x.st.deps.forEach(d => { const p = view.get(d); if (p && p.e) { const n = l3mtAdd(p.e, 1 + lagOf(x.st, d)); if (need === null || n > need) need = n; } });
      if (need === null) return;
      if (x.act || x.st.kind === "act") { if (need > x.s) { const dur = l3mtDiff(x.s, x.e); x.s = need; x.e = l3mtAdd(need, dur); ch = true; } return; }
      const floor = x.st.start || seq.start || l3mtToday(), s2 = need > floor ? need : floor;
      if (s2 !== x.s) { x.s = s2; x.e = l3mtAdd(s2, Math.max(1, Number(x.st.dur) || 1) - 1); ch = true; }
    });
    if (!ch) break;
  }
  v.forEach(x => { x.hours = x.st.hours !== "" && x.st.hours != null ? Number(x.st.hours) : 0; x.qty = x.st.qty !== "" && x.st.qty != null ? Number(x.st.qty) : 0; });
  return v;
}

/* ---- Objekt i 3D --------------------------------------------------------------------------------------------------------------------------- */
function l3mtSelTargets() {
  const seen = new Set(), out = [];
  l3bs.sel.forEach(e => { const u = e.mesh.userData.l3b, g = u.ranges[e.ri] && u.ranges[e.ri].guid; if (!g || seen.has((u.model && u.model.id) + "|" + g)) return; seen.add((u.model && u.model.id) + "|" + g); out.push({ modelId: String((u.model && u.model.id) || ""), modelName: (u.model && u.model.name) || "", objectId: String(g) }); });
  return out;
}
/* Stegets objekt: tidplanens (om kopplat) plus de egna. */
function l3mtTargets(x) {
  const t = []; if (x.act) x.act.rows.forEach(r => { if (r.object_id) t.push({ modelId: "", modelName: "", objectId: String(r.object_id) }); });
  (x.st.objs || []).forEach(o => t.push({ modelId: String(o.modelId || ""), modelName: o.modelName || "", objectId: String(o.objectId) }));
  return t;
}
/* Träffar i de inlästa modellerna: id/namn först, annars alla modeller som har id:t. */
function l3mtEntsOf(targets) {
  const out = [], models = (typeof l3b !== "undefined" && l3b.models) || [];
  targets.forEach(t => {
    let c = t.modelId ? models.filter(m => String(m.id) === t.modelId) : []; if (!c.length && t.modelName) c = models.filter(m => m.name && m.name === t.modelName);
    const pick = (list) => { for (const m of list) { const map = typeof l3pEnts === "function" ? l3pEnts(m) : new Map(), e = map.get(t.objectId); if (e && e.length) { e.forEach(x => { if (!x.mesh.userData.bcopy) out.push({ ...x, model: m, guid: t.objectId }); }); return true; } } return false; };
    if (!pick(c)) pick(models);
  });
  return out;
}
function l3mtBox(ents) {
  const b = new THREE.Box3(), v = new THREE.Vector3();
  ents.forEach(e => { const p = e.mesh.geometry.getAttribute("position").array, r = e.mesh.userData.l3b.ranges[e.ri]; e.mesh.updateMatrixWorld(true); for (let i = r.start; i < r.start + r.count; i += 2) b.expandByPoint(v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]).applyMatrix4(e.mesh.matrixWorld)); });
  return b;
}

/* ---- Visning: klara, aktuellt och kommande steg färgas i modellen ----------------------------------------------------------------------- */
function l3mtApply(opts = {}) {
  const s = l3mt.cur; if (!s || typeof l3b === "undefined" || !l3b.models.length) return;
  const views = l3mtViews(s), i = Math.min(l3mt.i, Math.max(0, views.length - 1)), per = views.map(x => l3mtEntsOf(l3mtTargets(x)));
  const all = [], seen = new Set(); per.forEach(l => l.forEach(e => { const k = l3bsKey(e.mesh, e.ri); if (!seen.has(k)) { seen.add(k); all.push(e); } }));
  if (!l3mt.snap) l3mt.snap = l3tSnap(all); else { const have = new Set(l3mt.snap.map(x => l3bsKey(x.mesh, x.ri))); const extra = all.filter(e => !have.has(l3bsKey(e.mesh, e.ri))); if (extra.length) l3mt.snap.push(...l3tSnap(extra)); }
  const meshes = new Set(), col = k => { const c = new THREE.Color(L3MT_COL[k][0]); return [[c.r, c.g, c.b], L3MT_COL[k][1]]; };
  const set = (ents, k) => { const [rgb, a] = col(k); ents.forEach(e => { const u = e.mesh.userData.l3b; if (!u.tint) u.tint = new Map(); if (!u.alpha) u.alpha = new Map(); u.tint.set(e.ri, rgb); if (a < 0.999) u.alpha.set(e.ri, a); else u.alpha.delete(e.ri); meshes.add(e.mesh); }); };
  per.forEach((l, j) => set(l, j < i ? "done" : j === i ? "cur" : "fut"));
  l3tRefresh(meshes, true);
  if (l3mt.follow && !opts.noCam && per[i] && per[i].length) { const b = l3mtBox(per[i]); if (!b.isEmpty()) { const d = Math.max(6, b.getSize(new THREE.Vector3()).length() * 1.7); if (opts.instant) l3FlyTo(b.getCenter(new THREE.Vector3()), d, null, 0); else l3FlyTo(b.getCenter(new THREE.Vector3()), d, null, 600); } }
}
function l3mtRestore() { if (l3mt.snap) { try { l3tRestore(l3mt.snap); } catch (e) { /* */ } l3mt.snap = null; } }
function l3mtGo(i) { const s = l3mt.cur; if (!s || !s.steps.length) return; l3mt.i = Math.max(0, Math.min(s.steps.length - 1, i)); l3mt.sel = l3mt.i; l3mtApply(); l3mtRender(true); }
function l3mtPlay(on) { l3mt.play = on; clearInterval(l3mt.timer); l3mt.timer = null; if (on && l3mt.cur) { if (l3mt.i >= l3mt.cur.steps.length - 1) l3mt.i = 0; l3mt.timer = setInterval(() => { if (!l3mt.cur || l3mt.i >= l3mt.cur.steps.length - 1) { l3mtPlay(false); l3mtRender(true); return; } l3mtGo(l3mt.i + 1); }, 1500); l3mtGo(l3mt.i); } l3mtRender(true); }

/* ---- Panelen ------------------------------------------------------------------------------------------------------------------------------- */
function l3mtToggle(on = !l3mt.dock) {
  l3mt.dock = on; const host = document.getElementById("v3Canvas"); let d = document.getElementById("v3MontDock");
  if (!on) { l3mtPlay(false); l3mtRestore(); if (d) d.remove(); return; }
  if (!host) return;
  if (!d) { d = document.createElement("div"); d.id = "v3MontDock"; d.className = "v3-mtdock"; host.appendChild(d); ["pointerdown", "wheel", "contextmenu", "dblclick", "click", "keydown", "keyup"].forEach(t => d.addEventListener(t, e => e.stopPropagation())); d.addEventListener("click", l3mtClick); d.addEventListener("change", l3mtChange); d.addEventListener("input", l3mtInput); }
  if (!l3mt.loaded) l3mtLoad(); l3mtRender();
}
function l3mtRender(soft) {
  const d = document.getElementById("v3MontDock"); if (!d) return; const E = l3mtE, s = l3mt.cur;
  if (soft && !s) return;
  const views = s ? l3mtViews(s) : [], cur = views[l3mt.i], selv = views[l3mt.sel];
  const hasModels = typeof l3b !== "undefined" && l3b.models.length;
  const bar = `<div class="v3-mt-bar"><b>Montageordning</b><select id="mtSel" aria-label="Sekvens"><option value="">${l3mt.loading ? "Läser …" : "Välj sekvens …"}</option>${l3mt.seqs.map(x => `<option value="${E(x.id)}"${s && s.id === x.id ? " selected" : ""}>${E(x.name)}</option>`).join("")}${s && !l3mt.seqs.some(x => x.id === s.id) ? `<option value="${E(s.id)}" selected>${E(s.name)} (ny)</option>` : ""}</select>
    <button type="button" data-mt="new">＋ Ny</button>${s ? `<button type="button" data-mt="save" class="${l3mt.dirty ? "on" : ""}">${l3mt.dirty ? "● Spara" : "Spara"}</button><button type="button" data-mt="copy">Spara som …</button><button type="button" data-mt="del">Ta bort</button>` : ""}
    ${s ? `<button type="button" data-mt="exp" class="pri" title="Skapar en fristående HTML med 3D-modell, bild per steg och objektlista – direkt härifrån">Exportera HTML …</button>` : ""}<span class="v3-mt-msg">${E(l3mt.msg || "")}</span><span class="sp"></span><button type="button" data-mt="close" class="v3-ic" title="Stäng">✕</button></div>`;
  if (!s) { d.innerHTML = bar + `<div class="v3-mt-empty">${hasModels ? "Välj en sparad sekvens eller skapa en ny. Markera objekt i 3D och tryck <b>＋ Steg från markering</b> för att bygga ordningen. Sekvenserna delas med 4D-dashboarden." : "Läs in byggnadens IFC-modell först (Lager → 3D-modeller)."}</div>`; return; }
  const play = `<div class="v3-mt-play"><button type="button" data-mt="first" title="Första steget">⏮</button><button type="button" data-mt="prev" title="Föregående (←)">◀</button><button type="button" data-mt="play" class="${l3mt.play ? "on" : ""}">${l3mt.play ? "❚❚ Paus" : "▶ Spela"}</button><button type="button" data-mt="next" title="Nästa (→)">▶</button><button type="button" data-mt="last" title="Sista steget">⏭</button>
    <input type="range" id="mtSlider" min="0" max="${Math.max(0, views.length - 1)}" value="${l3mt.i}"${views.length ? "" : " disabled"}><span class="v3-mt-cur">${cur ? `Steg ${l3mt.i + 1} av ${views.length} · <b>${E(cur.st.name)}</b> · ${l3mtSd(cur.s)} – ${l3mtSd(cur.e)}` : "Inga steg än"}</span>
    <label class="v3-chk"><input type="checkbox" id="mtFollow"${l3mt.follow ? " checked" : ""}> Följ kamera</label></div>`;
  const list = views.map((x, i) => { const n = l3mtEntsOf(l3mtTargets(x)).length, tot = l3mtTargets(x).length; return `<div class="v3-mt-row${i === l3mt.sel ? " on" : ""}${i === l3mt.i ? " cur" : ""}" data-mtrow="${i}"><span class="n">${i + 1}</span><span class="t"><b>${E(x.st.name)}</b><small>${l3mtSd(x.s)} – ${l3mtSd(x.e)}${x.st.kind === "act" ? (x.missing ? " · aktiviteten finns inte längre" : " · tidplan") : ""}${x.st.temp ? " · temporär" : ""}</small></span><span class="o${tot && n < tot ? " warn" : ""}" title="${n} av ${tot} objekt finns i de inlästa modellerna">${n}${tot && n < tot ? "/" + tot : ""} obj</span></div>`; }).join("");
  let ed = `<div class="v3-mt-empty">Markera objekt i 3D och tryck ＋ Steg från markering.</div>`;
  if (selv) {
    const st = selv.st, isAct = st.kind === "act", tg = l3mtTargets(selv).length, others = views.filter((_, k) => k !== l3mt.sel);
    ed = `<div class="v3-mt-ed"><label>Namn<input data-f="name" value="${E(st.name)}"></label>
      ${isAct ? `<div class="v3-mt-hint">Kopplat till aktiviteten i tidplanen (${l3mtSd(selv.ppS) || "?"} – ${l3mtSd(selv.ppE) || "?"}). Eget förslag på datum:</div><div class="v3-mt-two"><label>Start<input type="date" data-f="pS" value="${E(st.pS || "")}"></label><label>Slut<input type="date" data-f="pE" value="${E(st.pE || "")}"></label></div>`
      : `<div class="v3-mt-two"><label>Start<input type="date" data-f="start" value="${E(st.start || "")}" title="Tomt = sekvensens start eller efter föregående"></label><label>Längd (dagar)<input type="number" min="1" data-f="dur" value="${E(st.dur || 1)}"></label></div>`}
      <label>Väntar på<span class="v3-mt-deps">${others.length ? others.map(o => `<label class="v3-chk"><input type="checkbox" data-dep="${E(o.st.id)}"${(st.deps || []).includes(o.st.id) ? " checked" : ""}> ${o.i + 1}. ${E(o.st.name).slice(0, 28)}</label>`).join("") : "<em>inga andra steg</em>"}</span></label>
      <label>Anteckning<textarea data-f="note" rows="2">${E(st.note || "")}</textarea></label>
      <div class="v3-mt-objs"><b>${tg}</b> objekt <button type="button" data-mt="setobj" title="Byt stegets objekt mot markeringen i 3D">Sätt från markering</button><button type="button" data-mt="addobj" title="Lägg markeringen till stegets objekt">Lägg till</button><button type="button" data-mt="showobj">Markera i 3D</button>${(st.objs || []).length ? `<button type="button" data-mt="clrobj">Rensa egna</button>` : ""}</div>
      <div class="v3-mt-acts"><button type="button" data-mt="up" ${l3mt.sel ? "" : "disabled"}>↑ Upp</button><button type="button" data-mt="down" ${l3mt.sel < views.length - 1 ? "" : "disabled"}>↓ Ner</button><label class="v3-chk"><input type="checkbox" data-f="temp"${st.temp ? " checked" : ""}> Temporärt (t.ex. mobilkran)</label><button type="button" data-mt="delstep" class="dng">Ta bort steg</button></div></div>`;
  }
  const keep = d.querySelector(".v3-mt-list"), top = keep ? keep.scrollTop : 0;
  d.innerHTML = bar + play + `<div class="v3-mt-body"><div class="v3-mt-list">${list}<button type="button" class="v3-mt-add" data-mt="addstep">＋ Steg från markering${l3bs.sel.length ? ` (${l3bs.sel.length} objekt)` : ""}</button><button type="button" class="v3-mt-add2" data-mt="addfree">＋ Tomt steg</button></div>${ed}</div>`;
  const nl = d.querySelector(".v3-mt-list"); if (nl) nl.scrollTop = top;
}
function l3mtTouch() { l3mt.dirty = true; }
async function l3mtClick(e) {
  const t = e.target, b = t.closest("[data-mt]"), s = l3mt.cur;
  const row = t.closest("[data-mtrow]"); if (row && !b) { l3mtGo(Number(row.dataset.mtrow)); return; }
  if (!b) return; const k = b.dataset.mt, st = s && s.steps[l3mt.sel];
  if (k === "close") l3mtToggle(false); else if (k === "new") await l3mtNew(); else if (k === "save") await l3mtSave(); else if (k === "copy") await l3mtSave(true); else if (k === "del") await l3mtDelete();
  else if (k === "first") l3mtGo(0); else if (k === "prev") l3mtGo(l3mt.i - 1); else if (k === "next") l3mtGo(l3mt.i + 1); else if (k === "last") l3mtGo(s.steps.length - 1); else if (k === "play") l3mtPlay(!l3mt.play);
  else if (k === "addstep") {
    const tg = l3mtSelTargets(); if (!tg.length) { l3mt.msg = "Markera objekt i 3D först."; l3mtRender(); return; }
    const nm = await uiPrompt("Namn på steget", `Montage ${s.steps.length + 1}`); if (!nm) return;
    const prev = s.steps[s.steps.length - 1]; s.steps.push(l3mtNewStep(String(nm).trim(), { objs: tg, deps: prev ? [prev.id] : [] })); l3mtTouch(); l3mt.i = l3mt.sel = s.steps.length - 1; l3mtApply(); l3mtRender();
  } else if (k === "addfree") { const prev = s.steps[s.steps.length - 1]; s.steps.push(l3mtNewStep(`Steg ${s.steps.length + 1}`, { deps: prev ? [prev.id] : [] })); l3mtTouch(); l3mt.sel = s.steps.length - 1; l3mtRender(); }
  else if (st && (k === "setobj" || k === "addobj")) { const tg = l3mtSelTargets(); if (!tg.length) { l3mt.msg = "Markera objekt i 3D först."; l3mtRender(); return; } if (k === "setobj") st.objs = tg; else { const have = new Set((st.objs || []).map(o => o.modelId + "|" + o.objectId)); st.objs = [...(st.objs || []), ...tg.filter(o => !have.has(o.modelId + "|" + o.objectId))]; } l3mtTouch(); l3mtApply({ noCam: true }); l3mtRender(); }
  else if (st && k === "clrobj") { st.objs = []; l3mtTouch(); l3mtApply({ noCam: true }); l3mtRender(); }
  else if (st && k === "showobj") { const ents = l3mtEntsOf(l3mtTargets(l3mtViews(s)[l3mt.sel])); if (!ents.length) { l3mt.msg = "Inga av stegets objekt finns i de inlästa modellerna."; l3mtRender(); return; } l3bsSet(ents.map(x => ({ mesh: x.mesh, ri: x.ri }))); if (typeof l3bsZoom === "function") l3bsZoom(); }
  else if (st && (k === "up" || k === "down")) { const j = l3mt.sel + (k === "up" ? -1 : 1); if (j < 0 || j >= s.steps.length) return; const [x] = s.steps.splice(l3mt.sel, 1); s.steps.splice(j, 0, x); l3mt.sel = j; l3mt.i = j; l3mtTouch(); l3mtApply({ noCam: true }); l3mtRender(); }
  else if (st && k === "delstep") { if (!(await uiConfirm(`Ta bort steget "${st.name}"?`))) return; s.steps.splice(l3mt.sel, 1); s.steps.forEach(x => { x.deps = (x.deps || []).filter(d => d !== st.id); }); l3mt.sel = Math.max(0, l3mt.sel - 1); l3mt.i = Math.min(l3mt.i, Math.max(0, s.steps.length - 1)); l3mtTouch(); l3mtApply({ noCam: true }); l3mtRender(); }
  else if (k === "exp") await l3mtExport();
}
function l3mtChange(e) {
  const t = e.target, s = l3mt.cur;
  if (t.id === "mtSel") { l3mtOpen(t.value || null); return; }
  if (t.id === "mtFollow") { l3mt.follow = t.checked; return; }
  if (!s) return; const st = s.steps[l3mt.sel]; if (!st) return;
  if (t.dataset.dep) { const id = t.dataset.dep; st.deps = (st.deps || []).filter(d => d !== id); if (t.checked) st.deps.push(id); l3mtTouch(); l3mtApply({ noCam: true }); l3mtRender(); return; }
  if (t.dataset.f === "temp") { st.temp = t.checked; l3mtTouch(); }
  else if (t.dataset.f === "start" || t.dataset.f === "pS" || t.dataset.f === "pE") { st[t.dataset.f] = t.value; l3mtTouch(); l3mtRender(); }
  else if (t.dataset.f === "dur") { st.dur = Math.max(1, Number(t.value) || 1); l3mtTouch(); l3mtRender(); }
}
function l3mtInput(e) {
  const t = e.target, s = l3mt.cur;
  if (t.id === "mtSlider") { l3mtGo(Number(t.value)); return; }
  if (!s) return; const st = s.steps[l3mt.sel]; if (!st) return;
  if (t.dataset.f === "name") { st.name = t.value; l3mtTouch(); const r = document.querySelector(`[data-mtrow="${l3mt.sel}"] .t b`); if (r) r.textContent = t.value; }
  else if (t.dataset.f === "note") { st.note = t.value; l3mtTouch(); }
}

/* ---- Export: fristående HTML med riktig geometri och bild per steg ------------------------------------------------------------------------ */
const l3mtNum = v => { const n = parseFloat(String(v === undefined ? "" : v).replace(/\s/g, "").replace(",", ".")); return isFinite(n) ? n : ""; };
function l3mtObjFromProps(ent, d, guid) {
  const f = {}; if (d) { (d.psets || []).forEach(ps => ps.p.forEach(([pn, v]) => { if (String(v).trim() !== "") f[`${ps.n} / ${pn}`] = v; })); if (d.type) (d.type.psets || []).forEach(ps => ps.p.forEach(([pn, v]) => { const k = `${ps.n} / ${pn}`; if (String(v).trim() !== "" && !(k in f)) f[k] = v; })); }
  const low = s => String(s).toLowerCase(), pn = k => (k.includes(" / ") ? k.slice(k.indexOf(" / ") + 3) : k), ps = k => (k.includes(" / ") ? k.slice(0, k.indexOf(" / ")) : "");
  const ex = nm => { const k = Object.keys(f).find(key => low(pn(key)) === nm && String(f[key]).trim() !== ""); return k ? f[k] : ""; }, q = v => (v === "" ? "" : Math.round(v)), mass = l3mtNum(ex("element_mass"));
  const nameA = d && d.attrs ? (d.attrs.find(a => a[2] === "a:name") || [])[1] : "", m = ent.model;
  return { id: String(guid).slice(-8), g: String(guid), mi: String((m && m.id) || ""), mn: (m && m.name) || "", n: nameA || (d && d.cls) || "Objekt", t: d && d.cls ? String(d.cls).replace(/^Ifc/, "") : "", p: [],
    f: { m: String(ex("element_mark")).trim().slice(0, 40), k: String(ex("element_type")).trim().slice(0, 20), l: q(l3mtNum(ex("element_length"))), w: q(l3mtNum(ex("element_width"))), h: q(l3mtNum(ex("element_height"))), t: mass === "" ? "" : Math.round((mass >= 100 ? mass / 1000 : mass) * 1000) / 1000, f: String(ex("element_lift")).trim().slice(0, 40), p: String(ex("location_phase")).trim().slice(0, 40) },
    a: Object.keys(f).map(k => [ps(k), pn(k), String(f[k]).slice(0, 80)]), b: null };
}
async function l3mtShrink(src, maxW, q) {
  return new Promise(res => { const im = new Image(); im.onload = () => { const k = Math.min(1, maxW / im.width), c = document.createElement("canvas"); c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k)); const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", q)); }; im.onerror = () => res(""); im.src = src; });
}
async function l3mtExport() {
  const s = l3mt.cur; if (!s || l3mt.busy) return; const key = "mtexp";
  if (typeof l3b === "undefined" || !l3b.models.length) { await uiAlert("Läs in byggnadens IFC-modell i 3D-vyn först (Lager → 3D-modeller)."); return; }
  const views = l3mtViews(s); if (!views.length) { await uiAlert("Sekvensen har inga steg än."); return; }
  l3mt.busy = true; const keepI = l3mt.i, keepFollow = l3mt.follow;
  try {
    busyProgress(key, "Montageordning: hämtar objekt och egenskaper", 0.05);
    const per = views.map(x => l3mtEntsOf(l3mtTargets(x))), byStep = {}; let done = 0; const total = per.reduce((a, l) => a + l.length, 0) || 1;
    for (let i = 0; i < views.length; i++) {
      const list = []; const seen = new Set();
      for (let k = 0; k < per[i].length; k += 8) {
        const chunk = per[i].slice(k, k + 8).filter(e => { const kk = e.model.id + "|" + e.guid; if (seen.has(kk)) return false; seen.add(kk); return true; });
        const props = await Promise.all(chunk.map(e => (typeof l3pProps === "function" ? l3pProps(e.model, e.guid).catch(() => null) : Promise.resolve(null))));
        chunk.forEach((e, j) => list.push(l3mtObjFromProps(e, props[j], e.guid))); done += chunk.length; busyProgress(key, `Montageordning: objekt ${done} av ${total}`, 0.05 + 0.35 * done / total);
      }
      list.sort((a, b) => String(a.f.m || a.n).localeCompare(String(b.f.m || b.n), "sv", { numeric: true })); byStep[views[i].st.id] = list;
    }
    const imgs = {}; l3mt.follow = true;
    for (let i = 0; i < views.length; i++) {
      busyProgress(key, `Montageordning: bild ${i + 1} av ${views.length}`, 0.4 + 0.4 * i / views.length); l3mt.i = i; l3mtApply({ instant: true });
      await new Promise(r => setTimeout(r, 60)); l3.renderer.render(l3.scene, l3.camera);
      try { imgs[views[i].st.id] = await l3mtShrink(l3.renderer.domElement.toDataURL("image/jpeg", 0.8), 1100, 0.72); } catch (e) { console.warn(e); }
    }
    const pr = typeof l3Prefs === "function" ? l3Prefs() : {}, idx = new Map(views.map((x, i) => [x.st.id, i]));
    const D = { has3d: false, cols: [], title: s.name, logo: pr.mtLogo || "", company: pr.mtCompany || "", author: pr.mtAuthor === undefined ? "Victor Falk NCC" : pr.mtAuthor, area: s.area || "", desc: s.desc || "", generated: l3mtToday(), parts: [], hasImg: Object.values(imgs).some(Boolean),
      steps: views.map(x => ({ n: x.st.name, p: "", t: x.st.temp ? 1 : 0, s: x.s, e: x.e, note: x.st.note || "", deps: (x.st.deps || []).filter(d => idx.has(d)).map(d => idx.get(d)), img: imgs[x.st.id] || "", h: x.hours || 0, q: x.qty || 0, u: x.st.unit || "", obj: byStep[x.st.id] || [], gn: "", gc: "" })) };
    const json = JSON.stringify(D).replace(/</g, "\\u003c");
    let html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${l3mtE(s.name)} – montageordning</title><style>${MS_MOD_CSS}</style></head><body><noscript><p style="padding:20px">Rapporten kräver JavaScript för att visas.</p></noscript><script>(${msModernRuntime.toString()})(${json});<\/script></body></html>`;
    busyProgress(key, "Montageordning: hämtar objektens form", 0.85);
    let r = null; try { r = await mpBuild(html, { maxTris: 3e6, confirm: n => uiConfirm(`Objekten har ${(n / 1e6).toFixed(1).replace(".", ",")} miljoner trianglar – filen kan bli stor. Fortsätta?`) }); } catch (e) { console.warn("Geometri", e); }
    if (r && r.cancelled) { busyProgress(key, "", null); return; }
    if (r && r.html) html = r.html;
    busyProgress(key, "", null);
    const name = `montageordning_${String(s.name).replace(/[^\wåäöÅÄÖ.-]+/g, "_").slice(0, 40)}_${l3mtToday()}${r && r.html ? "_3D" : ""}.html`, blob = new Blob([html], { type: "text/html" });
    downloadBlob(blob, name);
    l3mt.msg = `✓ ${name} (${(blob.size / 1e6).toFixed(1).replace(".", ",")} MB)${r && r.html ? `: ${r.found} av ${r.total} objekt med riktig geometri` : ": utan 3D-geometri (inga objekt hittades i modellerna)"}`;
    if (typeof l3Status === "function") l3Status(l3mt.msg);
  } catch (e) { busyProgress(key, "", null); console.warn(e); await uiAlert("Kunde inte skapa exporten: " + ((e && e.message) || e)); }
  finally { l3mt.busy = false; l3mt.follow = keepFollow; l3mt.i = keepI; l3mtApply({ noCam: true }); l3mtRender(); }
}
