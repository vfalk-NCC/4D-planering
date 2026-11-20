/* Bubblor-panelen (Victor 2026-11-20): allt för info-bubblorna på ett ställe, dockat i högermenyn – brytare, rullgardiner och ikoner.
   Här ändrar man namn, aktivitetstext och framdrift för hand (när tidplanen inte hunnit ändras), lägger till fria bubblor
   (frikopplade från tidplanen) och låser/släpper placeringen. Bubblorna sparas med de sparade vyerna (del "Bubblor"). */

const L3BUB_ICONS = { name: ["Aa", "Namn"], date: ["📅", "Datum"], progress: ["%", "Framdrift"], area: ["📍", "Område"], activity: ["⚙", "Aktivitet"], resource: ["👷", "Resurser"], status: ["●", "Status"], note: ["✎", "Anteckning"] };
function l3bubPanel(focusKey) {
  if (typeof l3bfPanel !== "function") return;
  const esc = escHtml, cfg = l3bubCfg(), p = l3Prefs();
  if (!l3bub.anchors.length) { try { l3bubRebuild(); } catch (e) { /* */ } }
  const rows = l3bub.anchors.slice().sort((a, b) => (b.free ? 1 : 0) - (a.free ? 1 : 0) || String(a.row.object_name || "").localeCompare(String(b.row.object_name || ""), "sv")).slice(0, 80);
  const offN = typeof l3boOffCount === "function" ? l3boOffCount() : 0;
  const rowHtml = a => {
    const o = a.free ? a.row.__free : l3boGet(a.key), L = l3bubLines(a.row, cfg.f, true), st = (l3bub.ovr && l3bub.ovr.get(a.key)) || (o.x !== undefined ? o : null), lk = !!(st && st.lk);
    return `<div class="v3-bp-r${a.key === focusKey ? " f" : ""}${a.free ? " fr" : ""}" data-bpk="${esc(a.key)}">
      <div class="v3-bp-l"><input type="text" data-bpf="name" value="${esc(o.name || L.name || "")}" placeholder="${esc(a.row.object_name || a.row.activity || "Namn")}" title="Namn på bubblan" />
        <input type="number" data-bpf="prog" min="0" max="100" step="5" value="${Number.isFinite(o.prog) ? o.prog : (L.progress !== null ? L.progress : "")}" title="Framdrift i procent" /><span class="u">%</span>
        <button type="button" data-bpa="lock" class="${lk ? "on" : ""}" title="${lk ? "Låst – klicka för att släppa" : "Lås placeringen"}">${lk ? "🔒" : "🔓"}</button>
        <button type="button" data-bpa="off" title="${a.free ? "Ta bort" : "Släck"}">✕</button></div>
      <div class="v3-bp-m"><input type="text" data-bpf="dt" value="${esc(o.dt || "")}" placeholder="${esc(L.date || "Datum, t.ex. 3 dec – 12 dec")}" title="Datumtext" /><input type="text" data-bpf="ac" value="${esc(o.ac || "")}" placeholder="Aktivitetstext" title="Aktivitetstext" /><input type="text" data-bpf="note" value="${esc(o.note || "")}" placeholder="✎ Anteckning" title="Anteckning" />
        ${a.free ? "" : `<button type="button" data-bpa="reset" title="Återgå till tidplanens värden">↺</button>`}</div></div>`;
  };
  const d = l3bfPanel("v3BubPanel", "💬 Bubblor", `
    <div class="v3-bp-top">
      <label class="v3-bp-sw" title="Visa bubblor vid aktiviteternas objekt"><input type="checkbox" id="v3BpOn" ${p.bubOn ? "checked" : ""} /><i></i><span>På</span></label>
      <label class="v3-bp-sw" title="Ledlinje från bubblan till objektet"><input type="checkbox" id="v3BpLine" ${cfg.line ? "checked" : ""} /><i></i><span>Linje</span></label>
      <label class="v3-bp-sw" title="Alla bubblor i samma grå färg"><input type="checkbox" id="v3BpNeu" ${cfg.neutral ? "checked" : ""} /><i></i><span>Grå</span></label>
      <select id="v3BpScope" title="Vilka aktiviteter som får bubbla">${[["auto", "Pågående + markerade"], ["marked", "Bara markerade"], ["active", "Pågående/försenade"], ["all", "Alla"]].map(([v, t]) => `<option value="${v}" ${cfg.scope === v ? "selected" : ""}>${t}</option>`).join("")}</select>
      <select id="v3BpProg" title="Framdriften i bubblorna">${[["calc", "% efter datum"], ["plan", "% från tidplan"]].map(([v, t]) => `<option value="${v}" ${(p.bubProg || "calc") === v ? "selected" : ""}>${t}</option>`).join("")}</select>
      <input type="number" id="v3BpMax" min="1" max="100" value="${cfg.max}" title="Högst antal bubblor" style="width:54px" />
    </div>
    <div class="v3-bp-chips" title="Vad som visas i bubblorna">${L3BUB_FIELDS.map(([k]) => `<button type="button" data-bpc="${k}" class="${cfg.f[k] ? "on" : ""}" title="${L3BUB_ICONS[k][1]}">${L3BUB_ICONS[k][0]}</button>`).join("")}</div>
    <div class="v3-bp-tools">
      <button type="button" id="v3BpAdd" title="Ny fri bubbla – klicka i modellen där den ska sitta">➕ Fri</button>
      <button type="button" id="v3BpLockAll" title="Lås alla synliga bubblor där de sitter nu">🔒 Alla</button>
      <button type="button" id="v3BpFree" title="Släpp alla bubblor till automatisk placering">🔓 Alla</button>
      <button type="button" id="v3BpAuto" title="Ställ om den automatiska placeringen (rör inte låsta)">⟲</button>
      <button type="button" id="v3BpSave" title="Spara kamera + bubblor som en vy">💾 Vy</button>
      <button type="button" id="v3BpWeek" title="Kopiera den senaste vyn till nästa vecka (+7 dagar) med samma kamera och bubblor">📅 +1 v</button>
      ${offN ? `<button type="button" id="v3BpShow" title="Visa de släckta bubblorna igen">👁 ${offN}</button>` : ""}
    </div>
    <div class="v3-bp-list">${rows.length ? rows.map(rowHtml).join("") : `<div class="v3-sub">Inga bubblor i bilden. Slå på ”På” eller välj ”Alla”, eller lägg till en fri bubbla med ➕.</div>`}</div>`, null, "12px");
  if (!d) return;
  if (typeof l3dkToggle === "function") { /* panelen dockas av l3bfPanel-stilen */ }
  const refresh = () => { l3bub.sig = ""; l3bub.autoSig = ""; l3Render(); };
  const q = s => d.querySelector(s);
  q("#v3BpOn").onchange = e => { l3SetPref("bubOn", !!e.target.checked); if (typeof l3RenderLabels === "function") l3RenderLabels(); refresh(); };
  q("#v3BpLine").onchange = e => { l3SetPref("bubLine", !!e.target.checked); refresh(); };
  q("#v3BpNeu").onchange = e => { l3SetPref("bubNeutral", !!e.target.checked); refresh(); };
  q("#v3BpScope").onchange = e => { l3bub.frozen = null; l3SetPref("bubScope", e.target.value); refresh(); l3bubPanel(); };
  q("#v3BpProg").onchange = e => { l3SetPref("bubProg", e.target.value); refresh(); };
  q("#v3BpMax").onchange = e => { l3bub.frozen = null; l3SetPref("bubMax", Math.max(1, Math.min(100, Number(e.target.value) || 15))); refresh(); };
  d.querySelectorAll("[data-bpc]").forEach(b => { b.onclick = () => { l3SetPref("bubFields", { ...(l3Prefs().bubFields || {}), [b.dataset.bpc]: !l3bubCfg().f[b.dataset.bpc] }); b.classList.toggle("on"); refresh(); }; });
  q("#v3BpAdd").onclick = () => l3bubAddFree();
  q("#v3BpLockAll").onclick = () => { const n = l3bubLockAll(true); l3Status(`${n} bubblor låsta där de sitter.`); l3bubPanel(); };
  q("#v3BpFree").onclick = () => { const n = l3bubLockAll(false); l3Status(`${n} bubblor släppta – placeras automatiskt.`); l3bubPanel(); };
  q("#v3BpAuto").onclick = () => { refresh(); l3Status("Bubblorna placerades om (låsta ligger kvar)."); };
  q("#v3BpSave").onclick = () => { if (typeof l3SaveViewAsk === "function") l3SaveViewAsk(); };
  q("#v3BpWeek").onclick = () => l3vNextWeek();
  if (q("#v3BpShow")) q("#v3BpShow").onclick = () => { l3boShowAll(); setTimeout(() => l3bubPanel(), 50); };
  d.querySelectorAll(".v3-bp-r").forEach(row => {
    const key = row.dataset.bpk, a = l3bub.anchors.find(x => x.key === key); if (!a) return;
    row.querySelectorAll("[data-bpf]").forEach(inp => { inp.onchange = () => {
      const f = inp.dataset.bpf, v = inp.value.trim(), patch = {};
      if (f === "prog") patch.prog = v === "" ? null : Math.max(0, Math.min(100, Number(v)));
      else patch[f] = v.slice(0, f === "note" ? 300 : 120);
      l3boSet(key, patch); refresh();
    }; });
    row.querySelectorAll("[data-bpa]").forEach(b => { b.onclick = () => {
      const act = b.dataset.bpa;
      if (act === "lock") l3bubLock(key);
      else if (act === "off") l3boSet(key, a.free ? { off: true, free: true } : { off: true, on: false });
      else if (act === "reset") l3boSet(key, { name: null, prog: null, dt: null, ac: null });
      refresh(); setTimeout(() => l3bubPanel(), 30);
    }; });
  });
  if (focusKey) { const r = d.querySelector(`.v3-bp-r[data-bpk="${CSS.escape(focusKey)}"] input`); if (r) { try { r.focus(); r.select(); } catch (e) { /* */ } } }
  return d;
}
/* Fri bubbla: klicka i modellen (eller på marken) – bubblan får namn och framdrift för hand och hör inte till någon aktivitet. */
function l3bubAddFree() {
  const cv = l3.renderer.domElement; l3Status("Klicka i modellen där den fria bubblan ska sitta (Esc avbryter).");
  cv.style.cursor = "crosshair";
  const off = () => { cv.style.cursor = ""; cv.removeEventListener("pointerdown", dn, true); document.removeEventListener("keydown", kd, true); };
  const kd = e => { if (e.key === "Escape") { off(); l3Status("Avbrutet."); } };
  const dn = e => {
    e.preventDefault(); e.stopPropagation(); off();
    let pt = null; try { const h = l3Ray(e, [l3.scene]); if (h && h[0]) pt = h[0].point.clone(); } catch (x) { /* */ }
    if (!pt) { const r = cv.getBoundingClientRect(), ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), l3.camera); const hit = new THREE.Vector3(); if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -(l3.orbit.target.z)), hit)) { l3Status("Hittade ingen punkt.", true); return; } pt = hit; }
    const key = "f:" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), O = l3.O;
    l3boSet(key, { free: true, name: "Ny bubbla", prog: 0, p: [0, 1, 2].map(i => Math.round((pt.getComponent(i) + O[i]) * 1000) / 1000) });
    l3SetPref("bubOn", true); l3bub.sig = ""; l3Render();
    setTimeout(() => { l3bubRebuild(); l3bubPanel(key); }, 60);
  };
  cv.addEventListener("pointerdown", dn, true); document.addEventListener("keydown", kd, true);
}
/* Sparade vyer: bubblornas lägen, lås och exakt vilka som är med. */
function l3bubViewState() {
  const r = l3.renderer.domElement.getBoundingClientRect(), items = {}, keys = [];
  document.querySelectorAll("#v3Bubbles .v3-bub").forEach(el => { const k = el.dataset.bk, lk = !!(l3bub.ovr.get(k) || l3boGet(k) || {}).lk; keys.push(k); items[k] = [Math.round(parseFloat(el.style.left) / r.width * 1e4) / 1e4, Math.round(parseFloat(el.style.top) / r.height * 1e4) / 1e4, lk ? 1 : 0]; });
  const edits = {}; (l3bo.list || l3boLocal()).forEach(x => { if (!x.free && (x.name || x.dt || x.ac || Number.isFinite(x.prog)) && keys.includes(x.k)) edits[x.k] = { name: x.name, dt: x.dt, ac: x.ac, prog: x.prog }; });
  return { keys, items, edits, on: !!l3Prefs().bubOn };
}
function l3bubViewApply(b) {
  if (!b || typeof b !== "object") return;
  l3bub.ovr = new Map(Object.entries(b.items || {}).map(([k, a]) => [k, { x: a[0], y: a[1], lk: !!a[2] }]));
  l3bub.frozen = Array.isArray(b.keys) ? new Set(b.keys) : null;
  l3bub.autoSig = ""; l3bub.sig = "";
  if (b.on !== undefined) l3SetPref("bubOn", !!b.on);
  if (b.edits) { const ps = Object.entries(b.edits).filter(([k, e]) => { const c = l3boGet(k); return (c.name || "") !== (e.name || "") || (c.dt || "") !== (e.dt || "") || (c.ac || "") !== (e.ac || "") || c.prog !== e.prog; }).map(([k, e]) => [k, { name: e.name || null, dt: e.dt || null, ac: e.ac || null, prog: Number.isFinite(e.prog) ? e.prog : null }]); if (ps.length) l3boSetMany(ps); }
  l3Render();
}

/* Kopierar vyn man senast gick till (eller aktuell kamera) till nästa vecka: samma kamera och bubblor, datum +7 dagar. Bubblornas procent räknas om efter nya datumet. */
function l3vNextWeek() {
  const list = l3SavedViews(), src = list.find(v => v.name === l3.curView);
  if (!src) { l3Status("Gå först till en sparad vy – den kopieras sedan till nästa vecka.", true); return null; }
  const d0 = src.date || $("dateInput").value || todayIso(), t = new Date(d0 + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + 7);
  const nd = t.toISOString().slice(0, 10), base = src.name.replace(/\s*·\s*\d{4}-\d{2}-\d{2}$/, ""), v = JSON.parse(JSON.stringify(src));
  v.name = `${base} · ${nd}`; v.date = nd; v.at = new Date().toISOString(); delete v.upd;
  const i = list.findIndex(x => x.name === v.name); if (i >= 0) list[i] = v; else list.push(v);
  l3StoreViews(list.slice(-60), { upsert: v }); l3RenderSavedViews(); l3Status(`Vyn "${v.name}" skapad – öppna den och uppdatera bubblorna vid behov.`);
  return v;
}
