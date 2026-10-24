/* 3D-editorns UI-lyft (Victor 2026-10-23): "exklusivare navigering, smartare och mer genomtänkt … ett lås som jag låser upp
   när jag vill flytta runt knappar, menyer och rutor" (som Tekla/AutoCAD). Följer Designkoncept_3D_editor:
   ljus, luftig nordisk stil med glaspaneler och diskreta blå accenter, få permanenta knappar (ikoner, texten i
   verktygstips), snabbfält som följer markeringen, radialmeny (mittenknappen, ett kort tryck), vykub och sparade
   arbetsytor. Alla funktioner finns kvar – detta lägger bara om, grupperar och gör gränssnittet flyttbart.
   Inställningarna ligger i 3D-prefs under "ui": { locked, labels, order[], hide[], pos{}, palSide, layouts{}, cur }. */

const L3UI_FLOAT = { v3Side: "#v3Side", v3Info: "#v3Info", v3Legend: "#v3Legend", v3NavHelp: "#v3NavHelp", v3Cube: "#v3Cube", v3CtxBar: "#v3CtxBar" };
const L3UI_KEEP = ["v3Close", "v3UiLock", "v3UiLayBtn", "v3More"]; // går inte att dölja
const L3UI_ICO = {
  lock: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  unlock: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 7.5-1.8"/></svg>',
  layout: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="M9.5 4v16M9.5 10h11"/></svg>',
  select: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3l14 7-6 2-2 6z"/></svg>',
  move: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.5-5.8"/><path d="M20 4v5h-5"/></svg>',
  measure: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/></svg>',
  clip: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/></svg>',
  fit: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4"/></svg>',
  cube: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>',
  layers: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
  dup: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  hide: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M10.6 5.1A9.6 9.6 0 0 1 12 5c5 0 8.5 4.2 9.5 7a11 11 0 0 1-2.6 3.8M6.5 6.6A11.5 11.5 0 0 0 2.5 12C3.5 14.8 7 19 12 19c1.4 0 2.7-.3 3.8-.8"/></svg>',
  iso: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>',
  reset: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
  del: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>'
};
const L3UI_PRESETS = {
  standard: { name: "Standard", palSide: "left", pal: true, legend: true, labels: false, hide: [], pos: {} },
  planering: { name: "Planering", palSide: "left", pal: true, legend: true, labels: true, hide: [], pos: {} },
  fokus: { name: "Fokus – bara modellen", palSide: "left", pal: false, legend: false, labels: false, hide: [], pos: {}, navHelp: false },
  granskning: { name: "Granskning", palSide: "right", pal: true, legend: false, labels: false, hide: [], pos: {} }
};

let l3ui = null; // { box, bar, canvas, drag, radial }
const l3UiGet = () => { const u = l3Prefs().ui; return { locked: true, labels: false, order: [], hide: [], pos: {}, palSide: "left", layouts: {}, cur: "standard", ...(u || {}) }; };
function l3UiSave(u) { l3SetPref("ui", u); }
const l3UiKey = el => el.classList.contains("v3-grow") ? "grow" : el.id || ((c => c ? (c.id || "t:" + (c.dataset.v3tool || "")) : "")(el.querySelector("[id],[data-v3tool]")));
const l3UiItems = () => l3ui ? [...l3ui.bar.children].filter(c => c.id !== "v3More" && c.id !== "v3MorePop" && !c.classList.contains("v3-pop")) : [];

/* Kort namn till verktygstipset: texten före första " (", " –" eller ":" i titeln, kortkommandot sist. */
function l3UiTip(b) {
  const t = b.getAttribute("title") || b.dataset.tip0 || ""; if (!t) return;
  b.dataset.tip0 = t; b.removeAttribute("title");
  const m = t.match(/\(([^)]{1,14})\)\s*$/), key = m ? m[1] : "", name = t.replace(/\s*\([^)]*\)\s*$/, "").split(/\s[–—-]\s|:\s/)[0].trim();
  b.dataset.tip = name.length > 38 ? name.slice(0, 36) + "…" : name; if (key) b.dataset.key = key; else delete b.dataset.key;
  if (!b.getAttribute("aria-label")) b.setAttribute("aria-label", name);
}
function l3UiTips() { if (l3ui) l3ui.bar.querySelectorAll("button[title], .v3-seg button[title]").forEach(l3UiTip); }

