/* 3D-vyn – värden som räknas ut ur geometrin (Victor 2026-11-18: "räkna ut volymen på alla objekten med hjälp av geometrin, som Trimble Connect, och
   lägg till fler smarta värden"). Prefix l3gc.
   Per objekt (IFC-objekt i inlästa modeller): volym, total yta, fotavtryck (projicerad i plan), formsida (ca), mått (längd × bredd × höjd längs objektets egen riktning),
   höjd över nollplanet (underkant – överkant), tyngdpunkt, tjocklek (ca), vikt (ca, efter material) och om nätet är slutet (annars är volymen ungefärlig).
   – Ett markerat objekt: avsnittet "Beräknat ur geometrin" i högerpanelen.
   – Flera markerade: summa (antal, volym, yta, formsida, vikt) per klass + CSV.
   – Alla objekt: Analys → Mängdning → "Alla objekt (CSV)" med samma värden för varje objekt i de tända modellerna. */

const L3GC_DENS = [[/betong|concrete|\bb\d{2}\b|\bc\d{2}\/\d{2}\b/i, 2400, "betong"], [/armering|rebar|reinforc/i, 7850, "stål"], [/stål|steel|s355|s235|\bhe[abm]\b|\bipe\b|\brhs\b|\bshs\b/i, 7850, "stål"], [/limträ|trä|wood|timber|\bgl\d{2}/i, 500, "trä"], [/glas|glass/i, 2500, "glas"], [/tegel|brick/i, 1800, "tegel"], [/alumin/i, 2700, "aluminium"], [/gips|plaster/i, 900, "gips"], [/isolering|mineralull|insulation|cellplast/i, 40, "isolering"], [/berg\b|rock/i, 2700, "berg"], [/jord|soil|fyll|grus|krossmaterial/i, 1900, "jord/fyll"]];
const L3GC_STRUCT = /^(IFCSLAB|IFCFOOTING|IFCPILE|IFCWALL|IFCWALLSTANDARDCASE|IFCCOLUMN|IFCBEAM|IFCSTAIR|IFCRAMP|IFCMEMBER|IFCPLATE|IFCBUILDINGELEMENTPROXY)$/i;
const l3gcF = (v, d = 2) => (Number.isFinite(v) ? v : 0).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });
const l3gcTick = () => new Promise(r => setTimeout(r, 6));

