/* Skydd för lagerlistans mappar och visningsnamn (Victor 2026-11-09: "varför har mapparna försvunnit i lager?").
   Mapparna ligger i en delad post (layermeta) i projektets site_layers.json. Här sparas en lokal kopia i webbläsaren varje gång de lästs in, och
   – saknas mapparna när lagren läses in – erbjuds återställning från kopian. Misslyckas inläsningen av site_layers.json visas ett tydligt fel
   i stället för att listan bara blir tom. */
const LMB_KEY = () => "lagesplan-layermeta-backup-" + (typeof projectId !== "undefined" ? projectId : "");
const lmbGet = () => { try { const o = JSON.parse(localStorage.getItem(LMB_KEY()) || "null"); return o && o.meta ? o : null; } catch (e) { return null; } };
let lmbReadError = "";
(function lmbHook() {
  if (typeof loadSiteLayers !== "function") return;
  const orig = loadSiteLayers, gr = typeof ghReadJSON === "function" ? ghReadJSON : null;
  loadSiteLayers = async function () {
    lmbReadError = "";
    const w = console.warn; console.warn = function (...a) { if (String(a[0] || "").startsWith("Kunde inte läsa site_layers.json")) lmbReadError = String((a[1] && a[1].message) || a[1] || ""); return w.apply(console, a); };
    let r; try { r = await orig.apply(this, arguments); } finally { console.warn = w; }
    try { lmbCheck(); } catch (e) { console.warn("Mappkontroll", e); }
    return r;
  };
})();
function lmbCheck() {
  if (lmbReadError) { setSaveStatus(`⚠ Kunde inte läsa lagren (site_layers.json): ${lmbReadError}. Mappar och egna lager kan saknas – ladda om sidan. Inget har skrivits över.`); return; }
  const m = siteItems.find(x => x.id === META_ID), has = m && (m.folders || []).length, bk = lmbGet();
  if (has) { try { localStorage.setItem(LMB_KEY(), JSON.stringify({ at: new Date().toISOString(), meta: m })); } catch (e) { /* utan lagring */ } return; }
  if (bk && (bk.meta.folders || []).length) {
    const n = bk.meta.folders.length, when = String(bk.at || "").slice(0, 16).replace("T", " ");
    setTimeout(async () => { if (await uiConfirm(`Mapparna i lagerlistan (${n} st: ${bk.meta.folders.slice(0, 4).map(f => f.name).join(", ")}${n > 4 ? " …" : ""}) finns inte längre i projektet.\n\nDet finns en kopia i den här webbläsaren från ${when}. Återställa mapparna från kopian?`)) { await saveLayerMeta({ ...bk.meta, id: META_ID, type: "layermeta" }); setSaveStatus(`📁 ${n} mappar återställda från kopian (${when}).`); } }, 600);
  }
}
