/* Lägesplan – flytta objektens markeringar (Victors önskemål 2026-10-02).
   Prickarna (en per aktivitet, eller per objekt) är låsta. Klick på en prick
   visar en liten ruta: 🔓 Lås upp → dra pricken dit du vill → 🔒 Lås.
   ↺ Återställ lägger tillbaka den på objektens eget läge och låser den.
   Lägena sparas i projektet ({ type: "objmarks" } i site_layers.json, i
   modellens koordinater) så de syns för alla och i utskrifter. Ctrl+Z ångrar. */

const OBJMARKS_ID = "objmarks";
const objMarkUnlocked = new Set(); // aktiviteter (objFamKey) som är upplåsta – bara i den här sessionen
let objMarkDrag = null;

function objMarks() { const r = (typeof siteItems !== "undefined" ? siteItems : []).find(x => x.id === OBJMARKS_ID); return (r && r.pos) || {}; }
function objMarkPos(fam) { const p = objMarks()[fam]; return Array.isArray(p) && p.length === 2 ? p : null; }
function saveObjMarks(pos, label) {
  const rec = { id: OBJMARKS_ID, type: "objmarks", pos, updated_at: new Date().toISOString() };
  invalidatePositions();
  return saveSiteItem(rec);
}
const famLabel = o => { const it = o.it; return `${it.activity || it.object_name || "Objekt"}${o.members && o.members.length > 1 ? ` (${o.members.length} objekt)` : it.activity && it.object_name ? ` – ${it.object_name}` : ""}`; };

function openObjMarkPop(o) {
  if (!o || !plan || !plan.calib) return;
  const pop = $("sitePop"), unlocked = objMarkUnlocked.has(o.fam);
  pop.innerHTML = `
    <b class="dp-head">🔷 ${escHtml(famLabel(o))}</b>
    <div class="muted" style="margin:4px 0 6px;">${unlocked ? "Upplåst – dra pricken dit du vill och lås den sedan." : o.moved ? "Markeringen är flyttad och låst." : "Markeringen är låst på objektens läge."}</div>
    <div class="row" style="gap:6px;flex-wrap:wrap;">
      ${unlocked ? `<button type="button" class="om-lock primary">🔒 Lås</button>` : `<button type="button" class="om-unlock" title="Lås upp så att pricken kan dras">🔓 Lås upp och flytta</button>`}
      ${o.moved ? `<button type="button" class="om-reset" title="Tillbaka till objektens läge (och låst)">↺ Återställ</button>` : ""}
      <button type="button" class="om-close">Stäng</button>
    </div>`;
  pop.classList.remove("hidden");
  const r = $("viewport").getBoundingClientRect(), sp = stageToScreen(toPx(o.center));
  pop.style.left = `${Math.max(8, Math.min(r.width - pop.offsetWidth - 8, sp[0] + 18))}px`;
  pop.style.top = `${Math.max(8, Math.min(r.height - pop.offsetHeight - 8, sp[1] + 14))}px`;
  const q = c => pop.querySelector(c);
  const close = () => { pop.classList.add("hidden"); pop.innerHTML = ""; };
  q(".om-close").onclick = close;
  const un = q(".om-unlock"); if (un) un.onclick = () => { objMarkUnlocked.add(o.fam); renderZones(); openObjMarkPop(o); setSaveStatus("🔓 Upplåst – dra pricken dit du vill."); };
  const lk = q(".om-lock"); if (lk) lk.onclick = () => { objMarkUnlocked.delete(o.fam); renderZones(); close(); setSaveStatus("🔒 Markeringen är låst."); };
  const rs = q(".om-reset"); if (rs) rs.onclick = () => {
    const pos = { ...objMarks() }; delete pos[o.fam];
    objMarkUnlocked.delete(o.fam);
    saveObjMarks(pos); close(); setSaveStatus("↺ Markeringen är tillbaka på objektens läge och låst – Ctrl+Z ångrar.");
  };
}
/* Mousedown på planen (från lagesplan.js): dra en upplåst prick. */
function objMarkPointerDown(e) {
  if (!objMarkUnlocked.size || e.button !== 0 || !plan || !plan.calib) return false;
  const o = objectsAt(toPdf(stagePoint(e))).find(x => objMarkUnlocked.has(x.fam));
  if (!o) return false;
  e.preventDefault();
  objMarkDrag = { o, sx: e.clientX, sy: e.clientY, moved: false, start: stagePoint(e), c0: toPx(o.center) };
  return true;
}
window.addEventListener("mousemove", e => {
  const d = objMarkDrag;
  if (!d) return;
  if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
  d.moved = true;
  const p = stagePoint(e), pdf = toPdf([d.c0[0] + p[0] - d.start[0], d.c0[1] + p[1] - d.start[1]]);
  d.pos = pdfToModel(pdf);
  // Förhandsvisning: flytta pricken i cachen (sparas vid släpp).
  const sh = (objectShapesInPdf() || []).find(x => x.fam === d.o.fam);
  if (sh) { sh.center = pdf; sh.moved = true; }
  renderZonesSoon();
});
window.addEventListener("mouseup", () => {
  const d = objMarkDrag;
  if (!d) return;
  objMarkDrag = null;
  if (!d.moved) { openObjMarkPop(d.o); return; }
  const pos = { ...objMarks(), [d.o.fam]: [Math.round(d.pos[0] * 1000) / 1000, Math.round(d.pos[1] * 1000) / 1000] };
  saveObjMarks(pos);
  setSaveStatus("📍 Markeringen flyttad – lås den med 🔒 när du är klar (Ctrl+Z ångrar).");
});
document.addEventListener("DOMContentLoaded", () => {
  // Ångra/gör om och inläsning ändrar lägena: rita om prickarna.
  const ss = saveSiteItem;
  saveSiteItem = function (rec) { if (rec && rec.type === "objmarks") invalidatePositions(); return ss.apply(this, arguments); };
  const ls_ = loadSiteLayers;
  loadSiteLayers = async function () { const r = await ls_.apply(this, arguments); invalidatePositions(); renderZones(); return r; };
  const g = $("objGroup");
  if (g) {
    g.checked = objGroupOn();
    g.onchange = () => { try { localStorage.setItem(OBJ_GROUP_KEY, g.checked ? "1" : "0"); } catch (e) {} invalidatePositions(); renderZones(); };
  }
});
