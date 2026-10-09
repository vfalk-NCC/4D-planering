/* 4D-planering – Placera i 3D (Victors önskemål 2026-10-08). Etableringsobjekt (bod, container,
   kran, staket …) placeras med ett tryck i modellen (viewer.onPicked) och justeras i panelen:
   mått, vridning, höjd över punkten, färg och 4D-period. Förhandsvisningen är medvetet snål med
   linjer (Trimble Connect laggar av många linjemarkeringar): bara objektet man jobbar med ritas
   som trådmodell, övriga ej sparade som en fotavtryck-ram (4 linjer), och sådant som redan finns
   i IFC-filen ritas inte alls. Linjerna ritas bara om när något ändras.
   Placeringarna sparas i projects/<id>/plan_placements.json (egen fil, rör inga andra filer) och
   blir en IFC-fil ("Spara som IFC") i Trimble Connect-mappen "4D Etablering". Varje sparning blir
   en ny fil med datum och klockslag i namnet (Victors önskemål 2026-10-08: tidigare exporter ska
   inte skrivas över). Varje objekt får ett fast IFC-id (från placeringens id), så objektens id:n
   och eventuella 4D-kopplingar är desamma i alla filerna. Koordinater i meter, modellens system (som manuella markeringar). */

const PLACE_TC_FOLDER = "4D Etablering";
const PLACE_MAX_LINES = 300; // tak för förhandsvisningen
const PLACE_LIB = {
  bod:       { group: "Etablering", label: "Bod",        L: 8.4,  B: 3,    H: 2.7,  color: "#f59e0b" },
  container: { group: "Etablering", label: "Container",  L: 6.06, B: 2.44, H: 2.59, color: "#2563eb" },
  upplag:    { group: "Etablering", label: "Upplag",     L: 10,   B: 5,    H: 0.3,  color: "#a16207" },
  stallning: { group: "Etablering", label: "Ställning",  L: 10,   B: 0.75, H: 10,   color: "#eab308", transp: 0.5 },
  lada:      { group: "Etablering", label: "Egen låda",  L: 2,    B: 2,    H: 2,    color: "#7c3aed" },
  tornkran:  { group: "Maskiner",   label: "Tornkran",   L: 1.6,  B: 1.6,  H: 40,   R: 50, color: "#facc15" },
  mobilkran: { group: "Maskiner",   label: "Mobilkran",  L: 12,   B: 2.8,  H: 3.5,  R: 30, color: "#dc2626" },
  staket:    { group: "Säkerhet",   label: "Staket",     H: 2,    fence: true, color: "#16a34a" },
  barriar:   { group: "Säkerhet",   label: "Barriär",    L: 4,    B: 0.5,  H: 0.8,  color: "#9ca3af" },
};

/* Biblioteksposten för en typ – även egna modeller ("model:<id>", se place-models.js). */
function placeLib(type) {
  if (PLACE_LIB[type]) return PLACE_LIB[type];
  if (String(type || "").startsWith("model:")) {
    const a = typeof placeAssetOf === "function" ? placeAssetOf(type.slice(6)) : null;
    return { group: "Egna modeller", label: a ? a.name : "Modell (saknas)", color: "#64748b", model: a || null, isModel: true };
  }
  return null;
}
const placeScale = p => (placeLib(p.type) || {}).model && placeLib(p.type).model.kind === "mesh" ? (Number(p.scale) || 1) : 1;

let placements = [];            // [{ id, type, name, x, y, z, L, B, H, R, rot, dz, color, pts, itemId, start, end, updated_at, ifc_at }]
let placeLoaded = false;
let placeActiveId = null;
let placeMode = null;           // null | { kind: "place", type } | { kind: "move" } | { kind: "aim" } | { kind: "fence" }
let placeShownIds = [];
let placeDrawSeq = 0, placeDrawTimer = null;
let placeDirty = new Set(), placeDeleted = new Set(), placeSaveTimer = null;
let placeUndoStack = [];

const placeNum = (v, d = 0) => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : d; };
const placeR3 = v => Math.round(v * 1000) / 1000;
/* Underkantens Z i modellens koordinater (SWEREF 99 20 15 och modellens höjdsystem, Victor 2026-10-09:
   "så att jag vet i vilken höjd det ligger"): ytan objektet står på (z, eller staketets lägsta punkt)
   plus höjden över ytan (dz). Att ändra Z ändrar bara dz – punkten på ytan ligger kvar. */
function placeBaseZ(p) {
  const ground = p.pts && p.pts.length ? Math.min(...p.pts.map(q => Number(q[2]) || 0)) : Number(p.z) || 0;
  return placeR3(ground + (Number(p.dz) || 0));
}
function placeSetBaseZ(p, v) {
  const ground = p.pts && p.pts.length ? Math.min(...p.pts.map(q => Number(q[2]) || 0)) : Number(p.z) || 0;
  p.dz = placeR3(v - ground);
}
function placePath() { return `projects/${encodeURIComponent(projectId)}/plan_placements.json`; }
/* opts.fresh: läs om från GitHub även om vi nyss skrev filen själva (t.ex. när 3D-vyn i
   lägesplanen har sparat ändringar). */
async function place3dLoad(opts = {}) {
  if (!projectId) return;
  try { placements = (await ghReadJSON(settings.githubToken, placePath(), opts.fresh ? { fresh: true } : undefined)) || []; }
  catch (e) { placements = []; console.warn("Kunde inte läsa plan_placements.json", e); }
  if (typeof placeAssetsLoad === "function") await placeAssetsLoad(opts);
  placeLoaded = true; placeDirty.clear(); placeDeleted.clear(); placeUndoStack = []; placeRedoStack = [];
  if (!placements.some(p => p.id === placeActiveId)) placeActiveId = null;
  renderPlacePanel(); placeRedraw();
}
const placeActive = () => placements.find(p => p.id === placeActiveId) || null;
const placeIsNew = p => !p.ifc_at || String(p.updated_at || "") > String(p.ifc_at);

