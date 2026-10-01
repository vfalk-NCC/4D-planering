/* Lägesplan – ritnings-PDF:en som vektorer i utskrifterna (Victors önskemål
   2026-10-01). jsPDF kan inte bädda in en annan PDF, så sidan byggs i två
   lager i jsPDF – ett UNDER (ortofoton) och ett ÖVER (allt annat: DXF,
   zoner, objekt, ram, text) – och sätts sedan ihop med pdf-lib med original-
   ritningens sida som vektorgrafik emellan, beskuren till ritningsytan och
   med samma genomskinlighet/multiplicering som på skärmen.
   Saknas pdf-lib (t.ex. ingen nätåtkomst) används den gamla bildvarianten. */

const PDFLIB_URLS = [
  "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js",
  "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js",
];
async function loadPdfLib() {
  if (window.PDFLib) return true;
  for (const u of PDFLIB_URLS) { try { await loadScript(u); if (window.PDFLib) return true; } catch (e) { /* nästa */ } }
  return false;
}
let planPdfBytesCache = { path: null, bytes: null };
async function planPdfBytes() {
  if (!plan || !plan.file_path) return null;
  if (planPdfBytesCache.path === plan.file_path) return planPdfBytesCache.bytes;
  const url = await ghReadBinaryUrl(token, plan.file_path);
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  URL.revokeObjectURL(url);
  planPdfBytesCache = { path: plan.file_path, bytes };
  return bytes;
}
/* Ritningen som vektor eller bild (Victors val 2026-10-01): vektor är skarp
   men kan ge stora filer om ritnings-PDF:en är tung; bild håller nere
   storleken. Ett val per webbläsare, samma kryssruta i utskrift och export. */
const PDF_VECTOR_KEY = "lagesplan-pdf-vector";
function pdfVectorPref() { try { return localStorage.getItem(PDF_VECTOR_KEY) !== "0"; } catch (e) { return true; } }
function setPdfVectorPref(on) {
  try { localStorage.setItem(PDF_VECTOR_KEY, on ? "1" : "0"); } catch (e) {}
  document.querySelectorAll(".pdf-vec-chk").forEach(c => { c.checked = on; });
}
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".pdf-vec-chk").forEach(c => { c.checked = pdfVectorPref(); c.onchange = () => setPdfVectorPref(c.checked); });
});
/* Används vektor-PDF för ritningen? (ritningslagret tänt och vektor vald) */
function pdfVectorWanted() { return typeof layerVisible === "function" && layerVisible("pdf") && pdfVectorPref(); }

/* "Ritningen i gråskala": färgkommandona i ritningens innehåll räknas om
   till samma ljushet utan färg (rg/RG, k/K, sc/scn med 3 eller 4 värden).
   Operatorerna behålls, så färgrymderna stämmer. Gäller sidan och dess
   inbäddade delritningar (Form-XObjekt). */
function grayContent(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  const N = "(-?(?:\\d+\\.?\\d*|\\.\\d+))", W = "\\s+", B = "(?<![\\d.]\\s{0,8})(?<![\\d.])";
  const lum = (r, g, b) => Math.max(0, Math.min(1, 0.299 * r + 0.587 * g + 0.114 * b)).toFixed(3);
  s = s.replace(new RegExp(`${B}${N}${W}${N}${W}${N}${W}${N}${W}(k|K|sc|SC|scn|SCN)(?=[\\s/\\[<(]|$)`, "g"), (m, c, mm, y, k, op) => {
    const L = (1 - Math.min(1, +k)) * (1 - Math.min(1, 0.299 * +c + 0.587 * +mm + 0.114 * +y));
    return `0 0 0 ${(1 - L).toFixed(3)} ${op}`;
  });
  s = s.replace(new RegExp(`${B}${N}${W}${N}${W}${N}${W}(rg|RG|sc|SC|scn|SCN)(?=[\\s/\\[<(]|$)`, "g"), (m, r, g, b, op) => { const L = lum(+r, +g, +b); return `${L} ${L} ${L} ${op}`; });
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 255;
  return out;
}
function grayPdfPage(pdfDoc, page) {
  const { PDFName, PDFArray, PDFRawStream, decodePDFRawStream } = window.PDFLib;
  const ctx = pdfDoc.context;
  const decode = st => { try { return decodePDFRawStream(st).decode(); } catch (e) { return null; } };
  // Sidans innehåll
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map(r => ctx.lookup(r)) : [contents];
  const parts = streams.map(st => st instanceof PDFRawStream ? decode(st) : null);
  if (parts.every(Boolean)) {
    const total = parts.reduce((n, b) => n + b.length + 1, 0), all = new Uint8Array(total);
    let o = 0; parts.forEach(b => { all.set(b, o); o += b.length; all[o++] = 10; });
    page.node.set(PDFName.of("Contents"), ctx.register(ctx.stream(grayContent(all))));
  }
  // Inbäddade delritningar (Form-XObjekt), även nästlade
  const seen = new Set();
  const walk = res => {
    if (!res) return;
    const xo = res.lookup(PDFName.of("XObject"));
    if (!xo || !xo.entries) return;
    for (const [, ref] of xo.entries()) {
      const key = ref.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      const st = ctx.lookup(ref);
      if (!(st instanceof PDFRawStream) || String(st.dict.get(PDFName.of("Subtype"))) !== "/Form") continue;
      const b = decode(st);
      if (!b) continue;
      const dict = st.dict.clone(ctx);
      ["Filter", "DecodeParms", "Length"].forEach(k => dict.delete(PDFName.of(k)));
      ctx.assign(ref, PDFRawStream.of(dict, grayContent(b)));
      walk(dict.lookup(PDFName.of("Resources")));
    }
  };
  walk(page.node.Resources());
}

