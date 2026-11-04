/* Lätt kopia för mobilen (Victor 2026-10-11, efter idén i IDEER.md och LiteAECO:s IFC Optimizer): "jag vill nog
   inte att det skapas något i TC varje gång som öppnas i mobilen".

   – När datorn har läst in en modell sparas en lätt geometrikopia i datalagret (GitHub), inte i Trimble Connect:
     bara trianglarna (positioner som 16-bitars tal per bit, ~0,6 mm), normaler (8 bitar), en färg per objekt och
     GUID/namn – inga egenskaper. Hela paketet gzip-komprimeras och delas i filer om högst 20 MB.
   – En kopia per modell och version (projects/<id>/mobil3d.json listar dem). En ny version ersätter den gamla
     kopian (de gamla delarna tas bort ur datalagret – inget i TC rörs).
   – iPhone/iPad (pekskärm) läser kopian i stället för IFC-filen: ingen web-ifc, ingen hämtning från TC. */

// Delar om 4 MB (Victor 2026-10-12: "401 Bad credentials" på första delen med 20 MB – läsningen före och övriga
// sparningar gick med samma token, så GitHub avvisade det stora anropet; 20 MB blir ~27 MB som base64).
const L3LT_AUTO_MAX_TRIS = 300000, L3LT_PART = 4e6, L3LT_MAX = 300e6, L3LT_PHONE_TRIS = 3e6;
const l3ltPath = () => `projects/${encodeURIComponent(projectId)}/mobil3d.json`;
const l3ltKey = w => (w.fileId ? "f:" + w.fileId : String(w.id || ""));
// Samma token som resten av lägesplanen (den aktiva) – en äldre sparad i inställningarna gav "401 Bad credentials" (Victor 2026-10-12).
const l3ltTok = () => (typeof token !== "undefined" && token) || (typeof settings !== "undefined" && settings.githubToken) || null;
const l3lt = { list: null, pid: null, saving: new Set() };
const l3ltOn = () => !(typeof l3Prefs === "function" && l3Prefs().mobileCopy === false);
const l3ltUse = () => false;   // lätta kopior är borttagna (Victor 2026-11-04) – alla läser IFC-filerna

async function l3ltList(fresh) {
  if (l3lt.pid !== projectId) { l3lt.pid = projectId; l3lt.list = null; }
  if (l3lt.list && !fresh) return l3lt.list;
  try { const a = await ghReadJSON(l3ltTok(), l3ltPath(), fresh ? { fresh: true } : undefined); l3lt.list = Array.isArray(a) ? a : []; }
  catch (e) { l3lt.list = []; }
  return l3lt.list;
}

