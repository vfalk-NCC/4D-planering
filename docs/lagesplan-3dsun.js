/* 3D-vyn – Solstudie (Victor 2026-10-30: "en solstudie").

   Solens läge räknas ur plats (SWEREF 99 20 15 → breddgrad/längdgrad ur modellens koordinater), datum och klockslag (svensk tid, sommartid följer med).
   Realistisk visning sätts på och skuggorna följer solens riktning: längd och riktning på skuggorna visar vad som står i sol och skugga just då.
   – Datum och tid med reglage (soluppgång till solnedgång), spela upp dagen, och hoppa till årets solstånd och dagjämningar.
   – Solbanan för dagen ritas som en båge med timmarna markerade, och solen som en lysande boll.
   – Skuggbild: flera klockslag (eller årstider) i en och samma bild, sparas som PNG.
   – Soltimmar: hur många timmar markytan runt vyn får direkt sol under dagen (färgad karta), med hänsyn till byggnader och objekt.
   Skuggorna kommer ur 3D-editorns Realistisk-läge (lagesplan-3dvmode.js) och ritar byggnader och etablering – inte punktmoln. */

const l3sun = { date: "", min: 12 * 60, lat: null, lon: null, play: 0, q: 4096, path: true, grp: null, res: null, shade: true };
const L3SUN_Q = [[2048, "Normal"], [4096, "Hög"], [8192, "Mycket hög"]];
const l3sunRad = d => d * Math.PI / 180, l3sunDeg = r => r * 180 / Math.PI;

