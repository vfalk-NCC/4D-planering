/* Filmredigering – smart meny som öppnas tillsammans med filmens tidslinje (Victor 2026-11-16: "när jag öppnar tidslinjen ska det komma upp en
   smart meny med massa smarta redigeringsverktyg för en film – se över vad andra program har").
   Verktygen är hämtade från videoprogram (Premiere, DaVinci, Camtasia, iMovie) och 4D-/visualiseringsprogram (Synchro, Twinmotion, Lumion):
     • Tid:      tidskurva (linjär, mjuk start/slut, accelerera, bromsa), pauser vid datum med valfri titeltext (titelkort), tona in/ut (svart/vit),
                 från/till = huvudet, mallar (snabb överblick, presentation med titel, stående 9:16, långsam tidslinje)
     • Kamera:   färdiga rörelser (omloppsbana 360°/180°, inkörning, utkörning, sidoglid, kranåkning) som skapar vyer, jämn kamerabana (spline),
                 fördela vyerna jämnt, kopiera vy hit, flytta alla vyer/objektnycklar efter huvudet ± dagar, hoppa mellan vyer, ta bort alla vyer
     • Uppspelning: hastighet 0,25–4×, loop, bildförhållande 16:9 / 21:9 / 4:3 / 1:1 / 9:16 med bildruta-guide
     • Utseende: filmfilter (levande, dämpad, svartvit, varm, kall, film)
     • Markörer: flaggor med namn på tidslinjen, hoppa dit
   Allt sparas i filmens inställningar (plan.film.edit) och gäller både den inspelade filmen och renderingsfilmen (lagesplan-3drfilm.js).
   Prefix l3fe. Anropas från filmen: l3feTimeAt (tid per bild), l3feOverlay (fade/titelkort), l3feFilter (filter), l3feW (bredd efter bildförhållande). */

const L3FE_DAY = 86400000;
const L3FE_ASPECT = { "16:9": 16 / 9, "21:9": 21 / 9, "4:3": 4 / 3, "1:1": 1, "9:16": 9 / 16 };
const L3FE_LOOKS = { "": ["Ingen", ""], vivid: ["Levande", "contrast(1.08) saturate(1.3)"], muted: ["Dämpad", "saturate(0.7) contrast(0.95)"], bw: ["Svartvit", "grayscale(1) contrast(1.1)"], warm: ["Varm", "sepia(0.25) saturate(1.1) hue-rotate(-8deg)"], cool: ["Kall", "saturate(0.95) hue-rotate(12deg) brightness(1.02)"], film: ["Film", "contrast(1.12) saturate(0.9) sepia(0.12)"] };
const L3FE_EASE = { lin: ["Linjär (jämn takt)", u => u], inout: ["Mjuk start och slut", u => u * u * (3 - 2 * u)], in: ["Mjuk start (accelererar)", u => u * u], out: ["Mjuk slut (bromsar)", u => 1 - (1 - u) * (1 - u)] };
const l3feClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const l3feFilm = () => (typeof l3plPrefs === "function" ? l3plPrefs().film : null) || {};
const l3feE = () => ({ ease: "lin", cam: "smooth", holds: [], fadeIn: 0, fadeOut: 0, fadeCol: "#000000", speed: 1, loop: false, look: "", aspect: "auto", guide: false, markers: [], open: true, sec: {}, ...(l3feFilm().edit || {}) });
function l3feSet(patch, rerender = true) { const f = l3feFilm(); l3plSet("film", { ...f, edit: { ...l3feE(), ...patch } }); if (rerender) l3feRender(); l3feGuide(); }
const l3feDate = t => l3plIso(new Date(Math.round(t / L3FE_DAY) * L3FE_DAY));
const l3feHead = () => (typeof l3fs !== "undefined" && l3fs.t != null ? l3fs.t : l3plDate(l3plDay()).getTime());

