/* Beskär bild med musen (utskriftslayout, Victors önskemål 2026-10-08).
   Visar hela bilden med en ram som har handtag i hörn och på sidor; dra i
   handtagen för att beskära, dra inuti ramen för att flytta utsnittet.
   Resultatet är samma fält som sifferrutorna (cropL/R/T/B i % av bilden),
   så inget nytt sparas och sifferrutorna fortsätter att fungera. */
const IMGCROP_MIN = 3; // minsta kvarvarande bredd/höjd i %
function imgCropClamp(c) {
  const k = v => Math.max(0, Math.min(95, Math.round((Number(v) || 0) * 10) / 10));
  let l = k(c.l), r = k(c.r), t = k(c.t), b = k(c.b);
  if (100 - l - r < IMGCROP_MIN) r = Math.max(0, 100 - l - IMGCROP_MIN);
  if (100 - t - b < IMGCROP_MIN) b = Math.max(0, 100 - t - IMGCROP_MIN);
  return { l, r, t, b };
}
/* Ett handtags dragning: start = beskärning vid nedtryck, dx/dy i % av bilden. */
function imgCropDrag(start, h, dx, dy) {
  const c = { ...start }, M = IMGCROP_MIN;
  if (h === "move") {
    const w = 100 - start.l - start.r, ht = 100 - start.t - start.b;
    c.l = Math.max(0, Math.min(100 - w, start.l + dx)); c.r = 100 - w - c.l;
    c.t = Math.max(0, Math.min(100 - ht, start.t + dy)); c.b = 100 - ht - c.t;
    return imgCropClamp(c);
  }
  if (h.includes("w")) c.l = Math.max(0, Math.min(100 - start.r - M, start.l + dx));
  if (h.includes("e")) c.r = Math.max(0, Math.min(100 - start.l - M, start.r - dx));
  if (h.includes("n")) c.t = Math.max(0, Math.min(100 - start.b - M, start.t + dy));
  if (h.includes("s")) c.b = Math.max(0, Math.min(100 - start.t - M, start.b - dy));
  return imgCropClamp(c);
}
/* Öppnar dialogen. onDone({l,r,t,b}) anropas bara vid "Använd". */
function openImageCrop(im, crop, onDone) {
  document.getElementById("imgCropModal")?.remove();
  let cur = imgCropClamp(crop || {});
  const wrap = document.createElement("div");
  wrap.id = "imgCropModal";
  wrap.innerHTML = `<div class="ic-card" role="dialog" aria-label="Beskär bild">
    <div class="row"><b>✂ Beskär bild</b><span class="grow"></span><span class="muted" id="icInfo"></span></div>
    <div class="ic-stage"><div class="ic-img"><img alt="" draggable="false" /><div class="ic-box">${["nw", "n", "ne", "e", "se", "s", "sw", "w"].map(h => `<span class="ic-h ic-${h}" data-h="${h}"></span>`).join("")}</div></div></div>
    <div class="hint">Dra i handtagen för att beskära, dra inuti rutan för att flytta utsnittet. Esc = avbryt, Enter = använd.</div>
    <div class="row" style="justify-content:flex-end;gap:6px;margin-top:8px;"><button type="button" data-a="reset">↺ Ingen beskärning</button><span class="grow"></span><button type="button" data-a="cancel">Avbryt</button><button type="button" data-a="ok" class="primary">Använd</button></div></div>`;
  document.body.appendChild(wrap);
  const img = wrap.querySelector("img"), area = wrap.querySelector(".ic-img"), box = wrap.querySelector(".ic-box"), info = wrap.querySelector("#icInfo");
  img.src = im.src;
  const nw = im.naturalWidth || im.width || 1, nh = im.naturalHeight || im.height || 1;
  // Bilden skalas in i fönstret med bibehållna proportioner.
  const fit = () => {
    const mw = Math.min(innerWidth * 0.86, 1100), mh = innerHeight * 0.66, s = Math.min(mw / nw, mh / nh);
    area.style.width = Math.max(40, Math.round(nw * s)) + "px"; area.style.height = Math.max(40, Math.round(nh * s)) + "px";
  };
  const show = () => {
    Object.assign(box.style, { left: cur.l + "%", top: cur.t + "%", right: cur.r + "%", bottom: cur.b + "%" });
    const f = v => Math.round(v);
    info.textContent = `V ${f(cur.l)} %  H ${f(cur.r)} %  Ö ${f(cur.t)} %  U ${f(cur.b)} %`;
  };
  fit(); show();
  const close = ok => {
    window.removeEventListener("keydown", key, true); window.removeEventListener("resize", fit);
    wrap.remove();
    if (ok) onDone(cur);
  };
  const key = e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(false); }
    else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); close(true); }
    else e.stopPropagation(); // utskriftslayoutens kortkommandon ska inte reagera
  };
  window.addEventListener("keydown", key, true); window.addEventListener("resize", fit);
  wrap.addEventListener("click", e => {
    const a = e.target.closest("[data-a]");
    if (a) { if (a.dataset.a === "reset") { cur = imgCropClamp({}); show(); } else close(a.dataset.a === "ok"); }
    else if (e.target === wrap) close(false);
  });
  area.addEventListener("pointerdown", e => {
    const hEl = e.target.closest("[data-h]"), h = hEl ? hEl.dataset.h : e.target.closest(".ic-box") ? "move" : null;
    if (!h) return;
    e.preventDefault();
    const r = area.getBoundingClientRect(), start = { ...cur }, x0 = e.clientX, y0 = e.clientY;
    try { area.setPointerCapture(e.pointerId); } catch (err) {}
    area.classList.add("drag");
    const move = ev => { cur = imgCropDrag(start, h, (ev.clientX - x0) / r.width * 100, (ev.clientY - y0) / r.height * 100); show(); };
    const up = () => { area.removeEventListener("pointermove", move); area.removeEventListener("pointerup", up); area.removeEventListener("pointercancel", up); area.classList.remove("drag"); };
    area.addEventListener("pointermove", move); area.addEventListener("pointerup", up); area.addEventListener("pointercancel", up);
  });
  return wrap;
}
