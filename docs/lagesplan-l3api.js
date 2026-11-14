/* Lägesplan – API mot 3D-editorn och en brygga till Claude (Victor 2026-11-14: "koppla Claude till vår 3d-editor … som Blender-MCP").
   Två delar:
   1) l3api – funktioner som läser och ändrar i den öppna 3D-editorn (objekt, ritade kroppar, biblioteksobjekt, etableringsobjekt som stängsel/ställning, kamera, skärmdump, ångra).
      Koordinater är projektets (samma som planens kalibrering). Allt som ändrar går att ångra (Ctrl+Z / l3api.call("undo")).
   2) Bryggan – en liten lokal server (tools/mcp/4d-bridge.mjs) som Claude Desktop/Claude Code startar som MCP-server. Sidan hämtar uppdrag från den (long-poll mot 127.0.0.1) när
      "🔌 Claude" är påslaget i 3D-vyn (eller ?bridge=8787 i adressen). Inget lämnar datorn, och bryggan startar inget i sidan – den bara lämnar uppdrag som sidan själv hämtar.
   Prefix l3api. */

const l3api = { methods: {}, conn: { on: false, port: 8787, err: "", n: 0, busy: false, loop: 0, last: "" }, VER: 1 };
const L3API_SIZE = 60000;   // tak för text i svaren (Claude ska få sammanfattningar, inte hela modellen)

const l3apiNum = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const l3apiPt = (p, n = 3) => { if (!Array.isArray(p) || p.length < 2) throw new Error("Punkt ska vara [x, y] eller [x, y, z] i projektets koordinater"); const o = p.slice(0, n).map(Number); if (o.some(v => !Number.isFinite(v))) throw new Error("Punkt innehåller icke-tal"); while (o.length < n) o.push(0); return o; };
const l3apiRound = v => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v);
function l3apiReady() { if (typeof l3 === "undefined" || !l3 || !l3.renderer || typeof placements === "undefined") throw new Error("3D-editorn är inte öppen – öppna 3D-vyn (knappen 3D) först."); }
function l3apiById(id) { const p = placements.find(q => q.id === id); if (!p) throw new Error(`Hittar inget objekt med id ${id}`); return p; }
function l3apiBox(p) { const g = l3.placeMeshes && l3.placeMeshes.get(p.id); if (!g) return null; const b = new THREE.Box3().setFromObject(g); if (b.isEmpty()) return null; return [[b.min.x + l3.O[0], b.min.y + l3.O[1], b.min.z + l3.O[2]].map(l3apiRound), [b.max.x + l3.O[0], b.max.y + l3.O[1], b.max.z + l3.O[2]].map(l3apiRound)]; }
function l3apiBrief(p) {
  const kind = String(p.type || "").startsWith("mod:") ? "ritat" : String(p.type || "").startsWith("sm:") ? "smart" : String(p.type || "").startsWith("model:") ? "modell" : "bibliotek";
  return { id: p.id, type: p.type, kind, name: p.name, x: p.x, y: p.y, z: p.z, rot: p.rot || 0, L: p.L || undefined, B: p.B || undefined, H: p.H || undefined, color: p.color, bbox: l3apiBox(p), hidden: !!(l3.hidden && l3.hidden.has(p.id)) || undefined };
}
function l3apiAfter(p, sel = true) { if (sel && p) l3SelectIds([p.id]); l3Changed(); }

