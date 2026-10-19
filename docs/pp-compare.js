/* Jämför två Powerproject-tidplaner (Victor 2026-10-19: "jag väljer två pp-filer och du tar fram infon").
   Läser båda filerna med samma läsare som importen, känner igen aktiviteterna (id, GUID, annars samma namn) och bygger samma
   rapport som importgranskningen: nya datum (största förskjutning först), ändrad framdrift, utan uppdaterad framdrift, namnbyten,
   nya aktiviteter och sådana som inte finns i den nyare filen. Inget sparas i databasen – rapporten laddas ner som en HTML-sida. */
function ppCompareItems(pp) {
  return ppToParsedItems(pp, { groups: new Set(pp.tasks.map(t => t.top)), areaOff: new Set(), areaLib: null, contractorLib: null, resources: false });
}
function ppCompareMatch(A, B) {
  const norm = t => String(t || "").trim().toLowerCase().replace(/\s+/g, " "), out = new Map(), taken = new Set();
  const byId = new Map(), byGuid = new Map(); A.forEach(a => { if (!byId.has(a.ppId)) byId.set(a.ppId, a); if (a.ppGuid && !byGuid.has(a.ppGuid)) byGuid.set(a.ppGuid, a); });
  const take = (b, a) => { out.set(b, a); taken.add(a); };
  B.forEach(b => { const a = byId.get(b.ppId); if (a && !taken.has(a)) take(b, a); });
  B.forEach(b => { if (out.has(b) || !b.ppGuid) return; const a = byGuid.get(b.ppGuid); if (a && !taken.has(a)) take(b, a); });
  const orph = new Map(); A.forEach(a => { if (taken.has(a)) return; const k = norm(a.objectName); (orph.get(k) || orph.set(k, []).get(k)).push(a); });
  const loose = new Map(); B.forEach(b => { if (out.has(b)) return; const k = norm(b.objectName); (loose.get(k) || loose.set(k, []).get(k)).push(b); });
  loose.forEach((list, k) => { const o = orph.get(k); if (list.length === 1 && o && o.length === 1) take(list[0], o[0]); });
  return out;
}
const ppCmpD = v => (v ? String(v).slice(0, 10) : "");
function ppCompareSheets(a, b, nameA, nameB) {
  const A = ppCompareItems(a), B = ppCompareItems(b), M = ppCompareMatch(A, B), used = new Set(M.values());
  const upd = [], ren = [], nya = [], gone = [];
  B.forEach(p => {
    const q = M.get(p);
    if (!q) { nya.push({ "Kod/namn": p.objectName, "Område": p.area, "Aktivitet": p.activity || "", "Typ": "", "Start": ppCmpD(p.startDate), "Slut": ppCmpD(p.endDate), "Framdrift %": p.progress ?? 0 }); return; }
    const ch = [];
    if (ppCmpD(q.startDate) !== ppCmpD(p.startDate) || ppCmpD(q.endDate) !== ppCmpD(p.endDate)) ch.push("Datum");
    if (Number(q.progress || 0) !== Number(p.progress || 0)) ch.push("Framdrift");
    if (q.objectName !== p.objectName || q.area !== p.area) { ch.push("Namn/område"); ren.push({ "Kod": "", "Område": p.area, "Gammalt namn": q.objectName + (q.area !== p.area ? ` (${q.area})` : ""), "Nytt namn": p.objectName, "Kopplade 3D-objekt": "" }); }
    upd.push({ "Ändrat": ch.length ? ch.join(", ") : "Ingen ändring", "Kod/namn": p.objectName, "Område": p.area, "Aktivitet": p.activity || "",
      "Start före": ppCmpD(q.startDate), "Start efter": ppCmpD(p.startDate), "Slut före": ppCmpD(q.endDate), "Slut efter": ppCmpD(p.endDate),
      "Framdrift % före": q.progress ?? 0, "Framdrift % efter": p.progress ?? 0, "Status före": "", "Status efter": "" });
  });
  A.forEach(q => { if (!used.has(q)) gone.push({ "Namn": q.objectName, "Område": q.area, "Aktivitet": q.activity || "", "3D-kopplade": "" }); });
  const changed = upd.filter(r => r["Ändrat"] !== "Ingen ändring").length;
  return [
    ["Sammanfattning", [
      { "Vad": "Nya objekt", "Antal": nya.length }, { "Vad": "Uppdateras", "Antal": upd.length }, { "Vad": "– varav med ändringar", "Antal": changed },
      { "Vad": "Finns inte kvar i filen", "Antal": gone.length }, { "Vad": "Objekt totalt i filen", "Antal": B.length },
    ]],
    ["Namnbyten", ren], ["Uppdateras", upd], ["Nya", nya], ["Finns inte kvar", gone],
  ];
}
function ppCompareHtml(a, b, nameA, nameB) {
  const html = planImportReportHtml(`${nameA} → ${nameB}`, ppCompareSheets(a, b, nameA, nameB), { title: "Jämförelse av tidplaner", compare: true, sub: `äldre: ${nameA} · nyare: ${nameB} · skapad ${new Date().toLocaleString("sv-SE")} – inget ändras i databasen` });
  return html;
}
async function ppCompareRun() {
  const st = document.getElementById("ppCmpStatus"), fa = document.getElementById("ppCmpA"), fb = document.getElementById("ppCmpB");
  const A = fa && fa.files && fa.files[0], B = fb && fb.files && fb.files[0];
  if (!A || !B) { st.innerText = "Välj båda filerna först – den äldre och den nyare."; return; }
  st.innerText = "Läser tidplanerna …";
  try {
    const [pa, pb] = [await parsePowerproject(await A.arrayBuffer(), A.name), await parsePowerproject(await B.arrayBuffer(), B.name)];
    if (!pa.tasks.length || !pb.tasks.length) { st.innerText = "Hittade inga aktiviteter med datum i " + (!pa.tasks.length ? A.name : B.name) + "."; return; }
    const html = ppCompareHtml(pa, pb, A.name, B.name), a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    a.download = `Jämförelse ${A.name.replace(/\.[^.]+$/, "")} → ${B.name.replace(/\.[^.]+$/, "")}.html`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    st.innerText = "Jämförelsen är nedladdad som HTML.";
  } catch (e) { console.error("Jämförelsen misslyckades", e); st.innerText = "Kunde inte jämföra: " + e.message; }
}
(function () { const b = document.getElementById("btnPpCmp"); if (b) b.onclick = ppCompareRun; })();
