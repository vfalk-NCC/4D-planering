/* Lägesplan – dagsplanering med underentreprenörer (Victors önskemål 2026-10-01:
   "planera det dagliga arbetet med UE och kunna flytta runt", ersätter
   whiteboard och Excel. Bara Victor ändrar.)

   Allt sparas som vanliga poster i site_layers.json (samma ångra/gör om,
   lager "Dagsplanering", syns i utskrifter):
     { type: "ue" }        – UE-registret: namn, förkortning, färg, kontakt, telefon
     { type: "crew" }      – ett arbetslag på planen: ue, pts: [[x, y]], persons
                             (valfritt), actual (utfall), task, act (aktivitet i
                             4D-planeringen = objFamKey), from/to (hela dagar),
                             note, log (rapporterad framdrift)
     { type: "delivery" }  – leverans: veh (fordon), cx/cy/w/h/rot, time, what, ue
     { type: "lift" }      – lyft: pts: [[lyftpunkt]], crane (id), load (t), time,
                             what, ue, zone (riskområde, m)
   Lag/leveranser/lyft följer alltid datumet (gäller från–till, hela dagar).
   Krockar räknas fram för dagen: två UE i samma zon, i en avspärrning, på en
   transportväg, inom kranens räckvidd när ett lyft är bokat, i riskområdet
   under ett lyft, där ett fordon ställer upp, och aktiviteter som väntar på
   något som inte är klart. Fordonen har riktiga ritningar sedda uppifrån
   (hytt, flak, trumma, bom, stödben) – även symbolerna under Etablering. */

const DAILY_TYPES = new Set(["crew", "delivery", "lift"]);
const isDaily = x => !!x && DAILY_TYPES.has(x.type);
const DAILY_LAYER = "Dagsplanering";
const UE_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#9333ea", "#ea580c", "#0891b2", "#ca8a04", "#db2777", "#4f46e5", "#059669", "#78350f", "#334155"];
const WEEKDAYS_SV = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];
const WEEKDAYS_LONG = ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"];
const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
const SEV_COLOR = { krock: "#dc2626", varning: "#f59e0b", info: "#64748b" };
const SEV_RANK = { krock: 3, varning: 2, info: 1 };

/* Fordon sedda uppifrån (meter: bredd × längd, stödbenens bredd, räckvidd). */
const VEHICLES = {
  betongbil:   { label: "Betongbil",        icon: "🚚", w: 2.55, h: 10,   color: "#b45309" },
  pumpbil:     { label: "Betongpump",       icon: "🚚", w: 2.55, h: 12,   color: "#b45309", outrigger: 9, reach: 36 },
  mobilkran:   { label: "Mobilkran",        icon: "🏗", w: 2.75, h: 13,   color: "#d97706", outrigger: 7.5, reach: 40 },
  lastbil:     { label: "Lastbil (flak)",   icon: "🚛", w: 2.55, h: 12,   color: "#475569" },
  semi:        { label: "Semitrailer",      icon: "🚛", w: 2.6,  h: 16.5, color: "#475569" },
  kranbil:     { label: "Kranbil",          icon: "🚛", w: 2.55, h: 10,   color: "#0369a1", reach: 15 },
  lastvaxlare: { label: "Lastväxlare",      icon: "🚛", w: 2.55, h: 9,    color: "#0f766e" },
  skapbil:     { label: "Skåpbil",          icon: "🚐", w: 2.1,  h: 6.5,  color: "#64748b" },
};

// ---------------------------------------------------------------------
// Datum
// ---------------------------------------------------------------------
const curDay = () => $("dateInput").value || todayIso();
const dayDate = iso => new Date(iso + "T12:00:00");
const dayShort = iso => { const d = dayDate(iso); return `${WEEKDAYS_SV[d.getDay()]} ${d.getDate()} ${MONTHS_SV[d.getMonth()]}`; };
const dayLong = iso => { const d = dayDate(iso); return `${WEEKDAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_SV[d.getMonth()]} ${d.getFullYear()}`; };
function dayWeekNo(iso) {
  const d = dayDate(iso), t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dn = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dn);
  return Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7);
}
const weekStart = iso => addDays(iso, -((dayDate(iso).getDay() + 6) % 7));
const isWeekend = iso => [0, 6].includes(dayDate(iso).getDay());
function nextWorkday(iso, dir = 1) { let d = addDays(iso, dir); while (isWeekend(d)) d = addDays(d, dir); return d; }
const activeOn = (x, day) => (!x.from || x.from <= day) && (!x.to || x.to >= day);
const dr3 = v => Math.round(v * 1000) / 1000;
const dclone = o => JSON.parse(JSON.stringify(o));
const escRe = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------------------------------------------------------------------
// UE-registret
// ---------------------------------------------------------------------
const ues = () => siteItems.filter(x => x.type === "ue").sort((a, b) => (a.short || a.name || "").localeCompare(b.short || b.name || "", "sv"));
const ueById = id => (id && siteItems.find(x => x.type === "ue" && x.id === id)) || null;
const ueColor = ue => (ue && ue.color) || "#0f766e";
const ueShort = ue => ue ? (ue.short || String(ue.name || "").slice(0, 4).toUpperCase() || "UE") : "Lag";
function ueForContractor(c) {
  const s = String(c || "").toLowerCase().trim();
  if (!s) return null;
  return ues().find(u => {
    const n = String(u.name || "").toLowerCase().trim(), k = String(u.short || "").toLowerCase().trim();
    return (n && (s.includes(n) || n.includes(s))) || (k.length >= 2 && new RegExp(`(^|[^a-zåäö0-9])${escRe(k)}($|[^a-zåäö0-9])`).test(s));
  }) || null;
}
function nextUeColor() {
  const used = new Set(ues().map(u => (u.color || "").toLowerCase()));
  return UE_COLORS.find(c => !used.has(c)) || UE_COLORS[ues().length % UE_COLORS.length];
}

/* Utseende på lagen (Victors önskemål 2026-10-02): storlek och opacitet för
   alla lag, sparas i projektet ({ type: "dayset" }) så utskrifterna blir lika. */
const DAYSET_ID = "dayset";
function daySettings() {
  const s = siteItems.find(x => x.id === DAYSET_ID) || {};
  return { id: DAYSET_ID, type: "dayset", crewScale: Number(s.crewScale) > 0 ? Number(s.crewScale) : 1, crewOpacity: Number(s.crewOpacity) > 0 ? Math.min(1, Number(s.crewOpacity)) : 1 };
}
function setDaySettingsLocal(rec) {
  const i = siteItems.findIndex(x => x.id === DAYSET_ID);
  if (i >= 0) siteItems[i] = rec; else siteItems.push(rec);
}

// ---------------------------------------------------------------------
// Aktiviteter i 4D-planeringen (samma "familj" som släckningen: grupp,
// källa från 4-veckorsplaneringen eller enskild rad).
// ---------------------------------------------------------------------
let famCache = null, famCacheFor = null, famCacheLen = -1, famById = null;
function families() {
  if (famCacheFor !== items || famCacheLen !== items.length) {
    famCache = new Map(); famById = new Map();
    items.forEach(it => { const k = objFamKey(it); if (!famCache.has(k)) famCache.set(k, []); famCache.get(k).push(it); famById.set(it.id, it); });
    famCacheFor = items; famCacheLen = items.length;
  }
  return famCache;
}
const famRows = key => (key && families().get(key)) || [];
const rowDone = r => r.status === "klar" || (Number(r.progress) || 0) >= 100;
function famInfo(key, day) {
  const rows = famRows(key);
  if (!rows.length) return null;
  const it = rows[0];
  const starts = rows.map(r => r.start_date).filter(Boolean).sort(), ends = rows.map(r => r.end_date).filter(Boolean).sort();
  return {
    key, rows, title: it.activity || it.object_name || "Aktivitet", area: it.area || "", contractor: it.contractor || "",
    object: rows.length === 1 && it.activity && it.object_name ? it.object_name : "", objects: rows.length,
    phase: zonePhase(rows, day), progress: zoneProgress(rows) || 0,
    start: starts[0] || null, end: ends[ends.length - 1] || null, done: rows.every(rowDone),
  };
}
function famBlockers(rows) {
  families();
  const own = new Set(rows.map(r => r.id)), out = [];
  rows.forEach(r => (r.depends_on || []).forEach(id => {
    const d = famById.get(id);
    if (d && !own.has(id) && !rowDone(d) && !out.includes(d)) out.push(d);
  }));
  return out;
}
/* Mitten av aktivitetens 3D-objekt (modellkoordinater), om positionerna är hämtade. */
function famCenter(rows) {
  const ids = new Set(rows.map(r => r.id));
  const ps = (positions || []).filter(p => ids.has(p.id) && Number.isFinite(p.x) && Number.isFinite(p.y));
  return ps.length ? [ps.reduce((a, p) => a + p.x, 0) / ps.length, ps.reduce((a, p) => a + p.y, 0) / ps.length] : null;
}

// ---------------------------------------------------------------------
// Plats: zon, kranar
// ---------------------------------------------------------------------
function zoneAtModel(m) {
  if (!m || !plan || !plan.calib) return null;
  const p = modelToPdf(m[0], m[1]), zs = plan.zones || [];
  for (let i = zs.length - 1; i >= 0; i--) if ((zs[i].polys || []).some(poly => pointInPoly(p, poly))) return zs[i];
  return null;
}
function dailyPt(x) {
  if (x.type === "delivery") { const g = rectGeom(x); return [g.cx, g.cy]; }
  return x.pts && x.pts[0];
}
const placeOf = x => { const z = zoneAtModel(dailyPt(x)); return z ? String(z.code || "") : ""; };
const dayItems = (day, types = DAILY_TYPES) => siteItems.filter(x => types.has(x.type) && activeOn(x, day));

