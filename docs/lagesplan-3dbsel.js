/* 3D-vyn – markera objekt i inlästa IFC-modeller (Victor 2026-10-10: "jag ska kunna välja objekt i
   IFC-filerna och då ska de highlightas").

   – Tryck på ett objekt i byggnaden: det markeras (lila ton och lila konturer som syns även bakom annat).
     Skift/Ctrl lägger till eller tar bort. En ruta (Tekla: dra med vänster) markerar flera. Esc avmarkerar.
   – Panelen till höger visar det markerade: namn, modell, IFC-id och koppling till planeringen, med
     Zooma, Dölj, Visa bara dessa och Markera i 4D-planering.
   Markeringen ritas som ett överlägg som delar punkterna med byggnadsbiten (inget kopieras) och följer
   med om biten flyttas. */

const l3bs = { sel: [] }; // [{ mesh, ri, key }]
const L3BS_COL = 0x6d5efc;

/* Objektets triangelintervall i bitens ursprungliga indexlista (workern sparar det; äldre cache: sök). */
function l3bsIdx(mesh, ri) {
  const u = mesh.userData.l3b, r = u.ranges[ri];
  if (r.idxStart != null && r.idxCount != null) return [r.idxStart, r.idxCount];
  const src = u.origIdx, lo = r.start, hi = r.start + r.count;
  let s = -1, e = -1;
  for (let i = 0; i + 2 < src.length; i += 3) { const v = src[i]; if (v >= lo && v < hi) { if (s < 0) s = i; e = i + 3; } else if (s >= 0) break; }
  r.idxStart = Math.max(0, s); r.idxCount = s < 0 ? 0 : e - s;
  return [r.idxStart, r.idxCount];
}
function l3bsKey(mesh, ri) { const r = mesh.userData.l3b.ranges[ri]; return (mesh.userData.l3b.model && mesh.userData.l3b.model.id || "") + "|" + (r.guid || `${mesh.uuid}:${ri}`); }

function l3bsOverlay(ent) {
  const { mesh, ri } = ent, [s, c] = l3bsIdx(mesh, ri);
  if (!c) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", mesh.geometry.getAttribute("position")); // delas med biten
  g.setIndex(new THREE.BufferAttribute(mesh.userData.l3b.origIdx.slice(s, s + c), 1));
  g.computeBoundingSphere();
  const fill = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: L3BS_COL, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({ color: L3BS_COL, transparent: true, opacity: 0.95, depthTest: false }));
  [fill, edges].forEach(o => { o.userData.noHit = true; o.userData.bsel = true; o.raycast = () => {}; o.renderOrder = 6; mesh.add(o); });
  ent.fill = fill; ent.edges = edges;
}
function l3bsDropOverlay(ent) {
  [ent.fill, ent.edges].forEach(o => {
    if (!o) return;
    if (o.parent) o.parent.remove(o);
    if (o === ent.fill) o.geometry.deleteAttribute("position"); // punkterna tillhör biten – släpp bara indexet
    o.geometry.dispose(); o.material.dispose();
  });
  ent.fill = ent.edges = null;
}

function l3bsSet(list, opts = {}) {
  const want = new Map(list.map(e => [l3bsKey(e.mesh, e.ri), e]));
  l3bs.sel.forEach(e => { if (!want.has(e.key)) l3bsDropOverlay(e); });
  const keep = new Map(l3bs.sel.filter(e => want.has(e.key)).map(e => [e.key, e]));
  l3bs.sel = [...want.entries()].map(([key, e]) => keep.get(key) || (() => { const ent = { mesh: e.mesh, ri: e.ri, key }; l3bsOverlay(ent); return ent; })());
  if (l3bs.sel.length && l3.sel && l3.sel.size && !opts.keepPlaces) l3SelectIds([]); // en sorts markering i taget
  if (typeof l3RenderSide === "function") l3RenderSide();
  l3Render();
}
function l3bsClear() { if (l3bs.sel.length) l3bsSet([]); }
/* Träff i byggnaden -> markera (additive: lägg till/ta bort). */
function l3bsFromHit(h) {
  const u = h && h.object && h.object.userData.l3b;
  if (!u || !h.face) return null;
  const v = h.face.a, R = u.ranges;
  let lo = 0, hi = R.length - 1, ri = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (R[mid].start <= v) { ri = mid; lo = mid + 1; } else hi = mid - 1; }
  if (ri < 0 || v >= R[ri].start + R[ri].count) return null;
  return { mesh: h.object, ri };
}
function l3bsTap(h, additive) {
  const e = l3bsFromHit(h);
  if (!e) { if (!additive) l3bsClear(); return false; }
  const key = l3bsKey(e.mesh, e.ri);
  if (additive) {
    const cur = l3bs.sel.map(x => ({ mesh: x.mesh, ri: x.ri }));
    const i = l3bs.sel.findIndex(x => x.key === key);
    if (i >= 0) cur.splice(i, 1); else cur.push(e);
    l3bsSet(cur);
  } else l3bsSet([e]);
  return true;
}

