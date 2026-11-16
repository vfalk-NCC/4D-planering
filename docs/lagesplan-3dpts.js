/* 3D-vyn – punktfiler (utsättning, inmätning): visa punkterna i 3D och välj vilket objekt som ska in på varje punkt eller punktgrupp
   (Victor 2026-11-16: "bygg ett verktyg för att visa dessa punkter – jag ska också välja vilka objekt jag vill ha in på resp. punkt").

   – Filer: .pxy (XYZ-COORD-FILE), .geo, .kof, .pts, .xyz, .txt, .csv, .gdm/.job (Geodimeter 5=, 37=, 38=, 39=). Kolumnerna hittas av sig själva:
     punktnamn, tre koordinater (N E H) och eventuell kod/text efter. Norr och öst byts automatiskt om filen har dem tvärtom (knappen ⇄ om det blir fel).
   – Gruppera: varje punkt för sig, eller punkter nära varandra (standard 2 m) som en position – t.ex. fyra grundskruvar = en plint. Gruppens mitt,
     vridning (efter punkternas rektangel) och mått räknas ut.
   – Välj grupper (kryssruta, ”Alla”) → välj objekt ur biblioteket (eller egna modeller) → Tilldela. ”Placera i modellen” lägger objekten på punkternas
     höjd, vridna efter bultbilden. Placeras om utan dubbletter, och kan tas bort i ett svep.
   – Allt (punkter, grupper, tilldelningar) sparas i projektet (plan.points). Prefix l3xyz. */

const L3XYZ_EXT = ".pxy,.geo,.kof,.pts,.xyz,.txt,.csv,.gdm,.job,.dat";
const l3xyz = { open: false, sel: new Set(), grp: null, cur: null };
const l3xyzHolder = () => (typeof plan !== "undefined" && plan ? plan : (l3xyz.mem = l3xyz.mem || {}));
function l3xyzData() { const h = l3xyzHolder(); if (!h.points) h.points = { v: 1, sets: [] }; h.points.sets = h.points.sets || []; return h.points; }
function l3xyzSave() { if (typeof plan !== "undefined" && plan && typeof schedulePlanSave === "function") { const d = plan.points; if (d && !d.sets.length) delete plan.points; schedulePlanSave(); } l3xyzDraw(); l3xyzRender(); }
const l3xyzId = () => (typeof ghNewId === "function" ? ghNewId() : Math.random().toString(36).slice(2, 10));
const l3xyzNum = s => (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s) ? Number(s) : NaN);

