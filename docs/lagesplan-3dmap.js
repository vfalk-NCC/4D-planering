/* 3D-vyn – bakgrundskarta (Victor 2026-10-24: "lägg in en karta i bakgrunden med skanningar från området med höjder … du vet sweref och koordinater").

   Kartplattor (OpenStreetMap, satellit eller egen XYZ-adress) läggs som textur på ett nät som ritas i modellens koordinater: varje hörn räknas om från
   WGS84 (lat/lon) till projektets SWEREF-zon (SWEREF 99 20 15 som standard, väljs under kugghjulet) med Lantmäteriets Gauss–Krüger-formler (lagesplan-gps.js)
   och tillbaka (inversen här). Höjder: "Följ markhöjden" hämtar höjdplattor (Terrarium-format, AWS Terrain Tiles – globala, grova: ca 10–30 m i Sverige) och
   lyfter nätet efter dem; "Skuggad terräng" ritar en reliefskuggad höjdkarta ur samma data utan någon satellitbild. Lantmäteriets egna ortofoton och
   laserskannade höjdmodell (1–2 m) är öppna data men kräver konto/nyckel hos Lantmäteriet – klistra in en egen adress under Källa → Egen adress. */

const l3map = { group: null, seq: 0, sig: "", busy: "", timer: 0, dem: new Map() };
const L3MAP_SRC = {
  osm: ["Karta (OpenStreetMap)", "https://tile.openstreetmap.org/{z}/{x}/{y}.png", "© OpenStreetMap-bidragsgivare", 19],
  esri: ["Satellit (Esri World Imagery)", "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", "© Esri, Maxar, Earthstar Geographics", 19],
  eox: ["Satellit (Sentinel-2, 10 m)", "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg", "Sentinel-2 cloudless © EOX (Copernicus)", 13],
  hill: ["Skuggad terräng (höjddata)", null, "Höjddata: Mapzen/AWS Terrain Tiles", 13],
  custom: ["Egen adress (XYZ)…", "", "", 20],
};
const L3MAP_DEM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const l3mapP = (k, d) => { const v = l3Prefs()[k]; return v == null || v === "" ? d : v; };
const l3mapZone = () => { const n = l3mapP("mapZone", "SWEREF 99 20 15"); return (typeof SWEREF_ZONES !== "undefined" && SWEREF_ZONES.find(z => z.name === n)) || (typeof SWEREF_ZONES !== "undefined" ? SWEREF_ZONES[0] : null); };

/* Inversen till geodeticToGrid: [N, E] i zonen -> [lat, lon] (grader). Lantmäteriets Krüger-serier för GRS80. */
function l3mapGridToGeo(N, E, z) {
  const a = 6378137, f = 1 / 298.257222101, e2 = f * (2 - f), n = f / (2 - f), ar = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
  const d1 = n / 2 - 2 * n * n / 3 + 37 * n ** 3 / 96 - n ** 4 / 360, d2 = n * n / 48 + n ** 3 / 15 - 437 * n ** 4 / 1440, d3 = 17 * n ** 3 / 480 - 37 * n ** 4 / 840, d4 = 4397 * n ** 4 / 161280;
  const xi = N / (z.k0 * ar), eta = (E - z.FE) / (z.k0 * ar);
  const xp = xi - (d1 * Math.sin(2 * xi) * Math.cosh(2 * eta) + d2 * Math.sin(4 * xi) * Math.cosh(4 * eta) + d3 * Math.sin(6 * xi) * Math.cosh(6 * eta) + d4 * Math.sin(8 * xi) * Math.cosh(8 * eta));
  const ep = eta - (d1 * Math.cos(2 * xi) * Math.sinh(2 * eta) + d2 * Math.cos(4 * xi) * Math.sinh(4 * eta) + d3 * Math.cos(6 * xi) * Math.sinh(6 * eta) + d4 * Math.cos(8 * xi) * Math.sinh(8 * eta));
  const chi = Math.asin(Math.sin(xp) / Math.cosh(ep)), A = e2 + e2 ** 2 + e2 ** 3 + e2 ** 4, B = -(7 * e2 ** 2 + 17 * e2 ** 3 + 30 * e2 ** 4) / 6, C = (224 * e2 ** 3 + 889 * e2 ** 4) / 120, D = -4279 * e2 ** 4 / 1260;
  const s = Math.sin(chi), phi = chi + s * Math.cos(chi) * (A + B * s * s + C * s ** 4 + D * s ** 6), lam = z.lam0 * Math.PI / 180 + Math.atan2(Math.sinh(ep), Math.cos(xp));
  return [phi * 180 / Math.PI, lam * 180 / Math.PI];
}
const l3mapTx = (lon, z) => (lon + 180) / 360 * 2 ** z;
const l3mapTy = (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.asinh(Math.tan(r)) / Math.PI) / 2 * 2 ** z; };
const l3mapLon = (x, z) => x / 2 ** z * 360 - 180;
const l3mapLat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** z))) * 180 / Math.PI;
/* Modellkoordinat (x = öst, y = norr) -> [lat, lon] och tillbaka. */
const l3mapModelToGeo = (x, y, zone) => l3mapGridToGeo(y, x, zone);
const l3mapGeoToModel = (lat, lon, zone) => { const [N, E] = geodeticToGrid(lat, lon, zone); return [E, N]; };

