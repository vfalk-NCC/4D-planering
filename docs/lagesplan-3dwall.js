/* 3D-vyn – Stödmurar (Victor 2026-11-11: "gör ett verktyg för att modellera stödmurar, både med egen design och också kan du hämta standardmurar från St. Eriks eller liknande som jag kan placera ut").
   Mät → Stödmur: tryck ut murens FOTLINJE (framkanten längst ner) i 3D – punkterna fäster mot punktmoln, modell och mark – avsluta med Enter. En panel öppnas med förhandsvisning:
   – Murtyp: L-stöd (färdiga betongelement), Gjuten stödmur (konsolmur med fot och avsmalnande liv), Gravitationsmur (trapets) eller Enkel mur. Egna mått för allt.
   – Standardmurar: katalog med L-stöd i olika höjder (TYPISKA mått – jämför alltid med tillverkarens produktblad, t.ex. St. Eriks, Benders, Ensta, Abetong). Egna murtyper sparas i webbläsaren
     (Spara som murtyp) och kan hämtas in från en CSV/JSON-fil med tillverkarens mått.
   – Jordsida (vänster/höger om fotlinjen), ingrävd fot, element längd, trappa/följ lutningen, hela muren eller element för element.
   Skapa ger vanliga ritade objekt (IFC-klass IFCWALL, redigerbara, delbara, exporteras som IFC): ett objekt per element för L-stöd, ett sammanhängande objekt för gjuten mur. Volym och vikt visas. */

const L3SW_KINDS = { L: "L-stöd (prefabelement)", cast: "Gjuten stödmur (konsol)", grav: "Gravitationsmur (trapets)", plain: "Enkel mur" };
const l3sw = { cur: null, grp: null, kbd: null, last: null };
const L3SW_DEF = { kind: "L", typ: "L:1.6", H: 1.6, tl: 0.25, t: 0.12, bt: 0.12, hl: 0.9, len: 2.0, t1: 0.25, t2: 0.4, bw: 1.2, tw: 0.4, fb: 0.2, soil: "L", embed: 0.3, step: true, stepMin: 0.2, joint: 0.01, color: "#b8bcc2" };
const L3SW_DENS = 2400;
const l3swFmt = (v, d = 2) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace(".", ",");

/* ---- Katalog ---- */
/* Typiska L-stöd (2,0 m långa): fotbredd ≈ 0,4 m vid 0,6 m höjd och ≈ 0,9 m vid 1,4 m (efter tillverkares produktblad, t.ex. Ensta/Benders) – UPPSKATTADE mellanvärden. Byt till de exakta måtten i produktbladet. */
function l3swBuiltin() {
  const out = [];
  [0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0].forEach(H => {
    const bw = Math.round((0.4 + 0.625 * Math.max(0, H - 0.6)) * 20) / 20, t = H <= 1.2 ? 0.10 : H <= 1.6 ? 0.12 : 0.14, bt = H <= 1.0 ? 0.10 : 0.12, tl = Math.round(Math.min(0.3, bw * 0.28) * 100) / 100;
    out.push({ id: "L:" + H, name: `L-stöd h ${l3swFmt(H, 1)} m`, maker: "Typiskt L-stöd", kind: "L", H, t, bt, tl, hl: Math.round((bw - tl - t) * 100) / 100, len: 2.0, std: true });
  });
  return out;
}
const l3swCustom = () => { const a = l3Prefs().wallTypes; return Array.isArray(a) ? a.filter(x => x && x.id && x.H > 0) : []; };
const l3swAll = () => [...l3swBuiltin(), ...l3swCustom()];
function l3swType(id) { return l3swAll().find(x => x.id === id); }
function l3swApplyType(spec, ty) { if (!ty) return; spec.typ = ty.id; spec.kind = ty.kind || "L"; ["H", "t", "bt", "tl", "hl", "len", "t1", "t2", "bw", "tw", "fb"].forEach(k => { if (ty[k] != null && Number.isFinite(Number(ty[k]))) spec[k] = Number(ty[k]); }); }

