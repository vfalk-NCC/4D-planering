/* Lägesplan – väder i dagsplaneringen (Victors önskemål 2026-10-01).
   Prognosen hämtas från SMHI:s öppna data (fri att använda, källa SMHI) för
   projektets plats: kalibreringspunkten i SWEREF 99 räknas om till lat/lon.
   Ingenting matas in eller sparas per dag – vädret visas i dagspanelen,
   veckovyn och dagbladet, och ger varningar bara när det spelar roll:
     - byvind över gränsen (standard 10 m/s) när lyft, mobilkran eller pump är inbokad
     - minusgrader när betong är inbokad (betongbil/pump)
     - kraftigt regn (minst 10 mm) när betong är inbokad
   Prognosen räcker ca 10 dagar framåt; passerade dagar visas utan väder.
   Inställningar (koordinatsystem och vindgräns) sparas i projektet som
   { type: "wxset" } i site_layers.json. */

const WX_ID = "wxset";
const WX_URLS = (lat, lon) => [
  `https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/${lon}/lat/${lat}/data.json`,
  `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/${lon}/lat/${lat}/data.json`,
];
const WX_CACHE_KEY = "lagesplan-weather";
const WX_MAX_AGE = 60 * 60 * 1000; // en timme
const WX_SYMBOLS = [null,
  ["☀️", "Klart"], ["🌤", "Nästan klart"], ["⛅", "Växlande molnighet"], ["⛅", "Halvklart"], ["🌥", "Molnigt"], ["☁️", "Mulet"], ["🌫", "Dimma"],
  ["🌦", "Lätta regnskurar"], ["🌦", "Regnskurar"], ["🌧", "Kraftiga regnskurar"], ["⛈", "Åskskurar"],
  ["🌨", "Lätta byar av snöblandat regn"], ["🌨", "Byar av snöblandat regn"], ["🌨", "Kraftiga byar av snöblandat regn"],
  ["🌨", "Lätta snöbyar"], ["🌨", "Snöbyar"], ["❄️", "Kraftiga snöbyar"],
  ["🌧", "Lätt regn"], ["🌧", "Regn"], ["🌧", "Kraftigt regn"], ["⛈", "Åska"],
  ["🌨", "Lätt snöblandat regn"], ["🌨", "Snöblandat regn"], ["🌨", "Kraftigt snöblandat regn"],
  ["🌨", "Lätt snöfall"], ["❄️", "Snöfall"], ["❄️", "Kraftigt snöfall"]];

// ---------------------------------------------------------------------
// SWEREF 99 -> WGS84 (Lantmäteriets formler, omvänd Gauss–Krüger)
// ---------------------------------------------------------------------
function gridToGeodetic(N, E, z) {
  const a = 6378137, f = 1 / 298.257222101, e2 = f * (2 - f), n = f / (2 - f);
  const ar = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
  const d1 = n / 2 - 2 * n * n / 3 + 37 * n ** 3 / 96 - n ** 4 / 360, d2 = n * n / 48 + n ** 3 / 15 - 437 * n ** 4 / 1440;
  const d3 = 17 * n ** 3 / 480 - 37 * n ** 4 / 840, d4 = 4397 * n ** 4 / 161280;
  const As = e2 + e2 ** 2 + e2 ** 3 + e2 ** 4, Bs = -(7 * e2 ** 2 + 17 * e2 ** 3 + 30 * e2 ** 4) / 6;
  const Cs = (224 * e2 ** 3 + 889 * e2 ** 4) / 120, Ds = -(4279 * e2 ** 4) / 1260;
  const xi = N / (z.k0 * ar), eta = (E - z.FE) / (z.k0 * ar);
  const xp = xi - d1 * Math.sin(2 * xi) * Math.cosh(2 * eta) - d2 * Math.sin(4 * xi) * Math.cosh(4 * eta) - d3 * Math.sin(6 * xi) * Math.cosh(6 * eta) - d4 * Math.sin(8 * xi) * Math.cosh(8 * eta);
  const ep = eta - d1 * Math.cos(2 * xi) * Math.sinh(2 * eta) - d2 * Math.cos(4 * xi) * Math.sinh(4 * eta) - d3 * Math.cos(6 * xi) * Math.sinh(6 * eta) - d4 * Math.cos(8 * xi) * Math.sinh(8 * eta);
  const ps = Math.asin(Math.sin(xp) / Math.cosh(ep)), dl = Math.atan(Math.sinh(ep) / Math.cos(xp));
  const s = Math.sin(ps);
  const lat = ps + s * Math.cos(ps) * (As + Bs * s * s + Cs * s ** 4 + Ds * s ** 6);
  return [lat * 180 / Math.PI, z.lam0 + dl * 180 / Math.PI];
}