function l3mapImg(url) {
  return new Promise(res => { const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });
}
/* Höjdplatta (Terrarium: m = R·256 + G + B/256 − 32768) som Float32Array 256×256 (eller bildens storlek). */
async function l3mapDemTile(z, x, y) {
  const key = z + "/" + x + "/" + y; if (l3map.dem.has(key)) return l3map.dem.get(key);
  const tpl = l3mapP("mapDemUrl", L3MAP_DEM), p = (async () => {
    const im = await l3mapImg(tpl.replace("{z}", z).replace("{x}", x).replace("{y}", y)); if (!im) return null;
    const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height; const cx = cv.getContext("2d", { willReadFrequently: true }); cx.drawImage(im, 0, 0);
    let d; try { d = cx.getImageData(0, 0, im.width, im.height).data; } catch (e) { return null; }
    const h = new Float32Array(im.width * im.height); for (let i = 0; i < h.length; i++) h[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
    return { h, w: im.width, hh: im.height };
  })();
  l3map.dem.set(key, p); return p;
}
/* Markhöjd (m) i lat/lon ur redan hämtade plattor (zoom zd). */
function l3mapElev(tiles, zd, lat, lon) {
  const fx = l3mapTx(lon, zd), fy = l3mapTy(lat, zd), tx = Math.floor(fx), ty = Math.floor(fy), t = tiles.get(zd + "/" + tx + "/" + ty); if (!t) return null;
  const px = Math.min(t.w - 1.001, Math.max(0, (fx - tx) * t.w - 0.5)), py = Math.min(t.hh - 1.001, Math.max(0, (fy - ty) * t.hh - 0.5)), i = Math.floor(px), j = Math.floor(py), u = px - i, v = py - j, g = (a, b) => t.h[b * t.w + a];
  return g(i, j) * (1 - u) * (1 - v) + g(i + 1, j) * u * (1 - v) + g(i, j + 1) * (1 - u) * v + g(i + 1, j + 1) * u * v;
}
/* Reliefskuggad höjdkarta (ljus från nordväst) med lätt höjdfärg. */
function l3mapHillTex(tiles, zd, z, x, y, size = 128) {
  const cv = document.createElement("canvas"); cv.width = cv.height = size; const cx = cv.getContext("2d"), im = cx.createImageData(size, size), el = new Float32Array((size + 2) * (size + 2));
  const sample = (u, v) => { const lat = l3mapLat(y + v, z), lon = l3mapLon(x + u, z); return l3mapElev(tiles, zd, lat, lon); };
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < size + 2; j++) for (let i = 0; i < size + 2; i++) { const e = sample((i - 1 + 0.5) / size, (j - 1 + 0.5) / size); el[j * (size + 2) + i] = e == null ? 0 : e; if (e != null) { lo = Math.min(lo, e); hi = Math.max(hi, e); } }
  const cell = (40075016.7 * Math.cos(l3mapLat(y + 0.5, z) * Math.PI / 180)) / (2 ** z * size), W = size + 2, ramp = [[0, [196, 220, 168]], [0.5, [236, 232, 190]], [1, [200, 170, 140]]];
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const c = (j + 1) * W + i + 1, dzdx = (el[c + 1] - el[c - 1]) / (2 * cell), dzdy = (el[c + W] - el[c - W]) / (2 * cell), sl = Math.atan(Math.hypot(dzdx, dzdy) * 2.2), asp = Math.atan2(dzdy, -dzdx);
    const az = 315 * Math.PI / 180, alt = 40 * Math.PI / 180, sh = Math.max(0, Math.sin(alt) * Math.cos(sl) + Math.cos(alt) * Math.sin(sl) * Math.cos(az - asp)), t = hi > lo ? (el[c] - lo) / (hi - lo) : 0.5;
    const k = t < 0.5 ? [0, 1] : [1, 2], u = (t - (k[0] === 0 ? 0 : 0.5)) / 0.5, A = ramp[k[0]][1], B = ramp[k[1]][1], o = (j * size + i) * 4, m = 0.45 + 0.75 * sh;
    for (let q = 0; q < 3; q++) im.data[o + q] = Math.max(0, Math.min(255, (A[q] + (B[q] - A[q]) * Math.max(0, Math.min(1, u))) * m)); im.data[o + 3] = 255;
  }
  cx.putImageData(im, 0, 0); const tx = new THREE.CanvasTexture(cv); return tx;
}

