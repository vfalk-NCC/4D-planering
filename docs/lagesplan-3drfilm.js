/* Lägesplan – film i renderingsläget (Victor 2026-11-14: "flytta in filmfunktionen till renderingsläget … då får vi den snygga grafiken på filmen").

   Samma film som i 4D-planering → Film (intervall, kameravyer på datum, objektens animering, grafiken: datumskylt, pågår nu, glöd, milstolpar, förlopp, tidslinje), men varje bild ritas
   med renderingsmotorn (lagesplan-3drender.js: mjuka skuggor, ambient occlusion, kantutjämning, renderingsmaterial, mark och miljö) i stället för vyns liveritning.
   – Bild för bild, inte i realtid: varje bild får så många delbilder som du valt och tar den tid den tar.
   – Video: WebCodecs (VP9, annars VP8) och en egen WebM-skrivare med rätt tidsstämplar. MediaRecorder kan inte användas här – den stämplar bilder efter när de anländer, så en
     långsam bild skulle ge en film i slow motion. Reserv utan WebCodecs: JPEG-bildsekvens i en ZIP.
   – Editorn rörs inte: dag, kamera, visningsläge och allt annat sätts tillbaka efteråt.
   Prefix l3rf. */

const l3rf = { st: null, last: null, ms: 0 };
const L3RF_DEF = { fps: 30, q: 4, fmt: "auto", res: "1080" };
const l3rfPrefs = () => ({ ...L3RF_DEF, ...(typeof l3Prefs === "function" ? l3Prefs().rfilm || {} : {}) });
const l3rfSetPref = (k, v) => { if (typeof l3SetPref === "function") l3SetPref("rfilm", { ...(l3Prefs().rfilm || {}), [k]: v }); };

/* ---- WebM-skrivare (Matroska, bara en videospår) ---- */
function l3rfNum(n) { const a = []; let v = n; do { a.unshift(v & 255); v = Math.floor(v / 256); } while (v > 0); return Uint8Array.from(a); }
const l3rfStr = s => new TextEncoder().encode(s);
function l3rfSize(n) { const b = new Uint8Array(8); b[0] = 1; let v = n; for (let i = 7; i >= 1; i--) { b[i] = v % 256; v = Math.floor(v / 256); } return b; }   // 8 byte storlek
function l3rfCat(parts) { let n = 0; parts.forEach(p => { n += p.length; }); const o = new Uint8Array(n); let k = 0; parts.forEach(p => { o.set(p, k); k += p.length; }); return o; }
function l3rfEl(id, data) { const idb = l3rfNum(id), d = data instanceof Uint8Array ? data : l3rfCat(data); return l3rfCat([idb, l3rfSize(d.length), d]); }
const l3rfUint = (id, v) => l3rfEl(id, l3rfNum(v));
const l3rfFloat64 = (id, v) => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, v); return l3rfEl(id, b); };
class L3RfWebm {
  constructor(w, h, codec, fps) { this.w = w; this.h = h; this.codec = codec; this.fps = fps; this.frames = []; }
  add(data, ms, key) { this.frames.push({ data, ms: Math.round(ms), key: !!key }); }
  finish() {
    const dur = this.frames.length ? this.frames[this.frames.length - 1].ms + Math.round(1000 / this.fps) : 0;
    const ebml = l3rfEl(0x1A45DFA3, [l3rfUint(0x4286, 1), l3rfUint(0x42F7, 1), l3rfUint(0x42F2, 4), l3rfUint(0x42F3, 8), l3rfEl(0x4282, l3rfStr("webm")), l3rfUint(0x4287, 2), l3rfUint(0x4285, 2)]);
    const info = l3rfEl(0x1549A966, [l3rfUint(0x2AD7B1, 1000000), l3rfEl(0x4D80, l3rfStr("4D-planering")), l3rfEl(0x5741, l3rfStr("4D-planering")), l3rfFloat64(0x4489, dur)]);
    const tracks = l3rfEl(0x1654AE6B, l3rfEl(0xAE, [l3rfUint(0xD7, 1), l3rfUint(0x73C5, 1), l3rfUint(0x83, 1), l3rfUint(0x9C, 0), l3rfEl(0x86, l3rfStr(this.codec === "vp8" ? "V_VP8" : "V_VP9")), l3rfEl(0xE0, [l3rfUint(0xB0, this.w), l3rfUint(0xBA, this.h)])]));
    // Kluster: nytt vid varje nyckelbild (och senast var 5:e sekund) så att de relativa tiderna (16 bitar) räcker.
    const clusters = []; let cur = null;
    this.frames.forEach(f => { if (!cur || (f.key && cur.blocks.length) || f.ms - cur.t > 5000) { cur = { t: f.ms, blocks: [] }; clusters.push(cur); } const b = new Uint8Array(4 + f.data.length); b[0] = 0x81; b[1] = ((f.ms - cur.t) >> 8) & 255; b[2] = (f.ms - cur.t) & 255; b[3] = f.key ? 0x80 : 0; b.set(f.data, 4); cur.blocks.push(l3rfEl(0xA3, b)); });
    const clBytes = clusters.map(c => l3rfEl(0x1F43B675, [l3rfUint(0xE7, c.t), ...c.blocks]));
    // SeekHead (pekar på Cues) och Cues (för att hoppa i filmen) använder fasta 4-byte-positioner, så storlekarna går att räkna i förväg. Positioner räknas från segmentets innehåll.
    const u4 = (id, v) => l3rfEl(id, Uint8Array.from([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]));
    const mkSeek = cp => l3rfEl(0x114D9B74, l3rfEl(0x4DBB, [l3rfEl(0x53AB, Uint8Array.from([0x1C, 0x53, 0xBB, 0x6B])), u4(0x53AC, cp)]));
    const seekLen = mkSeek(0).length; let p = seekLen + info.length + tracks.length; const rel = clBytes.map(c => { const r = p; p += c.length; return r; });
    const cues = l3rfEl(0x1C53BB6B, clusters.map((c, i) => l3rfEl(0xBB, [l3rfUint(0xB3, c.t), l3rfEl(0xB7, [l3rfUint(0xF7, 1), u4(0xF1, rel[i])])])));
    const seg = l3rfEl(0x18538067, [mkSeek(p), info, tracks, ...clBytes, cues]);
    return new Blob([ebml, seg], { type: "video/webm" });
  }
}

