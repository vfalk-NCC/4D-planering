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
/* Skylt (kort). s.yaw = vridning i grader runt skyltens mitt, s.at = [a, b] egen plats (fri placering). s.plan = { at:[a,b], yaw } ritar i stället en liggande kopia på marken som läses uppifrån (planvy). */
function smCard(ctx, s) {
  if (s.plan) return smCardFlat(ctx, s);
  if (s.yaw || s.at) { const W0 = ctx.W, b00 = s.b0 == null ? -1.2 : s.b0, cy = Math.cos((s.yaw || 0) * Math.PI / 180), sy = Math.sin((s.yaw || 0) * Math.PI / 180), pa = s.at ? s.at[0] : 0, pb = s.at ? s.at[1] : b00;
    ctx = { ...ctx, W: (a, b) => { const da = a, db = b - b00; return W0(pa + da * cy - db * sy, pb + da * sy + db * cy); } }; ctx.rect = (a0, a1, b0, b1) => [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, b]) => ctx.W(a, b)); }
  const { parts, W, add, z } = ctx, TW = { loc: [], faces: [] }, TG = { loc: [], faces: [] }, TD = { loc: [], faces: [] }, wd = t => ifcTextStrokes(t).width / 6;
  const head = String(s.title).toUpperCase(), hs0 = 0.22, colW = s.left ? Math.max(0.95, wd(String(s.left[1])) * 0.44 + 0.3) : 0, vs = 0.2, lh = 0.3, rows = (s.rows || []).filter(r => r && r[1] !== undefined).map(([lab, val, o]) => [String(lab).toUpperCase(), (String(val || "").trim() ? crewWrap(String(val), 30) : []), o || {}]);
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
/* Liggande skylt: byggs som en vanlig skylt i ett eget system och vrids sedan ned på marken (texten riktad uppåt i planen). */
function smCardFlat(ctx, s) {
  const tmp = { parts: [], p: ctx.p, col: ctx.col, z: 0, W: (a, b) => [a, b], rect: (a0, a1, b0, b1) => [[a0, b0], [a1, b0], [a1, b1], [a0, b1]] };
  tmp.add = (pl, z0, z1, color, extra) => tmp.parts.push({ poly: pl, z0, z1, role: "body", transp: 0, color: color || ctx.col, ...(extra || {}) });
  smCard(tmp, { ...s, plan: null, at: null, yaw: 0, b0: 0, zb: 0 });
  const pl = s.plan, yaw = (pl.yaw || 0) * Math.PI / 180, cy = Math.cos(yaw), sy = Math.sin(yaw), at = pl.at || [0, 0], zg = 0.03;
  let hh = 0; tmp.parts.forEach(q => { if (q.sign) hh = q.sign.h; }); const zc = hh / 2;
  const F = (a, b, zz) => { const X = a, Y = zz - zc, Z = zg - b; return { x: at[0] + X * cy - Y * sy, y: at[1] + X * sy + Y * cy, z: Z }; };
  const bak = (a, b, zz) => { const f = F(a, b, zz), w = ctx.W(f.x, f.y); return [w[0], w[1], ctx.z + f.z]; };
  tmp.parts.forEach(q => {
    if (q.sign) { const c0 = F(0, 0, zc + zc), cc = ctx.W(F(0, 0, zc).x, F(0, 0, zc).y), e1 = ctx.W(F(1, 0, zc).x, F(1, 0, zc).y); parts_push(ctx, { ...q, sign: { ...q.sign, flat: true, cx: cc[0], cy: cc[1], ax: e1[0] - cc[0], ay: e1[1] - cc[1], z: ctx.z + zg + 0.01, zb: 0 }, poly: [cc, cc, cc, cc].map(x => x.slice()), z0: ctx.z + zg, z1: ctx.z + zg + 0.01 }); void c0; return; }
    if (q.tris) { ctx.parts.push({ ...q, tris: { pts: q.tris.pts.map(([a, b, zz]) => bak(a, b, zz)), faces: q.tris.faces, sg: q.tris.sg }, poly: undefined }); const L = ctx.parts[ctx.parts.length - 1], xs = L.tris.pts.map(v => v[0]), ys = L.tris.pts.map(v => v[1]), zs = L.tris.pts.map(v => v[2]); L.poly = [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]]; L.z0 = Math.min(...zs); L.z1 = Math.max(...zs); return; }
    // prisma: rektangel i (a, b) × [z0, z1] → rektangel i (a, z) × tjocklek i b
    const as = q.poly.map(v => v[0]), bs = q.poly.map(v => v[1]), a0 = Math.min(...as), a1 = Math.max(...as), b0 = Math.min(...bs), b1 = Math.max(...bs);
    const poly = [[a0, q.z0], [a1, q.z0], [a1, q.z1], [a0, q.z1]].map(([a, zz]) => { const f = F(a, 0, zz), w = ctx.W(f.x, f.y); return w; });
    const zlo = ctx.z + zg - b1, zhi = ctx.z + zg - b0; ctx.parts.push({ ...q, poly, z0: zlo, z1: Math.max(zhi, zlo + 0.004) });
  });
}
function parts_push(ctx, part) { ctx.parts.push(part); }
/* Fri text (stor, mitt i en skiva): används av vägskyltar och höjdpunkter. */
function smText(ctx, text, size, a, zc, b, color, bold) {
  const T = { loc: [], faces: [] }; crewText(T, String(text).toUpperCase(), size, a, zc - size / 2, b, "c", bold); if (!T.faces.length) return;
  const pts = T.loc.map(([x, y, zz]) => { const w = ctx.W(x, y); return [w[0], w[1], ctx.z + zz]; }), xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), zs = pts.map(q => q[2]);
  ctx.parts.push({ tris: { pts, faces: T.faces }, poly: [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]], z0: Math.min(...zs), z1: Math.max(...zs), role: "body", transp: 0, color, unlit: true });
}

