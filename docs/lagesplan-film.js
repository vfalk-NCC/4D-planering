/* Lägesplan – ortofoton över tid (Victors önskemål 2026-09-28):
   - fotodatumen som markeringar på tidsreglaget
   - före/efter-jämförelse med ett dragbart snitt
   - framdriftsfilm där fotona hålls och tonas över i varandra medan datumet
     räknas fram (datumen mellan fotona interpoleras). */

// ---------------------------------------------------------------------
// Fotodatum på tidsreglaget
// ---------------------------------------------------------------------
function renderDateMarks() {
  const el = $("dateMarks");
  if (!el) return;
  const list = typeof orthosByDate === "function" ? orthosByDate() : [];
  if (!list.length || dateMin == null || !(dateMax > dateMin)) { el.innerHTML = ""; el.classList.add("hidden"); return; }
  // Ett nytt foto utanför tidslinjen: utvidga den (setupDateRange ritar om markeringarna).
  if (list.some(o => { const t = Date.parse(orthoDate(o)); return t < dateMin || t > dateMax; })) { setupDateRange(); return; }
  el.classList.remove("hidden");
  el.innerHTML = list.map(o => {
    const f = Math.max(0, Math.min(1, (Date.parse(orthoDate(o)) - dateMin) / (dateMax - dateMin)));
    const on = ls("ortho:" + o.id).visible;
    return `<button type="button" class="dmark${on ? " on" : ""}" data-id="${escHtml(o.id)}" style="left:calc(8px + ${f.toFixed(4)} * (100% - 16px))"
      title="🛰 ${escHtml(o.name)} · ${escHtml(orthoDate(o))}${o.caption ? " – " + escHtml(o.caption) : ""}"></button>`;
  }).join("");
  el.querySelectorAll(".dmark").forEach(b => {
    b.onclick = () => {
      const o = orthos().find(x => x.id === b.dataset.id);
      if (!o) return;
      setDate(orthoDate(o));
      if (!orthoFollowDate()) { showOnlyOrtho(o.id); orthoChanged(); }
    };
  });
}

// ---------------------------------------------------------------------
// Före/efter: två foton med ett dragbart snitt över planen
// ---------------------------------------------------------------------
const compare = { on: false, a: null, b: null, split: 0.5 };
function compareActive() { return compare.on && orthos().length >= 2; }
function comparePair() {
  const list = orthosByDate();
  const find = id => list.find(o => o.id === id);
  let a = find(compare.a), b = find(compare.b);
  if (!a) a = list[list.length - 2];
  if (!b) b = list[list.length - 1];
  return [a, b];
}
function setCompare(on) {
  compare.on = on && orthos().length >= 2;
  if (compare.on) { const [a, b] = comparePair(); compare.a = a.id; compare.b = b.id; }
  renderCompareUi(); applyLayerCss(); renderOrtho();
}
function renderCompareUi() {
  const box = $("cmpBox"), btn = $("btnCompare");
  if (!box || !btn) return;
  const list = orthosByDate();
  btn.classList.toggle("hidden", list.length < 2);
  if (list.length < 2 && compare.on) compare.on = false;
  btn.classList.toggle("active", compare.on);
  btn.textContent = compare.on ? "✕ Avsluta jämför" : "⇆ Jämför före/efter";
  box.classList.toggle("hidden", !compare.on);
  if (compare.on) {
    const [a, b] = comparePair();
    const opts = cur => list.slice().reverse().map(o => `<option value="${escHtml(o.id)}"${o.id === cur.id ? " selected" : ""}>${escHtml(orthoDate(o))} · ${escHtml(o.name)}</option>`).join("");
    $("cmpA").innerHTML = opts(a); $("cmpB").innerHTML = opts(b);
  }
  updateCompareClip();
}
function updateCompareClip() {
  const bar = $("cmpBar");
  if (!bar) return;
  if (!compareActive() || !viewport) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  const vr = $("viewport").getBoundingClientRect();
  const sx = compare.split * vr.width;
  bar.style.left = `${sx}px`;
  const [a, b] = comparePair();
  $("cmpLabelA").textContent = `◀ ${orthoDate(a)}${a.caption ? " · " + a.caption : ""}`;
  $("cmpLabelB").textContent = `${orthoDate(b)}${b.caption ? " · " + b.caption : ""} ▶`;
  const c = $("orthoCanvasB");
  const left = parseFloat(c.style.left) || 0, w = parseFloat(c.style.width) || 0;
  const frac = w ? Math.max(0, Math.min(1, ((sx - view.tx) / view.scale - left) / w)) : 1;
  c.style.clipPath = `inset(0 0 0 ${(frac * 100).toFixed(3)}%)`;
}
function bindCompare() {
  $("btnCompare").onclick = () => setCompare(!compare.on);
  $("cmpA").onchange = e => { compare.a = e.target.value; renderCompareUi(); renderOrtho(); };
  $("cmpB").onchange = e => { compare.b = e.target.value; renderCompareUi(); renderOrtho(); };
  $("cmpSwap").onclick = () => { const [a, b] = comparePair(); compare.a = b.id; compare.b = a.id; renderCompareUi(); renderOrtho(); };
  const bar = $("cmpBar");
  bar.addEventListener("pointerdown", e => {
    e.preventDefault(); e.stopPropagation();
    bar.setPointerCapture(e.pointerId);
    const move = ev => {
      const vr = $("viewport").getBoundingClientRect();
      compare.split = Math.max(0.01, Math.min(0.99, (ev.clientX - vr.left) / vr.width));
      updateCompareClip();
    };
    const up = () => { bar.removeEventListener("pointermove", move); bar.removeEventListener("pointerup", up); };
    bar.addEventListener("pointermove", move);
    bar.addEventListener("pointerup", up);
  });
  window.addEventListener("resize", updateCompareClip);
}