/* Material → densitet (kg/m³). text = materialnamn, objektnamn, klass. Okänt material i bärande delar antas vara betong (märks "antagen"). */
function l3gcDensity(text, cls) {
  const t = String(text || ""); for (const [re, d, n] of L3GC_DENS) if (re.test(t)) return { d, n, assumed: false };
  if (L3GC_STRUCT.test(String(cls || "").toUpperCase())) return { d: 2400, n: "betong", assumed: true };
  return null;
}
/* Allt som går att räkna ur ett objekts trianglar (scenkoordinater → projektkoordinater via l3.O). */
function l3gcCalc(mesh, ri) {
  const tris = l3anRangeTris(mesh, ri, []); if (!tris.length) return null;
  const st = l3anStats(tris), O = (typeof l3 !== "undefined" && l3 && l3.O) || [0, 0, 0];
  let foot = 0, wA = 0, mx = 0, my = 0, sxx = 0, sxy = 0, syy = 0;
  const vid = new Map(), edge = new Map(), id = q => { const k = (Math.round(q[0] * 1000) * 73856093) ^ (Math.round(q[1] * 1000) * 19349663) ^ (Math.round(q[2] * 1000) * 83492791); let v = vid.get(k); if (v === undefined) { v = vid.size; vid.set(k, v); uv.push(q); } return v; }, uv = [];
  const addEdge = (a, b) => { const k = a < b ? a * 4194304 + b : b * 4194304 + a; edge.set(k, (edge.get(k) || 0) + 1); };
  for (let i = 0; i + 2 < tris.length; i += 3) {
    const a = tris[i], b = tris[i + 1], c = tris[i + 2], ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, A = Math.hypot(nx, ny, nz) / 2;
    foot += Math.abs(nz) / 4;   // topp + botten räknas båda → hälften = ytan sedd uppifrån
    const gx = (a[0] + b[0] + c[0]) / 3, gy = (a[1] + b[1] + c[1]) / 3; wA += A; mx += A * gx; my += A * gy; sxx += A * gx * gx; sxy += A * gx * gy; syy += A * gy * gy;
    const ia = id(a), ib = id(b), ic = id(c); addEdge(ia, ib); addEdge(ib, ic); addEdge(ic, ia);
  }
  let closed = true; for (const n of edge.values()) if (n !== 2) { closed = false; break; }
  // Objektets egen riktning i plan: huvudaxeln för ytornas spridning (vinkeln ur kovariansen)
  let th = 0; if (wA > 0) { const cx = mx / wA, cy = my / wA, vxx = sxx / wA - cx * cx, vxy = sxy / wA - cx * cy, vyy = syy / wA - cy * cy; th = 0.5 * Math.atan2(2 * vxy, vxx - vyy); }
  /* Minsta omslutande rektangel i plan: huvudaxeln och en svepning var 3:e grad – den med minst area ger objektets egen längd och bredd (en kvadrat hamnar rätt i stället för på diagonalen). */
  let best = null; const angs = [th]; for (let a = 0; a < 90; a += 3) angs.push(a * Math.PI / 180);
  for (const a of angs) { const cu = Math.cos(a), su = Math.sin(a); let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity; for (const q of uv) { const u = q[0] * cu + q[1] * su, v = -q[0] * su + q[1] * cu; if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v; } const du = u1 - u0, dv = v1 - v0, ar = du * dv; if (!best || ar < best.ar - 1e-9) best = { du, dv, ar }; }
  const du = best.du, dv = best.dv, H = st.mx[2] - st.mn[2], mnD = Math.min(du, dv, H), fill = du * dv * H > 0 ? st.vol / (du * dv * H) : 0;
  return { vol: st.vol, area: st.area, foot, side: Math.max(0, st.area - 2 * foot), L: Math.max(du, dv), B: Math.min(du, dv), H, zmin: st.mn[2] + O[2], zmax: st.mx[2] + O[2], cen: [st.cen[0] + O[0], st.cen[1] + O[1], st.cen[2] + O[2]], thick: fill >= 0.5 ? mnD : (st.area > 0 ? 2 * st.vol / st.area : 0), closed, tris: tris.length / 3 };
}
const l3gcRange = ent => { const u = ent.mesh.userData.l3b, r = u.ranges[ent.ri]; return { u, r, cls: String(r.cls || "").toUpperCase(), name: r.name || "" }; };
const l3gcWeight = (g, text, cls) => { const d = l3gcDensity(text, cls); return d ? { kg: g.vol * d.d, ...d } : null; };

