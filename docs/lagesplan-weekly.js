/* Veckobilder (Victor 2026-11-05: "jag uppdaterar en lägesplan varje vecka där vi följer framdriften"): spara hela planens status och framdrift som en bild per vecka,
   bläddra tillbaka (Visa – skrivskyddat), jämför två veckor eller en vecka mot nu, se kurvan över veckorna och hämta den som CSV/Excel.
   • Sparas i projektets datalager: weekly/<år>-W<vecka>.json (en fil per vecka) och weekly/index.json (förteckning med nyckeltal). Inget i Trimble Connect, inget i webbläsaren.
   • Raderna är kompakta: [id, status, framdrift, verkligt start, verkligt slut]. Planeringsdatum, namn och lägen hämtas från den vanliga planen.
   • Visa: prickarnas färg och framdrift ersätts i minnet av veckans bild och datumet flyttas till veckans datum; ALLA skrivningar spärras tills man trycker Avsluta. */
const wk = { list: [], loaded: false, busy: false, view: null, polls: 0 };
const WK_ST = { klar: "k", pagaende: "p", pausad: "a", forsenad: "f", planerad: "x" }, WK_ST_BACK = { k: "klar", p: "pagaende", a: "pausad", f: "forsenad", x: "planerad" };
const WK_LABEL = { klar: "Klara", pagaende: "Pågår", pausad: "Pausade", forsenad: "Försenade", planerad: "Ej påbörjade" };
const wkPath = f => `projects/${encodeURIComponent(projectId)}/weekly/${f}`;
function wkIso(dateStr) {   // ISO-vecka: {y, w}
  const d = new Date((dateStr || todayIso()) + "T12:00:00"), t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())), day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day); const y = t.getUTCFullYear();
  return { y, w: Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7) };
}
const wkKey = dateStr => { const { y, w } = wkIso(dateStr); return `${y}-W${String(w).padStart(2, "0")}`; };
const wkLabel = key => `v. ${Number(key.split("-W")[1])}${/^\d{4}/.test(key) ? ` ${key.slice(0, 4)}` : ""}`;
const wkName = r => r.object_name || r.activity || r.object_id || r.id;
/* Nuvarande plan som kompakta rader och nyckeltal. */
function wkRows() { return items.map(r => [r.id, WK_ST[r.status] || "x", Math.round(Number(r.progress) || 0), r.actual_start_date || "", r.actual_end_date || ""]); }
function wkStats(rows) {
  const c = { k: 0, p: 0, a: 0, f: 0, x: 0 }; let sum = 0;
  rows.forEach(r => { c[r[1]] = (c[r[1]] || 0) + 1; sum += r[1] === "k" ? 100 : r[2]; });
  return { n: rows.length, klar: c.k, pagar: c.p, pausad: c.a, forsenad: c.f, planerad: c.x, avg: rows.length ? Math.round(sum / rows.length * 10) / 10 : 0 };
}
async function wkLoad(force) {
  if (wk.loaded && !force) return;
  if (typeof token === "undefined" || !token || typeof projectId === "undefined" || !projectId) return;
  wk.loaded = true;
  try { const a = await ghReadJSON(token, wkPath("index.json")); wk.list = (Array.isArray(a) ? a : []).filter(x => x && x.key).sort((p, q) => p.key < q.key ? 1 : -1); } catch (e) { wk.list = []; console.warn("Veckobilder", e); }
  wkRender();
}
async function wkSave() {
  if (wk.view) { alert("Avsluta veckobilden du tittar på först."); return; }
  if (!items.length) { alert("Planen har inga objekt att spara."); return; }
  const date = ($("dateInput") && $("dateInput").value) || todayIso(), key = wkKey(date), had = wk.list.find(x => x.key === key);
  if (had && !confirm(`Det finns redan en veckobild för ${wkLabel(key)} (sparad ${String(had.saved_at || "").slice(0, 10)}). Ersätta den med planens status just nu?`)) return;
  const note = (document.getElementById("wkNote") || {}).value || "";
  wk.busy = true; wkRender();
  try {
    const rows = wkRows(), st = wkStats(rows);
    const meta = { key, date, saved_at: new Date().toISOString(), by: (typeof settings !== "undefined" && settings.userName) || null, note: note.trim(), plan: (typeof plan !== "undefined" && plan && plan.id) || null, ...st };
    await ghWriteJSON(token, wkPath(key + ".json"), () => [{ ...meta, rows }], `Veckobild ${key}`);
    await ghWriteJSON(token, wkPath("index.json"), arr => [...(Array.isArray(arr) ? arr : []).filter(x => x.key !== key), meta].sort((p, q) => p.key < q.key ? 1 : -1), `Veckobild ${key} (förteckning)`);
    wk.list = [...wk.list.filter(x => x.key !== key), meta].sort((p, q) => p.key < q.key ? 1 : -1);
    if (typeof showLagesplanBanner === "function") showLagesplanBanner(`Veckobild ${wkLabel(key)} sparad – ${st.n} objekt, ${st.klar} klara, ${st.avg} % i snitt.`, 6000);
  } catch (e) { alert("Kunde inte spara veckobilden: " + e.message); }
  wk.busy = false; wkRender();
}
async function wkDelete(key) {
  if (wk.view) return; if (!confirm(`Ta bort veckobilden ${wkLabel(key)}? Det går inte att ångra.`)) return;
  try {
    await ghWriteJSON(token, wkPath("index.json"), arr => (Array.isArray(arr) ? arr : []).filter(x => x.key !== key), `Tog bort veckobild ${key}`);
    if (typeof ghDeleteBinary === "function") await ghDeleteBinary(token, wkPath(key + ".json"), `Tog bort veckobild ${key}`).catch(() => {});
    wk.list = wk.list.filter(x => x.key !== key); wkRender();
  } catch (e) { alert("Kunde inte ta bort: " + e.message); }
}
async function wkRead(key) { const a = await ghReadJSON(token, wkPath(key + ".json")), s = a && a[0]; if (!s || !Array.isArray(s.rows)) throw new Error("Veckobilden kunde inte läsas."); return s; }

