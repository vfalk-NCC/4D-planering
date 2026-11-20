/* Info-bubblor i 3D-editorn (Victor 2026-10-13): en tydlig bubbla per aktivitet vid dess objekt med samma info som i
   Gantt-schemat – namn, datum, framdrift, område och aktivitet. HTML-kort ovanpå 3D-vyn (läsbara, till skillnad från
   Trimble Connects textmarkeringar). Samma innehåll och urval som bubblorna i 4D-dashboarden (💬 Bubblor).
   Urval: markerade objekt (annars pågående/försenade), eller alla; högst N. Räknas om när datum, markering eller val ändras. */

const L3BUB_FIELDS = [["name", "Namn"], ["date", "Datum"], ["progress", "Framdrift"], ["area", "Område"], ["activity", "Aktivitet"], ["resource", "Resurser"], ["status", "Status"], ["note", "Anteckning"]];
const l3bub = { anchors: [], sig: "", ovr: new Map(), frozen: null, auto: new Map() };
const l3bubOn = () => !!l3Prefs().bubOn;
const l3bubCfg = () => { const p = l3Prefs(); return { scope: p.bubScope || "auto", max: Math.max(1, Math.min(100, Number(p.bubMax) || 15)), line: p.bubLine !== false, neutral: !!p.bubNeutral, f: { name: true, date: true, progress: true, area: false, activity: false, resource: false, status: false, note: true, ...(p.bubFields || {}) } }; };
/* Egna anteckningar och tända/släckta bubblor per aktivitet – delas i projektet (projects/<id>/bubble_notes_3d.json) så att alla ser samma. */
const l3bo = { list: null, loading: null };
const l3boPath = () => `projects/${encodeURIComponent(l3ViewKey())}/bubble_notes_3d.json`;
const l3boLocal = () => ((l3Prefs().bubOwn || {})[l3ViewKey()] || []);
function l3boMap() { if (!l3bo.list) l3bo.list = l3boLocal().slice(); if (!l3bo._m || l3bo._m.src !== l3bo.list) l3bo._m = { src: l3bo.list, m: new Map(l3bo.list.map(x => [x.k, x])) }; return l3bo._m.m; }
const l3boGet = key => l3boMap().get(key) || {};
function l3boLoad() {
  if (l3bo.loaded) return Promise.resolve();
  if (l3bo.loading) return l3bo.loading;
  if (typeof token === "undefined" || !token || typeof ghReadJSON !== "function") return Promise.resolve();
  l3bo.loading = ghReadJSON(token, l3boPath()).then(r => { l3bo.list = r.filter(x => x && x.k); l3bo.loaded = true; l3bo.sig = ""; l3bub.sig = ""; if (typeof l3Render === "function") l3Render(); }).catch(e => console.warn("Bubblornas anteckningar kunde inte läsas", e)).finally(() => { l3bo.loading = null; });
  return l3bo.loading;
}
/* patch: { note?, off?, on? } – tomma värden tas bort. */
function l3boSet(key, patch) {
  const cur = { ...l3boGet(key), k: key, ...patch };
  Object.keys(cur).forEach(k => { if (k !== "k" && (cur[k] === undefined || cur[k] === null || cur[k] === "" || cur[k] === false || (typeof cur[k] === "number" && !Number.isFinite(cur[k])))) delete cur[k]; });
  const apply = list => { const rest = (list || []).filter(x => x && x.k !== key); return Object.keys(cur).length > 1 ? [...rest, cur] : rest; };
  l3boCommit(apply);
}
/* Flera ändringar i ett svep (en enda skrivning till projektet). patches: [[key, patch], ...] */
function l3boSetMany(patches) {
  const out = new Map();
  patches.forEach(([key, patch]) => { const cur = { ...(out.get(key) || l3boGet(key)), k: key, ...patch }; Object.keys(cur).forEach(k => { if (k !== "k" && (cur[k] === undefined || cur[k] === null || cur[k] === "" || cur[k] === false || (typeof cur[k] === "number" && !Number.isFinite(cur[k])))) delete cur[k]; }); out.set(key, cur); });
  l3boCommit(list => { const rest = (list || []).filter(x => x && !out.has(x.k)); return [...rest, ...[...out.values()].filter(c => Object.keys(c).length > 1)]; });
}
function l3boCommit(apply) {
  l3bo.list = apply(l3bo.list || l3boLocal()); l3bub.sig = "";
  try { const o = { ...(l3Prefs().bubOwn || {}) }; o[l3ViewKey()] = l3bo.list.slice(-300); l3SetPref("bubOwn", o); } catch (e) { /* bara en reserv */ }
  if (typeof token !== "undefined" && token && typeof ghWriteJSON === "function") ghWriteJSON(token, l3boPath(), list => apply(list), "3D: bubblor – anteckningar").catch(e => console.warn("Kunde inte dela bubblornas anteckningar", e));
  if (typeof l3RenderLabels === "function") l3RenderLabels();
}
const l3boOffCount = () => (l3bo.list || l3boLocal()).filter(x => x.off).length;
function l3boShowAll() { (l3bo.list || l3boLocal()).filter(x => x.off).forEach(x => l3boSet(x.k, { off: false })); }
async function l3boEdit(key, name) {
  const v = await uiPrompt(`Anteckning på bubblan "${name}" (tomt = ingen):`, l3boGet(key).note || "");
  if (v === null || v === undefined) return;
  l3boSet(key, { note: String(v).trim().slice(0, 300) });
}
/* Aktivitetsnyckel som i dashboarden: group_id, annars source_key, annars egen rad. */
const l3bubKey = r => r.group_id ? `g:${r.group_id}` : r.source_key ? `s:${r.source_key}` : `i:${r.id}`;