async function l3mapBuild() {
  if (!l3 || !plan || !plan.calib || typeof geodeticToGrid !== "function") return;
  const on = l3Prefs().mapOn === true, seq = ++l3map.seq;
  if (!l3map.group) { l3map.group = new THREE.Group(); l3map.group.name = "map"; l3map.group.renderOrder = -2; l3.scene.add(l3map.group); l3.groups.map = l3map.group; }
  const src = l3mapP("mapSrc", "osm"), R = Number(l3mapP("mapR", 1)) * 1000, terrain = l3mapP("mapTerrain", false) === true, ex = Number(l3mapP("mapEx", 1)), op = Number(l3mapP("mapOp", 100)) / 100, dzU = Number(l3mapP("mapDz", 0)) || 0, det = Number(l3mapP("mapDet", 0)) || 0;
  const zone = l3mapZone(), tpl = src === "custom" ? l3mapP("mapUrl", "") : (L3MAP_SRC[src] || L3MAP_SRC.osm)[1], maxZ = (L3MAP_SRC[src] || L3MAP_SRC.osm)[3], useTerr = terrain || src === "hill";
  const sig = [on, src, R, useTerr, ex, op, dzU, det, zone && zone.name, tpl, l3.O.join(","), plan.id].join("|");
  if (sig === l3map.sig) return; l3map.sig = sig;
  l3Clear(l3map.group); l3map.group.visible = on;
  const lic = document.getElementById("v3MapLic"); if (!on) { if (lic) lic.classList.add("hidden"); l3map.busy = ""; l3Render(); if (typeof l3LayersRender === "function") l3LayersRender(); return; }
  if (!zone || (src !== "hill" && !tpl)) { l3map.busy = "Ange en kartadress under kugghjulet"; return; }
  const O = l3.O, ref = [O[0], O[1]], corners = [[-R, -R], [R, -R], [R, R], [-R, R]].map(([dx, dy]) => l3mapModelToGeo(ref[0] + dx, ref[1] + dy, zone));
  const lats = corners.map(c => c[0]), lons = corners.map(c => c[1]), la0 = Math.min(...lats), la1 = Math.max(...lats), lo0 = Math.min(...lons), lo1 = Math.max(...lons);
  let z = maxZ, tx0, tx1, ty0, ty1; for (; z > 3; z--) { tx0 = Math.floor(l3mapTx(lo0, z)); tx1 = Math.floor(l3mapTx(lo1, z)); ty0 = Math.floor(l3mapTy(la1, z)); ty1 = Math.floor(l3mapTy(la0, z)); if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= ([36, 100, 220][det] || 36)) break; }
  const list = []; for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) list.push([tx, ty]);
  const zd = Math.min(13, z), segs = useTerr ? 12 : 2, demNeeded = new Set(), geo = list.map(([tx, ty]) => { const v = []; for (let j = 0; j <= segs; j++) for (let i = 0; i <= segs; i++) { const lat = l3mapLat(ty + j / segs, z), lon = l3mapLon(tx + i / segs, z); v.push([lat, lon]); if (useTerr) demNeeded.add(Math.floor(l3mapTx(lon, zd)) + "/" + Math.floor(l3mapTy(lat, zd))); } return v; });
  l3map.busy = `Hämtar karta (${list.length} plattor)…`; if (typeof l3LayersRender === "function") l3LayersRender();
  const tiles = new Map(); if (useTerr) await Promise.all([...demNeeded].map(async k => { const [a, b] = k.split("/").map(Number), t = await l3mapDemTile(zd, a, b); if (t) tiles.set(zd + "/" + k, t); }));
  if (seq !== l3map.seq) return;
  let ok = 0, fail = 0; const z0 = l3sZ(); let elevO = null; if (useTerr) { const g0 = l3mapModelToGeo(O[0], O[1], zone); elevO = l3mapElev(tiles, zd, g0[0], g0[1]); }
  await Promise.all(list.map(async ([tx, ty], idx) => {
    const tex = src === "hill" ? l3mapHillTex(tiles, zd, z, tx, ty) : await new Promise(res => new THREE.TextureLoader().setCrossOrigin("anonymous").load(tpl.replace("{z}", z).replace("{x}", tx).replace("{y}", ty), t => res(t), undefined, () => res(null)));
    if (seq !== l3map.seq) return; if (!tex) { fail++; return; }
    const pos = new Float32Array((segs + 1) ** 2 * 3), uv = new Float32Array((segs + 1) ** 2 * 2), V = geo[idx];
    V.forEach(([lat, lon], k) => { const [mx, my] = l3mapGeoToModel(lat, lon, zone), e = useTerr ? l3mapElev(tiles, zd, lat, lon) : null;
      pos[k * 3] = mx - O[0]; pos[k * 3 + 1] = my - O[1]; pos[k * 3 + 2] = useTerr && e != null ? (e - O[2]) * ex + dzU - 0.2 : z0 + dzU - 0.2; uv[k * 2] = (k % (segs + 1)) / segs; uv[k * 2 + 1] = 1 - Math.floor(k / (segs + 1)) / segs; });
    const ix = []; for (let j = 0; j < segs; j++) for (let i = 0; i < segs; i++) { const a = j * (segs + 1) + i, b = a + 1, c = a + segs + 1, d = c + 1; ix.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); g.setIndex(ix); g.computeBoundingSphere();
    tex.anisotropy = 4; const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: op < 0.999, opacity: op, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }));
    m.userData.noHit = true; m.raycast = () => {}; m.renderOrder = -2; l3map.group.add(m); ok++;
  }));
  if (seq !== l3map.seq) return;
  l3map.busy = fail && !ok ? "Kunde inte hämta kartplattorna (nätverk eller adress)" : ""; l3map.stats = { z, tiles: list.length, ok, fail, terrain: useTerr, elevO, ex };
  let el = document.getElementById("v3MapLic"); const host = document.getElementById("v3Canvas");
  if (host) { if (!el) { el = document.createElement("div"); el.id = "v3MapLic"; el.className = "v3-maplic"; host.appendChild(el); } el.textContent = (src === "custom" ? "Egen karta" : (L3MAP_SRC[src] || [])[2]) + (useTerr ? " · höjder: AWS Terrain Tiles" : ""); el.classList.toggle("hidden", !ok); }
  if (fail && ok) l3Status(`Kartan: ${fail} av ${list.length} plattor kunde inte hämtas.`, true);
  l3Render(); if (typeof l3LayersRender === "function") l3LayersRender();
}
function l3mapRefresh(force) { if (force) l3map.sig = ""; clearTimeout(l3map.timer); l3map.timer = setTimeout(() => l3mapBuild().catch(e => { l3map.busy = "Kartan: " + e.message; console.warn("Karta", e); }), 60); }

