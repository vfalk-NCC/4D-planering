/* 3D-vyn – flytta objekt i inlästa IFC-modeller och spara som en ny IFC i Trimble Connect (Victor
   2026-10-10: "IFC:erna vill jag också kunna markera delarna och flytta runt och skicka tillbaka till TC").

   Flytta: de markerade objekten lyfts ut i en egen grupp med handtag (flytta X/Y/Z, vrid kring Z) och
   fält för dX/dY/dZ/vridning. Klar = flytten läggs in i modellen (kan flyttas igen), Avbryt = tillbaka.
   Spara: originalfilen hämtas från TC och varje flyttat objekts placering skrivs om:
   – används placeringen bara av objektet (och av delar som ärver den, t.ex. öppningar och trappsteg)
     ändras den på plats, så att allt som hör till objektet följer med;
   – delas den av andra objekt får objektet en egen, ny placering.
   Resultatet blir en NY fil i samma mapp ("… flyttad <tid>.ifc") – originalet skrivs aldrig över. */

const l3bm = { session: null, edits: new Map() }; // edits: modell-id -> { model, moves: Map(guid -> Matrix4 i SWEREF-meter) }

// ---------------------------------------------------------------------
// Flytta i 3D
// ---------------------------------------------------------------------
function l3bmStart() {
  if (l3bm.session) l3bmCancel();
  const ents = (typeof l3bs !== "undefined" ? l3bs.sel : []).map(e => ({ mesh: e.mesh, ri: e.ri }));
  if (!ents.length) { l3Status("Markera först objekt i byggnaden (tryck på dem)."); return; }
  if (ents.some(e => !e.mesh.userData.l3b.ranges[e.ri].guid)) { l3Status("Något av objekten saknar IFC-id och kan inte flyttas.", true); return; }
  l3bsSet([]);
  // Gruppen: kopior av objektens trianglar runt deras gemensamma mitt; originalen döljs under tiden.
  const G = new THREE.Group(); G.userData.bmove = true;
  const box = new THREE.Box3(), v = new THREE.Vector3();
  ents.forEach(e => { const p = e.mesh.geometry.getAttribute("position").array, r = e.mesh.userData.l3b.ranges[e.ri]; e.mesh.updateMatrixWorld(true); for (let i = r.start; i < r.start + r.count; i++) box.expandByPoint(v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]).applyMatrix4(e.mesh.matrixWorld)); });
  const c = box.getCenter(new THREE.Vector3()); c.z = box.min.z; // vridpunkt: mitten i plan, underkant
  G.position.copy(c);
  const hideBy = new Map();
  ents.forEach(e => {
    const u = e.mesh.userData.l3b, r = u.ranges[e.ri], [s, n] = l3bsIdx(e.mesh, e.ri);
    const P = e.mesh.geometry.getAttribute("position").array, C = e.mesh.geometry.getAttribute("color").array;
    const pos = new Float32Array(r.count * 3), col = new Float32Array(r.count * 3), off = e.mesh.position.clone().sub(c);
    for (let i = 0; i < r.count; i++) { const k = (r.start + i) * 3; pos[i * 3] = P[k] + off.x; pos[i * 3 + 1] = P[k + 1] + off.y; pos[i * 3 + 2] = P[k + 2] + off.z; col[i * 3] = C[k]; col[i * 3 + 1] = C[k + 1]; col[i * 3 + 2] = C[k + 2]; }
    const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = u.origIdx[s + i] - r.start;
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: new THREE.Color(0x2b1d8f) }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({ color: 0x6d5efc, transparent: true, opacity: .95, depthTest: false }));
    edges.renderOrder = 6; [m, edges].forEach(o => { o.userData.noHit = true; o.raycast = () => {}; G.add(o); });
    if (!hideBy.has(e.mesh)) hideBy.set(e.mesh, []);
    hideBy.get(e.mesh).push(e.ri);
  });
  hideBy.forEach((ris, mesh) => { ris.forEach(ri => mesh.userData.l3b.hidden.add(ri)); l3bApplyHidden(mesh); });
  l3.groups.bldg.add(G);
  G.updateMatrix();
  l3bm.session = { ents, G, start: G.matrix.clone(), c: c.clone(), hideBy };
  l3.gizmo.attach(G); l3.gizmo.setMode("translate"); l3.gizmo.showX = l3.gizmo.showY = l3.gizmo.showZ = true;
  l3bmRenderSide();
  l3Status(`Flytta ${ents.length} objekt: dra i handtagen eller skriv in hur långt. Klar lägger in flytten, Avbryt återställer.`);
  l3Render();
}
/* Flytten just nu (i scenen, meter) som matris: grupp nu · grupp vid start⁻¹. */
function l3bmDelta() { const s = l3bm.session; s.G.updateMatrix(); return s.G.matrix.clone().multiply(s.start.clone().invert()); }
function l3bmEnd() {
  const s = l3bm.session; if (!s) return;
  if (l3.gizmo.object === s.G) l3.gizmo.detach();
  s.G.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  l3.groups.bldg.remove(s.G);
  s.hideBy.forEach((ris, mesh) => { ris.forEach(ri => mesh.userData.l3b.hidden.delete(ri)); l3bApplyHidden(mesh); });
  l3bm.session = null;
}
function l3bmCancel() { l3bmEnd(); l3Status("Flytten avbröts."); if (typeof l3RenderSide === "function") l3RenderSide(); l3Render(); }
/* Klar: punkterna i bitarna flyttas på riktigt och flytten sparas per modell (för Spara som ny IFC). */
function l3bmAccept() {
  const s = l3bm.session; if (!s) return;
  const D = l3bmDelta();
  const moved = !D.equals(new THREE.Matrix4());
  const ents = s.ents;
  l3bmEnd();
  if (!moved) { l3Status("Inget flyttades."); l3RenderSide(); return; }
  const O = new THREE.Matrix4().makeTranslation(l3.O[0], l3.O[1], l3.O[2]), Oi = O.clone().invert();
  const Dg = O.clone().multiply(D).multiply(Oi); // i SWEREF-meter
  const touched = new Set();
  ents.forEach(e => {
    const u = e.mesh.userData.l3b, r = u.ranges[e.ri], pos = e.mesh.geometry.getAttribute("position");
    e.mesh.updateMatrixWorld(true);
    const M = e.mesh.matrixWorld, Mi = M.clone().invert(), L = Mi.clone().multiply(D).multiply(M), v = new THREE.Vector3();
    for (let i = r.start; i < r.start + r.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(L); pos.setXYZ(i, v.x, v.y, v.z); }
    touched.add(e.mesh);
    const model = u.model, key = model.id;
    if (!l3bm.edits.has(key)) l3bm.edits.set(key, { model, moves: new Map() });
    const ed = l3bm.edits.get(key), prev = ed.moves.get(r.guid) || new THREE.Matrix4();
    ed.moves.set(r.guid, Dg.clone().multiply(prev));
  });
  touched.forEach(m => { m.geometry.getAttribute("position").needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingSphere(); m.geometry.computeBoundingBox(); m.userData.l3b.centers = null; if (typeof l3BvhSchedule === "function") l3BvhSchedule(m); });
  l3bsSet(ents);
  const n = [...l3bm.edits.values()].reduce((a, x) => a + x.moves.size, 0);
  l3Toast(`${ents.length} objekt flyttade. ${n} ändrade objekt väntar på att sparas som ny IFC i Trimble Connect.`);
  if (typeof l3LayersRender === "function") l3LayersRender();
  l3Render();
}
function l3bmApplyFields(side) {
  const s = l3bm.session; if (!s) return;
  const num = k => { const el = side.querySelector(`[data-bm="${k}"]`); return el ? (Number(String(el.value).replace(",", ".")) || 0) : 0; };
  s.G.position.set(s.c.x + num("dx"), s.c.y + num("dy"), s.c.z + num("dz"));
  s.G.rotation.set(0, 0, num("rot") * Math.PI / 180);
  l3Render();
}
function l3bmRenderSide() {
  const side = document.getElementById("v3Side"), s = l3bm.session;
  if (!side || !s) return;
  side.classList.remove("hidden");
  side.dataset.id = "bmove";
  const d = s.G.position.clone().sub(s.c), rot = Math.round(s.G.rotation.z * 180 / Math.PI * 10) / 10;
  const f = (k, label, val, unit) => `<label><span>${label}</span><div class="v3-in"><input type="text" inputmode="decimal" data-bm="${k}" value="${String(Math.round(val * 1000) / 1000).replace(".", ",")}" /><em>${unit}</em></div></label>`;
  side.innerHTML = `<div class="v3-side-h"><i class="v3-chip" style="background:#6d5efc"></i><b>Flytta ${s.ents.length} objekt</b><button type="button" class="v3-x" id="v3BmX" title="Avbryt (Esc)">✕</button></div>
    <div class="v3-sub">Dra i handtagen eller skriv in hur långt (meter). Vridningen sker kring markeringens mitt.</div>
    <div class="v3-grid">${f("dx", "dX", d.x, "m")}${f("dy", "dY", d.y, "m")}${f("dz", "dZ", d.z, "m")}${f("rot", "Vrid", rot, "°")}</div>
    <div class="v3-handles"><span>Handtag</span><button type="button" data-bmmode="translate" class="${l3.gizmo.mode === "translate" ? "on" : ""}">Flytta</button><button type="button" data-bmmode="rotate" class="${l3.gizmo.mode === "rotate" ? "on" : ""}">Vrid</button></div>
    <div class="v3-btns"><button type="button" id="v3BmOk" class="v3-primary">Klar</button><button type="button" id="v3BmCancel">Avbryt</button></div>`;
  side.querySelectorAll("[data-bm]").forEach(inp => { inp.onchange = () => l3bmApplyFields(side); inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); l3bmApplyFields(side); } }; });
  side.querySelectorAll("[data-bmmode]").forEach(b => { b.onclick = () => { const rot = b.dataset.bmmode === "rotate"; l3.gizmo.setMode(b.dataset.bmmode); l3.gizmo.showX = l3.gizmo.showY = !rot; l3.gizmo.showZ = true; l3bmRenderSide(); l3Render(); }; });
  side.querySelector("#v3BmOk").onclick = l3bmAccept;
  side.querySelector("#v3BmCancel").onclick = l3bmCancel;
  side.querySelector("#v3BmX").onclick = l3bmCancel;
}
/* Fälten följer handtagen. */
function l3bmGizmoChange() {
  const s = l3bm.session, side = document.getElementById("v3Side");
  if (!s || !side || side.dataset.id !== "bmove" || l3.gizmo.object !== s.G) return;
  const d = s.G.position.clone().sub(s.c), set = (k, v) => { const el = side.querySelector(`[data-bm="${k}"]`); if (el && document.activeElement !== el) el.value = String(Math.round(v * 1000) / 1000).replace(".", ","); };
  set("dx", d.x); set("dy", d.y); set("dz", d.z); set("rot", Math.round(s.G.rotation.z * 180 / Math.PI * 10) / 10);
}

