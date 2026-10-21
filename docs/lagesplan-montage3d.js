/* Montage-HTML med riktig geometri (Victor 2026-10-21): montageordningen görs i 4D-dashboarden (Exportera -> HTML med 3D-lådor).
   Här läser 3D-editorn in den filen, hittar varje objekts riktiga form i de inlästa IFC-modellerna (via IFC-id) och skriver en ny fil
   där 3D-vyn ritar den riktiga geometrin i stället för lådor. Bara objekt som ingår i montageordningen följer med, så filen blir liten.
   Geometrin packas som 16-bitars positioner per objekt, gzip och base64 (samma idé som den fristående HTML-exporten). */

/* Dashboardens fil: ...<script>(function msModernRuntime(D){...})({...data...});</script></body>. Hittar datat och var det börjar och slutar. */
function mpExtract(html) {
  const end = html.lastIndexOf(");</script>");
  if (end < 0 || html.indexOf("msModernRuntime") < 0) return null;
  let at = html.indexOf(")({"), tries = 0;
  while (at >= 0 && at < end && tries++ < 50) {
    try { const data = JSON.parse(html.slice(at + 2, end)); if (data && Array.isArray(data.steps)) return { data, start: at + 2, end }; } catch (e) { /* fel start – nästa */ }
    at = html.indexOf(")({", at + 1);
  }
  return null;
}

/* Objektets trianglar ur de inlästa modellerna: { pos: Float32 (m, Z uppåt), idx: Uint32 } eller null. */
function mpObjectMesh(ents) {
  const pos = [], idx = []; const remap = new Map();
  ents.forEach(({ mesh, ri }) => {
    const u = mesh.userData.l3b, r = u.ranges[ri], P = mesh.geometry.getAttribute("position").array, src = u.origIdx || (mesh.geometry.index && mesh.geometry.index.array);
    if (!src) return;
    const [is, ic] = typeof l3bsIdx === "function" ? l3bsIdx(mesh, ri) : [0, src.length];
    // Bitens läge i scenen (matrixWorld): varje modell ligger förskjuten mot arbetsytans origo (modellens O mot l3.O) – utan den hamnar modeller på olika höjd/läge mot varandra.
    if (mesh.updateWorldMatrix) mesh.updateWorldMatrix(true, false);
    const E = mesh.matrixWorld && mesh.matrixWorld.elements;
    const m = new Map();
    for (let k = is; k + 2 < is + ic; k += 3) {
      const tri = [src[k], src[k + 1], src[k + 2]];
      tri.forEach(v => { if (!m.has(v)) { m.set(v, pos.length / 3); const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2]; if (E) pos.push(E[0] * x + E[4] * y + E[8] * z + E[12], E[1] * x + E[5] * y + E[9] * z + E[13], E[2] * x + E[6] * y + E[10] * z + E[14]); else pos.push(x, y, z); } idx.push(m.get(v)); });
    }
  });
  return idx.length ? { pos: Float32Array.from(pos), idx: Uint32Array.from(idx) } : null;
}

