/* 3D-vyn – Redigera objekt (Victor 2026-10-30: "en knapp 'redigera' på objekten så att jag kan justera, ta bort och lägga till och sedan spara som ett nytt objekt i 3D-biblioteket").

   1. Redigera (objektets egenskapspanel): objektet delas upp i sina delar (varje hjul, fönster, bom, skopa … blir ett eget ritat objekt med egen färg) och
      ersätter originalet i vyn. Ångra ger tillbaka originalet. Biblioteket och andra placeringar rörs inte.
   2. Redigera delarna med verktygen som redan finns: markera och Delete tar bort, Flytta/Vrid/Skala, Måla, Rita (D) och Modellera (X) lägger till nya delar
      (rektangel, cirkel, Push/Pull, Följ banan …), Kopiera special.
   3. Spara som nytt objekt: delarna (och det du lagt till) slås ihop till en egen modell i 3D-biblioteket (Egna modeller, delas i projektet) och sätts på
      samma plats som originalet. Avbryt lägger tillbaka originalet. Fungerar på alla objekt utom IFC-objekt i byggnaden. */

const l3ed = { on: false, id: "", name: "", base: null, orig: null, anchor: null };

/* Delar upp en triangelmängd i sammanhängande delar (en del = ett fysiskt stycke, t.ex. en hjulbana eller en plåt). */
function l3edSplit(tris) {
  const n = tris.pts.length, par = Array.from({ length: n }, (_, i) => i), find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  tris.faces.forEach(f => { const a = find(f[0] - 1), b = find(f[1] - 1), c = find(f[2] - 1); par[b] = a; par[find(c)] = a; });
  const comps = new Map(); tris.faces.forEach(f => { const r = find(f[0] - 1); (comps.get(r) || comps.set(r, []).get(r)).push(f); });
  return [...comps.values()].map(faces => { const map = new Map(), pts = []; const nf = faces.map(f => f.map(i => { if (!map.has(i)) { map.set(i, pts.length + 1); pts.push(tris.pts[i - 1]); } return map.get(i); })); return { pts, faces: nf }; });
}
/* Delen som trianglar i världskoordinater (prismor från fotavtryck blir trianglar). */
function l3edPartTris(pt) {
  if (pt.tris) return pt.tris;
  if (!pt.poly || pt.poly.length < 3) return null; const P = pt.poly, n = P.length, pts = [], faces = [];
  P.forEach(q => pts.push([q[0], q[1], pt.z0])); P.forEach(q => pts.push([q[0], q[1], pt.z1]));
  const ear = THREE.ShapeUtils.triangulateShape(P.map(q => new THREE.Vector2(q[0], q[1])), []);
  ear.forEach(([a, b, c]) => { faces.push([a + 1, b + 1, c + 1], [n + a + 1, n + c + 1, n + b + 1]); });
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; faces.push([i + 1, j + 1, n + j + 1], [i + 1, n + j + 1, n + i + 1]); }
  return { pts, faces };
}
const l3edEditable = p => { const l = placeLib(p.type) || {}; return !!p && !l.isModel && !l.mod && !!placeParts; };

