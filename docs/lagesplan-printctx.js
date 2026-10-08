/* Utskriftslayoutens högerklicksmeny och "fördela jämnt" (Victors önskemål 2026-10-08).
   Högerklick på ett element markerar det (om det inte redan var markerat) och visar
   de vanligaste kommandona; högerklick på tomt blad visar klistra in / markera alla.
   Alla kommandon går via samma funktioner som knapparna och kortkommandona. */
const PR_STYLE_KEYS = ["stroke", "fill", "lw", "color", "border", "size", "bold", "italic", "align", "valign", "pad", "radius", "dash", "fillOpacity",
  "style", "shape", "head", "bend", "double", "shadow", "outline", "frameColor", "cols", "legSpacing", "legNoEq"];
const PR_STYLE_COMMON = ["stroke", "fill", "lw", "color", "dash"]; // mellan olika sorters element
let prStyleClip = null;
function copyStyleSel() {
  const el = primary();
  if (!el) return;
  prStyleClip = { type: el.type, s: Object.fromEntries(PR_STYLE_KEYS.filter(k => el[k] !== undefined).map(k => [k, JSON.parse(JSON.stringify(el[k]))])) };
  setPrintStatus("Stilen kopierad – högerklicka på ett annat element och välj Klistra in stil.");
}
function pasteStyleSel() {
  if (!prStyleClip) return;
  const els = selEls().filter(e => !e.locked);
  if (!els.length) return;
  pushUndo();
  els.forEach(el => Object.entries(prStyleClip.s).forEach(([k, v]) => { if (el.type === prStyleClip.type || PR_STYLE_COMMON.includes(k)) el[k] = JSON.parse(JSON.stringify(v)); }));
  renderPrintPanel(); drawPrintPage();
}
/* Fördela jämnt: första och sista står still, mellanrummen blir lika stora. */
function distributeSel(dir) {
  const els = selEls().filter(e => !e.locked);
  if (els.length < 3) return;
  pushUndo();
  const H = dir === "h", items = els.map(el => ({ el, b: elBox(el) })).sort((a, b) => H ? a.b.x - b.b.x : a.b.y - b.b.y);
  const pos = q => H ? q.b.x : q.b.y, size = q => H ? q.b.w : q.b.h;
  const first = items[0], last = items[items.length - 1];
  const span = pos(last) + size(last) - pos(first), gap = (span - items.reduce((a, q) => a + size(q), 0)) / (items.length - 1);
  let at = pos(first) + size(first) + gap;
  items.slice(1, -1).forEach(q => { const d = at - pos(q); if (H) q.el.x += d; else q.el.y += d; at += size(q) + gap; });
  renderPrintProps(true); drawPrintPage();
}
function prHitAt(mx, my) {
  return pr.tpl.elements.slice().reverse().find(x => { const b = elBox(x); return mx >= b.x - 1 && mx <= b.x + b.w + 1 && my >= b.y - 1 && my <= b.y + b.h + 1; });
}
function closePrCtx() { document.getElementById("prCtx")?.remove(); }
function openPrCtx(e) {
  if (!pr) return;
  e.preventDefault();
  closePrCtx();
  const [mx, my] = prPoint(e), hit = prHitAt(mx, my);
  if (hit && !pr.sels.includes(hit.id)) { setSel([hit.id]); renderPrintPanel(); drawPrintPage(); }
  if (!hit && pr.sels.length) { setSel([]); renderPrintPanel(); drawPrintPage(); }
  const els = selEls(), n = els.length, locked = els.some(x => x.locked);
  let clipN = 0;
  try { clipN = (pr.clip && pr.clip.els.length) || (JSON.parse(localStorage.getItem(CLIP_KEY) || "null") || { els: [] }).els.length; } catch (err) {}
  const it = (act, icon, label, key = "", dis = false) => `<button type="button" data-ctx="${act}"${dis ? " disabled" : ""}><i>${icon}</i><span>${label}</span><kbd>${key}</kbd></button>`;
  const sep = '<hr />';
  const rows = n ? [
    `<div class="pc-head">${n > 1 ? `${n} element` : escHtml((ELEMENT_TYPES[els[0].type] || {}).label || els[0].type)}</div>`,
    it("dup", "⧉", "Duplicera", "Ctrl+D"), it("copy", "⎘", "Kopiera", "Ctrl+C"), it("cut", "✂", "Klipp ut", "Ctrl+X", locked), it("paste", "📋", "Klistra in", "Ctrl+V", !clipN),
    sep,
    it("top", "⤒", "Lägg överst"), it("bottom", "⤓", "Lägg underst"),
    n >= 2 ? sep + it("al-left", "⇤", "Justera vänster") + it("al-hcenter", "↔", "Justera mitten") + it("al-top", "⤒", "Justera överkant") : "",
    n >= 3 ? it("dist-h", "⋯", "Fördela jämnt vågrätt") + it("dist-v", "⋮", "Fördela jämnt lodrätt") : "",
    sep,
    n === 1 ? it("style-copy", "🖌", "Kopiera stil") : "", it("style-paste", "🖌", "Klistra in stil", "", !prStyleClip),
    it("lock", locked ? "🔓" : "🔒", locked ? "Lås upp" : "Lås"),
    sep,
    it("del", "🗑", "Ta bort", "Delete", locked),
  ] : [
    `<div class="pc-head">Bladet</div>`,
    it("paste", "📋", "Klistra in", "Ctrl+V", !clipN), it("all", "⬚", "Markera alla", "Ctrl+A", !pr.tpl.elements.length),
  ];
  const m = document.createElement("div");
  m.id = "prCtx"; m.setAttribute("role", "menu"); m.innerHTML = rows.join("");
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(e.clientX, innerWidth - r.width - 4)) + "px";
  m.style.top = Math.max(4, Math.min(e.clientY, innerHeight - r.height - 4)) + "px";
  m.addEventListener("click", ev => {
    const b = ev.target.closest("[data-ctx]");
    if (!b || b.disabled) return;
    closePrCtx();
    const a = b.dataset.ctx;
    if (a === "dup") duplicateSel();
    else if (a === "copy") copySel(false);
    else if (a === "cut") copySel(true);
    else if (a === "paste") pasteClip();
    else if (a === "top") orderSel("top");
    else if (a === "bottom") orderSel("bottom");
    else if (a.startsWith("al-")) alignSel(a.slice(3));
    else if (a === "dist-h") distributeSel("h");
    else if (a === "dist-v") distributeSel("v");
    else if (a === "style-copy") copyStyleSel();
    else if (a === "style-paste") pasteStyleSel();
    else if (a === "lock") { pushUndo(); const on = !selEls().some(x => x.locked); selEls().forEach(x => { x.locked = on; }); if (on) pr.panMode = false; renderPrintPanel(); drawPrintPage(); }
    else if (a === "del") deleteSel();
    else if (a === "all") { setSel(pr.tpl.elements.map(x => x.id)); renderPrintPanel(); drawPrintPage(); }
  });
}
document.addEventListener("DOMContentLoaded", () => {
  const c = document.getElementById("prCanvas");
  if (!c) return;
  c.addEventListener("contextmenu", openPrCtx);
  document.addEventListener("mousedown", e => { const m = document.getElementById("prCtx"); if (m && !m.contains(e.target)) closePrCtx(); }, true);
  window.addEventListener("keydown", e => { if (e.key === "Escape" && document.getElementById("prCtx")) { e.stopPropagation(); closePrCtx(); } }, true);
  window.addEventListener("resize", closePrCtx);
  c.addEventListener("wheel", closePrCtx, { passive: true });
});