/* ---- Profilen (u = vågrätt från murens framkant mot jordsidan, v = höjd över fotens underkant) ---- */
function l3swProfile(s) {
  const H = Math.max(0.1, +s.H || 1), bt = Math.min(H * 0.6, Math.max(0.05, +s.bt || 0.12));
  if (s.kind === "L" || s.kind === "cast") {
    const tl = Math.max(0, +s.tl || 0), hl = Math.max(0, +s.hl || 0), t2 = Math.max(0.05, s.kind === "L" ? +s.t || 0.12 : +s.t2 || 0.3), t1 = Math.max(0.05, s.kind === "L" ? t2 : +s.t1 || 0.25);
    return [[-tl, 0], [t2 + hl, 0], [t2 + hl, bt], [t2, bt], [t1, H], [0, H], [0, bt], [-tl, bt]].filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-6);
  }
  if (s.kind === "grav") { const bw = Math.max(0.2, +s.bw || 1), tw = Math.min(bw, Math.max(0.1, +s.tw || 0.4)), fb = Math.max(0, Math.min(bw - tw, +s.fb || 0)); return [[0, 0], [bw, 0], [fb + tw, H], [fb, H]]; }
  const t = Math.max(0.05, +s.t || 0.25); return [[0, 0], [t, 0], [t, H], [0, H]];
}
const l3swArea = P => { let a = 0; for (let i = 0; i < P.length; i++) { const q = P[(i + 1) % P.length]; a += P[i][0] * q[1] - q[0] * P[i][1]; } return a / 2; };

