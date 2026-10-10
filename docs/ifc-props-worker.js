/* Egenskaper ur en IFC-fil i en egen tråd (Victor 2026-10-10: "Jag ska få mycket mer info än detta också,
   samt att jag ska kunna sortera på alla olika UDA som objektet har").

   Filen indexeras en gång (var varje post börjar, GUID -> post, och relationerna: egenskaper, typ,
   material, våning, sammansättning). Sedan läses bara de poster som behövs, direkt ur filens bytes.

   In:  { id, op: "open", blob, guids }           -> { id, ok: { entities, products } } (+ { id, prog })
        { id, op: "props", guid }                  -> { id, ok: { cls, attrs, loc, type, material, psets } }
        { id, op: "keys" }                         -> { id, ok: [[key, pset, prop, count]] }
        { id, op: "values", key }                  -> { id, ok: [[value, [guid…]]] }
   Nycklar: "a:cls" | "a:name" | "a:objtype" | "a:tag" | "a:type" | "a:storey" | "a:material" | "p:<pset>\u0001<egenskap>" */

let u8 = null, N = 0, off = new Uint32Array(1 << 16), maxId = 0, projectId = 0;
const guidId = new Map(), objPsets = new Map(), objType = new Map(), objMat = new Map(), contIn = new Map(), aggPar = new Map();
const psetCache = new Map();
let scene = [], units = null, keysCache = null;
const latin = new TextDecoder("latin1"), utf8 = new TextDecoder("utf-8", { fatal: true });
const SEP = "\u0001";