/* ---- Ett markerat objekt ---- */
function l3gcRowsHtml(g, w) {
  const esc = escHtml, row = (k, v, t) => `<tr${t ? ` title="${esc(t)}"` : ""}><td>${k}</td><td>${v}</td><td></td></tr>`;
  const dim = `${l3gcF(g.L, 3)} × ${l3gcF(g.B, 3)} × ${l3gcF(g.H, 3)} m`;
  const flat = g.thick > 0 && g.thick < 0.5 * Math.min(g.L, g.B);
  return row("Volym", `${l3gcF(g.vol, g.vol < 1 ? 4 : 3)} m³`, "Räknad ur geometrin (som i Trimble Connect)")
    + row("Total yta", `${l3gcF(g.area)} m²`) + row("Fotavtryck", `${l3gcF(g.foot)} m²`, "Ytan sedd uppifrån (projicerad i plan)")
    + row("Formsida (ca)", `${l3gcF(g.side)} m²`, "Total yta minus topp och botten – ungefär den yta som behöver form")
    + row("Mått", dim, "Längd × bredd × höjd längs objektets egen riktning i plan")
    + row("Höjd över noll", `${l3gcF(g.zmin, 3)} – ${l3gcF(g.zmax, 3)} m`, "Underkant – överkant i projektets höjdsystem")
    + row("Tyngdpunkt", `${l3gcF(g.cen[0], 2)} ; ${l3gcF(g.cen[1], 2)} ; ${l3gcF(g.cen[2], 2)}`, "X ; Y ; Z i projektets koordinater")
    + (flat ? row("Tjocklek (ca)", `${l3gcF(g.thick, 3)} m`, "Minsta måttet för kompakta delar, annars 2 × volym ÷ yta") : "")
    + (w ? row(`Vikt (ca)`, `${w.kg >= 1000 ? l3gcF(w.kg / 1000, w.kg >= 1e5 ? 0 : 2) + " ton" : l3gcF(w.kg, 0) + " kg"}`, `${w.n}${w.assumed ? " (antaget – inget material angivet)" : ""}, ${l3gcF(w.d, 0)} kg/m³`) + "" : "")
    + row("Nät", g.closed ? "Slutet ✓" : "Öppet – volymen är ungefärlig", `${g.tris} trianglar`);
}
async function l3gcSide(side, ent) {
  if (!side) return;
  let host = side.querySelector("#v3BsGeo"); if (host) host.remove();
  if (!ent) { l3gcSideMany(side).catch(e => console.warn("Geometrisumma", e)); return; }
  if (!ent.mesh || !ent.mesh.geometry) return;
  const { cls, name } = l3gcRange(ent), sid = side.dataset.id;
  host = document.createElement("div"); host.id = "v3BsGeo"; host.className = "v3-geo"; host.innerHTML = `<div class="v3-pal-hint"><span class="pm-spin"></span> Räknar ur geometrin…</div>`;
  const pr = side.querySelector("#v3BsProps"); if (pr) pr.parentNode.insertBefore(host, pr); else side.appendChild(host);
  await l3gcTick(); if (side.dataset.id !== sid || !host.isConnected) return;
  let g = null; try { g = l3gcCalc(ent.mesh, ent.ri); } catch (e) { console.warn("Geometriberäkning", e); }
  if (!g) { host.innerHTML = ""; return; }
  const mat = (typeof l3pProps === "function" && l3p && l3p.w && l3p.w.has(ent.mesh.userData.l3b.model && ent.mesh.userData.l3b.model.id)) ? await l3pProps(ent.mesh.userData.l3b.model, l3gcRange(ent).r.copyOf || l3gcRange(ent).r.guid, { local: true }).catch(() => null) : null;
  const w = l3gcWeight(g, [name, ...(mat && mat.material ? mat.material : [])].join(" "), cls);
  if (side.dataset.id !== sid || !host.isConnected) return;
  host.innerHTML = `<details class="v3-ps" open><summary><span>Beräknat ur geometrin</span><em>${l3gcF(g.vol, 3)} m³</em></summary><table class="v3-pt">${l3gcRowsHtml(g, w)}</table><div class="v3-geo-b"><button type="button" class="v3-link" data-gc="copy" title="Kopiera värdena som text">Kopiera</button></div></details>`;
  host.querySelector('[data-gc="copy"]').onclick = async () => { const t = [...host.querySelectorAll("tr")].map(r => r.children[0].textContent + ": " + r.children[1].textContent).join("\n"); try { await navigator.clipboard.writeText(name + "\n" + t); l3Status("Värdena är kopierade."); } catch (e) { prompt("Kopiera:", t); } };
}

/* ---- Flera markerade: summa per klass ---- */
async function l3gcSideMany(side) {
  const sel = l3bs.sel.slice(), n = sel.length; if (n < 2) return; const sid = side.dataset.id;
  const host = document.createElement("div"); host.id = "v3BsGeo"; host.className = "v3-geo"; host.innerHTML = `<div class="v3-pal-hint"><span class="pm-spin"></span> Räknar volym ur geometrin…</div>`; side.appendChild(host);
  const tot = { n: 0, vol: 0, area: 0, side: 0, kg: 0, open: 0 }, by = new Map(), rows = []; let k = 0;
  for (const e of sel) {
    if (side.dataset.id !== sid || !host.isConnected) return;
    let g = null; try { g = e.mesh && e.mesh.geometry ? l3gcCalc(e.mesh, e.ri) : null; } catch (er) { g = null; }
    if (g) { const { cls, name, r } = l3gcRange(e), w = l3gcWeight(g, name, cls); tot.n++; tot.vol += g.vol; tot.area += g.area; tot.side += g.side; if (w) tot.kg += w.kg; if (!g.closed) tot.open++;
      const c = by.get(cls) || { cls, n: 0, vol: 0, area: 0 }; c.n++; c.vol += g.vol; c.area += g.area; by.set(cls, c); rows.push({ e, g, w, name, cls, guid: r.guid }); }
    if (++k % 150 === 0) { host.innerHTML = `<div class="v3-pal-hint"><span class="pm-spin"></span> Räknar volym ur geometrin… ${k} av ${n}</div>`; await l3gcTick(); }
  }
  if (side.dataset.id !== sid || !host.isConnected) return;
  const cl = [...by.values()].sort((a, b) => b.vol - a.vol), cn = typeof l3anClsName === "function" ? l3anClsName : c => c;
  const tr = (k, v, t) => `<tr${t ? ` title="${escHtml(t)}"` : ""}><td>${k}</td><td>${v}</td><td></td></tr>`;
  host.innerHTML = `<details class="v3-ps" open><summary><span>Summa ur geometrin</span><em>${l3gcF(tot.vol, 2)} m³</em></summary><table class="v3-pt">
    ${tr("Objekt", `${tot.n}${tot.n < n ? ` av ${n}` : ""}`)}${tr("Volym", `${l3gcF(tot.vol, 3)} m³`, "Räknad ur geometrin")}${tr("Total yta", `${l3gcF(tot.area)} m²`)}${tr("Formsida (ca)", `${l3gcF(tot.side)} m²`, "Total yta minus topp och botten")}
    ${tot.kg ? tr("Vikt (ca)", `${l3gcF(tot.kg / 1000, 1)} ton`, "Efter material (betong 2400, stål 7850 …). Okänt material i bärande delar antas vara betong.") : ""}
    ${cl.length > 1 ? cl.slice(0, 8).map(c => tr(escHtml(cn(c.cls)), `${c.n} st · ${l3gcF(c.vol, 2)} m³`)).join("") + (cl.length > 8 ? tr("…", `${cl.length - 8} klasser till`) : "") : ""}
    </table>${tot.open ? `<div class="v3-pal-hint" title="Objekt med öppet nät får en ungefärlig volym">${tot.open} av objekten har öppet nät – volymen för dem är ungefärlig.</div>` : ""}
    <div class="v3-geo-b"><button type="button" class="v3-link" data-gc="csv">Exportera mått (CSV)</button></div></details>`;
  host.querySelector('[data-gc="csv"]').onclick = () => l3gcCsv(rows.map(r => l3gcLine(r.e, r.g, r.w)), "Mått markerade objekt.csv");
}