/* ---- Lager → Bakgrundskarta ---------------------------------------------------------------------- */
function l3mapSettingsHtml() {
  const esc = escHtml, P = l3Prefs(), src = l3mapP("mapSrc", "osm"), terr = l3mapP("mapTerrain", false) === true;
  const sw = (id, on, label, hint) => `<label class="v3-pcs-r v3-pcs-sw" title="${esc(hint || "")}"><span>${label}</span><span class="v3-lay-sw"><input type="checkbox" id="${id}" role="switch" ${on ? "checked" : ""} /><i></i></span></label>`;
  const sel = (id, opts, v, label) => `<label class="v3-pcs-r v3-pcs-c"><span>${label}</span><select id="${id}">${opts.map(([k, l]) => `<option value="${esc(String(k))}" ${String(v) === String(k) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>`;
  const rng = (id, label, min, max, step, val, out) => `<label class="v3-pcs-r v3-pcs-g"><span>${label}</span><output>${out}</output><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}" /></label>`;
  return `<div class="v3-pcs" data-keep="1">
    ${sel("v3MapSrc", Object.entries(L3MAP_SRC).map(([k, v]) => [k, v[0]]), src, "Källa")}
    <label class="v3-pcs-r v3-pcz-r ${src === "custom" ? "" : "hidden"}" id="v3MapUrlR"><span>Adress</span><input type="text" id="v3MapUrl" placeholder="https://…/{z}/{x}/{y}.png" value="${esc(l3mapP("mapUrl", ""))}" /></label>
    ${sel("v3MapR", [[0.5, "0,5 km"], [1, "1 km"], [2, "2 km"], [3, "3 km"], [5, "5 km"]], l3mapP("mapR", 1), "Område (radie)")}
    ${sw("v3MapTerr", terr || src === "hill", "Följ markhöjden", "Lyfter kartan efter höjddata (grov, ca 10–30 m). Lantmäteriets laserskannade 1–2 m-modell kräver konto hos Lantmäteriet.")}
    ${sel("v3MapDet", [[0, "Normal"], [1, "Hög (fler plattor)"], [2, "Högsta (många plattor, tungt)"]], l3mapP("mapDet", 0), "Detaljnivå")}
    ${rng("v3MapEx", "Höjdöverdrift", 1, 5, 0.5, l3mapP("mapEx", 1), l3mapP("mapEx", 1) + "×")}
    ${rng("v3MapOp", "Täckning", 20, 100, 5, l3mapP("mapOp", 100), l3mapP("mapOp", 100) + " %")}
    <label class="v3-pcs-r v3-pcz-r"><span>Höjdjustering</span><input type="number" step="0.5" id="v3MapDz" value="${l3mapP("mapDz", 0)}" /><em>m</em></label>
    <button type="button" class="v3-link" id="v3MapFit" title="Sänker eller lyfter kartan så att marken ligger vid arbetsytans nollnivå i origo">Passa höjd mot arbetsytan</button>
    ${sel("v3MapZone", (typeof SWEREF_ZONES !== "undefined" ? SWEREF_ZONES : []).map(z => [z.name, z.name]), l3mapP("mapZone", "SWEREF 99 20 15"), "Koordinatsystem")}
    <div class="v3-pal-hint">Kartan placeras med SWEREF-koordinaterna. Höjddata (AWS Terrain Tiles) är grova, ca 10–30 m rutnät, och är inte kalibrerade mot RH2000 – avvikelser på flera decimeter kan finnas. Använd Passa höjd, eller läs in punktmoln eller DXF/IFC för exakta höjder.</div></div>`;
}
function l3mapBody() {
  const st = l3map.stats, on = l3Prefs().mapOn === true;
  return `<div class="v3-pal-hint">${on ? (l3map.busy ? esc0(l3map.busy) : st ? `Kartan visas (${st.ok} av ${st.tiles} plattor${st.terrain ? ", med höjder" : ""}).` : "Laddar…") : "Tänd kartan för att se området runt arbetsytan – satellit, karta eller skuggad terräng. Inställningar under kugghjulet."}</div>`;
}
const esc0 = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function l3mapBind(host) {
  const set = (k, v, rebuild = true) => { l3SetPref(k, v === "" ? null : v); if (rebuild) l3mapRefresh(false); };
  const sw = host.querySelector("[data-lmapsw]"); if (sw) { sw.onclick = e => e.stopPropagation(); sw.onchange = () => { l3SetPref("mapOn", sw.checked); l3mapRefresh(false); }; }
  const bind = (id, fn) => { const el = host.querySelector("#" + id) || document.querySelector("#view3d > .v3-ldd-m #" + id); if (el) fn(el); };
  bind("v3MapSrc", el => { el.onchange = () => { set("mapSrc", el.value); const r = document.getElementById("v3MapUrlR"); if (r) r.classList.toggle("hidden", el.value !== "custom"); }; });
  bind("v3MapUrl", el => { el.onchange = () => set("mapUrl", el.value.trim()); });
  bind("v3MapR", el => { el.onchange = () => set("mapR", Number(el.value)); });
  bind("v3MapTerr", el => { el.onchange = () => set("mapTerrain", el.checked); });
  bind("v3MapEx", el => { el.oninput = () => { const o = el.parentElement.querySelector("output"); if (o) o.textContent = el.value + "×"; }; el.onchange = () => set("mapEx", Number(el.value)); });
  bind("v3MapOp", el => { el.oninput = () => { const o = el.parentElement.querySelector("output"); if (o) o.textContent = el.value + " %"; }; el.onchange = () => set("mapOp", Number(el.value)); });
  bind("v3MapDet", el => { el.onchange = () => set("mapDet", Number(el.value)); });
  bind("v3MapFit", el => { el.onclick = () => { const st = l3map.stats; if (!st || st.elevO == null) { l3Status("Tänd Följ markhöjden och vänta tills kartan visats först.", true); return; } const dz = Math.round(-(st.elevO - l3.O[2]) * (st.ex || 1) * 10) / 10 + 0.2 * 0; set("mapDz", dz); const d = document.getElementById("v3MapDz"); if (d) d.value = dz; l3Status("Kartans höjd justerad " + dz + " m mot arbetsytan."); }; });
  bind("v3MapDz", el => { el.onchange = () => set("mapDz", Number(el.value) || 0); });
  bind("v3MapZone", el => { el.onchange = () => set("mapZone", el.value); });
}
