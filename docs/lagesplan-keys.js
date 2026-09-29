/* Lägesplan – kortkommandon (Victors önskemål 2026-09-29).
   Varje funktion kan få en egen tangent (även med Shift/Ctrl/Alt).
   Tangenterna sparas per webbläsare. Esc, Enter och Ctrl+Z/Y är fasta. */

const KEYS_STORE = "lagesplan-shortcuts";
const clickEl = sel => () => { const el = typeof sel === "string" && sel[0] !== "[" ? $(sel) : document.querySelector(sel); if (el && !el.disabled) el.click(); };
const SHORTCUTS = [
  { group: "Mät och foton" },
  { id: "measureLen", label: "📏 Mät avstånd", key: "q", run: clickEl("btnMeasureLen"), btn: "btnMeasureLen" },
  { id: "measureArea", label: "⬠ Mät yta", key: "e", run: clickEl("btnMeasureArea"), btn: "btnMeasureArea" },
  { id: "photo", label: "📷 Lägg till foto", key: "p", run: clickEl("btnAddPhoto"), btn: "btnAddPhoto" },
  { group: "Etablering och noteringar" },
  { id: "note", label: "💬 Notering", key: "w", run: clickEl('[data-site="note"]'), btn: '[data-site="note"]' },
  { id: "crane", label: "🏗 Kran", key: "k", run: clickEl('[data-site="crane"]'), btn: '[data-site="crane"]' },
  { id: "shed", label: "🏠 Bod", key: "b", run: clickEl('[data-site="shed"]'), btn: '[data-site="shed"]' },
  { id: "storage", label: "📦 Upplag", key: "u", run: clickEl('[data-site="storage"]'), btn: '[data-site="storage"]' },
  { id: "gate", label: "🚪 Grind", key: "g", run: clickEl('[data-site="gate"]'), btn: '[data-site="gate"]' },
  { id: "fence", label: "〰 Stängsel", key: "s", run: clickEl('[data-site="fence"]'), btn: '[data-site="fence"]' },
  { id: "barrier", label: "⛔ Avspärrning", key: "a", run: clickEl('[data-site="barrier"]'), btn: '[data-site="barrier"]' },
  { id: "route", label: "➡ Transportväg", key: "t", run: clickEl('[data-site="route"]'), btn: '[data-site="route"]' },
  { id: "snap", label: "🧲 Fäst mot linjer på/av", key: "n", run: () => { const c = $("snapOn"); c.checked = !c.checked; c.dispatchEvent(new Event("change")); setSaveStatus(`🧲 Fäst mot linjer ${c.checked ? "på" : "av"}.`); } },
  { group: "Visning" },
  { id: "zoomIn", label: "Zooma in", key: "+", run: clickEl("btnZoomIn"), btn: "btnZoomIn" },
  { id: "zoomOut", label: "Zooma ut", key: "-", run: clickEl("btnZoomOut"), btn: "btnZoomOut" },
  { id: "fit", label: "⤢ Anpassa planen", key: "0", run: clickEl("btnFit"), btn: "btnFit" },
  { id: "menu", label: "Visa/dölj menyn", key: "m", run: () => setSideHidden(!$("layout").classList.contains("side-hidden")) },
  { id: "tabWork", label: "Fliken Planering", key: "1", run: () => showTab("work") },
  { id: "tabTime", label: "Fliken Tid & filter", key: "2", run: () => showTab("time") },
  { id: "tabZones", label: "Fliken Zoner & 3D", key: "3", run: () => showTab("zones") },
  { id: "tabExport", label: "Fliken Export", key: "4", run: () => showTab("export") },
  { group: "Tid och ortofoton" },
  { id: "play", label: "▶ Spela upp/pausa", key: " ", run: clickEl("btnPlay"), btn: "btnPlay" },
  { id: "dayBack", label: "Ett steg bakåt i tiden", key: ",", run: () => { if (plan) setDate(addDays($("dateInput").value || todayIso(), -stepDays())); } },
  { id: "dayFwd", label: "Ett steg framåt i tiden", key: ".", run: () => { if (plan) setDate(addDays($("dateInput").value || todayIso(), stepDays())); } },
  { id: "today", label: "Idag", key: "h", run: clickEl("btnToday"), btn: "btnToday" },
  { id: "orthoPrev", label: "◀ Föregående ortofoto", key: "[", run: clickEl("btnOrthoPrev"), btn: "btnOrthoPrev" },
  { id: "orthoNext", label: "▶ Nästa ortofoto", key: "]", run: clickEl("btnOrthoNext"), btn: "btnOrthoNext" },
  { id: "compare", label: "⇆ Jämför före/efter", key: "c", run: clickEl("btnCompare"), btn: "btnCompare" },
  { id: "film", label: "🎬 Framdriftsfilm", key: "", run: clickEl("btnOrthoFilm") },
  { group: "Övrigt" },
  { id: "help", label: "⌨ Visa kortkommandon", key: "?", run: () => openKeys() },
];
const SC = SHORTCUTS.filter(s => s.id);
let keyMap = {}; // id -> tangent ("" = ingen)
function loadKeys() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEYS_STORE) || "{}") || {}; } catch (e) {}
  keyMap = {};
  SC.forEach(s => { keyMap[s.id] = typeof saved[s.id] === "string" ? saved[s.id] : s.key; });
}
function saveKeys() {
  const diff = {};
  SC.forEach(s => { if (keyMap[s.id] !== s.key) diff[s.id] = keyMap[s.id]; });
  try { localStorage.setItem(KEYS_STORE, JSON.stringify(diff)); } catch (e) {}
}
/* Tangent från ett keydown-event, t.ex. "q", "shift+q", "ctrl+alt+k". Shift
   räknas inte för tecken som bara finns med Shift (?, +, …). */
