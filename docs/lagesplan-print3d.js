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
const p3dOpts = (el, hMm) => ({ date: el.date || "", white: el.bg3d === "white", bub: el.bub || "", bubMax: el.bubMax, bubSize: el.bubSize, hMm: hMm || p3dHmm(el) });
function p3dKey(el, v, W, H) {
  if (!v) return "";
  return JSON.stringify([v.p, v.t, v.ortho, v.zoom, v.clips, v.meas, v.hid && [(v.hid.guids || []).length, (v.hid.place || []).length, (v.hid.objs || []).length], v.clouds, el.bg3d || "", el.bub || "", el.bubMax || 0, el.bubSize || 100, p3dDate(el), W, H]);
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
  if (!p3dReady() || !view) return null;
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
    if (o.bub && typeof l3fxBubbles === "function") {
      const P = l3Prefs(), old = [P.bubScope, P.bubMax]; P.bubScope = o.bub; P.bubMax = o.bubMax || 15;
      try { const mmH = o.hMm || 100; l3fxBubbles(out.getContext("2d"), W, H, (H / mmH) * 2.6 / 16.25 * ((o.bubSize || 100) / 100)); }
      catch (e) { console.warn("Bubblor i 3D-vyn", e); }
      finally { P.bubScope = old[0]; P.bubMax = old[1]; }
    }
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
async function p3dPick(el) {
  if (p3d.picking) return;
  if (!plan || !plan.calib) { uiAlert("Arbetsytan måste vara kalibrerad mot 3D-modellen för att 3D-vyn ska fungera."); return; }
  const modal = $("printModal"); modal.classList.add("p3d-away");
  p3d.picking = { el };
  try {
    if (!p3dReady()) await open3d();
    else { const box = $("view3d"); box.classList.remove("hidden"); document.body.classList.add("v3-open"); if (typeof l3sEnter === "function") l3sEnter(); }
    if (!p3dReady()) throw new Error("3D-vyn kunde inte öppnas");
    const saved = p3dResolve(el);
    if (saved) p3dApplyView(saved, 0);
    const host = document.getElementById("v3Canvas"), keep = host.style.cssText, parent = host.parentElement;
    const asp = Math.abs(el.w) / Math.max(1, Math.abs(el.h));
    const fit = () => {
      const r = parent.getBoundingClientRect(), mw = r.width * 0.86, mh = r.height * 0.8;
      let w = mw, h = w / asp; if (h > mh) { h = mh; w = h * asp; }
      host.style.cssText = `${keep};position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);width:${Math.round(w)}px;height:${Math.round(h)}px;right:auto;bottom:auto;outline:2px dashed #38bdf8;outline-offset:3px;box-shadow:0 0 0 9999px rgba(15,23,42,.5);z-index:2;`;
      l3Resize(); l3Render();
    };
    fit(); window.addEventListener("resize", fit);
    const bar = document.createElement("div"); bar.id = "p3dBar"; bar.className = "p3d-bar";
    const views = p3dSaved(), curRef = el.viewRef && views.some(v => v.name === el.viewRef) ? el.viewRef : "";
    bar.innerHTML = `<b>3D-vy till utskriften</b><span class="p3d-hint">Snurra och zooma – det som syns i ramen hamnar på bladet</span><span class="p3d-scale" id="p3dScale" title="Skalan på bladet (parallellprojektion)"></span><label class="p3d-setscale" title="Ställ in skalan (parallellprojektion)">Skala 1: <input type="number" id="p3dScaleIn" min="1" step="1" style="width:76px"></label>
      <label>Utgå från vy <select id="p3dSel"><option value="">– nuvarande kamera –</option>${views.map(v => `<option value="${escHtml(v.name)}"${v.name === curRef ? " selected" : ""}>${escHtml(v.name)}</option>`).join("")}</select></label>
      <button type="button" id="p3dFace" title="Klicka på en yta i modellen – vyn riktas vinkelrätt mot den (parallellprojektion), t.ex. för en sektionsvy">⟂ Rikta mot yta</button><label class="p3d-follow" title="Lägger ett snitt i ytan så att det som är framför den tas bort (sektionsvy)"><input type="checkbox" id="p3dCut" checked> Snitt i ytan</label><label class="p3d-setscale" title="Flytta snittet framåt (−) eller bakåt (+) från ytan">Snittdjup <input id="p3dCutOff" type="number" step="0.1" value="0" style="width:62px"> m</label><label class="p3d-follow" title="Bladet uppdateras när vyn sparas om i 3D-editorn"><input type="checkbox" id="p3dFollow"${el.viewRef ? " checked" : ""}> Följ vyn</label>
      <span class="p3d-sp"></span><button type="button" id="p3dCancel">Avbryt</button><button type="button" id="p3dOk" class="primary">✓ Använd vyn</button>`;
    document.body.appendChild(bar);
    let chosen = curRef;
    const same = (a, b) => a && b && a.every((v, i) => Math.abs(v - b[i]) < 0.05);
    const finish = ok => {
      clearInterval(tm); stopFace(); document.removeEventListener("keydown", key, true); window.removeEventListener("resize", fit);
      if (ok) {
        const v = l3MakeView(chosen || "Utskriftsvy"), ref = chosen ? p3dSaved().find(x => x.name === chosen) : null;
        el.view = v;
        // "Följ vyn" gäller bara om kameran inte ändrats efter att vyn valdes.
        el.viewRef = ref && $("p3dFollow").checked && same(v.p, ref.p) && same(v.t, ref.t) ? chosen : undefined;
        if (!el.viewRef) delete el.viewRef;
        p3d.cache.delete(el.id); p3d.pend.delete(el.id); pr.dirty = true;
      }
      bar.remove(); host.style.cssText = keep; p3d.picking = null;
      if (typeof close3d === "function") close3d();
      modal.classList.remove("p3d-away");
      if (typeof renderPrintProps === "function") renderPrintProps(); drawPrintPage();
    };
    // Skalan läses av medan man zoomar och kan skrivas in (parallellprojektion).
    const upd = () => { const sp = bar.querySelector("#p3dScale"), inp = bar.querySelector("#p3dScaleIn"); if (!sp) return; if (l3.camera.isOrthographicCamera) { const n = p3dScaleOfZoom(l3.camera.zoom, el); sp.textContent = `Skala 1:${n}`; if (document.activeElement !== inp) inp.value = n; inp.disabled = false; } else { sp.textContent = "Perspektiv – ingen skala"; inp.value = ""; inp.disabled = true; } };
    const tm = setInterval(upd, 250); upd();
    bar.querySelector("#p3dScaleIn").onchange = e => { const n = Number(e.target.value); if (n > 0 && l3.camera.isOrthographicCamera) { l3.camera.zoom = p3dZoomOfScale(n, el); l3.camera.updateProjectionMatrix(); l3.orbit.update(); l3Render(); upd(); } };
    // Rikta vyn parallellt mot en yta (och lägg ett snitt i den): klicka på ytan i 3D.
    const dom = l3.renderer.domElement;
    const stopFace = () => { dom.removeEventListener("pointerdown", onFace, true); dom.style.cursor = ""; const b = bar.querySelector("#p3dFace"); if (b) b.classList.remove("on"); };
    const onFace = ev => {
      ev.preventDefault(); ev.stopImmediatePropagation(); stopFace();
      const h = l3Ray(ev, l3Surfaces())[0];
      if (!h || !h.face) { l3Status("Ingen yta där – klicka på en yta i modellen."); return; }
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld).normalize();
      if (n.dot(l3.camera.position.clone().sub(h.point)) < 0) n.negate();
      if (!l3.camera.isOrthographicCamera) l3SetProjection(true);
      l3.camera.up.set(Math.abs(n.z) > 0.9 ? 0 : 0, Math.abs(n.z) > 0.9 ? 1 : 0, Math.abs(n.z) > 0.9 ? 0 : 1);   // lodrät yta: z uppåt; vågrät: norr uppåt
      l3FlyTo(h.point.clone(), 40, n, 0, true); l3.orbit.update();
      l3.clips = (l3.clips || []).filter(c => !c.p3d);
      if (bar.querySelector("#p3dCut").checked) { l3AddClip(n.clone().negate(), h.point.clone()); const c = l3.clips[l3.clips.length - 1]; if (c) { c.p3d = true; c.label = "Sektionsvy"; const off = Number(bar.querySelector("#p3dCutOff").value) || 0; if (off) l3cSet(l3.clips.length - 1, off); } }
      l3ApplyClips(); l3Render(); upd();
      l3Status("Vyn är riktad vinkelrätt mot ytan" + (bar.querySelector("#p3dCut").checked ? " med snitt i ytan." : "."));
    };
    bar.querySelector("#p3dFace").onclick = e => { e.stopPropagation(); l3StopFly(); dom.style.cursor = "crosshair"; e.currentTarget.classList.add("on"); dom.addEventListener("pointerdown", onFace, true); l3Status("Klicka på en yta i modellen – vyn riktas vinkelrätt mot den."); };
    bar.querySelector("#p3dCutOff").onchange = e => { const i = (l3.clips || []).findIndex(c => c.p3d); if (i >= 0) { l3cSet(i, Number(e.target.value) || 0); l3Render(); } };
    const key = e => { if (e.key === "Escape") { e.stopPropagation(); finish(false); } };
    document.addEventListener("keydown", key, true);
    bar.querySelector("#p3dCancel").onclick = () => finish(false);
    bar.querySelector("#p3dOk").onclick = () => finish(true);
    bar.querySelector("#p3dSel").onchange = e => { chosen = e.target.value; const v = views.find(x => x.name === chosen); if (v) p3dApplyView(v, 450); };
  } catch (e) {
    console.error(e); p3d.picking = null; modal.classList.remove("p3d-away");
    const b = document.getElementById("p3dBar"); if (b) b.remove();
    uiAlert("Kunde inte öppna 3D-vyn: " + (e && e.message ? e.message : e));
  }
}

