/* 3D-vyn – Analys (Victor 2026-10-30: mängdning, jämför modeller, lutning, massegenskaper, fria avstånd, smart markering, tidslinje).

   Knappen Analys i verktygsraden öppnar en panel med sju flikar. Allt räknas i webbläsaren på det som är tänt (IFC-modeller, etableringsobjekt,
   ritade objekt, punktmoln) – inget skickas någonstans och inget i modellerna ändras.
   – Mängdning: antal, yta och volym per IFC-klass, modell eller namn (plus etablering och ritade objekt) – export som CSV.
   – Lutning: färgkarta över punktmoln eller modell (procent, gränser som i väg- och markprojektering) med areor per klass.
   – Massegenskaper: volym, yta, tyngdpunkt, mått och vikt (valbar densitet) för det som är markerat.
   – Fria avstånd: minsta avståndet mellan två markeringar (A och B) mot ett krav – linjen ritas i modellen.
   – Jämför modeller: två modeller (t.ex. två versioner) mot varandra på GUID – tillkommet, borttaget, ändrat.
   – Smart markering: markera på klass, namn, modell och storlek, eller "likadana som markerat".
   – Tidslinje: hur många aktiviteter och etableringsobjekt som är aktiva vecka för vecka – tryck för att hoppa dit. */

const l3an = { tab: "take", clear: null, A: null, B: null, cmpA: "", cmpB: "", cmp: null, rho: 2400, gb: "cls" };
const L3AN_TABS = [["take", "Mängdning"], ["slope", "Lutning"], ["mass", "Massegenskaper"], ["clear", "Fria avstånd"], ["cmp", "Jämför"], ["sel", "Smart markering"], ["time", "Tidslinje"]];
const l3anF = (v, d = 1) => Number(v).toLocaleString("sv-SE", { maximumFractionDigits: d, minimumFractionDigits: 0 }).replace(/[  ]/g, " ");
const l3anTick = () => new Promise(r => setTimeout(r, 12));

/* ---- Panel ---- */
function l3anPanel(title, html, bind) {
  const host = document.getElementById("v3Canvas"); if (!host) return null;
  let el = document.getElementById("v3AnPanel");
  if (!el) { el = document.createElement("div"); el.id = "v3AnPanel"; el.className = "v3-vp v3-an"; el.style.left = "12px"; el.style.right = "auto"; host.appendChild(el); ["pointerdown", "wheel", "contextmenu", "dblclick", "click", "keydown", "keyup"].forEach(t => el.addEventListener(t, e => e.stopPropagation())); }
  el.classList.toggle("col", !!l3Prefs().anCol);
  el.innerHTML = `<div class="v3-vp-h"><button type="button" class="tg" data-an-col title="Fäll ihop / fäll ut">${l3Prefs().anCol ? "▸" : "▾"}</button><b>${escHtml(title)}</b><span></span><button type="button" data-an-x title="Stäng">✕</button></div>${html}`;
  el.querySelector("[data-an-x]").onclick = l3anClose;
  el.querySelector("[data-an-col]").onclick = () => { l3SetPref("anCol", !l3Prefs().anCol); el.classList.toggle("col", !!l3Prefs().anCol); el.querySelector("[data-an-col]").textContent = l3Prefs().anCol ? "▸" : "▾"; };
  if (bind) bind(el); return el;
}
function l3anClose() { const el = document.getElementById("v3AnPanel"); if (el) el.remove(); l3anClearDraw(); }
function l3anGroup() { if (!l3.groups.an) { l3.groups.an = new THREE.Group(); l3.groups.an.name = "analys"; l3.scene.add(l3.groups.an); } return l3.groups.an; }
function l3anClearDraw() { if (!l3.groups.an) return; l3Clear(l3.groups.an); l3anLabels().forEach(e => e.remove()); l3an.labs = []; if (typeof l3m !== "undefined") l3m.labels.delete("an-clear"); l3Render(); }
const l3anLabels = () => l3an.labs || [];

function l3anOpen(tab) {
  if (tab) l3an.tab = tab;
  const t = l3an.tab, esc = escHtml, tabs = `<div class="v3-an-tabs">${L3AN_TABS.map(([k, l]) => `<button type="button" data-an-tab="${k}" class="${k === t ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const fn = { take: l3anTake, slope: l3anSlope, mass: l3anMass, clear: l3anClear, cmp: l3anCmp, sel: l3anSelUi, time: l3anTime }[t];
  const r = fn(esc), title = (L3AN_TABS.find(x => x[0] === t) || [])[1] || "Analys";
  l3anPanel("Analys · " + title, tabs + r.html, el => { el.querySelectorAll("[data-an-tab]").forEach(b => { b.onclick = () => { l3anClearDraw(); l3anOpen(b.dataset.anTab); }; }); if (r.bind) r.bind(el); });
}