/* Lokala y-koordinaten (meter längs fordonet, fram = +) för bommens vridpunkt. */
function vehicleTurretLocal(kind, L) {
  const hl = L / 2, cabL = Math.min(2.4, L * 0.25);
  return kind === "pumpbil" ? hl - cabL - 1.5 : kind === "mobilkran" ? -hl + 3.6 : kind === "kranbil" ? hl - cabL - 0.75 : null;
}
function vehicleTurret(kind, g) {
  const ly = vehicleTurretLocal(kind, g.h);
  if (ly == null) return [g.cx, g.cy];
  return [g.cx - ly * Math.sin(g.rot), g.cy + ly * Math.cos(g.rot)];
}
function liftCranes(day) {
  const out = [];
  siteItems.filter(x => x.type === "crane" && x.pts && activeOn(x, day)).forEach(x => out.push({
    id: x.id, name: x.name || "Kran", pt: x.pts[0], reach: craneRadius(x), chart: parseChart(x.chart),
    cap: Number(String(x.capacity || "").replace(",", ".")) || null }));
  siteItems.filter(x => ((x.type === "delivery" && x.veh === "mobilkran") || (x.type === "symbol" && x.sym === "mobilkran")) && activeOn(x, day)).forEach(x => {
    out.push({ id: x.id, name: x.name || x.what || "Mobilkran", pt: vehicleTurret("mobilkran", rectGeom(x)), reach: Number(x.reach) || VEHICLES.mobilkran.reach,
      chart: parseChart(x.chart), cap: Number(String(x.capacity || "").replace(",", ".")) || null, mobile: true });
  });
  return out;
}
const capAt = (cr, dist) => cr.chart.length ? ((cr.chart.find(c => c.r >= dist - 1e-9) || {}).t ?? 0) : cr.cap;
const fmtT = v => Number(v).toLocaleString("sv-SE", { maximumFractionDigits: 2 });
const numIn = v => { const n = Number(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
function liftInfo(x, day = curDay()) {
  const cranes = liftCranes(day), p = x.pts[0];
  const d2 = c => Math.hypot(c.pt[0] - p[0], c.pt[1] - p[1]);
  const cr = cranes.find(c => c.id === x.crane) || cranes.slice().sort((a, b) => d2(a) - d2(b))[0];
  if (!cr) return { crane: null, bad: "ingen kran placerad den här dagen" };
  const dist = d2(cr), cap = capAt(cr, dist), load = numIn(x.load);
  let bad = "";
  if (dist > cr.reach + 0.01) bad = `utanför räckvidden (${fmtM(dist)} m, ${cr.name} når ${fmtM(cr.reach)} m)`;
  else if (load && cap && load > cap) bad = `för tungt: ${fmtT(load)} t, ${cr.name} klarar ${fmtT(cap)} t på ${fmtM(dist)} m`;
  return { crane: cr, dist, cap, load, bad };
}

// ---------------------------------------------------------------------
// Krockar och varningar för en dag
// ---------------------------------------------------------------------
function dailyName(x) {
  if (x.type === "crew") return ueShort(ueById(x.ue));
  if (x.type === "delivery") return x.what || (VEHICLES[x.veh] || {}).label || "Leveransen";
  return `Lyftet${x.time ? " " + x.time : ""}${x.what ? " (" + x.what + ")" : ""}`;
}
function computeDailyIssues(day) {
  const list = [];
  const add = (sev, ids, text, pt) => list.push({ sev, ids, text, pt });
  const crews = siteItems.filter(x => x.type === "crew" && x.pts && activeOn(x, day));
  const dels = siteItems.filter(x => x.type === "delivery" && activeOn(x, day));
  const lifts = siteItems.filter(x => x.type === "lift" && x.pts && activeOn(x, day));
  const barriers = siteItems.filter(x => x.type === "barrier" && x.pts && x.pts.length > 2 && activeOn(x, day));
  const routes = siteItems.filter(x => x.type === "route" && x.pts && x.pts.length > 1 && activeOn(x, day));
  const nm = dailyName;
  // Två olika UE i samma zon (eller närmare än 6 m utanför zonerna).
  const zoneOf = new Map(crews.map(c => [c.id, zoneAtModel(c.pts[0])]));
  for (let i = 0; i < crews.length; i++) for (let j = i + 1; j < crews.length; j++) {
    const a = crews[i], b = crews[j];
    if ((a.ue || null) === (b.ue || null)) continue;
    const za = zoneOf.get(a.id), zb = zoneOf.get(b.id), d = Math.hypot(a.pts[0][0] - b.pts[0][0], a.pts[0][1] - b.pts[0][1]);
    const mid = [(a.pts[0][0] + b.pts[0][0]) / 2, (a.pts[0][1] + b.pts[0][1]) / 2];
    if (za && za === zb) add("varning", [a.id, b.id], `${nm(a)} och ${nm(b)} i samma zon (${za.code || "zon"})`, mid);
    else if (!za && !zb && d < 6) add("varning", [a.id, b.id], `${nm(a)} och ${nm(b)} jobbar nära varandra (${fmtM(d)} m)`, mid);
  }
  // Avspärrningar och transportvägar.
  crews.forEach(c => barriers.forEach(b => { if (pointInPoly(c.pts[0], b.pts)) add("krock", [c.id], `${nm(c)} står i avspärrningen ${b.name || "(utan namn)"}`, c.pts[0]); }));
  dels.forEach(dv => barriers.forEach(b => { if (pointInPoly(dailyPt(dv), b.pts)) add("krock", [dv.id], `${nm(dv)} står i avspärrningen ${b.name || "(utan namn)"}`, dailyPt(dv)); }));
  crews.forEach(c => routes.forEach(r => {
    const w = (Number(r.w) || 4) / 2 + 1;
    for (let i = 1; i < r.pts.length; i++) if (distToSeg(c.pts[0], r.pts[i - 1], r.pts[i]) < w) { add("varning", [c.id], `${nm(c)} står på transportvägen${r.name ? " " + r.name : ""}`, c.pts[0]); break; }
  }));
  // Lyft: kranens räckvidd/kapacitet, riskområdet under lasten och lag inom kranens räckvidd.
  const nearCrane = new Map(); // crew-id|kran-id -> { c, cr, times }
  lifts.forEach(l => {
    const inf = liftInfo(l, day);
    if (inf.bad) add("krock", [l.id], `${nm(l)}: ${inf.bad}`, l.pts[0]);
    const rz = Number(l.zone) || 5;
    crews.forEach(c => {
      const d = Math.hypot(c.pts[0][0] - l.pts[0][0], c.pts[0][1] - l.pts[0][1]);
      if (d < rz) add("krock", [c.id, l.id], `${nm(c)} står i riskområdet under ${nm(l).toLowerCase()}`, c.pts[0]);
      else if (inf.crane && Math.hypot(c.pts[0][0] - inf.crane.pt[0], c.pts[0][1] - inf.crane.pt[1]) <= inf.crane.reach) {
        const k = c.id + "|" + inf.crane.id;
        if (!nearCrane.has(k)) nearCrane.set(k, { c, cr: inf.crane, times: [] });
        nearCrane.get(k).times.push(l.time || "");
      }
    });
  });
  nearCrane.forEach(({ c, cr, times }) => {
    const t = times.filter(Boolean).sort();
    add("varning", [c.id], `${nm(c)} inom räckvidden för ${cr.name} – lyft bokat${t.length ? " " + t.join(", ") : " i dag"}`, c.pts[0]);
  });
  // Fordon som ställer upp (inkl. stödben) där ett lag står, och två leveranser på samma plats samtidigt.
  dels.forEach(dv => {
    const V = VEHICLES[dv.veh] || {}, g = rectGeom(dv);
    const fp = rectCorners({ ...g, w: Math.max(g.w, V.outrigger || 0) + 1, h: g.h + 1 });
    crews.forEach(c => { if (pointInPoly(c.pts[0], fp)) add("krock", [c.id, dv.id], `${nm(c)} står där ${(V.label || "fordonet").toLowerCase()} ställer upp${dv.time ? " " + dv.time : ""}`, c.pts[0]); });
  });
  for (let i = 0; i < dels.length; i++) for (let j = i + 1; j < dels.length; j++) {
    const a = dels[i], b = dels[j], ga = rectGeom(a), gb = rectGeom(b);
    if (a.time && a.time === b.time && Math.hypot(ga.cx - gb.cx, ga.cy - gb.cy) < Math.max(ga.h, gb.h) / 2 + 2) add("varning", [a.id, b.id], `Två leveranser på samma plats kl. ${a.time}`, [ga.cx, ga.cy]);
  }
  // Kopplade aktiviteter: beroenden som inte är klara, start senare, redan klar.
  crews.forEach(c => {
    if (!c.act) return;
    const inf = famInfo(c.act, day);
    if (!inf) { add("info", [c.id], `${nm(c)}: den kopplade aktiviteten finns inte längre i 4D-planeringen`, c.pts[0]); return; }
    const bl = famBlockers(inf.rows);
    if (bl.length) add("varning", [c.id], `${nm(c)}: ${inf.title} väntar på ${bl.slice(0, 3).map(b => b.activity || b.object_name || "?").join(", ")}${bl.length > 3 ? " m.fl." : ""} (inte klart)`, c.pts[0]);
    if (inf.done) add("info", [c.id], `${nm(c)}: ${inf.title} är redan klarmarkerad`, c.pts[0]);
    else if (inf.start && inf.start > day) add("info", [c.id], `${nm(c)}: ${inf.title} är planerad att starta ${shortDate(inf.start)}`, c.pts[0]);
  });
  if (typeof weatherIssues === "function") weatherIssues(day, { lifts, dels }).forEach(i => list.push(i));
  const byId = new Map();
  list.forEach(i => i.ids.forEach(id => {
    const cur = byId.get(id) || { sev: "info", texts: [] };
    if (SEV_RANK[i.sev] > SEV_RANK[cur.sev]) cur.sev = i.sev;
    cur.texts.push(i.text);
    byId.set(id, cur);
  }));
  list.sort((a, b) => SEV_RANK[b.sev] - SEV_RANK[a.sev]);
  return { list, byId, krock: list.filter(i => i.sev === "krock").length, varning: list.filter(i => i.sev === "varning").length, info: list.filter(i => i.sev === "info").length };
}
let dailyIssues = null;
let dailyBoxes = new Map(); // id -> [{ x, y, w, h }] i canvas-px (bara skärmen) – träffytor för lag och lyft
(function hookDraw() {
  const orig = drawSiteLayers;
  drawSiteLayers = function (ctx) {
    dailyIssues = computeDailyIssues(curDay());
    if (ctx && ctx.canvas && ctx.canvas.id === "topCanvas") dailyBoxes = new Map();
    return orig.apply(this, arguments);
  };
})();
const issueOf = id => (dailyIssues && dailyIssues.byId.get(id)) || null;
function dailyAt(p) {
  const vis = siteItems.filter(x => (x.type === "crew" || x.type === "lift" || x.type === "wxday" || x.type === "wxweek") && siteShown(x)).reverse();
  for (const x of vis) {
    const bs = dailyBoxes.get(x.id);
    if (bs && bs.some(b => Math.abs(p[0] - b.x) <= b.w / 2 && Math.abs(p[1] - b.y) <= b.h / 2)) return x;
  }
  return null;
}

// ---------------------------------------------------------------------
// Ritning: fordon sedda uppifrån
// ---------------------------------------------------------------------
/* Fordonets lokala ram (meter; x tvärs, y längs, fram = +y) -> canvas. */
function vehicleFrame(g) {
  const o = mToPx([g.cx, g.cy]);
  const X = mToPx([g.cx + Math.cos(g.rot), g.cy + Math.sin(g.rot)]), Y = mToPx([g.cx - Math.sin(g.rot), g.cy + Math.cos(g.rot)]);
  return [X[0] - o[0], X[1] - o[1], Y[0] - o[0], Y[1] - o[1], o[0], o[1]];
}
function drawVehicle(ctx, kind, g, color, o = {}) {
  const V = VEHICLES[kind] || VEHICLES.lastbil, ppm = o.ppm || pxPerMeter();
  if (!(ppm > 0)) return;
  const W = g.w, L = g.h, hw = W / 2, hl = L / 2, cabL = Math.min(2.4, L * 0.25);
  const dark = shade(color, -0.5), mid = shade(color, 0.3), light = shade(color, 0.78);
  const lw = 1.3 / ppm;
  ctx.save();
  ctx.setLineDash([]);
  ctx.transform(...vehicleFrame(g));
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  const box = (x0, y0, x1, y1, fill, r = 0.15, stroke = dark, w = lw) => {
    const bw = Math.abs(x1 - x0), bh = Math.abs(y1 - y0);
    roundRect(ctx, Math.min(x0, x1), Math.min(y0, y1), bw, bh, Math.max(0.001, Math.min(r, bw / 2, bh / 2)));
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.stroke(); }
  };
  const ln = (pts, stroke = dark, w = lw) => { ctx.beginPath(); pts.forEach(([a, b], i) => i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)); ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.stroke(); };
  const circ = (cx, cy, r, fill, stroke = dark, w = lw) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.stroke(); } };
  // Räckvidd (pump, kran) som tunn streckad cirkel.
  const ty = vehicleTurretLocal(kind, L);
  if (o.reach && ty != null) {
    ctx.setLineDash([1.6, 1.1]);
    circ(0, ty, o.reach, hexToRgba(color, 0.05), hexToRgba(color, 0.6), lw);
    ctx.setLineDash([]);
  }
  // Stödben med plattor och uppställningsytan.
  if (V.outrigger) {
    const S = V.outrigger / 2, ys = kind === "pumpbil" ? [hl - cabL - 0.7, -hl + 1.4] : [hl - cabL - 0.9, -hl + 1.1];
    ctx.setLineDash([0.6, 0.4]);
    box(-S - 0.45, ys[1] - 0.45, S + 0.45, ys[0] + 0.45, hexToRgba(color, 0.08), 0.2, hexToRgba(dark, 0.7), lw * 0.9);
    ctx.setLineDash([]);
    ys.forEach(y => [-1, 1].forEach(sd => { ln([[sd * hw * 0.7, y], [sd * S, y]], dark, 0.3); box(sd * S - 0.38, y - 0.38, sd * S + 0.38, y + 0.38, "#fde047", 0.06, dark); }));
  }
  // Hjul (sticker ut lite under karossen).
  const axles = kind === "semi" ? [hl - 1.2, hl - cabL - 1.0, -hl + 1.1, -hl + 2.4, -hl + 3.7]
    : kind === "skapbil" ? [hl - 1.1, -hl + 1.1] : L > 11 ? [hl - 1.3, -hl + 2.7, -hl + 1.3] : [hl - 1.3, -hl + 1.5];
  [...new Set(axles)].forEach(y => [-1, 1].forEach(sd => box(sd * (hw - 0.25), y - 0.52, sd * (hw + 0.14), y + 0.52, "#111827", 0.1, null)));
  // Kaross.
  if (kind === "skapbil") {
    box(-hw, -hl, hw, hl, light, 0.45);
    box(-hw, hl - 1.1, hw, hl, color, 0.45);
    box(-hw + 0.15, hl - 1.5, hw - 0.15, hl - 1.08, "#bfdbfe", 0.08);
    ln([[-hw + 0.35, -hl + 0.4], [-hw + 0.35, hl - 1.7]], mid, lw); ln([[hw - 0.35, -hl + 0.4], [hw - 0.35, hl - 1.7]], mid, lw);
  } else {
    const back = hl - cabL - 0.2; // bakom hytten
    if (kind === "betongbil") {
      box(-hw * 0.55, -hl, hw * 0.55, back, "#4b5563", 0.05, null);
      const y0 = -hl + 0.7, y1 = back - 0.15;
      box(-hw * 0.94, y0, hw * 0.94, y1, mid, hw * 0.9);
      ctx.save(); roundRect(ctx, -hw * 0.94, y0, hw * 1.88, y1 - y0, hw * 0.9); ctx.clip();
      for (let t = y0 - W; t < y1 + W; t += 0.95) ln([[-hw, t], [hw, t + 1.3]], dark, 0.16);
      ctx.restore();
      ln([[0, y0 + 0.4], [0, y1 - 0.4]], hexToRgba("#ffffff", 0.55), 0.18);
      ctx.beginPath(); ctx.moveTo(-0.4, y0 + 0.1); ctx.lineTo(0.4, y0 + 0.1); ctx.lineTo(0.22, -hl - 0.55); ctx.lineTo(-0.22, -hl - 0.55); ctx.closePath();
      ctx.fillStyle = dark; ctx.fill();
    } else if (kind === "pumpbil") {
      box(-hw, -hl, hw, back, light, 0.12);
      [-0.55, 0, 0.55].forEach(xo => box(xo - 0.2, -hl + 0.3, xo + 0.2, ty, xo === 0 ? color : mid, 0.08));
      circ(0, ty, 0.95, color); circ(0, ty, 0.35, dark, null);
      circ(0, -hl + 0.3, 0.22, dark, null);
    } else if (kind === "mobilkran") {
      box(-hw, -hl, hw, back, light, 0.12);
      box(-hw * 0.86, -hl + 0.2, hw * 0.86, -hl + 1.9, "#374151", 0.12);
      circ(0, ty, 1.3, mid);
      box(hw - 0.95, ty - 0.7, hw - 0.12, ty + 1.0, "#bfdbfe", 0.1);
      box(-0.45, ty, 0.45, hl + 1.0, color, 0.08);
      box(-0.32, ty + 2.2, 0.32, hl + 1.0, mid, 0.06);
      ln([[-0.32, ty + 4.4], [0.32, ty + 4.4]], dark, lw);
      box(-0.3, hl + 1.0, 0.3, hl + 1.55, "#facc15", 0.06);
    } else if (kind === "lastvaxlare") {
      box(-hw * 0.55, -hl, hw * 0.55, back, "#4b5563", 0.05, null);
      box(-hw * 0.98, -hl + 0.15, hw * 0.98, back - 0.3, light, 0.06);
      for (let y = -hl + 0.6; y < back - 0.5; y += 0.5) ln([[-hw * 0.98, y], [hw * 0.98, y]], mid, lw * 0.7);
      box(-0.3, back - 0.3, 0.3, back + 0.1, dark, 0.05, null);
    } else if (kind === "semi") {
      box(-hw * 0.6, back - 0.6, hw * 0.6, back + 0.2, "#374151", 0.05, null);
      box(-hw, -hl, hw, back - 0.45, light, 0.1);
      ln([[-hw + 0.4, -hl + 0.3], [-hw + 0.4, back - 0.8]], mid, lw); ln([[hw - 0.4, -hl + 0.3], [hw - 0.4, back - 0.8]], mid, lw);
      for (let y = -hl + 1.5; y < back - 1; y += 1.5) ln([[-hw + 0.4, y], [hw - 0.4, y]], mid, lw * 0.6);
    } else { // lastbil, kranbil: flak med plankor
      const bedTop = kind === "kranbil" ? back - 1.25 : back;
      box(-hw, -hl, hw, bedTop, light, 0.1);
      for (let y = -hl + 1; y < bedTop - 0.3; y += 1) ln([[-hw, y], [hw, y]], mid, lw * 0.7);
      box(-hw, bedTop - 0.15, hw, bedTop, dark, 0.02, null);
      if (kind === "kranbil") {
        box(-0.55, bedTop + 0.05, 0.55, back + 0.1, dark, 0.12, null);
        box(-0.28, -hl + 0.8, 0.28, ty, color, 0.1);
        circ(0, ty, 0.42, mid);
        circ(0, -hl + 0.8, 0.2, "#facc15");
      }
    }
    // Hytt med vindruta och backspeglar.
    box(-hw, hl - cabL, hw, hl, color, 0.35);
    box(-hw + 0.2, hl - 0.65, hw - 0.2, hl - 0.22, "#bfdbfe", 0.1);
    box(-hw + 0.3, hl - cabL + 0.3, hw - 0.3, hl - 0.9, mid, 0.12, null);
    [-1, 1].forEach(sd => box(sd * hw, hl - 1.0, sd * (hw + 0.28), hl - 0.82, dark, 0.03, null));
  }
  ctx.restore();
}
/* Etiketten under fordonet (på skärmen), inte mitt över ritningen. */
function vehicleLabelPt(g, fs, extraW = 0) {
  const P = rectCorners({ ...g, w: Math.max(g.w, extraW) }).map(mToPx);
  const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, Math.max(...ys) + fs * 1.4];
}
function outlineRect(ctx, g, extraW, color, fs, dashed) {
  const P = rectCorners({ ...g, w: Math.max(g.w, extraW) + 0.6, h: g.h + 0.6 }).map(mToPx);
  ctx.save();
  ctx.beginPath(); P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath();
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, fs / 8); ctx.setLineDash(dashed ? [fs / 2, fs / 3] : []); ctx.stroke();
  ctx.restore();
}
/* Symbolerna Betongbil/Betongpump/Mobilkran m.fl. under Etablering ritas som fordon. */
function drawVehicleSymbol(ctx, x, fontPx, ppm, selected) {
  const V = VEHICLES[x.sym];
  if (!V) return false;
  const st = siteStyle(x, fontPx), g = rectGeom(x);
  drawVehicle(ctx, x.sym, g, x.color || V.color, { ppm, reach: selected && V.reach ? V.reach : 0 }); // räckvidden bara när fordonet är markerat
  if (selected) outlineRect(ctx, g, V.outrigger || 0, "#0b5fff", fontPx, true);
  siteLabel(ctx, x, vehicleLabelPt(g, st.fs, V.outrigger || 0), `${V.icon} ${x.name || V.label}${x.locked ? " 🔒" : ""}`, st.fs, "rgba(255,255,255,.92)", "#111827", null, datesText(x));
  return true;
}

