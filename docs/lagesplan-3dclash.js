/* 3D-vyn: kollisionskontroll som Teklas Clash Check Manager (Victor 2026-10-08).
   Hittar etableringsobjekt som krockar med varandra eller med byggnadens objekt (de planerade
   objekten med läge). Två objekt krockar när fotavtrycken går in i varandra (eller ligger närmare
   än valt minsta avstånd) och de delar höjd – staplade containrar eller en container på ett upplag
   räknas alltså inte. Med "Ta hänsyn till tiden" krockar bara det som finns samtidigt: etableringens
   start–slut, och byggnadens objekt från sin start. Kranens räckviddsskiva räknas inte. */

const L3_CLASH_DEF = { bldg: true, time: true, gap: 0, onlySel: false };
let l3ClashRes = [];

/* Konvexa fotavtryck (meter i modellens system) med höjdintervall för en placering. */
function l3ClashShapes(p) {
  return placeParts(p, 24).filter(pt => pt.role !== "reach" && pt.poly && pt.poly.length >= 3).map(pt => {
    const xs = pt.poly.map(q => q[0]), ys = pt.poly.map(q => q[1]);
    return { poly: pt.poly, z0: pt.z0, z1: pt.z1, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
  });
}
/* Byggnadens objekt som rätblock (positions med x0..x1, y0..y1, z0..z1). */
function l3ClashBldg() {
  const byId = new Map((typeof items !== "undefined" ? items : []).map(r => [r.id, r]));
  return (typeof positions !== "undefined" ? positions : []).filter(q => !(l3.hiddenObjs && l3.hiddenObjs.has(q.id))).map(q => {
    const h = 0.25, x0 = q.x0 ?? q.x - h, x1 = q.x1 ?? q.x + h, y0 = q.y0 ?? q.y - h, y1 = q.y1 ?? q.y + h;
    const r = byId.get(q.id) || {};
    return { id: q.id, name: [r.object_name, r.activity].filter(Boolean).join(" · ") || q.id, start: r.start_date || "",
      shape: { poly: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z0: q.z0 ?? 0, z1: Math.max(q.z1 ?? 0, (q.z0 ?? 0) + 0.05), box: [x0, y0, x1, y1] } };
  });
}
/* Avstånd mellan två konvexa polygoner i plan: negativt = överlapp (djupet), annars kortaste avståndet. */
function l3PolyGap(A, B) {
  let depth = Infinity, sep = -Infinity;
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], nx = b[1] - a[1], ny = a[0] - b[0], l = Math.hypot(nx, ny);
    if (l < 1e-9) continue;
    const ax = nx / l, ay = ny / l, pr = Q => { let lo = Infinity, hi = -Infinity; Q.forEach(q => { const d = q[0] * ax + q[1] * ay; lo = Math.min(lo, d); hi = Math.max(hi, d); }); return [lo, hi]; };
    const [a0, a1] = pr(A), [b0, b1] = pr(B), gap = Math.max(b0 - a1, a0 - b1);
    sep = Math.max(sep, gap); depth = Math.min(depth, -gap);
  }
  if (sep < 0) return -depth; // överlapp: minsta genomträngning
  // Isär: kortaste avståndet hörn–kant.
  const ps = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0; return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]); };
  let d = Infinity;
  for (const [P, Q] of [[A, B], [B, A]]) P.forEach(p => Q.forEach((a, i) => { d = Math.min(d, ps(p, a, Q[(i + 1) % Q.length])); }));
  return d;
}
/* Krock mellan två former: delar höjd och ligger i varandra / närmare än gap. Returnerar överlappet eller null. */
function l3ShapeClash(s, t, gap) {
  const zov = Math.min(s.z1, t.z1) - Math.max(s.z0, t.z0);
  if (zov <= 0.01) return null;
  if (s.box[0] > t.box[2] + gap || t.box[0] > s.box[2] + gap || s.box[1] > t.box[3] + gap || t.box[1] > s.box[3] + gap) return null;
  const g = l3PolyGap(s.poly, t.poly);
  if (gap > 0 ? g >= gap - 1e-6 : g > -0.01) return null;
  return { g, z0: Math.max(s.z0, t.z0), z1: Math.min(s.z1, t.z1), box: [Math.max(s.box[0], t.box[0]), Math.max(s.box[1], t.box[1]), Math.min(s.box[2], t.box[2]), Math.min(s.box[3], t.box[3])] };
}
const l3TimeOverlap = (a0, a1, b0, b1) => !((a1 && b0 && a1 < b0) || (b1 && a0 && b1 < a0));