/* ---- Svepning: profil längs stationer [{x,y,z}] (z = fotens underkant) ---- */
function l3swSweep(P, st, soilSign, miter) {
  const n = st.length, rings = [], tan = st.map((p, i) => { const a = st[Math.max(0, i - 1)], b = st[Math.min(n - 1, i + 1)]; const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; });
  const segT = (i) => { const a = st[i], b = st[i + 1], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  for (let i = 0; i < n; i++) {
    let t = tan[i], k = 1;
    if (!miter || i === 0 || i === n - 1) { t = i === n - 1 ? segT(n - 2) : segT(i); }
    else { const a = segT(i - 1), b = segT(i), c = a[0] * b[0] + a[1] * b[1]; t = [a[0] + b[0], a[1] + b[1]]; const l = Math.hypot(t[0], t[1]) || 1; t = [t[0] / l, t[1] / l]; k = Math.min(3, 1 / Math.max(0.33, Math.sqrt((1 + c) / 2))); }
    const nx = -t[1] * soilSign, ny = t[0] * soilSign;
    rings.push(P.map(([u, v]) => [st[i].x + nx * u * k, st[i].y + ny * u * k, st[i].z + v]));
  }
  const pts = [], faces = [], idx = new Map(), key = q => Math.round(q[0] * 1e4) + "," + Math.round(q[1] * 1e4) + "," + Math.round(q[2] * 1e4);
  const id = q => { const k = key(q); let i = idx.get(k); if (!i) { pts.push(q); i = pts.length; idx.set(k, i); } return i; };
  const m = P.length;
  for (let i = 0; i + 1 < n; i++) for (let j = 0; j < m; j++) { const j2 = (j + 1) % m, a = id(rings[i][j]), b = id(rings[i][j2]), c = id(rings[i + 1][j2]), d = id(rings[i + 1][j]); if (a !== b && b !== c) { faces.push([a, b, c]); } if (a !== c && c !== d) faces.push([a, c, d]); }
  const tri = THREE.ShapeUtils.triangulateShape(P.map(q => new THREE.Vector2(q[0], q[1])), []);
  tri.forEach(f => { faces.push([id(rings[0][f[0]]), id(rings[0][f[2]]), id(rings[0][f[1]])]); faces.push([id(rings[n - 1][f[0]]), id(rings[n - 1][f[1]]), id(rings[n - 1][f[2]])]); });
  // rätt riktning på ytorna (utåt): positiv volym
  let vol = 0; faces.forEach(f => { const a = pts[f[0] - 1], b = pts[f[1] - 1], c = pts[f[2] - 1]; vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6; });
  if (vol < 0) faces.forEach(f => { const t = f[1]; f[1] = f[2]; f[2] = t; });
  return { pts, faces, vol: Math.abs(vol) };
}

/* ---- Bygger murens delar ur fotlinjen och inställningarna: [{ name, mesh:{pts,faces}, vol, len }] ---- */
function l3swBuild(pts, s) {
  if (!pts || pts.length < 2) return { parts: [], err: "Fotlinjen behöver minst två punkter." };
  const P = l3swProfile(s), soilSign = s.soil === "R" ? -1 : 1, emb = Math.max(0, +s.embed || 0), A = Math.abs(l3swArea(P)), parts = [];
  const seg = [], cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1]; if (L < 0.2) return { parts: [], err: "Fotlinjen är för kort." };
  const zAt = d => { let k = 1; while (k < cum.length - 1 && cum[k] < d) k++; const t = cum[k] > cum[k - 1] ? (d - cum[k - 1]) / (cum[k] - cum[k - 1]) : 0; return pts[k - 1][2] + (pts[k][2] - pts[k - 1][2]) * Math.max(0, Math.min(1, t)); };
  const kindName = { L: "L-stöd", cast: "Stödmur", grav: "Gravitationsmur", plain: "Mur" }[s.kind] || "Stödmur";
  const Hn = `${l3swFmt(+s.H, 2)} m`;
  if (s.kind === "L") {
    const le = Math.max(0.3, +s.len || 2), j = Math.max(0, +s.joint || 0); let count = 0; const plan = [];
    for (let i = 0; i + 1 < pts.length; i++) { const Ls = cum[i + 1] - cum[i]; if (Ls < 0.05) continue; const n = Math.max(1, Math.ceil(Ls / le - 1e-6)), ln = Ls / n; for (let e = 0; e < n; e++) plan.push({ i, a: e * ln, b: (e + 1) * ln - (e < n - 1 ? j : 0) }); }
    let zPrev = null;   // trappning: ett nytt steg tas först när marken skiljer minst "stepMin" meter från förra elementets nivå
    plan.forEach((el, k) => {
      const A0 = pts[el.i], B0 = pts[el.i + 1], Ls = cum[el.i + 1] - cum[el.i], p = d => ({ x: A0[0] + (B0[0] - A0[0]) * d / Ls, y: A0[1] + (B0[1] - A0[1]) * d / Ls });
      const za = zAt(cum[el.i] + el.a) - emb, zb = zAt(cum[el.i] + el.b) - emb, need = Math.round(Math.min(za, zb) * 100) / 100, a = p(el.a), b = p(el.b); let zl = null;
      if (s.step) { if (zPrev === null || Math.abs(need - zPrev) >= Math.max(0, +s.stepMin || 0) - 1e-9) zPrev = need; zl = zPrev; }
      const sw = l3swSweep(P, [{ ...a, z: zl != null ? zl : za }, { ...b, z: zl != null ? zl : zb }], soilSign, false);
      parts.push({ name: `${kindName} ${Hn} – element ${k + 1}/${plan.length}`, mesh: { pts: sw.pts, faces: sw.faces }, vol: sw.vol, len: el.b - el.a });
    });
  } else {
    const st = pts.map(q => ({ x: q[0], y: q[1], z: q[2] - emb })), sw = l3swSweep(P, st, soilSign, true);
    parts.push({ name: `${kindName} ${Hn} ${l3swFmt(L, 1)} m`, mesh: { pts: sw.pts, faces: sw.faces }, vol: sw.vol, len: L });
  }
  void seg; void A;
  return { parts, L, area: A };
}

