/* Fristående läge (Victor 2026-10-24: "Kan jag använda 3d-editorn fristående från Trimble Connect? … som ett program på datorn"): 3D-editorn utan Trimble Connect,
   GitHub och 4D-planering. Slås på med ?fristaende=1 (eller window.__STANDALONE = true i skrivbordsappen, se desktop/).
   – Data (arbetsytan, placeringar, bibliotek, lager …) sparas i webbläsarens/appens egen databas (IndexedDB) i stället för i GitHub.
   – En tom arbetsyta skapas (tom PDF som mark, 1 000 × 1 000 m) och 3D-vyn öppnas direkt.
   – Filer läses från datorn (IFC, DXF/DWG, LAS/LAZ …): "Öppna fil från datorn" i Lager. Det som sparas som IFC/DXF/PDF hamnar i mappen Hämtade filer.
   – Origo flyttas till första inlästa modellen/molnet/ritningen (så att SWEREF-koordinater inte ger darrande 3D).
   Utanför fristående läge gör filen bara lokala filer tillgängliga för "Öppna fil från datorn" (t.ex. en IFC-fil utan Trimble Connect). */
const STANDALONE = /[?&]fristaende=1/.test(location.search) || window.__STANDALONE === true;
window.STANDALONE = STANDALONE;