/* ---- Triangelkällor: markerade objekt → trianglar (scenkoordinater) ---- */
function l3anRangeTris(mesh, ri, out) {
  const u = mesh.userData.l3b, r = u.ranges[ri], pos = mesh.geometry.getAttribute("position").array, [s, c] = l3bsIdx(mesh, ri), idx = u.origIdx; mesh.updateMatrixWorld(true); const M = mesh.matrixWorld.elements;
  const tf = i => { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; return [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]]; };
  const cache = new Map(), g = i => { let v = cache.get(i); if (!v) { v = tf(i); cache.set(i, v); } return v; };
  void r; for (let i = s; i + 2 < s + c; i += 3) out.push(g(idx[i]), g(idx[i + 1]), g(idx[i + 2]));
  return out;
}
function l3anPartTris(part, out) {
  const O = l3.O;
  if (part.tris) { const P = part.tris.pts.map(q => [q[0] - O[0], q[1] - O[1], q[2] - O[2]]); part.tris.faces.forEach(f => out.push(P[f[0] - 1], P[f[1] - 1], P[f[2] - 1])); return out; }
  if (part.poly && part.poly.length >= 3) { const P = part.poly.map(q => [q[0] - O[0], q[1] - O[1]]), a = part.z0 - O[2], b = part.z1 - O[2];
    for (let i = 1; i + 1 < P.length; i++) { out.push([P[0][0], P[0][1], b], [P[i][0], P[i][1], b], [P[i + 1][0], P[i + 1][1], b], [P[0][0], P[0][1], a], [P[i + 1][0], P[i + 1][1], a], [P[i][0], P[i][1], a]); }
    for (let i = 0; i < P.length; i++) { const q = P[(i + 1) % P.length]; out.push([P[i][0], P[i][1], a], [q[0], q[1], a], [q[0], q[1], b], [P[i][0], P[i][1], a], [q[0], q[1], b], [P[i][0], P[i][1], b]); } }
  return out;
}
/* Det som är markerat: [{ label, tris: [v,v,v, v,v,v …] }] */
function l3anSelection() {
  const out = [];
  if (typeof l3bs !== "undefined") l3bs.sel.forEach(e => { const r = e.mesh.userData.l3b.ranges[e.ri]; out.push({ label: r.name || "IFC-objekt", cls: r.cls || "", tris: l3anRangeTris(e.mesh, e.ri, []) }); });
  l3SelList().forEach(p => { const t = []; try { placeParts(p).forEach(pt => l3anPartTris(pt, t)); } catch (e) { /* hoppa */ } out.push({ label: p.name || "Objekt", cls: "", tris: t }); });
  return out.filter(o => o.tris.length);
}
function l3anStats(tris) {
  let vol = 0, area = 0, cx = 0, cy = 0, cz = 0; const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < tris.length; i += 3) {
    const a = tris[i], b = tris[i + 1], c = tris[i + 2], v = (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    vol += v; cx += v * (a[0] + b[0] + c[0]) / 4; cy += v * (a[1] + b[1] + c[1]) / 4; cz += v * (a[2] + b[2] + c[2]) / 4;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    [a, b, c].forEach(q => { for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], q[k]); mx[k] = Math.max(mx[k], q[k]); } });
  }
  const av = Math.abs(vol), cen = Math.abs(vol) > 1e-9 ? [cx / vol, cy / vol, cz / vol] : [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  return { vol: av, area, cen, mn, mx };
}
function l3anCsv(rows, name) {
  const txt = "﻿" + rows.map(r => r.map(v => { const s = String(v == null ? "" : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([txt], { type: "text/csv;charset=utf-8" })), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const l3anModels = () => (typeof l3b !== "undefined" ? l3b.models : []).filter(m => m.meshes && m.meshes.length);
const L3AN_CLS = { IFCWALL: "Vägg", IFCWALLSTANDARDCASE: "Vägg", IFCSLAB: "Platta", IFCCOLUMN: "Pelare", IFCBEAM: "Balk", IFCDOOR: "Dörr", IFCWINDOW: "Fönster", IFCROOF: "Tak", IFCSTAIR: "Trappa", IFCSTAIRFLIGHT: "Trapplöpning", IFCRAILING: "Räcke", IFCFOOTING: "Fundament", IFCPILE: "Pålar", IFCMEMBER: "Stång", IFCPLATE: "Skiva", IFCCOVERING: "Beklädnad", IFCFURNISHINGELEMENT: "Inredning", IFCBUILDINGELEMENTPROXY: "Övrigt (proxy)", IFCOPENINGELEMENT: "Öppning", IFCREINFORCINGBAR: "Armering", IFCFLOWSEGMENT: "Rör/kanal", IFCFLOWTERMINAL: "Don", IFCCURTAINWALL: "Fasad", IFCSITE: "Tomt" };
const l3anClsName = c => L3AN_CLS[String(c || "").toUpperCase()] || (c ? String(c).replace(/^IFC/i, "") : "(saknar klass)");

/* ---- 1. Mängdning ---- */
function l3anTake(esc) {
  const gb = l3an.gb;
  const rows = l3an.takeRows, tot = rows ? rows.reduce((a, r) => ({ n: a.n + r.n, area: a.area + r.area, vol: a.vol + r.vol }), { n: 0, area: 0, vol: 0 }) : null;
  const tbl = rows ? `<div class="v3-an-list"><table class="v3-an-t"><tr><th>${gb === "cls" ? "Klass" : gb === "model" ? "Modell" : "Namn"}</th><th>Antal</th><th>Yta m²</th><th>Volym m³</th></tr>${rows.map(r => `<tr><td>${esc(r.k)}</td><td>${r.n}</td><td>${l3anF(r.area)}</td><td>${l3anF(r.vol, 2)}</td></tr>`).join("")}<tr class="tot"><td>Summa</td><td>${tot.n}</td><td>${l3anF(tot.area)}</td><td>${l3anF(tot.vol, 2)}</td></tr></table></div><div class="v3-vp-t">Volymen räknas för slutna objekt; öppna ytor (t.ex. plåtar) ger bara yta. Dolda objekt ingår inte.</div>` : `<div class="v3-vp-t">${l3an.takeBusy || "Räknar antal, yta och volym för allt som är tänt."}</div>`;
  return { html: `<div class="v3-an-r"><label>Gruppera på <select data-an-gb><option value="cls" ${gb === "cls" ? "selected" : ""}>IFC-klass</option><option value="model" ${gb === "model" ? "selected" : ""}>Modell</option><option value="name" ${gb === "name" ? "selected" : ""}>Namn</option></select></label></div>${tbl}<div class="v3-vq-foot"><button type="button" class="primary" data-an-go>Räkna</button><button type="button" data-an-csv ${rows ? "" : "disabled"}>Exportera CSV</button></div>`,
    bind: el => { el.querySelector("[data-an-gb]").onchange = e => { l3an.gb = e.target.value; l3an.takeRows = null; l3anOpen(); }; el.querySelector("[data-an-go]").onclick = () => l3anTakeRun();
      const c = el.querySelector("[data-an-csv]"); if (c) c.onclick = () => l3anCsv([[gb === "cls" ? "Klass" : gb === "model" ? "Modell" : "Namn", "Antal", "Yta m2", "Volym m3"], ...rows.map(r => [r.k, r.n, Math.round(r.area * 100) / 100, Math.round(r.vol * 1000) / 1000]), ["Summa", tot.n, Math.round(tot.area * 100) / 100, Math.round(tot.vol * 1000) / 1000]], "Mängdning.csv"); } };
}
async function l3anTakeRun() {
  const groups = new Map(), add = (k, st) => { const g = groups.get(k) || { k, n: 0, area: 0, vol: 0 }; g.n++; g.area += st.area; g.vol += st.vol; groups.set(k, g); };
  l3an.takeBusy = "Räknar…"; l3anOpen(); await l3anTick(); let work = 0;
  for (const m of l3anModels().filter(m => m.visible)) for (const mesh of m.meshes) {
    const u = mesh.userData.l3b; if (!u) continue;
    for (let ri = 0; ri < u.ranges.length; ri++) {
      if (u.hidden && u.hidden.has(ri)) continue; const r = u.ranges[ri]; const st = l3anStats(l3anRangeTris(mesh, ri, []));
      add(l3an.gb === "cls" ? l3anClsName(r.cls) : l3an.gb === "model" ? (m.name || "Modell") : (r.name || "(namnlös)"), st);
      if (++work % 400 === 0) await l3anTick();
    }
  }
  placements.filter(p => !(placeLib(p.type) || {}).isModel && l3PlaceOnDate(p)).forEach(p => {
    let st = { area: 0, vol: 0 }; if (p.m) { const d = modDims(p); st = { area: d.area || 0, vol: d.volume || 0 }; } else { const L = Number(p.L) || 0, B = Number(p.B) || 0, H = Number(p.H) || 0; st = { area: 2 * (L * B + L * H + B * H), vol: L * B * H }; }
    add(l3an.gb === "cls" ? "Etablering: " + ((placeLib(p.type) || {}).label || p.type) : l3an.gb === "model" ? "Etablering" : (p.name || p.type), st);
  });
  l3an.takeRows = [...groups.values()].sort((a, b) => b.vol - a.vol || b.n - a.n); l3an.takeBusy = ""; l3anOpen();
}

/* ---- 2. Lutning ---- */
const L3AN_SLOPE = [[2, "#22c55e", "0–2 %"], [5, "#a3e635", "2–5 %"], [10, "#facc15", "5–10 %"], [20, "#fb923c", "10–20 %"], [33.3, "#ef4444", "20–33 % (1:3)"], [Infinity, "#7e22ce", "över 33 %"]];
function l3anBounds(key) {
  const [kind, ...rest] = key.split(":"), id = rest.join(":"), O = l3.O;
  if (kind === "pc") { const c = l3pc.clouds.find(x => x.id === id); return c && c.info ? { x0: c.info.min[0], y0: c.info.min[1], x1: c.info.max[0], y1: c.info.max[1] } : null; }
  const b = new THREE.Box3();
  if (kind === "md") { const m = l3b.models.find(x => x.id === id); (m ? m.meshes : []).forEach(me => b.expandByObject(me)); }
  else if (kind === "cad") l3s.cad.forEach(o => { if (o.userData.cadId === id && o.isMesh) b.expandByObject(o); });
  return b.isEmpty() ? null : { x0: b.min.x + O[0], y0: b.min.y + O[1], x1: b.max.x + O[0], y1: b.max.y + O[1] };
}
function l3anSlope(esc) {
  const srcs = typeof l3dfSources === "function" ? l3dfSources() : [], key = l3an.slopeKey || (srcs[0] && srcs[0].k) || "", span = l3an.slopeSpan || 200, res = l3an.slopeRes;
  const leg = L3AN_SLOPE.map(([, c, l], i) => `<div class="v3-an-leg"><i style="background:${c}"></i><span>${l}</span><b>${res ? l3anF(res.area[i], 0) + " m² · " + l3anF(res.area[i] / Math.max(1, res.tot) * 100, 0) + " %" : ""}</b></div>`).join("");
  return { html: srcs.length ? `<div class="v3-an-r"><label>Yta <select data-an-src>${srcs.map(s => `<option value="${esc(s.k)}" ${s.k === key ? "selected" : ""}>${esc(s.label)}</option>`).join("")}</select></label><label>Utsnitt kring vyn <select data-an-span>${[[50, "50 × 50 m"], [100, "100 × 100 m"], [200, "200 × 200 m"], [400, "400 × 400 m"], [1000, "1 × 1 km"]].map(([v, l]) => `<option value="${v}" ${v === span ? "selected" : ""}>${l}</option>`).join("")}</select></label></div><div class="v3-an-legs">${leg}</div>${res ? `<div class="v3-vp-t">Rutstorlek ${String(res.cell).replace(".", ",")} m · brantast ${l3anF(res.max, 0)} % · snitt ${l3anF(res.mean, 1)} %</div>` : `<div class="v3-vp-t">${l3an.slopeBusy || "Färgar ytan efter lutning i procent."}</div>`}<div class="v3-vq-foot"><button type="button" class="primary" data-an-go>Visa lutning</button><button type="button" data-an-off ${res ? "" : "disabled"}>Ta bort</button></div>` : `<div class="v3-vp-t warn">Tänd ett punktmoln eller en 3D-modell först.</div>`,
    bind: el => { const s = el.querySelector("[data-an-src]"); if (!s) return; s.onchange = () => { l3an.slopeKey = s.value; }; el.querySelector("[data-an-span]").onchange = e => { l3an.slopeSpan = Number(e.target.value); }; el.querySelector("[data-an-go]").onclick = () => { l3an.slopeKey = s.value; l3anSlopeRun(); }; el.querySelector("[data-an-off]").onclick = () => { l3an.slopeRes = null; l3anClearDraw(); l3anOpen(); }; } };
}
async function l3anSlopeRun() {
  const key = l3an.slopeKey, span = l3an.slopeSpan || 200, O = l3.O;
  const bb = l3anBounds(key); if (!bb) { l3Status("Kunde inte hitta ytans utbredning.", true); return; }
  const t = l3.orbit.target, cx = t.x + O[0], cy = t.y + O[1], hs = span / 2;
  const bd = { x0: Math.max(bb.x0, cx - hs), x1: Math.min(bb.x1, cx + hs), y0: Math.max(bb.y0, cy - hs), y1: Math.min(bb.y1, cy + hs) };
  if (bd.x1 <= bd.x0 || bd.y1 <= bd.y0) { l3Status("Vyn ligger utanför ytan – zooma in över den först.", true); return; }
  l3an.slopeBusy = "Räknar…"; l3anOpen(); await l3anTick();
  const cell = [0.1, 0.2, 0.25, 0.5, 1, 2, 5].find(v => ((bd.x1 - bd.x0) / v) * ((bd.y1 - bd.y0) / v) <= 160000) || 5, g = l3dfGrid(bd, cell);
  if (!l3dfBuild(key, g)) { l3an.slopeBusy = ""; l3Status("Kunde inte läsa ytan.", true); l3anOpen(); return; }
  const nx = g.nx, ny = g.ny, Z = g.z, pos = [], col = [], area = L3AN_SLOPE.map(() => 0); let tot = 0, mx = 0, sum = 0, nn = 0;
  const z = (i, j) => (i < 0 || j < 0 || i >= nx || j >= ny ? NaN : Z[j * nx + i]), cols = L3AN_SLOPE.map(r => new THREE.Color(r[1])), c2 = g.cell;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = z(i, j); if (c !== c) continue;
    const xm = z(i - 1, j), xp = z(i + 1, j), ym = z(i, j - 1), yp = z(i, j + 1);
    const dx = (xp === xp && xm === xm) ? (xp - xm) / (2 * c2) : xp === xp ? (xp - c) / c2 : xm === xm ? (c - xm) / c2 : 0, dy = (yp === yp && ym === ym) ? (yp - ym) / (2 * c2) : yp === yp ? (yp - c) / c2 : ym === ym ? (c - ym) / c2 : 0;
    const sl = Math.hypot(dx, dy) * 100, k = L3AN_SLOPE.findIndex(r => sl < r[0]), a = c2 * c2; area[k] += a; tot += a; mx = Math.max(mx, sl); sum += sl; nn++;
    const x0 = g.x0 + i * c2 - O[0], y0 = g.y0 + j * c2 - O[1], x1 = x0 + c2, y1 = y0 + c2, zz = c - O[2] + 0.04, cc = cols[k];
    pos.push(x0, y0, zz, x1, y0, zz, x1, y1, zz, x0, y0, zz, x1, y1, zz, x0, y1, zz); for (let q = 0; q < 6; q++) col.push(cc.r, cc.g, cc.b);
  }
  l3anClearDraw(); const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); mesh.renderOrder = 7; mesh.userData.noHit = true; mesh.raycast = () => {};
  l3anGroup().add(mesh); l3an.slopeRes = { area, tot, cell: c2, max: mx, mean: nn ? sum / nn : 0 }; l3an.slopeBusy = ""; l3Render(); l3anOpen();
}

/* ---- 3. Massegenskaper ---- */
const L3AN_RHO = [["Betong", 2400], ["Armerad betong", 2500], ["Stål", 7850], ["Trä", 500], ["Tegel", 1800], ["Jord/fyll", 1800], ["Grus", 1900], ["Asfalt", 2300], ["Vatten", 1000]];
function l3anMass(esc) {
  const S = l3anSelection(); if (!S.length) return { html: `<div class="v3-vp-t">Markera ett eller flera objekt (IFC-objekt eller etablering/ritade objekt) och öppna fliken igen.</div>` };
  const all = []; S.forEach(o => { for (const t of o.tris) all.push(t); }); const st = l3anStats(all), O = l3.O, rho = l3an.rho, kg = st.vol * rho;
  const one = S.length === 1 ? `` : `<div class="v3-an-list"><table class="v3-an-t"><tr><th>Objekt</th><th>Volym m³</th><th>Yta m²</th></tr>${S.slice(0, 40).map(o => { const s = l3anStats(o.tris); return `<tr><td>${esc(o.label)}</td><td>${l3anF(s.vol, 3)}</td><td>${l3anF(s.area, 2)}</td></tr>`; }).join("")}</table></div>`;
  const row = (a, b) => `<div class="v3-an-kv"><span>${a}</span><b>${b}</b></div>`;
  return { html: `<div class="v3-vp-t">${S.length} objekt markerade</div>${row("Volym", l3anF(st.vol, 3) + " m³")}${row("Yta", l3anF(st.area, 2) + " m²")}${row("Mått (B × D × H)", `${l3anF(st.mx[0] - st.mn[0], 2)} × ${l3anF(st.mx[1] - st.mn[1], 2)} × ${l3anF(st.mx[2] - st.mn[2], 2)} m`)}${row("Tyngdpunkt", `${l3anF(st.cen[0] + O[0], 2)} ; ${l3anF(st.cen[1] + O[1], 2)} ; ${l3anF(st.cen[2] + O[2], 2)}`)}
    <div class="v3-an-r"><label>Material <select data-an-rho>${L3AN_RHO.map(([n, v]) => `<option value="${v}" ${v === rho ? "selected" : ""}>${n} (${v} kg/m³)</option>`).join("")}</select></label></div>${row("Vikt", kg >= 1000 ? l3anF(kg / 1000, 2) + " ton" : l3anF(kg, 0) + " kg")}${one}<div class="v3-vp-t">Volymen gäller slutna kroppar. Vikten är en uppskattning (volym × densitet).</div>
    <div class="v3-vq-foot"><button type="button" class="primary" data-an-cg>Visa tyngdpunkt</button><button type="button" data-an-csv>Exportera CSV</button></div>`,
    bind: el => { el.querySelector("[data-an-rho]").onchange = e => { l3an.rho = Number(e.target.value); l3anOpen(); };
      el.querySelector("[data-an-cg]").onclick = () => { l3anClearDraw(); const g = l3anGroup(), c = new THREE.Vector3(...st.cen), r = Math.max(0.3, Math.max(st.mx[0] - st.mn[0], st.mx[1] - st.mn[1], st.mx[2] - st.mn[2]) / 6); [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(a => { const v = new THREE.Vector3(...a).multiplyScalar(r), geo = new THREE.BufferGeometry().setFromPoints([c.clone().sub(v), c.clone().add(v)]), ln = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xdc2626, depthTest: false })); ln.renderOrder = 12; ln.userData.noHit = true; ln.raycast = () => {}; g.add(ln); }); l3Render(); };
      el.querySelector("[data-an-csv]").onclick = () => l3anCsv([["Objekt", "Volym m3", "Yta m2", "Vikt kg"], ...S.map(o => { const s = l3anStats(o.tris); return [o.label, Math.round(s.vol * 1000) / 1000, Math.round(s.area * 100) / 100, Math.round(s.vol * rho)]; })], "Massegenskaper.csv"); } };
}