/* SWEREF 99 20 15 (centralmeridian 20°15', skala 1, falsk östlig 150 000) → [breddgrad, längdgrad] i grader. x = nord, y = ost. */
function l3sunLatLon(N, E, cm = 20.25, fe = 150000) {
  const a = 6378137, f = 1 / 298.257222101, e2 = f * (2 - f), n = f / (2 - f), a2 = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
  const d1 = n / 2 - 2 * n * n / 3 + 37 * n ** 3 / 96, d2 = n * n / 48 + n ** 3 / 15, d3 = 17 * n ** 3 / 480;
  const xi = N / a2, eta = (E - fe) / a2;
  const xi1 = xi - d1 * Math.sin(2 * xi) * Math.cosh(2 * eta) - d2 * Math.sin(4 * xi) * Math.cosh(4 * eta) - d3 * Math.sin(6 * xi) * Math.cosh(6 * eta);
  const eta1 = eta - d1 * Math.cos(2 * xi) * Math.sinh(2 * eta) - d2 * Math.cos(4 * xi) * Math.sinh(4 * eta) - d3 * Math.cos(6 * xi) * Math.sinh(6 * eta);
  const chi = Math.asin(Math.sin(xi1) / Math.cosh(eta1)), A = e2 + e2 * e2 + e2 ** 3 + e2 ** 4, B = -(7 * e2 * e2 + 17 * e2 ** 3 + 30 * e2 ** 4) / 6, C = (224 * e2 ** 3 + 889 * e2 ** 4) / 120, D = -(4279 * e2 ** 4) / 1260;
  const lat = chi + A * Math.sin(2 * chi) + B * Math.sin(4 * chi) + C * Math.sin(6 * chi) + D * Math.sin(8 * chi), dl = Math.atan(Math.sinh(eta1) / Math.cos(xi1));
  return [l3sunDeg(lat), cm + l3sunDeg(dl)];
}
/* Platsen: ur vyns mittpunkt (om den ser ut som SWEREF 99 20 15), annars sparad eller Stockholm. */
function l3sunPlace() {
  if (l3sun.lat != null && l3sun.lon != null) return [l3sun.lat, l3sun.lon];
  try { const t = l3.orbit.target, N = t.x + l3.O[0], E = t.y + l3.O[1]; if (N > 6e6 && N < 7.7e6 && E > 0 && E < 400000) { const r = l3sunLatLon(N, E); if (r[0] > 54 && r[0] < 70 && r[1] > 9 && r[1] < 26) return r; } } catch (e) { /* */ }
  return [59.33, 18.07];
}
/* Klockslagets UTC-förskjutning i Sverige (timmar) för ett datum. */
function l3sunTz(y, m, d) {
  try { const p = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Stockholm", hour: "numeric", timeZoneName: "shortOffset" }).formatToParts(new Date(Date.UTC(y, m - 1, d, 12))).find(x => x.type === "timeZoneName").value, mm = /GMT([+-]\d+)(?::(\d+))?/.exec(p); if (mm) return Number(mm[1]) + (mm[2] ? Math.sign(Number(mm[1])) * Number(mm[2]) / 60 : 0); } catch (e) { /* */ }
  return 1;
}
/* Solens höjd och kompassriktning (grader, från norr medsols) – NOAA:s förenklade formler. */
function l3sunPos(dateIso, minutes, lat, lon) {
  const [y, m, d] = dateIso.split("-").map(Number), tz = l3sunTz(y, m, d), N = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
  const g = 2 * Math.PI / 365 * (N - 1 + (minutes / 60 - 12) / 24);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ts = minutes + eqt + 4 * lon - 60 * tz, ha = l3sunRad(ts / 4 - 180), la = l3sunRad(lat);
  const cz = Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha), zen = Math.acos(Math.max(-1, Math.min(1, cz))), el = 90 - l3sunDeg(zen);
  const az = (l3sunDeg(Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(la) - Math.tan(decl) * Math.cos(la))) + 180) % 360;
  return { el, az };
}
/* Riktningen TILL solen i 3D-editorns axlar (x = nord, y = ost, z = upp). */
function l3sunDir(el, az) { const e = l3sunRad(el), a = l3sunRad(az); return new THREE.Vector3(Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)); }
function l3sunRiseSet(dateIso, lat, lon) {
  let rise = null, set = null, prev = l3sunPos(dateIso, 0, lat, lon).el;
  for (let m = 5; m <= 1440; m += 5) { const e = l3sunPos(dateIso, m, lat, lon).el; if (prev < 0 && e >= 0 && rise == null) rise = m; if (prev >= 0 && e < 0) set = m; prev = e; }
  return { rise, set };
}
const l3sunHm = m => { m = Math.max(0, Math.min(1439, Math.round(m))); return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
const l3sunToday = () => { const v = (typeof $ === "function" && $("dateInput") && $("dateInput").value) || ""; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v; const d = new Date(); return d.toISOString().slice(0, 10); };

/* ---- Att ställa in solen i scenen ---- */
function l3sunApply(opts = {}) {
  if (!l3sun.date) l3sun.date = l3sunToday();
  const [lat, lon] = l3sunPlace(), P = l3sunPos(l3sun.date, l3sun.min, lat, lon); l3sun.cur = P;
  if (typeof l3vmSet === "function" && l3vm.mode !== "real") l3vmSet("real", true);
  l3vm.sunDir = P.el > 0.5 ? l3sunDir(P.el, P.az) : l3sunDir(Math.max(P.el, 1), P.az);
  const sun = typeof l3vmSun === "function" ? l3vmSun() : null;
  if (typeof l3vmShadows === "function") { l3vmShadows(true); }
  if (sun) {
    const up = P.el > 0, k = Math.max(0, Math.min(1, P.el / 18)), warm = new THREE.Color(0xffb36b).lerp(new THREE.Color(0xfff6e6), k);
    sun.color.copy(warm); sun.intensity = up ? 0.35 + 0.9 * Math.min(1, P.el / 35) : 0.03; sun.castShadow = up && l3sun.shade; sun.shadow.mapSize.set(l3sun.q, l3sun.q); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  if (!opts.noDraw) l3sunDraw();
  l3Render();
}
function l3sunGroup() { if (!l3sun.grp) { l3sun.grp = new THREE.Group(); l3sun.grp.name = "solstudie"; l3.scene.add(l3sun.grp); } return l3sun.grp; }
function l3sunSphere(color, r) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color })); m.userData.noHit = true; m.userData.noVm = true; m.raycast = () => {}; return m; }
/* Solbanan (båge) och solens boll, på avstånd R från mitten. */
function l3sunDraw() {
  const g = l3sunGroup(); l3Clear(g); (l3sun.labs || []).forEach(e => e.remove()); l3sun.labs = [];
  const box = new THREE.Box3(); ["bldg", "places"].forEach(k => { if (l3.groups[k]) box.expandByObject(l3.groups[k]); });
  const c = box.isEmpty() ? l3.orbit.target.clone() : box.getCenter(new THREE.Vector3()), R = box.isEmpty() ? 60 : Math.max(25, Math.min(400, box.getSize(new THREE.Vector3()).length() * 0.9)), [lat, lon] = l3sunPlace();
  if (l3sun.path) {
    const pts = [], hrs = [];
    for (let m = 0; m <= 1440; m += 10) { const P = l3sunPos(l3sun.date, m, lat, lon); if (P.el > -1) { const v = c.clone().addScaledVector(l3sunDir(Math.max(0, P.el), P.az), R); pts.push(v); if (m % 60 === 0) hrs.push([m, v]); } }
    if (pts.length > 1) { const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.9, depthTest: false })); ln.renderOrder = 11; ln.userData.noHit = true; ln.raycast = () => {}; g.add(ln); }
    const host = l3.renderer.domElement.parentElement;
    hrs.forEach(([m, v]) => { const s = l3sunSphere(0xfbbf24, R * 0.012); s.position.copy(v); g.add(s); const el = document.createElement("div"); el.className = "v3-meas v3-meas-keep"; el.style.cssText = "background:#92400e;font-size:10px;padding:1px 5px;"; el.textContent = String(m / 60); host.appendChild(el); el._at = v.clone(); l3sun.labs.push(el); if (typeof l3m !== "undefined") l3m.labels.set("sun-" + m, el); });
  }
  const P = l3sun.cur || l3sunPos(l3sun.date, l3sun.min, lat, lon);
  if (P.el > -2) { const s = l3sunSphere(0xffd54a, R * 0.045); s.position.copy(c).addScaledVector(l3sunDir(Math.max(0, P.el), P.az), R); g.add(s); const halo = l3sunSphere(0xfff3b0, R * 0.075); halo.material.transparent = true; halo.material.opacity = 0.35; halo.position.copy(s.position); g.add(halo);
    const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([c, s.position.clone()]), new THREE.LineDashedMaterial({ color: 0xf59e0b, dashSize: R * 0.03, gapSize: R * 0.02, transparent: true, opacity: 0.5, depthTest: false })); ln.computeLineDistances(); ln.userData.noHit = true; ln.raycast = () => {}; g.add(ln); }
  if (typeof l3mPlaceLabels === "function") l3mPlaceLabels();
}
function l3sunOff() {
  l3sunStop(); if (l3sun.grp) { l3Clear(l3sun.grp); l3.scene.remove(l3sun.grp); l3sun.grp = null; } (l3sun.labs || []).forEach(e => e.remove()); l3sun.labs = []; if (typeof l3m !== "undefined") [...l3m.labels.keys()].filter(k => k.startsWith("sun-")).forEach(k => l3m.labels.delete(k));
  l3vm.sunDir = null; const sun = typeof l3vmSun === "function" ? l3vmSun() : null; if (sun) { sun.color.set(0xffffff); sun.intensity = 0.62; }
  if (l3sun.res && l3sun.res.mesh) { l3.scene.remove(l3sun.res.mesh); l3sun.res = null; }
  if (l3vm.mode === "real" && typeof l3vmShadows === "function") l3vmShadows(true);
  l3Render();
}
function l3sunStop() { if (l3sun.play) { clearInterval(l3sun.play); l3sun.play = 0; } }