// ---------------------------------------------------------------------
// Inställningar (koordinatsystem, vindgräns)
// ---------------------------------------------------------------------
function wxSettings() {
  const s = (typeof siteItems !== "undefined" ? siteItems : []).find(x => x.id === WX_ID) || {};
  return { id: WX_ID, type: "wxset", zone: s.zone || "", gust: Number(s.gust) > 0 ? Number(s.gust) : 10, cold: Number.isFinite(Number(s.cold)) && s.cold !== "" && s.cold != null ? Number(s.cold) : 0, rain: Number(s.rain) > 0 ? Number(s.rain) : 10 };
}
/* Koordinatsystemet: valt i inställningarna, annars TM för stora östvärden
   och SWEREF 99 20 15 (projektets lokala zon) för små. */
function wxZone() {
  const name = wxSettings().zone;
  const z = SWEREF_ZONES.find(x => x.name === name);
  if (z) return z;
  const E = plan && plan.calib ? plan.calib.model[0][0] : 0;
  return E >= 255000 ? SWEREF_ZONES[0] : SWEREF_ZONES.find(x => x.name === "SWEREF 99 20 15");
}
function wxLatLon() {
  if (!plan || !plan.calib) return null;
  const [E, N] = plan.calib.model[0];
  if (!Number.isFinite(E) || !Number.isFinite(N) || N < 6000000 || N > 7800000) return null; // inte SWEREF 99 – ingen plats
  const [lat, lon] = gridToGeodetic(N, E, wxZone());
  return lat > 54 && lat < 70 && lon > 10 && lon < 25 ? [Math.round(lat * 1e4) / 1e4, Math.round(lon * 1e4) / 1e4] : null;
}