/* ---- 4. Fria avstånd ---- */
function l3anPtTri(p, a, b, c) { // närmaste punkt på triangeln (Ericson)
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const d1 = dot(ab, ap), d2 = dot(ac, ap); if (d1 <= 0 && d2 <= 0) return a;
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]], d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]; }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]; }
  const va = d3 * d6 - d5 * d4; if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den; return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}
function l3anMinDist(TA, TB) {
  // rutnät över B:s trianglar; hörn av A mot dem (och tvärtom)
  const run = (verts, tris) => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; tris.forEach(q => { for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], q[k]); mx[k] = Math.max(mx[k], q[k]); } });
    const nT = tris.length / 3, size = Math.max(0.5, Math.cbrt(((mx[0] - mn[0]) || 1) * ((mx[1] - mn[1]) || 1) * ((mx[2] - mn[2]) || 1) / Math.max(1, nT / 4))), key = (x, y, z) => Math.floor((x - mn[0]) / size) + "," + Math.floor((y - mn[1]) / size) + "," + Math.floor((z - mn[2]) / size), grid = new Map();
    for (let t = 0; t < nT; t++) { const a = tris[t * 3], b = tris[t * 3 + 1], c = tris[t * 3 + 2], lo = [0, 1, 2].map(k => Math.min(a[k], b[k], c[k])), hi = [0, 1, 2].map(k => Math.max(a[k], b[k], c[k]));
      for (let x = Math.floor((lo[0] - mn[0]) / size); x <= Math.floor((hi[0] - mn[0]) / size); x++) for (let y = Math.floor((lo[1] - mn[1]) / size); y <= Math.floor((hi[1] - mn[1]) / size); y++) for (let z = Math.floor((lo[2] - mn[2]) / size); z <= Math.floor((hi[2] - mn[2]) / size); z++) { const k = x + "," + y + "," + z; (grid.get(k) || grid.set(k, []).get(k)).push(t); } }
    let best = { d: Infinity }; const step = Math.max(1, Math.floor(verts.length / 6000));
    for (let i = 0; i < verts.length; i += step) {
      const p = verts[i], cx = Math.floor((p[0] - mn[0]) / size), cy = Math.floor((p[1] - mn[1]) / size), cz = Math.floor((p[2] - mn[2]) / size), seen = new Set();
      for (let R = 0; R < 60; R++) {
        if (best.d < Infinity && R * size > best.d + size * 1.8) break;
        for (let x = cx - R; x <= cx + R; x++) for (let y = cy - R; y <= cy + R; y++) for (let z = cz - R; z <= cz + R; z++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy), Math.abs(z - cz)) !== R) continue; const L = grid.get(x + "," + y + "," + z); if (!L) continue;
          L.forEach(t => { if (seen.has(t)) return; seen.add(t); const q = l3anPtTri(p, tris[t * 3], tris[t * 3 + 1], tris[t * 3 + 2]), d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (d < best.d) best = { d, p, q }; });
        }
      }
    }
    return best;
  };
  const a = run(TA, TB), b = run(TB, TA); return a.d <= b.d ? a : b;
}
function l3anClear(esc) {
  const A = l3an.A, B = l3an.B, lim = l3an.lim == null ? 0.5 : l3an.lim, r = l3an.clearRes;
  const lab = (o, n) => o ? `${esc(o.label)} <em>(${o.n} obj, ${o.tris.length / 3} tr.)</em>` : `<em>ej vald</em>`;
  const out = r ? `<div class="v3-vp-res"><div class="${r.d < lim ? "fill" : "cut"}"><i></i><span>Minsta avstånd</span><b>${l3anF(r.d, 3)} m</b></div><div class="net"><span>Krav ${l3anF(lim, 2)} m</span><b>${r.d < lim ? "Underskrids" : "Uppfyllt"}</b></div></div>` : `<div class="v3-vp-t">${l3an.clearBusy || "Markera grupp A, tryck Sätt A. Markera grupp B, tryck Sätt B."}</div>`;
  return { html: `<div class="v3-an-kv"><span>A</span><b>${lab(A)}</b></div><div class="v3-an-kv"><span>B</span><b>${lab(B)}</b></div><div class="v3-an-r"><button type="button" data-an-seta>Sätt A = markerat</button><button type="button" data-an-setb>Sätt B = markerat</button><label>Krav (m) <input type="text" inputmode="decimal" data-an-lim value="${String(lim).replace(".", ",")}" style="width:60px"></label></div>${out}<div class="v3-vp-t">Avståndet räknas mellan hörn och ytor på de markerade objekten (för full kollisionskontroll finns Kollisionskontroll i Visa-menyn).</div><div class="v3-vq-foot"><button type="button" class="primary" data-an-go ${A && B ? "" : "disabled"}>Räkna avstånd</button></div>`,
    bind: el => { const cap = k => { const S = l3anSelection(); if (!S.length) { l3Status("Markera något först.", true); return; } const tris = []; S.forEach(o => o.tris.forEach(t => tris.push(t))); l3an[k] = { label: S.length === 1 ? S[0].label : `${S.length} objekt`, n: S.length, tris }; l3an.clearRes = null; l3anOpen(); };
      el.querySelector("[data-an-seta]").onclick = () => cap("A"); el.querySelector("[data-an-setb]").onclick = () => cap("B");
      el.querySelector("[data-an-lim]").onchange = e => { const v = Number(String(e.target.value).replace(",", ".")); l3an.lim = Number.isFinite(v) ? v : 0.5; if (l3an.clearRes) l3anOpen(); };
      el.querySelector("[data-an-go]").onclick = async () => { l3an.clearBusy = "Räknar…"; l3anOpen(); await l3anTick(); const r = l3anMinDist(A.tris, B.tris); l3an.clearBusy = ""; l3an.clearRes = r.d < Infinity ? r : null; l3anClearDraw();
        if (r.d < Infinity) { const g = l3anGroup(), p = new THREE.Vector3(...r.p), q = new THREE.Vector3(...r.q), ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p, q]), new THREE.LineBasicMaterial({ color: r.d < (l3an.lim == null ? 0.5 : l3an.lim) ? 0xdc2626 : 0x16a34a, depthTest: false })); ln.renderOrder = 12; ln.userData.noHit = true; ln.raycast = () => {}; g.add(ln);
          const el2 = document.createElement("div"); el2.className = "v3-meas v3-meas-keep"; el2.textContent = `${l3anF(r.d, 3)} m`; l3.renderer.domElement.parentElement.appendChild(el2); el2._at = p.clone().add(q).multiplyScalar(0.5); l3an.labs = [el2]; l3m.labels.set("an-clear", el2); if (typeof l3mPlaceLabels === "function") l3mPlaceLabels(); }
        l3Render(); l3anOpen(); }; } };
}