/* Objektens mittpunkter per bit (för rutmarkering), räknas en gång. */
function l3bsCenters(mesh) {
  const u = mesh.userData.l3b;
  if (u.centers) return u.centers;
  const p = mesh.geometry.getAttribute("position").array, c = new Float32Array(u.ranges.length * 3);
  u.ranges.forEach((r, i) => {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let v = r.start; v < r.start + r.count; v++) { const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    c[i * 3] = (x0 + x1) / 2; c[i * 3 + 1] = (y0 + y1) / 2; c[i * 3 + 2] = (z0 + z1) / 2;
  });
  return (u.centers = c);
}
/* Rutmarkering: byggnadens objekt vars mitt ligger i rutan (dolda och släckta modeller räknas inte). */
function l3bsInRect(L, R, T, B, rect) {
  const out = [], v = new THREE.Vector3();
  l3b.models.forEach(m => {
    if (!m.visible) return;
    m.meshes.forEach(mesh => {
      if (!mesh.visible) return;
      const u = mesh.userData.l3b, c = l3bsCenters(mesh), off = u.tempOff || new Set();
      mesh.updateMatrixWorld(true);
      for (let i = 0; i < u.ranges.length && out.length < 5000; i++) {
        if (u.hidden.has(i) || off.has(i)) continue;
        v.set(c[i * 3], c[i * 3 + 1], c[i * 3 + 2]).applyMatrix4(mesh.matrixWorld).project(l3.camera);
        if (v.z > 1) continue;
        const x = (v.x + 1) / 2 * rect.width, y = (1 - v.y) / 2 * rect.height;
        if (x >= L && x <= R && y >= T && y <= B) out.push({ mesh, ri: i });
      }
    });
  });
  return out;
}

/* Det markerade: namn, modell, IFC-id, koppling. */
function l3bsInfo() {
  const byId = new Map((typeof items !== "undefined" ? items : []).map(r => [r.id, r]));
  return l3bs.sel.map(e => {
    const u = e.mesh.userData.l3b, r = u.ranges[e.ri];
    return { name: r.name || "Objekt", guid: r.guid || "", model: (u.model && u.model.name) || "", item: r.itemId ? byId.get(r.itemId) : null };
  });
}
function l3bsBox() {
  const b = new THREE.Box3(), v = new THREE.Vector3();
  l3bs.sel.forEach(e => {
    const p = e.mesh.geometry.getAttribute("position").array, r = e.mesh.userData.l3b.ranges[e.ri];
    e.mesh.updateMatrixWorld(true);
    for (let i = r.start; i < r.start + r.count; i++) b.expandByPoint(v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]).applyMatrix4(e.mesh.matrixWorld));
  });
  return b;
}
function l3bsZoom() {
  const b = l3bsBox();
  if (b.isEmpty()) return;
  l3FlyTo(b.getCenter(new THREE.Vector3()), Math.max(4, b.getSize(new THREE.Vector3()).length() * 1.4));
}
function l3bsHide() {
  const n = l3bs.sel.length, meshes = new Set();
  l3bs.sel.forEach(e => { e.mesh.userData.l3b.hidden.add(e.ri); meshes.add(e.mesh); });
  l3bsSet([]);
  meshes.forEach(m => l3bApplyHidden(m));
  l3Status(`${n} objekt dolda – Visa alla (U) visar dem igen.`);
  l3Render();
}
/* Visa bara de markerade: alla andra objekt i byggnaden döljs. */
function l3bsIsolate() {
  const keep = new Map();
  l3bs.sel.forEach(e => { if (!keep.has(e.mesh)) keep.set(e.mesh, new Set()); keep.get(e.mesh).add(e.ri); });
  l3b.models.forEach(m => m.meshes.forEach(mesh => {
    const u = mesh.userData.l3b, k = keep.get(mesh) || new Set();
    u.hidden = new Set(u.ranges.map((_, i) => i).filter(i => !k.has(i)));
    l3bApplyHidden(mesh);
  }));
  l3Status(`Visar bara ${l3bs.sel.length} objekt – Visa alla (U) visar resten igen.`);
  l3Render();
}