function l3bubRangeAnchor(mesh, ri) {
  const u = mesh.userData.l3b, r = u.ranges[ri];
  if (!r._bb) {
    const P = mesh.geometry.getAttribute("position"); let x0 = 1e18, y0 = 1e18, x1 = -1e18, y1 = -1e18, z1 = -1e18;
    for (let i = r.start; i < r.start + r.count && i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z > z1) z1 = z; }
    r._bb = r.count ? [(x0 + x1) / 2, (y0 + y1) / 2, z1] : null;
  }
  if (!r._bb) return null;
  mesh.updateMatrixWorld(true);
  return new THREE.Vector3(r._bb[0], r._bb[1], r._bb[2]).applyMatrix4(mesh.matrixWorld);
}
function l3bubRebuild(scopeOverride) {
  const byId = new Map((items || []).map(r => [r.id, r])), cfg = l3bubCfg();
  const groups = new Map(); // aktivitetsnyckel -> { row, pts: [Vector3] }
  const add = (itemId, v) => { const r = byId.get(itemId); if (!r || !r.start_date || !v) return; const k = l3bubKey(r); (groups.get(k) || groups.set(k, { row: r, pts: [] }).get(k)).pts.push(v); };
  // Placerade objekt.
  if (l3.placeMeshes) l3.placeMeshes.forEach((g, id) => { if (!g || !g.visible) return; const p = placements.find(x => x.id === id); if (p && p.itemId) add(p.itemId, new THREE.Vector3(g.position.x, g.position.y, g.position.z + l3PlaceHeight(p))); });
  // IFC-objekt i byggnaden.
  if (typeof l3b !== "undefined") l3b.models.filter(m => m.visible).forEach(m => m.meshes.forEach(mesh => {
    const u = mesh.userData.l3b; if (!u || !u.ranges || !mesh.visible) return;
    u.ranges.forEach((r, ri) => { if (r.itemId && !(u.hidden && u.hidden.has(ri))) add(r.itemId, l3bubRangeAnchor(mesh, ri)); });
  }));
  // Markerade objekt → deras aktiviteter.
  const markedKeys = new Set();
  l3.sel.forEach(id => { const p = placements.find(x => x.id === id); const r = p && p.itemId && byId.get(p.itemId); if (r) markedKeys.add(l3bubKey(r)); });
  (typeof l3bs !== "undefined" ? l3bs.sel : []).forEach(e => { const r0 = e.mesh.userData.l3b.ranges[e.ri], r = r0 && r0.itemId && byId.get(r0.itemId); if (r) markedKeys.add(l3bubKey(r)); });
  const at = $("dateInput").value || todayIso();
  // Auto: aktiviteter som är aktiva (pågående/försenade) vid datumet, plus markerade. Följer tidslinjen när man drar.
  const scope = scopeOverride || cfg.scope, isAct = g => ["pagaende", "forsenad"].includes(l3Phase(g.row));
  let list = [...groups.entries()].filter(([k, g]) => l3boGet(k).on || scope === "all" || (scope === "marked" ? markedKeys.has(k) : scope === "active" ? isAct(g) : (isAct(g) || markedKeys.has(k))));
  // Passerat slutdatum: bubblan försvinner (verkligt slut om det finns och är senare).
  list = list.filter(([k, g]) => { if (markedKeys.has(k) || l3boGet(k).on) return true; if (l3boGet(k).off) return false; if (g.row.temporary === true && g.row.bubble_off === true) return false; const r = g.row, e = String(r.actual_end_date && r.actual_end_date > (r.end_date || "") ? r.actual_end_date : r.end_date || "").slice(0, 10); return !(e && at > e); });
  list = list.filter(([k, g]) => markedKeys.has(k) || !(typeof rowTempOffAt === "function" && rowTempOffAt(g.row, at))); // markerade visas oavsett status
  if (l3bub.frozen) list = list.filter(([k]) => l3bub.frozen.has(k)); // sparad vy: exakt de bubblor som var med
  l3bub.anchors = list.map(([k, g]) => {
    // Bubblan sitter vid objektens gemensamma överkant (mitt i gruppen i sida, högst upp).
    const n = g.pts.length, v = new THREE.Vector3();
    g.pts.forEach(p => v.add(p)); v.divideScalar(n); v.z = Math.max(...g.pts.map(p => p.z));
    return { row: g.row, v, n, marked: markedKeys.has(k), key: k };
  });
  // Fria bubblor (inte kopplade till tidplanen) – visas alltid så länge de inte är släckta.
  (l3bo.list || l3boLocal()).filter(x => x.free && x.p && !x.off && !(l3bub.frozen && !l3bub.frozen.has(x.k))).forEach(x => l3bub.anchors.push({ row: { id: x.k, object_name: x.name || "Bubbla", __free: x }, v: new THREE.Vector3(x.p[0] - l3.O[0], x.p[1] - l3.O[1], x.p[2] - l3.O[2]), n: 1, marked: false, key: x.k, free: true }));
  l3bub.total = list.length; l3bub.cap = cfg.max;
}
function l3bubSig() {
  const cfg = l3bubCfg(), p = l3Prefs();
  return [$("dateInput").value, [...l3.sel].join(","), typeof l3bs !== "undefined" ? (l3bs.ver || 0) + ":" + l3bs.sel.map(e => e.key).join(",") : 0,   items.length, placements.length, typeof l3b !== "undefined" ? l3b.models.length + ":" + l3b.models.reduce((a, m) => a + (m.visible ? 1 : 0), 0) : 0, cfg.scope, cfg.max, p.bubOn, p.bubProg, JSON.stringify(p.bubFields || ""), (l3bo.list || []).length, l3bo.list ? l3bo.list.map(x => (x.note || "").length + (x.off ? "o" : "") + (x.on ? "p" : "") + (x.free ? x.p.join(",") : "")).join("") : "", l3bub.frozen ? [...l3bub.frozen].join(",") : "", l3.placeMeshes ? l3.placeMeshes.size : 0].join("|");
}
/* Framdrift i bubblan (val i Övrigt): "calc" = räknas fram efter datum, linjärt över aktivitetens längd (0 % vid start, 100 % vid slut – som Pågår nu i filmen)
   så att siffran rör sig när man drar i tidslinjen; "plan" = framdriften som står i tidplanen. */
