/* Låsta fordon som IFC (Victor 2026-10-22: "exportera den som IFC till TC med exakta utseendet just nu").
   Fordonets alla delar i just den ställning de har nu (stödben, bomvinkel, utskjut, sväng …) skrivs som trianglar i modellens koordinater (meter), en yta per färg
   med fordonets egna färger, och läggs i en IfcBuildingElementProxy med måtten som egenskaper. Hjälplinjer (radieringar, etiketter) och loggorna (bilder) tas inte med. */

const L3V_NAMES = { human: "Byggare", crane: "Mobilkran", excavator: "Grävmaskin", truck: "Lastbil", loader: "Hjullastare", own: "Objekt" };
/* Alla trianglar i fordonets grupp, i världskoordinater (scenen) + modellens origo = projektets koordinater. Grupperade per material. */
function l3vIfcMeshes(root, O) {
  root.updateMatrixWorld(true);
  const groups = new Map(), v = new THREE.Vector3(), m = new THREE.Matrix4(), im = new THREE.Matrix4();
  const visible = o => { for (let p = o; p && p !== root.parent; p = p.parent) if (p.visible === false) return false; return true; };
  root.traverse(o => {
    if (!o.isMesh || o.userData.noIfc || o.userData.shadow || !visible(o) || !o.geometry) return; const mat = Array.isArray(o.material) ? o.material[0] : o.material; if (!mat || mat.map) return;
    const c = mat.color ? "#" + mat.color.getHexString() : "#999999", tr = mat.transparent && mat.opacity < 1 ? Math.round((1 - mat.opacity) * 100) / 100 : 0, key = c + "|" + tr;
    const geo = o.userData.ifcGeo || o.geometry, pos = geo.getAttribute("position"), idx = geo.index; if (!pos) return;
    const grp = groups.get(key) || groups.set(key, { hex: c, tr, pts: [], faces: [] }).get(key), n = o.isInstancedMesh ? o.count : 1;
    for (let k = 0; k < n; k++) {
      if (o.isInstancedMesh) { o.getMatrixAt(k, im); m.multiplyMatrices(o.matrixWorld, im); } else m.copy(o.matrixWorld);
      const base = grp.pts.length;
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m); grp.pts.push([v.x + O[0], v.y + O[1], v.z + O[2]]); }
      if (idx) for (let i = 0; i + 2 < idx.count; i += 3) grp.faces.push([base + idx.getX(i) + 1, base + idx.getX(i + 1) + 1, base + idx.getX(i + 2) + 1]);
      else for (let i = 0; i + 2 < pos.count; i += 3) grp.faces.push([base + i + 1, base + i + 2, base + i + 3]);
    }
  });
  return [...groups.values()].filter(g => g.faces.length);
}
function l3vIfcBuild(root, meta) {
  const O = (typeof l3 !== "undefined" && l3 && l3.O) || [0, 0, 0], parts = l3vIfcMeshes(root, O); if (!parts.length) return null;
  const doc = ifcDoc("4D-planering – " + meta.name, meta.desc || meta.name), E = doc.E, items = []; let tris = 0;
  parts.forEach((p, i) => {
    const pl = E(`IFCCARTESIANPOINTLIST3D((${p.pts.map(ifcPt).join(",")}))`), mesh = E(`IFCTRIANGULATEDFACESET(${pl},$,.F.,(${p.faces.map(f => `(${f.join(",")})`).join(",")}),$)`);
    E(`IFCSTYLEDITEM(${mesh},(${doc.style("v:" + p.hex + ":" + p.tr, p.hex, meta.name + " " + p.hex, p.tr)}),$)`); items.push(mesh); tris += p.faces.length;
  });
  const shape = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${E(`IFCSHAPEREPRESENTATION(${doc.body},'Body','Tessellation',(${items.join(",")}))`)}))`);
  const el = doc.proxy(meta.name, meta.desc || "", meta.type || "Fordon", doc.place([0, 0, 0]), shape, meta.tag || "");
  doc.props(el, meta.props || []);
  return { text: doc.finish([el], `${meta.name}.ifc`), tris, parts: parts.length };
}
/* Exporterar ett låst fordon: lokal kopia, och i Trimble Connect (mappen "Lägesplan export") om lägesplanen öppnats därifrån. */
async function l3vIfcExport(item, toTc = true) {
  const g = item.g, meta = { name: item.name, desc: `${item.name} – skapad i 3D-editorn ${new Date().toLocaleDateString("sv-SE")}`, type: item.title, tag: item.id, props: [["Typ", item.title], ...((item.info || []).map(([a, b]) => [a, b])), ["Rotation (grader)", Math.round(((g.rotation.z * 180 / Math.PI) % 360 + 360) % 360)], ["Skapad", new Date().toISOString().slice(0, 16).replace("T", " ")]] };
  const r = l3vIfcBuild(g, meta); if (!r) { l3Status("Fordonet har ingen geometri att exportera.", true); return null; }
  const name = `${item.name.replace(/[^\wåäöÅÄÖ.-]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.ifc`, bytes = new TextEncoder().encode(r.text);
  downloadBlob(new Blob([bytes], { type: "application/x-step" }), name);
  let msg = `🧊 ${item.name} exporterad som IFC (${r.tris.toLocaleString("sv-SE")} trianglar, ${(bytes.length / 1e6).toFixed(1).replace(".", ",")} MB).`;
  if (toTc && window.opener && !window.opener.closed && typeof askOpener === "function") {
    try { const res = await askOpener("tcUpload", { folder: typeof DXF_TC_FOLDER !== "undefined" ? DXF_TC_FOLDER : "Lägesplan export", files: [new File([bytes], name, { type: "application/x-step" })] }, 5 * 60 * 1000); msg += ` Sparad i Trimble Connect (${res.folder || "Lägesplan export"}).`; }
    catch (e) { msg += ` ⚠ Kunde inte spara i Trimble Connect: ${e.message}`; }
  } else if (toTc) msg += " Inte sparad i Trimble Connect – öppna lägesplanen via 🗺️ i 4D-planering för det.";
  l3Status(msg); if (typeof setSaveStatus === "function") setSaveStatus(msg);
  return { name, ...r, text: window.__vehKeep ? r.text : undefined };
}