/* ---- Tid: tidskurva, pauser/titelkort, tona in/ut ---------------------------------------------------- */
function l3feInv(fn, p) { let lo = 0, hi = 1; for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (fn(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; }
/* Filmens tid s (sekunder från start) → { t: tid i projektet (ms), hold: pausen som pågår eller null, hs: sekunder in i pausen }.
   Pauserna (hold) ligger på sina datum och tas ur filmens längd sec; resten fördelas efter tidskurvan. */
function l3feTimeAt(s, sec, tIn, tOut) {
  const E = l3feE(), fn = (L3FE_EASE[E.ease] || L3FE_EASE.lin)[1], span = Math.max(1, tOut - tIn);
  let holds = (E.holds || []).filter(h => h && h.date && Number(h.sec) > 0).map(h => ({ ...h, sec: Number(h.sec), p: l3feClamp((l3plDate(h.date).getTime() - tIn) / span, 0, 1) })).sort((a, b) => a.p - b.p);
  const H = holds.reduce((m, h) => m + h.sec, 0), k = H > sec - 1 ? Math.max(0, (sec - 1) / H) : 1; holds.forEach(h => { h.sec *= k; });
  const base = Math.max(1, sec - H * k); let acc = 0;
  for (const h of holds) {
    const start = l3feInv(fn, h.p) * base + acc;
    if (s < start) break;
    if (s < start + h.sec) return { t: tIn + span * h.p, hold: h, hs: s - start };
    acc += h.sec;
  }
  return { t: tIn + span * fn(l3feClamp((s - acc) / base, 0, 1)), hold: null, hs: 0 };
}
/* Över/under bilden i den inspelade filmen: titelkort (text i en paus) och tona in/ut. */
function l3feOverlay(ctx, W, H, s, sec, tm) {
  const E = l3feE(), sc = H / 1080;
  if (tm && tm.hold && tm.hold.text) {
    const a = l3feClamp(tm.hs / 0.5, 0, 1) * l3feClamp((tm.hold.sec - tm.hs) / 0.5, 0, 1);
    ctx.save(); ctx.globalAlpha = 0.55 * Math.max(a, 0); ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = Math.max(a, 0);
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `800 ${Math.round(64 * sc)}px system-ui, sans-serif`;
    const lines = String(tm.hold.text).split(/\n/).slice(0, 4), lh = 78 * sc, y0 = H / 2 - (lines.length - 1) * lh / 2;
    lines.forEach((ln, i) => { let t = ln; while (t.length > 3 && ctx.measureText(t).width > W * 0.86) t = t.slice(0, -1); ctx.fillText(t, W / 2, y0 + i * lh); });
    ctx.restore();
  }
  const fi = Number(E.fadeIn) || 0, fo = Number(E.fadeOut) || 0; let fa = 0;
  if (fi > 0 && s < fi) fa = Math.max(fa, 1 - s / fi); if (fo > 0 && s > sec - fo) fa = Math.max(fa, 1 - (sec - s) / fo);
  if (fa > 0) { ctx.save(); ctx.globalAlpha = l3feClamp(fa, 0, 1); ctx.fillStyle = E.fadeCol === "#ffffff" ? "#fff" : "#000"; ctx.fillRect(0, 0, W, H); ctx.restore(); }
}
/* Uppspelningen i 3D-vyn (utan inspelning): samma tona/titel som ett lager ovanpå duken. */
function l3feLive(s, sec, tm) {
  const host = document.getElementById("v3Canvas"); if (!host) return;
  let el = document.getElementById("v3FeLive");
  if (!el) { el = document.createElement("div"); el.id = "v3FeLive"; el.innerHTML = `<i></i><b></b>`; host.appendChild(el); }
  const E = l3feE(), fi = Number(E.fadeIn) || 0, fo = Number(E.fadeOut) || 0; let fa = 0;
  if (fi > 0 && s < fi) fa = Math.max(fa, 1 - s / fi); if (fo > 0 && s > sec - fo) fa = Math.max(fa, 1 - (sec - s) / fo);
  el.firstChild.style.background = E.fadeCol === "#ffffff" ? "#fff" : "#000"; el.firstChild.style.opacity = l3feClamp(fa, 0, 1);
  const t = el.lastChild, show = tm && tm.hold && tm.hold.text;
  t.textContent = show ? tm.hold.text : ""; t.style.opacity = show ? l3feClamp(tm.hs / 0.5, 0, 1) * l3feClamp((tm.hold.sec - tm.hs) / 0.5, 0, 1) : 0; el.style.background = show ? "rgba(15,23,42,.5)" : "transparent";
}
function l3feLiveEnd() { const el = document.getElementById("v3FeLive"); if (el) el.remove(); }
const l3feFilter = () => (L3FE_LOOKS[l3feE().look] || L3FE_LOOKS[""])[1] || "none";
/* Bildformat: "auto" = vyns eget format i renderingsläget (inspelningen fångar exakt det du ser), annars 16:9. */
function l3feRatio() {
  const a = l3feE().aspect;
  if (a === "auto") { if (typeof l3rv !== "undefined" && l3rv.on && typeof l3 !== "undefined" && l3 && l3.renderer) { const c = l3.renderer.domElement; if (c.clientWidth && c.clientHeight) return c.clientWidth / c.clientHeight; } return 16 / 9; }
  return L3FE_ASPECT[a] || 16 / 9;
}
const l3feW = H => Math.max(2, Math.round(H * l3feRatio() / 2) * 2);

/* ---- Kamera ------------------------------------------------------------------------------------------ */
/* Jämn kamerabana: Catmull–Rom genom vyerna (i stället för en mjuk stopp vid varje vy). */
function l3feCamSpline(keys, T, i, u) {
  const g = k => keys[Math.max(0, Math.min(keys.length - 1, k))], cr = (p0, p1, p2, p3, x) => 0.5 * (2 * p1 + (-p0 + p2) * x + (2 * p0 - 5 * p1 + 4 * p2 - p3) * x * x + (-p0 + 3 * p1 - 3 * p2 + p3) * x * x * x);
  const f = key => [0, 1, 2].map(j => cr(g(i - 1)[key][j], g(i)[key][j], g(i + 1)[key][j], g(i + 2)[key][j], u));
  return { p: f("p"), t: f("t") };
}
const l3feCamMode = () => l3feE().cam || "smooth";
/* Vyer som skapas av en färdig rörelse – dagarna fördelas jämnt mellan Från och Till (eller huvudet och Till). */
async function l3feMove(kind) {
  const f = l3feFilm(), c = l3plCam(), tg = c.t, off = c.p.map((v, i) => v - tg[i]), dist = Math.hypot(off[0], off[1], off[2]) || 30;
  const d0 = l3feDate(Math.min(l3feHead(), l3plDate(f.to || l3plDay()).getTime() - L3FE_DAY)), d1 = f.to && f.to > d0 ? f.to : l3gaAdd(d0, 30), t0 = l3plDate(d0).getTime(), t1 = l3plDate(d1).getTime(), days = Math.round((t1 - t0) / L3FE_DAY);
  let n = { orbit: 12, orbit180: 7, in: 2, out: 2, slide: 2, crane: 2 }[kind] || 2; n = Math.max(2, Math.min(n, days + 1));
  const keys = [], R = (a, v) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]], at = (i, p, t, nm) => keys.push({ date: l3plIso(new Date(t0 + Math.round(days * i / (n - 1)) * L3FE_DAY)), name: nm, p: p.map(v => Math.round(v * 1000) / 1000), t: t.map(v => Math.round(v * 1000) / 1000) });
  const names = { orbit: "Omloppsbana", orbit180: "Halv omloppsbana", in: "Inkörning", out: "Utkörning", slide: "Sidoglid", crane: "Kranåkning" };
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) : 0, nm = `${names[kind]} ${i + 1}`;
    if (kind === "orbit" || kind === "orbit180") { const o = R(u * (kind === "orbit" ? 2 * Math.PI : Math.PI), off); at(i, [tg[0] + o[0], tg[1] + o[1], tg[2] + o[2]], tg, nm); }
    else if (kind === "in") at(i, tg.map((v, j) => v + off[j] * (1 - 0.65 * u)), tg, nm);
    else if (kind === "out") at(i, tg.map((v, j) => v + off[j] * (0.35 + 0.65 * u)), tg, nm);
    else if (kind === "slide") { const h = Math.hypot(off[0], off[1]) || 1, rx = off[1] / h, ry = -off[0] / h, s = (u - 0.5) * dist * 1.1; at(i, [c.p[0] + rx * s, c.p[1] + ry * s, c.p[2]], [tg[0] + rx * s, tg[1] + ry * s, tg[2]], nm); }
    else if (kind === "crane") at(i, [c.p[0], c.p[1], c.p[2] + u * dist * 0.9], [tg[0], tg[1], tg[2]], nm);
  }
  if (l3plKeys().length && typeof uiConfirm === "function" && !(await uiConfirm(`Ersätta dina ${l3plKeys().length} kameravyer med rörelsen "${names[kind]}" (${n} vyer)?`))) return;
  l3plKeysSet(keys); l3feSet({ cam: kind.startsWith("orbit") ? "spline" : "smooth" }, false);
  l3Status(`${names[kind]}: ${n} vyer från ${keys[0].date} till ${keys[keys.length - 1].date}. Stäng av eller justera i Kamera.`); l3fsRender();
}
function l3feShift(days) {
  const head = l3feDate(l3feHead()), sh = d => l3plIso(new Date(l3plDate(d).getTime() + days * L3FE_DAY));
  l3plKeysSet(l3plKeys().map(k => (k.date > head ? { ...k, date: sh(k.date) } : k)));
  if (typeof placements !== "undefined") { let any = false; if (typeof placeSnapshot === "function") placeSnapshot(); placements.forEach(p => { if (Array.isArray(p.anim) && p.anim.some(k => k.date > head)) { p.anim = p.anim.map(k => (k.date > head ? { ...k, date: sh(k.date) } : k)).sort((a, b) => a.date.localeCompare(b.date)); any = true; if (typeof placeTouch === "function") placeTouch(p); } }); if (any && typeof l3fsRender === "function") l3animApply(l3fs.t); }
  l3Status(`Alla vyer och objektnycklar efter ${head} flyttades ${days > 0 ? "+" : ""}${days} dagar.`); l3fsRender();
}
function l3feEven() {
  const ks = l3plKeys(); if (ks.length < 3) { l3Status("Minst tre vyer behövs för att fördela dem jämnt.", true); return; }
  const a = l3plDate(ks[0].date).getTime(), b = l3plDate(ks[ks.length - 1].date).getTime();
  l3plKeysSet(ks.map((k, i) => ({ ...k, date: l3plIso(new Date(a + Math.round((b - a) / L3FE_DAY * i / (ks.length - 1)) * L3FE_DAY)) }))); l3Status("Vyerna fördelades jämnt mellan första och sista."); l3fsRender();
}
function l3feCopyKey() {
  const head = l3feDate(l3feHead()), ks = l3plKeys().filter(k => k.date < head), src = ks.length ? ks[ks.length - 1] : l3plKeys()[0];
  if (!src) { l3Status("Det finns ingen vy att kopiera – lägg en med ＋ Vy.", true); return; }
  l3plKeysSet([...l3plKeys().filter(k => k.date !== head), { ...src, date: head, name: (src.name || "Vy") + " (kopia)" }]); l3Status(`Vyn "${src.name || src.date}" kopierades till ${head}.`); l3fsRender();
}
function l3feJump(dir) {
  const head = l3feDate(l3feHead()), all = [...l3plKeys().map(k => k.date), ...(l3feE().markers || []).map(m => m.date)].sort(), d = dir > 0 ? all.find(x => x > head) : [...all].reverse().find(x => x < head);
  if (!d) { l3Status(dir > 0 ? "Inga fler vyer eller markörer framåt." : "Inga vyer eller markörer bakåt."); return; }
  l3fsSeek(l3plDate(d).getTime());
}