function l3bubProgAt(r, at) {
  const p = Math.max(0, Math.min(100, Math.round(Number(r.progress) || 0)));
  if ((l3Prefs().bubProg || "calc") === "plan") return p;
  const d = x => (x ? Date.parse(String(x).slice(0, 10) + "T00:00:00Z") / 864e5 : NaN);
  const s = d(r.start_date), e = d(r.end_date), t = d(at);
  if (![s, e, t].every(Number.isFinite)) return p;
  if (t >= e) return 100; if (t <= s) return 0;
  return Math.round(100 * (t - s) / Math.max(1, e - s));
}
function l3bubLines(r, f, marked) {
  if (r.__free) {
    const o = r.__free;
    return { name: o.name || "Bubbla", date: o.dt || "", progress: Number.isFinite(o.prog) ? Math.max(0, Math.min(100, Math.round(o.prog))) : null, actual: null, area: o.area || "", activity: o.ac || "", resource: "", status: "", note: o.note || "", edited: false };
  }
  const L = l3bubLines0(r, f, marked), o = l3boGet(l3bubKey(r));
  if (o.name) L.name = o.name; if (o.dt) L.date = o.dt; if (o.ac) L.activity = o.ac; if (Number.isFinite(o.prog)) { L.progress = Math.max(0, Math.min(100, Math.round(o.prog))); L.actual = null; }
  L.edited = !!(o.name || o.dt || o.ac || Number.isFinite(o.prog));
  return L;
}
function l3bubLines0(r, f, marked) {
  // Markerade (klickade) objekt får också år och område i bubblan; de automatiska för pågående är oförändrade.
  const yr = d => String(d || "").slice(0, 4), fd = d => (d ? (marked ? `${shortDate(d)} ${yr(d)}` : shortDate(d)) : "");
  const end = r.actual_end_date && r.actual_end_date > (r.end_date || "") ? r.actual_end_date : r.end_date || r.start_date;
  return { name: f.name ? (r.object_name || r.activity || "Aktivitet") : "", date: f.date || marked ? `${fd(r.start_date)} – ${fd(end)}` : "", progress: f.progress ? Math.max(0, Math.min(100, l3bubProgAt(r, $("dateInput").value || todayIso()))) : null, actual: f.progress && (l3Prefs().bubProg || "calc") !== "plan" ? Math.max(0, Math.min(100, Math.round(Number(r.progress) || 0))) : null, area: f.area || marked ? r.area || "" : "", activity: f.activity && r.activity && r.activity !== r.object_name ? r.activity : "",
    resource: f.resource && Array.isArray(r.resources) ? r.resources.filter(x => x && x.name).map(x => x.name + (Number(x.qty) > 1 ? ` ×${x.qty}` : "")).join(", ") : "",
    status: f.status && typeof PHASE_LABELS !== "undefined" ? PHASE_LABELS[l3Phase(r)] || "" : "", note: f.note ? l3boGet(l3bubKey(r)).note || "" : "" };
}
/* Små kort (ca 150 px) med en tydlig ledlinje och en prick på objektet. Korten placeras vid sidan av/ovanför varandra så att de inte täcker
   varandra, och ligger så lågt som möjligt – modellen bakom ska synas. */
