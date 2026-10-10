/* 3D-vyn – 2D-lägesplanens lager och DXF i 3D (Victor 2026-10-10: "visning och import av DXF" och "tända
   upp alla lager och saker som ligger i 2d-lägesplanen också").

   – DXF (CAD-underlagen, samma som i 2D – lagesplan-cad.js) ritas som riktiga linjer på marken, ett
     objekt per CAD-lager och färg, så de är skarpa på alla avstånd. Varje CAD-lager tänds/släcks.
   – Resten av 2D-lagren (zoner, noteringar, etablering i 2D, foton, ortofoto, andra PDF:er) läggs som en
     genomskinlig bild på marken, ritad på samma sätt som 2D-exporten.
   – Tänd/släck här är samma inställning som i 2D (setLayersVisible), så vyerna visar samma sak.
   – DXF kan läsas in direkt i 3D (fil eller från projektets mappar i Trimble Connect); den sparas som ett
     CAD-lager i lägesplanen precis som när den läses in i 2D. */

const l3s = { cad: new Map(), timer: 0, seq: 0, open: new Set() };

const l3sOn = () => l3Prefs().ground2d !== false;
function l3sZ() { return (plan && plan.calib ? plan.calib.model[0][2] || 0 : 0) - l3.O[2]; }
function l3sGroup(name) {
  if (!l3.groups[name]) { const g = new THREE.Group(); g.name = name; l3.groups[name] = g; l3.scene.add(g); }
  return l3.groups[name];
}

/* ---- DXF som linjer ---------------------------------------------------------------------------- */
function l3sCadMesh(r, g, gr) {
  let n = 0;
  gr.raw.forEach(a => { n += Math.max(0, a.length / 2 - 1); });
  const pos = new Float32Array(n * 6), ox = g.origin[0] - l3.O[0], oy = g.origin[1] - l3.O[1];
  let k = 0;
  gr.raw.forEach(a => {
    for (let j = 2; j < a.length; j += 2) {
      pos[k++] = ox + a[j - 2] / 1000; pos[k++] = oy + a[j - 1] / 1000; pos[k++] = 0;
      pos[k++] = ox + a[j] / 1000; pos[k++] = oy + a[j + 1] / 1000; pos[k++] = 0;
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.computeBoundingSphere();
  const obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x111827, transparent: true }));
  obj.userData.noHit = true; obj.raycast = () => {}; obj.renderOrder = 2;
  return obj;
}
async function l3sBuildCad() {
  if (!l3 || typeof cads !== "function" || !plan || !plan.calib) return;
  const grp = l3sGroup("cad");
  const want = cads().filter(r => ls("cad:" + r.id).visible);
  if (want.some(r => !cadGeom.has(r.id))) await ensureCadGeoms(want);
  const z = l3sZ() + 0.03, live = new Set();
  want.forEach(r => {
    const g = cadGeom.get(r.id); if (!g) return;
    if (typeof l3d !== "undefined" && l3d.rec && l3d.rec.id === r.id) return; // redigeras – ritas av lagesplan-3ddxf.js
    const names = r.layers.map(l => l.name), op = layerOpacity("cad:" + r.id);
    g.groups.forEach((gr, gi) => {
      if (!gr.raw || !gr.raw.length) return;
      const key = r.id + "|" + gi;
      let obj = l3s.cad.get(key);
      if (!obj) { obj = l3sCadMesh(r, g, gr); obj.userData.cadId = r.id; l3s.cad.set(key, obj); grp.add(obj); }
      obj.position.z = z + (Number(r.z3) || 0); // höjd i 3D satt i panelen (lagesplan-3dsitesel.js)
      obj.visible = cadLayerOn(r, names[gr.l]);
      obj.material.color.set(cadLayerColor(r, names[gr.l], gr.c));
      obj.material.opacity = op;
      live.add(key);
    });
  });
  l3s.cad.forEach((obj, key) => { if (!live.has(key)) obj.visible = false; });
  // Texterna (siffror och bokstäver) – Victor 2026-10-10.
  const liveT = new Set();
  want.forEach(r => { if (typeof l3d !== "undefined" && l3d.rec && l3d.rec.id === r.id) return; const g = cadGeom.get(r.id); if (g) { l3sCadTexts(r, g, z + 0.005 + (Number(r.z3) || 0)); liveT.add(r.id); } }); // redigeras: egna texter
  l3s.text.forEach((t, id) => { t.meshes.forEach(m => { m.visible = liveT.has(id); }); });
  if (typeof l3ssHighlight === "function" && l3ss.sel) l3ssHighlight(); else l3Render();
}