/* ---- Läsa ---- */
l3api.methods.status = () => {
  l3apiReady();
  const cam = l3.camera.position, t = l3.orbit.target;
  return {
    editor: "4D-planering 3D-editor", api: l3api.VER, project: typeof projectId !== "undefined" ? projectId : null,
    origin: l3.O.map(l3apiRound), note: "Alla koordinater i API:t är projektets (absoluta) koordinater i meter.",
    camera: { position: [cam.x + l3.O[0], cam.y + l3.O[1], cam.z + l3.O[2]].map(l3apiRound), target: [t.x + l3.O[0], t.y + l3.O[1], t.z + l3.O[2]].map(l3apiRound) },
    tool: l3.tool, selected: [...(l3.sel || [])],
    counts: { placements: placements.length, siteItems: typeof siteItems !== "undefined" ? siteItems.length : 0, models: typeof l3b !== "undefined" ? l3b.models.length : 0, pointClouds: typeof l3pc !== "undefined" ? l3pc.clouds.length : 0 },
    calibrated: !!(typeof plan !== "undefined" && plan && plan.calib)
  };
};
l3api.methods.list_objects = (a = {}) => {
  l3apiReady();
  const q = String(a.name || "").toLowerCase(), t = String(a.type || ""), lim = Math.max(1, Math.min(500, l3apiNum(a.limit, 100)));
  const all = placements.filter(p => (!q || String(p.name || "").toLowerCase().includes(q)) && (!t || String(p.type || "").includes(t)));
  return { total: all.length, shown: Math.min(all.length, lim), objects: all.slice(0, lim).map(l3apiBrief) };
};
l3api.methods.get_object = a => {
  l3apiReady(); const p = l3apiById(a.id), o = { ...l3apiBrief(p), props: p.f || undefined, pts: p.pts || undefined, dz: p.dz || undefined };
  if (p.m) { o.shape = { k: p.m.k, depth: p.m.d, loops: p.m.loops ? p.m.loops.map(l => l.length + " punkter") : undefined, points: p.m.pts ? p.m.pts.length : undefined }; if (typeof modDims === "function") { try { o.dims = modDims(p); } catch (e) { /* utan mått */ } } }
  return o;
};
l3api.methods.list_library = () => {
  const out = [];
  if (typeof PLACE_LIB !== "undefined") Object.keys(PLACE_LIB).forEach(k => { const l = PLACE_LIB[k]; if (!l.hidden) out.push({ type: k, label: l.label, group: l.group, L: l.L, B: l.B, H: l.H }); });
  if (typeof SM !== "undefined") Object.keys(SM).forEach(k => { const l = SM[k]; if (!l.hidden) out.push({ type: "sm:" + k, label: l.label, group: l.group, L: l.L, B: l.B, H: l.H, fields: (l.fields || []).map(f => f[0]).slice(0, 12) }); });
  return out;
};
l3api.methods.list_site_items = (a = {}) => {
  if (typeof siteItems === "undefined") throw new Error("Lägesplanens etableringsobjekt är inte inlästa");
  const t = String(a.type || ""), all = siteItems.filter(x => !t || x.type === t).filter(x => !["ortho", "layer", "objview"].includes(x.type));
  return { total: all.length, items: all.slice(0, 200).map(x => ({ id: x.id, type: x.type, name: x.name, layer: x.layer, pts: x.pts || undefined, cx: x.cx, cy: x.cy, w: x.w, h: x.h, extra: x.wid ? { breddningar: x.wid.length } : undefined })) };
};