// ---------------------------------------------------------------------
// Geometri: delar (raka prismor) i världskoordinater
// ---------------------------------------------------------------------
/* Lokal punkt (längs, tvärs) -> världens x/y kring insättningspunkten, vridet rot grader. */
function placeToWorld(p, a, b) {
  const t = (Number(p.rot) || 0) * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  return [p.x + a * c - b * s, p.y + a * s + b * c];
}
const placeRect = (p, a0, a1, b0, b1) => [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, b]) => placeToWorld(p, a, b));
function placeCircle(p, r, n) {
  const out = [];
  for (let i = 0; i < n; i++) { const t = 2 * Math.PI * i / n; out.push([p.x + r * Math.cos(t), p.y + r * Math.sin(t)]); }
  return out;
}
/* Delarna: { poly: [[x,y]…] moturs, z0, z1, role, transp } – z i meter. ringN = hörn i räckviddscirkeln. */
function placeParts(p, ringN = 48) {
  const z = (Number(p.z) || 0) + (Number(p.dz) || 0), H = Math.max(0.01, Number(p.H) || 0);
  const L = Math.max(0.01, Number(p.L) || 0), B = Math.max(0.01, Number(p.B) || 0), lib = placeLib(p.type) || {};
  const tr = Number(lib.transp) || 0;
  if (lib.isModel) {
    // Egen modell: förhandsvisningen är modellens omslutande låda.
    const a = lib.model;
    if (!a || !a.bbox) return [];
    const k = placeScale(p), b = a.bbox;
    return [{ poly: placeRect(p, b.min[0] * k, b.max[0] * k, b.min[1] * k, b.max[1] * k), z0: z + b.min[2] * k, z1: z + b.max[2] * k, role: "body", transp: 0 }];
  }
  if (lib.fence) {
    const P = p.pts || [];
    const parts = [];
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d < 0.01) continue;
      const ux = (b[0] - a[0]) / d, uy = (b[1] - a[1]) / d, w = 0.03;
      const z0 = Math.min(a[2] || 0, b[2] || 0) + (Number(p.dz) || 0);
      parts.push({ poly: [[a[0] + uy * w, a[1] - ux * w], [b[0] + uy * w, b[1] - ux * w], [b[0] - uy * w, b[1] + ux * w], [a[0] - uy * w, a[1] + ux * w]], z0, z1: z0 + H, role: "body", transp: tr });
    }
    return parts;
  }
  const body = { poly: placeRect(p, -L / 2, L / 2, -B / 2, B / 2), z0: z, z1: z + H, role: "body", transp: tr };
  const R = Number(p.R) || 0;
  if (p.type === "tornkran") {
    const parts = [body, { poly: placeRect(p, -R * 0.3, R, -0.6, 0.6), z0: z + H, z1: z + H + 1.8, role: "body", transp: tr }];
    if (R > 0) parts.push({ poly: placeCircle(p, R, ringN), z0: z, z1: z + 0.05, role: "reach", transp: 0.8 });
    return parts;
  }
  if (p.type === "mobilkran" && R > 0) return [body, { poly: placeCircle(p, R, ringN), z0: z, z1: z + 0.05, role: "reach", transp: 0.8 }];
  return [body];
}

/* Linjer till förhandsvisningen. full = trådmodell (aktivt objekt), annars bara fotavtrycket. */
function placeSegments(p, full) {
  const segs = [];
  const ring = (poly, z) => poly.forEach((q, i) => { const r = poly[(i + 1) % poly.length]; segs.push([[q[0], q[1], z], [r[0], r[1], z]]); });
  const parts = placeParts(p, 24);
  if (!full) {
    if ((placeLib(p.type) || {}).fence) parts.forEach(pt => { const [a, b] = [pt.poly[0], pt.poly[1]]; segs.push([[a[0], a[1], pt.z0], [b[0], b[1], pt.z0]]); });
    else if (parts[0]) ring(parts[0].poly, parts[0].z0);
    return segs;
  }
  if ((placeLib(p.type) || {}).fence) {
    // Staket: underkant, överkant och en stolpe i varje punkt (mittlinjen räcker).
    const P = p.pts || [], dz = Number(p.dz) || 0, H = Number(p.H) || 0;
    P.forEach((a, i) => {
      const z0 = (a[2] || 0) + dz;
      segs.push([[a[0], a[1], z0], [a[0], a[1], z0 + H]]);
      if (i) { const b = P[i - 1], zb = (b[2] || 0) + dz; segs.push([[b[0], b[1], zb], [a[0], a[1], z0]], [[b[0], b[1], zb + H], [a[0], a[1], z0 + H]]); }
    });
    return segs;
  }
  const L0 = placeLib(p.type) || {};
  if (L0.isModel && L0.model && Array.isArray(L0.model.outline) && L0.model.outline.length && parts[0]) {
    // Egen modell: förenklad konturbild (de längsta raka kanterna, högst ~36 linjer) + fotavtryck.
    const k = placeScale(p), z = (Number(p.z) || 0) + (Number(p.dz) || 0);
    const w = q => { const [x, y] = placeToWorld(p, q[0] * k, q[1] * k); return [x, y, z + q[2] * k]; };
    L0.model.outline.forEach(([a, b]) => segs.push([w(a), w(b)]));
    ring(parts[0].poly, parts[0].z0);
    return segs;
  }
  parts.forEach(pt => {
    if (pt.role === "reach") { ring(pt.poly, pt.z0); return; }
    ring(pt.poly, pt.z0); ring(pt.poly, pt.z1);
    pt.poly.forEach(q => segs.push([[q[0], q[1], pt.z0], [q[0], q[1], pt.z1]]));
  });
  return segs;
}

// ---------------------------------------------------------------------
// Förhandsvisning (få linjer, bara vid ändring)
// ---------------------------------------------------------------------
function placeRedraw() {
  clearTimeout(placeDrawTimer);
  placeDrawTimer = setTimeout(placeDrawNow, 120);
}
function placePreviewLines() {
  const toMm = q => ({ positionX: q[0] * 1000, positionY: q[1] * 1000, positionZ: (q[2] || 0) * 1000 });
  const grey = { r: 107, g: 114, b: 128, a: 255 };
  const lines = [];
  const act = placeActive();
  if (act) { const c = hexToRgbaObj(act.color || "#7c3aed"); placeSegments(act, true).forEach(([a, b]) => lines.push({ start: toMm(a), end: toMm(b), color: c })); }
  if (placeMode && placeMode.pts && placeMode.pts.length) {
    const red = { r: 220, g: 38, b: 38, a: 255 }, P = placeMode.pts, d = 0.3;
    P.forEach(q => { lines.push({ start: toMm([q[0] - d, q[1], q[2]]), end: toMm([q[0] + d, q[1], q[2]]), color: red }, { start: toMm([q[0], q[1] - d, q[2]]), end: toMm([q[0], q[1] + d, q[2]]), color: red }); });
    for (let i = 1; i < P.length; i++) lines.push({ start: toMm(P[0]), end: toMm(P[i]), color: red });
  }
  for (const p of placements) {
    if (p === act || !placeIsNew(p)) continue;
    const segs = placeSegments(p, false);
    if (lines.length + segs.length > PLACE_MAX_LINES) break;
    segs.forEach(([a, b]) => lines.push({ start: toMm(a), end: toMm(b), color: grey }));
  }
  return lines;
}
async function placeDrawNow() {
  if (typeof API === "undefined" || !API || !API.markup) return;
  const am = placeActive() && (placeLib(placeActive().type) || {}).model;
  if (am && !am._meshFailed && (am.kind === "ifc" ? !(am.meshPath && am.outline) : !am.outline) && typeof placeEnsureOutline === "function") placeEnsureOutline(am);
  const seq = ++placeDrawSeq;
  const lines = placePreviewLines();
  const old = placeShownIds; placeShownIds = [];
  // Nya först, sedan bort med de gamla (mindre blink). Inga linjer = bara bort.
  let ids = [];
  if (lines.length) {
    try { const added = await API.markup.addLineMarkups(lines); ids = await addedLineIds(lines, added); }
    catch (e) { console.warn("Placera i 3D: kunde inte rita förhandsvisningen", e); }
  }
  await clearMarkupIds(old);
  if (seq !== placeDrawSeq) { await clearMarkupIds(ids); return; }
  placeShownIds = ids;
}

