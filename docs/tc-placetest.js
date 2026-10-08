/* Test: flytta/vrida en modell live i Trimble Connect (Victor 2026-10-08). Workspace API 0.3.38 har
   viewer.placeModel(modelId, { position (mm), axis, refDirection, scale }) – den här panelen provar
   den på den modell man har markerat ett objekt i och loggar vad TC svarar, innan vi bygger smidig
   flytt/vridning ovanpå: modellens placering före/efter och mitten på det markerade objektet
   (flytt 1 m österut ska flytta mitten 1 m i X; vridning 15° kring objektets mitt ska lämna den kvar). */

const plt = { modelId: null, name: "", orig: null, rid: null, log: [] };
const pltV = (x, y, z) => ({ x, y, z });
const pltF = v => v == null ? "–" : Number(v).toLocaleString("sv-SE", { maximumFractionDigits: 4 });
const pltVs = v => v ? `(${pltF(v.x)}, ${pltF(v.y)}, ${pltF(v.z)})` : "–";
function pltLog(t) {
  plt.log.push(`${new Date().toLocaleTimeString("sv-SE")}  ${t}`);
  const el = document.getElementById("pltLog");
  if (el) { el.textContent = plt.log.join("\n"); el.scrollTop = el.scrollHeight; }
}
function pltButtons() {
  const ok = !!plt.modelId;
  ["pltMove", "pltRot", "pltReset"].forEach(id => { const b = document.getElementById(id); if (b) b.disabled = !ok; });
}
async function pltSpec() {
  const ms = await API.viewer.getModels();
  return (ms || []).find(m => m.id === plt.modelId) || null;
}
/* Placeringen som TC rapporterar (eller grundläget om den saknas). */
async function pltPlacement() {
  const s = await pltSpec();
  return s && s.placement ? s.placement : null;
}
async function pltCenter() {
  if (plt.rid == null) return null;
  try {
    const b = await API.viewer.getObjectBoundingBoxes(plt.modelId, [plt.rid]);
    const bb = b && b[0] && b[0].boundingBox;
    return bb ? pltV((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2) : null;
  } catch (e) { return null; }
}
async function pltPick() {
  plt.log = [];
  if (typeof API === "undefined" || !API || !API.viewer) { pltLog("Ingen Trimble Connect-vy hittades."); return; }
  pltLog(`placeModel finns: ${typeof API.viewer.placeModel === "function" ? "ja" : "NEJ – den här TC-versionen saknar funktionen"}`);
  const sel = await API.viewer.getSelection();
  const first = (sel || []).find(s => s.objectRuntimeIds && s.objectRuntimeIds.length);
  if (!first) { pltLog("Markera ett objekt i den modell du vill testa med (t.ex. en IFC i 4D Etablering) och tryck Hämta igen."); plt.modelId = null; pltButtons(); return; }
  plt.modelId = first.modelId; plt.rid = first.objectRuntimeIds[0];
  const s = await pltSpec();
  plt.name = s ? s.name : plt.modelId;
  plt.orig = s && s.placement ? JSON.parse(JSON.stringify(s.placement)) : null;
  pltLog(`Modell: ${plt.name} (${plt.modelId})`);
  pltLog(`Placering nu: ${plt.orig ? JSON.stringify(plt.orig) : "ingen angiven (grundläge)"}`);
  pltLog(`Mitten på markerat objekt: ${pltVs(await pltCenter())} m`);
  pltButtons();
}
async function pltApply(label, make) {
  if (!plt.modelId) return;
  const before = await pltPlacement(), c0 = await pltCenter();
  const cur = { position: (before && before.position) || pltV(0, 0, 0), axis: (before && before.axis) || pltV(0, 0, 1), refDirection: (before && before.refDirection) || pltV(1, 0, 0), ...(before && before.scale != null ? { scale: before.scale } : {}) };
  const next = make(cur, c0);
  pltLog(`— ${label}: skickar ${JSON.stringify(next)}`);
  try { await API.viewer.placeModel(plt.modelId, next); pltLog("placeModel: OK"); }
  catch (e) { pltLog(`placeModel: FEL – ${e && e.message ? e.message : e}`); return; }
  await new Promise(r => setTimeout(r, 600));
  const after = await pltPlacement(), c1 = await pltCenter();
  pltLog(`Placering efter: ${after ? JSON.stringify(after) : "ingen rapporterad"}`);
  if (c0 && c1) pltLog(`Objektets mitt: ${pltVs(c0)} → ${pltVs(c1)}  (skillnad ${pltVs(pltV(c1.x - c0.x, c1.y - c0.y, c1.z - c0.z))} m)`);
}
/* Vrider kring objektets mitt: riktningen vrids θ och läget flyttas så att mitten står kvar
   (antagande: världen = vridning · modell + position; loggen visar om det stämmer). */
function pltRotate(cur, c0, deg) {
  const t = deg * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
  const r = v => pltV(v.x * cs - v.y * sn, v.x * sn + v.y * cs, v.z);
  const c = c0 ? pltV(c0.x * 1000, c0.y * 1000, c0.z * 1000) : pltV(0, 0, 0);
  const d = r(pltV(cur.position.x - c.x, cur.position.y - c.y, cur.position.z - c.z));
  return { ...cur, position: pltV(c.x + d.x, c.y + d.y, c.z + d.z), refDirection: r(cur.refDirection) };
}
function pltBind() {
  const on = (id, fn) => { const b = document.getElementById(id); if (b) b.onclick = () => fn().catch(e => pltLog("Fel: " + (e && e.message ? e.message : e))); };
  on("pltPick", pltPick);
  on("pltMove", () => pltApply("Flytta 1 m österut", cur => ({ ...cur, position: pltV(cur.position.x + 1000, cur.position.y, cur.position.z) })));
  on("pltRot", () => pltApply("Vrid 15° kring objektets mitt", (cur, c0) => pltRotate(cur, c0, 15)));
  on("pltReset", () => pltApply("Återställ", () => plt.orig ? JSON.parse(JSON.stringify(plt.orig)) : { position: pltV(0, 0, 0), axis: pltV(0, 0, 1), refDirection: pltV(1, 0, 0) }));
  on("pltCopy", async () => {
    const t = plt.log.join("\n");
    try { await navigator.clipboard.writeText(t); pltLog("(Kopierat – klistra in i chatten.)"); }
    catch (e) { const el = document.getElementById("pltLog"); const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); pltLog("(Markerat – kopiera med Ctrl+C.)"); }
  });
  pltButtons();
}
document.addEventListener("DOMContentLoaded", pltBind);
