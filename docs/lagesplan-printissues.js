/* Utgåvor av utskriftslayouten (Victor 2026-11-02): mallen är bara layouten, men det man sparar varje vecka är en *utgåva* – ett daterat, namngivet läge med anteckning och vem som sparade den,
   så att man kan gå tillbaka och se exakt vad som skickades ut (spårbarhet).
   • "Spara layout" = uppdaterar mallen (som förut).
   • "Spara utgåva…" = lägger ett nytt, oföränderligt ögonblicksbild-läge i historiken (egen fil print_issues.json, så projektets lagerfil inte växer).
   • Utgåvan innehåller layouten, planeringsdatumet, veckonummer, anteckning och vem/när. Öppna en utgåva = den läses in som arbetskopia (ändrar inte mallen förrän du sparar layouten).
   • Valfritt: spara en utgåva automatiskt varje gång en PDF skapas. */
const prIs = { list: null, loading: null, form: false, auto: false };
try { prIs.auto = localStorage.getItem("lagesplan-printautoissue") === "1"; } catch (e) { /* utan lagring */ }
const prIsPath = () => dataPath("print_issues.json");
const prIsWeek = d => { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 86400000 + 1) / 7); };
const prIsEsc = s => (typeof escHtml === "function" ? escHtml(String(s == null ? "" : s)) : String(s == null ? "" : s));
async function prIsLoad(force) {
  if (prIs.list && !force) return prIs.list; if (prIs.loading) return prIs.loading;
  prIs.loading = (async () => { try { const a = await ghReadJSON(token, prIsPath(), force ? { fresh: true } : undefined); prIs.list = Array.isArray(a) ? a : []; } catch (e) { console.warn("Utgåvor kunde inte läsas", e); prIs.list = prIs.list || []; } finally { prIs.loading = null; } prIsRender(); return prIs.list; })();
  return prIs.loading;
}
/* Layouten som sparas (samma rensning av lagerläge som när mallen sparas). */
function prIsSnapshot() { const t = pr.tpl; return JSON.parse(JSON.stringify({ ...t, elements: t.elements.map(e => e.type === "map" && e.layers && e.layers.state && typeof prStateForSave === "function" ? { ...e, layers: { ...e.layers, state: prStateForSave(e.layers.state) } } : e) })); }
const prIsForTpl = () => (prIs.list || []).filter(x => x.tplId === (pr && pr.tpl.id)).sort((a, b) => (a.at < b.at ? 1 : -1));
async function prIssueSave(name, note, auto) {
  if (!pr) return null; const now = new Date(), day = ($("dateInput") && $("dateInput").value) || now.toISOString().slice(0, 10), mine = prIsForTpl();
  const base = (name || "").trim() || `Vecka ${prIsWeek(new Date(day + "T12:00:00"))} – ${day}`; let nm = base, n = 2; while (mine.some(x => x.name === nm)) nm = `${base} (${n++})`;
  const rec = { id: ghNewId(), tplId: pr.tpl.id, tplName: pr.tpl.name || "Mall", name: nm, rev: mine.length + 1, note: (note || "").trim(), at: now.toISOString(), by: (typeof settings !== "undefined" && settings.userName) || "", planDate: day, week: prIsWeek(new Date(day + "T12:00:00")), auto: !!auto, format: pr.tpl.format, tpl: prIsSnapshot() };
  await prIsLoad(); prIs.list = [rec, ...prIs.list]; prIsRender();
  try { await ghWriteJSON(token, prIsPath(), arr => [rec, ...(Array.isArray(arr) ? arr : []).filter(x => x.id !== rec.id)].slice(0, 120), `Utskriftslayout: utgåva ${rec.name}`); setPrintStatus(`✓ Utgåva "${rec.name}" (utg. ${rec.rev}) sparad${auto ? " tillsammans med PDF:en" : ""}.`); }
  catch (e) { prIs.list = prIs.list.filter(x => x.id !== rec.id); prIsRender(); setPrintStatus("⚠ Kunde inte spara utgåvan: " + e.message); return null; }
  return rec;
}
async function prIssueOpen(id) {
  const r = (prIs.list || []).find(x => x.id === id); if (!r || !pr) return;
  if (pr.dirty && !(await uiConfirm("Det finns osparade ändringar i layouten. Läsa in utgåvan ändå?", { ok: "Läs in utgåvan" }))) return;
  prLayersDetach(); pr = { ...pr, tpl: migrateTpl(JSON.parse(JSON.stringify({ ...r.tpl, id: pr.tpl.id }))), saved: false, sels: [], dirty: true, undo: [], redo: [], panMode: false, fmtAsk: null };
  if (pr.clip) pr.clip.n = 0; renderPrintPanel(); drawPrintPage(); setPrintStatus(`Utgåva "${r.name}" inläst som arbetskopia. Skapa PDF direkt, eller Spara layout om den ska bli mallen.`);
}
async function prIssueDelete(id) {
  const r = (prIs.list || []).find(x => x.id === id); if (!r || !(await uiConfirm(`Ta bort utgåvan "${r.name}" ur historiken? Det går inte att ångra.`, { ok: "Ta bort" }))) return;
  prIs.list = prIs.list.filter(x => x.id !== id); prIsRender();
  try { await ghWriteJSON(token, prIsPath(), arr => (Array.isArray(arr) ? arr : []).filter(x => x.id !== id), `Utskriftslayout: ta bort utgåva ${r.name}`); } catch (e) { prIs.list = [r, ...prIs.list]; prIsRender(); setPrintStatus("⚠ Kunde inte ta bort utgåvan: " + e.message); }
}
function prIsRender() {
  const host = document.getElementById("prIssuesBody"), cnt = document.getElementById("prIssuesCount"); if (!host || !pr) return; const list = prIsForTpl(), fmt = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("sv-SE") + " " + d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }); };
  if (cnt) cnt.textContent = prIs.list ? `(${list.length})` : "";
  const form = prIs.form ? `<div class="pr-is-form"><input type="text" id="prIsName" maxlength="60" placeholder="Namn (tomt = Vecka ${prIsWeek(new Date())} – datum)"><textarea id="prIsNote" rows="2" maxlength="300" placeholder="Anteckning – vad ändrades, vem fick den, varför …"></textarea><div class="row split"><button type="button" id="prIsOk" class="primary">📌 Spara utgåva</button><button type="button" id="prIsX">Avbryt</button></div></div>` : "";
  host.innerHTML = `<div class="hint" style="margin:0 0 6px;">En utgåva är ett daterat läge av layouten (t.ex. veckans utskick). Mallen ändras inte. Öppna en utgåva för att se eller skriva ut exakt det som skickades.</div>
    <div class="row split" style="margin-bottom:6px;">${prIs.form ? "" : `<button type="button" id="prIsNew" class="primary" title="Spara layouten som en ny, daterad utgåva i historiken">📌 Spara utgåva…</button>`}</div>${form}
    <label class="check" style="margin:2px 0 6px;" title="Varje gång du skapar en PDF sparas layouten också som en utgåva – full spårbarhet utan att du tänker på det"><input type="checkbox" id="prIsAuto" ${prIs.auto ? "checked" : ""}> Spara utgåva automatiskt när jag skapar PDF</label>
    ${list.length ? list.map(r => `<div class="pr-is-row"><div class="t"><b>${prIsEsc(r.name)}</b><span>Utg. ${r.rev}${r.auto ? " · automatisk" : ""} · ${prIsEsc(fmt(r.at))}${r.by ? " · " + prIsEsc(r.by) : ""} · planering ${prIsEsc(r.planDate || "")} · v.${r.week || ""}</span>${r.note ? `<em>${prIsEsc(r.note)}</em>` : ""}</div><div class="b"><button type="button" data-isopen="${prIsEsc(r.id)}" title="Läs in som arbetskopia">Öppna</button><button type="button" data-isdel="${prIsEsc(r.id)}" title="Ta bort ur historiken">🗑</button></div></div>`).join("") : `<div class="hint">${prIs.list ? "Inga utgåvor än för den här mallen." : "Läser historiken…"}</div>`}`;
  const q = s => host.querySelector(s); const nb = q("#prIsNew"); if (nb) nb.onclick = () => { prIs.form = true; prIsRender(); const i = q("#prIsName"); if (i) i.focus(); };
  const ok = q("#prIsOk"), x = q("#prIsX"); if (ok) ok.onclick = async () => { const nm = q("#prIsName").value, nt = q("#prIsNote").value; prIs.form = false; await prIssueSave(nm, nt, false); prIsRender(); }; if (x) x.onclick = () => { prIs.form = false; prIsRender(); };
  const au = q("#prIsAuto"); if (au) au.onchange = () => { prIs.auto = au.checked; try { localStorage.setItem("lagesplan-printautoissue", au.checked ? "1" : "0"); } catch (e) { /* utan lagring */ } };
  host.querySelectorAll("[data-isopen]").forEach(b => { b.onclick = () => prIssueOpen(b.dataset.isopen); }); host.querySelectorAll("[data-isdel]").forEach(b => { b.onclick = () => prIssueDelete(b.dataset.isdel); });
  ["keydown", "keyup"].forEach(t => host.querySelectorAll("input,textarea").forEach(i => i.addEventListener(t, e => e.stopPropagation())));
}
/* Hakar: rita listan när panelen ritas, och spara en utgåva efter varje lyckad PDF när det är valt. */
{ const rp = renderPrintPanel; renderPrintPanel = function () { rp.apply(this, arguments); if (pr) { if (!prIs.list) prIsLoad(); else prIsRender(); } }; }
{ const ex = exportPrintPdf; exportPrintPdf = async function () { const r = await ex.apply(this, arguments); if (prIs.auto && pr) { try { await prIssueSave("", "Sparad automatiskt när PDF skapades.", true); } catch (e) { /* statusraden visar felet */ } } return r; }; }
if (document.getElementById("prExport")) document.getElementById("prExport").onclick = exportPrintPdf;   // bindPrint() har redan kopplat den ursprungliga funktionen