// ---------------------------------------------------------------------
// Hämtning och sammanställning per dag
// ---------------------------------------------------------------------
const wx = { days: new Map(), at: 0, key: "", loading: null, error: "" };
const stockholmParts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
function localDayHour(iso) {
  const p = Object.fromEntries(stockholmParts.formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return [`${p.year}-${p.month}-${p.day}`, Number(p.hour)];
}
/* Ett värde ur en prognospunkt – både det nya (snow1g: data-objekt) och
   det gamla formatet (pmp3g: parameters-lista). */
function wxVal(e, names) {
  for (const n of names) {
    if (e.data && e.data[n] != null) return Number(e.data[n]);
    const p = (e.parameters || []).find(x => x.name === n);
    if (p && p.values && p.values.length) return Number(p.values[0]);
  }
  return null;
}
/* SMHI:s tidsserie -> Map(dag -> { sym, tmin, tmax, ws, gust, prec }).
   Vind och väderikon räknas för arbetstid (06–18), temperatur och nederbörd för hela dygnet. */
function summarizeWeather(json) {
  const ts = (json && json.timeSeries) || [];
  const out = new Map();
  ts.forEach((e, i) => {
    const t = e.validTime || e.time;
    if (!t) return;
    const next = ts[i + 1] && (ts[i + 1].validTime || ts[i + 1].time);
    const hrs = next ? Math.min(12, Math.max(1, (new Date(next) - new Date(t)) / 3600000)) : 1;
    const [day, hour] = localDayHour(t);
    const d = out.get(day) || { tmin: Infinity, tmax: -Infinity, ws: 0, gust: 0, prec: 0, sym: null, symDist: 99, n: 0 };
    const temp = wxVal(e, ["air_temperature", "t"]), ws = wxVal(e, ["wind_speed", "ws"]), gust = wxVal(e, ["wind_speed_of_gust", "gust"]);
    const pr = wxVal(e, ["precipitation_amount_mean", "pmean"]), sym = wxVal(e, ["symbol_code", "Wsymb2"]);
    if (temp != null) { d.tmin = Math.min(d.tmin, temp); d.tmax = Math.max(d.tmax, temp); }
    if (pr != null && pr > 0) d.prec += pr * hrs;
    if (hour >= 6 && hour <= 18) {
      if (ws != null) d.ws = Math.max(d.ws, ws);
      if (gust != null) d.gust = Math.max(d.gust, gust);
    }
    if (sym != null && Math.abs(hour - 12) < d.symDist) { d.sym = Math.round(sym); d.symDist = Math.abs(hour - 12); }
    d.n++;
    out.set(day, d);
  });
  out.forEach((d, k) => { if (!Number.isFinite(d.tmin)) out.delete(k); else { d.prec = Math.round(d.prec * 10) / 10; delete d.symDist; } });
  return out;
}
async function loadWeather(force) {
  const ll = wxLatLon();
  if (!ll) { wx.error = plan && plan.calib ? "Projektets plats kunde inte räknas ut (är modellen i SWEREF 99?)." : ""; return; }
  const key = ll.join(",");
  if (!force && wx.key === key && Date.now() - wx.at < WX_MAX_AGE) return;
  if (!force) {
    try {
      const c = JSON.parse(localStorage.getItem(WX_CACHE_KEY) || "null");
      if (c && c.key === key && Date.now() - c.at < WX_MAX_AGE) { wx.days = new Map(c.days); wx.at = c.at; wx.key = key; wx.error = ""; return; }
    } catch (e) {}
  }
  if (wx.loading) return wx.loading;
  wx.loading = (async () => {
    let lastErr = null;
    for (const url of WX_URLS(ll[0], ll[1])) {
      try {
        const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 12000);
        const r = await fetch(url, { signal: ctl.signal });
        clearTimeout(tm);
        if (!r.ok) throw new Error("HTTP " + r.status);
        const days = summarizeWeather(await r.json());
        if (!days.size) throw new Error("tom prognos");
        Object.assign(wx, { days, at: Date.now(), key, error: "" });
        try { localStorage.setItem(WX_CACHE_KEY, JSON.stringify({ key, at: wx.at, days: [...days] })); } catch (e) {}
        return;
      } catch (e) { lastErr = e; }
    }
    wx.error = "Kunde inte hämta väderprognosen från SMHI" + (lastErr ? ` (${lastErr.message})` : "") + ".";
  })();
  try { await wx.loading; } finally {
    wx.loading = null;
    if (typeof renderDaySoon === "function") renderDaySoon(true);
    if (typeof renderZones === "function" && plan) renderZones();
  }
}
const weatherFor = day => wx.days.get(day) || null;

// ---------------------------------------------------------------------
// Visning
// ---------------------------------------------------------------------
const wxNum = v => (Math.round(v * 10) / 10).toLocaleString("sv-SE");
const wxSym = w => WX_SYMBOLS[w && w.sym] || ["🌡", "Prognos"];
function weatherText(w, emoji = true) {
  const [ic, txt] = wxSym(w);
  return `${emoji ? ic + " " : ""}${txt} ${Math.round(w.tmin)}–${Math.round(w.tmax)} °C · vind ${Math.round(w.ws)} (byar ${Math.round(w.gust)}) m/s${w.prec >= 0.1 ? ` · ${wxNum(w.prec)} mm` : ""}`;
}
function dayWeatherHtml(day) {
  if (!wx.at && !wx.loading && !wx.error && plan && plan.calib) loadWeather();
  const w = weatherFor(day), s = wxSettings();
  const warn = w && (w.gust >= s.gust || w.tmin < s.cold || w.prec >= s.rain);
  const body = w ? `<span${warn ? ' class="wx-warn"' : ""}>${escHtml(weatherText(w))}</span>`
    : wx.loading ? `<span class="muted">Hämtar väder…</span>`
    : wx.error ? `<span class="muted" title="${escHtml(wx.error)}">Väder saknas</span>`
    : wx.at ? `<span class="muted">Ingen prognos för dagen (ca 10 dagar framåt)</span>` : "";
  if (!body) return "";
  return `<div class="dp-wx">${body}<button type="button" class="dp-wxset icon ghost" data-wxset="1" title="Väderinställningar (vindgräns, koordinatsystem)">⚙</button></div>`;
}
function weekWeatherCell(day) {
  const w = weatherFor(day);
  if (!w) return "";
  const s = wxSettings(), warn = w.gust >= s.gust || w.tmin < s.cold || w.prec >= s.rain;
  return `<span title="${escHtml(weatherText(w, false))}"${warn ? ' class="wx-warn"' : ""}>${wxSym(w)[0]}<br>${Math.round(w.tmax)}°</span>`;
}
function weatherPdfLine(day) { const w = weatherFor(day); return w ? `Väder (SMHI): ${weatherText(w, false)}` : ""; }