/* ---- Visa (skrivskyddad) ---------------------------------------------------------------------------- */
function wkApply(s) {
  const by = new Map(s.rows.map(r => [r[0], r])), stash = items.map(r => [r, { status: r.status, progress: r.progress, actual_start_date: r.actual_start_date, actual_end_date: r.actual_end_date }]);
  wk.view = { key: s.key, stash, date0: $("dateInput").value, ghw: ghWriteJSON };
  items.forEach(r => { const q = by.get(r.id); if (q) { r.status = WK_ST_BACK[q[1]] || "planerad"; r.progress = q[2]; r.actual_start_date = q[3] || null; r.actual_end_date = q[4] || null; } else { r.status = "planerad"; r.progress = 0; r.actual_start_date = null; r.actual_end_date = null; } });
  // alla skrivningar spärras tills man avslutar – ändringar under tiden hade annars sparat veckans status som nuläge
  ghWriteJSON = function () { return Promise.reject(new Error("Du tittar på en veckobild (skrivskyddad) – tryck Avsluta först.")); };
  if (s.date) { $("dateInput").value = s.date; if (typeof syncSliderFromDate === "function") syncSliderFromDate(); }
  if (typeof invalidateVisible === "function") invalidateVisible();
}
function wkRestore() {
  const v = wk.view; if (!v) return; wk.view = null;
  ghWriteJSON = v.ghw;
  v.stash.forEach(([r, o]) => Object.assign(r, o));
  $("dateInput").value = v.date0; if (typeof syncSliderFromDate === "function") syncSliderFromDate();
  if (typeof invalidateVisible === "function") invalidateVisible();
}
async function wkView(key) {
  if (wk.view) wkEndView();
  let s; try { s = await wkRead(key); } catch (e) { alert(e.message); return; }
  wkApply(s); wkRefreshPlan(); wkBanner(s);
}
function wkEndView() { if (!wk.view) return; wkRestore(); wkRefreshPlan(); wkBanner(null); }
/* Veckobilden som IFC (Victor 2026-11-05): prickarna i veckans statusfärg med egenskaper, namn och kommentarerna (de som fanns till och med veckans sparning) som egenskaper och text. */
async function wkExportIfc(key) {
  if (typeof buildObjectsIfc !== "function") { alert("IFC-exporten är inte inläst."); return; }
  let s, cm = [];
  try { s = await wkRead(key); } catch (e) { alert(e.message); return; }
  try { const a = await ghReadJSON(token, dataPath("plan_item_comments.json")); cm = Array.isArray(a) ? a : []; } catch (e) { console.warn("Kommentarer", e); }
  const upTo = String(s.saved_at || "9999"), cmts = {};
  cm.filter(c => c && c.plan_item_id && String(c.created_at || "") <= upTo).forEach(c => { (cmts[c.plan_item_id] = cmts[c.plan_item_id] || []).push(c); });
  const prev = wk.view, prevKey = prev && prev.key;
  if (prev && prevKey !== key) wkRestore();
  const temp = !wk.view; if (temp) wkApply(s);
  let r, name;
  try {
    name = `Veckobild ${wkLabel(key).replace(/\s+/g, " ")} ${s.date || ""} ${plan ? plan.name : ""}.ifc`.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim();
    r = buildObjectsIfc({ comments: cmts, tag: `${wkLabel(key)} (${s.date || ""})${s.note ? " – " + s.note : ""}`, title: `Veckobild ${wkLabel(key)} ${s.date || ""}${s.note ? " – " + s.note : ""}`, fileName: name });
  } finally { if (temp) wkRestore(); if (prev && prevKey !== key) { /* den tidigare visningen avslutades av exporten */ wkBanner(null); } wkRefreshPlan(); }
  if (!r) { alert("Inga prickar att exportera – kalibrera planen, hämta positioner och tänd objekten på planen."); return; }
  const bytes = new TextEncoder().encode(r.text);
  downloadBlob(new Blob([bytes], { type: "application/x-step" }), name);
  const nC = Object.values(cmts).reduce((a, l) => a + l.length, 0);
  setSaveStatus(`🧊 Veckobild ${wkLabel(key)}: ${r.n} prickar exporterade som IFC${nC ? ` (kommentarer från ${Object.keys(cmts).length} objekt)` : ""}.`);
  const tc = $("cadExportToTc");
  if (!tc || !tc.checked || !window.opener || window.opener.closed) return r;
  try { const res = await askOpener("tcUpload", { folder: DXF_TC_FOLDER, files: [new File([bytes], name, { type: "application/x-step" })] }, 5 * 60 * 1000); setSaveStatus(`🧊 Veckobild ${wkLabel(key)} sparad i Trimble Connect (${res.folder || DXF_TC_FOLDER}).`); } catch (e) { setSaveStatus(`🧊 Nedladdad. ⚠ Kunde inte spara i Trimble Connect: ${e.message}`); }
  return r;
}
function wkRefreshPlan() {
  if (typeof invalidateVisible === "function") invalidateVisible();
  if (typeof onDateChanged === "function") onDateChanged();
  if (typeof renderZones === "function") renderZones();
  wkRender();
}
function wkBanner(s) {
  let b = document.getElementById("wkBanner");
  if (!s) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement("div"); b.id = "wkBanner"; b.style.cssText = "position:fixed;left:50%;top:10px;transform:translateX(-50%);z-index:9000;background:#0f172a;color:#fff;padding:8px 14px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.35);font:600 13px system-ui,sans-serif;display:flex;gap:12px;align-items:center"; document.body.appendChild(b); }
  b.innerHTML = `<span>📸 Veckobild ${escHtml(wkLabel(s.key))} · ${escHtml(s.date || "")} – skrivskyddad</span><button type="button" style="background:#f59e0b;border:0;border-radius:8px;padding:4px 12px;font:inherit;cursor:pointer">Avsluta</button>`;
  b.querySelector("button").onclick = wkEndView;
}