/* ---- Mallar ------------------------------------------------------------------------------------------ */
const L3FE_TEMPLATES = {
  quick: ["Snabb överblick, 20 s", { sec: 20, edit: { ease: "inout", fadeIn: 0.8, fadeOut: 0.8, holds: [], aspect: "16:9", cam: "smooth" } }],
  present: ["Presentation med titel, 45 s", { sec: 45, edit: { ease: "inout", fadeIn: 1, fadeOut: 1.2, aspect: "16:9", cam: "spline", holds: "title" } }],
  story: ["Stående 9:16, 25 s (Stories/mobil)", { sec: 25, edit: { ease: "inout", fadeIn: 0.6, fadeOut: 0.6, holds: [], aspect: "9:16", cam: "smooth" } }],
  slow: ["Långsam byggtidslinje, 90 s", { sec: 90, edit: { ease: "lin", fadeIn: 1.5, fadeOut: 1.5, holds: [], aspect: "16:9", cam: "smooth" } }],
};
async function l3feTemplate(id) {
  const tp = L3FE_TEMPLATES[id]; if (!tp) return; const f = l3feFilm(), edit = { ...tp[1].edit };
  if (edit.holds === "title") { const cap = typeof uiPrompt === "function" ? await uiPrompt("Titel på inledningen (lämna tomt för projektets namn):", f.caption || "") : f.caption || ""; if (cap === null) return; const from = f.from || l3plDay(), to = f.to || from; edit.holds = [{ date: from, sec: 3, text: cap || (typeof projectName !== "undefined" ? projectName : "Projektet") }, { date: to, sec: 3, text: "Slut" }]; }
  l3plSet("film", { ...f, sec: tp[1].sec, edit: { ...l3feE(), ...edit } }); l3feRender(); l3feGuide(); l3Status(`Mall: ${tp[0]}.`);
}

