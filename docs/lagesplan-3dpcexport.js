/* 3D-vyn – exportera punktmoln efter redigering (Victor 2026-11-12): det som klippts bort (ett lager per redigering, med eget namn) och hela molnet utan de borttagna punkterna.
   Skrivs som LAS 1.2 (punktformat 2: läge, intensitet, färg). LAZ-komprimering finns inte i webbläsaren (laz-perf här är bara avkodare), men LAS öppnas av Trimble Connect, CloudCompare, Recap m.fl.
   Stora moln (okträd) läses nod för nod ur filen i webbläsarens lagring och skrivs direkt till disk (File System Access) så att inget behöver rymmas i minnet. Prefix l3px. */
const L3PX_REC = 26, L3PX_HDR = 227, L3PX_BATCH = 100000;
/* Molnets ursprungsdata bit för bit: okträdsnoder läses ur filen, vanliga moln ur de sparade originalen (före redigering). Positionerna är relativa molnets center. */
async function* l3pxPieces(c) {
  if (c.lod) { const L = c.lod; for (let i = 0; i < L.nodes.length; i++) { const n = L.nodes[i]; if (!n.n) continue; yield { o: await l3olRead(L, n), f: (i + 1) / L.nodes.length }; } return; }
  const src = c.orig || c.chunks; for (let i = 0; i < src.length; i++) yield { o: src[i], f: (i + 1) / src.length };
}
/* mode "kept": punkterna som är kvar efter alla aktiva redigeringar. mode = k (tal): punkterna som redigering k tar bort (av dem som tidigare aktiva redigeringar lämnat kvar). */
function l3pxMask(c, o, mode) {
  const n = o.pos.length / 3, keep = new Uint8Array(n).fill(1), ed = c.edits || [], run = e => (e.t ? l3peFilterRun(c, e, o.pos, keep, n) : l3pePolyRun(c, e, o.pos, keep, n));
  if (mode === "kept") { ed.forEach(e => { if (!e.off) run(e); }); return keep; }
  for (let j = 0; j < mode; j++) if (!ed[j].off) run(ed[j]);
  const before = keep.slice(); run(ed[mode]); const out = new Uint8Array(n); for (let i = 0; i < n; i++) out[i] = before[i] && !keep[i] ? 1 : 0; return out;
}
/* LAS-skrivare: samlar poster i partier och skickar dem vidare; sidhuvudet (antal, ytterpunkter) skrivs sist. */
function l3pxWriter(c, name, sink) {
  const ctr = c.info.center, S = 0.001, ox = Math.floor(ctr[0]), oy = Math.floor(ctr[1]), oz = Math.floor(ctr[2]), hasRgb = !!c.info.rgb;
  let count = 0, mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], buf = new Uint8Array(L3PX_BATCH * L3PX_REC), dv = new DataView(buf.buffer), at = 0;
  const flush = async () => { if (at) { await sink.write(buf.slice(0, at)); at = 0; } };
  return {
    get count() { return count; },
    async add(o, mask) {
      const P = o.pos, I = o.inten, R = o.rgb, n = P.length / 3;
      for (let i = 0; i < n; i++) {
        if (!mask[i]) continue; if (at + L3PX_REC > buf.length) await flush();
        const x = P[i * 3] + ctr[0], y = P[i * 3 + 1] + ctr[1], z = P[i * 3 + 2] + ctr[2]; if (x < mn[0]) mn[0] = x; if (x > mx[0]) mx[0] = x; if (y < mn[1]) mn[1] = y; if (y > mx[1]) mx[1] = y; if (z < mn[2]) mn[2] = z; if (z > mx[2]) mx[2] = z;
        dv.setInt32(at, Math.round((x - ox) / S), true); dv.setInt32(at + 4, Math.round((y - oy) / S), true); dv.setInt32(at + 8, Math.round((z - oz) / S), true);
        const inten = I ? I[i] : 0; dv.setUint16(at + 12, inten * 257, true); dv.setUint8(at + 14, 0x09); dv.setUint8(at + 15, 0);
        let r, g, b; if (hasRgb && R) { r = R[i * 3]; g = R[i * 3 + 1]; b = R[i * 3 + 2]; } else { r = g = b = Math.min(255, 40 + inten * 0.84); }
        dv.setUint16(at + 20, r * 257, true); dv.setUint16(at + 22, g * 257, true); dv.setUint16(at + 24, b * 257, true); at += L3PX_REC; count++;
      }
    },
    async finish() {
      await flush(); if (!count) { mn = [0, 0, 0]; mx = [0, 0, 0]; }
      const h = new Uint8Array(L3PX_HDR), d = new DataView(h.buffer), ascii = (s, off, len) => { for (let i = 0; i < len; i++) h[off + i] = i < s.length ? s.charCodeAt(i) & 0x7f : 0; };
      ascii("LASF", 0, 4); d.setUint8(24, 1); d.setUint8(25, 2); ascii("4D-planering Lagesplan", 26, 32); ascii(String(name).replace(/[^\x20-\x7e]/g, "?"), 58, 32);
      const now = new Date(), doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000); d.setUint16(90, doy, true); d.setUint16(92, now.getFullYear(), true);
      d.setUint16(94, L3PX_HDR, true); d.setUint32(96, L3PX_HDR, true); d.setUint32(100, 0, true); d.setUint8(104, 2); d.setUint16(105, L3PX_REC, true); d.setUint32(107, count, true); d.setUint32(111, count, true);
      [S, S, S, ox, oy, oz, mx[0], mn[0], mx[1], mn[1], mx[2], mn[2]].forEach((v, i) => d.setFloat64(131 + i * 8, v, true));
      return h;
    },
  };
}
const l3pxFile = s => String(s).replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);
/* Kör exporten. Utan opts.stream samlas filen i minnet och returneras som { blob }. Med opts.stream = en skrivbar ström skrivs den direkt (sidhuvudet sist, överst i filen). */
async function l3pxExport(c, mode, name, onP, opts = {}) {
  const parts = [], sink = opts.stream ? { write: async b => { await opts.stream.write(b); } } : { write: async b => { parts.push(b); } };
  // Sidhuvudet ska ligga först: reservera platsen och fyll i den när allt är skrivet.
  const wr = l3pxWriter(c, name, sink);
  if (opts.stream) await opts.stream.write(new Uint8Array(L3PX_HDR)); else parts.push(new Uint8Array(L3PX_HDR));
  let t0 = performance.now();
  for await (const { o, f } of l3pxPieces(c)) { await wr.add(o, l3pxMask(c, o, mode)); if (onP && performance.now() - t0 > 250) { onP(f, wr.count); t0 = performance.now(); await new Promise(r => setTimeout(r, 0)); } }
  const h = await wr.finish();
  if (opts.stream) { await opts.stream.write({ type: "write", position: 0, data: h }); await opts.stream.close(); return { count: wr.count }; }
  parts[0] = h; return { count: wr.count, blob: new Blob(parts, { type: "application/octet-stream" }) };
}
/* Användargränssnittet: välj plats (om webbläsaren kan skriva direkt till disk), annars hämtas filen. */
async function l3pxRun(c, mode, label) {
  const base = l3pxFile(String(c.name).replace(/\.[^.]+$/, "")), file = `${base} – ${l3pxFile(label)}.las`, big = (c.info.total || c.nTot || 0) > 4e6;
  let stream = null;
  if (typeof showSaveFilePicker === "function") { try { const fh = await showSaveFilePicker({ suggestedName: file, types: [{ description: "Punktmoln (LAS)", accept: { "application/octet-stream": [".las"] } }] }); stream = await fh.createWritable(); } catch (e) { if (e && e.name === "AbortError") return null; stream = null; } }
  if (!stream && big && (c.info.total || 0) > 30e6) { l3Status(`${c.name} är för stort för att samlas i minnet (${l3pcMil(c.info.total)}). Använd Chrome eller Edge, som kan skriva direkt till disk.`, true); return null; }
  l3Status(`Exporterar ${label} …`);
  try {
    const r = await l3pxExport(c, mode, label, (f, n) => l3Status(`Exporterar ${label}: ${Math.round(f * 100)} % · ${n.toLocaleString("sv-SE")} punkter skrivna`), stream ? { stream } : {});
    if (r.blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(r.blob); a.download = file; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000); }
    l3Toast(`${file}: ${r.count.toLocaleString("sv-SE")} punkter exporterade (LAS).`); return { ...r, file };
  } catch (e) { try { if (stream) await stream.abort(); } catch (e2) { /* redan stängd */ } l3Status("Exporten misslyckades: " + e.message, true); return null; }
}
