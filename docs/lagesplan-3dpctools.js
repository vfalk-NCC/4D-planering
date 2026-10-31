/* Punktmolnsverktyg – en egen verktygsmeny för punktmolnen (Victor 2026-10-31: "ha en separat verktygsmeny för punktmolnen" + "ALLA").
   Redigera (ring/rektangel), filter (brus, utglesning, höjd, mark/över mark), profil/snitt, differentialanalys (jämför moln/datum, färgkarta
   för skillnad), volym (mät, tabell med CSV, släntkropp med bermer). Filtren är redigeringar som sparas och läggs på igen (se lagesplan-3dpcedit.js). */
const l3pt = { open: false, el: null, btn: null, cid: null, picking: 0, ptsA: null, prof: null, line: null, kb: null };
const L3PT_CSS = `#v3PcToolBtn{font-size:18px}#v3PcToolBtn.on{background:#2563eb!important;color:#fff!important}
#v3PcTools{position:absolute;right:64px;bottom:12px;z-index:23;width:min(340px,calc(100% - 80px));max-height:calc(100% - 100px);overflow:auto;background:var(--v3-panel,#fff);color:inherit;border:1px solid rgba(0,0,0,.12);border-radius:14px;box-shadow:0 10px 32px rgba(0,0,0,.22);font:13px system-ui,sans-serif;padding:8px 10px}
#v3PcTools h4{margin:2px 0 6px;font-size:13px;display:flex;justify-content:space-between;align-items:center}#v3PcTools details{border-top:1px solid rgba(0,0,0,.08);padding:6px 0}#v3PcTools summary{cursor:pointer;font-weight:600;padding:2px 0}
#v3PcTools .r{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:6px 0}#v3PcTools label.f{display:flex;gap:6px;align-items:center;justify-content:space-between;margin:5px 0}#v3PcTools label.f input,#v3PcTools label.f select{width:96px;padding:4px 6px;border:1px solid rgba(0,0,0,.18);border-radius:7px;font:inherit}
#v3PcTools button{border:1px solid rgba(0,0,0,.15);background:#fff;border-radius:9px;padding:6px 10px;font:inherit;cursor:pointer}#v3PcTools button.p{background:#2563eb;color:#fff;border-color:#2563eb}#v3PcTools button.bad{background:#dc2626;color:#fff;border-color:#dc2626}#v3PcTools .t{opacity:.7;font-size:12px}`;
const l3ptEsc = s => (typeof escHtml === "function" ? escHtml(String(s)) : String(s));
const l3ptCloud = () => l3pc.clouds.find(c => c.id === l3pt.cid) || l3pc.clouds.find(c => c.visible) || l3pc.clouds[0] || null;
const l3ptNum = (id, d) => { const el = document.getElementById(id), v = el ? Number(String(el.value).replace(",", ".")) : NaN; return Number.isFinite(v) ? v : d; };
/* Knappen som öppnar menyn syns så snart det finns ett punktmoln. */
function l3ptSync() {
  const host = document.getElementById("v3Canvas"); if (!host) return;
  if (!document.getElementById("v3PcToolCss")) { const st = document.createElement("style"); st.id = "v3PcToolCss"; st.textContent = L3PT_CSS; document.head.appendChild(st); }
  const has = typeof l3pc !== "undefined" && l3pc.clouds.length > 0;
  if (has && !document.getElementById("v3PcToolBtn")) {
    const b = document.createElement("button"); b.id = "v3PcToolBtn"; b.type = "button"; b.className = "v3-qv-b"; b.title = "Punktmolnsverktyg: redigera, filter, profil, differens, volym"; b.textContent = "☁"; const qv = host.querySelector(".v3-qv"); if (qv) qv.insertBefore(b, qv.firstChild); else { b.style.cssText = "position:absolute;right:12px;bottom:60px;z-index:21"; host.appendChild(b); } l3pt.btn = b;
    ["pointerdown", "click", "dblclick", "wheel"].forEach(t => b.addEventListener(t, e => e.stopPropagation())); b.onclick = () => l3ptToggle(); b.addEventListener('click', () => b.classList.toggle('on', l3pt.open));
  } else if (!has) { const b = document.getElementById("v3PcToolBtn"); if (b) b.remove(); l3ptClose(); }
}
function l3ptToggle(on) { const want = on == null ? !l3pt.open : on; if (want) l3ptOpen(); else l3ptClose(); }
function l3ptClose() { l3pt.open = false; const e = document.getElementById("v3PcTools"); if (e) e.remove(); l3pt.el = null; l3ptPickStop(); }
function l3ptOpen() {
  const host = document.getElementById("v3Canvas"); if (!host) return; l3ptSync(); l3pt.open = true;
  let el = document.getElementById("v3PcTools"); if (!el) { el = document.createElement("div"); el.id = "v3PcTools"; host.appendChild(el); l3pt.el = el;
    ["pointerdown", "wheel", "dblclick", "contextmenu", "keydown", "keyup"].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
    el.addEventListener("click", e => { const b = e.target.closest("[data-pt]"); if (b && !b.disabled) l3ptAct(b.dataset.pt, b); }); }
  l3ptRender();
}
function l3ptRender() {
  const el = l3pt.el; if (!el) return; const c = l3ptCloud(); if (!c) { l3ptClose(); return; } l3pt.cid = c.id;
  const open = new Set([...el.querySelectorAll("details[open]")].map(d => d.dataset.k)), keep = k => (open.size ? open.has(k) : k === "ed") ? "open" : "";
  const n = (c.edits || []).length, F = (id, lab, v, st = "any") => `<label class="f"><span>${lab}</span><input id="${id}" type="text" inputmode="decimal" value="${v}"></label>`;
  el.innerHTML = `<h4><span>☁ Punktmolnsverktyg</span><button type="button" data-pt="close" title="Stäng">✕</button></h4>
  <label class="f"><span>Moln</span><select id="ptCloud" style="width:170px">${l3pc.clouds.map(x => `<option value="${l3ptEsc(x.id)}" ${x.id === c.id ? "selected" : ""}>${l3ptEsc(x.name)}</option>`).join("")}</select></label>
  <div class="t">${c.nTot.toLocaleString("sv-SE")} punkter${n ? ` · ${n} redigering${n > 1 ? "ar" : ""}` : ""}</div>
  <div class="r"><button type="button" data-pt="undo" ${n ? "" : "disabled"}>Ångra senaste</button><button type="button" data-pt="reset" ${n ? "" : "disabled"}>Återställ alla</button></div>
  <details data-k="ed" ${keep("ed")}><summary>Redigera punkter</summary><div class="t">Rita en ring eller rektangel runt det som ska bort.</div><div class="r"><button type="button" class="p" data-pt="ring">Ring</button><button type="button" class="p" data-pt="rect">Rektangel</button></div></details>
  <details data-k="fi" ${keep("fi")}><summary>Filter</summary>
    <div class="t"><b>Brus</b> – punkter utan grannar</div>${F("ptNr", "Radie (m)", "0,5")}${F("ptNk", "Minst grannar", "4")}<div class="r"><button type="button" data-pt="noise">Ta bort brus</button></div>
    <div class="t"><b>Utglesning</b> – en punkt per kub</div>${F("ptTs", "Kubsida (m)", "0,1")}<div class="r"><button type="button" data-pt="thin">Glesa ut</button></div>
    <div class="t"><b>Höjd</b> (m ö.h.) – ta bort allt över, under eller mellan</div>${F("ptZ0", "Från/nivå", String((c.info.min[2] + (c.dz || 0)).toFixed(1)).replace(".", ","))}${F("ptZ1", "Till", String((c.info.max[2] + (c.dz || 0)).toFixed(1)).replace(".", ","))}
    <div class="r"><button type="button" data-pt="zabove">Över nivå</button><button type="button" data-pt="zbelow">Under nivå</button><button type="button" data-pt="zbetween">Mellan</button></div>
    <div class="t"><b>Mark / över mark</b> – lägsta punkten i varje ruta är marken. Tar bort växtlighet, fordon och personer.</div>${F("ptGg", "Rutstorlek (m)", "0,5")}${F("ptGh", "Höjd över mark (m)", "0,3")}
    <div class="r"><button type="button" data-pt="gabove">Ta bort över mark</button><button type="button" data-pt="gground">Ta bort marken</button></div></details>
  <details data-k="pr" ${keep("pr")}><summary>Profil / snitt</summary><div class="t">Tryck ut två punkter i vyn. Alla tända moln ritas i samma snitt – så syns skillnaden mellan två ytor.</div>${F("ptPw", "Bredd ± (m)", "0,5")}<div class="r"><button type="button" class="p" data-pt="profile">Rita profil</button><button type="button" data-pt="profclr" ${l3pt.prof ? "" : "disabled"}>Ta bort</button></div></details>
  <details data-k="df" ${keep("df")}><summary>Jämför moln / datum (differens)</summary>${typeof l3dfSettingsHtml === "function" ? l3dfSettingsHtml().replace(/^<details[^>]*>.*?<div class="v3-sm-fold-b">/s, "<div>").replace(/<\/div><\/details>$/, "</div>") : ""}</details>
  <details data-k="vo" ${keep("vo")}><summary>Volym</summary><div class="r"><button type="button" class="p" data-pt="vol">Mät volym…</button><button type="button" data-pt="csv">Volymtabell (CSV)</button></div>
    <div class="t"><b>Släntkropp</b> runt volymområdet (aktuellt eller senast sparade volym)</div>${F("ptSn", "Lutning 1 :", "1,5")}${F("ptSh", "Höjd (m)", "3")}${F("ptSb", "Bermbredd (m, 0 = ingen)", "0")}${F("ptSe", "Berm var (m höjd)", "5")}${F("ptSz", "Nivå botten (m ö.h.)", "")}
    <label class="f"><span>Riktning</span><select id="ptSd"><option value="out">Utåt (schakt)</option><option value="in">Inåt (fyllning)</option></select></label><div class="r"><button type="button" data-pt="slope">Skapa släntkropp</button></div></details>`;
  const sel = el.querySelector("#ptCloud"); if (sel) sel.onchange = () => { l3pt.cid = sel.value; l3ptRender(); };
  if (typeof l3dfBind === "function") l3dfBind(el);
}
function l3ptEdit(spec, what) {
  const c = l3ptCloud(); if (!c) return; l3Busy && l3Busy(true);
  setTimeout(() => { try { const r = l3peAddFilter(c, spec); l3Status(r.removed ? `${what}: ${r.removed.toLocaleString("sv-SE")} punkter borttagna, ${r.left.toLocaleString("sv-SE")} kvar. Ångra tar tillbaka dem.` : `${what}: inga punkter att ta bort med de inställningarna.`); } finally { l3Busy && l3Busy(false); l3ptRender(); } }, 20);
}
function l3ptAct(a, btn) {
  const c = l3ptCloud();
  if (a === "close") return l3ptClose();
  if (a === "undo" && c) { l3peUndo(c); l3ptRender(); return; }
  if (a === "reset" && c) { if (confirm("Ta tillbaka alla borttagna punkter i molnet?")) { l3peReset(c); l3ptRender(); } return; }
  if (a === "ring" || a === "rect") { if (c) { l3peStart(c.id); l3pe.mode = a === "rect" ? "rect" : "poly"; l3pePanel(); } return; }
  if (a === "noise") return l3ptEdit({ t: "noise", r: Math.max(0.02, l3ptNum("ptNr", 0.5)), k: Math.max(1, Math.round(l3ptNum("ptNk", 4))) }, "Brusfilter");
  if (a === "thin") return l3ptEdit({ t: "thin", s: Math.max(0.01, l3ptNum("ptTs", 0.1)) }, "Utglesning");
  if (a === "zabove") return l3ptEdit({ t: "z", mode: "above", z0: l3ptNum("ptZ0", 0) }, "Höjdfilter");
  if (a === "zbelow") return l3ptEdit({ t: "z", mode: "below", z0: l3ptNum("ptZ0", 0) }, "Höjdfilter");
  if (a === "zbetween") return l3ptEdit({ t: "z", mode: "between", z0: Math.min(l3ptNum("ptZ0", 0), l3ptNum("ptZ1", 0)), z1: Math.max(l3ptNum("ptZ0", 0), l3ptNum("ptZ1", 0)) }, "Höjdfilter");
  if (a === "gabove") return l3ptEdit({ t: "ground", mode: "ground", g: Math.max(0.1, l3ptNum("ptGg", 0.5)), h: Math.max(0.02, l3ptNum("ptGh", 0.3)) }, "Mark/över mark");
  if (a === "gground") return l3ptEdit({ t: "ground", mode: "above", g: Math.max(0.1, l3ptNum("ptGg", 0.5)), h: Math.max(0.02, l3ptNum("ptGh", 0.3)) }, "Mark/över mark");
  if (a === "profile") return l3ptPickStart();
  if (a === "profclr") return l3ptProfClear();
  if (a === "vol") { l3SetPref("measure", "volume"); l3SetTool("measure"); l3ptClose(); return; }
  if (a === "csv") return l3ptCsvDownload();
  if (a === "slope") return l3ptSlope();
}

