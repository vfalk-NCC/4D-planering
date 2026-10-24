/* Liten lokal webbserver för appens filer (workers, WebAssembly och moduler kräver http, inte file://). Exporteras för main.js och testas fristående. */
const http = require("http"), fs = require("fs"), path = require("path");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".mjs": "application/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".wasm": "application/wasm", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".gz": "application/gzip", ".pdf": "application/pdf", ".woff2": "font/woff2", ".txt": "text/plain" };
function startServer(root, port = 0) {
  return new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent((req.url || "/").split("?")[0]); if (p === "/") p = "/lagesplan.html";
      const f = path.normalize(path.join(root, p));
      if (!f.startsWith(path.normalize(root))) { res.writeHead(403); return res.end(); }
      fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); return res.end("Hittades inte"); } res.writeHead(200, { "Content-Type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" }); res.end(d); });
    });
    srv.on("error", reject); srv.listen(port, "127.0.0.1", () => resolve({ server: srv, port: srv.address().port }));
  });
}
module.exports = { startServer };