/* ---- Skapa (ritade kroppar) ---- */
function l3apiAnchoredSolid(loop2, anchor, height, name, color) {
  const L = MG.ccw(loop2).map(q => [MG.r3(q[0]), MG.r3(q[1])]);
  if (Math.abs(MG.area2(L)) < 1e-6) throw new Error("Konturen har ingen yta");
  return modCreate({ k: "solid", pl: { o: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0] }, loops: [L], d: MG.r3(height) }, anchor, { name, color });
}
l3api.methods.create_box = a => {
  l3apiReady(); const L = l3apiNum(a.length, 0), W = l3apiNum(a.width, 0), H = l3apiNum(a.height, 0);
  if (!(L > 0 && W > 0 && H > 0)) throw new Error("length, width och height måste vara > 0 (meter)");
  const c = l3apiPt([a.x, a.y, a.z || 0]);
  const p = l3apiAnchoredSolid(MG.rect2([-L / 2, -W / 2], [L / 2, W / 2]), c, H, a.name || "Låda", a.color);
  if (a.rot) { p.rot = l3apiNum(a.rot, 0); l3RebuildOne(p); }
  l3apiAfter(p); return l3apiBrief(p);
};
l3api.methods.create_prism = a => {
  l3apiReady(); const P = (a.points || []).map(q => l3apiPt(q, 2)), H = l3apiNum(a.height, 0);
  if (P.length < 3 || !(H > 0)) throw new Error("points (minst 3 hörn [x,y]) och height > 0 krävs");
  const z = l3apiNum(a.z, 0), anchor = [P[0][0], P[0][1], z];
  const p = l3apiAnchoredSolid(P.map(q => [q[0] - anchor[0], q[1] - anchor[1]]), anchor, H, a.name || "Kropp", a.color);
  l3apiAfter(p); return l3apiBrief(p);
};
l3api.methods.create_cylinder = a => {
  l3apiReady(); const r = l3apiNum(a.radius, 0), H = l3apiNum(a.height, 0);
  if (!(r > 0 && H > 0)) throw new Error("radius och height måste vara > 0 (meter)");
  const c = l3apiPt([a.x, a.y, a.z || 0]), p = l3apiAnchoredSolid(MG.circle2([0, 0], r, 48), c, H, a.name || "Cylinder", a.color);
  l3apiAfter(p); return l3apiBrief(p);
};
l3api.methods.create_polyline = a => {
  l3apiReady(); const P = (a.points || []).map(q => l3apiPt(q, 3));
  if (P.length < 2) throw new Error("points (minst 2 punkter [x,y,z]) krävs");
  const anchor = P[0], p = modCreate({ k: "curve", pts: P.map(q => MG.round3(MG.sub(q, anchor))), closed: !!a.closed }, anchor, { name: a.name || "Linje", color: a.color });
  l3apiAfter(p); return l3apiBrief(p);
};

/* ---- Skapa (bibliotek: ställning, kran, upplag, bod …) ---- */
l3api.methods.place_library = a => {
  l3apiReady(); const type = String(a.type || ""), lib = typeof placeLib === "function" ? placeLib(type) : null;
  if (!lib) throw new Error(`Okänd bibliotekstyp "${type}" – se list_library`);
  const p = placeNew(type, l3apiPt([a.x, a.y, a.z || 0]));
  if (a.name) p.name = String(a.name);
  ["L", "B", "H", "R"].forEach(k => { if (a[k] != null && Number(a[k]) > 0) p[k] = Number(a[k]); });
  if (a.rot != null) p.rot = l3apiNum(a.rot, 0);
  if (a.color) p.color = String(a.color);
  if (a.points && lib.path || a.points && p.pts) p.pts = a.points.map(q => l3apiPt(q, 3));
  if (a.fields && typeof a.fields === "object") p.f = { ...(p.f || {}), ...a.fields };
  placeSnapshot(); placements.push(p); placeTouch(p); l3AddPlacementMesh(p); l3apiAfter(p); return l3apiBrief(p);
};