async function l3edStart(p) {
  if (l3ed.on) { l3Status("Avsluta pågående redigering först (Spara eller Avbryt).", true); return; }
  let parts; try { parts = placeParts(p).filter(pt => pt.role !== "reach" && !pt.sign && !pt.card); } catch (e) { parts = []; }
  const pieces = [];
  parts.forEach(pt => { const t = l3edPartTris(pt); if (!t || !t.faces.length) return; (pt.deco ? [t] : l3edSplit(t)).forEach(c => pieces.push({ tris: c, deco: !!pt.deco, color: pt.color || p.color || (placeLib(p.type) || {}).color || "#94a3b8", transp: pt.transp || 0 })); });
  if (!pieces.length) { l3Status("Objektet har ingen geometri att redigera.", true); return; }
  if (pieces.length > 800) { const ok = await uiConfirm(`Objektet består av ${pieces.length} delar. De allra minsta slås ihop så att det går att hantera – fortsätta?`); if (!ok) return; }
  // För många delar: små delar (under 5 cm) slås ihop per färg.
  const big = [], small = new Map(); pieces.forEach(pc => { const xs = pc.tris.pts.map(q => q[0]), ys = pc.tris.pts.map(q => q[1]), zs = pc.tris.pts.map(q => q[2]), d = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), Math.max(...zs) - Math.min(...zs));
    if (pieces.length > 800 && d < 0.05) { const g = small.get(pc.color) || { tris: { pts: [], faces: [] }, color: pc.color, transp: pc.transp }; const o = g.tris.pts.length; pc.tris.pts.forEach(q => g.tris.pts.push(q)); pc.tris.faces.forEach(f => g.tris.faces.push(f.map(i => i + o))); small.set(pc.color, g); } else big.push(pc); });
  const all = [...big, ...small.values()];
  placeSnapshot();
  const anchor = [p.x, p.y, (Number(p.z) || 0) + (Number(p.dz) || 0)], gid = "ed" + Date.now().toString(36), ids = [];
  const before = new Set(placements.map(q => q.id));
  placements = placements.filter(q => q.id !== p.id); if (typeof l3dxRemove === "function") { /* originalet tas bort nedan utan egen ångra */ }
  const g0 = l3.placeMeshes.get(p.id); if (g0) { if (l3.gizmo.object === g0) l3.gizmo.detach(); l3.groups.places.remove(g0); l3.placeMeshes.delete(p.id); } placeDeleted.add(p.id); placeDirty.delete(p.id);
  all.forEach((pc, i) => {
    const pts = pc.tris.pts.map(q => MG.round3([q[0] - anchor[0], q[1] - anchor[1], q[2] - anchor[2]]));
    const m = modCreate({ k: "mesh", pts, faces: pc.tris.faces, closed: true }, anchor, { name: `${p.name || "Objekt"} – del ${i + 1}`, color: pc.color, snapshot: false }); m.eg = gid; if (pc.transp > 0) m.opacity = Math.max(0.05, 1 - pc.transp); ids.push(m.id);
  });
  Object.assign(l3ed, { on: true, id: gid, name: p.name || (placeLib(p.type) || {}).label || "Objekt", base: before, orig: JSON.parse(JSON.stringify(p)), anchor });
  placements.forEach(q => { if (q.eg === gid && q.opacity) { placeTouch(q); l3RebuildOne(q); } });
  l3SelectIds([]); l3Changed(); l3edBar(); l3Status(`Redigerar "${l3ed.name}": ${all.length} delar. Markera en del och tryck Delete för att ta bort den, eller rita/modellera nya (D, X).`);
}
const l3edPieces = () => placements.filter(q => q.m && (q.eg === l3ed.id || (l3ed.base && !l3ed.base.has(q.id))));

function l3edBar() {
  const host = document.getElementById("v3Canvas"); if (!host) return; let el = document.getElementById("v3EditBar");
  if (!l3ed.on) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("div"); el.id = "v3EditBar"; el.className = "v3-editbar"; host.appendChild(el); ["pointerdown", "click", "dblclick", "wheel", "contextmenu"].forEach(t => el.addEventListener(t, e => e.stopPropagation())); }
  const n = l3edPieces().length;
  el.innerHTML = `<b>Redigerar: ${escHtml(l3ed.name)}</b><span>${n} delar</span><button type="button" data-ed="save" class="primary" title="Slå ihop delarna till ett nytt objekt i 3D-biblioteket och sätt det på platsen">Spara som nytt objekt…</button><button type="button" data-ed="cancel" title="Släng ändringarna och lägg tillbaka originalet">Avbryt</button>`;
  el.querySelector('[data-ed="save"]').onclick = () => l3edSave(); el.querySelector('[data-ed="cancel"]').onclick = () => l3edCancel();
}
function l3edRefresh() { if (l3ed.on) l3edBar(); }

