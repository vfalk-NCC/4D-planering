/* Exportera markerade objekt som IFC (Victor 2026-10-07: "markera objekt i 3D i Trimble Connect och
   bara exportera just dom objekten som en IFC-fil"; "underdelar ska inte följa med, bara det jag har
   markerat"; "både gå att ladda ner och sparas alltid i TC").

   Modellens original-IFC hämtas från Trimble Connect (Core API 2.0: files/fs/{id}/downloadurl, samma
   behörighet som uppladdningarna) och de markerade objekten plockas ut med allt de behöver för att
   synas likadant: geometri, placering, färger/material, egenskaper och typ, och var de ligger i
   byggnaden (projekt → plats → byggnad → våning). Öppningar (hål) i ett markerat objekt följer med –
   de är en del av dess form – men inga andra objekt: inte delar som hör till ett markerat objekt
   (t.ex. armering i en gjutning) och inte det ett markerat objekt sitter i. En markerad del utan egen
   våning (den hörde till en sammansättning) läggs på sammansättningens våning. Samma koordinater,
   samma GUID:er och samma egenskaper som i originalet.

   Filen läses och skrivs byte för byte (en tecken per byte), så å/ä/ö och annat i originalet rörs inte. */

const IFC_SUBSET_TC_FOLDER = "IFC-urval";

/* ---- STEP-läsning ------------------------------------------------------------------------------ */

/* Bytes -> sträng med ett tecken per byte (latin1-lik, förlustfri åt båda hållen). */
function ifcBytesToStr(bytes) {
  const parts = [], CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CH)));
  return parts.join("");
}
function ifcStrToBytes(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 255;
  return out;
}