/* ---- Skapa (lägesplanens etableringsobjekt – syns i 2D och 3D) ---- */
l3api.methods.add_site_item = async a => {
  if (typeof siteItems === "undefined" || typeof SITE_KINDS === "undefined") throw new Error("Lägesplanen är inte inläst");
  if (!plan || !plan.calib) throw new Error("Planen är inte kalibrerad mot 3D (📐) – etableringsobjekt behöver det");
  const kind = String(a.type || ""); if (!SITE_KINDS[kind] || ["ortho", "layer"].includes(kind)) throw new Error(`Okänd typ "${kind}". Giltiga: ${Object.keys(SITE_KINDS).filter(k => !["ortho", "layer", "objview"].includes(k)).join(", ")}`);
  const pts = (a.points || []).map(q => l3apiPt(q, 2)), r3 = v => Math.round(v * 1000) / 1000;
  const min = { fence: 2, barrier: 3, route: 2, scaffold: 2, shed: 2, storage: 2 }[kind] || 1;
  if (pts.length < min) throw new Error(`${kind} behöver minst ${min} punkter`);
  const rec = { id: ghNewId(), type: kind, name: "", layer: a.layer || (document.getElementById("activeLayer") || {}).value || undefined, created_at: new Date().toISOString(), by: (settings && settings.userName) || null };
  if (kind === "symbol") { const sy = SYMBOLS[a.symbol] || { w: 3, h: 6, label: "Symbol" }; Object.assign(rec, { sym: a.symbol, cx: r3(pts[0][0]), cy: r3(pts[0][1]), w: sy.w, h: sy.h, rot: 0, name: sy.label }); }
  else if (isRect(rec)) { const [p, q] = pts; Object.assign(rec, { cx: r3((p[0] + q[0]) / 2), cy: r3((p[1] + q[1]) / 2), w: r3(Math.abs(q[0] - p[0])), h: r3(Math.abs(q[1] - p[1])), rot: 0 }); }
  else rec.pts = pts.map(p => [r3(p[0]), r3(p[1])]);
  if (kind === "note") rec.text = String(a.text || a.name || "");
  if (kind === "crane") Object.assign(rec, { radius: 40, capacity: "", name: `Kran ${siteItems.filter(x => x.type === "crane").length + 1}` });
  if (kind === "gate") Object.assign(rec, { w: 5, rot: 0 });
  if (kind === "route") Object.assign(rec, { w: 4, twoWay: false });
  if (kind === "scaffold") Object.assign(rec, { w: 0.73, h: 8, fack: 2.57, name: "Ställning" });
  const allowed = ["name", "w", "h", "fack", "lifts", "radius", "capacity", "twoWay", "color", "dash", "weight", "text", "from", "to", "rot", "wid"];
  Object.keys(a.props || {}).forEach(k => { if (allowed.includes(k)) rec[k] = a.props[k]; });
  if (a.name) rec.name = String(a.name);
  await saveSiteItem(rec, false, { prev: null });
  if (typeof l3sRefresh === "function") l3sRefresh(0);
  return { id: rec.id, type: rec.type, name: rec.name, pts: rec.pts, hint: kind === "scaffold" ? "Breddningar läggs till med props.wid = [{i: sträcka (0..), a: från (m), b: till (m), d: utbyggnad (m), s: 1|-1 sida}]" : undefined };
};
l3api.methods.update_site_item = async a => {
  const x = siteItems.find(q => q.id === a.id); if (!x) throw new Error(`Hittar inget etableringsobjekt med id ${a.id}`);
  const next = { ...x, updated_at: new Date().toISOString() }, allowed = ["name", "w", "h", "fack", "lifts", "radius", "capacity", "twoWay", "color", "dash", "weight", "text", "from", "to", "rot", "wid", "layer"];
  Object.keys(a.props || {}).forEach(k => { if (allowed.includes(k)) next[k] = a.props[k]; });
  if (Array.isArray(a.points)) { const q = a.points.map(p => l3apiPt(p, 2)); if (next.pts) next.pts = q; }
  await saveSiteItem(next, false, { prev: x }); if (typeof l3sRefresh === "function") l3sRefresh(0);
  return { id: next.id, type: next.type, name: next.name };
};
l3api.methods.delete_site_item = async a => {
  const x = siteItems.find(q => q.id === a.id); if (!x) throw new Error(`Hittar inget etableringsobjekt med id ${a.id}`);
  await saveSiteItem(x, true); if (typeof l3sRefresh === "function") l3sRefresh(0); return { deleted: a.id };
};

/* ---- Ändra och ta bort ---- */
l3api.methods.update_object = a => {
  l3apiReady(); const p = l3apiById(a.id); placeSnapshot();
  if (a.name != null) p.name = String(a.name);
  if (a.color) p.color = String(a.color);
  if (a.x != null || a.y != null || a.z != null) { const dx = a.x != null ? Number(a.x) - p.x : 0, dy = a.y != null ? Number(a.y) - p.y : 0, dz = a.z != null ? Number(a.z) - p.z : 0; placeShift(p, dx, dy, dz); }
  if (a.rot != null) p.rot = l3apiNum(a.rot, 0);
  ["L", "B", "H", "R"].forEach(k => { if (a[k] != null && Number(a[k]) > 0 && !p.m) p[k] = Number(a[k]); });
  if (a.fields && typeof a.fields === "object") p.f = { ...(p.f || {}), ...a.fields };
  placeTouch(p); l3RebuildOne(p); l3apiAfter(p); return l3apiBrief(p);
};
l3api.methods.delete_objects = a => {
  l3apiReady(); const ids = (a.ids || []).filter(id => placements.some(p => p.id === id));
  if (!ids.length) throw new Error("Inga av id:na hittades"); l3SelectIds(ids); l3DeleteSel(); return { deleted: ids.length };
};
l3api.methods.duplicate_object = a => {
  l3apiReady(); const p = l3apiById(a.id); placeSnapshot();
  const step = a.dx != null || a.dy != null ? [Number(a.dx) || 0, Number(a.dy) || 0] : null, [c] = placeCopies(p, 1, step ? Math.hypot(step[0], step[1]) : placeExtent(p)[0] + 0.5, !step);
  if (step) placeShift(c, step[0] - (c.x - p.x), step[1] - (c.y - p.y), 0);
  placements.push(c); placeTouch(c); l3AddPlacementMesh(c); l3apiAfter(c); return l3apiBrief(c);
};

