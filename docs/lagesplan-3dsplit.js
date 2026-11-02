/* Ritningspanel: 2D-ritningen bredvid 3D-vyn, synkad åt båda håll (Victor 2026-10-31: "2D-ritningar synkade med 3D").
   • Kameran syns på ritningen som en punkt med synfält som vrider sig när du flyger i 3D.
   • Markören i 3D (musen över ytor/modell) följer med som ett kors på ritningen, och markerade etableringsobjekt syns.
   • Tryck på ritningen: en nål sätts ut i 3D (stolpe + ring) och kameran flyger dit med samma vinkel.
   • Valfri kalibrerad ritning (arbetsytorna) – zooma med hjulet, dra för att panorera. Följ kameran håller den i mitten.
   Ritningen läggs på modellens XY via ritningens kalibrering, precis som lagret i 3D (calibAffine). */
/* Storlek och plats: dra i något av de fyra hörnen eller i rubrikraden (Victor 2026-10-31: "dra i hörnen så jag kan ställa storlek själv"). Sparas i webbläsaren. */
const l3spRect = () => { const r = l3Prefs().spRect; return r && r.w > 100 && r.h > 100 ? r : null; };
const l3sp = { open: false, planId: null, img: null, vp: null, aff: null, view: { k: 1, tx: 0, ty: 0 }, pin: null, hover: null, follow: true, size: 1, el: null, cv: null, raf: 0, key: "", pinObj: null, drag: null, busy: false, hoverT: 0 };
const L3SP_CSS = `#v3SpBtn{font-size:17px}#v3SpBtn.on{background:#2563eb!important;color:#fff!important}
#v3Sp{position:absolute;right:64px;bottom:12px;z-index:22;display:flex;flex-direction:column;background:var(--v3-panel,#fff);border:1px solid rgba(0,0,0,.14);border-radius:14px;box-shadow:0 10px 32px rgba(0,0,0,.24);overflow:hidden;font:12px system-ui,sans-serif;color:inherit}
#v3Sp .h{display:flex;gap:6px;align-items:center;padding:6px 8px;border-bottom:1px solid rgba(0,0,0,.08);flex-wrap:wrap}#v3Sp select{max-width:190px;padding:3px 6px;border:1px solid rgba(0,0,0,.18);border-radius:7px;font:inherit}
#v3Sp button{border:1px solid rgba(0,0,0,.15);background:#fff;border-radius:8px;padding:3px 8px;font:inherit;cursor:pointer}#v3Sp button.on{background:#2563eb;color:#fff;border-color:#2563eb}#v3Sp .cw{position:relative;flex:1;min-height:0;background:#e5e7eb;overflow:hidden;contain:paint}#v3Sp .cw canvas{position:absolute;left:0;top:0;width:100%;height:100%;display:block;touch-action:none}#v3Sp #spCv{cursor:crosshair}#v3Sp #spDt{pointer-events:none}#v3Sp .f{padding:4px 8px;opacity:.7}#v3Sp .z{display:flex;gap:5px;align-items:center;flex-wrap:wrap;padding:5px 8px;border-bottom:1px solid rgba(0,0,0,.08)}#v3Sp .z input[type=text]{width:74px;padding:3px 6px;border:1px solid rgba(0,0,0,.18);border-radius:7px;font:inherit;text-align:right}#v3Sp .z label{display:inline-flex;gap:4px;align-items:center;cursor:pointer}#v3Sp .z .t{opacity:.65}#v3Sp{box-sizing:border-box;max-width:calc(100% - 16px);overflow:hidden}#v3Sp .h,#v3Sp .z{min-width:0}#v3Sp .h>*,#v3Sp .z>*{min-width:0}#v3Sp .h select{flex:1 1 130px;max-width:100%}#v3Sp .z select{flex:1 1 120px;max-width:100%}#v3Sp .z button,#v3Sp .h button{white-space:nowrap}@media(max-width:700px){#v3Sp{font-size:13px}#v3Sp select,#v3Sp input[type=text]{font-size:16px}#v3Sp .z input[type=text]{width:64px}#v3Sp .z label span.t{display:none}}#v3Sp .h{cursor:move}#v3Sp .h button,#v3Sp .h select{cursor:pointer}#v3Sp .rz{position:absolute;width:18px;height:18px;z-index:5;touch-action:none}#v3Sp .rz::after{content:"";position:absolute;width:9px;height:9px;border:2px solid rgba(37,99,235,.65);opacity:0;transition:opacity .15s}#v3Sp:hover .rz::after{opacity:1}#v3Sp .rz[data-c=nw]{left:0;top:0;cursor:nwse-resize}#v3Sp .rz[data-c=nw]::after{left:3px;top:3px;border-right:0;border-bottom:0}#v3Sp .rz[data-c=ne]{right:0;top:0;cursor:nesw-resize}#v3Sp .rz[data-c=ne]::after{right:3px;top:3px;border-left:0;border-bottom:0}#v3Sp .rz[data-c=sw]{left:0;bottom:0;cursor:nesw-resize}#v3Sp .rz[data-c=sw]::after{left:3px;bottom:3px;border-right:0;border-top:0}#v3Sp .rz[data-c=se]{right:0;bottom:0;cursor:nwse-resize}#v3Sp .rz[data-c=se]::after{right:3px;bottom:3px;border-left:0;border-top:0}
.v3-col{flex:1 1 0;min-width:0;display:flex;flex-direction:column;position:relative}.v3-col>#v3Canvas{flex:1 1 0;min-height:0}
#v3Sp{position:relative!important;left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;width:auto!important;max-width:none!important;height:auto!important;z-index:5;border-radius:12px;margin:6px 0 0!important;border:1px solid rgba(0,0,0,.14);box-shadow:none;overflow:visible;flex:0 0 40%;min-height:0}
.v3-col.sbs{flex-direction:row}.v3-col.sbs>#v3Canvas{flex:1 1 0;min-width:0;min-height:0}.v3-col.sbs #v3Sp{margin:0 0 0 6px!important;min-width:0}
.v3-col.sbs #v3Sp .sph{left:-6px;right:auto;top:0;bottom:0;width:12px;height:auto;cursor:ew-resize}.v3-col.sbs #v3Sp .sph::after{left:4px;top:50%;width:4px;height:46px;margin:-23px 0 0 0}
#v3Sp .hd{position:relative;padding-right:34px!important;display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;padding:5px 8px;border-bottom:1px solid rgba(0,0,0,.08)}#v3Sp .hd>.h,#v3Sp .hd>.z{display:contents}#v3Sp .hd .z>span,#v3Sp .hd .z label{white-space:nowrap}#v3Sp .hd select{max-width:150px;min-width:0}#v3Sp .hd #spMapSrc{max-width:112px}#v3Sp .hd #spMapRow label .t{display:none}#v3Sp .hd{gap:4px 5px!important}#v3Sp .hd select#spPlan{max-width:104px}#v3Sp .hd .z>.t{display:none}#v3Sp .hd{font-size:11.5px}#v3Sp .hd input[type=text]{width:58px!important}#v3Sp .hd #spMapSrc{max-width:100px}#v3Sp .hd #spZrow b{font-size:11px}#v3Sp .hd #spMapRow>span:first-child{display:none}#v3Sp .hd #spPdfOp{width:52px!important}#v3Sp .hd #spPdfOp{width:64px!important}#v3Sp .hd button{padding:3px 5px}#v3Sp .cw .tapfx{position:absolute;width:0;height:0;pointer-events:none;z-index:4}#v3Sp .tapfx i{position:absolute;left:0;top:0;border-radius:50%;transform:translate(-50%,-50%) scale(.2);opacity:0}
#v3Sp .tapfx .d{width:12px;height:12px;background:#2563eb;box-shadow:0 0 0 3px #fff,0 2px 8px rgba(37,99,235,.55);animation:spTapD .75s cubic-bezier(.2,1.6,.4,1) forwards}
#v3Sp .tapfx .r{width:64px;height:64px;border:2.5px solid #2563eb;animation:spTapR .7s cubic-bezier(.15,.7,.3,1) forwards}#v3Sp .tapfx .r2{animation-delay:.14s;border-color:#60a5fa}
#v3Sp .tapfx.snap .d{background:#16a34a;box-shadow:0 0 0 3px #fff,0 2px 8px rgba(22,163,74,.55)}#v3Sp .tapfx.snap .r{border-color:#16a34a}
@keyframes spTapD{0%{transform:translate(-50%,-50%) scale(.2);opacity:0}25%{transform:translate(-50%,-50%) scale(1.5);opacity:1}55%{transform:translate(-50%,-50%) scale(1);opacity:1}100%{transform:translate(-50%,-50%) scale(1);opacity:0}}
@keyframes spTapR{0%{transform:translate(-50%,-50%) scale(.15);opacity:.95}100%{transform:translate(-50%,-50%) scale(1.5);opacity:0}}

body.v3-noanim #v3Sp .tapfx{display:none}
#v3Sp .sph{position:absolute;left:0;right:0;top:-6px;height:12px;cursor:ns-resize;z-index:6;touch-action:none}#v3Sp .sph::after{content:"";position:absolute;left:50%;top:4px;width:46px;height:4px;margin-left:-23px;border-radius:2px;background:rgba(100,116,139,.5)}#v3Sp .sph:hover::after{background:#2563eb}
#v3Sp .h{cursor:default}body.v3-splitting{user-select:none}body.v3-walkfs #v3Sp{display:none!important}`;
const l3spPlans = () => (typeof plans !== "undefined" ? plans : []).filter(p => p && (p.id === (plan && plan.id) ? plan.calib : p.calib));
const l3spCalib = p => (plan && p.id === plan.id ? plan.calib : p.calib);
const l3spAff = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function l3spSync() {
  const host = document.getElementById("v3Canvas"); if (!host || document.getElementById("v3SpBtn")) return;
  if (!document.getElementById("v3SpCss")) { const st = document.createElement("style"); st.id = "v3SpCss"; st.textContent = L3SP_CSS; document.head.appendChild(st); }
  const b = document.createElement("button"); b.id = "v3SpBtn"; b.type = "button"; b.className = "v3-qv-b"; b.title = "Ritningspanel: 2D-ritningen bredvid 3D, synkade åt båda håll"; b.textContent = "▦"; const qv = host.querySelector(".v3-qv"); if (qv) qv.insertBefore(b, qv.firstChild); else { b.style.cssText = "position:absolute;right:12px;bottom:60px;z-index:21"; host.appendChild(b); }
  ["pointerdown", "click", "dblclick", "wheel"].forEach(t => b.addEventListener(t, e => e.stopPropagation())); b.onclick = () => l3spToggle();
}
function l3spToggle(on) { const want = on == null ? !l3sp.open : on; if (want) l3spOpen(); else l3spClose(); const b = document.getElementById("v3SpBtn"); if (b) b.classList.toggle("on", l3sp.open); }
async function l3spOpen() {
  const host = document.getElementById("v3Canvas"); if (!host) return; l3spSync();
  const list = l3spPlans(); if (!list.length) { l3Status("Ritningspanelen behöver en kalibrerad ritning (Zoner → Kalibrera mot 3D).", true); return; }
  if (!l3sp.planId || !list.some(p => p.id === l3sp.planId)) l3sp.planId = (plan && list.some(p => p.id === plan.id)) ? plan.id : list[0].id;
  l3sp.open = true; let el = document.getElementById("v3Sp"); if (el) el.remove();
  el = document.createElement("div"); el.id = "v3Sp"; l3sp.el = el;
  /* Fast fönster under 3D-vyn (Victor 2026-11-01): 3D-vyn och minimapen delar en kolumn, så 3D-bilden krymper (och zoomas rätt) i stället för att täckas. */
  /* Minimapen delar kolumn med 3D-vyn (under bilden); vänstermenyn går alltid hel höjd och fotlisten ligger längst ner (Victor 2026-11-02). */
  let col = host.parentElement; if (!col.classList.contains("v3-col")) { col = document.createElement("div"); col.className = "v3-col"; host.parentNode.insertBefore(col, host); col.appendChild(host); } col.appendChild(el); document.body.classList.add("v3-dock"); col.classList.toggle("sbs", l3spSide()); l3spSize(); l3spRefit();
  ["pointerdown", "wheel", "dblclick", "contextmenu", "keydown"].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
  el.innerHTML = `<div class="sph" id="spSplit" title="Dra för att ändra höjden på minimapen"></div><div class="hd"><div class="h"><select id="spPlan">${list.map(p => `<option value="${p.id}" ${p.id === l3sp.planId ? "selected" : ""}>${typeof escHtml === "function" ? escHtml(p.name || "Ritning") : p.name}</option>`).join("")}</select><button type="button" id="spFollow" class="${l3sp.follow ? "on" : ""}" title="Håll kameran i mitten av ritningen">Följ</button><button type="button" id="spZin" title="Zooma in">＋</button><button type="button" id="spZout" title="Zooma ut">−</button><button type="button" id="spFit" title="Hela ritningen">Hela</button><button type="button" id="spSize" title="Panelens storlek">⤢</button><button type="button" id="spLay" title="Lägg minimapen bredvid 3D-vyn eller under den">◫</button><button type="button" id="spPin" title="Ta bort nålen i 3D">Nål ✕</button><button type="button" id="spProf" title="Tryck ut en profil (snitt) genom punktmolnen: tryck punkt A och punkt B i ritningen">⌇ Profil</button></div><div class="z" id="spZrow"><span title="Höjden ritningen ligger på i modellen (m ö.h.)"><b>Höjd</b></span><button type="button" id="spZm" title="Sänk 0,1 m (Skift: 1 m)">−</button><input type="text" id="spZ" inputmode="decimal" title="Skriv höjd och tryck Enter"><button type="button" id="spZp" title="Höj 0,1 m (Skift: 1 m)">+</button><span class="t">m ö.h.</span><button type="button" id="spZpick" title="Tryck på en yta i 3D – ritningen får ytans höjd (Hämta från 3D)">Från 3D</button><button type="button" id="spZpin" title="Använd nålens höjd">Nål</button><button type="button" id="spZundo" title="Ångra höjdändringen" disabled>↶</button><label title="Nålen fäster i närmaste (högsta) punkt i punktmolnet när du trycker i minimapen"><input type="checkbox" id="spSnapPc"> Fäst i punktmoln/IFC</label><label title="Visa ritningen som en genomskinlig yta i 3D på den höjd den har – justera tills den ligger rätt mot modellen"><input type="checkbox" id="spZshow"> Visa i 3D</label></div><div class="z" id="spMapRow"><span title="Karta eller ortofoto under ritningen – samma källor som bakgrundskartan i 3D"><b>Underlag</b></span><select id="spMapSrc"><option value="">Inget</option><option value="esri">Ortofoto (Esri)</option><option value="eox">Satellit (Sentinel-2)</option><option value="osm">Karta (OSM)</option><option value="custom">Egen adress (XYZ)</option></select><label title="Hur tydlig ritningen är över underlaget"><span class="t">Ritning</span><input type="range" id="spPdfOp" min="15" max="100" step="5" style="width:90px"></label></div><button type="button" id="spX" title="Stäng minimapen" style="position:absolute;right:6px;top:5px">✕</button></div><div class="cw"><canvas id="spBc"></canvas><canvas id="spDt"></canvas><canvas id="spCv"></canvas></div><div class="f" id="spF">Tryck på ritningen för att flyga dit i 3D. Hjul zoomar, dra panorerar.</div>`;
  l3sp.cv = el.querySelector("#spCv"); l3sp.bc = el.querySelector("#spBc"); l3sp.dt = el.querySelector("#spDt"); l3sp.baseKey = ""; l3sp.dtKey = "";
  el.querySelector("#spPlan").onchange = e => { l3sp.planId = e.target.value; l3spLoad(); }; el.querySelector("#spFollow").onclick = () => l3spFollow(!l3sp.follow);
  el.querySelector("#spFit").onclick = () => { l3spFit(); l3sp.key = ""; };
  { const zoomBtn = f => { const cv = l3sp.cv, v = l3sp.view, r = l3spBox(cv), x = r.width / 2, y = r.height / 2, nk = Math.min(60, Math.max(0.02, v.k * f)); if (l3sp.follow) { const [cx, cy] = l3spToScr(l3.camera.position.x + l3.O[0], l3.camera.position.y + l3.O[1]); v.tx += x - cx; v.ty += y - cy; } v.tx = x - (x - v.tx) * nk / v.k; v.ty = y - (y - v.ty) * nk / v.k; v.k = nk; l3sp.followHold = performance.now() + 500; l3sp.key = ""; }; el.querySelector("#spZin").onclick = () => zoomBtn(1.6); el.querySelector("#spZout").onclick = () => zoomBtn(1 / 1.6); } el.querySelector("#spSize").onclick = () => { if (l3spSide()) { const c = l3spW(); l3SetPref("spW", c < 0.42 ? 0.5 : c < 0.58 ? 0.65 : 0.35); l3spSize(); l3spRefit(); l3spFit(); return; } const cur = l3spH(), nxt = cur < 0.3 ? 0.4 : cur < 0.5 ? 0.6 : 0.25; l3SetPref("spH", nxt); l3spSize(); l3spRefit(); l3spFit(); };
  el.querySelector("#spLay").onclick = () => { l3SetPref("spLay", l3spSide() ? "v" : "h"); l3spLayApply(); }; el.querySelector("#spPin").onclick = () => l3spPinClear(); el.querySelector("#spProf").onclick = () => l3spProfStart(); el.querySelector("#spX").onclick = () => l3spToggle(false);
  l3spLayApply(true); l3spBind(); l3spSplitBind(); l3spZBind(); l3spMapBind(); window.addEventListener("pointermove", l3spHover, true); await l3spLoad(); l3spLoop();
}
function l3spClose() { const was = l3sp.open; l3sp.profPick = false; l3sp.profA = null; l3sp.open = false; if (l3sp.ro) { l3sp.ro.disconnect(); l3sp.ro = null; } document.body.classList.remove("v3-dock", "v3-splitting"); clearTimeout(l3sp.dtT); if (l3sp.dtTask) { try { l3sp.dtTask.cancel(); } catch (e) { /* */ } l3sp.dtTask = null; } l3spZClearMesh(); l3spZPickStop(); clearTimeout(l3sp.hoverW); if (l3sp.onWin) window.removeEventListener("resize", l3sp.onWin); cancelAnimationFrame(l3sp.raf); window.removeEventListener("pointermove", l3spHover, true); const e = document.getElementById("v3Sp"); if (e) e.remove(); l3sp.el = l3sp.cv = null; l3spPinClear(); if (was) setTimeout(() => { if (typeof l3Resize === "function") { l3Resize(); l3Render(); } }, 0); }
function l3spApplyRect(r) { const el = l3sp.el, host = document.getElementById("v3Canvas"); if (!el || !host) return; const H = host.getBoundingClientRect(), w = Math.min(Math.max(240, r.w), H.width - 8), h = Math.min(Math.max(190, r.h), H.height - 8), x = Math.min(Math.max(4, r.x), H.width - w - 4), y = Math.min(Math.max(4, r.y), H.height - h - 4); Object.assign(el.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px", right: "auto", bottom: "auto" }); return { x, y, w, h }; }
function l3spDragBind() {
  const el = l3sp.el, host = document.getElementById("v3Canvas"); let st = null;
  const begin = (e, mode) => { const R = el.getBoundingClientRect(), H = host.getBoundingClientRect(); st = { mode, sx: e.clientX, sy: e.clientY, r: { x: R.left - H.left, y: R.top - H.top, w: R.width, h: R.height }, H }; e.preventDefault(); e.stopPropagation(); };
  el.addEventListener("pointerdown", e => {
    const rz = e.target.closest(".rz"); if (rz) { begin(e, rz.dataset.c); rz.setPointerCapture(e.pointerId); return; }
    const h = e.target.closest(".h"); if (h && !e.target.closest("button,select,input,label")) { begin(e, "move"); h.setPointerCapture(e.pointerId); }
  });
  el.addEventListener("pointermove", e => {
    if (!st) return; const dx = e.clientX - st.sx, dy = e.clientY - st.sy, r = { ...st.r }, m = st.mode, MINW = 240, MINH = 190;
    if (m === "move") { r.x += dx; r.y += dy; }
    else { if (m.includes("e")) r.w = Math.max(MINW, st.r.w + dx); if (m.includes("s")) r.h = Math.max(MINH, st.r.h + dy); if (m.includes("w")) { r.w = Math.max(MINW, st.r.w - dx); r.x = st.r.x + st.r.w - r.w; } if (m.includes("n")) { r.h = Math.max(MINH, st.r.h - dy); r.y = st.r.y + st.r.h - r.h; } }
    st.cur = l3spApplyRect(r); l3sp.key = ""; if (m !== "move") { if (!l3sp.fitDone) l3sp.fitDone = true; }
  });
  const end = () => { if (!st) return; const c = st.cur; st = null; if (c) { l3SetPref("spRect", c); l3sp.key = ""; } };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  window.addEventListener("resize", l3sp.onWin = () => { const r = l3spRect(); if (l3sp.el && r) l3spApplyRect(r); });
}
const l3spH = () => { const v = Number(l3Prefs().spH); return v >= 0.12 && v <= 0.75 ? v : 0.4; };
const l3spSide = () => l3Prefs().spLay === "h";
const l3spW = () => { const v = Number(l3Prefs().spW); return v >= 0.2 && v <= 0.8 ? v : 0.5; };
function l3spSize() { if (!l3sp.el) return; const v = l3sp.el.parentElement; if (!v) return;
  if (l3spSide()) { const w = v.clientWidth; l3sp.el.style.flex = w ? `0 0 ${Math.round(Math.max(260, Math.min(l3spW() * w, w - 220)))}px` : `0 0 ${(l3spW() * 100).toFixed(1)}%`; return; }
  const h = v.clientHeight; l3sp.el.style.flex = h ? `0 0 ${Math.round(Math.min(l3spH() * h, Math.max(120, h - 260)))}px` : `0 0 ${(l3spH() * 100).toFixed(1)}%`; }
/* Bredvid (delad med flyttbar mitt) eller under 3D-vyn (Victor 2026-11-02). */
function l3spLayApply(initial) { const col = l3sp.el && l3sp.el.parentElement; if (!col) return; col.classList.toggle("sbs", l3spSide()); const b = document.getElementById("spLay"); if (b) b.classList.toggle("on", l3spSide()); const sp = document.getElementById("spSplit"); if (sp) sp.title = l3spSide() ? "Dra för att flytta mitten" : "Dra för att ändra höjden på minimapen"; l3spSize(); l3spRefit(); if (!initial) setTimeout(() => { l3spRefit(); l3spFit(); }, 60); }
/* 3D-vyn måste få nytt mått när minimapen öppnas, stängs eller dras: renderaren, kameran och vyns kontroller räknas om. */
function l3spRefit() { if (typeof l3Resize === "function") { l3Resize(); if (typeof l3Render === "function") l3Render(); } l3sp.key = ""; l3sp.fitted = false; }
function l3spSplitBind() {
  const el = l3sp.el, sp = el.querySelector("#spSplit"); let drag = null;
  sp.addEventListener("pointerdown", e => { e.preventDefault(); e.stopPropagation(); sp.setPointerCapture(e.pointerId); drag = { col: el.parentElement.getBoundingClientRect() }; document.body.classList.add("v3-splitting"); });
  sp.addEventListener("pointermove", e => { if (!drag) return; if (l3spSide()) { l3SetPref("spW", Math.max(0.2, Math.min(0.8, (drag.col.right - e.clientX) / drag.col.width))); } else { l3SetPref("spH", Math.max(0.12, Math.min(0.75, (drag.col.bottom - e.clientY) / drag.col.height))); } l3spSize(); l3spRefit(); });
  const end = () => { if (!drag) return; drag = null; document.body.classList.remove("v3-splitting"); l3spRefit(); l3spFit(); l3sp.key = ""; };
  sp.addEventListener("pointerup", end); sp.addEventListener("pointercancel", end); sp.addEventListener("dblclick", () => { l3SetPref(l3spSide() ? "spW" : "spH", l3spSide() ? 0.5 : 0.4); l3spSize(); l3spRefit(); l3spFit(); });
  if (window.ResizeObserver && !l3sp.ro) { l3sp.ro = new ResizeObserver(() => { if (l3sp.open) { l3spRefit(); } }); l3sp.ro.observe(document.getElementById("v3Canvas")); }
}
/* Bildpyramid: halverade kopior – vid utzoomning ritas en lagom stor kopia i stället för den stora bilden (annars skalas miljontals pixlar varje bild). */
function l3spPyramid(img) { const lv = [{ cv: img, f: 1 }]; let cur = img, f = 1; while (Math.max(cur.width, cur.height) > 600) { const c = document.createElement("canvas"); c.width = Math.max(1, cur.width >> 1); c.height = Math.max(1, cur.height >> 1); const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(cur, 0, 0, c.width, c.height); f *= 2; lv.push({ cv: c, f }); cur = c; } return lv; }
async function l3spLoad() {
  const p = l3spPlans().find(x => x.id === l3sp.planId); if (!p || l3sp.busy) return; const f = document.getElementById("spF");
  l3sp.cache = l3sp.cache || new Map(); const hit = l3sp.cache.get(p.id), calSig = JSON.stringify(l3spCalib(p));
  if (hit && hit.sig === calSig && hit.file === (p.file_path || "") && (plan && p.id === plan.id ? hit.page === page : true)) { Object.assign(l3sp, { pg: hit.pg, img: hit.img, vp: hit.vp, pyr: hit.pyr, aff: hit.aff, baseKey: "", dtKey: "" }); l3spFit(); l3spZSync(); l3sp.key = ""; if (f) f.textContent = "Tryck på ritningen för att flyga dit i 3D. Hjul zoomar, dra panorerar."; return; }
  l3sp.busy = true; if (f) f.textContent = "Hämtar ritningen…";
  try {
    const pg = plan && p.id === plan.id ? page : await pdfOverlayPage(p); if (!pg) throw new Error("Ritningen kunde inte läsas.");
    const v1 = pg.getViewport({ scale: 1 }), s = Math.min((typeof lowMemDevice !== "undefined" && lowMemDevice ? 1500 : 2800) / Math.max(v1.width, v1.height), 4), vp = pg.getViewport({ scale: s });
    const cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height); const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
    await pg.render({ canvasContext: ctx, viewport: vp }).promise;
    const aff = calibAffine(l3spCalib(p)), pyr = l3spPyramid(cv); l3sp.cache.set(p.id, { pg, img: cv, vp, pyr, aff, sig: calSig, file: p.file_path || "", page: plan && p.id === plan.id ? page : null });
    if (l3sp.cache.size > 3) l3sp.cache.delete(l3sp.cache.keys().next().value);
    Object.assign(l3sp, { pg, img: cv, vp, pyr, aff, baseKey: "", dtKey: "", dtView: null }); if (l3sp.dt) { l3sp.dt.style.visibility = "hidden"; l3sp.dt.style.transform = ""; } l3spFit(); l3spZSync(); l3sp.key = ""; if (f) f.textContent = "Tryck på ritningen för att flyga dit i 3D. Hjul zoomar, dra panorerar.";
  } catch (e) { if (f) f.textContent = "Kunde inte visa ritningen: " + (e && e.message || e); } finally { l3sp.busy = false; }
}
function l3spFollow(on) { l3sp.follow = !!on; const b = document.getElementById("spFollow"); if (b) b.classList.toggle("on", l3sp.follow); l3sp.followCatch = l3sp.follow; l3sp.key = ""; }
/* Panelens mått i layout-pixlar (inte påverkade av ingångsanimationens skalning) och dess läge på skärmen. */
function l3spBox(cv) { const r = cv.getBoundingClientRect(); return { left: r.left, top: r.top, width: cv.clientWidth || r.width, height: cv.clientHeight || r.height }; }
function l3spFit() { const cv = l3sp.cv, im = l3sp.img; if (!cv || !im) return; const r = l3spBox(cv), k = Math.min(r.width / im.width, r.height / im.height) || 1; l3sp.view = { k, tx: (r.width - im.width * k) / 2, ty: (r.height - im.height * k) / 2 }; }
/* Modell (m) ↔ bildpunkt i den renderade ritningen ↔ skärmpunkt i panelen. */
function l3spToImg(x, y) { const [px, py] = l3spAff(l3sp.aff, x, y), q = l3sp.vp.convertToViewportPoint(px, py); return q; }
function l3spFromImg(ix, iy) { const [px, py] = l3sp.vp.convertToPdfPoint(ix, iy), m = affInv(l3sp.aff); return l3spAff(m, px, py); }
const l3spToScr = (x, y) => { const q = l3spToImg(x, y), v = l3sp.view; return [v.tx + q[0] * v.k, v.ty + q[1] * v.k]; };
const l3spFromScr = (sx, sy) => { const v = l3sp.view; return l3spFromImg((sx - v.tx) / v.k, (sy - v.ty) / v.k); };
function l3spBind() {
  const cv = l3sp.cv; let moved = 0;
  cv.addEventListener("wheel", e => {
    e.preventDefault(); e.stopPropagation(); const r = l3spBox(cv), v = l3sp.view, dy = Math.max(-120, Math.min(120, e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY)), f = Math.exp(-dy * 0.0016), nk = Math.min(60, Math.max(0.02, v.k * f));
    // med Följ på zoomar den runt kameran (mitten) – annars runt musen; Följ pausar en kort stund så att den inte drar tillbaka bilden
    const x = l3sp.follow ? r.width / 2 : e.clientX - r.left, y = l3sp.follow ? r.height / 2 : e.clientY - r.top; if (l3sp.follow) { const [cx, cy] = l3spToScr(l3.camera.position.x + l3.O[0], l3.camera.position.y + l3.O[1]); v.tx += x - cx; v.ty += y - cy; }
    v.tx = x - (x - v.tx) * nk / v.k; v.ty = y - (y - v.ty) * nk / v.k; v.k = nk; l3sp.followHold = performance.now() + 500; l3sp.key = "";
  }, { passive: false });
  /* Pekskärm (Victor 2026-10-31: "jag kan inte zooma i minimapen på iPhone"): två fingrar zoomar och panorerar (nyp), ett finger panorerar, tryck flyger dit,
     dubbeltryck zoomar in. Mus: som förut (hjul, dra, klick). */
  const ptrs = new Map(); let pinch = null, lastTap = null;
  const loc = e => { const r = l3spBox(cv); return [e.clientX - r.left, e.clientY - r.top]; };
  const mid = () => { const q = [...ptrs.values()]; return [(q[0].x + q[1].x) / 2, (q[0].y + q[1].y) / 2, Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y) || 1]; };
  cv.addEventListener("pointerdown", e => {
    e.stopPropagation(); try { cv.setPointerCapture(e.pointerId); } catch (err) { /* */ } ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { l3sp.drag = { x: e.clientX, y: e.clientY, tx: l3sp.view.tx, ty: l3sp.view.ty }; moved = 0; }
    else if (ptrs.size === 2) { l3sp.drag = null; moved = 99; const [mx, my, d] = mid(), r = l3spBox(cv); pinch = { d0: d, k0: l3sp.view.k, mx0: mx - r.left, my0: my - r.top, tx0: l3sp.view.tx, ty0: l3sp.view.ty }; if (l3sp.follow) l3spFollow(false); }
  });
  cv.addEventListener("pointermove", e => {
    if (l3sp.profPick && l3sp.profA) { const r0 = l3spBox(cv); l3sp.profH = l3spFromScr(e.clientX - r0.left, e.clientY - r0.top); l3sp.ovDirty = true; }
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size >= 2) { const [mx, my, d] = mid(), r = l3spBox(cv), v = l3sp.view, nk = Math.min(60, Math.max(0.02, pinch.k0 * d / pinch.d0)), cx = mx - r.left, cy = my - r.top;
      v.tx = cx - (pinch.mx0 - pinch.tx0) / pinch.k0 * nk; v.ty = cy - (pinch.my0 - pinch.ty0) / pinch.k0 * nk; v.k = nk; l3sp.key = ""; return; }
    const d = l3sp.drag; if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y; moved = Math.max(moved, Math.hypot(dx, dy));
    if (moved > 4) { if (l3sp.follow) l3spFollow(false); l3sp.view.tx = d.tx + dx; l3sp.view.ty = d.ty + dy; l3sp.key = ""; }
  });
  const up = e => {
    const had = ptrs.delete(e.pointerId); if (!had) return;
    if (pinch && ptrs.size < 2) { pinch = null; const q = [...ptrs.values()][0]; l3sp.drag = q ? { x: q.x, y: q.y, tx: l3sp.view.tx, ty: l3sp.view.ty } : null; moved = 99; return; }   // fingret som blev kvar fortsätter panorera
    const d = l3sp.drag; l3sp.drag = null; if (!d || moved > 4 || e.type === "pointercancel") return;
    const r = l3spBox(cv), px = e.clientX - r.left, py = e.clientY - r.top, now = performance.now();
    if (l3sp.profPick) { l3spTapFx(px, py, false); l3spProfPoint(...l3spFromScr(px, py)); return; }   // profil: tryck punkt A och B
    if (e.pointerType !== "mouse" && lastTap && now - lastTap.t < 320 && Math.hypot(px - lastTap.x, py - lastTap.y) < 28) { lastTap = null; const v = l3sp.view, nk = Math.min(60, v.k * 2.2); if (l3sp.follow) l3spFollow(false); v.tx = px - (px - v.tx) * nk / v.k; v.ty = py - (py - v.ty) * nk / v.k; v.k = nk; l3sp.key = ""; return; }   // dubbeltryck: zooma in
    lastTap = { x: px, y: py, t: now }; const [x, y] = l3spFromScr(px, py); l3spTapFx(px, py, l3spSnapPcOn()); l3sp.followHold = performance.now() + 3500; setTimeout(() => { if (lastTap && lastTap.t === now) { lastTap = null; requestAnimationFrame(() => setTimeout(() => l3spGoTo(x, y), 0)); } }, e.pointerType === "mouse" ? 0 : 330);   // enkeltryck flyger dit (väntar in ett eventuellt dubbeltryck på pekskärm)
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("dblclick", e => { e.preventDefault(); }); ["gesturestart", "gesturechange"].forEach(t => cv.addEventListener(t, e => e.preventDefault()));   // Safari: sidans egen nyp-zoom ska inte ta över
}
/* Markhöjden under (x,y): rakt nedifrån ovan mot ytorna, annars ritningens nivå. */
function l3spGround(x, y) {
  const O = l3.O, p = l3spPlans().find(q => q.id === l3sp.planId), c = p && l3spCalib(p), zp = c && c.model && c.model[0] ? Number(c.model[0][2]) || 0 : null;
  const rc = new THREE.Raycaster(new THREE.Vector3(x - O[0], y - O[1], 5000), new THREE.Vector3(0, 0, -1)); let z = null;
  // Ytan närmast ritningens höjd (inte taket ovanför): den högsta träffen som ligger högst 3 m över ritningen – annars flyger kameran upp på taket
  try { const hits = rc.intersectObjects(l3Surfaces(), true).filter(h => h.object.visible && !h.object.userData.noHit && h.object.type !== "Line" && h.object.type !== "LineSegments").map(h => h.point.z + O[2]);
    const ok = zp == null ? hits.slice(0, 1) : hits.filter(h => h <= zp + 3).sort((a, b) => b - a).slice(0, 1); if (ok.length) z = ok[0]; } catch (e) { /* ingen träff */ }
  return z != null ? z : zp != null ? zp : 0;
}
/* Fäst i punktmolnet (Victor 2026-11-01: "när jag klickar i minimapen vill jag att markören snappar i punktmolnet"): det högsta punktmolnspunkten inom en liten radie runt klicket
   (radien följer zoomen, ca 12 skärmpixlar) blir nålens läge i både plan och höjd. Söker bara i tända moln, via molnens rutindex (snabbt även i stora moln). */
