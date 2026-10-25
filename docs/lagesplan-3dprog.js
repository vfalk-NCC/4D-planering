/* Framdrift direkt i 3D-vyns sidomeny (Victor 2026-10-25: "uppdatera framdriften på objekten direkt i 3d-vyn … synkas vidare till gantten och gantten i TC").
   Ett reglage (0–100 %, steg 5) under kopplade objekt – både etableringsobjekt och IFC-objekt i byggnaden. "Spara" skickar till 4D-planeringen,
   som sparar precis som reglaget i aktivitetslistan (samma aktivitet och dess delposter, samma historik) – därifrån följer Gantten och Trimble Connect med. */
function l3ProgHtml(list) {
  const rows = [...new Map((list || []).filter(Boolean).map(r => [r.id, r])).values()]; if (!rows.length) return "";
  const vals = rows.map(r => Math.max(0, Math.min(100, Math.round(Number(r.progress) || 0)))), v0 = vals[0], same = vals.every(x => x === v0);
  const esc = typeof escHtml === "function" ? escHtml : String, name = rows.length === 1 ? (rows[0].activity || rows[0].object_name || "aktiviteten") : `${rows.length} aktiviteter`;
  return `<div class="v3-prog" data-ids="${esc(rows.map(r => r.id).join(","))}" data-v0="${same ? v0 : ""}"><div class="v3-prog-h"><span>Framdrift – ${esc(name)}</span><b class="v3-prog-v">${same ? v0 + " %" : "olika"}</b></div>
    <input type="range" class="v3-prog-sl" min="0" max="100" step="5" value="${same ? v0 : 0}" style="--p:${same ? v0 : 0}%" aria-label="Framdrift" />
    <div class="v3-prog-b hidden"><button type="button" class="v3-prog-save v3-primary">Spara framdrift</button><button type="button" class="v3-prog-x" title="Ångra">✕</button></div></div>`;
}
document.addEventListener("input", e => {
  const sl = e.target && e.target.closest && e.target.closest(".v3-prog-sl"); if (!sl) return;
  const box = sl.closest(".v3-prog"); sl.style.setProperty("--p", sl.value + "%"); box.querySelector(".v3-prog-v").textContent = sl.value + " %"; box.querySelector(".v3-prog-b").classList.toggle("hidden", box.dataset.v0 !== "" && Number(sl.value) === Number(box.dataset.v0));
});
document.addEventListener("click", async e => {
  const t = e.target && e.target.closest ? e.target : null; if (!t) return;
  const box = t.closest(".v3-prog"); if (!box) return;
  if (t.closest(".v3-prog-x")) { const sl = box.querySelector(".v3-prog-sl"), v0 = box.dataset.v0; sl.value = v0 === "" ? 0 : v0; sl.dispatchEvent(new Event("input", { bubbles: true })); return; }
  if (!t.closest(".v3-prog-save")) return;
  const sl = box.querySelector(".v3-prog-sl"), v = Number(sl.value), ids = box.dataset.ids.split(","), btn = t.closest(".v3-prog-save"); btn.disabled = true;
  try {
    const r = await askOpener("setProgress", { ids, progress: v }, 60000), upd = new Set((r && r.ids) || ids);
    (typeof items !== "undefined" ? items : []).forEach(it => { if (upd.has(it.id)) it.progress = v; });
    box.dataset.v0 = String(v); box.querySelector(".v3-prog-b").classList.add("hidden");
    const msg = `Framdrift ${v} % sparad${upd.size > 1 ? ` (${upd.size} poster i aktiviteten)` : ""} – följer med till Gantten.`;
    if (typeof l3Toast === "function") l3Toast(msg); if (typeof l3Status === "function") l3Status(msg);
    if (typeof l3Render === "function") l3Render();
    if (typeof l3bubRefresh === "function") try { l3bubRefresh(); } catch (er) { /* bara visning */ }
  } catch (er) { if (typeof l3Status === "function") l3Status("Kunde inte spara framdriften: " + er.message, true); }
  btn.disabled = false;
});