// ---------------------------------------------------------------------
// Framdriftsfilm
// ---------------------------------------------------------------------
const FILM_W = 1920, FILM_H = 1080, FILM_FPS = 30;
const FILM_HOLD_SEC = 1.2;  // stillbild i början och slutet
const FILM_FADE = 0.35;     // "håll och tona": toningen tar sista 35 % av tiden mellan två foton
let film = null;            // { playing, stop } medan förhandsvisning/inspelning pågår
const smooth = t => t * t * (3 - 2 * t);
const dayMs = 86400000;

function filmOpts() {
  return {
    sec: Math.max(3, Math.min(600, Number(String($("filmSec").value).replace(",", ".")) || 20)),
    mode: $("filmMode").value,
    region: $("filmRegion").value,
    pdf: $("filmPdf").checked, zones: $("filmZones").checked, site: $("filmSite").checked,
    captions: $("filmCaptions").checked,
    title: $("filmTitle").value.trim(),
  };
}
/* Vilka foton som syns vid tidpunkten t (ms) och hur mycket av nästa som tonats in. */
function filmBlend(list, t, mode) {
  const ts = list.map(o => Date.parse(orthoDate(o)));
  if (t <= ts[0]) return { a: list[0], b: null, k: 0 };
  for (let i = 0; i < list.length - 1; i++) {
    if (t <= ts[i + 1]) {
      const span = ts[i + 1] - ts[i];
      const p = span > 0 ? (t - ts[i]) / span : 1;
      const k = mode === "linear" ? p : smooth(Math.max(0, Math.min(1, (p - (1 - FILM_FADE)) / FILM_FADE)));
      return { a: list[i], b: list[i + 1], k };
    }
  }
  return { a: list[list.length - 1], b: null, k: 0 };
}
/* Planytan (stage-px) som filmen visar, utvidgad till 16:9. */
function filmRegion(mode) {
  const pc = $("pdfCanvas");
  let x0 = 0, y0 = 0, x1 = pc.width, y1 = pc.height;
  if (mode === "view") {
    const vr = $("viewport").getBoundingClientRect();
    x0 = -view.tx / view.scale; y0 = -view.ty / view.scale;
    x1 = (vr.width - view.tx) / view.scale; y1 = (vr.height - view.ty) / view.scale;
  }
  const s = Math.min(FILM_W / (x1 - x0), FILM_H / (y1 - y0));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { s, x0: cx - FILM_W / s / 2, y0: cy - FILM_H / s / 2 };
}
function filmFrameTimes(list, o) {
  const t0 = Date.parse(orthoDate(list[0])), t1 = Date.parse(orthoDate(list[list.length - 1]));
  const hold = Math.round(FILM_HOLD_SEC * FILM_FPS);
  const move = Math.max(2, Math.round(o.sec * FILM_FPS));
  const n = hold + move + hold;
  return { t0, t1, n, at: i => i < hold ? t0 : i >= hold + move ? t1 : t0 + (t1 - t0) * (i - hold) / (move - 1) };
}
let filmDay = null;
function drawFilmFrame(ctx, list, t, o, reg) {
  const iso = isoOf(new Date(t));
  // Zoner/objekt/etablering följer datumet (räknas om bara när dagen byts).
  if (iso !== filmDay) { filmDay = iso; $("dateInput").value = iso; syncSliderFromDate(); renderZones(); }
  const { a, b, k } = filmBlend(list, t, o.mode);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.filter = "none";
  ctx.fillStyle = "#d1d5db"; ctx.fillRect(0, 0, FILM_W, FILM_H);
  const ox = -reg.x0 * reg.s, oy = -reg.y0 * reg.s;
  drawOrthoForExport(ctx, ox, oy, reg.s, [{ o: a, a: 1 }].concat(b && k > 0 ? [{ o: b, a: k }] : []));
  const pc = $("pdfCanvas");
  const layer = (id, on, fn) => {
    const c = $(id);
    if (!on || !c.width || getComputedStyle(c).display === "none") return;
    ctx.save();
    ctx.globalAlpha = Number(getComputedStyle(c).opacity) || 0;
    if (fn) fn();
    ctx.setTransform(reg.s, 0, 0, reg.s, ox, oy);
    ctx.drawImage(c, 0, 0, pc.width, pc.height);
    ctx.restore();
  };
  layer("pdfCanvas", o.pdf, () => { if ($("grayPdf").checked) ctx.filter = "grayscale(1)"; if (layerState.pdfMultiply !== false) ctx.globalCompositeOperation = "multiply"; });
  layer("zoneCanvas", o.zones); layer("objCanvas", o.zones);
  layer("topCanvas", o.site);
  drawFilmOverlay(ctx, list, t, o, a, b, k);
}
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / dayMs + 1) / 7);
}
function drawFilmOverlay(ctx, list, t, o, a, b, k) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.filter = "none";
  const font = (w, px) => `${w} ${px}px "Segoe UI", Arial, sans-serif`;
  const pad = 36;
  // Rubrik uppe till vänster
  if (o.title) {
    ctx.font = font(700, 34);
    const w = ctx.measureText(o.title).width + 44;
    ctx.fillStyle = "rgba(17,24,39,.72)"; roundRectPath(ctx, pad, pad, w, 60, 12); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.textBaseline = "middle"; ctx.textAlign = "left"; ctx.fillText(o.title, pad + 22, pad + 31);
  }
  // Datum nere till vänster
  const d = new Date(t);
  const t0 = Date.parse(orthoDate(list[0]));
  const dateTxt = d.toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });
  const sub = `Vecka ${isoWeek(d)} · dag ${Math.round((t - t0) / dayMs) + 1}`;
  ctx.font = font(700, 58); const w1 = ctx.measureText(dateTxt).width;
  ctx.font = font(500, 26); const w2 = ctx.measureText(sub).width;
  const bw = Math.max(w1, w2) + 56, bh = 138, by = FILM_H - pad - 34 - bh;
  ctx.fillStyle = "rgba(17,24,39,.78)"; roundRectPath(ctx, pad, by, bw, bh, 16); ctx.fill();
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#fff"; ctx.font = font(700, 58); ctx.fillText(dateTxt, pad + 28, by + 72);
  ctx.fillStyle = "#cbd5e1"; ctx.font = font(500, 26); ctx.fillText(sub, pad + 28, by + 114);
  // Bildtext för fotot som syns (tonas över tillsammans med fotot)
  if (o.captions) {
    const cap = (x, alpha) => {
      if (!x || !x.caption || alpha <= 0.01) return;
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.font = font(600, 30);
      const txt = `🛰 ${orthoDate(x)} – ${x.caption}`;
      const w = Math.min(ctx.measureText(txt).width + 44, FILM_W - 2 * pad);
      ctx.fillStyle = "rgba(255,255,255,.92)"; roundRectPath(ctx, pad, by - 76, w, 58, 12); ctx.fill();
      ctx.fillStyle = "#111827"; ctx.textBaseline = "middle"; ctx.fillText(txt, pad + 22, by - 47, w - 44);
      ctx.restore();
    };
    cap(a, 1 - k); cap(b, k);
  }
  // Tidslinje längst ner med fotodatumen
  const t1 = Date.parse(orthoDate(list[list.length - 1]));
  const lx = pad, lw = FILM_W - 2 * pad, ly = FILM_H - pad - 8;
  const fx = v => lx + lw * (t1 > t0 ? (v - t0) / (t1 - t0) : 1);
  ctx.fillStyle = "rgba(17,24,39,.45)"; roundRectPath(ctx, lx, ly - 4, lw, 8, 4); ctx.fill();
  ctx.fillStyle = "#0b5fff"; roundRectPath(ctx, lx, ly - 4, Math.max(8, fx(t) - lx), 8, 4); ctx.fill();
  list.forEach(x => {
    ctx.beginPath(); ctx.arc(fx(Date.parse(orthoDate(x))), ly, 9, 0, Math.PI * 2);
    ctx.fillStyle = Date.parse(orthoDate(x)) <= t ? "#0b5fff" : "#fff"; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = "#fff"; ctx.stroke();
  });
}

