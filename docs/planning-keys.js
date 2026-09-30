/* 4D-planering – kortkommandon (Victors önskemål 2026-09-30), samma upplägg
   som i Lägesplan: varje funktion kan få en egen tangent (även med Shift/
   Ctrl/Alt), tangenterna sparas per webbläsare. Fasta: Ctrl+Z / Ctrl+Y
   (ångra/gör om), Esc (stäng/avbryt) och Enter. Kortkommandona gäller inte
   medan man skriver i ett fält. */

const PK_STORE = "4dplan-shortcuts";
const pkClick = id => () => { const el = document.getElementById(id); if (el && !el.disabled) { if (typeof revealElement === "function") revealElement(el); el.click(); } };
function pkShiftDay(days) {
  const inp = document.getElementById("timelineDate");
  const d = new Date((inp.value || new Date().toISOString().slice(0, 10)) + "T12:00:00");
  d.setDate(d.getDate() + days);
  inp.value = d.toISOString().slice(0, 10);
  inp.dispatchEvent(new Event("change"));
}
function pkEditSelected() {
  const sel = items.filter(it => selectedItemKeys.has(it.objectId));
  const keys = new Set(sel.map(it => activityKeyOf(it) || `i:${it.id}`));
  if (sel.length && keys.size === 1) { editItemFromList(sel.find(it => !it.modelId) || sel[0]); return; }
  if (sel.length > 1) { pkClick("btnEditSelected")(); return; }
  if (typeof showUndoToast === "function") showUndoToast("Markera en aktivitet i listan först.", false);
}
const PK_SHORTCUTS = [
  { group: "Planera" },
  { id: "newActivity", label: "＋ Ny aktivitet", key: "n", run: pkClick("btnNewActivity"), btn: "btnNewActivity" },
  { id: "couple", label: "Koppla markerade objekt i 3D", key: "k", run: pkClick("btnLinkSelection"), btn: "btnLinkSelection" },
  { id: "edit", label: "✏️ Redigera markerad aktivitet", key: "e", run: pkEditSelected },
  { id: "delete", label: "🗑 Radera markerade (frågar först)", key: "Delete", run: pkClick("btnDeleteSelected"), btn: "btnDeleteSelected" },
  { id: "labels", label: "🏷 Namn i 3D för markerade", key: "l", run: pkClick("btnShowLabels"), btn: "btnShowLabels" },
  { group: "Listan" },
  { id: "search", label: "Sök i listan", key: "/", run: () => { showTab("plan"); const s = document.getElementById("itemSearch"); s.focus(); s.select(); } },
  { id: "filter", label: "Filter ▾", key: "f", run: pkClick("btnListFilter"), btn: "btnListFilter" },
  { id: "collapse", label: "⊟ Fäll ihop alla grupper", key: "c", run: pkClick("btnCollapseAllGroups") },
  { id: "models", label: "💡 Tänd kopplade modeller/markeringar", key: "m", run: pkClick("btnLoadCoupledModels") },
  { id: "refresh", label: "↻ Hämta senaste data", key: "r", run: pkClick("btnRefresh"), btn: "btnRefresh" },
  { group: "Flikar" },
  { id: "tabPlan", label: "📋 Planera", key: "1", run: () => showTab("plan") },
  { id: "tabTime", label: "⏱ Tidslinje", key: "2", run: () => showTab("time") },
  { id: "tabTools", label: "🧰 Import & verktyg", key: "3", run: () => showTab("tools") },
  { group: "Tidslinje" },
  { id: "play", label: "▶ Spela upp/pausa", key: " ", run: pkClick("btnPlay"), btn: "btnPlay" },
  { id: "dayBack", label: "En dag bakåt", key: ",", run: () => pkShiftDay(-1) },
  { id: "dayFwd", label: "En dag framåt", key: ".", run: () => pkShiftDay(1) },
  { id: "weekBack", label: "En vecka bakåt", key: "shift+ArrowLeft", run: () => pkShiftDay(-7) },
  { id: "weekFwd", label: "En vecka framåt", key: "shift+ArrowRight", run: () => pkShiftDay(7) },
  { id: "today", label: "Idag", key: "h", run: () => { const inp = document.getElementById("timelineDate"); inp.value = new Date().toISOString().slice(0, 10); inp.dispatchEvent(new Event("change")); } },
  { group: "Övrigt" },
  { id: "help", label: "⌨ Visa kortkommandon", key: "?", run: () => openPlanKeys() },
];
const PK = PK_SHORTCUTS.filter(s => s.id);
let pkMap = {};
function pkLoad() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(PK_STORE) || "{}") || {}; } catch (e) {}
  pkMap = {};
  PK.forEach(s => { pkMap[s.id] = typeof saved[s.id] === "string" ? saved[s.id] : s.key; });
}
function pkSave() {
  const diff = {};
  PK.forEach(s => { if (pkMap[s.id] !== s.key) diff[s.id] = pkMap[s.id]; });
  try { localStorage.setItem(PK_STORE, JSON.stringify(diff)); } catch (e) {}
}
function pkCombo(e) {
  const k = e.key;
  if (["Shift", "Control", "Alt", "Meta", "CapsLock", "Dead"].includes(k)) return null;
  const key = k.length === 1 ? k.toLowerCase() : k;
  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push("ctrl");
  if (e.altKey) mods.push("alt");
  if (e.shiftKey && (k.length > 1 || k.toLowerCase() !== k.toUpperCase())) mods.push("shift");
  return mods.concat(key).join("+");
}
function pkLabel(combo) {
  if (!combo) return "";
  return combo.split("+").map(p => ({ ctrl: "Ctrl", alt: "Alt", shift: "Shift", " ": "Mellanslag", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Delete: "Delete" }[p] || (p.length === 1 ? p.toUpperCase() : p))).join(" + ");
}
function pkApplyTitles() {
  PK.filter(s => s.btn).forEach(s => {
    const el = document.getElementById(s.btn);
    if (!el) return;
    if (el.dataset.baseTitle === undefined) el.dataset.baseTitle = el.title || "";
    const k = pkMap[s.id];
    el.title = el.dataset.baseTitle + (k ? `${el.dataset.baseTitle ? " " : ""}(${pkLabel(k)})` : "");
  });
}
function pkTyping(e) {
  const t = e.target;
  return t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) && !(t.tagName === "INPUT" && /^(checkbox|range|button)$/.test(t.type)));
}
function pkAnyDialogOpen() {
  return [...document.querySelectorAll(".dialog, #linkForm")].some(d => !d.classList.contains("hidden") && d.id !== "planKeysDialog");
}
let pkCapture = null;
function pkOnKey(e) {
  if (pkCapture || e.defaultPrevented || pkTyping(e) || e.repeat) return;
  const dlg = document.getElementById("planKeysDialog");
  if (dlg && !dlg.classList.contains("hidden")) { if (e.key === "Escape") closePlanKeys(); return; }
  const gate = document.getElementById("accessGate");
  if (pkAnyDialogOpen() || (gate && getComputedStyle(gate).display !== "none")) return;
  const combo = pkCombo(e);
  if (!combo || /^ctrl\+(z|y|shift\+z)$/.test(combo)) return;
  const s = PK.find(x => pkMap[x.id] && pkMap[x.id] === combo);
  if (!s) return;
  e.preventDefault();
  s.run();
}
function pkRender() {
  const list = document.getElementById("planKeysList");
  list.innerHTML = PK_SHORTCUTS.map(s => s.group ? `<div class="kg">${escapeHtml(s.group)}</div>` : `
    <div class="kr" data-id="${s.id}">
      <span>${escapeHtml(s.label)}</span>
      <button type="button" class="kb${pkCapture === s.id ? " wait" : ""}${pkMap[s.id] ? "" : " none"}" title="Klicka och tryck den nya tangenten">${pkCapture === s.id ? "Tryck en tangent…" : pkMap[s.id] ? escapeHtml(pkLabel(pkMap[s.id])) : "–"}</button>
      <button type="button" class="kx" title="Ta bort tangenten"${pkMap[s.id] ? "" : " disabled"}>✕</button>
    </div>`).join("") + `<div class="kg">Fasta</div>
    <div class="kr"><span>↶ Ångra / ↷ Gör om</span><span class="kb fixed">Ctrl + Z / Ctrl + Y</span></div>
    <div class="kr"><span>Stäng formulär, menyer och dialoger</span><span class="kb fixed">Esc</span></div>`;
  list.querySelectorAll(".kr[data-id]").forEach(r => {
    const id = r.dataset.id;
    r.querySelector(".kb").onclick = () => { pkCapture = pkCapture === id ? null : id; document.getElementById("planKeysMsg").textContent = pkCapture ? "Tryck den nya tangenten (Esc avbryter, Backsteg tar bort)." : ""; pkRender(); };
    r.querySelector(".kx").onclick = () => { pkMap[id] = ""; pkSave(); pkApplyTitles(); pkRender(); };
  });
}
function pkOnCapture(e) {
  if (!pkCapture) return;
  e.preventDefault(); e.stopPropagation();
  const id = pkCapture, msg = document.getElementById("planKeysMsg");
  if (e.key === "Escape") { pkCapture = null; msg.textContent = ""; pkRender(); return; }
  if (e.key === "Backspace") { pkMap[id] = ""; pkCapture = null; msg.textContent = ""; pkSave(); pkApplyTitles(); pkRender(); return; }
  const combo = pkCombo(e);
  if (!combo) return;
  if (/^ctrl\+(z|y|shift\+z)$/.test(combo) || combo === "Enter" || combo === "Escape") { msg.textContent = `${pkLabel(combo)} är reserverad.`; return; }
  const other = PK.find(x => x.id !== id && pkMap[x.id] === combo);
  if (other) pkMap[other.id] = "";
  pkMap[id] = combo;
  pkCapture = null;
  msg.textContent = other ? `${pkLabel(combo)} flyttades från "${other.label}".` : "";
  pkSave(); pkApplyTitles(); pkRender();
}
function openPlanKeys() { pkCapture = null; document.getElementById("planKeysMsg").textContent = ""; pkRender(); document.getElementById("planKeysDialog").classList.remove("hidden"); }
function closePlanKeys() { pkCapture = null; document.getElementById("planKeysDialog").classList.add("hidden"); }

function bindPlanKeys() {
  pkLoad();
  pkApplyTitles();
  window.addEventListener("keydown", pkOnCapture, true);
  window.addEventListener("keydown", pkOnKey);
  document.getElementById("btnPlanKeys").onclick = openPlanKeys;
  const s = document.getElementById("btnPlanKeysSettings");
  if (s) s.onclick = () => { toggle("settingsDialog", false); openPlanKeys(); };
  document.getElementById("btnPlanKeysClose").onclick = closePlanKeys;
  document.getElementById("btnPlanKeysReset").onclick = () => {
    if (!confirm("Återställa alla kortkommandon till standard?")) return;
    PK.forEach(x => { pkMap[x.id] = x.key; });
    pkSave(); pkApplyTitles(); pkRender();
    document.getElementById("planKeysMsg").textContent = "Standardtangenterna är återställda.";
  };
}
document.addEventListener("DOMContentLoaded", bindPlanKeys);
