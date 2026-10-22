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
function smCard(ctx, s) {
  const { parts, W, add, z } = ctx, TW = { loc: [], faces: [] }, TG = { loc: [], faces: [] }, TD = { loc: [], faces: [] }, wd = t => ifcTextStrokes(t).width / 6;
  const head = String(s.title).toUpperCase(), hs0 = 0.22, colW = s.left ? 0.95 : 0, vs = 0.2, lh = 0.3, rows = (s.rows || []).filter(r => r && r[1] !== undefined).map(([lab, val, o]) => [String(lab).toUpperCase(), (String(val || "").trim() ? crewWrap(String(val), 30) : []).map(x => x.toUpperCase()), o || {}]);
  const blk = ls => 0.13 + 0.08 + vs + (Math.max(1, ls.length) - 1) * lh + 0.2, barH = s.bar ? 0.34 : 0;
  const need = Math.max(wd(head) * hs0 + 0.4, colW + 0.5 + Math.max(2.0, ...rows.flatMap(r => r[1].map(l => wd(l) * vs + 0.1))));
  const w2 = Math.max(1.7, need / 2), hdr = 0.52, bodyH = Math.max(1.02, 0.12 + rows.reduce((a, r) => a + blk(r[1]), 0) + barH + 0.04), hh = hdr + bodyH, zb = s.zb == null ? 2.45 : s.zb, b0 = s.b0 == null ? -1.2 : s.b0;
  const rect = (a0, a1, b1, b2) => [[a0, b1], [a1, b1], [a1, b2], [a0, b2]].map(([a, b]) => W(a, b));
  add(rect(-w2 + 0.15, -w2 + 0.23, b0 - 0.03, b0 + 0.01), 0, zb + 0.02, "#6b7280"); add(rect(w2 - 0.23, w2 - 0.15, b0 - 0.03, b0 + 0.01), 0, zb + 0.02, "#6b7280");
  add(rect(-w2 - 0.05, w2 + 0.05, b0 - 0.005, b0 + 0.04), zb - 0.05, zb + hh + 0.05, "#cbd5e1", { unlit: true });
  add(rect(-w2, w2, b0 - 0.03, b0 + 0.01), zb, zb + hh, "#ffffff", { unlit: true });
  add(rect(-w2, w2, b0 - 0.035, b0 + 0.012), zb + bodyH, zb + hh, s.color || "#2563eb", { unlit: true });
  if (s.left) add(rect(-w2 + colW + 0.25, -w2 + colW + 0.27, b0 - 0.035, b0 + 0.012), zb + 0.15, zb + bodyH - 0.12, "#d1d5db", { unlit: true });
  const bT = b0 - 0.05, ax = -w2 + 0.2, rx = s.left ? -w2 + colW + 0.45 : ax; let y = zb + bodyH - 0.12;
  crewText(TW, head, hs0, ax, zb + bodyH + (hdr - hs0) / 2, bT, "l", true);
  if (s.left) { crewText(TG, String(s.left[0]).toUpperCase(), 0.13, ax, zb + bodyH - 0.3, bT, "l", false); crewText(TD, String(s.left[1]), 0.44, ax, zb + bodyH - 0.86, bT, "l", true); }
  rows.forEach(([lab, ls]) => { const lb = y - 0.13; crewText(TG, lab, 0.13, rx, lb, bT, "l", false);
    if (ls.length) ls.forEach((l, i) => crewText(TD, l, vs, rx, lb - 0.08 - vs - i * lh, bT, "l", i === 0 && ls.length === 1)); else crewText(TG, "–", 0.2, rx, lb - 0.08 - vs, bT, "l", false); y -= blk(ls); });
  if (s.bar) { const bw = w2 * 2 - 0.5, bx = -w2 + 0.25, pc = Math.max(0, Math.min(1, s.bar.pct)); add(rect(bx, bx + bw, b0 - 0.036, b0 + 0.012), zb + 0.14, zb + 0.14 + 0.16, "#e5e7eb", { unlit: true }); if (pc > 0.01) add(rect(bx, bx + bw * pc, b0 - 0.04, b0 + 0.012), zb + 0.14, zb + 0.30, s.bar.color || "#22c55e", { unlit: true }); }
  [[TW, "#ffffff"], [TG, "#6b7280"], [TD, "#111827"]].forEach(([T2, color]) => { if (!T2.faces.length) return;
    const pts2 = T2.loc.map(([a, b2, zz]) => { const w = W(a, b2); return [w[0], w[1], z + zz]; }), xs = pts2.map(q => q[0]), ys = pts2.map(q => q[1]), zs = pts2.map(q => q[2]);
    parts.push({ tris: { pts: pts2, faces: T2.faces }, poly: [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]], z0: Math.min(...zs), z1: Math.max(...zs), role: "body", transp: 0, color, unlit: true }); });
}
/* Fri text (stor, mitt i en skiva): används av vägskyltar och höjdpunkter. */
function smText(ctx, text, size, a, zc, b, color, bold) {
  const T = { loc: [], faces: [] }; crewText(T, String(text).toUpperCase(), size, a, zc - size / 2, b, "c", bold); if (!T.faces.length) return;
  const pts = T.loc.map(([x, y, zz]) => { const w = ctx.W(x, y); return [w[0], w[1], ctx.z + zz]; }), xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), zs = pts.map(q => q[2]);
  ctx.parts.push({ tris: { pts, faces: T.faces }, poly: [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)], [Math.min(...xs), Math.max(...ys)]], z0: Math.min(...zs), z1: Math.max(...zs), role: "body", transp: 0, color, unlit: true });
}