/* ---- DXF-texter ------------------------------------------------------------------------------- */
/* Alla texter i en ritning ritas en gång i en teckenatlas (4096 px, vita tecken) och läggs som platta
   rutor på marken i en enda mesh per atlas – tusentals texter blir ett par ritanrop. Färgen per
   CAD-lager, höjd, vridning och justering som i ritningen. Byggs om när CAD-lager tänds/släcks. */
const L3S_FONT = 44, L3S_ROW = 56, L3S_ATLAS = 4096;
function l3sCadTexts(r, g, z) {
  if (!l3s.text) l3s.text = new Map();
  const names = r.layers.map(l => l.name);
  const sig = names.map(n => (cadLayerOn(r, n) ? 1 : 0)).join("") + "|" + r.colorMode + "|" + r.color + "|" + z.toFixed(3) + "|" + l3.O.join(",");
  const cur = l3s.text.get(r.id);
  if (cur && cur.sig === sig) { cur.meshes.forEach(m => { m.material.opacity = layerOpacity("cad:" + r.id); }); return; }
  if (cur) l3sDisposeMeshes(cur.meshes);
  const list = [];
  g.groups.forEach(gr => {
    if (!gr.texts || !gr.texts.length || !cadLayerOn(r, names[gr.l])) return;
    const col = new THREE.Color(cadLayerColor(r, names[gr.l], gr.c));
    gr.texts.forEach(([x, y, h, rot, str, al]) => list.push(...l3sTextLines({ x: g.origin[0] + x / 1000, y: g.origin[1] + y / 1000, h: h / 1000, rot, s: str, al }, col)));
  });
  const meshes = l3sTextMeshes(list, z, layerOpacity("cad:" + r.id));
  meshes.forEach(m => { m.userData.cadText = r.id; l3sGroup("cad").add(m); });
  l3s.text.set(r.id, { sig, meshes, n: list.length });
}
function l3sDisposeMeshes(ms) { ms.forEach(m => { if (m.parent) m.parent.remove(m); m.geometry.dispose(); m.material.map.dispose(); m.material.dispose(); }); }
/* En text (kan ha flera rader) -> en post per rad för l3sTextMeshes. */
function l3sTextLines(t, col) {
  const out = [];
  String(t.s || "").split("\n").forEach((ln, k) => { if (ln.trim()) out.push({ x: t.x, y: t.y, h: Math.max(0.01, t.h), rot: t.rot || 0, s: ln, al: t.al || "lb", k, col }); });
  return out;
}
/* Textens ruta i modellens meter (fyra hörn), samma mått som när den ritas. */
let l3sMeasureCtx = null;
function l3sTextWidth(s) {
  if (!l3sMeasureCtx) { l3sMeasureCtx = document.createElement("canvas").getContext("2d"); l3sMeasureCtx.font = `${L3S_FONT}px "Segoe UI", Arial, sans-serif`; }
  return Math.min(L3S_ATLAS - 4, Math.ceil(l3sMeasureCtx.measureText(s).width) + 4);
}
function l3sTextQuad(t, wpx) {
  const k = t.h / (L3S_FONT * 0.72), W = (wpx == null ? l3sTextWidth(t.s) : wpx) * k, H = L3S_ROW * k;
  const ax = t.al[0] === "c" ? -W / 2 : t.al[0] === "r" ? -W : 0;
  // Baslinjen ligger (ROW - FONT) px ovanför rutans underkant. Lodrätt: b = baslinjen, m = mitt på
  // versalhöjden, t = versalhöjdens topp. Rad k av en flerradig text ligger k × 1,25 h längre ned.
  const ay = -(L3S_ROW - L3S_FONT) * k - (t.al[1] === "t" ? t.h : t.al[1] === "m" ? t.h / 2 : 0) - (t.k || 0) * t.h * 1.25;
  const a = (t.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const P = (dx, dy) => [t.x + (ax + dx) * c - (ay + dy) * s, t.y + (ax + dx) * s + (ay + dy) * c];
  return [P(0, 0), P(W, 0), P(W, H), P(0, H)];
}
/* Texterna som platta rutor på marken: en teckenatlas (4096 px, vita tecken) och en mesh per atlas –
   tusentals texter blir ett par ritanrop. list: [{ x, y, h, rot, s, al, k, col }] i modellens meter. */
function l3sTextMeshes(list, z, opacity = 1) {
  const meshes = [];
  if (!list.length) return meshes;
  const ctxOf = () => { const c = document.createElement("canvas"); c.width = L3S_ATLAS; c.height = L3S_ATLAS; const x = c.getContext("2d"); x.font = `${L3S_FONT}px "Segoe UI", Arial, sans-serif`; x.fillStyle = "#fff"; x.textBaseline = "alphabetic"; return { c, x, px: 2, py: 0, map: new Map(), items: [] }; };
  const atlases = [ctxOf()];
  const slot = s => {
    for (const A of atlases) if (A.map.has(s)) return [A, A.map.get(s)];
    let A = atlases[atlases.length - 1];
    const w = l3sTextWidth(s);
    if (A.px + w > L3S_ATLAS) { A.px = 2; A.py += L3S_ROW; }
    if (A.py + L3S_ROW > L3S_ATLAS) { if (atlases.length >= 6) return [null, null]; A = ctxOf(); atlases.push(A); }
    const sl = { u0: A.px / L3S_ATLAS, v0: 1 - (A.py + L3S_ROW) / L3S_ATLAS, u1: (A.px + w) / L3S_ATLAS, v1: 1 - A.py / L3S_ATLAS, w };
    A.x.fillText(s, A.px + 2, A.py + L3S_FONT); A.px += w + 4; A.map.set(s, sl);
    return [A, sl];
  };
  list.forEach(t => { const [A, sl] = slot(t.s); if (A) A.items.push([t, sl]); });
  atlases.forEach(A => {
    if (!A.items.length) return;
    const n = A.items.length, pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), col = new Float32Array(n * 12), idx = new Uint32Array(n * 6);
    A.items.forEach(([t, sl], i) => {
      l3sTextQuad(t, sl.w).forEach((p, j) => { pos.set([p[0] - l3.O[0], p[1] - l3.O[1], 0], i * 12 + j * 3); col.set([t.col.r, t.col.g, t.col.b], i * 12 + j * 3); });
      uv.set([sl.u0, sl.v0, sl.u1, sl.v0, sl.u1, sl.v1, sl.u0, sl.v1], i * 8);
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeBoundingSphere();
    const tex = new THREE.CanvasTexture(A.c); tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, alphaTest: 0.02 }));
    m.position.z = z; m.renderOrder = 3; m.userData.noHit = true; m.raycast = () => {};
    meshes.push(m);
  });
  return meshes;
}