function l3edClearPieces() {
  const ids = new Set(l3edPieces().map(q => q.id)); placements = placements.filter(q => !ids.has(q.id));
  ids.forEach(id => { placeDeleted.add(id); placeDirty.delete(id); const g = l3.placeMeshes.get(id); if (g) { if (l3.gizmo.object === g) l3.gizmo.detach(); l3.groups.places.remove(g); } l3.placeMeshes.delete(id); });
}
function l3edCancel() {
  if (!l3ed.on) return; const o = l3ed.orig; l3edClearPieces();
  placeDeleted.delete(o.id); placements.push(o); placeTouch(o); l3AddPlacementMesh(o);
  Object.assign(l3ed, { on: false, base: null, orig: null }); l3edBar(); l3SelectIds([o.id]); l3Changed(); l3Status("Redigeringen avbröts – originalet är tillbaka.");
}
/* Slår ihop delarna till en modell: trianglar per färg, centrerade i X/Y med underkanten i 0. */
function l3edBuildMesh() {
  const pcs = l3edPieces(), groups = new Map(); let tris = 0;
  pcs.forEach(q => {
    const c = modLocalMesh(q); if (!c || !c.faces.length) return; const col = String(q.color || "#94a3b8"), t = q.opacity && q.opacity < 1 ? Math.round((1 - q.opacity) * 100) / 100 : 0, key = col + ":" + t;
    if (!groups.has(key)) groups.set(key, { c: col, t, pos: [], idx: [] }); const g = groups.get(key), o = g.pos.length / 3;
    c.pts.forEach(pt => { const w = l3dwFromLocal(q, pt); g.pos.push(w[0] - l3ed.anchor[0], w[1] - l3ed.anchor[1], w[2] - l3ed.anchor[2]); });
    c.faces.forEach(f => g.idx.push(f[0] - 1 + o, f[1] - 1 + o, f[2] - 1 + o)); tris += c.faces.length;
  });
  if (!tris) throw new Error("Det finns inga delar att spara.");
  if (tris > PM_MAX_TRIS) throw new Error(`Objektet har ${tris.toLocaleString("sv-SE")} trianglar – för tungt för biblioteket (max ${PM_MAX_TRIS.toLocaleString("sv-SE")}). Ta bort några små delar.`);
  return pmFinish(groups, tris);
}
async function l3edSave() {
  if (!l3ed.on) return;
  let built; try { built = l3edBuildMesh(); } catch (e) { l3Status(e.message, true); return; }
  const name = await uiPrompt("Namn på det nya objektet i 3D-biblioteket:", `${l3ed.name} (egen)`); if (!name || !name.trim()) return;
  l3Status("Sparar i biblioteket…");
  let asset;
  try { asset = await pmSaveAsset({ name: name.trim().slice(0, 60), kind: "mesh", source: "redigerat", bbox: built.bbox, tris: built.tris, mesh: built.mesh }, 1); }
  catch (e) { l3Status("Kunde inte spara i biblioteket: " + (e && e.message ? e.message : e) + " – delarna ligger kvar, försök igen.", true); return; }
  const a = l3ed.anchor, orig = l3ed.orig; l3edClearPieces();
  const np = placeNew("model:" + asset.id, [a[0], a[1], a[2]]); np.rot = 0; np.dz = 0; np.name = name.trim(); if (orig && orig.itemId) { np.itemId = orig.itemId; np.start = orig.start; np.end = orig.end; }
  placements.push(np); placeTouch(np); l3AddPlacementMesh(np);
  Object.assign(l3ed, { on: false, base: null, orig: null }); l3edBar(); if (typeof l3RenderLib === "function") l3RenderLib();
  l3SelectIds([np.id]); l3Changed(); l3Toast(`"${name.trim()}" är sparat i 3D-biblioteket (Egna modeller) och ligger på platsen.`);
}

/* Knappen i objektets egenskapspanel. */
function l3edSideHtml(p) { return l3edEditable(p) && !l3ed.on ? `<div class="v3-sec">Redigera</div><button type="button" class="v3-wide" data-ed="start" title="Dela upp objektet i delar, redigera dem och spara som ett nytt objekt i 3D-biblioteket">✎ Redigera objektet…</button>` : ""; }
function l3edSideBind(side, p) { const b = side.querySelector('[data-ed="start"]'); if (b) b.onclick = () => l3edStart(p); }