function l3UiInit(box) {
  if (l3ui) return;
  const bar = box.querySelector(".v3-bar"), canvas = box.querySelector("#v3Canvas");
  l3ui = { box, bar, canvas, drag: null, radial: null };
  box.classList.add("v3-nordic");
  const mk = (tag, id, cls, html) => { const e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  // Lås och layout i raden, före Sök-kommando
  const launch = bar.querySelector("#v3LaunchBtn");
  const lockBtn = mk("button", "v3UiLock", "v3-ghost v3-ui-lock", L3UI_ICO.lock); lockBtn.type = "button"; lockBtn.title = "Lås upp layouten (flytta knappar och rutor)";
  const lay = mk("div", null, "v3-dd");
  const layBtn = mk("button", "v3UiLayBtn", "v3-ghost", L3UI_ICO.layout + "<span>Layout</span>"); layBtn.type = "button"; layBtn.title = "Arbetsytor och layout";
  const layPop = mk("div", "v3UiPop", "v3-pop v3-ui-pop hidden"); lay.append(layBtn, layPop);
  bar.insertBefore(lay, launch); bar.insertBefore(lockBtn, lay);
  const orig = mk("button", "v3Original", "v3-ghost v3-ui-orig", L3UI_ICO.reset + "<span>Original</span>"); orig.type = "button"; orig.title = "Återställ – visa alla modeller i original, utan koppling till tidplan, färger eller filter";
  bar.insertBefore(orig, bar.querySelector("#v3Fit")); orig.onclick = () => l3Original(!(typeof l3b !== "undefined" && l3b.orig));
  lockBtn.onclick = () => l3UiSetLocked(!l3UiGet().locked);
  layBtn.onclick = e => { e.stopPropagation(); const open = layPop.classList.contains("hidden"); l3HideMenus(); if (open) { l3UiPopRender(); layPop.classList.remove("hidden"); } };
  layPop.onclick = e => e.stopPropagation();
  // Banner när layouten är upplåst
  const banner = mk("div", "v3UiBanner", "v3-ui-banner hidden",
    `<span class="v3-ui-dot"></span><b>Layouten är upplåst</b><span class="v3-ui-sub">Dra knappar och rutor · högerklicka en knapp = dölj/visa</span><span class="v3-grow"></span>
     <button type="button" data-uib="save">Spara layout</button><button type="button" data-uib="reset">Återställ</button><button type="button" data-uib="lock" class="v3-ui-go">${L3UI_ICO.lock} Lås</button>`);
  canvas.appendChild(banner);
  banner.onclick = e => { const b = e.target.closest("[data-uib]"); if (!b) return; const a = b.dataset.uib; if (a === "lock") l3UiSetLocked(true); else if (a === "reset") l3UiApplyPreset("standard"); else if (a === "save") l3UiSaveAsPrompt(); };
  // Snabbfält (följer markeringen), vykub
  const ctxbar = mk("div", "v3CtxBar", "v3-ctxbar hidden",
    `<span class="v3-cb-n" id="v3CbN"></span>
     <button type="button" data-cb="t:move" data-tip="Flytta">${L3UI_ICO.move.replace(/22/g, "18")}</button>
     <button type="button" data-cb="t:rotate" data-tip="Vrid">${L3UI_ICO.rotate.replace(/22/g, "18")}</button>
     <i></i>
     <button type="button" data-cb="c:dup" data-tip="Duplicera">${L3UI_ICO.dup}</button>
     <button type="button" data-cb="c:hide" data-tip="Dölj">${L3UI_ICO.hide}</button>
     <button type="button" data-cb="c:iso" data-tip="Visa bara dessa">${L3UI_ICO.iso}</button>
     <button type="button" data-cb="v:sel" data-tip="Zooma hit">${L3UI_ICO.fit.replace(/22/g, "18")}</button>
     <i></i>
     <button type="button" data-cb="c:del" data-tip="Ta bort" class="v3-cb-del">${L3UI_ICO.del}</button>`);
  canvas.appendChild(ctxbar);
  ctxbar.addEventListener("pointerdown", e => e.stopPropagation());
  ctxbar.onclick = e => {
    const b = e.target.closest("[data-cb]"); if (!b) return; const [k, v] = b.dataset.cb.split(":");
    if (k === "t") { const t = box.querySelector(`[data-v3tool="${v}"]`); if (t) t.click(); }
    else if (k === "c") { const c = box.querySelector(`[data-v3cmd="${v}"]`); if (c) c.click(); }
    else if (k === "v") { const c = box.querySelector(`[data-v3view="${v}"]`); if (c) c.click(); }
  };
  const cube = mk("div", "v3Cube", "v3-cube", `<div class="v3-cube-s"><div class="v3-cube-c" id="v3CubeC"></div></div>`);
  const faces = [["top", "TOPP", [0, 0, 1], [0, 1, 0]], ["bot", "UNDER", [0, 0, -1], [0, 1, 0]], ["n", "N", [0, 1, 0], [0, 0, 1]], ["s", "S", [0, -1, 0], [0, 0, 1]], ["e", "Ö", [1, 0, 0], [0, 0, 1]], ["w", "V", [-1, 0, 0], [0, 0, 1]]];
  l3ui.faces = faces.map(([k, t, n, v]) => { const f = mk("button", null, "v3-cube-f f-" + k, t); f.type = "button"; f.dataset.face = k; f.dataset.tip = k === "top" ? "Uppifrån" : k === "bot" ? "" : "Från " + { n: "norr", s: "söder", e: "öster", w: "väster" }[k]; cube.querySelector("#v3CubeC").appendChild(f); return { f, n, v }; });
  cube.addEventListener("pointerdown", e => { if (l3UiGet().locked) e.stopPropagation(); });
  cube.querySelector("#v3CubeC").onclick = e => { const f = e.target.closest("[data-face]"); if (!f || !l3UiGet().locked) return; const k = f.dataset.face; if (k === "bot") return; l3View(k); };
  const home = mk("button", null, "v3-cube-home", L3UI_ICO.iso.replace(/18/g, "14")); home.type = "button"; home.dataset.tip = "3D-översikt"; home.onclick = () => { if (l3UiGet().locked) l3View("iso"); };
  cube.appendChild(home);
  canvas.appendChild(cube);
  l3UiItems().forEach((el, i) => { el.dataset.i0 = i; });
  l3UiTips();
  l3UiTabs(box);
  // Flytt av knappar och rutor (när upplåst) – före allt annat så att inget klick går igenom
  // verktygstips: ett flytande tips som aldrig klipps av raden
  { const tb = mk("div", null, "v3-tipbox"); box.appendChild(tb); let tm = 0;
    const hide = () => { clearTimeout(tm); tb.classList.remove("on"); };
    box.addEventListener("pointerover", e => { const el = e.target.closest && e.target.closest("[data-tip]"); hide(); if (!el || !el.dataset.tip || !l3UiGet().locked || e.pointerType === "touch") return;
      tm = setTimeout(() => { tb.innerHTML = escHtml(el.dataset.tip) + (el.dataset.key ? `<kbd>${escHtml(el.dataset.key)}</kbd>` : ""); const r = el.getBoundingClientRect(), w = tb.offsetWidth, up = !!el.closest(".v3-ctxbar,.v3-cube");
        tb.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width / 2 - w / 2)) + "px"; tb.style.top = (up ? r.top - tb.offsetHeight - 9 : r.bottom + 9) + "px"; tb.classList.add("on"); }, 380); });
    box.addEventListener("pointerdown", hide, true); box.addEventListener("pointerleave", hide); }
  box.addEventListener("pointerdown", l3UiDown, true);
  window.addEventListener("pointermove", l3UiMove);
  window.addEventListener("pointerup", l3UiUp);
  box.addEventListener("click", e => { if (!l3UiGet().locked && l3UiMovable(e.target)) { const t = e.target; if (!t.closest("#v3UiLock,#v3UiBanner,#v3UiPop,#v3UiLayBtn,#v3Close")) { e.stopPropagation(); e.preventDefault(); } } }, true);
  box.addEventListener("contextmenu", e => { if (l3UiGet().locked) return; const it = l3UiBarItem(e.target); if (!it) return; e.preventDefault(); e.stopPropagation(); l3UiToggleHide(it); }, true);
  window.addEventListener("resize", () => { l3UiApplyPos(); });
  l3UiApply();
  l3ui.timer = setInterval(l3UiTick, 350);
}
/* Efter att renderaren finns: vykuben följer kameran. */
function l3UiLate() {
  if (!l3ui || l3ui.late) return; l3ui.late = true;
  l3.orbit.addEventListener("change", l3UiCube);
  l3UiCube();
  // radialmenyn: håll mittenknappen stilla en sekund så kommer den fram vid markören (Victor 2026-10-24)
  const el = l3.renderer.domElement; let md = null; const mdOff = () => { if (md) { clearTimeout(md.t); md = null; } };
  el.addEventListener("pointerdown", e => { mdOff(); if (e.button !== 1 || !l3UiGet().locked) return; const x = e.clientX, y = e.clientY; md = { x, y, t: setTimeout(() => { md = null; l3UiRadial(x, y); }, 1000) }; }, true);
  window.addEventListener("pointermove", e => { if (md && Math.hypot(e.clientX - md.x, e.clientY - md.y) > 4) mdOff(); }, true);
  window.addEventListener("pointerup", e => { if (e.button === 1) mdOff(); }, true);
  window.addEventListener("keydown", e => { if (e.key === "Escape" && l3ui.radial) { l3UiRadialClose(); e.stopPropagation(); } }, true);
}

