/* Smarta 3D-objekt (Victor 2026-10-22: "lägg in dom där i samma grupp som bemanningen … skapa mappar/grupper … mer smarta 3d-objekt som jag kan tänkas behöva").
   Samma idé som bemanningen: en vanlig placering (typ "sm:<nyckel>") med egna fält, ritad som enkla raka prismor + en skylt med text som riktig geometri,
   som följer med i IFC-exporten (place3d.js) med fälten som egenskaper. Biblioteket (mapparna i 3D-biblioteket) går att flytta mellan som vanligt.
   Skylten (smCard) är gemensam: färgat huvud, valfri stor siffra till vänster, rader med liten etikett + värde, valfri framdriftsstapel. */
const SM_GROUPS = ["Personal", "Logistik", "Lyft & montage", "Risk & säkerhet", "Kvalitet & uppföljning"];
const smF = (p, k, d = "") => { const v = p.f && p.f[k]; return v == null || v === "" ? d : v; };
const smN = (p, k, d = 0) => { const v = Number(String(smF(p, k, d)).replace(",", ".")); return isFinite(v) ? v : d; };
const smFmt = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace(".", ",");
const SM_MON = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"], SM_WD = ["sön", "mån", "tis", "ons", "tor", "fre", "lör"];
const smDay = iso => { const d = new Date(iso + "T00:00:00"); return isNaN(d) ? String(iso) : `${SM_WD[d.getDay()]} ${d.getDate()} ${SM_MON[d.getMonth()]}`; };
/* Datum som objektet gäller (Från/Till = placeringens 4D-period, som också styr när det syns): "mån 19 okt 2026" eller "mån 19 okt – fre 23 okt 2026". */
function smDateText(p) { const a = p.start || "", b = p.end || ""; if (!a && !b) return ""; const x = a || b, y = (b && a && b !== a) ? b : ""; return y ? `${smDay(a)} – ${smDay(b)} ${String(b).slice(0, 4)}` : `${smDay(x)} ${String(x).slice(0, 4)}`; }
function smDateFieldsHtml(p) {
  return `<div class="v3-grid"><label><span>Gäller från</span><input type="date" data-gd="start" value="${p.start || ""}" /></label><label><span>Gäller till</span><input type="date" data-gd="end" value="${p.end || ""}" /></label></div><div class="v3-sub">Datumet står på skylten och styr när objektet syns i 4D.</div>`;
}
function smDateBind(side, p, redraw) { side.querySelectorAll("[data-gd]").forEach(el => { el.onchange = () => { placeSnapshot(); p[el.dataset.gd] = el.value; placeTouch(p); redraw(); }; }); }
const SM_ST = { Beställd: "#f59e0b", "På väg": "#3b82f6", Levererad: "#22c55e", Öppen: "#ef4444", Pågår: "#f59e0b", Åtgärdad: "#22c55e", Planerad: "#94a3b8", Klar: "#22c55e" };

