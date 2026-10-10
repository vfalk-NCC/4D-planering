/* 3D-vyn – egenskaper i inlästa IFC-modeller (Victor 2026-10-10: "Jag ska få mycket mer info än detta
   också, samt att jag ska kunna sortera på alla olika UDA som objektet har på något snyggt sätt, kanske
   i en collapsible högermeny").

   – Ett markerat objekt visar allt i högerpanelen: attribut, var det ligger (våning/byggnad), typ,
     material och alla egenskapsgrupper (Psets – Teklas UDA:er hamnar här) och mängder, hopfällbara och
     sökbara. Vid varje egenskap: Gruppera.
   – Fliken Egenskaper (till vänster): välj en egenskap -> alla värden med antal objekt; tryck på ett
     värde för att markera de objekten, Färga efter värde färgar hela modellen.
   Egenskaperna läses ur modellens original-IFC i en egen tråd (ifc-props-worker.js). Originalet sparas
   i webbläsaren när modellen läses in, så det behöver inte hämtas från Trimble Connect igen. */

const l3p = { w: new Map(), mem: new Map(), colorBy: null, group: null, keys: null, keysFor: "" };
const L3P_DB = "lagesplan-ifc-raw", L3P_STORE = "raw", L3P_KEEP = 3, SEPK = "\u0001";
const L3P_COLORS = ["#2563eb", "#f97316", "#16a34a", "#dc2626", "#9333ea", "#0891b2", "#ca8a04", "#db2777", "#4f46e5", "#65a30d", "#0d9488", "#b45309", "#7c3aed", "#e11d48", "#0284c7", "#a16207"];

/* ---- Originalfilen ------------------------------------------------------------------------------ */
const l3pRawKey = w => (w && w.version ? `raw|${projectId}|${w.fileId ? "f:" + w.fileId : w.id}|${w.version}` : null);
function l3pDb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === "undefined") return rej(new Error("ingen IndexedDB"));
    const q = indexedDB.open(L3P_DB, 1);
    q.onupgradeneeded = () => q.result.createObjectStore(L3P_STORE);
    q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
  });
}
/* Vid inläsning (innan bytes lämnas till läs-tråden): en kopia som Blob, sparad i bakgrunden. */
function l3pKeepRaw(w, bytes, placement) {
  try {
    const blob = new Blob([bytes]);
    l3p.mem.set(w.id, { blob, placement: placement || null, version: w.version });
    const key = l3pRawKey(w);
    if (!key) return;
    l3pDb().then(db => {
      db.transaction(L3P_STORE, "readwrite").objectStore(L3P_STORE).put({ blob, placement: placement || null, at: Date.now() }, key);
      const c = db.transaction(L3P_STORE).objectStore(L3P_STORE).openCursor(), all = [];
      c.onsuccess = () => {
        const cur = c.result;
        if (cur) { all.push([cur.key, cur.value.at || 0]); cur.continue(); return; }
        if (all.length > L3P_KEEP) { const st = db.transaction(L3P_STORE, "readwrite").objectStore(L3P_STORE); all.sort((a, b) => b[1] - a[1]).slice(L3P_KEEP).forEach(([k]) => st.delete(k)); }
      };
    }).catch(() => { /* bara en snabbväg */ });
  } catch (e) { /* bara en snabbväg */ }
}
async function l3pRawLocal(m) {
  const w = m.src || {}, mem = l3p.mem.get(m.id);
  if (mem && (!w.version || mem.version === w.version)) return mem;
  const key = l3pRawKey(w);
  if (!key) return null;
  try {
    const db = await l3pDb();
    const rec = await new Promise(res => { const q = db.transaction(L3P_STORE).objectStore(L3P_STORE).get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); });
    if (rec && rec.blob) { const r = { blob: rec.blob, placement: rec.placement || null, version: w.version }; l3p.mem.set(m.id, r); return r; }
  } catch (e) { /* ingen lokal kopia */ }
  return null;
}
/* Originalet: lokalt om det finns, annars från Trimble Connect (och sparas lokalt). */
async function l3pRaw(m, onProgress) {
  const loc = await l3pRawLocal(m);
  if (loc) return loc;
  const w = m.src || {};
  const r = w.fileId ? await askOpener("tcFile", { fileId: w.fileId, name: w.name }, 0, onProgress)
    : await askOpener("ifcModelData", { modelId: w.id || m.id }, 0, onProgress);
  l3pKeepRaw(w.id ? w : { ...w, id: m.id }, r.bytes, w.fileId ? null : r.placement);
  return l3p.mem.get(m.id) || l3p.mem.get(w.id);
}