// ---------------------------------------------------------------------
// Ändringar, ångra och sparning
// ---------------------------------------------------------------------
let placeRedoStack = [];
function placeSnapshot() {
  placeUndoStack.push(JSON.stringify(placements));
  if (placeUndoStack.length > 60) placeUndoStack.shift();
  placeRedoStack = []; // en ny ändring gör att "gör om" inte längre gäller
}
function placeTouch(p) { p.updated_at = new Date().toISOString(); placeDirty.add(p.id); placeDeleted.delete(p.id); placeScheduleSave(); }
function placeUndo() {
  const prev = placeUndoStack.pop();
  if (!prev) return;
  placeRedoStack.push(JSON.stringify(placements));
  placeRestoreState(prev);
}
/* Gör om det som senast ångrades. */
function placeRedo() {
  const next = placeRedoStack.pop();
  if (!next) return;
  placeUndoStack.push(JSON.stringify(placements));
  placeRestoreState(next);
}
/* Återställer listan till ett sparat läge och markerar skillnaden för sparning. */
function placeRestoreState(json) {
  const before = JSON.parse(json), keep = new Set(before.map(p => p.id));
  placements.forEach(p => { if (!keep.has(p.id)) { placeDeleted.add(p.id); placeDirty.delete(p.id); } });
  placements = before;
  placements.forEach(p => { placeDirty.add(p.id); placeDeleted.delete(p.id); });
  if (!placements.some(p => p.id === placeActiveId)) placeActiveId = null;
  placeMode = null;
  placeScheduleSave(); renderPlacePanel(); placeRedraw();
}
function placeScheduleSave() {
  clearTimeout(placeSaveTimer);
  placeSaveTimer = setTimeout(placeSaveNow, 900);
}
async function placeSaveNow() {
  clearTimeout(placeSaveTimer); placeSaveTimer = null;
  if (!placeDirty.size && !placeDeleted.size) return;
  const dirty = new Set(placeDirty), del = new Set(placeDeleted);
  placeDirty.clear(); placeDeleted.clear();
  const mine = placements.filter(p => dirty.has(p.id)).map(p => JSON.parse(JSON.stringify(p)));
  try {
    // Bara de egna, ändrade posterna skrivs – kollegors placeringar i filen lämnas orörda.
    await ghWriteJSON(settings.githubToken, placePath(), arr => {
      const out = (arr || []).filter(p => !del.has(p.id)).map(p => (dirty.has(p.id) ? mine.find(m => m.id === p.id) : p));
      mine.forEach(m => { if (!out.some(p => p.id === m.id)) out.push(m); });
      return out;
    }, `Placera i 3D (${mine.length + del.size} ändring${mine.length + del.size === 1 ? "" : "ar"})`);
    setPlaceStatus("Sparat.");
  } catch (e) {
    dirty.forEach(id => placeDirty.add(id)); del.forEach(id => placeDeleted.add(id));
    setPlaceStatus("Kunde inte spara placeringarna: " + e.message + " – försöker igen vid nästa ändring.", true);
  }
}

/* Flyttar ett objekt (och staketets punkter) dx/dy/dz meter. */
function placeShift(p, dx, dy, dz = 0) {
  p.x = placeR3(p.x + dx); p.y = placeR3(p.y + dy);
  if (dz) p.dz = placeR3((Number(p.dz) || 0) + dz);
  if (p.pts) p.pts = p.pts.map(a => [placeR3(a[0] + dx), placeR3(a[1] + dy), a[2] || 0]);
}
/* Vrider ett objekt deg grader kring punkten (cx, cy) i plan: läget flyttas runt punkten och
   objektets egen vridning ökar lika mycket (staketets punkter vrids med). */
function placeRotateAbout(p, cx, cy, deg) {
  const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  const rot = (x, y) => [placeR3(cx + (x - cx) * c - (y - cy) * s), placeR3(cy + (x - cx) * s + (y - cy) * c)];
  [p.x, p.y] = rot(p.x, p.y);
  if (p.pts) p.pts = p.pts.map(q => [...rot(q[0], q[1]), q[2] || 0]);
  if (!(placeLib(p.type) || {}).fence) p.rot = Math.round((((Number(p.rot) || 0) + deg) % 360 + 360) % 360 * 10) / 10;
}
/* Objektets längd längs och tvärs (meter), för kopiornas avstånd. */
function placeExtent(p) {
  const l = placeLib(p.type) || {};
  if (l.isModel) { const b = l.model && l.model.bbox, k = placeScale(p); return b ? [(b.max[0] - b.min[0]) * k, (b.max[1] - b.min[1]) * k] : [1, 1]; }
  if (l.fence) { const P = p.pts || []; const xs = P.map(q => q[0]), ys = P.map(q => q[1]); return P.length ? [Math.max(...xs) - Math.min(...xs) || 1, Math.max(...ys) - Math.min(...ys) || 1] : [1, 1]; }
  return [Number(p.L) || 1, Number(p.B) || 1];
}
/* Nästa lediga namn "Bas N": ett högre nummer än alla befintliga med samma bas (aldrig en dubblett,
   även när objekt tagits bort emellan). extra = namn som just skapats men inte lagts till än. */