/* ---- Läsa filer -------------------------------------------------------------------------------------- */
/* → { pts: [{ n (namn), x (norr), y (öst), z, code }], format } – x = första koordinaten i filen (norr), y = andra (öst), som i lägesplanen. */
function l3xyzParse(text, fileName = "") {
  const lines = String(text).replace(/\r/g, "").split("\n"), pts = []; let format = "text", cur = null;
  const push = (n, x, y, z, code) => { if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ n: String(n), x, y, z: Number.isFinite(z) ? z : 0, code: code || "" }); };
  lines.forEach(raw => {
    const line = raw.trim(); if (!line || /^XYZ-COORD-FILE/i.test(line) || /^[*#/]/.test(line)) return;
    if (/(^|\s)(37|38|39)=/.test(line)) {   // Geodimeter: ordindex (5 = punkt, 4 = kod, 37 = norr, 38 = öst, 39 = höjd)
      format = "geodimeter"; const o = {}; line.split(/\s+/).forEach(t => { const m = t.match(/^(\d+)=(.*)$/); if (m) o[m[1]] = m[2]; });
      if (o["5"] !== undefined && cur && cur.x !== undefined) { push(cur.n, cur.x, cur.y, cur.z, cur.code); cur = null; }
      if (!cur) cur = {}; if (o["5"] !== undefined) cur.n = o["5"]; if (o["4"] !== undefined) cur.code = o["4"]; if (o["37"] !== undefined) cur.x = l3xyzNum(o["37"]); if (o["38"] !== undefined) cur.y = l3xyzNum(o["38"]); if (o["39"] !== undefined) cur.z = l3xyzNum(o["39"]);
      return;
    }
    const tk = line.split(/[\s;,]+/).filter(Boolean);
    if (/^0[0-9]$/.test(tk[0]) && tk.length >= 5 && !Number.isNaN(l3xyzNum(tk[2]))) {   // KOF: 05 punkt x y z kod
      if (["03", "05", "09"].includes(tk[0]) && tk.length >= 5) { format = "kof"; push(tk[1], l3xyzNum(tk[2]), l3xyzNum(tk[3]), l3xyzNum(tk[4]), tk.slice(5).join(" ")); }
      return;
    }
    // Allmänt: [namn…] tre tal [kod/text…] – de tre första talen i rad med decimaler (eller stora heltal) är koordinaterna
    let i = tk.findIndex((t, k) => k >= 0 && !Number.isNaN(l3xyzNum(t)) && (t.includes(".") || Math.abs(l3xyzNum(t)) >= 1000) && !Number.isNaN(l3xyzNum(tk[k + 1])) && !Number.isNaN(l3xyzNum(tk[k + 2])));
    if (i < 0) return; if (i === 0 && tk.length >= 3) { /* utan namn: P1 ... */ }
    const name = i > 0 ? tk[0] : String(pts.length + 1);
    push(name, l3xyzNum(tk[i]), l3xyzNum(tk[i + 1]), l3xyzNum(tk[i + 2]), tk.slice(i + 3).filter(t => t !== ",").join(" "));
  });
  if (cur && cur.x !== undefined) push(cur.n, cur.x, cur.y, cur.z, cur.code);
  if (!pts.length) throw new Error("Hittade inga punkter i filen. Förväntat: punktnamn och tre koordinater (norr, öst, höjd) per rad.");
  if (format === "text" && /\.pxy$/i.test(fileName)) format = "pxy";
  return { pts, format };
}
const l3xyzMed = a => { const s = a.slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
/* Norr och öst: i svenska system är norr (x) alltid större än öst (y) – ligger de tvärtom byts de. */
function l3xyzAutoSwap(pts) { const a = l3xyzMed(pts.map(p => p.x)), b = l3xyzMed(pts.map(p => p.y)); return b > 2e6 && a < 2e6 && b > a * 1.5; }
async function l3xyzImport(file) {
  const text = await file.text(), r = l3xyzParse(text, file.name), swap = l3xyzAutoSwap(r.pts);
  const set = { id: l3xyzId(), name: file.name.replace(/\.[^.]+$/, ""), file: file.name, format: r.format, date: new Date().toISOString().slice(0, 10), swap: false, pts: r.pts.map(p => (swap ? { ...p, x: p.y, y: p.x } : p)), mode: "group", radius: 2, show: true, labels: true, size: 9, assign: {}, placed: [] };
  l3xyzData().sets.push(set); l3xyz.cur = set.id; l3xyz.sel.clear(); l3xyzSave(); return set;
}

/* ---- Grupper ----------------------------------------------------------------------------------------- */
const l3xyzSet = () => { const d = l3xyzData(); return d.sets.find(s => s.id === l3xyz.cur) || d.sets[0] || null; };
const l3xyzXY = (set, p) => (set.swap ? [p.y, p.x] : [p.x, p.y]);
/* Grupper: [{ key, n, ids, pts, x, y, z, rot, L, B }] – i punktordning. */
function l3xyzGroups(set) {
  if (!set) return [];
  const P = set.pts.map((p, i) => ({ ...p, i, xy: l3xyzXY(set, p) })), r = set.mode === "point" ? -1 : Math.max(0.05, Number(set.radius) || 2), groups = [];
  if (r < 0) P.forEach(p => groups.push([p]));
  else { P.forEach(p => { const hit = groups.filter(g => g.some(q => Math.hypot(p.xy[0] - q.xy[0], p.xy[1] - q.xy[1]) <= r)); if (!hit.length) groups.push([p]); else { hit[0].push(p); for (let k = 1; k < hit.length; k++) { hit[0].push(...hit[k]); groups.splice(groups.indexOf(hit[k]), 1); } } }); }
  return groups.map(g => {
    const n = g.length, x = g.reduce((s, p) => s + p.xy[0], 0) / n, y = g.reduce((s, p) => s + p.xy[1], 0) / n, z = g.reduce((s, p) => s + p.z, 0) / n;
    let rot = 0, L = 0, B = 0;
    if (n >= 2) {
      let cxx = 0, cyy = 0, cxy = 0; g.forEach(p => { const dx = p.xy[0] - x, dy = p.xy[1] - y; cxx += dx * dx; cyy += dy * dy; cxy += dx * dy; });
      const th = 0.5 * Math.atan2(2 * cxy, cxx - cyy), tr = cxx + cyy, df = Math.hypot(cxx - cyy, 2 * cxy);
      let a = th;
      if (n >= 3 && df < tr * 0.18) { const p0 = g[0], q = g.slice(1).reduce((m, p) => (Math.hypot(p.xy[0] - p0.xy[0], p.xy[1] - p0.xy[1]) < Math.hypot(m.xy[0] - p0.xy[0], m.xy[1] - p0.xy[1]) ? p : m)); a = Math.atan2(q.xy[1] - p0.xy[1], q.xy[0] - p0.xy[0]); }   // nästan kvadrat: efter närmaste kant
      rot = Math.round(((a * 180 / Math.PI) % 90 + 90) % 90 * 100) / 100; const c = Math.cos(a), s = Math.sin(a);
      let umin = 1e9, umax = -1e9, vmin = 1e9, vmax = -1e9; g.forEach(p => { const dx = p.xy[0] - x, dy = p.xy[1] - y, u = dx * c + dy * s, v = -dx * s + dy * c; umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); });
      L = Math.round((umax - umin) * 1000) / 1000; B = Math.round((vmax - vmin) * 1000) / 1000;
    }
    const ids = g.map(p => p.n), minI = Math.min(...g.map(p => p.i));
    return { key: "g" + minI, n, ids, pts: g, x, y, z, rot, L, B, label: n === 1 ? g[0].n : `${g[0].n}–${g[n - 1].n}` };
  }).sort((a, b) => a.pts[0].i - b.pts[0].i);
}

/* ---- Visning i 3D ----------------------------------------------------------------------------------- */
function l3xyzLabel(text, color) {
  const cv = document.createElement("canvas"), g = cv.getContext("2d"); cv.width = 192; cv.height = 64; g.font = "700 30px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "rgba(255,255,255,.92)"; const w = Math.min(188, g.measureText(text).width + 22); g.beginPath(); g.roundRect ? g.roundRect(96 - w / 2, 8, w, 48, 12) : g.rect(96 - w / 2, 8, w, 48); g.fill(); g.strokeStyle = color; g.lineWidth = 3; g.stroke(); g.fillStyle = "#0f172a"; g.fillText(text, 96, 33);
  const tx = new THREE.CanvasTexture(cv); tx.minFilter = THREE.LinearFilter; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthTest: false, transparent: true, sizeAttenuation: false })); sp.scale.set(0.115, 0.038, 1); sp.renderOrder = 12; sp.userData.noHit = true; sp.raycast = () => {}; return sp;
}
function l3xyzClear() { const G = l3.groups && l3.groups.pts; if (!G) return; while (G.children.length) { const c = G.children.pop(); if (c.geometry) c.geometry.dispose(); if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); } } }
function l3xyzDraw() {
  if (typeof l3 === "undefined" || !l3 || !l3.scene) return;
  let G = l3.groups.pts; if (!G) { G = l3.groups.pts = new THREE.Group(); G.userData.noHit = true; l3.scene.add(G); }
  l3xyzClear(); const O = l3.O;
  l3xyzData().sets.forEach(set => {
    if (!set.show) return; const groups = l3xyzGroups(set), pos = [], col = [], sel = l3xyz.sel;
    groups.forEach(g => {
      const asg = set.assign[g.key], on = sel.has(g.key), c = new THREE.Color(on ? "#facc15" : asg ? "#22c55e" : "#f97316");
      g.pts.forEach(p => { pos.push(p.xy[0] - O[0], p.xy[1] - O[1], p.z - O[2]); col.push(c.r, c.g, c.b); });
      if (g.n >= 3) { const cx = g.x, cy = g.y, ord = g.pts.slice().sort((a, b) => Math.atan2(a.xy[1] - cy, a.xy[0] - cx) - Math.atan2(b.xy[1] - cy, b.xy[0] - cx)), lg = new THREE.BufferGeometry().setFromPoints(ord.map(p => new THREE.Vector3(p.xy[0] - O[0], p.xy[1] - O[1], p.z - O[2] + 0.02))); const ln = new THREE.LineLoop(lg, new THREE.LineBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: 0.9 })); ln.renderOrder = 11; ln.userData.noHit = true; ln.raycast = () => {}; G.add(ln); }
      if (set.labels) { const sp = l3xyzLabel((asg ? "✓ " : "") + g.label, on ? "#facc15" : asg ? "#22c55e" : "#f97316"); sp.position.set(g.x - O[0], g.y - O[1], g.z - O[2] + 0.35); G.add(sp); }
    });
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const pt = new THREE.Points(geo, new THREE.PointsMaterial({ size: Number(set.size) || 9, sizeAttenuation: false, vertexColors: true, depthTest: false, transparent: true })); pt.renderOrder = 10; pt.userData.noHit = true; pt.raycast = () => {}; G.add(pt);
  });
  if (typeof l3Render === "function") l3Render();
}
function l3xyzFly(g) {
  if (!g || typeof l3plCamApply !== "function") return; const c = l3plCam(), d = Math.max(10, Math.hypot(c.p[0] - c.t[0], c.p[1] - c.t[1], c.p[2] - c.t[2]) * 0.5), dir = [c.p[0] - c.t[0], c.p[1] - c.t[1], c.p[2] - c.t[2]], L = Math.hypot(...dir) || 1;
  l3plCamApply({ p: [g.x + dir[0] / L * d, g.y + dir[1] / L * d, g.z + dir[2] / L * d], t: [g.x, g.y, g.z] });
}