/* ---- Kodning ---- */
async function l3rfEncoder(W, H, fps, bps, onChunk) {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return null;
  for (const codec of ["vp09.00.10.08", "vp8"]) {
    const cfg = { codec, width: W, height: H, bitrate: bps, framerate: fps, latencyMode: "quality" };
    try { const s = await VideoEncoder.isConfigSupported(cfg); if (!s.supported) continue; } catch (e) { continue; }
    let err = null; const enc = new VideoEncoder({ output: ch => { const d = new Uint8Array(ch.byteLength); ch.copyTo(d); onChunk(d, ch.timestamp / 1000, ch.type === "key"); }, error: e => { err = e; } });
    enc.configure(cfg); return { enc, codec: codec === "vp8" ? "vp8" : "vp9", get err() { return err; } };
  }
  return null;
}

/* ---- Filmen ---- */
const L3RF_FPS = [24, 25, 30, 60];
function l3rfDims(res) { const H = Math.max(2, Math.round((Number(res) || 1080) / 2) * 2), W = Math.round(H * 16 / 9 / 2) * 2; return { W, H }; }
/* o: { from, to, sec, fps, res, samples, format ("auto"|"webm"|"zip"), caption, onProgress(i, n, canvas, info) }. Returnerar { name, blob, size, frames, format, ms, stopped }. */
async function l3rfFilm(o = {}) {
  if (l3rf.st) throw new Error("En film renderas redan");
  if (typeof l3rnRender !== "function" || typeof l3plPrefs !== "function") throw new Error("Renderingsmotorn eller filmen är inte inläst");
  const pf = l3plPrefs().film || {}, rp = l3rfPrefs();
  const from = o.from || pf.from, to = o.to || pf.to; if (!from || !to || to < from) throw new Error("Välj ett intervall (Från före Till)");
  const sec = Math.max(1, Math.min(600, Number(o.sec || pf.sec) || 20)), fps = L3RF_FPS.includes(Number(o.fps)) ? Number(o.fps) : (L3RF_FPS.includes(rp.fps) ? rp.fps : 30), frames = Math.max(2, Math.round(sec * fps));
  const samples = Math.max(1, Math.min(64, Math.round(Number(o.samples || rp.q) || 4))), { W, H } = l3rfDims(o.res || pf.res || rp.res), caption = String(o.caption != null ? o.caption : pf.caption || "").trim();
  const t0 = l3plDate(from).getTime(), t1 = l3plDate(to).getTime(), keys = l3plKeys(), fmt = o.format || rp.fmt || "auto";
  const day0 = $("dateInput").value, cam0 = l3plCam(), mode0 = l3vm.mode, st = { stop: false, paused: false, i: 0, done: 0, frames, t0: performance.now() }; l3rf.st = st;
  if (document.activeElement && document.activeElement.blur && document.activeElement !== document.body) document.activeElement.blur();
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const ctx = cv.getContext("2d");
  let webm = null, enc = null, sink = null, ext = "webm", chunks = 0;
  try {
    if (fmt !== "zip") { const bps = Math.round(W * H * fps * 0.1); enc = await l3rfEncoder(W, H, fps, bps, (d, ms, key) => { webm.add(d, ms, key); chunks++; }); if (enc) webm = new L3RfWebm(W, H, enc.codec, fps); else if (fmt === "webm") throw new Error("Webbläsaren saknar videokodare (WebCodecs) – välj bildsekvens."); }
    if (!enc) { sink = await l3pmZipSink(`4D-render-film ${from} – ${to}.zip`); ext = "zip"; }
    if (typeof l3fsAnimEnd === "function") l3fsAnimEnd();
    const fx = typeof l3fxStart === "function" ? await l3fxStart(from, to).catch(() => null) : null, title = pf.title !== false;
    try {
      for (let i = 0; i < frames && !st.stop; i++) {
        st.i = i; const t = t0 + (t1 - t0) * (frames > 1 ? i / (frames - 1) : 0), d = l3plIso(new Date(Math.round(t / 86400000) * 86400000)), ft = i / fps, fs0 = performance.now();
        l3plSetDay(d); const c = l3plCamAt(keys, t); if (c) l3plCamApply(c); if (typeof l3animApply === "function") l3animApply(t); if (fx) l3fxFrame(fx, d, ft, t);
        const res = await l3rnRender({ width: W, height: H, samples, sticky: true, edges: false, soft: o.soft, ao: o.ao, exposure: o.exposure });
        ctx.drawImage(res.canvas, 0, 0, W, H);
        if (typeof l3fsDrawFrame === "function" && pf.pearls !== false) l3fsDrawFrame(ctx, W, H, d);
        if (fx) l3fxDraw(ctx, W, H, d, ft, fx, caption, pf.pearls !== false); else if (title && typeof l3plOverlay === "function") l3plOverlay(ctx, W, H, d, caption);
        if (enc) {
          while (enc.enc.encodeQueueSize > 4 && !enc.err) await new Promise(r => setTimeout(r, 10)); if (enc.err) throw enc.err;
          const vf = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) }); enc.enc.encode(vf, { keyFrame: i % 60 === 0 }); vf.close();
        } else { const blob = await new Promise(r => cv.toBlob(r, "image/jpeg", 0.93)), bytes = new Uint8Array(await blob.arrayBuffer()); await sink.add(`bild_${String(i + 1).padStart(5, "0")}.jpg`, bytes); }
        st.done = i + 1; const ms = performance.now() - fs0, done = i + 1, eta = ((performance.now() - st.t0) / done) * (frames - done); l3rf.ms = ms;
        if (typeof o.onProgress === "function") o.onProgress(done, frames, cv, { day: d, ms, eta });
        while (st.paused && !st.stop) await new Promise(r => setTimeout(r, 80));
        await new Promise(r => setTimeout(r, 0));
      }
    } finally { if (fx) l3fxEnd(fx); }
    let blob;
    if (enc) { await enc.enc.flush(); if (enc.err) throw enc.err; enc.enc.close(); blob = webm.finish(); } else { blob = await sink.finish(); }
    const name = `4D-render-film ${from} – ${to}.${ext}`, stopped = st.stop && (st.done || 0) < frames, n = st.done || 0;
    l3rf.last = { name, blob, size: blob ? blob.size : 0, frames: n, format: enc ? enc.codec : "jpeg-zip", w: W, h: H, fps };
    return { ...l3rf.last, ms: Math.round(performance.now() - st.t0), stopped, n };
  } finally {
    // tillbaka som innan filmen
    $("dateInput").value = day0; $("dateInput").dispatchEvent(new Event("change")); l3plSetDay(day0); if (!keys.length) l3plCamApply(cam0); else l3plCamApply(cam0);
    if (l3vm.mode !== mode0) l3vmSet(mode0, true);
    l3rf.st = null; if (typeof l3rnRelease === "function") l3rnRelease(); l3Render();
  }
}
function l3rfStop() { if (l3rf.st) { l3rf.st.stop = true; l3rf.st.paused = false; return true; } return false; }
function l3rfPause(on) { if (!l3rf.st) return false; l3rf.st.paused = on === undefined ? !l3rf.st.paused : !!on; return true; }
const l3rfSave = () => { const f = l3rf.last; if (!f || !f.blob) return false; downloadBlob(f.blob, f.name); return true; };

