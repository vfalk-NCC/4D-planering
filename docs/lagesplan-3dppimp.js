/* Importera Powerproject-fil i 3D-editorn (Victor 2026-11-12: "import av powerprojectfilen i 3d-editorn också, om jag skulle vilja koppla mig lös från TC").
   Samma läsare som i 4D-planering (pp-import.js, .pp läses lokalt i webbläsaren). Försiktig sammanslagning mot projektets Powerproject-plan (pp/plan_items.json):
   – aktiviteter som redan finns (samma Powerproject-id/guid) uppdateras med namn, område, datum, framdrift, entreprenör och resurser;
     3D-kopplingar, kommentarer, baselines och egna val (Temporär, Rivning, färger) rörs inte
   – nya aktiviteter läggs till (ej kopplade), och INGET tas bort
   – förhandsgranskning först, och en säkerhetskopia (samma lista som i 4D-planering) tas innan något skrivs.
   Prefix l3pi. */
const l3pi = { pp: null, busy: false };
const l3piDir = () => `projects/${encodeURIComponent(projectId)}/pp`;
function l3piPick() {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".pp,.ppx,.ppb,.sqlite,*/*"; inp.onchange = () => { if (inp.files && inp.files[0]) l3piRead(inp.files[0]); }; inp.click();
}
async function l3piRead(f) {
  if (typeof parsePowerproject !== "function") { l3Status("Powerproject-läsaren finns inte i den här versionen.", true); return; }
  l3Status("Läser tidplanen…");
  try { l3pi.pp = await parsePowerproject(await f.arrayBuffer(), f.name); } catch (e) { console.error(e); l3Status("Kunde inte läsa Powerproject-filen: " + e.message, true); return; }
  if (!l3pi.pp.tasks.length) { l3Status("Hittade inga aktiviteter med datum i filen.", true); return; }
  l3Status(`${l3pi.pp.tasks.length} aktiviteter inlästa ur ${f.name}.`); l3piDlg();
}
function l3piSaved() { try { return typeof ppSavedOpts === "function" ? ppSavedOpts() : {}; } catch (e) { return {}; } }
function l3piDlg() {
  const pp = l3pi.pp, E = escHtml, S = l3piSaved(), fmt = d => (d ? d.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$3/$2 $1") : "–");
  const lib = (name, none) => `<option value="">${none}</option>` + pp.libs.map(l => `<option value="${l.id}" ${name && l.name === name ? "selected" : ""}>${E(l.name)} (${l.count})</option>`).join("");
  const d = l3Dlg("v3PpImp", "Importera Powerproject", `<div class="v3-pi-h"><b>${E(pp.project.name || pp.fileName)}</b><span>${pp.tasks.length} aktiviteter · ${pp.links.length} länkar${pp.project.start ? ` · ${fmt(pp.project.start)} – ${fmt(pp.project.end)}` : ""}</span></div>
    <div class="v3-gd-sec">Delar att importera</div>
    <div class="v3-pi-parts">${pp.groups.map(g => `<label class="v3-chk" title="${fmt(g.start)} – ${fmt(g.end)}"><input type="checkbox" data-pig="${g.id}" ${(S.off || []).includes(g.name) ? "" : g.defaultOn === false ? "" : "checked"} /> ${E(g.name)} <small>${g.count}</small></label>`).join("")}</div>
    <div class="v3-gd-g2"><label class="v3-field"><span>Område från</span><select id="v3PiArea">${lib(S.area, "Sammanfattningsraden")}</select></label><label class="v3-field"><span>Entreprenör från</span><select id="v3PiContr">${lib(S.contr, "Ingen")}</select></label></div>
    <label class="v3-chk"><input type="checkbox" id="v3PiRes" ${S.res === false ? "" : "checked"} /> Ta med resurser (antal och timmar)</label>
    <div class="v3-pi-sum" id="v3PiSum"><i class="pm-spin"></i> Jämför med planen…</div>
    <div class="v3-gd-btns end"><button type="button" data-picancel>Avbryt</button><button type="button" class="v3-primary" data-pigo disabled>Importera</button></div>`);
  const upd = () => l3piPreview(d); d.querySelectorAll("[data-pig],#v3PiArea,#v3PiContr,#v3PiRes").forEach(i => { i.onchange = upd; });
  d.querySelector("[data-picancel]").onclick = () => l3DlgClose("v3PpImp");
  d.querySelector("[data-pigo]").onclick = () => l3piCommit(d); upd();
}
function l3piOpts(d) {
  const S = l3piSaved(), a = d.querySelector("#v3PiArea").value, c = d.querySelector("#v3PiContr").value;
  return { groups: new Set([...d.querySelectorAll("[data-pig]")].filter(x => x.checked).map(x => Number(x.dataset.pig))), areaOff: new Set(S.offAreas || []), areaLib: a ? Number(a) : null, contractorLib: c ? Number(c) : null, resources: d.querySelector("#v3PiRes").checked };
}
const l3piStatus = (p, today) => (Number.isFinite(p.progress) && p.progress >= 100 ? "klar" : p.endDate && today > p.endDate ? "forsenad" : (Number(p.progress) || 0) >= 1 ? "pagaende" : p.startDate && today >= p.startDate ? "forsenad" : "planerad");
const l3piIdOf = key => { const m = /\|\|(\d+)$/.exec(String(key || "")); return m ? Number(m[1]) : null; };
/* Sammanslagningen (ren funktion): rows = befintliga rader, parsed = ur ppToParsedItems. Returnerar { next (hela nya listan), nNew, nUpd, nSame, changed (rader som skrivs) }. */
function l3piMerge(rows, parsed, today) {
  const pool = rows.filter(r => r.origin !== "manuell" && /^PP .*\|\|\d+$/.test(r.source_key || "")), byId = new Map(), byGuid = new Map(), bySk = new Map();
  rows.forEach(r => { if (r.source_key) (bySk.get(r.source_key) || bySk.set(r.source_key, []).get(r.source_key)).push(r); });
  pool.forEach(r => { const i = l3piIdOf(r.source_key); if (!byId.has(i)) byId.set(i, r); if (r.pp_guid && !byGuid.has(r.pp_guid)) byGuid.set(r.pp_guid, r); });
  const taken = new Set(), match = new Map(), take = (p, r) => { match.set(p, r); taken.add(r.source_key); };
  parsed.forEach(p => { const r = byId.get(p.ppId); if (r) take(p, r); });
  parsed.forEach(p => { if (match.has(p) || !p.ppGuid) return; const r = byGuid.get(p.ppGuid); if (r && !taken.has(r.source_key)) take(p, r); });
  const norm = t => String(t || "").trim().toLowerCase().replace(/\s+/g, " "), orphans = new Map(), loose = new Map();   // omdöpt aktivitet: exakt ett namn i båda ändar
  pool.forEach(r => { if (taken.has(r.source_key)) return; const k = norm(r.object_name); (orphans.get(k) || orphans.set(k, new Set()).get(k)).add(r.source_key); });
  parsed.forEach(p => { if (match.has(p)) return; const k = norm(p.objectName); (loose.get(k) || loose.set(k, []).get(k)).push(p); });
  loose.forEach((list, k) => { const keys = orphans.get(k); if (list.length !== 1 || !keys || keys.size !== 1) return; const key = [...keys][0]; take(list[0], pool.find(r => r.source_key === key)); });
  const out = new Map(), fresh = [], now = new Date().toISOString(); let nNew = 0, nUpd = 0, nSame = 0; const depKeys = new Map();
  parsed.forEach(p => {
    const ex = match.get(p), st = l3piStatus(p, today), base = { object_name: p.objectName, area: p.area || null, activity: p.activity || null, status: st, start_date: p.startDate || null, end_date: p.endDate || null, actual_start_date: p.actualStartDate || null, actual_end_date: p.actualEndDate || null, progress: Number.isFinite(p.progress) ? Math.max(0, Math.min(100, Math.round(p.progress))) : 0, source_key: p.sourceKey, pp_guid: p.ppGuid || null };
    if (ex) {
      const members = (bySk.get(ex.source_key) || [ex]); let any = false;
      members.forEach(m => {
        const n = { ...m, ...base, contractor: p.contractor !== undefined ? p.contractor : m.contractor, pp_guid: base.pp_guid || m.pp_guid };
        if (!base.pp_guid && !m.pp_guid) delete n.pp_guid; if (Array.isArray(p.resources) && p.resources.length) n.resources = p.resources;
        const same = ["object_name", "area", "activity", "contractor", "start_date", "end_date", "actual_start_date", "actual_end_date", "progress", "source_key"].every(k => (n[k] ?? null) === (m[k] ?? null)) && JSON.stringify(n.resources || null) === JSON.stringify(m.resources || null);
        if (!same) { n.status = st; n.updated_at = now; out.set(m.id, n); any = true; } else n.status = m.status;
        if (p.dependsOnKeys && p.dependsOnKeys.length) depKeys.set(m.id, p.dependsOnKeys);
      });
      if (any) nUpd++; else nSame++;
    } else {
      const id = ghNewId(), r = { id, project_id: projectId, model_id: null, object_id: `excel-${id}`, element_type: null, contractor: p.contractor || null, estimated_hours: null, depends_on: [], group_id: null, baseline_start_date: null, baseline_end_date: null, excel_sheet: null, excel_map: null, origin: null, ...base, ...(Array.isArray(p.resources) && p.resources.length ? { resources: p.resources } : {}), updated_at: now };
      fresh.push(r); out.set(id, r); nNew++; if (p.dependsOnKeys && p.dependsOnKeys.length) depKeys.set(id, p.dependsOnKeys);
    }
  });
  const next = rows.map(r => out.get(r.id) || r).concat(fresh);
  if (depKeys.size) {   // beroenden ur Powerproject-länkarna: föregångarnas source_key → id (befintliga glapp behålls)
    const ids = new Map(); next.forEach(r => { if (r.source_key) (ids.get(r.source_key) || ids.set(r.source_key, []).get(r.source_key)).push(r.id); });
    next.forEach((r, i) => { const ks = depKeys.get(r.id); if (!ks || !out.has(r.id)) return; const own = new Set(ids.get(r.source_key) || [r.id]), deps = [...new Set(ks.flatMap(k => ids.get(k) || []))].filter(x => !own.has(x)); const nr = { ...r, depends_on: deps }; if (r.dep_lags) { const keep = Object.fromEntries(Object.entries(r.dep_lags).filter(([k]) => deps.includes(k))); if (Object.keys(keep).length) nr.dep_lags = keep; else delete nr.dep_lags; } next[i] = nr; out.set(r.id, nr); });
  }
  return { next, nNew, nUpd, nSame, changed: [...out.values()] };
}
async function l3piPreview(d) {
  const sum = d.querySelector("#v3PiSum"), go = d.querySelector("[data-pigo]"); go.disabled = true;
  const o = l3piOpts(d); if (!o.groups.size) { sum.textContent = "Välj minst en del att importera."; return; }
  sum.innerHTML = `<i class="pm-spin"></i> Jämför med planen…`;
  try {
    const parsed = ppToParsedItems(l3pi.pp, o), rows = await ghReadJSON(token, `${l3piDir()}/plan_items.json`, { fresh: true }), m = l3piMerge(rows, parsed, new Date().toISOString().slice(0, 10));
    l3pi.last = { o, m, rows };
    sum.innerHTML = `<b>${m.nNew}</b> nya · <b>${m.nUpd}</b> uppdateras · ${m.nSame} oförändrade<br><small>Inget tas bort. 3D-kopplingar, kommentarer, baselines och egna val behålls. En säkerhetskopia tas först.</small>`;
    go.disabled = !(m.nNew || m.nUpd);
    if (!(m.nNew || m.nUpd)) sum.innerHTML += `<br><small>Planen är redan uppdaterad.</small>`;
  } catch (e) { sum.textContent = "Kunde inte jämföra: " + e.message; }
}
async function l3piBackup(rows, reason) {
  const now = new Date(), id = ghNewId(), stamp = now.toISOString().replace(/[:.]/g, "-"), dir = l3piDir(), path = `${dir}/backups/${stamp}-${id.slice(0, 8)}.json`;
  const counts = { items: rows.length, coupled: rows.filter(r => r.model_id).length, activities: 0, comments: 0 };
  await ghPutFile(token, path, ghUtf8ToB64(JSON.stringify({ id, created_at: now.toISOString(), reason, by: (typeof settings !== "undefined" && settings.userName) || null, counts, files: { plan_items: rows } })), null, `Säkerhetskopia: ${reason}`);
  await ghWriteJSON(token, `${dir}/backups/index.json`, arr => [...arr, { id, path, created_at: now.toISOString(), reason, by: (typeof settings !== "undefined" && settings.userName) || null, counts }], `Säkerhetskopia: ${reason}`);
}
async function l3piCommit(d) {
  const L = l3pi.last; if (!L || l3pi.busy) return; l3pi.busy = true; const go = d.querySelector("[data-pigo]"); go.disabled = true; const sum = d.querySelector("#v3PiSum"); sum.innerHTML = `<i class="pm-spin"></i> Sparar…`;
  try {
    await l3piBackup(L.rows, `Före import av ${l3pi.pp.fileName} (3D-editorn: ${L.m.nNew} nya, ${L.m.nUpd} uppdateras)`);
    const by = new Map(L.m.changed.map(r => [r.id, r])), fresh = L.m.changed.filter(r => !L.rows.some(x => x.id === r.id));
    await ghWriteJSON(token, `${l3piDir()}/plan_items.json`, arr => { const next = arr.map(r => by.get(r.id) || r), have = new Set(arr.map(r => r.id)); fresh.forEach(r => { if (!have.has(r.id)) next.push(r); }); return next; }, `Importera Powerproject (${L.m.nNew} nya, ${L.m.nUpd} uppdateras) från 3D-editorn`);
    try { const S = l3piSaved(), key = typeof ppOptsKey === "function" ? ppOptsKey() : null; if (key) { const off = l3pi.pp.groups.filter(g => !L.o.groups.has(g.id)).map(g => g.name); localStorage.setItem(key, JSON.stringify({ ...S, off, res: L.o.resources })); } } catch (e) { /* valen kommer inte ihåg */ }
    l3pl.rows = null; l3pl.xrows = null; await l3plLoad(true); if (typeof l3bRecolor === "function") l3bRecolor(); l3Render();
    l3DlgClose("v3PpImp"); l3Toast(`Powerproject importerad: ${L.m.nNew} nya och ${L.m.nUpd} uppdaterade aktiviteter. Säkerhetskopia finns i 4D-planering.`); l3Status(`Powerproject importerad (${L.m.nNew} nya, ${L.m.nUpd} uppdaterade).`);
  } catch (e) { console.error(e); sum.textContent = "Importen misslyckades: " + e.message; go.disabled = false; } finally { l3pi.busy = false; }
}
