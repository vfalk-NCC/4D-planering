/* Ritade objekt (Victor 2026-10-30: komplett rit- och modelleringsverktyg) – lagringen och kopplingen till resten av editorn.

   Det man ritar blir en vanlig etableringsplacering med typen "mod:yta", "mod:kropp" eller "mod:linje". Därför gäller allt som redan finns: markera,
   flytta, vrida (handtag, siffror, Kopiera special), ångra, sparning i plan_placements.json, mappar/lager, färg, genomskinlighet och textur, snitt,
   4D-koppling (aktivitet, start/slut) och export till IFC.
   – Ankarpunkten är objektets x, y, z (första punkten man tryckte) – geometrin ligger i p.m i lokala koordinater runt den (före vridning kring z).
   – p.m = { k: "face"|"solid"|"curve", pl, loops, d, pts, closed, ifc, rev }  (se lagesplan-3dmodgeo.js). rev ändras vid varje ändring (nätcachen).
   – IFC: ytor och kroppar som trianglar (IfcTriangulatedFaceSet) i vald IFC-klass (vägg, platta, pelare, balk … eller proxy), linjer som tunna rör.
     Befintliga IFC-objekts GUID och egenskaper rörs aldrig: ritning och Push/Pull på dem skapar nya objekt. DXF: LINE och 3DFACE (modDxfText). */

const MOD_IFC = [["IFCBUILDINGELEMENTPROXY", "Övrigt (proxy)"], ["IFCWALL", "Vägg"], ["IFCSLAB", "Platta"], ["IFCCOLUMN", "Pelare"], ["IFCBEAM", "Balk"], ["IFCFOOTING", "Fundament"], ["IFCMEMBER", "Stång"], ["IFCPLATE", "Skiva"], ["IFCCOVERING", "Beklädnad"], ["IFCRAILING", "Räcke"]];
const MOD_LABEL = { "mod:yta": "Yta", "mod:kropp": "Kropp", "mod:linje": "Linje" };
const modIsType = t => String(t || "").startsWith("mod:");
const modRev = () => Math.random().toString(36).slice(2, 8);
const modType = m => (m.k === "solid" || m.k === "mesh" ? "mod:kropp" : m.k === "face" ? "mod:yta" : "mod:linje");
function modLib(type) { return { group: "Modellering", label: MOD_LABEL[type] || "Ritat objekt", color: type === "mod:linje" ? "#334155" : "#a8b3c4", mod: true, hidden: true, L: 0, B: 0, H: 0, title: "Ritad geometri" }; }
const modIfcEntity = p => ((MOD_IFC.find(x => x[0] === (p.m && p.m.ifc)) || MOD_IFC[0])[0]);