/* ---------- Vykuben ---------- */
function l3UiCube() {
  if (!l3ui || !l3ui.faces || !l3 || !l3.camera) return;
  const q = l3.camera.getWorldQuaternion(new THREE.Quaternion()).invert(), S = 28; // värld -> vy
  const R = v => { const w = new THREE.Vector3(v[0], v[1], v[2]).applyQuaternion(q); return [w.x, w.y, w.z]; };
  const C = a => [a[0], -a[1], a[2]]; // CSS: y neråt
  for (const { f, n, v } of l3ui.faces) {
    const uw = [v[1] * n[2] - v[2] * n[1], v[2] * n[0] - v[0] * n[2], v[0] * n[1] - v[1] * n[0]];
    const u = C(R(uw)), d = C(R(v)).map(x => -x), nn = C(R(n)), t = nn.map(x => x * S);
    f.style.transform = `matrix3d(${u[0]},${u[1]},${u[2]},0,${d[0]},${d[1]},${d[2]},0,${nn[0]},${nn[1]},${nn[2]},0,${t[0]},${t[1]},${t[2]},1)`;
    f.classList.toggle("back", nn[2] < 0.12);
  }
}

/* ---------- Snabbfältet ---------- */
function l3UiTick() {
  if (!l3ui || !l3 || !l3ui.box || l3ui.box.classList.contains("hidden")) return;
  const bar = l3ui.canvas.querySelector("#v3CtxBar"); if (!bar) return;
  const n = l3.sel ? l3.sel.size : 0, show = n > 0 && l3UiGet().locked;
  bar.classList.toggle("hidden", !show); l3ui.box.classList.toggle("v3-has-sel", show);
  const c = bar.querySelector("#v3CbN"); if (c) c.textContent = n > 1 ? n + " valda" : "1 vald";
}

