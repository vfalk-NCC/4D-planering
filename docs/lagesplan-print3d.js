/* Utskriftslayouten: 3D-vy (Victor 2026-10-27: "kunna göra en 3D-vy i utskriftslayouten där jag kan snurra runt och ställa in som en
   utskrift – ungefär som SketchUp Layout", och välja bland de sparade vyerna i 3D-editorn).

   Elementet "3D-vy" är en bild av 3D-scenen sedd från en sparad kamera (el.view = en vy som i 3D-editorns Vyer: kamera, projektion, snitt, dolda
   objekt). Bilden ritas av 3D-editorns egen renderare i elementets bildförhållande och bäddas in i PDF:en som skarp bild.

   – ✥ Ställ in vyn: 3D-editorn visas med en ram i elementets bildförhållande (det du ser i ramen är det som hamnar på bladet). Snurra,
     zooma och byt perspektiv/parallell som vanligt, välj eventuellt en sparad vy att utgå från, och tryck Använd vyn.
   – Sparad vy: välj en av 3D-editorns vyer direkt i elementets egenskaper. Med "Följ vyn" uppdateras bladet när vyn sparas om i 3D (som
     scener i SketchUp Layout).
   – 3D-scenen måste vara inläst (3D-editorn har öppnats i den här sessionen); annars läses den in vid behov.

   Renderaren används delad: kameran, snitt och dolda objekt sätts för en bild och återställs efteråt. */

const p3d = { cache: new Map(), queue: Promise.resolve(), pend: new Map(), picking: null, warm: null };
const p3dReady = () => typeof l3 !== "undefined" && !!l3 && !!l3.renderer;
const p3dSaved = () => (typeof l3SavedViews === "function" ? l3SavedViews() : []);
let p3dViewsAsked = false;   // projektets delade vyer läses första gången egenskaperna visas
/* Vyn som elementet visar: den sparade vyn med samma namn om elementet följer en, annars elementets egen kopia. */
function p3dResolve(el) {
  if (el.viewRef) { const v = p3dSaved().find(x => x.name === el.viewRef); if (v) return v; }
  return el.view || null;
}
const p3dDate = el => el.date || ((typeof $ === "function" && $("dateInput")) ? $("dateInput").value : "");
const p3dOpts = (el, hMm) => ({ date: el.date || "", white: el.bg3d === "white", bub: el.bub || "", bubF: el.bubF, bubNoLine: !!el.bubNoLine, bubNeutral: !!el.bubNeutral, bubMax: el.bubMax, bubSize: el.bubSize, hMm: hMm || p3dHmm(el) });
function p3dKey(el, v, W, H) {
  if (!v) return "";
  return JSON.stringify([v.p, v.t, v.ortho, v.zoom, v.clips, v.meas, v.models, v.hid && [(v.hid.guids || []).length, (v.hid.place || []).length, (v.hid.objs || []).length], v.clouds, el.bg3d || "", el.bub || "", JSON.stringify(el.bubF || ""), el.bubNoLine, el.bubNeutral, typeof l3bo !== "undefined" && l3bo.list ? l3bo.list.length + ":" + l3bo.list.map(x => (x.note || "").length + (x.off ? "o" : "") + (x.on ? "p" : "")).join("") : 0, el.bubMax || 0, el.bubSize || 100, p3dDate(el), W, H]);
}

/* Skala (parallellprojektion): bladets mm per modellmeter. Synlig höjd i modellen = L3_ORTHO_H / zoom; elementets höjd på papperet = el.h × k mm.
   Perspektiv har ingen entydig skala. */
const p3dHmm = el => Math.abs(el.h) * (typeof pageDims === "function" ? pageDims().k : 1);
const p3dScaleOfZoom = (zoom, el) => (zoom > 0 && p3dHmm(el) > 0 ? Math.round(L3_ORTHO_H / zoom * 1000 / p3dHmm(el)) : null);
const p3dZoomOfScale = (n, el) => L3_ORTHO_H * 1000 / (n * p3dHmm(el));
function p3dScaleOf(el) { const v = p3dResolve(el); return v && v.ortho ? p3dScaleOfZoom(v.zoom || 1, el) : null; }
const p3dNiceScale = n => (typeof nearestScale === "function" ? nearestScale(n) : n);

/* En vy direkt (utan flygning) – samma som l3GoView i 3D-editorn. ms > 0 flyger dit. */
function p3dApplyView(v, ms = 0) {
  const O = l3.O, S = a => new THREE.Vector3(a[0] - O[0], a[1] - O[1], a[2] - O[2]);
  l3StopFly();
  if (l3IsOrtho() !== !!v.ortho) l3SetProjection(!!v.ortho);
  const T = S(v.t), P = S(v.p), dir = P.clone().sub(T);
  const dist = v.ortho ? L3_ORTHO_H / (Math.max(1e-4, v.zoom || 1) * 2 * Math.tan(THREE.MathUtils.degToRad(25))) : dir.length();
  l3.clips = (v.clips || []).map(c => { const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(...c.n), S(c.p)); return { plane, base: Number.isFinite(c.base) ? c.base : plane.constant, off: Number.isFinite(c.off) ? c.off : 0, anchor: c.a ? S(c.a) : undefined, label: c.label }; });
  l3ViewApplyState(v);
  l3ApplyClips();
  l3FlyTo(T, dist, dir, ms);
}