async function filmPrepare() {
  const list = orthosByDate();
  if (list.length < 2) { alert("Framdriftsfilmen behöver minst två ortofoton med olika fotodatum."); return null; }
  if (!plan || !plan.calib || !viewport) { alert("Öppna en kalibrerad plan först."); return null; }
  $("filmStatus").textContent = "Laddar ortofotona…";
  for (const o of list) {
    try { await ensureOrthoImage(o); } catch (e) { $("filmStatus").textContent = `⚠ Kunde inte hämta ${o.name}.`; return null; }
  }
  $("filmStatus").textContent = "";
  return list;
}
function filmBegin() {
  const st = { date: $("dateInput").value, sel: selectedSiteId };
  selectedSiteId = null; closeSitePop(); filmDay = null; stopPlay();
  return () => { selectedSiteId = st.sel; filmDay = null; setDate(st.date); };
}
function setFilmButtons(busy) {
  $("btnFilmPreview").textContent = busy === "preview" ? "⏹ Stoppa" : "▶ Förhandsvisa";
  $("btnFilmSave").textContent = busy === "rec" ? "⏹ Avbryt" : "🎬 Spara film";
  $("btnFilmPreview").disabled = busy === "rec";
  $("btnFilmSave").disabled = busy === "preview";
}
/* Förhandsvisning i dialogen i realtid. */
async function filmPreview() {
  if (film) { film.stop(); return; }
  const list = await filmPrepare();
  if (!list) return;
  const o = filmOpts(), reg = filmRegion(o.region), T = filmFrameTimes(list, o);
  const ctx = $("filmCanvas").getContext("2d");
  const restore = filmBegin();
  let stopped = false;
  film = { stop: () => { stopped = true; } };
  setFilmButtons("preview");
  const start = performance.now();
  await new Promise(res => {
    const tick = () => {
      const i = Math.floor((performance.now() - start) / 1000 * FILM_FPS);
      if (stopped || i >= T.n) { res(); return; }
      drawFilmFrame(ctx, list, T.at(i), o, reg);
      $("filmStatus").textContent = `${isoOf(new Date(T.at(i)))} · ${Math.round(i / T.n * 100)} %`;
      requestAnimationFrame(tick);
    };
    tick();
  });
  film = null; restore(); setFilmButtons(null);
  if (!stopped) $("filmStatus").textContent = "Förhandsvisningen är klar.";
}
/* Spelar in filmen (MP4 om webbläsaren kan, annars WebM). */
async function filmRecord() {
  if (film) { film.stop(); return; }
  const types = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  const type = window.MediaRecorder && types.find(t => MediaRecorder.isTypeSupported(t));
  if (!type) { alert("Webbläsaren kan inte spela in video."); return; }
  const list = await filmPrepare();
  if (!list) return;
  const o = filmOpts(), reg = filmRegion(o.region), T = filmFrameTimes(list, o);
  const canvas = $("filmCanvas"), ctx = canvas.getContext("2d");
  const restore = filmBegin();
  let stopped = false;
  film = { stop: () => { stopped = true; } };
  setFilmButtons("rec");
  drawFilmFrame(ctx, list, T.at(0), o, reg);
  const mr = new MediaRecorder(canvas.captureStream(FILM_FPS), { mimeType: type, videoBitsPerSecond: 12000000 });
  const chunks = [];
  mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise(res => { mr.onstop = res; });
  mr.start(500);
  const start = performance.now();
  try {
    for (let i = 0; i < T.n && !stopped; i++) {
      drawFilmFrame(ctx, list, T.at(i), o, reg);
      if (i % 10 === 0) $("filmStatus").textContent = `Spelar in… ${Math.round(i / T.n * 100)} % (${isoOf(new Date(T.at(i)))})`;
      // Håll takten i realtid så att filmen får rätt längd.
      const wait = start + (i + 1) * 1000 / FILM_FPS - performance.now();
      await new Promise(r => setTimeout(r, Math.max(0, wait)));
    }
  } finally {
    mr.stop();
    await done;
    film = null; restore(); setFilmButtons(null);
  }
  if (stopped) { $("filmStatus").textContent = "Inspelningen avbröts."; return; }
  const ext = type.startsWith("video/mp4") ? "mp4" : "webm";
  const name = `Framdrift ${plan.name} ${orthoDate(list[0])}–${orthoDate(list[list.length - 1])}.${ext}`;
  downloadBlob(new Blob(chunks, { type: type.split(";")[0] }), name);
  $("filmStatus").textContent = `✓ Sparad: ${name}`;
}
async function openFilm() {
  if (orthos().length < 2) { alert("Ladda upp minst två ortofoton (med olika fotodatum) för att göra en framdriftsfilm."); return; }
  if (!$("filmTitle").value) $("filmTitle").value = plan ? plan.name : "";
  $("filmModal").classList.remove("hidden");
  const list = await filmPrepare();
  if (!list) return;
  // Stillbild av första fotot som förhandsvisning.
  const restore = filmBegin();
  const o = filmOpts();
  drawFilmFrame($("filmCanvas").getContext("2d"), list, Date.parse(orthoDate(list[0])), o, filmRegion(o.region));
  restore();
  const days = Math.round((Date.parse(orthoDate(list[list.length - 1])) - Date.parse(orthoDate(list[0]))) / dayMs);
  $("filmInfo").textContent = `${list.length} ortofoton · ${orthoDate(list[0])} – ${orthoDate(list[list.length - 1])} (${days} dagar)`;
}
function closeFilm() { if (film) film.stop(); $("filmModal").classList.add("hidden"); }
function bindFilm() {
  ["btnOrthoFilm", "btnOrthoFilm2"].forEach(id => { if ($(id)) $(id).onclick = openFilm; });
  $("btnFilmPreview").onclick = filmPreview;
  $("btnFilmSave").onclick = filmRecord;
  $("btnFilmClose").onclick = closeFilm;
  $("filmModal").addEventListener("keydown", e => { if (e.key === "Escape") closeFilm(); });
}

bindCompare();
bindFilm();
renderDateMarks();
