/* 3D-vyn – högerklick överallt (Victor 2026-10-24: "alternativ på högerklick på alla saker som standard, både i menyer och i modellen").
   – I modellen: byggnadsdelar (IFC), punktmoln, DXF/DWG-ritningar och arbetsytans PDF får egna menyer; etableringsobjekt har den vanliga menyn
     (nu också med Lås på plats).
   – I menyerna: varje rad i Lager (modeller, punktmoln, ritningar, mappar), biblioteket och blockrubrikerna får en meny med radens alla val. */

function l3PopClose() { const p = document.getElementById("v3Pop"); if (p) p.remove(); document.removeEventListener("pointerdown", l3PopOff, true); window.removeEventListener("keydown", l3PopKey, true); }
const l3PopOff = e => { const p = document.getElementById("v3Pop"); if (p && !p.contains(e.target)) l3PopClose(); };
const l3PopKey = e => { if (e.key === "Escape") { e.stopPropagation(); l3PopClose(); } };
/* items: [[text, fn, { danger, disabled, kbd }] | null (streck)] */
function l3Pop(x, y, items, title) {
  l3PopClose(); if (typeof l3HideMenus === "function") l3HideMenus();
  const host = document.getElementById("view3d") || document.body, p = document.createElement("div"); p.id = "v3Pop"; p.className = "v3-pop-menu";
  const list = items.filter((it, i, a) => it ? true : i > 0 && a[i - 1] && i < a.length - 1);
  p.innerHTML = (title ? `<div class="v3-pm-t">${escHtml(title)}</div>` : "") + list.map((it, i) => it ? `<button type="button" data-i="${i}" ${it[2] && it[2].disabled ? "disabled" : ""} class="${it[2] && it[2].danger ? "v3-danger" : ""}"><span>${escHtml(it[0])}</span>${it[2] && it[2].kbd ? `<kbd>${escHtml(it[2].kbd)}</kbd>` : ""}</button>` : "<hr/>").join("");
  host.appendChild(p); p.style.left = "0px"; p.style.top = "0px";
  const w = p.offsetWidth, h = p.offsetHeight; p.style.left = Math.max(6, Math.min(x, innerWidth - w - 8)) + "px"; p.style.top = Math.max(6, Math.min(y, innerHeight - h - 8)) + "px";
  p.addEventListener("pointerdown", e => e.stopPropagation()); p.addEventListener("contextmenu", e => e.preventDefault());
  p.onclick = e => { const b = e.target.closest("button[data-i]"); if (!b || b.disabled) return; const it = list[+b.dataset.i]; l3PopClose(); try { it[1](); } catch (err) { console.warn("Högerklick", err); } };
  setTimeout(() => { document.addEventListener("pointerdown", l3PopOff, true); window.addEventListener("keydown", l3PopKey, true); }, 0);
  return p;
}

/* ---- I modellen: allt som inte är ett etableringsobjekt ----------------------------------------------- */
function l3CtxAlt(x, y, e) {
  if (!l3 || (typeof l3PlaceAt === "function" && l3PlaceAt(e))) return false;
  const hit = l3Ray(e, l3Surfaces())[0], at = hit ? hit.point.clone() : null, comment = typeof l3kNew === "function" && at ? [["Kommentar här…", () => l3kNew(at, hit)]] : [];
  // 1) byggnadsdel (IFC)
  const ent = hit && typeof l3bsFromHit === "function" ? l3bsFromHit(hit) : null;
  if (ent) {
    const key = l3bsKey(ent.mesh, ent.ri); if (!l3bs.sel.some(s => s.key === key)) { if (l3.sel.size) l3SelectIds([]); l3bsTap(hit, false); }
    const n = l3bs.sel.length;
    l3Pop(x, y, [["Zooma hit", () => l3bsZoom(), { kbd: "F" }], ["Visa uppgifter", () => { if (typeof l3PalTab === "function") l3PalTab("props"); }], null,
      ["Dölj", () => l3bsHide(), { kbd: "H" }], ["Visa bara markerade", () => l3bsIsolate(), { kbd: "I" }], ["Spränga isär", () => l3xStart(), { disabled: n < 2 }], null, ...comment,
      ["Exportera markerade som IFC…", () => l3ExportSelected()], null, ["Avmarkera", () => l3bsClear(), { kbd: "Esc" }]], n > 1 ? `${n} byggnadsdelar` : "Byggnadsdel");
    return true;
  }
  // 2) punktmoln
  const pk = typeof l3pcPick === "function" ? l3pcPick(e) : null;
  if (pk && pk.cloud) {
    const c = pk.cloud, id = c.id;
    l3Pop(x, y, [["Zooma till molnet", () => l3pcZoom(id)], ["Visa bara detta moln", () => l3pcSolo(id), { disabled: l3pc.clouds.length < 2 }], ["Sätt nollnivå (Z0) här", () => { l3SetPref("pcZ0", Math.round((pk.point.z + l3.O[2]) * 100) / 100); l3SetPref("pcMode", "z"); l3pcRecolor(); }],
      ["Justera höjd…", () => l3pcSetDz(id)], null, ...comment, null, ["Släck molnet", () => { l3pcShow(id, false); l3LayersRender(); }]], c.name);
    return true;
  }
  // 3) ritning (DXF/DWG)
  const rec = typeof l3ssCadAt === "function" ? l3ssCadAt(e) : null;
  if (rec) {
    l3Pop(x, y, [["Markera ritningen", () => { l3ssSelect({ kind: "cad", id: rec.id }); l3ssFlash({ kind: "cad", id: rec.id }); }], ["Zooma hit", () => l3sZoomCad(rec.id)], ["Byt färg…", () => { l3ssSelect({ kind: "cad", id: rec.id }); setTimeout(() => { const c = document.getElementById("v3SsCol"); if (c) c.click(); }, 80); }],
      typeof l3dStart === "function" ? ["Redigera linjerna", () => l3dStart(rec.id)] : null, null, ...comment, null, ["Släck ritningen", () => { setLayersVisible(["cad:" + rec.id], false); l3sRefresh(0); l3LayersRender(); }]], rec.name);
    return true;
  }
  // 4) arbetsytans PDF
  if (l3.planMesh && l3.planMesh.visible && l3Ray(e, [l3.planMesh])[0]) {
    l3Pop(x, y, [["Markera ritningen (PDF)", () => { l3ssSelect({ kind: "pdf" }); l3ssFlash({ kind: "pdf" }); }], ["Zooma hit", () => l3sZoomPdf()], null, ...comment, null, ["Släck ritningen", () => { const c = document.getElementById("v3ShowPlan"); if (c) { c.checked = false; c.dispatchEvent(new Event("change")); } }]], "Ritning (PDF)");
    return true;
  }
  return false;
}