/* Datumet 3D-scenen visar (statusfärger på objekten, etablering, bubblor). Ändrar bara datumfältet – inget annat i lägesplanen rörs. */
function p3dSetDate(iso) {
  $("dateInput").value = iso;
  l3BuildObjects(); if (typeof l3bRecolor === "function") l3bRecolor(); if (typeof l3Etab4dAll === "function") l3Etab4dAll(); if (typeof l3StorageBuild === "function") l3StorageBuild();
}
/* Bilden: W×H px. o.white = vit bakgrund. Returnerar en canvas (eller null om 3D inte är inläst). */
function p3dRenderNow(view, W, H, o = {}) {
  if (!p3dReady() || !view || p3d.live) return null;   // renderaren används av den levande vyn
  const R = l3.renderer, pr0 = R.getPixelRatio(), cur = l3MakeView("_nu"), bg0 = l3.scene.background, date0 = $("dateInput").value;
  let out = null;
  try {
    if (o.date && o.date !== date0) p3dSetDate(o.date);   // eget datum: statusfärger, etablering och bubblor räknas för det datumet
    p3dApplyView(view, 0);
    R.setPixelRatio(1); R.setSize(W, H, false);
    const cam = l3.camera;
    if (cam.isOrthographicCamera) { const h = cam.top - cam.bottom; cam.left = -h * W / H / 2; cam.right = h * W / H / 2; } else cam.aspect = W / H;
    cam.updateProjectionMatrix();
    if (o.white) l3.scene.background = new THREE.Color(0xffffff);
    if (typeof l3pcRenderScene === "function") l3pcRenderScene(); else R.render(l3.scene, cam);
    out = document.createElement("canvas"); out.width = W; out.height = H;
    out.getContext("2d").drawImage(R.domElement, 0, 0, W, H);
    // Bubblor med framdrift (3D-editorns egna): urval efter datum, samma innehåll som i 3D-vyn och filmen. Storleken följer bladet (texthöjd ca 2,6 mm).
    p3dDrawBubbles(out.getContext("2d"), W, H, o);
  } catch (e) { console.warn("3D-vy i utskriften", e); out = null; }
  finally {
    l3.scene.background = bg0;
    if (o.date && o.date !== date0) { try { p3dSetDate(date0); } catch (e) { /* */ } }
    try { p3dApplyView(cur, 0); } catch (e) { /* kameran står kvar */ }
    R.setPixelRatio(pr0); l3Resize(); if (typeof l3Render === "function") l3Render();
  }
  return out;
}
/* En i taget (delad renderare). */
function p3dRender(view, W, H, o = {}) {
  const run = p3d.queue.then(() => p3dRenderNow(view, W, H, o));
  p3d.queue = run.catch(() => {});
  return run;
}
/* Förhandsvisningen i layouten: senaste bilden direkt, ny ritas i bakgrunden när något ändrats. */
function p3dPreview(el, wPx, hPx) {
  const v = p3dResolve(el);
  if (!v || p3d.picking) return (p3d.cache.get(el.id) || {}).canvas || null;
  const W = Math.max(64, Math.min(1600, Math.round(wPx))), H = Math.max(48, Math.round(W * hPx / Math.max(1, wPx))), key = p3dKey(el, v, W, H), hit = p3d.cache.get(el.id);
  if ((!hit || hit.key !== key) && p3d.pend.get(el.id) !== key && p3dReady()) {
    p3d.pend.set(el.id, key);
    clearTimeout(p3dPreview.t && p3dPreview.t[el.id]);
    (p3dPreview.t = p3dPreview.t || {})[el.id] = setTimeout(async () => {
      if (typeof pr === "undefined" || !pr) return;
      const c = await p3dRender(v, W, H, p3dOpts(el));
      if (p3d.pend.get(el.id) === key) { p3d.pend.delete(el.id); if (c) p3d.cache.set(el.id, { key, canvas: c }); }
      if (typeof pr !== "undefined" && pr) drawPrintPage();
    }, 200);
  }
  return hit ? hit.canvas : null;
}
/* Skarp bild till PDF:en. */
async function p3dForPdf(el, wMm, hMm) {
  if (p3d.live) p3dLiveEnd(true);   // renderaren ska vara tillbaka i 3D-editorn
  const v = p3dResolve(el); if (!v) return null;
  if (!p3dReady()) await p3dWarm();
  const px = Math.min(3600, Math.round(Math.max(wMm, hMm) / 25.4 * 250)), k = px / Math.max(wMm, hMm);
  return p3dRender(v, Math.max(64, Math.round(wMm * k)), Math.max(48, Math.round(hMm * k)), p3dOpts(el, hMm));
}
/* Läser in 3D-scenen (modeller m.m.) utan att lämna layouten: 3D-editorn öppnas och stängs direkt. */
function p3dWarm() {
  if (p3dReady()) return Promise.resolve();
  if (p3d.warm) return p3d.warm;
  p3d.warm = (async () => {
    try { setPrintStatus("Läser in 3D-modellerna …"); await open3d(); if (p3dReady()) close3d(); }
    catch (e) { console.warn("Kunde inte läsa in 3D", e); }
    finally { p3d.warm = null; }
  })();
  return p3d.warm;
}

/* ---- Ställ in vyn: 3D-editorn med en ram i elementets bildförhållande ------------------------------------------------------------------- */
/* ---- Levande vy i layouten (Victor 2026-10-27: "låt den aktivera viewporten i stället för att öppna ett nytt fönster så att jag ser
   exakt hur det kommer se ut i utskriftslayouten") ---------------------------------------------------------------------------
   3D-editorns renderare flyttas till en ruta precis ovanpå 3D-vy-elementet i layouten. Där snurrar, zoomar och panorerar man direkt;
   bubblor, datum/skala och ram ritas ovanpå som på bladet. Inställningarna (skala, rikta mot yta, snittdjup, sparad vy) ligger i
   sidomenyn. Klar sparar kameran i elementet (Esc eller klick utanför rutan gör detsamma), Avbryt kastar ändringarna. */