/* ---- Objekt på punkterna ---------------------------------------------------------------------------- */
function l3xyzLibOptions() {
  const out = []; if (typeof PLACE_LIB !== "undefined") Object.entries(PLACE_LIB).forEach(([k, l]) => { if (l && !l.hidden && !l.fence && !l.path) out.push([k, `${l.group || "Objekt"} – ${l.label}`]); });
  if (typeof placeAssets !== "undefined") placeAssets.forEach(a => out.push(["model:" + a.id, `Egna modeller – ${a.name || a.id}`]));
  return out;
}
function l3xyzAssign(set, keys, o) {
  keys.forEach(k => { if (!o) delete set.assign[k]; else set.assign[k] = { type: o.type, ...(o.L ? { L: o.L } : {}), ...(o.B ? { B: o.B } : {}), ...(o.H ? { H: o.H } : {}), dz: Number(o.dz) || 0, rot: o.rot === "auto" || o.rot === undefined ? "auto" : Number(o.rot) || 0, ...(o.name ? { name: o.name } : {}) }; });
  l3xyzSave();
}
/* Tar bort det som placerades från den här filen och lägger nya på tilldelade grupper. */
function l3xyzPlace(set, onlyKeys) {
  if (typeof placeNew !== "function" || typeof placements === "undefined") throw new Error("Biblioteket är inte inläst");
  if (typeof placeSnapshot === "function") placeSnapshot(); l3xyzUnplace(set, false);
  const groups = l3xyzGroups(set).filter(g => set.assign[g.key] && (!onlyKeys || onlyKeys.includes(g.key))); let n = 0; set.placed = set.placed || [];
  groups.forEach(g => {
    const a = set.assign[g.key], lib = placeLib(a.type); if (!lib) return;
    const p = placeNew(a.type, [g.x, g.y, g.z]); p.name = a.name ? `${a.name} ${g.label}` : `${lib.label} ${g.label}`; p.z = Math.round(g.z * 1000) / 1000; p.dz = Number(a.dz) || 0;
    p.rot = a.rot === "auto" ? g.rot : Number(a.rot) || 0; if (a.L) p.L = a.L; if (a.B) p.B = a.B; if (a.H) p.H = a.H; p.ptSet = set.id; p.ptKey = g.key;
    placements.push(p); if (typeof placeTouch === "function") placeTouch(p); if (typeof l3AddPlacementMesh === "function") l3AddPlacementMesh(p); set.placed.push(p.id); n++;
  });
  l3xyzSave(); if (typeof l3Render === "function") l3Render(); return n;
}
function l3xyzUnplace(set, save = true) {
  if (typeof placements === "undefined") return; const ids = new Set(set.placed || []); placements.forEach(p => { if (p.ptSet === set.id) ids.add(p.id); });
  if (ids.size) {
    if (typeof placeSnapshot === "function") placeSnapshot();
    placements = placements.filter(p => !ids.has(p.id));
    ids.forEach(id => { placeDeleted.add(id); placeDirty.delete(id); const g = l3.placeMeshes.get(id); if (g) { if (l3.gizmo && l3.gizmo.object === g) l3.gizmo.detach(); l3.groups.places.remove(g); } l3.placeMeshes.delete(id); });
    if (typeof placeScheduleSave === "function") placeScheduleSave();
  }
  set.placed = []; if (save) l3xyzSave();
}