const l3spSnapPcOn = () => l3Prefs().spSnapPc !== false && ((typeof l3pc !== "undefined" && l3pc.clouds.some(c => c.visible)) || (typeof l3b !== "undefined" && l3b.models.some(m => m.visible !== false && m.meshes.length)));
/* Höjden på det som syns rakt ovanför punkten i IFC-modellerna (översta träffen). Läget ändras inte. */
function l3spIfcSnap(x, y) {
  if (typeof l3b === "undefined" || !l3b.models.some(m => m.visible !== false && m.meshes.length)) return null;
  const O = l3.O, rc = new THREE.Raycaster(new THREE.Vector3(x - O[0], y - O[1], 5000), new THREE.Vector3(0, 0, -1)); let best = null;
  try { const objs = l3b.models.filter(m => m.visible !== false).flatMap(m => m.meshes.filter(q => q.visible)); const hits = rc.intersectObjects(objs, true).filter(h => h.object.visible && h.object.type !== "Line" && h.object.type !== "LineSegments"); if (hits.length) best = hits[0].point.z + O[2]; } catch (e) { /* ingen träff */ }
  return best;
}
function l3spCloudSnap(x, y, r) {
  let best = null; const r2 = r * r;
  l3pc.clouds.forEach(c => {
    if (!c.visible) return; const cx = c.info.center[0], cy = c.info.center[1], cz = c.info.center[2] + (c.dz || 0), lx = x - cx, ly = y - cy;
    c.chunks.forEach(ch => {
      const P = ch.pos, scan = (a, b) => { for (let i = a; i < b; i++) { const dx = P[i * 3] - lx, dy = P[i * 3 + 1] - ly; if (dx * dx + dy * dy <= r2) { const z = P[i * 3 + 2] + cz; if (!best || z > best[2]) best = [P[i * 3] + cx, P[i * 3 + 1] + cy, z]; } } };
      if (ch.cells && ch.cells.length) { ch.cells.forEach(q => { if (lx + r < q.min[0] || lx - r > q.max[0] || ly + r < q.min[1] || ly - r > q.max[1]) return; scan(q.a, q.b); }); }
      else { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; const n = P.length / 3; for (let i = 0; i < n; i += Math.max(1, (n / 2000) | 0)) { const px = P[i * 3], py = P[i * 3 + 1]; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; } if (lx + r < x0 - 5 || lx - r > x1 + 5 || ly + r < y0 - 5 || ly - r > y1 + 5) return; scan(0, n); }
    });
  });
  return best;
}
/* Profil ur minimapen (Victor 2026-11-02): tryck punkt A och B i ritningen – profilen genom de tända punktmolnen visas som i punktmolnsverktyget. */
function l3spProfZ(x, y) { const c = typeof l3pc !== "undefined" ? l3spCloudSnap(x, y, 0.6) : null; return c ? c[2] : l3spGround(x, y); }
function l3spProfStart() {
  if (typeof l3pfShow !== "function" || typeof l3pc === "undefined" || !l3pc.clouds.some(c => c.visible)) { l3Status("Profilen behöver ett tänt punktmoln (Lager → Punktmoln).", true); return; }
  if (typeof l3ptPickStop === "function") l3ptPickStop(); if (typeof l3pfClear === "function") l3pfClear(); l3spFollow(false); l3sp.profPick = true; l3sp.profA = null; l3sp.profH = null; l3sp.ovDirty = true;
  const b = document.getElementById("spProf"); if (b) b.classList.add("on"); l3Status("Profil: tryck punkt A i ritningen (Esc avbryter)."); if (l3sp.cv) l3sp.cv.style.cursor = "crosshair";
}
function l3spProfStop() { l3sp.profPick = false; l3sp.profA = null; l3sp.profH = null; l3sp.ovDirty = true; const b = document.getElementById("spProf"); if (b) b.classList.remove("on"); if (l3sp.cv) l3sp.cv.style.cursor = ""; }
function l3spProfPoint(x, y) {
  if (!l3sp.profA) { l3sp.profA = [x, y]; l3sp.ovDirty = true; l3Status("Profil: tryck punkt B."); return; }
  const A = l3sp.profA, O = l3.O, w = typeof l3ptNum === "function" ? l3ptNum("ptPw", 0.5) : 0.5; l3spProfStop();
  if (Math.hypot(x - A[0], y - A[1]) < 0.3) { l3Status("Punkterna ligger för nära varandra.", true); return; }
  l3pfShow([A[0] - O[0], A[1] - O[1], l3spProfZ(A[0], A[1]) - O[2]], [x - O[0], y - O[1], l3spProfZ(x, y) - O[2]], w); l3sp.ovDirty = true;
}
/* Tryckanimation: punkt som poppar, två ringar som sprider sig; grön om nålen fäste i punktmolnet. Syns direkt vid tryck (px, py = bildpunkter i ritningen). */
function l3spTapFx(px, py, snap) {
  if (typeof l3moOK === "function" && !l3moOK()) return; const cw = l3sp.cv && l3sp.cv.parentElement; if (!cw) return;
  const fx = document.createElement("div"); fx.className = "tapfx" + (snap ? " snap" : ""); fx.style.left = px + "px"; fx.style.top = py + "px"; fx.innerHTML = '<i class="r"></i><i class="r r2"></i><i class="d"></i>'; cw.appendChild(fx);
  setTimeout(() => fx.remove(), 900);
}
function l3spGoTo(x, y) {
  let snap = null; if (l3spSnapPcOn() && l3sp.cv) { const a = l3spFromScr(0, 0), b = l3spFromScr(1, 0), mpp = Math.hypot(b[0] - a[0], b[1] - a[1]) || 0.05; snap = typeof l3pc !== "undefined" ? l3spCloudSnap(x, y, Math.min(1, Math.max(0.1, 6 * mpp))) : null; const zi = l3spIfcSnap(x, y); if (zi != null && (!snap || zi > snap[2])) snap = [x, y, zi, "ifc"]; }
  if (typeof l3moOK === "function" && l3moOK()) (l3sp.rip = l3sp.rip || []).push({ x, y, t: performance.now() });   // ring där man tryckte
  const z = snap ? snap[2] : l3spGround(x, y); l3sp.pin = [x, y, z]; l3spPinDraw();
  const T = new THREE.Vector3(x - l3.O[0], y - l3.O[1], z - l3.O[2]), dist = Math.max(3, l3.camera.position.distanceTo(l3.orbit.target));
  if (typeof l3FlyTo === "function") l3FlyTo(T, dist, null, 450); else { l3.orbit.target.copy(T); l3.orbit.update(); }
  l3Status(`Ritningen → 3D${snap ? ` (fäst i ${snap[3] === "ifc" ? "IFC-modellen" : "punktmolnet"})` : ""}: ${x.toFixed(1).replace(".", ",")} / ${y.toFixed(1).replace(".", ",")}, höjd ${z.toFixed(2).replace(".", ",")} m. Nålen tas bort med Nål ✕.`); l3sp.key = ""; l3sp.pinSnap = !!snap;
  if (snap && l3sp.cv) { const fx = l3sp.cv.parentElement && l3sp.cv.parentElement.querySelector(".tapfx:last-child"); if (fx) fx.classList.add("snap"); }
}
/* Nålen i 3D (Victor 2026-10-31: "snyggare i modellen med animationer ungefär som flyttverktyget"): en röd nål med skugga och glans som faller ner och landar,
   ringar som pulserar ut från marken en stund, en etikett med höjden som tonas in, och en storlek som följer avståndet så att den alltid syns lika stor. Den syns
   genom modellen med svagare färg. Animationen går bara några sekunder – sedan står nålen still (ingen onödig rendering). */
