/* Organizer i Trimble Connect (Victor 2026-10-12: "I min 3d-editor vill jag ha in indelningen som jag har gjort i
   organizern i TC, lägg in det på 'Grupper'").

   Läser projektets Organizer-träd med Organizer-tjänsten (REST, samma åtkomstnyckel som mapparna):
     https://org-api[.<region>].connect.trimble.com/v1/  forests/{forest}/trees  och  …/trees/{tree}/nodes
   (svaren är sidindelade: { items, next }). Ett träds noder är grupperna; en nods namn är hela sökvägen med "/"
   mellan nivåerna (eller parentId) och dess länkar pekar ut modellobjekten.

   Länkarna görs om till IFC-id (GUID) så att lägesplanens 3D-vy kan hitta objekten i sina IFC-modeller:
   – står IFC-id:t i länken används det direkt,
   – annars tolkas länken som modell + objektets id i Trimble Connect och översätts med visarens
     convertToObjectIds (modellen behöver då vara tänd i Trimble Connect).
   Hittas inget följer en tydlig beskrivning av vad som provades med i svaret (steg för steg), så att det går att
   rätta utan att gissa. Bara läsning – inget i Organizer ändras. */

const TC_ORG_BY_LOCATION = {
  europe: "https://org-api.eu-west-1.connect.trimble.com/v1/",
  asia: "https://org-api.ap-southeast-1.connect.trimble.com/v1/",
  australia: "https://org-api.ap-southeast-2.connect.trimble.com/v1/",
  northamerica: "https://org-api.connect.trimble.com/v1/",
};
const TC_GUID_RE = /^[0-9A-Za-z_$]{22}$/;

