/* Flytta och vrid en modell live i Trimble Connect (Victors önskemål 2026-10-08, efter testet
   av viewer.placeModel: värld = vridning · modell + position, position i mm, vridning kring origo).
   - Hämta modellen för det markerade objektet.
   - Finjustera i X/Y/höjd med valfritt steg, vrid med valfritt steg kring en vridpunkt: det markerade
     objektets mitt eller en punkt man trycker på. Vridpunkten följer med modellen.
   - Punkt till punkt (tryck en punkt på modellen, sedan målet) och Vrid mot riktning (vridpunkt,
     utgångsriktning, ny riktning – fäster var 15:e grad).
   - Ångra/Återställ, piltangenter (Skift = 10 gånger).
   - Spara läget: modellens IFC hämtas från TC, dess yttersta placering skrivs om till det nya läget
     och den sparas som en NY fil (inget skrivs över). Den nya tänds och den gamla släcks. */

const LM_FOLDER = "4D Etablering";
let lm = { modelId: null, name: "", spec: null, start: null, cur: null, pivot: null, pivotSrc: "", hist: [], pick: null, pts: [], markIds: [] };
const lmV = (x, y, z) => ({ x, y, z });
const lmClone = o => JSON.parse(JSON.stringify(o));
const lmFmt = (v, d = 2) => Number(v).toLocaleString("sv-SE", { maximumFractionDigits: d });
const LM_IDENT = () => ({ position: lmV(0, 0, 0), axis: lmV(0, 0, 1), refDirection: lmV(1, 0, 0) });

function lmMsg(t, bad) { const el = document.getElementById("lmMode"); if (el) { el.textContent = t || ""; el.classList.toggle("place-bad", !!bad); } }
function lmStep() { return Number((document.getElementById("lmStep") || {}).value) || 0.1; }
function lmRotStep() { return Number((document.getElementById("lmRotStep") || {}).value) || 15; }