/* ---- CSV ---- */
const L3GC_HEAD = ["Modell", "Namn", "Klass", "GUID", "Volym m3", "Yta m2", "Fotavtryck m2", "Formsida m2", "Längd m", "Bredd m", "Höjd m", "Z under", "Z över", "X", "Y", "Z", "Tjocklek m", "Vikt kg", "Material", "Nät"];
function l3gcLine(e, g, w) {
  const { u, r, cls, name } = l3gcRange(e), n = (v, d = 4) => String(Math.round(v * 10 ** d) / 10 ** d).replace(".", ",");
  return [(u.model && u.model.name) || "", name, cls, r.guid || "", n(g.vol), n(g.area, 3), n(g.foot, 3), n(g.side, 3), n(g.L, 3), n(g.B, 3), n(g.H, 3), n(g.zmin, 3), n(g.zmax, 3), n(g.cen[0], 3), n(g.cen[1], 3), n(g.cen[2], 3), n(g.thick, 3), w ? n(w.kg, 1) : "", w ? w.n + (w.assumed ? " (antaget)" : "") : "", g.closed ? "slutet" : "öppet"];
}
function l3gcCsv(lines, name) {
  const q = v => { v = String(v == null ? "" : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const blob = new Blob(["﻿" + [L3GC_HEAD, ...lines].map(r => r.map(q).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  if (typeof downloadBlob === "function") downloadBlob(blob, name); else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
}
/* Alla objekt i de tända modellerna (utom dolda): ett CSV-rad per objekt. Körs i omgångar så att fliken inte fryser. */
async function l3gcExportAll() {
  const ms = (typeof l3b !== "undefined" ? l3b.models : []).filter(m => m.visible !== false); if (!ms.length) { l3Status("Inga modeller är inlästa.", true); return null; }
  let total = 0; ms.forEach(m => m.meshes.forEach(x => { const u = x.userData.l3b; if (u) total += u.ranges.length; }));
  const lines = []; let k = 0, open = 0, vol = 0;
  l3Status(`Räknar volym och mått för ${total} objekt…`); await l3gcTick();
  for (const m of ms) for (const mesh of m.meshes) {
    const u = mesh.userData.l3b; if (!u) continue;
    for (let ri = 0; ri < u.ranges.length; ri++) {
      if (u.hidden && u.hidden.has(ri)) continue;
      const e = { mesh, ri }, g = l3gcCalc(mesh, ri); if (!g) continue; const { cls, name } = l3gcRange(e);
      lines.push(l3gcLine(e, g, l3gcWeight(g, name, cls))); vol += g.vol; if (!g.closed) open++;
      if (++k % 200 === 0) { l3Status(`Räknar volym och mått… ${k} av ${total}`); await l3gcTick(); }
    }
  }
  l3gcCsv(lines, "Mått alla objekt.csv"); l3Status(`${lines.length} objekt, totalt ${l3gcF(vol, 1)} m³${open ? ` (${open} med öppet nät, ungefärlig volym)` : ""}. CSV sparad.`);
  return { n: lines.length, vol, open };
}