/* Packar objektens geometri: binär (position 16 bit, index 32 bit) -> gzip -> base64. */
async function mpPack(list) {
  const body = []; let off = 0;
  const put = arr => { const pad = (4 - off % 4) % 4; if (pad) { body.push(new Uint8Array(pad)); off += pad; } const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); body.push(u); const at = off; off += u.byteLength; return at; };
  const o = [];
  list.forEach(({ key, pos, idx }) => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) { const x = pos[i + a]; if (x < mn[a]) mn[a] = x; if (x > mx[a]) mx[a] = x; }
    const sz = mx.map((x, a) => Math.max(1e-6, x - mn[a])), q = new Uint16Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) q[i + a] = Math.round((pos[i + a] - mn[a]) / sz[a] * 65535);
    o.push({ k: key, mn, sz, nv: pos.length / 3, ni: idx.length, pp: put(q), pi: put(idx) });
  });
  const gz = new Uint8Array(await new Response(new Blob(body).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  let s = ""; for (let i = 0; i < gz.length; i += 0x8000) s += String.fromCharCode.apply(null, gz.subarray(i, i + 0x8000));
  return { d: btoa(s), o, bytes: gz.length };
}

/* Varför ett objekt saknas: finns modellen inläst, hur många objekt med IFC-id har den och vad är första id:t – hjälper att se om id:na inte stämmer. */
function mpWhy(ob, perModel, models) {
  const pm = perModel.find(m => m.id === String(ob.mi)) || perModel.find(m => ob.mn && m.name === String(ob.mn).toLowerCase());
  if (!pm) return "modellen är inte inläst i 3D-editorn";
  const mod = models.find(m => String(m.id) === pm.id), meshes = mod && mod.meshes ? mod.meshes.length : 0, n = pm.map.size, first = [...pm.map.keys()][0] || "";
  return `modellen är inläst (${n} objekt med IFC-id, ${meshes} bitar) men id ${ob.g} finns inte i den${first ? "; exempel på id i modellen: " + first : ""}`;
}

/* Själva byggandet (utan gränssnitt, så att det går att testa): html in -> { html, found, missing, tris, bytes }. */
async function mpBuild(html, opts) {
  const ex = mpExtract(html);
  if (!ex) throw new Error("Det här är inte en montageordning från 4D-dashboarden (Exportera -> HTML).");
  const D = ex.data, models = (typeof l3b !== "undefined" ? l3b.models : []) || [], perModel = [];
  // Per modell: IFC-id -> bitar. Samma objekt-id kan finnas i flera IFC-filer (t.ex. fyra kranar som är kopior av samma modell) – då hämtas formen ur rätt fil (modell-id, annars modellnamn) och inte ur alla.
  models.forEach(m => { const map = typeof l3pEnts === "function" ? l3pEnts(m) : new Map(), mm = new Map(); map.forEach((v, g) => { const a = v.filter(e => !e.mesh.userData.bcopy); if (a.length) mm.set(g, a); }); perModel.push({ id: String(m.id), name: String(m.name || "").toLowerCase(), map: mm }); });
  const entsFor = ob => {
    const g = String(ob.g || ""); if (!g) return null;
    let c = ob.mi ? perModel.filter(m => m.id === String(ob.mi)) : []; if (!c.length && ob.mn) c = perModel.filter(m => m.name && m.name === String(ob.mn).toLowerCase());
    if (c.length === 1 && c[0].map.has(g)) return c[0].map.get(g);
    const has = perModel.filter(m => m.map.has(g)); if (!has.length) return null; if (has.length > 1) ambiguous++;
    return has[0].map.get(g);
  };
  const got = [], gone = []; let missing = 0, total = 0, ambiguous = 0;
  D.steps.forEach((st, i) => (st.obj || []).forEach((ob, k) => {
    total++; const ents = entsFor(ob), mesh = ents && ents.length ? mpObjectMesh(ents) : null;
    if (!mesh) { missing++; ob.b = null; if (gone.length < 6) gone.push(`${i + 1}. ${st.n}: ${ob.n || ob.g}${ob.mn ? " (" + ob.mn + ")" : ""} – ${mpWhy(ob, perModel, models)}`); return; }
    got.push({ key: i + ":" + k, ob, ...mesh });
  }));
  if (!got.length) return { html: null, found: 0, missing, total, ambiguous, gone, tris: 0, bytes: 0 };
  // gemensam origo så att talen blir små; lådan (b) följer med för kameran och fokus
  const o = [Infinity, Infinity, Infinity];
  got.forEach(g => { for (let i = 0; i < g.pos.length; i += 3) for (let a = 0; a < 3; a++) if (g.pos[i + a] < o[a]) o[a] = g.pos[i + a]; });
  let tris = 0;
  got.forEach(g => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < g.pos.length; i += 3) for (let a = 0; a < 3; a++) { g.pos[i + a] -= o[a]; const x = g.pos[i + a]; if (x < mn[a]) mn[a] = x; if (x > mx[a]) mx[a] = x; }
    g.ob.b = [mn[0], mn[1], mn[2], mx[0], mx[1], mx[2]].map(v => Math.round(v * 1000) / 1000); tris += g.idx.length / 3;
  });
  if (opts && opts.maxTris && tris > opts.maxTris && opts.confirm && !(await opts.confirm(tris))) return { html: null, found: got.length, missing, total, ambiguous, tris, bytes: 0, cancelled: true };
  const geo = await mpPack(got);
  D.geo = { d: geo.d, o: geo.o }; D.has3d = true;
  const json = JSON.stringify(D).replace(/</g, "\\u003c");
  return { html: html.slice(0, ex.start) + json + html.slice(ex.end), found: got.length, missing, total, ambiguous, gone, tris, bytes: geo.bytes };
}