/* Osparade flyttar i de markerade objektens modeller: knapp för att spara som ny IFC i TC. */
function l3bsPendingHtml() {
  if (typeof l3bmPending !== "function") return "";
  const models = [...new Set(l3bs.sel.map(e => e.mesh.userData.l3b.model))].filter(m => m && l3bmPending(m.id));
  return models.map(m => `<button type="button" class="v3-wide v3-primary" data-bmsave="${escHtml(m.id)}" title="Originalet hämtas från Trimble Connect, flyttarna skrivs in och resultatet sparas som en ny fil i samma mapp – originalet skrivs aldrig över">Spara som ny IFC i TC (${l3bmPending(m.id)} flyttade i ${escHtml(m.name)})</button>`).join("");
}
/* Panelen till höger när objekt i byggnaden är markerade. */
function l3bsRenderSide(side) {
  const info = l3bsInfo(), n = info.length, esc = escHtml;
  const coupled = info.filter(x => x.item);
  const one = n === 1 ? info[0] : null;
  const row = (k, v) => v ? `<tr><td>${k}</td><td>${esc(v)}</td></tr>` : "";
  side.dataset.id = "bsel:" + l3bs.sel.map(e => e.key).join(",");
  side.innerHTML = `<div class="v3-side-h"><i class="v3-chip" style="background:#6d5efc"></i><b>${one ? esc(one.name) : `${n} objekt i byggnaden`}</b><button type="button" class="v3-side-min" title="Fäll ihop/ut panelen">▾</button><button type="button" class="v3-x" id="v3BsClose" title="Avmarkera (Esc)">✕</button></div>
    <div class="v3-sub">${one ? esc(one.model) : esc([...new Set(info.map(x => x.model))].join(", "))}</div>
    ${one ? `<table class="v3-info-t">${row("IFC-id", one.guid)}${one.item ? row("Aktivitet", one.item.activity) + row("Status", PHASE_LABELS[l3Phase(one.item)] || "") + row("Period", one.item.start_date ? `${one.item.start_date} – ${one.item.end_date || ""}` : "") : row("Planering", "Inte kopplad")}</table>`
      : `<div class="v3-bs-list">${info.slice(0, 60).map(x => `<div class="v3-bs-row" title="${esc(x.guid)}"><span>${esc(x.name)}</span>${x.item ? `<em>${esc(x.item.activity || "kopplad")}</em>` : ""}</div>`).join("")}${n > 60 ? `<div class="v3-pal-hint">… och ${n - 60} till</div>` : ""}</div>`}
    <div class="v3-btns">
      <button type="button" id="v3BsZoom">${L3_ICO.focus}Zooma</button>
      <button type="button" id="v3BsHide" title="Dölj de markerade (H)">Dölj</button>
      <button type="button" id="v3BsIso" title="Visa bara de markerade (I)">Visa bara dessa</button>
      ${typeof l3bmStart === "function" ? `<button type="button" id="v3BsMove" title="Flytta de markerade – sparas som en ny IFC-fil i Trimble Connect">Flytta…</button>` : ""}
      ${l3bsPendingHtml(info)}
      ${coupled.length ? `<button type="button" id="v3BsJump" class="v3-wide" title="Markera de kopplade aktiviteterna i 4D-planering och objekten i Trimble Connect">Markera i 4D-planering (${coupled.length})</button>` : ""}
    </div>`;
  const on = (id, fn) => { const b = side.querySelector("#" + id); if (b) b.onclick = fn; };
  on("v3BsClose", l3bsClear);
  on("v3BsZoom", l3bsZoom);
  on("v3BsHide", l3bsHide);
  on("v3BsIso", l3bsIsolate);
  on("v3BsMove", () => l3bmStart());
  side.querySelectorAll("[data-bmsave]").forEach(b => { b.onclick = async () => { b.disabled = true; try { await l3bmSave(b.dataset.bmsave); } catch (e) { /* visas i statusraden */ } l3RenderSide(); }; });
  on("v3BsJump", () => askOpener("select", { ids: [...new Set(coupled.map(x => x.item.id))], jump: true }, 15000).then(() => l3Toast("Markerat i 4D-planering och i Trimble Connect.")).catch(e => l3Toast(e.message)));
}
