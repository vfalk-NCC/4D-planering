/* Startval (Victor 2026-10-26: "När jag öppnar lägesplanen ska jag få fråga om jag vill öppna 2D eller 3D på ett snyggt sätt"):
   när lägesplanen öppnas utan ?view=… frågar ett kort om det ska bli 2D-lägesplanen eller 3D-editorn. "Kom ihåg mitt val" hoppar över frågan
   nästa gång (en liten ruta uppe till vänster visar valet och ger "Ändra"); ?start=fraga nollställer. Fristående läge och direktlänkar (?view=3d, ?item=…) frågar inte. */
const L3SC_KEY = "lagesplan-startval";
const l3scGet = () => { try { return localStorage.getItem(L3SC_KEY) || ""; } catch (e) { return ""; } };
const l3scSet = v => { try { if (v) localStorage.setItem(L3SC_KEY, v); else localStorage.removeItem(L3SC_KEY); } catch (e) { /* utan lagring */ } };
function startChoice(first) {
  const q = new URLSearchParams(location.search);
  if (q.get("start") === "fraga") l3scSet("");
  if (navigator.webdriver && q.get("start") !== "visa") return;   // automatiska tester frågas inte (?start=visa tvingar fram frågan)
  if (!first || q.get("view") || q.get("item") || window.STANDALONE || window.__STANDALONE || /[?&]fristaende=1/.test(location.search)) return;
  const can3d = !!(typeof plan !== "undefined" && plan && plan.calib), remembered = l3scGet();
  const go3d = () => { if (typeof open3d === "function") Promise.resolve(open3d()).catch(() => {}); };
  if (remembered === "3d" && can3d) { go3d(); l3scNote("3D-editorn (ditt val)"); return; }
  if (remembered === "2d") { l3scNote("2D-lägesplanen (ditt val)"); return; }
  if (document.getElementById("v3Start")) return;
  const el = document.createElement("div"); el.id = "v3Start"; el.className = "v3-start"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Öppna lägesplanen");
  el.innerHTML = `<div class="v3-start-c"><div class="v3-start-h"><b>Öppna lägesplanen</b><span>${typeof escHtml === "function" ? escHtml(first.name || "") : ""}</span></div>
    <div class="v3-start-t">
      <button type="button" class="v3-start-b" data-sc="2d"><svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="10" width="48" height="44" rx="6"/><path d="M8 24h48M24 10v44"/><circle cx="40" cy="38" r="5" fill="currentColor" stroke="none"/><circle cx="16" cy="40" r="3" fill="currentColor" stroke="none"/></svg><b>2D · Lägesplan</b><span>Ritningen med zoner, prickar och status. Snabbast för planering och uppföljning.</span></button>
      <button type="button" class="v3-start-b ${can3d ? "" : "off"}" data-sc="3d" ${can3d ? "" : "disabled"}><svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M32 6 56 19v26L32 58 8 45V19z"/><path d="M8 19l24 13 24-13M32 32v26"/></svg><b>3D · Editor</b><span>${can3d ? "Modellen, etablering, maskiner och sprängning. För planering i 3D." : "Arbetsytan behöver kalibreras mot 3D först (Zoner → Kalibrera mot 3D)."}</span></button>
    </div>
    <label class="v3-start-k"><input type="checkbox" id="v3StartK" /> Kom ihåg mitt val</label></div>`;
  document.body.appendChild(el);
  const pick = v => { const keep = el.querySelector("#v3StartK").checked; if (keep) l3scSet(v); el.classList.add("out"); setTimeout(() => el.remove(), 220); document.removeEventListener("keydown", key, true); if (v === "3d") go3d(); };
  const key = e => { if (e.key === "Escape") { e.stopPropagation(); pick("2d"); } else if (e.key === "1") pick("2d"); else if (e.key === "2" && can3d) pick("3d"); };
  document.addEventListener("keydown", key, true);
  el.querySelectorAll("[data-sc]").forEach(b => { b.onclick = () => pick(b.dataset.sc); });
  requestAnimationFrame(() => el.classList.add("in"));
  setTimeout(() => { const b = el.querySelector(can3d ? '[data-sc="3d"]' : '[data-sc="2d"]'); if (b) b.focus(); }, 60);
}
/* Liten ruta när valet är sparat: visar vad som öppnades och ger "Ändra". */
function l3scNote(txt) {
  const n = document.createElement("div"); n.className = "v3-start-n"; n.innerHTML = `Startar i ${txt} · <button type="button">Ändra</button>`;
  n.querySelector("button").onclick = () => { l3scSet(""); n.remove(); startChoice(typeof plan !== "undefined" ? plan : null); };
  document.body.appendChild(n); setTimeout(() => n.classList.add("in"), 20); setTimeout(() => { n.classList.remove("in"); setTimeout(() => n.remove(), 400); }, 6000);
}
