/* TC Bubbles – lite-app för info-bubblor på bilder ur Trimble Connects 3D-vy.
   Helt manuell: ingen koppling till Gantt/4D-data. Bubblorna har egen rubrik, aktivitetstext, datumtext, framdrift i procent och anteckning,
   kan dras och låsas, och sparas tillsammans med kameran som vyer (så att veckobilden blir exakt densamma varje gång).
   Fungerar även utanför Trimble Connect (öppna en bild från datorn). Vyer sparas i webbläsaren och kan exporteras/importeras som fil. */

const FAM = "Arial, Helvetica, sans-serif";
const COL = { grey: "#9aa3af", yellow: "#eadb2b", green: "#2fa84f", red: "#e5262b", blue: "#2563eb", ink: "#334155" };
const SWATCH = [["auto", "Auto efter %"], ["red", "Röd"], ["yellow", "Gul"], ["green", "Grön"], ["blue", "Blå"], ["grey", "Grå"], ["ink", "Mörk"]];
const MON = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

let API = null, tcOn = false, projectId = "lokal", projectName = "";
const S = {
  bmp: null, W: 1600, H: 900, k: 1, cam: null, bubbles: [], sel: null, hover: null, nextId: 1,
  g: { scale: 1, lines: true, sharp: 0 }, date: { on: false, text: "", fx: 0.02, fy: 0.03, scale: 1 }, ui: true, undo: [], viewSel: -1, srcSize: null
};
let views = [];
const $ = id => document.getElementById(id);
const cv = $("cv"), ctx = cv.getContext("2d"), sideEl = $("side");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function say(t, warn) { const m = $("msg"); m.textContent = t || ""; m.classList.toggle("warn", !!warn); }