/* ---- Tråden per modell -------------------------------------------------------------------------- */
function l3pSceneGuids(m) { const s = new Set(); m.meshes.forEach(x => x.userData.l3b.ranges.forEach(r => { if (r.guid) s.add(r.guid); })); return [...s]; }
function l3pCall(st, msg, onProg) {
  return new Promise((res, rej) => { const id = ++st.n; st.pending.set(id, { res, rej, onProg }); st.wk.postMessage({ ...msg, id }); });
}
/* Öppnar (en gång) modellens egenskapstråd. needDownload: hämta från TC om originalet inte finns lokalt. */
async function l3pOpen(m, opts = {}) {
  let st = l3p.w.get(m.id);
  if (st && st.version === (m.src && m.src.version)) return st.ready;
  if (st) st.wk.terminate();
  st = { wk: null, n: 0, pending: new Map(), version: m.src && m.src.version, ready: null };
  l3p.w.set(m.id, st);
  st.ready = (async () => {
    const key = "props:" + m.id, lbl = `Läser egenskaper i ${m.name}`;
    try {
      let raw = await l3pRawLocal(m);
      if (!raw) {
        if (opts.local) { l3p.w.delete(m.id); return null; }
        busyProgress(key, `${lbl}: hämtar originalet`, 0);
        raw = await l3pRaw(m, (f, got, tot) => busyProgress(key, `${lbl}: hämtar originalet${got && typeof l3bMb === "function" ? ` – ${l3bMb(got)}${tot ? ` av ${l3bMb(tot)}` : ""} MB` : ""}`, 0.6 * f));
      }
      const ver = ((document.querySelector('script[src*="lagesplan-3dprops.js"]') || {}).src || "").split("?")[1] || ""; // samma stämpel som skripten
      st.wk = new Worker("ifc-props-worker.js" + (ver ? "?" + ver : ""));
      st.wk.onmessage = ev => {
        const d = ev.data, p = st.pending.get(d.id);
        if (!p) return;
        if ("prog" in d) { if (p.onProg) p.onProg(d.prog); return; }
        st.pending.delete(d.id);
        if (d.error) p.rej(new Error(d.error)); else p.res(d.ok);
      };
      st.wk.onerror = e => { st.pending.forEach(p => p.rej(new Error(e.message || "Egenskapstråden stannade."))); st.pending.clear(); };
      busyProgress(key, lbl, 0.6);
      const info = await l3pCall(st, { op: "open", blob: raw.blob, guids: l3pSceneGuids(m) }, f => busyProgress(key, lbl, 0.6 + 0.4 * f));
      busyProgress(key, "", null);
      l3Status(`Egenskaperna i ${m.name} är inlästa (${info.products.toLocaleString("sv-SE")} objekt).`);
      return st;
    } catch (e) {
      busyProgress(key, "", null);
      if (st.wk) st.wk.terminate();
      l3p.w.delete(m.id);
      throw e;
    }
  })();
  return st.ready;
}
/* Modellen togs bort eller ersattes av en ny version (originalet i minnet har versionen och får vara kvar). */
function l3pDrop(id) { const st = l3p.w.get(id); if (st && st.wk) st.wk.terminate(); l3p.w.delete(id); l3p.keys = null; if (l3p.group && l3p.group.list.some(x => x.parts.some(p => p[0].id === id))) { l3p.group = null; if (l3p.colorBy) l3pColorOff(); } }
async function l3pProps(m, guid, opts) { const st = await l3pOpen(m, opts); return st ? l3pCall(st, { op: "props", guid }) : null; }