function l3spPinMake(p) {
  const O = l3.O, g = new THREE.Group(), body = new THREE.Group(), ghost = new THREE.Group(), rings = [], RED = 0xef4444, DARK = 0xb91c1c;
  const mat = (col, op, depth) => new THREE.MeshBasicMaterial({ color: col, transparent: op < 1 || !depth, opacity: op, depthTest: depth, depthWrite: false, side: THREE.DoubleSide });
  const part = (geo, col, op, depth, z, ro) => { const m = new THREE.Mesh(geo, mat(col, op, depth)); m.position.z = z; m.renderOrder = ro; m.userData.noHit = true; m.raycast = () => {}; return m; };
  const cone = new THREE.ConeGeometry(0.3, 1.15, 28); cone.rotateX(-Math.PI / 2); const ball = new THREE.SphereGeometry(0.52, 28, 20), hi = new THREE.SphereGeometry(0.13, 12, 10);
  [[body, true, 1], [ghost, false, 0.3]].forEach(([grp, depth, op]) => { grp.add(part(cone, RED, op, depth, 0.575, depth ? 41 : 40), part(ball, RED, op, depth, 1.62, depth ? 41 : 40)); });
  // vit kant runt kulan och spetsen + vit ring på marken så att nålen skiljer sig från punktmolnet
  [[cone, 0.575], [ball, 1.62]].forEach(([geo, z]) => { const o = part(geo, 0xffffff, 1, true, z, 40.6); o.material.side = THREE.BackSide; o.scale.setScalar(1.24); body.add(o); });
  const shine = part(hi, 0xffffff, 0.9, true, 1.82, 42); shine.position.x = -0.2; shine.position.y = -0.22; body.add(shine);
  const base = part(new THREE.CircleGeometry(0.42, 32), DARK, 0.28, false, 0.015, 38); g.add(base); g.add(part(new THREE.RingGeometry(0.58, 0.72, 48), 0xffffff, 0.95, false, 0.018, 38));
  for (let i = 0; i < 3; i++) { const r = part(new THREE.RingGeometry(0.46, 0.56, 48), RED, 0.6, false, 0.02, 39); r.visible = i === 0; rings.push(r); g.add(r); }
  // etikett
  const cv = document.createElement("canvas"); cv.width = 320; cv.height = 96; const c = cv.getContext("2d");
  c.fillStyle = "rgba(15,23,42,.88)"; c.beginPath(); c.roundRect ? c.roundRect(4, 4, 312, 88, 20) : c.rect(4, 4, 312, 88); c.fill(); c.fillStyle = "#fff"; c.font = "700 34px system-ui, sans-serif"; c.textAlign = "center";
  c.fillText(String(Math.round(p[2] * 100) / 100).replace(".", ",") + " m ö.h.", 160, 44); c.font = "500 22px system-ui, sans-serif"; c.fillStyle = "#cbd5e1"; c.fillText(Math.round(p[0] * 10) / 10 + " / " + Math.round(p[1] * 10) / 10, 160, 76);
  const tex = new THREE.CanvasTexture(cv), lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, opacity: 0 })); lab.scale.set(3.2, 0.96, 1); lab.position.z = 3.1; lab.renderOrder = 45; lab.userData.noHit = true; lab.raycast = () => {};
  const beam = part(new THREE.CylinderGeometry(0.06, 0.06, 9, 8, 1, true), 0xffffff, 0.6, false, 5.2, 37); beam.rotation.x = Math.PI / 2; g.add(beam);   // ljusstråle uppåt så att nålen hittas på långt håll
  g.add(body, ghost, lab); g.position.set(p[0] - O[0], p[1] - O[1], p[2] - O[2]); g.userData.noHit = true; g.userData.pin = { body, ghost, rings, lab, base };
  return g;
}
const l3spEase = t => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };   // easeOutBack: faller ner och studsar till
function l3spPinScale() { const g = l3sp.pinObj; if (!g) return; const cam = l3.camera, d = cam.isOrthographicCamera ? 0.5 * (cam.top - cam.bottom) / (cam.zoom || 1) * 1.6 : cam.position.distanceTo(g.position); g.scale.setScalar(Math.max(0.05, 0.15 * Math.pow(Math.max(d, 0.1), 0.85))); }   // större än förut och växer lite på skärmen när man zoomar in
function l3spPinAnimate(t0) {
  const g = l3sp.pinObj; if (!g) return; const U = g.userData.pin, t = performance.now() - t0, drop = Math.min(1, t / 520), e = l3spEase(drop);
  U.body.position.z = (1 - e) * 7; U.ghost.position.z = U.body.position.z; const sq = t > 520 && t < 760 ? 1 - 0.14 * Math.sin((t - 520) / 240 * Math.PI) : 1; U.body.scale.set(1 / Math.sqrt(sq), 1 / Math.sqrt(sq), sq); U.ghost.scale.copy(U.body.scale);
  U.lab.material.opacity = Math.max(0, Math.min(1, (t - 420) / 320)); U.base.material.opacity = 0.28 * Math.min(1, t / 520);
  U.rings.forEach((r, i) => { const ph = ((t - 480 - i * 420) / 1500); if (t < 480 || t > 4300 || ph < 0) { r.visible = t > 4300 && i === 0; if (r.visible) { r.scale.setScalar(1); r.material.opacity = 0.5; } return; } const q = ph % 1; r.visible = true; r.scale.setScalar(1 + q * 3.6); r.material.opacity = (1 - q) * 0.6; });
  l3spPinScale(); l3Render(); if (t < 4400) l3sp.pinRaf = requestAnimationFrame(() => l3spPinAnimate(t0)); else { l3sp.pinRaf = 0; U.rings.forEach((r, i) => { r.visible = i === 0; }); U.rings[0].scale.setScalar(1); U.rings[0].material.opacity = 0.5; l3Render(); }
}
function l3spPinDraw() {
  l3spPinClear(true); const p = l3sp.pin; if (!p) return; const g = l3spPinMake(p); l3.scene.add(g); l3sp.pinObj = g; l3spPinScale();
  l3sp.pinOn = () => { l3spPinScale(); }; try { l3.orbit.addEventListener("change", l3sp.pinOn); } catch (e) { /* */ }
  cancelAnimationFrame(l3sp.pinRaf); l3spPinAnimate(performance.now());
}
function l3spPinClear(keepPin) {
  cancelAnimationFrame(l3sp.pinRaf); l3sp.pinRaf = 0; if (l3sp.pinOn) { try { l3.orbit.removeEventListener("change", l3sp.pinOn); } catch (e) { /* */ } l3sp.pinOn = null; }
  if (l3sp.pinObj) { l3.scene.remove(l3sp.pinObj); l3sp.pinObj.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); l3sp.pinObj = null; if (typeof l3Render === "function") l3Render(); }
  if (!keepPin) { l3sp.pin = null; l3sp.key = ""; }
}
/* Musen i 3D → kors på ritningen (högst 10 gånger per sekund). */
function l3spHover(e) {
  if (!l3sp.open || e.target !== l3.renderer.domElement || l3sp.drag || e.buttons) return; const now = performance.now(); if (now - l3sp.hoverT < 160) return; l3sp.hoverT = now;
  // Träffen söks bara när musen stått stilla en stund (annars blir dra/orbit segt): en kort väntan, och en enda sökning per stillastående.
  clearTimeout(l3sp.hoverW); const ev = { clientX: e.clientX, clientY: e.clientY };
  l3sp.hoverW = setTimeout(() => {
    if (!l3sp.open) return; let h = null; try { h = l3Ray(ev, l3Surfaces())[0]; } catch (err) { /* */ }
    const pc = !h && typeof l3pcPick === "function" ? l3pcPick(ev) : null, hit = pc ? pc.point : h && h.point, n = hit ? [hit.x + l3.O[0], hit.y + l3.O[1], hit.z + l3.O[2]] : null;
    if (!n && !l3sp.hover) return; if (n && l3sp.hover && Math.hypot(n[0] - l3sp.hover[0], n[1] - l3sp.hover[1]) < 0.02) return; l3sp.hover = n; l3sp.ovDirty = true;
  }, 90);
}
/* Två lager: ritningen (base) ritas bara när vyn/storleken ändras, markeringarna (kamera, kors, nål) ritas över den när kameran rört sig. Högst 30 bilder/s, och inget alls när fliken är dold. */
function l3spLoop() {
  if (!l3sp.open) return; l3sp.raf = requestAnimationFrame(l3spLoop); if (document.hidden) return;
  const now = performance.now(); if (now - (l3sp.lastDraw || 0) < 33) return;
  const cam = l3.camera; cam.updateMatrixWorld(); const E = cam.matrixWorld.elements, P = l3sp.camE || (l3sp.camE = new Float32Array(16)); let moved = l3sp.key === "" || l3sp.ovDirty;
  if (!moved) for (let i = 0; i < 16; i++) if (Math.abs(E[i] - P[i]) > 1e-5) { moved = true; break; }
  if (moved && typeof l3moOK === "function" && l3moOK()) { const tr = l3sp.trail = l3sp.trail || [], cx = cam.position.x + l3.O[0], cy = cam.position.y + l3.O[1], last = tr[tr.length - 1]; if (!last || Math.hypot(cx - last.x, cy - last.y) > 0.25) { tr.push({ x: cx, y: cy, t: now }); if (tr.length > 400) tr.shift(); } }
  if (!moved && ((l3sp.rip && l3sp.rip.length) || (l3sp.trail && l3sp.trail.length && now - l3sp.trail[l3sp.trail.length - 1].t < 6500))) moved = true;   // ringen och spåret tonar ut
  { const pfOn = typeof l3pf !== "undefined" && !!l3pf.data; if (pfOn !== l3sp.pfOn) { l3sp.pfOn = pfOn; moved = true; } }
  if (l3sp.pin && !document.hidden) moved = true;   // pulsen vid nålen ritas hela tiden
  const selN = l3.sel ? l3.sel.size : 0; if (selN !== l3sp.selN) { moved = true; l3sp.selN = selN; }
  if (!moved) return; for (let i = 0; i < 16; i++) P[i] = E[i]; l3sp.key = "ok"; l3sp.ovDirty = false; l3sp.lastDraw = now; l3spDraw();
}
function l3spDraw() {
  const cv = l3sp.cv, bc = l3sp.bc, im = l3sp.img; if (!cv || !bc || !im || !l3sp.aff) return; const r = l3spBox(cv), dpr = Math.min(2, window.devicePixelRatio || 1), bw = Math.round(r.width * dpr), bh = Math.round(r.height * dpr);
  let sized = false; if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; bc.width = bw; bc.height = bh; sized = true; if (!l3sp.fitted) { l3sp.fitted = true; l3spFit(); } }
  const O = l3.O, cam = l3.camera;
  // Följ: kameran hålls nära mitten med mjuk glidning (död zon, så att bilden inte hoppar vid små rörelser eller när man klickar)
  if (l3sp.follow && !l3sp.drag && performance.now() > (l3sp.followHold || 0)) { const [cx, cy] = l3spToScr(cam.position.x + O[0], cam.position.y + O[1]), v = l3sp.view, dx = r.width / 2 - cx, dy = r.height / 2 - cy, dist = Math.hypot(dx, dy), lim = Math.min(r.width, r.height) * 0.16;
    if (dist > lim || (l3sp.followCatch && dist > 1.5)) { l3sp.followCatch = dist > 1.5; const f = dist > lim * 3 ? 0.35 : 0.16; v.tx += dx * f; v.ty += dy * f; l3sp.ovDirty = true; } else l3sp.followCatch = false; }
  const v = l3sp.view, bk = [v.k.toFixed(5), v.tx.toFixed(1), v.ty.toFixed(1), bw, bh, l3sp.planId, im.width, l3spMapSrc(), l3spPdfOp(), l3sp.mapRev || 0].join("|");
  if (sized || bk !== l3sp.baseKey) {            // ritningen
    l3sp.baseKey = bk; const b = bc.getContext("2d"); b.setTransform(dpr, 0, 0, dpr, 0, 0); b.clearRect(0, 0, r.width, r.height);
    const lv = (l3sp.pyr || [{ cv: im, f: 1 }]).reduce((best, L) => (L.f <= 1 / Math.max(v.k, 1e-6) * 1.0001 ? L : best), l3sp.pyr ? l3sp.pyr[0] : { cv: im, f: 1 });   // största f som ändå inte skalar ner mer än 1:1
    const mapOn = l3spMapDraw(b, r, dpr), vkey = [v.k.toFixed(5), v.tx.toFixed(1), v.ty.toFixed(1), bw, bh, l3sp.planId].join("|"), skipPdf = mapOn && l3sp.baseNoPdf === vkey;   // ortofoto/karta under ritningen
    if (!skipPdf) {   // (när den skarpa PDF:en ligger över fotot ritas den grova inte – annars blir linjerna dubbla)
      b.setTransform(dpr, 0, 0, dpr, 0, 0); b.globalCompositeOperation = mapOn ? "multiply" : "source-over"; b.globalAlpha = mapOn ? l3spPdfOp() / 100 : 1;   // multiplicera: ritningens vita blir genomskinligt
      b.imageSmoothingEnabled = true; b.imageSmoothingQuality = lv.f > 1 || v.k < 1 ? "medium" : "low"; b.drawImage(lv.cv, v.tx, v.ty, im.width * v.k, im.height * v.k); b.globalCompositeOperation = "source-over"; b.globalAlpha = 1;
      l3sp.baseNoPdf = null; l3spDetailSchedule(bw, bh, dpr, mapOn);
    }
  }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
  // kamerans spår (tonar ut efter några sekunder) och ringar där man tryckt
  { const now = performance.now(), tr = l3sp.trail; if (tr && tr.length > 1) { while (tr.length && now - tr[0].t > 6500) tr.shift(); g.lineCap = "round"; g.lineJoin = "round"; for (let i = 1; i < tr.length; i++) { const a = 1 - (now - tr[i].t) / 6500; if (a <= 0) continue; const p0 = l3spToScr(tr[i - 1].x, tr[i - 1].y), p1 = l3spToScr(tr[i].x, tr[i].y); g.strokeStyle = `rgba(37,99,235,${(a * 0.7).toFixed(3)})`; g.lineWidth = 1 + 2.5 * a; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke(); } }
    const rp = l3sp.rip; if (rp && rp.length) { l3sp.rip = rp.filter(q => now - q.t < 1000); l3sp.rip.forEach(q => { const t = (now - q.t) / 1000, [x, y] = l3spToScr(q.x, q.y); [0, 0.18].forEach(dl => { const u = Math.max(0, Math.min(1, (t - dl) / (1 - dl))); if (u <= 0) return; g.strokeStyle = `rgba(220,38,38,${(0.75 * (1 - u)).toFixed(3)})`; g.lineWidth = 2.5 * (1 - u) + 0.5; g.beginPath(); g.arc(x, y, 6 + u * 34, 0, 6.2832); g.stroke(); }); }); } }
  // profillinjen (A–B) – pågående val eller visad profil
  { let A = null, B = null; if (l3sp.profPick && l3sp.profA) { A = l3sp.profA; B = l3sp.profH; } else if (typeof l3pf !== "undefined" && l3pf.data && l3pf.A && l3pf.B) { A = [l3pf.A[0] + O[0], l3pf.A[1] + O[1]]; B = [l3pf.B[0] + O[0], l3pf.B[1] + O[1]]; }
    if (A) { const [ax, ay] = l3spToScr(A[0], A[1]); g.save(); g.strokeStyle = "#7c3aed"; g.fillStyle = "#7c3aed"; g.lineWidth = 2.5; g.setLineDash([7, 5]); if (B) { const [bx, by] = l3spToScr(B[0], B[1]); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); g.setLineDash([]); g.beginPath(); g.arc(bx, by, 5, 0, 6.2832); g.fill(); g.font = "700 11px system-ui"; g.fillText("B", bx + 8, by - 6); } g.setLineDash([]); g.beginPath(); g.arc(ax, ay, 5, 0, 6.2832); g.fill(); g.font = "700 11px system-ui"; g.fillText("A", ax + 8, ay - 6); g.restore(); } }
  // markerade etableringsobjekt
  if (l3.sel && l3.sel.size) placements.forEach(p => { if (!l3.sel.has(p.id)) return; const [x, y] = l3spToScr(p.x, p.y); g.fillStyle = "rgba(245,158,11,.35)"; g.strokeStyle = "#f59e0b"; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 9, 0, 6.2832); g.fill(); g.stroke(); if (p.name) { g.fillStyle = "#92400e"; g.font = "600 11px system-ui"; g.fillText(p.name, x + 12, y + 4); } });
  const mark = (pt, col, kind) => { if (!pt) return; const [x, y] = l3spToScr(pt[0], pt[1]); g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); if (kind === "cross") { g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.moveTo(x, y - 8); g.lineTo(x, y + 8); } else if (kind === "pin") { g.arc(x, y, 7, 0, 6.2832); g.moveTo(x, y - 7); g.lineTo(x, y - 22); } g.stroke(); };
  mark([l3.orbit.target.x + O[0], l3.orbit.target.y + O[1]], "#64748b", "cross"); if (l3sp.hover) { const [hx, hy] = l3spToScr(l3sp.hover[0], l3sp.hover[1]); g.save(); g.strokeStyle = "rgba(239,68,68,.9)"; g.lineWidth = 1; g.beginPath(); g.moveTo(0, Math.round(hy) + 0.5); g.lineTo(r.width, Math.round(hy) + 0.5); g.moveTo(Math.round(hx) + 0.5, 0); g.lineTo(Math.round(hx) + 0.5, r.height); g.stroke(); g.strokeStyle = "#ef4444"; g.lineWidth = 1.5; g.strokeRect(hx - 5, hy - 5, 10, 10); g.restore(); }   // röda hårkorset över hela minimapen (som i AutoCAD) mark(l3sp.pin, "#dc2626", "pin");
  // bestående puls där nålen står: mjuka ringar som sprider sig + glöd (statisk ring vid "Minska rörelser")
  if (l3sp.pin) { const [px, py] = l3spToScr(l3sp.pin[0], l3sp.pin[1]), col = l3sp.pinSnap ? "22,163,74" : "220,38,38", anim = typeof l3moOK !== "function" || l3moOK(), T = (performance.now() % 2000) / 2000;
    g.save(); if (anim) { [0, 0.5].forEach(o2 => { const u = (T + o2) % 1, rr = 8 + 30 * u; g.strokeStyle = `rgba(${col},${(0.75 * (1 - u)).toFixed(3)})`; g.lineWidth = 2.5 * (1 - u) + 0.8; g.beginPath(); g.arc(px, py, rr, 0, 6.2832); g.stroke(); }); const gl = g.createRadialGradient(px, py, 0, px, py, 20); gl.addColorStop(0, `rgba(${col},${(0.28 + 0.14 * Math.sin(T * 6.2832)).toFixed(3)})`); gl.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gl; g.beginPath(); g.arc(px, py, 20, 0, 6.2832); g.fill(); } else { g.strokeStyle = `rgba(${col},.7)`; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 14, 0, 6.2832); g.stroke(); }
    g.fillStyle = "#fff"; g.beginPath(); g.arc(px, py, 5.5, 0, 6.2832); g.fill(); g.fillStyle = `rgb(${col})`; g.beginPath(); g.arc(px, py, 4, 0, 6.2832); g.fill(); g.restore(); }
  const [cx, cy] = l3spToScr(cam.position.x + O[0], cam.position.y + O[1]), d = new THREE.Vector3(); cam.getWorldDirection(d);
  const [tx, ty] = l3spToScr(cam.position.x + O[0] + d.x, cam.position.y + O[1] + d.y), ang = Math.atan2(ty - cy, tx - cx), horiz = Math.hypot(d.x, d.y) > 0.12;
  if (horiz && !cam.isOrthographicCamera) { const fov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * (cam.aspect || 1)), R = 70; g.fillStyle = "rgba(37,99,235,.22)"; g.strokeStyle = "#2563eb"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, ang - fov / 2, ang + fov / 2); g.closePath(); g.fill(); g.stroke(); }
  g.fillStyle = "#2563eb"; g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 6, 0, 6.2832); g.fill(); g.stroke();
}