/* ---- Bildruta-guide: visar vad som kommer med i filmen ----------------------------------------------- */
function l3feGuide() {
  const host = document.getElementById("v3Canvas"); let el = document.getElementById("v3FeGuide");
  if (!host || !l3fsOn() || !l3feE().guide) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("div"); el.id = "v3FeGuide"; host.appendChild(el); }
  const w = host.clientWidth, h = host.clientHeight, r = l3feRatio(); let gw = w, gh = w / r; if (gh > h) { gh = h; gw = h * r; }
  Object.assign(el.style, { left: ((w - gw) / 2) + "px", top: ((h - gh) / 2) + "px", width: gw + "px", height: gh + "px" });
}
window.addEventListener("resize", () => { if (typeof l3fsOn === "function" && l3fsOn()) { l3feGuide(); l3fePlace(); } });

/* ---- Menyn ------------------------------------------------------------------------------------------- */
const l3feUi = { open: null };
function l3fePlace() {
  const el = document.getElementById("v3FilmEdit"), st = document.getElementById("v3FilmStrip"), host = document.getElementById("v3Canvas"); if (!el || !st || !host) return;
  el.style.bottom = Math.max(8, host.clientHeight - st.offsetTop + 8) + "px";
}
function l3feRender() {
  const host = document.getElementById("v3Canvas"); let el = document.getElementById("v3FilmEdit");
  if (!host || !l3fsOn() || !document.getElementById("v3FilmStrip")) { if (el) el.remove(); l3feGuide(); return; }
  const E = l3feE(), f = l3feFilm(), esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"), phone = typeof lowMemDevice !== "undefined" && lowMemDevice;
  if (!el) { el = document.createElement("div"); el.id = "v3FilmEdit"; el.className = "v3-fe v3-vp"; host.appendChild(el); ["pointerdown", "wheel", "contextmenu", "dblclick", "click", "keydown"].forEach(t => el.addEventListener(t, e => e.stopPropagation())); }
  const sec = Number(f.sec) || 20, open = l3feUi.open !== null ? l3feUi.open : (phone ? "" : "tid"), head = l3feDate(l3feHead());
  const secs = [["tid", "⏱ Tid och titlar"], ["kam", "🎥 Kamera"], ["vis", "▶ Uppspelning och bild"], ["mark", "🚩 Markörer"], ["mall", "✨ Mallar"]];
  const sel = (id, v, opts) => `<select id="${id}">${opts.map(([k, t]) => `<option value="${k}"${String(v) === String(k) ? " selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
  const body = {
    tid: `<label>Tidskurva ${sel("feEase", E.ease, Object.entries(L3FE_EASE).map(([k, v]) => [k, v[0]]))}</label>
      <div class="fe-row"><label>Längd (s)<input id="feSec" type="number" min="3" max="600" step="1" value="${sec}" /></label><label>Tona in (s)<input id="feFi" type="number" min="0" max="10" step="0.5" value="${E.fadeIn}" /></label><label>Tona ut (s)<input id="feFo" type="number" min="0" max="10" step="0.5" value="${E.fadeOut}" /></label></div>
      <label>Tonar till ${sel("feFc", E.fadeCol, [["#000000", "Svart"], ["#ffffff", "Vit"]])}</label>
      <div class="fe-row"><label>Spela in från<input id="feFrom" type="date" value="${esc(f.from || "")}" /></label><label>till<input id="feTo" type="date" value="${esc(f.to || "")}" /></label></div>
      <div class="fe-row"><button type="button" data-fe="from" title="Filmen börjar på datumet där huvudet står">Från = huvudet</button><button type="button" data-fe="to" title="Filmen slutar på datumet där huvudet står">Till = huvudet</button></div>
      <div class="fe-sub">Pauser och titelkort (${(E.holds || []).length})</div>
      <div class="fe-list">${(E.holds || []).map((h, i) => `<div class="fe-it"><b>${esc(h.date)}</b> ${esc(h.sec)} s${h.text ? ` · ${esc(h.text.slice(0, 22))}` : ""}<button type="button" data-fe="holdx" data-i="${i}" title="Ta bort">✕</button></div>`).join("") || '<div class="fe-note">Inga. Filmen står stilla vid ett datum i några sekunder – med eller utan text.</div>'}</div>
      <div class="fe-row"><button type="button" data-fe="hold" title="Paus vid datumet där huvudet står (${head})">＋ Paus här</button><button type="button" data-fe="holdt" title="Paus med titeltext (titelkort)">＋ Titelkort här</button></div>`,
    kam: `<div class="fe-sub">Färdiga kamerarörelser (från huvudet till Till – ersätter vyerna)</div>
      <div class="fe-grid"><button type="button" data-fe="mv" data-k="orbit">⟳ Omloppsbana 360°</button><button type="button" data-fe="mv" data-k="orbit180">◔ Halv omloppsbana</button><button type="button" data-fe="mv" data-k="in">⤢ Inkörning</button><button type="button" data-fe="mv" data-k="out">⤡ Utkörning</button><button type="button" data-fe="mv" data-k="slide">⇄ Sidoglid</button><button type="button" data-fe="mv" data-k="crane">⇧ Kranåkning</button></div>
      <label>Kamerabana ${sel("feCam", E.cam, [["smooth", "Mjuk stopp vid varje vy"], ["linear", "Jämn takt mellan vyer"], ["spline", "Slät kurva genom vyerna"]])}</label>
      <div class="fe-sub">Vyer (${l3plKeys().length})</div>
      <div class="fe-grid"><button type="button" data-fe="copyk">⧉ Kopiera vy hit</button><button type="button" data-fe="even">⇔ Fördela jämnt</button><button type="button" data-fe="prevk">⏮ Förra vyn</button><button type="button" data-fe="nextk">⏭ Nästa vyn</button><button type="button" data-fe="sh" data-d="-1">◂ Efter huvudet −1 d</button><button type="button" data-fe="sh" data-d="1">▸ Efter huvudet +1 d</button><button type="button" data-fe="sh" data-d="-7">◂◂ −1 v</button><button type="button" data-fe="sh" data-d="7">▸▸ +1 v</button></div>
      <button type="button" data-fe="clearK" class="fe-danger">Ta bort alla vyer</button>`,
    vis: `<div class="fe-row"><label>Hastighet ${sel("feSp", E.speed, [[0.25, "0,25×"], [0.5, "0,5×"], [1, "1×"], [2, "2×"], [4, "4×"]])}</label><label>Bildformat ${sel("feAs", E.aspect, [["auto", "Som vyn (render) / 16:9"], ...Object.keys(L3FE_ASPECT).map(k => [k, k])])}</label></div>
      <label class="fe-chk"><input id="feLoop" type="checkbox"${E.loop ? " checked" : ""} /> Upprepa uppspelningen (loop)</label>
      <label class="fe-chk"><input id="feGuide" type="checkbox"${E.guide ? " checked" : ""} /> Visa bildruta (det som kommer med i filmen)</label>
      <label>Filmfilter ${sel("feLook", E.look, Object.entries(L3FE_LOOKS).map(([k, v]) => [k, v[0]]))}</label>
      <div class="fe-note">Hastigheten gäller förhandsvisningen, inte inspelningen. Filter kräver Chrome/Edge.</div>`,
    mark: `<div class="fe-list">${(E.markers || []).map((m, i) => `<div class="fe-it"><button type="button" class="fe-go" data-fe="mgo" data-i="${i}">🚩 ${esc(m.date)} · ${esc(m.name)}</button><button type="button" data-fe="mx" data-i="${i}" title="Ta bort">✕</button></div>`).join("") || '<div class="fe-note">Inga markörer. Lägg flaggor vid viktiga datum – de syns på tidslinjen och går att hoppa mellan.</div>'}</div>
      <div class="fe-row"><button type="button" data-fe="madd">＋ Markör vid huvudet</button><button type="button" data-fe="prevk">⏮</button><button type="button" data-fe="nextk">⏭</button></div>`,
    mall: `<div class="fe-grid1">${Object.entries(L3FE_TEMPLATES).map(([k, v]) => `<button type="button" data-fe="tp" data-k="${k}">${esc(v[0])}</button>`).join("")}</div><div class="fe-note">En mall sätter längd, tidskurva, tona, bildformat och kamerabana. Dina vyer ändras inte.</div>`,
  };
  const was = el.querySelector(".fe-body") ? el.querySelector(".fe-body").scrollTop : 0;
  el.className = "v3-fe v3-vp" + (E.open ? "" : " min"); const clAll = el.querySelector(":scope > .cl-all");
  el.innerHTML = `<div class="fe-h"><b>🎞 Filmredigering</b><span>${esc(head)}</span><button type="button" data-fe="dock" title="Docka till högermenyn (samma som Docka i övre raden)">📌</button><button type="button" data-fe="tog" title="${E.open ? "Fäll ihop" : "Fäll ut"}">${E.open ? "▾" : "▴"}</button></div>
    ${E.open ? `<div class="fe-body">${secs.map(([k, t]) => `<div class="fe-sec${open === k ? " on" : ""}"><button type="button" class="fe-st" data-fe="sec" data-k="${k}" aria-expanded="${open === k}">${t}<i>${open === k ? "▾" : "▸"}</i></button>${open === k ? `<div class="fe-c">${body[k]}</div>` : ""}</div>`).join("")}</div>` : ""}`;
  if (clAll) { el.prepend(clAll); if (typeof lclUpdate === "function") lclUpdate(el); }
  const b = el.querySelector(".fe-body"); if (b) b.scrollTop = was;
  l3feBind(el); l3fePlace(); l3feGuide();
}
function l3feBind(el) {
  const q = s => el.querySelector(s), f = () => l3feFilm();
  const num = (id, key) => { const e = q(id); if (e) e.onchange = () => l3feSet({ [key]: Number(e.value) || 0 }); };
  const val = (id, key, cv = v => v) => { const e = q(id); if (e) e.onchange = () => l3feSet({ [key]: cv(e.value) }); };
  val("#feEase", "ease"); val("#feFc", "fadeCol"); val("#feCam", "cam"); val("#feAs", "aspect"); val("#feLook", "look"); val("#feSp", "speed", Number); num("#feFi", "fadeIn"); num("#feFo", "fadeOut");
  [["#feFrom", "from"], ["#feTo", "to"]].forEach(([id, k]) => { const e = q(id); if (e) e.onchange = () => { const fl = f(), v = e.value; if (!v) return; const nf = { ...fl, [k]: v }; if (nf.from && nf.to && nf.to < nf.from) { if (typeof l3Status === "function") l3Status("Till-datumet kan inte ligga före Från-datumet.", true); l3feRender(); return; } l3plSet("film", nf); l3fsRender(); l3Status(`Filmen spelas in ${nf.from || "…"} – ${nf.to || "…"}.`); }; });
  const sc = q("#feSec"); if (sc) sc.onchange = () => { l3plSet("film", { ...f(), sec: l3feClamp(Number(sc.value) || 20, 3, 600) }); l3feRender(); };
  const lp = q("#feLoop"); if (lp) lp.onchange = () => l3feSet({ loop: lp.checked }, false);
  const gd = q("#feGuide"); if (gd) gd.onchange = () => l3feSet({ guide: gd.checked }, false);
  el.onclick = async e => {
    const b = e.target.closest("[data-fe]"); if (!b) return; const a = b.dataset.fe, E = l3feE(), head = l3feDate(l3feHead());
    if (a === "dock") { if (typeof l3dkToggle === "function") l3dkToggle(); }
    else if (a === "tog") l3feSet({ open: !E.open });
    else if (a === "sec") { l3feUi.open = l3feUi.open === b.dataset.k ? "" : b.dataset.k; l3feRender(); }
    else if (a === "from" || a === "to") { const fl = f(); l3plSet("film", { ...fl, [a]: head }); l3fsRender(); l3Status(`Filmen ${a === "from" ? "börjar" : "slutar"} ${head}.`); }
    else if (a === "hold" || a === "holdt") {
      let text = ""; if (a === "holdt") { const t = typeof uiPrompt === "function" ? await uiPrompt("Text på titelkortet (Enter = ny rad går inte, skriv / för radbrytning):", "") : ""; if (t === null) return; text = String(t).replace(/\s*\/\s*/g, "\n"); }
      l3feSet({ holds: [...(E.holds || []).filter(h => h.date !== head), { date: head, sec: a === "holdt" ? 3 : 2, ...(text ? { text } : {}) }].sort((x, y) => x.date.localeCompare(y.date)).slice(0, 20) });
    }
    else if (a === "holdx") l3feSet({ holds: (E.holds || []).filter((_, i) => i !== +b.dataset.i) });
    else if (a === "mv") await l3feMove(b.dataset.k);
    else if (a === "copyk") l3feCopyKey();
    else if (a === "even") l3feEven();
    else if (a === "sh") l3feShift(+b.dataset.d);
    else if (a === "prevk") l3feJump(-1);
    else if (a === "nextk") l3feJump(1);
    else if (a === "clearK") { if (!l3plKeys().length || typeof uiConfirm !== "function" || await uiConfirm(`Ta bort alla ${l3plKeys().length} kameravyer?`)) { l3plKeysSet([]); l3fsRender(); } }
    else if (a === "madd") { const nm = typeof uiPrompt === "function" ? await uiPrompt("Namn på markören:", "Milstolpe") : "Markör"; if (nm === null) return; l3feSet({ markers: [...(E.markers || []).filter(m => m.date !== head), { date: head, name: String(nm).trim() || "Markör" }].sort((x, y) => x.date.localeCompare(y.date)).slice(0, 60) }); l3fsRender(); }
    else if (a === "mx") { l3feSet({ markers: (E.markers || []).filter((_, i) => i !== +b.dataset.i) }); l3fsRender(); }
    else if (a === "mgo") { const m = (E.markers || [])[+b.dataset.i]; if (m) l3fsSeek(l3plDate(m.date).getTime()); }
    else if (a === "tp") await l3feTemplate(b.dataset.k);
  };
}
/* Markörer och pauser som flaggor på tidslinjen (läggs till efter varje ritning av tidslinjen). */
function l3feStripExtras() {
  const st = document.getElementById("v3FilmStrip"), track = st && st.querySelector("#v3FsTrack"); if (!track) return;
  track.querySelectorAll(".fe-flag").forEach(n => n.remove());
  const [t0, t1] = l3fsRange(), W = parseFloat(getComputedStyle(track).getPropertyValue("--w")) || track.clientWidth, E = l3feE();
  [...(E.markers || []).map(m => ({ d: m.date, tx: m.name, c: "#ef4444" })), ...(E.holds || []).map(h => ({ d: h.date, tx: `Paus ${h.sec} s${h.text ? ": " + h.text.slice(0, 20) : ""}`, c: "#0ea5e9" }))].forEach(m => {
    const u = (l3plDate(m.d).getTime() - t0) / (t1 - t0); if (u < 0 || u > 1) return;
    const i = document.createElement("i"); i.className = "fe-flag"; i.style.left = (u * W) + "px"; i.style.setProperty("--c", m.c); i.title = m.tx; i.dataset.t = m.tx; track.appendChild(i);
  });
}
function l3feSync() { l3feRender(); l3feStripExtras(); }
(function () {   // menyn följer tidslinjen: öppnas, ritas om och stängs tillsammans med den
  if (typeof l3fsRender === "function") { const f = l3fsRender; l3fsRender = function () { const r = f.apply(this, arguments); try { l3feSync(); } catch (e) { /* menyn är ett tillägg */ } return r; }; }
  if (typeof l3fsPlayhead === "function") { const f = l3fsPlayhead; l3fsPlayhead = function () { const r = f.apply(this, arguments); const h = document.querySelector("#v3FilmEdit .fe-h span"); if (h) h.textContent = l3feDate(l3feHead()); return r; }; }
})();
