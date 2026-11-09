/* 3D-vyn – Analys: ny design och fler flikar (Victor 2026-11-09: "jobba igenom analysprogrammet – mycket smartare och snyggare, och en flik för gjutformar").
   Delad utseendekit (sammanfattningskort, sorterbara tabeller med staplar, sökfält, tomlägen), en omgjord Mängdning (sök, sortera, klicka för att markera i 3D, staplar,
   summakort) och fliken Gjutformar: alla gjutformar (Gjutetapp) med volym, formsida, betongbilar, armering och gjutdatum, summor, vecka för vecka och export. */

/* ---------- utseende ---------- */
(function l3anUiCss() {
  const st = document.createElement("style"); st.textContent = `
  #view3d .v3-an{width:min(460px,calc(100% - 24px));border-radius:18px;box-shadow:0 18px 48px rgba(15,23,42,.28);overflow:hidden;display:flex;flex-direction:column;max-height:calc(100% - 24px)}
  #view3d .v3-an>.v3-vp-h{background:linear-gradient(180deg,#f8fafc,#fff);border-bottom:1px solid #e2e8f0}
  #view3d .v3-an>:not(.v3-vp-h){overflow:auto}
  #view3d .v3-an-tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;padding:2px 0 6px;position:sticky;top:0;background:#fff;z-index:3}
  #view3d .v3-an-tabs button{display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 2px 6px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;font-size:11px;line-height:1.1;color:#475569;cursor:pointer;transition:.12s}
  #view3d .v3-an-tabs button svg{width:18px;height:18px}
  #view3d .v3-an-tabs button:hover{background:#eef4ff;border-color:#bfd2ff}
  #view3d .v3-an-tabs button.on{background:#2f6bff;border-color:#2f6bff;color:#fff;box-shadow:0 4px 12px rgba(47,107,255,.35)}
  .an-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:4px 0}
  .an-kpi{background:linear-gradient(180deg,#f8fafc,#f1f5f9);border:1px solid #e2e8f0;border-radius:12px;padding:8px 10px;min-width:0}
  .an-kpi b{display:block;font-size:19px;line-height:1.15;color:#0f172a;font-variant-numeric:tabular-nums;white-space:nowrap}.an-kpi b small{font-size:11px;font-weight:600;color:#64748b;margin-left:3px}
  .an-kpi span{display:block;font-size:11px;color:#64748b;margin-top:1px}
  .an-kpi.hi{background:linear-gradient(180deg,#eff6ff,#dbeafe);border-color:#bfdbfe}.an-kpi.hi b{color:#1d4ed8}
  .an-seg{display:inline-flex;background:#f1f5f9;border-radius:10px;padding:3px;gap:2px}.an-seg button{border:0;background:none;padding:5px 11px;border-radius:8px;font:inherit;font-size:12px;color:#475569;cursor:pointer}.an-seg button.on{background:#fff;color:#1d4ed8;font-weight:700;box-shadow:0 1px 3px rgba(15,23,42,.15)}
  .an-search{position:relative;flex:1 1 160px;min-width:0}.an-search input{width:100%;padding:7px 9px 7px 30px!important;border-radius:10px!important}.an-search svg{position:absolute;left:9px;top:50%;transform:translateY(-50%);width:15px;height:15px;color:#94a3b8;pointer-events:none}
  .an-tbl{width:100%;border-collapse:collapse;font-size:12.5px}.an-tbl th{position:sticky;top:0;background:#fff;text-align:right;color:#64748b;font-weight:600;font-size:11.5px;padding:6px 6px;cursor:pointer;user-select:none;white-space:nowrap;border-bottom:1px solid #e2e8f0}
  .an-tbl th:first-child,.an-tbl td:first-child{text-align:left}.an-tbl th.on{color:#1d4ed8}.an-tbl th .ar{font-size:9px;margin-left:3px}
  .an-tbl td{padding:6px;text-align:right;font-variant-numeric:tabular-nums;border-bottom:1px solid #f1f5f9;position:relative}.an-tbl tr.rw{cursor:pointer}.an-tbl tr.rw:hover td{background:#f5f9ff}
  .an-tbl td.nm{max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;color:#0f172a}
  .an-tbl td .bar{position:absolute;left:0;top:3px;bottom:3px;background:linear-gradient(90deg,rgba(59,130,246,.22),rgba(59,130,246,.08));border-radius:0 6px 6px 0;z-index:0}.an-tbl td span{position:relative;z-index:1}
  .an-tbl tr.tot td{font-weight:800;border-top:2px solid #cbd5e1;border-bottom:0;background:#f8fafc}
  .an-scroll{max-height:290px;overflow:auto;border:1px solid #e2e8f0;border-radius:12px}
  .an-empty{display:flex;flex-direction:column;gap:6px;align-items:flex-start;padding:14px;border:1px dashed #cbd5e1;border-radius:14px;background:#f8fafc;color:#475569;font-size:13px}.an-empty b{color:#0f172a;font-size:14px}
  .an-actions{display:flex;flex-wrap:wrap;gap:6px}.an-actions button{padding:7px 12px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;cursor:pointer;font:inherit;font-size:12.5px;color:#0f172a}.an-actions button:hover{background:#f1f5f9}.an-actions button.primary{background:#2f6bff;border-color:#2f6bff;color:#fff;font-weight:600}.an-actions button.primary:hover{background:#2459d8}
  .an-note{font-size:11.5px;color:#64748b}.an-h{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin:6px 0 2px}
  .an-weeks{display:flex;align-items:flex-end;gap:5px;height:92px;padding:6px 4px 0;border:1px solid #e2e8f0;border-radius:12px;background:#fbfdff;overflow-x:auto}
  .an-wk{flex:1 0 34px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:2px;height:100%;cursor:pointer}.an-wk i{display:block;width:100%;background:linear-gradient(180deg,#60a5fa,#2563eb);border-radius:5px 5px 0 0;min-height:3px}.an-wk span{font-size:10px;color:#64748b}.an-wk b{font-size:10px;color:#1d4ed8}
  #view3d .v3-an-r label.v3-vp-chk{flex-direction:row;flex:0 0 auto;align-items:center;gap:6px;font-size:12px;color:#475569}
  .an-wk:hover i{background:linear-gradient(180deg,#93c5fd,#1d4ed8)}`;
  document.head.appendChild(st);
})();
const L3AN_ICO = (() => { const s = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`; return {
  take: s('<path d="M4 20h16"/><rect x="5" y="11" width="3.4" height="9" rx=".8"/><rect x="10.3" y="5" width="3.4" height="15" rx=".8"/><rect x="15.6" y="14" width="3.4" height="6" rx=".8"/>'),
  form: s('<path d="M4 9h16v11H4z"/><path d="M2 9h20M7 9V5h10v4"/><path d="M8 14h8"/>'),
  slope: s('<path d="M3 19 21 7"/><path d="M3 19h18"/><path d="M9 19a6 6 0 0 0-1.4-3.6"/>'),
  mass: s('<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9z"/><path d="M12 12 20 7.5M12 12v9M12 12 4 7.5"/>'),
  clear: s('<path d="M4 12h16"/><path d="M4 8v8M20 8v8"/><path d="m9 9-3 3 3 3M15 9l3 3-3 3"/>'),
  cmp: s('<path d="M8 3H5a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h3M16 3h3a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1h-3"/><path d="M12 3v18"/>'),
  sel: s('<path d="M4 4h4M16 4h4M4 20h4M16 20h4M4 4v4M20 4v4M4 16v4M20 16v4"/><circle cx="12" cy="12" r="3"/>'),
  time: s('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  search: s('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>') }; })();

/* ---------- små byggstenar ---------- */
const l3anKpis = list => `<div class="an-kpis">${list.map(k => `<div class="an-kpi${k.hi ? " hi" : ""}"><b>${k.v}<small>${k.u || ""}</small></b><span>${k.l}</span></div>`).join("")}</div>`;
const l3anSearch = (v, ph) => `<label class="an-search">${L3AN_ICO.search}<input type="text" data-an-q placeholder="${ph}" value="${escHtml(v || "")}"></label>`;
/* Sorterbar tabell: cols = [{k, l, num, f, bar}], rows = [{...}]; sort = { k, dir }. Staplar = andel av största värdet i kolumnen med bar:true. */
function l3anTable(cols, rows, sort, o = {}) {
  const max = {}; cols.filter(c => c.bar).forEach(c => { max[c.k] = Math.max(1e-9, ...rows.map(r => Number(r[c.k]) || 0)); });
  const head = cols.map(c => `<th data-an-sort="${c.k}" class="${sort && sort.k === c.k ? "on" : ""}">${c.l}${sort && sort.k === c.k ? `<span class="ar">${sort.dir > 0 ? "▲" : "▼"}</span>` : ""}</th>`).join("");
  const body = rows.map((r, i) => `<tr class="rw" data-an-row="${i}">${cols.map(c => { const v = r[c.k], t = c.f ? c.f(v, r) : escHtml(v == null ? "" : v); return c.k === cols[0].k ? `<td class="nm" title="${escHtml(r[c.k])}">${t}</td>` : `<td>${c.bar ? `<i class="bar" style="width:${Math.round((Number(v) || 0) / max[c.k] * 100)}%"></i>` : ""}<span>${t}</span></td>`; }).join("")}</tr>`).join("");
  const tot = o.total ? `<tr class="tot">${cols.map((c, i) => `<td>${i === 0 ? "Summa" : o.total[c.k] != null ? (c.f ? c.f(o.total[c.k], o.total) : o.total[c.k]) : ""}</td>`).join("")}</tr>` : "";
  return `<div class="an-scroll"><table class="an-tbl"><thead><tr>${head}</tr></thead><tbody>${body}${tot}</tbody></table></div>`;
}
const l3anSortRows = (rows, sort) => rows.slice().sort((a, b) => { const x = a[sort.k], y = b[sort.k]; return (typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), "sv", { numeric: true })) * sort.dir; });
function l3anBindTable(el, st, rerender, onRow) {
  el.querySelectorAll("[data-an-sort]").forEach(th => { th.onclick = () => { const k = th.dataset.anSort; st.sort = st.sort && st.sort.k === k ? { k, dir: -st.sort.dir } : { k, dir: k === (st.cols[0] || {}).k ? 1 : -1 }; rerender(); }; });
  el.querySelectorAll("[data-an-row]").forEach(tr => { tr.onclick = () => onRow(+tr.dataset.anRow); });
  const q = el.querySelector("[data-an-q]"); if (q) { q.oninput = () => { st.q = q.value; const pos = q.selectionStart; rerender(); const n = document.querySelector("#v3AnPanel [data-an-q]"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }; }
}

/* ---------- 1. Mängdning (omgjord) ---------- */
const l3anT = { sort: { k: "vol", dir: -1 }, q: "", cols: [] };
function l3anTake(esc) {
  const gb = l3an.gb, rows = l3an.takeRows, name = gb === "cls" ? "Klass" : gb === "model" ? "Modell" : "Namn";
  const seg = `<div class="an-seg" data-an-gbs>${[["cls", "IFC-klass"], ["model", "Modell"], ["name", "Namn"]].map(([v, l]) => `<button type="button" data-v="${v}" class="${gb === v ? "on" : ""}">${l}</button>`).join("")}</div>`;
  if (!rows && !l3an.takeBusy && !l3an.takeAuto) { l3an.takeAuto = true; let n = 0; l3anModels().filter(m => m.visible).forEach(m => m.meshes.forEach(me => { n += (me.userData.l3b && me.userData.l3b.ranges.length) || 0; })); if (n < 3000) setTimeout(() => { if (!l3an.takeRows && document.getElementById("v3AnPanel") && l3an.tab === "take") l3anTakeRun(); }, 60); }   // litet underlag: räkna direkt vid första öppningen
  if (!rows) return { html: `${seg}<div class="an-empty"><b>Mängder av det som är tänt</b>Antal, yta och volym per ${name.toLowerCase()} – IFC-modeller, etableringsobjekt och ritade objekt. Tryck på en rad för att markera objekten i 3D.<div class="an-actions"><button type="button" class="primary" data-an-go>${l3an.takeBusy || "Räkna mängder"}</button></div></div>`, bind: el => l3anTakeBind(el) };
  const q = l3anT.q.toLowerCase(), view = l3anSortRows(rows.filter(r => !q || r.k.toLowerCase().includes(q)), l3anT.sort), tot = view.reduce((a, r) => ({ n: a.n + r.n, area: a.area + r.area, vol: a.vol + r.vol }), { n: 0, area: 0, vol: 0 });
  l3anT.cols = [{ k: "k", l: name }, { k: "n", l: "Antal" }, { k: "area", l: "Yta m²", f: v => l3anF(v) }, { k: "vol", l: "Volym m³", bar: true, f: v => l3anF(v, 2) }]; l3anT.view = view;
  const all = rows.reduce((a, r) => ({ n: a.n + r.n, area: a.area + r.area, vol: a.vol + r.vol }), { n: 0, area: 0, vol: 0 });
  return { html: `${l3anKpis([{ v: l3anF(all.n, 0), l: "objekt", hi: true }, { v: l3anF(all.vol, 1), u: "m³", l: "volym" }, { v: l3anF(all.area, 0), u: "m²", l: "yta" }])}
    <div class="v3-an-r" style="align-items:center">${seg}${l3anSearch(l3anT.q, "Sök " + name.toLowerCase() + "…")}</div>
    ${view.length ? l3anTable(l3anT.cols, view, l3anT.sort, { total: tot }) : `<div class="an-empty">Inget matchar "${esc(l3anT.q)}".</div>`}
    <div class="an-actions"><button type="button" data-an-go>${l3an.takeBusy || "↻ Räkna om"}</button><button type="button" data-an-csv>Exportera CSV</button></div><div class="an-note">Räknar det som är tänt och utlagt. Tryck på en rad för att markera i 3D, tryck på en kolumnrubrik för att sortera.</div>`,
    bind: el => l3anTakeBind(el) };
}
function l3anTakeBind(el) {
  const g = el.querySelector("[data-an-gbs]"); if (g) g.querySelectorAll("button").forEach(b => { b.onclick = () => { l3an.gb = b.dataset.v; l3an.takeRows = null; l3anOpen(); }; });
  const go = el.querySelector("[data-an-go]"); if (go) go.onclick = () => l3anTakeRun();
  l3anBindTable(el, l3anT, () => l3anOpen(), i => { const r = (l3anT.view || [])[i]; if (!r) return; if (r.refs && r.refs.length) { l3bsSet(r.refs.map(x => ({ mesh: x.mesh, ri: x.ri }))); if (typeof l3bsZoom === "function") l3bsZoom(); } else if (r.pls && r.pls.length) { l3SelectIds(r.pls); } });
  const c = el.querySelector("[data-an-csv]"); if (c) c.onclick = () => { const rows = l3an.takeRows || []; l3anCsv([[(l3an.gb === "cls" ? "Klass" : l3an.gb === "model" ? "Modell" : "Namn"), "Antal", "Yta m2", "Volym m3"], ...rows.map(r => [r.k, r.n, Math.round(r.area * 100) / 100, Math.round(r.vol * 1000) / 1000])], "mangdning.csv"); };
}
async function l3anTakeRun() {
  const groups = new Map(), add = (k, st, ref) => { const g = groups.get(k) || { k, n: 0, area: 0, vol: 0, refs: [], pls: [] }; g.n++; g.area += st.area; g.vol += st.vol; if (ref && ref.mesh) g.refs.push(ref); if (ref && ref.pl) g.pls.push(ref.pl); groups.set(k, g); };
  l3an.takeBusy = "Räknar…"; l3anOpen(); await l3anTick(); let work = 0;
  for (const m of l3anModels().filter(m => m.visible)) for (const mesh of m.meshes) {
    const u = mesh.userData.l3b; if (!u) continue;
    for (let ri = 0; ri < u.ranges.length; ri++) {
      if (u.hidden && u.hidden.has(ri)) continue; const r = u.ranges[ri]; const st = l3anStats(l3anRangeTris(mesh, ri, []));
      add(l3an.gb === "cls" ? l3anClsName(r.cls) : l3an.gb === "model" ? (m.name || "Modell") : (r.name || "(namnlös)"), st, { mesh, ri });
      if (++work % 400 === 0) await l3anTick();
    }
  }
  placements.filter(p => !(placeLib(p.type) || {}).isModel && l3PlaceOnDate(p)).forEach(p => {
    let st = { area: 0, vol: 0 }; if (p.m) { const d = modDims(p); st = { area: d.area || 0, vol: d.volume || 0 }; } else { const L = Number(p.L) || 0, B = Number(p.B) || 0, H = Number(p.H) || 0; st = { area: 2 * (L * B + L * H + B * H), vol: L * B * H }; }
    add(l3an.gb === "cls" ? "Etablering: " + ((placeLib(p.type) || {}).label || p.type) : l3an.gb === "model" ? "Etablering" : (p.name || p.type), st, { pl: p.id });
  });
  l3an.takeRows = [...groups.values()]; l3an.takeBusy = ""; l3anOpen();
}

/* ---------- Gjutformar ---------- */
const l3gf = { sort: { k: "start", dir: 1 }, q: "", cols: [], all: true };
const L3GF_TYPES = new Set(["sm:gjutetapp", "sm:gjutform"]);
function l3gfRows() {
  return placements.filter(p => L3GF_TYPES.has(p.type) && (l3gf.all || (typeof l3PlaceOnDate !== "function" || l3PlaceOnDate(p)))).map(p => {
    let poly = null; try { poly = p.type === "sm:gjutform" ? gjutFreePoly(p) : gjutPoly(p); } catch (e) { poly = null; }
    if (!poly || poly.length < 3) return null; let st; try { st = gjutStats(p, poly); } catch (e) { return null; }
    const xs = poly.map(q => q[0]), ys = poly.map(q => q[1]), L = Math.max(...xs) - Math.min(...xs), B = Math.max(...ys) - Math.min(...ys);
    return { id: p.id, k: p.name || "Gjutform", L, B, H: st.H, area: st.area, vol: st.vol, side: st.per * st.H, per: st.per, bilar: st.bilar, tim: st.tim, kg: st.kg, kval: (p.f && p.f.kval) || "C30/37", start: p.start || "", end: p.end || "", note: p.note || "" };
  }).filter(Boolean);
}
const l3gfWeek = iso => { if (!iso) return "Utan datum"; const d = new Date(iso + "T00:00:00Z"); if (isNaN(d)) return "Utan datum"; const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow + 3); const y = d.getUTCFullYear(), j = new Date(Date.UTC(y, 0, 4)); return `${y}-v${String(1 + Math.round(((d - j) / 864e5 - 3 + ((j.getUTCDay() + 6) % 7)) / 7)).padStart(2, "0")}`; };
function l3anForms(esc) {
  const all = l3gfRows();
  if (!all.length) return { html: `<div class="an-empty"><b>Inga gjutformar än</b>Markera fundament i modellen och tryck <b style="display:inline">Gjutform</b> i markeringsrutan – då skapas en fyrsidig form runt varje fundament. Här ser du sedan volym, formsida, betongbilar och armering för alla former, vecka för vecka.<div class="an-actions"><button type="button" class="primary" data-gf-make>Skapa av markerade fundament</button></div></div>`, bind: el => { el.querySelector("[data-gf-make]").onclick = () => { if (typeof l3bsMakeForms === "function" && typeof l3bs !== "undefined" && l3bs.sel.length) l3bsMakeForms().then(() => l3anOpen()); else l3Status("Markera fundamenten i modellen först.", true); }; } };
  const q = l3gf.q.toLowerCase(), view = l3anSortRows(all.filter(r => !q || r.k.toLowerCase().includes(q)), l3gf.sort), sum = k => view.reduce((a, r) => a + (r[k] || 0), 0);
  const tot = { k: "Summa", vol: sum("vol"), side: sum("side"), bilar: sum("bilar"), area: sum("area"), kg: sum("kg") };
  l3gf.cols = [{ k: "k", l: "Form" }, { k: "vol", l: "Betong m³", bar: true, f: v => l3anF(v, 2) }, { k: "side", l: "Formsida m²", f: v => l3anF(v, 1) }, { k: "bilar", l: "Bilar" }, { k: "start", l: "Gjuts", f: v => v ? esc(String(v).slice(5)) : "–" }]; l3gf.view = view;
  const weeks = new Map(); view.forEach(r => { const w = l3gfWeek(r.start), g = weeks.get(w) || { w, vol: 0, ids: [] }; g.vol += r.vol; g.ids.push(r.id); weeks.set(w, g); });
  const wl = [...weeks.values()].sort((a, b) => (a.w === "Utan datum") - (b.w === "Utan datum") || a.w.localeCompare(b.w)), wmax = Math.max(1e-9, ...wl.map(w => w.vol)); l3gf.weeks = wl;
  return { html: `${l3anKpis([{ v: l3anF(view.length, 0), l: "gjutformar", hi: true }, { v: l3anF(tot.vol, 1), u: "m³", l: "betong", hi: true }, { v: l3anF(tot.bilar, 0), u: "st", l: "betongbilar" }, { v: l3anF(tot.side, 0), u: "m²", l: "formsida" }, { v: l3anF(tot.area, 0), u: "m²", l: "gjutyta" }, { v: tot.kg > 0 ? l3anF(tot.kg, 0) : "–", u: tot.kg > 0 ? "kg" : "", l: "armering" }])}
    <div class="an-h">Betong per vecka (m³)</div><div class="an-weeks">${wl.map((w, i) => `<div class="an-wk" data-gf-wk="${i}" title="${esc(w.w)}: ${l3anF(w.vol, 1)} m³ · ${w.ids.length} former – tryck för att markera"><b>${l3anF(w.vol, w.vol < 10 ? 1 : 0)}</b><i style="height:${Math.max(4, Math.round(w.vol / wmax * 60))}px"></i><span>${esc(w.w === "Utan datum" ? "–" : w.w.replace(/^\d{4}-/, ""))}</span></div>`).join("")}</div>
    <div class="v3-an-r" style="align-items:center">${l3anSearch(l3gf.q, "Sök form…")}<label class="v3-vp-chk" title="Av: bara de former som gäller datumet i tidslinjen"><input type="checkbox" data-gf-all ${l3gf.all ? "checked" : ""}> Alla datum</label></div>
    ${l3anTable(l3gf.cols, view, l3gf.sort, { total: tot })}
    <div class="an-actions"><button type="button" class="primary" data-gf-sel>Markera alla</button><button type="button" data-gf-csv>Exportera CSV</button><button type="button" data-gf-make title="Skapa former runt de fundament som är markerade i modellen">+ Skapa fler</button></div>
    <div class="an-note">Volym = gjutyta × höjd (+ tillägg för spill). Formsida = omkrets × höjd. Bilar och pumptid följer inställningarna på varje form. Tryck på en rad för att markera och flyga dit; kolumnrubrikerna sorterar.</div>`,
    bind: el => {
      l3anBindTable(el, l3gf, () => l3anOpen(), i => { const r = l3gf.view[i]; if (!r) return; l3SelectIds([r.id]); const g = l3.placeMeshes && l3.placeMeshes.get(r.id); if (g) { const bb = new THREE.Box3().setFromObject(g); l3FlyTo(bb.getCenter(new THREE.Vector3()), Math.max(6, bb.getSize(new THREE.Vector3()).length() * 3)); } });
      el.querySelectorAll("[data-gf-wk]").forEach(b => { b.onclick = () => { const w = l3gf.weeks[+b.dataset.gfWk]; if (w) l3SelectIds(w.ids); }; });
      el.querySelector("[data-gf-all]").onchange = e => { l3gf.all = e.target.checked; l3anOpen(); };
      el.querySelector("[data-gf-sel]").onclick = () => l3SelectIds(l3gf.view.map(r => r.id));
      el.querySelector("[data-gf-make]").onclick = () => { if (typeof l3bsMakeForms === "function" && typeof l3bs !== "undefined" && l3bs.sel.length) l3bsMakeForms().then(() => l3anOpen()); else l3Status("Markera fundamenten i modellen först, tryck sedan här.", true); };
      el.querySelector("[data-gf-csv]").onclick = () => l3anCsv([["Form", "Längd m", "Bredd m", "Höjd m", "Gjutyta m2", "Omkrets m", "Volym m3", "Formsida m2", "Betongbilar", "Pumptid h", "Armering kg", "Kvalitet", "Start", "Slut", "Anteckning"], ...l3gf.view.map(r => [r.k, r.L, r.B, r.H, r.area, r.per, r.vol, r.side, r.bilar, r.tim, r.kg, r.kval, r.start, r.end, r.note].map(v => typeof v === "number" ? Math.round(v * 1000) / 1000 : v)), ["Summa", "", "", "", Math.round(tot.area * 100) / 100, "", Math.round(tot.vol * 1000) / 1000, Math.round(tot.side * 100) / 100, tot.bilar, "", Math.round(tot.kg), "", "", "", ""]], "gjutformar.csv");
    } };
}