/* ---- Vyn ---- */
l3api.methods.select = a => { l3apiReady(); l3SelectIds(a.ids || []); return { selected: [...l3.sel] }; };
l3api.methods.fly_to = a => {
  l3apiReady(); let c, d = l3apiNum(a.distance, 0);
  if (a.id) { const p = l3apiById(a.id), g = l3.placeMeshes.get(p.id), b = g ? new THREE.Box3().setFromObject(g) : null; if (!b || b.isEmpty()) throw new Error("Objektet har ingen geometri att flyga till"); c = b.getCenter(new THREE.Vector3()); d = d || Math.max(6, b.getSize(new THREE.Vector3()).length() * 1.4); }
  else if (a.point) { const q = l3apiPt(a.point); c = new THREE.Vector3(q[0] - l3.O[0], q[1] - l3.O[1], q[2] - l3.O[2]); d = d || 30; }
  else throw new Error("Ange id eller point");
  l3FlyTo(c, d, a.top ? new THREE.Vector3(0.001, 0.001, 1) : undefined, 0); l3Render(); return { ok: true };
};
l3api.methods.set_camera = a => {
  l3apiReady(); const p = l3apiPt(a.position), t = l3apiPt(a.target || [p[0], p[1] + 10, p[2] - 5]);
  l3.camera.position.set(p[0] - l3.O[0], p[1] - l3.O[1], p[2] - l3.O[2]); l3.orbit.target.set(t[0] - l3.O[0], t[1] - l3.O[1], t[2] - l3.O[2]); l3.orbit.update(); l3Render(); return { ok: true };
};
l3api.methods.screenshot = a => {
  l3apiReady(); if (typeof l3vmFrame === "function") l3vmFrame(); if (typeof l3pcRenderScene === "function") l3pcRenderScene(); else l3.renderer.render(l3.scene, l3.camera);   // ritas direkt i samma steg som bilden läses (annars är canvasen tom)
  const cv = l3.renderer.domElement, w0 = cv.width, h0 = cv.height, mw = Math.max(200, Math.min(1600, l3apiNum(a.width, 1024))), k = Math.min(1, mw / w0);
  const out = document.createElement("canvas"); out.width = Math.round(w0 * k); out.height = Math.round(h0 * k); const ctx = out.getContext("2d"); ctx.drawImage(cv, 0, 0, out.width, out.height);
  return { image: { mime: "image/png", data: out.toDataURL("image/png").split(",")[1] }, size: [out.width, out.height] };
};
l3api.methods.undo = () => { l3apiReady(); l3Undo(); return { ok: true }; };
l3api.methods.redo = () => { l3apiReady(); if (typeof l3Redo === "function") l3Redo(); return { ok: true }; };

