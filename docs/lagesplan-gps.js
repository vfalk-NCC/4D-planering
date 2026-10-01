/* Lägesplan – foton med GPS (Victors önskemål 2026-10-01, iPad ute på bygget).

   Positionen hämtas ur fotots EXIF-data, eller – för ett foto som just tagits
   – från iPadens egen position. GPS (WGS84) räknas om till SWEREF 99
   (Lantmäteriets formler för Gauss–Krüger). Modellen ligger i samma system
   som ortofotonas världsfiler, men vilken SWEREF-zon (TM eller en lokal zon,
   t.ex. 18 00) vet vi inte, så den zon som hamnar närmast planens
   kalibreringspunkter väljs (projektet använder SWEREF 99 20 15, som då
   väljs automatiskt). Ligger ingen zon i närheten används vanlig
   placering (tryck på planen). Förslaget visas med en ring för noggrannheten:
   "Spara här" eller tryck på planen för att flytta det. */

const SWEREF_ZONES = [
  { name: "SWEREF 99 TM", lam0: 15, k0: 0.9996, FE: 500000 },
  ...[["12 00", 12], ["13 30", 13.5], ["15 00", 15], ["16 30", 16.5], ["18 00", 18], ["14 15", 14.25], ["15 45", 15.75],
    ["17 15", 17.25], ["18 45", 18.75], ["20 15", 20.25], ["21 45", 21.75], ["23 15", 23.25]].map(([n, l]) => ({ name: "SWEREF 99 " + n, lam0: l, k0: 1, FE: 150000 })),
];
/* WGS84/GRS80 lat/lon (grader) -> [N, E] i en Gauss–Krüger-projektion. */
function geodeticToGrid(latDeg, lonDeg, z) {
  const a = 6378137, f = 1 / 298.257222101, e2 = f * (2 - f), n = f / (2 - f);
  const ar = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
  const A = e2, B = (5 * e2 ** 2 - e2 ** 3) / 6, C = (104 * e2 ** 3 - 45 * e2 ** 4) / 120, D = 1237 * e2 ** 4 / 1260;
  const b1 = n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16 + 41 * n ** 4 / 180, b2 = 13 * n * n / 48 - 3 * n ** 3 / 5 + 557 * n ** 4 / 1440;
  const b3 = 61 * n ** 3 / 240 - 103 * n ** 4 / 140, b4 = 49561 * n ** 4 / 161280;
  const r = Math.PI / 180, phi = latDeg * r, dl = (lonDeg - z.lam0) * r, s = Math.sin(phi);
  const ps = phi - s * Math.cos(phi) * (A + B * s ** 2 + C * s ** 4 + D * s ** 6);
  const xi = Math.atan(Math.tan(ps) / Math.cos(dl)), eta = Math.atanh(Math.cos(ps) * Math.sin(dl));
  const N = z.k0 * ar * (xi + b1 * Math.sin(2 * xi) * Math.cosh(2 * eta) + b2 * Math.sin(4 * xi) * Math.cosh(4 * eta) + b3 * Math.sin(6 * xi) * Math.cosh(6 * eta) + b4 * Math.sin(8 * xi) * Math.cosh(8 * eta));
  const E = z.k0 * ar * (eta + b1 * Math.cos(2 * xi) * Math.sinh(2 * eta) + b2 * Math.cos(4 * xi) * Math.sinh(4 * eta) + b3 * Math.cos(6 * xi) * Math.sinh(6 * eta) + b4 * Math.cos(8 * xi) * Math.sinh(8 * eta)) + z.FE;
  return [N, E];
}
/* GPS -> modellkoordinat (meter, x = öst, y = norr) i den zon som passar
   planen. null om ingen zon hamnar inom 20 km från kalibreringspunkterna. */
function gpsToModel(lat, lon) {
  if (!plan || !plan.calib) return null;
  const ref = plan.calib.model[0];
  let best = null;
  SWEREF_ZONES.forEach(z => {
    const [N, E] = geodeticToGrid(lat, lon, z);
    const d = Math.hypot(E - ref[0], N - ref[1]);
    if (!best || d < best.d) best = { d, m: [E, N], zone: z.name };
  });
  return best && best.d < 20000 ? best : null;
}

