/* Delat mellan läsningstrådarna (ifc-worker.js med web-ifc och ifc-lite-worker.js med ifc-lite).
   Funktionerna läggs på self, så att filen fungerar både med importScripts (vanlig tråd) och import (modultråd). */
/* GUID och namn för alla objekt direkt ur filens text (en genomläsning) – web-ifc:s GetLine per objekt tog
   ~40 % av tiden. Raden ser ut som #123=IFCWALL('guid',#5,'Namn',…); \X2\…\X0\ (t.ex. å, ä, ö) avkodas. */
function decodeIfcStr(t) {
  return t.replace(/''/g, "'")
    .replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (_, h) => { let o = ""; for (let i = 0; i + 4 <= h.length; i += 4) o += String.fromCharCode(parseInt(h.slice(i, i + 4), 16)); return o; })
    .replace(/\\X\\([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\S\\(.)/g, (_, c) => String.fromCharCode(c.charCodeAt(0) + 128));
}
function scanNames(u8, want) {
  const out = new Map(), N = u8.length, dec = new TextDecoder("latin1"), utf8 = new TextDecoder("utf-8");
  // Bitkarta i stället för Set (2 miljoner rader slås upp – en Set var 5 × långsammare).
  let mx = 0; want.forEach(v => { if (v > mx) mx = v; });
  const bm = new Uint8Array(mx + 1); want.forEach(v => { bm[v] = 1; });
  let special = false;
  const str = (i) => { // läser 'text' från i (vid '); returnerar [text, slutindex]
    let j = i + 1, hi = false; special = false;
    for (; j < N; j++) { const c = u8[j]; if (c === 39) { if (u8[j + 1] === 39) { special = true; j++; continue; } break; } if (c === 92) special = true; else if (c > 127) hi = true; }
    const sub = u8.subarray(i + 1, j);
    // Rå UTF-8 (en del program skriver å/ä/ö direkt i stället för \X2\…\X0\).
    return [hi ? utf8.decode(sub) : sub.length < 4096 ? String.fromCharCode.apply(null, sub) : dec.decode(sub), j + 1];
  };
  for (let i = 0; i < N; ) {
    // Rad för rad (indexOf är inbyggd och snabb); bara rader som börjar med "#".
    const nl = u8.indexOf(10, i), next = nl < 0 ? N : nl + 1;
    if (u8[i] !== 35) { i = next; continue; }
    let j = i + 1, id = 0, c;
    while ((c = u8[j]) >= 48 && c <= 57) { id = id * 10 + c - 48; j++; }
    if (id > mx || !bm[id]) { i = next; continue; }
    while (j < N && u8[j] !== 40 && u8[j] !== 10) j++; // till "("
    if (u8[j] !== 40 || u8[j + 1] !== 39) { i = next; continue; }
    const [guid, k0] = str(j + 1);
    let k = k0;
    while (k < N && u8[k] !== 44) k++; k++;            // till "," efter GUID
    while (k < N && u8[k] !== 44) k++; k++;            // förbi ägaren (#5 eller $)
    while (k < N && u8[k] === 32) k++;
    let name = "";
    if (u8[k] === 39) { const t = str(k)[0]; name = (special ? decodeIfcStr(t) : t).slice(0, 200); }
    out.set(id, [guid, name]);
    i = Math.max(next, k); // namnet kan innehålla radbrytning (sällsynt)
    if (i < N && u8[i - 1] !== 10) { const nl2 = u8.indexOf(10, i); i = nl2 < 0 ? N : nl2 + 1; }
  }
  return out;
}

/* Växande typad array (ingen JS-lista med miljontals tal). */
function grow(Type, cap) {
  let a = new Type(cap), n = 0;
  return {
    push3(x, y, z) { if (n + 3 > a.length) { const b = new Type(a.length * 2); b.set(a); a = b; } a[n++] = x; a[n++] = y; a[n++] = z; },
    push(v) { if (n + 1 > a.length) { const b = new Type(a.length * 2); b.set(a); a = b; } a[n++] = v; },
    get length() { return n; },
    take() { const out = a.slice(0, n); a = new Type(cap); n = 0; return out; },
    view() { return a.subarray(0, n); }, // utan kopia (gäller tills nästa push)
    reset() { n = 0; },
  };
}


self.decodeIfcStr = decodeIfcStr; self.scanNames = scanNames; self.grow = grow;

/* IFC-klass och lager per objekt (Victor 2026-10-24: "LAGER I MODELL & RITNING"). Ett varv över filens rader: för de önskade produkterna tas klassen (IFCWALL …) och
   representationen (IFCPRODUCTDEFINITIONSHAPE), och lagren (IFCPRESENTATIONLAYERASSIGNMENT/…WITHSTYLE) kopplas via formrepresentationerna (direkt eller via deras delar).
   Returnerar Map(produkt-id → [klass, lagernamn eller ""]). */
function scanMeta(u8, want) {
  const N = u8.length, utf8 = new TextDecoder("utf-8"), lat = new TextDecoder("latin1"); let mx = 0; want.forEach(v => { if (v > mx) mx = v; });
  const bm = new Uint8Array(mx + 1); want.forEach(v => { bm[v] = 1; });
  const cls = new Map(), prodShape = new Map(), pdsReps = new Map(), repItems = new Map(), layers = []; // layers: [namn, [ref…]]
  const refs = (a, b) => { const out = []; for (let k = a; k < b; k++) if (u8[k] === 35) { let n = 0, c; k++; while ((c = u8[k]) >= 48 && c <= 57) { n = n * 10 + c - 48; k++; } out.push(n); k--; } return out; };
  // Delar upp (...)-argumenten på översta nivån: [[start, slut], …] (strängar och parenteser respekteras).
  const split = (i0, end, max) => {
    const out = []; let depth = 0, s = i0 + 1, str = false;
    for (let k = i0; k < end; k++) { const c = u8[k];
      if (str) { if (c === 39) { if (u8[k + 1] === 39) k++; else str = false; } continue; }
      if (c === 39) { str = true; continue; }
      if (c === 40) { depth++; if (depth === 1) s = k + 1; continue; }
      if (c === 41) { depth--; if (depth === 0) { out.push([s, k]); break; } continue; }
      if (c === 44 && depth === 1) { out.push([s, k]); s = k + 1; if (out.length >= max) break; } }
    return out;
  };
  for (let i = 0; i < N; ) {
    const nl = u8.indexOf(10, i), next = nl < 0 ? N : nl + 1;
    if (u8[i] !== 35) { i = next; continue; }
    let j = i + 1, id = 0, c; while ((c = u8[j]) >= 48 && c <= 57) { id = id * 10 + c - 48; j++; }
    while (j < next && (u8[j] === 32 || u8[j] === 61)) j++;
    let t = ""; for (; j < next && u8[j] !== 40 && u8[j] !== 32; j++) { const ch = u8[j]; t += String.fromCharCode(ch >= 97 && ch <= 122 ? ch - 32 : ch); }
    const open = u8.indexOf(40, j - 0);
    if (t === "IFCPRODUCTDEFINITIONSHAPE") { const a = split(open, next, 3); if (a[2]) pdsReps.set(id, refs(a[2][0], a[2][1])); }
    else if (t === "IFCSHAPEREPRESENTATION" || t === "IFCTOPOLOGYREPRESENTATION") { const a = split(open, next, 4); if (a[3]) repItems.set(id, refs(a[3][0], a[3][1])); }
    else if (t === "IFCPRESENTATIONLAYERASSIGNMENT" || t === "IFCPRESENTATIONLAYERWITHSTYLE") {
      const a = split(open, Math.min(N, nl < 0 ? N : next + 200000), 3); if (a[0] && a[2]) { let nm = ""; const s0 = a[0][0], s1 = a[0][1]; if (u8[s0] === 39) { const sub = u8.subarray(s0 + 1, s1 - 1); nm = (sub.some(x => x > 127) ? utf8 : lat).decode(sub).replace(/''/g, "'"); if (/\\X2\\|\\X\\/.test(nm) && typeof decodeIfcStr === "function") nm = decodeIfcStr(nm); } layers.push([nm.trim(), refs(a[2][0], a[2][1])]); } }
    else if (id <= mx && bm[id]) { const a = split(open, next, 7); cls.set(id, t); if (a[6] && u8[a[6][0]] === 35) { let n = 0, k = a[6][0] + 1, cc; while ((cc = u8[k]) >= 48 && cc <= 57) { n = n * 10 + cc - 48; k++; } prodShape.set(id, n); } }
    i = next;
  }
  const assigned = new Map(); layers.forEach(([nm, rs]) => rs.forEach(r => { if (!assigned.has(r)) assigned.set(r, nm); }));
  const layerOfRep = new Map(); assigned.forEach((nm, r) => { if (repItems.has(r)) layerOfRep.set(r, nm); });
  if (assigned.size) repItems.forEach((items, rep) => { if (layerOfRep.has(rep)) return; for (const it of items) { const nm = assigned.get(it); if (nm) { layerOfRep.set(rep, nm); break; } } });
  const out = new Map();
  cls.forEach((t, id) => { let lay = ""; const pds = prodShape.get(id), reps = pds ? pdsReps.get(pds) : null; if (reps) for (const r of reps) { const nm = layerOfRep.get(r); if (nm) { lay = nm; break; } } out.set(id, [t.replace(/^IFC/, ""), lay]); });
  return out;
}
self.scanMeta = scanMeta;