/* ---------- Radialmenyn ---------- */
function l3UiRadial(x, y) {
  l3UiRadialClose();
  const items = [["t:select", "Välj", "select"], ["t:move", "Flytta", "move"], ["t:rotate", "Vrid", "rotate"], ["t:measure", "Mät", "measure"], ["b:v3ClipBtn", "Snitt", "clip"], ["v:iso", "Översikt", "fit"], ["b:v3ViewsBtn", "Vyer", "cube"], ["p:pal", "Lager", "layers"]];
  const r = document.createElement("div"); r.className = "v3-radial"; const R = 86;
  const cr = l3ui.box.getBoundingClientRect(), cx = Math.min(Math.max(x, cr.left + R + 40), cr.right - R - 40), cy = Math.min(Math.max(y, cr.top + R + 40), cr.bottom - R - 40);
  r.style.left = cx + "px"; r.style.top = cy + "px";
  r.innerHTML = `<div class="v3-rad-core"><b></b></div>` + items.map(([k, t, ic], i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / items.length; return `<button type="button" class="v3-rad-i" data-r="${k}" data-t="${t}" style="--dx:${Math.round(Math.cos(a) * R)}px;--dy:${Math.round(Math.sin(a) * R)}px;--i:${i}">${L3UI_ICO[ic]}</button>`; }).join("");
  document.body.appendChild(r); l3ui.radial = r;
  const label = r.querySelector(".v3-rad-core b");
  r.addEventListener("pointerover", e => { const b = e.target.closest(".v3-rad-i"); label.textContent = b ? b.dataset.t : ""; });
  r.addEventListener("pointerdown", e => e.stopPropagation());
  r.addEventListener("click", e => {
    const b = e.target.closest(".v3-rad-i"); if (!b) { l3UiRadialClose(); return; }
    const [k, v] = b.dataset.r.split(":"); l3UiRadialClose();
    if (k === "t") { const t = l3ui.box.querySelector(`[data-v3tool="${v}"]`); if (t) t.click(); }
    else if (k === "b") { const t = l3ui.box.querySelector("#" + v); if (t) t.click(); }
    else if (k === "v") { if (v === "iso") l3View("iso"); }
    else if (k === "p") { const c = l3ui.box.querySelector("#v3PalChk"); if (c) { c.checked = !c.checked; c.dispatchEvent(new Event("change")); } }
  });
  setTimeout(() => { l3ui.radialOff = e => { if (l3ui.radial && !e.target.closest(".v3-radial")) l3UiRadialClose(); }; window.addEventListener("pointerdown", l3ui.radialOff, true); }, 0);
}
function l3UiRadialClose() {
  if (!l3ui || !l3ui.radial) return;
  const r = l3ui.radial; l3ui.radial = null; r.classList.add("out"); setTimeout(() => r.remove(), 140);
  if (l3ui.radialOff) { window.removeEventListener("pointerdown", l3ui.radialOff, true); l3ui.radialOff = null; }
}

