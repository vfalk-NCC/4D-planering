/* 3D-vyn: den riktiga byggnaden från Trimble Connect (Victors önskemål 2026-10-08: "jag förstår inte
   vad som ritas" – lådorna runt objekten räcker inte). 4D-planering (som har TC-behörigheten) hämtar
   de IFC-modeller som är tända i TC; här läses de med web-ifc (ifc-mesh.js), i bitar om högst
   ~80 000 trianglar (snabba träffar och fästpunkter), i TC:s läge för modellen (placeModel).
   Objekt som är kopplade i planeringen (GUID = object_id) färgas i statusfärg vid datumet; övriga i
   sin egen färg, ljusad, som bakgrund. Tryck på ett objekt visar dess uppgifter. */

let l3b = { models: [], busy: false };
const L3B_CHUNK = 80000;
const l3bMaxTris = () => (matchMedia("(pointer: coarse)").matches ? 1500000 : 3000000);

/* Lista över tända IFC-modeller (från 4D-planering) och val av vilka som ska visas. */
async function l3bOpenDialog() {
  const box = document.getElementById("v3BldgBox");
  if (!box) return;
  box.innerHTML = `<div class="v3-pop-hint">Hämtar listan över tända modeller i Trimble Connect…</div>`;
  let list = [];
  try { list = (await askOpener("ifcModelsList", {}, 20000)).models || []; }
  catch (e) { box.innerHTML = `<div class="v3-pop-hint bad">${escHtml(e.message)}</div><button type="button" class="v3-wide" id="v3BldgRetry">Försök igen</button>`; box.querySelector("#v3BldgRetry").onclick = l3bOpenDialog; return; }
  const loaded = new Map(l3b.models.map(m => [m.id, m]));
  if (!list.length && !loaded.size) { box.innerHTML = `<div class="v3-pop-hint">Inga IFC-modeller är tända i Trimble Connect. Tänd byggnadens modeller i TC och försök igen.</div><button type="button" class="v3-wide" id="v3BldgRetry">Försök igen</button>`; box.querySelector("#v3BldgRetry").onclick = l3bOpenDialog; return; }
  box.innerHTML = `<div class="v3-pop-hint">Välj vilka modeller som ska visas. Etableringsfiler visas redan som etablering.</div>
    <div class="v3-bldg-list">${list.map(m => {
      const L = loaded.get(m.id);
      return `<label class="v3-chk"><input type="checkbox" data-bldg="${escHtml(m.id)}" ${L ? (L.visible ? "checked" : "") : (m.etab ? "" : "checked")} /> <span>${escHtml(m.name)}</span>${L ? `<em>${(L.tris / 1000).toFixed(0)}k tri</em>` : ""}</label>`;
    }).join("")}</div>
    <button type="button" class="v3-wide v3-primary" id="v3BldgGo">Visa valda</button>`;
  box.querySelector("#v3BldgGo").onclick = async () => {
    const want = [...box.querySelectorAll("[data-bldg]")].map(c => ({ id: c.dataset.bldg, on: c.checked, name: (list.find(m => m.id === c.dataset.bldg) || {}).name }));
    want.filter(w => !w.on).forEach(w => l3bShow(w.id, false));
    want.filter(w => w.on && loaded.has(w.id)).forEach(w => l3bShow(w.id, true));
    const todo = want.filter(w => w.on && !loaded.has(w.id));
    l3HideMenus();
    if (todo.length) await l3bLoad(todo);
    l3RenderLegend(); l3Render();
  };
}
function l3bShow(id, on) {
  const m = l3b.models.find(x => x.id === id);
  if (!m) return;
  m.visible = on; m.meshes.forEach(x => { x.visible = on; });
}
async function l3bLoad(list) {
  if (l3b.busy) return;
  l3b.busy = true;
  const first = !l3b.models.length;
  let total = l3b.models.reduce((s, m) => s + m.tris, 0);
  try {
    for (let i = 0; i < list.length; i++) {
      const w = list[i];
      l3Status(`Hämtar ${w.name || "modellen"} från Trimble Connect (${i + 1} av ${list.length})…`);
      const r = await askOpener("ifcModelData", { modelId: w.id }, 0);
      l3Status(`Läser ${r.name || w.name} (${i + 1} av ${list.length})…`);
      await new Promise(res => setTimeout(res, 30));
      const m = await l3bParse(r.bytes, r.placement, l3bMaxTris() - total);
      m.id = w.id; m.name = r.name || w.name; m.visible = true;
      total += m.tris;
      m.meshes.forEach(x => l3.groups.bldg.add(x));
      l3b.models.push(m);
      l3bPosition();
      if (m.capped) { l3Toast(`${m.name} är för stor för att visas helt här – en del av den visas.`); break; }
    }
    l3bRecolor();
    // Lådorna behövs inte när byggnaden syns.
    if (first && ["solid", "ghost"].includes(l3Prefs().objs) && l3.objMesh) {
      l3SetPref("objs", "hidden");
      document.querySelectorAll("[data-v3objs]").forEach(b => b.classList.toggle("on", b.dataset.v3objs === "hidden"));
      l3BuildObjects();
      l3Toast("Byggnaden visas. Lådorna runt de planerade objekten är dolda (Visa → Planerade objekt).");
    }
    const n = l3b.models.reduce((s, m) => s + m.ranges.filter(r => r.itemId).length, 0);
    l3Status(`Byggnaden visas (${l3b.models.length} ${l3b.models.length === 1 ? "modell" : "modeller"}, ${(total / 1000).toFixed(0)}k trianglar). ${n} objekt är kopplade och färgas efter status. Tryck på ett objekt för att se det.`);
    if (first) l3Frame(true);
  } catch (e) { l3Status("Kunde inte visa byggnaden: " + (e && e.message ? e.message : e), true); }
  l3b.busy = false;
  l3Render();
}
/* Bitarna ligger relativt O när de lästes; flytta dem om origo bytts (annan arbetsyta). */
function l3bPosition() { l3b.models.forEach(m => m.meshes.forEach(x => x.position.set(m.O[0] - l3.O[0], m.O[1] - l3.O[1], m.O[2] - l3.O[2]))); }
function l3bRebuild() { if (!l3b.models.length) return; l3b.models.forEach(m => m.meshes.forEach(x => { if (!x.parent) l3.groups.bldg.add(x); })); l3bPosition(); l3bRecolor(); }