/* ---- Lokala filer: id "lokal-<n>" → bytes (i minnet, och i den lokala databasen i fristående läge så att modellerna kan öppnas igen nästa gång) ---- */
const lokalFiler = new Map();   // id -> { name, bytes: ArrayBuffer }
let lokalSeq = 0;
function lokalFilHash(name, size) { let h = 5381; const s = name + "|" + size; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
async function lokalFilAdd(file) {
  const bytes = await file.arrayBuffer(), id = "lokal-" + lokalFilHash(file.name, bytes.byteLength);
  lokalFiler.set(id, { name: file.name, bytes });
  if (STANDALONE) { try { await sbPut("bin:" + id, { name: file.name, bytes }); } catch (e) { console.warn("Kunde inte spara filen lokalt", e); } }
  return { id, name: file.name };
}
async function lokalFilBytes(id) {
  const m = lokalFiler.get(id); if (m) return m.bytes;
  if (STANDALONE) { const r = await sbGet("bin:" + id); if (r && r.bytes) { lokalFiler.set(id, r); return r.bytes; } }
  throw new Error("Filen finns inte kvar – öppna den från datorn igen.");
}
/* Väljer en eller flera filer från datorn; anropar hantera({ id, name }) per fil. */
function lokalFilVal(accept, multiple, hantera) {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = accept; inp.multiple = !!multiple; inp.style.cssText = "position:fixed;left:-9999px;opacity:0";
  document.body.appendChild(inp);
  inp.onchange = async () => { const files = [...inp.files]; inp.remove(); for (const f of files) { try { await hantera(await lokalFilAdd(f), f); } catch (e) { if (typeof l3Status === "function") l3Status("Kunde inte öppna " + f.name + ": " + e.message, true); } } };
  inp.click();
}
/* Öppnar filerna efter filtyp: IFC → modell, DXF/DWG → ritning, LAS/LAZ/… → punktmoln. */
async function lokalFilOppna(f) {
  const n = f.name;
  if (/\.(ifc|ifczip)$/i.test(n)) { if (typeof l3lFile === "function") await l3lFile(f.id, n); }
  else if (/\.(dxf|dwg)$/i.test(n)) { if (typeof l3sDxfFromTc === "function") await l3sDxfFromTc(f.id, n); }
  else if (/\.(las|laz|xyz|pts|ply|txt|csv)$/i.test(n)) { if (typeof l3pcFromTc === "function") await l3pcFromTc(f.id, n); }
  else if (typeof l3Status === "function") l3Status("Okänd filtyp: " + n, true);
  if (typeof standaloneOrigo === "function") standaloneOrigo();
}

/* ---- Allt nedanför gäller bara i fristående läge ---- */
let sbDb = null;
function sbOpen() {
  if (sbDb) return sbDb;
  sbDb = new Promise((res, rej) => { const rq = indexedDB.open("lagesplan-lokal", 1); rq.onupgradeneeded = () => rq.result.createObjectStore("kv"); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
  return sbDb;
}
async function sbGet(k) { const db = await sbOpen(); return new Promise((res, rej) => { const rq = db.transaction("kv").objectStore("kv").get(k); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); }
async function sbPut(k, v) { const db = await sbOpen(); return new Promise((res, rej) => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function sbDel(k) { const db = await sbOpen(); return new Promise((res, rej) => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").delete(k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }

/* En tom PDF-sida (1 000 × 1 000 punkter = 1 000 × 1 000 m) som mark för den tomma arbetsytan. */
function sbBlankPdf() {
  const objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1000 1000] /Resources << >> /Contents 4 0 R >>", "<< /Length 0 >>\nstream\n\nendstream"];
  let out = "%PDF-1.4\n"; const off = [];
  objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("") + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return new TextEncoder().encode(out);
}
function sbB64(bytes) { let b = ""; for (let i = 0; i < bytes.length; i += 0x8000) b += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(b); }
function sbBytes(b64) { const b = atob(b64.replace(/\n/g, "")), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
async function sbJson(b64) { const u = sbBytes(b64); let text; if (u.length > 2 && u[0] === 0x1f && u[1] === 0x8b) text = new TextDecoder().decode(await ghStreamBytes(u, DecompressionStream, "gzip")); else text = new TextDecoder().decode(u); return text.trim() ? JSON.parse(text) : null; }
const SB_PLAN = { id: "lokal", name: "Fristående arbetsyta", file_path: "projects/lokal/status_plans/lokal.pdf", file_name: "tom.pdf", page: 1, zones: [], calib: { pdf: [[0, 500], [1000, 500]], model: [[0, 0, 0], [1000, 0, 0]] }, created_at: "2026-01-01T00:00:00.000Z", provisional: false };

if (STANDALONE) {
  projectId = "lokal"; try { if (!new URLSearchParams(location.search).get("view")) { const u = new URL(location.href); u.searchParams.set("view", "3d"); history.replaceState(null, "", u); } } catch (e) { /* */ }
  try { if (!localStorage.getItem("4dplan-settings")) localStorage.setItem("4dplan-settings", JSON.stringify({ githubToken: "lokal", userName: "Lokal användare" })); else { const s = JSON.parse(localStorage.getItem("4dplan-settings")); if (!s.githubToken) { s.githubToken = "lokal"; localStorage.setItem("4dplan-settings", JSON.stringify(s)); } } localStorage.setItem("4dplan-unlocked", "1"); } catch (e) { /* */ }
  // Lagring i stället för GitHub: samma funktioner, samma versionsnummer (sha) – så sparlogiken (köer, omförsök) fungerar som vanligt.
  let seq = Date.now();
  ghGetFile = async (token, path) => {
    const r = await sbGet("f:" + path);
    if (!r) { if (/status_plans\.json$/.test(path)) return { data: [SB_PLAN], sha: null }; return { data: null, sha: null }; }
    try { return { data: await sbJson(r.b64), sha: r.sha }; } catch (e) { return { data: null, sha: r.sha }; }
  };
  ghGetFileKnown = (token, path) => ghGetFile(token, path);
  ghGetMeta = async (token, path) => { if (path === SB_PLAN.file_path) return { sha: "blank", size: 1 }; const r = await sbGet("f:" + path); return r ? { sha: r.sha, size: r.size || 0 } : null; };
  ghPutFile = async (token, path, b64, sha, message) => { const cur = await sbGet("f:" + path); if (cur && sha && cur.sha !== sha) { const e = new Error("konflikt"); e.conflict = true; throw e; } const ns = "l" + (++seq); await sbPut("f:" + path, { b64, sha: ns, size: Math.floor(b64.length * 0.75) }); return { content: { sha: ns } }; };
  ghReadBinaryUrl = async (token, path) => { if (path === SB_PLAN.file_path) return URL.createObjectURL(new Blob([sbBlankPdf()], { type: "application/pdf" })); const r = await sbGet("f:" + path); if (!r) throw new Error("Filen finns inte: " + path); return URL.createObjectURL(new Blob([sbBytes(r.b64)])); };
  ghDeleteBinary = async (token, path) => { try { await sbDel("f:" + path); } catch (e) { /* */ } };
  // Ingen brygga till Trimble Connect: det som sparas hamnar som nedladdning, filer läses ur de lokala filerna.
  const origAsk = askOpener;
  askOpener = (type, extra = {}, timeoutMs, onProgress) => {
    if (type === "tcUpload") {
      const files = extra.files || [];
      files.forEach(f => { const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); });
      return Promise.resolve({ uploaded: files.length, folder: "Hämtade filer (Hämtningar)", link: null });
    }
    if (type === "placeUploadIfc") {   // ritade objekt som IFC: i fristående läge blir det en nedladdning
      const nm = ((String(extra.fileName || "").replace(/\.ifc$/i, "").trim() || "Ritade objekt") + " " + new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", ".") + ".ifc").replace(/[\\/:*?"<>|]/g, "-");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([String(extra.text || "")], { type: "application/x-step" })); a.download = nm; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      return Promise.resolve({ n: Number(extra.n) || 0, name: nm, files: [nm] });
    }
    return origAsk(type, extra, timeoutMs, onProgress);
  };
  tcSavedNote = (d, files) => { const names = (files || []).map(f => f && f.name).filter(Boolean); const t = `Sparad på datorn (Hämtningar): ${names.join(", ") || d.uploaded + " filer"}`; if (typeof l3Status === "function" && typeof l3 !== "undefined" && l3 && document.body.classList.contains("v3-open")) l3Status(t); else if (typeof setSaveStatus === "function") setSaveStatus(t); };
  /* Origo: när första modellen/molnet/ritningen läses in flyttas arbetsytans origo dit (helt nära – annars darrar 3D med SWEREF-koordinater på miljontals meter). */
  window.standaloneOrigo = function () {
    try {
      if (typeof l3 === "undefined" || !l3 || !plan || plan.id !== "lokal" || plan.origoSatt) return;
      let c = null; const b = new THREE.Box3();
      if (typeof l3b !== "undefined") l3b.models.forEach(m => (m.meshes || []).forEach(x => { x.geometry.computeBoundingBox(); const bb = x.geometry.boundingBox.clone().translate(x.position); b.union(bb); }));
      if (!b.isEmpty()) { const q = b.getCenter(new THREE.Vector3()); c = [q.x + l3.O[0], q.y + l3.O[1], b.min.z + l3.O[2]]; }
      else if (typeof l3pc !== "undefined" && l3pc.clouds.length) { const i = l3pc.clouds[0].info; c = [i.center[0], i.center[1], i.min[2]]; }
      if (!c || (Math.abs(c[0] - l3.O[0]) < 2000 && Math.abs(c[1] - l3.O[1]) < 2000)) return;
      plan.origoSatt = true; plan._calibSet = true; plan.calib = { pdf: [[0, 500], [1000, 500]], model: [[Math.round(c[0] - 500), Math.round(c[1]), Math.round(c[2])], [Math.round(c[0] + 500), Math.round(c[1]), Math.round(c[2])]] };
      // Spara och öppna 3D-vyn på nytt så att allt byggs relativt det nya origot.
      Promise.resolve(typeof flushPlanSave === "function" ? (typeof savePlan === "function" && savePlan(plan), flushPlanSave()) : null).catch(() => {}).then(() => setTimeout(() => { try { location.reload(); } catch (e) { /* */ } }, 400));
    } catch (e) { console.warn(e); }
  };
  document.addEventListener("DOMContentLoaded", () => { document.body.classList.add("fristaende"); setInterval(() => { try { if (typeof l3b !== "undefined" && !l3b.busy && (l3b.models.length || (typeof l3pc !== "undefined" && l3pc.clouds.length))) standaloneOrigo(); } catch (e) { /* */ } }, 1500); });
}

/* ---- Säkerhetskopia av allt (Victor 2026-11-19: "man ska kunna spara allt lokalt"): arbetsyta, placeringar, ritningar, inlästa modellfiler och inställningar i EN fil på datorn,
   och tillbaka igen (till exempel på en ny dator eller om webbläsarens data rensats). Format: "4DLOKAL1" + rubrik (JSON) + binärdata. ---- */
if (STANDALONE) {
  const SB_BOLT = ["lagesplan-bergforankring", "pdf"];   // ritningarnas PDF:er för bergförankring (egen databas)
  const sbAllKv = async () => { const db = await sbOpen(); return new Promise((res, rej) => { const out = [], rq = db.transaction("kv").objectStore("kv").openCursor(); rq.onsuccess = () => { const c = rq.result; if (c) { out.push([c.key, c.value]); c.continue(); } else res(out); }; rq.onerror = () => rej(rq.error); }); };
  const sbBoltAll = () => new Promise(res => { try { const q = indexedDB.open(SB_BOLT[0], 1); q.onupgradeneeded = () => { try { q.result.createObjectStore(SB_BOLT[1]); } catch (e) { /* */ } }; q.onsuccess = () => { try { const rq = q.result.transaction(SB_BOLT[1]).objectStore(SB_BOLT[1]).openCursor(), out = []; rq.onsuccess = () => { const c = rq.result; if (c) { out.push([c.key, c.value]); c.continue(); } else res(out); }; rq.onerror = () => res([]); } catch (e) { res([]); } }; q.onerror = () => res([]); } catch (e) { res([]); } });
  const sbBoltPut = list => new Promise(res => { const q = indexedDB.open(SB_BOLT[0], 1); q.onupgradeneeded = () => { try { q.result.createObjectStore(SB_BOLT[1]); } catch (e) { /* */ } }; q.onsuccess = () => { const tx = q.result.transaction(SB_BOLT[1], "readwrite"), st = tx.objectStore(SB_BOLT[1]); list.forEach(([k, v]) => st.put(v, k)); tx.oncomplete = () => res(); tx.onerror = () => res(); }; q.onerror = () => res(); });
  async function sbBackup() {
    try {
      if (typeof l3Status === "function") l3Status("Samlar säkerhetskopian…");
      const bin = [], entries = []; let off = 0;
      const enc = (store, k, v) => { const bufs = [], json = JSON.stringify(v, function (key, val) { if (val instanceof ArrayBuffer) { bufs.push(new Uint8Array(val)); return { $buf: bufs.length - 1 }; } if (ArrayBuffer.isView(val)) { bufs.push(new Uint8Array(val.buffer, val.byteOffset, val.byteLength)); return { $buf: bufs.length - 1 }; } return val; });
        entries.push({ s: store, k, json, bufs: bufs.map(b => { const r = { off, len: b.length }; bin.push(b); off += b.length; return r; }) }); };
      (await sbAllKv()).forEach(([k, v]) => enc("kv", k, v)); (await sbBoltAll()).forEach(([k, v]) => enc("bolt", k, v));
      const ls = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^(4dplan|lagesplan|l3)/i.test(k)) ls[k] = localStorage.getItem(k); }
      const head = new TextEncoder().encode(JSON.stringify({ v: 1, at: new Date().toISOString(), ls, entries })), pre = new Uint8Array(12); pre.set(new TextEncoder().encode("4DLOKAL1")); new DataView(pre.buffer).setUint32(8, head.length, true);
      const blob = new Blob([pre, head, ...bin], { type: "application/octet-stream" }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `Lagesplan-sakerhetskopia-${new Date().toISOString().slice(0, 10)}.4dlokal`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
      if (typeof l3Status === "function") l3Status(`Säkerhetskopia sparad (${(blob.size / 1048576).toFixed(1).replace(".", ",")} MB, ${entries.length} poster). Spara filen på ett säkert ställe.`); return blob;
    } catch (e) { if (typeof l3Status === "function") l3Status("Kunde inte spara säkerhetskopian: " + e.message, true); else alert("Kunde inte spara säkerhetskopian: " + e.message); }
  }
  async function sbRestore(file, noReload) {
    const pre = new Uint8Array(await file.slice(0, 12).arrayBuffer()); if (new TextDecoder().decode(pre.subarray(0, 8)) !== "4DLOKAL1") throw new Error("Det här är ingen säkerhetskopia från programmet (.4dlokal).");
    const hl = new DataView(pre.buffer).getUint32(8, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(await file.slice(12, 12 + hl).arrayBuffer()))), base = 12 + hl, kv = [], bolt = [];
    for (const e of head.entries) { const bufs = []; for (const b of e.bufs) bufs.push(await file.slice(base + b.off, base + b.off + b.len).arrayBuffer()); const v = JSON.parse(e.json, (k, val) => (val && typeof val === "object" && "$buf" in val ? bufs[val.$buf] : val)); (e.s === "bolt" ? bolt : kv).push([e.k, v]); }
    const db = await sbOpen(); await new Promise((res, rej) => { const tx = db.transaction("kv", "readwrite"), st = tx.objectStore("kv"); st.clear(); kv.forEach(([k, v]) => st.put(v, k)); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    if (bolt.length) await sbBoltPut(bolt); Object.entries(head.ls || {}).forEach(([k, v]) => { try { localStorage.setItem(k, v); } catch (e) { /* */ } });
    if (!noReload) setTimeout(() => location.reload(), 300); return { kv: kv.length, bolt: bolt.length, at: head.at };
  }
  function sbRestorePick() { const i = document.createElement("input"); i.type = "file"; i.accept = ".4dlokal"; i.style.cssText = "position:fixed;left:-9999px"; document.body.appendChild(i); i.onchange = async () => { const f = i.files[0]; i.remove(); if (!f) return; const ok = typeof uiConfirm === "function" ? await uiConfirm("Läsa in säkerhetskopian? Det som finns i programmet nu ersätts av innehållet i filen."): confirm("Läsa in säkerhetskopian? Det som finns nu ersätts."); if (!ok) return; try { const r = await sbRestore(f); if (typeof l3Status === "function") l3Status(`Säkerhetskopian inläst (${r.kv} poster) – programmet startar om…`); } catch (e) { if (typeof l3Status === "function") l3Status("Kunde inte läsa in: " + e.message, true); else alert(e.message); } }; i.click(); }
  window.sbBackup = sbBackup; window.sbRestore = sbRestore; window.sbRestorePick = sbRestorePick; window.sbAllKv = sbAllKv;
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ber webbläsaren spara datat permanent */ }
}