/* ---------- Låst / upplåst ---------- */
function l3UiSetLocked(lock) {
  const u = l3UiGet(); u.locked = !!lock; l3UiSave(u);
  l3UiApply();
  if (typeof l3Toast === "function") l3Toast(lock ? "Layouten låst" : "Layouten upplåst – dra knappar och rutor");
}
function l3UiMovable(t) { return !!(t && t.closest && (l3UiBarItem(t) || t.closest(Object.values(L3UI_FLOAT).join(",") + ",#v3Pal"))); }
function l3UiBarItem(t) {
  if (!l3ui || !t || !t.closest) return null; const bar = t.closest(".v3-bar"); if (bar !== l3ui.bar) return null;
  let c = t; while (c && c.parentElement !== bar) c = c.parentElement;
  if (!c || c.id === "v3More" || c.id === "v3MorePop" || c.id === "v3UiLock" || c.id === "v3UiBanner" || c.closest("#v3UiPop")) return null;
  return c;
}
function l3UiApply() {
  if (!l3ui) return;
  const u = l3UiGet(), box = l3ui.box, bar = l3ui.bar;
  box.classList.toggle("v3-unlocked", !u.locked);
  box.classList.toggle("v3-ui-labels", !!u.labels);
  box.classList.toggle("v3-pal-r", u.palSide === "right");
  const lb = box.querySelector("#v3UiLock"); if (lb) { lb.innerHTML = u.locked ? L3UI_ICO.lock : L3UI_ICO.unlock; lb.classList.toggle("open", !u.locked); lb.dataset.tip = u.locked ? "Lås upp layouten" : "Lås layouten"; lb.removeAttribute("title"); }
  const bn = box.querySelector("#v3UiBanner"); if (bn) bn.classList.toggle("hidden", u.locked);
  // ordning och dolda knappar
  const items = l3UiItems(), more = bar.querySelector("#v3More"), keys = new Map(items.map(el => [l3UiKey(el), el]));
  if (u.order.length) {
    const seq = []; u.order.forEach(k => { if (keys.has(k)) { seq.push(keys.get(k)); keys.delete(k); } }); keys.forEach(el => seq.push(el));
    seq.forEach(el => bar.insertBefore(el, more || null));
  }
  items.forEach(el => { const k = l3UiKey(el); el.classList.toggle("v3-ui-off", u.hide.includes(k) && !L3UI_KEEP.includes(k)); });
  l3UiTips();
  l3UiApplyPos();
  if (l3 && typeof l3BarFit === "function") setTimeout(l3BarFit, 0);
  if (l3 && typeof l3Resize === "function") setTimeout(l3Resize, 30);
}
function l3UiApplyPos() {
  if (!l3ui) return; const u = l3UiGet(), cv = l3ui.canvas, W = cv.clientWidth, H = cv.clientHeight;
  if (window.innerWidth < 700 || !W) { Object.keys(L3UI_FLOAT).forEach(id => { const el = cv.querySelector(L3UI_FLOAT[id]); if (el) { el.style.left = el.style.top = el.style.right = el.style.bottom = ""; } }); return; }
  for (const id of Object.keys(L3UI_FLOAT)) {
    const el = cv.querySelector(L3UI_FLOAT[id]); if (!el) continue; const p = u.pos[id];
    el.classList.toggle("v3-moved", !!p);
    if (!p) { el.style.left = el.style.top = el.style.right = el.style.bottom = ""; continue; }
    const w = el.offsetWidth || 60, h = el.offsetHeight || 40;
    el.style.left = Math.max(0, Math.min(W - Math.min(w, W), p.fx * W)) + "px"; el.style.top = Math.max(0, Math.min(H - Math.min(h, H), p.fy * H)) + "px";
    el.style.right = "auto"; el.style.bottom = "auto";
  }
}
function l3UiToggleHide(it) {
  const k = l3UiKey(it); if (!k || L3UI_KEEP.includes(k)) return; const u = l3UiGet(), i = u.hide.indexOf(k);
  if (i < 0) u.hide.push(k); else u.hide.splice(i, 1);
  l3UiSave(u); it.classList.toggle("v3-ui-off", i < 0); if (typeof l3BarFit === "function") l3BarFit();
}