/* ---- Packa ---------------------------------------------------------------------------------------- */
function l3ltEncode(m) {
  const body = [], chunks = [];
  let off = 0;
  const put = arr => {
    const pad = (4 - off % 4) % 4;
    if (pad) { body.push(new Uint8Array(pad)); off += pad; }
    const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    body.push(u); const at = off; off += u.byteLength; return at;
  };
  m.meshes.forEach(x => {
    if (x.userData.bcopy) return; // osparade kopior hör inte till filen
    const g = x.geometry, P = g.getAttribute("position").array, n = P.length / 3, u = x.userData.l3b;
    if (!n) return;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) { const v = P[i + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v; }
    const sz = mx.map((v, a) => Math.max(1e-6, v - mn[a])), q = new Uint16Array(P.length);
    for (let i = 0; i < P.length; i += 3) for (let a = 0; a < 3; a++) q[i + a] = Math.round((P[i + a] - mn[a]) / sz[a] * 65535);
    const nrm = typeof l3bNrm8 === "function" ? l3bNrm8(g) : null, idx = u.origIdx, i16 = n < 65536;
    chunks.push({ n, mn, sz, pos: put(q), nrm: nrm && nrm.length === P.length ? put(nrm) : -1, idx: put(i16 ? Uint16Array.from(idx) : idx), ni: idx.length, i16,
      r: u.ranges.map(r => [r.start, r.count, r.idxStart, r.idxCount, r.guid || "", r.name || "", (r.base || [0.8, 0.8, 0.8]).map(v => Math.round(v * 255))]) });
  });
  const head = new TextEncoder().encode(JSON.stringify({ v: 1, O: m.O, name: m.name, tris: m.tris, chunks }));
  const pre = new Uint8Array(8 + head.length + ((4 - (8 + head.length) % 4) % 4));
  new DataView(pre.buffer).setUint32(0, 0x4c33444c, true); new DataView(pre.buffer).setUint32(4, head.length, true); pre.set(head, 8);
  return new Blob([pre, ...body]);
}
async function l3ltGzip(blob) { return new Response(blob.stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer(); }
async function l3ltGunzip(buf) { return new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer(); }

/* ---- Spara (datorn) ------------------------------------------------------------------------------- */
/* Sparar inga lätta kopior längre (Victor 2026-11-04): packningen frös fönstret efter varje inläsning. Funktionen finns kvar så anropen i lagren fortsätter fungera. */
async function l3ltEnsure() { return; }

/* ---- Läsa (mobilen) ------------------------------------------------------------------------------- */
async function l3ltLoad(w, onProgress) {
  if (!w || typeof DecompressionStream !== "function") return null;
  const list = await l3ltList(true), e = list.find(x => x.key === l3ltKey(w));
  if (!e || (w.version && e.version !== w.version)) return null;
  const bufs = [];
  for (let k = 0; k < e.parts.length; k++) {
    const url = await ghReadBinaryUrl(l3ltTok(), e.parts[k], f => onProgress && onProgress((k + f) / e.parts.length * 0.8));
    try { bufs.push(new Uint8Array(await (await fetch(url)).arrayBuffer())); } finally { URL.revokeObjectURL(url); }
  }
  let all = new Uint8Array(bufs.reduce((a, b) => a + b.length, 0)); let o = 0; bufs.forEach(b => { all.set(b, o); o += b.length; }); bufs.length = 0;
  let raw = await l3ltGunzip(all); all = null; // det packade släpps direkt – på iPhone är minnet det som tar slut
  const dv = new DataView(raw);
  if (dv.getUint32(0, true) !== 0x4c33444c) throw new Error("Okänt format på den lätta kopian.");
  const hl = dv.getUint32(4, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(raw, 8, hl)));
  const base = 8 + hl + ((4 - (8 + hl) % 4) % 4);
  const byGuid = new Map((items || []).filter(r => r.object_id).map(r => [String(r.object_id), r.id]));
  const out = { meshes: [], ranges: [], tris: 0, O: head.O, capped: false, light: true };
  const cap = typeof lowMemDevice !== "undefined" && lowMemDevice ? L3LT_PHONE_TRIS : Infinity; // tak för trianglar på iPhone/iPad (flikens minne)
  for (let ci = 0; ci < head.chunks.length; ci++) {
    const c = head.chunks[ci]; if (out.tris + c.ni / 3 > cap) { out.capped = out.cappedLight = true; continue; }
    const q = new Uint16Array(raw, base + c.pos, c.n * 3), pos = new Float32Array(c.n * 3);
    for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) pos[i + a] = c.mn[a] + q[i + a] / 65535 * c.sz[a];
    const nrm = c.nrm >= 0 ? new Int8Array(raw.slice(base + c.nrm, base + c.nrm + c.n * 3)) : null;
    const idx = c.i16 ? Uint32Array.from(new Uint16Array(raw, base + c.idx, c.ni)) : new Uint32Array(raw.slice(base + c.idx, base + c.idx + c.ni * 4));
    const col = new Uint8Array(c.n * 3);
    const ranges = c.r.map(([s, n, is, ic, g, nm, b]) => { for (let i = s; i < s + n; i++) { col[i * 3] = b[0]; col[i * 3 + 1] = b[1]; col[i * 3 + 2] = b[2]; } return { start: s, count: n, idxStart: is, idxCount: ic, guid: g || null, name: nm, base: b.map(v => v / 255), itemId: g ? byGuid.get(g) || null : null }; });
    const m = l3bMeshFromArrays(pos, col, idx, ranges, out, nrm);
    out.meshes.push(m); out.ranges.push(...ranges); out.tris += c.ni / 3;
    if (onProgress) onProgress(0.8 + 0.2 * (ci + 1) / head.chunks.length);
  }
  raw = null;
  out.name = head.name;
  return out;
}