// ---------------------------------------------------------------------
// Ritning: lag, leveranser, lyft
// ---------------------------------------------------------------------
function drawDailyItem(ctx, x, fontPx, ppm, selected) {
  if (x.type === "crew") drawCrew(ctx, x, fontPx, selected);
  else if (x.type === "delivery") drawDelivery(ctx, x, fontPx, ppm, selected);
  else if (x.type === "lift") drawLift(ctx, x, fontPx, ppm, selected);
}
function crewTitle(x) { const ue = ueById(x.ue); return `${ueShort(ue)}${x.persons ? " ×" + x.persons : ""}`; }
function drawCrew(ctx, x, fontPx, selected) {
  if (!x.pts || !x.pts[0]) return;
  const ue = ueById(x.ue), color = ueColor(ue), fg = contrastText(color);
  const ds = daySettings();
  const fs = siteStyle(x, fontPx).fs * 1.2 * ds.crewScale;
  const p = mToPx(x.pts[0]);
  const iss = issueOf(x.id), bad = iss && iss.sev !== "info";
  const act = x.act ? famInfo(x.act, curDay()) : null;
  const title = crewTitle(x);
  let sub = x.task || (act ? act.title : "") || (ue && ue.short ? ue.name || "" : "");
  if (sub.length > 28) sub = sub.slice(0, 27) + "…";
  ctx.save(); ctx.setLineDash([]); ctx.globalAlpha *= ds.crewOpacity;
  const F1 = `800 ${fs * 0.9}px "Segoe UI", Arial, sans-serif`, F2 = `500 ${fs * 0.6}px "Segoe UI", Arial, sans-serif`;
  ctx.font = F1; const tw = ctx.measureText(title).width;
  ctx.font = F2; const sw = sub ? ctx.measureText(sub).width : 0;
  const dot = act ? fs * 0.62 : 0, pad = fs * 0.45;
  const w = Math.max(tw + dot, sw) + pad * 2, h = fs * (sub ? 1.8 : 1.24) + (act ? fs * 0.32 : 0);
  const bx = p[0] - w / 2, by = p[1] - h / 2, r = fs * 0.38;
  ctx.shadowColor = "rgba(15,23,42,.35)"; ctx.shadowBlur = fs * 0.45; ctx.shadowOffsetY = fs * 0.1;
  roundRect(ctx, bx, by, w, h, r); ctx.fillStyle = color; ctx.fill();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.lineWidth = Math.max(1.5, fs * 0.09); ctx.strokeStyle = "#fff"; ctx.stroke();
  if (bad) { const o = fs * 0.16; roundRect(ctx, bx - o, by - o, w + o * 2, h + o * 2, r + o); ctx.lineWidth = Math.max(2, fs * 0.15); ctx.strokeStyle = SEV_COLOR[iss.sev]; ctx.stroke(); }
  if (selected) { const o = fs * 0.36; roundRect(ctx, bx - o, by - o, w + o * 2, h + o * 2, r + o); ctx.setLineDash([fs * 0.35, fs * 0.22]); ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = Math.max(1.5, fs * 0.1); ctx.stroke(); ctx.setLineDash([]); }
  ctx.textBaseline = "middle"; ctx.textAlign = "left";
  const ty = by + fs * 0.66;
  let tx = bx + pad;
  if (act) {
    ctx.beginPath(); ctx.arc(tx + fs * 0.22, ty, fs * 0.22, 0, Math.PI * 2); ctx.fillStyle = phaseColor(act.phase); ctx.fill();
    ctx.lineWidth = Math.max(1, fs * 0.07); ctx.strokeStyle = "#fff"; ctx.stroke(); tx += dot;
  }
  ctx.font = F1; ctx.fillStyle = fg; ctx.fillText(title, tx, ty);
  if (sub) { ctx.font = F2; ctx.globalAlpha *= 0.9; ctx.fillText(sub, bx + pad, by + fs * 1.36); ctx.globalAlpha /= 0.9; }
  if (act) {
    const yb = by + h - fs * 0.34, bw = w - pad * 2;
    ctx.fillStyle = fg === "#ffffff" ? "rgba(255,255,255,.3)" : "rgba(0,0,0,.18)"; roundRect(ctx, bx + pad, yb, bw, fs * 0.15, fs * 0.075); ctx.fill();
    ctx.fillStyle = fg; roundRect(ctx, bx + pad, yb, Math.max(fs * 0.15, bw * Math.min(100, act.progress) / 100), fs * 0.15, fs * 0.075); ctx.fill();
  }
  if (bad) {
    const cx = bx + w - fs * 0.05, cy = by + fs * 0.05, rr = fs * 0.42;
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2); ctx.fillStyle = SEV_COLOR[iss.sev]; ctx.fill();
    ctx.lineWidth = Math.max(1, fs * 0.08); ctx.strokeStyle = "#fff"; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = `900 ${rr * 1.35}px Arial`; ctx.textAlign = "center"; ctx.fillText("!", cx, cy + rr * 0.06);
  }
  ctx.restore();
  if (ctx.canvas && ctx.canvas.id === "topCanvas") dailyBoxes.set(x.id, [{ x: p[0], y: p[1], w: w + fs * 0.4, h: h + fs * 0.4 }]);
}
function drawDelivery(ctx, x, fontPx, ppm, selected) {
  const V = VEHICLES[x.veh] || VEHICLES.lastbil, g = rectGeom(x), st = siteStyle(x, fontPx);
  const ue = ueById(x.ue), iss = issueOf(x.id), bad = iss && iss.sev !== "info";
  drawVehicle(ctx, x.veh, g, x.color || V.color, { ppm, reach: selected ? Number(x.reach) || V.reach || 0 : 0 });
  if (bad) outlineRect(ctx, g, V.outrigger || 0, SEV_COLOR[iss.sev], fontPx, false);
  if (selected) outlineRect(ctx, g, (V.outrigger || 0) + 0.8, "#0b5fff", fontPx, true);
  const line1 = `${V.icon} ${x.time ? x.time + " " : ""}${x.what || V.label}`;
  const line2 = [x.what ? V.label : "", ue ? ueShort(ue) : ""].filter(Boolean).join(" · ");
  siteLabel(ctx, x, vehicleLabelPt(g, st.fs, V.outrigger || 0), `${line1}${x.locked ? " 🔒" : ""}${line2 ? "\n" + line2 : ""}${bad ? "\n⚠ " + (iss.texts[0].length > 42 ? iss.texts[0].slice(0, 41) + "…" : iss.texts[0]) : ""}`, st.fs,
    bad && iss.sev === "krock" ? "#fef2f2" : "#fff", bad && iss.sev === "krock" ? "#b91c1c" : "#111827", bad ? SEV_COLOR[iss.sev] : (ue ? ueColor(ue) : V.color), x.from !== x.to ? datesText(x) : "");
}
function drawLift(ctx, x, fontPx, ppm, selected) {
  if (!x.pts || !x.pts[0]) return;
  const st = siteStyle(x, fontPx), fs = st.fs, p = mToPx(x.pts[0]);
  const inf = liftInfo(x), iss = issueOf(x.id), bad = !!inf.bad;
  const col = bad ? "#dc2626" : (x.color || "#d97706");
  ctx.save(); ctx.setLineDash([]);
  // Riskområdet under lasten.
  const rz = (Number(x.zone) || 5) * ppm;
  ctx.beginPath(); ctx.arc(p[0], p[1], rz, 0, Math.PI * 2); ctx.fillStyle = hexToRgba(col, 0.12); ctx.fill();
  ctx.setLineDash([fs * 0.4, fs * 0.3]); ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.2, st.lw * 0.8); ctx.stroke();
  // Linje till kranen.
  if (inf.crane) {
    const c = mToPx(inf.crane.pt);
    ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(p[0], p[1]); ctx.setLineDash([fs * 0.25, fs * 0.25]); ctx.lineWidth = Math.max(1.5, st.lw); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Lyftpunkten: gul-svart romb med krok.
  const r = fs * 0.8;
  ctx.beginPath(); ctx.moveTo(p[0], p[1] - r); ctx.lineTo(p[0] + r, p[1]); ctx.lineTo(p[0], p[1] + r); ctx.lineTo(p[0] - r, p[1]); ctx.closePath();
  ctx.fillStyle = "#facc15"; ctx.fill(); ctx.lineWidth = Math.max(1.5, fs * 0.1); ctx.strokeStyle = "#111827"; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(p[0], p[1] - r * 0.55); ctx.lineTo(p[0], p[1] + r * 0.12); ctx.arc(p[0] - r * 0.2, p[1] + r * 0.12, r * 0.2, 0, Math.PI, false);
  ctx.lineWidth = Math.max(1.5, fs * 0.12); ctx.stroke();
  if (selected) { ctx.beginPath(); ctx.arc(p[0], p[1], r * 1.5, 0, Math.PI * 2); ctx.setLineDash([fs * 0.35, fs * 0.22]); ctx.strokeStyle = "#0b5fff"; ctx.lineWidth = Math.max(1.5, fs * 0.1); ctx.stroke(); ctx.setLineDash([]); }
  ctx.restore();
  // Etikett till höger.
  const ue = ueById(x.ue);
  const l1 = `🪝 ${x.time ? x.time + " " : ""}${x.what || "Lyft"}${inf.load ? ` · ${fmtT(inf.load)} t` : ""}`;
  const l2 = inf.crane ? `${inf.crane.name} · ${fmtM(inf.dist)} m${inf.cap ? ` · klarar ${fmtT(inf.cap)} t` : ""}${ue ? " · " + ueShort(ue) : ""}` : "Ingen kran";
  const text = `${l1}\n${l2}${bad ? "\n⚠ " + inf.bad : (iss && iss.sev === "krock" ? "\n⚠ " + iss.texts[0] : "")}`;
  ctx.save();
  ctx.font = `600 ${fs * 0.85}px "Segoe UI", Arial, sans-serif`;
  const tw = Math.max(...text.split("\n").map(t => ctx.measureText(t).width)) + fs * 0.8;
  ctx.restore();
  const lx = p[0] + r + fs * 0.4 + tw / 2;
  const box = labelBox(ctx, lx, p[1], text, fs, bad ? "#fef2f2" : "#fffbeb", bad ? "#b91c1c" : "#111827", col, "");
  if (ctx.canvas && ctx.canvas.id === "topCanvas") dailyBoxes.set(x.id, [{ x: p[0], y: p[1], w: r * 2.4, h: r * 2.4 }, { x: lx, y: p[1], w: box.w, h: box.h }]);
}

function dailyTipHtml(x) {
  const iss = issueOf(x.id);
  const issHtml = iss ? `<br>${iss.texts.map(t => `<span style="color:${SEV_COLOR[iss.sev]}">⚠ ${escHtml(t)}</span>`).join("<br>")}` : "";
  const ue = ueById(x.ue);
  if (x.type === "crew") {
    const act = x.act ? famInfo(x.act, curDay()) : null;
    return `👷 <b>${escHtml(ue ? `${ue.short || ""} ${ue.name || ""}`.trim() : "Arbetslag")}</b>${x.persons ? ` · ${x.persons} pers.` : ""}${x.actual != null && x.actual !== "" ? ` (på plats ${x.actual})` : ""}`
      + `${x.task ? "<br>" + escHtml(x.task) : ""}${act ? `<br>4D: ${escHtml(act.title)} · ${PHASE_LABELS[act.phase] || ""} · ${act.progress} %` : ""}`
      + `${placeOf(x) ? "<br>Zon " + escHtml(placeOf(x)) : ""}${ue && (ue.contact || ue.phone) ? `<br>${escHtml([ue.contact, ue.phone].filter(Boolean).join(", "))}` : ""}${issHtml}`
      + `<br><span style="opacity:.7">Dra för att flytta · klicka för att ändra</span>`;
  }
  if (x.type === "delivery") {
    const V = VEHICLES[x.veh] || {};
    return `${V.icon || "🚚"} <b>${escHtml(x.what || V.label || "Leverans")}</b>${x.time ? " kl. " + escHtml(x.time) : ""}<br>${escHtml(V.label || "")}${ue ? " · " + escHtml(ue.name || ue.short) : ""}${issHtml}<br><span style="opacity:.7">Dra för att flytta · ↻ vrider</span>`;
  }
  const inf = liftInfo(x);
  return `🪝 <b>${escHtml(x.what || "Lyft")}</b>${x.time ? " kl. " + escHtml(x.time) : ""}${inf.load ? ` · ${fmtT(inf.load)} t` : ""}<br>${inf.crane ? `${escHtml(inf.crane.name)} · ${fmtM(inf.dist)} m${inf.cap ? ` · klarar ${fmtT(inf.cap)} t` : ""}` : "Ingen kran"}${issHtml}`;
}

// ---------------------------------------------------------------------
// Skapa: verktyg (klicka på planen) och direkt på en punkt
// ---------------------------------------------------------------------
let dailyTool = null; // { kind, ue, act, task, veh }
function startDailyTool(kind, opts = {}) {
  if (!plan || !plan.calib) { alert("Kalibrera planen mot 3D (📐) först – lagen placeras i modellens koordinater."); return; }
  const same = siteTool && siteTool.kind === kind && dailyTool && dailyTool.ue === opts.ue && dailyTool.veh === opts.veh;
  if (siteTool) stopSiteTool();
  if (same) { dailyTool = null; renderDaySoon(); return; }
  dailyTool = { kind, ...opts };
  startSiteTool(kind, opts.veh);
  renderDaySoon();
}
function finishDailyTool() {
  const t = dailyTool || { kind: siteTool.kind };
  const pt = siteTool.pts[siteTool.pts.length - 1];
  dailyTool = null;
  stopSiteTool();
  createDaily(t.kind, pt, t);
  renderDaySoon();
}
function createDaily(kind, pt, opts = {}) {
  const day = curDay();
  const base = { id: ghNewId(), type: kind, from: day, to: day, layer: DAILY_LAYER, created_at: new Date().toISOString(), by: settings.userName || null };
  let rec;
  if (kind === "crew") {
    const ue = ueById(opts.ue);
    rec = { ...base, ue: opts.ue || null, pts: [[dr3(pt[0]), dr3(pt[1])]], persons: opts.persons ?? (ue && ue.persons ? Number(ue.persons) : null), actual: null, task: opts.task || "", act: opts.act || null, note: "" };
  } else if (kind === "delivery") {
    const veh = VEHICLES[opts.veh] ? opts.veh : "lastbil", V = VEHICLES[veh];
    rec = { ...base, veh, cx: dr3(pt[0]), cy: dr3(pt[1]), w: V.w, h: V.h, rot: 0, time: opts.time || "07:00", what: "", ue: opts.ue || null, note: "" };
  } else {
    const cr = liftCranes(day).sort((a, b) => Math.hypot(a.pt[0] - pt[0], a.pt[1] - pt[1]) - Math.hypot(b.pt[0] - pt[0], b.pt[1] - pt[1]))[0];
    rec = { ...base, pts: [[dr3(pt[0]), dr3(pt[1])]], crane: cr ? cr.id : null, load: "", time: opts.time || "08:00", what: "", ue: opts.ue || null, zone: 5, note: "" };
  }
  ls("ul:" + DAILY_LAYER).visible = true; saveLayerState();
  selectedSiteId = rec.id;
  saveSiteItem(rec);
  openDailyPop(rec, true);
  return rec;
}