/* ---- Jämför ------------------------------------------------------------------------------------------- */
async function wkCompare(keyA, keyB) {   // keyB = "now" eller en veckonyckel
  let A, B; try { A = await wkRead(keyA); B = keyB === "now" ? { key: "nu", date: todayIso(), rows: wkRows() } : await wkRead(keyB); } catch (e) { alert(e.message); return; }
  const diff = wkDiff(A.rows, B.rows), sa = wkStats(A.rows), sb = wkStats(B.rows), nameOf = new Map(items.map(r => [r.id, wkName(r)]));
  const la = wkLabel(A.key), lb = keyB === "now" ? "nu" : wkLabel(B.key);
  const rowsHtml = diff.changed.slice(0, 400).map(c => `<tr><td>${escHtml(nameOf.get(c.id) || c.id)}</td><td>${WK_LABEL[WK_ST_BACK[c.a[1]]] || ""} ${c.a[2]} %</td><td>${WK_LABEL[WK_ST_BACK[c.b[1]]] || ""} ${c.b[2]} %</td><td style="text-align:right;font-weight:700;color:${c.d >= 0 ? "#16a34a" : "#dc2626"}">${c.d >= 0 ? "+" : ""}${c.d}</td></tr>`).join("");
  const ov = document.createElement("div"); ov.id = "wkCmp"; ov.style.cssText = "position:fixed;inset:0;z-index:9500;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:20px";
  ov.innerHTML = `<div style="background:#fff;border-radius:14px;max-width:780px;width:100%;max-height:88vh;overflow:auto;padding:16px 18px;box-shadow:0 20px 60px rgba(0,0,0,.4);font:13px system-ui,sans-serif">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px"><b style="font-size:16px;flex:1">Jämförelse ${escHtml(la)} → ${escHtml(lb)}</b><button type="button" id="wkCmpCsv">CSV</button><button type="button" id="wkCmpX">Stäng</button></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:10px">
      ${[["Framdrift i snitt", `${sa.avg} → ${sb.avg} %`, sb.avg - sa.avg], ["Klara", `${sa.klar} → ${sb.klar}`, sb.klar - sa.klar], ["Pågår", `${sa.pagar} → ${sb.pagar}`, null], ["Ej påbörjade", `${sa.planerad} → ${sb.planerad}`, null], ["Ändrade objekt", String(diff.changed.length), null], ["Nya objekt", String(diff.added), null]].map(([t, v, d]) => `<div style="border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px"><div style="color:#64748b;font-size:11px">${t}</div><div style="font-weight:800;font-size:15px">${v}</div>${d == null ? "" : `<div style="font-size:11px;color:${d >= 0 ? "#16a34a" : "#dc2626"}">${d >= 0 ? "+" : ""}${Math.round(d * 10) / 10}</div>`}</div>`).join("")}</div>
    <table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;color:#64748b"><th>Objekt</th><th>${escHtml(la)}</th><th>${escHtml(lb)}</th><th style="text-align:right">Δ %</th></tr></thead><tbody>${rowsHtml || '<tr><td colspan="4" style="padding:12px;color:#64748b">Inga skillnader.</td></tr>'}</tbody></table>
    ${diff.changed.length > 400 ? `<div style="color:#64748b;margin-top:6px">Visar 400 av ${diff.changed.length} – hela listan finns i CSV.</div>` : ""}</div>`;
  document.body.appendChild(ov);
  ov.querySelector("#wkCmpX").onclick = () => ov.remove(); ov.addEventListener("pointerdown", e => { if (e.target === ov) ov.remove(); });
  ov.querySelector("#wkCmpCsv").onclick = () => wkDownload(`Jämförelse ${A.key} ${B.key}.csv`, wkCsv([["Objekt", `Status ${la}`, `Framdrift ${la}`, `Status ${lb}`, `Framdrift ${lb}`, "Skillnad"], ...diff.changed.map(c => [nameOf.get(c.id) || c.id, WK_LABEL[WK_ST_BACK[c.a[1]]] || "", c.a[2], WK_LABEL[WK_ST_BACK[c.b[1]]] || "", c.b[2], c.d])]));
}
function wkDiff(a, b) {
  const ma = new Map(a.map(r => [r[0], r])), changed = []; let added = 0;
  b.forEach(r => { const o = ma.get(r[0]); if (!o) { added++; return; } const pa = o[1] === "k" ? 100 : o[2], pb = r[1] === "k" ? 100 : r[2]; if (o[1] !== r[1] || o[2] !== r[2]) changed.push({ id: r[0], a: o, b: r, d: pb - pa }); });
  changed.sort((x, y) => Math.abs(y.d) - Math.abs(x.d) || (x.id < y.id ? -1 : 1));
  return { changed, added };
}