/* ---- Högerpanelen: ett markerat objekt ---------------------------------------------------------- */
function l3pClosed() { return new Set(l3Prefs().propsClosed || []); }
function l3pRowHtml(label, value, key) {
  const esc = escHtml;
  return `<tr data-q="${esc((label + " " + value).toLowerCase())}"><td>${esc(label)}</td><td>${esc(value)}</td><td>${key ? `<button type="button" class="v3-pg" data-pgroup="${esc(key)}" title="Gruppera alla objekt efter ${esc(label)}">≡</button>` : ""}</td></tr>`;
}
function l3pSecHtml(id, title, n, body, closed) {
  const esc = escHtml;
  return `<details class="v3-ps" data-sec="${esc(id)}" ${closed.has(id) ? "" : "open"}><summary><span>${esc(title)}</span><em>${n}</em></summary><table class="v3-pt">${body}</table></details>`;
}
function l3pPanelHtml(d) {
  const closed = l3pClosed();
  let h = `<input type="search" class="v3-psearch" placeholder="Sök egenskap eller värde…" />`;
  h += l3pSecHtml("Objekt", "Objekt", d.attrs.length, d.attrs.map(([l, v, k]) => l3pRowHtml(l, v, k)).join(""), closed);
  if (d.loc.length) h += l3pSecHtml("Plats", "Plats i byggnaden", d.loc.length, d.loc.map(([l, v], i) => l3pRowHtml(l, v, i === 0 ? "a:storey" : "")).join(""), closed);
  if (d.type || d.material.length) {
    const rows = (d.type ? l3pRowHtml("Typ", d.type.name || d.type.cls, "a:type") + l3pRowHtml("Typklass", d.type.cls, "") : "") + d.material.map((x, i) => l3pRowHtml(i ? "" : "Material", x, i ? "" : "a:material")).join("");
    h += l3pSecHtml("Typ", "Typ och material", (d.type ? 1 : 0) + d.material.length, rows, closed);
  }
  const grp = (list, from) => list.forEach(ps => {
    const sid = (ps.q ? "q:" : "p:") + ps.n + (from ? " (typ)" : "");
    h += l3pSecHtml(sid, ps.n + (from ? " · från typen" : ""), ps.p.length, ps.p.map(([pn, v]) => l3pRowHtml(pn, v, "p:" + ps.n + SEPK + pn)).join(""), closed);
  });
  grp(d.psets.filter(x => !x.q), false);
  if (d.type) grp(d.type.psets.filter(x => !x.q), true);
  grp(d.psets.filter(x => x.q), false);
  if (d.type) grp(d.type.psets.filter(x => x.q), true);
  if (!d.psets.length && !(d.type && d.type.psets.length)) h += `<div class="v3-pal-hint">Objektet har inga egenskapsgrupper i IFC-filen.</div>`;
  return h;
}
function l3pBind(host) {
  host.querySelectorAll("details.v3-ps").forEach(dt => { dt.ontoggle = () => { const c = l3pClosed(); if (dt.open) c.delete(dt.dataset.sec); else c.add(dt.dataset.sec); l3SetPref("propsClosed", [...c].slice(-300)); }; });
  host.querySelectorAll("[data-pgroup]").forEach(b => { b.onclick = e => { e.stopPropagation(); l3pGroupBy(b.dataset.pgroup); }; });
  const q = host.querySelector(".v3-psearch");
  if (q) q.oninput = () => {
    const t = q.value.trim().toLowerCase();
    host.querySelectorAll("details.v3-ps").forEach(dt => {
      let any = false;
      dt.querySelectorAll("tr").forEach(tr => { const hit = !t || tr.dataset.q.includes(t) || dt.dataset.sec.toLowerCase().includes(t); tr.style.display = hit ? "" : "none"; any = any || hit; });
      dt.style.display = any ? "" : "none";
      if (t && any) dt.open = true;
    });
  };
}
/* Fyller panelen för ett markerat objekt (anropas av l3bsRenderSide). */
async function l3pFillSide(side, ent) {
  const host = side.querySelector("#v3BsProps");
  if (!host) return;
  const u = ent.mesh.userData.l3b, r = u.ranges[ent.ri], m = u.model, sid = side.dataset.id;
  if (!r.guid || !m) { host.innerHTML = ""; return; }
  const show = d => {
    if (side.dataset.id !== sid) return;
    if (!d) { host.innerHTML = `<div class="v3-pal-hint">Objektet hittades inte i IFC-filen.</div>`; return; }
    host.innerHTML = l3pPanelHtml(d); l3pBind(host);
  };
  host.innerHTML = `<div class="v3-pal-hint"><span class="pm-spin"></span> Läser egenskaper…</div>`;
  try {
    const d = await l3pProps(m, r.guid, { local: true });
    if (d !== null || l3p.w.has(m.id)) { show(d); return; }
    // Originalet finns inte lokalt (modellen kom ur cachen): hämtas först på begäran.
    if (side.dataset.id !== sid) return;
    host.innerHTML = `<button type="button" class="v3-wide" id="v3PropsLoad" title="Modellens IFC-fil hämtas från Trimble Connect en gång och sparas i webbläsaren">Visa alla egenskaper (hämtar ${escHtml(m.name)})</button>`;
    host.querySelector("#v3PropsLoad").onclick = async () => {
      host.innerHTML = `<div class="v3-pal-hint"><span class="pm-spin"></span> Hämtar och läser egenskaper…</div>`;
      try { show(await l3pProps(m, r.guid)); } catch (e) { host.innerHTML = `<div class="v3-pal-hint bad">${escHtml(e.message)}</div>`; }
    };
  } catch (e) { if (side.dataset.id === sid) host.innerHTML = `<div class="v3-pal-hint bad">Kunde inte läsa egenskaperna: ${escHtml(e.message)}</div>`; }
}