// ---------------------------------------------------------------------
// Redigeringsrutan
// ---------------------------------------------------------------------
function ueOptions(cur, none = "— ingen —") {
  return `<option value="">${escHtml(none)}</option>` + ues().map(u => `<option value="${escHtml(u.id)}"${u.id === cur ? " selected" : ""}>${escHtml(ueShort(u))} – ${escHtml(u.name || "")}</option>`).join("") + `<option value="__new">＋ Ny UE…</option>`;
}
function actSearch(day, q) {
  const ql = String(q || "").trim().toLowerCase(), res = [];
  families().forEach((rows, key) => {
    const it = rows[0];
    if (ql && ![it.activity, it.object_name, it.area, it.contractor, it.element_type].filter(Boolean).join(" ").toLowerCase().includes(ql)) return;
    const inf = famInfo(key, day);
    const rel = inf.done ? 3 : (inf.start && inf.start <= day && (!inf.end || inf.end >= addDays(day, -7))) ? 0 : (inf.start && inf.start > day && inf.start <= addDays(day, 14)) ? 1 : 2;
    res.push({ key, inf, rel });
  });
  res.sort((a, b) => a.rel - b.rel || String(a.inf.start || "9").localeCompare(String(b.inf.start || "9")) || a.inf.title.localeCompare(b.inf.title, "sv"));
  return res.slice(0, 30);
}
const actLine = inf => `${inf.title}${inf.object ? " " + inf.object : ""}${inf.area ? " · " + inf.area : ""}`;
function positionPop(pop, rec) {
  const pt = dailyPt(rec);
  if (!pt) return;
  const anchor = mToPx(pt), r = $("viewport").getBoundingClientRect();
  const sx = view.tx + anchor[0] * view.scale, sy = view.ty + anchor[1] * view.scale;
  pop.style.left = `${Math.max(8, Math.min(r.width - pop.offsetWidth - 8, sx + 22))}px`;
  pop.style.top = `${Math.max(8, Math.min(r.height - pop.offsetHeight - 8, sy - 40))}px`;
}
function openDailyPop(rec, isNew) {
  const pop = $("sitePop"), day = curDay();
  const k = SITE_KINDS[rec.type];
  const iss = issueOf(rec.id);
  const opt = (v, cur, label) => `<option value="${escHtml(v)}"${String(cur) === String(v) ? " selected" : ""}>${escHtml(label)}</option>`;
  let body = "";
  if (rec.type === "crew") {
    const act = rec.act ? famInfo(rec.act, day) : null;
    body = `
      <label>Underentreprenör</label><select class="dp-ue">${ueOptions(rec.ue)}</select>
      <div class="row2"><div><label>Personer</label><input type="text" inputmode="numeric" class="dp-persons" value="${escHtml(rec.persons ?? "")}" placeholder="valfritt" /></div>
        <div><label>På plats <span class="muted">(utfall)</span></label><input type="text" inputmode="numeric" class="dp-actual" value="${escHtml(rec.actual ?? "")}" /></div></div>
      <label>Arbetsuppgift</label><input type="text" class="dp-task" value="${escHtml(rec.task || "")}" placeholder="t.ex. Armering bjälklag plan 2" />
      <label>Aktivitet i 4D-planeringen</label>
      <div class="dp-act">${act ? `<div class="dp-actcur"><span class="dp-phase" style="background:${phaseColor(act.phase)}"></span><span class="grow">${escHtml(actLine(act))}<br><span class="muted">${escHtml(PHASE_LABELS[act.phase] || "")} · ${act.progress} %${act.start ? ` · ${shortDate(act.start)}–${act.end ? shortDate(act.end) : "?"}` : ""}</span></span><button type="button" class="dp-actclear" title="Ta bort kopplingen">✕</button></div>`
        : rec.act ? `<div class="dp-actcur muted">Aktiviteten finns inte längre <button type="button" class="dp-actclear">✕</button></div>` : ""}
        <input type="text" class="dp-actq" placeholder="${act ? "Byt aktivitet – sök…" : "Sök aktivitet (namn, zon, entreprenör)…"}" autocomplete="off" /><div class="dp-actlist"></div></div>
      ${act ? `<div class="dp-prog"><label>Rapportera framdrift</label>
        <div class="dp-progrow"><input type="range" class="dp-progr" min="0" max="100" step="5" value="${act.progress}" /><span class="dp-progv">${act.progress} %</span></div>
        <div class="dp-progrow"><button type="button" class="dp-progsave">Rapportera</button><button type="button" class="dp-done primary">✓ Klar</button></div>
        <div class="muted dp-progmsg">Sparas i 4D-planeringen (alla ${act.objects} objekt i aktiviteten).</div></div>` : ""}`;
  } else if (rec.type === "delivery") {
    const V = VEHICLES[rec.veh] || VEHICLES.lastbil;
    body = `
      <label>Fordon</label><select class="dp-veh">${Object.entries(VEHICLES).map(([key, v]) => opt(key, rec.veh, `${v.icon} ${v.label}`)).join("")}</select>
      <div class="row2"><div><label>Tid</label><input type="time" class="dp-time" value="${escHtml(rec.time || "")}" /></div><div><label>UE</label><select class="dp-ue">${ueOptions(rec.ue)}</select></div></div>
      <label>Vad levereras</label><input type="text" class="dp-what" value="${escHtml(rec.what || "")}" placeholder="t.ex. Betong C30/37, 12 m³" />
      ${V.reach || rec.veh === "mobilkran" ? `<div class="row2"><div><label>Räckvidd (m)</label><input type="text" class="dp-reach" value="${escHtml(rec.reach ?? V.reach ?? "")}" /></div>
        ${rec.veh === "mobilkran" ? `<div><label>Max last (t)</label><input type="text" class="dp-cap" value="${escHtml(rec.capacity ?? "")}" /></div>` : ""}</div>
        ${rec.veh === "mobilkran" ? `<label>Lyftkurva <span class="muted">(radie:ton)</span></label><input type="text" class="dp-chart" value="${escHtml(rec.chart || "")}" placeholder="10:20, 20:8, 30:4" />` : ""}` : ""}
      <label>Vinkel (°)</label><input type="text" class="dp-rot" value="${Math.round((rec.rot || 0) * 180 / Math.PI)}" />`;
  } else {
    const cranes = liftCranes(day), inf = liftInfo(rec, day);
    body = `
      <label>Kran</label><select class="dp-crane">${opt("", rec.crane && cranes.some(c => c.id === rec.crane) ? rec.crane : "", "Närmaste kranen")}${cranes.map(c => opt(c.id, rec.crane, `${c.mobile ? "🚚 " : "🏗 "}${c.name} (${fmtM(c.reach)} m)`)).join("")}</select>
      <div class="row2"><div><label>Tid</label><input type="time" class="dp-time" value="${escHtml(rec.time || "")}" /></div><div><label>Vikt (t)</label><input type="text" class="dp-load" value="${escHtml(rec.load ?? "")}" /></div></div>
      <label>Vad lyfts</label><input type="text" class="dp-what" value="${escHtml(rec.what || "")}" placeholder="t.ex. Takstolar, armeringskorg" />
      <div class="row2"><div><label>UE</label><select class="dp-ue">${ueOptions(rec.ue)}</select></div><div><label>Riskområde (m)</label><input type="text" class="dp-zone" value="${escHtml(rec.zone ?? 5)}" /></div></div>
      <div class="dp-liftinfo ${inf.bad ? "bad" : "ok"}">${inf.crane ? `${escHtml(inf.crane.name)}: ${fmtM(inf.dist)} m från kranen${inf.cap ? `, klarar ${fmtT(inf.cap)} t där` : ""}.` : ""}${inf.bad ? `<br>⚠ ${escHtml(inf.bad)}` : inf.crane ? " ✓" : ""}</div>`;
  }
  pop.innerHTML = `
    <b class="dp-head">${k.icon} ${isNew ? "Nytt" : ""} ${escHtml(k.label.toLowerCase())}${rec.type === "crew" && ueById(rec.ue) ? ` <span class="dp-chip" style="background:${ueColor(ueById(rec.ue))};color:${contrastText(ueColor(ueById(rec.ue)))}">${escHtml(ueShort(ueById(rec.ue)))}</span>` : ""}</b>
    ${iss ? `<div class="dp-iss-box">${iss.texts.map(t => `<div style="color:${SEV_COLOR[iss.sev]}">⚠ ${escHtml(t)}</div>`).join("")}</div>` : ""}
    ${body}
    <div class="row2"><div><label>Från</label><input type="date" class="dp-from" value="${escHtml(rec.from || "")}" /></div><div><label>Till</label><input type="date" class="dp-to" value="${escHtml(rec.to || "")}" /></div></div>
    <div class="dp-quick"><button type="button" data-span="day" title="Bara ${escHtml(dayShort(day))}">Bara i dag</button><button type="button" data-span="week" title="Från i dag till fredag">Resten av veckan</button></div>
    <label>Notering</label><textarea class="dp-note" placeholder="t.ex. Behöver lift, nyckel till förråd 3">${escHtml(rec.note || "")}</textarea>
    <label style="display:flex;gap:6px;align-items:center;margin-top:6px;color:var(--text);"><input type="checkbox" class="dp-lock"${rec.locked ? " checked" : ""} style="width:auto;" /> 🔒 Lås (kan inte flyttas av misstag)</label>
    <div class="acts"><span><button class="dp-del" title="Ta bort">🗑️</button> <button class="dp-copy" title="Kopiera till nästa arbetsdag">⧉ ${escHtml(dayShort(nextWorkday(rec.to || day)))}</button></span><span><button class="dp-cancel">${isNew ? "Stäng" : "Avbryt"}</button> <button class="dp-save primary">Spara</button></span></div>`;
  pop.classList.remove("hidden");
  positionPop(pop, rec);
  const q = c => pop.querySelector(c);
  const v = c => { const el = q(c); return el ? el.value.trim() : undefined; };
  let actKey = rec.act || null;
  // UE: "＋ Ny UE…" öppnar registret.
  const ueSel = q(".dp-ue");
  if (ueSel) ueSel.onchange = async () => {
    if (ueSel.value !== "__new") return;
    const u = await quickNewUe();
    ueSel.innerHTML = ueOptions(u ? u.id : rec.ue);
  };
  // Aktivitet: sök och välj.
  const aq = q(".dp-actq"), al = q(".dp-actlist");
  if (aq) {
    const list = () => {
      const res = actSearch(day, aq.value);
      al.innerHTML = res.map(r => `<button type="button" class="dp-actopt" data-key="${escHtml(r.key)}"><span class="dp-phase" style="background:${phaseColor(r.inf.phase)}"></span><span>${escHtml(actLine(r.inf))}<br><span class="muted">${escHtml([r.inf.contractor, PHASE_LABELS[r.inf.phase], r.inf.progress + " %", r.inf.start ? shortDate(r.inf.start) + "–" + (r.inf.end ? shortDate(r.inf.end) : "?") : ""].filter(Boolean).join(" · "))}</span></span></button>`).join("") || `<div class="muted">Inga träffar.</div>`;
      al.querySelectorAll(".dp-actopt").forEach(b => b.onclick = () => {
        actKey = b.dataset.key;
        const inf = famInfo(actKey, day);
        // Förslag: UE efter entreprenören och arbetsuppgiften efter aktiviteten.
        if (ueSel && !ueSel.value) { const u = ueForContractor(inf.contractor); if (u) ueSel.value = u.id; }
        if (q(".dp-task") && !q(".dp-task").value) q(".dp-task").value = inf.title;
        save(false);
      });
    };
    aq.onfocus = list; aq.oninput = list;
  }
  const clr = q(".dp-actclear");
  if (clr) clr.onclick = () => { actKey = null; save(false); };
  // Framdrift.
  const pr = q(".dp-progr");
  if (pr) {
    pr.oninput = () => { q(".dp-progv").textContent = pr.value + " %"; };
    q(".dp-progsave").onclick = () => reportProgress(collect(), Number(pr.value));
    q(".dp-done").onclick = () => reportProgress(collect(), 100);
  }
  pop.querySelectorAll("[data-span]").forEach(b => b.onclick = () => {
    q(".dp-from").value = day;
    q(".dp-to").value = b.dataset.span === "day" ? day : addDays(weekStart(day), 4) < day ? day : addDays(weekStart(day), 4);
  });
  const vehSel = q(".dp-veh");
  if (vehSel) vehSel.onchange = () => { const n = collect(); const V = VEHICLES[n.veh]; Object.assign(n, { w: V.w, h: V.h }); delete n.reach; openDailyPop(n, isNew); };
  const collect = () => {
    const next = { ...rec, from: v(".dp-from") || null, to: v(".dp-to") || null, note: v(".dp-note") || "", locked: q(".dp-lock").checked, updated_at: new Date().toISOString() };
    if (ueSel) next.ue = ueSel.value && ueSel.value !== "__new" ? ueSel.value : null;
    if (rec.type === "crew") {
      const n = s => { const t = v(s); if (!t) return null; const x = parseInt(t, 10); return Number.isFinite(x) && x >= 0 ? x : null; };
      Object.assign(next, { persons: n(".dp-persons"), actual: n(".dp-actual"), task: v(".dp-task") || "", act: actKey });
    } else if (rec.type === "delivery") {
      Object.assign(next, { veh: v(".dp-veh"), time: v(".dp-time") || "", what: v(".dp-what") || "", rot: numIn(v(".dp-rot")) * Math.PI / 180 });
      if (q(".dp-reach")) next.reach = numIn(v(".dp-reach")) || null;
      if (q(".dp-cap")) next.capacity = v(".dp-cap") || "";
      if (q(".dp-chart")) { const ch = parseChart(v(".dp-chart")); next.chart = ch.map(c => `${c.r}:${c.t}`).join(", "); }
      const g = rectGeom(next); Object.assign(next, { cx: g.cx, cy: g.cy, w: g.w, h: g.h }); delete next.pts;
    } else {
      Object.assign(next, { crane: v(".dp-crane") || null, time: v(".dp-time") || "", load: v(".dp-load") || "", what: v(".dp-what") || "", zone: Math.max(0, numIn(v(".dp-zone"))) || 5 });
    }
    return next;
  };
  const save = (close = true) => {
    const next = collect();
    if (next.from && next.to && next.from > next.to) { alert("Från-datumet måste vara före till-datumet."); return null; }
    selectedSiteId = next.id;
    saveSiteItem(next, false, { prev: siteItems.find(x => x.id === rec.id) || null });
    if (close) closeSitePop(); else openDailyPop(next, isNew);
    renderDaySoon();
    return next;
  };
  q(".dp-save").onclick = () => save(true);
  q(".dp-cancel").onclick = () => { closeSitePop(); renderZones(); };
  q(".dp-del").onclick = () => { closeSitePop(); selectedSiteId = null; saveSiteItem(rec, true); renderDaySoon(); };
  q(".dp-copy").onclick = () => { const n = save(true); if (n) copyItemsTo([n], nextWorkday(n.to || day), `Kopiera ${k.label.toLowerCase()}`); };
  pop.onkeydown = e => { if (e.key === "Enter" && e.target.tagName === "INPUT" && !e.target.classList.contains("dp-actq")) { e.preventDefault(); save(true); } };
  const first = q(rec.type === "crew" ? (rec.ue ? ".dp-persons" : ".dp-ue") : rec.type === "delivery" ? ".dp-what" : ".dp-what");
  if (first && isNew && !("ontouchstart" in window)) first.focus(); // klickat lag: Delete ska ta bort det
}