async function lmPickModel() {
  if (typeof API === "undefined" || !API || !API.viewer || typeof API.viewer.placeModel !== "function") { lmMsg("Den här Trimble Connect-versionen kan inte flytta modeller (placeModel saknas).", true); return; }
  const sel = await API.viewer.getSelection();
  const first = (sel || []).find(s => s.objectRuntimeIds && s.objectRuntimeIds.length);
  if (!first) { lmMsg("Markera först ett objekt i den modell du vill flytta.", true); return; }
  const ms = await API.viewer.getModels();
  const spec = (ms || []).find(m => m.id === first.modelId) || { id: first.modelId, name: first.modelId };
  const pl = spec.placement ? lmClone(spec.placement) : LM_IDENT();
  lm = { ...lm, modelId: spec.id, name: spec.name || spec.id, spec, start: lmClone(pl), cur: lmClone(pl), hist: [], pick: null, pts: [] };
  lm.pivot = await lmObjectCenter(first.modelId, first.objectRuntimeIds[0]);
  lm.pivotSrc = lm.pivot ? "det markerade objektets mitt" : "";
  if (!lm.pivot) lm.pivot = lmV(0, 0, 0);
  lmMsg("");
  await lmDrawMarks();
  lmRender();
}
async function lmObjectCenter(modelId, rid) {
  try {
    const b = await API.viewer.getObjectBoundingBoxes(modelId, [rid]);
    const bb = b && b[0] && b[0].boundingBox;
    return bb ? lmV((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2) : null;
  } catch (e) { return null; }
}

/* Placeringens vridning (grader) kring Z. */
const lmAng = pl => Math.atan2(pl.refDirection.y, pl.refDirection.x) * 180 / Math.PI;
async function lmSet(next, label) {
  try { await API.viewer.placeModel(lm.modelId, next); }
  catch (e) { lmMsg(`Trimble Connect kunde inte flytta modellen: ${e && e.message ? e.message : e}`, true); return false; }
  lm.hist.push(lm.cur); if (lm.hist.length > 100) lm.hist.shift();
  lm.cur = next;
  if (label) lmMsg(label);
  lmRender();
  return true;
}
/* Flytta d meter. Vridpunkten följer med. */
async function lmMove(dx, dy, dz, label) {
  if (!lm.modelId) return;
  const c = lm.cur, next = { ...lmClone(c), position: lmV(c.position.x + dx * 1000, c.position.y + dy * 1000, c.position.z + dz * 1000) };
  if (await lmSet(next, label)) { lm.pivot = lmV(lm.pivot.x + dx, lm.pivot.y + dy, lm.pivot.z + dz); lmDrawMarks(); }
}
/* Vrid deg grader kring vridpunkten (i plan). */
async function lmRotate(deg, label) {
  if (!lm.modelId) return;
  const t = deg * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t), c = lm.cur;
  const R = v => lmV(v.x * cs - v.y * sn, v.x * sn + v.y * cs, v.z);
  const P = lmV(lm.pivot.x * 1000, lm.pivot.y * 1000, lm.pivot.z * 1000);
  const d = R(lmV(c.position.x - P.x, c.position.y - P.y, c.position.z - P.z));
  const next = { ...lmClone(c), position: lmV(P.x + d.x, P.y + d.y, P.z + d.z), refDirection: R(c.refDirection) };
  await lmSet(next, label);
}
async function lmUndo() {
  const prev = lm.hist.pop();
  if (!prev) return;
  const before = lm.cur;
  try { await API.viewer.placeModel(lm.modelId, prev); } catch (e) { lm.hist.push(prev); lmMsg("Kunde inte ångra: " + e.message, true); return; }
  // Vridpunkten tillbaka på samma sätt som modellen (omvänd ändring).
  lm.pivot = lmApplyDelta(lm.pivot, before, prev);
  lm.cur = prev; lmMsg("Ångrat."); lmRender(); lmDrawMarks();
}
async function lmReset() {
  if (!lm.modelId) return;
  const before = lm.cur;
  if (await lmSet(lmClone(lm.start), "Återställd till läget när modellen hämtades.")) { lm.pivot = lmApplyDelta(lm.pivot, before, lm.start); lm.hist = []; lmRender(); lmDrawMarks(); }
}
/* En punkt som sitter på modellen: läge under placering a -> läge under placering b. */
function lmApplyDelta(p, a, b) {
  const ang = pl => Math.atan2(pl.refDirection.y, pl.refDirection.x);
  const ta = ang(a), tb = ang(b);
  // lokal = R(-ta)(p - ta.pos), sedan b: R(tb) lokal + b.pos  (mm)
  const q = lmV(p.x * 1000 - a.position.x, p.y * 1000 - a.position.y, p.z * 1000 - a.position.z);
  const l = lmV(q.x * Math.cos(-ta) - q.y * Math.sin(-ta), q.x * Math.sin(-ta) + q.y * Math.cos(-ta), q.z);
  const w = lmV(l.x * Math.cos(tb) - l.y * Math.sin(tb) + b.position.x, l.x * Math.sin(tb) + l.y * Math.cos(tb) + b.position.y, l.z + b.position.z);
  return lmV(w.x / 1000, w.y / 1000, w.z / 1000);
}

