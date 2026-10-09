/* Lägesplan – leveranser och upplag (Victor 2026-10-09: "leveranser och upplag i 3D och i lägesplanen").
   Leveransplanen i 4D-dashboarden (plan_deliveries.json) kopplas till ett upplag:
     storage_id  – ett upplag i lägesplanen (site_layers, type "storage") eller ett etableringsobjekt
                   i 3D ("place:<id>", t.ex. Upplag i Placera i 3D)
     space_m2    – ytan leveransen tar på upplaget
     until_date  – sista dagen den ligger kvar (tom = bara leveransdagen)
   Leveransen ligger på upplaget från levererat (annars planerat) datum till och med until_date.
   På valt datum visar planen hur fullt varje upplag är (mätare + m²), i 3D som pallar på upplaget.
   Varningar: upplag över sin yta, leveranser utan upplag. Fälten sparas bara när de används. */

let planDeliveries = [];
let deliveriesLoaded = false;
let storPlacements = null; // etableringen (Placera i 3D) om 3D-vyn inte har läst in den själv

const deliveriesPath = () => dataPath("plan_deliveries.json");

async function loadDeliveries() {
  try { planDeliveries = (await ghReadJSON(token, deliveriesPath())) || []; } catch (e) { planDeliveries = []; }
  try { if (typeof placeLoaded === "undefined" || !placeLoaded) storPlacements = (await ghReadJSON(token, dataPath("plan_placements.json"))) || []; } catch (e) { storPlacements = []; }
  if (!Array.isArray(planDeliveries)) planDeliveries = [];
  deliveriesLoaded = true;
  renderStorageWarnings();
  if (typeof renderZonesSoon === "function") renderZonesSoon();
  if (typeof l3 !== "undefined" && l3 && typeof l3StorageBuild === "function") l3StorageBuild();
}

/* Leveransens period på upplaget [start, slut] (ISO-datum). */
function deliveryRange(d) {
  const s = d.actual_date || d.planned_date || "";
  const e = d.until_date && d.until_date >= s ? d.until_date : s;
  return [s, e];
}
const deliveryOn = (d, day) => { const [s, e] = deliveryRange(d); return !!s && s <= day && day <= e; };
const deliveryName = d => d.description || d.supplier || "Leverans";

/* Alla upplag: lägesplanens (2D) och etableringens (3D). cap = ytan i m². */
function storageList() {
  const out = [];
  (typeof siteItems !== "undefined" ? siteItems : []).filter(x => x.type === "storage").forEach(x => {
    const g = rectGeom(x);
    out.push({ id: x.id, name: x.name || "Upplag", cap: Math.round(g.w * g.h * 10) / 10, kind: "site", rec: x });
  });
  const pl = typeof placeLoaded !== "undefined" && placeLoaded ? placements : (storPlacements || []);
  pl.filter(p => p.type === "upplag").forEach(p => out.push({ id: "place:" + p.id, name: p.name || "Upplag", cap: Math.round((Number(p.L) || 0) * (Number(p.B) || 0) * 10) / 10, kind: "place", rec: p }));
  return out;
}
const storageById = id => storageList().find(s => s.id === id) || null;

/* Beläggningen på ett upplag en dag. */
function storageOcc(id, day) {
  day = day || curStorDay();
  const list = planDeliveries.filter(d => d.storage_id === id && deliveryOn(d, day));
  const used = Math.round(list.reduce((a, d) => a + (Number(d.space_m2) || 0), 0) * 10) / 10;
  const s = storageById(id);
  return { list, used, cap: s ? s.cap : 0, over: !!s && s.cap > 0 && used > s.cap + 1e-9, n: list.length };
}
const curStorDay = () => ($("dateInput") && $("dateInput").value) || todayIso();
const fmtM2 = v => (Math.round(v * 10) / 10).toLocaleString("sv-SE") + " m²";

/* Varningar på dagen: fulla upplag, leveranser utan upplag, upplag som inte finns kvar. */
function storageWarnings(day) {
  day = day || curStorDay();
  const out = [];
  storageList().forEach(s => {
    const o = storageOcc(s.id, day);
    if (o.over) out.push({ sev: "krock", storage: s.id, text: `${s.name} är fullt: ${fmtM2(o.used)} av ${fmtM2(s.cap)} (${o.n} leveranser)` });
  });
  const ids = new Set(storageList().map(s => s.id));
  planDeliveries.filter(d => deliveryOn(d, day)).forEach(d => {
    if (!d.storage_id) out.push({ sev: "varning", delivery: d.id, text: `${deliveryName(d)} saknar upplag` });
    else if (!ids.has(d.storage_id)) out.push({ sev: "varning", delivery: d.id, text: `${deliveryName(d)}: upplaget finns inte längre` });
  });
  return out;
}

