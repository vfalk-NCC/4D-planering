/* Dra och släpp filer i 3D-editorn (Victor 2026-11-04: "drag and droppa mina filer i lager … alla sorters filer som mitt program har stöd för").
   Släpp en eller flera filer (blandade typer går bra) på Lager-panelen eller var som helst i 3D-fönstret, så sorteras de efter filtyp:
     IFC / IFCZIP                       → 3D-modeller (som "IFC från datorn")
     LAS, LAZ, PLY, XYZ, PTS (och stora CSV/TXT) → punktmoln
     DXF, DWG, GeoJSON, KML, GPX, SHP (+ DBF/PRJ), ZIP, SVG, LandXML, små CSV/TXT/XYZ → CAD-/vektorlager på marken
     PDF                                → PDF-underlag på marken
     PNG/JPG + världsfil (.pgw/.jgw/.wld) → ortofoto
     FBX, OBJ, GLB/glTF               → mesh-modell med modellträd (t.ex. FBX exporterad ur Navisworks) – kan exporteras vidare som IFC
   Det som inte stöds listas i stället för att tyst försvinna. */
const l3dr = { depth: 0, ov: null };
const L3DR_IFC = /\.(ifc|ifczip)$/i, L3DR_PC = /\.(las|laz|ply|e57|xyz|pts)$/i, L3DR_TXT = /\.(csv|txt)$/i, L3DR_PDF = /\.pdf$/i, L3DR_IMG = /\.(png|jpe?g)$/i, L3DR_WLD = /\.(pgw|jgw|pngw|jpgw|wld)$/i, L3DR_CAD = /\.(dxf|dwg)$/i, L3DR_COMP = /\.(dbf|prj|shx|cpg|qix|sbn|sbx)$/i;
const l3drHasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes("Files");
function l3drClassify(files) {
  const out = { ifc: [], pc: [], cad: [], pdf: [], img: [], wld: [], mesh: [], bad: [] };
  files.forEach(f => {
    const n = f.name;
    if (L3DR_IFC.test(n)) out.ifc.push(f);
    else if (/\.(fbx|obj|glb|gltf)$/i.test(n)) out.mesh.push(f);
    else if (L3DR_PC.test(n) || (L3DR_TXT.test(n) && f.size > 25e6)) out.pc.push(f);
    else if (L3DR_CAD.test(n) || L3DR_COMP.test(n) || (typeof cadvIsVector === "function" && cadvIsVector(n)) || L3DR_TXT.test(n)) out.cad.push(f);
    else if (L3DR_PDF.test(n) || f.type === "application/pdf") out.pdf.push(f);
    else if (L3DR_IMG.test(n)) out.img.push(f);
    else if (L3DR_WLD.test(n)) out.wld.push(f);
    else out.bad.push(f);
  });
  return out;
}
function l3drOverlay(on) {
  const host = document.getElementById("view3d"); if (!host) return;
  if (!on) { if (l3dr.ov) l3dr.ov.classList.add("hidden"); return; }
  if (!l3dr.ov) {
    const st = document.createElement("style"); st.textContent = `#v3DropOv{position:absolute;inset:8px;z-index:90;border:3px dashed #3b82f6;border-radius:18px;background:rgba(219,234,254,.82);backdrop-filter:blur(3px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;pointer-events:none;color:#1e3a8a;text-align:center;font:600 18px system-ui,sans-serif;animation:v3dropin .15s ease-out}#v3DropOv.hidden{display:none}#v3DropOv b{font-size:26px}#v3DropOv small{font-weight:500;font-size:13px;color:#334155;max-width:520px;line-height:1.5}#v3DropOv i{font-style:normal;font-size:44px}@keyframes v3dropin{from{opacity:0;transform:scale(.98)}to{opacity:1;transform:none}}`;
    document.head.appendChild(st);
    const d = document.createElement("div"); d.id = "v3DropOv"; d.innerHTML = `<i>⤓</i><b>Släpp filerna här</b><small>IFC · LAS/LAZ/PLY · DXF/DWG · GeoJSON/KML/GPX/SHP/SVG/LandXML · PDF · PNG/JPG med världsfil · FBX/OBJ/GLB – blandat går bra</small>`; host.appendChild(d); l3dr.ov = d;
  }
  l3dr.ov.classList.remove("hidden");
}
async function l3drHandle(files) {
  if (!files.length) return; const C = l3drClassify(files), notes = [];
  l3Status(`Läser in ${files.length} fil${files.length > 1 ? "er" : ""}…`);
  try {
    if (C.ifc.length && typeof lokalFilAdd === "function" && typeof l3bLoad === "function") {
      const list = []; for (const f of C.ifc) { const r = await lokalFilAdd(f); list.push({ id: "f:" + r.id, fileId: r.id, name: r.name, on: true, parentId: null, version: String(f.size) + "-" + f.lastModified }); }
      while (l3b.busy) await new Promise(r => setTimeout(r, 300));
      await l3bLoad(list); if (typeof standaloneOrigo === "function") standaloneOrigo(); notes.push(`${C.ifc.length} IFC`);
    }
    for (const f of C.pc) {
      if (/\.e57$/i.test(f.name)) { notes.push(`${f.name}: E57 stöds inte – exportera som LAZ/LAS`); continue; }
      if (typeof l3pcLoad !== "function") continue;
      const src = { id: `pc:l:${f.name}:${f.size}:${f.lastModified}`, name: f.name, version: `${f.size}-${f.lastModified}`, local: true, fileObj: f };
      await l3pcLoad(src, async onP => { onP(1); return f; }); notes.push(f.name);
    }
    for (const f of C.mesh) { if (typeof l3msLoadFile === "function") { const m = await l3msLoadFile(f); if (m) notes.push(f.name); } }
    if (C.cad.length && typeof addDxfFiles === "function") { await addDxfFiles(C.cad); if (typeof l3sRefresh === "function") l3sRefresh(0); notes.push(`${C.cad.filter(f => !L3DR_COMP.test(f.name)).length} CAD/vektor`); }
    if (C.pdf.length && typeof addPdfUnderlays === "function") { await addPdfUnderlays(C.pdf); notes.push(`${C.pdf.length} PDF`); }
    if (C.img.length || C.wld.length) {
      if (C.img.length && C.wld.length && typeof addOrthoFiles === "function") { await addOrthoFiles([...C.img, ...C.wld]); notes.push("ortofoto"); }
      else notes.push("Bild och världsfil (.pgw/.jgw/.wld) måste släppas tillsammans – ortofotot placeras via världsfilen");
    }
    if (C.bad.length) notes.push(`stöds inte: ${C.bad.map(f => f.name).slice(0, 4).join(", ")}${C.bad.length > 4 ? " …" : ""}`);
  } catch (e) { console.warn("Släpp av filer", e); l3Status("Kunde inte läsa in alla filer: " + (e.message || e), true); }
  if (typeof l3LayersRender === "function") l3LayersRender();
  const ok = !C.bad.length; l3Toast(`Inläst: ${notes.join(" · ") || "inget"}`); if (!ok) l3Status(`Några filer stöds inte: ${C.bad.map(f => f.name).join(", ")}`, true);
}
(function () {
  // #view3d skapas först när 3D-vyn öppnas – lyssna på dokumentet och släpp bara igenom när trycket ligger i 3D-fönstret.
  const inView = e => { const h = document.getElementById("view3d"); return !!(h && !h.classList.contains("hidden") && e.target && h.contains(e.target)); };
  const stop = e => { e.preventDefault(); e.stopPropagation(); };
  document.addEventListener("dragenter", e => { if (!l3drHasFiles(e) || !inView(e)) return; stop(e); l3dr.depth++; l3drOverlay(true); }, true);
  document.addEventListener("dragover", e => { if (!l3drHasFiles(e) || !inView(e)) return; stop(e); e.dataTransfer.dropEffect = "copy"; }, true);
  document.addEventListener("dragleave", e => { if (!l3drHasFiles(e) || !inView(e)) return; l3dr.depth = Math.max(0, l3dr.depth - 1); if (!l3dr.depth) l3drOverlay(false); }, true);
  document.addEventListener("drop", e => { if (!l3drHasFiles(e) || !inView(e)) return; stop(e); l3dr.depth = 0; l3drOverlay(false); l3drHandle([...e.dataTransfer.files]); }, true);
  window.addEventListener("dragend", () => { l3dr.depth = 0; l3drOverlay(false); });
})();