/* ---- Soltimmar på marken ---- */
async function l3sunHours() {
  const [lat, lon] = l3sunPlace(), t = l3.orbit.target, span = l3sun.span || 80, O = l3.O;
  const occ = []; ["bldg", "places"].forEach(k => { if (l3.groups[k]) l3.groups[k].traverse(o => { if (o.isMesh && !o.userData.noHit && o.visible && !o.userData.vmGround) occ.push(o); }); });
  const bb = new THREE.Box3(); ["bldg", "places"].forEach(k => { if (l3.groups[k]) bb.expandByObject(l3.groups[k]); });
  const z0 = (typeof l3GroundZ === "function" ? l3GroundZ() : (bb.isEmpty() ? 0 : bb.min.z)) + 0.05;
  const steps = []; for (let m = 0; m < 1440; m += 20) { const P = l3sunPos(l3sun.date, m, lat, lon); if (P.el > 2) steps.push({ m, d: l3sunDir(P.el, P.az) }); }
  if (!steps.length) { l3Status("Solen går inte upp det här datumet på platsen.", true); return; }
  let cell = [1, 2, 4, 5, 8].find(v => (span / v) ** 2 * steps.length <= 70000) || 8; const n = Math.max(2, Math.floor(span / cell)), x0 = t.x - span / 2, y0 = t.y - span / 2;
  l3sun.busy = "Räknar soltimmar…"; l3sunOpen(); await new Promise(r => setTimeout(r, 20));
  const rc = new THREE.Raycaster(); rc.firstHitOnly = true; const H = new Float32Array(n * n), pos = [], col = []; let done = 0, mx = 0;
  const hasOcc = occ.length > 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const o = new THREE.Vector3(x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell, z0); let sunny = 0;
      for (const s of steps) { if (!hasOcc) { sunny++; continue; } rc.set(o, s.d); rc.far = 400; if (!rc.intersectObjects(occ, false).length) sunny++; }
      H[j * n + i] = sunny * 20 / 60; mx = Math.max(mx, H[j * n + i]);
    }
    if (++done % 4 === 0) await new Promise(r => setTimeout(r, 0));
  }
  const ramp = h => h < 1 ? "#1e3a8a" : h < 2 ? "#3b82f6" : h < 4 ? "#93c5fd" : h < 6 ? "#fde68a" : h < 8 ? "#fbbf24" : "#f97316", cnt = [0, 0, 0, 0, 0, 0], idx = h => h < 1 ? 0 : h < 2 ? 1 : h < 4 ? 2 : h < 6 ? 3 : h < 8 ? 4 : 5;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const h = H[j * n + i], c = new THREE.Color(ramp(h)), x = x0 + i * cell, y = y0 + j * cell; cnt[idx(h)] += cell * cell;
    pos.push(x, y, z0 + 0.03, x + cell, y, z0 + 0.03, x + cell, y + cell, z0 + 0.03, x, y, z0 + 0.03, x + cell, y + cell, z0 + 0.03, x, y + cell, z0 + 0.03); for (let q = 0; q < 6; q++) col.push(c.r, c.g, c.b); }
  if (l3sun.res && l3sun.res.mesh) l3.scene.remove(l3sun.res.mesh);
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); mesh.renderOrder = 6; mesh.userData.noHit = true; mesh.userData.noVm = true; mesh.raycast = () => {};
  l3.scene.add(mesh); l3sun.res = { mesh, cnt, cell, max: mx, span, tot: n * n * cell * cell }; l3sun.busy = ""; l3Render(); l3sunOpen(); void O;
}