/* ---- Skylten ---------------------------------------------------------------------------------------------------------------------------------- */
/* Geometrin (vit platta, färgat huvud, stolpar, text som streck) går till IFC. I 3D-editorn ersätts texten av en skarp textur med riktig typografi (smSignMesh) – samma mått och samma rader. */
function smCard(ctx, s) {
  const { parts, W, add, z } = ctx, TW = { loc: [], faces: [] }, TG = { loc: [], faces: [] }, TD = { loc: [], faces: [] }, wd = t => ifcTextStrokes(t).width / 6;
  const head = String(s.title).toUpperCase(), hs0 = 0.22, colW = s.left ? 0.95 : 0, vs = 0.2, lh = 0.3, rows = (s.rows || []).filter(r => r && r[1] !== undefined).map(([lab, val, o]) => [String(lab).toUpperCase(), (String(val || "").trim() ? crewWrap(String(val), 30) : []), o || {}]);
  const blk = ls => 0.13 + 0.08 + vs + (Math.max(1, ls.length) - 1) * lh + 0.2, barH = s.bar ? 0.34 : 0;
  const need = Math.max(wd(head) * hs0 + 0.4 + (s.icon ? 0.45 : 0), colW + 0.5 + Math.max(2.0, ...rows.flatMap(r => r[1].map(l => wd(l.toUpperCase()) * vs + 0.1))));
  const w2 = Math.max(1.7, need / 2), hdr = 0.52, bodyH = Math.max(1.02, 0.12 + rows.reduce((a, r) => a + blk(r[1]), 0) + barH + 0.04), hh = hdr + bodyH, zb = s.zb == null ? 2.45 : s.zb, b0 = s.b0 == null ? -1.2 : s.b0;
  const rect = (a0, a1, b1, b2) => [[a0, b1], [a1, b1], [a1, b2], [a0, b2]].map(([a, b]) => W(a, b));
  add(rect(-w2 + 0.15, -w2 + 0.23, b0 - 0.03, b0 + 0.01), 0, zb + 0.02, "#6b7280"); add(rect(w2 - 0.23, w2 - 0.15, b0 - 0.03, b0 + 0.01), 0, zb + 0.02, "#6b7280");
  add(rect(-w2 - 0.05, w2 + 0.05, b0 - 0.005, b0 + 0.04), zb - 0.05, zb + hh + 0.05, "#cbd5e1", { unlit: true, card: true });
  add(rect(-w2, w2, b0 - 0.03, b0 + 0.01), zb, zb + hh, "#ffffff", { unlit: true, card: true });
  add(rect(-w2, w2, b0 - 0.035, b0 + 0.012), zb + bodyH, zb + hh, s.color || "#2563eb", { unlit: true, card: true });
  if (s.left) add(rect(-w2 + colW + 0.25, -w2 + colW + 0.27, b0 - 0.035, b0 + 0.012), zb + 0.15, zb + bodyH - 0.12, "#d1d5db", { unlit: true, card: true });
  const bT = b0 - 0.05, ax = -w2 + 0.2, rx = s.left ? -w2 + colW + 0.45 : ax, hx = ax + (s.icon ? 0.45 : 0); let y = zb + bodyH - 0.12; const lay = [];
  crewText(TW, head, hs0, hx, zb + bodyH + (hdr - hs0) / 2, bT, "l", true);
  if (s.left) { crewText(TG, String(s.left[0]).toUpperCase(), 0.13, ax, zb + bodyH - 0.3, bT, "l", false); crewText(TD, String(s.left[1]), 0.44, ax, zb + bodyH - 0.86, bT, "l", true); }
  rows.forEach(([lab, ls]) => { const lb = y - 0.13; crewText(TG, lab, 0.13, rx, lb, bT, "l", false);
    if (ls.length) ls.forEach((l, i) => crewText(TD, l.toUpperCase(), vs, rx, lb - 0.08 - vs - i * lh, bT, "l", i === 0 && ls.length === 1)); else crewText(TG, "–", 0.2, rx, lb - 0.08 - vs, bT, "l", false);
    lay.push({ label: lab, lines: ls, zl: lb, zv: lb - 0.08 - vs, lh }); y -= blk(ls); });
  let barSpec = null; if (s.bar) { const bw = w2 * 2 - 0.5, bx = -w2 + 0.25, pc = Math.max(0, Math.min(1, s.bar.pct)); add(rect(bx, bx + bw, b0 - 0.036, b0 + 0.012), zb + 0.14, zb + 0.14 + 0.16, "#e5e7eb", { unlit: true, card: true }); if (pc > 0.01) add(rect(bx, bx + bw * pc, b0 - 0.04, b0 + 0.012), zb + 0.14, zb + 0.30, s.bar.color || "#22c55e", { unlit: true, card: true }); barSpec = { x: bx, w: bw, zc: zb + 0.22, h: 0.16, pc, color: s.bar.color || "#22c55e" }; }
  [[TW, "#ffffff"], [TG, "#6b7280"], [TD, "#111827"]].forEach(([T2, color]) => { if (!T2.faces.length) return;
    const pts2 = T2.loc.map(([a, b2, zz]) => { const w = W(a, b2); return [w[0], w[1], z + zz]; }), xs = pts2.map(q => q[0]), ys = pts2.map(q => q[1]), zs = pts2.map(q => q[2]);
    parts.push({ tris: { pts: pts2, faces: T2.faces }, poly: [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]], z0: Math.min(...zs), z1: Math.max(...zs), role: "body", transp: 0, color, unlit: true, card: true }); });
  // pseudo-del för 3D-editorns texturskylt (hoppas över i IFC)
  const c0 = W(0, b0 - 0.05), ea = W(1, 0), eb = W(0, 0), cp = rect(-w2, w2, b0 - 0.05, b0 - 0.04);
  parts.push({ sign: { title: String(s.title), color: s.color || "#2563eb", icon: s.icon || "", left: s.left || null, rows: lay, bar: barSpec, w: w2 * 2, h: hh, hdr, bodyH, colW, zb, z, cx: c0[0], cy: c0[1], ax: ea[0] - eb[0], ay: ea[1] - eb[1], ts: hs0, vs, w2, footer: s.footer || "" }, poly: cp, z0: z + zb, z1: z + zb + hh, role: "sign", transp: 0, color: "#ffffff" });
}
/* Fri text (stor, mitt i en skiva): används av vägskyltar och höjdpunkter. */
function smText(ctx, text, size, a, zc, b, color, bold) {
  const T = { loc: [], faces: [] }; crewText(T, String(text).toUpperCase(), size, a, zc - size / 2, b, "c", bold); if (!T.faces.length) return;
  const pts = T.loc.map(([x, y, zz]) => { const w = ctx.W(x, y); return [w[0], w[1], ctx.z + zz]; }), xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), zs = pts.map(q => q[2]);
  ctx.parts.push({ tris: { pts, faces: T.faces }, poly: [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]], z0: Math.min(...zs), z1: Math.max(...zs), role: "body", transp: 0, color, unlit: true });
}