/* Varningar till krocklistan (lagesplan-daily.js). */
function weatherIssues(day, { lifts, dels }) {
  const w = weatherFor(day), s = wxSettings(), out = [];
  if (!w) return out;
  const pt = x => x.type === "delivery" ? [rectGeom(x).cx, rectGeom(x).cy] : x.pts[0];
  const windy = [...lifts, ...dels.filter(d => d.veh === "mobilkran" || d.veh === "pumpbil")];
  if (w.gust >= s.gust && windy.length) {
    const what = windy.map(x => x.type === "lift" ? `lyft ${x.time || ""}`.trim() : `${(VEHICLES[x.veh] || {}).label || ""} ${x.time || ""}`.trim()).join(", ");
    out.push({ sev: "varning", ids: windy.map(x => x.id), text: `Byar upp till ${Math.round(w.gust)} m/s (gräns ${s.gust}) – ${what}`, pt: pt(windy[0]) });
  }
  const conc = dels.filter(d => d.veh === "betongbil" || d.veh === "pumpbil");
  if (conc.length && w.tmin < s.cold) out.push({ sev: "varning", ids: conc.map(x => x.id), text: `Gjutning i kyla: ner till ${Math.round(w.tmin)} °C`, pt: pt(conc[0]) });
  if (conc.length && w.prec >= s.rain) out.push({ sev: "varning", ids: conc.map(x => x.id), text: `Gjutning i regn: ${wxNum(w.prec)} mm väntas`, pt: pt(conc[0]) });
  return out;
}

// ---------------------------------------------------------------------
// Inställningar (liten ruta i dagspanelen)
// ---------------------------------------------------------------------
function openWeatherSettings(anchor) {
  const s = wxSettings(), cur = wxZone();
  let box = document.getElementById("wxSetBox");
  if (box) { box.remove(); return; }
  box = document.createElement("div");
  box.id = "wxSetBox"; box.className = "wx-set";
  const ll = wxLatLon();
  box.innerHTML = `
    <div class="row2"><div><label>Vindgräns för lyft (byar, m/s)</label><input type="text" inputmode="decimal" class="wx-gust" value="${escHtml(s.gust)}" /></div>
      <div><label>Kyla vid gjutning under (°C)</label><input type="text" inputmode="decimal" class="wx-cold" value="${escHtml(s.cold)}" /></div></div>
    <label>Regn vid gjutning från (mm/dygn)</label><input type="text" inputmode="decimal" class="wx-rain" value="${escHtml(s.rain)}" />
    <label>Modellens koordinatsystem</label><select class="wx-zone">${SWEREF_ZONES.map(z => `<option${z.name === cur.name ? " selected" : ""}>${escHtml(z.name)}</option>`).join("")}</select>
    <div class="muted" style="margin-top:4px;">${ll ? `Plats: ${ll[0].toLocaleString("sv-SE")}° N, ${ll[1].toLocaleString("sv-SE")}° Ö` : "Platsen kunde inte räknas ut."} · Prognos från SMHI.</div>
    <div class="row split" style="margin-top:6px;"><button type="button" class="wx-save primary">Spara</button><button type="button" class="wx-reload">↻ Hämta igen</button><button type="button" class="wx-close">Stäng</button></div>`;
  anchor.closest(".dp-wx").after(box);
  const num = (c, d) => { const v = Number(String(box.querySelector(c).value).replace(",", ".")); return Number.isFinite(v) ? v : d; };
  box.querySelector(".wx-close").onclick = () => box.remove();
  box.querySelector(".wx-reload").onclick = () => { box.remove(); loadWeather(true); };
  box.querySelector(".wx-save").onclick = async () => {
    const zoneChanged = box.querySelector(".wx-zone").value !== cur.name;
    const rec = { ...s, gust: Math.max(1, num(".wx-gust", 10)), cold: num(".wx-cold", 0), rain: Math.max(0.1, num(".wx-rain", 10)), zone: box.querySelector(".wx-zone").value, updated_at: new Date().toISOString() };
    box.remove();
    await saveSiteItem(rec, false, { record: false });
    if (zoneChanged) { wx.at = 0; wx.key = ""; loadWeather(true); }
    renderDaySoon(true); renderZones();
  };
}
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("[data-wxset]");
  if (b) { e.preventDefault(); openWeatherSettings(b); }
});
document.addEventListener("DOMContentLoaded", () => {
  // Ny plan (annan kalibrering/plats): hämta prognosen för den.
  const orig = openPlan;
  openPlan = async function () { const r = await orig.apply(this, arguments); loadWeather(); return r; };
});