/* Det lokala nätet (före placering) – cachat per objekt och rev. */
const modCache = new Map();
function modLocalMesh(p) {
  const m = p.m; if (!m) return null;
  const key = p.id + "|" + m.rev; let c = modCache.get(key); if (c) return c;
  try {
    if (m.k === "curve") c = MG.tube(m.pts || [], Number(m.w) || 0.03, !!m.closed);
    else if (m.k === "mesh") c = { pts: m.pts || [], faces: m.faces || [] };
    else if (m.k === "face") c = MG.faceMesh(m.pl, m.loops);
    else if (m.k === "solid") c = Math.abs(m.d) < 1e-4 ? MG.faceMesh(m.pl, m.loops) : MG.solidMesh(m.pl, m.loops, m.d);
  } catch (e) { console.warn("Ritat objekt", e); c = null; }
  if (modCache.size > 400) modCache.delete(modCache.keys().next().value);
  modCache.set(key, c || { pts: [], faces: [] });
  return modCache.get(key);
}
/* Delarna för placeParts: trianglar i världskoordinater. */
function modParts(p, z) {
  const c = modLocalMesh(p); if (!c || !c.pts.length) return [];
  const rot = (Number(p.rot) || 0) * Math.PI / 180, cr = Math.cos(rot), sr = Math.sin(rot), x0 = Number(p.x) || 0, y0 = Number(p.y) || 0;
  const pts = c.pts.map(q => [x0 + q[0] * cr - q[1] * sr, y0 + q[0] * sr + q[1] * cr, z + q[2]]);
  let ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity, z0 = Infinity, z1 = -Infinity;
  pts.forEach(q => { ax = Math.min(ax, q[0]); ay = Math.min(ay, q[1]); bx = Math.max(bx, q[0]); by = Math.max(by, q[1]); z0 = Math.min(z0, q[2]); z1 = Math.max(z1, q[2]); });
  return [{ tris: { pts, faces: c.faces }, poly: [[ax, ay], [bx, ay], [bx, by], [ax, by]], z0, z1: Math.max(z1, z0 + 0.001), role: "body", transp: 0, color: p.color || (p.m.k === "curve" ? "#334155" : "#a8b3c4") }];
}
/* Kanter och linjer i 3D-editorn (utöver nätet): ytans/kroppens konturer och kurvans linje. Lokala koordinater (gruppen ligger vid ankarpunkten). */
function modEditorExtras(p, grp) {
  const m = p.m; if (!m) return;
  const segs = [], add = (a, b) => segs.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  if (m.k === "curve") { const P = m.pts || []; for (let i = 1; i < P.length; i++) add(P[i - 1], P[i]); if (m.closed && P.length > 2) add(P[P.length - 1], P[0]); }
  else if (m.k === "mesh") modMeshEdges(m).forEach(([a, b]) => add(a, b));
  else {
    const n = MG.normal(m.pl), off = m.k === "solid" ? MG.mul(n, m.d) : null;
    m.loops.forEach(L => L.forEach((q, i) => { const r = L[(i + 1) % L.length], a = MG.to3(m.pl, q), b = MG.to3(m.pl, r); add(a, b); if (off) { add(MG.add(a, off), MG.add(b, off)); add(a, MG.add(a, off)); } }));
  }
  if (!segs.length) return;
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(segs, 3));
  const ln = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: m.k === "curve" ? (p.color || "#334155") : 0x1f2937 }));
  ln.userData.noHit = true; ln.userData.noVm = true; ln.raycast = () => {}; ln.renderOrder = 6; grp.add(ln);
  if (m.k === "face") grp.traverse(o => { if (o.isMesh && o.material) { o.material.polygonOffset = true; o.material.polygonOffsetFactor = -2; o.material.polygonOffsetUnits = -2; } }); // ytor på en annan yta ska inte flimra
}