/* ---- 5. Jämför modeller ---- */
function l3anCmpStats(m) {
  const map = new Map();
  m.meshes.forEach(mesh => { const u = mesh.userData.l3b; if (!u) return; const pos = mesh.geometry.getAttribute("position").array; mesh.updateMatrixWorld(true); const M = mesh.matrixWorld.elements;
    u.ranges.forEach((r, ri) => { if (!r.guid) return; let nx = 1e30, ny = 1e30, nz = 1e30, xx = -1e30, xy = -1e30, xz = -1e30;
      for (let i = r.start; i < r.start + r.count; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], X = M[0] * x + M[4] * y + M[8] * z + M[12], Y = M[1] * x + M[5] * y + M[9] * z + M[13], Z = M[2] * x + M[6] * y + M[10] * z + M[14]; nx = Math.min(nx, X); ny = Math.min(ny, Y); nz = Math.min(nz, Z); xx = Math.max(xx, X); xy = Math.max(xy, Y); xz = Math.max(xz, Z); }
      map.set(r.guid, { mesh, ri, name: r.name || "", cls: r.cls || "", n: r.count, b: [nx, ny, nz, xx, xy, xz] }); }); });
  return map;
}
function l3anCmp(esc) {
  const ms = l3anModels(); if (ms.length < 2) return { html: `<div class="v3-vp-t">Läs in två modeller (t.ex. två versioner av samma modell) för att jämföra dem.</div>` };
  const a = l3an.cmpA || ms[0].id, b = l3an.cmpB || ms[1].id, r = l3an.cmp, sel = (k, v) => `<select data-an-c="${k}">${ms.map(m => `<option value="${esc(m.id)}" ${m.id === v ? "selected" : ""}>${esc(m.name || m.id)}</option>`).join("")}</select>`;
  const sect = (key, title, col) => r && r[key].length ? `<div class="v3-an-sec"><button type="button" data-an-all="${key}" title="Markera alla i 3D">${title} (${r[key].length}) – markera</button></div><div class="v3-an-list">${r[key].slice(0, 80).map((x, i) => `<div class="v3-an-row"><button type="button" data-an-pick="${key}:${i}"><i style="background:${col}"></i>${esc(x.name || x.cls || "Objekt")}</button><span>${esc(l3anClsName(x.cls))}${x.why ? " · " + esc(x.why) : ""}</span></div>`).join("")}${r[key].length > 80 ? `<div class="v3-vp-t">…och ${r[key].length - 80} till</div>` : ""}</div>` : "";
  return { html: `<div class="v3-an-r"><label>Gammal ${sel("A", a)}</label><label>Ny ${sel("B", b)}</label></div>${r ? `<div class="v3-an-kv"><span>Tillkommit</span><b>${r.added.length}</b></div><div class="v3-an-kv"><span>Borttaget</span><b>${r.removed.length}</b></div><div class="v3-an-kv"><span>Ändrat</span><b>${r.changed.length}</b></div><div class="v3-an-kv"><span>Oförändrat</span><b>${r.same}</b></div>${sect("added", "Tillkommit", "#16a34a")}${sect("removed", "Borttaget", "#dc2626")}${sect("changed", "Ändrat", "#f59e0b")}` : `<div class="v3-vp-t">${l3an.cmpBusy || "Jämför objekten på GUID: tillkommet, borttaget och ändrat (läge eller form)."}</div>`}<div class="v3-vq-foot"><button type="button" class="primary" data-an-go>Jämför</button><button type="button" data-an-csv ${r ? "" : "disabled"}>Exportera CSV</button></div>`,
    bind: el => { el.querySelectorAll("[data-an-c]").forEach(s => { s.onchange = () => { l3an["cmp" + s.dataset.anC] = s.value; l3an.cmp = null; l3anOpen(); }; });
      el.querySelector("[data-an-go]").onclick = async () => { l3an.cmpA = el.querySelector('[data-an-c="A"]').value; l3an.cmpB = el.querySelector('[data-an-c="B"]').value; l3an.cmpBusy = "Jämför…"; l3anOpen(); await l3anTick();
        const MA = ms.find(m => m.id === l3an.cmpA), MB = ms.find(m => m.id === l3an.cmpB), SA = l3anCmpStats(MA), SB = l3anCmpStats(MB), res = { added: [], removed: [], changed: [], same: 0 };
        SB.forEach((x, g) => { const y = SA.get(g); if (!y) { res.added.push(x); return; } const dd = Math.max(...x.b.map((v, k) => Math.abs(v - y.b[k]))); if (dd > 0.002 || x.n !== y.n || x.name !== y.name) { x.why = dd > 0.002 ? `flyttat/ändrat ${l3anF(dd * 1000, 0)} mm` : x.name !== y.name ? "nytt namn" : "ändrad form"; x.old = y; res.changed.push(x); } else res.same++; });
        SA.forEach((y, g) => { if (!SB.has(g)) res.removed.push(y); }); l3an.cmp = res; l3an.cmpBusy = ""; l3anOpen(); };
      const pick = list => { l3bsSet(list.map(x => ({ mesh: x.mesh, ri: x.ri }))); if (list.length) l3bsZoom(); };
      el.querySelectorAll("[data-an-pick]").forEach(b => { b.onclick = () => { const [k, i] = b.dataset.anPick.split(":"); pick([r[k][Number(i)]]); }; });
      el.querySelectorAll("[data-an-all]").forEach(b => { b.onclick = () => pick(r[b.dataset.anAll]); });
      const c = el.querySelector("[data-an-csv]"); if (c) c.onclick = () => l3anCsv([["Status", "Namn", "Klass", "Anmärkning"], ...["added", "removed", "changed"].flatMap(k => r[k].map(x => [{ added: "Tillkommit", removed: "Borttaget", changed: "Ändrat" }[k], x.name, x.cls, x.why || ""]))], "Jamforelse.csv"); } };
}