function l3ClashRun(opt) {
  const o = { ...L3_CLASH_DEF, ...opt }, gap = Math.max(0, Number(o.gap) || 0);
  const list = placements.filter(p => !(l3.hidden && l3.hidden.has(p.id)));
  const sh = new Map(list.map(p => [p.id, l3ClashShapes(p)]));
  const focus = o.onlySel && l3.sel.size ? l3.sel : null;
  const out = [];
  const best = (A, B) => { let r = null; A.forEach(s => B.forEach(t => { const c = l3ShapeClash(s, t, gap); if (c && (!r || c.g < r.g)) r = c; })); return r; };
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (focus && !focus.has(a.id) && !focus.has(b.id)) continue;
    if (o.time && !l3TimeOverlap(a.start, a.end, b.start, b.end)) continue;
    const c = best(sh.get(a.id), sh.get(b.id));
    if (c) out.push({ a: a.id, b: b.id, bName: b.name, kind: "place", ...c });
  }
  if (o.bldg) {
    const B = l3ClashBldg();
    list.forEach(a => {
      if (focus && !focus.has(a.id)) return;
      B.forEach(q => {
        if (o.time && a.end && q.start && a.end < q.start) return; // etableringen är borta innan byggnadsdelen påbörjas
        const c = best(sh.get(a.id), [q.shape]);
        if (c) out.push({ a: a.id, b: q.id, bName: q.name, kind: "bldg", ...c });
      });
    });
  }
  return out.sort((x, y) => x.g - y.g);
}

