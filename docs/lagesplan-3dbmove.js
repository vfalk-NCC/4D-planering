/* 3D-vyn – flytta objekt i inlästa IFC-modeller och spara som en ny IFC i Trimble Connect (Victor
   2026-10-10: "IFC:erna vill jag också kunna markera delarna och flytta runt och skicka tillbaka till TC").

   Flytta: de markerade objekten lyfts ut i en egen grupp med handtag (flytta X/Y/Z, vrid kring Z) och
   fält för dX/dY/dZ/vridning. Klar = flytten läggs in i modellen (kan flyttas igen), Avbryt = tillbaka.
   Spara: originalfilen hämtas från TC och varje flyttat objekts placering skrivs om:
   – används placeringen bara av objektet (och av delar som ärver den, t.ex. öppningar och trappsteg)
     ändras den på plats, så att allt som hör till objektet följer med;
   – delas den av andra objekt får objektet en egen, ny placering.
   Resultatet blir en NY fil i samma mapp ("… flyttad <tid>.ifc") – originalet skrivs aldrig över.

   Kopiera (Victor 2026-10-12: "Kopiera hade nog också varit bra här på modellobjekt"): som Flytta men originalen
   står kvar; kopian dras ut med handtagen och blir nya objekt i modellen (nytt IFC-id, samma form, egenskaper,
   material och våning som originalet). Sparas på samma sätt som flyttarna – som en ny fil. */

const l3bm = { session: null, edits: new Map() }; // edits: modell-id -> { model, moves: Map(guid -> Matrix4 i SWEREF-meter), copies: Map(nytt guid -> { src, M }) }
function l3bmEd(model) {
  if (!l3bm.edits.has(model.id)) l3bm.edits.set(model.id, { model, moves: new Map(), copies: new Map() });
  const ed = l3bm.edits.get(model.id); if (!ed.copies) ed.copies = new Map();
  return ed;
}
const l3bmCount = ed => (ed ? ed.moves.size + (ed.copies ? ed.copies.size : 0) : 0);

