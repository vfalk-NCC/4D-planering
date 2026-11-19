/* 3D-vyn – exportera scenen till en fristående HTML-fil (Victor 2026-11-19: "en knapp för att exportera detta till html tillsammans med valda modeller & punktmoln").
   Prefix l3xh. Knapp: "🌐 Exportera till HTML…" (vänstermenyn under Bergförankring, och i ritningspanelen). Panel i högermenyn med val av:
   – 3D-modeller (IFC): det som syns i 3D-vyn (släckta/dolda objekt följer inte med), med klass, namn och GUID.
   – Punktmoln: utglesade jämnt till en gemensam punktbudget (färgerna som de visas just nu).
   – Ritade/modellerade objekt per mapp (bergförankringarna m.fl.) med alla egenskaper.
   – Ritningarna (bergförankringens PDF:er) som bilder med klickbara stag nr.
   Visaren (lagesplan-3dscene-viewer.html) har lager på/av, klick i vyn eller listan, sök, zooma, klick på stag nr i ritningen och tvärtom, bakgrund, punktstorlek och bildexport.
   Filen sätts ihop som delar i en Blob (aldrig som en enda sträng) och binärdata är base64 av Float32/Uint32/Uint8. Gräns 400 MB. */

const l3xh = { busy: false, sel: null };
const L3XH_LIM = 400e6;
const l3xhTick = () => new Promise(r => setTimeout(r, 4));
const l3xhR4 = v => Math.round(v * 10000) / 10000;
/* base64 i bitar om 24576 byte (delbart med 3) rakt in i Blob-delarna. */
function l3xhPushB64(parts, arr) { const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); for (let i = 0; i < u.length; i += 0x6000) parts.push(btoa(String.fromCharCode.apply(null, u.subarray(i, i + 0x6000)))); }
const l3xhB64Len = n => Math.ceil(n / 3) * 4;