/* IFC-bytes -> bitar (Mesh) med färg per objekt. placement = TC:s placering av modellen (mm). */
async function l3bParse(bytes, placement, maxTris) {
  const api = await ifcmLoad();
  const id = api.OpenModel(new Uint8Array(bytes), { COORDINATE_TO_ORIGIN: false, CIRCLE_SEGMENTS: 12 });
  const pl = placement || { position: { x: 0, y: 0, z: 0 }, refDirection: { x: 1, y: 0, z: 0 } };
  const rd = pl.refDirection || { x: 1, y: 0, z: 0 }, rl = Math.hypot(rd.x, rd.y) || 1, cs = rd.x / rl, sn = rd.y / rl;
  const P = pl.position || { x: 0, y: 0, z: 0 }, O = [...l3.O];
  const byGuid = new Map((items || []).filter(r => r.object_id).map(r => [String(r.object_id), r.id]));
  const ctx = new THREE.Color(0xdfe4ea);
  const out = { meshes: [], ranges: [], tris: 0, O, capped: false };
  let cur = null;
  const open = () => { cur = { pos: [], col: [], idx: [], ranges: [] }; };
  const close = () => {
    if (!cur || !cur.idx.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(cur.pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(cur.col, 3));
    g.setIndex(cur.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(cur.idx, 1) : new THREE.Uint16BufferAttribute(cur.idx, 1));
    g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    m.userData.kind = "bldg"; m.userData.surface = true; m.userData.l3b = { ranges: cur.ranges, model: out };
    out.meshes.push(m); out.ranges.push(...cur.ranges);
    cur = null;
  };
  open();
  try {
    api.StreamAllMeshes(id, mesh => {
      if (out.capped) return;
      let guid = null, name = "";
      try { const line = api.GetLine(id, mesh.expressID); guid = line && line.GlobalId ? line.GlobalId.value : null; name = line && line.Name ? line.Name.value || "" : ""; } catch (e) { /* utan namn */ }
      const start = cur.pos.length / 3;
      let base = null;
      for (let gi = 0; gi < mesh.geometries.size(); gi++) {
        const pg = mesh.geometries.get(gi), geom = api.GetGeometry(id, pg.geometryExpressID);
        const v = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
        const ix = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
        if (geom.delete) geom.delete();
        if (out.tris + ix.length / 3 > maxTris) { out.capped = true; return; }
        out.tris += ix.length / 3;
        const T = pg.flatTransformation, c = pg.color || { x: 0.8, y: 0.8, z: 0.8 };
        const col = new THREE.Color(c.x, c.y, c.z).lerp(ctx, 0.45);
        if (!base) base = [col.r, col.g, col.b];
        const o = cur.pos.length / 3;
        for (let k = 0; k < v.length; k += 6) {
          const x = v[k], y = v[k + 1], z = v[k + 2];
          const wx = T[0] * x + T[4] * y + T[8] * z + T[12], wy = T[1] * x + T[5] * y + T[9] * z + T[13], wz = T[2] * x + T[6] * y + T[10] * z + T[14];
          const X = wx, Y = -wz, Z = wy; // web-ifc: Y uppåt -> Z uppåt
          cur.pos.push(cs * X - sn * Y + P.x / 1000 - O[0], sn * X + cs * Y + P.y / 1000 - O[1], Z + P.z / 1000 - O[2]);
          cur.col.push(col.r, col.g, col.b);
        }
        for (let k = 0; k < ix.length; k++) cur.idx.push(ix[k] + o);
      }
      const count = cur.pos.length / 3 - start;
      if (count) cur.ranges.push({ start, count, guid, name, itemId: guid ? byGuid.get(guid) || null : null, base: base || [0.85, 0.87, 0.9] });
      if (cur.idx.length / 3 > L3B_CHUNK) { close(); open(); }
    });
  } finally { api.CloseModel(id); }
  close();
  return out;
}
/* Statusfärg för kopplade objekt vid datumet i lägesplanen. */
function l3bRecolor() {
  if (!l3 || !l3b.models.length) return;
  const byId = new Map((items || []).map(r => [r.id, r]));
  const byGuid = new Map((items || []).filter(r => r.object_id).map(r => [String(r.object_id), r.id]));
  l3b.models.forEach(m => m.meshes.forEach(x => {
    const col = x.geometry.getAttribute("color"), d = col.array;
    x.userData.l3b.ranges.forEach(r => {
      if (r.guid && !r.itemId) r.itemId = byGuid.get(r.guid) || null; // kopplad efter att modellen lästes
      const c = r.itemId ? new THREE.Color(phaseColor(l3Phase(byId.get(r.itemId)))) : null;
      const rgb = c ? [c.r, c.g, c.b] : r.base;
      for (let i = r.start; i < r.start + r.count; i++) { d[i * 3] = rgb[0]; d[i * 3 + 1] = rgb[1]; d[i * 3 + 2] = rgb[2]; }
    });
    col.needsUpdate = true;
  }));
}
function l3bCoupledIds() { const s = new Set(); l3b.models.forEach(m => m.visible && m.ranges.forEach(r => { if (r.itemId) s.add(r.itemId); })); return s; }
/* Träff i byggnaden -> objektets uppgifter. */
function l3bHitInfo(h) {
  const u = h.object.userData.l3b;
  if (!u || !h.face) return null;
  const v = h.face.a, R = u.ranges;
  let lo = 0, hi = R.length - 1, r = null;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (R[mid].start <= v) { r = R[mid]; lo = mid + 1; } else hi = mid - 1; }
  if (!r || v >= r.start + r.count) return null;
  const model = l3b.models.find(m => m === u.model);
  return { itemId: r.itemId, name: r.name || "Objekt i modellen", extra: [["Modell", model ? model.name : ""], ["IFC-id", r.guid || ""]] };
}