/* Framdrift från lagets bricka -> plan_items.json (alla objekt i aktiviteten). */
async function reportProgress(crew, pct) {
  const inf = crew.act ? famInfo(crew.act, curDay()) : null;
  if (!inf) return;
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const d = curDay() < todayIso() ? curDay() : todayIso();
  const now = new Date().toISOString();
  const patch = r => {
    const out = { ...r, progress: p, updated_at: now };
    if (p >= 100) { out.status = "klar"; out.actual_start_date = r.actual_start_date || d; out.actual_end_date = r.actual_end_date || d; }
    else if (p > 0) { out.status = "pagaende"; out.actual_start_date = r.actual_start_date || d; out.actual_end_date = null; }
    else if (r.status === "klar") { out.status = "pagaende"; out.actual_end_date = null; }
    return out;
  };
  const ids = new Set(inf.rows.map(r => r.id));
  inf.rows.forEach(r => Object.assign(r, patch(r)));
  const next = { ...crew, log: [...(crew.log || []), { d: curDay(), p, at: now, by: settings.userName || null }], updated_at: now };
  saveSiteItem(next, false, { prev: siteItems.find(x => x.id === crew.id) || null });
  openDailyPop(next, false);
  const msg = $("sitePop").querySelector(".dp-progmsg");
  if (msg) msg.textContent = "Sparar framdriften…";
  try {
    await ghWriteJSON(token, dataPath("plan_items.json"), arr => arr.map(r => ids.has(r.id) ? patch(r) : r), `Lägesplan: framdrift ${p} % – ${inf.title}`);
    const m2 = $("sitePop").querySelector(".dp-progmsg");
    if (m2) m2.textContent = `✓ ${p} % sparat i 4D-planeringen${p >= 100 ? " (klarmarkerad)" : ""}. Uppdatera (↻) i 4D-planering för att se det där.`;
    setSaveStatus(`✓ Framdrift ${p} % – ${inf.title}`);
  } catch (e) {
    const m2 = $("sitePop").querySelector(".dp-progmsg");
    if (m2) m2.textContent = "⚠ Kunde inte spara framdriften: " + e.message;
  }
  renderZones(); renderDaySoon();
}

// ---------------------------------------------------------------------
// Kopiera (dag, vecka, enskilt lag) – ett steg att ångra
// ---------------------------------------------------------------------
async function saveDailyBatch(label, recs, removeIds = []) {
  if (!recs.length && !removeIds.length) return;
  const entries = [...recs.map(r => { const b = siteItems.find(x => x.id === r.id); return { id: r.id, before: b ? dclone(b) : null, after: dclone(r) }; }),
    ...removeIds.map(id => ({ id, before: dclone(siteItems.find(x => x.id === id)), after: null }))];
  siteUndo.push({ label, batch: entries, id: null });
  if (siteUndo.length > 100) siteUndo.shift();
  siteRedo = [];
  if (typeof lastUndoTarget !== "undefined") lastUndoTarget = "site";
  updateUndoButtons();
  setSaveStatus("Sparar…");
  try { await saveSiteItemsBatch(recs, removeIds, `Lägesplan: ${label.toLowerCase()}`); setSaveStatus(`✓ ${label}`); }
  catch (e) { setSaveStatus("⚠ Kunde inte spara: " + e.message); }
}
/* Finns redan samma sak (typ, UE, fordon, plats) den dagen? */
function dupOn(x, day) {
  const p = dailyPt(x);
  return siteItems.some(y => y.id !== x.id && y.type === x.type && activeOn(y, day) && (y.ue || null) === (x.ue || null) && (y.veh || null) === (x.veh || null) &&
    Math.hypot(dailyPt(y)[0] - p[0], dailyPt(y)[1] - p[1]) < 0.5);
}
function copyClone(x, from, to) {
  const c = dclone(x);
  Object.assign(c, { id: ghNewId(), from, to, created_at: new Date().toISOString(), copy_of: x.id });
  delete c.updated_at; delete c.log; if (c.type === "crew") c.actual = null;
  return c;
}
async function copyItemsTo(src, target, label) {
  const out = [];
  let skipped = 0;
  src.forEach(x => {
    if (activeOn(x, target) || dupOn(x, target)) { skipped++; return; }
    out.push(copyClone(x, target, target));
  });
  await saveDailyBatch(`${label} → ${dayShort(target)}`, out);
  renderDaySoon();
  return { copied: out.length, skipped };
}
async function copyDayTo(day, target) {
  const src = dayItems(day);
  if (!src.length) { alert(`Inget planerat ${dayShort(day)} att kopiera.`); return; }
  const recs = [];
  let copied = 0, extended = 0, skipped = 0;
  src.forEach(x => {
    if (activeOn(x, target) || dupOn(x, target)) { skipped++; return; }
    // Ett lag som pågår flera dagar och slutar i dag förlängs; endagsposter kopieras.
    if (x.from && x.to === day && x.from < day) { recs.push({ ...x, to: target, updated_at: new Date().toISOString() }); extended++; }
    else { recs.push(copyClone(x, target, target)); copied++; }
  });
  await saveDailyBatch(`Kopiera ${dayShort(day)} → ${dayShort(target)}`, recs);
  setSaveStatus(`✓ ${copied} kopierade${extended ? `, ${extended} förlängda` : ""}${skipped ? `, ${skipped} fanns redan` : ""} → ${dayShort(target)}`);
  renderDaySoon();
}
async function copyWeekTo(day) {
  const mon = weekStart(day), sun = addDays(mon, 6);
  const src = siteItems.filter(x => isDaily(x) && x.from && x.to && x.from >= mon && x.to <= sun);
  if (!src.length) { alert(`Inget planerat vecka ${dayWeekNo(day)} att kopiera.`); return; }
  let skipped = 0;
  const recs = [];
  src.forEach(x => {
    const f = addDays(x.from, 7), t = addDays(x.to, 7);
    if (dupOn(x, f)) { skipped++; return; }
    recs.push(copyClone(x, f, t));
  });
  await saveDailyBatch(`Kopiera vecka ${dayWeekNo(day)} → vecka ${dayWeekNo(addDays(day, 7))}`, recs);
  setSaveStatus(`✓ ${recs.length} kopierade till vecka ${dayWeekNo(addDays(day, 7))}${skipped ? ` (${skipped} fanns redan)` : ""}`);
  renderDaySoon();
}

// ---------------------------------------------------------------------
// UE-registret (panel)
// ---------------------------------------------------------------------
let ueEditing = null; // id eller "new"
let dayLookOpen = false;
async function saveUe(u) { await saveSiteItem(u, false, { record: false }); renderZones(); renderDaySoon(true); }
async function quickNewUe() {
  const name = (prompt("Underentreprenörens namn (t.ex. Armeringsbolaget AB):", "") || "").trim();
  if (!name) return null;
  const short = (prompt("Förkortning som visas på planen (2–5 tecken):", name.replace(/[^A-Za-zÅÄÖåäö]/g, "").slice(0, 3).toUpperCase()) || "").trim().toUpperCase().slice(0, 6);
  const u = { id: ghNewId(), type: "ue", name, short: short || name.slice(0, 3).toUpperCase(), color: nextUeColor(), contact: "", phone: "", trade: "", persons: null, created_at: new Date().toISOString() };
  await saveUe(u);
  return u;
}
async function importUesFrom4D() {
  const have = new Set(ues().map(u => String(u.name || "").toLowerCase()));
  const names = [...new Set(items.map(it => String(it.contractor || "").trim()).filter(Boolean))].filter(n => !have.has(n.toLowerCase()) && !ueForContractor(n));
  if (!names.length) { alert("Alla entreprenörer i 4D-planeringen finns redan i registret."); return; }
  if (!confirm(`Lägga till ${names.length} entreprenör${names.length > 1 ? "er" : ""} från 4D-planeringen?\n\n${names.slice(0, 15).join("\n")}${names.length > 15 ? "\n…" : ""}`)) return;
  const used = new Set(ues().map(u => (u.color || "").toLowerCase()));
  const recs = names.map((n, i) => {
    const color = UE_COLORS.find(c => !used.has(c)) || UE_COLORS[i % UE_COLORS.length]; used.add(color);
    return { id: ghNewId(), type: "ue", name: n, short: n.replace(/\b(AB|HB|KB)\b/g, "").replace(/[^A-Za-zÅÄÖåäö]/g, "").slice(0, 3).toUpperCase() || "UE", color, contact: "", phone: "", trade: "", persons: null, created_at: new Date().toISOString() };
  });
  await saveSiteItemsBatch(recs, [], "Lägesplan: UE från 4D-planeringen");
  renderDaySoon(true);
}
function renderUeList() {
  const box = $("ueList");
  if (!box) return;
  const list = ues();
  const count = id => siteItems.filter(x => x.type === "crew" && x.ue === id).length;
  const form = u => `<div class="ue-form" data-ue="${escHtml(u.id)}">
      <div class="row2"><div style="flex:2"><label>Namn</label><input type="text" class="uf-name" value="${escHtml(u.name || "")}" placeholder="Armeringsbolaget AB" /></div><div><label>Förkortning</label><input type="text" class="uf-short" maxlength="6" value="${escHtml(u.short || "")}" placeholder="ARM" /></div></div>
      <div class="row2"><div><label>Kontaktperson</label><input type="text" class="uf-contact" value="${escHtml(u.contact || "")}" /></div><div><label>Telefon</label><input type="tel" class="uf-phone" value="${escHtml(u.phone || "")}" /></div></div>
      <div class="row2"><div style="flex:2"><label>Arbete</label><input type="text" class="uf-trade" value="${escHtml(u.trade || "")}" placeholder="t.ex. Armering" /></div><div><label>Personer <span class="muted">(standard)</span></label><input type="text" inputmode="numeric" class="uf-persons" value="${escHtml(u.persons ?? "")}" /></div></div>
      <label>Färg</label><div class="uf-colors">${UE_COLORS.map(c => `<button type="button" class="uf-c${(u.color || "").toLowerCase() === c ? " on" : ""}" data-c="${c}" style="background:${c}"></button>`).join("")}<input type="color" class="uf-color" value="${escHtml(u.color || nextUeColor())}" title="Egen färg" /></div>
      <div class="row split" style="margin-top:6px;"><button type="button" class="uf-save primary">Spara</button><button type="button" class="uf-cancel">Avbryt</button>${u._new ? "" : `<button type="button" class="uf-del" title="Ta bort">🗑️</button>`}</div>
    </div>`;
  box.innerHTML = `
    ${list.length ? "" : `<div class="hint">Lägg upp underentreprenörerna här (namn, förkortning, färg, kontakt). Förkortningen och färgen syns på lagens brickor på planen.</div>`}
    <div class="ue-list">${list.map(u => ueEditing === u.id ? form(u) : `<div class="ue-row" data-ue="${escHtml(u.id)}">
      <span class="dp-chip" style="background:${ueColor(u)};color:${contrastText(ueColor(u))}">${escHtml(ueShort(u))}</span>
      <span class="grow"><b>${escHtml(u.name || "")}</b>${u.trade ? ` <span class="muted">· ${escHtml(u.trade)}</span>` : ""}<br><span class="muted">${escHtml([u.contact, u.phone].filter(Boolean).join(" · ") || "Ingen kontakt angiven")}${count(u.id) ? ` · ${count(u.id)} lag` : ""}</span></span>
      ${u.phone ? `<a class="ue-call" href="tel:${escHtml(String(u.phone).replace(/[^\d+]/g, ""))}" title="Ring">📞</a>` : ""}
      <button type="button" class="ue-edit icon" title="Ändra">✏️</button></div>`).join("")}</div>
    ${ueEditing === "new" ? form({ id: "new", _new: true, color: nextUeColor() }) : `<div class="row split" style="margin-top:6px;"><button type="button" id="btnUeNew" class="primary">＋ Ny UE</button><button type="button" id="btnUeImport" title="Skapa UE av entreprenörerna i 4D-planeringen">⇣ Från 4D-planeringen</button></div>`}`;
  const nb = $("btnUeNew"); if (nb) nb.onclick = () => { ueEditing = "new"; renderUeList(); const n = box.querySelector(".uf-name"); if (n) n.focus(); };
  const ib = $("btnUeImport"); if (ib) ib.onclick = importUesFrom4D;
  box.querySelectorAll(".ue-edit").forEach(b => b.onclick = () => { ueEditing = b.closest("[data-ue]").dataset.ue; renderUeList(); });
  box.querySelectorAll(".ue-form").forEach(f => {
    const id = f.dataset.ue, q = c => f.querySelector(c);
    f.querySelectorAll(".uf-c").forEach(b => b.onclick = () => { q(".uf-color").value = b.dataset.c; f.querySelectorAll(".uf-c").forEach(x => x.classList.toggle("on", x === b)); });
    q(".uf-cancel").onclick = () => { ueEditing = null; renderUeList(); };
    q(".uf-save").onclick = async () => {
      const name = q(".uf-name").value.trim();
      if (!name) { q(".uf-name").focus(); return; }
      const old = id === "new" ? null : ueById(id);
      const pers = parseInt(q(".uf-persons").value, 10);
      const u = { ...(old || { id: ghNewId(), type: "ue", created_at: new Date().toISOString() }), name, short: (q(".uf-short").value.trim() || name.slice(0, 3)).toUpperCase(),
        contact: q(".uf-contact").value.trim(), phone: q(".uf-phone").value.trim(), trade: q(".uf-trade").value.trim(), persons: Number.isFinite(pers) && pers > 0 ? pers : null,
        color: q(".uf-color").value, updated_at: new Date().toISOString() };
      ueEditing = null;
      await saveUe(u);
    };
    const del = q(".uf-del");
    if (del) del.onclick = async () => {
      const u = ueById(id), n = count(id);
      if (!confirm(`Ta bort ${u.name}?${n ? `\n\n${n} lag på planen är kopplade till den – de blir kvar men utan UE.` : ""}`)) return;
      ueEditing = null;
      await saveSiteItem(u, true, { record: false });
      renderZones(); renderDaySoon(true);
    };
    f.onkeydown = e => { if (e.key === "Enter" && e.target.tagName === "INPUT") q(".uf-save").click(); if (e.key === "Escape") q(".uf-cancel").click(); };
  });
}

