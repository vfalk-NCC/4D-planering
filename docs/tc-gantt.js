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

const l3tgPopupOn = () => !!(l3tg.popup && !l3tg.popup.closed);
function l3tgSend(m) { try { if (l3tgPopupOn()) l3tg.popup.postMessage({ tgPopup: true, msg: m }, location.origin); else if (l3tg.frame && l3tg.frame.contentWindow) l3tg.frame.contentWindow.postMessage(m, l3tgOrigin()); } catch (e) { /* ingen ram */ } }
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
const l3tgTools = () => !!l3plPrefs().tgTools;
function l3tgRenderPopup(d, P) {
  d.innerHTML = ""; const top = document.createElement("div"); top.className = "v3-tg-top"; d.appendChild(top); d.style.display = "flex"; d.style.flexDirection = "column"; d.style.height = "auto"; d.classList.remove("v3-tg-float", "full");
  ["left", "top", "width"].forEach(k => { d.style[k] = ""; }); d.style.right = ""; d.style.bottom = "";
  const acts = l3pl.rows ? l3plActs(P.split) : [];
  top.innerHTML = `<div class="v3-pldock-bar v3-tg-strip"><b>4D-planering · TC-Gantten</b><span class="v3-tg-seg"></span><span class="hint" style="color:#475569">Gantten är öppen i ett eget fönster – synkad med 3D-editorn.</span><span class="v3-grow"></span>
      <button type="button" class="v3-ga-ib" id="v3TgFocus" title="Visa Gantt-fönstret">Visa fönstret</button><button type="button" class="v3-ga-ib" id="v3TgBack" title="Stäng fönstret och ha Gantten här igen">Hämta tillbaka hit</button><button type="button" class="v3-ga-ib v3-ic" id="v3PlClose" title="Stäng" aria-label="Stäng">${L3GA_ICO.x}</button></div>
    <div class="v3-tg-gm">${typeof l3gmBarHtml === "function" ? l3gmBarHtml(acts) : ""}</div>`;
  const gm = top.querySelector(".v3-tg-gm"), row = gm.querySelector(".v3-gm-row"), seg = gm.querySelector("#v3GmSeg"); if (row && seg) { top.querySelector(".v3-tg-seg").appendChild(seg); row.remove(); }
  top.querySelector("#v3TgFocus").onclick = () => { try { l3tg.popup.focus(); } catch (e) { /* ok */ } }; top.querySelector("#v3TgBack").onclick = () => l3tgPopBack(); top.querySelector("#v3PlClose").onclick = () => { l3tgPopBack(); l3plDockToggle(false); };
  if (typeof l3gmBind === "function") l3gmBind(d); l3tgStart();
}
function l3tgRender(d, P) {
  if (l3tgPopupOn()) { l3tgRenderPopup(d, P); return; }
  let top = d.querySelector(":scope > .v3-tg-top");
  if (!top || !l3tg.frame || l3tg.frame.parentNode !== d) { d.innerHTML = ""; top = document.createElement("div"); top.className = "v3-tg-top"; d.appendChild(top); d.appendChild(l3tg.frame && !l3tg.frame.parentNode ? l3tg.frame : l3tgFrameMake()); }
  d.style.display = "flex"; d.style.flexDirection = "column";
  const acts = l3pl.rows ? l3plActs(P.split) : [], tools = l3tgTools();
  top.innerHTML = `<div class="v3-pldock-bar v3-tg-strip" title="Dra i rubrikraden för att flytta panelen · dubbelklick = tillbaka till nederkanten"><b title="Samma Gantt som 4D-dashboarden i Trimble Connect – allt du ändrar här sparas dit, och tvärtom">4D-planering · TC-Gantten</b>
      <div class="v3-segs" role="group" aria-label="Källa"><button type="button" data-tgsrc="pp" class="${l3tgSrc() === "pp" ? "on" : ""}" title="Tidplanen från Powerproject">Powerproject</button><button type="button" data-tgsrc="excel" class="${l3tgSrc() === "excel" ? "on" : ""}" title="4-veckorsplaneringen från Excel">Excel</button></div>
      <span class="v3-tg-seg"></span>
      <span class="v3-grow"></span>
      <button type="button" class="v3-ga-ib ${tools ? "on" : ""}" id="v3TgTools" aria-pressed="${tools}" title="${tools ? "Dölj filter, period och verktyg (mer plats åt tidslinjen)" : "Visa filter, period, färger och verktyg"}">${L3GA_ICO.sliders}<span>Verktyg</span></button>
      <button type="button" class="v3-ga-ib" id="v3TgPop" title="Öppna Gantten i ett eget fönster (t.ex. på en andra skärm) – synkad med 3D-editorn">⧉</button>
      <button type="button" class="v3-ga-ib" id="v3TgReload" title="Läs om tidplanen">↻</button>
      <button type="button" class="v3-ga-ib" id="v3TgFull" title="${P.full ? "Tillbaka till panelen" : "Hela 3D-ytan"}">${P.full ? L3GA_ICO.shrink : L3GA_ICO.full}</button>
      <button type="button" class="v3-ga-ib" id="v3TgClassic" title="Byt till den inbyggda (äldre) Gantten">Äldre vy</button>
      <button type="button" class="v3-ga-ib v3-ic" id="v3PlClose" title="Stäng" aria-label="Stäng">${L3GA_ICO.x}</button></div>
    <div class="v3-tg-gm">${typeof l3gmBarHtml === "function" ? l3gmBarHtml(acts) : ""}</div>`;
  // Kompakt: bara 3D-lägena (på samma rad som rubriken) – och tidsraden när Tid-läget är på. Verktygsknapparna visas med "Verktyg".
  const gm = top.querySelector(".v3-tg-gm");
  if (!tools) { const row = gm.querySelector(".v3-gm-row"), seg = gm.querySelector("#v3GmSeg"); if (row && seg) { top.querySelector(".v3-tg-seg").appendChild(seg); row.remove(); } }
  d.classList.toggle("full", !!P.full); d.classList.toggle("v3-tg-compact", !tools);
  l3tgSend({ t: "compact", on: !tools });
  const q = s => top.querySelector(s);
  top.querySelectorAll("[data-tgsrc]").forEach(b => { b.onclick = () => { if (l3tgSrc() === b.dataset.tgsrc) return; l3SetPref("tcGanttSrc", b.dataset.tgsrc); l3tgSend({ t: "init", ...l3tgInit() }); l3tgSig(); l3plDockRender(); }; });
  q("#v3TgTools").onclick = () => { l3plSet("tgTools", !l3tgTools()); l3plDockRender(); };
  q("#v3TgPop").onclick = () => l3tgPopOut();
  q("#v3TgReload").onclick = () => l3tgReload(true);
  q("#v3TgFull").onclick = () => { l3plSet("full", !P.full); l3plDockRender(); };
  q("#v3TgClassic").onclick = () => { l3SetPref("tcGantt", false); l3tg.frame = null; d.innerHTML = ""; l3plDockRender(); };
  q("#v3PlClose").onclick = () => l3plDockToggle(false);
  if (typeof l3gmBind === "function") l3gmBind(d);
  l3tgRectInit(d, P, q(".v3-tg-strip"));
  l3tgStart();
}
/* ---- Storlek och plats: dra i hörnen/kanterna (snygga rundade handtag), flytta i rubrikraden, dubbelklick = tillbaka till nederkanten ---- */
const L3TG_MIN = [380, 170];
function l3tgRect() { const r = l3plPrefs().tgRect; return r && r.w >= L3TG_MIN[0] && r.h >= L3TG_MIN[1] ? r : null; }
function l3tgApplyRect(d, P) {
  const host = d.parentElement, hw = host.clientWidth, hh = host.clientHeight, r = !P.full && l3tgRect();
  d.classList.toggle("v3-tg-float", !!r);
  if (!r) { ["left", "top", "width", "right", "bottom"].forEach(k => { d.style[k] = ""; }); d.style.height = P.full ? "" : (P.dockH || (l3tgTools() ? 560 : 330)) + "px"; return; }
  const w = Math.min(r.w, hw), h = Math.min(r.h, hh), l = Math.max(0, Math.min(hw - w, r.l)), t = Math.max(0, Math.min(hh - h, r.t));
  Object.assign(d.style, { left: l + "px", top: t + "px", width: w + "px", height: h + "px", right: "auto", bottom: "auto" });
}
function l3tgRectInit(d, P, strip) {
  l3tgApplyRect(d, P);
  if (!d.querySelector(":scope > .v3-tg-rs")) {
    ["n", "s", "w", "e", "nw", "ne", "sw", "se"].forEach(k => { const h = document.createElement("div"); h.className = "v3-tg-rs v3-tg-rs-" + k; h.dataset.rs = k; h.onpointerdown = e => l3tgDrag(e, d, k); d.appendChild(h); });
  }
  if (strip) { strip.onpointerdown = e => { if (e.target.closest("button,input,select,.v3-segs")) return; l3tgDrag(e, d, "move"); }; strip.ondblclick = e => { if (e.target.closest("button,input,select,.v3-segs")) return; l3plSet("tgRect", null); l3plSet("dockH", 0); l3plDockRender(); }; }
}
function l3tgDrag(e, d, mode) {
  if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); const host = d.parentElement, hr = host.getBoundingClientRect(), dr = d.getBoundingClientRect(), P = l3gaP();
  if (P.full) return;
  const s = { l: dr.left - hr.left, t: dr.top - hr.top, w: dr.width, h: dr.height }, x0 = e.clientX, y0 = e.clientY, hw = host.clientWidth, hh = host.clientHeight; let moved = false;
  if (l3tg.frame) l3tg.frame.style.pointerEvents = "none"; d.classList.add("v3-tg-dragging");
  const mv = ev => {
    const dx = ev.clientX - x0, dy = ev.clientY - y0; let { l, t, w, h } = s; moved = true;
    if (mode === "move") { l = s.l + dx; t = s.t + dy; }
    else {
      if (mode.includes("e")) w = s.w + dx; if (mode.includes("s")) h = s.h + dy;
      if (mode.includes("w")) { w = s.w - dx; l = s.l + dx; } if (mode.includes("n")) { h = s.h - dy; t = s.t + dy; }
      if (w < L3TG_MIN[0]) { if (mode.includes("w")) l -= L3TG_MIN[0] - w; w = L3TG_MIN[0]; } if (h < L3TG_MIN[1]) { if (mode.includes("n")) t -= L3TG_MIN[1] - h; h = L3TG_MIN[1]; }
    }
    w = Math.min(w, hw); h = Math.min(h, hh); l = Math.max(0, Math.min(hw - w, l)); t = Math.max(0, Math.min(hh - h, t));
    l3plSet("tgRect", { l: Math.round(l), t: Math.round(t), w: Math.round(w), h: Math.round(h) }); l3tgApplyRect(d, l3gaP());
  };
  const up = () => { window.removeEventListener("pointermove", mv, true); window.removeEventListener("pointerup", up, true); window.removeEventListener("pointercancel", up, true); if (l3tg.frame) l3tg.frame.style.pointerEvents = ""; d.classList.remove("v3-tg-dragging"); if (moved) l3Render(); };
  window.addEventListener("pointermove", mv, true); window.addEventListener("pointerup", up, true); window.addEventListener("pointercancel", up, true);
}
/* ---- 3D-markering → Gantten hoppar till aktiviteterna ---- */
function l3tgSelSync() {
  if (!l3tg.loaded || Date.now() < (l3tg.selOwn || 0)) return; clearTimeout(l3tg.st);
  l3tg.st = setTimeout(() => {
    const sel = typeof l3bs !== "undefined" ? l3bs.sel : [], guids = new Set(sel.map(e => { try { return String(e.mesh.userData.l3b.ranges[e.ri].guid || ""); } catch (x) { return ""; } }).filter(Boolean));
    const ids = guids.size ? (l3pl.rows || []).filter(r => guids.has(String(r.object_id || ""))).map(r => r.id) : [];
    l3tgSend({ t: "focus", ids, any: guids.size > 0 });
  }, 180);
}
function l3tgWrapSel() { if (l3tg.wrapped || typeof l3bsSet !== "function") return; l3tg.wrapped = true; const s0 = l3bsSet; l3bsSet = window.l3bsSet = function () { const r = s0.apply(this, arguments); try { l3tgSelSync(); } catch (e) { /* ok */ } return r; }; }
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
function l3tgStart() { l3tgWrapSel(); if (!l3tg.timer) l3tg.timer = setInterval(l3tgPoll, 20000); }
window.addEventListener("message", ev => {
  if (ev.data && ev.data.tgPopup) { if (l3tg.popup && ev.source === l3tg.popup && ev.origin === location.origin) l3tgOnMsg(ev.data.msg || {}, true); return; }
  if (!l3tg.frame || ev.source !== l3tg.frame.contentWindow) return;
  const o = l3tgOrigin(); if (o !== "*" && ev.origin !== o) return;
  l3tgOnMsg(ev.data || {}, false);
});
function l3tgOnMsg(m, pop) {
  if (m.t === "popupClosed") { l3tgPopBack(); return; }
  if (m.t === "ready") { l3tg.ready = true; l3tgSend({ t: "init", ...l3tgInit() }); }
  else if (m.t === "loaded") { l3tg.loaded = true; l3tgSend({ t: "compact", on: pop ? false : !l3tgTools() }); l3tgSelSync(); clearTimeout(l3tg.wd); const f = document.querySelector("#v3PlanDock .v3-tg-fail"); if (f) f.remove(); l3tgSig(); }
  else if (m.t === "changed") { clearTimeout(l3tg.dt); l3tg.dt = setTimeout(async () => { l3pl.rows = null; await l3plLoad(true); if (typeof l3gmApply === "function") l3gmApply(true); l3tgSig(); }, 700); }
  else if (m.t === "select") {
    l3tg.selOwn = Date.now() + 1500;
    const ids = new Set((m.ids || []).map(String)), rows = (l3pl.rows || []).filter(r => ids.has(String(r.id)));
    const ents = rows.length ? l3plEntsOf({ rows }) : [];
    if (ents.length) { l3bsSet(ents); if (typeof l3bsZoom === "function") l3bsZoom(); l3Status(`${m.name || "Aktivitet"}: ${ents.length} objekt markerade.`); }
    else l3Status(`${m.name || "Aktiviteten"}: objekten finns inte i de inlästa modellerna.`, true);
  }
}
/* ---- Gantten i ett eget fönster (t.ex. på en andra skärm): samma Gantt, synkad med 3D-editorn via den här sidan (gantt-popup.html) ---- */
function l3tgPopOut() {
  if (l3tgPopupOn()) { l3tg.popup.focus(); return; }
  const w = window.open("gantt-popup.html?u=" + encodeURIComponent(new URL(l3tgUrl(), location.href).href), "tc-gantt-popup", "popup=yes,width=1500,height=900");
  if (!w) { l3Status("Webbläsaren blockerade det nya fönstret – tillåt popup-fönster för sidan och försök igen.", true); return; }
  l3tg.popup = w; l3tg.loaded = false; if (l3tg.frame) { l3tg.frame.remove(); l3tg.frame = null; }
  clearInterval(l3tg.pw); l3tg.pw = setInterval(() => { if (!l3tgPopupOn()) l3tgPopBack(); }, 1500);
  l3plDockRender(); l3Status("Gantten är öppnad i ett eget fönster – den är synkad med 3D-editorn.");
}
function l3tgPopBack() {
  clearInterval(l3tg.pw); if (!l3tg.popup) return; try { if (!l3tg.popup.closed) l3tg.popup.close(); } catch (e) { /* ok */ } l3tg.popup = null; l3tg.loaded = false;
  const d = document.getElementById("v3PlanDock"); if (d) d.innerHTML = ""; if (l3pl.dock) l3plDockRender();
}
/* Sparar 3D-editorn något i tidplanen → Gantten läser om. */
if (typeof ghWriteJSON === "function") { const w0 = ghWriteJSON; ghWriteJSON = window.ghWriteJSON = async function (...a) { const r = await w0.apply(this, a); if (/plan_item/.test(String(a[1] || "")) && (l3tg.frame || l3tgPopupOn())) { clearTimeout(l3tg.wt); l3tg.wt = setTimeout(() => { l3tgSend({ t: "refresh" }); l3tgSig(); }, 800); } return r; }; }