function comboOf(e) {
  const k = e.key;
  if (["Shift", "Control", "Alt", "Meta", "CapsLock", "Dead"].includes(k)) return null;
  let key = k.length === 1 ? k.toLowerCase() : k;
  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push("ctrl");
  if (e.altKey) mods.push("alt");
  // Bokstäver och specialtangenter: Shift är en egen kombination. För tecken
  // som ?, + och ! ger tangentbordet redan rätt tecken.
  if (e.shiftKey && (k.length > 1 || k.toLowerCase() !== k.toUpperCase())) mods.push("shift");
  return mods.concat(key).join("+");
}
function keyLabel(combo) {
  if (!combo) return "";
  return combo.split("+").map(p => ({ ctrl: "Ctrl", alt: "Alt", shift: "Shift", " ": "Mellanslag", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" }[p] || (p.length === 1 ? p.toUpperCase() : p))).join(" + ");
}
/* Visar tangenten i knapparnas tips, t.ex. "Mät avstånd (Q)". */
function applyKeyTitles() {
  SC.filter(s => s.btn).forEach(s => {
    const el = s.btn[0] === "[" ? document.querySelector(s.btn) : $(s.btn);
    if (!el) return;
    if (el.dataset.baseTitle === undefined) el.dataset.baseTitle = el.title || "";
    const k = keyMap[s.id];
    el.title = el.dataset.baseTitle + (k ? `${el.dataset.baseTitle ? " " : ""}(${keyLabel(k)})` : "");
  });
}
function typingIn(e) {
  const t = e.target;
  return t && (t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName) && !(t.tagName === "INPUT" && /^(checkbox|range|button)$/.test(t.type)));
}
let keyCapture = null; // id som väntar på en ny tangent i dialogen
function onShortcutKey(e) {
  if (keyCapture) return;
  if (e.defaultPrevented || typingIn(e) || e.repeat) return;
  if (!$("filmModal").classList.contains("hidden") || !$("photoModal").classList.contains("hidden")) return;
  if (!$("keysModal").classList.contains("hidden")) { if (e.key === "Escape") closeKeys(); return; }
  const combo = comboOf(e);
  if (!combo || /^ctrl\+[zy]$/.test(combo)) return;
  const s = SC.find(x => keyMap[x.id] && keyMap[x.id] === combo);
  if (!s) return;
  e.preventDefault();
  s.run();
}

// ---------------------------------------------------------------------
// Dialogen
// ---------------------------------------------------------------------
function renderKeys() {
  const rows = SHORTCUTS.map(s => s.group ? `<div class="kg">${escHtml(s.group)}</div>` : `
    <div class="kr" data-id="${s.id}">
      <span>${escHtml(s.label)}</span>
      <button class="kb${keyCapture === s.id ? " wait" : ""}${keyMap[s.id] ? "" : " none"}" title="Klicka och tryck den nya tangenten">${keyCapture === s.id ? "Tryck en tangent…" : keyMap[s.id] ? escHtml(keyLabel(keyMap[s.id])) : "–"}</button>
      <button class="kx icon ghost" title="Ta bort tangenten"${keyMap[s.id] ? "" : " disabled"}>✕</button>
    </div>`).join("");
  $("keysList").innerHTML = rows;
  $("keysList").querySelectorAll(".kr").forEach(r => {
    const id = r.dataset.id;
    r.querySelector(".kb").onclick = () => { keyCapture = keyCapture === id ? null : id; $("keysMsg").textContent = keyCapture ? "Tryck den nya tangenten (Esc avbryter, Backsteg tar bort)." : ""; renderKeys(); };
    r.querySelector(".kx").onclick = () => { keyMap[id] = ""; saveKeys(); applyKeyTitles(); renderKeys(); };
  });
}
function onCaptureKey(e) {
  if (!keyCapture) return;
  e.preventDefault(); e.stopPropagation();
  const id = keyCapture;
  if (e.key === "Escape") { keyCapture = null; $("keysMsg").textContent = ""; renderKeys(); return; }
  if (e.key === "Backspace" || e.key === "Delete") { keyMap[id] = ""; keyCapture = null; $("keysMsg").textContent = ""; saveKeys(); applyKeyTitles(); renderKeys(); return; }
  const combo = comboOf(e);
  if (!combo) return;
  if (/^ctrl\+[zy]$/.test(combo) || combo === "Enter") { $("keysMsg").textContent = `${keyLabel(combo)} är reserverad.`; return; }
  const other = SC.find(x => x.id !== id && keyMap[x.id] === combo);
  if (other) keyMap[other.id] = "";
  keyMap[id] = combo;
  keyCapture = null;
  $("keysMsg").textContent = other ? `${keyLabel(combo)} flyttades från "${other.label}".` : "";
  saveKeys(); applyKeyTitles(); renderKeys();
}
function openKeys() { keyCapture = null; $("keysMsg").textContent = ""; renderKeys(); $("keysModal").classList.remove("hidden"); }
function closeKeys() { keyCapture = null; $("keysModal").classList.add("hidden"); }

function bindKeys() {
  loadKeys();
  applyKeyTitles();
  window.addEventListener("keydown", onCaptureKey, true);
  window.addEventListener("keydown", onShortcutKey);
  $("btnKeys").onclick = openKeys;
  $("btnKeysClose").onclick = closeKeys;
  $("btnKeysReset").onclick = () => {
    if (!confirm("Återställa alla kortkommandon till standard?")) return;
    SC.forEach(s => { keyMap[s.id] = s.key; });
    saveKeys(); applyKeyTitles(); renderKeys();
    $("keysMsg").textContent = "Standardtangenterna är återställda.";
  };
  $("keysModal").addEventListener("mousedown", e => { if (e.target === $("keysModal")) closeKeys(); });
}
bindKeys();
