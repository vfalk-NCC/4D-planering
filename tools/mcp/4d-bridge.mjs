#!/usr/bin/env node
/* 4D-planering – MCP-brygga till 3D-editorn (Victor 2026-11-14).
   Claude Desktop / Claude Code startar den här filen som MCP-server (stdio). Den lyssnar också på 127.0.0.1:PORT (standard 8787) där 3D-editorn i webbläsaren
   hämtar uppdrag (long-poll) när "🔌 Claude" är påslaget. Inga beroenden – bara Node 18+.

   Claude Code:    claude mcp add 4d-planering -- node /sökväg/till/tools/mcp/4d-bridge.mjs
   Claude Desktop: lägg till i claude_desktop_config.json under "mcpServers":
                   "4d-planering": { "command": "node", "args": ["/sökväg/till/tools/mcp/4d-bridge.mjs"] }
   Miljövariabler: FOURD_PORT (8787), FOURD_ORIGINS (kommaseparerade tillåtna webbplatser, standard GitHub Pages + localhost). */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const TOOLS = JSON.parse(fs.readFileSync(path.join(here, "tools.json"), "utf8"));
const PORT = Number(process.env.FOURD_PORT) || 8787;
const ORIGINS = (process.env.FOURD_ORIGINS || "https://vfalk-ncc.github.io,http://localhost,http://127.0.0.1").split(",").map(s => s.trim()).filter(Boolean);
const CALL_TIMEOUT = 90000;                       // en åtgärd (t.ex. eval_js med godkännande) får ta så här länge
const log = (...a) => process.stderr.write("[4d-bridge] " + a.join(" ") + "\n");   // stdout är reserverad för MCP

/* ---------- Kö mellan MCP (Claude) och sidan ---------- */
let nextId = 1, waiter = null, lastSeen = 0;
const queue = [], pending = new Map();
const pageOnline = () => Date.now() - lastSeen < 35000;
function dispatch() { if (waiter && queue.length) { const w = waiter; waiter = null; clearTimeout(w.t); w.res.writeHead(200, w.h); w.res.end(JSON.stringify(queue.shift())); } }
function callPage(method, params) {
  return new Promise((resolve, reject) => {
    if (!pageOnline()) return reject(new Error("3D-editorn är inte kopplad. Öppna 3D-vyn i webbläsaren och klicka på '🔌 Claude' (eller öppna sidan med ?bridge=" + PORT + ")."));
    const id = nextId++, t = setTimeout(() => { pending.delete(id); reject(new Error("Ingen respons från 3D-editorn (tidsgräns). Väntar den på ditt godkännande i webbläsaren?")); }, CALL_TIMEOUT);
    pending.set(id, { resolve, reject, t }); queue.push({ id, method, params }); dispatch();
  });
}

/* ---------- HTTP mot sidan ---------- */
function corsHeaders(req) {
  const o = req.headers.origin, ok = o && ORIGINS.some(a => o === a || o.startsWith(a + ":"));
  return ok ? { "Access-Control-Allow-Origin": o, "Access-Control-Allow-Private-Network": "true", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type", "Vary": "Origin", "Cache-Control": "no-store" } : null;
}
const server = http.createServer((req, res) => {
  const h = corsHeaders(req), url = new URL(req.url, "http://x");
  if (req.headers.origin && !h) { res.writeHead(403); return res.end("Origin not allowed"); }
  if (req.method === "OPTIONS") { res.writeHead(204, h || {}); return res.end(); }
  if (url.pathname === "/next") {
    lastSeen = Date.now();
    if (waiter) { clearTimeout(waiter.t); waiter.res.writeHead(204, waiter.h); waiter.res.end(); waiter = null; }   // en ny flik tar över
    const wait = Math.min(25, Number(url.searchParams.get("wait")) || 20) * 1000;
    if (queue.length) { res.writeHead(200, { ...h, "Content-Type": "application/json" }); return res.end(JSON.stringify(queue.shift())); }
    const hh = { ...h, "Content-Type": "application/json" };
    waiter = { res, h: hh, t: setTimeout(() => { waiter = null; lastSeen = Date.now(); res.writeHead(204, h); res.end(); }, wait) };
    req.on("close", () => { if (waiter && waiter.res === res) { clearTimeout(waiter.t); waiter = null; } });
    return;
  }
  if (url.pathname === "/result" && req.method === "POST") {
    let b = ""; req.on("data", c => { b += c; if (b.length > 40e6) req.destroy(); });
    req.on("end", () => {
      try { const m = JSON.parse(b), p = pending.get(m.id); if (p) { clearTimeout(p.t); pending.delete(m.id); m.ok ? p.resolve(m.result) : p.reject(new Error(m.error || "Okänt fel")); } } catch (e) { log("dåligt svar från sidan:", e.message); }
      res.writeHead(204, h); res.end();
    });
    return;
  }
  if (url.pathname === "/health") { res.writeHead(200, { ...h, "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: true, page: pageOnline(), tools: TOOLS.length })); }
  res.writeHead(404); res.end();
});
server.on("error", e => { log(e.code === "EADDRINUSE" ? `Porten ${PORT} används redan (kör bryggan redan i ett annat fönster? sätt FOURD_PORT).` : e.message); });
server.listen(PORT, "127.0.0.1", () => log(`lyssnar på http://127.0.0.1:${PORT}`));

/* ---------- MCP över stdio (JSON-RPC, en rad per meddelande) ---------- */
const send = m => process.stdout.write(JSON.stringify(m) + "\n");
const ok = (id, result) => send({ jsonrpc: "2.0", id, result });
const err = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });
async function handle(m) {
  const { id, method, params } = m;
  if (method === "initialize") return ok(id, { protocolVersion: (params && params.protocolVersion) || "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "4d-planering", version: "1.0.0" },
    instructions: "Styr 3D-editorn i 4D-planering. Börja med status, ta screenshot för att se, bygg med create_*/place_library/add_site_item och kontrollera med screenshot efter varje steg. Koordinater är projektets (meter). Allt kan ångras med undo." });
  if (method === "ping") return ok(id, {});
  if (method === "tools/list") return ok(id, { tools: TOOLS });
  if (method === "tools/call") {
    const name = params && params.name, tool = TOOLS.find(t => t.name === name);
    if (!tool) return err(id, -32602, `Okänt verktyg ${name}`);
    try {
      const r = await callPage(name, (params && params.arguments) || {});
      if (r && r.image) { const { image, ...rest } = r; return ok(id, { content: [{ type: "image", data: image.data, mimeType: image.mime }, { type: "text", text: JSON.stringify(rest) }] }); }
      return ok(id, { content: [{ type: "text", text: JSON.stringify(r) }] });
    } catch (e) { return ok(id, { isError: true, content: [{ type: "text", text: e.message }] }); }
  }
  if (id !== undefined && !String(method).startsWith("notifications/")) return err(id, -32601, `Metoden ${method} stöds inte`);
}
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", d => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue; try { handle(JSON.parse(line)).catch(e => log("fel:", e.message)); } catch (e) { log("ogiltig JSON:", e.message); } } });
process.stdin.on("end", () => process.exit(0));
