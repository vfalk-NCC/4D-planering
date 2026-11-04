/* Mesh-modeller: FBX, OBJ, GLB/glTF in i 3D-editorn (Victor 2026-11-04: "plocka ut modellerna ur NWD-filen … ska gå smidigt").
   Navisworks (Simulate/Manage) exporterar hela modellen eller ett urval som FBX (Arkiv → Exportera → FBX). Släpp filen i 3D-editorn (eller ＋ Mesh-modell…) så läses den in som ett eget lager:
     • Modellträdet (namn och hierarki från Navisworks) visas – tänd/släck delar, markera flera med Ctrl/Skift, zooma dit.
     • Enhet (auto/m/cm/mm), upp-axel (Z/Y) och placering kan justeras per modell.
     • "Exportera valda som IFC" gör de markerade delarna till IFC-objekt (med namn och färg) – till Trimble Connect eller som nedladdning – så att man plockar ut precis det man behöver.
   Allt sker lokalt i webbläsaren; filerna laddas inte upp någonstans. */
const l3ms = { models: [], seq: 0, loading: null };
const L3MS_EXT = /\.(fbx|obj|glb|gltf)$/i;   // (.dwf hanteras av lagesplan-3ddwf.js)
const l3msEsc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function l3msScript(src, test) { if (test()) return Promise.resolve(); return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("Kunde inte läsa " + src)); document.head.appendChild(s); }); }
async function l3msLoaders(ext) {
  if (/fbx/i.test(ext)) { await l3msScript("vendor/three/fflate.min.js", () => typeof fflate !== "undefined"); await l3msScript("vendor/three/FBXLoader.js", () => !!THREE.FBXLoader); }
  else if (/obj/i.test(ext)) await l3msScript("vendor/three/OBJLoader.js", () => !!THREE.OBJLoader);
  else await l3msScript("vendor/three/GLTFLoader.js", () => !!THREE.GLTFLoader);
}
function l3msGroup() { if (!l3.groups.mesh) { l3.groups.mesh = new THREE.Group(); l3.groups.mesh.name = "meshModels"; l3.scene.add(l3.groups.mesh); } return l3.groups.mesh; }
/* Enhet: auto = mm om utsträckningen är orimligt stor för meter (över 5 000 för en byggnadsmodell), annars meter. */
function l3msAutoUnit(size) { const m = Math.max(size.x, size.y, size.z); return m > 5000 ? 0.001 : 1; }
function l3msMeshes(root) { const out = []; root.traverse(o => { if (o.isMesh && o.geometry) out.push(o); }); return out; }
function l3msTris(root) { let n = 0; l3msMeshes(root).forEach(m => { const g = m.geometry; n += (g.index ? g.index.count : g.getAttribute("position").count) / 3; }); return Math.round(n); }
/* Läser filen till en THREE-grupp (modellens egna koordinater, ännu utan enhet/placering). */
async function l3msParse(file) {
  const ext = (file.name.match(L3MS_EXT) || [""])[0].slice(1).toLowerCase(); if (!ext) throw new Error("Okänd filtyp");
  await l3msLoaders(ext); const buf = await file.arrayBuffer();
  if (ext === "fbx") return { root: new THREE.FBXLoader().parse(buf, ""), ext };
  if (ext === "obj") return { root: new THREE.OBJLoader().parse(new TextDecoder().decode(buf)), ext };
  const gltf = await new Promise((res, rej) => new THREE.GLTFLoader().parse(buf, "", res, rej)); return { root: gltf.scene, ext };
}
/* Enhet och upp-axel läggs i en omslagsgrupp: scen = (modellkoordinater × enhet, ev. Y→Z) − l3.O. Placering = världskoordinater om modellen ligger i närheten av projektet, annars vyns mitt. */
function l3msApply(m) {
  const w = m.wrap; w.rotation.set(0, 0, 0); w.scale.setScalar(1); w.position.set(0, 0, 0); m.root.updateMatrixWorld(true);
  const bb0 = new THREE.Box3().setFromObject(m.root), size = bb0.getSize(new THREE.Vector3()); if (!m.unitSet) m.unit = l3msAutoUnit(size);
  w.scale.setScalar(m.unit); if (m.yup) w.rotation.x = Math.PI / 2; w.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(w), c = bb.getCenter(new THREE.Vector3()), O = l3.O;
  const near = Math.hypot(c.x - O[0], c.y - O[1]) < 20000;   // världskoordinater nära projektet
  if (m.place === "view" || (m.place !== "world" && !near)) { const t = l3.orbit.target; w.position.set(t.x - c.x, t.y - c.y, t.z - bb.min.z); m.placed = "vyns mitt"; }
  else { w.position.set(-O[0], -O[1], -O[2]); m.placed = "koordinaterna i filen"; }
  w.updateMatrixWorld(true); l3Render();
}
function l3msAdd(name, root, ext, o = {}) {
  const id = "ms" + (++l3ms.seq) + "-" + Date.now().toString(36), wrap = new THREE.Group(); wrap.add(root); wrap.name = name; l3msGroup().add(wrap);
  root.traverse(x => { if (x.isMesh) { const ms = Array.isArray(x.material) ? x.material : [x.material]; ms.forEach(mt => { if (mt) { mt.side = THREE.DoubleSide; } }); x.userData.noHit = false; } });
  const m = { id, name, ext, root, wrap, visible: true, unit: o.unit || 1, unitSet: !!o.unitSet, yup: ext === "gltf" || ext === "glb", place: null, open: true, sel: new Set(), shut: new Set(), tris: l3msTris(root) };
  l3ms.models.push(m); l3msApply(m);
  l3Toast(`${name}: ${m.tris.toLocaleString("sv-SE")} trianglar, placerad enligt ${m.placed}.${m.unit !== 1 ? ` Enhet: ${m.unit === 0.001 ? "mm" : m.unit === 0.3048 ? "fot" : m.unit}.` : ""}`);
  l3msZoom(m); if (typeof l3LayersRender === "function") l3LayersRender(); return m;
}
async function l3msLoadFile(file) {
  if (!l3 || !l3.scene) { l3Status("Öppna 3D-vyn först.", true); return null; }
  if (/\.dwf$/i.test(file.name)) return typeof l3dwfOpen === "function" ? l3dwfOpen(file) : null;   // 3D-DWF: väljer delar först (lagesplan-3ddwf.js)
  l3.busy = true; l3Status(`Läser ${file.name}…`);
  try {
    const { root, ext } = await l3msParse(file);
    return l3msAdd(file.name, root, ext);
  } catch (e) { console.warn("Mesh-modell", e); l3Status(`Kunde inte läsa ${file.name}: ${e.message || e}`, true); return null; }
  finally { l3.busy = false; }
}
function l3msZoom(m, node) { const bb = new THREE.Box3().setFromObject(node || m.wrap); if (bb.isEmpty()) return; if (typeof l3FlyTo === "function") l3FlyTo(bb.getCenter(new THREE.Vector3()), Math.max(6, bb.getSize(new THREE.Vector3()).length() * 1.4)); }
function l3msRemove(id) { const i = l3ms.models.findIndex(x => x.id === id); if (i < 0) return; const m = l3ms.models[i]; l3msGroup().remove(m.wrap); m.wrap.traverse(o => { if (o.geometry) o.geometry.dispose(); }); l3ms.models.splice(i, 1); l3Render(); l3LayersRender(); }
/* ---- Lager-listan ---- */
function l3msNodeId(o) { return o.uuid; }
function l3msTreeHtml(m, o, depth) {
  const kids = o.children.filter(c => c.isMesh || c.isGroup || c.isObject3D && c.children.length || c.type === "Object3D"), meshes = l3msMeshes(o).length, has = kids.some(k => k.children.length || k.isMesh), id = l3msNodeId(o), on = o.visible !== false, sel = m.sel.has(id), shut = m.shut.has(id);
  let nm = o.name || (o.isMesh ? "Del" : "Grupp"); if (!nm.trim()) nm = o.isMesh ? "Del" : "Grupp";
  let h = `<div class="v3-msn ${sel ? "sel" : ""}" data-msn="${l3msEsc(id)}" data-msm="${m.id}" style="padding-left:${6 + depth * 12}px"><button type="button" class="v3-msn-x" data-msx="${l3msEsc(id)}" ${kids.length ? "" : "disabled"} aria-expanded="${!shut}"><i>›</i></button><button type="button" class="v3-eye ${on ? "on" : ""}" data-mseye="${l3msEsc(id)}" title="${on ? "Släck" : "Tänd"}">${typeof l3lEye === "function" ? l3lEye(on) : ""}</button><span class="v3-msn-n" title="${l3msEsc(nm)}">${l3msEsc(nm)}</span>${meshes > 1 || o.children.length ? `<em>${meshes}</em>` : ""}</div>`;
  if (!shut && kids.length && depth < 14) h += kids.map(c => l3msTreeHtml(m, c, depth + 1)).join("");
  return h;
}
function l3msFind(m, id) { let r = null; m.root.traverse(o => { if (!r && o.uuid === id) r = o; }); return r; }
function l3msHtml() {
  if (!l3ms.models.length) return "";
  return `<div class="v3-lsub v3-msub"><div class="v3-lsub-h"><span class="v3-lsub-t"><i>›</i>Mesh-modeller <em>${l3ms.models.length}</em></span><a class="v3-ic" href="fbx2ifc.html" target="_blank" rel="noopener" title="Omvandla FBX/OBJ/GLB direkt till en kompakt IFC (.ifczip) – i en egen flik, för stora filer" style="text-decoration:none;display:inline-grid;place-items:center">⇄</a><button type="button" class="v3-ic" data-msadd="1" title="Läs in FBX, OBJ eller GLB från datorn (eller släpp filerna i 3D-fönstret)">＋</button></div><div class="v3-lsub-b">${l3ms.models.map(m => {
    const tools = m.open ? `<div class="v3-msm-set"><label title="Enhet i filen. Navisworks exporterar ofta i millimeter">Enhet <select data-msunit="${m.id}">${[[0, "Auto"], [1, "meter"], [0.01, "cm"], [0.001, "mm"]].map(([v, l]) => `<option value="${v}" ${(v === 0 ? !m.unitSet : m.unitSet && m.unit === v) ? "selected" : ""}>${l}</option>`).join("")}</select></label><label title="Y upp (glTF/OBJ) eller Z upp (som Revit/Navisworks)"><input type="checkbox" data-msyup="${m.id}" ${m.yup ? "checked" : ""}> Y är upp</label><button type="button" data-msplace="${m.id}" title="Placera modellen mitt i vyn">Till vyns mitt</button><button type="button" data-msplaceW="${m.id}" title="Placera enligt koordinaterna i filen">Filens koordinater</button></div>
      <div class="v3-msn-tree">${l3msTreeHtml(m, m.root, 0)}</div>
      <div class="v3-msm-act"><button type="button" data-msexp="${m.id}" title="De markerade delarna (Ctrl/Skift+klick i trädet), annars hela modellen, som IFC-objekt med namn och färg – till Trimble Connect eller som nedladdning">Exportera ${m.sel.size ? m.sel.size + " valda" : "allt"} som IFC…</button><button type="button" data-mszoom="${m.id}">Zooma</button>${m.sel.size ? `<button type="button" data-mshide="${m.id}">Släck valda</button><button type="button" data-msonly="${m.id}">Bara valda</button><button type="button" data-msall="${m.id}">Visa alla</button>` : ""}</div>` : "";
    return `<div class="v3-msm"><div class="v3-lr"><button type="button" class="v3-eye ${m.visible ? "on" : ""}" data-msvis="${m.id}">${typeof l3lEye === "function" ? l3lEye(m.visible) : ""}</button><span class="v3-lr-n v3-msm-n" data-msopen="${m.id}" title="${l3msEsc(m.name)} – klicka för modellträdet">${l3msEsc(m.name)}</span><em class="v3-lr-k">${(m.tris / 1000).toFixed(m.tris < 10000 ? 1 : 0).replace(".", ",")}k</em><button type="button" class="v3-lr-zoom v3-lr-del" data-msdel="${m.id}" title="Ta bort ur vyn (filen på datorn rörs inte)">${typeof L3_ICO !== "undefined" ? L3_ICO.trash : "×"}</button></div>${tools}</div>`; }).join("")}</div></div>`;
}
let l3msInput = null;
function l3msPick() { if (!l3msInput) { l3msInput = document.createElement("input"); l3msInput.type = "file"; l3msInput.multiple = true; l3msInput.accept = ".fbx,.obj,.glb,.gltf,.dwf"; l3msInput.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none"; document.body.appendChild(l3msInput); l3msInput.onchange = async () => { const fs = [...l3msInput.files]; l3msInput.value = ""; for (const f of fs) await l3msLoadFile(f); }; } l3msInput.click(); }
function l3msBind(host) {
  const M = id => l3ms.models.find(x => x.id === id), re = () => { l3Render(); l3LayersRender(); };
  host.querySelectorAll("[data-msadd]").forEach(b => { b.onclick = l3msPick; });
  host.querySelectorAll("[data-msvis]").forEach(b => { b.onclick = () => { const m = M(b.dataset.msvis); m.visible = !m.visible; m.wrap.visible = m.visible; re(); }; });
  host.querySelectorAll("[data-msdel]").forEach(b => { b.onclick = () => l3msRemove(b.dataset.msdel); });
  host.querySelectorAll("[data-msopen]").forEach(b => { b.onclick = () => { const m = M(b.dataset.msopen); m.open = !m.open; l3LayersRender(); }; });
  host.querySelectorAll("[data-msunit]").forEach(s => { s.onchange = () => { const m = M(s.dataset.msunit), v = Number(s.value); if (v) { m.unit = v; m.unitSet = true; } else m.unitSet = false; l3msApply(m); l3LayersRender(); }; });
  host.querySelectorAll("[data-msyup]").forEach(c => { c.onchange = () => { const m = M(c.dataset.msyup); m.yup = c.checked; l3msApply(m); l3LayersRender(); }; });
  host.querySelectorAll("[data-msplace]").forEach(b => { b.onclick = () => { const m = M(b.dataset.msplace); m.place = "view"; l3msApply(m); l3msZoom(m); l3LayersRender(); }; });
  host.querySelectorAll("[data-msplaceW]").forEach(b => { b.onclick = () => { const m = M(b.dataset.msplaceW); m.place = "world"; l3msApply(m); l3msZoom(m); l3LayersRender(); }; });
  host.querySelectorAll("[data-mszoom]").forEach(b => { b.onclick = () => { const m = M(b.dataset.mszoom), ids = [...m.sel]; if (ids.length) { const bb = new THREE.Box3(); ids.forEach(i => { const o = l3msFind(m, i); if (o) bb.expandByObject(o); }); if (!bb.isEmpty()) l3FlyTo(bb.getCenter(new THREE.Vector3()), Math.max(4, bb.getSize(new THREE.Vector3()).length() * 1.4)); } else l3msZoom(m); }; });
  const setVis = (m, ids, v) => { ids.forEach(i => { const o = l3msFind(m, i); if (o) o.visible = v; }); re(); };
  host.querySelectorAll("[data-mshide]").forEach(b => { b.onclick = () => { const m = M(b.dataset.mshide); setVis(m, [...m.sel], false); }; });
  host.querySelectorAll("[data-msall]").forEach(b => { b.onclick = () => { const m = M(b.dataset.msall); m.root.traverse(o => { o.visible = true; }); re(); }; });
  host.querySelectorAll("[data-msonly]").forEach(b => { b.onclick = () => { const m = M(b.dataset.msonly), keep = new Set(); [...m.sel].forEach(i => { const o = l3msFind(m, i); if (o) { o.traverse(c => keep.add(c.uuid)); let p = o.parent; while (p) { keep.add(p.uuid); p = p.parent; } } }); m.root.traverse(o => { o.visible = keep.has(o.uuid); }); re(); }; });
  host.querySelectorAll("[data-msexp]").forEach(b => { b.onclick = () => l3msExportIfc(M(b.dataset.msexp)); });
  host.querySelectorAll(".v3-msn").forEach(r => {
    const m = M(r.dataset.msm), id = r.dataset.msn;
    r.addEventListener("click", e => {
      if (e.target.closest("[data-mseye],[data-msx]")) return; const o = l3msFind(m, id); if (!o) return;
      if (e.shiftKey && m.anchor) { const rows = [...host.querySelectorAll(`.v3-msn[data-msm="${m.id}"]`)].map(x => x.dataset.msn), a = rows.indexOf(m.anchor), z = rows.indexOf(id); if (!(e.ctrlKey || e.metaKey)) m.sel.clear(); if (a >= 0 && z >= 0) rows.slice(Math.min(a, z), Math.max(a, z) + 1).forEach(i => m.sel.add(i)); }
      else if (e.ctrlKey || e.metaKey) { if (m.sel.has(id)) m.sel.delete(id); else m.sel.add(id); m.anchor = id; }
      else { m.sel.clear(); m.sel.add(id); m.anchor = id; l3msZoom(m, o); }
      l3LayersRender();
    });
    const x = r.querySelector("[data-msx]"); if (x) x.onclick = e => { e.stopPropagation(); if (m.shut.has(id)) m.shut.delete(id); else m.shut.add(id); l3LayersRender(); };
    const ey = r.querySelector("[data-mseye]"); if (ey) ey.onclick = e => { e.stopPropagation(); const o = l3msFind(m, id); if (!o) return; const ids = m.sel.has(id) && m.sel.size > 1 ? [...m.sel] : [id], v = o.visible === false; setVis(m, ids, v); };
  });
}
/* ---- IFC ---- */
function l3msColor(mesh) { const mt = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material, c = mt && mt.color ? mt.color : new THREE.Color(0.7, 0.7, 0.7); return { hex: "#" + c.getHexString(), op: mt && mt.transparent ? 1 - (mt.opacity == null ? 1 : mt.opacity) : 0 }; }
async function l3msIfcBuild(m, nodes, o = {}) {
  const O = l3.O, meshes = []; (nodes && nodes.length ? nodes : [m.root]).forEach(r => r.traverse(x => { if (x.isMesh && x.visible !== false && !meshes.includes(x)) meshes.push(x); }));
  const list = meshes.map(x => {
    const g = x.geometry, pa = g.getAttribute("position"); if (!pa) return null; x.updateMatrixWorld(true); const e = x.matrixWorld.elements, n = pa.count, pos = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) { const px = pa.getX(i), py = pa.getY(i), pz = pa.getZ(i); pos[i * 3] = e[0] * px + e[4] * py + e[8] * pz + e[12] + O[0]; pos[i * 3 + 1] = e[1] * px + e[5] * py + e[9] * pz + e[13] + O[1]; pos[i * 3 + 2] = e[2] * px + e[6] * py + e[10] * pz + e[14] + O[2]; }
    const col = l3msColor(x), path = []; let p = x; while (p && p !== m.root && p !== m.wrap) { if (p.name) path.unshift(p.name); p = p.parent; }
    return { name: x.name || path[path.length - 1] || "Del", path, pos, idx: g.index ? g.index.array : null, color: col.hex, opacity: col.op };
  }).filter(Boolean);
  const d = new Date(), p2 = x => String(x).padStart(2, "0"), base = m.name.replace(/\.[^.]+$/, ""), fn0 = `${base}${nodes && nodes.length ? " – urval" : ""} ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} kl ${p2(d.getHours())}.${p2(d.getMinutes())}.ifc`.replace(/[\\/:*?"<>|]/g, "-"), fn = typeof tcUniqueName === "function" ? tcUniqueName(fn0) : fn0;
  const r = await ifcFromMeshes(list, { projName: base, desc: "Mesh-modell från " + m.name, source: m.name, fileName: fn, minSize: o.minSize || 0, onProgress: f => busyProgress("msifc", `Bygger IFC (${Math.round(f * 100)} %)`, f) });
  busyProgress("msifc", "", null); if (!r) return null; return { text: r.text, fileName: r.fileName, n: r.stats.parts, tris: r.stats.tris, stats: r.stats };
}
async function l3msExportIfc(m) {
  const nodes = [...m.sel].map(i => l3msFind(m, i)).filter(Boolean); l3Status("Bygger IFC…");
  const r = await l3msIfcBuild(m, nodes);
  if (!r) { l3Status("Inget att exportera – inga synliga delar i urvalet.", true); return null; }
  return l3msDeliver(r);
}
async function l3msDeliver(r) {
  let bytes = new TextEncoder().encode(r.text), name = r.fileName, type = "application/x-step"; const raw = bytes.length;
  if (raw > 6e6) { try { await l3msScript("vendor/three/fflate.min.js", () => typeof fflate !== "undefined"); bytes = ifcZipBytes(r.text, name); name = name.replace(/\.ifc$/i, ".ifczip"); type = "application/zip"; } catch (e) { console.warn("Kunde inte packa", e); } }
  const file = new File([bytes], name, { type }), mb = v => (v / 1e6).toFixed(1).replace(".", ","), info = `${r.n} delar, ${r.stats.reused ? r.stats.reused + " delar delar geometri, " : ""}${mb(bytes.length)} MB${bytes.length < raw ? ` (packad från ${mb(raw)} MB)` : ""}`;
  try {
    if (!window.opener || window.opener.closed || typeof askOpener !== "function") { const url = URL.createObjectURL(file), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); l3Toast(`IFC hämtad: ${name} – ${info}.`, null, null, 10000); return r; }
    const up = await askOpener("tcUpload", { folder: "Lägesplan", files: [file] }, 10 * 60 * 1000); l3Toast(`Sparat i Trimble Connect: ${name} – ${info}${up && up.folder ? ` (${up.folder})` : ""}.`, null, null, 10000); return r;
  } catch (e) { l3Status("Kunde inte spara IFC-filen: " + e.message, true); throw e; }
}
/* Hook: lägg gruppen sist i 3D-modeller efter att Lager ritats. */
function l3msApplyUi() {
  const host = document.getElementById("v3PalLayers"); if (!host || host.classList.contains("hidden")) return; host.querySelectorAll(".v3-msub").forEach(x => x.remove());
  const html = l3msHtml(); if (!html) return; const sect = host.querySelector('.v3-lsec[data-lsec="models"] .v3-lsec-b'); if (!sect) return;
  sect.insertAdjacentHTML("beforeend", html); l3msBind(sect);
}
(function () { if (typeof l3LayersRender !== "function") return; const orig = l3LayersRender; l3LayersRender = function () { const r = orig.apply(this, arguments); try { l3msApplyUi(); } catch (e) { console.warn("Mesh-modeller", e); } return r; }; })();