/* ---- Höjdkalibrering (Victor 2026-10-31): ritningens höjd hämtas från kalibreringen och kan ställas in efter modellens höjder ------------- */
const l3spZRound = v => Math.round(v * 1000) / 1000;
const l3spZOf = p => { const c = p && l3spCalib(p); return c && c.model ? (Number(c.model[0][2]) || 0) / 1 * 0.5 + (Number(c.model[1][2]) || 0) * 0.5 : 0; };
function l3spZSync() {
  const el = l3sp.el; if (!el) return; const p = l3spPlans().find(x => x.id === l3sp.planId), inp = el.querySelector("#spZ"); if (!p || !inp) return;
  inp.value = l3spZOf(p).toFixed(3).replace(/0+$/, "").replace(/[.]$/, "").replace(".", ",") || "0"; l3sp.zPrev = null; const u = el.querySelector("#spZundo"); if (u) u.disabled = true; l3spZMesh();
}
/* Sätter höjden på båda kalibreringspunkterna (XY är orört) och sparar ritningen. */
function l3spZSet(z, silent) {
  const p = l3spPlans().find(x => x.id === l3sp.planId); if (!p || !Number.isFinite(z)) return; z = l3spZRound(z); const c = l3spCalib(p), was = l3spZOf(p);
  if (Math.abs(z - was) < 0.0005) return; l3sp.zPrev = { id: p.id, z: was, m: c.model.map(q => q.slice()) };
  const model = c.model.map(q => [q[0], q[1], z]);
  if (plan && p.id === plan.id) {
    plan.calib = { ...plan.calib, model }; plan._calibSet = true; if (typeof invalidatePositions === "function") invalidatePositions(); if (typeof renderOrtho === "function") renderOrtho(); if (typeof renderZones === "function") renderZones();
    if (typeof schedulePlanSave === "function") schedulePlanSave(); if (typeof l3BuildPlan === "function") l3BuildPlan().then(() => { if (typeof l3sRefresh === "function") l3sRefresh(0); l3Render(); });
  } else {
    p.calib = { ...p.calib, model }; p._calibSet = true; clearTimeout(l3sp.zSave); l3sp.zSave = setTimeout(() => { if (typeof savePlan === "function") savePlan(p); }, 600);
  }
  l3sp.aff = calibAffine(l3spCalib(p)); const hit = l3sp.cache && l3sp.cache.get(p.id); if (hit) { hit.sig = JSON.stringify(l3spCalib(p)); hit.aff = l3sp.aff; }
  l3spZSync(); l3sp.zPrev = { id: p.id, z: was, m: c.model.map(q => q.slice()) }; const u = l3sp.el && l3sp.el.querySelector("#spZundo"); if (u) u.disabled = false;
  l3sp.key = ""; if (!silent) l3Status(`Ritningens höjd: ${String(z).replace(".", ",")} m ö.h.`);
}
function l3spZBind() {
  const el = l3sp.el, q = id => el.querySelector(id), inp = q("#spZ"), parse = () => Number(String(inp.value).replace(",", ".").replace(/\s/g, ""));
  const cur = () => l3spZOf(l3spPlans().find(x => x.id === l3sp.planId));
  q("#spZm").onclick = e => l3spZSet(cur() - (e.shiftKey ? 1 : 0.1)); q("#spZp").onclick = e => l3spZSet(cur() + (e.shiftKey ? 1 : 0.1));
  inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); l3spZSet(parse()); inp.blur(); } e.stopPropagation(); }); inp.addEventListener("change", () => l3spZSet(parse()));
  q("#spZpick").onclick = () => l3spZPickStart(); q("#spZpin").onclick = () => { if (l3sp.pin) l3spZSet(l3sp.pin[2]); else l3Status("Sätt en nål först: tryck på ritningen.", true); };
  q("#spZundo").onclick = () => { const u = l3sp.zPrev; if (!u) return; const z = u.z; l3sp.zPrev = null; l3spZSet(z); l3sp.zPrev = null; q("#spZundo").disabled = true; };
  q("#spSnapPc").checked = l3Prefs().spSnapPc !== false; q("#spSnapPc").onchange = e => { l3SetPref("spSnapPc", e.target.checked); }; q("#spZshow").onchange = e => { l3sp.zShow = e.target.checked; l3spZMesh(); }; q("#spZshow").checked = !!l3sp.zShow; l3spZSync();
}
/* Hämta höjd från 3D: nästa tryck i 3D-vyn (yta, modell eller punktmoln) ger höjden. */
function l3spZPickStart() { l3spZPickStop(); l3sp.zPick = e => { if (e.button !== 0 || e.target !== l3.renderer.domElement) return; e.stopImmediatePropagation(); e.preventDefault(); let h = null; try { h = l3Ray(e, l3Surfaces().filter(o => o !== l3sp.zMesh))[0]; } catch (err) { /* */ } const pc = typeof l3pcPick === "function" ? l3pcPick(e) : null, pt = pc && (!h || pc.distance < h.distance) ? pc.point : h && h.point; l3spZPickStop(); if (pt) l3spZSet(pt.z + l3.O[2]); else l3Status("Ingen yta där – tryck på modellen, marken eller punktmolnet.", true); }; window.addEventListener("pointerdown", l3sp.zPick, true); l3.renderer.domElement.style.cursor = "crosshair"; l3Status("Tryck på en yta i 3D – ritningen får ytans höjd (Esc avbryter)."); }
function l3spZPickStop() { if (l3sp.zPick) { window.removeEventListener("pointerdown", l3sp.zPick, true); l3sp.zPick = null; if (l3 && l3.renderer) l3.renderer.domElement.style.cursor = ""; } }
/* Ritningen som genomskinlig yta i 3D på sin höjd (för ritningar som inte är arbetsytan; arbetsytan ritas redan som mark). */
function l3spZClearMesh() { if (l3sp.zPlanWas !== undefined) { if (l3.planMesh) l3.planMesh.visible = l3sp.zPlanWas; l3sp.zPlanWas = undefined; if (typeof l3Render === "function") l3Render(); }   // aktiva ritningens egen yta: tillbaka till som den var när 'Visa i 3D' släcks
  if (l3sp.zMesh) { l3.scene.remove(l3sp.zMesh); l3sp.zMesh.geometry.dispose(); l3sp.zMesh.material.map && l3sp.zMesh.material.map.dispose(); l3sp.zMesh.material.dispose(); l3sp.zMesh = null; if (typeof l3Render === "function") l3Render(); } }
