/* Dela upp ett punktmoln efter WBS-zonerna (Victor 2026-11-05: "en knapp som slicear upp valt punktmoln enligt mina WBS-zoner i olika filer och det som hamnar utanför blir en egen punktmolnsfil").
   • Lager → Punktmoln → ⋯ på molnet → "Dela upp efter WBS-zoner…". Nivå: zonerna (7421 …) eller överzonerna (742 …, från zonernas WBS-fält).
   • Varje punkt hamnar i första zonen vars yta (ritad i 2D, i x/y) innehåller den – ingen punkt dubbleras. Det som ligger utanför alla zoner blir en egen fil ("Utanför zoner").
   • Filerna är LAS 1.2 (punktformat 2: läge, intensitet, färg) i modellens koordinater (SWEREF), med färg som i skanningen (annars grå av intensiteten). Allt läggs i en ZIP som hämtas.
   • Delas det som är inläst (Lager → Inställningar → Punkter per moln styr hur många punkter). Höjdjusteringen (±) för visning skrivs inte in i filerna. */
const l3pcs = { busy: false };
/* Grupperna som polygoner i modellkoordinater: [{ name, polys: [[x,y]…], bb }]. */
function l3pcsGroups(level) {
  const zs = (typeof plan !== "undefined" && plan && plan.zones || []).filter(z => (z.polys || []).some(p => p.length > 2)), by = new Map(), out = [];
  const nm = z => [z.code, z.name].filter(Boolean).join(" ").trim() || "Zon";
  zs.forEach(z => {
    const key = level === "wbs" && z.parent && String(z.parent).trim() ? "w:" + String(z.parent).trim().toUpperCase() : "z:" + z.id, name = level === "wbs" && z.parent && String(z.parent).trim() ? String(z.parent).trim() : nm(z);
    if (!by.has(key)) { const g = { name, polys: [] }; by.set(key, g); out.push(g); }
    z.polys.filter(p => p.length > 2).forEach(p => by.get(key).polys.push(p.map(v => pdfToModel(v))));
  });
  out.forEach(g => { const xs = g.polys.flat().map(p => p[0]), ys = g.polys.flat().map(p => p[1]); g.bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; });
  return out;
}
const l3pcsIn = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const l3pcsYield = () => new Promise(r => setTimeout(r, 0));
/* Steg 1: vilken grupp varje punkt hör till (index; G = utanför) och antal/gränser per grupp. */
async function l3pcsAssign(c, groups, onP) {
  const G = groups.length, cx = c.info.center[0], cy = c.info.center[1], counts = new Array(G + 1).fill(0), ids = [];
  const total = c.chunks.reduce((a, ch) => a + ch.pos.length / 3, 0); let done = 0, t0 = performance.now();
  for (const ch of c.chunks) {
    const n = ch.pos.length / 3, id = new Uint16Array(n), P = ch.pos;
    for (let i = 0; i < n; i++) {
      const x = P[i * 3] + cx, y = P[i * 3 + 1] + cy; let g = G;
      for (let k = 0; k < G; k++) { const b = groups[k].bb; if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue; const ps = groups[k].polys; let hit = false; for (let q = 0; q < ps.length; q++) if (l3pcsIn(ps[q], x, y)) { hit = true; break; } if (hit) { g = k; break; } }
      id[i] = g; counts[g]++;
    }
    ids.push(id); done += n;
    if (performance.now() - t0 > 30) { if (onP) onP(done / total); await l3pcsYield(); t0 = performance.now(); }
  }
  return { ids, counts };
}
/* Steg 2: en LAS 1.2-fil (punktformat 2) för grupp g. */
function l3pcsLas(c, ids, g, count, name) {
  const ctr = c.info.center, S = 0.001, rec = 26, buf = new ArrayBuffer(227 + count * rec), dv = new DataView(buf), u8 = new Uint8Array(buf);
  const hasRgb = !!c.info.rgb; let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
  c.chunks.forEach((ch, k) => { const id = ids[k], P = ch.pos; for (let i = 0; i < id.length; i++) if (id[i] === g) { const x = P[i * 3] + ctr[0], y = P[i * 3 + 1] + ctr[1], z = P[i * 3 + 2] + ctr[2]; if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y; if (z < mnz) mnz = z; if (z > mxz) mxz = z; } });
  if (!count) { mnx = mny = mnz = mxx = mxy = mxz = 0; }
  const ox = Math.floor(mnx), oy = Math.floor(mny), oz = Math.floor(mnz), ascii = (s, off, len) => { for (let i = 0; i < len; i++) u8[off + i] = i < s.length ? s.charCodeAt(i) & 0x7f : 0; };
  ascii("LASF", 0, 4); dv.setUint8(24, 1); dv.setUint8(25, 2); ascii("4D-planering Lagesplan", 26, 32); ascii("Zonuppdelning " + String(name).replace(/[^\x20-\x7e]/g, "?"), 58, 32);
  const now = new Date(), doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000); dv.setUint16(90, doy, true); dv.setUint16(92, now.getFullYear(), true);
  dv.setUint16(94, 227, true); dv.setUint32(96, 227, true); dv.setUint32(100, 0, true); dv.setUint8(104, 2); dv.setUint16(105, rec, true); dv.setUint32(107, count, true); dv.setUint32(111, count, true);
  [S, S, S, ox, oy, oz, mxx, mnx, mxy, mny, mxz, mnz].forEach((v, i) => dv.setFloat64(131 + i * 8, v, true));
  let o = 227;
  c.chunks.forEach((ch, k) => { const id = ids[k], P = ch.pos, I = ch.inten, R = ch.rgb;
    for (let i = 0; i < id.length; i++) {
      if (id[i] !== g) continue;
      dv.setInt32(o, Math.round((P[i * 3] + ctr[0] - ox) / S), true); dv.setInt32(o + 4, Math.round((P[i * 3 + 1] + ctr[1] - oy) / S), true); dv.setInt32(o + 8, Math.round((P[i * 3 + 2] + ctr[2] - oz) / S), true);
      const inten = I ? I[i] : 0; dv.setUint16(o + 12, inten * 257, true); dv.setUint8(o + 14, 0x09); dv.setUint8(o + 15, 0);
      let r, gg, b; if (hasRgb && R) { r = R[i * 3]; gg = R[i * 3 + 1]; b = R[i * 3 + 2]; } else { r = gg = b = Math.min(255, 40 + inten * 0.84); }
      dv.setUint16(o + 20, r * 257, true); dv.setUint16(o + 22, gg * 257, true); dv.setUint16(o + 24, b * 257, true); o += rec;
    } });
  return u8;
}
const l3pcsFile = s => String(s).replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);
/* Kör hela uppdelningen: returnerar { files: [{ name, n, bytes }], zip: Blob }. opts: { level, rest } */
async function l3pcsRun(c, opts, onP) {
  const groups = l3pcsGroups(opts.level);
  if (!groups.length) throw new Error("Det finns inga zoner med yta på den här arbetsytan – rita zoner under fliken Zoner först.");
  const { ids, counts } = await l3pcsAssign(c, groups, f => onP && onP("sorterar punkterna", f * 0.6));
  const base = l3pcsFile(String(c.name).replace(/\.[^.]+$/, "")), files = [];
  const all = [...groups.map((g, i) => ({ name: g.name, i, n: counts[i] })), ...(opts.rest !== false ? [{ name: "Utanför zoner", i: groups.length, n: counts[groups.length] }] : [])].filter(x => x.n > 0);
  if (!all.length) throw new Error("Inga punkter ligger i zonerna eller utanför dem – är molnet på samma plats som arbetsytan?");
  for (let k = 0; k < all.length; k++) { const x = all[k]; if (onP) onP(`skriver ${x.name}`, 0.6 + 0.4 * k / all.length); await l3pcsYield(); files.push({ name: `${base} – ${l3pcsFile(x.name)}.las`, n: x.n, group: x.name, bytes: l3pcsLas(c, ids, x.i, x.n, x.name) }); }
  const used = new Set(); files.forEach(f => { let n = f.name, i = 2; while (used.has(n.toLowerCase())) n = f.name.replace(/\.las$/, ` (${i++}).las`); used.add(n.toLowerCase()); f.name = n; });
  return { files, counts, groups: groups.length };
}
async function l3pcsZip(files) {
  if (typeof fflate === "undefined") await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "vendor/three/fflate.min.js"; s.onload = res; s.onerror = () => rej(new Error("Kunde inte läsa in ZIP-biblioteket.")); document.head.appendChild(s); });
  const parts = []; await new Promise((res, rej) => { const z = new fflate.Zip((err, chunk, final) => { if (err) return rej(err); parts.push(chunk); if (final) res(); }); files.forEach(f => { const e = new fflate.ZipPassThrough(f.name); z.add(e); e.push(f.bytes, true); }); z.end(); });
  return new Blob(parts, { type: "application/zip" });
}
function l3pcsDialog(id) {
  const c = l3pc.clouds.find(x => x.id === id); if (!c) return;
  if (l3pcs.busy) return;
  const hasWbs = (plan && plan.zones || []).some(z => z.parent && String(z.parent).trim()), nz = l3pcsGroups("zone").length, opener = !!(window.opener && !window.opener.closed);
  const ov = document.createElement("div"); ov.id = "l3pcsDlg"; ov.style.cssText = "position:fixed;inset:0;z-index:9500;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:20px";
  const n = c.chunks.reduce((a, ch) => a + ch.pos.length / 3, 0);
  ov.innerHTML = `<div style="background:#fff;color:#0f172a;border-radius:14px;max-width:460px;width:100%;padding:16px 18px;box-shadow:0 20px 60px rgba(0,0,0,.4);font:13px system-ui,sans-serif;display:flex;flex-direction:column;gap:10px">
    <b style="font-size:16px">Dela upp punktmolnet efter zoner</b>
    <div style="color:#475569">${escHtml(c.name)} · ${n.toLocaleString("sv-SE")} punkter inlästa · ${nz} zoner på arbetsytan ${escHtml(plan ? plan.name : "")}</div>
    <label style="display:flex;gap:8px;align-items:center"><input type="radio" name="pcsLv" value="zone" checked> Zonerna (en fil per zon)</label>
    <label style="display:flex;gap:8px;align-items:center;${hasWbs ? "" : "opacity:.5"}"><input type="radio" name="pcsLv" value="wbs" ${hasWbs ? "" : "disabled"}> Överzonerna (WBS-nivå 1)${hasWbs ? "" : " – inga överzoner angivna"}</label>
    <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="pcsRest" checked> Det som ligger utanför zonerna blir en egen fil</label>
    ${opener ? `<label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="pcsTc"> Spara filerna även i Trimble Connect (mappen Punktmoln)</label>` : ""}
    <div style="color:#64748b;font-size:12px">Filerna blir LAS (med färg) i modellens koordinater, samlade i en ZIP. Delar det som är inläst – full upplösning kräver att molnet lästs in med alla punkter (Lager → Inställningar). Höjdjusteringen av molnet skrivs inte in.</div>
    <div id="pcsOut" style="color:#334155"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" id="pcsX">Stäng</button><button type="button" id="pcsGo" class="primary" style="background:#2563eb;color:#fff;border:0;border-radius:8px;padding:6px 14px">Dela upp och hämta ZIP</button></div></div>`;
  document.body.appendChild(ov);
  const q = s => ov.querySelector(s), out = q("#pcsOut"); q("#pcsX").onclick = () => { if (!l3pcs.busy) ov.remove(); };
  q("#pcsGo").onclick = async () => {
    if (l3pcs.busy) return; l3pcs.busy = true; q("#pcsGo").disabled = true;
    try {
      const level = (ov.querySelector('input[name="pcsLv"]:checked') || {}).value || "zone", rest = q("#pcsRest").checked;
      const r = await l3pcsRun(c, { level, rest }, (t, f) => { out.textContent = `${t} ${Math.round(f * 100)} %`; });
      out.textContent = "packar…"; await l3pcsYield();
      const zip = await l3pcsZip(r.files), name = `${l3pcsFile(String(c.name).replace(/\.[^.]+$/, ""))} – zoner.zip`;
      const u = URL.createObjectURL(zip), a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000);
      let tcNote = ""; const tc = q("#pcsTc");
      if (tc && tc.checked) { try { const res = await askOpener("tcUpload", { folder: "Punktmoln", files: r.files.map(f => new File([f.bytes], f.name, { type: "application/octet-stream" })) }, 15 * 60 * 1000); tcNote = ` Sparade även ${r.files.length} filer i Trimble Connect (${(res && res.folder) || "Punktmoln"}).`; } catch (e) { tcNote = ` ⚠ Kunde inte spara i Trimble Connect: ${e.message}`; } }
      out.innerHTML = `<b>${r.files.length} filer</b> i ${escHtml(name)}:<br>${r.files.map(f => `${escHtml(f.group)}: ${f.n.toLocaleString("sv-SE")} punkter`).join("<br>")}${escHtml(tcNote)}`;
      l3Status(`${r.files.length} punktmolnsfiler skapade (${name}).${tcNote}`);
    } catch (e) { out.textContent = "⚠ " + e.message; }
    l3pcs.busy = false; q("#pcsGo").disabled = false;
  };
}
