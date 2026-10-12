/* Lägesplan – etiketter och prickar som vektorer i utskriftens PDF (Victor 2026-10-12: "Går det att få
   till bättre skärpa på dessa utan att filstorleken ökar markant?" – objektens prickar, namnetiketterna
   (K22, J24 …) och zonernas etiketter blev pixliga eftersom de låg i en genomskinlig bild i 150–200 dpi).

   Samma ritfunktioner som skärmen (drawObjects, drawObjectLabels, drawBadge) ritar mot en "inspelare"
   (pdfVecRecorder) – ett låtsas-canvas-2D som sparar ytor, linjer och texter i bildens pixlar. När PDF:en
   byggs skrivs de som riktiga PDF-vektorer och text (pdfVecEmit): knivskarpa i alla zoomnivåer och
   mindre än motsvarande bild. Går något fel ritas samma inspelning i bilden i stället (pdfVecReplay). */
function pdfVecRecorder() {
  const items = [];
  const meas = document.createElement("canvas").getContext("2d");
  const S = { m: [1, 0, 0, 1, 0, 0], fillStyle: "#000000", strokeStyle: "#000000", globalAlpha: 1, font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic", dash: [], lineWidth: 1, lineCap: "butt", lineJoin: "miter", clip: null };
  const stack = [];
  let subs = [], cur = null, last = null; // last: senaste punkten i bildens pixlar
  const T = p => applyAffine(S.m, p);
  const inv = () => invAffine(S.m);
  const local = p => applyAffine(inv(), p);
  const scaleOf = () => Math.sqrt(Math.abs(S.m[0] * S.m[3] - S.m[1] * S.m[2]));
  const add = p => { if (!cur) { cur = { pts: [], closed: false }; subs.push(cur); } cur.pts.push(p); last = p; };
  const move = p => { cur = { pts: [p], closed: false }; subs.push(cur); last = p; };
  const col = c => {
    c = typeof c === "string" ? c.trim() : "#000000";
    let m;
    if (/^#[0-9a-f]{6}$/i.test(c)) return { hex: c.toLowerCase(), a: 1 };
    if (/^#[0-9a-f]{3}$/i.test(c)) return { hex: "#" + c.slice(1).split("").map(x => x + x).join("").toLowerCase(), a: 1 };
    if (/^#[0-9a-f]{8}$/i.test(c)) return { hex: c.slice(0, 7).toLowerCase(), a: parseInt(c.slice(7), 16) / 255 };
    if ((m = c.match(/rgba?\(([^)]+)\)/i))) { const v = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat); return { hex: "#" + v.slice(0, 3).map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join(""), a: v.length > 3 ? v[3] : 1 }; }
    if (c.toLowerCase() === "transparent") return { hex: "#000000", a: 0 };
    meas.fillStyle = "#000000"; meas.fillStyle = c; // namngivna färger ("white" …) via webbläsaren
    return /^#/.test(meas.fillStyle) ? { hex: meas.fillStyle, a: 1 } : col(meas.fillStyle);
  };
  const arcPts = (cx, cy, r, a0, a1, ccw) => {
    let sweep = a1 - a0;
    if (Math.abs(sweep) >= Math.PI * 2 - 1e-9) sweep = ccw ? -Math.PI * 2 : Math.PI * 2;
    else { if (!ccw && sweep < 0) sweep += Math.PI * 2; if (ccw && sweep > 0) sweep -= Math.PI * 2; }
    const full = Math.max(12, Math.min(72, Math.ceil(r * scaleOf() * 3))); // små prickar (mönster) behöver färre punkter
    const n = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI * 2) * full));
    const out = [];
    for (let i = 0; i <= n; i++) { const a = a0 + sweep * i / n; out.push(T([cx + r * Math.cos(a), cy + r * Math.sin(a)])); }
    return out;
  };
  const copySubs = () => subs.filter(s => s.pts.length).map(s => ({ pts: s.pts.slice(), closed: s.closed, circle: s.circle }));
  const rec = {
    items,
    canvas: { width: 1e6, height: 1e6, id: "pdfvec", getBoundingClientRect: () => ({ width: 0, height: 0 }) },
    get fillStyle() { return S.fillStyle; }, set fillStyle(v) { S.fillStyle = v; },
    get strokeStyle() { return S.strokeStyle; }, set strokeStyle(v) { S.strokeStyle = v; },
    get globalAlpha() { return S.globalAlpha; }, set globalAlpha(v) { if (Number.isFinite(v)) S.globalAlpha = Math.max(0, Math.min(1, v)); },
    get font() { return S.font; }, set font(v) { S.font = v; },
    get textAlign() { return S.textAlign; }, set textAlign(v) { S.textAlign = v; },
    get textBaseline() { return S.textBaseline; }, set textBaseline(v) { S.textBaseline = v; },
    get lineWidth() { return S.lineWidth; }, set lineWidth(v) { if (Number.isFinite(v) && v > 0) S.lineWidth = v; },
    get lineCap() { return S.lineCap; }, set lineCap(v) { S.lineCap = v; },
    get lineJoin() { return S.lineJoin; }, set lineJoin(v) { S.lineJoin = v; },
    // Sådant som inte blir vektorer (skugga, övertoning, mönster, blandningslägen, filter): elementet görs som bild i stället.
    unsupported: false,
    get shadowBlur() { return S.shadowBlur || 0; }, set shadowBlur(v) { S.shadowBlur = v; },
    get shadowColor() { return S.shadowColor || "transparent"; }, set shadowColor(v) { S.shadowColor = v; },
    get globalCompositeOperation() { return S.gco || "source-over"; }, set globalCompositeOperation(v) { S.gco = v; if (v !== "source-over") rec.unsupported = true; },
    get filter() { return "none"; }, set filter(v) { if (v && v !== "none") rec.unsupported = true; },
    get shadowOffsetX() { return S.shadowOffsetX || 0; }, set shadowOffsetX(v) { S.shadowOffsetX = v; },
    get shadowOffsetY() { return S.shadowOffsetY || 0; }, set shadowOffsetY(v) { S.shadowOffsetY = v; },
    miterLimit: 10, lineDashOffset: 0, imageSmoothingEnabled: true,
    save() { stack.push({ ...S, dash: S.dash.slice(), m: S.m.slice() }); },
    restore() { const s = stack.pop(); if (s) Object.assign(S, s); },
    setTransform(a, b, c, d, e, f) { S.m = typeof a === "object" && a ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, f]; },
    resetTransform() { S.m = [1, 0, 0, 1, 0, 0]; },
    transform(a, b, c, d, e, f) { S.m = mulAffine(S.m, [a, b, c, d, e, f]); },
    translate(x, y) { S.m = mulAffine(S.m, [1, 0, 0, 1, x, y]); },
    scale(x, y) { S.m = mulAffine(S.m, [x, 0, 0, y, 0, 0]); },
    rotate(a) { const c = Math.cos(a), s = Math.sin(a); S.m = mulAffine(S.m, [c, s, -s, c, 0, 0]); },
    getTransform() { const [a, b, c, d, e, f] = S.m; return new DOMMatrix([a, b, c, d, e, f]); },
    setLineDash(d) { S.dash = Array.isArray(d) ? d.slice() : []; }, getLineDash() { return S.dash.slice(); },
    measureText(s) { meas.font = S.font; return meas.measureText(String(s ?? "")); },
    beginPath() { subs = []; cur = null; last = null; },
    moveTo(x, y) { move(T([x, y])); },
    lineTo(x, y) { add(T([x, y])); },
    closePath() { if (cur && cur.pts.length) { cur.closed = true; const p = cur.pts[0]; cur = null; last = p; } },
    rect(x, y, w, h) { move(T([x, y])); add(T([x + w, y])); add(T([x + w, y + h])); add(T([x, y + h])); this.closePath(); },
    roundRect(x, y, w, h, r) {
      let rr = Array.isArray(r) ? Number(r[0]) || 0 : Number(r) || 0;
      if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; }
      rr = Math.max(0, Math.min(rr, w / 2, h / 2));
      if (!rr) { this.rect(x, y, w, h); return; }
      this.moveTo(x + rr, y); this.arcTo(x + w, y, x + w, y + h, rr); this.arcTo(x + w, y + h, x, y + h, rr);
      this.arcTo(x, y + h, x, y, rr); this.arcTo(x, y, x + w, y, rr); this.closePath();
    },
    arc(cx, cy, r, a0, a1, ccw) {
      const pts = arcPts(cx, cy, Math.abs(r), a0, a1, !!ccw);
      // Hel cirkel som egen delväg (prickar): märks så att den kan skrivas som en prick i PDF:en.
      const fullC = Math.abs(a1 - a0) >= Math.PI * 2 - 1e-9 && Math.abs(S.m[0] - S.m[3]) < 1e-9 * Math.max(1, Math.abs(S.m[0])) && Math.abs(S.m[1] + S.m[2]) < 1e-9 * Math.max(1, Math.abs(S.m[1]) + 1);
      const fresh = !cur || !cur.pts.length || (cur.pts.length === 1 && Math.hypot(cur.pts[0][0] - pts[0][0], cur.pts[0][1] - pts[0][1]) < 1e-6 * Math.max(1, Math.abs(r * scaleOf())));
      if (fullC && fresh) { if (cur && cur.pts.length) subs.pop(); cur = { pts, closed: true, circle: { c: T([cx, cy]), r: Math.abs(r) * scaleOf() } }; subs.push(cur); cur = null; last = pts[pts.length - 1]; return; }
      if (cur && cur.pts.length) pts.forEach(add); else { move(pts[0]); pts.slice(1).forEach(add); }
    },
    ellipse(cx, cy, rx, ry, rot, a0, a1, ccw) { const m = S.m.slice(); this.translate(cx, cy); this.rotate(rot || 0); this.scale(rx || 1e-9, ry || 1e-9); this.arc(0, 0, 1, a0, a1, ccw); S.m = m; },
    arcTo(x1, y1, x2, y2, r) {
      // Rundat hörn som canvas: tangentpunkter mot båda linjerna och en båge mellan dem.
      if (!last) { this.moveTo(x1, y1); return; }
      const [x0, y0] = local(last);
      const v1 = [x0 - x1, y0 - y1], v2 = [x2 - x1, y2 - y1], l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
      const ang = l1 && l2 ? Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)))) : 0;
      if (!r || !l1 || !l2 || ang < 1e-6 || Math.abs(ang - Math.PI) < 1e-6) { this.lineTo(x1, y1); return; }
      const t = r / Math.tan(ang / 2);
      const p1 = [x1 + v1[0] / l1 * t, y1 + v1[1] / l1 * t], p2 = [x1 + v2[0] / l2 * t, y1 + v2[1] / l2 * t];
      const bis = [v1[0] / l1 + v2[0] / l2, v1[1] / l1 + v2[1] / l2], bl = Math.hypot(...bis), d = r / Math.sin(ang / 2);
      const c = [x1 + bis[0] / bl * d, y1 + bis[1] / bl * d];
      const a0 = Math.atan2(p1[1] - c[1], p1[0] - c[0]), a1 = Math.atan2(p2[1] - c[1], p2[0] - c[0]);
      const cross = v1[0] * v2[1] - v1[1] * v2[0];
      this.lineTo(p1[0], p1[1]);
      arcPts(c[0], c[1], r, a0, a1, cross > 0).slice(1).forEach(add);
    },
    quadraticCurveTo(cx, cy, x, y) { const p0 = last ? local(last) : [cx, cy]; for (let i = 1; i <= 12; i++) { const t = i / 12, u = 1 - t; add(T([u * u * p0[0] + 2 * u * t * cx + t * t * x, u * u * p0[1] + 2 * u * t * cy + t * t * y])); } },
    bezierCurveTo(ax, ay, bx, by, x, y) { const p0 = last ? local(last) : [ax, ay]; for (let i = 1; i <= 16; i++) { const t = i / 16, u = 1 - t; add(T([u * u * u * p0[0] + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * x, u * u * u * p0[1] + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * y])); } },
    fill() { if (typeof S.fillStyle !== "string") rec.unsupported = true; shadowCheck(); const c = col(S.fillStyle), a = c.a * S.globalAlpha; const sp = copySubs(); if (a > 0.003 && sp.length) items.push({ t: "F", subs: sp, hex: c.hex, a, clip: S.clip }); },
    stroke() { if (typeof S.strokeStyle !== "string") rec.unsupported = true; shadowCheck(); const c = col(S.strokeStyle), a = c.a * S.globalAlpha, k = scaleOf(); const sp = copySubs(); if (a > 0.003 && sp.length) items.push({ t: "S", subs: sp, hex: c.hex, a, lw: S.lineWidth * k, dash: S.dash.map(v => v * k), cap: S.lineCap, join: S.lineJoin, clip: S.clip }); },
    fillRect(x, y, w, h) { const sv = [subs, cur, last]; this.beginPath(); this.rect(x, y, w, h); this.fill(); [subs, cur, last] = sv; },
    strokeRect(x, y, w, h) { const sv = [subs, cur, last]; this.beginPath(); this.rect(x, y, w, h); this.stroke(); [subs, cur, last] = sv; },
    // Klippning (t.ex. zonens mönster mot zonen): följer med varje del och sparas/återställs med save/restore.
    clip() { const sp = copySubs().filter(x => x.pts.length > 2); if (sp.length) S.clip = (S.clip || []).concat([sp]); },
    clearRect() {}, putImageData() { rec.unsupported = true; },
    // Bilder (t.ex. loggan i ritningshuvudet): som bild i PDF:en, rak (vriden/skev = elementet som bild).
    drawImage(img, a, b, c, d, e, f, g, h) {
      if (!img) return;
      const iw = img.naturalWidth || img.videoWidth || img.width, ih = img.naturalHeight || img.videoHeight || img.height;
      let sx = 0, sy = 0, sw = iw, sh = ih, dx, dy, dw, dh;
      if (e === undefined) { dx = a; dy = b; dw = c === undefined ? iw : c; dh = d === undefined ? ih : d; }
      else { sx = a; sy = b; sw = c; sh = d; dx = e; dy = f; dw = g; dh = h; }
      if (Math.abs(S.m[1]) > 1e-9 || Math.abs(S.m[2]) > 1e-9) { rec.unsupported = true; return; }
      shadowCheck();
      items.push({ t: "I", img, sx, sy, sw, sh, p0: T([dx, dy]), p1: T([dx + dw, dy + dh]), a: S.globalAlpha, clip: S.clip });
    },
    createPattern() { rec.unsupported = true; return "rgba(0,0,0,0)"; }, createLinearGradient() { rec.unsupported = true; return { addColorStop() {} }; }, createRadialGradient() { rec.unsupported = true; return { addColorStop() {} }; },
    fillText(s, x, y, mw) { text(s, x, y, "fill", mw); },
    strokeText(s, x, y, mw) { text(s, x, y, "stroke", mw); },
  };
  function shadowCheck() { if ((S.shadowBlur || S.shadowOffsetX || S.shadowOffsetY) && col(S.shadowColor || "transparent").a > 0.01) rec.unsupported = true; }
  function text(s, x, y, mode, maxW) {
    s = String(s ?? ""); if (!s.trim()) return;
    const c = col(mode === "fill" ? S.fillStyle : S.strokeStyle), a = c.a * S.globalAlpha;
    if (a < 0.003) return;
    const k = scaleOf(), px = parseFloat((S.font.match(/([\d.]+)px/) || [0, 10])[1]);
    shadowCheck();
    let w = (meas.font = S.font, meas.measureText(s).width);
    if (Number.isFinite(maxW) && maxW > 0 && w > maxW) w = maxW; // canvas trycker ihop texten – PDF:en krymper den
    const wt = (S.font.match(/(^|\s)(bold|[6-9]00)(\s|$)/) || [])[0];
    items.push({ t: "T", s, p: T([x, y]), rot: Math.atan2(S.m[1], S.m[0]), size: px * k, w: w * k, bold: !!wt, italic: /italic/.test(S.font),
      align: { start: "left", left: "left", center: "center", right: "right", end: "right" }[S.textAlign] || "left", base: S.textBaseline, hex: c.hex, a, mode, lw: S.lineWidth * k, join: S.lineJoin, clip: S.clip });
  }
  return rec;
}