/* ---- Övriga 2D-lager som bild på marken ------------------------------------------------------- */
async function l3sBuildGround() {
  if (!l3 || !page || !plan || !plan.calib || typeof composeImage !== "function") return;
  const seq = ++l3s.seq, grp = l3sGroup("ground2d");
  l3Clear(grp);
  if (!l3sOn()) { l3Render(); return; }
  // Vad som syns i 2D utom PDF:en (den ligger redan som mark) och CAD (ritas som linjer).
  const keys = layerDrawOrder();
  const over = keys.some(k => ls(k).visible && !k.startsWith("cad") && !k.startsWith("ortho:") && k !== "pdf");
  const ortho = keys.some(k => k.startsWith("ortho:") && ls(k).visible);
  if (!over && !ortho) { l3Render(); return; }
  await new Promise(r => setTimeout(r, 0));
  if (seq !== l3s.seq) return;
  // "over" = zoner, objekt, noteringar, etablering (genomskinlig; CAD ingår inte). Med ortofoto: ortofotot
  // och ritningen ihop som i 2D (ritningen multipliceras på fotot) – ersätter ritningen som mark.
  const cvOver = over ? composeImage(4096, true, "over") : null;
  const cvOrtho = ortho ? composeImage(4096, true, "base") : null;
  const z = l3sZ();
  const add = (cv, dz, order) => {
    if (!cv || !cv.width) return;
    const v1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: cv.width / v1.width });
    const pos = [], uv = [];
    [[0, cv.height], [cv.width, cv.height], [cv.width, 0], [0, 0]].forEach(([cx, cy]) => {
      const [px, py] = vp.convertToPdfPoint(cx, cy), [mx, my] = l3PdfToModel(px, py);
      pos.push(mx - l3.O[0], my - l3.O[1], z + dz); uv.push(cx / cv.width, 1 - cy / cv.height);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 8;
    if ("encoding" in tex) tex.encoding = THREE.sRGBEncoding;
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 - order, polygonOffsetUnits: -1 - order }));
    m.userData.noHit = true; m.raycast = () => {}; m.renderOrder = 1 + order;
    grp.add(m);
  };
  add(cvOrtho, 0.005, 0);
  add(cvOver, 0.015, 1);
  l3Render();
}
function l3sRefresh(delay = 120) {
  if (!l3) return;
  // Ny arbetsyta (annat origo): linjerna byggs om.
  const sig = (plan && plan.id) + "|" + l3.O.join(",");
  if (l3s.sig !== sig) { l3s.sig = sig; if (l3.groups.cad) l3Clear(l3.groups.cad); l3s.cad.clear(); l3s.text = new Map(); if (typeof l3d !== "undefined") { l3d.mesh = l3d.selMesh = l3d.selPts = l3d.prev = null; } }
  clearTimeout(l3s.timer);
  l3s.timer = setTimeout(() => { l3sBuildCad().catch(e => console.warn("CAD i 3D", e)); l3sBuildGround().catch(e => console.warn("2D-lager i 3D", e)); }, delay);
}

