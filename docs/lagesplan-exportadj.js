/* Justera exportpunkter (Victor 2026-11-13: "lägga kommentarer och ange vilken plushöjd punkterna ligger på vid export … markera flera samtidigt och ändra plushöjder").
   CAD-export → 3D-objekt → "✎ Justera höjder & kommentarer": alla punkter som exporten tar med (Powerproject-objekten och Excel-planeringens punkter som syns i vyn) i en tabell.
   Markera en eller flera (sök, markera alla som visas) och sätt plushöjd (absolut eller ± höjning) eller skriv en kommentar. Justeringarna sparas i projektet (arbetsytans data; rör inte planeringen) och gäller nästa DXF/IFC-export: IFC lägger cylindern på vald höjd, DXF lägger punkt och text på höjden, och kommentaren följer med som text och egenskap. Prefix exportAdj. */
/* Justeringarna sparas i arbetsytan (plan.exportAdj, samma sparning som planens övriga data i projektet – inte bara i webbläsaren), så arbetet finns kvar och delas mellan datorer.
   Äldre justeringar som sparats lokalt (webbläsaren) flyttas över första gången. */
const exportAdjLocalKey = () => `lagesplan-exportadj-${typeof projectId !== "undefined" ? projectId : ""}-${plan ? plan.id : ""}`;
function exportAdjAll() {
  if (!plan) return {};
  if (!plan.exportAdj) {
    let v = {}; try { v = JSON.parse(localStorage.getItem(exportAdjLocalKey()) || "{}") || {}; } catch (e) { v = {}; }
    plan.exportAdj = v;
    if (Object.keys(v).length && typeof schedulePlanSave === "function") { schedulePlanSave(); try { localStorage.removeItem(exportAdjLocalKey()); } catch (e) { /* privat läge */ } }
  }
  return plan.exportAdj;
}
function exportAdjSave() { if (plan && plan.exportAdj && !Object.keys(plan.exportAdj).length) delete plan.exportAdj; if (typeof schedulePlanSave === "function") schedulePlanSave(); }
/* Läggs på markeringarna i objExportMarkers(): zTop/zManual och adj.comment. */
function exportAdjApply(marks) {
  const A = exportAdjAll();
  marks.forEach(m => { const a = A[m.key]; if (!a) return; if (Number.isFinite(a.z)) { m.zTop = a.z; m.zManual = true; } if (a.comment) m.adj = { comment: a.comment }; });
}
function exportAdjSet(key, patch) {
  const A = exportAdjAll(), a = { ...(A[key] || {}), ...patch };
  if (!Number.isFinite(a.z)) delete a.z; if (!a.comment) delete a.comment;
  if (Object.keys(a).length) A[key] = a; else delete A[key];
}
function exportAdjOpen() {
  if (!plan) return;
  const old = document.getElementById("exportAdjDlg"); if (old) old.remove();
  const marks = objExportMarkers(), esc = escHtml, sel = new Set(); let q = "", onlyAdj = false;
  if (!marks.length) { alert("Inga punkter syns i vyn att justera (tänd objekten/Excel-planeringen och kontrollera filtret)."); return; }
  const ov = document.createElement("div"); ov.id = "exportAdjDlg"; ov.style.cssText = "position:fixed;inset:0;z-index:9800;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px";
  ov.innerHTML = `<div style="background:#fff;color:#0f172a;border-radius:14px;width:min(980px,100%);max-height:92vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.4);font:13px system-ui,sans-serif">
    <div style="padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b style="font-size:16px">Justera höjder &amp; kommentarer</b><span id="eaCount" style="color:#64748b"></span><span style="flex:1"></span><button type="button" id="eaClose">Stäng</button></div>
    <div style="padding:8px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;border-bottom:1px solid #e2e8f0"><input type="search" id="eaQ" placeholder="Sök namn, aktivitet, status…" style="flex:1;min-width:180px;padding:6px 10px;border:1px solid #cbd5e1;border-radius:8px"><label><input type="checkbox" id="eaOnly"> bara justerade</label>
      <button type="button" id="eaAll">Markera alla som visas</button><button type="button" id="eaNone">Avmarkera</button></div>
    <div id="eaBulk" style="padding:8px 16px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#f8fafc;border-bottom:1px solid #e2e8f0"><b id="eaSel">0 markerade</b>
      <label>Sätt höjd <input type="number" id="eaZ" step="0.1" style="width:90px"> m</label><button type="button" id="eaZSet">Sätt</button>
      <label>Höj/sänk <input type="number" id="eaDz" step="0.1" style="width:80px"> m</label><button type="button" id="eaDzSet">Tillämpa</button>
      <label>Kommentar <input type="text" id="eaC" style="width:200px"></label><button type="button" id="eaCSet">Sätt</button><button type="button" id="eaReset" title="Tillbaka till automatisk höjd (objektets högsta punkt) och ingen kommentar">Återställ markerade</button></div>
    <div style="overflow:auto;flex:1"><table id="eaT" style="border-collapse:collapse;width:100%"></table></div>
    <div style="padding:8px 16px;color:#64748b;font-size:12px;border-top:1px solid #e2e8f0">Automatisk höjd = objektets högsta punkt. En egen plushöjd och kommentar sparas i projektet (arbetsytans data) och följer med nästa DXF/IFC-export av 3D-objekten.</div></div>`;
  document.body.appendChild(ov);
  const $$ = s => ov.querySelector(s), fmt = v => (Math.round(v * 100) / 100).toLocaleString("sv-SE");
  const rows = () => marks.filter(m => {
    const A = exportAdjAll()[m.key]; if (onlyAdj && !A) return false; if (!q) return true;
    return `${m.name || ""} ${m.it.activity || ""} ${m.it.object_name || ""} ${PHASE_LABELS[m.ph] || m.ph} ${m.src}`.toLowerCase().includes(q);
  });
  const render = () => {
    const list = rows(), shown = list.slice(0, 300), A = exportAdjAll(), nAdj = Object.keys(A).filter(k => marks.some(m => m.key === k)).length;
    $$("#eaCount").textContent = `${marks.length} punkter · ${nAdj} justerade`; $$("#eaSel").textContent = `${sel.size} markerade`;
    $$("#eaT").innerHTML = `<tr style="position:sticky;top:0;background:#f1f5f9;text-align:left"><th style="padding:6px 8px"></th><th>Namn</th><th>Källa</th><th>Status</th><th>X</th><th>Y</th><th>Auto-höjd</th><th>Plushöjd (m)</th><th>Kommentar</th></tr>` +
      shown.map(m => {
        const a = A[m.key] || {}, cur = Number.isFinite(a.z) ? a.z : "";
        return `<tr style="border-top:1px solid #eef2f7;${Object.keys(a).length ? "background:#fffbeb" : ""}"><td style="padding:4px 8px"><input type="checkbox" data-k="${esc(m.key)}" ${sel.has(m.key) ? "checked" : ""}></td><td>${esc(m.name || m.it.object_name || m.it.activity || "")}</td><td>${esc(m.src)}</td><td><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${m.color || phaseColor(m.ph)};margin-right:4px"></i>${esc(PHASE_LABELS[m.ph] || m.ph)}</td><td>${fmt(m.x)}</td><td>${fmt(m.y)}</td><td>${fmt(m.zAuto)}</td><td><input type="number" step="0.1" data-z="${esc(m.key)}" value="${cur}" placeholder="auto" style="width:84px"></td><td><input type="text" data-c="${esc(m.key)}" value="${esc(a.comment || "")}" style="width:100%;min-width:160px"></td></tr>`;
      }).join("") +
      (list.length > shown.length ? `<tr><td colspan="9" style="padding:8px;color:#64748b">Visar de första ${shown.length} av ${list.length} – sök för att hitta fler, eller markera alla som visas (gäller alla ${list.length}).</td></tr>` : "");
    $$("#eaT").querySelectorAll("[data-k]").forEach(c => { c.onchange = () => { if (c.checked) sel.add(c.dataset.k); else sel.delete(c.dataset.k); $$("#eaSel").textContent = `${sel.size} markerade`; }; });
    $$("#eaT").querySelectorAll("[data-z]").forEach(c => { c.onchange = () => { exportAdjSet(c.dataset.z, { z: c.value === "" ? NaN : Number(c.value) }); exportAdjSave(); render(); }; });
    $$("#eaT").querySelectorAll("[data-c]").forEach(c => { c.onchange = () => { exportAdjSet(c.dataset.c, { comment: c.value.trim() }); exportAdjSave(); render(); }; });
  };
  const targets = () => marks.filter(m => sel.has(m.key));
  $$("#eaQ").oninput = e => { q = e.target.value.trim().toLowerCase(); render(); };
  $$("#eaOnly").onchange = e => { onlyAdj = e.target.checked; render(); };
  $$("#eaAll").onclick = () => { rows().forEach(m => sel.add(m.key)); render(); };
  $$("#eaNone").onclick = () => { sel.clear(); render(); };
  $$("#eaZSet").onclick = () => { const v = Number($$("#eaZ").value); if ($$("#eaZ").value === "" || !Number.isFinite(v)) { alert("Skriv en höjd i meter."); return; } targets().forEach(m => exportAdjSet(m.key, { z: v })); exportAdjSave(); render(); };
  $$("#eaDzSet").onclick = () => { const d = Number($$("#eaDz").value); if ($$("#eaDz").value === "" || !Number.isFinite(d)) { alert("Skriv hur mycket (± m)."); return; } targets().forEach(m => { const A = exportAdjAll()[m.key]; exportAdjSet(m.key, { z: (A && Number.isFinite(A.z) ? A.z : m.zAuto) + d }); }); exportAdjSave(); render(); };
  $$("#eaCSet").onclick = () => { const c = $$("#eaC").value.trim(); targets().forEach(m => exportAdjSet(m.key, { comment: c })); exportAdjSave(); render(); };
  $$("#eaReset").onclick = () => { const A = exportAdjAll(); targets().forEach(m => { delete A[m.key]; }); exportAdjSave(); render(); };
  $$("#eaClose").onclick = () => ov.remove();
  ov.addEventListener("keydown", e => { if (e.key === "Escape") ov.remove(); });
  render();
}
document.addEventListener("DOMContentLoaded", () => { const b = document.getElementById("btnObjAdj"); if (b) b.onclick = exportAdjOpen; });