/* ---- Fri JavaScript (utväg när verktygen inte räcker) – kräver ditt godkännande i sidan varje gång ---- */
l3api.methods.eval_js = async a => {
  l3apiReady(); const code = String(a.code || ""); if (!code.trim()) throw new Error("code saknas");
  const ok = typeof uiConfirm === "function" ? await uiConfirm(`Claude vill köra JavaScript i 3D-editorn${a.reason ? ` (${a.reason})` : ""}:\n\n${code.slice(0, 1500)}${code.length > 1500 ? "\n…" : ""}\n\nTillåt?`) : false;
  if (!ok) throw new Error("Du avböjde att köra koden.");
  const AsyncFn = Object.getPrototypeOf(async function () {}).constructor, r = await new AsyncFn("l3", "THREE", "placements", code)(l3, THREE, placements);
  try { return { result: JSON.parse(JSON.stringify(r === undefined ? null : r)) }; } catch (e) { return { result: String(r) }; }
};

/* ---- Anropa ---- */
l3api.call = async function (method, params) {
  const f = l3api.methods[method];
  if (!f) return { ok: false, error: `Okänd metod "${method}". Metoder: ${Object.keys(l3api.methods).join(", ")}` };
  try {
    const r = await f(params || {});
    const s = JSON.stringify(r); if (s && s.length > L3API_SIZE && !(r && r.image)) return { ok: false, error: `Svaret blev för stort (${s.length} tecken) – begränsa med limit/filter.` };
    return { ok: true, result: r };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
};

/* ---- Bryggan (long-poll mot 127.0.0.1) ---- */
const l3apiBase = () => `http://127.0.0.1:${l3api.conn.port}`;
async function l3apiLoop(token) {
  const c = l3api.conn;
  while (c.on && c.loop === token) {
    try {
      const r = await fetch(l3apiBase() + "/next?wait=20", { cache: "no-store" });
      c.err = ""; if (r.status === 204) continue;
      const cmd = await r.json(); c.busy = true; c.last = cmd.method; l3apiChip();
      const res = await l3api.call(cmd.method, cmd.params); c.n++;
      await fetch(l3apiBase() + "/result", { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ id: cmd.id, ...res }) });
      c.busy = false; l3apiChip();
    } catch (e) { c.err = "Ingen kontakt med bryggan (kör den?)"; c.busy = false; l3apiChip(); await new Promise(r => setTimeout(r, 2500)); }
  }
}
function l3apiConnect(port) {
  const c = l3api.conn; if (port) c.port = Number(port) || 8787; if (c.on) return; c.on = true; c.loop++; l3apiLoop(c.loop); l3apiChip();
  try { localStorage.setItem("lagesplan-l3api", "1"); } catch (e) { /* privat läge */ }
}
function l3apiDisconnect() { const c = l3api.conn; c.on = false; c.loop++; c.busy = false; c.err = ""; l3apiChip(); try { localStorage.setItem("lagesplan-l3api", "0"); } catch (e) { /* privat läge */ } }
function l3apiChip() {
  const host = document.getElementById("view3d"), c = l3api.conn; if (!host) return;
  let el = document.getElementById("v3Bridge");
  if (!el) {
    el = document.createElement("button"); el.type = "button"; el.id = "v3Bridge"; host.appendChild(el);
    el.onclick = () => { if (l3api.conn.on) l3apiDisconnect(); else l3apiConnect(); };
  }
  el.className = "v3-bridge" + (c.on ? (c.err ? " err" : " on") : ""); el.textContent = c.on ? (c.busy ? "🔌 Claude arbetar…" : c.err ? "🔌 Claude – väntar på bryggan" : `🔌 Claude kopplad${c.n ? " · " + c.n : ""}`) : "🔌 Claude";
  el.title = c.on ? "Claude är kopplad till 3D-editorn via bryggan på datorn. Klicka för att koppla från." : "Koppla Claude till 3D-editorn (kräver att bryggan tools/mcp/4d-bridge.mjs körs på datorn)";
}
(function l3apiBoot() {
  const q = new URLSearchParams(location.search).get("bridge");
  const tick = () => { if (document.getElementById("view3d") && typeof l3 !== "undefined" && l3 && l3.renderer) { l3apiChip(); if (q && !l3api.conn.on) l3apiConnect(q); else { let pref = false; try { pref = localStorage.getItem("lagesplan-l3api") === "1"; } catch (e) { /* utan lagring */ } if (pref && !l3api.conn.on) l3apiConnect(); } } else setTimeout(tick, 1500); };
  setTimeout(tick, 1500);
})();