// ---------------------------------------------------------------------
// Tryck i modellen: vridpunkt, punkt till punkt, vrid mot riktning
// ---------------------------------------------------------------------
const LM_PICK_TXT = {
  pivot: ["Tryck på punkten modellen ska vridas kring."],
  p2p: ["Tryck på en punkt på modellen (t.ex. ett hörn).", "Tryck dit punkten ska."],
  rot3: ["Tryck på vridpunkten.", "Tryck en punkt som visar utgångsriktningen (t.ex. längs en kant på modellen).", "Tryck den nya riktningen – fäster var 15:e grad när du är nära."],
};
function lmStartPick(kind) { if (!lm.modelId) return; lm.pick = kind; lm.pts = []; lmMsg(LM_PICK_TXT[kind][0]); lmRender(); lmDrawMarks(); }
/* Anropas från onWorkspaceEvent. true = hanterat. */
function lmEvent(event, data) {
  if (!lm.pick) return false;
  const d = data && data.data !== undefined ? data.data : data;
  if (event === "viewer.onPicked") {
    const q = d && (d.position || d.point || d.hitPoint);
    if (!q || q.x === undefined) return true;
    const p = lmV(q.x, q.y, q.z || 0), k = lm.pick;
    lm.pts.push(p);
    if (k === "pivot") { lm.pivot = p; lm.pivotSrc = "vald punkt"; lm.pick = null; lmMsg("Vridpunkten är satt."); }
    else if (k === "p2p" && lm.pts.length === 2) {
      const [a, b] = lm.pts; lm.pick = null; lm.pts = [];
      lmMove(b.x - a.x, b.y - a.y, b.z - a.z, `Flyttad ${lmFmt(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z))} m punkt till punkt.`);
    } else if (k === "rot3" && lm.pts.length === 3) {
      const [c, r, t] = lm.pts; lm.pick = null; lm.pts = [];
      let deg = (Math.atan2(t.y - c.y, t.x - c.x) - Math.atan2(r.y - c.y, r.x - c.x)) * 180 / Math.PI;
      deg = ((deg + 180) % 360 + 360) % 360 - 180;
      const s = Math.round(deg / 15) * 15; deg = Math.abs(deg - s) < 2 ? s : Math.round(deg * 10) / 10;
      lm.pivot = c; lm.pivotSrc = "vald punkt";
      lmRotate(deg, `Vriden ${lmFmt(deg, 1)}° kring den valda punkten.`);
    } else lmMsg(LM_PICK_TXT[k][lm.pts.length]);
    lmRender(); lmDrawMarks();
    return true;
  }
  if (event === "viewer.onSelectionChanged" || event === "extension.onSelectionChanged") return true;
  return false;
}
/* Vridpunkten (blått kryss) och tryckta punkter (röda kryss) – några få linjer. */
async function lmDrawMarks() {
  if (typeof API === "undefined" || !API || !API.markup) return;
  const old = lm.markIds; lm.markIds = [];
  const lines = [], mm = p => ({ positionX: p.x * 1000, positionY: p.y * 1000, positionZ: p.z * 1000 });
  const cross = (p, color, s) => { lines.push({ start: mm(lmV(p.x - s, p.y, p.z)), end: mm(lmV(p.x + s, p.y, p.z)), color }, { start: mm(lmV(p.x, p.y - s, p.z)), end: mm(lmV(p.x, p.y + s, p.z)), color }, { start: mm(p), end: mm(lmV(p.x, p.y, p.z + s * 2)), color }); };
  if (lm.modelId && lm.pivot) cross(lm.pivot, { r: 37, g: 99, b: 235, a: 255 }, 0.6);
  lm.pts.forEach(p => cross(p, { r: 220, g: 38, b: 38, a: 255 }, 0.3));
  try {
    if (lines.length) { const added = await API.markup.addLineMarkups(lines); lm.markIds = typeof addedLineIds === "function" ? await addedLineIds(lines, added) : (added || []).map(x => x.id); }
  } catch (e) { /* bara visuellt */ }
  if (old.length && typeof clearMarkupIds === "function") await clearMarkupIds(old);
}

// ---------------------------------------------------------------------
// Spara läget: IFC:n med ny yttersta placering, som ny fil
// ---------------------------------------------------------------------
/* Skriver om IFC-textens absoluta placeringar så att hela modellen hamnar i placeringen pl
   (samma som TC:s placeModel: värld = vridning · fil + position i mm). Riktningarna med full
   precision – vid SWEREF-koordinater blir små vinkelfel annars meter. */