/* ---- Typerna ---------------------------------------------------------------------------------------------------------------------------------- */
const smKeys = () => Object.keys(SM).filter(k => !SM[k].hidden);
const smKeyOf = p => (String(p.type).startsWith("sm:") ? String(p.type).slice(3) : (typeof PLACE_LIB !== "undefined" && PLACE_LIB[p.type] && PLACE_LIB[p.type].smartKey) || "");
const smDef = p => SM[smKeyOf(p)];
function smartLib(type) {
  const k = String(type).slice(3), d = SM[k]; if (!d) return { group: "Etablering", label: "Smart objekt (saknas)", color: "#64748b", smart: true, key: k, L: 1, B: 1, H: 1 };
  return { group: d.group, label: d.label, color: d.color, smart: true, key: k, L: d.L || 0, B: d.B || 0, H: d.H || 1, R: d.R || 0, fence: !!d.path, title: d.label };
}
const smIsType = t => String(t || "").startsWith("sm:");
function smartInit(p) { const d = smDef(p); if (!d) return; p.f = {}; (d.fields || []).forEach(([k, , , def]) => { p.f[k] = def; }); }
/* Byggkontexten: lokala hjälpare (plan i objektets egna axlar a/b, z uppåt) och formsamlingar (TK, place-geo.js) per färg/material som slås ihop vid flush(). */
/* Rundar hörnen i en punktlista (x,y,z) med cirkelbågar med radie r. Radien krymper där segmenten är för korta. closed = sluten kontur. */
function smFillet(P, r, closed) {
  const pts = []; P.forEach(q => { const l = pts[pts.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.005) pts.push([q[0], q[1], q[2] || 0]); });
  if (closed && pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.005) pts.pop();
  if (!(r > 0.01) || pts.length < 3) return pts; const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const b = pts[i]; if (!closed && (i === 0 || i === n - 1)) { out.push(b); continue; }
    const a = pts[(i + n - 1) % n], c = pts[(i + 1) % n], ux = a[0] - b[0], uy = a[1] - b[1], vx = c[0] - b[0], vy = c[1] - b[1], lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy); if (lu < 1e-6 || lv < 1e-6) { out.push(b); continue; }
    const nux = ux / lu, nuy = uy / lu, nvx = vx / lv, nvy = vy / lv, cs = Math.max(-1, Math.min(1, nux * nvx + nuy * nvy)), th = Math.acos(cs); if (th > Math.PI - 0.02 || th < 0.02) { out.push(b); continue; }
    const lim = 0.5 * Math.min(lu, lv) * (closed || (i > 1 && i < n - 2) ? 1 : 2), t = Math.min(r / Math.tan(th / 2), lim), re = t * Math.tan(th / 2), bis = Math.hypot(nux + nvx, nuy + nvy), cx = b[0] + (nux + nvx) / bis * re / Math.sin(th / 2), cy = b[1] + (nuy + nvy) / bis * re / Math.sin(th / 2);
    const s = [b[0] + nux * t, b[1] + nuy * t], e = [b[0] + nvx * t, b[1] + nvy * t]; let a0 = Math.atan2(s[1] - cy, s[0] - cx), a1 = Math.atan2(e[1] - cy, e[0] - cx), da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
    const steps = Math.max(3, Math.ceil(Math.abs(da) / (Math.PI / 14))); for (let k = 0; k <= steps; k++) { const ang = a0 + da * k / steps; out.push([cx + Math.cos(ang) * re, cy + Math.sin(ang) * re, b[2]]); }
  }
  return out;
}
function smMakeCtx(p, z, col) {
  const parts = [], Ts = new Map(), W = (a, b) => placeToWorld(p, a, b);
  const add = (pl, z0, z1, color, extra) => parts.push({ poly: pl, z0: z + z0, z1: z + z1, role: "body", transp: 0, color: color || col, ...(extra || {}) });
  const ctx = { parts, W, add, z, p, col,
    rect: (a0, a1, b0, b1) => [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, b]) => W(a, b)),
    oct: (r, n = 8, ox = 0, oy = 0) => Array.from({ length: n }, (_, i) => { const t = Math.PI / n + i * 2 * Math.PI / n; return W(ox + r * Math.cos(t), oy + r * Math.sin(t)); }),
    T: (color, o) => { o = o || {}; const k = color + "|" + (o.unlit ? 1 : 0) + "|" + (o.transp || 0) + "|" + (o.role || "") + "|" + (o.shin == null ? "" : o.shin) + "|" + (o.metal == null ? "" : o.metal) + "|" + (o.rough == null ? "" : o.rough) + "|" + (o.deco ? 1 : 0); if (!Ts.has(k)) Ts.set(k, TK.new({ color, ...o })); return Ts.get(k); },
    box: (color, cx, cy, cz, sx, sy, sz, rot, b, o) => TK.add(ctx.T(color, Math.min(sx, sy, sz) < 0.06 && [sx, sy, sz].sort((a, b) => a - b)[1] < 0.06 ? { ...(o || {}), deco: true } : o), TK.box(sx, sy, sz, b || 0, (o && o.seg) || 2), cx, cy, cz, rot),
    cyl: (color, axis, cx, cy, cz, r0, r1, len, seg, rot, o) => TK.add(ctx.T(color, o), TK.cyl(axis, r0, r1, len, seg || 12), cx, cy, cz, rot),
    sph: (color, cx, cy, cz, rx, ry, rz, seg, rings, rot, o) => TK.add(ctx.T(color, o), TK.sphere(rx, ry, rz, seg || 12, rings || 7), cx, cy, cz, rot),
    ecyl: (color, cx, cy, cz, rx0, ry0, rx1, ry1, len, seg, rot, o) => TK.add(ctx.T(color, o), TK.ecyl(rx0, ry0, rx1, ry1, len, seg || 12), cx, cy, cz, rot),
    lathe: (color, profile, cx, cy, cz, seg, rot, o) => TK.add(ctx.T(color, o), TK.lathe(profile, seg || 14), cx, cy, cz, rot),
    rod: (color, a, b, r0, r1, seg, o) => TK.add(ctx.T(color, Math.max(r0, r1 == null ? r0 : r1) < 0.02 ? { ...(o || {}), deco: true } : o),   // smala stänger blir linjer i Trimble Connect – de följer inte med i IFC
      TK.rod(a, b, r0, r1 == null ? r0 : r1, seg || 8), 0, 0, 0),
    prism: (color, poly, z0, z1, o) => TK.add(ctx.T(color, o), TK.prism(poly, z0, z1), 0, 0, 0),
    /* Rektangulär balk (bredd w sidled, höjd h vinkelrätt) mellan två punkter – för bommar, saxarmar och tvärstag. */
    beam: (color, a, b, w, h, o) => { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(d[0], d[1], d[2]) || 1e-6, n = d.map(v => v / L); let sd = [-n[1], n[0], 0]; const sl = Math.hypot(sd[0], sd[1]); sd = sl < 1e-6 ? [0, 1, 0] : [sd[0] / sl, sd[1] / sl, 0];
      const u = [n[1] * sd[2] - n[2] * sd[1], n[2] * sd[0] - n[0] * sd[2], n[0] * sd[1] - n[1] * sd[0]], pts = []; [a, b].forEach(P => [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([i, j]) => pts.push([P[0] + sd[0] * i * w / 2 + u[0] * j * h / 2, P[1] + sd[1] * i * w / 2 + u[1] * j * h / 2, P[2] + sd[2] * i * w / 2 + u[2] * j * h / 2])));
      const g = { pts, faces: [[1, 3, 2], [1, 4, 3], [5, 6, 7], [5, 7, 8], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 4, 8], [3, 8, 7], [4, 1, 5], [4, 5, 8]] }; if (TK.volume(g) < 0) g.faces = g.faces.map(f => [f[0], f[2], f[1]]); return TK.add(ctx.T(color, o), g, 0, 0, 0); },
    card: s => smCard(ctx, ctx.withDate(s)), withDate: s => s,
    flush: () => { Ts.forEach(T => { if (!T.faces.length) return; const pts = T.loc.map(([a, b, zz]) => { const w = W(a, b); return [w[0], w[1], z + zz]; }), xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), zs = pts.map(q => q[2]);
      parts.push({ tris: { pts, faces: T.faces, sg: T.sg }, poly: [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]], z0: Math.min(...zs), z1: Math.max(...zs), role: T.role || "body", transp: T.transp || 0, color: T.color, unlit: !!T.unlit, deco: !!T.deco, mat: { shin: T.shin, metal: T.metal, rough: T.rough } }); }); Ts.clear(); return parts; } };
  return ctx;
}
function smartParts(p, z) {
  const d = smDef(p); if (!d) return [];
  const lib = placeLib(p.type) || {}, col = p.color || lib.color || d.color, ctx = smMakeCtx(p, z, col), dt = smDateText(p), parts = ctx.parts, add = ctx.add, W = ctx.W;
  ctx.withDate = s => dt ? { ...s, rows: [...(s.rows || []), ["Gäller", dt]] } : s;
  ctx.card = s => { smCard(ctx, ctx.withDate(smSignSpec(p, s))); if (p.signPlan) smCard(ctx, ctx.withDate({ ...s, plan: { at: Array.isArray(p.planPos) && isFinite(p.planPos[0]) ? [Number(p.planPos[0]), Number(p.planPos[1])] : [0, (s.b0 == null ? -1.2 : s.b0) - 2.4], yaw: Number(p.planYaw) || 0 } })); };
  ctx.cardAt = (pt, s) => { const c2 = { ...ctx, W: (a, b) => [pt[0] + a, pt[1] + b], z: (Number(pt[2]) || 0) + (Number(p.dz) || 0) }; c2.add = (pl, z0, z1, color, extra) => parts.push({ poly: pl, z0: c2.z + z0, z1: c2.z + z1, role: "body", transp: 0, color: color || col, ...(extra || {}) }); smCard(c2, ctx.withDate({ ...smSignSpec(p, s), at: s.at || null })); };
  ctx.pin = hex => { add(ctx.oct(0.2, 10), 0, 0.06, "#374151"); add(ctx.rect(-0.03, 0.03, -0.03, 0.03), 0.06, 1.2, "#9ca3af"); add(ctx.oct(0.22, 10), 1.2, 1.32, hex); add(ctx.oct(0.17, 10), 1.32, 1.42, hex); add(ctx.oct(0.1, 8), 1.42, 1.48, hex); };
  ctx.reach = (r, color) => parts.push({ poly: Array.from({ length: 64 }, (_, i) => W(r * Math.cos(i * 2 * Math.PI / 64), r * Math.sin(i * 2 * Math.PI / 64))), z0: ctx.z, z1: ctx.z + 0.04, role: "reach", transp: 0.8, color });
  /* Väg/band längs punkterna: hörnen rundas med radie (cirkelbågar) och bandet ritas sömlöst (geringsskarvar), så att inga rektanglar klipps i hörnen. */
  ctx.path = (w, color, h, arrows, radius) => {
    const Q = smFillet(p.pts || [], Number(radius) || 0, false); if (Q.length < 2) return; const dz = Number(p.dz) || 0, n = Q.length, nrm = [];
    for (let i = 0; i < n - 1; i++) { const dd = Math.hypot(Q[i + 1][0] - Q[i][0], Q[i + 1][1] - Q[i][1]) || 1; nrm.push([-(Q[i + 1][1] - Q[i][1]) / dd, (Q[i + 1][0] - Q[i][0]) / dd]); }
    const off = Q.map((q, i) => { const n1 = nrm[Math.max(0, i - 1)], n2 = nrm[Math.min(n - 2, i)]; let mx = n1[0] + n2[0], my = n1[1] + n2[1]; const ml = Math.hypot(mx, my); if (ml < 1e-6) return [n2[0] * w, n2[1] * w]; mx /= ml; my /= ml; const k = Math.min(2.2, 1 / Math.max(0.3, mx * n2[0] + my * n2[1])); return [mx * w * k, my * w * k]; });
    let len = 0; const cum = [0];
    for (let i = 0; i < n - 1; i++) { const a = Q[i], b = Q[i + 1], z0 = Math.min(a[2] || 0, b[2] || 0) + dz; len += Math.hypot(b[0] - a[0], b[1] - a[1]); cum.push(len);
      parts.push({ poly: [[a[0] + off[i][0], a[1] + off[i][1]], [b[0] + off[i + 1][0], b[1] + off[i + 1][1]], [b[0] - off[i + 1][0], b[1] - off[i + 1][1]], [a[0] - off[i][0], a[1] - off[i][1]]], z0, z1: z0 + h, role: "body", transp: 0.25, color }); }
    const at = s => { let i = 1; while (i < n - 1 && cum[i] < s) i++; const t = (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]), a = Q[i - 1], b = Q[i], dd = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, ux: (b[0] - a[0]) / dd, uy: (b[1] - a[1]) / dd, z: Math.min(a[2] || 0, b[2] || 0) + dz }; };
    if (arrows) for (let s = 1.5; s < len - 0.8; s += 3) { const o = at(s), q = Math.min(w * 0.7, 0.5), z0 = o.z + h; parts.push({ poly: [[o.x + o.ux * q, o.y + o.uy * q], [o.x - o.ux * q * 0.6 + o.uy * q, o.y - o.uy * q * 0.6 - o.ux * q], [o.x - o.ux * q * 0.2, o.y - o.uy * q * 0.2], [o.x - o.ux * q * 0.6 - o.uy * q, o.y - o.uy * q * 0.6 + o.ux * q]], z0, z1: z0 + 0.02, role: "body", deco: true, transp: 0, color: "#ffffff" }); }
    else if (w > 0.8) { const dash = Math.min(w * 0.06, 0.12); for (let s = 0.5; s < len - 1; s += 3) { const a0 = at(s), a1 = at(Math.min(len, s + 1.5)), z0 = a0.z + h; parts.push({ poly: [[a0.x + a0.uy * dash, a0.y - a0.ux * dash], [a1.x + a1.uy * dash, a1.y - a1.ux * dash], [a1.x - a1.uy * dash, a1.y + a1.ux * dash], [a0.x - a0.uy * dash, a0.y + a0.ux * dash]], z0, z1: z0 + 0.02, role: "body", deco: true, transp: 0, color: "#fde047" }); } }
  };
  d.build(p, ctx); ctx.flush(); return parts;
}
function smartProps(p) {
  const d = smDef(p); if (!d) return []; const out = [["Objekttyp", d.label], ["Gäller datum", smDateText(p)]];
  (d.fields || []).forEach(([k, lab]) => { out.push([lab, smF(p, k)]); });
  if (p.type === "sm:gjutetapp" || p.type === "sm:gjutform") { const v = smN(p, "vol", 0); out.push(["Antal bilar (ca)", Math.ceil(v / Math.max(1, smN(p, "bil", 8)))], ["Pumptid timmar (ca)", Math.round(v / Math.max(1, smN(p, "kap", 30)) * 10) / 10]); }
  return out;
}
/* ---- Panel i 3D-editorn ----------------------------------------------------------------------------------------------------------------------- */
/* Fälttyper: "text", "num", "date", "time", lista (val), "kran", "range" (reglage: { min, max, step, unit }), lista med { seg: true } (knappar) och "calc" (beräknade värden ur objektets calc(p)).
   Listor får vara [värde, text]-par; ett sparat värde som inte finns i listan läggs till som eget val. */