function l3spZMesh() {
  l3spZClearMesh(); if (!l3sp.zShow || !l3sp.open || !l3sp.img || !l3sp.aff) return; const p = l3spPlans().find(x => x.id === l3sp.planId); if (!p) return;
  if (plan && p.id === plan.id) { if (l3.planMesh) { l3sp.zPlanWas = l3.planMesh.visible; l3.planMesh.visible = true; l3Render(); } return; }
  const z = l3spZOf(p), im = l3sp.img, O = l3.O, pos = [], uv = [];
  [[0, im.height], [im.width, im.height], [im.width, 0], [0, 0]].forEach(([cx, cy]) => { const [px, py] = l3sp.vp.convertToPdfPoint(cx, cy), [mx, my] = l3spAff(affInv(l3sp.aff), px, py); pos.push(mx - O[0], my - O[1], z - O[2]); uv.push(cx / im.width, 1 - cy / im.height); });
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
  const tex = new THREE.CanvasTexture(l3sp.pyr && l3sp.pyr[1] ? l3sp.pyr[1].cv : im); if ("encoding" in tex) tex.encoding = THREE.sRGBEncoding;
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false })); m.userData.noHit = true; m.raycast = () => {}; m.renderOrder = 5; l3.scene.add(m); l3sp.zMesh = m; l3Render();
}
/* Tangenter från l3Key: Esc avbryter "Hämta från 3D". */
function l3spKey(e) { if (l3sp.profPick && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); l3spProfStop(); l3Status("Profilen avbruten."); return true; } if (l3sp.zPick && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); l3spZPickStop(); l3Status("Avbrutet."); return true; } return false; }

