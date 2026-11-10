/* 3D-vyn – Körvägar: fordon och sparade körvägar kopplade till tidplanen (Victor 2026-11-10: "byta fordon … ett block under kommentarer och mått där jag kan spara
   körvägar för att simulera dem och koppla till tidplan om jag vill att det ska gå fordon under vissa datum").

   • Fordon: lastbil, hjullastare, grävmaskin (band) eller mobilkran – samma fordon som i Gå-läget. Väljs i byggvägspanelen och per sparad körväg.
   • Spara: i byggvägspanelen "💾 Spara körväg" sparar mittlinjen, inställningarna och den uträknade banan i projektet (plan_routes.json). Redigera öppnar vägen igen.
   • Blocket "Körvägar" (under Kommentarer och Mått): ▶ kör vägen med valt fordon, antal fordon och fart, visa linjen i 3D, zooma, redigera, ta bort.
   • Tidplan: koppla en körväg till en aktivitet (eller skriv datum). Då kör fordonen bara de datumen – när datumreglaget i 3D-vyn står inom perioden syns de och kör
     slingan, annars är de borta. Aktiviteten följer tidplanen (ändras aktivitetens datum ändras körvägens). */

const L3RT_VEH = {
  truck: { label: "Lastbil", f: 3.9, r: -2.1, make: () => l3vTruck() },
  loader: { label: "Hjullastare", f: 1.7, r: -1.65, make: () => l3vLoader() },
  excavator: { label: "Grävmaskin", f: 1.6, r: -1.6, make: () => l3vExcavator() },
  crane: { label: "Mobilkran", f: 4.4, r: -1.9, make: () => l3vCrane() },
};
const l3rtVeh = k => L3RT_VEH[k] || L3RT_VEH.truck;
const l3rt = { list: [], loaded: false, loading: false, drivers: new Map(), sim: new Set(), raf: 0, last: 0, at: "", lines: null, saveT: new Map() };
const l3rtPath = () => `projects/${encodeURIComponent(projectId)}/plan_routes.json`;
const l3rtR3 = v => Math.round(v * 1000) / 1000;
function l3rtCtl(kind) { const base = typeof L3W_CTL0 !== "undefined" && L3W_CTL0[kind] ? L3W_CTL0[kind] : {}; return { ...base }; }

/* ---- Fordonet placeras på banan (används av både byggvägspanelen och körvägarna) ----
   D: { grp, truck, s, travel, v, t, prev } · st: [{x, y, z, s}] · returnerar { cur, L, pos, ended }. */
function l3rtPlace(D, st, kind, dt, kmh, moving, loop) {
  const V = l3rtVeh(kind), L = st[st.length - 1].s;
  const cur = l3rAt(st, D.s + (V.f + V.r) / 2), up = Math.max(0, cur.g), v = Math.max(3, Number(kmh) || 20) / 3.6 * Math.max(0.35, 1 - 3 * up);   // uppför: långsammare
  D.v += (v - D.v) * Math.min(1, dt * 3); if (moving) { D.s += D.v * dt; D.travel += D.v * dt; }
  let ended = false; if (D.s > L - 0.5) { if (loop) { D.s = 0; D.prev = null; } else { D.s = L - 0.5; ended = true; } }
  const F = l3rAt(st, D.s + V.f), R = l3rAt(st, D.s + V.r), d2 = Math.hypot(F.x - R.x, F.y - R.y);
  const yaw = d2 > 0.5 ? Math.atan2(F.y - R.y, F.x - R.x) : l3rAt(st, D.s).yaw, pitch = Math.atan2(F.z - R.z, Math.max(0.5, d2)), f = (V.f - V.r) > 0 ? -V.r / (V.f - V.r) : 0.5, O = l3.O;
  const px = R.x + (F.x - R.x) * f - O[0], py = R.y + (F.y - R.y) * f - O[1], pz = R.z + (F.z - R.z) * f - O[2];
  const g = D.grp; g.position.set(px, py, pz); g.rotation.set(0, 0, 0); g.rotation.order = "ZYX"; g.rotation.z = yaw; g.rotation.y = -pitch;
  const a1 = l3rAt(st, D.s + 1).yaw, a2 = l3rAt(st, D.s + 9).yaw, k = l3rAng(a2 - a1) / 8, steer = Math.max(-1, Math.min(1, Math.atan(Math.max(1.5, V.f - V.r) * k) / 0.5));
  D.t = (D.t || 0) + dt;
  D.truck.update({ dt, t: D.t, travel: D.travel, steer, brake: !moving, rev: false, work: 0, moving: !!moving && D.v > 0.1, speed: D.v, ctl: D.ctl || (D.ctl = l3rtCtl(kind)) });
  return { cur, L, pos: [px, py, pz], ended };
}
function l3rtDriver(kind, route, offset) {
  const V = l3rtVeh(kind); if (typeof V.make !== "function") return null; let o; try { o = V.make(); } catch (e) { console.warn("Fordon", e); return null; }
  const g = new THREE.Group(); g.name = "routeveh"; g.add(o.g); l3.scene.add(g);
  return { grp: g, truck: o, kind, route, s: offset || 0, travel: 0, v: 0, t: 0, prev: null, ctl: l3rtCtl(kind) };
}