/* ---- Profil / snitt ------------------------------------------------------------------------------------------------ */
/* Punkter från alla tända moln inom ±w m från linjen A→B (scenkoordinater): [avstånd längs, sida, höjd (m ö.h.)] per moln. */
function l3ptProfile(A, B, w, maxPts = 8000) {
  const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1e-9, ux = dx / L, uy = dy / L, out = [], O = l3.O;
  l3pc.clouds.filter(c => c.visible).forEach(c => {
    const g = c.group.position, list = []; c.chunks.forEach(ch => {
      const P = ch.pos, n = P.length / 3; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < n; i += 7) { const x = P[i * 3] + g.x, y = P[i * 3 + 1] + g.y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (Math.max(A[0], B[0]) + w < x0 - 1 || Math.min(A[0], B[0]) - w > x1 + 1 || Math.max(A[1], B[1]) + w < y0 - 1 || Math.min(A[1], B[1]) - w > y1 + 1) return;
      for (let i = 0; i < n; i++) {
        const x = P[i * 3] + g.x - A[0], y = P[i * 3 + 1] + g.y - A[1], t = x * ux + y * uy; if (t < 0 || t > L) continue; const s = -x * uy + y * ux; if (s < -w || s > w) continue;
        list.push(t, s, P[i * 3 + 2] + g.z + O[2]);
      }
    });
    const n = list.length / 3, cap = 400000, step = Math.max(1, Math.ceil(n / cap)), m = Math.ceil(n / step), T = new Float32Array(m), Z = new Float32Array(m), S = new Float32Array(m);
    for (let i = 0, k = 0; i < n; i += step, k++) { T[k] = list[i * 3]; S[k] = list[i * 3 + 1]; Z[k] = list[i * 3 + 2]; }
    const ds = Math.max(1, Math.ceil(m / maxPts)), pts = []; for (let i = 0; i < m; i += ds) pts.push([T[i], S[i], Z[i]]);
    out.push({ id: c.id, name: c.name, n, t: T, s: S, z: Z, pts });
  });
  return { L, series: out };
}
function l3ptPickStart() {
  l3ptProfClear(); l3pt.picking = 1; l3pt.ptsA = null; l3Status("Profil: tryck på punkt A i molnet (Esc avbryter)."); l3pt.kb = e => { if (e.key === "Escape") l3ptPickStop(); };
  window.addEventListener("pointerdown", l3ptPick, true); const dom = l3.renderer.domElement; dom.style.cursor = "crosshair";
}
function l3ptPickStop() { if (!l3pt.picking && !l3pt.kb) return; l3pt.picking = 0; window.removeEventListener("pointerdown", l3ptPick, true); const dom = l3 && l3.renderer && l3.renderer.domElement; if (dom) dom.style.cursor = ""; l3pt.kb = null; }
function l3ptHit(e) {
  const h = typeof l3pcPick === "function" ? l3pcPick(e, 12) : null; if (h) return [h.point.x, h.point.y, h.point.z];
  const r = l3.renderer.domElement.getBoundingClientRect(), rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), l3.camera);
  const c = l3ptCloud(), z = c ? c.info.center[2] - l3.O[2] + (c.dz || 0) : 0, p = new THREE.Vector3(); return rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -z), p) ? [p.x, p.y, p.z] : null;
}
function l3ptPick(e) {
  if (!l3pt.picking || e.button !== 0 || e.target !== l3.renderer.domElement) return; e.stopImmediatePropagation(); e.preventDefault();
  const p = l3ptHit(e); if (!p) return;
  if (!l3pt.ptsA) { l3pt.ptsA = p; l3Status("Profil: tryck på punkt B."); return; }
  const A = l3pt.ptsA, w = l3ptNum("ptPw", 0.5); l3ptPickStop(); l3ptProfShow(A, p, w);
}
function l3ptProfShow(A, B, w) { return l3pfShow(A, B, w); }
function l3ptProfClear() { if (typeof l3pfClear === "function") l3pfClear(); }
function l3ptCsvText(rows, head) { const f = v => typeof v === "number" ? String(Math.round(v * 1000) / 1000).replace(".", ",") : `"${String(v == null ? "" : v).replace(/"/g, '""')}"`; return "﻿" + [head, ...rows].map(r => r.map(f).join(";")).join("\r\n"); }
function l3ptDownload(name, text) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