// ---------------------------------------------------------------------
// Dagens plan (panelen och fältläget)
// ---------------------------------------------------------------------
const byTime = (a, b) => String(a.time || "99").localeCompare(String(b.time || "99"));
function dayRowsHtml(day) {
  const its = dayItems(day);
  const crews = its.filter(x => x.type === "crew").sort((a, b) => ueShort(ueById(a.ue)).localeCompare(ueShort(ueById(b.ue)), "sv"));
  const timed = its.filter(x => x.type !== "crew").sort(byTime);
  const flag = x => { const i = issueOfDay(x.id); return i ? `<span class="dp-flag ${i.sev}" title="${escHtml(i.texts.join("\n"))}">${i.sev === "info" ? "i" : "!"}</span>` : ""; };
  const row = (x, sw, main, sub) => `<div class="dp-row${x.id === selectedSiteId ? " sel" : ""}" data-id="${escHtml(x.id)}">${sw}<span class="dp-main">${main}${sub ? `<br><span class="muted">${sub}</span>` : ""}</span>${flag(x)}<button type="button" class="dp-rowdel" data-del="${escHtml(x.id)}" title="Ta bort (kan ångras)">🗑</button></div>`;
  const crewRow = x => {
    const ue = ueById(x.ue), act = x.act ? famInfo(x.act, day) : null, place = placeOf(x);
    return row(x, `<span class="dp-chip" style="background:${ueColor(ue)};color:${contrastText(ueColor(ue))}">${escHtml(ueShort(ue))}</span>`,
      `${x.persons ? `<b>×${x.persons}</b>${x.actual != null && x.actual !== "" ? ` <span class="muted">(${x.actual})</span>` : ""} ` : ""}${escHtml(x.task || (act ? act.title : "") || (ue ? ue.name : "Arbetslag"))}${place ? ` <span class="dp-zone">${escHtml(place)}</span>` : ""}`,
      [act ? `<span class="dp-phase" style="background:${phaseColor(act.phase)}"></span>${escHtml(act.title)} · ${act.progress} %` : "", x.from !== x.to ? escHtml(datesText(x)) : "", x.note ? "📝 " + escHtml(x.note) : ""].filter(Boolean).join(" · "));
  };
  const timedRow = x => {
    if (x.type === "delivery") { const V = VEHICLES[x.veh] || {}, ue = ueById(x.ue); return row(x, `<span class="dp-time">${escHtml(x.time || "–")}</span>`, `${V.icon || "🚚"} ${escHtml(x.what || V.label || "Leverans")}`, [x.what ? V.label : "", ue ? ueShort(ue) : "", placeOf(x)].filter(Boolean).map(escHtml).join(" · ")); }
    const inf = liftInfo(x, day), ue = ueById(x.ue);
    return row(x, `<span class="dp-time">${escHtml(x.time || "–")}</span>`, `🪝 ${escHtml(x.what || "Lyft")}${inf.load ? ` · ${fmtT(inf.load)} t` : ""}`, [inf.crane ? `${inf.crane.name} ${fmtM(inf.dist)} m` : "ingen kran", ue ? ueShort(ue) : ""].filter(Boolean).map(escHtml).join(" · "));
  };
  return { crews, timed, html: (timed.length ? `<div class="dp-sub">Leveranser och lyft</div>${timed.map(timedRow).join("")}` : "") + (crews.length ? `<div class="dp-sub">Lag</div>${crews.map(crewRow).join("")}` : "") };
}
let dayIssueCache = { day: null, res: null };
function issuesFor(day) {
  if (dayIssueCache.day !== day || !dayIssueCache.res) dayIssueCache = { day, res: computeDailyIssues(day) };
  return dayIssueCache.res;
}
const issueOfDay = id => (dayIssueCache.res && dayIssueCache.res.byId.get(id)) || null;
function focusDaily(x, open = true) {
  const pt = dailyPt(x);
  if (!pt) return;
  selectedSiteId = x.id;
  if (typeof centerOnPdf === "function") centerOnPdf(modelToPdf(pt[0], pt[1]));
  renderZones();
  if (open) openDailyPop(x, false);
  renderDaySoon();
}
function renderDayCore(box, field) {
  if (!box) return;
  const day = curDay();
  dayIssueCache = { day: null, res: null };
  const iss = issuesFor(day);
  const { crews, timed, html } = dayRowsHtml(day);
  const persons = crews.reduce((a, x) => a + (Number(x.persons) || 0), 0);
  const dels = timed.filter(x => x.type === "delivery").length, lifts = timed.length - dels;
  const toolOn = (kind, key, val) => siteTool && siteTool.kind === kind && dailyTool && dailyTool[key] === val;
  const next = nextWorkday(day), wk = dayWeekNo(day);
  const showInfo = box.dataset.info === "1";
  const shownIss = iss.list.filter(i => i.sev !== "info" || showInfo);
  box.innerHTML = `
    <div class="dp-nav"><button type="button" data-dnav="-1" title="Föregående arbetsdag">◀</button><span class="dp-date">${escHtml(dayLong(day))}<br><span class="muted">vecka ${wk}${isWeekend(day) ? " · helg" : ""}</span></span><button type="button" data-dnav="1" title="Nästa arbetsdag">▶</button><button type="button" data-dnav="0">Idag</button></div>
    ${typeof dayWeatherHtml === "function" ? dayWeatherHtml(day) : ""}
    <div class="dp-wxplace"><span class="muted">Väder på planen:</span><button type="button" data-place-wx="wxday" class="${siteTool && siteTool.kind === "wxday" ? "on" : ""}" title="Lägg dagens väder på planen (följer med i utskrifter)">🌤 Dag</button><button type="button" data-place-wx="wxweek" class="${siteTool && siteTool.kind === "wxweek" ? "on" : ""}" title="Lägg veckans väder på planen (följer med i utskrifter)">📅 Vecka</button></div>
    <div class="dp-sum">${crews.length} lag · ${persons} pers. · ${dels} lev. · ${lifts} lyft</div>
    ${iss.krock || iss.varning || iss.info ? `<button type="button" class="dp-issbtn${iss.krock ? " krock" : iss.varning ? " varning" : ""}" data-isstoggle="1">${iss.krock ? `⚠ ${iss.krock} krock${iss.krock > 1 ? "ar" : ""}` : ""}${iss.krock && iss.varning ? " · " : ""}${iss.varning ? `${iss.varning} varning${iss.varning > 1 ? "ar" : ""}` : ""}${!iss.krock && !iss.varning ? "Inga krockar" : ""}${iss.info ? ` <span class="muted">· ${iss.info} info ${showInfo ? "▴" : "▾"}</span>` : ""}</button>
      <div class="dp-isslist">${shownIss.map((i, n) => `<button type="button" class="dp-iss ${i.sev}" data-iss="${n}">${i.sev === "krock" ? "⛔" : i.sev === "varning" ? "⚠" : "ℹ"} ${escHtml(i.text)}</button>`).join("")}</div>` : `<div class="dp-ok">✓ Inga krockar</div>`}
    <div class="dp-h">Placera lag <span class="muted">– välj UE och klicka på planen</span></div>
    <div class="dp-chips">${ues().map(u => `<button type="button" class="dp-uebtn${toolOn("crew", "ue", u.id) ? " on" : ""}" data-place-ue="${escHtml(u.id)}" style="--c:${ueColor(u)};--f:${contrastText(ueColor(u))}" title="${escHtml(u.name || "")}">${escHtml(ueShort(u))}</button>`).join("")}<button type="button" class="dp-addue" data-ue-new="1">＋ UE</button></div>
    <details class="dp-look"${dayLookOpen ? " open" : ""}><summary>🎨 Utseende på lagen</summary>
      <div class="dp-lookrow"><span>Storlek</span><input type="range" min="40" max="300" step="10" data-look="crewScale" value="${Math.round(daySettings().crewScale * 100)}" /><span class="dp-lookv">${Math.round(daySettings().crewScale * 100)} %</span></div>
      <div class="dp-lookrow"><span>Opacitet</span><input type="range" min="15" max="100" step="5" data-look="crewOpacity" value="${Math.round(daySettings().crewOpacity * 100)}" /><span class="dp-lookv">${Math.round(daySettings().crewOpacity * 100)} %</span></div>
      ${ues().length ? `<div class="dp-lookcols">${ues().map(u => `<label class="dp-lookue" title="Färg för ${escHtml(u.name || "")}"><input type="color" data-uecolor="${escHtml(u.id)}" value="${escHtml(ueColor(u))}" /><span>${escHtml(ueShort(u))}</span></label>`).join("")}</div>` : ""}
      <div class="muted" style="font-size:11px;">Gäller alla lag på planen och i utskrifter. Färgen sätts per UE.</div>
    </details>
    <div class="dp-h">Leverans och lyft</div>
    <div class="dp-chips">${Object.entries(VEHICLES).map(([k, V]) => `<button type="button" class="dp-veh${toolOn("delivery", "veh", k) ? " on" : ""}" data-place-veh="${k}" title="${escHtml(V.label)}">${V.icon} ${escHtml(V.label.replace(/ \(.*\)/, ""))}</button>`).join("")}<button type="button" class="dp-veh${siteTool && siteTool.kind === "lift" ? " on" : ""}" data-place-lift="1">🪝 Lyft</button></div>
    ${html ? `<div class="dp-list">${html}</div>` : `<div class="hint">Inget planerat ${escHtml(dayShort(day))}. Välj en UE ovan och klicka på planen, eller kopiera från en annan dag.</div>`}
    <div class="dp-actions">
      <button type="button" data-copyday="1" title="Kopiera dagens lag, leveranser och lyft till nästa arbetsdag">⧉ Kopiera → ${escHtml(dayShort(next))}</button>
      <button type="button" data-copyprev="1" title="Hämta allt från föregående arbetsdag till i dag">⧉ Hämta från ${escHtml(dayShort(nextWorkday(day, -1)))}</button>
      ${field ? "" : `<button type="button" data-copyweek="1" title="Kopiera hela veckans planering en vecka framåt">⧉ Veckan → v. ${dayWeekNo(addDays(day, 7))}</button>
      <div class="dp-sheet"><select class="dp-sheetue" title="Dagblad för alla eller en UE"><option value="">Alla UE</option>${ues().map(u => `<option value="${escHtml(u.id)}">${escHtml(ueShort(u))} – ${escHtml(u.name || "")}</option>`).join("")}</select><button type="button" data-sheet="1" class="primary">🖨 Dagblad (A3)</button></div>
      <button type="button" data-xlsx="1" title="Veckans planering, bemanning och krockar till Excel">📊 Vecka ${wk} till Excel</button>`}
    </div>`;
  box.querySelectorAll("[data-dnav]").forEach(b => b.onclick = () => {
    const n = Number(b.dataset.dnav);
    setDate(n === 0 ? todayIso() : nextWorkday(day, n));
    if (typeof renderField === "function") renderField();
  });
  const it = box.querySelector("[data-isstoggle]");
  if (it) it.onclick = () => { box.dataset.info = showInfo ? "0" : "1"; renderDayCore(box, field); };
  box.querySelectorAll("[data-iss]").forEach(b => b.onclick = () => {
    const i = shownIss[Number(b.dataset.iss)], x = siteItems.find(y => y.id === i.ids[0]);
    if (x) { if (field) closeFieldDay(); focusDaily(x, !field); }
  });
  box.querySelectorAll("[data-place-ue]").forEach(b => b.onclick = () => { if (field) closeFieldDay(); startDailyTool("crew", { ue: b.dataset.placeUe }); });
  box.querySelectorAll("[data-place-veh]").forEach(b => b.onclick = () => { if (field) closeFieldDay(); startDailyTool("delivery", { veh: b.dataset.placeVeh }); });
  const look = box.querySelector(".dp-look");
  if (look) {
    look.ontoggle = () => { dayLookOpen = look.open; };
    look.querySelectorAll("[data-look]").forEach(r => {
      const rec = () => ({ ...daySettings(), [r.dataset.look]: Number(r.value) / 100, updated_at: new Date().toISOString() });
      r.oninput = () => { r.nextElementSibling.textContent = r.value + " %"; setDaySettingsLocal(rec()); renderZones(); };
      r.onchange = () => saveSiteItem(rec(), false, { record: false });
    });
    look.querySelectorAll("[data-uecolor]").forEach(c => {
      c.oninput = () => { const u = ueById(c.dataset.uecolor); if (u) { u.color = c.value; renderZones(); } };
      c.onchange = () => { const u = ueById(c.dataset.uecolor); if (u) saveUe({ ...u, color: c.value, updated_at: new Date().toISOString() }); };
    });
  }
  box.querySelectorAll("[data-place-wx]").forEach(b => b.onclick = () => { if (field) closeFieldDay(); startSiteTool(b.dataset.placeWx); });
  const lb = box.querySelector("[data-place-lift]"); if (lb) lb.onclick = () => { if (field) closeFieldDay(); startDailyTool("lift", {}); };
  const nu = box.querySelector("[data-ue-new]"); if (nu) nu.onclick = async () => { const u = await quickNewUe(); if (u) { if (field) closeFieldDay(); startDailyTool("crew", { ue: u.id }); } };
  box.querySelectorAll("[data-del]").forEach(b => b.onclick = e => {
    e.stopPropagation();
    const x = siteItems.find(y => y.id === b.dataset.del);
    if (!x) return;
    if (selectedSiteId === x.id) { selectedSiteId = null; closeSitePop(); }
    saveSiteItem(x, true);
    setSaveStatus(`🗑 ${SITE_KINDS[x.type].label} borttaget – ↶ ångrar`);
    renderDayCore(box, field);
  });
  box.querySelectorAll(".dp-row[data-id]").forEach(r => r.onclick = () => { const x = siteItems.find(y => y.id === r.dataset.id); if (x) { if (field) closeFieldDay(); focusDaily(x); } });
  const cd = box.querySelector("[data-copyday]"); if (cd) cd.onclick = () => copyDayTo(day, next);
  const cp = box.querySelector("[data-copyprev]"); if (cp) cp.onclick = () => copyDayTo(nextWorkday(day, -1), day);
  const cw = box.querySelector("[data-copyweek]"); if (cw) cw.onclick = () => { if (confirm(`Kopiera all planering i vecka ${wk} till vecka ${dayWeekNo(addDays(day, 7))}?`)) copyWeekTo(day); };
  const sh = box.querySelector("[data-sheet]"); if (sh) sh.onclick = () => exportDaySheet(day, box.querySelector(".dp-sheetue").value || null);
  const xl = box.querySelector("[data-xlsx]"); if (xl) xl.onclick = () => exportWeekExcel(day);
}