// ---------------------------------------------------------------------
// Dialogen
// ---------------------------------------------------------------------
function l3OpenClash() {
  const v = { ...L3_CLASH_DEF, ...(l3Prefs().clash || {}) };
  v.ran = false; v.onlySel = !!l3.sel.size;
  l3Clash = v;
  l3RenderClash(false);
}
let l3Clash = null;
function l3RenderClash(ran) {
  const v = l3Clash, f = x => Number(x).toLocaleString("sv-SE", { maximumFractionDigits: 2 });
  const name = id => (placements.find(p => p.id === id) || {}).name || id;
  const rows = l3ClashRes.map((c, i) => `<button type="button" class="v3-clash-r" data-clash="${i}"><div><b>${escHtml(name(c.a))}</b><span>${c.kind === "bldg" ? "Byggnaden: " : "Mot "}${escHtml(c.bName || name(c.b))}</span></div><em>${c.g < 0 ? `går in ${f(-c.g)} m` : `${f(c.g)} m isär`}</em></button>`).join("");
  const d = l3Dlg("v3Clash", "Kollisionskontroll", `
    <div class="v3-clash-opt">
      <label class="v3-chk"><input type="checkbox" data-co="bldg" ${v.bldg ? "checked" : ""} /> Mot byggnadens objekt</label>
      <label class="v3-chk" title="Bara det som finns samtidigt (etableringens start–slut, byggnadens objekt från sin start)"><input type="checkbox" data-co="time" ${v.time ? "checked" : ""} /> Ta hänsyn till tiden (4D)</label>
      <label class="v3-chk"><input type="checkbox" data-co="onlySel" ${v.onlySel ? "checked" : ""} ${l3.sel.size ? "" : "disabled"} /> Bara markerade${l3.sel.size ? ` (${l3.sel.size})` : ""}</label>
      <label class="v3-dlg-f v3-clash-gap"><span>Minsta avstånd</span><div class="v3-in"><input type="text" inputmode="decimal" id="v3ClashGap" value="${String(v.gap).replace(".", ",")}" /><em>m</em></div></label>
    </div>
    ${ran ? `<div class="v3-clash-sum ${l3ClashRes.length ? "bad" : "ok"}">${l3ClashRes.length ? `${l3ClashRes.length} ${l3ClashRes.length === 1 ? "krock" : "krockar"} – tryck för att visa` : "Inga krockar."}</div><div class="v3-clash-list">${rows}</div>` : ""}
    <div class="v3-dlg-foot"><button type="button" class="v3-primary" id="v3ClashGo">Kontrollera</button><button type="button" id="v3ClashClose">Stäng</button></div>`,
    { onClose: () => { l3Clash = null; l3ClashRes = []; l3ClashMarks([]); } });
  d.querySelectorAll("[data-co]").forEach(c => { c.onchange = () => { v[c.dataset.co] = c.checked; l3SetPref("clash", { bldg: v.bldg, time: v.time, gap: v.gap }); }; });
  d.querySelector("#v3ClashGap").oninput = e => { v.gap = Math.max(0, placeNum(e.target.value, 0)); l3SetPref("clash", { bldg: v.bldg, time: v.time, gap: v.gap }); };
  d.querySelector("#v3ClashGo").onclick = () => {
    v.ran = true; l3ClashRes = l3ClashRun(v); l3RenderClash(true); l3ClashMarks(l3ClashRes);
    l3Status(l3ClashRes.length ? `${l3ClashRes.length} ${l3ClashRes.length === 1 ? "krock" : "krockar"} – markerade med rött.` : "Inga krockar.");
  };
  d.querySelector("#v3ClashClose").onclick = () => l3DlgClose("v3Clash");
  d.querySelectorAll("[data-clash]").forEach(b => { b.onclick = () => l3ClashShow(+b.dataset.clash); });
}
/* Efter en ändring: kör om kontrollen om resultatet visas (rött försvinner när krocken är löst). */
function l3ClashRefresh() {
  if (!l3Clash || !l3Clash.ran) return;
  l3ClashRes = l3ClashRun(l3Clash); l3RenderClash(true); l3ClashMarks(l3ClashRes);
}
/* Röda lådor där det krockar. */
function l3ClashMarks(list) {
  if (!l3.groups.clash) { l3.groups.clash = new THREE.Group(); l3.scene.add(l3.groups.clash); }
  l3Clear(l3.groups.clash);
  const O = l3.O;
  list.slice(0, 400).forEach(c => {
    const w = Math.max(0.1, c.box[2] - c.box[0]), h = Math.max(0.1, c.box[3] - c.box[1]), z = Math.max(0.1, c.z1 - c.z0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, z + 0.1), new THREE.MeshBasicMaterial({ color: 0xdc2626, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false }));
    m.position.set((c.box[0] + c.box[2]) / 2 - O[0], (c.box[1] + c.box[3]) / 2 - O[1], (c.z0 + c.z1) / 2 - O[2]);
    m.renderOrder = 8; m.userData.noHit = true;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0xdc2626, depthTest: false }));
    e.renderOrder = 9; m.add(e);
    l3.groups.clash.add(m);
  });
  l3Render();
}
function l3ClashShow(i) {
  const c = l3ClashRes[i];
  if (!c) return;
  l3SelectIds(c.kind === "place" ? [c.a, c.b] : [c.a]);
  const O = l3.O, P = new THREE.Vector3((c.box[0] + c.box[2]) / 2 - O[0], (c.box[1] + c.box[3]) / 2 - O[1], (c.z0 + c.z1) / 2 - O[2]);
  const size = Math.max(6, (c.box[2] - c.box[0]) * 3, (c.box[3] - c.box[1]) * 3);
  l3FlyTo(P, size * 1.6, l3.camera.position.clone().sub(l3.orbit.target), 400);
  document.querySelectorAll(".v3-clash-r").forEach((b, k) => b.classList.toggle("on", k === i));
}