/* ---- Gruppera (fliken Egenskaper) --------------------------------------------------------------- */
const L3P_ATTR = { "a:cls": "IFC-klass", "a:type": "Typ", "a:storey": "Våning", "a:material": "Material", "a:name": "Namn", "a:objtype": "Objekttyp", "a:tag": "Tag" };
function l3pKeyLabel(k) { if (L3P_ATTR[k]) return L3P_ATTR[k]; const [ps, pn] = k.slice(2).split(SEPK); return `${pn} (${ps})`; }
const l3pModels = () => l3b.models.filter(m => m.visible);
async function l3pOpenAll(download) {
  const out = [], missing = [];
  for (const m of l3pModels()) {
    try { const st = await l3pOpen(m, { local: !download }); if (st) out.push([m, st]); else missing.push(m); }
    catch (e) { l3Status(`Kunde inte läsa egenskaperna i ${m.name}: ${e.message}`, true); }
  }
  return { out, missing };
}
async function l3pLoadKeys(download) {
  const host = document.getElementById("v3PalProps");
  const sig = l3pModels().map(m => m.id + "@" + (m.src && m.src.version)).join(",");
  if (l3p.keys && l3p.keysFor === sig && !download) return l3p.keys;
  if (host) host.querySelector(".v3-pp-body").innerHTML = `<div class="v3-pal-hint"><span class="pm-spin"></span> Läser egenskaperna…</div>`;
  const { out, missing } = await l3pOpenAll(download);
  const merged = new Map();
  for (const [m, st] of out) {
    const ks = await l3pCall(st, { op: "keys" }, f => busyProgress("propkeys", `Samlar egenskaper i ${m.name}`, f));
    ks.forEach(([k, ps, pn, n]) => { const x = merged.get(k); if (x) x[3] += n; else merged.set(k, [k, ps, pn, n]); });
  }
  busyProgress("propkeys", "", null);
  l3p.keys = { list: [...merged.values()], missing };
  l3p.keysFor = sig;
  return l3p.keys;
}
function l3pRenderTab() {
  const host = document.getElementById("v3PalProps");
  if (!host || host.classList.contains("hidden")) return;
  if (!host.querySelector(".v3-pp-body")) host.innerHTML = `<input type="search" class="v3-pp-q" placeholder="Sök egenskap…" /><div class="v3-pp-body"></div>`;
  const body = host.querySelector(".v3-pp-body"), qi = host.querySelector(".v3-pp-q");
  if (!l3b.models.length) { body.innerHTML = `<div class="v3-pal-hint">Läs in en IFC-modell under Lager först.</div>`; return; }
  if (l3p.group) { qi.classList.add("hidden"); l3pRenderValues(body); return; }
  qi.classList.remove("hidden");
  const sig = l3pModels().map(m => m.id + "@" + (m.src && m.src.version)).join(",");
  if (!l3p.keys || l3p.keysFor !== sig) { l3pLoadKeys(false).then(() => l3pRenderTab()).catch(e => { body.innerHTML = `<div class="v3-pal-hint bad">${escHtml(e.message)}</div>`; }); return; }
  const esc = escHtml, { list, missing } = l3p.keys, t = qi.value.trim().toLowerCase();
  const closed = l3pClosed();
  let h = missing.length ? `<button type="button" class="v3-wide" id="v3PpLoad" title="Originalfilerna hämtas från Trimble Connect en gång och sparas i webbläsaren">Läs egenskaper i ${missing.length} ${missing.length === 1 ? "modell" : "modeller"} till (hämtar från TC)</button>` : "";
  const groups = new Map([["", []]]);
  list.forEach(x => { const g = x[1] || ""; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(x); });
  groups.forEach((rows, g) => {
    const vis = rows.filter(x => !t || (l3pKeyLabel(x[0]) + " " + g).toLowerCase().includes(t));
    if (!vis.length) return;
    const id = "g:" + (g || "Allmänt");
    h += `<details class="v3-ps" data-sec="${esc(id)}" ${closed.has(id) && !t ? "" : "open"}><summary><span>${esc(g || "Allmänt")}</span><em>${vis.length}</em></summary>`
      + vis.map(x => `<button type="button" class="v3-pp-k" data-pkey="${esc(x[0])}"><span>${esc(x[2] || L3P_ATTR[x[0]])}</span><em>${x[3].toLocaleString("sv-SE")}</em></button>`).join("") + `</details>`;
  });
  if (!list.length && !missing.length) h += `<div class="v3-pal-hint">Inga egenskaper hittades.</div>`;
  body.innerHTML = h;
  qi.oninput = () => l3pRenderTab();
  body.querySelectorAll("details.v3-ps").forEach(dt => { dt.ontoggle = () => { if (t) return; const c = l3pClosed(); if (dt.open) c.delete(dt.dataset.sec); else c.add(dt.dataset.sec); l3SetPref("propsClosed", [...c].slice(-300)); }; });
  body.querySelectorAll("[data-pkey]").forEach(b => { b.onclick = () => l3pGroupBy(b.dataset.pkey); });
  const ld = body.querySelector("#v3PpLoad");
  if (ld) ld.onclick = async () => { ld.disabled = true; try { await l3pLoadKeys(true); } catch (e) { l3Status(e.message, true); } l3pRenderTab(); };
}
/* Grupperar alla synliga modellers objekt efter en egenskap. */
async function l3pGroupBy(key) {
  if (typeof l3PalTab === "function") l3PalTab("props");
  const body = document.querySelector("#v3PalProps .v3-pp-body");
  if (body) body.innerHTML = `<div class="v3-pal-hint"><span class="pm-spin"></span> Grupperar efter ${escHtml(l3pKeyLabel(key))}…</div>`;
  const { out } = await l3pOpenAll(false);
  const vals = new Map();
  for (const [m, st] of out) {
    const res = await l3pCall(st, { op: "values", key }, f => busyProgress("propvals", `Grupperar ${m.name}`, f));
    res.forEach(([v, guids]) => { if (!vals.has(v)) vals.set(v, []); vals.get(v).push([m, guids]); });
  }
  busyProgress("propvals", "", null);
  const list = [...vals].map(([v, parts]) => ({ v, parts, n: parts.reduce((a, p) => a + p[1].length, 0) }))
    .sort((a, b) => (a.v === "\u0000") - (b.v === "\u0000") || b.n - a.n || String(a.v).localeCompare(String(b.v), "sv", { numeric: true }));
  let ci = 0;
  list.forEach(x => { x.color = x.v === "\u0000" ? "#cbd5e1" : ci < L3P_COLORS.length ? L3P_COLORS[ci++] : "#94a3b8"; });
  l3p.group = { key, list };
  if (l3p.colorBy) l3pColorOn(); // färgerna följer med till den nya egenskapen
  l3pRenderTab();
  return l3p.group;
}
function l3pRenderValues(body) {
  const g = l3p.group, esc = escHtml;
  const total = g.list.reduce((a, x) => a + x.n, 0);
  body.innerHTML = `<div class="v3-pp-head"><button type="button" class="v3-pp-back" id="v3PpBack" title="Tillbaka till alla egenskaper">‹</button><b title="${esc(l3pKeyLabel(g.key))}">${esc(l3pKeyLabel(g.key))}</b></div>
    <div class="v3-pal-hint">${g.list.length} ${g.list.length === 1 ? "värde" : "värden"} · ${total.toLocaleString("sv-SE")} objekt. Tryck på ett värde för att markera objekten (Skift lägger till).</div>
    <div class="v3-btns"><button type="button" id="v3PpColor" class="${l3p.colorBy ? "on" : ""}" title="Färga alla objekt efter värdet">${l3p.colorBy ? "Sluta färga" : "Färga efter värde"}</button></div>
    <div class="v3-pp-vals">${g.list.map((x, i) => `<button type="button" class="v3-pp-v" data-pv="${i}" title="${esc(x.v === "\u0000" ? "Objekt som saknar egenskapen" : x.v || "(tomt)")}"><i style="background:${x.color}"></i><span class="${x.v === "\u0000" || x.v === "" ? "dim" : ""}">${esc(x.v === "\u0000" ? "(saknas)" : x.v === "" ? "(tomt)" : x.v)}</span><em>${x.n.toLocaleString("sv-SE")}</em></button>`).join("")}</div>`;
  body.querySelector("#v3PpBack").onclick = () => { l3p.group = null; l3pRenderTab(); };
  body.querySelector("#v3PpColor").onclick = () => { if (l3p.colorBy) l3pColorOff(); else l3pColorOn(); l3pRenderTab(); };
  body.querySelectorAll("[data-pv]").forEach(b => { b.onclick = e => l3pSelectValue(g.list[Number(b.dataset.pv)], e.shiftKey || e.ctrlKey || e.metaKey); });
}
/* guid -> scenens bitar ({ mesh, ri }) per modell. */
function l3pEnts(m) {
  if (m._pEnts) return m._pEnts;
  const map = new Map();
  m.meshes.forEach(mesh => mesh.userData.l3b.ranges.forEach((r, ri) => { if (r.guid) push3(map, r.guid, { mesh, ri }); }));
  m._pEnts = map;
  return map;
}
function push3(map, k, v) { const a = map.get(k); if (a) a.push(v); else map.set(k, [v]); }
function l3pSelectValue(x, additive) {
  const ents = [];
  x.parts.forEach(([m, guids]) => { const map = l3pEnts(m); guids.forEach(g => (map.get(g) || []).forEach(e => ents.push(e))); });
  const list = additive ? [...l3bs.sel.map(e => ({ mesh: e.mesh, ri: e.ri })), ...ents] : ents;
  l3bsSet(list);
  if (typeof l3RenderSide === "function") l3RenderSide();
  l3Render();
  l3Status(`${ents.length.toLocaleString("sv-SE")} objekt markerade: ${l3pKeyLabel(l3p.group.key)} = ${x.v === "\u0000" ? "(saknas)" : x.v || "(tomt)"}.`);
}

/* ---- Färga efter värde -------------------------------------------------------------------------- */
function l3pColorOn() {
  const g = l3p.group; if (!g) return;
  const map = new Map();
  g.list.forEach(x => { const c = new THREE.Color(x.color), rgb = [c.r, c.g, c.b]; x.parts.forEach(([m, guids]) => guids.forEach(gu => map.set(m.id + "|" + gu, rgb))); });
  l3p.colorBy = { key: g.key, map };
  l3bRecolor(); l3Render();
  l3Status(`Objekten färgas efter ${l3pKeyLabel(g.key)}.`);
}
function l3pColorOff() { l3p.colorBy = null; if (typeof l3bRecolor === "function") { l3bRecolor(); l3Render(); } }
/* Anropas av l3bRecolor: färgen för en bit när Färga efter värde är på (annars null). */
function l3pColorFor(m, r) {
  if (!l3p.colorBy) return null;
  return l3p.colorBy.map.get(m.id + "|" + r.guid) || [0.86, 0.87, 0.9];
}