// ---------------------------------------------------------------------
// Förslag från 4D-planeringen
// ---------------------------------------------------------------------
function suggestionsFor(day) {
  const warn = Number.isFinite(settings.warningDaysBeforeEnd) ? settings.warningDaysBeforeEnd : 7;
  const placed = new Set(dayItems(day, new Set(["crew"])).map(x => x.act).filter(Boolean));
  const out = [];
  families().forEach((rows, key) => {
    if (rows.every(rowDone)) return;
    const phs = rows.map(r => computeItemPhase(r, day, warn));
    const starting = rows.some(r => r.start_date === day);
    const running = phs.some(p => p === "pagaende" || p === "snart" || p === "forsenad");
    if (!starting && !running) return;
    const inf = famInfo(key, day);
    out.push({ key, inf, starting, late: phs.includes("forsenad"), placed: placed.has(key) });
  });
  out.sort((a, b) => (a.placed - b.placed) || (b.starting - a.starting) || (b.late - a.late) || a.inf.title.localeCompare(b.inf.title, "sv"));
  return out;
}
function renderSuggestions() {
  const box = $("daySugg");
  if (!box) return;
  const day = curDay();
  const sug = suggestionsFor(day);
  const open = sug.filter(s => !s.placed), done = sug.length - open.length;
  box.innerHTML = !sug.length ? `<div class="hint">Inga aktiviteter pågår eller startar ${escHtml(dayShort(day))} enligt 4D-planeringen.</div>`
    : `<div class="hint" style="margin-top:0;">${open.length} aktivitet${open.length === 1 ? "" : "er"} pågår eller startar ${escHtml(dayShort(day))} utan lag på planen${done ? ` · ${done} har lag` : ""}. Välj UE och tryck Placera – laget hamnar vid aktivitetens 3D-objekt (eller klicka på planen).</div>
    <div class="dp-sugg">${sug.slice(0, 60).map((s, i) => {
      const u = ueForContractor(s.inf.contractor);
      return `<div class="dp-srow${s.placed ? " placed" : ""}" data-s="${i}">
        <span class="dp-phase" style="background:${phaseColor(s.inf.phase)}"></span>
        <span class="dp-main"><b>${escHtml(actLine(s.inf))}</b>${s.starting ? ` <span class="dp-tag">startar</span>` : ""}${s.late ? ` <span class="dp-tag late">försenad</span>` : ""}<br>
          <span class="muted">${escHtml([s.inf.contractor, `${s.inf.progress} %`, s.inf.start ? `${shortDate(s.inf.start)}–${s.inf.end ? shortDate(s.inf.end) : "?"}` : ""].filter(Boolean).join(" · "))}</span></span>
        ${s.placed ? `<button type="button" class="dp-sshow" data-s="${i}" title="Visa laget">✓ Visa</button>` : `<select class="dp-sue" data-s="${i}">${ueOptions(u ? u.id : "", "UE…").replace('<option value="__new">＋ Ny UE…</option>', "")}</select><button type="button" class="dp-splace primary" data-s="${i}">Placera</button>`}
      </div>`;
    }).join("")}</div>`;
  box.querySelectorAll(".dp-splace").forEach(b => b.onclick = () => {
    const s = sug[Number(b.dataset.s)], ue = box.querySelector(`.dp-sue[data-s="${b.dataset.s}"]`).value || null;
    const c = famCenter(s.inf.rows);
    if (c && plan && plan.calib) createDaily("crew", c, { ue, act: s.key, task: s.inf.title });
    else startDailyTool("crew", { ue, act: s.key, task: s.inf.title });
  });
  box.querySelectorAll(".dp-sshow").forEach(b => b.onclick = () => {
    const s = sug[Number(b.dataset.s)], x = dayItems(day, new Set(["crew"])).find(y => y.act === s.key);
    if (x) focusDaily(x);
  });
}

// ---------------------------------------------------------------------
// Vecka och bemanning
// ---------------------------------------------------------------------
function weekDaysOf(day) {
  const mon = weekStart(day), all = [0, 1, 2, 3, 4, 5, 6].map(i => addDays(mon, i));
  return all.filter((d, i) => i < 5 || dayItems(d).length);
}
function staffing(days) {
  const rows = new Map(); // ue-id -> { ue, cells: { day: { plan, actual, crews, places } } }
  days.forEach(d => dayItems(d, new Set(["crew"])).forEach(x => {
    const k = x.ue || "";
    if (!rows.has(k)) rows.set(k, { ue: ueById(x.ue), cells: {} });
    const c = rows.get(k).cells[d] || (rows.get(k).cells[d] = { plan: 0, actual: 0, hasActual: false, crews: 0, places: new Set() });
    c.plan += Number(x.persons) || 0; c.crews++;
    if (x.actual != null && x.actual !== "") { c.actual += Number(x.actual) || 0; c.hasActual = true; }
    const p = placeOf(x); if (p) c.places.add(p);
  }));
  return [...rows.values()].sort((a, b) => ueShort(a.ue).localeCompare(ueShort(b.ue), "sv"));
}
function renderWeek() {
  const box = $("dayWeek");
  if (!box || !box.closest("details").open) return;
  const day = curDay(), days = weekDaysOf(day), today = todayIso();
  const rows = staffing(days);
  const tot = d => rows.reduce((a, r) => a + ((r.cells[d] || {}).plan || 0), 0);
  const totA = d => { const cs = rows.map(r => r.cells[d]).filter(c => c && c.hasActual); return cs.length ? cs.reduce((a, c) => a + c.actual, 0) : null; };
  const cnt = (d, t) => dayItems(d, new Set([t])).length;
  const iss = d => { const r = computeDailyIssues(d); return r.krock ? `<span class="dp-flag krock">${r.krock}</span>` : r.varning ? `<span class="dp-flag varning">${r.varning}</span>` : ""; };
  const head = days.map(d => `<th class="${d === day ? "cur" : ""}${d === today ? " today" : ""}" data-day="${d}">${WEEKDAYS_SV[dayDate(d).getDay()]}<br><span class="muted">${dayDate(d).getDate()}/${dayDate(d).getMonth() + 1}</span></th>`).join("");
  box.innerHTML = `
    <div class="dp-nav"><button type="button" data-wnav="-7">◀</button><span class="dp-date">Vecka ${dayWeekNo(day)}<br><span class="muted">${escHtml(shortDate(days[0]))} – ${escHtml(shortDate(days[days.length - 1]))}</span></span><button type="button" data-wnav="7">▶</button></div>
    <div class="wk-wrap"><table class="wk"><thead><tr><th></th>${head}<th>Σ</th></tr></thead><tbody>
    ${rows.map(r => `<tr><th class="wk-ue"><span class="dp-chip" style="background:${ueColor(r.ue)};color:${contrastText(ueColor(r.ue))}">${escHtml(ueShort(r.ue))}</span></th>${days.map(d => {
      const c = r.cells[d];
      return `<td class="${d === day ? "cur" : ""}" data-day="${d}" title="${c ? escHtml(`${c.crews} lag${c.places.size ? " · " + [...c.places].join(", ") : ""}`) : ""}">${c ? `<b>${c.plan || "•"}</b>${c.hasActual ? `<span class="muted">(${c.actual})</span>` : ""}<br><span class="wk-pl">${escHtml([...c.places].slice(0, 2).join(" "))}</span>` : ""}</td>`;
    }).join("")}<td class="wk-sum">${days.reduce((a, d) => a + ((r.cells[d] || {}).plan || 0), 0) || ""}</td></tr>`).join("") || `<tr><td colspan="${days.length + 2}" class="muted">Inga lag planerade den här veckan.</td></tr>`}
    </tbody><tfoot>
      <tr><th>Pers.</th>${days.map(d => `<td class="${d === day ? "cur" : ""}" data-day="${d}"><b>${tot(d) || ""}</b>${totA(d) != null ? `<span class="muted">(${totA(d)})</span>` : ""}</td>`).join("")}<td class="wk-sum">${days.reduce((a, d) => a + tot(d), 0) || ""}</td></tr>
      ${typeof weekWeatherCell === "function" && days.some(d => weatherFor(d)) ? `<tr class="wk-wx"><th>Väder</th>${days.map(d => `<td class="${d === day ? "cur" : ""}" data-day="${d}">${weekWeatherCell(d)}</td>`).join("")}<td></td></tr>` : ""}
      <tr><th>🚚</th>${days.map(d => `<td class="${d === day ? "cur" : ""}" data-day="${d}">${cnt(d, "delivery") || ""}</td>`).join("")}<td></td></tr>
      <tr><th>🪝</th>${days.map(d => `<td class="${d === day ? "cur" : ""}" data-day="${d}">${cnt(d, "lift") || ""}</td>`).join("")}<td></td></tr>
      <tr><th>⚠</th>${days.map(d => `<td class="${d === day ? "cur" : ""}" data-day="${d}">${iss(d)}</td>`).join("")}<td></td></tr>
    </tfoot></table></div>
    <div class="hint">Siffran är planerade personer, (inom parentes) de som rapporterats på plats. Klicka på en dag för att visa den.</div>`;
  box.querySelectorAll("[data-day]").forEach(c => c.onclick = () => setDate(c.dataset.day));
  box.querySelectorAll("[data-wnav]").forEach(b => b.onclick = () => setDate(addDays(day, Number(b.dataset.wnav))));
}

// ---------------------------------------------------------------------
// Historik: vem var var, med foton och noteringar
// ---------------------------------------------------------------------
const histState = { ue: "", days: 30 };
function renderHistory() {
  const box = $("dayHist");
  if (!box || !box.closest("details").open) return;
  const end = curDay() < todayIso() ? curDay() : todayIso();
  const days = []; for (let i = 0; i < histState.days; i++) days.push(addDays(end, -i));
  const phs = (plan && plan.photos) || [];
  const blocks = days.map(d => {
    const crews = dayItems(d, new Set(["crew"])).filter(x => !histState.ue || x.ue === histState.ue);
    const photos = phs.filter(p => p.date === d);
    if (!crews.length && !(photos.length && !histState.ue)) return "";
    return `<div class="hist-day"><div class="hist-h" data-day="${d}">${escHtml(dayShort(d))}<span class="muted"> · ${crews.length} lag · ${crews.reduce((a, x) => a + (Number(x.actual ?? x.persons) || 0), 0)} pers.</span></div>
      ${crews.map(x => {
        const ue = ueById(x.ue), act = x.act ? famInfo(x.act, d) : null, log = (x.log || []).filter(l => l.d === d);
        return `<div class="hist-row" data-id="${escHtml(x.id)}"><span class="dp-chip" style="background:${ueColor(ue)};color:${contrastText(ueColor(ue))}">${escHtml(ueShort(ue))}</span>
          <span class="grow">${x.actual != null && x.actual !== "" ? `${x.actual} pers. ` : x.persons ? `${x.persons} pers. ` : ""}${escHtml(x.task || (act ? act.title : "") || "")}${placeOf(x) ? ` <span class="dp-zone">${escHtml(placeOf(x))}</span>` : ""}
          ${log.length ? `<br><span class="muted">Framdrift rapporterad: ${log.map(l => l.p + " %").join(" → ")}</span>` : ""}${x.note ? `<br><span class="muted">📝 ${escHtml(x.note)}</span>` : ""}</span></div>`;
      }).join("")}
      ${photos.length ? `<div class="hist-ph">${photos.map(p => `<button type="button" class="hist-photo" data-ph="${escHtml(p.id)}">📷 ${escHtml(p.caption || "Foto")}</button>`).join("")}</div>` : ""}</div>`;
  }).filter(Boolean);
  box.innerHTML = `
    <div class="row" style="flex-wrap:nowrap;"><select id="histUe" class="grow">${`<option value="">Alla UE</option>` + ues().map(u => `<option value="${escHtml(u.id)}"${u.id === histState.ue ? " selected" : ""}>${escHtml(ueShort(u))} – ${escHtml(u.name || "")}</option>`).join("")}</select>
      <select id="histDays" style="width:auto;">${[7, 30, 90, 365].map(n => `<option value="${n}"${n === histState.days ? " selected" : ""}>${n} dagar</option>`).join("")}</select></div>
    ${blocks.length ? blocks.join("") : `<div class="hint">Ingen historik de senaste ${histState.days} dagarna${histState.ue ? " för den här UE:n" : ""}.</div>`}`;
  $("histUe").onchange = () => { histState.ue = $("histUe").value; renderHistory(); };
  $("histDays").onchange = () => { histState.days = Number($("histDays").value); renderHistory(); };
  box.querySelectorAll(".hist-h").forEach(h => h.onclick = () => setDate(h.dataset.day));
  box.querySelectorAll(".hist-row").forEach(r => r.onclick = () => { const x = siteItems.find(y => y.id === r.dataset.id); const d = r.closest(".hist-day").querySelector(".hist-h").dataset.day; if (x) { setDate(d); focusDaily(x); } });
  box.querySelectorAll(".hist-photo").forEach(b => b.onclick = () => { const p = phs.find(x => x.id === b.dataset.ph); if (p && typeof openPhoto === "function") openPhoto(p); });
}

// ---------------------------------------------------------------------
// Uppdatering av panelerna
// ---------------------------------------------------------------------
let dayRaf = 0;
function renderDaySoon(force) {
  if (dayRaf) return;
  dayRaf = requestAnimationFrame(() => { dayRaf = 0; renderDayAll(force); });
}
function renderDayAll(force) {
  // Skriver man i ett fält i panelen ritas den inte om (fokus och text försvinner annars).
  const a = document.activeElement;
  const typing = el => el && a && el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
  if (!force && (typing($("dayTabBody")) || typing($("fieldDayBody")))) return;
  if ($("dayPanel")) renderDayCore($("dayPanel"), false);
  const fd = $("fieldDay");
  if (fd && !fd.classList.contains("hidden")) renderDayCore($("fieldDayBody"), true);
  renderSuggestions(); renderWeek(); renderUeList(); renderHistory();
}

// ---------------------------------------------------------------------
// Fältläge: 👷 Dag
// ---------------------------------------------------------------------
function openFieldDay() {
  if (typeof closeFieldSheet === "function") closeFieldSheet();
  $("fieldDay").classList.remove("hidden"); $("btnFieldDay").classList.add("on");
  const top = $("fieldTop"); if (top) $("fieldDay").style.top = (top.offsetTop + top.offsetHeight + 8) + "px";
  renderDayCore($("fieldDayBody"), true);
}
function closeFieldDay() { const s = $("fieldDay"); if (s) s.classList.add("hidden"); const b = $("btnFieldDay"); if (b) b.classList.remove("on"); }

