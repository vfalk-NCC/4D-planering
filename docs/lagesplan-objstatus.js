/* Lägesplan – sätt status på prickarna direkt i planen (Victor 2026-10-19: "jag är dålig på att följa upp min excel-planering,
   men jag vill kunna följa upp prickarna … ändra status/färg direkt i lägesplanen").

   Högerklick på en prick -> Status: Ej påbörjad / Pågår / Klar / Pausad / Framdrift … %. Gäller objektet (eller objekten på
   samma plats), eller hela aktiviteten. Skrivs till plan_items.json (samma fält som framdriften från lagbrickan: progress, status,
   verkligt start/slut) och prickens färg följer direkt via den vanliga statusregeln. Det senaste kan ångras (↩ i menyn). */

let objStatusScopeAll = false;                 // false = bara objekten här, true = hela aktiviteten
const objStatusUndoStack = [];                 // [{ label, before: Map(id -> rad före) }]

function objStatusPatch(state, pct, day) {
  const now = new Date().toISOString();
  return r => {
    const out = { ...r, updated_at: now };
    if (state === "klar") Object.assign(out, { progress: 100, status: "klar", actual_start_date: r.actual_start_date || day, actual_end_date: r.actual_end_date || day });
    else if (state === "pagaende") { const p = Math.max(1, Math.min(99, Math.round(Number(pct) || 50))); Object.assign(out, { progress: p, status: "pagaende", actual_start_date: r.actual_start_date || day, actual_end_date: null }); }
    else if (state === "pausad") Object.assign(out, { status: "pausad" });
    else if (state === "ej") Object.assign(out, { progress: 0, status: "planerad", actual_start_date: null, actual_end_date: null });
    else if (state === "pct") { const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0))); return objStatusPatch(p >= 100 ? "klar" : p > 0 ? "pagaende" : "ej", p, day)(r); }
    return out;
  };
}
const OBJ_STATE_LABEL = { klar: "Klar", pagaende: "Pågår", pausad: "Pausad", ej: "Ej påbörjad", pct: "Framdrift" };

/* Sätter status på raderna (lokalt direkt, sedan till 4D-data). Returnerar antal rader. */
async function objSetStatus(rows, state, pct) {
  if (!rows.length) return 0;
  const d = (typeof curDay === "function" ? curDay() : ($("dateInput") && $("dateInput").value) || todayIso()), today = todayIso(), day = d < today ? d : today;
  const patch = objStatusPatch(state, pct, day), ids = new Set(rows.map(r => r.id));
  const before = new Map(rows.map(r => [r.id, { ...r }]));
  rows.forEach(r => Object.assign(r, patch(r)));
  const name = (typeof famName === "function" ? famName(rows[0]) : rows[0].object_name || rows[0].activity || "objekt");
  const label = `${OBJ_STATE_LABEL[state]}${state === "pct" ? ` ${pct} %` : ""} – ${rows.length > 1 ? `${rows.length} objekt` : name}`;
  objStatusUndoStack.push({ label, before });
  if (typeof renderZones === "function") renderZones();
  setSaveStatus(`Sparar: ${label} …`);
  try {
    await ghWriteJSON(token, dataPath("plan_items.json"), arr => (Array.isArray(arr) ? arr : []).map(r => ids.has(r.id) ? patch(r) : r), `Lägesplan: ${label}`);
    setSaveStatus(`✓ ${label}. Uppdatera (↻) i 4D-planering för att se det där.`);
  } catch (e) {
    rows.forEach(r => Object.assign(r, before.get(r.id))); objStatusUndoStack.pop();
    if (typeof renderZones === "function") renderZones();
    setSaveStatus("⚠ Kunde inte spara statusen: " + e.message);
    return 0;
  }
  return rows.length;
}
async function objStatusUndo() {
  const u = objStatusUndoStack.pop(); if (!u) return;
  const rows = [...u.before.keys()].map(id => items.find(r => r.id === id)).filter(Boolean);
  rows.forEach(r => Object.assign(r, u.before.get(r.id)));
  if (typeof renderZones === "function") renderZones();
  try {
    await ghWriteJSON(token, dataPath("plan_items.json"), arr => (Array.isArray(arr) ? arr : []).map(r => u.before.has(r.id) ? { ...u.before.get(r.id) } : r), `Lägesplan: ångra ${u.label}`);
    setSaveStatus(`↩ Ångrade: ${u.label}`);
  } catch (e) { setSaveStatus("⚠ Kunde inte ångra: " + e.message); }
}

/* Menyraderna (läggs överst i högerklicksmenyn på en prick). */
function objStatusMenuHtml(its) {
  const fams = new Set(its.map(objFamKey)), famN = items.filter(x => fams.has(objFamKey(x))).length, many = famN > its.length;
  const ph = typeof computeItemPhase === "function" ? computeItemPhase(its[0], $("dateInput").value || todayIso(), Number.isFinite(settings.warningDaysBeforeEnd) ? settings.warningDaysBeforeEnd : 7) : null;
  const dot = c => `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c};margin-right:6px;"></i>`;
  const col = k => dot(phaseColor(k));
  return `<div class="om-st"><div class="om-st-h">Status${ph ? ` nu: ${escHtml((PHASE_LABELS || {})[ph] || ph)}` : ""} · ${Math.round(Number(its[0].progress) || 0)} %</div>
    <div class="om-st-b"><button type="button" data-ost="ej">${col("planerad")}Ej påbörjad</button><button type="button" data-ost="pagaende">${col("pagaende")}Pågår</button><button type="button" data-ost="klar">${col("klar")}Klar</button><button type="button" data-ost="pausad">${col("pausad")}Pausad</button><button type="button" data-ost="pct">% …</button></div>
    ${many ? `<label class="om-st-s"><input type="checkbox" data-ost-all${objStatusScopeAll ? " checked" : ""}> Hela aktiviteten (${famN} objekt), inte bara ${its.length > 1 ? "de " + its.length + " här" : "det här"}</label>` : ""}
    ${objStatusUndoStack.length ? `<button type="button" data-ost="undo" class="om-st-u">↩ Ångra: ${escHtml(objStatusUndoStack[objStatusUndoStack.length - 1].label)}</button>` : ""}</div>`;
}
function objStatusBind(m, its) {
  const close = () => m.classList.add("hidden");
  const all = m.querySelector("[data-ost-all]"); if (all) all.onchange = () => { objStatusScopeAll = all.checked; };
  m.querySelectorAll("[data-ost]").forEach(b => { b.onclick = async () => {
    const k = b.dataset.ost; close();
    if (k === "undo") return objStatusUndo();
    const fams = new Set(its.map(objFamKey)), rows = objStatusScopeAll ? items.filter(x => fams.has(objFamKey(x))) : its;
    let pct = null;
    if (k === "pct" || k === "pagaende") {
      const a = await uiPrompt(k === "pct" ? "Framdrift i procent (0–100):" : "Hur många procent är klart? (1–99)", String(Math.round(Number(its[0].progress) || (k === "pagaende" ? 50 : 0))));
      if (a === null || a === undefined || String(a).trim() === "") return;
      pct = Number(String(a).replace(",", ".").replace("%", ""));
      if (!isFinite(pct)) { setSaveStatus("Ogiltig procentsats."); return; }
    }
    await objSetStatus(rows, k === "pagaende" && pct === null ? "pagaende" : k, pct);
  }; });
}