function lmIfcApply(text, pl) {
  const f = typeof pmIfcLengthFactor === "function" ? pmIfcLengthFactor(text) : 1;
  let maxId = 0;
  for (const m of text.matchAll(/#(\d+)\s*=/g)) maxId = Math.max(maxId, +m[1]);
  const id = k => `#${maxId + k}`, n = v => { const s = Number(v).toPrecision(17).replace(/0+$/, "").replace(/\.$/, "."); return /[.eE]/.test(s) ? s : s + "."; };
  const P = pl.position, A = pl.axis || lmV(0, 0, 1), R = pl.refDirection || lmV(1, 0, 0);
  const add = [
    `${id(1)}=IFCCARTESIANPOINT((${n(P.x / 1000 / f)},${n(P.y / 1000 / f)},${n(P.z / 1000 / f)}));`,
    `${id(2)}=IFCDIRECTION((${n(A.x)},${n(A.y)},${n(A.z)}));`,
    `${id(3)}=IFCDIRECTION((${n(R.x)},${n(R.y)},${n(R.z)}));`,
    `${id(4)}=IFCAXIS2PLACEMENT3D(${id(1)},${id(2)},${id(3)});`,
    `${id(5)}=IFCLOCALPLACEMENT($,${id(4)});`,
  ];
  let out = text.replace(/(=\s*IFCLOCALPLACEMENT\s*\(\s*)\$(\s*,)/gi, `$1${id(5)}$2`);
  out = out.replace(/(\n|^)DATA;\s*\r?\n/, m => m + add.join("\r\n") + "\r\n");
  return out;
}
async function lmSave() {
  if (!lm.modelId) return;
  const name = String(lm.name || "");
  if (!/\.ifc(zip)?$/i.test(name)) { lmMsg("Läget kan bara sparas för IFC-filer.", true); return; }
  if (!confirm(`Spara läget för "${name}"?\n\nModellen hämtas från Trimble Connect, flyttas till det nya läget och sparas som en NY fil i mappen "${LM_FOLDER}". Den gamla filen lämnas orörd men släcks i 3D-vyn.`)) return;
  const btn = document.getElementById("lmSave"); if (btn) btn.disabled = true;
  try {
    lmMsg("Hämtar modellen från Trimble Connect…");
    const raw = await ifcSubsetUnzip(await ifcSubsetDownload(lm.spec));
    const text = typeof ifcBytesToStr === "function" ? ifcBytesToStr(raw) : new TextDecoder().decode(raw);
    const moved = lmIfcApply(text, lm.cur);
    const base = name.replace(/\.ifc(zip)?$/i, "").replace(/ flyttad \d{4}-\d\d-\d\d kl [\d.]+$/, "");
    const fname = `${base} flyttad ${placeStamp()}.ifc`.replace(/[\\/:*?"<>|]/g, "-");
    lmMsg("Sparar den flyttade filen…");
    const up = await tcUploadFiles([new File([typeof ifcStrToBytes === "function" ? ifcStrToBytes(moved) : new TextEncoder().encode(moved)], fname, { type: "application/x-step" })], LM_FOLDER);
    const newId = typeof placeUploadedId === "function" ? placeUploadedId(up, fname) : null;
    // Den gamla tillbaka till sitt ursprungliga läge och släckt, den nya tänd.
    try { await API.viewer.placeModel(lm.modelId, lmClone(lm.start)); } catch (e) { /* ingen fara */ }
    let shown = false;
    if (newId) { try { await API.viewer.toggleModel(newId, true); shown = true; await API.viewer.toggleModel(lm.modelId, false); } catch (e) { /* tänd för hand */ } }
    lmMsg(`✓ Sparad som "${fname}" i "${LM_FOLDER}".${shown ? " Den nya filen visas och den gamla är släckt." : " Tänd den nya filen i 3D-vyn och släck den gamla."}`);
    lm = { ...lm, modelId: null, hist: [], pick: null, pts: [] };
    lmDrawMarks(); lmRender();
  } catch (e) { lmMsg("Kunde inte spara läget: " + (e && e.message ? e.message : e), true); }
  if (btn) btn.disabled = false;
}

// ---------------------------------------------------------------------
// Panelen
// ---------------------------------------------------------------------
function lmRender() {
  const body = document.getElementById("lmBody");
  if (!body) return;
  body.classList.toggle("hidden", !lm.modelId);
  if (!lm.modelId) return;
  document.getElementById("lmName").textContent = lm.name;
  const s = lm.start, c = lm.cur;
  const dx = (c.position.x - s.position.x) / 1000, dy = (c.position.y - s.position.y) / 1000, dz = (c.position.z - s.position.z) / 1000;
  const da = ((lmAng(c) - lmAng(s) + 540) % 360) - 180;
  document.getElementById("lmState").textContent = lm.hist.length
    ? `Ändrat sedan hämtning: vriden ${lmFmt(da, 1)}°, modellens origo flyttat X ${lmFmt(dx)} · Y ${lmFmt(dy)} · höjd ${lmFmt(dz)} m.`
    : "Inte flyttad än.";
  document.getElementById("lmPivotTxt").textContent = lm.pivotSrc ? `${lm.pivotSrc}` : "modellens origo";
  document.getElementById("lmUndo").disabled = !lm.hist.length;
  document.querySelectorAll("[data-lmpick]").forEach(b => b.classList.toggle("active", lm.pick === b.dataset.lmpick));
  const cancel = document.getElementById("lmCancelPick"); if (cancel) cancel.classList.toggle("hidden", !lm.pick);
}
function lmBind() {
  const on = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = () => Promise.resolve(fn()).catch(e => lmMsg("Fel: " + (e && e.message ? e.message : e), true)); };
  on("lmPick", lmPickModel);
  document.querySelectorAll("[data-lmmove]").forEach(b => { b.onclick = () => { const [x, y, z] = b.dataset.lmmove.split(",").map(Number), st = lmStep(); lmMove(x * st, y * st, z * st); }; });
  document.querySelectorAll("[data-lmrot]").forEach(b => { b.onclick = () => lmRotate(Number(b.dataset.lmrot) * lmRotStep()); });
  document.querySelectorAll("[data-lmpick]").forEach(b => { b.onclick = () => lmStartPick(b.dataset.lmpick); });
  on("lmCancelPick", () => { lm.pick = null; lm.pts = []; lmMsg(""); lmRender(); lmDrawMarks(); });
  on("lmPivotObj", async () => {
    const sel = await API.viewer.getSelection(), f = (sel || []).find(s => s.modelId === lm.modelId && s.objectRuntimeIds && s.objectRuntimeIds.length);
    if (!f) { lmMsg("Markera ett objekt i modellen först.", true); return; }
    const c = await lmObjectCenter(f.modelId, f.objectRuntimeIds[0]);
    if (c) { lm.pivot = c; lm.pivotSrc = "det markerade objektets mitt"; lmMsg("Vridpunkten är det markerade objektets mitt."); lmRender(); lmDrawMarks(); }
  });
  on("lmUndo", lmUndo);
  on("lmReset", lmReset);
  on("lmSave", lmSave);
  on("lmDone", () => { lm = { ...lm, modelId: null, pick: null, pts: [] }; lmMsg(""); lmRender(); lmDrawMarks(); });
}
document.addEventListener("DOMContentLoaded", lmBind);
/* Piltangenter (Design-vyn, när en modell är hämtad och inget etableringsobjekt är valt). */
document.addEventListener("keydown", e => {
  if (!lm.modelId || !document.body.classList.contains("tab-design") || (typeof placeActive === "function" && placeActive())) return;
  const t = e.target, tag = t && t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.ctrlKey || e.metaKey || e.altKey) return;
  const st = lmStep() * (e.shiftKey ? 10 : 1), r = lmRotStep();
  const m = { ArrowLeft: [-st, 0, 0], ArrowRight: [st, 0, 0], ArrowUp: [0, st, 0], ArrowDown: [0, -st, 0], PageUp: [0, 0, st], PageDown: [0, 0, -st] }[e.key];
  if (m) { e.preventDefault(); lmMove(...m); return; }
  if (e.key === "," || e.key === ".") { e.preventDefault(); lmRotate(e.key === "," ? r : -r); }
});