/* ---- Volymtabell: alla sparade volymmått (en per etapp/zon) med summa ------------------------------------------------ */
function l3ptVolRows() {
  return l3m.list.filter(m => m.kind === "cutfill" && m.vol && m.vol.res).map((m, i) => { const r = m.vol.res; return [m.name || m.note || `Volym ${i + 1}`, r.cut, r.fill, r.net, r.area, r.srcA || "", r.srcB || "", r.at || ""]; });
}
function l3ptCsvBuild() {
  const rows = l3ptVolRows(), sum = [0, 1, 2, 3].map(k => rows.reduce((a, r) => a + (Number(r[k + 1]) || 0), 0));
  return { rows, text: l3ptCsvText([...rows, ["SUMMA", ...sum, "", "", ""]], ["Etapp/zon", "Schakt (m3)", "Fyllning (m3)", "Netto (m3)", "Yta (m2)", "Yta som mäts", "Mot", "Datum"]), sum };
}
function l3ptCsvDownload() { const t = l3ptCsvBuild(); if (!t.rows.length) { l3Status("Det finns inga sparade volymmått. Mät en volym och tryck Spara som mått – gör sedan en per etapp/zon.", true); return; } l3ptDownload("volymtabell.csv", t.text); l3Status(`Volymtabell med ${t.rows.length} rader nedladdad (CSV, öppnas i Excel).`); }