/* Kanter på ett allmänt nät: öppna kanter och skarpa vinklar (över 25°). */
function modMeshEdges(m) {
  const P = m.pts || [], F = m.faces || [], E = new Map(), out = [];
  const nrm = f => { const a = P[f[0] - 1], b = P[f[1] - 1], c = P[f[2] - 1], n = MG.cross(MG.sub(b, a), MG.sub(c, a)), l = MG.len(n) || 1; return MG.mul(n, 1 / l); };
  F.forEach(f => { const n = nrm(f); for (let i = 0; i < 3; i++) { const a = f[i], b = f[(i + 1) % 3], k = a < b ? a + "_" + b : b + "_" + a, e = E.get(k); if (e) e.n2 = n; else E.set(k, { a, b, n1: n, n2: null }); } });
  E.forEach(e => { if (!e.n2 || MG.dot(e.n1, e.n2) < 0.906) out.push([P[e.a - 1], P[e.b - 1]]); });
  return out;
}
/* Volym (m³, med tecken – negativt = vänt nät) och yta (m²) för ett nät. */
function modMeshStats(pts, faces) {
  let v = 0, a = 0; faces.forEach(f => { const p = pts[f[0] - 1], q = pts[f[1] - 1], r = pts[f[2] - 1]; if (!p || !q || !r) return; v += MG.dot(p, MG.cross(q, r)) / 6; a += MG.len(MG.cross(MG.sub(q, p), MG.sub(r, p))) / 2; });
  return { volume: v, area: a };
}
/* ---- Skapa, ändra ---- */
/* Nytt objekt ur en modell m (lokala koordinater runt anchor, absoluta). */
function modCreate(m, anchor, opts = {}) {
  m.rev = modRev(); m.ifc = m.ifc || (m.k === "solid" ? "IFCBUILDINGELEMENTPROXY" : "IFCBUILDINGELEMENTPROXY");
  const type = modType(m), lib = modLib(type);
  const p = { id: ghNewId(), type, name: opts.name || placeNextName(lib.label), x: placeR3(anchor[0]), y: placeR3(anchor[1]), z: placeR3(anchor[2]), L: 0, B: 0, H: 0, R: 0, rot: 0, dz: 0, color: opts.color || lib.color, m, created_at: new Date().toISOString(), by: (typeof settings !== "undefined" && settings.userName) || null };
  if (opts.snapshot !== false) placeSnapshot();
  placements.push(p); placeTouch(p); if (typeof l3AddPlacementMesh === "function") l3AddPlacementMesh(p);
  return p;
}
/* Ändra modellen i ett steg (Ångra): fn(m) ändrar m på plats. */
function modEdit(p, fn, opts = {}) {
  if (!p || !p.m) return;
  if (opts.snapshot !== false) placeSnapshot();
  const was = p.type; fn(p.m); p.m.rev = modRev(); p.type = modType(p.m);
  if (was !== p.type && new RegExp("^" + (MOD_LABEL[was] || "Yta") + "( \\d+)?$|^(Cirkel|Polygon)( \\d+)?$").test(String(p.name || ""))) p.name = placeNextName(MOD_LABEL[p.type]); // automatiska namn följer typen
  placeTouch(p); l3RebuildOne(p); if (opts.changed !== false) l3Changed();
}
/* Mått på objektet (m, m², m³). */
function modDims(p) {
  const m = p.m; if (!m) return {};
  if (m.k === "mesh") { const st = modMeshStats(m.pts || [], m.faces || []); return { area: st.area, perimeter: 0, volume: Math.abs(st.volume), surface: st.area }; }
  if (m.k === "curve") { let s = 0; const P = m.pts || []; for (let i = 1; i < P.length; i++) s += MG.dist(P[i - 1], P[i]); if (m.closed && P.length > 2) s += MG.dist(P[P.length - 1], P[0]); return { length: s }; }
  const outer = Math.abs(MG.area2(m.loops[0])), holes = m.loops.slice(1).reduce((a, L) => a + Math.abs(MG.area2(L)), 0), area = outer - holes;
  const per = m.loops.reduce((a, L) => a + L.reduce((s, q, i) => { const r = L[(i + 1) % L.length]; return s + Math.hypot(r[0] - q[0], r[1] - q[1]); }, 0), 0);
  const out = { area, perimeter: per };
  if (m.k === "solid") { out.volume = area * Math.abs(m.d); out.height = m.d; out.surface = 2 * area + per * Math.abs(m.d); }
  return out;
}
/* Ytor i objektets lokala system för träff och Push/Pull: [{ id, pl, loop3 (lokala 3D-punkter), kind }]. */
function modFaces(p) {
  const m = p.m; if (!m || m.k === "curve" || m.k === "mesh") return [];
  const n = MG.normal(m.pl), out = [];
  if (m.k === "face") return [{ id: "face", pl: m.pl, loops: m.loops, kind: "face" }];
  const d = m.d, off = MG.mul(n, d), sgn = d >= 0 ? 1 : -1;
  // bottenytan (framsidan mot −n när d > 0), toppytan, och väggarna
  out.push({ id: "cap0", pl: { o: m.pl.o, u: m.pl.u, v: m.pl.v }, loops: m.loops, kind: "cap0", out: MG.mul(n, -sgn) });
  out.push({ id: "capd", pl: { o: MG.add(m.pl.o, off), u: m.pl.u, v: m.pl.v }, loops: m.loops, kind: "capd", out: MG.mul(n, sgn) });
  m.loops.forEach((L, li) => L.forEach((q, i) => {
    const r = L[(i + 1) % L.length], a = MG.to3(m.pl, q), b = MG.to3(m.pl, r), e = MG.norm(MG.sub(b, a)), wn = MG.norm(MG.cross(e, n));
    const outer = li === 0, ccw = MG.area2(L) > 0, nv = (outer === ccw) ? MG.mul(wn, 1) : MG.mul(wn, -1); // utåt
    const pl = { o: a, u: e, v: n };
    out.push({ id: `wall:${li}:${i}`, pl, loops: [[[0, 0], [MG.dist(a, b), 0], [MG.dist(a, b), d], [0, d]]], kind: "wall", out: MG.mul(nv, 1), poly3: [a, b, MG.add(b, off), MG.add(a, off)] });
  }));
  return out;
}
/* Träffar en stråle (lokala koordinater) mot ytorna: närmaste { face, t, p } eller null. */
function modPick(p, ro, rd) {
  let best = null;
  modFaces(p).forEach(f => {
    const pl = f.kind === "wall" ? { o: f.poly3[0], u: MG.norm(MG.sub(f.poly3[1], f.poly3[0])), v: MG.norm(MG.sub(f.poly3[3], f.poly3[0])) } : f.pl, h = MG.rayPlane(ro, rd, pl); if (!h) return;
    const q = MG.to2(pl, h.p), loops = f.kind === "wall" ? [[[0, 0], [MG.dist(f.poly3[0], f.poly3[1]), 0], [MG.dist(f.poly3[0], f.poly3[1]), MG.dist(f.poly3[0], f.poly3[3])], [0, MG.dist(f.poly3[0], f.poly3[3])]]] : f.loops;
    const inside = MG.pip(loops[0], q) && !loops.slice(1).some(L => MG.pip(L, q));
    if (inside && (!best || h.t < best.t)) best = { face: f, t: h.t, p: h.p, pl };
  });
  return best;
}