// ---------------------------------------------------------------------
// Planen (2D): mätare i upplaget och rutan med varningar
// ---------------------------------------------------------------------
/* Ritas inuti upplagets rektangel (anropas från drawSiteItem). Returnerar en textrad till etiketten. */
function drawStorageFill(ctx, x, P) {
  if (!deliveriesLoaded) return "";
  const o = storageOcc(x.id);
  if (!o.n) return "";
  const ratio = o.cap > 0 ? Math.min(1, o.used / o.cap) : 1;
  const col = o.over ? "#dc2626" : ratio > 0.85 ? "#f59e0b" : "#16a34a";
  // Fyllnad från ena kortsidan: P = hörnen [a, b, c, d] i skärmens koordinater.
  const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  const [a, b, c, d] = P, f = [a, b, lerp(b, c, ratio), lerp(a, d, ratio)];
  ctx.save();
  ctx.beginPath(); f.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
  ctx.fillStyle = col + (o.over ? "55" : "40"); ctx.fill();
  if (o.over) { ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.strokeStyle = "#dc2626"; ctx.lineWidth = 3; ctx.setLineDash([]); ctx.stroke(); }
  ctx.restore();
  return `\n${o.over ? "⚠ " : "🚚 "}${fmtM2(o.used)} / ${fmtM2(o.cap)} · ${o.n} lev.`;
}
function renderStorageWarnings() {
  const el = $("storWarn");
  if (!el) return;
  const w = deliveriesLoaded ? storageWarnings() : [];
  el.classList.toggle("hidden", !w.length);
  if (!w.length) { el.innerHTML = ""; return; }
  const bad = w.some(x => x.sev === "krock");
  el.className = `stor-warn ${bad ? "bad" : ""}`;
  el.innerHTML = `<b>${bad ? "⚠" : "🚚"} Leveranser ${escHtml(curStorDay())}</b>` + w.map((x, i) => `<button type="button" data-sw="${i}" class="${x.sev}">${escHtml(x.text)}</button>`).join("");
  el.querySelectorAll("[data-sw]").forEach(b => { b.onclick = () => {
    const x = w[+b.dataset.sw], s = x.storage && storageById(x.storage);
    if (s && s.kind === "site") { selectedSiteId = s.id; const g = rectGeom(s.rec); if (typeof centerOnPdf === "function") centerOnPdf(modelToPdf(g.cx, g.cy)); renderZones(); openSitePop(s.rec); }
    else if (x.delivery) alert("Koppla leveransen till ett upplag: klicka på upplaget i planen och välj den under Leveranser hit (eller i leveransplanen i 4D-dashboarden).");
  }; });
}

