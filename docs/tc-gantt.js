/* 3D-vyn – Gantten som en exakt kopia av TC-ganttens (4D-dashboardens) Gantt (Victor 2026-11-11: "synka gantten i 3d-editorn mot TC-gantten så att den har
   exakt samma utseende och funktioner … det spelar ingen roll om jag justerar i 3d-editorns gantt eller i TC – de ska synka 100 procentigt").

   I stället för en egen återskapad Gantt visar panelen nu själva 4D-dashboardens Gantt (4D-dashboard/index.html?embed=gantt) i en iframe: samma kod, samma
   utseende, samma funktioner (staplar, tavla, filter, grupper, baseline, pilar, redigering, ångra, vyer, utskrift …). Tidplanen ligger redan i samma filer
   (projects/<id>/[pp/]plan_items.json m.fl.), så det som sparas i den ena syns i den andra:
   – sparar Gantten (iframe) något → 3D-editorn läser om tidplanen och ritar om 3D-läget direkt
   – sparar 3D-editorn något i tidplanen → Gantten läser om direkt
   – ändrar någon annan (Trimble Connect, annan flik) → upptäcks inom 20 s (sha-kontroll) och båda läser om
   3D-lägena (Alla/Kopplade/Okopplade/Tid, färger, pulsering) ligger kvar som ett fält över Gantten – de styr 3D-editorns egen vy, och "markera i 3D" från Gantten
   markerar objekten i editorn. Går dashboarden inte att nå visas en knapp för den inbyggda (äldre) Gantten. */
const l3tg = { frame: null, ready: false, loaded: false, mute: 0, sig: {}, timer: null, wd: 0, failed: false };
const l3tgUrl = () => l3Prefs().tcGanttUrl || "https://vfalk-ncc.github.io/4D-dashboard/index.html";
/* På localhost (utveckling och test) gäller den inbyggda Gantten om ingen dashboard-adress angetts (tcGanttUrl). */
const l3tgOn = () => l3Prefs().tcGantt !== false && (!!l3Prefs().tcGanttUrl || !/^(localhost|127\.0\.0\.1)$/.test(location.hostname));
const l3tgSrc = () => (l3Prefs().tcGanttSrc === "excel" ? "excel" : "pp");
const l3tgOrigin = () => { try { return new URL(l3tgUrl(), location.href).origin; } catch (e) { return "*"; } };
const l3tgPaths = () => { const b = `projects/${encodeURIComponent(projectId)}/${l3tgSrc() === "pp" ? "pp/" : ""}`; return [b + "plan_items.json", b + "plan_item_activities.json"]; };

