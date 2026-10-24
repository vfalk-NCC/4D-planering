/* Förbereder appen inför start/bygge: kopierar ../docs till app/ (utan tester och bilder som inte behövs) och hämtar biblioteken som annars kommer från CDN
   till app/vendor-cdn/ (för användning utan internet). Kör: node prepare.js [--no-vendor] */
const fs = require("fs"), path = require("path"), https = require("https");
const SRC = path.join(__dirname, "..", "docs"), DST = path.join(__dirname, "app");
const SKIP = new Set(["test", "tests", "node_modules", ".git"]);
function copy(a, b) { fs.mkdirSync(b, { recursive: true }); for (const e of fs.readdirSync(a, { withFileTypes: true })) { if (SKIP.has(e.name)) continue; const x = path.join(a, e.name), y = path.join(b, e.name); if (e.isDirectory()) copy(x, y); else fs.copyFileSync(x, y); } }
fs.rmSync(DST, { recursive: true, force: true }); copy(SRC, DST);
console.log("Kopierade docs → desktop/app");
const LIBS = {
  "pdf.min.js": "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js", "pdf.worker.min.js": "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
  "jszip.min.js": "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", "xlsx.full.min.js": "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "pako.min.js": "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js", "pdf-lib.min.js": "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js",
  "jspdf.umd.min.js": "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", "qrcode.min.js": "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js",
  "libredwg-web.js": "https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web/dist/libredwg-web.js"
};
function get(url, redirects = 5) { return new Promise((res, rej) => https.get(url, r => { if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && redirects) { r.resume(); return res(get(new URL(r.headers.location, url).href, redirects - 1)); } if (r.statusCode !== 200) { r.resume(); return rej(new Error(url + " → " + r.statusCode)); } const c = []; r.on("data", d => c.push(d)); r.on("end", () => res(Buffer.concat(c))); }).on("error", rej)); }
(async () => {
  if (process.argv.includes("--no-vendor")) return;
  const dir = path.join(DST, "vendor-cdn"); fs.mkdirSync(dir, { recursive: true });
  for (const [f, u] of Object.entries(LIBS)) { try { fs.writeFileSync(path.join(dir, f), await get(u)); console.log("Hämtade", f); } catch (e) { console.warn("Kunde inte hämta", f, e.message, "(appen hämtar den online i stället)"); } }
})();
