/* 3D-vyn – Tidplansscenarier (Victor 2026-11-12): samma modell och samma datum i flera tidplaner bredvid varandra, med skillnadsvy och rapportbild.
   Underlaget finns redan i projektet: namngivna baselines per aktivitet (Powerproject-importen), huvudbaselinen (Kontraktstidplanen) och de aktuella datumen. Scenarierna ritas genom att modellens
   4D-färger (Ganttens Tid-läge, l3gmRange) räknas om med scenariots datum i stället för de aktuella – inget i tidplanen ändras. Ett scenario kan också sparas som en ögonblicksbild av nuvarande plan
   (plan_scenarios.json) för att kunna jämföras senare. Prefix l3sc. */
const l3sc = { sel: ["", "", ""], date: "", opts: { missing: "hide", progressCur: false, ghost: true, ghostOp: 22, solidDone: true, delta: true, dark: true }, reg: [], snaps: [], list: [], render: null, tally: null, prev: null, el: null, imgs: [], busy: false, play: 0, loaded: false };
const L3SC_PH = { klar: "Klart", pagaende: "Pågår", forsenad: "Försenat", planerad: "Ej påbörjat" };
const l3scIso = v => (v ? String(v).slice(0, 10) : "");
const l3scDays = (a, b) => Math.round((Date.parse(l3scIso(b) + "T00:00:00Z") - Date.parse(l3scIso(a) + "T00:00:00Z")) / 86400000);
const l3scPrefs = () => (l3Prefs().scen && typeof l3Prefs().scen === "object" ? l3Prefs().scen : {});
const l3scSave = () => l3SetPref("scen", { sel: l3sc.sel, opts: l3sc.opts });
const l3scPath = f => `projects/${encodeURIComponent(projectId)}/pp/${f}`;
/* ---- Data: scenarier ur baselines och ögonblicksbilder ---- */
function l3scDatesOf(row, id) {
  if (!row) return null; let v = null;
  if (id === "cur") v = [row.start_date, row.end_date];
  else if (id === "main") v = [row.baseline_start_date, row.baseline_end_date];
  else if (/^bl:/.test(id)) { const b = row.baselines && row.baselines[id.slice(3)]; v = Array.isArray(b) ? b : null; }
  else if (/^snap:/.test(id)) { const s = l3sc.snaps.find(x => "snap:" + x.id === id); v = s && s.dates && s.dates[row.id]; }
  return v && v[0] && v[1] ? [l3scIso(v[0]), l3scIso(v[1])] : null;
}
function l3scRowFor(row, id) {
  const d = l3scDatesOf(row, id);
  if (d) return { ...row, start_date: d[0], end_date: d[1], ...(id === "cur" ? {} : { actual_start_date: null, actual_end_date: null }) };
  return l3sc.opts.missing === "plan" ? row : null;   // aktiviteter som inte fanns i planen (t.ex. tillkommande arbeten) döljs som standard
}
function l3scBuildList() {
  const rows = l3pl.rows || [], count = id => rows.reduce((n, r) => n + (l3scDatesOf(r, id) ? 1 : 0), 0), nm = id => (l3sc.reg.find(x => x.id === id) || {}).name;
  const L = [{ id: "main", name: nm("main") || "Kontraktstidplan (huvudbaseline)" }, { id: "cur", name: "Nuvarande tidplan" }, ...l3sc.reg.filter(x => x && x.id && x.id !== "main").map(x => ({ id: "bl:" + x.id, name: x.name || x.id })), ...l3sc.snaps.map(s => ({ id: "snap:" + s.id, name: s.name, snap: true, at: s.at }))];
  L.forEach(x => { x.n = count(x.id); }); l3sc.list = L.filter(x => x.n > 0 || x.id === "cur");
  const has = id => l3sc.list.some(x => x.id === id);
  l3sc.sel = l3sc.sel.map(s => (has(s) ? s : ""));
  if (!l3sc.sel[0]) { const r = l3sc.list.find(x => /reviderad/i.test(x.name) && /kontrakt/i.test(x.name)) || l3sc.list.find(x => /kontrakt/i.test(x.name)) || l3sc.list.find(x => x.id === "main"); if (r) l3sc.sel[0] = r.id; }
  if (!l3sc.sel[1]) l3sc.sel[1] = "cur";
  if (!l3sc.sel[2]) { const r = l3sc.list.find(x => /före|innan|omplan|förtjock/i.test(x.name) && !l3sc.sel.includes(x.id)) || l3sc.list.find(x => !l3sc.sel.includes(x.id)); if (r) l3sc.sel[2] = r.id; }
}
async function l3scLoad(force) {
  await l3plLoad(force);
  const rd = async f => { try { const a = await ghReadJSON(token, l3scPath(f), force ? { fresh: true } : undefined); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
  [l3sc.reg, l3sc.snaps] = await Promise.all([rd("plan_baselines.json"), rd("plan_scenarios.json")]);
  const P = l3scPrefs(); if (!l3sc.loaded) { if (Array.isArray(P.sel)) l3sc.sel = P.sel.slice(0, 3).concat(["", "", ""]).slice(0, 3); if (P.opts) l3sc.opts = { ...l3sc.opts, ...P.opts }; l3sc.loaded = true; }
  l3scBuildList();
}
/* Sparar nuvarande plan som scenario (ögonblicksbild av alla aktiviteters datum). */
async function l3scSnapshot() {
  const name = await uiPrompt("Namn på scenariot (t.ex. Tidplan v. 46):", `Tidplan ${$("dateInput").value || todayIso()}`, { ok: "Spara" }); if (!name) return;
  const dates = {}; (l3pl.rows || []).forEach(r => { if (r.start_date && r.end_date) dates[r.id] = [l3scIso(r.start_date), l3scIso(r.end_date)]; });
  const s = { id: ghNewId().slice(0, 8), name: String(name).trim().slice(0, 80), at: new Date().toISOString(), dates };
  await ghWriteJSON(token, l3scPath("plan_scenarios.json"), a => [...(Array.isArray(a) ? a : []), s], "Spara tidplansscenario"); l3sc.snaps.push(s); l3scBuildList(); l3scRenderSide(); l3Toast(`Scenariot "${s.name}" är sparat (${Object.keys(dates).length} aktiviteter).`);
}
async function l3scDropSnap(id) {
  const s = l3sc.snaps.find(x => x.id === id); if (!s || !(await uiConfirm(`Ta bort scenariot "${s.name}"?`, { ok: "Ta bort", danger: true }))) return;
  await ghWriteJSON(token, l3scPath("plan_scenarios.json"), a => (Array.isArray(a) ? a : []).filter(x => x.id !== id), "Ta bort tidplansscenario"); l3sc.snaps = l3sc.snaps.filter(x => x.id !== id); l3sc.sel = l3sc.sel.map(x => (x === "snap:" + id ? "" : x)); l3scBuildList(); l3scRenderSide(); l3scPaintAll();
}
/* ---- Färger i modellen: samma Tid-läge som Gantten, med scenariots datum ---- */
const l3scHex = h => { const n = parseInt(String(h).replace("#", ""), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => v / 255); };
function l3scEnd(rows, id) { const ds = rows.map(r => l3scDatesOf(r, id)).filter(Boolean).map(d => d[1]); return ds.length ? ds.sort().pop() : ""; }
function l3scDeltaCol(rows) {
  const a = l3scEnd(rows, l3sc.sel[0]), b = l3scEnd(rows, l3sc.sel[1]);
  if (!a && !b) return { off: true };
  if (!a) return { off: false, rgb: l3scHex("#a855f7"), alpha: null, phase: "d_new" };
  if (!b) return { off: false, rgb: l3scHex("#f59e0b"), alpha: 0.4, phase: "d_gone" };
  const d = l3scDays(a, b);
  if (d > 7) { const t = Math.min(1, (d - 7) / 60); return { off: false, rgb: [0, 1, 2].map(i => l3scHex("#f59e0b")[i] + (l3scHex("#dc2626")[i] - l3scHex("#f59e0b")[i]) * t), alpha: null, phase: "d_late" }; }
  if (d < -7) { const t = Math.min(1, (-d - 7) / 60); return { off: false, rgb: [0, 1, 2].map(i => l3scHex("#38bdf8")[i] + (l3scHex("#2563eb")[i] - l3scHex("#38bdf8")[i]) * t), alpha: null, phase: "d_early" }; }
  return { off: false, rgb: l3scHex("#cbd5e1"), alpha: 0.5, phase: "d_same" };
}
{
  const g0 = l3gmRange;
  l3gmRange = function (rows, at, ctx) {
    const R = l3sc.render; if (R == null) return g0(rows, at, ctx);
    let res; const was = l3gm.strict;
    try {
      if (R === "delta") res = l3scDeltaRes(rows);
      else {
        const id = l3sc.sel[R], rs = rows.map(r => l3scRowFor(r, id)).filter(Boolean); l3gm.strict = !(id === "cur" && l3sc.opts.progressCur);
        res = g0(rs, at, ctx);
        if (l3sc.tally && rs.length) { const ph = l3gmGroup(rs.map(r => l3gmRowPhase(r, at, true)).filter(p => p !== "dold")); if (ph) l3sc.tally[ph] = (l3sc.tally[ph] || 0) + 1; } else if (l3sc.tally) l3sc.tally.saknas = (l3sc.tally.saknas || 0) + 1;
      }
    } finally { l3gm.strict = was; }
    return res;
  };
  function l3scDeltaRes(rows) { const r = l3scDeltaCol(rows); if (l3sc.tally && r.phase) l3sc.tally[r.phase] = (l3sc.tally[r.phase] || 0) + 1; return r; }
}
function l3scCfg(C) { if (l3sc.render == null) return C; return { ...C, future: !!l3sc.opts.ghost, futureOp: l3sc.opts.ghostOp, doneOp: l3sc.opts.solidDone ? 100 : C.doneOp, origCol: false, scale: false, ops: {}, from: "", to: "" }; }
/* ---- Datum och återställning ---- */
function l3scBegin() { if (l3sc.prev) return; l3sc.prev = { mode: l3gm.mode, day: $("dateInput").value }; l3gm.mode = "time"; l3gmStopPlay && l3gmStopPlay(); }
function l3scRestore() { if (!l3sc.prev) { l3sc.render = null; return; } const p = l3sc.prev; l3sc.prev = null; l3sc.render = null; l3gm.mode = p.mode; if (p.day) l3plSetDay(p.day); l3gmApply(true); if (typeof l3plDockRender === "function") l3plDockRender(); }
function l3scSetDay(d) { l3sc.date = d; if (l3sc.prev || l3sc.render != null) l3plSetDay(d); }
/* Ritar ett scenario (0–2) eller skillnaden ("delta") ur den aktuella kameran in i en canvas. Returnerar nyckeltalen (objekt per läge). */
function l3scPaint(cv, k) {
  const bg0 = l3.scene.background; if (l3sc.opts.dark) l3.scene.background = new THREE.Color("#0f1c24");   // mörk bakgrund: färgerna lyser mot den
  try { l3sc.render = k; l3sc.tally = {}; l3gmApply(true); l3.renderer.render(l3.scene, l3.camera); } finally { /* bilden kopieras nedan, bakgrunden återställs efter */ }
  const src = l3.renderer.domElement, sw = src.width, sh = src.height, ar = sw / sh, W = cv.width, H = Math.round(W / ar); if (cv.height !== H) cv.height = H;
  const x = cv.getContext("2d"); x.drawImage(src, 0, 0, sw, sh, 0, 0, W, H); const t = l3sc.tally; l3sc.tally = null; if (l3sc.opts.dark) { l3.scene.background = bg0; } return t;
}
const l3scKpi = t => { const n = (t.klar || 0) + (t.pagaende || 0) + (t.forsenad || 0) + (t.planerad || 0); return { n, klar: t.klar || 0, pagaende: t.pagaende || 0, forsenad: t.forsenad || 0, planerad: t.planerad || 0, saknas: t.saknas || 0, pct: n ? Math.round((t.klar || 0) / n * 100) : 0 }; };
const l3scDeltaK = t => ({ late: t.d_late || 0, early: t.d_early || 0, same: t.d_same || 0, nw: t.d_new || 0, gone: t.d_gone || 0 });
/* Aktiviteterna som skiljer mellan A och B (en rad per aktivitetsgrupp). */
function l3scDiffRows() {
  const out = new Map(), A = l3sc.sel[0], B = l3sc.sel[1];
  (l3pl.rows || []).forEach(r => { const a = l3scDatesOf(r, A), b = l3scDatesOf(r, B), key = r.group_id || r.id; if (!a && !b) return; const o = out.get(key) || { name: r.activity || r.object_name || "–", area: r.area || "", a: null, b: null }; if (a && (!o.a || a[1] > o.a)) o.a = a[1]; if (b && (!o.b || b[1] > o.b)) o.b = b[1]; out.set(key, o); });
  return [...out.values()].map(o => ({ ...o, d: o.a && o.b ? l3scDays(o.a, o.b) : null, kind: !o.a ? "ny" : !o.b ? "utgått" : "flyttad" })).filter(o => o.d === null || Math.abs(o.d) > 7).sort((x, y) => (y.d === null ? 999 : y.d) - (x.d === null ? 999 : x.d));
}
/* ---- Gränssnitt ---- */
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
#v3Scen figcaption{padding:10px 12px;display:grid;gap:7px;min-width:0}#v3Scen .sc-h span{flex:1;min-width:0}#v3Scen .sc-h button{flex:none}#v3Scen .sc-h{display:flex;align-items:center;gap:8px;font-weight:650;font-size:14px}#v3Scen .sc-h i{font:700 12px ui-monospace,monospace;font-style:normal;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;color:#04181c;flex:none}
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
const L3SC_COL = ["#19a7bd", "#f0b429", "#b58cff"];
const l3scLong = iso => { const d = new Date(iso + "T00:00:00"); return isNaN(d) ? iso : d.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); };
const l3scCol = ph => (typeof phaseColor === "function" ? phaseColor(ph) : { klar: "#22c55e", pagaende: "#facc15", forsenad: "#ef4444", planerad: "#94a3b8" }[ph]);
function l3scOptName(id) { const x = l3sc.list.find(q => q.id === id); return x ? x.name : "–"; }
function l3scSideHtml() {
  const E = escHtml, sel = k => `<div class="sc-sel"><div><i style="background:${L3SC_COL[k]}">${"ABC"[k]}</i><b>Scenario ${"ABC"[k]}</b></div><select data-sc="sel${k}">${[["", "– inget –"], ...l3sc.list.map(x => [x.id, x.name])].map(([v, t]) => `<option value="${E(v)}" ${l3sc.sel[k] === v ? "selected" : ""}>${E(t)}</option>`).join("")}</select><small>${(() => { const x = l3sc.list.find(q => q.id === l3sc.sel[k]); return x ? `${x.n.toLocaleString("sv-SE")} aktiviteter med datum${x.at ? " · sparad " + x.at.slice(0, 10) : ""}` : ""; })()}</small></div>`;
  const O = l3sc.opts, chk = (k, t, tip) => `<label class="sc-chk" title="${E(tip)}"><input type="checkbox" data-sc-o="${k}" ${O[k] ? "checked" : ""}><span>${t}</span></label>`;
  return `<h4>Scenarier</h4>${sel(0)}${sel(1)}${sel(2)}
    <h4>Visning</h4>
    <label class="sc-sel"><small>Aktiviteter som saknas i en plan (t.ex. tillkommande arbeten)</small><select data-sc="missing"><option value="hide" ${O.missing === "hide" ? "selected" : ""}>Visas inte (fanns inte i planen)</option><option value="plan" ${O.missing === "plan" ? "selected" : ""}>Visas med nuvarande datum</option></select></label>
    ${chk("ghost", "Ej påbörjat som ljust spöke", "Visar det som ännu inte är påbörjat som en blek siluett så att bygget syns i sitt sammanhang")}${chk("solidDone", "Klart helt täckande", "Annars används Klart-opaciteten från Ganttens inställningar")}${chk("progressCur", "Nuvarande: följ framdrift", "Nuvarande tidplan visas med verklig framdrift (försenat) i stället för bara datum")}${chk("dark", "Mörk bakgrund i bilderna", "Färgerna framträder tydligare mot en mörk bakgrund – bara i scenariobilderna")}${chk("delta", "Skillnadsvy mot A", "Visar hur nuvarande tidplan (B) avviker från A, aktivitet för aktivitet")}
    <h4>Spara</h4><button type="button" data-sc="snap" title="Sparar alla aktiviteters nuvarande datum som ett scenario att jämföra med senare">＋ Spara nuvarande tidplan som scenario…</button>
    ${l3sc.snaps.length ? l3sc.snaps.map(s => `<div class="sc-n" style="justify-content:space-between"><span>${E(s.name)}</span><button type="button" data-sc-del="${E(s.id)}" style="padding:2px 8px" title="Ta bort">✕</button></div>`).join("") : `<div class="sc-note">Baselines från Powerproject-importen finns i listan ovan. Saknas en äldre tidplan: importera den som egen baseline i dashboarden.</div>`}`;
}
function l3scRenderSide() { const a = l3sc.el && l3sc.el.querySelector(".sc-side"); if (!a) return; a.innerHTML = l3scSideHtml(); l3scBindSide(); }
function l3scBindSide() {
  const el = l3sc.el; if (!el) return;
  el.querySelectorAll("[data-sc^=sel]").forEach(s => { s.onchange = () => { l3sc.sel[Number(s.dataset.sc.slice(3))] = s.value; l3scSave(); l3scRenderSide(); l3scBuildStage(); l3scPaintAll(); }; });
  const ms = el.querySelector('[data-sc="missing"]'); if (ms) ms.onchange = () => { l3sc.opts.missing = ms.value; l3scSave(); l3scPaintAll(); };
  el.querySelectorAll("[data-sc-o]").forEach(c => { c.onchange = () => { l3sc.opts[c.dataset.scO] = c.checked; l3scSave(); if (c.dataset.scO === "delta") l3scBuildStage(); l3scPaintAll(); }; });
  const sn = el.querySelector('[data-sc="snap"]'); if (sn) sn.onclick = () => l3scSnapshot();
  el.querySelectorAll("[data-sc-del]").forEach(b => { b.onclick = () => l3scDropSnap(b.dataset.scDel); });
}
function l3scBuildStage() {
  const m = l3sc.el && l3sc.el.querySelector("main"); if (!m) return; const E = escHtml, act = l3sc.sel.map((s, k) => (s ? k : -1)).filter(k => k >= 0), r = l3gmRange2 && l3gmRange2();
  const legend = `<div class="sc-legend">${["klar", "pagaende", "planerad"].map(p => `<span><i style="background:${l3scCol(p)}"></i>${L3SC_PH[p]}${p === "planerad" ? " (spöke)" : ""}</span>`).join("")}${l3sc.opts.progressCur ? `<span><i style="background:${l3scCol("forsenad")}"></i>Försenat (nuvarande plan)</span>` : ""}<span style="margin-left:auto">Samma kamera och datum i alla bilder · färgerna följer Ganttens statusfärger</span></div>`;
  m.innerHTML = `${act.length < 2 ? `<div class="sc-err">Välj minst två scenarier till vänster för att jämföra.</div>` : ""}
    <div class="sc-grid">${act.map(k => `<figure data-k="${k}"><canvas width="1000" height="560"></canvas><figcaption><div class="sc-h"><i style="background:${L3SC_COL[k]}">${"ABC"[k]}</i><span>${E(l3scOptName(l3sc.sel[k]))}</span><button type="button" data-sc-go="${k}" title="Utforska scenariot i 3D (fri kamera)">Utforska ▸</button></div><div class="sc-pct" data-pct="${k}">–<small>klart</small></div><div class="sc-bar" data-bar="${k}"></div><div class="sc-n" data-n="${k}"></div></figcaption></figure>`).join("")}</div>
    ${legend}
    ${l3sc.opts.delta && l3sc.sel[0] && l3sc.sel[1] ? `<div class="sc-dl"><figure data-k="delta"><canvas width="1000" height="560"></canvas><figcaption><div class="sc-h"><i style="background:#ff8d78">Δ</i><span>Skillnad: ${E(l3scOptName(l3sc.sel[1]))} mot ${E(l3scOptName(l3sc.sel[0]))}</span></div><div class="sc-n" data-n="delta"></div><div class="sc-legend"><span><i style="background:#dc2626"></i>Senare</span><span><i style="background:#2563eb"></i>Tidigare</span><span><i style="background:#cbd5e1"></i>Oförändrat (±7 d)</span><span><i style="background:#a855f7"></i>Tillkommit</span><span><i style="background:#f59e0b"></i>Utgått</span></div></figcaption></figure>
      <div><h4 style="margin:0 0 6px;font:650 11px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#8fa6ad">Aktiviteter som skiljer</h4><div style="max-height:360px;overflow:auto"><table><thead><tr><th>Aktivitet</th><th class="n">A slut</th><th class="n">B slut</th><th class="n">Avvikelse</th></tr></thead><tbody id="scTb"></tbody></table></div></div></div>` : ""}
    <div class="sc-tl"><button type="button" id="scPlay" title="Spela upp tiden i alla bilder samtidigt">▶ Spela</button><input type="range" id="scSl" min="0" max="100" step="1" value="0"><span id="scRng"></span></div>`;
  const rg = r || [l3DateAdd(l3sc.date, -120), l3DateAdd(l3sc.date, 240)], sl = m.querySelector("#scSl"); sl.max = Math.max(1, l3DateDays(rg[0], rg[1])); sl.value = Math.max(0, Math.min(sl.max, l3DateDays(rg[0], l3sc.date))); m.querySelector("#scRng").textContent = `${rg[0]} – ${rg[1]}`; l3sc.rg = rg;
  sl.oninput = () => { l3scGoDate(l3DateAdd(rg[0], Number(sl.value)), true); };
  m.querySelector("#scPlay").onclick = l3scTogglePlay;
  m.querySelectorAll("[data-sc-go]").forEach(b => { b.onclick = () => l3scExplore(Number(b.dataset.scGo)); });
  const tb = m.querySelector("#scTb"); if (tb) { const rows = l3scDiffRows(); tb.innerHTML = rows.slice(0, 40).map(o => `<tr><td title="${E(o.area)}">${E(o.name)}</td><td class="n">${o.a ? o.a.slice(2) : "–"}</td><td class="n">${o.b ? o.b.slice(2) : "–"}</td><td class="n ${o.kind === "ny" ? "nw" : o.d > 0 ? "late" : "early"}">${o.kind === "ny" ? "tillkommen" : o.kind === "utgått" ? "utgår" : (o.d > 0 ? "+" : "") + o.d + " d"}</td></tr>`).join("") || `<tr><td colspan="4" class="sc-note">Inga avvikelser över 7 dagar.</td></tr>`; }
}
function l3scGoDate(d, fromSlider) {
  l3sc.date = d; const big = l3sc.el && l3sc.el.querySelector(".sc-big"), di = l3sc.el && l3sc.el.querySelector("#scDate"); if (big) big.textContent = d; if (di && di.value !== d) di.value = d;
  const sl = l3sc.el && l3sc.el.querySelector("#scSl"); if (sl && !fromSlider && l3sc.rg) sl.value = Math.max(0, Math.min(Number(sl.max), l3DateDays(l3sc.rg[0], d)));
  l3scPaintAll();
}
let l3scPaintBusy = false, l3scPaintAgain = false;
async function l3scPaintAll() {
  if (!l3sc.el) return; if (l3scPaintBusy) { l3scPaintAgain = true; return; } l3scPaintBusy = true;
  try {
    do {
      l3scPaintAgain = false; l3scBegin(); l3plSetDay(l3sc.date);
      for (const fig of l3sc.el.querySelectorAll("figure[data-k]")) {
        const k = fig.dataset.k === "delta" ? "delta" : Number(fig.dataset.k), t = l3scPaint(fig.querySelector("canvas"), k);
        if (k === "delta") { const K = l3scDeltaK(t), n = fig.querySelector('[data-n="delta"]'); if (n) n.innerHTML = `<span>Senare <b>${K.late}</b></span><span>Tidigare <b>${K.early}</b></span><span>Oförändrat <b>${K.same}</b></span><span>Tillkommit <b>${K.nw}</b></span><span>Utgått <b>${K.gone}</b></span>`; continue; }
        const K = l3scKpi(t), pct = fig.querySelector(`[data-pct="${k}"]`), bar = fig.querySelector(`[data-bar="${k}"]`), nn = fig.querySelector(`[data-n="${k}"]`), n = Math.max(1, K.n);
        if (pct) pct.innerHTML = `${K.pct} %<small>av ${K.n} kopplade objekt klara</small>`;
        if (bar) bar.innerHTML = ["klar", "pagaende", "forsenad"].map(p => `<b style="width:${K[p] / n * 100}%;background:${l3scCol(p)}"></b>`).join("");
        if (nn) nn.innerHTML = `<span>Klart <b>${K.klar}</b></span><span>Pågår <b>${K.pagaende}</b></span>${K.forsenad ? `<span>Försenat <b>${K.forsenad}</b></span>` : ""}<span>Ej påbörjat <b>${K.planerad}</b></span>${K.saknas ? `<span title="Objektens aktiviteter fanns inte i planen">Fanns ej <b>${K.saknas}</b></span>` : ""}`;
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
/* Öppna och stäng */
async function l3scOpen() {
  const host = document.getElementById("v3Canvas") || document.getElementById("view3d"); if (!host) return; if (!document.getElementById("v3ScCss")) { const st = document.createElement("style"); st.id = "v3ScCss"; st.textContent = L3SC_CSS; document.head.appendChild(st); }
  l3scBadgeStop(false); if (l3sc.el) l3sc.el.remove();
  const el = document.createElement("div"); el.id = "v3Scen"; l3sc.el = el; host.appendChild(el); ["pointerdown", "wheel", "contextmenu", "dblclick", "keydown", "keyup"].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
  el.innerHTML = `<div class="sc-top"><button type="button" id="scClose" title="Stäng (Esc)">✕ Stäng</button><div class="sc-ttl"><small>${escHtml((typeof projectName !== "undefined" && projectName) || "Projekt")}</small>Tidplansscenarier – projektläget i tre planer</div>
    <div class="sc-date"><button type="button" id="scPrev" title="En vecka bakåt">‹ v</button><div class="sc-big">${$("dateInput").value || todayIso()}</div><button type="button" id="scNext" title="En vecka framåt">v ›</button><input type="date" id="scDate"><button type="button" id="scToday">Idag</button></div>
    <button type="button" id="scView" title="Dölj jämförelsen och ställ in kameran – bilderna ritas om från den nya vyn">Ändra vy</button><button type="button" class="pri" id="scExp" title="Skapar en rapportbild med alla bilder, nyckeltal och teckenförklaring">⤓ Rapportbild (PNG)</button><button type="button" id="scPdf">PDF</button><button type="button" id="scCopy" title="Kopierar rapportbilden så att den kan klistras in i PowerPoint">Kopiera</button></div>
    <div class="sc-body"><div class="sc-side"></div><main><div class="sc-note">Hämtar tidplaner …</div></main></div>`;
  l3sc.date = l3sc.date || $("dateInput").value || todayIso(); el.querySelector("#scDate").value = l3sc.date; el.querySelector(".sc-big").textContent = l3sc.date;
  el.querySelector("#scClose").onclick = l3scClose; el.querySelector("#scToday").onclick = () => l3scGoDate(todayIso()); el.querySelector("#scPrev").onclick = () => l3scGoDate(l3DateAdd(l3sc.date, -7)); el.querySelector("#scNext").onclick = () => l3scGoDate(l3DateAdd(l3sc.date, 7));
  el.querySelector("#scDate").onchange = e => { if (e.target.value) l3scGoDate(e.target.value); };
  el.querySelector("#scView").onclick = () => l3scAdjustView(); el.querySelector("#scExp").onclick = () => l3scReport("png"); el.querySelector("#scPdf").onclick = () => l3scReport("pdf"); el.querySelector("#scCopy").onclick = () => l3scReport("copy");
  el.addEventListener("keydown", e => { if (e.key === "Escape") { e.stopPropagation(); l3scClose(); } });
  try { await l3scLoad(); } catch (e) { l3sc.err = e.message; }
  if (!l3sc.el) return; l3scRenderSide(); l3scBuildStage(); l3scBegin(); await l3scPaintAll();
}
function l3scClose() { if (l3sc.play) l3scTogglePlay(); if (l3sc.el) { l3sc.el.remove(); l3sc.el = null; } l3scBadgeStop(true); l3scRestore(); }
/* Ändra vy: jämförelsen göms, kameran ställs in som vanligt, en liten pill tar en tillbaka. */
function l3scAdjustView() { if (!l3sc.el) return; if (l3sc.play) l3scTogglePlay(); l3sc.el.style.display = "none"; l3scBadge("Ställ in kameran – jämförelsen ritas om från den nya vyn", [["Tillbaka till jämförelsen", () => { l3scBadgeStop(false); l3sc.el.style.display = ""; l3scPaintAll(); }], ["Avsluta", l3scClose]], 0); }
function l3scExplore(k) { if (!l3sc.el) return; l3sc.el.style.display = "none"; l3scBegin(); l3plSetDay(l3sc.date); l3sc.render = k; l3gmApply(true); l3scBadge(`Scenario ${"ABC"[k]}: ${l3scOptName(l3sc.sel[k])} · ${l3sc.date}`, [["Tillbaka till jämförelsen", () => { l3scBadgeStop(false); l3sc.el.style.display = ""; l3scPaintAll(); }], ["Avsluta", l3scClose]], k); }
function l3scBadge(text, btns, k) {
  l3scBadgeStop(false); const host = document.getElementById("v3Canvas") || document.getElementById("view3d"), b = document.createElement("div"); b.id = "v3ScBadge"; b.innerHTML = `<span style="width:10px;height:10px;border-radius:50%;background:${L3SC_COL[k] || "#fff"};display:inline-block"></span><span>${escHtml(text)}</span>`;
  btns.forEach(([t, f]) => { const x = document.createElement("button"); x.type = "button"; x.textContent = t; x.onclick = f; b.appendChild(x); }); host.appendChild(b);
}
function l3scBadgeStop(restore) { const b = document.getElementById("v3ScBadge"); if (b) b.remove(); if (restore) l3sc.render = null; }
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