/* Inspelningen som PDF-vektorer. T: bildens pixlar -> sidans mm, clip: [x, y, w, h] i mm (ritningens ram).
   Texter med tecken som PDF:ens Helvetica saknar (t.ex. emoji) skrivs inte – de lämnas tillbaka så att
   de kan läggas som bild i stället. */
const PDFVEC_WINANSI = /^[\x20-\x7e\xa0-\xff€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]*$/;
function pdfVecEmit(doc, rec, T, clip) {
  const skipped = [];
  if (!rec || !rec.items.length) return skipped;
  const s = Math.sqrt(Math.abs(T[0] * T[3] - T[1] * T[2])), P = p => applyAffine(T, p);
  const [cx, cy, cw, ch] = clip;
  const inClip = pts => pts.some(([x, y]) => x >= cx - 2 && x <= cx + cw + 2 && y >= cy - 2 && y <= cy + ch + 2);
  const mmPt = typeof PT_MM !== "undefined" ? PT_MM : 25.4 / 72;
  let curA = 1;
  const alpha = a => { a = Math.round(Math.min(1, a) * 100) / 100; if (a === curA || !doc.GState) return; doc.setGState(new doc.GState({ opacity: a, "stroke-opacity": a })); curA = a; };
  const pathOf = subs => {
    let any = false;
    subs.forEach(sp => {
      const pts = sp.pts.map(P).filter((p, i, a) => !i || Math.abs(p[0] - a[i - 1][0]) > 1e-4 || Math.abs(p[1] - a[i - 1][1]) > 1e-4);
      if (pts.length < 2 && !(pts.length === 1 && sp.closed)) return;
      const d = []; for (let i = 1; i < pts.length; i++) d.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
      if (!d.length) return;
      doc.lines(d, pts[0][0], pts[0][1], [1, 1], null, !!sp.closed); any = true;
    });
    return any;
  };
  // Inre klippning: ett eget grafikläge per klippyta (alla delar i rad med samma klippning delar det).
  let curClip = null, aOut = 1;
  const setClip = c => {
    if (c === curClip) return;
    if (curClip) { doc.restoreGraphicsState(); curA = aOut; }
    curClip = c;
    if (c) { aOut = curA; doc.saveGraphicsState(); c.forEach(sp => { if (pathOf(sp)) { doc.clip(); doc.discardPath(); } }); }
  };
  const bbox = subs => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; subs.forEach(sp => sp.pts.forEach(q => { const [x, y] = P(q); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; })); return [x0, y0, x1, y1]; };
  const boxIn = ([x0, y0, x1, y1]) => x1 >= cx - 2 && x0 <= cx + cw + 2 && y1 >= cy - 2 && y0 <= cy + ch + 2;
  doc.saveGraphicsState();
  doc.rect(cx, cy, cw, ch, null); doc.clip(); doc.discardPath();
  try {
    for (const it of rec.items) {
      if (it.t === "F" || it.t === "S") {
        if (!boxIn(bbox(it.subs))) continue;
        setClip(it.clip || null);
        alpha(it.a);
        if (it.t === "F") {
          // Prickar (hela cirklar) som streck utan längd med runda ändar: en prick ≈ 20 byte i stället för en kurva.
          const dots = it.subs.filter(sp => sp.circle), rest = it.subs.filter(sp => !sp.circle);
          if (dots.length) {
            doc.setDrawColor(it.hex); doc.setLineCap("round");
            const byR = new Map();
            dots.forEach(sp => { const r = Math.round(sp.circle.r * s * 2 * 1000) / 1000; if (!byR.has(r)) byR.set(r, []); byR.get(r).push(P(sp.circle.c)); });
            byR.forEach((list, d) => {
              doc.setLineWidth(Math.max(0.02, d));
              let n = 0;
              list.forEach(([x, y]) => { if (x < cx - d || x > cx + cw + d || y < cy - d || y > cy + ch + d) return; doc.lines([[0.001, 0]], x - 0.0005, y, [1, 1], null, false); n++; });
              if (n) doc.stroke();
            });
            doc.setLineCap("butt");
          }
          if (rest.length) { doc.setFillColor(it.hex); if (pathOf(rest)) doc.fill(); }
          continue;
        }
        doc.setDrawColor(it.hex); doc.setLineWidth(Math.max(0.02, it.lw * s));
        doc.setLineCap(it.cap === "round" ? "round" : it.cap === "square" ? "square" : "butt");
        doc.setLineJoin(it.join === "round" ? "round" : it.join === "bevel" ? "bevel" : "miter");
        const dash = it.dash && it.dash.length ? it.dash.map(v => Math.max(0.01, v * s)) : null;
        if (dash) doc.setLineDashPattern(dash.length % 2 ? dash.concat(dash) : dash, 0);
        if (pathOf(it.subs)) doc.stroke();
        if (dash) doc.setLineDashPattern([], 0);
      } else if (it.t === "I") {
        const a0 = P(it.p0), a1 = P(it.p1), x = Math.min(a0[0], a1[0]), y = Math.min(a0[1], a1[1]), w = Math.abs(a1[0] - a0[0]), h = Math.abs(a1[1] - a0[1]);
        if (w < 0.01 || h < 0.01 || !boxIn([x, y, x + w, y + h])) continue;
        setClip(it.clip || null); alpha(it.a);
        // Bildens egen upplösning, högst ~400 dpi på papperet (som förut aldrig sämre än 300 dpi).
        const kx = Math.min(1, w / 25.4 * 400 / Math.max(1, it.sw)), cw2 = Math.max(1, Math.round(it.sw * kx)), ch2 = Math.max(1, Math.round(it.sh * kx));
        const cv = document.createElement("canvas"); cv.width = cw2; cv.height = ch2;
        cv.getContext("2d").drawImage(it.img, it.sx, it.sy, it.sw, it.sh, 0, 0, cw2, ch2);
        doc.addImage(cv.toDataURL("image/png"), "PNG", x, y, w, h, undefined, "FAST");
      } else if (it.t === "T") {
        const p = P(it.p);
        if (!inClip([p])) continue;
        setClip(it.clip || null);
        if (!PDFVEC_WINANSI.test(it.s)) { skipped.push(it); continue; }
        alpha(it.a);
        doc.setFont("helvetica", it.bold ? (it.italic ? "bolditalic" : "bold") : it.italic ? "italic" : "normal");
        let size = it.size * s / mmPt;
        doc.setFontSize(size);
        // Helvetica är lite bredare än skärmens typsnitt: krymp så att texten får plats där den mättes.
        const want = it.w * s, got = doc.getTextWidth(it.s);
        if (got > want * 1.01 && want > 0) { size *= want / got; doc.setFontSize(size); }
        const w = Math.min(got, want || got), rot = it.rot, cs = Math.cos(rot), sn = Math.sin(rot);
        const off = it.align === "center" ? -w / 2 : it.align === "right" ? -w : 0;
        const base = { top: "top", hanging: "hanging", middle: "middle", alphabetic: "alphabetic", ideographic: "ideographic", bottom: "bottom" }[it.base] || "alphabetic";
        const opt = { baseline: base, angle: -rot * 180 / Math.PI };
        if (it.mode === "stroke") { doc.setDrawColor(it.hex); doc.setLineWidth(Math.max(0.02, it.lw * s)); doc.setLineJoin("round"); opt.renderingMode = "stroke"; }
        else doc.setTextColor(it.hex);
        doc.text(it.s, p[0] + off * cs, p[1] + off * sn, opt);
      }
    }
  } finally { setClip(null); alpha(1); doc.restoreGraphicsState(); doc.setLineJoin("miter"); doc.setLineCap("butt"); doc.setTextColor(0); }
  return skipped;
}