/* ---- Släntkropp med bermer ---------------------------------------------------------------------------------------- */
const l3ptArea2 = P => P.reduce((a, p, i) => { const q = P[(i + 1) % P.length]; return a + (p[0] * q[1] - q[0] * p[1]); }, 0) / 2;
/* Polygonen förskjuten d meter utåt (hörnens gerkant, begränsad). P ska vara moturs. */
function l3ptOffset(P, d) {
  const n = P.length; return P.map((p, i) => {
    const a = P[(i + n - 1) % n], b = P[(i + 1) % n], e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]], l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1,
      n1 = [e1[1] / l1, -e1[0] / l1], n2 = [e2[1] / l2, -e2[0] / l2], dot = n1[0] * n2[0] + n1[1] * n2[1], k = Math.min(4, 1 / Math.max(0.25, 1 + dot)), mx = (n1[0] + n2[0]) * k, my = (n1[1] + n2[1]) * k;
    return [p[0] + mx * d, p[1] + my * d];
  });
}
/* Rutnät av ringar: [[d, z]]… från botten (d = 0) upp till höjden h med lutning 1:n och bermer. */
function l3ptSlopeRings(n, h, berm, every, outward) {
  const sg = outward ? 1 : -1, rings = [[0, 0]]; let d = 0, z = 0;
  while (z < h - 1e-6) { const dz = Math.min(every > 0 ? every : h, h - z); z += dz; d += sg * n * dz; rings.push([d, z]); if (berm > 0 && z < h - 1e-6) { d += sg * berm; rings.push([d, z]); } }
  return rings;
}
/* Sluten kropp: botten (ring 0), sidor mellan ringarna och lock överst. Returnerar { pts, faces } relativt origo. */
function l3ptSlopeSolid(poly, z0, rings) {
  let P = poly.map(p => [p[0], p[1]]); if (l3ptArea2(P) < 0) P = P.reverse(); const o = [P[0][0], P[0][1], z0], V = P.length, pts = [], faces = [];
  for (const [d, z] of rings) { const R = l3ptOffset(P, d); if (l3ptArea2(R) <= 0 && d < 0) break; R.forEach(q => pts.push([q[0] - o[0], q[1] - o[1], z])); }
  const nr = pts.length / V; if (nr < 2) return null;
  for (let r = 0; r < nr - 1; r++) for (let i = 0; i < V; i++) { const a = r * V + i, b = r * V + (i + 1) % V, c = (r + 1) * V + (i + 1) % V, d = (r + 1) * V + i; faces.push([a + 1, b + 1, c + 1], [a + 1, c + 1, d + 1]); }
  const tri = r => THREE.ShapeUtils.triangulateShape(pts.slice(r * V, r * V + V).map(q => new THREE.Vector2(q[0], q[1])), []);
  tri(0).forEach(t => faces.push([t[0] + 1, t[2] + 1, t[1] + 1])); tri(nr - 1).forEach(t => faces.push([(nr - 1) * V + t[0] + 1, (nr - 1) * V + t[1] + 1, (nr - 1) * V + t[2] + 1]));
  return { pts, faces, o, nr };
}
function l3ptSlope() {
  let poly = null, src = "";
  if (l3vol.cur && l3vol.cur.pts && l3vol.cur.pts.length >= 3) { poly = l3vol.cur.pts.map(p => [p[0], p[1], p[2]]); src = "volymen du arbetar med"; }
  else { const m = [...l3m.list].reverse().find(x => x.kind === "cutfill" && x.pts && x.pts.length >= 3); if (m) { poly = m.pts.map(p => [p.x + l3.O[0], p.y + l3.O[1], p.z + l3.O[2]]); src = "senast sparade volymen"; } }
  if (!poly) { l3Status("Släntkropp behöver ett område: mät en volym (Mät → Volym) eller spara en först.", true); return; }
  const n = Math.max(0.1, l3ptNum("ptSn", 1.5)), h = Math.max(0.1, l3ptNum("ptSh", 3)), berm = Math.max(0, l3ptNum("ptSb", 0)), every = Math.max(0.5, l3ptNum("ptSe", 5)), outward = (document.getElementById("ptSd") || {}).value !== "in";
  const zIn = document.getElementById("ptSz"), zb = zIn && zIn.value.trim() !== "" ? l3ptNum("ptSz", 0) : poly.reduce((a, p) => a + p[2], 0) / poly.length;
  const S = l3ptSlopeSolid(poly, zb, l3ptSlopeRings(n, h, berm, every, outward)); if (!S) { l3Status("Kunde inte bygga släntkroppen – kontrollera höjd och lutning.", true); return; }
  const mesh = { k: "mesh", pts: S.pts.map(q => q.map(v => Math.round(v * 1000) / 1000)), faces: S.faces, closed: true };
  placeSnapshot(); const made = modCreate(mesh, S.o, { name: `Släntkropp 1:${String(n).replace(".", ",")}${berm ? " + berm" : ""}`, color: outward ? "#a16207" : "#65a30d", snapshot: false }); l3SelectIds([made.id]); l3Changed();
  l3Status(`Släntkropp skapad runt ${src}: ${outward ? "utåt" : "inåt"}, lutning 1:${String(n).replace(".", ",")}, höjd ${String(h).replace(".", ",")} m${berm ? `, berm ${String(berm).replace(".", ",")} m` : ""}. Använd den som "Mot" i volymmätningen eller med Skär ytor. Ctrl+Z ångrar.`);
}