/* ---- 6. Smart markering ---- */
function l3anFind(q) {
  const out = [], ms = l3anModels().filter(m => m.visible && (!q.model || m.id === q.model)), nm = (q.name || "").toLowerCase();
  ms.forEach(m => m.meshes.forEach(mesh => { const u = mesh.userData.l3b; if (!u) return; const pos = mesh.geometry.getAttribute("position").array;
    u.ranges.forEach((r, ri) => { if (u.hidden && u.hidden.has(ri)) return; if (q.cls && String(r.cls || "").toUpperCase() !== q.cls) return; if (nm && !String(r.name || "").toLowerCase().includes(nm)) return;
      if (q.minSize > 0) { let nx = 1e30, ny = 1e30, nz = 1e30, xx = -1e30, xy = -1e30, xz = -1e30; for (let i = r.start; i < r.start + r.count; i++) { const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2]; nx = Math.min(nx, x); ny = Math.min(ny, y); nz = Math.min(nz, z); xx = Math.max(xx, x); xy = Math.max(xy, y); xz = Math.max(xz, z); } if (Math.max(xx - nx, xy - ny, xz - nz) < q.minSize) return; }
      if (q.coupled === "yes" && !r.itemId) return; if (q.coupled === "no" && r.itemId) return;
      out.push({ mesh, ri }); }); }));
  return out;
}
function l3anSelUi(esc) {
  const q = l3an.q || (l3an.q = { cls: "", name: "", model: "", minSize: 0, coupled: "" }), ms = l3anModels(), cl = new Map();
  ms.forEach(m => m.meshes.forEach(mesh => { const u = mesh.userData.l3b; if (u) u.ranges.forEach(r => { const k = String(r.cls || "").toUpperCase(); cl.set(k, (cl.get(k) || 0) + 1); }); }));
  const found = l3an.found, cnt = l3bs.sel.length;
  return { html: `<div class="v3-an-grid"><label>Klass<select data-an-q="cls"><option value="">Alla</option>${[...cl.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `<option value="${esc(k)}" ${q.cls === k ? "selected" : ""}>${esc(l3anClsName(k))} (${n})</option>`).join("")}</select></label>
    <label>Modell<select data-an-q="model"><option value="">Alla</option>${ms.map(m => `<option value="${esc(m.id)}" ${q.model === m.id ? "selected" : ""}>${esc(m.name || m.id)}</option>`).join("")}</select></label>
    <label>Namn innehåller<input type="text" data-an-q="name" value="${esc(q.name)}" placeholder="t.ex. HEB"></label>
    <label>Större än (m)<input type="text" inputmode="decimal" data-an-q="minSize" value="${q.minSize ? String(q.minSize).replace(".", ",") : ""}" placeholder="0"></label>
    <label>Kopplad till aktivitet<select data-an-q="coupled"><option value="" ${!q.coupled ? "selected" : ""}>Alla</option><option value="yes" ${q.coupled === "yes" ? "selected" : ""}>Bara kopplade</option><option value="no" ${q.coupled === "no" ? "selected" : ""}>Bara okopplade</option></select></label></div>
    <div class="v3-vp-t">${found != null ? `${found} objekt matchar.` : ""} ${cnt ? `${cnt} IFC-objekt är markerade nu.` : ""}</div>
    <div class="v3-vq-foot"><button type="button" class="primary" data-an-go>Markera</button><button type="button" data-an-add title="Lägg till i markeringen">Lägg till</button><button type="button" data-an-like ${cnt ? "" : "disabled"} title="Markera alla med samma klass och namn som det markerade">Likadana</button></div>`,
    bind: el => { const rd = () => { el.querySelectorAll("[data-an-q]").forEach(i => { const k = i.dataset.anQ; q[k] = k === "minSize" ? (Number(String(i.value).replace(",", ".")) || 0) : i.value; }); };
      el.querySelectorAll("[data-an-q]").forEach(i => { i.onchange = () => { rd(); l3an.found = l3anFind(q).length; l3anOpen(); }; if (i.tagName === "INPUT") i.onkeydown = e => e.stopPropagation(); });
      const lim = list => list.slice(0, 30000);
      el.querySelector("[data-an-go]").onclick = () => { rd(); const f = l3anFind(q); l3an.found = f.length; l3bsSet(lim(f)); if (f.length) l3bsZoom(); l3anOpen(); };
      el.querySelector("[data-an-add]").onclick = () => { rd(); const f = l3anFind(q); l3an.found = f.length; l3bsSet(lim([...l3bs.sel.map(e => ({ mesh: e.mesh, ri: e.ri })), ...f])); l3anOpen(); };
      el.querySelector("[data-an-like]").onclick = () => { const keys = new Set(l3bs.sel.map(e => { const r = e.mesh.userData.l3b.ranges[e.ri]; return String(r.cls || "").toUpperCase() + "|" + (r.name || ""); })); const all = []; l3anModels().filter(m => m.visible).forEach(m => m.meshes.forEach(mesh => { const u = mesh.userData.l3b; if (u) u.ranges.forEach((r, ri) => { if (keys.has(String(r.cls || "").toUpperCase() + "|" + (r.name || ""))) all.push({ mesh, ri }); }); })); l3an.found = all.length; l3bsSet(lim(all)); l3anOpen(); }; } };
}