/* ---- Panelen ---------------------------------------------------------------------------------------- */
const l3xyzEsc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
function l3xyzRender() {
  const host = document.getElementById("v3Canvas"); let el = document.getElementById("v3Pts");
  if (!l3xyz.open || !host) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("div"); el.id = "v3Pts"; el.className = "v3-fe v3-pts"; host.appendChild(el); ["pointerdown", "wheel", "contextmenu", "dblclick", "click", "keydown"].forEach(t => el.addEventListener(t, e => e.stopPropagation())); }
  const D = l3xyzData(), set = l3xyzSet(), groups = l3xyzGroups(set), opts = l3xyzLibOptions(), keep = l3xyz.draft || { type: opts[0] ? opts[0][0] : "", rot: "auto", dz: 0, L: "", B: "", H: "", name: "" };
  const was = el.querySelector(".fe-body") ? el.querySelector(".fe-body").scrollTop : 0;
  el.innerHTML = `<div class="fe-h"><b>📍 Punkter</b><span>${set ? set.pts.length + " punkter" : ""}</span><button type="button" data-pt="x" title="Stäng">✕</button></div>
  <div class="fe-body"><div class="fe-sec"><div class="fe-c">
    <div class="fe-row"><label>Fil (.pxy, .geo, .kof, .csv …)<input id="ptFile" type="file" accept="${L3XYZ_EXT}" multiple /></label></div>
    ${D.sets.length ? `<div class="fe-row"><label>Punktfil<select id="ptSet">${D.sets.map(s => `<option value="${s.id}"${set && s.id === set.id ? " selected" : ""}>${l3xyzEsc(s.name)} (${s.pts.length})</option>`).join("")}</select></label><button type="button" data-pt="delset" class="fe-danger" title="Ta bort punktfilen">Ta bort fil</button></div>` : '<div class="fe-note">Välj en punktfil. Punkterna visas i 3D och du väljer sedan vilka objekt som ska in på varje punkt.</div>'}
    ${set ? `<div class="fe-row"><label>Grupper<select id="ptMode"><option value="group"${set.mode !== "point" ? " selected" : ""}>Nära varandra = en position</option><option value="point"${set.mode === "point" ? " selected" : ""}>Varje punkt för sig</option></select></label>${set.mode !== "point" ? `<label>Avstånd (m)<input id="ptRad" type="number" min="0.1" max="50" step="0.1" value="${set.radius}" /></label>` : ""}</div>
    <div class="fe-row"><label class="fe-chk"><input id="ptShow" type="checkbox"${set.show ? " checked" : ""} /> Visa</label><label class="fe-chk"><input id="ptLab" type="checkbox"${set.labels ? " checked" : ""} /> Etiketter</label><label>Prickstorlek<input id="ptSize" type="number" min="3" max="30" step="1" value="${set.size}" /></label><button type="button" data-pt="swap" title="Byt norr och öst om punkterna hamnar fel">⇄ X/Y</button></div>
    <div class="fe-sub">${groups.length} ${set.mode === "point" ? "punkter" : "positioner"} · ${Object.keys(set.assign).filter(k => groups.some(g => g.key === k)).length} med objekt · ${l3xyz.sel.size} markerade <span style="float:right"><button type="button" data-pt="all">Alla</button> <button type="button" data-pt="none">Ingen</button> <button type="button" data-pt="unas" title="Markera de som saknar objekt">Utan objekt</button></span></div>
    <div class="fe-list pt-list">${groups.map(g => { const a = set.assign[g.key], lib = a && typeof placeLib === "function" ? placeLib(a.type) : null; return `<div class="fe-it pt-row${l3xyz.sel.has(g.key) ? " on" : ""}" data-k="${g.key}"><input type="checkbox" data-pt="chk" data-k="${g.key}"${l3xyz.sel.has(g.key) ? " checked" : ""} /><button type="button" class="fe-go" data-pt="fly" data-k="${g.key}" title="Flyg dit. N ${g.x.toFixed(3)} · E ${g.y.toFixed(3)} · Z ${g.z.toFixed(3)}${g.n > 1 ? ` · bultbild ${g.L}×${g.B} m, vridning ${g.rot}°` : ""}"><b>${l3xyzEsc(g.label)}</b> <small>${g.n > 1 ? g.n + " st" : ""} Z ${g.z.toFixed(2)}</small>${a ? `<em>✓ ${l3xyzEsc(lib ? lib.label : a.type)}</em>` : ""}</button>${a ? `<button type="button" data-pt="clr" data-k="${g.key}" title="Ta bort objektet från positionen">✕</button>` : ""}</div>`; }).join("")}</div>
    <div class="fe-sub">Objekt på markerade</div>
    <label>Objekt<select id="ptType">${opts.map(([k, t]) => `<option value="${l3xyzEsc(k)}"${keep.type === k ? " selected" : ""}>${l3xyzEsc(t)}</option>`).join("")}</select></label>
    <div class="fe-row"><label>Vridning<select id="ptRot"><option value="auto"${keep.rot === "auto" ? " selected" : ""}>Efter punkterna</option>${[0, 45, 90].map(v => `<option value="${v}"${String(keep.rot) === String(v) ? " selected" : ""}>${v}°</option>`).join("")}</select></label><label>Höjd över punkt (m)<input id="ptDz" type="number" step="0.05" value="${keep.dz}" /></label></div>
    <div class="fe-row"><label>Längd<input id="ptL" type="number" step="0.05" placeholder="ur bib." value="${keep.L}" /></label><label>Bredd<input id="ptB" type="number" step="0.05" placeholder="ur bib." value="${keep.B}" /></label><label>Höjd<input id="ptH" type="number" step="0.05" placeholder="ur bib." value="${keep.H}" /></label></div>
    <label>Namn (frivilligt)<input id="ptName" type="text" value="${l3xyzEsc(keep.name)}" placeholder="t.ex. Plint" /></label>
    <div class="fe-row"><button type="button" data-pt="assign">Tilldela markerade</button><button type="button" data-pt="place" title="Lägger objekten i modellen på punkternas höjd (ersätter förra omgången)">📍 Placera i modellen</button></div>
    <button type="button" data-pt="unplace" class="fe-danger">Ta bort placerade objekt</button>
    <div class="fe-note">Fil: ${l3xyzEsc(set.file)} · format ${l3xyzEsc(set.format)} · ${set.pts.length} punkter. Hamnar punkterna fel: tryck ⇄ X/Y.</div>` : ""}
  </div></div></div>`;
  const b = el.querySelector(".fe-body"); if (b) b.scrollTop = was; l3xyzBind(el, set, groups);
}
function l3xyzBind(el, set, groups) {
  const q = s => el.querySelector(s), draft = () => (l3xyz.draft = { type: q("#ptType") ? q("#ptType").value : "", rot: q("#ptRot") ? q("#ptRot").value : "auto", dz: q("#ptDz") ? q("#ptDz").value : 0, L: q("#ptL") ? q("#ptL").value : "", B: q("#ptB") ? q("#ptB").value : "", H: q("#ptH") ? q("#ptH").value : "", name: q("#ptName") ? q("#ptName").value : "" });
  ["#ptType", "#ptRot", "#ptDz", "#ptL", "#ptB", "#ptH", "#ptName"].forEach(s => { const e = q(s); if (e) e.onchange = draft; });
  const fi = q("#ptFile"); if (fi) fi.onchange = async () => { for (const f of fi.files) { try { const s = await l3xyzImport(f); if (typeof l3Status === "function") l3Status(`${f.name}: ${s.pts.length} punkter (${s.format}).`); } catch (e) { if (typeof l3Status === "function") l3Status(`${f.name}: ${e.message}`, true); } } };
  const ss = q("#ptSet"); if (ss) ss.onchange = () => { l3xyz.cur = ss.value; l3xyz.sel.clear(); l3xyzRender(); l3xyzDraw(); };
  if (!set) return;
  const on = (id, f) => { const e = q(id); if (e) e.onchange = f; };
  on("#ptMode", e => { set.mode = e.target.value; set.assign = {}; l3xyz.sel.clear(); l3xyzSave(); }); on("#ptRad", e => { set.radius = Number(e.target.value) || 2; set.assign = {}; l3xyz.sel.clear(); l3xyzSave(); });
  on("#ptShow", e => { set.show = e.target.checked; l3xyzSave(); }); on("#ptLab", e => { set.labels = e.target.checked; l3xyzSave(); }); on("#ptSize", e => { set.size = Number(e.target.value) || 9; l3xyzSave(); });
  el.onclick = async e => {
    const b = e.target.closest("[data-pt]"); if (!b) return; const a = b.dataset.pt, k = b.dataset.k;
    if (a === "x") { l3xyz.open = false; l3xyzRender(); }
    else if (a === "chk") { if (b.checked) l3xyz.sel.add(k); else l3xyz.sel.delete(k); l3xyzDraw(); l3xyzRender(); }
    else if (a === "fly") { const g = groups.find(x => x.key === k); if (g) { l3xyz.sel.has(k) ? 0 : l3xyz.sel.add(k); l3xyzFly(g); l3xyzDraw(); l3xyzRender(); } }
    else if (a === "all") { groups.forEach(g => l3xyz.sel.add(g.key)); l3xyzDraw(); l3xyzRender(); }
    else if (a === "none") { l3xyz.sel.clear(); l3xyzDraw(); l3xyzRender(); }
    else if (a === "unas") { l3xyz.sel.clear(); groups.filter(g => !set.assign[g.key]).forEach(g => l3xyz.sel.add(g.key)); l3xyzDraw(); l3xyzRender(); }
    else if (a === "swap") { set.swap = !set.swap; set.assign = {}; l3xyzSave(); if (groups[0]) l3xyzFly(l3xyzGroups(set)[0]); }
    else if (a === "clr") { l3xyzAssign(set, [k], null); }
    else if (a === "assign") { const d = draft(); if (!l3xyz.sel.size) { l3Status("Markera positioner först (kryssrutorna).", true); return; } if (!d.type) { l3Status("Välj ett objekt.", true); return; } l3xyzAssign(set, [...l3xyz.sel], { type: d.type, L: Number(d.L) || 0, B: Number(d.B) || 0, H: Number(d.H) || 0, dz: d.dz, rot: d.rot, name: d.name.trim() }); l3Status(`${l3xyz.sel.size} positioner fick objektet. Tryck 📍 Placera i modellen.`); }
    else if (a === "place") { try { const n = l3xyzPlace(set); l3Status(n ? `${n} objekt placerade på punkterna.` : "Inga positioner har tilldelats ett objekt än.", !n); } catch (er) { l3Status(er.message, true); } }
    else if (a === "unplace") { if (!(set.placed || []).length || typeof uiConfirm !== "function" || await uiConfirm(`Ta bort de ${set.placed.length} objekt som placerats från ${set.name}?`)) { l3xyzUnplace(set); l3Status("Placerade objekt borttagna."); } }
    else if (a === "delset") { if (typeof uiConfirm !== "function" || await uiConfirm(`Ta bort punktfilen "${set.name}"? Objekt som placerats från den tas också bort.`)) { l3xyzUnplace(set, false); const d = l3xyzData(); d.sets = d.sets.filter(s => s !== set); l3xyz.cur = null; l3xyz.sel.clear(); l3xyzSave(); } }
  };
}
function l3xyzToggle(on = !l3xyz.open) { l3xyz.open = on; l3xyzRender(); if (on) l3xyzDraw(); }
function l3xyzBtn() {
  const host = document.getElementById("view3d"); if (!host) return; let b = document.getElementById("v3PtsBtn");
  if (!b) { b = document.createElement("button"); b.type = "button"; b.id = "v3PtsBtn"; b.className = "v3-bridge v3-rnb"; b.textContent = "📍 Punkter"; b.title = "Punktfiler (.pxy, .geo …): visa punkterna och välj objekt på varje punkt"; b.onclick = () => l3xyzToggle(); const ft = host.querySelector(".v3-foot"), st = document.getElementById("v3Status"); if (ft && st && st.parentNode === ft) ft.insertBefore(b, st); else host.appendChild(b); }
}
(function l3xyzBoot() { const tick = () => { if (document.getElementById("view3d") && typeof l3 !== "undefined" && l3 && l3.renderer) { l3xyzBtn(); if (l3xyzData().sets.length && !(l3.groups && l3.groups.pts)) l3xyzDraw(); } setTimeout(tick, 2500); }; setTimeout(tick, 1800); })();