// ---------------------------------------------------------------------
// Flytta i 3D
// ---------------------------------------------------------------------
function l3bmStart(opts = {}) {
  if (l3bm.session) l3bmCancel();
  const copy = !!opts.copy;
  const ents = (typeof l3bs !== "undefined" ? l3bs.sel : []).map(e => ({ mesh: e.mesh, ri: e.ri }));
  if (!ents.length) { l3Status("Markera först objekt i byggnaden (tryck på dem)."); return; }
  if (ents.some(e => !e.mesh.userData.l3b.ranges[e.ri].guid)) { l3Status(`Något av objekten saknar IFC-id och kan inte ${copy ? "kopieras" : "flyttas"}.`, true); return; }
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
    const P = e.mesh.geometry.getAttribute("position").array, C = e.mesh.geometry.getAttribute("color").array, CK = C instanceof Uint8Array ? 1 / 255 : 1;
    const pos = new Float32Array(r.count * 3), col = new Float32Array(r.count * 3), off = e.mesh.position.clone().sub(c);
    for (let i = 0; i < r.count; i++) { const k = (r.start + i) * 3; pos[i * 3] = P[k] + off.x; pos[i * 3 + 1] = P[k + 1] + off.y; pos[i * 3 + 2] = P[k + 2] + off.z; col[i * 3] = C[k] * CK; col[i * 3 + 1] = C[k + 1] * CK; col[i * 3 + 2] = C[k + 2] * CK; }
    const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = u.origIdx[s + i] - r.start;
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: new THREE.Color(0x2b1d8f) }));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), new THREE.LineBasicMaterial({ color: 0x6d5efc, transparent: true, opacity: .95 }));
    edges.renderOrder = 6; [m, edges].forEach(o => { o.userData.noHit = true; o.raycast = () => {}; G.add(o); });
    if (copy) return; // originalen står kvar
    if (!hideBy.has(e.mesh)) hideBy.set(e.mesh, []);
    hideBy.get(e.mesh).push(e.ri);
  });
  hideBy.forEach((ris, mesh) => { ris.forEach(ri => mesh.userData.l3b.hidden.add(ri)); l3bApplyHidden(mesh); });
  l3.groups.bldg.add(G);
  G.updateMatrix();
  l3bm.session = { ents, G, start: G.matrix.clone(), c: c.clone(), hideBy, copy };
  if (opts.crane) { l3bm.session.crane = true; l3Render(); return; } // kranen bär lasten (lagesplan-3dlift.js): inga handtag
  l3.gizmo.attach(G); l3.gizmo.setMode("translate"); l3.gizmo.showX = l3.gizmo.showY = l3.gizmo.showZ = true;
  l3bmRenderSide();
  l3Status(copy ? `Kopiera ${ents.length} objekt: dra kopian dit den ska med handtagen eller skriv in hur långt. Klar lägger in kopian, Avbryt ångrar.`
    : `Flytta ${ents.length} objekt: dra i handtagen eller skriv in hur långt. Klar lägger in flytten, Avbryt återställer.`);
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
function l3bmCancel() { const copy = l3bm.session && l3bm.session.copy; l3bmEnd(); l3Status(copy ? "Kopieringen avbröts." : "Flytten avbröts."); if (typeof l3RenderSide === "function") l3RenderSide(); l3Render(); }
/* Klar: punkterna i bitarna flyttas på riktigt och flytten sparas per modell (för Spara som ny IFC). */
function l3bmAccept() {
  const s = l3bm.session; if (!s) return;
  const D = l3bmDelta();
  const moved = !D.equals(new THREE.Matrix4());
  const ents = s.ents, copy = s.copy;
  l3bmEnd();
  if (!moved) { l3Status(copy ? "Kopian ligger på originalet – dra den dit den ska först. Inget kopierades." : "Inget flyttades."); l3RenderSide(); return; }
  const O = new THREE.Matrix4().makeTranslation(l3.O[0], l3.O[1], l3.O[2]), Oi = O.clone().invert();
  const Dg = O.clone().multiply(D).multiply(Oi); // i SWEREF-meter
  if (copy) { l3bmCopyAccept(ents, D, Dg); return; }
  const list = ents.map(e => ({ mesh: e.mesh, ri: e.ri }));
  l3bmApplyDelta(list, D, Dg);
  // Ctrl+Z flyttar tillbaka, Ctrl+Y igen (Victor 2026-10-10).
  if (typeof l3VPush === "function") l3VPush(() => { l3bmApplyDelta(list, D.clone().invert(), Dg.clone().invert()); l3bsSet(list); }, () => { l3bmApplyDelta(list, D, Dg); l3bsSet(list); }, "flytt");
  l3bsSet(ents);
  const n = [...l3bm.edits.values()].reduce((a, x) => a + (x.dirty ? l3bmCount(x) : 0), 0);
  l3Toast(`${ents.length} objekt flyttade. ${n} ändrade objekt väntar på att sparas som ny IFC i Trimble Connect.`);
  if (typeof l3LayersRender === "function") l3LayersRender();
  l3Render();
}
/* Flyttar bitarna (D i scenen, Dg i SWEREF-meter) och för in flytten i det som sparas. */
function l3bmApplyDelta(ents, D, Dg) {
  const touched = new Set();
  ents.forEach(e => {
    const u = e.mesh.userData.l3b, r = u.ranges[e.ri], pos = e.mesh.geometry.getAttribute("position");
    e.mesh.updateMatrixWorld(true);
    const M = e.mesh.matrixWorld, Mi = M.clone().invert(), L = Mi.clone().multiply(D).multiply(M), v = new THREE.Vector3();
    for (let i = r.start; i < r.start + r.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(L); pos.setXYZ(i, v.x, v.y, v.z); }
    touched.add(e.mesh);
    const model = u.model;
    const ed = l3bmEd(model), prev = ed.moves.get(r.guid) || new THREE.Matrix4();
    const nx = Dg.clone().multiply(prev);
    // Tillbaka där det var (t.ex. efter Ctrl+Z): ingen flytt att skriva in.
    if (nx.elements.every((x, i) => Math.abs(x - (i % 5 === 0 ? 1 : 0)) < 1e-9)) ed.moves.delete(r.guid); else ed.moves.set(r.guid, nx);
    ed.dirty = l3bmCount(ed) > 0;
  });
  touched.forEach(m => { m.geometry.getAttribute("position").needsUpdate = true; m.geometry.computeVertexNormals(); m.geometry.computeBoundingSphere(); m.geometry.computeBoundingBox(); m.userData.l3b.centers = null; m.userData.l3b.boxes = null; if (typeof l3BvhSchedule === "function") l3BvhSchedule(m); });
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
  side.innerHTML = `<div class="v3-side-h"><i class="v3-chip" style="background:#6d5efc"></i><b>${s.copy ? "Kopiera" : "Flytta"} ${s.ents.length} objekt</b><button type="button" class="v3-x" id="v3BmX" title="Avbryt (Esc)">✕</button></div>
    <div class="v3-sub">${s.copy ? "Kopian: dra" : "Dra"} i handtagen eller skriv in hur långt (meter). Vridningen sker kring markeringens mitt.</div>
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
/* Modellens original-IFC från Trimble Connect som text (en byte per tecken), med alla flyttar i modellen
   inskrivna. Används både av Spara och av Exportera markerade. */
async function l3bmFetchIfc(m, onProgress) {
  const w = m.src || {}, ed = l3bm.edits.get(m.id);
  // Originalet: webbläsarens kopia från inläsningen om den finns, annars från Trimble Connect.
  const loc = typeof l3pRaw === "function" ? await l3pRaw(m, onProgress) : null;
  const r = loc ? { bytes: await loc.blob.arrayBuffer(), placement: loc.placement }
    : w.fileId ? await askOpener("tcFile", { fileId: w.fileId, name: w.name }, 0, onProgress)
    : await askOpener("ifcModelData", { modelId: w.id || m.id }, 0, onProgress);
  await new Promise(res => setTimeout(res, 20));
  const u8 = new Uint8Array(r.bytes);
  let text = ""; for (let i = 0; i < u8.length; i += 65536) text += String.fromCharCode.apply(null, u8.subarray(i, i + 65536)); // latin1: byte för byte
  if (!/(^|[\s;])DATA\s*;/i.test(text.slice(0, 1 << 20))) throw new Error(`${m.name} är ingen IFC-fil i textformat (t.ex. .ifczip) och kan inte skrivas.`);
  // Egna grupper (lagesplan-3dgroups.js) skrivs in som egenskapen 4D-planering › Grupp.
  const withGroups = r => (typeof l3gApplyToIfc === "function" ? { ...r, ...l3gApplyToIfc(r.text) } : r);
  if (!l3bmCount(ed)) return withGroups({ text, moved: 0, missing: 0 });
  // Flyttarna i scenen (SWEREF-meter) -> modellens IFC-koordinater (TC:s placering av modellen räknas bort).
  const pl = w.fileId ? null : r.placement;
  const rd = (pl && pl.refDirection) || { x: 1, y: 0, z: 0 }, rl = Math.hypot(rd.x, rd.y) || 1, P = (pl && pl.position) || { x: 0, y: 0, z: 0 };
  const Pl = new THREE.Matrix4().makeRotationZ(Math.atan2(rd.y / rl, rd.x / rl)).setPosition(P.x / 1000, P.y / 1000, P.z / 1000), Pli = Pl.clone().invert();
  const toIfc = D => Pli.clone().multiply(D).multiply(Pl);
  let copied = 0, cmiss = 0;
  if (ed.copies && ed.copies.size) {
    const c = l3bmCopiesToIfc(text, new Map([...ed.copies].map(([g, x]) => [g, { src: x.src, M: toIfc(x.M) }])));
    text = c.text; copied = c.copied; cmiss = c.missing;
  }
  const res = ed.moves.size ? l3bmApplyToIfc(text, new Map([...ed.moves].map(([g, D]) => [g, toIfc(D)]))) : { text, moved: 0, missing: 0 };
  return withGroups({ ...res, copied, missing: res.missing + cmiss });
}
function l3bmStrBytes(t) { const b = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i) & 255; return b; }
/* Unikt filnamn med sekunder – aldrig en ny version av en befintlig fil. */
function l3bmFileName(m, what) {
  const d = new Date(), p2 = x => String(x).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} kl ${p2(d.getHours())}.${p2(d.getMinutes())}.${p2(d.getSeconds())}`;
  return `${String(m.name || "Modell").replace(/\.ifc(zip)?$/i, "")} ${what} ${stamp}.ifc`.replace(/[\\/:*?"<>|]/g, "-");
}
async function l3bmUpload(m, bytes, name) {
  const w = m.src || {};
  return askOpener("tcUpload", { folderId: w.parentId || null, folder: w.parentId ? null : "4D Etablering", files: [new File([bytes], name, { type: "application/x-step" })] }, 30 * 60 * 1000);
}

async function l3bmSave(modelKey) {
  const ed = l3bm.edits.get(modelKey);
  if (!l3bmCount(ed)) { l3Status("Inga flyttar eller kopior att spara."); return; }
  const m = ed.model;
  const key = "bmsave", lbl = `Sparar ${m.name}`;
  try {
    busyProgress(key, `${lbl}: hämtar originalet`, 0);
    const res = await l3bmFetchIfc(m, f => busyProgress(key, `${lbl}: hämtar originalet`, 0.5 * f));
    busyProgress(key, `${lbl}: laddar upp`, 0.7);
    const name = l3bmFileName(m, ed.moves.size ? "flyttad" : "kopierad");
    const up = await l3bmUpload(m, l3bmStrBytes(res.text), name);
    busyProgress(key, "", null);
    ed.dirty = false; // flyttarna finns kvar (i scenen och för Exportera markerade) men är sparade
    l3Toast(`Sparad som ny fil i Trimble Connect: ${name}${up && up.folder ? ` (${up.folder})` : ""} – ${[res.moved ? `${res.moved} objekt flyttade` : "", res.copied ? `${res.copied} kopior` : ""].filter(Boolean).join(", ") || "inga ändringar"}${res.missing ? `, ${res.missing} hittades inte i filen` : ""}. Originalet är orört.`);
    l3Status(`Sparad: ${name}`);
    if (typeof l3LayersRender === "function") l3LayersRender();
    return { name, ...res };
  } catch (e) {
    busyProgress(key, "", null);
    l3Status("Kunde inte spara: " + e.message, true);
    throw e;
  }
}
function l3bmPending(modelKey) { const ed = l3bm.edits.get(modelKey); return ed && ed.dirty ? l3bmCount(ed) : 0; }

// ---------------------------------------------------------------------
// Kopiera
// ---------------------------------------------------------------------
/* Nytt IFC-id (22 tecken, IFC:s base64 – 128 slumpbitar). */
const L3BM_B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
function l3bmGuid() {
  const b = crypto.getRandomValues(new Uint8Array(22));
  let s = L3BM_B64[b[0] & 3];
  for (let i = 1; i < 22; i++) s += L3BM_B64[b[i] & 63];
  return s;
}
/* Klar i kopieringsläget: kopiorna blir en egen bit per modell (markerbar, flyttbar, kan kopieras igen). */
function l3bmCopyAccept(ents, D, Dg) {
  const byModel = new Map();
  ents.forEach(e => { const m = e.mesh.userData.l3b.model; if (!byModel.has(m)) byModel.set(m, []); byModel.get(m).push(e); });
  const made = [], I = new THREE.Matrix4(), v = new THREE.Vector3();
  byModel.forEach((list, model) => {
    const ed = l3bmEd(model);
    let nv = 0, ni = 0; list.forEach(e => { nv += e.mesh.userData.l3b.ranges[e.ri].count; ni += l3bsIdx(e.mesh, e.ri)[1]; });
    const pos = new Float32Array(nv * 3), col = new Uint8Array(nv * 3), idx = new Uint32Array(ni), ranges = [], recs = [];
    const base = list[0].mesh; base.updateMatrixWorld(true);
    const Bi = base.matrixWorld.clone().invert();
    let vo = 0, io = 0;
    list.forEach(e => {
      const u = e.mesh.userData.l3b, r = u.ranges[e.ri], [s, n] = l3bsIdx(e.mesh, e.ri);
      e.mesh.updateMatrixWorld(true);
      const L = Bi.clone().multiply(D).multiply(e.mesh.matrixWorld);
      const P = e.mesh.geometry.getAttribute("position"), C = e.mesh.geometry.getAttribute("color").array, k8 = C instanceof Uint8Array;
      for (let i = 0; i < r.count; i++) {
        v.fromBufferAttribute(P, r.start + i).applyMatrix4(L);
        const o = (vo + i) * 3, k = (r.start + i) * 3;
        pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z;
        for (let a = 0; a < 3; a++) col[o + a] = k8 ? C[k + a] : Math.round(C[k + a] * 255);
      }
      for (let i = 0; i < n; i++) idx[io + i] = u.origIdx[s + i] - r.start + vo;
      const guid = l3bmGuid();
      ranges.push({ start: vo, count: r.count, idxStart: io, idxCount: n, guid, name: r.name, base: r.base, copyOf: r.copyOf || r.guid });
      // Kopian i förhållande till originalet i filen: denna kopiering · originalets flytt (· tidigare kopiering).
      const was = ed.copies.get(r.guid);
      recs.push([guid, { src: was ? was.src : r.guid, M: Dg.clone().multiply(ed.moves.get(r.guid) || I).multiply(was ? was.M : I) }]);
      vo += r.count; io += n;
    });
    const m = l3bMeshFromArrays(pos, col, idx, ranges, model);
    m.position.copy(base.position);
    m.userData.bcopy = recs;
    made.push(m);
  });
  l3bmCopyAttach(made);
  const sel = () => made.flatMap(m => m.userData.l3b.ranges.map((r, ri) => ({ mesh: m, ri })));
  if (typeof l3VPush === "function") l3VPush(() => { l3bsSet([]); l3bmCopyDetach(made); }, () => { l3bmCopyAttach(made); l3bsSet(sel()); }, "kopiering");
  l3bsSet(sel());
  const n = [...l3bm.edits.values()].reduce((a, x) => a + (x.dirty ? l3bmCount(x) : 0), 0);
  l3Toast(`${ents.length} objekt kopierade. ${n} ändrade objekt väntar på att sparas som ny IFC i Trimble Connect.`);
  if (typeof l3LayersRender === "function") l3LayersRender();
  l3Render();
}
function l3bmCopyAttach(made) {
  made.forEach(m => {
    const u = m.userData.l3b, model = u.model, ed = l3bmEd(model);
    if (!model.meshes.includes(m)) { model.meshes.push(m); model.ranges.push(...u.ranges); model.tris = (model.tris || 0) + u.origIdx.length / 3; }
    if (model.visible !== false) m.visible = true; else m.visible = false;
    l3.groups.bldg.add(m);
    model._pEnts = null;
    m.userData.bcopy.forEach(([g, x]) => ed.copies.set(g, x));
    ed.dirty = l3bmCount(ed) > 0;
    if (typeof l3BvhSchedule === "function") l3BvhSchedule(m);
  });
  l3Render();
}
function l3bmCopyDetach(made) {
  made.forEach(m => {
    const u = m.userData.l3b, model = u.model, ed = l3bmEd(model);
    const i = model.meshes.indexOf(m);
    if (i >= 0) { model.meshes.splice(i, 1); const rs = new Set(u.ranges); model.ranges = model.ranges.filter(r => !rs.has(r)); model.tris = Math.max(0, (model.tris || 0) - u.origIdx.length / 3); }
    if (m.parent) m.parent.remove(m);
    model._pEnts = null;
    m.userData.bcopy.forEach(([g]) => { ed.copies.delete(g); ed.moves.delete(g); });
    ed.dirty = l3bmCount(ed) > 0;
  });
  if (typeof l3LayersRender === "function") l3LayersRender();
  l3Render();
}
/* Radera markerade kopior (Victor 2026-10-12: "Om jag har kopierat modeller vill jag också ha möjlighet att radera
   dom med delete"). Bara kopior – originalobjekten i IFC-filen raderas inte härifrån. En bit där bara en del av
   kopiorna raderas byts mot en ny bit med resten (flyttarna av de kvarvarande står kvar). Ctrl+Z ångrar. */
function l3bmIsCopy(e) { return !!(e && e.mesh && e.mesh.userData.bcopy); }
function l3bmCopyDelete(list = l3bs.sel) {
  const copies = list.filter(l3bmIsCopy);
  if (!copies.length) { l3Status("Bara kopior kan raderas – originalobjekten i IFC-filen raderas inte.", true); return false; }
  const byMesh = new Map();
  copies.forEach(e => { if (!byMesh.has(e.mesh)) byMesh.set(e.mesh, new Set()); byMesh.get(e.mesh).add(e.ri); });
  const olds = [], news = [], stash = []; // stash: [ed, guid, copy-post, flytt]
  byMesh.forEach((ris, mesh) => {
    const u = mesh.userData.l3b, ed = l3bmEd(u.model);
    u.ranges.forEach((r, ri) => { if (ris.has(ri)) stash.push([ed, r.guid, ed.copies.get(r.guid), ed.moves.get(r.guid)]); });
    olds.push(mesh);
    const keep = u.ranges.map((r, ri) => ri).filter(ri => !ris.has(ri));
    if (keep.length) news.push(l3bmCopySubset(mesh, keep));
  });
  const del = () => { stash.forEach(([ed, g]) => { ed.copies.delete(g); ed.moves.delete(g); ed.dirty = l3bmCount(ed) > 0; }); l3bmSwap(olds, news); };
  const back = () => { l3bmSwap(news, olds); stash.forEach(([ed, g, c, mv]) => { if (c) ed.copies.set(g, c); if (mv) ed.moves.set(g, mv); ed.dirty = l3bmCount(ed) > 0; }); };
  l3bsSet([]);
  del();
  if (typeof l3VPush === "function") l3VPush(back, () => { l3bsSet([]); del(); }, "radera kopior");
  const skipped = list.length - copies.length;
  l3Status(`${copies.length} ${copies.length === 1 ? "kopia raderad" : "kopior raderade"}${skipped ? ` – ${skipped} originalobjekt står kvar (bara kopior kan raderas)` : ""} (Ctrl+Z ångrar).`);
  if (typeof l3LayersRender === "function") l3LayersRender();
  l3RenderSide(); l3Render();
  return true;
}
/* Ny kopiebit med bara de angivna objekten (samma lägen och färger). */
function l3bmCopySubset(mesh, ris) {
  const u = mesh.userData.l3b, P = mesh.geometry.getAttribute("position").array, C = mesh.geometry.getAttribute("color").array, k8 = C instanceof Uint8Array;
  let nv = 0, ni = 0; ris.forEach(ri => { nv += u.ranges[ri].count; ni += l3bsIdx(mesh, ri)[1]; });
  const pos = new Float32Array(nv * 3), col = new Uint8Array(nv * 3), idx = new Uint32Array(ni), ranges = [];
  let vo = 0, io = 0;
  ris.forEach(ri => {
    const r = u.ranges[ri], [s, n] = l3bsIdx(mesh, ri);
    pos.set(P.subarray(r.start * 3, (r.start + r.count) * 3), vo * 3);
    for (let i = 0; i < r.count * 3; i++) col[vo * 3 + i] = k8 ? C[r.start * 3 + i] : Math.round(C[r.start * 3 + i] * 255);
    for (let i = 0; i < n; i++) idx[io + i] = u.origIdx[s + i] - r.start + vo;
    ranges.push({ ...r, start: vo, count: r.count, idxStart: io, idxCount: n });
    vo += r.count; io += n;
  });
  const m = l3bMeshFromArrays(pos, col, idx, ranges, u.model);
  m.position.copy(mesh.position);
  const keep = new Set(ranges.map(r => r.guid));
  m.userData.bcopy = mesh.userData.bcopy.filter(([g]) => keep.has(g));
  return m;
}
/* Byter bitar i modellen och scenen (utan att röra kopiornas och flyttarnas poster). */
function l3bmSwap(out, inn) {
  out.forEach(m => {
    const u = m.userData.l3b, model = u.model, i = model.meshes.indexOf(m);
    if (i >= 0) { model.meshes.splice(i, 1); const rs = new Set(u.ranges); model.ranges = model.ranges.filter(r => !rs.has(r)); model.tris = Math.max(0, (model.tris || 0) - u.origIdx.length / 3); }
    if (m.parent) m.parent.remove(m);
    model._pEnts = null;
  });
  inn.forEach(m => {
    const u = m.userData.l3b, model = u.model;
    if (!model.meshes.includes(m)) { model.meshes.push(m); model.ranges.push(...u.ranges); model.tris = (model.tris || 0) + u.origIdx.length / 3; }
    m.visible = model.visible !== false;
    l3.groups.bldg.add(m);
    model._pEnts = null;
  });
  l3Render();
}
/* Skriver in kopiorna i IFC-texten. copies: Map(nytt guid -> { src: originalets guid, M: Matrix4 i modellens
   IFC-koordinater, meter, från originalets plats i filen }). Kopian får en egen rad med nytt id och egen placering
   (originalets placering · M); formen (Representation) delas med originalet. Kopian läggs in i samma relationer
   som originalet: våning, egenskaper, typ, material, klassning, grupper och sammansättning. Urtag (hål i väggar)
   kopieras med. */
const L3BM_REL_LIST = { IFCRELCONTAINEDINSPATIALSTRUCTURE: 4, IFCRELDEFINESBYPROPERTIES: 4, IFCRELDEFINESBYTYPE: 4, IFCRELASSOCIATESMATERIAL: 4, IFCRELASSOCIATESCLASSIFICATION: 4, IFCRELASSIGNSTOGROUP: 4, IFCRELAGGREGATES: 5, IFCRELNESTS: 5 };
function l3bmCopiesToIfc(text, copies) {
  const ix = l3bmIndex(text), unit = l3bmUnit(text);
  const S = new THREE.Matrix4().makeScale(unit, unit, unit), Si = S.clone().invert();
  let next = ix.maxId + 1;
  const added = [], replace = new Map();
  const add = body => { const id = next++; added.push(`#${id}=${body};`); return id; };
  const srcGuids = new Set([...copies.values()].map(x => x.src)), found = new Map();
  const re = /^#(\d+)\s*=\s*(IFC[A-Z0-9_]+)\s*\(\s*'([^']{22})'/i;
  ix.starts.forEach((s, id) => { const m = re.exec(text.slice(s, s + 120)); if (m && srcGuids.has(m[3])) found.set(m[3], id); });
  // Relationerna som originalen ingår i (och urtagen).
  const srcIds = new Set(found.values()), rels = new Map(), voids = new Map();
  const relRe = /^#(\d+)\s*=\s*(IFCREL[A-Z]+)\s*\(/i, tokRe = /#(\d+)/g;
  ix.starts.forEach((s, id) => {
    const head = text.slice(s, s + 60), m = relRe.exec(head);
    if (!m) return;
    const type = m[2].toUpperCase();
    if (type === "IFCRELVOIDSELEMENT") { const a = l3bmArgs(ix.line(id)), el = l3bmRef(a[4]), op = l3bmRef(a[5]); if (srcIds.has(el) && op != null) { if (!voids.has(el)) voids.set(el, []); voids.get(el).push([id, op]); } return; }
    if (!(type in L3BM_REL_LIST)) return;
    const list = l3bmArgs(ix.line(id))[L3BM_REL_LIST[type]] || ""; let t; tokRe.lastIndex = 0; // bara listan med de ingående objekten
    while ((t = tokRe.exec(list))) { const r = Number(t[1]); if (srcIds.has(r)) { if (!rels.has(r)) rels.set(r, new Set()); rels.get(r).add(id); } }
  });
  const withNewGuid = (ln, guid, setArgs) => { const a = l3bmArgs(ln), head = ln.slice(ln.indexOf("=") + 1, ln.indexOf("(") + 1).trim(); a[0] = `'${guid}'`; if (setArgs) setArgs(a); return head + a.join(",") + ")"; };
  let copied = 0, missing = 0;
  copies.forEach((x, guid) => {
    const id = found.get(x.src);
    if (id == null) { missing++; return; }
    const ln = ix.line(id), a = l3bmArgs(ln), pl = l3bmRef(a[5]);
    let own = null;
    if (pl != null && /IFCLOCALPLACEMENT/i.test(ix.line(pl) || "")) {
      const [rel, ax] = l3bmArgs(ix.line(pl)), relId = l3bmRef(rel), Wrel = l3bmWorld(ix, relId);
      const Q = Wrel.clone().invert().multiply(S.clone().multiply(x.M).multiply(Si)).multiply(Wrel);
      const qPl = add(`IFCLOCALPLACEMENT(${relId != null ? "#" + relId : "$"},#${l3bmWriteAxis(Q, add)})`);
      own = add(`IFCLOCALPLACEMENT(#${qPl},${ax})`);
    } else { missing++; return; }
    const nid = add(withNewGuid(ln, guid, b => { b[5] = "#" + own; }));
    // Samma relationer som originalet.
    (rels.get(id) || []).forEach(rid => {
      const cur = replace.get(rid) || ix.line(rid), ra = l3bmArgs(cur), k = L3BM_REL_LIST[(relRe.exec(cur) || [])[2].toUpperCase()];
      const list = String(ra[k] || "").trim();
      if (!/^\(.*\)$/.test(list)) return;
      ra[k] = list.slice(0, -1) + `,#${nid})`;
      replace.set(rid, cur.slice(0, cur.indexOf("(") + 1) + ra.join(",") + ");");
    });
    // Urtagen: nya öppningar placerade i kopian.
    (voids.get(id) || []).forEach(([rid, op]) => {
      const oln = ix.line(op); if (!oln) return;
      const oa = l3bmArgs(oln), opl = l3bmRef(oa[5]), opln = opl != null && ix.line(opl);
      if (!opln || !/IFCLOCALPLACEMENT/i.test(opln) || l3bmRef(l3bmArgs(opln)[0]) !== pl) return; // bara öppningar placerade i objektet
      const nopl = add(`IFCLOCALPLACEMENT(#${own},${l3bmArgs(opln)[1]})`);
      const nop = add(withNewGuid(oln, l3bmGuid(), b => { b[5] = "#" + nopl; }));
      add(withNewGuid(ix.line(rid), l3bmGuid(), b => { b[4] = "#" + nid; b[5] = "#" + nop; }));
    });
    copied++;
  });
  let out = "", last = 0;
  [...replace.keys()].map(id => ({ id, s: ix.starts.get(id) })).sort((a, b) => a.s - b.s).forEach(({ id, s }) => {
    out += text.slice(last, s) + replace.get(id); last = text.indexOf(";", s) + 1;
  });
  out += text.slice(last);
  const endData = out.lastIndexOf("ENDSEC;");
  out = out.slice(0, endData) + added.join("\n") + "\n" + out.slice(endData);
  return { text: out, copied, missing };
}