// ---------------------------------------------------------------------
// Spara som ny IFC i Trimble Connect
// ---------------------------------------------------------------------
/* STEP-text: radindex (#id -> start/slut), största id och vilka rader som refererar till givna id:n. */
function l3bmIndex(text) {
  const starts = new Map(), N = text.length;
  let maxId = 0;
  for (let i = 0; i < N; ) {
    const nl = text.indexOf("\n", i), next = nl < 0 ? N : nl + 1;
    if (text.charCodeAt(i) === 35) { // "#"
      let j = i + 1, id = 0, c;
      while ((c = text.charCodeAt(j)) >= 48 && c <= 57) { id = id * 10 + c - 48; j++; }
      if (id) { starts.set(id, i); if (id > maxId) maxId = id; }
    }
    i = next;
  }
  // En rad kan sträcka sig över flera textrader (fortsätter till ";").
  const line = id => { const s = starts.get(id); if (s == null) return null; const e = text.indexOf(";", s); return text.slice(s, e + 1); };
  return { starts, maxId, line };
}
/* Argumentlistan för en STEP-rad på toppnivå: "#5=IFCX(a,(b,c),$)" -> ["a","(b,c)","$"]. */
function l3bmArgs(ln) {
  const a = ln.indexOf("("), b = ln.lastIndexOf(")"), body = ln.slice(a + 1, b), out = [];
  let depth = 0, q = false, cur = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (q) { cur += ch; if (ch === "'") { if (body[i + 1] === "'") { cur += "'"; i++; } else q = false; } continue; }
    if (ch === "'") { q = true; cur += ch; continue; }
    if (ch === "(") depth++; else if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}