/* ---- Ortofoto/karta under ritningen (Victor 2026-10-31: "kan jag också få se orthofotona i minimapen?") ----------------------------------
   Samma plattkällor som bakgrundskartan i 3D (Esri-ortofoto, Sentinel-2, OSM eller egen XYZ-adress, t.ex. Lantmäteriets ortofoto med nyckel).
   Plattorna är Web Mercator; varje platta ritas som en affin avbildning (lat/lon → SWEREF → ritningens bild → skärm), vilket är exakt nog på byggplatsens storlek.
   Ritningen multipliceras ovanpå så att dess vita bakgrund släpper igenom fotot. */
const l3spMapSrc = () => { const v = l3Prefs().spMap; return typeof v === "string" ? v : ""; };
const l3spPdfOp = () => { const v = Number(l3Prefs().spPdfOp); return v >= 15 && v <= 100 ? v : 85; };
/* Ortofotona som är uppladdade i projektet (Lager → Ortofoto) som egna val, nyast sist, plus "alla tända" som i lagerlistan. */
const l3spOrthoList = () => (typeof orthosByDate === "function" ? orthosByDate() : []);
function l3spOrthoOptions(sel) {
  sel.querySelectorAll("optgroup").forEach(g => g.remove()); const list = l3spOrthoList(); if (!list.length) return; const esc = typeof escHtml === "function" ? escHtml : String;
  const g = document.createElement("optgroup"); g.label = "Mina ortofoton";
  g.innerHTML = `<option value="ortho:*">Tända ortofoton (som i lagerlistan)</option>` + list.map(o => `<option value="ortho:${esc(o.id)}">${esc(o.name || "Ortofoto")}${(typeof orthoDate === "function" ? orthoDate(o) : o.date) ? " · " + esc(typeof orthoDate === "function" ? orthoDate(o) : o.date) : ""}</option>`).join("");
  sel.insertBefore(g, sel.options[1] || null);
}
function l3spMapBind() {
  const el = l3sp.el, sel = el.querySelector("#spMapSrc"), op = el.querySelector("#spPdfOp"); if (!sel) return; l3spOrthoOptions(sel); sel.value = l3spMapSrc(); if (sel.value !== l3spMapSrc()) sel.value = ""; op.value = l3spPdfOp();
  sel.addEventListener("pointerdown", () => { const v = sel.value; l3spOrthoOptions(sel); sel.value = v; });   // nya ortofoton dyker upp utan att panelen öppnas om
  sel.onchange = () => { l3SetPref("spMap", sel.value); l3sp.mapRev = (l3sp.mapRev || 0) + 1; l3sp.key = ""; l3spMapNote(); if (sel.value === "custom" && !l3Prefs().mapUrl) l3Status("Egen adress: skriv in en XYZ-adress under Kartan i 3D-vyns inställningar (kugghjulet).", true); };
  op.oninput = () => { l3SetPref("spPdfOp", Number(op.value)); l3sp.key = ""; }; l3spMapNote();
}
function l3spMapNote() { const f = document.getElementById("spF"); if (!f) return; const s = l3spMapSrc(); if (s.startsWith("ortho:")) { const os = l3spOrthoSel(s); f.textContent = os.length ? "Underlag: " + os.map(o => o.name || "ortofoto").join(", ") : "Inga tända ortofoton – tänd dem under Lager."; return; } const a = s && typeof L3MAP_SRC !== "undefined" && L3MAP_SRC[s] ? L3MAP_SRC[s][2] : ""; f.textContent = a ? "Underlag: " + a : "Tryck på ritningen för att flyga dit i 3D. Hjul zoomar, dra panorerar."; }
function l3spTile(src, tpl, z, x, y) {
  const key = src + "|" + z + "/" + x + "/" + y; l3sp.tiles = l3sp.tiles || new Map(); l3sp.tq = l3sp.tq || 0; const c = l3sp.tiles.get(key);
  if (c !== undefined) return c && c !== "p" ? c : null; if (l3sp.tq >= 12) return null;
  l3sp.tiles.set(key, "p"); l3sp.tq++;
  l3mapImg(tpl.replace("{z}", z).replace("{x}", x).replace("{y}", y)).then(im => { l3sp.tq--; l3sp.tiles.set(key, im || false); if (l3sp.tiles.size > 480) { const k = l3sp.tiles.keys().next().value; l3sp.tiles.delete(k); } if (im && l3sp.open) { clearTimeout(l3sp.mapT); l3sp.mapT = setTimeout(() => { l3sp.mapRev = (l3sp.mapRev || 0) + 1; l3sp.key = ""; }, 60); } });
  return null;
}
/* Ritar plattorna som täcker panelen. Returnerar true om något underlag ritades (eller väntar på plattor). */
function l3spOrthoSel(src) { const list = l3spOrthoList(); return src === "ortho:*" ? list.filter(o => typeof ls === "function" && ls("ortho:" + o.id).visible) : list.filter(o => "ortho:" + o.id === src); }
/* Projektets egna ortofoton (världsfil: bildpixel → modell). Översiktsbilden, och i full upplösning de rutor som syns när man zoomar in. */
function l3spOrthoDraw(b, r, dpr, src) {
  const list = l3spOrthoSel(src); b.fillStyle = "#cbd5e1"; b.fillRect(0, 0, r.width, r.height); if (!list.length) return true;
  const redraw = () => { clearTimeout(l3sp.mapT); l3sp.mapT = setTimeout(() => { l3sp.mapRev = (l3sp.mapRev || 0) + 1; l3sp.key = ""; }, 60); };
  const mat = w => { const f = (u, v) => l3spToScr(w.A * (u - 0.5) + w.B * (v - 0.5) + w.C, w.D * (u - 0.5) + w.E * (v - 0.5) + w.F), p0 = f(0, 0), p1 = f(1, 0), p2 = f(0, 1); return [p1[0] - p0[0], p1[1] - p0[1], p2[0] - p0[0], p2[1] - p0[1], p0[0], p0[1]]; };
  list.forEach(o => {
    const im = typeof orthoImages !== "undefined" ? orthoImages.get(o.id) : null;
    if (!im) { if (typeof ensureOrthoImage === "function" && !o._spLoading) { o._spLoading = true; ensureOrthoImage(o).then(redraw).catch(() => {}).finally(() => { o._spLoading = false; }); } return; }
    const m = mat(o.world), D = (a, c, d, e, f, g) => b.setTransform(dpr * a, dpr * c, dpr * d, dpr * e, dpr * f, dpr * g); b.save(); b.globalAlpha = typeof layerOpacity === "function" ? layerOpacity("ortho:" + o.id) : 1; b.imageSmoothingQuality = "high";
    D(m[0], m[1], m[2], m[3], m[4], m[5]); b.drawImage(im, 0, 0);
    if (o.tiles && Math.hypot(m[0], m[1]) > 1.25 && typeof loadTile === "function" && typeof tileCache !== "undefined") {   // inzoomat: rutorna i full upplösning
      const t = o.tiles, mf = mat(t.world), inv = (() => { const det = mf[0] * mf[3] - mf[1] * mf[2]; return [mf[3] / det, -mf[1] / det, -mf[2] / det, mf[0] / det, (mf[2] * mf[5] - mf[3] * mf[4]) / det, (mf[1] * mf[4] - mf[0] * mf[5]) / det]; })();
      const cs = [[0, 0], [r.width, 0], [0, r.height], [r.width, r.height]].map(([x, y]) => [inv[0] * x + inv[2] * y + inv[4], inv[1] * x + inv[3] * y + inv[5]]);
      const u0 = Math.max(0, Math.min(...cs.map(q => q[0]))), u1 = Math.min(t.width, Math.max(...cs.map(q => q[0]))), v0 = Math.max(0, Math.min(...cs.map(q => q[1]))), v1 = Math.min(t.height, Math.max(...cs.map(q => q[1])));
      for (let ty = Math.floor(v0 / t.size); ty <= Math.min(t.rows - 1, Math.floor(v1 / t.size)); ty++) for (let tx = Math.floor(u0 / t.size); tx <= Math.min(t.cols - 1, Math.floor(u1 / t.size)); tx++) {
        const path = `${t.prefix}t_${tx}_${ty}.webp`; let e = tileCache.get(path); if (!e) { loadTile(path); e = tileCache.get(path); } const img = e && e.img; if (e) e.used = Date.now();
        if (!img) { if (e && e.promise && !e.spHook) { e.spHook = true; e.promise.then(redraw).catch(() => {}); } continue; }
        D(mf[0], mf[1], mf[2], mf[3], mf[0] * tx * t.size + mf[2] * ty * t.size + mf[4], mf[1] * tx * t.size + mf[3] * ty * t.size + mf[5]); b.drawImage(img, 0, 0);
      }
    }
    b.restore();
  });
  b.setTransform(dpr, 0, 0, dpr, 0, 0); return true;
}
function l3spMapDraw(b, r, dpr) {
  const src = l3spMapSrc(); if (src.startsWith("ortho:")) return l3spOrthoDraw(b, r, dpr, src); if (!src || typeof geodeticToGrid !== "function" || typeof l3mapModelToGeo !== "function" || !l3sp.aff) return false;
  const zone = l3mapZone(), tpl = src === "custom" ? l3mapP("mapUrl", "") : (L3MAP_SRC[src] || [])[1], maxZ = src === "custom" ? 20 : (L3MAP_SRC[src] || [0, 0, 0, 19])[3]; if (!zone || !tpl) return false;
  b.fillStyle = "#cbd5e1"; b.fillRect(0, 0, r.width, r.height);
  const cs = [[0, 0], [r.width, 0], [r.width, r.height], [0, r.height]].map(([sx, sy]) => { const [x, y] = l3spFromScr(sx, sy); return l3mapModelToGeo(x, y, zone); });
  const lats = cs.map(c => c[0]), lons = cs.map(c => c[1]), la0 = Math.min(...lats), la1 = Math.max(...lats), lo0 = Math.min(...lons), lo1 = Math.max(...lons); if (![la0, la1, lo0, lo1].every(Number.isFinite)) return false;
  const [ax, ay] = l3spFromScr(0, 0), [cx2, cy2] = l3spFromScr(100, 0), mpp = Math.hypot(cx2 - ax, cy2 - ay) / 100 || 1;
  let z = Math.max(3, Math.min(maxZ, Math.ceil(Math.log2(156543.03 * Math.cos((la0 + la1) / 2 * Math.PI / 180) / mpp / Math.max(1, dpr * 0.75))) + 1)), tx0, tx1, ty0, ty1;
  for (; z > 3; z--) { tx0 = Math.floor(l3mapTx(lo0, z)); tx1 = Math.floor(l3mapTx(lo1, z)); ty0 = Math.floor(l3mapTy(la1, z)); ty1 = Math.floor(l3mapTy(la0, z)); if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= 110) break; }
  tx0 = Math.floor(l3mapTx(lo0, z)); tx1 = Math.floor(l3mapTx(lo1, z)); ty0 = Math.floor(l3mapTy(la1, z)); ty1 = Math.floor(l3mapTy(la0, z));
  const S = (lat, lon) => { const [mx, my] = l3mapGeoToModel(lat, lon, zone); return l3spToScr(mx, my); };
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    let im = l3spTile(src, tpl, z, tx, ty), sub = null;
    if (!im) { for (let up = 1; up <= 4 && z - up >= 3 && !sub; up++) { const ax = tx >> up, ay = ty >> up, c = l3sp.tiles && l3sp.tiles.get(src + "|" + (z - up) + "/" + ax + "/" + ay); if (c && c !== "p") { const n = 2 ** up, W = c.width || 256, H = c.height || 256; sub = [(tx - ax * n) * W / n, (ty - ay * n) * H / n, W / n, H / n]; im = c; } } if (!sub) continue; }
    const tl = S(l3mapLat(ty, z), l3mapLon(tx, z)), tr = S(l3mapLat(ty, z), l3mapLon(tx + 1, z)), bl = S(l3mapLat(ty + 1, z), l3mapLon(tx, z)), W = im.width || 256, H = im.height || 256;
    const tw = sub ? 256 : W, th = sub ? 256 : H; b.setTransform(dpr * (tr[0] - tl[0]) / tw, dpr * (tr[1] - tl[1]) / tw, dpr * (bl[0] - tl[0]) / th, dpr * (bl[1] - tl[1]) / th, dpr * tl[0], dpr * tl[1]); if (sub) b.drawImage(im, sub[0], sub[1], sub[2], sub[3], 0, 0, 256, 256); else b.drawImage(im, 0, 0);
  }
  b.setTransform(dpr, 0, 0, dpr, 0, 0); return true;
}

