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