/* Organizer-tjänstens adress för projektets region. */
async function tcOrgBase(tokenVal, project, log, fetchFn = fetch) {
  try {
    const res = await fetchFn("https://app.connect.trimble.com/tc/api/2.0/regions", { headers: { Authorization: `Bearer ${tokenVal}` } });
    if (res.ok) {
      const regions = await res.json(), loc = String(project.location || "").toLowerCase();
      const hit = (regions || []).find(r => String(r.location || r.region || "").toLowerCase() === loc);
      const uri = hit && (hit.orgApi || hit["org-api"] || hit.organizerApi);
      if (uri) { log.push(`Region ${loc}: ${uri}`); return uri.endsWith("/") ? uri : uri + "/"; }
      log.push(`Regionlistan saknar Organizer-adress för ${loc || "projektets region"}.`);
    } else log.push(`Regionlistan svarade ${res.status}.`);
  } catch (e) { log.push(`Regionlistan: ${e.message}`); }
  const loc = String(project.location || "").toLowerCase().replace(/[^a-z]/g, "");
  const uri = TC_ORG_BY_LOCATION[loc] || TC_ORG_BY_LOCATION.northamerica;
  log.push(`Organizer-adress enligt regionen ${loc || "okänd"}: ${uri}`);
  return uri;
}
/* Alla sidor ({ items, next }). */
async function tcOrgPaged(url, H, fetchFn, max = 200) {
  const out = [], seen = new Set(), ids = new Set();
  for (let i = 0; url && i < max && !seen.has(url); i++) { // samma "nästa sida" igen: klart (ingen loop)
    seen.add(url);
    const res = await fetchFn(url, { headers: H });
    if (!res.ok) { const e = new Error(`${res.status}`); e.status = res.status; throw e; }
    const d = await res.json();
    (Array.isArray(d) ? d : d.items || []).forEach(x => { if (x && x.id != null) { if (ids.has(x.id)) return; ids.add(x.id); } out.push(x); });
    url = !Array.isArray(d) && d.next ? (/^https?:/.test(d.next) ? d.next : new URL(d.next, url).href) : null;
  }
  return out;
}
/* Länkarna (strängar) → { guids, rt: Map(modelId → [objekt-id i TC]) , other }. */
function tcOrgParseLinks(links, modelIds) {
  const guids = new Set(), rt = new Map(), other = [];
  (links || []).forEach(l => {
    const s = typeof l === "string" ? l : (l && (l.link || l.id || l.uri)) || "";
    const parts = String(s).split(/[:/|#?=&,;]+/).filter(Boolean);
    const g = parts.find(p => TC_GUID_RE.test(p));
    if (g) { guids.add(g); return; }
    const mi = parts.findIndex(p => modelIds.has(p));
    if (mi >= 0) {
      const ids = parts.slice(mi + 1).filter(p => /^\d+$/.test(p)).map(Number);
      if (ids.length) { const m = parts[mi]; if (!rt.has(m)) rt.set(m, []); ids.forEach(id => rt.get(m).push(id)); return; }
    }
    other.push(s);
  });
  return { guids, rt, other };
}
/* Hela hämtningen. viewer = API.viewer (för modellerna och översättningen), kan vara null. */
async function tcOrganizerFetch(tokenVal, project, viewer, fetchFn = fetch) {
  const log = [], H = { Authorization: `Bearer ${tokenVal}` };
  const base = await tcOrgBase(tokenVal, project, log, fetchFn);
  // Projektets "forest" i Organizer: projektets id (provas också med några kända prefix).
  const cands = [project.forestId, project.id, `tc:${project.id}`, `tcp:${project.id}`, `connect:${project.id}`].filter((v, i, a) => v && a.indexOf(v) === i);
  let forest = null, trees = null;
  for (const f of cands) {
    try { trees = await tcOrgPaged(`${base}forests/${encodeURIComponent(f)}/trees?limit=500`, H, fetchFn); forest = f; log.push(`Forest ${f}: ${trees.length} träd.`); break; }
    catch (e) { log.push(`Forest ${f}: ${e.status ? "svar " + e.status : e.message}`); }
  }
  if (!forest) { const e = new Error("Hittade inte projektets Organizer i Trimble Connect."); e.log = log; throw e; }
  trees = trees.filter(t => !t.deleted);
  // Modellerna i Trimble Connect (för länkar som pekar på objekt-id i en modell).
  let models = [];
  try { models = viewer ? await viewer.getModels() : []; } catch (e) { models = []; }
  const modelIds = new Set(); (models || []).forEach(m => { if (m.id) modelIds.add(m.id); if (m.versionId) modelIds.add(m.versionId); });
  const out = [];
  let unresolved = 0, sample = null;
  for (const t of trees) {
    let nodes = [];
    try { nodes = await tcOrgPaged(`${base}forests/${encodeURIComponent(forest)}/trees/${encodeURIComponent(t.id)}/nodes?limit=500`, H, fetchFn); }
    catch (e) { log.push(`Trädet ${t.name || t.id}: noderna svarade ${e.status || e.message}`); continue; }
    const groups = [];
    for (const n of nodes.filter(n => !n.deleted)) {
      let links = n.links;
      if (!links && n.linksUrl) {
        try { let r = await fetchFn(n.linksUrl); if (r.status === 401 || r.status === 403) r = await fetchFn(n.linksUrl, { headers: H }); const d = r.ok ? await r.json() : null; links = Array.isArray(d) ? d : (d && (d.links || d.items)) || []; }
        catch (e) { links = []; }
      }
      const p = tcOrgParseLinks(links || [], modelIds);
      // Objekt-id i Trimble Connect → IFC-id med visaren.
      for (const [mid, ids] of p.rt) {
        try { const ext = viewer && viewer.convertToObjectIds ? await viewer.convertToObjectIds(mid, ids) : []; (ext || []).forEach(x => { if (x) p.guids.add(String(x)); }); }
        catch (e) { unresolved += ids.length; }
      }
      unresolved += p.other.length;
      if (!sample && p.other.length) sample = p.other[0];
      groups.push({ id: n.id, name: n.name || "", parentId: n.parentId || null, guids: [...p.guids], n: (links || []).length });
    }
    out.push({ id: t.id, name: t.name || t.type || "Organizer", type: t.type || "", groups });
  }
  if (unresolved) log.push(`${unresolved} länkar kunde inte tolkas${sample ? ` (t.ex. "${String(sample).slice(0, 120)}")` : ""}.`);
  return { forest, base, trees: out, log, at: new Date().toISOString() };
}
