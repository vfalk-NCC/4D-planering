/* 3D-vyn – Bergförankring från ritningstabeller (Victor 2026-11-19: "ett verktyg i 3d-editorn som extraherar och modellerar in bergförankringarna som är listade i pdf:en").
   Prefix l3bf. Knapp: "⚓ Bergförankring från PDF…" i vänstermenyn (under Importera modell).
   Läser tabellerna i LKAB:s ritningar (SWEREF 99 20 15, RH 2000) direkt i webbläsaren med pdf.js:
   – Vertikala: "BV…  X  Y  Z  I BERG (m)  ⌀"   → stång från startpunkten, sättdjupet nedåt (eller uppåt) + valfri extra längd.
   – Horisontella: "BH…  X  Y  Z  ⌀" i två tabeller (startpunkt, slutpunkt) med samma stag nr → stång mellan punkterna.
   Varje stång blir en riktig kropp (8-kantig cylinder, rätt volym) i grupper per typ och dimension (”Bergförankring vertikala ⌀25” …) i mappen "Bergförankring".
   Varje grupp är ett sammanslaget nät där stagnumren ligger kvar som delar – Dela upp ger enskilda stänger. Ritningarnas tillägg ("UTGÅTT") hoppas över.
   Tolkningen är öppen i dialogen: riktning på vertikala, extra längd, förstorad visningsdiameter (25 mm syns inte i 3D) och stång eller borrhål (⌀45/⌀55). */

const L3BF_COL = { "V25": "#f59e0b", "V32": "#dc2626", "H25": "#0ea5e9", "H32": "#7c3aed" };
const L3BF_HOLE = { 25: 45, 32: 55 };   // borrhålens diameter enligt ritningarnas arbetsgång (mm)
const l3bf = { rows: null, files: [], opt: { dir: "down", extra: 0, scale: 4, as: "bar", per: "bar", replace: true }, busy: false };