/* ---- Vad som finns att exportera ---- */
function l3xhModels() { return (typeof l3b !== "undefined" ? l3b.models : []).filter(m => m && m.meshes && m.meshes.length && m.visible !== false); }
function l3xhModelCount(m) { let tris = 0, verts = 0, objs = 0; m.meshes.forEach(mesh => { const u = mesh.userData.l3b; if (!u) return; u.ranges.forEach((r, ri) => { if (typeof l3bsDead === "function" && l3bsDead(mesh, ri)) return; objs++; verts += r.count; tris += (r.idxCount != null ? r.idxCount : r.count * 1.5) / 3; }); }); return { tris: Math.round(tris), verts, objs }; }
function l3xhClouds() { return (typeof l3pc !== "undefined" ? l3pc.clouds : []).filter(c => c && c.group && c.visible !== false && l3xhPoints(c).length); }
/* Punkterna som ligger i minnet för ett moln (hela molnet, eller översikten för stora okträdsmoln som ritas nod för nod). */
function l3xhPoints(c) { const out = []; try { c.group.traverse(g => { if (g.isPoints && g.geometry && g.geometry.getAttribute("position")) out.push(g); }); } catch (e) { /* */ } return out; }
const l3xhCloudN = c => { try { return l3xhPoints(c).reduce((a, g) => a + g.geometry.getAttribute("position").count, 0); } catch (e) { return c.nTot || 0; } };
function l3xhAreas() {
  const M = new Map(); (typeof placements !== "undefined" ? placements : []).forEach(p => {
    if (!p.m || p.m.k === "curve" || (l3 && l3.hidden && l3.hidden.has(p.id))) return; const a = p.area || "(utan mapp)"; if (!M.has(a)) M.set(a, []); M.get(a).push(p);
  });
  return [...M.entries()].sort((a, b) => (/^Bergförankring/.test(b[0]) ? 1 : 0) - (/^Bergförankring/.test(a[0]) ? 1 : 0) || a[0].localeCompare(b[0], "sv", { numeric: true }));
}
/* ---- Lager ---- */
function l3xhModelLayer(m) {
  const items = []; let nV = 0, nT = 0;
  m.meshes.forEach(mesh => { const u = mesh.userData.l3b; if (!u || !u.origIdx) return; u.ranges.forEach((r, ri) => { if (typeof l3bsDead === "function" && l3bsDead(mesh, ri)) return; const [s, n] = l3bsIdx(mesh, ri); if (!n) return; items.push({ mesh, u, r, s, n }); nV += r.count; nT += n; }); });
  const pos = new Float32Array(nV * 3), vc = new Uint8Array(nV * 3), idx = new Uint32Array(nT), objs = [], v = new THREE.Vector3(); let bv = 0, bi = 0, lastMesh = null, P, Cc, W, u8;
  items.forEach(it => {
    if (it.mesh !== lastMesh) { lastMesh = it.mesh; it.mesh.updateWorldMatrix(true, false); W = it.mesh.matrixWorld; P = it.mesh.geometry.getAttribute("position"); Cc = it.mesh.geometry.getAttribute("color"); u8 = Cc && Cc.array instanceof Uint8Array; }
    const r = it.r;
    for (let i = 0; i < r.count; i++) { v.fromBufferAttribute(P, r.start + i).applyMatrix4(W); const o = (bv + i) * 3; pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z;
      if (Cc) { const k = (r.start + i) * 3; vc[o] = u8 ? Cc.array[k] : Cc.array[k] * 255; vc[o + 1] = u8 ? Cc.array[k + 1] : Cc.array[k + 1] * 255; vc[o + 2] = u8 ? Cc.array[k + 2] : Cc.array[k + 2] * 255; } else { vc[o] = vc[o + 1] = vc[o + 2] = 200; } }
    for (let i = 0; i < it.n; i++) idx[bi + i] = it.u.origIdx[it.s + i] - r.start + bv;
    objs.push({ n: r.name || r.cls || "Objekt", c: String(r.cls || "").replace(/^Ifc/i, ""), g: r.guid || "", s: bi, k: it.n }); bv += r.count; bi += it.n;
  });
  return { k: "model", name: m.name || "Modell", pos, idx, vc, objs, tris: nT / 3 };
}
function l3xhAreaLayer(area, list) {
  const baseZ = p => (typeof placeBaseZ === "function" ? placeBaseZ(p) : (Number(p.z) || 0) + (Number(p.dz) || 0)), O = l3.O, P = [], F = [], objs = []; let col = null;
  list.forEach(p => {
    const parts = typeof modParts === "function" ? modParts(p, baseZ(p)) : []; if (!parts.length) return; const s = F.length; let added = 0;
    parts.forEach(pt => { if (!pt.tris) return; const b = P.length; pt.tris.pts.forEach(q => P.push([q[0] - O[0], q[1] - O[1], q[2] - O[2]])); pt.tris.faces.forEach(f => { F.push(f[0] - 1 + b, f[1] - 1 + b, f[2] - 1 + b); added += 3; }); });
    if (!added) return; col = col || p.color || "#a8b3c4";
    const bf = p.m && p.m.bfp, rows = bf || (typeof modProps === "function" ? (() => { try { return modProps(p); } catch (e) { return []; } })() : []);
    objs.push({ n: p.name || "Objekt", c: area, s, k: added, id: bf ? bf[0][1] : "", p: rows.map(r => [String(r[0]), r[1] == null ? "" : String(r[1])]) });
  });
  const pos = new Float32Array(P.length * 3); P.forEach((q, i) => { pos[i * 3] = q[0]; pos[i * 3 + 1] = q[1]; pos[i * 3 + 2] = q[2]; });
  return { k: "objs", name: area, col: col || "#a8b3c4", pos, idx: new Uint32Array(F), objs };
}
function l3xhCloudLayer(c, limit) {
  const pts = l3xhPoints(c), N = pts.reduce((a, g) => a + g.geometry.getAttribute("position").count, 0), stride = Math.max(1, Math.ceil(N / Math.max(1, limit))), M = Math.ceil(N / stride);
  const pos = new Float32Array(M * 3), vc = new Uint8Array(M * 3), v = new THREE.Vector3(); let o = 0, run = 0;
  c.group.updateWorldMatrix(true, true);
  pts.forEach(g => { const P = g.geometry.getAttribute("position"), Cc = g.geometry.getAttribute("color"), u8 = Cc && Cc.array instanceof Uint8Array; g.updateWorldMatrix(true, false); const W = g.matrixWorld;
    for (let i = 0; i < P.count; i++) { if ((run++) % stride) continue; if (o >= M) break; v.fromBufferAttribute(P, i).applyMatrix4(W); pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
      if (Cc) { vc[o * 3] = u8 ? Cc.array[i * 3] : Cc.array[i * 3] * 255; vc[o * 3 + 1] = u8 ? Cc.array[i * 3 + 1] : Cc.array[i * 3 + 1] * 255; vc[o * 3 + 2] = u8 ? Cc.array[i * 3 + 2] : Cc.array[i * 3 + 2] * 255; } else { vc[o * 3] = vc[o * 3 + 1] = vc[o * 3 + 2] = 200; } o++; } });
  return { k: "cloud", name: c.name || "Punktmoln", pos: pos.subarray(0, o * 3), vc: vc.subarray(0, o * 3), n: o, of: N };
}
/* Ritningarna som JPEG med stag-fält i bråkdelar av bilden (bara stag som finns i exporten). */
async function l3xhDocs(ids) {
  const docs = (typeof l3bf !== "undefined" && l3bf.docs && l3bf.docs.length) ? l3bf.docs : (typeof l3bfLoadDocs === "function" ? await l3bfLoadDocs() : []); if (!docs.length || typeof pdfjsLib === "undefined") return [];
  const out = [];
  for (const d of docs) {
    try {
      const pages = await l3bfReadDoc(d.buf);
      for (let n = 0; n < pages.length; n++) {
        const pg = pages[n], vp = pg.page.getViewport({ scale: 0.9 }), cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
        await pg.page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise;
        const W = pg.view[2] - pg.view[0], H = pg.view[3] - pg.view[1], pad = 2;
        out.push({ name: String(d.name).replace(/\.pdf$/i, "") + (pages.length > 1 ? " s." + (n + 1) : ""), img: cv.toDataURL("image/jpeg", 0.8),
          hot: pg.hot.filter(h => ids.has(h.id)).map(h => ({ id: h.id, x: l3xhR4((h.x - pad - pg.view[0]) / W), y: l3xhR4((pg.view[3] - h.y - h.h * 0.95 - pad) / H), w: l3xhR4((h.w + pad * 2) / W), h: l3xhR4((h.h * 1.2 + pad * 2) / H) })) });
      }
    } catch (e) { console.warn("Ritningen kunde inte tas med", d.name, e); }
  }
  return out;
}
/* ---- Exporten ---- */
async function l3xhExport(sel) {
  if (l3xh.busy) return null; l3xh.busy = true;
  try {
    const layers = []; let tris = 0, pts = 0;
    l3Status("Samlar in modellerna…"); await l3xhTick();
    for (const m of sel.models) { const L = l3xhModelLayer(m); if (L.objs.length) { layers.push(L); tris += L.tris; } await l3xhTick(); }
    for (const [area, list] of sel.areas) { const L = l3xhAreaLayer(area, list); if (L.objs.length) { layers.push(L); tris += L.idx.length / 3; } }
    const totN = sel.clouds.reduce((a, c) => a + l3xhCloudN(c), 0) || 1;
    for (const c of sel.clouds) { const L = l3xhCloudLayer(c, Math.round(sel.budget * l3xhCloudN(c) / totN)); if (L.n) { layers.push(L); pts += L.n; } await l3xhTick(); }
    if (!layers.length) { l3Status("Inget valt att exportera.", true); return null; }
    const est = layers.reduce((a, L) => a + L.pos.byteLength * 1.34 + (L.idx ? L.idx.byteLength * 1.34 : 0) + (L.vc ? L.vc.byteLength * 1.34 : 0), 0);
    if (est > L3XH_LIM) { l3Status(`Filen blir för stor (${(est / 1048576).toFixed(0)} MB, gränsen är ${(L3XH_LIM / 1048576).toFixed(0)} MB). Välj färre modeller eller en lägre punktbudget.`, true); return null; }
    const ids = new Set(); layers.forEach(L => (L.objs || []).forEach(o => { if (o.id) ids.add(o.id); }));
    let docs = []; if (sel.docs && ids.size) { l3Status("Ritar ritningarna…"); await l3xhTick(); docs = await l3xhDocs(ids); }
    l3Status("Bygger HTML-filen…"); await l3xhTick();
    const get = async u => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} (${r.status})`); return r.text(); };
    const [tpl, three, orbit] = await Promise.all([get("lagesplan-3dscene-viewer.html"), get("vendor/three/three.min.js"), get("vendor/three/OrbitControls.js")]);
    const safe = t => t.replace(/<\/(script)/gi, "<\\/$1"), M1 = "/*__THREE__*/", M2 = "/*__ORBIT__*/", M3 = "/*__DATA__*/null", i1 = tpl.indexOf(M1), i2 = tpl.indexOf(M2), i3 = tpl.indexOf(M3);
    if (i1 < 0 || i2 < 0 || i3 < 0) throw new Error("Visarmallen är skadad.");
    const stats = `${layers.filter(L => L.k === "model").length} modeller, ${layers.filter(L => L.k === "objs").reduce((a, L) => a + L.objs.length, 0)} ritade objekt, ${Math.round(tris / 1000)} tusen trianglar${pts ? ", " + (pts / 1e6).toFixed(1).replace(".", ",") + " milj. punkter" : ""}`;
    const meta = { title: sel.title, exported: new Date().toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }), stats, origin: l3.O };
    const parts = [tpl.slice(0, i1), safe(three), tpl.slice(i1 + M1.length, i2), safe(orbit), tpl.slice(i2 + M2.length, i3), safe(JSON.stringify({ meta }).slice(0, -1)), ',"layers":['];
    layers.forEach((L, k) => {
      parts.push(k ? "," : "", safe(JSON.stringify({ k: L.k, name: L.name, col: L.col, objs: L.objs }).slice(0, -1)), ',"pos":"'); l3xhPushB64(parts, L.pos);
      if (L.idx) { parts.push('","idx":"'); l3xhPushB64(parts, L.idx); } if (L.vc) { parts.push('","vc":"'); l3xhPushB64(parts, L.vc); } parts.push('"}');
    });
    parts.push('],"docs":', safe(JSON.stringify(docs)), "}", tpl.slice(i3 + M3.length));
    const name = `${sel.title}.html`.replace(/[\\/:*?"<>|]/g, "_"), blob = new Blob(parts, { type: "text/html;charset=utf-8" });
    if (!sel.noDownload) { if (typeof downloadBlob === "function") downloadBlob(blob, name); else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000); } }
    l3Status(`HTML sparad: ${stats}${docs.length ? `, ${docs.length} ritningar` : ""}, ${(blob.size / 1048576).toFixed(1).replace(".", ",")} MB.`);
    return { name, size: blob.size, blob, layers: layers.length, docs: docs.length };
  } finally { l3xh.busy = false; }
}
/* ---- Panel i högermenyn ---- */
function l3xhOpen() { try { l3xhOpen0(); } catch (e) { console.error(e); l3Status("Kunde inte öppna exportpanelen: " + e.message, true); } }
function l3xhOpen0() {
  if (typeof l3bfPanel !== "function") { l3Status("Panelen finns inte i den här versionen.", true); return; }
  const esc = typeof escHtml === "function" ? escHtml : s => String(s), models = l3xhModels(), clouds = l3xhClouds(), areas = l3xhAreas(), f = (n, d = 0) => Number(n).toLocaleString("sv-SE", { maximumFractionDigits: d });
  const hasDocs = !!(typeof l3bf !== "undefined" && l3bf.docs && l3bf.docs.length);
  const cnts = models.map(l3xhModelCount), cb = (cls, i, label, sub, on = true) => `<label class="v3-row" style="display:flex;gap:6px;align-items:baseline"><input type="checkbox" data-${cls}="${i}" ${on ? "checked" : ""}><span style="flex:1">${esc(label)}</span><small style="color:#64748b">${sub}</small></label>`;
  const d = l3bfPanel("v3XhPanel", "Exportera till HTML", `
    <div class="v3-sub">Skapar en fristående HTML-fil med det du bockar i. Den öppnas i vilken webbläsare som helst, utan Trimble Connect eller inloggning.</div>
    <label class="v3-row">Filnamn <input type="text" id="v3XhName" value="${esc((typeof projectName !== "undefined" && projectName) || "3D-vy")}" style="flex:1;min-width:0"></label>
    <div class="v3-sec">3D-modeller (det som syns nu)</div>${models.length ? models.map((m, i) => cb("xm", i, m.name || "Modell", `${f(cnts[i].objs)} objekt · ${f(cnts[i].tris / 1000)} tkr tri`)).join("") : '<div class="v3-sub">Inga modeller tända.</div>'}
    <div class="v3-sec">Punktmoln</div>${clouds.length ? clouds.map((c, i) => cb("xc", i, c.name || "Punktmoln", `${f(l3xhCloudN(c) / 1e6, 1)} milj.`)).join("") + `<label class="v3-row">Punktbudget i filen <select id="v3XhBud"><option value="1000000">1 milj.</option><option value="2000000" selected>2 milj.</option><option value="4000000">4 milj.</option><option value="8000000">8 milj.</option></select></label>` : '<div class="v3-sub">Inga punktmoln tända.</div>'}
    <div class="v3-sec">Ritade objekt (mappar)</div>${areas.length ? areas.map(([a, l], i) => cb("xa", i, a, l.length + " st", /^Bergförankring/.test(a) || areas.length <= 4)).join("") : '<div class="v3-sub">Inga ritade objekt.</div>'}
    <label class="v3-row" ${hasDocs ? "" : 'style="opacity:.5"'}><input type="checkbox" id="v3XhDocs" ${hasDocs ? "checked" : "disabled"}> Ritningarna (bergförankring) som bilder med klickbara stag nr${hasDocs ? "" : " – läs in dem med ⚓-knappen först"}</label>
    <div id="v3XhEst" class="v3-sub"></div>
    <div class="an-actions"><button type="button" id="v3XhGo">🌐 Exportera HTML</button></div>`);
  const $ = id => d.querySelector("#" + id), pick = () => ({ models: models.filter((_, i) => (d.querySelector(`[data-xm="${i}"]`) || {}).checked), clouds: clouds.filter((_, i) => (d.querySelector(`[data-xc="${i}"]`) || {}).checked), areas: areas.filter((_, i) => (d.querySelector(`[data-xa="${i}"]`) || {}).checked), budget: $("v3XhBud") ? +$("v3XhBud").value : 0, docs: !!($("v3XhDocs") || {}).checked, title: ($("v3XhName").value || "3D-vy").trim() });
  const est = () => { const s = pick(); let b = 0; s.models.forEach(m => { const c = l3xhModelCount(m); b += c.verts * 15 * 1.34 + c.tris * 12 * 1.34; }); const totN = s.clouds.reduce((a, c) => a + l3xhCloudN(c), 0); b += Math.min(totN, s.budget) * 15 * 1.34; s.areas.forEach(([, l]) => { b += l.length * 2400; }); if (s.docs) b += 3.5e6; $("v3XhEst").innerHTML = `Ungefärlig filstorlek: <b>${f(b / 1048576, 0)} MB</b>${b > L3XH_LIM ? ' <span style="color:#dc2626">– för stor, välj färre</span>' : ""}`; };
  d.addEventListener("change", est); est(); l3Status("Exportpanelen ligger i högermenyn – välj vad som ska med och tryck Exportera HTML.");
  $("v3XhGo").onclick = async () => { const b = $("v3XhGo"); b.disabled = true; try { await l3xhExport(pick()); } catch (e) { l3Status("Kunde inte exportera: " + e.message, true); } b.disabled = false; };
}