/* EXIF i en JPEG: GPS-position och tagningsdatum (null om det saknas). */
async function readExifGps(file) {
  try {
    const buf = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (buf.getUint16(0) !== 0xFFD8) return null;
    let o = 2;
    while (o < buf.byteLength - 4) {
      const marker = buf.getUint16(o), len = buf.getUint16(o + 2);
      if (marker === 0xFFE1 && buf.getUint32(o + 4) === 0x45786966) return parseExif(buf, o + 10);
      if ((marker & 0xFF00) !== 0xFF00) break;
      o += 2 + len;
    }
  } catch (e) { /* ingen EXIF */ }
  return null;
}
function parseExif(v, t) {
  const le = v.getUint16(t) === 0x4949;
  const u16 = p => v.getUint16(t + p, le), u32 = p => v.getUint32(t + p, le);
  const ifd = p => { const n = u16(p), tags = {}; for (let i = 0; i < n; i++) { const e = p + 2 + i * 12; tags[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 }; } return tags; };
  const rat = (p, k) => { const off = u32(p); return u32(off + k * 8) / (u32(off + k * 8 + 4) || 1); };
  const ascii = tg => { const n = tg.count, off = n > 4 ? u32(tg.at) : tg.at; let s = ""; for (let i = 0; i < n - 1; i++) s += String.fromCharCode(v.getUint8(t + off + i)); return s; };
  const ifd0 = ifd(u32(4)), out = {};
  if (ifd0[0x8769]) { const ex = ifd(u32(ifd0[0x8769].at)); if (ex[0x9003]) { const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(ascii(ex[0x9003])); if (m) out.date = `${m[1]}-${m[2]}-${m[3]}`; } }
  if (ifd0[0x8825]) {
    const g = ifd(u32(ifd0[0x8825].at));
    if (g[2] && g[4]) {
      const dms = tg => rat(tg.at, 0) + rat(tg.at, 1) / 60 + rat(tg.at, 2) / 3600;
      let lat = dms(g[2]), lon = dms(g[4]);
      if (g[1] && ascii(g[1]) === "S") lat = -lat;
      if (g[3] && ascii(g[3]) === "W") lon = -lon;
      if (Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon)) { out.lat = lat; out.lon = lon; out.acc = g[31] ? rat(g[31].at, 0) : null; }
    }
  }
  return out;
}

/* iPadens position (startas direkt vid knapptrycket, så frågan om behörighet
   kommer medan man väljer/tar bilden). */
let gpsWatch = null;
function startDevicePosition() {
  if (!navigator.geolocation) return null;
  const started = Date.now();
  gpsWatch = new Promise(res => {
    navigator.geolocation.getCurrentPosition(
      p => res({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, at: started }),
      () => res(null), { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 });
  });
  return gpsWatch;
}

/* Förslaget som visas på planen tills man sparar eller flyttar det. */
let gpsSuggest = null; // { pt: [pdf], acc (m), src, zone, gps: {lat, lon, acc, src} }
function drawGpsSuggest(ctx) {
  if (!gpsSuggest || !photoPlacing) return;
  const [x, y] = toPx(gpsSuggest.pt), ppm = pxPerMeter();
  const r = Math.max(10, (gpsSuggest.acc || 5) * ppm), s = 16 / view.scale; // pricken: ~16 px på skärmen
  ctx.save();
  ctx.fillStyle = "rgba(37,99,235,.12)"; ctx.strokeStyle = "rgba(37,99,235,.7)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#2563eb"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, s * 0.35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

/* 📷 med GPS: välj/ta bilden → position (EXIF, annars iPaden om bilden är
   färsk) → förslag på planen. Utan position: tryck på planen som förut. */
function startGpsPhoto() {
  if (!plan || !viewport) return;
  if (photoPlacing) { cancelPhotoPlacing(); return; }
  gpsSuggest = null;
  startDevicePosition();
  startPhotoPlacing.gps = true;
  $("photoInput").click();
}
async function suggestPhotoPosition(file) {
  const exif = await readExifGps(file);
  if (exif && exif.date) file.__exifDate = exif.date;
  let pos = exif && exif.lat !== undefined ? { lat: exif.lat, lon: exif.lon, acc: exif.acc || 10, src: "foto" } : null;
  // iPadens egen position bara för en bild som just tagits (annars kan den vara tagen någon annanstans).
  if (!pos && gpsWatch && file.lastModified && Date.now() - file.lastModified < 15 * 60 * 1000) {
    setStatusMsg("Hämtar iPadens position…");
    const p = await gpsWatch;
    if (p) pos = { ...p, src: "iPad" };
  }
  if (!pos) return null;
  const hit = gpsToModel(pos.lat, pos.lon);
  if (!hit) return { far: true };
  const pdfPt = modelToPdf(hit.m[0], hit.m[1]);
  return { pt: pdfPt, acc: pos.acc, src: pos.src, zone: hit.zone, gps: { lat: +pos.lat.toFixed(7), lon: +pos.lon.toFixed(7), acc: pos.acc ? Math.round(pos.acc) : null, src: pos.src, zone: hit.zone } };
}
function setStatusMsg(t) { if (typeof setSaveStatus === "function") setSaveStatus(t); }