const p3dCutOf = v => { const cl = (v && v.clips) || []; const i = cl.findIndex(c => c.label === "Sektionsvy"); return i >= 0 ? i : cl.length ? 0 : -1; };
function p3dDrawBubbles(ctx, W, H, o) {
  if (!o.bub || typeof l3fxBubbles !== "function") return;
  const P = l3Prefs(), old = [P.bubScope, P.bubMax, P.bubFields, P.bubLine, P.bubNeutral]; P.bubScope = o.bub; P.bubMax = o.bubMax || 15;
  if (o.bubF) P.bubFields = { ...(P.bubFields || {}), ...o.bubF }; P.bubLine = !o.bubNoLine; P.bubNeutral = !!o.bubNeutral;
  try { const mmH = o.hMm || 100; l3fxBubbles(ctx, W, H, (H / mmH) * 2.6 / 16.25 * ((o.bubSize || 100) / 100)); }
  catch (e) { console.warn("Bubblor i 3D-vyn", e); }
  finally { P.bubScope = old[0]; P.bubMax = old[1]; P.bubFields = old[2]; P.bubLine = old[3]; P.bubNeutral = old[4]; }
}
async function p3dPick(el) {
  if (p3d.live) { if (p3d.live.el === el) return; p3dLiveEnd(true); }
  if (!plan || !plan.calib) { uiAlert("Arbetsytan måste vara kalibrerad mot 3D-modellen för att 3D-vyn ska fungera."); return; }
  if (!p3dReady()) await p3dWarm();
  if (!p3dReady()) { uiAlert("3D-vyn kunde inte läsas in."); return; }
  if (typeof l3vLoad === "function") { try { await l3vLoad(); } catch (e) { /* lokala vyer räcker */ } }
  const wrap = $("prCanvasWrap"), dom = l3.renderer.domElement;
  const live = { el, prev: { view: l3MakeView("_nu"), bg: l3.scene.background, date: $("dateInput").value, parent: dom.parentNode, next: dom.nextSibling }, sig: "", w: 0, h: 0 };
  const saved = p3dResolve(el);
  if (saved) p3dApplyView(saved, 0);
  if (el.date) p3dSetDate(el.date);
  if (el.bg3d === "white") l3.scene.background = new THREE.Color(0xffffff);
  const box = document.createElement("div"); box.className = "p3d-live";
  const ov = document.createElement("canvas"); ov.className = "p3d-live-ov";
  box.appendChild(dom); box.appendChild(ov); wrap.appendChild(box);
  live.box = box; live.ov = ov; live.chosen = el.viewRef && p3dSaved().some(v => v.name === el.viewRef) ? el.viewRef : "";
  ["wheel", "pointerdown", "mousedown", "dblclick", "contextmenu", "touchstart"].forEach(t => box.addEventListener(t, e => e.stopPropagation()));
  live.outside = ev => { if (!box.contains(ev.target)) p3dLiveEnd(true); };
  $("prCanvas").addEventListener("pointerdown", live.outside, true);
  live.key = e => { if (e.key === "Escape") { e.stopPropagation(); p3dLiveEnd(true); } };
  document.addEventListener("keydown", live.key, true);
  l3.liveHost = box;
  live.tm = setInterval(p3dLiveTick, 200);
  p3d.live = live;
  pr.dirty = true;
  if (typeof setSel === "function" && !(typeof selEls === "function" && selEls().includes(el))) setSel([el.id]);
  renderPrintProps(); drawPrintPage();
  l3Status("Snurra och zooma direkt i bilden – Klar (eller klick utanför) sparar vyn.");
}
/* Ruta och storlek följer elementet (anropas från p3dDraw varje gång layouten ritas om). */
function p3dLiveLayout(el, X, Y, W, H) {
  const L = p3d.live; if (!L || L.el !== el || !pr.L) return;
  const c = pr.L.c, dpr = pr.L.dpr, b = L.box;
  const l = c.offsetLeft + (pr.L.ox + X) / dpr, t = c.offsetTop + (pr.L.oy + Y) / dpr, w = W / dpr, h = H / dpr;
  b.style.cssText = `position:absolute;left:${l.toFixed(1)}px;top:${t.toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px;z-index:5;overflow:hidden;background:#fff;`;
  if (Math.abs(w - L.w) > 0.5 || Math.abs(h - L.h) > 0.5) { L.w = w; L.h = h; l3Resize(); l3Render(); L.sig = ""; }
}
/* Bubblor, bildtext och ram ovanpå bilden – ritas om när kameran, datumet eller något i bubblorna ändras. */
function p3dLiveOverlay() {
  const L = p3d.live; if (!L || !L.w) return;
  const el = L.el, dpr = Math.min(2, window.devicePixelRatio || 1), Wp = Math.round(L.w * dpr), Hp = Math.round(L.h * dpr), ov = L.ov;
  if (ov.width !== Wp || ov.height !== Hp) { ov.width = Wp; ov.height = Hp; }
  ov.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;";
  const ctx = ov.getContext("2d"); ctx.clearRect(0, 0, Wp, Hp);
  p3dDrawBubbles(ctx, Wp, Hp, p3dOpts(el, p3dHmm(el)));
  const cap = p3dCaption(el); if (cap.length) p3dScaleLabel(ctx, cap, 0, Hp, Hp / Math.max(1e-6, Math.abs(el.h)));
  if (el.border !== false) { ctx.strokeStyle = "#000"; ctx.lineWidth = Math.max(1, 0.35 * Hp / Math.max(1e-6, Math.abs(el.h))); ctx.strokeRect(0, 0, Wp, Hp); }
}
function p3dLiveTick() {
  const L = p3d.live; if (!L) return;
  const cam = l3.camera, sig = [cam.position.toArray().map(v => v.toFixed(2)), cam.zoom, L.w, L.h, (l3.clips || []).map(c => c.off).join(), JSON.stringify([L.el.date, L.el.showDate, L.el.showScale, L.el.bub, L.el.bubF, L.el.bubMax, L.el.bubSize, L.el.bubNoLine, L.el.bubNeutral, L.el.border])].join("|");
  if (sig !== L.sig) { L.sig = sig; p3dLiveOverlay(); }
  const sp = document.getElementById("p3dScale"), inp = document.getElementById("prV3Scale");
  if (inp && cam.isOrthographicCamera && document.activeElement !== inp) { const n = p3dScaleOfZoom(cam.zoom, L.el); if (n && String(n) !== inp.value) inp.value = n; }
  if (sp) sp.textContent = cam.isOrthographicCamera ? `Skala 1:${p3dScaleOfZoom(cam.zoom, L.el)}` : "Perspektiv – ingen skala";
}
/* Datum/bakgrund/bubblor har ändrats i sidomenyn medan vyn är levande. */
function p3dLiveRefresh() {
  const L = p3d.live; if (!L) return;
  if (L.el.date) p3dSetDate(L.el.date); else if ($("dateInput").value !== L.prev.date) p3dSetDate(L.prev.date);
  l3.scene.background = L.el.bg3d === "white" ? new THREE.Color(0xffffff) : L.prev.bg;
  L.sig = ""; l3Render(); p3dLiveTick();
}
function p3dLiveEnd(ok) {
  const L = p3d.live; if (!L) return;
  const el = L.el, same = (a, b) => a && b && a.every((v, i) => Math.abs(v - b[i]) < 0.05);
  clearInterval(L.tm); p3dLiveFaceStop();
  $("prCanvas").removeEventListener("pointerdown", L.outside, true); document.removeEventListener("keydown", L.key, true);
  if (ok) {
    const v = l3MakeView(L.chosen || "Utskriftsvy"), ref = L.chosen ? p3dSaved().find(x => x.name === L.chosen) : null, fo = document.getElementById("prV3Follow");
    el.view = v;
    el.viewRef = ref && (!fo || fo.checked) && same(v.p, ref.p) && same(v.t, ref.t) ? L.chosen : undefined;   // "Följ vyn" gäller bara om kameran inte ändrats efter att vyn valdes
    if (!el.viewRef) delete el.viewRef;
    p3d.cache.delete(el.id); p3d.pend.delete(el.id); pr.dirty = true;
  }
  // Renderaren tillbaka till 3D-editorn och scenen som den var.
  l3.liveHost = null; L.prev.parent.insertBefore(l3.renderer.domElement, L.prev.next && L.prev.next.parentNode === L.prev.parent ? L.prev.next : L.prev.parent.firstChild);
  l3.scene.background = L.prev.bg;
  if ($("dateInput").value !== L.prev.date) p3dSetDate(L.prev.date);
  try { p3dApplyView(L.prev.view, 0); } catch (e) { /* kameran står kvar */ }
  L.box.remove(); p3d.live = null;
  if (typeof l3Resize === "function") l3Resize();
  if (typeof renderPrintProps === "function" && pr) renderPrintProps();
  if (pr) drawPrintPage();
}
let p3dFace = null;
function p3dLiveFaceStop() { if (!p3dFace) return; p3dFace.dom.removeEventListener("pointerdown", p3dFace.fn, true); p3dFace.dom.style.cursor = ""; const b = document.getElementById("prV3Face"); if (b) b.classList.remove("on"); p3dFace = null; }
/* Rikta vyn parallellt mot en yta (och lägg ett snitt i den): klicka på ytan i bilden. */
function p3dLiveFace() {
  const L = p3d.live; if (!L) return;
  const dom = l3.renderer.domElement;
  l3StopFly(); dom.style.cursor = "crosshair";
  const b = document.getElementById("prV3Face"); if (b) b.classList.add("on");
  const fn = ev => {
    ev.preventDefault(); ev.stopImmediatePropagation(); p3dLiveFaceStop();
    const h = l3Ray(ev, l3Surfaces())[0];
    if (!h || !h.face) { l3Status("Ingen yta där – klicka på en yta i modellen."); return; }
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize();
    if (n.dot(l3.camera.position.clone().sub(h.point)) < 0) n.negate();
    if (!l3.camera.isOrthographicCamera) l3SetProjection(true);
    const vert = Math.abs(n.z) > 0.9;
    l3.camera.up.set(0, vert ? 1 : 0, vert ? 0 : 1);   // lodrät yta: z uppåt; vågrät: norr uppåt
    l3FlyTo(h.point.clone(), 40, n, 0, true); l3.orbit.update();
    l3.clips = (l3.clips || []).filter(c => !c.p3d);
    const cut = document.getElementById("prV3CutOn");
    if (!cut || cut.checked) { l3AddClip(n.clone().negate(), h.point.clone()); const c = l3.clips[l3.clips.length - 1]; if (c) { c.p3d = true; c.label = "Sektionsvy"; } }
    l3ApplyClips(); l3Render(); L.sig = ""; renderPrintProps();
    l3Status("Vyn är riktad vinkelrätt mot ytan" + (!cut || cut.checked ? " med snitt i ytan – ställ djupet med reglaget Snittdjup." : "."));
  };
  dom.addEventListener("pointerdown", fn, true);
  p3dFace = { dom, fn };
  l3Status("Klicka på en yta i bilden – vyn riktas vinkelrätt mot den.");
}
/* Snittdjup (m) för vyn: i den levande vyn flyttas snittet direkt, annars ändras elementets vy. */
function p3dSetCutDepth(el, off) {
  if (p3d.live && p3d.live.el === el) {
    let i = (l3.clips || []).findIndex(c => c.label === "Sektionsvy"); if (i < 0 && (l3.clips || []).length) i = 0;
    if (i >= 0) { l3cSet(i, off); p3d.live.sig = ""; }
    return;
  }
  const v0 = p3dResolve(el); const ci = p3dCutOf(v0); if (ci < 0) return;
  const v = JSON.parse(JSON.stringify(v0)), c = v.clips[ci], d = off - (Number(c.off) || 0);
  c.p = c.p.map((x, k) => x + c.n[k] * d); c.off = off;
  el.view = v; delete el.viewRef;
  p3d.cache.delete(el.id); p3d.pend.delete(el.id); pr.dirty = true; drawPrintPage();
}
/* Spara vyn från layouten (som i 3D-editorns Vyer, delas i projektet): uppdatera en befintlig eller spara som ny. */
async function p3dSaveView(el, mode) {
  const live = p3d.live && p3d.live.el === el, cur = live ? l3MakeView("x") : p3dResolve(el);
  if (!cur) { uiAlert("Det finns ingen vy att spara ännu."); return; }
  const existing = live ? p3d.live.chosen : (el.viewRef || (cur.name && p3dSaved().some(x => x.name === cur.name) ? cur.name : ""));
  let name = existing;
  if (mode === "new" || !name) {
    name = await uiPrompt("Namn på den sparade vyn (visas i 3D-editorns Vyer):", existing ? existing + " 2" : "Utskriftsvy");
    name = String(name || "").trim(); if (!name) return;
  }
  const list = p3dSaved().slice(), v = { ...JSON.parse(JSON.stringify(cur)), name }, i = list.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
  if (i >= 0) list[i] = v; else list.push(v);
  l3StoreViews(list.slice(-60)); if (typeof l3RenderSavedViews === "function") l3RenderSavedViews();
  if (live) p3d.live.chosen = name; else { el.view = JSON.parse(JSON.stringify(v)); el.viewRef = name; p3d.cache.delete(el.id); p3d.pend.delete(el.id); }
  pr.dirty = true; renderPrintProps();
  l3Status(i >= 0 ? `Vyn "${name}" uppdaterad.` : `Vyn "${name}" sparad – finns i 3D-editorns Vyer.`);
}
/* Panelen i sidomenyn medan vyn är levande + reglaget Snittdjup (visas även utan levande vy när vyn har ett snitt). */
function p3dCutHtml(el, v) {
  const live = p3d.live && p3d.live.el === el;
  let off = 0, has = false;
  if (live) { const i = (l3.clips || []).findIndex(c => c.label === "Sektionsvy"); const c = l3.clips[i >= 0 ? i : 0]; if (c) { has = true; off = Number(c.off) || 0; } }
  else { const ci = p3dCutOf(v); if (ci >= 0) { has = true; off = Number(v.clips[ci].off) || 0; } }
  if (!has) return live ? `<div class="hint">Inget snitt i vyn ännu – använd ⟂ Rikta mot yta (med Snitt i ytan) eller lägg ett snitt i 3D-editorn.</div>` : "";
  const sp = Math.max(10, Math.ceil(Math.abs(off) * 2));
  return `<label style="margin-top:8px;">Snittdjup (m) – flytta snittet framåt/bakåt</label>
    <div class="row" style="flex-wrap:nowrap;gap:6px;"><input type="range" id="prV3CutR" min="${-sp}" max="${sp}" step="0.05" value="${off}" style="flex:1;min-width:0;" /><input type="number" id="prV3CutN" step="0.1" value="${Math.round(off * 100) / 100}" style="width:72px;" /></div>`;
}
function p3dLiveHtml(el) {
  const views = p3dSaved(), L = p3d.live, ortho = l3.camera.isOrthographicCamera;
  return `<div class="p3d-livepanel"><b>Redigerar vyn live</b><div class="hint">Snurra och zooma direkt i bilden (som i 3D-editorn). Bubblor, datum och skala syns som på bladet.</div>
    <div class="row" style="gap:6px;margin-top:6px;"><button type="button" id="prV3Done" class="primary" style="flex:1;">✓ Klar</button><button type="button" id="prV3Cancel">Avbryt</button></div>
    <div class="row" style="gap:6px;margin-top:8px;">${L.chosen ? `<button type="button" id="prV3SaveUp" style="flex:1;" title="Skriver över den sparade vyn med det du ser nu (3D-editorn och andra layouter som följer vyn får den också)">Uppdatera vyn "${escHtml(L.chosen)}"</button>` : ""}<button type="button" id="prV3SaveNew" style="flex:1;" title="Sparar det du ser nu som en ny vy i 3D-editorns Vyer">Spara som ny vy…</button></div>
    <label style="margin-top:8px;">Utgå från sparad vy</label>
    <select id="prV3LiveSel"><option value="">– nuvarande kamera –</option>${views.map(x => `<option value="${escHtml(x.name)}"${x.name === L.chosen ? " selected" : ""}>${escHtml(x.name)}</option>`).join("")}</select>
    ${L.chosen ? `<label class="check"><input type="checkbox" id="prV3Follow" checked /> Följ vyn (uppdateras när den sparas om i 3D)</label>` : ""}
    <div class="row" style="gap:6px;margin-top:8px;flex-wrap:nowrap;"><span id="p3dScale" class="hint" style="white-space:nowrap;"></span></div>
    ${ortho ? `<label style="margin-top:6px;">Skala 1 :</label><div class="row" style="flex-wrap:nowrap;gap:6px;"><input type="number" id="prV3Scale" min="1" step="1" value="${p3dScaleOfZoom(l3.camera.zoom, el) || ""}" style="width:90px;" /><select id="prV3ScaleSel"><option value="">Välj…</option>${(typeof PRINT_SCALES !== "undefined" ? PRINT_SCALES : [50, 100, 200, 500, 1000]).map(n => `<option value="${n}">1:${n}</option>`).join("")}</select></div>` : ""}
    <div class="row" style="gap:6px;margin-top:8px;"><button type="button" id="prV3Proj">${ortho ? "Perspektiv" : "Parallell (ortho)"}</button><button type="button" id="prV3Face" title="Klicka på en yta i bilden – vyn riktas vinkelrätt mot den (parallellprojektion), t.ex. för en sektionsvy">⟂ Rikta mot yta</button></div>
    <label class="check"><input type="checkbox" id="prV3CutOn" checked /> Snitt i ytan vid Rikta mot yta</label>
    ${p3dCutHtml(el, null)}</div>`;
}