/* Påbörja. Varje utskriftssida består av en eller flera lagergrupper i
   ordning; varje grupp är två jsPDF-sidor: UNDER (ortofoto) och ÖVER (allt
   annat), med ritningen som vektorer emellan. Varje ritningsyta får en egen
   grupp, så överlappande ytor staplas i samma ordning som i mallen. */
async function vecBegin(doc) {
  if (!(await loadPdfLib())) return null;
  let bytes = null;
  try { bytes = await planPdfBytes(); } catch (e) { return null; }
  if (!bytes) return null;
  const v = { doc, bytes, pages: [], gray: !!($("grayPdf") && $("grayPdf").checked) };
  // jsPDF:s första sida blir UNDER i första gruppen, en ny sida blir ÖVER.
  vecAddJsPage(doc);
  v.pages.push({ groups: [{ under: 1, over: 2, inserts: [] }] });
  doc.setPage(2);
  return v;
}
function vecAddJsPage(doc) {
  const fmt = doc.internal.pageSize, w = fmt.getWidth(), h = fmt.getHeight();
  doc.addPage([w, h], w > h ? "landscape" : "portrait");
  return doc.internal.getNumberOfPages();
}
const vecGroup = v => { const pg = v.pages[v.pages.length - 1]; return pg.groups[pg.groups.length - 1]; };
function vecNewGroup(v) {
  const under = vecAddJsPage(v.doc), over = vecAddJsPage(v.doc);
  v.pages[v.pages.length - 1].groups.push({ under, over, inserts: [] });
  v.doc.setPage(over);
}
function vecNextPage(v) {
  const under = vecAddJsPage(v.doc), over = vecAddJsPage(v.doc);
  v.pages.push({ groups: [{ under, over, inserts: [] }] });
  v.doc.setPage(over);
}
const vecUnder = v => v.doc.setPage(vecGroup(v).under);
const vecOver = v => v.doc.setPage(vecGroup(v).over);
/* Ritningen ska in i rutan clip [x, y, w, h] (mm), stageToMm: stage-px -> mm (y nedåt). */
function vecAddPlan(v, clip, stageToMm, opacity, multiply) {
  vecGroup(v).inserts.push({ clip, stageToMm, opacity, multiply });
}
/* Sätt ihop och returnera PDF-byten. */
async function vecFinish(v) {
  const { PDFDocument, PDFName, pushGraphicsState, popGraphicsState, concatTransformationMatrix, drawObject, rectangle, clip, endPath, setGraphicsState } = window.PDFLib;
  const src = await PDFDocument.load(v.doc.output("arraybuffer"));
  const out = await PDFDocument.create();
  const planDoc = await PDFDocument.load(v.bytes, { ignoreEncryption: true });
  const pageIdx = Math.max(0, Math.min(planDoc.getPageCount() - 1, (plan.page || 1) - 1));
  const planPage = planDoc.getPage(pageIdx);
  if (v.gray) { try { grayPdfPage(planDoc, planPage); } catch (e) { console.warn("Gråskala för ritningen", e); } }
  const mb = planPage.getMediaBox();
  const planEmb = await out.embedPage(planPage, { left: mb.x, bottom: mb.y, right: mb.x + mb.width, top: mb.y + mb.height }, [1, 0, 0, 1, 0, 0]);
  const K = 72 / 25.4;
  // PDF-användarkoordinater -> stage-px (pdf.js-vyn: samma som toPx)
  const V = viewport.transform;
  // Alla jsPDF-sidor i ETT anrop: jsPDF lägger alla bilder i en gemensam
  // resurslista, och pdf-lib kopierar dem bara en gång per anrop. Ett anrop
  // per grupp gav en kopia av varje bild per ritningsyta (32 MB-filer).
  const nums = [...new Set(v.pages.flatMap(pg => pg.groups.flatMap(g => [g.under, g.over])))];
  const embedded = await out.embedPages(nums.map(n => src.getPage(n - 1)));
  const emb = new Map(nums.map((n, i) => [n, embedded[i]]));
  for (const pg of v.pages) {
    let page = null, Wpt = 0, Hpt = 0;
    for (const grp of pg.groups) {
      const eu = emb.get(grp.under), eo = emb.get(grp.over);
      if (!page) { Wpt = eu.width; Hpt = eu.height; page = out.addPage([Wpt, Hpt]); }
      page.drawPage(eu, { x: 0, y: 0, width: Wpt, height: Hpt });
      for (const ins of grp.inserts) {
        // stage -> mm (y nedåt) -> pt (y uppåt)
        const toPt = [K, 0, 0, -K, 0, Hpt];
        const T = mulAffine(toPt, mulAffine(ins.stageToMm, V));
        const [cx, cy, cw, ch] = ins.clip;
        const ops = [pushGraphicsState(), rectangle(cx * K, Hpt - (cy + ch) * K, cw * K, ch * K), clip(), endPath()];
        if (ins.opacity < 0.999 || ins.multiply) {
          const gs = out.context.obj({ Type: "ExtGState", ca: ins.opacity, CA: ins.opacity, BM: ins.multiply ? "Multiply" : "Normal" });
          ops.push(setGraphicsState(page.node.newExtGState("GSPlan", out.context.register(gs))));
        }
        const xName = page.node.newXObject("Plan", planEmb.ref);
        ops.push(concatTransformationMatrix(T[0], T[1], T[2], T[3], T[4], T[5]), drawObject(xName), popGraphicsState());
        page.pushOperators(...ops);
      }
      page.drawPage(eo, { x: 0, y: 0, width: Wpt, height: Hpt });
    }
  }
  return await out.save();
}
function savePdfBytes(bytes, name) {
  downloadBlob(new Blob([bytes], { type: "application/pdf" }), name);
}