/* ---- Egenskapspanelen ---- */
function modSideHtml(p) {
  const m = p.m; if (!m) return "";
  const d = modDims(p), f1 = v => (Math.round(v * 1000) / 1000).toString().replace(".", ","), kind = m.k === "solid" ? "Kropp" : m.k === "mesh" ? "Nät" : m.k === "face" ? "Yta" : "Linje";
  const rows = m.k === "curve" ? `<div class="v3-sub">Längd ${f1(d.length)} m · ${(m.pts || []).length} punkter${m.closed ? " · sluten" : ""}</div>`
    : `<div class="v3-sub">Yta ${f1(d.area)} m² · omkrets ${f1(d.perimeter)} m${m.k === "solid" ? ` · volym ${f1(d.volume)} m³` : ""}</div>`;
  const dist = m.k === "curve" || m.k === "mesh" ? "" : `<div class="v3-grid"><label><span>${m.k === "solid" ? "Höjd (Push/Pull)" : "Dra ut till kropp"}</span><div class="v3-in"><input type="text" inputmode="decimal" data-modd value="${m.k === "solid" ? String(m.d).replace(".", ",") : ""}" placeholder="${m.k === "solid" ? "" : "t.ex. 1,2"}" /><em>m</em></div></label></div>`;
  const ifc = m.k === "curve" ? "" : `<label class="v3-field"><span>IFC-klass</span><select data-modifc>${MOD_IFC.map(([k, l]) => `<option value="${k}" ${k === (m.ifc || MOD_IFC[0][0]) ? "selected" : ""}>${l}</option>`).join("")}</select></label>`;
  return `<div class="v3-sec">${kind} (ritad)</div>${rows}${dist}${ifc}<div class="v3-btns"><button type="button" data-modact="pp" title="Dra ut ytan eller ändra höjden med musen (P)">Push/Pull</button><button type="button" data-modact="off" title="Parallell kontur med valt avstånd (F)">Offset</button><button type="button" data-modact="dxf" title="Exportera markerade ritade objekt som DXF">DXF</button></div>`;
}
function modSideBind(side, p) {
  if (!p.m) return;
  const inp = side.querySelector("[data-modd]");
  if (inp) inp.onchange = () => {
    const v = Number(String(inp.value).replace(/\s/g, "").replace(",", ".")); if (!Number.isFinite(v) || Math.abs(v) < 1e-4) return;
    modEdit(p, m => { m.k = "solid"; m.d = MG.r3(v); }); l3RenderSide();
  };
  const sel = side.querySelector("[data-modifc]"); if (sel) sel.onchange = () => { modEdit(p, m => { m.ifc = sel.value; }); };
  side.querySelectorAll("[data-modact]").forEach(b => { b.onclick = () => { const a = b.dataset.modact; if (a === "dxf") modExportDxf([p.id]); else if (typeof l3dwStartModel === "function") l3dwStartModel(a === "pp" ? "pushpull" : "offset"); }; });
}
function modProps(p) {
  const m = p.m, d = modDims(p), r = v => placeR3(v || 0), out = [["Typ", MOD_LABEL[p.type] || "Ritat objekt"], ["Namn", p.name || ""], ["Vridning grader", Number(p.rot) || 0]];
  if (m.k === "mesh") { out.push(["Yta m²", r(d.area)], ["Volym m³", r(d.volume)]); out.push(["IFC-klass", (MOD_IFC.find(x => x[0] === m.ifc) || MOD_IFC[0])[1]]); return out; }
  if (m.k === "curve") out.push(["Längd m", r(d.length)]); else { out.push(["Yta m²", r(d.area)], ["Omkrets m", r(d.perimeter)]); if (m.k === "solid") out.push(["Höjd m", r(Math.abs(m.d))], ["Volym m³", r(d.volume)]); }
  out.push(["IFC-klass", (MOD_IFC.find(x => x[0] === m.ifc) || MOD_IFC[0])[1]]);
  return out;
}