/* ---- Spara och läsa ---- */
const l3rtStOf = r => r._st || (r._st = (r.st || []).map(a => ({ x: a[0], y: a[1], z: a[2], s: a[3] })));
async function l3rtLoad() {
  if (l3rt.loading) return; l3rt.loading = true;
  try { const arr = await ghReadJSON(token, l3rtPath()); l3rt.list = Array.isArray(arr) ? arr : []; } catch (e) { console.warn("Kunde inte läsa plan_routes.json", e); }
  l3rt.loaded = true; l3rt.loading = false; l3rtSync(); if (typeof l3kRenderTab === "function") l3kRenderTab();
}
function l3rtWrite(r) {
  const rec = { ...r }; delete rec._st;
  return ghWriteJSON(token, l3rtPath(), arr => [...(Array.isArray(arr) ? arr : []).filter(x => x.id !== r.id), rec], "3D: körväg sparad").catch(e => { l3Status("Kunde inte spara körvägen i projektet: " + e.message, true); });
}
function l3rtWriteSoon(r) { clearTimeout(l3rt.saveT.get(r.id)); l3rt.saveT.set(r.id, setTimeout(() => l3rtWrite(r), 700)); }
function l3rtRemove(id) {
  l3rt.list = l3rt.list.filter(x => x.id !== id); l3rt.sim.delete(id); l3rtSync();
  ghWriteJSON(token, l3rtPath(), arr => (Array.isArray(arr) ? arr : []).filter(x => x.id !== id), "3D: körväg borttagen").catch(e => l3Status("Kunde inte ta bort körvägen ur projektet: " + e.message, true));
}
/* Från byggvägspanelen: ny körväg, eller uppdatera den som redigeras. */
function l3rtSaveRoad(c) {
  if (!c || !c.st || !c.res) { l3Status("Vänta tills vägen är räknad.", true); return null; }
  const spec = JSON.parse(JSON.stringify(c.spec)), st = c.st.map(p => [l3rtR3(p.x), l3rtR3(p.y), l3rtR3(p.z), l3rtR3(p.s)]), res = { len: c.res.len, cut: c.res.cut, fill: c.res.fill, maxG: c.res.maxG };
  let r = c.routeId && l3rt.list.find(x => x.id === c.routeId);
  if (r) { Object.assign(r, { pts: c.pts.map(p => p.slice()), spec, st, res, vehicle: spec.vehicle || r.vehicle || "truck", speed: Number(spec.speed) || r.speed || 20 }); delete r._st; }
  else {
    r = { id: ghNewId(), name: `Körväg ${l3rt.list.length + 1}`, pts: c.pts.map(p => p.slice()), spec, st, res, vehicle: spec.vehicle || "truck", speed: Number(spec.speed) || 20, count: 1, show: true, enabled: true, color: "#f97316", activity: null, start: null, end: null, created_at: new Date().toISOString(), by: (typeof settings !== "undefined" && settings.userName) || null };
    l3rt.list.push(r); c.routeId = r.id;
  }
  l3rtWrite(r); l3rtSync(); if (typeof l3kRenderTab === "function") l3kRenderTab();
  l3Toast(`Körvägen "${r.name}" sparad – finns under Kommentarer och mått → Körvägar.`); return r;
}
function l3rtEdit(id) {
  const r = l3rt.list.find(x => x.id === id); if (!r) return;
  l3SetPref("measure", "road"); l3SetTool("measure");
  l3roadOpen({ routeId: r.id, pts: r.pts.map(p => p.slice()), spec: { ...JSON.parse(JSON.stringify(r.spec || {})), vehicle: r.vehicle, speed: r.speed, widen: (r.spec && r.spec.widen) || [] }, res: null, geom: null, st: null, busy: "", err: "" });
}