/* ---- Skarp PDF (Victor 2026-10-31: "högre upplösning på pdferna och ortofotona") ------------------------------------------------------------
   Den inlästa bilden (högst 2 800 px) räcker för översikten, men tunna linjer blir suddiga vid utzoomning och pixliga vid inzoomning. Så fort vyn stått stilla en
   kort stund ritas därför det som syns om direkt ur PDF:ens vektorer i skärmens egen upplösning (alltid bara panelens storlek – minnet växer inte med zoomen) och läggs
   över den grova bilden. Pågående ritning avbryts när vyn ändras. */
function l3spDetailSchedule(bw, bh, dpr, mapOn) {
  const dt = l3sp.dt; if (!dt || !l3sp.pg) return; clearTimeout(l3sp.dtT); if (l3sp.dtTask) { try { l3sp.dtTask.cancel(); } catch (e) { /* */ } l3sp.dtTask = null; }
  l3sp.dtKey = "";
  const dv = l3sp.dtView, v = l3sp.view;   // den skarpa bilden följer med (flyttas/skalas med CSS) tills den nya är klar – inget blinkande, ingen omritning per bildruta
  if (dv && (dv.bw !== bw || dv.bh !== bh || dv.pid !== l3sp.planId)) { dt.style.visibility = "hidden"; dt.style.transform = ""; l3sp.dtView = null; }
  else if (dv && dt.style.visibility === "visible") { const f = v.k / dv.k; if (f > 0.55 && f < 1.8) { dt.style.transformOrigin = "0 0"; dt.style.transform = `translate(${(v.tx - dv.tx * f).toFixed(2)}px,${(v.ty - dv.ty * f).toFixed(2)}px) scale(${f.toFixed(5)})`; } else { dt.style.visibility = "hidden"; dt.style.transform = ""; } }
  l3sp.dtT = setTimeout(() => l3spDetail(bw, bh, dpr, mapOn), 220);
}
async function l3spDetail(bw, bh, dpr, mapOn) {
  const dt = l3sp.dt, pg = l3sp.pg, im = l3sp.img; if (!dt || !pg || !im || !l3sp.open) return; const v = l3sp.view, key = [v.k.toFixed(5), v.tx.toFixed(1), v.ty.toFixed(1), bw, bh, l3sp.planId].join("|");
  const vpScale = l3sp.vp.scale || 1, s2 = vpScale * v.k * dpr; if (!(s2 > 0)) return;
  const off = l3sp.dtOff || (l3sp.dtOff = document.createElement("canvas")); if (off.width !== bw || off.height !== bh) { off.width = bw; off.height = bh; }
  const c = off.getContext("2d"); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, bw, bh);
  const x0 = v.tx * dpr, y0 = v.ty * dpr, w = im.width * v.k * dpr, h = im.height * v.k * dpr; c.fillStyle = "#fff"; c.fillRect(Math.max(0, x0), Math.max(0, y0), Math.max(0, Math.min(bw, x0 + w) - Math.max(0, x0)), Math.max(0, Math.min(bh, y0 + h) - Math.max(0, y0)));
  let task; try { task = pg.render({ canvasContext: c, viewport: pg.getViewport({ scale: s2, offsetX: x0, offsetY: y0 }) }); } catch (e) { return; }
  l3sp.dtTask = task; l3sp.dtRenders = (l3sp.dtRenders || 0) + 1;
  try { await task.promise; } catch (e) { return; }                         // avbruten: en nyare vy tar över
  if (l3sp.dtTask !== task || !l3sp.open) return; l3sp.dtTask = null;
  const cur = [l3sp.view.k.toFixed(5), l3sp.view.tx.toFixed(1), l3sp.view.ty.toFixed(1), bw, bh, l3sp.planId].join("|"); if (cur !== key) return;   // vyn hann ändras
  if (dt.width !== bw || dt.height !== bh) { dt.width = bw; dt.height = bh; } { const d2 = dt.getContext("2d"); d2.setTransform(1, 0, 0, 1, 0, 0); d2.clearRect(0, 0, bw, bh); d2.drawImage(off, 0, 0); } dt.style.transform = ""; l3sp.dtView = { k: v.k, tx: v.tx, ty: v.ty, bw, bh, pid: l3sp.planId };
  dt.style.mixBlendMode = mapOn ? "multiply" : "normal"; dt.style.opacity = mapOn ? String(l3spPdfOp() / 100) : "1"; dt.style.visibility = "visible"; l3sp.dtKey = key;
  if (mapOn) { l3sp.baseNoPdf = key; l3sp.baseKey = ""; l3sp.key = ""; }   // fotot ritas om utan den grova ritningen
}