/* ---- 7. Tidslinje ---- */
function l3anTime(esc) {
  const its = (typeof items !== "undefined" ? items : []).filter(r => r.start_date && r.end_date), pls = placements.filter(p => !(placeLib(p.type) || {}).isModel && (p.start || p.end));
  const dates = [...its.flatMap(r => [r.start_date, r.end_date]), ...pls.flatMap(p => [p.start, p.end].filter(Boolean))].sort();
  if (!dates.length) return { html: `<div class="v3-vp-t">Inga aktiviteter eller etableringsobjekt med datum att visa.</div>` };
  const d0 = new Date(dates[0]), d1 = new Date(dates[dates.length - 1]), days = Math.max(7, Math.round((d1 - d0) / 864e5) + 1), W = 340, H = 120, step = Math.max(1, Math.ceil(days / 120)), N = Math.ceil(days / step) + 1;
  const iso = n => new Date(d0.getTime() + n * 864e5).toISOString().slice(0, 10), A = [], P = [];
  for (let k = 0; k < N; k++) { const d = iso(k * step); A.push(its.filter(r => r.start_date <= d && r.end_date >= d).length); P.push(pls.filter(p => (!p.start || p.start <= d) && (!p.end || p.end >= d)).length); }
  const mx = Math.max(1, ...A, ...P), line = (S, col) => `<polyline fill="none" stroke="${col}" stroke-width="2" points="${S.map((v, k) => `${(k / Math.max(1, N - 1) * (W - 20) + 10).toFixed(1)},${(H - 14 - v / mx * (H - 28)).toFixed(1)}`).join(" ")}"/>`;
  const cur = ($("dateInput") || {}).value || "", cx = cur ? (Math.round((new Date(cur) - d0) / 864e5) / step) / Math.max(1, N - 1) * (W - 20) + 10 : -1;
  return { html: `<svg viewBox="0 0 ${W} ${H}" class="v3-an-chart" data-an-chart><rect x="0" y="0" width="${W}" height="${H}" fill="#f8fafc" rx="8"/>${line(A, "#2563eb")}${line(P, "#f59e0b")}${cx >= 0 && cx <= W ? `<line x1="${cx}" x2="${cx}" y1="6" y2="${H - 10}" stroke="#dc2626" stroke-width="1.5"/>` : ""}<text x="10" y="${H - 2}" font-size="9" fill="#64748b">${dates[0]}</text><text x="${W - 10}" y="${H - 2}" font-size="9" fill="#64748b" text-anchor="end">${dates[dates.length - 1]}</text><text x="12" y="14" font-size="9" fill="#64748b">max ${mx}</text></svg>
    <div class="v3-an-legs"><div class="v3-an-leg"><i style="background:#2563eb"></i><span>Pågående aktiviteter</span></div><div class="v3-an-leg"><i style="background:#f59e0b"></i><span>Aktiva etableringsobjekt</span></div></div><div class="v3-vp-t">Tryck i diagrammet för att hoppa till datumet. Röd linje = valt datum (${esc(cur || "–")}).</div>`,
    bind: el => { const svg = el.querySelector("[data-an-chart]"); svg.style.cursor = "pointer"; svg.onclick = e => { const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * W, f = Math.max(0, Math.min(1, (x - 10) / (W - 20))), d = iso(Math.round(f * (N - 1)) * step), inp = document.getElementById("v3Date"); if (inp) { inp.value = d; inp.dispatchEvent(new Event("change")); } setTimeout(() => l3anOpen(), 150); }; } };
}
