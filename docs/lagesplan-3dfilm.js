/* 3D-vyn – filmens tidslinje längst ner i 3D-fönstret (Victor 2026-10-12: "Det här måste kunna göras smartare,
   jättekrångligt nu att lägga till vyer. Kan man lägga som ett pärlband av aktiviteternas text som poppar upp från
   tidslinjen och också att man ser datumen på tidslinjen längst ner i fönstret?").

   – Tidslinjen går över filmens intervall med månader och veckor. Dra i den (eller i det lila huvudet) för att
     spola: datumet i 3D och kameran följer med.
   – Pärlbandet: aktiviteternas namn sitter på tidslinjen där de börjar, i högst tre rader utan att krocka (de som
     inte får plats räknas). De som pågår där huvudet står poppar upp i sin statusfärg. Tryck på en pärla: markera
     aktivitetens objekt i 3D.
   – Kameravyer: ställ in kameran, tryck ＋ Vy här – en kamera läggs på datumet där huvudet står. Dra en kamera
     till ett annat datum, tryck för att gå dit, högerklicka (eller ✕ i rutan) för att ta bort.
   – Samma tidslinje och pärlband ritas längst ner i den inspelade filmen. */

const l3fs = { t: null, raf: 0, acts: null };
const L3PL_DAYMS = 86400000;
const l3plShortIso = t => { const d = new Date(t); return `${d.getUTCDate()} ${L3PL_MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const l3fsOn = () => !!(l3plPrefs().film || {}).strip;
function l3fsRange() {
  const f = l3plPrefs().film || {}, acts = l3plFilmActs();
  const lo = f.from || (acts.length ? acts[0].start : l3plDay()), hi = f.to || (acts.length ? acts.reduce((m, a) => (a.end > m ? a.end : m), acts[0].end) : l3gaAdd(l3plDay(), 60));
  return [l3plDate(lo).getTime(), l3plDate(hi > lo ? hi : l3gaAdd(lo, 1)).getTime()];
}
function l3fsToggle(on = !l3fsOn()) {
  l3plSet("film", { ...(l3plPrefs().film || {}), strip: on });
  if (on && !l3pl.rows) l3plLoad().then(l3fsRender);
  if (!on && typeof l3animReset === "function") l3animReset(); // objekten tillbaka till sitt grundläge
  if (!on) l3fsAnimEnd();
  l3fsRender(); l3plRenderTab();
}
/* Pärlbandet: [{ a, x (0–1), row }] – högst tre rader, i startordning; det som inte får plats räknas. */
function l3fsPearls(widthPx, t0, t1, charPx = 6.1) {
  const acts = l3plFilmActs().filter(a => l3plDate(a.end).getTime() >= t0 && l3plDate(a.start).getTime() <= t1);
  const ends = [-1e9, -1e9, -1e9], out = [];
  let hidden = 0;
  acts.forEach(a => {
    const u = Math.max(0, (l3plDate(a.start).getTime() - t0) / (t1 - t0)), x = u * widthPx;
    const label = a.objs.length ? `${a.objs[0]}${a.objs.length > 1 ? " +" + (a.objs.length - 1) : ""}: ${a.name}` : a.name;
    const w = Math.min(230, 16 + label.length * charPx);
    const row = ends.findIndex(e => e + 6 <= x);
    if (row < 0) { hidden++; return; }
    ends[row] = x + w; out.push({ a, u, x, w, row, label });
  });
  return { list: out, hidden };
}
function l3fsRender() {
  const host = document.getElementById("v3Canvas");
  if (!host) return;
  let el = document.getElementById("v3FilmStrip");
  if (!l3fsOn()) { if (el) el.remove(); host.style.removeProperty("--v3-sb"); return; }
  if (!l3pl.rows) { l3plLoad().then(l3fsRender); return; }
  if (l3plFilmSrc() !== "pp" && !l3pl.xrows) { l3plLoadX().then(l3fsRender); return; }
  if (!el) {
    el = document.createElement("div"); el.id = "v3FilmStrip"; el.className = "v3-fs";
    host.appendChild(el);
    ["pointerdown", "wheel", "contextmenu", "dblclick", "click", "keydown"].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
  }
  const dock = document.getElementById("v3PlanDock");
  el.style.bottom = (dock ? dock.offsetHeight : 0) + "px";
  const [t0, t1] = l3fsRange(), E = escHtml, keys = l3plKeys();
  const aks = typeof l3animAll === "function" ? l3animAll().flatMap(p => l3animKeys(p).map(k => ({ id: p.id, name: p.name || p.type, date: k.date, v: k.v }))) : [];
  l3fs.aks = aks;
  const sel = typeof placements !== "undefined" && l3 ? [...l3.sel].map(id => placements.find(q => q.id === id)).filter(Boolean) : [], faceAll = sel.length > 0 && sel.every(q => q.animFace === true);
  const W = Math.max(200, host.clientWidth - 274 - 24), U = t => (t - t0) / (t1 - t0);
  if (l3fs.t === null || l3fs.t < t0 || l3fs.t > t1) l3fs.t = Math.min(t1, Math.max(t0, l3plDate(l3plDay()).getTime()));
  // Datumen: månader (och veckor när intervallet är kort).
  const ticks = [], span = (t1 - t0) / 86400000;
  const d = new Date(t0); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
  for (; d.getTime() <= t1; d.setUTCMonth(d.getUTCMonth() + 1)) ticks.push({ u: U(d.getTime()), t: `${L3PL_MON[d.getUTCMonth()]}${d.getUTCMonth() === 0 ? " " + d.getUTCFullYear() : ""}`, m: true });
  // Veckorna så tätt det får plats (varannan/var fjärde vecka i långa filmer).
  const wkPx = W * 7 / Math.max(1, span), every = wkPx > 30 ? 1 : wkPx > 15 ? 2 : wkPx > 7 ? 4 : 0;
  if (every) { const w = l3plMonday(l3plIso(new Date(t0))); for (w.setUTCDate(w.getUTCDate() + 7); w.getTime() <= t1; w.setUTCDate(w.getUTCDate() + 7)) { const no = l3plWeekNo(w); ticks.push({ u: U(w.getTime()), t: every === 1 || no % every === 0 ? `v${no}` : "", m: false }); } }
  // Aktiviteterna visas inte längre på tidslinjen (Victor 2026-10-12) – dagarna markeras i stället.
  l3fs.pearls = [];
  const dayPx = W * L3PL_DAYMS / Math.max(1, t1 - t0), days = [];
  if (dayPx >= 3) { const dd = new Date(t0); dd.setUTCHours(0, 0, 0, 0); for (; dd.getTime() <= t1; dd.setUTCDate(dd.getUTCDate() + 1)) days.push({ u: U(dd.getTime()), we: dd.getUTCDay() === 6 || dd.getUTCDay() === 0 }); }
  el.innerHTML = `<div class="v3-fs-ctl">
      <button type="button" class="v3-fs-play" id="v3FsPlay" title="Spela upp filmen i 3D-vyn (■ stoppar och går till början)">${l3pl.rec ? "■" : "▶"}</button>
      <button type="button" class="v3-fs-pause" id="v3FsPause" title="Pausa (mellanslag)" ${l3pl.rec ? "" : "disabled"}>${l3pl.rec && l3pl.rec.paused ? "▶" : "⏸"}</button>
      <button type="button" class="v3-fs-rec" id="v3FsRec" title="Spela in filmen och spara som videofil">⏺</button>
      <button type="button" class="v3-fs-add" id="v3FsAdd" title="Lägg kameran som den står nu på datumet där huvudet står (finns det redan en vy där uppdateras den)">＋ Vy</button>
      <button type="button" class="v3-fs-akey" id="v3FsAKey" title="Animera objekt: markera ett placerat objekt (t.ex. en hämtad modell), ställ in dess läge och tryck här – läget sparas på datumet där huvudet står. Flera nycklar = objektet rör sig mellan dem.">◆ Nyckel</button>
      <button type="button" class="v3-ic v3-fs-x" id="v3FsClose" title="Stäng tidslinjen">✕</button>
      <div class="v3-fs-date" id="v3FsDate"></div>
      <div class="v3-fs-range">${E(l3plShortIso(t0))} – ${E(l3plShortIso(t1))}</div>
      <div class="v3-fs-opts" title="Gäller ◆ Nyckel (objektanimering)"><label title="Objektet syns från den här nyckeln och framåt (till nästa nyckel). Avbockad = det försvinner."><input type="checkbox" id="v3FsVis" ${l3fs.vis === false ? "" : "checked"} /> Synlig</label><label title="Visa objektens rörelsebanor som streckade linjer (syns inte i uppspelning och film)"><input type="checkbox" id="v3FsPath" ${(l3plPrefs().film || {}).animPath === false ? "" : "checked"} /> Bana</label><label title="De markerade objekten vrids efter färdriktningen"><input type="checkbox" id="v3FsFace" ${faceAll ? "checked" : ""} /> Följ banan</label></div>
    </div>
    <div class="v3-fs-track" id="v3FsTrack" style="--w:${W}px">
      <div class="v3-fs-days">${days.map(d => `<i class="${d.we ? "we" : ""}" style="left:${(d.u * W).toFixed(1)}px;width:${Math.max(1, dayPx).toFixed(1)}px"></i>`).join("")}</div>
      <div class="v3-fs-axis">${ticks.map(k => `<span class="${k.m ? "m" : "w"}" style="left:${k.u * W}px">${E(k.t)}</span>`).join("")}
        ${aks.map((a, i) => `<button type="button" class="v3-fs-ak ${a.v === false ? "off" : ""}" data-fsa="${i}" style="left:${U(l3animDate(a.date)) * W}px" title="${E(a.name)} · ${E(a.date)}${a.v === false ? " (osynlig härifrån)" : ""} – tryck: gå dit och markera · dra: flytta · högerklick: ta bort"></button>`).join("")}
        ${keys.map((k, i) => `<button type="button" class="v3-fs-key" data-fsk="${i}" style="left:${U(l3plDate(k.date).getTime()) * W}px" title="${E(k.name || "Vy")} · ${E(k.date)} – tryck: gå dit · dra: flytta · högerklick: ta bort">🎥</button>`).join("")}
      </div>
      <div class="v3-fs-head" id="v3FsHead"></div>
    </div>`;
  l3fsBind(el, t0, t1, W);
  l3fsPlayhead(l3fs.t, true);
  host.style.setProperty("--v3-sb", (el.offsetHeight + (dock ? dock.offsetHeight : 0)) + "px"); // hörnets reglage lyfts ovanför tidslinjen
  if (typeof l3animPaths === "function") { l3animPaths(); l3Render(); }
}
function l3fsBind(el, t0, t1, W) {
  const track = el.querySelector("#v3FsTrack"), tOf = cx => { const r = track.getBoundingClientRect(); return t0 + Math.max(0, Math.min(1, (cx - r.left) / W)) * (t1 - t0); };
  el.querySelector("#v3FsClose").onclick = () => l3fsToggle(false);
  el.querySelector("#v3FsPlay").onclick = () => l3plFilm(false);
  el.querySelector("#v3FsPause").onclick = () => l3plPause();
  el.querySelector("#v3FsRec").onclick = () => l3plFilm(true);
  el.querySelector("#v3FsAdd").onclick = () => {
    const date = l3plIso(new Date(Math.round(l3fs.t / 86400000) * 86400000)), list = l3plKeys(), i = list.findIndex(k => k.date === date);
    l3plKeyAdd(l3plCam(), date, i >= 0 ? list[i].name : `Vy ${list.length + 1}`);
    l3fsRender();
  };
  el.querySelector("#v3FsVis").onchange = e => { l3fs.vis = e.target.checked; };
  el.querySelector("#v3FsPath").onchange = e => { l3plSet("film", { ...l3plPrefs().film, animPath: e.target.checked }); l3animPaths(); l3Render(); };
  el.querySelector("#v3FsFace").onchange = e => { if (!l3animFaceSet(e.target.checked)) { e.target.checked = false; return; } l3animApply(l3fs.t); l3Render(); };
  el.querySelector("#v3FsAKey").onclick = () => {
    const date = l3plIso(new Date(Math.round(l3fs.t / 86400000) * 86400000));
    if (typeof l3animCapture === "function" && l3animCapture(date)) l3fsRender();
  };
  // Objektens nycklar (◆): tryck = gå dit och markera objektet, dra = nytt datum, högerklick = ta bort.
  el.querySelectorAll("[data-fsa]").forEach(b => {
    const a = () => (l3fs.aks || [])[+b.dataset.fsa];
    b.onpointerdown = e => {
      e.preventDefault(); e.stopPropagation(); b.setPointerCapture && b.setPointerCapture(e.pointerId);
      const x0 = e.clientX; let moved = false;
      b.onpointermove = ev => { if (Math.abs(ev.clientX - x0) > 3) moved = true; if (moved) b.style.left = (Math.max(0, Math.min(1, (tOf(ev.clientX) - t0) / (t1 - t0))) * W) + "px"; };
      b.onpointerup = ev => {
        b.onpointermove = b.onpointerup = null;
        const k = a(); if (!k) return;
        if (moved) { const to = l3plIso(new Date(Math.round(tOf(ev.clientX) / 86400000) * 86400000)); l3animMove(k.id, k.date, to); l3fsRender(); l3Status(`Nyckeln flyttad till ${to}.`); }
        else { l3fsSeek(l3animDate(k.date)); if (typeof l3SelectIds === "function") l3SelectIds([k.id]); l3fsRender(); }
      };
    };
    b.oncontextmenu = e => { e.preventDefault(); const k = a(); if (!k) return; l3animRemove(k.id, k.date); l3fsRender(); l3Status(`Nyckeln ${k.date} borttagen.`); };
  });
  // Spola: dra på tidslinjen.
  const axis = el.querySelector(".v3-fs-axis");
  axis.onpointerdown = e => {
    if (e.target.closest(".v3-fs-key")) return;
    e.preventDefault(); axis.setPointerCapture && axis.setPointerCapture(e.pointerId);
    l3fsSeek(tOf(e.clientX));
    axis.onpointermove = ev => l3fsSeek(tOf(ev.clientX));
    axis.onpointerup = axis.onpointercancel = () => { axis.onpointermove = axis.onpointerup = axis.onpointercancel = null; };
  };
  // Kamerorna: tryck = gå dit, dra = nytt datum, högerklick = ta bort.
  el.querySelectorAll("[data-fsk]").forEach(b => {
    b.onpointerdown = e => {
      e.preventDefault(); e.stopPropagation(); b.setPointerCapture && b.setPointerCapture(e.pointerId);
      const x0 = e.clientX; let moved = false;
      b.onpointermove = ev => { if (Math.abs(ev.clientX - x0) > 3) moved = true; if (moved) b.style.left = (Math.max(0, Math.min(1, (tOf(ev.clientX) - t0) / (t1 - t0))) * W) + "px"; };
      b.onpointerup = ev => {
        b.onpointermove = b.onpointerup = null;
        const list = l3plKeys(), k = list[+b.dataset.fsk]; if (!k) return;
        if (moved) { k.date = l3plIso(new Date(Math.round(tOf(ev.clientX) / 86400000) * 86400000)); l3plKeysSet(list); l3fsRender(); l3Status(`Kameravyn flyttad till ${k.date}.`); }
        else { l3fsSeek(l3plDate(k.date).getTime()); l3plCamApply(k); l3Render(); }
      };
    };
    b.oncontextmenu = e => { e.preventDefault(); const list = l3plKeys(), k = list.splice(+b.dataset.fsk, 1)[0]; l3plKeysSet(list); l3fsRender(); if (k) l3Status(`Kameravyn ${k.date} borttagen.`); };
  });
  el.querySelectorAll("[data-fsp]").forEach(b => { b.onclick = () => { const p = l3fs.pearls[+b.dataset.fsp]; if (p) l3plSelect(p.a.key); }; });
}
/* Förhandsvisning av objektens animering medan man drar i tidslinjen/datumet (annars syns den bara i filmen). Samma kod som i filmen
   (l3fxAnimate); byggs om när valen, intervallet eller planeringen ändras. */
function l3fsAnimOn() { const A = (l3plPrefs().film || {}).anim || {}; return (A.def && A.def !== "color") || Object.values(A.by || {}).some(v => v && v !== "color"); }
function l3fsAnimEnd() { if (l3fs.fx) { try { l3fxEnd(l3fs.fx); } catch (e) { /* */ } } l3fs.fx = null; l3fs.fxSig = ""; l3fs.fxBusy = false; }
function l3fsAnimPreview(tIn) {
  if (typeof l3fxStart !== "function" || typeof l3fxAnimate !== "function" || (typeof l3pl !== "undefined" && l3pl.rec) || !l3pl.rows) return;
  if (!l3fsAnimOn() && !l3fs.fx) return;
  const t = Number.isFinite(tIn) ? tIn : l3plDate(l3plDay()).getTime() + 43200000;
  const [t0, t1] = l3fsRange(), f = l3plPrefs().film || {}, msig = typeof l3b !== "undefined" ? l3b.models.map(m => `${m.id}:${m.visible ? 1 : 0}:${(m.meshes || []).length}`).join(",") : "", sig = JSON.stringify([f.anim, t0, t1, l3plFilmSrc(), (l3pl.rows || []).length, msig]); // modellerna med: objekten hittas först när de är inlästa
  if (l3fs.fx && l3fs.fxSig === sig) { try { l3fxAnimate(l3fs.fx, t); } catch (e) { console.warn("Animeringens förhandsvisning", e); } if (typeof l3Render === "function") l3Render(); return; }
  if (l3fs.fxBusy) { l3fs.fxPend = t; return; }
  l3fsAnimEnd(); if (!l3fsAnimOn()) return;
  l3fs.fxBusy = true;
  l3fxStart(l3plIso(new Date(t0)), l3plIso(new Date(t1))).then(fx => { l3fs.fxBusy = false; l3fs.fx = fx; l3fs.fxSig = sig; try { l3fxAnimate(fx, Number.isFinite(l3fs.fxPend) ? l3fs.fxPend : t); } catch (e) { console.warn("Animeringens förhandsvisning", e); } l3fs.fxPend = null; if (typeof l3Render === "function") l3Render(); }).catch(() => { l3fs.fxBusy = false; });
}
/* Spolar: datumet och kameran (mellan vyerna) – ritas en gång per bildruta. */
function l3fsSeek(t) {
  l3fs.t = t;
  l3fsPlayhead(t);
  if (l3fs.raf) return;
  l3fs.raf = requestAnimationFrame(() => {
    l3fs.raf = 0;
    const d = l3plIso(new Date(Math.round(l3fs.t / 86400000) * 86400000));
    l3plSetDay(d);
    const c = l3plCamAt(l3plKeys(), l3fs.t); if (c) l3plCamApply(c);
    if (typeof l3animApply === "function") l3animApply(l3fs.t);
    l3fsAnimPreview(l3fs.t);
    l3Render();
  });
}
/* Huvudet, datumet och pärlorna som pågår (poppar upp). */
function l3fsPlayhead(t, force) {
  const el = document.getElementById("v3FilmStrip"); if (!el) return;
  const [t0, t1] = l3fsRange(), W = parseFloat(el.querySelector("#v3FsTrack").style.getPropertyValue("--w")) || 400;
  const u = Math.max(0, Math.min(1, (t - t0) / (t1 - t0))), h = el.querySelector("#v3FsHead");
  h.style.left = u * W + "px";
  const dt = new Date(Math.round(t / 86400000) * 86400000), iso = l3plIso(dt);
  el.querySelector("#v3FsDate").textContent = `v.${l3plWeekNo(dt)} · ${dt.getUTCDate()} ${L3PL_MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
  if (!force && el._iso === iso) return;
  el._iso = iso;
  (l3fs.pearls || []).forEach((p, i) => { const b = el.querySelector(`[data-fsp="${i}"]`); if (b) b.classList.toggle("on", p.a.start <= iso && p.a.end >= iso); });
}
/* I filmen: tidslinjen med datum och pärlbandet längst ner i bilden. */
function l3fsDrawFrame(ctx, W, H, iso) {
  const s = H / 1080, [t0, t1] = l3fsRange(), barH = 84 * s, y0 = H - barH, pad = 40 * s, w = W - 2 * pad, U = t => pad + (t - t0) / (t1 - t0) * w;
  const t = l3plDate(iso).getTime();
  ctx.save();
  const g = ctx.createLinearGradient(0, y0 - 30 * s, 0, H); g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.35, "rgba(255,255,255,.88)"); g.addColorStop(1, "rgba(255,255,255,.94)");
  ctx.fillStyle = g; ctx.fillRect(0, y0 - 30 * s, W, barH + 30 * s);
  // Axeln (Victor 2026-10-12: "markera tydligare ut veckor och månader"): månaderna som band med namnet i mitten
  // och en tydlig gräns, veckorna som streck med veckonummer (så tätt som det får plats).
  const ay = H - 34 * s, bandY = ay + 4 * s, bandH = 28 * s;
  const mStart = new Date(t0); mStart.setUTCDate(1);
  for (let m = new Date(mStart), k = 0; m.getTime() < t1; k++) {
    const a = Math.max(t0, m.getTime()), nx = new Date(m); nx.setUTCMonth(nx.getUTCMonth() + 1); const b = Math.min(t1, nx.getTime());
    const xa = U(a), xb = U(b);
    ctx.fillStyle = k % 2 ? "rgba(109,94,252,.07)" : "rgba(15,23,42,.035)"; ctx.fillRect(xa, bandY, xb - xa, bandH);
    if (m.getTime() > t0) { ctx.fillStyle = "rgba(15,23,42,.55)"; ctx.fillRect(xa - 1.25 * s, ay - 14 * s, 2.5 * s, bandH + 18 * s); }
    const lbl = `${L3PL_MON[m.getUTCMonth()].toUpperCase()}${m.getUTCMonth() === 0 || k === 0 ? " " + m.getUTCFullYear() : ""}`;
    ctx.font = `800 ${Math.round(15 * s)}px system-ui, sans-serif`; ctx.textBaseline = "middle";
    const lw = ctx.measureText(lbl).width;
    if (xb - xa > lw + 12 * s) { ctx.fillStyle = "#334155"; ctx.fillText(lbl, Math.max(xa + 6 * s, Math.min(xb - lw - 6 * s, (xa + xb) / 2 - lw / 2)), bandY + bandH / 2 + 1); }
    m = nx;
  }
  // Dagarna (Victor 2026-10-12: "markeringar för dagar istället med snygg grafik"): ett litet streck per dag,
  // helgerna som ljusa band; passerade dagar i lila, kommande grå.
  const dayPx = L3PL_DAYMS / (t1 - t0) * w;
  if (dayPx >= 2.5 * s) {
    const dd = new Date(t0); dd.setUTCHours(0, 0, 0, 0);
    for (; dd.getTime() <= t1; dd.setUTCDate(dd.getUTCDate() + 1)) {
      const x = U(dd.getTime()), wd = dd.getUTCDay(), past = dd.getTime() <= t;
      if ((wd === 6 || wd === 0) && dayPx >= 5 * s) { ctx.fillStyle = past ? "rgba(109,94,252,.10)" : "rgba(15,23,42,.05)"; ctx.fillRect(x, ay - 16 * s, dayPx, 16 * s); }
      ctx.fillStyle = past ? "rgba(109,94,252,.75)" : "rgba(15,23,42,.22)";
      const th = dayPx >= 9 * s ? 6 * s : 4 * s; ctx.fillRect(x - 0.6 * s, ay - th, 1.2 * s, th);
    }
  }
  // Veckorna: måndagarna; veckonummer när det finns plats (annars var annan/fjärde vecka).
  const wkPx = 7 * L3PL_DAYMS / (t1 - t0) * w, every = wkPx > 34 * s ? 1 : wkPx > 17 * s ? 2 : wkPx > 8 * s ? 4 : 0;
  if (every) {
    ctx.font = `700 ${Math.round(13 * s)}px system-ui, sans-serif`; ctx.textBaseline = "bottom";
    const wd = l3plMonday(l3plIso(new Date(t0))); if (wd.getTime() < t0) wd.setUTCDate(wd.getUTCDate() + 7);
    for (let n = 0; wd.getTime() <= t1; wd.setUTCDate(wd.getUTCDate() + 7), n++) {
      const x = U(wd.getTime()), no = l3plWeekNo(wd);
      ctx.fillStyle = "rgba(15,23,42,.4)"; ctx.fillRect(x - 1 * s, ay - 10 * s, 2 * s, 14 * s);
      if (no % every === 0 || every === 1) { ctx.fillStyle = "#475569"; ctx.fillText(`v${no}`, x + 4 * s, ay - 4 * s); }
    }
  }
  ctx.strokeStyle = "rgba(15,23,42,.35)"; ctx.lineWidth = 2 * s; ctx.beginPath(); ctx.moveTo(pad, ay); ctx.lineTo(W - pad, ay); ctx.stroke();
  ctx.textBaseline = "top";
  // Avklarad del och huvudet.
  ctx.strokeStyle = "#6d5efc"; ctx.lineWidth = 5 * s; ctx.beginPath(); ctx.moveTo(pad, ay); ctx.lineTo(U(t), ay); ctx.stroke();
  ctx.fillStyle = "rgba(109,94,252,.25)"; ctx.beginPath(); ctx.arc(U(t), ay, 15 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#6d5efc"; ctx.beginPath(); ctx.arc(U(t), ay, 9 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(U(t), ay, 3.5 * s, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
window.addEventListener("resize", () => { if (l3fsOn()) l3fsRender(); });