function placeNextName(name, extra = []) {
  const base = String(name || "").replace(/\s+\d+$/, "").trim() || "Objekt";
  const re = new RegExp("^" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+(\\d+)$");
  let max = 0;
  for (const n of [...placements.map(p => p.name), ...extra]) { const m = re.exec(String(n || "").trim()); if (m) max = Math.max(max, Number(m[1])); }
  return `${base} ${max + 1}`;
}
/* n kopior av p i rad, avstånd step meter längs (along) eller tvärs objektet. Returnerar kopiorna. */
function placeCopies(p, n, step, along = true) {
  const t = (Number(p.rot) || 0) * Math.PI / 180;
  const ux = along ? Math.cos(t) : -Math.sin(t), uy = along ? Math.sin(t) : Math.cos(t);
  const base = p.name.replace(/\s+\d+$/, "");
  const out = [];
  for (let i = 1; i <= n; i++) {
    const c = JSON.parse(JSON.stringify(p));
    Object.assign(c, { id: ghNewId(), created_at: new Date().toISOString(), by: settings.userName || null });
    delete c.ifc_at;
    c.name = placeNextName(base, out.map(o => o.name));
    placeShift(c, ux * step * i, uy * step * i);
    out.push(c);
  }
  return out;
}
let placeNudgeAt = 0;
/* Finjustering (knappar/piltangenter): ett steg i ångra per sekvens. */
function placeNudge(dx, dy, dz, drot) {
  const act = placeActive();
  if (!act) return;
  if (Date.now() - placeNudgeAt > 1200) placeSnapshot();
  placeNudgeAt = Date.now();
  placeShift(act, dx, dy, dz);
  if (drot) act.rot = Math.round((((Number(act.rot) || 0) + drot) % 360 + 360) % 360 * 10) / 10;
  placeTouch(act); placeRedraw();
  const box = document.getElementById("placePanel");
  const r = box && box.querySelector('[data-pf="rot"]'); if (r && document.activeElement !== r) r.value = act.rot;
  const z = box && box.querySelector('[data-pf="dz"]'); if (z && document.activeElement !== z) z.value = act.dz;
  const za = box && box.querySelector('[data-pf="zAbs"]'); if (za && document.activeElement !== za) za.value = placeBaseZ(act);
  placeRefreshLight();
}
function placeStep() { try { return Number(localStorage.getItem("4dplan-place-step")) || 0.5; } catch (e) { return 0.5; } }

function placeStart(type) {
  if (typeof API === "undefined" || !API || !API.markup) { alert("Trimble Connect stöder inte förhandsvisning i den här vyn."); return; }
  if (!projectId) { alert("Inget projekt är inläst än."); return; }
  placeMode = (placeLib(type) || {}).fence ? { kind: "fence", type, id: null } : { kind: "place", type };
  renderPlacePanel();
}
function placeNew(type, pt) {
  const lib = placeLib(type);
  const p = { id: ghNewId(), type, name: placeNextName(lib.label), x: placeR3(pt[0]), y: placeR3(pt[1]), z: placeR3(pt[2] || 0),
    L: lib.L || 0, B: lib.B || 0, H: lib.H, R: lib.R || 0, rot: 0, dz: 0, color: lib.color,
    created_at: new Date().toISOString(), by: settings.userName || null };
  if (lib.fence) p.pts = [[p.x, p.y, p.z]];
  if (lib.isModel) { p.scale = (lib.model && lib.model.scale) || 1; p.L = 0; p.B = 0; p.H = 0; p.color = "#64748b"; }
  return p;
}

/* Anropas från onWorkspaceEvent. true = händelsen är hanterad. */
function place3dEvent(event, data) {
  if (!placeMode) return false;
  const d = data && data.data !== undefined ? data.data : data;
  if (event === "viewer.onPicked") {
    const q = d && (d.position || d.point || d.hitPoint);
    if (!q || q.x === undefined) return true;
    const pt = [q.x, q.y, q.z || 0];
    const m = placeMode, act = placeActive();
    placeSnapshot();
    if (m.kind === "place") {
      const p = placeNew(m.type, pt);
      placements.push(p); placeActiveId = p.id; placeMode = null; placeTouch(p);
    } else if (m.kind === "fence") {
      let p = m.id && placements.find(x => x.id === m.id);
      if (!p) { p = placeNew(m.type, pt); placements.push(p); m.id = p.id; placeActiveId = p.id; }
      else p.pts.push(pt.map(placeR3));
      placeTouch(p);
    } else if (m.kind === "move" && act) {
      const dx = pt[0] - act.x, dy = pt[1] - act.y, dzz = pt[2] - act.z;
      if (act.pts) act.pts = act.pts.map(a => [placeR3(a[0] + dx), placeR3(a[1] + dy), placeR3((a[2] || 0) + dzz)]);
      Object.assign(act, { x: placeR3(pt[0]), y: placeR3(pt[1]), z: placeR3(pt[2]) });
      placeMode = null; placeTouch(act);
    } else if (m.kind === "p2p" && act) {
      // Punkt till punkt: första trycket på objektet (t.ex. ett hörn), andra dit punkten ska.
      m.pts.push(pt);
      if (m.pts.length === 2) {
        const [a, b] = m.pts;
        placeShift(act, b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        placeMode = null; placeTouch(act);
        setPlaceStatus(`Flyttat ${(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])).toLocaleString("sv-SE", { maximumFractionDigits: 2 })} m. Spara som IFC för att se objektet på det nya stället.`);
      } else placeUndoStack.pop(); // ett steg i ångra för hela flytten
    } else if (m.kind === "rot3" && act) {
      // Vrid kring punkt: vridpunkt, utgångsriktning, ny riktning (fäster var 15:e grad när man är nära).
      m.pts.push(pt);
      if (m.pts.length === 3) {
        const [c, r, t] = m.pts;
        let deg = (Math.atan2(t[1] - c[1], t[0] - c[0]) - Math.atan2(r[1] - c[1], r[0] - c[0])) * 180 / Math.PI;
        deg = ((deg + 180) % 360 + 360) % 360 - 180;
        const snap = Math.round(deg / 15) * 15;
        deg = Math.abs(deg - snap) < 2 ? snap : Math.round(deg * 10) / 10;
        placeRotateAbout(act, c[0], c[1], deg);
        placeMode = null; placeTouch(act);
        setPlaceStatus(`Vridet ${deg.toLocaleString("sv-SE")}° kring punkten. Spara som IFC för att se objektet på det nya stället.`);
      } else placeUndoStack.pop();
    } else if (m.kind === "aim" && act) {
      const dx = pt[0] - act.x, dy = pt[1] - act.y;
      if (Math.hypot(dx, dy) > 0.05) { act.rot = Math.round(Math.atan2(dy, dx) * 180 / Math.PI * 10) / 10; placeTouch(act); }
      placeMode = null;
    } else placeMode = null;
    renderPlacePanel(); placeRedraw();
    return true;
  }
  // Tryck i modellen ska inte markera/koppla objekt medan man placerar.
  if (event === "viewer.onSelectionChanged" || event === "extension.onSelectionChanged") return true;
  return false;
}

// ---------------------------------------------------------------------
// IFC
// ---------------------------------------------------------------------
/* Fast IFC-GUID (22 tecken) från placeringens id, så att en ny filversion behåller objektens id. */
function placeGuid(id, salt = "") {
  let hex = String(id).replace(/[^0-9a-f]/gi, "").toLowerCase();
  if (hex.length !== 32 || salt) {
    // FNV-1a i fyra varv -> 128 bitar
    hex = "";
    for (let k = 0; k < 4; k++) {
      let h = 0x811c9dc5 ^ k;
      for (const ch of `${id}|${salt}|${k}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
      hex += h.toString(16).padStart(8, "0");
    }
  }
  let n = BigInt("0x" + hex), out = "";
  for (let i = 0; i < 22; i++) { out = IFC_GUID_CHARS[Number(n & 63n)] + out; n >>= 6n; }
  return out;
}
/* Ett rakt prisma (moturs polygon) som IfcTriangulatedFaceSet, lokalt kring o. */
function placePrismMesh(doc, poly, z0, z1, o) {
  const n = poly.length;
  const pts = [...poly.map(q => [q[0] - o[0], q[1] - o[1], z0 - o[2]]), ...poly.map(q => [q[0] - o[0], q[1] - o[1], z1 - o[2]])];
  const faces = [];
  for (let k = 1; k + 1 < n; k++) faces.push([1, k + 2, k + 1], [n + 1, n + k + 1, n + k + 2]);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; faces.push([i + 1, j + 1, j + n + 1], [i + 1, j + n + 1, i + n + 1]); }
  const pl = doc.E(`IFCCARTESIANPOINTLIST3D((${pts.map(ifcPt).join(",")}))`);
  return doc.E(`IFCTRIANGULATEDFACESET(${pl},$,.T.,(${faces.map(f => `(${f.join(",")})`).join(",")}),$)`);
}
function placeItemOf(p) { return p.itemId && typeof items !== "undefined" ? items.find(x => x.id === p.itemId) || null : null; }
function buildPlacementsIfc(projName) {
  // Egna IFC-modeller blir egna filer (se placeModelIfcFiles); GLB-modeller följer med här.
  const list = placements.filter(p => {
    const l = placeLib(p.type) || {};
    if (l.isModel) return !!(l.model && l.model.kind === "mesh" && typeof placeMeshReady === "function" && placeMeshReady(l.model.id));
    return placeParts(p).length;
  });
  if (!list.length) return null;
  const doc = ifcDoc("4D-planering – " + (projName || "etablering"), "Placerade objekt från 4D-planering", "4D-planering"), E = doc.E;
  const elems = [];
  list.forEach(p => {
    const lib = placeLib(p.type) || { label: p.type };
    const parts = placeParts(p);
    const o = [Math.round(p.x), Math.round(p.y), placeR3((Number(p.z) || 0) + (Number(p.dz) || 0))];
    const it = placeItemOf(p);
    const start = p.start || (it && it.startDate) || "", end = p.end || (it && it.endDate) || "";
    const mk = (role, name, salt) => {
      const meshes = lib.isModel ? (role === "body" ? placeModelMeshes(doc, p, o) : []) : parts.filter(pt => pt.role === role).map(pt => {
        const m = placePrismMesh(doc, pt.poly, pt.z0, pt.z1, o);
        const col = p.color || lib.color || "#888888";
        E(`IFCSTYLEDITEM(${m},(${doc.style(`${col}:${pt.transp}`, col, lib.label, pt.transp)}),$)`);
        return m;
      });
      if (!meshes.length) return null;
      const el = E(`IFCBUILDINGELEMENTPROXY('${placeGuid(p.id, salt)}',$,${ifcStr(name)},${ifcStr("Placerad i 4D-planering")},${ifcStr(lib.label)},${doc.place(o)},${doc.shape(meshes.join(","), "Tessellation")},${ifcStr(p.id)},.NOTDEFINED.)`);
      elems.push(el);
      return el;
    };
    const el = mk("body", p.name || lib.label, "");
    const props = [["Typ", lib.isModel ? "Egen modell" : lib.label], ["Namn", p.name || ""]];
    if (lib.isModel) {
      const a = lib.model, b = a.bbox, k = placeScale(p);
      props.push(["Modell", a.name || ""], ["Källa", a.source || ""], ["Upphov", a.author || ""], ["Licens", a.license || ""], ["Länk", a.url || ""],
        ["Skala", k], ["Vridning grader", Number(p.rot) || 0], ["Bredd m", placeR3((b.max[0] - b.min[0]) * k)], ["Djup m", placeR3((b.max[1] - b.min[1]) * k)]);
      p = { ...p, H: (b.max[2] - b.min[2]) * k };
    } else if (!lib.fence) props.push(["Längd m", placeR3(Number(p.L) || 0)], ["Bredd m", placeR3(Number(p.B) || 0)], ["Vridning grader", Number(p.rot) || 0]);
    else props.push(["Längd m", placeR3(parts.reduce((s, pt) => s + Math.hypot(pt.poly[1][0] - pt.poly[0][0], pt.poly[1][1] - pt.poly[0][1]), 0))]);
    props.push(["Höjd m", placeR3(Number(p.H) || 0)]);
    if (Number(p.R) > 0) props.push(["Räckvidd m", placeR3(Number(p.R))]);
    props.push(["Start", start], ["Slut", end], ["Aktivitet", it ? (it.objectName || it.activity || "") : ""], ["4D-ID", p.itemId || ""], ["Placerad av", p.by || ""], ["Placerings-ID", p.id]);
    if (el) doc.props(el, props);
    const reach = mk("reach", `${p.name || lib.label} – räckvidd`, "reach");
    if (reach) doc.props(reach, [["Typ", `${lib.label} räckvidd`], ["Räckvidd m", placeR3(Number(p.R) || 0)], ["Start", start], ["Slut", end], ["Placerings-ID", p.id]]);
  });
  return { text: doc.finish(elems, `Etablering ${projName || ""}.ifc`), n: list.length };
}
async function placeSaveIfc() {
  await placeSaveNow();
  let projName = "";
  try { projName = ((await API.project.getProject()) || {}).name || ""; } catch (e) { /* utan namn */ }
  // Egna modeller: GLB-geometrin hämtas in, IFC-modellerna blir egna (flyttade) filer.
  if (typeof placeModelsPrepare === "function") await placeModelsPrepare();
  const r = buildPlacementsIfc(projName);
  const stamp = placeStamp();
  const extra = typeof placeModelIfcFiles === "function" ? await placeModelIfcFiles(stamp) : [];
  if (!r && !extra.length) { alert("Det finns inga placerade objekt att spara. Välj ett objekt och tryck i modellen."); return null; }
  // Ny fil varje gång (datum + klockslag) – en tidigare export skrivs aldrig över.
  const name = `Etablering ${projName || "4D-planering"} ${stamp}.ifc`.replace(/[\\/:*?"<>|]/g, "-");
  const files = [...(r ? [new File([new TextEncoder().encode(r.text)], name, { type: "application/x-step" })] : []), ...extra];
  const n = (r ? r.n : 0) + extra.length;
  setPlaceStatus(`Sparar ${n} objekt som IFC i Trimble Connect…`);
  let upRes = null;
  try {
    upRes = await tcUploadFiles(files, PLACE_TC_FOLDER);
  } catch (e) {
    // Reserv: en lokal kopia, så att inget arbete går förlorat.
    files.forEach(f => {
      const url = URL.createObjectURL(f);
      const a = document.createElement("a"); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    });
    setPlaceStatus(`Kunde inte spara i Trimble Connect (${e.message}). Filerna laddades ned i stället.`, true);
    return { n, name, tc: null, error: e.message };
  }
  const at = new Date().toISOString();
  placements.forEach(p => { if (placeIsNew(p)) { p.ifc_at = at; placeDirty.add(p.id); } });
  await placeSaveNow();
  const etabId = r ? placeUploadedId(upRes, name) : null;
  const shown = await placeShowUploaded(upRes);
  const coupled = r && etabId ? await placeCouple4D(etabId) : { n: 0 };
  setPlaceStatus(`✓ ${n} objekt sparade i mappen "${PLACE_TC_FOLDER}" (${files.map(f => f.name).join(", ")}).${shown ? " Den nya filen visas i 3D-vyn och den förra är släckt." : " Öppna filen i 3D-vyn för att se dem."}${coupled.n ? ` ${coupled.n} ${coupled.n === 1 ? "objekt kopplat" : "objekt kopplade"} till sina aktiviteter (4D).` : ""}`);
  renderPlacePanel(); placeRedraw();
  return { n, name, files: files.map(f => f.name), coupled: coupled.n };
}

/* Trimble Connect-id för en uppladdad fil (från files/fs/commit), eller null. */
function placeUploadedId(upRes, name) {
  const f = upRes && Array.isArray(upRes.files) ? upRes.files.find(x => x.name === name) : null;
  const r = f && f.res;
  return r ? String(r.id || r.fileId || (r.file && r.file.id) || "") || null : null;
}
const placeLastKey = () => `4dplan-place-lastfiles-${projectId}`;
/* Tänder de nya filerna i 3D-vyn och släcker de som förra sparningen tände (så att objekten inte
   syns dubbelt). Best-effort: Trimble Connect kan behöva bearbeta filen först. */
async function placeShowUploaded(upRes) {
  const ids = (upRes && Array.isArray(upRes.files) ? upRes.files : []).map(f => placeUploadedId(upRes, f.name)).filter(Boolean);
  if (!ids.length || typeof API === "undefined" || !API || !API.viewer || !API.viewer.toggleModel) return false;
  let prev = [];
  try { prev = JSON.parse(localStorage.getItem(placeLastKey()) || "[]"); } catch (e) {}
  let ok = false;
  for (const id of ids) { try { await API.viewer.toggleModel(id, true); ok = true; } catch (e) { console.warn("Kunde inte tända", id, e); } }
  if (ok) for (const id of prev.filter(x => !ids.includes(x))) { try { await API.viewer.toggleModel(id, false); } catch (e) { /* redan släckt/borta */ } }
  try { localStorage.setItem(placeLastKey(), JSON.stringify(ids)); } catch (e) {}
  return ok;
}
/* 4D: placeringar som är kopplade till en aktivitet kopplas också som 3D-objekt i planeringen
   (objektets fasta IFC-id i den nya filen), så att de färgas/visas på tidslinjen som andra
   objekt. Finns kopplingen redan (samma IFC-id) flyttas den bara till den nya filen. */
async function placeCouple4D(fileId) {
  if (typeof items === "undefined" || typeof coupleItemToModelObjects !== "function" || typeof isBackendConfigured === "function" && !isBackendConfigured()) return { n: 0 };
  const todo = placements.filter(p => p.itemId && items.some(it => it.id === p.itemId) && placeParts(p).length &&
    !(((placeLib(p.type) || {}).model || {}).kind === "ifc"));
  const move = [];
  let n = 0;
  for (const p of todo) {
    const guid = placeGuid(p.id, "");
    const row = items.find(it => String(it.objectId) === guid);
    if (row) { if (row.modelId !== fileId) move.push(row); n++; continue; }
    await coupleItemToModelObjects(items.find(it => it.id === p.itemId), [{ modelId: fileId, objectId: guid }]);
    n++;
  }
  // Etablering (t.ex. mobilkran) står en viss tid: aktiviteten blir Temporär – syns i 3D bara mellan
  // start och slut – om ingen valt något annat (Victor 2026-10-09). Ett eget val (true/false) rörs inte.
  try {
    const coupled = items.filter(it => todo.some(p => p.itemId === it.id) || todo.some(p => String(it.objectId) === placeGuid(p.id, "")));
    const groups = new Set(coupled.map(it => it.groupId).filter(Boolean));
    const mark = items.filter(it => it.temporary === undefined && (coupled.includes(it) || (it.groupId && groups.has(it.groupId))));
    if (mark.length) {
      const ids = new Set(mark.map(it => it.id));
      mark.forEach(it => { it.temporary = true; });
      await ghWriteJSON(settings.githubToken, itemsPath(), arr => arr.map(r => (ids.has(r.id) && typeof r.temporary !== "boolean" ? { ...r, temporary: true } : r)), `Placera i 3D: etableringen temporär (${mark.length} objekt)`);
      if (typeof renderItemList === "function") renderItemList();
    }
  } catch (e) { setPlaceStatus("Kunde inte markera etableringen som temporär: " + e.message, true); }
  if (move.length) {
    const ids = new Set(move.map(r => r.id));
    move.forEach(r => { r.modelId = fileId; });
    try {
      await ghWriteJSON(settings.githubToken, itemsPath(), arr => arr.map(r => (ids.has(r.id) ? { ...r, model_id: fileId } : r)), `Placera i 3D: ${move.length} kopplingar till den nya IFC-filen`);
    } catch (e) { setPlaceStatus("Kunde inte flytta 4D-kopplingarna till den nya filen: " + e.message, true); }
    if (typeof renderItemList === "function") renderItemList();
  }
  return { n };
}

// ---------------------------------------------------------------------
// Panelen
// ---------------------------------------------------------------------
function setPlaceStatus(text, bad) {
  const el = document.getElementById("placeStatus");
  if (el) { el.textContent = text || ""; el.classList.toggle("place-bad", !!bad); }
}
function placeModeText() {
  if (!placeMode) return "";
  const lib = placeLib(placeMode.type) || {};
  return { place: `Tryck i modellen där ${lib.label ? lib.label.toLowerCase() : "objektet"} ska stå.`,
    fence: "Tryck punkter längs staketet. Tryck Klar när det är färdigt.",
    move: "Tryck i modellen dit objektet ska flyttas.",
    aim: "Tryck en punkt längs väggen/kanten – objektet vrids så att långsidan pekar dit.",
    p2p: (placeMode.pts || []).length ? "Tryck dit punkten ska (t.ex. hörnet på fundamentet eller väggen)." : "Tryck på en punkt på objektet, t.ex. ett hörn (den IFC-fil som är tänd i 3D-vyn går att trycka på).",
    rot3: ["Tryck på vridpunkten.", "Tryck en punkt som visar utgångsriktningen (t.ex. längs objektets kant).", "Tryck den nya riktningen – fäster var 15:e grad när du är nära."][(placeMode.pts || []).length] || "" }[placeMode.kind];
}
function placeListHtml() {
  const esc = typeof escapeHtml === "function" ? escapeHtml : s => String(s);
  return placements.map(p => {
    const l = placeLib(p.type) || { label: p.type };
    const dims = l.isModel ? placeModelDims(p) : l.fence ? `${Math.max(0, (p.pts || []).length - 1)} sträckor, h ${p.H} m` : `${p.L}×${p.B}×${p.H} m${Number(p.R) > 0 ? `, r ${p.R} m` : ""}`;
    return `<div class="place-row ${p.id === placeActiveId ? "on" : ""}" data-place-id="${esc(p.id)}"><i style="background:${p.color || l.color}"></i>
      <span class="pn">${esc(p.name || l.label)}</span><span class="hint">${dims}</span>
      <span class="place-state ${placeIsNew(p) ? "new" : ""}">${placeIsNew(p) ? "ej i IFC" : "i IFC"}</span></div>`;
  }).join("") || `<div class="hint">Inga placerade objekt än. Välj ett objekt ovan och tryck i modellen.</div>`;
}
/* Storleken på en egen modell (omslutande låda × skala). */
function placeModelDims(p) {
  const a = (placeLib(p.type) || {}).model;
  if (!a || !a.bbox) return "modellen saknas";
  const k = placeScale(p), b = a.bbox, f = v => Math.round(v * k * 10) / 10;
  return `${f(b.max[0] - b.min[0])}×${f(b.max[1] - b.min[1])}×${f(b.max[2] - b.min[2])} m${a.kind === "ifc" ? " (IFC)" : ""}`;
}
/* Datum och klockslag för filnamnet, t.ex. "2026-10-08 kl 21.45.07" (lokal tid, inga kolon). */
function placeStamp(d = new Date()) {
  const z = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} kl ${z(d.getHours())}.${z(d.getMinutes())}.${z(d.getSeconds())}`;
}
function placeSaveLabel() { const n = placements.filter(placeIsNew).length; return `Spara som IFC i Trimble Connect${n ? ` (${n} nya/ändrade)` : ""}`; }
/* Efter en ändring i ett fält: bara listan och knapparna – inte hela panelen (fokus och klick
   på nästa knapp ska inte tappas). */
function placeRefreshLight() {
  const box = document.getElementById("placePanel");
  if (!box) return;
  const list = box.querySelector(".place-list");
  if (list) { list.innerHTML = placeListHtml(); bindPlaceRows(box); }
  const u = box.querySelector("#placeUndo"); if (u) u.disabled = !placeUndoStack.length;
  const sv = box.querySelector("#placeSaveIfc"); if (sv) { sv.textContent = placeSaveLabel(); sv.disabled = !placements.length; }
}
function bindPlaceRows(box) {
  box.querySelectorAll("[data-place-id]").forEach(r => { r.onclick = () => { placeActiveId = r.dataset.placeId === placeActiveId ? null : r.dataset.placeId; placeMode = null; renderPlacePanel(); placeRedraw(); }; });
}
function renderPlacePanel() {
  const box = document.getElementById("placePanel");
  if (!box) return;
  const groups = {};
  Object.entries(PLACE_LIB).forEach(([k, l]) => { (groups[l.group] = groups[l.group] || []).push([k, l]); });
  const act = placeActive();
  const esc = typeof escapeHtml === "function" ? escapeHtml : s => String(s);
  const assets = typeof placeAssets !== "undefined" ? placeAssets : [];
  groups["Egna modeller"] = assets.map(a => [`model:${a.id}`, { label: a.name, color: a.kind === "ifc" ? "#0e7490" : "#64748b", title: [a.kind === "ifc" ? "IFC-fil" : "3D-modell", a.author ? `av ${a.author}` : "", a.license || ""].filter(Boolean).join(" · ") }]);
  const lib = Object.entries(groups).map(([g, list]) => `<div class="place-group"><span class="place-gl">${g}</span>${list.map(([k, l]) =>
    `<button type="button" data-place-type="${esc(k)}" class="${placeMode && placeMode.type === k ? "active" : ""}" ${l.title ? `title="${esc(l.title)}"` : ""}><i style="background:${l.color}"></i>${esc(l.label)}</button>`).join("")}${g === "Egna modeller" ? `<button type="button" id="placeOpenBrowser" class="place-add">+ Hämta modell</button>` : ""}</div>`).join("");
  const mode = placeMode ? `<div class="place-mode"><b>${esc(placeModeText())}</b>
      ${placeMode.kind === "fence" ? `<button type="button" id="placeFenceDone" class="primary">Klar</button>` : ""}
      <button type="button" id="placeModeCancel">Avbryt</button></div>` : "";
  let edit = "";
  if (act) {
    const L = placeLib(act.type) || {};
    const A = L.isModel ? L.model : null;
    const mH = A && A.bbox ? Math.round((A.bbox.max[2] - A.bbox.min[2]) * placeScale(act) * 100) / 100 : "";
    const f = (k, label, step = "0.1") => `<label>${label}<input type="number" step="${step}" data-pf="${k}" value="${act[k] ?? ""}" /></label>`;
    const itemOpts = typeof items !== "undefined" ? [...new Map(items.map(it => [it.id, it])).values()].slice(0, 2000) : [];
    edit = `<div class="place-edit">
      <div class="place-edit-head"><input type="text" data-pf="name" value="${esc(act.name || "")}" title="Namn" />
        ${L.isModel ? "" : `<input type="color" data-pf="color" value="${act.color || L.color || "#888888"}" title="Färg" />`}</div>
      ${L.isModel ? `<div class="hint">${esc(A ? `${A.name}${A.author ? ` av ${A.author}` : ""}${A.license ? ` (${A.license})` : ""}` : "Modellen finns inte längre i biblioteket")} · ${placeModelDims(act)}</div>` : ""}
      <div class="place-grid">
        ${L.isModel ? (A && A.kind === "mesh" ? `<label>Höjd m<input type="number" step="0.1" data-pf="mH" value="${mH}" title="Skalar modellen så att den blir så här hög" /></label>` + f("scale", "Skala", "0.01") : "")
          : L.fence ? f("H", "Höjd m") : f("L", "Längd m") + f("B", "Bredd m") + f("H", "Höjd m")}
        ${L.R ? f("R", "Räckvidd m", "1") : ""}
        ${L.fence ? "" : f("rot", "Vrid °", "1")}
        ${f("dz", "Höjd över punkten m")}
        <label title="Underkant i modellens koordinater (SWEREF 99 20 15, modellens höjdsystem)">Z underkant m<input type="number" step="0.01" data-pf="zAbs" value="${placeBaseZ(act)}" /></label>
      </div>
      ${L.fence ? "" : `<div class="row place-rot">
        <button type="button" data-rot="-15">↺ 15°</button><button type="button" data-rot="15">↻ 15°</button>
        <button type="button" data-rot="90">90°</button><button type="button" id="placeNorth" title="Långsidan i nord–sydlig riktning (modellens Y)">Norr</button>
        <button type="button" id="placeAim" title="Tryck en punkt längs en vägg eller kant">Rikta mot kant</button></div>`}
      <div class="place-grid">
        <label class="wide">Koppla till aktivitet (4D)<select data-pf="itemId"><option value="">– ingen –</option>${itemOpts.map(it =>
          `<option value="${esc(it.id)}" ${it.id === act.itemId ? "selected" : ""}>${esc(it.objectName || it.activity || it.id)}${it.startDate ? ` (${it.startDate} – ${it.endDate || ""})` : ""}</option>`).join("")}</select></label>
        <label>Start<input type="date" data-pf="start" value="${act.start || ""}" /></label>
        <label>Slut<input type="date" data-pf="end" value="${act.end || ""}" /></label>
      </div>
      <div class="place-nudge">
        <span class="place-gl">Finjustera</span>
        <select id="placeStepSel" title="Steglängd">${[0.1, 0.5, 1, 5].map(v => `<option value="${v}" ${v === placeStep() ? "selected" : ""}>${String(v).replace(".", ",")} m</option>`).join("")}</select>
        <button type="button" data-nudge="-1,0,0" title="Väster (X−) · ←">X−</button><button type="button" data-nudge="1,0,0" title="Öster (X+) · →">X+</button>
        <button type="button" data-nudge="0,1,0" title="Norr (Y+) · ↑">Y+</button><button type="button" data-nudge="0,-1,0" title="Söder (Y−) · ↓">Y−</button>
        <button type="button" data-nudge="0,0,1" title="Upp · Page Up">Upp</button><button type="button" data-nudge="0,0,-1" title="Ned · Page Down">Ned</button>
        ${L.fence ? "" : `<button type="button" data-nudge-rot="-1" title="Vrid 1° · ,">↺ 1°</button><button type="button" data-nudge-rot="1" title="Vrid 1° · .">↻ 1°</button>`}
      </div>
      <div class="hint place-keys">På datorn: piltangenterna flyttar, Page Up/Down höjer/sänker, , och . vrider (Skift = 10 gånger större steg).</div>
      <div class="place-nudge">
        <span class="place-gl">Kopiera</span>
        <label class="place-inl">Antal<input type="number" id="placeArrN" min="1" max="50" step="1" value="1" /></label>
        <label class="place-inl">Avstånd m<input type="number" id="placeArrD" step="0.1" value="${Math.round((placeExtent(act)[0] + 0.5) * 10) / 10}" /></label>
        <select id="placeArrDir"><option value="along">längs</option><option value="across">tvärs</option></select>
        <button type="button" id="placeCopy">Skapa kopior</button>
      </div>
      <div class="place-nudge">
        <span class="place-gl">Exakt</span>
        <button type="button" id="placeP2P" title="Som Flytta i SketchUp: tryck en punkt på objektet (t.ex. ett hörn på den tända IFC-filen) och sedan dit den ska">Punkt till punkt</button>
        ${L.fence ? "" : `<button type="button" id="placeRot3" title="Som Vrid i SketchUp: vridpunkt, utgångsriktning och ny riktning">Vrid kring punkt</button>`}
      </div>
      <div class="row"><button type="button" id="placeMove">Flytta (tryck ny punkt)</button>
        ${L.fence ? `<button type="button" id="placeFenceMore">Lägg till punkter</button>` : ""}
        <button type="button" id="placeDone">Klar</button>
        <button type="button" id="placeDelete" class="danger-text">Ta bort</button></div>
    </div>`;
  }
  box.innerHTML = `<div class="place-lib">${lib}</div>${mode}${edit}
    <div class="place-list">${placeListHtml()}</div>
    <div class="row"><button type="button" id="placeUndo" ${placeUndoStack.length ? "" : "disabled"}>↶ Ångra</button>
      <button type="button" id="placeSaveIfc" class="primary" ${placements.length ? "" : "disabled"}>${placeSaveLabel()}</button></div>
    <div class="hint">Sparas i mappen "${PLACE_TC_FOLDER}". Varje sparning blir en ny fil med datum och klockslag – tidigare filer skrivs inte över.</div>`;
  bindPlacePanel(box, act);
}
function bindPlacePanel(box, act) {
  box.querySelectorAll("[data-place-type]").forEach(b => { b.onclick = () => placeStart(b.dataset.placeType); });
  bindPlaceRows(box);
  const on = (id, fn) => { const el = box.querySelector("#" + id); if (el) el.onclick = fn; };
  on("placeModeCancel", () => { placeMode = null; renderPlacePanel(); });
  on("placeFenceDone", () => { placeMode = null; renderPlacePanel(); placeRedraw(); });
  on("placeUndo", placeUndo);
  on("placeOpenBrowser", () => { if (typeof placeBrowserToggle === "function") placeBrowserToggle(true); });
  on("placeSaveIfc", () => { placeSaveIfc().catch(e => setPlaceStatus("Kunde inte spara som IFC: " + e.message, true)); });
  if (!act) return;
  const change = (fn, live) => { if (!live) placeSnapshot(); fn(act); placeTouch(act); placeRedraw(); };
  box.querySelectorAll("[data-pf]").forEach(inp => {
    const k = inp.dataset.pf;
    const apply = a => {
      if (k === "name" || k === "color" || k === "start" || k === "end") a[k] = inp.value;
      else if (k === "itemId") {
        a.itemId = inp.value || null;
        const it = placeItemOf(a);
        if (it) { a.start = it.startDate || a.start || ""; a.end = it.endDate || a.end || ""; }
      } else {
        const v = placeNum(inp.value, a[k]);
        if (k === "mH") { const A = (placeLib(a.type) || {}).model, h = A && A.bbox ? A.bbox.max[2] - A.bbox.min[2] : 0; if (h > 0 && v > 0) a.scale = Math.round(v / h * 10000) / 10000; return; }
        if (k === "scale") { a.scale = Math.max(0.0001, v); return; }
        if (k === "zAbs") { placeSetBaseZ(a, placeNum(inp.value, placeBaseZ(a))); return; }
        a[k] = k === "rot" ? ((v % 360) + 360) % 360 : k === "dz" ? v : Math.max(k === "R" ? 0 : 0.01, v);
      }
    };
    // Mått: förhandsvisningen följer med medan man skriver; ett steg i ångra per ändring.
    if (inp.type === "number") { inp.onfocus = () => placeSnapshot(); inp.oninput = () => change(apply, true); inp.onchange = placeRefreshLight; }
    else inp.onchange = () => { change(apply); if (k === "itemId") renderPlacePanel(); else placeRefreshLight(); };
  });
  box.querySelectorAll("[data-rot]").forEach(b => { b.onclick = () => { change(a => { a.rot = (((Number(a.rot) || 0) + Number(b.dataset.rot)) % 360 + 360) % 360; }); renderPlacePanel(); }; });
  on("placeNorth", () => { change(a => { a.rot = 90; }); renderPlacePanel(); });
  on("placeAim", () => { placeMode = { kind: "aim" }; renderPlacePanel(); });
  on("placeMove", () => { placeMode = { kind: "move" }; renderPlacePanel(); });
  on("placeP2P", () => { placeMode = { kind: "p2p", pts: [] }; renderPlacePanel(); placeRedraw(); });
  on("placeRot3", () => { placeMode = { kind: "rot3", pts: [] }; renderPlacePanel(); placeRedraw(); });
  on("placeFenceMore", () => { placeMode = { kind: "fence", type: act.type, id: act.id }; renderPlacePanel(); });
  const stepSel = box.querySelector("#placeStepSel");
  if (stepSel) stepSel.onchange = () => { try { localStorage.setItem("4dplan-place-step", stepSel.value); } catch (e) {} };
  box.querySelectorAll("[data-nudge]").forEach(b => { b.onclick = () => { const [x, y, z] = b.dataset.nudge.split(",").map(Number), st = placeStep(); placeNudge(x * st, y * st, z * st, 0); }; });
  box.querySelectorAll("[data-nudge-rot]").forEach(b => { b.onclick = () => placeNudge(0, 0, 0, Number(b.dataset.nudgeRot)); });
  const arrD = box.querySelector("#placeArrD"), arrDir = box.querySelector("#placeArrDir");
  if (arrDir) arrDir.onchange = () => { const e = placeExtent(act); arrD.value = Math.round(((arrDir.value === "along" ? e[0] : e[1]) + 0.5) * 10) / 10; };
  on("placeCopy", () => {
    const n = Math.max(1, Math.min(50, Math.round(placeNum(box.querySelector("#placeArrN").value, 1))));
    const d = placeNum(arrD.value, placeExtent(act)[0] + 0.5);
    placeSnapshot();
    const cs = placeCopies(act, n, d, arrDir.value === "along");
    placements.push(...cs); cs.forEach(placeTouch);
    setPlaceStatus(`${n} ${n === 1 ? "kopia" : "kopior"} av "${act.name}" skapade.`);
    renderPlacePanel(); placeRedraw();
  });
  on("placeDone", () => { placeActiveId = null; placeMode = null; renderPlacePanel(); placeRedraw(); });
  on("placeDelete", () => {
    const ifcFile = ((placeLib(act.type) || {}).model || {}).kind === "ifc" && act.ifc_at;
    if (!confirm(`Ta bort "${act.name}"?${ifcFile ? `\n\nDen sparade IFC-filen i "${PLACE_TC_FOLDER}" ligger kvar i Trimble Connect – ta bort den där om den inte ska synas.` : ""}`)) return;
    placeSnapshot();
    placements = placements.filter(p => p.id !== act.id);
    placeDeleted.add(act.id); placeDirty.delete(act.id); placeActiveId = null; placeMode = null;
    placeScheduleSave(); renderPlacePanel(); placeRedraw();
  });
}
document.addEventListener("DOMContentLoaded", () => renderPlacePanel());
/* Piltangenter m.m. för det aktiva objektet (bara i Design-vyn och inte när man skriver i ett fält). */
document.addEventListener("keydown", e => {
  if (!placeActive() || placeMode || !document.body.classList.contains("tab-design")) return;
  const t = e.target, tag = t && t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable) || e.ctrlKey || e.metaKey || e.altKey) return;
  const st = placeStep() * (e.shiftKey ? 10 : 1), r = e.shiftKey ? 10 : 1;
  const m = { ArrowLeft: [-st, 0, 0, 0], ArrowRight: [st, 0, 0, 0], ArrowUp: [0, st, 0, 0], ArrowDown: [0, -st, 0, 0],
    PageUp: [0, 0, st, 0], PageDown: [0, 0, -st, 0], ",": [0, 0, 0, -r], ".": [0, 0, 0, r], ";": [0, 0, 0, -r], ":": [0, 0, 0, r] }[e.key];
  if (!m) return;
  e.preventDefault();
  placeNudge(...m);
});