/* ---------- Dra i upplåst läge ---------- */
function l3UiDown(e) {
  if (!l3ui || l3UiGet().locked || e.button !== 0) return;
  const t = e.target; if (t.closest("#v3UiLock,#v3UiBanner,#v3UiPop,#v3UiLayBtn,.v3-pop")) return;
  const it = l3UiBarItem(t);
  if (it) { e.preventDefault(); e.stopPropagation(); l3ui.drag = { kind: "bar", el: it, x: e.clientX, y: e.clientY, moved: false }; it.classList.add("v3-ui-lift"); return; }
  const fl = Object.keys(L3UI_FLOAT).find(k => { const el = l3ui.canvas.querySelector(L3UI_FLOAT[k]); return el && el.contains(t) && !el.classList.contains("hidden"); });
  if (fl) {
    e.preventDefault(); e.stopPropagation(); const el = l3ui.canvas.querySelector(L3UI_FLOAT[fl]), r = el.getBoundingClientRect(), cr = l3ui.canvas.getBoundingClientRect();
    l3ui.drag = { kind: "float", id: fl, el, ox: e.clientX - r.left, oy: e.clientY - r.top, cr, moved: false }; el.classList.add("v3-ui-lift"); return;
  }
  const pal = t.closest("#v3Pal");
  if (pal && !t.closest("button,a,label,.v3-lay-row")) { e.preventDefault(); e.stopPropagation(); l3ui.drag = { kind: "pal", el: pal, x: e.clientX, moved: false }; pal.classList.add("v3-ui-lift"); }
}
function l3UiMove(e) {
  const d = l3ui && l3ui.drag; if (!d) return;
  if (d.kind === "bar") {
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true; if (!d.moved) return;
    const sibs = l3UiItems().filter(s => s !== d.el && s.offsetWidth && !s.classList.contains("v3-grow"));
    const over = sibs.find(s => { const r = s.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 12 && e.clientY <= r.bottom + 12; });
    if (over) { const r = over.getBoundingClientRect(), before = e.clientX < r.left + r.width / 2; l3ui.bar.insertBefore(d.el, before ? over : over.nextSibling); }
  } else if (d.kind === "float") {
    d.moved = true; const cr = l3ui.canvas.getBoundingClientRect(), el = d.el, W = cr.width, H = cr.height;
    const l = Math.max(0, Math.min(W - el.offsetWidth, e.clientX - cr.left - d.ox)), t = Math.max(0, Math.min(H - el.offsetHeight, e.clientY - cr.top - d.oy));
    el.style.left = l + "px"; el.style.top = t + "px"; el.style.right = "auto"; el.style.bottom = "auto"; el.classList.add("v3-moved");
    const sn = 14; // magnetiska kanter
    if (l < sn) el.style.left = "8px"; if (t < sn) el.style.top = "8px";
  } else if (d.kind === "pal") {
    d.moved = true; const r = l3ui.box.getBoundingClientRect(), right = e.clientX > r.left + r.width / 2; l3ui.box.classList.toggle("v3-pal-r", right); d.right = right;
  }
}
function l3UiUp() {
  const d = l3ui && l3ui.drag; if (!d) return; l3ui.drag = null; d.el.classList.remove("v3-ui-lift");
  if (!d.moved) return; const u = l3UiGet();
  if (d.kind === "bar") { u.order = l3UiItems().map(l3UiKey); if (typeof l3BarFit === "function") l3BarFit(); }
  else if (d.kind === "float") { const cr = l3ui.canvas.getBoundingClientRect(), r = d.el.getBoundingClientRect(); u.pos[d.id] = { fx: Math.round((r.left - cr.left) / cr.width * 1000) / 1000, fy: Math.round((r.top - cr.top) / cr.height * 1000) / 1000 }; }
  else if (d.kind === "pal") { u.palSide = d.right ? "right" : "left"; if (typeof l3Resize === "function") setTimeout(l3Resize, 30); }
  u.cur = ""; l3UiSave(u);
}

