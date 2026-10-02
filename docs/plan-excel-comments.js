/* Kommentarer från 4-veckorsplaneringen i Excel (Victors önskemål 2026-10-02).
   Läser Excels trådade kommentarer (xl/threadedComments, med svar, vem och när
   och om tråden är löst) och vanliga anteckningar (xl/comments) ur själva
   xlsx-filen. Lösta trådar hoppas över. Varje kommentar kopplas till
   aktiviteten på samma rad (se excelRows i plan-excel-parser.js). */

/* files: path -> text (eller null). Returnerar [{ sheet, ref, row, id, parentId, author, at, text, done }]. */
function readExcelCommentsFromFiles(getText) {
  const parse = s => (s ? new DOMParser().parseFromString(s, "application/xml") : null);
  const all = (doc, tag) => (doc ? [...doc.getElementsByTagNameNS("*", tag)] : []);
  const resolve = (baseFile, target) => {
    if (!target) return null;
    if (target.startsWith("/")) return target.slice(1);
    const parts = baseFile.split("/").slice(0, -1);
    target.split("/").forEach(p => { if (p === "..") parts.pop(); else if (p && p !== ".") parts.push(p); });
    return parts.join("/");
  };
  const relsOf = file => {
    const parts = file.split("/"), name = parts.pop();
    const doc = parse(getText([...parts, "_rels", name + ".rels"].join("/")));
    return all(doc, "Relationship").map(r => ({ id: r.getAttribute("Id"), type: r.getAttribute("Type") || "", target: resolve(file, r.getAttribute("Target")) }));
  };
  const rowOf = ref => { const m = /\d+/.exec(ref || ""); return m ? Number(m[0]) : null; };
  const wb = parse(getText("xl/workbook.xml"));
  if (!wb) return [];
  const wbRels = relsOf("xl/workbook.xml");
  const persons = new Map(all(parse(getText("xl/persons/person.xml")), "person").map(p => [p.getAttribute("id"), p.getAttribute("displayName") || ""]));
  const out = [];
  all(wb, "sheet").forEach(sh => {
    const name = sh.getAttribute("name");
    const rid = sh.getAttribute("r:id") || sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const rel = wbRels.find(r => r.id === rid);
    if (!rel || !rel.target) return;
    const rels = relsOf(rel.target);
    const threaded = rels.filter(r => /threadedComment$/i.test(r.type));
    if (threaded.length) {
      threaded.forEach(r => {
        const doc = parse(getText(r.target));
        const list = all(doc, "threadedComment").map(c => ({
          sheet: name, ref: c.getAttribute("ref"), row: rowOf(c.getAttribute("ref")),
          id: c.getAttribute("id"), parentId: c.getAttribute("parentId") || null,
          author: persons.get(c.getAttribute("personId")) || "Excel",
          at: c.getAttribute("dT") || null,
          text: (all(c, "text")[0] || {}).textContent || "",
          done: c.getAttribute("done") === "1",
        }));
        // Svar ärver trådens lösta status.
        const doneById = new Map(list.filter(c => !c.parentId).map(c => [c.id, c.done]));
        list.forEach(c => { if (c.parentId) c.done = !!doneById.get(c.parentId); });
        out.push(...list);
      });
      return;
    }
    // Vanliga anteckningar (inga trådar, ingen löst-status).
    rels.filter(r => /\/comments$/i.test(r.type)).forEach(r => {
      const doc = parse(getText(r.target));
      const authors = all(doc, "author").map(a => a.textContent);
      all(doc, "comment").forEach(c => {
        const ref = c.getAttribute("ref");
        let text = all(c, "t").map(t => t.textContent).join("").trim();
        const author = authors[Number(c.getAttribute("authorId"))] || "Excel";
        // Excel skriver ofta "Namn:" först i anteckningen.
        if (author && text.startsWith(author + ":")) text = text.slice(author.length + 1).trim();
        if (text) out.push({ sheet: name, ref, row: rowOf(ref), id: `${name}!${ref}`, parentId: null, author, at: null, text, done: false });
      });
    });
  });
  return out.filter(c => c.text.trim());
}
/* Ur en inläst fil (ArrayBuffer) via SheetJS:s zip-läsare. Tom lista om det inte går. */
function readExcelComments(buf) {
  try {
    if (!window.XLSX || !XLSX.CFB) return [];
    const cfb = XLSX.CFB.read(new Uint8Array(buf), { type: "array" });
    const dec = new TextDecoder("utf-8");
    return readExcelCommentsFromFiles(p => { const e = XLSX.CFB.find(cfb, p) || XLSX.CFB.find(cfb, "/" + p); return e && e.content ? dec.decode(e.content instanceof Uint8Array ? e.content : new Uint8Array(e.content)) : null; });
  } catch (e) { console.warn("Kunde inte läsa kommentarerna i Excel-filen", e); return []; }
}
/* Kommentarerna -> aktiviteterna i importen. { list: [{ c, sourceKey }], resolved, unmatched } */
function matchExcelComments(comments, parsedItems) {
  const byRow = new Map();
  parsedItems.forEach(p => (p.excelRows || []).forEach(r => byRow.set(`${p.sheet}|${r}`, p.sourceKey)));
  const res = { list: [], resolved: 0, unmatched: 0 };
  const keyById = new Map();
  comments.forEach(c => {
    if (c.done) { res.resolved++; return; }
    const key = c.parentId ? keyById.get(c.parentId) : byRow.get(`${c.sheet}|${c.row}`);
    if (!key) { res.unmatched++; return; }
    if (!c.parentId) keyById.set(c.id, key);
    res.list.push({ c, sourceKey: key });
  });
  return res;
}