/* ---- CSV, kurva och panelen ---------------------------------------------------------------------------- */
const wkCsv = rows => "﻿" + rows.map(r => r.map(v => { const s = String(v == null ? "" : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(";")).join("\r\n");
function wkDownload(name, text) { const u = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })), a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
const wkSeriesCsv = () => wkCsv([["Vecka", "Datum", "Objekt", "Klara", "Pågår", "Pausade", "Ej påbörjade", "Framdrift i snitt %", "Kommentar", "Sparad av"], ...[...wk.list].reverse().map(m => [m.key, m.date, m.n, m.klar, m.pagar, m.pausad || 0, m.planerad, String(m.avg).replace(".", ","), m.note || "", m.by || ""])]);
function wkSpark(cv) {
  const L = [...wk.list].reverse(); if (!cv || L.length < 2) { if (cv) cv.style.display = "none"; return; }
  cv.style.display = "block"; const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth || 260, h = 64; cv.width = w * dpr; cv.height = h * dpr; const g = cv.getContext("2d"); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
  const xs = i => 8 + (w - 16) * i / (L.length - 1), ys = v => h - 10 - (h - 22) * Math.max(0, Math.min(100, v)) / 100;
  g.strokeStyle = "rgba(100,116,139,.25)"; g.lineWidth = 1; [0, 50, 100].forEach(v => { g.beginPath(); g.moveTo(8, ys(v)); g.lineTo(w - 8, ys(v)); g.stroke(); });
  g.beginPath(); L.forEach((m, i) => i ? g.lineTo(xs(i), ys(m.avg)) : g.moveTo(xs(i), ys(m.avg))); g.strokeStyle = "#2563eb"; g.lineWidth = 2.4; g.lineJoin = "round"; g.stroke();
  g.lineTo(xs(L.length - 1), ys(0)); g.lineTo(xs(0), ys(0)); g.closePath(); g.fillStyle = "rgba(37,99,235,.12)"; g.fill();
  L.forEach((m, i) => { g.beginPath(); g.arc(xs(i), ys(m.avg), 3, 0, 6.2832); g.fillStyle = "#2563eb"; g.fill(); });
  g.fillStyle = "#475569"; g.font = "600 10px system-ui,sans-serif"; g.textAlign = "right"; g.fillText(`${L[L.length - 1].avg} %`, w - 8, ys(L[L.length - 1].avg) - 6);
}
function wkRender() {
  const host = document.getElementById("weeklyPanel"); if (!host) return;
  const date = ($("dateInput") && $("dateInput").value) || todayIso(), key = wkKey(date), has = wk.list.some(x => x.key === key);
  host.innerHTML = `<div class="hint" style="margin:0 0 6px">Spara hela planens status som en bild per vecka – bläddra tillbaka, jämför och följ framdriften. Veckan följer datumet ovan.</div>
    <input type="text" id="wkNote" placeholder="Kommentar (valfri), t.ex. Platta B gjuten" style="width:100%;margin-bottom:6px" ${wk.view ? "disabled" : ""}>
    <button type="button" class="primary block" id="wkSave" ${wk.busy || wk.view ? "disabled" : ""} title="Sparar status, framdrift och verkliga datum för alla objekt">📸 ${wk.busy ? "Sparar…" : `${has ? "Uppdatera" : "Spara"} veckobild ${wkLabel(key)}`}</button>
    <canvas id="wkSpark" style="width:100%;height:64px;margin-top:8px;display:none"></canvas>
    <div id="wkList" style="margin-top:6px">${wk.list.length ? wk.list.map((m, i) => `<div class="wk-r" data-wk="${m.key}" style="border:1px solid rgba(100,116,139,.25);border-radius:10px;padding:6px 8px;margin-top:5px;${wk.view && wk.view.key === m.key ? "background:rgba(245,158,11,.14);border-color:#f59e0b" : ""}">
      <div style="display:flex;gap:6px;align-items:baseline"><b>${escHtml(wkLabel(m.key))}</b><span style="color:#64748b;font-size:11px">${escHtml(m.date || "")}</span><span style="margin-left:auto;font-weight:700">${m.avg} %</span></div>
      <div style="color:#64748b;font-size:11px">${m.klar} klara · ${m.pagar} pågår · ${m.planerad} ej påbörjade${m.by ? " · " + escHtml(m.by) : ""}${m.note ? `<br><i>${escHtml(m.note)}</i>` : ""}</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:5px"><button type="button" data-wk-view="${m.key}" title="Visa planen som den såg ut den veckan (skrivskyddat)">👁 Visa</button>${wk.list[i + 1] ? `<button type="button" data-wk-prev="${m.key}|${wk.list[i + 1].key}" title="Vad har hänt sedan ${escHtml(wkLabel(wk.list[i + 1].key))}">Δ förra</button>` : ""}<button type="button" data-wk-now="${m.key}" title="Vad har hänt sedan den veckan">Δ nu</button><button type="button" data-wk-ifc="${m.key}" title="Veckans prickar som IFC, med status, framdrift och kommentarer">🧊 IFC</button><button type="button" data-wk-del="${m.key}" title="Ta bort" style="margin-left:auto">🗑</button></div></div>`).join("") : `<div class="hint">Inga veckobilder än. Spara den första ovan.</div>`}</div>
    ${wk.list.length ? `<button type="button" class="block" id="wkCsv" style="margin-top:8px" title="Veckokurvan som tabell (öppnas i Excel)">⬇ Framdrift per vecka (CSV)</button>` : ""}`;
  host.querySelector("#wkSave").onclick = wkSave;
  host.querySelectorAll("[data-wk-view]").forEach(b => { b.onclick = () => wk.view && wk.view.key === b.dataset.wkView ? wkEndView() : wkView(b.dataset.wkView); if (wk.view && wk.view.key === b.dataset.wkView) b.textContent = "✕ Avsluta"; });
  host.querySelectorAll("[data-wk-prev]").forEach(b => { b.onclick = () => { const [a, p] = b.dataset.wkPrev.split("|"); wkCompare(p, a); }; });
  host.querySelectorAll("[data-wk-now]").forEach(b => { b.onclick = () => wkCompare(b.dataset.wkNow, "now"); });
  host.querySelectorAll("[data-wk-ifc]").forEach(b => { b.onclick = async () => { b.disabled = true; try { await wkExportIfc(b.dataset.wkIfc); } finally { b.disabled = false; } }; });
  host.querySelectorAll("[data-wk-del]").forEach(b => { b.onclick = () => wkDelete(b.dataset.wkDel); });
  const c = host.querySelector("#wkCsv"); if (c) c.onclick = () => wkDownload("Framdrift per vecka.csv", wkSeriesCsv());
  wkSpark(host.querySelector("#wkSpark"));
}
/* Panelen ritas när projektet är inläst; datumbyte uppdaterar veckonamnet på knappen. */
function wkInit() {
  const t = setInterval(() => { wk.polls++; if (wk.loaded || wk.polls > 80) { clearInterval(t); return; } if (typeof token !== "undefined" && token && typeof projectId !== "undefined" && projectId && typeof items !== "undefined" && items.length) wkLoad(); }, 1500);
  const di = document.getElementById("dateInput"); if (di) di.addEventListener("change", () => setTimeout(wkRender, 0));
  const d = document.querySelector('details.sec[data-sec="weekly"]'); if (d) d.addEventListener("toggle", () => { if (d.open) wkLoad(); });
  wkRender();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wkInit); else wkInit();