/* ---- Fliken Film i Rendera ---- */
const l3rfFmtT = s => { s = Math.max(0, Math.round(s)); return s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor(s % 3600 / 60)} min` : s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`; };
function l3rfTab(body, el) {
  const pf = l3plPrefs().film || {}, rp = l3rfPrefs(), acts = typeof l3plFilmActs === "function" ? l3plFilmActs() : [], keys = l3plKeys(), esc = s => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const range = acts.length ? [acts[0].start, acts.reduce((m, a) => (a.end > m ? a.end : m), acts[0].end)] : [$("dateInput").value, $("dateInput").value];
  const running = !!l3rf.st, canEnc = typeof VideoEncoder !== "undefined";
  const chip = (id, on, label, tip) => `<label class="rn-fchip" title="${esc(tip)}"><input type="checkbox" id="${id}" ${on ? "checked" : ""} /><span>${label}</span></label>`;
  body.innerHTML = `<div class="rn-g">
    <label>Från<input type="date" id="rfFrom" value="${esc(pf.from || range[0] || "")}" /></label><label>Till<input type="date" id="rfTo" value="${esc(pf.to || range[1] || "")}" /></label>
    <label>Längd (s)<input type="number" id="rfSec" min="1" max="600" value="${esc(String(pf.sec || 20))}" /></label>
    <label>Bildfrekvens<select id="rfFps">${L3RF_FPS.map(v => `<option value="${v}"${v === rp.fps ? " selected" : ""}>${v} bilder/s</option>`).join("")}</select></label>
    <label>Upplösning<select id="rfRes">${[["720", "720p"], ["1080", "1080p (Full HD)"], ["1440", "1440p"], ["2160", "2160p (4K, tungt)"]].map(([v, t]) => `<option value="${v}"${String(pf.res || rp.res) === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>
    <label>Kvalitet per bild<select id="rfQ">${[[1, "1 delbild (snabbast)"], [2, "2 delbilder"], [4, "4 delbilder"], [8, "8 delbilder"], [16, "16 delbilder (bäst)"]].map(([v, t]) => `<option value="${v}"${v === rp.q ? " selected" : ""}>${t}</option>`).join("")}</select></label>
    <label>Format<select id="rfFmt"><option value="auto"${rp.fmt === "auto" ? " selected" : ""}>${canEnc ? "Video (WebM)" : "Bildsekvens (JPEG i ZIP)"}</option><option value="zip"${rp.fmt === "zip" ? " selected" : ""}>Bildsekvens (JPEG i ZIP)</option></select></label>
    <label>Rubrik<input type="text" id="rfCap" placeholder="valfri" value="${esc(pf.caption || "")}" /></label></div>
    <div class="rn-sub">Grafik i filmen</div><div class="rn-fchips">${chip("rfTitle", pf.title !== false, "Datumskylt", "Vecka och datum uppe till vänster")}${chip("rfNow", pf.fxNow !== false, "Pågår nu", "Aktiviteterna som pågår, nere till höger")}${chip("rfGlow", pf.fxGlow !== false, "Glöd", "Objekt i pågående aktiviteter pulserar i statusfärgen")}${chip("rfMiles", pf.fxMiles !== false, "Milstolpar", "Rubrik när filmen passerar en milstolpe")}${chip("rfMeter", pf.fxMeter !== false, "Förlopp", "Hur stor del av projektet som är klart")}${chip("rfPearls", pf.pearls !== false, "Tidslinje", "Tidslinje med dagar, veckor och månader")}</div>
    <div class="rn-help"><b>${keys.length}</b> kameravy${keys.length === 1 ? "" : "er"} på tidslinjen${keys.length ? "" : " – utan kameravyer står kameran där den är nu"}. Fler val (etablering, kranar, statusförklaring, bubblor) och kameravyer finns under 4D-planering → Film. Materialen, marken och miljön du valt gäller också filmen.</div>
    <div class="rn-a rn-fa"><button type="button" id="rfGo" class="rn-go">${running ? "Stoppa" : "Rendera film"}</button><button type="button" id="rfPause" ${running ? "" : "disabled"}>${l3rf.st && l3rf.st.paused ? "Fortsätt" : "Paus"}</button><button type="button" id="rfSave" ${l3rf.last && l3rf.last.blob ? "" : "disabled"}>Spara senaste film</button><span id="rfMsg">${esc(l3rf.msg ? l3rf.msg : l3rf.last ? `Senaste: ${l3rf.last.name} (${(l3rf.last.size / 1e6).toFixed(1).replace(".", ",")} MB)` : "Bild för bild – varje bild får tid på sig. Låt fliken vara synlig.")}</span></div>
    <div class="rn-p"><i id="rfBar"></i></div>`;
  const q = s => body.querySelector(s), setF = (k, v) => l3plSet("film", { ...(l3plPrefs().film || {}), [k]: v });
  q("#rfFrom").onchange = () => setF("from", q("#rfFrom").value); q("#rfTo").onchange = () => setF("to", q("#rfTo").value); q("#rfSec").onchange = () => setF("sec", Math.max(1, Math.min(600, +q("#rfSec").value || 20))); q("#rfCap").onchange = () => setF("caption", q("#rfCap").value);
  q("#rfFps").onchange = () => l3rfSetPref("fps", +q("#rfFps").value); q("#rfQ").onchange = () => l3rfSetPref("q", +q("#rfQ").value); q("#rfFmt").onchange = () => l3rfSetPref("fmt", q("#rfFmt").value);
  q("#rfRes").onchange = () => { setF("res", q("#rfRes").value); l3rfSetPref("res", q("#rfRes").value); };
  [["#rfTitle", "title"], ["#rfNow", "fxNow"], ["#rfGlow", "fxGlow"], ["#rfMiles", "fxMiles"], ["#rfMeter", "fxMeter"], ["#rfPearls", "pearls"]].forEach(([id, k]) => { q(id).onchange = () => setF(k, q(id).checked); });
  q("#rfSave").onclick = () => l3rfSave();
  q("#rfPause").onclick = () => { l3rfPause(); l3rfTab(body, el); };
  q("#rfGo").onclick = async () => {
    if (l3rf.st) { l3rfStop(); return; }
    l3rf.msg = ""; const msg = q("#rfMsg"), bar = q("#rfBar"), cv = el.querySelector("#rnCv"); q("#rfGo").textContent = "Stoppa"; q("#rfPause").disabled = false; q("#rfSave").disabled = true;
    try {
      const r = await l3rfFilm({ from: q("#rfFrom").value, to: q("#rfTo").value, sec: +q("#rfSec").value, fps: +q("#rfFps").value, res: q("#rfRes").value, samples: +q("#rfQ").value, format: q("#rfFmt").value, caption: q("#rfCap").value,
        onProgress: (i, n, c, inf) => { bar.style.width = Math.round(i / n * 100) + "%"; msg.textContent = `Bild ${i} av ${n} (${inf.day}) · ${(inf.ms / 1000).toFixed(1)} s/bild · ca ${l3rfFmtT(inf.eta / 1000)} kvar`; if (cv) { cv.width = Math.min(960, c.width); cv.height = Math.round(cv.width * c.height / c.width); cv.getContext("2d").drawImage(c, 0, 0, cv.width, cv.height); } } });
      bar.style.width = "100%"; l3rf.msg = `${r.stopped ? "Avbruten" : "Klar"}: ${r.name} – ${r.frames} bilder, ${(r.size / 1e6).toFixed(1).replace(".", ",")} MB, ${l3rfFmtT(r.ms / 1000)}.`; msg.textContent = l3rf.msg;
      if (r.blob && r.size && el.isConnected) { try { downloadBlob(r.blob, r.name); } catch (e) { /* sparas med knappen */ } }
    } catch (e) { l3rf.msg = "Filmen kunde inte renderas: " + e.message; msg.textContent = l3rf.msg; }
    if (el.isConnected && body.isConnected) l3rfTab(body, el);
  };
}