/* ---- Tidplanen och datum ---- */
const l3rtAt = () => (typeof $ === "function" && $("dateInput") && $("dateInput").value) || (typeof todayIso === "function" ? todayIso() : "");
function l3rtDates(r) {   // aktiviteten följer tidplanen
  if (r.activity && typeof items !== "undefined" && Array.isArray(items)) {
    const its = items.filter(it => String(it.activity || "").trim() === r.activity && (it.start_date || it.startDate));
    if (its.length) { const s = its.map(it => String(it.start_date || it.startDate).slice(0, 10)).sort(), e = its.map(it => String(it.end_date || it.endDate || it.start_date || it.startDate).slice(0, 10)).sort(); return { start: s[0], end: e[e.length - 1], linked: true }; }
  }
  return { start: r.start || null, end: r.end || null, linked: false };
}
function l3rtShouldRun(r, at) {
  if (l3rt.sim.has(r.id)) return true; if (r.enabled === false) return false;
  const d = l3rtDates(r); return !!(d.start && d.end && at >= d.start && at <= d.end);
}
function l3rtActivities() { const set = new Set(); if (typeof items !== "undefined" && Array.isArray(items)) items.forEach(it => { const a = String(it.activity || "").trim(); if (a && set.size < 600) set.add(a); }); return [...set].sort((a, b) => a.localeCompare(b, "sv")); }

/* Rätt fordon på rätt körvägar för valt datum. */
function l3rtSync() {
  if (!l3 || !l3.scene) return; const at = l3rtAt(); l3rt.at = at;
  const want = new Map(); l3rt.list.forEach(r => { if (l3rtShouldRun(r, at) && (r.st || []).length > 1) want.set(r.id, r); });
  [...l3rt.drivers.keys()].forEach(k => { const [id] = k.split("#"); const r = want.get(id); const idx = Number(k.split("#")[1]); if (!r || idx >= Math.max(1, Math.min(8, Number(r.count) || 1)) || l3rt.drivers.get(k).kind !== (r.vehicle || "truck")) { const d = l3rt.drivers.get(k); if (d && d.grp) l3.scene.remove(d.grp); l3rt.drivers.delete(k); } });
  want.forEach((r, id) => { const n = Math.max(1, Math.min(8, Number(r.count) || 1)), st = l3rtStOf(r), L = st[st.length - 1].s;
    for (let i = 0; i < n; i++) { const key = id + "#" + i; if (!l3rt.drivers.has(key)) { const d = l3rtDriver(r.vehicle || "truck", r, (L / n) * i); if (d) l3rt.drivers.set(key, d); } } });
  l3rtLines(); l3rtUi();
  if (l3rt.drivers.size && !l3rt.raf) { l3rt.last = 0; l3rt.raf = requestAnimationFrame(l3rtLoop); }
  if (typeof l3Render === "function") l3Render();
}
function l3rtLoop(now) {
  if (!l3rt.drivers.size) { l3rt.raf = 0; return; }
  const dt = Math.min(0.1, l3rt.last ? (now - l3rt.last) / 1000 : 0.016); l3rt.last = now;
  l3rt.drivers.forEach(D => { const r = D.route, st = l3rtStOf(r); if (st.length > 1) l3rtPlace(D, st, D.kind, dt, r.speed || 20, true, true); });
  if (l3rt.hiddenAnim !== true && typeof l3Render === "function") l3Render(); l3rt.raf = requestAnimationFrame(l3rtLoop);
}
function l3rtLines() {
  if (!l3.groups.routes) { l3.groups.routes = new THREE.Group(); l3.groups.routes.name = "routes"; l3.scene.add(l3.groups.routes); }
  const g = l3.groups.routes; l3Clear(g); const O = l3.O, at = l3rtAt();
  l3rt.list.forEach(r => { if (r.show === false || (r.st || []).length < 2) return; const act = l3rtShouldRun(r, at), col = new THREE.Color(r.color || "#f97316");
    const pts = l3rtStOf(r).map(p => new THREE.Vector3(p.x - O[0], p.y - O[1], p.z - O[2] + 0.25)), l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: act ? 0.95 : 0.4, depthTest: false }));
    l.renderOrder = 11; l.userData.noHit = true; l.raycast = () => {}; g.add(l); });
}