/* ---- DXF: LINE för kurvor och konturer, 3DFACE för ytor och kroppar ---- */
function modDxfText(list) {
  const out = ["0", "SECTION", "2", "ENTITIES"], num = v => (Math.round(v * 1000) / 1000).toFixed(3);
  const lineE = (a, b, layer) => out.push("0", "LINE", "8", layer, "10", num(a[0]), "20", num(a[1]), "30", num(a[2]), "11", num(b[0]), "21", num(b[1]), "31", num(b[2]));
  const faceE = (a, b, c, layer) => out.push("0", "3DFACE", "8", layer, "10", num(a[0]), "20", num(a[1]), "30", num(a[2]), "11", num(b[0]), "21", num(b[1]), "31", num(b[2]), "12", num(c[0]), "22", num(c[1]), "32", num(c[2]), "13", num(c[0]), "23", num(c[1]), "33", num(c[2]));
  list.forEach(p => {
    const m = p.m; if (!m) return; const z = (Number(p.z) || 0) + (Number(p.dz) || 0), rot = (Number(p.rot) || 0) * Math.PI / 180, cr = Math.cos(rot), sr = Math.sin(rot);
    const W = q => [p.x + q[0] * cr - q[1] * sr, p.y + q[0] * sr + q[1] * cr, z + q[2]], layer = (p.name || "Ritat").replace(/[^\w\-åäöÅÄÖ ]/g, "_").slice(0, 30) || "Ritat";
    if (m.k === "curve") { const P = (m.pts || []).map(W); for (let i = 1; i < P.length; i++) lineE(P[i - 1], P[i], layer); if (m.closed && P.length > 2) lineE(P[P.length - 1], P[0], layer); return; }
    const c = modLocalMesh(p); if (!c) return; const P = c.pts.map(W); c.faces.forEach(f => faceE(P[f[0] - 1], P[f[1] - 1], P[f[2] - 1], layer));
  });
  out.push("0", "ENDSEC", "0", "EOF");
  return out.join("\n");
}
function modExportDxf(ids) {
  const list = placements.filter(p => p.m && (!ids || ids.includes(p.id)));
  if (!list.length) { l3Status("Inga ritade objekt att exportera.", true); return; }
  const text = modDxfText(list), d = new Date(), p2 = x => String(x).padStart(2, "0"), name = `Ritat ${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} kl ${p2(d.getHours())}.${p2(d.getMinutes())}.dxf`;
  const url = URL.createObjectURL(new Blob([text], { type: "application/dxf" })), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  l3Toast(`${list.length} ritade objekt exporterade som DXF (${name}).`);
}