/* Modeller som montageordningen använder men som inte är inlästa i 3D-editorn (t.ex. kranar som sparats som egna "Etablering …"-IFC:er): id -> namn. */
function mpNeededModels(D, models) {
  const have = (models || []).map(m => ({ id: String(m.id), name: String(m.name || "").toLowerCase() })), need = new Map();
  D.steps.forEach(st => (st.obj || []).forEach(ob => { if (!ob.mi) return; const mi = String(ob.mi); if (have.some(m => m.id === mi || (ob.mn && m.name === String(ob.mn).toLowerCase()))) return; if (!need.has(mi)) need.set(mi, ob.mn || mi); }));
  return need;
}
/* Letar upp en IFC-fil i projektets mappar i Trimble Connect på filnamnet (rotmappen och några nivåer ner). */
async function mpFindFile(name) {
  const want = String(name || "").toLowerCase(); if (!want) return null;
  const queue = [{ id: null, depth: 0 }]; let seen = 0;
  while (queue.length && seen++ < 40) {
    const { id, depth } = queue.shift(); let r; try { r = await askOpener("tcFolder", { folderId: id }, 30000); } catch (e) { continue; }
    const items = (r && r.items) || [], hit = items.find(x => x.type === "file" && String(x.name).toLowerCase() === want);
    if (hit) return { ...hit, parentId: (r && r.folderId) || id };
    if (depth < 3) items.filter(x => x.type === "folder").forEach(f => queue.push({ id: f.id, depth: depth + 1 }));
  }
  return null;
}
/* Läser in de saknade modellerna tillfälligt: först de som är tända i TC (på id eller namn), annars filen ur projektets mappar. Returnerar { added: [id], unavailable: [namn] }. */
async function mpEnsureModels(D, confirmFn) {
  const need = mpNeededModels(D, typeof l3b !== "undefined" ? l3b.models : []), out = { added: [], unavailable: [], declined: false };
  if (!need.size) return out;
  let tc = []; try { tc = (await askOpener("ifcModelsList", {}, 20000)).models || []; } catch (e) { tc = []; }
  const plan = [];
  for (const [id, name] of need) {
    const lit = tc.find(m => String(m.id) === id) || tc.find(m => m.name && String(m.name).toLowerCase() === String(name).toLowerCase());
    if (lit) { plan.push({ name: lit.name, w: { id: lit.id, name: lit.name, version: lit.version || "" } }); continue; }
    const f = await mpFindFile(name);
    if (f) plan.push({ name: f.name, w: { id: "f:" + f.id, fileId: f.id, name: f.name, parentId: f.parentId || null, version: f.versionId || (f.modified ? String(f.modified) : "") } });
    else out.unavailable.push(name);
  }
  if (!plan.length) return out;
  if (confirmFn && !(await confirmFn(plan.map(x => x.name)))) { out.declined = true; out.unavailable.push(...plan.map(x => x.name)); return out; }
  for (const x of plan) { await l3bLoad([x.w], {}); if (l3b.models.some(m => String(m.id) === String(x.w.id))) out.added.push(String(x.w.id)); else out.unavailable.push(x.name); }
  return out;
}

/* Gränssnittet: välj dashboardens HTML-fil, bygg och ladda ner. */
async function exportMontage3d() {
  const key = "mp3d"; let added = [];
  try {
    if (typeof l3b === "undefined" || !l3b.models.length) { alert("Läs in byggnadens IFC-modell i 3D-vyn först (Lager → 3D-modeller), så att objektens riktiga form finns att hämta."); return null; }
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".html,text/html";
    const file = await new Promise(res => { inp.onchange = () => res(inp.files && inp.files[0]); inp.oncancel = () => res(null); inp.click(); });
    if (!file) return null;
    busyProgress(key, "Montage-HTML: läser filen", 0.1);
    const text = await file.text();
    { const ex0 = mpExtract(text); if (ex0) {
      busyProgress(key, "Montage-HTML: kontrollerar modellerna", 0.2);
      const ens = await mpEnsureModels(ex0.data, names => uiConfirm(`Modeller som behövs i montageordningen\n\nDessa är inte inlästa i 3D-editorn:\n${names.map(n => "• " + n).join("\n")}\n\nLäs in dem tillfälligt från Trimble Connect? De tas bort igen efter exporten.`, { ok: "Läs in" }));
      added = ens.added; if (ens.unavailable.length && !ens.declined) await uiAlert(`Modeller som inte kunde läsas in\n\nDessa hittades inte i Trimble Connect (varken tända eller som fil i projektets mappar), så deras objekt kommer inte med i 3D-vyn:\n${ens.unavailable.map(n => "• " + n).join("\n")}`); } }
    busyProgress(key, "Montage-HTML: hämtar objektens form", 0.4);
    const r = await mpBuild(text, { maxTris: 3e6, confirm: n => uiConfirm(`Objekten har ${(n / 1e6).toFixed(1).replace(".", ",")} miljoner trianglar – filen kan bli stor. Fortsätta?`) });
    busyProgress(key, "", null);
    added.forEach(id => { try { l3bForget(id); } catch (e) { /* */ } }); // tillfälligt inlästa modeller tas bort igen
    if (r.cancelled) return null;
    if (!r.html) { alert(`Inga av de ${r.total} objekten hittades i de inlästa modellerna. Kontrollera att rätt IFC-modell är inläst (och tänd) i 3D-vyn.`); return null; }
    const base = file.name.replace(/\.html?$/i, ""), name = `${base}_3D.html`, blob = new Blob([r.html], { type: "text/html" });
    downloadBlob(blob, name);
    const msg = `✓ ${name} (${(blob.size / 1e6).toFixed(1).replace(".", ",")} MB): ${r.found} av ${r.total} objekt med riktig geometri${r.missing ? `, ${r.missing} hittades inte i modellerna (visas inte i 3D): ${(r.gone || []).join("; ")}` : ""}${r.ambiguous ? `. OBS: ${r.ambiguous} objekt finns i flera inlästa modeller och kunde inte hänföras till rätt fil – exportera om från dashboarden så följer modellen med` : ""}.`;
    if (typeof setSaveStatus === "function") setSaveStatus(msg);
    if (typeof l3Status === "function") l3Status(msg);
    return { name, ...r, html: window.__mpKeep ? r.html : undefined };
  } catch (e) {
    busyProgress(key, "", null);
    added.forEach(id => { try { l3bForget(id); } catch (x) { /* */ } });
    alert("Kunde inte skapa montage-HTML: " + e.message);
    return null;
  }
}