/* ---------- Datum ---------- */
function isoWeek(d) { const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const n = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - n); const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return Math.ceil(((t - y0) / 864e5 + 1) / 7); }
function weekText(d) { d = d || new Date(); return `v.${isoWeek(d)} · ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; }
function addDaysToText(text, days) { // flyttar ett datum i texten "v.47 · 17 nov 2026" framåt; andra texter lämnas orörda
  const m = /^v\.\d+ · (\d{1,2}) (\w{3}) (\d{4})$/.exec(text || ""); if (!m) return text;
  const mi = MON.indexOf(m[2]); if (mi < 0) return text; const d = new Date(+m[3], mi, +m[1] + days); return weekText(d);
}

/* ---------- Bubblor ---------- */
function newBubble(o) {
  return { id: S.nextId++, name: "Ny bubbla", act: "", dt: "", note: "", prog: 0, late: false, col: "auto", scale: 1, lock: false, fx: 0.4, fy: 0.3, fax: 0.5, fay: 0.5, ...o };
}
const bubbleCol = b => b.col !== "auto" && COL[b.col] ? COL[b.col] : b.late ? COL.red : (Number(b.prog) >= 100 ? COL.green : Number(b.prog) > 0 ? COL.yellow : COL.grey);
function wrap(c, txt, maxW, lines) {
  const out = []; let cur = "";
  String(txt || "").split(/\n/).forEach(par => {
    cur = "";
    par.split(" ").forEach(w => { const t = cur ? cur + " " + w : w; if (cur && c.measureText(t).width > maxW) { out.push(cur); cur = w; } else cur = t; });
    out.push(cur);
  });
  if (out.length > lines) { const k = out.slice(0, lines); let l = k[lines - 1]; while (l.length > 1 && c.measureText(l + "…").width > maxW) l = l.slice(0, -1); k[lines - 1] = l.replace(/\s+$/, "") + "…"; return k; }
  return out;
}
const base = () => Math.max(0.9, S.W / 1500) * S.g.scale;
function measure(b) {
  const kk = base() * b.scale, W = 240 * kk;
  ctx.font = `700 ${15 * kk}px ${FAM}`; b._name = wrap(ctx, b.name || "", W - 30 * kk, 3);
  ctx.font = `${11.5 * kk}px ${FAM}`;
  const sub = []; if (b.dt) sub.push(wrap(ctx, b.dt, W - 24 * kk, 1)[0]); if (b.act) sub.push(...wrap(ctx, b.act, W - 24 * kk, 2));
  b._sub = sub; b._note = b.note ? wrap(ctx, b.note, W - 30 * kk, 3) : [];
  const hasProg = Number.isFinite(b.prog);
  b._kk = kk; b._w = W; b._h = (b._name.length * 18 + b._sub.length * 16 + (b._note.length ? b._note.length * 14 + 8 : 0) + (hasProg ? 34 : 20)) * kk;
  b._x = b.fx * S.W; b._y = b.fy * S.H; b._ax = b.fax * S.W; b._ay = b.fay * S.H;
}
function rr(x, y, w, h, r) { ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h); }
function drawBubble(b) {
  const x = b._x, y = b._y, kk = b._kk, col = bubbleCol(b);
  ctx.save(); ctx.shadowColor = "rgba(15,23,42,.28)"; ctx.shadowBlur = 14 * kk; ctx.shadowOffsetY = 3 * kk; ctx.fillStyle = "#fff"; rr(x, y, b._w, b._h, 5 * kk); ctx.fill(); ctx.restore();
  ctx.fillStyle = col; ctx.fillRect(x, y + 1, 5 * kk, b._h - 2);
  let ty = y + 8 * kk; const tx = x + 14 * kk; ctx.textBaseline = "top";
  ctx.fillStyle = "#111827"; ctx.font = `700 ${15 * kk}px ${FAM}`; b._name.forEach(l => { ctx.fillText(l, tx, ty); ty += 18 * kk; });
  ctx.font = `${11.5 * kk}px ${FAM}`; ctx.fillStyle = "#4b5563"; b._sub.forEach(l => { ctx.fillText(l, tx, ty + kk); ty += 16 * kk; });
  if (b._note.length) { ty += 4 * kk; const nh = b._note.length * 14 * kk + 4 * kk; ctx.fillStyle = "#fef9c3"; rr(tx - 4 * kk, ty - 2 * kk, b._w - 22 * kk, nh, 3 * kk); ctx.fill(); ctx.fillStyle = "#111827"; ctx.font = `italic ${11.5 * kk}px ${FAM}`; b._note.forEach(l => { ctx.fillText(l, tx, ty); ty += 14 * kk; }); }
  if (Number.isFinite(b.prog)) {
    const by = y + b._h - 14 * kk, bw = b._w - 70 * kk, p = clamp(Math.round(b.prog), 0, 100);
    ctx.fillStyle = "#e5e7eb"; rr(tx, by, bw, 5 * kk, 3 * kk); ctx.fill();
    if (p > 0) { ctx.fillStyle = b.late ? COL.red : col; rr(tx, by, Math.max(5 * kk, bw * p / 100), 5 * kk, 3 * kk); ctx.fill(); }
    ctx.fillStyle = "#111827"; ctx.font = `700 ${12 * kk}px ${FAM}`; ctx.textBaseline = "middle"; ctx.fillText(`${p} %`, tx + bw + 8 * kk, by + 2.5 * kk);
  }
}
function leaderStart(b) {
  const px = clamp(b._ax, b._x + 12, b._x + b._w - 12);
  if (b._ay > b._y + b._h) return { x: px, y: b._y + b._h };
  if (b._ay < b._y) return { x: px, y: b._y };
  return b._ax < b._x ? { x: b._x, y: b._ay } : b._ax > b._x + b._w ? { x: b._x + b._w, y: b._ay } : null;
}
function dateBox() {
  const d = S.date, kk = Math.max(0.9, S.W / 1500) * d.scale; ctx.font = `700 ${22 * kk}px ${FAM}`;
  const w = ctx.measureText(d.text || " ").width + 34 * kk, h = 38 * kk; return { x: d.fx * S.W, y: d.fy * S.H, w, h, kk };
}
function draw() {
  const { W, H } = S; if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
  ctx.clearRect(0, 0, W, H);
  if (S.photo) ctx.drawImage(S.photo, 0, 0, W, H); else { ctx.fillStyle = "#cbd5e1"; ctx.fillRect(0, 0, W, H); }
  S.bubbles.forEach(measure);
  const k = Math.max(0.9, W / 1500);
  if (S.g.lines) S.bubbles.forEach(b => {
    const p = leaderStart(b); if (!p) return; const col = bubbleCol(b);
    ctx.strokeStyle = col; ctx.lineWidth = 2.5 * k; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(b._ax, b._ay); ctx.stroke();
    ctx.fillStyle = col; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.arc(b._ax, b._ay, 6 * k, 0, 7); ctx.fill(); ctx.stroke();
  });
  S.bubbles.forEach(drawBubble);
  if (S.date.on) { const q = dateBox(); ctx.save(); ctx.fillStyle = "rgba(15,23,42,.88)"; rr(q.x, q.y, q.w, q.h, 8 * q.kk); ctx.fill(); ctx.fillStyle = "#fff"; ctx.font = `700 ${22 * q.kk}px ${FAM}`; ctx.textBaseline = "middle"; ctx.fillText(S.date.text, q.x + 17 * q.kk, q.y + q.h / 2 + 1); ctx.restore(); }
  if (S.ui) {
    S.bubbles.filter(b => b.lock).forEach(b => { ctx.save(); ctx.font = `${13 * b._kk}px ${FAM}`; ctx.textBaseline = "top"; ctx.fillStyle = "#334155"; ctx.fillText("🔒", b._x + b._w - 22 * b._kk, b._y + 4 * b._kk); ctx.restore(); });
    const s = S.sel; if (s) { ctx.save(); ctx.strokeStyle = "#2563eb"; ctx.lineWidth = 2.5 * k; ctx.setLineDash([6 * k, 4 * k]); rr(s._x - 3 * k, s._y - 3 * k, s._w + 6 * k, s._h + 6 * k, 6 * k); ctx.stroke(); ctx.restore(); }
    const h = S.hover; if (h && S.bubbles.includes(h)) { const cx = h._x + h._w - 2 * k, cy = h._y + 2 * k, r = 11 * k; ctx.save(); ctx.fillStyle = "#dc2626"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.4 * k; ctx.lineCap = "round"; const d = r * 0.38; ctx.beginPath(); ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d); ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d); ctx.stroke(); ctx.restore(); }
  }
}

/* ---------- Bild ---------- */
function buildPhoto() {
  if (!S.bmp) { S.photo = null; return; }
  const { bmp, W, H } = S; let src = bmp, w = bmp.width;
  while (w < W) { const nw = Math.min(W, Math.round(w * 1.5)), c = document.createElement("canvas"); c.width = nw; c.height = Math.round(nw * H / W); const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, c.width, c.height); src = c; w = nw; }
  const out = document.createElement("canvas"); out.width = W; out.height = H; const o = out.getContext("2d"); o.imageSmoothingQuality = "high"; o.drawImage(src, 0, 0, W, H); S.photo = out;
}
async function loadBlob(blob) {
  const bmp = await createImageBitmap(blob), s = Math.max(1, Math.min(3, Math.round(2000 / bmp.width)));
  S.bmp = bmp; S.W = bmp.width * s; S.H = bmp.height * s; S.srcSize = [bmp.width, bmp.height]; buildPhoto();
  cv.classList.remove("hidden"); $("empty").classList.add("hidden"); draw();
}
async function snapshotBlob() {
  const V = API && API.viewer; if (!V || typeof V.getSnapshot !== "function") throw new Error("Trimble Connect-vyn kan inte ta stillbilder här");
  let s = await V.getSnapshot();
  if (s && typeof s === "object" && !(s instanceof Blob)) s = s.data || s.image || s.dataUrl || s.url || s;
  if (s instanceof Blob) return s;
  if (typeof s !== "string") throw new Error("Oväntat svar från Trimble Connect (stillbild)");
  return await (await fetch(s.startsWith("data:") || /^(blob|https?):/.test(s) ? s : "data:image/png;base64," + s)).blob();
}
async function takePhoto() {
  if (!tcOn) { say("Foto kräver Trimble Connect – öppna en bild från datorn med 🖼 i stället.", true); return false; }
  try { say("Tar foto …"); try { S.cam = await API.viewer.getCamera(); } catch (e) { S.cam = null; } await loadBlob(await snapshotBlob()); say(""); renderSide(); return true; }
  catch (e) { say("Kunde inte ta foto: " + ((e && (e.message || e.error)) || "Trimble Connect svarade inte"), true); return false; }
}

/* ---------- Ändringar, ångra ---------- */
const snap = () => JSON.stringify({ b: S.bubbles.map(({ _name, _sub, _note, _kk, _w, _h, _x, _y, _ax, _ay, ...r }) => r), d: S.date });
function commit() { S.undo.push(snap()); if (S.undo.length > 60) S.undo.shift(); persistDraft(); }
function undo() { if (S.undo.length < 2) return; S.undo.pop(); const st = JSON.parse(S.undo[S.undo.length - 1]); S.bubbles = st.b; S.date = st.d; S.sel = null; draw(); renderSide(); }
function persistDraft() { try { localStorage.setItem(`tcb-draft:${projectId}`, snap()); } catch (e) { /* */ } }
function restoreDraft() { try { const st = JSON.parse(localStorage.getItem(`tcb-draft:${projectId}`) || "null"); if (st && Array.isArray(st.b)) { S.bubbles = st.b; S.date = { ...S.date, ...(st.d || {}) }; S.nextId = Math.max(1, ...S.bubbles.map(b => b.id + 1)); } } catch (e) { /* */ } }

/* ---------- Åtgärder ---------- */
function addBubbleAt(px, py) {
  const n = S.bubbles.length, b = newBubble({ fax: px / S.W, fay: py / S.H }); measure(b);
  b.fx = clamp((px - b._w / 2) / S.W, 0.005, 1 - b._w / S.W - 0.005); b.fy = clamp((py - b._h - 56 * b._kk) / S.H, 0.005, 1 - b._h / S.H - 0.005);
  b.name = "Ny bubbla"; S.bubbles.push(b); S.sel = b; commit(); draw(); renderSide(); const t = $("fName"); if (t) { t.focus(); t.select(); } return b;
}
function dupSel() {
  const s = S.sel; if (!s) { say("Markera en bubbla först."); return; }
  const c = newBubble({ ...s, id: undefined, lock: false, fx: clamp(s.fx + 0.03, 0, 0.95), fy: clamp(s.fy + 0.04, 0, 0.95), fax: clamp(s.fax + 0.03, 0, 1), fay: clamp(s.fay + 0.04, 0, 1) }); c.id = S.nextId++;
  S.bubbles.push(c); S.sel = c; commit(); draw(); renderSide();
}
function removeBubble(b) { const i = S.bubbles.indexOf(b); if (i < 0) return; S.bubbles.splice(i, 1); if (S.sel === b) S.sel = null; if (S.hover === b) S.hover = null; commit(); draw(); renderSide(); }
function arrange() {
  const gap = 8 * Math.max(0.9, S.W / 1500), m = 10 * Math.max(0.9, S.W / 1500), L = S.bubbles; L.forEach(measure);
  L.forEach(b => { if (!b.lock) { b._x = b._ax - b._w / 2; b._y = b._ay - b._h - 56 * b._kk; } });
  for (let it = 0; it < 80; it++) {
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j]; if (a.lock && b.lock) continue;
      const ox = Math.min(a._x + a._w, b._x + b._w) - Math.max(a._x, b._x) + gap, oy = Math.min(a._y + a._h, b._y + b._h) - Math.max(a._y, b._y) + gap;
      if (ox > 0 && oy > 0) { const fa = a.lock ? 0 : b.lock ? 2 : 1, fb = b.lock ? 0 : a.lock ? 2 : 1;
        if (oy < ox) { const s = (a._y + a._h / 2 <= b._y + b._h / 2) ? -1 : 1; a._y += s * oy / 2 * fa; b._y -= s * oy / 2 * fb; } else { const s = (a._x + a._w / 2 <= b._x + b._w / 2) ? -1 : 1; a._x += s * ox / 2 * fa; b._x -= s * ox / 2 * fb; } }
    }
    L.forEach(b => { if (!b.lock) { b._x = clamp(b._x, m, S.W - b._w - m); b._y = clamp(b._y, m, S.H - b._h - m); } });
  }
  L.forEach(b => { if (!b.lock) { b.fx = b._x / S.W; b.fy = b._y / S.H; } }); commit(); draw();
}
function lockAll() { const on = S.bubbles.some(b => !b.lock); S.bubbles.forEach(b => { b.lock = on; }); commit(); draw(); renderSide(); say(on ? "Alla bubblor låsta" : "Alla bubblor upplåsta"); }
function bumpAll(n) { S.bubbles.forEach(b => { if (Number.isFinite(b.prog)) b.prog = clamp(Math.round(b.prog + n), 0, 100); }); commit(); draw(); renderSide(); }

/* ---------- Export ---------- */
function renderPlain() { const u = S.ui; S.ui = false; draw(); const c = cv; S.ui = u; return c; }
const dl = (blob, name) => { const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); };
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/^(\d{8})(\d{4})$/, "$1-$2");
function exportPng() { renderPlain(); cv.toBlob(b => { draw(); dl(b, `TC-Bubbles-${stamp()}.png`); }, "image/png"); }
async function copyImg() { renderPlain(); try { const b = await new Promise(r => cv.toBlob(r, "image/png")); await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]); say("Bilden kopierad"); } catch (e) { say("Kunde inte kopiera – ladda ner PNG i stället.", true); } draw(); }
async function exportPdf() {
  renderPlain(); const jpg = await new Promise(r => cv.toBlob(r, "image/jpeg", 0.93)); draw();
  const bytes = new Uint8Array(await jpg.arrayBuffer()), w = 842, h = Math.round(842 * S.H / S.W), enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const push = d => { const u = typeof d === "string" ? enc.encode(d) : d; parts.push(u); len += u.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); if (typeof body === "string") push(body); else body(); push("\nendobj\n"); };
  push("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>"); obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${S.W} /Height ${S.H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`); push(bytes); push("\nendstream"); });
  const cs = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`; obj(5, `<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`);
  const xr = len; push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map(n => String(offs[n]).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`);
  dl(new Blob(parts, { type: "application/pdf" }), `TC-Bubbles-${stamp()}.pdf`);
}

