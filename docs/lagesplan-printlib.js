/* Lägesplan – bibliotek med symboler i utskriftslayouten (Victors önskemål
   2026-10-02): AED, WC-skyltar, stoppskyltar m.m. laddas upp en gång och
   läggs sedan in med ett klick. Biblioteket är gemensamt för alla projekt
   (library/print_symbols.json, bilderna i library/print/). */

const PRLIB_PATH = "library/print_symbols.json";
let prLib = null, prLibQ = "";

async function loadPrintLib(force) {
  if (prLib && !force) return prLib;
  try { const d = await ghReadJSON(token, PRLIB_PATH); prLib = Array.isArray(d) ? d : []; }
  catch (e) { prLib = []; }
  return prLib;
}
function renderPrintLib() {
  const box = $("prLibBody");
  if (!box) return;
  $("prLibCount").textContent = prLib && prLib.length ? `(${prLib.length})` : "";
  if (!prLib) { box.innerHTML = `<div class="hint">Laddar…</div>`; return; }
  const q = prLibQ.trim().toLowerCase();
  const list = prLib.filter(s => !q || `${s.name} ${s.cat || ""}`.toLowerCase().includes(q))
    .sort((a, b) => String(a.cat || "").localeCompare(String(b.cat || ""), "sv") || a.name.localeCompare(b.name, "sv", { numeric: true }));
  const cats = [...new Set(list.map(s => s.cat || ""))];
  const sel = typeof primary === "function" ? primary() : null;
  const canSave = sel && sel.type === "image" && sel.path && !prLib.some(s => s.path === sel.path);
  box.innerHTML = `${prLib.length > 8 ? `<input type="search" id="prLibQ" placeholder="Sök i biblioteket…" value="${escHtml(prLibQ)}" />` : ""}
    ${cats.map(c => `${cats.length > 1 || c ? `<div class="pr-lib-cat">${escHtml(c || "Övrigt")}</div>` : ""}<div class="pr-lib-grid">${list.filter(s => (s.cat || "") === c).map(s => `<button type="button" class="pr-lib-item" data-id="${escHtml(s.id)}" title="${escHtml(s.name)} – klicka för att lägga in"><span class="pr-lib-img" data-path="${escHtml(s.path)}"></span><span class="pr-lib-name">${escHtml(s.name)}</span><span class="pr-lib-del" data-del="${escHtml(s.id)}" title="Ta bort ur biblioteket">✕</span></button>`).join("")}</div>`).join("")
      || `<div class="hint">${prLib.length ? "Inga träffar." : "Biblioteket är tomt. Ladda upp t.ex. AED-, WC- eller stoppskyltar – de finns sedan i alla projekt."}</div>`}
    <div class="row" style="margin-top:6px;flex-wrap:wrap;"><button type="button" id="prLibAdd">＋ Ladda upp…</button>${canSave ? `<button type="button" id="prLibSaveSel" title="Spara den markerade bilden i biblioteket">⭐ Spara markerad bild</button>` : ""}</div>`;
  // Miniatyrerna (hämtas en gång, sedan från minnet).
  box.querySelectorAll(".pr-lib-img").forEach(el => {
    const im = printImage(el.dataset.path);
    if (im) { el.style.backgroundImage = `url("${im.src}")`; return; }
    const p = printImgs.get(el.dataset.path);
    if (p && p.then) p.then(() => { if ($("prLib") && $("prLib").open) renderPrintLib(); });
  });
  const qi = $("prLibQ");
  if (qi) qi.oninput = () => { prLibQ = qi.value; const pos = qi.selectionStart; renderPrintLib(); const n = $("prLibQ"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
  box.querySelectorAll(".pr-lib-item").forEach(b => b.onclick = e => {
    const del = e.target.closest("[data-del]");
    const s = prLib.find(x => x.id === b.dataset.id);
    if (!s) return;
    if (del) { removeFromPrintLib(s); return; }
    addLibSymbol(s);
  });
  if ($("prLibAdd")) $("prLibAdd").onclick = () => $("prLibInput").click();
  if ($("prLibSaveSel")) $("prLibSaveSel").onclick = async () => {
    const name = await uiPrompt("Namn i biblioteket:", "Symbol");
    if (name === null) return;
    saveToPrintLib([{ id: ghNewId(), name: name.trim() || "Symbol", cat: "", path: sel.path, ar: sel.ar || 1, w: Math.round(sel.w * 10) / 10 }]);
  };
}
/* Lägg in en symbol som bild mitt på sidan (med samma storlek som när den sparades). */
function addLibSymbol(s) {
  if (!pr) return;
  pushUndo();
  const w = Number(s.w) || 25, ar = Number(s.ar) || 1, h = Math.round(w / ar * 10) / 10;
  const cx = PAGE_A3[0] / 2, cy = PAGE_A3[1] / 2;
  const el = { id: ghNewId(), type: "image", path: s.path, ar, x: cx - w / 2, y: cy - h / 2, w, h, lib: s.id };
  pr.tpl.elements.push(el);
  setSel([el.id]);
  pr.dirty = true;
  renderPrintPanel(); drawPrintPage();
  setPrintStatus(`${s.name} inlagd – dra den dit du vill.`);
}
async function saveToPrintLib(recs) {
  setPrintStatus("Sparar i biblioteket…");
  try {
    const next = await ghWriteJSON(token, PRLIB_PATH, arr => [...(Array.isArray(arr) ? arr : []), ...recs], `Utskriftsbibliotek: ${recs.map(r => r.name).join(", ")}`);
    prLib = Array.isArray(next) ? next : [...(prLib || []), ...recs];
    setPrintStatus(`✓ ${recs.length === 1 ? recs[0].name : recs.length + " symboler"} i biblioteket`);
  } catch (e) { alert("Kunde inte spara i biblioteket: " + e.message); setPrintStatus(""); }
  renderPrintLib();
}
async function removeFromPrintLib(s) {
  if (!await uiConfirm(`Ta bort "${s.name}" ur biblioteket? (Utskrifter där den redan ligger påverkas inte.)`)) return;
  try {
    const next = await ghWriteJSON(token, PRLIB_PATH, arr => (Array.isArray(arr) ? arr : []).filter(x => x.id !== s.id), `Utskriftsbibliotek: ta bort ${s.name}`);
    prLib = Array.isArray(next) ? next : prLib.filter(x => x.id !== s.id);
  } catch (e) { alert("Kunde inte ta bort: " + e.message); }
  renderPrintLib();
}
async function uploadToPrintLib(files) {
  const cat = files.length ? (await uiPrompt("Kategori (valfritt, t.ex. Skyltar, Säkerhet):", "") || "").trim() : "";
  const recs = [];
  for (const f of files) {
    const ext = (f.name.match(/\.(png|jpe?g|webp|svg)$/i) || [0, "png"])[1].toLowerCase();
    const path = `library/print/${ghNewId()}.${ext}`;
    setPrintStatus(`Laddar upp ${f.name}…`);
    try {
      await ghUploadBinary(token, path, f, `Utskriftsbibliotek: ${f.name}`);
      const url = URL.createObjectURL(f);
      const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Bilden kunde inte läsas")); i.src = url; });
      printImgs.set(path, im);
      recs.push({ id: ghNewId(), name: f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim(), cat, path, ar: im.naturalWidth / im.naturalHeight || 1, w: 25 });
    } catch (e) { alert(`Kunde inte ladda upp ${f.name}: ${e.message}`); }
  }
  if (recs.length) await saveToPrintLib(recs); else setPrintStatus("");
}
document.addEventListener("DOMContentLoaded", () => {
  const d = $("prLib");
  if (!d) return;
  d.addEventListener("toggle", async () => { if (d.open) { renderPrintLib(); await loadPrintLib(); renderPrintLib(); } });
  $("prLibInput").onchange = e => { const fs = [...e.target.files]; e.target.value = ""; if (fs.length) uploadToPrintLib(fs); };
  // Markeringen ändras: "Spara markerad bild" följer med.
  const orig = renderPrintPanel;
  renderPrintPanel = function () { const r = orig.apply(this, arguments); if (d.open) renderPrintLib(); return r; };
});