/* ---- Lagerlistan (fliken Lager) ---------------------------------------------------------------- */
function l3sName(k) {
  if (k.startsWith("ortho:") || k.startsWith("cad:")) { const x = siteItems.find(y => k.endsWith(":" + y.id)); return x ? (x.name || k) + (k.startsWith("cad:") ? " (DXF)" : " (ortofoto)") : k; }
  return layerDisplayName(k);
}
function l3sHtml(row, eye) {
  if (typeof layerDisplayEntries !== "function" || !plan) return null;
  const esc = escHtml;
  const keyRow = (k, depth) => {
    if (k === "pdf") return ""; // ritningen har egen rad (Underlag)
    const on = !!ls(k).visible, cad = k.startsWith("cad:") ? siteItems.find(x => "cad:" + x.id === k) : null, open = cad && l3s.open.has(k);
    let h = `<div class="v3-lr ${depth ? "v3-lr-sub" : ""}"><button type="button" class="v3-eye ${on ? "on" : ""}" data-l3s="${esc(k)}" title="${on ? "Släck" : "Tänd"}">${eye(on)}</button><span class="v3-lr-n" title="${esc(l3sName(k))}">${esc(l3sName(k))}</span>${cad ? `<button type="button" class="v3-lr-x" data-l3s-open="${esc(k)}" aria-expanded="${!!open}" title="CAD-lagren i ritningen">${cad.layers.length} lager ${open ? "▴" : "▾"}</button>${typeof l3dStart === "function" ? `<button type="button" class="v3-lr-zoom" data-l3s-edit="${esc(cad.id)}" title="Redigera DXF:en – välj, flytta, ta bort och rita linjer">${L3_ICO.edit}</button>` : ""}` : ""}</div>`;
    if (open) h += cad.layers.map(l => { const lk = `cadl:${cad.id}:${l.name}`, lon = !!ls(lk).visible; return `<div class="v3-lr v3-lr-sub2"><button type="button" class="v3-eye ${lon ? "on" : ""}" data-l3s="${esc(lk)}">${eye(lon)}</button><i class="v3-lr-dot" style="background:${esc(cadLayerColor(cad, l.name, l.color))}"></i><span class="v3-lr-n" title="${esc(l.name)}">${esc(l.name)}</span><em class="v3-lr-k">${l.n || ""}</em></div>`; }).join("");
    return h;
  };
  let h = "";
  layerDisplayEntries().forEach(e => {
    if (e.folder) {
      const kids = e.kids.filter(k => k !== "pdf"); if (!kids.length) return;
      const on = kids.some(k => ls(k).visible), shut = l3s.fold && (l3s.fold.has("*") ? !l3s.fold.has("+" + e.folder.id) : l3s.fold.has(e.folder.id));
      h += `<div class="v3-lr v3-lr-b"><button type="button" class="v3-eye ${on ? "on" : ""}" data-l3s-folder="${esc(e.folder.id)}">${eye(on)}</button><button type="button" class="v3-lr-fold" data-l3s-fold="${esc(e.folder.id)}" aria-expanded="${!shut}"><i>›</i>${esc(e.folder.name)} <em>${kids.length}</em></button></div>` + (shut ? "" : kids.map(k => keyRow(k, 1)).join(""));
    } else h += keyRow(e.key, 0);
  });
  return { extra: `<label class="v3-chk v3-lg-chk" title="Visa 2D-lagren (zoner, noteringar, etablering, ortofoto, DXF) på marken i 3D"><input type="checkbox" id="v3S2d" ${l3sOn() ? "checked" : ""} /> på marken</label>`, body: `
    ${l3sOn() ? h || `<div class="v3-pal-hint">Inga 2D-lager.</div>` : ""}
    <button type="button" class="v3-wide" id="v3SDxf" title="Läs in en DXF – den hamnar på rätt plats via modellens koordinater och blir ett CAD-lager i lägesplanen (även i 2D)">＋ Läs in DXF…</button><input type="file" id="v3SDxfIn" accept=".dxf" multiple hidden />` };
}
function l3sBind(host) {
  host.querySelectorAll("[data-l3s]").forEach(b => { b.onclick = () => { const k = b.dataset.l3s; setLayersVisible([k], !ls(k).visible); l3sRefresh(0); l3LayersRender(); }; });
  host.querySelectorAll("[data-l3s-folder]").forEach(b => { b.onclick = () => { const e = layerDisplayEntries().find(x => x.folder && x.folder.id === b.dataset.l3sFolder); if (!e) return; const kids = e.kids.filter(k => k !== "pdf"); setLayersVisible(kids, !kids.some(k => ls(k).visible)); l3sRefresh(0); l3LayersRender(); }; });
  host.querySelectorAll("[data-l3s-fold]").forEach(b => { b.onclick = () => { const id = b.dataset.l3sFold; l3s.fold = l3s.fold || new Set(); if (l3s.fold.has("*")) { if (l3s.fold.has("+" + id)) l3s.fold.delete("+" + id); else l3s.fold.add("+" + id); } else if (l3s.fold.has(id)) l3s.fold.delete(id); else l3s.fold.add(id); l3LayersRender(); }; });
  host.querySelectorAll("[data-l3s-edit]").forEach(b => { b.onclick = () => l3dStart(b.dataset.l3sEdit); });
  host.querySelectorAll("[data-l3s-open]").forEach(b => { b.onclick = () => { const k = b.dataset.l3sOpen; if (l3s.open.has(k)) l3s.open.delete(k); else l3s.open.add(k); l3LayersRender(); }; });
  const cb = host.querySelector("#v3S2d"); if (cb) cb.onchange = () => { l3SetPref("ground2d", cb.checked); l3sRefresh(0); l3LayersRender(); };
  const bt = host.querySelector("#v3SDxf"), inp = host.querySelector("#v3SDxfIn");
  if (bt && inp) {
    bt.onclick = () => inp.click();
    inp.onchange = async () => { const files = [...inp.files]; inp.value = ""; if (!files.length) return; await addDxfFiles(files); l3sRefresh(0); l3LayersRender(); };
  }
}
/* DXF ur projektets mappar i Trimble Connect (fliken Lager): hämtas och blir ett CAD-lager. */
async function l3sDxfFromTc(fileId, name) {
  const key = "dxf:" + fileId;
  try {
    busyProgress(key, `Hämtar ${name}`, 0);
    const r = await askOpener("tcFile", { fileId, name }, 0, f => busyProgress(key, `Hämtar ${name}`, 0.9 * f));
    busyProgress(key, "", null);
    await addDxfFiles([new File([r.bytes], name)], { noTc: true }); // finns redan i TC
    l3sRefresh(0); l3LayersRender();
  } catch (e) { busyProgress(key, "", null); l3Status(`Kunde inte läsa ${name}: ${e.message}`, true); }
}