/* ---- Egenskaper i layouten ---------------------------------------------------------------------------------------------------------- */
function p3dPropsHtml(el, chk) {
  if (!p3dViewsAsked && typeof l3vLoad === "function") { p3dViewsAsked = true; l3vLoad().then(() => { if (typeof pr !== "undefined" && pr && typeof renderPrintProps === "function") renderPrintProps(true); }); }
  const views = p3dSaved(), v = p3dResolve(el), ref = el.viewRef && views.some(x => x.name === el.viewRef) ? el.viewRef : "";
  return `<button id="prV3Pick" class="block primary" style="margin-top:8px;"${el.locked ? " disabled" : ""} title="Öppnar 3D-editorn med en ram i bildens format – snurra, zooma och tryck Använd vyn">🎥 Ställ in vyn…</button>
    <label style="margin-top:8px;">Sparad vy från 3D-editorn</label>
    <select id="prV3Saved"${views.length ? "" : " disabled"}><option value="">${views.length ? "– egen vy –" : "Inga sparade vyer i 3D-editorn"}</option>${views.map(x => `<option value="${escHtml(x.name)}"${x.name === ref ? " selected" : ""}>${escHtml(x.name)}</option>`).join("")}</select>
    ${ref ? `<label class="check"><input type="checkbox" id="prV3Follow" checked /> Följ vyn (uppdateras när den sparas om i 3D)</label>` : ""}
    ${v && v.ortho ? `<label style="margin-top:8px;">Skala</label><div class="row" style="flex-wrap:nowrap;gap:6px;"><span>1 :</span><input type="number" id="prV3Scale" min="1" step="1" value="${p3dScaleOf(el) || ""}" style="width:90px;"${el.locked ? " disabled" : ""} title="Skalan på det som syns i bilden (vid bladets format). Ändrar zoomen i vyn." /><select id="prV3ScaleSel" title="Vanliga skalor"><option value="">Välj…</option>${(typeof PRINT_SCALES !== "undefined" ? PRINT_SCALES : [50, 100, 200, 500, 1000]).map(n => `<option value="${n}">1:${n}</option>`).join("")}</select></div>
      ${chk("showScale", "Visa skalan på bilden")}`
      : `<div class="hint" style="margin-top:8px;">Skala: perspektivvyer har ingen skala. Välj parallellprojektion (ortho) i 3D-editorn för att kunna ställa in och läsa skalan.</div>`}
    <label style="margin-top:8px;">Datum</label>
    <div class="row" style="flex-wrap:nowrap;gap:6px;"><select id="prV3DateMode"><option value=""${el.date ? "" : " selected"}>Som i lägesplanen</option><option value="own"${el.date ? " selected" : ""}>Eget datum</option></select>${el.date ? `<input type="date" id="prV3Date" value="${escHtml(el.date)}" />` : ""}</div>
    <label class="check"><input type="checkbox" data-f="showDate"${el.showDate ? " checked" : ""} /> Visa datum på bilden</label>
    <label style="margin-top:8px;">Bubblor med framdrift</label>
    <select data-f="bub" title="Aktivitetsbubblor (namn, datum, framdrift) vid objekten, som i 3D-editorn. Urvalet följer datumet i lägesplanen."><option value=""${el.bub ? "" : " selected"}>Inga</option><option value="active"${el.bub === "active" ? " selected" : ""}>Aktiva vid datumet</option><option value="all"${el.bub === "all" ? " selected" : ""}>Alla aktiviteter</option></select>
    ${el.bub ? `<div class="pr-grid4"><div style="grid-column:span 2;"><label>Högst antal</label><input type="number" min="1" max="100" data-f="bubMax" data-num="1" value="${el.bubMax || 15}" /></div><div style="grid-column:span 2;"><label>Storlek %</label><input type="number" min="40" max="300" step="10" data-f="bubSize" data-num="1" value="${el.bubSize || 100}" /></div></div>` : ""}
    <label style="margin-top:6px;">Bakgrund</label>
    <select data-f="bg3d"><option value=""${el.bg3d ? "" : " selected"}>Som i 3D-editorn</option><option value="white"${el.bg3d === "white" ? " selected" : ""}>Vit</option></select>
    ${chk("border", "Ram runt bilden")}
    <div class="hint">${v ? `Vy: ${el.viewRef && ref ? `"${escHtml(ref)}" (följs)` : escHtml(v.name || "egen")} · ${v.ortho ? "parallellprojektion" : "perspektiv"}.` : "Ingen vy vald ännu."} Bilden ritas av 3D-editorns renderare${p3dReady() ? "" : ' – <a href="#" id="prV3Warm">läs in 3D-modellerna nu</a>'}. I PDF:en ligger den som skarp bild.</div>`;
}
function p3dPropsBind(el) {
  const g = id => document.getElementById(id);
  if (g("prV3Pick")) g("prV3Pick").onclick = () => p3dPick(el);
  if (g("prV3Warm")) g("prV3Warm").onclick = async e => { e.preventDefault(); await p3dWarm(); drawPrintPage(); renderPrintProps(); };
  if (g("prV3Saved")) g("prV3Saved").onchange = e => {
    const name = e.target.value; pushUndo();
    if (name) { const v = p3dSaved().find(x => x.name === name); if (v) { el.view = JSON.parse(JSON.stringify(v)); el.viewRef = name; } } else delete el.viewRef;
    p3d.cache.delete(el.id); p3d.pend.delete(el.id); renderPrintProps(); drawPrintPage();
  };
  if (g("prV3DateMode")) g("prV3DateMode").onchange = e => { pushUndo(); if (e.target.value === "own") el.date = p3dDate(el) || ""; else delete el.date; p3d.cache.delete(el.id); p3d.pend.delete(el.id); renderPrintProps(true); drawPrintPage(); };
  if (g("prV3Date")) g("prV3Date").onchange = e => { if (!e.target.value) return; pushUndo(); el.date = e.target.value; p3d.cache.delete(el.id); p3d.pend.delete(el.id); drawPrintPage(); };
  const setScale = n => {
    n = Math.round(Number(n)); if (!(n > 0)) return;
    const v = p3dResolve(el); if (!v || !v.ortho) return;
    pushUndo(); const c = JSON.parse(JSON.stringify(v)); c.zoom = p3dZoomOfScale(n, el); el.view = c; delete el.viewRef;
    p3d.cache.delete(el.id); p3d.pend.delete(el.id); renderPrintProps(true); drawPrintPage();
  };
  if (g("prV3Scale")) g("prV3Scale").onchange = e => setScale(e.target.value);
  if (g("prV3ScaleSel")) g("prV3ScaleSel").onchange = e => setScale(e.target.value);
  if (g("prV3Follow")) g("prV3Follow").onchange = e => { if (!e.target.checked) { pushUndo(); const v = p3dResolve(el); if (v) el.view = JSON.parse(JSON.stringify(v)); delete el.viewRef; renderPrintProps(); drawPrintPage(); } };
  document.querySelectorAll('#prProps [data-f="showDate"], #prProps [data-f="showScale"], #prProps [data-f="bg3d"], #prProps [data-f="bub"], #prProps [data-f="bubMax"], #prProps [data-f="bubSize"]').forEach(s => s.addEventListener("change", () => { p3d.cache.delete(el.id); p3d.pend.delete(el.id); if (s.dataset.f === "bub") renderPrintProps(true); drawPrintPage(); }));
}
/* Ritar elementet (anropas från drawElement). */
function p3dDraw(ctx, el, X, Y, W, H, k, u, opts) {
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