/* Reserv: samma inspelning ritad i en canvas (bildens pixlar). */
function pdfVecReplay(ctx, rec) {
  if (!rec) return;
  ctx.save(); // i ctx:ens nuvarande koordinater (vanligen bildens pixlar)
  const path = subs => { ctx.beginPath(); subs.forEach(sp => { sp.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); if (sp.closed) ctx.closePath(); }); };
  let curClip = null;
  for (const it of rec.items) {
    if ((it.clip || null) !== curClip) {
      if (curClip) ctx.restore();
      curClip = it.clip || null;
      if (curClip) { ctx.save(); curClip.forEach(sp => { path(sp); ctx.clip(); }); }
    }
    ctx.globalAlpha = it.a;
    if (it.t === "I") { ctx.drawImage(it.img, it.sx, it.sy, it.sw, it.sh, it.p0[0], it.p0[1], it.p1[0] - it.p0[0], it.p1[1] - it.p0[1]); continue; }
    if (it.t === "F") { ctx.fillStyle = it.hex; path(it.subs); ctx.fill(); }
    else if (it.t === "S") { ctx.strokeStyle = it.hex; ctx.lineWidth = it.lw; ctx.lineCap = it.cap; ctx.lineJoin = it.join; ctx.setLineDash(it.dash || []); path(it.subs); ctx.stroke(); ctx.setLineDash([]); }
    else if (it.t === "T") {
      ctx.save(); ctx.translate(it.p[0], it.p[1]); ctx.rotate(it.rot);
      ctx.font = `${it.italic ? "italic " : ""}${it.bold ? "600 " : ""}${it.size}px "Segoe UI", Arial, sans-serif`; ctx.textAlign = it.align; ctx.textBaseline = it.base;
      if (it.mode === "stroke") { ctx.strokeStyle = it.hex; ctx.lineWidth = it.lw; ctx.lineJoin = "round"; ctx.strokeText(it.s, 0, 0); } else { ctx.fillStyle = it.hex; ctx.fillText(it.s, 0, 0); }
      ctx.restore();
    }
  }
  if (curClip) ctx.restore();
  ctx.restore();
}