/* ---------- Arbetsytor (sparade layouter) ---------- */
function l3UiSnapshot() {
  const u = l3UiGet(), P = l3Prefs();
  return { palSide: u.palSide, pal: P.pal !== false, legend: !!P.legend, labels: !!u.labels, hide: [...u.hide], order: [...u.order], pos: JSON.parse(JSON.stringify(u.pos)), navHelp: P.navHelp !== false };
}
function l3UiApplyLayout(L, name) {
  const u = l3UiGet(); u.palSide = L.palSide || "left"; u.labels = !!L.labels; u.hide = [...(L.hide || [])]; u.order = [...(L.order || [])]; u.pos = JSON.parse(JSON.stringify(L.pos || {})); u.cur = name || ""; l3UiSave(u);
  const box = l3ui.box, chk = (id, on) => { const c = box.querySelector("#" + id); if (c && on !== undefined && c.checked !== !!on) { c.checked = !!on; c.dispatchEvent(new Event("change")); } };
  chk("v3PalChk", L.pal); chk("v3LegendChk", L.legend);
  if (L.navHelp !== undefined && (l3Prefs().navHelp !== false) !== !!L.navHelp) { l3SetPref("navHelp", !!L.navHelp); if (typeof l3NavHelp === "function") l3NavHelp(); }
  // ingen sparad ordning = originalordningen: ladda om från standardordning genom att sortera efter ursprungsindex
  if (!u.order.length) { const items = l3UiItems(); items.sort((a, b) => (+a.dataset.i0 || 0) - (+b.dataset.i0 || 0)); const more = l3ui.bar.querySelector("#v3More"); items.forEach(el => l3ui.bar.insertBefore(el, more || null)); }
  l3UiApply(); l3UiPopRender();
}
function l3UiApplyPreset(k) { const P = L3UI_PRESETS[k]; if (!P) return; l3UiApplyLayout(P, k); if (typeof l3Toast === "function") l3Toast("Arbetsyta: " + P.name); }
function l3UiSaveAs(name) {
  name = String(name || "").trim().slice(0, 30); if (!name) return false; const u = l3UiGet();
  u.layouts[name] = l3UiSnapshot(); u.cur = "u:" + name; l3UiSave(u); l3UiPopRender(); if (typeof l3Toast === "function") l3Toast("Layouten ”" + name + "” sparad"); return true;
}
function l3UiSaveAsPrompt() { const pop = l3ui.box.querySelector("#v3UiPop"); l3HideMenus(); l3UiPopRender(); pop.classList.remove("hidden"); const i = pop.querySelector("#v3UiName"); if (i) i.focus(); }
function l3UiPopRender() {
  const pop = l3ui && l3ui.box.querySelector("#v3UiPop"); if (!pop) return; const u = l3UiGet();
  const row = (k, name, on, del) => `<div class="v3-ui-row${on ? " on" : ""}"><button type="button" data-ul="${k}">${name}</button>${del ? `<button type="button" class="v3-ui-x" data-ud="${escHtml(del)}" aria-label="Ta bort">✕</button>` : ""}</div>`;
  const cur = u.cur || "";
  pop.innerHTML = `<div class="v3-pop-l">Arbetsytor</div>
    ${Object.keys(L3UI_PRESETS).map(k => row("p:" + k, L3UI_PRESETS[k].name, cur === k)).join("")}
    ${Object.keys(u.layouts).map(n => row("u:" + escHtml(n), escHtml(n), cur === "u:" + n, n)).join("")}
    <div class="v3-sv-new"><input type="text" id="v3UiName" placeholder="Spara nuvarande som…" maxlength="30" /><button type="button" id="v3UiSave">Spara</button></div>
    <hr/>
    <label class="v3-chk"><input type="checkbox" id="v3UiLabels" ${u.labels ? "checked" : ""}/> Knapptexter</label>
    <label class="v3-chk"><input type="checkbox" id="v3UiPalR" ${u.palSide === "right" ? "checked" : ""}/> Panelen till höger</label>
    <button type="button" class="v3-wide" id="v3UiUnlock">${u.locked ? L3UI_ICO.unlock + " Lås upp layouten" : L3UI_ICO.lock + " Lås layouten"}</button>`;
  pop.querySelectorAll("[data-ul]").forEach(b => b.onclick = () => { const [t, k] = [b.dataset.ul.slice(0, 1), b.dataset.ul.slice(2)]; if (t === "p") l3UiApplyPreset(k); else { const L = u.layouts[k.replace(/&amp;/g, "&")] || u.layouts[k]; if (L) { l3UiApplyLayout(L, "u:" + k); if (typeof l3Toast === "function") l3Toast("Arbetsyta: " + k); } } });
  pop.querySelectorAll("[data-ud]").forEach(b => b.onclick = e => { e.stopPropagation(); const uu = l3UiGet(); delete uu.layouts[b.dataset.ud]; if (uu.cur === "u:" + b.dataset.ud) uu.cur = ""; l3UiSave(uu); l3UiPopRender(); });
  const inp = pop.querySelector("#v3UiName"); pop.querySelector("#v3UiSave").onclick = () => l3UiSaveAs(inp.value);
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); l3UiSaveAs(inp.value); } };
  pop.querySelector("#v3UiLabels").onchange = e => { const uu = l3UiGet(); uu.labels = e.target.checked; l3UiSave(uu); l3UiApply(); };
  pop.querySelector("#v3UiPalR").onchange = e => { const uu = l3UiGet(); uu.palSide = e.target.checked ? "right" : "left"; l3UiSave(uu); l3UiApply(); };
  pop.querySelector("#v3UiUnlock").onclick = () => { l3HideMenus(); l3UiSetLocked(!l3UiGet().locked); };
}