/* ---- Egenskaper i layouten ---------------------------------------------------------------------------------------------------------- */
function p3dPropsHtml(el, chk) {
  if (!p3dViewsAsked && typeof l3vLoad === "function") { p3dViewsAsked = true; l3vLoad().then(() => { if (typeof pr !== "undefined" && pr && typeof renderPrintProps === "function") renderPrintProps(); }); }
  const views = p3dSaved(), v = p3dResolve(el), ref = el.viewRef && views.some(x => x.name === el.viewRef) ? el.viewRef : "";
  if (p3d.live && p3d.live.el === el) return p3dLiveHtml(el) + p3dPropsHtmlMore(el, chk, views, v, ref);
  return `<button id="prV3Pick" class="block primary" style="margin-top:8px;"${el.locked ? " disabled" : ""} title="Aktiverar vyn direkt i layouten – snurra och zooma i bilden">🎥 Ställ in vyn</button>
    ${v ? p3dCutHtml(el, v) : ""}
    ${v ? `<div class="row" style="gap:6px;margin-top:8px;"><button type="button" id="prV3SaveNew" style="flex:1;" title="Sparar vyn som den ser ut i layouten som en vy i 3D-editorns Vyer">Spara vyn i 3D-editorn…</button></div>` : ""}
    ${p3dPropsHtmlMore(el, chk, views, v, ref)}`;
}
function p3dPropsHtmlMore(el, chk, views, v, ref) {
  const live = p3d.live && p3d.live.el === el;
  return `${live ? "" : `<label style="margin-top:8px;">Sparad vy från 3D-editorn</label>
    <select id="prV3Saved"${views.length ? "" : " disabled"}><option value="">${views.length ? "– egen vy –" : "Inga sparade vyer i 3D-editorn"}</option>${views.map(x => `<option value="${escHtml(x.name)}"${x.name === ref ? " selected" : ""}>${escHtml(x.name)}</option>`).join("")}</select>
    ${ref ? `<label class="check"><input type="checkbox" id="prV3Follow" checked /> Följ vyn (uppdateras när den sparas om i 3D)</label>` : ""}
    ${v && v.ortho ? `<label style="margin-top:8px;">Skala</label><div class="row" style="flex-wrap:nowrap;gap:6px;"><span>1 :</span><input type="number" id="prV3Scale" min="1" step="1" value="${p3dScaleOf(el) || ""}" style="width:90px;"${el.locked ? " disabled" : ""} title="Skalan på det som syns i bilden (vid bladets format). Ändrar zoomen i vyn." /><select id="prV3ScaleSel" title="Vanliga skalor"><option value="">Välj…</option>${(typeof PRINT_SCALES !== "undefined" ? PRINT_SCALES : [50, 100, 200, 500, 1000]).map(n => `<option value="${n}">1:${n}</option>`).join("")}</select></div>
      ${chk("showScale", "Visa skalan på bilden")}`
      : `<div class="hint" style="margin-top:8px;">Skala: perspektivvyer har ingen skala. Välj parallellprojektion (ortho) i 3D-editorn för att kunna ställa in och läsa skalan.</div>`}`}
    ${live ? chk("showScale", "Visa skalan på bilden") : ""}
    <label style="margin-top:8px;">Datum</label>
    <div class="row" style="flex-wrap:nowrap;gap:6px;"><select id="prV3DateMode"><option value=""${el.date ? "" : " selected"}>Som i lägesplanen</option><option value="own"${el.date ? " selected" : ""}>Eget datum</option></select>${el.date ? `<input type="date" id="prV3Date" value="${escHtml(el.date)}" />` : ""}</div>
    <label class="check"><input type="checkbox" data-f="showDate"${el.showDate ? " checked" : ""} /> Visa datum på bilden</label>
    <label style="margin-top:8px;">Bubblor med framdrift</label>
    <select data-f="bub" title="Aktivitetsbubblor (namn, datum, framdrift) vid objekten, som i 3D-editorn. Urvalet följer datumet i lägesplanen."><option value=""${el.bub ? "" : " selected"}>Inga</option><option value="active"${el.bub === "active" ? " selected" : ""}>Aktiva vid datumet</option><option value="marked"${el.bub === "marked" ? " selected" : ""}>Bara låsta (☆) och markerade</option><option value="all"${el.bub === "all" ? " selected" : ""}>Alla aktiviteter</option></select>
    ${el.bub ? `<details style="margin-top:6px;"><summary>Vad ska visas i bubblan?</summary>${(typeof L3BUB_FIELDS !== "undefined" ? L3BUB_FIELDS : []).map(([k, t]) => { const cf = typeof l3bubCfg === "function" ? l3bubCfg().f : {}; const on = el.bubF && k in el.bubF ? el.bubF[k] : cf[k]; return `<label class="check"><input type="checkbox" data-bf="${k}"${on ? " checked" : ""} /> ${t}</label>`; }).join("")}<label class="check"><input type="checkbox" data-f="bubNoLine"${el.bubNoLine ? " checked" : ""} /> Utan ledlinje</label><label class="check"><input type="checkbox" data-f="bubNeutral"${el.bubNeutral ? " checked" : ""} /> Neutral färg</label><div class="hint">Egna anteckningar, ☆ (visa alltid) och ✕ (släck) sätts direkt på bubblorna i 3D-editorn.</div></details>
    <div class="pr-grid4"><div style="grid-column:span 2;"><label>Högst antal</label><input type="number" min="1" max="100" data-f="bubMax" data-num="1" value="${el.bubMax || 15}" /></div><div style="grid-column:span 2;"><label>Storlek %</label><input type="number" min="40" max="300" step="10" data-f="bubSize" data-num="1" value="${el.bubSize || 100}" /></div></div>` : ""}
    <label style="margin-top:6px;">Bakgrund</label>
    <select data-f="bg3d"><option value=""${el.bg3d ? "" : " selected"}>Som i 3D-editorn</option><option value="white"${el.bg3d === "white" ? " selected" : ""}>Vit</option></select>
    ${chk("border", "Ram runt bilden")}
    <div class="hint">${v ? `Vy: ${el.viewRef && ref ? `"${escHtml(ref)}" (följs)` : escHtml(v.name || "egen")} · ${v.ortho ? "parallellprojektion" : "perspektiv"}.` : "Ingen vy vald ännu."} Bilden ritas av 3D-editorns renderare${p3dReady() ? "" : ' – <a href="#" id="prV3Warm">läs in 3D-modellerna nu</a>'}. I PDF:en ligger den som skarp bild.</div>`;
}
function p3dPropsBind(el) {
  const g = id => document.getElementById(id);
  document.querySelectorAll("#prProps [data-bf]").forEach(c => { c.onchange = () => { pushUndo(); el.bubF = { ...(el.bubF || {}), [c.dataset.bf]: c.checked }; p3d.cache.delete(el.id); p3d.pend.delete(el.id); drawPrintPage(); }; });
  if (g("prV3Pick")) g("prV3Pick").onclick = () => p3dPick(el);
  if (g("prV3SaveUp")) g("prV3SaveUp").onclick = () => p3dSaveView(el, "up");
  if (g("prV3SaveNew")) g("prV3SaveNew").onclick = () => p3dSaveView(el, "new");
  if (g("prV3Done")) g("prV3Done").onclick = () => p3dLiveEnd(true);
  if (g("prV3Cancel")) g("prV3Cancel").onclick = () => p3dLiveEnd(false);
  if (g("prV3Face")) g("prV3Face").onclick = () => (p3dFace ? p3dLiveFaceStop() : p3dLiveFace());
  if (g("prV3Proj")) g("prV3Proj").onclick = () => { l3SetProjection(!l3.camera.isOrthographicCamera); l3Render(); p3d.live.sig = ""; renderPrintProps(); };
  if (g("prV3LiveSel")) g("prV3LiveSel").onchange = e => { const L = p3d.live; L.chosen = e.target.value; const v = p3dSaved().find(x => x.name === L.chosen); if (v) p3dApplyView(v, 450); setTimeout(() => { if (p3d.live) { p3d.live.sig = ""; renderPrintProps(); } }, 500); };
  const cutR = g("prV3CutR"), cutN = g("prV3CutN");
  if (cutR && cutN) {
    const set = v => { const n = Number(v); if (!Number.isFinite(n)) return; p3dSetCutDepth(el, n); };
    cutR.oninput = () => { cutN.value = Math.round(Number(cutR.value) * 100) / 100; set(cutR.value); };
    cutN.onchange = () => { const n = Number(cutN.value) || 0; if (Math.abs(n) > Number(cutR.max)) { cutR.max = Math.ceil(Math.abs(n) * 2); cutR.min = -cutR.max; } cutR.value = n; set(n); };
    cutR.onchange = () => { if (!(p3d.live && p3d.live.el === el)) { pushUndo(); } };
  }
  if (g("prV3Warm")) g("prV3Warm").onclick = async e => { e.preventDefault(); await p3dWarm(); drawPrintPage(); renderPrintProps(); };
  if (g("prV3Saved")) g("prV3Saved").onchange = e => {
    const name = e.target.value; pushUndo();
    if (name) { const v = p3dSaved().find(x => x.name === name); if (v) { el.view = JSON.parse(JSON.stringify(v)); el.viewRef = name; } } else delete el.viewRef;
    p3d.cache.delete(el.id); p3d.pend.delete(el.id); renderPrintProps(); drawPrintPage();
  };
  if (g("prV3DateMode")) g("prV3DateMode").onchange = e => { pushUndo(); if (e.target.value === "own") el.date = p3dDate(el) || ""; else delete el.date; p3d.cache.delete(el.id); p3d.pend.delete(el.id); if (p3d.live) p3dLiveRefresh(); renderPrintProps(); drawPrintPage(); };
  if (g("prV3Date")) g("prV3Date").onchange = e => { if (!e.target.value) return; pushUndo(); el.date = e.target.value; p3d.cache.delete(el.id); p3d.pend.delete(el.id); if (p3d.live) p3dLiveRefresh(); drawPrintPage(); };
  const setScale = n => {
    n = Math.round(Number(n)); if (!(n > 0)) return;
    if (p3d.live && p3d.live.el === el) { if (l3.camera.isOrthographicCamera) { l3.camera.zoom = p3dZoomOfScale(n, el); l3.camera.updateProjectionMatrix(); l3.orbit.update(); l3Render(); p3d.live.sig = ""; } return; }
    const v = p3dResolve(el); if (!v || !v.ortho) return;
    pushUndo(); const c = JSON.parse(JSON.stringify(v)); c.zoom = p3dZoomOfScale(n, el); el.view = c; delete el.viewRef;
    p3d.cache.delete(el.id); p3d.pend.delete(el.id); renderPrintProps(); drawPrintPage();
  };
  if (g("prV3Scale")) g("prV3Scale").onchange = e => setScale(e.target.value);
  if (g("prV3ScaleSel")) g("prV3ScaleSel").onchange = e => setScale(e.target.value);
  if (g("prV3Follow") && !p3d.live) g("prV3Follow").onchange = e => { if (!e.target.checked) { pushUndo(); const v = p3dResolve(el); if (v) el.view = JSON.parse(JSON.stringify(v)); delete el.viewRef; renderPrintProps(); drawPrintPage(); } };
  document.querySelectorAll('#prProps [data-f="showDate"], #prProps [data-f="showScale"], #prProps [data-f="bg3d"], #prProps [data-f="bub"], #prProps [data-f="bubMax"], #prProps [data-f="bubSize"], #prProps [data-f="bubNoLine"], #prProps [data-f="bubNeutral"]').forEach(s => s.addEventListener("change", () => { p3d.cache.delete(el.id); p3d.pend.delete(el.id); if (s.dataset.f === "bub") renderPrintProps(); if (p3d.live) p3dLiveRefresh(); drawPrintPage(); }));
}
/* Ritar elementet (anropas från drawElement). */
function p3dDraw(ctx, el, X, Y, W, H, k, u, opts) {
  if (p3d.live && p3d.live.el === el && opts.editor) {   // den levande vyn ligger ovanpå
    ctx.fillStyle = "#e8eef6"; ctx.fillRect(X, Y, W, H); p3dLiveLayout(el, X, Y, W, H); return;
  }
  const c = opts.v3Canvas || (opts.editor ? p3dPreview(el, W, H) : (p3d.cache.get(el.id) || {}).canvas);
  if (c) ctx.drawImage(c, X, Y, W, H);
  else {
    ctx.fillStyle = "#e8eef6"; ctx.fillRect(X, Y, W, H);
    ctx.fillStyle = "#64748b"; ctx.font = `${Math.max(8, Math.min(W, H) * 0.06)}px Helvetica, Arial`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const txt = !p3dResolve(el) ? "3D-vy – välj en vy i egenskaperna" : !p3dReady() ? "3D-vy – läs in 3D-modellerna i egenskaperna" : "3D-vyn ritas …";
    ctx.fillText(txt, X + W / 2, Y + H / 2);
  }
  { const cap = p3dCaption(el); if (cap.length) p3dScaleLabel(ctx, cap, X, Y + H, k * u); }
  if (el.border !== false) { ctx.strokeStyle = "#000"; ctx.lineWidth = Math.max(1, 0.35 * k * u); ctx.strokeRect(X, Y, W, H); }
}
/* Text i bildens nedre vänstra hörn: datum (om valt) och skala (om vald och parallellprojektion). */
function p3dDateText(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00"); if (isNaN(d)) return iso;
  const wk = typeof isoWeek === "function" ? `v.${isoWeek(d)} · ` : "";
  return wk + d.toLocaleDateString("sv-SE", { day: "numeric", month: "short", year: "numeric" });
}
function p3dCaption(el) {
  const out = [];
  if (el.showDate) { const t = p3dDateText(p3dDate(el)); if (t) out.push(t); }
  if (el.showScale) { const n = p3dScaleOf(el); if (n) out.push(`Skala 1:${n}`); }
  return out;
}
function p3dScaleLabel(ctx, lines, X, Ybottom, ku) {
  const fs = 3 * ku, pad = 1.2 * ku, gap = fs * 0.25; ctx.save(); ctx.font = `bold ${fs}px Helvetica, Arial`;
  const w = Math.max(...lines.map(t => ctx.measureText(t).width)) + pad * 2, h = lines.length * fs + (lines.length - 1) * gap + pad * 2;
  ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.fillRect(X, Ybottom - h, w, h);
  ctx.fillStyle = "#000"; ctx.textAlign = "left"; ctx.textBaseline = "top"; lines.forEach((t, i) => ctx.fillText(t, X + pad, Ybottom - h + pad + i * (fs + gap))); ctx.restore();
}
/* Var norr pekar i bilden (radianer medsols från "uppåt") – för norrpilen. */
function p3dNorthAngle(el) {
  const v = p3dResolve(el); if (!v || typeof THREE === "undefined") return 0;
  const dir = new THREE.Vector3(v.t[0] - v.p[0], v.t[1] - v.p[1], v.t[2] - v.p[2]).normalize();
  const up = Math.abs(dir.z) > 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const right = new THREE.Vector3().crossVectors(dir, up).normalize(), upc = new THREE.Vector3().crossVectors(right, dir).normalize(), n = new THREE.Vector3(0, 1, 0);
  const sx = n.dot(right), sy = n.dot(upc);
  return Math.hypot(sx, sy) < 1e-3 ? 0 : Math.atan2(sx, sy);
}
