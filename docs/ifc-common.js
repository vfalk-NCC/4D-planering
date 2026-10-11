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