const L3BUB_W = 150, L3BUB_WIDE = 196;
function l3bubHeight(L) { return 8 + Math.min(2, Math.ceil((L.name || "").length / 24)) * 13 + (L.date ? 13 : 0) + (L.progress !== null ? 14 : 0) + (L.area ? 13 : 0) + (L.activity ? 13 : 0) + (L.resource ? 13 : 0) + (L.status ? 13 : 0) + (L.note ? 8 + Math.min(3, Math.ceil(L.note.length / 30)) * 12 : 0) + 10; }
function l3bubRender() {
  let host = document.getElementById("v3Bubbles");
  if (!l3bo.loaded && !l3bo.loading && !l3bo.tried) { l3bo.tried = true; l3boLoad(); }
  const auto = l3bubOn(), on = auto || l3Prefs().bubClick !== false; // klickade/markerade objekt får alltid en bubbla, även när de automatiska är avstängda
  if (!host) { const lab = document.getElementById("v3Labels"); if (!lab) return; host = document.createElement("div"); host.id = "v3Bubbles"; host.className = "v3-bubbles"; lab.parentNode.insertBefore(host, lab.nextSibling); }
  if (on && typeof l3pl !== "undefined" && l3pl.rec && (l3plPrefs().film || {}).fxBubbles === true) { if (host.innerHTML) host.innerHTML = ""; host.dataset.h = ""; return; } // under filmen ritas bubblorna i filmens bild
  if (!on || !l3) { if (host.innerHTML) host.innerHTML = ""; l3bub.sig = ""; return; }
  const sig = l3bubSig() + "|" + auto + "|" + on; if (sig !== l3bub.sig) { l3bub.sig = sig; l3bubRebuild(auto ? undefined : "marked"); }
  const r = l3.renderer.domElement.getBoundingClientRect(), cam = l3.camera.position, cfg = l3bubCfg(), W = L3BUB_W;
  const vis = l3bub.anchors.map(a => { const q = a.v.clone().project(l3.camera); return { a, q, d: a.v.distanceTo(cam) }; })
    .filter(o => o.q.z < 1 && o.q.x > -1.05 && o.q.x < 1.05 && o.q.y > -1.05 && o.q.y < 1.05).sort((x, y) => (x.a.marked ? 0 : 1) - (y.a.marked ? 0 : 1) || x.d - y.d).slice(0, l3bub.frozen ? 200 : cfg.max);
  if (l3bub.drag) return; // under dragning ritas inget om
  // Stabil placering: sparad plats (dragen/låst, i vyn eller i projektet) vinner; resten får en automatisk plats som är densamma så länge kameran är densamma.
  const csig = [l3.camera.position.x, l3.camera.position.y, l3.camera.position.z, l3.orbit.target.x, l3.orbit.target.y, l3.orbit.target.z, l3.camera.zoom, r.width, r.height].map(v => Math.round(v * 100)).join(",") + "|" + vis.map(o => o.a.key).join(",");
  if (l3bub.autoSig !== csig) { l3bub.autoSig = csig; l3bub.auto = new Map(); }
  const stored = key => (l3bub.ovr && l3bub.ovr.get(key)) || (l3boGet(key).x !== undefined ? { x: l3boGet(key).x, y: l3boGet(key).y, lk: !!l3boGet(key).lk } : null);
  const placed = []; let cards = "", lines = "";
  const meta = vis.map(({ a, q }) => { const L = l3bubLines(a.row, cfg.f, true); return { a, q, L, h: l3bubHeight(L), st: stored(a.key) }; });
  meta.filter(m => m.st).forEach(m => placed.push({ x: m.st.x * r.width, y: m.st.y * r.height, h: m.h })); // sparade platser räknas som upptagna
  meta.forEach(({ a, q, L, h, st }) => {
    const w = L3BUB_WIDE; const ax = (q.x + 1) / 2 * r.width, ay = (1 - q.y) / 2 * r.height; // objektets punkt på skärmen
    let cx, by;
    if (st) { cx = st.x * r.width; by = st.y * r.height; }
    else if (l3bub.auto.has(a.key)) { const c = l3bub.auto.get(a.key); cx = c.x * r.width; by = c.y * r.height; placed.push({ x: cx, y: by, h }); }
    else {
      // Kandidater: rakt ovanför, sedan åt sidorna och högre upp – första som inte krockar med ett redan placerat kort.
      const cands = []; for (let k = 0; k < 6; k++) for (const dx of [0, 0.62 * w, -0.62 * w, 1.24 * w, -1.24 * w]) cands.push([dx, -(22 + k * (h + 4))]);
      let pos = cands[0];
      for (const c of cands) { const px = ax + c[0], py = ay + c[1]; if (!placed.some(p => Math.abs(p.x - px) < w + 4 && p.y - p.h - 3 < py && py - h - 3 < p.y)) { pos = c; break; } }
      cx = Math.max(w / 2 + 4, Math.min(r.width - w / 2 - 4, ax + pos[0])); by = Math.max(h + 4, ay + pos[1]);
      placed.push({ x: cx, y: by, h }); l3bub.auto.set(a.key, { x: cx / r.width, y: by / r.height });
    }
    const ph = a.free ? null : l3Phase(a.row), fr = a.row.__free, col = cfg.neutral ? "#475569" : a.free ? (fr.col || (Number(fr.prog) >= 100 ? "#16a34a" : "#2563eb")) : phaseColor(ph), tipX = Math.max(cx - w / 2 + 10, Math.min(cx + w / 2 - 10, ax)), lk = !!(st && st.lk);
    // Ledlinjen från kortets underkant till objektet, med en prick på objektet.
    if (cfg.line) lines += `<line x1="${tipX.toFixed(1)}" y1="${by.toFixed(1)}" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".85"/><line x1="${tipX.toFixed(1)}" y1="${by.toFixed(1)}" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}" stroke="${col}" stroke-width="2" stroke-linecap="round"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="5.5" fill="#fff"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="3.6" fill="${col}"/>`;
    const ek = escHtml(a.key);
    cards += `<div class="v3-bub${lk ? " lk" : ""}${a.free ? " fr" : ""}" data-bk="${ek}" style="left:${cx.toFixed(0)}px;top:${by.toFixed(0)}px;--bc:${col};width:${L3BUB_WIDE}px;"><div class="v3-bub-c">${L.name ? `<b>${escHtml(L.name)}</b>` : ""}${L.date ? `<span class="d">${escHtml(L.date)}</span>` : ""}${L.progress !== null ? `<span class="pr"><span class="p"><i style="width:${L.progress}%"></i></span><span class="pv" title="${L.actual !== null && L.actual !== L.progress ? "Planerat = hur långt aktiviteten borde vara vid datumet (räknat på start och slut). Utfört = framdriften som är registrerad i tidplanen." : ""}">${L.actual !== null && L.actual !== L.progress ? `plan ${L.progress} % · utfört ${L.actual} %` : `${L.progress} %`}${ph === "forsenad" ? " · försenad" : ""}</span></span>` : ""}${L.area ? `<span class="a">${escHtml(L.area)}</span>` : ""}${L.activity ? `<span class="ac">${escHtml(L.activity)}</span>` : ""}${L.resource ? `<span class="a">${escHtml(L.resource)}</span>` : ""}${L.status ? `<span class="a">${escHtml(L.status)}</span>` : ""}${L.note ? `<span class="nt">${escHtml(L.note)}</span>` : ""}</div><div class="v3-bub-t"><button type="button" data-bk="${ek}" data-ba="note" title="Ändra namn, framdrift och text på bubblan">✎</button><button type="button" data-bk="${ek}" data-ba="lock" title="${lk ? "Upplåst: kan dras igen" : "Lås bubblan där den sitter"}">${lk ? "🔒" : "🔓"}</button>${a.free ? "" : `<button type="button" data-bk="${ek}" data-ba="pin" title="${l3boGet(a.key).on ? "Sluta låsa – bubblan följer urvalet igen" : "Visa alltid den här bubblan"}">${l3boGet(a.key).on ? "★" : "☆"}</button>`}<button type="button" data-bk="${ek}" data-ba="off" title="${a.free ? "Ta bort bubblan" : "Släck bubblan"}">✕</button></div>${L.edited ? `<i class="v3-bub-e" title="Ändrad för hand – skiljer sig från tidplanen"></i>` : ""}</div>`;
  });
  const html = `<svg class="v3-bub-svg" width="${r.width.toFixed(0)}" height="${r.height.toFixed(0)}">${lines}</svg>${cards}`;
  if (host.dataset.h !== html) { host.innerHTML = html; host.dataset.h = html; }
}