/* ---- Förhandsvisning ---- */
function l3swDraw() {
  const c = l3sw.cur; if (!c) return; if (!l3.groups.wall) { l3.groups.wall = new THREE.Group(); l3.groups.wall.name = "wall"; l3.scene.add(l3.groups.wall); } const g = l3.groups.wall; l3Clear(g);
  const r = c.res = l3swBuild(c.pts, c.spec); const O = l3.O;
  (r.parts || []).forEach(pt => {
    const geo = new THREE.BufferGeometry(), pos = [], idx = []; pt.mesh.pts.forEach(q => pos.push(q[0] - O[0], q[1] - O[1], q[2] - O[2])); pt.mesh.faces.forEach(f => idx.push(f[0] - 1, f[1] - 1, f[2] - 1));
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: c.spec.color || "#b8bcc2", side: THREE.DoubleSide, transparent: true, opacity: 0.92 })); m.renderOrder = 8; m.userData.noHit = true; m.raycast = () => {}; g.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: 0x334155 })); e.userData.noHit = true; e.raycast = () => {}; g.add(e);
  });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.pts.map(p => new THREE.Vector3(p[0] - O[0], p[1] - O[1], p[2] - O[2] + 0.05))), new THREE.LineBasicMaterial({ color: 0xf59e0b, depthTest: false })); line.renderOrder = 12; line.userData.noHit = true; line.raycast = () => {}; g.add(line);
  l3swHandles(); l3Render();
}
/* ---- Dragbara punkter (som byggvägen): ring på varje punkt, ＋ mitt på varje sträcka ---- */
const l3swH = { rings: [], plus: [], drag: null };
function l3swHandles() {
  const c = l3sw.cur, host = l3.renderer.domElement.parentElement; if (!c) return; const n = c.pts.length;
  while (l3swH.rings.length > n) l3swH.rings.pop().remove(); while (l3swH.plus.length > n - 1) l3swH.plus.pop().remove();
  while (l3swH.rings.length < n) { const i = l3swH.rings.length, b = document.createElement("button"); b.type = "button"; b.className = "v3-mhandle"; b.title = "Dra för att flytta punkten (fäster mot punktmoln, modell och mark) · dubbelklick tar bort"; b.onpointerdown = e => l3swDown(e, i); b.ondblclick = e => { e.stopPropagation(); l3swRemove(i); }; b.onclick = e => e.stopPropagation(); host.appendChild(b); l3swH.rings.push(b); }
  while (l3swH.plus.length < n - 1) { const i = l3swH.plus.length, b = document.createElement("button"); b.type = "button"; b.className = "v3-mplus"; b.textContent = "+"; b.title = "Lägg till en punkt här – dra den dit den ska"; b.onpointerdown = e => { e.stopPropagation(); e.preventDefault(); const a = c.pts[i], d = c.pts[i + 1]; c.pts.splice(i + 1, 0, [(a[0] + d[0]) / 2, (a[1] + d[1]) / 2, (a[2] + d[2]) / 2].map(v => Math.round(v * 1000) / 1000)); l3swDraw(); l3swPanel(); l3swDown(e, i + 1, true); }; b.onclick = e => e.stopPropagation(); host.appendChild(b); l3swH.plus.push(b); }
  l3swPlace();
}
function l3swPlace() {
  const c = l3sw.cur; if (!c) return; const O = l3.O, pos = p => l3ToScreen(new THREE.Vector3(p[0] - O[0], p[1] - O[1], p[2] - O[2]));
  l3swH.rings.forEach((el, i) => { const q = pos(c.pts[i]); el.style.display = q.behind ? "none" : "block"; el.style.left = q.x + "px"; el.style.top = q.y + "px"; el.classList.toggle("drag", !!(l3swH.drag && l3swH.drag.i === i)); });
  l3swH.plus.forEach((el, i) => { const a = c.pts[i], d = c.pts[i + 1]; if (!a || !d) return; const q = pos([(a[0] + d[0]) / 2, (a[1] + d[1]) / 2, (a[2] + d[2]) / 2]), qa = pos(a), qd = pos(d); el.style.display = (q.behind || l3swH.drag || Math.hypot(qa.x - qd.x, qa.y - qd.y) < 40) ? "none" : "block"; el.style.left = q.x + "px"; el.style.top = q.y + "px"; });
}
function l3swRemove(i) { const c = l3sw.cur; if (!c || c.pts.length <= 2) { l3Status("Muren behöver minst två punkter.", true); return; } c.pts.splice(i, 1); l3swDraw(); l3swPanel(); }
function l3swDown(e, i, fresh) {
  const c = l3sw.cur; if (!c || e.button !== 0) return; e.preventDefault(); e.stopPropagation(); l3swH.drag = { i }; let moved = false; const was = c.pts.map(p => p.slice());
  const mv = ev => { const sn = typeof l3Snap === "function" ? l3Snap(ev) : null; if (typeof l3ShowMarker === "function") l3ShowMarker(sn); if (!sn) return; moved = true; c.pts[i] = [sn.point.x + l3.O[0], sn.point.y + l3.O[1], sn.point.z + l3.O[2]].map(v => Math.round(v * 1000) / 1000); l3swDraw(); l3StatusLive(`Flyttar punkt ${i + 1} – släpp där muren ska ligga`); };
  const up = () => { window.removeEventListener("pointermove", mv, true); window.removeEventListener("pointerup", up, true); window.removeEventListener("pointercancel", up, true); l3swH.drag = null; if (typeof l3ShowMarker === "function") l3ShowMarker(null); if (!moved && !fresh) c.pts = was; l3swDraw(); l3swPanel(); };
  window.addEventListener("pointermove", mv, true); window.addEventListener("pointerup", up, true); window.addEventListener("pointercancel", up, true);
}
/* ---- Panel ---- */
function l3swPanel() {
  const c = l3sw.cur; if (!c) return; const host = document.getElementById("v3Canvas"); if (!host) return;
  let el = document.getElementById("v3WallPanel");
  if (!el) { el = document.createElement("div"); el.id = "v3WallPanel"; el.className = "v3-vp"; el.style.cssText = "max-width:340px;"; host.appendChild(el); ["pointerdown", "wheel", "contextmenu", "dblclick", "click", "keydown", "keyup"].forEach(t => el.addEventListener(t, e => e.stopPropagation())); }
  const s = c.spec, r = c.res || { parts: [] }, E = escHtml, vol = (r.parts || []).reduce((a, p) => a + p.vol, 0), n = (r.parts || []).length;
  const num = (k, label, tip, unit, st = 0.05, min = 0, max = 20) => `<label class="v3-rd-n" title="${E(tip)}"><span>${label}</span><input type="number" data-wk="${k}" value="${s[k]}" min="${min}" max="${max}" step="${st}"><em>${unit}</em></label>`;
  const cat = l3swAll(), custom = l3swCustom();
  const typSel = s.kind === "L" ? `<label class="v3-rd-n" style="grid-column:1/3" title="Standardmurar – typiska mått, jämför med tillverkarens produktblad"><span>Standard</span><select data-wktyp style="flex:1"><option value="">Egna mått</option>${["Typiskt L-stöd", ...new Set(custom.map(x => x.maker || "Mina murtyper"))].map(mk => `<optgroup label="${E(mk)}">${cat.filter(x => (x.std ? "Typiskt L-stöd" : x.maker || "Mina murtyper") === mk).map(x => `<option value="${E(x.id)}" ${s.typ === x.id ? "selected" : ""}>${E(x.name)}</option>`).join("")}</optgroup>`).join("")}</select></label>` : "";
  el.innerHTML = `<div class="v3-vp-h"><b>Stödmur</b><span>${l3swFmt(r.L || 0, 1)} m fotlinje · ${c.pts.length} punkter</span><button type="button" data-wb="x" title="Stäng (Esc)">✕</button></div>
    <div class="v3-vq-note" style="background:#f1f5f9;color:#334155">${n} ${s.kind === "L" ? (n === 1 ? "element" : "element") : "del"} · volym ${l3swFmt(vol, 2)} m³ · ca ${l3swFmt(vol * L3SW_DENS / 1000, 1)} ton betong</div>
    <div class="v3-rd-g" style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px;margin-top:6px">
      <label class="v3-rd-n" style="grid-column:1/3"><span>Murtyp</span><select data-wkkind style="flex:1">${Object.entries(L3SW_KINDS).map(([k, v]) => `<option value="${k}" ${s.kind === k ? "selected" : ""}>${E(v)}</option>`).join("")}</select></label>
      ${typSel}
      ${num("H", "Höjd", "Murens totala höjd inklusive fotplattan", "m", 0.05, 0.2, 12)}
      ${s.kind === "L" || s.kind === "cast" ? num("bt", "Fotplatta", "Fotplattans tjocklek", "m", 0.01, 0.05, 1) + num("tl", "Tå (fram)", "Fotens längd framför muren", "m", 0.05, 0, 3) + num("hl", "Häl (bak)", "Fotens längd bakom muren, under jorden", "m", 0.05, 0, 5) : ""}
      ${s.kind === "L" ? num("t", "Livtjocklek", "Murens tjocklek", "m", 0.01, 0.05, 1) + num("len", "Elementlängd", "Längd per element (2,0 m är vanligt)", "m", 0.1, 0.3, 8) : ""}
      ${s.kind === "cast" ? num("t2", "Liv nere", "Livets tjocklek vid foten", "m", 0.01, 0.1, 2) + num("t1", "Liv uppe", "Livets tjocklek överst", "m", 0.01, 0.1, 2) : ""}
      ${s.kind === "grav" ? num("bw", "Bredd nere", "Murens bredd vid foten", "m", 0.05, 0.2, 6) + num("tw", "Bredd uppe", "Murens bredd överst", "m", 0.05, 0.1, 4) + num("fb", "Framlutning", "Hur mycket framsidan lutar bakåt (m över hela höjden)", "m", 0.05, 0, 3) : ""}
      ${s.kind === "plain" ? num("t", "Tjocklek", "Murens tjocklek", "m", 0.01, 0.05, 2) : ""}
      ${num("embed", "Ingrävd fot", "Hur långt fotens underkant ligger under marken vid fotlinjen", "m", 0.05, 0, 3)}
      <label class="v3-rd-n" title="Vilken sida jorden ligger på sett i fotlinjens riktning (punkterna i den ordning du tryckte)"><span>Jord åt</span><select data-wksoil><option value="L" ${s.soil !== "R" ? "selected" : ""}>vänster</option><option value="R" ${s.soil === "R" ? "selected" : ""}>höger</option></select></label>
      ${s.kind === "L" ? `<label class="v3-ga-tg" title="Varje element ligger vågrätt på en nivå (som i verkligheten) – av = elementet lutar med marken"><input type="checkbox" data-wkstep ${s.step ? "checked" : ""}><span>Trappa elementen</span></label>${s.step ? num("stepMin", "Trappa vid", "Höjdskillnad i marken som krävs för att nästa element ska ligga ett steg högre eller lägre. Mindre skillnader ligger kvar på samma nivå (0 = ett steg per element)", "m", 0.05, 0, 3) : ""}` : ""}
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px"><button type="button" class="v3-primary" data-wb="make">Skapa stödmur</button><button type="button" data-wb="flip" title="Vänd jordsidan">⇄ Vänd</button><button type="button" data-wb="save" title="Spara de här måtten som en egen murtyp">Spara som murtyp…</button>${custom.length ? `<button type="button" data-wb="del" title="Ta bort den valda egna murtypen">Ta bort murtyp</button>` : ""}<button type="button" data-wb="imp" title="Hämta murtyper ur en CSV- eller JSON-fil med tillverkarens mått">Importera murtyper…</button></div>
    <div class="v3-pal-hint" style="margin-top:6px">Dra i ringarna för att flytta fotlinjens punkter, ＋ lägger till en punkt, dubbelklick på en ring tar bort den. Standardmåtten är typiska – kontrollera mot tillverkarens produktblad innan du beställer eller bygger.</div>`;
  const q = sel => el.querySelector(sel), re = () => { l3swPanel(); l3swDraw(); };
  q('[data-wb="x"]').onclick = () => l3swClose();
  el.querySelectorAll("[data-wk]").forEach(i => { i.onchange = () => { const v = Number(String(i.value).replace(",", ".")); if (Number.isFinite(v)) { s[i.dataset.wk] = v; if (s.typ && /^(H|t|bt|tl|hl|len)$/.test(i.dataset.wk)) s.typ = ""; } re(); }; });
  const kd = q("[data-wkkind]"); kd.onchange = () => { s.kind = kd.value; s.typ = ""; if (s.kind === "L") l3swApplyType(s, l3swType("L:" + (Math.round(s.H * 5) / 5)) || l3swType("L:1.6")); re(); };
  const ty = q("[data-wktyp]"); if (ty) ty.onchange = () => { if (ty.value) l3swApplyType(s, l3swType(ty.value)); else s.typ = ""; re(); };
  q("[data-wksoil]").onchange = e => { s.soil = e.target.value; re(); };
  const st = q("[data-wkstep]"); if (st) st.onchange = () => { s.step = st.checked; re(); };
  q('[data-wb="flip"]').onclick = () => { s.soil = s.soil === "R" ? "L" : "R"; re(); };
  q('[data-wb="make"]').onclick = () => l3swMake();
  q('[data-wb="save"]').onclick = async () => { const nm = await uiPrompt("Namn på murtypen (t.ex. tillverkare och benämning):", `L-stöd h ${l3swFmt(s.H, 1)} m`, { ok: "Spara" }); if (!nm) return; const mk = await uiPrompt("Tillverkare (valfritt):", "", { ok: "Spara" }); const id = "u:" + Date.now().toString(36), t = { id, name: String(nm).trim(), maker: String(mk || "").trim() || "Mina murtyper", kind: s.kind };
    ["H", "t", "bt", "tl", "hl", "len", "t1", "t2", "bw", "tw", "fb"].forEach(k => { t[k] = s[k]; }); l3SetPref("wallTypes", [...l3swCustom(), t]); s.typ = id; re(); l3Toast(`Murtypen "${t.name}" är sparad.`); };
  const dl = q('[data-wb="del"]'); if (dl) dl.onclick = () => { const id = s.typ; if (!id || !/^u:/.test(id)) { l3Status("Välj en egen murtyp i listan först.", true); return; } l3SetPref("wallTypes", l3swCustom().filter(x => x.id !== id)); s.typ = ""; re(); };
  q('[data-wb="imp"]').onclick = () => l3swImport(re);
}
/* CSV (namn;tillverkare;höjd;fotbredd;tå;livtjocklek;fottjocklek;längd – meter) eller JSON ([{name,maker,H,tl,t,bt,hl,len}]). */
function l3swImport(done) {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".csv,.json,.txt"; inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return; const txt = await f.text(), out = [], num = v => Number(String(v).replace(",", ".").trim());
    try {
      if (/^\s*[\[{]/.test(txt)) { const j = JSON.parse(txt); (Array.isArray(j) ? j : [j]).forEach(x => { if (x && x.H > 0) out.push({ id: "u:" + Date.now().toString(36) + out.length, name: x.name || `L-stöd h ${l3swFmt(x.H, 1)} m`, maker: x.maker || "Importerad", kind: x.kind || "L", H: +x.H, t: +x.t || 0.12, bt: +x.bt || 0.12, tl: +x.tl || 0.25, hl: +x.hl || 0.8, len: +x.len || 2 }); }); }
      else txt.split(/\r?\n/).forEach((ln, i) => { const c = ln.split(/[;\t]/); if (c.length < 7 || !(num(c[2]) > 0)) return; const H = num(c[2]), bw = num(c[3]), tl = num(c[4]), t = num(c[5]), bt = num(c[6]); out.push({ id: "u:" + Date.now().toString(36) + i, name: c[0].trim() || `L-stöd h ${l3swFmt(H, 1)} m`, maker: c[1].trim() || "Importerad", kind: "L", H, t, bt, tl, hl: Math.max(0, Math.round((bw - tl - t) * 100) / 100), len: num(c[7]) > 0 ? num(c[7]) : 2 }); });
    } catch (e) { l3Status("Kunde inte läsa filen: " + e.message, true); return; }
    if (!out.length) { l3Status("Hittade inga murtyper i filen (CSV: namn;tillverkare;höjd;fotbredd;tå;livtjocklek;fottjocklek;längd).", true); return; }
    l3SetPref("wallTypes", [...l3swCustom(), ...out]); l3Toast(`${out.length} murtyper importerade – välj dem under Standard.`); done();
  }; inp.click();
}
/* ---- Start / skapa / stäng ---- */
function l3swStart() {
  const mp = l3t.mp || []; if (mp.length < 2) { l3Status("Muren behöver minst två punkter (fotlinjen).", true); return; }
  const pts = mp.map(p => [p.x + l3.O[0], p.y + l3.O[1], p.z + l3.O[2]].map(v => Math.round(v * 1000) / 1000));
  l3t.mp = null; l3Busy(false); l3ShowVcb(null); l3Clear(l3.groups.tmp); if (typeof l3ClearMeasure === "function") l3ClearMeasure();
  const spec = { ...L3SW_DEF, ...(l3sw.last || {}) }; if (spec.kind === "L" && !spec.typ) l3swApplyType(spec, l3swType("L:1.6"));
  l3swOpen({ pts, spec, res: null });
}
function l3swOpen(cur) {
  l3swClose(true); l3sw.cur = cur;
  if (!l3sw.kbd) { l3sw.kbd = e => { if (e.key === "Escape" && l3sw.cur && !/INPUT|SELECT|TEXTAREA/.test((e.target || {}).tagName || "")) { e.stopPropagation(); l3swClose(); } }; window.addEventListener("keydown", l3sw.kbd, true); }
  l3swDraw(); l3swPanel(); l3Status("Stödmur: ställ in murtyp och mått i panelen och tryck Skapa stödmur. Esc stänger.");
}
function l3swClose(keep) {
  const el = document.getElementById("v3WallPanel"); if (el) el.remove(); const c = l3sw.cur; if (c) l3sw.last = JSON.parse(JSON.stringify(c.spec));
  l3sw.cur = null; l3swH.rings.forEach(e => e.remove()); l3swH.plus.forEach(e => e.remove()); l3swH.rings = []; l3swH.plus = []; if (l3.groups.wall) l3Clear(l3.groups.wall); if (!keep) { if (l3sw.kbd) { window.removeEventListener("keydown", l3sw.kbd, true); l3sw.kbd = null; } l3Render(); }
}
function l3swMake() {
  const c = l3sw.cur; if (!c) return; const r = c.res || l3swBuild(c.pts, c.spec); if (!r.parts || !r.parts.length) { l3Status(r.err || "Inget att skapa.", true); return; }
  placeSnapshot(); const set = ghNewId().slice(0, 8), ids = []; let vol = 0, org = null;
  r.parts.forEach(pt => {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity; pt.mesh.pts.forEach(q => { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); z0 = Math.min(z0, q[2]); });
    const r3 = v => Math.round(v * 1000) / 1000, m = { k: "mesh", pts: pt.mesh.pts.map(q => [r3(q[0] - x0), r3(q[1] - y0), r3(q[2] - z0)]), faces: pt.mesh.faces.map(f => [f[0], f[1], f[2]]), closed: true, ifc: "IFCWALL" };
    const p = modCreate(m, [x0, y0, z0], { name: pt.name, color: c.spec.color || "#b8bcc2", snapshot: false }); p.set = set; p.note = `Volym ${l3swFmt(pt.vol, 2)} m³ · ca ${l3swFmt(pt.vol * L3SW_DENS / 1000, 2)} ton · längd ${l3swFmt(pt.len, 2)} m`; ids.push(p.id); vol += pt.vol; org = org || [x0, y0, z0];
  });
  const kd = L3SW_KINDS[c.spec.kind], n = ids.length; l3swClose(); l3SelectIds(ids); l3Changed();
  l3Toast(`Stödmur skapad: ${kd}, ${n} ${n === 1 ? "objekt" : "objekt"}, ${l3swFmt(vol, 2)} m³ (ca ${l3swFmt(vol * L3SW_DENS / 1000, 1)} ton). Ctrl+Z ångrar. Redigera, dela och exportera som IFC som vanligt.`);
}
function l3swTap() { if (!l3sw.cur || l3.tool !== "measure" || l3Prefs().measure !== "wall") return false; l3Status("Stödmuren är öppen – skapa den eller stäng den (Esc) för att placera en ny.", true); return true; }
