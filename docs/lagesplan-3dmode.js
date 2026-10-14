/* 3D-vyn – Ganttens 3D-lägen, tidslinje, dragstreck, pulsering och "Markera pågående".
   Victor 2026-10-13: "Dom ska vara exakt lika så för över allt" – samma val, texter, färger och regler som i
   4D-dashboardens Gantt (där de styr Trimble Connects modell):
   – 3D: Alla / Kopplade (bara det som är kopplat) / Okopplade (dölj kopplade) / ⏱ Tid (läget ett visst datum).
   – Tid: spelare, reglage, Från/Till/Auto, färger (pågående, försenad, klart, kommande), Klart-opacitet, Kommande,
     Pulsera pågående (färger/hastighet/stil/styrka), Markera pågående, och ett dragstreck över Gantten.
   – Regler per datum som i dashboarden: klar efter slut, kommande före start (dolt om inte "Kommande"), pågående kräver
     minst 1 % framdrift annars försenad, Temporär syns bara mellan start och slut, Rivning syns före start men
     försvinner efter slut, och "Egen färg efter slut" (färg + opacitet) för klara.
   Inget av detta sparas i tidplanen – det är bara hur 3D-vyn ritas. Valen (utom själva läget) sparas i webbläsaren. */

const L3GM_PRESETS = { gul: ["", "#fff7c2", "Gul (standard)"], rod: ["#e5484d", "#ffd6d6", "Röd ↔ ljusröd"], vit: ["#111827", "#ffffff", "Mörk ↔ vit"], bla: ["#2563eb", "#bfdbfe", "Blå ↔ ljusblå"], gron: ["#16a34a", "#bbf7d0", "Grön ↔ ljusgrön"], orange: ["#f5a623", "#e5484d", "Orange ↔ röd"] };
const L3GM_PCFG0 = { preset: "gul", a: "", b: "#fff7c2", period: 1.5, style: "mjuk", amp: 85 };
const l3gm = { mode: "off", timer: null, pulseIv: null, pulseT0: 0, act: [], next: [], sig: "", selSig: "", selOwn: false, info: "", raf: 0 };
const l3gmCfg = () => ({ future: false, doneOp: 30, ops: {}, from: "", to: "", pulse: false, selAct: false, ...(l3plPrefs().gm || {}), pcfg: { ...L3GM_PCFG0, ...((l3plPrefs().gm || {}).pcfg || {}) } });
const l3gmSet = (k, v) => l3plSet("gm", { ...(l3plPrefs().gm || {}), [k]: v });
const l3gmHex = h => { const n = parseInt(String(h).replace("#", ""), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };

/* Läget för en rad vid ett datum – samma regler som dashboardens ganttPhaseAt. */
function l3gmPhaseRow(m, d) {
  const prog = Number(m.progress) || 0, end = m.end_date ? String(m.end_date).slice(0, 10) : "", start = m.start_date ? String(m.start_date).slice(0, 10) : "";
  const ae = m.actual_end_date ? String(m.actual_end_date).slice(0, 10) : "", as = m.actual_start_date ? String(m.actual_start_date).slice(0, 10) : "";
  const done = !!ae || prog >= 100 || m.status === "klar";
  if (done && (ae || end) && (ae || end) < d) return "klar";
  // Påbörjad som i computeItemPhase: framdrift minst 1 % = igång från verklig start (annars planerad start, eller i dag om starten ligger framåt).
  // Ett datum före det är "planerad", även om aktiviteten har framdrift nu (objekt ska inte synas före tidslinjen nått dem).
  const today = todayIso();
  let aStart = null; if (prog >= 1) aStart = as && as <= today ? as : (start && start < today ? start : today);
  const started = !!aStart && aStart <= d;
  if (start && start > d && !started) return "planerad";
  if (end && end < d) return done ? "klar" : "forsenad";
  return started ? "pagaende" : "forsenad";
}
/* En rads läge i Tid-läget, inkl. Temporär/Rivning: "dold" = syns inte alls vid datumet. */
function l3gmRowPhase(m, d, future) {
  let ph = l3gmPhaseRow(m, d);
  const tEnd = (m.actual_end_date ? String(m.actual_end_date).slice(0, 10) : "") || (m.end_date ? String(m.end_date).slice(0, 10) : ""), start = m.start_date ? String(m.start_date).slice(0, 10) : "";
  if (m.temporary === true && ((start && start > d) || (tEnd && tEnd < d))) return "dold";
  if (m.demolition === true) { if (tEnd && tEnd < d) return "dold"; if (ph === "planerad") return "planerad"; } // rivning före start: syns alltid
  else if (ph === "planerad" && !future) return "dold";
  return ph;
}
/* Samlad fas för ett objekt med flera rader (som zonePhase i 2D). */
function l3gmGroup(phases) {
  if (phases.includes("forsenad")) return "forsenad";
  if (phases.every(p => p === "klar")) return "klar";
  if (phases.some(p => p === "pagaende" || p === "klar")) return "pagaende";
  return "planerad";
}
/* Anropas av l3bRecolor för varje objekt: null = som vanligt (läget Alla), annars { off, rgb, alpha, phase }. */
function l3gmRange(rows, at, ctx) {
  const m = l3gm.mode;
  if (m === "off") return null;
  if (m === "isolate") return { off: !rows.length };
  if (m === "hide") return { off: rows.length > 0 };
  if (!rows.length) return { off: true };
  // Följa tidplan: bara aktiviteterna som filtren släpper igenom visas (och då kronologiskt, som i Tid).
  if (m === "time" && l3gm.follow && !rows.some(r => l3gm.follow.has(r.id))) return { off: true };
  const C = l3gmCfg(), ph = rows.map(r => l3gmRowPhase(r, at, C.future)).filter(p => p !== "dold");
  if (!ph.length) return { off: true };
  if (rows.every(r => r.temporary === true)) return { off: false, rgb: null, alpha: null, phase: "temp" }; // temporär mellan start och slut: modellens originalfärg, ingen status/puls
  const g = l3gmGroup(ph);
  if (g === "klar") {
    const dr = rows.find(r => /^#[0-9a-f]{6}$/i.test(String(r.done_color || "")) || (r.done_opacity != null && r.done_opacity !== "" && Number.isFinite(Number(r.done_opacity))));
    const col = dr && /^#[0-9a-f]{6}$/i.test(String(dr.done_color || "")) ? dr.done_color : phaseColor("klar");
    const op = dr && dr.done_opacity != null && dr.done_opacity !== "" && Number.isFinite(Number(dr.done_opacity)) ? Math.max(0, Math.min(100, Number(dr.done_opacity))) : C.doneOp;
    if (op <= 0) return { off: true };
    return { off: false, rgb: l3gmHex(col).map(v => v / 255), alpha: op >= 100 ? null : op / 100, phase: g };
  }
  if (g === "pagaende" && ctx) l3gm.next.push(ctx);
  const op = (C.ops || {})[g] === undefined ? 100 : Number((C.ops || {})[g]); // opacitet per status (0 = osynligt) – som i dashboarden
  if (op <= 0) return { off: true };
  return { off: false, rgb: l3gmHex(phaseColor(g)).map(v => v / 255), alpha: op >= 100 ? null : op / 100, phase: g };
}
/* l3bRecolor: före och efter varvet över alla objekt. */
function l3gmBegin() {
  l3gm.next = [];
  l3gm.follow = null; // Följa tidplan + filter: raderna som filtren släpper igenom
  try { const P = l3gaP(); if (P.follow && l3gm.mode === "time" && Object.values(P.lf || {}).some(Boolean)) l3gm.follow = new Set(l3gaListFilter(l3plLinkActs(P.split), P.lf).flatMap(a => a.rows.map(r => r.id))); } catch (e) { l3gm.follow = null; }
}
function l3gmEnd() {
  l3gm.act = l3gm.next; l3gm.next = [];
  l3gmPulseSync(); l3gmSelSync();
  const el = document.getElementById("v3GmInfo"); if (el) el.textContent = l3gm.mode === "time" ? l3gmInfoText() : "";
}
function l3gmInfoText() { return l3gm.act.length ? `${l3gm.act.length} pågående i 3D` : ""; }
/* Uppdaterar 3D med det nya läget/datumet (en gång per bild, så att dragning och uppspelning inte köar). */
function l3gmApply(now) {
  const run = () => { l3gm.raf = 0; if (typeof l3bRecolor === "function") l3bRecolor(); if (typeof l3Render === "function") l3Render(); };
  if (now) { if (l3gm.raf) cancelAnimationFrame(l3gm.raf); run(); return; }
  if (!l3gm.raf) l3gm.raf = requestAnimationFrame(run);
}

/* ---- Läge ----------------------------------------------------------------------------------------- */
function l3gmSetMode(mode, quiet) {
  if (mode === l3gm.mode && mode !== "off") return;
  const prev = l3gm.mode;
  l3gmStopPlay(); l3gmPulseStop();
  l3gm.mode = mode;
  if (mode === "time") {
    const r = l3gmRange2(), t = l3plIso(new Date(Date.now() - new Date().getTimezoneOffset() * 60000));
    if (r) l3plSetDay(t >= r[0] && t <= r[1] ? t : r[0]);
  }
  l3gmApply(true);
  l3plDockRender();
  if (!quiet) l3Status(mode === "off" ? (prev !== "off" ? "Hela modellen visas igen." : "") : mode === "isolate" ? "Bara det som är kopplat till schemat visas." : mode === "hide" ? "Det kopplade är dolt – bara det okopplade visas." : "Tidslinjen: dra strecket i Gantten för att se läget ett visst datum.");
}
/* Datumspannet för tidslinjen: tidigaste start till senaste slut, eller egna gränser (Från/Till). */
function l3gmRange2() {
  const rows = (l3pl.rows || []).filter(r => r.start_date && r.end_date); if (!rows.length) return null;
  const C = l3gmCfg();
  let a = rows.map(r => r.start_date.slice(0, 10)).sort()[0], b = rows.map(r => ((r.actual_end_date && r.actual_end_date > r.end_date ? r.actual_end_date : r.end_date) || "").slice(0, 10)).sort().pop();
  if (C.from && C.from <= b) a = C.from;
  if (C.to && C.to >= a) b = C.to;
  return [a, b];
}
function l3gmCounts(acts, at) {
  const c = { done: 0, going: 0, late: 0, soon: 0 };
  acts.forEach(a => { const ph = l3gmGroup(a.rows.map(r => l3gmPhaseRow(r, at))); if (ph === "klar") c.done++; else if (ph === "pagaende") c.going++; else if (ph === "forsenad") c.late++; else c.soon++; });
  return c;
}

/* ---- Spelaren ------------------------------------------------------------------------------------- */
function l3gmStopPlay() { clearTimeout(l3gm.timer); l3gm.timer = null; const b = document.getElementById("v3GmPlay"); if (b) b.textContent = "▶"; }
function l3gmPlay() {
  if (l3gm.timer) { l3gmStopPlay(); return; }
  const r = l3gmRange2(); if (!r) return;
  let d = l3plDay(); if (d >= r[1] || d < r[0]) d = r[0];
  const b = document.getElementById("v3GmPlay"); if (b) b.textContent = "⏸";
  l3plSetDay(d); l3gmApply(true); l3gmSync();
  const tick = () => {
    if (!l3gm.timer) return;
    const rr = l3gmRange2(), cur = l3plDay();
    if (!rr || cur >= rr[1]) { l3gmStopPlay(); l3plDockRender(); return; }
    l3plSetDay(l3gaAdd(cur, 1)); l3gmApply(true); l3gmSync();
    l3gm.timer = setTimeout(tick, 180);
  };
  l3gm.timer = setTimeout(tick, 180);
}
/* Reglaget, datumet, strecket och sammanfattningen följer datumet utan att Gantten ritas om. */
function l3gmSync() {
  const r = l3gmRange2(), at = l3plDay(); if (!r) return;
  const sl = document.getElementById("v3GmSlider"), di = document.getElementById("v3GmDate");
  if (sl) { sl.max = Math.max(1, l3gaDays(r[0], r[1])); sl.value = Math.min(Math.max(0, l3gaDays(r[0], at)), Number(sl.max)); }
  if (di && document.activeElement !== di) di.value = at;
  const sum = document.getElementById("v3GmSum");
  if (sum) { const c = l3gmCounts(l3gmShown(), at); sum.textContent = `${c.done} klara · ${c.going} pågår · ${c.late} försenade · ${c.soon} kvar`; }
  l3gmPlaceScrub();
  if (typeof l3fsPlayhead === "function" && typeof l3fs !== "undefined") { try { l3fs.t = l3plDate(at).getTime(); l3fsPlayhead(l3fs.t); } catch (e) { /* tidslinjen ritas om vid behov */ } }
}
function l3gmShown() { const P = l3gaP(); return l3plActs(P.split); }
function l3gmSetDay(d, opts = {}) {
  if (!d) return;
  const r = l3gmRange2(); if (r) d = d < r[0] ? r[0] : d > r[1] ? r[1] : d;
  if (d !== l3plDay()) { l3plSetDay(d); l3gmApply(!!opts.now); }
  l3gmSync();
}

/* ---- Pulsering -------------------------------------------------------------------------------------- */
function l3gmPulseK(ph, st) {
  if (st === "blink") return ph < 0.5 ? 1 : 0;
  if (st === "slag") { const g = (c, w) => Math.exp(-Math.pow((ph - c) / w, 2)); return Math.min(1, g(0.12, 0.06) + 0.75 * g(0.32, 0.06)); }
  return (1 - Math.cos(ph * 2 * Math.PI)) / 2;
}
function l3gmPulseStop() { clearInterval(l3gm.pulseIv); l3gm.pulseIv = null; }
function l3gmPulseSync() {
  const C = l3gmCfg(), want = C.pulse && l3gm.mode === "time" && l3gm.act.length;
  if (!want) { l3gmPulseStop(); return; }
  if (l3gm.pulseIv) return;
  l3gm.pulseT0 = performance.now();
  l3gm.pulseIv = setInterval(() => {
    const cf = l3gmCfg().pcfg, act = l3gm.act;
    if (!act.length || l3gm.mode !== "time") { l3gmPulseStop(); return; }
    const per = Math.max(0.3, Number(cf.period) || 1.5) * 1000, ph = ((performance.now() - l3gm.pulseT0) % per) / per;
    const k = l3gmPulseK(ph, cf.style) * (Math.max(0, Math.min(100, Number(cf.amp))) / 100);
    const A = l3gmHex(cf.a || phaseColor("pagaende")), B = l3gmHex(cf.b || "#fff7c2"), c = A.map((v, i) => (v + (B[i] - v) * k) / 255);
    const dirty = new Set();
    act.forEach(({ mesh, ri }) => {
      const u = mesh.userData.l3b, r = u && u.ranges[ri], col = mesh.geometry.getAttribute("color"); if (!r || !col) return;
      const d = col.array, K = d instanceof Uint8Array ? 255 : 1, c0 = c[0] * K, c1 = c[1] * K, c2 = c[2] * K;
      for (let i = r.start; i < r.start + r.count; i++) { d[i * 3] = c0; d[i * 3 + 1] = c1; d[i * 3 + 2] = c2; }
      dirty.add(col);
    });
    dirty.forEach(col => { col.needsUpdate = true; });
    if (typeof l3Render === "function") l3Render();
  }, Math.max(60, Math.min(160, (Math.max(0.3, Number(l3gmCfg().pcfg.period) || 1.5) * 1000) / 12)));
}
function l3gmPulseCfgOpen(anchor) {
  const old = document.getElementById("v3GmPulsePop"); if (old) { old.remove(); return; }
  const c = l3gmCfg().pcfg, pop = document.createElement("div"); pop.id = "v3GmPulsePop"; pop.className = "v3-gm-pop";
  pop.innerHTML = `<div class="v3-gm-pop-t">Pulsera pågående</div>
    <label>Färger <select class="pp-preset">${Object.entries(L3GM_PRESETS).map(([k, v]) => `<option value="${k}"${c.preset === k ? " selected" : ""}>${v[2]}</option>`).join("")}<option value="egen"${c.preset === "egen" ? " selected" : ""}>Egna färger</option></select></label>
    <div class="pp-cols"><label>Från <input type="color" class="pp-a" value="${c.a || phaseColor("pagaende")}" /></label><label>Till <input type="color" class="pp-b" value="${c.b}" /></label></div>
    <label>Hastighet <span><input type="range" class="pp-per" min="0.4" max="4" step="0.1" value="${c.period}" /> <b class="pp-perv">${c.period}</b> s</span></label>
    <label>Stil <select class="pp-style"><option value="mjuk"${c.style === "mjuk" ? " selected" : ""}>Mjuk andning</option><option value="blink"${c.style === "blink" ? " selected" : ""}>Blink</option><option value="slag"${c.style === "slag" ? " selected" : ""}>Hjärtslag</option></select></label>
    <label>Styrka <span><input type="range" class="pp-amp" min="10" max="100" step="5" value="${c.amp}" /> <b class="pp-ampv">${c.amp}</b> %</span></label>
    <div class="v3-gm-pop-a"><button type="button" class="pp-reset">Återställ</button><button type="button" class="pp-close primary">Klar</button></div>`;
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect(); pop.style.left = `${Math.max(8, Math.min(window.innerWidth - 280, r.left))}px`; pop.style.bottom = `${Math.max(8, window.innerHeight - r.top + 6)}px`;
  ["pointerdown", "click", "keydown", "wheel"].forEach(t => pop.addEventListener(t, e => e.stopPropagation()));
  const q = s => pop.querySelector(s), put = p => l3gmSet("pcfg", { ...l3gmCfg().pcfg, ...p });
  const restart = () => { if (l3gm.pulseIv) { l3gmPulseStop(); l3gmPulseSync(); } };
  q(".pp-preset").onchange = e => { const v = e.target.value, p = { preset: v }; if (L3GM_PRESETS[v]) { p.a = L3GM_PRESETS[v][0]; p.b = L3GM_PRESETS[v][1]; q(".pp-a").value = p.a || phaseColor("pagaende"); q(".pp-b").value = p.b; } put(p); restart(); };
  q(".pp-a").oninput = e => { put({ a: e.target.value, preset: "egen" }); q(".pp-preset").value = "egen"; };
  q(".pp-b").oninput = e => { put({ b: e.target.value, preset: "egen" }); q(".pp-preset").value = "egen"; };
  q(".pp-per").oninput = e => { put({ period: Number(e.target.value) }); q(".pp-perv").textContent = e.target.value; restart(); };
  q(".pp-style").onchange = e => put({ style: e.target.value });
  q(".pp-amp").oninput = e => { put({ amp: Number(e.target.value) }); q(".pp-ampv").textContent = e.target.value; };
  q(".pp-reset").onclick = () => { l3gmSet("pcfg", { ...L3GM_PCFG0 }); pop.remove(); restart(); l3gmPulseCfgOpen(anchor); };
  q(".pp-close").onclick = () => pop.remove();
}

/* ---- Markera pågående ------------------------------------------------------------------------------- */
function l3gmSelSync() {
  const C = l3gmCfg();
  if (!C.selAct || l3gm.mode !== "time") {
    if (l3gm.selOwn) { l3gm.selOwn = false; l3gm.selSig = ""; if (typeof l3bsClear === "function") l3bsClear(); }
    return;
  }
  const ents = l3gm.act.map(({ mesh, ri }) => ({ mesh, ri })), sig = ents.map(e => (e.mesh.id || 0) + ":" + e.ri).sort().join(",");
  if (sig === l3gm.selSig) return;
  l3gm.selSig = sig; l3gm.selOwn = true;
  if (typeof l3bsSet === "function") l3bsSet(ents);
}

/* ---- Raderna i Ganttens huvud -------------------------------------------------------------------- */
const L3GM_REFRESH = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="v3-gm-spin"><path d="M20 11a8 8 0 0 0-14.3-4.6L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.6L20 16"/><path d="M20 21v-5h-5"/></svg>`;
function l3gmBarHtml(acts) {
  const m = l3gm.mode, E = escHtml, C = l3gmCfg(), r = l3gmRange2(), at = l3plDay();
  const seg = `<div class="v3-segs" id="v3GmSeg" role="group" aria-label="3D"><span class="v3-ga-lbl">3D</span>${[["off", "Alla", "Rör inte modellen"], ["isolate", "Kopplade", "Bara det som är kopplat till schemat"], ["hide", "Okopplade", "Dölj kopplade – visa bara det okopplade"], ["time", "⏱ Tid", "Tidslinje: se läget ett visst datum"]].map(([v, t, ti]) => `<button type="button" data-gmode="${v}" class="${m === v ? "on" : ""}" aria-pressed="${m === v}" title="${ti}">${t}</button>`).join("")}</div>`;
  const tools = `<button type="button" id="v3GaRefresh" class="v3-gm-refresh" title="Läs om tidplanen från 4D-planeringen">${L3GM_REFRESH}<span>Uppdatera</span></button>
    <button type="button" id="v3GaLoadModels" title="Läs in alla modeller som aktiviteterna är kopplade till">Läs in modeller</button>
    <button type="button" id="v3GaPpExport" title="Exportera aktiviteterna till en Powerproject-fil (MS Project XML) – bygger på en mall från Powerproject">Exportera till Powerproject</button>`;
  let time = "";
  if (m === "time") {
    time = `<div class="v3-pldock-bar v3-gm-time" id="v3GmTime">
      <button type="button" id="v3GmPlay" title="Spela upp">${l3gm.timer ? "⏸" : "▶"}</button>
      <button type="button" id="v3GmPrev" class="v3-gm-step" title="Backa en dag" aria-label="Backa en dag">‹</button>
      <input type="range" id="v3GmSlider" class="v3-gm-slider" min="0" max="${r ? Math.max(1, l3gaDays(r[0], r[1])) : 1}" value="${r ? Math.min(Math.max(0, l3gaDays(r[0], at)), Math.max(1, l3gaDays(r[0], r[1]))) : 0}" aria-label="Datum" />
      <button type="button" id="v3GmNext" class="v3-gm-step" title="Fram en dag" aria-label="Fram en dag">›</button>
      <input type="date" id="v3GmDate" value="${E(at)}" aria-label="Datum" />
      <button type="button" id="v3GmToday" title="Till idag">Idag</button>
      <label class="v3-ga-tg" title="Tidslinjens start">Från <input type="date" id="v3GmFrom" value="${E(C.from || (r ? r[0] : ""))}" /></label>
      <label class="v3-ga-tg" title="Tidslinjens slut">Till <input type="date" id="v3GmTo" value="${E(C.to || (r ? r[1] : ""))}" /></label>
      <button type="button" id="v3GmAuto" title="Hela spannet">Auto</button>
      <button type="button" id="v3GmMenuBtn" aria-haspopup="true" title="Färger, opacitet, Kommande, Pulsera och Markera pågående">Färger &amp; visning ▾</button>
      <span id="v3GmSum" class="v3-gm-sum"></span><span id="v3GmInfo" class="v3-gm-sum">${E(l3gmInfoText())}</span>
    </div>`;
  }
  return `<div class="v3-pldock-bar v3-gm-row">${seg}${tools}</div>${time}`;
}
function l3gmBind(d) {
  const q = s => d.querySelector(s);
  d.querySelectorAll("#v3GmSeg [data-gmode]").forEach(b => { b.onclick = () => l3gmSetMode(b.dataset.gmode); });
  const rf = q("#v3GaRefresh"); if (rf) rf.onclick = () => l3gmRefresh(rf);
  const lm = q("#v3GaLoadModels"); if (lm) lm.onclick = () => (typeof l3gmLoadModels === "function" ? l3gmLoadModels(lm) : null);
  const px = q("#v3GaPpExport"); if (px) px.onclick = () => (typeof l3gaPpExport === "function" ? l3gaPpExport() : l3Status("Exporten är inte tillgänglig.", true));
  if (l3gm.mode !== "time") return;
  const sl = q("#v3GmSlider"), di = q("#v3GmDate");
  sl.oninput = () => { const r = l3gmRange2(); if (r) l3gmSetDay(l3gaAdd(r[0], Number(sl.value))); };
  di.onchange = () => { if (di.value) l3gmSetDay(di.value, { now: true }); };
  q("#v3GmToday").onclick = () => l3gmSetDay(todayIso(), { now: true });
  q("#v3GmPlay").onclick = l3gmPlay;
  const step = n => { const r = l3gmRange2(); if (!r) return; l3gmStopPlay(); l3gmSetDay(l3gaAdd(l3plDay(), n), { now: true }); };
  q("#v3GmPrev").onclick = () => step(-1); q("#v3GmNext").onclick = () => step(1);
  const fi = q("#v3GmFrom"), ti = q("#v3GmTo");
  const ranged = () => { const r = l3gmRange2(); if (r) { const cur = l3plDay(); if (cur < r[0] || cur > r[1]) l3gmSetDay(cur < r[0] ? r[0] : r[1], { now: true }); } l3plDockRender(); };
  fi.onchange = () => { l3gmSet("from", fi.value || ""); ranged(); };
  ti.onchange = () => { l3gmSet("to", ti.value || ""); ranged(); };
  q("#v3GmAuto").onclick = () => { l3gmSet("from", ""); l3gmSet("to", ""); ranged(); };
  const mb = q("#v3GmMenuBtn"); if (mb) mb.onclick = e => { e.stopPropagation(); l3gmMenuOpen(mb); };
  l3gmSync();
}
/* Uppdatera: läser om tidplanen (snurrar medan det pågår). */
async function l3gmRefresh(btn) {
  if (btn) { if (btn.classList.contains("busy")) return; btn.classList.add("busy"); }
  try {
    l3pl.rows = null; l3pl.xrows = null;
    await l3plLoad(true);
    if (typeof planSource !== "undefined" && planSource === "pp") { try { const fr = await ghReadJSON(token, dataPath("plan_items.json"), { fresh: true }); if (Array.isArray(fr)) items = fr; } catch (e) { /* planeringen i lägesplanen läses nästa gång */ } }
    l3gmApply(true);
    l3Status("Tidplanen är omläst från 4D-planeringen.");
  } catch (e) { l3Status("Kunde inte läsa om tidplanen: " + e.message, true); }
  finally { const b = document.getElementById("v3GaRefresh"); if (b) b.classList.remove("busy"); }
}

/* ---- Dragstrecket över Gantten ------------------------------------------------------------------------ */
function l3gmScrubGeom() {
  const b = document.querySelector("#v3PlanDock .v3-pl-board"); if (!b) return null;
  const head = parseFloat(getComputedStyle(b).getPropertyValue("--head")) || 170;
  return { board: b, head, dayPx: Number(b.dataset.daypx) || 20, w0: b.dataset.w0 };
}
function l3gmAddScrub() {
  const old = document.querySelector("#v3PlanDock .v3-gscrub"); if (old) old.remove();
  if (l3gm.mode !== "time") return;
  const g = l3gmScrubGeom(); if (!g) return;
  g.board.insertAdjacentHTML("beforeend", `<div class="v3-gscrub" role="slider" aria-label="Valt datum – dra i strecket"><span class="v3-gscrub-h" title="Dra för att se läget ett visst datum"><span class="gs-grip" aria-hidden="true"></span><b class="v3-gscrub-d"></b><span class="gs-grip" aria-hidden="true"></span></span><span class="v3-gscrub-l"></span></div>`);
  const sc = g.board.querySelector(".v3-gscrub"); let drag = false;
  const dateAt = x => { const gg = l3gmScrubGeom(), r = gg.board.getBoundingClientRect(); return l3gaAdd(gg.w0, Math.max(0, Math.round((x - r.left - gg.head) / gg.dayPx - 0.5))); };
  sc.onpointerdown = e => { if (e.button !== undefined && e.button !== 0) return; e.preventDefault(); e.stopPropagation(); drag = true; sc.classList.add("drag"); try { sc.setPointerCapture(e.pointerId); } catch (x) { /* */ } l3gmStopPlay(); };
  sc.onpointermove = e => {
    if (!drag) return;
    const scr = gScroll(), cr = scr.getBoundingClientRect();
    if (e.clientX > cr.right - 40) scr.scrollLeft += 14; else if (e.clientX < cr.left + g.head + 30) scr.scrollLeft -= 14;
    l3gmSetDay(dateAt(e.clientX));
  };
  const end = e => { if (!drag) return; drag = false; sc.classList.remove("drag"); try { sc.releasePointerCapture(e.pointerId); } catch (x) { /* */ } l3gmApply(true); l3plDockRender(); };
  sc.onpointerup = end; sc.onpointercancel = end;
  function gScroll() { return document.querySelector("#v3PlanDock .v3-pl-scroll") || g.board; }
  l3gmPlaceScrub();
}
function l3gmPlaceScrub() {
  const sc = document.querySelector("#v3PlanDock .v3-gscrub"), g = l3gmScrubGeom(); if (!sc || !g) return;
  const day = l3gaDays(g.w0, l3plDay());
  sc.style.left = `${g.head + (day + 0.5) * g.dayPx}px`;
  sc.style.display = day < 0 ? "none" : "";
  const d = sc.querySelector(".v3-gscrub-d"); if (d) d.textContent = l3gaWd(l3plDay());
}

/* ---- Läs in modeller ---------------------------------------------------------------------------------- */
/* "Läs in modeller" (som i dashboardens Gantt): läser in alla modeller som aktiviteterna är kopplade till och som inte redan
   visas i 3D-vyn. Listan över modeller kommer från Trimble Connect via 4D-planering (de som är tända där). */
async function l3gmLoadModels(btn) {
  const ids = [...new Set([...(l3pl.rows || []), ...(Array.isArray(items) ? items : [])].map(r => r.model_id).filter(Boolean))];
  if (!ids.length) { l3Status("Inget är kopplat till en modell.", true); return; }
  if (typeof bridgeOk === "function" && !bridgeOk()) { uiAlert("Modellerna hämtas via 4D-planering i Trimble Connect. Öppna lägesplanen med kartknappen i 4D-planering (på datorn) och försök igen."); return; }
  const old = btn ? btn.textContent : ""; if (btn) { btn.disabled = true; btn.textContent = "Läser in…"; }
  try {
    const list = (await askOpener("ifcModelsList", {}, 20000)).models || [];
    const have = new Set(l3b.models.map(m => m.id));
    const byId = new Map(list.map(m => [m.id, m]));
    const todo = [], already = ids.filter(id => have.has(id)).length;
    let missing = 0;
    ids.forEach(id => { if (have.has(id)) return; const m = byId.get(id); if (m) todo.push({ id: m.id, name: m.name, version: m.version || "" }); else missing++; });
    if (todo.length) { await l3bLoad(todo); if (typeof l3RenderLegend === "function") l3RenderLegend(); if (typeof l3Render === "function") l3Render(); }
    l3Status(`${todo.length} inlästa${already ? `, ${already} fanns` : ""}${missing ? `, ${missing} hittades inte (tänd dem i Trimble Connect)` : ""}`, !!missing && !todo.length);
    if (todo.length && l3gm.mode !== "off") l3gmApply(true); // nya modeller → räkna om läget
  } catch (e) { uiAlert(`Kunde inte läsa in modellerna: ${e.message}`); }
  finally { if (btn) { btn.disabled = false; btn.textContent = old; } }
}

/* Färger & visning i en rullgardin (som i dashboarden): färg och opacitet per status, Klart, Kommande, Pulsera pågående och Markera pågående. */
function l3gmMenuOpen(anchor) {
  const old = document.getElementById("v3GmMenu"); if (old) { old.remove(); return; }
  const C = l3gmCfg(), E = escHtml, ops = C.ops || {}, op = k => (ops[k] === undefined ? 100 : ops[k]);
  const pop = document.createElement("div"); pop.id = "v3GmMenu"; pop.className = "v3-gm-pop v3-gm-menu";
  const row = (k, t, title) => `<span>${t}</span><input type="color" data-tcol="${k}" title="${E(title)}" aria-label="${E(title)}" value="${E(phaseColor(k))}" />${k === "klar" ? `<span class="v3-gm-doneop"><input type="range" id="v3GmDoneOp" min="0" max="100" step="5" value="${C.doneOp}" aria-label="Opacitet klart" /> <b id="v3GmDoneOpVal">${C.doneOp}</b>%</span>` : `<input type="range" data-topc="${k}" min="0" max="100" step="5" value="${op(k)}" aria-label="Opacitet ${E(t)}" />`}`;
  pop.innerHTML = `<div class="v3-gm-pop-t">Färger och opacitet</div>
    <div class="v3-gm-grid"><span></span><span class="v3-gm-gh">Färg</span><span class="v3-gm-gh">Opacitet (0 = osynligt)</span>
      ${row("pagaende", "Pågående", "Färg: pågående")}${row("forsenad", "Försenad", "Färg: försenad (har börjat men mindre än 1 % framdrift)")}${row("klar", "Klart", "Färg: klart")}${row("planerad", "Kommande", "Färg: kommande")}</div>
    <div class="v3-gm-pop-t">Visning</div>
    <label class="v3-ga-tg" title="Visa det som inte startat, i kommande-färgen"><input type="checkbox" id="v3GmFuture" ${C.future ? "checked" : ""} /> Kommande</label>
    <label class="v3-ga-tg" title="Pågående objekt pulserar (ljust gult) i 3D – så ser du direkt vad som händer nu"><input type="checkbox" id="v3GmPulse" ${C.pulse ? "checked" : ""} /> Pulsera pågående <button type="button" id="v3GmPulseCfg" title="Färger, hastighet, stil och styrka för pulsen">▾</button></label>
    <label class="v3-ga-tg" title="Markera de pågående objekten i 3D – de lyses upp. Ett klick i modellen byter markering."><input type="checkbox" id="v3GmSelAct" ${C.selAct ? "checked" : ""} /> Markera pågående</label>`;
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect(); pop.style.left = `${Math.max(8, Math.min(window.innerWidth - 340, r.left))}px`; pop.style.bottom = `${Math.max(8, window.innerHeight - r.top + 6)}px`; pop.style.width = "330px";
  ["pointerdown", "click", "keydown", "wheel"].forEach(t => pop.addEventListener(t, e => { e.stopPropagation(); if (t === "keydown" && e.key === "Escape") pop.remove(); }));
  const off = e => { if (pop.contains(e.target) || anchor.contains(e.target) || e.target.closest("#v3GmPulsePop")) return; pop.remove(); window.removeEventListener("pointerdown", off, true); };
  setTimeout(() => window.addEventListener("pointerdown", off, true), 0);
  const q = s => pop.querySelector(s);
  pop.querySelectorAll("[data-tcol]").forEach(inp => {
    inp.oninput = () => {
      settings.statusColors = { ...(settings.statusColors || {}), [inp.dataset.tcol]: inp.value };
      try { window.localStorage.setItem("4dplan-settings", JSON.stringify(settings)); } catch (e) { /* sparas inte */ }
      l3gmApply(); if (typeof paintLegendDots === "function") paintLegendDots();
      clearTimeout(l3gm.legendT); l3gm.legendT = setTimeout(() => l3plDockRender(), 250);
    };
  });
  pop.querySelectorAll("[data-topc]").forEach(inp => { inp.oninput = () => { l3gmSet("ops", { ...(l3gmCfg().ops || {}), [inp.dataset.topc]: Number(inp.value) }); l3gmApply(); }; });
  q("#v3GmDoneOp").oninput = e => { q("#v3GmDoneOpVal").textContent = e.target.value; l3gmSet("doneOp", Number(e.target.value)); l3gmApply(); };
  q("#v3GmFuture").onchange = e => { l3gmSet("future", e.target.checked); l3gmApply(true); l3gmSync(); };
  q("#v3GmPulse").onchange = e => { l3gmSet("pulse", e.target.checked); if (e.target.checked) l3gmPulseSync(); else { l3gmPulseStop(); l3gmApply(true); } };
  q("#v3GmPulseCfg").onclick = e => { e.preventDefault(); l3gmPulseCfgOpen(e.currentTarget); };
  q("#v3GmSelAct").onchange = e => { l3gmSet("selAct", e.target.checked); l3gm.selSig = ""; l3gmSelSync(); };
}