/* ---- Skuggbild: flera klockslag/årstider i en bild ---- */
async function l3sunSheet(kind) {
  const [lat, lon] = l3sunPlace(), saved = { date: l3sun.date, min: l3sun.min }, y = Number(l3sun.date.slice(0, 4)) || new Date().getFullYear();
  const shots = kind === "year" ? [[`${y}-03-20`, 12 * 60, "Vårdagjämning kl 12"], [`${y}-06-21`, 12 * 60, "Midsommar kl 12"], [`${y}-09-22`, 12 * 60, "Höstdagjämning kl 12"], [`${y}-12-21`, 12 * 60, "Vintersolstånd kl 12"]]
    : [[l3sun.date, 9 * 60, "kl 09"], [l3sun.date, 12 * 60, "kl 12"], [l3sun.date, 15 * 60, "kl 15"], [l3sun.date, 18 * 60, "kl 18"]].map(([d, m, t]) => [d, m, `${d} ${t}`]);
  const R = l3.renderer, W = Math.min(960, R.domElement.width), H = Math.round(W * R.domElement.height / R.domElement.width), cv = document.createElement("canvas"); cv.width = W * 2; cv.height = H * 2; const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height);
  l3.hudHide = true;
  for (let i = 0; i < shots.length; i++) {
    const [d, m, label] = shots[i]; l3sun.date = d; l3sun.min = m; l3sunApply({ noDraw: true }); l3.renderer.shadowMap.needsUpdate = true;
    if (typeof l3pcRenderScene === "function") l3pcRenderScene(); else R.render(l3.scene, l3.camera);
    const ox = (i % 2) * W, oy = Math.floor(i / 2) * H; cx.drawImage(R.domElement, ox, oy, W, H);
    cx.fillStyle = "rgba(15,23,42,.8)"; cx.fillRect(ox + 12, oy + 12, Math.max(150, label.length * 11 + 20), 30); cx.fillStyle = "#fff"; cx.font = "600 16px system-ui, sans-serif"; cx.fillText(label, ox + 22, oy + 33);
    const P = l3sunPos(d, m, lat, lon); cx.fillStyle = "rgba(15,23,42,.8)"; cx.fillRect(ox + 12, oy + H - 38, 230, 26); cx.fillStyle = "#fde68a"; cx.font = "13px system-ui, sans-serif"; cx.fillText(`Solhöjd ${Math.round(P.el)}° · riktning ${Math.round(P.az)}°`, ox + 22, oy + H - 20);
    await new Promise(r => setTimeout(r, 30));
  }
  l3.hudHide = false; l3sun.date = saved.date; l3sun.min = saved.min; l3sunApply();
  cv.toBlob(b => { const url = URL.createObjectURL(b), a = document.createElement("a"); a.href = url; a.download = `Skuggstudie ${kind === "year" ? "året" : l3sun.date}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); l3Toast("Skuggbilden är nedladdad."); }, "image/png");
}
/* Renderad bild i hög upplösning av vyn som den ser ut nu (skuggor, Realistisk). */
async function l3sunRender(Wpx) {
  const R = l3.renderer, pr0 = R.getPixelRatio(), cam = l3.camera, cur = R.domElement, asp = cur.width / cur.height, W = Wpx, H = Math.round(Wpx / asp);
  try {
    if (typeof l3lodApply === "function") l3lodApply(-1);
    R.setPixelRatio(1); R.setSize(W, H, false); if (cam.isOrthographicCamera) { const h = cam.top - cam.bottom; cam.left = -h * asp / 2; cam.right = h * asp / 2; } else cam.aspect = asp; cam.updateProjectionMatrix();
    if (typeof l3pcRenderScene === "function") l3pcRenderScene(); else R.render(l3.scene, cam);
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H; cv.getContext("2d").drawImage(R.domElement, 0, 0, W, H);
    await new Promise(res => cv.toBlob(b => { const url = URL.createObjectURL(b), a = document.createElement("a"); a.href = url; a.download = `Renderad bild ${W}x${H}.png`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); res(); }, "image/png"));
    l3Toast(`Bilden (${W} × ${H} px) är nedladdad.`);
  } finally { R.setPixelRatio(pr0); l3Resize(); l3Render(); }
}

/* ---- Panelen ---- */
function l3sunOpen() {
  if (!l3sun.date) l3sun.date = l3sunToday();
  const [lat, lon] = l3sunPlace(), rs = l3sunRiseSet(l3sun.date, lat, lon), P = l3sun.cur || l3sunPos(l3sun.date, l3sun.min, lat, lon), esc = escHtml, f1 = v => (Math.round(v * 10) / 10).toString().replace(".", ","), r = l3sun.res;
  const legend = r ? ["under 1 h", "1–2 h", "2–4 h", "4–6 h", "6–8 h", "över 8 h"].map((t, i) => `<div class="v3-an-leg"><i style="background:${["#1e3a8a", "#3b82f6", "#93c5fd", "#fde68a", "#fbbf24", "#f97316"][i]}"></i><span>${t}</span><b>${Math.round(r.cnt[i])} m² · ${Math.round(r.cnt[i] / Math.max(1, r.tot) * 100)} %</b></div>`).join("") : "";
  const html = `<div class="v3-an-r"><label>Datum<input type="date" data-sn="date" value="${esc(l3sun.date)}"></label><label>Plats (grader)<input type="text" data-sn="loc" value="${esc(lat.toFixed(3) + ", " + lon.toFixed(3))}" title="Breddgrad, längdgrad – standard är ur modellens koordinater"></label></div>
    <div class="v3-an-r"><button type="button" data-sn="d" data-v="03-20">Vår</button><button type="button" data-sn="d" data-v="06-21">Midsommar</button><button type="button" data-sn="d" data-v="09-22">Höst</button><button type="button" data-sn="d" data-v="12-21">Vinter</button><button type="button" data-sn="d" data-v="today">Idag</button></div>
    <div class="v3-vq-sl"><span>Tid ${l3sunHm(l3sun.min)}</span><input type="range" min="0" max="1439" step="5" value="${l3sun.min}" data-sn="min"><em>${P.el > 0 ? "sol " + Math.round(P.el) + "°" : "natt"}</em></div>
    <div class="v3-an-kv"><span>Uppgång / nedgång</span><b>${rs.rise != null ? l3sunHm(rs.rise) : "–"} / ${rs.set != null ? l3sunHm(rs.set) : "–"}</b></div><div class="v3-an-kv"><span>Solens riktning</span><b>${Math.round(P.az)}° ${["N", "NO", "O", "SO", "S", "SV", "V", "NV"][Math.round(P.az / 45) % 8]}</b></div>
    <div class="v3-vq-set"><label class="v3-vq-sw"><span>Solbanan i modellen</span><input type="checkbox" data-sn="path" ${l3sun.path ? "checked" : ""}><b></b></label><label class="v3-vq-sw"><span>Skuggor</span><input type="checkbox" data-sn="shade" ${l3sun.shade ? "checked" : ""}><b></b></label>
      <label class="v3-an-r" style="gap:8px"><span style="color:#64748b">Skuggkvalitet</span><select data-sn="q">${L3SUN_Q.map(([v, t]) => `<option value="${v}" ${v === l3sun.q ? "selected" : ""}>${t}</option>`).join("")}</select></label></div>
    <div class="v3-an-r"><button type="button" data-sn="play">${l3sun.play ? "⏸ Stoppa" : "▶ Spela upp dagen"}</button><button type="button" data-sn="sheet" title="Fyra klockslag i en bild (09, 12, 15, 18)">Skuggbild: dagen</button><button type="button" data-sn="year" title="Fyra årstider kl 12 i en bild">Skuggbild: året</button></div>
    <div class="v3-an-r"><button type="button" data-sn="hours" title="Hur många timmar marken runt vyn får direkt sol under dagen">${l3sun.busy || "☀ Soltimmar på marken"}</button><select data-sn="span">${[[40, "40 × 40 m"], [80, "80 × 80 m"], [160, "160 × 160 m"]].map(([v, t]) => `<option value="${v}" ${v === (l3sun.span || 80) ? "selected" : ""}>${t}</option>`).join("")}</select>${r ? `<button type="button" data-sn="hoff">Ta bort</button>` : ""}</div>${r ? `<div class="v3-an-legs">${legend}</div><div class="v3-vp-t">Rutor ${r.cell} m · mest sol ${f1(r.max)} h. Räknat mellan soluppgång och solnedgång, byggnader och objekt skuggar.</div>` : ""}
    <div class="v3-an-r"><button type="button" data-sn="img" data-w="1920">Rendera bild 1920 px</button><button type="button" data-sn="img" data-w="3840">4K</button></div>`;
  l3anPanelSun("Solstudie", html, el => {
    const q = k => el.querySelector(`[data-sn="${k}"]`);
    q("date").onchange = e => { if (e.target.value) { l3sun.date = e.target.value; l3sunApply(); l3sunOpen(); } };
    q("loc").onchange = e => { const m = String(e.target.value).replace(/,/g, " ").trim().split(/\s+/).map(Number); if (m.length >= 2 && m.every(Number.isFinite)) { l3sun.lat = m[0]; l3sun.lon = m[1]; l3sunApply(); l3sunOpen(); } };
    el.querySelectorAll('[data-sn="d"]').forEach(b => { b.onclick = () => { const y = (l3sun.date || l3sunToday()).slice(0, 4); l3sun.date = b.dataset.v === "today" ? new Date().toISOString().slice(0, 10) : `${y}-${b.dataset.v}`; l3sunApply(); l3sunOpen(); }; });
    const mn = q("min"); mn.oninput = () => { l3sun.min = Number(mn.value); l3sunApply({ noDraw: false }); const sp = el.querySelector(".v3-vq-sl span"); if (sp) sp.textContent = "Tid " + l3sunHm(l3sun.min); const em = el.querySelector(".v3-vq-sl em"); if (em) em.textContent = l3sun.cur.el > 0 ? "sol " + Math.round(l3sun.cur.el) + "°" : "natt"; };
    q("path").onchange = e => { l3sun.path = e.target.checked; l3sunDraw(); l3Render(); }; q("shade").onchange = e => { l3sun.shade = e.target.checked; l3sunApply(); };
    q("q").onchange = e => { l3sun.q = Number(e.target.value); l3sunApply(); };
    q("play").onclick = () => { if (l3sun.play) { l3sunStop(); l3sunOpen(); return; } const rs2 = l3sunRiseSet(l3sun.date, ...l3sunPlace()); if (l3sun.min < (rs2.rise || 0) || l3sun.min > (rs2.set || 1439)) l3sun.min = rs2.rise || 360; l3sun.play = setInterval(() => { l3sun.min += 6; const rs3 = l3sunRiseSet(l3sun.date, ...l3sunPlace()); if (l3sun.min > (rs3.set || 1100)) l3sun.min = rs3.rise || 360; l3sunApply(); const inp = document.querySelector('#v3AnPanel [data-sn="min"]'); if (inp) { inp.value = l3sun.min; const sp = document.querySelector("#v3AnPanel .v3-vq-sl span"); if (sp) sp.textContent = "Tid " + l3sunHm(l3sun.min); } }, 120); l3sunOpen(); };
    q("sheet").onclick = () => l3sunSheet("day"); q("year").onclick = () => l3sunSheet("year");
    q("hours").onclick = () => l3sunHours(); q("span").onchange = e => { l3sun.span = Number(e.target.value); };
    const ho = q("hoff"); if (ho) ho.onclick = () => { if (l3sun.res && l3sun.res.mesh) l3.scene.remove(l3sun.res.mesh); l3sun.res = null; l3Render(); l3sunOpen(); };
    el.querySelectorAll('[data-sn="img"]').forEach(b => { b.onclick = () => l3sunRender(Number(b.dataset.w)); });
  });
}
/* Samma panel som Analys men med egen rubrik och stängning som släcker solstudien. */
function l3anPanelSun(title, html, bind) {
  const el = l3anPanel(title, html, bind); if (!el) return null; el.dataset.kind = "sun";
  const x = el.querySelector("[data-an-x]"); if (x) x.onclick = () => { l3sunOff(); const p = document.getElementById("v3AnPanel"); if (p) p.remove(); };
  return el;
}
function l3sunStart() { if (!l3sun.date) l3sun.date = l3sunToday(); l3sunApply(); l3sunOpen(); }