/* ---- Typerna ---------------------------------------------------------------------------------------------------------------------------------- */
const SM_KRAN = () => (typeof L3L_MODELS !== "undefined" ? L3L_MODELS.map(m => m.name) : ["Mobilkran 100 t (exempel)"]);
const SM = {
  leverans: { group: "Logistik", label: "Leverans / upplag", color: "#f59e0b", L: 2.4, B: 1.2, H: 1.1, fields: [["innehall", "Innehåll", "text", "HD/F pelare ×12"], ["lev", "Leverantör", "text", ""], ["datum", "Leveransdatum", "date", ""], ["status", "Status", ["Beställd", "På väg", "Levererad"], "Beställd"]],
    build(p, c) { const L = p.L / 2, B = p.B / 2, st = smF(p, "status", "Beställd"), sc = SM_ST[st] || "#f59e0b"; c.add(c.rect(-L, L, -B, B), 0, 0.15, "#a16207"); c.add(c.rect(-L + 0.08, L - 0.08, -B + 0.08, B - 0.08), 0.15, p.H, sc); [-0.5, 0.5].forEach(a => c.add(c.rect(L * a - 0.03, L * a + 0.03, -B - 0.01, B + 0.01), 0.15, p.H + 0.01, "#f3f4f6"));
      c.card({ title: "LEVERANS: " + st, color: sc, rows: [["Innehåll", smF(p, "innehall")], ["Leverantör", smF(p, "lev")], ["Datum", smF(p, "datum")]], b0: -(B + 0.3) }); } },
  gjutetapp: { group: "Logistik", label: "Gjutetapp", color: "#64748b", L: 12, B: 8, H: 0.15, fields: [["vol", "Volym (m³)", "num", 40], ["kval", "Kvalitet", "text", "C30/37"], ["pump", "Pumpplats", "text", ""], ["start", "Starttid", "text", "07:00"], ["bil", "m³ per bil", "num", 8], ["kap", "Pumpkapacitet (m³/h)", "num", 30]],
    build(p, c) { const L = p.L / 2, B = p.B / 2, v = smN(p, "vol", 0), bilar = Math.ceil(v / Math.max(1, smN(p, "bil", 8))), tim = v / Math.max(1, smN(p, "kap", 30)); c.add(c.rect(-L, L, -B, B), 0, p.H, "#94a3b8", { transp: 0.5 });
      c.card({ title: "GJUTETAPP", color: "#475569", left: ["M³", smFmt(v, 1)], rows: [["Kvalitet", smF(p, "kval")], ["Pumpplats / start", [smF(p, "pump"), smF(p, "start")].filter(Boolean).join(" · ")], ["Bilar / pumptid", `ca ${bilar} bilar · ${smFmt(tim, 1)} h`]], b0: -(B + 0.3) }); } },
  lyftkort: { group: "Lyft & montage", label: "Lyftkort", color: "#eab308", L: 1.8, B: 1.8, H: 1.2, fields: [["obj", "Objekt som lyfts", "text", ""], ["vikt", "Vikt (ton)", "num", 10], ["kran", "Kran", "kran", ""], ["rad", "Radie (m)", "num", 20], ["status", "Status", ["Planerad", "Klar"], "Planerad"]],
    build(p, c) { const vikt = smN(p, "vikt", 0), rad = smN(p, "rad", 0), kran = smF(p, "kran", SM_KRAN()[3] || ""); let util = null, hex = "#eab308";
      if (typeof l3lCap === "function" && typeof L3L_MODELS !== "undefined") { const m = L3L_MODELS.find(x => x.name === kran) || L3L_MODELS[3], ch = String(m.chart).split("\n").map(l => l.split(":").map(Number)); const cap = l3lCap(rad, ch); util = vikt > 0 ? (cap > 0 ? vikt / cap : 9.99) : 0; hex = util > 1 ? "#ef4444" : util > 0.8 ? "#f59e0b" : "#22c55e"; }
      c.add(c.oct(0.9, 10), 0, 0.05, hex); c.add(c.rect(-0.07, 0.07, -0.07, 0.07), 0, 1.3, "#6b7280"); c.add(c.rect(-0.25, 0.25, -0.06, 0.06), 1.3, 1.38, "#6b7280"); c.add(c.oct(0.14, 8, 0.2, 0), 1.0, 1.3, "#374151"); c.add(c.oct(0.14, 8, -0.2, 0), 1.0, 1.3, "#374151");
      c.card({ title: "LYFT: " + (smF(p, "obj") || "–"), color: hex, left: ["TON", smFmt(vikt, 1)], rows: [["Kran / radie", `${kran} · ${smFmt(rad, 0)} m`], ["Utnyttjande", util == null ? "–" : util > 1 ? "ÖVERLAST " + Math.round(util * 100) + " %" : Math.round(util * 100) + " %"], ["Status", smF(p, "status")]], bar: util == null ? null : { pct: Math.min(1, util), color: hex }, b0: -1.3 }); } },
  kranplats: { group: "Lyft & montage", label: "Kranplats", color: "#f97316", L: 12, B: 12, H: 0.1, fields: [["kran", "Kran", "kran", ""], ["bel", "Max stödbenskraft (kN)", "num", 600], ["grund", "Underlag", "text", "Krossad bergmaterial, packad"]],
    build(p, c) { const L = p.L / 2, B = p.B / 2; c.add(c.rect(-L, L, -B, B), 0, p.H, "#9ca3af", { transp: 0.35 }); [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sa, sb]) => c.add(c.rect(sa * (L - 1.2) - 0.8, sa * (L - 1.2) + 0.8, sb * (B - 1.2) - 0.8, sb * (B - 1.2) + 0.8), 0, p.H + 0.08, "#f97316"));
      c.card({ title: "KRANPLATS", color: "#ea580c", rows: [["Kran", smF(p, "kran") || "–"], ["Max stödbenskraft", smN(p, "bel", 0) + " kN"], ["Underlag", smF(p, "grund")]], b0: -(B + 0.3) }); } },
  saxlift: { group: "Lyft & montage", label: "Skylift / saxlift", color: "#16a34a", L: 2.6, B: 1.2, H: 6, fields: [["hojd", "Arbetshöjd (m)", "num", 8], ["anv", "Används av", "text", ""]],
    build(p, c) { const h = Math.max(2, smN(p, "hojd", 6)) - 1.6, L = p.L / 2, B = p.B / 2; c.add(c.rect(-L, L, -B, B), 0.1, 0.9, "#16a34a"); [[-1, -1], [1, 1]].forEach(([a, b]) => c.add(c.rect(a * 0.5 - 0.06, a * 0.5 + 0.06, -0.06 * b - 0.4, 0.4), 0.9, 0.9 + h, "#374151")); c.add(c.rect(-L, L, -B, B), 0.9 + h, 1.0 + h, "#9ca3af");
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => c.add(c.rect(a * (L - 0.04) - 0.03, a * (L - 0.04) + 0.03, b * (B - 0.04) - 0.03, b * (B - 0.04) + 0.03), 1.0 + h, 2.0 + h, "#facc15")); c.add(c.oct(0.28, 8, -L + 0.3, 0), 0, 0.5, "#111827"); c.add(c.oct(0.28, 8, L - 0.3, 0), 0, 0.5, "#111827");
      if (smF(p, "anv")) c.card({ title: "LIFT " + smFmt(smN(p, "hojd", 6), 0) + " M", color: "#15803d", rows: [["Används av", smF(p, "anv")]], zb: 2.9 + h, b0: -(B + 0.4) }); } },
  riskzon: { group: "Risk & säkerhet", label: "Riskzon", color: "#ef4444", L: 10, B: 6, H: 0.08, fields: [["risk", "Risk", "text", "Lyft över arbetsplats"], ["atg", "Åtgärd / regel", "text", "Inget tillträde under lyft"], ["ans", "Ansvarig", "text", ""]],
    build(p, c) { const L = p.L / 2, B = p.B / 2; c.add(c.rect(-L, L, -B, B), 0, p.H, "#ef4444", { transp: 0.6 }); [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], i) => { c.add(c.rect(a * L - 0.05, a * L + 0.05, b * B - 0.05, b * B + 0.05), 0, 1.3, "#ffffff"); c.add(c.rect(a * L - 0.055, a * L + 0.055, b * B - 0.055, b * B + 0.055), 0.3, 0.6, "#ef4444"); c.add(c.rect(a * L - 0.055, a * L + 0.055, b * B - 0.055, b * B + 0.055), 0.9, 1.2, "#ef4444"); });
      c.card({ title: "RISK: " + (smF(p, "risk") || "–"), color: "#dc2626", rows: [["Åtgärd / regel", smF(p, "atg")], ["Ansvarig", smF(p, "ans")]], b0: -(B + 0.3) }); } },
  samling: { group: "Risk & säkerhet", label: "Samlingsplats", color: "#22c55e", L: 6, B: 6, H: 0.06, fields: [["kap", "Kapacitet (personer)", "num", 60], ["ans", "Ansvarig", "text", ""]],
    build(p, c) { const L = p.L / 2, B = p.B / 2; c.add(c.rect(-L, L, -B, B), 0, p.H, "#22c55e", { transp: 0.45 }); c.add(c.rect(-L, L, -0.12, 0.12), p.H, p.H + 0.02, "#ffffff"); c.add(c.rect(-0.12, 0.12, -B, B), p.H, p.H + 0.02, "#ffffff");
      c.card({ title: "SAMLINGSPLATS", color: "#16a34a", left: ["PERS", String(smN(p, "kap", 0))], rows: [["Ansvarig", smF(p, "ans")]], b0: -(B + 0.3) }); } },
  utrymning: { group: "Risk & säkerhet", label: "Utrymningsväg", color: "#22c55e", path: true, H: 0.05, fields: [["bredd", "Bredd (m)", "num", 1.2], ["till", "Leder till", "text", "Samlingsplats"]],
    build(p, c) { const w = smN(p, "bredd", 1.2) / 2; c.path(w, "#22c55e", 0.04, true); const P = p.pts || []; if (P.length) c.cardAt(P[0], { title: "UTRYMNINGSVÄG", color: "#16a34a", rows: [["Leder till", smF(p, "till")], ["Bredd", smFmt(w * 2, 1) + " m"]], b0: -1.0, zb: 2.2 }); } },
  transport: { group: "Logistik", label: "Transportväg", color: "#475569", path: true, H: 0.04, fields: [["bredd", "Bredd (m)", "num", 4.5], ["last", "Max last (ton)", "num", 40], ["rikt", "Trafik", ["Dubbelriktad", "Enkelriktad"], "Dubbelriktad"]],
    build(p, c) { const w = smN(p, "bredd", 4.5) / 2; c.path(w, "#64748b", 0.04, false); const P = p.pts || []; if (P.length) c.cardAt(P[0], { title: "TRANSPORTVÄG", color: "#334155", rows: [["Bredd / last", `${smFmt(w * 2, 1)} m · ${smN(p, "last", 0)} t`], ["Trafik", smF(p, "rikt")]], b0: -1.5, zb: 2.2 }); } },
  avvikelse: { group: "Kvalitet & uppföljning", label: "Avvikelse / fråga", color: "#ef4444", L: 0.5, B: 0.5, H: 1.5, fields: [["rubrik", "Rubrik", "text", ""], ["besk", "Beskrivning", "text", ""], ["ans", "Ansvarig", "text", ""], ["status", "Status", ["Öppen", "Pågår", "Åtgärdad"], "Öppen"], ["datum", "Datum", "date", ""]],
    build(p, c) { const st = smF(p, "status", "Öppen"), sc = SM_ST[st]; c.pin(sc); c.card({ title: "AVVIKELSE: " + st, color: sc, rows: [["Rubrik", smF(p, "rubrik")], ["Beskrivning", smF(p, "besk")], ["Ansvarig / datum", [smF(p, "ans"), smF(p, "datum")].filter(Boolean).join(" · ")]], zb: 2.0, b0: -0.5 }); } },
  egenkontroll: { group: "Kvalitet & uppföljning", label: "Egenkontroll", color: "#22c55e", L: 0.5, B: 0.5, H: 1.5, fields: [["obj", "Objekt", "text", ""], ["klara", "Klara kontrollpunkter", "num", 0], ["tot", "Totalt antal", "num", 10], ["ans", "Kontrollant", "text", ""]],
    build(p, c) { const k = smN(p, "klara", 0), t = Math.max(1, smN(p, "tot", 1)), pc = Math.min(1, k / t), hex = pc >= 1 ? "#22c55e" : pc >= 0.5 ? "#f59e0b" : "#ef4444"; c.pin(hex);
      c.card({ title: "EGENKONTROLL", color: hex, left: ["%", String(Math.round(pc * 100))], rows: [["Objekt", smF(p, "obj")], ["Kontrollpunkter", `${k} av ${t} klara`], ["Kontrollant", smF(p, "ans")]], bar: { pct: pc, color: hex }, zb: 2.0, b0: -0.5 }); } },
  hojdpunkt: { group: "Kvalitet & uppföljning", label: "Höjdpunkt", color: "#0ea5e9", L: 0.4, B: 0.4, H: 1.2, fields: [["not", "Anteckning", "text", ""]],
    build(p, c) { c.pin("#0ea5e9"); const zv = typeof placeBaseZ === "function" ? placeBaseZ(p) : 0; c.card({ title: "HÖJD +" + smFmt(zv, 2), color: "#0284c7", rows: smF(p, "not") ? [["Anteckning", smF(p, "not")]] : [], zb: 1.7, b0: -0.4 }); } },
  pumpbil: { group: "Logistik", label: "Pumpbil", color: "#e11d48", L: 10, B: 2.5, H: 3.6, R: 28, fields: [["kap", "Pumpkapacitet (m³/h)", "num", 90], ["firma", "Firma", "text", ""]],
    build(p, c) { const L = p.L / 2, B = p.B / 2; c.add(c.rect(-L, L - 2.4, -B, B), 0.6, 1.4, "#374151"); c.add(c.rect(L - 2.4, L, -B, B), 0.6, 3.0, "#e11d48"); c.add(c.rect(L - 0.1, L, -B + 0.2, B - 0.2), 1.6, 2.8, "#93c5fd"); c.add(c.rect(-L, L - 2.5, -B + 0.1, B - 0.1), 1.4, 2.6, "#e11d48"); c.add(c.rect(-L + 0.5, L - 3.0, -0.18, 0.18), 2.6, 3.0, "#facc15"); c.add(c.rect(-L + 0.5, -L + 3.5, -0.18, 0.18), 3.0, 3.6, "#facc15");
      [-3, -1.6, 2.6, 4].forEach(x => { c.add(c.oct(0.55, 10, x, -B), 0, 1.1, "#111827"); c.add(c.oct(0.55, 10, x, B), 0, 1.1, "#111827"); });
      if (p.R > 0) c.reach(p.R, "#e11d48"); c.card({ title: "PUMPBIL " + smN(p, "kap", 0) + " M³/H", color: "#be123c", rows: [["Räckvidd", smFmt(p.R, 0) + " m"], ["Firma", smF(p, "firma")]], b0: -(B + 0.4), zb: 4.2 }); } },
  betongbil: { group: "Logistik", label: "Betongbil", color: "#f59e0b", L: 8.5, B: 2.5, H: 3.6, fields: [["m3", "Last (m³)", "num", 8]],
    build(p, c) { const L = p.L / 2, B = p.B / 2; c.add(c.rect(-L, L - 2.2, -B, B), 0.6, 1.2, "#374151"); c.add(c.rect(L - 2.2, L, -B, B), 0.6, 3.0, "#f59e0b"); c.add(c.rect(L - 0.1, L, -B + 0.2, B - 0.2), 1.6, 2.8, "#93c5fd"); c.add(c.oct(1.25, 12, -0.8, 0), 1.2, 3.5, "#d1d5db"); c.add(c.oct(0.9, 12, -2.3, 0), 1.4, 3.1, "#e5e7eb"); c.add(c.oct(0.5, 12, 1.2, 0), 1.3, 2.6, "#f59e0b");
      [-3, -1.6, 2.6, 4].forEach(x => { c.add(c.oct(0.55, 10, x, -B), 0, 1.1, "#111827"); c.add(c.oct(0.55, 10, x, B), 0, 1.1, "#111827"); }); } },
  lastbil: { group: "Logistik", label: "Lastbil med flak", color: "#2563eb", L: 9, B: 2.5, H: 3.4, fields: [["last", "Last", "text", ""]],
    build(p, c) { const L = p.L / 2, B = p.B / 2; c.add(c.rect(-L, L - 2.2, -B, B), 0.6, 1.2, "#374151"); c.add(c.rect(L - 2.2, L, -B, B), 0.6, 3.0, "#2563eb"); c.add(c.rect(L - 0.1, L, -B + 0.2, B - 0.2), 1.6, 2.8, "#93c5fd");
      c.add(c.rect(-L, L - 2.4, -B + 0.05, B - 0.05), 1.2, 1.35, "#9ca3af"); [-1, 1].forEach(b => c.add(c.rect(-L, L - 2.4, b * (B - 0.05) - 0.03, b * (B - 0.05) + 0.03), 1.35, 2.3, "#d1d5db")); c.add(c.rect(-L, -L + 0.06, -B + 0.05, B - 0.05), 1.35, 2.3, "#d1d5db");
      [-3, -1.6, 2.6, 4].forEach(x => { c.add(c.oct(0.55, 10, x, -B), 0, 1.1, "#111827"); c.add(c.oct(0.55, 10, x, B), 0, 1.1, "#111827"); }); if (smF(p, "last")) c.card({ title: "LASTBIL", color: "#1d4ed8", rows: [["Last", smF(p, "last")]], b0: -(B + 0.4), zb: 3.8 }); } },
  dass: { group: "Etablering", label: "Toalett (dass)", color: "#2563eb", L: 1.2, B: 1.2, H: 2.3, fields: [],
    build(p, c) { const L = p.L / 2, B = p.B / 2; c.add(c.rect(-L, L, -B, B), 0, p.H, "#2563eb"); c.add(c.rect(-L - 0.04, L + 0.04, -B - 0.04, B + 0.04), p.H, p.H + 0.08, "#1e40af"); c.add(c.rect(L - 0.02, L + 0.03, -0.35, 0.35), 0.1, 2.0, "#1e3a8a"); c.add(c.oct(0.12, 8, L + 0.04, 0.2), 1.0, 1.1, "#f3f4f6"); } },
  avfall: { group: "Etablering", label: "Avfall / skip", color: "#16a34a", L: 6, B: 2.4, H: 1.5, fields: [["fraktion", "Fraktion", "text", "Blandat avfall"]],
    build(p, c) { const L = p.L / 2, B = p.B / 2; c.add(c.rect(-L, L, -B, B), 0.15, 0.25, "#374151"); c.add(c.rect(-L, L, -B, -B + 0.08), 0.15, p.H, "#16a34a"); c.add(c.rect(-L, L, B - 0.08, B), 0.15, p.H, "#16a34a"); c.add(c.rect(-L, -L + 0.08, -B, B), 0.15, p.H, "#15803d"); c.add(c.rect(L - 0.08, L, -B, B), 0.15, p.H, "#15803d");
      c.card({ title: "AVFALL", color: "#15803d", rows: [["Fraktion", smF(p, "fraktion")]], b0: -(B + 0.3), zb: 2.2 }); } },
  mast: { group: "Etablering", label: "Belysningsmast", color: "#eab308", L: 0.4, B: 0.4, H: 8, R: 14, fields: [],
    build(p, c) { c.add(c.rect(-0.12, 0.12, -0.12, 0.12), 0, p.H, "#6b7280"); c.add(c.rect(-0.35, 0.35, -0.12, 0.12), p.H, p.H + 0.35, "#facc15"); if (p.R > 0) c.reach(p.R, "#fde047"); } },
  eltavla: { group: "Etablering", label: "Eltavla / byggström", color: "#facc15", L: 0.9, B: 0.4, H: 1.8, fields: [["grp", "Märkning", "text", "Byggel"]],
    build(p, c) { const L = p.L / 2, B = p.B / 2; c.add(c.rect(-L, L, -B, B), 0, p.H, "#facc15"); c.add(c.rect(-L + 0.05, L - 0.05, -B - 0.01, -B + 0.01), 0.5, p.H - 0.2, "#fde68a"); smText(c, "EL", 0.4, 0, 1.4, -B - 0.05, "#111827", true); if (smF(p, "grp")) smText(c, smF(p, "grp"), 0.14, 0, 0.9, -B - 0.05, "#111827", false); } },
  slackare: { group: "Risk & säkerhet", label: "Brandsläckare", color: "#dc2626", L: 0.3, B: 0.3, H: 1.6, fields: [],
    build(p, c) { c.add(c.rect(-0.03, 0.03, -0.03, 0.03), 0, 1.6, "#6b7280"); c.add(c.oct(0.12, 10, 0, -0.06), 0.9, 1.5, "#dc2626"); c.add(c.rect(-0.3, 0.3, -0.03, 0.03), 1.55, 2.15, "#dc2626"); c.add(c.rect(-0.05, 0.05, -0.04, 0.04), 1.6, 2.1, "#ffffff"); } },
  forstahjalp: { group: "Risk & säkerhet", label: "Första hjälpen", color: "#16a34a", L: 0.6, B: 0.3, H: 1.6, fields: [],
    build(p, c) { c.add(c.rect(-0.03, 0.03, -0.03, 0.03), 0, 1.5, "#6b7280"); c.add(c.rect(-0.3, 0.3, -0.05, 0.05), 1.1, 1.8, "#16a34a"); c.add(c.rect(-0.04, 0.04, -0.06, 0.06), 1.2, 1.7, "#ffffff"); c.add(c.rect(-0.2, 0.2, -0.06, 0.06), 1.4, 1.5, "#ffffff"); } },
  vagskylt: { group: "Risk & säkerhet", label: "Vägskylt", color: "#ef4444", L: 0.8, B: 0.2, H: 2.6, fields: [["text", "Text på skylten", "text", "30"], ["typ", "Typ", ["Hastighet", "Stopp", "Förbud", "Info"], "Hastighet"]],
    build(p, c) { const ty = smF(p, "typ", "Hastighet"), tx = smF(p, "text", "30"); c.add(c.rect(-0.03, 0.03, -0.03, 0.03), 0, 2.2, "#6b7280");
      if (ty === "Stopp") { c.add(c.oct(0.42, 8, 0, -0.06), 2.2, 2.26, "#dc2626"); c.add(c.oct(0.42, 8, 0, 0), 2.2, 2.2 + 0.001, "#dc2626"); smText(c, "STOPP", 0.2, 0, 2.5, -0.12, "#ffffff", true); }
      else if (ty === "Info") { c.add(c.rect(-0.4, 0.4, -0.04, 0.04), 2.1, 2.9, "#2563eb"); smText(c, tx, 0.22, 0, 2.5, -0.1, "#ffffff", true); }
      else { c.add(c.oct(0.42, 14, 0, 0), 2.1, 2.16, ty === "Förbud" ? "#dc2626" : "#dc2626"); c.add(c.oct(0.32, 14, 0, -0.02), 2.1, 2.17, "#ffffff"); smText(c, tx, tx.length > 3 ? 0.16 : 0.3, 0, 2.5, -0.12, "#111827", true); } } },
  grind: { group: "Risk & säkerhet", label: "Grind / port", color: "#6b7280", L: 4, B: 0.2, H: 2, fields: [["las", "Lås / ansvarig", "text", ""]],
    build(p, c) { const L = p.L / 2; [-1, 1].forEach(a => c.add(c.rect(a * L - 0.08, a * L + 0.08, -0.08, 0.08), 0, p.H + 0.1, "#374151")); c.add(c.rect(-L + 0.08, L - 0.08, -0.03, 0.03), 0.1, p.H, "#9ca3af", { transp: 0.35 }); c.add(c.rect(-L + 0.08, L - 0.08, -0.04, 0.04), p.H - 0.08, p.H, "#6b7280"); c.add(c.rect(-L + 0.08, L - 0.08, -0.04, 0.04), 0.1, 0.18, "#6b7280"); if (smF(p, "las")) c.card({ title: "GRIND", color: "#4b5563", rows: [["Lås / ansvarig", smF(p, "las")]], b0: -0.5, zb: 2.5 }); } },
  infoskylt: { group: "Kvalitet & uppföljning", label: "Informationsskylt", color: "#2563eb", L: 0.4, B: 0.4, H: 2, fields: [["rubrik", "Rubrik", "text", "Information"], ["rad1", "Text 1", "text", ""], ["rad2", "Text 2", "text", ""], ["rad3", "Text 3", "text", ""]],
    build(p, c) { c.card({ title: smF(p, "rubrik", "Information"), color: p.color || "#2563eb", rows: ["rad1", "rad2", "rad3"].map(k => ["", smF(p, k)]).filter(r => r[1]), b0: -0.3, zb: 1.4 }); } },
};
const smKeys = () => Object.keys(SM);
function smartLib(type) {
  const k = String(type).slice(3), d = SM[k]; if (!d) return { group: "Etablering", label: "Smart objekt (saknas)", color: "#64748b", smart: true, key: k, L: 1, B: 1, H: 1 };
  return { group: d.group, label: d.label, color: d.color, smart: true, key: k, L: d.L || 0, B: d.B || 0, H: d.H || 1, R: d.R || 0, fence: !!d.path, title: d.label };
}
const smIsType = t => String(t || "").startsWith("sm:");
function smartInit(p) { const d = SM[String(p.type).slice(3)]; if (!d) return; p.f = {}; (d.fields || []).forEach(([k, , , def]) => { p.f[k] = def; }); }
/* Delarna: ctx ger lokala hjälpare (rect/oct i objektets plan, add, card, pin, path, reach). */
function smartParts(p, z) {
  const d = SM[String(p.type).slice(3)]; if (!d) return [];
  const parts = [], W = (a, b) => placeToWorld(p, a, b), lib = placeLib(p.type) || {}, col = p.color || lib.color || d.color;
  const add = (pl, z0, z1, color, extra) => parts.push({ poly: pl, z0: z + z0, z1: z + z1, role: "body", transp: 0, color: color || col, ...(extra || {}) });
  const dt = smDateText(p), withDate = s => dt ? { ...s, rows: [...(s.rows || []), ["Gäller", dt]] } : s;
  const ctx = { parts, W, add, z,
    rect: (a0, a1, b0, b1) => [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, b]) => W(a, b)),
    oct: (r, n = 8, ox = 0, oy = 0) => Array.from({ length: n }, (_, i) => { const t = Math.PI / n + i * 2 * Math.PI / n; return W(ox + r * Math.cos(t), oy + r * Math.sin(t)); }),
    card: s => smCard(ctx, withDate(s)),
    cardAt: (pt, s) => { const pp = { ...p, x: pt[0], y: pt[1], rot: 0 }, c2 = { ...ctx, W: (a, b) => [pt[0] + a, pt[1] + b], z: (Number(pt[2]) || 0) + (Number(p.dz) || 0) }; c2.add = (pl, z0, z1, color, extra) => parts.push({ poly: pl, z0: c2.z + z0, z1: c2.z + z1, role: "body", transp: 0, color: color || col, ...(extra || {}) }); smCard(c2, withDate(s)); },
    pin: hex => { add(ctx.oct(0.2, 10), 0, 0.06, "#374151"); add(ctx.rect(-0.03, 0.03, -0.03, 0.03), 0.06, 1.2, "#9ca3af"); add(ctx.oct(0.22, 10), 1.2, 1.32, hex); add(ctx.oct(0.17, 10), 1.32, 1.42, hex); add(ctx.oct(0.1, 8), 1.42, 1.48, hex); },
    reach: (r, color) => parts.push({ poly: Array.from({ length: 48 }, (_, i) => W(r * Math.cos(i * 2 * Math.PI / 48), r * Math.sin(i * 2 * Math.PI / 48))), z0: z, z1: z + 0.04, role: "reach", transp: 0.8, color }),
    path: (w, color, h, arrows) => { const P = p.pts || []; for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], dd = Math.hypot(b[0] - a[0], b[1] - a[1]); if (dd < 0.01) continue; const ux = (b[0] - a[0]) / dd, uy = (b[1] - a[1]) / dd, z0 = Math.min(a[2] || 0, b[2] || 0) + (Number(p.dz) || 0);
        parts.push({ poly: [[a[0] + uy * w, a[1] - ux * w], [b[0] + uy * w, b[1] - ux * w], [b[0] - uy * w, b[1] + ux * w], [a[0] - uy * w, a[1] + ux * w]], z0, z1: z0 + h, role: "body", transp: 0.25, color });
        if (arrows) for (let s = 1.5; s < dd - 0.8; s += 3) { const cx = a[0] + ux * s, cy = a[1] + uy * s, q = Math.min(w * 0.7, 0.5); parts.push({ poly: [[cx + ux * q, cy + uy * q], [cx - ux * q * 0.6 + uy * q, cy - uy * q * 0.6 - ux * q], [cx - ux * q * 0.2, cy - uy * q * 0.2], [cx - ux * q * 0.6 - uy * q, cy - uy * q * 0.6 + ux * q]], z0: z0 + h, z1: z0 + h + 0.02, role: "body", transp: 0, color: "#ffffff" }); }
        else if (w > 0.8) { const dash = Math.min(w * 0.06, 0.12); for (let s = 0.5; s < dd - 1; s += 3) parts.push({ poly: [[a[0] + ux * s + uy * dash, a[1] + uy * s - ux * dash], [a[0] + ux * (s + 1.5) + uy * dash, a[1] + uy * (s + 1.5) - ux * dash], [a[0] + ux * (s + 1.5) - uy * dash, a[1] + uy * (s + 1.5) + ux * dash], [a[0] + ux * s - uy * dash, a[1] + uy * s + ux * dash]], z0: z0 + h, z1: z0 + h + 0.02, role: "body", transp: 0, color: "#fde047" }); } } } };
  d.build(p, ctx); return parts;
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