/* Panelflikarna som ikoner (texten i verktygstipset och som rubrik över innehållet). */
const L3UI_TABS = {
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>', props: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  groups: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>', comments: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  add: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>', plan: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'
};
function l3UiTabs(box) {
  const tabs = [...box.querySelectorAll("[data-paltab]")]; if (!tabs.length) return;
  const head = box.querySelector(".v3-pal-head"), title = document.createElement("div"); title.className = "v3-pal-title"; title.id = "v3PalTitle"; head.after(title);
  tabs.forEach(b => { const k = b.dataset.paltab, name = b.textContent.trim(); b.dataset.name = name; b.dataset.tip = name; b.setAttribute("aria-label", name); b.removeAttribute("title");
    b.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${L3UI_TABS[k] || L3UI_TABS.layers}</svg>`; });
  const sync = () => { const on = tabs.find(b => b.classList.contains("on")); const n = on ? on.dataset.name : ""; if (title.textContent !== n) { title.textContent = n; title.classList.remove("pop"); void title.offsetWidth; title.classList.add("pop"); } };
  const mo = new MutationObserver(sync); tabs.forEach(b => mo.observe(b, { attributes: true, attributeFilter: ["class"] })); sync();
}

/* Återställ till original (Victor 2026-10-24: "så att jag ser alla modeller i original utan någon koppling till tidplan eller liknande"):
   alla modeller visas med sina egna färger – inget dolt, inget färgat efter status, egenskap, färgskala eller tillfälligt, ingen
   Gantt-filtrering och inga bubblor/konturer. Läget ligger kvar tills man trycker ✕ i pillret (då gäller 4D-färgerna igen). */
function l3Original(on) {
  if (!l3 || typeof l3b === "undefined") return;
  if (!on) { l3b.orig = false; if (typeof l3bRecolor === "function") l3bRecolor(); l3Render(); l3UiOrigPill(); if (typeof l3Status === "function") l3Status("Tillbaka till 4D-färgerna."); return; }
  l3b.orig = true;
  try {
    if (typeof l3gmSetMode === "function" && l3gm.mode !== "off") l3gmSetMode("off", true);
    if (typeof l3gmSet === "function") { l3gmSet("scale", false); l3gmSet("pulse", false); l3gmSet("selAct", false); }
    if (typeof l3pColorOff === "function" && l3p.colorBy) l3p.colorBy = null;
    l3b.models.forEach(m => m.meshes.forEach(x => { const u = x.userData.l3b; if (u.tint) u.tint.clear(); if (u.alpha) u.alpha.clear(); }));
    if (typeof l3plSet === "function") { l3plSet("lf", {}); }
    if (typeof l3SetPref === "function") { l3SetPref("bubOn", false); l3SetPref("actOutline", false); }
    if (typeof l3ShowAll0 === "function") l3ShowAll0();
    l3b.models.forEach(m => { if (!m.visible && typeof l3bShow === "function") l3bShow(m.id, true); m.meshes.forEach(x => { if (typeof l3bApplyHidden === "function") l3bApplyHidden(x); }); });
    if (typeof l3bsClear === "function") l3bsClear();
    if (typeof l3plDockRender === "function") l3plDockRender();
    if (typeof l3plRenderTab === "function") l3plRenderTab();
    if (typeof l3RenderLabels === "function") l3RenderLabels();
  } catch (e) { console.warn("Återställ", e); }
  if (typeof l3bRecolor === "function") l3bRecolor();
  if (typeof l3RenderLegend === "function") l3RenderLegend();
  l3Render(); l3UiOrigPill();
  if (typeof l3Status === "function") l3Status("Alla modeller visas i original – utan tidplan, färger eller filter.");
}
function l3UiOrigPill() {
  if (!l3ui) return; let p = l3ui.canvas.querySelector("#v3OrigPill");
  const on = !!(typeof l3b !== "undefined" && l3b.orig);
  const btn = l3ui.box.querySelector("#v3Original"); if (btn) btn.classList.toggle("on", on);
  if (!on) { if (p) p.remove(); return; }
  if (!p) { p = document.createElement("div"); p.id = "v3OrigPill"; p.className = "v3-orig-pill"; l3ui.canvas.appendChild(p); p.addEventListener("pointerdown", e => e.stopPropagation()); p.onclick = e => { if (e.target.closest("[data-orig-off]")) l3Original(false); }; }
  p.innerHTML = `<span class="v3-ui-dot"></span><b>Originalvy</b><span class="v3-ui-sub">modellerna utan tidplan och filter</span><button type="button" data-orig-off="1" aria-label="Tillbaka till 4D-färgerna" title="Tillbaka till 4D-färgerna">✕</button>`;
}
