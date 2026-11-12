/* 3D-text (Victor 2026-11-12: "ett verktyg för att skriva 3d-text … olika typsnitt och tjocklek och storlek, likt Contour plate i Tekla").
   Knappen 3D-text: skriv texten (flera rader går), välj typsnitt (de som finns i datorn eller en egen fil .ttf/.otf/.woff), fet/kursiv, teckenhöjd, tjocklek, radavstånd, justering,
   färg, liggande på marken eller stående, vridning och valfri bakplatta. Förhandsvisning direkt i 3D. Placeras med ett tryck, två tryck (läge + riktning) eller där kameran tittar.
   Texten ritas på en duk, konturerna spåras (marching squares), förenklas och trianglas (hål i 0, 4, 6, 8, A, B … hanteras) och pressas till en SLUTEN kropp = ett vanligt ritat objekt
   (kan flyttas, vridas, delas, färgas och exporteras som IFC). Prefix l3tx. */
const l3tx = { d: null, group: null, timer: 0, editId: null, fonts: null };
const L3TX_FONTS = ["Arial", "Arial Black", "Helvetica", "Verdana", "Tahoma", "Trebuchet MS", "Segoe UI", "Calibri", "Franklin Gothic Medium", "Impact", "Times New Roman", "Georgia", "Palatino Linotype", "Cambria", "Courier New", "Consolas", "Lucida Console", "Comic Sans MS", "Brush Script MT", "Papyrus"];
const L3TX_GENERIC = [["sans-serif", "Sans (standard)"], ["serif", "Serif (standard)"], ["monospace", "Fast bredd (standard)"], ["cursive", "Handstil (standard)"]];
const l3txDef = () => ({ text: "F18", font: "Arial", bold: true, italic: false, h: 0.5, t: 0.1, space: 1.15, align: "left", color: "#2f7bff", mode: "lying", rot: 0, x: 0, y: 0, z: 0, plate: false, margin: 0.1, name: "" });
function l3txFontList() {
  if (l3tx.fonts) return l3tx.fonts;
  const c = document.createElement("canvas").getContext("2d"), probe = f => { c.font = `72px monospace`; const a = c.measureText("mmmmmmmmmmlli0O").width; c.font = `72px "${f}", monospace`; const b = c.measureText("mmmmmmmmmmlli0O").width; c.font = `72px "${f}", serif`; const d = c.measureText("mmmmmmmmmmlli0O").width; return a !== b || b !== d; };
  l3tx.fonts = [...L3TX_FONTS.filter(probe).map(f => [f, f]), ...(l3tx.custom || []).map(f => [f, f + " (egen fil)"]), ...L3TX_GENERIC];
  return l3tx.fonts;
}
/* ---- Konturer ---- */
function l3txRaster(d) {
  const PX = 200, lines = String(d.text || "").split("\n").slice(0, 8), font = `${d.italic ? "italic " : ""}${d.bold ? "700" : "400"} ${PX}px "${d.font}", sans-serif`, cv = document.createElement("canvas"), cx = cv.getContext("2d");
  cx.font = font; const wid = lines.map(l => cx.measureText(l).width), maxW = Math.max(1, ...wid), pad = 24, lh = PX * (Number(d.space) || 1.15), W = Math.ceil(maxW + pad * 2), H = Math.ceil(lh * lines.length + pad * 2 + PX * 0.3);
  cv.width = Math.min(4096, W); cv.height = Math.min(4096, H); cx.font = font; cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.fillStyle = "#000"; cx.textBaseline = "alphabetic";
  const asc = cx.measureText("H").actualBoundingBoxAscent || PX * 0.72;
  lines.forEach((l, i) => { const x = d.align === "center" ? pad + (maxW - wid[i]) / 2 : d.align === "right" ? pad + maxW - wid[i] : pad; cx.fillText(l, x, pad + PX * 0.15 + asc + i * lh); });
  const im = cx.getImageData(0, 0, cv.width, cv.height).data, w = cv.width, h = cv.height, bin = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) bin[i] = im[i * 4] < 140 ? 1 : 0;
  return { bin, w, h, cap: asc, PX };
}
function l3txTrace(bin, w, h) {   // marching squares → slutna konturer i pixelkoordinater (pixelcentrum)
  const v = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : bin[y * w + x]), segs = new Map(), key = (x, y) => (x * 2) + "|" + (y * 2), add = (a, b) => { const ka = key(...a), kb = key(...b); (segs.get(ka) || segs.set(ka, { p: a, n: [] }).get(ka)).n.push(kb); (segs.get(kb) || segs.set(kb, { p: b, n: [] }).get(kb)).n.push(ka); };
  for (let j = -1; j < h; j++) for (let i = -1; i < w; i++) {
    const c = v(i, j) * 8 + v(i + 1, j) * 4 + v(i + 1, j + 1) * 2 + v(i, j + 1); if (c === 0 || c === 15) continue;
    const T = [i + 0.5, j], R = [i + 1, j + 0.5], B = [i + 0.5, j + 1], L = [i, j + 0.5];
    ({ 1: [[L, B]], 2: [[B, R]], 3: [[L, R]], 4: [[T, R]], 5: [[T, R], [L, B]], 6: [[T, B]], 7: [[T, L]], 8: [[T, L]], 9: [[T, B]], 10: [[T, L], [B, R]], 11: [[T, R]], 12: [[L, R]], 13: [[B, R]], 14: [[L, B]] })[c].forEach(([a, b]) => add(a, b));
  }
  const used = new Set(), loops = [];
  segs.forEach((node, k0) => {
    if (used.has(k0)) return; const loop = []; let prev = null, k = k0;
    for (let g = 0; g < 400000; g++) { used.add(k); const nd = segs.get(k); loop.push(nd.p); const nx = nd.n.find(q => q !== prev && !(q === k0 && loop.length < 3)) ?? nd.n.find(q => q !== prev); if (nx === undefined || nx === k0) break; prev = k; k = nx; if (used.has(k)) break; }
    if (loop.length >= 3) loops.push(loop);
  });
  return loops;
}
function l3txRdp(P, eps) {   // Douglas–Peucker på en sluten kontur
  const n = P.length; if (n < 8) return P; let far = 0, fd = -1; for (let i = 1; i < n; i++) { const d = Math.hypot(P[i][0] - P[0][0], P[i][1] - P[0][1]); if (d > fd) { fd = d; far = i; } }
  const seg = (a, b) => { const out = []; const rec = (i, j) => { let md = 0, mi = -1; const A = P[i % n], B = P[j % n], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1; for (let k = i + 1; k < j; k++) { const Q = P[k % n], d = Math.abs((Q[0] - A[0]) * dy - (Q[1] - A[1]) * dx) / L; if (d > md) { md = d; mi = k; } } if (md > eps && mi > 0) { rec(i, mi); out.push(P[mi % n]); rec(mi, j); } }; out.push(P[a % n]); rec(a, b); return out; };
  return [...seg(0, far), ...seg(far, n)];
}
const l3txArea = L => { let a = 0; for (let i = 0; i < L.length; i++) { const p = L[i], q = L[(i + 1) % L.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const l3txPip = (pt, L) => { let c = false; for (let i = 0, j = L.length - 1; i < L.length; j = i++) if ((L[i][1] > pt[1]) !== (L[j][1] > pt[1]) && pt[0] < (L[j][0] - L[i][0]) * (pt[1] - L[i][1]) / (L[j][1] - L[i][1]) + L[i][0]) c = !c; return c; };
/* Text → trianglar (lokala meter: x längs raden, y uppåt, z tjocklek). */
function l3txBuild(d) {
  const R = l3txRaster(d), loops = l3txTrace(R.bin, R.w, R.h).map(L => l3txRdp(L, 0.8)).filter(L => L.length >= 3 && Math.abs(l3txArea(L)) > 6);
  if (!loops.length) return { tris: [], w: 0, hgt: 0 };
  const sc = (Number(d.h) || 0.5) / R.cap, t = Math.max(0.005, Number(d.t) || 0.1), info = loops.map((L, i) => ({ L, i, a: Math.abs(l3txArea(L)) }));
  info.forEach(o => { o.depth = info.filter(q => q !== o && q.a > o.a && l3txPip(o.L[0], q.L)).length; });
  const outers = info.filter(o => o.depth % 2 === 0); outers.forEach(o => { o.holes = info.filter(q => q.depth === o.depth + 1 && l3txPip(q.L[0], o.L)); });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; loops.forEach(L => L.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }));
  const M = p => [(p[0] - x0) * sc, (y1 - p[1]) * sc], tris = [], tri = (a, b, c) => tris.push([a, b, c]);
  const orient = (L, ccw) => { const P = L.map(M); return (l3txArea(P) > 0) === ccw ? P : P.slice().reverse(); };
  const W = (x1 - x0) * sc, Ht = (y1 - y0) * sc;
  outers.forEach(o => {
    const C = orient(o.L, true), Hs = (o.holes || []).map(q => orient(q.L, false)), all = [...C, ...Hs.flat()], idx = THREE.ShapeUtils.triangulateShape(C.map(p => new THREE.Vector2(p[0], p[1])), Hs.map(h => h.map(p => new THREE.Vector2(p[0], p[1]))));
    idx.forEach(([a, b, c]) => { const A = all[a], B = all[b], Cc = all[c], ar = (B[0] - A[0]) * (Cc[1] - A[1]) - (B[1] - A[1]) * (Cc[0] - A[0]), s = ar >= 0; const v = (p, z) => [p[0], p[1], z]; if (s) { tri(v(A, t), v(B, t), v(Cc, t)); tri(v(A, 0), v(Cc, 0), v(B, 0)); } else { tri(v(A, t), v(Cc, t), v(B, t)); tri(v(A, 0), v(B, 0), v(Cc, 0)); } });
    [C, ...Hs].forEach(Lp => Lp.forEach((p, i) => { const q = Lp[(i + 1) % Lp.length]; tri([p[0], p[1], 0], [q[0], q[1], 0], [q[0], q[1], t]); tri([p[0], p[1], 0], [q[0], q[1], t], [p[0], p[1], t]); }));
  });
  if (d.plate) {   // bakplatta: rektangel med marginal bakom texten (halva tjockleken)
    const m = Math.max(0, Number(d.margin) || 0), pt = Math.max(0.005, t * 0.5), a = [-m, -m], b = [W + m, -m], c = [W + m, Ht + m], e = [-m, Ht + m], q = (p, z) => [p[0], p[1], z];
    tri(q(a, 0), q(c, 0), q(b, 0)); tri(q(a, 0), q(e, 0), q(c, 0)); tri(q(a, -pt), q(b, -pt), q(c, -pt)); tri(q(a, -pt), q(c, -pt), q(e, -pt));
    [[a, b], [b, c], [c, e], [e, a]].forEach(([p, r]) => { tri(q(p, -pt), q(r, -pt), q(r, 0)); tri(q(p, -pt), q(r, 0), q(p, 0)); });
  }
  return { tris, w: W, hgt: Ht };
}
/* Lokala → världskoordinater (SWEREF, meter). */
function l3txWorld(d, tris) {
  const th = (Number(d.rot) || 0) * Math.PI / 180, c = Math.cos(th), s = Math.sin(th), stand = d.mode === "standing";
  const f = p => stand ? [d.x + p[0] * c + p[2] * s, d.y + p[0] * s - p[2] * c, d.z + p[1]] : [d.x + p[0] * c - p[1] * s, d.y + p[0] * s + p[1] * c, d.z + p[2]];
  return tris.map(t => t.map(f));
}
/* ---- Förhandsvisning och skapande ---- */
function l3txDraw() {
  if (!l3 || !l3.scene) return; if (!l3tx.group) { l3tx.group = new THREE.Group(); l3tx.group.name = "text3d"; l3tx.group.userData.noHit = true; l3.scene.add(l3tx.group); }
  l3Clear(l3tx.group); const d = l3tx.d; if (!d) { l3Render(); return; }
  const B = l3txBuild(d); l3tx.last = B; if (!B.tris.length) { l3Render(); return; }
  const W = l3txWorld(d, B.tris), O = l3.O, P = new Float32Array(W.length * 9); W.forEach((t, i) => t.forEach((p, k) => { P[i * 9 + k * 3] = p[0] - O[0]; P[i * 9 + k * 3 + 1] = p[1] - O[1]; P[i * 9 + k * 3 + 2] = p[2] - O[2]; }));
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(P, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: d.color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })); m.userData.noHit = true; m.raycast = () => {}; m.frustumCulled = false; l3tx.group.add(m); l3Render();
  const info = document.getElementById("v3TxInfo"); if (info) info.textContent = `${B.w.toFixed(2).replace(".", ",")} × ${B.hgt.toFixed(2).replace(".", ",")} m · ${B.tris.length.toLocaleString("sv-SE")} trianglar`;
}
function l3txSchedule() { clearTimeout(l3tx.timer); l3tx.timer = setTimeout(l3txDraw, 150); }
function l3txOpen() {
  const sel = typeof l3SelList === "function" ? l3SelList()[0] : null;
  if (sel && sel.txt3d) { l3tx.d = { ...l3txDef(), ...sel.txt3d }; l3tx.editId = sel.id; }
  else { const prev = l3Prefs().txLast; l3tx.d = { ...l3txDef(), ...(prev || {}) }; l3tx.editId = null; const c = l3.orbit && l3.orbit.target; if (c) { l3tx.d.x = Math.round((c.x + l3.O[0]) * 10) / 10; l3tx.d.y = Math.round((c.y + l3.O[1]) * 10) / 10; l3tx.d.z = Math.round((c.z + l3.O[2]) * 100) / 100; } }
  l3txRender(); l3txDraw();
}
function l3txRender() {
  const d = l3tx.d, E = escHtml, fonts = l3txFontList(); if (!fonts.some(f => f[0] === d.font)) fonts.unshift([d.font, d.font]);
  const sel = (k, opts) => `<select data-txf="${k}">${opts.map(([v, t]) => `<option value="${E(v)}" ${String(d[k]) === String(v) ? "selected" : ""}>${E(t)}</option>`).join("")}</select>`, num = (k, lab, step, min, ex = "") => `<label class="v3-field"><span>${lab}</span><input type="number" data-txf="${k}" step="${step}" min="${min}" value="${d[k]}" ${ex} /></label>`;
  const dlg = l3Dlg("v3TextDlg", l3tx.editId ? "3D-text – redigera" : "3D-text", `<label class="v3-field"><span>Text</span><textarea data-txf="text" rows="2" spellcheck="false">${E(d.text)}</textarea></label>
    <div class="v3-gd-g2"><label class="v3-field"><span>Typsnitt</span>${sel("font", fonts)}</label><div class="v3-gd-btns" style="align-self:end"><button type="button" data-txfile title="Läs in en typsnittsfil (.ttf, .otf, .woff) och använd den">＋ Egen fil…</button></div></div>
    <div class="v3-tx-st"><label class="v3-chk"><input type="checkbox" data-txf="bold" ${d.bold ? "checked" : ""} /> <b>Fet</b></label><label class="v3-chk"><input type="checkbox" data-txf="italic" ${d.italic ? "checked" : ""} /> <i>Kursiv</i></label>${sel("align", [["left", "Vänster"], ["center", "Centrerad"], ["right", "Höger"]])}</div>
    <div class="v3-gd-g2">${num("h", "Teckenhöjd (m)", 0.05, 0.02)}${num("t", "Tjocklek (m)", 0.01, 0.005)}</div>
    <label class="v3-gd-sl"><span>Tjocklek</span><input type="range" min="0.005" max="1" step="0.005" data-txf="t" value="${d.t}" /><output>${Math.round(d.t * 1000)} mm</output></label>
    <div class="v3-gd-g2">${num("space", "Radavstånd (×)", 0.05, 0.8)}<label class="v3-field"><span>Färg</span><input type="color" data-txf="color" value="${E(d.color)}" /></label></div>
    <div class="v3-gd-sec">Placering</div>
    <div class="v3-gd-g2"><label class="v3-field"><span>Läge</span>${sel("mode", [["lying", "Liggande på marken"], ["standing", "Stående (som skylt)"]])}</label>${num("rot", "Vridning °", 1, -360)}</div>
    <div class="v3-gd-btns"><button type="button" data-txpick title="Tryck textens början och sedan en punkt längs raden">⌖ Två tryck</button><button type="button" data-txcam title="Vänd stående text mot kameran">⟲ Mot kameran</button></div>
    <label class="v3-chk"><input type="checkbox" data-txf="plate" ${d.plate ? "checked" : ""} /> Bakplatta (Contour plate)</label>${d.plate ? num("margin", "Marginal runt texten (m)", 0.05, 0) : ""}
    <div class="v3-pi-sum" id="v3TxInfo">&nbsp;</div>
    <div class="v3-gd-btns end"><button type="button" data-txcancel>Avbryt</button><button type="button" class="v3-primary" data-txgo>${l3tx.editId ? "Uppdatera texten" : "Skapa text"}</button></div>`);
  l3txBind(dlg);
}
function l3txBind(dlg) {
  const d = l3tx.d, q = s => dlg.querySelector(s);
  dlg.querySelectorAll("[data-txf]").forEach(i => { const ev = i.tagName === "SELECT" || i.type === "checkbox" || i.type === "color" ? "onchange" : "oninput"; i[ev] = () => {
    const k = i.dataset.txf, v = i.type === "checkbox" ? i.checked : i.type === "number" || i.type === "range" ? Number(i.value) : i.value; d[k] = v;
    if (k === "t") { dlg.querySelectorAll('[data-txf="t"]').forEach(o => { if (o !== i) o.value = v; }); const o = dlg.querySelector(".v3-gd-sl output"); if (o) o.textContent = Math.round(v * 1000) + " mm"; }
    if (k === "plate" || k === "mode") { l3txRender(); } l3txSchedule(); }; if (i.type === "color") i.oninput = () => { d.color = i.value; l3txSchedule(); }; });
  q("[data-txfile]").onclick = () => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".ttf,.otf,.woff,.woff2"; inp.onchange = async () => { const f = inp.files[0]; if (!f) return; try { const name = f.name.replace(/\.[^.]+$/, "").replace(/[^\w -]/g, ""), ff = new FontFace(name, await f.arrayBuffer()); await ff.load(); document.fonts.add(ff); (l3tx.custom = l3tx.custom || []).push(name); l3tx.fonts = null; d.font = name; l3txRender(); l3txDraw(); l3Status(`Typsnittet "${name}" är inläst.`); } catch (e) { l3Status("Kunde inte läsa typsnittet: " + e.message, true); } }; inp.click(); };
  q("[data-txpick]").onclick = () => l3DlgPick(2, ["Tryck textens startpunkt.", "Tryck en punkt längs textraden."], ([a, b]) => { d.x = Math.round(a.x * 100) / 100; d.y = Math.round(a.y * 100) / 100; d.z = Math.round(a.z * 100) / 100; d.rot = Math.round(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI * 10) / 10; l3txRender(); l3txDraw(); l3Status("Texten är placerad – justera och tryck Skapa text."); });
  q("[data-txcam]").onclick = () => { const c = l3.orbit.target, p = l3.camera.position; d.mode = "standing"; d.rot = Math.round(Math.atan2(p.x - c.x, -(p.y - c.y)) * 180 / Math.PI * 10) / 10; l3txRender(); l3txDraw(); };
  q("[data-txcancel]").onclick = () => l3txClose();
  q("[data-txgo]").onclick = () => l3txCommit();
}
function l3txClose() { l3tx.d = null; l3tx.editId = null; if (l3tx.group) l3Clear(l3tx.group); l3DlgClose("v3TextDlg"); l3Render(); }
function l3txCommit() {
  const d = l3tx.d, B = l3tx.last || l3txBuild(d); if (!B.tris.length) { l3Status("Skriv en text först.", true); return null; }
  const W = l3txWorld(d, B.tris); let x0 = Infinity, y0 = Infinity, z0 = Infinity; W.forEach(t => t.forEach(p => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); z0 = Math.min(z0, p[2]); }));
  const r3 = v => Math.round(v * 1000) / 1000, idx = new Map(), pts = [], faces = [], id = p => { const k = r3(p[0]) + "," + r3(p[1]) + "," + r3(p[2]); let i = idx.get(k); if (!i) { pts.push([r3(p[0] - x0), r3(p[1] - y0), r3(p[2] - z0)]); i = pts.length; idx.set(k, i); } return i; };
  W.forEach(t => { const a = id(t[0]), b = id(t[1]), c = id(t[2]); if (a !== b && b !== c && a !== c) faces.push([a, b, c]); });
  const m = { k: "mesh", pts, faces, closed: typeof l3bqClosed === "function" ? l3bqClosed(faces.map(f => [f[0], f[1], f[2]])) : true }, label = String(d.text).split("\n")[0].slice(0, 24) || "Text";
  l3SetPref("txLast", { ...d, x: 0, y: 0, z: 0 });
  let p;
  if (l3tx.editId && (p = placements.find(q => q.id === l3tx.editId))) { const ax = [p.x, p.y, p.z]; modEdit(p, mm => { mm.k = "mesh"; mm.pts = pts.map(q => [q[0] + x0 - ax[0], q[1] + y0 - ax[1], q[2] + z0 - ax[2]]); mm.faces = faces; mm.closed = m.closed; delete mm.loops; delete mm.pl; delete mm.d; }); p.txt3d = { ...d }; p.color = d.color; placeTouch(p); l3Changed(); l3Toast("3D-texten är uppdaterad."); }
  else { placeSnapshot(); p = modCreate(m, [x0, y0, z0], { name: `Text ${label}`, color: d.color, snapshot: false }); p.txt3d = { ...d }; placeTouch(p); l3SelectIds([p.id]); l3Changed(); l3Toast(`3D-text "${label}" skapad (${B.w.toFixed(2).replace(".", ",")} × ${B.hgt.toFixed(2).replace(".", ",")} m). Ctrl+Z ångrar.`); }
  l3txClose(); return p;
}
(() => {
  const t = setInterval(() => { const fit = document.getElementById("v3Fit"); if (!fit || document.getElementById("v3TextBtn")) { if (document.getElementById("v3TextBtn")) clearInterval(t); return; }
    const b = document.createElement("button"); b.type = "button"; b.id = "v3TextBtn"; b.className = "v3-ghost"; b.title = "3D-text – bokstäver som slutna kroppar med valfritt typsnitt, storlek och tjocklek (som Contour plate i Tekla)"; b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg><span>3D-text</span>'; fit.parentNode.insertBefore(b, fit);
    b.onclick = () => { const d = document.getElementById("v3TextDlg"); if (d && !d.classList.contains("hidden")) l3txClose(); else l3txOpen(); }; clearInterval(t); }, 500);
  setTimeout(() => clearInterval(t), 180000);
})();