/* ---- I menyerna ------------------------------------------------------------------------------------------ */
function l3PalItems(t) {
  const cut = s => { s = String(s || "").replace(/\s+/g, " ").trim(); const i = s.search(/[.–—(]/); s = i > 8 ? s.slice(0, i) : s; return s.length > 46 ? s.slice(0, 44) + "…" : s; };
  // bibliotekets knappar (Placera)
  const lib = t.closest("#v3Lib button, #v3Lib [data-add], #v3Lib .v3-lib-i");
  if (lib) return { title: cut(lib.textContent), items: [["Placera i modellen", () => lib.click()]] };
  const row = t.closest(".v3-lr, .v3-lsub-h, .v3-lsec-h, .v3-lg");
  if (!row) return null;
  const items = [], btns = [...row.querySelectorAll("button, input[type=checkbox]")].filter(b => !b.closest(".v3-ldd-m") && !b.disabled && b.offsetParent !== null || b.type === "checkbox");
  const name = row.querySelector(".v3-lr-n, .v3-lsec-t, .v3-lsub-t"), pick = name && name.classList.contains("v3-lr-pick2") ? name : null;
  const pcId = (row.querySelector("[data-pc-eye],[data-pc-rem]") || {}).dataset; const pid = pcId && (pcId.pcEye || pcId.pcRem);
  btns.forEach(b => {
    if (b.type === "checkbox") { items.push([b.checked ? "Släck allt i blocket" : "Tänd allt i blocket", () => b.click()]); return; }
    const txt = b.textContent.trim(), tl = b.getAttribute("title") || b.getAttribute("aria-label") || "";
    if (b.classList.contains("v3-eye")) { items.push([b.classList.contains("on") ? "Släck" : "Tänd", () => b.click()]); return; }
    if (b.classList.contains("v3-lsec-t") || b.classList.contains("v3-lsub-t") || b.classList.contains("v3-lr-fold") || b.classList.contains("v3-lr-dir")) { items.push([b.getAttribute("aria-expanded") === "true" ? "Fäll ihop" : "Fäll ut", () => b.click()]); return; }
    if (/^[⋯＋]$/.test(txt) || b.classList.contains("v3-ldd-b") || b.hasAttribute("data-pc-more")) return;
    const label = cut(tl || txt); if (label) items.push([label, () => b.click(), { danger: /ta bort|radera/i.test(label) || b.classList.contains("v3-lr-del") }]);
  });
  if (pick) items.unshift(["Markera i modellen", () => pick.click()]);
  if (pid) { items.push(null, ["Zooma till molnet", () => l3pcZoom(pid)], ["Visa bara detta moln", () => l3pcSolo(pid), { disabled: l3pc.clouds.length < 2 }], ["Justera höjd…", () => l3pcSetDz(pid)]); }
  if (!items.length) return null;
  return { title: name ? cut(name.textContent) : "", items };
}
function l3CtxInstall() {
  if (l3CtxInstall.done) return; l3CtxInstall.done = true;
  window.addEventListener("contextmenu", e => {
    const t = e.target; if (!t || !t.closest) return;
    const pal = t.closest("#v3Pal"); if (!pal || t.closest("input[type=text],input[type=search],textarea,select,[contenteditable],.v3-mr,#v3Pop,.v3-ldd-m")) return;
    const m = l3PalItems(t); if (!m) return;
    e.preventDefault(); e.stopPropagation(); l3Pop(e.clientX, e.clientY, m.items, m.title);
  }, true);
}
if (typeof document !== "undefined") { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", l3CtxInstall); else l3CtxInstall(); }