// ---------------------------------------------------------------------
// Väder på planen (Victors önskemål 2026-10-02): en ruta för dagens eller
// veckans väder som dras in på planen och följer med i utskrifter. Följer
// valt datum. Ligger på lagret "Väder" (kan släckas inför en utskrift).
// ---------------------------------------------------------------------
const WX_EMOJI_FONT = `"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
function finishWxTool() {
  const kind = siteTool.kind, pt = siteTool.pts[siteTool.pts.length - 1];
  stopSiteTool();
  const rec = { id: ghNewId(), type: kind, name: "", pts: [[Math.round(pt[0] * 1000) / 1000, Math.round(pt[1] * 1000) / 1000]], layer: "Väder", created_at: new Date().toISOString(), by: settings.userName || null };
  ls("ul:Väder").visible = true; saveLayerState();
  selectedSiteId = rec.id;
  saveSiteItem(rec);
  if (!wx.at && !wx.loading) loadWeather();
  if (typeof renderDaySoon === "function") renderDaySoon();
}
function drawWxBox(ctx, x, fontPx, selected) {
  if (!x.pts || !x.pts[0]) return;
  const fs = siteStyle(x, fontPx).fs * 1.3, p = mToPx(x.pts[0]), day = curDay(), s = wxSettings();
  const head = x.color || "#1e40af", warnC = "#c2410c", F = (w, k) => `${w} ${fs * k}px "Segoe UI", Arial, sans-serif`;
  ctx.save(); ctx.setLineDash([]); ctx.textBaseline = "middle";
  const pad = fs * 0.5, hh = fs * 1.2;
  let W, H, body;
  if (x.type === "wxday") {
    const w = weatherFor(day);
    const lines = w ? [[wxSym(w)[1], F(700, 0.85), "#111827"], [`${Math.round(w.tmin)}–${Math.round(w.tmax)} °C`, F(800, 1.05), w.tmin < s.cold ? warnC : "#111827"],
      [`Vind ${Math.round(w.ws)} (byar ${Math.round(w.gust)}) m/s`, F(500, 0.72), w.gust >= s.gust ? warnC : "#374151"], [w.prec >= 0.1 ? `Nederbörd ${wxNum(w.prec)} mm` : "Uppehåll", F(500, 0.72), w.prec >= s.rain ? warnC : "#374151"]]
      : [[wx.loading ? "Hämtar väder…" : wx.error ? "Väder saknas" : "Ingen prognos för dagen", F(500, 0.75), "#6b7280"]];
    const ic = w ? fs * 2.2 : 0;
    const tw = Math.max(...lines.map(l => { ctx.font = l[1]; return ctx.measureText(l[0]).width; }));
    ctx.font = F(700, 0.62); const hw = ctx.measureText(`VÄDER · ${dayShort(day).toUpperCase()}`).width + fs * 2.2;
    W = Math.max(hw, ic + tw + pad * 3); H = hh + pad + lines.length * fs * 1.15 + pad * 0.6;
    body = (bx, by) => {
      if (w) { ctx.font = `${ic * 0.8}px ${WX_EMOJI_FONT}`; ctx.textAlign = "center"; ctx.fillStyle = "#111827"; ctx.fillText(wxSym(w)[0], bx + pad + ic / 2, by + hh + (H - hh) / 2); }
      ctx.textAlign = "left";
      lines.forEach((l, i) => { ctx.font = l[1]; ctx.fillStyle = l[2]; ctx.fillText(l[0], bx + pad * (w ? 2 : 1) + ic, by + hh + pad + fs * 0.55 + i * fs * 1.15); });
    };
    x._wxHead = `VÄDER · ${dayShort(day).toUpperCase()}`;
  } else {
    const mon = weekStart(day), days = [0, 1, 2, 3, 4, 5, 6].map(i => addDays(mon, i)).filter((d, i) => i < 5 || weatherFor(d));
    const cw = fs * 3.3, rows = fs * 5.3;
    W = days.length * cw + pad * 2; H = hh + rows + pad * 0.5;
    body = (bx, by) => {
      days.forEach((d, i) => {
        const w = weatherFor(d), cx = bx + pad + i * cw + cw / 2, top = by + hh;
        if (d === day) { ctx.fillStyle = "rgba(37,99,235,.10)"; roundRect(ctx, cx - cw / 2 + fs * 0.08, top + fs * 0.12, cw - fs * 0.16, rows - fs * 0.12, fs * 0.25); ctx.fill(); }
        ctx.textAlign = "center";
        ctx.font = F(700, 0.62); ctx.fillStyle = isWeekend(d) ? "#9ca3af" : "#374151";
        ctx.fillText(`${WEEKDAYS_SV[dayDate(d).getDay()]} ${dayDate(d).getDate()}`, cx, top + fs * 0.65);
        if (!w) { ctx.font = F(500, 0.7); ctx.fillStyle = "#9ca3af"; ctx.fillText("–", cx, top + fs * 2.4); return; }
        ctx.font = `${fs * 1.35}px ${WX_EMOJI_FONT}`; ctx.fillStyle = "#111827"; ctx.fillText(wxSym(w)[0], cx, top + fs * 1.75);
        ctx.font = F(800, 0.8); ctx.fillStyle = "#111827"; ctx.fillText(`${Math.round(w.tmax)}°`, cx, top + fs * 2.85);
        ctx.font = F(500, 0.62); ctx.fillStyle = w.tmin < s.cold ? warnC : "#6b7280"; ctx.fillText(`${Math.round(w.tmin)}°`, cx, top + fs * 3.55);
        ctx.fillStyle = w.gust >= s.gust ? warnC : "#374151"; ctx.font = F(w.gust >= s.gust ? 800 : 500, 0.6); ctx.fillText(`${Math.round(w.gust)} m/s`, cx, top + fs * 4.25);
        ctx.fillStyle = w.prec >= s.rain ? warnC : "#2563eb"; ctx.font = F(w.prec >= s.rain ? 800 : 500, 0.6); ctx.fillText(w.prec >= 0.1 ? `${wxNum(w.prec)} mm` : "", cx, top + fs * 4.9);
      });
    };
    x._wxHead = `VÄDER · VECKA ${dayWeekNo(day)}`;
  }
  const bx = p[0] - W / 2, by = p[1] - H / 2, r = fs * 0.35;
  ctx.shadowColor = "rgba(15,23,42,.25)"; ctx.shadowBlur = fs * 0.4; ctx.shadowOffsetY = fs * 0.08;
  roundRect(ctx, bx, by, W, H, r); ctx.fillStyle = "rgba(255,255,255,.96)"; ctx.fill();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.save(); roundRect(ctx, bx, by, W, H, r); ctx.clip(); ctx.fillStyle = head; ctx.fillRect(bx, by, W, hh); ctx.restore();
  roundRect(ctx, bx, by, W, H, r); ctx.lineWidth = Math.max(1, fs * 0.07); ctx.strokeStyle = head; ctx.stroke();
  ctx.font = F(700, 0.62); ctx.fillStyle = "#fff"; ctx.textAlign = "left"; ctx.fillText(x._wxHead + (x.locked ? " 🔒" : ""), bx + pad, by + hh / 2);
  ctx.textAlign = "right"; ctx.font = F(500, 0.52); ctx.fillText("SMHI", bx + W - pad, by + hh / 2);
  delete x._wxHead;
  body(bx, by);
  if (selected) { const o = fs * 0.3; roundRect(ctx, bx - o, by - o, W + o * 2, H + o * 2, r + o); ctx.setLineDash([fs * 0.35, fs * 0.22]); ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = Math.max(1.5, fs * 0.1); ctx.stroke(); }
  ctx.restore();
  if (ctx.canvas && ctx.canvas.id === "topCanvas" && typeof dailyBoxes !== "undefined") dailyBoxes.set(x.id, [{ x: p[0], y: p[1], w: W, h: H }]);
}