/* ---- Skylten för sig (Victor 2026-10-24: "alla skyltar ska gå att justera för sig – rotation och höjd oberoende av objektet") ----
   Fält på objektet: signYaw (vridning, tom = standarden som gäller alla), signZ (höjd över objektets underkant, tom = objektets egen), signPos ([a, b] fri plats), signPlan/planPos/planYaw (extra liggande skylt). */
const SM_SIGN_AUTO = new Map(); // objektets egen skylthöjd, för reglagets utgångsläge
const smSignPos = p => (Array.isArray(p.signPos) && isFinite(p.signPos[0]) && isFinite(p.signPos[1]) ? [Number(p.signPos[0]), Number(p.signPos[1])] : null);
const smSignZ = p => (p.signZ != null && p.signZ !== "" && isFinite(Number(p.signZ)) ? Number(p.signZ) : null);
function smSignSpec(p, s) { const z0 = s.zb == null ? 2.45 : s.zb; SM_SIGN_AUTO.set(p.id, z0); const sz = smSignZ(p); return { ...s, zb: sz == null ? z0 : sz, yaw: (typeof crewSignYaw === "function" ? crewSignYaw(p) : Number(p.signYaw) || 0), at: smSignPos(p) || s.at || null }; }
function smSignHtml(p) {
  const esc = typeof escHtml === "function" ? escHtml : s => String(s), yaw = typeof crewSignYaw === "function" ? crewSignYaw(p) : Number(p.signYaw) || 0, z = smSignZ(p), auto = SM_SIGN_AUTO.get(p.id) == null ? 2.45 : SM_SIGN_AUTO.get(p.id), zv = z == null ? auto : z;
  return `<div class="v3-sec">Skylt</div><div class="v3-sm-sign">
    <label class="v3-field v3-sm-range"><span>Vridning <b data-sgv="yaw">${Math.round(yaw)}°</b>${p.signYaw == null ? " (standard)" : ""}</span><input type="range" min="-180" max="180" step="5" data-sg="yaw" value="${Math.round(yaw)}" /></label>
    <div class="v3-segs v3-sm-seg">${[[0, "0°"], [90, "90°"], [-90, "−90°"], [180, "180°"]].map(([v, t]) => `<button type="button" data-sg="yawset" data-v="${v}">${t}</button>`).join("")}</div>
    <label class="v3-field v3-sm-range"><span>Höjd <b data-sgv="z">${esc(smFmt(zv, 1))} m</b>${z == null ? " (auto)" : ""}</span><input type="range" min="0.3" max="30" step="0.1" data-sg="z" value="${zv}" /></label>
    <div class="v3-gj-btns"><button type="button" class="v3-wide" data-sg="def" title="Alla skyltar utan egen vridning får samma riktning">★ Standard</button><button type="button" class="v3-wide" data-sg="reset" title="Skylten tillbaka: standardvridning och objektets egen höjd">Återställ</button></div>
    <label class="chk"><input type="checkbox" data-sg="plan" ${p.signPlan ? "checked" : ""}> Extra skylt i planvy (liggande)</label>
    ${p.signPlan ? `<label class="v3-field v3-sm-range"><span>Planvyskyltens vridning <b data-sgv="pyaw">${Math.round(Number(p.planYaw) || 0)}°</b></span><input type="range" min="-180" max="180" step="5" data-sg="pyaw" value="${Math.round(Number(p.planYaw) || 0)}" /></label>` : ""}</div>`;
}
function smSignBind(side, p, redraw) {
  const live = (() => { let t = 0; return () => { clearTimeout(t); t = setTimeout(() => { placeTouch(p); if (typeof l3RebuildOne === "function") { l3RebuildOne(p); if (typeof l3Changed === "function") l3Changed(); } }, 60); }; })();
  const badge = (k, txt) => { const b = side.querySelector(`[data-sgv="${k}"]`); if (b) b.textContent = txt; };
  const apply = fn => { placeSnapshot(); fn(); placeTouch(p); redraw(); if (typeof l3RebuildOne === "function") l3RebuildOne(p); if (typeof l3Changed === "function") l3Changed(); };
  side.querySelectorAll("[data-sg]").forEach(el => { const k = el.dataset.sg;
    if (k === "yaw") { el.oninput = () => { p.signYaw = Number(el.value); badge("yaw", Math.round(p.signYaw) + "°"); live(); }; el.onchange = () => { redraw(); }; }
    else if (k === "z") { el.oninput = () => { p.signZ = Number(el.value); badge("z", smFmt(p.signZ, 1) + " m"); live(); }; el.onchange = () => { redraw(); }; }
    else if (k === "pyaw") { el.oninput = () => { p.planYaw = Number(el.value); badge("pyaw", Math.round(p.planYaw) + "°"); live(); }; }
    else if (k === "yawset") el.onclick = () => apply(() => { p.signYaw = Number(el.dataset.v); });
    else if (k === "def") el.onclick = () => { if (typeof crewSignDefaultSet === "function") crewSignDefaultSet(typeof crewSignYaw === "function" ? crewSignYaw(p) : 0); if (typeof l3Toast === "function") l3Toast("Standard: skyltarna vrids " + Math.round(typeof crewSignYaw === "function" ? crewSignYaw(p) : 0) + "° (gäller alla utan egen vridning)"); redraw(); };
    else if (k === "reset") el.onclick = () => apply(() => { p.signYaw = null; p.signZ = null; p.signPos = null; p.planPos = null; p.planYaw = 0; });
    else if (k === "plan") el.onchange = () => apply(() => { p.signPlan = el.checked; });
  });
}
function smartSideHtml(p) {
  const d = smDef(p); if (!d || !(d.fields || []).length) return "";
  const esc = typeof escHtml === "function" ? escHtml : s => String(s);
  const row = ([k, lab, type, def, o]) => { const v = smF(p, k, def == null ? "" : def); o = o || {};
    if (type === "gjprof") { const has = !!(typeof gjutProfGet === "function" && gjutProfGet(p)); return `<div class="v3-field v3-gj-prof"><span>${esc(lab)}</span><div class="v3-gj-btns"><button type="button" data-gjdraw="1" class="v3-wide">${has ? "Rita om med frihand" : "Rita med frihand"}</button>${has ? `<button type="button" data-gjclear="1" class="v3-wide">Rensa</button>` : ""}</div><small>${has ? "Botten följer din linje." : "Rita längs sidan i modellen – formen skärs efter linjen (t.ex. mot berg)."}</small></div>`; }
    if (type === "calc") { const rows = typeof d.calc === "function" ? d.calc(p) : []; return `<div class="v3-sm-calc"><div class="v3-sm-calc-h">${esc(lab)}</div>${rows.map(([a, b2]) => `<div><span>${esc(a)}</span><b>${esc(b2)}</b></div>`).join("")}</div>`; }
    if (type === "range") { const n = o.dim ? (Number(p[k]) || Number(def) || 0) : smN(p, k, Number(def) || 0), u = o.unit || ""; return `<label class="v3-field v3-sm-range"><span>${esc(lab)} <b data-smv="${k}">${esc(smFmt(n, 2))} ${esc(u)}</b></span><input type="range" ${o.dim ? "data-smd" : "data-smf"}="${k}" min="${o.min}" max="${o.max}" step="${o.step || 1}" value="${n}" data-u="${esc(u)}" /></label>`; }
    const list = Array.isArray(type) ? type : type === "kran" ? SM_KRAN() : null;
    if (list) { let items = list.map(x => Array.isArray(x) ? x : [x, x]); if (v !== "" && type !== "kran" && !items.some(x => String(x[0]) === String(v))) items = [...items, [v, String(v)]];
      if (o.seg && type !== "kran") return `<div class="v3-field"><span>${esc(lab)}</span><div class="v3-segs v3-sm-seg" data-smseg="${k}">${items.map(([val, t]) => `<button type="button" data-v="${esc(val)}" class="${String(val) === String(v) ? "on" : ""}">${esc(t)}</button>`).join("")}</div></div>`;
      return `<label class="v3-field"><span>${esc(lab)}</span><select data-smf="${k}">${type === "kran" ? `<option value="">–</option>` : ""}${items.map(([val, t]) => `<option value="${esc(val)}"${String(val) === String(v) ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>`; }
    return `<label class="v3-field"><span>${esc(lab)}</span><input type="${type === "date" ? "date" : type === "time" ? "time" : "text"}" data-smf="${k}" ${type === "num" ? 'inputmode="decimal"' : ""} value="${esc(v)}" /></label>`; };
  const g = (t, a) => `<div class="v3-sec">${esc(t)}</div>${a}`;
  return (d.groups ? d.groups.map(([t, ks]) => g(t, ks.map(k => d.fields.find(f => f[0] === k)).filter(Boolean).map(row).join(""))).join("")
    : `<div class="v3-sec">${esc(d.label)}</div>${d.fields.map(row).join("")}`) + smSignHtml(p) + smDateFieldsHtml(p);
}
function smartBindSide(side, p, redraw) {
  const d = smDef(p); if (!d) return;
  smDateBind(side, p, redraw); smSignBind(side, p, redraw);
  const live = (k, v) => { p.f = p.f || {}; p.f[k] = v; };
  side.querySelectorAll("[data-gjdraw]").forEach(b => { b.onclick = () => { if (typeof l3gpStart === "function") l3gpStart(p); }; });
  side.querySelectorAll("[data-gjclear]").forEach(b => { b.onclick = () => { if (typeof l3gpClear === "function") l3gpClear(p); }; });
  side.querySelectorAll("[data-smseg]").forEach(g => g.querySelectorAll("button").forEach(b => { b.onclick = () => { placeSnapshot(); live(g.dataset.smseg, b.dataset.v); placeTouch(p); redraw(); }; }));
  side.querySelectorAll("[data-smd]").forEach(el => { const k = el.dataset.smd, upd = () => { const bd = side.querySelector(`[data-smv="${k}"]`); if (bd) bd.textContent = smFmt(Number(el.value), 2) + " " + (el.dataset.u || ""); };
    el.oninput = () => { p[k] = Number(el.value); upd(); if (typeof l3RebuildOne === "function") { l3RebuildOne(p); } }; el.onchange = () => { placeSnapshot(); p[k] = Number(el.value); placeTouch(p); redraw(); if (typeof l3Changed === "function") l3Changed(); }; });
  let lt = 0; side.querySelectorAll("[data-smf]").forEach(el => { el.onchange = () => { placeSnapshot(); live(el.dataset.smf, el.value); placeTouch(p); redraw(); };
    if (el.tagName === "INPUT") el.addEventListener("input", () => { live(el.dataset.smf, el.value); if (el.type === "range") { const bd = side.querySelector(`[data-smv="${el.dataset.smf}"]`); if (bd) bd.textContent = smFmt(Number(el.value), 2) + " " + (el.dataset.u || ""); } clearTimeout(lt); lt = setTimeout(() => { placeTouch(p); if (typeof l3RebuildOne === "function") { l3RebuildOne(p); if (typeof l3Changed === "function") l3Changed(); } }, el.type === "range" ? 60 : 250); }); });
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
  const X = new THREE.Vector3(sp.ax, sp.ay, 0).normalize(), Yv = sp.flat ? new THREE.Vector3(-X.y, X.x, 0) : new THREE.Vector3(0, 0, 1), Zv = new THREE.Vector3().crossVectors(X, Yv); mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Yv, Zv));
  mesh.position.set(sp.cx, sp.cy, sp.flat ? sp.z : sp.z + sp.zb + sp.h / 2); mesh.renderOrder = 4; mesh.userData.placeId = p.id; mesh.userData.mat0 = { t: true, o: 1, d: false }; mesh.userData.isSign = true; mesh.userData.flat = !!sp.flat; return mesh;
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
