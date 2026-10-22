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
/* ---- Radie och måttinfo som egen IFC-del (Victor 2026-10-22: radien och infon ska följa med till Trimble Connect, utskrivet med bokstäver och siffror) ------------------
   Allt byggs som riktig geometri (inga bilder): färgade ringar och en mjuk fyllning på marken, strålen ut till lastpunkten, avståndsringar med sina mått ("5 M", "10 M" …),
   "RADIE 12,5 M" / "MAX 33,1 M" vid ringarna, en infotavla med alla värden bredvid kranen och (om den spelats in) kranens bana. Texten är IFC-skrivarens streckfont, liggande på
   marken och läsbar uppifrån med norr uppåt. Samma värden skrivs dessutom som egenskaper (Pset) på delen. */
function l3vGeoGroups() {
  const groups = new Map(); const grp = (hex, tr = 0) => { const k = hex + "|" + tr; return groups.get(k) || groups.set(k, { hex, tr, pts: [], faces: [] }).get(k); }; return { groups, grp };
}
function l3vIfcSeg(G, a, b, w, h) { // rak list (a→b) med rektangulärt tvärsnitt w×h, plan i xy-ledd; lite förlängd i ändarna så att böjar sluter tätt
  const d = new THREE.Vector3().subVectors(b, a); const L = d.length(); if (L < 1e-6) return; d.multiplyScalar(1 / L);
  const up = Math.abs(d.z) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1), n = new THREE.Vector3().crossVectors(up, d).normalize(), u = new THREE.Vector3().crossVectors(d, n).normalize(), e = w / 2;
  const a2 = a.clone().addScaledVector(d, -e), b2 = b.clone().addScaledVector(d, e), base = G.pts.length;
  [a2, b2].forEach(P => { [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => G.pts.push(P.clone().addScaledVector(n, sx * w / 2).addScaledVector(u, sy * h / 2).toArray())); });
  [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]].forEach(q => { G.faces.push([base + q[0] + 1, base + q[1] + 1, base + q[2] + 1], [base + q[0] + 1, base + q[2] + 1, base + q[3] + 1]); });
}
function l3vRing(G, c, r, wd, th, n = 120) { // platt ring (annulus) med tjocklek th, i planet z = c.z
  const base = G.pts.length, ri = Math.max(0.01, r - wd / 2), ro = r + wd / 2;
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a); [[ri, 0], [ro, 0], [ri, th], [ro, th]].forEach(([rr, z]) => G.pts.push([c.x + cs * rr, c.y + sn * rr, c.z + z])); }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n, q = k => base + k * 4 + 1, A = q(i), B = q(j); // [0]=in-bot [1]=out-bot [2]=in-top [3]=out-top
    G.faces.push([A + 2, A + 3, B + 3], [A + 2, B + 3, B + 2], [A, B + 1, A + 1], [A, B, B + 1], [A + 1, B + 1, B + 3], [A + 1, B + 3, A + 3], [A, A + 2, B + 2], [A, B + 2, B]); }
}
function l3vDisc(G, c, r, n = 96) { const base = G.pts.length; G.pts.push([c.x, c.y, c.z]); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; G.pts.push([c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, c.z]); } for (let i = 0; i < n; i++) { const j = (i + 1) % n; G.faces.push([base + 1, base + 2 + i, base + 2 + j], [base + 1, base + 2 + j, base + 2 + i]); } }
/* Text som streck (ifcTextStrokes: versaler/siffror, 4×6 enheter) liggande på marken. anchor = baslinjens vänster-/mittpunkt, size = texthöjd (m), align "l"|"c". Returnerar bredden. */
function l3vText(G, text, size, x, y, z, align) {
  const t = ifcTextStrokes(text), k = size / 6, w = t.width * k, x0 = align === "c" ? x - w / 2 : x, th = Math.max(0.03, size * 0.14);
  t.strokes.forEach(pl => { for (let i = 0; i + 1 < pl.length; i++) l3vIfcSeg(G, new THREE.Vector3(x0 + pl[i][0] * k, y + pl[i][1] * k, z), new THREE.Vector3(x0 + pl[i + 1][0] * k, y + pl[i + 1][1] * k, z), th, th * 0.7); if (pl.length === 1) l3vIfcSeg(G, new THREE.Vector3(x0 + pl[0][0] * k, y + pl[0][1] * k, z), new THREE.Vector3(x0 + pl[0][0] * k + 0.001, y + pl[0][1] * k, z), th, th * 0.7); });
  return w;
}
const l3vUp = s => String(s).toUpperCase();
function l3vRadiusParts(item, O) {
  const g = item.g, rad = g.userData && g.userData.rad; if (!rad) return null; g.updateMatrixWorld(true);
  const to = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld), cen = to(rad.ox, rad.oy, rad.oz), hdg = g.rotation.z, sl = rad.slew + hdg, z0 = cen.z, ZR = z0 + 0.04;
  const { groups, grp } = l3vGeoGroups(), f1 = v => (Math.round(v * 10) / 10).toString().replace(".", ","), c0 = new THREE.Vector3(cen.x, cen.y, ZR), outer = Math.min(rad.maxRing, Math.ceil(Math.max(rad.R, rad.Rmax || 0, rad.step) / rad.step) * rad.step);
  const hexTxt = "#0f2a55", hexRing = "#cbd5e1", hexCur = "#" + (rad.hex || 0xff8a1a).toString(16).padStart(6, "0"), hexMax = "#1fb6ff", hexBoard = "#f4f7fb", hexTitle = "#c2410c";
  // avståndsringar med mått
  for (let r = rad.step; r <= outer + 1e-6; r += rad.step) { l3vRing(grp(hexRing), c0, r, 0.1, 0.02, Math.max(48, Math.round(r * 5))); const a = 0.9 + hdg; l3vText(grp(hexTxt), `${r} M`, Math.max(0.7, rad.step * 0.16), cen.x + r * Math.cos(a) + 0.2, cen.y + r * Math.sin(a) - 0.3, ZR + 0.01, "l"); }
  if (rad.R > 0.3) {
    l3vDisc(grp(hexCur, 0.82), new THREE.Vector3(cen.x, cen.y, ZR - 0.01), rad.R); l3vRing(grp(hexCur), c0, rad.R, 0.3, 0.05, Math.max(72, Math.round(rad.R * 5)));
    const tip = new THREE.Vector3(cen.x + rad.R * Math.cos(sl), cen.y + rad.R * Math.sin(sl), ZR + 0.02); l3vIfcSeg(grp("#ffb040"), new THREE.Vector3(cen.x, cen.y, ZR + 0.02), tip, 0.25, 0.06); l3vRing(grp("#ffd08a"), tip, 0.4, 0.5, 0.06, 24);
    const lab = `${l3vUp(rad.name)} ${f1(rad.R)} M`, sz = Math.max(1.0, Math.min(2.4, rad.R * 0.09)), lx = cen.x + (rad.R + 1.2) * Math.cos(sl), ly = cen.y + (rad.R + 1.2) * Math.sin(sl);
    l3vText(grp("#ffffff"), lab, sz, lx + 0.06, ly - 0.06, ZR + 0.02, "c"); l3vText(grp("#0f172a"), lab, sz, lx, ly, ZR + 0.06, "c");
  }
  if (rad.Rmax > rad.R + 0.5) {
    l3vRing(grp(hexMax), c0, rad.Rmax, 0.25, 0.04, Math.max(96, Math.round(rad.Rmax * 4))); const a = sl + 0.5, lab = `${l3vUp(rad.mname || "MAX")} ${f1(rad.Rmax)} M`, sz = Math.max(1.0, Math.min(2.4, rad.Rmax * 0.07));
    l3vText(grp("#ffffff"), lab, sz, cen.x + (rad.Rmax + 1.4) * Math.cos(a) + 0.06, cen.y + (rad.Rmax + 1.4) * Math.sin(a) - 0.06, ZR + 0.02, "c"); l3vText(grp("#0b3b66"), lab, sz, cen.x + (rad.Rmax + 1.4) * Math.cos(a), cen.y + (rad.Rmax + 1.4) * Math.sin(a), ZR + 0.06, "c");
  }
  // infotavla: alla värden som i kranpanelen, på en ljus platta utanför yttersta ringen på motsatt sida
  const rows = (item.info || []).map(([a, b]) => `${a}: ${b}`), lines = [l3vUp(item.title || "Fordon") + (item.name ? " – " + item.name : ""), ...rows.map(l3vUp)], sz = 1.05, lh = sz * 1.75, ba = sl + Math.PI;
  let bw = 0; lines.forEach(l => { bw = Math.max(bw, ifcTextStrokes(l).width * sz / 6); }); const bh = lines.length * lh + sz, dist = outer + 3 + Math.abs(Math.cos(ba)) * (bw / 2 + sz) + Math.abs(Math.sin(ba)) * (bh / 2 + sz), bx = cen.x + dist * Math.cos(ba), by = cen.y + dist * Math.sin(ba), x0 = bx - bw / 2, ytop = by + bh / 2;
  { const G = grp(hexBoard); const base = G.pts.length, px0 = x0 - sz, px1 = x0 + bw + sz, py0 = ytop - bh - sz * 0.3, py1 = ytop + sz * 0.6, zt = ZR + 0.02; [[px0, py0, ZR], [px1, py0, ZR], [px1, py1, ZR], [px0, py1, ZR], [px0, py0, zt], [px1, py0, zt], [px1, py1, zt], [px0, py1, zt]].forEach(P => G.pts.push(P)); [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]].forEach(q => G.faces.push([base + q[0] + 1, base + q[1] + 1, base + q[2] + 1], [base + q[0] + 1, base + q[2] + 1, base + q[3] + 1])); }
  lines.forEach((l, i) => l3vText(grp(i === 0 ? hexTitle : hexTxt), l, i === 0 ? sz * 1.2 : sz, x0, ytop - (i + 1) * lh + lh * 0.3, ZR + 0.06, "l"));
  // inspelad bana
  if (typeof l3lift !== "undefined" && l3lift.tracePts && l3lift.tracePts.length > 1) { const G = grp("#ffd23f"); for (let i = 0; i + 1 < l3lift.tracePts.length; i++) l3vIfcSeg(G, l3lift.tracePts[i], l3lift.tracePts[i + 1], 0.12, 0.12); }
  const list = [...groups.values()].filter(G => G.faces.length); list.forEach(G => G.pts.forEach(P => { P[0] += O[0]; P[1] += O[1]; P[2] += O[2]; }));
  return { parts: list, lines };
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
  const els = [el];
  if (meta.radius && meta.radius.parts.length) { // radien och måttinfon som en egen del, så att den kan tändas/släckas för sig i Trimble Connect
    const items2 = []; meta.radius.parts.forEach(p => { const pl = E(`IFCCARTESIANPOINTLIST3D((${p.pts.map(ifcPt).join(",")}))`), mesh = E(`IFCTRIANGULATEDFACESET(${pl},$,.F.,(${p.faces.map(f => `(${f.join(",")})`).join(",")}),$)`); E(`IFCSTYLEDITEM(${mesh},(${doc.style("r:" + p.hex + ":" + p.tr, p.hex, meta.name + " radie " + p.hex, p.tr)}),$)`); items2.push(mesh); tris += p.faces.length; });
    const shape2 = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${E(`IFCSHAPEREPRESENTATION(${doc.body},'Body','Tessellation',(${items2.join(",")}))`)}))`);
    const el2 = doc.proxy(meta.name + " – radie och mått", "Radie, avståndsringar och mått för " + meta.name, "Radie och mått", doc.place([0, 0, 0]), shape2, (meta.tag || "") + "-radie"); doc.props(el2, meta.props || []); els.push(el2);
  }
  return { text: doc.finish(els, `${meta.name}.ifc`), tris, parts: parts.length, radie: !!(meta.radius && meta.radius.parts.length) };
}
/* Exporterar ett låst fordon: lokal kopia, och i Trimble Connect (mappen "Lägesplan export") om lägesplanen öppnats därifrån. */
async function l3vIfcExport(item, toTc = true) {
  const g = item.g, meta = { name: item.name, desc: `${item.name} – skapad i 3D-editorn ${new Date().toLocaleDateString("sv-SE")}`, type: item.title, tag: item.id, props: [["Typ", item.title], ...((item.info || []).map(([a, b]) => [a, b])), ["Rotation (grader)", Math.round(((g.rotation.z * 180 / Math.PI) % 360 + 360) % 360)], ["Skapad", new Date().toISOString().slice(0, 16).replace("T", " ")]] };
  { const O = (typeof l3 !== "undefined" && l3 && l3.O) || [0, 0, 0]; try { if (item.showRadius) meta.radius = l3vRadiusParts(item, O); } catch (e) { console.warn("radie till IFC:", e); } const rd = g.userData && g.userData.rad; if (meta.radius && rd) meta.props.push(["Radie (m)", Math.round(rd.R * 100) / 100], ["Radie och mått i modellen", "ja – egen del '" + item.name + " – radie och mått'"]); if (rd && rd.Rmax) meta.props.push(["Största radie (m)", Math.round(rd.Rmax * 100) / 100]); }
  const r = l3vIfcBuild(g, meta); if (!r) { l3Status("Fordonet har ingen geometri att exportera.", true); return null; }
  const name = `${item.name.replace(/[^\wåäöÅÄÖ.-]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.ifc`, bytes = new TextEncoder().encode(r.text);
  downloadBlob(new Blob([bytes], { type: "application/x-step" }), name);
  let msg = `🧊 ${item.name} exporterad som IFC${r.radie ? " med radie och mått" : ""} (${r.tris.toLocaleString("sv-SE")} trianglar, ${(bytes.length / 1e6).toFixed(1).replace(".", ",")} MB).`;
  if (toTc && window.opener && !window.opener.closed && typeof askOpener === "function") {
    try { const res = await askOpener("tcUpload", { folder: typeof DXF_TC_FOLDER !== "undefined" ? DXF_TC_FOLDER : "Lägesplan export", files: [new File([bytes], name, { type: "application/x-step" })] }, 5 * 60 * 1000); msg += ` Sparad i Trimble Connect (${res.folder || "Lägesplan export"}).`; }
    catch (e) { msg += ` ⚠ Kunde inte spara i Trimble Connect: ${e.message}`; }
  } else if (toTc) msg += " Inte sparad i Trimble Connect – öppna lägesplanen via 🗺️ i 4D-planering för det.";
  l3Status(msg); if (typeof setSaveStatus === "function") setSaveStatus(msg);
  return { name, ...r, text: window.__vehKeep ? r.text : undefined };
}