/* Knapparna på bubblorna (✎ ändra, 🔒 lås, ☆ visa alltid, ✕ släck) och dragning av korten. Bubblorna i övrigt släpper igenom musen till 3D-vyn. */
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("#v3Bubbles [data-ba]"); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const key = b.dataset.bk, a = l3bub.anchors.find(x => x.key === key), name = a ? a.row.object_name || a.row.activity || "Aktivitet" : "";
  if (b.dataset.ba === "note") { if (typeof l3bubPanel === "function") l3bubPanel(key); else l3boEdit(key, name); }
  else if (b.dataset.ba === "lock") l3bubLock(key);
  else if (b.dataset.ba === "pin") l3boSet(key, { on: !l3boGet(key).on, off: false });
  else if (b.dataset.ba === "off") { if (a && a.free) l3boSet(key, { off: true, free: true }); else l3boSet(key, { off: true, on: false }); if (typeof l3Status === "function") l3Status(a && a.free ? "Bubblan borttagen." : "Bubblan släckt – Visa alla dolda finns i Bubblor-menyn."); }
}, true);
/* Låser/låser upp en bubbla. Låst = ligger kvar exakt där den är (även i sparade vyer) och går inte att dra av misstag. */
function l3bubCurPos(key) { const el = document.querySelector(`#v3Bubbles .v3-bub[data-bk="${CSS.escape(key)}"]`), r = l3.renderer.domElement.getBoundingClientRect(); if (el) return { x: parseFloat(el.style.left) / r.width, y: parseFloat(el.style.top) / r.height }; const c = l3bub.auto && l3bub.auto.get(key); return c || null; }
function l3bubLock(key, on) {
  const o = l3boGet(key), cur = (l3bub.ovr && l3bub.ovr.get(key)) || (o.x !== undefined ? { x: o.x, y: o.y, lk: !!o.lk } : null), p = l3bubCurPos(key) || cur; if (!p) return;
  const lk = on === undefined ? !(cur && cur.lk) : !!on;
  if (l3bub.ovr) l3bub.ovr.set(key, { x: p.x, y: p.y, lk });
  l3boSet(key, { x: Math.round(p.x * 1e4) / 1e4, y: Math.round(p.y * 1e4) / 1e4, lk }); l3bub.sig = ""; l3bub.dh = ""; l3Render();
}
/* Lås alla synliga bubblor, eller släpp dem till automatisk placering igen. */
function l3bubLockAll(on) {
  const keys = [...document.querySelectorAll("#v3Bubbles .v3-bub")].map(e => e.dataset.bk), patches = [];
  keys.forEach(k => { const p = l3bubCurPos(k); if (!p) return; if (l3bub.ovr) { if (on) l3bub.ovr.set(k, { x: p.x, y: p.y, lk: true }); else l3bub.ovr.delete(k); } patches.push([k, on ? { x: Math.round(p.x * 1e4) / 1e4, y: Math.round(p.y * 1e4) / 1e4, lk: true } : { x: null, y: null, lk: false }]); });
  if (patches.length) l3boSetMany(patches); l3bub.autoSig = ""; l3bub.sig = ""; l3Render(); return patches.length;
}
(function () {
  let d = null;
  document.addEventListener("pointerdown", e => {
    const c = e.target.closest && e.target.closest("#v3Bubbles .v3-bub-c"); if (!c || e.button !== 0) return;
    const card = c.parentNode, key = card.dataset.bk, st = (l3bub.ovr && l3bub.ovr.get(key)) || (l3boGet(key).x !== undefined ? { lk: !!l3boGet(key).lk } : null);
    if (st && st.lk) return; // låst
    e.preventDefault(); e.stopPropagation();
    d = { card, key, x0: e.clientX, y0: e.clientY, l0: parseFloat(card.style.left), t0: parseFloat(card.style.top), moved: false }; l3bub.drag = true; try { card.setPointerCapture(e.pointerId); } catch (x) { /* */ }
  }, true);
  document.addEventListener("pointermove", e => { if (!d) return; const dx = e.clientX - d.x0, dy = e.clientY - d.y0; if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return; d.moved = true; d.card.style.left = (d.l0 + dx) + "px"; d.card.style.top = (d.t0 + dy) + "px"; d.card.classList.add("dg"); }, true);
  document.addEventListener("pointerup", () => {
    if (!d) return; const m = d; d = null; l3bub.drag = false; m.card.classList.remove("dg");
    if (!m.moved) { l3Render(); return; }
    const r = l3.renderer.domElement.getBoundingClientRect(), x = Math.max(0.02, Math.min(0.98, parseFloat(m.card.style.left) / r.width)), y = Math.max(0.03, Math.min(1, parseFloat(m.card.style.top) / r.height));
    if (l3bub.ovr) l3bub.ovr.set(m.key, { x, y, lk: false });
    l3boSet(m.key, { x: Math.round(x * 1e4) / 1e4, y: Math.round(y * 1e4) / 1e4 }); l3bub.dh = ""; l3Render();
  }, true);
})();