/* ---- Typerna ---------------------------------------------------------------------------------------------------------------------------------- */
const smKeys = () => Object.keys(SM);
function smartLib(type) {
  const k = String(type).slice(3), d = SM[k]; if (!d) return { group: "Etablering", label: "Smart objekt (saknas)", color: "#64748b", smart: true, key: k, L: 1, B: 1, H: 1 };
  return { group: d.group, label: d.label, color: d.color, smart: true, key: k, L: d.L || 0, B: d.B || 0, H: d.H || 1, R: d.R || 0, fence: !!d.path, title: d.label };
}
const smIsType = t => String(t || "").startsWith("sm:");
function smartInit(p) { const d = SM[String(p.type).slice(3)]; if (!d) return; p.f = {}; (d.fields || []).forEach(([k, , , def]) => { p.f[k] = def; }); }
/* Byggkontexten: lokala hjälpare (plan i objektets egna axlar a/b, z uppåt) och formsamlingar (TK, place-geo.js) per färg/material som slås ihop vid flush(). */
function smMakeCtx(p, z, col) {
  const parts = [], Ts = new Map(), W = (a, b) => placeToWorld(p, a, b);
  const add = (pl, z0, z1, color, extra) => parts.push({ poly: pl, z0: z + z0, z1: z + z1, role: "body", transp: 0, color: color || col, ...(extra || {}) });
  const ctx = { parts, W, add, z, p, col,
    rect: (a0, a1, b0, b1) => [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, b]) => W(a, b)),
    oct: (r, n = 8, ox = 0, oy = 0) => Array.from({ length: n }, (_, i) => { const t = Math.PI / n + i * 2 * Math.PI / n; return W(ox + r * Math.cos(t), oy + r * Math.sin(t)); }),
    T: (color, o) => { o = o || {}; const k = color + "|" + (o.unlit ? 1 : 0) + "|" + (o.transp || 0) + "|" + (o.role || "") + "|" + (o.shin == null ? "" : o.shin) + "|" + (o.metal == null ? "" : o.metal) + "|" + (o.rough == null ? "" : o.rough); if (!Ts.has(k)) Ts.set(k, TK.new({ color, ...o })); return Ts.get(k); },
    box: (color, cx, cy, cz, sx, sy, sz, rot, b, o) => TK.add(ctx.T(color, o), TK.box(sx, sy, sz, b || 0, (o && o.seg) || 2), cx, cy, cz, rot),
    cyl: (color, axis, cx, cy, cz, r0, r1, len, seg, rot, o) => TK.add(ctx.T(color, o), TK.cyl(axis, r0, r1, len, seg || 12), cx, cy, cz, rot),
    sph: (color, cx, cy, cz, rx, ry, rz, seg, rings, rot, o) => TK.add(ctx.T(color, o), TK.sphere(rx, ry, rz, seg || 12, rings || 7), cx, cy, cz, rot),
    ecyl: (color, cx, cy, cz, rx0, ry0, rx1, ry1, len, seg, rot, o) => TK.add(ctx.T(color, o), TK.ecyl(rx0, ry0, rx1, ry1, len, seg || 12), cx, cy, cz, rot),
    lathe: (color, profile, cx, cy, cz, seg, rot, o) => TK.add(ctx.T(color, o), TK.lathe(profile, seg || 14), cx, cy, cz, rot),
    rod: (color, a, b, r0, r1, seg, o) => TK.add(ctx.T(color, o), TK.rod(a, b, r0, r1 == null ? r0 : r1, seg || 8), 0, 0, 0),
    prism: (color, poly, z0, z1, o) => TK.add(ctx.T(color, o), TK.prism(poly, z0, z1), 0, 0, 0),
    card: s => smCard(ctx, ctx.withDate(s)), withDate: s => s,
    flush: () => { Ts.forEach(T => { if (!T.faces.length) return; const pts = T.loc.map(([a, b, zz]) => { const w = W(a, b); return [w[0], w[1], z + zz]; }), xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), zs = pts.map(q => q[2]);
      parts.push({ tris: { pts, faces: T.faces, sg: T.sg }, poly: [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]], z0: Math.min(...zs), z1: Math.max(...zs), role: T.role || "body", transp: T.transp || 0, color: T.color, unlit: !!T.unlit, mat: { shin: T.shin, metal: T.metal, rough: T.rough } }); }); Ts.clear(); return parts; } };
  return ctx;
}
function smartParts(p, z) {
  const d = SM[String(p.type).slice(3)]; if (!d) return [];
  const lib = placeLib(p.type) || {}, col = p.color || lib.color || d.color, ctx = smMakeCtx(p, z, col), dt = smDateText(p), parts = ctx.parts, add = ctx.add, W = ctx.W;
  ctx.withDate = s => dt ? { ...s, rows: [...(s.rows || []), ["Gäller", dt]] } : s;
  ctx.cardAt = (pt, s) => { const c2 = { ...ctx, W: (a, b) => [pt[0] + a, pt[1] + b], z: (Number(pt[2]) || 0) + (Number(p.dz) || 0) }; c2.add = (pl, z0, z1, color, extra) => parts.push({ poly: pl, z0: c2.z + z0, z1: c2.z + z1, role: "body", transp: 0, color: color || col, ...(extra || {}) }); smCard(c2, ctx.withDate(s)); };
  ctx.pin = hex => { add(ctx.oct(0.2, 10), 0, 0.06, "#374151"); add(ctx.rect(-0.03, 0.03, -0.03, 0.03), 0.06, 1.2, "#9ca3af"); add(ctx.oct(0.22, 10), 1.2, 1.32, hex); add(ctx.oct(0.17, 10), 1.32, 1.42, hex); add(ctx.oct(0.1, 8), 1.42, 1.48, hex); };
  ctx.reach = (r, color) => parts.push({ poly: Array.from({ length: 64 }, (_, i) => W(r * Math.cos(i * 2 * Math.PI / 64), r * Math.sin(i * 2 * Math.PI / 64))), z0: ctx.z, z1: ctx.z + 0.04, role: "reach", transp: 0.8, color });
  ctx.path = (w, color, h, arrows) => { const P = p.pts || []; for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], dd = Math.hypot(b[0] - a[0], b[1] - a[1]); if (dd < 0.01) continue; const ux = (b[0] - a[0]) / dd, uy = (b[1] - a[1]) / dd, z0 = Math.min(a[2] || 0, b[2] || 0) + (Number(p.dz) || 0);
      parts.push({ poly: [[a[0] + uy * w, a[1] - ux * w], [b[0] + uy * w, b[1] - ux * w], [b[0] - uy * w, b[1] + ux * w], [a[0] - uy * w, a[1] + ux * w]], z0, z1: z0 + h, role: "body", transp: 0.25, color });
      if (arrows) for (let s = 1.5; s < dd - 0.8; s += 3) { const cx = a[0] + ux * s, cy = a[1] + uy * s, q = Math.min(w * 0.7, 0.5); parts.push({ poly: [[cx + ux * q, cy + uy * q], [cx - ux * q * 0.6 + uy * q, cy - uy * q * 0.6 - ux * q], [cx - ux * q * 0.2, cy - uy * q * 0.2], [cx - ux * q * 0.6 - uy * q, cy - uy * q * 0.6 + ux * q]], z0: z0 + h, z1: z0 + h + 0.02, role: "body", transp: 0, color: "#ffffff" }); }
      else if (w > 0.8) { const dash = Math.min(w * 0.06, 0.12); for (let s = 0.5; s < dd - 1; s += 3) parts.push({ poly: [[a[0] + ux * s + uy * dash, a[1] + uy * s - ux * dash], [a[0] + ux * (s + 1.5) + uy * dash, a[1] + uy * (s + 1.5) - ux * dash], [a[0] + ux * (s + 1.5) - uy * dash, a[1] + uy * (s + 1.5) + ux * dash], [a[0] + ux * s - uy * dash, a[1] + uy * s + ux * dash]], z0: z0 + h, z1: z0 + h + 0.02, role: "body", transp: 0, color: "#fde047" }); } } };
  d.build(p, ctx); ctx.flush(); return parts;
}
function smartProps(p) {
  const d = SM[String(p.type).slice(3)]; if (!d) return []; const out = [["Objekttyp", d.label], ["Gäller datum", smDateText(p)]];
  (d.fields || []).forEach(([k, lab]) => { out.push([lab, smF(p, k)]); });
  if (p.type === "sm:gjutetapp") { const v = smN(p, "vol", 0); out.push(["Antal bilar (ca)", Math.ceil(v / Math.max(1, smN(p, "bil", 8)))], ["Pumptid timmar (ca)", Math.round(v / Math.max(1, smN(p, "kap", 30)) * 10) / 10]); }
  return out;
}
/* ---- Panel i 3D-editorn ----------------------------------------------------------------------------------------------------------------------- */
function smartSideHtml(p) {
  const d = SM[String(p.type).slice(3)]; if (!d || !(d.fields || []).length) return "";
  const esc = typeof escHtml === "function" ? escHtml : s => String(s);
  const row = ([k, lab, type]) => { const v = smF(p, k); const o = Array.isArray(type) ? type : type === "kran" ? SM_KRAN() : null;
    if (o) return `<label class="v3-field"><span>${esc(lab)}</span><select data-smf="${k}">${type === "kran" ? `<option value="">–</option>` : ""}${o.map(x => `<option${x === v ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>`;
    return `<label class="v3-field"><span>${esc(lab)}</span><input type="${type === "date" ? "date" : "text"}" data-smf="${k}" ${type === "num" ? 'inputmode="decimal"' : ""} value="${esc(v)}" /></label>`; };
  return `<div class="v3-sec">${esc(d.label)}</div>${d.fields.map(row).join("")}${smDateFieldsHtml(p)}`;
}
function smartBindSide(side, p, redraw) {
  const d = SM[String(p.type).slice(3)]; if (!d) return;
  smDateBind(side, p, redraw);
  let lt = 0; side.querySelectorAll("[data-smf]").forEach(el => { el.onchange = () => { placeSnapshot(); p.f = p.f || {}; p.f[el.dataset.smf] = el.value; placeTouch(p); redraw(); };
    if (el.tagName === "INPUT") el.addEventListener("input", () => { p.f = p.f || {}; p.f[el.dataset.smf] = el.value; clearTimeout(lt); lt = setTimeout(() => { placeTouch(p); if (typeof l3RebuildOne === "function") { l3RebuildOne(p); if (typeof l3Changed === "function") l3Changed(); } }, 250); }); });
}

/* ---- Snygg rullista (sök + val) i stället för vanlig <select>/<datalist> (Victor 2026-10-22: "dropdown ska vara snyggare") ------------------------------------------------ */
/* Fält med sökbar lista: items = [{ v, t (rubrik), s (undertext), g (grupp) }]. onPick(item) vid val, onText(text) när man skriver fritt. */
function smComboBind(input, getItems, onPick, onText) {
  const esc = typeof escHtml === "function" ? escHtml : s => String(s); let box = null, items = [], cur = -1;
  const close = () => { if (box) { box.remove(); box = null; } };
  const render = () => {
    const q = input.value.trim().toLowerCase(); items = getItems().filter(it => !q || (it.t + " " + (it.s || "") + " " + (it.g || "")).toLowerCase().includes(q)).slice(0, 80); cur = Math.min(cur, items.length - 1);
    if (!box) { box = document.createElement("div"); box.className = "v3-cb-list"; document.body.appendChild(box); box.addEventListener("mousedown", e => { const el = e.target.closest("[data-i]"); if (el) { e.preventDefault(); pick(+el.dataset.i); } }); }
    const r = input.getBoundingClientRect(); box.style.left = Math.max(4, Math.min(innerWidth - 330, r.left)) + "px"; box.style.width = Math.min(380, Math.max(260, r.width)) + "px"; const below = innerHeight - r.bottom; box.style.maxHeight = Math.max(160, Math.min(340, below > 200 ? below - 12 : r.top - 12)) + "px"; if (below > 200) { box.style.top = r.bottom + 2 + "px"; box.style.bottom = ""; } else { box.style.bottom = innerHeight - r.top + 2 + "px"; box.style.top = ""; }
    let last = null; box.innerHTML = items.length ? items.map((it, i) => (it.g && it.g !== last ? (last = it.g, `<div class="v3-cb-g">${esc(it.g)}</div>`) : "") + `<div class="v3-cb-it${i === cur ? " on" : ""}" data-i="${i}"><b>${esc(it.t)}</b>${it.s ? `<small>${esc(it.s)}</small>` : ""}</div>`).join("") : `<div class="v3-cb-none">Inga träffar – texten du skriver används som den är</div>`;
    const on = box.querySelector(".on"); if (on) on.scrollIntoView({ block: "nearest" });
  };
  const pick = i => { const it = items[i]; if (!it) return; close(); input.value = it.t; onPick(it); };
  input.addEventListener("focus", () => { cur = -1; render(); }); input.addEventListener("click", () => { if (!box) render(); });
  input.addEventListener("input", () => { cur = -1; render(); if (onText) onText(input.value); });
  input.addEventListener("keydown", e => { if (!box) { if (e.key === "ArrowDown") { render(); e.preventDefault(); } return; } if (e.key === "ArrowDown") { cur = Math.min(items.length - 1, cur + 1); render(); e.preventDefault(); } else if (e.key === "ArrowUp") { cur = Math.max(0, cur - 1); render(); e.preventDefault(); } else if (e.key === "Enter") { if (cur >= 0) { pick(cur); e.preventDefault(); } else close(); } else if (e.key === "Escape") { close(); e.stopPropagation(); } });
  input.addEventListener("blur", () => setTimeout(close, 120));
}
/* Gantt-aktiviteterna i 3D-editorn (samma som Gantten: t.ex. "Linje I - H gjutning"), entreprenörens egna först. */
function smGanttActs() { try { return typeof l3plActs === "function" ? l3plActs(false) : []; } catch (e) { return []; } }
function smActItems(contractor) {
  const acts = smGanttActs(), fmt = a => `${String(a.area || "").split(" / ").pop()} · ${a.start || ""}${a.end && a.end !== a.start ? " – " + a.end : ""}${a.contractor ? " · " + a.contractor : ""}`, mk = (a, g) => ({ v: a.key, t: a.name, s: fmt(a), g, a });
  const mine = contractor ? acts.filter(a => a.contractor === contractor) : [], rest = acts.filter(a => !mine.includes(a));
  return [...mine.map(a => mk(a, "Entreprenörens aktiviteter")), ...rest.map(a => mk(a, mine.length ? "Övriga aktiviteter" : "Aktiviteter i Gantten"))];
}
function smAreaItems() {
  const m = new Map(); smGanttActs().forEach(a => { const nm = crewDash(String(a.area || "").split(" / ").pop()); if (nm && nm !== "(utan område)") m.set(nm, (m.get(nm) || 0) + 1); });
  return [...m.keys()].sort((a, b) => a.localeCompare(b, "sv", { numeric: true })).map(n => ({ v: n, t: n, s: m.get(n) + " aktiviteter" }));
}

/* ---- Ritning i 3D-editorn: PBR-material som mobilkranen (miljöreflex + kantljus) och skarp texturskylt ---------------------------------------------------------------------- */
const SM_ICONS = {
  hat: c => { c.beginPath(); c.arc(0, 0.02, 0.5, Math.PI, 0); c.lineTo(0.62, 0.2); c.lineTo(-0.62, 0.2); c.closePath(); c.fill(); c.fillRect(-0.12, -0.52, 0.24, 0.22); },
  truck: c => { c.fillRect(-0.62, -0.32, 0.8, 0.5); c.fillRect(0.2, -0.12, 0.42, 0.3); c.beginPath(); c.arc(-0.36, 0.28, 0.14, 0, 7); c.arc(0.38, 0.28, 0.14, 0, 7); c.fill(); },
  warn: c => { c.beginPath(); c.moveTo(0, -0.58); c.lineTo(0.62, 0.45); c.lineTo(-0.62, 0.45); c.closePath(); c.fill(); },
  pin: c => { c.beginPath(); c.arc(0, -0.18, 0.34, 0, 7); c.fill(); c.beginPath(); c.moveTo(-0.26, 0.04); c.lineTo(0.26, 0.04); c.lineTo(0, 0.6); c.fill(); },
  crane: c => { c.fillRect(-0.55, 0.3, 0.9, 0.2); c.save(); c.rotate(-0.7); c.fillRect(-0.05, -0.75, 0.16, 1.0); c.restore(); c.fillRect(0.42, -0.2, 0.05, 0.55); c.fillRect(0.33, 0.28, 0.23, 0.12); },
  check: c => { c.lineWidth = 0.18; c.lineCap = "round"; c.lineJoin = "round"; c.beginPath(); c.moveTo(-0.5, 0.02); c.lineTo(-0.14, 0.4); c.lineTo(0.52, -0.4); c.stroke(); },
  box: c => { c.fillRect(-0.55, -0.4, 1.1, 0.8); },
  info: c => { c.beginPath(); c.arc(0, 0, 0.6, 0, 7); c.fill(); },
  flag: c => { c.fillRect(-0.45, -0.6, 0.1, 1.2); c.beginPath(); c.moveTo(-0.35, -0.55); c.lineTo(0.55, -0.3); c.lineTo(-0.35, 0.05); c.fill(); },
};
function smRoundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
/* Skylten som bild: rundat kort med mjuk skugga, färgat huvud med ikon, stor siffra, etiketter och värden i riktig typografi, framdriftsstapel. Mått och rader = samma som geometrin. */
function smSignCanvas(sp) {
  const m = 0.1, ppm = Math.min(300, 2048 / (sp.w + 2 * m), 2048 / (sp.h + 2 * m)), cw = Math.round((sp.w + 2 * m) * ppm), ch = Math.round((sp.h + 2 * m) * ppm), cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
  const c = cv.getContext("2d"), FONT = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif', X = a => (a + sp.w / 2 + m) * ppm, Yz = z => (sp.zb + sp.h - z + m) * ppm, R = 0.07 * ppm;
  c.save(); c.shadowColor = "rgba(15,23,42,.38)"; c.shadowBlur = 0.07 * ppm; c.shadowOffsetY = 0.025 * ppm; c.fillStyle = "#fff"; smRoundRect(c, m * ppm, m * ppm, sp.w * ppm, sp.h * ppm, R); c.fill(); c.restore();
  c.save(); smRoundRect(c, m * ppm, m * ppm, sp.w * ppm, sp.h * ppm, R); c.clip();
  const hh = sp.hdr * ppm, g = c.createLinearGradient(0, m * ppm, 0, m * ppm + hh); g.addColorStop(0, sp.color); g.addColorStop(1, sp.color); c.fillStyle = sp.color; c.fillRect(m * ppm, m * ppm, sp.w * ppm, hh);
  const gl = c.createLinearGradient(0, m * ppm, 0, m * ppm + hh); gl.addColorStop(0, "rgba(255,255,255,.22)"); gl.addColorStop(0.55, "rgba(255,255,255,0)"); gl.addColorStop(1, "rgba(0,0,0,.14)"); c.fillStyle = gl; c.fillRect(m * ppm, m * ppm, sp.w * ppm, hh);
  c.fillStyle = "rgba(0,0,0,.10)"; c.fillRect(m * ppm, m * ppm + hh - 0.012 * ppm, sp.w * ppm, 0.012 * ppm);
  // kantlinje och nedre list
  c.fillStyle = sp.color; c.globalAlpha = 0.9; c.fillRect(m * ppm, (m + sp.h) * ppm - 0.035 * ppm, sp.w * ppm, 0.035 * ppm); c.globalAlpha = 1;
  // rubrik + ikon
  const hy = m * ppm + hh / 2; let tx = X(-sp.w2 + 0.2);
  if (sp.icon && SM_ICONS[sp.icon]) { c.save(); c.translate(tx + 0.17 * ppm, hy); c.scale(0.17 * ppm, 0.17 * ppm); c.fillStyle = "rgba(255,255,255,.96)"; c.strokeStyle = "rgba(255,255,255,.96)"; SM_ICONS[sp.icon](c); c.restore(); tx += 0.45 * ppm; }
  c.fillStyle = "#fff"; c.textBaseline = "middle"; c.textAlign = "left"; let fs = 0.255 * ppm; c.font = `700 ${fs}px ${FONT}`; const maxW = X(sp.w2 - 0.2) - tx; while (c.measureText(sp.title).width > maxW && fs > 8) { fs -= 1; c.font = `700 ${fs}px ${FONT}`; }
  c.shadowColor = "rgba(0,0,0,.25)"; c.shadowBlur = 0.02 * ppm; c.shadowOffsetY = 0.008 * ppm; c.fillText(sp.title, tx, hy + 0.005 * ppm); c.shadowColor = "transparent";
  c.textBaseline = "alphabetic";
  const label = (txt, x, y) => { c.fillStyle = "#6b7280"; c.font = `700 ${0.115 * ppm}px ${FONT}`; if ("letterSpacing" in c) c.letterSpacing = (0.012 * ppm) + "px"; c.fillText(String(txt).toUpperCase(), x, y); if ("letterSpacing" in c) c.letterSpacing = "0px"; };
  if (sp.left) { label(sp.left[0], X(-sp.w2 + 0.2), Yz(sp.zb + sp.bodyH - 0.3)); c.fillStyle = "#0f172a"; let nf = 0.52 * ppm; c.font = `800 ${nf}px ${FONT}`; const nw = (sp.colW - 0.1) * ppm; while (c.measureText(sp.left[1]).width > nw && nf > 10) { nf -= 2; c.font = `800 ${nf}px ${FONT}`; } c.fillText(String(sp.left[1]), X(-sp.w2 + 0.2), Yz(sp.zb + sp.bodyH - 0.86 + 0.02));
    c.fillStyle = "#e5e7eb"; c.fillRect(X(-sp.w2 + sp.colW + 0.25), Yz(sp.zb + sp.bodyH - 0.12), 0.018 * ppm, (sp.bodyH - 0.27) * ppm); }
  const rx = sp.left ? X(-sp.w2 + sp.colW + 0.45) : X(-sp.w2 + 0.2);
  sp.rows.forEach(r => { label(r.label, rx, Yz(r.zl)); if (r.lines.length) r.lines.forEach((l, i) => { c.fillStyle = "#0f172a"; c.font = `${r.lines.length === 1 ? 700 : 600} ${0.215 * ppm}px ${FONT}`; c.fillText(l, rx, Yz(r.zv - i * r.lh)); }); else { c.fillStyle = "#9ca3af"; c.font = `600 ${0.2 * ppm}px ${FONT}`; c.fillText("–", rx, Yz(r.zv)); } });
  if (sp.bar) { const b = sp.bar; c.fillStyle = "#e5e7eb"; smRoundRect(c, X(b.x), Yz(b.zc + b.h / 2), b.w * ppm, b.h * ppm, b.h * ppm / 2); c.fill(); if (b.pc > 0.01) { c.fillStyle = b.color; smRoundRect(c, X(b.x), Yz(b.zc + b.h / 2), Math.max(b.h * ppm, b.w * ppm * b.pc), b.h * ppm, b.h * ppm / 2); c.fill(); } }
  c.restore(); c.strokeStyle = "rgba(15,23,42,.16)"; c.lineWidth = Math.max(1, 0.006 * ppm); smRoundRect(c, m * ppm, m * ppm, sp.w * ppm, sp.h * ppm, R); c.stroke();
  return { cv, m };
}
function smSignMesh(p, sp) {
  const { cv, m } = smSignCanvas(sp), tex = new THREE.CanvasTexture(cv); tex.anisotropy = 8; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.encoding = THREE.sRGBEncoding;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.FrontSide, depthWrite: false, toneMapped: false }), w = sp.w + 2 * m, h = sp.h + 2 * m, mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  const X = new THREE.Vector3(sp.ax, sp.ay, 0).normalize(), Yv = new THREE.Vector3(0, 0, 1), Zv = new THREE.Vector3().crossVectors(X, Yv); mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Yv, Zv));
  mesh.position.set(sp.cx, sp.cy, sp.z + sp.zb + sp.h / 2); mesh.renderOrder = 4; mesh.userData.placeId = p.id; mesh.userData.mat0 = { t: true, o: 1, d: false }; mesh.userData.isSign = true; return mesh;
}
/* Gruppen för en bemanning/ett smart objekt i 3D-editorn (anropas av l3PlacementGroup). */
function smEditorBuild(p, grp, parts) {
  const env = typeof l3cEnv === "function" ? l3cEnv() : null;
  crewMergeGroups(parts.filter(x => !x.card), [0, 0, 0]).forEach(G => {
    const geo = crewGroupGeometry(G), mt = G.mat || {}; let mat;
    if (G.unlit) mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(G.color), side: THREE.DoubleSide, transparent: G.transp > 0, opacity: 1 - (G.transp || 0), depthWrite: !(G.transp > 0.5) });
    else { const shin = mt.shin == null ? 25 : mt.shin, metal = mt.metal == null ? (shin >= 80 ? 0.5 : 0.03) : mt.metal, rough = mt.rough == null ? Math.max(0.25, 1 - Math.min(0.8, shin / 130)) : mt.rough;
      mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(G.color), roughness: rough, metalness: metal, envMap: env, envMapIntensity: metal > 0.3 ? 1 : 0.5, side: THREE.DoubleSide, transparent: G.transp > 0, opacity: 1 - (G.transp || 0), depthWrite: !(G.transp > 0.5) }); if (typeof l3cRim === "function") l3cRim(mat); }
    const m = new THREE.Mesh(geo, mat); m.userData.placeId = p.id; m.userData.mat0 = { t: mat.transparent, o: mat.opacity, d: mat.depthWrite }; m.userData.noEdges = true; if (G.reach) m.userData.noHit = true; grp.add(m);
  });
  parts.filter(x => x.sign).forEach(x => { const m = smSignMesh(p, x.sign); m.userData.noEdges = true; grp.add(m); });
}