/* ---- 1. Text ur PDF ---- */
async function l3bfPdfItems(file) {
  if (typeof pdfjsLib === "undefined") throw new Error("PDF-läsaren (pdf.js) är inte laddad");
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise, items = [];
  for (let pg = 1; pg <= doc.numPages; pg++) {
    const page = await doc.getPage(pg), tc = await page.getTextContent();
    tc.items.forEach(it => { if (it.str && it.str.trim() && Math.abs(it.transform[1]) < 0.01 && Math.abs(it.transform[2]) < 0.01) items.push(   // snedställd text (vattenstämpel "UTGÅTT") hoppas över
      { s: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, h: Math.abs(it.transform[3]) || 8, pg }); });
  }
  return items;
}
/* ---- 2. Rader och tabellposter ur textobjekt ({ s, x, y (uppåt), w, h, pg }) ---- */
const L3BF_J = "(?:\\d{1,3}\\s+)*";   // lösa siffror från vattenstämpeln som hamnat mellan kolumnerna hoppas över
const L3BF_NUM = "(\\d{5,7}[.,]\\d+)\\s+" + L3BF_J + "(\\d{6,7}[.,]\\d+)\\s+" + L3BF_J + "\\+?(-?\\d+[.,]\\d+)";
const l3bfN = s => parseFloat(String(s).replace(",", "."));
function l3bfRows(items) {
  // Större text än tabellens (vattenstämplar, rubriker) hoppas över – den kan ligga över raderna och störa siffrorna.
  const hs = items.map(it => it.h).filter(h => h > 0).sort((a, b) => a - b), med = hs.length ? hs[hs.length >> 1] : 0; if (med) items = items.filter(it => !(it.h > med * 1.3));
  const byPg = new Map(); items.forEach(it => { if (!byPg.has(it.pg || 1)) byPg.set(it.pg || 1, []); byPg.get(it.pg || 1).push(it); });
  const rows = [];
  [...byPg.keys()].sort((a, b) => a - b).forEach(pg => {
    const a = byPg.get(pg).slice().sort((p, q) => q.y - p.y || p.x - q.x); let cur = null;
    a.forEach(it => { if (cur && Math.abs(it.y - cur.y) <= Math.max(1.5, it.h * 0.35)) cur.list.push(it); else { cur = { pg, y: it.y, list: [it] }; rows.push(cur); } });
  });
  rows.forEach(r => {
    r.list.sort((p, q) => p.x - q.x);
    let t = "", prev = null; r.list.forEach(it => { if (!/[\d]/.test(it.s) && !/^[⌀ø∅Ø]$/.test(it.s.trim())) return;   // lösa bokstäver (vattenstämpel) bort
      if (prev && it.x - (prev.x + prev.w) < Math.min(prev.h, it.h) * 0.12 && prev.w) t += it.s; else t += (t ? " " : "") + it.s; prev = it; });
    r.text = t;
  });
  return rows;
}
/* Tolkar raderna: { vert: [{ id, x, y, z, len, dim }], hor: [{ id, a: [x, y, z], b: [x, y, z], dim }], warn: [] } */
function l3bfParse(items, label) {
  const rows = l3bfRows(items), warn = [], vert = new Map(), hs = new Map();
  const reV = new RegExp("\\b(BV\\d+)\\s+" + L3BF_NUM + "\\s+(?:(\\d+(?:[.,]\\d+)?)\\s+)?[^\\d\\s]?\\s*(25|32)\\b", "g");
  const reH = new RegExp("\\b(BH\\d+)\\s+" + L3BF_NUM + "\\s+" + L3BF_J + "[^\\d\\s]?\\s*(25|32)\\b", "g");
  rows.forEach(r => {
    let m; reV.lastIndex = 0;
    while ((m = reV.exec(r.text))) { const id = m[1]; if (vert.has(id)) warn.push(`${id}: finns flera gånger i ${label} (första används)`); else { if (m[5] == null) warn.push(`${id}: sättdjup saknas i ${label} – 2 m antas`); vert.set(id, { id, x: l3bfN(m[2]), y: l3bfN(m[3]), z: l3bfN(m[4]), len: m[5] == null ? 2 : l3bfN(m[5]), dim: +m[6], guess: m[5] == null, src: label }); } }
    reH.lastIndex = 0;
    while ((m = reH.exec(r.text))) { const id = m[1]; if (!hs.has(id)) hs.set(id, []); hs.get(id).push({ p: [l3bfN(m[2]), l3bfN(m[3]), l3bfN(m[4])], dim: +m[5] }); }
  });
  const hor = [];
  hs.forEach((l, id) => {
    if (l.length < 2) { warn.push(`${id}: slutpunkt saknas i ${label} (hoppas över)`); return; }
    if (l.length > 2) warn.push(`${id}: ${l.length} förekomster i ${label} (de två första används)`);
    if (l[0].dim !== l[1].dim) warn.push(`${id}: olika dimension i start- och slutpunkt (${l[0].dim}/${l[1].dim}) – startens används`);
    const L = Math.hypot(l[1].p[0] - l[0].p[0], l[1].p[1] - l[0].p[1], l[1].p[2] - l[0].p[2]);
    if (L < 0.2) { warn.push(`${id}: start och slut ligger på samma punkt (hoppas över)`); return; }
    if (L > 40) warn.push(`${id}: ovanligt lång (${L.toFixed(1)} m) – kontrollera start/slut`);
    hor.push({ id, a: l[0].p, b: l[1].p, dim: l[0].dim, src: label });
  });
  return { vert: [...vert.values()], hor, warn };
}
/* Flera filer: senare filer ersätter samma stag nr (nyare revision). */
function l3bfMerge(parts) {
  const V = new Map(), H = new Map(), warn = [], files = [];
  parts.forEach(r => {
    files.push({ name: r.name, v: r.res.vert.length, h: r.res.hor.length });
    r.res.vert.forEach(v => { if (V.has(v.id)) warn.push(`${v.id}: finns i flera filer – ${r.name} gäller`); V.set(v.id, v); });
    r.res.hor.forEach(h => { if (H.has(h.id)) warn.push(`${h.id}: finns i flera filer – ${r.name} gäller`); H.set(h.id, h); });
    r.res.warn.forEach(w => warn.push(w));
  });
  return { vert: [...V.values()], hor: [...H.values()], warn, files };
}
/* ---- 3. Geometri: cylinder mellan två punkter (SWEREF-meter) ---- */
function l3bfCyl(p0, p1, rad, sides = 8) {
  const ax = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], L = Math.hypot(...ax); if (L < 1e-6) return null;
  const u = ax.map(v => v / L), t = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let a = [u[1] * t[2] - u[2] * t[1], u[2] * t[0] - u[0] * t[2], u[0] * t[1] - u[1] * t[0]]; const la = Math.hypot(...a); a = a.map(v => v / la);
  const b = [u[1] * a[2] - u[2] * a[1], u[2] * a[0] - u[0] * a[2], u[0] * a[1] - u[1] * a[0]];
  const pts = [], faces = [];
  for (let i = 0; i < sides; i++) { const w = 2 * Math.PI * i / sides, c = Math.cos(w) * rad, s = Math.sin(w) * rad, o = [a[0] * c + b[0] * s, a[1] * c + b[1] * s, a[2] * c + b[2] * s]; pts.push([p0[0] + o[0], p0[1] + o[1], p0[2] + o[2]]); }
  for (let i = 0; i < sides; i++) { const w = 2 * Math.PI * i / sides, c = Math.cos(w) * rad, s = Math.sin(w) * rad, o = [a[0] * c + b[0] * s, a[1] * c + b[1] * s, a[2] * c + b[2] * s]; pts.push([p1[0] + o[0], p1[1] + o[1], p1[2] + o[2]]); }
  const c0 = pts.length; pts.push(p0.slice()); pts.push(p1.slice());
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;   // 1-baserade index, utåtvända trianglar (a × b = u)
    faces.push([i + 1, j + 1, sides + j + 1], [i + 1, sides + j + 1, sides + i + 1]);
    faces.push([c0 + 1, j + 1, i + 1]);
    faces.push([c0 + 2, sides + i + 1, sides + j + 1]);
  }
  return { pts, faces };
}
/* Stavens ändpunkter ur en post och inställningarna. */
function l3bfEnds(kind, e, opt) {
  if (kind === "H") return [e.a, e.b];
  const sgn = opt.dir === "up" ? 1 : -1;
  const top = [e.x, e.y, e.z], end = [e.x, e.y, e.z + sgn * e.len];
  // extra längd läggs ovanför startpunkten (stången sticker upp ur berget)
  const ext = (Number(opt.extra) || 0); if (ext > 0) top[2] = e.z - sgn * ext;
  return [top, end];
}
const l3bfDia = (dim, opt) => ((opt.as === "hole" ? L3BF_HOLE[dim] || dim * 1.8 : dim) / 1000) * (Number(opt.scale) || 1);
/* Alla fakta om en stång som egenskaper (visas i högerpanelen och följer med IFC-exporten): [namn, värde]. */
function l3bfProps(kind, e, a, b, opt) {
  const V = kind === "V", L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), r = e.dim / 2000, steel = Math.PI * r * r * L, f = (v, d = 3) => l3bfF(v, d);
  const num = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d, dwg = String(e.src || "").replace(/\.pdf$/i, "");
  const p = [["Stag nr", e.id], ["Typ", V ? "Vertikal bergförankring" : "Horisontell bergförankring"], ["Dimension stång mm", `⌀${e.dim}`], ["Borrhål mm", `⌀${L3BF_HOLE[e.dim] || ""}`],
    [V ? "Startpunkt X (SWEREF 99 20 15)" : "Startpunkt X", num(a[0])], ["Startpunkt Y", num(a[1])], ["Startpunkt Z (RH 2000)", num(a[2])]];
  if (V) { p.push(["Sättdjup i berg m", e.len], ["Toppunkt Z", num(Math.max(a[2], b[2]))], ["Bottenpunkt Z", num(Math.min(a[2], b[2]))]); if (e.guess) p.push(["Obs", "Sättdjup saknas i ritningstabellen – 2 m antaget"]); }
  else p.push(["Slutpunkt X", num(b[0])], ["Slutpunkt Y", num(b[1])], ["Slutpunkt Z", num(b[2])], ["Lutning grader", num(Math.atan2(b[2] - a[2], Math.hypot(b[0] - a[0], b[1] - a[1])) * 180 / Math.PI, 1)], ["Minst i berg m", e.dim >= 32 ? 4.5 : 1.5]);
  p.push(["Längd m", num(L)], ["Stålvolym m³", num(steel, 5)], ["Vikt stål kg (7850 kg/m³)", num(steel * 7850, 1)], ["Koordinatsystem", "SWEREF 99 20 15 / RH 2000"], ["Källa (ritning)", dwg || ""],
    ["Arbetsgång", V ? `Vertikala hål ⌀${L3BF_HOLE[e.dim] || ""} borras till angivet sättdjup, blås rent med tryckluft, cementpasta förs ned med slang till hålets botten` : `Horisontella hål ⌀${L3BF_HOLE[e.dim] || ""} borras enligt start- och slutpunkt, minst ${e.dim >= 32 ? "4,5" : "1,5"} m i berg, blås rent, cementpasta förs ned med slang till hålets botten`],
    ["Visningsdiameter mm", num(l3bfDia(e.dim, opt) * 1000, 1)]);
  return p;
}
/* Grupper: per typ och dimension (eller en per stång). Varje grupp: { name, key, col, bars: [{ id, a, b }] }. */
function l3bfGroups(res, opt) {
  const G = new Map(), add = (kind, dim, id, a, b, e) => { const key = kind + dim; if (!G.has(key)) G.set(key, { key, kind, dim, col: L3BF_COL[key] || "#f59e0b", name: `Bergförankring ${kind === "V" ? "vertikala" : "horisontella"} ⌀${dim}`, bars: [] }); G.get(key).bars.push({ id, a, b, props: l3bfProps(kind, e, a, b, opt) }); };
  res.vert.forEach(v => { const [a, b] = l3bfEnds("V", v, opt); add("V", v.dim, v.id, a, b, v); });
  res.hor.forEach(h => { const [a, b] = l3bfEnds("H", h, opt); add("H", h.dim, h.id, a, b, h); });
  return [...G.values()].sort((x, y) => x.key.localeCompare(y.key));
}
const l3bfF = (v, d = 2) => (Number.isFinite(v) ? v : 0).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });
const l3bfR3 = v => Math.round(v * 1000) / 1000;
/* Ett sammanslaget nät för gruppen (delarna bevarar varje stång för Dela upp). */
function l3bfBuild(g, opt) {
  const rad = l3bfDia(g.dim, opt) / 2, pts = [], faces = [], parts = [];
  const A0 = g.bars[0].a.slice();
  g.bars.forEach(b => {
    const c = l3bfCyl(b.a, b.b, rad); if (!c) return;
    const base = pts.length; c.pts.forEach(q => pts.push([l3bfR3(q[0] - A0[0]), l3bfR3(q[1] - A0[1]), l3bfR3(q[2] - A0[2])]));
    c.faces.forEach(f => faces.push([f[0] + base, f[1] + base, f[2] + base]));
    const lp = c.pts.map(q => [l3bfR3(q[0] - b.a[0]), l3bfR3(q[1] - b.a[1]), l3bfR3(q[2] - b.a[2])]);
    parts.push({ name: `${b.id} ⌀${g.dim}`, type: "mod:kropp", color: g.col, x: l3bfR3(b.a[0]), y: l3bfR3(b.a[1]), z: l3bfR3(b.a[2]), dz: 0, rot: 0, m: { k: "mesh", pts: lp, faces: c.faces, closed: true, bfp: b.props } });
  });
  return { A0, m: { k: "mesh", pts, faces, closed: true, parts }, n: parts.length };
}
/* Skapar objekten i 3D-vyn. Returnerar { ids, n, groups }. */
function l3bfCreate(res, opt) {
  if (typeof modCreate !== "function" || typeof placeSnapshot !== "function") throw new Error("Ritverktygen är inte laddade");
  placeSnapshot();
  if (opt.replace) { const old = placements.filter(p => p.bf).map(p => p.id); if (old.length) l3dxRemove(old); }
  const ids = [], info = []; let n = 0;
  l3bfGroups(res, opt).forEach(g => {
    const mk = (bars, name) => { const sub = { ...g, bars }, r = l3bfBuild(sub, opt); if (!r.n) return null; if (bars.length === 1) { r.m.bfp = bars[0].props; delete r.m.parts; } const p = modCreate(r.m, r.A0, { name, color: g.col, snapshot: false }); p.area = "Bergförankring/" + (g.kind === "V" ? "Vertikala" : "Horisontella") + " ⌀" + g.dim; p.bf = { kind: g.kind, dim: g.dim, n: r.n, as: opt.as };
      p.note = `${r.n} st ${g.kind === "V" ? "vertikala" : "horisontella"} bergförankringar ⌀${g.dim} ur ritningstabell (SWEREF 99 20 15, RH 2000). Visningsdiameter ${l3bfF(l3bfDia(g.dim, opt) * 1000, 0)} mm.`; return p; };
    if (opt.per === "bar") g.bars.forEach(b => { const p = mk([b], `${b.id} ⌀${g.dim}`); if (p) { ids.push(p.id); n++; } });
    else { const p = mk(g.bars, g.name); if (p) { ids.push(p.id); n += g.bars.length; } }
    info.push({ name: g.name, n: g.bars.length });
  });
  if (ids.length) { try { if (typeof l3MkRefresh === "function") l3MkRefresh({}); } catch (e) { /* */ } l3SelectIds(ids); l3Changed(); }
  return { ids, n, groups: info };
}
function l3bfFly(res) {
  try {
    const P = []; res.vert.forEach(v => P.push([v.x, v.y, v.z])); res.hor.forEach(h => { P.push(h.a); P.push(h.b); }); if (!P.length) return;
    const mn = [1e12, 1e12, 1e12], mx = [-1e12, -1e12, -1e12]; P.forEach(p => { for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], p[i]); mx[i] = Math.max(mx[i], p[i]); } });
    const c = new THREE.Vector3((mn[0] + mx[0]) / 2 - l3.O[0], (mn[1] + mx[1]) / 2 - l3.O[1], (mn[2] + mx[2]) / 2 - l3.O[2]), d = Math.max(20, Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) * 1.1);
    l3FlyTo(c, d);
  } catch (e) { /* */ }
}
/* CSV med alla tolkade stänger (för kontroll mot ritningen). */
function l3bfCsv(res, opt) {
  const L = ["Typ;Stag nr;Dimension (mm);Start X;Start Y;Start Z;Slut X;Slut Y;Slut Z;Längd (m);Sättdjup i berg (m)"];
  res.vert.forEach(v => { const [a, b] = l3bfEnds("V", v, opt); L.push(["Vertikal", v.id, v.dim, v.x, v.y, v.z, b[0], b[1], b[2], l3bfF(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])), l3bfF(v.len)].join(";")); });
  res.hor.forEach(h => L.push(["Horisontell", h.id, h.dim, ...h.a, ...h.b, l3bfF(Math.hypot(h.b[0] - h.a[0], h.b[1] - h.a[1], h.b[2] - h.a[2])), ""].join(";")));
  return "﻿" + L.join("\r\n");
}
/* ---- 4. Dialog ---- */
function l3bfSummary(res) {
  const cnt = (arr, d) => arr.filter(x => x.dim === d).length, lenV = res.vert.reduce((a, v) => a + v.len, 0), lenH = res.hor.reduce((a, h) => a + Math.hypot(h.b[0] - h.a[0], h.b[1] - h.a[1], h.b[2] - h.a[2]), 0);
  return { V25: cnt(res.vert, 25), V32: cnt(res.vert, 32), H25: cnt(res.hor, 25), H32: cnt(res.hor, 32), lenV, lenH, total: res.vert.length + res.hor.length };
}
/* Menyerna ligger som verktygspaneler (v3-vp) och hamnar därför i högermenyn när den är dockad (Victor 2026-11-19: allt nytt ska dockas i högermenyn). */
function l3bfPanel(id, title, html, onClose, left) {
  const host = document.getElementById("v3Canvas"); if (!host) return null;
  let el = document.getElementById(id);
  if (!el) { el = document.createElement("div"); el.id = id; el.className = "v3-vp v3-bf"; el.style.left = left || "12px"; el.style.right = "auto"; host.appendChild(el); ["pointerdown", "wheel", "contextmenu", "dblclick", "click", "keydown", "keyup"].forEach(t => el.addEventListener(t, e => e.stopPropagation())); }
  el.classList.remove("hidden"); el._onClose = onClose || null;
  el.innerHTML = `<div class="v3-vp-h"><b>${typeof escHtml === "function" ? escHtml(title) : title}</b><span></span><button type="button" data-bf-x title="Stäng">✕</button></div><div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">${html}</div>`;
  el.querySelector("[data-bf-x]").onclick = () => l3bfPanelClose(id);
  return el;
}
function l3bfPanelClose(id) { const el = document.getElementById(id); if (!el) return; const f = el._onClose; el.remove(); if (typeof f === "function") f(); }
function l3bfOpen() {
  const o = l3bf.opt, esc = typeof escHtml === "function" ? escHtml : s => String(s);
  const d = l3bfPanel("v3Bolt", "Bergförankring från PDF", `
    <div class="v3-sub">Välj ritningarnas tabell-PDF:er (flera på en gång går bra). Vertikala (BV…) och horisontella (BH…) bergförankringar läses ut och modelleras in med riktiga koordinater.</div>
    <input type="file" id="v3BfFile" accept=".pdf,application/pdf" multiple />
    <div id="v3BfRes" class="v3-sub" style="margin:8px 0"></div>
    <div id="v3BfOpt" class="hidden">
      <label class="v3-row">Vertikala stänger går <select id="v3BfDir"><option value="down">neråt från startpunkten</option><option value="up">uppåt från startpunkten</option></select></label>
      <label class="v3-row">Extra längd ovanför startpunkten (m) <input type="number" id="v3BfExtra" step="0.1" min="0" value="${o.extra}" style="width:70px" /></label>
      <label class="v3-row">Visa som <select id="v3BfAs"><option value="bar">Stång (⌀25 / ⌀32)</option><option value="hole">Borrhål (⌀45 / ⌀55)</option></select></label>
      <label class="v3-row">Förstora diametern <input type="number" id="v3BfScale" step="1" min="1" max="50" value="${o.scale}" style="width:60px" /> ×  <em>(så att de syns i 3D)</em></label>
      <label class="v3-row">Skapa <select id="v3BfPer"><option value="bar">ett objekt per stång (mappar per typ och dimension)</option><option value="group">en grupp per typ och dimension (snabbare, Dela upp ger enskilda)</option></select></label>
      <label class="v3-row"><input type="checkbox" id="v3BfRep" ${o.replace ? "checked" : ""} /> Ersätt tidigare bergförankring</label>
      <div class="an-actions"><button type="button" id="v3BfGo">⚓ Skapa i 3D</button><button type="button" id="v3BfCsv">Tabell (CSV)</button></div>
    </div>`, null, "12px");
  const $ = id => d.querySelector("#" + id);
  $("v3BfDir").value = o.dir; $("v3BfAs").value = o.as; $("v3BfPer").value = o.per;
  const sync = () => { o.dir = $("v3BfDir").value; o.extra = Math.max(0, Number($("v3BfExtra").value) || 0); o.as = $("v3BfAs").value; o.scale = Math.max(1, Number($("v3BfScale").value) || 1); o.per = $("v3BfPer").value; o.replace = $("v3BfRep").checked; };
  ["v3BfDir", "v3BfExtra", "v3BfAs", "v3BfScale", "v3BfPer", "v3BfRep"].forEach(i => { $(i).onchange = sync; });
  $("v3BfFile").onchange = async e => {
    const files = [...e.target.files]; if (!files.length) return; l3bf.pending = null; const box = $("v3BfRes"); box.textContent = "Läser tabellerna…";
    try {
      const bufs = []; for (const f of files) bufs.push({ name: f.name, buf: await f.arrayBuffer() }); l3bf.pending = bufs;
      const parts = []; for (const f of files) { const items = await l3bfPdfItems(f); parts.push({ name: f.name, res: l3bfParse(items, f.name) }); }
      const res = l3bfMerge(parts); l3bf.rows = res; l3bf.files = res.files; const s = l3bfSummary(res);
      box.innerHTML = `<b>${s.total} bergförankringar</b> hittades: vertikala ${s.V25} st ⌀25 + ${s.V32} st ⌀32 (sättdjup ${l3bfF(s.lenV, 1)} m), horisontella ${s.H25} st ⌀25 + ${s.H32} st ⌀32 (${l3bfF(s.lenH, 1)} m).<br>`
        + res.files.map(f => `${esc(f.name)}: ${f.v} vertikala, ${f.h} horisontella`).join("<br>")
        + (res.warn.length ? `<br><b>Obs (${res.warn.length}):</b> ` + esc(res.warn.slice(0, 6).join(" · ")) + (res.warn.length > 6 ? " …" : "") : "");
      $("v3BfOpt").classList.toggle("hidden", !s.total);
      if (!s.total) box.innerHTML += "<br>Inga tabellrader hittades – är det rätt PDF (stag nr, X, Y, Z …)?";
    } catch (err) { box.textContent = "Kunde inte läsa: " + err.message; }
  };
  $("v3BfGo").onclick = () => {
    if (!l3bf.rows) return; sync();
    try { const r = l3bfCreate(l3bf.rows, o); l3bfFly(l3bf.rows); if (l3bf.pending) { l3bf.docs = l3bf.pending; l3bfSaveDocs(l3bf.docs); } l3Status(`${r.n} bergförankringar modellerade (${r.groups.map(g => `${g.n} st ${g.name.replace("Bergförankring ", "")}`).join(", ")}). Ctrl+Z ångrar. Mapp: Bergförankring.`); l3bfPanelClose("v3Bolt"); setTimeout(() => l3bfOpenDocs(), 900); }
    catch (err) { l3Status("Kunde inte skapa bergförankringarna: " + err.message, true); }
  };
  $("v3BfCsv").onclick = () => { if (!l3bf.rows) return; sync(); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([l3bfCsv(l3bf.rows, o)], { type: "text/csv" })); a.download = "bergforankring.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
}

