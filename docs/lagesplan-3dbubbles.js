/* Info-bubblor i 3D-editorn (Victor 2026-10-13): en tydlig bubbla per aktivitet vid dess objekt med samma info som i
   Gantt-schemat – namn, datum, framdrift, område och aktivitet. HTML-kort ovanpå 3D-vyn (läsbara, till skillnad från
   Trimble Connects textmarkeringar). Samma innehåll och urval som bubblorna i 4D-dashboarden (💬 Bubblor).
   Urval: markerade objekt (annars pågående/försenade), eller alla; högst N. Räknas om när datum, markering eller val ändras. */

const L3BUB_FIELDS = [["name", "Namn"], ["date", "Datum"], ["progress", "Framdrift"], ["area", "Område"], ["activity", "Aktivitet"]];
const l3bub = { anchors: [], sig: "" };
const l3bubOn = () => !!l3Prefs().bubOn;
const l3bubCfg = () => { const p = l3Prefs(); return { scope: p.bubScope || "auto", max: Math.max(1, Math.min(100, Number(p.bubMax) || 15)), f: { name: true, date: true, progress: true, area: false, activity: false, ...(p.bubFields || {}) } }; };
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
function l3bubRebuild() {
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
  const scope = cfg.scope, isAct = g => ["pagaende", "forsenad"].includes(l3Phase(g.row));
  let list = [...groups.entries()].filter(([k, g]) => scope === "all" || (scope === "marked" ? markedKeys.has(k) : scope === "active" ? isAct(g) : (isAct(g) || markedKeys.has(k))));
  list = list.filter(([, g]) => !(typeof rowTempOffAt === "function" && rowTempOffAt(g.row, at)));
  l3bub.anchors = list.map(([k, g]) => {
    // Bubblan sitter vid objektens gemensamma överkant (mitt i gruppen i sida, högst upp).
    const n = g.pts.length, v = new THREE.Vector3();
    g.pts.forEach(p => v.add(p)); v.divideScalar(n); v.z = Math.max(...g.pts.map(p => p.z));
    return { row: g.row, v, n };
  });
  l3bub.total = list.length; l3bub.cap = cfg.max;
}
function l3bubSig() {
  const cfg = l3bubCfg(), p = l3Prefs();
  return [$("dateInput").value, [...l3.sel].join(","), typeof l3bs !== "undefined" ? l3bs.sel.length : 0, items.length, placements.length, typeof l3b !== "undefined" ? l3b.models.length + ":" + l3b.models.reduce((a, m) => a + (m.visible ? 1 : 0), 0) : 0, cfg.scope, cfg.max, p.bubOn, p.bubProg, l3.placeMeshes ? l3.placeMeshes.size : 0].join("|");
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
function l3bubLines(r, f) {
  const fd = d => (d ? shortDate(d) : ""), L = [];
  const end = r.actual_end_date && r.actual_end_date > (r.end_date || "") ? r.actual_end_date : r.end_date || r.start_date;
  return { name: f.name ? (r.object_name || r.activity || "Aktivitet") : "", date: f.date ? `${fd(r.start_date)} – ${fd(end)}` : "", progress: f.progress ? Math.max(0, Math.min(100, l3bubProgAt(r, $("dateInput").value || todayIso()))) : null, area: f.area ? r.area || "" : "", activity: f.activity && r.activity && r.activity !== r.object_name ? r.activity : "" };
}
/* Små kort (ca 150 px) med en tydlig ledlinje och en prick på objektet. Korten placeras vid sidan av/ovanför varandra så att de inte täcker
   varandra, och ligger så lågt som möjligt – modellen bakom ska synas. */
const L3BUB_W = 150;
function l3bubHeight(L) { return 8 + Math.min(2, Math.ceil((L.name || "").length / 24)) * 13 + (L.date ? 13 : 0) + (L.progress !== null ? 14 : 0) + (L.area ? 13 : 0) + (L.activity ? 13 : 0); }
function l3bubRender() {
  let host = document.getElementById("v3Bubbles");
  const on = l3bubOn();
  if (!host) { const lab = document.getElementById("v3Labels"); if (!lab || !on) return; host = document.createElement("div"); host.id = "v3Bubbles"; host.className = "v3-bubbles"; lab.parentNode.insertBefore(host, lab.nextSibling); }
  if (!on || !l3) { if (host.innerHTML) host.innerHTML = ""; l3bub.sig = ""; return; }
  const sig = l3bubSig(); if (sig !== l3bub.sig) { l3bub.sig = sig; l3bubRebuild(); }
  const r = l3.renderer.domElement.getBoundingClientRect(), cam = l3.camera.position, cfg = l3bubCfg(), W = L3BUB_W;
  const vis = l3bub.anchors.map(a => { const q = a.v.clone().project(l3.camera); return { a, q, d: a.v.distanceTo(cam) }; })
    .filter(o => o.q.z < 1 && o.q.x > -1.05 && o.q.x < 1.05 && o.q.y > -1.05 && o.q.y < 1.05).sort((x, y) => x.d - y.d).slice(0, cfg.max);
  const placed = []; let cards = "", lines = "";
  vis.forEach(({ a, q }) => {
    const ax = (q.x + 1) / 2 * r.width, ay = (1 - q.y) / 2 * r.height; // objektets punkt på skärmen
    const L = l3bubLines(a.row, cfg.f), h = l3bubHeight(L);
    // Kandidater: rakt ovanför, sedan åt sidorna och högre upp – första som inte krockar med ett redan placerat kort.
    const cands = []; for (let k = 0; k < 6; k++) for (const dx of [0, 0.62 * W, -0.62 * W, 1.24 * W, -1.24 * W]) cands.push([dx, -(22 + k * (h + 4))]);
    let pos = cands[0];
    for (const c of cands) { const cx = ax + c[0], by = ay + c[1]; if (!placed.some(p => Math.abs(p.x - cx) < W + 4 && p.y - p.h - 3 < by && by - h - 3 < p.y)) { pos = c; break; } }
    const cx = Math.max(W / 2 + 4, Math.min(r.width - W / 2 - 4, ax + pos[0])), by = Math.max(h + 4, ay + pos[1]);
    placed.push({ x: cx, y: by, h });
    const ph = l3Phase(a.row), col = phaseColor(ph), tipX = Math.max(cx - W / 2 + 10, Math.min(cx + W / 2 - 10, ax));
    // Ledlinjen från kortets underkant till objektet, med en prick på objektet.
    lines += `<line x1="${tipX.toFixed(1)}" y1="${by.toFixed(1)}" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".85"/><line x1="${tipX.toFixed(1)}" y1="${by.toFixed(1)}" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}" stroke="${col}" stroke-width="2" stroke-linecap="round"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="5.5" fill="#fff"/><circle cx="${ax.toFixed(1)}" cy="${ay.toFixed(1)}" r="3.6" fill="${col}"/>`;
    cards += `<div class="v3-bub" style="left:${cx.toFixed(0)}px;top:${by.toFixed(0)}px;--bc:${col}"><div class="v3-bub-c">${L.name ? `<b>${escHtml(L.name)}</b>` : ""}${L.date ? `<span class="d">${escHtml(L.date)}</span>` : ""}${L.progress !== null ? `<span class="pr"><span class="p"><i style="width:${L.progress}%"></i></span><span class="pv">${L.progress} %${ph === "forsenad" ? " · försenad" : ""}</span></span>` : ""}${L.area ? `<span class="a">${escHtml(L.area)}</span>` : ""}${L.activity ? `<span class="ac">${escHtml(L.activity)}</span>` : ""}</div></div>`;
  });
  const html = `<svg class="v3-bub-svg" width="${r.width.toFixed(0)}" height="${r.height.toFixed(0)}">${lines}</svg>${cards}`;
  if (host.dataset.h !== html) { host.innerHTML = html; host.dataset.h = html; }
}
