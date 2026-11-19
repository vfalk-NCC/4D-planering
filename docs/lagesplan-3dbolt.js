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
const l3bf = { rows: null, files: [], opt: { dir: "down", extra: 0, scale: 4, as: "bar", per: "group", replace: true }, busy: false };

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
    while ((m = reV.exec(r.text))) { const id = m[1]; if (vert.has(id)) warn.push(`${id}: finns flera gånger i ${label} (första används)`); else { if (m[5] == null) warn.push(`${id}: sättdjup saknas i ${label} – 2 m antas`); vert.set(id, { id, x: l3bfN(m[2]), y: l3bfN(m[3]), z: l3bfN(m[4]), len: m[5] == null ? 2 : l3bfN(m[5]), dim: +m[6], guess: m[5] == null }); } }
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
    hor.push({ id, a: l[0].p, b: l[1].p, dim: l[0].dim });
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
/* Grupper: per typ och dimension (eller en per stång). Varje grupp: { name, key, col, bars: [{ id, a, b }] }. */
function l3bfGroups(res, opt) {
  const G = new Map(), add = (kind, dim, id, a, b, note) => { const key = kind + dim; if (!G.has(key)) G.set(key, { key, kind, dim, col: L3BF_COL[key] || "#f59e0b", name: `Bergförankring ${kind === "V" ? "vertikala" : "horisontella"} ⌀${dim}`, bars: [] }); G.get(key).bars.push({ id, a, b, note }); };
  res.vert.forEach(v => { const [a, b] = l3bfEnds("V", v, opt); add("V", v.dim, v.id, a, b, `${v.id}: ${l3bfF(v.len)} m i berg`); });
  res.hor.forEach(h => { const [a, b] = l3bfEnds("H", h, opt), L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); add("H", h.dim, h.id, a, b, `${h.id}: ${l3bfF(L)} m`); });
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
    parts.push({ name: `${b.id} ⌀${g.dim}`, type: "mod:kropp", color: g.col, x: l3bfR3(b.a[0]), y: l3bfR3(b.a[1]), z: l3bfR3(b.a[2]), dz: 0, rot: 0, m: { k: "mesh", pts: lp, faces: c.faces, closed: true } });
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
    const mk = (bars, name) => { const sub = { ...g, bars }, r = l3bfBuild(sub, opt); if (!r.n) return null; const p = modCreate(r.m, r.A0, { name, color: g.col, snapshot: false }); p.area = "Bergförankring"; p.bf = { kind: g.kind, dim: g.dim, n: r.n, as: opt.as };
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
function l3bfOpen() {
  const o = l3bf.opt, esc = typeof escHtml === "function" ? escHtml : s => String(s);
  const d = l3Dlg("v3Bolt", "Bergförankring från PDF", `
    <div class="v3-sub">Välj ritningarnas tabell-PDF:er (flera på en gång går bra). Vertikala (BV…) och horisontella (BH…) bergförankringar läses ut och modelleras in med riktiga koordinater.</div>
    <input type="file" id="v3BfFile" accept=".pdf,application/pdf" multiple />
    <div id="v3BfRes" class="v3-sub" style="margin:8px 0"></div>
    <div id="v3BfOpt" class="hidden">
      <label class="v3-row">Vertikala stänger går <select id="v3BfDir"><option value="down">neråt från startpunkten</option><option value="up">uppåt från startpunkten</option></select></label>
      <label class="v3-row">Extra längd ovanför startpunkten (m) <input type="number" id="v3BfExtra" step="0.1" min="0" value="${o.extra}" style="width:70px" /></label>
      <label class="v3-row">Visa som <select id="v3BfAs"><option value="bar">Stång (⌀25 / ⌀32)</option><option value="hole">Borrhål (⌀45 / ⌀55)</option></select></label>
      <label class="v3-row">Förstora diametern <input type="number" id="v3BfScale" step="1" min="1" max="50" value="${o.scale}" style="width:60px" /> ×  <em>(så att de syns i 3D)</em></label>
      <label class="v3-row">Skapa <select id="v3BfPer"><option value="group">en grupp per typ och dimension (Dela upp ger enskilda)</option><option value="bar">ett objekt per stång</option></select></label>
      <label class="v3-row"><input type="checkbox" id="v3BfRep" ${o.replace ? "checked" : ""} /> Ersätt tidigare bergförankring</label>
      <div class="an-actions"><button type="button" id="v3BfGo">⚓ Skapa i 3D</button><button type="button" id="v3BfCsv">Tabell (CSV)</button></div>
    </div>`);
  const $ = id => d.querySelector("#" + id);
  $("v3BfDir").value = o.dir; $("v3BfAs").value = o.as; $("v3BfPer").value = o.per;
  const sync = () => { o.dir = $("v3BfDir").value; o.extra = Math.max(0, Number($("v3BfExtra").value) || 0); o.as = $("v3BfAs").value; o.scale = Math.max(1, Number($("v3BfScale").value) || 1); o.per = $("v3BfPer").value; o.replace = $("v3BfRep").checked; };
  ["v3BfDir", "v3BfExtra", "v3BfAs", "v3BfScale", "v3BfPer", "v3BfRep"].forEach(i => { $(i).onchange = sync; });
  $("v3BfFile").onchange = async e => {
    const files = [...e.target.files]; if (!files.length) return; const box = $("v3BfRes"); box.textContent = "Läser tabellerna…";
    try {
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
    try { const r = l3bfCreate(l3bf.rows, o); l3bfFly(l3bf.rows); l3Status(`${r.n} bergförankringar modellerade (${r.groups.map(g => `${g.n} st ${g.name.replace("Bergförankring ", "")}`).join(", ")}). Ctrl+Z ångrar. Mapp: Bergförankring.`); l3DlgClose("v3Bolt"); }
    catch (err) { l3Status("Kunde inte skapa bergförankringarna: " + err.message, true); }
  };
  $("v3BfCsv").onclick = () => { if (!l3bf.rows) return; sync(); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([l3bfCsv(l3bf.rows, o)], { type: "text/csv" })); a.download = "bergforankring.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
}
