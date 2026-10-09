/* Lägesplan – säker sparning från flera enheter (Victor 2026-10-07: stabilitet).
   Planen (med alla zoner) sparas som en post i status_plans.json. Förut skrev varje sparning hela
   posten, så om Lägesplan var öppen på t.ex. datorn och iPaden vann den som sparade sist – och den
   andras zonändringar försvann. Nu jämförs posten i projektet med den version den här enheten
   senast läste eller sparade (basen). Har någon annan ändrat den sedan dess slås ändringarna ihop:
   – zoner (båda zonlagren) och överzonernas utseende per id/nyckel: det bara den ena ändrat gäller,
     en zon den ena tagit bort och den andra ändrat behålls, ändrat på båda ställena: den här
     enhetens ändring gäller;
   – övriga fält (namn, kalibrering, nivåer …): det som ändrats här gäller, annars projektets.
   Rena funktioner – ingen DOM, inga nätverksanrop (testas fristående). */

/* Tillfälliga fält (t.ex. zonernas uträknade status, _status, med kopior av planeringsraderna)
   hör inte hemma i filen – de gjorde status_plans.json flera hundra kB stor och kunde visa gammal
   status. Tas bort vid sparning, vid inläsning och innan något jämförs. */
const cleanZone = z => { if (!z || typeof z !== "object") return z; const o = {}; for (const k in z) if (!k.startsWith("_")) o[k] = z[k]; return o; };
function cleanPlanRecord(r) {
  if (!r || typeof r !== "object") return r;
  const o = {};
  for (const k in r) if (!k.startsWith("_")) o[k] = MERGE_LISTS.includes(k) && Array.isArray(r[k]) ? r[k].map(cleanZone) : r[k];
  return o;
}
const planBase = new Map(); // plan-id -> den senast kända versionen i projektet (JSON, utan updated_at/by)
const planSig = r => { if (!r) return ""; const { updated_at, updated_by, ...rest } = cleanPlanRecord(r); return JSON.stringify(rest); };
function planBaseSet(list) { (list || []).forEach(r => { if (r && r.id) planBase.set(r.id, planSig(r)); }); }
const mergeEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* Trevägssammanslagning av en lista med id (zonerna). Ordningen: projektets, sedan våra nya. */
function mergeById(base, ours, theirs) {
  base = base || []; ours = ours || []; theirs = theirs || [];
  const B = new Map(base.map(z => [z.id, z])), O = new Map(ours.map(z => [z.id, z])), T = new Map(theirs.map(z => [z.id, z]));
  const out = [], conflicts = [];
  [...new Set([...theirs.map(z => z.id), ...ours.map(z => z.id)])].forEach(id => {
    const b = B.get(id), o = O.get(id), t = T.get(id);
    let v;
    if (mergeEq(o, b)) v = t;              // vi har inte ändrat den: projektets (även om den tagits bort där)
    else if (mergeEq(t, b)) v = o;         // de har inte ändrat den: vår
    else if (o === undefined) v = t;       // vi tog bort, de ändrade: behåll deras ändring
    else if (t === undefined) v = o;       // de tog bort, vi ändrade: behåll vår
    else { v = o; conflicts.push(id); }    // ändrad på båda ställena: vår gäller
    if (v !== undefined) out.push(v);
  });
  return { list: out, conflicts };
}
/* Samma sak för ett objekt med nycklar (överzonernas utseende). */
function mergeByKey(base, ours, theirs) {
  base = base || {}; ours = ours || {}; theirs = theirs || {};
  const r = mergeById(Object.entries(base).map(([id, v]) => ({ id, v })), Object.entries(ours).map(([id, v]) => ({ id, v })), Object.entries(theirs).map(([id, v]) => ({ id, v })));
  return { obj: Object.fromEntries(r.list.map(x => [x.id, x.v])), conflicts: r.conflicts };
}
const MERGE_LISTS = ["zones", "zones_prefab"], MERGE_MAPS = ["wbs", "wbs_prefab"];
/* base, ours, theirs: hela planposter. Returnerar { rec, conflicts }. */
function mergePlanRecord(base, ours, theirs) {
  base = cleanPlanRecord(base); ours = cleanPlanRecord(ours); theirs = cleanPlanRecord(theirs);
  const out = { ...theirs };
  let conflicts = 0;
  new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]).forEach(k => {
    if (k === "updated_at" || k === "updated_by") return;
    if (MERGE_LISTS.includes(k)) {
      const m = mergeById(base[k], ours[k], theirs[k]);
      conflicts += m.conflicts.length;
      if (m.list.length || (k in ours) || (k in theirs)) out[k] = m.list; else delete out[k];
      return;
    }
    if (MERGE_MAPS.includes(k)) {
      const m = mergeByKey(base[k], ours[k], theirs[k]);
      conflicts += m.conflicts.length;
      if (Object.keys(m.obj).length) out[k] = m.obj; else delete out[k];
      return;
    }
    if (mergeEq(ours[k], base[k])) { if (k in theirs) out[k] = theirs[k]; else delete out[k]; }
    else if (ours[k] === undefined) delete out[k];
    else out[k] = ours[k];
  });
  out.updated_at = ours.updated_at; out.updated_by = ours.updated_by;
  return { rec: out, conflicts };
}
/* Lägg in en sammanslagen post i planen i minnet (med hänsyn till vilket zonlager som är valt). */
/* Samma objekt för samma zon (id) eller överzon (nyckel) efter en sammanslagning: rutor som är
   öppna (zon, etikett, överzon) håller i objektet och ska fortsätta ändra det som visas och sparas. */