/* ---- Blocket under Kommentarer och Mått ---- */
const l3rtUiState = { shut: false };
function l3rtTabHtml() {
  if (!l3rt.loaded && !l3rt.loading && typeof projectId !== "undefined") l3rtLoad();
  const esc = typeof escHtml === "function" ? escHtml : s => String(s), at = l3rtAt(), shut = l3Prefs().rtShut === true, acts = l3rtActivities();
  const rows = l3rt.list.map(r => {
    const d = l3rtDates(r), run = l3rtShouldRun(r, at), sim = l3rt.sim.has(r.id), dates = d.start && d.end;
    return `<div class="v3-rt ${run ? "on" : ""}" data-rtid="${esc(r.id)}"><div class="v3-rt-top"><i style="background:${esc(r.color || "#f97316")}"></i><input type="text" class="v3-rt-n" data-rtname value="${esc(r.name)}" title="Namn på körvägen">
        <button type="button" class="v3-ic" data-rtsim title="${sim ? "Stoppa körningen" : "Kör vägen nu (oavsett datum)"}">${sim ? "⏸" : "▶"}</button><button type="button" class="v3-ic" data-rtgo title="Zooma till körvägen">⌖</button><button type="button" class="v3-ic" data-rtedit title="Öppna körvägen för att ändra den">✎</button><button type="button" class="v3-ic" data-rtdel title="Ta bort">🗑</button></div>
      <div class="v3-rt-o"><select data-rtveh title="Fordon">${Object.entries(L3RT_VEH).map(([k, v]) => `<option value="${k}" ${(r.vehicle || "truck") === k ? "selected" : ""}>${v.label}</option>`).join("")}</select>
        <label title="Antal fordon på körvägen">× <input type="number" data-rtcnt value="${Math.max(1, Number(r.count) || 1)}" min="1" max="8"></label><label title="Fart i km/h på plan väg"><input type="number" data-rtspd value="${Number(r.speed) || 20}" min="3" max="60"> km/h</label>
        <label title="Visa körvägens linje i 3D"><input type="checkbox" data-rtshow ${r.show !== false ? "checked" : ""}> linje</label><input type="color" data-rtcol value="${esc(r.color || "#f97316")}" title="Färg på linjen"></div>
      <div class="v3-rt-s"><input type="text" data-rtact list="v3RtActs" placeholder="Koppla till aktivitet i tidplanen …" value="${esc(r.activity || "")}" title="Skriv eller välj en aktivitet – fordonen kör då aktivitetens datum"><input type="date" data-rtd0 value="${esc(d.start || "")}" ${d.linked ? "disabled" : ""} title="Från"><input type="date" data-rtd1 value="${esc(d.end || "")}" ${d.linked ? "disabled" : ""} title="Till">
        <span class="v3-rt-st">${dates ? (run ? `● kör ${at}` : `utanför datum (${esc(d.start)} – ${esc(d.end)})`) : "inga datum – kör bara med ▶"}${d.linked ? " · följer tidplanen" : ""}</span></div></div>`;
  }).join("");
  return `<section class="v3-msec" id="v3RtSec"><button type="button" class="v3-msec-h" id="v3RtHead" aria-expanded="${!shut}"><i>›</i>Körvägar <span>${l3rt.list.length}</span></button>
    ${shut ? "" : `<div class="v3-kc-opts"><button type="button" class="v3-ghost" id="v3RtNew" title="Rita en ny körväg med Byggväg-verktyget">＋ Ny körväg</button></div><datalist id="v3RtActs">${acts.map(a => `<option value="${esc(a)}"></option>`).join("")}</datalist>
    ${rows || `<div class="v3-pal-hint">${l3rt.loaded ? "Inga körvägar än. Rita en väg med Mät → Byggväg och tryck 💾 Spara körväg." : "Hämtar körvägarna…"}</div>`}
    ${l3rt.list.length ? `<div class="v3-pal-hint">Koppla en körväg till en aktivitet (eller skriv datum) – då kör fordonen bara de datumen när du drar datumreglaget i 3D.</div>` : ""}`}</section>`;
}
function l3rtBindTab(host) {
  const q = s => host.querySelector(s), re = () => { if (typeof l3kRenderTab === "function") l3kRenderTab(); }, find = el => l3rt.list.find(x => x.id === el.closest("[data-rtid]").dataset.rtid);
  const head = q("#v3RtHead"); if (head) head.onclick = () => { l3SetPref("rtShut", !(l3Prefs().rtShut === true)); re(); };
  const nw = q("#v3RtNew"); if (nw) nw.onclick = () => { l3SetPref("measure", "road"); l3SetTool("measure"); l3Status("Byggväg: tryck ut körvägens mittlinje (Enter avslutar), tryck sedan 💾 Spara körväg."); };
  const chg = (sel, fn) => host.querySelectorAll(sel).forEach(el => { el.onchange = () => { const r = find(el); if (!r) return; fn(r, el); l3rtWriteSoon(r); l3rtSync(); }; });
  host.querySelectorAll("[data-rtname]").forEach(el => { el.onchange = () => { const r = find(el); if (r) { r.name = el.value.trim() || r.name; l3rtWriteSoon(r); } }; el.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") el.blur(); }; });
  chg("[data-rtveh]", (r, el) => { r.vehicle = el.value; });
  chg("[data-rtcnt]", (r, el) => { r.count = Math.max(1, Math.min(8, Math.round(Number(el.value)) || 1)); });
  chg("[data-rtspd]", (r, el) => { r.speed = Math.max(3, Math.min(60, Number(el.value) || 20)); });
  chg("[data-rtshow]", (r, el) => { r.show = el.checked; });
  chg("[data-rtcol]", (r, el) => { r.color = el.value; });
  chg("[data-rtact]", (r, el) => { const v = el.value.trim(); r.activity = v || null; if (v) { const d = l3rtDates(r); if (d.linked) { r.start = d.start; r.end = d.end; } else r.activity = r.activity; } re(); });
  chg("[data-rtd0]", (r, el) => { r.start = el.value || null; re(); }); chg("[data-rtd1]", (r, el) => { r.end = el.value || null; re(); });
  host.querySelectorAll("[data-rtsim]").forEach(b => { b.onclick = () => { const r = find(b); if (!r) return; if (l3rt.sim.has(r.id)) l3rt.sim.delete(r.id); else l3rt.sim.add(r.id); l3rtSync(); re(); }; });
  host.querySelectorAll("[data-rtgo]").forEach(b => { b.onclick = () => { const r = find(b); if (!r || !r.st || !r.st.length) return; const m = r.st[Math.floor(r.st.length / 2)]; l3FlyTo(new THREE.Vector3(m[0] - l3.O[0], m[1] - l3.O[1], m[2] - l3.O[2]), Math.max(40, (r.res && r.res.len) || 60)); }; });
  host.querySelectorAll("[data-rtedit]").forEach(b => { b.onclick = () => { const r = find(b); if (r) l3rtEdit(r.id); }; });
  host.querySelectorAll("[data-rtdel]").forEach(b => { b.onclick = async () => { const r = find(b); if (!r) return; const ok = typeof uiConfirm === "function" ? await uiConfirm(`Ta bort körvägen "${r.name}"?`) : confirm(`Ta bort körvägen "${r.name}"?`); if (ok) { l3rtRemove(r.id); re(); } }; });
}
function l3rtUi() { /* statusraden i listan följer datumet */ const h = document.getElementById("v3PalComments"); if (h && !h.classList.contains("hidden") && l3rt.loaded && h.querySelector("#v3RtSec") && !h.contains(document.activeElement)) { if (typeof l3kRenderTab === "function") l3kRenderTab(); } }

/* Datumet i 3D-vyn ändras (reglaget, knapparna, spela upp): fordonen följer. Läser också in körvägarna så fort 3D-vyn är igång. */
setInterval(() => {
  if (typeof l3 === "undefined" || !l3 || !l3.scene) return;
  if (!l3rt.loaded && !l3rt.loading && typeof ghReadJSON === "function" && typeof token !== "undefined" && token) { l3rtLoad(); return; }
  if (l3rt.loaded && l3rtAt() !== l3rt.at) l3rtSync();
}, 400);

(function l3rtCss() {
  if (document.getElementById("v3RouteCss")) return; const s = document.createElement("style"); s.id = "v3RouteCss";
  s.textContent = `.v3-rt{margin:6px 0;padding:6px 8px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;font-size:12px}.v3-rt.on{border-color:#f97316;background:#fff7ed}.v3-rt-top{display:flex;align-items:center;gap:4px}.v3-rt-top i{width:10px;height:10px;border-radius:50%;flex:none}.v3-rt-n{flex:1;min-width:0;border:0;background:transparent;font:600 12px system-ui;color:inherit}
.v3-rt-o{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin-top:4px}.v3-rt-o select,.v3-rt-s input{padding:2px 4px;border:1px solid #cbd5e1;border-radius:6px;font:inherit;max-width:100%}.v3-rt-o input[type=number]{width:42px;padding:2px 3px;border:1px solid #cbd5e1;border-radius:6px;font:inherit}.v3-rt-o input[type=color]{width:24px;height:22px;padding:0;border:0;background:none}
.v3-rt-s{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}.v3-rt-s input[type=text]{flex:1 1 100%}.v3-rt-s input[type=date]{width:118px}.v3-rt-st{flex:1 1 100%;color:#64748b}.v3-rt.on .v3-rt-st{color:#c2410c;font-weight:600}`;
  document.head.appendChild(s);
})();