/* Delar upp DATA-sektionen i poster: id, typ och var argumenten "(...)" ligger i texten. */
function ifcParse(text) {
  const m = /(^|[\s;])DATA\s*;/i.exec(text);
  if (!m) throw new Error("Filen ser inte ut som en IFC-fil (ingen DATA-sektion).");
  const dataStart = m.index + m[0].length;
  const ids = [], types = [], starts = [], ends = [];
  const index = new Map();
  let i = dataStart, tail = text.length;
  const n = text.length;
  while (i < n) {
    let c = text.charCodeAt(i);
    if (c === 32 || c === 10 || c === 13 || c === 9) { i++; continue; }
    if (c === 47 && text.charCodeAt(i + 1) === 42) { const e = text.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; } // /* kommentar */
    if (c !== 35) { tail = i; break; } // ENDSEC;
    let j = i + 1, id = 0;
    while ((c = text.charCodeAt(j)) >= 48 && c <= 57) { id = id * 10 + (c - 48); j++; }
    while (text.charCodeAt(j) !== 61) j++; // =
    j++;
    while ((c = text.charCodeAt(j)) === 32 || c === 10 || c === 13 || c === 9) j++;
    const t0 = j;
    while ((c = text.charCodeAt(j)) !== 40 && c !== 32 && c !== 10 && c !== 13) j++;
    const type = text.slice(t0, j).toUpperCase();
    while (text.charCodeAt(j) !== 40) j++; // (
    const a = j;
    let inStr = false;
    for (; j < n; j++) {
      c = text.charCodeAt(j);
      if (c === 39) inStr = !inStr;          // ' (två '' i rad = ett ' i texten, växlar fram och tillbaka)
      else if (c === 59 && !inStr) break;    // ;
    }
    index.set(id, ids.length);
    ids.push(id); types.push(type); starts.push(a); ends.push(j);
    i = j + 1;
  }
  return { text, header: text.slice(0, dataStart), tailStart: tail, ids, types, starts, ends, index };
}
/* #-referenserna i en argumentsträng (inte i textsträngar). */
function ifcRefs(s) {
  const out = [];
  let inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 39) inStr = !inStr;
    else if (c === 35 && !inStr) {
      let j = i + 1, v = 0, d;
      while ((d = s.charCodeAt(j)) >= 48 && d <= 57) { v = v * 10 + (d - 48); j++; }
      if (j > i + 1) out.push(v);
      i = j - 1;
    }
  }
  return out;
}
/* "(a,(b,c),'x,y')" -> ["a", "(b,c)", "'x,y'"]. */
function ifcSplitArgs(content) {
  const s = content.trim().replace(/^\(/, "").replace(/\)$/, "");
  const out = [];
  let depth = 0, inStr = false, from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "'") inStr = !inStr;
    else if (inStr) continue;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) { out.push(s.slice(from, i)); from = i + 1; }
  }
  out.push(s.slice(from));
  return out.map(x => x.trim());
}
const ifcRef1 = a => { const m = /^#(\d+)$/.exec(a || ""); return m ? Number(m[1]) : null; };

/* ---- Urvalet ------------------------------------------------------------------------------------ */

/**
 * Plockar ut objekten med GUID:erna i guids ur IFC-texten.
 * Returnerar { text, found: [guid], missing: [guid], openings } – text = den nya IFC-filen.
 */
function ifcSubset(text, guids, opts = {}) {
  const P = typeof text === "string" ? ifcParse(text) : text;
  const T = P.text;
  const want = new Set(guids.map(String));
  const content = k => T.slice(P.starts[k], P.ends[k]);
  const argsOf = k => ifcSplitArgs(content(k));
  const typeOfId = id => { const k = P.index.get(id); return k === undefined ? null : P.types[k]; };

  // De markerade: poster vars första argument är en av GUID:erna.
  const sel = new Set(), found = new Set();
  let project = null;
  for (let k = 0; k < P.ids.length; k++) {
    if (P.types[k] === "IFCPROJECT") project = P.ids[k];
    const a = P.starts[k];
    if (T.charCodeAt(a + 1) !== 39) continue;
    const q = T.indexOf("'", a + 2);
    if (q - a - 2 !== 22) continue;
    const g = T.slice(a + 2, q);
    if (want.has(g) && !found.has(g)) { sel.add(P.ids[k]); found.add(g); }
  }
  const missing = [...want].filter(g => !found.has(g));
  if (!sel.size) return { text: null, found: [], missing, openings: 0 };

  // Relationerna (bara de som behövs tolkas).
  const contained = new Map();  // element -> våning (IfcRelContainedInSpatialStructure)
  const aggParent = new Map();  // del -> helhet (IfcRelAggregates)
  const rels = [];
  for (let k = 0; k < P.ids.length; k++) {
    const t = P.types[k];
    if (!t.startsWith("IFCREL")) continue;
    rels.push(k);
    if (t === "IFCRELCONTAINEDINSPATIALSTRUCTURE") {
      const a = argsOf(k), s = ifcRef1(a[5]);
      ifcRefs(a[4]).forEach(e => { if (!contained.has(e)) contained.set(e, s); });
    } else if (t === "IFCRELAGGREGATES") {
      const a = argsOf(k), p = ifcRef1(a[4]);
      ifcRefs(a[5]).forEach(e => { if (!aggParent.has(e)) aggParent.set(e, p); });
    }
  }

  const O = new Set(sel);           // objekt som ska med
  const rewritten = new Map();      // post-index -> ny argumentsträng
  const keptRels = new Set();
  let openings = 0;

  // Öppningar i de markerade (hålen i en vägg eller platta).
  rels.forEach(k => {
    if (P.types[k] !== "IFCRELVOIDSELEMENT") return;
    const a = argsOf(k), el = ifcRef1(a[4]), op = ifcRef1(a[5]);
    if (sel.has(el) && op !== null) { O.add(op); keptRels.add(k); openings++; }
  });

  // Våningen för varje markerat objekt – för en del i en sammansättning: sammansättningens våning.
  const extraContain = new Map();   // våning -> [element] som behöver en ny "ligger i"-relation
  const spatialChain = new Set();
  const isSpatial = id => /^IFC(SITE|BUILDING|BUILDINGSTOREY|SPACE|FACILITY|FACILITYPART|BRIDGE|BRIDGEPART|ROAD|ROADPART|RAILWAY|RAILWAYPART|MARINEFACILITY|SPATIALZONE)$/.test(typeOfId(id) || "");
  const addExtra = (s, e) => { if (!extraContain.has(s)) extraContain.set(s, []); extraContain.get(s).push(e); spatialChain.add(s); };
  sel.forEach(e => {
    if (contained.has(e)) { spatialChain.add(contained.get(e)); return; }
    let p = e, guard = 0;
    while (aggParent.has(p) && guard++ < 50) {
      p = aggParent.get(p);
      if (isSpatial(p)) { if (p === aggParent.get(e)) spatialChain.add(p); else addExtra(p, e); return; }
      if (contained.has(p)) { addExtra(contained.get(p), e); return; }
    }
    // Fristående: bara projektet.
  });
  // Uppåt: våning -> byggnad -> plats -> projekt.
  [...spatialChain].forEach(s => {
    let p = s, guard = 0;
    while (p !== undefined && p !== null && guard++ < 50) { O.add(p); p = aggParent.get(p); }
  });
  if (project !== null) O.add(project);

  // Relationer: behåll dem som rör det som ska med, med listorna rensade från allt annat.
  const keepList = (k, listIdx, otherIdx, filterSet) => {
    const a = argsOf(k), other = ifcRef1(a[otherIdx]);
    const list = ifcRefs(a[listIdx]).filter(id => filterSet.has(id));
    if (!list.length) return false;
    a[listIdx] = `(${list.map(x => "#" + x).join(",")})`;
    rewritten.set(k, `(${a.join(",")})`);
    keptRels.add(k);
    return other;
  };
  rels.forEach(k => {
    const t = P.types[k];
    if (t === "IFCRELCONTAINEDINSPATIALSTRUCTURE") { const a = argsOf(k); if (O.has(ifcRef1(a[5]))) keepList(k, 4, 5, O); }
    else if (t === "IFCRELAGGREGATES") { const a = argsOf(k); if (O.has(ifcRef1(a[4]))) keepList(k, 5, 4, O); }
  });
  // Typer först (deras egenskaper och material ska också med).
  const types = new Set();
  rels.forEach(k => { if (P.types[k] === "IFCRELDEFINESBYTYPE") { const t = keepList(k, 4, 5, O); if (t) types.add(t); } });
  const objOrType = new Set([...O, ...types]);
  rels.forEach(k => {
    const t = P.types[k];
    if (t === "IFCRELDEFINESBYPROPERTIES" || t.startsWith("IFCRELASSOCIATES")) keepList(k, 4, 5, objOrType);
  });

  // Allt de behållna posterna pekar på (geometri, placering, egenskaper …).
  const K = new Set();
  const stack = [];
  const push = id => { if (id === null || id === undefined || K.has(id) || !P.index.has(id)) return; K.add(id); stack.push(id); };
  O.forEach(push); types.forEach(push);
  keptRels.forEach(k => push(P.ids[k]));
  const drain = () => {
    while (stack.length) {
      const id = stack.pop(), k = P.index.get(id);
      const t = P.types[k];
      if (t.startsWith("IFCREL") && !keptRels.has(k)) continue; // en relation följer bara med om den valts ovan
      const c = rewritten.has(k) ? rewritten.get(k) : content(k);
      ifcRefs(c).forEach(r => {
        const rk = P.index.get(r);
        if (rk === undefined) return;
        if (P.types[rk].startsWith("IFCREL") && !keptRels.has(rk)) return;
        push(r);
      });
    }
  };
  drain();
  // Färger (IfcStyledItem pekar på geometrin), materialens färger och lager.
  for (let k = 0; k < P.ids.length; k++) {
    const t = P.types[k];
    if (t === "IFCSTYLEDITEM") { const a = argsOf(k); if (K.has(ifcRef1(a[0]))) push(P.ids[k]); }
    else if (t === "IFCMATERIALDEFINITIONREPRESENTATION") { const a = argsOf(k); if (K.has(ifcRef1(a[3]))) push(P.ids[k]); }
  }
  drain();
  for (let k = 0; k < P.ids.length; k++) {
    const t = P.types[k];
    if (t !== "IFCPRESENTATIONLAYERASSIGNMENT" && t !== "IFCPRESENTATIONLAYERWITHSTYLE") continue;
    const a = argsOf(k), list = ifcRefs(a[2]).filter(id => K.has(id));
    if (!list.length) continue;
    a[2] = `(${list.map(x => "#" + x).join(",")})`;
    rewritten.set(k, `(${a.join(",")})`);
    keptRels.add(k);
    push(P.ids[k]);
  }
  drain();

  // Nya "ligger i våningen"-relationer för delar som lyfts ur sin sammansättning.
  let nextId = P.ids.reduce((m, x) => (x > m ? x : m), 0) + 1;
  const extra = [];
  const owner = (() => { if (project === null) return "$"; const a = argsOf(P.index.get(project)); return /^#\d+$/.test(a[1] || "") ? a[1] : "$"; })();
  const guid = typeof ifcGuid === "function" ? ifcGuid : () => Array.from({ length: 22 }, (_, i) => "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$"[Math.floor(Math.random() * (i ? 64 : 4))]).join("");
  extraContain.forEach((els, s) => {
    if (!K.has(s)) return;
    extra.push(`#${nextId++}=IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid()}',${owner},'4D-planering urval',$,(${els.map(e => "#" + e).join(",")}),#${s});`);
  });

  // Ny fil: huvudet (med nytt filnamn/beskrivning), posterna i originalordning, sedan de nya.
  let header = P.header;
  if (opts.fileName) header = header.replace(/FILE_NAME\s*\(\s*'(?:[^']|'')*'/i, `FILE_NAME('${String(opts.fileName).replace(/'/g, "''").replace(/[^\x20-\x7e]/g, "_")}'`);
  const out = [header, "\n"];
  for (let k = 0; k < P.ids.length; k++) {
    if (!K.has(P.ids[k])) continue;
    out.push(`#${P.ids[k]}=${P.types[k]}${rewritten.has(k) ? rewritten.get(k) : content(k)};\n`);
  }
  extra.forEach(x => out.push(x + "\n"));
  out.push("ENDSEC;\nEND-ISO-10303-21;\n");
  return { text: out.join(""), found: [...found], missing, openings, entities: K.size + extra.length };
}

/* ---- Trimble Connect ---------------------------------------------------------------------------- */

/* Markeringen i 3D-vyn, per modell: [{ modelId, guids: [...] }]. */
async function ifcSubsetReadSelection() {
  if (!API || !API.viewer || typeof API.viewer.getSelection !== "function") throw new Error("3D-vyn är inte ansluten.");
  const sel = await API.viewer.getSelection();
  const out = [];
  for (const m of sel || []) {
    const rids = m.objectRuntimeIds || [];
    if (!rids.length) continue;
    const ext = await API.viewer.convertToObjectIds(m.modelId, rids);
    const guids = [...new Set((ext || []).filter(Boolean).map(String))];
    if (guids.length) out.push({ modelId: m.modelId, guids });
  }
  return out;
}
/* Modellens fil i Trimble Connect (den version som visas) som bytes. */
async function ifcSubsetDownload(spec, onProgress = null) {
  const tokenVal = await tcAccessToken();
  const project = await API.project.getProject();
  const base = await tcApiBase(tokenVal, project);
  const H = { Authorization: `Bearer ${tokenVal}` };
  const fileId = spec.fileId || spec.id, q = spec.versionId && spec.versionId !== fileId ? `?versionId=${encodeURIComponent(spec.versionId)}` : "";
  let url = null, lastErr = "";
  for (const path of [`files/fs/${encodeURIComponent(fileId)}/downloadurl${q}`, `files/${encodeURIComponent(fileId)}/downloadurl${q}`]) {
    try {
      const res = await fetch(`${base}/${path}`, { headers: H });
      if (!res.ok) { lastErr = `${res.status}`; continue; }
      const body = await res.text();
      let d = body;
      try { d = JSON.parse(body); } catch (e) { /* ren text */ }
      url = typeof d === "string" ? d.replace(/^"|"$/g, "") : (d && (d.url || d.downloadUrl || d.downloadURL)) || null;
      if (url) break;
    } catch (e) { lastErr = e.message; }
  }
  if (!url) throw new Error(`Kunde inte hämta modellfilen från Trimble Connect (${lastErr || "ingen länk"}).`);
  let res = await fetch(url);
  if (res.status === 401 || res.status === 403) res = await fetch(url, { headers: H });
  if (!res.ok) throw new Error(`Kunde inte ladda ner modellfilen (${res.status}).`);
  // Med procent (stora modeller tar tid): läs svaret bit för bit.
  const total = Number(res.headers.get("Content-Length")) || 0;
  if (onProgress && res.body && typeof ghReadBodyWithProgress === "function") return new Uint8Array(await (await ghReadBodyWithProgress(res, (f, got) => onProgress(f, got || 0, total))).arrayBuffer());
  return new Uint8Array(await res.arrayBuffer());
}
/* .ifczip -> IFC-bytes (JSZip laddas bara när det behövs). */
async function ifcSubsetUnzip(bytes) {
  if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) return bytes;
  if (typeof JSZip === "undefined") await new Promise((ok, fail) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"; s.onload = ok; s.onerror = () => fail(new Error("Kunde inte läsa in zip-stödet.")); document.head.appendChild(s); });
  const zip = await JSZip.loadAsync(bytes);
  const f = Object.values(zip.files).find(x => !x.dir && /\.ifc$/i.test(x.name));
  if (!f) throw new Error("Zip-filen innehåller ingen IFC-fil.");
  return new Uint8Array(await f.async("uint8array"));
}
function ifcSubsetSave(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/x-step" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const ifcSubsetBanner = (t, ms) => { if (typeof showLagesplanBanner === "function") showLagesplanBanner(t, ms); };

/* Knappen: markeringen -> en IFC-fil per modell, nedladdad och sparad i TC-mappen IFC-urval. */
async function exportSelectionIfc() {
  const btns = ["btnExportSelIfcTop"].map(id => document.getElementById(id)).filter(Boolean);
  if (exportSelectionIfc.busy) return null;
  exportSelectionIfc.busy = true;
  btns.forEach(b => { b.disabled = true; });
  const results = [];
  try {
    const sel = await ifcSubsetReadSelection();
    if (!sel.length) { alert("Markera objekten i 3D-vyn först – sedan exporteras just de som en IFC-fil."); return null; }
    let specs = [];
    try { specs = await API.viewer.getModels(); } catch (e) { /* utan lista */ }
    const specOf = id => (specs || []).find(s => s.id === id || s.versionId === id) || { id };
    const at = new Date().toISOString().slice(0, 10);
    for (const m of sel) {
      const spec = specOf(m.modelId);
      const srcName = spec.name || m.modelId;
      if (spec.name && !/\.ifc(zip)?$/i.test(spec.name)) { results.push({ model: srcName, error: "inte en IFC-modell (bara IFC-filer kan delas upp)" }); continue; }
      ifcSubsetBanner(`Hämtar ${srcName} från Trimble Connect…`);
      const raw = await ifcSubsetUnzip(await ifcSubsetDownload(spec));
      ifcSubsetBanner(`Plockar ut ${m.guids.length} objekt ur ${srcName}…`);
      await new Promise(r => setTimeout(r, 30)); // låt bannern synas innan den tunga delen
      const base = srcName.replace(/\.ifc(zip)?$/i, "");
      const name = `${base} - urval ${m.guids.length} objekt ${at}.ifc`.replace(/[\\/:*?"<>|]/g, "-");
      const r = ifcSubset(ifcBytesToStr(raw), m.guids, { fileName: name });
      if (!r.text) { results.push({ model: srcName, error: `objekten finns inte i filen (${r.missing.length} st) – är det en annan version av modellen?` }); continue; }
      const bytes = ifcStrToBytes(r.text);
      ifcSubsetSave(bytes, name);
      let tc = null, tcErr = null;
      try { tc = await tcUploadFiles([new File([bytes], name, { type: "application/x-step" })], IFC_SUBSET_TC_FOLDER); }
      catch (e) { tcErr = e.message; }
      results.push({ model: srcName, name, n: r.found.length, missing: r.missing.length, openings: r.openings, tc, tcErr });
    }
    const ok = results.filter(r => r.name), bad = results.filter(r => r.error);
    const lines = [
      ...ok.map(r => `✓ ${r.name}: ${r.n} objekt${r.missing ? ` (${r.missing} hittades inte i filen)` : ""}${r.tcErr ? ` – nedladdad, men kunde inte sparas i Trimble Connect: ${r.tcErr}` : ` – nedladdad och sparad i ${IFC_SUBSET_TC_FOLDER}`}`),
      ...bad.map(r => `✗ ${r.model}: ${r.error}`)
    ];
    ifcSubsetBanner(lines.join(" · "), 12000);
    if (bad.length || ok.some(r => r.tcErr)) alert(lines.join("\n"));
    return results;
  } catch (e) {
    ifcSubsetBanner(`Kunde inte exportera: ${e.message}`, 10000);
    alert("Kunde inte exportera de markerade objekten: " + e.message);
    return null;
  } finally {
    exportSelectionIfc.busy = false;
    btns.forEach(b => { b.disabled = false; });
  }
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", () => {
  // Knappen ligger i sidhuvudet bredvid ångra/gör om (Victor 2026-10-07).
  const b = document.getElementById("btnExportSelIfcTop");
  if (b) b.onclick = () => { exportSelectionIfc(); };
});
if (typeof module !== "undefined") module.exports = { ifcSubset, ifcParse, ifcSplitArgs, ifcRefs, ifcBytesToStr, ifcStrToBytes };