function decodeIfcStr(t) {
  return t.replace(/''/g, "'")
    .replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (_, h) => { let o = ""; for (let i = 0; i + 4 <= h.length; i += 4) o += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return o; })
    .replace(/\\X\\([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\S\\(.)/g, (_, c) => String.fromCharCode(c.charCodeAt(0) + 128));
}

/* ---- STEP-läsare direkt på bytes --------------------------------------------------------------- */
let P = 0;
function ws() { while (P < N) { const c = u8[P]; if (c === 32 || c === 10 || c === 13 || c === 9) P++; else if (c === 47 && u8[P + 1] === 42) { let e = P + 2; while (e < N && !(u8[e] === 42 && u8[e + 1] === 47)) e++; P = e + 2; } else break; } }
function str() {
  const s = P + 1; let j = s, hi = false, sp = false;
  for (; j < N; j++) { const c = u8[j]; if (c === 39) { if (u8[j + 1] === 39) { j++; sp = true; continue; } break; } if (c === 92) sp = true; else if (c > 127) hi = true; }
  P = j + 1;
  const sub = u8.subarray(s, j);
  let t;
  if (hi) { try { t = utf8.decode(sub); } catch (e) { t = latin.decode(sub); } } else t = latin.decode(sub);
  return sp ? decodeIfcStr(t) : t;
}
function list() {
  P++; const out = [];
  ws(); if (u8[P] === 41) { P++; return out; }
  for (let g = 0; P < N && g < 1e6; g++) {
    out.push(val()); ws();
    const c = u8[P];
    if (c === 44) { P++; continue; }
    if (c === 41) { P++; break; }
    P++;
  }
  return out;
}
function val() {
  ws(); const c = u8[P];
  if (c === 39) return str();
  if (c === 35) { P++; let n = 0, d; while ((d = u8[P]) >= 48 && d <= 57) { n = n * 10 + d - 48; P++; } return { r: n }; }
  if (c === 40) return list();
  if (c === 36 || c === 42) { P++; return null; }
  if (c === 46) { const s = P + 1, e = u8.indexOf(46, s); P = e < 0 ? N : e + 1; return { e: latin.decode(u8.subarray(s, e)) }; }
  if (c === 34) { const e = u8.indexOf(34, P + 1); P = e < 0 ? N : e + 1; return null; }
  if ((c >= 48 && c <= 57) || c === 45 || c === 43) {
    const s = P; P++;
    while (P < N) { const d = u8[P]; if ((d >= 48 && d <= 57) || d === 46 || d === 69 || d === 101 || d === 45 || d === 43) P++; else break; }
    return Number(latin.decode(u8.subarray(s, P)));
  }
  if (c >= 65 && c <= 90) { const s = P; while (P < N && u8[P] !== 40) P++; const t = latin.decode(u8.subarray(s, P)).trim(); const a = list(); return { t, v: a[0], a }; }
  P++; return null;
}
function ent(id) {
  if (!id || id > maxId || !off[id]) return null;
  P = off[id];
  while (P < N && u8[P] !== 61) P++;
  P++; ws();
  const s = P; while (P < N && u8[P] !== 40 && u8[P] !== 32) P++;
  const t = latin.decode(u8.subarray(s, P)); ws();
  return { id, t, a: list() };
}
const ref = v => (v && typeof v === "object" && "r" in v ? v.r : 0);
const refs = v => (Array.isArray(v) ? v.map(ref).filter(Boolean) : []);
const push = (map, k, v) => { const a = map.get(k); if (a) a.push(v); else map.set(k, [v]); };
const isAt = (k, s) => { for (let i = 0; i < s.length; i++) if (u8[k + i] !== s.charCodeAt(i)) return false; return true; };

/* ---- Indexering -------------------------------------------------------------------------------- */
function index(onProg) {
  const rels = [];
  let lastProg = 0;
  for (let i = 0; i < N;) {
    const nl = u8.indexOf(10, i), next = nl < 0 ? N : nl + 1;
    let j = i; while (u8[j] === 32 || u8[j] === 9 || u8[j] === 13) j++;
    if (u8[j] === 35) {
      let k = j + 1, id = 0, c;
      while ((c = u8[k]) >= 48 && c <= 57) { id = id * 10 + c - 48; k++; }
      if (id) {
        if (id >= off.length) { let L = off.length; while (L <= id) L *= 2; const o = new Uint32Array(L); o.set(off); off = o; }
        off[id] = j; if (id > maxId) maxId = id;
        while (u8[k] === 32 || u8[k] === 61) k++;
        if (isAt(k, "IFCREL")) rels.push(id);
        else if (isAt(k, "IFCPROJECT(")) projectId = id;
        else if (!isAt(k, "IFCPROPERTY") && !isAt(k, "IFCELEMENTQUANTITY") && !isAt(k, "IFCQUANTITY")) {
          let p = k; while (p < next && u8[p] !== 40) p++;
          if (u8[p + 1] === 39 && u8[p + 24] === 39) guidId.set(latin.decode(u8.subarray(p + 2, p + 24)), id);
        }
      }
    }
    i = next;
    if (i - lastProg > 4e6) { lastProg = i; onProg(0.8 * i / N); }
  }
  rels.forEach((id, n) => {
    const e = ent(id);
    if (!e) return;
    const a = e.a;
    if (e.t === "IFCRELDEFINESBYPROPERTIES") { const d = ref(a[5]); refs(a[4]).forEach(o => push(objPsets, o, d)); }
    else if (e.t === "IFCRELDEFINESBYTYPE") { const t = ref(a[5]); refs(a[4]).forEach(o => objType.set(o, t)); }
    else if (e.t === "IFCRELASSOCIATESMATERIAL") { const m = ref(a[5]); refs(a[4]).forEach(o => objMat.set(o, m)); }
    else if (e.t === "IFCRELCONTAINEDINSPATIALSTRUCTURE") { const s = ref(a[5]); refs(a[4]).forEach(o => { if (!contIn.has(o)) contIn.set(o, s); }); }
    else if (e.t === "IFCRELAGGREGATES" || e.t === "IFCRELNESTS") { const p = ref(a[4]); refs(a[5]).forEach(o => { if (!aggPar.has(o)) aggPar.set(o, p); }); }
    if (n % 20000 === 0) onProg(0.8 + 0.2 * n / rels.length);
  });
}

/* ---- Enheter och värden ------------------------------------------------------------------------ */
function getUnits() {
  if (units) return units;
  units = {};
  try {
    const pr = ent(projectId), ua = pr && ent(ref(pr.a[8]));
    const PRE = { EXA: "E", PETA: "P", TERA: "T", GIGA: "G", MEGA: "M", KILO: "k", HECTO: "h", DECA: "da", DECI: "d", CENTI: "c", MILLI: "m", MICRO: "µ", NANO: "n" };
    const NAME = { METRE: ["m", ""], SQUARE_METRE: ["m", "²"], CUBIC_METRE: ["m", "³"], GRAM: ["g", ""], SECOND: ["s", ""], RADIAN: ["rad", ""], NEWTON: ["N", ""], PASCAL: ["Pa", ""] };
    refs(ua && ua.a[0]).forEach(uid => {
      const u = ent(uid); if (!u) return;
      const ty = u.a[1] && u.a[1].e;
      if (u.t === "IFCSIUNIT" && ty) { const nm = NAME[u.a[3] && u.a[3].e]; if (nm) units[ty] = (PRE[u.a[2] && u.a[2].e] || "") + nm[0] + nm[1]; }
      else if (u.t === "IFCCONVERSIONBASEDUNIT" && ty && typeof u.a[2] === "string") units[ty] = u.a[2].toLowerCase() === "degree" ? "°" : u.a[2];
    });
  } catch (e) { /* utan enheter */ }
  return units;
}
const MEAS = { IFCLENGTHMEASURE: "LENGTHUNIT", IFCPOSITIVELENGTHMEASURE: "LENGTHUNIT", IFCNONNEGATIVELENGTHMEASURE: "LENGTHUNIT", IFCAREAMEASURE: "AREAUNIT", IFCVOLUMEMEASURE: "VOLUMEUNIT", IFCMASSMEASURE: "MASSUNIT", IFCPLANEANGLEMEASURE: "PLANEANGLEUNIT", IFCPOSITIVEPLANEANGLEMEASURE: "PLANEANGLEUNIT", IFCTIMEMEASURE: "TIMEUNIT" };
const QTY = { IFCQUANTITYLENGTH: "LENGTHUNIT", IFCQUANTITYAREA: "AREAUNIT", IFCQUANTITYVOLUME: "VOLUMEUNIT", IFCQUANTITYWEIGHT: "MASSUNIT", IFCQUANTITYTIME: "TIMEUNIT", IFCQUANTITYCOUNT: "st" };
function num(x) { return Number.isInteger(x) ? String(x) : String(Math.round(x * 1000) / 1000).replace(".", ","); }
function fmt(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return num(v);
  if (Array.isArray(v)) return v.map(fmt).filter(Boolean).join(", ");
  if ("e" in v) return v.e === "T" ? "Ja" : v.e === "F" ? "Nej" : v.e === "U" ? "Okänt" : v.e;
  if ("t" in v) { const s = fmt(v.v), u = MEAS[v.t] && getUnits()[MEAS[v.t]]; return u && typeof v.v === "number" ? `${s} ${u}` : s; }
  if ("r" in v) return `#${v.r}`;
  return "";
}
function propOut(pid, out, prefix = "", depth = 0) {
  const e = ent(pid); if (!e || depth > 4) return;
  const a = e.a, name = prefix + (typeof a[0] === "string" ? a[0] : "");
  switch (e.t) {
    case "IFCPROPERTYSINGLEVALUE": out.push([name, fmt(a[2])]); break;
    case "IFCPROPERTYENUMERATEDVALUE": case "IFCPROPERTYLISTVALUE": out.push([name, fmt(a[2])]); break;
    case "IFCPROPERTYBOUNDEDVALUE": out.push([name, [fmt(a[3]), fmt(a[2])].filter(Boolean).join(" – ")]); break;
    case "IFCPROPERTYTABLEVALUE": out.push([name, "(tabell)"]); break;
    case "IFCPROPERTYREFERENCEVALUE": out.push([name, "(referens)"]); break;
    case "IFCCOMPLEXPROPERTY": refs(a[3]).forEach(p => propOut(p, out, name + " › ", depth + 1)); break;
    default:
      if (QTY[e.t]) { const u = QTY[e.t] === "st" ? "st" : getUnits()[QTY[e.t]] || ""; out.push([name, typeof a[3] === "number" ? `${num(a[3])}${u ? " " + u : ""}` : fmt(a[3])]); }
      else if (e.t === "IFCPHYSICALCOMPLEXQUANTITY") refs(a[2]).forEach(p => propOut(p, out, name + " › ", depth + 1));
  }
}
function pset(id) {
  if (psetCache.has(id)) return psetCache.get(id);
  let r = null;
  const e = ent(id);
  if (e) {
    const p = [];
    if (e.t === "IFCPROPERTYSET") refs(e.a[4]).forEach(x => propOut(x, p));
    else if (e.t === "IFCELEMENTQUANTITY") refs(e.a[5]).forEach(x => propOut(x, p));
    if (p.length) r = { n: typeof e.a[2] === "string" && e.a[2] ? e.a[2] : e.t, q: e.t === "IFCELEMENTQUANTITY", p };
  }
  if (psetCache.size > 400000) psetCache.clear();
  psetCache.set(id, r);
  return r;
}
function typePsets(oid) { const t = ent(objType.get(oid)); return t ? refs(t.a[5]).map(pset).filter(Boolean) : []; }
function ownPsets(oid) { return (objPsets.get(oid) || []).map(pset).filter(Boolean); }

function matNames(id, depth = 0) {
  const e = ent(id); if (!e || depth > 4) return [];
  const a = e.a, s = x => (typeof x === "string" ? x : "");
  switch (e.t) {
    case "IFCMATERIAL": return [s(a[0])];
    case "IFCMATERIALLIST": return refs(a[0]).flatMap(m => matNames(m, depth + 1));
    case "IFCMATERIALLAYERSETUSAGE": case "IFCMATERIALPROFILESETUSAGE": case "IFCMATERIALPROFILESETUSAGETAPERING": return matNames(ref(a[0]), depth + 1);
    case "IFCMATERIALLAYERSET": return refs(a[0]).flatMap(m => matNames(m, depth + 1));
    case "IFCMATERIALLAYER": { const n = matNames(ref(a[0]), depth + 1); return typeof a[1] === "number" ? n.map(x => `${x} (${num(a[1])} ${getUnits().LENGTHUNIT || ""})`.replace(" )", ")")) : n; }
    case "IFCMATERIALPROFILESET": return refs(a[2]).flatMap(m => matNames(m, depth + 1));
    case "IFCMATERIALPROFILE": return matNames(ref(a[2]), depth + 1);
    case "IFCMATERIALCONSTITUENTSET": return refs(a[2]).flatMap(m => matNames(m, depth + 1));
    case "IFCMATERIALCONSTITUENT": return matNames(ref(a[2]), depth + 1);
    default: return [];
  }
}
function spatialOf(oid) {
  let s = contIn.get(oid), p = oid, g = 0;
  while (!s && aggPar.has(p) && g++ < 30) { p = aggPar.get(p); if (contIn.has(p)) s = contIn.get(p); else { const e = ent(p); if (e && /^IFC(BUILDINGSTOREY|BUILDING|SITE|SPACE|FACILITYPART|BRIDGEPART)$/.test(e.t)) s = p; } }
  const chain = [];
  for (g = 0; s && g < 20; g++) { const e = ent(s); if (!e || e.t === "IFCPROJECT") break; chain.push({ t: e.t, n: typeof e.a[2] === "string" && e.a[2] ? e.a[2] : (typeof e.a[7] === "string" ? e.a[7] : "") }); s = aggPar.get(s); }
  return chain;
}
const SPATIAL_LBL = { IFCBUILDINGSTOREY: "Våning", IFCBUILDING: "Byggnad", IFCSITE: "Plats", IFCSPACE: "Rum", IFCFACILITY: "Anläggning", IFCFACILITYPART: "Anläggningsdel", IFCBRIDGE: "Bro", IFCBRIDGEPART: "Brodel" };
const clsName = t => t; // IFC-klassen som i filen (IFCBEAM)
function storeyOf(oid) { const c = spatialOf(oid); const s = c.find(x => x.t === "IFCBUILDINGSTOREY") || c[0]; return s ? s.n : ""; }

function attrValue(oid, k) {
  const e = ent(oid); if (!e) return "";
  const s = x => (typeof x === "string" ? x : "");
  switch (k) {
    case "a:cls": return clsName(e.t);
    case "a:name": return s(e.a[2]);
    case "a:objtype": return s(e.a[4]);
    case "a:tag": return s(e.a[7]);
    case "a:type": { const t = ent(objType.get(oid)); return t ? s(t.a[2]) || t.t : ""; }
    case "a:storey": return storeyOf(oid);
    case "a:material": return [...new Set(matNames(objMat.get(oid) || (objType.has(oid) ? (objMat.get(objType.get(oid)) || 0) : 0)))].join(", ");
  }
  return "";
}
function valueOf(oid, key) {
  if (key.startsWith("a:")) return attrValue(oid, key);
  const [ps, pn] = key.slice(2).split(SEP);
  // Bara den egenskapsgrupp och egenskap som söks läses (inte alla värden i alla grupper).
  const t = objType.get(oid), te = t ? ent(t) : null;
  for (const pid of [...(objPsets.get(oid) || []), ...(te ? refs(te.a[5]) : [])]) {
    const e = ent(pid); if (!e || (e.t !== "IFCPROPERTYSET" && e.t !== "IFCELEMENTQUANTITY")) continue;
    if ((typeof e.a[2] === "string" && e.a[2] ? e.a[2] : e.t) !== ps) continue;
    for (const q of refs(e.t === "IFCPROPERTYSET" ? e.a[4] : e.a[5])) {
      const h = entHead(q); if (!h) continue;
      const cx = h.t === "IFCCOMPLEXPROPERTY" || h.t === "IFCPHYSICALCOMPLEXQUANTITY";
      if (!cx && h.name !== pn) continue;
      const out = []; propOut(q, out); const f = out.find(y => y[0] === pn); if (f) return f[1];
    }
  }
  return null;
}

/* ---- Frågor ------------------------------------------------------------------------------------- */
function props(guid) {
  const oid = guidId.get(guid);
  if (!oid) return null;
  const e = ent(oid), s = x => (typeof x === "string" ? x : "");
  const attrs = [["IFC-klass", e.t, "a:cls"], ["Namn", s(e.a[2]), "a:name"], ["Beskrivning", s(e.a[3]), ""], ["Objekttyp", s(e.a[4]), "a:objtype"], ["Tag", s(e.a[7]), "a:tag"], ["GUID", guid, ""]].filter(x => x[1]);
  const t = ent(objType.get(oid));
  const mid = objMat.get(oid) || (t ? objMat.get(t.id) : 0);
  return {
    cls: e.t, attrs,
    loc: spatialOf(oid).map(x => [SPATIAL_LBL[x.t] || x.t, x.n]),
    type: t ? { cls: t.t, name: s(t.a[2]), psets: refs(t.a[5]).map(pset).filter(Boolean) } : null,
    material: mid ? [...new Set(matNames(mid))].filter(Boolean) : [],
    psets: ownPsets(oid),
  };
}
/* Bara egenskapernas namn (fliken Egenskaper behöver inga värden): läser postens typ och första sträng –
   mycket snabbare än pset() för stora modeller (Victor 2026-10-10: 129 000 objekt "fortsätter att ladda"). */
const nameCache = new Map();
function entHead(id) {
  if (!id || id > maxId || !off[id]) return null;
  P = off[id];
  while (P < N && u8[P] !== 61) P++;
  P++; ws();
  const s = P; while (P < N && u8[P] !== 40 && u8[P] !== 32) P++;
  const t = latin.decode(u8.subarray(s, P)); ws();
  if (u8[P] !== 40) return { t, name: "" };
  P++; ws();
  return { t, name: u8[P] === 39 ? str() : "" };
}
function psetKeys(id) {
  if (nameCache.has(id)) return nameCache.get(id);
  let r = null;
  const h = entHead(id);
  if (h && (h.t === "IFCPROPERTYSET" || h.t === "IFCELEMENTQUANTITY")) {
    const e = ent(id), list = refs(h.t === "IFCPROPERTYSET" ? e.a[4] : e.a[5]), ps = typeof e.a[2] === "string" && e.a[2] ? e.a[2] : e.t, out = [];
    list.forEach(pid => {
      const q = entHead(pid); if (!q) return;
      if (q.t === "IFCCOMPLEXPROPERTY" || q.t === "IFCPHYSICALCOMPLEXQUANTITY") { const tmp = []; propOut(pid, tmp); tmp.forEach(([pn]) => out.push("p:" + ps + SEP + pn)); }
      else if (q.t.startsWith("IFCPROPERTY") || QTY[q.t]) out.push("p:" + ps + SEP + q.name);
    });
    if (out.length) r = out;
  }
  if (nameCache.size > 400000) nameCache.clear();
  nameCache.set(id, r);
  return r;
}
function sceneIds() { return scene.map(g => guidId.get(g) || 0); }
function keys(onProg) {
  if (keysCache) return keysCache;
  const cnt = new Map(), ids = sceneIds();
  const add = (k, n) => cnt.set(k, (cnt.get(k) || 0) + n);
  ids.forEach((oid, i) => {
    if (!oid) return;
    const seen = new Set();
    const t = objType.get(oid), te = t ? ent(t) : null;
    for (const pid of [...(objPsets.get(oid) || []), ...(te ? refs(te.a[5]) : [])]) for (const k of psetKeys(pid) || []) if (!seen.has(k)) { seen.add(k); add(k, 1); }
    if (i % 2000 === 0) onProg(i / ids.length);
  });
  const out = [];
  [["a:cls"], ["a:type"], ["a:storey"], ["a:material"], ["a:name"], ["a:objtype"], ["a:tag"]].forEach(([k]) => out.push([k, "", "", ids.filter(Boolean).length]));
  [...cnt].sort((a, b) => a[0].localeCompare(b[0], "sv", { numeric: true })).forEach(([k, n]) => { const [ps, pn] = k.slice(2).split(SEP); out.push([k, ps, pn, n]); });
  keysCache = out;
  return out;
}
function values(key, onProg) {
  const m = new Map(), ids = sceneIds();
  ids.forEach((oid, i) => {
    const v = oid ? valueOf(oid, key) : null;
    push(m, v === null || v === undefined ? "\u0000" : v, scene[i]);
    if (i % 5000 === 0) onProg(i / ids.length);
  });
  return [...m].sort((a, b) => b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0]), "sv", { numeric: true }));
}

self.onmessage = async ev => {
  const { id, op } = ev.data || {};
  const prog = f => self.postMessage({ id, prog: f });
  try {
    let ok = null;
    if (op === "open") {
      const buf = ev.data.blob ? await ev.data.blob.arrayBuffer() : ev.data.bytes;
      u8 = new Uint8Array(buf); N = u8.length;
      index(prog);
      scene = ev.data.guids || [];
      ok = { entities: maxId, products: guidId.size };
    } else if (op === "scene") { scene = ev.data.guids || []; keysCache = null; ok = true; }
    else if (op === "props") ok = props(ev.data.guid);
    else if (op === "keys") ok = keys(prog);
    else if (op === "values") ok = values(ev.data.key, prog);
    self.postMessage({ id, ok });
  } catch (e) { self.postMessage({ id, error: e && e.message || String(e) }); }
};