const l3bmRef = s => { const m = /^#(\d+)$/.exec(String(s).trim()); return m ? Number(m[1]) : null; };
const l3bmNums = s => String(s).replace(/[()]/g, "").split(",").map(Number);
/* Placeringens matris i filens enheter (IfcLocalPlacement-kedjan). */
function l3bmWorld(ix, plId, depth = 0) {
  if (plId == null || depth > 50) return new THREE.Matrix4();
  const ln = ix.line(plId);
  if (!ln || !/IFCLOCALPLACEMENT/i.test(ln)) return new THREE.Matrix4();
  const [rel, ax] = l3bmArgs(ln);
  return l3bmWorld(ix, l3bmRef(rel), depth + 1).multiply(l3bmAxis(ix, l3bmRef(ax)));
}
function l3bmAxis(ix, id) {
  const ln = id != null && ix.line(id), M = new THREE.Matrix4();
  if (!ln) return M;
  const a = l3bmArgs(ln), pt = ix.line(l3bmRef(a[0]));
  const p = pt ? l3bmNums(l3bmArgs(pt)[0]) : [0, 0, 0];
  if (/IFCAXIS2PLACEMENT2D/i.test(ln)) {
    const r = a[1] && a[1] !== "$" ? l3bmNums(l3bmArgs(ix.line(l3bmRef(a[1])))[0]) : [1, 0];
    const X = new THREE.Vector3(r[0], r[1], 0).normalize(), Z = new THREE.Vector3(0, 0, 1), Y = Z.clone().cross(X);
    return M.makeBasis(X, Y, Z).setPosition(p[0], p[1], 0);
  }
  const z = a[1] && a[1] !== "$" ? l3bmNums(l3bmArgs(ix.line(l3bmRef(a[1])))[0]) : [0, 0, 1];
  const x0 = a[2] && a[2] !== "$" ? l3bmNums(l3bmArgs(ix.line(l3bmRef(a[2])))[0]) : (Math.abs(z[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1]);
  const Z = new THREE.Vector3(z[0], z[1], z[2]).normalize();
  const X = new THREE.Vector3(x0[0], x0[1], x0[2]).sub(Z.clone().multiplyScalar(new THREE.Vector3(x0[0], x0[1], x0[2]).dot(Z))).normalize();
  const Y = Z.clone().cross(X);
  return M.makeBasis(X, Y, Z).setPosition(p[0] || 0, p[1] || 0, p[2] || 0);
}
/* Längdenhet: filens enhet per meter (mm-fil = 1000). */
function l3bmUnit(text) {
  const m = /IFCSIUNIT\s*\(\s*\*\s*,\s*\.LENGTHUNIT\.\s*,\s*(\.[A-Z]+\.|\$)\s*,\s*\.METRE\.\s*\)/i.exec(text);
  const pre = m ? m[1].replace(/\./g, "").toUpperCase() : "";
  return { MILLI: 1000, CENTI: 100, DECI: 10, KILO: 0.001 }[pre] || 1;
}
const l3bmF = v => { const s = (Math.abs(v) < 1e-12 ? 0 : Math.round(v * 1e9) / 1e9).toString(); return /[.eE]/.test(s) ? s.replace(/e/, "E") : s + "."; };
/* Matris -> nya rader: punkt, riktningar och en IfcAxis2Placement3D. Returnerar id för placeringen. */
function l3bmWriteAxis(M, add) {
  const e = M.elements, P = [e[12], e[13], e[14]], Z = [e[8], e[9], e[10]], X = [e[0], e[1], e[2]];
  const p = add(`IFCCARTESIANPOINT((${P.map(l3bmF).join(",")}))`), z = add(`IFCDIRECTION((${Z.map(l3bmF).join(",")}))`), x = add(`IFCDIRECTION((${X.map(l3bmF).join(",")}))`);
  return add(`IFCAXIS2PLACEMENT3D(#${p},#${z},#${x})`);
}
/* Skriver in flyttarna i IFC-texten. moves: Map(guid -> Matrix4 i modellens IFC-koordinater, meter). */
function l3bmApplyToIfc(text, moves) {
  const ix = l3bmIndex(text), unit = l3bmUnit(text);
  const S = new THREE.Matrix4().makeScale(unit, unit, unit), Si = S.clone().invert();
  let next = ix.maxId + 1;
  const added = [], replace = new Map(); // id -> ny radtext
  const add = body => { const id = next++; added.push(`#${id}=${body};`); return id; };
  // Varje objekts rad (GUID först) och dess placering.
  const want = new Map(), found = new Map();
  moves.forEach((M, guid) => want.set(guid, M));
  const re = /^#(\d+)\s*=\s*(IFC[A-Z0-9_]+)\s*\(\s*'([^']{22})'/i;
  ix.starts.forEach((s, id) => { const head = text.slice(s, s + 120), m = re.exec(head); if (m && want.has(m[3])) found.set(m[3], id); });
  // Hur många objekt använder varje placering som sin egen (ObjectPlacement)?
  const plUse = new Map(), elPl = new Map();
  found.forEach((id, guid) => { const a = l3bmArgs(ix.line(id)), pl = l3bmRef(a[5]); elPl.set(guid, pl); });
  const plIds = new Set([...elPl.values()].filter(x => x != null));
  if (plIds.size) {
    const tokRe = /#(\d+)/g;
    ix.starts.forEach((s, id) => {
      const ln = text.slice(s, text.indexOf(";", s));
      if (/^#\d+\s*=\s*IFCLOCALPLACEMENT/i.test(ln)) return; // underordnade placeringar följer med – räknas inte
      let m; tokRe.lastIndex = ln.indexOf("=");
      while ((m = tokRe.exec(ln))) { const r = Number(m[1]); if (plIds.has(r)) plUse.set(r, (plUse.get(r) || 0) + 1); }
    });
  }
  let n = 0, missing = 0;
  // Ytligast först: ett objekt vars överordnade placering redan flyttas på plats med samma flytt (t.ex. ett
  // fönster i en flyttad vägg) följer med av sig själv och ska inte flyttas en gång till.
  const chain = pl => { const out = []; let cur = pl, d = 0; while (cur != null && d++ < 50) { const ln = ix.line(cur); if (!ln || !/IFCLOCALPLACEMENT/i.test(ln)) break; cur = l3bmRef(l3bmArgs(ln)[0]); if (cur != null) out.push(cur); } return out; };
  const inPlace = new Map(); // placering -> flyttens matris
  const same = (A, B) => A.elements.every((v, i) => Math.abs(v - B.elements[i]) < 1e-9);
  const order = [...want.keys()].filter(g => found.has(g) && elPl.get(g) != null).sort((a, b) => chain(elPl.get(a)).length - chain(elPl.get(b)).length);
  want.forEach((_, guid) => { if (!order.includes(guid)) missing++; });
  order.forEach(guid => {
    const Dm = want.get(guid), id = found.get(guid), pl = elPl.get(guid);
    if (chain(pl).some(a => inPlace.has(a) && same(inPlace.get(a), Dm))) { n++; return; }
    const D = S.clone().multiply(Dm).multiply(Si); // i filens enheter
    const plLine = replace.get(pl) || ix.line(pl), [rel, ax] = l3bmArgs(plLine);
    const relId = l3bmRef(rel), Wrel = l3bmWorld(ix, relId);
    const Q = Wrel.clone().invert().multiply(D).multiply(Wrel);
    const qAx = l3bmWriteAxis(Q, add), qPl = add(`IFCLOCALPLACEMENT(${relId != null ? "#" + relId : "$"},#${qAx})`);
    if ((plUse.get(pl) || 0) <= 1) { replace.set(pl, `#${pl}=IFCLOCALPLACEMENT(#${qPl},${ax});`); inPlace.set(pl, Dm); } // på plats: öppningar m.m. följer med
    else {
      const own = add(`IFCLOCALPLACEMENT(#${qPl},${ax})`);
      const ln = ix.line(id), a = l3bmArgs(ln), head = ln.slice(0, ln.indexOf("(") + 1);
      a[5] = "#" + own; replace.set(id, head + a.join(",") + ");");
    }
    n++;
  });
  // Bygg ihop: ersatta rader på sina platser, nya rader sist i DATA.
  let out = "", last = 0;
  [...replace.keys()].map(id => ({ id, s: ix.starts.get(id) })).sort((a, b) => a.s - b.s).forEach(({ id, s }) => {
    const e = text.indexOf(";", s) + 1;
    out += text.slice(last, s) + replace.get(id); last = e;
  });
  out += text.slice(last);
  const endData = out.lastIndexOf("ENDSEC;");
  out = out.slice(0, endData) + added.join("\n") + "\n" + out.slice(endData);
  return { text: out, moved: n, missing };
}
/* Hela kedjan: hämta originalet, skriv in flyttarna, spara som ny fil i samma mapp i TC. */
async function l3bmSave(modelKey) {
  const ed = l3bm.edits.get(modelKey);
  if (!ed || !ed.moves.size) { l3Status("Inga flyttar att spara."); return; }
  const m = ed.model, w = m.src || {};
  const key = "bmsave", lbl = `Sparar ${m.name}`;
  try {
    busyProgress(key, `${lbl}: hämtar originalet`, 0);
    const r = w.fileId ? await askOpener("tcFile", { fileId: w.fileId, name: w.name }, 0, f => busyProgress(key, `${lbl}: hämtar originalet`, 0.5 * f))
      : await askOpener("ifcModelData", { modelId: w.id || m.id }, 0, f => busyProgress(key, `${lbl}: hämtar originalet`, 0.5 * f));
    busyProgress(key, `${lbl}: skriver in flyttarna`, 0.55);
    await new Promise(res => setTimeout(res, 20));
    const u8 = new Uint8Array(r.bytes);
    let text = ""; for (let i = 0; i < u8.length; i += 65536) text += String.fromCharCode.apply(null, u8.subarray(i, i + 65536)); // latin1: byte för byte
    // Flyttarna i scenen (SWEREF-meter) -> modellens IFC-koordinater (TC:s placering av modellen räknas bort).
    const pl = w.fileId ? null : r.placement;
    const rd = (pl && pl.refDirection) || { x: 1, y: 0, z: 0 }, rl = Math.hypot(rd.x, rd.y) || 1, P = (pl && pl.position) || { x: 0, y: 0, z: 0 };
    const Pl = new THREE.Matrix4().makeRotationZ(Math.atan2(rd.y / rl, rd.x / rl)).setPosition(P.x / 1000, P.y / 1000, P.z / 1000), Pli = Pl.clone().invert();
    const movesIfc = new Map([...ed.moves].map(([g, D]) => [g, Pli.clone().multiply(D).multiply(Pl)]));
    const res = l3bmApplyToIfc(text, movesIfc);
    busyProgress(key, `${lbl}: laddar upp`, 0.7);
    const bytes = new Uint8Array(res.text.length); for (let i = 0; i < res.text.length; i++) bytes[i] = res.text.charCodeAt(i) & 255;
    const d = new Date(), p2 = x => String(x).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} kl ${p2(d.getHours())}.${p2(d.getMinutes())}.${p2(d.getSeconds())}`; // unikt namn – aldrig en ny version av en befintlig fil
    const name = `${String(m.name || "Modell").replace(/\.ifc(zip)?$/i, "")} flyttad ${stamp}.ifc`.replace(/[\\/:*?"<>|]/g, "-");
    const up = await askOpener("tcUpload", { folderId: w.parentId || null, folder: w.parentId ? null : "4D Etablering", files: [new File([bytes], name, { type: "application/x-step" })] }, 30 * 60 * 1000);
    busyProgress(key, "", null);
    l3bm.edits.delete(modelKey);
    l3Toast(`Sparad som ny fil i Trimble Connect: ${name}${up && up.folder ? ` (${up.folder})` : ""} – ${res.moved} objekt flyttade${res.missing ? `, ${res.missing} hittades inte i filen` : ""}. Originalet är orört.`);
    l3Status(`Sparad: ${name}`);
    if (typeof l3LayersRender === "function") l3LayersRender();
    return { name, ...res };
  } catch (e) {
    busyProgress(key, "", null);
    l3Status("Kunde inte spara: " + e.message, true);
    throw e;
  }
}
/* Antal ändrade objekt som inte sparats (per modell, för panelen och Lager). */
function l3bmPending(modelKey) { const ed = l3bm.edits.get(modelKey); return ed ? ed.moves.size : 0; }
