/* Delade IFC-ändringar (Victor 2026-11-12: "all modellering jag gör som kopierar ifcer … ska sparas över hela appen och inte bara lokalt").
   Flyttar och kopior av IFC-objekt (lagesplan-3dbmove.js) låg bara i minnet tills man exporterade en ny IFC. Nu sparas de i projektet
   (projects/<id>/plan_ifcedits.json, en post per modell) och läggs tillbaka när modellen läses in – hos alla som öppnar projektet.
   Poster: { k: modell-id, moves: { guid: [16 tal] }, copies: { guid: { src, M: [16 tal] } } } (matriser i SWEREF-meter, som l3bm.edits).
   Prefix l3bv. */
const l3bv = { recs: null, loading: null, pid: null, timers: new Map(), applying: false, done: new Set() };
const l3bvPath = () => `projects/${encodeURIComponent(projectId)}/plan_ifcedits.json`;
const l3bvOk = () => typeof projectId !== "undefined" && projectId && typeof ghReadJSON === "function" && typeof token !== "undefined" && token;
const l3bvR = x => Math.round(x * 1e9) / 1e9;
const l3bvMat = a => new THREE.Matrix4().fromArray(a);
function l3bvPack(ed) {
  const moves = {}, copies = {}; ed.moves.forEach((M, g) => { moves[g] = M.elements.map(l3bvR); }); (ed.copies || new Map()).forEach((x, g) => { copies[g] = { src: x.src, M: x.M.elements.map(l3bvR) }; });
  return { moves, copies };
}
async function l3bvLoad() {
  if (!l3bvOk()) return [];
  if (l3bv.pid !== projectId) { l3bv.pid = projectId; l3bv.recs = null; l3bv.loading = null; l3bv.done = new Set(); }
  if (l3bv.recs) return l3bv.recs;
  if (!l3bv.loading) l3bv.loading = ghReadJSON(token, l3bvPath()).then(r => (l3bv.recs = r.filter(x => x && x.k)), e => { console.warn("Kunde inte läsa plan_ifcedits.json", e); return (l3bv.recs = []); });
  return l3bv.loading;
}
/* Lägger tillbaka sparade kopior och flyttar på de inlästa modellerna (en gång per modell). */
async function l3bvApply() {
  if (!l3bvOk() || typeof l3b === "undefined" || typeof l3bmCopyAccept !== "function") return;
  const recs = await l3bvLoad(); if (!recs.length) return;
  for (const m of l3b.models) {
    const rec = recs.find(r => r.k === m.id); if (!rec || l3bv.done.has(m)) continue; l3bv.done.add(m);
    const rngs = new Map(); m.meshes.forEach(mesh => { const u = mesh.userData.l3b; if (u && u.ranges) u.ranges.forEach((r, ri) => { if (r.guid) rngs.set(r.guid, { mesh, ri }); }); });
    l3bv.applying = true;
    try {
      const O = new THREE.Matrix4().makeTranslation(l3.O[0], l3.O[1], l3.O[2]), Oi = O.clone().invert(), ed = l3bmEd(m);
      // 1) kopiorna (ur orörda original), med sina sparade guid
      Object.entries(rec.copies || {}).forEach(([g, x]) => {
        if (ed.copies.has(g) || rngs.has(g)) return; const src = rngs.get(x.src); if (!src) return;
        const Dg = l3bvMat(x.M), D = Oi.clone().multiply(Dg).multiply(O);
        const made = l3bmCopyAccept([{ mesh: src.mesh, ri: src.ri }], D, Dg, { quiet: true, guids: [g] });
        (made || []).forEach(mm => mm.userData.l3b.ranges.forEach((r, ri) => rngs.set(r.guid, { mesh: mm, ri })));
      });
      // 2) flyttarna (även på kopiorna)
      Object.entries(rec.moves || {}).forEach(([g, a]) => { const e = rngs.get(g); if (!e) return; const Dg = l3bvMat(a), D = Oi.clone().multiply(Dg).multiply(O); l3bmApplyDelta([{ mesh: e.mesh, ri: e.ri }], D, Dg); });
      ed.dirty = false;   // finns i projektet; "väntar på export" gäller bara nya ändringar
    } catch (e) { console.warn("Kunde inte lägga tillbaka IFC-ändringar", e); }
    l3bv.applying = false;
  }
  if (typeof l3LayersRender === "function") l3LayersRender(); if (typeof l3Render === "function") l3Render();
}
function l3bvSchedule(model) {
  if (l3bv.applying || !model || !l3bvOk()) return;
  clearTimeout(l3bv.timers.get(model.id)); l3bv.timers.set(model.id, setTimeout(() => l3bvSave(model), 1200));
}
async function l3bvSave(model) {
  const ed = l3bm.edits.get(model.id), cnt = ed ? l3bmCount(ed) : 0, pack = ed ? l3bvPack(ed) : { moves: {}, copies: {} };
  try {
    await l3bvLoad();
    const mut = arr => { const out = (Array.isArray(arr) ? arr : []).filter(r => r && r.k !== model.id); if (cnt) out.push({ k: model.id, name: model.name || "", ...pack, t: new Date().toISOString(), by: (typeof settings !== "undefined" && settings.userName) || "" }); return out; };
    const next = await ghWriteJSON(token, l3bvPath(), mut, `IFC-ändringar: ${model.name || model.id} (${cnt} ${cnt === 1 ? "objekt" : "objekt"})`);
    l3bv.recs = Array.isArray(next) ? next : mut(l3bv.recs || []);
  } catch (e) { if (typeof l3Status === "function") l3Status("Kunde inte spara IFC-ändringarna i projektet: " + e.message, true); }
}
window.addEventListener("load", () => {
  const wrap = (name, after) => { const f = window[name]; if (typeof f !== "function" || f._bv) return; const w = function () { const r = f.apply(this, arguments); try { after.apply(this, [r, arguments]); } catch (e) { console.warn(name, e); } return r; }; w._bv = true; window[name] = w; };
  const edOf = e => e && e.mesh && e.mesh.userData.l3b && e.mesh.userData.l3b.model;
  wrap("l3bmApplyDelta", (r, a) => new Set((a[0] || []).map(edOf)).forEach(m => l3bvSchedule(m)));
  wrap("l3bmCopyAttach", (r, a) => (a[0] || []).forEach(mm => l3bvSchedule(mm.userData.l3b.model)));
  wrap("l3bmCopyDetach", (r, a) => (a[0] || []).forEach(mm => l3bvSchedule(mm.userData.l3b.model)));
  const all = () => l3bm.edits.forEach(ed => l3bvSchedule(ed.model));
  wrap("l3bmCopyDelete", all); wrap("l3bmSwap", all);
  ["l3bLoad", "l3bRestore"].forEach(n => { const f = window[n]; if (typeof f !== "function") return; window[n] = async function () { const r = await f.apply(this, arguments); try { await l3bvApply(); } catch (e) { console.warn("l3bvApply", e); } return r; }; });
});
