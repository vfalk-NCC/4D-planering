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
      obj.position.z = z;
      obj.visible = cadLayerOn(r, names[gr.l]);
      obj.material.color.set(cadLayerColor(r, names[gr.l], gr.c));
      obj.material.opacity = op;
      live.add(key);
    });
  });
  l3s.cad.forEach((obj, key) => { if (!live.has(key)) obj.visible = false; });
  l3Render();
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
  if (l3s.sig !== sig) { l3s.sig = sig; if (l3.groups.cad) l3Clear(l3.groups.cad); l3s.cad.clear(); }
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