/* ---------- Vyer ---------- */
const vKey = () => `tcb-views:${projectId}`;
function loadViews() { try { const a = JSON.parse(localStorage.getItem(vKey()) || "[]"); views = Array.isArray(a) ? a.filter(v => v && v.name && v.data) : []; } catch (e) { views = []; } }
function storeViews() { try { localStorage.setItem(vKey(), JSON.stringify(views)); return true; } catch (e) { say("Kunde inte spara – webbläsarens lagring är full eller avstängd.", true); return false; } }
function viewData() {
  return { cam: S.cam ? JSON.parse(JSON.stringify(S.cam)) : null, asp: Math.round(S.W / S.H * 1000) / 1000, src: S.srcSize, g: { ...S.g }, date: { ...S.date },
    bubbles: S.bubbles.map(({ _name, _sub, _note, _kk, _w, _h, _x, _y, _ax, _ay, id, ...r }) => r) };
}
function saveView(name, overwriteIdx) {
  name = String(name || "").trim(); if (!name) { say("Skriv ett namn på vyn först.", true); return false; }
  const i = overwriteIdx >= 0 ? overwriteIdx : views.findIndex(v => v.name === name), rec = { name, at: new Date().toISOString(), data: viewData() };
  if (i >= 0) views[i] = rec; else views.push(rec); S.viewSel = i >= 0 ? i : views.length - 1;
  if (!storeViews()) return false; renderSide(); say(`Vyn "${name}" sparad`); return true;
}
const camClose = (a, b) => { if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 1e-3 * (1 + Math.abs(b)); if (a && b && typeof a === "object" && typeof b === "object") return Object.keys(b).every(k => !(k in a) || camClose(a[k], b[k])); return true; };
async function setCamVerified(cam) {
  const V = API && API.viewer; if (!V || typeof V.setCamera !== "function") return false;
  try { await V.setCamera(cam, { animationTime: 0 }); } catch (e) { return false; }
  if (typeof V.getCamera !== "function") return true;
  for (let i = 0; i < 60; i++) { try { if (camClose(await V.getCamera(), cam)) { await sleep(40); return true; } } catch (e) { return true; } await sleep(50); if (i === 30) { try { await V.setCamera(cam, { animationTime: 0 }); } catch (e) { /* */ } } }
  return false;
}
function applyViewData(d) {
  S.g = { ...S.g, ...(d.g || {}) }; S.date = { ...S.date, ...(d.date || {}) };
  S.bubbles = (d.bubbles || []).map(b => newBubble({ ...b })); S.sel = null; S.undo = []; commit();
}
async function useView(i, week) {
  const v = views[i]; if (!v) return; const d = v.data, warn = []; let moved = false, camOk = true;
  if (d.cam && tcOn) {
    say("Flyttar modellen till vyns kamera och tar nytt foto …"); camOk = await setCamVerified(d.cam); await sleep(350);
    try { S.cam = await API.viewer.getCamera(); } catch (e) { S.cam = d.cam; }
    try { await loadBlob(await snapshotBlob()); moved = true; } catch (e) { warn.push("fotot kunde inte tas: " + (e.message || e)); }
  }
  applyViewData(d); S.viewSel = i;
  if (week) S.date.text = addDaysToText(S.date.text, 7);
  const asp = S.W / S.H; if (d.asp && Math.abs(asp / d.asp - 1) > 0.03) warn.push(`bildens format skiljer sig från när vyn sparades (${d.src ? d.src.join("×") + " → " : ""}${S.srcSize ? S.srcSize.join("×") : "?"}) – gör Trimble Connect-vyn lika stor som förut`);
  if (moved && !camOk) warn.push("kameran kom inte exakt till den sparade vyn");
  if (d.cam && !tcOn) warn.push("utanför Trimble Connect flyttas inte kameran – bubblorna lades på bilden du har öppen");
  draw(); renderSide(); say(warn.length ? "⚠ " + warn.join(" · ") : `Vyn "${v.name}" inläst`, !!warn.length);
}
function copyViewNextWeek(i) {
  const v = views[i]; if (!v) return; const data = JSON.parse(JSON.stringify(v.data)); data.date.text = addDaysToText(data.date.text, 7);
  const baseName = v.name.replace(/\s*·\s*v\.\d+$/, ""), wk = /^v\.(\d+)/.exec(data.date.text || ""), nm = wk ? `${baseName} · v.${wk[1]}` : `${baseName} (kopia)`;
  const j = views.findIndex(x => x.name === nm); const rec = { name: nm, at: new Date().toISOString(), data }; if (j >= 0) views[j] = rec; else views.push(rec);
  S.viewSel = j >= 0 ? j : views.length - 1; storeViews(); renderSide(); say(`Vyn "${nm}" skapad (datum +7 dagar) – öppna den och justera procent.`);
}
function exportViews() { dl(new Blob([JSON.stringify({ app: "tc-bubbles", project: projectId, views }, null, 1)], { type: "application/json" }), `TC-Bubbles-vyer-${projectId}.json`); }
async function importViews(file) {
  try { const j = JSON.parse(await file.text()), a = Array.isArray(j) ? j : j.views; if (!Array.isArray(a)) throw new Error("fel format"); let n = 0;
    a.filter(v => v && v.name && v.data).forEach(v => { const i = views.findIndex(x => x.name === v.name); if (i >= 0) views[i] = v; else views.push(v); n++; });
    storeViews(); renderSide(); say(`${n} vyer inlästa`); } catch (e) { say("Kunde inte läsa filen: " + e.message, true); }
}