function keepSame(oldV, newV) {
  if (!oldV || !newV || typeof oldV !== "object" || typeof newV !== "object") return newV;
  const fill = (o, n) => { Object.keys(o).forEach(k => { if (!(k in n)) delete o[k]; }); Object.assign(o, n); return o; };
  if (Array.isArray(newV)) {
    if (!Array.isArray(oldV)) return newV;
    const byId = new Map(oldV.filter(x => x && x.id != null).map(x => [x.id, x]));
    return newV.map(n => (n && n.id != null && byId.has(n.id) && byId.get(n.id) !== n ? fill(byId.get(n.id), n) : n));
  }
  Object.keys(newV).forEach(k => { const o = oldV[k], n = newV[k]; if (o && n && typeof o === "object" && typeof n === "object" && !Array.isArray(n) && o !== n) newV[k] = fill(o, n); });
  return newV;
}
function applyPlanRecord(p, w) {
  const prev = { zones: p.zones, wbs: p.wbs, zones_prefab: p.zones_prefab, wbs_prefab: p.wbs_prefab, _zonesMain: p._zonesMain, _wbsMain: p._wbsMain };
  Object.keys(p).forEach(k => { if (!k.startsWith("_") && !(k in w) && !MERGE_LISTS.includes(k) && !MERGE_MAPS.includes(k)) delete p[k]; });
  Object.keys(w).forEach(k => { if (!MERGE_LISTS.includes(k) && !MERGE_MAPS.includes(k)) p[k] = w[k]; });
  if (p._zoneSet === "prefab") { p._zonesMain = w.zones || []; p._wbsMain = w.wbs; p.zones = w.zones_prefab || []; p.wbs = w.wbs_prefab; }
  else { p.zones = w.zones || []; p.wbs = w.wbs; p.zones_prefab = w.zones_prefab; p.wbs_prefab = w.wbs_prefab; }
  ["wbs", "wbs_prefab", "zones_prefab", "_wbsMain"].forEach(k => { if (p[k] === undefined || p[k] === null) delete p[k]; });
  Object.keys(prev).forEach(k => { if (p[k] && prev[k]) p[k] = keepSame(prev[k], p[k]); });
}
if (typeof module !== "undefined") module.exports = { mergeById, mergeByKey, mergePlanRecord, planSig, cleanPlanRecord };
