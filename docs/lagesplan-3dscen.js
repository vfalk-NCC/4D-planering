/* 3D-vyn – Tidplansscenarier (Victor 2026-11-12): egna scenarier som ritas bredvid varandra i samma vy, med skillnadsvy och rapportbild.
   Alla scenarier börjar tomma och är inte kopplade till någon tidplan. Man bygger dem själv: skapa aktiviteter i scenariot (namn, start, slut, valfri färg), markera objekt i 3D och koppla dem,
   eller – om man vill – koppla scenariot mot Powerproject-tidplanen (nuvarande plan eller en baseline), med egna aktiviteter ovanpå. Inget i den riktiga tidplanen ändras.
   Scenariot ritas genom att modellens 4D-färger (Ganttens Tid-läge, l3gmRange) räknas om med scenariots datum. Scenarierna sparas i projektet (plan_scenarios.json). Prefix l3sc. */
const l3sc = { sel: ["", "", ""], date: "", opts: { missing: "hide", progressCur: false, ghost: true, ghostOp: 22, solidDone: true, delta: true, dark: true }, reg: [], mine: [], cache: {}, render: null, tally: null, prev: null, el: null, ed: null, edSlot: -1, play: 0, loaded: false, saveT: 0, patch: null };
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

const L3SC_CSS = `#v3Scen{position:absolute;inset:0;z-index:30;background:radial-gradient(1200px 700px at 70% -10%,#16323c 0,#0c1418 55%,#080d10 100%);color:#e6edf0;display:flex;flex-direction:column;font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
#v3Scen *{box-sizing:border-box}#v3Scen button{font:600 12px system-ui;color:#e6edf0;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:7px 12px;cursor:pointer}#v3Scen button:hover{background:rgba(255,255,255,.13)}
#v3Scen button.pri{background:#19a7bd;border-color:#19a7bd;color:#04181c}#v3Scen button.pri:hover{background:#2dc0d6}
#v3Scen .sc-top{display:flex;align-items:center;gap:14px;padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.1);flex-wrap:wrap}
#v3Scen .sc-ttl{font-size:17px;font-weight:650;letter-spacing:.01em}#v3Scen .sc-ttl small{display:block;font:500 11px system-ui;color:#8fa6ad;letter-spacing:.06em;text-transform:uppercase}
#v3Scen .sc-date{margin-left:auto;display:flex;align-items:center;gap:8px}#v3Scen .sc-big{font:600 26px ui-monospace,Menlo,monospace;letter-spacing:.02em;color:#fff;min-width:170px;text-align:center}
#v3Scen input[type=date]{font:500 13px system-ui;color:#e6edf0;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:6px 8px;color-scheme:dark}
#v3Scen .sc-body{flex:1;min-height:0;display:grid;grid-template-columns:290px 1fr}@media(max-width:900px){#v3Scen .sc-body{grid-template-columns:1fr;overflow:auto}}
#v3Scen .sc-side{padding:14px 16px;border-right:1px solid rgba(255,255,255,.1);overflow:auto;display:flex;flex-direction:column;gap:12px}
#v3Scen .sc-side h4{margin:0;font:650 11px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#8fa6ad}
#v3Scen select{width:100%;font:500 13px system-ui;color:#e6edf0;background:#12202a;border:1px solid rgba(255,255,255,.18);border-radius:8px;padding:7px 8px;color-scheme:dark}
#v3Scen .sc-sel{display:grid;gap:4px}#v3Scen .sc-sel i{font:700 11px ui-monospace,monospace;font-style:normal;padding:1px 7px;border-radius:9px;display:inline-block;color:#04181c;margin-right:6px}#v3Scen .sc-sel small{color:#8fa6ad}
#v3Scen label.sc-chk{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;color:#c6d3d8;cursor:pointer}#v3Scen label.sc-chk input{margin-top:3px}
#v3Scen main{padding:14px 18px 16px;overflow:auto;min-width:0;display:flex;flex-direction:column;gap:14px}
#v3Scen .sc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}@media(max-width:1100px){#v3Scen .sc-grid{grid-template-columns:1fr}}
#v3Scen figure{margin:0;border:1px solid rgba(255,255,255,.13);border-radius:12px;overflow:hidden;background:#0a1115;display:flex;flex-direction:column;min-width:0;box-shadow:0 14px 40px rgba(0,0,0,.35)}
#v3Scen figure canvas{display:block;width:100%;height:auto;background:linear-gradient(#142630,#0a1115)}
#v3Scen figcaption{padding:10px 12px;display:grid;gap:7px;min-width:0}#v3Scen .sc-h span{flex:1;min-width:0}#v3Scen .sc-h button{flex:none}#v3Scen .sc-h{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-weight:650;font-size:14px}#v3Scen .sc-h i{font:700 12px ui-monospace,monospace;font-style:normal;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;color:#04181c;flex:none}
#v3Scen .sc-h button{margin-left:auto;padding:3px 9px}
#v3Scen .sc-bar{display:flex;height:9px;border-radius:5px;overflow:hidden;background:rgba(255,255,255,.1)}#v3Scen .sc-bar b{display:block;height:100%;transition:width .45s ease}
#v3Scen .sc-n{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:11.5px;color:#9fb2b8}#v3Scen .sc-n b{color:#fff;font-family:ui-monospace,monospace;font-weight:600}
#v3Scen .sc-pct{font:650 28px system-ui;color:#fff;line-height:1}#v3Scen .sc-pct small{font:500 12px system-ui;color:#8fa6ad;margin-left:6px}
#v3Scen .sc-legend{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:12px;color:#9fb2b8}#v3Scen .sc-legend span{display:inline-flex;align-items:center;gap:6px}#v3Scen .sc-legend i{width:12px;height:12px;border-radius:3px;display:inline-block}
#v3Scen .sc-dl{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:14px}@media(max-width:1100px){#v3Scen .sc-dl{grid-template-columns:1fr}}
#v3Scen table{width:100%;border-collapse:collapse;font-size:12px}#v3Scen th,#v3Scen td{padding:5px 8px;border-bottom:1px solid rgba(255,255,255,.08);text-align:left}#v3Scen th{font:650 10.5px system-ui;letter-spacing:.07em;text-transform:uppercase;color:#8fa6ad}
#v3Scen td.n,#v3Scen th.n{text-align:right;font-family:ui-monospace,monospace}#v3Scen .late{color:#ff8d78}#v3Scen .early{color:#7cc2ff}#v3Scen .nw{color:#d29bff}
#v3Scen .sc-tl{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center;padding:10px 12px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(255,255,255,.04)}
#v3Scen .sc-tl input[type=range]{width:100%;accent-color:#19a7bd}#v3Scen .sc-tl span{font:500 11.5px ui-monospace,monospace;color:#9fb2b8}
#v3Scen .sc-note{color:#8fa6ad;font-size:12px}#v3Scen .sc-err{color:#ffb4a5;font-size:12.5px;padding:10px 12px;border:1px solid rgba(255,140,120,.4);border-radius:10px;background:rgba(255,120,100,.08)}
#v3ScBadge{position:absolute;left:50%;top:70px;transform:translateX(-50%);z-index:12;background:rgba(8,16,20,.88);color:#e6edf0;border:1px solid rgba(255,255,255,.2);border-radius:14px;padding:8px 12px;display:flex;gap:10px;align-items:center;font:600 13px system-ui;box-shadow:0 10px 30px rgba(0,0,0,.35)}#v3ScBadge button{font:600 12px system-ui;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.1);color:#e6edf0;padding:5px 10px;cursor:pointer}`;
const L3SC_CSS2 = `#v3ScEd{position:absolute;right:12px;top:64px;bottom:12px;width:380px;max-width:calc(100% - 24px);z-index:31;background:rgba(10,18,23,.96);color:#e6edf0;border:1px solid rgba(255,255,255,.16);border-radius:14px;display:flex;flex-direction:column;font:13px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.5)}
#v3ScEd *{box-sizing:border-box}#v3ScEd header{padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.1);display:grid;gap:8px}#v3ScEd header b{font-size:15px}
#v3ScEd button{font:600 12px system-ui;color:#e6edf0;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);border-radius:8px;padding:6px 10px;cursor:pointer}#v3ScEd button:hover{background:rgba(255,255,255,.15)}#v3ScEd button.pri{background:#19a7bd;border-color:#19a7bd;color:#04181c}
#v3ScEd input[type=text],#v3ScEd input[type=date],#v3ScEd select{font:500 12.5px system-ui;color:#e6edf0;background:#12202a;border:1px solid rgba(255,255,255,.18);border-radius:7px;padding:5px 7px;color-scheme:dark;min-width:0;width:100%}
#v3ScEd .eb{flex:1;overflow:auto;padding:10px 12px;display:grid;gap:10px;align-content:start}#v3ScEd .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}#v3ScEd label.f{display:grid;gap:3px;font:600 10.5px system-ui;letter-spacing:.06em;text-transform:uppercase;color:#8fa6ad}
#v3ScEd .act{border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:8px;display:grid;gap:6px;background:rgba(255,255,255,.04)}#v3ScEd .act .two{display:grid;grid-template-columns:1fr 1fr;gap:6px}#v3ScEd .act small{color:#8fa6ad}
#v3ScEd .act input[type=color]{width:34px;height:28px;border:1px solid rgba(255,255,255,.2);border-radius:6px;background:none;padding:0}#v3ScEd .hint{color:#8fa6ad;font-size:12px}
#v3ScEd footer{padding:10px 12px;border-top:1px solid rgba(255,255,255,.1);display:flex;gap:8px;align-items:center}#v3ScEd .sl{display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center}#v3ScEd .sl input{width:100%;accent-color:#19a7bd}
#v3Scen .sc-slot{display:grid;gap:4px}#v3Scen .sc-slot .r{display:flex;gap:6px}#v3Scen .sc-slot .r select{flex:1}#v3Scen .sc-slot .r button{flex:none;padding:5px 9px}
#v3Scen .sc-mine{display:grid;gap:5px}#v3Scen .sc-mine .m{display:flex;gap:6px;align-items:center;font-size:12.5px;justify-content:space-between}#v3Scen .sc-mine .m span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#v3Scen .sc-mine .m button{padding:2px 7px;font-weight:600}
#v3Scen .sc-empty{border:1px dashed rgba(255,255,255,.22);border-radius:12px;padding:28px;text-align:center;color:#9fb2b8;display:grid;gap:10px;justify-items:center}#v3Scen .sc-empty b{color:#fff;font-size:16px}`;
const L3SC_COL = ["#19a7bd", "#f0b429", "#b58cff"];
const l3scLong = iso => { const d = new Date(iso + "T00:00:00"); return isNaN(d) ? iso : d.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); };
const l3scCol = ph => l3scPhaseCol(ph);
function l3scOptName(id) { const x = l3scById(id); return x ? x.name : "–"; }
/* ---- Överlägget ---- */
function l3scSideHtml() {
  const E = escHtml, slot = k => { const S = l3scById(l3sc.sel[k]); return `<div class="sc-slot"><div><i style="background:${L3SC_COL[k]};font:700 11px ui-monospace,monospace;font-style:normal;padding:1px 7px;border-radius:9px;color:#04181c;margin-right:6px">${"ABC"[k]}</i><b>Scenario ${"ABC"[k]}</b></div>
    <div class="r"><select data-sc="sel${k}"><option value="">– inget valt –</option>${l3sc.mine.map(x => `<option value="${E(x.id)}" ${l3sc.sel[k] === x.id ? "selected" : ""}>${E(x.name)}</option>`).join("")}<option value="__new">＋ Nytt scenario…</option></select>${S ? `<button type="button" data-sc-ed="${k}" title="Bygg scenariot: aktiviteter, datum och kopplade objekt">✎ Bygg</button>` : ""}</div>
    <small style="color:#8fa6ad">${S ? `${S.acts.length} aktivitet${S.acts.length === 1 ? "" : "er"} · ${S.acts.reduce((n, a) => n + (a.g || []).length + (a.pl || []).length, 0)} kopplade objekt${S.src ? " · mot " + E((l3scSources().find(s => s[0] === S.src) || [0, S.src])[1]) : " · inte kopplat mot tidplanen"}` : "Tomt – skapa ett scenario eller välj ett"}</small></div>`; };
  const O = l3sc.opts, chk = (k, t, tip) => `<label class="sc-chk" title="${E(tip)}"><input type="checkbox" data-sc-o="${k}" ${O[k] ? "checked" : ""}><span>${t}</span></label>`;
  return `<h4>Scenarier</h4>${slot(0)}${slot(1)}${slot(2)}
    <h4>Visning</h4>
    ${chk("ghost", "Ej påbörjat som ljust spöke", "Det som ännu inte är påbörjat visas som en blek siluett")}${chk("solidDone", "Klart helt täckande", "Annars används Klart-opaciteten från Ganttens inställningar")}${chk("progressCur", "Kopplat mot nuvarande plan: följ framdrift", "Scenariot använder verklig framdrift (försenat) i stället för bara datum")}${chk("dark", "Mörk bakgrund i bilderna", "Färgerna framträder tydligare mot en mörk bakgrund")}${chk("delta", "Skillnadsvy A mot B", "Visar hur scenario B avviker från A, aktivitet för aktivitet")}
    <h4>Mina scenarier</h4><div class="sc-mine">${l3sc.mine.map(x => `<div class="m"><span title="${E(x.name)}">${E(x.name)}</span><span style="flex:none"><button type="button" data-sc-dup="${E(x.id)}" title="Duplicera">⧉</button> <button type="button" data-sc-ren="${E(x.id)}" title="Byt namn">✎</button> <button type="button" data-sc-del="${E(x.id)}" title="Ta bort">✕</button></span></div>`).join("") || `<div class="sc-note">Inga scenarier än. Skapa det första med ＋ Nytt scenario i listan ovan.</div>`}
    <button type="button" data-sc="new">＋ Nytt tomt scenario…</button><button type="button" data-sc="copy" title="Skapar ett scenario som är kopplat mot en tidplan i Powerproject – du väljer vilken">＋ Nytt scenario kopplat mot tidplanen…</button></div>`;
}
function l3scRenderSide() { const a = l3sc.el && l3sc.el.querySelector(".sc-side"); if (!a) return; a.innerHTML = l3scSideHtml(); l3scBindSide(); }
async function l3scNewScenario(slot, linked) {
  const name = await uiPrompt("Namn på scenariot (t.ex. Reviderad kontraktstidplan):", "", { ok: "Skapa" }); if (!name) return null; const S = l3scNew(name);
  if (linked) { const src = l3scSources().filter(s => s[0]); if (!src.length) l3Status("Det finns ingen tidplan med datum att koppla mot.", true); else { const pick = await l3scPick("Koppla scenariot mot:", src); if (pick) S.src = pick; } }
  l3sc.mine.push(S); l3scTouch(S); if (slot >= 0) l3sc.sel[slot] = S.id; return S;
}
function l3scPick(title, opts) {   // litet val i en dialog
  return new Promise(res => { const d = l3Dlg("v3ScPick", title, `<div class="v3-gd-btns" style="flex-direction:column;align-items:stretch;gap:6px">${opts.map(([v, t]) => `<button type="button" data-v="${escHtml(v)}">${escHtml(t)}</button>`).join("")}<button type="button" data-v="" style="opacity:.7">Avbryt</button></div>`); d._onClose = () => res(null); d.querySelectorAll("[data-v]").forEach(b => { b.onclick = () => { d._onClose = null; l3DlgClose("v3ScPick"); res(b.dataset.v || null); }; }); });
}
function l3scBindSide() {
  const el = l3sc.el; if (!el) return;
  el.querySelectorAll("[data-sc^=sel]").forEach(s => { s.onchange = async () => { const k = Number(s.dataset.sc.slice(3)); if (s.value === "__new") { const S = await l3scNewScenario(k, false); l3scRenderSide(); l3scBuildStage(); await l3scPaintAll(); if (S) l3scEdit(k); return; } l3sc.sel[k] = s.value; l3scRenderSide(); l3scBuildStage(); l3scPaintAll(); }; });
  el.querySelectorAll("[data-sc-ed]").forEach(b => { b.onclick = () => l3scEdit(Number(b.dataset.scEd)); });
  el.querySelectorAll("[data-sc-o]").forEach(c => { c.onchange = () => { l3sc.opts[c.dataset.scO] = c.checked; if (c.dataset.scO === "delta") l3scBuildStage(); l3scPaintAll(); }; });
  const nb = el.querySelector('[data-sc="new"]'); if (nb) nb.onclick = async () => { const free = l3sc.sel.indexOf(""); const S = await l3scNewScenario(free, false); l3scRenderSide(); l3scBuildStage(); await l3scPaintAll(); if (S && free >= 0) l3scEdit(free); };
  const cb = el.querySelector('[data-sc="copy"]'); if (cb) cb.onclick = async () => { const free = l3sc.sel.indexOf(""); const S = await l3scNewScenario(free, true); l3scRenderSide(); l3scBuildStage(); l3scPaintAll(); };
  el.querySelectorAll("[data-sc-dup]").forEach(b => { b.onclick = () => { const S = l3scById(b.dataset.scDup); if (!S) return; const c = JSON.parse(JSON.stringify(S, (k, v) => (k === "_v" ? undefined : v))); c.id = ghNewId().slice(0, 8); c.name = S.name + " (kopia)"; l3sc.mine.push(c); l3scTouch(c); l3scRenderSide(); }; });
  el.querySelectorAll("[data-sc-ren]").forEach(b => { b.onclick = async () => { const S = l3scById(b.dataset.scRen); if (!S) return; const v = await uiPrompt("Nytt namn på scenariot:", S.name, { ok: "Spara" }); if (!v) return; S.name = String(v).trim().slice(0, 80); l3scTouch(S); l3scRenderSide(); l3scBuildStage(); l3scPaintAll(); }; });
  el.querySelectorAll("[data-sc-del]").forEach(b => { b.onclick = async () => { const S = l3scById(b.dataset.scDel); if (!S || !(await uiConfirm(`Ta bort scenariot "${S.name}" och dess aktiviteter?`, { ok: "Ta bort", danger: true }))) return; l3sc.mine = l3sc.mine.filter(x => x !== S); l3sc.sel = l3sc.sel.map(x => (x === S.id ? "" : x)); l3scPersistSoon(); l3scRenderSide(); l3scBuildStage(); l3scPaintAll(); }; });
}
function l3scBuildStage() {
  const m = l3sc.el && l3sc.el.querySelector("main"); if (!m) return; const E = escHtml, act = l3sc.sel.map((s, k) => (s ? k : -1)).filter(k => k >= 0), r = l3gmRange2 && l3gmRange2();
  const legend = `<div class="sc-legend">${["klar", "pagaende", "planerad"].map(p => `<span><i style="background:${l3scCol(p)}"></i>${L3SC_PH[p]}${p === "planerad" ? " (spöke)" : ""}</span>`).join("")}<span><i style="background:#94a3b8;opacity:.4"></i>Inte kopplat</span><span style="margin-left:auto">Samma kamera och datum i alla bilder · egna färger per aktivitet går att välja</span></div>`;
  if (!act.length) { m.innerHTML = `<div class="sc-empty"><b>Inga scenarier är valda</b><span>Alla scenarier börjar tomma och är inte kopplade till någon tidplan.<br>Skapa ett scenario, markera objekt i modellen och koppla dem till aktiviteter med egna datum – eller koppla scenariot mot Powerproject-tidplanen.</span><span style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button type="button" class="pri" id="scMk">＋ Nytt scenario</button><button type="button" id="scMkL">＋ Kopplat mot tidplanen…</button></span></div>`; m.querySelector("#scMk").onclick = () => l3sc.el.querySelector('[data-sc="new"]').click(); m.querySelector("#scMkL").onclick = () => l3sc.el.querySelector('[data-sc="copy"]').click(); return; }
  m.innerHTML = `${act.length < 2 ? `<div class="sc-note">Välj ett scenario till för att jämföra – eller bygg det du valt med ✎ Bygg.</div>` : ""}
    <div class="sc-grid">${act.map(k => `<figure data-k="${k}"><canvas width="1000" height="560"></canvas><figcaption><div class="sc-h"><i style="background:${L3SC_COL[k]}">${"ABC"[k]}</i><span>${E(l3scOptName(l3sc.sel[k]))}</span><button type="button" data-sc-go="${k}" title="Utforska scenariot i 3D (fri kamera)">Utforska ▸</button></div><div class="sc-pct" data-pct="${k}">–<small>klart</small></div><div class="sc-bar" data-bar="${k}"></div><div class="sc-n" data-n="${k}"></div></figcaption></figure>`).join("")}</div>
    ${legend}
    ${l3sc.opts.delta && l3sc.sel[0] && l3sc.sel[1] ? `<div class="sc-dl"><figure data-k="delta"><canvas width="1000" height="560"></canvas><figcaption><div class="sc-h"><i style="background:#ff8d78">Δ</i><span>Skillnad: ${E(l3scOptName(l3sc.sel[1]))} mot ${E(l3scOptName(l3sc.sel[0]))}</span></div><div class="sc-n" data-n="delta"></div><div class="sc-legend"><span><i style="background:#dc2626"></i>Senare</span><span><i style="background:#2563eb"></i>Tidigare</span><span><i style="background:#cbd5e1"></i>Oförändrat (±7 d)</span><span><i style="background:#a855f7"></i>Tillkommit</span><span><i style="background:#f59e0b"></i>Utgått</span></div></figcaption></figure>
      <div><h4 style="margin:0 0 6px;font:650 11px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#8fa6ad">Aktiviteter som skiljer</h4><div style="max-height:360px;overflow:auto"><table><thead><tr><th>Aktivitet</th><th class="n">A slut</th><th class="n">B slut</th><th class="n">Avvikelse</th></tr></thead><tbody id="scTb"></tbody></table></div></div></div>` : ""}
    <div class="sc-tl"><button type="button" id="scPlay" title="Spela upp tiden i alla bilder samtidigt">▶ Spela</button><input type="range" id="scSl" min="0" max="100" step="1" value="0"><span id="scRng"></span></div>`;
  l3sc.rg = l3scRange(r); const rg = l3sc.rg, sl = m.querySelector("#scSl"); sl.max = Math.max(1, l3DateDays(rg[0], rg[1])); sl.value = Math.max(0, Math.min(sl.max, l3DateDays(rg[0], l3sc.date))); m.querySelector("#scRng").textContent = `${rg[0]} – ${rg[1]}`;
  sl.oninput = () => { l3scGoDate(l3DateAdd(rg[0], Number(sl.value)), true); };
  m.querySelector("#scPlay").onclick = l3scTogglePlay;
  m.querySelectorAll("[data-sc-go]").forEach(b => { b.onclick = () => l3scExplore(Number(b.dataset.scGo)); });
  const tb = m.querySelector("#scTb"); if (tb) { const rows = l3scDiffRows(); tb.innerHTML = rows.slice(0, 40).map(o => `<tr><td title="${E(o.area)}">${E(o.name)}</td><td class="n">${o.a ? o.a.slice(2) : "–"}</td><td class="n">${o.b ? o.b.slice(2) : "–"}</td><td class="n ${o.kind === "ny" ? "nw" : o.d > 0 ? "late" : "early"}">${o.kind === "ny" ? "tillkommen" : o.kind === "utgått" ? "utgår" : (o.d > 0 ? "+" : "") + o.d + " d"}</td></tr>`).join("") || `<tr><td colspan="4" class="sc-note">Inga avvikelser över 7 dagar.</td></tr>`; }
}
/* Tidsspannet: egna aktiviteter i de valda scenarierna (och den kopplade tidplanen), annars Ganttens. */
function l3scRange(r) {
  const ds = []; l3sc.sel.forEach(id => { const S = l3scById(id); if (S) S.acts.forEach(a => { if (a.start) ds.push(a.start); if (a.end) ds.push(a.end); }); });
  if (ds.length) { ds.sort(); return [l3DateAdd(ds[0], -14), l3DateAdd(ds[ds.length - 1], 14)]; }
  return r && r[0] && r[1] ? r : [l3DateAdd(l3sc.date, -120), l3DateAdd(l3sc.date, 240)];
}
function l3scGoDate(d, fromSlider) {
  l3sc.date = d; const big = l3sc.el && l3sc.el.querySelector(".sc-big"), di = l3sc.el && l3sc.el.querySelector("#scDate"); if (big) big.textContent = d; if (di && di.value !== d) di.value = d;
  const sl = l3sc.el && l3sc.el.querySelector("#scSl"); if (sl && !fromSlider && l3sc.rg) sl.value = Math.max(0, Math.min(Number(sl.max), l3DateDays(l3sc.rg[0], d)));
  if (l3sc.el && l3sc.el.style.display === "none" && l3sc.render != null) l3scLive(l3sc.render); else l3scPaintAll();
}
let l3scPaintBusy = false, l3scPaintAgain = false;
async function l3scPaintAll() {
  if (!l3sc.el || l3sc.el.style.display === "none") return; if (l3scPaintBusy) { l3scPaintAgain = true; return; } l3scPaintBusy = true;
  try {
    do {
      l3scPaintAgain = false; l3scBegin(); l3plSetDay(l3sc.date);
      for (const fig of l3sc.el.querySelectorAll("figure[data-k]")) {
        const k = fig.dataset.k === "delta" ? "delta" : Number(fig.dataset.k), t = l3scPaint(fig.querySelector("canvas"), k);
        if (k === "delta") { const K = l3scDeltaK(t), n = fig.querySelector('[data-n="delta"]'); if (n) n.innerHTML = `<span>Senare <b>${K.late}</b></span><span>Tidigare <b>${K.early}</b></span><span>Oförändrat <b>${K.same}</b></span><span>Tillkommit <b>${K.nw}</b></span><span>Utgått <b>${K.gone}</b></span>`; continue; }
        const K = l3scKpi(t), pct = fig.querySelector(`[data-pct="${k}"]`), bar = fig.querySelector(`[data-bar="${k}"]`), nn = fig.querySelector(`[data-n="${k}"]`), n = Math.max(1, K.n);
        if (pct) pct.innerHTML = `${K.pct} %<small>av ${K.n} kopplade objekt klara</small>`;
        if (bar) bar.innerHTML = ["klar", "pagaende", "forsenad"].map(p => `<b style="width:${K[p] / n * 100}%;background:${l3scCol(p)}"></b>`).join("");
        if (nn) nn.innerHTML = `<span>Klart <b>${K.klar}</b></span><span>Pågår <b>${K.pagaende}</b></span>${K.forsenad ? `<span>Försenat <b>${K.forsenad}</b></span>` : ""}<span>Ej påbörjat <b>${K.planerad}</b></span>${K.okopplad ? `<span title="Objekt som inte är kopplade till någon aktivitet i scenariot">Inte kopplat <b>${K.okopplad}</b></span>` : ""}`;
        fig.dataset.kpi = JSON.stringify(K);
      }
      await new Promise(r => setTimeout(r, 0));
    } while (l3scPaintAgain);
  } finally { l3scPaintBusy = false; }
}
function l3scTogglePlay() {
  const b = l3sc.el && l3sc.el.querySelector("#scPlay"); if (l3sc.play) { clearTimeout(l3sc.play); l3sc.play = 0; if (b) b.textContent = "▶ Spela"; return; }
  if (b) b.textContent = "❚❚ Paus"; const step = async () => { const nx = l3DateAdd(l3sc.date, 7); if (l3sc.rg && nx > l3sc.rg[1]) { l3scTogglePlay(); return; } l3scGoDate(nx); await new Promise(r => setTimeout(r, 30)); l3sc.play = setTimeout(step, 420); }; l3sc.play = setTimeout(step, 10);
}
async function l3scOpen() {
  const host = document.getElementById("v3Canvas") || document.getElementById("view3d"); if (!host) return; if (!document.getElementById("v3ScCss")) { const st = document.createElement("style"); st.id = "v3ScCss"; st.textContent = L3SC_CSS + L3SC_CSS2; document.head.appendChild(st); }
  l3scBadgeStop(false); l3scEditClose(true); if (l3sc.el) l3sc.el.remove();
  const el = document.createElement("div"); el.id = "v3Scen"; l3sc.el = el; host.appendChild(el); ["pointerdown", "wheel", "contextmenu", "dblclick", "keydown", "keyup"].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
  el.innerHTML = `<div class="sc-top"><button type="button" id="scClose" title="Stäng (Esc)">✕ Stäng</button><div class="sc-ttl"><small>${escHtml((typeof projectName !== "undefined" && projectName) || "Projekt")}</small>Tidplansscenarier – jämför projektläget</div>
    <div class="sc-date"><button type="button" id="scPrev" title="En vecka bakåt">‹ v</button><div class="sc-big">${$("dateInput").value || todayIso()}</div><button type="button" id="scNext" title="En vecka framåt">v ›</button><input type="date" id="scDate"><button type="button" id="scToday">Idag</button></div>
    <button type="button" id="scView" title="Dölj jämförelsen och ställ in kameran – bilderna ritas om från den nya vyn">Ändra vy</button><button type="button" class="pri" id="scExp" title="Skapar en rapportbild med alla bilder, nyckeltal och teckenförklaring">⤓ Rapportbild (PNG)</button><button type="button" id="scPdf">PDF</button><button type="button" id="scCopy" title="Kopierar rapportbilden så att den kan klistras in i PowerPoint">Kopiera</button></div>
    <div class="sc-body"><div class="sc-side"></div><main><div class="sc-note">Hämtar scenarier …</div></main></div>`;
  l3sc.date = l3sc.date || $("dateInput").value || todayIso(); el.querySelector("#scDate").value = l3sc.date; el.querySelector(".sc-big").textContent = l3sc.date;
  el.querySelector("#scClose").onclick = l3scClose; el.querySelector("#scToday").onclick = () => l3scGoDate(todayIso()); el.querySelector("#scPrev").onclick = () => l3scGoDate(l3DateAdd(l3sc.date, -7)); el.querySelector("#scNext").onclick = () => l3scGoDate(l3DateAdd(l3sc.date, 7));
  el.querySelector("#scDate").onchange = e => { if (e.target.value) l3scGoDate(e.target.value); };
  el.querySelector("#scView").onclick = () => l3scAdjustView(); el.querySelector("#scExp").onclick = () => l3scReport("png"); el.querySelector("#scPdf").onclick = () => l3scReport("pdf"); el.querySelector("#scCopy").onclick = () => l3scReport("copy");
  el.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); l3scClose(); } });
  try { await l3scLoad(); } catch (e) { l3sc.err = e.message; }
  if (!l3sc.el) return; l3scRenderSide(); l3scBuildStage(); l3scBegin(); await l3scPaintAll();
}
function l3scClose() { if (l3sc.play) l3scTogglePlay(); l3scEditClose(true); if (l3sc.el) { l3sc.el.remove(); l3sc.el = null; } l3scBadgeStop(true); l3scRestore(); if (l3sc.saveT) { clearTimeout(l3sc.saveT); l3scPersist(); } }
function l3scAdjustView() { if (!l3sc.el) return; if (l3sc.play) l3scTogglePlay(); l3sc.el.style.display = "none"; l3scBadge("Ställ in kameran – jämförelsen ritas om från den nya vyn", [["Tillbaka till jämförelsen", l3scBackToOverlay], ["Avsluta", l3scClose]], 0); }
function l3scBackToOverlay() { l3scBadgeStop(false); l3scEditClose(true); if (l3sc.patch) { l3sc.patch(); l3sc.patch = null; } if (!l3sc.el) return; l3sc.el.style.display = ""; l3scBuildStage(); l3scRenderSide(); l3scPaintAll(); }
function l3scExplore(k) { if (!l3sc.el) return; l3sc.el.style.display = "none"; l3scLive(k); l3scBadge(`Scenario ${"ABC"[k]}: ${l3scOptName(l3sc.sel[k])} · ${l3sc.date}`, [["Tillbaka till jämförelsen", l3scBackToOverlay], ["Avsluta", l3scClose]], k); }
function l3scBadge(text, btns, k) {
  l3scBadgeStop(false); const host = document.getElementById("v3Canvas") || document.getElementById("view3d"), b = document.createElement("div"); b.id = "v3ScBadge"; b.innerHTML = `<span style="width:10px;height:10px;border-radius:50%;background:${L3SC_COL[k] || "#fff"};display:inline-block"></span><span>${escHtml(text)}</span>`;
  btns.forEach(([t, f]) => { const x = document.createElement("button"); x.type = "button"; x.textContent = t; x.onclick = f; b.appendChild(x); }); host.appendChild(b);
}
function l3scBadgeStop(restore) { const b = document.getElementById("v3ScBadge"); if (b) b.remove(); if (restore) l3sc.render = null; }
/* IFC-objekten med givna GUID som markeringsposter. */
function l3scFindGuids(guids) {
  const want = new Set(guids), out = []; if (!want.size || !l3.groups.bldg) return out;
  l3.groups.bldg.traverse(m => { const L = m.userData && m.userData.l3b; if (!L || !L.ranges) return; L.ranges.forEach((r, ri) => { if (r.guid && want.has(r.guid)) out.push({ mesh: m, ri }); }); }); return out;
}
/* ---- Byggläge: aktiviteter, datum och kopplade objekt för ett scenario, med 3D-vyn framme ---- */
function l3scEdit(slot) {
  const S = l3scById(l3sc.sel[slot]); if (!S || !l3sc.el) return; l3sc.edSlot = slot; l3sc.el.style.display = "none"; l3scBadgeStop(false); l3scLive(slot);
  const host = document.getElementById("v3Canvas") || document.getElementById("view3d"); l3scEditClose(true); const el = document.createElement("div"); el.id = "v3ScEd"; l3sc.ed = el; host.appendChild(el); ["pointerdown", "wheel", "contextmenu", "dblclick", "keydown", "keyup"].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
  l3sc.edKey = ""; clearInterval(l3sc.edIv); l3sc.edIv = setInterval(() => { if (!l3sc.ed || (document.activeElement && l3sc.ed.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName))) return; const s = l3scSelection(), key = s.g.length + "," + s.pl.length; if (key !== l3sc.edKey) { l3sc.edKey = key; l3scEditRender(); } }, 500);
  l3scEditRender();
}
function l3scEditClose(silent) { clearInterval(l3sc.edIv); const e = document.getElementById("v3ScEd"); if (e) e.remove(); l3sc.ed = null; if (!silent) l3scBackToOverlay(); }
function l3scEditRender() {
  const el = l3sc.ed, S = l3scById(l3sc.sel[l3sc.edSlot]); if (!el || !S) return; const E = escHtml, srcs = l3scSources(), sel = l3scSelection(), nsel = sel.g.length + sel.pl.length;
  const keep = el.querySelector(".eb") ? el.querySelector(".eb").scrollTop : 0;
  el.innerHTML = `<header><div class="row"><b style="flex:1">${E(S.name)}</b><span style="color:${L3SC_COL[l3sc.edSlot]};font:700 12px ui-monospace,monospace">Scenario ${"ABC"[l3sc.edSlot]}</span></div>
    <label class="f">Koppling mot tidplanen<select data-e="src">${srcs.map(([v, t]) => `<option value="${E(v)}" ${S.src === v ? "selected" : ""}>${E(t)}</option>`).join("")}</select></label>
    <label class="f">Objekt som inte är kopplade<select data-e="unl"><option value="ghost" ${S.unlinked === "ghost" ? "selected" : ""}>Visas som ljust spöke</option><option value="hide" ${S.unlinked === "hide" ? "selected" : ""}>Visas inte</option><option value="orig" ${S.unlinked === "orig" ? "selected" : ""}>Originalfärg</option></select></label></header>
    <div class="eb">
      <div class="hint">Markera objekt i 3D (Skift/Ctrl för flera). Tryck sedan <b>Koppla markering</b> på en aktivitet – objektet får aktivitetens datum och färg i det här scenariot. ${nsel ? `<b>${nsel} objekt markerade.</b>` : "Inget är markerat just nu."}</div>
      <div class="row"><button type="button" class="pri" data-e="add">＋ Ny aktivitet</button><button type="button" data-e="addsel" ${nsel ? "" : "disabled"} title="Skapar en aktivitet och kopplar markeringen till den">＋ Av markeringen</button></div>
      ${S.acts.map((a, i) => `<div class="act" data-i="${i}"><div class="row"><input type="text" data-a="name" value="${E(a.name)}" placeholder="Aktivitet" style="flex:1"><input type="color" data-a="color" value="${E(a.color || l3scPhaseCol("pagaende") || "#facc15")}" title="Egen färg (pågår och klart)"><button type="button" data-a="nocol" title="Använd statusfärgerna" ${a.color ? "" : "disabled"}>↺</button></div>
        <div class="two"><label class="f">Start<input type="date" data-a="start" value="${E(a.start || "")}"></label><label class="f">Slut<input type="date" data-a="end" value="${E(a.end || "")}"></label></div>
        <div class="row"><small style="flex:1">${(a.g || []).length + (a.pl || []).length} kopplade objekt${a.start && a.end ? "" : " · saknar datum"}</small><button type="button" data-a="sel" title="Markera aktivitetens objekt i 3D">Markera</button><button type="button" data-a="link" ${nsel ? "" : "disabled"}>＋ Koppla markering</button><button type="button" data-a="unlink" ${nsel ? "" : "disabled"} title="Tar bort de markerade objekten från aktiviteten">− Lossa</button><button type="button" data-a="del" title="Ta bort aktiviteten">✕</button></div></div>`).join("") || `<div class="hint">Inga aktiviteter än. Scenariot är tomt och inte kopplat mot någon tidplan.</div>`}
    </div>
    <footer><div class="sl" style="flex:1"><span id="edDt" style="font:600 12px ui-monospace,monospace">${l3sc.date}</span><input type="range" id="edSl" min="0" max="100"></div><button type="button" class="pri" id="edDone">Klar</button></footer>`;
  const eb = el.querySelector(".eb"); if (eb) eb.scrollTop = keep;
  const sl = el.querySelector("#edSl"), rg = l3scRange(l3gmRange2 && l3gmRange2()); l3sc.rg = rg; sl.max = Math.max(1, l3DateDays(rg[0], rg[1])); sl.value = Math.max(0, Math.min(sl.max, l3DateDays(rg[0], l3sc.date))); sl.oninput = () => { const d = l3DateAdd(rg[0], Number(sl.value)); l3sc.date = d; el.querySelector("#edDt").textContent = d; l3scLive(l3sc.edSlot); };
  el.querySelector("#edDone").onclick = () => l3scEditClose(false);
  const change = () => { l3scTouch(S); l3scLive(l3sc.edSlot); };
  el.querySelector('[data-e="src"]').onchange = e => { S.src = e.target.value; change(); l3scEditRender(); };
  el.querySelector('[data-e="unl"]').onchange = e => { S.unlinked = e.target.value; change(); };
  el.querySelector('[data-e="add"]').onclick = () => { S.acts.push({ id: ghNewId().slice(0, 6), name: `Aktivitet ${S.acts.length + 1}`, start: l3sc.date, end: l3DateAdd(l3sc.date, 28), g: [], pl: [] }); change(); l3scEditRender(); };
  el.querySelector('[data-e="addsel"]').onclick = () => { const s = l3scSelection(); if (!s.g.length && !s.pl.length) return; S.acts.forEach(o => { o.g = (o.g || []).filter(g => !s.g.includes(g)); o.pl = (o.pl || []).filter(p => !s.pl.includes(p)); }); S.acts.push({ id: ghNewId().slice(0, 6), name: `Aktivitet ${S.acts.length + 1}`, start: l3sc.date, end: l3DateAdd(l3sc.date, 28), g: s.g, pl: s.pl }); change(); l3scEditRender(); };
  el.querySelectorAll(".act").forEach(row => {
    const a = S.acts[Number(row.dataset.i)]; if (!a) return;
    row.querySelectorAll("input[data-a]").forEach(i => { i.onchange = () => { a[i.dataset.a] = i.dataset.a === "color" ? i.value : i.value; change(); if (i.dataset.a === "color") l3scEditRender(); }; });
    row.querySelector('[data-a="nocol"]').onclick = () => { delete a.color; change(); l3scEditRender(); };
    row.querySelector('[data-a="sel"]').onclick = () => { const ids = (a.pl || []).filter(id => placements.some(p => p.id === id)), found = l3scFindGuids(a.g || []); try { if (found.length && typeof l3bsSet === "function") { if (typeof l3SelectIds === "function") l3SelectIds([]); l3bsSet(found); } else if (typeof l3SelectIds === "function") l3SelectIds(ids); } catch (e) { /* inget att markera */ } l3Status(`${found.length} IFC-objekt och ${ids.length} placerade objekt i aktiviteten.`); };
    row.querySelector('[data-a="link"]').onclick = () => { const s = l3scSelection(); a.g = [...new Set([...(a.g || []), ...s.g])]; a.pl = [...new Set([...(a.pl || []), ...s.pl])]; S.acts.forEach(o => { if (o !== a) { o.g = (o.g || []).filter(g => !s.g.includes(g)); o.pl = (o.pl || []).filter(p => !s.pl.includes(p)); } }); change(); l3scEditRender(); };   // ett objekt hör till en aktivitet i taget
    row.querySelector('[data-a="unlink"]').onclick = () => { const s = l3scSelection(); a.g = (a.g || []).filter(g => !s.g.includes(g)); a.pl = (a.pl || []).filter(p => !s.pl.includes(p)); change(); l3scEditRender(); };
    row.querySelector('[data-a="del"]').onclick = () => { S.acts.splice(Number(row.dataset.i), 1); change(); l3scEditRender(); };
  });
}