// ---------------------------------------------------------------------
// Dagblad (A3 liggande PDF): karta, dagens lag, leveranser/lyft och risker
// ---------------------------------------------------------------------
function dayMapEl(day, wMm, hMm) {
  const pts = [];
  dayItems(day).forEach(x => {
    sitePoints(x).forEach(p => pts.push(mToPx(p)));
    if (x.type === "lift") { const inf = liftInfo(x, day); if (inf.crane) pts.push(mToPx(inf.crane.pt)); }
  });
  if (!pts.length) return { scale: fitScale(wMm, hMm, "A3"), center: viewCenterModel() };
  const ppm = pxPerMeter(), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const wm = Math.max(40, (Math.max(...xs) - Math.min(...xs)) / ppm + 30), hm = Math.max(30, (Math.max(...ys) - Math.min(...ys)) / ppm + 30);
  const need = Math.max(wm * 1000 / wMm, hm * 1000 / hMm);
  const c = pdfToModel(toPdf([cx, cy]));
  return { scale: PRINT_SCALES.find(s => s >= need) || PRINT_SCALES[PRINT_SCALES.length - 1], center: [Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100] };
}
const pdfRgb = hex => { const n = parseInt(String(hex || "#000000").slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
/* jsPDF:s standardtypsnitt klarar bara Latin-1: ta bort emoji och liknande. */
const pdfTxt = s => String(s ?? "").replace(/[–—]/g, "-").replace(/[→]/g, "->").replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "").replace(/\s{2,}/g, " ").trim();
async function exportDaySheet(day, ueId) {
  if (!plan || !plan.calib) { alert("Kalibrera planen först."); return; }
  setBusy("Dagblad: förbereder…");
  try {
    await loadScript(JSPDF_URL);
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
    const W = 420, H = 297, M = 8;
    const ue = ueById(ueId), iss = computeDailyIssues(day);
    const its = dayItems(day);
    const crews = its.filter(x => x.type === "crew" && (!ueId || x.ue === ueId)).sort((a, b) => ueShort(ueById(a.ue)).localeCompare(ueShort(ueById(b.ue)), "sv"));
    const dels = its.filter(x => x.type === "delivery").sort(byTime), lifts = its.filter(x => x.type === "lift").sort(byTime);
    const printed = new Date().toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
    const header = (cont) => {
      doc.setFillColor(15, 23, 42); doc.rect(0, 0, W, 17, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(17);
      doc.text(pdfTxt(`DAGSPLANERING${ue ? " - " + ue.name : ""}${cont ? " (forts.)" : ""}`), M, 11.5);
      doc.setFont("helvetica", "normal"); doc.setFontSize(12);
      doc.text(pdfTxt(`${dayLong(day)} · vecka ${dayWeekNo(day)}`), W / 2 - 10, 11.5);
      doc.setFontSize(9); doc.text(pdfTxt(`${plan.name || ""} · projekt ${projectId}`), W - M, 11.5, { align: "right" });
      doc.setTextColor(17, 24, 39);
    };
    const footer = () => { doc.setFontSize(7.5); doc.setTextColor(107, 114, 128); doc.text(pdfTxt(`Lägesplan · 4D-planering · utskriven ${printed}${settings.userName ? " av " + settings.userName : ""}`), M, H - 4); doc.text(`Sida ${doc.getNumberOfPages()}`, W - M, H - 4, { align: "right" }); doc.setTextColor(17, 24, 39); };
    header(false);
    const wxLine = typeof weatherPdfLine === "function" ? weatherPdfLine(day) : "";
    if (wxLine) { doc.setFontSize(9); doc.setTextColor(30, 64, 175); doc.text(pdfTxt(wxLine), W - M, 20.3, { align: "right" }); doc.setTextColor(17, 24, 39); }
    // Kartan.
    const mb = { x: M, y: 21, w: 262, h: 168 };
    const el = dayMapEl(day, mb.w, mb.h);
    const pxW = Math.round(mb.w / 25.4 * 160), pxH = Math.round(mb.h / 25.4 * 160);
    const map = await renderMapCanvas(el, mb.w, mb.h, pxW, pxH, { status: s => setBusy("Dagblad: " + s) });
    doc.addImage(map.toDataURL("image/jpeg", 0.88), "JPEG", mb.x, mb.y, mb.w, mb.h);
    doc.setDrawColor(17, 24, 39); doc.setLineWidth(0.3); doc.rect(mb.x, mb.y, mb.w, mb.h);
    doc.setFontSize(7.5); doc.text(`Skala 1:${el.scale} (A3)`, mb.x + 1.5, mb.y + mb.h - 1.5);
    // Höger: leveranser, lyft, risker, anteckningar.
    const rx = 276, rw = W - M - rx;
    let y = 24;
    const h2 = t => { doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(17, 24, 39); doc.text(pdfTxt(t), rx, y); doc.setDrawColor(203, 213, 225); doc.line(rx, y + 1.3, rx + rw, y + 1.3); y += 5.5; doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); };
    const line = (t, color, indent = 0) => { const ls = doc.splitTextToSize(pdfTxt(t), rw - indent); if (y + ls.length * 3.6 > 186) return false; doc.setTextColor(...(color || [17, 24, 39])); doc.text(ls, rx + indent, y); y += ls.length * 3.6 + 0.8; doc.setTextColor(17, 24, 39); return true; };
    h2(`Leveranser (${dels.length})`);
    if (!dels.length) line("Inga leveranser.", [107, 114, 128]);
    dels.forEach(x => { const V = VEHICLES[x.veh] || {}, u = ueById(x.ue); line(`${x.time || "--:--"}  ${V.label || "Leverans"}${x.what ? ": " + x.what : ""}${u ? " (" + ueShort(u) + ")" : ""}${placeOf(x) ? " · " + placeOf(x) : ""}`); });
    y += 2; h2(`Lyft (${lifts.length})`);
    if (!lifts.length) line("Inga lyft bokade.", [107, 114, 128]);
    lifts.forEach(x => { const inf = liftInfo(x, day), u = ueById(x.ue); line(`${x.time || "--:--"}  ${x.what || "Lyft"}${inf.load ? ` ${fmtT(inf.load)} t` : ""}${inf.crane ? ` · ${inf.crane.name} ${fmtM(inf.dist)} m` : ""}${u ? " (" + ueShort(u) + ")" : ""} · riskområde ${Number(x.zone) || 5} m${inf.bad ? " - OBS: " + inf.bad : ""}`, inf.bad ? [185, 28, 28] : null); });
    y += 2;
    const risks = iss.list.filter(i => i.sev !== "info" && (!ueId || i.ids.some(id => crews.some(c => c.id === id)) || i.ids.some(id => !siteItems.some(s => s.id === id && s.type === "crew"))));
    const barriers = siteItems.filter(x => x.type === "barrier" && activeOn(x, day));
    h2(`Risker och krockar (${risks.length})`);
    if (!risks.length) line("Inga krockar upptäckta.", [21, 128, 61]);
    risks.forEach(i => line(`${i.sev === "krock" ? "KROCK" : "Varning"}: ${i.text}`, i.sev === "krock" ? [185, 28, 28] : [180, 83, 9]));
    if (barriers.length) line(`Avspärrningar: ${barriers.map(b => b.name || "(utan namn)").join(", ")}`, [75, 85, 99]);
    if (y < 170) { y += 2; h2("Anteckningar"); doc.setDrawColor(203, 213, 225); for (let ly = y + 4; ly < 187; ly += 7) doc.line(rx, ly, rx + rw, ly); }
    // Tabellen: dagens lag.
    const cols = [["UE", 50], ["Plats", 22], ["Arbetsuppgift", 74], ["Aktivitet (4D)", 80], ["Pers.", 14], ["Kontakt", 44], ["Telefon", 30], ["Notering", 0]];
    cols[cols.length - 1][1] = W - 2 * M - cols.slice(0, -1).reduce((a, c) => a + c[1], 0);
    let ty = 196;
    const tHead = () => {
      doc.setFillColor(241, 245, 249); doc.rect(M, ty - 4.5, W - 2 * M, 6.5, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(17, 24, 39);
      let cx = M + 1.5; cols.forEach(([t, w]) => { doc.text(t, cx, ty); cx += w; });
      ty += 5; doc.setFont("helvetica", "normal");
    };
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.text(pdfTxt(`Dagens lag (${crews.length}) · ${crews.reduce((a, x) => a + (Number(x.persons) || 0), 0)} personer`), M, 193 - 1);
    ty = 199; tHead();
    if (!crews.length) { doc.setFontSize(9); doc.setTextColor(107, 114, 128); doc.text("Inga lag planerade.", M + 1.5, ty + 1); }
    crews.forEach(x => {
      const u = ueById(x.ue), act = x.act ? famInfo(x.act, day) : null, i = iss.byId.get(x.id);
      const cells = [`${ueShort(u)}  ${u ? u.name || "" : ""}`, placeOf(x), x.task || "", act ? `${act.title}${act.area ? " · " + act.area : ""} (${act.progress} %)` : "", x.persons ? String(x.persons) : "",
        u ? u.contact || "" : "", u ? u.phone || "" : "", [x.note, i && i.sev !== "info" ? `${i.sev === "krock" ? "KROCK" : "OBS"}: ${i.texts.join("; ")}` : ""].filter(Boolean).join(" · ")];
      doc.setFontSize(8.5);
      const wrapped = cells.map((c, k) => doc.splitTextToSize(pdfTxt(c), cols[k][1] - 3 - (k === 0 ? 4 : 0)));
      const rh = Math.max(6, Math.max(...wrapped.map(w => w.length)) * 3.6 + 2.4);
      if (ty + rh > H - 9) { footer(); doc.addPage(); header(true); ty = 27; tHead(); }
      let cx = M + 1.5;
      doc.setFillColor(...pdfRgb(ueColor(u))); doc.rect(cx, ty - 2.8, 3, 3, "F");
      wrapped.forEach((w, k) => {
        doc.setTextColor(...(k === 7 && i && i.sev === "krock" ? [185, 28, 28] : [17, 24, 39]));
        if (k === 0) doc.setFont("helvetica", "bold");
        doc.text(w, cx + (k === 0 ? 4 : 0), ty);
        if (k === 0) doc.setFont("helvetica", "normal");
        cx += cols[k][1];
      });
      doc.setDrawColor(226, 232, 240); doc.line(M, ty + rh - 3.6, W - M, ty + rh - 3.6);
      ty += rh;
    });
    footer();
    const fn = `Dagblad ${day}${ue ? " " + ueShort(ue) : ""}.pdf`;
    downloadBlob(doc.output("blob"), fn);
    setSaveStatus(`✓ ${fn} sparad`);
  } catch (e) {
    console.error(e);
    alert("Kunde inte skapa dagbladet: " + e.message);
  } finally { setBusy(""); }
}

// ---------------------------------------------------------------------
// Veckan till Excel
// ---------------------------------------------------------------------
async function exportWeekExcel(day) {
  setBusy("Skapar Excel-filen…");
  try {
    await loadScript(XLSX_URL);
    const days = weekDaysOf(day), wk = dayWeekNo(day);
    const plan1 = [];
    days.forEach(d => {
      const iss = computeDailyIssues(d);
      dayItems(d).sort((a, b) => (a.type === "crew") - (b.type === "crew") || byTime(a, b)).forEach(x => {
        const u = ueById(x.ue), i = iss.byId.get(x.id);
        const base = { Datum: d, Dag: WEEKDAYS_SV[dayDate(d).getDay()], Typ: SITE_KINDS[x.type].label, UE: u ? u.name || "" : "", Förkortning: u ? ueShort(u) : "", Plats: placeOf(x) };
        if (x.type === "crew") {
          const act = x.act ? famInfo(x.act, d) : null;
          plan1.push({ ...base, Tid: "", Arbetsuppgift: x.task || "", "Aktivitet (4D)": act ? act.title : "", "Framdrift %": act ? act.progress : "", "Personer plan": x.persons ?? "", "Personer utfall": x.actual ?? "",
            Kontakt: u ? u.contact || "" : "", Telefon: u ? u.phone || "" : "", Notering: x.note || "", Varningar: i ? i.texts.join("; ") : "" });
        } else {
          const V = VEHICLES[x.veh] || {}, inf = x.type === "lift" ? liftInfo(x, d) : null;
          plan1.push({ ...base, Tid: x.time || "", Arbetsuppgift: x.type === "delivery" ? `${V.label || ""}${x.what ? ": " + x.what : ""}` : `${x.what || "Lyft"}${inf && inf.load ? ` ${inf.load} t` : ""}${inf && inf.crane ? ` (${inf.crane.name}, ${fmtM(inf.dist)} m)` : ""}`,
            "Aktivitet (4D)": "", "Framdrift %": "", "Personer plan": "", "Personer utfall": "", Kontakt: u ? u.contact || "" : "", Telefon: u ? u.phone || "" : "", Notering: x.note || "", Varningar: i ? i.texts.join("; ") : "" });
        }
      });
    });
    const st = staffing(days);
    const aoa = [["UE", "Namn", ...days.map(d => `${WEEKDAYS_SV[dayDate(d).getDay()]} ${d.slice(5)}`), "Summa"]];
    st.forEach(r => {
      aoa.push([ueShort(r.ue), r.ue ? r.ue.name || "" : "(ingen UE)", ...days.map(d => (r.cells[d] || {}).plan || 0), days.reduce((a, d) => a + ((r.cells[d] || {}).plan || 0), 0)]);
      if (days.some(d => (r.cells[d] || {}).hasActual)) aoa.push(["", "  på plats (utfall)", ...days.map(d => (r.cells[d] || {}).hasActual ? r.cells[d].actual : ""), ""]);
    });
    aoa.push(["", "Totalt planerat", ...days.map(d => st.reduce((a, r) => a + ((r.cells[d] || {}).plan || 0), 0)), st.reduce((a, r) => a + days.reduce((b, d) => b + ((r.cells[d] || {}).plan || 0), 0), 0)]);
    const risks = [];
    days.forEach(d => computeDailyIssues(d).list.forEach(i => risks.push({ Datum: d, Dag: WEEKDAYS_SV[dayDate(d).getDay()], Typ: i.sev === "krock" ? "Krock" : i.sev === "varning" ? "Varning" : "Info", Beskrivning: i.text })));
    const wb = XLSX.utils.book_new();
    const s1 = XLSX.utils.json_to_sheet(plan1.length ? plan1 : [{ Datum: "", Info: "Inget planerat" }]);
    s1["!cols"] = [10, 5, 10, 24, 8, 8, 6, 36, 30, 10, 10, 10, 18, 14, 30, 40].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, s1, `Vecka ${wk}`);
    const s2 = XLSX.utils.aoa_to_sheet(aoa); s2["!cols"] = [{ wch: 8 }, { wch: 28 }, ...days.map(() => ({ wch: 10 })), { wch: 8 }];
    XLSX.utils.book_append_sheet(wb, s2, "Bemanning");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(risks.length ? risks : [{ Datum: "", Beskrivning: "Inga krockar" }]), "Krockar");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ues().map(u => ({ Förkortning: ueShort(u), Namn: u.name || "", Arbete: u.trade || "", Kontakt: u.contact || "", Telefon: u.phone || "" }))), "UE");
    XLSX.writeFile(wb, `Dagsplanering vecka ${wk} (${days[0]}).xlsx`);
  } catch (e) {
    alert("Kunde inte skapa Excel-filen: " + e.message);
  } finally { setBusy(""); }
}

// ---------------------------------------------------------------------
// Koppling till resten av Lägesplan
// ---------------------------------------------------------------------
(function hookLabels() {
  const orig = siteItemLabel;
  siteItemLabel = function (x) {
    if (x.type === "crew") return `${ueShort(ueById(x.ue))}${x.persons ? " ×" + x.persons : ""} · ${x.from ? dayShort(x.from) : ""}${x.task ? " · " + x.task : ""}`;
    if (x.type === "delivery") return `${(VEHICLES[x.veh] || {}).label || "Leverans"} · ${x.from ? dayShort(x.from) : ""} ${x.time || ""}`.trim();
    if (x.type === "lift") return `Lyft · ${x.from ? dayShort(x.from) : ""} ${x.time || ""}${x.what ? " · " + x.what : ""}`;
    return orig.apply(this, arguments);
  };
})();
document.addEventListener("DOMContentLoaded", () => {
  // Paneler ritas om när posterna eller datumet ändras.
  const origPanel = renderLayerPanel;
  renderLayerPanel = function () { const r = origPanel.apply(this, arguments); renderDaySoon(); return r; };
  const origDate = onDateChanged;
  onDateChanged = function () { const r = origDate.apply(this, arguments); renderDaySoon(true); return r; };
  ["dateInput", "dateSlider"].forEach(id => { const el = $(id); if (el) { el.addEventListener("change", () => renderDaySoon(true)); el.addEventListener("input", () => renderDaySoon(true)); } });
  const origUi = updateSiteUi;
  updateSiteUi = function () { const r = origUi.apply(this, arguments); if (!siteTool) dailyTool = null; renderDaySoon(); return r; };
  document.querySelectorAll('details.sec[data-sec="dayweek"], details.sec[data-sec="dayhist"]').forEach(d => d.addEventListener("toggle", () => renderDaySoon(true)));
  if ($("btnFieldDay")) {
    $("btnFieldDay").onclick = () => ($("fieldDay").classList.contains("hidden") ? openFieldDay() : closeFieldDay());
    $("btnFieldDayClose").onclick = closeFieldDay;
    const ofs = typeof openFieldSheet === "function" ? openFieldSheet : null;
    if (ofs) openFieldSheet = function () { closeFieldDay(); return ofs.apply(this, arguments); };
  }
  renderDaySoon(true);
});
