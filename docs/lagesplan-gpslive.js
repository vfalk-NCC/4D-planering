/* Lägesplan – min position i realtid (Victors önskemål 2026-10-02), som i
   Google Maps: en blå prick med noggrannhetscirkel (och riktning när man rör
   sig). Startas med 📍 i touchläget. Första trycket startar och följer
   positionen; panorerar man slutar den följa – tryck 📍 igen för att centrera,
   och en gång till för att stänga av. GPS (WGS84) räknas om till planens
   koordinater som för foton (gpsToModel i lagesplan-gps.js). */

let gpsLive = null; // { watch, follow, pos: { m, acc, heading, speed }, selfMove }

/* Meddelanden syns även i touchläget (statusraden ligger i den dolda menyn). */
let gpsToastTimer = 0;
function gpsNotice(msg, ms = 4500) {
  setSaveStatus(msg);
  let t = $("gpsToast");
  if (!t) { t = document.createElement("div"); t.id = "gpsToast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add("show");
  clearTimeout(gpsToastTimer);
  gpsToastTimer = setTimeout(() => t.classList.remove("show"), ms);
}
/* Ungefärligt avstånd (km) från positionen till planen (kalibreringspunkten). */
function gpsKmFromPlan(lat, lon) {
  if (!plan || !plan.calib || typeof SWEREF_ZONES === "undefined") return null;
  const ref = plan.calib.model[0];
  let best = null;
  SWEREF_ZONES.forEach(z => { const [N, E] = geodeticToGrid(lat, lon, z); const d = Math.hypot(E - ref[0], N - ref[1]); if (best == null || d < best) best = d; });
  return best == null ? null : best / 1000;
}
function gpsLiveEl() {
  let el = $("gpsMe");
  if (!el) {
    el = document.createElement("div");
    el.id = "gpsMe"; el.className = "hidden";
    el.innerHTML = `<div class="gm-acc"></div><div class="gm-head"></div><div class="gm-dot"></div>`;
    $("viewport").appendChild(el);
  }
  return el;
}
/* Prickens läge på skärmen (anropas när positionen eller vyn ändras). */
function placeGpsLive() {
  const el = $("gpsMe");
  if (!el) return;
  if (!gpsLive || !gpsLive.pos || !plan || !viewport) { el.classList.add("hidden"); return; }
  const { m, acc, heading, speed } = gpsLive.pos;
  const p = stageToScreen(mToPx(m));
  const pe = stageToScreen(mToPx([m[0] + 1, m[1]])), pn = stageToScreen(mToPx([m[0], m[1] + 1]));
  const pxPerM = Math.hypot(pe[0] - p[0], pe[1] - p[1]);
  el.classList.remove("hidden");
  el.style.left = p[0] + "px"; el.style.top = p[1] + "px";
  const r = Math.max(10, (acc || 0) * pxPerM);
  const a = el.querySelector(".gm-acc");
  a.style.width = a.style.height = 2 * r + "px";
  a.style.display = acc ? "" : "none";
  // Riktning: norr på skärmen + kompassriktningen.
  const hd = el.querySelector(".gm-head");
  if (heading != null && Number.isFinite(heading) && (speed == null || speed > 0.4)) {
    const north = Math.atan2(pn[0] - p[0], -(pn[1] - p[1])) * 180 / Math.PI;
    hd.style.display = ""; hd.style.transform = `translate(-50%, -100%) rotate(${north + heading}deg)`;
  } else hd.style.display = "none";
}
function centerOnGps() {
  if (!gpsLive || !gpsLive.pos) return;
  const s = mToPx(gpsLive.pos.m), r = $("viewport").getBoundingClientRect();
  const q = rotAbout([r.width / 2, r.height / 2], -(view.rot || 0));
  gpsLive.selfMove = true;
  view.tx = q[0] - s[0] * view.scale; view.ty = q[1] - s[1] * view.scale;
  applyView();
  gpsLive.selfMove = false;
}
function updateGpsBtn() {
  const b = $("btnFieldGps");
  if (!b) return;
  b.classList.toggle("on", !!gpsLive);
  b.classList.toggle("gps-follow", !!(gpsLive && gpsLive.follow));
  const acc = gpsLive && gpsLive.pos && gpsLive.pos.acc;
  if (document.body.classList.contains("phone")) {
    // Som i Apple Kartor: pil (fylld när den följer dig).
    const fill = gpsLive && gpsLive.follow ? "currentColor" : "none";
    b.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="${fill}" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 3.5 3.5 10.6l7.4 2.5 2.5 7.4 7.1-17z"/></svg>`;
  } else b.textContent = gpsLive ? (gpsLive.pos ? `📍 ±${acc ? Math.round(acc) : "?"} m` : "📍 …") : "📍";
  b.title = !gpsLive ? "Visa min position (GPS)" : gpsLive.follow ? "Följer din position – tryck för att stänga av" : "Tryck för att centrera på din position";
  if (acc) b.title = `±${Math.round(acc)} m – ` + b.title;
}
function stopGpsLive(msg) {
  if (gpsLive && gpsLive.watch != null && navigator.geolocation) navigator.geolocation.clearWatch(gpsLive.watch);
  gpsLive = null;
  placeGpsLive(); updateGpsBtn();
  if (msg) gpsNotice(msg, 7000);
}
function startGpsLive() {
  if (!navigator.geolocation) { alert("Den här enheten eller webbläsaren kan inte visa positionen."); return; }
  if (!plan || !plan.calib) { alert("Planen är inte kalibrerad mot 3D-modellen, så positionen kan inte visas på den. Kalibrera under Zoner."); return; }
  gpsLiveEl();
  gpsLive = { watch: null, follow: true, pos: null, first: true };
  updateGpsBtn();
  gpsNotice("📍 Hämtar din position…", 20000);
  gpsLive.watch = navigator.geolocation.watchPosition(p => {
    if (!gpsLive) return;
    const g = gpsToModel(p.coords.latitude, p.coords.longitude);
    if (!g) {
      const km = gpsKmFromPlan(p.coords.latitude, p.coords.longitude);
      const far = km == null ? "" : km >= 10 ? ` (ca ${Math.round(km / 10) * 10 >= 100 ? (Math.round(km / 10) * 10).toLocaleString("sv-SE") : Math.round(km)} km bort)` : "";
      stopGpsLive(`📍 Du är inte i närheten av planen${far} – positionen kan inte visas.`);
      return;
    }
    gpsLive.pos = { m: g.m, acc: p.coords.accuracy, heading: p.coords.heading, speed: p.coords.speed };
    if (gpsLive.follow) centerOnGps(); else placeGpsLive();
    if (gpsLive.first) { gpsLive.first = false; gpsNotice(`📍 Din position (±${Math.round(p.coords.accuracy || 0)} m)`, 3000); }
    updateGpsBtn();
  }, err => {
    const why = err.code === 1 ? "Platsåtkomst nekades – tillåt plats för sidan i webbläsarens inställningar." : err.code === 3 ? "Positionen dröjer – prova utomhus." : "Kunde inte hämta positionen.";
    if (err.code === 3 && gpsLive && gpsLive.pos) return; // tillfälligt avbrott: behåll senaste
    stopGpsLive("📍 " + why);
    if (err.code === 1) alert(why);
  }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
}
function onGpsBtn() {
  if (!gpsLive) { startGpsLive(); return; }
  if (!gpsLive.follow) { gpsLive.follow = true; centerOnGps(); updateGpsBtn(); return; }
  stopGpsLive("📍 Positionen visas inte längre.");
}
document.addEventListener("DOMContentLoaded", () => {
  const b = $("btnFieldGps");
  if (b) b.onclick = onGpsBtn;
  // Vyn ändras: pricken följer med; panorerar man själv slutar den följa.
  const av = applyView;
  applyView = function () {
    const r = av.apply(this, arguments);
    if (gpsLive) {
      if (!gpsLive.selfMove && gpsLive.follow && gpsLive.pos) { gpsLive.follow = false; updateGpsBtn(); }
      placeGpsLive();
    }
    return r;
  };
  // Lämnar man touchläget eller byter plan stängs positionen av.
  if (typeof setFieldMode === "function") { const sf = setFieldMode; setFieldMode = function (on) { if (!on && gpsLive) stopGpsLive(); return sf.apply(this, arguments); }; }
  const op = openPlan; openPlan = async function () { if (gpsLive) stopGpsLive(); return op.apply(this, arguments); };
});