function l3tgSend(m) { try { if (l3tg.frame && l3tg.frame.contentWindow) l3tg.frame.contentWindow.postMessage(m, l3tgOrigin()); } catch (e) { /* ingen ram */ } }
function l3tgFrameMake() {
  const f = document.createElement("iframe"); f.className = "v3-tg-frame"; f.title = "Gantt (4D-dashboard)"; f.allow = "clipboard-write; fullscreen";
  f.src = l3tgUrl() + (l3tgUrl().includes("?") ? "&" : "?") + "embed=gantt";
  f.style.cssText = "flex:1 1 auto;width:100%;min-height:0;border:0;background:#fff";
  l3tg.frame = f; l3tg.ready = l3tg.loaded = l3tg.failed = false;
  clearTimeout(l3tg.wd); l3tg.wd = setTimeout(() => { if (!l3tg.loaded) { l3tg.failed = true; l3tgFailBanner(); } }, 25000);
  return f;
}
function l3tgFailBanner() {
  const d = document.getElementById("v3PlanDock"); if (!d || d.querySelector(".v3-tg-fail")) return;
  const b = document.createElement("div"); b.className = "v3-tg-fail"; b.style.cssText = "position:absolute;left:50%;top:60%;transform:translate(-50%,-50%);padding:14px 18px;border-radius:12px;background:#fff;border:1px solid #fca5a5;box-shadow:0 8px 28px rgba(0,0,0,.2);font-size:13px;text-align:center;max-width:420px";
  b.innerHTML = `Gantten från 4D-dashboarden kunde inte laddas (ingen kontakt med dashboarden).<br><br><button type="button" id="v3TgRetry">Försök igen</button> <button type="button" id="v3TgClassic">Använd den inbyggda Gantten</button>`;
  d.appendChild(b); b.querySelector("#v3TgRetry").onclick = () => { l3tg.frame = null; d.innerHTML = ""; l3plDockRender(); };
  b.querySelector("#v3TgClassic").onclick = () => { l3SetPref("tcGantt", false); l3tg.frame = null; d.innerHTML = ""; l3plDockRender(); };
}
/* Ritar panelen: fältet ovanför (3D-lägen m.m.) görs om vid behov, iframen lever kvar så att Gantten inte laddas om. */
function l3tgRender(d, P) {
  let top = d.querySelector(":scope > .v3-tg-top");
  if (!top || !l3tg.frame || l3tg.frame.parentNode !== d) { d.innerHTML = ""; top = document.createElement("div"); top.className = "v3-tg-top"; d.appendChild(top); d.appendChild(l3tg.frame && !l3tg.frame.parentNode ? l3tg.frame : l3tgFrameMake()); }
  d.style.display = "flex"; d.style.flexDirection = "column"; if (!P.full && !P.dockH) d.style.height = "620px";
  const acts = l3pl.rows ? l3plActs(P.split) : [], E = escHtml;
  top.innerHTML = `<div class="v3-pldock-grip" title="Dra för att ändra höjden"></div>
    <div class="v3-pldock-bar v3-tg-strip"><b title="Samma Gantt som 4D-dashboarden i Trimble Connect – allt du ändrar här sparas dit, och tvärtom">4D-planering · TC-Gantten</b>
      <div class="v3-segs" role="group" aria-label="Källa"><button type="button" data-tgsrc="pp" class="${l3tgSrc() === "pp" ? "on" : ""}" title="Tidplanen från Powerproject">Powerproject</button><button type="button" data-tgsrc="excel" class="${l3tgSrc() === "excel" ? "on" : ""}" title="4-veckorsplaneringen från Excel">Excel</button></div>
      <span class="v3-grow"></span>
      <button type="button" class="v3-ga-ib" id="v3TgReload" title="Läs om tidplanen">↻</button>
      <button type="button" class="v3-ga-ib" id="v3TgFull" title="${P.full ? "Tillbaka till panelen" : "Hela 3D-ytan"}">${P.full ? L3GA_ICO.shrink : L3GA_ICO.full}</button>
      <button type="button" class="v3-ga-ib" id="v3TgClassic" title="Byt till den inbyggda (äldre) Gantten">Äldre vy</button>
      <button type="button" class="v3-ga-ib v3-ic" id="v3PlClose" title="Stäng" aria-label="Stäng">${L3GA_ICO.x}</button></div>
    ${typeof l3gmBarHtml === "function" ? l3gmBarHtml(acts) : ""}`;
  d.classList.toggle("full", !!P.full);
  const q = s => top.querySelector(s);
  top.querySelectorAll("[data-tgsrc]").forEach(b => { b.onclick = () => { if (l3tgSrc() === b.dataset.tgsrc) return; l3SetPref("tcGanttSrc", b.dataset.tgsrc); l3tgSend({ t: "init", ...l3tgInit() }); l3tgSig(); l3plDockRender(); }; });
  q("#v3TgReload").onclick = () => l3tgReload(true);
  q("#v3TgFull").onclick = () => { l3plSet("full", !P.full); l3plDockRender(); };
  q("#v3TgClassic").onclick = () => { l3SetPref("tcGantt", false); l3tg.frame = null; d.innerHTML = ""; l3plDockRender(); };
  q("#v3PlClose").onclick = () => l3plDockToggle(false);
  const grip = q(".v3-pldock-grip"); if (grip) grip.onpointerdown = e => { e.preventDefault(); const y0 = e.clientY, h0 = d.offsetHeight; l3tg.frame.style.pointerEvents = "none";
    const mv = ev => { const h = Math.max(160, Math.min(innerHeight - 120, h0 + (y0 - ev.clientY))); d.style.height = h + "px"; l3plSet("dockH", Math.round(h)); }, up = () => { document.removeEventListener("pointermove", mv); document.removeEventListener("pointerup", up); l3tg.frame.style.pointerEvents = ""; };
    document.addEventListener("pointermove", mv); document.addEventListener("pointerup", up); };
  if (typeof l3gmBind === "function") l3gmBind(d);
  l3tgStart();
}
function l3tgInit() { return { project: projectId, projectName: (typeof projectName !== "undefined" && projectName) || "", token, userName: (typeof settings !== "undefined" && settings && settings.userName) || "", planSource: l3tgSrc() }; }
/* Läs om tidplanen i 3D-editorn (och rita om 3D-läget). */
async function l3tgReload(both) {
  l3pl.rows = null; l3pl.xrows = null; await l3plLoad(true);
  if (typeof l3gmApply === "function") l3gmApply(true);
  if (both) l3tgSend({ t: "refresh" });
  l3tgSig();
}
async function l3tgSig() { try { const [a, b] = l3tgPaths(); const [x, y] = await Promise.all([ghGetMeta(token, a), ghGetMeta(token, b)]); l3tg.sig = { [a]: x && x.sha, [b]: y && y.sha }; } catch (e) { /* ingen kontakt */ } }
async function l3tgPoll() {
  if (!l3pl.dock || !l3tgOn() || document.hidden || !l3tg.loaded) return;
  try {
    const [a, b] = l3tgPaths(), [x, y] = await Promise.all([ghGetMeta(token, a), ghGetMeta(token, b)]), cur = { [a]: x && x.sha, [b]: y && y.sha }, was = l3tg.sig;
    const changed = Object.keys(cur).some(k => was[k] !== undefined && was[k] !== cur[k]); l3tg.sig = cur;
    if (changed) await l3tgReload(true);
  } catch (e) { /* ingen kontakt – nästa varv */ }
}
function l3tgStart() { if (!l3tg.timer) l3tg.timer = setInterval(l3tgPoll, 20000); }
window.addEventListener("message", ev => {
  if (!l3tg.frame || ev.source !== l3tg.frame.contentWindow) return;
  const o = l3tgOrigin(); if (o !== "*" && ev.origin !== o) return;
  const m = ev.data || {};
  if (m.t === "ready") { l3tg.ready = true; l3tgSend({ t: "init", ...l3tgInit() }); }
  else if (m.t === "loaded") { l3tg.loaded = true; clearTimeout(l3tg.wd); const f = document.querySelector("#v3PlanDock .v3-tg-fail"); if (f) f.remove(); l3tgSig(); }
  else if (m.t === "changed") { clearTimeout(l3tg.dt); l3tg.dt = setTimeout(async () => { l3pl.rows = null; await l3plLoad(true); if (typeof l3gmApply === "function") l3gmApply(true); l3tgSig(); }, 700); }
  else if (m.t === "select") {
    const ids = new Set((m.ids || []).map(String)), rows = (l3pl.rows || []).filter(r => ids.has(String(r.id)));
    const ents = rows.length ? l3plEntsOf({ rows }) : [];
    if (ents.length) { l3bsSet(ents); if (typeof l3bsZoom === "function") l3bsZoom(); l3Status(`${m.name || "Aktivitet"}: ${ents.length} objekt markerade.`); }
    else l3Status(`${m.name || "Aktiviteten"}: objekten finns inte i de inlästa modellerna.`, true);
  }
});
/* Sparar 3D-editorn något i tidplanen → Gantten läser om. */
if (typeof ghWriteJSON === "function") { const w0 = ghWriteJSON; ghWriteJSON = window.ghWriteJSON = async function (...a) { const r = await w0.apply(this, a); if (/plan_item/.test(String(a[1] || "")) && l3tg.frame) { clearTimeout(l3tg.wt); l3tg.wt = setTimeout(() => { l3tgSend({ t: "refresh" }); l3tgSig(); }, 800); } return r; }; }
