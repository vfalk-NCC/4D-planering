/* Egen figur (GLB) i gå-läget (Victor 2026-10-22: "grafik som World of Warcraft"). Procedurella figurer blir aldrig lika snygga som en konstnärsgjord modell –
   därför kan du ladda in en egen stiliserad karaktär (.glb/.gltf, gärna med animationerna Idle/Walk/Run). Filen sparas i webbläsaren (IndexedDB) så att du slipper välja om den.
   l3glb.root = inläst modell (en instans), l3glbEnsure() = ladda från webbläsaren eller fråga efter fil, l3glbBuild() = figur i samma format som l3cHuman. */
const l3glb = { root: null, clips: [], name: "", busy: null };
function l3glbDb() { return new Promise((res, rej) => { const q = indexedDB.open("4dplan-glb", 1); q.onupgradeneeded = () => q.result.createObjectStore("f"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function l3glbStore(name, buf) { try { const db = await l3glbDb(); db.transaction("f", "readwrite").objectStore("f").put({ name, buf }, "avatar"); } catch (e) { /* utan lagring måste filen väljas om nästa gång */ } }
async function l3glbLoadStored() { try { const db = await l3glbDb(); return await new Promise(r => { const q = db.transaction("f").objectStore("f").get("avatar"); q.onsuccess = () => r(q.result || null); q.onerror = () => r(null); }); } catch (e) { return null; } }
function l3glbScript() {
  if (typeof THREE !== "undefined" && THREE.GLTFLoader) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = "vendor/three/GLTFLoader.js"; s.onload = res; s.onerror = () => rej(new Error("GLTFLoader saknas")); document.head.appendChild(s); });
}
async function l3glbParse(buf, name) {
  await l3glbScript();
  const gltf = await new Promise((res, rej) => new THREE.GLTFLoader().parse(buf, "", res, rej));
  const root = gltf.scene; root.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(root), sz = bb.getSize(new THREE.Vector3());
  if (!(sz.y > 0)) throw new Error("tom modell");
  root.traverse(o => { o.frustumCulled = false; o.userData.noHit = true; if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.userData.shared = true; if (m.map) m.map.encoding = THREE.sRGBEncoding; }); });
  Object.assign(l3glb, { root, clips: gltf.animations || [], name: name || "figur", box: bb, busy: null });
}
async function l3glbEnsure() {
  if (l3glb.root) return true; if (l3glb.busy) return l3glb.busy;
  return l3glb.busy = (async () => {
    try { const st = await l3glbLoadStored(); if (st && st.buf) { await l3glbParse(st.buf, st.name); return true; } } catch (e) { /* trasig sparad fil – fråga efter en ny */ }
    const f = await new Promise(res => { const i = document.createElement("input"); i.type = "file"; i.accept = ".glb,.gltf,model/gltf-binary"; i.onchange = () => res(i.files[0] || null); i.oncancel = () => res(null); i.click(); });
    if (!f) return false;
    try { const buf = await f.arrayBuffer(); await l3glbParse(buf, f.name); l3glbStore(f.name, buf); return true; }
    catch (e) { if (typeof l3Status === "function") l3Status("Kunde inte läsa modellen: " + (e && e.message || e) + " – använd en .glb-fil.", true); return false; }
    finally { l3glb.busy = null; }
  })().finally(() => { l3glb.busy = null; });
}
function l3glbBuild(rotQ) {
  const root = l3glb.root; if (!root) return null;
  const H = 1.78, s = H / (l3glb.box.max.y - l3glb.box.min.y), g = new THREE.Group(), face = new THREE.Group(), up = new THREE.Group();
  up.rotation.x = Math.PI / 2; face.rotation.z = Math.PI / 2 + (rotQ || 0) * Math.PI / 2; root.scale.set(s, s, s); root.position.set(0, -l3glb.box.min.y * s, 0); if (root.parent) root.parent.remove(root); up.add(root); face.add(up); g.add(face);
  const mixer = l3glb.clips.length ? new THREE.AnimationMixer(root) : null, pick = re => l3glb.clips.find(c => re.test(c.name)), cl = { idle: pick(/idle|stand|rest/i) || l3glb.clips[0], walk: pick(/walk/i), run: pick(/run|jog|sprint/i) };
  const act = {}; if (mixer) Object.entries(cl).forEach(([k, c]) => { if (c) { const a = act[k] = mixer.clipAction(c); a.play(); a.setEffectiveWeight(k === "idle" ? 1 : 0); } });
  let last = null;
  const update = st => {
    if (!mixer) return; const dt = last == null ? 0 : Math.max(0, Math.min(0.1, st.t - last)); last = st.t;
    const want = !st.moving ? "idle" : (act.run && (st.speed || 0) > 3.2 ? "run" : act.walk ? "walk" : "idle");
    Object.entries(act).forEach(([k, a]) => { const w = a.getEffectiveWeight(), t = k === want ? 1 : 0; a.setEffectiveWeight(w + (t - w) * Math.min(1, dt * 8)); if (k === "walk") a.timeScale = Math.max(0.6, (st.speed || 1.4) / 1.4); });
    mixer.update(dt);
  };
  return { g, update };
}
