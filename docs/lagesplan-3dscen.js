/* 3D-vyn – Tidplansscenarier (Victor 2026-11-12): egna scenarier som ritas bredvid varandra i samma vy, med skillnadsvy och rapportbild.
   Alla scenarier börjar tomma och är inte kopplade till någon tidplan. Man bygger dem själv: skapa aktiviteter i scenariot (namn, start, slut, valfri färg), markera objekt i 3D och koppla dem,
   eller – om man vill – koppla scenariot mot Powerproject-tidplanen (nuvarande plan eller en baseline), med egna aktiviteter ovanpå. Inget i den riktiga tidplanen ändras.
   Scenariot ritas genom att modellens 4D-färger (Ganttens Tid-läge, l3gmRange) räknas om med scenariots datum. Scenarierna sparas i projektet (plan_scenarios.json). Prefix l3sc. */
const l3sc = { sel: ["", "", ""], date: "", opts: { missing: "hide", progressCur: false, ghost: true, ghostOp: 22, solidDone: true, delta: true, dark: false }, reg: [], mine: [], cache: {}, render: null, tally: null, prev: null, el: null, ed: null, edSlot: -1, play: 0, loaded: false, saveT: 0, patch: null };
const L3SC_PH = { klar: "Klart", pagaende: "Pågår", forsenad: "Försenat", planerad: "Ej påbörjat" };
const l3scIso = v => (v ? String(v).slice(0, 10) : "");
const l3scDays = (a, b) => Math.round((Date.parse(l3scIso(b) + "T00:00:00Z") - Date.parse(l3scIso(a) + "T00:00:00Z")) / 86400000);
const l3scPath = f => `projects/${encodeURIComponent(projectId)}/pp/${f}`;
const l3scById = id => l3sc.mine.find(x => x.id === id) || null;
const l3scHex = h => { const n = parseInt(String(h).replace("#", ""), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => v / 255); };
const l3scPhaseCol = ph => (typeof phaseColor === "function" ? phaseColor(ph) : { klar: "#22c55e", pagaende: "#facc15", forsenad: "#ef4444", planerad: "#94a3b8" }[ph]);
/* ---- Data ---- */
function l3scNew(name) { return { id: ghNewId().slice(0, 8), name: String(name || "Nytt scenario").slice(0, 80), src: "", unlinked: "ghost", acts: [], created: new Date().toISOString() }; }
/* Ett scenario kompileras till uppslag: IFC-objektets GUID → aktivitet, placerat objekt → aktivitet. Senare aktiviteter går före tidigare. */
function l3scCompile(S) {
  const byGuid = new Map(), byPl = new Map(); (S.acts || []).forEach(a => { (a.g || []).forEach(g => byGuid.set(g, a)); (a.pl || []).forEach(p => byPl.set(p, a)); }); return { S, byGuid, byPl };
}
const l3scC = id => { const S = l3scById(id); if (!S) return null; const c = l3sc.cache[id]; if (c && c.S === S && c.v === S._v) return c; const n = l3scCompile(S); n.v = S._v; return (l3sc.cache[id] = n); };
const l3scTouch = S => { S._v = (S._v || 0) + 1; l3scPersistSoon(); };
function l3scPersistSoon() { clearTimeout(l3sc.saveT); l3sc.saveT = setTimeout(l3scPersist, 700); }
async function l3scPersist() {
  const list = l3sc.mine.map(s => { const { _v, ...r } = s; return r; });
  try { await ghWriteJSON(token, l3scPath("plan_scenarios.json"), () => list, "Spara tidplansscenarier"); } catch (e) { l3Status("Kunde inte spara scenarierna: " + e.message, true); }
}
async function l3scLoad(force) {
  await l3plLoad(force);
  const rd = async f => { try { const a = await ghReadJSON(token, l3scPath(f), force ? { fresh: true } : undefined); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  [l3sc.reg, l3sc.mine] = await Promise.all([rd("plan_baselines.json"), rd("plan_scenarios.json")]);
  l3sc.mine = l3sc.mine.filter(x => x && x.id).map(x => ({ unlinked: "ghost", acts: [], src: "", ...x, acts: Array.isArray(x.acts) ? x.acts : [], ...(x.dates && !x.acts ? { src: "snap:" + x.id } : {}) })); l3sc.cache = {};
  l3sc.sel = l3sc.sel.map(id => (l3scById(id) ? id : "")); l3sc.loaded = true;
}
/* ---- Källor från Powerproject-tidplanen (bara om man kopplar ett scenario dit) ---- */
function l3scDatesOf(row, id) {
  if (!row || !id) return null; let v = null;
  if (id === "cur") v = [row.start_date, row.end_date];
  else if (id === "main") v = [row.baseline_start_date, row.baseline_end_date];
  else if (/^bl:/.test(id)) { const b = row.baselines && row.baselines[id.slice(3)]; v = Array.isArray(b) ? b : null; }
  else if (/^snap:/.test(id)) { const s = l3scById(id.slice(5)); v = s && s.dates && s.dates[row.id]; }
  return v && v[0] && v[1] ? [l3scIso(v[0]), l3scIso(v[1])] : null;
}
function l3scRowFor(row, id) {
  const d = l3scDatesOf(row, id);
  if (d) return { ...row, start_date: d[0], end_date: d[1], ...(id === "cur" ? {} : { actual_start_date: null, actual_end_date: null }) };
  return l3sc.opts.missing === "plan" ? row : null;
}
function l3scSources() {
  const nm = id => (l3sc.reg.find(x => x.id === id) || {}).name, rows = l3pl.rows || [], n = id => rows.reduce((c, r) => c + (l3scDatesOf(r, id) ? 1 : 0), 0);
  return [["", "Ingen – bara egna aktiviteter"], ["cur", "Nuvarande tidplan"], ["main", nm("main") || "Kontraktstidplan (huvudbaseline)"], ...l3sc.reg.filter(x => x && x.id && x.id !== "main").map(x => ["bl:" + x.id, "Baseline: " + (x.name || x.id)]), ...l3sc.mine.filter(s => s.dates).map(s => ["snap:" + s.id, "Sparad: " + s.name])].filter(([id]) => !id || n(id) > 0);
}
/* ---- Färger i modellen ---- */
const l3scGuidOf = ctx => { try { const r = ctx && ctx.mesh && ctx.mesh.userData.l3b && ctx.mesh.userData.l3b.ranges[ctx.ri]; return (r && r.guid) || ""; } catch (e) { return ""; } };
const l3scPhaseOf = (a, at) => (!a.start || !a.end ? null : at > a.end ? "klar" : at >= a.start ? "pagaende" : "planerad");
function l3scActRes(a, at) {
  const ph = l3scPhaseOf(a, at); if (!ph) return null;
  if (ph === "planerad") return l3sc.opts.ghost ? { off: false, rgb: l3scHex(l3scPhaseCol("planerad") || "#94a3b8"), alpha: Math.max(0.05, l3sc.opts.ghostOp / 100), phase: "planerad" } : { off: true, phase: "planerad" };
  return { off: false, rgb: l3scHex(a.color || l3scPhaseCol(ph)), alpha: null, phase: ph };
}
function l3scUnlinked(S) { return S.unlinked === "hide" ? { off: true } : S.unlinked === "orig" ? { off: false, rgb: null, alpha: null, phase: "okopplad", orig: true } : { off: false, rgb: l3scHex("#94a3b8"), alpha: 0.16, phase: "okopplad" }; }
/* Slutdatum för ett objekt i ett scenario (egen aktivitet först, annars den kopplade tidplanen). */
function l3scEndFor(c, rows, guid) {
  const a = guid && (/^pl:/.test(guid) ? c.byPl.get(guid.slice(3)) : c.byGuid.get(guid)); if (a && a.end) return a.end;
  if (c.S.src) { const ds = rows.map(r => l3scDatesOf(r, c.S.src)).filter(Boolean).map(d => d[1]); if (ds.length) return ds.sort().pop(); }
  return "";
}
function l3scDeltaCol(rows, guid) {
  const A = l3scC(l3sc.sel[0]), B = l3scC(l3sc.sel[1]); if (!A || !B) return { off: true };
  return l3scDeltaEnds(l3scEndFor(A, rows, guid), l3scEndFor(B, rows, guid));
}
function l3scDeltaEnds(a, b) {
  if (!a && !b) return { off: true };
  if (!a) return { off: false, rgb: l3scHex("#a855f7"), alpha: null, phase: "d_new" };
  if (!b) return { off: false, rgb: l3scHex("#f59e0b"), alpha: 0.4, phase: "d_gone" };
  const d = l3scDays(a, b), lerp = (c0, c1, t) => [0, 1, 2].map(i => l3scHex(c0)[i] + (l3scHex(c1)[i] - l3scHex(c0)[i]) * t);
  if (d > 7) return { off: false, rgb: lerp("#f59e0b", "#dc2626", Math.min(1, (d - 7) / 60)), alpha: null, phase: "d_late" };
  if (d < -7) return { off: false, rgb: lerp("#38bdf8", "#2563eb", Math.min(1, (-d - 7) / 60)), alpha: null, phase: "d_early" };
  return { off: false, rgb: l3scHex("#cbd5e1"), alpha: 0.5, phase: "d_same" };
}
function l3scCfg(C) { if (l3sc.render == null) return C; return { ...C, future: !!l3sc.opts.ghost, futureOp: l3sc.opts.ghostOp, doneOp: l3sc.opts.solidDone ? 100 : C.doneOp, origCol: false, scale: false, ops: {}, from: "", to: "" }; }
{
  const g0 = l3gmRange;
  l3gmRange = function (rows, at, ctx) {
    const R = l3sc.render; if (R == null) return g0(rows, at, ctx);
    const guid = l3scGuidOf(ctx), tally = ph => { if (l3sc.tally && ph) l3sc.tally[ph] = (l3sc.tally[ph] || 0) + 1; };
    if (R === "delta") { const r = l3scDeltaCol(rows, guid); tally(r.phase); return r; }
    const c = l3scC(l3sc.sel[R]); if (!c) return { off: false, rgb: null, alpha: null, phase: "okopplad", orig: true };
    const a = guid && c.byGuid.get(guid), own = a && l3scActRes(a, at);
    if (own) { tally(own.phase); return own; }
    if (c.S.src) {   // kopplat mot Powerproject-tidplanen: strikta datum ur den källan
      const rs = rows.map(r => l3scRowFor(r, c.S.src)).filter(Boolean);
      if (rs.length) { const was = l3gm.strict; l3gm.strict = !(c.S.src === "cur" && l3sc.opts.progressCur); try { const res = g0(rs, at, ctx); const ph = l3gmGroup(rs.map(r => l3gmRowPhase(r, at, true)).filter(p => p !== "dold")); tally(ph); return res; } finally { l3gm.strict = was; } }
    }
    const u = l3scUnlinked(c.S); tally("okopplad"); return u;
  };
}
/* Placerade objekt (etablering) som kopplats till en aktivitet färgas/döljs på samma sätt; ändringen ångras direkt efter ritningen. */
function l3scPlacePatch(id, at, tally) {
  const delta = id === "delta", c = delta || id == null ? null : l3scC(id), A = delta ? l3scC(l3sc.sel[0]) : null, B = delta ? l3scC(l3sc.sel[1]) : null; if (!l3.placeMeshes) return () => {};
  const saved = [], tl = ph => { if (tally && ph) tally[ph] = (tally[ph] || 0) + 1; };
  const paint = (pid, ph, rgb, alpha, hide) => {
    const g = l3.placeMeshes.get(pid); if (!g) return; saved.push([g, "visible", g.visible]); if (hide) { g.visible = false; return; }
    g.traverse(m => { if (!m.isMesh || !m.material) return; (Array.isArray(m.material) ? m.material : [m.material]).forEach(mt => {
      saved.push([mt, "color", mt.color ? mt.color.clone() : null], [mt, "opacity", mt.opacity], [mt, "transparent", mt.transparent]);
      mt.color && mt.color.setRGB(rgb[0], rgb[1], rgb[2]); mt.transparent = alpha != null; mt.opacity = alpha == null ? 1 : alpha; mt.needsUpdate = true; }); });
  };
  if (delta) { if (A && B) new Set([...A.byPl.keys(), ...B.byPl.keys()]).forEach(pid => { const r = l3scDeltaEnds(l3scEndFor(A, [], "pl:" + pid), l3scEndFor(B, [], "pl:" + pid)); tl(r.phase); if (r.off) paint(pid, 0, null, null, true); else paint(pid, r.phase, r.rgb, r.alpha); }); }
  else if (c) c.byPl.forEach((a, pid) => {
    const ph = l3scPhaseOf(a, at); if (!ph) return; tl(ph);
    if (ph === "planerad") { if (!l3sc.opts.ghost) paint(pid, ph, null, null, true); else paint(pid, ph, l3scHex("#94a3b8"), Math.max(0.05, l3sc.opts.ghostOp / 100)); }
    else paint(pid, ph, l3scHex(a.color || l3scPhaseCol(ph)), null);
  });
  return () => { for (let i = saved.length - 1; i >= 0; i--) { const [o, k, v] = saved[i]; if (k === "color") { if (v && o.color) o.color.copy(v); } else o[k] = v; if (o.isMaterial) o.needsUpdate = true; } };
}
/* ---- Datum och återställning ---- */
function l3scBegin() { if (l3sc.prev) return; l3sc.prev = { mode: l3gm.mode, day: $("dateInput").value }; l3gm.mode = "time"; l3gmStopPlay && l3gmStopPlay(); }
function l3scRestore() { if (l3sc.patch) { l3sc.patch(); l3sc.patch = null; } if (!l3sc.prev) { l3sc.render = null; return; } const p = l3sc.prev; l3sc.prev = null; l3sc.render = null; l3gm.mode = p.mode; if (p.day) l3plSetDay(p.day); l3gmApply(true); if (typeof l3plDockRender === "function") l3plDockRender(); l3Render(); }
/* Levande scenariovisning i 3D (utforska/redigera): färger + placerade objekt för ett scenario vid datumet. */
function l3scLive(k) {
  if (l3sc.patch) { l3sc.patch(); l3sc.patch = null; } l3scBegin(); l3plSetDay(l3sc.date); l3sc.render = k; l3gmApply(true);
  l3sc.patch = l3scPlacePatch(k === "delta" ? "delta" : l3sc.sel[k], l3sc.date); l3Render();
}
/* Ritar ett scenario (0–2) eller skillnaden ("delta") ur den aktuella kameran in i en canvas. Returnerar nyckeltalen (objekt per läge). */
function l3scPaint(cv, k) {
  l3sc.tally = {}; const bg0 = l3.scene.background, undo = l3scPlacePatch(k === "delta" ? "delta" : l3sc.sel[k], l3sc.date, l3sc.tally); if (l3sc.opts.dark) l3.scene.background = new THREE.Color("#0f1c24");
  try { l3sc.render = k; l3gmApply(true); l3.renderer.render(l3.scene, l3.camera);
    const src = l3.renderer.domElement, sw = src.width, sh = src.height, ar = sw / sh, W = cv.width, H = Math.round(W / ar); if (cv.height !== H) cv.height = H;
    cv.getContext("2d").drawImage(src, 0, 0, sw, sh, 0, 0, W, H); const t = l3sc.tally; l3sc.tally = null; return t;
  } finally { undo(); if (l3sc.opts.dark) l3.scene.background = bg0; }
}
const l3scKpi = t => { const n = (t.klar || 0) + (t.pagaende || 0) + (t.forsenad || 0) + (t.planerad || 0); return { n, klar: t.klar || 0, pagaende: t.pagaende || 0, forsenad: t.forsenad || 0, planerad: t.planerad || 0, okopplad: t.okopplad || 0, pct: n ? Math.round((t.klar || 0) / n * 100) : 0 }; };
const l3scDeltaK = t => ({ late: t.d_late || 0, early: t.d_early || 0, same: t.d_same || 0, nw: t.d_new || 0, gone: t.d_gone || 0 });
/* Aktiviteterna som skiljer mellan A och B. */
function l3scDiffRows() {
  const A = l3scC(l3sc.sel[0]), B = l3scC(l3sc.sel[1]); if (!A || !B) return [];
  const byObj = new Map(); (l3pl.rows || []).forEach(r => { const k = String(r.object_id || ""); if (k) (byObj.get(k) || byObj.set(k, []).get(k)).push(r); });
  const keys = new Set([...A.byGuid.keys(), ...B.byGuid.keys(), ...[...A.byPl.keys(), ...B.byPl.keys()].map(p => "pl:" + p), ...((A.S.src || B.S.src) ? byObj.keys() : [])]), out = new Map(), actOf = (c, g) => (/^pl:/.test(g) ? c.byPl.get(g.slice(3)) : c.byGuid.get(g));
  keys.forEach(g => {
    const rows = byObj.get(g) || [], a = l3scEndFor(A, rows, g), b = l3scEndFor(B, rows, g); if (!a && !b) return;
    const name = (actOf(B, g) || actOf(A, g) || {}).name || (rows[0] && (rows[0].activity || rows[0].object_name)) || "–", o = out.get(name) || { name, area: "", a: "", b: "" };
    if (a && a > o.a) o.a = a; if (b && b > o.b) o.b = b; out.set(name, o);
  });
  return [...out.values()].map(o => ({ ...o, a: o.a || null, b: o.b || null, d: o.a && o.b ? l3scDays(o.a, o.b) : null, kind: !o.a ? "ny" : !o.b ? "utgått" : "flyttad" })).filter(o => o.d === null || Math.abs(o.d) > 7).sort((x, y) => (y.d === null ? 999 : y.d) - (x.d === null ? 999 : x.d));
}
/* Markeringen i 3D: IFC-objektens GUID och placerade objekts id. */
function l3scSelection() {
  const g = [], pl = []; try { if (typeof l3bs !== "undefined") l3bs.sel.forEach(e => { const r = e.mesh.userData.l3b && e.mesh.userData.l3b.ranges[e.ri]; if (r && r.guid) g.push(r.guid); }); } catch (e) { /* ingen IFC-markering */ }
  if (l3.sel) [...l3.sel].forEach(id => { if (placements.some(p => p.id === id)) pl.push(id); }); return { g: [...new Set(g)], pl };
}

const L3SC_CSS = `#v3ScPanel .sc-a{border:1px solid #e2e8f0;border-radius:10px;padding:8px;display:grid;gap:6px;background:#f8fafc}#v3ScPanel .sc-a .r{display:flex;gap:6px;align-items:center}#v3ScPanel .sc-a input[type=text],#v3ScPanel .sc-a input[type=date]{min-width:0;padding:5px 7px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;background:#fff}#v3ScPanel .sc-a input[type=text]{flex:1}#v3ScPanel .sc-a input[type=date]{flex:1}
#v3ScPanel .sc-a input[type=color]{width:30px;height:28px;padding:0;border:1px solid #cbd5e1;border-radius:6px;background:#fff;flex:none}#v3ScPanel .sc-a small{color:#64748b;flex:1}#v3ScPanel .sc-a button,#v3ScPanel .sc-b button{padding:4px 8px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer;font:inherit;font-weight:600}#v3ScPanel .sc-a button:hover:not(:disabled),#v3ScPanel .sc-b button:hover:not(:disabled){border-color:#2f7bff;color:#2f7bff}#v3ScPanel button:disabled{opacity:.45;cursor:default}
#v3ScPanel .sc-b{display:flex;gap:6px;flex-wrap:wrap}#v3ScPanel select{min-width:0;padding:5px 7px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;background:#fff}
#v3ScCmp .sc-g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}#v3ScCmp .sc-g figure{margin:0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#fff}#v3ScCmp canvas{display:block;width:100%;height:auto;background:#f1f5f9}
#v3ScCmp figcaption{padding:8px 10px;display:grid;gap:4px}#v3ScCmp .sc-h{display:flex;align-items:center;gap:6px;font-weight:700}#v3ScCmp .sc-h i{font:700 11px ui-monospace,monospace;font-style:normal;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;color:#fff;flex:none}
#v3ScCmp .sc-bar{display:flex;height:8px;border-radius:4px;overflow:hidden;background:#e2e8f0}#v3ScCmp .sc-bar b{display:block;height:100%}#v3ScCmp .sc-n{display:flex;gap:4px 12px;flex-wrap:wrap;font-size:11.5px;color:#64748b}#v3ScCmp .sc-n b{color:#0f172a}#v3ScCmp .sc-pct{font:700 22px system-ui;color:#0f172a}#v3ScCmp .sc-pct small{font:500 11px system-ui;color:#64748b;margin-left:6px}
#v3ScCmp .sc-sels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}#v3ScCmp .sc-sels select{min-width:0;width:100%;padding:5px 7px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;background:#fff}#v3ScCmp .sc-lg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:11.5px;color:#64748b}#v3ScCmp .sc-lg i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px;vertical-align:-1px}
#v3ScCmp table{width:100%;border-collapse:collapse;font-size:12px}#v3ScCmp th,#v3ScCmp td{padding:4px 6px;border-bottom:1px solid #e2e8f0;text-align:left}#v3ScCmp td.n,#v3ScCmp th.n{text-align:right}#v3ScCmp .late{color:#dc2626}#v3ScCmp .early{color:#2563eb}#v3ScCmp .nw{color:#9333ea}
@media(max-width:900px){#v3ScCmp .sc-g,#v3ScCmp .sc-sels{grid-template-columns:1fr}}`;
const L3SC_COL = ["#2f7bff", "#f59e0b", "#a855f7"];
const l3scLong = iso => { const d = new Date(iso + "T00:00:00"); return isNaN(d) ? iso : d.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); };
const l3scCol = ph => l3scPhaseCol(ph);
const l3scOptName = id => { const x = l3scById(id); return x ? x.name : "–"; };
const l3scCss = () => { if (!document.getElementById("v3ScCss")) { const st = document.createElement("style"); st.id = "v3ScCss"; st.textContent = L3SC_CSS; document.head.appendChild(st); } };
const l3scDay = () => $("dateInput").value || todayIso();
/* IFC-objekten med givna GUID som markeringsposter. */
function l3scFindGuids(guids) {
  const want = new Set(guids), out = []; if (!want.size || !l3.groups.bldg) return out;
  l3.groups.bldg.traverse(m => { const L = m.userData && m.userData.l3b; if (!L || !L.ranges) return; L.ranges.forEach((r, ri) => { if (r.guid && want.has(r.guid)) out.push({ mesh: m, ri }); }); }); return out;
}
/* ---- Panelen: välj scenario, koppla markering till aktiviteter. Scenariot visas direkt i 3D vid appens datum (raden längst ned). ---- */
function l3scPanelRender() {
  const el = document.getElementById("v3ScPanel"); if (!el) return; const E = escHtml, S = l3scById(l3sc.sel[0]), sel = l3scSelection(), nsel = sel.g.length + sel.pl.length, srcs = l3scSources();
  const keep = el.scrollTop;
  el.innerHTML = `<div class="v3-vp-h"><b>Scenarier</b><span>${E(l3scDay())}</span><button type="button" data-x title="Stäng (Esc)">✕</button></div>
    <div class="v3-vq-note" style="background:#f1f5f9;color:#334155">${S ? "Scenariot visas i modellen vid datumet i raden längst ned." : "Välj eller skapa ett scenario. Det börjar tomt och är inte kopplat mot tidplanen."}</div>
    <div class="v3-rd-g" style="display:grid;grid-template-columns:1fr;gap:6px;margin-top:6px">
      <label class="v3-rd-n"><span>Scenario</span><select data-s="sel" style="flex:1"><option value="">– inget (visa som vanligt) –</option>${l3sc.mine.map(x => `<option value="${E(x.id)}" ${S && S.id === x.id ? "selected" : ""}>${E(x.name)}</option>`).join("")}<option value="__new">＋ Nytt scenario…</option></select></label>
      ${S ? `<div class="sc-b" style="padding-left:2px"><button type="button" data-s="ren" title="Byt namn">✎ Namn</button><button type="button" data-s="dup" title="Duplicera">⧉ Kopiera</button><button type="button" data-s="del" title="Ta bort scenariot">✕ Ta bort</button></div>
      <label class="v3-rd-n" title="Koppla scenariot mot tidplanen i Powerproject (valfritt)"><span>Tidplan</span><select data-s="src" style="flex:1">${srcs.map(([v, t]) => `<option value="${E(v)}" ${S.src === v ? "selected" : ""}>${E(v ? "Koppla mot: " + t : "Ingen – bara egna aktiviteter")}</option>`).join("")}</select></label>
      <label class="v3-rd-n"><span>Ej kopplade</span><select data-s="unl" style="flex:1"><option value="ghost" ${S.unlinked === "ghost" ? "selected" : ""}>Ljust spöke</option><option value="hide" ${S.unlinked === "hide" ? "selected" : ""}>Dolda</option><option value="orig" ${S.unlinked === "orig" ? "selected" : ""}>Originalfärg</option></select></label>` : ""}
    </div>
    ${S ? `<div class="v3-pal-hint" style="margin-top:6px">Markera objekt i 3D och tryck <b>Koppla</b> på en aktivitet. ${nsel ? `<b>${nsel} objekt markerade.</b>` : ""}</div>
    <div class="sc-b" style="margin-top:6px"><button type="button" class="v3-primary" data-s="add" style="flex:1">＋ Ny aktivitet</button><button type="button" data-s="addsel" ${nsel ? "" : "disabled"} style="flex:1" title="Skapar en aktivitet av markeringen">＋ Av markeringen</button></div>
    <div style="display:grid;gap:6px;margin-top:8px">${S.acts.map((a, i) => `<div class="sc-a" data-i="${i}"><div class="r"><input type="color" data-a="color" value="${E(a.color || l3scPhaseCol("pagaende") || "#facc15")}" title="Egen färg när aktiviteten pågår (↺ = statusfärg)"><input type="text" data-a="name" value="${E(a.name)}" placeholder="Aktivitet"><button type="button" data-a="nocol" ${a.color ? "" : "disabled"} title="Använd statusfärger">↺</button><button type="button" data-a="del" title="Ta bort aktiviteten">✕</button></div>
      <div class="r"><input type="date" data-a="start" value="${E(a.start || "")}" title="Start"><input type="date" data-a="end" value="${E(a.end || "")}" title="Slut"></div>
      <div class="r"><small>${(a.g || []).length + (a.pl || []).length} objekt${a.start && a.end ? "" : " · saknar datum"}</small><button type="button" data-a="sel">Markera</button><button type="button" data-a="link" ${nsel ? "" : "disabled"}>＋ Koppla</button><button type="button" data-a="unlink" ${nsel ? "" : "disabled"}>− Lossa</button></div></div>`).join("") || `<div class="v3-pal-hint">Inga aktiviteter än.</div>`}</div>
    <button type="button" class="v3-wide" data-s="cmp" style="margin-top:10px" title="Samma modell och datum i flera scenarier bredvid varandra – som bild">Jämför scenarier…</button>` : `<button type="button" class="v3-wide" data-s="cmp" style="margin-top:10px">Jämför scenarier…</button>`}`;
  el.scrollTop = keep; l3scPanelBind(el, S);
}
function l3scPanelBind(el, S) {
  el.querySelector("[data-x]").onclick = () => l3scClose();
  const q = k => el.querySelector(`[data-s="${k}"]`), live = () => { l3scTouch(S); l3scLive(0); };
  q("sel").onchange = async e => {
    let v = e.target.value; if (v === "__new") { const nS = await l3scNewScenario(0, false); v = nS ? nS.id : ""; }
    l3sc.sel[0] = v; if (v) l3scLive(0); else l3scLiveStop(); l3scPanelRender();
  };
  q("cmp").onclick = () => l3scCompareOpen();
  if (!S) return;
  q("ren").onclick = async () => { const v = await uiPrompt("Nytt namn på scenariot:", S.name, { ok: "Spara" }); if (!v) return; S.name = String(v).trim().slice(0, 80); l3scTouch(S); l3scPanelRender(); };
  q("dup").onclick = () => { const c = JSON.parse(JSON.stringify(S, (k, v) => (k === "_v" ? undefined : v))); c.id = ghNewId().slice(0, 8); c.name = S.name + " (kopia)"; l3sc.mine.push(c); l3scTouch(c); l3sc.sel[0] = c.id; l3scLive(0); l3scPanelRender(); };
  q("del").onclick = async () => { if (!(await uiConfirm(`Ta bort scenariot "${S.name}" och dess aktiviteter?`, { ok: "Ta bort", danger: true }))) return; l3sc.mine = l3sc.mine.filter(x => x !== S); l3sc.sel[0] = ""; l3scPersistSoon(); l3scLiveStop(); l3scPanelRender(); };
  q("src").onchange = e => { S.src = e.target.value; live(); l3scPanelRender(); };
  q("unl").onchange = e => { S.unlinked = e.target.value; live(); };
  q("add").onclick = () => { S.acts.push({ id: ghNewId().slice(0, 6), name: `Aktivitet ${S.acts.length + 1}`, start: l3scDay(), end: l3DateAdd(l3scDay(), 28), g: [], pl: [] }); live(); l3scPanelRender(); };
  q("addsel").onclick = () => { const s = l3scSelection(); if (!s.g.length && !s.pl.length) return; S.acts.forEach(o => { o.g = (o.g || []).filter(g => !s.g.includes(g)); o.pl = (o.pl || []).filter(p => !s.pl.includes(p)); }); S.acts.push({ id: ghNewId().slice(0, 6), name: `Aktivitet ${S.acts.length + 1}`, start: l3scDay(), end: l3DateAdd(l3scDay(), 28), g: s.g, pl: s.pl }); live(); l3scPanelRender(); };
  el.querySelectorAll(".sc-a").forEach(row => {
    const a = S.acts[Number(row.dataset.i)]; if (!a) return;
    row.querySelectorAll("input[data-a]").forEach(i => { i.onchange = () => { a[i.dataset.a] = i.value; live(); if (i.dataset.a === "color") l3scPanelRender(); }; });
    row.querySelector('[data-a="nocol"]').onclick = () => { delete a.color; live(); l3scPanelRender(); };
    row.querySelector('[data-a="sel"]').onclick = () => { const ids = (a.pl || []).filter(id => placements.some(p => p.id === id)), found = l3scFindGuids(a.g || []); try { if (found.length && typeof l3bsSet === "function") { if (typeof l3SelectIds === "function") l3SelectIds([]); l3bsSet(found); } else if (typeof l3SelectIds === "function") l3SelectIds(ids); } catch (e) { /* inget att markera */ } l3Status(`${found.length} IFC-objekt och ${ids.length} placerade objekt i aktiviteten.`); };
    row.querySelector('[data-a="link"]').onclick = () => { const s = l3scSelection(); a.g = [...new Set([...(a.g || []), ...s.g])]; a.pl = [...new Set([...(a.pl || []), ...s.pl])]; S.acts.forEach(o => { if (o !== a) { o.g = (o.g || []).filter(g => !s.g.includes(g)); o.pl = (o.pl || []).filter(p => !s.pl.includes(p)); } }); live(); l3scPanelRender(); };   // ett objekt hör till en aktivitet i taget
    row.querySelector('[data-a="unlink"]').onclick = () => { const s = l3scSelection(); a.g = (a.g || []).filter(g => !s.g.includes(g)); a.pl = (a.pl || []).filter(p => !s.pl.includes(p)); live(); l3scPanelRender(); };
    row.querySelector('[data-a="del"]').onclick = () => { S.acts.splice(Number(row.dataset.i), 1); live(); l3scPanelRender(); };
  });
}
async function l3scNewScenario(slot, linked) {
  const name = await uiPrompt("Namn på scenariot (t.ex. Reviderad kontraktstidplan):", "", { ok: "Skapa" }); if (!name) return null; const S = l3scNew(name);
  if (linked) { const src = l3scSources().filter(s => s[0]); if (src.length) { const pick = await l3scPick("Koppla scenariot mot:", src); if (pick) S.src = pick; } }
  l3sc.mine.push(S); l3scTouch(S); if (slot >= 0) l3sc.sel[slot] = S.id; return S;
}
function l3scPick(title, opts) {
  return new Promise(res => { const d = l3Dlg("v3ScPick", title, `<div class="v3-gd-btns" style="flex-direction:column;align-items:stretch;gap:6px">${opts.map(([v, t]) => `<button type="button" data-v="${escHtml(v)}">${escHtml(t)}</button>`).join("")}<button type="button" data-v="">Avbryt</button></div>`); d._onClose = () => res(null); d.querySelectorAll("[data-v]").forEach(b => { b.onclick = () => { d._onClose = null; l3DlgClose("v3ScPick"); res(b.dataset.v || null); }; }); });
}
/* Levande visning: scenariot ritas i huvudvyn och följer appens datum (kontrolleras varje 350 ms). */
function l3scLiveStart() { clearInterval(l3sc.liveIv); l3sc.liveKey = ""; l3sc.liveIv = setInterval(() => { const pn = document.getElementById("v3ScPanel"); if (pn && !l3sc.cmpOpen) { const sl = l3scSelection(), key = sl.g.length + "," + sl.pl.length, ae = document.activeElement; if (key !== l3sc.selKey && !(ae && pn.contains(ae) && /INPUT|SELECT|TEXTAREA/.test(ae.tagName))) { l3sc.selKey = key; l3scPanelRender(); } }
    if (l3sc.cmpOpen || !l3sc.sel[0]) return; const k = l3scDay() + "|" + (l3scById(l3sc.sel[0]) || {})._v; if (k !== l3sc.liveKey) { l3sc.liveKey = k; l3sc.date = l3scDay(); l3scLive(0); const h = document.querySelector("#v3ScPanel .v3-vp-h span"); if (h) h.textContent = l3sc.date; } }, 350); }
function l3scLiveStop() { l3scBadgeStop(false); if (l3sc.patch) { l3sc.patch(); l3sc.patch = null; } if (l3sc.prev) l3scRestore(); else l3sc.render = null; l3Render(); }
async function l3scOpen() {
  const host = document.getElementById("v3Canvas") || document.getElementById("view3d"); if (!host) return; l3scCss(); l3scClose(true);
  const el = document.createElement("div"); el.id = "v3ScPanel"; el.className = "v3-vp"; el.style.cssText = "max-width:360px;"; host.appendChild(el); ["pointerdown", "wheel", "contextmenu", "dblclick", "click", "keydown", "keyup"].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
  el.innerHTML = `<div class="v3-vq-note">Hämtar scenarier …</div>`; try { await l3scLoad(); } catch (e) { l3sc.err = e.message; }
  if (!document.getElementById("v3ScPanel")) return; l3sc.date = l3scDay(); l3sc.sel = [l3sc.sel[0] && l3scById(l3sc.sel[0]) ? l3sc.sel[0] : "", "", ""]; l3scPanelRender(); if (l3sc.sel[0]) l3scLive(0); l3scLiveStart();
  if (!l3sc.kbd) { l3sc.kbd = e => { if (e.key === "Escape" && document.getElementById("v3ScPanel") && !/INPUT|SELECT|TEXTAREA/.test((e.target || {}).tagName || "") && !l3sc.cmpOpen) { e.stopPropagation(); l3scClose(); } }; window.addEventListener("keydown", l3sc.kbd, true); }
}
function l3scClose(keep) {
  clearInterval(l3sc.liveIv); l3sc.liveIv = 0; if (l3sc.play) l3scTogglePlay(); if (l3sc.cmpOpen) l3scCompareClose(true);
  const el = document.getElementById("v3ScPanel"); if (el) el.remove(); if (!keep) { l3scLiveStop(); if (l3sc.kbd) { window.removeEventListener("keydown", l3sc.kbd, true); l3sc.kbd = null; } }
  if (l3sc.saveT) { clearTimeout(l3sc.saveT); l3scPersist(); }
}
function l3scBadgeStop() { const b = document.getElementById("v3ScBadge"); if (b) b.remove(); }
/* ---- Jämförelsen: samma modell och datum i flera scenarier, som bild ---- */
function l3scCompareOpen() {
  l3scCss(); const E = escHtml; l3sc.cmpOpen = true; l3sc.date = l3scDay(); if (l3sc.patch) { l3sc.patch(); l3sc.patch = null; } if (!l3sc.sel[0] && l3sc.mine[0]) l3sc.sel[0] = l3sc.mine[0].id;
  const opt = k => `<select data-c="sel${k}"><option value="">– scenario ${"ABC"[k]} –</option>${l3sc.mine.map(x => `<option value="${E(x.id)}" ${l3sc.sel[k] === x.id ? "selected" : ""}>${E(x.name)}</option>`).join("")}</select>`;
  const d = l3Dlg("v3ScCmp", "Jämför scenarier", `<div class="sc-sels">${opt(0)}${opt(1)}${opt(2)}</div>
    <div class="v3-gd-btns" style="align-items:center"><button type="button" data-c="prev" style="flex:none;padding:0 10px">‹ vecka</button><b data-c="date" style="flex:1;text-align:center;font-size:15px">${l3sc.date}</b><button type="button" data-c="next" style="flex:none;padding:0 10px">vecka ›</button><button type="button" data-c="play" style="flex:none;padding:0 10px">▶ Spela</button></div>
    <div data-c="stage"></div>
    <label class="v3-chk"><input type="checkbox" data-c="delta" ${l3sc.opts.delta ? "checked" : ""}/> Visa skillnaden mellan A och B</label>
    <div class="v3-gd-btns"><button type="button" class="v3-primary" data-c="png">⤓ Bild (PNG)</button><button type="button" data-c="pdf">PDF</button><button type="button" data-c="copy">Kopiera</button></div>`);
  d.style.width = "min(1180px, 96%)"; d.style.left = "2%"; d.style.top = "30px"; d.style.maxHeight = "calc(100% - 50px)"; d.style.overflow = "auto"; l3sc.el = d;
  d._onClose = () => l3scCompareClose(false);
  const q = k => d.querySelector(`[data-c="${k}"]`);
  [0, 1, 2].forEach(k => { q("sel" + k).onchange = e => { l3sc.sel[k] = e.target.value; l3scCompareStage(); l3scPaintAll(); }; });
  q("prev").onclick = () => l3scCmpDate(l3DateAdd(l3sc.date, -7)); q("next").onclick = () => l3scCmpDate(l3DateAdd(l3sc.date, 7)); q("play").onclick = l3scTogglePlay;
  q("delta").onchange = e => { l3sc.opts.delta = e.target.checked; l3scCompareStage(); l3scPaintAll(); };
  q("png").onclick = () => l3scReport("png"); q("pdf").onclick = () => l3scReport("pdf"); q("copy").onclick = () => l3scReport("copy");
  l3scBegin(); l3scCompareStage(); l3scPaintAll();
}
function l3scCompareClose(fromDlg) { l3sc.cmpOpen = false; if (l3sc.play) l3scTogglePlay(); const d = document.getElementById("v3ScCmp"); l3sc.el = null; if (d && !fromDlg) { d._onClose = null; l3DlgClose("v3ScCmp"); } if (document.getElementById("v3ScPanel") && l3sc.sel[0]) { l3sc.liveKey = ""; l3scLive(0); } else l3scLiveStop(); }
function l3scCmpDate(d) { l3sc.date = d; l3plSetDay(d); const b = l3sc.el && l3sc.el.querySelector('[data-c="date"]'); if (b) b.textContent = d; l3scPaintAll(); }
function l3scCompareStage() {
  const st = l3sc.el && l3sc.el.querySelector('[data-c="stage"]'); if (!st) return; const E = escHtml, act = l3sc.sel.map((s, k) => (s ? k : -1)).filter(k => k >= 0);
  if (!act.length) { st.innerHTML = `<div class="v3-pal-hint">Välj minst ett scenario ovan.</div>`; return; }
  st.innerHTML = `<div class="sc-g">${act.map(k => `<figure data-k="${k}"><canvas width="900" height="500"></canvas><figcaption><div class="sc-h"><i style="background:${L3SC_COL[k]}">${"ABC"[k]}</i><span>${E(l3scOptName(l3sc.sel[k]))}</span></div><div class="sc-pct" data-pct="${k}">–<small>klart</small></div><div class="sc-bar" data-bar="${k}"></div><div class="sc-n" data-n="${k}"></div></figcaption></figure>`).join("")}</div>
    <div class="sc-lg" style="margin:8px 0"><span><i style="background:${l3scCol("klar")}"></i>Klart</span><span><i style="background:${l3scCol("pagaende")}"></i>Pågår</span><span><i style="background:${l3scCol("planerad")};opacity:.4"></i>Ej påbörjat</span><span><i style="background:#94a3b8;opacity:.3"></i>Inte kopplat</span></div>
    ${l3sc.opts.delta && l3sc.sel[0] && l3sc.sel[1] ? `<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px"><figure data-k="delta" style="margin:0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden"><canvas width="900" height="500"></canvas><figcaption style="padding:8px 10px;display:grid;gap:4px"><div class="sc-h"><span>Skillnad: ${E(l3scOptName(l3sc.sel[1]))} mot ${E(l3scOptName(l3sc.sel[0]))}</span></div><div class="sc-n" data-n="delta"></div><div class="sc-lg"><span><i style="background:#dc2626"></i>Senare</span><span><i style="background:#2563eb"></i>Tidigare</span><span><i style="background:#cbd5e1"></i>Oförändrat</span><span><i style="background:#a855f7"></i>Tillkommit</span></div></figcaption></figure>
      <div style="max-height:320px;overflow:auto"><table><thead><tr><th>Aktivitet</th><th class="n">A slut</th><th class="n">B slut</th><th class="n">Avvikelse</th></tr></thead><tbody data-c="tb"></tbody></table></div></div>` : ""}`;
  const tb = st.querySelector('[data-c="tb"]'); if (tb) { const rows = l3scDiffRows(); tb.innerHTML = rows.slice(0, 40).map(o => `<tr><td title="${E(o.area)}">${E(o.name)}</td><td class="n">${o.a ? o.a.slice(2) : "–"}</td><td class="n">${o.b ? o.b.slice(2) : "–"}</td><td class="n ${o.kind === "ny" ? "nw" : o.d > 0 ? "late" : "early"}">${o.kind === "ny" ? "tillkommen" : o.kind === "utgått" ? "utgår" : (o.d > 0 ? "+" : "") + o.d + " d"}</td></tr>`).join("") || `<tr><td colspan="4" style="color:#64748b">Inga avvikelser över 7 dagar.</td></tr>`; }
}
let l3scPaintBusy = false, l3scPaintAgain = false;
async function l3scPaintAll() {
  if (!l3sc.el) return; if (l3scPaintBusy) { l3scPaintAgain = true; return; } l3scPaintBusy = true;
  try {
    do {
      l3scPaintAgain = false; l3scBegin(); l3plSetDay(l3sc.date);
      for (const fig of l3sc.el.querySelectorAll("figure[data-k]")) {
        const k = fig.dataset.k === "delta" ? "delta" : Number(fig.dataset.k), t = l3scPaint(fig.querySelector("canvas"), k);
        if (k === "delta") { const K = l3scDeltaK(t), n = fig.querySelector('[data-n="delta"]'); if (n) n.innerHTML = `<span>Senare <b>${K.late}</b></span><span>Tidigare <b>${K.early}</b></span><span>Oförändrat <b>${K.same}</b></span><span>Tillkommit <b>${K.nw}</b></span>`; continue; }
        const K = l3scKpi(t), pct = fig.querySelector(`[data-pct="${k}"]`), bar = fig.querySelector(`[data-bar="${k}"]`), nn = fig.querySelector(`[data-n="${k}"]`), n = Math.max(1, K.n);
        if (pct) pct.innerHTML = `${K.pct} %<small>av ${K.n} kopplade objekt klara</small>`;
        if (bar) bar.innerHTML = ["klar", "pagaende", "forsenad"].map(p => `<b style="width:${K[p] / n * 100}%;background:${l3scCol(p)}"></b>`).join("");
        if (nn) nn.innerHTML = `<span>Klart <b>${K.klar}</b></span><span>Pågår <b>${K.pagaende}</b></span>${K.forsenad ? `<span>Försenat <b>${K.forsenad}</b></span>` : ""}<span>Ej påbörjat <b>${K.planerad}</b></span>${K.okopplad ? `<span>Inte kopplat <b>${K.okopplad}</b></span>` : ""}`;
        fig.dataset.kpi = JSON.stringify(K);
      }
      await new Promise(r => setTimeout(r, 0));
    } while (l3scPaintAgain);
  } finally { l3scPaintBusy = false; }
}
function l3scTogglePlay() {
  const b = l3sc.el && l3sc.el.querySelector('[data-c="play"]'); if (l3sc.play) { clearTimeout(l3sc.play); l3sc.play = 0; if (b) b.textContent = "▶ Spela"; return; } if (!b) return;
  const rg = l3scRange(null); l3sc.rg = rg; b.textContent = "❚❚ Paus"; const step = async () => { const nx = l3DateAdd(l3sc.date, 7); if (nx > rg[1]) { l3scTogglePlay(); return; } l3scCmpDate(nx); await new Promise(r => setTimeout(r, 30)); l3sc.play = setTimeout(step, 420); }; l3sc.play = setTimeout(step, 10);
}
/* Tidsspannet för uppspelning: egna aktiviteter i de valda scenarierna, annars Ganttens. */
function l3scRange(r) {
  const ds = []; l3sc.sel.forEach(id => { const S = l3scById(id); if (S) S.acts.forEach(a => { if (a.start) ds.push(a.start); if (a.end) ds.push(a.end); }); });
  if (ds.length) { ds.sort(); return [l3DateAdd(ds[0], -14), l3DateAdd(ds[ds.length - 1], 14)]; }
  const g = typeof l3gmRange2 === "function" ? l3gmRange2() : null; return g && g[0] && g[1] ? g : [l3DateAdd(l3sc.date, -120), l3DateAdd(l3sc.date, 240)];
}

/* ---- Rapportbild ---- */
function l3scRoundRect(x, X, Y, W, H, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }
function l3scCompose() {
  const figs = [...l3sc.el.querySelectorAll("figure[data-k]")].filter(f => f.dataset.k !== "delta"), dfig = l3sc.el.querySelector('figure[data-k="delta"]'), n = Math.max(1, figs.length);
  const W = 3300, M = 90, G = 50, pw = Math.floor((W - 2 * M - (n - 1) * G) / n), ar = figs[0] ? figs[0].querySelector("canvas").height / figs[0].querySelector("canvas").width : 0.56, ph = Math.round(pw * ar);
  const diffRows = dfig ? l3scDiffRows().slice(0, 9) : [], dH = dfig ? Math.round(ph * 0.92) : 0, H = 300 + ph + 450 + (dfig ? dH + 140 : 0) + 190;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const x = cv.getContext("2d"), F = "system-ui,'Segoe UI',Arial,sans-serif";
  const bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#ffffff"); bg.addColorStop(1, "#f1f5f9"); x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.fillStyle = "#2f7bff"; x.fillRect(0, 0, W, 14);
  x.fillStyle = "#64748b"; x.font = `600 34px ${F}`; x.textBaseline = "alphabetic"; x.fillText(String((typeof projectName !== "undefined" && projectName) || "Projekt").toUpperCase(), M, 100);
  x.fillStyle = "#0f172a"; x.font = `700 92px ${F}`; x.fillText(`Projektläget ${l3scLong(l3sc.date)}`, M, 205);
  x.fillStyle = "#475569"; x.font = `500 38px ${F}`; x.fillText(`Samma modell och samma datum i ${n} tidplansscenarier`, M, 262);
  let y = 300;
  figs.forEach((f, i) => {
    const k = Number(f.dataset.k), X0 = M + i * (pw + G), K = JSON.parse(f.dataset.kpi || "{}"), cvs = f.querySelector("canvas");
    x.save(); l3scRoundRect(x, X0, y, pw, ph, 26); x.clip(); x.drawImage(cvs, X0, y, pw, ph); x.restore(); x.strokeStyle = "#cbd5e1"; x.lineWidth = 3; l3scRoundRect(x, X0, y, pw, ph, 26); x.stroke();
    x.fillStyle = L3SC_COL[k]; x.beginPath(); x.arc(X0 + 38, y + ph + 62, 28, 0, 7); x.fill(); x.fillStyle = "#04181c"; x.font = `800 34px ${F}`; x.textAlign = "center"; x.fillText("ABC"[k], X0 + 38, y + ph + 74); x.textAlign = "left";
    x.fillStyle = "#0f172a"; x.font = `700 46px ${F}`; let nm = l3scOptName(l3sc.sel[k]); while (x.measureText(nm).width > pw - 110 && nm.length > 8) nm = nm.slice(0, -2); x.fillText(nm === l3scOptName(l3sc.sel[k]) ? nm : nm + "…", X0 + 86, y + ph + 78);
    x.fillStyle = "#0f172a"; x.font = `800 120px ${F}`; x.fillText(`${K.pct || 0} %`, X0, y + ph + 215); x.fillStyle = "#64748b"; x.font = `500 34px ${F}`; x.fillText(`av ${K.n || 0} kopplade objekt klara`, X0 + 330, y + ph + 212);
    const tot = Math.max(1, K.n || 1); let bx = X0; x.fillStyle = "#e2e8f0"; l3scRoundRect(x, X0, y + ph + 240, pw, 22, 11); x.fill();
    ["klar", "pagaende", "forsenad"].forEach(p => { const w = (K[p] || 0) / tot * pw; if (w > 0) { x.fillStyle = l3scCol(p); x.fillRect(bx, y + ph + 240, w, 22); bx += w; } });
    x.fillStyle = "#334155"; x.font = `500 32px ${F}`; x.fillText(`Klart ${K.klar || 0}   ·   Pågår ${K.pagaende || 0}${K.forsenad ? "   ·   Försenat " + K.forsenad : ""}   ·   Ej påbörjat ${K.planerad || 0}`, X0, y + ph + 310);
  });
  y += ph + 450;
  if (dfig) {
    x.fillStyle = "#0f172a"; x.font = `700 56px ${F}`; x.fillText(`Skillnad: ${l3scOptName(l3sc.sel[1])} mot ${l3scOptName(l3sc.sel[0])}`, M, y); y += 40;
    const dw = Math.round(dH / ar), dc = dfig.querySelector("canvas"); x.save(); l3scRoundRect(x, M, y, dw, dH, 26); x.clip(); x.drawImage(dc, M, y, dw, dH); x.restore(); x.strokeStyle = "#cbd5e1"; l3scRoundRect(x, M, y, dw, dH, 26); x.stroke();
    const tx = M + dw + 70; x.fillStyle = "#64748b"; x.font = `700 28px ${F}`; x.fillText("AKTIVITET", tx, y + 40); x.textAlign = "right"; x.fillText("A SLUT", W - M - 420, y + 40); x.fillText("B SLUT", W - M - 220, y + 40); x.fillText("AVVIKELSE", W - M, y + 40); x.textAlign = "left";
    diffRows.forEach((o, i) => { const yy = y + 100 + i * 66; x.fillStyle = "#eef2f7"; if (i % 2 === 0) x.fillRect(tx - 20, yy - 44, W - M - tx + 20, 62); x.fillStyle = "#0f172a"; x.font = `500 34px ${F}`; let t = o.name; while (x.measureText(t).width > W - M - tx - 640 && t.length > 6) t = t.slice(0, -2); x.fillText(t, tx, yy); x.textAlign = "right"; x.fillStyle = "#64748b"; x.fillText(o.a ? o.a.slice(2) : "–", W - M - 420, yy); x.fillText(o.b ? o.b.slice(2) : "–", W - M - 220, yy); x.fillStyle = o.kind === "ny" ? "#9333ea" : o.d > 0 ? "#dc2626" : "#2563eb"; x.font = `700 34px ${F}`; x.fillText(o.kind === "ny" ? "tillkommen" : o.kind === "utgått" ? "utgår" : (o.d > 0 ? "+" : "") + o.d + " d", W - M, yy); x.textAlign = "left"; });
    y += dH + 100;
  }
  x.font = `500 32px ${F}`; let lx = M; const items = [["klar", "Klart"], ["pagaende", "Pågår"], ["planerad", "Ej påbörjat (spöke)"]]; if (l3sc.opts.progressCur) items.push(["forsenad", "Försenat"]);
  items.forEach(([p, t]) => { x.fillStyle = l3scCol(p); l3scRoundRect(x, lx, y - 26, 30, 30, 8); x.fill(); x.fillStyle = "#334155"; x.fillText(t, lx + 44, y); lx += 44 + x.measureText(t).width + 50; });
  if (dfig) [["#dc2626", "Senare än A"], ["#2563eb", "Tidigare än A"], ["#cbd5e1", "Oförändrat"], ["#a855f7", "Tillkommit"]].forEach(([c, t]) => { x.fillStyle = c; l3scRoundRect(x, lx, y - 26, 30, 30, 8); x.fill(); x.fillStyle = "#334155"; x.fillText(t, lx + 44, y); lx += 44 + x.measureText(t).width + 50; });
  x.fillStyle = "#94a3b8"; x.font = `500 28px ${F}`; x.fillText(`4D-planering · ${new Date().toLocaleDateString("sv-SE")} · färgerna följer Ganttens statusfärger, ej påbörjat visas som ljust spöke`, M, H - 60);
  return cv;
}
/* En sida PDF med en JPEG-bild (A3 liggande), utan bibliotek. */
function l3scPdfBytes(cv) {
  const jpg = atob(cv.toDataURL("image/jpeg", 0.92).split(",")[1]), pw = 1191, ph = Math.round(1191 * cv.height / cv.width), enc = new TextEncoder(), parts = [], off = []; let len = 0;
  const add = b => { const u = typeof b === "string" ? enc.encode(b) : b; parts.push(u); len += u.length; }, obj = (n, s) => { off[n] = len; add(`${n} 0 obj\n${s}\nendobj\n`); };
  add("%PDF-1.4\n"); obj(1, "<< /Type /Catalog /Pages 2 0 R >>"); obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>"); obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  const bytes = new Uint8Array(jpg.length); for (let i = 0; i < jpg.length; i++) bytes[i] = jpg.charCodeAt(i);
  off[4] = len; add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`); add(bytes); add("\nendstream\nendobj\n");
  const c = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`; obj(5, `<< /Length ${c.length} >>\nstream\n${c}\nendstream`);
  const xr = len; add(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map(i => String(off[i]).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`);
  const out = new Uint8Array(len); let p = 0; parts.forEach(u => { out.set(u, p); p += u.length; }); return out;
}
async function l3scReport(kind) {
  if (!l3sc.el) return; await l3scPaintAll(); const cv = l3scCompose(), base = `Scenarier ${l3sc.date}`;
  const save = (blob, name) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000); };
  if (kind === "png") { const b = await new Promise(r => cv.toBlob(r, "image/png")); save(b, base + ".png"); l3Toast("Rapportbilden är sparad."); }
  else if (kind === "pdf") { save(new Blob([l3scPdfBytes(cv)], { type: "application/pdf" }), base + ".pdf"); l3Toast("PDF:en är sparad."); }
  else { try { const b = await new Promise(r => cv.toBlob(r, "image/png")); await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]); l3Toast("Bilden är kopierad – klistra in i PowerPoint."); } catch (e) { l3Status("Kunde inte kopiera bilden: " + e.message, true); } }
  return cv;
}


/* ---- Ingång: Vyer-menyn, bredvid Montageordning (en knapp i själva verktygsraden gör raden för bred) ---- */
function l3scEnsureEntry() {
  const pop = document.getElementById("v3Views"); if (!pop) return false; if (document.getElementById("v3ScenBtn")) return true;
  const after = pop.querySelector('[data-v3view="mont"]'); if (!after) return false;
  const b = document.createElement("button"); b.type = "button"; b.id = "v3ScenBtn"; b.textContent = "Tidplansscenarier…"; b.title = "Samma modell och datum i flera tidplaner bredvid varandra (kontrakt, nuvarande, tidigare plan), skillnadsvy och rapportbild";
  b.onclick = () => { if (typeof l3HideMenus === "function") l3HideMenus(); l3scOpen(); }; after.after(b); return true;
}
{ let n = 0; const iv = setInterval(() => { if (l3scEnsureEntry() || ++n > 120) clearInterval(iv); }, 1000); }