// ---------------------------------------------------------------------
// Upplagets ruta: leveranser hit (koppla, yta, ta bort)
// ---------------------------------------------------------------------
function storagePopHtml(rec) {
  if (rec.type !== "storage" || !deliveriesLoaded) return "";
  const id = rec.id, day = curStorDay(), o = storageOcc(id, day);
  const mine = planDeliveries.filter(d => d.storage_id === id).sort((a, b) => deliveryRange(a)[0].localeCompare(deliveryRange(b)[0]));
  const free = planDeliveries.filter(d => !d.storage_id && deliveryRange(d)[1] >= todayIso()).sort((a, b) => deliveryRange(a)[0].localeCompare(deliveryRange(b)[0]));
  const rng = d => { const [s, e] = deliveryRange(d); return s === e ? s : `${s} – ${e}`; };
  return `<div class="stor-pop">
    <div class="stor-h">🚚 Leveranser hit <span class="${o.over ? "bad" : ""}">${day}: ${fmtM2(o.used)} av ${fmtM2(o.cap)}</span></div>
    ${mine.length ? mine.map(d => `<div class="stor-r${deliveryOn(d, day) ? " on" : ""}"><span title="${escHtml([d.supplier, d.contractor].filter(Boolean).join(" · "))}">${escHtml(deliveryName(d))}<small>${escHtml(rng(d))}</small></span>
      <input type="text" inputmode="decimal" data-stm2="${escHtml(d.id)}" value="${d.space_m2 != null ? String(d.space_m2).replace(".", ",") : ""}" placeholder="m²" title="Yta på upplaget (m²)" />
      <input type="date" data-stuntil="${escHtml(d.id)}" value="${escHtml(d.until_date || "")}" title="Ligger kvar till och med" />
      <button type="button" data-stoff="${escHtml(d.id)}" title="Ta bort från upplaget">✕</button></div>`).join("") : `<div class="muted">Inga leveranser kopplade hit.</div>`}
    ${free.length ? `<select class="stor-add"><option value="">＋ Lägg en leverans här…</option>${free.map(d => `<option value="${escHtml(d.id)}">${escHtml(rng(d))} · ${escHtml(deliveryName(d))}</option>`).join("")}</select>` : ""}
    <div class="muted">Yta och "ligger kvar t.o.m." sparas direkt. Leveranserna läggs in i leveransplanen i 4D-dashboarden.</div>
  </div>`;
}
function bindStoragePop(pop, rec) {
  if (!pop.querySelector(".stor-pop")) return;
  const reopen = () => { const cur = siteItems.find(x => x.id === rec.id) || rec; openSitePop(cur); };
  pop.querySelectorAll("[data-stm2]").forEach(inp => { inp.onchange = () => { const v = String(inp.value).trim(); patchDelivery(inp.dataset.stm2, { space_m2: v === "" ? null : Math.max(0, Number(v.replace(",", ".")) || 0) }); }; });
  pop.querySelectorAll("[data-stuntil]").forEach(inp => { inp.onchange = () => patchDelivery(inp.dataset.stuntil, { until_date: inp.value || null }); });
  pop.querySelectorAll("[data-stoff]").forEach(b => { b.onclick = async () => { await patchDelivery(b.dataset.stoff, { storage_id: null }); reopen(); }; });
  const add = pop.querySelector(".stor-add");
  if (add) add.onchange = async () => {
    const d = planDeliveries.find(x => x.id === add.value); if (!d) return;
    const m2 = prompt(`Hur stor yta tar "${deliveryName(d)}" på upplaget (m²)?`, d.space_m2 != null ? String(d.space_m2) : "");
    if (m2 === null) { add.value = ""; return; }
    await patchDelivery(d.id, { storage_id: rec.id, space_m2: m2.trim() === "" ? null : Math.max(0, Number(m2.replace(",", ".")) || 0) });
    reopen();
  };
}
/* Ändrar en leverans i plan_deliveries.json (bara de fält som skickas in; null tar bort fältet). */
async function patchDelivery(id, patch) {
  const apply = r => { const o = { ...r }; Object.entries(patch).forEach(([k, v]) => { if (v === null || v === undefined) delete o[k]; else o[k] = v; }); return o; };
  const before = planDeliveries.find(d => d.id === id);
  if (!before) return;
  planDeliveries = planDeliveries.map(d => d.id === id ? apply(d) : d);
  renderZonesSoon(); renderStorageWarnings();
  if (typeof l3 !== "undefined" && l3 && typeof l3StorageBuild === "function") l3StorageBuild();
  try {
    await ghWriteJSON(token, deliveriesPath(), arr => arr.map(r => r.id === id ? apply(r) : r), `Lägesplan: leverans ${deliveryName(before)} – upplag`);
    if (typeof setSaveStatus === "function") setSaveStatus("✓ Leveransen sparad.");
  } catch (e) {
    planDeliveries = planDeliveries.map(d => d.id === id ? before : d);
    renderZonesSoon(); renderStorageWarnings();
    alert("Kunde inte spara leveransen: " + e.message);
  }
}

// ---------------------------------------------------------------------
// 3D (lägesplanens 3D-vy): leveranserna som pallar på upplagen
// ---------------------------------------------------------------------
const STOR_COLORS = [0x0ea5e9, 0x8b5cf6, 0xf97316, 0x14b8a6, 0xeab308, 0xec4899, 0x64748b];
/* Varje leverans blir ett block (1 m högt) längs upplagets längd med sin yta; det som inte ryms
   (fullt upplag) ritas rött utanför. */
function l3StorageBuild() {
  if (typeof l3 === "undefined" || !l3 || !deliveriesLoaded) return;
  if (!l3.groups.stor) { l3.groups.stor = new THREE.Group(); l3.scene.add(l3.groups.stor); }
  l3Clear(l3.groups.stor);
  const day = curStorDay(), O = l3.O;
  placements.filter(p => p.type === "upplag" && !(l3.hidden && l3.hidden.has(p.id))).forEach(p => {
    const o = storageOcc("place:" + p.id, day);
    if (!o.n) return;
    const L = Number(p.L) || 1, B = Number(p.B) || 1, H = 1, t = (Number(p.rot) || 0) * Math.PI / 180;
    const z0 = (Number(p.z) || 0) + (Number(p.dz) || 0) + (Number(p.H) || 0) - O[2];
    let along = -L / 2;
    o.list.forEach((d, i) => {
      const len = Math.max(0.2, (Number(d.space_m2) || 0.5) / B), over = along + len > L / 2 + 1e-6;
      const geo = new THREE.BoxGeometry(len - 0.1, B - 0.2, H);
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: over ? 0xdc2626 : STOR_COLORS[i % STOR_COLORS.length], transparent: over, opacity: over ? 0.75 : 1 }));
      const c = along + len / 2;
      m.position.set(p.x - O[0] + Math.cos(t) * c, p.y - O[1] + Math.sin(t) * c, z0 + H / 2);
      m.rotation.z = t; m.userData.noHit = true; m.userData.delivery = d.id;
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x1f2937 })));
      l3.groups.stor.add(m);
      along += len;
    });
  });
  l3Render();
}
