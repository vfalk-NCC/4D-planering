/* Huvudbrytare för 3D-modellen i 4D-planering (Victor 2026-11-17: "färger ändras fast switchen är avslagen").
   Samma skydd som dashboardens 3D-styrning: vid start är 4D-planering AV för allt som ändrar modellen i Trimble Connect (färger,
   dölj/visa, markering, kamera, markeringar, tänd/släck modell). Läsning (markering, egenskaper, bilder) fungerar som vanligt.
   Skyddet är en Proxy på själva API:t, så det håller även för en viewer som skapas senare (ny vy) och för kod som hämtar
   api.viewer på nytt vid varje anrop. Slås aldrig på av sig själv. Slås den av återställs färg och synlighet en gång.
   Av i det ena tillägget stänger också av det andra (BroadcastChannel "4d-gantt-link", meddelandet modelOff); på delas aldrig. */
const mga = { on: false, touched: false, lastToast: 0 };
try { if (localStorage.getItem("4dplan-test-modelctl") === "1") mga.on = true; } catch (e) { /* bara för tester */ }
const MGA_VIEWER = ["setObjectState"];   // det som färgar och släcker; markering, kamera och uttryckliga knappar (flytta modell, tänd modell) styrs inte av brytaren
const MGA_MARKUP = [];
const MGA_FLAG = "4dplan-model-touched";
const mgaReal = { viewer: null }; let mgaApi = null;
const mgaOn = () => mga.on;
function mgaNotice() {
  const t = Date.now(); if (t - mga.lastToast < 4000) return; mga.lastToast = t;
  if (typeof showLagesplanBanner === "function") showLagesplanBanner("3D-styrningen är av – 4D-planering ändrar inte modellen. Slå på reglaget i tidslinjen om du vill.", 3500);
}
function mgaTouch() { mga.touched = true; try { localStorage.setItem(MGA_FLAG, "1"); } catch (e) { /* */ } }
function mgaProxy(real, names, key, empty) {
  const set = new Set(names);
  return new Proxy(real, { get(t, k) {
    const v = Reflect.get(t, k, t);
    if (typeof k === "string" && set.has(k) && typeof v === "function") { const orig = v.bind(t); return (...a) => { if (mga.on) { if (key === "viewer") mgaTouch(); return orig(...a); } mgaNotice(); return Promise.resolve(empty(k)); }; }
    return typeof v === "function" ? v.bind(t) : v;
  } });
}
function mgaWrap(api) {
  if (!api || api.__mgaWrapped) return api; mgaApi = api;
  const cache = new WeakMap();
  const guard = (real, names, key, empty) => { if (!real || (typeof real !== "object" && typeof real !== "function")) return real; let g = cache.get(real); if (!g) { g = mgaProxy(real, names, key, empty); cache.set(real, g); } return g; };
  return new Proxy(api, { get(t, k) {
    if (k === "__mgaWrapped") return true;
    const v = Reflect.get(t, k, t);
    if (k === "viewer") { if (v) mgaReal.viewer = v; return guard(v, MGA_VIEWER, "viewer", () => undefined); }
    if (k === "markup") return guard(v, MGA_MARKUP, "markup", n => (/^add/.test(n) ? [] : undefined));
    return typeof v === "function" ? v.bind(t) : v;
  } });
}
function mgaInstall(api) { mgaSyncUi(); mgaCleanLeftovers(); }
const mgaViewer = () => (mgaApi && mgaApi.viewer) || mgaReal.viewer || null;
async function mgaReset() {
  const V = mgaViewer(); if (!V || typeof V.setObjectState !== "function") return false;
  try { await V.setObjectState(undefined, { color: "reset" }); await V.setObjectState(undefined, { visible: "reset" }); return true; } catch (e) { console.warn("Kunde inte återställa modellen", e); return false; }
}
/* Färger som ett tidigare pass lämnat kvar i Trimble Connect städas när reglaget är av. */
async function mgaCleanLeftovers() {
  let flag = null; try { flag = localStorage.getItem(MGA_FLAG); } catch (e) { /* */ } if (flag !== "1" || mga.on) return;
  for (let i = 0; i < 60 && !mgaViewer(); i++) await new Promise(r => setTimeout(r, 1000));
  if (mga.on) return;
  if (await mgaReset()) { try { localStorage.removeItem(MGA_FLAG); } catch (e) { /* */ } }
}
async function mgaSet(on, fromRemote) {
  on = !!on; if (on === mga.on) { mgaSyncUi(); return; }
  if (!on) {
    if (!fromRemote && !(typeof dashboardOwns === "function" && dashboardOwns())) await mgaReset();   // medan anropen ännu går igenom
    mga.touched = false; try { localStorage.removeItem(MGA_FLAG); } catch (e) { /* */ }
    if (!fromRemote && typeof dashLink !== "undefined" && dashLink.ch) { try { dashLink.ch.postMessage({ t: "modelOff" }); } catch (e) { /* ingen kanal */ } }
  }
  mga.on = on; mgaSyncUi();
  if (on) { try { if (typeof applyTimelineColors === "function") await applyTimelineColors(); } catch (e) { /* inga modeller */ } }
  if (typeof showLagesplanBanner === "function") showLagesplanBanner(on ? "🎨 3D-styrningen är på – 4D-planering kan nu ändra modellen" : "⏸ 3D-styrningen är av – modellen är återställd", 3500);
}
function mgaSyncUi() {
  const c = document.getElementById("mgaSwitch"); if (c) c.checked = mga.on;
  const l = document.getElementById("mgaLabel"); if (l) { l.classList.toggle("on", mga.on); const t = l.querySelector("span"); if (t) t.textContent = mga.on ? "3D-styrning på" : "3D-styrning av"; }
}
function mgaInit() { const c = document.getElementById("mgaSwitch"); if (c) c.onchange = () => { mgaSet(c.checked).catch(e => console.warn(e)); }; mgaSyncUi(); }