/* ---- Rapportbild ---- */
function l3scRoundRect(x, X, Y, W, H, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r); x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath(); }
function l3scCompose() {
  const figs = [...l3sc.el.querySelectorAll("figure[data-k]")].filter(f => f.dataset.k !== "delta"), dfig = l3sc.el.querySelector('figure[data-k="delta"]'), n = Math.max(1, figs.length);
  const W = 3300, M = 90, G = 50, pw = Math.floor((W - 2 * M - (n - 1) * G) / n), ar = figs[0] ? figs[0].querySelector("canvas").height / figs[0].querySelector("canvas").width : 0.56, ph = Math.round(pw * ar);
  const diffRows = dfig ? l3scDiffRows().slice(0, 9) : [], dH = dfig ? Math.round(ph * 0.92) : 0, H = 300 + ph + 450 + (dfig ? dH + 140 : 0) + 190;
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const x = cv.getContext("2d"), F = "system-ui,'Segoe UI',Arial,sans-serif";
  const bg = x.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#0f1d24"); bg.addColorStop(1, "#091217"); x.fillStyle = bg; x.fillRect(0, 0, W, H);
  x.fillStyle = "#19a7bd"; x.fillRect(0, 0, W, 14);
  x.fillStyle = "#8fa6ad"; x.font = `600 34px ${F}`; x.textBaseline = "alphabetic"; x.fillText(String((typeof projectName !== "undefined" && projectName) || "Projekt").toUpperCase(), M, 100);
  x.fillStyle = "#ffffff"; x.font = `700 92px ${F}`; x.fillText(`Projektläget ${l3scLong(l3sc.date)}`, M, 205);
  x.fillStyle = "#9fb2b8"; x.font = `500 38px ${F}`; x.fillText(`Samma modell och samma datum i ${n} tidplansscenarier`, M, 262);
  let y = 300;
  figs.forEach((f, i) => {
    const k = Number(f.dataset.k), X0 = M + i * (pw + G), K = JSON.parse(f.dataset.kpi || "{}"), cvs = f.querySelector("canvas");
    x.save(); l3scRoundRect(x, X0, y, pw, ph, 26); x.clip(); x.drawImage(cvs, X0, y, pw, ph); x.restore(); x.strokeStyle = "rgba(255,255,255,.18)"; x.lineWidth = 3; l3scRoundRect(x, X0, y, pw, ph, 26); x.stroke();
    x.fillStyle = L3SC_COL[k]; x.beginPath(); x.arc(X0 + 38, y + ph + 62, 28, 0, 7); x.fill(); x.fillStyle = "#04181c"; x.font = `800 34px ${F}`; x.textAlign = "center"; x.fillText("ABC"[k], X0 + 38, y + ph + 74); x.textAlign = "left";
    x.fillStyle = "#fff"; x.font = `700 46px ${F}`; let nm = l3scOptName(l3sc.sel[k]); while (x.measureText(nm).width > pw - 110 && nm.length > 8) nm = nm.slice(0, -2); x.fillText(nm === l3scOptName(l3sc.sel[k]) ? nm : nm + "…", X0 + 86, y + ph + 78);
    x.fillStyle = "#fff"; x.font = `800 120px ${F}`; x.fillText(`${K.pct || 0} %`, X0, y + ph + 215); x.fillStyle = "#8fa6ad"; x.font = `500 34px ${F}`; x.fillText(`av ${K.n || 0} kopplade objekt klara`, X0 + 330, y + ph + 212);
    const tot = Math.max(1, K.n || 1); let bx = X0; x.fillStyle = "rgba(255,255,255,.12)"; l3scRoundRect(x, X0, y + ph + 240, pw, 22, 11); x.fill();
    ["klar", "pagaende", "forsenad"].forEach(p => { const w = (K[p] || 0) / tot * pw; if (w > 0) { x.fillStyle = l3scCol(p); x.fillRect(bx, y + ph + 240, w, 22); bx += w; } });
    x.fillStyle = "#c6d3d8"; x.font = `500 32px ${F}`; x.fillText(`Klart ${K.klar || 0}   ·   Pågår ${K.pagaende || 0}${K.forsenad ? "   ·   Försenat " + K.forsenad : ""}   ·   Ej påbörjat ${K.planerad || 0}`, X0, y + ph + 310);
  });
  y += ph + 450;
  if (dfig) {
    x.fillStyle = "#ffffff"; x.font = `700 56px ${F}`; x.fillText(`Skillnad: ${l3scOptName(l3sc.sel[1])} mot ${l3scOptName(l3sc.sel[0])}`, M, y); y += 40;
    const dw = Math.round(dH / ar), dc = dfig.querySelector("canvas"); x.save(); l3scRoundRect(x, M, y, dw, dH, 26); x.clip(); x.drawImage(dc, M, y, dw, dH); x.restore(); x.strokeStyle = "rgba(255,255,255,.18)"; l3scRoundRect(x, M, y, dw, dH, 26); x.stroke();
    const tx = M + dw + 70; x.fillStyle = "#8fa6ad"; x.font = `700 28px ${F}`; x.fillText("AKTIVITET", tx, y + 40); x.textAlign = "right"; x.fillText("A SLUT", W - M - 420, y + 40); x.fillText("B SLUT", W - M - 220, y + 40); x.fillText("AVVIKELSE", W - M, y + 40); x.textAlign = "left";
    diffRows.forEach((o, i) => { const yy = y + 100 + i * 66; x.fillStyle = "rgba(255,255,255,.06)"; if (i % 2 === 0) x.fillRect(tx - 20, yy - 44, W - M - tx + 20, 62); x.fillStyle = "#e6edf0"; x.font = `500 34px ${F}`; let t = o.name; while (x.measureText(t).width > W - M - tx - 640 && t.length > 6) t = t.slice(0, -2); x.fillText(t, tx, yy); x.textAlign = "right"; x.fillStyle = "#9fb2b8"; x.fillText(o.a ? o.a.slice(2) : "–", W - M - 420, yy); x.fillText(o.b ? o.b.slice(2) : "–", W - M - 220, yy); x.fillStyle = o.kind === "ny" ? "#d29bff" : o.d > 0 ? "#ff8d78" : "#7cc2ff"; x.font = `700 34px ${F}`; x.fillText(o.kind === "ny" ? "tillkommen" : o.kind === "utgått" ? "utgår" : (o.d > 0 ? "+" : "") + o.d + " d", W - M, yy); x.textAlign = "left"; });
    y += dH + 100;
  }
  x.font = `500 32px ${F}`; let lx = M; const items = [["klar", "Klart"], ["pagaende", "Pågår"], ["planerad", "Ej påbörjat (spöke)"]]; if (l3sc.opts.progressCur) items.push(["forsenad", "Försenat"]);
  items.forEach(([p, t]) => { x.fillStyle = l3scCol(p); l3scRoundRect(x, lx, y - 26, 30, 30, 8); x.fill(); x.fillStyle = "#c6d3d8"; x.fillText(t, lx + 44, y); lx += 44 + x.measureText(t).width + 50; });
  if (dfig) [["#dc2626", "Senare än A"], ["#2563eb", "Tidigare än A"], ["#cbd5e1", "Oförändrat"], ["#a855f7", "Tillkommit"]].forEach(([c, t]) => { x.fillStyle = c; l3scRoundRect(x, lx, y - 26, 30, 30, 8); x.fill(); x.fillStyle = "#c6d3d8"; x.fillText(t, lx + 44, y); lx += 44 + x.measureText(t).width + 50; });
  x.fillStyle = "#6f858c"; x.font = `500 28px ${F}`; x.fillText(`4D-planering · ${new Date().toLocaleDateString("sv-SE")} · färgerna följer Ganttens statusfärger, ej påbörjat visas som ljust spöke`, M, H - 60);
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
