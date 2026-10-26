/* Framdrift direkt i 3D-vyns sidomeny (Victor 2026-10-25: "uppdatera framdriften på objekten direkt i 3d-vyn … synkas vidare till gantten och gantten i TC").
   Ett reglage (0–100 %, steg 5) under kopplade objekt – både etableringsobjekt och IFC-objekt i byggnaden. "Spara" skickar till 4D-planeringen,
   som sparar precis som reglaget i aktivitetslistan (samma aktivitet och dess delposter, samma historik) – därifrån följer Gantten och Trimble Connect med. */
function l3ProgHtml(list) {
  const rows = [...new Map((list || []).filter(Boolean).map(r => [r.id, r])).values()]; if (!rows.length) return "";
  const vals = rows.map(r => Math.max(0, Math.min(100, Math.round(Number(r.progress) || 0)))), v0 = vals[0], same = vals.every(x => x === v0);
  const esc = typeof escHtml === "function" ? escHtml : String, name = rows.length === 1 ? (rows[0].activity || rows[0].object_name || "aktiviteten") : `${rows.length} aktiviteter`;
  return `<div class="v3-prog" data-ids="${esc(rows.map(r => r.id).join(","))}" data-v0="${same ? v0 : ""}"><div class="v3-prog-h"><span>Framdrift – ${esc(name)}</span><b class="v3-prog-v">${same ? v0 + " %" : "olika"}</b></div>
    <input type="range" class="v3-prog-sl" min="0" max="100" step="5" value="${same ? v0 : 0}" style="--p:${same ? v0 : 0}%" aria-label="Framdrift" />
    <div class="v3-prog-b hidden"><button type="button" class="v3-prog-save v3-primary">Spara framdrift</button><button type="button" class="v3-prog-x" title="Ångra">✕</button></div>
    <div class="v3-prog-d"${rows.length > 1 ? " hidden" : ""} data-d0="${esc(String(rows[0].start_date || "").slice(0, 10))}" data-d1="${esc(String(rows[0].end_date || "").slice(0, 10))}"><span>Datum</span><input type="date" class="v3-prog-d0" value="${esc(String(rows[0].start_date || "").slice(0, 10))}" /><em>→</em><input type="date" class="v3-prog-d1" value="${esc(String(rows[0].end_date || "").slice(0, 10))}" /><button type="button" class="v3-prog-ds hidden">Spara</button></div></div>`;
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

document.addEventListener("input", e => { const i = e.target && e.target.closest && e.target.closest(".v3-prog-d0, .v3-prog-d1"); if (!i) return; const d = i.closest(".v3-prog-d"); d.querySelector(".v3-prog-ds").classList.toggle("hidden", d.querySelector(".v3-prog-d0").value === d.dataset.d0 && d.querySelector(".v3-prog-d1").value === d.dataset.d1); });
document.addEventListener("click", async e => {
  const b = e.target && e.target.closest && e.target.closest(".v3-prog-ds"); if (!b) return; const d = b.closest(".v3-prog-d"), box = d.closest(".v3-prog"), s0 = d.querySelector(".v3-prog-d0").value, s1 = d.querySelector(".v3-prog-d1").value;
  if (s0 && s1 && s1 < s0) { if (typeof l3Status === "function") l3Status("Slutdatumet kan inte ligga före startdatumet.", true); return; }
  b.disabled = true;
  try {
    const r = await askOpener("setDates", { ids: box.dataset.ids.split(","), start: s0 || null, end: s1 || null }, 60000), upd = new Set((r && r.ids) || box.dataset.ids.split(","));
    (typeof items !== "undefined" ? items : []).forEach(it => { if (upd.has(it.id)) { if (s0) it.start_date = s0; if (s1) it.end_date = s1; } });
    d.dataset.d0 = s0; d.dataset.d1 = s1; b.classList.add("hidden");
    const msg = `Datum ${s0 || "?"} → ${s1 || "?"} sparade – följer med till Gantten.`; if (typeof l3Toast === "function") l3Toast(msg); if (typeof l3Status === "function") l3Status(msg); if (typeof l3Render === "function") l3Render();
  } catch (er) { if (typeof l3Status === "function") l3Status("Kunde inte spara datumen: " + er.message, true); }
  b.disabled = false;
});