/* ---------- Panel ---------- */
const fold = new Set();
function renderSide() {
  const s = S.sel, list = S.bubbles;
  let h = "";
  if (s) {
    h += `<div class="sec"><h3>Vald bubbla</h3>
      <label class="f"><span>Rubrik</span><input type="text" id="fName" maxlength="90" value="${esc(s.name)}"></label>
      <label class="f"><span>Aktivitet</span><input type="text" id="fAct" maxlength="120" value="${esc(s.act)}" placeholder="t.ex. Gjutning av pelare"></label>
      <label class="f"><span>Datum</span><input type="text" id="fDt" maxlength="40" value="${esc(s.dt)}" placeholder="t.ex. 3 dec – 12 dec"></label>
      <div class="row"><label class="f" style="flex:1"><span>Framdrift <b id="fPv">${Number.isFinite(s.prog) ? Math.round(s.prog) + " %" : "—"}</b></span><input type="range" id="fProg" min="0" max="100" step="5" value="${Number.isFinite(s.prog) ? s.prog : 0}"></label>
        <label class="f" style="width:62px"><span>%</span><input type="number" id="fProgN" min="0" max="100" step="1" value="${Number.isFinite(s.prog) ? Math.round(s.prog) : ""}"></label></div>
      <label class="f"><span>Anteckning</span><textarea id="fNote" maxlength="200">${esc(s.note)}</textarea></label>
      <div class="sw" id="fCol" title="Färg">${SWATCH.map(([k, t]) => `<i data-col="${k}" title="${t}" class="${s.col === k ? "on" : ""}" style="background:${k === "auto" ? "conic-gradient(#9aa3af 0 33%,#eadb2b 0 66%,#2fa84f 0)" : COL[k]}"></i>`).join("")}</div>
      <div class="row"><button type="button" id="fLate" class="${s.late ? "on" : ""}" title="Markera som försenad (röd)">⏰ Försenad</button><button type="button" id="fLock" class="${s.lock ? "on" : ""}" title="Lås bubblan där den sitter">${s.lock ? "🔒" : "🔓"}</button><button type="button" id="fDup" title="Dubblera">⧉</button><button type="button" id="fDel" class="danger" title="Ta bort">🗑</button></div>
      <label class="f"><span>Storlek <b id="fSv">${Math.round(s.scale * 100)} %</b></span><input type="range" id="fScale" min="50" max="250" step="5" value="${Math.round(s.scale * 100)}"></label></div>`;
  }
  h += `<div class="sec ${fold.has("list") ? "closed" : ""}" data-fold="list"><h3>Bubblor (${list.length})<span>${fold.has("list") ? "▸" : "▾"}</span></h3>
    <div class="list">${list.length ? list.map(b => `<div class="li${b === s ? " sel" : ""}" data-id="${b.id}"><i style="width:10px;height:10px;border-radius:50%;background:${bubbleCol(b)}"></i><b>${esc(b.name)}</b><span>${Number.isFinite(b.prog) ? Math.round(b.prog) + " %" : ""}</span><button type="button" data-lk="${b.id}" title="Lås/lås upp">${b.lock ? "🔒" : "🔓"}</button></div>`).join("") : `<div class="hint">Inga bubblor – tryck ＋ Bubbla och klicka i bilden.</div>`}</div>
    <div class="row"><span class="hint" style="flex:1">Alla bubblor</span><input type="number" id="bumpN" value="10" min="-100" max="100" step="5" style="width:56px"><button type="button" id="bump" title="Lägg till så många procentenheter på alla bubblor (t.ex. +10 inför nästa vecka)">＋ %</button></div></div>`;
  h += `<div class="sec ${fold.has("vyer") ? "closed" : ""}" data-fold="vyer"><h3>Sparade vyer<span>${fold.has("vyer") ? "▸" : "▾"}</span></h3>
    <div class="row"><input type="text" id="vName" placeholder="Namn på vyn" maxlength="60" value="${views[S.viewSel] ? esc(views[S.viewSel].name) : ""}"><button type="button" id="vSave" class="pri" title="Spara kamera och bubblor">💾</button></div>
    ${views.length ? `<select id="vSel">${views.map((v, i) => `<option value="${i}"${i === S.viewSel ? " selected" : ""}>${esc(v.name)}</option>`).join("")}</select>
    <div class="row"><button type="button" id="vUse" class="pri" style="flex:1" title="Flytta modellen till vyns kamera, ta nytt foto och lägg på bubblorna">▶ Använd</button><button type="button" id="vUpd" title="Skriv över vyn med det som är på bilden nu">⟳</button><button type="button" id="vWeek" title="Ny vy för nästa vecka (datum +7 dagar) från den valda">📅</button><button type="button" id="vDel" class="danger" title="Ta bort vyn">🗑</button></div>` : `<div class="hint">Spara en vy så kommer kamera och bubblor tillbaka exakt nästa vecka.</div>`}
    <div class="row"><button type="button" id="vExp" title="Spara alla vyer som fil (backup / flytta till annan dator)" style="flex:1">⬇ Exportera</button><label class="btn" style="flex:1" title="Läs in vyer från fil">⬆ Importera<input type="file" id="vImp" accept="application/json,.json" hidden></label></div>
    <div class="hint">Vyerna sparas i den här webbläsaren (per projekt). Använd Exportera för att flytta dem.</div></div>`;
  h += `<div class="sec ${fold.has("all") ? "closed" : ""}" data-fold="all"><h3>Allmänt<span>${fold.has("all") ? "▸" : "▾"}</span></h3>
    <label class="f"><span>Bubblornas storlek <b id="gSv">${Math.round(S.g.scale * 100)} %</b></span><input type="range" id="gScale" min="50" max="200" step="5" value="${Math.round(S.g.scale * 100)}"></label>
    <label class="row"><input type="checkbox" id="gLines"${S.g.lines ? " checked" : ""} style="width:auto"> Linjer till punkterna</label>
    <label class="row"><input type="checkbox" id="dOn"${S.date.on ? " checked" : ""} style="width:auto"> Datumskylt</label>
    ${S.date.on ? `<div class="row"><input type="text" id="dText" maxlength="40" value="${esc(S.date.text)}"><button type="button" id="dNow" title="Veckonummer och dagens datum">📅 Idag</button></div>` : ""}
    <div class="hint">${tcOn ? "Ansluten till Trimble Connect" + (projectName ? ": " + esc(projectName) : "") : "Inte ansluten till Trimble Connect – öppna en bild med 🖼."}${S.srcSize ? ` · bild ${S.srcSize[0]}×${S.srcSize[1]} px` : ""}</div></div>`;
  const keep = sideEl.scrollTop, act = document.activeElement && document.activeElement.id;
  sideEl.innerHTML = h; sideEl.scrollTop = keep; bindSide();
  if (act && sideEl.querySelector("#" + act)) { try { sideEl.querySelector("#" + act).focus(); } catch (e) { /* */ } }
}
function bindSide() {
  const q = id => sideEl.querySelector("#" + id), on = (id, ev, fn) => { const e = q(id); if (e) e.addEventListener(ev, fn); }, s = S.sel;
  sideEl.querySelectorAll("[data-fold]").forEach(sec => sec.querySelector("h3").addEventListener("click", () => { const k = sec.dataset.fold; if (fold.has(k)) fold.delete(k); else fold.add(k); renderSide(); }));
  if (s) {
    const txt = (id, key) => on(id, "input", e => { s[key] = e.target.value; draw(); const li = sideEl.querySelector(`.li[data-id="${s.id}"] b`); if (key === "name" && li) li.textContent = s.name; }), done = () => commit();
    txt("fName", "name"); txt("fAct", "act"); txt("fDt", "dt"); txt("fNote", "note"); ["fName", "fAct", "fDt", "fNote"].forEach(id => on(id, "change", done));
    on("fProg", "input", e => { s.prog = Number(e.target.value); q("fPv").textContent = s.prog + " %"; q("fProgN").value = s.prog; draw(); }); on("fProg", "change", () => { commit(); renderSide(); });
    on("fProgN", "change", e => { const v = e.target.value; s.prog = v === "" ? null : clamp(Number(v), 0, 100); commit(); draw(); renderSide(); });
    on("fScale", "input", e => { s.scale = Number(e.target.value) / 100; q("fSv").textContent = e.target.value + " %"; draw(); }); on("fScale", "change", done);
    sideEl.querySelectorAll("[data-col]").forEach(i => i.addEventListener("click", () => { s.col = i.dataset.col; commit(); draw(); renderSide(); }));
    on("fLate", "click", () => { s.late = !s.late; commit(); draw(); renderSide(); }); on("fLock", "click", () => { s.lock = !s.lock; commit(); draw(); renderSide(); });
    on("fDup", "click", dupSel); on("fDel", "click", () => removeBubble(s));
  }
  sideEl.querySelectorAll(".li").forEach(li => li.addEventListener("click", e => { const b = S.bubbles.find(x => x.id === Number(li.dataset.id)); if (e.target.closest("[data-lk]")) { b.lock = !b.lock; commit(); draw(); renderSide(); return; } S.sel = b; draw(); renderSide(); }));
  on("bump", "click", () => bumpAll(Number(q("bumpN").value) || 0));
  on("vSave", "click", () => saveView(q("vName").value)); on("vName", "keydown", e => { if (e.key === "Enter") saveView(q("vName").value); e.stopPropagation(); });
  on("vSel", "change", e => { S.viewSel = Number(e.target.value); const n = q("vName"); if (n) n.value = views[S.viewSel].name; });
  const vi = () => Number((q("vSel") || {}).value);
  on("vUse", "click", () => useView(vi())); on("vWeek", "click", () => copyViewNextWeek(vi()));
  on("vUpd", "click", () => { const i = vi(); if (views[i] && confirm(`Skriva över vyn "${views[i].name}" med det som är på bilden nu?`)) saveView(views[i].name, i); });
  on("vDel", "click", () => { const i = vi(); if (views[i] && confirm(`Ta bort vyn "${views[i].name}"?`)) { views.splice(i, 1); S.viewSel = -1; storeViews(); renderSide(); } });
  on("vExp", "click", exportViews); on("vImp", "change", e => { if (e.target.files[0]) importViews(e.target.files[0]); e.target.value = ""; });
  on("gScale", "input", e => { S.g.scale = Number(e.target.value) / 100; q("gSv").textContent = e.target.value + " %"; draw(); }); on("gLines", "change", e => { S.g.lines = e.target.checked; draw(); });
  on("dOn", "change", e => { S.date.on = e.target.checked; if (S.date.on && !S.date.text) S.date.text = weekText(); commit(); draw(); renderSide(); });
  on("dText", "input", e => { S.date.text = e.target.value; draw(); }); on("dText", "change", () => commit()); on("dNow", "click", () => { S.date.text = weekText(); commit(); draw(); renderSide(); });
}

/* ---------- Mus ---------- */
let drag = null, addMode = false;
const posOf = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * S.W / r.width, y: (e.clientY - r.top) * S.H / r.height }; };
const hitCard = p => [...S.bubbles].reverse().find(b => p.x >= b._x && p.x <= b._x + b._w && p.y >= b._y && p.y <= b._y + b._h);
const hitDot = p => S.g.lines ? [...S.bubbles].reverse().find(b => Math.hypot(p.x - b._ax, p.y - b._ay) <= 13 * Math.max(0.9, S.W / 1500)) : null;
const hitDate = p => { if (!S.date.on) return false; const q = dateBox(); return p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + q.h; };
const onClose = (p, b) => { const k = Math.max(0.9, S.W / 1500); return Math.hypot(p.x - (b._x + b._w - 2 * k), p.y - (b._y + 2 * k)) <= 12.5 * k; };
function setAdd(on) { addMode = on; cv.style.cursor = on ? "crosshair" : ""; document.querySelector('[data-act="add"]').classList.toggle("on", on); if (on) say("Klicka i bilden där bubblan ska peka (Esc avbryter)."); }
cv.addEventListener("pointerdown", e => {
  if (!S.photo && !S.bmp) return; const p = posOf(e);
  if (addMode) { setAdd(false); say(""); addBubbleAt(p.x, p.y); e.preventDefault(); return; }
  const hv = S.hover && S.bubbles.includes(S.hover) ? S.hover : null; if (hv && onClose(p, hv)) { removeBubble(hv); e.preventDefault(); return; }
  const card = hitCard(p), dot = !card && hitDot(p), t = card || dot;
  if (t) { const was = S.sel; S.sel = t; if (card) { S.bubbles.splice(S.bubbles.indexOf(t), 1); S.bubbles.push(t); }
    if (!t.lock) { drag = dot ? { dot: true, b: t, dx: p.x - t._ax, dy: p.y - t._ay } : { b: t, dx: p.x - t._x, dy: p.y - t._y }; cv.setPointerCapture(e.pointerId); cv.style.cursor = "grabbing"; }
    draw(); if (was !== t) renderSide(); e.preventDefault(); return; }
  if (hitDate(p)) { const q = dateBox(); drag = { date: true, dx: p.x - q.x, dy: p.y - q.y }; cv.setPointerCapture(e.pointerId); e.preventDefault(); return; }
  if (S.sel) { S.sel = null; draw(); renderSide(); }
});
cv.addEventListener("pointermove", e => {
  const p = posOf(e);
  if (!drag) { const c = hitCard(p); if (c !== S.hover) { S.hover = c || null; draw(); } if (!addMode) cv.style.cursor = c ? (onClose(p, c) ? "pointer" : c.lock ? "default" : "grab") : hitDot(p) ? "move" : ""; return; }
  if (drag.date) { S.date.fx = clamp((p.x - drag.dx) / S.W, 0, 0.98); S.date.fy = clamp((p.y - drag.dy) / S.H, 0, 0.98); draw(); return; }
  const b = drag.b;
  if (drag.dot) { b.fax = clamp((p.x - drag.dx) / S.W, 0, 1); b.fay = clamp((p.y - drag.dy) / S.H, 0, 1); }
  else { b.fx = clamp((p.x - drag.dx) / S.W, 0, 1 - b._w / S.W); b.fy = clamp((p.y - drag.dy) / S.H, 0, 1 - b._h / S.H); }
  draw();
});
const dragEnd = () => { if (drag) { drag = null; cv.style.cursor = ""; commit(); } };
cv.addEventListener("pointerup", dragEnd); cv.addEventListener("pointercancel", dragEnd);
cv.addEventListener("pointerleave", () => { if (!drag && S.hover) { S.hover = null; draw(); } });
cv.addEventListener("contextmenu", e => { e.preventDefault(); const c = hitCard(posOf(e)); if (c) removeBubble(c); });
document.addEventListener("keydown", e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || "");
  if (e.key === "Escape") { if (addMode) { setAdd(false); say(""); } else if (S.sel) { S.sel = null; draw(); renderSide(); } }
  else if (typing) return;
  else if ((e.key === "Delete" || e.key === "Backspace") && S.sel) { e.preventDefault(); removeBubble(S.sel); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); dupSel(); }
  else if (e.key.toLowerCase() === "b" && !e.ctrlKey && !e.metaKey && S.bmp) setAdd(true);
});
document.addEventListener("paste", async e => { const it = [...(e.clipboardData || { items: [] }).items].find(i => i.type.startsWith("image/")); if (it) { await loadBlob(it.getAsFile()); renderSide(); say("Bild inklistrad"); } });
$("fileIn").addEventListener("change", async e => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; try { S.cam = null; await loadBlob(f); renderSide(); say(""); } catch (x) { say("Kunde inte öppna bilden.", true); } });
document.querySelector(".bar").addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  ({ shot: takePhoto, add: () => { if (!S.bmp) { say("Ta ett foto eller öppna en bild först.", true); return; } setAdd(!addMode); }, dup: dupSel, arrange: () => { arrange(); say("Olåsta bubblor ordnade"); }, lockall: lockAll, undo, png: exportPng, pdf: exportPdf, copy: copyImg })[b.dataset.act]();
});

/* ---------- Start ---------- */
async function connectTc() {
  if (typeof TrimbleConnectWorkspace === "undefined" || window.parent === window) return;
  try {
    API = await Promise.race([TrimbleConnectWorkspace.connect(window.parent, () => {}, 30000), sleep(8000).then(() => { throw new Error("tid"); })]);
    tcOn = true; try { const p = await API.project.getProject(); projectId = p.id || projectId; projectName = p.name || ""; } catch (e) { /* */ }
  } catch (e) { API = null; tcOn = false; }
}
(async function init() {
  await connectTc(); $("btnShot").disabled = !tcOn; if (!tcOn) $("btnShot").title = "Foto kräver Trimble Connect";
  loadViews(); restoreDraft(); S.undo = []; commit(); renderSide(); draw();
  if (tcOn) takePhoto();
  window.__tcb = { S, views: () => views, draw, addBubbleAt, loadBlob, saveView, useView, tcOn: () => tcOn };
})();
