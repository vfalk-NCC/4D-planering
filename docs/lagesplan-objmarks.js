/* Lägesplan – flytta objektens markeringar (Victors önskemål 2026-10-02).
   Prickarna (en per aktivitet, eller per objekt) är låsta. Klick på en prick
   visar en liten ruta: 🔓 Lås upp → dra pricken dit du vill → 🔒 Lås.
   ↺ Återställ lägger tillbaka den på objektens eget läge och låser den.
   Lägena sparas i projektet ({ type: "objmarks" } i site_layers.json, i
   modellens koordinater) så de syns för alla och i utskrifter. Ctrl+Z ångrar. */

const OBJMARKS_ID = "objmarks";
const objMarkUnlocked = new Set(); // aktiviteter (objFamKey) som är upplåsta – bara i den här sessionen
let objMarkDrag = null;
/* Visa/dölj antalet i de samlade prickarna och fri flytt av prickar (Victor 2026-11-05: "släcka siffrorna i punkterna och justera insättningspunkten fritt"). Båda sparas i webbläsaren. */
const OBJ_COUNT_KEY = "lagesplan-objcount", OBJ_MOVEFREE_KEY = "lagesplan-objmovefree";
function objCountOn() { try { return localStorage.getItem(OBJ_COUNT_KEY) !== "0"; } catch (e) { return true; } }
function objMoveFree() { try { return localStorage.getItem(OBJ_MOVEFREE_KEY) !== "0"; } catch (e) { return true; } }   // på som standard: alla prickar kan dras direkt (Victor 2026-11-05)
const objMovedCount = () => Object.keys(objMarks()).length;
function objMarkBtnSync() { const b = $("btnObjResetMoved"); if (!b) return; const n = objMovedCount(); b.disabled = !n; b.textContent = n ? `↺ Återställ flyttade prickar (${n})` : "↺ Inga prickar är flyttade"; }

function objMarks() { const r = (typeof siteItems !== "undefined" ? siteItems : []).find(x => x.id === OBJMARKS_ID); return (r && r.pos) || {}; }
function objMarkPos(fam) { const p = objMarks()[fam]; return Array.isArray(p) && p.length === 2 ? p : null; }
function saveObjMarks(pos, label) {
  const rec = { id: OBJMARKS_ID, type: "objmarks", pos, updated_at: new Date().toISOString() };
  invalidatePositions();
  const r = saveSiteItem(rec); setTimeout(objMarkBtnSync, 0); return r;
}
const famLabel = o => { const it = o.it; return `${it.activity || it.object_name || "Objekt"}${o.members && o.members.length > 1 ? ` (${o.members.length} objekt)` : it.activity && it.object_name ? ` – ${it.object_name}` : ""}`; };

/* Lås-knapparna visas i en smal list längst ner på planen (inte vid pricken,
   där rutan täckte närliggande prickar så att nästa klick inte nådde 3D). */
function openObjMarkPop(o) {
  if (!o || !plan || !plan.calib) return;
  const pop = $("objMarkBar"), free = objMoveFree(), unlocked = free || objMarkUnlocked.has(o.fam);
  if (!pop) return;
  pop.innerHTML = `
    <span class="omb-name" title="${escHtml(famLabel(o))}">🔷 ${escHtml(famLabel(o))}</span>
    <span class="muted omb-state">${free ? (o.moved ? "Flyttad – dra den dit du vill" : "Dra pricken dit du vill") : unlocked ? "Upplåst – dra pricken" : o.moved ? "Flyttad, låst" : "Låst"}</span>
    ${free ? "" : unlocked ? `<button type="button" class="om-lock primary">🔒 Lås</button>` : `<button type="button" class="om-unlock" title="Lås upp så att pricken kan dras">🔓 Lås upp och flytta</button>`}
    ${o.moved ? `<button type="button" class="om-reset" title="Flytta tillbaka pricken till objektens eget läge">↺ Återställ</button>` : ""}
    <button type="button" class="om-close icon ghost" title="Stäng">✕</button>`;
  pop.classList.remove("hidden");
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
  if (e.button !== 0 || !plan || !plan.calib) return false;
  const anyFree = typeof objIsFree === "function" && items.some(objIsFree);   // egna aktiviteter (okopplade) går alltid att dra
  if (!objMarkUnlocked.size && !anyFree && !objMoveFree()) return false;
  const o = objectsAt(toPdf(stagePoint(e))).find(x => objMoveFree() || objMarkUnlocked.has(x.fam) || (anyFree && (x.members || [x.it]).length === 1 && objIsFree(x.it)));
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
  if (!d.moved) { if (!(typeof objIsFree === "function" && objIsFree(d.o.it) && !objMarkUnlocked.has(d.o.fam))) openObjMarkPop(d.o); return; }
  if (typeof objIsFree === "function" && objIsFree(d.o.it) && !objMarkUnlocked.has(d.o.fam)) { objSaveFreePos(d.o.it, d.pos); return; }
  const pos = { ...objMarks(), [d.o.fam]: [Math.round(d.pos[0] * 1000) / 1000, Math.round(d.pos[1] * 1000) / 1000] };
  saveObjMarks(pos);
  setSaveStatus(objMoveFree() ? "📍 Pricken är flyttad – klicka på den och tryck ↺ Återställ för att lägga tillbaka den (Ctrl+Z ångrar)." : "📍 Markeringen flyttad – lås den med 🔒 när du är klar (Ctrl+Z ångrar).");
});
document.addEventListener("DOMContentLoaded", () => {
  // Ångra/gör om och inläsning ändrar lägena: rita om prickarna.
  const ss = saveSiteItem;
  saveSiteItem = function (rec) { if (rec && rec.type === "objmarks") invalidatePositions(); return ss.apply(this, arguments); };
  const ls_ = loadSiteLayers;
  loadSiteLayers = async function () { const r = await ls_.apply(this, arguments); invalidatePositions(); renderZones(); objMarkBtnSync(); return r; };
  const oc = $("objCount"); if (oc) { oc.checked = objCountOn(); oc.onchange = () => { try { localStorage.setItem(OBJ_COUNT_KEY, oc.checked ? "1" : "0"); } catch (e) {} renderZones(); }; }
  const rb = $("btnObjResetMoved"); if (rb) { rb.onclick = () => { const n = objMovedCount(); if (!n || !confirm(`Flytta tillbaka alla ${n} flyttade prickar till objektens eget läge?`)) return; objMarkUnlocked.clear(); saveObjMarks({}); setSaveStatus(`↺ ${n} prickar är tillbaka på objektens läge – Ctrl+Z ångrar.`); }; setTimeout(objMarkBtnSync, 800); }
  const mf = $("objMoveFree"); if (mf) { mf.checked = objMoveFree(); mf.onchange = () => { try { localStorage.setItem(OBJ_MOVEFREE_KEY, mf.checked ? "1" : "0"); } catch (e) {} setSaveStatus(mf.checked ? "🔓 Prickarna kan dras fritt – dra en prick dit du vill." : "🔒 Prickarna är låsta (lås upp en i taget genom att klicka på den)."); }; }
  const g = $("objGroup");
  if (g) {
    g.checked = objGroupOn();
    g.onchange = () => { try { localStorage.setItem(OBJ_GROUP_KEY, g.checked ? "1" : "0"); } catch (e) {} invalidatePositions(); renderZones(); };
  }
});