/* Datumet styr zoner och etablering i 2D: marken ritas om när det ändras. */
if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", () => {
  const d = document.getElementById("dateInput");
  if (d) d.addEventListener("change", () => { const v = document.getElementById("view3d"); if (l3 && v && !v.classList.contains("hidden")) l3sRefresh(250); });
});

/* ---- Fäst mot DXF (andra hand efter 3D) --------------------------------------------------------- */
/* Rutnät (20 m) med DXF:ernas sträckor i modellens meter, per ritning; byggs när det behövs. */
function l3sDxfIndex(r) {
  const g = cadGeom.get(r.id); if (!g) return null;
  const sig = r.layers.map(l => cadLayerOn(r, l.name) ? 1 : 0).join("");
  if (r._snap && r._snap.sig === sig && r._snap.g === g) return r._snap;
  const C = 20, cells = new Map(), names = r.layers.map(l => l.name);
  const add = (k, s) => { const a = cells.get(k); if (a) a.push(s); else cells.set(k, [s]); };
  g.groups.forEach(gr => {
    if (!cadLayerOn(r, names[gr.l])) return;
    (gr.raw || []).forEach(a => {
      for (let j = 2; j < a.length; j += 2) {
        const x0 = g.origin[0] + a[j - 2] / 1000, y0 = g.origin[1] + a[j - 1] / 1000, x1 = g.origin[0] + a[j] / 1000, y1 = g.origin[1] + a[j + 1] / 1000, s = [x0, y0, x1, y1];
        const cx0 = Math.floor(Math.min(x0, x1) / C), cx1 = Math.floor(Math.max(x0, x1) / C), cy0 = Math.floor(Math.min(y0, y1) / C), cy1 = Math.floor(Math.max(y0, y1) / C);
        if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > 400) continue; // väldigt långa linjer: bara ändpunkterna räcker sällan – hoppa över
        for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) add(cx + "," + cy, s);
      }
    });
  });
  return (r._snap = { sig, g, C, cells });
}
function l3sDxfSnap(e, S) {
  if (!l3 || typeof cads !== "function" || !plan || !plan.calib) return null;
  const recs = cads().filter(r => ls("cad:" + r.id).visible && cadGeom.has(r.id) && !(typeof l3d !== "undefined" && l3d.rec && l3d.rec.id === r.id));
  const editing = typeof l3d !== "undefined" && l3d.rec ? l3d.ents.filter(x => !x.del && l3dLayerOn(x.layer)) : null;
  if (!recs.length && !editing) return null;
  const R = l3.renderer.domElement.getBoundingClientRect(), mx = e.clientX - R.left, my = e.clientY - R.top, z = l3sZ() + 0.03;
  const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(mx / R.width * 2 - 1, -(my / R.height) * 2 + 1), l3.camera);
  const gp = rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), new THREE.Vector3());
  if (!gp) return null;
  const P = [gp.x + l3.O[0], gp.y + l3.O[1]];
  // Hur många meter 14 px är här.
  const q0 = l3ToScreen(gp), q1 = l3ToScreen(gp.clone().add(new THREE.Vector3(1, 0, 0))), q2 = l3ToScreen(gp.clone().add(new THREE.Vector3(0, 1, 0)));
  const ppm = Math.max(1e-6, Math.max(Math.hypot(q1.x - q0.x, q1.y - q0.y), Math.hypot(q2.x - q0.x, q2.y - q0.y))), rad = 14 / ppm;
  const segs = [];
  recs.forEach(r => {
    const ix = l3sDxfIndex(r); if (!ix) return;
    const c0x = Math.floor((P[0] - rad) / ix.C), c1x = Math.floor((P[0] + rad) / ix.C), c0y = Math.floor((P[1] - rad) / ix.C), c1y = Math.floor((P[1] + rad) / ix.C);
    for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) (ix.cells.get(cx + "," + cy) || []).forEach(s => segs.push(s));
  });
  if (editing) editing.forEach(en => { for (let j = 1; j < en.pts.length; j++) segs.push([en.pts[j - 1][0], en.pts[j - 1][1], en.pts[j][0], en.pts[j][1]]); });
  if (!segs.length) return null;
  const scr = (x, y) => l3ToScreen(new THREE.Vector3(x - l3.O[0], y - l3.O[1], z));
  let best = null;
  const take = (d, x, y, kind, lim) => { if (d < lim && (!best || (best.rank > ({ end: 0, mid: 1, edge: 2 })[kind]) || (best.kind === kind && d < best.d))) best = { d, x, y, kind, rank: ({ end: 0, mid: 1, edge: 2 })[kind] }; };
  segs.forEach(([x0, y0, x1, y1]) => {
    if (Math.max(Math.abs(x0 - P[0]), Math.abs(y0 - P[1])) > rad * 30 && Math.max(Math.abs(x1 - P[0]), Math.abs(y1 - P[1])) > rad * 30 && segs.length > 5000) return;
    const a = scr(x0, y0), b = scr(x1, y1);
    if (a.behind || b.behind) return;
    if (S.end) { take(Math.hypot(a.x - mx, a.y - my), x0, y0, "end", 14); take(Math.hypot(b.x - mx, b.y - my), x1, y1, "end", 14); }
    if (S.mid) { const m = scr((x0 + x1) / 2, (y0 + y1) / 2); take(Math.hypot(m.x - mx, m.y - my), (x0 + x1) / 2, (y0 + y1) / 2, "mid", 12); }
    if (S.edge) {
      const ax = b.x - a.x, ay = b.y - a.y, l2 = ax * ax + ay * ay; if (!l2) return;
      const t = Math.max(0, Math.min(1, ((mx - a.x) * ax + (my - a.y) * ay) / l2));
      take(Math.hypot(a.x + ax * t - mx, a.y + ay * t - my), x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, "edge", 8);
    }
  });
  return best ? { point: new THREE.Vector3(best.x - l3.O[0], best.y - l3.O[1], z), kind: best.kind, dxf: true, placeId: null } : null;
}