/* ---- 5. Egenskaperna i högerpanelen och i IFC-exporten ---- */
const l3bfEsc = v => (typeof escHtml === "function" ? escHtml(String(v)) : String(v));
const l3bfTbl = rows => `<table class="v3-kv" style="width:100%;font-size:12px;border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#64748b;padding:1px 6px 1px 0;vertical-align:top">${l3bfEsc(k)}</td><td style="word-break:break-word"><b>${l3bfEsc(v)}</b></td></tr>`).join("")}</table>`;
function l3bfSide(p) {
  const m = p && p.m; if (!m) return "";
  if (m.bfp) return `<div class="v3-sec">Bergförankring – ${l3bfEsc((m.bfp[0] || [])[1] || "")}</div>${l3bfTbl(m.bfp)}`;
  if (p.bf && m.parts) {
    const rows = m.parts.map(q => q.m && q.m.bfp).filter(Boolean), get = (b, k) => (b.find(x => x[0] === k) || [])[1], len = rows.reduce((a, b) => a + (Number(get(b, "Längd m")) || 0), 0), kg = rows.reduce((a, b) => a + (Number(get(b, "Vikt stål kg (7850 kg/m³)")) || 0), 0);
    const head = ["Stag nr", "Längd m", "Start X", "Start Y", "Start Z"];
    return `<div class="v3-sec">Bergförankring – ${p.bf.n} st ⌀${p.bf.dim}</div>${l3bfTbl([["Antal", rows.length], ["Total längd m", Math.round(len * 100) / 100], ["Total vikt stål kg", Math.round(kg)]])}
      <details><summary style="cursor:pointer;margin:6px 0">Alla stänger (${rows.length})</summary><div style="max-height:220px;overflow:auto"><table style="font-size:11px;border-collapse:collapse;width:100%"><tr>${head.map(h => `<th style="text-align:left;padding:0 6px 0 0">${h}</th>`).join("")}</tr>${rows.map(b => `<tr><td>${l3bfEsc(get(b, "Stag nr"))}</td><td>${l3bfEsc(get(b, "Längd m"))}</td><td>${l3bfEsc(get(b, "Startpunkt X (SWEREF 99 20 15)") != null ? get(b, "Startpunkt X (SWEREF 99 20 15)") : get(b, "Startpunkt X"))}</td><td>${l3bfEsc(get(b, "Startpunkt Y"))}</td><td>${l3bfEsc(get(b, "Startpunkt Z (RH 2000)"))}</td></tr>`).join("")}</table></div></details>
      <div class="v3-sub">Dela upp ger enskilda stänger med alla egenskaper.</div>`;
  }
  return "";
}
if (typeof modSideHtml === "function") { const l3bfSide0 = modSideHtml; modSideHtml = function (p) { return l3bfSide(p) + l3bfSide0(p); }; }
if (typeof modProps === "function") {
  const l3bfProps0 = modProps;
  modProps = function (p) {
    const out = l3bfProps0(p), m = p && p.m; if (!m) return out;
    if (m.bfp) return out.concat(m.bfp.filter(([k]) => k !== "Typ" || true).map(([k, v]) => [k === "Typ" ? "Bergförankring" : k, v]));
    if (p.bf && m.parts) { const rows = m.parts.map(q => q.m && q.m.bfp).filter(Boolean); out.push(["Antal stänger", rows.length], ["Stag nr", rows.map(b => (b[0] || [])[1]).join(", ")]); }
    return out;
  };
}

/* ---- 6. Ritningarna som bilder: klicka på ett stag nr → zoomar till stången i 3D (Victor 2026-11-19) ----
   PDF:erna sparas i webbläsaren (IndexedDB, per projekt) så att de finns kvar nästa gång. Varje tabellrad (stag nr) blir ett klickfält över bilden.
   Stagen kopplas till stängerna i 3D via egenskapen "Stag nr" (grupp-delar och enskilda objekt). */
const L3BF_DB = "lagesplan-bergforankring";
function l3bfDb() { return new Promise((res, rej) => { if (typeof indexedDB === "undefined") return rej(new Error("ingen IndexedDB")); const q = indexedDB.open(L3BF_DB, 1); q.onupgradeneeded = () => q.result.createObjectStore("pdf"); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
const l3bfKey = () => "pdf|" + (typeof projectId !== "undefined" ? projectId : "");
async function l3bfSaveDocs(docs) { try { const db = await l3bfDb(); await new Promise((res, rej) => { const t = db.transaction("pdf", "readwrite"); t.objectStore("pdf").put(docs.map(d => ({ name: d.name, buf: d.buf })), l3bfKey()); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch (e) { console.warn("Kunde inte spara ritningarna", e); } }
async function l3bfLoadDocs() { try { const db = await l3bfDb(); return await new Promise(res => { const q = db.transaction("pdf").objectStore("pdf").get(l3bfKey()); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); }); } catch (e) { return []; } }
/* Stagen i 3D: stag nr → { pl, center [X, Y, Z], diag, geom { pts, faces } i SWEREF-meter }. */
function l3bfIndex() {
  const M = new Map();
  const add = (pl, id, m, ox, oy, oz) => {
    if (!id || !m || !m.pts || !m.pts.length) return; let mn = [1e12, 1e12, 1e12], mx = [-1e12, -1e12, -1e12];
    const pts = m.pts.map(q => { const w = [ox + q[0], oy + q[1], oz + q[2]]; for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], w[i]); mx[i] = Math.max(mx[i], w[i]); } return w; });
    const nP = pts.length; M.set(id, { a: pts[nP - 2], b: pts[nP - 1], pl, center: [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2], diag: Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]), geom: { pts, faces: m.faces } });
  };
  (typeof placements !== "undefined" ? placements : []).filter(p => p.bf && p.m).forEach(p => {
    const z0 = (Number(p.z) || 0) + (Number(p.dz) || 0);
    if (p.m.bfp) add(p, (p.m.bfp[0] || [])[1], p.m, Number(p.x) || 0, Number(p.y) || 0, z0);
    else (p.m.parts || []).forEach(q => { const b = q.m && q.m.bfp; if (b) add(p, (b[0] || [])[1], q.m, Number(q.x) || 0, Number(q.y) || 0, (Number(q.z) || 0) + (Number(q.dz) || 0)); });
  });
  return M;
}
/* Markering i 3D: röd stång som syns genom allt + flyg dit. */
function l3bfHighlight(e) {
  if (!e || typeof THREE === "undefined" || !l3) return;
  if (!l3bf.hl) { l3bf.hl = new THREE.Group(); l3.scene.add(l3bf.hl); }
  while (l3bf.hl.children.length) { const c = l3bf.hl.children.pop(); if (c.geometry) c.geometry.dispose(); }
  const g = new THREE.BufferGeometry(), O = l3.O, pos = new Float32Array(e.geom.pts.length * 3);
  e.geom.pts.forEach((q, i) => { pos[i * 3] = q[0] - O[0]; pos[i * 3 + 1] = q[1] - O[1]; pos[i * 3 + 2] = q[2] - O[2]; });
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setIndex(e.geom.faces.flatMap(f => [f[0] - 1, f[1] - 1, f[2] - 1]));
  const mat = new THREE.MeshBasicMaterial({ color: 0xff2d2d, depthTest: false, transparent: true, opacity: 0.95 }), m = new THREE.Mesh(g, mat); m.renderOrder = 999; m.raycast = () => {}; m.userData.noHit = true; m.userData.noVm = true;
  l3bf.hl.add(m);
}
function l3bfGoto(id) {
  const e = (l3bf.idx = l3bfIndex()).get(id); if (!e) { l3Status(`${id} finns inte i 3D – skapa bergförankringarna först (⚓-knappen).`, true); return false; }
  l3bfHighlight(e);
  try { if (e.pl.m.bfp && typeof l3SelectIds === "function") l3SelectIds([e.pl.id]); } catch (x) { /* */ }
  const O = l3.O; l3FlyTo(new THREE.Vector3(e.center[0] - O[0], e.center[1] - O[1], e.center[2] - O[2]), Math.max(5, e.diag * 3));
  l3Render(); return true;
}
function l3bfClearHl() { if (l3bf.hl) { while (l3bf.hl.children.length) { const c = l3bf.hl.children.pop(); if (c.geometry) c.geometry.dispose(); } l3Render(); } }
/* Läser en PDF: sidor med bildstorlek och stag-fält (stag nr-cellerna). */
async function l3bfReadDoc(buf) {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise, pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n), view = page.view || [0, 0, 1000, 500], tc = await page.getTextContent(), hot = [];
    tc.items.forEach(it => { const t = String(it.str || "").trim(); if (/^B[VH]\d+$/.test(t) && Math.abs(it.transform[1]) < 0.01) hot.push({ id: t, x: it.transform[4], y: it.transform[5], w: it.width || 30, h: Math.abs(it.transform[3]) || 10 }); });
    pages.push({ page, view, hot });
  }
  return pages;
}
async function l3bfRenderPage(pg, host, scale) {
  const vp = pg.page.getViewport({ scale }), cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  const wrap = document.createElement("div"); wrap.className = "bfpg"; wrap.style.cssText = "position:relative;margin-bottom:8px;box-shadow:0 1px 6px rgba(0,0,0,.25)"; cv.style.cssText = "display:block;width:100%;height:auto;background:#fff"; wrap.appendChild(cv); host.appendChild(wrap);
  try { await pg.page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise; } catch (e) { console.warn("Kunde inte rita sidan", e); }
  const W = pg.view[2] - pg.view[0], H = pg.view[3] - pg.view[1], idx = l3bf.idx || new Map();
  pg.hot.forEach(h => {
    const d = document.createElement("div"); d.className = "bfhot"; d.dataset.id = h.id; d.title = idx.has(h.id) ? `${h.id} – klicka för att zooma till stången i 3D` : `${h.id} – finns inte i 3D`;
    const pad = 2; d.style.cssText = `position:absolute;left:${(h.x - pad - pg.view[0]) / W * 100}%;top:${(pg.view[3] - h.y - h.h * 0.95 - pad) / H * 100}%;width:${(h.w + pad * 2) / W * 100}%;height:${(h.h * 1.2 + pad * 2) / H * 100}%;cursor:${idx.has(h.id) ? "pointer" : "default"};background:${idx.has(h.id) ? "rgba(245,158,11,.22)" : "transparent"};outline:${idx.has(h.id) ? "1px solid rgba(245,158,11,.8)" : "none"};border-radius:2px`;
    wrap.appendChild(d);
  });
}
async function l3bfOpenDocs(files, quiet) {
  if (typeof pdfjsLib === "undefined") { l3Status("PDF-läsaren (pdf.js) är inte laddad.", true); return; }
  let docs = files && files.length ? files : (l3bf.docs && l3bf.docs.length ? l3bf.docs : await l3bfLoadDocs());
  if (!docs.length) { if (quiet) return; l3Status("Inga ritningar sparade än – läs in tabell-PDF:erna med ⚓-knappen först.", true); return; }
  l3bf.docs = docs; l3bf.idx = l3bfIndex();
  const d = l3bfPanel("v3BoltDoc", "Bergförankring – ritningar", `
    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><div id="v3BdTabs" style="display:flex;gap:4px;flex-wrap:wrap"></div>
      <input type="search" id="v3BdQ" placeholder="Sök stag nr (BV001…)" style="width:150px" /><button type="button" id="v3BdXh" title="Exportera scenen (modeller, punktmoln, stängerna och ritningarna) till en HTML-fil">🌐 HTML…</button><label title="Zoom på ritningen">🔍 <input type="range" id="v3BdZ" min="40" max="300" value="100" style="width:90px;vertical-align:middle" /></label></div>
    <div class="v3-sub" id="v3BdInfo">Klicka på ett stag nr (orange fält) – 3D-vyn flyger dit och stången lyser röd.</div>
    <div id="v3BdBody" style="overflow:auto;height:460px;background:#e2e8f0;border:1px solid #cbd5e1;border-radius:6px;padding:6px"></div>`, l3bfClearHl, "380px"); const $ = id => d.querySelector("#" + id), body = $("v3BdBody");
  let cur = 0, cache = new Map(), pagesOf = async i => { if (!cache.has(i)) cache.set(i, await l3bfReadDoc(docs[i].buf)); return cache.get(i); };
  const show = async i => {
    cur = i; body.innerHTML = "<div class=\"v3-sub\">Ritar sidan…</div>"; $("v3BdTabs").querySelectorAll("button").forEach((b, k) => b.classList.toggle("on", k === i));
    try { const pages = await pagesOf(i); body.innerHTML = ""; for (const pg of pages) await l3bfRenderPage(pg, body, 1.0); setZ(); const n = body.querySelectorAll(".bfhot").length, on = [...body.querySelectorAll(".bfhot")].filter(h => l3bf.idx.has(h.dataset.id)).length; $("v3BdInfo").textContent = `${docs[i].name}: ${n} stag, ${on} finns i 3D. Klicka på ett stag nr – 3D-vyn flyger dit och stången lyser röd.`; }
    catch (e) { body.innerHTML = `<div class="v3-sub">Kunde inte öppna ${l3bfEsc(docs[i].name)}: ${l3bfEsc(e.message)}</div>`; }
  };
  const setZ = () => { const z = Number($("v3BdZ").value) || 100; body.querySelectorAll(".bfpg").forEach(w => { w.style.width = z + "%"; }); };
  $("v3BdTabs").innerHTML = docs.map((x, i) => `<button type="button" class="v3-chipbtn" data-i="${i}" style="padding:2px 8px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;cursor:pointer">${l3bfEsc(String(x.name).replace(/\.pdf$/i, ""))}</button>`).join("");
  $("v3BdTabs").onclick = e => { const b = e.target.closest("button[data-i]"); if (b) show(Number(b.dataset.i)); };
  $("v3BdZ").oninput = setZ; $("v3BdXh").onclick = () => { if (typeof l3xhOpen === "function") l3xhOpen(); };
  body.onclick = e => { const h = e.target.closest(".bfhot"); if (!h || !l3bf.idx.has(h.dataset.id)) return; body.querySelectorAll(".bfhot.sel").forEach(x => { x.classList.remove("sel"); x.style.background = "rgba(245,158,11,.22)"; }); body.querySelectorAll(`.bfhot[data-id="${h.dataset.id}"]`).forEach(x => { x.classList.add("sel"); x.style.background = "rgba(239,68,68,.45)"; }); l3bfGoto(h.dataset.id); };
  $("v3BdQ").onkeydown = e => {
    if (e.key !== "Enter") return; const q = $("v3BdQ").value.trim().toUpperCase(), h = [...body.querySelectorAll(".bfhot")].find(x => x.dataset.id === q) || [...body.querySelectorAll(".bfhot")].find(x => x.dataset.id.includes(q));
    if (h) { h.scrollIntoView({ block: "center", inline: "center" }); h.click(); } else if (q && l3bf.idx.has(q)) l3bfGoto(q); else l3Status(`${q} hittades inte på den här ritningen.`, true);
  };
  l3bf.showId = async id => {
    for (let k = 0; k < docs.length; k++) { const i = (cur + k) % docs.length; const pages = await pagesOf(i); if (pages.some(pg => pg.hot.some(h => h.id === id))) { if (i !== cur || !body.querySelector(`.bfhot[data-id="${id}"]`)) await show(i); break; } }
    body.querySelectorAll(".bfhot.sel").forEach(x => { x.classList.remove("sel"); x.style.background = "rgba(245,158,11,.22)"; });
    const hs = [...body.querySelectorAll(`.bfhot[data-id="${id}"]`)]; hs.forEach(x => { x.classList.add("sel"); x.style.background = "rgba(239,68,68,.45)"; x.style.outline = "2px solid #ef4444"; });
    if (hs[0]) hs[0].scrollIntoView({ block: "center", inline: "center", behavior: "smooth" }); return hs.length;
  };
  await show(0);
}
/* Klick i 3D → stagets plats i ritningen: närmaste stång vid träffpunkten markeras röd och ritningen bläddrar dit. */
function l3bfNear(pl, pt) {
  let best = null, bd = 1e9; const P = [pt[0], pt[1], pt[2]];
  (l3bf.idx || new Map()).forEach((e, id) => {
    if (e.pl !== pl) return; const a = e.a, b = e.b, ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
    const t = Math.max(0, Math.min(1, ((P[0] - a[0]) * ab[0] + (P[1] - a[1]) * ab[1] + (P[2] - a[2]) * ab[2]) / L2)), q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t], d = Math.hypot(P[0] - q[0], P[1] - q[1], P[2] - q[2]);
    if (d < bd) { bd = d; best = id; }
  }); return best;
}
async function l3bfFromModel(e) {
  if (!l3 || !l3.renderer || !(typeof placements !== "undefined" && placements.some(p => p.bf))) return;
  const hit = l3Ray(e, [...l3.placeMeshes.values()])[0]; if (!hit) return;
  let o = hit.object; while (o && !o.userData.placeId) o = o.parent; const pl = o && placements.find(p => p.id === o.userData.placeId); if (!pl || !pl.bf) return;
  l3bf.idx = l3bfIndex(); const O = l3.O, id = l3bfNear(pl, [hit.point.x + O[0], hit.point.y + O[1], hit.point.z + O[2]]); if (!id) return;
  l3bfHighlight(l3bf.idx.get(id)); l3Render();
  const info = ((l3bf.idx.get(id).pl.m.bfp ? [l3bf.idx.get(id).pl.m.bfp] : (l3bf.idx.get(id).pl.m.parts || []).map(q => q.m && q.m.bfp).filter(Boolean)).find(b => b[0][1] === id) || []), g = k => (info.find(x => x[0] === k) || [])[1];
  l3Status(`${id} · ${g("Typ") || ""} ${g("Dimension stång mm") || ""} · ${g("Längd m") != null ? g("Längd m") + " m" : ""} – visas i ritningen`);
  if (!document.getElementById("v3BoltDoc")) await l3bfOpenDocs(null, true);
  if (l3bf.showId) await l3bf.showId(id);
}
let l3bfClickInit = false;
function l3bfWatch() {
  if (l3bfClickInit || typeof l3 === "undefined" || !l3 || !l3.renderer) return; l3bfClickInit = true; const cv = l3.renderer.domElement; let dn = null;
  cv.addEventListener("pointerdown", e => { dn = { x: e.clientX, y: e.clientY, b: e.button }; }, true);
  cv.addEventListener("pointerup", e => { if (dn && dn.b === 0 && Math.hypot(e.clientX - dn.x, e.clientY - dn.y) < 5 && !e.ctrlKey && !e.shiftKey) { try { l3bfFromModel(e); } catch (x) { console.warn(x); } } dn = null; }, true);
}
setInterval(l3bfWatch, 1500);
